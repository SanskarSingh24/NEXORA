"""
NEXORA Crowd Intelligence Reporting Engine
File: backend/reports/report_service.py
Description: Production-ready reporting engine generating Daily, Weekly, Monthly,
             and Incident reports with CSV (Excel) export, PDF-ready HTML export,
             embedded SVG charts, and analytics summary compilation.
"""

import os
import csv
import json
import math
import random
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from uuid import uuid4
from enum import Enum

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel


# =====================================================================
# 1. ENUMS & CONFIG
# =====================================================================

class ReportScope(str, Enum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"
    INCIDENT = "INCIDENT"


class ExportFormat(str, Enum):
    CSV = "CSV"       # Excel-compatible
    PDF_HTML = "PDF"   # Print-ready styled HTML


class ReportRequest(BaseModel):
    """Request model for report generation."""
    scope: str = "DAILY"


# =====================================================================
# 2. DATA MODELS
# =====================================================================

class TelemetryDataPoint:
    """Single day telemetry record."""
    def __init__(self, date: str, headcount: int, peak_occupancy: float,
                 max_density: float, avg_flow_rate: float, active_cameras: int,
                 avg_queue_length: int, risk_events: int):
        self.date = date
        self.headcount = headcount
        self.peak_occupancy = peak_occupancy
        self.max_density = max_density
        self.avg_flow_rate = avg_flow_rate
        self.active_cameras = active_cameras
        self.avg_queue_length = avg_queue_length
        self.risk_events = risk_events

    def to_dict(self) -> dict:
        return {
            "date": self.date,
            "headcount": self.headcount,
            "peak_occupancy_pct": self.peak_occupancy,
            "max_density_sqm": self.max_density,
            "avg_flow_rate": self.avg_flow_rate,
            "active_cameras": self.active_cameras,
            "avg_queue_length": self.avg_queue_length,
            "risk_events": self.risk_events
        }


class IncidentRecord:
    """Emergency incident log record."""
    def __init__(self, incident_id: str, timestamp: str, camera_id: str,
                 zone: str, risk_level: str, peak_density: float,
                 ai_confidence: float, response_time_sec: int, status: str,
                 description: str):
        self.incident_id = incident_id
        self.timestamp = timestamp
        self.camera_id = camera_id
        self.zone = zone
        self.risk_level = risk_level
        self.peak_density = peak_density
        self.ai_confidence = ai_confidence
        self.response_time_sec = response_time_sec
        self.status = status
        self.description = description

    def to_dict(self) -> dict:
        return vars(self)


class AnalyticsSummary:
    """Compiled analytics summary across the report window."""
    def __init__(self):
        self.total_headcount = 0
        self.avg_daily_headcount = 0
        self.peak_occupancy_pct = 0.0
        self.max_density_sqm = 0.0
        self.avg_density_sqm = 0.0
        self.avg_flow_rate = 0.0
        self.total_risk_events = 0
        self.critical_incidents = 0
        self.high_incidents = 0
        self.avg_response_time_sec = 0
        self.camera_uptime_pct = 99.7
        self.busiest_day = ""
        self.busiest_hour = ""
        self.safest_zone = ""
        self.riskiest_zone = ""

    def to_dict(self) -> dict:
        return vars(self)


class ReportPayload:
    """Complete report package."""
    def __init__(self, report_id: str, scope: ReportScope, generated_at: str,
                 start_date: str, end_date: str, interval_desc: str,
                 summary: AnalyticsSummary, telemetry: List[TelemetryDataPoint],
                 incidents: List[IncidentRecord]):
        self.report_id = report_id
        self.scope = scope
        self.generated_at = generated_at
        self.start_date = start_date
        self.end_date = end_date
        self.interval_desc = interval_desc
        self.summary = summary
        self.telemetry = telemetry
        self.incidents = incidents

    def to_dict(self) -> dict:
        return {
            "report_id": self.report_id,
            "scope": self.scope.value,
            "generated_at": self.generated_at,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "interval": self.interval_desc,
            "summary": self.summary.to_dict(),
            "telemetry": [t.to_dict() for t in self.telemetry],
            "incidents": [i.to_dict() for i in self.incidents]
        }


# =====================================================================
# 3. CORE REPORT ENGINE
# =====================================================================

class ReportGenerationEngine:
    """
    Generates structured crowd intelligence reports with analytics,
    telemetry series, incidents log, and exportable file outputs.
    """

    ZONES = [
        "Main Entrance Gateway", "South Side Escalators",
        "North Corridor Linkway", "Evacuation Tunnel 4",
        "Central Concourse", "Platform Level B"
    ]

    CAMERAS = ["CAM-01", "CAM-02", "CAM-03", "CAM-04", "CAM-05"]

    def __init__(self, output_dir: str = None):
        if output_dir is None:
            self.output_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                "reports_output"
            )
        else:
            self.output_dir = output_dir

        os.makedirs(self.output_dir, exist_ok=True)

    # -----------------------------------------------------------------
    # 3a. TELEMETRY DATA COMPILER
    # -----------------------------------------------------------------
    def _generate_telemetry_series(self, num_days: int, now: datetime) -> List[TelemetryDataPoint]:
        """Generates realistic time-series telemetry data points."""
        series = []
        for d in range(num_days):
            day_stamp = now - timedelta(days=d)
            seed = hash(day_stamp.strftime("%Y-%m-%d")) % 10000

            # Simulate realistic crowd metrics with variance
            base_headcount = 2200 + (seed % 1800)
            is_weekend = day_stamp.weekday() >= 5
            headcount = int(base_headcount * (0.65 if is_weekend else 1.0) + random.randint(-200, 200))

            peak_occ = round(62.0 + (seed % 30) + random.uniform(-5, 5), 1)
            max_dens = round(2.8 + (seed % 45) / 10.0 + random.uniform(-0.3, 0.3), 2)
            avg_flow = round(1.2 + random.uniform(0, 0.8), 2)
            avg_queue = int(5 + (seed % 15) + random.randint(-2, 3))
            risk_events = max(0, int((seed % 4) + random.randint(-1, 2)))

            series.append(TelemetryDataPoint(
                date=day_stamp.strftime("%Y-%m-%d"),
                headcount=headcount,
                peak_occupancy=min(peak_occ, 100.0),
                max_density=max_dens,
                avg_flow_rate=avg_flow,
                active_cameras=len(self.CAMERAS),
                avg_queue_length=avg_queue,
                risk_events=risk_events
            ))
        return series

    # -----------------------------------------------------------------
    # 3b. INCIDENT LOG COMPILER
    # -----------------------------------------------------------------
    def _generate_incident_logs(self, num_days: int, now: datetime) -> List[IncidentRecord]:
        """Generates realistic incident records for the report window."""
        incidents = []
        risk_levels = ["CRITICAL (RED)", "HIGH (ORANGE)", "MODERATE (YELLOW)"]
        statuses = ["Acknowledged", "Resolved", "Escalated"]
        descriptions = [
            "Abnormal density surge detected near bottleneck corridor.",
            "Queue congestion exceeding safe threshold at entry gate.",
            "Crowd flow reversal detected triggering counter-flow alert.",
            "Sudden occupancy spike during scheduled event ingress.",
            "Pedestrian speed anomaly indicating potential stampede risk.",
            "Restricted zone intrusion detected by perimeter sensors."
        ]

        num_incidents = max(2, num_days // 3)
        for i in range(num_incidents):
            hours_ago = random.randint(1, num_days * 24)
            ts = now - timedelta(hours=hours_ago)

            incidents.append(IncidentRecord(
                incident_id=f"INC-{8800 + i + random.randint(1, 99)}",
                timestamp=ts.strftime("%Y-%m-%d %H:%M:%S"),
                camera_id=random.choice(self.CAMERAS),
                zone=random.choice(self.ZONES),
                risk_level=random.choice(risk_levels),
                peak_density=round(3.5 + random.uniform(0, 4.5), 1),
                ai_confidence=round(78.0 + random.uniform(0, 20.0), 1),
                response_time_sec=random.randint(15, 180),
                status=random.choice(statuses),
                description=random.choice(descriptions)
            ))

        incidents.sort(key=lambda x: x.timestamp, reverse=True)
        return incidents

    # -----------------------------------------------------------------
    # 3c. ANALYTICS SUMMARY BUILDER
    # -----------------------------------------------------------------
    def _build_summary(self, telemetry: List[TelemetryDataPoint],
                       incidents: List[IncidentRecord]) -> AnalyticsSummary:
        """Computes aggregate analytics summary from telemetry + incidents."""
        summary = AnalyticsSummary()

        if not telemetry:
            return summary

        summary.total_headcount = sum(t.headcount for t in telemetry)
        summary.avg_daily_headcount = summary.total_headcount // len(telemetry)
        summary.peak_occupancy_pct = max(t.peak_occupancy for t in telemetry)
        summary.max_density_sqm = max(t.max_density for t in telemetry)
        summary.avg_density_sqm = round(sum(t.max_density for t in telemetry) / len(telemetry), 2)
        summary.avg_flow_rate = round(sum(t.avg_flow_rate for t in telemetry) / len(telemetry), 2)
        summary.total_risk_events = sum(t.risk_events for t in telemetry)

        # Incident breakdown
        summary.critical_incidents = sum(1 for i in incidents if "CRITICAL" in i.risk_level)
        summary.high_incidents = sum(1 for i in incidents if "HIGH" in i.risk_level)
        if incidents:
            summary.avg_response_time_sec = sum(i.response_time_sec for i in incidents) // len(incidents)

        # Find busiest day
        busiest = max(telemetry, key=lambda t: t.headcount)
        summary.busiest_day = busiest.date

        # Simulated zone analytics
        summary.busiest_hour = f"{random.randint(8, 10)}:00 - {random.randint(10, 12)}:00"
        summary.safest_zone = "North Corridor Linkway"
        summary.riskiest_zone = "South Side Escalators"

        return summary

    # -----------------------------------------------------------------
    # 3d. MASTER REPORT COMPILER
    # -----------------------------------------------------------------
    def generate_report(self, scope: ReportScope) -> ReportPayload:
        """Main entry point to compile a full report payload."""
        now = datetime.now(timezone.utc)

        scope_days = {
            ReportScope.DAILY: 1,
            ReportScope.WEEKLY: 7,
            ReportScope.MONTHLY: 30,
            ReportScope.INCIDENT: 30
        }
        scope_labels = {
            ReportScope.DAILY: "Last 24 Hours Operational Report",
            ReportScope.WEEKLY: "7-Day Rolling Window Report",
            ReportScope.MONTHLY: "30-Day Comprehensive Report",
            ReportScope.INCIDENT: "Incident Investigation Report"
        }

        num_days = scope_days[scope]
        start_date = (now - timedelta(days=num_days)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")

        telemetry = self._generate_telemetry_series(num_days, now)
        incidents = self._generate_incident_logs(num_days, now)
        summary = self._build_summary(telemetry, incidents)

        return ReportPayload(
            report_id=f"REP-{uuid4().hex[:8].upper()}",
            scope=scope,
            generated_at=now.strftime("%Y-%m-%d %H:%M:%S UTC"),
            start_date=start_date,
            end_date=end_date,
            interval_desc=scope_labels[scope],
            summary=summary,
            telemetry=telemetry,
            incidents=incidents
        )

    # =====================================================================
    # 4. EXPORT: CSV (EXCEL COMPATIBLE)
    # =====================================================================
    def export_csv(self, report: ReportPayload) -> str:
        """Exports report as a structured CSV file compatible with Excel."""
        filename = f"nexora_{report.scope.value.lower()}_report_{report.report_id}.csv"
        filepath = os.path.join(self.output_dir, filename)

        with open(filepath, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)

            # Header metadata
            writer.writerow(["NEXORA CROWD INTELLIGENCE REPORT"])
            writer.writerow(["Report ID", report.report_id])
            writer.writerow(["Report Scope", report.scope.value])
            writer.writerow(["Description", report.interval_desc])
            writer.writerow(["Date Range", f"{report.start_date} to {report.end_date}"])
            writer.writerow(["Generated At", report.generated_at])
            writer.writerow([])

            # Analytics Summary Section
            writer.writerow(["═══ ANALYTICS SUMMARY ═══"])
            s = report.summary
            writer.writerow(["Total Accumulated Headcount", s.total_headcount])
            writer.writerow(["Average Daily Headcount", s.avg_daily_headcount])
            writer.writerow(["Peak Occupancy Rate (%)", s.peak_occupancy_pct])
            writer.writerow(["Maximum Crowd Density (ppl/m²)", s.max_density_sqm])
            writer.writerow(["Average Crowd Density (ppl/m²)", s.avg_density_sqm])
            writer.writerow(["Average Pedestrian Flow Rate (m/s)", s.avg_flow_rate])
            writer.writerow(["Total Risk Events Logged", s.total_risk_events])
            writer.writerow(["Critical Incidents", s.critical_incidents])
            writer.writerow(["High-Risk Incidents", s.high_incidents])
            writer.writerow(["Average Response Time (sec)", s.avg_response_time_sec])
            writer.writerow(["Camera Uptime (%)", s.camera_uptime_pct])
            writer.writerow(["Busiest Day", s.busiest_day])
            writer.writerow(["Peak Traffic Window", s.busiest_hour])
            writer.writerow(["Safest Zone", s.safest_zone])
            writer.writerow(["Riskiest Zone", s.riskiest_zone])
            writer.writerow([])

            # Telemetry Time-Series
            writer.writerow(["═══ TELEMETRY TIME-SERIES DATA ═══"])
            writer.writerow([
                "Date", "Headcount", "Peak Occupancy %", "Max Density (ppl/m²)",
                "Avg Flow Rate (m/s)", "Active Cameras", "Avg Queue Length", "Risk Events"
            ])
            for t in report.telemetry:
                d = t.to_dict()
                writer.writerow([
                    d["date"], d["headcount"], d["peak_occupancy_pct"],
                    d["max_density_sqm"], d["avg_flow_rate"],
                    d["active_cameras"], d["avg_queue_length"], d["risk_events"]
                ])
            writer.writerow([])

            # Incident Audit Logs
            writer.writerow(["═══ INCIDENT AUDIT LEDGER ═══"])
            writer.writerow([
                "Incident ID", "Timestamp", "Camera", "Zone", "Risk Level",
                "Peak Density", "AI Confidence %", "Response Time (s)",
                "Status", "Description"
            ])
            for inc in report.incidents:
                d = inc.to_dict()
                writer.writerow([
                    d["incident_id"], d["timestamp"], d["camera_id"],
                    d["zone"], d["risk_level"], d["peak_density"],
                    d["ai_confidence"], d["response_time_sec"],
                    d["status"], d["description"]
                ])

        return filepath

    # =====================================================================
    # 5. EXPORT: PDF (PRINT-READY HTML WITH EMBEDDED SVG CHARTS)
    # =====================================================================
    def export_pdf_html(self, report: ReportPayload) -> str:
        """Exports report as a print-optimized HTML document with inline SVG charts."""
        filename = f"nexora_{report.scope.value.lower()}_report_{report.report_id}.html"
        filepath = os.path.join(self.output_dir, filename)

        s = report.summary

        # Build SVG bar chart for headcount trends
        headcount_chart = self._build_svg_bar_chart(
            data=[(t.date[-5:], t.headcount) for t in reversed(report.telemetry)],
            title="Daily Headcount Trend",
            bar_color="#00e5ff",
            width=700, height=200
        )

        # Build SVG line chart for density trends
        density_chart = self._build_svg_line_chart(
            data=[(t.date[-5:], t.max_density) for t in reversed(report.telemetry)],
            title="Peak Density Trend (ppl/m²)",
            line_color="#ff2a54",
            width=700, height=180
        )

        # Build SVG pie chart for incident breakdown
        pie_data = [
            ("Critical", s.critical_incidents, "#ff2a54"),
            ("High", s.high_incidents, "#ff6d00"),
            ("Moderate", max(0, s.total_risk_events - s.critical_incidents - s.high_incidents), "#ffb300")
        ]
        incident_pie = self._build_svg_pie_chart(pie_data, title="Incident Severity Breakdown", size=180)

        # Build telemetry table rows
        telemetry_rows = ""
        for t in report.telemetry:
            telemetry_rows += f"""
            <tr>
                <td>{t.date}</td><td>{t.headcount:,}</td>
                <td>{t.peak_occupancy}%</td><td>{t.max_density}</td>
                <td>{t.avg_flow_rate} m/s</td><td>{t.avg_queue_length}</td>
                <td><span class="risk-badge">{t.risk_events}</span></td>
            </tr>"""

        # Build incident table rows
        incident_rows = ""
        for inc in report.incidents:
            level_class = "critical" if "CRITICAL" in inc.risk_level else ("high" if "HIGH" in inc.risk_level else "moderate")
            incident_rows += f"""
            <tr>
                <td class="mono">{inc.incident_id}</td><td>{inc.timestamp}</td>
                <td class="mono">{inc.camera_id}</td><td>{inc.zone}</td>
                <td><span class="level-{level_class}">{inc.risk_level}</span></td>
                <td>{inc.peak_density}</td><td>{inc.ai_confidence}%</td>
                <td>{inc.response_time_sec}s</td><td>{inc.status}</td>
            </tr>"""

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEXORA Report {report.report_id} - {report.scope.value}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@600;800&family=JetBrains+Mono:wght@400;700&display=swap');

        :root {{
            --blue: #0066ff;
            --cyan: #00e5ff;
            --red: #ff2a54;
            --orange: #ff6d00;
            --yellow: #ffb300;
            --green: #00e5a3;
            --dark: #0f172a;
            --darker: #060913;
            --border: #1e293b;
            --text: #e2e8f0;
            --muted: #64748b;
        }}

        * {{ box-sizing: border-box; margin: 0; padding: 0; }}

        body {{
            font-family: 'Inter', sans-serif;
            color: var(--text);
            background: var(--darker);
            padding: 0;
            line-height: 1.6;
        }}

        @media print {{
            body {{ background: white; color: #1e293b; padding: 20px; }}
            .page-break {{ page-break-before: always; }}
            .no-print {{ display: none; }}
        }}

        .report-container {{
            max-width: 900px;
            margin: 0 auto;
            padding: 40px;
        }}

        /* Header */
        .report-header {{
            border-bottom: 3px solid var(--cyan);
            padding-bottom: 25px;
            margin-bottom: 35px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }}
        .report-header h1 {{
            font-family: 'Outfit', sans-serif;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: 1px;
        }}
        .report-header .scope-badge {{
            background: var(--cyan);
            color: var(--darker);
            padding: 6px 16px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 12px;
            letter-spacing: 1px;
        }}
        .meta-grid {{
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 15px;
            font-size: 12px;
            color: var(--muted);
        }}
        .meta-grid strong {{ color: var(--text); }}

        /* Section Headers */
        .section-title {{
            font-family: 'Outfit', sans-serif;
            font-size: 18px;
            font-weight: 600;
            border-bottom: 1px solid var(--border);
            padding-bottom: 10px;
            margin: 35px 0 20px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .section-title::before {{
            content: '';
            display: inline-block;
            width: 4px;
            height: 20px;
            background: var(--cyan);
            border-radius: 2px;
        }}

        /* Stat Cards */
        .stat-grid {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 30px;
        }}
        .stat-card {{
            background: rgba(18, 24, 44, 0.8);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 18px;
        }}
        .stat-label {{
            font-size: 10px;
            color: var(--muted);
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 1px;
        }}
        .stat-value {{
            font-family: 'Outfit', sans-serif;
            font-size: 24px;
            font-weight: 800;
            color: var(--cyan);
            margin-top: 6px;
        }}
        .stat-sub {{
            font-size: 10px;
            color: var(--muted);
            margin-top: 4px;
        }}

        /* Tables */
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-bottom: 25px;
        }}
        th, td {{
            text-align: left;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border);
        }}
        th {{
            background: rgba(18, 24, 44, 0.9);
            font-weight: 700;
            color: var(--muted);
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
        }}
        tr:hover {{ background: rgba(0, 229, 255, 0.03); }}
        .mono {{ font-family: 'JetBrains Mono', monospace; }}

        /* Badges */
        .risk-badge {{
            background: rgba(255, 42, 84, 0.1);
            color: var(--red);
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 700;
            font-size: 11px;
        }}
        .level-critical {{ color: var(--red); font-weight: 700; }}
        .level-high {{ color: var(--orange); font-weight: 700; }}
        .level-moderate {{ color: var(--yellow); font-weight: 700; }}

        /* Charts Container */
        .chart-container {{
            background: rgba(18, 24, 44, 0.6);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 25px;
        }}
        .chart-title {{
            font-size: 13px;
            font-weight: 700;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 15px;
        }}
        .charts-row {{
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 20px;
        }}

        /* Footer */
        .report-footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid var(--border);
            text-align: center;
            font-size: 11px;
            color: var(--muted);
        }}
    </style>
