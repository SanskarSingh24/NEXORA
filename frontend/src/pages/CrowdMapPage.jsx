import React, { useState, useEffect, useRef } from 'react';
import { Shield, Eye, Settings, Video } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

// Layout elements
const entryGates = [{ x: 50, y: 250, name: "GATE_A" }, { x: 400, y: 40, name: "GATE_B" }];
const exitGates = [{ x: 750, y: 250, name: "EXIT_A" }, { x: 400, y: 460, name: "EXIT_B" }];
const restrictedZone = { x: 50, y: 50, width: 180, height: 120, label: "SECURE ZONE O-2" };

const initialCameras = [
    { id: "CAM-01", name: "Main Entrance Gateway", x: 150, y: 150, status: "ACTIVE", ip: "rtsp://10.0.1.50/stream1" },
    { id: "CAM-02", name: "South escalators corridor", x: 650, y: 150, status: "ACTIVE", ip: "rtsp://10.0.1.51/stream1" },
    { id: "CAM-03", name: "North Corridor LinkWAY", x: 250, y: 350, status: "ACTIVE", ip: "rtsp://10.0.1.52/stream1" },
    { id: "CAM-04", name: "Evacuation Tunnel 4", x: 550, y: 350, status: "INACTIVE", ip: "rtsp://10.0.2.20/stream2" }
];

