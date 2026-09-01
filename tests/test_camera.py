"""
NEXORA Camera Management & Multi-Source Test Suite
File: tests/test_camera.py
Description: Tests IP Camera, USB Webcam, and Mobile Camera modes,
             including MJPEG feed endpoints.
"""

import io
from fastapi.testclient import TestClient
from backend.camera.camera_service import app

client = TestClient(app)


def test_add_ip_camera():
    """Test adding a standard IP Camera with RTSP URL."""
    payload = {
        "camera_name": "Test IP Camera",
        "source_type": "IP_CAMERA",
        "source_location": "rtsp://192.168.1.100:554/live",
        "rtsp_url": "rtsp://192.168.1.100:554/live",
        "zone_id": "Zone A"
    }
    res = client.post("/cameras", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["camera_name"] == "Test IP Camera"
    assert data["source_type"] == "IP_CAMERA"
    assert data["source_location"] == "rtsp://192.168.1.100:554/live"


def test_add_usb_webcam():
    """Test adding a Wired/USB Webcam via device index."""
    payload = {
        "camera_name": "Built-in Webcam",
        "source_type": "USB_WEBCAM",
        "source_location": "0",
        "zone_id": "Zone B"
    }
    res = client.post("/cameras", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["source_type"] == "USB_WEBCAM"
    assert data["source_location"] == "0"


def test_add_mobile_camera():
    """Test adding a Mobile Camera via IP Webcam app HTTP/RTSP URL."""
    payload = {
        "camera_name": "Smartphone Security Cam",
        "source_type": "MOBILE_CAMERA",
        "source_location": "http://192.168.1.50:8080/video",
        "zone_id": "Zone C"
    }
    res = client.post("/cameras", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["source_type"] == "MOBILE_CAMERA"
    assert data["source_location"] == "http://192.168.1.50:8080/video"


def test_view_all_cameras():
    """Test GET /cameras endpoint."""
    res = client.get("/cameras")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) >= 3


def test_delete_camera_persists():
    """Test creating a camera, deleting it via DELETE /cameras/{id}, and verifying removal persists."""
    payload = {
        "camera_name": "Temporary Test Camera",
        "source_type": "IP_CAMERA",
        "source_location": "rtsp://10.0.0.99/feed",
        "zone_id": "Temp Zone"
    }
    create_res = client.post("/cameras", json=payload)
    assert create_res.status_code == 201
    cam_id = create_res.json()["camera_id"]

    # Delete camera
    del_res = client.delete(f"/cameras/{cam_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "SUCCESS"

    # Verify camera no longer appears in GET /cameras
    all_res = client.get("/cameras")
    assert all_res.status_code == 200
    camera_ids = [c["camera_id"] for c in all_res.json()]
    assert cam_id not in camera_ids

    # Verify GET /cameras/{id} returns 404
    get_res = client.get(f"/cameras/{cam_id}")
    assert get_res.status_code == 404
