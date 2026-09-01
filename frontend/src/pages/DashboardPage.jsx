import React, { useState, useEffect, useRef } from 'react';
import {
    LayoutDashboard,
    Activity,
    BarChart3,
    Bell,
    FileText,
    Settings,
    Camera,
    Video,
    TrendingUp,
    AlertTriangle,
    CheckCircle,
    PlusCircle,
    Shield,
    Smartphone,
    Eye,
    Trash2,
    RefreshCw
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

// Initial constants for initial render or fallback
const initialCameras = [
    { id: "CAM-01", name: "Main Entrance Gateway", zone: "Zone A", type: "IP_CAMERA", lat: 37.7749, lng: -122.4194, status: "ACTIVE", ip: "rtsp://10.0.1.50/stream1" },
    { id: "CAM-02", name: "South Escalators Corridor", zone: "Zone B", type: "USB_WEBCAM", lat: 37.7750, lng: -122.4195, status: "ACTIVE", ip: "0" },
    { id: "CAM-03", name: "North Corridor LinkWAY", zone: "Lower Level", type: "MOBILE_CAMERA", lat: 37.7751, lng: -122.4196, status: "ACTIVE", ip: "http://192.168.1.50:8080/video" }
];

// Helper components
const extractMsg = (val) => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return val.message || val.explanation || val.reason || null;
    return String(val);
};

const formatAlertItem = (a) => {
    if (!a) return null;
    const item = (typeof a === 'object' && a !== null) ? a : {};
    const rawLevel = item.risk_level || item.severity || (item.level === 'RED' ? 'CRITICAL' : 'MODERATE');
    const isCritical = rawLevel === 'CRITICAL' || rawLevel === 'HIGH' || rawLevel === 'RED';
    const msg = extractMsg(item.message) || extractMsg(item.explanation) || "Real-time crowd pressure anomaly flagged.";

    return {
        id: typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : `AL-${Math.floor(Date.now() / 1000)}`,
        camera: typeof item.camera === 'string' ? item.camera : (item.camera_id || "CAM-01"),
        zone: typeof item.zone === 'string' ? item.zone : (item.zone_id || "Central Concourse"),
        level: isCritical ? "RED" : "YELLOW",
        risk_level: typeof rawLevel === 'string' ? rawLevel : "MODERATE",
        risk_score: typeof item.risk_score === 'number' ? item.risk_score : (isCritical ? 85.0 : 55.0),
        message: msg,
        explanation: msg,
        confidence: typeof item.confidence === 'number' ? Math.round(item.confidence <= 1.0 ? item.confidence * 100 : item.confidence) : 94,
        time: item.timestamp ? (typeof item.timestamp === 'string' ? item.timestamp.replace('T', ' ').substring(0, 19) : new Date(item.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19)) : (typeof item.time === 'string' ? item.time : new Date().toISOString().replace('T', ' ').substring(0, 19)),
        acknowledged: !!item.is_acknowledged || !!item.acknowledged,
        operator: typeof item.operator === 'string' ? item.operator : (item.operator_id || null),
        shap_contributions: item.shap_contributions && typeof item.shap_contributions === 'object' ? item.shap_contributions : null,
        recommendations: Array.isArray(item.recommendations) ? item.recommendations : []
    };
};
function StatCard({ title, value, sub, icon: Icon, colorClass, statusLight = null }) {
    return (
        <div className="glass-card rounded-xl p-5 border border-panelBorder bg-bgSecondary/60 hover:border-slate-700 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-[11px] font-bold text-textMuted uppercase tracking-wider">{title}</p>
                    <h3 className="text-3xl font-extrabold font-outfit mt-1.5 text-white">{value}</h3>
                </div>
                <div className={`p-2.5 rounded-lg bg-bgPrimary ${colorClass || 'text-accentCyan'}`}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            <div className="flex items-center gap-2 mt-4 text-xs text-textMuted font-medium">
                {statusLight && <span className={`w-2 h-2 rounded-full ${statusLight} animate-pulse`}></span>}
                <span>{sub}</span>
            </div>
        </div>
    );
}