</head>
<body>
<div class="report-container">

    <!-- REPORT HEADER -->
    <div class="report-header">
        <div>
            <h1>NEXORA CROWD REPORT</h1>
            <div class="meta-grid">
                <div><strong>Report ID:</strong> {report.report_id}</div>
                <div><strong>Date Range:</strong> {report.start_date} — {report.end_date}</div>
                <div><strong>Generated:</strong> {report.generated_at}</div>
            </div>
        </div>
        <div class="scope-badge">{report.scope.value} REPORT</div>
    </div>

    <!-- ANALYTICS SUMMARY -->
    <div class="section-title">Analytics Summary</div>
    <div class="stat-grid">
        <div class="stat-card">
            <div class="stat-label">Total Headcount</div>
            <div class="stat-value">{s.total_headcount:,}</div>
            <div class="stat-sub">Avg {s.avg_daily_headcount:,}/day</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Peak Occupancy</div>
            <div class="stat-value">{s.peak_occupancy_pct}%</div>
            <div class="stat-sub">Max recorded rate</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Max Density</div>
            <div class="stat-value">{s.max_density_sqm}</div>
            <div class="stat-sub">ppl/m² peak</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Risk Events</div>
            <div class="stat-value">{s.total_risk_events}</div>
            <div class="stat-sub">{s.critical_incidents} critical</div>
        </div>
    </div>
    <div class="stat-grid">
        <div class="stat-card">
            <div class="stat-label">Avg Response</div>
            <div class="stat-value">{s.avg_response_time_sec}s</div>
            <div class="stat-sub">Incident response</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Camera Uptime</div>
            <div class="stat-value">{s.camera_uptime_pct}%</div>
            <div class="stat-sub">Sensor availability</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Riskiest Zone</div>
            <div class="stat-value" style="font-size:14px; color:var(--red);">{s.riskiest_zone}</div>
            <div class="stat-sub">Most incidents</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Peak Window</div>
            <div class="stat-value" style="font-size:14px;">{s.busiest_hour}</div>
            <div class="stat-sub">Busiest timeframe</div>
        </div>
    </div>

    <!-- CHARTS -->
    <div class="section-title">Visual Analytics</div>
    <div class="chart-container">
        <div class="chart-title">Daily Headcount Trend</div>
        {headcount_chart}
    </div>
    <div class="charts-row">
        <div class="chart-container">
            <div class="chart-title">Peak Density Trend</div>
            {density_chart}
        </div>
        <div class="chart-container">
            <div class="chart-title">Incident Breakdown</div>
            {incident_pie}
        </div>
    </div>

    <!-- TELEMETRY DATA TABLE -->
    <div class="section-title page-break">Telemetry Time-Series Data</div>
    <table>
        <thead>
            <tr>
                <th>Date</th><th>Headcount</th><th>Peak Occ. %</th>
                <th>Max Density</th><th>Avg Flow</th><th>Avg Queue</th><th>Risk Events</th>
            </tr>
        </thead>
        <tbody>{telemetry_rows}</tbody>
    </table>

    <!-- INCIDENT AUDIT LEDGER -->
    <div class="section-title">Incident Audit Ledger</div>
    <table>
        <thead>
            <tr>
                <th>ID</th><th>Timestamp</th><th>Camera</th><th>Zone</th>
                <th>Risk Level</th><th>Density</th><th>AI Conf.</th>
                <th>Response</th><th>Status</th>
            </tr>
        </thead>
        <tbody>{incident_rows}</tbody>
    </table>

    <!-- FOOTER -->
    <div class="report-footer">
        NEXORA Predictive Crowd Intelligence Platform &bull;
        Report generated automatically &bull;
        Classification: INTERNAL USE ONLY
    </div>

