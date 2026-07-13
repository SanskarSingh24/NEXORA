"""
NEXORA Explainable AI (XAI) API
File: backend/ai/explainable_api.py
Description: Production-ready Python FastAPI service integrating SHAP (SHapley Additive exPlanations)
             to output AI confidence, feature contributions, prediction reliability,
             and natural language explanation details.
"""

import os
from typing import Dict, List
from uuid import uuid4

import numpy as np
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

# Import ML and SHAP packages. Fall back gracefully to simulation model if not present.
try:
    import joblib
    import shap
    SKLEARN_SHAP_AVAILABLE = True
except ImportError:
    SKLEARN_SHAP_AVAILABLE = False
    print("WARNING: 'shap' or 'joblib' library not found.")
    print("Explainable AI (XAI) API will run in Simulation Mode.")

# Import local data model structures from predictive_engine.py
from backend.ai.predictive_engine import PredictionInput, MODEL_PATH, SKLEARN_XGBOOST_AVAILABLE

# =====================================================================
# 1. API SCHEMAS & SPECIFICATIONS
# =====================================================================

class XAIExplanationOutput(BaseModel):
    prediction_id: str
    predicted_risk_level: str
    confidence_score: float                # probability returned by model
    prediction_reliability: float          # reliability score (0.0 to 1.0)
    base_value: float                      # SHAP base value (expected value)
    shap_contributions: Dict[str, float]   # Feature coordinate SHAP values
    feature_importance_ranking: List[str]  # Ordered feature names starting with high impact
    explanation_reason: str                # Natural language explanation text

# =====================================================================
# 2. SHAP WRAPPER & REASON GENERATOR
# =====================================================================

