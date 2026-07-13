# NEXORA Developer & Integration Guide

This guide is designed for developers, systems integration leads, and DevOps engineers maintaining or extending the NEXORA platform codebase.

---

## 1. Codebase Directory Map

```
nexora-monorepo/
├── ai/                      # Computer vision, YOLO models, and ByteTrack configurations
├── backend/                 # Backend codebase split by services
│   ├── ai/                  # ML serving, XGBoost predictors, and SHAP explainability APIs
│   ├── alerts/              # Database alert persistence services
│   ├── analytics/           # Crowd flow analytics and direction indicators services
│   ├── auth/                # Security gate, JWT claims, and roles middleware
│   ├── map/                 # FastAPI WebSocket broadcast servers
│   └── reports/             # Structured CSV & HTML report generators
├── frontend/                # Static HTML client templates and optimized CSS frameworks
├── tests/                   # Pytest verification suite (unit and integration tests)
└── README.md                # System quickstart guide
```

---

## 2. Code Standards & Architectural Rules

To maintain high throughput and reliability across services, developers must follow these four core guidelines:

### 2.1 Database Operations & Context-Managed Session Safety
Directly injecting database sessions or leaving sessions open can lead to pool exhaustion. Always wrap Postgres operations in database context manager sessions:
```python
with get_db_session() as session:
    analytics_record = session.query(CrowdAnalyticsLog).filter_by(camera_id=cid).first()
    # Transaction commits automatically at block exit on success
```

### 2.2 Ingress and Video Streaming Concurrency (FastAPI Generator)
Never use synchronous long-running `while` loops inside FastAPI paths. Doing so blocks the event loop and starves other requests. Video streaming routes must return an **`async` generator** and utilize non-blocking sleeps:
```python
async def frame_stream_generator(camera_id: str):
    while True:
        # Offload blocking CPU-heavy frame reads to background thread executors
        frame = await run_in_threadpool(cv2_capture_read)
        if frame is None:
            break
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
        # Non-blocking sleep keeps the main event loop thread free
        await asyncio.sleep(0.04) 
```

### 2.3 Style Tokens & Vanilla CSS
Ensure the frontend matches the dark high-impact control center theme definitions. Utilize custom CSS variables specified in `frontend/index.css` directly:
* Core Space Background: `var(--bg-primary)` (`#0A0F1D`)
* Container Base card: `var(--bg-secondary)` (`#121829`)
* System Focus Border: `var(--border-subtle)` (`#1E2942`)
* Electric Cyan Accent: `var(--accent-cyan)` (`#00E5FF`)
* Safe emerald: `var(--status-green)` (`#00E5A3`)
* Cautionary Warning: `var(--status-yellow)` (`#FFB300`)
* Critical Alert: `var(--status-red)` (`#FF2A54`)

### 2.4 ML Explanation Caching Rules
When adding new inputs to the ML forecasting model, ensure the caching layer inside `explainable_api.py` is updated accordingly. Verify that new feature parameters are included in the hashed key format:
```python
# Convert parameters to rounded, hashable tuples
cache_key = (
    round(data.new_feature, 1),
    # ...
)
```
Ensure that cache hits return deep copies of the cached objects with a **fresh prediction ID** (UUID) assigned to maintain trace integrity.

---

## 3. Operations Verification & Testing Strategy

Initialize mock data and execute the validation suite.

### 3.1 Executing unit and Integration Tests
```bash
# Run the complete test suite
pytest -v

# Run the test suite with coverage reporting
pytest --cov=backend --cov-report=term-missing
```

### 3.2 Simulating High Throughput WebSockets
To run stress-tests verifying WebSocket broadcast rates and performance limits under mock load:
```bash
locust -f tests/performance_locust.py --headless -u 500 -r 20 --run-time 5m
```

---

## 4. Integration Roadmap

1. **PostGIS Spatial Geofencing**: Build spatial fence logic using PostGIS `ST_Contains` query operations to catch restricted access entry breaches automatically.
2. **GPU Video Decoding Pipeline**: Migrate the initial CPU OpenCV frame-reader to GPU-based decoders (such as NVIDIA DeepStream or GStreamer plugins) using NVDEC.
3. **Decentralized Redis Pub/Sub**: When scaling past 50 concurrent command center monitors, move the internal Python WebSocket client registry to a Redis Pub/Sub model.
