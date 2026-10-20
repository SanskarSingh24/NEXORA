"""
Unit and Integration Tests for NEXORA Exotel Emergency Call Integration
File: tests/test_exotel.py
"""

import asyncio
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.staff.exotel_service import (
    generate_exoml,
    sanitize_phone_number,
    trigger_emergency_call,
    _CALL_DISPATCH_CACHE,
)
from config.settings import settings


@pytest.fixture(autouse=True)
def clear_call_cache():
    """Ensure in-memory call dispatch cache is clean and runs simulated tests."""
    old_sid = settings.exotel_account_sid
    settings.exotel_account_sid = ""
    _CALL_DISPATCH_CACHE.clear()
    yield
    settings.exotel_account_sid = old_sid
    _CALL_DISPATCH_CACHE.clear()


def test_sanitize_phone_number():
    """Verify phone normalization handles various formats."""
    assert sanitize_phone_number("+91 98765-43210") == "+919876543210"
    assert sanitize_phone_number("(555) 123-4567") == "5551234567"
    assert sanitize_phone_number("  +1-800-555-0199  ") == "+18005550199"
    assert sanitize_phone_number("") == ""


def test_generate_exoml():
    """Verify ExoML voice document generation format and content."""
    xml_output = generate_exoml("Gate A")
    assert '<?xml version="1.0" encoding="UTF-8"?>' in xml_output
    assert "<Response>" in xml_output
    assert "<Say" in xml_output
    assert "Gate A" in xml_output
    assert "NEXORA Emergency. Critical incident detected at Gate A." in xml_output
    assert "<Hangup/>" in xml_output


def test_trigger_emergency_call_simulated():
    """Verify unconfigured credentials default gracefully to simulated dispatch."""
    res = asyncio.run(
        trigger_emergency_call(
            to_number="+91 9876543210",
            zone="Plaza South",
            staff_name="Officer John",
            alert_id="ALT-TEST-001",
            alert_level="CRITICAL",
        )
    )
    assert res["success"] is True
    assert res["status"] == "simulated"
    assert "Plaza South" in res["message"]
    assert res["to"] == "+919876543210"
    assert res["staff_name"] == "Officer John"
    assert res["call_sid"].startswith("sim_")


def test_trigger_emergency_call_cooldown_deduplication():
    """Verify multiple calls to same staff member for same alert within cooldown are deduplicated."""
    # First call
    res1 = asyncio.run(
        trigger_emergency_call(
            to_number="+91 9876543210",
            zone="Plaza South",
            staff_name="Officer John",
            alert_id="ALT-DEDUP-01",
        )
    )
    assert res1["status"] == "simulated"

    # Immediate second call without force should be suppressed
    res2 = asyncio.run(
        trigger_emergency_call(
            to_number="+91 9876543210",
            zone="Plaza South",
            staff_name="Officer John",
            alert_id="ALT-DEDUP-01",
            force=False,
        )
    )
    assert res2["status"] == "already_called"
    assert res2["success"] is True

    # Immediate second call WITH force should re-trigger
    res3 = asyncio.run(
        trigger_emergency_call(
            to_number="+91 9876543210",
            zone="Plaza South",
            staff_name="Officer John",
            alert_id="ALT-DEDUP-01",
            force=True,
        )
    )
    assert res3["status"] == "simulated"
    assert res3["success"] is True


def test_api_dispatch_call_endpoint():
    """Verify POST /staff/dispatch-call endpoint handles request and returns schema-compliant response."""
    client = TestClient(app)
    payload = {
        "staff_id": "test-staff-1",
        "contact_number": "+91 9876543210",
        "staff_name": "Sergeant Miller",
        "zone": "Gate 3",
        "alert_id": "ALT-API-001",
        "alert_level": "CRITICAL",
        "force": True,
    }
    response = client.post("/staff/dispatch-call", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["to"] == "+919876543210"
    assert data["staff_name"] == "Sergeant Miller"
    assert data["zone"] == "Gate 3"
    assert "dispatched_at" in data


def test_api_exoml_endpoint():
    """Verify GET /staff/exoml endpoint returns application/xml content."""
    client = TestClient(app)
    response = client.get("/staff/exoml?zone=Main%20Concourse")
    assert response.status_code == 200
    assert "application/xml" in response.headers.get("content-type", "")
    assert "Main Concourse" in response.text
    assert "<Say" in response.text
