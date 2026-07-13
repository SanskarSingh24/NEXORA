# NEXORA Platform REST API Specification

This specification documents the enterprise-grade REST APIs and WebSocket endpoints for the **NEXORA Predictive Crowd Intelligence Platform**.

---

## 🔑 Authentication & RBAC Policy
All API routes (except registration and login) require a bearer token in the HTTP Authorization header:
`Authorization: Bearer <JWT_ACCESS_TOKEN>`

### User Roles
- `ADMIN`: Full access to database, system calibrations, and operator accounts.
- `SECURITY_OFFICER`: Manages camera alerts, overrides evacuation routing parameters.
- `EVENT_MANAGER`: Views telemetry, analytics, and generates platform reports.

---

## 🛰️ API Endpoint Index

### 1. Authentication Router
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Open | Create new operator user account profile. |
| `POST` | `/auth/login` | Open | Authenticates credentials and returns JWT bearer and refresh tokens. |
| `POST` | `/auth/token/refresh` | Open | Rotates active session key and yields fresh JWT token sets. |
| `POST` | `/auth/logout` | Open (JWT Bearer) | Terminate current session; revokes and blacklists credentials. |
| `GET` | `/telemetry/system-status` | Admin, Security, Manager | Retrieves active master-node telemetry. |
| `GET` | `/incident/override-rules` | Security, Admin | Grant security-level override of evacuation rules. |
| `GET` | `/admin/system-calibrations`| Admin | Triggers system calibrations config. |

### 2. Camera Management
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/cameras` | Admin | Register new hardware camera station in the registry. |
| `GET` | `/cameras` | Admin, Security, Manager | List all camera stations. |
| `GET` | `/cameras/{camera_id}` | Admin, Security, Manager | Retrieve coordinates and properties of a camera. |
| `PUT` | `/cameras/{camera_id}` | Admin | Edit camera settings, capacity limits, or status configurations. |
| `DELETE`| `/cameras/{camera_id}` | Admin | Unregister and remove a camera node. |
| `GET` | `/cameras/{camera_id}/status` | Admin, Security, Manager | Retrieve current hardware diagnostic levels. |
| `GET` | `/cameras/{camera_id}/feed` | Admin, Security, Manager | Live MJPEG simulated video stream feed. |

### 3. Analytics Subsystem
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/analytics/aggregate` | Admin, Security, Manager | Retrieve aggregate dashboard metrics across all concourses. |
| `GET` | `/analytics/history/{camera_id}`| Admin, Security, Manager | Fetch analytical historical logs for chart rendering. |

### 4. Prediction Engine (AI & Explainability)
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/predict/risk` | Admin, Security, Manager | Classify crowd risk indicator indices (XGBoost pipeline). |
| `POST` | `/predict/train-model` | Admin | Manually trigger XGBoost model retraining. |
| `POST` | `/xai/explain` | Admin, Security, Manager | Yields SHAP explanation and feature contribution scores. |

### 5. Document Reports Engine
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Open | Health status level heartbeat. |
| `POST` | `/reports/generate` | Admin, Security, Manager | Compiles report telemetry and saves files under output dir. |
| `GET` | `/reports/download/{filename}`| Admin, Security, Manager | Downloads CSV and HTML report file payloads. |

### 6. Emergency Alerts
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/alerts/active` | Admin, Security, Manager | Retrieve all active, unacknowledged warning alarms. |
| `POST` | `/alerts/{alert_id}/acknowledge`| Security, Admin | operator acknowledges active warning; silences alarms. |
| `GET` | `/alerts/history` | Admin, Security, Manager | Retrieve historical security alert audit records. |

