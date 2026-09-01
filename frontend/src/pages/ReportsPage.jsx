import React, { useState } from 'react';
import {
    FileText,
    Download,
    RefreshCw,
    Calendar,
    AlertTriangle,
    Clock,
    Users,
    Activity
} from 'lucide-react';

const SCOPES = [
    { id: 'hourly', label: 'Hourly Context (Last 60 Minutes)', duration: '60 mins', interval: '1 min' },
    { id: 'daily', label: 'Daily Analytics (Last 24 Hours)', duration: '24 hours', interval: '1 hour' },
    { id: 'weekly', label: 'Weekly Summary (Last 7 Days)', duration: '7 days', interval: '24 hours' }
];

export default function ReportsPage() {
    const [currentScope, setCurrentScope] = useState('daily');
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [historyCount, setHistoryCount] = useState(0);

    const handleGenerateReport = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('nexora_token');
            let response;
            try {
                response = await fetch(`http://localhost:8000/reports/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ scope: currentScope.toUpperCase() })
                });
            } catch {
                response = await fetch(`http://127.0.0.1:8000/reports/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ scope: currentScope.toUpperCase() })
                });
            }

            if (!response.ok) throw new Error('Gateway reported error');
            const data = await response.json();
            setReport(data);
            setHistoryCount(prev => prev + 1);
        } catch (err) {
            console.warn('[Reports] API endpoint request failed:', err);
            setReport({
                id: `REP-${Math.floor(100000 + Math.random() * 900000)}`,
                scope: currentScope,
                generatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
                has_data: false,
                summary: {
                    average_headcount: 0,
                    peak_headcount: 0,
                    critical_incidents_recorded: 0,
                    device_coverage_uptime: '0%',
                    has_data: false,
                    status_message: "Insufficient real-time telemetry recorded for selected scope"
                },
                telemetry: [],
                incidents: []
            });
            setHistoryCount(prev => prev + 1);
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = () => {
        if (!report) return;

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "REPORT DETAILS\n";
        csvContent += `Report ID,${report.id}\n`;
        csvContent += `Scope,${report.scope.toUpperCase()}\n`;
        csvContent += `Generated At,${report.generatedAt}\n\n`;

        csvContent += "SUMMARY CONTROLS\n";
        csvContent += `Average Occupancy,${report.summary.average_headcount}\n`;
        csvContent += `Peak Occupancy,${report.summary.peak_headcount}\n`;
        csvContent += `Critical Incidents,${report.summary.critical_incidents_recorded}\n`;
        csvContent += `Uptime,${report.summary.device_coverage_uptime}\n\n`;

        csvContent += "TELEMETRY CHRONOLOGY\nTimestamp,Average Count,Peak Count,Status Light\n";
        report.telemetry.forEach(t => {
            csvContent += `${t.timestamp},${t.avgCount},${t.peakCount},${t.status}\n`;
        });

        csvContent += "\nINCIDENT INCIDENTS\nID,Timestamp,Location,Severity,Details,Confidence\n";
        report.incidents.forEach(inc => {
            csvContent += `${inc.id},${inc.timestamp},"${inc.location}",${inc.severity},"${inc.details}",${inc.confidence}%\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Nexora_Report_${report.id}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportPDF = () => {
        // Print window mapping trigger to export current layout view directly
        window.print();
    };

    return (
        <div className="p-8 flex flex-col gap-8 h-full overflow-y-auto print:p-0 print:bg-white print:text-black">

            {/* Selection Control Panel */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-bgSecondary/40 border border-panelBorder p-5 rounded-xl print:hidden">
                <div className="flex flex-col gap-1">
                    <h2 className="font-outfit font-extrabold text-xl text-white">Central Operations Report Compiler</h2>
                    <p className="text-xs text-textMuted font-medium">Generate audited occupancy analytics and telemetry logs.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <select
                        value={currentScope}
                        onChange={(e) => setCurrentScope(e.target.value)}
                        className="flex-grow md:flex-grow-0 bg-bgPrimary border border-panelBorder text-slate-200 rounded-lg px-4 py-2.5 text-xs font-semibold outline-none focus:border-accentCyan"
                    >
                        {SCOPES.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleGenerateReport}
                        disabled={loading}
                        className="flex-grow md:flex-grow-0 bg-accentCyan hover:bg-cyan-500 text-bgPrimary font-bold px-5 py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                        {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Generate
                    </button>
                </div>
            </div>

            {/* Main Report Output Render */}
            {report ? (
                <div className="flex flex-col gap-6 print:gap-4">

                    {/* Header metadata */}
                    <div className="glass-card rounded-xl p-6 border border-panelBorder bg-bgSecondary/30 flex justify-between items-start print:border-slate-300 print:bg-transparent">
                        <div>
                            <span className="text-[10px] text-accentCyan font-bold uppercase tracking-widest font-mono print:text-sky-700">COMPILING COMPLETE</span>
                            <h2 className="text-2xl font-extrabold font-outfit text-white print:text-black mt-2">NEXORA REPORT: {report.id}</h2>
                            <div className="flex items-center gap-4 text-xs text-textMuted mt-3 font-semibold print:text-slate-600">
                                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Scope: {report.scope.toUpperCase()}</span>
                                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Compiled: {report.generatedAt}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5 print:hidden">
                            <button
                                onClick={handleExportCSV}
                                className="w-10 h-10 rounded-lg border border-panelBorder hover:border-slate-600 bg-bgPrimary flex items-center justify-center text-textMuted hover:text-white transition-all"
                                title="Download CSV Table"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleExportPDF}
                                className="bg-slate-900 border border-panelBorder text-slate-200 px-4 py-2 rounded-lg text-xs font-semibold hover:border-slate-600 transition-all flex items-center gap-1.5"
                            >
                                Print Report / PDF
                            </button>
                        </div>
                    </div>

                    {/* Core metrics cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 print:grid-cols-4 print:gap-2">
                        {[
                            { label: 'Avg Occupancy', val: report.summary.average_headcount, item: Users },
                            { label: 'Peak Occupancy', val: report.summary.peak_headcount, item: Activity },
                            { label: 'Critical Anomalies', val: report.summary.critical_incidents_recorded, item: AlertTriangle, valColor: report.summary.critical_incidents_recorded > 0 ? 'text-statusRed' : '' },
                            { label: 'Device Coverage', val: report.summary.device_coverage_uptime, item: FileText }
                        ].map((st, idx) => (
                            <div key={idx} className="glass-card rounded-xl p-5 border border-panelBorder bg-bgSecondary/60 print:border-slate-300 print:bg-transparent">
                                <p className="text-[10px] text-textMuted uppercase tracking-wider font-semibold">{st.label}</p>
                                <div className="flex justify-between items-baseline mt-2">
                                    <h3 className={`text-2xl font-extrabold font-outfit text-white print:text-black ${st.valColor || ''}`}>{st.val}</h3>
                                    <st.item className="w-4 h-4 text-textMuted print:hidden" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Two-Column Details Container */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Telemetry Chronology Plot (2 portion) */}
                        <div className="lg:col-span-2 glass-card rounded-xl p-5 border border-panelBorder flex flex-col gap-4 print:border-slate-300">
                            <h3 className="font-outfit font-semibold text-white print:text-black">Telemetry Chronology Plot</h3>

                            {/* Density SVG Chart */}
                            <div className="h-48 bg-bgSecondary/40 border border-panelBorder rounded-lg p-4 flex items-center justify-center font-mono text-[10px] text-textMuted print:border-slate-350 print:bg-slate-50">
                                <svg className="w-full h-full" viewBox="0 0 400 150">
                                    <path
                                        d={`M 10,120 Q 80,${150 - (report.telemetry[2]?.avgCount || 60)} 150,${150 - (report.telemetry[Math.floor(report.telemetry.length / 2)]?.avgCount || 90)} T 300,${150 - (report.telemetry[report.telemetry.length - 2]?.avgCount || 50)} T 400,100`}
                                        fill="none"
                                        stroke="#00e5ff"
                                        strokeWidth="2.5"
                                    />
                                    <text x="15" y="145" fill="#64748b" fontSize="8">Start Horizon</text>
                                    <text x="350" y="145" fill="#64748b" fontSize="8">End Horizon</text>
                                </svg>
                            </div>

                            {/* Table details */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b border-panelBorder/70 text-textMuted font-bold uppercase tracking-wider print:border-slate-300">
                                            <th className="py-2.5 px-3">Timestamp (UTC)</th>
                                            <th className="py-2.5 px-3">Avg Count</th>
                                            <th className="py-2.5 px-3">Peak Count</th>
                                            <th className="py-2.5 px-3">Flow Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.telemetry.length === 0 ? (
                                            <tr>
                                                <td colSpan="4" className="py-6 text-center text-textMuted text-xs font-mono">
                                                    Insufficient real-time telemetry recorded for selected scope
                                                </td>
                                            </tr>
                                        ) : (
                                            report.telemetry.slice(0, 10).map((t, idx) => (
                                                <tr key={idx} className="border-b border-panelBorder/40 hover:bg-slate-900/20 print:border-slate-200">
                                                    <td className="py-2.5 px-3 font-mono text-slate-300 print:text-black">{t.timestamp}</td>
                                                    <td className="py-2.5 px-3 text-white print:text-black font-semibold">{t.avgCount}</td>
                                                    <td className="py-2.5 px-3 text-slate-350 print:text-slate-700">{t.peakCount}</td>
                                                    <td className="py-2.5 px-3 font-bold">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] ${t.status === 'HEAVY' ? 'bg-statusRed/10 text-statusRed' :
                                                            t.status === 'MODERATE' ? 'bg-statusYellow/10 text-statusYellow' :
                                                                'bg-statusGreen/10 text-statusGreen'
                                                            }`}>
                                                            {t.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Emergency Anomalies Log (1 portion) */}
                        <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col gap-4 print:border-slate-300">
                            <h3 className="font-outfit font-semibold text-white print:text-black">Compile Incident Logs</h3>
                            <div className="flex flex-col gap-4 overflow-y-auto max-h-[460px] pr-1">
                                {report.incidents.length === 0 ? (
                                    <p className="text-xs text-textMuted text-center my-6">No incidents flagged inside scope parameters.</p>
                                ) : (
                                    report.incidents.map((inc, index) => (
                                        <div
                                            key={index}
                                            className={`p-3 rounded-lg border text-xs flex flex-col gap-2 ${inc.severity === 'RED' ? 'bg-statusRed/5 border-statusRed/40' : 'bg-statusYellow/5 border-statusYellow/40'
                                                }`}
                                        >
                                            <div className="flex justify-between items-center font-mono">
                                                <span className={`font-bold ${inc.severity === 'RED' ? 'text-statusRed' : 'text-statusYellow'}`}>{inc.id}</span>
                                                <span className="text-[10px] text-textMuted">{inc.timestamp}</span>
                                            </div>
                                            <p className="font-semibold text-slate-200 print:text-black">{inc.details}</p>
                                            <div className="flex justify-between items-center text-[10px] text-textMuted mt-1">
                                                <span>Zone: {inc.location}</span>
                                                <span className="font-bold">Conf: {inc.confidence}%</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                    </div>

                </div>
            ) : (
                <div className="glass-card border border-dashed border-panelBorder rounded-xl p-16 text-center text-textMuted flex flex-col items-center justify-center gap-3">
                    <FileText className="w-12 h-12 text-slate-800" />
                    <div>
                        <h3 className="font-outfit font-bold text-white text-base">Analytical Compiled Logs</h3>
                        <p className="text-xs text-textMuted mt-1 max-w-sm">No report compiled for this session. Choose scope parameters above to compile historical sensor intercepts.</p>
                    </div>
                    <button
                        onClick={handleGenerateReport}
                        className="mt-2 bg-slate-900 border border-panelBorder hover:border-slate-700 text-slate-200 px-5.5 py-2.5 rounded-lg text-xs font-semibold transition-all"
                    >
                        Compile First Report
                    </button>
                </div>
            )}

        </div>
    );
}