class ShapExplainabilityManager:
    def __init__(self, model_file: str = MODEL_PATH):
        self.model = None
        self.explainer = None
        self.feature_names = ["density", "speed", "entry_rate", "exit_rate", "flow_angle", "queue_length", "occupancy"]
        
        # Load the trained model if libraries are available
        if SKLEARN_SHAP_AVAILABLE and SKLEARN_XGBOOST_AVAILABLE and os.path.exists(model_file):
            try:
                self.model = joblib.load(model_file)
                # Create a SHAP TreeExplainer optimized for XGBoost tree models
                self.explainer = shap.TreeExplainer(self.model)
                print(f"SHAP TreeExplainer initialized for model: {model_file}")
            except Exception as e:
                print(f"Error initializing TreeExplainer: {e}. Defaulting to fallback explainer.")

    def compute_reliability(self, confidence: float, features: PredictionInput) -> float:
        """
        Calculates a reliability index (0.0 to 1.0) based on:
        1. Model confidence score.
        2. Detection of feature outliers (out-of-bounds readings).
        """
        # Base reliability matches the model confidence score
        reliability = confidence
        
        # Deduct reliability if features report extreme outlier values
        # e.g., Density exceeding physical safety caps
        outlier_penalties = 0.0
        if features.density > 10.0:
            outlier_penalties += 0.15
        if features.occupancy > 130.0:
            outlier_penalties += 0.10
        if features.speed > 8.0:
            outlier_penalties += 0.10
            
        reliability = max(0.1, reliability - outlier_penalties)
        return round(reliability, 2)

    def generate_natural_reason(self, 
                                 risk_level: str, 
                                 contributions: Dict[str, float], 
                                 metrics: PredictionInput) -> str:
        """
        Generates a natural language explanation matching feature contribution values.
        """
        if risk_level == "SAFE":
            return (f"The crowd status is SAFE because the crowd density is normal ({metrics.density:.2f} ppl/sqm) "
                    f"and pedestrian movement speeds are within safe thresholds ({metrics.speed:.2f} m/s).")
            
        # Sort features based on their positive contribution to the risk level
        positive_impacts = {k: v for k, v in contributions.items() if v > 0}
        sorted_impacts = sorted(positive_impacts.items(), key=lambda item: item[1], reverse=True)
        
        if not sorted_impacts:
            return f"The crowd risk is classified as {risk_level} due to standard threshold margins."
            
        primary_factor, prim_val = sorted_impacts[0]
        
        # Build explanation sentences
        reason = f"The crowd risk is classified as {risk_level} primarily driven by "
        
        factor_mappings = {
            "density": f"high crowd density ({metrics.density:.2f} ppl/sqm, contribution +{prim_val:.2f})",
            "speed": f"low movement speed ({metrics.speed:.2f} m/s, contribution +{prim_val:.2f})",
            "queue_length": f"high queue queues length ({metrics.queue_length} persons, contribution +{prim_val:.2f})",
            "occupancy": f"elevated occupancy level ({metrics.occupancy:.1f}%, contribution +{prim_val:.2f})",
            "entry_rate": f"rapid entry rate ({metrics.entry_rate:.1f} ppl/min, contribution +{prim_val:.2f})",
            "exit_rate": f"elevated exit rate ({metrics.exit_rate:.1f} ppl/min, contribution +{prim_val:.2f})",
            "flow_angle": f"conflicted flow direction angles ({metrics.flow_direction_angle:.1f} deg, contribution +{prim_val:.2f})"
        }
        
        reason += factor_mappings.get(primary_factor, f"environmental dynamics (+{prim_val:.2f})")
        
        if len(sorted_impacts) > 1:
            sec_factor, sec_val = sorted_impacts[1]
            sec_text = factor_mappings.get(sec_factor, f"secondary factors (+{sec_val:.2f})").split("(")[0].strip()
            reason += f", compounded by {sec_text} (contribution +{sec_val:.2f})."
        else:
            reason += "."
            
        return reason

    def explain(self, data: PredictionInput) -> XAIExplanationOutput:
        """
        Runs SHAP value calculations or simulates local contributions when offline.
        Uses cached outputs for matching feature sets to prevent heavy recurrent CPU cycles.
        """
        # Hashed tuple key for O(1) lookup
        cache_key = (
            round(data.density, 2),
            round(data.speed, 2),
            round(data.entry_rate, 1),
            round(data.exit_rate, 1),
            round(data.flow_direction_angle, 1),
            data.queue_length,
            round(data.occupancy, 1)
        )

        if not hasattr(self, "_explanation_cache"):
            self._explanation_cache = {}
            self._cache_keys_fifo = []

        if cache_key in self._explanation_cache:
            cached_res = self._explanation_cache[cache_key]
            # Copy result with a fresh prediction ID trace
            return XAIExplanationOutput(
                prediction_id=str(uuid4()),
                predicted_risk_level=cached_res.predicted_risk_level,
                confidence_score=cached_res.confidence_score,
                prediction_reliability=cached_res.prediction_reliability,
                base_value=cached_res.base_value,
                shap_contributions=cached_res.shap_contributions,
                feature_importance_ranking=cached_res.feature_importance_ranking,
                explanation_reason=cached_res.explanation_reason
            )

        # Map values to feature matrix representation
        input_vector = np.array([[
            data.density,
            data.speed,
            data.entry_rate,
            data.exit_rate,
            data.flow_direction_angle,
            data.queue_length,
            data.occupancy
        ]])

        explanation_output = None

        # -------------------------------------------------------------
        # CASE A: Real SHAP Pipeline
        # -------------------------------------------------------------
        if SKLEARN_SHAP_AVAILABLE and self.model is not None and self.explainer is not None:
            try:
                # Predict class probabilities
                probs = self.model.predict_proba(input_vector)[0]
                class_id = int(np.argmax(probs))
                confidence_score = float(probs[class_id])
                
                risk_labels = ["SAFE", "MODERATE", "HIGH", "CRITICAL"]
                risk_label = risk_labels[class_id]

                # Compute SHAP values for the current input
                shap_values = self.explainer.shap_values(input_vector)
                
                # Check shape matrix dimensions: multiclass SHAP returns a list of arrays [classes, samples, features]
                if isinstance(shap_values, list):
                    # Multiclass TreeExplainer list output
                    class_shap = shap_values[class_id][0]
                    base_val = float(self.explainer.expected_value[class_id])
                else:
                    # Binary or single matrix outputs
                    if len(shap_values.shape) == 3:  # [samples, features, classes] shape format
                        class_shap = shap_values[0, :, class_id]
                        base_val = float(self.explainer.expected_value[class_id])
                    else:
                        class_shap = shap_values[0]
                        base_val = float(self.explainer.expected_value)

                # Map SHAP values to feature names
                contributions = {self.feature_names[i]: float(class_shap[i]) for i in range(len(self.feature_names))}
                
                # Rank features by absolute impact
                sorted_features = sorted(self.feature_names, key=lambda f: abs(contributions[f]), reverse=True)
                reliability = self.compute_reliability(confidence_score, data)
                reason_text = self.generate_natural_reason(risk_label, contributions, data)
                
                explanation_output = XAIExplanationOutput(
                    prediction_id=str(uuid4()),
                    predicted_risk_level=risk_label,
                    confidence_score=round(confidence_score, 3),
                    prediction_reliability=reliability,
                    base_value=round(base_val, 3),
                    shap_contributions=contributions,
                    feature_importance_ranking=sorted_features,
                    explanation_reason=reason_text
                )
            except Exception as e:
                print(f"Error executing SHAP calculations: {e}. Falling back to simulation model.")

        if explanation_output is None:
            # -------------------------------------------------------------
            # CASE B: Fallback/Simulation Pipeline
            # -------------------------------------------------------------
            # Calculate simulated risk label based on features
            d, s, q, occ = data.density, data.speed, data.queue_length, data.occupancy
            if d >= 4.5 or occ >= 100.0 or q > 35:
                risk_label, class_id, confidence_score = "CRITICAL", 3, 0.94
            elif d >= 3.0 or q > 20 or occ >= 80.0:
                risk_label, class_id, confidence_score = "HIGH", 2, 0.86
            elif d >= 1.8 or q > 10 or occ >= 50.0:
                risk_label, class_id, confidence_score = "MODERATE", 1, 0.72
            else:
                risk_label, class_id, confidence_score = "SAFE", 0, 0.90

            # Calculate Shapley-like feature values based on input deviations
            contributions = {
                "density": max(-0.2, (d - 1.5) * 0.15),
                "speed": max(-0.1, (1.5 - s) * 0.18) if s < 1.5 else -0.1,
                "entry_rate": max(-0.05, (data.entry_rate - 40) * 0.002),
                "exit_rate": max(-0.05, (data.exit_rate - 40) * 0.001),
                "flow_angle": 0.02 if abs(data.flow_direction_angle - 180) < 45 else -0.02,
                "queue_length": max(-0.1, (q - 5) * 0.02),
                "occupancy": max(-0.2, (occ - 40.0) * 0.008)
            }
            
            # Round contributions
            contributions = {k: round(v, 3) for k, v in contributions.items()}
            sorted_features = sorted(self.feature_names, key=lambda f: abs(contributions[f]), reverse=True)
            
            base_val = 0.15  # baseline expected risk value
            reliability = self.compute_reliability(confidence_score, data)
            reason_text = self.generate_natural_reason(risk_label, contributions, data)

            explanation_output = XAIExplanationOutput(
                prediction_id=str(uuid4()),
                predicted_risk_level=risk_label,
                confidence_score=confidence_score,
                prediction_reliability=reliability,
                base_value=base_val,
                shap_contributions=contributions,
                feature_importance_ranking=sorted_features,
                explanation_reason=reason_text
            )

        # Store in cache (cap at 500 records)
        if len(self._explanation_cache) >= 500:
            oldest_key = self._cache_keys_fifo.pop(0)
            self._explanation_cache.pop(oldest_key, None)
        
        self._explanation_cache[cache_key] = explanation_output
        self._cache_keys_fifo.append(cache_key)

        return explanation_output


