import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircuitSchematic } from './components/CircuitSchematic';
import { HarmonicAndMatrixPanel } from './components/HarmonicAndMatrixPanel';
import { OscilloscopeView } from './components/OscilloscopeView';
import {
  DeviceType,
  LoadType,
  PhaseCount,
  runRectifierSimulation,
  SimulationParams,
  WaveType,
} from './engine/rectifierEngine';

const DEFAULT_PARAMS: SimulationParams = {
  phases: '1p',
  waveType: 'full',
  deviceType: 'scr',
  loadType: 'RL',
  freewheelingDiode: false,
  Vm: 325, // ~230V RMS standard supply peak
  freq: 50,
  alphaDeg: 45,
  R: 20,
  L_mH: 45,
};

export default function App() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [cursorDeg, setCursorDeg] = useState<number>(65);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [animSpeed, setAnimSpeed] = useState<number>(1); // 0.5x, 1x, 2x
  const [bottomTab, setBottomTab] = useState<'harmonics' | 'matrix' | 'theory'>('matrix');

  const bottomPanelRef = useRef<HTMLDivElement | null>(null);

  // Run steady-state power electronics simulation whenever parameters change
  const simResult = useMemo(() => runRectifierSimulation(params), [params]);
  const { points, metrics, harmonics } = simResult;

  // Animation loop advancing phase angle cursor ωt (0° -> 720°)
  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = now - lastTime;
      if (dt >= 22) {
        const degIncrement = Math.max(1, Math.round(animSpeed * 2));
        setCursorDeg((prev) => (prev + degIncrement) % 720);
        lastTime = now;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, animSpeed]);

  const updateParam = <K extends keyof SimulationParams>(
    key: K,
    value: SimulationParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const handlePatchTopology = (patch: Partial<SimulationParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  };

  const handleResetDefaults = () => {
    setParams(DEFAULT_PARAMS);
    setCursorDeg(65);
    setIsPlaying(true);
  };

  const handleExportCsv = () => {
    const headers = [
      'Angle_deg',
      'Va_V',
      'Vb_V',
      'Vc_V',
      'Vo_V',
      'Io_A',
      'Ia_A',
      'V_Switch1_V',
      'Active_Devices',
    ];
    const rows = points.map((p) =>
      [
        p.deg.toFixed(0),
        p.va.toFixed(2),
        p.vb.toFixed(2),
        p.vc.toFixed(2),
        p.vo.toFixed(2),
        p.io.toFixed(3),
        p.ia.toFixed(3),
        p.vSwitch1.toFixed(2),
        `"${p.activeDevices.join('+') || 'OFF'}"`,
      ].join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rectilab_${params.phases}_${params.waveType}_${params.deviceType}_alpha${params.alphaDeg}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const navigateToBottomTab = (tab: 'harmonics' | 'matrix' | 'theory') => {
    setBottomTab(tab);
    bottomPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const currentPoint =
    points[Math.min(Math.max(0, Math.round(cursorDeg)), points.length - 1)] || points[0];

  const maxAlpha = params.phases === '3p' && params.waveType === 'half' ? 150 : 165;

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E17] text-slate-100">
      {/* =====================================================================
          TOP BAR CONTRACT (Strict 3-Zone Header: Brand | 4 Nav Links | 2 Actions)
         ===================================================================== */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-[#0B0E17]/95 sticky top-0 z-30">
        {/* Zone 1: Single Text Element Brand Wordmark */}
        <a
          href="#workbench"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap"
        >
          RectiLab
        </a>

        {/* Zone 2: 4 Clean Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <a
            href="#workbench"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Simulation Workbench
          </a>
          <a
            href="#matrix"
            onClick={(e) => {
              e.preventDefault();
              navigateToBottomTab('matrix');
            }}
            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Topology Matrix
          </a>
          <a
            href="#harmonics"
            onClick={(e) => {
              e.preventDefault();
              navigateToBottomTab('harmonics');
            }}
            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Harmonic FFT
          </a>
          <a
            href="#theory"
            onClick={(e) => {
              e.preventDefault();
              navigateToBottomTab('theory');
            }}
            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Commutation Guide
          </a>
        </nav>

        {/* Zone 3: 2 Primary Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/90 border border-slate-700 rounded-md hover:text-white hover:border-slate-600 transition-colors whitespace-nowrap"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-950 bg-cyan-400 rounded-md hover:bg-cyan-300 transition-colors whitespace-nowrap"
          >
            Export CSV
          </button>
        </div>
      </header>

      {/* =====================================================================
          MAIN ASYMMETRIC SPLIT WORKSPACE
         ===================================================================== */}
      <main id="workbench" className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-4 flex flex-col lg:flex-row gap-4">
        {/* -------------------------------------------------------------------
            LEFT CONTROL & TOPOLOGY PARAMETER CONSOLE (340px fixed on desktop)
           ------------------------------------------------------------------- */}
        <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-3">
          {/* Topology Configuration Card */}
          <section className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-4">
            <div className="border-b border-slate-800 pb-2.5">
              <h1 className="text-base font-semibold text-slate-100 tracking-tight">
                {metrics.topologyTitle}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {metrics.topologySubtitle}
              </p>
            </div>

            {/* 1. Supply Phase Selector (1-Phase vs 3-Phase) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                AC Supply Phase System
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0E17] rounded-md border border-slate-800">
                {(['1p', '3p'] as PhaseCount[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => updateParam('phases', p)}
                    className={`py-1.5 px-3 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      params.phases === p
                        ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p === '1p' ? '1-Phase (1φ)' : '3-Phase (3φ)'}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Rectifier Wave Configuration (Half-Wave vs Full-Wave Bridge) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Rectifier Bridge Configuration
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0E17] rounded-md border border-slate-800">
                {(['half', 'full'] as WaveType[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => updateParam('waveType', w)}
                    className={`py-1.5 px-3 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      params.waveType === w
                        ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {w === 'half' ? 'Half-Wave' : 'Full-Wave Bridge'}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Semiconductor Switch Type (Uncontrolled Diode vs Thyristor SCR) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Semiconductor Switching Device
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0E17] rounded-md border border-slate-800">
                {(['diode', 'scr'] as DeviceType[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => updateParam('deviceType', d)}
                    className={`py-1.5 px-3 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      params.deviceType === d
                        ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {d === 'diode' ? 'Diode Bridge' : 'Thyristor (SCR)'}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Load Model Selector (R vs RL vs Constant Id) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Output Load Nature
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0E17] rounded-md border border-slate-800">
                {(
                  [
                    { id: 'R', label: 'Pure R' },
                    { id: 'RL', label: 'RL Load' },
                    { id: 'RL_CONST', label: 'High-L (Id)' },
                  ] as { id: LoadType; label: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateParam('loadType', item.id)}
                    className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      params.loadType === item.id
                        ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Freewheeling Diode (Dfw) Toggle */}
            <div className="pt-1 flex items-center justify-between">
              <div>
                <span className="block text-xs font-medium text-slate-300">
                  Freewheeling Diode (Dfw)
                </span>
                <span className="text-[11px] text-slate-400">
                  Clamps negative inductive voltage spikes
                </span>
              </div>
              <button
                type="button"
                onClick={() => updateParam('freewheelingDiode', !params.freewheelingDiode)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md border transition-colors whitespace-nowrap ${
                  params.freewheelingDiode
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                    : 'bg-[#0B0E17] border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {params.freewheelingDiode ? 'Connected' : 'Disconnected'}
              </button>
            </div>
          </section>

          {/* Precision Electrical Parameter Sliders */}
          <section className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-slate-200 border-b border-slate-800 pb-2">
              Firing & Circuit Parameters
            </h2>

            {/* Firing Delay Angle (α) Slider + Quick Angle Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="alpha-slider" className="font-medium text-slate-300">
                  Firing Delay Angle (α)
                </label>
                <span className="font-mono tabular-nums font-semibold text-amber-400">
                  {params.deviceType === 'diode' ? '0° (Natural Diode)' : `${params.alphaDeg}°`}
                </span>
              </div>
              <input
                id="alpha-slider"
                type="range"
                min={0}
                max={maxAlpha}
                step={1}
                disabled={params.deviceType === 'diode'}
                value={params.deviceType === 'diode' ? 0 : params.alphaDeg}
                onChange={(e) => updateParam('alphaDeg', Number(e.target.value))}
                className="w-full"
              />
              {/* Quick Firing Angle Presets */}
              <div className="flex items-center justify-between gap-1 pt-0.5">
                {[0, 30, 45, 60, 90, 120].map((ang) => {
                  const isActive =
                    params.deviceType === 'scr' && params.alphaDeg === ang;
                  return (
                    <button
                      key={ang}
                      type="button"
                      onClick={() => {
                        setParams((prev) => ({
                          ...prev,
                          deviceType: ang > 0 ? 'scr' : prev.deviceType,
                          alphaDeg: ang,
                        }));
                      }}
                      className={`flex-1 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap ${
                        isActive
                          ? 'border-amber-500/60 bg-amber-500/15 text-amber-300 font-semibold'
                          : 'border-slate-800 bg-[#0B0E17] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {ang}°
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Peak Phase Voltage (Vm) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="vm-slider" className="font-medium text-slate-300">
                  Peak Phase Supply (Vm)
                </label>
                <span className="font-mono tabular-nums text-cyan-400">
                  <strong>{params.Vm} V</strong>{' '}
                  <span className="text-slate-400">
                    ({(params.Vm / Math.SQRT2).toFixed(0)} Vrms)
                  </span>
                </span>
              </div>
              <input
                id="vm-slider"
                type="range"
                min={50}
                max={400}
                step={5}
                value={params.Vm}
                onChange={(e) => updateParam('Vm', Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Load Resistance (R) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="r-slider" className="font-medium text-slate-300">
                  Load Resistance (R)
                </label>
                <span className="font-mono tabular-nums text-slate-200 font-semibold">
                  {params.R} Ω
                </span>
              </div>
              <input
                id="r-slider"
                type="range"
                min={5}
                max={100}
                step={1}
                value={params.R}
                onChange={(e) => updateParam('R', Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Load Inductance (L) */}
            {params.loadType === 'RL' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="l-slider" className="font-medium text-slate-300">
                    Smoothing Inductance (L)
                  </label>
                  <span className="font-mono tabular-nums text-amber-400 font-semibold">
                    {params.L_mH} mH
                  </span>
                </div>
                <input
                  id="l-slider"
                  type="range"
                  min={2}
                  max={200}
                  step={1}
                  value={params.L_mH}
                  onChange={(e) => updateParam('L_mH', Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}

            {/* Supply Frequency & Sweep Playback Speed */}
            <div className="pt-1 grid grid-cols-2 gap-3 border-t border-slate-800">
              <div>
                <span className="block text-[11px] text-slate-400 mb-1">Grid Frequency</span>
                <div className="flex bg-[#0B0E17] p-0.5 rounded border border-slate-800">
                  {[50, 60].map((hz) => (
                    <button
                      key={hz}
                      type="button"
                      onClick={() => updateParam('freq', hz)}
                      className={`flex-1 py-1 text-xs font-mono rounded transition-colors ${
                        params.freq === hz
                          ? 'bg-slate-800 text-cyan-300 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {hz} Hz
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-[11px] text-slate-400 mb-1">Sweep Rate</span>
                <div className="flex bg-[#0B0E17] p-0.5 rounded border border-slate-800">
                  {[0.5, 1, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setAnimSpeed(spd)}
                      className={`flex-1 py-1 text-xs font-mono rounded transition-colors ${
                        animSpeed === spd
                          ? 'bg-slate-800 text-cyan-300 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </aside>

        {/* -------------------------------------------------------------------
            RIGHT INTERACTIVE STAGE (TELEMETRY + SCHEMATIC + OSCILLOSCOPE)
           ------------------------------------------------------------------- */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Calibrated Laboratory Telemetry Readout Ribbon */}
          <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
            {/* Metric 1: Average DC Output Voltage Vdc */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg px-3.5 py-2.5">
              <div className="text-[11px] text-slate-400 font-medium">Average DC Voltage</div>
              <div className="mt-1 flex items-baseline">
                <span className="text-xl font-mono font-bold tabular-nums text-cyan-400">
                  {metrics.Vdc.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1">V</span>
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-400 tabular-nums">
                Vrms: {metrics.Vrms.toFixed(1)} V
              </div>
            </div>

            {/* Metric 2: Average DC Load Current Idc */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg px-3.5 py-2.5">
              <div className="text-[11px] text-slate-400 font-medium">Average Load Current</div>
              <div className="mt-1 flex items-baseline">
                <span className="text-xl font-mono font-bold tabular-nums text-amber-400">
                  {metrics.Idc.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1">A</span>
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-400 tabular-nums">
                Irms: {metrics.Irms.toFixed(2)} A
              </div>
            </div>

            {/* Metric 3: Voltage Ripple Factor */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg px-3.5 py-2.5">
              <div className="text-[11px] text-slate-400 font-medium">Ripple & Form Factor</div>
              <div className="mt-1 flex items-baseline">
                <span className="text-xl font-mono font-bold tabular-nums text-slate-100">
                  {metrics.rippleFactorPercent.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1">%</span>
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-400 tabular-nums">
                FF: {metrics.formFactor.toFixed(2)} · {metrics.pulseNumber}p
              </div>
            </div>

            {/* Metric 4: Peak Inverse Voltage (PIV) */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg px-3.5 py-2.5">
              <div className="text-[11px] text-slate-400 font-medium">Peak Inverse Voltage</div>
              <div className="mt-1 flex items-baseline">
                <span className="text-xl font-mono font-bold tabular-nums text-rose-400">
                  {metrics.piv.toFixed(0)}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1">V</span>
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-400 tabular-nums">
                Pdc: {metrics.Pdc.toFixed(0)} W
              </div>
            </div>

            {/* Metric 5: Input Power Factor & THD */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg px-3.5 py-2.5">
              <div className="text-[11px] text-slate-400 font-medium">Input Power Factor</div>
              <div className="mt-1 flex items-baseline">
                <span className="text-xl font-mono font-bold tabular-nums text-emerald-400">
                  {metrics.powerFactor.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1">PF</span>
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-400 tabular-nums">
                DPF: {metrics.displacementFactor.toFixed(2)}
              </div>
            </div>

            {/* Metric 6: Conduction Regime Status (Non-Hue-Only State Signaling) */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg px-3.5 py-2.5 flex flex-col justify-between">
              <div className="text-[11px] text-slate-400 font-medium">Conduction Regime</div>
              <div className="mt-1 flex items-center gap-2">
                {metrics.conductionMode === 'CCM' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20 shrink-0" />
                    <span className="text-xs font-mono font-bold text-emerald-300 whitespace-nowrap">
                      ● CONTINUOUS
                    </span>
                  </>
                )}
                {metrics.conductionMode === 'DCM' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400 ring-4 ring-amber-500/20 shrink-0" />
                    <span className="text-xs font-mono font-bold text-amber-300 whitespace-nowrap">
                      ▲ DISCONTINUOUS
                    </span>
                  </>
                )}
                {metrics.conductionMode === 'INVERTER' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-rose-400 ring-4 ring-rose-500/20 shrink-0" />
                    <span className="text-xs font-mono font-bold text-rose-300 whitespace-nowrap">
                      ◆ INVERTER MODE
                    </span>
                  </>
                )}
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-400 tabular-nums">
                Duty: {metrics.conductionAngleDeg}° / 360°
              </div>
            </div>
          </section>

          {/* Interactive Schematic + Multi-Channel Oscilloscope Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Left/Top Stage: Interactive Circuit Schematic (5 cols on xl) */}
            <div className="xl:col-span-5 flex flex-col">
              <CircuitSchematic
                params={params}
                currentPoint={currentPoint}
                isPlaying={isPlaying}
                onToggleFreewheeling={() =>
                  updateParam('freewheelingDiode', !params.freewheelingDiode)
                }
                onToggleDeviceType={() =>
                  updateParam('deviceType', params.deviceType === 'diode' ? 'scr' : 'diode')
                }
              />
            </div>

            {/* Right/Bottom Stage: Multi-Channel Oscilloscope (7 cols on xl) */}
            <div className="xl:col-span-7 flex flex-col">
              <OscilloscopeView
                params={params}
                points={points}
                metrics={metrics}
                cursorDeg={cursorDeg}
                onCursorChange={(deg) => {
                  setIsPlaying(false);
                  setCursorDeg(deg);
                }}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((v) => !v)}
              />
            </div>
          </div>

          {/* Bottom Comparison Matrix, Harmonic Spectrum & Theory Deck */}
          <div ref={bottomPanelRef} id="matrix">
            <HarmonicAndMatrixPanel
              params={params}
              metrics={metrics}
              harmonics={harmonics}
              activeTab={bottomTab}
              onSelectTab={setBottomTab}
              onSelectTopology={handlePatchTopology}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
