import test from 'node:test';
import assert from 'node:assert/strict';
import { runRectifierSimulation, SimulationParams } from './rectifierEngine.ts';

const BASE_PARAMS: SimulationParams = {
  phases: '1p',
  waveType: 'half',
  deviceType: 'diode',
  loadType: 'R',
  freewheelingDiode: false,
  Vm: 325,
  freq: 50,
  alphaDeg: 0,
  R: 20,
  L_mH: 45,
};

test('1. R-load diode rectifier analytical benchmarks and power/efficiency calculations', () => {
  // 1-Phase Half-Wave Diode (R load)
  {
    const res = runRectifierSimulation({
      ...BASE_PARAMS,
      phases: '1p',
      waveType: 'half',
      deviceType: 'diode',
      loadType: 'R',
    });
    const { metrics } = res;
    const expectedVdc = BASE_PARAMS.Vm / Math.PI;
    const expectedVrms = BASE_PARAMS.Vm / 2;
    const expectedIdc = expectedVdc / BASE_PARAMS.R;
    const expectedIrms = expectedVrms / BASE_PARAMS.R;
    const expectedPout = (BASE_PARAMS.Vm * BASE_PARAMS.Vm) / (4 * BASE_PARAMS.R);

    assert.ok(Math.abs(metrics.Vdc - expectedVdc) < 0.05, `1p half Vdc: ${metrics.Vdc} vs ${expectedVdc}`);
    assert.ok(Math.abs(metrics.Vrms - expectedVrms) < 0.05, `1p half Vrms: ${metrics.Vrms} vs ${expectedVrms}`);
    assert.ok(Math.abs(metrics.Idc - expectedIdc) < 0.01, `1p half Idc: ${metrics.Idc} vs ${expectedIdc}`);
    assert.ok(Math.abs(metrics.Irms - expectedIrms) < 0.01, `1p half Irms: ${metrics.Irms} vs ${expectedIrms}`);
    assert.ok(Math.abs(metrics.Pout - expectedPout) < 0.5, `1p half Pout: ${metrics.Pout} vs ${expectedPout}`);
    assert.ok(Math.abs(metrics.Pin - expectedPout) < 0.5, `1p half Pin: ${metrics.Pin} vs ${expectedPout}`);
    // Verify Pout = mean(vo * io) is distinct from Pdc = Vdc * Idc for pulsing waveforms
    assert.ok(metrics.Pout > metrics.Pdc * 2, `1p half Pout (${metrics.Pout}) should exceed Vdc*Idc (${metrics.Pdc})`);
    assert.ok(metrics.efficiencyPercent !== null && Math.abs(metrics.efficiencyPercent - 100) < 1e-6);
  }

  // 1-Phase Full-Wave Bridge Diode (R load)
  {
    const res = runRectifierSimulation({
      ...BASE_PARAMS,
      phases: '1p',
      waveType: 'full',
      deviceType: 'diode',
      loadType: 'R',
    });
    const { metrics, points } = res;
    const expectedVdc = (2 * BASE_PARAMS.Vm) / Math.PI;
    const expectedVrms = BASE_PARAMS.Vm / Math.SQRT2;
    const expectedPout = (BASE_PARAMS.Vm * BASE_PARAMS.Vm) / (2 * BASE_PARAMS.R);

    assert.ok(Math.abs(metrics.Vdc - expectedVdc) < 0.05);
    assert.ok(Math.abs(metrics.Vrms - expectedVrms) < 0.05);
    assert.ok(Math.abs(metrics.Pout - expectedPout) < 0.5);
    assert.ok(Math.abs(metrics.Pin - expectedPout) < 0.5);
    assert.ok(metrics.efficiencyPercent !== null && Math.abs(metrics.efficiencyPercent - 100) < 1e-6);

    // Check negative half-cycle source current sign (at 270 deg, va < 0 and ia < 0 so va * ia > 0)
    const pt270 = points[270];
    assert.ok(pt270.va < 0 && pt270.ia < 0, 'At 270 deg, both va and ia must be negative');
    assert.ok(Math.abs(pt270.va * pt270.ia - pt270.vo * pt270.io) < 1e-9);
  }

  // 3-Phase Half-Wave Diode (R load)
  {
    const res = runRectifierSimulation({
      ...BASE_PARAMS,
      phases: '3p',
      waveType: 'half',
      deviceType: 'diode',
      loadType: 'R',
    });
    const { metrics } = res;
    const expectedVdc = ((3 * Math.sqrt(3)) / (2 * Math.PI)) * BASE_PARAMS.Vm;
    const expectedVrms = BASE_PARAMS.Vm * Math.sqrt(0.5 + (3 * Math.sqrt(3)) / (8 * Math.PI));
    const expectedPout = (expectedVrms * expectedVrms) / BASE_PARAMS.R;

    assert.ok(Math.abs(metrics.Vdc - expectedVdc) < 0.05);
    assert.ok(Math.abs(metrics.Vrms - expectedVrms) < 0.05);
    assert.ok(Math.abs(metrics.Pout - expectedPout) < 0.5);
    assert.ok(Math.abs(metrics.Pin - expectedPout) < 0.5);
    assert.ok(metrics.efficiencyPercent !== null && Math.abs(metrics.efficiencyPercent - 100) < 1e-6);
  }

  // 3-Phase Full-Wave Bridge Diode (R load)
  {
    const res = runRectifierSimulation({
      ...BASE_PARAMS,
      phases: '3p',
      waveType: 'full',
      deviceType: 'diode',
      loadType: 'R',
    });
    const { metrics } = res;
    const expectedVdc = ((3 * Math.sqrt(3)) / Math.PI) * BASE_PARAMS.Vm;
    const expectedVrms = BASE_PARAMS.Vm * Math.sqrt(1.5 + (9 * Math.sqrt(3)) / (4 * Math.PI));
    const expectedPout = (expectedVrms * expectedVrms) / BASE_PARAMS.R;

    assert.ok(Math.abs(metrics.Vdc - expectedVdc) < 0.05);
    assert.ok(Math.abs(metrics.Vrms - expectedVrms) < 0.05);
    assert.ok(Math.abs(metrics.Pout - expectedPout) < 1.0);
    assert.ok(Math.abs(metrics.Pin - expectedPout) < 1.0);
    assert.ok(metrics.efficiencyPercent !== null && Math.abs(metrics.efficiencyPercent - 100) < 1e-6);
  }
});

