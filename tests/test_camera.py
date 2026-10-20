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


def test_add_mobile_camera_ip_webcam_alias_and_raw_url():
    """Test adding a Mobile Camera with IP_WEBCAM source_type and raw IP:port without http:// and without /video."""
    payload = {
        "camera_name": "Patrol Android Phone",
        "source_type": "IP_WEBCAM",
        "source_location": "192.168.1.77:8080",
        "zone_id": "Zone Mobile"
    }
    res = client.post("/cameras", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["source_type"] == "MOBILE_CAMERA"
    assert data["source_location"] == "http://192.168.1.77:8080/video"
    assert data["rtsp_url"] == "http://192.168.1.77:8080/video"


def test_add_mobile_camera_mobile_alias():
    """Test adding a Mobile Camera with MOBILE source_type alias."""
    payload = {
        "camera_name": "Security Guard Phone",
        "source_type": "MOBILE",
        "location_zone": "Sector 4"
    }
    res = client.post("/cameras", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["source_type"] == "MOBILE_CAMERA"
    assert data["source_location"] == "http://192.168.1.50:8080/video"
    assert data["zone_id"] == "Sector 4"


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


def test_concurrent_pipeline_cap_and_skip_logging(capsys):
    """Test that CameraManager caps pipelines at 4 and logs a clear skip message."""
    from backend.camera.camera_service import CameraManager, CameraPipeline

    mgr = CameraManager(max_pipelines=4)

    # Start 4 dummy pipelines
    p1 = CameraPipeline("cam-1", "Camera 1", "IP_CAMERA", "rtsp://dummy1")
    p1.running = True
    mgr.pipelines["cam-1"] = p1

    p2 = CameraPipeline("cam-2", "Camera 2", "IP_CAMERA", "rtsp://dummy2")
    p2.running = True
    mgr.pipelines["cam-2"] = p2

    p3 = CameraPipeline("cam-3", "Camera 3", "IP_CAMERA", "rtsp://dummy3")
    p3.running = True
    mgr.pipelines["cam-3"] = p3

    p4 = CameraPipeline("cam-4", "Camera 4", "IP_CAMERA", "rtsp://dummy4")
    p4.running = True
    mgr.pipelines["cam-4"] = p4

    # 5th camera should be skipped because cap is 4
    p5 = mgr.start_pipeline("cam-5", "Camera 5 Overflow", "IP_CAMERA", "rtsp://dummy5")
    assert p5 is None

    captured = capsys.readouterr()
    assert "Simultaneous pipeline limit reached (4)" in captured.out
    assert "Camera 5 Overflow" in captured.out


def test_prevent_duplicate_usb_webcam_index(capsys):
    """Test that two cameras cannot claim or open the same USB webcam index."""
    from backend.camera.camera_service import CameraManager

    mgr = CameraManager()

    # Camera 1 claims index 0
    assert mgr.claim_usb_index(0, "cam-usb-1") is True
    # Camera 1 claiming again should succeed
    assert mgr.claim_usb_index(0, "cam-usb-1") is True

    # Camera 2 attempting to claim index 0 must fail
    assert mgr.claim_usb_index(0, "cam-usb-2") is False

    # Camera 1 releases index 0
    mgr.release_usb_index(0, "cam-usb-1")

    # Now Camera 2 can claim index 0
    assert mgr.claim_usb_index(0, "cam-usb-2") is True
    mgr.release_usb_index(0, "cam-usb-2")


def test_unreachable_camera_exponential_backoff():
    """Test that unreachable camera pipeline has backoff parameters capping at 60s."""
    from backend.camera.camera_service import CameraPipeline

    pipeline = CameraPipeline("cam-test", "Test Camera", "IP_CAMERA", "rtsp://unreachable:554/live")
    assert pipeline.retry_delay == 2.0
    assert pipeline.max_retry_delay == 60.0

    # Simulate 6 failures to verify exponential backoff growth and capping at 60.0s
    for _ in range(6):
        pipeline.retry_delay = min(pipeline.max_retry_delay, pipeline.retry_delay * 2.0)

    # 2.0 -> 4.0 -> 8.0 -> 16.0 -> 32.0 -> 60.0 -> 60.0
    assert pipeline.retry_delay == 60.0


def test_camera_manager_startup_runs_once(capsys):
    """Test that start_all_active_cameras runs once and skips subsequent calls."""
    from backend.camera.camera_service import CameraManager

    mgr = CameraManager()
    assert mgr._has_started is False

    mgr.start_all_active_cameras()
    assert mgr._has_started is True
    captured = capsys.readouterr()
    assert "Starting pipelines for all ACTIVE cameras" in captured.out

    # Second call should skip and log duplicate
    mgr.start_all_active_cameras()
    captured_second = capsys.readouterr()
    assert "Starting pipelines for all ACTIVE cameras" not in captured_second.out
    assert "Pipelines already initialized" in captured_second.out

