/* oscillation.js — 「彈簧振子與單擺」模組的畫面與互動（物理計算在 oscillation-core.js） */
(function () {
  'use strict';
  const OC = window.OscillationCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = function () { return !!(rmq && rmq.matches); };
  const DEG = Math.PI / 180;
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  // ---------- 狀態 ----------
  const state = {
    mode: 'spring',
    running: !reduced(),   // 減少動態效果時，物理動畫預設暫停
    speed: 1,
    show: { arrows: true, ghost: true },
    spring: { m: 0.5, k: 20, A: 0.15, sign: 1, damp: false, b: 0.3 },
    pend: { L: 1, g: 9.8, th0: 20, sign: 1, m: 0.5, damp: false, b: 0.05 },
    drag: null,     // { kind, offset }
    hover: false,
    fx: []          // 轉折點的裝飾波紋 { at, side }
  };

  // ---------- 模擬 ----------
  let ss = null; // 彈簧：{ p, sol, t, turns, info }
  let ps = null; // 單擺：{ p, s, ghost, buf, turns, Tex, T0 }

  function springParams() {
    const q = state.spring;
    return { m: q.m, k: q.k, b: q.damp ? q.b : 0, x0: q.sign * q.A, v0: 0, A: q.A };
  }
  function pendParams() {
    const q = state.pend;
    return { L: q.L, g: q.g, m: q.m, b: q.damp ? q.b : 0, theta0: q.sign * q.th0 };
  }

  function resetSpring() {
    const p = springParams();
    const sol = OC.spring(p);
    const Tref = sol.regime === 'under' || sol.regime === 'none' ? sol.Td : sol.T0;
    ss = {
      p: p, sol: sol, t: 0, turns: [0],
      W: clamp(3 * Tref, 0.6, 40),
      E0: 0.5 * p.k * p.x0 * p.x0,
      vmax: Math.abs(p.x0) * sol.omega0,
      amax: Math.abs(p.x0) * sol.omega0 * sol.omega0
    };
  }

  function resetPend() {
    const p = pendParams();
    const Tex = OC.pendulumPeriod(p.L, p.g, Math.abs(p.theta0));
    const s = OC.pendulumInit(p);
    ps = {
      p: p, s: s, ghost: OC.smallAngle(p), buf: [], turns: [0],
      Tex: Tex, T0: OC.smallAnglePeriod(p.L, p.g),
      W: clamp(3 * Tex, 0.6, 40),
      E0: OC.pendulumEnergy(p, s).E,
      wmax: OC.pendulumMaxOmega(p),
      amax: (p.g / p.L) * Math.sin(Math.min(Math.abs(p.theta0), 90) * DEG)
    };
    pushPend();
  }
  function pendSample() {
    const p = ps.p, s = ps.s, e = OC.pendulumEnergy(p, s), g = ps.ghost.at(s.t);
    return { t: s.t, x: s.th / DEG, v: s.om, a: OC.pendulumAccel(p, s.th, s.om), KE: e.KE, PE: e.PE, E: e.E, gx: g.th / DEG };
  }
  function pushPend() {
    const b = ps.buf, last = b[b.length - 1];
    if (last && ps.s.t - last.t < ps.W / 900) return;
    b.push(pendSample());
    // 只保留畫面時間窗內的資料
    const lo = ps.s.t - ps.W * 1.05;
    let i = 0;
    while (i < b.length - 2 && b[i + 1].t < lo) i++;
    if (i > 0) b.splice(0, i);
  }

  // ---------- 任務模式（missions.js）：回報物理量 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  /** 彈簧這一次釋放的條件（m kg、k N/m、A m、x0 m、b kg/s、週期 s、E0 J） */
  function springInfo() {
    const p = ss.p, sol = ss.sol;
    return { mode: 'spring', m: p.m, k: p.k, A: p.A, x0: p.x0, damp: p.b > 0, b: p.b,
      bc: OC.criticalDamping(p.m, p.k), regime: sol.regime, T0: sol.T0, Td: sol.Td, E0: ss.E0 };
  }
  /** 單擺這一次釋放的條件（L m、g m/s²、th0 度（大小）、m kg、b kg/s、週期 s、E0 J） */
  function pendInfo() {
    const p = ps.p;
    return { mode: 'pendulum', L: p.L, g: p.g, th0: Math.abs(p.theta0), m: p.m, damp: p.b > 0, b: p.b,
      T0: ps.T0, Tex: ps.Tex, E0: ps.E0 };
  }
  /** 新的轉折點：回報轉折點（第 n 個、時刻、離平衡點多遠），湊滿一個週期後回報實測週期 */
  function emitTurn(info, turns, amp) {
    if (!window.LabMission) return;
    const n = turns.length - 1;
    emit('turn', Object.assign(info, { n: n, t: turns[n], amp: amp }));
    const Tm = measured(turns);
    if (isFinite(Tm)) emit('period', Object.assign(info, { Tm: Tm }));
  }

  /** 推進目前模式 dt 秒（物理時間），轉折點時發聲並加上波紋 */
  function advance(dt) {
    if (state.mode === 'spring') {
      const t0 = ss.t, t1 = t0 + dt;
      if (ss.sol.omegaD > 0 && ss.sol.regime !== 'over') {
        OC.turningIndices(ss.sol.omegaD, t0, t1).forEach(function (n) {
          const tt = n * Math.PI / ss.sol.omegaD;
          ss.turns.push(tt);
          turnEvent(Math.sign(ss.sol.state(tt).x));
          emitTurn(springInfo(), ss.turns, Math.abs(ss.sol.state(tt).x));
        });
      }
      ss.t = t1;
      // 任務：有阻尼時，力學能第一次降到釋放時的 0.01%（振幅剩 1%）＝停下來
      if (ss.sol.regime !== 'none' && !ss.settled && ss.sol.state(t1).E <= 1e-4 * ss.E0) {
        ss.settled = true;
        if (window.LabMission) {
          emit('settle', Object.assign(springInfo(), { t: OC.springSettleTime(ss.p, 1e-4), crossed: ss.sol.regime === 'under' }));
        }
      }
    } else {
      OC.pendulumAdvance(ps.p, ps.s, dt, {
        onStep: pushPend,
        onTurn: function (t, th) {
          ps.turns.push(t); turnEvent(Math.sign(th));
          emitTurn(pendInfo(), ps.turns, Math.abs(th) / DEG);
        }
      });
      pushPend();
    }
  }

  function turnEvent(side) {
    tickSound(side);
    if (!reduced()) state.fx.push({ at: performance.now(), side: side });
    if (state.fx.length > 6) state.fx.shift();
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  /**
   * 轉折點的輕「答」聲：右側（正向）高音 C6、左側（負向）低音 G5，交替出現。
   * 節奏就是半週期：改變振幅時節奏不變（彈簧、小角度單擺），大角度單擺則明顯變慢。
   */
  function tickSound(side) {
    const S = window.LabSound;
    if (!S || !S.enabled()) return;
    const f = side >= 0 ? 1046.5 : 784;
    S.tone({ freq: f, dur: 0.07, type: 'sine', gain: 0.5, attack: 0.004 });
    S.tone({ freq: f * 2, dur: 0.03, type: 'sine', gain: 0.12, attack: 0.002 });
    S.noise({ dur: 0.012, gain: 0.16, filter: 3400, q: 1.4 });
  }

  // ---------- 數字格式（負號用 U+2212） ----------
  function num(v, d, signed) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    const s = Math.abs(v).toFixed(d);
    if (v < 0) return '−' + s;
    return (signed && v > 0 ? '+' : '') + s;
  }
  /** 滑桿數字：至少 minD 位小數（滑桿間隔），最多 maxD 位（可打字的精度），去掉多餘的 0 */
  function fmtIn(v, minD, maxD) {
    let s = v.toFixed(maxD);
    if (maxD > minD) s = s.replace(new RegExp('0{1,' + (maxD - minD) + '}$'), '');
    s = s.replace(/\.$/, '');
    return s.replace('-', '−');
  }
  /** 依量值大小決定小數位數（約 3 位有效數字） */
  function decFor(maxAbs) {
    if (!(maxAbs > 0)) return 2;
    return clamp(2 - Math.floor(Math.log10(maxAbs) + 1e-9), 0, 5);
  }

  // ---------- 畫布與顏色 ----------
  const scene = $('scene'), sctx = scene.getContext('2d');
  const graph = $('graph'), gctx = graph.getContext('2d');
  const energy = $('energy'), ectx = energy.getContext('2d');
  let dpr = 1;
  const size = { scene: { w: 300, h: 200 }, graph: { w: 300, h: 150 }, energy: { w: 300, h: 80 } };

  let colors = {};
  let colorVer = 0;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--grid', '--accent', '--accent-soft',
      '--pos', '--neg', '--equi', '--field', '--probe', '--surface']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = luminance(colors['canvas-bg']) < 0.4;
    colorVer++;
  }
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  function luminance(c) { const r = rgbOf(c); return (0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]) / 255; }
  function alpha(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  /** f > 0 往白色混合、f < 0 往黑色混合（由代號顏色產生明暗，不另外發明色相） */
  function shade(c, f) {
    const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }

  function fit(cv, s) {
    s.w = cv.clientWidth;
    s.h = cv.clientHeight;
    cv.width = Math.round(s.w * dpr);
    cv.height = Math.round(s.h * dpr);
  }
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    fit(scene, size.scene);
    fit(graph, size.graph);
    fit(energy, size.energy);
    bgKey = '';
    draw();
  }

  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  // ---------- 繪圖小工具 ----------
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  /** 畫布字級的放大倍率（與 settings.js 相同：1 + (fs − 1) × 0.7） */
  function fontScale() {
    const fs = window.LabSettings && window.LabSettings.get ? +window.LabSettings.get('fs') || 1 : 1;
    return 1 + (fs - 1) * 0.7;
  }
  function font(px, weight) { return (weight ? weight + ' ' : '') + px + 'px system-ui, sans-serif'; }
  /** 有背景色描邊（halo）的文字，任何背景上都清楚 */
  function halo(ctx, text, x, y, color, f, align, base) {
    ctx.font = f || font(12);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = base || 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  /** 帶下標的標籤（例如 a 加下標 t），不用 Unicode 下標字元（部分字型缺字） */
  function subLabel(ctx, base, sub, x, y, color, px) {
    ctx.font = font(px, 700);
    const w1 = ctx.measureText(base).width;
    ctx.font = font(Math.round(px * 0.72), 700);
    const w2 = ctx.measureText(sub).width;
    const x0 = x - (w1 + w2) / 2;
    halo(ctx, base, x0, y, color, font(px, 700), 'left', 'middle');
    halo(ctx, sub, x0 + w1, y + px * 0.3, color, font(Math.round(px * 0.72), 700), 'left', 'middle');
  }
  /** 半透明圓角底框（pill）標籤；回傳寬度 */
  function pill(ctx, text, x, y, color, f, align) {
    ctx.font = f || font(12, 600);
    const fpx = parseFloat((/(\d+(?:\.\d+)?)px/.exec(ctx.font) || [0, 12])[1]); // 實際字級（已隨字體設定縮放）
    const w = ctx.measureText(text).width + 14, h = fpx * 1.6;
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ctx.fillStyle = alpha(colors.surface, 0.82);
    roundRect(ctx, x0, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = alpha(colors.border, 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x0 + w / 2, y + h / 2 + 0.5);
    return w;
  }
  /** 向量箭頭：箭身寬 lw，箭頭長約 4 倍箭身寬、兩側略帶弧度；全頁幾何一致 */
  function arrow(ctx, x0, y0, x1, y1, color, lw) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 1.5) return;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const hl = Math.min(lw * 4, L * 0.6), hw = hl * 0.42;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * hl * 0.8, y1 - uy * hl * 0.8);
    ctx.stroke();
    const bx = x1 - ux * hl, by = y1 - uy * hl;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(bx + ux * hl * 0.45 + nx * hw * 0.55, by + uy * hl * 0.45 + ny * hw * 0.55, bx + nx * hw, by + ny * hw);
    ctx.quadraticCurveTo(bx + ux * hl * 0.25, by + uy * hl * 0.25, bx - nx * hw, by - ny * hw);
    ctx.quadraticCurveTo(bx + ux * hl * 0.45 - nx * hw * 0.55, by + uy * hl * 0.45 - ny * hw * 0.55, x1, y1);
    ctx.fill();
  }
  /** 兩層線條的「管子」：底層粗而暗，上層細而亮、略偏上 */
  function tube(ctx, pts, w, base, light) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = base;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
    if (!light) return;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(0.8, w * 0.36);
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1] - w * 0.22); else ctx.moveTo(p[0], p[1] - w * 0.22); });
    ctx.stroke();
  }
  /** 立體球：亮點偏左上、邊緣加深，外加細的亮邊 */
  function sphere(ctx, x, y, r, base, glow) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.08, x, y, r);
    g.addColorStop(0, shade(base, 0.62));
    g.addColorStop(0.45, shade(base, 0.08));
    g.addColorStop(1, shade(base, -0.42));
    ctx.save();
    if (glow) { ctx.shadowColor = alpha(colors.accent, 0.75); ctx.shadowBlur = 16; }
    else { ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.5)' : 'rgba(20,30,40,0.28)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3; }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = alpha(shade(base, 0.7), 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 0.8, Math.PI * 0.75, Math.PI * 1.6);
    ctx.stroke();
  }
  /** 1、2、5 × 10^n 的刻度間距 */
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  function stepDecimals(step) { return Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); }

  /** 背景：代號底色＋極淡的由上而下漸層與四角暈影 */
  function paintBackground(ctx, w, h) {
    const bg = colors['canvas-bg'];
    const lin = ctx.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, shade(bg, colors.dark ? 0.03 : 0.5));
    lin.addColorStop(1, shade(bg, -0.03));
    ctx.fillStyle = lin;
    ctx.fillRect(0, 0, w, h);
    const rad = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h * 0.45, Math.hypot(w, h) * 0.62);
    rad.addColorStop(0, 'rgba(0,0,0,0)');
    rad.addColorStop(1, colors.dark ? 'rgba(0,0,0,0.22)' : 'rgba(20,40,50,0.05)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- 靜態圖層（背景、牆、地面、尺、天花板…）畫在離屏 canvas ----------
  const bgCanvas = document.createElement('canvas');
  const bgctx = bgCanvas.getContext('2d');
  let bgKey = '';

  // =====================================================================
  // 彈簧振子場景
  // =====================================================================
  const SX0 = -0.57, SX1 = 0.45, WALL = -0.5; // 畫面範圍與牆面位置（m，平衡點 x = 0 為木塊中心）
  function springGeom() {
    const w = size.scene.w, h = size.scene.h, narrow = w < 520;
    const padL = 8, padR = 12;
    const scale = (w - padL - padR) / (SX1 - SX0);
    const floorY = Math.round(h * (narrow ? 0.68 : 0.67));
    const bw = clamp(0.1 * Math.cbrt(state.spring.m / 0.5), 0.06, 0.15); // 木塊寬（m），隨質量變化（示意）
    const bwPx = bw * scale;
    const bhPx = Math.min(bwPx * 0.86, floorY - 96);
    return {
      w: w, h: h, narrow: narrow, scale: scale, floorY: floorY, bw: bw, bwPx: bwPx, bhPx: bhPx,
      X: function (x) { return padL + (x - SX0) * scale; },
      inv: function (px) { return SX0 + (px - padL) / scale; }
    };
  }

  function springStatic(G) {
    const ctx = bgctx, w = G.w, h = G.h;
    paintBackground(ctx, w, h);
    const fy = G.floorY;
    // 地面：光滑的拋光檯面（頂邊高光、往下漸暗），下方為檯面側邊
    const band = G.narrow ? 16 : 22;
    const top = ctx.createLinearGradient(0, fy, 0, fy + band);
    top.addColorStop(0, shade(colors.field, colors.dark ? -0.55 : 0.82));
    top.addColorStop(1, shade(colors.field, colors.dark ? -0.7 : 0.7));
    ctx.fillStyle = top;
    ctx.fillRect(G.X(WALL), fy, w - G.X(WALL), band);
    ctx.fillStyle = alpha(colors.surface, colors.dark ? 0.25 : 0.9);
    ctx.fillRect(G.X(WALL), fy, w - G.X(WALL), 1);
    ctx.fillStyle = alpha(colors.field, colors.dark ? 0.5 : 0.35);
    ctx.fillRect(G.X(WALL), fy + band, w - G.X(WALL), 1);
    // 牆：由左而右的漸層＋斜線
    const wx0 = G.X(SX0) - 20, wx1 = G.X(WALL);
    const wallTop = fy - G.bhPx - (G.narrow ? 46 : 70);
    const wg = ctx.createLinearGradient(wx0, 0, wx1, 0);
    wg.addColorStop(0, shade(colors.field, colors.dark ? -0.7 : 0.55));
    wg.addColorStop(1, shade(colors.field, colors.dark ? -0.5 : 0.72));
    ctx.fillStyle = wg;
    roundRect(ctx, wx0, wallTop, wx1 - wx0, fy + band - wallTop, 3);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx0, wallTop, wx1 - wx0, fy + band - wallTop);
    ctx.clip();
    ctx.strokeStyle = alpha(colors.field, colors.dark ? 0.35 : 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = wallTop - 40; y < fy + band + 40; y += 9) { ctx.moveTo(wx0, y + 20); ctx.lineTo(wx1, y); }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = alpha(colors.surface, colors.dark ? 0.18 : 0.8);
    ctx.fillRect(wx1 - 1, wallTop, 1, fy - wallTop);
    // 尺：刻度每 1 cm（寬螢幕）或 5 cm，數字每 10 或 20 cm
    const ry = fy + band + 6;
    const pxPerM = G.scale;
    const minor = pxPerM * 0.01 >= 5 ? 0.01 : 0.05;
    const labelStep = pxPerM * 0.1 >= 46 ? 0.1 : 0.2;
    ctx.strokeStyle = alpha(colors.muted, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = Math.round(-0.35 / minor); i * minor <= 0.351; i++) {
      const x = i * minor, px = Math.round(G.X(x)) + 0.5;
      const major = Math.abs(x / 0.1 - Math.round(x / 0.1)) < 1e-6;
      const mid = Math.abs(x / 0.05 - Math.round(x / 0.05)) < 1e-6;
      ctx.moveTo(px, ry);
      ctx.lineTo(px, ry + (major ? 8 : mid ? 5 : 3));
    }
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.font = font(11);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = Math.round(-0.3 / labelStep); i * labelStep <= 0.3001; i++) {
      const x = i * labelStep;
      ctx.fillText(num(x, 1), G.X(x), ry + 10);
    }
    ctx.textAlign = 'right';
    ctx.fillText('x (m)', w - 8, ry + 10);
  }

  /** 側視螺旋彈簧：前半圈亮、後半圈暗，看得出纏繞；圈數固定，壓縮時圈距變密 */
  function drawCoil(ctx, xa, xb, y, amp, coils, wire) {
    const lead = Math.min(8, (xb - xa) * 0.08);
    const x0 = xa + lead, x1 = xb - lead;
    const steps = coils * 28;
    const tilt = amp * 0.32 * Math.min(1, (x1 - x0) / (coils * amp * 0.9));
    const front = [], back = [];
    let seg = null, segFront = null;
    for (let j = 0; j <= steps; j++) {
      const th = j / steps * coils * Math.PI * 2;
      const px = x0 + (x1 - x0) * j / steps + tilt * Math.sin(th);
      const py = y - amp * Math.cos(th);
      const isFront = Math.sin(th) >= 0;
      if (isFront !== segFront) {
        if (seg) seg.push([px, py]);
        seg = [[px, py]];
        segFront = isFront;
        (isFront ? front : back).push(seg);
      } else seg.push([px, py]);
    }
    const acc = colors.accent;
    back.forEach(function (p) { tube(ctx, p, wire * 0.8, shade(acc, colors.dark ? -0.5 : -0.35), null); });
    tube(ctx, [[xa, y], [x0, y - amp]], wire, shade(acc, -0.2), shade(acc, 0.45));
    tube(ctx, [[x1, y - amp], [xb, y]], wire, shade(acc, -0.2), shade(acc, 0.45));
    front.forEach(function (p) { tube(ctx, p, wire, shade(acc, -0.1), shade(acc, 0.55)); });
  }

  function drawSpringScene(ctx) {
    const G = springGeom(), w = G.w, h = G.h, fy = G.floorY;
    const key = ['s', w, h, dpr, colorVer, G.bw].join('|');
    if (key !== bgKey) {
      bgCanvas.width = Math.round(w * dpr);
      bgCanvas.height = Math.round(h * dpr);
      bgctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      springStatic(G);
      bgKey = key;
    }
    ctx.drawImage(bgCanvas, 0, 0, w, h);

    const st = ss.sol.state(ss.t), q = state.spring;
    const A = Math.abs(ss.p.x0);
    // 平衡點與 ±A 的虛線
    const lineTop = G.narrow ? 34 : 42;
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    [[0, 0.55], [A, 0.32], [-A, 0.32]].forEach(function (d) {
      const px = Math.round(G.X(d[0])) + 0.5;
      ctx.strokeStyle = alpha(colors.muted, d[1]);
      ctx.beginPath();
      ctx.moveTo(px, lineTop + 14);
      ctx.lineTo(px, fy);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const lf = font(11, 600);
    halo(ctx, 'x = 0', G.X(0), lineTop + 10, colors.muted, lf, 'center');
    halo(ctx, '+A', G.X(A), lineTop + 10, colors.muted, lf, 'center');
    halo(ctx, '−A', G.X(-A), lineTop + 10, colors.muted, lf, 'center');

    // 轉折點的波紋（裝飾）：在 ±A 處閃一下
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now - f.at < 380; });
    state.fx.forEach(function (f) {
      const k = (now - f.at) / 380, px = G.X(f.side * A);
      ctx.strokeStyle = alpha(colors.accent, 0.55 * (1 - k));
      ctx.lineWidth = 2;
      const r = 6 + 18 * k;
      ctx.beginPath();
      ctx.ellipse(px, fy - G.bhPx / 2, r * 0.6, G.bhPx / 2 + r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    });

    const bx = G.X(st.x), bw = G.bwPx, bh = G.bhPx, by = fy - bh;
    // 彈簧：牆面到木塊左側（依實際位置，長度 = x − bw/2 − 牆面）
    const wire = (G.narrow ? 1.6 : 2.2) + (G.narrow ? 1.4 : 2.2) * (q.k - 2) / 98; // 越硬的彈簧線越粗（示意）
    const plate = G.narrow ? 3 : 4;
    drawCoil(ctx, G.X(WALL) + 1, bx - bw / 2 - plate, fy - bh / 2, bh * 0.3, 16, wire);
    // 牆上固定座
    ctx.fillStyle = shade(colors.field, colors.dark ? -0.25 : 0.25);
    roundRect(ctx, G.X(WALL), fy - bh / 2 - bh * 0.22, 4, bh * 0.44, 1.5);
    ctx.fill();

    // 木塊的倒影（光滑檯面）與接觸陰影
    const band = G.narrow ? 16 : 22;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, fy + 1, w, band - 1);
    ctx.clip();
    const rg = ctx.createLinearGradient(0, fy, 0, fy + band);
    rg.addColorStop(0, alpha(colors.neg, colors.dark ? 0.32 : 0.22));
    rg.addColorStop(1, alpha(colors.neg, 0));
    ctx.fillStyle = rg;
    roundRect(ctx, bx - bw / 2, fy + 1, bw, bh, 5);
    ctx.fill();
    ctx.restore();
    const sh = ctx.createRadialGradient(bx, fy, 1, bx, fy, bw * 0.75);
    sh.addColorStop(0, colors.dark ? 'rgba(0,0,0,0.45)' : 'rgba(20,30,40,0.25)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(bx, fy + 1, bw * 0.75, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 木塊：上亮下暗的圓角方塊，頂邊高光、底邊暗線；滑過或拖曳時加外框光暈
    const active = state.drag || state.hover;
    const base = colors.neg;
    ctx.save();
    if (active && !reduced()) { ctx.shadowColor = alpha(colors.accent, 0.8); ctx.shadowBlur = 14; }
    const bg = ctx.createLinearGradient(0, by, 0, by + bh);
    bg.addColorStop(0, shade(base, 0.22));
    bg.addColorStop(1, shade(base, -0.18));
    ctx.fillStyle = bg;
    roundRect(ctx, bx - bw / 2, by, bw, bh, 6);
    ctx.fill();
    ctx.restore();
    if (active) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      roundRect(ctx, bx - bw / 2 - 2, by - 2, bw + 4, bh + 4, 8);
      ctx.stroke();
    }
    ctx.fillStyle = alpha('#ffffff', 0.45);
    ctx.fillRect(bx - bw / 2 + 5, by + 1, bw - 10, 1);
    ctx.fillStyle = alpha('#000000', 0.25);
    ctx.fillRect(bx - bw / 2 + 5, by + bh - 1, bw - 10, 1);
    // 側面的柔和光澤
    const gl = ctx.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
    gl.addColorStop(0, 'rgba(255,255,255,0.10)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0)');
    gl.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = gl;
    roundRect(ctx, bx - bw / 2, by, bw, bh, 6);
    ctx.fill();
    // 質量標籤
    if (bw > 30) {
      ctx.font = font(G.narrow ? 10 : 12, 700);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mt = fmtIn(q.m, 1, 2) + ' kg';
      if (ctx.measureText(mt).width < bw - 8) ctx.fillText(mt, bx, by + bh / 2);
      else ctx.fillText('m', bx, by + bh / 2);
    }

    // 速度與加速度箭頭（長度 ∝ 量值，以本次最大值為滿格）
    if (state.show.arrows) {
      const maxLen = Math.min(G.narrow ? 70 : 120, w * 0.2);
      const lw = G.narrow ? 2.2 : 2.8;
      const yv = by - (G.narrow ? 12 : 16), ya = by - (G.narrow ? 30 : 40);
      const lv = ss.vmax > 0 ? st.v / ss.vmax * maxLen : 0;
      const la = ss.amax > 0 ? clamp(st.a / ss.amax, -1.2, 1.2) * maxLen : 0;
      arrow(ctx, bx, yv, bx + lv, yv, colors.pos, lw);
      arrow(ctx, bx, ya, bx + la, ya, colors.equi, lw);
      const lab = font(G.narrow ? 11 : 13, 700);
      halo(ctx, 'v', bx + lv + (lv >= 0 ? 6 : -6), yv, colors.pos, lab, lv >= 0 ? 'left' : 'right', 'middle');
      halo(ctx, 'a', bx + la + (la >= 0 ? 6 : -6), ya, colors.equi, lab, la >= 0 ? 'left' : 'right', 'middle');
      ctx.fillStyle = colors.text;
      ctx.beginPath();
      ctx.arc(bx, yv, 2, 0, Math.PI * 2);
      ctx.arc(bx, ya, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 角落：時間、週期
    cornerInfo(ctx, w, ss.t, ss.sol.regime === 'over' || ss.sol.regime === 'critical'
      ? '2π√(m/k) = ' + num(ss.sol.T0, 3) + ' s'
      : 'T = ' + num(ss.sol.regime === 'under' ? ss.sol.Td : ss.sol.T0, 3) + ' s');
  }

  /** 左上角：時間（與慢動作倍率）；右上角：週期 */
  function cornerInfo(ctx, w, t, right) {
    const narrow = w < 520, f = font(narrow ? 11 : 12, 600);
    let x = 8;
    x += pill(ctx, 't = ' + num(t, 2) + ' s', x, 8, colors.text, f) + 6;
    if (state.speed < 1) pill(ctx, T('慢動作 ', 'Slow motion ') + state.speed + '×', x, 8, colors.accent, f);
    else if (state.speed > 1) pill(ctx, T('快轉 ', 'Fast ') + state.speed + '×', x, 8, colors.accent, f);
    pill(ctx, right, w - 8, 8, colors.accent, f, 'right');
  }

  // =====================================================================
  // 單擺場景
  // =====================================================================
  const VIEW_L = [0.25, 0.5, 1, 1.5, 2, 3];
  function pendGeom() {
    const w = size.scene.w, h = size.scene.h, narrow = w < 520;
    const q = state.pend;
    const th0 = q.th0;
    const Lv = VIEW_L.find(function (v) { return v >= q.L - 1e-9; }) || 3;
    const bobR = clamp((narrow ? 9 : 13) * Math.cbrt(q.m / 0.5), narrow ? 6 : 8, narrow ? 13 : 19);
    const up = Math.max(0, -Math.cos(th0 * DEG));
    const side = Math.sin(Math.min(th0, 90) * DEG);
    const topRes = narrow ? 40 : 46, pad = 10, bottomRes = narrow ? 10 : 14;
    const Rv = (h - topRes - bottomRes - 2 * bobR) / (1 + up);
    const Rh = side > 0 ? (w - 2 * pad - 2 * bobR) / (2 * side) : Infinity;
    const Rfull = Math.max(20, Math.min(Rv, Rh));
    const R = Rfull * q.L / Lv;
    const cx = w / 2;
    const cy = topRes + (up > 0 ? bobR + Rfull * up : 0);
    return { w: w, h: h, narrow: narrow, R: R, Rfull: Rfull, Lv: Lv, cx: cx, cy: cy, bobR: bobR, up: up, scale: R / q.L };
  }
  function bobPos(G, th) { return [G.cx + G.R * Math.sin(th), G.cy + G.R * Math.cos(th)]; }

  function pendStatic(G) {
    const ctx = bgctx, w = G.w, h = G.h;
    paintBackground(ctx, w, h);
    // 極淡的格線（主格線每 Lv/4、次格線每 Lv/20）
    const unit = niceStep(G.Lv / 4) * G.scale;
    if (unit > 12) {
      ctx.lineWidth = 1;
      [[unit / 5, 0.035], [unit, 0.09]].forEach(function (lv) {
        if (lv[0] < 7) return;
        ctx.strokeStyle = alpha(colors.field, lv[1] * (colors.dark ? 0.8 : 1));
        ctx.beginPath();
        for (let x = G.cx % lv[0]; x < w; x += lv[0]) { const px = Math.round(x) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, h); }
        for (let y = G.cy % lv[0]; y < h; y += lv[0]) { const py = Math.round(y) + 0.5; ctx.moveTo(0, py); ctx.lineTo(w, py); }
        ctx.stroke();
      });
    }
    // 懸掛：小角度時畫天花板橫樑；釋放角超過 90° 時改為固定在背板上的軸
    if (G.up === 0) {
      const half = Math.min(G.narrow ? 70 : 110, w * 0.22), y1 = G.cy - 10, y0 = y1 - 10;
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, shade(colors.field, colors.dark ? -0.45 : 0.62));
      g.addColorStop(1, shade(colors.field, colors.dark ? -0.62 : 0.45));
      ctx.fillStyle = g;
      roundRect(ctx, G.cx - half, y0, 2 * half, y1 - y0, 3);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.rect(G.cx - half, y0 - 12, 2 * half, 12);
      ctx.clip();
      ctx.strokeStyle = alpha(colors.field, 0.3);
      ctx.beginPath();
      for (let x = G.cx - half - 12; x < G.cx + half; x += 8) { ctx.moveTo(x, y0); ctx.lineTo(x + 10, y0 - 10); }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = shade(colors.field, colors.dark ? -0.3 : 0.3);
      roundRect(ctx, G.cx - 3, y1 - 1, 6, 9, 2);
      ctx.fill();
    } else {
      const s = 26;
      const g = ctx.createLinearGradient(0, G.cy - s / 2, 0, G.cy + s / 2);
      g.addColorStop(0, shade(colors.field, colors.dark ? -0.4 : 0.66));
      g.addColorStop(1, shade(colors.field, colors.dark ? -0.6 : 0.48));
      ctx.fillStyle = g;
      roundRect(ctx, G.cx - s / 2, G.cy - s / 2, s, s, 6);
      ctx.fill();
      ctx.fillStyle = alpha(colors.field, 0.35);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        ctx.beginPath();
        ctx.arc(G.cx + c[0] * 8.5, G.cy + c[1] * 8.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // 鉛直參考線
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = alpha(colors.muted, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(G.cx) + 0.5, G.cy);
    ctx.lineTo(Math.round(G.cx) + 0.5, G.cy + G.R + G.bobR + 6);
    ctx.stroke();
    // 擺錘的圓弧路徑（−θ0 到 +θ0）
    const th0 = state.pend.th0 * DEG;
    ctx.strokeStyle = alpha(colors.muted, 0.35);
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.R, Math.PI / 2 - th0, Math.PI / 2 + th0);
    ctx.stroke();
    ctx.setLineDash([]);
    // 比例尺
    const len = niceStep(G.Lv / 5);
    const px = len * G.scale;
    const label = len >= 1 ? num(len, 0) + ' m' : num(len * 100, 0) + ' cm';
    const f = font(11, 600);
    ctx.font = f;
    const tw = ctx.measureText(label).width;
    const bw = Math.max(px, tw) + 16, bh = 30, x0 = 8, y0 = h - bh - 8;
    ctx.fillStyle = alpha(colors.surface, 0.8);
    roundRect(ctx, x0, y0, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = alpha(colors.border, 0.9);
    ctx.stroke();
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    const lx = x0 + (bw - px) / 2, ly = y0 + bh - 8;
    ctx.moveTo(lx, ly - 4); ctx.lineTo(lx, ly); ctx.lineTo(lx + px, ly); ctx.lineTo(lx + px, ly - 4);
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x0 + bw / 2, ly - 6);
  }

  function drawRod(ctx, x0, y0, x1, y1, w, ghost) {
    if (ghost) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = alpha(colors.muted, 0.6);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    // 金屬輕桿：兩層線條，下層暗、上層細亮
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const ox = -dy / L * w * 0.18, oy = dx / L * w * 0.18;
    ctx.lineCap = 'round';
    ctx.strokeStyle = shade(colors.field, colors.dark ? -0.15 : 0.05);
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = alpha(shade(colors.field, 0.75), colors.dark ? 0.5 : 0.65);
    ctx.lineWidth = Math.max(0.8, w * 0.35);
    ctx.beginPath(); ctx.moveTo(x0 - ox, y0 - oy); ctx.lineTo(x1 - ox, y1 - oy); ctx.stroke();
  }

  function drawPendScene(ctx) {
    const G = pendGeom(), w = G.w, h = G.h, q = state.pend;
    const key = ['p', w, h, dpr, colorVer, G.R, G.cy, G.bobR, q.th0, q.L].join('|');
    if (key !== bgKey) {
      bgCanvas.width = Math.round(w * dpr);
      bgCanvas.height = Math.round(h * dpr);
      bgctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pendStatic(G);
      bgKey = key;
    }
    ctx.drawImage(bgCanvas, 0, 0, w, h);

    const s = ps.s, th = s.th;
    const pos = bobPos(G, th);
    const rodW = G.narrow ? 2.6 : 3.4;

    // 小角度近似的虛影
    const ghostOn = state.show.ghost;
    let gpos = null;
    if (ghostOn) {
      const gth = ps.ghost.at(s.t).th;
      gpos = bobPos(G, gth);
      drawRod(ctx, G.cx, G.cy, gpos[0], gpos[1], rodW, true);
      ctx.fillStyle = alpha(colors.muted, colors.dark ? 0.16 : 0.12);
      ctx.strokeStyle = alpha(colors.muted, 0.8);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(gpos[0], gpos[1], G.bobR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 擺錘的拖尾（最近約 1/5 週期，越舊越淡越細）
    const buf = ps.buf, tlo = s.t - ps.Tex * 0.2;
    let i0 = buf.length - 1;
    while (i0 > 0 && buf[i0 - 1].t >= tlo) i0--;
    for (let i = i0 + 1; i < buf.length; i++) {
      const a = bobPos(G, buf[i - 1].x * DEG), b = bobPos(G, buf[i].x * DEG);
      const k = (buf[i].t - tlo) / (s.t - tlo || 1);
      ctx.strokeStyle = alpha(colors.neg, 0.4 * k);
      ctx.lineWidth = 1 + 3 * k;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // 擺角弧與標籤
    const ar = Math.max(18, Math.min(G.R * 0.28, 46));
    if (Math.abs(th) > 0.5 * DEG) {
      ctx.strokeStyle = alpha(colors.accent, 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (th > 0) ctx.arc(G.cx, G.cy, ar, Math.PI / 2 - th, Math.PI / 2);
      else ctx.arc(G.cx, G.cy, ar, Math.PI / 2, Math.PI / 2 - th);
      ctx.stroke();
    }
    const thLab = 'θ = ' + num(th / DEG, 1) + '°';
    const thFont = font(G.narrow ? 11 : 12, 700);
    if (Math.abs(th) < 40 * DEG) {
      // 角度小時夾角太窄：標在鉛直線的另一側，不壓在桿上
      const sgn = th >= 0 ? -1 : 1;
      halo(ctx, thLab, G.cx + sgn * 7, G.cy + ar + 6, colors.accent, thFont, sgn > 0 ? 'left' : 'right', 'middle');
    } else {
      const lr = ar + 16, la = th / 2;
      halo(ctx, thLab, G.cx + lr * Math.sin(la), G.cy + lr * Math.cos(la), colors.accent, thFont, 'center', 'middle');
    }

    // 轉折點的波紋（裝飾）
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now - f.at < 380; });
    state.fx.forEach(function (f) {
      const k = (now - f.at) / 380;
      ctx.strokeStyle = alpha(colors.accent, 0.55 * (1 - k));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos[0], pos[1], G.bobR + 3 + 16 * k, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 輕桿、軸、擺錘
    drawRod(ctx, G.cx, G.cy, pos[0], pos[1], rodW, false);
    const hub = ctx.createRadialGradient(G.cx - 1.5, G.cy - 1.5, 0.5, G.cx, G.cy, 6);
    hub.addColorStop(0, shade(colors.field, colors.dark ? 0.2 : 0.75));
    hub.addColorStop(1, shade(colors.field, colors.dark ? -0.35 : -0.1));
    ctx.fillStyle = hub;
    ctx.beginPath(); ctx.arc(G.cx, G.cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = alpha(colors['canvas-bg'], 0.8);
    ctx.beginPath(); ctx.arc(G.cx, G.cy, 1.8, 0, Math.PI * 2); ctx.fill();
    const active = state.drag || state.hover;
    sphere(ctx, pos[0], pos[1], G.bobR * (active && !reduced() ? 1.07 : 1), colors.neg, active && !reduced());
    if (active) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos[0], pos[1], G.bobR + 4, 0, Math.PI * 2); ctx.stroke();
    }

    // 虛影標籤（和真實擺錘分開時才標）
    if (ghostOn && gpos && Math.hypot(gpos[0] - pos[0], gpos[1] - pos[1]) > G.bobR * 3.2) {
      const dir = gpos[0] >= G.cx ? 1 : -1;
      halo(ctx, T('小角度近似', 'Small-angle'), gpos[0] + dir * (G.bobR + 6), gpos[1] + G.bobR + 10, colors.muted,
        font(G.narrow ? 10 : 11, 600), dir > 0 ? 'left' : 'right', 'middle');
    }

    // 速度、切向加速度箭頭（沿切線；長度 ∝ 量值，以本次最大值為滿格）
    if (state.show.arrows) {
      const maxLen = Math.min(G.narrow ? 64 : 100, w * 0.18);
      const lw = G.narrow ? 2.2 : 2.8;
      const tx = Math.cos(th), ty = -Math.sin(th); // θ 增加的方向（畫面座標）
      const om = s.om, al = OC.pendulumAccel(ps.p, th, om);
      const lv = ps.wmax > 0 ? om / ps.wmax * maxLen : 0;
      const la = ps.amax > 0 ? clamp(al / ps.amax, -1.2, 1.2) * maxLen : 0;
      // 兩支箭頭略為錯開（沿桿的方向），避免重疊
      const rx = Math.sin(th), ry = Math.cos(th);
      const offV = -(G.bobR + 7), offA = -(G.bobR + (G.narrow ? 20 : 26)); // 兩支都畫在擺錘內側（靠支點），不會超出畫面下緣
      const v0x = pos[0] + rx * offV, v0y = pos[1] + ry * offV;
      const a0x = pos[0] + rx * offA, a0y = pos[1] + ry * offA;
      arrow(ctx, v0x, v0y, v0x + tx * lv, v0y + ty * lv, colors.pos, lw);
      arrow(ctx, a0x, a0y, a0x + tx * la, a0y + ty * la, colors.equi, lw);
      const lab = font(G.narrow ? 11 : 13, 700);
      if (Math.abs(lv) > 6) halo(ctx, 'v', v0x + tx * (lv + Math.sign(lv) * 9), v0y + ty * (lv + Math.sign(lv) * 9), colors.pos, lab, 'center', 'middle');
      if (Math.abs(la) > 6) subLabel(ctx, 'a', 't', a0x + tx * (la + Math.sign(la) * 10), a0y + ty * (la + Math.sign(la) * 10), colors.equi, G.narrow ? 11 : 13);
    }

    cornerInfo(ctx, w, s.t, 'T = ' + num(ps.Tex, 3) + ' s');
  }

  // =====================================================================
  // 圖表：x–t、v–t、a–t（單擺為 θ、ω、α）
  // =====================================================================
  /** 目前時間窗內的取樣點：彈簧用解析解即時取樣；單擺用積分時存下的資料 */
  function samples() {
    if (state.mode === 'spring') {
      const t = ss.t, W = ss.W, lo = Math.max(0, t - 0.9 * W);
      const n = 360, out = [];
      for (let i = 0; i <= n; i++) {
        const tt = lo + (t - lo) * i / n;
        out.push(ss.sol.state(tt));
      }
      return { lo: lo, W: W, t: t, pts: out };
    }
    const t = ps.s.t, W = ps.W, lo = Math.max(0, t - 0.9 * W);
    const pts = ps.buf.filter(function (q) { return q.t >= lo - 1e-9; });
    const last = pts[pts.length - 1];
    if (!last || last.t < t - 1e-12) pts.push(pendSample());
    return { lo: lo, W: W, t: t, pts: pts };
  }

  function stripsDef() {
    if (state.mode === 'spring') {
      const A = Math.abs(ss.p.x0);
      return [
        { key: 'x', name: 'x', unit: 'm', color: colors.neg, max: A, dec: decFor(A) },
        { key: 'v', name: 'v', unit: 'm/s', color: colors.pos, max: ss.vmax, dec: decFor(ss.vmax) },
        { key: 'a', name: 'a', unit: 'm/s²', color: colors.equi, max: ss.amax, dec: decFor(ss.amax) }
      ];
    }
    const th0 = Math.abs(ps.p.theta0);
    return [
      { key: 'x', name: 'θ', unit: '°', color: colors.neg, max: th0, dec: 1, ghost: true },
      { key: 'v', name: 'ω', unit: 'rad/s', color: colors.pos, max: ps.wmax, dec: decFor(ps.wmax) },
      { key: 'a', name: 'α', unit: 'rad/s²', color: colors.equi, max: ps.amax, dec: decFor(ps.amax) }
    ];
  }

  function drawGraph(S) {
    const ctx = gctx, w = size.graph.w, h = size.graph.h;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBackground(ctx, w, h);
    const narrow = w < 520;
    const L = narrow ? 44 : 54, R = 10, top = 2, bottom = 26;
    const headH = Math.round((narrow ? 17 : 19) * fontScale()); // 每張小圖上方的標題列
    const strips = stripsDef();
    const sh = (h - top - bottom) / 3;
    const X = function (t) { return L + (t - S.lo) / S.W * (w - L - R); };
    const turns = state.mode === 'spring' ? ss.turns : ps.turns;

    strips.forEach(function (d, i) {
      const hy = top + i * sh, y0 = hy + headH, y1 = top + (i + 1) * sh - 3, ym = (y0 + y1) / 2;
      const ymax = d.max * 1.18 || 1;
      const Y = function (v) { return ym - v / ymax * (y1 - y0) / 2; };
      // 面板底色與框
      ctx.fillStyle = alpha(colors.surface, colors.dark ? 0.35 : 0.6);
      roundRect(ctx, L, y0, w - L - R, y1 - y0, 6);
      ctx.fill();
      ctx.strokeStyle = alpha(colors.border, 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();
      // 格線：0 與 ±最大值
      ctx.strokeStyle = alpha(colors.field, 0.1);
      ctx.beginPath();
      [d.max, -d.max].forEach(function (v) { const py = Math.round(Y(v)) + 0.5; ctx.moveTo(L, py); ctx.lineTo(w - R, py); });
      ctx.stroke();
      ctx.strokeStyle = alpha(colors.field, 0.32);
      ctx.beginPath();
      ctx.moveTo(L, Math.round(ym) + 0.5); ctx.lineTo(w - R, Math.round(ym) + 0.5);
      ctx.stroke();
      // 縱軸刻度：±最大值
      ctx.fillStyle = colors.muted;
      ctx.font = font(narrow ? 10 : 11);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const md = d.dec > 0 ? Math.max(0, d.dec - 1) : 0;
      ctx.fillText(num(d.max, md), L - 4, Y(d.max));
      ctx.fillText('0', L - 4, ym);
      ctx.fillText(num(-d.max, md), L - 4, Y(-d.max));

      ctx.save();
      ctx.beginPath();
      ctx.rect(L, y0, w - L - R, y1 - y0);
      ctx.clip();
      // 轉折點的鉛直參考線（貫穿三張圖，方便比較相位）
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = alpha(colors.accent, 0.35);
      ctx.beginPath();
      turns.forEach(function (tt) {
        if (tt < S.lo || tt > S.t) return;
        const px = Math.round(X(tt)) + 0.5;
        ctx.moveTo(px, y0); ctx.lineTo(px, y1);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      // 阻尼包絡線 ±A e^(−γt)（彈簧、欠阻尼）
      if (state.mode === 'spring' && i === 0 && ss.sol.regime === 'under') {
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = alpha(d.color, 0.45);
        ctx.lineWidth = 1.2;
        [1, -1].forEach(function (sg) {
          ctx.beginPath();
          for (let k = 0; k <= 60; k++) {
            const tt = S.lo + (S.t - S.lo) * k / 60;
            const env = d.max * Math.exp(-ss.sol.gamma * tt) * Math.sqrt(1 + Math.pow(ss.sol.gamma / ss.sol.omegaD, 2));
            const py = Y(sg * env);
            if (k) ctx.lineTo(X(tt), py); else ctx.moveTo(X(tt), py);
          }
          ctx.stroke();
        });
        ctx.setLineDash([]);
      }
      // 小角度近似（虛線）
      if (d.ghost && state.show.ghost) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = alpha(colors.muted, 0.85);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        S.pts.forEach(function (q, k) { const px = X(q.t), py = Y(q.gx); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // 曲線：底層淡色粗線＋上層實線
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = alpha(d.color, 0.18);
      ctx.lineWidth = 5;
      ctx.beginPath();
      S.pts.forEach(function (q, k) { const px = X(q.t), py = Y(q[d.key]); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.stroke();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      // 目前時刻的點
      const cur = S.pts[S.pts.length - 1];
      if (cur) {
        const px = X(cur.t), py = clamp(Y(cur[d.key]), y0, y1);
        ctx.fillStyle = colors['canvas-bg'];
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      // 標題與目前數值
      const hf = font(narrow ? 11 : 12, 700);
      halo(ctx, d.name + ' (' + d.unit + ')', L + 2, hy + headH / 2, d.color, hf, 'left', 'middle');
      if (cur) halo(ctx, d.name + ' = ' + num(cur[d.key], d.dec, true), w - R - 2, hy + headH / 2, colors.text, hf, 'right', 'middle');
    });

    // 時間軸
    const step = niceStep(S.W / (narrow ? 4 : 7));
    const sd = stepDecimals(step);
    ctx.fillStyle = colors.muted;
    ctx.font = font(narrow ? 10 : 11);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = alpha(colors.muted, 0.6);
    ctx.beginPath();
    const yb = h - bottom + 2;
    for (let k = Math.ceil(S.lo / step - 1e-9); k * step <= S.lo + S.W + 1e-9; k++) {
      const tt = k * step, px = X(tt);
      if (px < L - 0.5 || px > w - R + 0.5) continue;
      ctx.moveTo(Math.round(px) + 0.5, yb - 3); ctx.lineTo(Math.round(px) + 0.5, yb + 1);
      if (px > L + 12 && px < w - R - 30) ctx.fillText(num(tt, sd), px, yb + 3);
    }
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText('t (s)', w - R, yb + 3);
  }

  // =====================================================================
  // 能量：長條（左／上）＋ 能量對時間（右／下）
  // =====================================================================
  function drawEnergy(S) {
    const ctx = ectx, w = size.energy.w, h = size.energy.h;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBackground(ctx, w, h);
    const narrow = w < 520;
    const E0 = state.mode === 'spring' ? ss.E0 : ps.E0;
    const damp = state.mode === 'spring' ? ss.p.b > 0 : ps.p.b > 0;
    const cur = S.pts[S.pts.length - 1] || { KE: 0, PE: 0, E: E0 };
    const dec = clamp(2 - Math.floor(Math.log10(E0 || 1) + 1e-9), 1, 5);
    const rows = [
      { name: T('動能 KE', 'Kinetic KE'), v: cur.KE, c: colors.pos },
      { name: state.mode === 'spring' ? T('彈性位能 U', 'Elastic U') : T('重力位能 U', 'Gravit. U'), v: cur.PE, c: colors.neg },
      { name: T('力學能 E', 'Total E'), v: cur.E, c: colors.field }
    ];
    if (damp) rows.push({ name: T('轉為熱能', 'To heat'), v: Math.max(0, E0 - cur.E), c: colors.muted, hatch: true });

    // 版面
    let bx, by, bw, bhTot, cx0, cy0, cw, chh;
    if (narrow) {
      bx = 8; by = 8; bw = w - 16; bhTot = Math.min(h * 0.46, rows.length * 24);
      cx0 = 40; cy0 = by + bhTot + 10; cw = w - cx0 - 10; chh = h - cy0 - 20;
    } else {
      bx = 10; by = 10; bw = Math.min(330, w * 0.4); bhTot = h - 20;
      cx0 = bx + bw + 52; cy0 = 12; cw = w - cx0 - 12; chh = h - cy0 - 22;
    }
    // 長條
    ctx.font = font(narrow ? 11 : 12, 600);
    const labW = Math.max.apply(null, rows.map(function (r) { return ctx.measureText(r.name).width; })) + 8;
    const valW = ctx.measureText('0.' + '0'.repeat(dec) + ' J').width + 8;
    const rh = bhTot / rows.length;
    const trackX = bx + labW, trackW = Math.max(30, bw - labW - valW);
    rows.forEach(function (r, i) {
      const y = by + i * rh, bh = Math.min(16, rh * 0.6), yy = y + (rh - bh) / 2;
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = font(narrow ? 11 : 12, 600);
      ctx.fillText(r.name, bx, yy + bh / 2);
      ctx.fillStyle = alpha(colors.field, colors.dark ? 0.16 : 0.08);
      roundRect(ctx, trackX, yy, trackW, bh, bh / 2);
      ctx.fill();
      const f = E0 > 0 ? clamp(r.v / E0, 0, 1.02) : 0;
      if (f * trackW > 1) {
        const g = ctx.createLinearGradient(0, yy, 0, yy + bh);
        g.addColorStop(0, shade(r.c, 0.28));
        g.addColorStop(1, shade(r.c, -0.12));
        ctx.fillStyle = r.hatch ? alpha(r.c, 0.55) : g;
        roundRect(ctx, trackX, yy, Math.max(bh, f * trackW), bh, bh / 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(trackX + bh / 2, yy + 1.5, Math.max(0, f * trackW - bh), 1);
      }
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'right';
      ctx.font = font(narrow ? 11 : 12);
      ctx.fillText(num(r.v, dec) + ' J', bx + bw, yy + bh / 2);
    });
    // 能量對時間
    if (cw < 40 || chh < 30) return;
    const Emax = E0 * 1.3 || 1;
    const X = function (t) { return cx0 + (t - S.lo) / S.W * cw; };
    const Y = function (E) { return cy0 + chh - E / Emax * chh; };
    ctx.fillStyle = alpha(colors.surface, colors.dark ? 0.35 : 0.6);
    roundRect(ctx, cx0, cy0, cw, chh, 6);
    ctx.fill();
    ctx.strokeStyle = alpha(colors.border, 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.font = font(narrow ? 10 : 11);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(num(E0, dec), cx0 - 4, Y(E0));
    ctx.fillText('0', cx0 - 4, Y(0));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = alpha(colors.field, 0.4);
    ctx.beginPath();
    ctx.moveTo(cx0, Math.round(Y(E0)) + 0.5); ctx.lineTo(cx0 + cw, Math.round(Y(E0)) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx0, cy0, cw, chh);
    ctx.clip();
    [['PE', colors.neg, 2], ['KE', colors.pos, 2], ['E', colors.field, 2.4]].forEach(function (c) {
      ctx.strokeStyle = c[1];
      ctx.lineWidth = c[2];
      ctx.lineJoin = 'round';
      ctx.beginPath();
      S.pts.forEach(function (q, k) { const px = X(q.t), py = Y(q[c[0]]); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.stroke();
    });
    ctx.restore();
    halo(ctx, T('能量 (J)', 'Energy (J)'), cx0 + 8, cy0 + 4, colors.text, font(narrow ? 11 : 12, 700), 'left', 'top');
    // 時間軸數字
    const step = niceStep(S.W / (narrow ? 3 : 5));
    const sd = stepDecimals(step);
    ctx.fillStyle = colors.muted;
    ctx.font = font(narrow ? 10 : 11);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let k = Math.ceil(S.lo / step - 1e-9); k * step <= S.lo + S.W + 1e-9; k++) {
      const px = X(k * step);
      if (px > cx0 + 10 && px < cx0 + cw - 44) ctx.fillText(num(k * step, sd), px, cy0 + chh + 4);
    }
    ctx.textAlign = 'right';
    ctx.fillText('t (s)', cx0 + cw, cy0 + chh + 4);
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function measured(turns) {
    const n = turns.length;
    return n >= 3 ? turns[n - 1] - turns[n - 3] : NaN;
  }
  function updateReadouts(S) {
    const cur = S.pts[S.pts.length - 1];
    if (state.mode === 'spring') {
      const sol = ss.sol, q = state.spring;
      const st = ss.sol.state(ss.t);
      const dx = decFor(Math.abs(ss.p.x0)), dv = decFor(ss.vmax), da = decFor(ss.amax);
      const dE = clamp(2 - Math.floor(Math.log10(ss.E0 || 1) + 1e-9), 1, 5);
      $('sRt').textContent = num(ss.t, 2) + ' s';
      $('sRx').textContent = num(st.x, dx) + ' m';
      $('sRv').textContent = num(st.v, dv) + ' m/s';
      $('sRa').innerHTML = num(st.a, da) + ' m/s<sup>2</sup>';
      $('sRK').textContent = num(st.KE, dE) + ' J';
      $('sRU').textContent = num(st.PE, dE) + ' J';
      $('sRE').textContent = num(st.E, dE) + ' J';
      const Tm = measured(ss.turns);
      $('sTm').textContent = isFinite(Tm) ? num(Tm, 3) + ' s' : '—';
      return;
    }
    const s = ps.s, p = ps.p, e = OC.pendulumEnergy(p, s);
    const dE = clamp(2 - Math.floor(Math.log10(ps.E0 || 1) + 1e-9), 1, 5);
    $('pRt').textContent = num(s.t, 2) + ' s';
    $('pRth').textContent = num(s.th / DEG, 1) + '°';
    $('pRw').textContent = num(s.om, decFor(ps.wmax)) + ' rad/s';
    $('pRa').innerHTML = num(OC.pendulumAccel(p, s.th, s.om), decFor(ps.amax)) + ' rad/s<sup>2</sup>';
    $('pRK').textContent = num(e.KE, dE) + ' J';
    $('pRU').textContent = num(e.PE, dE) + ' J';
    $('pRE').textContent = num(e.E, dE) + ' J';
    const Tm = measured(ps.turns);
    $('pTm').textContent = isFinite(Tm) ? num(Tm, 4) + ' s' : '—';
    if (cur) { /* 讀數與圖表同一個時刻 */ }
  }

  /** 參數改變時才需要更新的讀數（週期等） */
  function updateStatic() {
    if (state.mode === 'spring') {
      const q = state.spring, sol = ss.sol;
      $('sT').textContent = num(sol.T0, 3) + ' s';
      $('sW').textContent = num(sol.omega0, 3) + ' rad/s';
      $('sF').textContent = num(1 / sol.T0, 3) + ' Hz';
      $('sBc').textContent = num(OC.criticalDamping(q.m, q.k), 2) + ' kg/s';
      const names = {
        none: T('無阻尼', 'Undamped'), under: T('欠阻尼', 'Underdamped'),
        critical: T('臨界阻尼', 'Critically damped'), over: T('過阻尼', 'Overdamped')
      };
      const reg = q.damp ? OC.spring({ m: q.m, k: q.k, b: q.b, A: 1 }).regime : 'none';
      $('sRegime').innerHTML = '<span class="regime">' + names[reg] + '</span>';
      return;
    }
    const q = state.pend;
    $('pT0').textContent = num(ps.T0, 4) + ' s';
    $('pT').textContent = num(ps.Tex, 4) + ' s';
    const d = OC.periodExcess(q.th0) * 100;
    $('pDiff').textContent = (d < 0.1 ? num(d, 3) : d < 10 ? num(d, 2) : num(d, 1)) + '%';
  }

  function updateStatus() {
    let msg = '';
    if (state.mode === 'spring') {
      const reg = ss.sol.regime;
      if (reg === 'over') msg = T('過阻尼：木塊慢慢回到平衡點，不會越過它。', 'Overdamped: the block creeps back to equilibrium without crossing it.');
      else if (reg === 'critical') msg = T('臨界阻尼：最快回到平衡點而不越過。', 'Critically damped: the fastest return to equilibrium without overshooting.');
    } else {
      const q = state.pend;
      if (q.th0 > 90) msg = T('釋放角超過 90°：擺錘會擺到支點上方，所以用硬桿代替繩子。', 'Release angle above 90°: the bob rises above the pivot, so a rigid rod is used instead of a string.');
      else if (q.th0 <= 10) msg = T('小角度：真實單擺與小角度近似幾乎重合。', 'Small angle: the real pendulum and the small-angle approximation almost coincide.');
    }
    if (!state.running && !state.drag) msg = (msg ? msg + ' ' : '') + T('已暫停。', 'Paused.');
    $('status').textContent = msg;
  }

  // =====================================================================
  // 主繪圖與動畫
  // =====================================================================
  function draw() {
    if (!ss || !ps) return;
    const w = size.scene.w, h = size.scene.h;
    if (w && h) {
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (state.mode === 'spring') drawSpringScene(sctx); else drawPendScene(sctx);
    }
    const S = samples();
    drawGraph(S);
    drawEnergy(S);
    updateReadouts(S);
  }

  let lastT = 0, rafId = 0;
  function tick(now) {
    rafId = 0;
    const dt = Math.min((now - lastT) / 1000, 1 / 30) * state.speed;
    lastT = now;
    if (state.running && !state.drag) advance(dt);
    draw();
    if (state.running || state.fx.length) rafId = requestAnimationFrame(tick);
  }
  function loop() {
    if (rafId) return;
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function setRunning(on) {
    state.running = on;
    $('play').textContent = on ? T('暫停', 'Pause') : T('播放', 'Play');
    updateStatus();
    if (on) loop(); else requestDraw();
  }

  /** 參數改變：從釋放位置重新開始（播放狀態不變） */
  function restart() {
    if (state.mode === 'spring') resetSpring(); else resetPend();
    state.fx = [];
    updateStatic();
    updateStatus();
    requestDraw();
    if (state.running) loop();
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function bindSlider(id, minD, maxD, unit, onInput) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.innerHTML = fmtIn(val(el), minD, maxD) + unit; };
    el.addEventListener('input', function () { update(); onInput(val(el)); });
    el.addEventListener('change', update);
    update();
    return { el: el, update: update };
  }
  const sliders = {
    sm: bindSlider('sm', 1, 2, ' kg', function (v) { state.spring.m = v; restart(); }),
    sk: bindSlider('sk', 0, 1, ' N/m', function (v) { state.spring.k = v; restart(); }),
    sA: bindSlider('sA', 2, 3, ' m', function (v) { state.spring.A = v; restart(); }),
    sb: bindSlider('sb', 2, 2, ' kg/s', function (v) { state.spring.b = v; if (state.spring.damp) restart(); }),
    pL: bindSlider('pL', 2, 2, ' m', function (v) { state.pend.L = v; restart(); }),
    pth: bindSlider('pth', 0, 1, '°', function (v) { state.pend.th0 = v; syncAnglePresets(); restart(); }),
    pg: bindSlider('pg', 2, 2, ' m/s<sup>2</sup>', function (v) { state.pend.g = v; syncG(); restart(); }),
    pm: bindSlider('pm', 1, 2, ' kg', function (v) { state.pend.m = v; restart(); }),
    pb: bindSlider('pb', 3, 3, ' kg/s', function (v) { state.pend.b = v; if (state.pend.damp) restart(); })
  };
  // 初始值從滑桿讀取（瀏覽器可能保留上次的位置）
  state.spring.m = val($('sm')); state.spring.k = val($('sk')); state.spring.A = val($('sA')); state.spring.b = val($('sb'));
  state.pend.L = val($('pL')); state.pend.th0 = val($('pth')); state.pend.g = val($('pg')); state.pend.m = val($('pm')); state.pend.b = val($('pb'));

  /** 程式設定滑桿（預設值按鈕、拖曳）：清掉打字的精確值，直接改位置 */
  function setSlider(id, v) {
    const el = $(id);
    if (window.LabNum) window.LabNum.clear(el);
    el.value = String(v);
    sliders[id].update();
  }

  const gBtns = document.querySelectorAll('[data-g]');
  function syncG() { gBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.g - state.pend.g) < 1e-9)); }); }
  gBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (window.LabNum) window.LabNum.set($('pg'), +b.dataset.g); // 會觸發 input 事件 → 重新開始
      else { setSlider('pg', +b.dataset.g); state.pend.g = +b.dataset.g; syncG(); restart(); }
    });
  });
  const thBtns = document.querySelectorAll('[data-th]');
  function syncAnglePresets() { thBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.th - state.pend.th0) < 1e-9)); }); }
  thBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (window.LabNum) window.LabNum.set($('pth'), +b.dataset.th);
      else { setSlider('pth', +b.dataset.th); state.pend.th0 = +b.dataset.th; syncAnglePresets(); restart(); }
    });
  });
  syncG();
  syncAnglePresets();

  function bindDamp(chk, box, range, obj) {
    const apply = function () {
      obj.damp = $(chk).checked;
      $(range).disabled = !obj.damp;
      $(box).classList.toggle('dim', !obj.damp);
    };
    $(chk).addEventListener('change', function () { apply(); restart(); });
    apply();
  }
  bindDamp('sDamp', 'sDampBox', 'sb', state.spring);
  bindDamp('pDamp', 'pDampBox', 'pb', state.pend);

  $('showArrows').addEventListener('change', function (e) { state.show.arrows = e.target.checked; requestDraw(); });
  $('showGhost').addEventListener('change', function (e) {
    state.show.ghost = e.target.checked;
    $('legGhost').style.display = state.show.ghost ? '' : 'none';
    requestDraw();
  });
  state.show.arrows = $('showArrows').checked;
  state.show.ghost = $('showGhost').checked;

  // 播放速度
  const speedBtns = document.querySelectorAll('[data-speed]');
  speedBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      state.speed = +b.dataset.speed;
      speedBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      requestDraw();
    });
  });

  $('play').addEventListener('click', function () {
    const was = state.running;
    setRunning(!state.running);
    if (!was || !window.LabMission) return;
    // 任務：暫停瞬間的狀態（彈簧 x m、v m/s、a m/s²；單擺 th 度、om rad/s、al rad/s²；能量 J）
    if (state.mode === 'spring') {
      const st = ss.sol.state(ss.t);
      emit('pause', Object.assign(springInfo(), { t: ss.t, x: st.x, v: st.v, a: st.a, KE: st.KE, PE: st.PE, E: st.E }));
    } else {
      const s = ps.s, e = OC.pendulumEnergy(ps.p, s);
      emit('pause', Object.assign(pendInfo(), { t: s.t, th: s.th / DEG, om: s.om, al: OC.pendulumAccel(ps.p, s.th, s.om), KE: e.KE, PE: e.PE, E: e.E }));
    }
  });
  $('reset').addEventListener('click', function () { restart(); setRunning(true); });
  // 全部清除：兩個分頁的圖表、拖尾、轉折點紀錄與虛影都歸零，回到 t = 0 的釋放位置（保留滑桿設定），暫停待播放
  $('clearAll').addEventListener('click', function () {
    resetSpring();
    resetPend();
    state.fx = [];
    bgKey = '';
    updateStatic();
    setRunning(false);
    $('status').textContent = T('已全部清除：回到 t = 0 的釋放位置，按「播放」開始。', 'Everything cleared: back at the release position at t = 0. Press “Play” to start.');
  });

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

  // ---------- 分頁 ----------
  const tabs = [$('tabSpring'), $('tabPend')];
  function setMode(mode, focus) {
    state.mode = mode;
    const sp = mode === 'spring';
    tabs.forEach(function (t) {
      const on = t.dataset.mode === mode;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $('springPanel').hidden = !sp;
    $('pendPanel').hidden = sp;
    $('legSpring').hidden = !sp;
    $('legPend').hidden = sp;
    $('hintSpring').hidden = !sp;
    $('hintPend').hidden = sp;
    $('ghostWrap').hidden = sp;
    $('graphTitle').textContent = sp ? T('x–t、v–t、a–t 圖', 'x–t, v–t and a–t graphs') : T('θ–t、ω–t、α–t 圖', 'θ–t, ω–t and α–t graphs');
    bgKey = '';
    state.fx = [];
    state.hover = false;
    try { history.replaceState(null, '', sp ? location.pathname + location.search : '#pendulum'); } catch (e) { /* 忽略 */ }
    updateStatic();
    updateStatus();
    requestDraw();
    if (state.running) loop();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { if (t.dataset.mode !== state.mode) setMode(t.dataset.mode); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const j = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - i;
        setMode(tabs[j].dataset.mode, true);
      }
    });
  });

  // ---------- 在畫布上拖曳木塊或擺錘 ----------
  function pointer(ev) {
    const r = scene.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }
  function hit(pt) {
    if (state.mode === 'spring') {
      const G = springGeom(), x = G.X(ss.sol.state(ss.t).x), pad = 10;
      return pt[0] > x - G.bwPx / 2 - pad && pt[0] < x + G.bwPx / 2 + pad &&
        pt[1] > G.floorY - G.bhPx - pad && pt[1] < G.floorY + pad;
    }
    const G = pendGeom(), b = bobPos(G, ps.s.th);
    return Math.hypot(pt[0] - b[0], pt[1] - b[1]) < G.bobR + 14;
  }
  function dragTo(pt) {
    if (state.mode === 'spring') {
      const G = springGeom();
      let x = G.inv(pt[0] - state.drag.offset);
      x = clamp(Math.round(x * 100) / 100, -0.3, 0.3);
      const A = Math.max(0.02, Math.abs(x)), sign = x < 0 ? -1 : 1;
      if (A === state.spring.A && sign === state.spring.sign) return;
      state.spring.A = A; state.spring.sign = sign;
      setSlider('sA', A);
    } else {
      const G = pendGeom();
      let d = Math.atan2(pt[0] - G.cx, pt[1] - G.cy) / DEG;
      const sign = d < 0 ? -1 : 1;
      d = clamp(Math.round(Math.abs(d)), 1, 170);
      if (d === state.pend.th0 && sign === state.pend.sign) return;
      state.pend.th0 = d; state.pend.sign = sign;
      setSlider('pth', d);
      syncAnglePresets();
    }
    restart();
  }
  scene.addEventListener('pointerdown', function (ev) {
    const pt = pointer(ev);
    if (!hit(pt)) return;
    let offset = 0;
    if (state.mode === 'spring') offset = pt[0] - springGeom().X(ss.sol.state(ss.t).x);
    state.drag = { offset: offset, wasRunning: state.running };
    scene.setPointerCapture(ev.pointerId);
    scene.classList.add('grabbing');
    ev.preventDefault();
    dragTo(pt);
    updateStatus();
  });
  scene.addEventListener('pointermove', function (ev) {
    const pt = pointer(ev);
    if (state.drag) { dragTo(pt); return; }
    if (ev.pointerType === 'touch') return;
    const h = hit(pt);
    if (h !== state.hover) {
      state.hover = h;
      scene.classList.toggle('grab', h);
      requestDraw();
    }
  });
  function endDrag() {
    if (!state.drag) return;
    state.drag = null;
    scene.classList.remove('grabbing');
    restart();
    setRunning(true); // 放手 = 釋放
  }
  scene.addEventListener('pointerup', endDrag);
  scene.addEventListener('pointercancel', endDrag);
  scene.addEventListener('pointerleave', function () {
    if (state.hover && !state.drag) { state.hover = false; scene.classList.remove('grab'); requestDraw(); }
  });

  // ---------- 啟動 ----------
  readColors();
  resetSpring();
  resetPend();
  const themeChanged = function () { readColors(); bgKey = ''; requestDraw(); };
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(function () { resize(); });
    [scene, graph, energy].forEach(function (c) { ro.observe(c); });
  } else window.addEventListener('resize', resize);
  setMode(location.hash === '#pendulum' ? 'pendulum' : 'spring');
  setRunning(state.running);
  if (!state.running && reduced()) {
    $('status').textContent = T('已暫停（系統設定為減少動態效果），按「播放」開始。', 'Paused because your system asks for reduced motion — press “Play” to start.');
  }
  resize();
})();