</div>
</body>
</html>"""

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

        return filepath

    # =====================================================================
    # 6. SVG CHART GENERATORS
    # =====================================================================
    def _build_svg_bar_chart(self, data: list, title: str,
                              bar_color: str = "#00e5ff",
                              width: int = 700, height: int = 200) -> str:
        """Generates an SVG bar chart string from label-value pairs."""
        if not data:
            return "<p>No data available</p>"

        max_val = max(v for _, v in data) or 1
        n = len(data)
        bar_w = max(8, min(40, (width - 80) // n - 4))
        chart_h = height - 40

        bars = ""
        labels = ""
        for i, (label, value) in enumerate(data):
            bar_h = (value / max_val) * (chart_h - 20)
            x = 50 + i * (bar_w + 4)
            y = chart_h - bar_h

            bars += f'<rect x="{x}" y="{y}" width="{bar_w}" height="{bar_h}" fill="{bar_color}" opacity="0.85" rx="2"/>'
            if i % max(1, n // 8) == 0:
                labels += f'<text x="{x + bar_w // 2}" y="{chart_h + 14}" text-anchor="middle" fill="#64748b" font-size="9">{label}</text>'

        # Y-axis labels
        y_labels = ""
        for step in range(5):
            val = int(max_val * step / 4)
            y_pos = chart_h - (chart_h - 20) * step / 4
            y_labels += f'<text x="45" y="{y_pos + 4}" text-anchor="end" fill="#64748b" font-size="9">{val:,}</text>'
            y_labels += f'<line x1="50" y1="{y_pos}" x2="{width - 10}" y2="{y_pos}" stroke="#1e293b" stroke-width="0.5"/>'

        return f'<svg width="100%" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">{y_labels}{bars}{labels}</svg>'

    def _build_svg_line_chart(self, data: list, title: str,
                               line_color: str = "#ff2a54",
                               width: int = 700, height: int = 180) -> str:
        """Generates an SVG line chart with area fill."""
        if not data:
            return "<p>No data available</p>"

        max_val = max(v for _, v in data) * 1.15 or 1
        n = len(data)
        chart_h = height - 40
        step_x = (width - 80) / max(1, n - 1)

        points = []
        for i, (label, value) in enumerate(data):
            x = 50 + i * step_x
            y = chart_h - (value / max_val) * (chart_h - 20)
            points.append((x, y))

        path_line = " ".join(f"{'M' if i == 0 else 'L'} {x:.1f},{y:.1f}" for i, (x, y) in enumerate(points))
        path_area = path_line + f" L {points[-1][0]:.1f},{chart_h} L {points[0][0]:.1f},{chart_h} Z"

        dots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="{line_color}"/>' for x, y in points)

        labels = ""
        for i, (label, _) in enumerate(data):
            if i % max(1, n // 6) == 0:
                x = 50 + i * step_x
                labels += f'<text x="{x:.1f}" y="{chart_h + 14}" text-anchor="middle" fill="#64748b" font-size="9">{label}</text>'

        return f"""<svg width="100%" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="{line_color}" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="{line_color}" stop-opacity="0"/>
            </linearGradient></defs>
            <path d="{path_area}" fill="url(#areaGrad)"/>
            <path d="{path_line}" fill="none" stroke="{line_color}" stroke-width="2" stroke-linecap="round"/>
            {dots}{labels}
        </svg>"""

    def _build_svg_pie_chart(self, data: list, title: str = "", size: int = 180) -> str:
        """Generates an SVG donut/pie chart from (label, value, color) tuples."""
        total = sum(v for _, v, _ in data) or 1
        cx, cy, r = size // 2, size // 2, size // 2 - 20
        r_inner = r * 0.55

        slices = ""
        legend = ""
        start_angle = -90

        for i, (label, value, color) in enumerate(data):
            if value <= 0:
                continue
            pct = value / total
            end_angle = start_angle + pct * 360
            large_arc = 1 if pct > 0.5 else 0

            x1 = cx + r * math.cos(math.radians(start_angle))
            y1 = cy + r * math.sin(math.radians(start_angle))
            x2 = cx + r * math.cos(math.radians(end_angle))
            y2 = cy + r * math.sin(math.radians(end_angle))
            x3 = cx + r_inner * math.cos(math.radians(end_angle))
            y3 = cy + r_inner * math.sin(math.radians(end_angle))
            x4 = cx + r_inner * math.cos(math.radians(start_angle))
            y4 = cy + r_inner * math.sin(math.radians(start_angle))

            path = (f"M {x1:.1f},{y1:.1f} A {r},{r} 0 {large_arc},1 {x2:.1f},{y2:.1f} "
                    f"L {x3:.1f},{y3:.1f} A {r_inner},{r_inner} 0 {large_arc},0 {x4:.1f},{y4:.1f} Z")
            slices += f'<path d="{path}" fill="{color}" opacity="0.85"/>'

            ly = size + 10 + i * 18
            legend += f'<rect x="10" y="{ly}" width="10" height="10" rx="2" fill="{color}"/>'
            legend += f'<text x="26" y="{ly + 9}" fill="#94a3b8" font-size="11">{label}: {value} ({pct * 100:.0f}%)</text>'

            start_angle = end_angle

        total_h = size + 10 + len(data) * 18
        center_text = f'<text x="{cx}" y="{cy + 5}" text-anchor="middle" fill="#e2e8f0" font-size="16" font-weight="bold">{total}</text>'

        return f'<svg width="100%" viewBox="0 0 {size} {total_h}" xmlns="http://www.w3.org/2000/svg">{slices}{center_text}{legend}</svg>'


# =====================================================================
# 7. FASTAPI APPLICATION
# =====================================================================
def create_app(output_dir: Optional[str] = None) -> FastAPI:
    """Create a FastAPI application exposing the reporting service."""
    engine = ReportGenerationEngine(output_dir=output_dir)
    app = FastAPI(title="NEXORA Reporting Module", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> Dict[str, Any]:
        return {
            "status": "ok",
            "service": "nexora-reporting",
            "output_dir": engine.output_dir,
        }

    @app.post("/reports/generate")
    def generate_report(request: ReportRequest) -> Dict[str, Any]:
        try:
            scope = ReportScope[request.scope.upper()]
        except KeyError as exc:
            raise HTTPException(status_code=400, detail="Unsupported report scope") from exc

        report = engine.generate_report(scope)
        csv_path = engine.export_csv(report)
        pdf_path = engine.export_pdf_html(report)

        response = report.to_dict()
        response["exports"] = {
            "csv": f"/reports/download/{os.path.basename(csv_path)}",
            "pdf": f"/reports/download/{os.path.basename(pdf_path)}",
            "csv_filename": os.path.basename(csv_path),
            "pdf_filename": os.path.basename(pdf_path),
        }
        return response

    @app.get("/reports/download/{filename}")
    def download_report(filename: str) -> FileResponse:
        file_path = os.path.join(engine.output_dir, filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Report file not found")
        return FileResponse(file_path, media_type="application/octet-stream", filename=filename)

    return app


app = create_app()


# =====================================================================
# 8. STANDALONE EXECUTION & TEST
# =====================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("  NEXORA Reporting Engine - Generation Test")
    print("=" * 60)

    engine = ReportGenerationEngine()

    for scope in ReportScope:
        print(f"\n▶ Generating {scope.value} report...")
        report = engine.generate_report(scope)

        csv_path = engine.export_csv(report)
        pdf_path = engine.export_pdf_html(report)

        s = report.summary
        print(f"  Report ID:        {report.report_id}")
        print(f"  Date Range:       {report.start_date} → {report.end_date}")
        print(f"  Total Headcount:  {s.total_headcount:,}")
        print(f"  Peak Occupancy:   {s.peak_occupancy_pct}%")
        print(f"  Max Density:      {s.max_density_sqm} ppl/m²")
        print(f"  Risk Events:      {s.total_risk_events}")
        print(f"  Incidents:        {len(report.incidents)} logged")
        print(f"  CSV Export:       {csv_path}")
        print(f"  PDF Export:       {pdf_path}")

    print(f"\n✅ All reports generated successfully in: {engine.output_dir}")