function RiskMeter({ value, score }) {
    const levels = {
        SAFE: { label: "SAFE", color: "text-statusGreen", bg: "bg-statusGreen", desc: "Standard flow rate boundaries." },
        GREEN: { label: "SAFE", color: "text-statusGreen", bg: "bg-statusGreen", desc: "Standard flow rate boundaries." },
        MODERATE: { label: "MODERATE", color: "text-statusYellow", bg: "bg-statusYellow", desc: "Elevated count; surveillance raised." },
        YELLOW: { label: "MODERATE", color: "text-statusYellow", bg: "bg-statusYellow", desc: "Elevated count; surveillance raised." },
        HIGH: { label: "HIGH", color: "text-statusOrange", bg: "bg-statusOrange", desc: "Density crossing boundaries. Prepare paths." },
        ORANGE: { label: "HIGH", color: "text-statusOrange", bg: "bg-statusOrange", desc: "Density crossing boundaries. Prepare paths." },
        CRITICAL: { label: "CRITICAL", color: "text-statusRed", bg: "bg-statusRed", desc: "Crowd pressure threshold breached!" },
        RED: { label: "CRITICAL", color: "text-statusRed", bg: "bg-statusRed", desc: "Crowd pressure threshold breached!" }
    };
    const selected = levels[value] || levels.SAFE;
    const progressWidth = score !== undefined && score !== null
        ? `${Math.min(100, Math.max(5, score))}%`
        : (value === 'CRITICAL' || value === 'RED' ? '100%' : value === 'HIGH' || value === 'ORANGE' ? '75%' : value === 'MODERATE' || value === 'YELLOW' ? '45%' : '20%');

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-textMuted font-bold">Flow Status</span>
                <div className="flex items-center gap-2">
                    {score !== undefined && score !== null && (
                        <span className="text-xs font-mono font-bold text-accentCyan bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
                            Score: {score}
                        </span>
                    )}
                    <span className={`text-sm font-extrabold font-outfit px-3 py-0.5 rounded-full bg-slate-900 border border-slate-800 ${selected.color}`}>
                        {selected.label}
                    </span>
                </div>
            </div>
            <div className="w-full bg-bgPrimary h-2.5 rounded-full overflow-hidden border border-panelBorder p-[1px]">
                <div className={`h-full rounded-full transition-all duration-500 ${selected.bg}`} style={{ width: progressWidth }}></div>
            </div>
            <p className="text-[11px] text-textMuted mt-1">{selected.desc}</p>
        </div>
    );
}

function ConfidenceGauge({ percentage }) {
    const numericVal = typeof percentage === 'number'
        ? (percentage <= 1.0 ? Math.round(percentage * 100) : Math.round(percentage))
        : 94;
    const strokeOffset = 220 - (220 * numericVal) / 100;
    return (
        <div className="flex flex-col items-center justify-center p-2">
            <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx="56" cy="56" r="35" className="stroke-slate-900 fill-none" strokeWidth="6" />
                    <circle cx="56" cy="56" r="35" className="stroke-accentCyan fill-none transition-all duration-700" strokeWidth="6" strokeDasharray="220" strokeDashoffset={strokeOffset} strokeLinecap="round" />
                </svg>
                <span className="absolute text-lg font-extrabold font-outfit text-white">{numericVal}%</span>
            </div>
            <p className="text-[10px] text-textMuted uppercase tracking-widest font-bold mt-2">AI Engine Confidence</p>
        </div>
    );
}

