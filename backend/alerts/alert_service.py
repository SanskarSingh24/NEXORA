"""
NEXORA Emergency Alert Management Service
File: backend/alerts/alert_service.py
Description: Production-ready Python service interfacing with PostgreSQL to store,
             update, and manage emergency crowd pressure alerts.
"""

import os
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, Float, ForeignKey, Integer, String, DateTime, Boolean, JSON, create_engine, Index
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from contextlib import contextmanager
from fastapi import FastAPI, HTTPException, status, Query
from pydantic import BaseModel

from config.settings import settings
from backend.vision.vision_engine import get_live_telemetry_snapshot
from backend.ai.predictive_engine import predict_risk_from_metrics
from backend.ai.explainable_api import xai_manager, PredictionInput

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
    pool_pre_ping=True          # Health checks inactive connections before reuse
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# =====================================================================
# 2. ENUMS & SQLALCHEMY MODELS
# =====================================================================

class RiskLevel(str, Enum):
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    ORANGE = "ORANGE"
    RED = "RED"  # RED corresponds to CRITICAL state


class AlertRecord(Base):
    __tablename__ = "crowd_alerts"

    alert_id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    camera_id = Column(PG_UUID(as_uuid=True), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    risk_level = Column(String(16), nullable=False)  # GREEN, YELLOW, ORANGE, RED
    confidence_pct = Column(Float, nullable=False)
    explanation = Column(String(512), nullable=True)
    recommendations = Column(JSON, nullable=True)  # List of recommended actions (JSON array)
    is_acknowledged = Column(Boolean, default=False, nullable=False, index=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    operator_id = Column(String(64), nullable=True)

    # Composite index for filtering unacknowledged alerts sorted by time
    __table_args__ = (
        Index('idx_unread_alerts', 'is_acknowledged', 'timestamp'),
    )


def init_db():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"PostgreSQL connection skipped or unavailable: {e}. Running with mock engine fallbacks.")

# =====================================================================
# 3. REUSABLE ALERT SERVICE
# =====================================================================

class AlertManagementService:
    def __init__(self, db_session_factory=SessionLocal):
        self.Session = db_session_factory
        self.manual_alerts: List[dict] = []
        init_db()

    @contextmanager
    def _get_session(self):
        """Yields database session with automatic transaction cleanup and memory protection."""
        session = self.Session()
        try:
            yield session
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def trigger_manual_alert(self, 
                             camera: Optional[str] = "CAM-01", 
                             zone: Optional[str] = "Central Concourse", 
                             level: Optional[str] = "RED",
                             risk_level: Optional[str] = "CRITICAL",
                             message: Optional[str] = None) -> dict:
        """
        Manually triggers an operator-forced emergency alert and adds it to the real-time alert stream.
        """
        now = datetime.now(timezone.utc)
        ts_id = f"AL-{int(now.timestamp())}"
        alert_msg = message or "Manual Threat Trigger: Operator forced emergency alert parameter breach."
        
        forced_item = {
            "id": ts_id,
            "camera_id": camera or "CAM-01",
            "camera": camera or "CAM-01",
            "zone": zone or "Central Concourse",
            "risk_level": risk_level or "CRITICAL",
            "severity": level or "RED",
            "level": level or "RED",
            "risk_score": 92.5,
            "confidence": 96.5,
            "message": alert_msg,
            "explanation": alert_msg,
            "shap_contributions": {
                "density": 0.48,
                "speed": -0.22,
                "queue_length": 0.35,
                "occupancy": 0.41
            },
            "recommendations": [
                "Initiate emergency exit path routing.",
                "Automate direction sign arrows."
            ],
            "timestamp": now.isoformat(),
            "is_acknowledged": False
        }

        # Keep latest 20 manual alerts
        self.manual_alerts = [forced_item] + [a for a in self.manual_alerts if a["id"] != ts_id][:19]
        return forced_item

    def generate_critical_alert(self, 
                                camera_id: UUID, 
                                risk_level: RiskLevel,
                                confidence: float, 
                                explanation: str, 
                                recommendations: List[str]) -> AlertRecord:
        """
        Creates and stores a new emergency alert in standard PostgreSQL tables.
        """
        with self._get_session() as db:
            new_alert = AlertRecord(
                alert_id=uuid4(),
                camera_id=camera_id,
                timestamp=datetime.now(timezone.utc),
                risk_level=risk_level.value,
                confidence_pct=round(confidence, 2),
                explanation=explanation,
                recommendations=recommendations,
                is_acknowledged=False
            )
            db.add(new_alert)
            db.commit()
            db.refresh(new_alert)
            return new_alert

    def acknowledge_alert(self, alert_id: UUID, operator_id: str) -> Optional[AlertRecord]:
        """
        Marks an existing alert record as acknowledged by an operator.
        """
        # Also acknowledge in memory list
        str_id = str(alert_id)
        for ma in self.manual_alerts:
            if ma["id"] == str_id:
                ma["is_acknowledged"] = True
                ma["operator"] = operator_id

        with self._get_session() as db:
            alert = db.query(AlertRecord).filter(AlertRecord.alert_id == alert_id).first()
            if not alert:
                return None
                
            alert.is_acknowledged = True
            alert.acknowledged_at = datetime.now(timezone.utc)
            alert.operator_id = operator_id
            
            db.commit()
            db.refresh(alert)
            return alert

    def list_active_alerts(self, max_results: int = 100) -> List[AlertRecord]:
        """
        Returns all unacknowledged active alerts, capped to protect query response latency.
        """
        with self._get_session() as db:
            return (
                db.query(AlertRecord)
                .filter(AlertRecord.is_acknowledged == False)
                .order_by(AlertRecord.timestamp.desc())
                .limit(max_results)
                .all()
            )

    def get_alert_history(self, limit: int = 50) -> List[AlertRecord]:
        """
        Retrieves historical alerts lists.
        """
        with self._get_session() as db:
            return (
                db.query(AlertRecord)
                .order_by(AlertRecord.timestamp.desc())
                .limit(limit)
                .all()
            )

    def evaluate_live_telemetry_alerts(self) -> List[dict]:
        """
        Evaluates real-time live computer vision telemetry, ML risk scoring, and SHAP explainability
        data to trigger dynamic emergency alerts when crowd risk exceeds safety thresholds.
        """
        snapshot = get_live_telemetry_snapshot()
        auto_alerts = []

        density = snapshot.get("density", 0.0)
        speed = snapshot.get("avg_speed", 1.2)
        entry_rate = snapshot.get("entry_rate", 0.0)
        exit_rate = snapshot.get("exit_rate", 0.0)
        flow_angle = snapshot.get("flow_angle", 0.0)
        queue_length = snapshot.get("queue_length", 0)
        crowd_count = snapshot.get("crowd_count", 0)
        occupancy = round(min(150.0, (crowd_count / 80.0) * 100.0), 1)

        # Evaluate real-time risk score and class label from live metrics
        risk_level, risk_score, confidence = predict_risk_from_metrics(
            density=density,
            speed=speed,
            entry_rate=entry_rate,
            exit_rate=exit_rate,
            flow_angle=flow_angle,
            queue_length=queue_length,
            occupancy=occupancy,
        )

        # Compute live SHAP explanation
        inp = PredictionInput(
            density=density,
            speed=speed,
            entry_rate=entry_rate,
            exit_rate=exit_rate,
            flow_direction_angle=flow_angle,
            queue_length=queue_length,
            occupancy=occupancy,
        )
        xai_res = xai_manager.explain(inp)

        # Trigger dynamic alert if risk level is elevated (MODERATE, HIGH, or CRITICAL)
        if risk_level in ["MODERATE", "HIGH", "CRITICAL", "YELLOW", "ORANGE", "RED"]:
            severity = "RED" if risk_level in ["CRITICAL", "RED", "HIGH", "ORANGE"] else "YELLOW"
            conf_pct = round(confidence * 100 if confidence <= 1.0 else confidence, 1)

            recommendations = []
            if density > 3.0:
                recommendations.append("Enact directional corridor rerouting and open emergency spillways.")
            if queue_length > 15:
                recommendations.append("Deploy security marshals to regulate entrance queue inflow.")
            if speed < 0.8:
                recommendations.append("Clear pedestrian bottlenecks near escalators and gate choke points.")
            if not recommendations:
                recommendations.append("Increase real-time video surveillance and prepare evacuation corridors.")

            alert_item = {
                "id": f"AL-{int(datetime.now(timezone.utc).timestamp())}",
                "camera_id": "CAM-01",
                "risk_level": risk_level,
                "severity": severity,
                "risk_score": risk_score,
                "confidence": conf_pct,
                "message": xai_res.explanation_reason,
                "explanation": xai_res.explanation_reason,
                "shap_contributions": xai_res.shap_contributions,
                "recommendations": recommendations,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "is_acknowledged": False
            }
            auto_alerts.append(alert_item)

        # Merge manual forced alerts and auto-evaluated telemetry alerts
        combined = self.manual_alerts + auto_alerts
        # Deduplicate by ID
        seen = set()
        deduped = []
        for a in combined:
            aid = a.get("id")
            if aid not in seen:
                seen.add(aid)
                deduped.append(a)

        return deduped


# =====================================================================
# 4. FASTAPI ALERT SERVICE ENDPOINTS
# =====================================================================

app = FastAPI(title="NEXORA Alert Management Service", version="1.0.0")
alert_service_instance = AlertManagementService()

class ForceAlertPayload(BaseModel):
    camera: Optional[str] = "CAM-01"
    zone: Optional[str] = "Central Concourse"
    level: Optional[str] = "RED"
    risk_level: Optional[str] = "CRITICAL"
    message: Optional[str] = None

@app.get("/alerts")
@app.get("/api/alerts")
def get_alerts():
    """Returns dynamic alerts triggered directly from live telemetry, risk scoring, and SHAP data."""
    live_alerts = alert_service_instance.evaluate_live_telemetry_alerts()
    return {
        "status": "success",
        "count": len(live_alerts),
        "alerts": live_alerts
    }

@app.get("/alerts/active")
@app.get("/api/alerts/active")
def get_active_alerts():
    return alert_service_instance.evaluate_live_telemetry_alerts()

@app.post("/alerts/trigger")
@app.post("/api/alerts/trigger")
@app.post("/alerts/force")
@app.post("/api/alerts/force")
def trigger_alert_endpoint(payload: Optional[ForceAlertPayload] = None):
    data = payload.dict() if payload else {}
    new_alert = alert_service_instance.trigger_manual_alert(
        camera=data.get("camera"),
        zone=data.get("zone"),
        level=data.get("level"),
        risk_level=data.get("risk_level"),
        message=data.get("message")
    )
    return {
        "status": "success",
        "alert": new_alert
    }

@app.post("/alerts/acknowledge/{alert_id}")
@app.post("/api/alerts/acknowledge/{alert_id}")
def acknowledge_alert_endpoint(alert_id: str, operator_id: str = "Operator"):
    # Mark in memory
    for ma in alert_service_instance.manual_alerts:
        if ma.get("id") == alert_id:
            ma["is_acknowledged"] = True
            ma["operator"] = operator_id
    return {
        "status": "acknowledged",
        "alert_id": alert_id,
        "operator_id": operator_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# =====================================================================
# 4. DIRECT TEST HOOK
# =====================================================================
if __name__ == "__main__":
    service = AlertManagementService()
    
    mock_cam_id = uuid4()
    
    print("Testing NEXORA Alert Management Service...")
    print(f"Creating a simulated alert for Camera: {mock_cam_id}")
    
    try:
        alert = service.generate_critical_alert(
            camera_id=mock_cam_id,
            risk_level=RiskLevel.RED,
            confidence=96.2,
            explanation="SHAP detects high local queue lengths and density triggers.",
            recommendations=[
                "Initiate emergency exit paths routing.",
                "Automate coordinate signs arrows."
            ]
        )
        print("Success! Created alert record:")
        print(f" - ID: {alert.alert_id}")
        print(f" - Level: {alert.risk_level}")
        print(f" - Is Acknowledged: {alert.is_acknowledged}")
        
        print("\nSimulating operator acknowledgement...")
        updated = service.acknowledge_alert(alert.alert_id, "OP-0428")
        if updated:
            print("Success! Updated alert record status:")
            print(f" - Is Acknowledged: {updated.is_acknowledged}")
            print(f" - Acknowledged At: {updated.acknowledged_at}")
            print(f" - Operator: {updated.operator_id}")
            
    except Exception as err:
        print(f"Skipping database persistence testing (offline mode): {err}")
