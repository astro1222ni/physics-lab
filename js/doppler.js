/* doppler.js — 「都卜勒效應」模組的畫面與互動（物理計算在 doppler-core.js） */
(function () {
  'use strict';
  const DC = window.DopplerCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 固定比例（畫面上有說明） ----------
  const WX = 1400;          // m：場景寬度（x 由 −700 m 到 +700 m）
  const ARROW_T = 0.5;      // s：速度箭頭長度 = 0.5 秒內移動的距離
  const SLOW = 0.25;
  const BASE_PITCH = 660;   // Hz：喇叭以 660 Hz 代表波源頻率 f
  const GRAPH_W = 12;       // s：f′(t) 圖的時間視窗
  const MAX_FRONTS = 400;   // 最多保留的波前數（很舊的波前早已離開畫面）

  // 預設情境（位置以公尺計；v = 340 m/s）
  const PRESETS = {
    still:    { vs: 0,     vo: 0,    sx: 0,    ox: 380,  oy: -180, slow: false },
    approach: { vs: 120,   vo: 0,    sx: -560, ox: 250,  oy: -150, slow: false },
    recede:   { vs: 120,   vo: 0,    sx: -380, ox: -520, oy: -150, slow: false },
    observer: { vs: 0,     vo: -100, sx: -250, ox: 560,  oy: -150, slow: false },
    sonic:    { vs: 340,   vo: 0,    sx: -600, ox: 200,  oy: -170, slow: true },
    super:    { vs: 544,   vo: 0,    sx: -620, ox: 150,  oy: -200, slow: true }
  };

  const state = {
    f: 2, v: 340, vs: 120, vo: 0,
    sx: -560,                       // 波源在 t = 0 的位置（沿 y = 0 的道路向 +x 行駛）
    obs: { x: 250, y: -90, t0: 0 }, // 觀察者在 t0 時的位置
    t: 0,
    running: !reducedMotion,        // 減少動態效果時預設暫停
    ended: false,
    slow: false,
    preset: 'approach',
    show: { fronts: true, lambda: true, ret: true, vel: true },
    hist: [],                       // f′(t) 紀錄：{ t, a, b }（a 為最晚發出的聲音，b 為超音速時較早發出的聲音）
    fx: [],                         // 純裝飾的短暫效果（不影響物理）
    prev: null,                     // 上一幀抵達的聲音（判斷音爆、波前抵達）
    hover: false,
    run: null                       // 這一趟的統計（任務模式用）：見 newRun()
  };
  function newRun() {
    return { ratioMax: -Infinity, ratioMin: Infinity, heardTime: 0, boom: false, tBoom: null, two: false, minDist: Infinity, clean: true };
  }
  state.run = newRun();

  // 任務模式（missions.js）：回報事件與相關物理量
  function emit(type, extra) {
    if (!window.LabMission) return;
    const O = DC.observerAt(params(), state.t), S = DC.sourceAt(params(), state.t);
    window.LabMission.emit(type, Object.assign({
      f: state.f, v: state.v, vs: state.vs, vo: state.vo, M: state.vs / state.v, t: state.t,
      ox: O.x, oy: O.y, sx: S.x, dist: Math.hypot(O.x - S.x, O.y - S.y), slow: state.slow, preset: state.preset
    }, extra || {}));
  }

  function params() {
    return {
      f: state.f, v: state.v, tStart: 0,
      src: { x: state.sx, y: 0, vx: state.vs, vy: 0 },
      obs: { x: state.obs.x, y: state.obs.y, vx: state.vo, vy: 0, t0: state.obs.t0 }
    };
  }

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-wave']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
  }
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  function alpha(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  /** f > 0 往白色混合、f < 0 往黑色混合 */
  function shade(c, f) {
    const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 滑桿數字：顯示到可輸入的精度（去掉多餘的 0，但不少於滑桿間隔的位數） */
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    if (/^-0$/.test(s)) s = '0';
    return s.replace('-', '−');
  }
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gv = $('graph'), gtx = gv.getContext('2d');
  let dpr = 1, cw = 300, ch = 200, gw = 300, gh = 200;
  let L = null;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');
  let drag = null; // 拖曳觀察者中：{ off: [dx, dy] }（畫布像素）

  function layout() {
    const narrow = cw < 560;
    const k = cw / WX; // px/m
    return {
      narrow: narrow, k: k,
      cx: cw / 2, cy: ch / 2,
      WY: ch / k,
      carL: narrow ? 30 : 40,     // 救護車圖示長度（px，放大顯示）
      obsR: narrow ? 8.5 : 10,    // 觀察者圖示半徑（px）
      lw: narrow ? 2.3 : 2.8
    };
  }
  function X(x) { return L.cx + x * L.k; }
  function Y(y) { return L.cy - y * L.k; }
  function toWorld(px, py) { return [(px - L.cx) / L.k, (L.cy - py) / L.k]; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    const narrow = cw < 560;
    ch = Math.round(Math.min(narrow ? cw * 0.82 : cw * 0.5, 520));
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    L = layout();
    gw = gv.clientWidth || cw;
    gh = Math.round(narrow ? Math.max(200, gw * 0.6) : Math.max(210, Math.min(260, gw * 0.28)));
    if (gv.style.height !== gh + 'px') gv.style.height = gh + 'px';
    gv.width = Math.round(gw * dpr);
    gv.height = Math.round(gh * dpr);
    clampObserver();
    buildBackground();
    draw();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** 不變的圖層：暈影背景、格線、道路、比例尺（尺寸、主題或語言改變時才重畫） */
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const rg = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.15, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
    rg.addColorStop(0, colors.dark ? shade(base, 0.03) : base);
    rg.addColorStop(1, shade(base, colors.dark ? -0.35 : -0.05));
    c.fillStyle = rg;
    roundRect(c, 0, 0, cw, ch, 8);
    c.fill();
    c.save();
    roundRect(c, 0, 0, cw, ch, 8);
    c.clip();
    // 格線：主格線每 200 m、次格線每 50 m
    const px = function (v) { return Math.round(v) + 0.5; };
    const hx = WX / 2, hy = L.WY / 2;
    [[50, 0.04], [200, 0.1]].forEach(function (lv) {
      c.strokeStyle = alpha(colors.text, lv[1] * (colors.dark ? 0.8 : 1));
      c.lineWidth = 1;
      c.beginPath();
      for (let x = Math.ceil(-hx / lv[0]) * lv[0]; x <= hx; x += lv[0]) {
        if (lv[0] === 50 && x % 200 === 0) continue;
        c.moveTo(px(X(x)), 0); c.lineTo(px(X(x)), ch);
      }
      for (let y = Math.ceil(-hy / lv[0]) * lv[0]; y <= hy; y += lv[0]) {
        if (lv[0] === 50 && y % 200 === 0) continue;
        c.moveTo(0, px(Y(y))); c.lineTo(cw, px(Y(y)));
      }
      c.stroke();
    });
    // 道路（波源的路徑）：淡淡的帶狀＋路緣線＋中央虛線
    const rw = L.narrow ? 18 : 26, y0 = Y(0);
    const rgd = c.createLinearGradient(0, y0 - rw / 2, 0, y0 + rw / 2);
    rgd.addColorStop(0, alpha(colors.text, colors.dark ? 0.07 : 0.05));
    rgd.addColorStop(0.5, alpha(colors.text, colors.dark ? 0.11 : 0.08));
    rgd.addColorStop(1, alpha(colors.text, colors.dark ? 0.07 : 0.05));
    c.fillStyle = rgd;
    c.fillRect(0, y0 - rw / 2, cw, rw);
    c.strokeStyle = alpha(colors.text, 0.16);
    c.beginPath(); c.moveTo(0, px(y0 - rw / 2)); c.lineTo(cw, px(y0 - rw / 2)); c.moveTo(0, px(y0 + rw / 2)); c.lineTo(cw, px(y0 + rw / 2)); c.stroke();
    c.setLineDash([10, 10]);
    c.strokeStyle = alpha(colors.text, 0.22);
    c.beginPath(); c.moveTo(0, px(y0)); c.lineTo(cw, px(y0)); c.stroke();
    c.setLineDash([]);
    c.restore();
    // 細邊框
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    roundRect(c, 0.5, 0.5, cw - 1, ch - 1, 8);
    c.stroke();
  }

  // ---------- 繪圖工具 ----------
  /** 有半透明圓角底框的標籤；c.textAlign 決定水平對齊，垂直置中於 y；sub 為下標（可省略） */
  function pill(c, text, x, y, color, font, bgAlpha, sub) {
    c.font = font || '600 12px system-ui, sans-serif';
    c.textBaseline = 'middle';
    const m = c.measureText(text);
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 15;
    let tw = m.width, sw = 0, subFont = '';
    if (sub) {
      const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font || '12px')[1]);
      subFont = (font || '600 12px system-ui, sans-serif').replace(/(\d+(?:\.\d+)?)px/, Math.round(size * 0.72) + 'px');
      c.font = subFont;
      sw = c.measureText(sub.text).width + 1;
      c.font = font || '600 12px system-ui, sans-serif';
    }
    const total = tw + sw;
    const ph = fh + 3, pw = total + 10;
    const al = c.textAlign;
    const bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - total - 5 : x - 5;
    c.fillStyle = alpha(colors['canvas-bg'], bgAlpha == null ? 0.86 : bgAlpha);
    roundRect(c, bx, y - ph / 2, pw, ph, ph / 2);
    c.fill();
    c.fillStyle = color;
    const save = c.textAlign;
    c.textAlign = 'left';
    if (!sub) c.fillText(text, bx + 5, y + 0.5);
    else {
      // 下標接在主文字的某個位置之後（sub.at：主文字的前幾個字元）
      const head = text.slice(0, sub.at), tail = text.slice(sub.at);
      c.fillText(head, bx + 5, y + 0.5);
      const hw = c.measureText(head).width;
      c.font = subFont;
      c.fillText(sub.text, bx + 5 + hw, y + fh * 0.22);
      c.font = font || '600 12px system-ui, sans-serif';
      c.fillText(tail, bx + 5 + hw + sw, y + 0.5);
    }
    c.textAlign = save;
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }

  /**
   * 向量箭頭：箭身寬 lw，箭頭長約 4 倍箭身寬、兩側略帶弧度。
   * (x0, y0) 起點，(ux, uy) 單位方向（畫布座標），len 像素長度。
   */
  function arrow(c, x0, y0, ux, uy, len, lw, color) {
    if (len < 1) return;
    const head = Math.min(4 * lw, len), hw = 1.7 * lw;
    const xt = x0 + ux * len, yt = y0 + uy * len;
    const xh = xt - ux * head, yh = yt - uy * head;
    const nx = -uy, ny = ux;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineCap = 'round';
    if (len > head + 1) {
      c.lineWidth = lw;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(xh + ux * head * 0.3, yh + uy * head * 0.3); c.stroke();
    }
    c.beginPath();
    c.moveTo(xt, yt);
    c.quadraticCurveTo(xt - ux * head * 0.45 + nx * hw * 0.35, yt - uy * head * 0.45 + ny * hw * 0.35, xh + nx * hw, yh + ny * hw);
    c.lineTo(xh + ux * head * 0.2, yh + uy * head * 0.2);
    c.lineTo(xh - nx * hw, yh - ny * hw);
    c.quadraticCurveTo(xt - ux * head * 0.45 - nx * hw * 0.35, yt - uy * head * 0.45 - ny * hw * 0.35, xt, yt);
    c.closePath();
    c.fill();
  }

  /** 救護車（俯視）：車頭朝 +x。ghost 為 true 時畫成半透明虛線輪廓（聲音發出時的位置） */
  function ambulance(x, y, ghost, tNow) {
    const Lp = L.carL, W = Lp * 0.48;
    const body = colors.dark ? shade(colors.text, -0.06) : shade(colors['canvas-bg'], 0.5);
    ctx.save();
    ctx.translate(x, y);
    if (ghost) ctx.globalAlpha = 0.38;
    else {
      // 柔和的接觸陰影
      const sh = ctx.createRadialGradient(2, 4, W * 0.2, 2, 4, Lp * 0.62);
      sh.addColorStop(0, 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.26) + ')');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.ellipse(2, 4, Lp * 0.62, W * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 車身：由上而下的漸層（上亮下暗），圓角
    const g = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
    g.addColorStop(0, shade(body, 0.25));
    g.addColorStop(0.55, body);
    g.addColorStop(1, shade(body, -0.16));
    ctx.fillStyle = g;
    roundRect(ctx, -Lp / 2, -W / 2, Lp, W, W * 0.24);
    ctx.fill();
    ctx.strokeStyle = alpha(colors.text, ghost ? 0.7 : 0.35);
    ctx.lineWidth = 1;
    if (ghost) ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // 車頭（前 30%）與擋風玻璃
    const xc = Lp / 2 - Lp * 0.3;
    ctx.fillStyle = alpha(colors.text, 0.06);
    roundRect(ctx, xc, -W / 2 + 1, Lp * 0.3 - 1, W - 2, W * 0.2);
    ctx.fill();
    const gl = ctx.createLinearGradient(xc + Lp * 0.03, 0, xc + Lp * 0.18, 0);
    gl.addColorStop(0, shade(colors.field, colors.dark ? -0.65 : 0.15));
    gl.addColorStop(1, shade(colors.field, colors.dark ? -0.45 : 0.45));
    ctx.fillStyle = gl;
    roundRect(ctx, xc + Lp * 0.05, -W / 2 + W * 0.14, Lp * 0.13, W * 0.72, 2.5);
    ctx.fill();
    // 兩側紅色飾條
    ctx.fillStyle = colors.pos;
    ctx.fillRect(-Lp / 2 + 3, -W / 2 + 1.2, xc + Lp / 2 - 4, 1.8);
    ctx.fillRect(-Lp / 2 + 3, W / 2 - 3, xc + Lp / 2 - 4, 1.8);
    // 車頂紅十字
    const cx0 = -Lp * 0.14, s = W * 0.2, tk = W * 0.085;
    ctx.fillRect(cx0 - s, -tk, 2 * s, 2 * tk);
    ctx.fillRect(cx0 - tk, -s, 2 * tk, 2 * s);
    // 警示燈條：紅藍交替閃爍（純裝飾；減少動態效果時不閃）
    const lx = xc - Lp * 0.07, lh = W * 0.36;
    const phase = reducedMotion || ghost || !state.running ? 0 : Math.floor(tNow / 180) % 2;
    [[colors.pos, -1, phase === 0], [colors.neg, 1, phase === 1]].forEach(function (b) {
      const yy = b[1] < 0 ? -lh - 0.5 : 0.5;
      if (b[2] && !ghost && state.running && !reducedMotion) {
        const gg = ctx.createRadialGradient(lx, yy + lh / 2, 1, lx, yy + lh / 2, Lp * 0.42);
        gg.addColorStop(0, alpha(b[0], colors.dark ? 0.45 : 0.32));
        gg.addColorStop(1, alpha(b[0], 0));
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(lx, yy + lh / 2, Lp * 0.42, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = b[2] ? shade(b[0], 0.15) : shade(b[0], -0.25);
      roundRect(ctx, lx - 2.2, yy, 4.4, lh, 2);
      ctx.fill();
    });
    ctx.restore();
  }

  /** 觀察者（俯視：肩膀與頭）；hot 為 true 時加外框光暈（可拖曳） */
  function observerIcon(x, y, hot) {
    const R = L.obsR * (hot ? 1.08 : 1);
    const sh = ctx.createRadialGradient(x + 2, y + 3, R * 0.3, x + 2, y + 3, R * 1.5);
    sh.addColorStop(0, 'rgba(0,0,0,' + (colors.dark ? 0.45 : 0.22) + ')');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(x + 2, y + 3, R * 1.5, R * 1.1, 0, 0, Math.PI * 2); ctx.fill();
    if (hot) {
      ctx.strokeStyle = alpha(colors.probe, 0.45);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, R * 1.65, 0, Math.PI * 2); ctx.stroke();
    }
    // 肩膀
    const g = ctx.createLinearGradient(0, y - R * 0.6, 0, y + R * 0.6);
    g.addColorStop(0, shade(colors.probe, 0.35));
    g.addColorStop(1, shade(colors.probe, -0.25));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, R * 1.12, R * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    // 頭（球體）
    const hr = R * 0.56;
    const head = shade(colors.equi, colors.dark ? 0.15 : 0.45);
    const hg = ctx.createRadialGradient(x - hr * 0.35, y - hr * 0.38, hr * 0.1, x, y, hr);
    hg.addColorStop(0, shade(head, 0.55));
    hg.addColorStop(0.5, head);
    hg.addColorStop(1, shade(head, -0.35));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(x, y, hr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(shade(head, 0.7), 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, hr - 0.5, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function draw() {
    if (!L) return;
    const p = params(), arr = DC.arrivals(p, state.t);
    drawScene(p, arr);
    drawGraph(p);
    updateReadout(p, arr);
  }

  function drawScene(p, arr) {
    const tNow = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    ctx.save();
    roundRect(ctx, 0, 0, cw, ch, 8);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const S = DC.sourceAt(p, state.t), O = DC.observerAt(p, state.t);
    const fronts = state.show.fronts ? DC.wavefronts(p, state.t, MAX_FRONTS) : [];
    // side：觀察者在道路的哪一側（畫布座標，+1 為下方）；波長標註放在另一側
    const side = Y(O.y) >= Y(0) ? 1 : -1;
    drawFronts(fronts);
    drawShock(p, S);
    if (state.show.lambda && state.show.fronts) drawLambda(p, fronts, -side);

    // 此刻傳到觀察者的聲音：發出時的波源位置（半透明救護車）、連線與通過觀察者的那個波前
    if (state.show.ret) {
      arr.forEach(function (a, i) {
        const col = i === 0 ? colors.accent : colors.pos;
        const gx = X(a.sx), gy = Y(a.sy);
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = alpha(col, 0.75);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(gx, gy, a.dist * L.k, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = alpha(col, 0.85);
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(X(O.x), Y(O.y)); ctx.stroke();
        ctx.setLineDash([]);
        if (Math.hypot(gx - X(S.x), gy - Y(S.y)) <= L.carL * 0.9) return; // 與目前的波源重疊時不另外畫
        ambulance(gx, gy, true, tNow);
        // 標籤放在觀察者那一側、往遠離觀察者的水平方向偏移，避免壓到觀察者與 f′ 標籤
        const right = X(O.x) < gx;
        ctx.textAlign = right ? 'left' : 'right';
        pill(ctx, i === 0 ? T('聲音發出處', 'Emitted here') : T('較早發出處', 'Emitted earlier'),
          gx + (right ? 1 : -1) * L.carL * 0.2, gy + side * L.carL * 0.6, col, (L.narrow ? 10 : 11) + 'px system-ui, sans-serif', 0.78);
      });
    }

    // 波源（救護車）與速度箭頭
    const sx = X(S.x), sy = Y(S.y);
    ambulance(sx, sy, false, tNow);
    if (state.show.vel && state.vs > 0) {
      const len = state.vs * ARROW_T * L.k;
      arrow(ctx, sx + L.carL * 0.55, sy, 1, 0, len, L.lw, colors.pos);
      ctx.textAlign = 'left';
      pill(ctx, 'v', sx + L.carL * 0.55 + len + 6, sy, colors.pos, '700 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.8, { at: 1, text: 's' });
    }

    // 觀察者
    const ox = X(O.x), oy = Y(O.y);
    observerIcon(ox, oy, state.hover || !!drag);
    if (state.show.vel && state.vo !== 0) {
      const len = Math.abs(state.vo) * ARROW_T * L.k, dir = state.vo > 0 ? 1 : -1;
      arrow(ctx, ox + dir * (L.obsR + 3), oy, dir, 0, len, L.lw, colors.neg);
      ctx.textAlign = dir > 0 ? 'left' : 'right';
      pill(ctx, 'v', ox + dir * (L.obsR + len + 9), oy, colors.neg, '700 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.8, { at: 1, text: 'o' });
    }
    drawEffects(tNow);
    // f′ 標籤：觀察者上方（太靠上時放下方）
    let ftxt;
    if (arr.length === 2) ftxt = 'f′ = ' + num(arr[0].fp, 2) + ' Hz ' + T('與', '&') + ' ' + num(Math.abs(arr[1].fp), 1) + ' Hz';
    else if (arr.length === 1) ftxt = 'f′ = ' + num(arr[0].fp, 2) + ' Hz';
    else ftxt = state.vs >= state.v && state.t > 0 && silentInCone(p) ? T('聽不到（在馬赫錐外）', 'Silent (outside the Mach cone)') : T('聲音還沒傳到', 'No sound yet');
    // 兩個標籤都放在觀察者遠離道路的那一側（空間不夠時翻到另一側）
    ctx.textAlign = 'center';
    let sd = side;
    if (oy + sd * (L.obsR + 40) > ch - 34 || oy + sd * (L.obsR + 40) < 30) sd = -sd;
    const fx = Math.max(80, Math.min(cw - 80, ox));
    pill(ctx, T('觀察者', 'Listener'), fx, oy + sd * (L.obsR + 12), colors.probe, '600 ' + (L.narrow ? 10 : 11) + 'px system-ui, sans-serif', 0.75);
    pill(ctx, ftxt, fx, oy + sd * (L.obsR + 32), arr.length ? colors.accent : colors.muted, '700 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.88);

    // 時間、慢動作、俯視圖、比例尺
    const f1 = '600 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif';
    const f2 = (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    pill(ctx, 't = ' + num(state.t, 2) + ' s' + (state.slow ? '  (' + SLOW + '×)' : ''), 10, 14, colors.text, f1, 0.8);
    const M = state.vs / state.v;
    pill(ctx, 'M = v/v = ' + num(M, 2), 10, 14 + (L.narrow ? 21 : 24), M >= 1 ? colors.pos : colors.muted, f2, 0.75, { at: 5, text: 's' });
    ctx.textAlign = 'right';
    pill(ctx, T('俯視圖', 'Top view'), cw - 10, 14, colors.muted, f2, 0.7);
    drawScaleBar();
    ctx.restore();
  }

  /** 超音速時觀察者在錐外（還沒被震波掃過，或在錐的前方） */
  function silentInCone(p) { return DC.arrivals(p, state.t).length === 0; }

  /** 波前：越舊越淡；兩層線條（柔和的寬光暈＋細亮線），圓心標出發出位置 */
  function drawFronts(fronts) {
    if (!fronts.length) return;
    const col = colors['b-wave'];
    const hx = WX / 2, hy = L.WY / 2;
    fronts.forEach(function (w) {
      if (w.r <= 0) return;
      // 圓完全包住畫面或完全在畫面外時略過
      const far = Math.hypot(Math.max(Math.abs(w.cx - hx), Math.abs(w.cx + hx)), Math.max(Math.abs(w.cy - hy), Math.abs(w.cy + hy)));
      if (w.r > far + 2 / L.k) return;
      const nx = Math.max(-hx, Math.min(hx, w.cx)), ny = Math.max(-hy, Math.min(hy, w.cy));
      if (Math.hypot(w.cx - nx, w.cy - ny) > w.r + 4 / L.k) return;
      const u = Math.min(1, w.r / (WX * 0.95));
      const a = 1 - 0.72 * u;
      const cx = X(w.cx), cy = Y(w.cy), R = w.r * L.k;
      ctx.strokeStyle = alpha(col, (colors.dark ? 0.12 : 0.08) * a);
      ctx.lineWidth = L.narrow ? 5 : 7;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = alpha(col, (colors.dark ? 0.85 : 0.75) * a);
      ctx.lineWidth = L.narrow ? 1.3 : 1.6;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    });
    // 發出位置（圓心）：小點
    ctx.fillStyle = alpha(col, 0.45);
    fronts.forEach(function (w) {
      if (w.r <= 0) return;
      const x = X(w.cx), y = Y(w.cy);
      if (x < -4 || x > cw + 4) return;
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
    });
  }

  /** 震波：v_s > v 時的馬赫錐（只畫到最早的波前，因為波源在 t = 0 才開始發聲）；v_s = v 時的音障 */
  function drawShock(p, S) {
    if (state.vs < state.v || state.t <= 0) return;
    const ax = X(S.x), ay = Y(S.y);
    const f1 = '700 ' + (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    if (Math.abs(state.vs - state.v) < 1e-9) {
      const h = Math.min(state.v * state.t * 0.5, L.WY * 0.32) * L.k;
      const g = ctx.createLinearGradient(0, ay - h, 0, ay + h);
      g.addColorStop(0, alpha(colors.pos, 0));
      g.addColorStop(0.5, alpha(colors.pos, 0.85));
      g.addColorStop(1, alpha(colors.pos, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ax + L.carL * 0.5, ay - h); ctx.lineTo(ax + L.carL * 0.5, ay + h); ctx.stroke();
      ctx.textAlign = 'left';
      pill(ctx, T('音障：波前疊在波源前端', 'Sound barrier: wavefronts pile up in front'), Math.min(ax + L.carL * 0.5 + 6, cw - 10 - (L.narrow ? 150 : 230)), ay - Math.min(h, 60) - 4, colors.pos, f1, 0.85);
      return;
    }
    const th = DC.machAngle(state.v, state.vs);
    const len = state.t * Math.sqrt(state.vs * state.vs - state.v * state.v) * L.k; // 錐邊長（到最早波前的切點）
    const ex = -Math.cos(th), ey = Math.sin(th); // 畫布座標：往後、往上
    const p1 = [ax + ex * len, ay - ey * len], p2 = [ax + ex * len, ay + ey * len];
    // 錐內淡淡的填色（越遠越淡）
    const g = ctx.createLinearGradient(ax, ay, ax + ex * len, ay);
    g.addColorStop(0, alpha(colors.pos, colors.dark ? 0.16 : 0.12));
    g.addColorStop(1, alpha(colors.pos, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath(); ctx.fill();
    // 錐邊：寬的柔光＋細線
    [[7, colors.dark ? 0.22 : 0.16], [2.2, 0.9]].forEach(function (lv) {
      ctx.strokeStyle = alpha(colors.pos, lv[1]);
      ctx.lineWidth = lv[0];
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(ax, ay); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    });
    // 角度 θ：道路（往後）到上方錐邊
    const ar = Math.min(42, len * 0.6);
    if (ar > 14) {
      ctx.strokeStyle = alpha(colors.text, 0.6);
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(ax, ay, ar, Math.PI, Math.PI + th); ctx.stroke();
      ctx.textAlign = 'right';
      const mid = Math.PI + th / 2;
      pill(ctx, 'θ = ' + num(th * 180 / Math.PI, 1) + '°', ax + (ar + 8) * Math.cos(mid) - 2, ay + (ar + 8) * Math.sin(mid) - 6, colors.text, '600 ' + (L.narrow ? 11 : 12) + 'px system-ui, sans-serif', 0.8);
    }
    // 標籤：錐邊中段
    // 標籤：放在錐邊上第一個落在畫面內的位置（先上邊、再下邊）
    if (len > 60) {
      ctx.textAlign = 'center';
      const spots = [];
      [0.6, 0.4, 0.25].forEach(function (k) { spots.push([ax + ex * len * k, ay - ey * len * k - 14]); spots.push([ax + ex * len * k, ay + ey * len * k + 14]); });
      const ok = spots.find(function (q) { return q[0] > 90 && q[0] < cw - 90 && q[1] > 50 && q[1] < ch - 40; });
      if (ok) pill(ctx, T('震波（馬赫錐）', 'Shock wave (Mach cone)'), ok[0], ok[1], colors.pos, f1, 0.85);
    }
  }

  /** 沿道路標出前方與後方相鄰兩個波前的間距 */
  function drawLambda(p, fronts, side) {
    if (state.vs >= state.v || fronts.length < 3) return;
    const a = fronts[fronts.length - 3], b = fronts[fronts.length - 2];
    const y = Y(0) + side * (L.narrow ? 24 : 32);
    const boxes = [];
    const f = '600 ' + (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    const same = state.vs === 0;
    const items = [
      { x1: X(b.cx + b.r), x2: X(a.cx + a.r), lam: (a.cx + a.r) - (b.cx + b.r), name: same ? 'λ' : T('λ前', 'λ front') },
      { x1: X(a.cx - a.r), x2: X(b.cx - b.r), lam: (b.cx - b.r) - (a.cx - a.r), name: same ? 'λ' : T('λ後', 'λ back') }
    ];
    items.forEach(function (it, i) {
      if (same && i === 1) return;
      if (it.x2 - it.x1 < 18 || it.x1 < 2 || it.x2 > cw - 2) return;
      const col = colors.text;
      ctx.strokeStyle = alpha(col, 0.75);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(it.x1, y); ctx.lineTo(it.x2, y);
      ctx.moveTo(it.x1, y - 5); ctx.lineTo(it.x1, y + 5);
      ctx.moveTo(it.x2, y - 5); ctx.lineTo(it.x2, y + 5);
      ctx.stroke();
      ctx.textAlign = 'center';
      const txt = it.name + ' = ' + num(it.lam, 0) + ' m';
      const mx = Math.max(60, Math.min(cw - 60, (it.x1 + it.x2) / 2));
      ctx.font = f;
      const hw = ctx.measureText(txt).width / 2 + 6;
      let ly = y + side * 12;
      // 兩個標籤重疊時，第二個往外移一行
      boxes.forEach(function (bx) { if (Math.abs(bx.x - mx) < bx.hw + hw && Math.abs(bx.y - ly) < 18) ly += side * 19; });
      boxes.push({ x: mx, y: ly, hw: hw });
      pill(ctx, txt, mx, ly, col, f, 0.85);
    });
  }

  function drawScaleBar() {
    const len = 200 * L.k, x0 = 14, y0 = ch - 14;
    ctx.fillStyle = alpha(colors['canvas-bg'], 0.75);
    roundRect(ctx, x0 - 6, y0 - 20, len + 12, 28, 6);
    ctx.fill();
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + len, y0); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0 + 2); ctx.moveTo(x0 + len, y0 - 4); ctx.lineTo(x0 + len, y0 + 2); ctx.stroke();
    ctx.lineCap = 'round';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('200 m', x0 + len / 2, y0 - 6);
  }

  function drawEffects(tNow) {
    state.fx = state.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
    const O = DC.observerAt(params(), state.t), ox = X(O.x), oy = Y(O.y);
    state.fx.forEach(function (e) {
      const u = (tNow - e.t0) / e.dur;
      if (e.type === 'pulse') {
        ctx.strokeStyle = alpha(colors.accent, 0.6 * (1 - u));
        ctx.lineWidth = 2 * (1 - u) + 0.6;
        ctx.beginPath(); ctx.arc(ox, oy, L.obsR + 3 + 14 * u, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'boom') {
        if (!reducedMotion) {
          const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, 30 + 70 * u);
          g.addColorStop(0, alpha(colors.pos, 0.35 * (1 - u)));
          g.addColorStop(1, alpha(colors.pos, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(ox, oy, 30 + 70 * u, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = alpha(colors.pos, 0.8 * (1 - u));
          ctx.lineWidth = 3 * (1 - u) + 0.8;
          ctx.beginPath(); ctx.arc(ox, oy, L.obsR + 6 + 50 * u, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.textAlign = 'center';
        const a = u < 0.7 ? 1 : (1 - u) / 0.3;
        ctx.globalAlpha = a;
        const by = oy + L.obsR + 34 < ch - 30 ? oy + L.obsR + 34 : oy - L.obsR - 42;
        pill(ctx, T('音爆！', 'Sonic boom!'), Math.max(60, Math.min(cw - 60, ox)), by, colors.pos, '800 ' + (L.narrow ? 14 : 16) + 'px system-ui, sans-serif', 0.9);
        ctx.globalAlpha = 1;
      }
    });
  }

  // ---------- f′(t) 圖 ----------
  function collinearValues() {
    const v = state.v, f = state.f;
    const ahead = state.vs < v ? f * (v - state.vo) / (v - state.vs) : NaN;
    const behind = f * (v + state.vo) / (v + state.vs);
    return { ahead: ahead, behind: behind };
  }

  function drawGraph(p) {
    const c = gtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, gw, gh);
    const base = colors['canvas-bg'];
    const g = c.createLinearGradient(0, 0, 0, gh);
    g.addColorStop(0, colors.dark ? shade(base, 0.03) : base);
    g.addColorStop(1, shade(base, colors.dark ? -0.3 : -0.045));
    c.fillStyle = g;
    roundRect(c, 0, 0, gw, gh, 8);
    c.fill();
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    roundRect(c, 0.5, 0.5, gw - 1, gh - 1, 8);
    c.stroke();

    const narrow = L.narrow;
    const f = '' + (narrow ? 11 : 12) + 'px system-ui, sans-serif';
    c.font = f;
    const pad = { l: narrow ? 40 : 48, r: 12, t: 30, b: 26 };
    const pw = gw - pad.l - pad.r, ph = gh - pad.t - pad.b;
    const tL = Math.max(0, state.t - 0.85 * GRAPH_W), tR = tL + GRAPH_W;
    const cv2 = collinearValues();
    // 縱軸範圍：包含 f、兩個共線極限值與視窗內的紀錄（上限 4f）
    let m = state.f * 1.3;
    [cv2.ahead, cv2.behind].forEach(function (x) { if (isFinite(x) && x > 0) m = Math.max(m, x); });
    state.hist.forEach(function (h) {
      if (h.t < tL) return;
      if (h.a != null) m = Math.max(m, Math.abs(h.a));
      if (h.b != null) m = Math.max(m, Math.abs(h.b));
    });
    m = Math.min(m * 1.08, state.f * 4);
    const step = niceStep(m / (narrow ? 4 : 5));
    const yMax = Math.ceil(m / step - 1e-9) * step;
    const gx = function (t) { return pad.l + (t - tL) / GRAPH_W * pw; };
    const gy = function (fv) { return pad.t + ph - Math.min(fv, yMax * 1.02) / yMax * ph; };
    const px = function (v) { return Math.round(v) + 0.5; };

    // 格線與刻度
    c.strokeStyle = alpha(colors.text, 0.07);
    c.beginPath();
    for (let y = 0; y <= yMax + 1e-9; y += step) { c.moveTo(pad.l, px(gy(y))); c.lineTo(gw - pad.r, px(gy(y))); }
    const tStep = niceStep(GRAPH_W / (narrow ? 4 : 8));
    for (let t = Math.ceil(tL / tStep - 1e-9) * tStep; t <= tR + 1e-9; t += tStep) { c.moveTo(px(gx(t)), pad.t); c.lineTo(px(gx(t)), pad.t + ph); }
    c.stroke();
    c.strokeStyle = alpha(colors.muted, 0.7);
    c.beginPath(); c.moveTo(pad.l, px(pad.t + ph)); c.lineTo(gw - pad.r, px(pad.t + ph)); c.moveTo(px(pad.l), pad.t); c.lineTo(px(pad.l), pad.t + ph); c.stroke();
    c.fillStyle = colors.muted;
    c.font = f;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    const dec = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
    for (let y = 0; y <= yMax + 1e-9; y += step) c.fillText(num(y, dec), pad.l - 6, gy(y));
    c.textAlign = 'center';
    c.textBaseline = 'top';
    const tdec = tStep < 1 ? 1 : 0;
    for (let t = Math.ceil(tL / tStep - 1e-9) * tStep; t <= tR + 1e-9; t += tStep) {
      const x = gx(t);
      if (x > gw - pad.r - 34) continue;
      c.fillText(num(t, tdec), x, pad.t + ph + 6);
    }
    c.textAlign = 'right';
    c.font = '600 ' + f;
    c.fillText('t (s)', gw - pad.r, pad.t + ph + 6);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('Hz', 6, pad.t - 12);

    // 參考線：f、共線極限值
    const refs = [
      { v: state.f, color: colors.muted, label: 'f = ' + num(state.f, 2), dash: [5, 4] },
      { v: cv2.ahead, color: colors.pos, label: T('正前方 ', 'Ahead ') + num(cv2.ahead, 2), dash: [2, 4] },
      { v: cv2.behind, color: colors.neg, label: T('正後方 ', 'Behind ') + num(cv2.behind, 2), dash: [2, 4] }
    ];
    const used = [];
    refs.forEach(function (r, i) {
      if (!isFinite(r.v) || r.v <= 0 || r.v > yMax) return;
      if (i > 0 && Math.abs(r.v - state.f) < 1e-9) return; // 與 f 重合時不重畫
      const y = px(gy(r.v));
      c.setLineDash(r.dash);
      c.strokeStyle = alpha(r.color, 0.75);
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(pad.l, y); c.lineTo(gw - pad.r, y); c.stroke();
      c.setLineDash([]);
      let ly = y - 9;
      used.forEach(function (u) { if (Math.abs(u - ly) < 17) ly = u - 17; });
      used.push(ly);
      c.textAlign = 'right';
      pill(c, r.label, gw - pad.r - 4, ly, r.color, '600 ' + f, 0.8);
    });

    // f′ 紀錄：最晚發出的聲音（實線管狀）、超音速時較早發出的聲音 |f′|（虛線）
    c.save();
    c.beginPath(); c.rect(pad.l, pad.t - 4, pw, ph + 4); c.clip();
    const col = colors.accent;
    function series(key, dashed) {
      const segs = [];
      let cur = null;
      state.hist.forEach(function (h) {
        if (h.t < tL - 0.2) return;
        const v = h[key];
        if (v == null) { cur = null; return; }
        if (!cur) { cur = []; segs.push(cur); }
        cur.push([gx(h.t), gy(Math.abs(v))]);
      });
      segs.forEach(function (pts) {
        if (pts.length < 2) return;
        c.lineCap = 'round'; c.lineJoin = 'round';
        if (dashed) {
          c.setLineDash([6, 5]);
          c.strokeStyle = alpha(colors.pos, 0.9);
          c.lineWidth = 2;
          c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
          c.setLineDash([]);
          return;
        }
        // 管狀：底層粗而暗，上層細而亮、略偏上
        c.strokeStyle = shade(col, colors.dark ? -0.1 : -0.1);
        c.lineWidth = narrow ? 2.6 : 3.2;
        c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
        c.strokeStyle = alpha(shade(col, 0.55), 0.8);
        c.lineWidth = 1.1;
        c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1] - 0.7); else c.moveTo(p[0], p[1] - 0.7); }); c.stroke();
      });
    }
    series('a', false);
    series('b', true);
    c.restore();
    // 目前的點
    const last = state.hist.length ? state.hist[state.hist.length - 1] : null;
    if (last && last.a != null && last.t >= tL) {
      const x = gx(last.t), y = gy(Math.abs(last.a)), r = narrow ? 4.5 : 5.5;
      const sg = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      sg.addColorStop(0, shade(col, 0.6));
      sg.addColorStop(1, shade(col, -0.3));
      c.fillStyle = sg;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = colors['canvas-bg'];
      c.lineWidth = 1.2;
      c.stroke();
    }
    // 標題
    c.textAlign = 'left';
    pill(c, T('觀察者聽到的頻率 f′(t)', 'Frequency heard f′(t)'), pad.l + 4, 14, col, '700 ' + (narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.85);
    if (!state.hist.some(function (h) { return h.a != null; })) {
      c.textAlign = 'center';
      pill(c, state.t > 0 ? T('聲音還沒傳到觀察者', 'The sound has not reached the listener yet') : T('按「播放」開始', 'Press “Play” to start'),
        pad.l + pw / 2, pad.t + ph / 2, colors.muted, f, 0.85);
    }
    if (state.hist.some(function (h) { return h.b != null && h.t >= tL; })) {
      c.textAlign = 'left';
      pill(c, T('虛線：較早發出、時間反序的聲音 |f′|', 'Dashed: earlier sound, heard in reverse |f′|'), pad.l + 4, pad.t + 12, colors.pos, f, 0.85);
    }
  }

  // ---------- 讀數 ----------
  const lastText = {};
  function setHTML(id, html) {
    if (lastText[id] === html) return;
    lastText[id] = html;
    $(id).innerHTML = html;
  }
  function pitchOf(fp) { return BASE_PITCH * Math.abs(fp) / state.f; }
  function updateReadout(p, arr) {
    const MS = ' m/s';
    setHTML('rt', num(state.t, 2) + ' s');
    if (arr.length) {
      const a = arr[0];
      let fpHTML = num(a.fp, 2) + ' Hz';
      if (arr.length === 2) fpHTML += '<small>' + T('同時還聽到較早發出、時間反序的聲音 |f′| = ', 'plus an earlier sound heard in reverse, |f′| = ') + num(Math.abs(arr[1].fp), 2) + ' Hz</small>';
      setHTML('rf', fpHTML);
      setHTML('rr', num(a.fp / state.f, 3));
      const pitch = pitchOf(a.fp);
      setHTML('rp', num(pitch, 0) + ' Hz' + (pitch > 3500 || pitch < 150 ? '<small>' + T('超出播放範圍，喇叭以 ', 'outside the playable range; played at ') + num(Math.max(150, Math.min(3500, pitch)), 0) + ' Hz' + T(' 播放', '') + '</small>' : ''));
      setHTML('rus', num(a.us, 1) + MS);
      setHTML('ruo', num(a.uo, 1) + MS);
      setHTML('rte', num(a.u, 2) + T(' s 前', ' s ago') + '<small>' + T('聲音已走了 ', 'it has travelled ') + num(a.dist, 0) + ' m</small>');
    } else {
      const msg = state.vs >= state.v && state.t > 0 ? T('—（在馬赫錐外，聽不到）', '— (outside the Mach cone: silent)') : T('—（聲音還沒傳到）', '— (no sound yet)');
      setHTML('rf', msg);
      ['rr', 'rp', 'rus', 'ruo', 'rte'].forEach(function (id) { setHTML(id, '—'); });
    }
    const S = DC.sourceAt(p, state.t), O = DC.observerAt(p, state.t);
    setHTML('rd', num(Math.hypot(O.x - S.x, O.y - S.y), 0) + ' m');
    setHTML('rsx', num(S.x, 0) + ' m' + '<small>' + T('起點 ', 'start ') + num(state.sx, 0) + ' m</small>');
    setHTML('rpos', '(' + num(O.x, 0) + ', ' + num(O.y, 0) + ') m');

    const M = state.vs / state.v;
    setHTML('dM', num(M, 2) + '<small>' + (M < 1 - 1e-9 ? T('次音速', 'subsonic') : M <= 1 + 1e-9 ? T('等於音速', 'sonic') : T('超音速', 'supersonic')) + '</small>');
    setHTML('dL', num(state.v / state.f, 1) + ' m');
    const la = DC.wavelengthAhead(state.f, state.v, state.vs);
    setHTML('dLa', la > 1e-9 ? num(la, 1) + ' m' : la > -1e-9 ? T('0（波前疊在一起）', '0 (wavefronts pile up)') : T('—（波源跑在波前前面）', '— (source outruns its waves)'));
    setHTML('dLb', num(DC.wavelengthBehind(state.f, state.v, state.vs), 1) + ' m');
    const cv2 = collinearValues();
    setHTML('dFa', isFinite(cv2.ahead) ? num(cv2.ahead, 2) + ' Hz' : T('—（聲音傳不到前方）', '— (no sound reaches ahead)'));
    setHTML('dFb', num(cv2.behind, 2) + ' Hz');
    const th = DC.machAngle(state.v, state.vs);
    setHTML('dTh', isFinite(th) ? num(th * 180 / Math.PI, 1) + '°' : T('—（次音速，沒有震波）', '— (subsonic: no shock)'));
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  const voices = [null, null];
  function stopVoices() {
    voices.forEach(function (v, i) { if (v) { v.stop(0.15); voices[i] = null; } });
  }
  /** 持續的音調：音高 = 660 Hz × |f′|/f；音量隨聲音傳播的距離變小 */
  function updateSound(arr) {
    const S = sound();
    if (!S || !state.running) { stopVoices(); return; }
    for (let i = 0; i < 2; i++) {
      const a = arr[i];
      if (!a) { if (voices[i]) { voices[i].stop(0.12); voices[i] = null; } continue; }
      const freq = Math.max(150, Math.min(3500, pitchOf(a.fp)));
      let gain = 0.34 * Math.max(0.14, Math.min(1, 150 / Math.max(1, a.dist)));
      if (arr.length === 2) gain *= 0.75;
      if (!voices[i] || !voices[i].playing) voices[i] = S.voice({ freq: freq, type: 'triangle', gain: gain });
      else voices[i].set({ freq: freq, gain: gain }, 0.05);
    }
  }
  /** 音爆：低沉的寬頻爆裂聲＋快速下滑的音（主要能量在 250 Hz 以上） */
  function boomSound() {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.06, gain: 0.9, filter: 2400, q: 0.8 });
    S.noise({ dur: 0.45, gain: 0.85, filter: 420, q: 0.6, delay: 0.01 });
    S.sweep({ from: 900, to: 260, dur: 0.35, type: 'triangle', gain: 0.55 });
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false, lastPulse = 0;
  function tick(tNow) {
    if (!state.running) { loopOn = false; return; }
    const dt = Math.min((tNow - lastT) / 1000, 1 / 30) * (state.slow ? SLOW : 1);
    lastT = tNow;
    state.t += dt;
    step(tNow, dt);
    draw();
    if (state.running) requestAnimationFrame(tick); else loopOn = false;
  }

  /** 每一幀：紀錄 f′、判斷音爆與波前抵達、更新聲音、判斷結束 */
  function step(tNow, dt) {
    const p = params(), arr = DC.arrivals(p, state.t);
    const prev = state.prev, run = state.run;
    if (prev && arr.length > prev.length && prev.length === 0 && state.vs >= state.v &&
        (arr.length === 2 || Math.abs(arr[0].fp) > 5 * state.f)) {
      boomSound();
      state.fx.push({ type: 'boom', t0: tNow, dur: 1200 });
      // 精確的音爆時刻：在這一幀內用二分法找出開始聽得到的瞬間
      let lo = Math.max(0, state.t - dt), hi = state.t;
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (DC.arrivals(p, mid).length) hi = mid; else lo = mid;
      }
      const when = T('（t = ', ' (t = ') + num(hi, 2) + T(' s）', ' s)');
      setStatus(arr.length === 2
        ? T('音爆' + when + '！馬赫錐掃過觀察者，大量波前同時抵達；之後會同時聽到兩個聲音。',
          'Sonic boom' + when + '! The Mach cone swept over the listener and many wavefronts arrived at once; now two sounds are heard together.')
        : T('音爆' + when + '！堆在波源前端的大量波前同時抵達觀察者。', 'Sonic boom' + when + '! The wavefronts piled up at the front of the source reach the listener all at once.'));
      run.boom = true;
      run.tBoom = hi;
      const th = DC.machAngle(state.v, state.vs);
      emit('boom', { tBoom: hi, theta: th * 180 / Math.PI, clean: run.clean });
    }
    // 這一趟的統計
    if (arr.length) {
      const r = arr[0].fp / state.f;
      run.ratioMax = Math.max(run.ratioMax, r);
      run.ratioMin = Math.min(run.ratioMin, r);
      run.heardTime += dt;
      if (arr.length === 2) run.two = true;
    }
    {
      const S0 = DC.sourceAt(p, state.t), O0 = DC.observerAt(p, state.t);
      run.minDist = Math.min(run.minDist, Math.hypot(O0.x - S0.x, O0.y - S0.y));
    }
    // 每收到一個波前，觀察者閃一下（純裝飾）
    if (prev && prev.length === arr.length && arr.length && !reducedMotion) {
      let n = DC.frontsBetween(p, prev[0], arr[0].te);
      if (arr.length === 2) n += DC.frontsBetween(p, arr[1].te, prev[1]);
      if (n > 0 && tNow - lastPulse > 70) { lastPulse = tNow; state.fx.push({ type: 'pulse', t0: tNow, dur: 320 }); }
    }
    state.prev = arr.map(function (a) { return a.te; });
    state.hist.push({ t: state.t, a: arr[0] ? arr[0].fp : null, b: arr[1] ? arr[1].fp : null });
    if (state.hist.length > 6000) state.hist.splice(0, state.hist.length - 6000);
    updateSound(arr);

    // 結束：波源駛離畫面夠遠，或移動的觀察者走出畫面
    const S = DC.sourceAt(p, state.t), O = DC.observerAt(p, state.t);
    if (state.vs > 0 && S.x > WX / 2 + 0.45 * WX) {
      finish(T('波源已經遠離畫面。按「重新開始」再看一次。', 'The source has driven far away. Press “Restart” to watch again.'));
    } else if (state.vo !== 0 && Math.abs(O.x) > WX / 2 - 8) {
      finish(T('觀察者走出畫面了。按「重新開始」再看一次，或把觀察者拖回畫面中。', 'The listener has walked out of the picture. Press “Restart” to watch again, or drag the listener back in.'));
    }
  }
  function finish(msg) {
    state.running = false;
    state.ended = true;
    stopVoices();
    setStatus(msg);
    updateButtons();
    const r = state.run;
    emit('runEnd', {
      heard: r.heardTime > 0, heardTime: r.heardTime, ratioMax: r.ratioMax, ratioMin: r.ratioMin,
      boom: r.boom, tBoom: r.tBoom, two: r.two, minDist: r.minDist, clean: r.clean
    });
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    $('play').textContent = state.running ? T('暫停', 'Pause')
      : state.ended ? T('重新開始', 'Restart')
        : state.t > 0 ? T('繼續', 'Resume') : T('播放', 'Play');
  }

  /** 從頭開始：清掉波前與 f′(t) 圖，波源回到起點；觀察者留在目前的位置 */
  function restart(play) {
    const O = DC.observerAt(params(), state.t);
    state.obs = { x: O.x, y: O.y, t0: 0 };
    clampObserver();
    state.t = 0;
    state.hist = [];
    state.fx = [];
    state.prev = null;
    state.ended = false;
    state.run = newRun();
    stopVoices();
    state.running = play;
    updateButtons();
    if (play) startLoop();
    requestDraw();
  }

  $('play').addEventListener('click', function () {
    if (state.running) {
      state.running = false;
      stopVoices();
      updateButtons();
      requestDraw();
      // 暫停＝讀一次數：回報此刻觀察者聽到的聲音
      const arr = DC.arrivals(params(), state.t), a = arr[0], b = arr[1];
      emit('measure', {
        n: arr.length, fp: a ? a.fp : null, ratio: a ? a.fp / state.f : null, fp2: b ? b.fp : null,
        us: a ? a.us : null, uo: a ? a.uo : null, lambdaFront: DC.wavelengthAhead(state.f, state.v, state.vs),
        lambdaBack: DC.wavelengthBehind(state.f, state.v, state.vs), clean: state.run.clean
      });
      return;
    }
    if (state.ended) { setStatus(''); restart(true); return; }
    state.running = true;
    updateButtons();
    startLoop();
  });

  // 全部清除：清掉所有波前與 f′(t) 圖，回到 t = 0（滑桿設定與觀察者位置不變）
  $('reset').addEventListener('click', function () {
    restart(false);
    setStatus(T('已全部清除，滑桿設定不變。按「播放」開始。', 'Everything is cleared; the slider settings are kept. Press “Play” to start.'));
  });

  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; requestDraw(); });

  [['showFronts', 'fronts'], ['showLambda', 'lambda'], ['showRet', 'ret'], ['showVel', 'vel']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
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
    if (!sound()) stopVoices();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); if (!ev.detail.value) stopVoices(); }
  });
  updateSoundButton();

  // ---------- 滑桿 ----------
  const elF = $('f'), elV = $('v'), elVs = $('vs'), elVo = $('vob');
  let quiet = false; // 預設情境一次設定多個滑桿時，暫停個別處理
  function refreshOutputs() {
    $('fo').textContent = fmtSlider(val(elF), elF) + ' Hz';
    $('vo').textContent = fmtSlider(val(elV), elV) + ' m/s';
    $('vso').textContent = fmtSlider(val(elVs), elVs) + ' m/s';
    $('vobo').textContent = fmtSlider(val(elVo), elVo) + ' m/s';
  }
  function markPreset(name) {
    state.preset = name;
    document.querySelectorAll('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.preset === name)); });
  }
  [elF, elV, elVs].forEach(function (el) {
    el.addEventListener('input', function () {
      refreshOutputs();
      if (quiet) return;
      state.f = val(elF); state.v = val(elV); state.vs = val(elVs);
      markPreset(null);
      setStatus('');
      restart(state.running);
    });
  });
  // 觀察者速度：不必從頭開始，從目前位置以新速度繼續
  elVo.addEventListener('input', function () {
    refreshOutputs();
    if (quiet) return;
    const O = DC.observerAt(params(), state.t);
    state.obs = { x: O.x, y: O.y, t0: state.t };
    state.vo = val(elVo);
    if (state.t > 0) state.run.clean = false;
    state.prev = null;
    markPreset(null);
    requestDraw();
  });

  function setSlider(el, v) {
    if (window.LabNum) window.LabNum.set(el, v);
    else { el.value = v; el.dispatchEvent(new Event('input')); }
  }
  const PRESET_MSG = {
    still: ['波源與觀察者都靜止：波前是同心圓，間距 λ = v/f，聽到的 f′ = f。', 'Source and listener at rest: the wavefronts are concentric circles a distance λ = v/f apart, and f′ = f.'],
    approach: ['救護車從左邊駛來、經過觀察者身旁：注意 f′(t) 圖由高變低（打開音效聽聽看）。', 'The ambulance comes from the left and passes the listener: watch the f′(t) graph go from high to low (turn the sound on and listen).'],
    recede: ['救護車離觀察者而去：後方的波長變長，聽到的 f′ 比 f 低。', 'The ambulance drives away from the listener: the wavelength behind it is longer, so f′ is lower than f.'],
    observer: ['波源不動，觀察者以 100 m/s 走向波源、經過後再遠離：空氣中的波長不變，但每秒遇到的波前數改變。', 'The source is still; the listener walks toward it at 100 m/s, passes it and moves away: the wavelength in the air is unchanged, but the number of wavefronts met each second changes.'],
    sonic: ['波源速率等於聲速：所有波前在波源前端疊在一起（音障），前方聽不到聲音。已自動開啟慢動作。', 'The source moves at the speed of sound: all the wavefronts pile up at its front (the sound barrier) and nothing is heard ahead. Slow motion is on.'],
    super: ['超音速（M = 1.6）：波前疊成馬赫錐，錐面掃過觀察者時發生音爆。已自動開啟慢動作。', 'Supersonic (M = 1.6): the wavefronts form a Mach cone, and there is a sonic boom when it sweeps over the listener. Slow motion is on.']
  };
  function applyPreset(name, play) {
    const pr = PRESETS[name];
    quiet = true;
    setSlider(elV, 340);
    setSlider(elVs, pr.vs);
    setSlider(elVo, pr.vo);
    quiet = false;
    refreshOutputs();
    state.v = val(elV); state.vs = val(elVs); state.vo = val(elVo); state.f = val(elF);
    state.sx = pr.sx;
    state.t = 0;
    state.obs = { x: pr.ox, y: pr.oy, t0: 0 };
    state.slow = pr.slow;
    $('slow').checked = pr.slow;
    markPreset(name);
    restart(play);
    setStatus(T(PRESET_MSG[name][0], PRESET_MSG[name][1]));
  }
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () { applyPreset(b.dataset.preset, true); });
  });

  // ---------- 拖曳觀察者 ----------
  function clampObserver() {
    if (!L) return;
    const mx = WX / 2 - 12 / L.k, my = L.WY / 2 - 12 / L.k;
    // 只在 t0 = 目前時刻時直接改位置；移動中的觀察者由 finish() 處理
    const O = DC.observerAt(params(), state.t);
    const x = Math.max(-mx, Math.min(mx, O.x)), y = Math.max(-my, Math.min(my, O.y));
    if (x !== O.x || y !== O.y) state.obs = { x: x, y: y, t0: state.t };
  }
  function moveObserver(x, y) {
    state.obs = { x: x, y: y, t0: state.t };
    if (state.t > 0) state.run.clean = false;
    clampObserver();
    state.prev = null;
    // f′(t) 圖在搬動處斷開
    const last = state.hist[state.hist.length - 1];
    if (last && last.a != null) state.hist.push({ t: state.t, a: null, b: null });
    if (state.ended && state.vo !== 0) { state.ended = false; setStatus(''); updateButtons(); }
    requestDraw();
  }
  function eventPx(ev) {
    const r = cv.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }
  function nearObserver(q) {
    const O = DC.observerAt(params(), state.t);
    return Math.hypot(q[0] - X(O.x), q[1] - Y(O.y)) < Math.max(26, L.obsR * 2.4);
  }
  function setHover(h) {
    if (h !== state.hover) { state.hover = h; requestDraw(); }
    cv.style.cursor = drag ? 'grabbing' : h ? 'grab' : '';
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!L) return;
    const q = eventPx(ev), O = DC.observerAt(params(), state.t);
    let off = [0, 0];
    if (nearObserver(q)) off = [X(O.x) - q[0], Y(O.y) - q[1]];
    drag = { off: off };
    const w = toWorld(q[0] + off[0], q[1] + off[1]);
    moveObserver(w[0], w[1]);
    setHover(true);
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!L) return;
    const q = eventPx(ev);
    if (!drag) { if (ev.pointerType !== 'touch') setHover(nearObserver(q)); return; }
    const w = toWorld(q[0] + drag.off[0], q[1] + drag.off[1]);
    moveObserver(w[0], w[1]);
  });
  const endDrag = function (ev) {
    drag = null;
    setHover(ev && ev.pointerType === 'mouse' ? nearObserver(eventPx(ev)) : false);
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag) setHover(false); });
  // 鍵盤：方向鍵移動觀察者（Shift 一次 50 m）
  cv.addEventListener('keydown', function (ev) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    const s = ev.shiftKey ? 50 : 10, O = DC.observerAt(params(), state.t);
    moveObserver(O.x + d[0] * s, O.y + d[1] * s);
  });

  // ---------- 啟動 ----------
  readColors();
  refreshOutputs();
  state.f = val(elF);
  function themeChanged() { readColors(); if (L) buildBackground(); requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  window.addEventListener('resize', function () { resize(); });
  resize();
  applyPreset('approach', !reducedMotion);
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
})();
