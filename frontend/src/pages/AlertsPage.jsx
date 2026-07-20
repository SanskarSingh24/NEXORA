import React, { useState } from 'react';
import {
    Bell,
    AlertTriangle,
    MapPin,
    CheckCircle2,
    Clock,
    ShieldAlert,
    ChevronRight,
    CheckCircle,
    Database,
    Grid
} from 'lucide-react';

const initialAlertsList = [
    { id: "AL-1910", camera: "CAM-02", zone: "South escalators corridor", level: "RED", message: "Critical crowd pressure anomaly detected near entrance gates.", confidence: 96.2, time: "2026-07-13 14:02:11", acknowledged: false, operator: null },
    { id: "AL-1906", camera: "CAM-01", zone: "Main Entrance Gateway", level: "YELLOW", message: "Moderate occupancy surge detected during incoming train arrival.", confidence: 84.5, time: "2026-07-13 13:44:22", acknowledged: true, operator: "Admin Operator" },
    { id: "AL-1904", camera: "CAM-03", zone: "North Corridor LinkWAY", level: "YELLOW", message: "Pedestrian direction alignment vector drop flagged.", confidence: 79.1, time: "2026-07-13 13:20:05", acknowledged: false, operator: null },
    { id: "AL-1901", camera: "CAM-04", zone: "Evacuation Tunnel 4", level: "RED", message: "Unauthorized movement profile detected in restricted access area.", confidence: 91.8, time: "2026-07-13 12:11:54", acknowledged: true, operator: "Security Chief" }
];

