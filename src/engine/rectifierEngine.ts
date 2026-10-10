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
  Pdc: number;
  Pac: number;
  formFactor: number;
  rippleFactorPercent: number;
  efficiencyPercent: number;
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
const RAD_TO_DEG = 180 / Math.PI;

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
  const effectiveAlphaDeg = deviceType === 'diode' ? 0 : Math.min(Math.max(0, params.alphaDeg), maxAlpha);
  const alphaRad = effectiveAlphaDeg * DEG_TO_RAD;

  const omega = 2 * Math.PI * freq;
  const effectiveL = loadType === 'R' ? 0 : L_mH / 1000;
  const dDeg = 0.5; // 0.5 degree simulation step for high accuracy
  const dRad = dDeg * DEG_TO_RAD;
  const dt = dRad / omega;

  // Simulate 4 full cycles (0 to 1440 deg) so RL transients settle into steady-state
  const totalCycles = 4;
  const stepsPerCycle = Math.round(360 / dDeg);
  const totalSteps = totalCycles * stepsPerCycle;

  let io = 0;
  let activeState = 'NONE'; // Tracks which switch or pair is currently conducting

  // Helper for source voltages at any angle in degrees
  const getVoltages = (deg: number) => {
    const rad = deg * DEG_TO_RAD;
    const va = Vm * Math.sin(rad);
    const vb = Vm * Math.sin(rad - (2 * Math.PI) / 3);
    const vc = Vm * Math.sin(rad - (4 * Math.PI) / 3);
    const vab = va - vb;
    const vac = va - vc;
    const vbc = vb - vc;
    const vba = vb - va;
    const vca = vc - va;
    const vcb = vc - vb;
    return { rad, va, vb, vc, vab, vac, vbc, vba, vca, vcb };
  };

  const prefix = deviceType === 'diode' ? 'D' : 'T';

  // Store last 2 cycles (720 degrees, 1 degree spacing -> 721 points)
  const rawSteadyState: WaveformPoint[] = [];

  for (let step = 0; step <= totalSteps; step++) {
    const absDeg = step * dDeg;
    const degMod360 = ((absDeg % 360) + 360) % 360;
    const v = getVoltages(absDeg);

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

      // Trigger condition: angle >= alpha in positive half cycle
      const canTrigger = degMod360 >= effectiveAlphaDeg && degMod360 < 180 && v.va > 0;
      if (canTrigger && (activeState === 'NONE' || activeState === 'FW')) {
        activeState = 'S1';
      }

      // Check freewheeling transition when va drops below 0
      if (activeState === 'S1' && v.va < 0 && freewheelingDiode && (io > 0 || loadType === 'RL_CONST')) {
        activeState = 'FW';
      }

      if (loadType === 'R') {
        if (degMod360 >= effectiveAlphaDeg && degMod360 <= 180 && v.va > 0) {
          vo = v.va;
          io = vo / R;
          activeState = 'S1';
        } else {
          vo = 0;
          io = 0;
          activeState = 'NONE';
        }
      } else if (loadType === 'RL_CONST') {
        // Constant current approx for 1p half wave (only physical with freewheeling diode, or large L)
        if (degMod360 >= effectiveAlphaDeg && degMod360 < 180) {
          vo = v.va;
          activeState = 'S1';
        } else if (freewheelingDiode) {
          vo = 0;
          activeState = 'FW';
        } else {
          // Without Dfw, current extinguishes before 360
          const betaCheck = 360 - effectiveAlphaDeg;
          if (degMod360 >= effectiveAlphaDeg && degMod360 <= Math.min(340, betaCheck)) {
            vo = v.va;
            activeState = 'S1';
          } else {
            vo = 0;
            activeState = 'NONE';
          }
        }
      } else {
        // Exact RL integration
        if (activeState === 'S1') {
          vo = v.va;
          const dio = ((vo - R * io) / effectiveL) * dt;
          io = io + dio;
          if (io <= 0 && degMod360 > effectiveAlphaDeg + 2) {
            io = 0;
            vo = 0;
            activeState = 'NONE';
          }
        } else if (activeState === 'FW') {
          vo = 0;
          const dio = ((-R * io) / effectiveL) * dt;
          io = io + dio;
          if (io <= 0) {
            io = 0;
            activeState = 'NONE';
          }
        } else {
          vo = 0;
          io = 0;
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

      const p1 = Math.abs(degMod360 - trig1) < 4 || (degMod360 >= trig1 && degMod360 <= trig1 + 7);
      const p2 = Math.abs(degMod360 - trig2) < 4 || (degMod360 >= trig2 && degMod360 <= trig2 + 7);
      if (deviceType === 'scr' && (p1 || p2)) {
        gatePulse = 1;
      }

      // Determine natural active pair based on firing angle
      const inSlot1 = degMod360 >= effectiveAlphaDeg && degMod360 < 180 + effectiveAlphaDeg;

      if (loadType === 'R') {
        if (inSlot1 && v.va > 0) {
          vo = v.va;
          io = vo / R;
          activeState = 'P12';
        } else if (!inSlot1 && -v.va > 0) {
          vo = -v.va;
          io = vo / R;
          activeState = 'P34';
        } else {
          vo = 0;
          io = 0;
          activeState = 'NONE';
        }
      } else if (loadType === 'RL_CONST') {
        if (inSlot1) {
          if (freewheelingDiode && v.va < 0) {
            vo = 0;
            activeState = 'FW';
          } else {
            vo = v.va;
            activeState = 'P12';
          }
        } else {
          if (freewheelingDiode && -v.va < 0) {
            vo = 0;
            activeState = 'FW';
          } else {
            vo = -v.va;
            activeState = 'P34';
          }
        }
      } else {
        // Finite RL load
        if (inSlot1 && degMod360 < 180 && v.va > 0) {
          activeState = 'P12';
        } else if (!inSlot1 && ((degMod360 >= 180 + effectiveAlphaDeg && degMod360 < 360) || degMod360 < effectiveAlphaDeg) && -v.va > 0) {
          activeState = 'P34';
        }

        // Check freewheeling clamp
        if (activeState === 'P12' && v.va < 0 && freewheelingDiode && io > 0) {
          activeState = 'FW';
        } else if (activeState === 'P34' && -v.va < 0 && freewheelingDiode && io > 0) {
          activeState = 'FW';
        }

        if (activeState === 'P12') {
          vo = v.va;
        } else if (activeState === 'P34') {
          vo = -v.va;
        } else {
          vo = 0;
        }

        if (activeState !== 'NONE') {
          const dio = ((vo - R * io) / effectiveL) * dt;
          io = io + dio;
          if (io <= 0) {
            io = 0;
            vo = 0;
            activeState = 'NONE';
          }
        } else {
          io = 0;
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
      // Natural commutation points: 30 deg (Phase A), 150 deg (Phase B), 270 deg (Phase C)
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

      // Shift angle relative to 30 + alpha to find active 120-deg sector
      const relDeg = (((degMod360 - (30 + effectiveAlphaDeg)) % 360) + 360) % 360;
      let sectorPhase: 'S1' | 'S2' | 'S3' = 'S1';
      let vSector = v.va;
      if (relDeg < 120) {
        sectorPhase = 'S1';
        vSector = v.va;
      } else if (relDeg < 240) {
        sectorPhase = 'S2';
        vSector = v.vb;
      } else {
        sectorPhase = 'S3';
        vSector = v.vc;
      }

      if (loadType === 'R') {
        if (vSector > 0) {
          vo = vSector;
          io = vo / R;
          activeState = sectorPhase;
        } else {
          vo = 0;
          io = 0;
          activeState = 'NONE';
        }
      } else if (loadType === 'RL_CONST') {
        if (freewheelingDiode && vSector < 0) {
          vo = 0;
          activeState = 'FW';
        } else {
          vo = vSector;
          activeState = sectorPhase;
        }
      } else {
        // Finite RL
        if (vSector > 0) {
          activeState = sectorPhase;
        } else if (activeState === sectorPhase && freewheelingDiode && io > 0) {
          activeState = 'FW';
        }

        if (activeState === 'S1') vo = v.va;
        else if (activeState === 'S2') vo = v.vb;
        else if (activeState === 'S3') vo = v.vc;
        else vo = 0;

        if (activeState !== 'NONE') {
          const dio = ((vo - R * io) / effectiveL) * dt;
          io = io + dio;
          if (io <= 0) {
            io = 0;
            vo = 0;
            activeState = 'NONE';
          }
        } else {
          io = 0;
          vo = 0;
        }
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
      // 6 commutation intervals of 60 deg starting at 30 + alpha
      const relDeg = (((degMod360 - (30 + effectiveAlphaDeg)) % 360) + 360) % 360;
      const sectorIdx = Math.floor(relDeg / 60); // 0..5
      const degInSector = relDeg % 60;

      if (deviceType === 'scr' && degInSector <= 5) {
        gatePulse = 1;
      }

      // Map sector index 0..5 to standard IEEE 6-pulse switch pairs and line voltages
      // 0: T1 + T6 (Vab), 1: T1 + T2 (Vac), 2: T3 + T2 (Vbc),
      // 3: T3 + T4 (Vba), 4: T5 + T4 (Vca), 5: T5 + T6 (Vcb)
      const sectorMap = [
        { state: 'B0', devs: [`${prefix}1`, `${prefix}6`], label: `${prefix}1 + ${prefix}6 (Vab)`, vLine: v.vab, pPos: 'A', pNeg: 'B' },
        { state: 'B1', devs: [`${prefix}1`, `${prefix}2`], label: `${prefix}1 + ${prefix}2 (Vac)`, vLine: v.vac, pPos: 'A', pNeg: 'C' },
        { state: 'B2', devs: [`${prefix}3`, `${prefix}2`], label: `${prefix}3 + ${prefix}2 (Vbc)`, vLine: v.vbc, pPos: 'B', pNeg: 'C' },
        { state: 'B3', devs: [`${prefix}3`, `${prefix}4`], label: `${prefix}3 + ${prefix}4 (Vba)`, vLine: v.vba, pPos: 'B', pNeg: 'A' },
        { state: 'B4', devs: [`${prefix}5`, `${prefix}4`], label: `${prefix}5 + ${prefix}4 (Vca)`, vLine: v.vca, pPos: 'C', pNeg: 'A' },
        { state: 'B5', devs: [`${prefix}5`, `${prefix}6`], label: `${prefix}5 + ${prefix}6 (Vcb)`, vLine: v.vcb, pPos: 'C', pNeg: 'B' },
      ];

      const activeSector = sectorMap[sectorIdx] || sectorMap[0];

      if (loadType === 'R') {
        if (activeSector.vLine > 0) {
          vo = activeSector.vLine;
          io = vo / R;
          activeState = activeSector.state;
        } else {
          vo = 0;
          io = 0;
          activeState = 'NONE';
        }
      } else if (loadType === 'RL_CONST') {
        if (freewheelingDiode && activeSector.vLine < 0) {
          vo = 0;
          activeState = 'FW';
        } else {
          vo = activeSector.vLine;
          activeState = activeSector.state;
        }
      } else {
        // Finite RL
        if (activeSector.vLine > 0) {
          activeState = activeSector.state;
        } else if (activeState === activeSector.state && freewheelingDiode && io > 0) {
          activeState = 'FW';
        }

        const matched = sectorMap.find((s) => s.state === activeState);
        if (matched) {
          vo = matched.vLine;
        } else {
          vo = 0;
        }

        if (activeState !== 'NONE') {
          const dio = ((vo - R * io) / effectiveL) * dt;
          io = io + dio;
          if (io <= 0) {
            io = 0;
            vo = 0;
            activeState = 'NONE';
          }
        } else {
          io = 0;
          vo = 0;
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

        // Voltage across T1/D1 (top Phase A switch)
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

    // Record the last 2 full cycles (720 degrees) at 1-degree intervals
    const startRecordStep = (totalCycles - 2) * stepsPerCycle;
    if (step >= startRecordStep && (step - startRecordStep) % 2 === 0) {
      const recordedDeg = (step - startRecordStep) * dDeg;
      rawSteadyState.push({
        deg: recordedDeg,
        rad: recordedDeg * DEG_TO_RAD,
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
      });
    }
  }

  // If loadType === 'RL_CONST', compute constant DC link current Idc = max(0, Vdc / R)
  // (or nominal current if in inverter mode with active DC source)
  if (loadType === 'RL_CONST') {
    const avgVo =
      rawSteadyState.slice(0, 360).reduce((acc, p) => acc + p.vo, 0) / 360;
    const constId = Math.max(Math.abs(avgVo) / R, Vm / (R * 4));
    for (const pt of rawSteadyState) {
      if (pt.activeDevices.length > 0) {
        pt.io = constId;
        if (pt.activeDevices.includes('Dfw')) {
          pt.ifw = constId;
          pt.ia = 0;
          pt.ib = 0;
          pt.ic = 0;
        } else if (phases === '1p' && waveType === 'half') {
          pt.ia = constId;
        } else if (phases === '1p' && waveType === 'full') {
          pt.ia = pt.activeDevices.includes(`${prefix}1`) ? constId : -constId;
        } else if (phases === '3p' && waveType === 'half') {
          pt.ia = pt.activeDevices.includes(`${prefix}1`) ? constId : 0;
          pt.ib = pt.activeDevices.includes(`${prefix}2`) ? constId : 0;
          pt.ic = pt.activeDevices.includes(`${prefix}3`) ? constId : 0;
        } else {
          // 3p full bridge
          const d = pt.activeDevices;
          pt.ia = d.includes(`${prefix}1`) ? constId : d.includes(`${prefix}4`) ? -constId : 0;
          pt.ib = d.includes(`${prefix}3`) ? constId : d.includes(`${prefix}6`) ? -constId : 0;
          pt.ic = d.includes(`${prefix}5`) ? constId : d.includes(`${prefix}2`) ? -constId : 0;
        }
      } else {
        pt.io = 0;
      }
    }
  }

  // Compute numerical integrals over one full 360-degree cycle (indices 0..359)
  const cyclePoints = rawSteadyState.slice(0, 360);
  const N = cyclePoints.length;

  let sumVo = 0;
  let sumVoSq = 0;
  let sumIo = 0;
  let sumIoSq = 0;
  let minSwitchV = 0;
  let conductingCount = 0;
  let lastConductingDeg = 0;

  for (const pt of cyclePoints) {
    sumVo += pt.vo;
    sumVoSq += pt.vo * pt.vo;
    sumIo += pt.io;
    sumIoSq += pt.io * pt.io;
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
  const Pdc = Vdc * Idc;
  const Pac = Vrms * Irms;

  const absVdc = Math.max(Math.abs(Vdc), 0.001);
  const formFactor = Vrms / absVdc;
  const rippleFactorPercent = Math.sqrt(Math.max(0, formFactor * formFactor - 1)) * 100;
  const efficiencyPercent = Pac > 0.001 ? Math.min(100, (Math.abs(Pdc) / Pac) * 100) : 0;

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
        ? 'Vdc = Vm / π ≈ 0.318 Vm'
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
