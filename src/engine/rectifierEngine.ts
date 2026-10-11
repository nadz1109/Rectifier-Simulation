export type PhaseCount = '1p' | '3p';
export type WaveType = 'half' | 'full';
export type DeviceType = 'diode' | 'scr';
export type LoadType = 'R' | 'RL' | 'RL_CONST';

export interface SimulationParams {
  phases: PhaseCount;
  waveType: WaveType;
  deviceType: DeviceType;
  loadType: LoadType;
  freewheelingDiode: boolean;
  Vm: number; // Peak phase voltage (V)
  freq: number; // Supply frequency (Hz)
  alphaDeg: number; // Firing delay angle (degrees, 0..165)
  R: number; // Load resistance (Ohms)
  L_mH: number; // Load inductance (mH)
}

export interface WaveformPoint {
  deg: number; // 0 to 720 degrees
  rad: number;
  va: number;
  vb: number;
  vc: number;
  vab: number;
  vac: number;
  vbc: number;
  vba: number;
  vca: number;
  vcb: number;
  vo: number; // Instantaneous output voltage (V)
  io: number; // Instantaneous output current (A)
  ia: number; // Source Phase A current (A)
  ib: number; // Source Phase B current (A)
  ic: number; // Source Phase C current (A)
  ifw: number; // Freewheeling diode current (A)
  vSwitch1: number; // Voltage across D1 / T1 (V)
  gatePulse: number; // 1 if gate trigger pulse is firing, 0 otherwise
  activeDevices: string[]; // e.g., ['T1', 'T6'] or ['Dfw']
  activePathLabel: string; // e.g., 'T1 + T6 (Vab)'
}

export interface HarmonicBin {
  order: number;
  freqHz: number;
  voMagnitude: number; // V peak of harmonic n
  voPercent: number; // % of Vm (or Vdc)
  iaMagnitude: number; // A peak of harmonic n
  iaPercent: number; // % of fundamental Ia1
}

export interface SimulationMetrics {
  Vdc: number;
  Vrms: number;
  Idc: number;
  Irms: number;
  Pout: number; // Actual average output load power: mean(vo * io)
  Pin: number; // Actual average input real power: mean(va * ia + vb * ib + vc * ic)
  Pdc: number; // DC component product: Vdc * Idc
  Pac: number; // Input AC real power (= Pin)
  formFactor: number;
  rippleFactorPercent: number;
  efficiencyPercent: number | null;
  piv: number;
  pulseNumber: number;
  conductionMode: 'CCM' | 'DCM' | 'INVERTER';
  extinctionAngleDeg: number;
  conductionAngleDeg: number;
  displacementFactor: number;
  powerFactor: number;
  thdCurrentPercent: number;
  theoreticalFormula: string;
  topologyTitle: string;
  topologySubtitle: string;
}

