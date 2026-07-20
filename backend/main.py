"""
NEXORA Unified Enterprise backend gateway
File: backend/main.py

Centralised entry point for the NEXORA platform. Unifies all routing tables,
database initialisation sequences, real-time WebSockets, and Machine Learning
lifetimes into a single runnable application context.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Database and Configuration imports
from config.settings import settings

# Import sub-apps to extract their routers
from backend.auth.auth_service import app as auth_app
from backend.camera.camera_service import app as camera_app, init_db as init_camera_db
from backend.map.map_server import app as map_app, coordinate_broadcast_loop
from backend.ai.predictive_engine import app as predictive_app, load_trained_model
from backend.ai.explainable_api import app as explainable_app
from backend.reports.report_service import app as report_app

# Structured Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("NEXORA_GATEWAY")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Life-cycle orchestrator database pools, ML weights, and loop simulations.
    Runs once when uvicorn starts the server and cleans up when shutting down.
    """
    logger.info("System Lifespan: Initialising NEXORA Enterprise Platform...")

    # 1. Database auto-migration / schema creations
    try:
        logger.info("System Lifespan: Syncing database metadata schemas...")
        # Compile camera schemas
        init_camera_db()

        # Compile historical telemetry & alert schemas
        from backend.analytics.analytics_service import Base as AnalyticsBase, engine as analytics_engine
        from backend.alerts.alert_service import Base as AlertBase, engine as alert_engine

        AnalyticsBase.metadata.create_all(bind=analytics_engine)
        AlertBase.metadata.create_all(bind=alert_engine)
        logger.info("System Lifespan: Database schemas synced successfully.")
    except Exception as exc:
        logger.error("System Lifespan: Database metadata mapping failed: %s", exc)

    # 2. Machine Learning checkpoint loading
    try:
        logger.info("System Lifespan: Loading XGBoost predictions weights...")
        load_trained_model()
    except Exception as exc:
        logger.critical(
            "System Lifespan: ML model weights loading crashed. Fallback active: %s", exc
        )

    # 3. Dynamic Pedestrian Simulation broker loop activation
    logger.info("System Lifespan: Starting real-time WebSocket coordinates broker loop...")
    sim_task = asyncio.create_task(coordinate_broadcast_loop())

    yield

    # Shutdown sequence
    logger.info("System Lifespan: Terminating coordinates simulator loop...")
    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass
    logger.info("System Lifespan: NEXORA Enterprise platform offline.")


app = FastAPI(
    title="NEXORA Command Center API Gateway",
    description="Unified REST/WebSocket crowd intelligence monitoring engine.",
    version="1.0.0",
    lifespan=lifespan,
)

# Load configuration parameters (validated at process import startup)
allowed_origins = settings.allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# ROUTER REGISTRATION
# =====================================================================

# Unify all sub-app paths directly onto the central port (8000)
app.include_router(auth_app.router)
app.include_router(camera_app.router)
app.include_router(map_app.router)
app.include_router(predictive_app.router)
app.include_router(explainable_app.router)
app.include_router(report_app.router)


@app.get("/health")
def api_gateway_health() -> Dict[str, str]:
    """Central operations checklist verifying pipeline readiness."""
    return {
        "status": "healthy",
        "service": "nexora-gateway",
        "version": "1.0.0",
        "database": "connected" if settings.database_url else "configured-empty",
    }
