import React, { useRef, useState } from 'react';
import {
  SimulationMetrics,
  SimulationParams,
  WaveformPoint,
} from '../engine/rectifierEngine';

interface OscilloscopeViewProps {
  params: SimulationParams;
  points: WaveformPoint[];
  metrics: SimulationMetrics;
  cursorDeg: number;
  onCursorChange: (deg: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

export const OscilloscopeView: React.FC<OscilloscopeViewProps> = ({
  params,
  points,
  metrics,
  cursorDeg,
  onCursorChange,
  isPlaying,
  onTogglePlay,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showLineEnvelopes, setShowLineEnvelopes] = useState(true);
  const [showSourceCurrent, setShowSourceCurrent] = useState(true);
  const [showSwitchVoltage, setShowSwitchVoltage] = useState(true);
  const [cycleSpan, setCycleSpan] = useState<360 | 720>(720);

  // SVG coordinate system geometry
  const W = 920;
  const H = 500;
  const PAD_L = 58;
  const PAD_R = 24;
  const plotW = W - PAD_L - PAD_R;

  // 3 Stacked Channel Tracks + Bottom Conduction Strip
  // Track 1: Voltage vo(wt) & Source Envelopes (y: 22..192, mid: 107)
  const T1_TOP = 22;
  const T1_BOT = 192;
  const T1_MID = (T1_TOP + T1_BOT) / 2;
  const T1_HALF = (T1_BOT - T1_TOP) / 2 - 10;

  // Track 2: Currents io(wt), ia(wt), ifw(wt) (y: 214..334, mid: 274)
  const T2_TOP = 214;
  const T2_BOT = 334;
  const T2_MID = (T2_TOP + T2_BOT) / 2;
  const T2_HALF = (T2_BOT - T2_TOP) / 2 - 8;

  // Track 3: Switch Voltage v_T1(wt) & Gate Pulses ig(wt) (y: 356..440, mid: 398)
  const T3_TOP = 356;
  const T3_BOT = 440;
  const T3_MID = (T3_TOP + T3_BOT) / 2;
  const T3_HALF = (T3_BOT - T3_TOP) / 2 - 6;

  // Conduction Sequence Bar (y: 454..478)
  const COND_Y = 454;
  const COND_H = 22;

  const visiblePoints = points.filter((p) => p.deg <= cycleSpan);
  const vPeakScale = Math.max(
    params.phases === '3p' && params.waveType === 'full' ? Math.sqrt(3) * params.Vm : params.Vm,
    10
  );

  // Current scale
  const maxCurrent = Math.max(
    ...visiblePoints.map((p) => Math.max(Math.abs(p.io), Math.abs(p.ia))),
    1
  );

  const degToX = (deg: number) => PAD_L + (deg / cycleSpan) * plotW;
  const vToY1 = (v: number) => T1_MID - (v / vPeakScale) * T1_HALF;
  const iToY2 = (i: number) => T2_MID - (i / maxCurrent) * T2_HALF;
  const vToY3 = (v: number) => T3_MID - (v / vPeakScale) * T3_HALF;

  const buildPolyline = (yGetter: (pt: WaveformPoint) => number) =>
    visiblePoints.map((pt) => `${degToX(pt.deg).toFixed(1)},${yGetter(pt).toFixed(1)}`).join(' ');

  // Build closed polygon for Vo area fill relative to T1_MID (0V)
  const voAreaPoints = [
    `${degToX(0).toFixed(1)},${T1_MID.toFixed(1)}`,
    ...visiblePoints.map((pt) => `${degToX(pt.deg).toFixed(1)},${vToY1(pt.vo).toFixed(1)}`),
    `${degToX(cycleSpan).toFixed(1)},${T1_MID.toFixed(1)}`,
  ].join(' ');

  // Pointer scrubbing handler
  const updateCursorFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const clampedX = Math.min(Math.max(relX, PAD_L), W - PAD_R);
    const deg = Math.round(((clampedX - PAD_L) / plotW) * cycleSpan);
    onCursorChange(deg);
  };

  const activeCursorDeg = Math.min(cursorDeg, cycleSpan);
  const cursorX = degToX(activeCursorDeg);
  const cursorPoint = visiblePoints[Math.min(activeCursorDeg, visiblePoints.length - 1)] || visiblePoints[0];

  const degreeTicks =
    cycleSpan === 720
      ? [0, 90, 180, 270, 360, 450, 540, 630, 720]
      : [0, 45, 90, 135, 180, 225, 270, 315, 360];

  // Segment conduction intervals for the bottom bar
  const conductionSegments: { startDeg: number; endDeg: number; label: string; isFw: boolean }[] = [];
  for (let i = 0; i < visiblePoints.length - 1; i++) {
    const pt = visiblePoints[i];
    const lbl = pt.activeDevices.length > 0 ? pt.activeDevices.join('+') : 'OFF';
    const isFw = pt.activeDevices.includes('Dfw');
    const prev = conductionSegments[conductionSegments.length - 1];
    if (prev && prev.label === lbl) {
      prev.endDeg = visiblePoints[i + 1].deg;
    } else {
      conductionSegments.push({
        startDeg: pt.deg,
        endDeg: visiblePoints[i + 1].deg,
        label: lbl,
        isFw,
      });
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#111827] border border-slate-800 rounded-lg overflow-hidden">
      {/* Oscilloscope Toolbar Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800 bg-[#0B0E17]/60">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">
            Multi-Channel Harmonic Oscilloscope
          </h2>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="font-mono text-xs text-slate-400">
            {metrics.pulseNumber}-Pulse Waveform · {params.freq} Hz
          </span>
        </div>

        {/* Channel & Timebase Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Play / Pause Button */}
          <button
            type="button"
            onClick={onTogglePlay}
            className={`px-2.5 py-1 text-xs font-mono font-medium rounded border transition-colors whitespace-nowrap ${
              isPlaying
                ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300'
                : 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
            }`}
          >
            {isPlaying ? '❚❚ Freeze Scope' : '▶ Run Sweep'}
          </button>

          {/* Timebase Span Selector */}
          <div className="flex items-center bg-[#0B0E17] p-0.5 rounded border border-slate-800">
            <button
              type="button"
              onClick={() => setCycleSpan(360)}
              className={`px-2 py-0.5 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                cycleSpan === 360 ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1 Cycle (360°)
            </button>
            <button
              type="button"
              onClick={() => setCycleSpan(720)}
              className={`px-2 py-0.5 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                cycleSpan === 720 ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2 Cycles (720°)
            </button>
          </div>

          {/* Trace Layer Toggles */}
          <button
            type="button"
            onClick={() => setShowLineEnvelopes((v) => !v)}
            className={`px-2 py-1 text-xs font-mono rounded border transition-colors whitespace-nowrap ${
              showLineEnvelopes
                ? 'border-slate-700 bg-slate-800 text-slate-200'
                : 'border-slate-800 bg-transparent text-slate-500'
            }`}
          >
            AC Envelope
          </button>
          <button
            type="button"
            onClick={() => setShowSourceCurrent((v) => !v)}
            className={`px-2 py-1 text-xs font-mono rounded border transition-colors whitespace-nowrap ${
              showSourceCurrent
                ? 'border-slate-700 bg-slate-800 text-emerald-300'
                : 'border-slate-800 bg-transparent text-slate-500'
            }`}
          >
            ia(ωt)
          </button>
          <button
            type="button"
            onClick={() => setShowSwitchVoltage((v) => !v)}
            className={`px-2 py-1 text-xs font-mono rounded border transition-colors whitespace-nowrap ${
              showSwitchVoltage
                ? 'border-slate-700 bg-slate-800 text-rose-300'
                : 'border-slate-800 bg-transparent text-slate-500'
            }`}
          >
            v_Switch
          </button>
        </div>
      </div>

      {/* Oscilloscope Interactive SVG Stage */}
      <div className="relative flex-1 bg-[#070A12] p-2 select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full cursor-crosshair"
          onMouseDown={(e) => {
            setIsDragging(true);
            updateCursorFromEvent(e);
          }}
          onMouseMove={(e) => {
            if (isDragging) {
              updateCursorFromEvent(e);
            }
          }}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          <defs>
            <linearGradient id="voFillGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.28" />
              <stop offset="50%" stopColor="#06B6D4" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Vertical Angle Grid Lines & Labels */}
          {degreeTicks.map((deg) => {
            const x = degToX(deg);
            return (
              <g key={deg}>
                <line
                  x1={x}
                  y1={T1_TOP}
                  x2={x}
                  y2={COND_Y + COND_H}
                  stroke={deg % 180 === 0 ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.08)'}
                  strokeWidth={1}
                  strokeDasharray={deg % 180 === 0 ? undefined : '3 3'}
                />
                <text
                  x={x}
                  y={H - 5}
                  textAnchor="middle"
                  fill="#64748B"
                  className="font-mono text-[10px]"
                >
                  {deg}°
                </text>
              </g>
            );
          })}

          {/* =================================================================
              TRACK 1: SOURCE & RECTIFIED OUTPUT VOLTAGE vo(wt)
             ================================================================= */}
          <rect
            x={PAD_L}
            y={T1_TOP}
            width={plotW}
            height={T1_BOT - T1_TOP}
            fill="rgba(15, 23, 42, 0.35)"
            stroke="#1E293B"
            strokeWidth={1}
          />
          {/* Zero Voltage Line */}
          <line
            x1={PAD_L}
            y1={T1_MID}
            x2={W - PAD_R}
            y2={T1_MID}
            stroke="#334155"
            strokeWidth={1.2}
          />
          {/* Y-Axis Labels for Track 1 */}
          <text x={PAD_L - 8} y={T1_TOP + 12} textAnchor="end" fill="#06B6D4" className="font-mono text-[10px] font-semibold">
            +{vPeakScale.toFixed(0)}V
          </text>
          <text x={PAD_L - 8} y={T1_MID + 4} textAnchor="end" fill="#64748B" className="font-mono text-[10px]">
            0V
          </text>
          <text x={PAD_L - 8} y={T1_BOT - 4} textAnchor="end" fill="#64748B" className="font-mono text-[10px]">
            −{vPeakScale.toFixed(0)}V
          </text>
          <text x={PAD_L + 8} y={T1_TOP + 14} fill="#06B6D4" className="font-mono text-[11px] font-semibold">
            CH1 · Output Voltage vo(ωt) & AC Supply Reference
          </text>

          {/* Background AC Supply Envelopes */}
          {showLineEnvelopes && (
            <g>
              {params.phases === '1p' && (
                <>
                  <polyline
                    points={buildPolyline((p) => vToY1(p.va))}
                    fill="none"
                    stroke="rgba(56, 189, 248, 0.32)"
                    strokeWidth={1.3}
                    strokeDasharray="4 4"
                  />
                  {params.waveType === 'full' && (
                    <polyline
                      points={buildPolyline((p) => vToY1(-p.va))}
                      fill="none"
                      stroke="rgba(244, 63, 94, 0.25)"
                      strokeWidth={1.2}
                      strokeDasharray="3 4"
                    />
                  )}
                </>
              )}

              {params.phases === '3p' && params.waveType === 'half' && (
                <>
                  <polyline
                    points={buildPolyline((p) => vToY1(p.va))}
                    fill="none"
                    stroke="rgba(56, 189, 248, 0.38)"
                    strokeWidth={1.3}
                    strokeDasharray="4 3"
                  />
                  <polyline
                    points={buildPolyline((p) => vToY1(p.vb))}
                    fill="none"
                    stroke="rgba(251, 191, 36, 0.38)"
                    strokeWidth={1.3}
                    strokeDasharray="4 3"
                  />
                  <polyline
                    points={buildPolyline((p) => vToY1(p.vc))}
                    fill="none"
                    stroke="rgba(244, 63, 94, 0.38)"
                    strokeWidth={1.3}
                    strokeDasharray="4 3"
                  />
                </>
              )}

              {params.phases === '3p' && params.waveType === 'full' && (
                <>
                  {(['vab', 'vac', 'vbc', 'vba', 'vca', 'vcb'] as const).map((key, idx) => (
                    <polyline
                      key={key}
                      points={buildPolyline((p) => vToY1(p[key]))}
                      fill="none"
                      stroke={idx % 2 === 0 ? 'rgba(148, 163, 184, 0.28)' : 'rgba(100, 116, 139, 0.24)'}
                      strokeWidth={1.2}
                      strokeDasharray="3 3"
                    />
                  ))}
                </>
              )}
            </g>
          )}

          {/* Shaded Area under Output Voltage vo(wt) */}
          <polygon points={voAreaPoints} fill="url(#voFillGrad)" />

          {/* Average DC Voltage (Vdc) Reference Line */}
          <line
            x1={PAD_L}
            y1={vToY1(metrics.Vdc)}
            x2={W - PAD_R}
            y2={vToY1(metrics.Vdc)}
            stroke="#38BDF8"
            strokeWidth={1.3}
            strokeDasharray="6 4"
          />
          <text
            x={W - PAD_R - 6}
            y={vToY1(metrics.Vdc) - 5}
            textAnchor="end"
            fill="#38BDF8"
            className="font-mono text-[10px] font-semibold"
          >
            Vdc = {metrics.Vdc.toFixed(1)}V
          </text>

          {/* Primary Instantaneous Output Voltage Trace vo(wt) */}
          <polyline
            points={buildPolyline((p) => vToY1(p.vo))}
            fill="none"
            stroke="#06B6D4"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />

          {/* =================================================================
              TRACK 2: LOAD CURRENT io(wt) & SOURCE CURRENT ia(wt)
             ================================================================= */}
          <rect
            x={PAD_L}
            y={T2_TOP}
            width={plotW}
            height={T2_BOT - T2_TOP}
            fill="rgba(15, 23, 42, 0.35)"
            stroke="#1E293B"
            strokeWidth={1}
          />
          <line
            x1={PAD_L}
            y1={T2_MID}
            x2={W - PAD_R}
            y2={T2_MID}
            stroke="#334155"
            strokeWidth={1.2}
          />
          <text x={PAD_L - 8} y={T2_TOP + 12} textAnchor="end" fill="#F59E0B" className="font-mono text-[10px] font-semibold">
            +{maxCurrent.toFixed(1)}A
          </text>
          <text x={PAD_L - 8} y={T2_MID + 4} textAnchor="end" fill="#64748B" className="font-mono text-[10px]">
            0A
          </text>
          <text x={PAD_L - 8} y={T2_BOT - 4} textAnchor="end" fill="#10B981" className="font-mono text-[10px]">
            −{maxCurrent.toFixed(1)}A
          </text>
          <text x={PAD_L + 8} y={T2_TOP + 14} fill="#F59E0B" className="font-mono text-[11px] font-semibold">
            CH2 · Load Current io(ωt) [Amber] {showSourceCurrent ? '& Source Current ia(ωt) [Emerald]' : ''}
          </text>

          {/* Source Phase A Current ia(wt) */}
          {showSourceCurrent && (
            <polyline
              points={buildPolyline((p) => iToY2(p.ia))}
              fill="none"
              stroke="#10B981"
              strokeWidth={1.6}
              strokeDasharray="3 2"
            />
          )}

          {/* Freewheeling Diode Current ifw(wt) if active */}
          {params.freewheelingDiode && (
            <polyline
              points={buildPolyline((p) => iToY2(p.ifw))}
              fill="none"
              stroke="#A855F7"
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          )}

          {/* Load Current io(wt) */}
          <polyline
            points={buildPolyline((p) => iToY2(p.io))}
            fill="none"
            stroke="#F59E0B"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />

          {/* =================================================================
              TRACK 3: SWITCH VOLTAGE v_T1(wt) & GATE PULSES ig(wt)
             ================================================================= */}
          <rect
            x={PAD_L}
            y={T3_TOP}
            width={plotW}
            height={T3_BOT - T3_TOP}
            fill="rgba(15, 23, 42, 0.35)"
            stroke="#1E293B"
            strokeWidth={1}
          />
          <line
            x1={PAD_L}
            y1={T3_MID}
            x2={W - PAD_R}
            y2={T3_MID}
            stroke="#334155"
            strokeWidth={1}
          />
          <text x={PAD_L - 8} y={T3_TOP + 12} textAnchor="end" fill="#F43F5E" className="font-mono text-[10px]">
            +{vPeakScale.toFixed(0)}V
          </text>
          <text x={PAD_L - 8} y={T3_MID + 4} textAnchor="end" fill="#64748B" className="font-mono text-[10px]">
            0V
          </text>
          <text x={PAD_L - 8} y={T3_BOT - 4} textAnchor="end" fill="#F43F5E" className="font-mono text-[10px]">
            −{vPeakScale.toFixed(0)}V
          </text>
          <text x={PAD_L + 8} y={T3_TOP + 13} fill="#F43F5E" className="font-mono text-[11px] font-semibold">
            CH3 · Switch Blocking Voltage v_{params.deviceType === 'scr' ? 'T1' : 'D1'}(ωt) {params.deviceType === 'scr' ? '& Gate Firing Pulses ig(ωt)' : ''}
          </text>

          {/* Switch Blocking Voltage v_Switch1 */}
          {showSwitchVoltage && (
            <polyline
              points={buildPolyline((p) => vToY3(p.vSwitch1))}
              fill="none"
              stroke="#F43F5E"
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
          )}

          {/* SCR Gate Trigger Pulses ig(wt) */}
          {params.deviceType === 'scr' && (
            <polyline
              points={buildPolyline((p) => T3_MID - p.gatePulse * (T3_HALF * 0.85))}
              fill="none"
              stroke="#10B981"
              strokeWidth={2}
            />
          )}

          {/* =================================================================
              BOTTOM TRACK: SYNCHRONIZED CONDUCTION SEQUENCE BAR
             ================================================================= */}
          <text
            x={PAD_L - 8}
            y={COND_Y + 15}
            textAnchor="end"
            fill="#94A3B8"
            className="font-mono text-[10px] font-semibold"
          >
            ACTIVE
          </text>
          {conductionSegments.map((seg, i) => {
            const x1 = degToX(seg.startDeg);
            const x2 = degToX(seg.endDeg);
            const segW = Math.max(x2 - x1, 1);
            const isOff = seg.label === 'OFF';
            return (
              <g key={i}>
                <rect
                  x={x1}
                  y={COND_Y}
                  width={segW}
                  height={COND_H}
                  fill={
                    isOff
                      ? 'rgba(30, 41, 59, 0.5)'
                      : seg.isFw
                        ? 'rgba(245, 158, 11, 0.22)'
                        : 'rgba(6, 182, 212, 0.2)'
                  }
                  stroke="#1E293B"
                  strokeWidth={1}
                />
                {segW > 28 && (
                  <text
                    x={x1 + segW / 2}
                    y={COND_Y + 14}
                    textAnchor="middle"
                    fill={isOff ? '#64748B' : seg.isFw ? '#FBBF24' : '#22D3EE'}
                    className="font-mono text-[10px] font-semibold"
                  >
                    {seg.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* =================================================================
              INTERACTIVE PHASE CURSOR CROSSHAIR (ωt)
             ================================================================= */}
          <g className="pointer-events-none">
            <line
              x1={cursorX}
              y1={T1_TOP}
              x2={cursorX}
              y2={COND_Y + COND_H}
              stroke="#F8FAFC"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            {/* Dots on each trace at cursor */}
            <circle cx={cursorX} cy={vToY1(cursorPoint.vo)} r={4.5} fill="#06B6D4" stroke="#0B0E17" strokeWidth={1.5} />
            <circle cx={cursorX} cy={iToY2(cursorPoint.io)} r={4.5} fill="#F59E0B" stroke="#0B0E17" strokeWidth={1.5} />
            {showSwitchVoltage && (
              <circle cx={cursorX} cy={vToY3(cursorPoint.vSwitch1)} r={4} fill="#F43F5E" stroke="#0B0E17" strokeWidth={1.5} />
            )}

            {/* Floating Angle Badge at Top of Crosshair */}
            <rect
              x={Math.min(Math.max(cursorX - 42, PAD_L), W - PAD_R - 84)}
              y={4}
              width={84}
              height={16}
              rx={3}
              fill="#06B6D4"
            />
            <text
              x={Math.min(Math.max(cursorX, PAD_L + 42), W - PAD_R - 42)}
              y={15}
              textAnchor="middle"
              fill="#0B0E17"
              className="font-mono text-[10px] font-bold"
            >
              ωt = {activeCursorDeg}°
            </text>
          </g>
        </svg>
      </div>

      {/* Interactive Phase Angle Scrubber Bar */}
      <div className="px-4 py-2.5 border-t border-slate-800 bg-[#0B0E17]/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <label
            htmlFor="phase-cursor-slider"
            className="text-xs font-mono text-slate-300 whitespace-nowrap"
          >
            Phase Angle Probe (ωt): <strong className="text-cyan-400">{activeCursorDeg}°</strong>
          </label>
          <input
            id="phase-cursor-slider"
            type="range"
            min={0}
            max={cycleSpan}
            step={1}
            value={activeCursorDeg}
            onChange={(e) => onCursorChange(Number(e.target.value))}
            className="flex-1"
          />
        </div>

        {/* Instantaneous Cursor Readout */}
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-300">
          <span>
            Va: <strong>{cursorPoint.va.toFixed(0)}V</strong>
          </span>
          {params.phases === '3p' && (
            <>
              <span>
                Vb: <strong>{cursorPoint.vb.toFixed(0)}V</strong>
              </span>
              <span>
                Vc: <strong>{cursorPoint.vc.toFixed(0)}V</strong>
              </span>
            </>
          )}
          <span className="text-slate-600">·</span>
          <span className="text-cyan-400">
            Vo: <strong>{cursorPoint.vo.toFixed(1)}V</strong>
          </span>
          <span className="text-amber-400">
            Io: <strong>{cursorPoint.io.toFixed(2)}A</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
