from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.auth_utils import authenticate_user, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest) -> dict:
    user = authenticate_user(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user["username"])
    return {"access_token": token, "token_type": "bearer", "role": user["role"]}


@router.get("/me")
def current_user(user: dict = Depends(get_current_user)) -> dict:
    return {"username": user["username"], "role": user["role"]}
