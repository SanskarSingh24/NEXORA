from pathlib import Path

from fastapi.testclient import TestClient

from backend.reports.report_service import create_app


def test_report_api_generates_daily_report_and_exports(tmp_path):
    app = create_app(output_dir=str(tmp_path))
    client = TestClient(app)

    response = client.post("/reports/generate", json={"scope": "DAILY"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["scope"] == "DAILY"
    assert payload["summary"]["total_headcount"] >= 0
    assert payload["report_id"].startswith("REP-")

    csv_filename = payload["exports"]["csv_filename"]
    pdf_filename = payload["exports"]["pdf_filename"]
    assert (tmp_path / csv_filename).exists()
    assert (tmp_path / pdf_filename).exists()

    csv_download = client.get(f"/reports/download/{csv_filename}")
    pdf_download = client.get(f"/reports/download/{pdf_filename}")
    assert csv_download.status_code == 200
    assert pdf_download.status_code == 200
