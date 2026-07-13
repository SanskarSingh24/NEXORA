"""
NEXORA Crowd Analytics Engine Metrics Testing
File: tests/test_analytics.py
"""

from uuid import uuid4
from backend.analytics.analytics_service import CrowdAnalyticsService, CrowdAnalyticsRecord


def test_cardinal_direction_computations():
    # Helper to access static converter method
    convert = CrowdAnalyticsService.calculate_cardinal_direction

    # Test stationary thresholds
    assert convert(0.0, 0.0) == "STATIONARY"
    assert convert(0.02, 0.05) == "STATIONARY"

    # Test major compass headings (note coordinate grid has Y going down in screen space)
    # North: dx=0, dy=-1 (upward motion)
    assert convert(0.0, -1.0) == "N"
    # Northeast: dx=1, dy=-1
    assert convert(1.0, -1.0) == "NE"
    # East: dx=1, dy=0
    assert convert(1.0, 0.0) == "E"
    # South: dx=0, dy=1 (downward motion)
    assert convert(0.0, 1.0) == "S"
    # West: dx=-1, dy=0
    assert convert(-1.0, 0.0) == "W"


def test_save_raw_telemetry_transforms(db_session, mock_vision_payload):
    # Instantiate service using the testing database session factory
    session_factory = lambda: db_session
    service = CrowdAnalyticsService(db_session_factory=session_factory)

    camera_id = uuid4()
    max_cap = 50

    # Execute telemetry logging
    record = service.save_raw_telemetry(
        camera_id=camera_id,
        vision_payload=mock_vision_payload,
        max_capacity=max_cap
    )

    # Assert correct transformation properties
    assert isinstance(record, CrowdAnalyticsRecord)
    assert record.camera_id == camera_id
    assert record.current_count == 28
    
    # Occupancy percentage: 28 / 50 * 100 = 56.0%
    assert record.occupancy_pct == 56.0
    assert record.density_value == 1.15
    assert record.queue_length == 3
    assert record.movement_direction == "NE"


def test_query_aggregate_dashboard_metrics(db_session, mock_vision_payload):
    session_factory = lambda: db_session
    service = CrowdAnalyticsService(db_session_factory=session_factory)

    # 1. Start with no records -> verify defaults
    empty_aggregates = service.query_aggregate_dashboard_metrics()
    assert empty_aggregates["total_network_count"] == 0
    assert empty_aggregates["average_occupancy_pct"] == 0.0

    # 2. Write telemetry log details for two different cameras
    cam1 = uuid4()
    cam2 = uuid4()

    service.save_raw_telemetry(camera_id=cam1, vision_payload=mock_vision_payload, max_capacity=100)
    service.save_raw_telemetry(camera_id=cam2, vision_payload=mock_vision_payload, max_capacity=50)

    # Aggregate calculation
    # cam1: count=28, occupancy=28%
    # cam2: count=28, occupancy=56%
    # total headcount = 56
    # avg occupancy = (28 + 56) / 2 = 42%
    aggregates = service.query_aggregate_dashboard_metrics()
    assert aggregates["total_network_count"] == 56
    assert aggregates["average_occupancy_pct"] == 42.0
    assert aggregates["active_queues"] == 6
