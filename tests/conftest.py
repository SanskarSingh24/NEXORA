"""
NEXORA Testing Suite Shared Fixtures
File: tests/conftest.py
Description: Pytest configuration, defining database session factories, mock telemetry data, 
             and FastAPI test client instances. Ensures all tests run against an isolated
             in-memory database and never write to the production/dev database.
"""

import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.auth.auth_service import (
    app as auth_app,
    USER_DB,
    REFRESH_TOKEN_STORE,
    VERIFICATION_TOKEN_STORE,
    TOKEN_BLACKLIST,
    PASSWORD_RESET_TOKEN_STORE,
    RATE_LIMIT_STORE,
    _seed_default_users,
)
from backend.alerts.alert_service import Base as AlertBase
from backend.analytics.analytics_service import Base as AnalyticsBase
from backend.camera.camera_service import (
    Base as CameraBase,
    CameraModel,
    get_db as camera_get_db,
    app as camera_app,
    GLOBAL_SYSTEM_SETTINGS,
    MOCK_CAMERA_DB,
)
import backend.camera.camera_service as camera_module
from backend.staff.staff_service import (
    Base as StaffBase,
    StaffMemberRecord,
    get_db as staff_get_db,
    app as staff_app,
)
import backend.staff.staff_service as staff_module
from backend.main import app as main_app

# Use an in-memory SQLite database with StaticPool for fast, completely isolated testing
TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    # Initialize all model schemas in test database
    AlertBase.metadata.create_all(bind=engine)
    AnalyticsBase.metadata.create_all(bind=engine)
    CameraBase.metadata.create_all(bind=engine)
    StaffBase.metadata.create_all(bind=engine)
    yield engine
    AlertBase.metadata.drop_all(bind=engine)
    AnalyticsBase.metadata.drop_all(bind=engine)
    CameraBase.metadata.drop_all(bind=engine)
    StaffBase.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function", autouse=True)
def isolate_database_and_cleanup(db_engine):
    """
    Guarantees test isolation:
    1. Overrides get_db and SessionLocal for camera, staff, and main apps to use in-memory SQLite.
    2. Sets test_mode to 'true' so camera pipeline does not open physical/network devices during tests.
    3. Cleans up all rows from the in-memory database and clears mock caches after each test.
    4. Guarantees zero writes reach the real/dev PostgreSQL database.
    """
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    # Save original configurations
    orig_cam_session = camera_module.SessionLocal
    orig_cam_engine = camera_module.engine
    orig_staff_session = staff_module.SessionLocal
    orig_staff_engine = staff_module.engine
    orig_test_mode = GLOBAL_SYSTEM_SETTINGS.get("test_mode")

    # Patch modules and override FastAPI dependencies
    camera_module.SessionLocal = TestSession
    camera_module.engine = db_engine
    staff_module.SessionLocal = TestSession
    staff_module.engine = db_engine
    GLOBAL_SYSTEM_SETTINGS["test_mode"] = "true"

    camera_app.dependency_overrides[camera_get_db] = override_get_db
    staff_app.dependency_overrides[staff_get_db] = override_get_db
    main_app.dependency_overrides[camera_get_db] = override_get_db
    main_app.dependency_overrides[staff_get_db] = override_get_db

    # Clear mock camera cache before test and ensure staff registry is initialized
    MOCK_CAMERA_DB.clear()
    staff_module.init_db(session_factory=TestSession)

    yield

    # Clean up all inserted rows in the test database
    with db_engine.connect() as conn:
        for table in reversed(CameraBase.metadata.sorted_tables):
            conn.execute(table.delete())
        for table in reversed(StaffBase.metadata.sorted_tables):
            conn.execute(table.delete())
        for table in reversed(AlertBase.metadata.sorted_tables):
            conn.execute(table.delete())
        for table in reversed(AnalyticsBase.metadata.sorted_tables):
            conn.execute(table.delete())
        conn.commit()

    # Clean up in-memory mock camera store
    MOCK_CAMERA_DB.clear()

    # Restore original configurations
    camera_module.SessionLocal = orig_cam_session
    camera_module.engine = orig_cam_engine
    staff_module.SessionLocal = orig_staff_session
    staff_module.engine = orig_staff_engine
    GLOBAL_SYSTEM_SETTINGS["test_mode"] = orig_test_mode

    camera_app.dependency_overrides.pop(camera_get_db, None)
    staff_app.dependency_overrides.pop(staff_get_db, None)
    main_app.dependency_overrides.pop(camera_get_db, None)
    main_app.dependency_overrides.pop(staff_get_db, None)


@pytest.fixture(scope="function", autouse=True)
def clean_in_memory_auth_db():
    """Reset the auth module's in-memory storage elements before each check."""
    USER_DB.clear()
    REFRESH_TOKEN_STORE.clear()
    VERIFICATION_TOKEN_STORE.clear()
    TOKEN_BLACKLIST.clear()
    PASSWORD_RESET_TOKEN_STORE.clear()
    RATE_LIMIT_STORE.clear()  # Prevent rate-limit bleed-over between tests
    _seed_default_users()
    yield


@pytest.fixture
def auth_client():
    return TestClient(auth_app)


@pytest.fixture
def mock_vision_payload():
    return {
        "zone_headcount": 28,
        "crowd_density_sqm": 1.15,
        "queue_active_count": 3,
        "entry_count": 87,
        "exit_count": 59,
        "flow_direction_vector": (1.0, -1.0) # NE direction
    }
