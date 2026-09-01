"""
NEXORA JWT & RBAC Route Verification & Email Verification Tests
File: tests/test_auth.py
"""

import time
from uuid import uuid4
from fastapi.testclient import TestClient
from backend.auth.auth_service import USER_DB, VERIFICATION_TOKEN_STORE, PASSWORD_RESET_TOKEN_STORE, UserRole


def test_operator_registration_and_email_verification_flow(auth_client):
    # 1. Register a new operator
    register_payload = {
        "username": "op_test_unit",
        "email": "op_unit@nexora.io",
        "password": "SuperSafePassword123",
        "role": "SECURITY_OFFICER"
    }
    reg_response = auth_client.post("/auth/register", json=register_payload)
    assert reg_response.status_code == 201
    user_data = reg_response.json()
    assert user_data["username"] == "op_test_unit"
    assert user_data["role"] == "SECURITY_OFFICER"
    assert user_data["is_verified"] is False
    assert "user_id" in user_data

    # 2. Attempt login before verification — must be blocked with HTTP 403
    unverified_login = auth_client.post(
        f"/auth/login?username_email=op_unit@nexora.io&password_raw=SuperSafePassword123"
    )
    assert unverified_login.status_code == 403
    assert "not verified" in unverified_login.json()["detail"].lower()

    # 3. Retrieve token from verification store and verify email
    user_token = [t for t, email in VERIFICATION_TOKEN_STORE.items() if email == "op_unit@nexora.io"][0]
    verify_res = auth_client.get(f"/auth/verify-email?token={user_token}")
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "SUCCESS"

    # 4. Assert login now succeeds with valid credentials
    login_response = auth_client.post(
        f"/auth/login?username_email=op_unit@nexora.io&password_raw=SuperSafePassword123"
    )
    assert login_response.status_code == 200
    token_data = login_response.json()
    assert "access_token" in token_data
    assert "refresh_token" in token_data
    assert token_data["token_type"] == "bearer"

    # 5. Repeat login with bad credentials
    bad_login = auth_client.post(
        f"/auth/login?username_email=op_unit@nexora.io&password_raw=wrongPass"
    )
    assert bad_login.status_code == 401


def test_resend_verification_email_flow(auth_client):
    # 1. Register new unverified account
    auth_client.post("/auth/register", json={
        "username": "op_resend",
        "email": "resend_test@nexora.io",
        "password": "SafePassword123!",
        "role": "SECURITY_OFFICER"
    })

    initial_token = [t for t, e in VERIFICATION_TOKEN_STORE.items() if e == "resend_test@nexora.io"][0]

    # 2. Resend verification email
    resend_res = auth_client.post("/auth/resend-verification", json={"email": "resend_test@nexora.io"})
    assert resend_res.status_code == 200
    assert resend_res.json()["status"] == "SUCCESS"

    new_token = [t for t, e in VERIFICATION_TOKEN_STORE.items() if e == "resend_test@nexora.io"][0]
    assert new_token != initial_token

    # 3. Verify with the new token
    verify_res = auth_client.post("/auth/verify-email", json={"token": new_token})
    assert verify_res.status_code == 200

    # 4. Verify with consumed token fails
    old_verify_res = auth_client.get(f"/auth/verify-email?token={initial_token}")
    assert old_verify_res.status_code == 400


def test_token_rotation_and_logout_flow(auth_client):
    # Register & Verify
    auth_client.post("/auth/register", json={
        "username": "op_rotate",
        "email": "rot@nexora.io",
        "password": "SafePassword1!",
        "role": "ADMIN"
    })
    token = [t for t, e in VERIFICATION_TOKEN_STORE.items() if e == "rot@nexora.io"][0]
    auth_client.get(f"/auth/verify-email?token={token}")

    tokens = auth_client.post("/auth/login?username_email=rot@nexora.io&password_raw=SafePassword1!").json()
    acc_token = tokens["access_token"]
    ref_token = tokens["refresh_token"]

    time.sleep(1.1)  # Ensure distinct JWT timestamp

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
    # Setup test accounts with different roles (satisfying strong password rules)
    roles_setup = [
        {"username": "usr_admin", "email": "admin@gmail.com", "password": "Pass12345", "role": "ADMIN"},
        {"username": "usr_security", "email": "security@gmail.com", "password": "Pass12345", "role": "SECURITY_OFFICER"},
        {"username": "usr_manager", "email": "manager@gmail.com", "password": "Pass12345", "role": "EVENT_MANAGER"}
    ]

    tokens_by_role = {}
    for user_info in roles_setup:
        reg_res = auth_client.post("/auth/register", json=user_info)
        assert reg_res.status_code == 201
        tok_val = [t for t, e in VERIFICATION_TOKEN_STORE.items() if e == user_info["email"]][0]
        auth_client.get(f"/auth/verify-email?token={tok_val}")

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


