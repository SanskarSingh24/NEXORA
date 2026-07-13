# UI/UX DESIGN SYSTEM & COMMAND CENTER SPECIFICATIONS
## NEXORA: AI-Powered Predictive Crowd Intelligence & Decision Support Platform
### Document Version: V1.0-DESIGN-SYSTEM-STANDARD

This document contains the visual blueprint, color layouts, typography guidelines, and console wireframes for NEXORA. Designed for 24/7 command center operations, the interface reduces cognitive load and visual fatigue using a high-impact, modern dark-mode aesthetic.

---

## 1. Visual Identity & Design System

### 1.1 Color Palette & Semantic Tokens
To optimize usability under low-light command room conditions, NEXORA exclusively utilizes a high-contrast dark color theme.

```
       #0A0F1D            #121829            #1E2942            #00E5FF            #00E5A3
  +----------------+  +----------------+  +----------------+  +----------------+  +----------------+
  |  Deep Space    |  |  Console Card  |  | Active Border  |  |  Electric Cyan |  |  Safe Emerald  |
  |  (Background)  |  |  (Container)   |  |  (Focus Lines) |  |  (Accent Link) |  |   (Normal)     |
  +----------------+  +----------------+  +----------------+  +----------------+  +----------------+
```

| Semantic Category | Color Subclass | Hex Token | RGB Value | CSS Custom Property |
| :--- | :--- | :--- | :--- | :--- |
| **System Base** | Outer Background | `#0A0F1D` | `rgb(10, 15, 29)` | `--bg-primary` |
| **System Container**| Card / Sidebar | `#121829` | `rgb(18, 24, 41)` | `--bg-secondary` |
| **Borders & Rules** | Grid Bounds | `#1E2942` | `rgb(30, 41, 66)` | `--border-subtle` |
| **Brand Primary** | Interactive / Links| `#00E5FF` | `rgb(0, 229, 255)`| `--accent-cyan` |
| **Brand Secondary**| Informational | `#0066FF` | `rgb(0, 102, 255)`| `--accent-blue` |
| **Semantic Safe** | Normal Status | `#00E5A3` | `rgb(0, 229, 163)`| `--status-green` |
| **Semantic Alert** | Cautionary Warning| `#FFB300` | `rgb(255, 179, 0)`| `--status-yellow` |
| **Semantic Critical**| Core Emergency | `#FF2A54` | `rgb(255, 42, 84)` | `--status-red` |
| **Typography Base**| Body Text | `#E2E8F0` | `rgb(226, 232, 240)`| `--text-primary` |
| **Typography Muted**| Helper Metadata | `#94A3B8` | `rgb(148, 163, 184)`| `--text-muted` |

### 1.2 Typography Hierarchy
NEXORA utilizes fonts that prioritize fast reading times and clear data representations:
*   **Primary Font:** `Inter` (Sans-serif) - Used for structural menus, body text, and alerts. Provides high letter-height compatibility.
*   **Display Font:** `Outfit` (Geometric Sans) - Used for major layout titles, main telemetry headers, and alert state metrics.
*   **Data Font:** `JetBrains Mono` (Monospace) - Used for data matrices, GPS coordinates, camera latency stamps, and stream metadata.

---

## 2. Layout Elements & Master Components

### 2.1 Navigation Sidebar
Fixed to the left margin. Minimizes to an icon-only strip to maximize map space.

```
+-------------------------------------------------+
| NEXORA LOGO (Cyan Glow icon)                    |
+-------------------------------------------------+
| [Map Icon]      2D Spatial Console     (Active)  |
| [Camera Icon]   Feed Integrations                |
| [Chart Icon]    Analytics Console                |
| [File Icon]     Audit Reports                    |
| [Cog Icon]      Platform Config                  |
+-------------------------------------------------+
| [User Profile Avatar]                            |
| Operator ID: OP-0428                            |
| Mode: ACTIVE MONITORING                         |
+-------------------------------------------------+
```

### 2.2 System Navbar
Provides quick access to global status updates, time-sensitive coordination tokens, and alert triage controls.