test('2. Instantaneous power verification across SCR and RL configurations', () => {
  const configs: Partial<SimulationParams>[] = [
    { phases: '1p', waveType: 'half', deviceType: 'scr', alphaDeg: 45, loadType: 'RL', freewheelingDiode: false },
    { phases: '1p', waveType: 'half', deviceType: 'scr', alphaDeg: 45, loadType: 'RL', freewheelingDiode: true },
    { phases: '1p', waveType: 'full', deviceType: 'scr', alphaDeg: 60, loadType: 'RL', freewheelingDiode: false },
    { phases: '3p', waveType: 'half', deviceType: 'scr', alphaDeg: 45, loadType: 'RL', freewheelingDiode: true },
    { phases: '3p', waveType: 'full', deviceType: 'scr', alphaDeg: 75, loadType: 'RL', freewheelingDiode: false },
  ];

  for (const cfg of configs) {
    const sim = runRectifierSimulation({ ...BASE_PARAMS, ...cfg });
    const cycle = sim.points.slice(0, 360);
    const meanVoIo = cycle.reduce((s, p) => s + p.vo * p.io, 0) / cycle.length;
    const meanPin =
      cycle.reduce(
        (s, p) =>
          s + (cfg.phases === '1p' ? p.va * p.ia : p.va * p.ia + p.vb * p.ib + p.vc * p.ic),
        0
      ) / cycle.length;

    assert.ok(Math.abs(sim.metrics.Pout - meanVoIo) < 1e-9, 'metrics.Pout must equal mean(vo * io)');
    assert.ok(Math.abs(sim.metrics.Pin - meanPin) < 1e-9, 'metrics.Pin must equal mean(v_source * i_source)');
    assert.ok(Math.abs(sim.metrics.Pout - sim.metrics.Pin) < 1e-6, 'Ideal switch Pin must equal Pout');
    // In periodic steady state, average inductor power is zero, so Pout ≈ Irms^2 * R (within 1° discrete grid jump error < 2%)
    const iRmsSqR = sim.metrics.Irms * sim.metrics.Irms * BASE_PARAMS.R;
    assert.ok(
      Math.abs(sim.metrics.Pout - iRmsSqR) / iRmsSqR < 0.02,
      `Steady-state Pout (${sim.metrics.Pout}) should match Irms^2 * R (${iRmsSqR})`
    );
  }
});

