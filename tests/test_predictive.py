"""
NEXORA Crowd Risk AI Engines Testing
File: tests/test_predictive.py
"""

from fastapi.testclient import TestClient

from backend.ai.predictive_engine import app as predictive_app, RuleBasedPredictor, PredictionInput
from backend.ai.explainable_api import app as explainable_app, ShapExplainabilityManager


def test_rule_based_predictor_direct_logic():
    # Construct a critical threat scenario input
    threat_input = PredictionInput(
        density=4.8,
        speed=0.2,
        entry_rate=115.0,
        exit_rate=15.0,
        flow_direction_angle=90.0,
        queue_length=40,
        occupancy=105.0
    )
    res = RuleBasedPredictor.predict(threat_input)
    assert res.risk_level == "CRITICAL"
    assert res.risk_class_id == 3
    assert res.confidence_score == 0.95
    assert "density_influence" in res.factors

    # Construct a safe lobby entrance scenario input
    safe_input = PredictionInput(
        density=0.8,
        speed=1.4,
        entry_rate=12.0,
        exit_rate=10.0,
        flow_direction_angle=180.0,
        queue_length=1,
        occupancy=15.0
    )
    res_safe = RuleBasedPredictor.predict(safe_input)
    assert res_safe.risk_level == "SAFE"
    assert res_safe.risk_class_id == 0


def test_predict_risk_endpoint():
    client = TestClient(predictive_app)
    
    payload = {
        "density": 3.5,
        "speed": 0.6,
        "entry_rate": 85.0,
        "exit_rate": 60.0,
        "flow_direction_angle": 120.0,
        "queue_length": 25,
        "occupancy": 82.0
    }
    
    response = client.post("/predict/risk", json=payload)
    assert response.status_code == 200
    
    result = response.json()
    assert result["risk_level"] in ["SAFE", "MODERATE", "HIGH", "CRITICAL"]
    assert "confidence_score" in result
    assert "factors" in result


def test_explain_shap_endpoint():
    client = TestClient(explainable_app)
    
    payload = {
        "density": 4.25,
        "speed": 0.35,
        "entry_rate": 90.0,
        "exit_rate": 15.0,
        "flow_direction_angle": 45.0,
        "queue_length": 32,
        "occupancy": 98.0
    }
    
    response = client.post("/xai/explain", json=payload)
    assert response.status_code == 200
    
    result = response.json()
    assert "prediction_id" in result
    assert "predicted_risk_level" in result
    assert "prediction_reliability" in result
    assert "shap_contributions" in result
    assert "explanation_reason" in result
    assert len(result["feature_importance_ranking"]) == 7


def test_explainability_reliability_calculators():
    manager = ShapExplainabilityManager()
    
    # Normal boundaries inputs
    normal_case = PredictionInput(
        density=1.2, speed=1.2, entry_rate=15.0, exit_rate=15.0,
        flow_direction_angle=90.0, queue_length=2, occupancy=30.0
    )
    rel_normal = manager.compute_reliability(confidence=0.88, features=normal_case)
    # No penalties should show up
    assert rel_normal == 0.88

    # Extreme outlier boundaries inputs: density > 10.0, occupancy > 130.0
    outlier_case = PredictionInput(
        density=12.5, speed=1.5, entry_rate=80.0, exit_rate=60.0,
        flow_direction_angle=90.0, queue_length=40, occupancy=145.0
    )
    rel_outlier = manager.compute_reliability(confidence=0.90, features=outlier_case)
    # Deductions: -0.15 for density, -0.10 for occupancy -> 0.90 - 0.25 = 0.65
    assert rel_outlier == 0.65