export default function AlertsPage() {
    const [alerts, setAlerts] = useState(initialAlertsList);
    const [filterSeverity, setFilterSeverity] = useState('ALL'); // 'ALL', 'RED', 'YELLOW'
    const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL', 'PENDING', 'ACKNOWLEDGED'
    const [selectedAlert, setSelectedAlert] = useState(initialAlertsList[0]);
    const [actionLog, setActionLog] = useState([
        { time: "14:15:32", text: "Operator Admin verified system parameters." },
        { time: "13:46:11", text: "Al-1906 acknowledged by Admin Operator." },
        { time: "12:15:00", text: "Al-1901 acknowledged by Security Chief." }
    ]);

    const handleAcknowledge = (id) => {
        setAlerts(prev => prev.map(al => {
            if (al.id === id) {
                const timeStr = new Date().toISOString().replace('T', ' ').substring(11, 19);
                setActionLog(log => [
                    { time: timeStr, text: `${al.id} acknowledged by Admin Operator.` },
                    ...log
                ]);
                const updated = { ...al, acknowledged: true, operator: "Admin Operator" };
                if (selectedAlert && selectedAlert.id === id) {
                    setSelectedAlert(updated);
                }
                return updated;
            }
            return al;
        }));
    };

    const handleForceTriggerSimulation = () => {
        const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const newAlert = {
            id: `AL-${Math.floor(1911 + Math.random() * 80)}0`,
            camera: `CAM-0${Math.floor(1 + Math.random() * 4)}`,
            zone: `Region Sector ${String.fromCharCode(65 + Math.floor(Math.random() * 4))}`,
            level: Math.random() > 0.4 ? "RED" : "YELLOW",
            message: "Dynamic threat trigger: density exceeds safety thresholds.",
            confidence: parseFloat((85 + Math.random() * 14).toFixed(1)),
            time: timeStr,
            acknowledged: false,
            operator: null
        };

        setAlerts(prev => [newAlert, ...prev]);
        setSelectedAlert(newAlert);

        const actionTime = timeStr.substring(11, 19);
        setActionLog(log => [
            { time: actionTime, text: `SYSTEM: Dynamic anomaly alert ${newAlert.id} dispatched automatically.` },
            ...log
        ]);
    };

    // Filter alerts
    const filteredAlerts = alerts.filter(al => {
        const matchSev = filterSeverity === 'ALL' || al.level === filterSeverity;
        const matchStat = filterStatus === 'ALL' ||
            (filterStatus === 'PENDING' && !al.acknowledged) ||
            (filterStatus === 'ACKNOWLEDGED' && al.acknowledged);
        return matchSev && matchStat;
    });

    return (
        <div className="p-8 flex flex-col lg:flex-row gap-8 h-full overflow-hidden">

            {/* Search and Alert Checklist Sidebar (Left) */}
            <div className="w-full lg:w-[450px] flex flex-col gap-6 h-full min-h-0">

                {/* Header and trigger simulator */}
                <div className="glass-card rounded-xl p-5 border border-panelBorder bg-bgSecondary/60 flex justify-between items-center">
                    <div>
                        <h2 className="font-outfit font-extrabold text-xl text-white">Emergency alarms Desk</h2>
                        <p className="text-xs text-textMuted mt-1">Review, filter and stamp incident mitigation streams.</p>
                    </div>
                    <button
                        onClick={handleForceTriggerSimulation}
                        className="bg-statusRed/10 border border-statusRed text-statusRed hover:bg-statusRed hover:text-white px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all"
                    >
                        Force Alarm
                    </button>
                </div>

                {/* Filters control Box */}
                <div className="glass-card rounded-xl p-4 border border-panelBorder flex flex-col gap-3">
                    <div className="flex gap-3">
                        <div className="flex-grow flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Severity Filter</label>
                            <select
                                value={filterSeverity}
                                onChange={(e) => setFilterSeverity(e.target.value)}
                                className="bg-bgPrimary border border-panelBorder text-slate-350 rounded px-2.5 py-1.5 text-xs outline-none focus:border-accentCyan w-full"
                            >
                                <option value="ALL">ALL SEVERITIES</option>
                                <option value="RED">RED CRITICAL</option>
                                <option value="YELLOW">YELLOW ELEVATED</option>
                            </select>
                        </div>
                        <div className="flex-grow flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Status Light</label>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="bg-bgPrimary border border-panelBorder text-slate-350 rounded px-2.5 py-1.5 text-xs outline-none focus:border-accentCyan w-full"
                            >
                                <option value="ALL">ALL INCIDENTS</option>
                                <option value="PENDING">PENDING STAMPS</option>
                                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Alerts Checklist Scroll Area */}
                <div className="flex-grow overflow-y-auto flex flex-col gap-3 min-h-0 pr-1">
                    {filteredAlerts.length === 0 ? (
                        <div className="glass-card rounded-xl border border-dashed border-panelBorder p-12 text-center text-textMuted text-xs">
                            No alarms matching active logs parameters.
                        </div>
                    ) : (
                        filteredAlerts.map(al => (
                            <div
                                key={al.id}
                                onClick={() => setSelectedAlert(al)}
                                className={`p-4 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${selectedAlert?.id === al.id
                                        ? 'border-accentCyan bg-bgTertiary text-white shadow-[0_0_12px_rgba(0,229,255,0.1)]'
                                        : 'border-panelBorder bg-bgSecondary/30 text-textMuted hover:border-slate-700 hover:text-white'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 p-1.5 rounded bg-bgPrimary ${al.level === 'RED' ? 'text-statusRed' : 'text-statusYellow'}`}>
                                        <AlertTriangle className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-slate-200">{al.id}</span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide ${al.level === 'RED' ? 'bg-statusRed/10 text-statusRed' : 'bg-statusYellow/10 text-statusYellow'
                                                }`}>
                                                {al.level}
                                            </span>
                                        </div>
                                        <p className="text-[11px] font-semibold mt-1 max-w-[250px] truncate text-slate-350">{al.message}</p>
                                        <span className="text-[10px] text-textMuted block mt-1.5 font-mono">{al.time}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {al.acknowledged ? (
                                        <CheckCircle className="w-5 h-5 text-statusGreen" />
                                    ) : (
                                        <span className="w-2 h-2 rounded-full bg-statusRed animate-pulse"></span>
                                    )}
                                    <ChevronRight className="w-4 h-4 text-slate-700" />
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>

            {/* Focus Incident Panel & Audit Tracker (Right) */}
            <div className="flex-grow flex flex-col gap-6 h-full min-h-0 overflow-y-auto">

                {/* Selected Incident Screen */}
                {selectedAlert ? (
                    <div className="glass-card rounded-xl border border-panelBorder bg-bgSecondary/30 p-6 flex flex-col gap-6">

                        {/* Header info */}
                        <div className="flex justify-between items-start border-b border-panelBorder pb-4">
                            <div>
                                <span className={`text-[10px] uppercase font-bold tracking-widest font-mono ${selectedAlert.level === 'RED' ? 'text-statusRed' : 'text-statusYellow'}`}>
                                    {selectedAlert.level} CRITICAL EXPLICIT INDEX
                                </span>
                                <h3 className="text-xl font-extrabold font-outfit text-white mt-1.5">ALERT THREAT STATIONS: {selectedAlert.id}</h3>
                            </div>
                            {!selectedAlert.acknowledged && (
                                <button
                                    onClick={() => handleAcknowledge(selectedAlert.id)}
                                    className="bg-statusGreen hover:bg-green-700 text-bgPrimary font-bold px-5 py-2.5 rounded-lg text-xs tracking-wider uppercase transition-all"
                                >
                                    Sign Acknowledge
                                </button>
                            )}
                        </div>

                        {/* Sub-grid of threat vectors */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-2">
                            <div className="bg-bgPrimary/60 border border-panelBorder rounded-lg p-4 flex flex-col gap-1">
                                <span className="text-[10px] uppercase font-bold text-textMuted tracking-wider font-mono">Capture Source</span>
                                <span className="font-bold text-white flex items-center gap-1.5 mt-1 font-mono text-sm">
                                    <MapPin className="w-4 h-4 text-accentCyan" /> {selectedAlert.camera}
                                </span>
                            </div>
                            <div className="bg-bgPrimary/60 border border-panelBorder rounded-lg p-4 flex flex-col gap-1">
                                <span className="text-[10px] uppercase font-bold text-textMuted tracking-wider font-mono">Location Sector</span>
                                <span className="font-bold text-white flex items-center gap-1.5 mt-1 text-sm font-mono truncate">
                                    <Grid className="w-4 h-4 text-accentCyan" /> {selectedAlert.zone}
                                </span>
                            </div>
                            <div className="bg-bgPrimary/60 border border-panelBorder rounded-lg p-4 flex flex-col gap-1">
                                <span className="text-[10px] uppercase font-bold text-textMuted tracking-wider font-mono">Model Accuracy</span>
                                <span className="font-bold text-white flex items-center gap-1.5 mt-1 text-sm font-mono">
                                    <Database className="w-4 h-4 text-accentCyan" /> {selectedAlert.confidence}% Confidence
                                </span>
                            </div>
                        </div>

                        {/* Description details */}
                        <div className="flex flex-col gap-2">
                            <h4 className="text-xs uppercase font-extrabold text-white tracking-wider">Descriptive Threat Audit</h4>
                            <p className="bg-bgPrimary/70 border border-panelBorder rounded-lg p-4 text-xs font-semibold leading-relaxed text-slate-350">
                                {selectedAlert.message} The central pipeline flagged occupancy vectors passing maximum safe configurations within regional corridors. Inspect local access points immediately.
                            </p>
                        </div>

                        {/* Verified Stamps details */}
                        <div className="flex items-center gap-3 bg-bgPrimary/30 border border-panelBorder/70 rounded-lg p-4">
                            <div className={`p-2 rounded-lg ${selectedAlert.acknowledged ? 'bg-statusGreen/10 text-statusGreen' : 'bg-statusRed/10 text-statusRed'}`}>
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-white">
                                    Status: {selectedAlert.acknowledged ? 'ACKNOWLEDGED ACTION' : 'AWAITING OPERATOR VERIFICATION'}
                                </p>
                                <p className="text-[10px] text-textMuted mt-0.5">
                                    {selectedAlert.acknowledged
                                        ? `Stamped by: ${selectedAlert.operator || 'Admin Operator'}`
                                        : 'Mitigate alert anomalies and execute checkpoint redirect configurations.'}
                                </p>
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="glass-card rounded-xl border border-dashed border-panelBorder p-12 text-center text-textMuted text-xs flex-grow flex flex-col justify-center items-center">
                        Select an incident code from the active checklist to review its telemetry audit.
                    </div>
                )}

                {/* Audit Log Box */}
                <div className="glass-card rounded-xl border border-panelBorder bg-bgSecondary/10 p-5 flex flex-col gap-4">
                    <h3 className="font-outfit font-semibold text-white">System Actions Audit Chronology</h3>
                    <div className="flex flex-col gap-2.5 max-h-48 overflow-y-auto font-mono text-[11px] text-textMuted pr-1">
                        {actionLog.map((log, idx) => (
                            <div key={idx} className="flex gap-3 items-baseline border-b border-panelBorder/20 pb-2">
                                <span className="text-accentCyan font-bold">{log.time}</span>
                                <span className="text-slate-350">{log.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

        </div>
    );
}
