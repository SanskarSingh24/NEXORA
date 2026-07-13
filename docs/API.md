# NEXORA API Reference & WebSocket Protocols

This document details the REST API endpoints, authorization guidelines, CORS settings, security header middleware, and WebSocket wire protocols for the NEXORA platform.

---

## 🔑 1. Security & Authentication Policies

### 1.1 Authorization Bearer Scheme
All API endpoints (except registration and login routes) require authentication. Clients must submit a JSON Web Token (JWT) in the HTTP header:
`Authorization: Bearer <TOKEN>`

### 1.2 Access & Refresh Token Rotation
* **Access Tokens**: Short-lived signatures (expiry: 15 minutes) carrying the user's role claim.
* **Refresh Tokens**: Long-lived signatures (expiry: 7 days) used to spin fresh access tokens without requiring rekeying credentials.
* **Logout Blacklisting**: Logging out adds tokens to a blacklist, revoking intermediate access credentials instantaneously.

### 1.3 CORS Policy & Custom Security Headers
FastAPI services apply strict routing safety filters via custom CORSMiddleware and security middlewares:
* **CORS Limits**: Restricts access to domains listed in environmental variable `NEXORA_ALLOWED_ORIGINS` (defaults to frontend dashboard origins).
* **Frame Protection**: `X-Frame-Options` is set to `DENY` to prevent clickjacking.
* **Content Security Policy (CSP)**: Blocks unapproved injection scripts.
* **HSTS (HTTP Strict Transport Security)**: Re-routes dynamic communication to HTTPS channels.

---

## 🛰️ 2. REST API Endpoints

### 2.1 Authentication & User Routes

#### `POST /auth/register`
Creates an operator profile.
* **Request Payload**:
  ```json
  {
    "username": "operator_east_08",
    "email": "east08@nexora.io",
    "password": "strongPassword123!",
    "role": "SECURITY_OFFICER"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "user_id": "8cbe342a-a101-4478-ad23-e18e38de2121",
    "username": "operator_east_08",
    "role": "SECURITY_OFFICER",
    "is_active": true
  }
  ```

#### `POST /auth/login`
Generates authentication tokens.
* **Query Parameters**:
  * `username_email` (string, required)
  * `password_raw` (string, required)
