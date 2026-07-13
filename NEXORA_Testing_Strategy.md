# NEXORA Platform Testing Strategy

This document details the multi-layered testing strategy and engineering practices to assure reliability, security, policy compliance, and high throughput across the NEXORA Platform.

---

## 🔍 1. Testing Taxonomy & Scope

```
                      +-----------------------------+
                      |       Stress & Load         | -> Locust / k6 (10k Conns)
                      +-----------------------------+
                      |        Performance          | -> Memory Profilers / latency checks
                      +-----------------------------+
                      |   API Integration Testing   | -> Pytest TestClient (RBAC, Endpoints)
                      +-----------------------------+
                      |        Unit Testing         | -> Isolated Functions (Speed, JWT, SHAP)
                      +-----------------------------+
```

### A. Unit Testing
*   **Goal:** Validate pure algorithms, mathematical tools, and isolated database schemas.
*   **Key Focus Areas:**
    *   **Vector Geometry & Speed:** Transforming speed vectors to cardinal directions (`N`, `NE`, etc.) in `analytics_service.py`.
    *   **Cryptographic Operations:** Password hashing, verification parameters, and claims signatures signature checks in `auth_service.py`.
    *   **Explanation Scores:** Reliability scales computation in explainable API pipelines.

### B. Integration Testing
*   **Goal:** Verify database transitions, cross-service flow data logic, and background coordinate threads.
*   **Key Focus Areas:**
    *   **Telemetry Persistence:** Verifying that incoming Vision Engine payloads map to SQL fields and trigger corresponding calculations.
    *   **DB Transactions Integrity:** Ensuring database session rollback constraints work under failed alert submissions.
    *   **Background Tasks:** Ensuring the WebSocket map simulation loop runs asynchronously without blocking active connections.

### C. API Testing
*   **Goal:** Verify authorization decorators, status codes, query validation, and routing response structures.
*   **Key Focus Areas:**
    *   **Role-Based Access Control (RBAC):** Validating path permissions for `ADMIN`, `SECURITY_OFFICER`, and `EVENT_MANAGER`.
    *   **Token Rotation Lifecycle:** Testing register -> login -> request resource -> refresh token expiry -> logout blacklisting loops.
    *   **Input Param Bounds:** Enforcing validation constraints (e.g., negative queue lengths, invalid cameras UUIDs).

### D. Performance Testing
*   **Goal:** Verify end-to-end metrics processing under high throughput.
*   **Key Focus Areas:**
    *   **WebSockets Frame Rate:** Awaiting map feeds and establishing 2Hz ticker transmission times.
    *   **Latency Index:** Keeping frame-read to render latency sub-100ms under standard operational loads.
    *   **Serialization Speeds:** Profiling JSON serialization latency using fastest libraries.

### E. Stress Testing
*   **Goal:** Measure connection exhaustion limits and database deadlock resilience.
*   **Key Focus Areas:**
    *   **Connections Scaling:** Testing WebSocket server performance under 1,000+ active listeners.
    *   **Database Ingestion:** Asserting queue lock limits on camera statistics indexes during rapid concurrent writes.

---

## 🛠️ 2. Pytest Repository Structure

We structure tests under the `tests/` directory with specific modules targeting each platform subsystem:

```
tests/
├── conftest.py             # Global pytest fixtures (DB session, mock data, API clients)
├── test_auth.py            # JWT and RBAC endpoints validations
├── test_analytics.py       # Metrics calculations and database logs mapping
├── test_predictive.py      # XGBoost and SHAP explanation APIs
├── test_alerts.py          # Alert insertions and operator acknowledgements
├── test_map_server.py      # WebSocket connections and microsecond pings
└── test_reports_api.py     # CSV exports and print-ready PDF/HTML compiles
```

---

## ⚙️ 3. Execution Commands

### Run All Tests
```bash
pytest -v
```

### Run Coverage Reports
```bash
pytest --cov=backend --cov-report=term-missing
```

### Performance Tests Command (Locust)
```bash
locust -f tests/performance_locust.py --headless -u 500 -r 20 --run-time 5m
```