```
+---------------------------------------------------------------------------------------------------------+
| [Menu Toggle] | NEXORA CENTRAL COMMAND  |  UTC: 01:14:26  |  Threat: [ SAFE - EMERALD GREEN ]  | Search |
+---------------------------------------------------------------------------------------------------------+
|                                                      [Active Alarms: 0] [Logs] [Settings] [Operator Profile] |
+---------------------------------------------------------------------------------------------------------+
```

### 2.3 General Metrics Card
Houses spatial performance data, showing counts and velocity variables.

```
+----------------------------------------------------------+
|  METRIC HEADER (e.g., ACTIVE TRANSIT COUNT)              |
|                                                          |
|  [Outfit Font, Large]  8,421                             |
|                                                          |
|  [Sparkline Graph (Cyan Vector)]                         |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  |
|                                                          |
|  Sub-text: +14% relative to previous hour  | Latency: 42ms|
+----------------------------------------------------------+
```

### 2.4 Critical Alarm Notification Popup
Pushes into the screen center when an alarm threshold is crossed, showing verification details.

```
+-------------------------------------------------------------------------------State: RED-+
|  [ALERT] CRITICAL BOTTLENECK PRECURSOR DETECTED                                          |
+------------------------------------------------------------------------------------------+
|  Zone: West Interchange Tunnel (Level 2)      | Current density: 4.8 ppl/m²              |
|  Confidence Level: 96%                         | Time to Event: 12 Minutes                |
+-------------------------------------------------------+----------------------------------+
|  Live Camera Visual                                   | Root Cause Analysis (XAI)        |
|  +-------------------------------------------------+  |  - Commuter Output: 72%          |
|  |                                                 |  |  - Congested Escalator: 28%      |
|  |  [Camera Frame Snapshot: Highlighted Zones]    |  |  - Primary Trigger: Bottleneck  |
|  |  (Red boxes mapping dense crowd clusters)       |  |  - Vector: Left Escalator       |
|  |                                                 |  +----------------------------------+
|  +-------------------------------------------------+  |  Dynamic Evacuation Route        |
|  | Grad-CAM Overlay: Active high-density clusters  |  |  Alternative: Tunnel 4 Corridor  |
+-------------------------------------------------------+----------------------------------+
|  Actions:  [ ESCALATE SYSTEM ALARM (Red) ]    [ ACKNOWLEDGE & CLEAR (Green) ]             |
+------------------------------------------------------------------------------------------+
```

---

## 3. Console Screen Wireframes

### 3.1 Login Page
A clean, secure interface designed for authorization tracking.

```
+-------------------------------------------------------------------------+
|                                                                         |
|                         [ NEXORA PLATFORM ]                             |
|                    Predict  •  Prevent  •  Protect                      |
|                                                                         |
|                ======================================                   |
|                                                                         |
|                Operator Login Credentials                               |
|                Username / Operator ID                                   |
|                [ admin_0428@nexora.muni.org        ]                     |
|                                                                         |
|                Secure Password                                          |
|                [ ********************************** ]                   |
|                                                                         |
|                System Authentication Domain                             |
|                [ Central Station Hub Operations  v ]                     |
|                                                                         |
|                [  INITIATE SECURE SESSION  ]                            |
|                                                                         |
|                ======================================                   |
|                Enterprise SSO System Integration Active                 |
|                Data compliant with CCPA | GDPR Security                 |
|                                                                         |
+-------------------------------------------------------------------------+
```

---

### 3.2 Main Dashboard (Spatial Console View)
The primary operator view, showing 2D density maps alongside analytical metrics.

