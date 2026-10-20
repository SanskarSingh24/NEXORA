"""
NEXORA Staff Management Service
File: backend/staff/staff_service.py
Description: Isolated administrative service for on-ground personnel tracking,
             zone assignments, role categorization, and availability management.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Integer, String, create_engine, desc, or_
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from config.settings import settings
from backend.auth.auth_service import RoleChecker, UserRole, UserResponse
from backend.staff.exotel_service import generate_exoml, trigger_emergency_call

logger = logging.getLogger("NEXORA_STAFF")

# =====================================================================
# 1. DATABASE CONFIGURATION
# =====================================================================

DATABASE_URL: str = settings.database_url

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine_kwargs = {"connect_args": connect_args}
if not DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_recycle": 1800,
        "pool_pre_ping": True,
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# =====================================================================
# 2. SQLALCHEMY MODELS
# =====================================================================

class StaffMemberRecord(Base):
    """Database model for NEXORA on-ground operational staff."""
    __tablename__ = "staff_members"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(128), nullable=False, index=True)
    role = Column(String(64), nullable=False, index=True)
    contact_number = Column(String(32), nullable=False)
    assigned_zone = Column(String(64), nullable=False, index=True)
    availability_status = Column(String(32), nullable=False, default="Available", index=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )


def get_db():
    """Dependency yielding transactional database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =====================================================================
# 3. ENUMS & PYDANTIC SCHEMAS
# =====================================================================

class AvailabilityStatus(str, Enum):
    AVAILABLE = "Available"
    BUSY = "Busy"
    OFF_DUTY = "Off-duty"


class StaffRolePreset(str, Enum):
    SECURITY = "Security"
    MEDICAL = "Medical"
    SUPERVISOR = "Supervisor"
    TECHNICAL = "Technical"
    LOGISTICS = "Logistics"
    OTHER = "Other"


class StaffMemberCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128, description="Staff member full name")
    role: str = Field(..., min_length=2, max_length=64, description="Operational role (e.g. Security, Medical, Supervisor)")
    contact_number: str = Field(..., min_length=3, max_length=32, description="Contact phone or radio identifier")
    assigned_zone: str = Field(..., min_length=1, max_length=64, description="Assigned venue area or zone")
    availability_status: AvailabilityStatus = Field(default=AvailabilityStatus.AVAILABLE, description="Real-time availability")


class StaffMemberUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=128)
    role: Optional[str] = Field(None, min_length=2, max_length=64)
    contact_number: Optional[str] = Field(None, min_length=3, max_length=32)
    assigned_zone: Optional[str] = Field(None, min_length=1, max_length=64)
    availability_status: Optional[AvailabilityStatus] = None


class StaffStatusUpdate(BaseModel):
    availability_status: AvailabilityStatus = Field(..., description="Target availability state")


class StaffMemberResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    role: str
    contact_number: str
    assigned_zone: str
    availability_status: str
    created_at: datetime
    updated_at: datetime


class StaffSummaryResponse(BaseModel):
    total: int
    available: int
    busy: int
    off_duty: int


class RankedStaffMemberResponse(BaseModel):
    model_config = {"from_attributes": True}

    rank: int
    id: str
    name: str
    role: str
    zone: str
    contact_number: str
    availability_status: str
    is_exact_zone: bool


class EmergencyCallRequest(BaseModel):
    staff_id: Optional[str] = None
    contact_number: str = Field(..., min_length=3, max_length=32, description="Target staff phone number")
    staff_name: str = Field(..., min_length=1, max_length=128, description="Target staff full name")
    zone: str = Field(..., min_length=1, max_length=64, description="Alert sector/zone")
    alert_id: Optional[str] = Field(None, description="Triggering alert identifier")
    alert_level: Optional[str] = Field("CRITICAL", description="Alert severity (HIGH/CRITICAL)")
    force: Optional[bool] = Field(False, description="Bypass cooldown deduplication")


