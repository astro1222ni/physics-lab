/* gps-trilateration-core.js — GPS 三邊定位與定位誤差的計算核心（純函式，瀏覽器與 Node 共用）
 *
 * 接收機量的是「虛擬距離」（pseudorange）：訊號飛行時間 × 光速。接收機的石英鐘不準，
 * 慢了 τ 秒，每一個距離都一起多算 cτ：ρ_i = |s_i − r| + cτ + ε_i。
 * 未知數有四個（x、y、z、τ），所以至少要四顆衛星；平面上（x、y、τ）至少要三座發射塔。
 * 用最小平方法（高斯－牛頓迭代）解；誤差放大倍數由幾何決定：
 *   G 的第 i 列 = [−e_i, 1]（e_i 是從接收機指向衛星的單位向量，東、北、天三個分量），
 *   Q = (GᵀG)⁻¹，HDOP = √(Q_EE + Q_NN)，VDOP = √Q_UU，PDOP = √(Q_EE + Q_NN + Q_UU)，TDOP = √Q_tt，GDOP = √tr Q。
 *   每個距離的誤差標準差 σ（UERE）→ 位置誤差約 PDOP × σ。
 *
 * 衛星星系：24 顆、6 個軌道面（升交點相隔 60°）、傾角 55°、軌道半徑 26,560 km、週期半個恆星日（Walker 24/6/1）。
 * 這是教學用的理想星系，不是某一天真實的衛星位置；測站一律是虛擬地點，不讀使用者的位置。
 * 單位：距離 km（誤差 m），時間 μs（光速 c = 0.299792458 km/μs）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GpsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C = 0.299792458;          // km / μs
  const RE = 6371;                // 地球半徑 km（球體）
  const RS = 26560;               // 衛星軌道半徑 km
  const T_SID = 1436.0682;        // 恆星日（分鐘）
  const T_ORB = T_SID / 2;        // 衛星週期（分鐘）
  const INC = 55 * Math.PI / 180;
  const NSAT = 24, PLANES = 6, PER = 4;
  const DEG = Math.PI / 180;

  // ---------------- 小工具：線性代數 ----------------
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  /** 對稱正定矩陣求反矩陣（高斯－約旦）；奇異時回傳 null */
  function inverse(M) {
    const n = M.length, A = M.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    let scale = 0;
    M.forEach(r => r.forEach(v => { scale = Math.max(scale, Math.abs(v)); }));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-10 * (scale || 1)) return null;
      [A[c], A[p]] = [A[p], A[c]];
      const d = A[c][c];
      for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c];
        if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
      }
    }
    return A.map(r => r.slice(n));
  }
  /** GᵀG */
  function normalMatrix(G) {
    const m = G[0].length, N = Array.from({ length: m }, () => new Array(m).fill(0));
    G.forEach(row => { for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) N[i][j] += row[i] * row[j]; });
    return N;
  }
  /** 用 G 算 DOP；G 的最後一欄是時鐘。3D：[E, N, U, t]；2D：[E, N, t] */
  function dop(G) {
    if (!G.length || G.length < G[0].length) return null;
    const Q = inverse(normalMatrix(G));
    if (!Q) return null;
    const m = Q.length;
    if (m === 4) {
      return { Q, h: Math.sqrt(Q[0][0] + Q[1][1]), v: Math.sqrt(Q[2][2]), p: Math.sqrt(Q[0][0] + Q[1][1] + Q[2][2]), t: Math.sqrt(Q[3][3]), g: Math.sqrt(Q[0][0] + Q[1][1] + Q[2][2] + Q[3][3]) };
    }
    return { Q, h: Math.sqrt(Q[0][0] + Q[1][1]), v: 0, p: Math.sqrt(Q[0][0] + Q[1][1]), t: Math.sqrt(Q[m - 1][m - 1]), g: Math.sqrt(Q.reduce((a, r, i) => a + r[i], 0)) };
  }

  // ---------------- 地球與衛星 ----------------
  /** 地表測站（緯度、經度、高度 km）的地心座標 */
  function station(lat, lon, h) {
    const r = RE + (h || 0), p = lat * DEG, l = lon * DEG;
    return [r * Math.cos(p) * Math.cos(l), r * Math.cos(p) * Math.sin(l), r * Math.sin(p)];
  }
  /** 東、北、天三個單位向量 */
  function enuBasis(lat, lon) {
    const p = lat * DEG, l = lon * DEG;
    return {
      e: [-Math.sin(l), Math.cos(l), 0],
      n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)],
      u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]
    };
  }
  /** 第 id 顆衛星（0–23）在時間 t（分鐘）的地心地固座標 */
  function satellite(id, t) {
    const p = Math.floor(id / PER), s = id % PER;
    const u = (90 * s + 15 * p) * DEG + 2 * Math.PI * t / T_ORB;
    const O = 60 * p * DEG - 2 * Math.PI * t / T_SID;   // 地球自轉讓軌道面相對往西轉
    const xo = RS * Math.cos(u), yo = RS * Math.sin(u);
    return [xo * Math.cos(O) - yo * Math.cos(INC) * Math.sin(O), xo * Math.sin(O) + yo * Math.cos(INC) * Math.cos(O), yo * Math.sin(INC)];
  }
  /** 遮蔽：仰角遮罩 mask（度）；街谷 canyon = { w（建築頂的仰角，度，垂直街道方向）, dir（街道方位角，度）} */
  function blockedBy(el, az, mask, canyon) {
    if (el < mask) return 'mask';
    if (canyon && canyon.w > 0) {
      const lim = Math.atan(Math.tan(canyon.w * DEG) * Math.abs(Math.sin((az - canyon.dir) * DEG))) / DEG;
      if (el < lim) return 'building';
    }
    return '';
  }
  /** 天空中每一顆衛星：仰角、方位角、距離、單位向量（東北天）、可不可以收到 */
  function sky(o) {
    const r = station(o.lat, o.lon, 0), B = enuBasis(o.lat, o.lon), out = [];
    for (let id = 0; id < NSAT; id++) {
      const s = satellite(id, o.t), d = sub(s, r), R = norm(d);
      const e = [dot(d, B.e) / R, dot(d, B.n) / R, dot(d, B.u) / R];
      const el = Math.asin(e[2]) / DEG;
      let az = Math.atan2(e[0], e[1]) / DEG; if (az < 0) az += 360;
      const block = el < 0 ? 'earth' : blockedBy(el, az, o.mask || 0, o.canyon);
      out.push({ id, pos: s, range: R, enu: e, el, az, block, visible: el >= 0 && !block });
    }
    return out;
  }
  /** 多路徑：仰角低於 elMax 的衛星，反射訊號多走 m 公尺（只會變長） */
  function multipathBias(el, m, elMax) { return el < (elMax || 20) ? m * (1 - el / (elMax || 20)) : 0; }

  /** 3D 的幾何矩陣（東北天＋時鐘）；sats 是 sky() 的元素 */
  function geometry3(sats) { return sats.map(s => [-s.enu[0], -s.enu[1], -s.enu[2], 1]); }

  /**
   * 3D 最小平方定位。pos：衛星地心座標陣列；rho：虛擬距離（km）。
   * fixClock = 數值時：時鐘偏差當作已知（μs），只解 x、y、z（三顆衛星也能解，但時鐘錯了就整個偏掉）。
   * 回傳 { x（地心 km）, tau（μs）, rms（km）, iter } 或 null（衛星不夠、幾何退化）。
   */
  function solve3(pos, rho, fixClock, start) {
    const n = pos.length, clockKnown = typeof fixClock === 'number', m = clockKnown ? 3 : 4;
    if (n < m) return null;
    let x = start ? start.slice() : [0, 0, 0], b = clockKnown ? C * fixClock : 0;
    let it = 0;
    for (; it < 30; it++) {
      const G = [], r = [];
      for (let i = 0; i < n; i++) {
        const d = sub(x, pos[i]), R = norm(d);
        G.push(clockKnown ? [d[0] / R, d[1] / R, d[2] / R] : [d[0] / R, d[1] / R, d[2] / R, 1]);
        r.push(rho[i] - (R + b));
      }
      const Q = inverse(normalMatrix(G));
      if (!Q) return null;
      const g = new Array(m).fill(0);
      G.forEach((row, i) => { for (let j = 0; j < m; j++) g[j] += row[j] * r[i]; });
      const dx = Q.map(q => q.reduce((a, v, j) => a + v * g[j], 0));
      x = [x[0] + dx[0], x[1] + dx[1], x[2] + dx[2]];
      if (!clockKnown) b += dx[3];
      if (Math.hypot(dx[0], dx[1], dx[2]) < 1e-9 && (clockKnown || Math.abs(dx[3]) < 1e-9)) break;
    }
    let ss = 0;
    for (let i = 0; i < n; i++) { const e = rho[i] - (norm(sub(x, pos[i])) + b); ss += e * e; }
    return { x, tau: b / C, rms: Math.sqrt(ss / n), iter: it };
  }

  /** 地心座標差 → 測站的東、北、天（公尺） */
  function toENU(dx, lat, lon) {
    const B = enuBasis(lat, lon);
    return [1000 * dot(dx, B.e), 1000 * dot(dx, B.n), 1000 * dot(dx, B.u)];
  }

  /** 亂數（線性同餘，可重現） */
  function rng(seed) {
    let s = seed >>> 0 || 1;
    const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
    return { u, n: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
  }

  /** 時鐘當作已知（不解時鐘）時的幾何矩陣與 DOP：只有東北天三欄 */
  function geometryFixed(sats) { return sats.map(s => [-s.enu[0], -s.enu[1], -s.enu[2]]); }
  function dopFixed(sats) {
    if (sats.length < 3) return null;
    const Q = inverse(normalMatrix(geometryFixed(sats)));
    if (!Q) return null;
    return { Q, h: Math.sqrt(Q[0][0] + Q[1][1]), v: Math.sqrt(Q[2][2]), p: Math.sqrt(Q[0][0] + Q[1][1] + Q[2][2]), t: 0, g: Math.sqrt(Q[0][0] + Q[1][1] + Q[2][2]) };
  }

  /**
   * 重複定位 count 次：每個距離加上 N(0, σ²) 的雜訊（σ 公尺）與多路徑偏差 mp = { m, el }。
   * assumeTau 是數值時：接收機以為時鐘是準的（不解時鐘），但時鐘其實偏了 assumeTau μs，
   *   每個距離都多了 c·τ —— 三顆衛星就能算，但位置整個偏掉。
   * 誤差只有幾公尺到幾百公尺，用線性化 δ = (GᵀG)⁻¹ Gᵀ ε 就很準（單元測試和完整迭代比對過）。
   * 回傳每一次的 [東, 北, 天]（公尺）、平均、水平均方根誤差、系統偏差 bias 與 DOP。
   */
  function scatter(sats, sigma, count, seed, mp, assumeTau) {
    const fixed = typeof assumeTau === 'number';
    const G = fixed ? geometryFixed(sats) : geometry3(sats);
    const D = fixed ? dopFixed(sats) : dop(G);
    if (!D) return null;
    const H = D.Q.map(q => G.map(row => q.reduce((a, v, j) => a + v * row[j], 0))); // m × n
    const R = rng(seed || 1), pts = [];
    const cb = fixed ? 1000 * C * assumeTau : 0;
    const bias = sats.map(s => (mp ? multipathBias(s.el, mp.m, mp.el) : 0) + cb);
    let se = 0, sn = 0, su = 0, h2 = 0;
    for (let k = 0; k < count; k++) {
      const eps = sats.map((s, i) => sigma * R.n() + bias[i]);
      const d = [0, 1, 2].map(j => H[j].reduce((a, v, i) => a + v * eps[i], 0));
      pts.push(d); se += d[0]; sn += d[1]; su += d[2]; h2 += d[0] * d[0] + d[1] * d[1];
    }
    const b = [0, 1, 2].map(j => H[j].reduce((a, v, i) => a + v * bias[i], 0));
    return { pts, mean: [se / count, sn / count, su / count], hrms: Math.sqrt(h2 / count), bias: b, biasH: Math.hypot(b[0], b[1]), dop: D };
  }

  // ---------------- 平面練習：島上的發射塔 ----------------
  const ISLAND = { w: 40, h: 30 };      // km
  const TOWERS = [
    { x: 6, y: 24 }, { x: 33, y: 26 }, { x: 31, y: 5 }, { x: 9, y: 6 }, { x: 20, y: 15.5 }
  ];
  /** 每座塔量到的虛擬距離（km）：真實距離 + cτ */
  function pseudo2(towers, r, tau, noise) { return towers.map((t, i) => Math.hypot(t.x - r[0], t.y - r[1]) + C * tau + (noise ? noise[i] || 0 : 0)); }
  /** 每座塔固定的一組雜訊（標準常態），乘上 σ 就是距離誤差；同一座塔每次都一樣，畫面才不會亂跳 */
  const TOWER_NOISE = (function () { const R = rng(2024); return TOWERS.map(() => R.n()); })();
  /** 2D 的幾何矩陣（東北＋時鐘）：從接收機指向塔的單位向量取負 */
  function geometry2(towers, r) {
    return towers.map(t => { const d = Math.hypot(t.x - r[0], t.y - r[1]) || 1e-9; return [-(t.x - r[0]) / d, -(t.y - r[1]) / d, 1]; });
  }
  /**
   * 平面最小平方。tauGuess 是數值：時鐘偏差當作已知，只解位置（這時圓的半徑 = ρ − cτ）。
   * 否則連時鐘一起解（至少三座塔）。從幾個起點出發，取殘差最小的解（兩個圓有兩個交點，不會卡在錯的那一個）。
   */
  function solve2(towers, rho, tauGuess) {
    const known = typeof tauGuess === 'number', m = known ? 2 : 3, n = towers.length;
    if (n < m) return null;
    const starts = [[ISLAND.w / 2, ISLAND.h / 2], [ISLAND.w * 0.2, ISLAND.h * 0.2], [ISLAND.w * 0.8, ISLAND.h * 0.2], [ISLAND.w * 0.2, ISLAND.h * 0.8], [ISLAND.w * 0.8, ISLAND.h * 0.8]];
    let best = null;
    starts.forEach(st => {
      let x = st[0], y = st[1], b = known ? C * tauGuess : 0, ok = true;
      for (let it = 0; it < 60; it++) {
        const G = [], r = [];
        towers.forEach((t, i) => { const d = Math.hypot(x - t.x, y - t.y) || 1e-9; G.push(known ? [(x - t.x) / d, (y - t.y) / d] : [(x - t.x) / d, (y - t.y) / d, 1]); r.push(rho[i] - (d + b)); });
        const Q = inverse(normalMatrix(G));
        if (!Q) { ok = false; break; }
        const g = new Array(m).fill(0);
        G.forEach((row, i) => { for (let j = 0; j < m; j++) g[j] += row[j] * r[i]; });
        const dx = Q.map(q => q.reduce((a, v, j) => a + v * g[j], 0));
        // 步長限制，避免跳出島外太遠
        const step = Math.hypot(dx[0], dx[1]), f = step > 10 ? 10 / step : 1;
        x += f * dx[0]; y += f * dx[1]; if (!known) b += f * dx[2];
        if (step < 1e-10) break;
      }
      if (!ok || !isFinite(x)) return;
      let ss = 0;
      towers.forEach((t, i) => { const e = rho[i] - (Math.hypot(x - t.x, y - t.y) + b); ss += e * e; });
      const rms = Math.sqrt(ss / n);
      if (!best || rms < best.rms - 1e-9) best = { x, y, tau: b / C, rms };
    });
    return best;
  }
  /** 兩個圓的交點（0、1 或 2 個） */
  function circleX(a, ra, b, rb) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 1e-12 || d > ra + rb + 1e-12 || d < Math.abs(ra - rb) - 1e-12 || ra < 0 || rb < 0) return [];
    const l = (ra * ra - rb * rb + d * d) / (2 * d), h2 = ra * ra - l * l, h = h2 > 0 ? Math.sqrt(h2) : 0;
    const mx = a.x + l * (b.x - a.x) / d, my = a.y + l * (b.y - a.y) / d;
    if (h < 1e-9) return [[mx, my]];
    return [[mx + h * (b.y - a.y) / d, my - h * (b.x - a.x) / d], [mx - h * (b.y - a.y) / d, my + h * (b.x - a.x) / d]];
  }
  /** 半徑 = ρ − cτ̂ 的幾個圓「交不交在同一點」：最小平方點的殘差均方根（km）；全部交於一點時 = 0 */
  /** 點 p 到兩座塔之間線段的距離（km） */
  function segDist(a, b, p) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const u = Math.max(0, Math.min(1, ((p[0] - a.x) * dx + (p[1] - a.y) * dy) / L2));
    return Math.hypot(p[0] - a.x - u * dx, p[1] - a.y - u * dy);
  }
  function miss2(towers, rho, tauGuess) {
    const s = solve2(towers, rho, tauGuess);
    return s ? s.rms : Infinity;
  }

  return {
    C, RE, RS, T_SID, T_ORB, INC, NSAT, PLANES, PER, ISLAND, TOWERS,
    inverse, normalMatrix, dop, station, enuBasis, satellite, blockedBy, sky, multipathBias,
    geometry3, geometryFixed, dopFixed, solve3, toENU, rng, scatter, TOWER_NOISE, pseudo2, geometry2, solve2, circleX, segDist, miss2
  };
});