```
+---------------------------------------------------------------------------------------------------------+
| [NEXORA LOGO] | CENTRAL CONSOLE  |  01:14:26  |  System Status: NORMAL                      | OP-0428   |
+------------------------------------+------------------------------------+-------------------------------+
| Sidebar                            | Live Map Workspace                 | Side Metrics Panel            |
|                                    |                                    |                               |
| [Map]                              |  +------------------------------+  |  ACTIVE PERSONS MAP COUNT     |
| Spatial Console                    |  | (1) Camera Station 12 [Green]  |  |  12,852  (Trend: Normal)      |
|                                    |  |                              |  |                               |
| [Cam]                              |  |       [=== Corridor ===]     |  |  CROWD PRESSURE INDICATORS    |
| Feeds Workspace                    |  |                              |  |  Peak Zone: Corridor 2 (YEL)  |
|                                    |  |   #### Hotspot [Orange] #### |  |  Max Value: 2.8 ppl/m²        |
| [Charts]                           |  |                              |  |                               |
| Analytics Console                  |  | (2) Camera Station 14 [Red]  |  |  ACTIVE INCIDENT QUEUE        |
|                                    |  +------------------------------+  |  None (0 Pending resolution)  |
| [Files]                            |  [Zoom In]   [Evac Route Calc]     |                               |
| System Logs                        |                                    |  SYSTEM STATUS                |
|                                    +------------------------------------+  - Go Ingest: 1.2ms (OK)      |
| [Settings]                         | Terminal Status Log Console        |  - AI Serving: 45ms (OK)      |
| Configuration                      | [01:10:12] Camera Station 12 sync  |  - DB Cluster: ACTIVE (OK)    |
+------------------------------------+------------------------------------+-------------------------------+
```

---

### 3.3 Analytics Page
A dashboard optimized for reviewing historical events and long-term crowd dynamic trends.

```
+---------------------------------------------------------------------------------------------------------+
| [NEXORA LOGO] | ANALYTICS CONSOLE  |  Range: Last 24 Hours [v]  | Exports: CSV / PDF            | OP-0428   |
+------------------------------------+------------------------------------+-------------------------------+
|  COMMUTER DENSITY OVER TIME (24h)  |  FLOW DENSITY DISTRIBUTION MATRIX  | PEAK INCIDENT GRID (HEATMAP)  |
|                                    |                                    |                               |
|  Density (ppl/m²)                  |  [ Histogram representation of      |  +-------------------------+  |
|   5.0 |             _              |    commuter dwell times across the  |  |   [Z1]    [Z2]   #[Z3]# |  |
|   4.0 |            / \             |    platforms]                      |  |   Safe    Safe   Bottl. |  |
|   3.0 |   __      /   \            |                                    |  |                          |  |
|   2.0 |  /  \____/     \___        |  - Platforms: Avg 4.2 minutes      |  |   [Z4]    [Z5]    [Z6]   |  |
|   0.0 +----------------------->    |  - Corridors: Avg 1.1 minutes      |  |   Safe    Safe    Safe   |  |
|      00:00  08:00  16:00  24:00    |  - Vestibule: Avg 0.4 minutes      |  +-------------------------+  |
+------------------------------------+------------------------------------+-------------------------------+
| Operational Analytics Summary:                                                                          |
| Daily Headcount: 142,500 commuters | Congestion Rate: -3.2% relative to yesterday  | Peak Sensor: Cam_142   |
+---------------------------------------------------------------------------------------------------------+
```

---

### 3.4 Camera Monitoring Page
The interface for tracking the status and video output of connected cameras.

```
+---------------------------------------------------------------------------------------------------------+
| [NEXORA LOGO] | FEED INTEGRATIONS PLATFORM  | Active Feeds: 182 | Offline: 0                      | OP-0428   |
+---------------------------------------------------------------------------------------------------------+
|   CAMERA FILTER SECTOR                                                                                  |
|   Zone: [ All Zones   v ] | System Status: [ All States v ] | Search Feed: [ Cam_Station_12           ] |
+----------------------------------+------------------------------------+---------------------------------+
| Feed Grid (Row 1)                |                                    |                                 |
|                                  |                                    |                                 |
|  [ CAM_STATION_12 - PLATFORM 1 ] |  [ CAM_STATION_14 - CORRIDOR C ]   |  [ CAM_STATION_15 - WEST GATE ]  |
|  +----------------------------+  |  +----------------------------+    |  +----------------------------+  |
|  |                            |  |  |                            |    |  |                            |  |
|  |  (Live Video Frame Stream) |  |  |  (Live Video Frame Stream) |    |  |  (Live Video Frame Stream) |  |
|  |  Status: ACTIVE            |  |  |  Status: ACTIVE            |    |  |  Status: ACTIVE            |  |
|  |  Density: 1.2 ppl/m²       |  |  |  Density: 3.4 ppl/m² (YEL) |    |  |  Density: 0.8 ppl/m²       |  |
|  +----------------------------+  |  +----------------------------+    |  +----------------------------+  |
+----------------------------------+------------------------------------+---------------------------------+
| Feed Grid (Row 2)                |                                    |                                 |
|                                  |                                    |                                 |
|  [ CAM_STATION_21 - ESCALATOR ]  |  [ CAM_STATION_22 - SUBWAY LINK ]  |  [ CAM_STATION_25 - PLAZA ]     |
|  +----------------------------+  |  +----------------------------+    |  +----------------------------+  |
|  |                            |  |  |                            |    |  |                            |  |
|  |  (Live Video Frame Stream) |  |  |  (Live Video Frame Stream) |    |  |  (Live Video Frame Stream) |  |
|  |  Status: ACTIVE            |  |  |  Status: ACTIVE            |    |  |  Status: ACTIVE            |  |
|  |  Density: 2.1 ppl/m²       |  |  |  Density: 0.4 ppl/m²       |    |  |  Density: 1.5 ppl/m²       |  |
|  +----------------------------+  |  +----------------------------+    |  +----------------------------+  |
+----------------------------------+------------------------------------+---------------------------------+
```