export interface SimulationResult {
  points: WaveformPoint[];
  metrics: SimulationMetrics;
  harmonics: HarmonicBin[];
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Exact analytical step for a linear RL branch driven by a sinusoid of frequency omega
 * (where d^2v/dtheta^2 = -v) or by 0V during freewheeling:
 *   XL * di/dtheta + R * i = v(theta)
 */
function integrateRLBranchStep(
  i0: number,
  dRad: number,
  R: number,
  XL: number,
  v0: number,
  dv0: number,
  v1: number,
  dv1: number
): number {
  if (XL <= 1e-12) {
    return Math.max(0, v1 / R);
  }
  const decay = Math.exp((-R / XL) * dRad);
  if (v0 === 0 && dv0 === 0 && v1 === 0 && dv1 === 0) {
    return i0 * decay;
  }
  const zSq = R * R + XL * XL;
  const ip0 = (R * v0 - XL * dv0) / zSq;
  const ip1 = (R * v1 - XL * dv1) / zSq;
  return ip1 + (i0 - ip0) * decay;
}

export function runRectifierSimulation(params: SimulationParams): SimulationResult {
  const {
    phases,
    waveType,
    deviceType,
    loadType,
    freewheelingDiode,
    Vm,
    freq,
    R,
    L_mH,
  } = params;

  // Enforce alpha = 0 for uncontrolled diode rectifiers
  const maxAlpha = phases === '3p' && waveType === 'half' ? 150 : 165;
  const effectiveAlphaDeg =
    deviceType === 'diode' ? 0 : Math.min(Math.max(0, params.alphaDeg), maxAlpha);

  const omega = 2 * Math.PI * freq;
  // Coupled high-inductance RL model for RL_CONST (XL = 100 * R) vs finite RL (L_mH / 1000)
  const effectiveL =
    loadType === 'R'
      ? 0
      : loadType === 'RL_CONST'
        ? (100 * R) / omega
        : Math.max(1e-6, L_mH / 1000);
  const XL = omega * effectiveL;

  const dDeg = 0.5; // 0.5 degree simulation step
  const dRad = dDeg * DEG_TO_RAD;
  const stepsPerCycle = Math.round(360 / dDeg);

  // Helper for source voltages and their angular derivatives dv/dtheta at any angle in degrees
  const getVoltages = (deg: number) => {
    const rad = deg * DEG_TO_RAD;
    const twoPiOver3 = (2 * Math.PI) / 3;
    const fourPiOver3 = (4 * Math.PI) / 3;

    const va = Vm * Math.sin(rad);
    const dva = Vm * Math.cos(rad);

    const vb = Vm * Math.sin(rad - twoPiOver3);
    const dvb = Vm * Math.cos(rad - twoPiOver3);

    const vc = Vm * Math.sin(rad - fourPiOver3);
    const dvc = Vm * Math.cos(rad - fourPiOver3);

    const vab = va - vb;
    const dvab = dva - dvb;
    const vac = va - vc;
    const dvac = dva - dvc;
    const vbc = vb - vc;
    const dvbc = dvb - dvc;
    const vba = vb - va;
    const dvba = dvb - dva;
    const vca = vc - va;
    const dvca = dvc - dva;
    const vcb = vc - vb;
    const dvcb = dvc - dvb;

    return {
      rad,
      va,
      dva,
      vb,
      dvb,
      vc,
      dvc,
      vab,
      dvab,
      vac,
      dvac,
      vbc,
      dvbc,
      vba,
      dvba,
      vca,
      dvca,
      vcb,
      dvcb,
    };
  };

  const prefix = deviceType === 'diode' ? 'D' : 'T';

  // Returns the instantaneous driving voltage (v, dv/dtheta) for a given active switch state
  const getBranchVoltageForState = (
    state: string,
    v: ReturnType<typeof getVoltages>
  ): { vBranch: number; dvBranch: number } => {
    switch (state) {
      case 'S1':
      case 'P12':
        return { vBranch: v.va, dvBranch: v.dva };
      case 'P34':
        return { vBranch: -v.va, dvBranch: -v.dva };
      case 'S2':
        return { vBranch: v.vb, dvBranch: v.dvb };
      case 'S3':
        return { vBranch: v.vc, dvBranch: v.dvc };
      case 'B0':
        return { vBranch: v.vab, dvBranch: v.dvab };
      case 'B1':
        return { vBranch: v.vac, dvBranch: v.dvac };
      case 'B2':
        return { vBranch: v.vbc, dvBranch: v.dvbc };
      case 'B3':
        return { vBranch: v.vba, dvBranch: v.dvba };
      case 'B4':
        return { vBranch: v.vca, dvBranch: v.dvca };
      case 'B5':
        return { vBranch: v.vcb, dvBranch: v.dvcb };
      case 'FW':
      default:
        return { vBranch: 0, dvBranch: 0 };
    }
  };

  let io = 0;
  let activeState = 'NONE';

  // Advance the simulation by one step (from absDeg - dDeg to absDeg) and evaluate state at absDeg
  const stepSimulation = (absDeg: number, advanceCurrent: boolean): WaveformPoint => {
    const degMod360 = ((absDeg % 360) + 360) % 360;
    const v = getVoltages(absDeg);

    // 1. Advance inductive load current from previous angle (absDeg - dDeg) to absDeg
    if (advanceCurrent && loadType !== 'R' && activeState !== 'NONE') {
      const vPrev = getVoltages(absDeg - dDeg);
      const { vBranch: v0, dvBranch: dv0 } = getBranchVoltageForState(activeState, vPrev);
      const { vBranch: v1, dvBranch: dv1 } = getBranchVoltageForState(activeState, v);

      // Handle zero-crossing into freewheeling inside the step if Dfw is connected
      if (freewheelingDiode && activeState !== 'FW' && v0 > 0 && v1 < 0) {
        const fz = v0 / (v0 - v1);
        const degZ = absDeg - dDeg + fz * dDeg;
        const vZ = getVoltages(degZ);
        const { vBranch: vzVal, dvBranch: dvzVal } = getBranchVoltageForState(activeState, vZ);
        const ioAtZ = integrateRLBranchStep(io, fz * dRad, R, XL, v0, dv0, vzVal, dvzVal);
        if (ioAtZ > 1e-9) {
          activeState = 'FW';
          io = integrateRLBranchStep(ioAtZ, (1 - fz) * dRad, R, XL, 0, 0, 0, 0);
        } else {
          io = 0;
          activeState = 'NONE';
        }
      } else {
        io = integrateRLBranchStep(io, dRad, R, XL, v0, dv0, v1, dv1);
      }

      if (io <= 1e-9) {
        io = 0;
        activeState = 'NONE';
      }
    }

    let vo = 0;
    let activeDevices: string[] = [];
    let activePathLabel = 'Blocking (Off)';
    let gatePulse = 0;
    let ia = 0;
    let ib = 0;
    let ic = 0;
    let ifw = 0;
    let vSwitch1 = 0;

    // =========================================================================
    // 1. SINGLE-PHASE HALF-WAVE (1p + half)
    // =========================================================================
    if (phases === '1p' && waveType === 'half') {
      const pulseWindow = degMod360 >= effectiveAlphaDeg && degMod360 <= effectiveAlphaDeg + 8;
      if (deviceType === 'scr' && pulseWindow) {
        gatePulse = 1;
      }

      const inTriggerWindow =
        degMod360 >= effectiveAlphaDeg &&
        degMod360 < 180 &&
        (v.va > 0 || (v.va >= -1e-9 && v.dva > 0));

      if (loadType === 'R') {
        if (inTriggerWindow) {
          activeState = 'S1';
          vo = Math.max(0, v.va);
          io = vo / R;
        } else {
          activeState = 'NONE';
          vo = 0;
          io = 0;
        }
      } else {
        if (inTriggerWindow) {
          activeState = 'S1';
        } else if (
          activeState === 'S1' &&
          freewheelingDiode &&
          (v.va < 0 || (v.va <= 1e-9 && v.dva < 0))
        ) {
          activeState = io > 1e-9 ? 'FW' : 'NONE';
        }

        if (activeState !== 'S1' && activeState !== 'FW') {
          activeState = 'NONE';
          io = 0;
        }

        if (activeState === 'S1') {
          vo = v.va;
        } else {
          vo = 0;
        }
      }

      if (activeState === 'S1') {
        activeDevices = [`${prefix}1`];
        activePathLabel = `${prefix}1 Conducting`;
        ia = io;
        vSwitch1 = 0;
      } else if (activeState === 'FW') {
        activeDevices = ['Dfw'];
        activePathLabel = 'Dfw Freewheeling';
        ifw = io;
        vSwitch1 = v.va;
      } else {
        activeDevices = [];
        activePathLabel = 'Cut-off (Blocking)';
        vSwitch1 = v.va;
      }
    }

    // =========================================================================
    // 2. SINGLE-PHASE FULL-WAVE BRIDGE (1p + full)
    // =========================================================================
    else if (phases === '1p' && waveType === 'full') {
      const trig1 = effectiveAlphaDeg;
      const trig2 = (180 + effectiveAlphaDeg) % 360;

      const p1 =
        Math.abs(degMod360 - trig1) < 4 || (degMod360 >= trig1 && degMod360 <= trig1 + 7);
      const p2 =
        Math.abs(degMod360 - trig2) < 4 || (degMod360 >= trig2 && degMod360 <= trig2 + 7);
      if (deviceType === 'scr' && (p1 || p2)) {
        gatePulse = 1;
      }

      const inPosSlot1 =
        degMod360 >= effectiveAlphaDeg &&
        degMod360 < 180 &&
        (v.va > 0 || (v.va >= -1e-9 && v.dva > 0));
      const inPosSlot2 =
        degMod360 >= 180 + effectiveAlphaDeg &&
        degMod360 < 360 &&
        (-v.va > 0 || (-v.va >= -1e-9 && -v.dva > 0));

      if (loadType === 'R') {
        if (inPosSlot1) {
          activeState = 'P12';
          vo = Math.max(0, v.va);
          io = vo / R;
        } else if (inPosSlot2) {
          activeState = 'P34';
          vo = Math.max(0, -v.va);
          io = vo / R;
        } else {
          activeState = 'NONE';
          vo = 0;
          io = 0;
        }
      } else {
        if (inPosSlot1) {
          activeState = 'P12';
        } else if (inPosSlot2) {
          activeState = 'P34';
        } else if (
          activeState === 'P12' &&
          freewheelingDiode &&
          (v.va < 0 || (v.va <= 1e-9 && v.dva < 0))
        ) {
          activeState = io > 1e-9 ? 'FW' : 'NONE';
        } else if (
          activeState === 'P34' &&
          freewheelingDiode &&
          (-v.va < 0 || (-v.va <= 1e-9 && -v.dva < 0))
        ) {
          activeState = io > 1e-9 ? 'FW' : 'NONE';
        }

        if (activeState !== 'P12' && activeState !== 'P34' && activeState !== 'FW') {
          activeState = 'NONE';
          io = 0;
        }

        if (activeState === 'P12') {
          vo = v.va;
        } else if (activeState === 'P34') {
          vo = -v.va;
        } else {
          vo = 0;
        }
      }

      if (activeState === 'P12') {
        activeDevices = [`${prefix}1`, `${prefix}2`];
        activePathLabel = `${prefix}1 + ${prefix}2 (+Vs)`;
        ia = io;
        vSwitch1 = 0;
      } else if (activeState === 'P34') {
        activeDevices = [`${prefix}3`, `${prefix}4`];
        activePathLabel = `${prefix}3 + ${prefix}4 (-Vs)`;
        ia = -io;
        vSwitch1 = v.va;
      } else if (activeState === 'FW') {
        activeDevices = ['Dfw'];
        activePathLabel = 'Dfw Freewheeling';
        ifw = io;
        vSwitch1 = Math.min(0, v.va);
      } else {
        activeDevices = [];
        activePathLabel = 'Blocking (DCM)';
        vSwitch1 = v.va;
      }
    }

    // =========================================================================
    // 3. THREE-PHASE HALF-WAVE (3p + half, 3-Pulse Star)
    // =========================================================================
    else if (phases === '3p' && waveType === 'half') {
      const tA = (30 + effectiveAlphaDeg) % 360;
      const tB = (150 + effectiveAlphaDeg) % 360;
      const tC = (270 + effectiveAlphaDeg) % 360;

      const isPulse =
        (degMod360 >= tA && degMod360 <= tA + 6) ||
        (degMod360 >= tB && degMod360 <= tB + 6) ||
        (degMod360 >= tC && degMod360 <= tC + 6);
      if (deviceType === 'scr' && isPulse) {
        gatePulse = 1;
      }

      const relDeg = (((degMod360 - (30 + effectiveAlphaDeg)) % 360) + 360) % 360;
      let sectorPhase: 'S1' | 'S2' | 'S3' = 'S1';
      let vSector = v.va;
      let dvSector = v.dva;
      if (relDeg < 120) {
        sectorPhase = 'S1';
        vSector = v.va;
        dvSector = v.dva;
      } else if (relDeg < 240) {
        sectorPhase = 'S2';
        vSector = v.vb;
        dvSector = v.dvb;
      } else {
        sectorPhase = 'S3';
        vSector = v.vc;
        dvSector = v.dvc;
      }

      const sectorPositive = vSector > 0 || (vSector >= -1e-9 && dvSector > 0);

      if (loadType === 'R') {
        if (sectorPositive) {
          activeState = sectorPhase;
          vo = Math.max(0, vSector);
          io = vo / R;
        } else {
          activeState = 'NONE';
          vo = 0;
          io = 0;
        }
      } else {
        if (sectorPositive) {
          activeState = sectorPhase;
        } else {
          const { vBranch: vCur, dvBranch: dvCur } = getBranchVoltageForState(activeState, v);
          if (
            (activeState === 'S1' || activeState === 'S2' || activeState === 'S3') &&
            freewheelingDiode &&
            (vCur < 0 || (vCur <= 1e-9 && dvCur < 0))
          ) {
            activeState = io > 1e-9 ? 'FW' : 'NONE';
          }
        }

        if (
          activeState !== 'S1' &&
          activeState !== 'S2' &&
          activeState !== 'S3' &&
          activeState !== 'FW'
        ) {
          activeState = 'NONE';
          io = 0;
        }

        if (activeState === 'S1') vo = v.va;
        else if (activeState === 'S2') vo = v.vb;
        else if (activeState === 'S3') vo = v.vc;
        else vo = 0;
      }

      if (activeState === 'S1') {
        activeDevices = [`${prefix}1`];
        activePathLabel = `${prefix}1 (Phase A)`;
        ia = io;
        vSwitch1 = 0;
      } else if (activeState === 'S2') {
        activeDevices = [`${prefix}2`];
        activePathLabel = `${prefix}2 (Phase B)`;
        ib = io;
        vSwitch1 = v.va - v.vb;
      } else if (activeState === 'S3') {
        activeDevices = [`${prefix}3`];
        activePathLabel = `${prefix}3 (Phase C)`;
        ic = io;
        vSwitch1 = v.va - v.vc;
      } else if (activeState === 'FW') {
        activeDevices = ['Dfw'];
        activePathLabel = 'Dfw Freewheeling';
        ifw = io;
        vSwitch1 = v.va;
      } else {
        activeDevices = [];
        activePathLabel = 'Blocking (DCM)';
        vSwitch1 = v.va;
      }
    }

    // =========================================================================
    // 4. THREE-PHASE FULL-WAVE BRIDGE (3p + full, 6-Pulse B6 Bridge)
    // =========================================================================
    else {
      const relDeg = (((degMod360 - (30 + effectiveAlphaDeg)) % 360) + 360) % 360;
      const sectorIdx = Math.min(5, Math.floor(relDeg / 60)); // 0..5
      const degInSector = relDeg % 60;

      if (deviceType === 'scr' && degInSector <= 5) {
        gatePulse = 1;
      }

      const sectorMap = [
        { state: 'B0', devs: [`${prefix}1`, `${prefix}6`], label: `${prefix}1 + ${prefix}6 (Vab)`, vLine: v.vab, dvLine: v.dvab, pPos: 'A', pNeg: 'B' },
        { state: 'B1', devs: [`${prefix}1`, `${prefix}2`], label: `${prefix}1 + ${prefix}2 (Vac)`, vLine: v.vac, dvLine: v.dvac, pPos: 'A', pNeg: 'C' },
        { state: 'B2', devs: [`${prefix}3`, `${prefix}2`], label: `${prefix}3 + ${prefix}2 (Vbc)`, vLine: v.vbc, dvLine: v.dvbc, pPos: 'B', pNeg: 'C' },
        { state: 'B3', devs: [`${prefix}3`, `${prefix}4`], label: `${prefix}3 + ${prefix}4 (Vba)`, vLine: v.vba, dvLine: v.dvba, pPos: 'B', pNeg: 'A' },
        { state: 'B4', devs: [`${prefix}5`, `${prefix}4`], label: `${prefix}5 + ${prefix}4 (Vca)`, vLine: v.vca, dvLine: v.dvca, pPos: 'C', pNeg: 'A' },
        { state: 'B5', devs: [`${prefix}5`, `${prefix}6`], label: `${prefix}5 + ${prefix}6 (Vcb)`, vLine: v.vcb, dvLine: v.dvcb, pPos: 'C', pNeg: 'B' },
      ];

      const activeSector = sectorMap[sectorIdx] || sectorMap[0];
      const sectorPositive =
        activeSector.vLine > 0 || (activeSector.vLine >= -1e-9 && activeSector.dvLine > 0);

      if (loadType === 'R') {
        if (sectorPositive) {
          activeState = activeSector.state;
          vo = Math.max(0, activeSector.vLine);
          io = vo / R;
        } else {
          activeState = 'NONE';
          vo = 0;
          io = 0;
        }
      } else {
        if (sectorPositive) {
          activeState = activeSector.state;
        } else {
          const matchedCur = sectorMap.find((s) => s.state === activeState);
          if (
            matchedCur &&
            freewheelingDiode &&
            (matchedCur.vLine < 0 || (matchedCur.vLine <= 1e-9 && matchedCur.dvLine < 0))
          ) {
            activeState = io > 1e-9 ? 'FW' : 'NONE';
          }
        }

        const matched = sectorMap.find((s) => s.state === activeState);
        if (matched) {
          vo = matched.vLine;
        } else if (activeState === 'FW') {
          vo = 0;
        } else {
          activeState = 'NONE';
          vo = 0;
          io = 0;
        }
      }

      const matched = sectorMap.find((s) => s.state === activeState);
      if (matched) {
        activeDevices = matched.devs;
        activePathLabel = matched.label;
        if (matched.pPos === 'A') ia = io;
        if (matched.pNeg === 'A') ia = -io;
        if (matched.pPos === 'B') ib = io;
        if (matched.pNeg === 'B') ib = -io;
        if (matched.pPos === 'C') ic = io;
        if (matched.pNeg === 'C') ic = -io;

        if (matched.pPos === 'A') {
          vSwitch1 = 0;
        } else if (matched.pPos === 'B') {
          vSwitch1 = v.vab;
        } else {
          vSwitch1 = v.vac;
        }
      } else if (activeState === 'FW') {
        activeDevices = ['Dfw'];
        activePathLabel = 'Dfw Freewheeling';
        ifw = io;
        vSwitch1 = Math.min(0, v.vab);
      } else {
        activeDevices = [];
        activePathLabel = 'Blocking (DCM)';
        vSwitch1 = v.vab;
      }
    }

    return {
      deg: 0,
      rad: 0,
      va: v.va,
      vb: v.vb,
      vc: v.vc,
      vab: v.vab,
      vac: v.vac,
      vbc: v.vbc,
      vba: v.vba,
      vca: v.vca,
      vcb: v.vcb,
      vo,
      io,
      ia,
      ib,
      ic,
      ifw,
      vSwitch1,
      gatePulse,
      activeDevices,
      activePathLabel,
    };
  };

  // Run one full 360-degree cycle starting from current (io, activeState)
  const runOneFullCycle = (cycleIndex: number) => {
    const startStep = cycleIndex * stepsPerCycle;
    for (let s = 1; s <= stepsPerCycle; s++) {
      stepSimulation((startStep + s) * dDeg, true);
    }
  };

  // Initialize at deg = 0
  stepSimulation(0, false);

  if (loadType !== 'R') {
    // Pass 1: Run 3 cycles and apply Aitken delta-squared fixed-point convergence for CCM RL / RL_CONST
    runOneFullCycle(0);
    const i1 = io;
    runOneFullCycle(1);
    const i2 = io;
    runOneFullCycle(2);
    const i3 = io;

    if (i1 > 1e-6 && i2 > 1e-6 && i3 > 1e-6) {
      const denom = i3 - 2 * i2 + i1;
      if (Math.abs(denom) > 1e-12) {
        const iStar = (i1 * i3 - i2 * i2) / denom;
        if (Number.isFinite(iStar) && iStar >= 0) {
          io = iStar;
        }
      }
    }

    // Pass 2: Run 3 more cycles and refine steady-state fixed point if needed
    runOneFullCycle(3);
    const j1 = io;
    runOneFullCycle(4);
    const j2 = io;
    runOneFullCycle(5);
    const j3 = io;

    if (j1 > 1e-6 && j2 > 1e-6 && j3 > 1e-6) {
      const denom2 = j3 - 2 * j2 + j1;
      if (Math.abs(denom2) > 1e-12) {
        const jStar = (j1 * j3 - j2 * j2) / denom2;
        if (Number.isFinite(jStar) && jStar >= 0) {
          io = jStar;
        }
      }
    }

    // Run 1 uninterrupted settling cycle before recording
    runOneFullCycle(6);
  } else {
    runOneFullCycle(0);
  }

  // Record 2 uninterrupted steady-state cycles (720 degrees at 1-degree intervals -> 721 points)
  const rawSteadyState: WaveformPoint[] = [];
  const recordStartCycle = loadType !== 'R' ? 7 : 1;
  const recordStartStep = recordStartCycle * stepsPerCycle;

  // Point at recordedDeg = 0
  const pt0 = stepSimulation(recordStartStep * dDeg, false);
  pt0.deg = 0;
  pt0.rad = 0;
  rawSteadyState.push(pt0);

  for (let s = 1; s <= 2 * stepsPerCycle; s++) {
    const pt = stepSimulation((recordStartStep + s) * dDeg, true);
    if (s % 2 === 0) {
      const recordedDeg = s * dDeg;
      pt.deg = recordedDeg;
      pt.rad = recordedDeg * DEG_TO_RAD;
      rawSteadyState.push(pt);
    }
  }

  // Compute numerical integrals over one full 360-degree steady-state cycle (indices 0..359)
  const cyclePoints = rawSteadyState.slice(0, 360);
  const N = cyclePoints.length;

  let sumVo = 0;
  let sumVoSq = 0;
  let sumIo = 0;
  let sumIoSq = 0;
  let sumVoIo = 0;
  let sumPin = 0;
  let minSwitchV = 0;
  let conductingCount = 0;
  let lastConductingDeg = 0;

  for (const pt of cyclePoints) {
    sumVo += pt.vo;
    sumVoSq += pt.vo * pt.vo;
    sumIo += pt.io;
    sumIoSq += pt.io * pt.io;
    sumVoIo += pt.vo * pt.io;

    const instPin =
      phases === '1p'
        ? pt.va * pt.ia
        : pt.va * pt.ia + pt.vb * pt.ib + pt.vc * pt.ic;
    sumPin += instPin;

    if (pt.vSwitch1 < minSwitchV) {
      minSwitchV = pt.vSwitch1;
    }
    if (pt.io > 0.01) {
      conductingCount++;
      lastConductingDeg = pt.deg;
    }
  }

  const Vdc = sumVo / N;
  const Vrms = Math.sqrt(sumVoSq / N);
  const Idc = sumIo / N;
  const Irms = Math.sqrt(sumIoSq / N);

  // Actual average output real power and input real power from instantaneous samples
  const Pout = sumVoIo / N;
  const Pin = sumPin / N;
  const Pdc = Vdc * Idc;
  const Pac = Pin;

  const absVdc = Math.max(Math.abs(Vdc), 0.001);
  const formFactor = Vrms / absVdc;
  const rippleFactorPercent = Math.sqrt(Math.max(0, formFactor * formFactor - 1)) * 100;
  const efficiencyPercent =
    Pin > 1e-3 && Pout >= 0 ? Math.min(100, (Pout / Pin) * 100) : null;

  // Theoretical PIV
  const piv = phases === '3p' ? Math.sqrt(3) * Vm : Vm;

  const pulseNumber =
    phases === '1p' && waveType === 'half'
      ? 1
      : phases === '1p' && waveType === 'full'
        ? 2
        : phases === '3p' && waveType === 'half'
          ? 3
          : 6;

  const conductionMode: 'CCM' | 'DCM' | 'INVERTER' =
    Vdc < -0.5
      ? 'INVERTER'
      : conductingCount >= 355
        ? 'CCM'
        : 'DCM';

  // Compute Fourier Harmonics (Orders 1 to 13) for Vo and Ia
  const harmonics: HarmonicBin[] = [];
  let a1_ia = 0;
  let b1_ia = 0;

  for (let n = 1; n <= 13; n++) {
    let an_vo = 0;
    let bn_vo = 0;
    let an_ia = 0;
    let bn_ia = 0;

    for (const pt of cyclePoints) {
      const nTheta = n * pt.rad;
      const cosVal = Math.cos(nTheta);
      const sinVal = Math.sin(nTheta);
      an_vo += pt.vo * cosVal;
      bn_vo += pt.vo * sinVal;
      an_ia += pt.ia * cosVal;
      bn_ia += pt.ia * sinVal;
    }

    an_vo = (2 / N) * an_vo;
    bn_vo = (2 / N) * bn_vo;
    an_ia = (2 / N) * an_ia;
    bn_ia = (2 / N) * bn_ia;

    if (n === 1) {
      a1_ia = an_ia;
      b1_ia = bn_ia;
    }

    const voMag = Math.sqrt(an_vo * an_vo + bn_vo * bn_vo);
    const iaMag = Math.sqrt(an_ia * an_ia + bn_ia * bn_ia);

    harmonics.push({
      order: n,
      freqHz: n * freq,
      voMagnitude: voMag,
      voPercent: (voMag / Vm) * 100,
      iaMagnitude: iaMag,
      iaPercent: 0, // normalized below
    });
  }

  const fundamentalIaPeak = harmonics[0]?.iaMagnitude || 0.001;
  let sumHarmonicIaSq = 0;
  harmonics.forEach((h, idx) => {
    h.iaPercent = fundamentalIaPeak > 0.01 ? (h.iaMagnitude / fundamentalIaPeak) * 100 : 0;
    if (idx > 0) {
      sumHarmonicIaSq += h.iaMagnitude * h.iaMagnitude;
    }
  });

  // Fundamental phase angle of Ia relative to Va = Vm sin(theta)
  const phi1Rad = Math.atan2(a1_ia, Math.max(0.0001, b1_ia));
  const displacementFactor = Math.cos(phi1Rad);
  const thdCurrentPercent =
    fundamentalIaPeak > 0.01
      ? (Math.sqrt(sumHarmonicIaSq) / fundamentalIaPeak) * 100
      : 0;
  const distortionFactor = 1 / Math.sqrt(1 + Math.pow(thdCurrentPercent / 100, 2));
  const powerFactor = Math.abs(displacementFactor * distortionFactor);

  // Formula & Topology labels
  let theoreticalFormula = '';
  let topologyTitle = '';
  let topologySubtitle = '';

  const devName = deviceType === 'diode' ? 'Uncontrolled Diode' : 'Thyristor (SCR) Controlled';
  if (phases === '1p' && waveType === 'half') {
    topologyTitle = `1-Phase Half-Wave ${devName} Rectifier`;
    topologySubtitle = `1-Pulse Converter · Single Switch (${prefix}1)`;
    theoreticalFormula =
      deviceType === 'diode'
        ? loadType === 'R' || freewheelingDiode
          ? 'Vdc = Vm / π ≈ 0.318 Vm'
          : 'Vdc = (Vm / 2π) · (1 - cos β) [RL load, β > 180°]'
        : loadType === 'R' || freewheelingDiode
          ? 'Vdc = (Vm / 2π) · (1 + cos α)'
          : 'Vdc = (Vm / 2π) · (cos α - cos β)';
  } else if (phases === '1p' && waveType === 'full') {
    topologyTitle = `1-Phase Full-Wave Bridge ${devName} Rectifier`;
    topologySubtitle = `2-Pulse Graetz Bridge · 4 Switches (${prefix}1–${prefix}4)`;
    theoreticalFormula =
      deviceType === 'diode'
        ? 'Vdc = 2Vm / π ≈ 0.637 Vm'
        : loadType === 'R' || freewheelingDiode
          ? 'Vdc = (Vm / π) · (1 + cos α)'
          : 'Vdc = (2Vm / π) · cos α';
  } else if (phases === '3p' && waveType === 'half') {
    topologyTitle = `3-Phase Half-Wave ${devName} Rectifier`;
    topologySubtitle = `3-Pulse Star Common-Cathode · 3 Switches (${prefix}1–${prefix}3)`;
    theoreticalFormula =
      deviceType === 'diode'
        ? 'Vdc = (3√3 / 2π) Vm ≈ 0.827 Vm'
        : effectiveAlphaDeg <= 30 || (loadType !== 'R' && !freewheelingDiode)
          ? 'Vdc = (3√3 Vm / 2π) · cos α'
          : 'Vdc = (3Vm / 2π) · [1 + cos(α + 30°)]';
  } else {
    topologyTitle = `3-Phase Full-Wave Bridge ${devName} Rectifier`;
    topologySubtitle = `6-Pulse B6 Bridge Converter · 6 Switches (${prefix}1–${prefix}6)`;
    theoreticalFormula =
      deviceType === 'diode'
        ? 'Vdc = (3√3 / π) Vm ≈ 1.654 Vm'
        : effectiveAlphaDeg <= 60 || (loadType !== 'R' && !freewheelingDiode)
          ? 'Vdc = (3√3 Vm / π) · cos α'
          : 'Vdc = (3√3 Vm / π) · [1 + cos(α + 60°)]';
  }

  return {
    points: rawSteadyState,
    metrics: {
      Vdc,
      Vrms,
      Idc,
      Irms,
      Pout,
      Pin,
      Pdc,
      Pac,
      formFactor,
      rippleFactorPercent,
      efficiencyPercent,
      piv,
      pulseNumber,
      conductionMode,
      extinctionAngleDeg: lastConductingDeg,
      conductionAngleDeg: conductingCount,
      displacementFactor,
      powerFactor,
      thdCurrentPercent,
      theoreticalFormula,
      topologyTitle,
      topologySubtitle,
    },
    harmonics,
  };
}
