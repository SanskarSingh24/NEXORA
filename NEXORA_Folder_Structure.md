# ENTERPRISE-GRADE DIRECTORY LAYOUT & REPOSITORY STRUCTURE
## NEXORA: AI-Powered Predictive Crowd Intelligence & Decision Support Platform
### Document Version: V1.0-STRUCTURE-STANDARD

This document details the standard directory layout for the NEXORA platform repository. It aligns with corporate dev-ops standards, ensuring clean division of concerns, secure environment isolations, and clear paths for automated CI/CD scans, containerized builds, and independent development pipelines.

---

## 1. High-Level Directory Overview

```
nexora-monorepo/
├── .github/                 # CI/CD pipelines, issue templates, and workflow actions
├── ai/                      # Computer vision, GNN forecasting, and Explainable AI codebases
├── backend/                 # Polyglot backend engines (Go Gateway, Spring Core, FastAPI AI Layer)
├── database/                # Schema migrations, initializations, and cache configuration files
├── datasets/                # Crowd detection training annotations, raw data inputs, and telemetry arrays
├── docker/                  # Dockerfiles, Compose structures, and orchestration resources
├── docs/                    # Technical specifications, SRS, HLD/LLD, and operator manuals
├── frontend/                # React TypeScript client UI and 2D mapping tools
├── reports/                 # Operational reports, automated safety audits, and metrics exports
├── scripts/                 # Administration scripts, database loaders, and developer utilities
└── tests/                   # Multi-tier testing scripts (Integration, E2E, Load, Security)
```

---

## 2. Exhaustive Directory Structure & Component Mapping

Below is the complete nested folder structure for the NEXORA project, detailing all sub-directories and their roles.

### 2.1 Repository Root Layout File Tree

```
nexora-monorepo/
├── .github/
│   ├── workflows/            # GitHub Actions files (ML training pipelines, static test runs, build checks)
│   └── templates/            # Issue tickets & pull request formats
│
├── ai/                       # Custom AI models & model training routines (No production application code)
│   ├── model-definitions/    # Class definitions for YOLO, STGCN, and explainability networks
│   │   ├── yolo_custom.py    # YOLOv9 customized boundary layer model
│   │   ├── stgcn_network.py  # Spatio-Temporal Graph Convolutional Network layers
│   │   └── xai_explainer.py  # Grad-CAM and SHAP attribution calculation models
│   ├── weights/              # Visual checkpoint trackers and GNN network weight files (.pt, .onnx)
│   │   ├── yolo_base.onnx    # Edge optimized YOLO weights
│   │   └── stgcn_v1.pt       # Trained temporal GNN forecasting weights
│   ├── training-pipelines/   # Training routines, learning rate schedulers, and optimizer scripts
│   └── conversion-tools/     # TensorRT optimize routines and model parsing configs
│
├── backend/                  # Monorepo divided by service languages
│   ├── go-ingress-gw/        # High-Speed Go Gateway (Ingress management)
│   │   ├── main.go           # Ingestion entry point
│   │   ├── websocket/        # Real-time WebSocket connection manager & client registry
│   │   ├── stream-handlers/  # GStreamer frame captures & RTSP parsing loops
│   │   └── config/           # Gateway environmental configs
│   ├── spring-enterprise/    # Enterprise Spring Boot Core Service (Management, Audit, RBAC, Evac coordination)
│   │   ├── src/main/java/com/nexora/core/
│   │   │   ├── config/       # Security configurations (OIDC/MFA parameters)
│   │   │   ├── controller/   # REST endpoints (Alarms, User management, Auditing panels)
│   │   │   ├── model/        # Entities (Database structures mapped to JPA)
│   │   │   ├── repository/   # TimescaleDB query mappings
│   │   │   └── service/      # Evacuation pathfinding workflows and business logic
│   │   └── pom.xml           # Spring boot project dependencies configuration
│   └── fastapi-ai-helper/    # FastAPI Python AI Wrapper (Connects Spring Core to AI models and routes calculations)
│       ├── app/
│       │   ├── routers/      # Paths (Prediction queries, Path calculation triggers)
│       │   ├── inference/    # Model loaders and execution tasks
│       │   └── algorithms/   # Dijkstra & A* density-weighted route modules
│       └── requirements.txt  # FastAPI dependencies configuration
│
├── database/                 # Configuration and versioned migrations
│   ├── timescaledb/          # Time-series telemetry database systems
│   │   ├── migrations/       # SQL migrations (Tables, indexes, and hyper-table conversions)
│   │   └── retention-policies/ # System scripts defining data compression and purging rules
│   ├── redis/                # Caching configurations
│   │   └── redis.conf        # Persistence configs, memory eviction rules, and cluster layouts
│   └── elasticsearch/        # Audit log index templates
│       └── mappings/         # JSON indexing mapping structures
│
├── datasets/                 # Internal training & configuration assets (Excluded from Git tracking)
│   ├── raw-video-clips/      # Sample video cuts for validation runs (10-second mp4 testing slices)
│   ├── annotations/          # Label files mapping coordinates for YOLO calibration (YOLO format txt files)
│   ├── physical-nodes/       # Spatial topology maps (JSON representations of physical rooms, coordinates)
│   └── data-split/           # Test, Validation, and Train partition records
│
├── docker/                   # Container definitions & deploy parameters
│   ├── services/             # Dynamic Dockerfiles separated by system components
│   │   ├── Dockerfile.go-ingress
│   │   ├── Dockerfile.spring-core
│   │   ├── Dockerfile.fastapi-ai
│   │   └── Dockerfile.react-ui
│   ├── compose/              # Docker Compose templates for development levels
│   │   ├── docker-compose.infra.yml # Runs telemetry databases, Kafka, Elasticsearch, and Redis
│   │   ├── docker-compose.apps.yml  # Runs Go-Gateway, Spring-Core, FastAPI, and UI
│   │   └── docker-compose.prod.yml  # Production containers configuration setup
│   └── security/             # TLS certifications, keystores, and container limits
│
├── docs/                     # Operations and technical manuals
│   ├── api-specs/            # API schemas and WS JSON layout files
│   ├── blueprints/           # Architectural plans (SRS, HLD & LLD blueprints)
│   ├── runbooks/             # Deployment setup steps, restore workflows, and failover guides
│   └── user-guides/           # Operator screen instructions and Admin setup manuals
│
├── frontend/                 # React UI Console
│   ├── public/               # Static assets (Logos, SVGs, favicon)
│   ├── src/
│   │   ├── assets/           # Dashboard graphics and custom vector resources
│   │   ├── components/       # Interface widgets
│   │   │   ├── common/       # Reuse modules (Buttons, dropdown inputs, grid loaders)
│   │   │   ├── map/          # 2D Map panels, Deck.gl overlay hooks, and camera markers
│   │   │   └── panels/       # Analytics trends, alerts triage queues, and responder trackers
│   │   ├── hooks/            # Custom hooks (WS subscription handlers, query actions)
│   │   ├── store/            # Zustand stores (Interface settings, Alert buffers, and state)
│   │   ├── utils/            # Calculations (Coordinate spatial transformations, color ranges)
│   │   └── App.tsx           # Base routes configuration
│   ├── package.json          # React node package dependencies list
│   └── tsconfig.json         # TypeScript configuration
│
├── reports/                  # Metrics summaries & evaluation records (Generated during execution)
│   ├── safety-audits/        # Safety audits detailing alert processing latency
│   ├── crowd-metrics/        # Periodic reports on local congestion patterns
│   └── security-compliance/  # GDPR privacy scan logs and user activity reports
│
├── scripts/                  # System automation tools
│   ├── dev-setup/            # Developer setup automation scripts (Locally initializes docker instances and seed datasets)
│   ├── video-tools/          # RTSP stream test loop tools and video format transcoders
│   └── db-helpers/           # Migration execution utilities and database backup routines
│
└── tests/                    # Testing modules
    ├── unit/                 # Unit tests (Mock database handlers, backend services, controller APIs)
    ├── integration/          # Core integration workflows (Sensor validation, WebSocket messages transmission)
    ├── load/                 # Performance load tests (JMeter / Locust files checking gateway throughput limits)
    └── e2e/                  # End-to-End browser simulation scripts modeling Operator interfaces
```

