"""
NEXORA JWT & RBAC Route Verification
File: tests/test_auth.py
"""

from uuid import uuid4
from fastapi.testclient import TestClient
from backend.auth.auth_service import USER_DB, UserRole

def test_operator_registration_and_login_flow(auth_client):
    # 1. Register a new operator
    register_payload = {
        "username": "op_test_unit",
        "email": "op_unit@nexora.io",
        "password": "superSafePassword123",
        "role": "SECURITY_OFFICER"
    }
    reg_response = auth_client.post("/auth/register", json=register_payload)
    assert reg_response.status_code == 201
    user_data = reg_response.json()
    assert user_data["username"] == "op_test_unit"
    assert user_data["role"] == "SECURITY_OFFICER"
    assert "user_id" in user_data

    # 2. Assert login works with valid credentials
    login_response = auth_client.post(
        f"/auth/login?username_email=op_unit@nexora.io&password_raw=superSafePassword123"
    )
    assert login_response.status_code == 200
    token_data = login_response.json()
    assert "access_token" in token_data
    assert "refresh_token" in token_data
    assert token_data["token_type"] == "bearer"

    # 3. Repeat login with bad credentials
    bad_login = auth_client.post(
        f"/auth/login?username_email=op_unit@nexora.io&password_raw=wrongPass"
    )
    assert bad_login.status_code == 401


def test_token_rotation_and_logout_flow(auth_client):
    # Register & Login
    auth_client.post("/auth/register", json={
        "username": "op_rotate",
        "email": "rot@nexora.io",
        "password": "safePassword1!",
        "role": "ADMIN"
    })
    tokens = auth_client.post("/auth/login?username_email=rot@nexora.io&password_raw=safePassword1!").json()
    acc_token = tokens["access_token"]
    ref_token = tokens["refresh_token"]

    # Refresh token rotation
    refresh_response = auth_client.post("/auth/token/refresh", json={"refresh_token": ref_token})
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.json()
    assert new_tokens["access_token"] != acc_token
    assert new_tokens["refresh_token"] != ref_token

    # Logout & session invalidation
    logout_payload = {"refresh_token": new_tokens["refresh_token"]}
    authorized_header = {"Authorization": f"Bearer {new_tokens['access_token']}"}
    logout_res = auth_client.post("/auth/logout", json=logout_payload, headers=authorized_header)
    assert logout_res.status_code == 200
    assert logout_res.json()["status"] == "SUCCESS"

    # Verify blacklisted token gets blocked on subsequent attempts
    blocked_request = auth_client.get("/telemetry/system-status", headers=authorized_header)
    assert blocked_request.status_code == 401


def test_rbac_clearance_levels(auth_client):
    # Setup test accounts with different roles
    roles_setup = [
        {"username": "usr_admin", "email": "admin@nexora.io", "password": "pass12345", "role": "ADMIN"},
        {"username": "usr_security", "email": "sec@nexora.io", "password": "pass12345", "role": "SECURITY_OFFICER"},
        {"username": "usr_manager", "email": "mgr@nexora.io", "password": "pass12345", "role": "EVENT_MANAGER"}
    ]

    tokens_by_role = {}
    for user_info in roles_setup:
        auth_client.post("/auth/register", json=user_info)
        tok = auth_client.post(f"/auth/login?username_email={user_info['email']}&password_raw={user_info['password']}").json()
        tokens_by_role[user_info["role"]] = tok["access_token"]

    # 1. /telemetry/system-status requires ADMIN, SECURITY_OFFICER, or EVENT_MANAGER (all allowed)
    for role, t in tokens_by_role.items():
        res = auth_client.get("/telemetry/system-status", headers={"Authorization": f"Bearer {t}"})
        assert res.status_code == 200

    # 2. /incident/override-rules requires SECURITY_OFFICER or ADMIN (manager prohibited)
    assert auth_client.get("/incident/override-rules", headers={"Authorization": f"Bearer {tokens_by_role['ADMIN']}"}).status_code == 200
    assert auth_client.get("/incident/override-rules", headers={"Authorization": f"Bearer {tokens_by_role['SECURITY_OFFICER']}"}).status_code == 200
    assert auth_client.get("/incident/override-rules", headers={"Authorization": f"Bearer {tokens_by_role['EVENT_MANAGER']}"}).status_code == 403

    # 3. /admin/system-calibrations requires ADMIN (only admin allowed)
    assert auth_client.get("/admin/system-calibrations", headers={"Authorization": f"Bearer {tokens_by_role['ADMIN']}"}).status_code == 200
    assert auth_client.get("/admin/system-calibrations", headers={"Authorization": f"Bearer {tokens_by_role['SECURITY_OFFICER']}"}).status_code == 403
