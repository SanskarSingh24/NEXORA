import React, { useState, useEffect } from 'react';
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
    Eye
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

// Initial constants
const initialCameras = [
    { id: "CAM-01", name: "Main Entrance Gateway", zone: "Zone A", lat: 37.7749, lng: -122.4194, status: "ACTIVE", ip: "rtsp://10.0.1.50/stream1" },
    { id: "CAM-02", name: "South escalators corridor", zone: "Zone B", lat: 37.7752, lng: -122.4190, status: "ACTIVE", ip: "rtsp://10.0.1.51/stream1" },
    { id: "CAM-03", name: "North Corridor LinkWAY", zone: "Lower Level", lat: 37.7745, lng: -122.4198, status: "ACTIVE", ip: "rtsp://10.0.1.52/stream1" },
    { id: "CAM-04", name: "Evacuation Tunnel 4", zone: "Emergency Zone", lat: 37.7741, lng: -122.4185, status: "INACTIVE", ip: "rtsp://10.0.2.20/stream2" }
];

const initialAlerts = [
    { id: "AL-1910", camera: "CAM-02", zone: "South escalators corridor", level: "RED", message: "Critical crowd pressure anomaly detected near entrance gates.", confidence: 96.2, time: "Just Now", acknowledged: false },
    { id: "AL-1906", camera: "CAM-01", zone: "Main Entrance Gateway", level: "YELLOW", message: "Moderate occupancy surge detected during incoming train arrival.", confidence: 84.5, time: "18 mins ago", acknowledged: true }
];

// Helper components
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

function RiskMeter({ value }) {
    const levels = {
        GREEN: { label: "SAFE", color: "text-statusGreen", bg: "bg-statusGreen", desc: "Standard flow rate boundaries." },
        YELLOW: { label: "MODERATE", color: "text-statusYellow", bg: "bg-statusYellow", desc: "Elevated count; surveillance raised." },
        ORANGE: { label: "HIGH", color: "text-statusOrange", bg: "bg-statusOrange", desc: "Density crossing boundaries. Prepare paths." },
        RED: { label: "CRITICAL", color: "text-statusRed", bg: "bg-statusRed", desc: "Crowd pressure threshold breached!" }
    };
    const selected = levels[value] || levels.GREEN;
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-textMuted font-bold">Flow Status</span>
                <span className={`text-sm font-extrabold font-outfit px-3 py-0.5 rounded-full bg-slate-900 border border-slate-800 ${selected.color}`}>
                    {selected.label}
                </span>
            </div>
            <div className="w-full bg-bgPrimary h-2.5 rounded-full overflow-hidden border border-panelBorder p-[1px]">
                <div className={`h-full rounded-full transition-all duration-500 ${selected.bg}`} style={{ width: value === 'RED' ? '100%' : value === 'ORANGE' ? '75%' : value === 'YELLOW' ? '45%' : '20%' }}></div>
            </div>
            <p className="text-[11px] text-textMuted mt-1">{selected.desc}</p>
        </div>
    );
}

function ConfidenceGauge({ percentage }) {
    const strokeOffset = 220 - (220 * percentage) / 100;
    return (
        <div className="flex flex-col items-center justify-center p-2">
            <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx="56" cy="56" r="35" className="stroke-slate-900 fill-none" strokeWidth="6" />
                    <circle cx="56" cy="56" r="35" className="stroke-accentCyan fill-none transition-all duration-700" strokeWidth="6" strokeDasharray="220" strokeDashoffset={strokeOffset} strokeLinecap="round" />
                </svg>
                <span className="absolute text-lg font-extrabold font-outfit text-white">{percentage}%</span>
            </div>
            <p className="text-[10px] text-textMuted uppercase tracking-widest font-bold mt-2">AI Engine Confidence</p>
        </div>
    );
}

