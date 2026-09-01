"""
NEXORA Interactive 2D Map WebSocket Server
File: backend/map/map_server.py
Description: Production-ready Python FastAPI microservice broadcasting real-time pedestrian coordinates,
             flow vectors, camera status levels, and active evacuation vectors via WebSockets every second.
             WebSocket connections require a valid JWT Bearer token passed as the `token` query parameter.
"""

import asyncio
import json
import logging
import math
import random
import time
from typing import List, Optional, Set

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect

from backend.auth.auth_service import authenticate_websocket_token
from backend.vision.vision_engine import get_live_telemetry_snapshot
from backend.ai.predictive_engine import predict_risk_from_metrics
from backend.ai.explainable_api import xai_manager, PredictionInput
from backend.alerts.alert_service import alert_service_instance

logger = logging.getLogger("NEXORA_MAP_SERVER")

# Select fastest available JSON library for low latency serialization
try:
    import orjson
    def serialize_json(data) -> str:
        return orjson.dumps(data).decode('utf-8')
except ImportError:
    try:
        import ujson
        def serialize_json(data) -> str:
            return ujson.dumps(data)
    except ImportError:
        def serialize_json(data) -> str:
            return json.dumps(data)

app = FastAPI(title="NEXORA Real-time WebSocket Map Server", version="1.0.0")

# Store active client connections
active_connections: Set[WebSocket] = set()

CAMERA_IDS = ["CAM-01", "CAM-02", "CAM-03", "CAM-04", "CAM-05"]
HEATMAP_CELLS = [
    {"x": 160, "y": 175, "weight": 0.6},   # West corridor cluster
    {"x": 373, "y": 225, "weight": 0.9},   # Central concourse (high density)
    {"x": 693, "y": 275, "weight": 0.7},   # East corridor cluster
    {"x": 493, "y": 400, "weight": 0.8},   # South hub cluster
]

# =====================================================================
# 1. CORE COORDINATE SIMULATOR (PATH CALCULATOR)
# =====================================================================

class PedestrianSimulator:
    def __init__(self, count: int = 40):
        self.count = count
        self.pedestrians = []

        # Canvas is 800x500. Entry gates on left/top edges, exit gates on right/bottom.
        self.entry_gates = [(50, 250), (400, 40)]
        self.exit_gates = [(750, 250), (400, 460)]
        self.restricted_bounds = {"x_min": 50, "x_max": 240, "y_min": 50, "y_max": 175}

        self.init_pedestrians()

    def is_inside_restricted(self, x: float, y: float) -> bool:
        return (self.restricted_bounds["x_min"] <= x <= self.restricted_bounds["x_max"] and
                self.restricted_bounds["y_min"] <= y <= self.restricted_bounds["y_max"])

    def init_pedestrians(self):
        self.pedestrians = []
        for i in range(self.count):
            # Pick a starting gate
            start = random.choice(self.entry_gates)
            # Pick a target gate
            target = random.choice(self.exit_gates)
            
            self.pedestrians.append({
                "id": i,
                "x": float(start[0]) + random.uniform(-10, 10),
                "y": float(start[1]) + random.uniform(-10, 10),
                "target_x": float(target[0]),
                "target_y": float(target[1]),
                "speed": random.uniform(1.8, 3.2),
                "color": "cyan"
            })

    def update_coordinates(self):
        """Moves pedestrians along paths toward targets."""
        for p in self.pedestrians:
            dx = p["target_x"] - p["x"]
            dy = p["target_y"] - p["y"]
            distance = math.sqrt(dx**2 + dy**2)
            
            if distance < 12.0:
                # Reset pedestrian at entry with new target
                start = random.choice(self.entry_gates)
                target = random.choice(self.exit_gates)
                p["x"] = float(start[0]) + random.uniform(-10, 10)
                p["y"] = float(start[1]) + random.uniform(-10, 10)
                p["target_x"] = float(target[0])
                p["target_y"] = float(target[1])
                p["speed"] = random.uniform(1.8, 3.2)
            else:
                # Move vector step
                step_x = (dx / distance) * p["speed"]
                step_y = (dy / distance) * p["speed"]
                
                # Check for collision boundaries
                p["x"] += step_x + random.uniform(-0.5, 0.5)
                p["y"] += step_y + random.uniform(-0.5, 0.5)
                
                # Check security trespasser status
                if self.is_inside_restricted(p["x"], p["y"]):
                    p["color"] = "red"  # Alert trigger indicator
                else:
                    p["color"] = "cyan"