* **Response (200 OK)**:
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1...",
    "refresh_token": "eyJhbGciOiJIUzI1...",
    "token_type": "bearer",
    "expires_in": 900
  }
  ```

#### `POST /auth/token/refresh`
Rotates the session key using a active refresh token.
* **Request Payload**:
  ```json
  {
    "refresh_token": "eyJhbGciOiJIUzI1..."
  }
  ```
* **Response (200 OK)**: Same as login payload.

#### `POST /auth/logout`
Revokes active auth credentials and ends the operator session.
* **Request Payload**: Same as refresh payload.
* **Response (200 OK)**:
  ```json
  {
    "status": "SUCCESS",
    "message": "Tokens revoked."
  }
  ```

---

### 2.2 Camera Management

#### `POST /cameras`
Registers a new camera. Only accessible by `ADMIN`.
* **Request Payload**:
  ```json
  {
    "camera_name": "Plaza A Entry Escalator",
    "rtsp_url": "rtsp://admin:pass@192.168.1.50:554/stream1",
    "zone_id": "PLAZA_A",
    "coordinates": {"x": 12.35, "y": 84.62},
    "homography_matrix": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
    "max_capacity": 150
  }
  ```
* **Response (201 Created)**: Same schema containing generated `camera_id` and status `ONLINE`.

#### `GET /cameras`
Lists all active cameras.
* **Response (200 OK)**: Array of camera registration records.

#### `GET /cameras/{camera_id}/feed`
Streams live visual MJPEG frames decoded from the camera stream.
* **Response Content-Type**: `multipart/x-mixed-replace; boundary=frame`
* **Concurrency Pattern**: The endpoint runs as an async generator. Frames are decoded in the background via loop thread pool executor offloading to prevent blocking FastAPI’s event loop during heavy payload parsing.

---

### 2.3 Analytics Subsystem

#### `GET /analytics/aggregate`
Retrieves aggregated metrics across the network.
* **Response (200 OK)**:
  ```json
  {
    "total_network_count": 284,
    "average_occupancy_pct": 42.15,
    "active_queues": 32,
    "total_entry_rate_per_min": 68.2
  }
  ```

#### `GET /analytics/history/{camera_id}?minutes_window=60`
Fetches time-series historical records for UI flow charts.
* **Response (200 OK)**:
  ```json
  [
    {
      "log_id": "5cbda32b-9801-4478-ad23-e12334812323",
      "timestamp": "2026-07-13T01:18:00Z",
      "current_count": 34,
      "occupancy_pct": 28.33,
      "density_value": 0.85,
      "avg_speed": 1.25,
      "entry_rate": 8.0,
      "exit_rate": 6.0,
      "queue_length": 2
    }
  ]
  ```

---

### 2.4 Prediction & Explainable AI APIs

#### `POST /predict/risk`
Evaluates dynamic crowd risk levels.
* **Request Payload**:
  ```json
  {
    "density": 1.45,
    "speed": 1.12,
    "entry_rate": 24.0,
    "exit_rate": 20.0,
    "flow_direction_angle": 180.0,
    "queue_length": 4,
    "occupancy": 38.6
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "risk_level": "MODERATE",
    "risk_probability": 0.384,
    "predicted_at": "2026-07-13T01:59:12Z"
  }
  ```

#### `POST /xai/explain`
Calculates Shapley feature importance details.
* **Request Payload**: Same as `/predict/risk`.
* **Response (200 OK)**:
  ```json
  {
    "shap_base_value": 0.152,
    "prediction_probability": 0.384,
    "contributions": {
      "density": 0.15,
      "queue_length": 0.08,
      "speed": -0.05
    },
    "explanation_text": "Density index (+15%) and queue builds (+8%) contributed to the warning classification."
  }
  ```
* **FIFO Eviction Cache**: Computing SHAP values is CPU-intensive. The API caches explanations using a 500-entry FIFO cache check. Identical metric inputs return cached results instantly.

---

### 2.5 Document Reports Engine

#### `POST /reports/generate`
Triggers server-side reporting compilation.
* **Request Payload**:
  ```json
  {
    "scope": "DAILY"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "status": "SUCCESS",
    "scope": "DAILY",
    "report_id": "REP-8A09F1DC",
    "csv_path": "reports_output/nexora_daily_report_REP-8A09F1DC.csv",
    "html_path": "reports_output/nexora_daily_report_REP-8A09F1DC.html"
  }
  ```

---

## 📡 3. WebSocket Map Server (`/ws/map`)

Provides the real-time telemetry broadcast loop (2Hz) to update the dashboard's 2D coordinate crowd map.

### 3.1 Client Inbound Messages

#### Heartbeat Ping
Clients must send regular heartbeats to keep sockets alive:
```json
{
  "event_action": "PING",
  "client_timestamp": 1783637155000
}
```

---

### 3.2 Server Outbound Broadcast Frame
Pushed automatically every 500ms to all active WebSocket connections:
```json
{
  "timestamp": 17839082.01,
  "pedestrians": [
    { "id": 104, "x": 142.5, "y": 88.4, "color": "cyan", "vx": 0.25, "vy": -0.12 },
    { "id": 105, "x": 148.1, "y": 92.2, "color": "red", "vx": 0.12, "vy": 0.04 }
  ],
  "crowd_count": 42,
  "heatmap": [
    { "x": 140.0, "y": 90.0, "weight": 0.85 }
  ],
  "risk": {
    "level": "MODERATE",
    "score": 38.4,
    "zone": "Concourse A"
  },
  "alerts": [],
  "cameras": [
    { "id": "CAM-01", "name": "Concourse A Entrance", "status": "ONLINE", "fps": 30, "latency_ms": 12 }
  ],
  "system_status": "NORMAL"
}
```
If a write fail occurs (e.g. client connection lost), the Map Server detects the exception via `asyncio.gather` error propagation and immediately prunes the dead client from its active connection set.