class EmergencyCallResponse(BaseModel):
    success: bool
    status: str
    message: str
    details: Optional[str] = None
    to: str
    staff_name: str
    zone: str
    alert_id: Optional[str] = None
    call_sid: Optional[str] = None
    dispatched_at: str


# =====================================================================
# 4. INITIAL SEEDING LOGIC
# =====================================================================

DEFAULT_STAFF_SEEDS = [
    {
        "name": "Capt. James Vance",
        "role": "Security",
        "contact_number": "+1 (555) 234-5678",
        "assigned_zone": "Zone A - Concourse",
        "availability_status": "Available",
    },
    {
        "name": "Dr. Elena Rostova",
        "role": "Medical",
        "contact_number": "+1 (555) 345-6789",
        "assigned_zone": "Zone B - Medical Station",
        "availability_status": "Busy",
    },
    {
        "name": "Commander Sarah Chen",
        "role": "Supervisor",
        "contact_number": "+1 (555) 456-7890",
        "assigned_zone": "Central Command",
        "availability_status": "Available",
    },
    {
        "name": "Alex Mercer",
        "role": "Technical",
        "contact_number": "+1 (555) 567-8901",
        "assigned_zone": "Zone A - Camera Grid",
        "availability_status": "Available",
    },
    {
        "name": "Officer Liam O'Connor",
        "role": "Security",
        "contact_number": "+1 (555) 678-9012",
        "assigned_zone": "West Gate Entrance",
        "availability_status": "Off-duty",
    },
    {
        "name": "Paramedic Maya Lin",
        "role": "Medical",
        "contact_number": "+1 (555) 789-0123",
        "assigned_zone": "Zone C - Field Post",
        "availability_status": "Available",
    },
]


def init_db(session_factory=SessionLocal) -> None:
    """Creates staff tables and seeds default operational team if empty."""
    try:
        Base.metadata.create_all(bind=engine)
        db = session_factory()
        try:
            count = db.query(StaffMemberRecord).count()
            if count == 0:
                logger.info("NEXORA Staff: Seeding initial staff registry...")
                for item in DEFAULT_STAFF_SEEDS:
                    record = StaffMemberRecord(
                        id=str(uuid4()),
                        name=item["name"],
                        role=item["role"],
                        contact_number=item["contact_number"],
                        assigned_zone=item["assigned_zone"],
                        availability_status=item["availability_status"],
                        created_at=datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc),
                    )
                    db.add(record)
                db.commit()
                logger.info("NEXORA Staff: Seeded %d initial personnel records.", len(DEFAULT_STAFF_SEEDS))
        finally:
            db.close()
    except Exception as exc:
        logger.warning("NEXORA Staff: Database auto-init skipped or fallback triggered: %s", exc)


# =====================================================================
# 5. REST API ROUTER (ADMIN ONLY ENFORCEMENT)
# =====================================================================

admin_guard = RoleChecker([UserRole.ADMIN])

router = APIRouter(prefix="/staff", tags=["Staff Management"])


@router.get("", response_model=List[StaffMemberResponse])
def list_staff(
    role: Optional[str] = Query(None, description="Filter by operational role"),
    zone: Optional[str] = Query(None, description="Filter by assigned zone"),
    status: Optional[str] = Query(None, description="Filter by availability status"),
    search: Optional[str] = Query(None, description="Search by name, contact, or zone"),
    db: Session = Depends(get_db),
):
    """
    Lists personnel registry with optional role, zone, status, and text search filters.
    """
    query = db.query(StaffMemberRecord)

    if role and role.strip() and role.lower() != "all":
        query = query.filter(StaffMemberRecord.role.ilike(f"%{role.strip()}%"))

    if zone and zone.strip() and zone.lower() != "all":
        query = query.filter(StaffMemberRecord.assigned_zone.ilike(f"%{zone.strip()}%"))

    if status and status.strip() and status.lower() != "all":
        query = query.filter(StaffMemberRecord.availability_status == status.strip())

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                StaffMemberRecord.name.ilike(term),
                StaffMemberRecord.contact_number.ilike(term),
                StaffMemberRecord.assigned_zone.ilike(term),
                StaffMemberRecord.role.ilike(term),
            )
        )

    records = query.order_by(desc(StaffMemberRecord.created_at)).all()
    return records