test('3. Exact RL integration accuracy, continuity, freewheeling, and stability at L=2mH, R=100Ω', () => {
  // Compare 1p half-wave diode RL current against exact analytical closed-form solution
  const Vm = 325;
  const R = 20;
  const L_mH = 45;
  const freq = 50;
  const omega = 2 * Math.PI * freq;
  const XL = omega * (L_mH / 1000);
  const Z = Math.hypot(R, XL);
  const phi = Math.atan2(XL, R);

  const simRL = runRectifierSimulation({
    ...BASE_PARAMS,
    phases: '1p',
    waveType: 'half',
    deviceType: 'diode',
    loadType: 'RL',
    freewheelingDiode: false,
    Vm,
    R,
    L_mH,
    freq,
  });

  for (let deg = 0; deg <= 200; deg++) {
    const rad = (deg * Math.PI) / 180;
    const exactI = Math.max(
      0,
      (Vm / Z) * (Math.sin(rad - phi) + Math.sin(phi) * Math.exp((-R / XL) * rad))
    );
    const simI = simRL.points[deg].io;
    assert.ok(
      Math.abs(simI - exactI) < 1e-9,
      `At ${deg} deg: simulated io=${simI} vs analytical=${exactI}`
    );
  }

  // Test stiff short time-constant corner case: L = 2 mH, R = 100 Ohms (tau = 20 us < dt = 27.78 us)
  for (const freewheelingDiode of [false, true]) {
    for (const phases of ['1p', '3p'] as const) {
      for (const waveType of ['half', 'full'] as const) {
        const stiffSim = runRectifierSimulation({
          ...BASE_PARAMS,
          phases,
          waveType,
          deviceType: 'scr',
          alphaDeg: 30,
          loadType: 'RL',
          freewheelingDiode,
          R: 100,
          L_mH: 2,
        });

        for (const pt of stiffSim.points) {
          assert.ok(Number.isFinite(pt.io) && pt.io >= 0, 'Current must be finite and non-negative');
          assert.ok(Number.isFinite(pt.vo), 'Voltage must be finite');
        }

        // Check periodic steady-state continuity between 0 deg, 360 deg, and 720 deg
        assert.ok(
          Math.abs(stiffSim.points[360].io - stiffSim.points[0].io) < 1e-6,
          'Periodic continuity between 0 and 360 deg'
        );
        assert.ok(
          Math.abs(stiffSim.points[720].io - stiffSim.points[360].io) < 1e-6,
          'Periodic continuity between 360 and 720 deg'
        );
      }
    }
  }

  // Verify freewheeling transition and exponential decay for 1p half-wave RL with Dfw
  const fwSim = runRectifierSimulation({
    ...BASE_PARAMS,
    phases: '1p',
    waveType: 'half',
    deviceType: 'diode',
    loadType: 'RL',
    freewheelingDiode: true,
    Vm: 325,
    R: 20,
    L_mH: 60,
  });

  const io180 = fwSim.points[180].io;
  assert.ok(io180 > 1.0, 'Current at 180 deg must be positive when entering freewheeling');
  for (let deg = 180; deg < 360; deg++) {
    const pt = fwSim.points[deg];
    assert.equal(pt.vo, 0, `Output voltage must be clamped to 0V during freewheeling at ${deg} deg`);
    assert.deepEqual(pt.activeDevices, ['Dfw']);
    assert.equal(pt.ia, 0, 'Source current must be 0 during freewheeling');
    assert.equal(pt.ifw, pt.io, 'Freewheeling diode current must equal load current');
    const dRad = ((deg - 180) * Math.PI) / 180;
    const expectedDecayI = io180 * Math.exp((-20 / (omega * 0.06)) * dRad);
    assert.ok(
      Math.abs(pt.io - expectedDecayI) < 1e-9,
      `Freewheeling exponential decay mismatch at ${deg} deg`
    );
  }
});