export default function DashboardPage() {
    const [localCams, setLocalCams] = useState(initialCameras);
    const [localAlerts, setLocalAlerts] = useState(initialAlerts);
    const [selectedCamStream, setSelectedCamStream] = useState(null);
    const [triggerCriticalAlert, setTriggerCriticalAlert] = useState(false);
    const [showAddCamModal, setShowAddCamModal] = useState(false);

    // New Camera Form Fields
    const [newCamName, setNewCamName] = useState("");
    const [newCamZone, setNewCamZone] = useState("");
    const [newCamRtsp, setNewCamRtsp] = useState("");

    const token = localStorage.getItem('nexora_token');
    // Connect to the WebSocket on the unified backend gateway (port 8000)
    const { status: socketStatus, data: wsData } = useWebSocket('ws://localhost:8000/ws/map', token);

    // Read message data with local mock fallbacks if websocket disconnected
    const crowdCount = wsData?.crowd_count ?? 118;
    const riskLevel = wsData?.risk_level ?? "MEDIUM";
    const systemAlerts = wsData?.alerts ?? [];

    useEffect(() => {
        if (riskLevel === "RED") {
            setTriggerCriticalAlert(true);
        }
    }, [riskLevel]);

    const handleAcknowledgeEmergency = () => {
        setTriggerCriticalAlert(false);
    };

    const handleAcknowledgeAlert = (alertId) => {
        setLocalAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
    };

    const handleAddCamera = (e) => {
        e.preventDefault();
        if (!newCamName || !newCamZone) return;
        const newCam = {
            id: `CAM-0${localCams.length + 1}`,
            name: newCamName,
            zone: newCamZone,
            lat: 37.774 + (Math.random() - 0.5) * 0.01,
            lng: -122.418 + (Math.random() - 0.5) * 0.01,
            status: "ACTIVE",
            ip: newCamRtsp || "rtsp://10.0.1.99/stream1"
        };
        setLocalCams(prev => [...prev, newCam]);
        setNewCamName("");
        setNewCamZone("");
        setNewCamRtsp("");
        setShowAddCamModal(false);
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
                    value={riskLevel}
                    sub="Evaluation tier rating"
                    icon={Shield}
                    colorClass={riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'text-statusRed' : 'text-statusYellow'}
                    statusLight={riskLevel === 'CRITICAL' ? 'bg-statusRed' : 'bg-statusYellow'}
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

            {/* SECOND SECTION: VISUAL GAUGES & CAMERAS LIST */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Risk & Confidence Gauge box */}
                <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col justify-between gap-6">
                    <h3 className="font-outfit font-semibold text-white">AI Predictor Gauges</h3>
                    <RiskMeter value={riskLevel} />
                    <hr className="border-panelBorder" />
                    <ConfidenceGauge percentage={wsData?.confidence ?? 94} />
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
                            {localCams.map(cam => (
                                <button
                                    key={cam.id}
                                    onClick={() => setSelectedCamStream(cam.id)}
                                    className={`flex justify-between items-center p-3 rounded-lg border text-sm font-semibold transition-all ${selectedCamStream === cam.id
                                        ? 'bg-slate-900 border-accentCyan text-white shadow-[0_0_8px_rgba(0,229,255,0.15)]'
                                        : 'bg-bgSecondary/30 border-panelBorder text-textMuted hover:border-slate-700 hover:text-white'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Video className="w-4 h-4 text-textMuted" />
                                        <span>{cam.name}</span>
                                    </div>
                                    <span className={`w-2.5 h-2.5 rounded-full ${cam.status === 'ACTIVE' ? 'bg-statusGreen' : 'bg-statusRed'}`}></span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4">
                        {selectedCamStream ? (
                            <div className="mt-2 p-3 bg-bgPrimary/80 rounded-lg border border-accentCyan/30 relative">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] text-accentCyan font-bold tracking-widest font-mono">STREAMING: {selectedCamStream}</span>
                                    <button onClick={() => setSelectedCamStream(null)} className="text-textMuted text-xs hover:text-white">close</button>
                                </div>
                                <div className="h-28 rounded bg-black relative flex items-center justify-center overflow-hidden">
                                    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
                                    <span className="text-[10px] text-statusGreen font-mono uppercase tracking-wider animate-pulse flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 bg-statusGreen rounded-full"></span> analyzing video feeds
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 p-4 border border-dashed border-panelBorder rounded-lg text-center text-textMuted text-xs flex flex-col items-center justify-center">
                                <Video className="w-6 h-6 mb-1 text-slate-700" />
                                Select camera to preview RTSP analytics.
                            </div>
                        )}
                    </div>
                </div>

                {/* Live System Alerts Feed */}
                <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col">
                    <h3 className="font-outfit font-semibold text-white mb-4">Urgent Alerts Console</h3>
                    <div className="flex flex-col gap-3 overflow-y-auto max-h-72 pr-1">
                        {localAlerts.length === 0 ? (
                            <p className="text-xs text-textMuted text-center my-6">No active alert logs.</p>
                        ) : (
                            localAlerts.map(alert => (
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
                                    <p className="text-slate-300 font-medium">{alert.message}</p>
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

            {/* ALERTS MODAL FOR LEVEL RED */}
            {triggerCriticalAlert && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
                    <div className="max-w-md w-full bg-slate-950 border-2 border-statusRed rounded-xl shadow-[0_0_30px_rgba(239,68,68,0.4)] overflow-hidden scale-100 animate-slideUp">
                        <div className="bg-statusRed text-white p-4 flex items-center justify-between">
                            <div className="flex items-center gap-2 font-outfit font-bold">
                                <AlertTriangle className="w-5 h-5 text-white" />
                                <span>CRITICAL RISK THRESHOLD EXPELLED</span>
                            </div>
                        </div>
                        <div className="p-6 flex flex-col gap-4 text-center">
                            <p className="text-sm text-slate-300">
                                The centralized monitoring engine has flagged crowd densities breaching safe thresholds at critical checkpoint corridors. Enact override safety parameters.
                            </p>
                            <div className="bg-slate-900 border border-panelBorder p-4 rounded-lg text-left text-xs font-mono text-statusRed">
                                <p>⚠️ INDEX SCORE: {wsData?.risk_score ?? "RED_CRITICAL_89"}</p>
                                <p className="mt-1">🕵️ ACTIVE HEADCOUNT: {crowdCount} PEOPLES</p>
                                <div className="mt-2 border-t border-panelBorder/40 pt-2 text-textMuted">
                                    {systemAlerts.map((a, i) => (
                                        <p key={i} className="text-slate-400">» {a}</p>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={handleAcknowledgeEmergency}
                                className="w-full bg-statusRed hover:bg-red-700 text-white font-bold py-3.5 rounded-lg text-sm transition-all"
                            >
                                Acknowledge Emergency Action
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE CAMERA STREAM MODAL */}
            {showAddCamModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
                    <div className="max-w-sm w-full bg-bgSecondary border border-panelBorder rounded-xl overflow-hidden">
                        <div className="border-b border-panelBorder px-5 py-4 flex justify-between items-center">
                            <h3 className="font-outfit font-semibold text-white">Add Device Stream</h3>
                            <button onClick={() => setShowAddCamModal(false)} className="text-xs text-textMuted hover:text-white">Cancel</button>
                        </div>
                        <form onSubmit={handleAddCamera} className="p-5 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Camera/Stream Identifier</label>
                                <input
                                    value={newCamName}
                                    onChange={e => setNewCamName(e.target.value)}
                                    className="bg-bgPrimary border border-panelBorder rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-accentCyan"
                                    placeholder="Escalator B Gate Capture"
                                    required
                                />
                            </div>
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
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Device RTSP URL (Optional)</label>
                                <input
                                    value={newCamRtsp}
                                    onChange={e => setNewCamRtsp(e.target.value)}
                                    className="bg-bgPrimary border border-panelBorder rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-accentCyan"
                                    placeholder="rtsp://10.0.1.66/stream1"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-accentCyan text-bgPrimary font-bold py-3 rounded-lg text-xs mt-2"
                            >
                                Register Camera
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
