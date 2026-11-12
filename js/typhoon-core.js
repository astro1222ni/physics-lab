/* typhoon-core.js — 「颱風：氣壓、風場與危險半圓」的物理核心（與畫面無關，Node 可直接 require）
 *
 * 氣壓：Holland（1980）的颱風氣壓剖面 p(r) = pc + Δp·exp(−(Rm/r)^B)，Δp = 環境氣壓 − 中心氣壓。
 * 梯度風（邊界層上方，對稱的部分）：氣壓梯度力 = 向心加速度 + 科氏加速度
 *   V²/r + fV = (1/ρ) dp/dr  →  V = √( (BΔp/ρ)(Rm/r)^B e^{−(Rm/r)^B} + (rf/2)² ) − r|f|/2。
 * 地面（10 m）風：梯度風 × 0.8（海面的平均換算），往低壓內吹 20°（摩擦讓風斜吹向中心）；
 *   再加上颱風移動速度的 55%（Lin & Chavas 2012 由觀測得到的平均背景風比例），這就是「危險半圓」的來源：
 *   北半球移動方向的右邊，旋轉的風與移動的風同向相加；南半球在左邊。
 * 測站的風向：跟著「颱風在測站的哪個方位」轉，所以測站在路徑右邊時風向順轉（順時針）、左邊逆轉，南北半球都一樣。
 * 北半球逆時針旋轉、南半球順時針（緯度 0 時 f = 0，仍以逆時針、只靠離心力平衡）。
 * 強度分級：中央氣象署，依近中心最大（10 分鐘平均）風速：
 *   熱帶性低氣壓 < 17.2、輕度颱風 17.2–32.6、中度颱風 32.7–50.9、強烈颱風 ≥ 51.0 m/s。
 * 暴風半徑：（對稱的）地面風速剛好降到七級風下限 13.9 m/s、十級風下限 24.5 m/s 的距離。
 * 座標：x 向東、y 向北（m）；方位角 0 = 北、90 = 東；風向是「風從哪裡吹來」（氣象慣例）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TyphoonCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const OMEGA = 7.2921159e-5;      // 地球自轉角速度（rad/s，IERS）
  const RHO = 1.15;                 // 颱風邊界層的空氣密度（kg/m³，Holland 1980 採用）
  const RHOW = 1025;                // 海水密度（kg/m³）
  const G = 9.81;
  const KS = 0.8;                   // 梯度風 → 海面 10 m 風速
  const INFLOW = 20;                // 地面風往中心內吹的角度（度）
  const TRANS = 0.55;               // 移動速度加到地面風的比例
  const DEG = Math.PI / 180;
  const ROT_R = 300e3;              // 測站離中心 300 km 內才累計風向的轉動（颱風經過的那一段）
  // 蒲福風級（m/s，各級下限；中央氣象署延伸到 17 級）
  const BEAUFORT = [0, 0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7, 37.0, 41.5, 46.2, 51.0, 56.1, 61.3];

  function coriolisF(lat) { return 2 * OMEGA * Math.sin(lat * DEG); }
  /** S = { pc, penv（hPa）, Rm（m）, B, lat（度）, c（m/s）, hd（移動方向，度） } */
  function dp(S) { return Math.max(0, S.penv - S.pc); }
  function pressure(S, r) {
    if (r <= 0) return S.pc;
    return S.pc + dp(S) * Math.exp(-Math.pow(S.Rm / r, S.B));
  }
  /** 氣壓梯度 dp/dr（Pa/m） */
  function dpdr(S, r) {
    if (r <= 0) return 0;
    const a = Math.pow(S.Rm / r, S.B);
    return dp(S) * 100 * S.B * a * Math.exp(-a) / r;
  }
  /** 對稱的梯度風速（m/s） */
  function gradWind(S, r) {
    if (r <= 0) return 0;
    const f = Math.abs(coriolisF(S.lat));
    const a = Math.pow(S.Rm / r, S.B);
    const term = S.B * dp(S) * 100 / RHO * a * Math.exp(-a);
    return Math.sqrt(term + Math.pow(r * f / 2, 2)) - r * f / 2;
  }
  function surfaceSym(S, r) { return KS * gradWind(S, r); }
  function hemi(S) { return S.lat < 0 ? -1 : 1; }
  /** 移動速度向量（m/s，向東、向北） */
  function motion(S) { return { x: S.c * Math.sin(S.hd * DEG), y: S.c * Math.cos(S.hd * DEG) }; }
  /** 相對中心 (x, y) 處的地面風與氣壓：{ u, v, speed, p, from（風從哪個方位吹來，度） } */
  function windAt(S, x, y) {
    const r = Math.hypot(x, y);
    const m = motion(S);
    let u = TRANS * m.x, v = TRANS * m.y;
    if (r > 1) {
      const V = surfaceSym(S, r), h = hemi(S), b = INFLOW * DEG;
      const tx = -y / r * h, ty = x / r * h;          // 旋轉方向（北半球逆時針）
      const ix = -x / r, iy = -y / r;                 // 指向中心
      u += V * (Math.cos(b) * tx + Math.sin(b) * ix);
      v += V * (Math.cos(b) * ty + Math.sin(b) * iy);
    }
    const sp = Math.hypot(u, v);
    let from = Math.atan2(-u, -v) / DEG; if (from < 0) from += 360;
    return { u: u, v: v, speed: sp, p: pressure(S, r), from: from };
  }
  /** 最大梯度風與所在半徑 */
  function maxGrad(S) {
    let best = 0, rb = S.Rm;
    for (let i = 0; i <= 400; i++) {
      const r = S.Rm * (0.4 + i * 0.004);
      const V = gradWind(S, r);
      if (V > best) { best = V; rb = r; }
    }
    return { V: best, r: rb };
  }
  /** 整個風場的最大地面風速（含移動造成的不對稱）與方位（相對移動方向，正＝右邊） */
  function maxSurface(S) {
    let best = 0, ang = 0, rb = S.Rm;
    for (let i = 0; i <= 80; i++) {
      const r = S.Rm * (0.5 + i * 0.025);
      for (let k = 0; k < 144; k++) {
        const a = k / 144 * Math.PI * 2;
        const w = windAt(S, r * Math.sin(a), r * Math.cos(a));
        if (w.speed > best) { best = w.speed; ang = a; rb = r; }
      }
    }
    let rel = ang / DEG - S.hd; while (rel > 180) rel -= 360; while (rel <= -180) rel += 360;
    return { V: best, r: rb, rel: rel };
  }
  /** 對稱地面風速降到 thr 的最外側距離（m）；最大風速不到 thr 時為 0 */
  function radiusOf(S, thr) {
    const mg = maxGrad(S);
    if (KS * mg.V < thr) return 0;
    let lo = mg.r, hi = mg.r;
    while (surfaceSym(S, hi) >= thr && hi < 5000e3) hi *= 1.5;
    if (hi >= 5000e3) return 5000e3;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (surfaceSym(S, m) >= thr) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const CLASSES = [
    { key: 'td', min: 0, zh: '熱帶性低氣壓', en: 'Tropical depression' },
    { key: 'mild', min: 17.2, zh: '輕度颱風', en: 'Mild typhoon' },
    { key: 'moderate', min: 32.7, zh: '中度颱風', en: 'Moderate typhoon' },
    { key: 'strong', min: 51.0, zh: '強烈颱風', en: 'Severe typhoon' }
  ];
  /** 風速四捨五入到 0.1 m/s 後分級（和公布的數字一致） */
  function classify(v) {
    const x = Math.round(v * 10) / 10;
    let c = CLASSES[0];
    CLASSES.forEach(function (k) { if (x >= k.min) c = k; });
    return c;
  }
  function beaufort(v) {
    const x = Math.round(v * 10) / 10;
    let n = 0;
    for (let i = 0; i < BEAUFORT.length; i++) if (x >= BEAUFORT[i]) n = i;
    return n;   // 18 代表 17 級以上
  }
  /** 倒氣壓效應：中心海面升高（m），每 hPa 約 1 cm */
  function surge(S) { return dp(S) * 100 / (RHOW * G); }
  /** 颱風的整體特徵 */
  function summary(S) {
    const mg = maxGrad(S), ms = maxSurface(S);
    return { dp: dp(S), vGrad: mg.V, rGrad: mg.r, vSym: KS * mg.V, vMax: ms.V, rMax: ms.r, relMax: ms.rel,
      cls: classify(ms.V), r7: radiusOf(S, 13.9), r10: radiusOf(S, 24.5), surge: surge(S), f: coriolisF(S.lat) };
  }

  // ---------------------------------------------------------------------
  // 颱風通過測站：中心從 start 以移動速度直線前進，記錄每個測站看到的氣壓與風
  // ---------------------------------------------------------------------
  /** run = { S, t（s）, start:{x,y}, st:[{x,y,…統計}] } */
  function makeRun(S, start, stations) {
    return {
      S: S, t: 0, start: { x: start.x, y: start.y },
      st: stations.map(function (s) {
        return { x: s.x, y: s.y, maxW: 0, maxWt: 0, minW: Infinity, minP: Infinity, minPt: 0, rot: 0, lastFrom: null,
          closest: Infinity, phase: 0, eye: false, rec: [] };
      })
    };
  }
  function centerAt(run, t) {
    const m = motion(run.S);
    return { x: run.start.x + m.x * t, y: run.start.y + m.y * t };
  }
  /** 測站在路徑的哪一邊：正＝移動方向的右邊（km 以外用 m） */
  function lateral(run, s) {
    const h = run.S.hd * DEG, dx = s.x - run.start.x, dy = s.y - run.start.y;
    return dx * Math.cos(h) - dy * Math.sin(h);
  }
  function observe(run, s, t) {
    const c = centerAt(run, t);
    const w = windAt(run.S, s.x - c.x, s.y - c.y);
    w.r = Math.hypot(s.x - c.x, s.y - c.y);
    return w;
  }
  function sample(run, s, t, w) {
    if (w.speed > s.maxW) { s.maxW = w.speed; s.maxWt = t; }
    if (w.p < s.minP) { s.minP = w.p; s.minPt = t; }
    if (w.r < s.closest) s.closest = w.r;
    if (s.phase === 0 && w.speed >= 25) s.phase = 1;
    else if (s.phase === 1 && w.speed < 5) { s.phase = 2; s.minW = Math.min(s.minW, w.speed); }
    else if (s.phase === 2) { s.minW = Math.min(s.minW, w.speed); if (w.speed >= 25) { s.phase = 3; s.eye = true; } }
    if (w.speed >= 1 && w.r <= ROT_R) {
      if (s.lastFrom != null) { let d = w.from - s.lastFrom; while (d > 180) d -= 360; while (d < -180) d += 360; s.rot += d; }
      s.lastFrom = w.from;
    }
  }
  /** 前進 dt 秒（內部每步不超過 h 秒），每個測站取樣；每 rec 秒記一筆紀錄 */
  function advance(run, dt, h, recEvery) {
    h = h || 120; recEvery = recEvery || 1800;
    let left = dt;
    while (left > 1e-9) {
      const step = Math.min(h, left);
      run.t += step; left -= step;
      run.st.forEach(function (s) {
        const w = observe(run, s, run.t);
        sample(run, s, run.t, w);
        const last = s.rec.length ? s.rec[s.rec.length - 1].t : -Infinity;
        if (run.t - last >= recEvery - 1e-6) s.rec.push({ t: run.t, p: w.p, speed: w.speed, from: w.from });
      });
    }
  }
  function begin(run) {
    run.st.forEach(function (s) { const w = observe(run, s, 0); sample(run, s, 0, w); s.rec.push({ t: 0, p: w.p, speed: w.speed, from: w.from }); });
  }
  /** 測站的統計：{ maxW, maxWt（h）, minP, minPt（h）, rot（離中心 300 km 內風向累計轉了幾度，正＝順轉／順時針）, closest（km）, side（km，正＝右邊）, eye, minW } */
  function stats(run, i) {
    const s = run.st[i];
    return { maxW: s.maxW, maxWt: s.maxWt / 3600, minP: s.minP, minPt: s.minPt / 3600, rot: s.rot, closest: s.closest / 1e3,
      side: lateral(run, s) / 1e3, eye: s.eye, minW: isFinite(s.minW) ? s.minW : null };
  }

  return {
    OMEGA: OMEGA, ROT_R: ROT_R, RHO: RHO, RHOW: RHOW, G: G, KS: KS, INFLOW: INFLOW, TRANS: TRANS, DEG: DEG, BEAUFORT: BEAUFORT, CLASSES: CLASSES,
    coriolisF: coriolisF, dp: dp, pressure: pressure, dpdr: dpdr, gradWind: gradWind, surfaceSym: surfaceSym, motion: motion,
    windAt: windAt, maxGrad: maxGrad, maxSurface: maxSurface, radiusOf: radiusOf, classify: classify, beaufort: beaufort,
    surge: surge, summary: summary,
    makeRun: makeRun, centerAt: centerAt, lateral: lateral, observe: observe, begin: begin, advance: advance, stats: stats
  };
});
