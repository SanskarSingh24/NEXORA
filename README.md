# NEXORA - Predictive Crowd Intelligence Platform

NEXORA is an enterprise-grade crowd monitoring, predictive risk analysis, and emergency evacuation management platform. By merging computer vision telemetry, high-frequency coordinate maps, and Explainable AI (XAI), NEXORA empowers security operators, spatial planners, and coordinators to monitor, predict, and mitigate crowd congestion risks in urban transit hubs and large venues.

---

## 🎨 System Preview & Interface Placeholders

Below are visual previews of the NEXORA Operational command decks:

### 1. Operations Command Dashboard
```
+========================================================================================+
| [NEXORA Core Command Deck]                                            [12:00:00] [OP]   |
+========================================================================================+
| [ LIVE OVERVIEW ]     [ ACTIVE COUNT: 142 ]     [ SYSTEM STATUS: MONITOR (YELLOW) ]    |
+----------------------------------------------------------------------------------------+
|                                                                                        |
|  (Camera Stream Node)     (Spatial Map Coordinates Canvas)      (Alerts Ledger Console)|
|  +--------------------+   +-------------------------------+     +--------------------+ |
|  | [🎥 CAM-01]        |   | . . . . . * (pedestrian)      |     | ⚠️ RED ALERT:       | |
|  | Headcount: 42      |   | . . . * * (restricted queue)  |     | Conc. 2 Crowd      | |
|  | Density: 2.15/m²   |   | . . * * * (concourse flow)    |     | density > 4.5/m²   | |
|  +--------------------+   +-------------------------------+     +--------------------+ |
|                                                                                        |
+========================================================================================+
```
*(Screenshot Placeholder: Operational Unified React Command Center Interface)*

### 2. Interactive Spatial 2D Map Console
*(Screenshot Placeholder: 2D WebGL/HTML Canvas coordinate mapping layout displaying heatmaps, directional flow vectors, and restricted zone entry detections)*

### 3. Analytics Report Generator Console
*(Screenshot Placeholder: Historical reports console displaying daily/weekly density analytics and providing export triggers for Excel and PDF print-outs)*

---

## 🏗️ Technical Architecture & Telemetry Pipeline

```
  +=====================+       IP Packet        +======================+
  | Camera Node (RTSP)  | ---------------------> | Python Vision Engine |
  +=====================+                        +======================+
                                                            |
                                                            | (Zone Headcounts / Speed Vectors)
                                                            v
+===============================================================================================+
|                                    NEXORA Core Services                                       |
+===============================================================================================+
|                                                                                               |
|  +--------------------+        +--------------------+        +--------------------+           |
|  |    Auth Service    | <----> | Analytics Service  | <----> |   Alerts Service   |           |
|  |     (JWT / RBAC)   |        | (Compass / Rates)  |        |    (PostgreSQL)    |           |
|  +--------------------+        +--------------------+        +--------------------+           |
|            |                             |                             |                      |
|            v                             v                             v                      |
|  +--------------------+        +--------------------+        +--------------------+           |
|  | Predictive Engine  |        | Explainable AI API |        | Reports Generator  |           |
|  | (XGBoost Classifier)|        | (SHAP Diagnostics) |        |   (CSV / PDF Export)          |
|  +--------------------+        +--------------------+        +--------------------+           |
|                                                                                               |
+===============================================================================================+
                                                            |
                                                            | (JSON/Binary Frames Broadcasts)
                                                            v
                                                 +======================+
                                                 | WebSocket Map Server |
                                                 +======================+
                                                            |
                                                            | (2Hz Real-Time Streams)
                                                            v
                                                 +======================+
                                                 | User Interfaces (UI) |
                                                 |   (HTML / React)     |
                                                 +======================+
```

---

## ✨ Features

- **Real-time Spatial Tracking:** Displays live top-down coordinate nodes on a custom canvas map via 2Hz WebSockets.
- **Predictive Risk Assessment:** Classifies crowd risk profiles into `SAFE`, `MODERATE`, `HIGH`, or `CRITICAL` categories using an **XGBoost machine learning classifier**.
- **Explainable AI (XAI):** Connects prediction outputs directly to **SHAP values** explaining which metrics (density, entries, exits, queue sizes) contributed to risk assessments.
- **Dynamic Heatmaps & Evacuation Paths:** Renders high-frequency heatmaps and overlays direction vectors to trace crowd evacuation corridors.
- **Automated Alarms:** Automatically logs emergency alerts into PostgreSQL tables and dispatches warnings to consoles.
- **Document Compiles Engine:** Compiles Daily, Weekly, Monthly, and Incident reports into structured files (CSV logs and styled HTML-to-PDF templates).
- **Strong Operator Security:** Implements JWT Bearer authentication matching user roles, sliding window IP limiting, strict CORS protection, sanitization, and audit logging.

