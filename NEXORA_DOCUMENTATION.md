# NEXORA Platform Documentation Hub

Welcome to the centralized documentation hub for the **NEXORA Predictive Crowd Intelligence & Decision Support Platform**.

This repository contains comprehensive guides, technical designs, user operations manuals, and administrative setups.

---

## 📚 Technical Documentation Hub

### 1. [System Architecture Specification (HLD / LLD) Project Blueprint](./docs/Architecture.md)
* Architectural topologies, Mermaid diagrams, coordinate conversion math, homography matrix projections, and pathfinding routing weight algorithms.

### 2. [Database Schema Designs & SQL Configuration](./docs/Database.md)
* Relational ER layout blueprints, DDL initialization scripts, TimescaleDB partitions, spatial PostGIS indexing configurations, and memory-safe database pool tuning.

### 3. [REST API specification & WebSockets API References](./docs/API.md)
* REST API endpoints mapping, access-token rotations, CORS security policies, custom headers, live camera streaming executors, and WebSockets message exchange shapes.

### 4. [Deployment Runbook & Installation Manual](./docs/Deployment.md)
* Step-by-step guides setup, virtual environment requirements, environment configurations (`NEXORA_DB_URL`, `NEXORA_JWT_SECRET`), multi-service start routines, and Docker Compose configurations.

### 5. [AI Inference Engine & Explainability Pipeline](./docs/AI_Pipeline.md)
* Custom YOLOv11 person detection parameterization, ByteTrack tracking loops, XGBoost classifiers, SHAP attribution math, and high-performance O(1) prediction caches.

---

## 👥 Operations & Maintenance Guides

### 6. [Operator User Manual & Incident Response Workflows](./docs/User_Manual.md)
* Operator login parameters, 3-panel command dashboard workspace operations, coordinate map overlays, reports generation logs, and emergency evacuation validation checklists.

### 7. [Platform Administration, Settings & Calibrations](./docs/Admin_Manual.md)
* Camera registration workflows, homography matrix point calibrations, safety threshold adjustments (Yellow/Red values), and automated model retraining loops.

### 8. [System Developer & Integration Guide](./docs/Developer_Guide.md)
* Code repositories mapping, testing guidelines (pytest calls, Locust files templates), coding standards (context db loops, async stream functions), and future integration scopes.
