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
  // 顏色運算與共用繪圖工具（drawkit.js 的 LabDraw）
  const D = window.LabDraw;
  const rgbOf = D.rgb, alpha = D.alpha, shade = D.shade, mix = D.mix;
  const FONT = D.FONT;
  /** 畫布字型；narrow 時字級至少 11 px（手機 390 px 也清楚） */
  function font(weight, size, mono) {
    if (L && L.narrow) size = Math.max(11, size);
    return (weight ? weight + ' ' : '') + size + 'px ' + (mono ? 'ui-monospace, Menlo, Consolas, monospace' : FONT);
  }
  /** settings.js 會把畫布字級乘上這個倍率（字體大小設定） */
  function fontScale() {
    const fs = window.LabSettings && window.LabSettings.get ? +window.LabSettings.get('fs') || 1 : 1;
    return 1 + (fs - 1) * 0.7;
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
    // 樓層標籤欄寬：依「10F」實際字寬（字體放大、粗體時也放得下）；大樓寬度本來就不依比例
    ctx.font = '600 11px ' + FONT;
    const lw = Math.max(narrow ? 25 : 30, Math.ceil(ctx.measureText('10F').width) + 9);
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

  const roundRect = D.roundRect;

  /**
   * 標籤：LabDraw.pill 的樣式（半透明圓角底框＋語意色細框）。
   * c.textAlign 決定水平對齊（left 時文字從 x 開始），垂直置中於 y；傳回底框 {x, y, w, h}。
   */
  function pill(c, text, x, y, color, fnt) {
    fnt = fnt || font(600, 12);
    c.font = fnt;
    const ph = D.textHeight(c.measureText(text), 15) + 3;
    const al = c.textAlign === 'center' || c.textAlign === 'right' ? c.textAlign : 'left';
    const box = D.pill(c, text, al === 'center' ? x : al === 'right' ? x + 6 : x - 6, y + ph / 2, color, al, fnt);
    c.textAlign = al;
    return box;
  }
  function textW(c, text, fnt) { c.font = fnt; return c.measureText(text).width; }
  /** 字太長時縮小字級，讓文字（加上底框）放得進 maxW；手機版畫面上的字最小 11 px */
  function fitFont(c, text, maxW, size, weight) {
    const minS = L && L.narrow ? 11 / fontScale() : 8;
    const mk = function (s) { return (weight ? weight + ' ' : '') + (+s.toFixed(2)) + 'px ' + FONT; };
    for (let sz = Math.max(size, minS); sz >= minS; sz -= 0.5) {
      if (textW(c, text, mk(sz)) + 12 <= maxW) return mk(sz);
    }
    return mk(minS);
  }
  function fontPx(fnt) { return parseFloat((/(\d+(?:\.\d+)?)px/.exec(fnt) || [0, 12])[1]); }

  /** 向量箭頭（LabDraw.arrow，全站一致）：由 (x0, y0) 沿 (ux, uy) 畫長度 len；broken 時在中段畫截斷記號（≈） */
  function arrow(c, x0, y0, ux, uy, len, lw, color, broken) {
    if (len < 1) return;
    D.arrow(c, x0, y0, x0 + ux * len, y0 + uy * len, color, lw);
    if (broken) {
      const nx = -uy, ny = ux;
      const mx = x0 + ux * len * 0.5, my = y0 + uy * len * 0.5, s = 2.2 * lw;
      c.save();
      c.lineCap = 'round';
      c.strokeStyle = colors['canvas-bg'];
      c.lineWidth = lw + 3;
      c.beginPath(); c.moveTo(mx - ux * 2.5, my - uy * 2.5); c.lineTo(mx + ux * 2.5, my + uy * 2.5); c.stroke();
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.beginPath();
      [-3, 3].forEach(function (o) {
        const bx = mx + ux * o, by = my + uy * o;
        c.moveTo(bx - nx * s + ux * 2, by - ny * s + uy * 2);
        c.lineTo(bx + nx * s - ux * 2, by + ny * s - uy * 2);
      });
      c.stroke();
      c.restore();
    }
  }

  /** 儀表旁的小箭頭（只表示方向與相對大小）：很短時也保留完整的箭頭形狀，底下襯一圈背景色 */
  function miniArrow(c, x, y0, dir, len, color) {
    const head = Math.min(6.4, len), hw = 2.7, yt = y0 + dir * len, yh = yt - dir * head;
    const path = function () {
      c.beginPath();
      c.moveTo(x, yt);
      c.quadraticCurveTo(x + hw * 0.35, yt - dir * head * 0.45, x + hw, yh);
      c.lineTo(x, yh + dir * head * 0.2);
      c.lineTo(x - hw, yh);
      c.quadraticCurveTo(x - hw * 0.35, yt - dir * head * 0.45, x, yt);
      c.closePath();
    };
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = alpha(colors['canvas-bg'], 0.75);
    c.lineWidth = 3;
    if (len > head + 1) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, yh + dir * head * 0.3); c.stroke(); }
    path(); c.stroke();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.6;
    if (len > head + 1) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, yh + dir * head * 0.3); c.stroke(); }
    path(); c.fill();
    c.restore();
  }
  /** 立體方塊（LabDraw.block）：上亮下暗、頂邊高光、底邊暗線；投影只用在快取的圖層或少數物件 */
  function block(c, x, y, w, h, r, base, shadow) {
    D.block(c, x, y, w, h, base, { r: r, shadow: !!shadow });
  }
  /** 圓柱（腿、手臂、脖子、導軌）：左右兩側暗、偏左處亮，看起來是圓的 */
  function cyl(c, x, y, w, h, r, base, vertical) {
    const g = vertical === false ? c.createLinearGradient(0, y, 0, y + h) : c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(base, -0.28));
    g.addColorStop(0.3, shade(base, 0.2));
    g.addColorStop(0.55, base);
    g.addColorStop(1, shade(base, -0.36));
    c.fillStyle = g;
    roundRect(c, x, y, w, h, r);
    c.fill();
    c.strokeStyle = alpha(shade(base, -0.5), colors.dark ? 0.5 : 0.35);
    c.lineWidth = 0.8;
    c.stroke();
  }
  /** 鑲嵌（凹進去）的面板：上緣暗、下緣亮，像嵌在牆裡 */
  function inset(c, x, y, w, h, r, fill) {
    roundRect(c, x, y, w, h, r);
    c.fillStyle = fill;
    c.fill();
    c.save();
    roundRect(c, x, y, w, h, r);
    c.clip();
    const g = c.createLinearGradient(0, y, 0, y + Math.min(h, 8));
    g.addColorStop(0, 'rgba(0,0,0,' + (colors.dark ? 0.45 : 0.22) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x, y, w, Math.min(h, 8));
    c.restore();
    roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
    c.strokeStyle = alpha('#ffffff', colors.dark ? 0.08 : 0.55);
    c.lineWidth = 1;
    c.stroke();
  }

  // ---------- 不變的圖層：大樓的結構、各區域的底色 ----------
  const PR = 10; // 各區塊（大樓、車廂、刻度盤、受力圖）的圓角
  /** 區塊底板：柔和投影、--canvas-bg 底色加極淡暈影（LabDraw.backdrop）與上亮下暗的漸層 */
  function panelCard(c, R) {
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.6)' : alpha(colors.text, 0.16);
    c.shadowBlur = 10;
    c.shadowOffsetY = 2;
    roundRect(c, R.x, R.y, R.w, R.h, PR);
    c.fillStyle = colors['canvas-bg'];
    c.fill();
    c.restore();
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, PR);
    c.clip();
    c.translate(R.x, R.y);
    D.backdrop(c, R.w, R.h);
    const g = c.createLinearGradient(0, 0, 0, R.h);
    g.addColorStop(0, colors.dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.6)');
    g.addColorStop(1, colors.dark ? 'rgba(0,0,0,0.14)' : alpha(colors.text, 0.035));
    c.fillStyle = g;
    c.fillRect(0, 0, R.w, R.h);
    c.restore();
  }
  /** 區塊外框：細邊線＋頂邊高光（像有厚度的面板） */
  function panelRim(c, R) {
    roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, PR);
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.16 : 0.11);
    c.lineWidth = 1;
    c.stroke();
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, PR);
    c.clip();
    c.strokeStyle = colors.dark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.85)';
    c.beginPath(); c.moveTo(R.x + PR, R.y + 1.5); c.lineTo(R.x + R.w - PR, R.y + 1.5); c.stroke();
    c.restore();
  }
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    [L.bld, L.car, L.dial, L.fbd].forEach(function (R) { panelCard(c, R); });
    drawBuildingStatic(c);
    drawCarUnder(c);
    drawDialFace(c);
    drawFBDStatic(c);
    buildDialGlass();
    ovLayer = makeLayer(L.car.x, L.car.y, L.car.w, L.car.h, drawCarOver);
    personLayer = null;
    [L.bld, L.car, L.dial, L.fbd].forEach(function (R) { panelRim(c, R); });
  }

  function drawBuildingStatic(c) {
    const R = L.bld, px = function (v) { return Math.round(v) + 0.5; };
    const dk = colors.dark;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, PR);
    c.clip();
    const gy = YB(0);
    // 天空：上方偏藍、接近地平線較亮（極淡）
    const sky = c.createLinearGradient(0, R.y, 0, gy);
    sky.addColorStop(0, dk ? alpha(mix(colors['canvas-bg'], colors.neg, 0.16), 0.9) : alpha(colors.neg, 0.11));
    sky.addColorStop(0.7, dk ? alpha(colors.neg, 0.05) : alpha(colors.neg, 0.035));
    sky.addColorStop(1, dk ? alpha(colors.star, 0.06) : alpha(colors.star, 0.08));
    c.fillStyle = sky;
    c.fillRect(R.x, R.y, R.w, gy - R.y);
    // 地面以下：泥土的漸層與淡淡的地層線
    const earth = c.createLinearGradient(0, gy, 0, R.y + R.h);
    earth.addColorStop(0, alpha(colors.equi, dk ? 0.3 : 0.22));
    earth.addColorStop(1, alpha(colors.equi, dk ? 0.1 : 0.08));
    c.fillStyle = earth;
    c.fillRect(R.x, gy, R.w, R.y + R.h - gy);
    c.strokeStyle = alpha(colors.equi, dk ? 0.18 : 0.14);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i <= 3; i++) {
      const yy = px(gy + (R.y + R.h - gy) * i / 4);
      c.moveTo(R.x, yy); c.lineTo(R.x + R.w, yy);
    }
    c.stroke();
    // 大樓本體：左亮右暗（光從左上來），靠近地面略暗；投影只畫一次（快取）
    const wall = dk ? shade(colors.surface, 0.07) : shade(colors.surface, -0.035);
    const x0 = L.bx0, x1 = L.bx1, top = YB(Y_ROOF);
    const bgG = c.createLinearGradient(x0, 0, x1, 0);
    bgG.addColorStop(0, shade(wall, dk ? 0.1 : 0.04));
    bgG.addColorStop(0.5, wall);
    bgG.addColorStop(1, shade(wall, dk ? -0.2 : -0.1));
    c.save();
    c.fillStyle = bgG;
    c.shadowColor = dk ? 'rgba(0,0,0,0.6)' : alpha(colors.text, 0.25);
    c.shadowBlur = 10; c.shadowOffsetX = 2; c.shadowOffsetY = 2;
    c.fillRect(x0, top, x1 - x0, gy - top);
    c.restore();
    const ao = c.createLinearGradient(0, top, 0, gy);
    ao.addColorStop(0, dk ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.25)');
    ao.addColorStop(0.75, 'rgba(0,0,0,0)');
    ao.addColorStop(1, dk ? 'rgba(0,0,0,0.2)' : alpha(colors.text, 0.06));
    c.fillStyle = ao;
    c.fillRect(x0, top, x1 - x0, gy - top);
    // 左緣受光的細亮線
    c.fillStyle = dk ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.75)';
    c.fillRect(x0, top, 1, gy - top);
    // 機房（電梯井正上方）與屋頂女兒牆
    const mtop = YB(Y_TOP);
    const mcol = shade(colors.field, dk ? -0.5 : 0.55);
    block(c, L.sx0 - 3, mtop, L.sx1 - L.sx0 + 6, top - mtop, 3, mcol, true);
    c.strokeStyle = alpha(shade(mcol, -0.4), 0.5);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 3; i++) { const vx = px(L.sx0 + 2 + i * 3); c.moveTo(vx, mtop + 3); c.lineTo(vx, mtop + Math.max(5, (top - mtop) * 0.35)); }
    c.stroke();
    block(c, x0 - 2, top - 4, x1 - x0 + 4, 5, 1.5, shade(wall, dk ? 0.14 : -0.14), false);
    // 每層樓：窗戶（嵌入牆面、玻璃反光；亮燈與否是固定的裝飾）、樓板
    const winW = L.narrow ? 0.34 : 0.26;
    const slab = shade(wall, dk ? 0.18 : -0.18);
    for (let n = 1; n <= E.FLOORS; n++) {
      const yf = E.floorY(n), ya = YB(yf + 3), yb = YB(yf);
      const nW = L.narrow ? 1 : 2, span = L.sx0 - x0 - 8;
      for (let k = 0; k < nW; k++) {
        const ww = span * winW * (L.narrow ? 2.3 : 1.4), wx = x0 + 6 + k * (span / nW) + (span / nW - ww) / 2;
        const wy = ya + (yb - ya) * 0.25, wh = (yb - ya) * 0.5;
        const lit = ((n * 7 + k * 3) % 5) < 2;
        if (lit) {
          // 暖色的燈光往外暈開
          const gl = c.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, Math.max(ww, wh) * 1.1);
          gl.addColorStop(0, alpha(colors.star, dk ? 0.28 : 0.16));
          gl.addColorStop(1, alpha(colors.star, 0));
          c.fillStyle = gl;
          c.fillRect(wx - ww, wy - wh, ww * 3, wh * 3);
        }
        // 窗台（下緣的亮邊）
        c.fillStyle = dk ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)';
        c.fillRect(wx - 1, wy + wh, ww + 2, 1.5);
        const wg = c.createLinearGradient(0, wy, 0, wy + wh);
        if (lit) {
          wg.addColorStop(0, alpha(colors.star, dk ? 0.85 : 0.62));
          wg.addColorStop(1, alpha(shade(colors.star, -0.15), dk ? 0.5 : 0.36));
        } else {
          wg.addColorStop(0, alpha(colors.neg, dk ? 0.4 : 0.26));
          wg.addColorStop(1, alpha(shade(colors.neg, -0.3), dk ? 0.22 : 0.14));
        }
        inset(c, wx, wy, ww, wh, 1.5, wg);
        // 玻璃的斜向反光
        c.save();
        roundRect(c, wx, wy, ww, wh, 1.5);
        c.clip();
        c.fillStyle = dk ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.35)';
        c.beginPath();
        c.moveTo(wx + ww * 0.15, wy + wh); c.lineTo(wx + ww * 0.45, wy); c.lineTo(wx + ww * 0.62, wy); c.lineTo(wx + ww * 0.32, wy + wh);
        c.closePath(); c.fill();
        c.restore();
      }
      // 樓板：暗線＋下方細亮線（有厚度）
      c.fillStyle = slab;
      c.fillRect(x0, yb - 1.5, x1 - x0, 2);
      c.fillStyle = dk ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)';
      c.fillRect(x0, yb + 0.5, x1 - x0, 1);
    }
    c.fillStyle = slab;
    c.fillRect(x0, top - 1, x1 - x0, 2);
    // 電梯井（剖面）：較暗的通道，兩側內陰影，延伸到底坑
    const sx0 = L.sx0, sx1 = L.sx1, sb = YB(Y_BOT + 0.15);
    const sg = c.createLinearGradient(sx0, 0, sx1, 0);
    const shaftCol = dk ? shade(colors['canvas-bg'], -0.3) : shade(colors.field, 0.72);
    sg.addColorStop(0, shade(shaftCol, -0.16));
    sg.addColorStop(0.45, shade(shaftCol, 0.04));
    sg.addColorStop(1, shade(shaftCol, -0.22));
    c.fillStyle = sg;
    c.fillRect(sx0, top, sx1 - sx0, sb - top);
    [[sx0, 1], [sx1, -1]].forEach(function (sd) {
      const g = c.createLinearGradient(sd[0], 0, sd[0] + sd[1] * 5, 0);
      g.addColorStop(0, 'rgba(0,0,0,' + (dk ? 0.45 : 0.18) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(Math.min(sd[0], sd[0] + sd[1] * 5), top, 5, sb - top);
    });
    const ts = c.createLinearGradient(0, top, 0, top + 6);
    ts.addColorStop(0, 'rgba(0,0,0,' + (dk ? 0.45 : 0.2) + ')');
    ts.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ts;
    c.fillRect(sx0, top, sx1 - sx0, 6);
    // 各樓層的電梯門框（左側井壁上的細框）
    c.strokeStyle = alpha(colors.text, dk ? 0.16 : 0.12);
    c.lineWidth = 1;
    c.beginPath();
    for (let n = 1; n <= E.FLOORS; n++) {
      const yf = E.floorY(n), da = YB(yf + 2.1), db = YB(yf);
      c.moveTo(px(sx0 - 1), db); c.lineTo(px(sx0 - 1), da); c.lineTo(sx0 + 2, da);
    }
    c.stroke();
    // 導軌：兩條細的金屬管
    [sx0 + 1.5, sx1 - 2.5].forEach(function (rx) {
      c.fillStyle = alpha(colors.text, dk ? 0.35 : 0.28);
      c.fillRect(Math.round(rx) - 0.5, top, 2, sb - top);
      c.fillStyle = dk ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)';
      c.fillRect(Math.round(rx) - 0.5, top, 0.8, sb - top);
    });
    // 地平線（人行道的亮邊＋暗線）
    c.fillStyle = dk ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)';
    c.fillRect(R.x, Math.round(gy) + 1, R.w, 1);
    c.strokeStyle = alpha(colors.text, dk ? 0.35 : 0.28);
    c.beginPath(); c.moveTo(R.x, px(gy)); c.lineTo(R.x + R.w, px(gy)); c.stroke();
    // 底坑緩衝器：彈簧（前後圈明暗）＋頂板
    const bw = Math.max(3, (sx1 - sx0) * 0.14), byb = sb, byt = YB(Y_BOT + 0.9);
    [sx0 + (sx1 - sx0) * 0.28, sx0 + (sx1 - sx0) * 0.72].forEach(function (bx) {
      const nC = 4;
      [0, 1].forEach(function (pass) {
        c.strokeStyle = pass ? shade(colors.muted, dk ? 0.25 : -0.2) : alpha(colors.muted, 0.6);
        c.lineWidth = pass ? 1.3 : 1;
        c.lineCap = 'round';
        c.beginPath();
        for (let i = 0; i < nC * 2; i++) {
          if ((i % 2) !== pass) continue;
          const ya = byb - (byb - byt) * i / (nC * 2), yb2 = byb - (byb - byt) * (i + 1) / (nC * 2);
          const xa = bx + (i % 2 ? bw / 2 : -bw / 2), xb = bx + (i % 2 ? -bw / 2 : bw / 2);
          c.moveTo(xa, ya); c.lineTo(xb, yb2);
        }
        c.stroke();
      });
      block(c, bx - bw * 0.7, byt - 2.5, bw * 1.4, 3, 1, shade(colors.muted, dk ? -0.05 : 0.15), false);
    });
    // 樓層標籤
    c.font = font(600, 11);
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
    const R = L.bld, dk = colors.dark;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, PR);
    ctx.clip();
    const sx0 = L.sx0, sx1 = L.sx1, scx = (sx0 + sx1) / 2;
    const carTop = YB(st.y + CEIL + 0.12), carBot = YB(st.y - 0.06);
    // 預測：纜繩在此刻斷裂、交給限速器時會停在哪裡（紅色虛線，底下襯一層背景色讓它在井裡也清楚）
    if (S.cable === 'ok') {
      const yp = E.predictStop(st.y, st.v, p.vt, p.ab);
      const yy = YB(yp);
      const yc = Math.round(Math.min(YB(Y_BOT), yy)) + 0.5;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = alpha(colors['canvas-bg'], 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx0 - 3, yc); ctx.lineTo(sx1 + 3, yc); ctx.stroke();
      ctx.strokeStyle = alpha(colors.pos, yp < -1e-6 ? 0.95 : 0.7);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(sx0 - 3, yc); ctx.lineTo(sx1 + 3, yc); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 機房滑輪：轉動的角度 = 纜繩移動的距離 / 半徑（純畫面）
    const shR = Math.max(4, Math.min((sx1 - sx0) * 0.3, L.bk * 0.9));
    const shY = YB(Y_ROOF) - (YB(Y_ROOF) - YB(Y_TOP)) * 0.55;
    const rot = S.cable === 'ok' ? -st.y / (shR / L.bk) : (S.cutRot || 0);
    // 纜繩（畫在滑輪後面）
    const ropeBase = shade(colors.muted, dk ? 0.05 : -0.25), ropeLight = shade(colors.muted, dk ? 0.5 : 0.45);
    if (S.cable === 'ok') {
      tube(ctx, [[scx, shY + shR * 0.2], [scx, carTop]], 1.8, ropeBase, ropeLight);
    } else {
      // 斷掉的纜繩：上方垂下一小段，車頂上留一小段（末端散開）
      const yCut = S.cutY != null ? YB(S.cutY) : carTop;
      const hang = Math.min(yCut - shY, 26);
      ctx.strokeStyle = ropeBase; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(scx, shY + shR * 0.2);
      ctx.quadraticCurveTo(scx + 5, shY + hang * 0.6, scx - 2, shY + hang);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(scx, carTop); ctx.quadraticCurveTo(scx + 6, carTop - 6, scx + 3, carTop - 11); ctx.stroke();
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(scx - 2, shY + hang); ctx.lineTo(scx - 4, shY + hang + 3);
      ctx.moveTo(scx - 2, shY + hang); ctx.lineTo(scx, shY + hang + 3.5);
      ctx.moveTo(scx + 3, carTop - 11); ctx.lineTo(scx + 1, carTop - 14);
      ctx.moveTo(scx + 3, carTop - 11); ctx.lineTo(scx + 5.5, carTop - 13.5);
      ctx.stroke();
    }
    sheave(ctx, scx, shY, shR, rot);
    // 開門中的樓層：門縫透出暖光
    const door = doorOpen();
    if (door > 0 && S.doorFloor != null) {
      const yf = E.floorY(S.doorFloor), ya = YB(yf + 2.1), yb = YB(yf);
      const gl = ctx.createLinearGradient(sx0 + 2, 0, sx0 - 14, 0);
      gl.addColorStop(0, alpha(colors.star, 0.45 * door));
      gl.addColorStop(1, alpha(colors.star, 0));
      ctx.fillStyle = gl;
      ctx.fillRect(sx0 - 14, ya, 16, yb - ya);
      ctx.fillStyle = alpha(colors.star, 0.7 * door);
      ctx.fillRect(sx0 - 3, ya, 3 + 2, yb - ya);
    }
    // 車廂：上亮下暗的金屬盒，柔和的投影、亮著燈的車窗、中間的門縫
    const cx0 = sx0 + 2.5, cx1 = sx1 - 2.5, cH = carBot - carTop;
    const ink = dk ? '#000000' : colors.text;
    ctx.fillStyle = alpha(ink, dk ? 0.22 : 0.08);
    roundRect(ctx, cx0 - 1.5, carTop + 1, cx1 - cx0 + 3, cH + 3.5, 3.5);
    ctx.fill();
    ctx.fillStyle = alpha(ink, dk ? 0.25 : 0.1);
    roundRect(ctx, cx0 - 0.5, carTop + 1, cx1 - cx0 + 1, cH + 1.8, 2.5);
    ctx.fill();
    const carCol = dk ? shade(colors.field, -0.25) : shade(colors.field, 0.3);
    block(ctx, cx0, carTop, cx1 - cx0, cH, 2, carCol, false);
    // 車廂內的燈光（從車窗透出）
    const wx0 = cx0 + 2, wx1 = cx1 - 2, wy0 = carTop + 2.5, wh = Math.max(2, cH * 0.6);
    const lg = ctx.createLinearGradient(0, wy0, 0, wy0 + wh);
    lg.addColorStop(0, alpha(colors.star, dk ? 0.75 : 0.62));
    lg.addColorStop(1, alpha(colors.star, dk ? 0.2 : 0.14));
    inset(ctx, wx0, wy0, wx1 - wx0, wh, 1.5, lg);
    // 門的分隔線（暗線＋亮線）
    const dx = Math.round(cx0 + (cx1 - cx0) * 0.5);
    ctx.fillStyle = alpha(shade(carCol, -0.5), 0.55);
    ctx.fillRect(dx - 0.5, carTop + 2, 1, cH - 3);
    ctx.fillStyle = dk ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)';
    ctx.fillRect(dx + 0.5, carTop + 2, 0.8, cH - 3);
    // 目前樓層的標籤反白（強調色的小膠囊）
    const f = E.floorOf(st.y);
    const ft = floorName(f.n);
    ctx.font = font(700, 11);
    const ftm = ctx.measureText(ft), ftw = ftm.width, fph = D.textHeight(ftm, 15) + 3, fpw = ftw + 10;
    const fx0 = L.bx0 - 3 - ftw - 5, fyc = YB(E.floorY(f.n) + 1.5);
    ctx.fillStyle = alpha(ink, dk ? 0.35 : 0.14);
    roundRect(ctx, fx0, fyc - fph / 2 + 1, fpw, fph, fph / 2);
    ctx.fill();
    const fg = ctx.createLinearGradient(0, fyc - fph / 2, 0, fyc + fph / 2);
    fg.addColorStop(0, shade(colors.accent, 0.16));
    fg.addColorStop(1, shade(colors.accent, -0.12));
    ctx.fillStyle = fg;
    roundRect(ctx, fx0, fyc - fph / 2, fpw, fph, fph / 2);
    ctx.fill();
    ctx.fillStyle = colors.surface;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ft, fx0 + fpw / 2, fyc + 0.5);
    // 排隊中的樓層：發光的小燈
    S.queue.concat(S.run && !S.run.ended && S.run.kind === 'trip' ? [S.run.toFloor] : []).forEach(function (n) {
      D.ball(ctx, L.bx0 + 4, YB(E.floorY(n) + 1.5), 2.6, colors.star, { glow: dk ? 0.7 : 0.45, shadow: false });
    });
    // 短暫的視覺回饋（純裝飾，不影響物理）：斷纜的火花與波紋、煞車的火花
    const now = performance.now();
    S.fx.forEach(function (f) {
      const u = (now - f.t0) / f.dur;
      if (u < 0 || u > 1) return;
      if (f.type === 'snap') {
        D.ripple(ctx, scx, carTop, 4, u, colors.star);
        ctx.strokeStyle = alpha(colors.star, 0.95 * (1 - u));
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + 0.3, r0 = 3 + 10 * u, r1 = r0 + 5 * (1 - u * 0.5);
          ctx.moveTo(scx + Math.cos(a) * r0, carTop + Math.sin(a) * r0);
          ctx.lineTo(scx + Math.cos(a) * r1, carTop + Math.sin(a) * r1);
        }
        ctx.stroke();
      } else if (f.type === 'spark') {
        // 安全鉗夾住導軌：兩側往外、往下噴的火花
        const y = (carTop + carBot) / 2;
        ctx.lineCap = 'round';
        [[sx0, -1], [sx1, 1]].forEach(function (sd) {
          for (let i = 0; i < 5; i++) {
            const a = (0.15 + i * 0.32) * Math.PI / 2, d = 3 + 14 * u + i * 1.5, len = 4 * (1 - u) + 1.5;
            const x0 = sd[0] + sd[1] * Math.cos(a) * d, y0 = y + Math.sin(a) * d + 6 * u * u;
            ctx.strokeStyle = alpha(i % 2 ? colors.star : mix(colors.star, colors.pos, 0.5), 0.95 * (1 - u));
            ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + sd[1] * Math.cos(a) * len, y0 + Math.sin(a) * len); ctx.stroke();
          }
        });
      }
    });
    ctx.restore();
  }
  /** 滑輪：立體的輪子（LabDraw.ball 快取）、輪槽、三根轉動的輪輻、輪轂 */
  function sheave(c, x, y, r, rot) {
    const col = colors.dark ? shade(colors.muted, -0.15) : shade(colors.muted, 0.15);
    D.ball(c, x, y, r, col, { glow: 0 });
    c.strokeStyle = alpha(shade(col, -0.45), 0.55);
    c.lineWidth = Math.max(0.8, r * 0.12);
    c.beginPath(); c.arc(x, y, r * 0.8, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = alpha(shade(col, -0.55), 0.85);
    c.lineWidth = Math.max(1, r * 0.14);
    c.lineCap = 'round';
    c.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = rot + k * Math.PI * 2 / 3;
      c.moveTo(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22); c.lineTo(x + Math.cos(a) * r * 0.74, y + Math.sin(a) * r * 0.74);
    }
    c.stroke();
    D.ball(c, x, y, Math.max(1.4, r * 0.24), shade(col, -0.2), { glow: 0, shadow: false });
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

  /** 車廂的底層（畫在 bg）：後牆（依比例的平面）、透視的側牆、天花板與地板 */
  function drawCarUnder(c) {
    const R = L.car, k = L.ik, wM = L.wM, dk = colors.dark;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, PR);
    c.clip();
    const xl = XI(0), xr = XI(wM), zf = ZI(0), zc = ZI(CEIL);
    const RL = R.x, RR = R.x + R.w, RT = R.y, RB = R.y + R.h;
    const metal = carMetal();
    const quad = function (pts, fill) {
      c.beginPath();
      pts.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
      c.closePath();
      c.fillStyle = fill;
      c.fill();
    };
    // 後牆：金屬板，中間略亮
    const wallG = c.createLinearGradient(xl, 0, xr, 0);
    wallG.addColorStop(0, shade(metal, -0.1));
    wallG.addColorStop(0.45, shade(metal, 0.06));
    wallG.addColorStop(1, shade(metal, -0.12));
    c.fillStyle = wallG;
    c.fillRect(xl, zc, xr - xl, zf - zc);
    const wallV = c.createLinearGradient(0, zc, 0, zf);
    wallV.addColorStop(0, dk ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.25)');
    wallV.addColorStop(1, dk ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.04)');
    c.fillStyle = wallV;
    c.fillRect(xl, zc, xr - xl, zf - zc);
    // 牆板的接縫（暗線＋右側亮線）
    for (let i = 1; i < 4; i++) {
      const sx = Math.round(xl + (xr - xl) * i / 4);
      c.fillStyle = alpha(shade(metal, -0.5), dk ? 0.6 : 0.35);
      c.fillRect(sx - 0.5, zc, 1, zf - zc);
      c.fillStyle = dk ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)';
      c.fillRect(sx + 0.5, zc, 1, zf - zc);
    }
    // 踢腳板
    const kz = ZI(0.1);
    const kg = c.createLinearGradient(0, kz, 0, zf);
    kg.addColorStop(0, shade(metal, dk ? 0.06 : -0.1));
    kg.addColorStop(1, shade(metal, dk ? -0.15 : -0.2));
    c.fillStyle = kg;
    c.fillRect(xl, kz, xr - xl, zf - kz);
    c.fillStyle = dk ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)';
    c.fillRect(xl, Math.round(kz), xr - xl, 1);
    // 天花板（透視梯形）
    const ceilG = c.createLinearGradient(0, RT, 0, zc);
    ceilG.addColorStop(0, shade(metal, dk ? -0.35 : -0.3));
    ceilG.addColorStop(1, shade(metal, dk ? -0.1 : -0.08));
    quad([[RL, RT], [RR, RT], [xr, zc], [xl, zc]], ceilG);
    // 側牆（透視梯形，較暗）
    [[RL, xl, 1], [RR, xr, -1]].forEach(function (sd) {
      const g = c.createLinearGradient(sd[0], 0, sd[1], 0);
      g.addColorStop(0, shade(metal, dk ? -0.42 : -0.3));
      g.addColorStop(1, shade(metal, dk ? -0.2 : -0.12));
      quad([[sd[0], RT], [sd[1], zc], [sd[1], zf], [sd[0], RB]], g);
    });
    // 地板（透視梯形）：磁磚接縫往遠處收斂
    const floorCol = mix(colors.field, colors.equi, 0.18);
    const fz = c.createLinearGradient(0, zf, 0, RB);
    fz.addColorStop(0, shade(floorCol, dk ? -0.55 : 0.5));
    fz.addColorStop(1, shade(floorCol, dk ? -0.38 : 0.28));
    quad([[xl, zf], [xr, zf], [RR, RB], [RL, RB]], fz);
    c.strokeStyle = alpha(shade(floorCol, -0.5), dk ? 0.35 : 0.18);
    c.lineWidth = 1;
    c.beginPath();
    const nT = 6;
    for (let i = 0; i <= nT; i++) {
      c.moveTo(xl + (xr - xl) * i / nT, zf);
      c.lineTo(RL + (RR - RL) * i / nT, RB);
    }
    const zm = zf + (RB - zf) * 0.42, um = 0.42;
    c.moveTo(xl + (RL - xl) * um, zm); c.lineTo(xr + (RR - xr) * um, zm);
    c.stroke();
    // 牆角的稜線
    c.strokeStyle = alpha(shade(metal, -0.6), dk ? 0.6 : 0.3);
    c.beginPath();
    c.moveTo(RL, RT); c.lineTo(xl, zc); c.lineTo(xr, zc); c.lineTo(RR, RT);
    c.moveTo(RL, RB); c.lineTo(xl, zf); c.lineTo(xr, zf); c.lineTo(RR, RB);
    c.moveTo(Math.round(xl) + 0.5, zc); c.lineTo(Math.round(xl) + 0.5, zf);
    c.moveTo(Math.round(xr) - 0.5, zc); c.lineTo(Math.round(xr) - 0.5, zf);
    c.stroke();
    c.fillStyle = dk ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)';
    c.fillRect(xl, Math.round(zf), xr - xl, 1);
    // 天花板的燈條（發光）
    const lx0 = XI(wM * 0.25), lx1 = XI(wM * 0.75);
    const halo = c.createLinearGradient(0, zc - 6, 0, zc + 3);
    halo.addColorStop(0, alpha(colors.star, 0));
    halo.addColorStop(0.6, alpha(colors.star, dk ? 0.3 : 0.22));
    halo.addColorStop(1, alpha(colors.star, 0));
    c.fillStyle = halo;
    c.fillRect(lx0 - 6, zc - 6, lx1 - lx0 + 12, 9);
    c.fillStyle = dk ? 'rgba(255,250,235,0.7)' : '#ffffff';
    roundRect(c, lx0, zc - 3, lx1 - lx0, 3, 1.5);
    c.fill();
    c.restore();
  }
  /** 車廂的上層（玻璃之上）：燈光、玻璃反光與外框、扶手、彈簧秤的掛鉤座與刻度尺 */
  function drawCarOver(c) {
    const R = L.car, k = L.ik, wM = L.wM, g = glassRect(), zc = ZI(CEIL), dk = colors.dark;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, PR);
    c.clip();
    // 燈光灑在後牆上
    const lcx = XI(wM * 0.5), lw = XI(wM * 0.8) - XI(wM * 0.2);
    c.save();
    c.translate(lcx, zc);
    c.scale(1, 0.55 * k / (lw * 0.5));
    const lamp = c.createRadialGradient(0, 0, 0, 0, 0, lw * 0.5);
    lamp.addColorStop(0, alpha(colors.star, dk ? 0.3 : 0.2));
    lamp.addColorStop(1, alpha(colors.star, 0));
    c.fillStyle = lamp;
    c.fillRect(-lw * 0.5, 0, lw, lw * 0.5);
    c.restore();
    // 玻璃：上緣的內陰影、斜向反光
    c.save();
    roundRect(c, g.x0, g.z0, g.x1 - g.x0, g.z1 - g.z0, 4);
    c.clip();
    const ish = c.createLinearGradient(0, g.z0, 0, g.z0 + 10);
    ish.addColorStop(0, 'rgba(0,0,0,' + (dk ? 0.4 : 0.16) + ')');
    ish.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ish;
    c.fillRect(g.x0, g.z0, g.x1 - g.x0, 10);
    const gl = c.createLinearGradient(g.x0, g.z0, g.x1, g.z1);
    gl.addColorStop(0, 'rgba(255,255,255,' + (dk ? 0.07 : 0.28) + ')');
    gl.addColorStop(0.3, 'rgba(255,255,255,0)');
    gl.addColorStop(0.58, 'rgba(255,255,255,0)');
    gl.addColorStop(0.66, 'rgba(255,255,255,' + (dk ? 0.05 : 0.16) + ')');
    gl.addColorStop(0.72, 'rgba(255,255,255,0)');
    gl.addColorStop(0.76, 'rgba(255,255,255,' + (dk ? 0.03 : 0.1) + ')');
    gl.addColorStop(0.8, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.fillRect(g.x0, g.z0, g.x1 - g.x0, g.z1 - g.z0);
    c.restore();
    // 窗框：外暗內亮（有厚度）
    c.strokeStyle = alpha(shade(carMetal(), -0.55), dk ? 0.8 : 0.45);
    c.lineWidth = 2;
    roundRect(c, g.x0, g.z0, g.x1 - g.x0, g.z1 - g.z0, 4);
    c.stroke();
    c.strokeStyle = dk ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)';
    c.lineWidth = 1;
    roundRect(c, g.x0 + 1.5, g.z0 + 1.5, g.x1 - g.x0 - 3, g.z1 - g.z0 - 3, 3);
    c.stroke();
    // 扶手：兩個支架＋金屬管
    const hz = ZI(0.95), railCol = shade(colors.muted, dk ? -0.05 : 0.05);
    [g.x0 + 10, g.x1 - 10].forEach(function (bx) {
      cyl(c, bx - 2, hz, 4, Math.max(5, 0.07 * k), 1.5, shade(railCol, -0.15));
    });
    tube(c, [[g.x0 - 2, hz], [g.x1 + 2, hz]], 4.4, shade(railCol, dk ? -0.25 : -0.2), shade(railCol, 0.65));
    // 彈簧秤：掛鉤座與刻度尺（0 對準彈簧原長的末端，每 5 N 一格）
    const X = XI(L.xs), zZero = CEIL - 0.05 - SPRING_L0;
    block(c, X - 0.05 * k, ZI(CEIL), 0.1 * k, 0.04 * k, 2, colors.muted, true);
    const sr = springRuler();
    const zR0 = zZero + 0.03, zR1 = zZero - RULER_N / E.K_SPRING - 0.03;
    block(c, sr.rx, ZI(zR0), sr.rw, (zR0 - zR1) * k, 3, dk ? shade(colors.surface, 0.18) : shade(colors.surface, -0.01), true);
    c.strokeStyle = alpha(colors.text, dk ? 0.6 : 0.55);
    c.lineWidth = 1;
    c.font = font(600, 10);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = colors.muted;
    c.beginPath();
    for (let n = 0; n <= RULER_N; n += 5) {
      const yy = Math.round(ZI(zZero - n / E.K_SPRING)) + 0.5;
      const major = n % 10 === 0;
      c.moveTo(sr.rx + 1, yy); c.lineTo(sr.rx + (major ? 6.5 : 4), yy);
      if (major) c.fillText(String(n), sr.rx + 8, yy + 0.5);
    }
    c.stroke();
    c.textAlign = 'center';
    c.fillText('N', sr.rx + sr.rw / 2, ZI(zR1) + 8);
    c.restore();
  }
  function springRuler() {
    const k = L.ik, X = XI(L.xs);
    // 刻度尺的寬度依數字的字寬（寬度不是物理量；刻度的高度位置才是）
    ctx.font = font(600, 10);
    return { rx: X + Math.max(0.12 * k, 16), rw: Math.max(16, 0.11 * k, Math.ceil(ctx.measureText('40').width) + 13) };
  }

  // ---------- 車廂內部（依比例） ----------
  function drawCar(st, p) {
    const R = L.car;
    const k = L.ik, dk = colors.dark;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, PR);
    ctx.clip();
    // 後牆的玻璃：看出去是電梯井的牆，隨電梯上下捲動（相對運動，依比例）
    const g = glassRect(), gx0 = g.x0, gx1 = g.x1, gz0 = g.z0, gz1 = g.z1;
    ctx.save();
    roundRect(ctx, gx0, gz0, gx1 - gx0, gz1 - gz0, 4);
    ctx.clip();
    const shaftCol = dk ? shade(colors['canvas-bg'], -0.25) : shade(colors.field, 0.68);
    const sgr = ctx.createLinearGradient(gx0, 0, gx1, 0);
    sgr.addColorStop(0, shade(shaftCol, -0.08));
    sgr.addColorStop(0.5, shade(shaftCol, 0.03));
    sgr.addColorStop(1, shade(shaftCol, -0.1));
    ctx.fillStyle = sgr;
    ctx.fillRect(gx0, gz0, gx1 - gx0, gz1 - gz0);
    // 混凝土的縱向接縫
    ctx.strokeStyle = alpha(colors.text, dk ? 0.07 : 0.06);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = gx0 + 18; x < gx1; x += 36) { ctx.moveTo(Math.round(x) + 0.5, gz0); ctx.lineTo(Math.round(x) + 0.5, gz1); }
    ctx.stroke();
    // 導軌與每 1.5 m 一個的固定架（隨電梯捲動，看得出速度）
    const railX = gx0 + Math.max(10, (gx1 - gx0) * 0.08);
    const railCol = alpha(colors.text, dk ? 0.24 : 0.2);
    ctx.fillStyle = railCol;
    ctx.fillRect(railX - 2, gz0, 4, gz1 - gz0);
    ctx.fillStyle = dk ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.55)';
    ctx.fillRect(railX - 1.5, gz0, 1, gz1 - gz0);
    const zT = (gz0 - ZI(0)) / -k, zB = (gz1 - ZI(0)) / -k; // 玻璃上下緣對應的車廂內高度
    for (let yb = Math.floor((st.y + zB) / 1.5) * 1.5; yb <= st.y + zT + 1.5; yb += 1.5) {
      const yy = ZI(yb - st.y);
      ctx.fillStyle = alpha(colors.text, dk ? 0.3 : 0.24);
      ctx.fillRect(railX - 7, yy - 2, 14, 4);
      ctx.fillStyle = dk ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)';
      ctx.fillRect(railX - 7, yy - 2, 14, 1);
      ctx.fillStyle = alpha(colors.text, dk ? 0.12 : 0.1);
      ctx.fillRect(railX + 7, yy - 1, (gx1 - gx0) * 0.05, 2);
    }
    // 每層的樓板與樓層編號（電梯往上，這些往下捲）
    const slabTop = shade(shaftCol, dk ? 0.2 : -0.2), slabBody = shade(shaftCol, dk ? 0.08 : -0.08);
    for (let n = 0; n <= E.FLOORS + 1; n++) {
      const z = E.floorY(n) - st.y; // 這一層樓板相對車廂地板的高度
      if (z < zB - 3.2 || z > zT + 0.6) continue;
      const yy = ZI(z);
      ctx.fillStyle = slabBody;
      ctx.fillRect(gx0, yy, gx1 - gx0, 0.3 * k);
      ctx.fillStyle = slabTop;
      ctx.fillRect(gx0, yy, gx1 - gx0, Math.max(2, 0.06 * k));
      ctx.fillStyle = dk ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.45)';
      ctx.fillRect(gx0, yy, gx1 - gx0, 1);
      const sh = ctx.createLinearGradient(0, yy + 0.3 * k, 0, yy + 0.3 * k + 6);
      sh.addColorStop(0, 'rgba(0,0,0,' + (dk ? 0.3 : 0.1) + ')');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(gx0, yy + 0.3 * k, gx1 - gx0, 6);
      if (n >= 1 && n <= E.FLOORS) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '800 ' + Math.round(Math.max(13, Math.min(30, 0.22 * k))) + 'px ' + FONT;
        ctx.fillStyle = alpha(colors.text, dk ? 0.2 : 0.17);
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
    const R = L.car, f = E.floorOf(st.y), dk = colors.dark;
    const hide = hiddenNow();
    // 樓層顯示器（掛在天花板下）：金屬外框、深色面板、發光的數字
    const fs = L.narrow ? 13 : 15;
    const txt = floorName(f.n);
    const dirTxt = Math.abs(st.v) < 1e-6 ? '' : st.v > 0 ? '▲' : '▼';
    ctx.font = '700 ' + fs + 'px ui-monospace, Menlo, Consolas, monospace';
    const tw = ctx.measureText('▲ 10F').width + 14;
    const cx = R.x + 10 + tw / 2, cy = ZI(CEIL) + fs * 0.95;
    const bh = fs * 1.56;
    const bez = ctx.createLinearGradient(0, cy - bh / 2 - 2, 0, cy + bh / 2 + 2);
    bez.addColorStop(0, shade(colors.muted, dk ? 0.1 : 0.55));
    bez.addColorStop(1, shade(colors.muted, dk ? -0.45 : -0.15));
    ctx.fillStyle = alpha(dk ? '#000000' : colors.text, dk ? 0.4 : 0.18);
    roundRect(ctx, cx - tw / 2 - 2, cy - bh / 2 - 0.5, tw + 4, bh + 4, 7);
    ctx.fill();
    ctx.fillStyle = bez;
    roundRect(ctx, cx - tw / 2 - 2, cy - bh / 2 - 2, tw + 4, bh + 4, 7);
    ctx.fill();
    const scr = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
    scr.addColorStop(0, dk ? '#05080a' : '#11171a');
    scr.addColorStop(1, dk ? '#111a1d' : '#253035');
    ctx.fillStyle = scr;
    roundRect(ctx, cx - tw / 2, cy - bh / 2, tw, bh, 5);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ledTxt = (dirTxt ? dirTxt + ' ' : '') + txt;
    ctx.strokeStyle = alpha(colors.star, 0.3);
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeText(ledTxt, cx, cy + 1);
    ctx.fillStyle = dk ? colors.star : '#ffc93c';
    ctx.fillText(ledTxt, cx, cy + 1);
    // 面板玻璃的反光
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, cx - tw / 2 + 2, cy - bh / 2 + 1.5, tw - 4, bh * 0.38, 3);
    ctx.fill();
    S.fx.forEach(function (fx) {
      if (fx.type !== 'arrive') return;
      const u = (performance.now() - fx.t0) / fx.dur;
      if (u < 0 || u > 1) return;
      ctx.strokeStyle = alpha(colors.star, 0.8 * (1 - u));
      ctx.lineWidth = 2;
      roundRect(ctx, cx - tw / 2 - 3 - 6 * u, cy - bh / 2 - 3 - 6 * u, tw + 6 + 12 * u, bh + 6 + 12 * u, 7);
      ctx.stroke();
    });
    // 左上角一欄：狀態（超重／失重…）、v、a；寬度不超過彈簧秤左側
    const ph = E.phaseOf(st.a);
    const pc = phaseColor(ph);
    const x0 = R.x + 8, colW = XI(L.xs) - 0.07 * L.ik - x0 - 6;
    const rowH = L.narrow ? 18 : 22;
    let y0 = cy + bh / 2 + rowH * 0.62;
    const phLong = phaseName(ph) + (ph === 'normal' ? T('：視重 = 實重', ': reading = true weight') : ph === 'over' ? T('：視重 > 實重', ': reading > true weight')
      : ph === 'under' ? T('：視重 < 實重', ': reading < true weight') : T('：視重 = 0', ': reading = 0'));
    const phSize = L.narrow ? 11 : 13;
    let phT = phLong;
    let phFont = fitFont(ctx, phLong, colW, phSize, 700);
    if (textW(ctx, phLong, phFont) + 12 > colW || fontPx(phFont) * fontScale() < 10.5) { phT = phaseName(ph); phFont = fitFont(ctx, phT, colW, phSize, 700); }
    ctx.textAlign = 'left';
    pill(ctx, phT, x0 + 2, y0, ph === 'normal' ? colors.text : shade(pc, dk ? 0.1 : -0.15), phFont);
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
      const box = pill(ctx, t, x0 + 16, yy, shade(r.col, dk ? 0.1 : -0.2), f2);
      // 小箭頭：長度 ∝ 大小（最多 11 px）
      if (!hide && Math.abs(r.v) > 1e-6) {
        const len = 4 + 7 * Math.min(1, Math.abs(r.v) / r.max);
        const yA = yy + (r.v > 0 ? len / 2 : -len / 2);
        miniArrow(ctx, box.x - 5, yA, r.v > 0 ? -1 : 1, len, r.col);
      } else if (!hide) {
        D.ball(ctx, box.x - 5, yy, 2.2, r.col, { shadow: false, glow: 0 });
      }
    });
  }

  /** 人（含體重計）畫成快取的小圖，只有質量、主題或版面改變時重畫 */
  function drawPersonCached(p) {
    const key = [p.m, cw, dpr, colors.accent, colors.dark, D.ver].join('|');
    if (!personLayer || key !== personKey) {
      personKey = key;
      const x0 = XI(L.xp - 0.42), x1 = XI(L.xp + 0.5), y0 = ZI(1.9), y1 = ZI(-0.08);
      personLayer = makeLayer(x0, y0, x1 - x0, y1 - y0, function (c) { drawPerson(c, p); });
    }
    blit(personLayer);
  }
  /** 人：站在體重計上，右手拿著小球（身體各部位用圓柱的明暗，看起來有體積） */
  function drawPerson(ctx, p) {
    const k = L.ik, xp = L.xp, dk = colors.dark;
    const X = function (x) { return XI(xp + x); };
    const s = Math.sqrt(p.m / 60); // 身材隨質量略變胖瘦（只影響外觀）
    const z0 = 0.07; // 秤面高度
    // 體重計：地上的接觸陰影、立體的秤、秤面上的小螢幕
    const sw = 0.36, sh = 0.07;
    D.contactShadow(ctx, X(0), ZI(0) + 0.5, sw * 0.5 * k, 0);
    const scaleCol = dk ? shade(colors.surface, 0.25) : shade(colors.surface, -0.06);
    block(ctx, X(-sw / 2), ZI(sh), sw * k, sh * k, Math.min(6, 0.025 * k), scaleCol, false);
    inset(ctx, X(-0.06), ZI(sh) + 0.012 * k, 0.12 * k, Math.max(3, 0.03 * k), 2, dk ? '#070b0d' : '#1d2427');
    ctx.fillStyle = alpha(colors.probe, 0.6);
    ctx.fillRect(X(-0.04), ZI(sh) + 0.012 * k + Math.max(3, 0.03 * k) / 2 - 0.5, 0.08 * k, 1);
    const shoe = dk ? shade(colors.field, -0.7) : shade(colors.field, -0.2);
    const pants = dk ? shade(colors.neg, -0.45) : shade(colors.neg, -0.35);
    const shirt = colors.accent;
    const skin = mix(colors.equi, '#ffffff', 0.55);
    const hair = dk ? shade(colors.field, -0.75) : shade(colors.field, -0.25);
    const legW = 0.09 * s, hipW = 0.3 * s;
    // 腿與鞋子
    [-1, 1].forEach(function (sd) {
      const lx = sd * hipW * 0.27;
      cyl(ctx, X(lx - legW / 2), ZI(0.88), legW * k, (0.88 - z0 - 0.04) * k, legW * k * 0.4, sd < 0 ? shade(pants, -0.06) : pants);
      block(ctx, X(lx - legW / 2 - 0.01), ZI(z0 + 0.05), (legW + 0.06) * k, 0.05 * k, 0.02 * k, shoe, false);
      ctx.fillStyle = alpha(shade(shoe, 0.5), dk ? 0.35 : 0.5);
      ctx.fillRect(X(lx - legW / 2 - 0.005), ZI(z0 + 0.012), (legW + 0.05) * k, Math.max(1, 0.008 * k));
    });
    // 身體：圓柱明暗、腰部的皮帶、領口
    const bx0 = X(-hipW / 2), bw = hipW * k, byTop = ZI(1.46), bh = (1.46 - 0.84) * k;
    cyl(ctx, bx0, byTop, bw, bh, 0.07 * k, shirt);
    ctx.save();
    roundRect(ctx, bx0, byTop, bw, bh, 0.07 * k);
    ctx.clip();
    const belt = ctx.createLinearGradient(bx0, 0, bx0 + bw, 0);
    belt.addColorStop(0, shade(pants, -0.35)); belt.addColorStop(0.35, shade(pants, -0.05)); belt.addColorStop(1, shade(pants, -0.45));
    ctx.fillStyle = belt;
    ctx.fillRect(bx0, ZI(0.9), bw, 0.04 * k);
    const shoulder = ctx.createLinearGradient(0, byTop, 0, byTop + 0.12 * k);
    shoulder.addColorStop(0, alpha('#ffffff', dk ? 0.12 : 0.22));
    shoulder.addColorStop(1, alpha('#ffffff', 0));
    ctx.fillStyle = shoulder;
    ctx.fillRect(bx0, byTop, bw, 0.12 * k);
    ctx.restore();
    // 左手（自然下垂，在身體前面）
    cyl(ctx, X(-hipW / 2 - 0.07), ZI(1.42), 0.075 * k, 0.55 * k, 0.035 * k, shade(shirt, -0.1));
    D.ball(ctx, X(-hipW / 2 - 0.033), ZI(0.85), 0.042 * k, skin, { shadow: false, glow: 0 });
    // 脖子與頭
    cyl(ctx, X(-0.035), ZI(1.53), 0.07 * k, 0.09 * k, 0.02 * k, shade(skin, -0.1));
    const hx = X(0), hy = ZI(1.64), hr = 0.115 * k;
    ctx.fillStyle = alpha(shade(shirt, -0.6), 0.35);
    ctx.beginPath(); ctx.ellipse(hx, ZI(1.46) + 1, 0.06 * k, 0.018 * k, 0, 0, Math.PI * 2); ctx.fill();
    const hg = ctx.createRadialGradient(hx - hr * 0.35, hy - hr * 0.4, hr * 0.1, hx, hy, hr);
    hg.addColorStop(0, shade(skin, 0.4));
    hg.addColorStop(0.6, skin);
    hg.addColorStop(1, shade(skin, -0.22));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(shade(skin, -0.5), 0.35);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // 耳朵
    ctx.fillStyle = shade(skin, -0.1);
    ctx.beginPath(); ctx.ellipse(hx - hr * 0.12, hy + hr * 0.08, hr * 0.13, hr * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    // 頭髮：有光澤的弧面
    const hairG = ctx.createLinearGradient(hx - hr, hy - hr, hx + hr * 0.6, hy);
    hairG.addColorStop(0, shade(hair, dk ? 0.35 : 0.3));
    hairG.addColorStop(1, hair);
    ctx.fillStyle = hairG;
    ctx.beginPath(); ctx.arc(hx, hy - hr * 0.1, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = alpha('#ffffff', dk ? 0.18 : 0.3);
    ctx.lineWidth = Math.max(0.8, hr * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(hx, hy - hr * 0.1, hr * 0.78, Math.PI * 1.25, Math.PI * 1.5); ctx.stroke();
    // 眼睛（看向小球，帶一點反光）與微笑
    const ex = hx + hr * 0.42, ey = hy + hr * 0.05, er = Math.max(1, hr * 0.09);
    ctx.fillStyle = dk ? '#111' : '#222';
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(ex + er * 0.3, ey - er * 0.35, er * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(shade(skin, -0.55), 0.6);
    ctx.lineWidth = Math.max(0.8, hr * 0.06);
    ctx.beginPath(); ctx.arc(hx + hr * 0.5, hy + hr * 0.3, hr * 0.22, Math.PI * 0.25, Math.PI * 0.7); ctx.stroke();
    // 右手：伸向前方拿球（手在 ball 上方）；袖子是有明暗的管子
    const shX = X(hipW * 0.32), shY = ZI(1.38);
    const handX = XI(xp + 0.36), handY = ZI(HB + 2 * BALL_R + 0.03);
    const aw = 0.075 * k;
    const armPath = function (dy) { ctx.beginPath(); ctx.moveTo(shX, shY + dy); ctx.quadraticCurveTo(shX + 0.16 * k, shY + 0.02 * k + dy, handX - 0.02 * k, handY - 0.02 * k + dy); };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    armPath(0); ctx.strokeStyle = shade(shirt, -0.25); ctx.lineWidth = aw; ctx.stroke();
    armPath(-aw * 0.12); ctx.strokeStyle = shade(shirt, 0.04); ctx.lineWidth = aw * 0.66; ctx.stroke();
    armPath(-aw * 0.26); ctx.strokeStyle = alpha(shade(shirt, 0.6), dk ? 0.3 : 0.45); ctx.lineWidth = Math.max(0.8, aw * 0.18); ctx.stroke();
    D.ball(ctx, handX, handY, 0.04 * k, skin, { shadow: false, glow: 0 });
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
    // 地板上的接觸陰影（越高越淡、越大）
    D.contactShadow(ctx, x, ZI(0) + 1, r * 1.1, Math.min(1, z / HB));
    // 落下中：最近 0.25 s 走過的路徑（相對車廂，精確計算）畫成漸淡、漸細的拖尾
    if (S.ball.st === 'air') {
      const tb0 = Math.max(S.ball.tr, S.track[0].t0, S.t - 0.25);
      const y0 = ZI(Math.max(0, E.ballHeight(S.track, S.ball, tb0)) + BALL_R);
      if (Math.abs(y - y0) > 1) {
        const tg = ctx.createLinearGradient(0, y0, 0, y);
        tg.addColorStop(0, alpha(colors.pos, 0));
        tg.addColorStop(1, alpha(colors.pos, colors.dark ? 0.4 : 0.3));
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.2, y0); ctx.lineTo(x + r * 0.2, y0);
        ctx.lineTo(x + r * 0.85, y); ctx.lineTo(x - r * 0.85, y);
        ctx.closePath();
        ctx.fill();
      }
    }
    D.ball(ctx, x, y, r, colors.pos);
    // 放開的高度 h（虛線標示）
    const xr = x + r + 8;
    if (S.ball.st !== 'hand') {
      ctx.strokeStyle = alpha(colors.muted, 0.7);
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(xr, ZI(HB)); ctx.lineTo(xr, ZI(0)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(xr - 3, ZI(HB) + 0.5); ctx.lineTo(xr + 3, ZI(HB) + 0.5); ctx.stroke();
      ctx.textAlign = 'left';
      pill(ctx, 'h = ' + num(HB, 2) + ' m', xr + 6, ZI(HB * 0.55), colors.muted, font(600, 11));
    }
    if (S.ball.st === 'floor' && S.ball.result) {
      // 落地時間：放在高度線右側，不壓到人的腳
      ctx.textAlign = 'left';
      pill(ctx, 't = ' + num(S.ball.result.t, 3) + ' s', xr + 6, ZI(0.3), shade(colors.pos, colors.dark ? 0.1 : -0.1), font(700, 12));
    }
    // 落地的波紋（純裝飾）
    S.fx.forEach(function (f) {
      if (f.type !== 'land') return;
      const u = (performance.now() - f.t0) / f.dur;
      if (u < 0 || u > 1) return;
      ctx.strokeStyle = alpha(colors.pos, 0.55 * (1 - u));
      ctx.lineWidth = 2 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.ellipse(x, ZI(0), r * (1 + 2.5 * u), r * 0.35 * (1 + 2.5 * u), 0, 0, Math.PI * 2); ctx.stroke();
    });
  }

  /** 彈簧秤：天花板的掛鉤、彈簧（伸長量 x = T/k，依比例）、刻度尺（N）、吊掛的物體 */
  function drawSpringScale(st, p) {
    const k = L.ik, xs = L.xs, dk = colors.dark;
    const Ts = E.springTension(p.ms, st.a), ext = E.springExtension(Ts);
    const zTop = CEIL - 0.05, zZero = zTop - SPRING_L0, zEnd = zZero - ext;
    const X = XI(xs);
    const rx = springRuler().rx;
    // 彈簧：後圈較暗較細、前圈是有亮邊的金屬線（圓柱感）
    const coils = 12, sw = 0.045 * k;
    const yA = ZI(zTop), yB = ZI(zEnd);
    const wire = shade(colors.muted, dk ? 0.2 : -0.3);
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 3; pass++) {
      ctx.strokeStyle = pass === 0 ? alpha(shade(wire, dk ? -0.35 : 0.35), 0.9) : pass === 1 ? wire : alpha(shade(wire, 0.7), dk ? 0.45 : 0.6);
      ctx.lineWidth = pass === 0 ? 1.3 : pass === 1 ? 1.9 : 0.7;
      ctx.beginPath();
      for (let i = 0; i < coils; i++) {
        const ya = yA + (yB - yA) * (i / coils), yb = yA + (yB - yA) * ((i + 0.5) / coils), yc = yA + (yB - yA) * ((i + 1) / coils);
        if (pass === 0) { ctx.moveTo(X + sw, yb); ctx.lineTo(X - sw, yc); }
        else { const o = pass === 2 ? -0.5 : 0; ctx.moveTo(X - sw, ya + o); ctx.lineTo(X + sw, yb + o); }
      }
      ctx.stroke();
    }
    // 指針：彈簧末端，指向刻度（底下襯一層背景色）
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.7);
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(X, yB); ctx.lineTo(rx + 7, yB); ctx.stroke();
    ctx.strokeStyle = colors.pos;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X, yB); ctx.lineTo(rx + 7, yB); ctx.stroke();
    // 掛鉤與物體
    const blockH = 0.08 + 0.04 * p.ms, blockW = 0.13 + 0.035 * p.ms;
    const hookCol = shade(colors.muted, dk ? 0.1 : -0.15);
    tube(ctx, [[X, yB], [X, ZI(zEnd - 0.05)]], 1.8, hookCol, shade(colors.muted, 0.55));
    const by = ZI(zEnd - 0.05);
    block(ctx, X - blockW / 2 * k, by, blockW * k, blockH * k, 3, colors.equi, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 質量標示：放得進方塊就寫在方塊上，否則寫在方塊左邊
    const inW = blockW * k - 3;
    let mt = fmtSlider(p.ms, elMs) + ' kg';
    let mf = font(700, L.narrow ? 11 : 10);
    if (textW(ctx, mt, mf) > inW) mt = fmtSlider(p.ms, elMs);
    if (textW(ctx, mt, mf) <= inW) {
      ctx.font = mf;
      ctx.fillStyle = shade(colors.equi, dk ? -0.72 : 0.88);
      ctx.fillText(mt, X, by + blockH * k / 2 + 0.5);
    } else {
      ctx.textAlign = 'right';
      pill(ctx, fmtSlider(p.ms, elMs) + ' kg', X - blockW / 2 * k - 5, by + blockH * k / 2, shade(colors.equi, dk ? 0.1 : -0.2), font(700, 11));
    }
    // 讀數標籤：天花板下、彈簧左側
    ctx.textAlign = 'right';
    pill(ctx, 'T = ' + num(Ts, 1) + ' N', X - 0.06 * k, ZI(CEIL) + (L.narrow ? 13 : 15) * 0.95, colors.text, font(600, 11));
  }

  // ---------- 體重計刻度盤 ----------
  function dialAng(v) { return (135 + 270 * Math.max(0, Math.min(DIAL_MAX, v)) / DIAL_MAX) * Math.PI / 180; }
  function dialGeom() {
    const R = L.dial;
    const r = Math.min(R.w * 0.4, (R.h - 34) / 2.18);
    return { r: r, cx: R.x + R.w / 2, cy: R.y + 26 + r * 1.1 };
  }
  /** 數位讀數的字型與小螢幕的位置（靜態外框與動態數字共用） */
  function dialLcd(c, d) {
    const f = fitFont(c, '000.0', d.r * 1.0, Math.round(Math.max(14, Math.min(22, d.r * 0.26))), 800);
    const w = textW(c, '000.0', f) + 10, h = fontPx(f) * fontScale() * 1.22;
    return { font: f, x: d.cx - w / 2, y: d.cy + d.r * 0.25 - h / 2, w: w, h: h, cy: d.cy + d.r * 0.25 };
  }
  /** 刻度盤不變的部分（畫在 bg）：標題、金屬環、盤面、刻度、數字、單位、讀數小螢幕 */
  function drawDialFace(c) {
    const R = L.dial, d = dialGeom(), r = d.r, cx = d.cx, cy = d.cy, dk = colors.dark;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, PR);
    c.clip();
    c.textAlign = 'left';
    pill(c, T('體重計讀數', 'Scale reading'), R.x + 12, R.y + 14, colors.muted, font(700, L.narrow ? 11 : 12));
    // 外框（金屬環）：投影、上亮下暗的外環、反向漸層的內槽、左上的高光
    c.save();
    c.shadowColor = dk ? 'rgba(0,0,0,0.6)' : alpha(colors.text, 0.3);
    c.shadowBlur = 12;
    c.shadowOffsetY = 3;
    const ring = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ring.addColorStop(0, shade(colors.muted, dk ? 0.3 : 0.72));
    ring.addColorStop(0.5, shade(colors.muted, dk ? -0.1 : 0.25));
    ring.addColorStop(1, shade(colors.muted, dk ? -0.5 : -0.25));
    c.fillStyle = ring;
    c.beginPath(); c.arc(cx, cy, r * 1.08, 0, Math.PI * 2); c.fill();
    c.restore();
    const groove = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    groove.addColorStop(0, shade(colors.muted, dk ? -0.55 : -0.3));
    groove.addColorStop(1, shade(colors.muted, dk ? 0.15 : 0.6));
    c.fillStyle = groove;
    c.beginPath(); c.arc(cx, cy, r * 1.025, 0, Math.PI * 2); c.fill();
    c.strokeStyle = dk ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)';
    c.lineWidth = Math.max(1, r * 0.018);
    c.lineCap = 'round';
    c.beginPath(); c.arc(cx, cy, r * 1.06, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
    // 盤面：中心偏左上較亮，邊緣有一圈內陰影
    const face = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    face.addColorStop(0, dk ? shade(colors.surface, 0.14) : '#ffffff');
    face.addColorStop(1, dk ? shade(colors.surface, -0.22) : shade(colors.surface, -0.07));
    c.fillStyle = face;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    const inner = c.createRadialGradient(cx, cy + r * 0.04, r * 0.84, cx, cy, r);
    inner.addColorStop(0, 'rgba(0,0,0,0)');
    inner.addColorStop(1, 'rgba(0,0,0,' + (dk ? 0.35 : 0.13) + ')');
    c.fillStyle = inner;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    // 色弧的軌道（淡淡的一圈）
    c.strokeStyle = alpha(colors.text, dk ? 0.07 : 0.05);
    c.lineWidth = r * 0.12;
    c.lineCap = 'butt';
    c.beginPath(); c.arc(cx, cy, r * 0.78, dialAng(0), dialAng(DIAL_MAX)); c.stroke();
    // 刻度：每 5 kgw 一小格、每 20 kgw 一大格
    c.strokeStyle = alpha(colors.text, 0.75);
    for (let v = 0; v <= DIAL_MAX; v += 5) {
      const a = dialAng(v), major = v % 20 === 0, mid = v % 10 === 0;
      const r0 = r * (major ? 0.84 : mid ? 0.88 : 0.91), r1 = r * 0.96;
      c.lineWidth = major ? 1.6 : 1;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
    }
    c.fillStyle = colors.text;
    c.font = font(600, Math.round(Math.max(9, Math.min(12, r * 0.13))));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const labStep = r < 70 ? 40 : 20;
    for (let v = 0; v <= DIAL_MAX; v += labStep) {
      const a = dialAng(v), rr = (v === 0 || v === DIAL_MAX) ? 0.74 : 0.69;
      c.fillText(String(v), cx + Math.cos(a) * r * rr, cy + Math.sin(a) * r * rr);
    }
    // 讀數小螢幕（嵌入盤面）與單位
    const lc = dialLcd(c, d);
    inset(c, lc.x, lc.y, lc.w, lc.h, 4, dk ? '#0a1012' : mix(colors.surface, colors.probe, 0.07));
    const uf = font(600, Math.round(Math.max(9, Math.min(12, r * 0.12))));
    c.font = uf;
    c.fillStyle = colors.muted;
    c.fillText('kgw', cx, lc.y + lc.h + 2 + fontPx(uf) * fontScale() * 0.55);
    c.restore();
  }
  /** 刻度盤玻璃的反光（快取，畫在指針之上） */
  let dialGlass = null;
  function buildDialGlass() {
    const d = dialGeom(), r = d.r;
    dialGlass = makeLayer(d.cx - r, d.cy - r, 2 * r, 2 * r, function (c) {
      c.save();
      c.beginPath(); c.arc(d.cx, d.cy, r, 0, Math.PI * 2); c.clip();
      const g = c.createLinearGradient(d.cx - r, d.cy - r, d.cx + r * 0.2, d.cy + r * 0.2);
      g.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.1 : 0.45) + ')');
      g.addColorStop(0.55, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(d.cx - r * 0.22, d.cy - r * 0.32, r * 0.95, r * 0.62, -0.5, 0, Math.PI * 2);
      c.fill();
      c.restore();
    });
  }
  function drawDial(st, p) {
    const R = L.dial, d = dialGeom(), r = d.r, cx = d.cx, cy = d.cy, dk = colors.dark;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, PR);
    ctx.clip();
    const reading = E.reading(p.m, st.a), N = E.normalForce(p.m, st.a);
    // 讀數與實重之間的色弧（超重橘、失重藍綠、完全失重紫）
    const ph = E.phaseOf(st.a);
    if (ph !== 'normal') {
      const a1 = dialAng(p.m), a2 = dialAng(reading);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = alpha(phaseColor(ph), dk ? 0.6 : 0.5);
      ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, Math.min(a1, a2), Math.max(a1, a2)); ctx.stroke();
      ctx.strokeStyle = alpha(phaseColor(ph), 0.95);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.84 - 0.75, Math.min(a1, a2), Math.max(a1, a2)); ctx.stroke();
    }
    // 實重的記號（三角形，襯一圈背景色）
    const am = dialAng(p.m);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(am) * r * 1.0, cy + Math.sin(am) * r * 1.0);
    ctx.lineTo(cx + Math.cos(am - 0.06) * r * 1.13, cy + Math.sin(am - 0.06) * r * 1.13);
    ctx.lineTo(cx + Math.cos(am + 0.06) * r * 1.13, cy + Math.sin(am + 0.06) * r * 1.13);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = colors.accent;
    ctx.fill();
    // 數位讀數（小螢幕裡）
    const lc = dialLcd(ctx, d);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = lc.font;
    const dcol = ph === 'normal' ? colors.text : shade(phaseColor(ph), dk ? 0.15 : -0.2);
    if (dk) {
      ctx.strokeStyle = alpha(dcol, 0.25);
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(num(reading, 1), cx, lc.cy + 1);
    }
    ctx.fillStyle = dcol;
    ctx.fillText(num(reading, 1), cx, lc.cy + 1);
    // 指針：細長的錐形，尾端有平衡錘；影子用偏移的半透明形狀（不用 shadowBlur）
    const an = dialAng(reading), ca = Math.cos(an), sa = Math.sin(an);
    const needle = function (ox, oy) {
      const w0 = Math.max(1.6, r * 0.04), w1 = 0.6;
      const tx = cx + ca * r * 0.86 + ox, ty = cy + sa * r * 0.86 + oy;
      const bx = cx - ca * r * 0.18 + ox, by = cy - sa * r * 0.18 + oy;
      ctx.beginPath();
      ctx.moveTo(tx - sa * w1, ty + ca * w1);
      ctx.lineTo(cx + ox - sa * w0, cy + oy + ca * w0);
      ctx.lineTo(bx - sa * w0 * 1.3, by + ca * w0 * 1.3);
      ctx.lineTo(bx + sa * w0 * 1.3, by - ca * w0 * 1.3);
      ctx.lineTo(cx + ox + sa * w0, cy + oy - ca * w0);
      ctx.lineTo(tx + sa * w1, ty - ca * w1);
      ctx.closePath();
    };
    needle(1.2, 2.2);
    ctx.fillStyle = 'rgba(0,0,0,' + (dk ? 0.45 : 0.2) + ')';
    ctx.fill();
    needle(0, 0);
    const ng = ctx.createLinearGradient(cx - sa * 3, cy + ca * 3, cx + sa * 3, cy - ca * 3);
    ng.addColorStop(0, shade(colors.pos, -0.2));
    ng.addColorStop(0.5, shade(colors.pos, 0.15));
    ng.addColorStop(1, shade(colors.pos, -0.1));
    ctx.fillStyle = ng;
    ctx.fill();
    D.ball(ctx, cx, cy, Math.max(3.5, r * 0.075), colors.muted, { glow: 0 });
    blit(dialGlass);
    // 刻度盤下方：正向力 N
    ctx.textAlign = 'center';
    const below = R.y + R.h - (cy + r * 1.08) > 30;
    pill(ctx, 'N = ' + num(N, 1) + ' N', cx, below ? cy + r * 1.08 + 16 : cy + r * 0.86, colors.muted,
      fitFont(ctx, 'N = 0000.0 N', below ? R.w - 12 : r * 1.3, L.narrow ? 11 : 11, 600));
    ctx.restore();
  }

  // ---------- 受力圖：人與體重計分開畫 ----------
  /** 受力圖的版面（固定比例的力箭頭：方塊上下各可畫到 F_REF） */
  function fbdGeom() {
    const R = L.fbd, narrow = L.narrow;
    const lineH = narrow ? 17 : 19;
    const bandTop = R.y + R.h - 8 - 2 * lineH;     // 下方兩行說明
    const top = R.y + 44, bot = bandTop - 14;
    const bs = Math.max(28, Math.min(40, R.w * 0.15));
    const cy = Math.round((top + bot) / 2);
    const Lmax = (bot - top - bs) / 2;              // 方塊上下各可用的長度
    const sF = Lmax / F_REF;                        // px/N（固定比例）
    const sw = Math.max(36, Math.min(56, R.w * 0.22)), shh = narrow ? 15 : 17;
    return {
      R: R, lineH: lineH, bandTop: bandTop, bs: bs, cy: cy, Lmax: Lmax, sF: sF, barL: 500 * sF,
      lw: narrow ? 2.4 : 2.8, sw: sw, shh: shh,
      xp: Math.round(R.x + R.w * 0.34), xs: Math.round(Math.min(R.x + R.w * 0.8, R.x + R.w - sw / 2 - 8))
    };
  }
  /** 受力圖不變的部分（畫在 bg）：標題、比例尺、人與秤的方塊、下方兩行說明 */
  function drawFBDStatic(c) {
    const FG = fbdGeom(), R = FG.R, narrow = L.narrow;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, PR);
    c.clip();
    c.textAlign = 'left';
    const title = T('受力圖（人與秤分開畫）', 'Free-body diagrams');
    pill(c, title, R.x + 12, R.y + 14, colors.muted, fitFont(c, title, R.w - FG.barL - 56, narrow ? 11 : 12, 700));
    // 比例尺（右上角）
    const bx = R.x + R.w - 10 - FG.barL, byy = R.y + 13;
    c.strokeStyle = colors.muted;
    c.lineWidth = 2;
    c.lineCap = 'butt';
    c.beginPath(); c.moveTo(bx, byy); c.lineTo(bx + FG.barL, byy); c.moveTo(bx, byy - 3); c.lineTo(bx, byy + 3); c.moveTo(bx + FG.barL, byy - 3); c.lineTo(bx + FG.barL, byy + 3); c.stroke();
    c.textAlign = 'right';
    c.textBaseline = 'top';
    c.font = font(600, 10);
    c.fillStyle = colors.muted;
    c.fillText('500 N', R.x + R.w - 8, byy + 5);
    // 人：方塊（立體、投影）
    const bs = FG.bs, cy = FG.cy;
    block(c, FG.xp - bs / 2, cy - bs / 2, bs, bs, 6, colors.accent, true);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(700, narrow ? 12 : 13);
    c.fillStyle = colors.surface;
    c.fillText(T('人', 'You'), FG.xp, cy + 0.5);
    // 體重計：方塊（下緣與人的下緣對齊）
    const sTop = cy + bs / 2 - FG.shh;
    block(c, FG.xs - FG.sw / 2, sTop, FG.sw, FG.shh, 4, colors.dark ? shade(colors.surface, 0.3) : shade(colors.surface, -0.1), true);
    c.font = fitFont(c, T('秤', 'Scale'), FG.sw + 8, narrow ? 11 : 10, 700);
    c.fillStyle = colors.text;
    c.fillText(T('秤', 'Scale'), FG.xs, sTop + FG.shh / 2 + 0.5);
    // 兩行說明（太長時改用較短的說法）
    const lines = [
      [T('藍色 N 與 N′：一對作用力與反作用力', 'Blue N and N′: an action–reaction pair'), T('N 與 N′：作用力與反作用力', 'N, N′: action–reaction pair'), colors.neg, 700],
      [T('mg 與 N 都作用在人身上，不是一對', 'mg and N both act on you: not a pair'), T('mg 與 N 同作用在人：不是一對', 'mg, N act on you: not a pair'), colors.pos, 600]
    ];
    c.textAlign = 'center';
    lines.forEach(function (ln, i) {
      let t = ln[0], f = fitFont(c, t, R.w - 14, narrow ? 11 : 11, ln[3]);
      if (textW(c, t, f) + 12 > R.w - 14) { t = ln[1]; f = fitFont(c, t, R.w - 14, narrow ? 11 : 11, ln[3]); }
      pill(c, t, R.x + R.w / 2, FG.bandTop + FG.lineH * (i + 0.5), shade(ln[2], colors.dark ? 0.1 : -0.1), f);
    });
    c.restore();
  }
  function drawFBD(st, p) {
    const FG = fbdGeom(), R = FG.R;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, PR);
    ctx.clip();
    const narrow = L.narrow;
    const F = E.forces(p.m, st.a);
    const N = F.normal, W = -F.weight, net = F.net;
    const hide = hiddenNow();
    const sF = FG.sF, Lmax = FG.Lmax, bs = FG.bs, cy = FG.cy, lw = FG.lw, xp = FG.xp, xs = FG.xs, sw = FG.sw;
    const fl = font(700, narrow ? 10 : 11);
    /** 由 (x, y) 沿 dir（−1 向上、+1 向下）畫大小 F 的力，傳回箭頭尖端 */
    function vec(x, y, Fm, dir, col) {
      const len = Math.abs(Fm) * sF, broken = len > Lmax + 0.5;
      const l = Math.min(len, Lmax);
      arrow(ctx, x, y, 0, dir, l, lw, col, broken);
      return { x: x, y: y + dir * l, broken: broken };
    }
    /** 箭頭尖端的標籤：置中、與尖端留一點空隙，但不超出面板 */
    function tipLabel(text, tip, dir, col, avoids) {
      ctx.font = fl;
      const m = ctx.measureText(text), w = m.width + 12, ph = D.textHeight(m, 15) + 3;
      const xMin = R.x + 4 + w / 2, xMax = R.x + R.w - 4 - w / 2;
      let x = Math.max(xMin, Math.min(xMax, tip.x)), y = tip.y + dir * (ph / 2 + 3);
      // 避開其他標籤：先左右移開，移不開就沿箭頭方向再移遠一點
      const hit = function (xx, yy, b) {
        return xx - w / 2 < b.x + b.w + 2 && xx + w / 2 > b.x - 2 && yy - ph / 2 < b.y + b.h + 2 && yy + ph / 2 > b.y - 2;
      };
      (avoids || []).forEach(function (b) {
        if (!b || !hit(x, y, b)) return;
        const x2 = x < b.x + b.w / 2 ? Math.max(xMin, b.x - 3 - w / 2) : Math.min(xMax, b.x + b.w + 3 + w / 2);
        if (!hit(x2, y, b)) x = x2;
        else y = dir > 0 ? b.y + b.h + 3 + ph / 2 : b.y - 3 - ph / 2;
      });
      ctx.textAlign = 'center';
      return pill(ctx, text, x, y, col, fl);
    }
    /** 合力的標籤：放得下就一行，否則分成兩行（字不縮到 11 px 以下） */
    function netLabel(text, x, y, col, maxW) {
      const f1 = fitFont(ctx, text, maxW, narrow ? 10 : 10.5, 600);
      ctx.textAlign = 'left';
      if (textW(ctx, text, f1) + 12 <= maxW || text.indexOf(' ') < 0) return pill(ctx, text, x, y, col, f1);
      const parts = [text.slice(0, text.indexOf(' ')), text.slice(text.indexOf(' ') + 1)];
      const f2 = fitFont(ctx, parts[0].length > parts[1].length ? parts[0] : parts[1], maxW, narrow ? 10 : 10.5, 600);
      ctx.font = f2;
      const lh = D.textHeight(ctx.measureText('M'), 14);
      const w = Math.max(ctx.measureText(parts[0]).width, ctx.measureText(parts[1]).width) + 10, h = 2 * lh + 4;
      roundRect(ctx, x - 5, y - h / 2, w, h, 7);
      ctx.fillStyle = alpha(colors['canvas-bg'], colors.dark ? 0.86 : 0.9);
      ctx.fill();
      ctx.strokeStyle = alpha(col, colors.dark ? 0.45 : 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.textBaseline = 'middle';
      ctx.fillText(parts[0], x, y - lh / 2 + 0.5);
      ctx.fillText(parts[1], x, y + lh / 2 + 0.5);
      return { x: x - 5, y: y - h / 2, w: w, h: h };
    }
    // 人：N 由上緣向上、mg 由下緣向下
    const tipN = vec(xp, cy - bs / 2, N, -1, colors.neg);
    const tipW = vec(xp, cy + bs / 2, W, 1, colors.pos);
    // 合力 = ma（細一點、畫在方塊右邊；不是另外一個力）
    const xn = xp + bs / 2 + (narrow ? 11 : 14);
    let netBox = null;
    if (Math.abs(net) > 1e-6) {
      const len = Math.min(Math.abs(net) * sF, Lmax + bs / 2);
      arrow(ctx, xn, cy, 0, net > 0 ? -1 : 1, len, lw * 0.7, colors.accent, Math.abs(net) * sF > Lmax + bs / 2 + 0.5);
      ctx.textAlign = 'left';
      const t = hide ? T('合力 ?', 'net ?') : T('合力 ma', 'net ma');
      netBox = netLabel(t, xn + 7, cy + (net > 0 ? -1 : 1) * Math.max(10, len * 0.55), shade(colors.accent, colors.dark ? 0.1 : -0.1), xs - sw / 2 - xn - 5);
    } else {
      netBox = netLabel(T('合力 0', 'net 0'), xn, cy, colors.muted, xs - sw / 2 - xn + 2);
    }
    // 體重計：人對秤的力 N′ 由下緣向下
    const tipS = vec(xs, cy + bs / 2, N, 1, colors.neg);
    tipLabel('N = ' + num(N, 0) + ' N' + (tipN.broken ? ' ≈' : ''), tipN, -1, colors.neg, [netBox]);
    const boxS = tipLabel('N′ = ' + num(N, 0) + ' N' + (tipS.broken ? ' ≈' : ''), tipS, 1, colors.neg, [netBox]);
    tipLabel('mg = ' + num(W, 0) + ' N', tipW, 1, colors.pos, [netBox, boxS]);
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
  /** 圖表用的字型：窄版字級至少 11 px */
  function gfont(weight, size) {
    if (GL && GL.narrow) size = Math.max(11, size);
    return (weight ? weight + ' ' : '') + size + 'px ' + FONT;
  }
  /** 圖表區的底色（暈影、每條圖的底板與投影，只在版面或主題改變時重畫） */
  let gbg = null;
  function buildGraphBg() {
    gbg = document.createElement('canvas');
    gbg.width = gv.width; gbg.height = gv.height;
    const c = gbg.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, gw, gh);
    const dk = colors.dark;
    GL.strips.forEach(function (R) {
      c.save();
      c.shadowColor = dk ? 'rgba(0,0,0,0.5)' : alpha(colors.text, 0.12);
      c.shadowBlur = 6;
      c.shadowOffsetY = 1.5;
      roundRect(c, R.x, R.y, R.w, R.h, 6);
      c.fillStyle = colors['canvas-bg'];
      c.fill();
      c.restore();
      const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
      g.addColorStop(0, dk ? shade(colors['canvas-bg'], 0.04) : '#ffffff');
      g.addColorStop(1, dk ? shade(colors['canvas-bg'], -0.3) : shade(colors['canvas-bg'], -0.035));
      c.fillStyle = g;
      roundRect(c, R.x, R.y, R.w, R.h, 6);
      c.fill();
    });
  }
  /** 兩級格線（主格線約 0.10、次格線約 0.04；對齊物理像素），horiz：水平線（縱軸刻度） */
  function gridLines(c, R, vals, pos, horiz, a) {
    const snap = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    c.beginPath();
    vals.forEach(function (v) {
      const q = pos(v);
      if (horiz) { if (q < R.y || q > R.y + R.h) return; const s = snap(q); c.moveTo(R.x, s); c.lineTo(R.x + R.w, s); }
      else { if (q < R.x || q > R.x + R.w) return; const s = snap(q); c.moveTo(s, R.y); c.lineTo(s, R.y + R.h); }
    });
    c.strokeStyle = alpha(colors.text, a);
    c.lineWidth = 1 / dpr;
    c.stroke();
  }
  function steps(lo, hi, st) {
    const out = [];
    for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(6));
    return out;
  }
  /** 次格線的間距：主間距的 1/5（太密就 1/2） */
  function minorOf(st, pxPerUnit) { return st / 5 * pxPerUnit >= 5 ? st / 5 : st / 2 * pxPerUnit >= 5 ? st / 2 : 0; }
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
    const tStep = niceStep((ax.t1 - ax.t0) / (GL.narrow ? 5 : 8));
    const dk = colors.dark;
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
          c.fillStyle = alpha(phaseColor(ph), dk ? 0.16 : 0.12);
          c.fillRect(xa, R.y, xb - xa, R.h);
          // 階段的邊界（細線）
          c.fillStyle = alpha(phaseColor(ph), dk ? 0.35 : 0.3);
          c.fillRect(xa, R.y, 1, R.h);
          if (s.t1 <= S.t) c.fillRect(xb - 1, R.y, 1, R.h);
          if (ph === 'free') {
            c.strokeStyle = alpha(phaseColor(ph), 0.18);
            c.lineWidth = 1;
            c.beginPath();
            for (let x = xa - R.h; x < xb; x += 7) { c.moveTo(Math.max(x, xa), R.y + R.h - (Math.max(x, xa) - x)); c.lineTo(Math.min(x + R.h, xb), R.y + R.h - (Math.min(x + R.h, xb) - x)); }
            c.stroke();
          }
          if (i === 0) {
            // 標籤放在 a 曲線的另一側，避免壓在線上；在上方時避開左上角的標題
            const fB = gfont(700, 11);
            const lw2 = textW(c, phaseName(ph), fB) + 12;
            const atTop = !(s.a > 0);
            const minX = atTop ? R.x + 10 + textW(c, sp.title, gfont(700, 11)) + 14 + lw2 / 2 : xa + lw2 / 2 + 2;
            const xm = Math.max((xa + xb) / 2, minX);
            if (xm + lw2 / 2 <= xb + 2 && xm - lw2 / 2 >= xa - 2) {
              c.textAlign = 'center';
              pill(c, phaseName(ph), xm, atTop ? R.y + 12 : R.y + R.h - 12, shade(phaseColor(ph), dk ? 0.15 : -0.2), fB);
            }
          }
        });
      }
      // 兩級格線與刻度（y 圖：主格線每 3 層樓、次格線每層樓；時間：主格線同時間軸刻度）
      const ticks = [];
      let vStep, vMinor;
      if (sp.key === 'y') { [0, 9, 18, 27].forEach(function (v) { ticks.push(v); }); vStep = 9; vMinor = E.FLOOR_H; }
      else {
        vStep = niceStep((sp.hi - sp.lo) / (R.h > 80 ? 4 : 3));
        for (let v = Math.ceil(sp.lo / vStep) * vStep; v <= sp.hi + 1e-9; v += vStep) ticks.push(+v.toFixed(6));
        vMinor = minorOf(vStep, R.h / (sp.hi - sp.lo));
      }
      const tMinor = minorOf(tStep, R.w / (ax.t1 - ax.t0));
      const gA = dk ? 0.05 : 0.04, GA = dk ? 0.11 : 0.1;
      if (vMinor) gridLines(c, R, steps(sp.lo, sp.hi, vMinor), Y, true, gA);
      if (tMinor) gridLines(c, R, steps(0, ax.t1, tMinor), function (t) { return TX(t, R); }, false, gA);
      gridLines(c, R, ticks, Y, true, GA);
      gridLines(c, R, steps(0, ax.t1, tStep), function (t) { return TX(t, R); }, false, GA);
      c.lineWidth = 1;
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
            D.ball(c, xx, Y(v), 4, sp.col, { glow: dk ? 0.55 : 0.3, ring: colors['canvas-bg'] });
          }
        }
      }
      if (sp.hideable && isHidden(curRun)) {
        c.fillStyle = alpha(colors['canvas-bg'], 0.85);
        c.fillRect(R.x, R.y, R.w, R.h);
        c.textAlign = 'center';
        pill(c, T('神秘電梯：保密中', 'Mystery elevator: hidden'), R.x + R.w / 2, R.y + R.h / 2, colors.muted, gfont(700, 12));
      }
      // 標題
      c.textAlign = 'left';
      pill(c, sp.title, R.x + 10, R.y + 12, shade(sp.col, dk ? 0.1 : -0.15), gfont(700, 11));
      if (sp.key === 'r') {
        c.textAlign = 'right';
        pill(c, T('實重 ', 'true weight ') + num(pm, 1), R.x + R.w - 10, Y(pm) + (Y(pm) - R.y > 24 ? -10 : 10), colors.muted, gfont(600, 10.5));
      }
      c.restore();
      // 左側刻度數字
      c.font = gfont(500, 10.5);
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
      c.strokeStyle = alpha(colors.text, dk ? 0.14 : 0.1);
      c.lineWidth = 1;
      roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 6);
      c.stroke();
      c.save();
      roundRect(c, R.x, R.y, R.w, R.h, 6);
      c.clip();
      c.fillStyle = dk ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)';
      c.fillRect(R.x + 6, R.y + 1, R.w - 12, 1);
      c.restore();
    });
    // 時間軸
    const R0 = GL.strips[0];
    const st = tStep;
    c.font = gfont(500, 10.5);
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
      wrapPill(c, msg, gw / 2 + GL.left / 2, midY, gw - GL.left - 30, colors.text, gfont(600, fz));
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
    const lh = D.textHeight(c.measureText(lines[0] || 'M'), 15) + 7;
    lines.forEach(function (ln, i) { pill(c, ln, x, y + (i - (lines.length - 1) / 2) * lh, color, font); });
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
    sayPhase(seg);
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
    lastSay = '';
    updateSceneLabel();
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
    // 距離 d < V²/A 時沒有等速段（三角形 v–t 圖），說明要照實際行程講
    const vp = E.tripPeakSpeed(Math.abs(E.floorY(n) - st.y), A, V), cruise = vp >= V - 1e-9;
    setStatus(mystery ? T('神秘電梯出發！加速度保密，看體重計讀數推算它。', 'The mystery elevator sets off! The acceleration is secret — work it out from the reading.')
      : cruise ? T('前往 ' + floorName(n) + '：先以 A 加速，再等速，最後以 A 減速停靠。', 'Going to ' + floorName(n) + ': speed up at A, cruise, then slow down at A and stop.')
      : T('前往 ' + floorName(n) + '：距離短，來不及加速到 V；先以 A 加速到 ' + num(vp, 2) + ' m/s，接著以 A 減速停靠。',
        'Going to ' + floorName(n) + ': too short to reach V, so speed up at A to ' + num(vp, 2) + ' m/s, then slow down at A and stop.'));
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
    updateSceneLabel();
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
    say(T('小球落地：花了 ', 'The ball landed after ') + num(t, 3) + ' s' + T('（電梯靜止時 ', ' (') + num(t0, 3) + T(' s）。', ' s with the elevator at rest).'));
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

  // ---------- 無障礙：讀數播報與畫布說明 ----------
  // 體重計讀數只在每一段運動開始時改變（離散事件），在那時寫進 aria-live 的 #srSay；每格都在變的高度、速度不播報
  let sayTimer = 0, lastSay = '';
  function say(msg) {
    const box = $('srSay');
    if (!box || !msg) return;
    clearTimeout(sayTimer);
    box.textContent = '';
    sayTimer = setTimeout(function () { box.textContent = msg; }, 60); // 先清空再寫，同樣的字也會再念一次
  }
  /** 這一段的運動（用段落中間的速度判斷上升或下降） */
  function motionName(seg) {
    if (seg.kind === 'free') return T('纜繩斷了，自由落體', 'cable broken, free fall');
    const mid = E.segAt(seg, isFinite(seg.t1) ? (seg.t0 + seg.t1) / 2 : seg.t0 + 0.01);
    const v = Math.abs(mid.v) < 1e-9 ? 0 : Math.sign(mid.v), a = Math.abs(seg.a) < 1e-9 ? 0 : Math.sign(seg.a);
    if (!v) return T('靜止', 'at rest');
    if (!a) return v > 0 ? T('等速上升', 'moving up at constant velocity') : T('等速下降', 'moving down at constant velocity');
    if (a === v) return v > 0 ? T('加速上升', 'speeding up on the way up') : T('加速下降', 'speeding up on the way down');
    return v > 0 ? T('減速上升', 'slowing down on the way up') : T('減速下降', 'slowing down on the way down');
  }
  function sayPhase(seg) {
    const r = E.reading(seg.m, seg.a), ph = E.phaseOf(seg.a);
    const msg = motionName(seg) + T('：體重計讀數 ', ': the scale reads ') + num(r, 1) + ' kgw' + T('（', ' (') + phaseName(ph) + T('）。', ').');
    if (msg === lastSay) return;
    lastSay = msg;
    say(msg);
  }
  /** 電梯畫布（role="img"）的說明：停下、改質量、剪斷纜繩時更新 */
  let sceneLabel = '';
  function updateSceneLabel() {
    const st = cur(), p = P(), f = E.floorOf(st.y);
    const where = floorName(f.n) + (Math.abs(f.off) < 0.005 ? '' : ' ' + signed(f.off, 2) + ' m');
    const text = T('電梯模擬畫布：左邊是大樓與電梯井（高度依比例），電梯在 ' + where + (S.cable === 'cut' ? '，纜繩已斷' : '') +
      '；中間是車廂內部：質量 ' + num(p.m, 1) + ' kg 的人站在體重計上（讀數 ' + num(E.reading(p.m, st.a), 1) + ' kgw）、彈簧秤吊著 ' + num(p.ms, 2) +
      ' kg 的物體、手上拿著小球；右邊是體重計刻度盤與人的受力圖。',
    'Elevator simulation: on the left the building and the shaft (heights to scale), with the elevator at ' + where + (S.cable === 'cut' ? ' and the cable broken' : '') +
      '; in the middle the inside of the car — a ' + num(p.m, 1) + ' kg person on a bathroom scale (reading ' + num(E.reading(p.m, st.a), 1) + ' kgw), a ' + num(p.ms, 2) +
      ' kg mass on a spring scale and a ball in the hand; on the right the scale dial and the free-body diagram of the person.');
    if (text === sceneLabel) return;
    sceneLabel = text;
    cv.removeAttribute('data-en-aria-label'); // 改由程式依語言更新
    cv.setAttribute('aria-label', text);
  }

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
    lastSay = '';
    updateSceneLabel();
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
      if (el === elM || el === elMs) { massChanged(); updateSceneLabel(); }
      requestDraw();
    });
    // 讀數播報：放開滑桿或打完數字後，念出這組設定下體重計會顯示的讀數
    el.addEventListener('change', sayParams);
  });
  let paramTimer = 0;
  function sayParams() {
    clearTimeout(paramTimer);
    paramTimer = setTimeout(function () {
      const p = P();
      say(T('人 ' + num(p.m, 1) + ' kg：靜止或等速時讀數 ' + num(E.reading(p.m, 0), 1) + ' kgw；以 A = ' + num(p.A, 2) + ' m/s² 起動上升時 ' +
        num(E.reading(p.m, p.A), 1) + ' kgw、上升停靠時 ' + num(E.reading(p.m, -p.A), 1) + ' kgw；緊急煞車時 ' + num(E.reading(p.m, p.ab), 1) +
        ' kgw；彈簧秤靜止時 ' + num(E.springTension(p.ms, 0), 2) + ' N。',
      'Person ' + num(p.m, 1) + ' kg: the scale reads ' + num(E.reading(p.m, 0), 1) + ' kgw at rest or at constant velocity; ' + num(E.reading(p.m, p.A), 1) +
        ' kgw when setting off upward at A = ' + num(p.A, 2) + ' m/s², ' + num(E.reading(p.m, -p.A), 1) + ' kgw when stopping on the way up, ' +
        num(E.reading(p.m, p.ab), 1) + ' kgw during emergency braking; the spring scale reads ' + num(E.springTension(p.ms, 0), 2) + ' N at rest.'));
    }, 350);
  }

  // ---------- 啟動 ----------
  readColors();
  refreshOutputs();
  S.track = stamp([E.rest(0, 0)]);
  S.lastSeg = S.track[0];
  S.lastReading = E.reading(P().m, 0);
  updateButtons();
  updateSceneLabel();
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
