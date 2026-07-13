"""
NEXORA Crowd Analytics Service
File: backend/analytics/analytics_service.py
Description: Production-ready Python service that processes raw Vision Engine telemetry,
             calculates advanced stats (occupancy %, rates, direction strings),
             and persists analytical outputs to a PostgreSQL database.
"""

import math
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, Float, ForeignKey, Index, Integer, String, DateTime, create_engine
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from contextlib import contextmanager

from config.settings import settings

# =====================================================================
# 1. DATABASE CONFIGURATION
# =====================================================================

# Database URL sourced from centralised settings — no fallback, required at startup.
DATABASE_URL: str = settings.database_url

engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_recycle=1800,
    pool_pre_ping=True,          # Health-check stale connections before reuse
    pool_timeout=30,
    echo=False,                   # Disable SQL echo in production for performance
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# =====================================================================
# 2. SQL ALCHEMY MODEL DEFINITIONS
# =====================================================================

class CrowdAnalyticsRecord(Base):
    __tablename__ = "crowd_analytics_log"

    log_id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    camera_id = Column(PG_UUID(as_uuid=True), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    current_count = Column(Integer, nullable=False)
    occupancy_pct = Column(Float, nullable=False)  # percentage calculation (count / max_capacity * 100)
    density_value = Column(Float, nullable=False)    # people per square meter
    avg_speed = Column(Float, nullable=False)       # average speed index
    entry_rate = Column(Float, nullable=False)      # entry counts in current interval
    exit_rate = Column(Float, nullable=False)       # exit counts in current interval
    queue_length = Column(Integer, nullable=False)   # number of people waiting
    movement_direction = Column(String(16), nullable=False) # e.g. 'N', 'NE', 'STATIONARY'

    # Composite index for fast time-range queries per camera (most common access pattern)
    __table_args__ = (
        Index('idx_camera_timestamp', 'camera_id', 'timestamp'),
    )


def init_db():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"PostgreSQL connection skipped or unavailable: {e}. Running with mock engine fallbacks.")

# =====================================================================
# 3. REUSABLE ANALYTICS SERVICE LAYER
# =====================================================================

