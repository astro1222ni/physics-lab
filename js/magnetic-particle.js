/* magnetic-particle.js — 「帶電粒子在磁場中運動」模組的畫面與互動（物理計算在 magnetic-particle-core.js）
 * 2D 畫布：投影到垂直於 B 的平面（紙面）；3D 檢視：three.js（vendor/three/），切換到 3D 時才動態載入。 */
(function () {
  'use strict';
  const MC = window.MagneticParticleCore;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };

  // ---------- 世界座標（cm，y 向上，z 射出紙面）；物理核心用 SI（m） ----------
  const W = 24, H = 16;
  const CM = 0.01;
  const MARGIN = 0.6; // 粒子超出畫面這麼多 cm 就停止
  const ZMAX = 48;    // 沿 B（z 軸）最多移動這麼多 cm
  const BOUNDS = { x0: -MARGIN * CM, x1: (W + MARGIN) * CM, y0: -MARGIN * CM, y1: (H + MARGIN) * CM, z0: -ZMAX * CM, z1: ZMAX * CM };
  const SPEEDS = [0.1, 0.2, 0.5, 1, 2]; // 動畫中 1 秒對應的真實時間（μs）
  const F_REF = 2 * MC.E_CHARGE * 3e5 * 0.1; // 力向量長 50 px 時的大小（N）
  const TRAIL_MAX = 30000;

  // 滑桿的「教學單位」：B (mT)、q (e)、m (u)、v (10^5 m/s)、theta (°)、ang (°)、E (kV/m)
  const par = { B: 100, q: 2, m: 4, v: 3, theta: 90, ang: 0, E: 0, region: false, speed: 0.5 }; // speed：動畫 1 秒對應的真實時間（μs）
  const state = {
    start: { x: 12, y: 14.2 },
    p: null,
    trail: [],
    show: { trail: true, vec: true, orbit: true },
    running: false,
    ended: false,
    status: ''
  };

  /** 由滑桿設定組成物理核心用的場（SI） */
  function fieldCfg() {
    const th = par.ang * Math.PI / 180;
    const E = par.E * 1e3; // V/m；正值指向發射方向逆時針轉 90°：(−sinφ, cosφ)
    return {
      Bz: par.B * 1e-3,
      Ex: -E * Math.sin(th),
      Ey: E * Math.cos(th),
      region: par.region ? { xMin: (W / 2) * CM } : null
    };
  }
  /** 發射速度 [vx, vy, vz]（m/s）：v⊥ 沿發射方向（紙面內），v∥ 沿 +z */
  function launchVelocity() {
    const th = par.ang * Math.PI / 180;
    const c = MC.pitchComponents(par.v * 1e5, par.theta);
    return [c.perp * Math.cos(th), c.perp * Math.sin(th), c.par];
  }

  function resetParticle() {
    const v = launchVelocity();
    state.p = {
      x: state.start.x * CM, y: state.start.y * CM, z: 0, vx: v[0], vy: v[1], vz: v[2],
      q: par.q * MC.E_CHARGE, m: par.m * MC.AMU, t: 0, turn: 0, tField: 0
    };
    state.trail = [[state.p.x, state.p.y, 0]];
    ripples.length = 0;
    state.ended = false;
    state.status = '';
    if (!state.running) $('run').textContent = T('發射', 'Launch');
    if (view3) view3.onReset();
    updateViewNotes();
    requestDraw();
  }

  /** 讓（純磁場的）圓軌道圓心落在 (cx, cy) cm 的出發點 */
  function startForCenter(cx, cy) {
    const v = launchVelocity();
    const q = par.q * MC.E_CHARGE, m = par.m * MC.AMU, B = par.B * 1e-3;
    const k = m / (q * B) / CM; // cm·s/m
    // 圓心 = r + k (vy, −vx) → 出發點 = 圓心 − k (vy, −vx)
    return { x: cx - k * v[1], y: cy + k * v[0] };
  }

  // ---------- 2D 畫布 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let scale = 1, dpr = 1;
  let dragging = false, hoverStart = false; // 拖曳出發點／游標停在出發點上（只影響畫面回饋）
  const colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--pos', '--neg', '--field', '--equi', '--grid', '--probe', '--text', '--muted', '--surface', '--accent', '--accent-soft', '--border',
      '--mp-shadow', '--mp-vignette', '--mp-highlight'] // 最後三個是本頁 <style> 的光影代號
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function toPx(x, y) { return [x * scale, (H - y) * scale]; }        // cm → px
  function siPx(x, y) { return [x / CM * scale, (H - y / CM) * scale]; } // m → px
  function toWorld(px, py) { return [px / scale, H - py / scale]; }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    if (!w) return;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * H / W * dpr);
    scale = w / W;
    draw();
  }

  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  // ---------- 顏色工具：由色彩代號調整明暗、透明度（不另外發明色相） ----------
  const rgbCache = {};
  function parseColor(s) {
    s = String(s || '').trim();
    if (rgbCache[s]) return rgbCache[s];
    let c = [128, 128, 128, 1], m;
    if (s.charAt(0) === '#') {
      let h = s.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map(function (ch) { return ch + ch; }).join('');
      c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    } else if ((m = s.match(/rgba?\(([^)]+)\)/))) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
      c = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    rgbCache[s] = c;
    return c;
  }
  /** 代號顏色乘上透明度 a */
  function rgba(col, a) {
    const c = parseColor(col);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a * c[3]).toFixed(3) + ')';
  }
  /** 兩個顏色混合（t = 0 → c1，t = 1 → c2），用來做亮部與暗部 */
  function mix(c1, c2, t, a) {
    const p = parseColor(c1), q = parseColor(c2);
    return 'rgba(' + Math.round(p[0] + (q[0] - p[0]) * t) + ',' + Math.round(p[1] + (q[1] - p[1]) * t) + ',' +
      Math.round(p[2] + (q[2] - p[2]) * t) + ',' + (a == null ? 1 : a) + ')';
  }
  function darkTheme() { const c = parseColor(colors['canvas-bg']); return c[0] + c[1] + c[2] < 0.6 * 255; }
  const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(reduceMQ && reduceMQ.matches); }
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** 略帶弧度的三角形箭頭（尖端在 (tx, ty)，後緣微微內凹）；全頁箭頭共用同一個形狀 */
  function headPath(g, tx, ty, ux, uy, len, half) {
    const nx = -uy, ny = ux;
    const bx = tx - ux * len, by = ty - uy * len;
    const mx = tx - ux * len * 0.55, my = ty - uy * len * 0.55;
    g.moveTo(tx, ty);
    g.quadraticCurveTo(mx + nx * half * 0.62, my + ny * half * 0.62, bx + nx * half, by + ny * half);
    g.quadraticCurveTo(bx + ux * len * 0.22, by + uy * len * 0.22, bx - nx * half, by - ny * half);
    g.quadraticCurveTo(mx - nx * half * 0.62, my - ny * half * 0.62, tx, ty);
    g.closePath();
  }

  function fieldRect() {
    // 有場的區域（px）
    const x0 = par.region ? W / 2 : 0;
    return [x0 * scale, 0, (W - x0) * scale, H * scale];
  }

  // ---------- 不變的圖層（背景、場區、格線、電力線、磁場符號）：畫在離屏畫布，參數改變時才重畫 ----------
  const bgCv = document.createElement('canvas');
  const bgCtx = bgCv.getContext('2d');
  let bgKey = '';
  function buildStatic() {
    const key = [cv.width, cv.height, scale, par.B, par.region, par.E, par.ang, colors['canvas-bg'], colors.text, colors.muted,
      colors.accent, colors['accent-soft'], colors.field, colors.grid, colors['mp-shadow'], colors['mp-vignette'], colors['mp-highlight']].join('|');
    if (key === bgKey) return;
    bgKey = key;
    if (bgCv.width !== cv.width || bgCv.height !== cv.height) { bgCv.width = cv.width; bgCv.height = cv.height; }
    const g = bgCtx, dark = darkTheme();
    const wpx = W * scale, hpx = H * scale;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = colors['canvas-bg'];
    g.fillRect(0, 0, wpx, hpx);

    // 場區：淡淡的底色＋磁場強度色調（|B| 越大越明顯）＋邊界內側的光帶
    const fr = fieldRect();
    const bs = Math.min(1, Math.abs(par.B) / 200);
    if (par.region) {
      g.fillStyle = rgba(colors['accent-soft'], dark ? 0.75 : 0.85);
      g.fillRect(fr[0], fr[1], fr[2], fr[3]);
    }
    if (par.B !== 0) {
      const a = (dark ? 0.035 : 0.012) + (dark ? 0.075 : 0.032) * bs;
      const tg = g.createLinearGradient(0, 0, 0, hpx);
      tg.addColorStop(0, rgba(colors.accent, a * 0.6));
      tg.addColorStop(1, rgba(colors.accent, a));
      g.fillStyle = tg;
      g.fillRect(fr[0], fr[1], fr[2], fr[3]);
    }
    if (par.region) {
      const lg = g.createLinearGradient(fr[0], 0, fr[0] + 1.6 * scale, 0);
      lg.addColorStop(0, rgba(colors.accent, dark ? 0.2 : 0.13));
      lg.addColorStop(1, rgba(colors.accent, 0));
      g.fillStyle = lg;
      g.fillRect(fr[0], 0, 1.6 * scale, hpx);
    }

    // 徑向暈影：中心亮、四角略暗
    const vg = g.createRadialGradient(wpx / 2, hpx * 0.46, Math.min(wpx, hpx) * 0.3, wpx / 2, hpx * 0.46, Math.hypot(wpx, hpx) * 0.6);
    vg.addColorStop(0, rgba(colors['mp-vignette'], 0));
    vg.addColorStop(1, colors['mp-vignette']);
    g.fillStyle = vg;
    g.fillRect(0, 0, wpx, hpx);

    // 1 cm 方格（次格線）與 2 cm 主格線：1 個物理像素寬、對齊像素
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sd = scale * dpr, Wd = bgCv.width, Hd = bgCv.height;
    [[false, rgba(colors.text, 0.06)], [true, rgba(colors.text, 0.12)]].forEach(function (lv) {
      g.strokeStyle = lv[1];
      g.lineWidth = Math.max(1, Math.round(dpr * 0.75));
      g.beginPath();
      for (let x = 1; x < W; x++) if ((x % 2 === 0) === lv[0]) { const X = Math.round(x * sd) + 0.5; g.moveTo(X, 0); g.lineTo(X, Hd); }
      for (let y = 1; y < H; y++) if (((H - y) % 2 === 0) === lv[0]) { const Y = Math.round(y * sd) + 0.5; g.moveTo(0, Y); g.lineTo(Wd, Y); }
      g.stroke();
    });
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (par.region) {
      // 場區邊界：雙層虛線（底層寬而淡）
      g.lineCap = 'round';
      g.setLineDash([6, 5]);
      g.strokeStyle = rgba(colors.accent, 0.22);
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(wpx / 2, 0); g.lineTo(wpx / 2, hpx); g.stroke();
      g.strokeStyle = colors.accent;
      g.lineWidth = 1.6;
      g.stroke();
      g.setLineDash([]);
    }

    drawEField(g);
    drawBSymbols(g);
  }

  // 磁場符號：射出紙面 = 圓圈中一點（箭頭尖端朝向你），射入紙面 = 叉叉（箭尾）；先畫成小圖再重複貼上
  function bSymbolSprite(out, s) {
    const R = Math.ceil(s * 2), size = 2 * R;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(R, R);
    const mu = colors.muted, dark = darkTheme();
    g.lineCap = 'round';
    if (out) {
      // 柔和陰影 → 微凸的圓盤（左上亮、右下暗）→ 圓框 → 中心的小亮球
      const sh = g.createRadialGradient(0.4, s * 0.3, s * 0.55, 0.4, s * 0.3, s * 1.45);
      sh.addColorStop(0, colors['mp-shadow']);
      sh.addColorStop(1, rgba(colors['mp-shadow'], 0));
      g.fillStyle = sh;
      g.beginPath(); g.arc(0.4, s * 0.3, s * 1.45, 0, Math.PI * 2); g.fill();
      const dg = g.createRadialGradient(-s * 0.4, -s * 0.45, s * 0.1, 0, 0, s * 1.05);
      dg.addColorStop(0, mix(colors['canvas-bg'], '#ffffff', dark ? 0.1 : 0.9));
      dg.addColorStop(1, mix(colors['canvas-bg'], mu, dark ? 0.28 : 0.18));
      g.fillStyle = dg;
      g.beginPath(); g.arc(0, 0, s, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(1.1, s * 0.2);
      g.strokeStyle = mu;
      g.stroke();
      g.strokeStyle = colors['mp-highlight'];
      g.lineWidth = Math.max(0.6, s * 0.1);
      g.beginPath(); g.arc(0, 0, s - g.lineWidth * 1.6, Math.PI * 1.05, Math.PI * 1.5); g.stroke();
      const r = s * 0.36;
      const cg = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r);
      cg.addColorStop(0, mix(mu, '#ffffff', 0.6));
      cg.addColorStop(0.55, mu);
      cg.addColorStop(1, mix(mu, '#000000', 0.3));
      g.fillStyle = cg;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    } else {
      // 淡淡的底暈＋浮雕感的叉叉（暗線略偏下，主線由左上亮到右下暗）
      const sp = g.createRadialGradient(0, 0, 0, 0, 0, s * 1.3);
      sp.addColorStop(0, rgba(mu, dark ? 0.16 : 0.1));
      sp.addColorStop(1, rgba(mu, 0));
      g.fillStyle = sp;
      g.beginPath(); g.arc(0, 0, s * 1.3, 0, Math.PI * 2); g.fill();
      const d = s * 0.78, lw = Math.max(1.3, s * 0.27);
      const cross = function (ox, oy) {
        g.beginPath();
        g.moveTo(ox - d, oy - d); g.lineTo(ox + d, oy + d);
        g.moveTo(ox + d, oy - d); g.lineTo(ox - d, oy + d);
      };
      g.lineWidth = lw;
      g.strokeStyle = colors['mp-shadow'];
      cross(0.3, 0.9); g.stroke();
      const lg = g.createLinearGradient(-d, -d, d, d);
      lg.addColorStop(0, mix(mu, '#ffffff', dark ? 0.2 : 0.15));
      lg.addColorStop(1, mix(mu, '#000000', dark ? 0.1 : 0.2));
      g.strokeStyle = lg;
      cross(0, 0); g.stroke();
    }
    return { c: c, R: R };
  }
  function drawBSymbols(g) {
    if (par.B === 0) return;
    const s = Math.max(3.5, Math.min(7, scale * 0.24));
    const sp = bSymbolSprite(par.B > 0, s);
    g.save();
    g.globalAlpha = 0.6 + 0.35 * Math.min(1, Math.abs(par.B) / 200); // 符號的濃淡也隨 |B| 變化
    for (let i = 0; i < W / 2; i++) {
      const x = 1 + 2 * i;
      if (par.region && x < W / 2) continue;
      for (let j = 0; j < H / 2; j++) {
        const q = toPx(x, 1 + 2 * j);
        g.drawImage(sp.c, q[0] - sp.R, q[1] - sp.R, 2 * sp.R, 2 * sp.R);
      }
    }
    g.restore();
  }

  // 電場：平行等距的電力線（方向與發射方向垂直）；雙層線條（底層寬而淡）有管狀的立體感，濃淡隨 |E| 變化
  function drawEField(g) {
    if (par.E === 0) return;
    const th = par.ang * Math.PI / 180, sg = Math.sign(par.E);
    const ex = -Math.sin(th) * sg, ey = Math.cos(th) * sg; // E 的單位向量（世界座標）
    const tx = Math.cos(th), ty = Math.sin(th);             // 與電力線垂直的方向
    const r = fieldRect();
    const a = 0.3 + 0.25 * Math.min(1, Math.abs(par.E) / 100);
    g.save();
    g.beginPath(); g.rect(r[0], r[1], r[2], r[3]); g.clip();
    g.lineCap = 'round';
    // 電力線錯開磁場符號與方格線（中心偏移半個間距）
    const gap = 3, cx = (par.region ? W * 3 / 4 : W / 2) + 1.5 * tx, cy = H / 2 + 1.5 * ty, R = Math.hypot(W, H);
    for (let k = -8; k <= 8; k++) {
      const ox = cx + k * gap * tx, oy = cy + k * gap * ty;
      const p0 = toPx(ox - ex * R, oy - ey * R), p1 = toPx(ox + ex * R, oy + ey * R);
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
      g.strokeStyle = rgba(colors.field, a * 0.22);
      g.lineWidth = 4.5;
      g.stroke();
      g.strokeStyle = rgba(colors.field, a);
      g.lineWidth = 1.25;
      g.stroke();
      g.fillStyle = rgba(colors.field, Math.min(1, a + 0.12));
      const hs = Math.max(7, Math.min(10, scale * 0.45));
      for (let d = -R; d <= R; d += 4) {
        const q = toPx(ox + ex * (d + 2), oy + ey * (d + 2));
        g.beginPath();
        headPath(g, q[0] + ex * hs / 2, q[1] - ey * hs / 2, ex, -ey, hs, hs * 0.42);
        g.fill();
      }
    }
    g.restore();
  }

  // ---------- 粒子：光亮的小球（依電荷正負上色）＋光暈＋輕微投影；先畫成小圖 ----------
  const PR = 8; // 粒子半徑（px）
  let partSprite = null, partKey = '';
  function particleSprite(pc) {
    const sign = par.q > 0 ? 1 : par.q < 0 ? -1 : 0, dark = darkTheme();
    const key = [pc, sign, dpr, dark, colors.surface, colors['mp-shadow'], colors['mp-highlight']].join('|');
    if (key === partKey) return partSprite;
    partKey = key;
    const R = Math.ceil(PR * 3), c = document.createElement('canvas');
    c.width = c.height = Math.ceil(2 * R * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(R, R);
    // 光暈（深色模式稍強）
    const gl = g.createRadialGradient(0, 0, PR * 0.7, 0, 0, PR * 2.6);
    gl.addColorStop(0, rgba(pc, dark ? 0.42 : 0.2));
    gl.addColorStop(1, rgba(pc, 0));
    g.fillStyle = gl;
    g.beginPath(); g.arc(0, 0, PR * 2.6, 0, Math.PI * 2); g.fill();
    // 投影（右下方，柔和）
    const sh = g.createRadialGradient(1.2, 3, PR * 0.4, 1.2, 3, PR * 1.35);
    sh.addColorStop(0, colors['mp-shadow']);
    sh.addColorStop(1, rgba(colors['mp-shadow'], 0));
    g.fillStyle = sh;
    g.beginPath(); g.arc(1.2, 3, PR * 1.35, 0, Math.PI * 2); g.fill();
    // 細的表面色外框：與軌跡分開
    g.fillStyle = rgba(colors.surface, dark ? 0.55 : 0.95);
    g.beginPath(); g.arc(0, 0, PR + 1, 0, Math.PI * 2); g.fill();
    // 球體：亮點偏左上，邊緣加深
    const sg = g.createRadialGradient(-PR * 0.34, -PR * 0.38, PR * 0.05, 0, 0, PR);
    sg.addColorStop(0, mix(pc, '#ffffff', 0.62));
    sg.addColorStop(0.5, pc);
    sg.addColorStop(1, mix(pc, '#000000', 0.32));
    g.fillStyle = sg;
    g.beginPath(); g.arc(0, 0, PR, 0, Math.PI * 2); g.fill();
    // 右下的亮邊（rim light）
    g.strokeStyle = rgba(colors['mp-highlight'], 0.55);
    g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, PR - 0.8, -0.05 * Math.PI, 0.6 * Math.PI); g.stroke();
    // 電荷符號：畫線條（不依賴字型）
    g.lineCap = 'round';
    const arm = 3.3;
    const signPath = function (oy) {
      g.beginPath();
      if (sign !== 0) { g.moveTo(-arm, oy); g.lineTo(arm, oy); }
      if (sign > 0) { g.moveTo(0, oy - arm); g.lineTo(0, oy + arm); }
      if (sign === 0) g.arc(0, oy, 2.6, 0, Math.PI * 2);
    };
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    signPath(0.7); g.stroke();
    g.strokeStyle = '#ffffff';
    signPath(0); g.stroke();
    partSprite = { c: c, R: R };
    return partSprite;
  }

  // ---------- 向量：漸細的箭身＋略帶弧度的箭頭，外圍一圈背景色描邊；全頁幾何一致 ----------
  const VEC = { w0: 3.4, w1: 2.2, head: 11, half: 4.8 };
  /** 從 (x, y) px 畫一支向量（dx, dy 為 px，y 向下）；尖端恰好在 (x + dx, y + dy) */
  function vector(x, y, dx, dy, color, label, dashed, labels) {
    const L = Math.hypot(dx, dy);
    if (L < 1) return;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const hl = Math.min(VEC.head, L * 0.5), hw = VEC.half * hl / VEC.head + 0.6;
    const neck = L - hl * 0.8;
    const tx = x + ux * L, ty = y + uy * L;
    const quad = function (a, b) {
      const wa = (VEC.w0 + (VEC.w1 - VEC.w0) * a / L) / 2, wb = (VEC.w0 + (VEC.w1 - VEC.w0) * b / L) / 2;
      ctx.moveTo(x + ux * a + nx * wa, y + uy * a + ny * wa);
      ctx.lineTo(x + ux * b + nx * wb, y + uy * b + ny * wb);
      ctx.lineTo(x + ux * b - nx * wb, y + uy * b - ny * wb);
      ctx.lineTo(x + ux * a - nx * wa, y + uy * a - ny * wa);
      ctx.closePath();
    };
    ctx.beginPath();
    if (neck > 0) {
      if (dashed) { for (let a = 0; a < neck; a += 8.5) quad(a, Math.min(neck, a + 5)); }
      else quad(0, neck);
    }
    headPath(ctx, tx, ty, ux, uy, hl, hw);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(colors['canvas-bg'], 0.8);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = mix(color, '#000000', 0.18, 0.6);
    ctx.lineWidth = 0.7;
    ctx.stroke();
    if (label) labels.push({ text: label, color: color, tx: tx, ty: ty, ux: ux, uy: uy });
    // 箭頭本身也是標籤要避開的區域
    for (let a = 0; a <= L; a += 6) labels.obst.push({ x: x + ux * a - 3, y: y + uy * a - 3, w: 6, h: 6 });
  }

  // ---------- 標籤：半透明圓角底框（pill），不壓在其他標籤或粒子上 ----------
  function pillSize(text) {
    ctx.font = '600 12px system-ui, sans-serif';
    const m = ctx.measureText(text);
    const fh = (m.fontBoundingBoxAscent || 10) + (m.fontBoundingBoxDescent || 3);
    return { w: m.width + 12, h: Math.round(fh + 5) };
  }
  function drawPill(text, cx, cy, color, sz) {
    const x = cx - sz.w / 2, y = cy - sz.h / 2;
    ctx.save();
    roundRect(ctx, x, y, sz.w, sz.h, sz.h / 2);
    ctx.shadowColor = colors['mp-shadow'];
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = rgba(colors.surface, 0.9);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = rgba(color, 0.45);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }
  function drawLabels(list, pp) {
    const wpx = W * scale, hpx = H * scale;
    const placed = [{ x: pp[0] - PR - 2, y: pp[1] - PR - 2, w: 2 * PR + 4, h: 2 * PR + 4 }].concat(list.obst);
    const hit = function (r) {
      return placed.some(function (o) { return r.x < o.x + o.w + 2 && o.x < r.x + r.w + 2 && r.y < o.y + o.h + 2 && o.y < r.y + r.h + 2; });
    };
    list.forEach(function (lb) {
      if (lb.tx < -2 || lb.tx > wpx + 2 || lb.ty < -2 || lb.ty > hpx + 2) return; // 箭頭尖端在畫面外：不標（原本也看不到）
      const sz = pillSize(lb.text);
      // 候選位置：箭頭尖端外側，依序轉開角度、拉遠距離，取第一個不重疊的位置
      const cands = [];
      [0, 1, 2].forEach(function (k) {
        [0, 0.5, -0.5, 1, -1, 1.57, -1.57, 2.3, -2.3].forEach(function (t) {
          const c = Math.cos(t), s = Math.sin(t);
          const ux = lb.ux * c - lb.uy * s, uy = lb.ux * s + lb.uy * c;
          const d = 5 + k * (sz.h + 4) + Math.abs(ux) * sz.w / 2 + Math.abs(uy) * sz.h / 2;
          cands.push([ux * d, uy * d]);
        });
      });
      let best = null;
      for (let i = 0; i < cands.length; i++) {
        let cx = lb.tx + cands[i][0], cy = lb.ty + cands[i][1];
        cx = Math.min(wpx - sz.w / 2 - 3, Math.max(sz.w / 2 + 3, cx));
        cy = Math.min(hpx - sz.h / 2 - 3, Math.max(sz.h / 2 + 3, cy));
        const r = { x: cx - sz.w / 2, y: cy - sz.h / 2, w: sz.w, h: sz.h, cx: cx, cy: cy };
        if (!best) best = r;
        if (!hit(r)) { best = r; break; }
      }
      placed.push(best);
      drawPill(lb.text, best.cx, best.cy, lb.color, sz);
    });
  }

  // ---------- 事件回饋：每繞一圈、進出場區時的短暫波紋（純裝飾；減少動態效果時不畫） ----------
  const ripples = [];
  function addRipple(color) {
    if (reducedMotion() || !state.p || (view3 && view3.active)) return;
    ripples.push({ x: state.p.x, y: state.p.y, t0: performance.now(), color: color });
    if (ripples.length > 6) ripples.shift();
  }
  function drawRipples() {
    const now = performance.now();
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i], u = (now - r.t0) / 380;
      if (u >= 1 || u < 0) { ripples.splice(i, 1); continue; }
      const q = siPx(r.x, r.y), e = 1 - (1 - u) * (1 - u);
      ctx.strokeStyle = rgba(r.color, 0.6 * (1 - u));
      ctx.lineWidth = 2.2 * (1 - u) + 0.6;
      ctx.beginPath(); ctx.arc(q[0], q[1], PR + 3 + 18 * e, 0, Math.PI * 2); ctx.stroke();
    }
    if (ripples.length && !state.running) requestDraw(); // 動畫停止後讓波紋淡出完畢
  }

  // ---------- 軌跡：越舊越淡、越細（分段畫，每段透明度遞減）；最新一段有柔和光暈 ----------
  function drawTrail(pc) {
    const tr = state.trail, n = tr.length;
    if (!state.show.trail || n < 2) return;
    const dark = darkTheme();
    ctx.lineJoin = 'round';
    // 最新一段（約 70 px）下方的柔和光暈
    const g0 = Math.max(0, n - 48);
    ctx.strokeStyle = rgba(pc, dark ? 0.2 : 0.1);
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = g0; i < n; i++) { const q = siPx(tr[i][0], tr[i][1]); if (i === g0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
    ctx.stroke();
    const bands = Math.min(28, n - 1);
    for (let k = 0; k < bands; k++) {
      const i0 = Math.floor(k * (n - 1) / bands), i1 = Math.floor((k + 1) * (n - 1) / bands);
      const t = (k + 1) / bands, e = t * t;
      ctx.strokeStyle = rgba(pc, 0.4 + 0.55 * e);
      ctx.lineWidth = 1.2 + 1.5 * e;
      ctx.lineCap = k === bands - 1 ? 'round' : 'butt';
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) { const q = siPx(tr[i][0], tr[i][1]); if (i === i0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
      ctx.stroke();
    }
  }

  /** 畫面更新：目前的檢視（2D 或 3D）＋讀數 */
  function draw() {
    if (!state.p) return;
    const f = fieldCfg();
    const F = MC.forces(state.p, f);
    if (view3 && view3.active) view3.frame(f);
    else draw2D(f, F);
    updateReadout(f, F);
  }

  function draw2D(f, F) {
    const p = state.p;
    const wpx = W * scale, hpx = H * scale;
    buildStatic();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgCv, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (par.region) {
      const a = pillSize(T('場區', 'Field region')), b = pillSize(T('無場區', 'No field'));
      drawPill(T('場區', 'Field region'), wpx / 2 + 8 + a.w / 2, 6 + a.h / 2, colors.accent, a);
      drawPill(T('無場區', 'No field'), wpx / 2 - 8 - b.w / 2, 6 + b.h / 2, colors.muted, b);
    }

    // 圓軌道（螺旋線的投影；有電場時為導引中心的迴旋圓）與圓心
    const c = MC.center(p, f);
    let cMark = null; // 圓心標記的位置（標籤要避開）
    if (state.show.orbit && c && c.r > 0) {
      const o = siPx(c.x, c.y), rp = c.r / CM * scale;
      if (rp < 20000) {
        ctx.beginPath(); ctx.arc(o[0], o[1], rp, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(colors.muted, 0.12);
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = rgba(colors.muted, 0.95);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (o[0] > -10 && o[0] < wpx + 10 && o[1] > -10 && o[1] < hpx + 10) {
        cMark = o;
        // 半徑（點線）
        const pp = siPx(p.x, p.y);
        ctx.setLineDash([0.1, 4.5]);
        ctx.strokeStyle = rgba(colors.text, 0.6);
        ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(pp[0], pp[1]); ctx.stroke();
        ctx.setLineDash([]);
        // 圓心標記：小圓＋四段刻線，外圍一圈背景色描邊
        const mark = function () {
          ctx.beginPath();
          ctx.arc(o[0], o[1], 3, 0, Math.PI * 2);
          ctx.moveTo(o[0] - 8.5, o[1]); ctx.lineTo(o[0] - 5, o[1]);
          ctx.moveTo(o[0] + 5, o[1]); ctx.lineTo(o[0] + 8.5, o[1]);
          ctx.moveTo(o[0], o[1] - 8.5); ctx.lineTo(o[0], o[1] - 5);
          ctx.moveTo(o[0], o[1] + 5); ctx.lineTo(o[0], o[1] + 8.5);
        };
        mark();
        ctx.strokeStyle = rgba(colors['canvas-bg'], 0.85);
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = colors.text;
        ctx.lineWidth = 1.7;
        ctx.stroke();
        ctx.fillStyle = colors.text;
        ctx.beginPath(); ctx.arc(o[0], o[1], 1.1, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 出發點（可拖曳：滑過或拖曳時放大並加上光暈）
    const sp = toPx(state.start.x, state.start.y);
    const hot = dragging || hoverStart;
    const sr = hot ? 5.5 : 5, scol = hot ? colors.accent : colors.muted;
    ctx.fillStyle = rgba(colors['canvas-bg'], 0.75);
    ctx.beginPath(); ctx.arc(sp[0], sp[1], sr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = scol;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = scol;
    ctx.beginPath(); ctx.arc(sp[0], sp[1], 1.3, 0, Math.PI * 2); ctx.fill();

    const pc = chargeColor();
    drawTrail(pc);

    // 速度與力的向量（紙面內的分量）；箭頭長度的比例與之前完全相同
    const pp = siPx(p.x, p.y);
    const labels = [];
    labels.obst = [];
    if (cMark) labels.obst.push({ x: cMark[0] - 9, y: cMark[1] - 9, w: 18, h: 18 });
    if (state.show.vec) {
      const v = Math.hypot(p.vx, p.vy);
      if (v > 0) { const L = 14 + 56 * v / 5e5; vector(pp[0], pp[1], p.vx / v * L, -p.vy / v * L, colors.probe, p.vz ? 'v⊥' : 'v', false, labels); }
      const fl = function (fx, fy) {
        const m = Math.hypot(fx, fy);
        const L = Math.min(110, 50 * m / F_REF);
        return m > 0 ? [fx / m * L, -fy / m * L] : [0, 0];
      };
      const fe = fl(F.ex, F.ey), fb = fl(F.bx, F.by);
      vector(pp[0], pp[1], fe[0], fe[1], colors.field, 'qE', true, labels);
      vector(pp[0], pp[1], fb[0], fb[1], colors.equi, 'F', false, labels);
    }

    // 粒子
    const ps = particleSprite(pc);
    ctx.drawImage(ps.c, pp[0] - ps.R, pp[1] - ps.R, 2 * ps.R, 2 * ps.R);
    if (hot) {
      // 拖曳回饋：畫在粒子上層（未發射時粒子正好蓋住出發點）
      const hg = ctx.createRadialGradient(sp[0], sp[1], 8, sp[0], sp[1], 20);
      hg.addColorStop(0, rgba(colors.accent, darkTheme() ? 0.4 : 0.28));
      hg.addColorStop(1, rgba(colors.accent, 0));
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(sp[0], sp[1], 20, 0, Math.PI * 2); ctx.arc(sp[0], sp[1], PR + 4.5, 0, Math.PI * 2); ctx.fill('evenodd');
      ctx.strokeStyle = rgba(colors.accent, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sp[0], sp[1], PR + 4.5, 0, Math.PI * 2); ctx.stroke();
    }
    drawRipples();
    drawLabels(labels, pp);

    // 比例尺（半透明圓角底框）
    ctx.font = '600 12px system-ui, sans-serif';
    const m = ctx.measureText('2 cm');
    const fh = (m.fontBoundingBoxAscent || 10) + (m.fontBoundingBoxDescent || 3);
    const L2 = 2 * scale, bh = Math.round(fh + 10), bw = 10 + L2 + 8 + m.width + 10;
    const bx = 8, by = hpx - 8 - bh, my = by + bh / 2;
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.shadowColor = colors['mp-shadow'];
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = rgba(colors.surface, 0.88);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(colors.text, 0.14);
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.stroke();
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + 10, my); ctx.lineTo(bx + 10 + L2, my);
    ctx.moveTo(bx + 10, my - 4); ctx.lineTo(bx + 10, my + 4);
    ctx.moveTo(bx + 10 + L2, my - 4); ctx.lineTo(bx + 10 + L2, my + 4);
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('2 cm', bx + 10 + L2 + 8, my + 0.5);
  }

  function chargeColor() { return par.q > 0 ? colors.pos : par.q < 0 ? colors.neg : colors.muted; }

  // ---------- 數字格式 ----------
  // 科學記號用 HTML <sup> 排版，不依賴特殊上標字元（部分裝置字型缺字）
  function sci(v, unit) {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a === 0) return '0 ' + unit;
    if (a >= 0.01 && a < 1e4) return Number(v.toPrecision(3)).toLocaleString('en-US').replace('-', '−') + ' ' + unit;
    const ex = Math.floor(Math.log10(a));
    const m = v / Math.pow(10, ex);
    return m.toFixed(2).replace('-', '−') + ' × 10<sup>' + String(ex).replace('-', '−') + '</sup> ' + unit;
  }
  function fmtLen(m) {
    const cm = m / CM;
    return Math.abs(cm) < 1000 ? cm.toFixed(2).replace('-', '−') + ' cm' : sci(m, 'm');
  }
  function fmtTime(s) {
    const us = s * 1e6;
    if (us < 1000) return us.toPrecision(3) + ' μs';
    return sci(s, 's');
  }
  function fmtEV(j) {
    const ev = j / MC.E_CHARGE;
    const d = ev < 100 ? 2 : 1;
    return ev.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' eV';
  }

  function showRows(cls, on) {
    document.querySelectorAll('.' + cls).forEach(function (el) { el.classList.toggle('hide', !on); });
  }

  function updateReadout(f, F) {
    const p = state.p;
    const q = par.q * MC.E_CHARGE, m = par.m * MC.AMU, B = par.B * 1e-3;
    const h = MC.helix(m, q, par.v * 1e5, B, par.theta);
    if (par.q === 0 || par.B === 0) {
      $('rR').textContent = par.q === 0 ? T('∞（q = 0 不受磁力）', '∞ (q = 0: no magnetic force)') : T('∞（B = 0）', '∞ (B = 0)');
      $('rT').textContent = '—';
      $('rP').textContent = '—';
    } else {
      $('rR').innerHTML = h.vPerp === 0 ? '0 cm' : fmtLen(h.r);
      $('rT').innerHTML = fmtTime(h.T);
      $('rP').innerHTML = h.pitch === 0 ? '0 cm' : fmtLen(Math.abs(h.pitch)) + (h.pitch > 0 ? T('（沿 +z）', ' (along +z)') : T('（沿 −z）', ' (along −z)'));
    }
    $('rVperp').innerHTML = sci(h.vPerp, 'm/s');
    $('rVpar').innerHTML = sci(h.vPar, 'm/s');
    $('rF').innerHTML = sci(Math.sqrt(F.bx * F.bx + F.by * F.by + F.bz * F.bz), 'N');
    showRows('eRow', par.E !== 0);
    if (par.E !== 0) {
      $('rFe').innerHTML = sci(Math.sqrt(F.ex * F.ex + F.ey * F.ey + F.ez * F.ez), 'N');
      $('rVd').innerHTML = par.B === 0 ? '—（B = 0）' : sci(Math.abs(par.E * 1e3 / B), 'm/s');
    }
    $('rv').innerHTML = sci(MC.speed(p), 'm/s');
    $('rK').textContent = fmtEV(MC.kinetic(p));
    showRows('zRow', par.theta !== 90 || p.z !== 0);
    $('rz').textContent = fmtLen(p.z);
    $('rt').textContent = (p.t * 1e6).toFixed(3) + ' μs';
    const turns = p.turn / (2 * Math.PI);
    const n = Math.abs(turns).toFixed(3);
    $('rTurn').textContent = Math.abs(turns) < 0.0005 ? T('0 圈', '0 turns') :
      turns < 0 ? T('順時針 ' + n + ' 圈', n + ' turns clockwise') : T('逆時針 ' + n + ' 圈', n + ' turns counterclockwise');
    showRows('regRow', par.region);
    if (par.region) $('rTf').textContent = (p.tField * 1e6).toFixed(3) + ' μs';
    $('status').textContent = state.status;
  }

  function updateSelectorHint() {
    const perp = par.theta === 90;
    const vp = MC.pitchComponents(par.v, par.theta).perp; // 10^5 m/s
    const need = 0.1 * par.B * vp; // kV/m：E = v⊥B（mT × 10^5 m/s = 0.1 kV/m）
    let s;
    if (par.B === 0 || vp === 0) s = perp ? T('速度選擇器需要 B 與 v 都不為零。', 'A velocity selector needs both B and v to be nonzero.') :
      T('速度選擇器需要 B 與 v⊥ 都不為零。', 'A velocity selector needs both B and v⊥ to be nonzero.');
    else {
      const ok = Math.abs(par.E - need) < 1e-9;
      s = perp ? T('以目前的 v 與 B，直線前進需 E = vB = ', 'With the current v and B, straight-line motion needs E = vB = ') :
        T('以目前的 v⊥ 與 B，不偏轉需 E = v⊥B = ', 'With the current v⊥ and B, no deflection needs E = v⊥B = ');
      s += signedN(need, 3, 2) + ' kV/m';
      s += ok ? T('（目前正好滿足）。', ' (satisfied now).') : T('。', '.');
    }
    $('selHint').textContent = s;
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  // 主要頻率都在 250 Hz 以上（手機小喇叭播不出低音）
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  /** 每繞一圈「嗶」一聲：正電荷音高較高、負電荷較低。節奏＝週期 T（與速率無關） */
  function revolutionSound() {
    const S = sound(); if (!S) return;
    const f = par.q > 0 ? 1047 : 784; // C6／G5
    S.tone({ freq: f, dur: 0.09, type: 'sine', gain: 0.75 });
    S.tone({ freq: f * 2, dur: 0.05, type: 'sine', gain: 0.2 });
  }
  /** 進入場區：柔和上滑；離開場區：柔和下滑 */
  function regionSound(enter) {
    const S = sound(); if (!S) return;
    S.sweep(enter ? { from: 440, to: 700, dur: 0.18, type: 'triangle', gain: 0.45 } : { from: 700, to: 440, dur: 0.18, type: 'triangle', gain: 0.45 });
  }
  /** 發射：柔和的兩音上行 */
  function launchSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 523, dur: 0.1, type: 'triangle', gain: 0.45 });
    S.tone({ freq: 784, dur: 0.14, type: 'triangle', gain: 0.4, delay: 0.08 });
  }
  /** 離開畫面（或沿 B 超出範圍）：柔和下滑 */
  function exitSound() {
    const S = sound(); if (!S) return;
    S.sweep({ from: 760, to: 300, dur: 0.35, type: 'sine', gain: 0.5 });
  }

  // ---------- 動畫 ----------
  let lastT = 0;
  function tick(t) {
    if (!state.running) return;
    const dt = Math.min((t - lastT) / 1000, 1 / 30);
    lastT = t;
    const p = state.p;
    const f0 = fieldCfg();
    const rev0 = Math.floor(Math.abs(p.turn) / (2 * Math.PI));
    const in0 = MC.inField(f0, p.x);
    const stop = MC.advance(p, f0, dt * par.speed * 1e-6, {
      bounds: BOUNDS, maxStep: 1e-4, maxAngle: 0.01,
      trail: state.trail,
      trailSpacing: Math.max(1e-4, 1.5 / scale * CM)
    });
    if (state.trail.length > TRAIL_MAX) state.trail.splice(0, state.trail.length - TRAIL_MAX);
    // 音效跟著「模擬時間」：速度方向每轉滿 2π 嗶一聲（慢動作設定改變時節奏也跟著變）
    if (Math.floor(Math.abs(p.turn) / (2 * Math.PI)) > rev0) { revolutionSound(); addRipple(chargeColor()); }
    if (par.region && MC.inField(f0, p.x) !== in0) { regionSound(!in0); addRipple(colors.accent); }
    if (stop) {
      exitSound();
      state.running = false;
      state.ended = true;
      $('run').textContent = T('發射', 'Launch');
      state.status = stop.axis === 'z' ?
        T('粒子沿磁場方向（z 軸）移動超過 ' + ZMAX + ' cm，模擬停止。按「發射」重新開始。', 'The particle moved more than ' + ZMAX + ' cm along the field (z axis), so the simulation stopped. Press “Launch” to start again.') :
        T('粒子離開了畫面。按「發射」從出發點重新開始，或點擊畫布換一個出發點。', 'The particle left the view. Press “Launch” to start again from the starting point, or click the canvas to pick a new one.');
    }
    draw();
    if (state.running) requestAnimationFrame(tick);
  }
  function setRunning(on) {
    if (on && !state.running) {
      if (state.p && state.p.t === 0) launchSound();
      state.running = true;
      $('run').textContent = T('暫停', 'Pause');
      state.status = '';
      lastT = performance.now();
      requestAnimationFrame(tick);
    } else if (!on) {
      state.running = false;
      $('run').textContent = state.ended ? T('發射', 'Launch') : T('繼續', 'Resume');
    }
  }

  $('run').addEventListener('click', function () {
    if (state.running) {
      setRunning(false);
      state.status = T('已暫停', 'Paused');
      requestDraw();
      return;
    }
    if (state.ended) resetParticle();
    setRunning(true);
  });
  $('reset').addEventListener('click', function () { setRunning(false); resetParticle(); });

  // 喇叭按鈕：切換全站音效設定（齒輪面板也能切換，兩邊同步）
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });
  updateSoundButton();

  // ---------- 控制項 ----------
  // 滑桿數字可點擊輸入（js/numinput.js）：讀值一律用 LabNum.value，保留打字輸入的精確值；拖曳後回到滑桿值
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  /** 顯示到打字精度 dec 位（去掉多餘的 0），但至少 minDec 位（滑桿間隔的小數位數） */
  function num(v, dec, minDec) {
    let s = Math.abs(v).toFixed(dec);
    if (dec > minDec) s = s.replace(new RegExp('0{1,' + (dec - minDec) + '}$'), '').replace(/\.$/, '');
    return s;
  }
  function signedN(v, dec, minDec) { return (v > 0 ? '+' : v < 0 ? '−' : '') + num(v, dec, minDec); }
  // 慢動作：滑桿 5 段（SPEEDS），打字可輸入 0.1–2 μs 之間的任意值（對數刻度，取最接近的滑桿位置）
  if (window.LabNum) {
    window.LabNum.register($('speed'), {
      toValue: function (pos) { return SPEEDS[Math.round(pos)]; },
      toPos: function (v) {
        let best = 0;
        SPEEDS.forEach(function (s, i) { if (Math.abs(Math.log(v / s)) < Math.abs(Math.log(v / SPEEDS[best]))) best = i; });
        return best;
      },
      min: SPEEDS[0], max: SPEEDS[SPEEDS.length - 1], decimals: 2
    });
  }
  function bindSlider(id, key, fmt) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.innerHTML = fmt(val(el)); };
    el.addEventListener('input', function () {
      par[key] = val(el);
      update();
      updateSelectorHint();
      if (key !== 'speed') resetParticle();
    });
    update();
    // 程式（預設情境）改變滑桿：先清除打字輸入的精確值
    return function (v) { if (window.LabNum) window.LabNum.clear(el); el.value = v; par[key] = v; update(); };
  }
  const set = {
    B: bindSlider('B', 'B', function (v) { return v === 0 ? '0 mT' : signedN(v, 0, 0) + ' mT' + (v > 0 ? T('（射出紙面）', ' (out of page)') : T('（射入紙面）', ' (into page)')); }),
    q: bindSlider('q', 'q', function (v) { return v === 0 ? '0' : signedN(v, 0, 0) + ' e'; }),
    m: bindSlider('m', 'm', function (v) { return num(v, 3, 0) + ' u'; }),
    v: bindSlider('v', 'v', function (v) { return num(v, 2, 1) + ' × 10<sup>5</sup> m/s'; }),
    theta: bindSlider('theta', 'theta', function (v) {
      return num(v, 1, 0) + '°' + (v === 90 ? T('（v ⊥ B）', ' (v ⊥ B)') : v === 0 ? T('（v 與 B 同向）', ' (v along B)') : v === 180 ? T('（v 與 B 反向）', ' (v opposite B)') : '');
    }),
    ang: bindSlider('ang', 'ang', function (v) { return signedN(v, 1, 0).replace(/^\+/, '') + '°'; }),
    E: bindSlider('E', 'E', function (v) { return v === 0 ? T('0（關閉）', '0 (off)') : signedN(v, 3, 1) + ' kV/m'; }),
    speed: bindSlider('speed', 'speed', function (v) { return T('1 秒 = ', '1 s = ') + num(v, 2, 0) + ' μs'; })
  };
  $('region').addEventListener('change', function (ev) { par.region = ev.target.checked; resetParticle(); });
  [['showTrail', 'trail'], ['showVec', 'vec'], ['showOrbit', 'orbit']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
  });

  const PRESETS = {
    circle: { B: 100, q: 2, m: 4, v: 3, theta: 90, ang: 0, E: 0, region: false, center: [W / 2, H / 2] },
    helix: { B: 100, q: 2, m: 4, v: 3, theta: 60, ang: 0, E: 0, region: false, center: [W / 2, H / 2] },
    region: { B: -100, q: 2, m: 4, v: 2, theta: 90, ang: 0, E: 0, region: true, start: [2, 3.5] },
    selector: { B: 100, q: 2, m: 4, v: 3, theta: 90, ang: 0, E: 30, region: false, start: [1.5, 8] },
    drift: { B: 200, q: 2, m: 4, v: 0, theta: 90, ang: 0, E: 20, region: false, start: [1.5, 7] }
  };
  const STATUS = {
    circle: function () { return T('純磁場：正電荷在射出紙面的磁場中順時針做等速圓周運動。', 'Pure magnetic field: a positive charge moves clockwise in a circle when B points out of the page.'); },
    helix: function () {
      return view3 && view3.active ?
        T('v 與 B 夾 60°：v⊥ 讓粒子繞圈，v∥ 讓它沿 B 等速前進，合成螺旋線。', 'v at 60° to B: v⊥ makes the particle circle while v∥ carries it steadily along B — together a helix.') :
        T('v 與 B 夾 60°：2D 畫面只看到投影的圓。按「3D 立體」看完整的螺旋線。', 'v at 60° to B: the 2D view shows only the projected circle. Press “3D view” to see the full helix.');
    },
    region: function () { return T('粒子垂直射入磁場區，走半圓後反向射出。', 'The particle enters the field region perpendicular to the boundary, follows a semicircle and leaves in the opposite direction.'); },
    selector: function () { return T('E = vB：電力與磁力抵消，粒子直線前進。試著只改 v，或只改 q、m。', 'E = vB: the electric and magnetic forces cancel and the particle goes straight. Try changing only v, or only q or m.'); },
    drift: function () { return T('由靜止釋放：粒子沿 E×B 方向以 E/B 的平均速度漂移（擺線）。', 'Released from rest: the particle drifts along E×B with average speed E/B (a cycloid).'); }
  };
  function applyPreset(name) {
    const pr = PRESETS[name];
    ['B', 'q', 'm', 'v', 'theta', 'ang', 'E'].forEach(function (k) { set[k](pr[k]); });
    par.region = pr.region;
    $('region').checked = pr.region;
    if (pr.center) state.start = startForCenter(pr.center[0], pr.center[1]);
    else state.start = { x: pr.start[0], y: pr.start[1] };
    updateSelectorHint();
    resetParticle();
  }
  document.querySelectorAll('[data-preset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const wasRunning = state.running;
      applyPreset(btn.dataset.preset);
      if (view3 && view3.active) view3.resetCamera(); // 換情境時相機回到預設方向
      if (wasRunning) launchSound(); // 動畫進行中換情境：粒子重新發射
      setRunning(true);
      state.status = STATUS[btn.dataset.preset]();
    });
  });

  // ---------- 點擊／拖曳 2D 畫布：改變出發點 ----------
  function eventWorld(ev) {
    const r = cv.getBoundingClientRect();
    const w = toWorld(ev.clientX - r.left, ev.clientY - r.top);
    return { x: Math.min(W - 0.2, Math.max(0.2, w[0])), y: Math.min(H - 0.2, Math.max(0.2, w[1])) };
  }
  cv.addEventListener('pointerdown', function (ev) {
    dragging = true;
    cv.style.cursor = 'grabbing';
    state.start = eventWorld(ev);
    resetParticle();
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  /** 游標是否停在出發點上（滑過時放大並加光暈，提示可以拖曳） */
  function nearStart(ev) {
    const r = cv.getBoundingClientRect(), sp = toPx(state.start.x, state.start.y);
    return Math.hypot(ev.clientX - r.left - sp[0], ev.clientY - r.top - sp[1]) < 14;
  }
  cv.addEventListener('pointermove', function (ev) {
    if (!dragging) {
      const h = ev.pointerType !== 'touch' && nearStart(ev);
      if (h !== hoverStart) { hoverStart = h; cv.style.cursor = h ? 'grab' : ''; requestDraw(); }
      return;
    }
    state.start = eventWorld(ev);
    resetParticle();
  });
  const endDrag = function () { dragging = false; cv.style.cursor = hoverStart ? 'grab' : ''; requestDraw(); };
  cv.addEventListener('pointerleave', function () { if (hoverStart && !dragging) { hoverStart = false; cv.style.cursor = ''; requestDraw(); } });
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // =====================================================================
  // 3D 檢視（three.js，切換到 3D 時才以 import() 動態載入 vendor/three/）
  // 場景座標以 cm 為單位：sx = x − W/2、sy = y − H/2、sz = z（紙面為 z = 0 的底面，B 沿 z 軸向上）
  // =====================================================================
  let view3 = null;      // 目前的 3D 檢視（切回 2D 時釋放）
  let threeLib = null;   // { THREE, OrbitControls }
  let loadToken = 0;
  const TRAIL3_MAX = 20000;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');

  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }

  function create3D(lib) {
    const THREE = lib.THREE;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', T('帶電粒子運動的 3D 立體檢視（可拖曳旋轉、縮放）', '3D view of the particle motion (drag to rotate, pinch or scroll to zoom)'));
    host3.appendChild(canvas);
    let renderer;
    try {
      // alpha：背景由 CSS 的徑向漸層提供（隨深淺色自動變化）
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) {
      canvas.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1.5, 0.1, 4000);
    camera.up.set(0, 0, 1); // z（B 的方向）朝上；必須在建立 OrbitControls 之前設定
    const viewDir = new THREE.Vector3(0.55, -1.25, 0.62).normalize();
    camera.position.copy(viewDir).multiplyScalar(60);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 4;
    controls.maxDistance = 800;

    // 半球光（天空亮、地面暗）＋一盞幾乎由正上方照下、會投影的方向光：
    // 粒子的影子落在紙面（z = 0）上正下方，看得出粒子在 xy 平面的位置與離紙面的高度
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.6);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(6, -10, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0005;
    const sc = sun.shadow.camera;
    sc.left = -W / 2 - 4; sc.right = W / 2 + 4; sc.bottom = -H / 2 - 4; sc.top = H / 2 + 4;
    sc.near = 1; sc.far = 300;
    scene.add(sun);
    scene.add(sun.target);
    // 接收影子的紙面（只畫影子，不蓋住格線）
    const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, H + 6), new THREE.ShadowMaterial({ opacity: 0.25, depthWrite: false }));
    shadowFloor.receiveShadow = true;
    shadowFloor.position.z = -0.02;
    scene.add(shadowFloor);

    const col = function (name) { return new THREE.Color(colors[name] || '#888888'); };
    const sx = function (x) { return x / CM - W / 2; };
    const sy = function (y) { return y / CM - H / 2; };
    const sz = function (z) { return z / CM; };

    // ---- 會隨設定重建的靜態部分：底面格線、磁力線、場區、座標軸與刻度 ----
    let staticGroup = null;
    let staticKey = '';
    let box = null; // { x0, x1, y0, y1, z0, z1 }（場景座標 cm）

    function disposeObject(obj) {
      obj.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }

    function lineMat(color, opacity) {
      return new THREE.LineBasicMaterial({ color: color, transparent: opacity < 1, opacity: opacity });
    }
    function segments(points, mat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      return new THREE.LineSegments(g, mat);
    }
    /** 文字標籤（Sprite；畫布文字經過 settings.js 的字體大小與簡體轉換） */
    function label(text, color, size) {
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      const px = 64;
      g.font = '600 ' + px + 'px system-ui, sans-serif';
      const w = Math.ceil(g.measureText(text).width) + 24;
      c.width = w; c.height = Math.ceil(px * 1.5);
      g.font = '600 ' + px + 'px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 12;
      g.lineJoin = 'round';
      g.strokeStyle = colors['canvas-bg'];
      g.strokeText(text, w / 2, c.height / 2);
      g.fillStyle = color;
      g.fillText(text, w / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      // 標籤一律畫在最上層（有背景色描邊），不會被線或面遮住
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.set(size * w / c.height, size, 1);
      sp.renderOrder = 2;
      return sp;
    }
    function niceStep(span) {
      const raw = span / 5;
      const steps = [1, 2, 5, 10, 20, 25, 50, 100];
      for (let i = 0; i < steps.length; i++) if (steps[i] >= raw) return steps[i];
      return 100;
    }

    /** 場景尺度：標籤與向量的大小隨螺旋線高度放大，遠看也清楚 */
    function span() { return Math.max(box.z1, 4) - Math.min(box.z0, -4); }
    function unit() { return Math.max(span(), W) / 28; }   // 文字標籤
    function unitA() { return Math.max(1, span() / 32); }  // 向量與粒子

    function buildStatic() {
      const zLo = Math.min(box.z0, -4), zHi = Math.max(box.z1, 4);
      const u = unit();
      const key = [par.B > 0 ? 1 : par.B < 0 ? -1 : 0, par.region, zLo.toFixed(1), zHi.toFixed(1),
        colors.text, colors.muted, colors.accent, colors['canvas-bg'], window.LabSettings && window.LabSettings.get ? window.LabSettings.get('fs') : 1].join('|');
      if (key === staticKey) return;
      staticKey = key;
      if (staticGroup) { scene.remove(staticGroup); disposeObject(staticGroup); }
      const grp = new THREE.Group();
      const textC = colors.text, mutedC = colors.muted;
      const hx = W / 2, hy = H / 2;

      // 底面（紙面）：場區底色、2 cm 格線、外框
      if (par.region) {
        const g = new THREE.PlaneGeometry(hx, H);
        const m = new THREE.MeshBasicMaterial({ color: col('accent'), transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
        const plane = new THREE.Mesh(g, m);
        plane.position.set(hx / 2, 0, -0.01);
        grp.add(plane);
        // 場區邊界：x = W/2 的垂直面
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.Float32BufferAttribute([0, -hy, zLo, 0, hy, zLo, 0, hy, zHi, 0, -hy, zHi], 3));
        bg.setIndex([0, 1, 2, 0, 2, 3]);
        const bm = new THREE.MeshBasicMaterial({ color: col('accent'), transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
        grp.add(new THREE.Mesh(bg, bm));
        grp.add(segments([0, -hy, zLo, 0, hy, zLo, 0, hy, zLo, 0, hy, zHi, 0, hy, zHi, 0, -hy, zHi, 0, -hy, zHi, 0, -hy, zLo, 0, -hy, 0, 0, hy, 0],
          lineMat(col('accent'), 0.7)));
        const fl = label(T('場區', 'Field region'), colors.accent, 1.1 * u);
        fl.position.set(hx / 2, hy + 1.2 * u, 0);
        grp.add(fl);
      }
      const gp = [];
      for (let x = -hx; x <= hx + 1e-9; x += 2) gp.push(x, -hy, 0, x, hy, 0);
      for (let y = -hy; y <= hy + 1e-9; y += 2) gp.push(-hx, y, 0, hx, y, 0);
      grp.add(segments(gp, lineMat(col('text'), 0.13)));
      grp.add(segments([-hx, -hy, 0, hx, -hy, 0, hx, -hy, 0, hx, hy, 0, hx, hy, 0, -hx, hy, 0, -hx, hy, 0, -hx, -hy, 0], lineMat(col('muted'), 0.6)));

      // 磁力線：沿 z 軸的直線＋圓錐箭頭（同一個 InstancedMesh）
      if (par.B !== 0) {
        const lp = [], cones = [];
        const dz = niceStep(zHi - zLo) * 1.6;
        for (let x = 3; x < W; x += 6) {
          if (par.region && x < W / 2) continue;
          for (let y = 2; y < H; y += 6) {
            lp.push(x - hx, y - hy, zLo, x - hx, y - hy, zHi);
            for (let z = zLo + dz * 0.5; z < zHi; z += dz) cones.push([x - hx, y - hy, z]);
          }
        }
        grp.add(segments(lp, lineMat(col('muted'), 0.45)));
        const cg = new THREE.ConeGeometry(0.32 * u, 1.0 * u, 12);
        cg.rotateX(par.B > 0 ? Math.PI / 2 : -Math.PI / 2); // 圓錐尖端指向 ±z（B 的方向）
        const cm = new THREE.MeshStandardMaterial({ color: col('muted'), roughness: 0.6, metalness: 0.05, transparent: true, opacity: 0.85 });
        const inst = new THREE.InstancedMesh(cg, cm, cones.length);
        const mtx = new THREE.Matrix4();
        cones.forEach(function (c, i) { mtx.makeTranslation(c[0], c[1], c[2]); inst.setMatrixAt(i, mtx); });
        inst.instanceMatrix.needsUpdate = true;
        grp.add(inst);
        const bl = label('B', mutedC, 1.8 * u);
        const bx = par.region ? 21 - hx : 3 - hx;
        bl.position.set(bx, 2 - hy, par.B > 0 ? zHi + 1.3 * u : zLo - 1.3 * u);
        grp.add(bl);
      }

      // 座標軸（原點在紙面左下角）與 z 軸刻度
      const ox = -hx, oy = -hy;
      grp.add(segments([ox, oy, 0, ox + W + 2, oy, 0, ox, oy, 0, ox, oy + H + 2, 0, ox, oy, zLo, ox, oy, zHi + 2], lineMat(col('text'), 0.85)));
      const ax = label('x', textC, 1.5 * u); ax.position.set(ox + W + 2 + u, oy, 0); grp.add(ax);
      const ay = label('y', textC, 1.5 * u); ay.position.set(ox, oy + H + 2 + u, 0); grp.add(ay);
      const az = label('z', textC, 1.5 * u); az.position.set(ox, oy, zHi + 2 + u); grp.add(az);
      const step = niceStep(zHi - zLo);
      const tp = [];
      for (let z = Math.ceil(zLo / step) * step; z <= zHi + 1e-9; z += step) {
        tp.push(ox - 0.6, oy, z, ox + 0.6, oy, z);
        if (z === 0) continue;
        const tl = label(String(z).replace('-', '−') + ' cm', mutedC, 1.05 * u);
        tl.position.set(ox - 2.4 * u, oy, z);
        grp.add(tl);
      }
      for (let x = 0; x <= W + 1e-9; x += 4) tp.push(ox + x, oy - 0.6, 0, ox + x, oy + 0.6, 0);
      grp.add(segments(tp, lineMat(col('text'), 0.85)));
      const s0 = label('0', mutedC, 1.05 * u); s0.position.set(ox - 1.2 * u, oy - 1.2 * u, 0); grp.add(s0);
      const s24 = label(W + ' cm', mutedC, 1.05 * u); s24.position.set(ox + W, oy - 1.6 * u, 0); grp.add(s24);

      staticGroup = grp;
      scene.add(grp);
    }

    // ---- 動態部分：粒子、軌跡、向量、迴旋圓與螺旋軸 ----
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.08 }));
    sphere.castShadow = true;
    sphere.renderOrder = 1;
    scene.add(sphere);
    const startMark = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    scene.add(startMark);

    const trailPos = new Float32Array(TRAIL3_MAX * 3);
    // 漸淡的拖尾：每個點的顏色帶透明度（RGBA），越舊越淡（最淡 25%，仍看得出完整的螺旋線）
    const trailCol = new Float32Array(TRAIL3_MAX * 4);
    const trailRGB = new THREE.Color();
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setDrawRange(0, 0);
    const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    trailLine.frustumCulled = false;
    scene.add(trailLine);
    // WebGL 的線只有 1 像素寬；沿軌跡再畫固定像素大小的點，讓軌跡在手機上也看得清楚
    const trailDots = new THREE.Points(trailGeo, new THREE.PointsMaterial({ vertexColors: true, transparent: true, depthWrite: false, size: 2.6, sizeAttenuation: false }));
    trailDots.frustumCulled = false;
    scene.add(trailDots);

    // 迴旋圓（單位圓，依半徑縮放）與螺旋軸
    const circPts = [];
    for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; circPts.push(Math.cos(a), Math.sin(a), 0); }
    const circGeo = new THREE.BufferGeometry();
    circGeo.setAttribute('position', new THREE.Float32BufferAttribute(circPts, 3));
    const circle = new THREE.Line(circGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.8 }));
    circle.computeLineDistances();
    scene.add(circle);
    const axisGeo = new THREE.BufferGeometry();
    axisGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
    const axisLine = new THREE.Line(axisGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.012, gapSize: 0.01, transparent: true, opacity: 0.8 }));
    axisLine.computeLineDistances();
    scene.add(axisLine);
    const radiusLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    radiusLine.frustumCulled = false;
    scene.add(radiusLine);

    function arrow() {
      const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffffff, 0.8, 0.5);
      a.line.material.linewidth = 2;
      scene.add(a);
      return a;
    }
    const arrows = { v: arrow(), F: arrow(), E: arrow() };
    const arrowLabels = {};

    function applyChargeColor() {
      const pc = new THREE.Color(chargeColor());
      sphere.material.color.copy(pc);
      // 帶電粒子微微發光（深色模式稍強），讓它在磁力線之間突顯出來
      sphere.material.emissive.copy(pc).multiplyScalar(isDark() ? 0.35 : 0.12);
      trailRGB.copy(pc);
    }
    function isDark() {
      const c = col('canvas-bg');
      return c.r + c.g + c.b < 0.6;
    }
    function applyColors() {
      applyChargeColor();
      hemi.color.set(0xffffff);
      hemi.groundColor.copy(col('canvas-bg')).lerp(col('text'), 0.35);
      shadowFloor.material.opacity = isDark() ? 0.45 : 0.22;
      startMark.material.color.copy(col('muted'));
      circle.material.color.copy(col('muted'));
      axisLine.material.color.copy(col('muted'));
      radiusLine.material.color.copy(col('text'));
      arrows.v.setColor(col('probe'));
      arrows.F.setColor(col('equi'));
      arrows.E.setColor(col('field'));
      // 向量標籤（顏色改變時重建）
      [['v', 'v', 'probe'], ['F', 'F', 'equi'], ['E', 'qE', 'field']].forEach(function (d) {
        if (arrowLabels[d[0]]) { scene.remove(arrowLabels[d[0]]); disposeObject(arrowLabels[d[0]]); }
        arrowLabels[d[0]] = label(d[1], colors[d[2]], 1.0);
        scene.add(arrowLabels[d[0]]);
      });
    }

    const tmpV = new THREE.Vector3(), tmpO = new THREE.Vector3();
    function setArrow(key, o, vx, vy, vz, len) {
      const a = arrows[key], lb = arrowLabels[key];
      if (!(len > 0.05) || !state.show.vec) { a.visible = false; lb.visible = false; return; }
      tmpV.set(vx, vy, vz).normalize();
      a.position.copy(o);
      a.setDirection(tmpV);
      const hu = unitA();
      a.setLength(len, Math.min(0.9 * hu, len * 0.35), Math.min(0.55 * hu, len * 0.22));
      a.visible = true;
      lb.position.copy(o).addScaledVector(tmpV, len + 0.9 * lb.scale.y);
      lb.visible = true;
    }

    // ---- 預測整條軌跡的範圍，讓相機自動對準螺旋線 ----
    function predictBox() {
      const p = Object.assign({}, state.p);
      const tr = [];
      MC.advance(p, fieldCfg(), 2e-4, { bounds: BOUNDS, maxStep: 5e-3, maxAngle: 0.05, maxSubsteps: 20000, trail: tr, trailSpacing: 5e-3 });
      const b = { x0: -W / 2, x1: W / 2, y0: -H / 2, y1: H / 2, z0: 0, z1: 0 };
      tr.forEach(function (t) {
        const X = sx(t[0]), Y = sy(t[1]), Z = sz(t[2]);
        if (X < b.x0) b.x0 = X; if (X > b.x1) b.x1 = X;
        if (Y < b.y0) b.y0 = Y; if (Y > b.y1) b.y1 = Y;
        if (Z < b.z0) b.z0 = Z; if (Z > b.z1) b.z1 = Z;
      });
      b.z0 = Math.max(b.z0, -ZMAX); b.z1 = Math.min(b.z1, ZMAX);
      return b;
    }
    let fitKey = '';
    function fit(force) {
      const b = box;
      const zLo = Math.min(b.z0, -4), zHi = Math.max(b.z1, 4);
      const key = [b.x0, b.x1, b.y0, b.y1, zLo, zHi, camera.aspect].map(function (v) { return v.toFixed(2); }).join('|');
      if (!force && key === fitKey) return;
      fitKey = key;
      const center = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (zLo + zHi) / 2);
      const dir = force ? viewDir.clone() : camera.position.clone().sub(controls.target).normalize();
      // 相機座標軸：right、upv；每個角需要的距離 d ≥ 深度 + 橫向偏移 / tan(半視角)
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tv = Math.tan(camera.fov * Math.PI / 360), th = tv * camera.aspect;
      const pad = 2.5 * unit(); // 留空間給座標軸標籤
      let dist = 1;
      [b.x0 - pad, b.x1 + pad].forEach(function (X) {
        [b.y0 - pad, b.y1 + pad].forEach(function (Y) {
          [zLo - pad, zHi + pad].forEach(function (Z) {
            const c = new THREE.Vector3(X, Y, Z).sub(center);
            const depth = c.dot(dir);
            dist = Math.max(dist, depth + Math.abs(c.dot(right)) / th, depth + Math.abs(c.dot(upv)) / tv);
          });
        });
      });
      dist *= 1.02;
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.near = Math.max(0.1, dist / 200);
      camera.far = dist * 20;
      camera.updateProjectionMatrix();
      controls.update();
    }

    // ---- 繪製 ----
    let raf = 0;
    function renderNow() {
      if (!api.active || document.hidden) return;
      const want = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize3(); return; }
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved) requestRender(); // 阻尼慣性還在進行
    }
    function requestRender() {
      if (raf || !api.active) return;
      raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
    }
    function resize3() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fit(false);
      requestRender();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize3) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize3);
    controls.addEventListener('change', requestRender);
    const onVisible = function () { if (!document.hidden) requestRender(); };
    document.addEventListener('visibilitychange', onVisible);
    canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    });

    function update(f) {
      const p = state.p;
      const u = unitA();
      const o = tmpO.set(sx(p.x), sy(p.y), sz(p.z));
      sphere.position.copy(o);
      sphere.scale.setScalar(Math.sqrt(u));
      startMark.scale.setScalar(Math.sqrt(u));
      const ul = unit();
      Object.keys(arrowLabels).forEach(function (k) { arrowLabels[k].scale.multiplyScalar(ul / arrowLabels[k].scale.y); });
      const sp = startMark.position;
      sp.set(state.start.x - W / 2, state.start.y - H / 2, 0.02);

      // 軌跡（最多 TRAIL3_MAX 點）
      const tr = state.trail;
      const n = state.show.trail ? Math.min(tr.length, TRAIL3_MAX) : 0;
      const s0 = tr.length - n;
      const cr = trailRGB.r, cg = trailRGB.g, cb = trailRGB.b;
      for (let i = 0; i < n; i++) {
        const t = tr[s0 + i];
        trailPos[3 * i] = sx(t[0]); trailPos[3 * i + 1] = sy(t[1]); trailPos[3 * i + 2] = sz(t[2]);
        const age = n > 1 ? i / (n - 1) : 1; // 0 = 最舊，1 = 最新
        trailCol[4 * i] = cr; trailCol[4 * i + 1] = cg; trailCol[4 * i + 2] = cb;
        trailCol[4 * i + 3] = 0.25 + 0.75 * age * age;
      }
      trailGeo.setDrawRange(0, n);
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
      trailLine.visible = trailDots.visible = n > 1;

      // 迴旋圓（在粒子目前的高度）與螺旋軸
      const c = MC.center(p, f);
      const showC = state.show.orbit && c && c.r > 0 && c.r / CM < 500;
      circle.visible = axisLine.visible = radiusLine.visible = !!showC;
      if (showC) {
        const r = c.r / CM, cx = sx(c.x), cy = sy(c.y), cz = sz(p.z);
        circle.position.set(cx, cy, cz);
        circle.scale.set(r, r, 1);
        circle.material.dashSize = 0.4 / r; circle.material.gapSize = 0.3 / r;
        const zLo = Math.min(box.z0, -4), zHi = Math.max(box.z1, 4);
        axisLine.position.set(cx, cy, zLo);
        axisLine.scale.set(1, 1, zHi - zLo);
        axisLine.material.dashSize = 0.5 / (zHi - zLo); axisLine.material.gapSize = 0.4 / (zHi - zLo);
        const rp = radiusLine.geometry.attributes.position;
        rp.setXYZ(0, cx, cy, cz); rp.setXYZ(1, o.x, o.y, o.z);
        rp.needsUpdate = true;
      }

      // 速度與力（三維向量）
      const v = MC.speed(p);
      setArrow('v', o, p.vx, p.vy, p.vz, v > 0 ? u * (1.2 + 4.2 * v / 5e5) : 0);
      const F = MC.forces(p, f);
      const fb = Math.sqrt(F.bx * F.bx + F.by * F.by + F.bz * F.bz), fe = Math.sqrt(F.ex * F.ex + F.ey * F.ey + F.ez * F.ez);
      setArrow('F', o, F.bx, F.by, F.bz, fb > 0 ? u * Math.min(7, 3.6 * fb / F_REF) : 0);
      setArrow('E', o, F.ex, F.ey, F.ez, fe > 0 ? u * Math.min(7, 3.6 * fe / F_REF) : 0);
    }

    const api = {
      active: true,
      frame: function (f) { update(f); renderNow(); },
      onReset: function () {
        box = predictBox();
        buildStatic();
        applyChargeColor();
        fit(false);
        requestRender();
      },
      onTheme: function () {
        staticKey = '';
        buildStatic();
        applyColors();
        requestRender();
      },
      resetCamera: function () { fit(true); requestRender(); },
      dispose: function () {
        api.active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize3);
        document.removeEventListener('visibilitychange', onVisible);
        controls.dispose();
        Object.keys(arrows).forEach(function (k) { arrows[k].dispose(); });
        disposeObject(scene);
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      }
    };

    // 初始化
    box = predictBox();
    buildStatic();
    applyColors();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    if (w0 && h0) { renderer.setSize(w0, h0, false); camera.aspect = w0 / h0; camera.updateProjectionMatrix(); }
    fit(true);
    return api;
  }

  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewNotes() {
    const is3 = !!(view3 && view3.active);
    $('projNote').hidden = is3 || par.theta === 90;
    $('resetCam').hidden = !is3;
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return; // 載入期間已切回 2D
        view3 = create3D(lib);
        stage.classList.add('is3d');
        viewMsg.textContent = '';
        updateViewNotes();
        if (state.status && /2D|3D/.test(state.status)) state.status = '';
        requestAnimationFrame(function () { if (view3) { view3.onReset(); draw(); } });
        draw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewNotes();
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateViewNotes();
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 啟動 ----------
  function onTheme() {
    readColors();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  readColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  // 齒輪設定切換深淺色時也重畫（settings.js）
  window.addEventListener('lab:themechange', onTheme);
  applyPreset('circle');
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  else window.addEventListener('resize', resize);
  resize();
})();