---

## 📂 Folder Structure

```
NEXORA/
│
├── ai/
│   └── vision_engine.py             # Parses camera streams into pedestrian metrics
│
├── backend/
│   ├── ai/
│   │   ├── explainable_api.py       # Computes SHAP value diagnostics
│   │   └── predictive_engine.py    # Trains and runs XGBoost risk classifications
│   │
│   ├── alerts/
│   │   └── alert_service.py         # Logs emergency alerts to PostgreSQL db
│   │
│   ├── analytics/
│   │   └── analytics_service.py     # Aggregates raw coordinates into vector trends
│   │
│   ├── auth/
│   │   └── auth_service.py          # Secures operators routes (JWT / RBAC / Limiter)
│   │
│   ├── map/
│   │   └── map_server.py            # High-performance WebSocket coordinates broker
│   │
│   └── reports/
│       └── report_service.py        # Compiles analytics tables to files (CSV/HTML)
│
├── frontend/
│   ├── alert_console.html           # Live alerts registry dashboard
│   ├── crowd_map.html               # Real-time WebGL spatial coordinates map
│   ├── react_dashboard.html         # Unified administration command deck
│   └── reports.html                 # Reports query and exports console
│
├── tests/
│   ├── conftest.py                  # Pytest fixtures and mock setup
│   ├── test_alerts.py               # Database transaction tests
│   ├── test_analytics.py            # Directional math checks
│   ├── test_auth.py                 # Authorization policies checks
│   ├── test_map_server.py           # WebSocket parallel tests
│   └── test_predictive.py           # XGBoost and SHAP API route checks
│
├── openapi.json                     # System Swagger API Blueprint
├── NEXORA_API_Spec.md               # API reference and routing specifications
└── NEXORA_Testing_Strategy.md       # Quality assurance strategy specifications
```

---

## 🚀 Installation & Setup

### 1. Prerequisites
- Python 3.9+
- PostgreSQL (with PostGIS support)
- Node.js (for react dev server, optional)

### 2. Setup Python Virtual Environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```
*(If `requirements.txt` does not exist, install the core set)*:
```bash
pip install fastapi uvicorn pydantic SQLAlchemy psycopg2 jose passlib bcrypt cryptography scikit-learn xgboost shap joblib testclient pytest
```

### 4. Configure Database Credentials
Create system environment variables defining postgres connections:
```bash
export NEXORA_DB_URL="postgresql://postgres:username@localhost:5432/nexora_db"
export NEXORA_JWT_SECRET="your_secure_jwt_secret_key"
```

---

## 🏃 How to Run

NEXORA services run as distributed microservices:

### 1. Start the Core Authentication & Telemetry Service
```bash
uvicorn backend.auth.auth_service:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start the WebSocket Coordinates Broker
```bash
uvicorn backend.map.map_server:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Run the AI Predictions Engine
```bash
uvicorn backend.ai.predictive_engine:app --host 0.0.0.0 --port 8002 --reload
```

### 4. Run the SHAP Explainability API
```bash
uvicorn backend.ai.explainable_api:app --host 0.0.0.0 --port 8003 --reload
```

### 5. Launch the Frontend Dashboards
You can serve the HTML frontend files using a static server:
```bash
# Using python built-in server
python -m http.server 3000 --directory frontend
```
Navigate to:
- Unified React Admin Panel: `http://localhost:3000/react_dashboard.html`
- Real-time Crowd Tracking Map: `http://localhost:3000/crowd_map.html`
- Analytics Reporting Center: `http://localhost:3000/reports.html`

### 6. Verify with Test Suite
```bash
pytest -v
```

---

## 🔮 Future Scope & Roadmap

1. **Active PostGIS Geofencing:** Establish dynamic polygons on spatial layouts to automatically detect trespassing in security boundaries.
2. **Vision Engine Acceleration:** Support CUDA hardware acceleration (NVIDIA TensorRT) for faster RTSP frame processing.
3. **Decentralized Alert Brokers:** Move alert channels to a Redis/RabbitMQ message queue to distribute warnings to 10,000+ client hubs.
4. **Evacuation Path Optimization:** Integrate reinforcement learning algorithms (like Q-learning) to dynamically compute optimal evacuation routes.
