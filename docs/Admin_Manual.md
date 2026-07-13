# NEXORA Administration & Configuration Manual

This manual provides administrators with the procedures to configure, calibrate, and manage the NEXORA platform.

---

## 1. Camera Onboarding & Homography Calibration

To register and onboard a new camera stream:

### 1.1 Step-by-Step Registration
1. Access the administrator panel and navigate to **"Camera Configuration"**.
2. Click **"Register New Camera"** and fill out the fields:
   * **Camera Name**: Clear physical label (e.g. `Platform 2 Stairwell North`).
   * **Zone Identifier**: Links the camera to its physical zone (`ZONE_PLATFORM_2`).
   * **RTSP Stream Link**: The video stream URL (e.g. `rtsp://user:pass@10.5.12.3:554/h264_stream`).
   * **Location Coordinates**: Georeferenced coordinates (Latitude, Longitude) for map positioning.

### 1.2 Coordinate Calibration (Homography Matrix)
To map raw video pixels to top-down 2D map coordinates, you must define at least 4 coplanar control points:

```
     Camera Pixel Coordinates (x, y)           Top-Down Map Coordinates (X, Y)
     +-----------------------------+          +-----------------------------+
     |  (p1)                 (p2)  |   ==>    |  (P1)                 (P2)  |
     |                             |          |                             |
     |  (p3)                 (p4)  |          |  (P3)                 (P4)  |
     +-----------------------------+          +-----------------------------+
```

1. Select 4 points on the live camera view (e.g. corners of a ticketing corridor marker).
2. Input the corresponding top-down map coordinate $(X, Y)$ values for those points.
3. The platform computes the homography projection matrix $H$ and saves it to the camera database registry record.

---

## 2. Safety Thresholds & Alarm Configuration

The system uses three primary alert thresholds to classify crowd density:

```
      Density Value (persons per square meter)
      0.0              2.2                4.0                 5.0+
      +----------------+------------------+-------------------+
      |   Green Zone   |   Yellow Zone    |     Red Zone      |
      |   (Optimal)    |    (Warning)     |    (Critical)     |
      +----------------+------------------+-------------------+
```

Adjust these variables under the **"System Settings Configuration"** tab:
* **Warning Density Limit (Yellow)**: The threshold where crowd density is flagged as cautionary (default: `2.2` persons per square meter).
* **Critical Density Limit (Red)**: The threshold that triggers high-risk alerts and routing recommendations (default: `4.0` persons per square meter).
* **Max Queue Length**: Maximum allowed queue size before alerts trigger (default: `12` people).
* **Alert Retry/Siren Interval**: Timeout interval in seconds to throttle duplicate warnings (default: `30` seconds).

---

## 3. Machine Learning Model Retraining Loops

The predictive risk models (XGBoost) can be retrained as new historical telemetry logs accumulate.

1. Navigate to the **"AI Predictor Console"** under settings.
2. Review the current model version, training timestamp, and accuracy metrics.
3. Click **"Initiate Model Retraining"** to run the retraining pipeline. This reads historical TimescaleDB tables (filtering by the selected time period), validates data bounds balance, retrains the XGBoost classifier, and runs SHAP calibrating.
4. Verify the performance benchmarks of the new model draft before promoting it to production.

---

## 4. Security Audit Logging & Compliance

Administrators can view and search security logs under the **"Security logs Auditing"** section:
* Logs track all developer and operator actions (e.g. system configurations updates, alert acknowledgements, passwords modifications, active logins).
* To export GDPR compliance documents detailing facial blur statistics and edge deletion reports, click **"Generate GDPR Audit Log"**.