test('4. RL_CONST coupled model consistency across topologies', () => {
  for (const phases of ['1p', '3p'] as const) {
    for (const waveType of ['half', 'full'] as const) {
      for (const freewheelingDiode of [false, true]) {
        const res = runRectifierSimulation({
          ...BASE_PARAMS,
          phases,
          waveType,
          deviceType: 'scr',
          alphaDeg: 30,
          loadType: 'RL_CONST',
          freewheelingDiode,
        });

        // Verify Idc matches Vdc / R in steady state (within 1% discrete 1° sampling tolerance)
        const expectedIdc = res.metrics.Vdc / BASE_PARAMS.R;
        assert.ok(
          Math.abs(res.metrics.Idc - expectedIdc) / Math.max(1, expectedIdc) < 0.01,
          `RL_CONST Idc (${res.metrics.Idc}) must match Vdc/R (${expectedIdc}) for ${phases} ${waveType} fw=${freewheelingDiode}`
        );

        // Verify point-by-point consistency between activeDevices, io, ia/ib/ic/ifw, and power
        for (const pt of res.points) {
          if (pt.activeDevices.length === 0) {
            assert.equal(pt.io, 0);
            assert.equal(pt.ia, 0);
          } else if (pt.activeDevices.includes('Dfw')) {
            assert.equal(pt.vo, 0);
            assert.equal(pt.ifw, pt.io);
            assert.equal(pt.ia, 0);
          } else {
            const pInInst =
              phases === '1p'
                ? pt.va * pt.ia
                : pt.va * pt.ia + pt.vb * pt.ib + pt.vc * pt.ic;
            const pOutInst = pt.vo * pt.io;
            assert.ok(Math.abs(pInInst - pOutInst) < 1e-7);
          }
        }
      }
    }
  }
});

test('5. 1-Phase half-wave diode theoretical formula reflects load and freewheeling conditions', () => {
  const rLoad = runRectifierSimulation({
    ...BASE_PARAMS,
    phases: '1p',
    waveType: 'half',
    deviceType: 'diode',
    loadType: 'R',
    freewheelingDiode: false,
  });
  assert.equal(rLoad.metrics.theoreticalFormula, 'Vdc = Vm / π ≈ 0.318 Vm');

  const rlWithFw = runRectifierSimulation({
    ...BASE_PARAMS,
    phases: '1p',
    waveType: 'half',
    deviceType: 'diode',
    loadType: 'RL',
    freewheelingDiode: true,
  });
  assert.equal(rlWithFw.metrics.theoreticalFormula, 'Vdc = Vm / π ≈ 0.318 Vm');

  const rlNoFw = runRectifierSimulation({
    ...BASE_PARAMS,
    phases: '1p',
    waveType: 'half',
    deviceType: 'diode',
    loadType: 'RL',
    freewheelingDiode: false,
  });
  assert.equal(
    rlNoFw.metrics.theoreticalFormula,
    'Vdc = (Vm / 2π) · (1 - cos β) [RL load, β > 180°]'
  );
  // Confirm Vdc is lower than Vm / pi due to negative voltage excursion between 180 deg and beta
  assert.ok(rlNoFw.metrics.Vdc < BASE_PARAMS.Vm / Math.PI - 5);
});