# ─── Forgot / Reset Password Tests ───────────────────────────────────────────

def _register_and_verify(auth_client, email: str, username: str, password: str, role: str = "SECURITY_OFFICER"):
    """Helper: registers a user, verifies their email, returns their email string."""
    auth_client.post("/auth/register", json={
        "username": username,
        "email": email,
        "password": password,
        "role": role,
    })
    token = [t for t, e in VERIFICATION_TOKEN_STORE.items() if e == email][0]
    auth_client.get(f"/auth/verify-email?token={token}")
    return email


def test_forgot_and_reset_password_flow(auth_client):
    """Full happy-path: forgot password → reset token → update password → login with new credentials."""
    email = _register_and_verify(auth_client, "reset_user@nexora.io", "reset_op", "OldPassword1")

    # 1. Confirm login works with the original password
    login_old = auth_client.post(f"/auth/login?username_email={email}&password_raw=OldPassword1")
    assert login_old.status_code == 200

    # 2. Request a password reset — always returns 200 (no email enumeration)
    forgot_res = auth_client.post("/auth/forgot-password", json={"email": email})
    assert forgot_res.status_code == 200
    assert forgot_res.json()["status"] == "SUCCESS"

    # 3. Pull the reset token from the in-memory store
    matching = [(t, r) for t, r in PASSWORD_RESET_TOKEN_STORE.items() if r["email"] == email]
    assert len(matching) == 1, "Expected exactly one active reset token"
    reset_token, _ = matching[0]

    # 4. Reset the password using the token
    reset_res = auth_client.post("/auth/reset-password", json={
        "token": reset_token,
        "new_password": "NewPassword9",
    })
    assert reset_res.status_code == 200
    assert reset_res.json()["status"] == "SUCCESS"

    # 5. Token should be consumed — attempting to reuse it must fail
    reuse_res = auth_client.post("/auth/reset-password", json={
        "token": reset_token,
        "new_password": "AnotherPassword1",
    })
    assert reuse_res.status_code == 400

    # 6. Old password must no longer work
    login_old_fail = auth_client.post(f"/auth/login?username_email={email}&password_raw=OldPassword1")
    assert login_old_fail.status_code == 401

    # 7. New password must work
    login_new = auth_client.post(f"/auth/login?username_email={email}&password_raw=NewPassword9")
    assert login_new.status_code == 200
    assert "access_token" in login_new.json()


def test_reset_password_expired_token(auth_client):
    """Expired tokens (backdated expires_at) must be rejected with HTTP 400."""
    email = _register_and_verify(auth_client, "expired_op@nexora.io", "expired_op", "ExpiredPass1")

    auth_client.post("/auth/forgot-password", json={"email": email})
    matching = [(t, r) for t, r in PASSWORD_RESET_TOKEN_STORE.items() if r["email"] == email]
    assert matching, "No reset token found after forgot-password"
    reset_token, record = matching[0]

    # Backdate the expiry to simulate a token that is 1 second past its TTL
    record["expires_at"] = time.time() - 1.0

    reset_res = auth_client.post("/auth/reset-password", json={
        "token": reset_token,
        "new_password": "NewExpiredPass1",
    })
    assert reset_res.status_code == 400
    assert "expired" in reset_res.json()["detail"].lower()

    # Expired token must be cleaned up from the store
    assert reset_token not in PASSWORD_RESET_TOKEN_STORE


def test_reset_password_invalid_token(auth_client):
    """Completely unknown tokens must be rejected with HTTP 400."""
    reset_res = auth_client.post("/auth/reset-password", json={
        "token": "totally-fake-garbage-token-xyz-123",
        "new_password": "ValidPassword1",
    })
    assert reset_res.status_code == 400
    assert "invalid" in reset_res.json()["detail"].lower()


def test_forgot_password_unknown_email_does_not_leak(auth_client):
    """Requesting reset for an unregistered email must return 200 (no enumeration leak)."""
    res = auth_client.post("/auth/forgot-password", json={"email": "nobody@doesnotexist.io"})
    assert res.status_code == 200
    assert res.json()["status"] == "SUCCESS"
    # No token should have been created for this unknown address
    assert not any(r["email"] == "nobody@doesnotexist.io" for r in PASSWORD_RESET_TOKEN_STORE.values())
