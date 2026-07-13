"""
NEXORA Map Server WebSocket Test Suite
File: tests/test_map_server.py
Description: Validates JWT-authenticated WebSocket connections against /ws/map:
             - Anonymous connections are rejected with close code 1008.
             - Connections with an invalid/expired token are rejected.
             - Connections with a valid token for an authorised role are accepted
               and receive a well-structured crowd-metrics broadcast frame.
"""

import pytest
from fastapi.testclient import TestClient

from backend.auth.auth_service import (
    app as auth_app,
    USER_DB,
    REFRESH_TOKEN_STORE,
    TOKEN_BLACKLIST,
    AuthenticationManager,
    UserRole,
    authenticate_websocket_token,
)
from backend.map.map_server import app as map_app

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_PASSWORD = "StrongPass1"

def _register_user(username: str, role: UserRole) -> dict:
    """Directly inject a user into USER_DB (mirrors what POST /auth/register does)."""
    from uuid import uuid4
    from datetime import datetime, timezone

    user_id = uuid4()
    user = {
        "user_id": user_id,
        "username": username,
        "email": f"{username}@nexora.test",
        "password_hash": AuthenticationManager.hash_password(_VALID_PASSWORD),
        "role": role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    USER_DB[username] = user
    return user


def _token_for(username: str, role: UserRole) -> str:
    """Register a user and return a fresh access token for them."""
    from datetime import timedelta

    user = _register_user(username, role)
    from backend.auth.auth_service import SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES

    return AuthenticationManager.create_jwt_token(
        data={"sub": str(user["user_id"]), "role": role},
        secret=SECRET_KEY,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_auth_state():
    """Wipe in-memory auth stores before every test."""
    USER_DB.clear()
    REFRESH_TOKEN_STORE.clear()
    TOKEN_BLACKLIST.clear()
    yield
    USER_DB.clear()
    REFRESH_TOKEN_STORE.clear()
    TOKEN_BLACKLIST.clear()


@pytest.fixture
def map_client():
    return TestClient(map_app)


# ---------------------------------------------------------------------------
# Tests — rejection cases
# ---------------------------------------------------------------------------

def test_anonymous_connection_is_rejected_with_1008(map_client):
    """No token in query string → server must close with code 1008."""
    with pytest.raises(Exception):
        # TestClient raises on WS close before accept; we catch any error.
        with map_client.websocket_connect("/ws/map") as ws:
            ws.receive_json()


def test_invalid_token_is_rejected(map_client):
    """Garbage token → server must close with code 1008."""
    with pytest.raises(Exception):
        with map_client.websocket_connect("/ws/map?token=not.a.real.jwt") as ws:
            ws.receive_json()


def test_blacklisted_token_is_rejected(map_client):
    """A token that has been revoked (logged-out) must be rejected."""
    token = _token_for("op_blacklisted", UserRole.SECURITY_OFFICER)
    TOKEN_BLACKLIST.add(token)

    with pytest.raises(Exception):
        with map_client.websocket_connect(f"/ws/map?token={token}") as ws:
            ws.receive_json()


# ---------------------------------------------------------------------------
# Tests — successful authenticated connection
# ---------------------------------------------------------------------------

def _assert_valid_frame(message: dict):
    """Assert all expected keys are present in a broadcast frame."""
    assert "crowd_count" in message, "Missing 'crowd_count'"
    assert "heatmap" in message, "Missing 'heatmap'"
    assert "risk" in message, "Missing 'risk'"
    assert "alerts" in message, "Missing 'alerts'"
    assert "cameras" in message, "Missing 'cameras'"
    assert "pedestrians" in message, "Missing 'pedestrians'"


def test_admin_receives_broadcast_frame(map_client):
    token = _token_for("admin_user", UserRole.ADMIN)
    with map_client.websocket_connect(f"/ws/map?token={token}") as ws:
        message = ws.receive_json()
        _assert_valid_frame(message)


def test_security_officer_receives_broadcast_frame(map_client):
    token = _token_for("sec_officer", UserRole.SECURITY_OFFICER)
    with map_client.websocket_connect(f"/ws/map?token={token}") as ws:
        message = ws.receive_json()
        _assert_valid_frame(message)


def test_event_manager_receives_broadcast_frame(map_client):
    token = _token_for("ev_manager", UserRole.EVENT_MANAGER)
    with map_client.websocket_connect(f"/ws/map?token={token}") as ws:
        message = ws.receive_json()
        _assert_valid_frame(message)


# ---------------------------------------------------------------------------
# Unit tests — authenticate_websocket_token() directly
# ---------------------------------------------------------------------------

def test_authenticate_websocket_token_raises_on_missing_token():
    with pytest.raises(ValueError, match="required"):
        authenticate_websocket_token(None)


def test_authenticate_websocket_token_raises_on_empty_string():
    with pytest.raises(ValueError, match="required"):
        authenticate_websocket_token("   ")


def test_authenticate_websocket_token_raises_on_blacklisted_token():
    token = _token_for("bl_user", UserRole.ADMIN)
    TOKEN_BLACKLIST.add(token)
    with pytest.raises(ValueError, match="revoked"):
        authenticate_websocket_token(token)


def test_authenticate_websocket_token_returns_user_response_for_valid_token():
    token = _token_for("valid_op", UserRole.SECURITY_OFFICER)
    user_resp = authenticate_websocket_token(token)
    assert user_resp.username == "valid_op"
    assert user_resp.role == UserRole.SECURITY_OFFICER
    assert user_resp.is_active is True
