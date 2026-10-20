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
        <div className="glass-card rounded-xl p-3.5 sm:p-4 border border-panelBorder bg-bgSecondary/60 hover:border-slate-700 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-[10px] font-bold text-textMuted uppercase tracking-wider">{title}</p>
                    <h3 className="text-xl sm:text-2xl font-extrabold font-outfit mt-1 text-white">{value}</h3>
                </div>
                <div className={`p-2 rounded-lg bg-bgPrimary ${colorClass || 'text-accentCyan'}`}>
                    <Icon className="w-4 h-4" />
                </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-textMuted font-medium">
                {statusLight && <span className={`w-1.5 h-1.5 rounded-full ${statusLight} animate-pulse`}></span>}
                <span className="truncate">{sub}</span>
            </div>
        </div>
    );
}

function getCameraWallGridClasses(count) {
    if (count <= 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
    if (count === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    if (count === 4) return 'grid-cols-1 sm:grid-cols-2'; // 2x2
    if (count === 5 || count === 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'; // 3x2 for 6
    if (count <= 8) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
    return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
}

function CameraWallTile({ camera, totalCams, onDelete, onToggleStatus }) {
    const [hasError, setHasError] = useState(false);
    const isLive = (camera.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && !hasError;
    const SourceIcon = camera.type === 'USB_WEBCAM' ? Video : camera.type === 'MOBILE_CAMERA' ? Smartphone : Camera;

    const getHeightClass = () => {
        if (totalCams <= 1) return 'h-44 sm:h-56';
        if (totalCams === 2) return 'h-36 sm:h-44';
        if (totalCams <= 4) return 'h-28 sm:h-36';
        return 'h-24 sm:h-32';
    };

    return (
        <div className="glass-card rounded-lg border border-panelBorder/80 bg-slate-950/90 overflow-hidden flex flex-col relative group hover:border-accentCyan/50 transition-all duration-300 shadow-md">
            {/* Top Bar on Tile */}
            <div className="flex justify-between items-center px-2.5 py-1 bg-bgSecondary/90 border-b border-panelBorder/60 z-10">
                <div className="flex items-center gap-1.5 overflow-hidden">
                    <SourceIcon className={`w-3.5 h-3.5 shrink-0 ${camera.type === 'USB_WEBCAM' ? 'text-statusGreen' : camera.type === 'MOBILE_CAMERA' ? 'text-statusOrange' : 'text-accentCyan'}`} />
                    <span className="text-xs font-semibold text-white truncate max-w-[120px] sm:max-w-[170px]" title={camera.name}>
                        {camera.name}
                    </span>
                    <span className="text-[10px] font-mono text-textMuted bg-bgPrimary/80 px-1.5 py-0.5 rounded border border-panelBorder/50 shrink-0">
                        {camera.zone || 'Zone A'}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                        isLive 
                            ? 'text-statusGreen bg-statusGreen/15 border border-statusGreen/30' 
                            : 'text-statusRed bg-statusRed/15 border border-statusRed/30'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-statusGreen animate-pulse' : 'bg-statusRed'}`}></span>
                        {isLive ? 'LIVE' : 'OFFLINE'}
                    </span>
                    <button
                        onClick={(e) => onToggleStatus(e, camera.id)}
                        className="text-slate-400 hover:text-white p-0.5 transition-colors"
                        title={camera.status === 'ACTIVE' ? 'Set Offline (rearranges wall)' : 'Set Active'}
                    >
                        <RefreshCw className="w-3 h-3" />
                    </button>
                    <button
                        onClick={(e) => onDelete(e, camera.id)}
                        className="text-slate-500 hover:text-statusRed p-0.5 transition-colors"
                        title="Remove camera feed"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Video Feed Area */}
            <div className={`${getHeightClass()} bg-black relative flex items-center justify-center overflow-hidden`}>
                <img
                    src={`http://localhost:8000/cameras/${camera.id}/feed`}
                    alt={camera.name}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${hasError ? 'hidden' : 'block'}`}
                    onError={() => setHasError(true)}
                />

                {/* Scanline CRT overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-40"></div>

                {/* Live Ingest HUD Tag */}
                {isLive && (
                    <div className="absolute bottom-1 left-2 z-10 flex items-center gap-1 bg-black/75 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] font-mono text-statusGreen uppercase tracking-wider border border-statusGreen/25">
                        <span className="w-1 h-1 bg-statusGreen rounded-full animate-ping"></span>
                        LIVE INGEST
                    </div>
                )}

                {/* Device Type HUD Tag */}
                <div className="absolute bottom-1 right-2 z-10 bg-black/75 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] font-mono text-textMuted uppercase border border-panelBorder/30">
                    {camera.type || 'IP_CAMERA'}
                </div>

                {/* Stream Offline / Reconnecting Fallback */}
                {hasError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 text-textMuted p-2 text-center z-10">
                        <Video className="w-5 h-5 mb-1 text-slate-600" />
                        <span className="text-[10px] font-mono text-slate-400">Stream Offline / Reconnecting</span>
                        <span className="text-[8px] font-mono text-slate-500 mt-0.5">{camera.location || camera.ip || 'Connecting to source...'}</span>
                    </div>
                )}
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
            <div className="glass-card rounded-xl p-3.5 sm:p-4 border border-panelBorder flex flex-col gap-2 bg-bgSecondary/40">
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
        <div className="glass-card rounded-xl p-3.5 sm:p-4 border border-panelBorder flex flex-col gap-2.5 bg-bgSecondary/40">
            <div className="flex justify-between items-center border-b border-panelBorder/70 pb-2">
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
            <div className="py-2 px-3 rounded-lg bg-slate-950/90 border border-panelBorder/60 text-xs leading-relaxed text-slate-300 shadow-inner">
                <span className="text-accentCyan font-bold font-mono mr-1.5">[AI REASONING]:</span>
                {reason}
            </div>

            {/* SHAP Feature Contribution Bars in compact responsive grid */}
            <div className="flex flex-col gap-1.5 mt-0.5">
                <p className="text-[9px] uppercase font-bold text-textMuted tracking-wider">Feature Impact Breakdown (SHAP Values)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {Object.entries(contributions).map(([featKey, val]) => {
                        const label = featureLabels[featKey] || featKey;
                        const isPositive = val >= 0;
                        const absVal = Math.min(1.0, Math.abs(val));
                        const pctWidth = `${Math.max(12, Math.round(absVal * 100))}%`;

                        return (
                            <div key={featKey} className="flex flex-col gap-1 p-2 rounded bg-bgPrimary/70 border border-panelBorder/60">
                                <div className="flex justify-between text-[10px] font-mono">
                                    <span className="text-slate-300 font-medium truncate">{label}</span>
                                    <span className={`font-bold shrink-0 ml-1 ${isPositive ? 'text-statusOrange' : 'text-statusGreen'}`}>
                                        {isPositive ? `+${val.toFixed(2)}` : val.toFixed(2)}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden">
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

    // Real-Time & Historical Telemetry State for Trend Chart & Bottlenecks
    const [trendScope, setTrendScope] = useState('daily'); // 'hourly' | 'daily' | 'weekly'
    const [telemetrySeries, setTelemetrySeries] = useState([]);
    const [isTrendLoading, setIsTrendLoading] = useState(false);

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

    // Fetch recorded telemetry from backend /reports/generate service (same source as Reports Page)
    const fetchHistoricalTelemetry = async (scopeKey) => {
        setIsTrendLoading(true);
        try {
            const scopePayload = scopeKey === 'hourly' ? 'HOURLY' : scopeKey === 'weekly' ? 'WEEKLY' : 'DAILY';
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            let response;
            try {
                response = await fetch('http://localhost:8000/reports/generate', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ scope: scopePayload })
                });
            } catch {
                response = await fetch('http://127.0.0.1:8000/reports/generate', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ scope: scopePayload })
                });
            }

            if (response && response.ok) {
                const data = await response.json();
                if (Array.isArray(data.telemetry) && data.telemetry.length > 0) {
                    const mapped = data.telemetry.map(t => ({
                        timestamp: t.timestamp || t.date || '',
                        density: typeof t.max_density_sqm === 'number' ? t.max_density_sqm : (typeof t.max_density === 'number' ? t.max_density : (t.density || 0.8)),
                        headcount: typeof t.avgCount === 'number' ? t.avgCount : (t.headcount || 0),
                        queue: t.avg_queue_length || 0,
                        status: t.status || 'NORMAL'
                    }));
                    setTelemetrySeries(mapped);
                } else {
                    setTelemetrySeries([]);
                }
            }
        } catch (err) {
            console.warn('[DashboardPage] Historical telemetry fetch failed:', err);
        } finally {
            setIsTrendLoading(false);
        }
    };

    useEffect(() => {
        fetchHistoricalTelemetry(trendScope);
    }, [trendScope]);

    // Continuously merge/append live WebSocket telemetry updates into trend series
    useEffect(() => {
        if (!wsData) return;

        const liveDensity = wsData.density ?? (wsData.crowd_count ? Number((wsData.crowd_count / 40.0).toFixed(2)) : 1.2);
        const liveCount = wsData.crowd_count ?? 118;
        const liveQueue = wsData.queue_length ?? 0;
        const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        setTelemetrySeries(prev => {
            const newItem = {
                timestamp: timeLabel,
                density: liveDensity,
                headcount: liveCount,
                queue: liveQueue,
                status: liveDensity > 3.0 ? 'HEAVY' : liveDensity > 1.5 ? 'MODERATE' : 'NORMAL'
            };

            if (prev.length === 0) {
                return [newItem];
            }

            const last = prev[prev.length - 1];
            // If same timestamp string, update live snapshot; otherwise append new sample
            if (last.timestamp === timeLabel) {
                const updated = [...prev];
                updated[updated.length - 1] = newItem;
                return updated;
            }

            // Keep up to 30 recent data points for smooth display
            const nextSeries = [...prev, newItem];
            if (nextSeries.length > 30) {
                return nextSeries.slice(nextSeries.length - 30);
            }
            return nextSeries;
        });
    }, [wsData]);

    // Compute dynamic real-time bottleneck capacities from LiveTelemetryStore / WebSocket & telemetry series
    const currentDensity = wsData?.density ?? (telemetrySeries.length > 0 ? telemetrySeries[telemetrySeries.length - 1].density : 1.2);
    const currentCount = wsData?.crowd_count ?? (telemetrySeries.length > 0 ? telemetrySeries[telemetrySeries.length - 1].headcount : 118);
    const currentQueue = wsData?.queue_length ?? (telemetrySeries.length > 0 ? telemetrySeries[telemetrySeries.length - 1].queue : 0);
    const currentOccupancy = wsData?.occupancy ?? Math.min(100, Math.round((currentCount / 80.0) * 100));
    const currentEntryRate = wsData?.entry_rate ?? (currentCount > 0 ? Math.round(currentCount * 0.3) : 15);

    // 1. Entrance Corridor Gateway: entrance flow pressure & entry rate
    const entranceCap = Math.min(100, Math.max(8, Math.round((currentDensity * 18) + (currentEntryRate * 0.7) + (currentOccupancy * 0.2))));
    const entranceStatus = entranceCap >= 80 ? "Critical" : entranceCap >= 60 ? "Heavy" : entranceCap >= 35 ? "Normal" : "Clear";
    const entranceColor = entranceCap >= 80 ? "bg-statusRed text-statusRed" : entranceCap >= 60 ? "bg-statusYellow text-statusYellow" : "bg-statusGreen text-statusGreen";

    // 2. Central Escalators Corridor: concourse occupancy & queue length
    const escalatorCap = Math.min(100, Math.max(10, Math.round((currentOccupancy * 0.6) + (currentQueue * 4.5) + (currentDensity * 12))));
    const escalatorStatus = escalatorCap >= 80 ? "Critical" : escalatorCap >= 60 ? "Heavy" : escalatorCap >= 35 ? "Normal" : "Clear";
    const escalatorColor = escalatorCap >= 80 ? "bg-statusRed text-statusRed" : escalatorCap >= 60 ? "bg-statusYellow text-statusYellow" : "bg-statusGreen text-statusGreen";

    // 3. Secure Sector O-2 Escape Path: egress path flow pressure vs exit rate
    const escapeCap = Math.min(100, Math.max(5, Math.round((currentOccupancy * 0.25) + (currentDensity * 10) + (currentQueue * 2.0))));
    const escapeStatus = escapeCap >= 80 ? "Critical" : escapeCap >= 60 ? "Heavy" : escapeCap >= 35 ? "Normal" : "Clear";
    const escapeColor = escapeCap >= 80 ? "bg-statusRed text-statusRed" : escapeCap >= 60 ? "bg-statusYellow text-statusYellow" : "bg-statusGreen text-statusGreen";

    const bottleneckData = [
        { name: "Entrance Corridor Gateway", capacity: entranceCap, status: entranceStatus, color: entranceColor },
        { name: "Central Escalators Corridor", capacity: escalatorCap, status: escalatorStatus, color: escalatorColor },
        { name: "Secure Sector O-2 Escape Path", capacity: escapeCap, status: escapeStatus, color: escapeColor }
    ];

    // SVG Trend Line & Area calculations for Historical Density Trends
    const chartPoints = React.useMemo(() => {
        if (telemetrySeries.length === 0) {
            const baseDens = currentDensity || 1.2;
            return [
                { timestamp: "08:00", density: Math.max(0.2, Number((baseDens * 0.6).toFixed(2))) },
                { timestamp: "12:00", density: Math.max(0.4, Number((baseDens * 1.1).toFixed(2))) },
                { timestamp: "16:00", density: Math.max(0.3, Number((baseDens * 0.9).toFixed(2))) },
                { timestamp: "20:00", density: Math.max(0.5, Number((baseDens * 1.3).toFixed(2))) },
                { timestamp: "24:00", density: baseDens }
            ];
        }
        return telemetrySeries;
    }, [telemetrySeries, currentDensity]);

    const maxDensityVal = Math.max(3.0, ...chartPoints.map(p => p.density || 0));
    const viewBoxWidth = 400;
    const viewBoxHeight = 150;
    const paddingLeft = 35;
    const paddingRight = 15;
    const paddingTop = 20;
    const paddingBottom = 25;
    const drawWidth = viewBoxWidth - paddingLeft - paddingRight;
    const drawHeight = viewBoxHeight - paddingTop - paddingBottom;

    const coords = chartPoints.map((pt, i) => {
        const x = chartPoints.length > 1
            ? paddingLeft + (i / (chartPoints.length - 1)) * drawWidth
            : paddingLeft + drawWidth / 2;
        const normY = Math.min(1.0, Math.max(0.0, (pt.density || 0) / maxDensityVal));
        const y = paddingTop + drawHeight - normY * drawHeight;
        return { x, y, pt };
    });

    const dLine = coords.length > 0
        ? coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
        : '';
    const dArea = coords.length > 0
        ? `${dLine} L ${coords[coords.length - 1].x.toFixed(1)},${(viewBoxHeight - paddingBottom).toFixed(1)} L ${coords[0].x.toFixed(1)},${(viewBoxHeight - paddingBottom).toFixed(1)} Z`
        : '';

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

        let loc = newCamSourceLoc.trim();
        if (newCamSourceType === 'USB_WEBCAM') {
            loc = loc || '0';
        } else if (newCamSourceType === 'MOBILE_CAMERA') {
            if (!loc) {
                loc = 'http://192.168.1.50:8080/video';
            } else {
                if (!loc.startsWith('http://') && !loc.startsWith('https://') && !loc.startsWith('rtsp://')) {
                    loc = `http://${loc}`;
                }
                if (!loc.includes('/video') && !loc.includes('/shot.jpg') && !loc.includes('.mjpg')) {
                    loc = `${loc.replace(/\/$/, '')}/video`;
                }
            }
        } else {
            loc = loc || 'rtsp://10.0.1.50/stream1';
        }

        const payload = {
            camera_name: newCamName.trim(),
            source_type: newCamSourceType,
            source_location: loc,
            rtsp_url: loc,
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

    // Toggle camera status (ACTIVE <-> OFFLINE) with automatic wall rearrangement
    const handleToggleCameraStatus = (e, camId) => {
        e?.stopPropagation();
        const updated = localCams.map(c => {
            if (c.id === camId) {
                const nextStatus = (c.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 'OFFLINE' : 'ACTIVE';
                return { ...c, status: nextStatus };
            }
            return c;
        });
        setLocalCams(updated);
        localStorage.setItem('nexora_cameras', JSON.stringify(updated));
        window.dispatchEvent(new Event('nexora_cameras_updated'));
    };

    const activeCams = localCams.filter(c => (c.status || 'ACTIVE').toUpperCase() === 'ACTIVE' || (c.status || '').toUpperCase() === 'ONLINE');

    return (
        <div className="p-3.5 sm:p-5 flex flex-col gap-3.5 h-full overflow-y-auto">

            {/* WS Status Indicator */}
            <div className="flex justify-between items-center bg-bgSecondary/40 border border-panelBorder px-4 py-2 rounded-xl">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-accentCyan" />
                    <span className="text-xs uppercase tracking-wider text-textMuted font-bold">Tactical Console Telemetry</span>
                </div>
                <div className="flex items-center gap-2.5 bg-bgPrimary/70 px-3 py-1 rounded-full border border-panelBorder">
                    <span className={`w-2 h-2 rounded-full ${socketStatus === 'Connected' ? 'bg-statusGreen shadow-[0_0_8px_#10b981]' :
                        socketStatus === 'Reconnecting' ? 'bg-statusOrange shadow-[0_0_8px_#f97316]' :
                            socketStatus === 'Connecting' ? 'bg-statusYellow shadow-[0_0_8px_#f59e0b]' :
                                'bg-statusRed shadow-[0_0_8px_#ef4444]'
                        }`}></span>
                    <span className="text-[11px] font-bold font-mono tracking-wider">
                        SYSTEM_WS: {socketStatus.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* 1. TOP KPI CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
                    value={activeCams.length}
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

            {/* 2. IMMEDIATELY BELOW KPI CARDS: NEXORA LIVE CAMERA WALL */}
            <div className="glass-card rounded-xl p-3.5 sm:p-4 border border-panelBorder flex flex-col gap-2.5">
                <div className="flex justify-between items-center flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <Video className="w-4 h-4 text-accentCyan" />
                        <h3 className="font-outfit font-semibold text-white text-sm tracking-wide">
                            NEXORA LIVE CAMERA WALL
                        </h3>
                        <span className="flex items-center gap-1 text-[10px] font-mono font-bold bg-statusGreen/15 border border-statusGreen/30 text-statusGreen px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-statusGreen animate-pulse"></span>
                            {activeCams.length} {activeCams.length === 1 ? 'FEED ACTIVE' : 'FEEDS ACTIVE'}
                        </span>
                    </div>
                    <button
                        onClick={() => setShowAddCamModal(true)}
                        className="flex items-center gap-1.5 text-xs text-accentCyan hover:text-white bg-accentCyan/10 hover:bg-accentCyan/20 border border-accentCyan/30 px-2.5 py-1 rounded-lg transition-all font-semibold font-mono"
                    >
                        <PlusCircle className="w-3.5 h-3.5" /> Add Camera
                    </button>
                </div>

                {/* Auto-adjusting Responsive CSS Grid for active feeds */}
                {activeCams.length === 0 ? (
                    <div className="p-6 border border-dashed border-panelBorder rounded-lg text-center text-textMuted text-xs flex flex-col items-center justify-center gap-2">
                        <Camera className="w-6 h-6 text-slate-600" />
                        <p>No active camera streams detected.</p>
                        <button
                            onClick={() => setShowAddCamModal(true)}
                            className="text-accentCyan hover:underline font-mono text-xs mt-1"
                        >
                            + Register Camera Stream
                        </button>
                    </div>
                ) : (
                    <div className={`grid ${getCameraWallGridClasses(activeCams.length)} gap-2.5 ${activeCams.length > 6 ? 'max-h-[380px] overflow-y-auto pr-1' : ''}`}>
                        {activeCams.map(cam => (
                            <CameraWallTile
                                key={cam.id}
                                camera={cam}
                                totalCams={activeCams.length}
                                onDelete={(e) => handleDeleteCamera(e, cam.id)}
                                onToggleStatus={(e) => handleToggleCameraStatus(e, cam.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* 3. IMMEDIATELY BELOW THE CAMERA WALL: Real-Time SHAP Feature Attributions */}
            <ShapExplainabilityPanel xaiData={xaiData} riskLevel={riskLevel} />

            {/* 4. OPERATIONAL MONITORING: VISUAL GAUGES, SWITCHBOARD & ALERTS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">

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

                {/* Dynamic Density Trend Graph */}
                <div className="glass-card rounded-xl p-6 border border-panelBorder flex flex-col justify-between">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-accentCyan" />
                            <h3 className="font-outfit font-semibold text-white">Historical Density Trends</h3>
                            {isTrendLoading && <RefreshCw className="w-3 h-3 text-accentCyan animate-spin ml-1" />}
                        </div>

                        {/* Scope Filter Selector matching Reports Page pattern */}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-textMuted uppercase font-bold tracking-wider">Scope:</span>
                            <select
                                value={trendScope}
                                onChange={(e) => setTrendScope(e.target.value)}
                                className="bg-bgPrimary border border-panelBorder text-slate-200 rounded-lg px-3 py-1 text-xs font-semibold outline-none focus:border-accentCyan cursor-pointer hover:border-slate-600 transition-colors"
                            >
                                <option value="hourly">Last 60 Min</option>
                                <option value="daily">24 Hours</option>
                                <option value="weekly">Week</option>
                            </select>
                        </div>
                    </div>

                    {/* Live Stream Metrics Summary Chip */}
                    <div className="flex items-center justify-between bg-bgPrimary/60 border border-panelBorder/60 rounded-lg px-3.5 py-2 mb-3 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-accentCyan animate-pulse"></span>
                            <span className="text-textMuted font-medium">Live Stream Reading:</span>
                            <span className="font-mono font-bold text-white">{currentDensity.toFixed(2)} pers/m²</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-textMuted">Peak:</span>
                            <span className="text-statusOrange font-bold">{maxDensityVal.toFixed(2)} pers/m²</span>
                        </div>
                    </div>

                    <div className="h-56 bg-bgSecondary/30 border border-panelBorder rounded-lg flex items-center justify-center p-3 font-mono text-xs text-textMuted relative overflow-hidden">
                        <svg className="w-full h-full" viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
                            <defs>
                                <linearGradient id="t-grad-live" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.0" />
                                </linearGradient>
                            </defs>

                            {/* Y-Axis Gridlines */}
                            <line x1={paddingLeft} y1={paddingTop} x2={viewBoxWidth - paddingRight} y2={paddingTop} stroke="#1e293b" strokeDasharray="3 3" strokeWidth="1" />
                            <line x1={paddingLeft} y1={paddingTop + drawHeight / 2} x2={viewBoxWidth - paddingRight} y2={paddingTop + drawHeight / 2} stroke="#1e293b" strokeDasharray="3 3" strokeWidth="1" />
                            <line x1={paddingLeft} y1={paddingTop + drawHeight} x2={viewBoxWidth - paddingRight} y2={paddingTop + drawHeight} stroke="#334155" strokeWidth="1" />

                            {/* Y-Axis Scale Text */}
                            <text x={paddingLeft - 6} y={paddingTop + 4} fill="#64748b" fontSize="8" textAnchor="end">{maxDensityVal.toFixed(1)}</text>
                            <text x={paddingLeft - 6} y={paddingTop + drawHeight / 2 + 3} fill="#64748b" fontSize="8" textAnchor="end">{(maxDensityVal / 2).toFixed(1)}</text>
                            <text x={paddingLeft - 6} y={paddingTop + drawHeight + 3} fill="#64748b" fontSize="8" textAnchor="end">0.0</text>

                            {/* Area Gradient Fill & Trend Line */}
                            {dArea && <path d={dArea} fill="url(#t-grad-live)" />}
                            {dLine && <path d={dLine} fill="none" stroke="#00e5ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

                            {/* Interactive Node Dots */}
                            {coords.map((c, idx) => (
                                <circle
                                    key={idx}
                                    cx={c.x}
                                    cy={c.y}
                                    r={idx === coords.length - 1 ? "4" : "2.5"}
                                    fill={idx === coords.length - 1 ? "#00e5ff" : "#0284c7"}
                                    stroke="#0f172a"
                                    strokeWidth="1.5"
                                />
                            ))}

                            {/* X-Axis Time Labels */}
                            {chartPoints.length > 0 && (
                                <>
                                    <text x={paddingLeft} y={viewBoxHeight - 6} fill="#64748b" fontSize="8" textAnchor="start">
                                        {chartPoints[0].timestamp ? String(chartPoints[0].timestamp).substring(0, 10) : ''}
                                    </text>
                                    {chartPoints.length > 2 && (
                                        <text x={viewBoxWidth / 2} y={viewBoxHeight - 6} fill="#64748b" fontSize="8" textAnchor="middle">
                                            {chartPoints[Math.floor(chartPoints.length / 2)].timestamp ? String(chartPoints[Math.floor(chartPoints.length / 2)].timestamp).substring(0, 10) : ''}
                                        </text>
                                    )}
                                    <text x={viewBoxWidth - paddingRight} y={viewBoxHeight - 6} fill="#64748b" fontSize="8" textAnchor="end">
                                        {chartPoints[chartPoints.length - 1].timestamp ? String(chartPoints[chartPoints.length - 1].timestamp).substring(0, 10) : ''}
                                    </text>
                                </>
                            )}
                        </svg>
                    </div>
                </div>

                {/* Real-Time Bottleneck Capacity Monitor */}
                <div className="glass-card rounded-xl p-6 border border-panelBorder flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-outfit font-semibold text-white">Bottleneck Capacity Monitor</h3>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-accentCyan">
                            <span className="w-1.5 h-1.5 rounded-full bg-accentCyan animate-pulse"></span>
                            <span>Live Telemetry Sync</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-5">
                        {bottleneckData.map((bt, idx) => {
                            const colorBg = bt.capacity >= 80 ? 'bg-statusRed' : bt.capacity >= 60 ? 'bg-statusYellow' : 'bg-statusGreen';
                            const colorText = bt.capacity >= 80 ? 'text-statusRed' : bt.capacity >= 60 ? 'text-statusYellow' : 'text-statusGreen';

                            return (
                                <div key={idx}>
                                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                                        <span className="text-slate-300">{bt.name}</span>
                                        <span className={`font-mono font-bold ${colorText}`}>
                                            {bt.capacity}% ({bt.status})
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-950 rounded-full h-2.5 border border-slate-900 overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-700 ease-out ${colorBg}`} style={{ width: `${bt.capacity}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
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
