"""
NEXORA JWT Authentication & Role-Based Access Control (RBAC) Module
File: backend/auth/auth_service.py
Description: Production-ready Python FastAPI service implementing secure JWT login, logout, 
             refresh token flow, password hashing, and role-based route protection.
"""

import os  # retained for other stdlib uses

from config.settings import settings
import re
import time
import logging
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Dict, List, Optional, Set
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Security, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError
from passlib.context import CryptContext
from pydantic import BaseModel, Field, validator

try:
    import bcrypt
except ImportError:  # pragma: no cover - runtime fallback
    bcrypt = None

# =====================================================================
# 0. LOW-LATENCY AUDIT LOGGING SYSTEM
# =====================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [AUDIT] %(message)s",
    handlers=[
        logging.FileHandler("security_audit.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("NEXORA_SECURITY")

# =====================================================================
# 1. PLATFORM CONFIGURATION & SECURITY PARAMS
# =====================================================================

# Configuration is loaded centrally from config.settings.
# If any required variable is absent the process exits at startup with a clear error.
SECRET_KEY: str = settings.jwt_secret
REFRESH_SECRET_KEY: str = settings.refresh_secret
ALGORITHM: str = settings.jwt_algorithm

ACCESS_TOKEN_EXPIRE_MINUTES: int = settings.access_token_expire_minutes
REFRESH_TOKEN_EXPIRE_DAYS: int = settings.refresh_token_expire_days

# =====================================================================
# 2. ENUMS & DATA MODELS
# =====================================================================

class UserRole(str, Enum):
    ADMIN = "ADMIN"
    SECURITY_OFFICER = "SECURITY_OFFICER"
    EVENT_MANAGER = "EVENT_MANAGER"


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8)
    role: UserRole

    @validator("username")
    def sanitize_username(cls, v):
        # Strict input validation: prevent common script/HTML injection chars to prevent XSS/SQL Injection
        if re.search(r"[<>&'/\"#;]", v):
            logger.warning(f"Security Alert: XSS/SQL Injection attempt blocked. Invalid username input string: '{v}'")
            raise ValueError("Username contains forbidden characters to prevent XSS/SQL Injection.")
        return v
    
    @validator("password")
    def validate_password_strength(cls, v):
        # Enforce strong alphanumeric password requirements
        if not re.search(r"[A-Z]", v) or not re.search(r"[a-z]", v) or not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one uppercase, one lowercase letter, and one number.")
        return v

    @validator("email")
    def validate_email_format(cls, v):
        if "@" not in v or v.count("@") != 1:
            raise ValueError("Email must contain exactly one @ symbol.")
        local_part, domain = v.split("@", 1)
        if not local_part or not domain or "." not in domain:
            raise ValueError("Email must include a valid domain with a dot.")
        return v


class UserResponse(BaseModel):
    user_id: UUID
    username: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # in seconds


class TokenRefreshRequest(BaseModel):
    refresh_token: str


# In-memory storage components for mock/demonstration purposes.
# In a production environment, this is replaced by database calls (PostgreSQL/Redis).
USER_DB: Dict[str, dict] = {}
REFRESH_TOKEN_STORE: Dict[str, str] = {}  # refresh_token -> user_id
TOKEN_BLACKLIST: Set[str] = set()

# ─── Seed a default admin account for development / demo ────────────────────
# Credentials: username=admin  password=StrongPass1
# These match the pre-filled values in react_dashboard.html.
def _seed_default_users() -> None:
    from uuid import uuid4
    from datetime import datetime, timezone
    _ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    _users = [
        {
            "email": "admin@nexora.com",
            "username": "admin",
            "password": "StrongPass1",
            "role": "ADMIN",
        },
        {
            "email": "admin@nexora.local",
            "username": "admin",
            "password": "StrongPass1",
            "role": "ADMIN",
        },
        {
            "email": "operator@nexora.com",
            "username": "operator",
            "password": "StrongPass1",
            "role": "SECURITY_OFFICER",
        },
        {
            "email": "operator@nexora.local",
            "username": "operator",
            "password": "StrongPass1",
            "role": "SECURITY_OFFICER",
        },
    ]
    for u in _users:
        if u["email"] not in USER_DB:
            USER_DB[u["email"]] = {
                "user_id": uuid4(),
                "username": u["username"],
                "email": u["email"],
                "password_hash": _ctx.hash(u["password"]),
                "role": u["role"],
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
            }

_seed_default_users()
# ────────────────────────────────────────────────────────────────────────────

# =====================================================================
# 3. CRYPTOGRAPHY & UTILITIES
# =====================================================================

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security_bearer = HTTPBearer()

class AuthenticationManager:
    @staticmethod
    def hash_password(password: str) -> str:
        """Generates a secure BCrypt hash of the pass string."""
        try:
            return pwd_context.hash(password)
        except Exception:
            if bcrypt is None:
                raise
            return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verifies clear password strings against the target BCrypt hash."""
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception:
            if bcrypt is None:
                return False
            try:
                return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
            except Exception:
                return False

    @staticmethod
    def create_jwt_token(data: dict, secret: str, expires_delta: timedelta) -> str:
        """Generates a signed JWT token containing custom claim payloads."""
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + expires_delta
        to_encode.update({"exp": int(expire.timestamp())})
        return jwt.encode(to_encode, secret, algorithm=ALGORITHM)

    @staticmethod
    def decode_jwt_token(token: str, secret: str) -> dict:
        """Decodes token structures while checking safety boundaries."""
        try:
            payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
            return payload
        except ExpiredSignatureError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired. Please log in again or refresh the session.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e
        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Security validation failed: Invalid token signature.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e


# =====================================================================
# 4. DEPENDENCY INJECTION GUARDS (RBAC)
# =====================================================================

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_bearer)) -> UserResponse:
    """Security Dependency injecting details of the currently authorized HTTP User."""
    token = credentials.credentials
    
    # Check blacklist for logged-out tokens
    if token in TOKEN_BLACKLIST:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired: This token has been blacklisted via user logout.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    payload = AuthenticationManager.decode_jwt_token(token, SECRET_KEY)
    user_id_str: Optional[str] = payload.get("sub")
    
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Claims: User identifier metadata missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Search Database
    user_records = [u for u in USER_DB.values() if str(u["user_id"]) == user_id_str]
    if not user_records:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Client not registered: Active user record was not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user = user_records[0]
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User status suspended. Access denied.",
        )
        
    return UserResponse(
        user_id=user["user_id"],
        username=user["username"],
        email=user["email"],
        role=user["role"],
        is_active=user["is_active"],
        created_at=user["created_at"],
    )


class RoleChecker:
    """RBAC dynamic dependency class validating roles metrics boundary entries."""
    def __init__(self, allowed_roles: List[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Role {current_user.role} lacks sufficient privilege.",
            )
        return current_user


# =====================================================================
# 4b. REUSABLE WEBSOCKET JWT VALIDATOR
# =====================================================================

# Roles that are permitted to open a WebSocket stream connection.
WS_ALLOWED_ROLES: set = {
    UserRole.ADMIN,
    UserRole.SECURITY_OFFICER,
    UserRole.EVENT_MANAGER,
}

_ws_logger = logging.getLogger("NEXORA_WS_AUTH")


def authenticate_websocket_token(token: Optional[str]) -> UserResponse:
    """
    Validates a raw JWT string for WebSocket connections.

    Full verification chain:
      1. Token presence check.
      2. Token blacklist (revoked via logout) check.
      3. JWT decode — verifies signature and expiration via python-jose.
      4. 'sub' (user_id) claim presence check.
      5. User lookup in USER_DB.
      6. User active-status check.
      7. Role authorization check against WS_ALLOWED_ROLES.

    Returns:
        UserResponse: Fully validated user object on success.

    Raises:
        ValueError: With a human-readable reason on any failure so the
                    caller can close the WebSocket with code 1008.
    """
    # 1. Token must be present
    if not token or not token.strip():
        _ws_logger.warning("WS Auth: Rejected — missing token.")
        raise ValueError("Authentication token is required.")

    # 2. Blacklist check (tokens invalidated by logout)
    if token in TOKEN_BLACKLIST:
        _ws_logger.warning("WS Auth: Rejected — token is blacklisted (logged-out session).")
        raise ValueError("Token has been revoked. Please log in again.")

    # 3. Decode JWT — jose raises JWTError on bad signature or expiry,
    #    which AuthenticationManager wraps into HTTPException. We re-catch
    #    it here to surface it as a plain ValueError for WS callers.
    try:
        payload = AuthenticationManager.decode_jwt_token(token, SECRET_KEY)
    except HTTPException as exc:
        detail = str(exc.detail)
        if "expired" in detail.lower():
            _ws_logger.warning("WS Auth: Rejected — token expired: %s", detail)
            raise ValueError(detail) from exc
        _ws_logger.warning("WS Auth: Rejected — JWT decode failed: %s", detail)
        raise ValueError(detail) from exc

    # 4. Subject claim
    user_id_str: Optional[str] = payload.get("sub")
    if not user_id_str:
        _ws_logger.warning("WS Auth: Rejected — 'sub' claim missing from token payload.")
        raise ValueError("Invalid token: user identifier claim is missing.")

    # 5. User lookup
    user_records = [u for u in USER_DB.values() if str(u["user_id"]) == user_id_str]
    if not user_records:
        _ws_logger.warning(
            "WS Auth: Rejected — user_id=%s not found in registry.", user_id_str
        )
        raise ValueError("Authenticated user record not found.")

    user = user_records[0]

    # 6. Active status
    if not user.get("is_active", True):
        _ws_logger.warning(
            "WS Auth: Rejected — user_id=%s account is suspended.", user_id_str
        )
        raise ValueError("User account is suspended.")

    # 7. Role enforcement
    user_role = UserRole(user["role"]) if not isinstance(user["role"], UserRole) else user["role"]
    if user_role not in WS_ALLOWED_ROLES:
        _ws_logger.warning(
            "WS Auth: Rejected — user_id=%s has unauthorized role '%s'.",
            user_id_str,
            user_role,
        )
        raise ValueError(
            f"Role '{user_role}' is not authorized to access live WebSocket streams."
        )

    _ws_logger.info(
        "WS Auth: Granted — user_id=%s username='%s' role=%s.",
        user_id_str,
        user.get("username", "unknown"),
        user_role,
    )

    return UserResponse(
        user_id=user["user_id"],
        username=user["username"],
        email=user["email"],
        role=user_role,
        is_active=user["is_active"],
        created_at=user["created_at"],
    )


# =====================================================================
# 5. FASTAPI APPLICATION ENDPOINTS
# =====================================================================

app = FastAPI(title="NEXORA Auth Engine", version="1.0.0")

# CORS origins sourced from centralised settings (validated at startup)
allowed_origins: list = settings.allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

# Custom Http Security Headers Middleware: MITM and XSS mitigations
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Sliding Window IP Rate Limiter to block automated credentials attacks
RATE_LIMIT_STORE: Dict[str, List[float]] = {}
LIMIT_MAX_REQUESTS = 30     # Max requests
LIMIT_WINDOW_SECS = 60      # Timeframe window in seconds

def enforce_rate_limit(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    
    timestamps = RATE_LIMIT_STORE.get(client_ip, [])
    timestamps = [t for t in timestamps if now - t < LIMIT_WINDOW_SECS]
    
    if len(timestamps) >= LIMIT_MAX_REQUESTS:
        logger.warning(f"Rate Limiter: Blocked IP {client_ip} exceeding quota thresholds.")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please back off and try again later."
        )
        
    timestamps.append(now)
    RATE_LIMIT_STORE[client_ip] = timestamps


@app.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(enforce_rate_limit)])
async def register(user_in: UserCreate):
    """Registers new user profiles securely inside database."""
    logger.info(f"Audit Trail: Registration request received for: {user_in.email}")
    if user_in.email in USER_DB:
        logger.warning(f"Audit Trail: Registration FAILED. Email overlap: {user_in.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_LENGTH,
            detail="Integrity violation: Target email registry already exists.",
        )
        
    new_user = {
        "user_id": uuid4(),
        "username": user_in.username,
        "email": user_in.email,
        "password_hash": AuthenticationManager.hash_password(user_in.password),
        "role": user_in.role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    
    USER_DB[user_in.email] = new_user
    logger.info(f"Audit Trail: Registration SUCCESS for ID: {new_user['user_id']} ({user_in.email})")
    return UserResponse(**new_user)


@app.post("/auth/login", response_model=TokenResponse, dependencies=[Depends(enforce_rate_limit)])
async def login(username_email: str, password_raw: str):
    """Verifies credentials, generates access elements, and tracks sessions."""
    logger.info(f"Audit Trail: Login attempt initiated for: {username_email}")
    # Find user record by email or username
    user = USER_DB.get(username_email)
    if not user:
        # Search by username as fallback
        matched = [u for u in USER_DB.values() if u["username"] == username_email]
        if matched:
            user = matched[0]
            
    if not user or not AuthenticationManager.verify_password(password_raw, user["password_hash"]):
        logger.warning(f"Audit Trail: Login FAILED (Invalid credentials) for: {username_email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed: Invalid credentials provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user["is_active"]:
        logger.warning(f"Audit Trail: Login BLOCKED (Suspended profile) for: {username_email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User status suspended. Access denied.",
        )
        
    user_id_str = str(user["user_id"])
    
    # Create Tokens
    access_token = AuthenticationManager.create_jwt_token(
        data={"sub": user_id_str, "role": user["role"]},
        secret=SECRET_KEY,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    refresh_token = AuthenticationManager.create_jwt_token(
        data={"sub": user_id_str},
        secret=REFRESH_SECRET_KEY,
        expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )
    
    # Store refresh token mapping in Database/Cache
    REFRESH_TOKEN_STORE[refresh_token] = user_id_str
    
    logger.info(f"Audit Trail: Login SUCCESS for user ID: {user_id_str} ({user['email']})")
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@app.post("/auth/token/refresh", response_model=TokenResponse, dependencies=[Depends(enforce_rate_limit)])
async def refresh_tokens(payload: TokenRefreshRequest):
    """Processes refresh requests to issue new short-lived access tokens."""
    ref_token = payload.refresh_token
    logger.info("Audit Trail: Token refresh rotation requested.")
    
    # Fetch mapping and check if it exists in the active session store
    user_id_str = REFRESH_TOKEN_STORE.get(ref_token)
    if not user_id_str:
        logger.warning("Audit Trail: Token refresh FAILED (Refresh token key invalid/expired).")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Session: Session key was not found or expired.",
        )
        
    # Verify claims signature parameters
    decoded = AuthenticationManager.decode_jwt_token(ref_token, REFRESH_SECRET_KEY)
    if decoded.get("sub") != user_id_str:
         logger.warning("Audit Trail: Token refresh FAILED (Payload sub claims mismatch).")
         raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Session Token: payload integrity mismatch.",
        )
         
    # Query current user state
    user_records = [u for u in USER_DB.values() if str(u["user_id"]) == user_id_str]
    if not user_records or not user_records[0]["is_active"]:
         raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Revoked: profile state no longer active.",
        )
         
    user = user_records[0]
    
    # Rotate refresh key and issue new tokens (Token Rotation security practice)
    del REFRESH_TOKEN_STORE[ref_token]
    
    new_access_token = AuthenticationManager.create_jwt_token(
        data={"sub": user_id_str, "role": user["role"]},
        secret=SECRET_KEY,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    new_refresh_token = AuthenticationManager.create_jwt_token(
        data={"sub": user_id_str},
        secret=REFRESH_SECRET_KEY,
        expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )
    
    REFRESH_TOKEN_STORE[new_refresh_token] = user_id_str
    
    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@app.post("/auth/logout", status_code=status.HTTP_200_OK)
async def logout(
    payload: TokenRefreshRequest, 
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer)
):
    """Revokes active access tokens and destroys refresh links."""
    ref_token = payload.refresh_token
    access_token = credentials.credentials
    
    # 1. Invalidates access tokens by adding them to the blacklist
    TOKEN_BLACKLIST.add(access_token)
    
    # 2. Removes the active refresh token from the validation store
    if ref_token in REFRESH_TOKEN_STORE:
        del REFRESH_TOKEN_STORE[ref_token]
        
    return {"status": "SUCCESS", "message": "Tokens revoked. Operator session terminated."}


# =====================================================================
# 6. ROUTE DEMONSTRATIONS (ROLE-BASED ENDPOINTS)
# =====================================================================

@app.get("/telemetry/system-status")
async def get_system_telemetry(
    user: UserResponse = Depends(RoleChecker([UserRole.ADMIN, UserRole.SECURITY_OFFICER, UserRole.EVENT_MANAGER]))
):
    """Accessible by any authenticated roles: Admin, Security Officer, or Event Manager."""
    return {
        "access_granted_to": user.username,
        "caller_role": user.role,
        "system_status": "NORMAL",
        "cpu_load": "14.2%",
        "active_vision_streams": 182
    }


@app.get("/incident/override-rules")
async def trigger_routing_actions(
    user: UserResponse = Depends(RoleChecker([UserRole.SECURITY_OFFICER, UserRole.ADMIN]))
):
    """Accessible only by Security Officers and Admins."""
    return {
        "access_granted_to": user.username,
        "caller_role": user.role,
        "incident_action": "ROUTING_PARAMETERS_OVERRIDE_ENABLED",
        "authorized_bypass": True
    }


@app.get("/admin/system-calibrations")
async def admin_calibration_action(
    user: UserResponse = Depends(RoleChecker([UserRole.ADMIN]))
):
    """Accessible only by Admins."""
    logger.info(f"Audit Trail: ADMIN system calibration access GRANTED to: {user.username} (ID: {user.user_id})")
    return {
        "access_granted_to": user.username,
        "caller_role": user.role,
        "administration_clearance": "GRANTED",
        "available_actions": ["SET_SYSTEM_DENSITY", "REGISTER_CAMERA", "USER_MANAGEMENT"]
    }
