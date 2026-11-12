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
    show3: { phase: true },  // 3D 檢視：相空間螺旋
    spring: { m: 0.5, k: 20, A: 0.15, sign: 1, damp: false, b: 0.3 },
    pend: { L: 1, g: 9.8, th0: 20, sign: 1, m: 0.5, damp: false, b: 0.05 },
    drag: null,     // { kind, offset }
    hover: false,
    fx: []          // 轉折點的裝飾波紋 { at, side }
  };
  let kb = null;    // 畫布鍵盤操作（keys.js）
  /** 鍵盤正選著第 i 個物件（畫焦點框用） */
  function kbOn(i) { return !!(kb && kb.focused() && kb.index() === i); }

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
          if (ss.turns.length === 3) sayMeasured(measured(ss.turns), 3);
        });
      }
      ss.t = t1;
      // 任務：有阻尼時，力學能第一次降到釋放時的 0.01%（振幅剩 1%）＝停下來
      if (ss.sol.regime !== 'none' && !ss.settled && ss.sol.state(t1).E <= 1e-4 * ss.E0) {
        ss.settled = true;
        say(T('木塊幾乎停在平衡點了（力學能只剩釋放時的 0.01%），t = ', 'The block has almost stopped at equilibrium (only 0.01% of the starting energy is left), t = ') +
          num(OC.springSettleTime(ss.p, 1e-4), 2) + ' s' + T('。', '.'));
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
          if (ps.turns.length === 3) sayMeasured(measured(ps.turns), 4);
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
  // 共用繪圖工具 LabDraw（js/drawkit.js）：立體球、方塊、管子、箭頭、標籤底框、格線、背景，深淺色自動
  const D = window.LabDraw;
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
  function luminance(c) { const r = D.rgb(c); return (0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]) / 255; }
  /** 半透明；shade：f > 0 往白色混合、f < 0 往黑色混合（由代號顏色產生明暗，不另外發明色相） */
  const alpha = D.alpha, shade = D.shade;

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

  // ---------- 繪圖小工具（外觀交給 LabDraw，全站一致） ----------
  const roundRect = D.roundRect;
  /** 畫布字級的放大倍率（與 settings.js 相同：1 + (fs − 1) × 0.7） */
  function fontScale() {
    const fs = window.LabSettings && window.LabSettings.get ? +window.LabSettings.get('fs') || 1 : 1;
    return 1 + (fs - 1) * 0.7;
  }
  function font(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + D.FONT; }
  /** 有背景色描邊（halo）的文字，任何背景上都清楚 */
  function halo(ctx, text, x, y, color, f, align, base) {
    D.haloText(ctx, text, x, y, color || colors.text, align, base, f || font(12));
  }
  /**
   * 半透明圓角底框（pill）標籤。y 為底框上緣（vbase = 'middle' 時為底框中線）；回傳寬度。
   * 底框高度依實際字級（已隨字體設定縮放）計算，放大字體也不會擠出框外。
   */
  function pill(ctx, text, x, y, color, f, align, vbase) {
    f = f || font(12, 600);
    ctx.font = f;
    const ph = D.textHeight(ctx.measureText(text), 15) + 3;
    const b = D.pill(ctx, text, x, (vbase === 'middle' ? y + ph / 2 : y + ph), color, align || 'left', f);
    return b.w;
  }
  /** 向量箭頭（LabDraw.arrow：略帶弧度的箭頭、背景色描邊、箭身高光；全站幾何一致） */
  function arrow(ctx, x0, y0, x1, y1, color, lw) { D.arrow(ctx, x0, y0, x1, y1, color, lw); }
  /** 由點列建立路徑的函式（給 LabDraw.tube 用） */
  function polyPath(pts, dy) {
    dy = dy || 0;
    return function (c) { pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1] + dy); else c.moveTo(p[0], p[1] + dy); }); };
  }
  /** 鍵盤焦點框（keys.js 選到的物件）：背景色描邊＋ --accent 色虛線圓角框 */
  function focusBox(ctx, x, y, w, h, r) {
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.lineWidth = 4;
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.85);
    ctx.stroke();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.accent;
    ctx.stroke();
    ctx.restore();
  }
  /** 1、2、5 × 10^n 的刻度間距 */
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  function stepDecimals(step) { return Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); }

  /** 背景：代號底色＋極淡的由上而下光線與四角暈影（LabDraw.backdrop） */
  function paintBackground(ctx, w, h) {
    D.backdrop(ctx, w, h);
    const lin = ctx.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, colors.dark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.55)');
    lin.addColorStop(0.45, 'rgba(255,255,255,0)');
    ctx.fillStyle = lin;
    ctx.fillRect(0, 0, w, h);
  }
  /** 圖表面板：半透明底、細框、上緣一條極淡的亮線（有一點浮起來的感覺） */
  function panel(ctx, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.35)' : alpha(colors.text, 0.08);
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = alpha(colors.surface, colors.dark ? 0.4 : 0.72);
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = alpha(colors.border, 0.9);
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
    ctx.stroke();
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
    const ctx = bgctx, w = G.w, h = G.h, dk = colors.dark;
    paintBackground(ctx, w, h);
    const fy = G.floorY, xw = G.X(WALL);
    const band = G.narrow ? 16 : 22;
    // 兩級格線（主格線每 0.1 m、次格線每 0.02 m，對齊 x = 0 與檯面）：與下方的尺同一個比例
    D.grid(ctx, xw, 0, w, fy, 0.1 * G.scale, 0.02 * G.scale >= 9 ? 0.02 * G.scale : 0, G.X(0), fy);
    // 格線往上漸淡（上方留給時間、週期的標籤）
    const fade = ctx.createLinearGradient(0, 0, 0, fy * 0.55);
    fade.addColorStop(0, alpha(colors['canvas-bg'], 0.85));
    fade.addColorStop(1, alpha(colors['canvas-bg'], 0));
    ctx.fillStyle = fade;
    ctx.fillRect(xw, 0, w - xw, fy * 0.55);

    // 檯面：拋光的上表面（頂邊高光、往下漸暗）＋前緣暗線＋檯面下的柔和陰影
    const top = ctx.createLinearGradient(0, fy, 0, fy + band);
    top.addColorStop(0, shade(colors.field, dk ? -0.5 : 0.86));
    top.addColorStop(0.55, shade(colors.field, dk ? -0.6 : 0.76));
    top.addColorStop(1, shade(colors.field, dk ? -0.7 : 0.64));
    ctx.fillStyle = top;
    ctx.fillRect(xw, fy, w - xw, band);
    // 頂面的長條反光（光滑檯面）
    const gl = ctx.createLinearGradient(xw, 0, w, 0);
    gl.addColorStop(0, alpha('#ffffff', 0));
    gl.addColorStop(0.35, alpha('#ffffff', dk ? 0.05 : 0.35));
    gl.addColorStop(0.7, alpha('#ffffff', 0));
    ctx.fillStyle = gl;
    ctx.fillRect(xw, fy + 2, w - xw, Math.round(band * 0.35));
    ctx.fillStyle = alpha('#ffffff', dk ? 0.2 : 0.95);
    ctx.fillRect(xw, fy, w - xw, 1);
    ctx.fillStyle = alpha(shade(colors.field, -0.5), dk ? 0.7 : 0.4);
    ctx.fillRect(xw, fy + band - 1, w - xw, 1);
    // 實驗桌的正面（往下漸淡），尺貼在上面
    const face = ctx.createLinearGradient(0, fy + band, 0, h);
    face.addColorStop(0, alpha(shade(colors.field, dk ? -0.66 : 0.8), dk ? 0.7 : 0.6));
    face.addColorStop(1, alpha(shade(colors.field, dk ? -0.66 : 0.8), 0));
    ctx.fillStyle = face;
    ctx.fillRect(xw, fy + band, w - xw, h - fy - band);
    const under = ctx.createLinearGradient(0, fy + band, 0, fy + band + 7);
    under.addColorStop(0, D.shadowInk(dk ? 0.4 : 0.12));
    under.addColorStop(1, D.shadowInk(0));
    ctx.fillStyle = under;
    ctx.fillRect(xw, fy + band, w - xw, 7);

    // 牆：由左而右的漸層＋斜線，右緣亮邊；牆腳投在檯面上的淡影
    const wx0 = G.X(SX0) - 20, wx1 = xw;
    const wallTop = fy - G.bhPx - (G.narrow ? 46 : 70);
    ctx.save();
    ctx.shadowColor = dk ? 'rgba(0,0,0,0.45)' : alpha(colors.text, 0.16);
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    const wg = ctx.createLinearGradient(wx0, 0, wx1, 0);
    wg.addColorStop(0, shade(colors.field, dk ? -0.72 : 0.5));
    wg.addColorStop(1, shade(colors.field, dk ? -0.52 : 0.74));
    ctx.fillStyle = wg;
    roundRect(ctx, wx0, wallTop, wx1 - wx0, fy + band - wallTop, 3);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx0, wallTop, wx1 - wx0, fy + band - wallTop);
    ctx.clip();
    ctx.strokeStyle = alpha(colors.field, dk ? 0.32 : 0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = wallTop - 40; y < fy + band + 40; y += 9) { ctx.moveTo(wx0, y + 20); ctx.lineTo(wx1, y); }
    ctx.stroke();
    // 牆頂的高光
    ctx.fillStyle = alpha('#ffffff', dk ? 0.12 : 0.6);
    ctx.fillRect(wx0, wallTop, wx1 - wx0, 1);
    ctx.restore();
    ctx.fillStyle = alpha('#ffffff', dk ? 0.16 : 0.75);
    ctx.fillRect(wx1 - 1, wallTop + 2, 1, fy - wallTop - 2);
    const ws = ctx.createLinearGradient(wx1, 0, wx1 + 26, 0);
    ws.addColorStop(0, D.shadowInk(dk ? 0.3 : 0.1));
    ws.addColorStop(1, D.shadowInk(0));
    ctx.fillStyle = ws;
    ctx.fillRect(wx1, fy + 1, 26, band - 1);

    // 尺：半透明底條＋刻度（每 1 cm 或 5 cm），數字每 10 或 20 cm
    const ry = fy + band + 6;
    const pxPerM = G.scale;
    const minor = pxPerM * 0.01 >= 5 ? 0.01 : 0.05;
    const labelStep = pxPerM * 0.1 >= 46 ? 0.1 : 0.2;
    const rx0 = G.X(-0.35) - 8, rx1 = G.X(0.35) + 8;
    ctx.fillStyle = alpha(colors.surface, dk ? 0.28 : 0.7);
    roundRect(ctx, rx0, ry - 3, rx1 - rx0, (G.narrow ? 25 : 27), 5);
    ctx.fill();
    ctx.strokeStyle = alpha(colors.border, dk ? 0.8 : 0.9);
    ctx.lineWidth = 1;
    roundRect(ctx, rx0 + 0.5, ry - 2.5, rx1 - rx0 - 1, (G.narrow ? 25 : 27) - 1, 5);
    ctx.stroke();
    ctx.lineCap = 'round';
    ['minor', 'mid', 'major'].forEach(function (kind) {
      ctx.strokeStyle = alpha(colors.text, kind === 'major' ? 0.62 : kind === 'mid' ? 0.45 : 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = Math.round(-0.35 / minor); i * minor <= 0.351; i++) {
        const x = i * minor, px = Math.round(G.X(x)) + 0.5;
        const major = Math.abs(x / 0.1 - Math.round(x / 0.1)) < 1e-6;
        const mid = !major && Math.abs(x / 0.05 - Math.round(x / 0.05)) < 1e-6;
        if ((kind === 'major') !== major || (kind === 'mid') !== mid) continue;
        ctx.moveTo(px, ry);
        ctx.lineTo(px, ry + (major ? 8 : mid ? 5 : 3));
      }
      ctx.stroke();
    });
    ctx.fillStyle = colors.muted;
    ctx.font = font(11);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = Math.round(-0.3 / labelStep); i * labelStep <= 0.3001; i++) {
      const x = i * labelStep;
      ctx.fillStyle = Math.abs(x) < 1e-9 ? colors.text : colors.muted;
      ctx.fillText(num(x, 1), G.X(x), ry + 10);
    }
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'right';
    halo(ctx, 'x (m)', w - 8, ry + 10, colors.muted, font(11, 600), 'right', 'top');
  }

  /**
   * 側視螺旋彈簧：前半圈用 LabDraw.tube 畫成有亮面的金屬線，後半圈較細較暗，看得出纏繞；
   * 圈數固定，壓縮時圈距變密（幾何與先前完全相同）。
   */
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
    // 彈簧在檯面上的淡影（只是裝飾）
    ctx.save();
    ctx.strokeStyle = D.shadowInk(colors.dark ? 0.22 : 0.07);
    ctx.lineWidth = wire * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(xa, y + amp + wire * 1.5); ctx.lineTo(xb, y + amp + wire * 1.5); ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    back.forEach(function (p) {
      ctx.strokeStyle = shade(acc, colors.dark ? -0.55 : -0.4);
      ctx.lineWidth = wire * 0.78;
      ctx.beginPath(); polyPath(p)(ctx); ctx.stroke();
    });
    D.tube(ctx, polyPath([[xa, y], [x0, y - amp]]), shade(acc, -0.05), wire);
    D.tube(ctx, polyPath([[x1, y - amp], [xb, y]]), shade(acc, -0.05), wire);
    front.forEach(function (p) { D.tube(ctx, polyPath(p), acc, wire * 1.08); });
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
    [[0, 0.6], [A, 0.36], [-A, 0.36]].forEach(function (d) {
      const px = Math.round(G.X(d[0])) + 0.5;
      ctx.strokeStyle = alpha(colors.muted, d[1]);
      ctx.beginPath();
      ctx.moveTo(px, lineTop + 16);
      ctx.lineTo(px, fy);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const lf = font(11, 600);
    pill(ctx, 'x = 0', G.X(0), lineTop + 8, colors.text, lf, 'center', 'middle');
    // ±A 的標籤：A 很小時與 x = 0 重疊，改放在虛線外側
    ctx.font = lf;
    const half = ctx.measureText('x = 0').width / 2 + 10, aw = ctx.measureText('−A').width + 14;
    const apx = G.X(A) - G.X(0), ax = apx > half + aw / 2 + 2 ? 'center' : null;
    pill(ctx, '+A', ax ? G.X(A) : G.X(0) + half + 4, lineTop + 8, colors.muted, lf, ax || 'left', 'middle');
    pill(ctx, '−A', ax ? G.X(-A) : G.X(0) - half - 4, lineTop + 8, colors.muted, lf, ax || 'right', 'middle');

    // 轉折點的波紋（裝飾）：在 ±A 處閃一下
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now - f.at < 380; });
    state.fx.forEach(function (f) {
      const k = (now - f.at) / 380, px = G.X(f.side * A);
      ctx.strokeStyle = alpha(colors.accent, 0.55 * (1 - k));
      ctx.lineWidth = 2 * (1 - k) + 0.5;
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
    // 牆上固定座與木塊上的掛勾板（小金屬片）
    D.block(ctx, G.X(WALL), fy - bh / 2 - bh * 0.22, 5, bh * 0.44, shade(colors.field, colors.dark ? -0.15 : 0.3), { r: 1.5, shadow: false });
    D.block(ctx, bx - bw / 2 - plate, fy - bh / 2 - bh * 0.16, plate + 1, bh * 0.32, shade(colors.field, colors.dark ? -0.15 : 0.3), { r: 1, shadow: false });

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
    D.contactShadow(ctx, bx, fy + 1, bw / 2, 0);

    // 木塊：LabDraw.block（上亮下暗、頂邊高光、底邊暗線、圓角、投影）；滑過、拖曳時加外框光暈
    const active = state.drag || state.hover;
    const base = colors.neg;
    if (active && !reduced()) {
      ctx.save();
      ctx.shadowColor = alpha(colors.accent, 0.8);
      ctx.shadowBlur = 14;
      ctx.fillStyle = alpha(colors.accent, 0.25);
      roundRect(ctx, bx - bw / 2 - 2, by - 2, bw + 4, bh + 4, 8);
      ctx.fill();
      ctx.restore();
    }
    D.block(ctx, bx - bw / 2, by, bw, bh, base, { r: 6 });
    // 側面的柔和光澤（左亮右暗，和球體的光源方向一致）
    const sg = ctx.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0.14)');
    sg.addColorStop(0.45, 'rgba(255,255,255,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = sg;
    roundRect(ctx, bx - bw / 2, by, bw, bh, 6);
    ctx.fill();
    if (active) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      roundRect(ctx, bx - bw / 2 - 2, by - 2, bw + 4, bh + 4, 8);
      ctx.stroke();
    }
    if (kbOn(0)) focusBox(ctx, bx - bw / 2 - 7, by - 7, bw + 14, bh + 14, 10);
    // 質量標籤（白字加淡淡的暗影，任何底色都清楚）
    if (bw > 30) {
      ctx.font = font(G.narrow ? 10 : 12, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mt = fmtIn(q.m, 1, 2) + ' kg';
      const t = ctx.measureText(mt).width < bw - 8 ? mt : 'm';
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillText(t, bx, by + bh / 2 + 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t, bx, by + bh / 2);
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
      // 量值很小（箭頭比標籤還短）時不標字，免得字壓在作用點上（與單擺相同）
      if (Math.abs(lv) > 6) D.vecLabel(ctx, 'v', '', bx + lv + (lv >= 0 ? 10 : -10), yv, colors.pos);
      if (Math.abs(la) > 6) D.vecLabel(ctx, 'a', '', bx + la + (la >= 0 ? 10 : -10), ya, colors.equi);
      [yv, ya].forEach(function (yy) {
        ctx.fillStyle = alpha(colors['canvas-bg'], 0.9);
        ctx.beginPath(); ctx.arc(bx, yy, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.text;
        ctx.beginPath(); ctx.arc(bx, yy, 2.1, 0, Math.PI * 2); ctx.fill();
      });
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
    const ctx = bgctx, w = G.w, h = G.h, dk = colors.dark;
    paintBackground(ctx, w, h);
    // 兩級格線（主格線每 Lv/4 取整、次格線為其 1/5），對齊支點
    const unit = niceStep(G.Lv / 4) * G.scale;
    if (unit > 12) D.grid(ctx, 0, 0, w, h, unit, unit / 5 >= 7 ? unit / 5 : 0, G.cx, G.cy);
    const metal = shade(colors.field, dk ? -0.35 : 0.5);
    // 懸掛：小角度時畫天花板橫樑；釋放角超過 90° 時改為固定在背板上的軸
    if (G.up === 0) {
      const half = Math.min(G.narrow ? 70 : 110, w * 0.22), y1 = G.cy - 10, y0 = y1 - 10;
      // 橫樑上方的斜線（天花板）
      ctx.save();
      ctx.beginPath();
      ctx.rect(G.cx - half, y0 - 12, 2 * half, 12);
      ctx.clip();
      ctx.strokeStyle = alpha(colors.field, dk ? 0.45 : 0.32);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = G.cx - half - 12; x < G.cx + half; x += 7) { ctx.moveTo(x, y0); ctx.lineTo(x + 10, y0 - 10); }
      ctx.stroke();
      ctx.restore();
      D.block(ctx, G.cx - half, y0, 2 * half, y1 - y0, metal, { r: 3 });
      // 支架（小金屬片）
      D.block(ctx, G.cx - 4, y1 - 2, 8, 11, shade(colors.field, dk ? -0.2 : 0.3), { r: 2, shadow: false });
    } else {
      const s = 26;
      D.block(ctx, G.cx - s / 2, G.cy - s / 2, s, s, metal, { r: 6 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        const sx = G.cx + c[0] * 8.5, sy = G.cy + c[1] * 8.5;
        ctx.fillStyle = alpha(shade(colors.field, -0.4), dk ? 0.8 : 0.5);
        ctx.beginPath(); ctx.arc(sx, sy, 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = alpha('#ffffff', dk ? 0.25 : 0.7);
        ctx.beginPath(); ctx.arc(sx - 0.5, sy - 0.6, 0.8, 0, Math.PI * 2); ctx.fill();
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
    // 擺錘的圓弧路徑（−θ0 到 +θ0）：底下一層很淡的寬線，上面虛線
    const th0 = state.pend.th0 * DEG;
    ctx.setLineDash([]);
    ctx.strokeStyle = alpha(colors.neg, dk ? 0.08 : 0.05);
    ctx.lineWidth = 2 * G.bobR;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.R, Math.PI / 2 - th0, Math.PI / 2 + th0);
    ctx.stroke();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = alpha(colors.muted, 0.4);
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.R, Math.PI / 2 - th0, Math.PI / 2 + th0);
    ctx.stroke();
    ctx.setLineDash([]);
    // 比例尺（半透明底框）
    const len = niceStep(G.Lv / 5);
    const px = len * G.scale;
    const label = len >= 1 ? num(len, 0) + ' m' : num(len * 100, 0) + ' cm';
    const f = font(11, 600);
    ctx.font = f;
    const tw = ctx.measureText(label).width;
    const bw = Math.max(px, tw) + 16, bh = Math.round(30 * fontScale()), x0 = 8, y0 = h - bh - 8;
    ctx.save();
    ctx.shadowColor = dk ? 'rgba(0,0,0,0.4)' : alpha(colors.text, 0.12);
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = alpha(colors['canvas-bg'], dk ? 0.86 : 0.9);
    roundRect(ctx, x0, y0, bw, bh, 8);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = alpha(colors.muted, dk ? 0.45 : 0.35);
    ctx.lineWidth = 1;
    roundRect(ctx, x0 + 0.5, y0 + 0.5, bw - 1, bh - 1, 8);
    ctx.stroke();
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
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
    // 金屬輕桿（管狀）：暗邊、本體、偏向光源一側的細亮線
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    let ox = -dy / L, oy = dx / L;
    if (ox + oy > 0) { ox = -ox; oy = -oy; } // 亮線放在朝左上（光源）的一側
    ctx.lineCap = 'round';
    ctx.strokeStyle = shade(colors.field, colors.dark ? -0.5 : -0.3);
    ctx.lineWidth = w + 1.2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = shade(colors.field, colors.dark ? -0.1 : 0.12);
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const o = w * 0.22;
    ctx.strokeStyle = alpha(shade(colors.field, 0.85), colors.dark ? 0.55 : 0.8);
    ctx.lineWidth = Math.max(0.8, w * 0.3);
    ctx.beginPath(); ctx.moveTo(x0 + ox * o, y0 + oy * o); ctx.lineTo(x1 + ox * o, y1 + oy * o); ctx.stroke();
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
      const gg = ctx.createRadialGradient(gpos[0] - G.bobR * 0.35, gpos[1] - G.bobR * 0.35, G.bobR * 0.1, gpos[0], gpos[1], G.bobR);
      gg.addColorStop(0, alpha(colors.muted, colors.dark ? 0.1 : 0.06));
      gg.addColorStop(1, alpha(colors.muted, colors.dark ? 0.26 : 0.2));
      ctx.fillStyle = gg;
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
    ctx.lineCap = 'round';
    for (let i = i0 + 1; i < buf.length; i++) {
      const a = bobPos(G, buf[i - 1].x * DEG), b = bobPos(G, buf[i].x * DEG);
      const k = (buf[i].t - tlo) / (s.t - tlo || 1);
      ctx.strokeStyle = alpha(colors.neg, 0.42 * k * k + 0.03);
      ctx.lineWidth = 1 + 3.4 * k;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // 擺角弧與標籤
    const ar = Math.max(18, Math.min(G.R * 0.28, 46));
    if (Math.abs(th) > 0.5 * DEG) {
      ctx.fillStyle = alpha(colors.accent, colors.dark ? 0.14 : 0.1);
      ctx.beginPath();
      ctx.moveTo(G.cx, G.cy);
      if (th > 0) ctx.arc(G.cx, G.cy, ar, Math.PI / 2 - th, Math.PI / 2);
      else ctx.arc(G.cx, G.cy, ar, Math.PI / 2, Math.PI / 2 - th);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = alpha(colors.accent, 0.85);
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
      pill(ctx, thLab, G.cx + sgn * 7, G.cy + ar + 6, colors.accent, thFont, sgn > 0 ? 'left' : 'right', 'middle');
    } else {
      const lr = ar + 18, la = th / 2;
      pill(ctx, thLab, G.cx + lr * Math.sin(la), G.cy + lr * Math.cos(la), colors.accent, thFont, 'center', 'middle');
    }

    // 轉折點的波紋（裝飾）
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now - f.at < 380; });
    state.fx.forEach(function (f) { D.ripple(ctx, pos[0], pos[1], G.bobR + 3, (now - f.at) / 380, colors.accent); });

    // 輕桿、軸、擺錘
    drawRod(ctx, G.cx, G.cy, pos[0], pos[1], rodW, false);
    D.ball(ctx, G.cx, G.cy, 6, shade(colors.field, colors.dark ? 0.05 : 0.25), { glow: 0 });
    ctx.fillStyle = alpha(shade(colors.field, -0.55), 0.85);
    ctx.beginPath(); ctx.arc(G.cx, G.cy, 1.8, 0, Math.PI * 2); ctx.fill();
    const active = state.drag || state.hover;
    const hot = active && !reduced();
    if (hot) {
      const hg = ctx.createRadialGradient(pos[0], pos[1], G.bobR * 0.8, pos[0], pos[1], G.bobR + 14);
      hg.addColorStop(0, alpha(colors.accent, 0.35));
      hg.addColorStop(1, alpha(colors.accent, 0));
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(pos[0], pos[1], G.bobR + 14, 0, Math.PI * 2); ctx.fill();
    }
    D.ball(ctx, pos[0], pos[1], G.bobR * (hot ? 1.07 : 1), colors.neg);
    if (active) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos[0], pos[1], G.bobR + 4, 0, Math.PI * 2); ctx.stroke();
    }
    if (kbOn(0)) focusBox(ctx, pos[0] - G.bobR - 8, pos[1] - G.bobR - 8, 2 * G.bobR + 16, 2 * G.bobR + 16, G.bobR + 8);

    // 虛影標籤（和真實擺錘分開時才標）
    if (ghostOn && gpos && Math.hypot(gpos[0] - pos[0], gpos[1] - pos[1]) > G.bobR * 3.2) {
      const gl = T('小角度近似', 'Small-angle'), gf = font(G.narrow ? 10 : 11, 600);
      ctx.font = gf;
      const gw = ctx.measureText(gl).width;
      let dir = gpos[0] >= G.cx ? 1 : -1;
      // 放不下時改放另一側（不被畫布邊緣切掉）
      if (dir > 0 && gpos[0] + G.bobR + 6 + gw > w - 4) dir = -1;
      else if (dir < 0 && gpos[0] - G.bobR - 6 - gw < 4) dir = 1;
      halo(ctx, gl, gpos[0] + dir * (G.bobR + 6), gpos[1] + G.bobR + 10, colors.muted, gf, dir > 0 ? 'left' : 'right', 'middle');
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
      if (Math.abs(lv) > 6) D.vecLabel(ctx, 'v', '', v0x + tx * (lv + Math.sign(lv) * 10), v0y + ty * (lv + Math.sign(lv) * 10), colors.pos);
      if (Math.abs(la) > 6) D.vecLabel(ctx, 'a', 't', a0x + tx * (la + Math.sign(la) * 11), a0y + ty * (la + Math.sign(la) * 11), colors.equi);
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
    const step = niceStep(S.W / (narrow ? 4 : 7));
    const snap = function (v) { return Math.round(v * dpr) / dpr + 0.5 / dpr; };

    strips.forEach(function (d, i) {
      const hy = top + i * sh, y0 = hy + headH, y1 = top + (i + 1) * sh - 3, ym = (y0 + y1) / 2;
      const ymax = d.max * 1.18 || 1;
      const Y = function (v) { return ym - v / ymax * (y1 - y0) / 2; };
      // 面板底色與框
      panel(ctx, L, y0, w - L - R, y1 - y0);
      // 兩級格線：時間（主格線＝刻度、次格線＝刻度的 1/5）與 ±最大值、½ 最大值
      ctx.save();
      ctx.beginPath();
      ctx.rect(L + 1, y0 + 1, w - L - R - 2, y1 - y0 - 2);
      ctx.clip();
      ctx.lineWidth = 1 / dpr;
      [[step / 5, colors.dark ? 0.045 : 0.04], [step, colors.dark ? 0.1 : 0.09]].forEach(function (g) {
        if (g[0] / S.W * (w - L - R) < 6) return;
        ctx.strokeStyle = alpha(colors.text, g[1]);
        ctx.beginPath();
        for (let k = Math.ceil(S.lo / g[0] - 1e-9); k * g[0] <= S.lo + S.W + 1e-9; k++) {
          const px = snap(X(k * g[0]));
          ctx.moveTo(px, y0); ctx.lineTo(px, y1);
        }
        ctx.stroke();
      });
      ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.05 : 0.045);
      ctx.beginPath();
      [d.max / 2, -d.max / 2].forEach(function (v) { const py = snap(Y(v)); ctx.moveTo(L, py); ctx.lineTo(w - R, py); });
      ctx.stroke();
      ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.12 : 0.1);
      ctx.beginPath();
      [d.max, -d.max].forEach(function (v) { const py = snap(Y(v)); ctx.moveTo(L, py); ctx.lineTo(w - R, py); });
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.34 : 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L, snap(ym)); ctx.lineTo(w - R, snap(ym));
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
      ctx.strokeStyle = alpha(d.color, colors.dark ? 0.2 : 0.15);
      ctx.lineWidth = 6;
      ctx.beginPath();
      S.pts.forEach(function (q, k) { const px = X(q.t), py = Y(q[d.key]); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.stroke();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.strokeStyle = alpha(shade(d.color, 0.6), colors.dark ? 0.3 : 0.45);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
      // 目前時刻的點
      const cur = S.pts[S.pts.length - 1];
      if (cur) {
        const px = X(cur.t), py = clamp(Y(cur[d.key]), y0, y1);
        D.ball(ctx, px, py, 4.2, d.color, { glow: colors.dark ? 0.4 : 0.15 });
      }
      // 標題與目前數值
      const hf = font(narrow ? 11 : 12, 700);
      halo(ctx, d.name + ' (' + d.unit + ')', L + 2, hy + headH / 2, d.color, hf, 'left', 'middle');
      if (cur) halo(ctx, d.name + ' = ' + num(cur[d.key], d.dec, true), w - R - 2, hy + headH / 2, colors.text, hf, 'right', 'middle');
    });

    // 時間軸
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
      // 軌道（凹槽）：底色＋上緣內陰影
      ctx.fillStyle = alpha(colors.field, colors.dark ? 0.18 : 0.09);
      roundRect(ctx, trackX, yy, trackW, bh, bh / 2);
      ctx.fill();
      ctx.save();
      roundRect(ctx, trackX, yy, trackW, bh, bh / 2);
      ctx.clip();
      const ins = ctx.createLinearGradient(0, yy, 0, yy + bh * 0.6);
      ins.addColorStop(0, D.shadowInk(colors.dark ? 0.35 : 0.1));
      ins.addColorStop(1, D.shadowInk(0));
      ctx.fillStyle = ins;
      ctx.fillRect(trackX, yy, trackW, bh);
      ctx.restore();
      // E0（釋放時的力學能）的刻度
      ctx.fillStyle = alpha(colors.text, 0.35);
      ctx.fillRect(Math.round(trackX + trackW) - 1, yy - 2, 1, bh + 4);
      const f = E0 > 0 ? clamp(r.v / E0, 0, 1.02) : 0;
      if (f * trackW > 1) {
        const bw2 = Math.max(bh, f * trackW);
        ctx.save();
        if (!r.hatch) {
          ctx.shadowColor = colors.dark ? alpha(r.c, 0.45) : alpha(r.c, 0.3);
          ctx.shadowBlur = colors.dark ? 6 : 4;
          ctx.shadowOffsetY = 1;
        }
        const g = ctx.createLinearGradient(0, yy, 0, yy + bh);
        g.addColorStop(0, shade(r.c, 0.3));
        g.addColorStop(0.55, r.c);
        g.addColorStop(1, shade(r.c, -0.18));
        ctx.fillStyle = r.hatch ? alpha(r.c, 0.5) : g;
        roundRect(ctx, trackX, yy, bw2, bh, bh / 2);
        ctx.fill();
        ctx.restore();
        if (r.hatch) {
          // 熱能：斜線（和其他能量區分，不只靠顏色）
          ctx.save();
          roundRect(ctx, trackX, yy, bw2, bh, bh / 2);
          ctx.clip();
          ctx.strokeStyle = alpha(colors['canvas-bg'], 0.6);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let x = trackX - bh; x < trackX + bw2; x += 6) { ctx.moveTo(x, yy + bh); ctx.lineTo(x + bh, yy); }
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,' + (colors.dark ? 0.28 : 0.45) + ')';
          ctx.fillRect(trackX + bh / 2, yy + 1.5, Math.max(0, bw2 - bh), 1);
        }
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
    panel(ctx, cx0, cy0, cw, chh);
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
    // 時間的兩級格線
    const gstep = niceStep(S.W / (narrow ? 3 : 5));
    ctx.lineWidth = 1 / dpr;
    [[gstep / 5, colors.dark ? 0.045 : 0.04], [gstep, colors.dark ? 0.1 : 0.09]].forEach(function (g) {
      if (g[0] / S.W * cw < 6) return;
      ctx.strokeStyle = alpha(colors.text, g[1]);
      ctx.beginPath();
      for (let k = Math.ceil(S.lo / g[0] - 1e-9); k * g[0] <= S.lo + S.W + 1e-9; k++) {
        const px = Math.round(X(k * g[0]) * dpr) / dpr + 0.5 / dpr;
        ctx.moveTo(px, cy0); ctx.lineTo(px, cy0 + chh);
      }
      ctx.stroke();
    });
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    [['PE', colors.neg, 2], ['KE', colors.pos, 2], ['E', colors.field, 2.4]].forEach(function (c) {
      ctx.beginPath();
      S.pts.forEach(function (q, k) { const px = X(q.t), py = Y(q[c[0]]); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.strokeStyle = alpha(c[1], colors.dark ? 0.2 : 0.14);
      ctx.lineWidth = c[2] + 4;
      ctx.stroke();
      ctx.strokeStyle = c[1];
      ctx.lineWidth = c[2];
      ctx.stroke();
    });
    ctx.restore();
    halo(ctx, T('能量 (J)', 'Energy (J)'), cx0 + 8, cy0 + 4, colors.text, font(narrow ? 11 : 12, 700), 'left', 'top');
    // 圖例（右上角）：三條曲線的顏色與左邊長條相同
    ctx.save();
    ctx.font = font(narrow ? 10 : 11, 600);
    let lx = cx0 + cw - 8;
    const ly = cy0 + 4 + (narrow ? 6 : 7);
    [['E', colors.field], ['U', colors.neg], ['KE', colors.pos]].forEach(function (it) {
      const tw = ctx.measureText(it[0]).width;
      halo(ctx, it[0], lx, ly, colors.text, font(narrow ? 10 : 11, 600), 'right', 'middle');
      lx -= tw + 5;
      ctx.strokeStyle = it[1];
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lx - 12, ly); ctx.lineTo(lx, ly); ctx.stroke();
      lx -= 12 + 10;
    });
    ctx.restore();
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
  // 無障礙：讀數播報
  // 只在離散事件（改完條件、量到第一個完整週期、暫停、阻尼振動停下來）寫入 aria-live 的 #srSay；
  // 每格都在變的即時讀數（右側「即時讀數」）不播報
  // =====================================================================
  let sayTimer = 0, sayParamTimer = 0, sayReady = false;
  function say(msg) {
    const el = $('srSay');
    if (!el || !msg || !sayReady) return;
    clearTimeout(sayTimer);
    el.textContent = '';
    sayTimer = setTimeout(function () { el.textContent = msg; }, 60); // 先清空再寫，同樣的字也會再念一次
  }
  /** 目前條件的重點結果：彈簧的週期、振幅、最大速率；單擺的精確週期與小角度近似差多少 */
  function settingText() {
    if (state.mode === 'spring') {
      const sol = ss.sol, A = Math.abs(ss.p.x0);
      if (sol.regime === 'over' || sol.regime === 'critical') {
        return (sol.regime === 'over' ? T('過阻尼', 'Overdamped') : T('臨界阻尼', 'Critically damped')) +
          T('：木塊從 x = ', ': the block returns from x = ') + num(ss.p.x0, 2) + ' m' + T(' 回到平衡點，不會越過它。', ' to equilibrium without crossing it.');
      }
      return T('彈簧振子：週期 T = ', 'Spring oscillator: period T = ') + num(sol.regime === 'under' ? sol.Td : sol.T0, 3) + ' s' +
        T('，釋放位置 x = ', ', released at x = ') + num(ss.p.x0, 2) + ' m' + T('，最大速率 ', ', maximum speed ') + num(A * sol.omega0, 2) + ' m/s' + T('。', '.');
    }
    const d = OC.periodExcess(Math.abs(ps.p.theta0)) * 100;
    return T('單擺：釋放角 ', 'Pendulum: release angle ') + num(ps.p.theta0, Math.abs(ps.p.theta0 % 1) > 1e-9 ? 1 : 0) + '°' + T('，精確週期 T = ', ', exact period T = ') + num(ps.Tex, 3) + ' s' +
      T('，比小角度近似 ', ', ') + (d < 0.1 ? num(d, 3) : num(d, 2)) + T('% 長。', '% longer than the small-angle value.');
  }
  function sayParams() {
    clearTimeout(sayParamTimer);
    sayParamTimer = setTimeout(function () { say(settingText()); }, 600);
  }
  function sayMeasured(Tm, d) {
    if (isFinite(Tm)) say(T('量到一個完整週期：實測週期 ', 'One full period measured: ') + num(Tm, d) + ' s' + T('。', '.'));
  }
  function sayPause() {
    if (state.mode === 'spring') {
      const st = ss.sol.state(ss.t);
      say(T('已暫停：t = ', 'Paused: t = ') + num(ss.t, 2) + ' s' + T('，x = ', ', x = ') + num(st.x, 3) + ' m' + T('，v = ', ', v = ') + num(st.v, 3) + ' m/s' +
        T('，a = ', ', a = ') + num(st.a, 2) + T(' 公尺每二次方秒。', ' m/s squared.'));
    } else {
      const s = ps.s;
      say(T('已暫停：t = ', 'Paused: t = ') + num(s.t, 2) + ' s' + T('，擺角 θ = ', ', angle θ = ') + num(s.th / DEG, 1) + '°' +
        T('，角速度 ω = ', ', angular velocity ω = ') + num(s.om, 3) + ' rad/s' + T('。', '.'));
    }
  }

  // =====================================================================
  // 主繪圖與動畫
  // =====================================================================
  let lastS = null;  // 這一格的取樣（3D 檢視直接用同一組點，不另外算）
  function draw() {
    if (!ss || !ps) return;
    const S = samples();
    lastS = S;
    if (is3d()) {
      // 3D 檢視：同一組物理狀態交給 3D 場景畫，圖表與讀數照常更新
      if (view3 && view3.active) view3.update();
    } else {
      const w = size.scene.w, h = size.scene.h;
      if (w && h) {
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (state.mode === 'spring') drawSpringScene(sctx); else drawPendScene(sctx);
      }
    }
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
    sayParams();
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
    if (was) sayPause();
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
    legend3();
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

  // ---------- 鍵盤操作（keys.js）：和拖曳相同的限制；每按一次就和放手一樣，從新的位置釋放 ----------
  /** 彈簧：←→ 移動釋放位置 x（每次 1 cm，Shift 5 cm）；↑↓ 加大或減小振幅（保持在同一側） */
  function keySpring(dx, dy, big) {
    const q = state.spring, step = big ? 0.05 : 0.01;
    const x0 = q.sign * q.A;
    let x;
    if (dx) {
      x = Math.round((x0 + dx * step) * 100) / 100;
      // 越過平衡點附近（|x| < 2 cm，與拖曳相同的下限）：先停在同一側的 2 cm，再按一次跳到另一側
      if (x * x0 <= 0 || Math.abs(x) < 0.02 - 1e-9) x = Math.abs(x0) > 0.02 + 1e-9 ? Math.sign(x0) * 0.02 : -Math.sign(x0) * 0.02;
    } else {
      x = q.sign * (Math.round((q.A + dy * step) * 100) / 100);
    }
    x = clamp(x, -0.3, 0.3);
    const A = Math.max(0.02, Math.abs(x)), sign = x < 0 ? -1 : 1;
    if (A === q.A && sign === q.sign) return false;
    q.A = A; q.sign = sign;
    setSlider('sA', A);
    return true;
  }
  /** 單擺：←→ 沿圓弧移動擺錘（有號的釋放角，每次 1°，Shift 5°）；↑↓ 加大或減小釋放角（保持在同一側） */
  function keyPend(dx, dy, big) {
    const q = state.pend, step = big ? 5 : 1;
    const th0 = q.sign * Math.round(q.th0);
    let th;
    if (dx) {
      th = th0 + dx * step;
      if (th * th0 <= 0 || Math.abs(th) < 1) th = Math.abs(th0) > 1 ? Math.sign(th0) : -Math.sign(th0);
    } else {
      th = q.sign * (Math.round(q.th0) + dy * step);
      if (Math.abs(th) < 1 || th * q.sign < 0) th = q.sign;
    }
    const d = clamp(Math.round(Math.abs(th)), 1, 170), sign = th < 0 ? -1 : 1;
    if (d === q.th0 && sign === q.sign) return false;
    q.th0 = d; q.sign = sign;
    setSlider('pth', d);
    syncAnglePresets();
    return true;
  }
  function keyMove(dx, dy, big) {
    const moved = state.mode === 'spring' ? keySpring(dx, dy, big) : keyPend(dx, dy, big);
    if (!moved) return false;
    restart();
    setRunning(true);               // 和放開拖曳一樣：從新的位置釋放
    clearTimeout(sayParamTimer);    // 結果改由 keys.js 念 describe()，不重複播報
    return true;
  }
  function keyDescribe() {
    if (state.mode === 'spring') {
      const q = state.spring, sol = ss.sol;
      const per = sol.regime === 'over' || sol.regime === 'critical' ? '' :
        T('，週期 T = ', ', period T = ') + num(sol.regime === 'under' ? sol.Td : sol.T0, 3) + ' s';
      return T('木塊釋放位置 x = ', 'Block released at x = ') + num(q.sign * q.A, 2) + ' m' + T('（振幅 ', ' (amplitude ') + num(q.A, 2) + ' m' +
        T('）', ')') + per + T('。', '.');
    }
    const q = state.pend;
    return T('擺錘釋放角 θ0 = ', 'Release angle θ0 = ') + num(q.sign * q.th0, Math.abs(q.th0 % 1) > 1e-9 ? 1 : 0) + '°' + (q.sign < 0 ? T('（偏左）', ' (to the left)') : T('（偏右）', ' (to the right)')) +
      T('，精確週期 T = ', ', exact period T = ') + num(ps.Tex, 3) + ' s' + T('。', '.');
  }
  if (window.LabKeys) {
    scene.removeAttribute('data-en-aria-label'); // 說明文字改由程式依語言提供（含按鍵說明）
    kb = window.LabKeys.attach(scene, {
      label: T('簡諧運動模擬畫布：彈簧振子或單擺。按 Enter 選取木塊或擺錘。彈簧振子：左右鍵移動釋放位置，每次 1 cm；上下鍵加大或減小振幅。單擺：左右鍵沿圓弧移動擺錘，每次 1°；上下鍵加大或減小釋放角。Shift 加方向鍵每次 5 cm 或 5°。每按一次就從新的位置釋放。',
        'Simple harmonic motion canvas: spring oscillator or pendulum. Press Enter to pick the block or the bob. Spring: the left and right arrow keys move the release position by 1 cm; up and down make the amplitude larger or smaller. Pendulum: left and right move the bob along its arc by 1°; up and down make the release angle larger or smaller. Hold Shift for 5 cm or 5° steps. Each key press releases it from the new position.'),
      items: [{
        name: function () { return state.mode === 'spring' ? T('木塊（釋放位置）', 'block (release position)') : T('擺錘（釋放角）', 'bob (release angle)'); },
        move: keyMove,
        describe: keyDescribe
      }],
      onChange: requestDraw
    });
  }

  // ---------- 分享連結：拖曳出來的「釋放在哪一側」（滑桿只記大小；分頁、預設值、勾選框由 classroom.js 自動記錄） ----------
  // classroom.js 在 DOMContentLoaded 之後才由 settings.js 載入：還沒有 LabShare 時等 load 再登記（還原在 load 之後才進行）
  function shareReady(fn) {
    if (window.LabShare) fn(window.LabShare);
    else window.addEventListener('load', function () { if (window.LabShare) fn(window.LabShare); });
  }
  shareReady(function (LS) {
    LS.register({
      get: function () { return { s: state.spring.sign, p: state.pend.sign }; },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        state.spring.sign = +o.s < 0 ? -1 : 1;
        state.pend.sign = +o.p < 0 ? -1 : 1;
        // 兩個分頁都依還原後的滑桿重算（還原時另一個分頁的滑桿也改了）
        resetSpring();
        resetPend();
        state.fx = [];
        bgKey = '';
        updateStatic();
        updateStatus();
        requestDraw();
        if (state.running) loop();
      }
    });
  });

  // ---------- 3D 檢視（three.js 以 import() 延遲載入；場景在 js/oscillation-3d.js） ----------
  const labEl = document.querySelector('.lab.osc');
  function is3d() { return labEl.classList.contains('is3d'); }
  let view3 = null, threeLib = null, loadToken = 0;
  const viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  /** 交給 3D 場景的狀態：與 2D 同一個時刻、同一組取樣點與參數（3D 不另外計算運動） */
  function state3() {
    const S = lastS || samples();
    const base = { mode: state.mode, S: S, show: state.show, show3: state.show3, speed: state.speed };
    if (state.mode === 'spring') {
      const st = ss.sol.state(ss.t), sol = ss.sol;
      base.Wd = 0.9 * ss.W;
      base.sp = {
        m: ss.p.m, k: ss.p.k, b: ss.p.b, x0: ss.p.x0, A: Math.abs(ss.p.x0), w0: sol.omega0, regime: sol.regime,
        T0: sol.T0, Tshow: sol.regime === 'under' ? sol.Td : sol.T0, vmax: ss.vmax, amax: ss.amax,
        bw: clamp(0.1 * Math.cbrt(ss.p.m / 0.5), 0.06, 0.15), // 木塊寬（m），與 2D 的 springGeom 相同
        x: st.x, v: st.v, a: st.a
      };
    } else {
      const p = ps.p, s = ps.s, g = ps.ghost.at(s.t);
      base.Wd = 0.9 * ps.W;
      base.pe = {
        L: p.L, g: p.g, m: p.m, b: p.b, th0: p.theta0, w0: Math.sqrt(p.g / p.L), Tex: ps.Tex, T0: ps.T0,
        wmax: ps.wmax, amax: ps.amax, Lv: VIEW_L.find(function (v) { return v >= p.L - 1e-9; }) || 3,
        th: s.th, om: s.om, al: OC.pendulumAccel(p, s.th, s.om), gth: g.th, gom: g.om
      };
    }
    return base;
  }
  function setPressed3(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed3('3d');
      if (!webglAvailable() || !window.OscillationThree) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        labEl.classList.add('is3d');
        state.hover = false;
        view3 = window.OscillationThree.create(lib, {
          host: $('view3'), T: T, state: state3,
          lost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
        });
        viewMsg.textContent = '';
        draw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed3('2d');
      // 先停止（active = false），再釋放：dispose 裡的 forceContextLoss 不會被當成意外中斷
      if (view3) { view3.active = false; view3.dispose(); view3 = null; }
      labEl.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      bgKey = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.active = false; view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    labEl.classList.remove('is3d');
    setPressed3('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('camReal').addEventListener('click', function () { if (view3) view3.viewFrom('real'); });
  $('camSide').addEventListener('click', function () { if (view3) view3.viewFrom('top'); });
  $('camFront').addEventListener('click', function () { if (view3) view3.viewFrom('front'); });
  $('s3phase').addEventListener('change', function (e) { state.show3.phase = e.target.checked; requestDraw(); });
  state.show3.phase = $('s3phase').checked;
  /** 3D 圖例：螺旋與兩個投影（顏色與 2D 圖表相同：位置藍、速度紅） */
  function legend3() {
    const sp = state.mode === 'spring';
    const sw = function (c) { return '<i style="background:var(' + c + ')"></i>'; };
    $('leg3').innerHTML =
      '<span>' + sw('--accent') + (sp ? T('相空間螺旋（x, v/ω<sub>0</sub>, t）', 'Phase-space helix (x, v/ω<sub>0</sub>, t)') : T('相空間螺旋（θ, ω/ω<sub>0</sub>, t）', 'Phase-space helix (θ, ω/ω<sub>0</sub>, t)')) + '</span>' +
      '<span>' + sw('--neg') + (sp ? T('底面：x–t 投影', 'Floor: x–t projection') : T('底面：θ–t 投影', 'Floor: θ–t projection')) + '</span>' +
      '<span>' + sw('--pos') + (sp ? T('左牆：v–t 投影', 'Left wall: v–t projection') : T('左牆：ω–t 投影', 'Left wall: ω–t projection')) + '</span>';
  }

  // ---------- 啟動 ----------
  readColors();
  resetSpring();
  resetPend();
  const themeChanged = function () { readColors(); bgKey = ''; if (view3 && view3.active) view3.onTheme(); requestDraw(); };
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(function () { resize(); });
    [scene, graph, energy].forEach(function (c) { ro.observe(c); });
  } else window.addEventListener('resize', resize);
  setMode(location.hash === '#pendulum' ? 'pendulum' : 'spring');
  setRunning(state.running);
  sayReady = true;
  if (!state.running && reduced()) {
    $('status').textContent = T('已暫停（系統設定為減少動態效果），按「播放」開始。', 'Paused because your system asks for reduced motion — press “Play” to start.');
  }
  resize();
})();