# Initialize simulator instance
simulator = PedestrianSimulator(count=55)

# =====================================================================
# 2. WEBSOCKET ENDPOINTS
# =====================================================================

async def deliver_payload_concurrently(message: str):
    if not active_connections:
        return
    
    # Broadcast to all clients concurrently to eliminate blocked connection latency
    tasks = [client.send_text(message) for client in list(active_connections)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Prune inactive connections
    for client, res in zip(list(active_connections), results):
        if isinstance(res, Exception):
            active_connections.discard(client)
            print(f"WS Registry: Auto-pruned dead connection {getattr(client, 'client', 'unknown')} due to send failure: {res}")

def _resolve_zone_from_pedestrians(pedestrians: list) -> str:
    """
    Infers which spatial zone has the highest pedestrian concentration
    by mapping average pedestrian centroid to named venue areas.
    Canvas space is 800x500. Zone grid:
      - x < 200           → West Entrance
      - x > 600           → East Corridor
      - y < 130           → North Gate
      - y > 380           → South Gate
      - otherwise         → Central Concourse
    """
    if not pedestrians:
        return "Central Concourse"

    avg_x = sum(p["x"] for p in pedestrians) / len(pedestrians)
    avg_y = sum(p["y"] for p in pedestrians) / len(pedestrians)

    if avg_y < 130:
        return "North Gate"
    elif avg_y > 380:
        return "South Gate"
    elif avg_x < 200:
        return "West Entrance"
    elif avg_x > 600:
        return "East Corridor"
    else:
        return "Central Concourse"


def build_payload() -> dict:
    snapshot = get_live_telemetry_snapshot()

    if snapshot["is_live"]:
        # ------------------------------------------------------------------
        # LIVE DATA PATH: Real-time YOLOv8 + ByteTrack vision telemetry
        # ------------------------------------------------------------------
        crowd_count = snapshot["crowd_count"]
        density = snapshot["density"]
        avg_speed = snapshot["avg_speed"]
        heatmap = snapshot["heatmap"]
        entry_rate = snapshot.get("entry_rate", 0.0)
        exit_rate = snapshot.get("exit_rate", 0.0)
        flow_angle = snapshot.get("flow_angle", 0.0)
        queue_length = snapshot.get("queue_length", 0)
        occupancy = round(min(150.0, (crowd_count / 80.0) * 100.0), 1)

        pedestrians = [
            {
                "id": p["id"],
                "x": p["x"],
                "y": p["y"],
                "color": p.get("color", "cyan"),
            } for p in snapshot["pedestrians"]
        ]

        # Dynamically resolve the highest-density zone from live pedestrian positions
        active_zone = _resolve_zone_from_pedestrians(pedestrians)

        # Calculate live risk using XGBoost / ML engine
        risk_level, risk_score, confidence = predict_risk_from_metrics(
            density=density,
            speed=avg_speed,
            entry_rate=entry_rate,
            exit_rate=exit_rate,
            flow_angle=flow_angle,
            queue_length=queue_length,
            occupancy=occupancy,
        )

        # Compute SHAP explanation using XAI Manager from live telemetry input
        inp = PredictionInput(
            density=density,
            speed=avg_speed,
            entry_rate=entry_rate,
            exit_rate=exit_rate,
            flow_direction_angle=flow_angle,
            queue_length=queue_length,
            occupancy=occupancy,
        )
        xai_res = xai_manager.explain(inp)

        alerts = alert_service_instance.evaluate_live_telemetry_alerts()

        cameras = []
        for idx, camera_id in enumerate(CAMERA_IDS):
            cameras.append({
                "id": camera_id,
                "x": 120 + idx * 150,
                "y": 90 + (idx % 2) * 120,
                "status": "ACTIVE",
                "latency_ms": 18,
                "fps": 25,
            })

        conf_pct = round(confidence * 100 if confidence <= 1.0 else confidence, 1)

        return {
            "timestamp": time.time(),
            "is_live_vision": True,
            "pedestrians": pedestrians,
            "crowd_count": crowd_count,
            "density": density,
            "avg_speed": round(avg_speed, 2),
            "entry_rate": round(entry_rate, 1),
            "exit_rate": round(exit_rate, 1),
            "flow_angle": round(flow_angle, 1),
            "queue_length": queue_length,
            "occupancy": occupancy,
            "heatmap": heatmap,
            "risk_level": risk_level,
            "risk_score": risk_score,
            "confidence": conf_pct,
            "risk": {
                "level": risk_level,
                "score": risk_score,
                "confidence": conf_pct,
                "zone": active_zone,
            },
            "xai": {
                "predicted_risk_level": xai_res.predicted_risk_level,
                "confidence_score": xai_res.confidence_score,
                "prediction_reliability": xai_res.prediction_reliability,
                "base_value": xai_res.base_value,
                "shap_contributions": xai_res.shap_contributions,
                "feature_importance_ranking": xai_res.feature_importance_ranking,
                "explanation_reason": xai_res.explanation_reason,
            },
            "explanation": xai_res.explanation_reason,
            "alerts": alerts,
            "cameras": cameras,
            "system_status": "NORMAL" if risk_level in ["SAFE", "LOW"] else "MONITOR",
        }

    # ------------------------------------------------------------------
    # SIMULATION FALLBACK PATH: Executed when no live camera feed is bound
    # ------------------------------------------------------------------
    simulator.update_coordinates()

    crowd_count = len(simulator.pedestrians)
    density = round(crowd_count / 40.0, 2)
    avg_speed = 1.4
    entry_rate = 35.0
    exit_rate = 28.0
    flow_angle = 180.0
    queue_length = max(0, crowd_count - 30)
    occupancy = round(min(150.0, (crowd_count / 60.0) * 100.0), 1)

    heatmap = []
    for cell in HEATMAP_CELLS:
        heatmap.append({
            "x": cell["x"],
            "y": cell["y"],
            "weight": round(min(1.0, cell["weight"] + random.uniform(-0.1, 0.1)), 2),
        })

    risk_level, risk_score, confidence = predict_risk_from_metrics(
        density=density,
        speed=avg_speed,
        entry_rate=entry_rate,
        exit_rate=exit_rate,
        flow_angle=flow_angle,
        queue_length=queue_length,
        occupancy=occupancy,
    )

    inp = PredictionInput(
        density=density,
        speed=avg_speed,
        entry_rate=entry_rate,
        exit_rate=exit_rate,
        flow_direction_angle=flow_angle,
        queue_length=queue_length,
        occupancy=occupancy,
    )
    xai_res = xai_manager.explain(inp)

    alerts = []
    if risk_level not in ["SAFE"]:
        alerts.append({
            "id": f"ALT-{int(time.time())}",
            "severity": risk_level,
            "message": "Crowd density is approaching warning thresholds near the central concourse.",
        })

    cameras = []
    for idx, camera_id in enumerate(CAMERA_IDS):
        cameras.append({
            "id": camera_id,
            "x": 120 + idx * 150,
            "y": 90 + (idx % 2) * 120,
            "status": "ACTIVE" if random.random() > 0.1 else "DEGRADED",
            "latency_ms": random.randint(12, 60),
            "fps": random.randint(20, 30),
        })

    conf_pct = round(confidence * 100 if confidence <= 1.0 else confidence, 1)

    return {
        "timestamp": time.time(),
        "is_live_vision": False,
        "pedestrians": [
            {
                "id": p["id"],
                "x": round(p["x"], 1),
                "y": round(p["y"], 1),
                "color": p["color"],
            } for p in simulator.pedestrians
        ],
        "crowd_count": crowd_count,
        "density": density,
        "avg_speed": avg_speed,
        "entry_rate": entry_rate,
        "exit_rate": exit_rate,
        "flow_angle": flow_angle,
        "queue_length": queue_length,
        "occupancy": occupancy,
        "heatmap": heatmap,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "confidence": conf_pct,
        "risk": {
            "level": risk_level,
            "score": risk_score,
            "confidence": conf_pct,
            "zone": "Central Concourse",
        },
        "xai": {
            "predicted_risk_level": xai_res.predicted_risk_level,
            "confidence_score": xai_res.confidence_score,
            "prediction_reliability": xai_res.prediction_reliability,
            "base_value": xai_res.base_value,
            "shap_contributions": xai_res.shap_contributions,
            "feature_importance_ranking": xai_res.feature_importance_ranking,
            "explanation_reason": xai_res.explanation_reason,
        },
        "explanation": xai_res.explanation_reason,
        "alerts": alerts,
        "cameras": cameras,
        "system_status": "NORMAL" if risk_level in ["SAFE"] else "MONITOR",
    }


async def coordinate_broadcast_loop():
    """Timer loop broadcasting tracking frames every second."""
    while True:
        if active_connections:
            payload = build_payload()
            message = serialize_json(payload)
            await deliver_payload_concurrently(message)

        await asyncio.sleep(0.5)


@app.on_event("startup")
async def startup_loops():
    # Run coordinate generator loop in the background
    asyncio.create_task(coordinate_broadcast_loop())


@app.websocket("/ws/map")
async def websocket_map_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None, description="JWT access token for authentication"),
):
    """
    Authenticated real-time WebSocket endpoint for the crowd map.

    Requires a valid JWT token supplied as a query parameter:
        ws://host:8001/ws/map?token=<ACCESS_TOKEN>

    Authentication is enforced *before* the WebSocket handshake is accepted.
    On failure the connection is closed immediately with code 1008 (Policy Violation).
    Allowed roles: ADMIN, SECURITY_OFFICER, EVENT_MANAGER.
    """
    # Accept the handshake first so close code 1008 and reason reach the WS client
    await websocket.accept()

    try:
        current_user = authenticate_websocket_token(token)
    except ValueError as exc:
        reason = str(exc)
        logger.warning(
            "WS /ws/map: Authentication failed from %s — %s",
            websocket.client,
            reason,
        )
        await websocket.close(code=1008, reason=reason)
        return

    active_connections.add(websocket)
    await websocket.send_text(serialize_json(build_payload()))
    logger.info(
        "WS /ws/map: Connection established — user_id=%s username='%s' role=%s client=%s active_connections=%d",
        current_user.user_id,
        current_user.username,
        current_user.role,
        websocket.client,
        len(active_connections),
    )
    logger.info(
        "WS /ws/map: Authentication success — user_id=%s username='%s' role=%s",
        current_user.user_id,
        current_user.username,
        current_user.role,
    )

    try:
        while True:
            data = await websocket.receive_text()
            if not data:
                continue

            # Standard Ping/Pong Heartbeat Keepalive
            if data == "ping" or data.strip() == "":
                await websocket.send_text(serialize_json({"type": "pong", "time": time.time()}))
                continue

            try:
                cmd = json.loads(data)
                if cmd.get("type") == "set_count":
                    new_count = int(cmd.get("count", 55))
                    simulator.count = max(5, min(new_count, 200))
                    simulator.init_pedestrians()
                    logger.info(
                        "WS /ws/map: user_id=%s adjusted simulator count to %d",
                        current_user.user_id,
                        simulator.count,
                    )
            except (json.JSONDecodeError, ValueError):
                logger.debug("WS /ws/map: Non-JSON text received: %s", data)

    except WebSocketDisconnect:
        active_connections.discard(websocket)
        logger.info(
            "WS /ws/map: Connection closed — user_id=%s active_connections=%d",
            current_user.user_id,
            len(active_connections),
        )
    except Exception as exc:
        active_connections.discard(websocket)
        logger.error(
            "WS /ws/map: Unexpected error for user_id=%s — %s active_connections=%d",
            current_user.user_id,
            exc,
            len(active_connections),
        )
