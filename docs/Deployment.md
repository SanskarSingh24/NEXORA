# NEXORA Platform Deployment Guide

This guide details the step-by-step procedure to deploy the NEXORA platform in both development and production environments.

---

## 1. System Prerequisites

* **OS Context**: Linux (Ubuntu 22.04 LTS recommended) or Windows Server (WSL2 supported).
* **Languages**: Python 3.9+ and Node.js 18+ (optional, for React frontend structures).
* **Databases**: PostgreSQL 14+ with PostGIS and TimescaleDB system extensions.
* **Libraries**: OpenCV (compatible with GPU acceleration), CUDA toolkit (for NVDEC decoding).

---

## 2. Setting Up the Environment

### 2.1 Clone Repository & Setup Virtual Environment
```bash
# Clone the repository
git clone https://github.com/nexora/nexora-platform.git
cd nexora-platform

# Initialize python virtual environment
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate

# On Windows:
.venv\Scripts\activate
```

### 2.2 Install Dependencies
Install Python dependencies using the project requirements file:
```bash
pip install --upgrade pip
pip install fastapi uvicorn pydantic SQLAlchemy psycopg2-binary jose passlib bcrypt cryptography scikit-learn xgboost shap joblib pytest pytest-cov
```

### 2.3 Configure Environmental Settings
Create a local config file (e.g. `.env`) or export the following configuration variables:
```bash
# PostgreSQL TimescaleDB connection url
export NEXORA_DB_URL="postgresql://postgres:securepassword@localhost:5432/nexora_db"

# JWT authentication secret keys
export NEXORA_JWT_SECRET="9a7bcf1489bd0e11893bfcdde01923eec74b1239c09aa39d"
export NEXORA_REFRESH_SECRET="521cbade38b109e2cf48ad0a1c8b390feec437cdd90a88bf"

# Path to local XGBoost model weights (used by predictor API)
export NEXORA_ML_MODEL_PATH="backend/ai/weights/xgboost_risk.json"

# CORS origins policy settings
export NEXORA_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```

---

## 3. Database Initialization & Seeding

Prior to launching services, ensure PostgreSQL has PostGIS and TimescaleDB extensions loaded. Run migrations to initialize the schema:

```bash
# Create target database manually via PSQL console
psql -U postgres -h localhost -c "CREATE DATABASE nexora_db;"

# Activate database extensions
psql -U postgres -h localhost -d nexora_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql -U postgres -h localhost -d nexora_db -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"

# Run DDL scripts to set up database layouts
psql -U postgres -h localhost -d nexora_db -f database/schema.sql
```

---

## 4. Launching Platform Services

NEXORA services run in a distributed parallel format. Launch each service component in its own terminal or service runner thread:

### 4.1 Security Authentication & Telemetry Service (Port 8000)
Handles operator registry, user logins, token validations, and database CRUD:
```bash
uvicorn backend.auth.auth_service:app --host 0.0.0.0 --port 8000 --reload
```

### 4.2 WebSocket Coordinates Broker (Port 8001)
Tracks real-time pedestrian coordinates and streams heatmaps at 2Hz:
```bash
uvicorn backend.map.map_server:app --host 0.0.0.0 --port 8001 --reload
```

### 4.3 AI Prediction Engine (Port 8002)
Runs XGBoost classifications on crowd performance variables:
```bash
uvicorn backend.ai.predictive_engine:app --host 0.0.0.0 --port 8002 --reload
```

### 4.4 SHAP Explainability Service (Port 8003)
Processes feature contributions and returns cached explanations:
```bash
uvicorn backend.ai.explainable_api:app --host 0.0.0.0 --port 8003 --reload
```

### 4.5 Launching local Frontend Console (Port 3000)
Mount and run the HTML client interface using a lightweight web server:
```bash
python -m http.server 3000 --directory frontend
```
Open your browser and navigate to:
* Operations dashboard: `http://localhost:3000/react_dashboard.html`
* 2D Coordinate Map interface: `http://localhost:3000/crowd_map.html`
* Report query console: `http://localhost:3000/reports.html`
* Alert monitoring system: `http://localhost:3000/alert_console.html`

---

## 5. Production Containerization (Docker Compose)

For cloud staging, package services in containers. The service configuration is orchestrated via Docker Compose:

```yaml
version: '3.8'

services:
  database:
    image: timescale/timescaledb:latest-pg14
    environment:
      - POSTGRES_PASSWORD=securepassword
      - POSTGRES_DB=nexora_db
    ports:
      - "5432:5432"
    volumes:
      - nexora_data:/var/lib/postgresql/data

  auth_service:
    build:
      context: .
      dockerfile: docker/Dockerfile.auth
    ports:
      - "8000:8000"
    environment:
      - NEXORA_DB_URL=postgresql://postgres:securepassword@database:5432/nexora_db
    depends_on:
      - database

  map_server:
    build:
      context: .
      dockerfile: docker/Dockerfile.map
    ports:
      - "8001:8001"
    depends_on:
      - auth_service

  predictive_engine:
    build:
      context: .
      dockerfile: docker/Dockerfile.predictive
    ports:
      - "8002:8002"

  explainable_api:
    build:
      context: .
      dockerfile: docker/Dockerfile.explainable
    ports:
      - "8003:8003"
    depends_on:
      - predictive_engine

volumes:
  nexora_data:
```

---

## 6. System Logging & Health Metrics

* **HTTP heartbeat status routes**: Each service exposes a `/health` endpoint returning `{"status": "healthy"}` to check loop integrity.
* **Logs Directory**: Stdout/Stderr logs are automatically written to Docker registries. In VM staging, logs are systematically routed to `/var/log/nexora/`.
* **Testing validation**: To verify that the host deployment is operating correctly, run:
  ```bash
  pytest -v
  ```
