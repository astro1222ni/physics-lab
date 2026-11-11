/* collision.js — 「一維碰撞」模組的畫面與互動（物理計算在 collision-core.js） */
(function () {
  'use strict';
  const CC = window.CollisionCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式取英文，其餘取中文（簡體由 settings.js 自動轉換）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };

  // ---------- 世界座標（m，向右為正） ----------
  const L = 12;           // 畫面中軌道長度
  const XC = L / 2;       // 碰撞點安排在軌道中央
  const MARGIN = 0.3;     // 起始位置距畫面邊緣
  const LEAD = 2;         // 理想的碰撞前時間（s）
  const AFTER = 3.5;      // 碰撞後再播放多久（s）
  const STROBE = 0.25;    // 質心標記間隔（s）
  const ARROW_M_PER_MPS = 0.4; // 速度箭頭：1 m/s 畫成 0.4 m 長

  /** 車長（m）隨質量略增，只是為了看得出輕重 */
  function cartWidth(m) { return 0.6 + 0.3 * Math.cbrt(m); }
  const W_MAX = cartWidth(10);

  const state = {
    p: { m1: 2, m2: 3, v1: 3, v2: -1, e: 1 },
    sim: null,
    sum: null,
    t: 0,
    tEnd: 4,
    running: false,
    ended: false,
    slow: false,
    cmFrame: false,
    mode: 'bars',
    scales: null,
    spring: false,      // 加彈簧（彈簧緩衝）
    k: 200,             // 彈力常數（N/m）
    lengthened: false   // 本次是否為了不壓到底而加長彈簧
  };
  const SPRING_L0 = 1;  // 彈簧預設自然長度（m）

  // ---------- 由參數建立模擬 ----------
  function setup() {
    const p = state.p, spring = state.spring;
    const w1 = cartWidth(p.m1), w2 = cartWidth(p.m2);
    const approach = CC.approaching(p.v1, p.v2);
    // 彈簧：最大壓縮量若超過自然長度的 80%，本次把自然長度加長為 x_max / 0.8（物理仍然精確）
    let L0 = spring ? SPRING_L0 : 0;
    state.lengthened = false;
    if (spring && approach) {
      const xmax = CC.springContact(p.m1, p.m2, p.v1, p.v2, state.k).xmax;
      if (xmax > 0.8 * L0) { L0 = xmax / 0.8; state.lengthened = true; }
    }
    let x1, x2;
    if (approach) {
      // 讓兩車在 T0 秒後恰好於 XC 接觸（有彈簧時，彈簧位於 XC 兩側），並確保起點都在畫面內
      const c1 = XC - L0 / 2 - w1 / 2, c2 = XC + L0 / 2 + w2 / 2;
      let T0 = LEAD;
      [[c1, p.v1, w1], [c2, p.v2, w2]].forEach(function (a) {
        const c = a[0], v = a[1], w = a[2];
        const lo = MARGIN + w / 2, hi = L - MARGIN - w / 2;
        if (v > 0) T0 = Math.min(T0, (c - lo) / v);
        else if (v < 0) T0 = Math.min(T0, (hi - c) / -v);
      });
      T0 = Math.max(T0, 0.3); // 彈簧特別長時，起點可能略超出畫面
      x1 = c1 - p.v1 * T0;
      x2 = c2 - p.v2 * T0;
    } else {
      x1 = XC - 1.2 - w1 / 2;
      x2 = XC + 1.2 + w2 / 2;
    }
    state.sim = CC.createSim({ m1: p.m1, m2: p.m2, v1: p.v1, v2: p.v2, e: p.e, w1: w1, w2: w2, x1: x1, x2: x2,
      k: spring ? state.k : 0, L0: L0 });
    state.sum = CC.summary(p.m1, p.m2, p.v1, p.v2, state.sim.e); // 理想彈簧：e = 1
    state.tEnd = isFinite(state.sim.tc) ? state.sim.tr + AFTER : 4;
    state.t = 0;
    state.running = false;
    state.ended = false;
    computeScales();
    updateSpringUI();
    updatePlayButton();
    updateTable();
    requestDraw();
  }

  /** 依是否加彈簧切換控制項、說明與圖表 */
  function updateSpringUI() {
    const spring = state.spring, sim = state.sim;
    $('e').disabled = spring;
    $('eNote').hidden = !spring;
    $('eo').textContent = num(spring ? 1 : state.p.e, 2);
    $('k').disabled = !spring;
    $('forceStage').hidden = !spring;
    $('uLegend').hidden = !spring;
    document.querySelectorAll('.sp').forEach(function (el) { el.hidden = !spring; });
    let note = '';
    if (spring) {
      note = state.lengthened
        ? T('彈簧較軟：最大壓縮量 x_max = ' + num(sim.contact.xmax, 2) + ' m，本次把彈簧自然長度加長為 L0 = ' + num(sim.L0, 2) + ' m，避免壓到底。',
          'Soft spring: x_max = ' + num(sim.contact.xmax, 2) + ' m, so for this run the natural length is increased to L0 = ' + num(sim.L0, 2) + ' m to keep the spring from bottoming out.')
        : T('彈簧自然長度 L0 = ' + num(sim.L0, 2) + ' m', 'Natural length L0 = ' + num(sim.L0, 2) + ' m');
    }
    $('springNote').textContent = note;
  }

  // 圖表的刻度在一次模擬中固定，長條才不會在播放中忽大忽小
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const ex = Math.floor(Math.log10(v)), f = v / Math.pow(10, ex);
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * Math.pow(10, ex);
  }
  function computeScales() {
    const b = state.sum.before, a = state.sum.after;
    state.scales = {
      p: axis([0, b.p1, b.p2, b.p, a.p1, a.p2, a.p]),
      K: axis([0, b.K1, b.K2, b.K, a.K1, a.K2, a.K])
    };
  }
  /** 含 0 的座標範圍，刻度間隔取 1、2、2.5、5 × 10 的整數次方 */
  function axis(vals) {
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1e-9) hi = lo + 1;
    const step = niceMax((hi - lo) / 3);
    lo = Math.floor(lo / step + 1e-9) * step;
    hi = Math.ceil(hi / step - 1e-9) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return { lo: lo, hi: hi, ticks: ticks };
  }

  // ---------- 數字格式（負號用 U+2212） ----------
  function num(v, d, signed) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    const s = Math.abs(v).toFixed(d);
    if (v < 0) return '−' + s;
    return (signed && v > 0 ? '+' : '') + s;
  }

  // ---------- 畫布與顏色 ----------
  const track = $('track'), tctx = track.getContext('2d');
  const chart = $('chart'), cctx = chart.getContext('2d');
  const force = $('force'), fctx = force.getContext('2d');
  let dpr = 1;
  const size = { track: { w: 0, h: 0 }, chart: { w: 0, h: 0 }, force: { w: 0, h: 0 } };

  let colors = {};
  let dark = false, themeKey = '';
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--pos', '--neg', '--field', '--equi', '--grid', '--text', '--muted', '--border', '--surface', '--accent']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    const b = rgbOf(colors['canvas-bg']);
    dark = (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) < 128; // 深色模式：光暈稍強、陰影稍深
    themeKey = Object.keys(colors).map(function (k) { return colors[k]; }).join(',');
  }
  // 尊重「減少動態效果」：關掉碰撞閃光等純裝飾動畫（物理動畫照常，且預設就是暫停）
  const rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reducedMotion = !!(rmq && rmq.matches);
  if (rmq && rmq.addEventListener) rmq.addEventListener('change', function () { reducedMotion = rmq.matches; requestDraw(); });

  /** 由色彩代號（#rrggbb）產生半透明或調亮／調暗的顏色，不另外發明色相 */
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
  /** 兩個代號顏色之間的混合（t = 0 為 a、1 為 b） */
  function mix(a, b, t) {
    const A = rgbOf(a), B = rgbOf(b);
    return 'rgb(' + A.map(function (x, i) { return Math.round(x + (B[i] - x) * t); }).join(',') + ')';
  }

  function fit(cv, s) {
    dpr = window.devicePixelRatio || 1;
    s.w = cv.clientWidth;
    s.h = cv.clientHeight;
    cv.width = Math.round(s.w * dpr);
    cv.height = Math.round(s.h * dpr);
  }
  function resize() {
    fit(track, size.track);
    fit(chart, size.chart);
    fit(force, size.force);
    draw();
  }

  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
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
  function haloText(ctx, text, x, y, color) {
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  /** 立體小球：亮點偏左上、邊緣加深（標記點、質心頻閃點） */
  function sphere(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.1, x, y, r);
    g.addColorStop(0, shade(color, 0.55));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.3));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  /** 柔和的橢圓接觸陰影（radial gradient，不用 shadowBlur） */
  function softShadow(ctx, x, y, rx, ry, a) {
    if (!(rx > 0 && ry > 0)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    g.addColorStop(0.6, 'rgba(0,0,0,' + (a * 0.45) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- 不變的圖層（離屏畫布，只在尺寸或配色改變時重畫） ----------
  const layers = {};
  function staticLayer(name, w, h, extra, paint) {
    const key = w + 'x' + h + '@' + dpr + '|' + themeKey + '|' + extra;
    let ly = layers[name];
    if (!ly) ly = layers[name] = { cv: document.createElement('canvas'), key: '' };
    if (ly.key !== key) {
      ly.cv.width = Math.max(1, Math.round(w * dpr));
      ly.cv.height = Math.max(1, Math.round(h * dpr));
      const c = ly.cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      paint(c, w, h);
      ly.key = key;
    }
    return ly.cv;
  }
  function blit(ctx, cv) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cv, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  /** 圖表底色：代號底色加極淡的由上而下漸層與四角暈影 */
  function paintPanelBg(c, w, h) {
    const bg = colors['canvas-bg'];
    const lg = c.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, dark ? shade(bg, 0.025) : bg);
    lg.addColorStop(1, dark ? bg : shade(bg, -0.02));
    c.fillStyle = lg;
    c.fillRect(0, 0, w, h);
    const R = Math.hypot(w, h) / 2;
    const rg = c.createRadialGradient(w / 2, h * 0.42, R * 0.35, w / 2, h * 0.42, R * 1.05);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,' + (dark ? 0.16 : 0.03) + ')');
    c.fillStyle = rg;
    c.fillRect(0, 0, w, h);
  }

  /** 軌道畫面的幾何（與原本完全相同的 trackY、車高、輪半徑；只新增軌道厚度 railH） */
  function trackGeom(w, h) {
    const k = w / L, narrow = k < 45;
    const trackY = Math.round(h * 0.74);
    const baseH = Math.max(22, Math.min(58, h * 0.2));
    const wheelR = Math.max(3, baseH * 0.13);
    return { k: k, narrow: narrow, trackY: trackY, baseH: baseH, wheelR: wheelR, railH: narrow ? 5 : 7 };
  }
  /** 鋁軌：頂面高光、正面上亮下暗、底邊暗線，下方有柔和投影與極淡的檯面 */
  function railColor() { return mix(colors.field, colors['canvas-bg'], dark ? 0.5 : 0.38); }
  function paintTrackStatic(c, w, h, g) {
    paintPanelBg(c, w, h);
    const y = g.trackY, rh = g.railH, base = railColor();
    // 檯面：軌道以下極淡的一片，讓軌道「放在」桌面上
    const plane = c.createLinearGradient(0, y, 0, h);
    plane.addColorStop(0, alpha(colors.field, dark ? 0.06 : 0.03));
    plane.addColorStop(1, alpha(colors.field, 0));
    c.fillStyle = plane;
    c.fillRect(0, y + rh, w, h - y - rh);
    // 軌道投影
    const sh = c.createLinearGradient(0, y + rh, 0, y + rh + 8);
    sh.addColorStop(0, 'rgba(0,0,0,' + (dark ? 0.45 : 0.16) + ')');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh;
    c.fillRect(0, y + rh, w, 8);
    // 軌道正面
    const face = c.createLinearGradient(0, y, 0, y + rh);
    face.addColorStop(0, shade(base, 0.4));
    face.addColorStop(0.3, shade(base, 0.12));
    face.addColorStop(1, shade(base, -0.3));
    c.fillStyle = face;
    c.fillRect(0, y, w, rh);
    // 中間的溝槽
    c.fillStyle = alpha(shade(base, -0.45), 0.35);
    c.fillRect(0, y + Math.round(rh * 0.55), w, 1);
    // 頂面高光與底邊暗線
    c.fillStyle = alpha('#ffffff', dark ? 0.32 : 0.6);
    c.fillRect(0, y, w, 1);
    c.fillStyle = shade(base, -0.5);
    c.fillRect(0, y + rh - 1, w, 1);
  }

  /** 碰撞瞬間的閃光、波紋與小火花（純裝飾，0.35 s 淡出；不影響物理狀態） */
  const FLASH = 0.35;
  function drawImpact(ctx, cx, cy, groundY, age, s) {
    const f = age / FLASH, fade = 1 - f, ease = 1 - Math.pow(1 - f, 3);
    const eq = colors.equi;
    // 光暈
    const R = (12 + 20 * ease) * Math.max(0.8, s);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    glow.addColorStop(0, alpha(shade(eq, dark ? 0.7 : 0.8), (dark ? 0.8 : 0.75) * fade));
    glow.addColorStop(0.45, alpha(eq, (dark ? 0.5 : 0.2) * fade));
    glow.addColorStop(1, alpha(eq, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // 擴散的圓環
    ctx.strokeStyle = alpha(eq, 0.85 * fade);
    ctx.lineWidth = (0.5 + 1.8 * fade) * Math.max(0.7, s);
    ctx.beginPath(); ctx.arc(cx, cy, (5 + 30 * ease) * s, 0, Math.PI * 2); ctx.stroke();
    // 光芒
    ctx.lineCap = 'round';
    ctx.strokeStyle = alpha(shade(eq, dark ? 0.35 : 0.1), fade);
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i + 0.5) * Math.PI / 5, r1 = (7 + 16 * ease) * s, r2 = r1 + 9 * fade * s;
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    }
    ctx.stroke();
    // 小火花：從縫隙往上下噴出，受「重力」略往下落
    ctx.fillStyle = alpha(shade(eq, dark ? 0.5 : 0.2), fade);
    for (let i = 0; i < 12; i++) {
      const up = i % 2 ? -1 : 1, a = up * (Math.PI / 2) + (((i * 37) % 11) / 11 - 0.5) * 1.6;
      const d = (8 + (34 + (i * 13) % 17) * ease) * s;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d + 26 * f * f * s;
      ctx.beginPath(); ctx.arc(x, y, (0.5 + 1.4 * fade) * s, 0, Math.PI * 2); ctx.fill();
    }
    // 軌道上的波紋（扁橢圓）
    ctx.strokeStyle = alpha(eq, 0.55 * fade);
    ctx.lineWidth = 1.2;
    const rx = (8 + 46 * ease) * s;
    ctx.beginPath(); ctx.ellipse(cx, groundY, rx, rx * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /** 車輪：輪胎＋輪轂，輪轂上的刻痕隨滾動轉動（角度 = 移動距離 / 輪半徑） */
  function drawWheel(ctx, x, y, r, ang) {
    const tire = dark ? mix(colors.field, colors['canvas-bg'], 0.55) : colors.field;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, shade(tire, 0.3));
    g.addColorStop(1, shade(tire, -0.3));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    const hubC = dark ? colors.field : mix(colors.field, colors['canvas-bg'], 0.72);
    const hr = r * 0.52;
    const hg = ctx.createRadialGradient(x - hr * 0.4, y - hr * 0.45, hr * 0.1, x, y, hr);
    hg.addColorStop(0, shade(hubC, 0.5));
    hg.addColorStop(1, shade(hubC, -0.2));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(x, y, hr, 0, Math.PI * 2); ctx.fill();
    if (r >= 5) {
      ctx.strokeStyle = alpha(shade(tire, -0.1), 0.8);
      ctx.lineWidth = Math.max(0.8, r * 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = ang + i * Math.PI * 2 / 3;
        ctx.moveTo(x + Math.cos(a) * hr * 0.3, y + Math.sin(a) * hr * 0.3);
        ctx.lineTo(x + Math.cos(a) * hr * 0.85, y + Math.sin(a) * hr * 0.85);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.fillStyle = shade(tire, -0.2);
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, r * 0.13), 0, Math.PI * 2); ctx.fill();
  }

  /** 車身：上亮下暗的圓角塊、上方光澤、頂邊 1 px 高光與底邊 1 px 暗線（外形與原本的矩形完全相同） */
  function drawCartBody(ctx, left, top, cw, ch, color) {
    const r = Math.min(6, ch * 0.2);
    const g = ctx.createLinearGradient(0, top, 0, top + ch);
    g.addColorStop(0, shade(color, 0.16));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.14));
    ctx.fillStyle = g;
    roundRect(ctx, left, top, cw, ch, r);
    ctx.fill();
    ctx.save();
    roundRect(ctx, left, top, cw, ch, r);
    ctx.clip();
    // 上半部的光澤
    const gl = ctx.createLinearGradient(0, top, 0, top + ch * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,' + (dark ? 0.16 : 0.22) + ')');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(left, top, cw, ch * 0.5);
    // 頂邊高光、底邊暗線
    ctx.fillStyle = 'rgba(255,255,255,' + (dark ? 0.45 : 0.6) + ')';
    ctx.fillRect(left + r * 0.6, top + 0.5, cw - r * 1.2, 1);
    ctx.fillStyle = alpha(shade(color, -0.45), 0.7);
    ctx.fillRect(left, top + ch - 1.5, cw, 1.5);
    ctx.restore();
    // 細外框讓邊緣俐落
    ctx.strokeStyle = alpha(shade(color, -0.35), dark ? 0.5 : 0.45);
    ctx.lineWidth = 1;
    roundRect(ctx, left + 0.5, top + 0.5, cw - 1, ch - 1, Math.max(0, r - 0.5));
    ctx.stroke();
  }

  function draw() {
    if (!state.sim || !size.track.w) return;
    const st = CC.stateAt(state.sim, state.t);
    drawTrack(st);
    if (state.mode === 'bars') drawBars(st); else drawTime(st);
    if (state.sim.spring && size.force.w) drawForce(st);
    updateReadout(st);
  }

  // ---------- 軌道動畫 ----------
  function drawTrack(st) {
    const ctx = tctx, w = size.track.w, h = size.track.h, sim = state.sim;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const G = trackGeom(w, h);
    const k = G.k;                          // px / m
    const narrow = G.narrow;
    // 質心參考系：鏡頭跟著質心移動
    const off = state.cmFrame ? st.xcm - XC : 0;
    const X = function (x) { return (x - off) * k; };
    const vShift = state.cmFrame ? st.vcm : 0;
    const trackY = G.trackY, baseH = G.baseH, wheelR = G.wheelR, railH = G.railH;
    const pxa = function (v) { return Math.round(v) + 0.5; };

    // 背景、檯面與軌道（離屏圖層）
    blit(ctx, staticLayer('track', w, h, railH, function (c) { paintTrackStatic(c, w, h, G); }));

    // 尺規格線：每 1 m 主格線、每 0.5 m 次格線，往上漸淡
    const first = Math.ceil(off), last = Math.floor(off + L);
    const fadeUp = function (a) {
      const gr = ctx.createLinearGradient(0, 0, 0, trackY);
      gr.addColorStop(0, alpha(colors.text, a * 0.25));
      gr.addColorStop(1, alpha(colors.text, a));
      return gr;
    };
    ctx.lineWidth = 1;
    if (!narrow) {
      ctx.strokeStyle = fadeUp(dark ? 0.045 : 0.04);
      ctx.beginPath();
      for (let m = Math.ceil(off - 0.5); m <= last; m++) { const x = pxa(X(m + 0.5)); ctx.moveTo(x, 0); ctx.lineTo(x, trackY); }
      ctx.stroke();
    }
    ctx.strokeStyle = fadeUp(dark ? 0.11 : 0.1);
    ctx.beginPath();
    for (let m = first; m <= last; m++) { const x = pxa(X(m)); ctx.moveTo(x, 0); ctx.lineTo(x, trackY); }
    ctx.stroke();
    // 刻度（軌道下方）與數字
    ctx.strokeStyle = alpha(colors.muted, 0.75);
    ctx.beginPath();
    const labeled = [], rulerY = Math.min(h - 6, trackY + 38);
    for (let m = first; m <= last; m++) {
      const x = pxa(X(m));
      ctx.moveTo(x, trackY + railH + 2); ctx.lineTo(x, trackY + railH + 7);
      if ((!narrow || m % 2 === 0) && X(m) > 12 && X(m) < w - 12) labeled.push(m);
    }
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.font = (narrow ? 10 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    labeled.forEach(function (m, i) {
      ctx.fillText(String(m).replace('-', '−'), X(m), rulerY);
      if (i === labeled.length - 1) { ctx.textAlign = 'left'; ctx.fillText(' m', X(m) + ctx.measureText(String(m)).width / 2, rulerY); ctx.textAlign = 'center'; }
    });

    // 質心頻閃標記：等時間間隔、等距離 → 等速度（嵌在軌道正面，越舊越淡）
    const dotY = trackY + railH / 2, dotR = narrow ? 2.1 : 3;
    for (let ts = 0; ts <= state.t + 1e-9; ts += STROBE) {
      const s = CC.stateAt(sim, ts), x = X(s.xcm);
      if (x < -6 || x > w + 6) continue;
      ctx.globalAlpha = state.t > 0 ? 0.5 + 0.5 * ts / state.t : 1;
      ctx.fillStyle = colors['canvas-bg'];
      ctx.beginPath(); ctx.arc(x, dotY, dotR + (narrow ? 0.9 : 1.2), 0, Math.PI * 2); ctx.fill();
      sphere(ctx, x, dotY, dotR, colors.equi);
    }
    ctx.globalAlpha = 1;

    // 兩台車
    const carts = [
      { x: st.x1, w: sim.w1, v: st.v1, m: sim.m1, color: colors.pos, label: '1', side: -1 },
      { x: st.x2, w: sim.w2, v: st.v2, m: sim.m2, color: colors.neg, label: '2', side: 1 }
    ];
    carts.forEach(function (c) {
      const cw = c.w * k, ch = baseH * c.w / W_MAX;
      c.px = X(c.x); c.top = trackY - 2 * wheelR - ch; c.cw = cw; c.ch = ch; c.left = c.px - cw / 2;
    });
    // 接觸陰影：車身在軌道上的一片、每個輪子下方較深的一小片
    carts.forEach(function (c) {
      softShadow(ctx, c.px, trackY + 1, c.cw * 0.56, Math.max(2.5, railH * 0.55), dark ? 0.45 : 0.22);
      [0.25, 0.75].forEach(function (f) { softShadow(ctx, c.left + c.cw * f, trackY + 0.5, wheelR * 1.3, wheelR * 0.42, dark ? 0.6 : 0.38); });
    });
    carts.forEach(function (c) {
      const ang = c.x * k / wheelR; // 滾動不打滑：轉角 = 移動距離 / 半徑
      [0.25, 0.75].forEach(function (f) { drawWheel(ctx, c.left + c.cw * f, trackY - wheelR, wheelR, ang); });
      drawCartBody(ctx, c.left, c.top, c.cw, c.ch, c.color);
      const showMass = c.cw >= 50 && c.ch >= 36;
      const ty1 = c.top + c.ch * (showMass ? 0.36 : 0.52);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + Math.round(Math.min(18, c.ch * 0.42)) + 'px system-ui, sans-serif';
      ctx.fillStyle = alpha(shade(c.color, -0.5), 0.45);
      ctx.fillText(c.label, c.px, ty1 + 1);
      ctx.fillStyle = colors['canvas-bg'];
      ctx.fillText(c.label, c.px, ty1);
      if (showMass) {
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillStyle = alpha(shade(c.color, -0.5), 0.4);
        ctx.fillText(num(c.m, 1) + ' kg', c.px, c.top + c.ch * 0.72 + 1);
        ctx.fillStyle = colors['canvas-bg'];
        ctx.fillText(num(c.m, 1) + ' kg', c.px, c.top + c.ch * 0.72);
      }
    });

    // 碰撞瞬間的閃光與波紋（只有直接碰撞，彈簧不畫；尊重 prefers-reduced-motion）
    if (isFinite(sim.tc) && !sim.spring && !reducedMotion) {
      const age = state.t - sim.tc;
      if (age >= 0 && age < FLASH) {
        const s = CC.stateAt(sim, sim.tc);
        const cx = X(s.x1 + sim.w1 / 2);
        const cy = trackY - 2 * wheelR - Math.min(carts[0].ch, carts[1].ch) * 0.5;
        const sc = Math.max(0.45, Math.min(1, Math.min(carts[0].ch, carts[1].ch) / 42));
        drawImpact(ctx, cx, cy, trackY + railH / 2, age, sc);
      }
    }

    if (sim.spring) drawSpring(ctx, st, carts, X, trackY - 2 * wheelR, k, narrow);

    // 速度箭頭與數值（在質心參考系中為相對質心的速度）；箭頭尖端 = 車中心 + 速度 × 比例
    const unit = k * ARROW_M_PER_MPS;
    const alw = narrow ? 2.5 : 3;
    carts.forEach(function (c) {
      const v = c.v - vShift;
      const ay = c.top - 10;
      if (Math.abs(v) > 1e-9) {
        const len = Math.max(8, Math.abs(v) * unit), ux = Math.sign(v);
        vecArrow(ctx, c.px, ay, ux, len, alw, c.color);
      } else {
        ctx.fillStyle = colors['canvas-bg'];
        ctx.beginPath(); ctx.arc(c.px, ay, 4.7, 0, Math.PI * 2); ctx.fill();
        sphere(ctx, c.px, ay, 3.5, c.color);
      }
      // 數值往外側對齊：兩車相碰時標籤不會重疊
      ctx.font = '600 ' + (narrow ? 11 : 13) + 'px system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      if (c.px + c.cw / 2 < 0 || c.px - c.cw / 2 > w) return; // 車子已離開畫面
      const name = narrow ? '' : (state.cmFrame ? 'v' + c.label + ' − vcm = ' : 'v' + c.label + ' = ');
      const text = name + num(v, narrow ? 1 : 2, true) + ' m/s';
      const tw = ctx.measureText(text).width;
      // 車 1 的標籤靠右對齊在車 1 右緣、車 2 靠左對齊在車 2 左緣（向外延伸），再限制在畫面內
      let tx = c.side < 0 ? c.px + c.cw / 2 - tw : c.px - c.cw / 2;
      tx = Math.max(4, Math.min(w - 4 - tw, tx));
      ctx.textAlign = 'left';
      haloText(ctx, text, tx, ay - 9, colors.text);
    });

    // 質心標記：虛線 + 軌道下方的立體三角形
    const cx = X(st.xcm), eq = colors.equi;
    ctx.strokeStyle = alpha(eq, 0.85);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, trackY - 2 * wheelR - baseH - 2);
    ctx.lineTo(cx, trackY);
    ctx.stroke();
    ctx.setLineDash([]);
    const ty0 = trackY + railH + 2, ty1 = ty0 + 12;
    const tri = function () {
      ctx.beginPath();
      ctx.moveTo(cx, ty0); ctx.lineTo(cx - 7, ty1); ctx.lineTo(cx + 7, ty1); ctx.closePath();
    };
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.lineWidth = 3.5;
    tri(); ctx.stroke();
    const tg = ctx.createLinearGradient(cx - 7, ty0, cx + 7, ty1);
    tg.addColorStop(0, shade(eq, 0.35));
    tg.addColorStop(1, shade(eq, -0.2));
    ctx.fillStyle = tg;
    ctx.strokeStyle = tg;
    ctx.lineWidth = 1.5;
    tri(); ctx.fill(); ctx.stroke();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    haloText(ctx, T('質心', 'CM'), cx + 10, ty0 + 8, colors.text);

    // 左上角：時間與參考系（半透明圓角底框）
    ctx.font = (narrow ? 11 : 13) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    pillText(ctx, 't = ' + num(state.t, 2) + ' s' + (state.cmFrame ? T('　質心參考系', '   CM frame') : ''), 12, narrow ? 14 : 17, colors.muted, 0.75);
  }

  // ---------- 彈簧（管狀線圈）與彈力箭頭 ----------
  /**
   * 向量箭頭：箭身寬 lw、箭頭長約 4 倍箭身寬、兩側略帶弧度。
   * 箭頭尖端位置 = 起點 + dir × len（len 以像素計，與力的大小成正比）。
   */
  function vecArrow(ctx, x, y, dir, len, lw, color) {
    const head = Math.min(4 * lw, len), hw = 1.7 * lw;
    const xt = x + dir * len, xh = xt - dir * head;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    if (len > head + 1) {
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xh + dir * head * 0.3, y); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(xt, y);
    ctx.quadraticCurveTo(xt - dir * head * 0.45, y - hw * 0.35, xh, y - hw);
    ctx.lineTo(xh + dir * head * 0.2, y);
    ctx.lineTo(xh, y + hw);
    ctx.quadraticCurveTo(xt - dir * head * 0.45, y + hw * 0.35, xt, y);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = 'butt';
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

  function drawSpring(ctx, st, carts, X, baseY, k, narrow) {
    const sim = state.sim, c1 = carts[0], c2 = carts[1];
    // 彈簧在物理上的位置：車 1 右緣到尖端，長度 L0 − x（與 collision-core 完全一致）
    const xa = X(st.x1 + sim.w1 / 2);
    const xb = X(st.x1 + sim.w1 / 2 + sim.L0 - st.x);
    const y = baseY - Math.min(c1.ch, c2.ch) * 0.5;
    const amp = Math.max(3, Math.min(9, Math.min(c1.ch, c2.ch) * 0.3));
    const tubeW = narrow ? 2.2 : 3;
    const plateW = narrow ? 3 : 4;
    const lead = Math.min(6, (xb - xa) * 0.12);
    const x0 = xa + lead, x1 = xb - plateW - lead;
    // 圈數依自然長度決定，壓縮時圈距變密
    const coils = Math.max(4, Math.min(8, Math.round(sim.L0 * k / 14)));
    const steps = coils * 24;
    const tilt = amp * 0.35; // 側視螺旋略帶透視：前後半圈左右錯開，看得出纏繞
    const front = [], back = [];
    let seg = null, segFront = null;
    for (let j = 0; j <= steps; j++) {
      const th = j / steps * coils * Math.PI * 2;
      const px = x0 + (x1 - x0) * j / steps + tilt * Math.sin(th) * Math.min(1, (x1 - x0) / (coils * amp));
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
    // 後半圈：較暗、較細（在後面）
    back.forEach(function (p) { tube(ctx, p, tubeW * 0.8, shade(acc, -0.45), null); });
    // 兩端直線段
    tube(ctx, [[xa, y], [x0, y - amp]], tubeW, shade(acc, -0.2), shade(acc, 0.45));
    tube(ctx, [[x1, y - amp], [xb - plateW, y]], tubeW, shade(acc, -0.2), shade(acc, 0.45));
    // 前半圈：較亮，有高光（在前面）
    front.forEach(function (p) { tube(ctx, p, tubeW, shade(acc, -0.12), shade(acc, 0.55)); });
    // 尖端的擋板：上亮下暗的小圓角板
    const ph = amp * 2 + 6;
    const g = ctx.createLinearGradient(0, y - ph / 2, 0, y + ph / 2);
    g.addColorStop(0, shade(colors.field, 0.25));
    g.addColorStop(1, shade(colors.field, -0.15));
    ctx.fillStyle = g;
    roundRect(ctx, xb - plateW, y - ph / 2, plateW, ph, Math.min(2, plateW / 2));
    ctx.fill();

    // 接觸期間：兩車所受彈力（大小相等、方向相反），箭頭長度 ∝ 彈力（本次最大彈力為滿格）
    if (st.contact && st.F > 0) {
      const maxLen = narrow ? 36 : 60;
      const len = maxLen * st.F / sim.contact.Fmax;
      const lw = narrow ? 2.5 : 3;
      const fy = y;
      const xL = c1.px - c1.cw / 2 - 3, xR = c2.px + c2.cw / 2 + 3;
      if (len > 1.5) {
        vecArrow(ctx, xL, fy, -1, len, lw, acc);
        vecArrow(ctx, xR, fy, 1, len, lw, acc);
      }
      ctx.font = '600 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif';
      ctx.textBaseline = 'bottom';
      const label = narrow ? 'F' : 'F = ' + num(st.F, 1) + ' N';
      ctx.textAlign = 'right';
      haloText(ctx, label, xL - 2, fy - 6, acc);
      ctx.textAlign = 'left';
      haloText(ctx, label, xR + 2, fy - 6, acc);
    }
  }

  // ---------- 彈力–時間圖（只在加彈簧時顯示） ----------
  /** 有半透明圓角底框（pill）的標籤；ctx.textAlign 決定水平對齊，垂直置中於 y */
  function pillText(ctx, text, x, y, color, bgAlpha) {
    const m = ctx.measureText(text), tw = m.width;
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 14; // 已含字體大小縮放
    const ph = fh + 4, pw = tw + 10;
    const al = ctx.textAlign;
    const bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - tw - 5 : x - 5;
    ctx.fillStyle = alpha(colors['canvas-bg'], bgAlpha == null ? 0.9 : bgAlpha);
    roundRect(ctx, bx, y - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 0.5);
  }
  function decimalsFor(step) {
    let d = 0;
    while (d < 6 && Math.abs(step * Math.pow(10, d) - Math.round(step * Math.pow(10, d))) > 1e-6) d++;
    return d;
  }
  function drawForce(st) {
    const ctx = fctx, w = size.force.w, h = size.force.h, sim = state.sim, c = sim.contact;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 背景：代號底色加極淡的由上而下漸層
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, colors['canvas-bg']);
    bg.addColorStop(1, shade(colors['canvas-bg'], -0.03));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const small = w < 480;
    ctx.font = '600 ' + (small ? 12 : 13) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.text;
    ctx.fillText(T('彈力 F = kx（N）', 'Spring force F = kx (N)'), 10, 8);
    if (!c) {
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colors.muted;
      ctx.fillText(T('兩車沒有接近，彈簧不會被壓縮。', 'The carts are not approaching, so the spring is never compressed.'), w / 2, h / 2);
      return;
    }
    const left = small ? 40 : 50, right = w - (small ? 14 : 20), top = 36, bottom = h - (small ? 42 : 46);
    const t0 = sim.tc - 0.15 * c.dt, t1 = sim.tr + 0.15 * c.dt;
    const X = function (t) { return left + (t - t0) / (t1 - t0) * (right - left); };
    const ax = axis([0, c.Fmax * 1.12]);
    const Y = function (F) { return bottom - F / ax.hi * (bottom - top); };
    const px = function (v) { return Math.round(v) + 0.5; };

    // 格線與刻度
    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ax.ticks.forEach(function (v) { if (v > 0) { ctx.moveTo(left, px(Y(v))); ctx.lineTo(right, px(Y(v))); } });
    ctx.stroke();
    const dF = decimalsFor(ax.ticks[1] - ax.ticks[0]);
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ax.ticks.forEach(function (v) { ctx.fillText(num(v, dF), left - 5, Y(v)); });
    const tStep = niceMax((t1 - t0) / (small ? 3 : 5)), dT = decimalsFor(tStep);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    for (let tt = Math.ceil(t0 / tStep - 1e-9) * tStep; tt <= t1 + 1e-9; tt += tStep) {
      ctx.moveTo(px(X(tt)), top); ctx.lineTo(px(X(tt)), bottom);
      ctx.fillText(num(tt, dT), X(tt), bottom + 4);
    }
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(T('t（s）', 't (s)'), left - 5, bottom + 4);
    ctx.strokeStyle = colors.field;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(left, px(Y(0))); ctx.lineTo(right, px(Y(0))); ctx.stroke();

    // F(t) = k x(t)：整段半個正弦（虛線預覽）＋到目前為止的實線與陰影面積
    const N = 96, curve = [];
    for (let j = 0; j <= N; j++) {
      const tt = sim.tc + (sim.tr - sim.tc) * j / N;
      curve.push([tt, j === N ? 0 : CC.stateAt(sim, tt).F]);
    }
    const tPeak = (sim.tc + sim.tr) / 2, xPeak = X(tPeak), yPeak = Y(c.Fmax);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = alpha(colors.muted, 0.7);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    curve.forEach(function (p, j) { if (j) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); });
    ctx.moveTo(left, yPeak); ctx.lineTo(xPeak, yPeak); // F_max 參考線
    ctx.stroke();
    ctx.setLineDash([]);

    const tn = Math.min(state.t, sim.tr);
    const done = curve.filter(function (p) { return p[0] <= tn; });
    if (state.t > sim.tc) {
      done.push([tn, CC.stateAt(sim, Math.min(tn, sim.tr - 1e-12)).F]);
      const area = ctx.createLinearGradient(0, yPeak, 0, Y(0));
      area.addColorStop(0, alpha(colors.accent, 0.5));
      area.addColorStop(1, alpha(colors.accent, 0.1));
      ctx.fillStyle = area;
      ctx.beginPath();
      ctx.moveTo(X(sim.tc), Y(0));
      done.forEach(function (p) { ctx.lineTo(X(p[0]), Y(p[1])); });
      ctx.lineTo(X(tn), Y(0));
      ctx.closePath();
      ctx.fill();
      tube(ctx, done.map(function (p) { return [X(p[0]), Y(p[1])]; }), small ? 2.6 : 3.2, shade(colors.accent, -0.15), shade(colors.accent, 0.5));
    }

    // F_max 標籤
    ctx.font = '600 ' + (small ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    haloText(ctx, 'F_max = ' + num(c.Fmax, 1) + ' N', left + 4, yPeak - 3, colors.muted);
    // 最大壓縮瞬間：兩車同速 v_cm（標記點：小球體）
    if (state.t >= tPeak) {
      const r = small ? 4 : 5;
      const gb = ctx.createRadialGradient(xPeak - r * 0.35, yPeak - r * 0.35, r * 0.1, xPeak, yPeak, r);
      gb.addColorStop(0, shade(colors.accent, 0.6));
      gb.addColorStop(1, shade(colors.accent, -0.25));
      ctx.fillStyle = gb;
      ctx.beginPath(); ctx.arc(xPeak, yPeak, r, 0, Math.PI * 2); ctx.fill();
      // 標籤放在頂點右上方（不壓在曲線與 F_max 標籤上）
      ctx.textAlign = 'left';
      const lab = 'x_max: v1 = v2 = vcm', lw = ctx.measureText(lab).width;
      pillText(ctx, lab, Math.min(xPeak + r + 4, right - lw - 5), yPeak - r - 11, colors.text);
    }
    // 衝量 = 陰影面積
    if (state.t > sim.tc) {
      const J = st.p2 - state.sum.before.p2;
      ctx.font = '600 ' + (small ? 12 : 13) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const yJ = Y(c.Fmax * 0.42);
      pillText(ctx, 'J = ∫F dt = ' + num(J, 2) + ' N·s', xPeak, yJ, colors.text, 0.82);
      if (state.t >= sim.tr) {
        ctx.font = (small ? 11 : 12) + 'px system-ui, sans-serif';
        pillText(ctx, '= Δp2 = −Δp1', xPeak, yJ + (small ? 19 : 21), colors.text, 0.82);
      }
    }
    // 接觸時間 Δt（下方括號）
    const yb = bottom + (small ? 28 : 30), xa = X(sim.tc), xr = X(sim.tr);
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xa, yb - 4); ctx.lineTo(xa, yb); ctx.lineTo(xr, yb); ctx.lineTo(xr, yb - 4);
    ctx.stroke();
    ctx.font = (small ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    pillText(ctx, 'Δt = ' + num(c.dt, 3) + ' s', (xa + xr) / 2, yb, colors.muted, 1);
    // 目前時刻
    if (state.t >= t0 && state.t <= t1) {
      ctx.strokeStyle = alpha(colors.equi, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px(X(state.t)), top - 4); ctx.lineTo(px(X(state.t)), bottom); ctx.stroke();
    }
  }

  // ---------- 圖表共用 ----------
  /** 主格線（刻度）與次格線（刻度中間）：1 物理像素、對齊像素 */
  function hGrid(ctx, ticks, Y, left, right, withZero) {
    const pxa = function (v) { return Math.round(v) + 0.5; };
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(colors.text, dark ? 0.035 : 0.035);
    ctx.beginPath();
    for (let i = 1; i < ticks.length; i++) { const y = pxa(Y((ticks[i - 1] + ticks[i]) / 2)); ctx.moveTo(left, y); ctx.lineTo(right, y); }
    ctx.stroke();
    ctx.strokeStyle = alpha(colors.text, dark ? 0.09 : 0.085);
    ctx.beginPath();
    ticks.forEach(function (v) { if (withZero || v !== 0) { const y = pxa(Y(v)); ctx.moveTo(left, y); ctx.lineTo(right, y); } });
    ctx.stroke();
  }
  /** 零基線：上亮下暗的細「管」 */
  function baseLine(ctx, left, right, y) {
    y = Math.round(y);
    ctx.fillStyle = alpha(colors.field, 0.9);
    ctx.fillRect(left, y - 1, right - left, 2);
    ctx.fillStyle = alpha(colors['canvas-bg'], dark ? 0.12 : 0.25);
    ctx.fillRect(left, y - 1, right - left, 0.6);
  }

  // 有彈簧時，能量圖多一項彈性位能 U，總和為 K1 + K2 + U
  function seriesFor(kind) {
    const s = [
      { label: T('車 1', 'Cart 1'), color: colors.pos, tag: '1' },
      { label: T('車 2', 'Cart 2'), color: colors.neg, tag: '2' }
    ];
    if (kind === 'K' && state.sim.spring) s.push({ label: T('彈簧 U', 'Spring U'), short: 'U', color: colors.accent, tag: 'U' });
    s.push({ label: T('總和', 'Total'), color: colors.field, tag: T('總', 'Σ'), total: true });
    return s;
  }
  function valuesOf(q, kind) {
    if (kind === 'p') return [q.p1, q.p2, q.p];
    if (state.sim.spring) return [q.K1, q.K2, q.U || 0, q.E != null ? q.E : q.K];
    return [q.K1, q.K2, q.K];
  }

  const TITLE_P = T('動量 p（kg·m/s）', 'Momentum p (kg·m/s)');
  const TITLE_K0 = T('動能 K（J）', 'Kinetic energy K (J)');
  const TITLE_KU = T('能量 K、U（J）', 'Energy K, U (J)');

  // ---------- 長條圖 ----------
  function drawBars(st) {
    const ctx = cctx, w = size.chart.w, h = size.chart.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    blit(ctx, staticLayer('chart', w, h, '', paintPanelBg));
    const half = w / 2;
    barPanel(ctx, 0, 0, half, h, 'p', TITLE_P, st);
    barPanel(ctx, half, 0, half, h, 'K', state.sim.spring ? TITLE_KU : TITLE_K0, st);
    // 分隔線：上下漸淡
    const sep = ctx.createLinearGradient(0, 10, 0, h - 10);
    sep.addColorStop(0, alpha(colors.border, 0));
    sep.addColorStop(0.2, colors.border);
    sep.addColorStop(0.8, colors.border);
    sep.addColorStop(1, alpha(colors.border, 0));
    ctx.fillStyle = sep;
    ctx.fillRect(Math.round(half), 10, 1, h - 20);
  }

  /** 長條：資料端圓角、基線端直角 */
  function barPath(ctx, cx, bw, y0v, yv, r) {
    const up = yv < y0v, l = cx - bw / 2, rr = cx + bw / 2;
    ctx.beginPath();
    ctx.moveTo(l, y0v);
    if (up) {
      ctx.lineTo(l, yv + r); ctx.arcTo(l, yv, l + r, yv, r);
      ctx.lineTo(rr - r, yv); ctx.arcTo(rr, yv, rr, yv + r, r);
    } else {
      ctx.lineTo(l, yv - r); ctx.arcTo(l, yv, l + r, yv, r);
      ctx.lineTo(rr - r, yv); ctx.arcTo(rr, yv, rr, yv - r, r);
    }
    ctx.lineTo(rr, y0v);
    ctx.closePath();
  }

  function barPanel(ctx, x0, y0, pw, ph, kind, title, st) {
    const ax = state.scales[kind], lo = ax.lo, hi = ax.hi;
    const small = pw < 220;
    const top = y0 + 34, bottom = y0 + ph - 26;
    const left = x0 + (small ? 8 : 14), right = x0 + pw - (small ? 8 : 14);
    const Y = function (v) { return bottom - (v - lo) / (hi - lo) * (bottom - top); };

    ctx.font = '600 ' + (small ? 12 : 13) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.text;
    ctx.fillText(title, left, y0 + 8);

    hGrid(ctx, ax.ticks, Y, left, right, false);

    const ser = seriesFor(kind), n = ser.length;
    const vals = valuesOf(st, kind), ghost = valuesOf(state.sum.before, kind);
    const slot = (right - left) / n, bw = Math.min(48, slot * 0.56);
    const y0v = Y(0);
    for (let i = 0; i < n; i++) {
      const cx = left + slot * (i + 0.5), col = ser[i].color;
      const v = vals[i], yv = Y(v);
      // 每一欄極淡的底槽
      ctx.fillStyle = alpha(colors.text, dark ? 0.03 : 0.025);
      roundRect(ctx, cx - bw / 2 - 4, top - 4, bw + 8, bottom - top + 8, 6);
      ctx.fill();
      if (Math.abs(yv - y0v) > 0.5) {
        const r = Math.min(4, Math.abs(yv - y0v) / 2), up = yv < y0v;
        // 左亮右暗的柱體
        const g = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
        g.addColorStop(0, shade(col, 0.2));
        g.addColorStop(0.4, col);
        g.addColorStop(1, shade(col, -0.18));
        ctx.fillStyle = g;
        barPath(ctx, cx, bw, y0v, yv, r);
        ctx.fill();
        // 由資料端往基線的淡光澤
        ctx.save();
        barPath(ctx, cx, bw, y0v, yv, r);
        ctx.clip();
        const sh = ctx.createLinearGradient(0, yv, 0, y0v);
        sh.addColorStop(0, 'rgba(255,255,255,' + (dark ? 0.14 : 0.18) + ')');
        sh.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sh;
        ctx.fillRect(cx - bw / 2, Math.min(yv, y0v), bw, Math.abs(yv - y0v));
        // 資料端 1 px 高光
        ctx.fillStyle = 'rgba(255,255,255,' + (dark ? 0.4 : 0.55) + ')';
        ctx.fillRect(cx - bw / 2 + r, up ? yv + 0.5 : yv - 1.5, bw - 2 * r, 1);
        ctx.restore();
      }
      // 碰撞前數值的虛線外框
      if (st.collided && Math.abs(ghost[i] - v) > 1e-9) {
        const yg = Y(ghost[i]);
        ctx.strokeStyle = alpha(colors.muted, 0.9);
        ctx.lineWidth = 1.2;
        ctx.lineJoin = 'round';
        ctx.setLineDash([4, 3]);
        roundRect(ctx, Math.round(cx - bw / 2 - 3) + 0.5, Math.min(yg, y0v), Math.round(bw + 6), Math.abs(yg - y0v), 3);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // 數值標籤：半透明圓角底框，放在長條末端外側
      ctx.font = '600 ' + (small ? 11 : 12) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const below = v < 0;
      const fh = small ? 15 : 16;
      let ty = below ? yv + 4 + fh / 2 : yv - 4 - fh / 2;
      if (!below) ty = Math.max(ty, top + fh / 2 - 6);
      pillText(ctx, num(v, small ? 1 : 2, kind === 'p'), cx, ty, colors.text, 0.85);
      // 類別標籤
      ctx.font = (small ? 11 : 12) + 'px system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = colors.muted;
      const lab = ser[i].short && ctx.measureText(ser[i].label).width > slot - 4 ? ser[i].short : ser[i].label;
      ctx.fillText(lab, cx, y0 + ph - 8);
    }
    baseLine(ctx, left, right, y0v);
  }

  // ---------- 時間圖 ----------
  function drawTime(st) {
    const ctx = cctx, w = size.chart.w, h = size.chart.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    blit(ctx, staticLayer('chart', w, h, '', paintPanelBg));
    if (w >= 520) {
      timePanel(ctx, 0, 0, w / 2, h, 'p', TITLE_P, st);
      timePanel(ctx, w / 2, 0, w / 2, h, 'K', state.sim.spring ? TITLE_KU : TITLE_K0, st);
    } else {
      timePanel(ctx, 0, 0, w, h / 2, 'p', TITLE_P, st);
      timePanel(ctx, 0, h / 2, w, h / 2, 'K', state.sim.spring ? TITLE_KU : TITLE_K0, st);
    }
  }

  function timePanel(ctx, x0, y0, pw, ph, kind, title, st) {
    const sim = state.sim, ax = state.scales[kind], lo = ax.lo, hi = ax.hi;
    const left = x0 + 44, right = x0 + pw - 26, top = y0 + 28, bottom = y0 + ph - 22;
    const tMax = state.tEnd;
    const X = function (t) { return left + t / tMax * (right - left); };
    const Y = function (v) { return bottom - (v - lo) / (hi - lo) * (bottom - top); };
    const pxa = function (v) { return Math.round(v) + 0.5; };

    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.text;
    ctx.fillText(title, x0 + 8, y0 + 6);
    const titleRight = x0 + 8 + ctx.measureText(title).width;

    // 繪圖區：極淡的底色
    ctx.fillStyle = alpha(colors.text, dark ? 0.02 : 0.018);
    ctx.fillRect(left, top, right - left, bottom - top);

    // 軸與刻度
    const ticks = ax.ticks;
    hGrid(ctx, ticks, Y, left, right, true);
    const step = tMax > 5 ? 2 : 1;
    ctx.strokeStyle = alpha(colors.text, 0.05);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = step; t <= tMax + 1e-9; t += step) { const x = pxa(X(t)); ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
    ctx.stroke();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.muted;
    ticks.forEach(function (v) { ctx.fillText(num(v, Number.isInteger(v) ? 0 : Number.isInteger(v * 10) ? 1 : 2), left - 5, Y(v)); });
    baseLine(ctx, left, right, Y(0));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.muted;
    for (let t = 0; t <= tMax + 1e-9; t += step) ctx.fillText(String(t), X(t), bottom + 4);
    ctx.textAlign = 'right';
    ctx.fillText(T('t（s）', 't (s)'), left - 5, bottom + 4);

    // 彈簧接觸期間：淡色帶（上濃下淡）
    if (sim.spring && isFinite(sim.tc)) {
      const band = ctx.createLinearGradient(0, top - 4, 0, bottom);
      band.addColorStop(0, alpha(colors.accent, 0.18));
      band.addColorStop(1, alpha(colors.accent, 0.07));
      ctx.fillStyle = band;
      ctx.fillRect(X(sim.tc), top - 4, Math.max(1, X(sim.tr) - X(sim.tc)), bottom - top + 4);
    }
    // 碰撞時刻
    if (isFinite(sim.tc)) {
      const xc = pxa(X(sim.tc));
      ctx.strokeStyle = alpha(colors.equi, 0.9);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(xc, top - 4); ctx.lineTo(xc, bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'bottom';
      const label = sim.spring ? T('接觸', 'Contact') : T('碰撞', 'Collision'), lx = X(sim.tc);
      // 窄畫面上標籤若會壓到圖表標題，改放在虛線右側
      if (lx - ctx.measureText(label).width / 2 < titleRight + 6) {
        ctx.textAlign = 'left';
        haloText(ctx, label, Math.max(lx + 4, titleRight + 6), top - 4, colors.muted);
      } else {
        ctx.textAlign = 'center';
        haloText(ctx, label, lx, top - 4, colors.muted);
      }
    }

    // 數值曲線（碰撞前後各為常數，碰撞瞬間跳躍；有彈簧時接觸期間平滑變化）
    const ser = seriesFor(kind), n = ser.length;
    const before = valuesOf(state.sum.before, kind), after = valuesOf(state.sum.after, kind);
    const t = state.t, hit = isFinite(sim.tc) && t >= sim.tc;
    const ends = [];
    let samples = null;
    if (sim.spring && hit) {
      // 解析解取樣：接觸前一點、接觸期間 48 點、放開後一點
      samples = [0, sim.tc];
      const tEndC = Math.min(t, sim.tr);
      for (let j = 1; j <= 48; j++) samples.push(sim.tc + (tEndC - sim.tc) * j / 48);
      if (t > sim.tr) samples.push(t);
      samples = samples.map(function (tt) { return { t: tt, v: valuesOf(CC.stateAt(sim, tt), kind) }; });
    }
    for (let i = n - 1; i >= 0; i--) {
      const col = ser[i].color;
      // 總和畫成較粗的半透明管子，與其他曲線重疊時仍看得見；各車為細管
      const line = function (pts) {
        if (ser[i].total) tube(ctx, pts, 6.5, alpha(col, 0.36), alpha(shade(col, dark ? 0.35 : 0.55), 0.45));
        else tube(ctx, pts, 2.6, shade(col, -0.08), alpha(shade(col, 0.55), 0.85));
      };
      if (samples) {
        line(samples.map(function (sm) { return [X(sm.t), Y(sm.v[i])]; }));
        ends.push({ i: i, y: Y(samples[samples.length - 1].v[i]) });
        continue;
      }
      line([[X(0), Y(before[i])], [X(hit ? sim.tc : t), Y(before[i])]]);
      if (hit) {
        ctx.strokeStyle = alpha(col, ser[i].total ? 0.5 : 0.85);
        ctx.lineWidth = ser[i].total ? 2 : 1.4;
        ctx.lineCap = 'round';
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(X(sim.tc), Y(before[i])); ctx.lineTo(X(sim.tc), Y(after[i])); ctx.stroke();
        ctx.setLineDash([]);
        line([[X(sim.tc), Y(after[i])], [X(t), Y(after[i])]]);
      }
      ends.push({ i: i, y: Y(hit ? after[i] : before[i]) });
    }
    ctx.lineCap = 'butt';
    // 線尾：立體小球標出目前的值，旁邊是圓角底框的直接標籤（避開重疊）
    const xe = X(t);
    ends.forEach(function (e) { e.y0 = e.y; sphere(ctx, xe, e.y, ser[e.i].total ? 4 : 3.2, ser[e.i].color); });
    ends.sort(function (a, b) { return a.y - b.y; });
    for (let j = 1; j < ends.length; j++) if (ends[j].y - ends[j - 1].y < 15) ends[j].y = ends[j - 1].y + 15;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ends.forEach(function (e) {
      const xx = Math.min(xe + 9, right + 4);
      if (Math.abs(e.y - e.y0) > 2) {
        ctx.strokeStyle = alpha(ser[e.i].color, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xe + 3, e.y0); ctx.lineTo(xx - 2, e.y); ctx.stroke();
      }
      pillText(ctx, ser[e.i].tag, xx + 2, e.y, colors.text, 0.85);
    });
  }

  // ---------- 文字數值 ----------
  function updateReadout(st) {
    $('rt').textContent = num(state.t, 2) + ' s';
    $('rv1').textContent = num(st.v1, 2, true) + ' m/s';
    $('rv2').textContent = num(st.v2, 2, true) + ' m/s';
    $('rvcm').textContent = num(st.vcm, 2, true) + ' m/s';
    $('rp').textContent = num(st.p, 2, true) + ' kg·m/s';
    $('rK').textContent = num(st.K, 2) + ' J';
    if (state.sim.spring) {
      $('rx').textContent = num(st.x * 100, 1) + ' cm';
      $('rF').textContent = num(st.F, 1) + ' N';
      $('rU').textContent = num(st.U, 2) + ' J';
      $('rE').textContent = num(st.E, 2) + ' J';
      // 彈簧到目前為止給車 2 的衝量 = Δp2 = −Δp1
      $('rJ').textContent = num(st.p2 - state.sum.before.p2, 2, true) + ' N·s';
    }

    const sim = state.sim, s = state.sum;
    let msg;
    if (!s.collides) {
      msg = T('兩車沒有互相接近（v1 ≤ v2），不會碰撞。', 'The carts are not approaching each other (v1 ≤ v2), so they will not collide.');
    } else if (sim.spring && state.t < sim.tc) {
      msg = T('彈簧將在 t = ' + num(sim.tc, 2) + ' s 碰到車 2。', 'The spring will touch cart 2 at t = ' + num(sim.tc, 2) + ' s.');
    } else if (sim.spring && state.t < sim.tr) {
      msg = T('彈簧接觸中：壓縮量 x = ' + num(st.x * 100, 1) + ' cm，彈力 F = ' + num(st.F, 1) + ' N。',
        'Spring in contact: compression x = ' + num(st.x * 100, 1) + ' cm, force F = ' + num(st.F, 1) + ' N.');
    } else if (sim.spring) {
      msg = T('t = ' + num(sim.tc, 2) + '–' + num(sim.tr, 2) + ' s 彈簧接觸（Δt = ' + num(sim.tr - sim.tc, 3) + ' s）：總動量不變，彈簧放開後總動能恢復原值（彈性碰撞）。',
        'Spring contact from t = ' + num(sim.tc, 2) + ' to ' + num(sim.tr, 2) + ' s (Δt = ' + num(sim.tr - sim.tc, 3) + ' s): total momentum is unchanged, and once the spring lets go the total kinetic energy is back to its starting value (elastic collision).');
    } else if (state.t < sim.tc) {
      msg = T('兩車互相接近，將在 t = ' + num(sim.tc, 2) + ' s 相撞。',
        'The carts are approaching each other and will collide at t = ' + num(sim.tc, 2) + ' s.');
    } else {
      const pct = num(100 * s.lost / s.before.K, 1);
      msg = T('t = ' + num(sim.tc, 2) + ' s 碰撞：總動量不變，' +
        (s.lost > 1e-9 ? '動能減少 ' + num(s.lost, 2) + ' J（' + pct + '%）。' : '總動能也不變（彈性碰撞）。'),
        'Collision at t = ' + num(sim.tc, 2) + ' s: total momentum is unchanged; ' +
        (s.lost > 1e-9 ? 'kinetic energy falls by ' + num(s.lost, 2) + ' J (' + pct + '%).' : 'total kinetic energy is unchanged too (elastic collision).'));
    }
    if (state.running && !state.ended && state.slow) msg += T('（慢動作）', ' (slow motion)');
    $('status').textContent = msg;
  }

  function updateTable() {
    const s = state.sum, b = s.before, a = s.after;
    const rows = [['v1', 2, true], ['v2', 2, true], ['p1', 2, true], ['p2', 2, true], ['p', 2, true], ['K1', 2, false], ['K2', 2, false], ['K', 2, false]];
    rows.forEach(function (r) {
      const k = r[0];
      $('t' + k + 'b').textContent = num(b[k], r[1], r[2]);
      $('t' + k + 'a').textContent = num(a[k], r[1], r[2]);
      $('t' + k + 'd').textContent = num(a[k] - b[k], r[1], true);
    });
    $('lost').innerHTML = s.collides
      ? '<strong>' + num(s.lost, 3) + ' J</strong>' + T('（', ' (') + (b.K > 0 ? num(100 * s.lost / b.K, 1) : '0.0') + T('%）', '%)')
      : '0 J';
    $('lostF').textContent = s.collides ? num(s.lostFormula, 3) + ' J' : '—';
    $('eBack').textContent = s.collides ? num(s.eMeasured, 2) : '—';
    const c = state.sim.contact;
    $('sDt').textContent = c ? num(c.dt, 3) + ' s' : '—';
    $('sX').textContent = c ? num(c.xmax * 100, 1) + ' cm' : '—';
    $('sF').textContent = c ? num(c.Fmax, 1) + ' N' : '—';
    $('sJ').textContent = c ? num(c.J, 3) + ' N·s' : '—';
    $('tableNote').textContent = s.collides && state.sim.spring
      ? T('接觸期間彈簧把動能暫存為彈性位能，放開後全部還給兩車，所以碰撞後的數值與彈性碰撞（e = 1）相同，損失的動能為 0。',
        'During contact the spring stores kinetic energy as elastic potential energy and gives it all back when it lets go, so the “After” values are those of an elastic collision (e = 1) and no kinetic energy is lost.')
      : s.collides
      ? T('碰撞後的數值由公式直接算出；播放動畫後，「即時數值」會與此表的碰撞後數值相同。',
        'The “After” values come straight from the formulas; once the animation has played, the live readings match the “After” column of this table.')
      : T('兩車不會碰撞，所以「碰撞後」與「碰撞前」相同。', 'The carts do not collide, so “After” is the same as “Before”.');
  }

  // ---------- 音效（sound.js；音效關閉時 LabSound 什麼都不做） ----------
  /**
   * 碰撞聲：音量隨碰撞的「激烈程度」增加，音色隨 e 改變。
   * 激烈程度用質心系中的動能 ½μ(v1 − v2)²（可用來碰撞的能量），取對數壓縮並設上限，避免刺耳。
   * e 接近 1 → 短而清脆（濾波頻率高）；e 接近 0 → 低沉而較長的悶響（濾波頻率低）。
   */
  function impactSound() {
    const S = window.LabSound;
    if (!S || !S.enabled()) return;
    const sim = state.sim, u = sim.v1 - sim.v2;
    const eCm = 0.5 * CC.reducedMass(sim.m1, sim.m2) * u * u;
    const hard = Math.max(0, Math.min(1, Math.log10(1 + eCm) / Math.log10(1 + 150)));
    const gain = 0.5 + 0.5 * hard; // 輕碰也聽得到，重撞最大聲
    const e = sim.e;
    // 撞擊的「噪音」成分：彈性 → 高頻清脆；非彈性 → 較低沉、較長（仍在小喇叭聽得到的範圍）
    S.noise({ dur: 0.07 + 0.16 * (1 - e), gain: gain, filter: 900 + 3100 * e, q: 0.6 + 0.6 * e,
      filterType: e < 0.4 ? 'lowpass' : 'bandpass' });
    // 物體本身的「音高」成分：基音加一個泛音，讓小喇叭也能表現出低沉感
    const f0 = 230 + 650 * e;
    S.tone({ freq: f0, dur: 0.08 + 0.14 * (1 - e), type: 'triangle', gain: gain * 0.7 });
    S.tone({ freq: f0 * 2.01, dur: 0.05 + 0.08 * (1 - e), type: 'sine', gain: gain * 0.35 });
  }
  /** 彈簧「啵嗡」聲：柔和的上滑音（≥ 250 Hz），越硬的彈簧音越高、越短 */
  function springSound() {
    const S = window.LabSound;
    if (!S || !S.enabled()) return;
    const sim = state.sim, c = sim.contact;
    const kn = Math.max(0, Math.min(1, Math.log(sim.k / 20) / Math.log(100)));
    const hard = Math.max(0, Math.min(1, Math.log10(1 + 0.5 * c.mu * c.u * c.u) / Math.log10(1 + 150)));
    const f0 = 260 + 200 * kn;
    S.sweep({ from: f0, to: f0 * 1.5, dur: 0.12 + 0.16 * (1 - kn), type: 'triangle', gain: 0.4 + 0.15 * hard });
  }
  function playSound() {
    const S = window.LabSound;
    if (S && S.enabled()) S.tone({ freq: 880, dur: 0.08, gain: 0.25 });
  }

  // ---------- 動畫 ----------
  let lastT = 0;
  function offscreen(st) {
    const off = state.cmFrame ? st.xcm - XC : 0;
    const out = function (x, w) { return x - w / 2 - off > L + 0.2 || x + w / 2 - off < -0.2; };
    return out(st.x1, state.sim.w1) && out(st.x2, state.sim.w2);
  }
  function tick(now) {
    if (!state.running) return;
    const dt = Math.min((now - lastT) / 1000, 1 / 30) * (state.slow ? 0.25 : 1);
    lastT = now;
    const prevT = state.t;
    state.t = Math.min(state.tEnd, state.t + dt);
    // 碰撞聲：動畫時間跨過碰撞時刻的那一格發出一次（慢動作、重播也一樣）
    if (prevT < state.sim.tc && state.t >= state.sim.tc) {
      if (state.sim.spring) springSound(); else impactSound();
    }
    // 任務模式：動畫時間跨過「碰撞結束」（沒有彈簧時即碰撞瞬間；有彈簧時為分開瞬間）時回報一次
    if (prevT < state.sim.tr && state.t >= state.sim.tr) emitCollision();
    const st = CC.stateAt(state.sim, state.t);
    if (state.t >= state.tEnd || (state.t > state.sim.tr && offscreen(st)) || (!isFinite(state.sim.tc) && offscreen(st))) {
      state.running = false;
      state.ended = true;
    }
    updatePlayButton();
    draw();
    if (state.running) requestAnimationFrame(tick);
  }
  /** 任務模式（missions.js）：回報這次碰撞的完整結果（全部取自物理核心的解析解） */
  function emitCollision() {
    if (!window.LabMission) return;
    const sim = state.sim, s = state.sum, c = sim.contact, p = state.p;
    window.LabMission.emit('collision', {
      m1: sim.m1, m2: sim.m2, v1: sim.v1, v2: sim.v2, e: sim.e, eSet: p.e,
      spring: sim.spring, k: sim.k,
      v1f: sim.after.v1, v2f: sim.after.v2, vcm: s.vcm,
      p: s.before.p, pAfter: s.after.p, K: s.before.K, KAfter: s.after.K,
      lost: s.lost, lostFrac: s.before.K > 0 ? s.lost / s.before.K : 0, eMeasured: s.eMeasured,
      cmFrame: state.cmFrame, slow: state.slow,
      dt: c ? c.dt : null, xmax: c ? c.xmax : null, Fmax: c ? c.Fmax : null, J: c ? c.J : null, Umax: c ? c.Umax : null
    });
  }
  function updatePlayButton() {
    $('play').textContent = state.running ? T('暫停', 'Pause') : state.ended ? T('重新播放', 'Replay') : state.t > 0 ? T('繼續', 'Resume') : T('播放', 'Play');
  }
  $('play').addEventListener('click', function () {
    if (state.running) {
      state.running = false;
      updatePlayButton();
      requestDraw();
      return;
    }
    if (state.ended) { state.t = 0; state.ended = false; }
    state.running = true;
    playSound();
    updatePlayButton();
    lastT = performance.now();
    requestAnimationFrame(tick);
  });
  $('reset').addEventListener('click', function () {
    state.running = false;
    state.ended = false;
    state.t = 0;
    updatePlayButton();
    requestDraw();
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
  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; requestDraw(); });
  $('cmFrame').addEventListener('change', function (ev) { state.cmFrame = ev.target.checked; requestDraw(); });

  function setMode(m) {
    state.mode = m;
    $('modeBars').setAttribute('aria-pressed', String(m === 'bars'));
    $('modeTime').setAttribute('aria-pressed', String(m === 'time'));
    $('ghostLegend').hidden = m !== 'bars';
    requestDraw();
  }
  $('modeBars').addEventListener('click', function () { setMode('bars'); });
  $('modeTime').addEventListener('click', function () { setMode('time'); });

  // ---------- 控制項 ----------
  // 滑桿讀值：點數字打字輸入的精確值由 numinput.js 保留（LabNum），拖曳後回到滑桿值
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  function bindSlider(id, fmt) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.textContent = fmt(val(el)); };
    el.addEventListener('input', function () { update(); state.p[id] = val(el); setup(); });
    update();
    state.p[id] = val(el);
    return { set: function (v) { if (window.LabNum) window.LabNum.clear(el); el.value = v; update(); state.p[id] = val(el); } };
  }
  /** 顯示到打字可輸入的精度（最多 dmax 位、去掉尾端的 0），但不少於滑桿間隔的 dmin 位 */
  function numFlex(v, dmin, dmax, signed) {
    let d = dmax;
    while (d > dmin && Math.abs(v * Math.pow(10, d - 1) - Math.round(v * Math.pow(10, d - 1))) < 1e-6) d--;
    return num(v, d, signed);
  }
  const fmtM = function (v) { return numFlex(v, 1, 2) + ' kg'; };
  const fmtV = function (v) { return numFlex(v, 1, 2, true) + ' m/s'; };
  const sliders = {
    m1: bindSlider('m1', fmtM),
    m2: bindSlider('m2', fmtM),
    v1: bindSlider('v1', fmtV),
    v2: bindSlider('v2', fmtV),
    e: bindSlider('e', function (v) { return num(v, 2); })
  };

  const PRESETS = {
    elastic: { m1: 2, m2: 3, v1: 3, v2: -1, e: 1 },
    inelastic: { m1: 2, m2: 3, v1: 3, v2: -1, e: 0 },
    swap: { m1: 2, m2: 2, v1: 3, v2: 0, e: 1 },
    heavy: { m1: 6, m2: 1, v1: 3, v2: 0, e: 1 },
    light: { m1: 1, m2: 6, v1: 3, v2: 0, e: 1 }
  };
  document.querySelectorAll('[data-preset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const p = PRESETS[btn.dataset.preset];
      Object.keys(p).forEach(function (k) { sliders[k].set(p[k]); });
      // 非彈性的範例用不到彈簧（理想彈簧一定是彈性碰撞）
      if (p.e < 1 && state.spring) { state.spring = false; $('spring').checked = false; }
      setup();
    });
  });

  // 彈簧：勾選框與彈力常數（對數刻度 20–2000 N/m，取兩位有效數字）
  function kFromSlider(v) {
    const k = 20 * Math.pow(100, v / 100);
    const p = Math.pow(10, Math.floor(Math.log10(k)) - 1);
    return Math.round(k / p) * p;
  }
  // 對數刻度：告訴 numinput.js 滑桿位置與 k 的換算，打字可輸入 20–2000 N/m 的任意整數
  if (window.LabNum) {
    window.LabNum.register($('k'), {
      toValue: kFromSlider,
      toPos: function (k) { return 100 * Math.log(k / 20) / Math.log(100); },
      min: 20, max: 2000, decimals: 0
    });
  }
  // 停用中的滑桿（加彈簧時的 e、未加彈簧時的 k）不開啟數字輸入
  ['e', 'k'].forEach(function (id) {
    const box = $(id).closest('.slider');
    const block = function (ev) {
      if ($(id).disabled && ev.target === $(id + 'o') && (ev.type === 'click' || ev.key === 'Enter' || ev.key === ' ')) ev.stopPropagation();
    };
    box.addEventListener('click', block, true);
    box.addEventListener('keydown', block, true);
  });
  function updateK() {
    state.k = val($('k'));
    $('ko').textContent = Math.round(state.k) + ' N/m';
  }
  $('k').addEventListener('input', function () { updateK(); setup(); });
  $('spring').addEventListener('change', function (ev) { state.spring = ev.target.checked; setup(); });
  state.spring = $('spring').checked;
  updateK();

  // ---------- 啟動 ----------
  readColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); requestDraw(); });
  // 齒輪設定切換深淺色時也重畫（settings.js）
  window.addEventListener('lab:themechange', function () { readColors(); requestDraw(); });
  setup();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(resize);
    ro.observe(track);
    ro.observe(chart);
    ro.observe(force);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();
})();