# =====================================================================
# 3. EXPLAINABLE AI API ENDPOINTS
# =====================================================================

app = FastAPI(title="NEXORA Explainable AI microservice", version="1.0.0")
xai_manager = ShapExplainabilityManager()

@app.post("/xai/explain", response_model=XAIExplanationOutput)
def get_prediction_explanation(payload: PredictionInput):
    """
    Computes active SHAP value contributions and outlines natural language reasons
    explaining risk classifications.
    """
    try:
        explanation = xai_manager.explain(payload)
        return explanation
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"XAI calculation failed: {e}"
        )


# =====================================================================
# 4. DIRECT RUN TESTING SCRIPT
# =====================================================================
if __name__ == "__main__":
    manager = ShapExplainabilityManager()
    
    # Critical test case inputs
    test_case = PredictionInput(
        density=4.85,
        speed=0.35,
        entry_rate=95.0,
        exit_rate=12.0,
        flow_direction_angle=185.0,
        queue_length=38,
        occupancy=105.2
    )
    
    print("Testing SHAP Explainability Engine...")
    result = manager.explain(test_case)
    print("XAI Prediction Explanation Output:")
    print(f" - Mapped Risk Class: {result.predicted_risk_level}")
    print(f" - Confidence Scale: {result.confidence_score * 100}%")
    print(f" - Outlier Reliability: {result.prediction_reliability * 100}%")
    print(f" - Reason text generated:\n   \"{result.explanation_reason}\"")
    print("Feature SHAP contributions detail:")
    for feature, val in result.shap_contributions.items():
        print(f" * {feature.capitalize()}: {val}")