function ShapExplainabilityPanel({ xaiData, riskLevel }) {
    if (!xaiData) {
        return (
            <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-accentCyan" />
                    <h3 className="font-outfit font-semibold text-white text-sm">Real-Time SHAP Feature Attributions</h3>
                </div>
                <p className="text-xs text-textMuted font-mono animate-pulse">Waiting for live SHAP explainability telemetry stream...</p>
            </div>
        );
    }

    const contributions = xaiData.shap_contributions || {};
    const reason = xaiData.explanation_reason || "Live metrics evaluated via XGBoost / SHAP engine.";
    const reliability = xaiData.prediction_reliability !== undefined
        ? Math.round(xaiData.prediction_reliability * 100)
        : 92;

    const featureLabels = {
        density: "Crowd Density",
        speed: "Movement Speed",
        queue_length: "Queue Length",
        occupancy: "Zone Occupancy",
        entry_rate: "Entry Rate",
        exit_rate: "Exit Rate",
        flow_angle: "Flow Alignment"
    };

    return (
        <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col gap-4 bg-bgSecondary/40">
            <div className="flex justify-between items-center border-b border-panelBorder pb-3">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-accentCyan" />
                    <h3 className="font-outfit font-semibold text-white text-sm">Real-Time SHAP Feature Attributions</h3>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="text-textMuted">Reliability Index:</span>
                    <span className="text-statusGreen font-bold">{reliability}%</span>
                </div>
            </div>

            {/* Natural language reason string */}
            <div className="p-3.5 rounded-lg bg-slate-950/90 border border-panelBorder text-xs leading-relaxed text-slate-300 shadow-inner">
                <span className="text-accentCyan font-bold font-mono mr-1.5">[AI REASONING]:</span>
                {reason}
            </div>

            {/* SHAP Feature Contribution Bars */}
            <div className="flex flex-col gap-2 mt-1">
                <p className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Feature Impact Breakdown (SHAP Values)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {Object.entries(contributions).map(([featKey, val]) => {
                        const label = featureLabels[featKey] || featKey;
                        const isPositive = val >= 0;
                        const absVal = Math.min(1.0, Math.abs(val));
                        const pctWidth = `${Math.max(12, Math.round(absVal * 100))}%`;

                        return (
                            <div key={featKey} className="flex flex-col gap-1 p-2.5 rounded bg-bgPrimary/70 border border-panelBorder/60">
                                <div className="flex justify-between text-[11px] font-mono">
                                    <span className="text-slate-300 font-medium">{label}</span>
                                    <span className={`font-bold ${isPositive ? 'text-statusOrange' : 'text-statusGreen'}`}>
                                        {isPositive ? `+${val.toFixed(2)}` : val.toFixed(2)}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${isPositive ? 'bg-statusOrange' : 'bg-statusGreen'}`}
                                        style={{ width: pctWidth }}
                                    ></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const [localCams, setLocalCams] = useState(() => {
        try {
            const stored = localStorage.getItem('nexora_cameras');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) { }
        return initialCameras;
    });

    const [localAlerts, setLocalAlerts] = useState([]);
    const [selectedCamStream, setSelectedCamStream] = useState(null);
    const [showAddCamModal, setShowAddCamModal] = useState(false);
    const lastAlertKeyRef = useRef(null);

    // New Camera Form Fields
    const [newCamName, setNewCamName] = useState("");
    const [newCamZone, setNewCamZone] = useState("");
    const [newCamSourceType, setNewCamSourceType] = useState("IP_CAMERA"); // IP_CAMERA | USB_WEBCAM | MOBILE_CAMERA
    const [newCamSourceLoc, setNewCamSourceLoc] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);

    const token = localStorage.getItem('nexora_token');
    // Connect to the WebSocket on the unified backend gateway (port 8000)
    const { status: socketStatus, data: wsData } = useWebSocket('ws://localhost:8000/ws/map', token);

    // Read message data with local mock fallbacks if websocket disconnected
    const crowdCount = wsData?.crowd_count ?? 118;
    const riskLevel = wsData?.risk?.level ?? wsData?.risk_level ?? "SAFE";
    const riskScore = wsData?.risk?.score ?? wsData?.risk_score ?? 25.0;
    const confidence = wsData?.risk?.confidence ?? wsData?.confidence ?? 94;
    const xaiData = wsData?.xai ?? null;
    const systemAlerts = wsData?.alerts ?? [];

    // Fetch cameras & initial live alerts from backend API
    const loadCamerasFromBackend = async () => {
        try {
            let res;
            try {
                res = await fetch('http://localhost:8000/cameras');
            } catch {
                res = await fetch('http://127.0.0.1:8000/cameras');
            }

            if (res && res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    const mapped = data.map(c => ({
                        id: c.camera_id,
                        name: c.camera_name,
                        zone: c.zone_id || 'Zone A',
                        type: c.source_type || 'IP_CAMERA',
                        location: c.source_location || c.rtsp_url || '',
                        status: c.status || 'ACTIVE',
                        lat: c.latitude ?? 37.7749,
                        lng: c.longitude ?? -122.4194,
                        ip: c.source_location || c.rtsp_url || ''
                    }));
                    setLocalCams(mapped);
                    localStorage.setItem('nexora_cameras', JSON.stringify(mapped));
                }
            }
        } catch (err) {
            console.warn('[DashboardPage] Camera load fallback:', err);
        }
    };

    const loadAlertsFromBackend = async () => {
        try {
            let res;
            try {
                res = await fetch('http://localhost:8000/alerts');
            } catch {
                res = await fetch('http://127.0.0.1:8000/alerts');
            }

            if (res && res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.alerts) && data.alerts.length > 0) {
                    const mapped = data.alerts.map(a => formatAlertItem(a));
                    setLocalAlerts(mapped);
                }
            }
        } catch (err) {
            console.warn('[DashboardPage] Alert load fallback:', err);
        }
    };

    useEffect(() => {
        loadCamerasFromBackend();
        loadAlertsFromBackend();

        const handleSync = () => {
            loadCamerasFromBackend();
            loadAlertsFromBackend();
        };

        window.addEventListener('nexora_cameras_updated', handleSync);
        window.addEventListener('storage', handleSync);
        return () => {
            window.removeEventListener('nexora_cameras_updated', handleSync);
            window.removeEventListener('storage', handleSync);
        };
    }, []);

    const [acknowledgedIds, setAcknowledgedIds] = useState(new Set());

    // Listen to real-time WebSocket data stream and update Urgent Alerts Console dynamically
    useEffect(() => {
        if (!wsData) return;

        if (Array.isArray(wsData.alerts) && wsData.alerts.length > 0) {
            const formatted = wsData.alerts.map(a => {
                const item = formatAlertItem(a);
                if (acknowledgedIds.has(item.id)) {
                    item.acknowledged = true;
                }
                return item;
            });
            setLocalAlerts(formatted);
        } else {
            setLocalAlerts([]);
        }
    }, [wsData, acknowledgedIds]);

    const handleAcknowledgeAlert = async (alertId) => {
        setAcknowledgedIds(prev => new Set([...prev, alertId]));
        setLocalAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
        try {
            let res;
            try {
                res = await fetch(`http://localhost:8000/alerts/acknowledge/${alertId}`, { method: 'POST' });
            } catch {
                res = await fetch(`http://127.0.0.1:8000/alerts/acknowledge/${alertId}`, { method: 'POST' });
            }
        } catch (err) {
            console.warn('[DashboardPage] Acknowledge call fallback:', err);
        }
    };

    const displayAlerts = React.useMemo(() => {
        const unacked = localAlerts.filter(a => !a.acknowledged);
        const acked = localAlerts.filter(a => a.acknowledged).slice(0, 5);
        return [...unacked, ...acked];
    }, [localAlerts]);

    // End-to-End Add Camera Flow: Submits to backend REST API (POST /cameras) & saves to DB
    const handleAddCamera = async (e) => {
        e.preventDefault();
        if (!newCamName.trim() || !newCamZone.trim()) return;

        setIsSubmitting(true);
        setFormError(null);

        const defaultLocation = newCamSourceType === 'USB_WEBCAM' ? '0' : newCamSourceLoc.trim();

        const payload = {
            camera_name: newCamName.trim(),
            source_type: newCamSourceType,
            source_location: defaultLocation || (newCamSourceType === 'IP_CAMERA' ? 'rtsp://10.0.1.50/stream1' : 'http://192.168.1.50:8080/video'),
            rtsp_url: defaultLocation || (newCamSourceType === 'IP_CAMERA' ? 'rtsp://10.0.1.50/stream1' : 'http://192.168.1.50:8080/video'),
            zone_id: newCamZone.trim(),
            latitude: 37.7749 + (Math.random() - 0.5) * 0.01,
            longitude: -122.4194 + (Math.random() - 0.5) * 0.01,
            homography_matrix: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
        };

        try {
            let res;
            try {
                res = await fetch('http://localhost:8000/cameras', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch {
                res = await fetch('http://127.0.0.1:8000/cameras', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            let newCamObj;
            if (res && (res.status === 201 || res.status === 200)) {
                const created = await res.json();
                newCamObj = {
                    id: created.camera_id,
                    name: created.camera_name,
                    zone: created.zone_id,
                    type: created.source_type,
                    location: created.source_location || created.rtsp_url,
                    status: created.status || 'ACTIVE',
                    lat: created.latitude,
                    lng: created.longitude,
                    ip: created.source_location || created.rtsp_url
                };
            } else {
                // Local fallback item if backend call returned unexpected status
                newCamObj = {
                    id: `CAM-0${localCams.length + 1}`,
                    name: payload.camera_name,
                    zone: payload.zone_id,
                    type: payload.source_type,
                    location: payload.source_location,
                    status: "ACTIVE",
                    lat: payload.latitude,
                    lng: payload.longitude,
                    ip: payload.source_location
                };
            }

            const updatedCams = [...localCams, newCamObj];
            setLocalCams(updatedCams);
            localStorage.setItem('nexora_cameras', JSON.stringify(updatedCams));
            window.dispatchEvent(new Event('nexora_cameras_updated'));

            // Reset Form fields & close modal
            setNewCamName("");
            setNewCamZone("");
            setNewCamSourceLoc("");
            setNewCamSourceType("IP_CAMERA");
            setShowAddCamModal(false);
        } catch (err) {
            console.error('[DashboardPage] Add camera error:', err);
            setFormError("Failed to save camera to server. Adding locally.");

            const fallbackCam = {
                id: `CAM-0${localCams.length + 1}`,
                name: payload.camera_name,
                zone: payload.zone_id,
                type: payload.source_type,
                location: payload.source_location,
                status: "ACTIVE",
                lat: payload.latitude,
                lng: payload.longitude,
                ip: payload.source_location
            };
            const updatedCams = [...localCams, fallbackCam];
            setLocalCams(updatedCams);
            localStorage.setItem('nexora_cameras', JSON.stringify(updatedCams));
            window.dispatchEvent(new Event('nexora_cameras_updated'));

            setNewCamName("");
            setNewCamZone("");
            setNewCamSourceLoc("");
            setNewCamSourceType("IP_CAMERA");
            setShowAddCamModal(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete camera handler
    const handleDeleteCamera = async (e, camId) => {
        e.stopPropagation();
        try {
            try {
                await fetch(`http://localhost:8000/cameras/${camId}`, { method: 'DELETE' });
            } catch {
                await fetch(`http://127.0.0.1:8000/cameras/${camId}`, { method: 'DELETE' });
            }
        } catch (err) {
            console.warn('[DashboardPage] Delete camera warning:', err);
        }

        const updated = localCams.filter(c => c.id !== camId);
        setLocalCams(updated);
        localStorage.setItem('nexora_cameras', JSON.stringify(updated));
        window.dispatchEvent(new Event('nexora_cameras_updated'));

        if (selectedCamStream === camId) {
            setSelectedCamStream(null);
        }
    };

    return (
        <div className="p-8 flex flex-col gap-8 h-full overflow-y-auto">

            {/* WS Status Indicator */}
            <div className="flex justify-between items-center bg-bgSecondary/40 border border-panelBorder px-5 py-3.5 rounded-xl">
                <div className="flex items-center gap-2.5">
                    <Shield className="w-5 h-5 text-accentCyan" />
                    <span className="text-xs uppercase tracking-wider text-textMuted font-bold">Tactical Console Telemetry</span>
                </div>
                <div className="flex items-center gap-3 bg-bgPrimary/70 px-4 py-1.5 rounded-full border border-panelBorder">
                    <span className={`w-2.5 h-2.5 rounded-full ${socketStatus === 'Connected' ? 'bg-statusGreen shadow-[0_0_8px_#10b981]' :
                        socketStatus === 'Reconnecting' ? 'bg-statusOrange shadow-[0_0_8px_#f97316]' :
                            socketStatus === 'Connecting' ? 'bg-statusYellow shadow-[0_0_8px_#f59e0b]' :
                                'bg-statusRed shadow-[0_0_8px_#ef4444]'
                        }`}></span>
                    <span className="text-xs font-bold font-mono tracking-wider">
                        SYSTEM_WS: {socketStatus.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* STAT CARDS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                    title="Crowd Occupancy"
                    value={crowdCount}
                    sub="Active pedestrian signatures"
                    icon={Activity}
                    statusLight="bg-statusGreen"
                />
                <StatCard
                    title="Risk Index"
                    value={`${riskLevel}`}
                    sub={`Live ML Score: ${riskScore} / 100`}
                    icon={Shield}
                    colorClass={riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'text-statusRed' : riskLevel === 'MODERATE' ? 'text-statusYellow' : 'text-statusGreen'}
                    statusLight={riskLevel === 'CRITICAL' ? 'bg-statusRed' : riskLevel === 'HIGH' ? 'bg-statusOrange' : riskLevel === 'MODERATE' ? 'bg-statusYellow' : 'bg-statusGreen'}
                />
                <StatCard
                    title="Active Cameras"
                    value={localCams.filter(c => c.status === 'ACTIVE').length}
                    sub={`Total devices registered: ${localCams.length}`}
                    icon={Camera}
                    colorClass="text-accentCyan"
                />
                <StatCard
                    title="Active Alerts"
                    value={localAlerts.filter(a => !a.acknowledged).length}
                    sub="Urgent actions pending"
                    icon={Bell}
                    colorClass="text-statusOrange"
                />
            </div>

            {/* REAL-TIME SHAP XAI EXPLAINABILITY PANEL */}
            <ShapExplainabilityPanel xaiData={xaiData} riskLevel={riskLevel} />

            {/* SECOND SECTION: VISUAL GAUGES & CAMERAS LIST */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Risk & Confidence Gauge box */}
                <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col justify-between gap-6">
                    <h3 className="font-outfit font-semibold text-white">AI Predictor Gauges</h3>
                    <RiskMeter value={riskLevel} score={riskScore} />
                    <hr className="border-panelBorder" />
                    <ConfidenceGauge percentage={confidence} />
                </div>

                {/* Tactical Feed Switchboard */}
                <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-outfit font-semibold text-white">Camera Switchboard</h3>
                            <button
                                onClick={() => setShowAddCamModal(true)}
                                className="flex items-center gap-1.5 text-xs text-accentCyan hover:text-white transition-all font-semibold font-mono"
                            >
                                <PlusCircle className="w-4 h-4" /> Add Cam
                            </button>
                        </div>
                        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                            {localCams.map(cam => {
                                const isSelected = selectedCamStream === cam.id;
                                const SourceIcon = cam.type === 'USB_WEBCAM' ? Video : cam.type === 'MOBILE_CAMERA' ? Smartphone : Camera;
                                return (
                                    <div
                                        key={cam.id}
                                        onClick={() => setSelectedCamStream(cam.id)}
                                        className={`flex justify-between items-center p-3 rounded-lg border text-sm font-semibold transition-all cursor-pointer ${isSelected
                                            ? 'bg-slate-900 border-accentCyan text-white shadow-[0_0_8px_rgba(0,229,255,0.15)]'
                                            : 'bg-bgSecondary/30 border-panelBorder text-textMuted hover:border-slate-700 hover:text-white'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2.5 overflow-hidden">
                                            <SourceIcon className={`w-4 h-4 shrink-0 ${cam.type === 'USB_WEBCAM' ? 'text-statusGreen' : cam.type === 'MOBILE_CAMERA' ? 'text-statusOrange' : 'text-accentCyan'}`} />
                                            <div className="flex flex-col truncate">
                                                <span className="truncate text-white text-xs">{cam.name}</span>
                                                <span className="text-[10px] font-mono text-textMuted tracking-tight">{cam.zone} • {cam.type || 'IP_CAMERA'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`w-2 h-2 rounded-full ${cam.status === 'ACTIVE' ? 'bg-statusGreen' : 'bg-statusRed'}`}></span>
                                            <button
                                                onClick={(e) => handleDeleteCamera(e, cam.id)}
                                                className="text-slate-500 hover:text-statusRed transition-colors p-1"
                                                title="Delete camera"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-4">
                        {selectedCamStream ? (
                            <div className="mt-2 p-3 bg-bgPrimary/80 rounded-lg border border-accentCyan/30 relative">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] text-accentCyan font-bold tracking-widest font-mono">STREAMING: {selectedCamStream}</span>
                                    <button onClick={() => setSelectedCamStream(null)} className="text-textMuted text-xs hover:text-white">close</button>
                                </div>
                                <div className="h-36 rounded bg-black relative flex items-center justify-center overflow-hidden">
                                    <img
                                        src={`http://localhost:8000/cameras/${selectedCamStream}/feed`}
                                        alt="Live Feed"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.style.display = 'none';
                                            e.target.nextSibling.style.display = 'flex';
                                        }}
                                    />
                                    <div className="absolute inset-0 hidden flex-col items-center justify-center bg-slate-950/90 text-textMuted p-2 text-center">
                                        <Video className="w-6 h-6 mb-1 text-slate-600" />
                                        <span className="text-[10px] font-mono text-slate-400">Stream Initializing / Reconnecting...</span>
                                    </div>
                                    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
                                    <span className="absolute bottom-2 left-2 text-[9px] bg-black/60 px-2 py-0.5 rounded text-statusGreen font-mono uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm">
                                        <span className="w-1.5 h-1.5 bg-statusGreen rounded-full animate-pulse"></span> LIVE INGEST
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 p-4 border border-dashed border-panelBorder rounded-lg text-center text-textMuted text-xs flex flex-col items-center justify-center">
                                <Video className="w-6 h-6 mb-1 text-slate-700" />
                                Select camera to preview live stream analytics.
                            </div>
                        )}
                    </div>
                </div>

                {/* Live System Alerts Feed */}
                <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col">
                    <h3 className="font-outfit font-semibold text-white mb-4">Urgent Alerts Console</h3>
                    <div className="flex flex-col gap-3 overflow-y-auto max-h-72 pr-1">
                        {displayAlerts.length === 0 ? (
                            <p className="text-xs text-textMuted text-center my-6">No active alert logs.</p>
                        ) : (
                            displayAlerts.map(alert => (
                                <div
                                    key={alert.id}
                                    className={`p-3 rounded-lg border text-xs flex flex-col gap-2 transition-all ${alert.acknowledged
                                        ? 'bg-bgSecondary/10 border-panelBorder opacity-60'
                                        : alert.level === 'RED'
                                            ? 'bg-statusRed/5 border-statusRed/40 shadow-[0_0_8px_rgba(239,68,68,0.05)]'
                                            : 'bg-statusYellow/5 border-statusYellow/40'
                                        }`}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className={`font-bold uppercase tracking-wider font-mono ${alert.level === 'RED' ? 'text-statusRed' : 'text-statusYellow'}`}>{alert.level} ANOMALY</span>
                                        <span className="text-[10px] text-textMuted">{alert.time}</span>
                                    </div>
                                    <p className="text-slate-300 font-medium">{typeof alert.message === 'string' ? alert.message : (alert.message?.message || alert.explanation || "Real-time anomaly detected.")}</p>
                                    <div className="flex justify-between items-center mt-1">
                                        <span className="text-[10px] text-textMuted uppercase tracking-wider font-semibold font-mono">Conf: {alert.confidence}%</span>
                                        {!alert.acknowledged && (
                                            <button
                                                onClick={() => handleAcknowledgeAlert(alert.id)}
                                                className="text-[10px] text-accentCyan hover:text-white uppercase font-bold tracking-wider"
                                            >
                                                Acknowledge
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>

            {/* THIRD SECTION: HISTORICAL TRENDS & SYSTEM CAPACITIES */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Trend Graph */}
                <div className="glass-card rounded-xl p-6 border border-panelBorder">
                    <h3 className="font-outfit font-semibold text-white mb-4">Historical Density Trends (Last 24h)</h3>
                    <div className="h-56 bg-bgSecondary/30 border border-panelBorder rounded-lg flex items-center justify-end p-4 font-mono text-xs text-textMuted">
                        <svg className="w-full h-full" viewBox="0 0 400 150">
                            <path d="M 10,120 Q 80,40 150,110 T 300,30 T 400,90" fill="none" stroke="#00e5ff" strokeWidth="2.5" />
                            <path d="M 10,120 Q 80,40 150,110 T 300,30 T 400,90 L 400,150 L 10,150 Z" fill="url(#t-grad)" opacity="0.08" />
                            <defs>
                                <linearGradient id="t-grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#00e5ff" />
                                    <stop offset="100%" stopColor="transparent" />
                                </linearGradient>
                            </defs>
                            <text x="15" y="145" fill="#64748b" fontSize="9">08:00</text>
                            <text x="180" y="145" fill="#64748b" fontSize="9">16:00</text>
                            <text x="350" y="145" fill="#64748b" fontSize="9">24:00</text>
                        </svg>
                    </div>
                </div>

                {/* Bottleneck Progress Bars */}
                <div className="glass-card rounded-xl p-6 border border-panelBorder flex flex-col justify-between">
                    <h3 className="font-outfit font-semibold text-white mb-4">Bottleneck Capacity Monitor</h3>
                    <div className="flex flex-col gap-4">
                        {[
                            { name: "Entrance Corridor Gateway", capacity: 45, status: "Normal", color: "bg-statusGreen" },
                            { name: "Central Escalators escalator", capacity: 78, status: "Heavy", color: "bg-statusYellow" },
                            { name: "Secure Sector O-2 Escape Path", capacity: 22, status: "Clear", color: "bg-statusGreen" },
                        ].map((bt, idx) => (
                            <div key={idx}>
                                <div className="flex justify-between text-xs font-semibold mb-1">
                                    <span className="text-slate-300">{bt.name}</span>
                                    <span className={bt.capacity > 75 ? 'text-statusYellow' : 'text-statusGreen'}>
                                        {bt.capacity}% ({bt.status})
                                    </span>
                                </div>
                                <div className="w-full bg-slate-950 rounded-full h-2 border border-slate-900">
                                    <div className={`h-2 rounded-full transition-all duration-500 ${bt.color}`} style={{ width: `${bt.capacity}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>



            {/* CREATE CAMERA STREAM MODAL - END TO END MULTI-SOURCE SUPPORT */}
            {showAddCamModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="max-w-md w-full bg-bgSecondary border border-panelBorder rounded-xl overflow-hidden shadow-2xl">
                        <div className="border-b border-panelBorder px-5 py-4 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Camera className="w-4 h-4 text-accentCyan" />
                                <h3 className="font-outfit font-semibold text-white text-sm">Register Device Camera Source</h3>
                            </div>
                            <button onClick={() => setShowAddCamModal(false)} className="text-xs text-textMuted hover:text-white transition-colors">Cancel</button>
                        </div>
                        <form onSubmit={handleAddCamera} className="p-5 flex flex-col gap-4">
                            {formError && (
                                <div className="p-2.5 bg-statusRed/10 border border-statusRed/30 rounded-lg text-statusRed text-xs font-mono">
                                    {formError}
                                </div>
                            )}

                            {/* SOURCE TYPE SELECTOR TABS */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Camera Source Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setNewCamSourceType('IP_CAMERA'); setNewCamSourceLoc(''); }}
                                        className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-semibold gap-1.5 transition-all ${newCamSourceType === 'IP_CAMERA'
                                            ? 'bg-accentCyan/15 border-accentCyan text-white shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                                            : 'bg-bgPrimary border-panelBorder text-textMuted hover:border-slate-700 hover:text-white'
                                            }`}
                                    >
                                        <Camera className="w-4 h-4 text-accentCyan" />
                                        <span>IP Camera</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setNewCamSourceType('USB_WEBCAM'); setNewCamSourceLoc('0'); }}
                                        className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-semibold gap-1.5 transition-all ${newCamSourceType === 'USB_WEBCAM'
                                            ? 'bg-statusGreen/15 border-statusGreen text-white shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                            : 'bg-bgPrimary border-panelBorder text-textMuted hover:border-slate-700 hover:text-white'
                                            }`}
                                    >
                                        <Video className="w-4 h-4 text-statusGreen" />
                                        <span>USB Webcam</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setNewCamSourceType('MOBILE_CAMERA'); setNewCamSourceLoc(''); }}
                                        className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-semibold gap-1.5 transition-all ${newCamSourceType === 'MOBILE_CAMERA'
                                            ? 'bg-statusOrange/15 border-statusOrange text-white shadow-[0_0_10px_rgba(249,115,22,0.2)]'
                                            : 'bg-bgPrimary border-panelBorder text-textMuted hover:border-slate-700 hover:text-white'
                                            }`}
                                    >
                                        <Smartphone className="w-4 h-4 text-statusOrange" />
                                        <span>Mobile Cam</span>
                                    </button>
                                </div>
                            </div>

                            {/* CAMERA NAME */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Camera/Stream Identifier</label>
                                <input
                                    value={newCamName}
                                    onChange={e => setNewCamName(e.target.value)}
                                    className="bg-bgPrimary border border-panelBorder rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-accentCyan"
                                    placeholder={newCamSourceType === 'USB_WEBCAM' ? 'Front Desk Webcam' : newCamSourceType === 'MOBILE_CAMERA' ? 'Security Patrol Phone' : 'Escalator B Gate Capture'}
                                    required
                                />
                            </div>

                            {/* COVERAGE ZONE */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Coverage Region / Zone</label>
                                <input
                                    value={newCamZone}
                                    onChange={e => setNewCamZone(e.target.value)}
                                    className="bg-bgPrimary border border-panelBorder rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-accentCyan"
                                    placeholder="Zone B Lower Level"
                                    required
                                />
                            </div>

                            {/* DYNAMIC SOURCE LOCATION INPUT */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider font-mono">
                                    {newCamSourceType === 'IP_CAMERA' && 'Device RTSP Endpoint URL'}
                                    {newCamSourceType === 'USB_WEBCAM' && 'Webcam Device Index (e.g. 0, 1)'}
                                    {newCamSourceType === 'MOBILE_CAMERA' && 'Mobile App Stream URL (HTTP / RTSP)'}
                                </label>
                                <input
                                    value={newCamSourceLoc}
                                    onChange={e => setNewCamSourceLoc(e.target.value)}
                                    className="bg-bgPrimary border border-panelBorder rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-accentCyan font-mono"
                                    placeholder={
                                        newCamSourceType === 'IP_CAMERA' ? 'rtsp://10.0.1.66/stream1' :
                                            newCamSourceType === 'USB_WEBCAM' ? '0' :
                                                'http://192.168.1.50:8080/video'
                                    }
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-accentCyan hover:bg-cyan-400 text-bgPrimary font-bold py-3 rounded-lg text-xs mt-2 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        <span>Saving Camera to Database...</span>
                                    </>
                                ) : (
                                    <span>Register &amp; Connect Source</span>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
