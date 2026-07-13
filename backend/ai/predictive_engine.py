"""
NEXORA Crowd Risk Predictive Engine
File: backend/ai/predictive_engine.py
Description: Production-ready Python FastAPI service integrating an XGBoost classifier. 
             Provides a synthetic dataset generator, a model training pipeline, 
             and a real-time risk prediction API with security classification targets.
"""

import os

from config.settings import settings
import time
from typing import Dict, List, Optional
from uuid import UUID, uuid4

import numpy as np
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

# Try to import ML libraries. Fallback to a rule-based engine if not present.
try:
    import joblib
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report, accuracy_score
    import xgboost as xgb
    SKLEARN_XGBOOST_AVAILABLE = True
except ImportError:
    SKLEARN_XGBOOST_AVAILABLE = False
    print("WARNING: 'xgboost', 'scikit-learn', or 'joblib' libraries not found.")
    print("AI Predictive Engine will run in Rule-Based Simulation mode.")

# =====================================================================
# 1. DATA CONFIGURATION & SCHEMAS
# =====================================================================

# ML model path sourced from centralised settings — no fallback, required at startup.
MODEL_PATH: str = settings.ml_model_path

class PredictionInput(BaseModel):
    density: float = Field(..., ge=0.0, le=15.0, description="People per square meter")
    speed: float = Field(..., ge=0.0, le=10.0, description="Average velocity in m/s")
    entry_rate: float = Field(..., ge=0.0, description="People entering per minute")
    exit_rate: float = Field(..., ge=0.0, description="People exiting per minute")
    flow_direction_angle: float = Field(..., ge=0.0, le=360.0, description="Average flow direction in degrees")
    queue_length: int = Field(..., ge=0, description="Current queue count in target zone")
    occupancy: float = Field(..., ge=0.0, le=150.0, description="Occupancy percentage")


class PredictionOutput(BaseModel):
    risk_level: str  # SAFE, MODERATE, HIGH, CRITICAL
    risk_class_id: int # 0, 1, 2, 3
    confidence_score: float
    factors: Dict[str, float]  # Simulated SHAP values or feature importance


# =====================================================================
# 2. SYNTHETIC DATA GENERATOR & TRAINING PIPELINE
# =====================================================================

class CrowdRiskModelManager:
    @staticmethod
    def generate_synthetic_data(num_samples: int = 1500) -> tuple:
        """
        Generates structured synthetic training data to feed the XGBoost model.
        Features: [density, speed, entry_rate, exit_rate, flow_angle, queue_length, occupancy]
        Labels: 0 (Safe), 1 (Moderate), 2 (High), 3 (Critical)
        """
        np.random.seed(42)
        
        # Draw random feature values
        density = np.random.uniform(0.1, 8.0, num_samples)
        speed = np.random.uniform(0.0, 4.5, num_samples)
        entry_rate = np.random.uniform(5.0, 120.0, num_samples)
        exit_rate = np.random.uniform(5.0, 120.0, num_samples)
        flow_angle = np.random.uniform(0.0, 360.0, num_samples)
        queue_length = np.random.randint(0, 50, num_samples)
        occupancy = np.random.uniform(5.0, 120.0, num_samples)
        
        X = np.stack([density, speed, entry_rate, exit_rate, flow_angle, queue_length, occupancy], axis=1)
        y = np.zeros(num_samples, dtype=int)
        
        # Label generation logic based on crowd safety rules
        for i in range(num_samples):
            d, s, ent, ex, _, q, occ = X[i]
            
            # Critical Anomaly: High density, low speed, long queue
            if d >= 4.5 or (d >= 3.5 and s < 0.45) or occ >= 100.0 or q > 35:
                y[i] = 3  # Critical
            # High Risk: Elevated density, low speeds
            elif d >= 3.0 or q > 20 or occ >= 80.0 or (s < 0.8 and d >= 2.0):
                y[i] = 2  # High
            # Moderate Risk: Mid-range metrics
            elif d >= 1.8 or q > 10 or occ >= 60.0 or ent > 80.0:
                y[i] = 1  # Moderate
            # Safe Risk: Low density, normal speeds
            else:
                y[i] = 0  # Safe
                
        return X, y

    @staticmethod
    def train_model(save_path: str = MODEL_PATH) -> dict:
        """
        Runs the training pipeline and saves the model using joblib.
        """
        if not SKLEARN_XGBOOST_AVAILABLE:
            return {"status": "ERROR", "message": "ML libraries unavailable. Training pipeline skipped."}
            
        X, y = CrowdRiskModelManager.generate_synthetic_data()
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # XGBoost Classifier
        model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            objective="multi:softprob",
            num_class=4,
            random_state=42
        )
        
        # Fit Model
        model.fit(X_train, y_train)
        
        # Evaluate Model
        preds = model.predict(X_test)
        accuracy = accuracy_score(y_test, preds)
        
        # Save model
        joblib.dump(model, save_path)
        
        return {
            "status": "SUCCESS",
            "accuracy": float(accuracy),
            "samples_trained": len(X_train),
            "samples_tested": len(X_test),
            "saved_path": save_path
        }


# =====================================================================
# 3. RULE-BASED FALLBACK PROCESSOR
# =====================================================================

