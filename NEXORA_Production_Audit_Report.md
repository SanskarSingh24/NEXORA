# NEXORA Platform: Production Audit & Review Report

This report evaluates the codebase stability, database transactions context, machine learning predictors, frontend rendering loops, security vulnerabilities, and deployment topology, providing actionable improvements to make the platform ready for production.

---

## 1. Architectural Architecture Review

### Findings
* Microservices are partitioned into logical scopes (Gateway Core, WebSocket Server, AI Predictor, SHAP explainer).
* In high-throughput settings, each service initializing its own SQLAlchemy engine and connection pool (pool size 20–25 each) leads to database connection limits competition under single PostgreSQL defaults (`max_connections = 100`).

### Suggestions
1. **Shared Database Connection Proxy**: Implement a shared connection router or use **pgBouncer** to pool database links externally.
2. **Event-Driven Pub/Sub**: Transition the WebSocket gateway's direct Python set connection router (`active_connections`) to a distributed message queue (e.g. **Redis Pub/Sub** or **RabbitMQ**). This isolates the stream pipeline from WebSocket link failures, supporting horizontal scaling.

---

## 2. Security Assessment

### Findings
* **Unauthenticated WebSockets**: `/ws/map` instantly accepts connections without verifying access tokens or roles claims:
  ```python
  @app.websocket("/ws/map")
  async def websocket_map_endpoint(websocket: WebSocket):
      await websocket.accept()
  ```
  Anyone on the network can stream georeferenced pedestrian coordinates, camera telemetry, and active alert notifications anonymously.
* **Hardcoded Secret fallbacks**: `auth_service.py` falls back to default secret signature keys if system environment variables are not found:
  ```python
  SECRET_KEY = os.getenv("NEXORA_JWT_SECRET", "super_secure_enterprise_grade_jwt_secret_key...")
  ```
* **Password Hashing Cost Factor**: Password hashing leverages default BCrypt configurations wrapper without custom work factors configurations.

### Suggestions
1. **JWT WebSocket Handshake**: Require connection security checks, rejecting connections if the auth token is missing or expired:
  ```python
  @app.websocket("/ws/map")
  async def websocket_map_endpoint(websocket: WebSocket, token: str = Query(...)):
      try:
          payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
          # ... accept socket
      except JWTError:
          await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
  ```
2. **Mandatory Secrets Injections**: Raise a `RuntimeException` during application initialization if `NEXORA_JWT_SECRET` is not set in environment variables.

---

## 3. AI & ML Pipelines

### Findings
* **Local In-Memory Cache Bounds**: The explanation cache in `explainable_api.py` is stored inside local python memory structures (`self._explanation_cache = {}`). Under horizontally-scaled, multi-worker FastAPI instances (e.g. running 4 Gunicorn worker processes), each process maintains its own cache. This leads to duplicate SHAP calculations across workers.
* **Fallback Simulation**: Local contribution outputs simulate SHAP attributes if SHAP calculations fail or are offline, which is great for local testing but needs strict alerts in production.

### Suggestions
1. **Shared Distributed cache**: Migrate the explanation cache from a local object dictionary to a **Redis cache store**.
2. **Accuracy & Drift Monitoring**: Add execution monitoring metrics tracking divergence between target forecasts (T+15) and empirical TimescaleDB count recordings to detect model drift.

---

## 4. Database Optimization

### Findings
* Indexes on `CrowdAnalyticsLog` and `CrowdAlerts` match target querying scopes.
* Some analytics queries lack pagination limits, exposing the server to memory pressure if users request large historical windows.

### Suggestions
1. **Query Pagination Enforcement**: Force maximum limits (e.g. `limit(2000)`) on query chains looking up historical timelines.
2. **TimescaleDB Compression Policy**: Enable TimescaleDB compression policies on hypertables containing records older than 7 days to reduce storage footprint:
   ```sql
   ALTER TABLE crowd_analytics_log SET (
       timescaledb.compress,
       timescaledb.compress_segmentby = 'camera_id'
   );
   SELECT add_compression_policy('crowd_analytics_log', INTERVAL '7 days');
   ```

---

## 5. Frontend UI & Dashboard

### Findings
* Optimized animation lookups to $O(N)$ reduced CPU frame drops.
* The frontend relies on native browser WebSocket connections and does not implement automatic reconnection loops if the connection drops.

### Suggestions
1. **Exponential WebSocket Backoff**: Update client connection scripts with custom reconnect hooks to handle dropped links automatically:
   ```javascript
   function connectSocket() {
       const ws = new WebSocket(url);
       ws.onclose = () => setTimeout(connectSocket, Math.min(10000, reconnectDelay * 2));
   }
   ```

---

## 6. Project Coding Standards & Folder Tree

### Findings
* Directory layout conforms to DevOps standards.
* Database context isolation manager hooks protect resources.
* Blocking calls (e.g. OpenCV decodes) are correctly offloaded to background threads.