@router.get("/summary", response_model=StaffSummaryResponse)
def get_staff_summary(db: Session = Depends(get_db)):
    """
    Retrieves real-time counts across availability statuses for KPI displays.
    """
    records = db.query(StaffMemberRecord.availability_status).all()
    total = len(records)
    available = sum(1 for (st,) in records if st == AvailabilityStatus.AVAILABLE.value)
    busy = sum(1 for (st,) in records if st == AvailabilityStatus.BUSY.value)
    off_duty = sum(1 for (st,) in records if st == AvailabilityStatus.OFF_DUTY.value)

    return StaffSummaryResponse(
        total=total,
        available=available,
        busy=busy,
        off_duty=off_duty,
    )


@router.get("/priority", response_model=List[RankedStaffMemberResponse])
def get_priority_staff(
    zone: str = Query(..., description="Target alert zone to rank staff for"),
    db: Session = Depends(get_db),
):
    """
    Ranks available staff for emergency alert dispatch:
    - Filters only available personnel (skipping busy/off-duty)
    - Exact zone matches rank first
    - Other available staff rank as fallback
    - Each record returns rank, name, role, zone, contact_number, availability_status, is_exact_zone
    """
    target_zone = zone.strip().lower()

    # Query only available personnel
    available_records = (
        db.query(StaffMemberRecord)
        .filter(StaffMemberRecord.availability_status == AvailabilityStatus.AVAILABLE.value)
        .order_by(StaffMemberRecord.name.asc())
        .all()
    )

    exact_matches: List[StaffMemberRecord] = []
    partial_matches: List[StaffMemberRecord] = []
    fallback_matches: List[StaffMemberRecord] = []

    for staff in available_records:
        staff_zone = staff.assigned_zone.strip().lower()
        if staff_zone == target_zone:
            exact_matches.append(staff)
        elif target_zone and (target_zone in staff_zone or staff_zone in target_zone):
            partial_matches.append(staff)
        else:
            fallback_matches.append(staff)

    ordered = exact_matches + partial_matches + fallback_matches

    ranked: List[RankedStaffMemberResponse] = []
    for idx, staff in enumerate(ordered, start=1):
        staff_zone = staff.assigned_zone.strip().lower()
        is_exact = (staff_zone == target_zone) or (bool(target_zone) and (target_zone in staff_zone or staff_zone in target_zone))
        ranked.append(
            RankedStaffMemberResponse(
                rank=idx,
                id=staff.id,
                name=staff.name,
                role=staff.role,
                zone=staff.assigned_zone,
                contact_number=staff.contact_number,
                availability_status=staff.availability_status,
                is_exact_zone=is_exact,
            )
        )

    return ranked


@router.post("/dispatch-call", response_model=EmergencyCallResponse)
async def dispatch_emergency_call(payload: EmergencyCallRequest):
    """
    Dispatches automated voice notification call via Exotel to the top-ranked available staff member.
    """
    result = await trigger_emergency_call(
        to_number=payload.contact_number,
        zone=payload.zone,
        staff_name=payload.staff_name,
        alert_id=payload.alert_id,
        alert_level=payload.alert_level,
        force=bool(payload.force),
    )
    return EmergencyCallResponse(**result)


@router.get("/exoml")
def get_exoml_response(zone: str = Query("designated sector", description="Alert zone")):
    """
    Returns standard ExoML XML response for Exotel IVR applet callback.
    """
    content = generate_exoml(zone)
    return Response(content=content, media_type="application/xml")