---

## 3. Comprehensive Folder Explanations & Responsibilities

| Parent Folder | Target Module | Responsibility | Developer Ownership |
| :--- | :--- | :--- | :--- |
| **`.github/`** | DevOps | Automates software deployment, branch rules, code checks, and lint processes. | DevOps / Site Reliability |
| **`ai/`** | Vision & ML Model Code | Hosts training scripts and custom AI algorithms. Developers tune models here before converting workflows to production deployment files. | AI / Computer Vision Engineers |
| **`backend/`** | Core Server Architectures | Stores the business engines. The Go server handles video feeds, Spring Boot runs user roles/RBAC, and FastAPI serves the AI predictions. | Backend / System Engineers |
| **`database/`** | Persistence Configuration | Stores database tables configurations, historical data retention rules, Redis caching properties, and Elastic log tracking engines. | Database Admins / Backend Leads |
| **`datasets/`** | ML Training Assets | Houses raw video inputs and model training annotations. This folder is ignored by git to keep repository footprint light. | AI / ML Engineers |
| **`docker/`** | Virtualization & Packaging | Contains container definitions, compose orchestrations, and secure configuration profiles for different staging levels. | DevOps / Systems Engineers |
| **`docs/`** | Architecture & User Manuals | Provides team specs, Swagger/OpenAPI designs, and system operator instructions. | Lead Architect / Product Owner |
| **`frontend/`** | UI Command Console | Contains user dashboards, real-time analytics graphs, alert systems, and SVG/Canvas-based maps. | Frontend Engineers |
| **`reports/`** | Auditing & Metrics Logs | Houses automatically generated security logs, GDPR audit documents, and system performance evaluations. | Compliance Officers / System Admins |
| **`scripts/`** | Utility Automation | Contains development setup tasks, mock stream configuration modules, and database backup routines. | System Admins / DevOps |
| **`tests/`** | Quality Assurance | Hosts unit tests, integrated network simulations, and automated mock stream tests to verify performance and response time limits. | QA Engineers |
