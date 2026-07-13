"""
NEXORA Platform — Centralised Configuration
File: config/settings.py

Loads all runtime configuration from environment variables (or a .env file
in development).  Required variables have NO fallback value; a missing
variable raises a ValidationError at process startup with a clear message
identifying which variable is absent.

Usage
-----
    from config.settings import settings

    # Access any value:
    settings.jwt_secret          # str
    settings.database_url        # str
    settings.access_token_expire_minutes  # int

The module-level `settings` singleton is created once when the module is
first imported, so the startup validation runs exactly once per process.
"""

from __future__ import annotations

import sys
from typing import List

from pydantic import Field, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application-wide configuration loaded from environment variables.

    Pydantic-Settings reads from:
      1. Environment variables (highest priority).
      2. A .env file in the current working directory (development convenience).

    Any field that has no `default` is *required*.  If that variable is absent
    at startup, Pydantic raises a ValidationError listing every missing field
    before a single request is handled.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,   # NEXORA_JWT_SECRET == nexora_jwt_secret
        extra="ignore",         # silently ignore unknown env vars
    )

    # ------------------------------------------------------------------
    # Security — REQUIRED, no defaults
    # ------------------------------------------------------------------

    jwt_secret: str = Field(
        ...,
        alias="NEXORA_JWT_SECRET",
        min_length=32,
        description="HS256 signing secret for access tokens. Minimum 32 characters.",
    )

    refresh_secret: str = Field(
        ...,
        alias="NEXORA_REFRESH_SECRET",
        min_length=32,
        description="HS256 signing secret for refresh tokens. Must differ from jwt_secret.",
    )

    # ------------------------------------------------------------------
    # Database — REQUIRED, no defaults
    # ------------------------------------------------------------------

    database_url: str = Field(
        ...,
        alias="NEXORA_DB_URL",
        description=(
            "PostgreSQL connection string. "
            "Format: postgresql://user:password@host:port/dbname"
        ),
    )

    # ------------------------------------------------------------------
    # ML Model — REQUIRED, no defaults
    # ------------------------------------------------------------------

    ml_model_path: str = Field(
        ...,
        alias="NEXORA_ML_MODEL_PATH",
        description="Filesystem path to the trained XGBoost model file (.joblib / .json).",
    )

    # ------------------------------------------------------------------
    # JWT token lifetimes — optional, safe explicit defaults
    # ------------------------------------------------------------------

    access_token_expire_minutes: int = Field(
        default=15,
        alias="NEXORA_ACCESS_TOKEN_EXPIRE_MINUTES",
        ge=1,
        le=60,
        description="Lifetime of access tokens in minutes (1–60). Default: 15.",
    )

    refresh_token_expire_days: int = Field(
        default=7,
        alias="NEXORA_REFRESH_TOKEN_EXPIRE_DAYS",
        ge=1,
        le=30,
        description="Lifetime of refresh tokens in days (1–30). Default: 7.",
    )

    # ------------------------------------------------------------------
    # JWT algorithm — optional, explicit safe default
    # ------------------------------------------------------------------

    jwt_algorithm: str = Field(
        default="HS256",
        alias="NEXORA_JWT_ALGORITHM",
        description="JWT signing algorithm. Default: HS256.",
    )

    # ------------------------------------------------------------------
    # CORS — optional, restrictive default (localhost dev only)
    # ------------------------------------------------------------------

    allowed_origins_raw: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="NEXORA_ALLOWED_ORIGINS",
        description="Comma-separated list of allowed CORS origins.",
    )

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("database_url")
    @classmethod
    def database_url_must_be_postgres(cls, v: str) -> str:
        if not v.startswith(("postgresql://", "postgresql+asyncpg://", "postgresql+psycopg2://")):
            raise ValueError(
                "NEXORA_DB_URL must be a PostgreSQL connection string "
                "(starts with 'postgresql://')."
            )
        return v

    @field_validator("jwt_algorithm")
    @classmethod
    def algorithm_must_be_supported(cls, v: str) -> str:
        supported = {"HS256", "HS384", "HS512"}
        if v not in supported:
            raise ValueError(
                f"NEXORA_JWT_ALGORITHM '{v}' is not supported. "
                f"Choose one of: {', '.join(sorted(supported))}."
            )
        return v

    @model_validator(mode="after")
    def secrets_must_differ(self) -> "Settings":
        if self.jwt_secret == self.refresh_secret:
            raise ValueError(
                "NEXORA_JWT_SECRET and NEXORA_REFRESH_SECRET must be different values. "
                "Using the same secret for both token types weakens security."
            )
        return self

    # ------------------------------------------------------------------
    # Derived properties (computed, not stored as fields)
    # ------------------------------------------------------------------

    @property
    def allowed_origins(self) -> List[str]:
        """Return CORS origins as a parsed list, stripping whitespace."""
        return [o.strip() for o in self.allowed_origins_raw.split(",") if o.strip()]


# ---------------------------------------------------------------------------
# Module-level singleton — validation runs here, once, at import time.
# A missing required variable prints a clear error and exits the process
# before any FastAPI app or DB engine is constructed.
# ---------------------------------------------------------------------------

def _load_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        # Format the error into a readable startup message.
        missing = []
        invalid = []
        for error in exc.errors():
            loc = " → ".join(str(l) for l in error["loc"])
            if error["type"] == "missing":
                missing.append(f"  • {loc}")
            else:
                invalid.append(f"  • {loc}: {error['msg']}")

        lines = ["", "=" * 70, "NEXORA STARTUP ERROR — Configuration validation failed.", "=" * 70]
        if missing:
            lines.append("\nMISSING required environment variables:")
            lines.extend(missing)
            lines.append(
                "\nSet these variables in your shell or in a .env file before starting.\n"
                "See .env.example for the full list of supported variables."
            )
        if invalid:
            lines.append("\nINVALID environment variable values:")
            lines.extend(invalid)
        lines.append("=" * 70 + "\n")

        print("\n".join(lines), file=sys.stderr)
        sys.exit(1)


settings: Settings = _load_settings()