class RuleBasedPredictor:
    """Fallback classifier when scikit-learn or XGBoost are missing."""
    @staticmethod
    def predict(data: PredictionInput) -> PredictionOutput:
        d, s, ent, ex, q, occ = (
            data.density, 
            data.speed, 
            data.entry_rate, 
            data.exit_rate, 
            data.queue_length, 
            data.occupancy
        )
        
        # Determine class based on rules matching generated data triggers
        if d >= 4.5 or (d >= 3.5 and s < 0.45) or occ >= 100.0 or q > 35:
            risk_label, class_id, conf = "CRITICAL", 3, 0.95
        elif d >= 3.0 or q > 20 or occ >= 80.0 or (s < 0.8 and d >= 2.0):
            risk_label, class_id, conf = "HIGH", 2, 0.88
        elif d >= 1.8 or q > 10 or occ >= 60.0 or ent > 80.0:
            risk_label, class_id, conf = "MODERATE", 1, 0.76
        else:
            risk_label, class_id, conf = "SAFE", 0, 0.92

        # Feature Importance representation
        factors = {
            "density_influence": d * 0.4,
            "speed_influence": (5.0 - s) * 0.2 if s < 5.0 else 0.0,
            "occupancy_influence": occ * 0.003,
            "queue_influence": q * 0.01
        }
        
        # Normalize influence mapping
        factor_sum = sum(factors.values())
        if factor_sum > 0:
            factors = {k: round(v / factor_sum, 2) for k, v in factors.items()}
            
        return PredictionOutput(
            risk_level=risk_label,
            risk_class_id=class_id,
            confidence_score=conf,
            factors=factors
        )


# =====================================================================
# 4. PREDICTION API ENDPOINTS
# =====================================================================

app = FastAPI(title="NEXORA Crowd Risk Prediction service", version="1.0.0")

# Global model handler pointer
xgb_model = None

@app.on_event("startup")
def load_trained_model():
    """Loads target XGBoost model checkpoints during initialization."""
    global xgb_model
    if SKLEARN_XGBOOST_AVAILABLE and os.path.exists(MODEL_PATH):
        try:
            xgb_model = joblib.load(MODEL_PATH)
            print(f"Model weights loaded successfully from: {MODEL_PATH}")
        except Exception as e:
            print(f"Error loading model weights: {e}. Defaulting to rule-based fallback.")
    else:
        # Auto-train on startup if ML library exists but no saved model is found
        if SKLEARN_XGBOOST_AVAILABLE:
            print("No model checkpoints found. Training new model...")
            try:
                results = CrowdRiskModelManager.train_model(MODEL_PATH)
                xgb_model = joblib.load(MODEL_PATH)
                print(f"Auto-train complete. Accuracy: {results['accuracy']:.4f}")
            except Exception as e:
                print(f"Auto-train failed on startup: {e}.")


@app.post("/predict/risk", response_model=PredictionOutput)
def predict_crowd_risk(payload: PredictionInput):
    """
    Evaluates crowd metrics to classify security risk levels.
    """
    global xgb_model
    
    # 1. Use the loaded XGBoost model if available
    if SKLEARN_XGBOOST_AVAILABLE and xgb_model is not None:
        try:
            # Map features to input format
            features = np.array([[
                payload.density,
                payload.speed,
                payload.entry_rate,
                payload.exit_rate,
                payload.flow_direction_angle,
                payload.queue_length,
                payload.occupancy
            ]])
            
            # Predict class probability distributions
            probabilities = xgb_model.predict_proba(features)[0]
            class_id = int(np.argmax(probabilities))
            confidence_score = float(probabilities[class_id])
            
            risk_labels = ["SAFE", "MODERATE", "HIGH", "CRITICAL"]
            risk_label = risk_labels[class_id]
            
            # Renders feature importance logs
            feature_names = ["density", "speed", "entry_rate", "exit_rate", "flow_angle", "queue_length", "occupancy"]
            importances = xgb_model.feature_importances_
            factors = {feature_names[i]: float(importances[i]) for i in range(len(feature_names))}
            
            return PredictionOutput(
                risk_level=risk_label,
                risk_class_id=class_id,
                confidence_score=round(confidence_score, 3),
                factors=factors
            )
        except Exception as e:
            print(f"Error during ML inference run: {e}. Defaulting to rule-based fallback.")

    # 2. Fall back to rule-based handler if model or ML libraries are unavailable
    return RuleBasedPredictor.predict(payload)


@app.post("/predict/train-model", status_code=status.HTTP_200_OK)
def trigger_training():
    """
    Triggers the training pipeline and refreshes the active model weights.
    """
    global xgb_model
    if not SKLEARN_XGBOOST_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="ML libraries unavailable. Action aborted."
        )
        
    try:
        results = CrowdRiskModelManager.train_model(MODEL_PATH)
        # Refresh the global model instance
        if results["status"] == "SUCCESS":
            xgb_model = joblib.load(MODEL_PATH)
        return results
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model training pipeline failed: {e}"
        )


# =====================================================================
# 5. TESTING MAIN HOOK
# =====================================================================
if __name__ == "__main__":
    if SKLEARN_XGBOOST_AVAILABLE:
        print("Scikit-Learn and XGBoost detected. Running training pipeline tests...")
        metrics = CrowdRiskModelManager.train_model("test_weights.joblib")
        print("Training complete, metrics output:")
        print(metrics)
        # clean test weights file
        if os.path.exists("test_weights.joblib"):
            os.remove("test_weights.joblib")
    else:
        print("XGBoost or Scikit-learn not available. Running Rule-Based Evaluation...")
        test_case = PredictionInput(
            density=5.2,
            speed=0.25,
            entry_rate=110.0,
            exit_rate=12.0,
            flow_direction_angle=45.0,
            queue_length=42,
            occupancy=110.5
        )
        predict_response = RuleBasedPredictor.predict(test_case)
        print("Prediction result:")
        print(predict_response)