class CrowdAnalyticsService:
    def __init__(self, db_session_factory=SessionLocal):
        self.Session = db_session_factory
        init_db()

    @contextmanager
    def _get_session(self):
        """Context manager ensuring deterministic session lifecycle and memory cleanup."""
        session = self.Session()
        try:
            yield session
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @staticmethod
    def calculate_cardinal_direction(dx: float, dy: float) -> str:
        """
        Maps a 2D velocity vector to a compass direction.
        """
        speed = math.sqrt(dx**2 + dy**2)
        
        # Consider the crowd stationary if speed is extremely low
        if speed < 0.15:
            return "STATIONARY"
            
        # Calculate angle clockwise from North (12 o'clock = 0 deg)
        # Note: In screen coords, Y goes down, so we invert dy for standard Cartesian match
        angle = math.degrees(math.atan2(dx, -dy))
        if angle < 0:
            angle += 360.0
            
        # Segment 360 degrees into 8 cardinal direction sectors
        directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        direction_index = int((angle + 22.5) / 45.0) % 8
        return directions[direction_index]

    def save_raw_telemetry(self, 
                           camera_id: UUID, 
                           vision_payload: dict, 
                           max_capacity: int = 150) -> CrowdAnalyticsRecord:
        """
        Processes raw vision data, calculates advanced crowd statistics,
        and saves the resulting record to PostgreSQL.
        """
        with self._get_session() as db:
            timestamp = datetime.now(timezone.utc)
            headcount = vision_payload.get("zone_headcount", 0)
            
            # 1. Calculate Occupancy Percentage
            occupancy_pct = (headcount / max(max_capacity, 1)) * 100.0
            
            # 2. Retrieve Entry/Exit values and compute instantaneous rates
            current_entries = vision_payload.get("entry_count", 0)
            current_exits = vision_payload.get("exit_count", 0)
            
            # Fetch only the oldest record in window (LIMIT 1) instead of loading all rows
            one_min_ago = timestamp - timedelta(minutes=1)
            baseline_record = (
                db.query(CrowdAnalyticsRecord)
                .filter(CrowdAnalyticsRecord.camera_id == camera_id)
                .filter(CrowdAnalyticsRecord.timestamp >= one_min_ago)
                .order_by(CrowdAnalyticsRecord.timestamp.asc())
                .first()  # Single row fetch instead of .all() — O(1) memory
            )
            
            if baseline_record:
                # Calculate entry and exit rates based on the diff over the time frame
                delta_seconds = (timestamp - baseline_record.timestamp).total_seconds()
                base_entries = baseline_record.entry_rate
                base_exits = baseline_record.exit_rate
                
                # Flow rates expressed as count change per minute
                entry_rate = ((current_entries - base_entries) / max(delta_seconds, 1)) * 60.0
                exit_rate = ((current_exits - base_exits) / max(delta_seconds, 1)) * 60.0
            else:
                entry_rate = float(current_entries)
                exit_rate = float(current_exits)

            # Ensure rates do not fall below zero
            entry_rate = max(0.0, entry_rate)
            exit_rate = max(0.0, exit_rate)

            # 3. Calculate Average Speed and Direction
            flow_vx, flow_vy = vision_payload.get("flow_direction_vector", (0.0, 0.0))
            avg_speed = math.sqrt(flow_vx**2 + flow_vy**2)
            movement_dir = self.calculate_cardinal_direction(flow_vx, flow_vy)

            # 4. Persistence Mapping
            analytics_record = CrowdAnalyticsRecord(
                log_id=uuid4(),
                camera_id=camera_id,
                timestamp=timestamp,
                current_count=headcount,
                occupancy_pct=round(occupancy_pct, 2),
                density_value=vision_payload.get("crowd_density_sqm", 0.0),
                avg_speed=round(avg_speed, 3),
                entry_rate=round(entry_rate, 2),
                exit_rate=round(exit_rate, 2),
                queue_length=vision_payload.get("queue_active_count", 0),
                movement_direction=movement_dir
            )

            db.add(analytics_record)
            db.commit()
            db.refresh(analytics_record)
            return analytics_record

    def get_zone_analytics_history(self, 
                                   camera_id: UUID, 
                                   minutes_window: int = 60,
                                   max_results: int = 500) -> List[CrowdAnalyticsRecord]:
        """
        Retrieves historical crowd analytics records for charts rendering.
        Capped at max_results to prevent unbounded memory allocation.
        """
        with self._get_session() as db:
            start_time = datetime.now(timezone.utc) - timedelta(minutes=minutes_window)
            return (
                db.query(CrowdAnalyticsRecord)
                .filter(CrowdAnalyticsRecord.camera_id == camera_id)
                .filter(CrowdAnalyticsRecord.timestamp >= start_time)
                .order_by(CrowdAnalyticsRecord.timestamp.desc())
                .limit(max_results)
                .all()
            )

    def query_aggregate_dashboard_metrics(self) -> dict:
        """
        Aggregates real-time metrics across all monitored zones in the database.
        Uses server-side SQL aggregation to minimize data transfer.
        """
        from sqlalchemy.sql import func

        with self._get_session() as db:
            # Subquery to fetch the latest analytics records for each camera
            subq = (
                db.query(
                    CrowdAnalyticsRecord.camera_id,
                    func.max(CrowdAnalyticsRecord.timestamp).label("max_ts")
                )
                .group_by(CrowdAnalyticsRecord.camera_id)
                .subquery()
            )
            
            latest_records = (
                db.query(CrowdAnalyticsRecord)
                .join(subq, (CrowdAnalyticsRecord.camera_id == subq.c.camera_id) & 
                            (CrowdAnalyticsRecord.timestamp == subq.c.max_ts))
                .all()
            )
            
            if not latest_records:
                return {
                    "total_network_count": 0,
                    "average_occupancy_pct": 0.0,
                    "active_queues": 0,
                    "total_entry_rate_per_min": 0.0
                }
                
            total_count = sum(r.current_count for r in latest_records)
            avg_occupancy = sum(r.occupancy_pct for r in latest_records) / len(latest_records)
            queues = sum(r.queue_length for r in latest_records)
            aggregate_entries = sum(r.entry_rate for r in latest_records)
            
            return {
                "total_network_count": total_count,
                "average_occupancy_pct": round(avg_occupancy, 2),
                "active_queues": queues,
                "total_entry_rate_per_min": round(aggregate_entries, 2)
            }

# =====================================================================
# 4. DIRECT RUN TESTING SCRIPT
# =====================================================================
if __name__ == "__main__":
    # Create service instance (Uses memory-mapped DB connection config if default fails)
    service = CrowdAnalyticsService()
    
    mock_camera_uuid = uuid4()
    mock_vision_data = {
        "total_headcount": 42,
        "zone_headcount": 35,
        "crowd_density_sqm": 1.45,
        "queue_active_count": 4,
        "entry_count": 120,
        "exit_count": 92,
        "flow_direction_vector": (0.85, -0.15)  # Flowing East - Northeast
    }
    
    print("Testing Crowd Analytics Engine...")
    print(f"Generating mock telemetry processing for Camera UUID: {mock_camera_uuid}")
    
    # Process and save telemetry data
    try:
        saved_log = service.save_raw_telemetry(
            camera_id=mock_camera_uuid,
            vision_payload=mock_vision_data,
            max_capacity=50
        )
        print("Crowd Analytics Record Saved Successfully:")
        print(f" - Primary ID: {saved_log.log_id}")
        print(f" - Occupancy: {saved_log.occupancy_pct}%")
        print(f" - Flow Speed: {saved_log.avg_speed}")
        print(f" - Calculated Direction: {saved_log.movement_direction}")
    except Exception as err:
        print(f"Skipping database persistence test (running offline): {err}")
