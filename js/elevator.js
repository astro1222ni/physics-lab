/* elevator.js — 「電梯中的視重（超重與失重）」模組的畫面與互動（物理計算在 elevator-core.js） */
(function () {
  'use strict';
  const E = window.ElevatorCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 固定的尺寸與常數 ----------
  const G = E.G;
  const HB = E.BALL_H;        // m：小球放開時球底離地板的高度
  const BALL_R = 0.06;        // m：小球半徑（只影響畫面）
  const CEIL = 2.4;           // m：車廂天花板高度
  const SPRING_L0 = 0.28;     // m：彈簧原長（畫面）
  const RULER_N = 40;         // N：彈簧秤刻度的最大值
  const DIAL_MAX = 200;       // kgw：體重計刻度盤的最大值
  const F_REF = 1300;         // N：受力圖中，方塊上下各可畫到的最大力（超過的箭頭截短並標「≈」）
  const DWELL = 1.6;          // s：到站開門的時間
  const SLOW = 0.25;
  const MAX_RUNS = 3;         // 保留幾趟舊的圖
  const Y_BOT = -1.8, Y_ROOF = 30, Y_TOP = 32.8; // m：底坑、屋頂、機房頂
  const MOTOR = { acc: 1, cruise: 1, dec: 1, manual: 1, protect: 1 };

  const S = {
    t: 0,                    // 物理時間（s）
    running: true,
    slow: false,
    mode: 'floor',           // 'floor' 樓層按鈕｜'manual' 手動駕駛
    track: null,             // 目前這一趟的運動（等加速度段，絕對時間）
    run: null,               // 目前（或最近一趟）的紀錄
    runs: [],                // 較早的幾趟（淡色）
    cable: 'ok',             // 'ok'｜'cut'
    queue: [],               // 等待中的樓層
    dwellUntil: null,        // 開門停靠到何時（物理時間）
    doorFloor: null, doorT0: 0,
    cmd: 0,                  // 手動駕駛：+1 向上加速、−1 向下加速、0 放開
    ball: { st: 'hand' },    // 'hand'｜'air'｜'floor'
    mystery: null,           // 神秘電梯：{ A, run, guessed }
    lastSeg: null,
    lastReading: null,
    fx: []
  };

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface', '--bg',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-wave', '--b-optics', '--star']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim() || '#888888'; });
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
  function mix(c1, c2, k) {
    const a = rgbOf(c1), b = rgbOf(c2);
    return 'rgb(' + a.map(function (x, i) { return Math.round(x + (b[i] - x) * k); }).join(',') + ')';
  }
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }
  function phaseColor(ph) {
    return ph === 'over' ? colors['b-mech'] : ph === 'under' ? colors['b-wave'] : ph === 'free' ? colors['b-optics'] : colors.muted;
  }
  function phaseName(ph) {
    return ph === 'over' ? T('超重', 'Overweight') : ph === 'under' ? T('失重', 'Underweight')
      : ph === 'free' ? T('完全失重', 'Weightless') : T('正常', 'Normal');
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, d) {
    const s = num(v, d);
    return (v > 0 && s !== num(0, d)) ? '+' + s : s;
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  function floorName(n) { return n + 'F'; }

  // ---------- 參數 ----------
  const elA = $('A'), elV = $('V'), elM = $('m'), elMs = $('ms'), elVt = $('vt'), elAb = $('ab');
  function P() {
    return { A: val(elA), V: val(elV), m: val(elM), ms: val(elMs), vt: val(elVt), ab: val(elAb) };
  }

  // ---------- 運動紀錄 ----------
  function stamp(segs) {
    const p = P();
    segs.forEach(function (s) { s.m = p.m; s.ms = p.ms; });
    return segs;
  }
  function cur() { return E.stateAt(S.track, S.t); }
  function curSeg() { return S.track[E.indexAt(S.track, S.t)]; }
  /** 從現在（S.t）起改用新的段落；之前已經發生的部分保留 */
  function replan(segs) {
    const t = S.t;
    while (S.track.length && S.track[S.track.length - 1].t0 >= t - 1e-12 && S.track.length > 1) S.track.pop();
    const last = S.track[S.track.length - 1];
    if (last.t0 >= t - 1e-12) S.track.pop();
    else if (last.t1 > t) last.t1 = t;
    stamp(segs).forEach(function (s) { S.track.push(s); });
    segStarted(S.track[E.indexAt(S.track, S.t)]);
    if (S.ball.st === 'air') S.ball.tLand = E.ballLanding(S.track, S.ball, S.t);
  }
  /** 開始新的一趟：舊的一趟移到「之前幾趟」 */
  function startRun(kind, extra) {
    const st = cur();
    if (S.run) {
      if (!S.run.ended) { S.run.ended = true; S.run.tEnd = S.t; }
      S.runs.push(S.run);
      while (S.runs.length > MAX_RUNS) S.runs.shift();
    }
    S.track = [stamp([E.rest(S.t, st.y)])[0]];
    S.lastSeg = S.track[0];
    S.run = Object.assign({ kind: kind, t0: S.t, y0: st.y, track: S.track, ended: false, tEnd: null, m0: P().m, mConst: true }, extra || {});
    return S.run;
  }
  function endRun(t) {
    if (!S.run || S.run.ended) return;
    S.run.ended = true;
    S.run.tEnd = t;
  }
  /** 一趟之中（t0 到 t1）讀數的最小值與最大值（kgw） */
  function readRange(run, t0, t1) {
    let lo = Infinity, hi = -Infinity;
    run.track.forEach(function (s) {
      if (s.t1 <= t0 + 1e-12 || s.t0 >= t1 - 1e-12) return;
      const r = E.reading(s.m, s.a);
      lo = Math.min(lo, r); hi = Math.max(hi, r);
    });
    return { lo: lo, hi: hi };
  }
  function isHidden(run) { return !!(run && run.mystery && !(S.mystery && S.mystery.run === run && S.mystery.guessed) && !run.revealed); }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gv = $('gv'), gtx = gv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, gw = 300, gh = 300;
  let L = null, GL = null;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');

  function layout() {
    const narrow = cw < 640, gap = narrow ? 6 : 8;
    let H, bld, car, dial, fbd;
    if (!narrow) {
      H = Math.round(Math.max(400, Math.min(480, cw * 0.56)));
      const bw = Math.round(cw * 0.2), iw = Math.round(cw * 0.45);
      const rx = bw + iw + 2 * gap, rw = cw - rx;
      const dh = Math.round(H * 0.4);
      bld = { x: 0, y: 0, w: bw, h: H };
      car = { x: bw + gap, y: 0, w: iw, h: H };
      dial = { x: rx, y: 0, w: rw, h: dh };
      fbd = { x: rx, y: dh + gap, w: rw, h: H - dh - gap };
    } else {
      const H1 = Math.round(Math.max(300, Math.min(420, cw * 0.98)));
      const H2 = Math.round(Math.max(220, Math.min(300, cw * 0.66)));
      const bw = Math.round(cw * 0.25);
      const dw = Math.round(cw * 0.4);
      bld = { x: 0, y: 0, w: bw, h: H1 };
      car = { x: bw + gap, y: 0, w: cw - bw - gap, h: H1 };
      dial = { x: 0, y: H1 + gap, w: dw, h: H2 };
      fbd = { x: dw + gap, y: H1 + gap, w: cw - dw - gap, h: H2 };
      H = H1 + gap + H2;
    }
    // 大樓（高度依比例）
    const bPadT = 8, bPadB = 8;
    const bk = (bld.h - bPadT - bPadB) / (Y_TOP - Y_BOT);
    const lw = narrow ? 25 : 30;
    const bx0 = bld.x + lw, bx1 = bld.x + bld.w - 4;
    const sx0 = Math.round(bx0 + (bx1 - bx0) * (narrow ? 0.4 : 0.44)), sx1 = Math.round(bx1 - (narrow ? 4 : 6));
    // 車廂內部（依比例）
    const iPadB = 6, iPadT = 6, padX = narrow ? 6 : 10;
    const ik = (car.h - iPadB - iPadT) / (CEIL + 0.16);
    const wM = (car.w - 2 * padX) / ik;
    return {
      narrow: narrow, H: H, gap: gap, bld: bld, car: car, dial: dial, fbd: fbd,
      bk: bk, bPadB: bPadB, lw: lw, bx0: bx0, bx1: bx1, sx0: sx0, sx1: sx1,
      ik: ik, iPadB: iPadB, padX: padX, wM: wM,
      xp: Math.max(0.42, wM * 0.27),       // 人站的位置（m，由左牆量起）
      xs: wM * 0.79,                        // 彈簧秤的位置
      lwArrow: narrow ? 2.4 : 3
    };
  }
  function YB(y) { return L.bld.y + L.bld.h - L.bPadB - (y - Y_BOT) * L.bk; }
  function XI(x) { return L.car.x + L.padX + x * L.ik; }
  function ZI(z) { return L.car.y + L.car.h - L.iPadB - (z + 0.1) * L.ik; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2); // 兩張大畫布：解析度上限 2 倍，手機也流暢
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    gw = gv.clientWidth || w;
    gh = Math.round(L.narrow ? Math.max(330, Math.min(380, gw * 0.95)) : Math.max(360, Math.min(420, gw * 0.48)));
    if (gv.style.height !== gh + 'px') gv.style.height = gh + 'px';
    gv.width = Math.round(gw * dpr);
    gv.height = Math.round(gh * dpr);
    GL = graphLayout();
    buildGraphBg();
    buildBackground();
    draw();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** 有半透明圓角底框的標籤；c.textAlign 決定水平對齊，垂直置中於 y */
  function pill(c, text, x, y, color, font, bgAlpha, bgColor) {
    c.font = font || '600 12px system-ui, sans-serif';
    c.textBaseline = 'middle';
    const m = c.measureText(text), tw = m.width;
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 15;
    const ph = fh + 3, pw = tw + 10;
    const al = c.textAlign;
    const bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - tw - 5 : x - 5;
    c.fillStyle = alpha(bgColor || colors['canvas-bg'], bgAlpha == null ? 0.86 : bgAlpha);
    roundRect(c, bx, y - ph / 2, pw, ph, ph / 2);
    c.fill();
    c.fillStyle = color;
    c.fillText(text, x, y + 0.5);
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }
  function textW(c, text, font) { c.font = font; return c.measureText(text).width; }
  /** 字太長時縮小字級，讓文字（加上底框）放得進 maxW；最小 8 px */
  function fitFont(c, text, maxW, size, weight) {
    let sz = size, f;
    for (; sz > 8; sz -= 0.5) {
      f = (weight ? weight + ' ' : '') + sz + 'px system-ui, sans-serif';
      if (textW(c, text, f) + 10 <= maxW) return f;
    }
    return (weight ? weight + ' ' : '') + '8px system-ui, sans-serif';
  }

  /** 向量箭頭（與其他模組一致）：箭身寬 lw，箭頭長約 4 倍箭身寬 */
  function arrow(c, x0, y0, ux, uy, len, lw, color, broken) {
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
    if (broken) {
      const mx = x0 + ux * len * 0.5, my = y0 + uy * len * 0.5, s = 2.2 * lw;
      c.strokeStyle = colors['canvas-bg'];
      c.lineWidth = lw + 2;
      c.beginPath(); c.moveTo(mx - ux * 2, my - uy * 2); c.lineTo(mx + ux * 2, my + uy * 2); c.stroke();
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.beginPath();
      [-3, 3].forEach(function (o) {
        const bx = mx + ux * o, by = my + uy * o;
        c.moveTo(bx - nx * s + ux * 2, by - ny * s + uy * 2);
        c.lineTo(bx + nx * s - ux * 2, by + ny * s - uy * 2);
      });
      c.stroke();
    }
  }

  /** 由上而下的漸層方塊（上亮下暗），頂邊高光、底邊暗線 */
  function block(c, x, y, w, h, r, base, light) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(base, light == null ? 0.18 : light));
    g.addColorStop(1, shade(base, -0.12));
    c.fillStyle = g;
    roundRect(c, x, y, w, h, r);
    c.fill();
    c.strokeStyle = alpha(shade(base, 0.6), 0.55);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + r, y + 0.5); c.lineTo(x + w - r, y + 0.5); c.stroke();
    c.strokeStyle = alpha(shade(base, -0.5), 0.5);
    c.beginPath(); c.moveTo(x + r, y + h - 0.5); c.lineTo(x + w - r, y + h - 0.5); c.stroke();
  }
  function sphere(c, x, y, R, base) {
    const g = c.createRadialGradient(x - R * 0.33, y - R * 0.35, R * 0.08, x, y, R);
    g.addColorStop(0, shade(base, 0.62));
    g.addColorStop(0.45, base);
    g.addColorStop(1, shade(base, -0.42));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = alpha(shade(base, 0.7), colors.dark ? 0.55 : 0.4);
    c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, Math.max(0.5, R - 0.5), Math.PI * 1.05, Math.PI * 1.65); c.stroke();
  }
  function contactShadow(c, x, y, rx, ry, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.save();
    c.translate(x, y); c.scale(1, ry / rx);
    c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // ---------- 不變的圖層：大樓的結構、各區域的底色 ----------
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const edge = shade(base, colors.dark ? -0.35 : -0.05);
    [L.bld, L.car, L.dial, L.fbd].forEach(function (R) {
      const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
      g.addColorStop(0, colors.dark ? shade(base, 0.03) : base);
      g.addColorStop(1, edge);
      c.fillStyle = g;
      roundRect(c, R.x, R.y, R.w, R.h, 8);
      c.fill();
    });
    drawBuildingStatic(c);
    drawCarUnder(c);
    drawDialFace(c);
    ovLayer = makeLayer(L.car.x, L.car.y, L.car.w, L.car.h, drawCarOver);
    personLayer = null;
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    [L.bld, L.car, L.dial, L.fbd].forEach(function (R) { roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8); c.stroke(); });
  }

  function drawBuildingStatic(c) {
    const R = L.bld, px = function (v) { return Math.round(v) + 0.5; };
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.clip();
    // 天空：上方帶一點點強調色
    const sky = c.createLinearGradient(0, R.y, 0, YB(0));
    sky.addColorStop(0, alpha(colors.accent, colors.dark ? 0.1 : 0.07));
    sky.addColorStop(1, alpha(colors.accent, 0));
    c.fillStyle = sky;
    c.fillRect(R.x, R.y, R.w, YB(0) - R.y);
    // 地面以下
    const gy = YB(0);
    const earth = c.createLinearGradient(0, gy, 0, R.y + R.h);
    earth.addColorStop(0, alpha(colors.equi, colors.dark ? 0.22 : 0.16));
    earth.addColorStop(1, alpha(colors.equi, colors.dark ? 0.08 : 0.06));
    c.fillStyle = earth;
    c.fillRect(R.x, gy, R.w, R.y + R.h - gy);
    // 大樓本體
    const wall = colors.dark ? shade(colors.surface, 0.06) : shade(colors.surface, -0.04);
    const x0 = L.bx0, x1 = L.bx1, top = YB(Y_ROOF);
    const bgG = c.createLinearGradient(x0, 0, x1, 0);
    bgG.addColorStop(0, shade(wall, colors.dark ? 0.08 : 0.03));
    bgG.addColorStop(1, shade(wall, colors.dark ? -0.15 : -0.08));
    c.fillStyle = bgG;
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.18) + ')';
    c.shadowBlur = 8; c.shadowOffsetY = 2;
    c.fillRect(x0, top, x1 - x0, gy - top);
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
    // 屋頂女兒牆
    c.fillStyle = shade(wall, colors.dark ? 0.12 : -0.12);
    c.fillRect(x0 - 2, top - 3, x1 - x0 + 4, 4);
    // 機房（電梯井正上方）
    const mtop = YB(Y_TOP);
    block(c, L.sx0 - 3, mtop, L.sx1 - L.sx0 + 6, top - mtop, 3, shade(colors.field, colors.dark ? -0.55 : 0.55), 0.12);
    // 每層樓：樓板、窗戶
    const winW = L.narrow ? 0.34 : 0.26;
    for (let n = 1; n <= E.FLOORS; n++) {
      const yf = E.floorY(n), ya = YB(yf + 3), yb = YB(yf);
      // 窗戶：亮燈與否用固定的樣式（不是物理量）
      const nW = L.narrow ? 1 : 2, span = L.sx0 - x0 - 8;
      for (let k = 0; k < nW; k++) {
        const ww = span * winW * (L.narrow ? 2 : 1.4), wx = x0 + 6 + k * (span / nW) + (span / nW - ww) / 2;
        const wy = ya + (yb - ya) * 0.25, wh = (yb - ya) * 0.5;
        const lit = ((n * 7 + k * 3) % 5) < 2;
        const wg = c.createLinearGradient(0, wy, 0, wy + wh);
        if (lit) {
          wg.addColorStop(0, alpha(colors.star, colors.dark ? 0.75 : 0.55));
          wg.addColorStop(1, alpha(colors.star, colors.dark ? 0.4 : 0.3));
        } else {
          wg.addColorStop(0, alpha(colors.neg, colors.dark ? 0.35 : 0.22));
          wg.addColorStop(1, alpha(colors.neg, colors.dark ? 0.15 : 0.1));
        }
        c.fillStyle = wg;
        roundRect(c, wx, wy, ww, wh, 1.5);
        c.fill();
      }
      // 樓板
      c.fillStyle = shade(wall, colors.dark ? 0.16 : -0.16);
      c.fillRect(x0, yb - 1.5, x1 - x0, 2);
    }
    c.fillStyle = shade(wall, colors.dark ? 0.16 : -0.16);
    c.fillRect(x0, top - 1, x1 - x0, 2);
    // 電梯井：較暗的通道，延伸到底坑
    const sx0 = L.sx0, sx1 = L.sx1;
    const sg = c.createLinearGradient(sx0, 0, sx1, 0);
    const shaftCol = colors.dark ? shade(colors['canvas-bg'], -0.3) : shade(colors.field, 0.72);
    sg.addColorStop(0, shade(shaftCol, -0.12));
    sg.addColorStop(0.5, shaftCol);
    sg.addColorStop(1, shade(shaftCol, -0.18));
    c.fillStyle = sg;
    c.fillRect(sx0, top, sx1 - sx0, YB(Y_BOT + 0.15) - top);
    // 導軌
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.28 : 0.22);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(px(sx0 + 1.5), top); c.lineTo(px(sx0 + 1.5), YB(Y_BOT + 0.15));
    c.moveTo(px(sx1 - 2.5), top); c.lineTo(px(sx1 - 2.5), YB(Y_BOT + 0.15));
    c.stroke();
    // 地平線
    c.strokeStyle = alpha(colors.text, 0.25);
    c.beginPath(); c.moveTo(R.x, px(gy)); c.lineTo(R.x + R.w, px(gy)); c.stroke();
    // 底坑緩衝器
    const bw = Math.max(3, (sx1 - sx0) * 0.14), byb = YB(Y_BOT + 0.15), byt = YB(Y_BOT + 0.9);
    [sx0 + (sx1 - sx0) * 0.28, sx0 + (sx1 - sx0) * 0.72].forEach(function (bx) {
      c.strokeStyle = alpha(colors.muted, 0.8);
      c.lineWidth = 1.2;
      c.beginPath();
      const nC = 4;
      for (let i = 0; i <= nC * 2; i++) {
        const yy = byb - (byb - byt) * i / (nC * 2);
        const xx = bx + (i % 2 ? bw / 2 : -bw / 2);
        if (i) c.lineTo(xx, yy); else c.moveTo(bx, yy);
      }
      c.stroke();
      c.fillStyle = shade(colors.muted, colors.dark ? -0.1 : 0.1);
      c.fillRect(bx - bw * 0.7, byt - 2, bw * 1.4, 2.5);
    });
    // 樓層標籤
    c.font = '600 ' + (L.narrow ? 10 : 11) + 'px system-ui, sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillStyle = colors.muted;
    for (let n = 1; n <= E.FLOORS; n++) {
      if (L.narrow && L.bk * 3 < 22 && n % 3 !== 1 && n !== 10) continue;
      c.fillText(floorName(n), L.bx0 - 4, YB(E.floorY(n) + 1.5));
    }
    c.restore();
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }
  let lastGraphAt = 0;
  /** 畫面重畫；動畫中（fromTick）圖表最多每秒約 30 次，減輕手機負擔 */
  function draw(fromTick) {
    if (!L) return;
    const st = cur(), p = P();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    drawBuilding(st, p);
    drawCar(st, p);
    drawDial(st, p);
    drawFBD(st, p);
    const now = performance.now();
    if (fromTick !== true || now - lastGraphAt > 30) { lastGraphAt = now; drawGraphs(); }
    updateReadout(st, p);
  }

  function hiddenNow() { return isHidden(S.run) && !S.run.ended; }

  // ---------- 大樓（動態部分） ----------
  function drawBuilding(st, p) {
    const R = L.bld;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, 8);
    ctx.clip();
    const sx0 = L.sx0, sx1 = L.sx1, scx = (sx0 + sx1) / 2;
    const carTop = YB(st.y + CEIL + 0.12), carBot = YB(st.y - 0.06);
    // 預測：纜繩在此刻斷裂、交給限速器時會停在哪裡
    if (S.cable === 'ok') {
      const yp = E.predictStop(st.y, st.v, p.vt, p.ab);
      const yy = YB(yp);
      ctx.strokeStyle = alpha(colors.pos, yp < -1e-6 ? 0.9 : 0.6);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      const yc = Math.round(Math.min(YB(Y_BOT), yy)) + 0.5;
      ctx.beginPath(); ctx.moveTo(sx0 - 3, yc); ctx.lineTo(sx1 + 3, yc); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 機房滑輪：轉動的角度 = 纜繩移動的距離 / 半徑（純畫面）
    const shR = Math.max(4, Math.min((sx1 - sx0) * 0.3, L.bk * 0.9));
    const shY = YB(Y_ROOF) - (YB(Y_ROOF) - YB(Y_TOP)) * 0.55;
    const rot = S.cable === 'ok' ? -st.y / (shR / L.bk) : (S.cutRot || 0);
    sheave(ctx, scx, shY, shR, rot);
    // 纜繩
    const ropeBase = shade(colors.muted, colors.dark ? 0.05 : -0.25), ropeLight = shade(colors.muted, colors.dark ? 0.5 : 0.4);
    if (S.cable === 'ok') {
      tube(ctx, [[scx, shY + shR * 0.2], [scx, carTop]], 1.8, ropeBase, ropeLight);
    } else {
      // 斷掉的纜繩：上方垂下一小段，車頂上留一小段
      const yCut = S.cutY != null ? YB(S.cutY) : carTop;
      const hang = Math.min(yCut - shY, 26);
      ctx.strokeStyle = ropeBase; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(scx, shY + shR * 0.2);
      ctx.quadraticCurveTo(scx + 5, shY + hang * 0.6, scx - 2, shY + hang);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(scx, carTop); ctx.quadraticCurveTo(scx + 6, carTop - 6, scx + 3, carTop - 11); ctx.stroke();
    }
    // 開門中的樓層：門縫透出光
    const door = doorOpen();
    if (door > 0 && S.doorFloor != null) {
      const yf = E.floorY(S.doorFloor), ya = YB(yf + 2.1), yb = YB(yf);
      ctx.fillStyle = alpha(colors.star, 0.55 * door);
      ctx.fillRect(sx0 - 3, ya, 3 + 2, yb - ya);
    }
    // 車廂：上亮下暗的金屬盒
    const cx0 = sx0 + 2.5, cx1 = sx1 - 2.5;
    ctx.fillStyle = 'rgba(0,0,0,' + (colors.dark ? 0.35 : 0.16) + ')';
    roundRect(ctx, cx0 - 1, carTop + 1, cx1 - cx0 + 2, carBot - carTop + 2, 3);
    ctx.fill();
    block(ctx, cx0, carTop, cx1 - cx0, carBot - carTop, 2, colors.dark ? shade(colors.field, -0.25) : shade(colors.field, 0.25), 0.25);
    // 車廂內的燈光
    const lg = ctx.createLinearGradient(0, carTop, 0, carBot);
    lg.addColorStop(0, alpha(colors.star, 0.6));
    lg.addColorStop(1, alpha(colors.star, 0.12));
    ctx.fillStyle = lg;
    ctx.fillRect(cx0 + 2, carTop + 2.5, cx1 - cx0 - 4, Math.max(2, (carBot - carTop) * 0.6));
    // 門的分隔線
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(cx0 + (cx1 - cx0) * 0.5) + 0.5, carTop + 2); ctx.lineTo(Math.round(cx0 + (cx1 - cx0) * 0.5) + 0.5, carBot - 1); ctx.stroke();
    // 目前樓層的標籤反白
    const f = E.floorOf(st.y);
    ctx.textAlign = 'right';
    pill(ctx, floorName(f.n), L.bx0 - 3, YB(E.floorY(f.n) + 1.5), colors.surface, '700 ' + (L.narrow ? 10 : 11) + 'px system-ui, sans-serif', 1, colors.accent);
    // 排隊中的樓層：亮燈的小點
    S.queue.concat(S.run && !S.run.ended && S.run.kind === 'trip' ? [S.run.toFloor] : []).forEach(function (n) {
      const yy = YB(E.floorY(n) + 1.5);
      ctx.fillStyle = colors.star;
      ctx.beginPath(); ctx.arc(L.bx0 + 4, yy, 2.6, 0, Math.PI * 2); ctx.fill();
    });
    // 短暫的視覺回饋（純裝飾，不影響物理）：斷纜的火花、煞車的火花
    const now = performance.now();
    S.fx.forEach(function (f) {
      const u = (now - f.t0) / f.dur;
      if (u < 0 || u > 1) return;
      if (f.type === 'snap' || f.type === 'spark') {
        const x = scx, y = f.type === 'snap' ? carTop : (carTop + carBot) / 2;
        ctx.strokeStyle = alpha(f.type === 'snap' ? colors.star : colors.pos, 0.9 * (1 - u));
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + 0.3, r0 = 3 + 10 * u, r1 = r0 + 5;
          const sx = f.type === 'spark' ? (i % 2 ? sx0 : sx1) : x;
          ctx.moveTo(sx + Math.cos(a) * r0, y + Math.sin(a) * r0);
          ctx.lineTo(sx + Math.cos(a) * r1, y + Math.sin(a) * r1);
        }
        ctx.stroke();
      }
    });
    ctx.restore();
  }
  function sheave(c, x, y, r, rot) {
    sphere(c, x, y, r, colors.dark ? shade(colors.muted, -0.2) : shade(colors.muted, 0.1));
    c.strokeStyle = alpha(colors['canvas-bg'], 0.75);
    c.lineWidth = 1;
    c.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = rot + k * Math.PI * 2 / 3;
      c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    }
    c.stroke();
  }
  /** 兩層線條的「管子」（纜繩、扶手）：底層粗而暗，上層細而亮 */
  function tube(c, pts, w, base, light) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = base;
    c.lineWidth = w;
    c.beginPath();
    pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    c.stroke();
    if (!light) return;
    const vert = pts.length > 1 && Math.abs(pts[1][0] - pts[0][0]) < Math.abs(pts[1][1] - pts[0][1]);
    c.strokeStyle = light;
    c.lineWidth = Math.max(0.6, w * 0.36);
    c.beginPath();
    pts.forEach(function (p, i) {
      const x = p[0] - (vert ? w * 0.22 : 0), y = p[1] - (vert ? 0 : w * 0.22);
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    });
    c.stroke();
  }
  /** 開門程度 0–1（純畫面） */
  function doorOpen() {
    if (S.dwellUntil == null || S.doorFloor == null) return 0;
    const a = S.t - S.doorT0, b = S.dwellUntil - S.t;
    return Math.max(0, Math.min(1, a / 0.35, b / 0.35));
  }

  // ---------- 快取的圖層（只在版面、主題或質量改變時重畫） ----------
  /** 在離屏 canvas 畫一塊區域（使用與主畫布相同的座標），之後每幀只要貼上 */
  function makeLayer(x, y, w, h, fn) {
    x = Math.floor(x); y = Math.floor(y); w = Math.ceil(w) + 1; h = Math.ceil(h) + 1;
    const cnv = document.createElement('canvas');
    cnv.width = Math.max(1, Math.round(w * dpr));
    cnv.height = Math.max(1, Math.round(h * dpr));
    const c = cnv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
    fn(c);
    return { cnv: cnv, x: x, y: y, w: w, h: h };
  }
  function blit(ly) { if (ly) ctx.drawImage(ly.cnv, ly.x, ly.y, ly.w, ly.h); }
  let ovLayer = null, personLayer = null, personKey = '';
  function glassRect() { return { x0: XI(L.wM * 0.06), x1: XI(L.wM * 0.94), z0: ZI(CEIL - 0.12), z1: ZI(0.18) }; }
  function carMetal() { return colors.dark ? shade(colors.field, -0.62) : shade(colors.field, 0.8); }

  /** 車廂的底層（畫在 bg）：後牆、側牆、天花板、地板 */
  function drawCarUnder(c) {
    const R = L.car, k = L.ik, wM = L.wM;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.clip();
    const xl = XI(0), xr = XI(wM), zf = ZI(0), zc = ZI(CEIL);
    const metal = carMetal();
    // 牆板（金屬拉絲感）
    const wallG = c.createLinearGradient(xl, 0, xr, 0);
    wallG.addColorStop(0, shade(metal, -0.08));
    wallG.addColorStop(0.5, shade(metal, 0.05));
    wallG.addColorStop(1, shade(metal, -0.1));
    c.fillStyle = wallG;
    c.fillRect(xl, zc, xr - xl, zf - zc);
    // 側牆的透視（加深的窄條）
    const side = Math.max(6, R.w * 0.03);
    [[xl, 1], [xr, -1]].forEach(function (sd) {
      const x = sd[0], dir = sd[1];
      const sg = c.createLinearGradient(x, 0, x + dir * side, 0);
      sg.addColorStop(0, alpha('#000000', colors.dark ? 0.35 : 0.16));
      sg.addColorStop(1, alpha('#000000', 0));
      c.fillStyle = sg;
      c.fillRect(Math.min(x, x + dir * side), zc, side, zf - zc);
    });
    // 天花板與燈條
    const ceilG = c.createLinearGradient(0, R.y, 0, zc);
    ceilG.addColorStop(0, shade(metal, -0.2));
    ceilG.addColorStop(1, shade(metal, -0.05));
    c.fillStyle = ceilG;
    c.fillRect(R.x, R.y, R.w, zc - R.y);
    c.fillStyle = alpha('#ffffff', colors.dark ? 0.55 : 0.9);
    roundRect(c, XI(wM * 0.25), zc - 3, XI(wM * 0.75) - XI(wM * 0.25), 3, 1.5);
    c.fill();
    // 地板（透視的地板條）
    const fz = c.createLinearGradient(0, zf, 0, R.y + R.h);
    fz.addColorStop(0, shade(colors.field, colors.dark ? -0.45 : 0.35));
    fz.addColorStop(1, shade(colors.field, colors.dark ? -0.6 : 0.15));
    c.fillStyle = fz;
    c.fillRect(R.x, zf, R.w, R.y + R.h - zf);
    c.strokeStyle = alpha('#ffffff', colors.dark ? 0.1 : 0.35);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(R.x, Math.round(zf) + 0.5); c.lineTo(R.x + R.w, Math.round(zf) + 0.5); c.stroke();
    c.restore();
  }
  /** 車廂的上層（玻璃之上）：燈光、玻璃反光與外框、扶手、彈簧秤的掛鉤座與刻度尺 */
  function drawCarOver(c) {
    const R = L.car, k = L.ik, wM = L.wM, g = glassRect(), zc = ZI(CEIL);
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.clip();
    const lamp = c.createLinearGradient(0, zc, 0, zc + 0.5 * k);
    lamp.addColorStop(0, alpha(colors.star, colors.dark ? 0.3 : 0.22));
    lamp.addColorStop(1, alpha(colors.star, 0));
    c.fillStyle = lamp;
    c.fillRect(XI(wM * 0.2), zc, XI(wM * 0.8) - XI(wM * 0.2), 0.5 * k);
    // 玻璃反光
    c.save();
    roundRect(c, g.x0, g.z0, g.x1 - g.x0, g.z1 - g.z0, 4);
    c.clip();
    const gl = c.createLinearGradient(g.x0, g.z0, g.x1, g.z1);
    gl.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.06 : 0.25) + ')');
    gl.addColorStop(0.35, 'rgba(255,255,255,0)');
    gl.addColorStop(0.6, 'rgba(255,255,255,0)');
    gl.addColorStop(0.7, 'rgba(255,255,255,' + (colors.dark ? 0.04 : 0.14) + ')');
    gl.addColorStop(0.8, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.fillRect(g.x0, g.z0, g.x1 - g.x0, g.z1 - g.z0);
    c.restore();
    c.strokeStyle = alpha(colors.text, 0.25);
    c.lineWidth = 1.5;
    roundRect(c, g.x0, g.z0, g.x1 - g.x0, g.z1 - g.z0, 4);
    c.stroke();
    // 扶手
    const hz = ZI(0.95);
    tube(c, [[g.x0 - 2, hz], [g.x1 + 2, hz]], 4, shade(colors.muted, colors.dark ? -0.1 : 0), shade(colors.muted, 0.6));
    // 彈簧秤：掛鉤座與刻度尺（0 對準彈簧原長的末端，每 5 N 一格）
    const X = XI(L.xs), zZero = CEIL - 0.05 - SPRING_L0;
    block(c, X - 0.05 * k, ZI(CEIL), 0.1 * k, 0.04 * k, 2, colors.muted, 0.2);
    const sr = springRuler();
    const zR0 = zZero + 0.03, zR1 = zZero - RULER_N / E.K_SPRING - 0.03;
    block(c, sr.rx, ZI(zR0), sr.rw, (zR0 - zR1) * k, 3, colors.dark ? shade(colors.surface, 0.2) : shade(colors.surface, -0.02), 0.15);
    c.strokeStyle = alpha(colors.text, 0.6);
    c.lineWidth = 1;
    c.font = (L.narrow ? 9 : 10) + 'px system-ui, sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillStyle = colors.muted;
    c.beginPath();
    for (let n = 0; n <= RULER_N; n += 5) {
      const yy = Math.round(ZI(zZero - n / E.K_SPRING)) + 0.5;
      const major = n % 10 === 0;
      c.moveTo(sr.rx, yy); c.lineTo(sr.rx + (major ? 6 : 3.5), yy);
      if (major) c.fillText(String(n), sr.rx + sr.rw - 2, yy);
    }
    c.stroke();
    c.textAlign = 'center';
    c.fillText('N', sr.rx + sr.rw / 2, ZI(zR1) + 8);
    c.restore();
  }
  function springRuler() {
    const k = L.ik, X = XI(L.xs);
    return { rx: X + Math.max(0.12 * k, 16), rw: Math.max(16, 0.11 * k) };
  }

  // ---------- 車廂內部（依比例） ----------
  function drawCar(st, p) {
    const R = L.car;
    const k = L.ik;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, 8);
    ctx.clip();
    // 後牆的玻璃：看出去是電梯井的牆，隨電梯上下捲動（相對運動，依比例）
    const g = glassRect(), gx0 = g.x0, gx1 = g.x1, gz0 = g.z0, gz1 = g.z1;
    ctx.save();
    roundRect(ctx, gx0, gz0, gx1 - gx0, gz1 - gz0, 4);
    ctx.clip();
    const shaftCol = colors.dark ? shade(colors['canvas-bg'], -0.25) : shade(colors.field, 0.68);
    ctx.fillStyle = shaftCol;
    ctx.fillRect(gx0, gz0, gx1 - gx0, gz1 - gz0);
    // 混凝土的縱向接縫
    ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.07 : 0.06);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = gx0 + 18; x < gx1; x += 36) { ctx.moveTo(Math.round(x) + 0.5, gz0); ctx.lineTo(Math.round(x) + 0.5, gz1); }
    ctx.stroke();
    // 導軌與每 1.5 m 一個的固定架（隨電梯捲動，看得出速度）
    const railX = gx0 + Math.max(10, (gx1 - gx0) * 0.08);
    ctx.fillStyle = alpha(colors.text, colors.dark ? 0.2 : 0.16);
    ctx.fillRect(railX - 2, gz0, 4, gz1 - gz0);
    const zT = (gz0 - ZI(0)) / -k, zB = (gz1 - ZI(0)) / -k; // 玻璃上下緣對應的車廂內高度
    for (let yb = Math.floor((st.y + zB) / 1.5) * 1.5; yb <= st.y + zT + 1.5; yb += 1.5) {
      const yy = ZI(yb - st.y);
      ctx.fillStyle = alpha(colors.text, colors.dark ? 0.28 : 0.22);
      ctx.fillRect(railX - 7, yy - 2, 14, 4);
      ctx.fillStyle = alpha(colors.text, colors.dark ? 0.12 : 0.1);
      ctx.fillRect(railX + 7, yy - 1, (gx1 - gx0) * 0.05, 2);
    }
    // 每層的樓板與樓層編號（電梯往上，這些往下捲）
    const slabTop = shade(shaftCol, colors.dark ? 0.2 : -0.2), slabBody = shade(shaftCol, colors.dark ? 0.08 : -0.08);
    for (let n = 0; n <= E.FLOORS + 1; n++) {
      const z = E.floorY(n) - st.y; // 這一層樓板相對車廂地板的高度
      if (z < zB - 3.2 || z > zT + 0.6) continue;
      const yy = ZI(z);
      ctx.fillStyle = slabBody;
      ctx.fillRect(gx0, yy, gx1 - gx0, 0.3 * k);
      ctx.fillStyle = slabTop;
      ctx.fillRect(gx0, yy, gx1 - gx0, Math.max(2, 0.06 * k));
      if (n >= 1 && n <= E.FLOORS) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '800 ' + Math.round(Math.max(13, Math.min(30, 0.22 * k))) + 'px system-ui, sans-serif';
        ctx.fillStyle = alpha(colors.text, colors.dark ? 0.22 : 0.2);
        ctx.fillText(floorName(n), gx1 - 8, ZI(z + 1.3));
      }
    }
    ctx.restore();
    blit(ovLayer);
    drawSpringScale(st, p);
    drawPersonCached(p);
    drawBall(st);
    drawCarHud(st, p);
    ctx.restore();
  }

  /** 樓層顯示器、v 與 a 的小儀表、目前的狀態 */
  function drawCarHud(st, p) {
    const R = L.car, f = E.floorOf(st.y);
    const hide = hiddenNow();
    // 樓層顯示器（掛在天花板下）
    const fs = L.narrow ? 13 : 15;
    const txt = floorName(f.n);
    const dirTxt = Math.abs(st.v) < 1e-6 ? '' : st.v > 0 ? '▲' : '▼';
    ctx.font = '700 ' + fs + 'px ui-monospace, Menlo, Consolas, monospace';
    const tw = ctx.measureText('▲ 10F').width + 14;
    const cx = R.x + 10 + tw / 2, cy = ZI(CEIL) + fs * 0.95;
    ctx.fillStyle = colors.dark ? '#0b0f10' : '#1d2427';
    roundRect(ctx, cx - tw / 2, cy - fs * 0.78, tw, fs * 1.56, 5);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ledTxt = (dirTxt ? dirTxt + ' ' : '') + txt;
    ctx.strokeStyle = alpha(colors.star, 0.28);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(ledTxt, cx, cy + 1);
    ctx.fillStyle = colors.dark ? colors.star : '#ffc93c';
    ctx.fillText(ledTxt, cx, cy + 1);
    S.fx.forEach(function (fx) {
      if (fx.type !== 'arrive') return;
      const u = (performance.now() - fx.t0) / fx.dur;
      if (u < 0 || u > 1) return;
      ctx.strokeStyle = alpha(colors.star, 0.8 * (1 - u));
      ctx.lineWidth = 2;
      roundRect(ctx, cx - tw / 2 - 3 - 6 * u, cy - fs * 0.78 - 3 - 6 * u, tw + 6 + 12 * u, fs * 1.56 + 6 + 12 * u, 7);
      ctx.stroke();
    });
    // 左上角一欄：狀態（超重／失重…）、v、a；寬度不超過彈簧秤左側
    const ph = E.phaseOf(st.a);
    const pc = phaseColor(ph);
    const x0 = R.x + 8, colW = XI(L.xs) - 0.07 * L.ik - x0 - 6;
    const rowH = L.narrow ? 17 : 22;
    let y0 = cy + fs * 0.78 + rowH * 0.62;
    const phLong = phaseName(ph) + (ph === 'normal' ? T('：視重 = 實重', ': reading = true weight') : ph === 'over' ? T('：視重 > 實重', ': reading > true weight')
      : ph === 'under' ? T('：視重 < 實重', ': reading < true weight') : T('：視重 = 0', ': reading = 0'));
    const phSize = L.narrow ? 11 : 13;
    let phFont = '700 ' + phSize + 'px system-ui, sans-serif';
    let phT = phLong;
    if (textW(ctx, phLong, phFont) + 10 > colW) {
      phFont = fitFont(ctx, phLong, colW, phSize, 700);
      if (parseFloat(phFont.split(' ')[1]) < 10) { phT = phaseName(ph); phFont = fitFont(ctx, phT, colW, phSize, 700); }
    }
    ctx.textAlign = 'left';
    pill(ctx, phT, x0 + 2, y0, ph === 'normal' ? colors.text : shade(pc, colors.dark ? 0.1 : -0.15), phFont, 0.9);
    y0 += rowH;
    // v 與 a 的小儀表：箭頭方向與相對大小；神秘電梯時遮住
    const rows = [
      { lab: 'v', v: st.v, unit: 'm/s', col: colors.probe, max: 10 },
      { lab: 'a', v: st.a, unit: 'm/s²', col: colors.equi, max: 10 }
    ];
    const f2 = fitFont(ctx, 'a = +10.00 m/s²', colW - 14, L.narrow ? 11 : 12, 600);
    rows.forEach(function (r, i) {
      const yy = y0 + i * rowH;
      const t = hide ? r.lab + ' = ?' : r.lab + ' = ' + signed(r.v, 2) + ' ' + r.unit;
      ctx.textAlign = 'left';
      const box = pill(ctx, t, x0 + 16, yy, shade(r.col, colors.dark ? 0.1 : -0.2), f2, 0.8);
      // 小箭頭：長度 ∝ 大小（最多 9 px）
      if (!hide && Math.abs(r.v) > 1e-6) {
        const len = 4 + 7 * Math.min(1, Math.abs(r.v) / r.max);
        const yA = yy + (r.v > 0 ? len / 2 : -len / 2);
        arrow(ctx, box.x - 5, yA, 0, r.v > 0 ? -1 : 1, len, 1.6, r.col, false);
      } else if (!hide) {
        ctx.fillStyle = r.col;
        ctx.beginPath(); ctx.arc(box.x - 5, yy, 2, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  /** 人（含體重計）畫成快取的小圖，只有質量、主題或版面改變時重畫 */
  function drawPersonCached(p) {
    const key = [p.m, cw, dpr, colors.accent, colors.dark].join('|');
    if (!personLayer || key !== personKey) {
      personKey = key;
      const x0 = XI(L.xp - 0.42), x1 = XI(L.xp + 0.5), y0 = ZI(1.9), y1 = ZI(-0.08);
      personLayer = makeLayer(x0, y0, x1 - x0, y1 - y0, function (c) { drawPerson(c, p); });
    }
    blit(personLayer);
  }
  /** 人：站在體重計上，右手拿著小球 */
  function drawPerson(ctx, p) {
    const k = L.ik, xp = L.xp;
    const X = function (x) { return XI(xp + x); };
    const s = Math.sqrt(p.m / 60); // 身材隨質量略變胖瘦（只影響外觀）
    const z0 = 0.07; // 秤面高度
    // 體重計
    const sw = 0.36, sh = 0.07;
    contactShadow(ctx, X(0), ZI(0) + 1, sw * 0.62 * k, 0.05 * k, colors.dark ? 0.5 : 0.28);
    block(ctx, X(-sw / 2), ZI(sh), sw * k, sh * k, Math.min(6, 0.025 * k), colors.dark ? shade(colors.surface, 0.25) : shade(colors.surface, -0.06), 0.2);
    // 秤面的小視窗（顯示讀數的位置）
    ctx.fillStyle = colors.dark ? '#0b0f10' : '#1d2427';
    roundRect(ctx, X(-0.06), ZI(sh) + 0.012 * k, 0.12 * k, 0.03 * k, 2);
    ctx.fill();
    const shoe = colors.dark ? shade(colors.field, -0.7) : shade(colors.field, -0.2);
    const pants = colors.dark ? shade(colors.neg, -0.45) : shade(colors.neg, -0.35);
    const shirt = colors.accent;
    const skin = mix(colors.equi, '#ffffff', 0.55);
    const hair = colors.dark ? shade(colors.field, -0.75) : shade(colors.field, -0.25);
    const legW = 0.09 * s, hipW = 0.3 * s;
    // 腿
    [-1, 1].forEach(function (sd) {
      const lx = sd * hipW * 0.27;
      block(ctx, X(lx - legW / 2), ZI(0.88), legW * k, (0.88 - z0 - 0.04) * k, legW * k * 0.4, pants, 0.12);
      block(ctx, X(lx - legW / 2 - 0.01), ZI(z0 + 0.05), (legW + 0.06) * k, 0.05 * k, 0.02 * k, shoe, 0.25);
    });
    // 身體
    block(ctx, X(-hipW / 2), ZI(1.46), hipW * k, (1.46 - 0.84) * k, 0.07 * k, shirt, 0.18);
    // 左手（自然下垂）
    block(ctx, X(-hipW / 2 - 0.07), ZI(1.42), 0.075 * k, 0.55 * k, 0.035 * k, shade(shirt, -0.08), 0.14);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(X(-hipW / 2 - 0.033), ZI(0.85), 0.042 * k, 0, Math.PI * 2); ctx.fill();
    // 脖子與頭
    ctx.fillStyle = shade(skin, -0.08);
    ctx.fillRect(X(-0.035), ZI(1.53), 0.07 * k, 0.08 * k);
    const hx = X(0), hy = ZI(1.64), hr = 0.115 * k;
    const hg = ctx.createRadialGradient(hx - hr * 0.35, hy - hr * 0.4, hr * 0.1, hx, hy, hr);
    hg.addColorStop(0, shade(skin, 0.35));
    hg.addColorStop(1, shade(skin, -0.18));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.arc(hx, hy - hr * 0.1, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    // 眼睛（看向小球）
    ctx.fillStyle = colors.dark ? '#111' : '#222';
    ctx.beginPath(); ctx.arc(hx + hr * 0.42, hy + hr * 0.05, Math.max(1, hr * 0.09), 0, Math.PI * 2); ctx.fill();
    // 右手：伸向前方拿球（手在 ball 上方）
    const shX = X(hipW * 0.32), shY = ZI(1.38);
    const handX = XI(xp + 0.36), handY = ZI(HB + 2 * BALL_R + 0.03);
    ctx.strokeStyle = shade(shirt, 0.06);
    ctx.lineWidth = 0.075 * k;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.quadraticCurveTo(shX + 0.16 * k, shY + 0.02 * k, handX - 0.02 * k, handY - 0.02 * k); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(handX, handY, 0.04 * k, 0, Math.PI * 2); ctx.fill();
  }

  /** 小球：在手中、空中或地板上 */
  function ballZ(st) {
    if (S.ball.st === 'hand') return HB;
    if (S.ball.st === 'floor') return 0;
    return Math.max(0, E.ballHeight(S.track, S.ball, S.t));
  }
  function drawBall(st) {
    const z = ballZ(st), k = L.ik;
    const x = XI(L.xp + 0.36), y = ZI(z + BALL_R), r = BALL_R * k;
    // 地板上的影子（越高越淡）
    contactShadow(ctx, x, ZI(0) + 1, r * (1.1 + z * 0.4), r * 0.35, Math.max(0.05, (colors.dark ? 0.45 : 0.3) * (1 - z / 2)));
    sphere(ctx, x, y, r, colors.pos);
    // 放開的高度 h（虛線標示）
    if (S.ball.st !== 'hand') {
      ctx.strokeStyle = alpha(colors.muted, 0.6);
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      const xr = x + r + 8;
      ctx.beginPath(); ctx.moveTo(xr, ZI(HB)); ctx.lineTo(xr, ZI(0)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(xr - 3, ZI(HB) + 0.5); ctx.lineTo(xr + 3, ZI(HB) + 0.5); ctx.stroke();
      ctx.textAlign = 'left';
      pill(ctx, 'h = ' + num(HB, 2) + ' m', xr + 4, ZI(HB * 0.55), colors.muted, '600 ' + (L.narrow ? 10 : 11) + 'px system-ui, sans-serif', 0.75);
    }
    if (S.ball.st === 'floor' && S.ball.result) {
      ctx.textAlign = 'center';
      pill(ctx, 't = ' + num(S.ball.result.t, 3) + ' s', x, ZI(0.32), colors.pos, '700 ' + (L.narrow ? 11 : 12) + 'px system-ui, sans-serif', 0.85);
    }
    // 落地的波紋（純裝飾）
    S.fx.forEach(function (f) {
      if (f.type !== 'land') return;
      const u = (performance.now() - f.t0) / f.dur;
      if (u < 0 || u > 1) return;
      ctx.strokeStyle = alpha(colors.pos, 0.5 * (1 - u));
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, ZI(0), r * (1 + 2.5 * u), r * 0.35 * (1 + 2.5 * u), 0, 0, Math.PI * 2); ctx.stroke();
    });
  }

  /** 彈簧秤：天花板的掛鉤、彈簧（伸長量 x = T/k，依比例）、刻度尺（N）、吊掛的物體 */
  function drawSpringScale(st, p) {
    const k = L.ik, xs = L.xs;
    const Ts = E.springTension(p.ms, st.a), ext = E.springExtension(Ts);
    const zTop = CEIL - 0.05, zZero = zTop - SPRING_L0, zEnd = zZero - ext;
    const X = XI(xs);
    const rx = springRuler().rx;
    // 彈簧：前後圈明暗交替
    const coils = 12, sw = 0.045 * k;
    const yA = ZI(zTop), yB = ZI(zEnd);
    const back = shade(colors.muted, colors.dark ? -0.25 : -0.05), front = shade(colors.muted, colors.dark ? 0.35 : -0.35);
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? front : back;
      ctx.lineWidth = pass ? 1.8 : 1.4;
      ctx.beginPath();
      for (let i = 0; i < coils; i++) {
        const ya = yA + (yB - yA) * (i / coils), yb = yA + (yB - yA) * ((i + 0.5) / coils), yc = yA + (yB - yA) * ((i + 1) / coils);
        if (pass === 0) { ctx.moveTo(X + sw, yb); ctx.lineTo(X - sw, yc); }
        else { ctx.moveTo(X - sw, ya); ctx.lineTo(X + sw, yb); }
      }
      ctx.stroke();
    }
    // 指針：彈簧末端，指向刻度
    ctx.strokeStyle = colors.pos;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X, yB); ctx.lineTo(rx + 7, yB); ctx.stroke();
    // 掛鉤與物體
    const blockH = 0.08 + 0.04 * p.ms, blockW = 0.13 + 0.035 * p.ms;
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(X, yB); ctx.lineTo(X, ZI(zEnd - 0.05)); ctx.stroke();
    const by = ZI(zEnd - 0.05);
    block(ctx, X - blockW / 2 * k, by, blockW * k, blockH * k, 3, colors.equi, 0.25);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let mt = fmtSlider(p.ms, elMs) + ' kg';
    ctx.font = fitFont(ctx, mt, blockW * k + 8, L.narrow ? 9 : 10, 700);
    if (ctx.measureText(mt).width > blockW * k + 2) { mt = fmtSlider(p.ms, elMs); ctx.font = fitFont(ctx, mt, blockW * k + 8, L.narrow ? 9 : 10, 700); }
    ctx.fillStyle = shade(colors.equi, colors.dark ? -0.7 : 0.85);
    ctx.fillText(mt, X, by + blockH * k / 2 + 0.5);
    // 讀數標籤：天花板下、彈簧左側
    ctx.textAlign = 'right';
    pill(ctx, 'T = ' + num(Ts, 1) + ' N', X - 0.06 * k, ZI(CEIL) + (L.narrow ? 13 : 15) * 0.95, colors.text, '600 ' + (L.narrow ? 10 : 11) + 'px system-ui, sans-serif', 0.85);
  }

  // ---------- 體重計刻度盤 ----------
  function dialAng(v) { return (135 + 270 * Math.max(0, Math.min(DIAL_MAX, v)) / DIAL_MAX) * Math.PI / 180; }
  function dialGeom() {
    const R = L.dial;
    const r = Math.min(R.w * 0.4, (R.h - 34) / 2.18);
    return { r: r, cx: R.x + R.w / 2, cy: R.y + 26 + r * 1.1 };
  }
  /** 刻度盤不變的部分（畫在 bg）：標題、金屬環、盤面、刻度、數字、單位 */
  function drawDialFace(c) {
    const R = L.dial, d = dialGeom(), r = d.r, cx = d.cx, cy = d.cy;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8);
    c.clip();
    c.textAlign = 'left';
    pill(c, T('體重計讀數', 'Scale reading'), R.x + 8, R.y + 13, colors.muted, '700 ' + (L.narrow ? 11 : 12) + 'px system-ui, sans-serif', 0.7);
    // 外框（金屬環）與盤面
    c.fillStyle = 'rgba(0,0,0,' + (colors.dark ? 0.35 : 0.12) + ')';
    c.beginPath(); c.arc(cx + 1, cy + 2.5, r * 1.08, 0, Math.PI * 2); c.fill();
    const ring = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ring.addColorStop(0, shade(colors.muted, colors.dark ? 0.2 : 0.6));
    ring.addColorStop(1, shade(colors.muted, colors.dark ? -0.45 : -0.2));
    c.fillStyle = ring;
    c.beginPath(); c.arc(cx, cy, r * 1.08, 0, Math.PI * 2); c.fill();
    const face = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    face.addColorStop(0, colors.dark ? shade(colors.surface, 0.12) : '#ffffff');
    face.addColorStop(1, colors.dark ? shade(colors.surface, -0.2) : shade(colors.surface, -0.06));
    c.fillStyle = face;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    // 刻度：每 5 kgw 一小格、每 20 kgw 一大格
    c.strokeStyle = alpha(colors.text, 0.75);
    c.lineCap = 'butt';
    for (let v = 0; v <= DIAL_MAX; v += 5) {
      const a = dialAng(v), major = v % 20 === 0, mid = v % 10 === 0;
      const r0 = r * (major ? 0.84 : mid ? 0.88 : 0.91), r1 = r * 0.96;
      c.lineWidth = major ? 1.6 : 1;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
    }
    c.fillStyle = colors.text;
    c.font = '600 ' + Math.round(Math.max(9, Math.min(12, r * 0.13))) + 'px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const labStep = r < 70 ? 40 : 20;
    for (let v = 0; v <= DIAL_MAX; v += labStep) {
      const a = dialAng(v), rr = (v === 0 || v === DIAL_MAX) ? 0.74 : 0.69;
      c.fillText(String(v), cx + Math.cos(a) * r * rr, cy + Math.sin(a) * r * rr);
    }
    c.font = '600 ' + Math.round(Math.max(9, Math.min(12, r * 0.12))) + 'px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    c.fillText('kgw', cx, cy + r * 0.5);
    c.restore();
  }
  function drawDial(st, p) {
    const R = L.dial, d = dialGeom(), r = d.r, cx = d.cx, cy = d.cy;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, 8);
    ctx.clip();
    const reading = E.reading(p.m, st.a), N = E.normalForce(p.m, st.a);
    // 讀數與實重之間的色弧（超重橘、失重藍綠、完全失重紫）
    const ph = E.phaseOf(st.a);
    if (ph !== 'normal') {
      ctx.strokeStyle = alpha(phaseColor(ph), 0.55);
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      const a1 = dialAng(p.m), a2 = dialAng(reading);
      ctx.arc(cx, cy, r * 0.78, Math.min(a1, a2), Math.max(a1, a2));
      ctx.stroke();
    }
    // 實重的記號
    const am = dialAng(p.m);
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(am) * r * 1.0, cy + Math.sin(am) * r * 1.0);
    ctx.lineTo(cx + Math.cos(am - 0.06) * r * 1.13, cy + Math.sin(am - 0.06) * r * 1.13);
    ctx.lineTo(cx + Math.cos(am + 0.06) * r * 1.13, cy + Math.sin(am + 0.06) * r * 1.13);
    ctx.closePath();
    ctx.fill();
    // 數位讀數
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fitFont(ctx, '000.0', r * 1.0, Math.round(Math.max(14, Math.min(22, r * 0.26))), 800);
    ctx.fillStyle = ph === 'normal' ? colors.text : shade(phaseColor(ph), colors.dark ? 0.15 : -0.2);
    ctx.fillText(num(reading, 1), cx, cy + r * 0.25);
    // 指針（影子用偏移的半透明線條，不用 shadowBlur）
    const an = dialAng(reading);
    const nx0 = cx - Math.cos(an) * r * 0.15, ny0 = cy - Math.sin(an) * r * 0.15;
    const nx1 = cx + Math.cos(an) * r * 0.86, ny1 = cy + Math.sin(an) * r * 0.86;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,' + (colors.dark ? 0.45 : 0.18) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(nx0 + 1, ny0 + 2); ctx.lineTo(nx1 + 1, ny1 + 2); ctx.stroke();
    ctx.strokeStyle = colors.pos;
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(nx0, ny0); ctx.lineTo(nx1, ny1); ctx.stroke();
    sphere(ctx, cx, cy, Math.max(3.5, r * 0.07), colors.muted);
    // 刻度盤下方：正向力 N
    ctx.textAlign = 'center';
    const below = R.y + R.h - (cy + r * 1.08) > 30;
    pill(ctx, 'N = ' + num(N, 1) + ' N', cx, below ? cy + r * 1.08 + 16 : cy + r * 0.86, colors.muted,
      fitFont(ctx, 'N = 0000.0 N', below ? R.w - 12 : r * 1.3, L.narrow ? 10 : 11, 600), 0.85);
    ctx.restore();
  }

  // ---------- 受力圖：人與體重計分開畫 ----------
  function drawFBD(st, p) {
    const R = L.fbd;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, 8);
    ctx.clip();
    const narrow = L.narrow;
    const F = E.forces(p.m, st.a);
    const N = F.normal, W = -F.weight, net = F.net;
    const hide = hiddenNow();
    // 比例尺（右上角）
    const lineH = narrow ? 17 : 19;
    const bandTop = R.y + R.h - 8 - 2 * lineH;     // 下方兩行說明
    const top = R.y + 44, bot = bandTop - 14;
    const bs = Math.max(28, Math.min(40, R.w * 0.15));
    const cy = Math.round((top + bot) / 2);
    const Lmax = (bot - top - bs) / 2;              // 方塊上下各可用的長度
    const sF = Lmax / F_REF;                        // px/N（固定比例）
    const barL = 500 * sF;
    ctx.textAlign = 'left';
    const title = T('受力圖（人與秤分開畫）', 'Free-body diagrams');
    pill(ctx, title, R.x + 8, R.y + 13, colors.muted, fitFont(ctx, title, R.w - barL - 52, narrow ? 11 : 12, 700), 0.7);
    const bx = R.x + R.w - 10 - barL, byy = R.y + 13;
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 2;
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(bx, byy); ctx.lineTo(bx + barL, byy); ctx.moveTo(bx, byy - 3); ctx.lineTo(bx, byy + 3); ctx.moveTo(bx + barL, byy - 3); ctx.lineTo(bx + barL, byy + 3); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = (narrow ? 9 : 10) + 'px system-ui, sans-serif';
    ctx.fillStyle = colors.muted;
    ctx.fillText('500 N', bx + barL / 2, byy + 5);
    const lw = narrow ? 2.4 : 2.8;
    const fl = '700 ' + (narrow ? 10 : 11) + 'px system-ui, sans-serif';
    /** 由 (x, y) 沿 dir（−1 向上、+1 向下）畫大小 F 的力，傳回箭頭尖端 */
    function vec(x, y, Fm, dir, col) {
      const len = Math.abs(Fm) * sF, broken = len > Lmax + 0.5;
      const l = Math.min(len, Lmax);
      arrow(ctx, x, y, 0, dir, l, lw, col, broken);
      return { x: x, y: y + dir * l, broken: broken };
    }
    /** 箭頭尖端的標籤：置中，但不超出面板 */
    function tipLabel(text, tip, dir, col) {
      const w = textW(ctx, text, fl) + 10;
      const x = Math.max(R.x + 4 + w / 2, Math.min(R.x + R.w - 4 - w / 2, tip.x));
      ctx.textAlign = 'center';
      return pill(ctx, text, x, tip.y + dir * 9, col, fl, 0.88);
    }
    const sw = Math.max(36, Math.min(56, R.w * 0.22)), shh = narrow ? 15 : 17;
    const xp = Math.round(R.x + R.w * 0.34), xs = Math.round(Math.min(R.x + R.w * 0.8, R.x + R.w - sw / 2 - 8));
    // 人：方塊，N 由上緣向上、mg 由下緣向下
    block(ctx, xp - bs / 2, cy - bs / 2, bs, bs, 6, colors.accent, 0.25);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + (narrow ? 12 : 13) + 'px system-ui, sans-serif';
    ctx.fillStyle = colors.surface;
    ctx.fillText(T('人', 'You'), xp, cy + 0.5);
    const tipN = vec(xp, cy - bs / 2, N, -1, colors.neg);
    const tipW = vec(xp, cy + bs / 2, W, 1, colors.pos);
    // 合力 = ma（細一點、畫在方塊右邊；不是另外一個力）
    const xn = xp + bs / 2 + (narrow ? 11 : 14);
    if (Math.abs(net) > 1e-6) {
      const len = Math.min(Math.abs(net) * sF, Lmax + bs / 2);
      arrow(ctx, xn, cy, 0, net > 0 ? -1 : 1, len, lw * 0.7, colors.accent, Math.abs(net) * sF > Lmax + bs / 2 + 0.5);
      ctx.textAlign = 'left';
      const t = hide ? T('合力 ?', 'net ?') : T('合力 ma', 'net ma');
      pill(ctx, t, xn + 5, cy + (net > 0 ? -1 : 1) * Math.max(9, len * 0.55), shade(colors.accent, colors.dark ? 0.1 : -0.1), fitFont(ctx, t, xs - sw / 2 - xn - 8, narrow ? 9.5 : 10.5, 600), 0.85);
    } else {
      ctx.textAlign = 'left';
      const t = T('合力 0', 'net 0');
      pill(ctx, t, xn - 2, cy, colors.muted, fitFont(ctx, t, xs - sw / 2 - xn - 4, narrow ? 9.5 : 10.5, 600), 0.85);
    }
    tipLabel('N = ' + num(N, 0) + ' N' + (tipN.broken ? ' ≈' : ''), tipN, -1, colors.neg);
    tipLabel('mg = ' + num(W, 0) + ' N', tipW, 1, colors.pos);
    // 體重計：方塊（下緣與人的下緣對齊），人對秤的力 N′ 由下緣向下
    const sTop = cy + bs / 2 - shh;
    block(ctx, xs - sw / 2, sTop, sw, shh, 4, colors.dark ? shade(colors.surface, 0.3) : shade(colors.surface, -0.12), 0.2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + (narrow ? 9 : 10) + 'px system-ui, sans-serif';
    ctx.fillStyle = colors.text;
    ctx.fillText(T('秤', 'Scale'), xs, sTop + shh / 2 + 0.5);
    const tipS = vec(xs, cy + bs / 2, N, 1, colors.neg);
    tipLabel('N′ = ' + num(N, 0) + ' N' + (tipS.broken ? ' ≈' : ''), tipS, 1, colors.neg);
    // 兩行說明
    const t1 = T('藍色 N 與 N′：一對作用力與反作用力', 'Blue N and N′: an action–reaction pair');
    const t2 = T('mg 與 N 都作用在人身上，不是一對', 'mg and N both act on you: not a pair');
    ctx.textAlign = 'center';
    pill(ctx, t1, R.x + R.w / 2, bandTop + lineH * 0.5, shade(colors.neg, colors.dark ? 0.1 : -0.1), fitFont(ctx, t1, R.w - 14, narrow ? 10 : 11, 700), 0.92);
    pill(ctx, t2, R.x + R.w / 2, bandTop + lineH * 1.5, shade(colors.pos, colors.dark ? 0.1 : -0.1), fitFont(ctx, t2, R.w - 14, narrow ? 10 : 11, 600), 0.92);
    ctx.restore();
  }

  // ---------- 圖表 ----------
  function graphLayout() {
    const narrow = gw < 560;
    const left = narrow ? 44 : 52, right = 8, top = 4, axisH = 24, gap = narrow ? 6 : 8;
    const n = 4, sh = (gh - top - axisH - gap * (n - 1)) / n;
    const strips = [];
    for (let i = 0; i < n; i++) strips.push({ x: left, y: top + i * (sh + gap), w: gw - left - right, h: sh });
    return { narrow: narrow, left: left, strips: strips, axisY: top + n * sh + (n - 1) * gap };
  }
  /** 圖表區的底色（漸層，只在版面或主題改變時重畫） */
  let gbg = null;
  function buildGraphBg() {
    gbg = document.createElement('canvas');
    gbg.width = gv.width; gbg.height = gv.height;
    const c = gbg.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const base = colors['canvas-bg'], edge = shade(base, colors.dark ? -0.35 : -0.05);
    GL.strips.forEach(function (R) {
      const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
      g.addColorStop(0, colors.dark ? shade(base, 0.03) : base);
      g.addColorStop(1, edge);
      c.fillStyle = g;
      roundRect(c, R.x, R.y, R.w, R.h, 6);
      c.fill();
    });
  }
  function niceUp(v) {
    const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    for (let i = 0; i < steps.length; i++) if (steps[i] * e >= v - 1e-12) return steps[i] * e;
    return 10 * e;
  }
  function decOf(step) { return (String(+step.toFixed(6)).split('.')[1] || '').length; }
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  /** 這一趟到目前（或到預定的結束）為止的時間長度 */
  function runSpan(run) {
    if (!run) return 10;
    if (run.ended) return run.tEnd - run.t0;
    const last = run.track[run.track.length - 1];
    if ((run.kind === 'trip' || run.kind === 'free') && isFinite(last.t0)) return Math.max(last.t0, S.t) - run.t0;
    return S.t - run.t0;
  }
  function timeAxis() {
    const run = S.run;
    let span;
    if (!run) span = 10;
    else if (run.kind === 'manual' && !run.ended) span = niceUp(Math.max(6, (S.t - run.t0) * 1.25));
    else span = niceUp(Math.max(2, runSpan(run) * 1.06 + 0.4));
    return { t0: -span * 0.05, t1: span };
  }
  function drawGraphs() {
    if (!GL) return;
    const c = gtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, gw, gh);
    if (gbg) c.drawImage(gbg, 0, 0, gw, gh);
    const ax = timeAxis();
    const TX = function (tau, R) { return R.x + (tau - ax.t0) / (ax.t1 - ax.t0) * R.w; };
    const runs = S.runs.slice();
    const curRun = S.run;
    const all = runs.concat(curRun ? [curRun] : []);
    // 縱軸範圍
    let amax = 1, vmax = 1, rlo = Infinity, rhi = -Infinity;
    all.forEach(function (run) {
      const hide = isHidden(run);
      run.track.forEach(function (s) {
        if (s.t0 - run.t0 > ax.t1) return;
        if (!hide) {
          amax = Math.max(amax, Math.abs(s.a));
          vmax = Math.max(vmax, Math.abs(s.v0));
          const e = E.segEnd(s); if (e) vmax = Math.max(vmax, Math.abs(e.v));
        }
        const r = E.reading(s.m, s.a);
        rlo = Math.min(rlo, r, s.m); rhi = Math.max(rhi, r, s.m);
      });
    });
    const pm = P().m;
    if (!isFinite(rlo)) { rlo = pm; rhi = pm; }
    rlo = Math.min(rlo, pm); rhi = Math.max(rhi, pm);
    const rspan = Math.max(rhi - rlo, pm * 0.3);
    const rmid = (rhi + rlo) / 2;
    let r0 = rmid - rspan * 0.62, r1 = rmid + rspan * 0.62;
    if (rlo <= 1e-9 || r0 < 0) r0 = 0;
    const A_R = niceUp(amax * 1.12), V_R = niceUp(vmax * 1.12);
    const specs = [
      { key: 'a', title: 'a (m/s²)', lo: -A_R, hi: A_R, col: colors.equi, f: function (s, t) { return s.a; }, kind: 'step', hideable: true },
      { key: 'v', title: 'v (m/s)', lo: -V_R, hi: V_R, col: colors.probe, f: function (s, t) { return E.segAt(s, t).v; }, kind: 'line', hideable: true },
      { key: 'y', title: 'y (m)', lo: -1.5, hi: 28.5, col: colors.accent, f: function (s, t) { return E.segAt(s, t).y; }, kind: 'quad' },
      { key: 'r', title: T('讀數 (kgw)', 'reading (kgw)'), lo: r0, hi: r1, col: colors.neg, f: function (s) { return E.reading(s.m, s.a); }, kind: 'step' }
    ];
    GL.strips.forEach(function (R, i) {
      const sp = specs[i];
      const Y = function (v) { return R.y + R.h - (v - sp.lo) / (sp.hi - sp.lo) * R.h; };
      c.save();
      roundRect(c, R.x, R.y, R.w, R.h, 6);
      c.clip();
      // 超重／失重的底色帶（目前這一趟）
      if (curRun) {
        curRun.track.forEach(function (s) {
          const ph = E.phaseOf(s.a);
          if (ph === 'normal') return;
          const ta = s.t0 - curRun.t0, tb = Math.min(s.t1, S.t) - curRun.t0;
          if (!(tb > ta)) return;
          const xa = TX(ta, R), xb = TX(Math.min(tb, ax.t1), R);
          c.fillStyle = alpha(phaseColor(ph), colors.dark ? 0.16 : 0.12);
          c.fillRect(xa, R.y, xb - xa, R.h);
          if (ph === 'free') {
            c.strokeStyle = alpha(phaseColor(ph), 0.18);
            c.lineWidth = 1;
            c.beginPath();
            for (let x = xa - R.h; x < xb; x += 7) { c.moveTo(Math.max(x, xa), R.y + R.h - (Math.max(x, xa) - x)); c.lineTo(Math.min(x + R.h, xb), R.y + R.h - (Math.min(x + R.h, xb) - x)); }
            c.stroke();
          }
          if (i === 0) {
            // 標籤放在 a 曲線的另一側，避免壓在線上；在上方時避開左上角的標題
            const fB = '700 ' + (GL.narrow ? 10 : 11) + 'px system-ui, sans-serif';
            const lw2 = textW(c, phaseName(ph), fB) + 10;
            const atTop = !(s.a > 0);
            const minX = atTop ? R.x + 6 + textW(c, sp.title, '700 ' + (GL.narrow ? 10 : 11) + 'px system-ui, sans-serif') + 14 + lw2 / 2 : xa + lw2 / 2 + 2;
            const xm = Math.max((xa + xb) / 2, minX);
            if (xm + lw2 / 2 <= xb + 2 && xm - lw2 / 2 >= xa - 2) {
              c.textAlign = 'center';
              pill(c, phaseName(ph), xm, atTop ? R.y + 11 : R.y + R.h - 11, shade(phaseColor(ph), colors.dark ? 0.15 : -0.2), fB, 0.75);
            }
          }
        });
      }
      // 格線與刻度
      const ticks = [];
      if (sp.key === 'y') { [0, 9, 18, 27].forEach(function (v) { ticks.push(v); }); }
      else {
        const st = niceStep((sp.hi - sp.lo) / (R.h > 80 ? 4 : 3));
        for (let v = Math.ceil(sp.lo / st) * st; v <= sp.hi + 1e-9; v += st) ticks.push(+v.toFixed(6));
      }
      c.strokeStyle = alpha(colors.text, 0.07);
      c.lineWidth = 1;
      c.beginPath();
      ticks.forEach(function (v) { const yy = Math.round(Y(v)) + 0.5; c.moveTo(R.x, yy); c.lineTo(R.x + R.w, yy); });
      c.stroke();
      if (sp.key === 'a' || sp.key === 'v') {
        c.strokeStyle = alpha(colors.muted, 0.6);
        c.beginPath(); c.moveTo(R.x, Math.round(Y(0)) + 0.5); c.lineTo(R.x + R.w, Math.round(Y(0)) + 0.5); c.stroke();
      }
      if (sp.key === 'a' && A_R >= G) {
        c.setLineDash([3, 4]);
        c.strokeStyle = alpha(colors['b-optics'], 0.55);
        c.beginPath(); c.moveTo(R.x, Math.round(Y(-G)) + 0.5); c.lineTo(R.x + R.w, Math.round(Y(-G)) + 0.5); c.stroke();
        c.setLineDash([]);
      }
      if (sp.key === 'r') {
        c.setLineDash([5, 4]);
        c.strokeStyle = alpha(colors.text, 0.45);
        c.beginPath(); c.moveTo(R.x, Math.round(Y(pm)) + 0.5); c.lineTo(R.x + R.w, Math.round(Y(pm)) + 0.5); c.stroke();
        c.setLineDash([]);
      }
      // 之前幾趟（淡色）與目前這一趟
      runs.forEach(function (run) { plotRun(c, run, sp, R, TX, Y, ax, true); });
      if (curRun) plotRun(c, curRun, sp, R, TX, Y, ax, false);
      // 時間游標（這一趟還在進行時）
      if (curRun && !curRun.ended) {
        const tau = S.t - curRun.t0;
        if (tau <= ax.t1) {
          const xx = Math.round(TX(tau, R)) + 0.5;
          c.strokeStyle = alpha(colors.text, 0.25);
          c.beginPath(); c.moveTo(xx, R.y); c.lineTo(xx, R.y + R.h); c.stroke();
          if (!(sp.hideable && isHidden(curRun))) {
            const s = curRun.track[E.indexAt(curRun.track, S.t)];
            const v = sp.f(s, S.t);
            c.fillStyle = sp.col;
            c.strokeStyle = colors['canvas-bg'];
            c.lineWidth = 1.5;
            c.beginPath(); c.arc(xx, Y(v), 3.6, 0, Math.PI * 2); c.fill(); c.stroke();
          }
        }
      }
      if (sp.hideable && isHidden(curRun)) {
        c.fillStyle = alpha(colors['canvas-bg'], 0.85);
        c.fillRect(R.x, R.y, R.w, R.h);
        c.textAlign = 'center';
        pill(c, T('神秘電梯：保密中', 'Mystery elevator: hidden'), R.x + R.w / 2, R.y + R.h / 2, colors.muted, '700 12px system-ui, sans-serif', 0.9);
      }
      // 標題
      c.textAlign = 'left';
      pill(c, sp.title, R.x + 6, R.y + 11, shade(sp.col, colors.dark ? 0.1 : -0.15), '700 ' + (GL.narrow ? 10 : 11) + 'px system-ui, sans-serif', 0.8);
      if (sp.key === 'r') {
        c.textAlign = 'right';
        pill(c, T('實重 ', 'true weight ') + num(pm, 1), R.x + R.w - 6, Y(pm) + (Y(pm) - R.y > 22 ? -9 : 9), colors.muted, '600 ' + (GL.narrow ? 9.5 : 10.5) + 'px system-ui, sans-serif', 0.75);
      }
      c.restore();
      // 左側刻度數字
      c.font = (GL.narrow ? 9.5 : 10.5) + 'px system-ui, sans-serif';
      c.fillStyle = colors.muted;
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      if (sp.key === 'y') {
        [[0, '1F'], [9, '4F'], [18, '7F'], [27, '10F']].forEach(function (q) { c.fillText(q[1], R.x - 5, Y(q[0])); });
      } else {
        const st = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
        ticks.forEach(function (v) {
          const yy = Y(v);
          if (yy < R.y + 4 || yy > R.y + R.h - 4) return;
          c.fillText(num(v, decOf(st)), R.x - 5, yy);
        });
      }
      c.strokeStyle = alpha(colors.text, 0.08);
      c.lineWidth = 1;
      roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 6);
      c.stroke();
    });
    // 時間軸
    const R0 = GL.strips[0];
    const st = niceStep((ax.t1 - ax.t0) / (GL.narrow ? 5 : 8));
    c.font = (GL.narrow ? 9.5 : 10.5) + 'px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let t = 0; t <= ax.t1 + 1e-9; t += st) c.fillText(num(t, decOf(st)), TX(t, R0), GL.axisY + 6);
    c.textAlign = 'right';
    c.fillText('t (s)', GL.left - 6, GL.axisY + 6);
    // 還沒有任何一趟
    if (!curRun) {
      c.textAlign = 'center';
      const msg = T('按樓層按鈕出發：這裡會同步畫出 a–t、v–t、y–t 與讀數–t 圖', 'Press a floor button: the a–t, v–t, y–t and reading–t graphs will be drawn here');
      const fz = GL.narrow ? 11 : 12;
      const midY = (GL.strips[1].y + GL.strips[2].y + GL.strips[2].h) / 2;
      wrapPill(c, msg, gw / 2 + GL.left / 2, midY, gw - GL.left - 30, colors.text, '600 ' + fz + 'px system-ui, sans-serif');
    }
  }
  function wrapPill(c, text, x, y, maxW, color, font) {
    c.font = font;
    const words = /\s/.test(text) ? text.split(' ') : Array.from(text);
    const sep = /\s/.test(text) ? ' ' : '';
    const lines = [];
    let line = '';
    words.forEach(function (w) {
      const t = line ? line + sep + w : w;
      if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    const lh = 18;
    lines.forEach(function (ln, i) { pill(c, ln, x, y + (i - (lines.length - 1) / 2) * lh, color, font, 0.9); });
  }
  /** 畫一趟的曲線：精確使用每一段的公式（等加速度段：a 為階梯、v 為直線、y 為拋物線＝二次貝茲曲線） */
  function plotRun(c, run, sp, R, TX, Y, ax, faded) {
    if (sp.hideable && isHidden(run)) return;
    const t0 = run.t0;
    const tNow = run.ended ? Infinity : S.t;
    const tMax = t0 + ax.t1;
    const segs = run.track;
    const pre = segs[0];
    const col = sp.col;
    // 實線（已發生）與虛線（預定，只有樓層行程與斷纜時畫）
    const showFuture = !faded && !run.ended && (run.kind === 'trip' || run.kind === 'free') && !isHidden(run);
    [0, 1].forEach(function (future) {
      if (future && !showFuture) return;
      c.beginPath();
      let started = false;
      const lineTo = function (x, y) { if (started) c.lineTo(x, y); else { c.moveTo(x, y); started = true; } };
      if (!future) {
        // 出發前（靜止）的一小段：a = 0、v = 0、y = 出發高度、讀數 = 實重
        const v0 = sp.key === 'y' ? pre.y0 : sp.key === 'r' ? E.reading(pre.m, 0) : 0;
        lineTo(TX(ax.t0, R), Y(v0));
        lineTo(TX(0, R), Y(v0));
      }
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        let a = Math.max(s.t0, t0), b = Math.min(s.t1, tMax);
        if (future) a = Math.max(a, tNow);
        else b = Math.min(b, tNow);
        if (!(b > a)) continue;
        const xa = TX(a - t0, R), xb = TX(b - t0, R);
        if (sp.kind === 'step') {
          const v = sp.f(s, a);
          lineTo(xa, Y(v)); lineTo(xb, Y(v));
        } else if (sp.kind === 'line') {
          lineTo(xa, Y(sp.f(s, a))); lineTo(xb, Y(sp.f(s, b)));
        } else {
          const ya = sp.f(s, a), yb = sp.f(s, b), va = E.segAt(s, a).v;
          lineTo(xa, Y(ya));
          // 二次貝茲曲線的控制點：起點切線與終點切線的交點（精確表示拋物線）
          const cy = ya + va * (b - a) / 2;
          c.quadraticCurveTo((xa + xb) / 2, Y(cy), xb, Y(yb));
        }
      }
      c.lineJoin = 'round';
      c.lineCap = 'round';
      if (future) {
        c.setLineDash([4, 5]);
        c.strokeStyle = alpha(col, 0.55);
        c.lineWidth = 1.4;
        c.stroke();
        c.setLineDash([]);
      } else if (faded) {
        c.strokeStyle = alpha(col, 0.3);
        c.lineWidth = 1.4;
        c.stroke();
      } else {
        c.strokeStyle = alpha(shade(col, colors.dark ? 0.05 : -0.1), 0.35);
        c.lineWidth = GL.narrow ? 4 : 5;
        c.stroke();
        c.strokeStyle = col;
        c.lineWidth = GL.narrow ? 2 : 2.4;
        c.stroke();
      }
    });
  }

  // ---------- 讀數 ----------
  const lastText = {};
  function setHTML(id, html) {
    if (lastText[id] === html) return;
    lastText[id] = html;
    $(id).innerHTML = html;
  }
  function updateReadout(st, p) {
    const MS2 = ' m/s<sup>2</sup>';
    const hide = hiddenNow();
    const run = S.run;
    const tau = run ? (run.ended ? run.tEnd - run.t0 : S.t - run.t0) : 0;
    setHTML('rt', num(tau, 2) + ' s');
    const f = E.floorOf(st.y);
    setHTML('ry', num(st.y, 2) + ' m<small>' + floorName(f.n) + (Math.abs(f.off) < 0.005 ? '' : ' ' + signed(f.off, 2) + ' m') + '</small>');
    const dirV = Math.abs(st.v) < 1e-6 ? T('靜止', 'at rest') : st.v > 0 ? T('向上', 'upward') : T('向下', 'downward');
    const dirA = Math.abs(st.a) < 1e-9 ? '' : st.a > 0 ? T('向上', 'upward') : T('向下', 'downward');
    setHTML('rv', hide ? '?' : signed(st.v, 2) + ' m/s<small>' + dirV + '</small>');
    setHTML('ra', hide ? '?' : signed(st.a, 2) + MS2 + (dirA ? '<small>' + dirA + '</small>' : ''));
    const ph = E.phaseOf(st.a);
    setHTML('rph', phaseName(ph));
    const N = E.normalForce(p.m, st.a);
    setHTML('rN', num(N, 1) + ' N<small>mg = ' + num(p.m * G, 1) + ' N</small>');
    setHTML('rR', num(E.reading(p.m, st.a), 1) + ' kgw<small>' + T('實重 ', 'true weight ') + num(p.m, 1) + ' kgw</small>');
    const Ts = E.springTension(p.ms, st.a);
    setHTML('rT', num(Ts, 2) + ' N<small>' + T('伸長量 ', 'stretch ') + num(E.springExtension(Ts) * 100, 1) + ' cm</small>');
    const b = S.ball.result;
    if (S.ball.st === 'air') setHTML('rB', T('落下中…', 'falling…'));
    else if (b) setHTML('rB', num(b.t, 3) + ' s<small>' + (b.aConst && !hiddenBall(b) ? '√(2h/(g + a)) = ' + num(E.fallTime(HB, b.a), 3) + ' s' : T('靜止時 ', 'at rest ') + num(E.fallTime(HB, 0), 3) + ' s') + '</small>');
    else setHTML('rB', '—<small>' + T('靜止時 ', 'at rest ') + num(E.fallTime(HB, 0), 3) + ' s</small>');
  }
  function hiddenBall(b) { return b.mystery && hiddenNow(); }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() {
    const Sd = window.LabSound;
    return Sd && Sd.enabled() ? Sd : null;
  }
  let lastTickAt = -1;
  function tickSound() {
    const Sd = sound(); if (!Sd) return;
    const now = performance.now();
    if (now - lastTickAt < 70) return;
    lastTickAt = now;
    Sd.tone({ freq: 2100, dur: 0.025, type: 'square', gain: 0.18 });
    Sd.noise({ dur: 0.012, gain: 0.12, filter: 4200, q: 1.5 });
  }
  function dingSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.tone({ freq: 1318.5, dur: 0.75, type: 'sine', gain: 0.35, attack: 0.004 });
    Sd.tone({ freq: 2637, dur: 0.3, type: 'sine', gain: 0.06 });
    Sd.tone({ freq: 1046.5, dur: 0.95, type: 'sine', gain: 0.3, attack: 0.004, delay: 0.36 });
  }
  function snapSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.noise({ dur: 0.06, gain: 0.85, filter: 2600, q: 0.9 });
    Sd.sweep({ from: 1600, to: 300, dur: 0.14, type: 'triangle', gain: 0.5 });
  }
  function brakeSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.noise({ dur: 0.4, gain: 0.55, filter: 2400, q: 0.7 });
    Sd.tone({ freq: 420, dur: 0.12, type: 'triangle', gain: 0.35 });
  }
  function clunkSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.tone({ freq: 330, dur: 0.14, type: 'triangle', gain: 0.45 });
    Sd.noise({ dur: 0.08, gain: 0.4, filter: 900, q: 1 });
  }
  function landSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.tone({ freq: 560, dur: 0.07, type: 'sine', gain: 0.5 });
    Sd.noise({ dur: 0.03, gain: 0.25, filter: 1600, q: 1.2 });
  }
  let hum = null, squeal = null;
  /** 持續的聲音：馬達聲（音高隨速率）、煞車的摩擦聲（音高隨速率下降） */
  function updateVoices(st) {
    const Sd = sound();
    const kind = st.kind;
    const motor = !!(Sd && S.running && MOTOR[kind] && Math.abs(st.v) > 0.02);
    if (!motor) { if (hum) { hum.stop(0.25); hum = null; } }
    else {
      const u = Math.abs(st.v);
      const fq = 260 + 60 * u, gn = 0.05 + 0.02 * Math.min(u, 6);
      if (!hum || !hum.playing) hum = Sd.voice({ freq: fq, type: 'triangle', gain: gn });
      else hum.set({ freq: fq, gain: gn }, 0.08);
    }
    const br = !!(Sd && S.running && kind === 'brake' && Math.abs(st.v) > 0.02);
    if (!br) { if (squeal) { squeal.stop(0.12); squeal = null; } }
    else {
      const u = Math.abs(st.v);
      const fq = 700 + 80 * u, gn = 0.03 + 0.006 * u;
      if (!squeal || !squeal.playing) squeal = Sd.voice({ freq: fq, type: 'sawtooth', gain: gn });
      else squeal.set({ freq: fq, gain: gn }, 0.05);
    }
  }

  // ---------- 任務模式（missions.js）：回報物理量 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  // ---------- 事件：每一段開始時 ----------
  function segStarted(seg) {
    if (!seg || seg === S.lastSeg) return;
    S.lastSeg = seg;
    const p = P();
    const r = E.reading(seg.m, seg.a);
    if (S.lastReading != null && Math.abs(r - S.lastReading) >= 1) tickSound();
    S.lastReading = r;
    const run = S.run;
    if (!run || run.ended) return;
    if (seg.kind === 'protect') {
      run.protect = true;
      setStatus(T('快到端點樓層了：控制器自動減速（終端保護）。', 'Close to the end of the shaft: the controller slows down automatically.'));
    }
    if (seg.kind === 'brake') {
      brakeSound();
      if (!reducedMotion) S.fx.push({ type: 'spark', t0: performance.now(), dur: 500 });
      setStatus(T('安全鉗夾住導軌，緊急煞車！加速度向上，體重計讀數變大（超重）。',
        'The safety brake grips the rails! The acceleration is now upward, so the reading goes up (overweight).'));
    }
    if (!isFinite(seg.t1)) { runFinished(seg); return; }
    const mid = E.segAt(seg, isFinite(seg.t1) ? (seg.t0 + seg.t1) / 2 : seg.t0 + 0.01);
    const Ts = E.springTension(seg.ms, seg.a);
    emit('phase', {
      kind: seg.kind, run: run.kind, mystery: !!run.mystery,
      a: seg.a, v: seg.v0, dir: Math.abs(mid.v) < 1e-9 ? 0 : Math.sign(mid.v),
      reading: r, N: E.normalForce(seg.m, seg.a), m: seg.m, ms: seg.ms,
      T: Ts, ext: E.springExtension(Ts), ext0: E.springExtension(E.springTension(seg.ms, 0)),
      ratio: (G + seg.a) / G, y: seg.y0
    });
  }
  /** 一趟結束（到站、煞停、手動停住） */
  function runFinished(seg) {
    const run = S.run, t = seg.t0;
    endRun(t);
    const rr = readRange(run, run.t0, t);
    const p = P();
    const fEnd = E.floorOf(seg.y0);
    if (run.kind === 'trip') {
      dingSound();
      S.dwellUntil = t + DWELL;
      S.doorFloor = run.toFloor;
      S.doorT0 = t;
      if (!reducedMotion) S.fx.push({ type: 'arrive', t0: performance.now(), dur: 600 });
      const dur = t - run.t0;
      setStatus(T('到達 ' + floorName(run.toFloor) + '，叮！這一趟花了 ' + num(dur, 2) + ' s；讀數最大 ' + num(rr.hi, 1) + ' kgw、最小 ' + num(rr.lo, 1) + ' kgw。',
        'Arrived at ' + floorName(run.toFloor) + ' — ding! The ride took ' + num(dur, 2) + ' s; the reading went from ' + num(rr.lo, 1) + ' to ' + num(rr.hi, 1) + ' kgw.'));
      const fr = E.floorOf(run.y0);
      emit('trip', {
        from: Math.abs(fr.off) < 1e-6 ? fr.n : null, to: run.toFloor, y0: run.y0, y1: seg.y0,
        d: Math.abs(seg.y0 - run.y0), up: seg.y0 > run.y0, A: run.A, V: run.V,
        m: p.m, ms: p.ms, duration: dur, readMin: rr.lo, readMax: rr.hi, mConst: run.mConst,
        mystery: !!run.mystery, peakV: E.tripPeakSpeed(Math.abs(seg.y0 - run.y0), run.A, run.V)
      });
    } else if (run.kind === 'free') {
      clunkSound();
      const fs = E.floorOf(seg.y0);
      setStatus(T('電梯被安全鉗夾住，停在 ' + floorName(fs.n) + (Math.abs(fs.off) < 0.005 ? '' : '（' + signed(fs.off, 2) + ' m）') + '，共下降 ' + num(run.cutY - seg.y0, 2) + ' m。按「修復纜繩」恢復運轉。',
        'The safety brake holds the elevator at ' + floorName(fs.n) + (Math.abs(fs.off) < 0.005 ? '' : ' (' + signed(fs.off, 2) + ' m)') + ' after a drop of ' + num(run.cutY - seg.y0, 2) + ' m. Press “Repair the cable” to carry on.'));
      const tFree = run.track.reduce(function (sum, s) {
        return s.kind === 'free' ? sum + Math.max(0, Math.min(s.t1, t) - Math.max(s.t0, run.cutT)) : sum;
      }, 0);
      const r2 = readRange(run, run.cutT, t);
      emit('brakeStop', {
        y0: run.cutY, v0: run.cutV, startFloor: run.cutFloor, yStop: seg.y0, drop: run.cutY - seg.y0,
        vTrip: run.vt, ab: run.ab, manual: !!run.manualBrake, tFree: tFree, readMin: r2.lo, readMax: r2.hi,
        m: p.m, stopFloor: fs.n, stopOff: fs.off
      });
    } else if (run.kind === 'manual') {
      setStatus(T('電梯停住了：' + floorName(fEnd.n) + (Math.abs(fEnd.off) < 0.005 ? '' : '（' + signed(fEnd.off, 3) + ' m）') + (run.protect ? '（終端保護自動減速）' : '') + '。',
        'The elevator has stopped: ' + floorName(fEnd.n) + (Math.abs(fEnd.off) < 0.005 ? '' : ' (' + signed(fEnd.off, 3) + ' m)') + (run.protect ? ' (automatic end-of-shaft slowdown)' : '') + '.'));
      const f0 = E.floorOf(run.y0);
      emit('manualStop', {
        y0: run.y0, fromFloor: Math.abs(f0.off) < 1e-9 ? f0.n : null, y: seg.y0, floor: fEnd.n, off: fEnd.off,
        protect: !!run.protect, readMin: rr.lo, readMax: rr.hi, m: p.m, mConst: run.mConst
      });
    }
    if (S.mystery && S.mystery.run === run) updateMystery();
    updateButtons();
  }

  // ---------- 操作：樓層按鈕 ----------
  function busy() { return !!(S.run && !S.run.ended); }
  function pressFloor(n) {
    if (S.cable === 'cut') {
      setStatus(T('纜繩斷了，電梯不能動。先按「修復纜繩」。', 'The cable is broken, so the elevator cannot move. Press “Repair the cable” first.'));
      return;
    }
    if (!S.running) { S.running = true; startLoop(); }
    const st = cur();
    if (!busy() && S.dwellUntil == null && Math.abs(st.y - E.floorY(n)) < 1e-9) {
      // 已經在這一層：開門
      dingSound();
      S.dwellUntil = S.t + DWELL; S.doorFloor = n; S.doorT0 = S.t;
      updateButtons();
      startLoop();
      return;
    }
    if (busy() && S.run.kind === 'trip' && S.run.toFloor === n) return;
    if (S.queue.indexOf(n) < 0) S.queue.push(n);
    if (!busy() && S.dwellUntil == null) nextTrip();
    updateButtons();
    startLoop();
  }
  function nextTrip() {
    while (S.queue.length) {
      const n = S.queue.shift();
      const st = cur();
      if (Math.abs(st.y - E.floorY(n)) < 1e-9) continue;
      startTrip(n, null);
      return;
    }
  }
  function startTrip(n, mystery) {
    const p = P();
    const A = mystery ? mystery.A : p.A, V = p.V;
    const st = cur();
    const run = startRun('trip', { toFloor: n, A: A, V: V, mystery: !!mystery });
    if (mystery) mystery.run = run;
    replan(E.tripProfile(st.y, E.floorY(n), A, V, S.t));
    setStatus(mystery ? T('神秘電梯出發！加速度保密，看體重計讀數推算它。', 'The mystery elevator sets off! The acceleration is secret — work it out from the reading.')
      : T('前往 ' + floorName(n) + '：先以 A 加速，再等速，最後以 A 減速停靠。', 'Going to ' + floorName(n) + ': speed up at A, cruise, then slow down at A and stop.'));
    updateButtons();
  }

  // ---------- 操作：剪斷纜繩、緊急煞車、修復 ----------
  function cutCable() {
    const p = P(), st = cur();
    const yp = E.predictStop(st.y, st.v, p.vt, p.ab);
    if (yp < -1e-9) {
      setStatus(T('高度不夠：照目前的限速器速率與煞車減速度，電梯會撞到底坑（紅色虛線在 1F 以下）。請搭到更高的樓層，或調小限速器動作速率、調大煞車減速度。',
        'Not high enough: with this trip speed and braking deceleration the elevator would hit the pit (the red dashed line is below 1F). Ride higher, lower the governor trip speed or raise the braking deceleration.'));
      return;
    }
    if (!S.running) { S.running = true; startLoop(); }
    S.queue = [];
    S.dwellUntil = null; S.doorFloor = null;
    const f = E.floorOf(st.y);
    const extra = { cutT: S.t, cutY: st.y, cutV: st.v, cutFloor: Math.abs(st.v) < 1e-9 && Math.abs(f.off) < 1e-6 ? f.n : null, vt: p.vt, ab: p.ab, manualBrake: false };
    if (busy()) Object.assign(S.run, extra, { kind: 'free' });
    else startRun('free', extra);
    S.cable = 'cut';
    S.cutY = st.y + CEIL + 0.12;
    S.cutRot = -st.y / (Math.max(4, Math.min((L.sx1 - L.sx0) * 0.3, L.bk * 0.9)) / L.bk);
    S.cmd = 0;
    $('driveUp').classList.remove('held'); $('driveDown').classList.remove('held');
    snapSound();
    if (!reducedMotion) S.fx.push({ type: 'snap', t0: performance.now(), dur: 400 });
    replan(E.freeFallPlan(S.t, st.y, st.v, p.vt, p.ab));
    setStatus(T('纜繩斷了！電梯只受重力，做自由落體：體重計讀數 0（完全失重）。', 'The cable has snapped! Gravity is the only force: the elevator is in free fall and the scale reads 0 (weightless).'));
    emit('cut', { y0: st.y, v0: st.v, atFloor: extra.cutFloor, vTrip: p.vt, ab: p.ab, predicted: yp, m: p.m });
    updateButtons();
    startLoop();
  }
  function pressBrake() {
    const sg = curSeg();
    if (S.cable !== 'cut' || !S.run || S.run.ended || sg.kind !== 'free') return;
    const st = cur();
    S.run.manualBrake = true;
    replan(E.brakeNow(S.t, st.y, st.v, S.run.ab));
    if (st.v >= 0) setStatus(T('電梯還在往上，安全鉗會在最高點夾住。', 'The elevator is still moving up; the brake grips at the highest point.'));
    updateButtons();
  }
  function repair() {
    if (busy()) return;
    S.cable = 'ok';
    S.cutY = null;
    setStatus(T('纜繩修好了，可以繼續搭電梯。', 'The cable is repaired. You can ride again.'));
    updateButtons();
    requestDraw();
  }

  // ---------- 操作：手動駕駛 ----------
  function setCmd(c) {
    if (c === S.cmd) return;
    S.cmd = c;
    $('driveUp').classList.toggle('held', c > 0);
    $('driveDown').classList.toggle('held', c < 0);
    if (S.mode !== 'manual' || S.cable === 'cut') return;
    if (busy() && S.run.kind !== 'manual') return;
    const sg = curSeg();
    if (sg && sg.kind === 'protect') return; // 終端保護中，不理會按鍵
    const p = P(), st = cur();
    if (!busy()) {
      if (c === 0) return;
      if (S.dwellUntil != null) { S.dwellUntil = null; S.doorFloor = null; }
      const plan = E.manualPlan(S.t, st.y, 0, c, p.A, p.V);
      if (plan.length === 1) return; // 在端點，動不了
      if (!S.running) { S.running = true; }
      startRun('manual', { A: p.A, V: p.V, protect: false });
      replan(plan);
      setStatus(T('手動駕駛中：放開按鈕就維持等速。', 'Driving: release the button to keep a constant velocity.'));
      startLoop();
    } else {
      replan(E.manualPlan(S.t, st.y, st.v, c, S.run.A, S.run.V));
    }
    updateButtons();
    requestDraw();
  }

  // ---------- 操作：小球 ----------
  function dropBall() {
    if (S.ball.st !== 'hand') return;
    const st = cur();
    if (!S.running) { S.running = true; startLoop(); }
    S.ball = { st: 'air', tr: S.t, yb: st.y + HB, vb: st.v, result: null, mystery: !!(S.run && S.run.mystery && !S.run.ended) };
    S.ball.tLand = E.ballLanding(S.track, S.ball, S.t);
    updateButtons();
    startLoop();
  }
  function ballLanded(tl) {
    const b = S.ball;
    // 小球在空中的期間，車廂的加速度是否都一樣？
    const as = [];
    let floatTime = 0;
    S.track.forEach(function (s) {
      const lo = Math.max(s.t0, b.tr), hi = Math.min(s.t1, tl);
      if (hi > lo + 1e-12) {
        as.push(s.a);
        if (Math.abs(s.a + G) < 1e-9) floatTime += hi - lo;
      }
    });
    const aConst = as.every(function (a) { return Math.abs(a - as[0]) < 1e-12; });
    const t = tl - b.tr, t0 = E.fallTime(HB, 0);
    b.st = 'floor';
    b.pickAt = tl + 1.5;
    b.result = { t: t, aConst: aConst, a: aConst ? as[0] : null, mystery: b.mystery };
    landSound();
    if (!reducedMotion) S.fx.push({ type: 'land', t0: performance.now(), dur: 450 });
    emit('ball', { h: HB, t: t, t0: t0, ratio: t / t0, aConst: aConst, a: aConst ? as[0] : null, gEff: 2 * HB / (t * t), floated: floatTime > 0, floatTime: floatTime, m: P().m });
    updateButtons();
  }

  // ---------- 神秘電梯 ----------
  function startMystery() {
    if (S.cable === 'cut' || busy() || S.mode !== 'floor') return;
    const st = cur();
    const A = Math.round((0.5 + Math.random() * 2) * 100) / 100;
    let n;
    do { n = 1 + Math.floor(Math.random() * E.FLOORS); } while (Math.abs(E.floorY(n) - st.y) < 2 * E.FLOOR_H + 1e-9);
    S.queue = [];
    S.dwellUntil = null; S.doorFloor = null;
    S.mystery = { A: A, run: null, guessed: false };
    if (!S.running) { S.running = true; }
    startTrip(n, S.mystery);
    $('mysIn').disabled = false;
    $('mysIn').value = '';
    $('mysCheck').disabled = false;
    $('mysRes').textContent = '';
    $('mysRes').className = 'res';
    startLoop();
  }
  function checkMystery() {
    const M = S.mystery;
    if (!M || M.guessed) return;
    const g = parseFloat(String($('mysIn').value).normalize('NFKC').replace(/[，,]/g, '.').replace(/[−–—]/g, '-'));
    if (!isFinite(g)) { $('mysRes').textContent = T('請輸入一個數字。', 'Please type a number.'); $('mysRes').className = 'res no'; return; }
    M.guessed = true;
    if (M.run) M.run.revealed = true;
    const err = Math.abs(Math.abs(g) - M.A);
    const ok = err <= 0.02;
    $('mysRes').textContent = ok
      ? T('答對了！|a| = ' + num(M.A, 2) + ' m/s²。', 'Correct! |a| = ' + num(M.A, 2) + ' m/s².')
      : T('差一點：正確答案 |a| = ' + num(M.A, 2) + ' m/s²（你的答案 ' + num(Math.abs(g), 2) + '）。提示：a = g(讀數/m − 1)。', 'Not quite: the answer is |a| = ' + num(M.A, 2) + ' m/s² (you said ' + num(Math.abs(g), 2) + '). Hint: a = g(reading/m − 1).');
    $('mysRes').className = 'res ' + (ok ? 'ok' : 'no');
    $('mysIn').disabled = true;
    $('mysCheck').disabled = true;
    emit('guess', { aTrue: M.A, aGuess: Math.abs(g), err: err, ok: ok, m: P().m });
    requestDraw();
  }
  function updateMystery() { requestDraw(); }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function tick(tNow) {
    if (!loopOn) return;
    const dt = Math.min((tNow - lastT) / 1000, 1 / 30) * (S.slow ? SLOW : 1);
    lastT = tNow;
    if (S.running) {
      const t0 = S.t;
      S.t = t0 + dt;
      // 依時間順序處理這一幀之內發生的事：段落開始、小球落地、停靠結束、撿起小球
      const done = new Set();
      for (let guard = 0; guard < 40; guard++) {
        let next = Infinity, what = null, obj = null;
        S.track.forEach(function (s) {
          if (s.t0 > t0 && s.t0 <= S.t && s.t1 > s.t0 && !done.has(s) && s.t0 < next) { next = s.t0; what = 'seg'; obj = s; }
        });
        if (S.ball.st === 'air' && S.ball.tLand <= S.t && S.ball.tLand < next) { next = S.ball.tLand; what = 'land'; }
        if (S.dwellUntil != null && S.dwellUntil <= S.t && S.dwellUntil < next) { next = S.dwellUntil; what = 'dwell'; }
        if (S.ball.st === 'floor' && S.ball.pickAt <= S.t && S.ball.pickAt < next) { next = S.ball.pickAt; what = 'pick'; }
        if (!what) break;
        if (what === 'seg') { done.add(obj); segStarted(obj); }
        else if (what === 'land') ballLanded(S.ball.tLand);
        else if (what === 'dwell') { S.dwellUntil = null; S.doorFloor = null; nextTrip(); updateButtons(); }
        else if (what === 'pick') { S.ball.st = 'hand'; updateButtons(); }
      }
    }
    const st = cur();
    updateVoices(st);
    const idleNext = !busy() && S.dwellUntil == null && S.ball.st === 'hand';
    draw(!idleNext && S.running);
    S.fx = S.fx.filter(function (f) { return performance.now() - f.t0 < f.dur; });
    const idle = !busy() && S.dwellUntil == null && S.ball.st === 'hand' && !S.fx.length;
    if (S.running && !idle) requestAnimationFrame(tick);
    else { loopOn = false; updateVoices(st); }
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    const moving = busy();
    $('play').textContent = S.running ? T('暫停', 'Pause') : T('繼續', 'Resume');
    const cutBtn = $('cut');
    if (S.cable === 'cut') {
      cutBtn.textContent = T('修復纜繩', 'Repair the cable');
      cutBtn.classList.add('repair');
      cutBtn.disabled = moving;
    } else {
      cutBtn.textContent = T('剪斷纜繩', 'Cut the cable');
      cutBtn.classList.remove('repair');
      cutBtn.disabled = false;
    }
    const sg = curSeg();
    $('brake').disabled = !(S.cable === 'cut' && moving && sg && sg.kind === 'free');
    $('ball').textContent = S.ball.st === 'hand' ? T('放開小球', 'Drop the ball') : S.ball.st === 'air' ? T('小球落下中…', 'Ball falling…') : T('撿回小球…', 'Picking it up…');
    $('ball').disabled = S.ball.st !== 'hand';
    // 樓層按鈕
    const st = cur(), here = E.floorOf(st.y);
    padButtons.forEach(function (b, i) {
      const n = i + 1;
      const lit = S.queue.indexOf(n) >= 0 || (moving && S.run.kind === 'trip' && S.run.toFloor === n);
      b.classList.toggle('lit', lit);
      b.classList.toggle('here', !moving && Math.abs(here.off) < 1e-6 && here.n === n);
      b.disabled = S.cable === 'cut';
    });
    const canSwitch = !moving;
    $('modeFloor').disabled = !canSwitch && S.mode !== 'floor';
    $('modeManual').disabled = !canSwitch && S.mode !== 'manual';
    $('mysGo').disabled = S.cable === 'cut' || moving || S.mode !== 'floor';
  }

  // ---------- 介面 ----------
  const pad = $('floorPad');
  const padButtons = [];
  for (let n = 1; n <= E.FLOORS; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(n);
    b.style.setProperty('--n', n);
    b.setAttribute('aria-label', T(n + ' 樓', 'Floor ' + n));
    b.addEventListener('click', function () { pressFloor(n); });
    padButtons.push(b);
  }
  // 手機：上排 6–10、下排 1–5（像電梯的操作盤）；寬螢幕時用 CSS order 排成 1–10
  [6, 7, 8, 9, 10, 1, 2, 3, 4, 5].forEach(function (n) { pad.appendChild(padButtons[n - 1]); });
  const padStyle = document.createElement('style');
  padStyle.textContent = '@media (min-width: 600px) { #floorPad button { order: var(--n); } }';
  document.head.appendChild(padStyle);

  $('play').addEventListener('click', function () {
    S.running = !S.running;
    if (S.running) { startLoop(); }
    else {
      const st = cur(), p = P();
      emit('pause', { t: S.run ? S.t - S.run.t0 : 0, y: st.y, v: st.v, a: st.a, kind: st.kind, moving: Math.abs(st.v) > 1e-6, reading: E.reading(p.m, st.a), m: p.m, mystery: hiddenNow() });
    }
    updateButtons();
    requestDraw();
  });
  $('cut').addEventListener('click', function () { if (S.cable === 'cut') repair(); else cutCable(); });
  $('brake').addEventListener('click', pressBrake);
  $('ball').addEventListener('click', dropBall);
  $('slow').addEventListener('change', function (ev) { S.slow = ev.target.checked; });
  $('mysGo').addEventListener('click', startMystery);
  $('mysCheck').addEventListener('click', checkMystery);
  $('mysIn').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') checkMystery(); });

  // 全部清除：清掉所有圖表與紀錄、修好纜繩、小球回到手上；電梯停在最近的樓層（滑桿設定不變）
  $('reset').addEventListener('click', function () {
    const st = cur();
    let y = st.y;
    if (busy() || S.cable === 'cut') y = E.floorY(E.floorOf(st.y).n);
    S.run = null; S.runs = [];
    S.queue = []; S.dwellUntil = null; S.doorFloor = null;
    S.cable = 'ok'; S.cutY = null;
    S.cmd = 0;
    $('driveUp').classList.remove('held'); $('driveDown').classList.remove('held');
    S.ball = { st: 'hand' };
    S.mystery = null;
    $('mysIn').disabled = true; $('mysIn').value = ''; $('mysCheck').disabled = true; $('mysRes').textContent = '';
    S.track = stamp([E.rest(S.t, y)]);
    S.lastSeg = S.track[0];
    S.lastReading = E.reading(P().m, 0);
    S.fx = [];
    setStatus(T('已全部清除，滑桿設定不變。按樓層按鈕出發。', 'Everything is cleared; the slider settings are kept. Press a floor button to go.'));
    updateButtons();
    requestDraw();
  });

  // 模式
  function setMode(m) {
    if (m === S.mode || busy()) return;
    S.mode = m;
    $('modeFloor').setAttribute('aria-pressed', String(m === 'floor'));
    $('modeManual').setAttribute('aria-pressed', String(m === 'manual'));
    $('floorPad').hidden = m !== 'floor';
    $('drivePad').hidden = m !== 'manual';
    S.queue = [];
    setCmd(0);
    setStatus(m === 'manual' ? T('手動駕駛：按住 ▲ 或 ▼ 加速，放開就等速。', 'Manual drive: hold ▲ or ▼ to accelerate; release to keep a constant velocity.') : '');
    updateButtons();
    requestDraw();
  }
  $('modeFloor').addEventListener('click', function () { setMode('floor'); });
  $('modeManual').addEventListener('click', function () { setMode('manual'); });

  // 按住的按鈕（滑鼠、觸控、鍵盤）
  [['driveUp', 1], ['driveDown', -1]].forEach(function (pr) {
    const b = $(pr[0]), c = pr[1];
    b.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      try { b.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      setCmd(c);
    });
    const up = function () { if (S.cmd === c) setCmd(0); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    b.addEventListener('keydown', function (ev) { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { ev.preventDefault(); setCmd(c); } });
    b.addEventListener('keyup', function (ev) { if (ev.key === ' ' || ev.key === 'Enter') up(); });
    b.addEventListener('blur', up);
  });
  document.addEventListener('keydown', function (ev) {
    if (S.mode !== 'manual' || ev.repeat) return;
    const tg = ev.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    if (ev.key === 'ArrowUp') { ev.preventDefault(); setCmd(1); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); setCmd(-1); }
  });
  document.addEventListener('keyup', function (ev) {
    if (S.mode !== 'manual') return;
    if ((ev.key === 'ArrowUp' && S.cmd > 0) || (ev.key === 'ArrowDown' && S.cmd < 0)) setCmd(0);
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

  // ---------- 滑桿 ----------
  const UNITS = { A: 'm/s²', V: 'm/s', m: 'kg', ms: 'kg', vt: 'm/s', ab: 'm/s²' };
  function refreshOutputs() {
    [elA, elV, elM, elMs, elVt, elAb].forEach(function (el) {
      $(el.id + 'o').textContent = fmtSlider(val(el), el) + ' ' + UNITS[el.id];
    });
  }
  /** 改變質量：從現在起的段落改用新的質量（之前的紀錄不變），讀數立即反映 */
  function massChanged() {
    const p = P();
    const i = E.indexAt(S.track, S.t);
    const s = S.track[i];
    if (s.m === p.m && s.ms === p.ms) return;
    if (S.t > s.t0 + 1e-9) {
      const now = E.segAt(s, S.t);
      const s2 = { t0: S.t, t1: s.t1, y0: now.y, v0: now.v, a: s.a, kind: s.kind };
      s.t1 = S.t;
      S.track.splice(i + 1, 0, s2);
      S.lastSeg = s2;
    }
    for (let j = E.indexAt(S.track, S.t); j < S.track.length; j++) { S.track[j].m = p.m; S.track[j].ms = p.ms; }
    if (S.run && !S.run.ended && Math.abs(p.m - S.run.m0) > 1e-12) S.run.mConst = false;
    S.lastReading = E.reading(p.m, s.a);
    if (busy()) {
      const sg = curSeg();
      const Ts = E.springTension(p.ms, sg.a);
      const v = E.segAt(sg, S.t).v;
      emit('phase', {
        kind: sg.kind, run: S.run.kind, mystery: !!S.run.mystery, a: sg.a, v: v, dir: Math.abs(v) < 1e-9 ? 0 : Math.sign(v),
        reading: E.reading(p.m, sg.a), N: E.normalForce(p.m, sg.a), m: p.m, ms: p.ms,
        T: Ts, ext: E.springExtension(Ts), ext0: E.springExtension(E.springTension(p.ms, 0)), ratio: (G + sg.a) / G, y: E.segAt(sg, S.t).y
      });
    }
  }
  [elA, elV, elM, elMs, elVt, elAb].forEach(function (el) {
    el.addEventListener('input', function () {
      refreshOutputs();
      if (el === elM || el === elMs) massChanged();
      requestDraw();
    });
  });

  // ---------- 啟動 ----------
  readColors();
  refreshOutputs();
  S.track = stamp([E.rest(0, 0)]);
  S.lastSeg = S.track[0];
  S.lastReading = E.reading(P().m, 0);
  updateButtons();
  setStatus(reducedMotion ? T('已偵測到「減少動態效果」設定：裝飾動畫已關閉。按樓層按鈕出發。', 'Reduced motion is on: decorative effects are off. Press a floor button to go.')
    : T('電梯停在 1F。按樓層按鈕出發，或改用「手動駕駛」。', 'The elevator is at 1F. Press a floor button to go, or switch to manual drive.'));
  function themeChanged() { readColors(); if (L) { buildBackground(); buildGraphBg(); } requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  window.addEventListener('resize', function () { resize(); });
  resize();
})();
