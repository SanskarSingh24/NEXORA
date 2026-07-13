import asyncio
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/api/map", tags=["map"])


@router.get("/summary")
def map_summary() -> dict:
    return {
        "crowd_count": 118,
        "risk_level": "MEDIUM",
        "zone": "Central Concourse",
        "camera_count": 4,
    }


@router.websocket("/ws/map")
async def map_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            payload = {
                "type": "telemetry",
                "timestamp": time.time(),
                "crowd_count": 118,
                "risk_level": "MEDIUM",
                "alerts": ["Crowd pressure rising near North Corridor"],
            }
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        await websocket.close()
