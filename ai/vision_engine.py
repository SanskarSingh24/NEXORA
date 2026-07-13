"""
NEXORA AI Vision Engine
File: ai/vision_engine.py
Description: Production-ready modular Python class implementing YOLOv11 person detection,
             ByteTrack object tracking, line-crossing counting (entries/exits),
             velocity-based queue detection, crowd density calculation, and flow directions.
"""

import math
import numpy as np
import cv2  # OpenCV for frame drawing and data visualization

# Try to import Ultralytics YOLO. If not present: fall back gracefully to dummy detections.
try:
    from ultralytics import YOLO
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False
    print("WARNING: 'ultralytics' library not installed. AI Vision Engine will run in Simulation Mode.")

# =====================================================================
# 1. HELPER CLASSES & STRUCTURES
# =====================================================================

class TrackedPerson:
    """Refers to an individual tracked subject and their path history."""
    def __init__(self, track_id: int, centroid: tuple):
        self.track_id = track_id
        self.points_history = [centroid]  # List of centroids (x, y) over time
        self.velocities = []                # List of speeds (pixels per frame)
        self.last_updated = 0               # Frame counter stamp
        
    def add_point(self, centroid: tuple, frame_index: int):
        self.points_history.append(centroid)
        self.last_updated = frame_index
        # Keep last 30 frames of history to calculate speed trends
        if len(self.points_history) > 30:
            self.points_history.pop(0)

        # Calculate speed vectors
        if len(self.points_history) >= 2:
            dx = self.points_history[-1][0] - self.points_history[-2][0]
            dy = self.points_history[-1][1] - self.points_history[-2][1]
            self.velocities.append(math.sqrt(dx**2 + dy**2))
            if len(self.velocities) > 15:
                self.velocities.pop(0)

    @property
    def average_speed(self) -> float:
        """Returns the average speed of the tracked subject."""
        if not self.velocities:
            return 0.0
        return sum(self.velocities) / len(self.velocities)

    @property
    def current_direction(self) -> tuple:
        """Returns the current direction vector."""
        if len(self.points_history) < 3:
            return (0.0, 0.0)
        dx = self.points_history[-1][0] - self.points_history[-3][0]
        dy = self.points_history[-1][1] - self.points_history[-3][1]
        magnitude = math.sqrt(dx**2 + dy**2)
        if magnitude == 0:
            return (0.0, 0.0)
        return (dx / magnitude, dy / magnitude)


# =====================================================================
# 2. CORE VISION ENGINE CLASS
# =====================================================================