### 7. Settings & Thresholds
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/settings/system` | Admin, Security, Manager | Fetch global crowd density safety thresholds. |
| `PUT` | `/settings/system` | Admin | Modify system thresholds and alarm trigger limits. |

### 8. WebSockets Broker
| Protocol | Endpoint | Description |
| :--- | :--- | :--- |
| `WS` | `/ws/map` | High-frequency top-down coordinates, maps, heatmap payload channel. |

---

## 🛠️ Endpoint Specifications & Request Schema

### 1. Authentication Router

#### POST `/auth/register`
*   **Request Schema:**
    ```json
    {
      "username": "op_security_east",
      "email": "security_east@nexora.io",
      "password": "strongPassword123!",
      "role": "SECURITY_OFFICER"
    }
    ```
*   **Response Schema (201 Created):**
    ```json
    {
      "user_id": "c1aeb6c4-b4a1-4328-971c-5ea19cdd441b",
      "username": "op_security_east",
      "email": "security_east@nexora.io",
      "role": "SECURITY_OFFICER",
      "is_active": true,
      "created_at": "2026-07-13T01:19:10Z"
    }
    ```

#### POST `/auth/login`
*   **Query Parameters:**
    *   `username_email` (query param string, required)
    *   `password_raw` (query param string, required)
*   **Response Schema (200 OK):**
    ```json
    {
      "access_token": "eyJhbGciOiJIUzI1...",
      "refresh_token": "eyJhbGciOiJIUzI1...",
      "token_type": "bearer",
      "expires_in": 900
    }
    ```

#### POST `/auth/token/refresh`
*   **Request Schema:**
    ```json
    {
      "refresh_token": "eyJhbGciOiJIUzI1..."
    }
    ```
*   **Response Schema (200 OK):**
    ```json
    {
      "access_token": "eyJhbGciOiJIUzI1...",
      "refresh_token": "eyJhbGciOiJIUzI1...",
      "token_type": "bearer",
      "expires_in": 900
    }
    ```

#### POST `/auth/logout`
*   **Request Schema:**
    ```json
    {
      "refresh_token": "eyJhbGciOiJIUzI1..."
    }
    ```
*   **Response Schema (200 OK):**
    ```json
    {
      "status": "SUCCESS",
      "message": "Tokens revoked. Operator session terminated."
    }
    ```

---

### 2. Camera Management

#### POST `/cameras`
*   **Request Schema:**
    ```json
    {
      "camera_name": "Tunnel 2 North Gate",
      "location_zone": "Tunnel 2 North",
      "rtsp_url": "rtsp://username:password@10.0.12.18:554/stream1",
      "max_capacity": 120,
      "calibration_matrix": [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0]
      ]
    }
    ```
*   **Response Schema (201 Created):**
    ```json
    {
      "camera_id": "8bda2e11-dc45-4299-bb12-32eeddecc910",
      "camera_name": "Tunnel 2 North Gate",
      "location_zone": "Tunnel 2 North",
      "rtsp_url": "rtsp://username:password@10.0.12.18:554/stream1",
      "max_capacity": 120,
      "status": "ONLINE",
      "created_at": "2026-07-13T01:19:10Z"
    }
    ```

#### GET `/cameras`
*   **Response Schema (200 OK):**
    ```json
    [
      {
        "camera_id": "8bda2e11-dc45-4299-bb12-32eeddecc910",
        "camera_name": "Tunnel 2 North Gate",
        "location_zone": "Tunnel 2 North",
        "rtsp_url": "rtsp://username:password@10.0.12.18:554/stream1",
        "max_capacity": 120,
        "status": "ONLINE",
        "created_at": "2026-07-13T01:19:10Z"
      }
    ]
    ```

#### GET `/cameras/{camera_id}/status`
*   **Response Schema (200 OK):**
    ```json
    {
      "camera_id": "8bda2e11-dc45-4299-bb12-32eeddecc910",
      "status": "ONLINE",
      "mjpeg_active": true,
      "fps": 29.8,
      "network_latency_ms": 14.5,
      "uptime_pct": 99.82
    }
    ```

#### GET `/cameras/{camera_id}/feed`
*   **Response content-type:** `multipart/x-mixed-replace; boundary=frame`
*   **Description:** Starts streaming MJPEG content frames directly parsed from RTSP or simulated patterns.

---

### 3. Analytics Subsystem

#### GET `/analytics/aggregate`
*   **Response Schema (200 OK):**
    ```json
    {
      "total_network_count": 284,
      "average_occupancy_pct": 42.15,
      "active_queues": 32,
      "total_entry_rate_per_min": 68.2
    }
    ```

#### GET `/analytics/history/{camera_id}?minutes_window=60`
*   **Parameters:**
    *   `camera_id` (Path, required)
    *   `minutes_window` (Query, default: 60)
*   **Response Schema (200 OK):**
    ```json
    [
      {
        "log_id": "5cbda32b-9801-4478-ad23-e12334812323",
        "camera_id": "8bda2e11-dc45-4299-bb12-32eeddecc910",
        "timestamp": "2026-07-13T01:18:00Z",
        "current_count": 34,
        "occupancy_pct": 28.33,
        "density_value": 0.85,
        "avg_speed": 1.25,
        "entry_rate": 8.0,
        "exit_rate": 6.0,
        "queue_length": 2,
        "movement_direction": "NE"
      }
    ]
    ```

---

### 4. Prediction Engine

#### POST `/predict/risk`
*   **Request Schema:**
    ```json
    {
      "total_headcount": 55,
      "occupancy_pct": 45.8,
      "density_value": 1.25,
      "queue_length": 8,
      "flow_rate_delta": 4.2
    }
    ```
*   **Response Schema (200 OK):**
    ```json
    {
      "risk_level": "ORANGE",
      "risk_probability": 0.725,
      "predicted_at": "2026-07-13T01:19:10Z"
    }
    ```

#### POST `/xai/explain`
*   **Request Schema:** Same as `/predict/risk`
*   **Response Schema (200 OK):**
    ```json
    {
      "shap_base_value": 0.152,
      "prediction_probability": 0.725,
      "contributions": {
        "density_value": 0.32,
        "queue_length": 0.18,
        "occupancy_pct": 0.08,
        "total_headcount": 0.05,
        "flow_rate_delta": -0.06
      },
      "explanation_text": "High local crowd pressure (+32%) combined with active queues length (+18%) dominates the prediction risk index trigger."
    }
    ```

---

### 5. Document Reports Engine

#### POST `/reports/generate`
*   **Request Schema:**
    ```json
    {
      "scope": "DAILY"
    }
    ```
*   **Response Schema (200 OK):**
    ```json
    {
      "status": "SUCCESS",
      "scope": "DAILY",
      "report_id": "REP-6F9CB1E9",
      "csv_path": "reports_output/nexora_daily_report_REP-6F9CB1E9.csv",
      "html_path": "reports_output/nexora_daily_report_REP-6F9CB1E9.html",
      "generated_at": "2026-07-13T01:19:10Z"
    }
    ```

#### GET `/reports/download/{filename}`
*   **Response:** File download stream depending on type requested (CSV or HTML).

---

### 6. Emergency Alerts

#### GET `/alerts/active`
*   **Response Schema (200 OK):**
    ```json
    [
      {
        "alert_id": "a50c822e-1d54-4aa9-9023-ebec1cded42b",
        "camera_id": "8bda2e11-dc45-4299-bb12-32eeddecc910",
        "timestamp": "2026-07-13T01:15:00Z",
        "risk_level": "RED",
        "confidence_pct": 96.2,
        "explanation": "SHAP detects critical queue congestion near gate crossing.",
        "recommendations": [
          "Activate emergency egress paths.",
          "Dispatch alerts to stations operators."
        ],
        "is_acknowledged": false
      }
    ]
    ```

#### POST `/alerts/{alert_id}/acknowledge`
*   **Query Parameters:**
    *   `operator_id` (Query string, required)
*   **Response Schema (200 OK):**
    ```json
    {
      "alert_id": "a50c822e-1d54-4aa9-9023-ebec1cded42b",
      "camera_id": "8bda2e11-dc45-4299-bb12-32eeddecc910",
      "is_acknowledged": true,
      "acknowledged_at": "2026-07-13T01:19:10Z",
      "operator_id": "OP-0428"
    }
    ```

---

### 7. Settings & Thresholds

#### GET `/settings/system`
*   **Response Schema (200 OK):**
    ```json
    {
      "warning_density_threshold": 2.5,
      "critical_density_threshold": 4.5,
      "queue_max_threshold": 15,
      "siren_automation_enabled": true,
      "alert_retry_interval_secs": 30
    }
    ```

#### PUT `/settings/system`
*   **Request Schema:** Same as output schema.
*   **Response Schema (200 OK):**
    ```json
    {
      "status": "SETTINGS_UPDATED",
      "updated_settings": {
        "warning_density_threshold": 2.2,
        "critical_density_threshold": 4.0,
        "queue_max_threshold": 12,
        "siren_automation_enabled": true,
        "alert_retry_interval_secs": 30
      }
    }
    ```

---

## 📡 WebSockets Specification

### WS `/ws/map`
Exposes the broker endpoint for top-down coordinate renders and maps overlaying.

*   **Heartbeat Client String:** `"ping"`
*   **Response String:** `{"type": "pong", "time": 17839082.2}`
*   **Server Broadcast payload details (Sent at 2Hz frequency):**
    ```json
    {
      "timestamp": 17839082.01,
      "pedestrians": [
        { "id": 1, "x": 124.5, "y": 92.4, "color": "cyan" },
        { "id": 2, "x": 142.1, "y": 80.2, "color": "red" }
      ],
      "crowd_count": 42,
      "heatmap": [
        { "x": 120, "y": 140, "weight": 0.65 }
      ],
      "risk": {
        "level": "LOW",
        "score": 38.4,
        "zone": "Central Concourse"
      },
      "alerts": [],
      "cameras": [
        { "id": "CAM-01", "x": 120, "y": 90, "status": "ACTIVE", "latency_ms": 15, "fps": 30 }
      ],
      "system_status": "NORMAL"
    }
    ```
