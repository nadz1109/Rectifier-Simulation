import React, { useState } from 'react';
import { SimulationParams, WaveformPoint } from '../engine/rectifierEngine';

interface CircuitSchematicProps {
  params: SimulationParams;
  currentPoint: WaveformPoint;
  isPlaying: boolean;
  onToggleFreewheeling: () => void;
  onToggleDeviceType: () => void;
}

interface SwitchSymbolProps {
  x: number;
  y: number;
  label: string;
  isScr: boolean;
  isActive: boolean;
  isGateFiring: boolean;
  orientation?: 'right' | 'up';
  onSelect: (id: string) => void;
  isSelected: boolean;
}

/**
 * Renders a crisp IEEE/IEC Diode or Thyristor (SCR) symbol
 * orientation="up" points cathode UP (standard vertical bridge leg)
 * orientation="right" points cathode RIGHT (horizontal half-wave leg)
 */
const SwitchSymbol: React.FC<SwitchSymbolProps> = ({
  x,
  y,
  label,
  isScr,
  isActive,
  isGateFiring,
  orientation = 'up',
  onSelect,
  isSelected,
}) => {
  const strokeColor = isActive ? '#06B6D4' : isSelected ? '#F59E0B' : '#94A3B8';
  const fillColor = isActive ? 'rgba(6, 182, 212, 0.28)' : 'rgba(15, 23, 42, 0.9)';

  if (orientation === 'right') {
    // Anode at left (x - 16, y), Cathode bar at right (x + 16, y)
    return (
      <g
        className="cursor-pointer transition-opacity"
        onClick={() => onSelect(label)}
      >
        {/* Interactive hit box */}
        <rect
          x={x - 26}
          y={y - 26}
          width={52}
          height={52}
          rx={6}
          fill={isActive ? 'rgba(6, 182, 212, 0.08)' : isSelected ? 'rgba(245, 158, 11, 0.1)' : 'transparent'}
          stroke={isSelected ? '#F59E0B' : isActive ? 'rgba(6, 182, 212, 0.4)' : 'transparent'}
          strokeWidth={1}
        />
        {/* Triangle (Anode -> Cathode pointing right) */}
        <polygon
          points={`${x - 12},${y - 12} ${x - 12},${y + 12} ${x + 12},${y}`}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        {/* Cathode Bar */}
        <line
          x1={x + 12}
          y1={y - 13}
          x2={x + 12}
          y2={y + 13}
          stroke={strokeColor}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* SCR Gate Lead */}
        {isScr && (
          <g>
            <polyline
              points={`${x + 8},${y + 5} ${x + 18},${y + 18} ${x + 26},${y + 18}`}
              fill="none"
              stroke={isGateFiring ? '#10B981' : isActive ? '#06B6D4' : '#64748B'}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {isGateFiring && (
              <circle cx={x + 26} cy={y + 18} r={4} fill="#10B981" />
            )}
          </g>
        )}
        {/* Switch Label */}
        <text
          x={x}
          y={y - 18}
          textAnchor="middle"
          fill={isActive ? '#22D3EE' : '#E2E8F0'}
          className="font-mono text-[12px] font-semibold select-none"
        >
          {label}
        </text>
      </g>
    );
  }

  // Default orientation === 'up': Anode at bottom (x, y + 14), Cathode at top (x, y - 14)
  return (
    <g
      className="cursor-pointer"
      onClick={() => onSelect(label)}
    >
      <rect
        x={x - 24}
        y={y - 24}
        width={48}
        height={48}
        rx={6}
        fill={isActive ? 'rgba(6, 182, 212, 0.08)' : isSelected ? 'rgba(245, 158, 11, 0.1)' : 'transparent'}
        stroke={isSelected ? '#F59E0B' : isActive ? 'rgba(6, 182, 212, 0.4)' : 'transparent'}
        strokeWidth={1}
      />
      {/* Triangle pointing UP */}
      <polygon
        points={`${x - 11},${y + 11} ${x + 11},${y + 11} ${x},${y - 11}`}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      {/* Cathode Bar at TOP */}
      <line
        x1={x - 12}
        y1={y - 11}
        x2={x + 12}
        y2={y - 11}
        stroke={strokeColor}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {/* SCR Gate Lead */}
      {isScr && (
        <g>
          <polyline
            points={`${x + 5},${y - 6} ${x + 16},${y - 16} ${x + 23},${y - 16}`}
            fill="none"
            stroke={isGateFiring ? '#10B981' : isActive ? '#06B6D4' : '#64748B'}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {isGateFiring && (
            <circle cx={x + 23} cy={y - 16} r={3.5} fill="#10B981" />
          )}
        </g>
      )}
      {/* Label to the left */}
      <text
        x={x - 18}
        y={y + 4}
        textAnchor="end"
        fill={isActive ? '#22D3EE' : '#E2E8F0'}
        className="font-mono text-[11px] font-semibold select-none"
      >
        {label}
      </text>
    </g>
  );
};

