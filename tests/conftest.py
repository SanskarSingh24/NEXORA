"""
NEXORA Testing Suite Shared Fixtures
File: tests/conftest.py
Description: Pytest configuration, defining database session factories, mock telemetry data, 
             and FastAPI test client instances.
"""

import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.auth.auth_service import app as auth_app, USER_DB, REFRESH_TOKEN_STORE, TOKEN_BLACKLIST
from backend.alerts.alert_service import Base as AlertBase
from backend.analytics.analytics_service import Base as AnalyticsBase

# Use an in-memory SQLite database for fast unit/integration testing
TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    # Initialize all model schemas
    AlertBase.metadata.create_all(bind=engine)
    AnalyticsBase.metadata.create_all(bind=engine)
    yield engine
    AlertBase.metadata.drop_all(bind=engine)
    AnalyticsBase.metadata.drop_all(bind=engine)

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
def clean_in_memory_auth_db():
    """Reset the auth module's in-memory storage elements before each check."""
    USER_DB.clear()
    REFRESH_TOKEN_STORE.clear()
    TOKEN_BLACKLIST.clear()
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
        "flow_direction_vector": (1.0, 1.0) # NE direction
    }
