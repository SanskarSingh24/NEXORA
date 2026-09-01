"""
NEXORA Real-Time Computer Vision & Pedestrian Tracking Engine
File: backend/vision/vision_engine.py
Description: Integrates YOLOv8n object detection and ByteTrack multi-object tracking
             to process real-time video frames (IP, USB, Mobile streams). Extracts pedestrian
             coordinates, velocity vectors, crowd density, heatmaps, and updates the thread-safe
             global LiveTelemetryStore.
"""

import math
import time
import threading
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any

import cv2
import numpy as np

logger = logging.getLogger("NEXORA_VISION_ENGINE")

# =====================================================================
# 1. THREAD-SAFE GLOBAL TELEMETRY STORE
# =====================================================================

class LiveTelemetryStore:
    """
    Thread-safe in-memory store holding the latest live computer vision telemetry.
    Read by WebSocket map broadcasts (/ws/map), risk scoring, and analytics pipelines.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self.is_live: bool = False
        self.last_updated: float = 0.0
        self.crowd_count: int = 0
        self.density: float = 0.0          # people per sqm
        self.avg_speed: float = 0.0        # average speed index
        self.flow_vx: float = 0.0          # aggregate X flow vector
        self.flow_vy: float = 0.0          # aggregate Y flow vector
        self.flow_angle: float = 0.0       # degrees (0-360)
        self.entry_rate: float = 0.0       # per minute
        self.exit_rate: float = 0.0        # per minute
        self.queue_length: int = 0
        self.pedestrians: List[Dict[str, Any]] = []
        self.heatmap: List[Dict[str, Any]] = []
        self.active_cameras: Dict[str, Dict[str, Any]] = {}
        self.history: List[Dict[str, Any]] = []

    def update(
        self,
        camera_id: str,
        pedestrians: List[Dict[str, Any]],
        crowd_count: int,
        density: float,
        avg_speed: float,
        flow_vx: float,
        flow_vy: float,
        flow_angle: float,
        heatmap: List[Dict[str, Any]],
        queue_length: int = 0,
        entry_rate: float = 0.0,
        exit_rate: float = 0.0
    ):
        with self._lock:
            self.is_live = True
            self.last_updated = time.time()
            self.crowd_count = crowd_count
            self.density = round(density, 2)
            self.avg_speed = round(avg_speed, 3)
            self.flow_vx = round(flow_vx, 3)
            self.flow_vy = round(flow_vy, 3)
            self.flow_angle = round(flow_angle, 1)
            self.entry_rate = round(entry_rate, 1)
            self.exit_rate = round(exit_rate, 1)
            self.queue_length = queue_length
            self.pedestrians = pedestrians
            self.heatmap = heatmap

            self.active_cameras[camera_id] = {
                "last_seen": self.last_updated,
                "count": crowd_count,
                "density": self.density
            }

            self.history.append({
                "timestamp": self.last_updated,
                "dt": datetime.fromtimestamp(self.last_updated, timezone.utc),
                "crowd_count": crowd_count,
                "density": self.density,
                "avg_speed": self.avg_speed,
                "queue_length": queue_length,
                "entry_rate": self.entry_rate,
                "exit_rate": self.exit_rate
            })
            if len(self.history) > 5000:
                self.history.pop(0)

# Thread-safe global instance
telemetry_store = LiveTelemetryStore()

def get_live_telemetry_snapshot() -> Dict[str, Any]:
    with telemetry_store._lock:
        now = time.time()
        # Expire live status if no frames received in last 4 seconds
        is_active = telemetry_store.is_live and (now - telemetry_store.last_updated < 4.0)
        return {
            "is_live": is_active,
            "last_updated": telemetry_store.last_updated,
            "crowd_count": telemetry_store.crowd_count if is_active else 0,
            "density": telemetry_store.density if is_active else 0.0,
            "avg_speed": telemetry_store.avg_speed if is_active else 0.0,
            "flow_vx": telemetry_store.flow_vx if is_active else 0.0,
            "flow_vy": telemetry_store.flow_vy if is_active else 0.0,
            "flow_angle": telemetry_store.flow_angle if is_active else 0.0,
            "entry_rate": telemetry_store.entry_rate if is_active else 0.0,
            "exit_rate": telemetry_store.exit_rate if is_active else 0.0,
            "queue_length": telemetry_store.queue_length if is_active else 0,
            "pedestrians": list(telemetry_store.pedestrians) if is_active else [],
            "heatmap": list(telemetry_store.heatmap) if is_active else [],
        }

def get_live_telemetry_history(start_dt: datetime, end_dt: datetime) -> List[Dict[str, Any]]:
    with telemetry_store._lock:
        return [
            s for s in telemetry_store.history
            if start_dt <= s["dt"] <= end_dt
        ]


# =====================================================================
# 2. REAL-TIME YOLOV8 + BYTETRACK VISION ENGINE
# =====================================================================

class VisionEngine:
    """
    Real-time vision processor utilizing Ultralytics YOLOv8n and ByteTrack.
    Extracts bounding boxes, track IDs, spatial coordinates, velocity vectors, and heatmaps.
    Draws telemetry overlays directly onto video frames.
    """
    def __init__(self, model_name: str = "yolov8n.pt"):
        self.model_name = model_name
        self.model = None
        self.is_initialized = False
        self._lock = threading.Lock()

        # Track history for velocity calculation: track_id -> (last_cx, last_cy, timestamp)
        self.track_history: Dict[int, Tuple[float, float, float]] = {}

        # Spatial dimensions for density scaling (assumed monitored area 80 sqm)
        self.monitored_area_sqm = 80.0

        self._init_model()

    def _init_model(self):
        try:
            from ultralytics import YOLO
            logger.info(f"Loading YOLOv8 model for real-time person detection: {self.model_name}")
            self.model = YOLO(self.model_name)
            self.is_initialized = True
            logger.info("YOLOv8 vision model loaded successfully.")
        except Exception as exc:
            logger.error(f"Failed to initialize YOLOv8 model: {exc}. Vision Engine will run in pass-through mode.")
            self.is_initialized = False

    def process_frame(self, frame: np.ndarray, camera_id: str = "CAM-01") -> np.ndarray:
        """
        Processes a single video frame:
        1. Runs YOLOv8n + ByteTrack detection & tracking for person class (cls=0).
        2. Computes velocity vectors, density, average speed, and heatmap.
        3. Updates the central LiveTelemetryStore.
        4. Draws bounding boxes, track IDs, speed vectors, and count overlay onto the frame.
        """
        if frame is None or frame.size == 0:
            return frame

        height, width = frame.shape[:2]

        if not self.is_initialized or self.model is None:
            # Fallback overlay if model not initialized
            cv2.putText(frame, "VISION ENGINE: INITIALIZING / UNLOADED", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)
            return frame

        now = time.time()
        pedestrians = []
        speeds = []
        flow_vx_list = []
        flow_vy_list = []
        heatmap_points = []

        try:
            # Run YOLOv8 + ByteTrack tracking on person class (cls=0)
            results = self.model.track(
                source=frame,
                persist=True,
                tracker="bytetrack.yaml",
                classes=[0],        # COCO class 0 is 'person'
                verbose=False,
                conf=0.25
            )

            if results and len(results) > 0:
                result = results[0]
                boxes = result.boxes

                if boxes is not None and len(boxes) > 0:
                    for box in boxes:
                        coords = box.xyxy[0].cpu().numpy()
                        x1, y1, x2, y2 = float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])

                        # Track ID if available from ByteTrack
                        track_id = int(box.id[0].cpu().numpy()) if box.id is not None else int(np.random.randint(1000, 9999))
                        confidence = float(box.conf[0].cpu().numpy()) if box.conf is not None else 0.5

                        # Calculate center point
                        cx = (x1 + x2) / 2.0
                        cy = (y1 + y2) / 2.0

                        # Map frame pixel coordinates (width x height) to 2D canvas space (800 x 500)
                        map_x = round((cx / width) * 800.0, 1)
                        map_y = round((cy / height) * 500.0, 1)

                        # Calculate velocity vector (displacement over delta_t)
                        vx, vy = 0.0, 0.0
                        speed = 0.0
                        if track_id in self.track_history:
                            prev_x, prev_y, prev_t = self.track_history[track_id]
                            dt = max(0.01, now - prev_t)
                            if dt < 2.0:
                                vx = (map_x - prev_x) / dt
                                vy = (map_y - prev_y) / dt
                                speed = math.sqrt(vx**2 + vy**2)

                        self.track_history[track_id] = (map_x, map_y, now)

                        speeds.append(speed)
                        flow_vx_list.append(vx)
                        flow_vy_list.append(vy)
                        heatmap_points.append((map_x, map_y))

                        # Color box based on velocity / speed
                        color = (0, 229, 255) if speed < 2.5 else (0, 102, 255)

                        # Draw bounding box on frame
                        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                        
                        # Draw label tag
                        label = f"ID:{track_id} {confidence:.2f}"
                        cv2.putText(frame, label, (int(x1), max(15, int(y1) - 6)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

                        # Draw center tracking dot and velocity direction line
                        cv2.circle(frame, (int(cx), int(cy)), 4, (0, 255, 0), -1)
                        if abs(vx) > 0.1 or abs(vy) > 0.1:
                            end_x = int(cx + vx * 5)
                            end_y = int(cy + vy * 5)
                            cv2.line(frame, (int(cx), int(cy)), (end_x, end_y), (0, 255, 255), 2)

                        pedestrians.append({
                            "id": track_id,
                            "x": map_x,
                            "y": map_y,
                            "vx": round(vx, 2),
                            "vy": round(vy, 2),
                            "speed": round(speed, 2),
                            "color": "cyan" if speed < 2.5 else "orange",
                            "confidence": round(confidence, 2)
                        })

            # Clean stale tracks from track history
            stale_ids = [tid for tid, (_, _, t) in self.track_history.items() if now - t > 3.0]
            for tid in stale_ids:
                del self.track_history[tid]

            # Compute aggregate telemetry metrics
            crowd_count = len(pedestrians)
            density = crowd_count / self.monitored_area_sqm
            avg_speed = float(np.mean(speeds)) if speeds else 0.0
            avg_vx = float(np.mean(flow_vx_list)) if flow_vx_list else 0.0
            avg_vy = float(np.mean(flow_vy_list)) if flow_vy_list else 0.0

            # Calculate cardinal angle (0-360 degrees)
            angle = math.degrees(math.atan2(avg_vx, -avg_vy))
            if angle < 0:
                angle += 360.0

            # Generate dynamic heatmap cells from pedestrian spatial clusters (grid over 800x500 canvas)
            heatmap_cells = []
            if heatmap_points:
                grid_counts = {}
                for px, py in heatmap_points:
                    # Grid bucket size 100px; center of each cell is offset +50
                    gx = int(px // 100) * 100 + 50
                    gy = int(py // 100) * 100 + 50
                    grid_counts[(gx, gy)] = grid_counts.get((gx, gy), 0) + 1

                for (gx, gy), count in grid_counts.items():
                    weight = min(1.0, round(count / 5.0, 2))
                    heatmap_cells.append({"x": gx, "y": gy, "weight": weight})

            # Update Central Live Telemetry Store
            telemetry_store.update(
                camera_id=camera_id,
                pedestrians=pedestrians,
                crowd_count=crowd_count,
                density=density,
                avg_speed=avg_speed,
                flow_vx=avg_vx,
                flow_vy=avg_vy,
                flow_angle=angle,
                heatmap=heatmap_cells
            )

            # Render Live Vision HUD Overlay on OpenCV Frame
            cv2.rectangle(frame, (10, 10), (320, 100), (15, 10, 29), -1)
            cv2.rectangle(frame, (10, 10), (320, 100), (0, 229, 255), 1)

            cv2.putText(frame, "YOLOv8n + ByteTrack | LIVE", (20, 32),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 229, 255), 2)
            cv2.putText(frame, f"Detected Persons: {crowd_count}", (20, 55),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 128), 1)
            cv2.putText(frame, f"Density: {density:.2f} p/m2 | Speed: {avg_speed:.2f}", (20, 78),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (226, 232, 240), 1)

        except Exception as exc:
            logger.error(f"Error running YOLOv8 frame processing: {exc}")

        return frame


# Singleton instance
vision_engine = VisionEngine()
