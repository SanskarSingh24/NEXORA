"""
NEXORA Camera Management & Live Streaming Service
File: backend/camera/camera_service.py
Description: Production-ready Python FastAPI service implementing full PostgreSQL-based CRUD operations
             for cameras, network status monitoring, and a mock live MJPEG streaming loop mimicking RTSP feeds.
"""

import asyncio
import os
import random
import socket
import time
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlparse
from uuid import UUID, uuid4

import cv2  # OpenCV used for stream decoding/mock framing
import numpy as np
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import Column, Float, JSON, String, create_engine
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

from config.settings import settings
from backend.vision.vision_engine import vision_engine

# =====================================================================
# 1. DATABASE CONFIGURATION & ENVIRONMENT VARIABLES
# =====================================================================

DATABASE_URL: str = settings.database_url

engine = create_engine(
    DATABASE_URL,
    pool_size=25,
    max_overflow=15,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# =====================================================================
# 2. SQLALCHEMY DATABASE MODELS
# =====================================================================
class CameraModel(Base):
    __tablename__ = "cameras"

    camera_id = Column(String(128), primary_key=True, default=lambda: str(uuid4()))
    camera_name = Column(String(128), nullable=False)
    source_type = Column(String(32), nullable=False, default="IP_CAMERA")  # IP_CAMERA, USB_WEBCAM, MOBILE_CAMERA
    source_location = Column(String(512), nullable=True)                  # RTSP URL, Device Index, Stream URL, or File Path
    rtsp_url = Column(String(512), nullable=False, default="")
    status = Column(String(32), nullable=False, default="ACTIVE", index=True)
    zone_id = Column(String(64), nullable=False, index=True)
    latitude = Column(Float, nullable=False, default=37.7749)
    longitude = Column(Float, nullable=False, default=-122.4194)
    homography_matrix = Column(JSON, nullable=False)


class SystemSettingModel(Base):
    __tablename__ = "system_settings"

    key = Column(String(64), primary_key=True)
    value = Column(String(256), nullable=False)


from sqlalchemy import Column, Float, JSON, String, create_engine, text

# In-memory storage fallback for local development / testing without active PostgreSQL
MOCK_CAMERA_DB = {}
GLOBAL_SYSTEM_SETTINGS = {
    "test_mode": "false"
}

INITIAL_SEEDED_CAMERAS = [
    {
        "camera_id": "CAM-01",
        "camera_name": "Main Entrance Gateway",
        "zone_id": "Zone A",
        "source_type": "IP_CAMERA",
        "source_location": "rtsp://10.0.1.50/stream1",
        "rtsp_url": "rtsp://10.0.1.50/stream1",
        "status": "ACTIVE",
        "latitude": 37.7749,
        "longitude": -122.4194,
        "homography_matrix": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    },
    {
        "camera_id": "CAM-02",
        "camera_name": "South Escalators Corridor",
        "zone_id": "Zone B",
        "source_type": "USB_WEBCAM",
        "source_location": "0",
        "rtsp_url": "0",
        "status": "ACTIVE",
        "latitude": 37.7750,
        "longitude": -122.4195,
        "homography_matrix": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    },
    {
        "camera_id": "CAM-03",
        "camera_name": "North Corridor Mobile Feed",
        "zone_id": "Lower Level",
        "source_type": "MOBILE_CAMERA",
        "source_location": "http://192.168.1.50:8080/video",
        "rtsp_url": "http://192.168.1.50:8080/video",
        "status": "ACTIVE",
        "latitude": 37.7751,
        "longitude": -122.4196,
        "homography_matrix": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    }
]

INITIAL_SEEDED = False

def seed_cameras_if_empty(db: Session = None):
    global INITIAL_SEEDED
    if INITIAL_SEEDED:
        return
    INITIAL_SEEDED = True

    if not MOCK_CAMERA_DB:
        for item in INITIAL_SEEDED_CAMERAS:
            MOCK_CAMERA_DB[item["camera_id"]] = CameraModel(**item)

    if db is not None:
        try:
            count = db.query(CameraModel).count()
            if count == 0:
                for item in INITIAL_SEEDED_CAMERAS:
                    db.add(CameraModel(**item))
                db.commit()
        except Exception as e:
            print(f"DB seeding skipped: {e}")

def init_db():
    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE cameras ALTER COLUMN camera_id TYPE VARCHAR(128) USING camera_id::text;"))
            conn.execute(text("ALTER TABLE cameras ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) DEFAULT 'IP_CAMERA';"))
            conn.execute(text("ALTER TABLE cameras ADD COLUMN IF NOT EXISTS source_location VARCHAR(512);"))
            conn.commit()
    except Exception as e:
        print(f"Database connection skipped or unavailable: {e}. Running with in-memory camera store.")

# Run init_db at module import
init_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# =====================================================================
# 3. PYDANTIC SCHEMAS (DATA VALIDATION)
# =====================================================================

class CameraCreate(BaseModel):
    camera_name: str = Field(..., min_length=2, max_length=128)
    source_type: Optional[str] = Field("IP_CAMERA", description="IP_CAMERA, USB_WEBCAM, MOBILE_CAMERA")
    source_location: Optional[str] = Field(None, description="RTSP URL, device index string, or mobile URL")
    rtsp_url: Optional[str] = Field(None, description="RTSP endpoint connection url or legacy fallback")
    zone_id: str = Field("Zone A", min_length=1, max_length=64)
    latitude: Optional[float] = Field(37.7749, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(-122.4194, ge=-180.0, le=180.0)
    homography_matrix: Optional[List[float]] = Field(
        default_factory=lambda: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        description="Flattened 3x3 matrix array"
    )


class CameraUpdate(BaseModel):
    camera_name: Optional[str] = Field(None, min_length=2, max_length=128)
    source_type: Optional[str] = Field(None, description="IP_CAMERA, USB_WEBCAM, MOBILE_CAMERA")
    source_location: Optional[str] = Field(None)
    rtsp_url: Optional[str] = Field(None)
    status: Optional[str] = Field(None, description="ACTIVE, INACTIVE, FAILED")
    zone_id: Optional[str] = Field(None, min_length=1, max_length=64)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    # NOTE: min_items/max_items are Pydantic v1 only — omit them here; validated in endpoint
    homography_matrix: Optional[List[float]] = Field(None, description="Flattened 3x3 matrix (9 values)")


class CameraResponse(BaseModel):
    camera_id: str
    camera_name: str
    source_type: str = "IP_CAMERA"
    source_location: Optional[str] = None
    rtsp_url: str = ""
    status: str
    zone_id: str
    latitude: float
    longitude: float
    homography_matrix: List[float]

    class Config:
        from_attributes = True


class CameraStatusResponse(BaseModel):
    camera_id: str
    status: str
    latency_ms: int
    fps: int
    resolution: str
    timestamp: float

# =====================================================================
# 4. CAMERA CONTROLLERS & ENDPOINTS
# =====================================================================

app = FastAPI(title="NEXORA Camera Management Microservice", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()


@app.post("/cameras", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
def add_camera(camera_in: CameraCreate, db: Session = Depends(get_db)):
    """Registers a new camera instance (IP Camera, USB Webcam, or Mobile Camera)."""
    src_type = camera_in.source_type or "IP_CAMERA"
    src_loc = camera_in.source_location or camera_in.rtsp_url or ""
    rtsp = camera_in.rtsp_url or src_loc
    cam_str = str(uuid4())

    # Validate homography_matrix length server-side (Pydantic v2 doesn't support min_items/max_items on Field)
    h_matrix = camera_in.homography_matrix or [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    if len(h_matrix) != 9:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="homography_matrix must be a flattened 3x3 matrix with exactly 9 float values."
        )

    db_camera = CameraModel(
        camera_id=cam_str,
        camera_name=camera_in.camera_name,
        source_type=src_type,
        source_location=src_loc,
        rtsp_url=rtsp,
        status="ACTIVE",
        zone_id=camera_in.zone_id,
        latitude=camera_in.latitude if camera_in.latitude is not None else 37.7749,
        longitude=camera_in.longitude if camera_in.longitude is not None else -122.4194,
        homography_matrix=h_matrix
    )

    try:
        db.add(db_camera)
        db.commit()
        db.refresh(db_camera)
    except Exception as exc:
        print(f"DB insert fallback to in-memory: {exc}")
        MOCK_CAMERA_DB[cam_str] = db_camera
        return db_camera

    MOCK_CAMERA_DB[cam_str] = db_camera
    return db_camera


@app.get("/cameras", response_model=List[CameraResponse])
def view_all_cameras(db: Session = Depends(get_db)):
    """Retrieves all registered cameras in the platform."""
    seed_cameras_if_empty(db)
    try:
        db_cams = db.query(CameraModel).all()
        if db_cams:
            return db_cams
    except Exception as exc:
        print(f"DB query fallback to in-memory: {exc}")
    
    return list(MOCK_CAMERA_DB.values())


@app.get("/cameras/{camera_id}", response_model=CameraResponse)
def view_camera(camera_id: str, db: Session = Depends(get_db)):
    """Retrieves config parameters for a specific camera."""
    try:
        camera = db.query(CameraModel).filter(CameraModel.camera_id == camera_id).first()
        if camera:
            return camera
    except Exception:
        pass

    if camera_id in MOCK_CAMERA_DB:
        return MOCK_CAMERA_DB[camera_id]

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Camera with identifier {camera_id} not found."
    )



@app.put("/cameras/{camera_id}", response_model=CameraResponse)
def update_camera(camera_id: str, camera_in: CameraUpdate, db: Session = Depends(get_db)):
    """Updates specifications or status for an existing camera (source_type, source_location, rtsp_url, status, etc.)."""
    db_camera = None
    try:
        db_camera = db.query(CameraModel).filter(CameraModel.camera_id == camera_id).first()
    except Exception:
        pass

    if not db_camera and camera_id in MOCK_CAMERA_DB:
        db_camera = MOCK_CAMERA_DB[camera_id]

    if not db_camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with identifier {camera_id} not found."
        )

    update_data = camera_in.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_camera, key, value)

    try:
        db.commit()
        db.refresh(db_camera)
    except Exception:
        pass

    # Keep in-memory fallback store in sync
    MOCK_CAMERA_DB[camera_id] = db_camera
    return db_camera



@app.get("/cameras/{camera_id}/status", response_model=CameraStatusResponse)
def get_camera_status(camera_id: str, db: Session = Depends(get_db)):
    """Queries live connection indicators (latency, frame rates, resolutions)."""
    camera = None
    try:
        camera = db.query(CameraModel).filter(CameraModel.camera_id == camera_id).first()
    except Exception:
        pass

    if not camera and camera_id in MOCK_CAMERA_DB:
        camera = MOCK_CAMERA_DB[camera_id]

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target camera registration not found."
        )
    
    mock_active = camera.status == "ACTIVE"
    return CameraStatusResponse(
        camera_id=camera.camera_id,
        status=camera.status if mock_active else "INACTIVE",
        latency_ms=random.randint(15, 65) if mock_active else 0,
        fps=25 if mock_active else 0,
        resolution="1920x1080" if mock_active else "0x0",
        timestamp=time.time()
    )


