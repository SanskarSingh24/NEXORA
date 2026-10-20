"""
NEXORA Staff Management Layer Verification Tests
File: tests/test_staff.py
Description: Verifies isolated staff table persistence, CRUD operations,
             status tracking, and strict admin-only RBAC protection.
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.staff.staff_service import (
    StaffMemberRecord,
    init_db,
    SessionLocal,
    Base,
    engine,
)
from backend.auth.auth_service import app as auth_app


@pytest.fixture(scope="module")
def client():
    # Ensure tables and seed records are ready
    init_db()
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_headers():
    auth_c = TestClient(auth_app)
    res = auth_c.post("/auth/login?username_email=admin@nexora.com&password_raw=StrongPass1")
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def operator_headers():
    auth_c = TestClient(auth_app)
    res = auth_c.post("/auth/login?username_email=operator@nexora.com&password_raw=StrongPass1")
    assert res.status_code == 200, f"Operator login failed: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_list_and_summary_staff(client):
    """Test retrieving staff list and summary counters."""
    res = client.get("/staff")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    summary_res = client.get("/staff/summary")
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert "total" in summary
    assert "available" in summary
    assert "busy" in summary
    assert "off_duty" in summary
    assert summary["total"] >= 1


def test_admin_only_staff_creation_restriction(client, operator_headers):
    """Verify unauthenticated and non-admin requests are rejected."""
    payload = {
        "name": "Unauthorized Agent",
        "role": "Security",
        "contact_number": "+1 (555) 000-1111",
        "assigned_zone": "Zone X",
        "availability_status": "Available",
    }

    # 1. No auth headers -> 401 Unauthorized or 403 Forbidden
    unauth_res = client.post("/staff", json=payload)
    assert unauth_res.status_code in [401, 403]

    # 2. Operator role (SECURITY_OFFICER) -> 403 Forbidden
    op_res = client.post("/staff", json=payload, headers=operator_headers)
    assert op_res.status_code == 403
    assert "lacks sufficient privilege" in op_res.json()["detail"]


def test_admin_staff_crud_lifecycle(client, admin_headers, operator_headers):
    """Verify full CRUD lifecycle with admin clearance."""
    # 1. CREATE
    create_payload = {
        "name": "Officer Marcus Brody",
        "role": "Security",
        "contact_number": "+1 (555) 999-8888",
        "assigned_zone": "Sector 7 North",
        "availability_status": "Available",
    }
    create_res = client.post("/staff", json=create_payload, headers=admin_headers)
    assert create_res.status_code == 201
    created_staff = create_res.json()
    staff_id = created_staff["id"]
    assert created_staff["name"] == "Officer Marcus Brody"
    assert created_staff["role"] == "Security"
    assert created_staff["assigned_zone"] == "Sector 7 North"
    assert created_staff["availability_status"] == "Available"

    # 2. READ
    get_res = client.get(f"/staff/{staff_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == staff_id

    # 3. UPDATE DETAILS (Admin only)
    update_payload = {
        "assigned_zone": "Sector 7 South Command",
        "contact_number": "+1 (555) 999-9999",
    }
    # Non-admin update blocked
    op_update = client.put(f"/staff/{staff_id}", json=update_payload, headers=operator_headers)
    assert op_update.status_code == 403

    # Admin update succeeds
    admin_update = client.put(f"/staff/{staff_id}", json=update_payload, headers=admin_headers)
    assert admin_update.status_code == 200
    updated_data = admin_update.json()
    assert updated_data["assigned_zone"] == "Sector 7 South Command"
    assert updated_data["contact_number"] == "+1 (555) 999-9999"

    # 4. STATUS TOGGLE (PATCH)
    status_payload = {"availability_status": "Busy"}
    patch_res = client.patch(f"/staff/{staff_id}/status", json=status_payload, headers=admin_headers)
    assert patch_res.status_code == 200
    assert patch_res.json()["availability_status"] == "Busy"

    # 5. FILTER & SEARCH
    search_res = client.get("/staff?search=Marcus")
    assert search_res.status_code == 200
    search_results = search_res.json()
    assert any(s["id"] == staff_id for s in search_results)

    role_filter_res = client.get("/staff?role=Security")
    assert role_filter_res.status_code == 200
    assert all("security" in s["role"].lower() for s in role_filter_res.json())

    # 6. DELETE (Admin only)
    # Non-admin delete blocked
    op_del = client.delete(f"/staff/{staff_id}", headers=operator_headers)
    assert op_del.status_code == 403

    # Admin delete succeeds
    admin_del = client.delete(f"/staff/{staff_id}", headers=admin_headers)
    assert admin_del.status_code == 204

    # Confirm 404 on deleted item
    get_deleted = client.get(f"/staff/{staff_id}")
    assert get_deleted.status_code == 404


def test_nearest_staff_priority_ranking(client, admin_headers):
    """
    Verify nearest staff priority ranking:
    - Exact zone matches rank first
    - Fallback available staff rank next
    - Unavailable/Busy/Off-duty staff are completely skipped
    """
    # 1. Create controlled test personnel
    target_zone = "Sector 9 Alert Zone"
    other_zone = "Sector 1 Quiet Zone"

    # Staff A: Available in exact zone -> should be Rank 1
    res_a = client.post("/staff", json={
        "name": "Responder Alpha",
        "role": "Security",
        "contact_number": "+1 (555) 111-0001",
        "assigned_zone": target_zone,
        "availability_status": "Available"
    }, headers=admin_headers)
    assert res_a.status_code == 201
    id_a = res_a.json()["id"]

    # Staff B: Busy in exact zone -> must be SKIPPED
    res_b = client.post("/staff", json={
        "name": "Responder Beta",
        "role": "Medical",
        "contact_number": "+1 (555) 111-0002",
        "assigned_zone": target_zone,
        "availability_status": "Busy"
    }, headers=admin_headers)
    assert res_b.status_code == 201
    id_b = res_b.json()["id"]

    # Staff C: Off-duty in exact zone -> must be SKIPPED
    res_c = client.post("/staff", json={
        "name": "Responder Charlie",
        "role": "Supervisor",
        "contact_number": "+1 (555) 111-0003",
        "assigned_zone": target_zone,
        "availability_status": "Off-duty"
    }, headers=admin_headers)
    assert res_c.status_code == 201
    id_c = res_c.json()["id"]

    # Staff D: Available in other zone -> must be fallback (ranked after exact matches)
    res_d = client.post("/staff", json={
        "name": "Responder Delta",
        "role": "Technical",
        "contact_number": "+1 (555) 111-0004",
        "assigned_zone": other_zone,
        "availability_status": "Available"
    }, headers=admin_headers)
    assert res_d.status_code == 201
    id_d = res_d.json()["id"]

    try:
        # 2. Query priority list for target_zone
        prio_res = client.get(f"/staff/priority?zone={target_zone}")
        assert prio_res.status_code == 200
        prio_list = prio_res.json()

        # All items must have name, role, zone, rank
        for item in prio_list:
            assert "name" in item
            assert "role" in item
            assert "zone" in item
            assert "rank" in item
            assert item["availability_status"] == "Available"

        # Check exclusion of Busy (Staff B) and Off-duty (Staff C)
        returned_ids = [p["id"] for p in prio_list]
        assert id_b not in returned_ids, "Busy staff member was not skipped!"
        assert id_c not in returned_ids, "Off-duty staff member was not skipped!"

        # Check Staff A is Rank 1 with exact zone match
        assert id_a in returned_ids
        staff_a_entry = next(p for p in prio_list if p["id"] == id_a)
        assert staff_a_entry["rank"] == 1
        assert staff_a_entry["is_exact_zone"] is True
        assert staff_a_entry["zone"] == target_zone

        # Check Staff D is fallback with rank > 1
        assert id_d in returned_ids
        staff_d_entry = next(p for p in prio_list if p["id"] == id_d)
        assert staff_d_entry["rank"] > 1
        assert staff_d_entry["is_exact_zone"] is False
    finally:
        # Clean up test personnel
        for staff_id in [id_a, id_b, id_c, id_d]:
            client.delete(f"/staff/{staff_id}", headers=admin_headers)
