"""
NEXORA Emergency Alert Persistence Layer Verification
File: tests/test_alerts.py
"""

from uuid import uuid4
from backend.alerts.alert_service import AlertManagementService, AlertRecord, RiskLevel

def test_alert_records_generation_and_acknowledgement(db_session):
    session_factory = lambda: db_session
    service = AlertManagementService(db_session_factory=session_factory)

    camera_id = uuid4()
    
    # 1. Create a critical alert
    new_alert = service.generate_critical_alert(
        camera_id=camera_id,
        risk_level=RiskLevel.RED,
        confidence=98.5,
        explanation="SHAP calculation details critical corridor bottlenecks.",
        recommendations=["Reroute stream East", "Initiate alarms sirens"]
    )
    
    assert isinstance(new_alert, AlertRecord)
    assert new_alert.alert_id is not None
    assert new_alert.risk_level == "RED"
    assert new_alert.confidence_pct == 98.5
    assert new_alert.is_acknowledged is False

    # 2. Check it appears on active alarms list
    active_alerts = service.list_active_alerts()
    assert len(active_alerts) == 1
    assert active_alerts[0].alert_id == new_alert.alert_id

    # 3. Acknowledge the alert item
    operator_id = "OP-9012"
    acknowledged_record = service.acknowledge_alert(new_alert.alert_id, operator_id)
    assert acknowledged_record is not None
    assert acknowledged_record.is_acknowledged is True
    assert acknowledged_record.operator_id == operator_id
    assert acknowledged_record.acknowledged_at is not None

    # 4. Verify it's no longer on the active alarms list
    assert len(service.list_active_alerts()) == 0

    # 5. Verify it still exists in general history log view
    history = service.get_alert_history(limit=10)
    assert len(history) == 1
    assert history[0].alert_id == new_alert.alert_id
