(function (root, factory) {
  'use strict';
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.PolarizationCore = core;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const rad = Math.PI / 180;
  const degrees = radians => radians / rad;
  const clamp01 = x => Math.max(0, Math.min(1, x));

  // 面對光束截面，角度從鉛直軸起算。軸相差 180° 代表同一片偏振片。
  function axis(angle) {
    return { x: Math.sin(angle * rad), y: Math.cos(angle * rad) };
  }

  function angleBetween(a, b) {
    const difference = Math.abs(a - b) % 180;
    return Math.min(difference, 180 - difference);
  }

  function transmit(angles, sourceAngle = null) {
    let field = sourceAngle === null ? null : axis(sourceAngle);
    let intensity = 1;
    const stages = angles.map(angle => {
      const u = axis(angle);
      const incoming = field;
      const incident = intensity;
      let passed = incoming ? incoming.x * u.x + incoming.y * u.y : Math.SQRT1_2;
      if (Math.abs(passed) < 1e-14) passed = 0;
      field = { x: u.x * passed, y: u.y * passed };
      intensity = clamp01(passed ** 2);
      // 無偏振入射的兩個正交分量以均方根振幅畫出。
      const rejected = incoming
        ? { x: incoming.x - field.x, y: incoming.y - field.y }
        : { x: u.y * Math.SQRT1_2, y: -u.x * Math.SQRT1_2 };
      return { angle, axis: u, incoming, field, rejected, incident, intensity };
    });
    return { stages, intensity };
  }

  function brewsterAngle(n1, n2) {
    return n1 === n2 ? null : degrees(Math.atan2(n2, n1));
  }

  function fresnel(n1, n2, angleDeg) {
    if (n1 === n2) {
      return { angleT: angleDeg, rs: 0, rp: 0, ts: 1, tp: 1, reflected: 0, polarization: null, totalInternal: false };
    }
    const angle = angleDeg * rad;
    const sinT = n1 / n2 * Math.sin(angle);
    if (sinT > 1 + 1e-14) {
      return { angleT: null, rs: 1, rp: 1, ts: 0, tp: 0, reflected: 1, polarization: 0, totalInternal: true };
    }
    const angleT = Math.asin(clamp01(sinT));
    const ci = Math.cos(angle);
    const ct = Math.sqrt(Math.max(0, 1 - sinT ** 2));
    const as = n1 * ci;
    const bs = n2 * ct;
    const ap = n2 * ci;
    const bp = n1 * ct;
    const rs = clamp01(((as - bs) / (as + bs)) ** 2);
    const rp = clamp01(((ap - bp) / (ap + bp)) ** 2);
    const reflected = (rs + rp) / 2;
    return { angleT: degrees(angleT), rs, rp, ts: 1 - rs, tp: 1 - rp, reflected,
      polarization: reflected > 0 ? (rs - rp) / (rs + rp) : null, totalInternal: false };
  }

  // Unpolarized incidence leaves mutually incoherent reflected s and p components.
  // The analyzer angle is measured from s, so projected intensities add.
  function reflectedThroughAnalyzer(reflection, angle) {
    const { x, y } = axis(angle);
    return (reflection.rs * y ** 2 + reflection.rp * x ** 2) / 2;
  }

  return { axis, angleBetween, transmit, brewsterAngle, fresnel, reflectedThroughAnalyzer };
});