class AIVisionEngine:
    def __init__(self, 
                 model_path: str = "yolo11n.pt", 
                 zone_polygon: list = None,
                 count_line: tuple = None, 
                 calibration_factor: float = 0.05):
        """
        AI Vision Engine setup parameters.
        :param model_path: Path to the YOLOv11 weights file.
        :param zone_polygon: List of coordinate lists defining the monitored zone, e.g., [[x1, y1], [x2, y2], ...]
        :param count_line: Coordinate line mapping for entry/exit counts, e.g., ((x1, y1), (x2, y2))
        :param calibration_factor: Conversion scale factor (pixels to physical meters)
        """
        # Load Model
        if ULTRALYTICS_AVAILABLE:
            self.model = YOLO(model_path)
        else:
            self.model = None

        # Track Map Configs
        self.tracked_people = {}  # track_id -> TrackedPerson
        self.frame_count = 0
        
        # Spatial Monitoring Configurations
        self.zone_polygon = np.array(zone_polygon, dtype=np.int32) if zone_polygon else None
        self.count_line = count_line  # ((x1, y1), (x2, y2))
        self.calibration_factor = calibration_factor  # converts pixels to meters
        
        # Counter Registers
        self.entry_count = 0
        self.exit_count = 0

    def check_line_crossing(self, prev_point: tuple, current_point: tuple) -> int:
        """
        Determines if a path crosses the counting line.
        Returns:
            +1 if crossing left-to-right (or top-to-bottom) -> Entry.
            -1 if crossing right-to-left (or bottom-to-top) -> Exit.
             0 if no crossing occurs.
        """
        if not self.count_line:
            return 0
        
        # Line Coordinates
        (lx1, ly1), (lx2, ly2) = self.count_line
        px, py = prev_point
        cx, cy = current_point

        # Calculate line equation offsets: Ax + By + C
        # A = y2 - y1, B = x1 - x2, C = x2*y1 - x1*y2
        A = ly2 - ly1
        B = lx1 - lx2
        C = lx2 * ly1 - lx1 * ly2

        prev_val = A * px + B * py + C
        curr_val = A * cx + B * cy + C

        # Sign change indicates the path crossed the line segment
        if (prev_val < 0 and curr_val > 0) or (prev_val > 0 and curr_val < 0):
            # Parametric coordinate validation to ensure connection falls on the actual segment
            # Vector math intersection ratio
            denominator = (cx - px) * (ly2 - ly1) - (cy - py) * (lx2 - lx1)
            if denominator == 0:
                return 0
            
            t = ((lx1 - px) * (ly2 - ly1) - (ly1 - py) * (lx2 - lx1)) / denominator
            if 0.0 <= t <= 1.0:
                # Determine direction: sign of cross product matches travel direction
                direction_vector = (lx2 - lx1, ly2 - ly1)
                travel_vector = (cx - px, cy - py)
                cross_product = travel_vector[0] * direction_vector[1] - travel_vector[1] * direction_vector[0]
                return 1 if cross_product > 0 else -1

        return 0

    def process_frame(self, frame: np.ndarray) -> dict:
        """
        Runs object detection, updates tracking histories, and computes crowd metrics.
        :param frame: Input OpenCV frame matrix.
        :return: Dict containing calculated telemetry metrics.
        """
        self.frame_count += 1
        height, width, _ = frame.shape
        
        # Default fallback values for counting check
        if not self.count_line:
            self.count_line = ((int(width * 0.4), 0), (int(width * 0.4), height))
        if self.zone_polygon is None:
            self.zone_polygon = np.array([
                [int(width * 0.1), int(height * 0.1)],
                [int(width * 0.9), int(height * 0.1)],
                [int(width * 0.9), int(height * 0.9)],
                [int(width * 0.1), int(height * 0.9)]
            ], dtype=np.int32)

        raw_detections = []  # List of bboxes: (x1, y1, x2, y2, track_id)

        # -------------------------------------------------------------
        # STEP 2.A: DETECT AND TRACK (YOLOv11 with ByteTrack)
        # -------------------------------------------------------------
        if self.model:
            # Optimize resource consumption by checking for CUDA GPU hardware acceleration
            # CUDA supports half precision FP16 which is significantly faster and uses 50% less VRAM
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            use_half = (device == "cuda")

            # Run model tracking. Class 0 limits predictions to person detections.
            results = self.model.track(
                source=frame, 
                persist=True, 
                classes=[0], 
                tracker="bytetrack.yaml", 
                verbose=False,
                device=device,
                half=use_half,
                imgsz=640  # Anchor resolution for high-throughput detection
            )
            
            if results and results[0].boxes and results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                track_ids = results[0].boxes.id.cpu().numpy().astype(int)
                for box, track_id in zip(boxes, track_ids):
                    raw_detections.append((int(box[0]), int(box[1]), int(box[2]), int(box[3]), track_id))
        else:
            # Simulation Mode: Generates synthetic detections
            import random
            random.seed(42 + self.frame_count // 5)  # updates detections periodically
            num_people = 10 + int(4 * np.sin(0.01 * self.frame_count))
            for i in range(num_people):
                offset_x = int(60 * np.sin(0.05 * self.frame_count + i))
                offset_y = int(40 * np.cos(0.08 * self.frame_count + i))
                cx = int(width * 0.5) + offset_x + (i * 30 - 150)
                cy = int(height * 0.5) + offset_y
                raw_detections.append((cx - 15, cy - 35, cx + 15, cy + 5, i))

        # -------------------------------------------------------------
        # STEP 2.B: PROCESS TRACK RUN HISTORIES
        # -------------------------------------------------------------
        current_active_ids = set()
        zone_headcount = 0
        total_inflow_vectors = []
        queue_count = 0

        for x1, y1, x2, y2, track_id in raw_detections:
            current_active_ids.add(track_id)
            centroid = (int((x1 + x2) / 2), int((y1 + y2) / 2))
            
            # Update or create tracking history
            if track_id not in self.tracked_people:
                self.tracked_people[track_id] = TrackedPerson(track_id, centroid)
            else:
                prev_centroid = self.tracked_people[track_id].points_history[-1]
                self.tracked_people[track_id].add_point(centroid, self.frame_count)
                
                # Check for line-crossing (Entry/Exit events)
                crossing_status = self.check_line_crossing(prev_centroid, centroid)
                if crossing_status == 1:
                    self.entry_count += 1
                elif crossing_status == -1:
                    self.exit_count += 1

            # Check if tracked subject is inside the defined zone polygon
            is_inside = cv2.pointPolygonTest(self.zone_polygon, centroid, False)
            if is_inside >= 0:
                zone_headcount += 1
                
                # Retrieve velocity metrics
                person = self.tracked_people[track_id]
                total_inflow_vectors.append(person.current_direction)
                
                # Queue Detection: Speed is below threshold (< 2.5 pixels/frame) and points history is active
                if len(person.points_history) > 10 and person.average_speed < 2.5:
                    queue_count += 1

            # Render bounding boxes and tracking IDs on the frame
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 102, 255), 2)
            cv2.circle(frame, centroid, 4, (0, 229, 255), -1)
            cv2.putText(frame, f"ID: {track_id}", (x1, y1 - 8), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (226, 232, 240), 1)

        # Remove dead tracks to free memory, throttled to run every 30 frames to maximize CPU capacity
        if self.frame_count % 30 == 0:
            dead_tracks = [tid for tid, p in self.tracked_people.items() if self.frame_count - p.last_updated > 120]
            for tid in dead_tracks:
                del self.tracked_people[tid]

        # -------------------------------------------------------------
        # STEP 2.C: COMPUTE SYSTEM METRICS
        # -------------------------------------------------------------
        # Calculate crowd density: headcount / physical area in sq. meters
        polygon_area_pixels = cv2.contourArea(self.zone_polygon)
        physical_area_sqm = polygon_area_pixels * (self.calibration_factor ** 2)
        crowd_density = zone_headcount / max(physical_area_sqm, 0.1)

        # Calculate average flow direction vector
        if total_inflow_vectors:
            avg_dx = sum(v[0] for v in total_inflow_vectors) / len(total_inflow_vectors)
            avg_dy = sum(v[1] for v in total_inflow_vectors) / len(total_inflow_vectors)
            flow_direction = (round(avg_dx, 3), round(avg_dy, 3))
        else:
            flow_direction = (0.0, 0.0)

        # -------------------------------------------------------------
        # STEP 2.D: DRAW GRAPHICAL OVERLAYS
        # -------------------------------------------------------------
        # Renders the monitoring zone polygon
        cv2.polylines(frame, [self.zone_polygon], True, (0, 229, 163), 2)
        cv2.putText(frame, "MONITORED ZONE", (self.zone_polygon[0][0], self.zone_polygon[0][1] - 8), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 229, 163), 1)

        # Renders the entry/exit counting line
        (lx1, ly1), (lx2, ly2) = self.count_line
        cv2.line(frame, (lx1, ly1), (lx2, ly2), (255, 179, 0), 2)
        cv2.putText(frame, "COUNT LINE", (lx1 + 10, ly1 + 25), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 179, 0), 1)

        # Summary box overlay
        cv2.rectangle(frame, (10, 10), (280, 170), (18, 24, 41), -1)  # dark background container
        cv2.rectangle(frame, (10, 10), (280, 170), (30, 41, 66), 1)   # border outline
        
        cv2.putText(frame, f"Active Count: {len(raw_detections)}", (20, 35), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (226, 232, 240), 1)
        cv2.putText(frame, f"Zone Headcount: {zone_headcount}", (20, 60), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 229, 255), 1)
        cv2.putText(frame, f"Density: {crowd_density:.2f} ppl/sqm", (20, 85), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 229, 163), 1)
        cv2.putText(frame, f"Queue Count: {queue_count}", (20, 110), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 42, 84), 1)
        cv2.putText(frame, f"Entries / Exits: {self.entry_count} / {self.exit_count}", (20, 135), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 179, 0), 1)
        cv2.putText(frame, f"Flow Velocity: ({flow_direction[0]:.2f}, {flow_direction[1]:.2f})", (20, 160), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (148, 163, 184), 1)

        return {
            "total_headcount": len(raw_detections),
            "zone_headcount": zone_headcount,
            "crowd_density_sqm": round(crowd_density, 3),
            "queue_active_count": queue_count,
            "entry_count": self.entry_count,
            "exit_count": self.exit_count,
            "flow_direction_vector": flow_direction,
            "processed_frame_index": self.frame_count
        }

# =====================================================================
# 3. DIRECT EXECUTION HOOK (FOR TESTING)
# =====================================================================
if __name__ == "__main__":
    # Create static test canvas (simulate camera initialization)
    test_image = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Initialize Engine
    engine = AIVisionEngine(
        model_path="yolo11n.pt",
        zone_polygon=[[50, 50], [590, 50], [590, 430], [50, 430]],
        count_line=((320, 10), (320, 470))
    )
    
    # Run test frame process
    stats = engine.process_frame(test_image)
    print("AI Vision Engine Test Summary:")
    print(stats)
    
    # Save the output verification frame
    cv2.imwrite("vision_test_verification.jpg", test_image)
    print("Verification image saved successfully to: vision_test_verification.jpg")