/**
 * Renders the Load Branch (R, RL, or Constant Current Id) + Optional Freewheeling Diode (Dfw)
 */
const LoadAndFreewheelingBranch: React.FC<{
  topY: number;
  bottomY: number;
  loadX: number;
  dfwX: number;
  params: SimulationParams;
  currentPoint: WaveformPoint;
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ topY, bottomY, loadX, dfwX, params, currentPoint, selectedId, onSelect }) => {
  const isLoadActive = currentPoint.io > 0.02;
  const isDfwActive = currentPoint.activeDevices.includes('Dfw');
  const midY = (topY + bottomY) / 2;

  return (
    <g>
      {/* Optional Freewheeling Diode Branch */}
      {params.freewheelingDiode && (
        <g>
          {/* Wire from positive rail to Dfw cathode (top) */}
          <line
            x1={dfwX}
            y1={topY}
            x2={dfwX}
            y2={midY - 12}
            stroke={isDfwActive ? '#F59E0B' : '#475569'}
            strokeWidth={isDfwActive ? 2.8 : 1.8}
          />
          {/* Wire from Dfw anode (bottom) to negative rail */}
          <line
            x1={dfwX}
            y1={midY + 12}
            x2={dfwX}
            y2={bottomY}
            stroke={isDfwActive ? '#F59E0B' : '#475569'}
            strokeWidth={isDfwActive ? 2.8 : 1.8}
          />
          {isDfwActive && (
            <line
              x1={dfwX}
              y1={bottomY}
              x2={dfwX}
              y2={topY}
              stroke="#FBBF24"
              strokeWidth={2.5}
              className="animate-current-flow"
            />
          )}
          <circle cx={dfwX} cy={topY} r={3} fill={isDfwActive ? '#F59E0B' : '#64748B'} />
          <circle cx={dfwX} cy={bottomY} r={3} fill={isDfwActive ? '#F59E0B' : '#64748B'} />
          <SwitchSymbol
            x={dfwX}
            y={midY}
            label="Dfw"
            isScr={false}
            isActive={isDfwActive}
            isGateFiring={false}
            orientation="up"
            onSelect={onSelect}
            isSelected={selectedId === 'Dfw'}
          />
        </g>
      )}

      {/* Load Branch (Positive Rail at topY -> Load at loadX -> Negative Rail at bottomY) */}
      <g className="cursor-pointer" onClick={() => onSelect('LOAD')}>
        {/* Top connection to Load */}
        <line
          x1={loadX}
          y1={topY}
          x2={loadX}
          y2={topY + 34}
          stroke={isLoadActive ? '#06B6D4' : '#64748B'}
          strokeWidth={isLoadActive ? 2.8 : 1.8}
        />

        {/* Resistor Zigzag (topY + 34 to midY - 4) */}
        <polyline
          points={`
            ${loadX},${topY + 34}
            ${loadX - 9},${topY + 42}
            ${loadX + 9},${topY + 52}
            ${loadX - 9},${topY + 62}
            ${loadX + 9},${topY + 72}
            ${loadX - 9},${topY + 82}
            ${loadX},${topY + 90}
          `}
          fill="none"
          stroke={isLoadActive ? '#22D3EE' : '#94A3B8'}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        <text
          x={loadX + 16}
          y={topY + 66}
          fill="#E2E8F0"
          className="font-mono text-[11px] font-medium select-none"
        >
          R = {params.R}Ω
        </text>

        {/* Inductor Coils if loadType is RL or RL_CONST */}
        {params.loadType !== 'R' ? (
          <g>
            <line
              x1={loadX}
              y1={topY + 90}
              x2={loadX}
              y2={topY + 108}
              stroke={isLoadActive ? '#06B6D4' : '#64748B'}
              strokeWidth={isLoadActive ? 2.8 : 1.8}
            />
            <path
              d={`
                M ${loadX} ${topY + 108}
                C ${loadX + 14} ${topY + 108}, ${loadX + 14} ${topY + 122}, ${loadX} ${topY + 122}
                C ${loadX + 14} ${topY + 122}, ${loadX + 14} ${topY + 136}, ${loadX} ${topY + 136}
                C ${loadX + 14} ${topY + 136}, ${loadX + 14} ${topY + 150}, ${loadX} ${topY + 150}
                C ${loadX + 14} ${topY + 150}, ${loadX + 14} ${topY + 164}, ${loadX} ${topY + 164}
              `}
              fill="none"
              stroke={isLoadActive ? '#F59E0B' : '#94A3B8'}
              strokeWidth={2.2}
            />
            <text
              x={loadX + 16}
              y={topY + 140}
              fill="#F59E0B"
              className="font-mono text-[11px] font-medium select-none"
            >
              {params.loadType === 'RL_CONST' ? 'L → ∞ (Id)' : `L = ${params.L_mH}mH`}
            </text>
            <line
              x1={loadX}
              y1={topY + 164}
              x2={loadX}
              y2={bottomY}
              stroke={isLoadActive ? '#06B6D4' : '#64748B'}
              strokeWidth={isLoadActive ? 2.8 : 1.8}
            />
          </g>
        ) : (
          <line
            x1={loadX}
            y1={topY + 90}
            x2={loadX}
            y2={bottomY}
            stroke={isLoadActive ? '#06B6D4' : '#64748B'}
            strokeWidth={isLoadActive ? 2.8 : 1.8}
          />
        )}

        {/* Animated load current flow */}
        {isLoadActive && (
          <line
            x1={loadX}
            y1={topY}
            x2={loadX}
            y2={bottomY}
            stroke="#22D3EE"
            strokeWidth={2.5}
            className="animate-current-flow pointer-events-none"
          />
        )}

        {/* Polarity & Vo Markers */}
        <text
          x={loadX - 18}
          y={topY + 22}
          textAnchor="end"
          fill="#06B6D4"
          className="font-mono text-[13px] font-bold select-none"
        >
          +
        </text>
        <text
          x={loadX - 16}
          y={midY + 4}
          textAnchor="end"
          fill="#06B6D4"
          className="font-mono text-[11px] font-semibold select-none"
        >
          vo(t)
        </text>
        <text
          x={loadX - 18}
          y={bottomY - 12}
          textAnchor="end"
          fill="#64748B"
          className="font-mono text-[13px] font-bold select-none"
        >
          −
        </text>
      </g>
    </g>
  );
};