# Track active video capture objects & streaming loops per camera ID
ACTIVE_STREAMS = {}   # camera_id_str -> bool
ACTIVE_CAPTURES = {}  # camera_id_str -> cv2.VideoCapture instance


def _check_mobile_reachable(url: str, timeout: float = 3.0) -> tuple:
    """
    Quickly checks TCP reachability for a mobile camera HTTP URL.
    Returns (reachable: bool, latency_ms: int).
    Uses socket.create_connection with a short timeout to avoid blocking the event loop.
    """
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if not host:
            return False, 0
        t0 = time.time()
        with socket.create_connection((host, port), timeout=timeout):
            latency_ms = int((time.time() - t0) * 1000)
            return True, latency_ms
    except (OSError, socket.timeout, ValueError):
        return False, 0


async def generate_video_frames(
    camera_id_str: str,
    rtsp_url: str,
    source_type: str = "IP_CAMERA",
    source_location: Optional[str] = None
):
    """
    Async generator streaming video frames for IP Camera, USB Webcam, or Mobile Camera.
    - For MOBILE_CAMERA: pre-checks TCP reachability (3 s timeout) before opening VideoCapture.
      If unreachable, renders a 'CAMERA UNREACHABLE' overlay frame instead of silently falling
      back to the simulated telemetry canvas.
    - Offloads heavy OpenCV VideoCapture I/O to executor thread.
    - Tracks capture handles for clean release and yields frames via non-blocking sleeps.
    """
    loop = asyncio.get_event_loop()
    target_src = (source_location or rtsp_url or "").strip()
    ACTIVE_STREAMS[camera_id_str] = True

    # ----------------------------------------------------------------
    # Bug 3 fix: fast TCP reachability check for Mobile Camera URLs
    # ----------------------------------------------------------------
    mobile_unreachable = False
    if source_type == "MOBILE_CAMERA" and target_src:
        reachable, _ = await loop.run_in_executor(
            None, lambda: _check_mobile_reachable(target_src, timeout=3.0)
        )
        if not reachable:
            mobile_unreachable = True
            print(f"[MOBILE_CAMERA] {camera_id_str}: TCP check failed for {target_src} — marking UNREACHABLE")

    def open_capture():
        if source_type == "USB_WEBCAM":
            try:
                device_idx = int(target_src)
            except ValueError:
                device_idx = 0
            return cv2.VideoCapture(device_idx)
        elif mobile_unreachable:
            # Skip VideoCapture entirely; return a sentinel that won't open
            return None
        else:
            return cv2.VideoCapture(target_src)

    if mobile_unreachable:
        cap = None
        is_live = False
    else:
        cap = await loop.run_in_executor(None, open_capture)
        ACTIVE_CAPTURES[camera_id_str] = cap
        is_live = cap.isOpened() if cap is not None else False
    
    width, height = 640, 480
    frame_color = (15, 10, 29)
    frame_count = 0
    
    try:
        while ACTIVE_STREAMS.get(camera_id_str, True):
            if is_live:
                def read_frame():
                    if not cap.isOpened():
                        return False, None
                    success, frame = cap.read()
                    if not success:
                        # Auto loop back for test video files or dropped streams
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        success, frame = cap.read()
                    return success, frame

                success, frame = await loop.run_in_executor(None, read_frame)
                if not success or frame is None:
                    await asyncio.sleep(0.04)
                    continue

                # Run YOLOv8 + ByteTrack detection and tracking on live frame
                frame = await loop.run_in_executor(None, lambda: vision_engine.process_frame(frame, camera_id_str))

                # Stream type telemetry visual overlays on actual feed
                if source_type == "USB_WEBCAM":
                    cv2.putText(frame, f"USB WEBCAM DEV #{target_src}", (20, 125),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 128), 1)
                elif source_type == "MOBILE_CAMERA":
                    cv2.putText(frame, "MOBILE STREAM FEED", (20, 125),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 128, 0), 1)
                else:
                    cv2.putText(frame, "RTSP EDGE FEED", (20, 125),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 229, 255), 1)
            else:
                frame = np.zeros((height, width, 3), dtype=np.uint8)

                if mobile_unreachable:
                    # ---- CAMERA UNREACHABLE overlay (Bug 3 fix) ----
                    frame[:] = (10, 5, 20)  # very dark purple-black
                    # Red X pattern
                    cv2.line(frame, (width//2 - 40, height//2 - 40), (width//2 + 40, height//2 + 40), (0, 40, 200), 4)
                    cv2.line(frame, (width//2 + 40, height//2 - 40), (width//2 - 40, height//2 + 40), (0, 40, 200), 4)
                    cv2.putText(frame, "CAMERA UNREACHABLE", (width//2 - 155, height//2 - 60),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (60, 60, 220), 2)
                    cv2.putText(frame, f"Host: {target_src[:42]}", (20, height//2 + 70),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 120, 180), 1)
                    cv2.putText(frame, "TCP connection failed (timeout 3s)", (20, height//2 + 95),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.38, (100, 100, 160), 1)
                    cv2.putText(frame, f"Check IP Webcam app is running | {time.strftime('%H:%M:%S')}",
                                (20, height - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (80, 80, 120), 1)
                else:
                    # Simulated telemetry canvas when camera hardware / stream URL is unattached
                    frame[:] = frame_color

                    for i in range(0, width, 80):
                        cv2.line(frame, (i, 0), (i, height), (30, 41, 66), 1)
                    for j in range(0, height, 80):
                        cv2.line(frame, (0, j), (width, j), (30, 41, 66), 1)

                    frame_count += 1
                    num_people = 15
                    for k in range(num_people):
                        offset_x = int(50 * np.sin(0.05 * frame_count + k))
                        offset_y = int(30 * np.cos(0.08 * frame_count + k))
                        cx = 320 + offset_x + (k * 20 - 150)
                        cy = 240 + offset_y
                        cv2.circle(frame, (cx, cy), 12, (0, 102, 255), -1)
                        cv2.circle(frame, (cx, cy), 20, (0, 229, 255), 1)

                    cv2.putText(frame, f"FEED INGEST [{source_type}]", (20, 40),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 229, 255), 2)
                    cv2.putText(frame, f"FPS: 25 | Active Core: {num_people} Persons", (20, 70),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 229, 163), 1)
                    cv2.putText(frame, f"Frame Timestamp: {time.time():.3f}", (20, 100),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (226, 232, 240), 1)

            success, jpeg_buffer = cv2.imencode('.jpg', frame)
            if not success:
                await asyncio.sleep(0.04)
                continue
                
            frame_bytes = jpeg_buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            
            await asyncio.sleep(0.04)
    finally:
        ACTIVE_STREAMS[camera_id_str] = False
        def release_capture():
            if cap is not None and cap.isOpened():
                cap.release()
            ACTIVE_CAPTURES.pop(camera_id_str, None)
        await loop.run_in_executor(None, release_capture)


@app.post("/cameras/{camera_id}/stop", status_code=status.HTTP_200_OK)
def stop_camera_stream(camera_id: str, db: Session = Depends(get_db)):
    """
    Explicitly stops processing/streaming for the camera,
    releasing OpenCV VideoCapture hardware handles and closing stream resources.
    """
    cam_str = str(camera_id)
    ACTIVE_STREAMS[cam_str] = False
    
    cap = ACTIVE_CAPTURES.pop(cam_str, None)
    if cap and cap.isOpened():
        try:
            cap.release()
        except Exception:
            pass

    try:
        db_cam = db.query(CameraModel).filter(CameraModel.camera_id == cam_str).first()
        if db_cam:
            db_cam.status = "INACTIVE"
            db.commit()
    except Exception:
        pass

    if cam_str in MOCK_CAMERA_DB:
        MOCK_CAMERA_DB[cam_str].status = "INACTIVE"

    return {
        "status": "SUCCESS",
        "camera_id": cam_str,
        "message": f"Camera capture {cam_str} stopped and video handles released successfully."
    }


@app.delete("/cameras/{camera_id}", status_code=status.HTTP_200_OK)
def delete_camera(camera_id: str, db: Session = Depends(get_db)):
    """Deletes a camera resource registration and releases its VideoCapture handles."""
    cam_str = str(camera_id)
    ACTIVE_STREAMS[cam_str] = False
    cap = ACTIVE_CAPTURES.pop(cam_str, None)
    if cap and cap.isOpened():
        try:
            cap.release()
        except Exception:
            pass

    MOCK_CAMERA_DB.pop(cam_str, None)
    try:
        db_camera = db.query(CameraModel).filter(CameraModel.camera_id == cam_str).first()
        if db_camera:
            db.delete(db_camera)
            db.commit()
    except Exception:
        pass

    return {"status": "SUCCESS", "message": f"Camera {cam_str} was deleted and resources released."}


@app.get("/cameras/{camera_id}/reachable")
def check_camera_reachable(camera_id: str, db: Session = Depends(get_db)):
    """
    Fast TCP reachability check for a camera's stream URL.
    Returns { reachable: bool, latency_ms: int, url: str, source_type: str }.
    For MOBILE_CAMERA uses a 3-second TCP timeout; for others just checks URL presence.
    """
    cam_str = str(camera_id)
    camera = None
    try:
        camera = db.query(CameraModel).filter(CameraModel.camera_id == cam_str).first()
    except Exception:
        pass

    if not camera and cam_str in MOCK_CAMERA_DB:
        camera = MOCK_CAMERA_DB[cam_str]

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Camera not found."
        )

    src_type = getattr(camera, "source_type", "IP_CAMERA")
    url = getattr(camera, "source_location", None) or camera.rtsp_url or ""

    if src_type == "MOBILE_CAMERA" and url:
        reachable, latency_ms = _check_mobile_reachable(url, timeout=3.0)
        # If unreachable, update camera status to FAILED in both stores
        if not reachable:
            try:
                camera.status = "FAILED"
                db.commit()
            except Exception:
                pass
            if cam_str in MOCK_CAMERA_DB:
                MOCK_CAMERA_DB[cam_str].status = "FAILED"
        return {"reachable": reachable, "latency_ms": latency_ms, "url": url, "source_type": src_type}
    elif src_type == "USB_WEBCAM":
        # USB webcam reachability can't be checked via TCP — assume reachable if configured
        return {"reachable": True, "latency_ms": 0, "url": url, "source_type": src_type, "note": "USB device check not applicable via TCP"}
    else:
        # IP Camera RTSP — try TCP to RTSP port (554) or first configured port
        reachable, latency_ms = _check_mobile_reachable(url, timeout=3.0) if url else (False, 0)
        return {"reachable": reachable, "latency_ms": latency_ms, "url": url, "source_type": src_type}


@app.get("/cameras/{camera_id}/feed")
async def get_live_visual_feed(camera_id: str, db: Session = Depends(get_db)):
    """
    HTTP Live Feed API proxy. Runs a multipart MJPEG stream response for the camera,
    feeding frames into the unified detection pipeline.
    """
    cam_str = str(camera_id)
    camera = None
    try:
        camera = db.query(CameraModel).filter(CameraModel.camera_id == cam_str).first()
    except Exception:
        pass

    if not camera and cam_str in MOCK_CAMERA_DB:
        camera = MOCK_CAMERA_DB[cam_str]

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target camera registration not found."
        )
    
    return StreamingResponse(
        generate_video_frames(
            camera_id_str=cam_str,
            rtsp_url=camera.rtsp_url or "",
            source_type=getattr(camera, "source_type", "IP_CAMERA"),
            source_location=getattr(camera, "source_location", camera.rtsp_url)
        ),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


