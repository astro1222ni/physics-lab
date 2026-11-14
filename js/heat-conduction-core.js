(function (root, factory) {
  'use strict';
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.HeatConductionCore = core;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // 常溫下的近似值。k：W/(m·K)，rho：kg/m³，c：J/(kg·K)，alpha：1/K。
  const materials = {
    copper: { zh: '銅', en: 'Copper', k: 390, rho: 8960, c: 385, alpha: 17e-6 },
    aluminum: { zh: '鋁', en: 'Aluminum', k: 220, rho: 2700, c: 900, alpha: 23e-6 },
    steel: { zh: '鋼', en: 'Steel', k: 50, rho: 7850, c: 450, alpha: 12e-6 },
    brass: { zh: '黃銅', en: 'Brass', k: 110, rho: 8500, c: 380, alpha: 19e-6 },
    glass: { zh: '玻璃', en: 'Glass', k: 1, rho: 2500, c: 840, alpha: 9e-6 }
  };
  const cellsPerPart = 24;
  const initialTemperature = 20;

  function thermalResistance(material, length, area) {
    return length / (material.k * area);
  }

  function diffusivity(material) {
    return material.k / (material.rho * material.c);
  }

  function steady({ mode, left, right, length, area, fraction, a, b }) {
    const parallel = mode === 'parallel';
    const parts = [
      { material: materials[a], length: parallel ? length : length * fraction, area: parallel ? area * fraction : area },
      { material: materials[b], length: parallel ? length : length * (1 - fraction), area: parallel ? area * (1 - fraction) : area }
    ];
    const resistances = parts.map(p => thermalResistance(p.material, p.length, p.area));
    const resistance = parallel
      ? 1 / (1 / resistances[0] + 1 / resistances[1])
      : resistances[0] + resistances[1];
    const flow = (left - right) / resistance;
    const junction = parallel ? null : left - flow * resistances[0];
    const paths = parallel ? [[parts[0]], [parts[1]]] : [parts];
    const rates = parallel ? resistances.map(r => (left - right) / r) : [flow];
    return {
      parts, resistance, resistances, flow, junction,
      paths, rates, left, right, length,
      temperature(path, x) {
        if (parallel) return left + (right - left) * x / length;
        const split = parts[0].length;
        return x <= split
          ? left + (junction - left) * x / split
          : junction + (right - junction) * (x - split) / (length - split);
      }
    };
  }

  function makePath(parts, initial) {
    const n = parts.length * cellsPerPart * (parts.length === 1 ? 2 : 1);
    const faceX = new Float64Array(n + 1);
    const centerX = new Float64Array(n);
    const halfR = new Float64Array(n);
    const capacity = new Float64Array(n);
    let i = 0;
    for (const part of parts) {
      const count = n / parts.length;
      const dx = part.length / count;
      for (let j = 0; j < count; j++, i++) {
        centerX[i] = faceX[i] + dx / 2;
        faceX[i + 1] = faceX[i] + dx;
        halfR[i] = thermalResistance(part.material, dx / 2, part.area);
        capacity[i] = part.material.rho * part.material.c * part.area * dx;
      }
    }
    const conductance = new Float64Array(n + 1);
    for (let j = 0; j <= n; j++) {
      conductance[j] = 1 / ((halfR[j - 1] || 0) + (halfR[j] || 0));
    }
    return {
      faceX, centerX, halfR, conductance, capacity,
      temperatures: new Float64Array(n).fill(initial),
      upper: new Float64Array(n), rhs: new Float64Array(n),
      boundaryEnergy: 0
    };
  }

  function createRun(options, initial = initialTemperature) {
    const model = steady(options);
    const times = model.parts.map(part => part.length ** 2 / diffusivity(part.material));
    return {
      model, initial, time: 0,
      settings: { ...options },
      initialStepScale: Math.min(...times) / 1000,
      duration: 1.2 * model.length ** 2 / Math.min(...model.parts.map(p => diffusivity(p.material))),
      paths: model.paths.map(parts => makePath(parts, initial))
    };
  }

  function stepPath(path, left, right, dt) {
    const { temperatures: t, upper, rhs, conductance: g, capacity } = path;
    const n = t.length;
    // Backward Euler 以每個網格的熱量平衡建三對角矩陣。面熱流採相鄰半格熱阻串聯。
    for (let i = 0; i < n; i++) {
      const a = -dt * g[i];
      const c = -dt * g[i + 1];
      const diag = capacity[i] - a - c;
      const source = capacity[i] * t[i] - (i === 0 ? a * left : 0) - (i === n - 1 ? c * right : 0);
      const pivot = i === 0 ? diag : diag - a * upper[i - 1];
      upper[i] = c / pivot;
      rhs[i] = (source - (i === 0 ? 0 : a * rhs[i - 1])) / pivot;
    }
    t[n - 1] = rhs[n - 1];
    for (let i = n - 2; i >= 0; i--) t[i] = rhs[i] - upper[i] * t[i + 1];
    path.boundaryEnergy += dt * (g[0] * (left - t[0]) - g[n] * (t[n - 1] - right));
  }

  function advance(run, target) {
    const end = Math.min(run.duration, target);
    while (run.time < end) {
      // 暫態初期取短步，之後隨經過時間增加。這個步長控制時間精度。
      const dt = Math.min(end - run.time, 0.025 * (run.time + run.initialStepScale));
      for (const path of run.paths) stepPath(path, run.model.left, run.model.right, dt);
      run.time += dt;
    }
  }

  function sample(run, branch) {
    const { model } = run;
    const { faceX, centerX, halfR, conductance: g, temperatures: t } = run.paths[branch];
    const n = t.length;
    const x = [0];
    const temperatures = [model.left];
    const flows = [];
    for (let j = 0; j <= n; j++) {
      const before = j === 0 ? model.left : t[j - 1];
      const after = j === n ? model.right : t[j];
      const q = g[j] * (before - after);
      flows.push(q);
      if (j > 0) {
        x.push(centerX[j - 1], j === n ? model.length : faceX[j]);
        temperatures.push(before, j === n ? model.right : before - q * halfR[j - 1]);
      }
    }
    const maxGap = Math.max(...temperatures.map((v, i) => Math.abs(v - model.temperature(branch, x[i]))));
    return { x, temperatures, flows, maxGap };
  }

  function storedEnergy(run, branch) {
    const { temperatures, capacity } = run.paths[branch];
    return temperatures.reduce((total, t, i) => total + (t - run.initial) * capacity[i], 0);
  }

  function measureConduction(run) {
    const profiles = run.paths.map((_, branch) => sample(run, branch));
    const { flow, rates, resistances, resistance, junction } = run.model;
    const p = profiles[0];
    return {
      ...run.settings, time: run.time, flow, rates, resistances, resistance, junction,
      currentJunction: junction === null ? null : p.temperatures[p.x.length >> 1],
      maxGap: Math.max(...profiles.map(profile => profile.maxGap)),
      flowSpread: Math.max(...p.flows) - Math.min(...p.flows),
      endFlows: [p.flows[0], p.flows.at(-1)]
    };
  }

  function expansion(a, b, length, thickness, deltaT) {
    const e1 = materials[a].alpha * deltaT;
    const e2 = materials[b].alpha * deltaT;
    // Timoshenko 模型的等厚、等模數形式。假設兩片楊氏係數相等、可自由彎曲。
    // 正曲率表示朝下層（B）彎。
    const curvature = 1.5 * (e1 - e2) / thickness;
    const arcLength = length * (1 + (e1 + e2) / 2);
    return { freeA: length * e1, freeB: length * e2, curvature, arcLength,
      tip: arcPoint(arcLength, curvature) };
  }

  function arcPoint(s, curvature) {
    if (Math.abs(curvature) < 1e-12) return { x: s, y: 0 };
    const angle = s * curvature;
    return { x: Math.sin(angle) / curvature, y: 2 * Math.sin(angle / 2) ** 2 / curvature };
  }

  return { materials, initialTemperature, diffusivity, thermalResistance, steady,
    createRun, advance, sample, storedEnergy, measureConduction, expansion, arcPoint };
});
