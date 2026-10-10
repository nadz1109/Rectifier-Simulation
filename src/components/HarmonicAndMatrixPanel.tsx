import React from 'react';
import {
  HarmonicBin,
  runRectifierSimulation,
  SimulationMetrics,
  SimulationParams,
} from '../engine/rectifierEngine';

interface HarmonicAndMatrixPanelProps {
  params: SimulationParams;
  metrics: SimulationMetrics;
  harmonics: HarmonicBin[];
  activeTab: 'harmonics' | 'matrix' | 'theory';
  onSelectTab: (tab: 'harmonics' | 'matrix' | 'theory') => void;
  onSelectTopology: (patch: Partial<SimulationParams>) => void;
}

export const HarmonicAndMatrixPanel: React.FC<HarmonicAndMatrixPanelProps> = ({
  params,
  metrics,
  harmonics,
  activeTab,
  onSelectTab,
  onSelectTopology,
}) => {
  // Generate live comparison across all 8 canonical rectifier topologies using current Vm, R, L, alpha
  const canonicalConfigs: {
    id: string;
    name: string;
    phases: '1p' | '3p';
    waveType: 'half' | 'full';
    deviceType: 'diode' | 'scr';
  }[] = [
    { id: '1p-half-diode', name: '1-Phase Half-Wave Diode', phases: '1p', waveType: 'half', deviceType: 'diode' },
    { id: '1p-half-scr', name: '1-Phase Half-Wave Thyristor (SCR)', phases: '1p', waveType: 'half', deviceType: 'scr' },
    { id: '1p-full-diode', name: '1-Phase Full-Wave Bridge Diode', phases: '1p', waveType: 'full', deviceType: 'diode' },
    { id: '1p-full-scr', name: '1-Phase Full-Wave Bridge Thyristor', phases: '1p', waveType: 'full', deviceType: 'scr' },
    { id: '3p-half-diode', name: '3-Phase Half-Wave (3-Pulse) Diode', phases: '3p', waveType: 'half', deviceType: 'diode' },
    { id: '3p-half-scr', name: '3-Phase Half-Wave (3-Pulse) Thyristor', phases: '3p', waveType: 'half', deviceType: 'scr' },
    { id: '3p-full-diode', name: '3-Phase Full-Wave Bridge (B6) Diode', phases: '3p', waveType: 'full', deviceType: 'diode' },
    { id: '3p-full-scr', name: '3-Phase Full-Wave Bridge (B6) Thyristor', phases: '3p', waveType: 'full', deviceType: 'scr' },
  ];

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden">
      {/* Section Header & Segmented View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-[#0B0E17]/60">
        <div className="flex items-center gap-1 p-1 bg-[#0B0E17] rounded-md border border-slate-800">
          <button
            type="button"
            onClick={() => onSelectTab('matrix')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'matrix'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            8-Topology Comparison Matrix
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('harmonics')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'harmonics'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Fourier Harmonic Spectrum (FFT)
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('theory')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'theory'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Analytical Equations & Commutation Guide
          </button>
        </div>

        <div className="text-xs font-mono text-slate-400">
          Equation: <span className="text-cyan-300">{metrics.theoreticalFormula}</span>
        </div>
      </div>

      {/* TAB 1: 8-TOPOLOGY COMPARISON MATRIX */}
      {activeTab === 'matrix' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B0E17]/40 text-[11px] font-mono text-slate-400">
                <th className="py-2.5 px-4 font-medium">Rectifier Topology (Click row to load)</th>
                <th className="py-2.5 px-3 font-medium">Pulses (p)</th>
                <th className="py-2.5 px-3 font-medium text-right">Vdc (V)</th>
                <th className="py-2.5 px-3 font-medium text-right">Vrms (V)</th>
                <th className="py-2.5 px-3 font-medium text-right">Idc (A)</th>
                <th className="py-2.5 px-3 font-medium text-right">Ripple Factor</th>
                <th className="py-2.5 px-3 font-medium text-right">Form Factor</th>
                <th className="py-2.5 px-3 font-medium text-right">PIV Rating</th>
                <th className="py-2.5 px-4 font-medium text-right">Input PF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
              {canonicalConfigs.map((cfg) => {
                const isCurrent =
                  params.phases === cfg.phases &&
                  params.waveType === cfg.waveType &&
                  params.deviceType === cfg.deviceType;
                const sim = isCurrent
                  ? { metrics }
                  : runRectifierSimulation({
                      ...params,
                      phases: cfg.phases,
                      waveType: cfg.waveType,
                      deviceType: cfg.deviceType,
                    });
                const m = sim.metrics;

                return (
                  <tr
                    key={cfg.id}
                    onClick={() =>
                      onSelectTopology({
                        phases: cfg.phases,
                        waveType: cfg.waveType,
                        deviceType: cfg.deviceType,
                      })
                    }
                    className={`cursor-pointer transition-colors ${
                      isCurrent
                        ? 'bg-cyan-500/10 text-cyan-200'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-sans font-medium flex items-center gap-2">
                      <span className={isCurrent ? 'text-cyan-400 font-semibold' : 'text-slate-200'}>
                        {cfg.name}
                      </span>
                      {cfg.deviceType === 'scr' && (
                        <span className="text-[11px] font-mono text-amber-400">
                          (α={params.alphaDeg}°)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{m.pulseNumber}p</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-cyan-400">
                      {m.Vdc.toFixed(1)} V
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {m.Vrms.toFixed(1)} V
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-400">
                      {m.Idc.toFixed(2)} A
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {m.rippleFactorPercent.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {m.formFactor.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-400">
                      {m.piv.toFixed(0)} V
                    </td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">
                      {m.powerFactor.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: FOURIER HARMONIC SPECTRUM (FFT) */}
      {activeTab === 'harmonics' && (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Output Voltage Harmonics Vo(n) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-200">
                Output Voltage Harmonics Vo(n) Relative to Vm
              </h3>
              <span className="text-xs font-mono text-cyan-400">
                Dominant Ripple: {metrics.pulseNumber * params.freq} Hz ({metrics.pulseNumber}f)
              </span>
            </div>
            <div className="space-y-2">
              {harmonics.slice(0, 12).map((h) => (
                <div key={h.order} className="flex items-center gap-3 text-xs font-mono tabular-nums">
                  <span className="w-16 text-slate-400">
                    n={h.order} ({h.freqHz}Hz)
                  </span>
                  <div className="flex-1 h-3 bg-[#0B0E17] rounded overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-cyan-500 transition-all duration-150"
                      style={{ width: `${Math.min(100, h.voPercent)}%` }}
                    />
                  </div>
                  <span className="w-24 text-right text-slate-200">
                    {h.voMagnitude.toFixed(1)} V ({h.voPercent.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Source Line Current Harmonics Ia(n) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-200">
                AC Supply Line Current Harmonics Ia(n) (% of Fundamental Ia1)
              </h3>
              <span className="text-xs font-mono text-emerald-400">
                THD_i = {metrics.thdCurrentPercent.toFixed(1)}% · DPF = {metrics.displacementFactor.toFixed(2)}
              </span>
            </div>
            <div className="space-y-2">
              {harmonics.slice(0, 12).map((h) => (
                <div key={h.order} className="flex items-center gap-3 text-xs font-mono tabular-nums">
                  <span className="w-16 text-slate-400">
                    n={h.order} ({h.freqHz}Hz)
                  </span>
                  <div className="flex-1 h-3 bg-[#0B0E17] rounded overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all duration-150 ${
                        h.order === 1 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, h.iaPercent)}%` }}
                    />
                  </div>
                  <span className="w-24 text-right text-slate-200">
                    {h.iaMagnitude.toFixed(2)} A ({h.iaPercent.toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ANALYTICAL EQUATIONS & COMMUTATION GUIDE */}
      {activeTab === 'theory' && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs leading-relaxed text-slate-300">
          <div className="space-y-2 border-r border-slate-800/80 pr-4">
            <h3 className="text-sm font-semibold text-slate-100">
              01. Phase Control & Firing Delay (α)
            </h3>
            <p className="text-slate-400">
              In an uncontrolled <strong className="text-slate-200">Diode Rectifier</strong>, each diode begins conducting naturally at the instant it becomes forward-biased (<span className="font-mono text-cyan-300">α = 0°</span>).
            </p>
            <p className="text-slate-400">
              In a <strong className="text-slate-200">Thyristor (SCR) Controlled Rectifier</strong>, conduction is delayed by angle <span className="font-mono text-amber-300">α</span> past the natural commutation point until a gate pulse <span className="font-mono text-emerald-300">ig(ωt)</span> is injected. For 3-phase rectifiers, <span className="font-mono text-amber-300">α = 0°</span> corresponds to <span className="font-mono">ωt = 30°</span> where phase voltages cross.
            </p>
          </div>

          <div className="space-y-2 border-r border-slate-800/80 pr-4">
            <h3 className="text-sm font-semibold text-slate-100">
              02. Inductive Load (RL) & Extinction (β)
            </h3>
            <p className="text-slate-400">
              With an inductive load (<span className="font-mono text-amber-300">L &gt; 0</span>), stored magnetic energy <span className="font-mono">½ L io²</span> forces current to continue flowing even after the AC supply voltage reverses polarity (<span className="font-mono text-rose-400">vo(ωt) &lt; 0</span>), reducing average DC output voltage <span className="font-mono text-cyan-300">Vdc</span>.
            </p>
            <p className="text-slate-400">
              Connecting a <strong className="text-amber-300">Freewheeling Diode (Dfw)</strong> across the load clamps negative voltage excursions at <span className="font-mono">0 V</span> and circulates load current during the negative supply interval, improving both <span className="font-mono">Vdc</span> and input power factor.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-100">
              03. 1-Phase vs. 3-Phase Bridge Ripple
            </h3>
            <p className="text-slate-400">
              A 1-Phase Half-Wave rectifier produces 1 pulse per cycle (<span className="font-mono">RF ≈ 121%</span>), and a 1-Phase Full-Wave Bridge produces 2 pulses per cycle (<span className="font-mono">RF ≈ 48.2%</span>).
            </p>
            <p className="text-slate-400">
              A 3-Phase Half-Wave converter yields 3 pulses per cycle (<span className="font-mono">RF ≈ 18.3%</span>), while a <strong className="text-cyan-300">3-Phase Full-Wave 6-Pulse Bridge (B6)</strong> commutates every 60° across pairs <span className="font-mono">(T1,T6) → (T1,T2) → (T3,T2) → (T3,T4) → (T5,T4) → (T5,T6)</span>, achieving <span className="font-mono text-emerald-400">RF ≈ 4.2%</span> at α = 0°.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
