"""
NEXORA Real-Time Computer Vision & Pedestrian Tracking Engine
File: backend/vision/vision_engine.py
Description: Integrates YOLOv8n object detection and ByteTrack multi-object tracking
             to process real-time video frames (IP, USB, Mobile streams). Extracts pedestrian
             coordinates, velocity vectors, crowd density, heatmaps, and updates the thread-safe
             global LiveTelemetryStore.
"""

from collections import defaultdict
from datetime import datetime, timezone
import logging
import math
from pathlib import Path
import threading
import time
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("NEXORA_VISION_ENGINE")

# =====================================================================
# 1. THREAD-SAFE GLOBAL TELEMETRY STORE (PER-CAMERA & COMBINED)
# =====================================================================

class LiveTelemetryStore:
    """
    Thread-safe in-memory store holding real-time computer vision telemetry.
    Stores telemetry per camera_id and computes combined snapshots.
    Read by WebSocket map broadcasts (/ws/map), risk scoring, alerts, and reports.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self.camera_telemetry: Dict[str, Dict[str, Any]] = {}
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
            now = time.time()
            cam_str = str(camera_id)

            # Tag each pedestrian with camera_id to prevent collision in combined view
            tagged_pedestrians = []
            for p in pedestrians:
                p_item = dict(p)
                p_item["camera_id"] = cam_str
                tagged_pedestrians.append(p_item)

            self.camera_telemetry[cam_str] = {
                "is_live": True,
                "last_updated": now,
                "crowd_count": crowd_count,
                "density": round(density, 2),
                "avg_speed": round(avg_speed, 3),
                "flow_vx": round(flow_vx, 3),
                "flow_vy": round(flow_vy, 3),
                "flow_angle": round(flow_angle, 1),
                "entry_rate": round(entry_rate, 1),
                "exit_rate": round(exit_rate, 1),
                "queue_length": queue_length,
                "pedestrians": tagged_pedestrians,
                "heatmap": heatmap
            }

            self.history.append({
                "timestamp": now,
                "dt": datetime.fromtimestamp(now, timezone.utc),
                "camera_id": cam_str,
                "crowd_count": crowd_count,
                "density": round(density, 2),
                "avg_speed": round(avg_speed, 3),
                "queue_length": queue_length,
                "entry_rate": round(entry_rate, 1),
                "exit_rate": round(exit_rate, 1)
            })
            if len(self.history) > 5000:
                self.history.pop(0)

    def remove_camera(self, camera_id: str):
        with self._lock:
            self.camera_telemetry.pop(str(camera_id), None)

    def get_snapshot(self, camera_id: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            now = time.time()

            # 1. Specific camera snapshot
            if camera_id is not None:
                cam_str = str(camera_id)
                cam = self.camera_telemetry.get(cam_str)
                is_active = bool(cam and (now - cam["last_updated"] < 4.0))
                if is_active and cam:
                    return {
                        "is_live": True,
                        "last_updated": cam["last_updated"],
                        "crowd_count": cam["crowd_count"],
                        "density": cam["density"],
                        "avg_speed": cam["avg_speed"],
                        "flow_vx": cam["flow_vx"],
                        "flow_vy": cam["flow_vy"],
                        "flow_angle": cam["flow_angle"],
                        "entry_rate": cam["entry_rate"],
                        "exit_rate": cam["exit_rate"],
                        "queue_length": cam["queue_length"],
                        "pedestrians": list(cam["pedestrians"]),
                        "heatmap": list(cam["heatmap"]),
                        "camera_id": cam_str
                    }
                return {
                    "is_live": False,
                    "last_updated": cam["last_updated"] if cam else 0.0,
                    "crowd_count": 0,
                    "density": 0.0,
                    "avg_speed": 0.0,
                    "flow_vx": 0.0,
                    "flow_vy": 0.0,
                    "flow_angle": 0.0,
                    "entry_rate": 0.0,
                    "exit_rate": 0.0,
                    "queue_length": 0,
                    "pedestrians": [],
                    "heatmap": [],
                    "camera_id": cam_str
                }

            # 2. Combined view across all active cameras
            active_cams = [
                c for c in self.camera_telemetry.values()
                if now - c["last_updated"] < 4.0
            ]

            if not active_cams:
                return {
                    "is_live": False,
                    "last_updated": 0.0,
                    "crowd_count": 0,
                    "density": 0.0,
                    "avg_speed": 0.0,
                    "flow_vx": 0.0,
                    "flow_vy": 0.0,
                    "flow_angle": 0.0,
                    "entry_rate": 0.0,
                    "exit_rate": 0.0,
                    "queue_length": 0,
                    "pedestrians": [],
                    "heatmap": []
                }

            combined_count = sum(c["crowd_count"] for c in active_cams)
            # Worst risk across cameras: maximum density
            worst_density = max(c["density"] for c in active_cams)
            # Weighted average speed
            avg_speed = (
                sum(c["avg_speed"] * max(1, c["crowd_count"]) for c in active_cams) / max(1, combined_count)
                if combined_count else 0.0
            )

            # Flow vectors from highest-density camera
            primary_cam = max(active_cams, key=lambda c: c["density"])
            combined_vx = primary_cam["flow_vx"]
            combined_vy = primary_cam["flow_vy"]
            combined_angle = primary_cam["flow_angle"]

            combined_entry = sum(c.get("entry_rate", 0.0) for c in active_cams)
            combined_exit = sum(c.get("exit_rate", 0.0) for c in active_cams)
            combined_queue = sum(c.get("queue_length", 0) for c in active_cams)

            combined_pedestrians = []
            for c in active_cams:
                combined_pedestrians.extend(c["pedestrians"])

            combined_heatmap = []
            for c in active_cams:
                combined_heatmap.extend(c["heatmap"])

            latest_ts = max(c["last_updated"] for c in active_cams)

            return {
                "is_live": True,
                "last_updated": latest_ts,
                "crowd_count": combined_count,
                "density": round(worst_density, 2),
                "avg_speed": round(avg_speed, 3),
                "flow_vx": round(combined_vx, 3),
                "flow_vy": round(combined_vy, 3),
                "flow_angle": round(combined_angle, 1),
                "entry_rate": round(combined_entry, 1),
                "exit_rate": round(combined_exit, 1),
                "queue_length": combined_queue,
                "pedestrians": combined_pedestrians,
                "heatmap": combined_heatmap
            }


telemetry_store = LiveTelemetryStore()

def get_live_telemetry_snapshot(camera_id: Optional[str] = None) -> Dict[str, Any]:
    return telemetry_store.get_snapshot(camera_id)

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
    - Shares ONE YOLO model across all cameras protected by an inference lock.
    - Maintains separate ByteTrack tracker state per camera.
    - Limits detection rate (~3-5 FPS) on frames downscaled to max 640px.
    - Returns structured detections for smooth frame overlay rendering.
    """
    def __init__(self, model_name: str = "yolov8n.pt"):
        self.model_name = model_name
        self.model = None
        self.is_initialized = False
        self._inference_lock = threading.Lock()

        # Per-camera ByteTrack trackers
        self.camera_trackers: Dict[str, Any] = {}
        self._tracker_cfg: Optional[SimpleNamespace] = None

        # Per-camera track history for velocity calculation: camera_id -> {track_id: (last_cx, last_cy, timestamp)}
        self.track_histories: Dict[str, Dict[int, Tuple[float, float, float]]] = defaultdict(dict)

        # Monitored area constants
        self.monitored_area_sqm = 80.0
        self.pixels_per_meter = math.sqrt((800.0 * 500.0) / self.monitored_area_sqm)

        self._init_model()

    def _init_model(self):
        try:
            from ultralytics import YOLO
            import ultralytics
            import yaml

            logger.info(f"Loading YOLOv8 model for real-time person detection: {self.model_name}")
            self.model = YOLO(self.model_name)

            # Load ByteTrack default configuration
            cfg_p = Path(ultralytics.__file__).parent / "cfg" / "trackers" / "bytetrack.yaml"
            if cfg_p.exists():
                with open(cfg_p, "r") as f:
                    cfg_dict = yaml.safe_load(f)
                self._tracker_cfg = SimpleNamespace(**cfg_dict)
            else:
                self._tracker_cfg = SimpleNamespace(
                    tracker_type="bytetrack",
                    track_high_thresh=0.5,
                    track_low_thresh=0.1,
                    new_track_thresh=0.6,
                    track_buffer=30,
                    match_thresh=0.8,
                    fuse_score=True
                )

            self.is_initialized = True
            logger.info("YOLOv8 vision model loaded successfully. Warming up...")
            try:
                dummy = np.zeros((320, 320, 3), dtype=np.uint8)
                self.model.track(source=dummy, persist=True, tracker="bytetrack.yaml", classes=[0], verbose=False)
                logger.info("YOLOv8 vision model warmup complete.")
            except Exception:
                pass
        except (ImportError, ModuleNotFoundError):
            logger.info("Ultralytics package not installed. Vision Engine running in pass-through mode.")
            self.is_initialized = False
        except Exception as exc:
            logger.warning(f"Could not initialize YOLOv8 model: {exc}. Vision Engine running in pass-through mode.")
            self.is_initialized = False

    def _get_or_create_tracker(self, camera_id: str) -> Any:
        """Retrieves or creates an isolated ByteTrack instance for the given camera."""
        if camera_id not in self.camera_trackers:
            try:
                from ultralytics.trackers.byte_tracker import BYTETracker
                self.camera_trackers[camera_id] = BYTETracker(self._tracker_cfg)
            except Exception as e:
                logger.warning(f"Could not instantiate separate BYTETracker for {camera_id}: {e}")
        return self.camera_trackers.get(camera_id)

    def cleanup_camera(self, camera_id: str):
        """Cleans up tracker and velocity history when a camera is removed."""
        cam_str = str(camera_id)
        with self._inference_lock:
            self.camera_trackers.pop(cam_str, None)
            self.track_histories.pop(cam_str, None)
        telemetry_store.remove_camera(cam_str)

    def detect_and_track(self, frame: np.ndarray, camera_id: str = "CAM-01") -> Dict[str, Any]:
        """
        Runs YOLOv8 person detection + ByteTrack tracking on a single downscaled frame.
        Acquires shared inference lock so only one camera runs inference at a time.
        Updates LiveTelemetryStore for camera_id and returns detected bounding boxes.
        """
        if frame is None or frame.size == 0 or not self.is_initialized or self.model is None:
            return {"boxes": [], "crowd_count": 0, "density": 0.0, "avg_speed": 0.0}

        orig_h, orig_w = frame.shape[:2]

        # Downscale frame for fast inference (max 640px width)
        if orig_w > 640:
            scale_factor = 640.0 / orig_w
            det_w = 640
            det_h = int(orig_h * scale_factor)
            det_img = cv2.resize(frame, (det_w, det_h))
        else:
            scale_factor = 1.0
            det_w = orig_w
            det_h = orig_h
            det_img = frame

        detected_boxes = []
        pedestrians = []
        speeds = []
        flow_vx_list = []
        flow_vy_list = []
        heatmap_points = []
        now = time.time()
        cam_str = str(camera_id)

        with self._inference_lock:
            try:
                # Ensure camera has its own tracker predictor
                tracker = self._get_or_create_tracker(cam_str)
                if tracker is not None and hasattr(self.model, "predictor") and self.model.predictor is not None:
                    self.model.predictor.trackers = [tracker]

                results = self.model.track(
                    source=det_img,
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
                        cam_history = self.track_histories[cam_str]

                        for box in boxes:
                            coords = box.xyxy[0].cpu().numpy()
                            # Scale box coordinates back to original frame dimensions
                            x1 = float(coords[0]) / scale_factor
                            y1 = float(coords[1]) / scale_factor
                            x2 = float(coords[2]) / scale_factor
                            y2 = float(coords[3]) / scale_factor

                            track_id = int(box.id[0].cpu().numpy()) if box.id is not None else int(np.random.randint(1000, 9999))
                            confidence = float(box.conf[0].cpu().numpy()) if box.conf is not None else 0.5

                            cx = (x1 + x2) / 2.0
                            cy = (y1 + y2) / 2.0

                            # Map to 2D canvas space (800 x 500)
                            map_x = round((cx / orig_w) * 800.0, 1)
                            map_y = round((cy / orig_h) * 500.0, 1)

                            vx, vy = 0.0, 0.0
                            speed = 0.0
                            if track_id in cam_history:
                                prev_x, prev_y, prev_t = cam_history[track_id]
                                dt = max(0.01, now - prev_t)
                                if dt < 2.0:
                                    vx = ((map_x - prev_x) / dt) / self.pixels_per_meter
                                    vy = ((map_y - prev_y) / dt) / self.pixels_per_meter
                                    raw_speed = math.sqrt(vx**2 + vy**2)
                                    speed = min(raw_speed, 12.0)

                            cam_history[track_id] = (map_x, map_y, now)

                            speeds.append(speed)
                            flow_vx_list.append(vx)
                            flow_vy_list.append(vy)
                            heatmap_points.append((map_x, map_y))

                            color = (0, 229, 255) if speed < 2.5 else (0, 102, 255)

                            detected_boxes.append({
                                "x1": int(x1), "y1": int(y1), "x2": int(x2), "y2": int(y2),
                                "cx": int(cx), "cy": int(cy),
                                "track_id": track_id,
                                "confidence": confidence,
                                "speed": speed,
                                "vx": vx, "vy": vy,
                                "color": color
                            })

                            pedestrians.append({
                                "id": f"{cam_str}_{track_id}",
                                "raw_track_id": track_id,
                                "x": map_x,
                                "y": map_y,
                                "vx": round(vx, 2),
                                "vy": round(vy, 2),
                                "speed": round(speed, 2),
                                "color": "cyan" if speed < 2.5 else "orange",
                                "confidence": round(confidence, 2)
                            })

                        # Clean stale tracks from track history
                        stale_ids = [tid for tid, (_, _, t) in cam_history.items() if now - t > 3.0]
                        for tid in stale_ids:
                            del cam_history[tid]

                crowd_count = len(pedestrians)
                density = crowd_count / self.monitored_area_sqm
                avg_speed = float(np.mean(speeds)) if speeds else 0.0
                avg_vx = float(np.mean(flow_vx_list)) if flow_vx_list else 0.0
                avg_vy = float(np.mean(flow_vy_list)) if flow_vy_list else 0.0

                angle = math.degrees(math.atan2(avg_vx, -avg_vy))
                if angle < 0:
                    angle += 360.0

                heatmap_cells = []
                if heatmap_points:
                    grid_counts = {}
                    for px, py in heatmap_points:
                        gx = int(px // 100) * 100 + 50
                        gy = int(py // 100) * 100 + 50
                        grid_counts[(gx, gy)] = grid_counts.get((gx, gy), 0) + 1
                    for (gx, gy), count in grid_counts.items():
                        weight = min(1.0, round(count / 5.0, 2))
                        heatmap_cells.append({"x": gx, "y": gy, "weight": weight})

                # Update central LiveTelemetryStore for this specific camera
                telemetry_store.update(
                    camera_id=cam_str,
                    pedestrians=pedestrians,
                    crowd_count=crowd_count,
                    density=density,
                    avg_speed=avg_speed,
                    flow_vx=avg_vx,
                    flow_vy=avg_vy,
                    flow_angle=angle,
                    heatmap=heatmap_cells
                )

                return {
                    "boxes": detected_boxes,
                    "crowd_count": crowd_count,
                    "density": density,
                    "avg_speed": avg_speed,
                    "timestamp": now
                }
            except Exception as exc:
                logger.error(f"Error in detect_and_track for {cam_str}: {exc}")
                return {"boxes": [], "crowd_count": 0, "density": 0.0, "avg_speed": 0.0}

    def draw_annotations(
        self,
        frame: np.ndarray,
        detections: Optional[Dict[str, Any]] = None,
        camera_name: str = "",
        source_type: str = ""
    ) -> np.ndarray:
        """
        Draws bounding boxes, track labels, and HUD overlay onto the display frame.
        Runs quickly on every rendered frame (~25-30 FPS) without running inference.
        """
        if frame is None or frame.size == 0:
            return frame

        crowd_count = 0
        density = 0.0
        avg_speed = 0.0

        if detections:
            crowd_count = detections.get("crowd_count", 0)
            density = detections.get("density", 0.0)
            avg_speed = detections.get("avg_speed", 0.0)
            boxes = detections.get("boxes", [])

            for b in boxes:
                x1, y1, x2, y2 = b["x1"], b["y1"], b["x2"], b["y2"]
                color = b.get("color", (0, 229, 255))
                track_id = b.get("track_id", 0)
                conf = b.get("confidence", 0.5)
                cx = b.get("cx", (x1 + x2) // 2)
                cy = b.get("cy", (y1 + y2) // 2)
                vx = b.get("vx", 0.0)
                vy = b.get("vy", 0.0)

                # Draw bounding box
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                # Label tag
                label = f"ID:{track_id} {conf:.2f}"
                cv2.putText(frame, label, (x1, max(15, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

                # Tracking dot & direction vector
                cv2.circle(frame, (cx, cy), 3, (0, 255, 0), -1)
                if abs(vx) > 0.1 or abs(vy) > 0.1:
                    end_x = int(cx + vx * self.pixels_per_meter * 0.1)
                    end_y = int(cy + vy * self.pixels_per_meter * 0.1)
                    cv2.line(frame, (cx, cy), (end_x, end_y), (0, 255, 255), 2)

        # Draw Live HUD Panel
        cv2.rectangle(frame, (10, 10), (340, 105), (15, 10, 29), -1)
        cv2.rectangle(frame, (10, 10), (340, 105), (0, 229, 255), 1)

        header_title = f"{camera_name[:18]} [{source_type}]" if camera_name else "YOLOv8n + ByteTrack | LIVE"
        cv2.putText(frame, header_title, (20, 32),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 229, 255), 1)
        cv2.putText(frame, f"Detected Persons: {crowd_count}", (20, 56),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 128), 1)
        cv2.putText(frame, f"Density: {density:.2f} p/m2 | Speed: {avg_speed:.2f}", (20, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (226, 232, 240), 1)

        # Stream type badge
        if source_type == "USB_WEBCAM":
            cv2.putText(frame, "USB WEBCAM", (20, frame.shape[0] - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 128), 1)
        elif source_type == "MOBILE_CAMERA":
            cv2.putText(frame, "MOBILE STREAM FEED", (20, frame.shape[0] - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 128, 0), 1)
        else:
            cv2.putText(frame, "RTSP EDGE FEED", (20, frame.shape[0] - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 229, 255), 1)

        return frame

    def process_frame(self, frame: np.ndarray, camera_id: str = "CAM-01") -> np.ndarray:
        """Backward-compatible helper that detects and draws in a single call."""
        detections = self.detect_and_track(frame, camera_id)
        return self.draw_annotations(frame, detections)


# Singleton instance
vision_engine = VisionEngine()