export default function CrowdMapPage() {
    const canvasRef = useRef(null);
    const animationFrameId = useRef(null);
    const pedestriansRef = useRef([]);
    const previousPedestriansRef = useRef([]);
    const lastPacketTimeRef = useRef(Date.now());
    const localSimIntervalRef = useRef(null);

    const [showHeatmap, setShowHeatmap] = useState(true);
    const [showArrows, setShowArrows] = useState(true);
    const [showEvac, setShowEvac] = useState(true);
    const [simDensity, setSimDensity] = useState(50);
    const [selectedCam, setSelectedCam] = useState(null);

    const token = localStorage.getItem('nexora_token');
    const { status: socketStatus, data: wsData } = useWebSocket('ws://localhost:8000/ws/map', token);

    const crowdCount = wsData?.crowd_count ?? pedestriansRef.current.length;
    const riskLevel = wsData?.risk?.level ?? wsData?.risk_level ?? "LOW";

    // Initialize simulated pedestrians if WebSocket is disconnected
    useEffect(() => {
        // Local simulation seed data
        const dummyPedestrians = [];
        for (let i = 0; i < simDensity; i++) {
            const start = entryGates[Math.floor(Math.random() * entryGates.length)];
            const target = exitGates[Math.floor(Math.random() * exitGates.length)];
            dummyPedestrians.push({
                id: i,
                x: start.x + (Math.random() - 0.5) * 30,
                y: start.y + (Math.random() - 0.5) * 30,
                tx: target.x,
                ty: target.y,
                speed: 1.2 + Math.random() * 1.5,
                color: 'cyan'
            });
        }
        pedestriansRef.current = dummyPedestrians;
        previousPedestriansRef.current = dummyPedestrians.map(p => ({ ...p }));
        lastPacketTimeRef.current = Date.now();
    }, [simDensity]);

    // Synchronize WebSocket packet data
    useEffect(() => {
        if (socketStatus === 'Connected' && wsData && wsData.pedestrians) {
            previousPedestriansRef.current = [...pedestriansRef.current];
            pedestriansRef.current = wsData.pedestrians;
            lastPacketTimeRef.current = Date.now();
        }
    }, [wsData, socketStatus]);

    // Fallback simulator loop tick
    useEffect(() => {
        if (socketStatus !== 'Connected') {
            localSimIntervalRef.current = setInterval(() => {
                previousPedestriansRef.current = pedestriansRef.current.map(p => ({ ...p }));
                pedestriansRef.current = pedestriansRef.current.map(p => {
                    const dx = p.tx - p.x;
                    const dy = p.ty - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    const updated = { ...p };

                    if (dist < 15) {
                        const start = entryGates[Math.floor(Math.random() * entryGates.length)];
                        const target = exitGates[Math.floor(Math.random() * exitGates.length)];
                        updated.x = start.x + (Math.random() - 0.5) * 30;
                        updated.y = start.y + (Math.random() - 0.5) * 30;
                        updated.tx = target.x;
                        updated.ty = target.y;
                        updated.speed = 1.2 + Math.random() * 1.5;
                    } else {
                        updated.x += (dx / dist) * p.speed + (Math.random() - 0.5) * 0.8;
                        updated.y += (dy / dist) * p.speed + (Math.random() - 0.5) * 0.8;
                    }

                    // Check if trespassing restricted bounds
                    if (updated.x >= restrictedZone.x && updated.x <= (restrictedZone.x + restrictedZone.width) &&
                        updated.y >= restrictedZone.y && updated.y <= (restrictedZone.y + restrictedZone.height)) {
                        updated.color = 'red';
                    } else {
                        updated.color = 'cyan';
                    }

                    return updated;
                });
                lastPacketTimeRef.current = Date.now();
            }, 1000);
        } else {
            if (localSimIntervalRef.current) {
                clearInterval(localSimIntervalRef.current);
                localSimIntervalRef.current = null;
            }
        }

        return () => {
            if (localSimIntervalRef.current) {
                clearInterval(localSimIntervalRef.current);
            }
        };
    }, [socketStatus]);

    // 60FPS Canvas Animation Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const getInterpolatedPedestrians = (prevMap) => {
            const now = Date.now();
            const progress = Math.min((now - lastPacketTimeRef.current) / 1000.0, 1.0);

            return pedestriansRef.current.map(current => {
                const prev = prevMap[current.id] || current;
                return {
                    id: current.id,
                    x: prev.x + (current.x - prev.x) * progress,
                    y: prev.y + (current.y - prev.y) * progress,
                    color: current.color
                };
            });
        };

        const drawVenueLayout = () => {
            // Background Clear
            ctx.fillStyle = '#030509';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Grid Pattern
            ctx.strokeStyle = 'rgba(30, 41, 75, 0.15)';
            ctx.lineWidth = 1;
            const gridSize = 40;
            for (let x = 0; x < canvas.width; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }

            // Base Corridor Outlines
            ctx.strokeStyle = '#1e294b';
            ctx.lineWidth = 30;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Draw Main Corridor Line
            ctx.beginPath();
            ctx.moveTo(50, 250);
            ctx.lineTo(750, 250);
            ctx.stroke();

            // Draw Connecting Corridor Line
            ctx.beginPath();
            ctx.moveTo(400, 40);
            ctx.lineTo(400, 460);
            ctx.stroke();

            // Restricted Zone Overlay
            ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
            ctx.fillRect(restrictedZone.x, restrictedZone.y, restrictedZone.width, restrictedZone.height);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(restrictedZone.x, restrictedZone.y, restrictedZone.width, restrictedZone.height);

            // Warning Lines inside Restricted Zone
            ctx.save();
            ctx.beginPath();
            ctx.rect(restrictedZone.x, restrictedZone.y, restrictedZone.width, restrictedZone.height);
            ctx.clip();
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.12)';
            ctx.lineWidth = 1;
            for (let i = -100; i < restrictedZone.width + 100; i += 12) {
                ctx.beginPath();
                ctx.moveTo(restrictedZone.x + i, restrictedZone.y);
                ctx.lineTo(restrictedZone.x + i + 100, restrictedZone.y + restrictedZone.height);
                ctx.stroke();
            }
            ctx.restore();

            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 8px "JetBrains Mono"';
            ctx.textAlign = 'left';
            ctx.fillText(restrictedZone.label, restrictedZone.x + 8, restrictedZone.y + 15);

            // Entry/Exit Gates Draw
            entryGates.forEach(g => {
                ctx.fillStyle = '#0b0f1e';
                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(g.x, g.y, 14, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#10b981';
                ctx.font = 'bold 8px "Inter"';
                ctx.textAlign = 'center';
                ctx.fillText("IN", g.x, g.y + 3);
            });

            exitGates.forEach(g => {
                ctx.fillStyle = '#0b0f1e';
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(g.x, g.y, 14, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#ef4444';
                ctx.font = 'bold 8px "Inter"';
                ctx.textAlign = 'center';
                ctx.fillText("OUT", g.x, g.y + 3);
            });
        };

        const drawHeatmap = (peds) => {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            peds.forEach(p => {
                const gradient = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 35);
                gradient.addColorStop(0, 'rgba(239, 68, 68, 0.44)');
                gradient.addColorStop(0.3, 'rgba(245, 158, 11, 0.22)');
                gradient.addColorStop(1, 'rgba(3, 5, 9, 0)');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 35, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        };

        const drawArrows = (peds, prevMap) => {
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
            ctx.lineWidth = 1.5;

            peds.forEach(p => {
                const prev = prevMap[p.id];
                if (!prev) return;

                const dx = p.x - prev.x;
                const dy = p.y - prev.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 1.2) {
                    const size = 8;
                    const vx = (dx / dist) * size;
                    const vy = (dy / dist) * size;

                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x + vx, p.y + vy);
                    ctx.stroke();
                }
            });
        };

        const drawParticles = (peds) => {
            peds.forEach(p => {
                ctx.fillStyle = p.color === 'red' ? '#ef4444' : '#00e5ff';
                ctx.shadowColor = p.color === 'red' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(0, 229, 255, 0.4)';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            });
        };

        const drawEvacPaths = () => {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'round';
            ctx.setLineDash([8, 12]);

            const offset = (Date.now() / 40) % 20;
            ctx.lineDashOffset = -offset;

            ctx.beginPath();
            ctx.moveTo(350, 250);
            ctx.lineTo(750, 250);
            ctx.stroke();

            ctx.setLineDash([]);
        };

        const drawSensors = () => {
            initialCameras.forEach(cam => {
                ctx.fillStyle = '#0b0f1e';
                ctx.strokeStyle = '#0066ff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(cam.x, cam.y, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#00e5ff';
                ctx.beginPath();
                ctx.arc(cam.x, cam.y, 3.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#e2e8f0';
                ctx.font = 'bold 8px "JetBrains Mono"';
                ctx.textAlign = 'center';
                ctx.fillText(cam.id, cam.x, cam.y - 14);
            });
        };

        const loop = () => {
            const prevMap = {};
            previousPedestriansRef.current.forEach(p => {
                prevMap[p.id] = p;
            });

            const interpolated = getInterpolatedPedestrians(prevMap);

            drawVenueLayout();

            if (showHeatmap) {
                drawHeatmap(interpolated);
            }
            if (showEvac) {
                drawEvacPaths();
            }
            if (showArrows) {
                drawArrows(interpolated, prevMap);
            }

            drawParticles(interpolated);
            drawSensors();

            animationFrameId.current = requestAnimationFrame(loop);
        };

        loop();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [showHeatmap, showArrows, showEvac]);

    // Click detector inside canvas to open live feeds
    const handleCanvasClick = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

        for (let cam of initialCameras) {
            const dist = Math.sqrt((clickX - cam.x) ** 2 + (clickY - cam.y) ** 2);
            if (dist < 18) {
                setSelectedCam(cam);
                return;
            }
        }
    };

    return (
        <div className="p-8 flex flex-col md:flex-row gap-8 h-full overflow-hidden">

            {/* 2D Map Workspace on Left */}
            <div className="flex-grow flex flex-col gap-6">

                <div className="glass-card rounded-xl p-5 border border-panelBorder bg-bgSecondary/60 flex justify-between items-center">
                    <div>
                        <h2 className="font-outfit font-extrabold text-xl text-white">Spatial Intercept coordinates Map</h2>
                        <p className="text-xs text-textMuted mt-1">Tracks live pedestrian particles matching camera coverage regions.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${socketStatus === 'Connected' ? 'bg-statusGreen shadow-[0_0_8px_#10b981]' : 'bg-statusRed shadow-[0_0_8px_#ef4444]'}`}></span>
                        <span className="text-xs font-mono font-bold tracking-wider text-textMuted">
                            {socketStatus === 'Connected' ? 'LIVE DEPLOYED' : 'LOCAL SIMULATOR'}
                        </span>
                    </div>
                </div>

                {/* The Map Target Canvas */}
                <div className="flex-grow rounded-xl relative overflow-hidden border border-panelBorder bg-[#030509] flex items-center justify-center p-2 shadow-inner">
                    <canvas
                        ref={canvasRef}
                        width="800"
                        height="500"
                        onClick={handleCanvasClick}
                        className="w-full max-w-[800px] h-auto block rounded-lg cursor-pointer"
                    />

                    {/* Camera preview popup overlay */}
                    {selectedCam && (
                        <div className="absolute bottom-6 right-6 w-72 bg-bgSecondary/95 border border-accentCyan rounded-xl p-4 shadow-[0_0_15px_rgba(0,229,255,0.25)] backdrop-blur">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-xs text-accentCyan font-bold uppercase tracking-widest font-mono flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-statusGreen rounded-full animate-ping"></span>
                                    {selectedCam.id} LIVE FEED
                                </span>
                                <button onClick={() => setSelectedCam(null)} className="text-textMuted text-xs hover:text-white">Close</button>
                            </div>
                            <div className="h-32 rounded bg-black relative flex items-center justify-center border border-panelBorder overflow-hidden">
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
                                <span className="text-xs text-statusGreen font-mono uppercase tracking-wider animate-pulse flex items-center gap-1">
                                    <Video className="w-3.5 h-3.5" /> analyzing rtsp stream
                                </span>
                            </div>
                            <p className="text-[10px] text-textMuted mt-2.5 font-mono uppercase">Zone: {selectedCam.name} ({selectedCam.ip})</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Control Configuration Panel on Right */}
            <div className="w-full md:w-80 flex flex-col gap-6">

                {/* Toggle Widgets Box */}
                <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col gap-4">
                    <h3 className="font-outfit font-semibold text-white">Visual Layer Overlay Controls</h3>

                    <div className="flex flex-col gap-2.5">
                        <button
                            onClick={() => setShowHeatmap(!showHeatmap)}
                            className={`w-full flex justify-between items-center p-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${showHeatmap
                                ? 'bg-slate-900 border-accentCyan text-accentCyan shadow-[0_0_8px_rgba(0,229,255,0.1)]'
                                : 'bg-bgSecondary/30 border-panelBorder text-textMuted hover:border-slate-800'
                                }`}
                        >
                            <span>Heatmap density</span>
                            <span>{showHeatmap ? 'ENABLED' : 'DISABLED'}</span>
                        </button>

                        <button
                            onClick={() => setShowArrows(!showArrows)}
                            className={`w-full flex justify-between items-center p-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${showArrows
                                ? 'bg-slate-900 border-accentCyan text-accentCyan shadow-[0_0_8px_rgba(0,229,255,0.1)]'
                                : 'bg-bgSecondary/30 border-panelBorder text-textMuted hover:border-slate-800'
                                }`}
                        >
                            <span>Directional vectors</span>
                            <span>{showArrows ? 'VISIBLE' : 'HIDDEN'}</span>
                        </button>

                        <button
                            onClick={() => setShowEvac(!showEvac)}
                            className={`w-full flex justify-between items-center p-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${showEvac
                                ? 'bg-slate-900 border-accentCyan text-accentCyan shadow-[0_0_8px_rgba(0,229,255,0.1)]'
                                : 'bg-bgSecondary/30 border-panelBorder text-textMuted hover:border-slate-800'
                                }`}
                        >
                            <span>Evacuation paths</span>
                            <span>{showEvac ? 'ACTIVE' : 'INACTIVE'}</span>
                        </button>
                    </div>
                </div>

                {/* Local simulated parameters */}
                {socketStatus !== 'Connected' && (
                    <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col gap-4">
                        <h3 className="font-outfit font-semibold text-white">Local Simulation parameters</h3>

                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between text-xs font-bold text-textMuted uppercase">
                                <span>Simulator Density</span>
                                <span className="text-accentCyan">{simDensity} Peds</span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="100"
                                value={simDensity}
                                onChange={(e) => setSimDensity(parseInt(e.target.value))}
                                className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-accentCyan"
                            />
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                            * Active since the main WebSocket coordinator interface is offline. Sliding parameters triggers hot particle updates.
                        </p>
                    </div>
                )}

                {/* System metrics summaries */}
                <div className="glass-card rounded-xl p-5 border border-panelBorder flex flex-col gap-4 bg-bgSecondary/30">
                    <h3 className="font-outfit font-semibold text-white">Console telemetry</h3>
                    <div className="flex flex-col gap-2.5 font-mono text-xs text-textMuted">
                        <div className="flex justify-between">
                            <span>Active Tracking:</span>
                            <span className="text-white font-bold">{crowdCount} Persons</span>
                        </div>
                        <div className="flex justify-between">
                            <span>System Risk level:</span>
                            <span className={`font-bold ${riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'text-statusRed' : 'text-[#00e5ff]'}`}>
                                {riskLevel}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Registered Nodes:</span>
                            <span className="text-white font-bold">4 Cameras</span>
                        </div>
                    </div>
                </div>

            </div>

        </div>
    );
}