@router.get("/{staff_id}", response_model=StaffMemberResponse)
def get_staff_member(staff_id: str, db: Session = Depends(get_db)):
    """
    Retrieves a single staff member record by unique identifier.
    """
    record = db.query(StaffMemberRecord).filter(StaffMemberRecord.id == staff_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Staff member with ID '{staff_id}' not found.",
        )
    return record


@router.post(
    "",
    response_model=StaffMemberResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(admin_guard)],
)
def create_staff_member(
    payload: StaffMemberCreate,
    db: Session = Depends(get_db),
    current_admin: UserResponse = Depends(admin_guard),
):
    """
    [ADMIN ONLY] Creates and enrolls a new staff member into the operational roster.
    """
    record = StaffMemberRecord(
        id=str(uuid4()),
        name=payload.name.strip(),
        role=payload.role.strip(),
        contact_number=payload.contact_number.strip(),
        assigned_zone=payload.assigned_zone.strip(),
        availability_status=payload.availability_status.value if isinstance(payload.availability_status, AvailabilityStatus) else payload.availability_status,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("Staff Member created by Admin %s: %s (ID: %s)", current_admin.username, record.name, record.id)
    return record


@router.put(
    "/{staff_id}",
    response_model=StaffMemberResponse,
    dependencies=[Depends(admin_guard)],
)
def update_staff_member(
    staff_id: str,
    payload: StaffMemberUpdate,
    db: Session = Depends(get_db),
    current_admin: UserResponse = Depends(admin_guard),
):
    """
    [ADMIN ONLY] Updates operational details of an existing staff member.
    """
    record = db.query(StaffMemberRecord).filter(StaffMemberRecord.id == staff_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Staff member with ID '{staff_id}' not found.",
        )

    if payload.name is not None:
        record.name = payload.name.strip()
    if payload.role is not None:
        record.role = payload.role.strip()
    if payload.contact_number is not None:
        record.contact_number = payload.contact_number.strip()
    if payload.assigned_zone is not None:
        record.assigned_zone = payload.assigned_zone.strip()
    if payload.availability_status is not None:
        record.availability_status = (
            payload.availability_status.value
            if isinstance(payload.availability_status, AvailabilityStatus)
            else payload.availability_status
        )

    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    logger.info("Staff Member %s updated by Admin %s", staff_id, current_admin.username)
    return record


@router.patch(
    "/{staff_id}/status",
    response_model=StaffMemberResponse,
    dependencies=[Depends(admin_guard)],
)
def update_staff_status(
    staff_id: str,
    payload: StaffStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: UserResponse = Depends(admin_guard),
):
    """
    [ADMIN ONLY] Quickly toggles real-time availability status (Available, Busy, Off-duty).
    """
    record = db.query(StaffMemberRecord).filter(StaffMemberRecord.id == staff_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Staff member with ID '{staff_id}' not found.",
        )

    record.availability_status = (
        payload.availability_status.value
        if isinstance(payload.availability_status, AvailabilityStatus)
        else payload.availability_status
    )
    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    logger.info("Staff Member %s status set to %s by Admin %s", staff_id, record.availability_status, current_admin.username)
    return record


@router.delete(
    "/{staff_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(admin_guard)],
)
def delete_staff_member(
    staff_id: str,
    db: Session = Depends(get_db),
    current_admin: UserResponse = Depends(admin_guard),
):
    """
    [ADMIN ONLY] Removes a staff member from the active roster.
    """
    record = db.query(StaffMemberRecord).filter(StaffMemberRecord.id == staff_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Staff member with ID '{staff_id}' not found.",
        )

    db.delete(record)
    db.commit()
    logger.info("Staff Member %s deleted by Admin %s", staff_id, current_admin.username)
    return None


# Standalone sub-app interface matching NEXORA gateway registration pattern
app = FastAPI(title="NEXORA Staff Management Engine", version="1.0.0")
app.include_router(router)
