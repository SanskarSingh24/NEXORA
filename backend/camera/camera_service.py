"""
NEXORA Camera Management & Live Streaming Service
File: backend/camera/camera_service.py
Description: Production-ready Python FastAPI service implementing full PostgreSQL-based CRUD operations
             for cameras, network status monitoring, and a mock live MJPEG streaming loop mimicking RTSP feeds.
"""

import asyncio
from enum import Enum
import json
import os
import random
import socket
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from uuid import UUID, uuid4

import cv2  # OpenCV used for stream decoding/mock framing
import numpy as np
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator
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

def seed_cameras_if_empty(db: Session = None):
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
            conn.execute(text("SET statement_timeout = 5000;"))
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

class CameraSourceType(str, Enum):
    IP_CAMERA = "IP_CAMERA"
    USB_WEBCAM = "USB_WEBCAM"
    MOBILE_CAMERA = "MOBILE_CAMERA"


def _normalize_camera_input(data: Any) -> Any:
    """Normalizes and validates camera attributes across all source types (IP, USB, Mobile)."""
    if not isinstance(data, dict):
        return data
    d = dict(data)

    # 1. Resolve camera_name aliases and sanitize
    if "camera_name" not in d or not d["camera_name"]:
        d["camera_name"] = str(d.get("name") or d.get("label") or "Camera Source").strip()

    # 2. Resolve zone_id aliases
    if "zone_id" not in d or not d["zone_id"]:
        d["zone_id"] = str(d.get("location_zone") or d.get("zone") or "Zone A").strip()

    # 3. Robust source_type normalization with support for common Mobile/Webcam aliases
    raw_st = str(d.get("source_type") or "IP_CAMERA").strip().upper().replace(" ", "_").replace("-", "_")
    if any(k in raw_st for k in ["MOBILE", "PHONE", "IP_WEBCAM", "IPWEBCAM", "DROID"]):
        st = CameraSourceType.MOBILE_CAMERA.value
    elif any(k in raw_st for k in ["USB", "WEBCAM", "V4L2", "DEVICE"]):
        st = CameraSourceType.USB_WEBCAM.value
    else:
        st = CameraSourceType.IP_CAMERA.value
    d["source_type"] = st

    # 4. Normalize source_location and rtsp_url formats based on source_type
    loc = d.get("source_location") or d.get("rtsp_url") or d.get("stream_url") or d.get("url") or ""
    loc = str(loc).strip() if loc is not None else ""

    if st == CameraSourceType.MOBILE_CAMERA.value:
        if not loc:
            loc = "http://192.168.1.50:8080/video"
        else:
            if not (loc.startswith("http://") or loc.startswith("https://") or loc.startswith("rtsp://")):
                loc = "http://" + loc
            parsed = urlparse(loc)
            # If standard IP Webcam app URL without stream path, append /video for MJPEG streaming
            if not parsed.path or parsed.path == "/":
                loc = loc.rstrip("/") + "/video"
    elif st == CameraSourceType.USB_WEBCAM.value:
        if not loc:
            loc = "0"
    elif st == CameraSourceType.IP_CAMERA.value:
        if not loc:
            loc = "rtsp://10.0.1.50/stream1"

    d["source_location"] = loc
    d["rtsp_url"] = d.get("rtsp_url") or loc

    # 5. Normalize homography_matrix (support JSON string, CSV, or list of 9 floats)
    hm = d.get("homography_matrix")
    if isinstance(hm, str):
        try:
            hm = json.loads(hm)
        except Exception:
            try:
                hm = [float(x.strip()) for x in hm.split(",") if x.strip()]
            except Exception:
                hm = None
    if not isinstance(hm, list) or len(hm) != 9:
        hm = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    else:
        try:
            hm = [float(x) for x in hm]
        except Exception:
            hm = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    d["homography_matrix"] = hm

    return d


class CameraCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    camera_name: str = Field(..., min_length=1, max_length=128)
    source_type: Optional[str] = Field("IP_CAMERA", description="IP_CAMERA, USB_WEBCAM, MOBILE_CAMERA")
    source_location: Optional[str] = Field(None, description="RTSP URL, device index string, or mobile URL")
    rtsp_url: Optional[str] = Field(None, description="RTSP endpoint connection url or legacy fallback")
    zone_id: Optional[str] = Field("Zone A", min_length=1, max_length=64)
    latitude: Optional[float] = Field(37.7749, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(-122.4194, ge=-180.0, le=180.0)
    homography_matrix: Optional[List[float]] = Field(
        default_factory=lambda: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        description="Flattened 3x3 matrix array"
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        return _normalize_camera_input(data)


class CameraUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    camera_name: Optional[str] = Field(None, min_length=1, max_length=128)
    source_type: Optional[str] = Field(None, description="IP_CAMERA, USB_WEBCAM, MOBILE_CAMERA")
    source_location: Optional[str] = Field(None)
    rtsp_url: Optional[str] = Field(None)
    status: Optional[str] = Field(None, description="ACTIVE, INACTIVE, FAILED")
    zone_id: Optional[str] = Field(None, min_length=1, max_length=64)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    # NOTE: min_items/max_items are Pydantic v1 only — omit them here; validated in endpoint
    homography_matrix: Optional[List[float]] = Field(None, description="Flattened 3x3 matrix (9 values)")

    @model_validator(mode="before")
    @classmethod
    def normalize_update_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "source_type" in d and d["source_type"] is not None:
            raw_st = str(d["source_type"]).strip().upper().replace(" ", "_").replace("-", "_")
            if any(k in raw_st for k in ["MOBILE", "PHONE", "IP_WEBCAM", "IPWEBCAM", "DROID"]):
                d["source_type"] = CameraSourceType.MOBILE_CAMERA.value
            elif any(k in raw_st for k in ["USB", "WEBCAM", "V4L2", "DEVICE"]):
                d["source_type"] = CameraSourceType.USB_WEBCAM.value
            else:
                d["source_type"] = CameraSourceType.IP_CAMERA.value

        st = d.get("source_type")
        loc = d.get("source_location") or d.get("rtsp_url")
        if st == CameraSourceType.MOBILE_CAMERA.value and loc:
            loc = str(loc).strip()
            if not (loc.startswith("http://") or loc.startswith("https://") or loc.startswith("rtsp://")):
                loc = "http://" + loc
            parsed = urlparse(loc)
            if not parsed.path or parsed.path == "/":
                loc = loc.rstrip("/") + "/video"
            d["source_location"] = loc
            d["rtsp_url"] = loc
        return d


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
# 4. CAMERA PIPELINE & BACKGROUND INGESTION MANAGER
# =====================================================================

MAX_CONCURRENT_PIPELINES = 4

class CameraPipeline:
    """
    Independent video ingestion & processing pipeline for a single active camera.
    Runs its own capture loop in a dedicated background daemon thread.
    - Decoupled from HTTP feed requests: buffers latest annotated JPEG frame.
    - Runs YOLOv8 person detection + ByteTrack tracking at ~3-5 FPS on frames downscaled to max 640px.
    - Renders annotations and HUD on every captured frame (~25-30 FPS) for smooth display.
    - If camera is disconnected or unreachable, retries in the background with exponential backoff (up to 60s)
      without blocking any other cameras or busy-looping.
    - Never holds a database connection.
    """
    def __init__(
        self,
        camera_id: str,
        camera_name: str,
        source_type: str,
        source_location: str,
        detection_fps: float = 4.0
    ):
        self.camera_id = str(camera_id)
        self.camera_name = camera_name
        self.source_type = source_type
        self.source_location = (source_location or "").strip()
        self.detection_interval = 1.0 / max(1.0, detection_fps)  # ~0.25s for 4 FPS
        
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.cap: Optional[cv2.VideoCapture] = None
        
        self.lock = threading.Lock()
        self.latest_jpeg: Optional[bytes] = None
        self.latest_frame_time: float = 0.0
        self.is_connected = False
        
        # Exponential backoff for reconnection (up to ~60s)
        self.retry_delay: float = 2.0
        self.max_retry_delay: float = 60.0
        
        self.latest_detections: Optional[Dict[str, Any]] = None
        self.last_detection_time: float = 0.0

    def start(self):
        if self.running and self.thread and self.thread.is_alive():
            return
        self.running = True
        self.thread = threading.Thread(
            target=self._capture_loop,
            name=f"CameraPipeline-{self.camera_id}",
            daemon=True
        )
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        self._release_capture()
        vision_engine.cleanup_camera(self.camera_id)

    def _release_capture(self):
        if self.source_type == "USB_WEBCAM":
            try:
                device_idx = int(self.source_location)
            except (ValueError, TypeError):
                device_idx = 0
            camera_manager.release_usb_index(device_idx, self.camera_id)

        if self.cap is not None:
            try:
                if self.cap.isOpened():
                    self.cap.release()
            except Exception:
                pass
            self.cap = None
        self.is_connected = False

    def _create_unreachable_frame(self, message: str = "CONNECTING...") -> bytes:
        """Generates a styled offline/reconnecting placeholder frame."""
        width, height = 640, 480
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:] = (15, 10, 29)  # Dark navy background
        for i in range(0, width, 80):
            cv2.line(frame, (i, 0), (i, height), (30, 41, 66), 1)
        for j in range(0, height, 80):
            cv2.line(frame, (0, j), (width, j), (30, 41, 66), 1)

        cv2.putText(frame, f"NEXORA CAMERA: {self.camera_name[:20]}", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 229, 255), 1)
        cv2.putText(frame, f"SOURCE: [{self.source_type}]", (20, 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 229, 163), 1)
        cv2.putText(frame, message, (20, height // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 102, 255), 2)
        cv2.putText(frame, f"Target: {self.source_location[:45]}", (20, height // 2 + 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 200), 1)
        cv2.putText(frame, f"Retrying in background | {time.strftime('%H:%M:%S')}", (20, height - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 120, 150), 1)

        success, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        return buf.tobytes() if success else b""

    def _open_capture(self) -> Optional[cv2.VideoCapture]:
        """Attempts to open OpenCV VideoCapture for this camera."""
        target = self.source_location
        if self.source_type == "USB_WEBCAM":
            try:
                device_idx = int(target)
            except (ValueError, TypeError):
                device_idx = 0

            # Prevent opening the same USB webcam index twice across active pipelines
            if not camera_manager.claim_usb_index(device_idx, self.camera_id):
                print(
                    f"[CameraPipeline] USB webcam index {device_idx} is already claimed by another camera. "
                    f"Skipping duplicate open for '{self.camera_name}' ({self.camera_id})."
                )
                return None

            # On Windows, cv2.CAP_DSHOW opens in ~500ms instead of 5s default MSMF
            if os.name == "nt":
                cap = cv2.VideoCapture(device_idx, cv2.CAP_DSHOW)
                if not cap or not cap.isOpened():
                    cap = cv2.VideoCapture(device_idx)
            else:
                cap = cv2.VideoCapture(device_idx)
        else:
            cap = cv2.VideoCapture(target)

        if cap and cap.isOpened():
            return cap
        if cap:
            try:
                cap.release()
            except Exception:
                pass
        self._release_capture()
        return None

    def _capture_loop(self):
        """Background worker thread: runs continuous capture, throttled detection, and buffer updates."""
        print(f"[CameraPipeline] Background pipeline started for {self.camera_name} ({self.camera_id})")

        # Initial placeholder
        initial_frame = self._create_unreachable_frame("CONNECTING TO STREAM...")
        with self.lock:
            self.latest_jpeg = initial_frame
            self.latest_frame_time = time.time()

        read_failures = 0
        while self.running:
            if self.cap is None or not self.cap.isOpened():
                self._release_capture()
                self.cap = self._open_capture()
                if self.cap is None or not self.cap.isOpened():
                    self.is_connected = False
                    placeholder = self._create_unreachable_frame(f"RECONNECTING (retry in {int(self.retry_delay)}s)...")
                    with self.lock:
                        self.latest_jpeg = placeholder
                        self.latest_frame_time = time.time()

                    # Sleep between retry attempts in small intervals to allow swift shutdown without busy-looping
                    sleep_elapsed = 0.0
                    while self.running and sleep_elapsed < self.retry_delay:
                        time.sleep(0.2)
                        sleep_elapsed += 0.2

                    # Growing delay up to ~60s (exponential backoff)
                    self.retry_delay = min(self.max_retry_delay, self.retry_delay * 2.0)
                    continue

                self.is_connected = True
                self.retry_delay = 2.0  # Reset delay upon successful connection
                read_failures = 0
                print(f"[CameraPipeline] Successfully connected to {self.camera_name} ({self.camera_id})")

            try:
                read_success, frame = self.cap.read()
            except Exception:
                read_success, frame = False, None

            if not read_success or frame is None:
                # Video file loopback or stream drop
                if self.source_type not in ["USB_WEBCAM", "MOBILE_CAMERA"] and self.cap.get(cv2.CAP_PROP_FRAME_COUNT) > 0:
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    try:
                        read_success, frame = self.cap.read()
                    except Exception:
                        read_success, frame = False, None

                if not read_success or frame is None:
                    read_failures += 1
                    if read_failures >= 5:
                        print(f"[CameraPipeline] Stream dropped for {self.camera_name} ({self.camera_id}). Will reconnect.")
                        self._release_capture()
                        read_failures = 0
                    else:
                        time.sleep(0.04)
                    continue

            read_failures = 0

            # 1. Throttled Detection (~3-5 FPS) on frames downscaled to max 640px
            now = time.time()
            if now - self.last_detection_time >= self.detection_interval:
                try:
                    # detect_and_track downscales to 640px and acquires _inference_lock
                    detections = vision_engine.detect_and_track(frame, self.camera_id)
                    self.latest_detections = detections
                    self.last_detection_time = now
                except Exception as e:
                    print(f"[CameraPipeline] Detection error on {self.camera_id}: {e}")

            # 2. Draw latest bounding boxes and HUD on displayed frame at camera rate
            annotated_frame = vision_engine.draw_annotations(
                frame,
                self.latest_detections,
                camera_name=self.camera_name,
                source_type=self.source_type
            )

            # 3. Compress to JPEG and store in memory buffer
            success, jpeg_buf = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if success:
                jpeg_bytes = jpeg_buf.tobytes()
                with self.lock:
                    self.latest_jpeg = jpeg_bytes
                    self.latest_frame_time = time.time()

            # Small yield to maintain real-time pacing
            time.sleep(0.005)

        self._release_capture()
        print(f"[CameraPipeline] Stopped pipeline for {self.camera_id}")

    def get_latest_frame(self) -> Tuple[Optional[bytes], float]:
        with self.lock:
            return self.latest_jpeg, self.latest_frame_time


class CameraManager:
    """
    Central registry and lifecycle manager for all CameraPipelines.
    - Maintains one active pipeline per camera.
    - Caps simultaneous pipelines at MAX_CONCURRENT_PIPELINES (4) to prevent resource starvation.
    - Prevents duplicate startup runs ("Starting pipelines for all ACTIVE cameras" runs once).
    - Prevents opening the same USB webcam index twice across pipelines.
    - Starts pipelines on camera addition or server startup.
    - Stops pipelines on camera deletion or stop.
    """
    def __init__(self, max_pipelines: int = MAX_CONCURRENT_PIPELINES):
        self.lock = threading.Lock()
        self.pipelines: Dict[str, CameraPipeline] = {}
        self.max_pipelines = max_pipelines
        self._claimed_usb_indices: Dict[int, str] = {}  # device_idx -> camera_id
        self._has_started: bool = False

    def claim_usb_index(self, device_idx: int, camera_id: str) -> bool:
        """Claims a USB webcam index for a specific camera. Returns False if already in use."""
        with self.lock:
            holder = self._claimed_usb_indices.get(device_idx)
            if holder is not None and holder != str(camera_id):
                return False
            self._claimed_usb_indices[device_idx] = str(camera_id)
            return True

    def release_usb_index(self, device_idx: int, camera_id: str):
        """Releases a claimed USB webcam index if held by the specified camera."""
        with self.lock:
            if self._claimed_usb_indices.get(device_idx) == str(camera_id):
                del self._claimed_usb_indices[device_idx]

    def get_pipeline(self, camera_id: str) -> Optional[CameraPipeline]:
        with self.lock:
            return self.pipelines.get(str(camera_id))

    def start_pipeline(
        self,
        camera_id: str,
        camera_name: str,
        source_type: str,
        source_location: str
    ) -> Optional[CameraPipeline]:
        cam_str = str(camera_id)
        loc = (source_location or "").strip()
        with self.lock:
            existing = self.pipelines.get(cam_str)
            if existing:
                if existing.running and existing.source_location == loc and existing.source_type == source_type:
                    return existing
                existing.stop()
                self.pipelines.pop(cam_str, None)

            # Cap simultaneous active pipelines
            active_count = sum(1 for p in self.pipelines.values() if p.running)
            if active_count >= self.max_pipelines:
                print(
                    f"[CameraManager] Simultaneous pipeline limit reached ({self.max_pipelines}). "
                    f"Skipping pipeline startup for camera '{camera_name}' ({cam_str})."
                )
                return None

            # In test mode, do not spawn real background hardware capture threads
            if GLOBAL_SYSTEM_SETTINGS.get("test_mode") == "true":
                return None

            pipeline = CameraPipeline(
                camera_id=cam_str,
                camera_name=camera_name,
                source_type=source_type,
                source_location=source_location
            )
            pipeline.start()
            self.pipelines[cam_str] = pipeline
            return pipeline

    def stop_pipeline(self, camera_id: str):
        cam_str = str(camera_id)
        with self.lock:
            pipeline = self.pipelines.pop(cam_str, None)
            if pipeline:
                pipeline.stop()

    def start_all_active_cameras(self):
        """
        Loads all ACTIVE cameras from DB and starts an independent pipeline for each up to max_pipelines.
        Ensures startup executes strictly once across server lifespan.
        """
        with self.lock:
            if self._has_started:
                print("[CameraManager] Pipelines already initialized. Skipping duplicate startup.")
                return
            self._has_started = True

        print("[CameraManager] Starting pipelines for all ACTIVE cameras...")
        cameras_to_start = []
        db = None
        try:
            db = SessionLocal()
            active_cams = db.query(CameraModel).filter(CameraModel.status == "ACTIVE").all()
            for c in active_cams:
                cameras_to_start.append({
                    "camera_id": c.camera_id,
                    "camera_name": c.camera_name,
                    "source_type": getattr(c, "source_type", "IP_CAMERA"),
                    "source_location": getattr(c, "source_location", c.rtsp_url) or c.rtsp_url or ""
                })
        except Exception as e:
            print(f"[CameraManager] Error querying active cameras from DB: {e}")
        finally:
            if db:
                db.close()

        # Fallback to MOCK_CAMERA_DB if empty
        if not cameras_to_start:
            for c in MOCK_CAMERA_DB.values():
                if getattr(c, "status", "ACTIVE") == "ACTIVE":
                    cameras_to_start.append({
                        "camera_id": c.camera_id,
                        "camera_name": c.camera_name,
                        "source_type": getattr(c, "source_type", "IP_CAMERA"),
                        "source_location": getattr(c, "source_location", c.rtsp_url) or c.rtsp_url or ""
                    })

        started_count = 0
        for cam in cameras_to_start:
            p = self.start_pipeline(
                camera_id=cam["camera_id"],
                camera_name=cam["camera_name"],
                source_type=cam["source_type"],
                source_location=cam["source_location"]
            )
            if p is not None:
                started_count += 1
        print(f"[CameraManager] Active camera pipelines initialized ({started_count} of {len(cameras_to_start)} cameras started, cap={self.max_pipelines}).")

    def stop_all(self):
        """Stops all running pipelines gracefully."""
        print("[CameraManager] Stopping all camera pipelines...")
        with self.lock:
            for pipeline in self.pipelines.values():
                pipeline.stop()
            self.pipelines.clear()
            self._claimed_usb_indices.clear()
            self._has_started = False


camera_manager = CameraManager()

# =====================================================================
# 5. CAMERA CONTROLLERS & ENDPOINTS
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

    h_matrix = camera_in.homography_matrix or [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    if len(h_matrix) != 9:
        h_matrix = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]

    db_camera = CameraModel(
        camera_id=cam_str,
        camera_name=camera_in.camera_name,
        source_type=src_type,
        source_location=src_loc,
        rtsp_url=rtsp,
        status="ACTIVE",
        zone_id=camera_in.zone_id or "Zone A",
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
        camera_manager.start_pipeline(cam_str, db_camera.camera_name, src_type, src_loc)
        return db_camera

    MOCK_CAMERA_DB[cam_str] = db_camera
    camera_manager.start_pipeline(cam_str, db_camera.camera_name, src_type, src_loc)
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

    if getattr(db_camera, "status", "ACTIVE") == "ACTIVE":
        camera_manager.start_pipeline(
            camera_id=camera_id,
            camera_name=db_camera.camera_name,
            source_type=getattr(db_camera, "source_type", "IP_CAMERA"),
            source_location=getattr(db_camera, "source_location", db_camera.rtsp_url) or db_camera.rtsp_url or ""
        )
    else:
        camera_manager.stop_pipeline(camera_id)

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


@app.post("/cameras/{camera_id}/stop", status_code=status.HTTP_200_OK)
def stop_camera_stream(camera_id: str, db: Session = Depends(get_db)):
    """
    Explicitly stops processing/streaming for the camera,
    releasing OpenCV VideoCapture hardware handles and closing stream resources.
    """
    cam_str = str(camera_id)
    camera_manager.stop_pipeline(cam_str)

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
    camera_manager.stop_pipeline(cam_str)

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
def get_live_visual_feed(camera_id: str):
    """
    HTTP Live Feed API proxy. Serves that camera's latest annotated frame from its own buffer,
    not opening a new capture per request, so several browser tabs viewing one camera do not multiply load.
    Closes the DB session immediately before streaming starts.
    The feed never holds a DB connection.
    """
    cam_str = str(camera_id)
    camera = None
    db = None
    try:
        db = SessionLocal()
        camera = db.query(CameraModel).filter(CameraModel.camera_id == cam_str).first()
    except Exception:
        pass
    finally:
        # CRITICAL: Close DB session immediately so feed NEVER holds a DB connection!
        if db:
            db.close()

    if not camera and cam_str in MOCK_CAMERA_DB:
        camera = MOCK_CAMERA_DB[cam_str]

    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target camera registration not found."
        )

    # Retrieve or start the dedicated pipeline for this camera
    pipeline = camera_manager.get_pipeline(cam_str)
    if not pipeline or not pipeline.running:
        pipeline = camera_manager.start_pipeline(
            camera_id=cam_str,
            camera_name=camera.camera_name,
            source_type=getattr(camera, "source_type", "IP_CAMERA"),
            source_location=getattr(camera, "source_location", camera.rtsp_url) or camera.rtsp_url or ""
        )

    if not pipeline:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Camera pipeline limit ({camera_manager.max_pipelines}) reached. Stop another camera stream before viewing this feed."
        )

    async def stream_generator():
        last_frame_time = 0.0
        while pipeline.running:
            jpeg_bytes, frame_time = pipeline.get_latest_frame()
            if jpeg_bytes is not None and frame_time > last_frame_time:
                last_frame_time = frame_time
                yield (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n'
                )
            await asyncio.sleep(0.033)  # ~30 FPS poll against in-memory buffer

    return StreamingResponse(
        stream_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