---

### 3.5 Reports Page
Enables auditing of incidents, system performance registers, and exporting compliance data.

```
+---------------------------------------------------------------------------------------------------------+
| [NEXORA LOGO] | PLATFORM AUDITS & COMPLIANCE REPORTS                              | OP-0428   |
+---------------------------------------------------------------------------------------------------------+
| Document Searches                                                                                       |
| File Type: [ PDF v ] | Date Range: [ Last 30 Days v ] | Sort by: [ Date Descending v ]  | [ Run Search ] |
+---------------------------------------------------------------------------------------------------------+
| Database Run Log Output Results                                                                         |
|                                                                                                         |
|   Date         Report Reference Code    Report Classification         Generated By      Export Link     |
|   ----------   ----------------------   ---------------------------   ---------------   -------------  |
|   2026-07-09   REP-AUDIT-1783           Operational Safety Log        SYSTEM            [ Download ]   |
|   2026-07-04   REP-ALER-0941            Red Alarm Response Audit      Operator OP-0428  [ Download ]   |
|   2026-06-30   REP-COMP-0842            GDPR Ingestion Blur Report    Security Auditor  [ Download ]   |
|   2026-06-25   REP-PERF-9821            Peak System Latency Report    System Engineer   [ Download ]   |
+---------------------------------------------------------------------------------------------------------+
| system total archived log databases: 1,482 records | Allocated Database footprint: 1.48 GB             |
+---------------------------------------------------------------------------------------------------------+
```

---

### 3.6 Settings & Calibration Page
Allows administrators to adjust alerting thresholds, manage camera connections, and calibrate spatial models.

```
+---------------------------------------------------------------------------------------------------------+
| [NEXORA LOGO] | PLATFORM CALIBRATIONS & SETTINGS                                  | ADMIN_04  |
+---------------------------------------------------------------------------------------------------------+
| Config Category: [ AI Forecasting Thresholds ] [ Camera Network Profiles ] [ SMS / PA Alert API Rules ]  |
+---------------------------------------------------------------------------------------------------------+
| Configuration Parameters (AI Forecasting Thresholds)                                                    |
|                                                                                                         |
|   1. Critical Crowd Density Limit (Caution Trigger)                                                     |
|      Value: [ 3.0 ] persons/m²  |  Description: Transitions zone warning levels from Green to Yellow.  |
|                                                                                                         |
|   2. Extreme Congestion Limit (Evacuation Trigger)                                                      |
|      Value: [ 4.5 ] persons/m²  |  Description: Transitions zone warning levels from Yellow to Red.     |
|                                                                                                         |
|   3. Predictive Alert Horizon Time Window                                                               |
|      Value: [ 15 ] Minutes      |  Description: Set temporal parameters for model forecasting alerts.  |
|                                                                                                         |
|   4. Frame Processing Frequency / Downsampling Rate                                                      |
|      Value: [ 5 ] frames/sec    |  Description: Sets processing rate to optimize GPU load balance.      |
|                                                                                                         |
|   [ SAVE SYSTEM CONFIGURATION CHANGES ]                   [ DISCARD PENDING ADJUSTMENTS ]               |
+---------------------------------------------------------------------------------------------------------+
```
