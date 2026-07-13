# NEXORA AI Models & Prediction Pipeline

This document details the machine learning models, computer vision steps, explainable AI (XAI) factors, and caching optimizations implemented within the NEXORA platform.

---

## 1. Object Detection & tracking Interface

The NEXORA AI vision engine maps incoming camera stream frames into clean pedestrian coordinates and velocity tracking metrics.

```
+====================================================================================+
|                              VISUAL TRACKING STAGE                                 |
+====================================================================================+
| Raw Frame -> Resize/Normalize -> YOLOv11 Detector -> ByteTrack (Kalman Filter) -> O(1) Map Update |
+====================================================================================+
```

### 1.1 YOLOv11 Person Detection
* **Preprocessing**: Feed frames are converted to RGB format and downsampled/resized to $640 \times 640$ pixels to optimize matrix computation.
* **Inference**: A custom-trained YOLOv11 model isolates humans in dense crowds. Anchor vectors are optimized to support high-occlusion conditions (top-down views).
* **FP16 Half-Precision**: By enabling half-precision floats (`model.half()`), GPU VRAM usage drops by **50%**, boosting GPU performance on NVIDIA Tensor Cores.

### 1.2 ByteTrack Multi-Object tracking
* **Vector Association**: Rather than discarding detections below high confidence markers, ByteTrack integrates candidate bounding boxes using Kalman Filters. This maintains coordinates tracing even when a pedestrian is briefly occluded by building columns or objects.
* **CPU conservation**: Purging dead tracks (removing pedestrian tracking IDs that have left the scene) is throttled to execute **every 30 frames** instead of running continuously. This saves CPU overhead.

---

## 2. Predictive Risk Forecasting (XGBoost)

Crowd statistics (density, velocity vectors, queue length, and occupancy rates) are compiled into a feature vector and processed by an **XGBoost Classifier Model** to forecast crowd risk margins 15 minutes ahead of time.

* **Classifier Options**: Projects safety profiles into four distinct risk classifications:
  * `SAFE`: Normal congestion rate, steady speed vectors.
  * `MODERATE`: Density warnings, slowing entry rates.
  * `HIGH`: Localized bottlenecks, high-occupancy bounds.
  * `CRITICAL`: Evacuation triggers activated, safety limits breached.
* **Reliability Index Math**: Forecasting precision is reported as a confidence score combined with historical accuracy rates. The reliability score index evaluates input deviation from training boundaries:
  $$\text{Reliability} = \text{Confidence Score} \times \left(1 - \frac{\sum |X_{current} - \mu_{training}|}{\sigma_{training}}\right)$$

---

## 3. Explainable AI (SHAP Diagnostics)

To prevent black-box decision models, NEXORA runs local SHAP (SHapley Additive exPlanations) values calculations to explain why a risk level was predicted.

```
       Risk Forecast: HIGH
       +------------------------------------+
       | SHAP Contributions:                |
       |  - Density:       +0.32            |
       |  - Queue Length:  +0.18            |
       |  - Exit Rate:     -0.05            |
       +------------------------------------+
       Explanation Note: Crowd density build (+32%) and queue length (+18%) drove the trigger.
```

* **Attribution Formulas**: SHAP calculates game-theoretic values representing each feature's contribution to the difference between the actual prediction and the baseline expected value:
  $$\phi_i(x) = \sum_{S \subseteq F \setminus \{i\}} \frac{|S|!(|F| - |S| - 1)!}{|F|!} \left[f_x(S \cup \{i\}) - f_x(S)\right]$$
* **Natural Language Explanation Generator**: The contributions are mapped to a natural language reason (e.g. "Primary trigger is high density near Platform 1 escalator (+32% impact) accompanied by slow exit speed vectors").
* **Visual Grad-CAM Maps**: Deep convolutional visual activation maps project density hotspots onto operators' camera feeds.

---

## 4. High-Performance Explanation Cache

SHAP calculations are computationally resource-intensive, requiring multiple evaluations of tree paths in the XGBoost structure. Under high dashboard load, running SHAP on every frame would result in CPU starvation.

To optimize performance, `backend/ai/explainable_api.py` implements a custom, high-speed **LRU/FIFO explanation cache**:

* **Hashing Mechanism**: Input analytics are rounded and converted to a hashable tuple:
  ```python
  cache_key = (
      round(data.density, 2),
      round(data.speed, 2),
      round(data.entry_rate, 1),
      round(data.exit_rate, 1),
      round(data.flow_direction_angle, 1),
      data.queue_length,
      round(data.occupancy, 1)
  )
  ```
* **Cache Eviction Policy (FIFO)**: The cache is capped at a maximum of 500 entries. If the cache reaches capacity, the oldest record is evicted:
  ```python
  if len(self._explanation_cache) >= 500:
      oldest_key = self._cache_keys_fifo.pop(0)
      self._explanation_cache.pop(oldest_key, None)
  ```
* **Fresh Context ID Preservation**: When a cached explanation is hit, the system duplicates the object and assigns a **new unique prediction ID** (UUID4). This ensures that request tracking remains consistent while returning predictions instantly.
* **Performance Impact**: Cache hits execute in **$O(1)$ lookup time** (sub-millisecond), skipping SHAP calculations entirely and maintaining database response times.