export const CircuitSchematic: React.FC<CircuitSchematicProps> = ({
  params,
  currentPoint,
  onToggleFreewheeling,
  onToggleDeviceType,
}) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const isScr = params.deviceType === 'scr';
  const prefix = isScr ? 'T' : 'D';
  const activeDevs = currentPoint.activeDevices;
  const isGateFiring = currentPoint.gatePulse > 0;

  const handleSelectNode = (id: string) => {
    setSelectedNode((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full bg-[#111827] border border-slate-800 rounded-lg overflow-hidden">
      {/* Schematic Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-[#0B0E17]/60">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold tracking-wide text-slate-100 truncate">
            Interactive Circuit Topology
          </h2>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="font-mono text-xs text-cyan-400 truncate">
            {currentPoint.activePathLabel}
          </span>
        </div>

        {/* Direct Circuit Modification Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleDeviceType}
            className="px-2.5 py-1 text-xs font-mono font-medium rounded border border-slate-700 bg-slate-800/80 text-slate-200 hover:border-cyan-500/60 hover:text-cyan-300 transition-colors whitespace-nowrap"
          >
            Switch: {isScr ? 'Thyristor (SCR)' : 'Diode'}
          </button>
          <button
            type="button"
            onClick={onToggleFreewheeling}
            className={`px-2.5 py-1 text-xs font-mono font-medium rounded border transition-colors whitespace-nowrap ${
              params.freewheelingDiode
                ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                : 'border-slate-700 bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            Dfw: {params.freewheelingDiode ? 'Connected' : 'Open'}
          </button>
        </div>
      </div>

      {/* Main SVG Schematic Canvas */}
      <div className="relative flex-1 flex items-center justify-center p-2 bg-[#0B0E17]/40 min-h-[270px]">
        <svg
          viewBox="0 0 680 300"
          className="w-full h-full max-h-[310px] select-none"
          role="img"
          aria-label={params.phases === '1p' ? 'Single-Phase Rectifier Schematic' : 'Three-Phase Rectifier Schematic'}
        >
          <defs>
            <pattern id="schematicGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="rgba(148, 163, 184, 0.05)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="680" height="300" fill="url(#schematicGrid)" />

          {/* ===============================================================
              TOPOLOGY 1: 1-PHASE HALF-WAVE RECTIFIER
             =============================================================== */}
          {params.phases === '1p' && params.waveType === 'half' && (
            <g>
              {/* AC Source on Left (x=110, y=150) */}
              <line x1={110} y1={55} x2={110} y2={122} stroke={activeDevs.includes(`${prefix}1`) ? '#06B6D4' : '#64748B'} strokeWidth={2} />
              <line x1={110} y1={178} x2={110} y2={245} stroke={activeDevs.includes(`${prefix}1`) ? '#06B6D4' : '#64748B'} strokeWidth={2} />
              <circle
                cx={110}
                cy={150}
                r={28}
                fill="#0F172A"
                stroke={ currentPoint.va >= 0 ? '#06B6D4' : '#F43F5E' }
                strokeWidth={2.2}
              />
              {/* Sine wave inside AC source */}
              <path
                d="M 96 150 Q 103 136, 110 150 T 124 150"
                fill="none"
                stroke="#E2E8F0"
                strokeWidth={2}
              />
              <text x={68} y={145} textAnchor="end" fill="#E2E8F0" className="font-mono text-[12px] font-semibold">
                vs(t)
              </text>
              <text x={68} y={162} textAnchor="end" fill="#94A3B8" className="font-mono text-[11px]">
                {currentPoint.va.toFixed(0)}V
              </text>

              {/* Top Rail from Source to Switch S1 (x=280, y=55) to Load (x=540, y=55) */}
              <line x1={110} y1={55} x2={265} y2={55} stroke={activeDevs.includes(`${prefix}1`) ? '#06B6D4' : '#64748B'} strokeWidth={2.2} />
              <line x1={295} y1={55} x2={540} y2={55} stroke={currentPoint.io > 0.02 ? '#06B6D4' : '#64748B'} strokeWidth={2.2} />

              {/* Bottom Return Rail */}
              <line x1={110} y1={245} x2={540} y2={245} stroke={currentPoint.io > 0.02 ? '#06B6D4' : '#64748B'} strokeWidth={2.2} />

              {/* Animated Current Flow on Active Rails */}
              {activeDevs.includes(`${prefix}1`) && (
                <g className="pointer-events-none">
                  <polyline
                    points="110,122 110,55 540,55"
                    fill="none"
                    stroke="#22D3EE"
                    strokeWidth={2.5}
                    className="animate-current-flow"
                  />
                  <polyline
                    points="540,245 110,245 110,178"
                    fill="none"
                    stroke="#22D3EE"
                    strokeWidth={2.5}
                    className="animate-current-flow"
                  />
                </g>
              )}

              {/* Switch D1 / T1 on Top Rail */}
              <SwitchSymbol
                x={280}
                y={55}
                label={`${prefix}1`}
                isScr={isScr}
                isActive={activeDevs.includes(`${prefix}1`)}
                isGateFiring={isGateFiring}
                orientation="right"
                onSelect={handleSelectNode}
                isSelected={selectedNode === `${prefix}1`}
              />

              {/* Load and Freewheeling Diode */}
              <LoadAndFreewheelingBranch
                topY={55}
                bottomY={245}
                loadX={540}
                dfwX={430}
                params={params}
                currentPoint={currentPoint}
                selectedId={selectedNode}
                onSelect={handleSelectNode}
              />
            </g>
          )}

          {/* ===============================================================
              TOPOLOGY 2: 1-PHASE FULL-WAVE BRIDGE RECTIFIER (GRAETZ BRIDGE)
             =============================================================== */}
          {params.phases === '1p' && params.waveType === 'full' && (
            <g>
              {/* AC Source on Left (x=95, y=150) */}
              <circle
                cx={95}
                cy={150}
                r={26}
                fill="#0F172A"
                stroke={currentPoint.va >= 0 ? '#06B6D4' : '#F43F5E'}
                strokeWidth={2.2}
              />
              <path
                d="M 82 150 Q 88.5 137, 95 150 T 108 150"
                fill="none"
                stroke="#E2E8F0"
                strokeWidth={2}
              />
              <text x={58} y={146} textAnchor="end" fill="#E2E8F0" className="font-mono text-[12px] font-semibold">
                vs(t)
              </text>
              <text x={58} y={162} textAnchor="end" fill="#94A3B8" className="font-mono text-[11px]">
                {currentPoint.va.toFixed(0)}V
              </text>

              {/* AC Feeders to Bridge Midpoints: Leg A at (230, 150), Leg B at (330, 150) */}
              <polyline
                points="95,124 95,85 160,85 160,150 230,150"
                fill="none"
                stroke={activeDevs.includes(`${prefix}1`) || activeDevs.includes(`${prefix}4`) ? '#06B6D4' : '#64748B'}
                strokeWidth={2}
              />
              <polyline
                points="95,176 95,215 160,215 160,170 330,170 330,150"
                fill="none"
                stroke={activeDevs.includes(`${prefix}2`) || activeDevs.includes(`${prefix}3`) ? '#06B6D4' : '#64748B'}
                strokeWidth={2}
              />
              <circle cx={230} cy={150} r={3.5} fill="#E2E8F0" />
              <circle cx={330} cy={150} r={3.5} fill="#E2E8F0" />

              {/* Bridge Legs: Leg 1 at x=230 (T1 top, T4 bottom), Leg 2 at x=330 (T3 top, T2 bottom) */}
              {/* Top Rail: x=230..550, y=45 */}
              <line x1={230} y1={45} x2={550} y2={45} stroke={currentPoint.io > 0.02 ? '#06B6D4' : '#64748B'} strokeWidth={2.2} />
              {/* Bottom Rail: x=230..550, y=255 */}
              <line x1={230} y1={255} x2={550} y2={255} stroke={currentPoint.io > 0.02 ? '#06B6D4' : '#64748B'} strokeWidth={2.2} />

              {/* Leg 1 Vertical Wires (x=230) */}
              <line x1={230} y1={45} x2={230} y2={150} stroke={activeDevs.includes(`${prefix}1`) ? '#06B6D4' : '#64748B'} strokeWidth={2} />
              <line x1={230} y1={150} x2={230} y2={255} stroke={activeDevs.includes(`${prefix}4`) ? '#06B6D4' : '#64748B'} strokeWidth={2} />

              {/* Leg 2 Vertical Wires (x=330) */}
              <line x1={330} y1={45} x2={330} y2={150} stroke={activeDevs.includes(`${prefix}3`) ? '#06B6D4' : '#64748B'} strokeWidth={2} />
              <line x1={330} y1={150} x2={330} y2={255} stroke={activeDevs.includes(`${prefix}2`) ? '#06B6D4' : '#64748B'} strokeWidth={2} />

              {/* Animated Conduction Path for P12 (+Vs: T1 & T2) */}
              {activeDevs.includes(`${prefix}1`) && (
                <g className="pointer-events-none">
                  <polyline
                    points="230,150 230,45 550,45"
                    fill="none"
                    stroke="#22D3EE"
                    strokeWidth={2.5}
                    className="animate-current-flow"
                  />
                  <polyline
                    points="550,255 330,255 330,150"
                    fill="none"
                    stroke="#22D3EE"
                    strokeWidth={2.5}
                    className="animate-current-flow"
                  />
                </g>
              )}

              {/* Animated Conduction Path for P34 (-Vs: T3 & T4) */}
              {activeDevs.includes(`${prefix}3`) && (
                <g className="pointer-events-none">
                  <polyline
                    points="330,150 330,45 550,45"
                    fill="none"
                    stroke="#22D3EE"
                    strokeWidth={2.5}
                    className="animate-current-flow"
                  />
                  <polyline
                    points="550,255 230,255 230,150"
                    fill="none"
                    stroke="#22D3EE"
                    strokeWidth={2.5}
                    className="animate-current-flow"
                  />
                </g>
              )}

              {/* 4 Bridge Switches: T1 (top-left), T3 (top-right), T4 (bottom-left), T2 (bottom-right) */}
              <SwitchSymbol
                x={230}
                y={95}
                label={`${prefix}1`}
                isScr={isScr}
                isActive={activeDevs.includes(`${prefix}1`)}
                isGateFiring={isGateFiring && currentPoint.va >= 0}
                orientation="up"
                onSelect={handleSelectNode}
                isSelected={selectedNode === `${prefix}1`}
              />
              <SwitchSymbol
                x={330}
                y={95}
                label={`${prefix}3`}
                isScr={isScr}
                isActive={activeDevs.includes(`${prefix}3`)}
                isGateFiring={isGateFiring && currentPoint.va <= 0}
                orientation="up"
                onSelect={handleSelectNode}
                isSelected={selectedNode === `${prefix}3`}
              />
              <SwitchSymbol
                x={230}
                y={205}
                label={`${prefix}4`}
                isScr={isScr}
                isActive={activeDevs.includes(`${prefix}4`)}
                isGateFiring={isGateFiring && currentPoint.va <= 0}
                orientation="up"
                onSelect={handleSelectNode}
                isSelected={selectedNode === `${prefix}4`}
              />
              <SwitchSymbol
                x={330}
                y={205}
                label={`${prefix}2`}
                isScr={isScr}
                isActive={activeDevs.includes(`${prefix}2`)}
                isGateFiring={isGateFiring && currentPoint.va >= 0}
                orientation="up"
                onSelect={handleSelectNode}
                isSelected={selectedNode === `${prefix}2`}
              />

              {/* Load and Freewheeling Diode */}
              <LoadAndFreewheelingBranch
                topY={45}
                bottomY={255}
                loadX={550}
                dfwX={445}
                params={params}
                currentPoint={currentPoint}
                selectedId={selectedNode}
                onSelect={handleSelectNode}
              />
            </g>
          )}

          {/* ===============================================================
              TOPOLOGY 3: 3-PHASE HALF-WAVE RECTIFIER (3-PULSE STAR)
             =============================================================== */}
          {params.phases === '3p' && params.waveType === 'half' && (
            <g>
              {/* 3-Phase Sources Va, Vb, Vc on Left + Neutral Return at Bottom */}
              {[
                { phase: 'A', y: 65, vVal: currentPoint.va, dev: `${prefix}1`, color: '#38BDF8' },
                { phase: 'B', y: 130, vVal: currentPoint.vb, dev: `${prefix}2`, color: '#FBBF24' },
                { phase: 'C', y: 195, vVal: currentPoint.vc, dev: `${prefix}3`, color: '#F43F5E' },
              ].map((src) => {
                const isCond = activeDevs.includes(src.dev);
                return (
                  <g key={src.phase}>
                    {/* Neutral bus link at x=55 */}
                    <line x1={55} y1={src.y} x2={82} y2={src.y} stroke="#64748B" strokeWidth={2} />
                    <circle
                      cx={100}
                      cy={src.y}
                      r={18}
                      fill="#0F172A"
                      stroke={isCond ? '#06B6D4' : src.color}
                      strokeWidth={2}
                    />
                    <text
                      x={100}
                      y={src.y + 4}
                      textAnchor="middle"
                      fill={src.color}
                      className="font-mono text-[11px] font-bold"
                    >
                      V{src.phase.toLowerCase()}
                    </text>
                    {/* Wire from source to switch */}
                    <line
                      x1={118}
                      y1={src.y}
                      x2={250}
                      y2={src.y}
                      stroke={isCond ? '#06B6D4' : '#64748B'}
                      strokeWidth={isCond ? 2.5 : 1.8}
                    />
                    {/* Wire from switch to common-cathode collector bus (x=370) */}
                    <line
                      x1={280}
                      y1={src.y}
                      x2={370}
                      y2={src.y}
                      stroke={isCond ? '#06B6D4' : '#64748B'}
                      strokeWidth={isCond ? 2.5 : 1.8}
                    />
                    {isCond && (
                      <line
                        x1={118}
                        y1={src.y}
                        x2={370}
                        y2={src.y}
                        stroke="#22D3EE"
                        strokeWidth={2.5}
                        className="animate-current-flow pointer-events-none"
                      />
                    )}
                    <SwitchSymbol
                      x={265}
                      y={src.y}
                      label={src.dev}
                      isScr={isScr}
                      isActive={isCond}
                      isGateFiring={isGateFiring && isCond}
                      orientation="right"
                      onSelect={handleSelectNode}
                      isSelected={selectedNode === src.dev}
                    />
                  </g>
                );
              })}

              {/* Star Neutral Bus on Left (x=55, y=65..255) returning from Load bottom (x=550, y=255) */}
              <polyline
                points="55,65 55,255 550,255"
                fill="none"
                stroke={currentPoint.io > 0.02 ? '#06B6D4' : '#64748B'}
                strokeWidth={2.2}
              />
              <text x={45} y={258} textAnchor="end" fill="#94A3B8" className="font-mono text-[11px]">
                N
              </text>

              {/* Common Cathode Collector Bus (x=370, y=50..195) feeding Load at (550, 50) */}
              <polyline
                points="370,195 370,50 550,50"
                fill="none"
                stroke={currentPoint.io > 0.02 ? '#06B6D4' : '#64748B'}
                strokeWidth={2.2}
              />
              <circle cx={370} cy={65} r={3.5} fill="#06B6D4" />
              <circle cx={370} cy={130} r={3.5} fill="#06B6D4" />
              <circle cx={370} cy={195} r={3.5} fill="#06B6D4" />

              {currentPoint.io > 0.02 && !activeDevs.includes('Dfw') && (
                <polyline
                  points="550,255 55,255 55,130"
                  fill="none"
                  stroke="#22D3EE"
                  strokeWidth={2.5}
                  className="animate-current-flow pointer-events-none"
                />
              )}

              {/* Load and Freewheeling Diode */}
              <LoadAndFreewheelingBranch
                topY={50}
                bottomY={255}
                loadX={550}
                dfwX={455}
                params={params}
                currentPoint={currentPoint}
                selectedId={selectedNode}
                onSelect={handleSelectNode}
              />
            </g>
          )}

          {/* ===============================================================
              TOPOLOGY 4: 3-PHASE FULL-WAVE BRIDGE RECTIFIER (6-PULSE B6)
             =============================================================== */}
          {params.phases === '3p' && params.waveType === 'full' && (
            <g>
              {/* 3-Phase AC Supply on Left (x=75) feeding 3 Bridge Legs (x=200, 290, 380) */}
              {[
                { phase: 'A', y: 125, legX: 200, topDev: `${prefix}1`, botDev: `${prefix}4`, color: '#38BDF8' },
                { phase: 'B', y: 155, legX: 290, topDev: `${prefix}3`, botDev: `${prefix}6`, color: '#FBBF24' },
                { phase: 'C', y: 185, legX: 380, topDev: `${prefix}5`, botDev: `${prefix}2`, color: '#F43F5E' },
              ].map((leg) => {
                const isTopActive = activeDevs.includes(leg.topDev);
                const isBotActive = activeDevs.includes(leg.botDev);
                const isPhaseActive = isTopActive || isBotActive;
                return (
                  <g key={leg.phase}>
                    {/* Neutral Y-point link at x=36 */}
                    <line x1={36} y1={leg.y} x2={58} y2={leg.y} stroke="#64748B" strokeWidth={1.8} />
                    <circle
                      cx={74}
                      cy={leg.y}
                      r={14}
                      fill="#0F172A"
                      stroke={isPhaseActive ? '#06B6D4' : leg.color}
                      strokeWidth={1.8}
                    />
                    <text
                      x={74}
                      y={leg.y + 4}
                      textAnchor="middle"
                      fill={leg.color}
                      className="font-mono text-[10px] font-bold"
                    >
                      V{leg.phase.toLowerCase()}
                    </text>

                    {/* Phase Feeder Line from AC source to Bridge Leg Midpoint */}
                    <line
                      x1={88}
                      y1={leg.y}
                      x2={leg.legX}
                      y2={leg.y}
                      stroke={isPhaseActive ? '#06B6D4' : '#64748B'}
                      strokeWidth={isPhaseActive ? 2.4 : 1.6}
                    />
                    <circle cx={leg.legX} cy={leg.y} r={3.5} fill={isPhaseActive ? '#22D3EE' : '#94A3B8'} />

                    {/* Upper Bridge Leg (Midpoint y -> Top Rail y=40) */}
                    <line
                      x1={leg.legX}
                      y1={40}
                      x2={leg.legX}
                      y2={leg.y}
                      stroke={isTopActive ? '#06B6D4' : '#64748B'}
                      strokeWidth={isTopActive ? 2.5 : 1.8}
                    />
                    {/* Lower Bridge Leg (Bottom Rail y=260 -> Midpoint y) */}
                    <line
                      x1={leg.legX}
                      y1={leg.y}
                      x2={leg.legX}
                      y2={260}
                      stroke={isBotActive ? '#06B6D4' : '#64748B'}
                      strokeWidth={isBotActive ? 2.5 : 1.8}
                    />

                    {/* Animated current on active upper or lower half-leg */}
                    {isTopActive && (
                      <polyline
                        points={`88,${leg.y} ${leg.legX},${leg.y} ${leg.legX},40 560,40`}
                        fill="none"
                        stroke="#22D3EE"
                        strokeWidth={2.5}
                        className="animate-current-flow pointer-events-none"
                      />
                    )}
                    {isBotActive && (
                      <polyline
                        points={`560,260 ${leg.legX},260 ${leg.legX},${leg.y} 88,${leg.y}`}
                        fill="none"
                        stroke="#22D3EE"
                        strokeWidth={2.5}
                        className="animate-current-flow pointer-events-none"
                      />
                    )}

                    {/* Top Switch (T1, T3, T5) */}
                    <SwitchSymbol
                      x={leg.legX}
                      y={80}
                      label={leg.topDev}
                      isScr={isScr}
                      isActive={isTopActive}
                      isGateFiring={isGateFiring && isTopActive}
                      orientation="up"
                      onSelect={handleSelectNode}
                      isSelected={selectedNode === leg.topDev}
                    />
                    {/* Bottom Switch (T4, T6, T2) */}
                    <SwitchSymbol
                      x={leg.legX}
                      y={222}
                      label={leg.botDev}
                      isScr={isScr}
                      isActive={isBotActive}
                      isGateFiring={isGateFiring && isBotActive}
                      orientation="up"
                      onSelect={handleSelectNode}
                      isSelected={selectedNode === leg.botDev}
                    />
                  </g>
                );
              })}

              {/* Star Neutral Tie on Left */}
              <line x1={36} y1={125} x2={36} y2={185} stroke="#64748B" strokeWidth={2} />

              {/* Positive DC Rail (Top y=40, x=200..560) */}
              <line
                x1={200}
                y1={40}
                x2={560}
                y2={40}
                stroke={currentPoint.io > 0.02 ? '#06B6D4' : '#64748B'}
                strokeWidth={2.2}
              />
              {/* Negative DC Rail (Bottom y=260, x=200..560) */}
              <line
                x1={200}
                y1={260}
                x2={560}
                y2={260}
                stroke={currentPoint.io > 0.02 ? '#06B6D4' : '#64748B'}
                strokeWidth={2.2}
              />

              {/* Load and Freewheeling Diode */}
              <LoadAndFreewheelingBranch
                topY={40}
                bottomY={260}
                loadX={560}
                dfwX={465}
                params={params}
                currentPoint={currentPoint}
                selectedId={selectedNode}
                onSelect={handleSelectNode}
              />
            </g>
          )}
        </svg>

        {/* Interactive Node Inspector Overlay inside Canvas */}
        {selectedNode && (
          <div className="absolute bottom-3 left-3 bg-[#0B0E17]/95 border border-slate-700 rounded-md px-3 py-2 text-xs shadow-lg flex items-center gap-4">
            <div>
              <span className="text-slate-400 font-mono">Selected Element: </span>
              <span className="text-amber-400 font-mono font-semibold">{selectedNode}</span>
            </div>
            <span className="text-slate-600">·</span>
            <div className="font-mono text-slate-200">
              {selectedNode === 'LOAD'
                ? `Vo = ${currentPoint.vo.toFixed(1)} V · Io = ${currentPoint.io.toFixed(2)} A`
                : selectedNode === 'Dfw'
                  ? `Freewheeling Current Ifw = ${currentPoint.ifw.toFixed(2)} A`
                  : `State: ${activeDevs.includes(selectedNode) ? 'CONDUCTING (ON)' : 'BLOCKING (OFF)'} · V_T1 = ${currentPoint.vSwitch1.toFixed(1)} V`}
            </div>
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-slate-100 font-mono text-[11px]"
            >
              [Close]
            </button>
          </div>
        )}
      </div>

      {/* Bottom Live Instantaneous Schematic Telemetry Strip */}
      <div className="px-4 py-2 border-t border-slate-800 bg-[#0B0E17]/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
        <div className="flex items-center gap-3 text-slate-300">
          <span>
            ωt = <strong className="text-cyan-400">{currentPoint.deg.toFixed(0)}°</strong>
          </span>
          <span className="text-slate-600">·</span>
          <span>
            vo(ωt) = <strong className="text-cyan-400">{currentPoint.vo.toFixed(1)} V</strong>
          </span>
          <span className="text-slate-600">·</span>
          <span>
            io(ωt) = <strong className="text-amber-400">{currentPoint.io.toFixed(2)} A</strong>
          </span>
          <span className="text-slate-600">·</span>
          <span>
            v_{prefix}1(ωt) = <strong className="text-rose-400">{currentPoint.vSwitch1.toFixed(1)} V</strong>
          </span>
        </div>
        <div className="text-slate-400">
          Click any switch or load component to inspect
        </div>
      </div>
    </div>
  );
};
