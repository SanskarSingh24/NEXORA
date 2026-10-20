import React, { useState, useEffect, useRef } from 'react';
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
    Grid,
    Shield,
    Users,
    RefreshCw,
    PhoneCall,
    Phone
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

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

export default function AlertsPage() {
    const token = localStorage.getItem('nexora_token');
    const { status: socketStatus, data: wsData } = useWebSocket('ws://localhost:8000/ws/map', token);

    const [alerts, setAlerts] = useState([]);
    const [filterSeverity, setFilterSeverity] = useState('ALL'); // 'ALL', 'RED', 'YELLOW'
    const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL', 'PENDING', 'ACKNOWLEDGED'
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [actionLog, setActionLog] = useState([]);
    const lastAlertKeyRef = useRef(null);

    // Nearest Staff Priority for emergency alerts
    const [priorityStaff, setPriorityStaff] = useState([]);
    const [loadingPriorityStaff, setLoadingPriorityStaff] = useState(false);

    // Automated Exotel Emergency Voice Call notification state
    const [callStatusMap, setCallStatusMap] = useState({});
    const dispatchedAlertsRef = useRef(new Set());

    // Trigger outbound emergency voice call via Exotel API
    const triggerExotelCall = async (staff, alert, force = false) => {
        if (!staff || !staff.contact_number || !alert) return;
        const alertId = alert.id;

        setCallStatusMap(prev => ({
            ...prev,
            [alertId]: {
                status: 'calling',
                staffName: staff.name,
                contactNumber: staff.contact_number,
                zone: alert.zone,
                details: `Dialing ${staff.name} (${staff.contact_number})...`,
                timestamp: new Date().toLocaleTimeString(),
            }
        }));

        try {
            const token = localStorage.getItem('nexora_token');
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };
            const payload = {
                staff_id: staff.id,
                contact_number: staff.contact_number,
                staff_name: staff.name,
                zone: alert.zone,
                alert_id: String(alertId),
                alert_level: alert.risk_level || alert.level || 'CRITICAL',
                force: force
            };

            let res;
            try {
                res = await fetch('http://localhost:8000/staff/dispatch-call', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
            } catch {
                res = await fetch('http://127.0.0.1:8000/staff/dispatch-call', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
            }

            if (res && res.ok) {
                const data = await res.json();
                setCallStatusMap(prev => ({
                    ...prev,
                    [alertId]: {
                        status: data.status,
                        staffName: staff.name,
                        contactNumber: staff.contact_number,
                        zone: alert.zone,
                        details: data.details || data.message,
                        message: data.message,
                        callSid: data.call_sid,
                        timestamp: new Date().toLocaleTimeString(),
                    }
                }));
            } else {
                let errText = 'Failed to trigger call';
                try {
                    const errJson = await res.json();
                    errText = errJson.detail || errJson.message || errText;
                } catch {}
                setCallStatusMap(prev => ({
                    ...prev,
                    [alertId]: {
                        status: 'failed',
                        staffName: staff.name,
                        contactNumber: staff.contact_number,
                        zone: alert.zone,
                        details: errText,
                        timestamp: new Date().toLocaleTimeString(),
                    }
                }));
            }
        } catch (err) {
            console.error('[AlertsPage] Exotel call error:', err);
            setCallStatusMap(prev => ({
                ...prev,
                [alertId]: {
                    status: 'failed',
                    staffName: staff.name,
                    contactNumber: staff.contact_number,
                    zone: alert.zone,
                    details: err.message || 'Network error triggering call',
                    timestamp: new Date().toLocaleTimeString(),
                }
            }));
        }
    };

    // Query Nearest Staff Priority whenever selected alert is HIGH/CRITICAL
    useEffect(() => {
        if (!selectedAlert || !selectedAlert.zone) {
            setPriorityStaff([]);
            return;
        }

        const isEmergency = selectedAlert.level === 'RED' ||
            selectedAlert.risk_level === 'CRITICAL' ||
            selectedAlert.risk_level === 'HIGH';

        if (!isEmergency) {
            setPriorityStaff([]);
            return;
        }

        let isMounted = true;
        setLoadingPriorityStaff(true);

        const fetchPriorityStaff = async () => {
            try {
                const token = localStorage.getItem('nexora_token');
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                let res;
                try {
                    res = await fetch(`http://localhost:8000/staff/priority?zone=${encodeURIComponent(selectedAlert.zone)}`, { headers });
                } catch {
                    res = await fetch(`http://127.0.0.1:8000/staff/priority?zone=${encodeURIComponent(selectedAlert.zone)}`, { headers });
                }
                if (res && res.ok) {
                    const data = await res.json();
                    const staffList = Array.isArray(data) ? data : [];
                    if (isMounted) {
                        setPriorityStaff(staffList);

                        // Automated emergency call trigger step after ranking completes:
                        // Call top-ranked available staff member via Exotel API
                        if (staffList.length > 0) {
                            const topRanked = staffList[0];
                            const alertKey = String(selectedAlert.id);
                            if (!dispatchedAlertsRef.current.has(alertKey) && topRanked.contact_number) {
                                dispatchedAlertsRef.current.add(alertKey);
                                triggerExotelCall(topRanked, selectedAlert, false);
                            }
                        }
                    }
                } else {
                    if (isMounted) setPriorityStaff([]);
                }
            } catch (err) {
                console.warn('[AlertsPage] Priority staff query error:', err);
                if (isMounted) setPriorityStaff([]);
            } finally {
                if (isMounted) setLoadingPriorityStaff(false);
            }
        };

        fetchPriorityStaff();
        return () => { isMounted = false; };
    }, [selectedAlert?.id, selectedAlert?.zone, selectedAlert?.level, selectedAlert?.risk_level]);

    // Fetch initial live alerts from backend REST API (/alerts)
    const fetchLiveAlerts = async () => {
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
                    const formatted = data.alerts.map(a => formatAlertItem(a));
                    setAlerts(formatted);
                    setSelectedAlert(prev => prev || formatted[0]);
                }
            }
        } catch (err) {
            console.warn('[AlertsPage] REST alerts fetch fallback:', err);
        }
    };

    useEffect(() => {
        fetchLiveAlerts();
    }, []);

    // Listen to live WebSocket broadcasts and dynamically render active alerts
    useEffect(() => {
        if (!wsData) return;

        if (Array.isArray(wsData.alerts) && wsData.alerts.length > 0) {
            const formatted = wsData.alerts.map(a => formatAlertItem(a));
            setAlerts(formatted);
            setSelectedAlert(prev => {
                if (!prev) return formatted[0];
                const match = formatted.find(a => a.id === prev.id);
                return match || formatted[0];
            });

            const top = formatted[0];
            const actionTime = new Date().toISOString().substring(11, 19);
            const alertKey = `${top.id}-${top.acknowledged}`;

            if (lastAlertKeyRef.current !== alertKey) {
                lastAlertKeyRef.current = alertKey;
                setActionLog(log => [
                    { time: actionTime, text: `SYSTEM: Dynamic anomaly alert ${top.id} active in ${top.zone} (${top.level})` },
                    ...log.slice(0, 49)
                ]);
            }
        }
    }, [wsData]);

    // Query Nearest Staff Priority whenever selected alert is HIGH/CRITICAL
    useEffect(() => {
        if (!selectedAlert || !selectedAlert.zone) {
            setPriorityStaff([]);
            return;
        }

        const isEmergency = selectedAlert.level === 'RED' ||
            selectedAlert.risk_level === 'CRITICAL' ||
            selectedAlert.risk_level === 'HIGH';

        if (!isEmergency) {
            setPriorityStaff([]);
            return;
        }

        let isMounted = true;
        setLoadingPriorityStaff(true);

        const fetchPriorityStaff = async () => {
            try {
                const token = localStorage.getItem('nexora_token');
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                let res;
                try {
                    res = await fetch(`http://localhost:8000/staff/priority?zone=${encodeURIComponent(selectedAlert.zone)}`, { headers });
                } catch {
                    res = await fetch(`http://127.0.0.1:8000/staff/priority?zone=${encodeURIComponent(selectedAlert.zone)}`, { headers });
                }
                if (res && res.ok) {
                    const data = await res.json();
                    if (isMounted) setPriorityStaff(Array.isArray(data) ? data : []);
                } else {
                    if (isMounted) setPriorityStaff([]);
                }
            } catch (err) {
                console.warn('[AlertsPage] Priority staff query error:', err);
                if (isMounted) setPriorityStaff([]);
            } finally {
                if (isMounted) setLoadingPriorityStaff(false);
            }
        };

        fetchPriorityStaff();
        return () => { isMounted = false; };
    }, [selectedAlert?.id, selectedAlert?.zone, selectedAlert?.level, selectedAlert?.risk_level]);

    const handleAcknowledge = async (id) => {
        const now = new Date();
        const timeStr = now.toISOString().replace('T', ' ').substring(11, 19);

        setAlerts(prev => prev.map(al => {
            if (al.id === id) {
                const updated = { ...al, acknowledged: true, operator: "Admin Operator" };
                if (selectedAlert && selectedAlert.id === id) {
                    setSelectedAlert(updated);
                }
                return updated;
            }
            return al;
        }));

        setActionLog(log => [
            { time: timeStr, text: `Alert ${id} acknowledged by Admin Operator.` },
            ...log.slice(0, 49)
        ]);

        try {
            let res;
            try {
                res = await fetch(`http://localhost:8000/alerts/acknowledge/${id}`, { method: 'POST' });
            } catch {
                res = await fetch(`http://127.0.0.1:8000/alerts/acknowledge/${id}`, { method: 'POST' });
            }
        } catch (e) {
            console.warn('[AlertsPage] Acknowledge call fallback:', e);
        }
    };

    const handleForceTriggerSimulation = async () => {
        const randCam = `CAM-0${Math.floor(1 + Math.random() * 3)}`;
        const randZone = ["Central Concourse", "North Gate", "South Gate", "West Entrance", "East Corridor"][Math.floor(Math.random() * 5)];

        try {
            let res;
            try {
                res = await fetch('http://localhost:8000/alerts/trigger', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        camera: randCam,
                        zone: randZone,
                        level: "RED",
                        risk_level: "CRITICAL",
                        message: "Manual Threat Trigger: Operator forced emergency alert parameter breach."
                    })
                });
            } catch {
                res = await fetch('http://127.0.0.1:8000/alerts/trigger', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        camera: randCam,
                        zone: randZone,
                        level: "RED",
                        risk_level: "CRITICAL",
                        message: "Manual Threat Trigger: Operator forced emergency alert parameter breach."
                    })
                });
            }
        } catch (err) {
            console.warn('[AlertsPage] Force alarm error:', err);
        }
    };

    // Filter alerts based on active controls
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
                        <div className="flex items-center gap-2">
                            <h2 className="font-outfit font-extrabold text-xl text-white">Emergency Alarms Desk</h2>
                            <span className={`w-2 h-2 rounded-full ${socketStatus === 'Connected' ? 'bg-statusGreen shadow-[0_0_6px_#10b981]' : 'bg-statusYellow'}`}></span>
                        </div>
                        <p className="text-xs text-textMuted mt-1">Review live computer vision & SHAP anomaly streams.</p>
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
                            <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Status Filter</label>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="bg-bgPrimary border border-panelBorder text-slate-350 rounded px-2.5 py-1.5 text-xs outline-none focus:border-accentCyan w-full"
                            >
                                <option value="ALL">ALL INCIDENTS</option>
                                <option value="PENDING">PENDING ACK</option>
                                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Alerts Checklist Scroll Area */}
                <div className="flex-grow overflow-y-auto flex flex-col gap-3 min-h-0 pr-1">
                    {filteredAlerts.length === 0 ? (
                        <div className="glass-card rounded-xl border border-dashed border-panelBorder p-12 text-center text-textMuted text-xs flex flex-col items-center gap-2">
                            <Shield className="w-6 h-6 text-slate-600" />
                            <span>No active alarms matching current filters. All zones operating within normal limits.</span>
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
                                <div className="flex items-start gap-3 overflow-hidden">
                                    <div className={`mt-0.5 p-1.5 rounded bg-bgPrimary shrink-0 ${al.level === 'RED' ? 'text-statusRed' : 'text-statusYellow'}`}>
                                        <AlertTriangle className="w-4 h-4" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-slate-200">{al.id}</span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide ${al.level === 'RED' ? 'bg-statusRed/10 text-statusRed' : 'bg-statusYellow/10 text-statusYellow'
                                                }`}>
                                                {al.level} ({al.risk_level})
                                            </span>
                                        </div>
                                        <p className="text-[11px] font-semibold mt-1 max-w-[240px] truncate text-slate-350">{al.message}</p>
                                        <span className="text-[10px] text-textMuted block mt-1.5 font-mono">{al.time}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
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
                                    {selectedAlert.level} CRITICAL EXPLICIT INDEX ({selectedAlert.risk_level})
                                </span>
                                <h3 className="text-xl font-extrabold font-outfit text-white mt-1.5">ALERT THREAT STATION: {selectedAlert.id}</h3>
                            </div>
                            {!selectedAlert.acknowledged && (
                                <button
                                    onClick={() => handleAcknowledge(selectedAlert.id)}
                                    className="bg-statusGreen hover:bg-green-700 text-bgPrimary font-bold px-5 py-2.5 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)]"
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

                        {/* Description details with SHAP Breakdown */}
                        <div className="flex flex-col gap-2">
                            <h4 className="text-xs uppercase font-extrabold text-white tracking-wider font-mono">SHAP Descriptive Threat Audit</h4>
                            <div className="bg-bgPrimary/70 border border-panelBorder rounded-lg p-4 text-xs leading-relaxed text-slate-350 flex flex-col gap-3">
                                <p className="font-medium text-slate-200">
                                    <span className="text-accentCyan font-bold font-mono mr-1">[SHAP REASONING]:</span>
                                    {selectedAlert.message}
                                </p>

                                {selectedAlert.shap_contributions && (
                                    <div className="pt-2 border-t border-panelBorder/50">
                                        <p className="text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2 font-mono">Feature SHAP Contributions</p>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            {Object.entries(selectedAlert.shap_contributions).map(([feat, val]) => (
                                                <div key={feat} className="flex justify-between items-center text-[10px] font-mono bg-slate-950/80 px-2.5 py-1.5 rounded border border-panelBorder/40">
                                                    <span className="text-slate-400 capitalize">{feat.replace('_', ' ')}</span>
                                                    <span className={val >= 0 ? "text-statusOrange font-bold" : "text-statusGreen font-bold"}>
                                                        {val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedAlert.recommendations && selectedAlert.recommendations.length > 0 && (
                                    <div className="pt-2 border-t border-panelBorder/50 flex flex-col gap-1.5">
                                        <span className="text-[10px] font-bold text-accentCyan uppercase font-mono tracking-wider">Mitigation Actions</span>
                                        <div className="flex flex-col gap-1">
                                            {selectedAlert.recommendations.map((rec, i) => (
                                                <div key={i} className="text-[11px] text-slate-300 font-medium flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-accentCyan shrink-0"></span>
                                                    <span>{rec}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Nearest Staff Priority Section (HIGH / CRITICAL alerts) */}
                        {(selectedAlert.level === 'RED' || selectedAlert.risk_level === 'CRITICAL' || selectedAlert.risk_level === 'HIGH') && (
                            <div className="flex flex-col gap-2.5 pt-2 border-t border-panelBorder/60">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs uppercase font-extrabold text-white tracking-wider font-mono flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5 text-accentCyan" />
                                            Nearest Staff Priority Dispatch
                                        </span>
                                        <span className="text-[9px] font-mono bg-statusRed/15 text-statusRed border border-statusRed/30 px-1.5 py-0.5 rounded font-bold uppercase">
                                            EMERGENCY DISPATCH
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-mono text-textMuted">
                                        Sector: <span className="text-slate-200 font-semibold">{selectedAlert.zone}</span>
                                    </span>
                                </div>

                                <div className="bg-bgPrimary/70 border border-panelBorder rounded-lg p-3.5 flex flex-col gap-2.5">
                                    {/* Exotel Voice Call Dispatch Status Bar */}
                                    {priorityStaff.length > 0 && (
                                        <div className="flex items-center justify-between p-2.5 rounded-md border bg-slate-900/90 border-cyan-500/30 text-xs font-mono">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`p-1.5 rounded-full ${
                                                    callStatusMap[selectedAlert.id]?.status === 'calling'
                                                        ? 'bg-amber-500/20 text-amber-400 animate-pulse'
                                                        : callStatusMap[selectedAlert.id]?.status === 'dispatched'
                                                        ? 'bg-statusGreen/20 text-statusGreen'
                                                        : callStatusMap[selectedAlert.id]?.status === 'failed'
                                                        ? 'bg-statusRed/20 text-statusRed'
                                                        : 'bg-accentCyan/20 text-accentCyan'
                                                }`}>
                                                    <PhoneCall className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white text-[11px] truncate">
                                                            {callStatusMap[selectedAlert.id]?.status === 'calling' && `Dialing #${priorityStaff[0]?.rank} ${priorityStaff[0]?.name}...`}
                                                            {callStatusMap[selectedAlert.id]?.status === 'dispatched' && `Exotel Voice Call Dispatched`}
                                                            {callStatusMap[selectedAlert.id]?.status === 'simulated' && `Simulated Emergency Call Dispatched`}
                                                            {callStatusMap[selectedAlert.id]?.status === 'already_called' && `Emergency Call Dispatched`}
                                                            {callStatusMap[selectedAlert.id]?.status === 'failed' && `Exotel Call Alert`}
                                                            {!callStatusMap[selectedAlert.id] && `Automated Exotel Emergency Call`}
                                                        </span>
                                                        <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                                                            callStatusMap[selectedAlert.id]?.status === 'calling'
                                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                                : callStatusMap[selectedAlert.id]?.status === 'dispatched'
                                                                ? 'bg-statusGreen/20 text-statusGreen border border-statusGreen/30'
                                                                : callStatusMap[selectedAlert.id]?.status === 'failed'
                                                                ? 'bg-statusRed/20 text-statusRed border border-statusRed/30'
                                                                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                                        }`}>
                                                            {callStatusMap[selectedAlert.id]?.status || 'READY'}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-textMuted truncate">
                                                        {callStatusMap[selectedAlert.id]?.details ||
                                                            `Top responder: #${priorityStaff[0]?.rank} ${priorityStaff[0]?.name} (${priorityStaff[0]?.contact_number})`}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => triggerExotelCall(priorityStaff[0], selectedAlert, true)}
                                                disabled={callStatusMap[selectedAlert.id]?.status === 'calling'}
                                                title="Trigger emergency phone call via Exotel"
                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-accentCyan/15 hover:bg-accentCyan/25 border border-accentCyan/40 text-accentCyan font-bold text-[10px] transition-all flex-shrink-0 disabled:opacity-50"
                                            >
                                                <Phone className="w-3 h-3" />
                                                {callStatusMap[selectedAlert.id]?.status === 'calling' ? 'Calling...' : 'Call Responder'}
                                            </button>
                                        </div>
                                    )}

                                    {loadingPriorityStaff ? (
                                        <div className="py-4 flex items-center justify-center gap-2 text-textMuted text-xs font-mono">
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-accentCyan" />
                                            Calculating nearest available personnel for {selectedAlert.zone}...
                                        </div>
                                    ) : priorityStaff.length === 0 ? (
                                        <div className="py-3 text-center text-textMuted text-xs font-mono">
                                            ⚠️ No available staff currently on-duty in or near this sector.
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                                            {priorityStaff.map((staff) => (
                                                <div
                                                    key={staff.id}
                                                    className={`flex items-center justify-between p-2.5 rounded-md border transition-all text-xs ${
                                                        staff.is_exact_zone
                                                            ? 'bg-statusRed/5 border-statusRed/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]'
                                                            : 'bg-slate-900/60 border-panelBorder/60'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {/* Rank badge */}
                                                        <div
                                                            className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-black text-[10px] flex-shrink-0 ${
                                                                staff.rank === 1
                                                                    ? 'bg-accentCyan text-bgPrimary shadow-[0_0_8px_rgba(0,229,255,0.4)]'
                                                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                                                            }`}
                                                        >
                                                            #{staff.rank}
                                                        </div>

                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-white text-xs">{staff.name}</span>
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-400 font-medium">
                                                                    {staff.role}
                                                                </span>
                                                                {staff.is_exact_zone && (
                                                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-statusGreen/15 border border-statusGreen/40 text-statusGreen font-bold uppercase">
                                                                        Exact Match
                                                                    </span>
                                                                )}
                                                                {staff.rank === 1 && (
                                                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-bold uppercase flex items-center gap-1">
                                                                        <PhoneCall className="w-2.5 h-2.5" />
                                                                        Auto-Call
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-textMuted flex items-center gap-2 mt-0.5 font-mono">
                                                                <span>Zone: <strong className="text-slate-300">{staff.zone}</strong></span>
                                                                {staff.contact_number && (
                                                                    <span>• Comms: <strong className="text-slate-300">{staff.contact_number}</strong></span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 font-mono text-[10px]">
                                                        <span className="text-statusGreen font-semibold flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-statusGreen animate-pulse"></span>
                                                            Available
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Verified Stamp details */}
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
                    <div className="glass-card rounded-xl border border-dashed border-panelBorder p-12 text-center text-textMuted text-xs flex-grow flex flex-col justify-center items-center gap-2">
                        <ShieldAlert className="w-8 h-8 text-slate-600" />
                        <span>Select an incident code from the active checklist to review its telemetry audit.</span>
                    </div>
                )}

                {/* Audit Log Box */}
                <div className="glass-card rounded-xl border border-panelBorder bg-bgSecondary/10 p-5 flex flex-col gap-4">
                    <h3 className="font-outfit font-semibold text-white">System Actions Audit Chronology</h3>
                    <div className="flex flex-col gap-2.5 max-h-48 overflow-y-auto font-mono text-[11px] text-textMuted pr-1">
                        {actionLog.length === 0 ? (
                            <p className="text-[11px] text-slate-500 italic">No system actions logged yet.</p>
                        ) : (
                            actionLog.map((log, idx) => (
                                <div key={idx} className="flex gap-3 items-baseline border-b border-panelBorder/20 pb-2">
                                    <span className="text-accentCyan font-bold">{log.time}</span>
                                    <span className="text-slate-350">{log.text}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>

        </div>
    );
}
