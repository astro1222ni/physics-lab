/* hubble-expansion.js — 「哈伯定律與宇宙年齡」的畫面與互動
 * 物理計算全部在 hubble-expansion-core.js。 */
(function () {
  'use strict';
  const HC = window.HubCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const EN = !!(window.LabSettings && window.LabSettings.lang === 'en');
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;

  // ───── 膨脹的盒子 ─────
  const L_BOX = 6000;                        // 盒子的共動寬度（Mpc，a = 1 時）
  const H_SIM = 70;                          // 等速膨脹：ȧ 固定，H = 70/a
  const R_HUB = HC.C_KMS / H_SIM;            // c/H0 = 4283 Mpc（共動）
  const VIEW = 4500;                         // 畫面半寬（真正的距離，Mpc）
  const A_MIN = 0.4, A_MAX = 3;
  const A_RATE = 1 / 6;                      // 播放時 a 每秒增加多少
  const GAL = HC.boxGalaxies(7);
  const MW = 24;                             // 銀河系：格子正中央
  const CAT = HC.CATALOG;
  const CAT_I = {}; CAT.forEach(function (g, i) { CAT_I[g.id] = i; });
  const LINES = [
    { n: 'K', l: 393.37 }, { n: 'H', l: 396.85 }, { n: 'Hβ', l: 486.13 }, { n: 'Mg', l: 517.27 }, { n: 'Na', l: 589.3 }, { n: 'Hα', l: 656.28 }
  ];
  const MODELS = [
    { id: 'planck', zh: 'Planck 2018', en: 'Planck 2018', H0: 67.4, Om: 0.315, OL: 0.685 },
    { id: 'eds', zh: '只有物質（Ωm = 1）', en: 'Matter only (Ωm = 1)', Om: 1, OL: 0 },
    { id: 'empty', zh: '空的宇宙', en: 'Empty universe', Om: 0, OL: 0 },
    { id: 'closed', zh: '封閉（Ωm = 3）', en: 'Closed (Ωm = 3)', Om: 3, OL: 0 },
    { id: 'hubble', zh: '哈伯 1929', en: 'Hubble 1929', H0: 500, Om: 1, OL: 0 }
  ];

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { scale: $('scale'), h0: $('h0'), om: $('om'), ol: $('ol') };
  const state = {
    mode: 'expand', a: 1,
    home: { i: MW, ox: 0, oy: 0 }, target: null,
    method: 'cepheid', sel: CAT_I.m31, pts: { hubble: {}, cepheid: {}, sn: {} }, last: '',
    H0: 67.4, Om: 0.315, OL: 0.685, model: 'planck',
    chart: { expand: 'a', measure: 'a', age: 'a' },
    run: { expand: null, measure: null, age: null },
    lastLight: null, acted: false
  };
  if (window.LabNum) window.LabNum.register(el.h0, { toValue: function (p) { return Math.pow(10, p); }, toPos: Math.log10, min: 40, max: 600, decimals: 1 });
  let quiet = 0;
  function setSlider(inp, v) { quiet++; try { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; } finally { quiet--; } }

  // ---------- 文字 ----------
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function sig(v, n) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0';
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(v))));
    return num(v, Math.min(8, d));
  }
  function grp(v) { const s = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (v < 0 ? '−' : '') + s; }
  function mpc(d) { return (d < 10 ? sig(d, 3) : grp(d)) + ' Mpc'; }
  function kms(v) { return grp(v) + ' km/s'; }
  /** 時間：中文用億年，英文用 billion years */
  function gyr(t, dg) { if (t == null || !isFinite(t)) return '—'; return EN ? num(t, dg == null ? 2 : dg) + ' billion years' : num(t * 10, dg == null ? 1 : Math.max(0, dg - 1)) + ' 億年'; }
  function gyrS(t) { return EN ? num(t, 1) + ' Gyr' : num(t * 10, 0) + ' 億年'; }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(msg) { setHTML('status', msg); }
  function nice(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e; }
  function gName(i) { return T(CAT[i].zh, CAT[i].en); }
  function methodName(id) { const m = HC.METHOD[id]; return T(m.zh, m.en); }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface',
      '--hb-space0', '--hb-space1', '--hb-home', '--hb-target', '--hb-light', '--hb-lightc', '--hb-arrow', '--hb-sphere', '--hb-fit', '--hb-true',
      '--hb-hub', '--hb-cep', '--hb-sn', '--hb-curve', '--hb-ref', '--hb-warn']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    D.refresh();
  }
  function mCol(id) { return id === 'hubble' ? C['hb-hub'] : id === 'cepheid' ? C['hb-cep'] : C['hb-sn']; }
  /** 波長（nm）→ 顏色 */
  function wlRGB(l, alpha) {
    let r = 0, g = 0, b = 0;
    if (l < 380) { r = 0.5; b = 1; }
    else if (l < 440) { r = (440 - l) / 60; b = 1; }
    else if (l < 490) { g = (l - 440) / 50; b = 1; }
    else if (l < 510) { g = 1; b = (510 - l) / 20; }
    else if (l < 580) { r = (l - 510) / 70; g = 1; }
    else if (l < 645) { r = 1; g = (645 - l) / 65; }
    else r = 1;
    let f = 1; if (l > 700) f = Math.max(0.25, 1 - (l - 700) / 250); else if (l < 400) f = 0.5 + 0.5 * (l - 380) / 20;
    const c = function (x) { return Math.round(255 * Math.pow(Math.max(0, x * f), 0.8)); };
    return 'rgba(' + c(r) + ',' + c(g) + ',' + c(b) + ',' + (alpha == null ? 1 : alpha) + ')';
  }

  // =====================================================================
  // 畫布
  // =====================================================================
  const stage = $('stage');
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gr = $('gr'), gtx = gr.getContext('2d');
  let cvSize = null, grSize = null;
  function fit(c, g) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); requestDraw(); }
  function sText(g, text, x, y, color, align, base, font) {
    g.font = font || '600 12px ' + FONT; g.textAlign = align || 'left'; g.textBaseline = base || 'middle';
    g.lineWidth = 3; g.strokeStyle = 'rgba(5,10,25,0.85)'; g.lineJoin = 'round'; g.strokeText(text, x, y);
    g.fillStyle = color || '#e2e8f0'; g.fillText(text, x, y);
  }
  function sTag(g, text, x, y, color, align, font) {
    g.font = font || '700 11.5px ' + FONT;
    const w = g.measureText(text).width + 12, h = 20;
    let bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const cw = g.canvas.clientWidth || 1e4; bx = Math.max(4, Math.min(cw - 4 - w, bx));
    D.roundRect(g, bx, y - h / 2, w, h, 10);
    g.fillStyle = 'rgba(8,15,35,0.82)'; g.fill();
    g.strokeStyle = D.alpha(color, 0.75); g.lineWidth = 1; g.stroke();
    g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, bx + 6, y + 0.5);
    return { x: bx, w: w };
  }
  function spaceBox(g, b, r) {
    D.roundRect(g, b.x, b.y, b.w, b.h, r == null ? 10 : r);
    const sg = g.createLinearGradient(0, b.y, 0, b.y + b.h);
    sg.addColorStop(0, C['hb-space1']); sg.addColorStop(1, C['hb-space0']);
    g.fillStyle = sg; g.fill();
  }
  function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function bgStars(g, b, n) {
    g.save(); D.roundRect(g, b.x, b.y, b.w, b.h, 10); g.clip();
    for (let i = 0; i < n; i++) {
      const x = b.x + hash(i) * b.w, y = b.y + hash(i + 500) * b.h, m = hash(i + 900), r = 0.4 + 0.9 * m * m;
      g.fillStyle = 'rgba(226,232,240,' + (0.15 + 0.4 * m) + ')'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  /** 一個星系的小圖：螺旋（偏藍白、有旋臂）或橢圓（偏黃） */
  function galaxy(g, x, y, r, type, seed, alpha) {
    if (r < 1) r = 1;
    g.save(); g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x, y); g.rotate(hash(seed) * Math.PI);
    const tilt = 0.45 + 0.5 * hash(seed + 3);
    if (type === 'E') {
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, 'rgba(255,244,214,0.98)'); rg.addColorStop(0.35, 'rgba(250,214,150,0.65)'); rg.addColorStop(1, 'rgba(240,180,110,0)');
      g.scale(1, 0.75 + 0.2 * tilt); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    } else {
      g.scale(1, tilt);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, 'rgba(255,248,230,1)'); rg.addColorStop(0.18, 'rgba(255,236,200,0.9)'); rg.addColorStop(0.5, 'rgba(160,190,255,0.38)'); rg.addColorStop(1, 'rgba(120,150,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      if (r > 6) {
        g.strokeStyle = 'rgba(190,210,255,0.55)'; g.lineWidth = Math.max(1, r * 0.12); g.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          g.beginPath();
          for (let s = 0; s <= 24; s++) { const th = s / 24 * 3.6 + k * Math.PI, rr = r * (0.15 + 0.8 * s / 24); const px = rr * Math.cos(th), py = rr * Math.sin(th); if (s) g.lineTo(px, py); else g.moveTo(px, py); }
          g.stroke();
        }
      }
    }
    g.restore();
  }

  // =====================================================================
  // 一、膨脹的宇宙
  // =====================================================================
  function cpos(p) { return { x: GAL[p.i].x + p.ox, y: GAL[p.i].y + p.oy }; }
  /** 共動的相對位置（盒子單位） */
  function rel(p) { const a = cpos(p), h = cpos(state.home); return { x: a.x - h.x, y: a.y - h.y }; }
  function chiOf(p) { if (!p) return 0; const r = rel(p); return L_BOX * Math.hypot(r.x, r.y); }
  function same(p, q) { return !!p && !!q && p.i === q.i && p.ox === q.ox && p.oy === q.oy; }
  const MW_POS = { i: MW, ox: 0, oy: 0 };
  /** 畫面上看得到的星系（含重複的格子），真正的距離 r（Mpc） */
  function visible(a) {
    const out = [], h = cpos(state.home), lim = VIEW * 1.25 / (a * L_BOX), n = Math.ceil(lim) + 1;
    for (let ox = -n; ox <= n; ox++) for (let oy = -n; oy <= n; oy++) GAL.forEach(function (gal, i) {
      const dx = gal.x + ox - h.x, dy = gal.y + oy - h.y;
      if (Math.abs(dx) <= lim && Math.abs(dy) <= lim) out.push({ i: i, ox: ox, oy: oy, dx: dx, dy: dy, r: a * L_BOX * Math.hypot(dx, dy) });
    });
    return out;
  }
  function pickDefaultTarget() {
    // 在銀河系右上方、約 2400 Mpc 的星系
    let best = null, bs = 1e9;
    visible(1).forEach(function (q) { if (q.r < 1) return; const ang = Math.atan2(q.dy, q.dx), s = Math.abs(q.r - 2400) / 400 + Math.abs(ang - 0.6); if (s < bs) { bs = s; best = q; } });
    return { i: best.i, ox: best.ox, oy: best.oy };
  }
  function lightNow() {
    const run = state.run.expand;
    if (!run) return null;
    const chi = run.chi0 - R_HUB * Math.log(state.a / run.a0);
    return Math.max(0, chi);
  }
  function drawExpand(g, W, H) {
    const b = { x: 6, y: 6, w: W - 12, h: H - 12 };
    spaceBox(g, b); bgStars(g, b, 90);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, s = Math.min(b.w, b.h) / 2 / VIEW, a = state.a;
    g.save(); D.roundRect(g, b.x, b.y, b.w, b.h, 10); g.clip();
    // 哈伯半徑
    const rh = R_HUB * a * s;
    g.strokeStyle = D.alpha(C['hb-sphere'], 0.75); g.lineWidth = 1.4; g.setLineDash([6, 5]);
    g.beginPath(); g.arc(cx, cy, rh, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    const rg = g.createRadialGradient(cx, cy, rh * 0.96, cx, cy, rh * 1.25);
    rg.addColorStop(0, D.alpha(C['hb-sphere'], 0.0)); rg.addColorStop(0.1, D.alpha(C['hb-sphere'], 0.07)); rg.addColorStop(1, D.alpha(C['hb-sphere'], 0));
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, rh * 1.25, 0, Math.PI * 2); g.fill();
    // 星系與速度箭頭
    const vis = visible(a), maxR = Math.min(b.w, b.h) / 2;
    vis.forEach(function (q) {
      const x = cx + q.dx * a * L_BOX * s, y = cy - q.dy * a * L_BOX * s;
      if (x < b.x - 20 || x > b.x + b.w + 20 || y < b.y - 20 || y > b.y + b.h + 20) return;
      const rp = Math.hypot(x - cx, y - cy);
      if (rp > 4) {
        const k = 0.18, ex = x + (x - cx) * k, ey = y + (y - cy) * k, al = Math.max(0.15, 0.75 - 0.5 * rp / maxR);
        D.arrow(g, x, y, ex, ey, D.alpha(C['hb-arrow'], al), 1.4);
      }
    });
    vis.forEach(function (q) {
      const x = cx + q.dx * a * L_BOX * s, y = cy - q.dy * a * L_BOX * s;
      if (x < b.x - 20 || x > b.x + b.w + 20 || y < b.y - 20 || y > b.y + b.h + 20) return;
      const gal = GAL[q.i];
      galaxy(g, x, y, 5 + 5 * gal.s, gal.type, q.i * 7 + 1, 0.95);
    });
    // 光
    const run = state.run.expand, tg = state.target;
    if (tg) {
      const r = rel(tg), tx = cx + r.x * a * L_BOX * s, ty = cy - r.y * a * L_BOX * s;
      if (run) {
        const chi = lightNow(), u = { x: (tx - cx), y: (ty - cy) }, len = Math.hypot(u.x, u.y) || 1;
        const px = cx + u.x / len * a * chi * s, py = cy + u.y / len * a * chi * s;
        // 光走過的路（淡）
        g.strokeStyle = D.alpha(C['hb-light'], 0.25); g.lineWidth = 1; g.setLineDash([2, 4]);
        g.beginPath(); g.moveTo(px, py); g.lineTo(tx, ty); g.stroke(); g.setLineDash([]);
        if (!run.arrived) wavePacket(g, px, py, -u.x / len, -u.y / len, state.a / run.a0);
      }
      g.strokeStyle = C['hb-target']; g.lineWidth = 2; g.beginPath(); g.arc(tx, ty, 13, 0, Math.PI * 2); g.stroke();
      const d = a * chiOf(tg), lab = mpc(d) + '｜' + sig(H_SIM * chiOf(tg) / HC.C_KMS, 2) + ' c';
      g.font = '700 11px ' + FONT; const lw = g.measureText(lab).width / 2 + 6;
      const lxx = Math.min(b.x + b.w - lw, Math.max(b.x + lw, tx)), lyy = ty + 23 > b.y + b.h - 10 ? ty - 23 : ty + 23;
      sText(g, lab, lxx, lyy, C['hb-target'], 'center', 'middle', '700 11px ' + FONT);
    }
    // 家
    g.strokeStyle = C['hb-home']; g.lineWidth = 2.4; g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.stroke();
    const homeTxt = same(state.home, MW_POS) ? T('家：銀河系', 'Home: the Milky Way') : T('新家', 'New home');
    sText(g, homeTxt, cx, cy - 23, C['hb-home'], 'center', 'middle', '700 11.5px ' + FONT);
    if (run && run.arrived && run.flash > 0) { g.fillStyle = D.alpha(C['hb-light'], 0.5 * run.flash); g.beginPath(); g.arc(cx, cy, 30 * (1.2 - run.flash * 0.2), 0, Math.PI * 2); g.fill(); }
    // 哈伯半徑的字
    const lx = cx + rh * Math.cos(-2.4), ly = cy - rh * Math.sin(-2.4);
    if (lx > b.x + 60 && ly < b.y + b.h - 16) sText(g, T('哈伯半徑：退行速度 = 光速', 'Hubble radius: recession = light speed'), lx, ly + 12, C['hb-sphere'], 'center', 'middle', '600 10.5px ' + FONT);
    g.restore();
    // 比例尺與標籤
    const bar = 1000 * s;
    g.strokeStyle = '#e2e8f0'; g.lineWidth = 2; g.beginPath(); g.moveTo(b.x + 14, b.y + b.h - 14); g.lineTo(b.x + 14 + bar, b.y + b.h - 14); g.stroke();
    sText(g, '1000 Mpc', b.x + 14 + bar / 2, b.y + b.h - 26, '#e2e8f0', 'center', 'middle', '600 10.5px ' + FONT);
    sTag(g, 'a = ' + num(a, 2) + T('｜H = ', '｜H = ') + sig(H_SIM / a, 3) + ' km/s/Mpc', b.x + b.w - 8, b.y + 18, '#e2e8f0', 'right');
    if (run) {
      const msg = run.arrived ? T('收到了：z = ', 'Arrived: z = ') + num(run.z, 3) : T('光在路上：波長 × ', 'Light on its way: wavelength × ') + num(state.a / run.a0, 2);
      sTag(g, msg, b.x + b.w - 8, b.y + 42, C['hb-light'], 'right');
    }
    sText(g, T('綠色箭頭：從家裡看的退行速度', 'Green arrows: recession seen from home'), b.x + b.w - 10, b.y + b.h - 14, C['hb-arrow'], 'right', 'middle', '600 10.5px ' + FONT);
  }
  /** 一小段光波：stretch 是波長拉長的倍數 */
  function wavePacket(g, x, y, ux, uy, stretch) {
    const lam0 = 500, lam = lam0 * stretch, col = wlRGB(lam), wl = 7 * stretch, n = 3;
    const len = wl * n, nx = -uy, ny = ux;
    g.save();
    g.shadowColor = col; g.shadowBlur = 10; g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath();
    for (let k = 0; k <= 60; k++) {
      const t = k / 60 * len, amp = 5 * Math.sin(Math.PI * k / 60), w = Math.sin(2 * Math.PI * t / wl);
      const px = x - ux * t + nx * amp * w, py = y - uy * t + ny * amp * w;
      if (k) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke(); g.restore();
    D.ball(g, x, y, 3, col, { shadow: false, glow: 0.8 });
  }

  // ───── 下方的圖（膨脹） ─────
  function frame0(W, H) { return { x0: 64, x1: W - 16, y0: 20, y1: H - 36 }; }
  function axisBox(g, Fm) { g.strokeStyle = D.alpha(C.text, 0.45); g.lineWidth = 1; g.strokeRect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); }
  /** 線性座標軸 */
  function axes(g, Fm, x0, x1, y0, y1, xlab, ylab, fx, fy) {
    const xx = function (v) { return Fm.x0 + (v - x0) / (x1 - x0) * (Fm.x1 - Fm.x0); };
    const yy = function (v) { return Fm.y1 - (v - y0) / (y1 - y0) * (Fm.y1 - Fm.y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    const W = Fm.x1 - Fm.x0, sx = nice((x1 - x0) / (W > 420 ? 6 : 4)), sy = nice((y1 - y0) / 5);
    const tick = function (st) { const dg = Math.max(0, -Math.floor(Math.log10(st) + 1e-9)); return function (v) { return Math.abs(v) >= 1000 ? grp(v) : num(v, dg); }; };
    const tx = fx || tick(sx), ty = fy || tick(sy);
    for (let i = Math.ceil(x0 / sx); i * sx <= x1 + 1e-9 * sx; i++) { const v = i * sx, x = xx(v); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); D.haloText(g, tx(v), x, Fm.y1 + 12, C.muted, 'center', 'middle', '10px ' + FONT); }
    for (let i = Math.ceil(y0 / sy); i * sy <= y1 + 1e-9 * sy; i++) { const v = i * sy, y = yy(v); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); D.haloText(g, ty(v), Fm.x0 - 6, y, C.muted, 'right', 'middle', '10px ' + FONT); }
    D.haloText(g, xlab, (Fm.x0 + Fm.x1) / 2, Fm.y1 + 28, C.muted, 'center', 'middle', '600 10.5px ' + FONT);
    D.haloText(g, ylab, 6, 10, C.muted, 'left', 'middle', '600 10.5px ' + FONT);
    return { xx: xx, yy: yy };
  }
  function chartVR(g, W, H) {
    const Fm = frame0(W, H), a = state.a, Hn = H_SIM / a, rmax = VIEW * 1.45, vmax = Hn * rmax;
    const ax = axes(g, Fm, 0, rmax, 0, Math.max(vmax, HC.C_KMS * 1.1), T('真正的距離 r（Mpc）', 'Proper distance r (Mpc)'), T('退行速度 v（km/s）', 'Recession speed v (km/s)'));
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    // v = c 與哈伯半徑
    const yc = ax.yy(HC.C_KMS), xh = ax.xx(R_HUB * a);
    g.strokeStyle = D.alpha(C['hb-sphere'], 0.9); g.setLineDash([5, 4]); g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(Fm.x0, yc); g.lineTo(Fm.x1, yc); g.stroke();
    g.beginPath(); g.moveTo(xh, Fm.y0); g.lineTo(xh, Fm.y1); g.stroke(); g.setLineDash([]);
    g.strokeStyle = C['hb-true']; g.lineWidth = 2.2; g.beginPath(); g.moveTo(ax.xx(0), ax.yy(0)); g.lineTo(ax.xx(rmax), ax.yy(Hn * rmax)); g.stroke();
    visible(a).forEach(function (q) { if (q.r > 1 && q.r <= rmax) D.ball(g, ax.xx(q.r), ax.yy(Hn * q.r), 3, D.alpha(C['hb-true'], 0.8), { shadow: false }); });
    g.restore();
    D.haloText(g, T('光速 c', 'Light speed c'), Fm.x0 + 6, yc - 8, C['hb-sphere'], 'left', 'middle', '700 10.5px ' + FONT);
    D.haloText(g, 'v = H r', ax.xx(rmax * 0.3) + 6, ax.yy(Hn * rmax * 0.3) - 10, C['hb-true'], 'right', 'middle', '700 11px ' + FONT);
    if (state.target) {
      const r = a * chiOf(state.target);
      if (r <= rmax) { D.ball(g, ax.xx(r), ax.yy(Hn * r), 6, C['hb-target'], { shadow: false, ring: '#ffffff' }); }
    }
    axisBox(g, Fm);
  }
  /** 光的旅程：橫軸是離家的真正距離，縱軸是光出發後的時間 */
  function chartTrip(g, W, H) {
    const Fm = frame0(W, H), tg = state.target;
    const run = state.run.expand, a0 = run ? run.a0 : state.a, chi0 = run ? run.chi0 : chiOf(tg);
    if (!tg || chi0 <= 0) { D.haloText(g, T('先點一個星系當目標', 'Tap a galaxy to choose a target'), W / 2, H / 2, C.muted, 'center', 'middle', '600 12px ' + FONT); return; }
    const Hg = H_SIM / HC.GYR_INV_H;                 // ȧ（每十億年）
    const aEnd = Math.min(A_MAX, a0 * Math.exp(chi0 / R_HUB)), tEnd = (aEnd - a0) / Hg;
    const rmax = Math.max(aEnd * chi0, R_HUB * aEnd) * 1.05;
    const ax = axes(g, Fm, 0, rmax, 0, Math.max(0.5, tEnd * 1.05), T('離家的真正距離（Mpc）', 'Proper distance from home (Mpc)'), T('光出發後的時間（十億年）', 'Time since the light left (billion years)'));
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    const path = function (fr, col, w, dash) {
      g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath();
      for (let k = 0; k <= 200; k++) { const t = tEnd * k / 200, aa = a0 + Hg * t, r = fr(aa); if (k) g.lineTo(ax.xx(r), ax.yy(t)); else g.moveTo(ax.xx(r), ax.yy(t)); }
      g.stroke(); g.setLineDash([]);
    };
    path(function (aa) { return R_HUB * aa; }, D.alpha(C['hb-sphere'], 0.85), 1.4, [5, 4]);
    path(function (aa) { return aa * chi0; }, C['hb-target'], 2.2);
    path(function (aa) { return aa * Math.max(0, chi0 - R_HUB * Math.log(aa / a0)); }, C['hb-lightc'], 2.6);
    g.restore();
    D.haloText(g, T('粉紅：那個星系', 'Pink: the galaxy'), Fm.x1 - 6, Fm.y0 + 10, C['hb-target'], 'right', 'middle', '700 10.5px ' + FONT);
    D.haloText(g, T('黃：光', 'Yellow: the light'), Fm.x1 - 6, Fm.y0 + 25, C['hb-lightc'], 'right', 'middle', '700 10.5px ' + FONT);
    D.haloText(g, T('橘虛線：哈伯半徑', 'Orange dashed: Hubble radius'), Fm.x1 - 6, Fm.y0 + 40, C['hb-sphere'], 'right', 'middle', '700 10.5px ' + FONT);
    if (run) {
      const t = (state.a - a0) / Hg, chi = lightNow();
      D.ball(g, ax.xx(state.a * chi), ax.yy(t), 5, C['hb-lightc'], { shadow: false, ring: '#ffffff' });
    }
    if (aEnd >= A_MAX - 1e-9 && a0 * Math.exp(chi0 / R_HUB) > A_MAX) D.haloText(g, T('到 a = 3 時光還沒到', 'Not arrived by a = 3'), (Fm.x0 + Fm.x1) / 2, Fm.y0 + 12, C.muted, 'center', 'middle', '600 11px ' + FONT);
    axisBox(g, Fm);
  }

  // =====================================================================
  // 二、量哈伯常數
  // =====================================================================
  function skyBox(W, H) {
    const narrow = W < 560, sh = narrow ? 150 : 128;
    return { sky: { x: 6, y: 6, w: W - 12, h: H - sh - 18 }, spec: { x: 6, y: H - sh - 6, w: W - 12, h: sh } };
  }
  function galPos(i, b) { const g = CAT[i]; return { x: b.x + 24 + g.x * (b.w - 48), y: b.y + 26 + g.y * (b.h - 52) }; }
  function galR(i, b) { const g = CAT[i], k = Math.min(b.w, b.h) / 420; return k * (5 + 24 * g.size / Math.pow(Math.max(0.6, g.d), 0.3)); }
  function measured(i) { return ['hubble', 'cepheid', 'sn'].filter(function (m) { return state.pts[m][i]; }); }
  function drawMeasure(g, W, H) {
    const bx = skyBox(W, H), b = bx.sky, run = state.run.measure;
    spaceBox(g, b); bgStars(g, b, 120);
    g.save(); D.roundRect(g, b.x, b.y, b.w, b.h, 10); g.clip();
    // 遠的先畫
    const order = CAT.map(function (_, i) { return i; }).sort(function (p, q) { return CAT[q].d - CAT[p].d; });
    order.forEach(function (i) {
      const p = galPos(i, b), r = galR(i, b), can = HC.canMeasure(CAT[i], state.method);
      galaxy(g, p.x, p.y, r, CAT[i].type, i * 13 + 5, can ? 1 : 0.4);
      const ms = measured(i);
      ms.forEach(function (m, k) { D.ball(g, p.x - (ms.length - 1) * 4 + k * 8, p.y + r * 0.7 + 7, 3, mCol(m), { shadow: false, ring: '#0b1020' }); });
      if (CAT[i].real && r > 9) sText(g, gName(i).replace(/（.*$/, ''), p.x, p.y - r * 0.75 - 9, 'rgba(226,232,240,0.85)', 'center', 'middle', '600 10px ' + FONT);
    });
    const sp = galPos(state.sel, b), sr = galR(state.sel, b);
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.6; g.setLineDash([4, 3]); g.beginPath(); g.arc(sp.x, sp.y, sr + 7, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    if (run && run.cur != null) { const p = galPos(run.cur, b), r = galR(run.cur, b); g.strokeStyle = mCol(state.method); g.lineWidth = 2.5; g.beginPath(); g.arc(p.x, p.y, r + 9, 0, Math.PI * 2); g.stroke(); }
    g.restore();
    sTag(g, methodName(state.method), b.x + 8, b.y + 18, mCol(state.method), 'left');
    const nm = gName(state.sel);
    sTag(g, nm + T('：z = ', ': z = ') + num(CAT[state.sel].v / HC.C_KMS, 4), b.x + b.w - 8, b.y + (b.w < 560 ? 44 : 18), '#e2e8f0', 'right');
    drawSpectrum(g, bx.spec);
  }
  function drawSpectrum(g, b) {
    D.roundRect(g, b.x, b.y, b.w, b.h, 10); g.fillStyle = 'rgba(6,10,24,0.96)'; g.fill();
    const l0 = 380, l1 = 700, x0 = b.x + (b.w < 500 ? 12 : 92), x1 = b.x + b.w - 12, xx = function (l) { return x0 + (l - l0) / (l1 - l0) * (x1 - x0); };
    const z = CAT[state.sel].v / HC.C_KMS, bh = (b.h - 54) / 2;
    const rows = [{ y: b.y + 20, z: 0, lab: T('實驗室', 'Laboratory') }, { y: b.y + 34 + bh, z: z, lab: T('這個星系', 'This galaxy') }];
    rows.forEach(function (row) {
      for (let x = Math.floor(x0); x < x1; x++) { const l = l0 + (x - x0) / (x1 - x0) * (l1 - l0); g.fillStyle = wlRGB(l, 0.95); g.fillRect(x, row.y, 1.2, bh); }
      LINES.forEach(function (ln) { const x = xx(ln.l * (1 + row.z)); if (x < x0 || x > x1) return; g.fillStyle = 'rgba(0,0,0,0.88)'; g.fillRect(x - 1.2, row.y, 2.4, bh); });
      if (b.w >= 500) sText(g, row.lab, b.x + 10, row.y + bh / 2, '#e2e8f0', 'left', 'middle', '600 11px ' + FONT);
      else sText(g, row.lab, x0 + 4, row.y - 7, '#cbd5e1', 'left', 'middle', '600 10px ' + FONT);
    });
    // 對應的譜線連起來
    LINES.forEach(function (ln, k) {
      const xa = xx(ln.l), xb = xx(ln.l * (1 + z));
      g.strokeStyle = 'rgba(226,232,240,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(xa, rows[0].y + bh); g.lineTo(xb, rows[1].y); g.stroke();
      if (b.w >= 500 || (k >= 2 && k % 2 === 0) || ln.n === 'Hα') sText(g, ln.n, xa, rows[0].y - 8, '#cbd5e1', 'center', 'middle', '600 10px ' + FONT);
    });
    const dHa = 656.28 * z;
    sText(g, T('Hα 移動 ', 'Hα shifted by ') + (dHa >= 0 ? '+' : '−') + sig(Math.abs(dHa), 2) + ' nm' + T('（', ' (') + (z >= 0 ? T('紅移', 'redshift') : T('藍移', 'blueshift')) + T('）', ')'), x1, b.y + b.h - 10, '#e2e8f0', 'right', 'middle', '600 10.5px ' + FONT);
    sText(g, '380 nm', x0, b.y + b.h - 10, '#94a3b8', 'left', 'middle', '10px ' + FONT);
  }
  function pts(m) { const o = state.pts[m || state.method]; return Object.keys(o).map(function (k) { return Object.assign({ i: +k }, o[k]); }); }
  function fitNow() { const p = pts(); return p.length ? HC.fitH(p) : null; }
  function chartHubble(g, W, H) {
    const Fm = frame0(W, H), all = [];
    ['hubble', 'cepheid', 'sn'].forEach(function (m) { pts(m).forEach(function (p) { all.push(p); }); });
    const dmax = Math.max(20, all.reduce(function (s, p) { return Math.max(s, p.d + p.sd); }, 0)) * 1.08;
    const vmax = Math.max(1600, all.reduce(function (s, p) { return Math.max(s, p.v); }, 0), 75 * dmax) * 1.08;
    const ax = axes(g, Fm, 0, dmax, -500, vmax, T('量到的距離 d（Mpc）', 'Measured distance d (Mpc)'), T('速度 v = cz（km/s）', 'Velocity v = cz (km/s)'));
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    g.strokeStyle = D.alpha(C.text, 0.35); g.beginPath(); g.moveTo(Fm.x0, ax.yy(0)); g.lineTo(Fm.x1, ax.yy(0)); g.stroke();
    g.strokeStyle = D.alpha(C['hb-true'], 0.9); g.lineWidth = 1.4; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(ax.xx(0), ax.yy(0)); g.lineTo(ax.xx(dmax), ax.yy(70 * dmax)); g.stroke();
    if (pts('hubble').length) { g.strokeStyle = D.alpha(C['hb-hub'], 0.9); g.beginPath(); g.moveTo(ax.xx(0), ax.yy(0)); g.lineTo(ax.xx(vmax / 500), ax.yy(vmax)); g.stroke(); }
    g.setLineDash([]);
    const f = fitNow();
    if (f && f.n >= 2) { g.strokeStyle = C['hb-fit']; g.lineWidth = 2.6; g.beginPath(); g.moveTo(ax.xx(0), ax.yy(0)); g.lineTo(ax.xx(dmax), ax.yy(f.H * dmax)); g.stroke(); }
    ['hubble', 'cepheid', 'sn'].forEach(function (m) {
      const cur = m === state.method;
      pts(m).forEach(function (p) {
        const x = ax.xx(p.d), y = ax.yy(p.v);
        if (cur) { g.strokeStyle = D.alpha(mCol(m), 0.6); g.lineWidth = 1.2; g.beginPath(); g.moveTo(ax.xx(p.d - p.sd), y); g.lineTo(ax.xx(p.d + p.sd), y); g.stroke(); }
        D.ball(g, x, y, cur ? 4.2 : 3, D.alpha(mCol(m), cur ? 1 : 0.45), { shadow: false, ring: p.i === state.sel && cur ? '#ffffff' : null });
      });
    });
    g.restore();
    let ly = Fm.y0 + 10;
    D.haloText(g, T('綠虛線：這個模擬宇宙（70）', 'Green dashed: this simulated universe (70)'), Fm.x0 + 8, ly, C['hb-true'], 'left', 'middle', '700 10.5px ' + FONT); ly += 15;
    if (pts('hubble').length) { D.haloText(g, T('橘虛線：哈伯 1929（500）', 'Orange dashed: Hubble 1929 (500)'), Fm.x0 + 8, ly, C['hb-hub'], 'left', 'middle', '700 10.5px ' + FONT); ly += 15; }
    if (f && f.n >= 2) D.haloText(g, T('青線：你量的 ', 'Cyan: yours ') + num(f.H, 1) + ' ± ' + num(f.sH, 1), Fm.x0 + 8, ly, C['hb-fit'], 'left', 'middle', '700 10.5px ' + FONT);
    if (!all.length) D.haloText(g, T('還沒有量測：點一個星系，按「量這個星系」', 'No measurements yet: tap a galaxy and press “Measure it”'), (Fm.x0 + Fm.x1) / 2, (Fm.y0 + Fm.y1) / 2, C.muted, 'center', 'middle', '600 12px ' + FONT);
    axisBox(g, Fm);
  }
  /** 速度偏離哈伯定律多少：本動速度 */
  function chartResid(g, W, H) {
    const Fm = frame0(W, H), p = pts(), f = fitNow();
    const dmax = Math.max(20, p.reduce(function (s, q) { return Math.max(s, q.d); }, 0)) * 1.08;
    const Hh = f && f.n >= 2 ? f.H : (state.method === 'hubble' ? 500 : 70);
    const rmax = Math.max(800, p.reduce(function (s, q) { return Math.max(s, Math.abs(q.v - Hh * q.d)); }, 0) * 1.15);
    const ax = axes(g, Fm, 0, dmax, -rmax, rmax, T('量到的距離 d（Mpc）', 'Measured distance d (Mpc)'), T('v − H·d（km/s）', 'v − H·d (km/s)'));
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    g.fillStyle = D.alpha(C['hb-true'], 0.1); g.fillRect(Fm.x0, ax.yy(250), Fm.x1 - Fm.x0, ax.yy(-250) - ax.yy(250));
    g.strokeStyle = D.alpha(C.text, 0.5); g.beginPath(); g.moveTo(Fm.x0, ax.yy(0)); g.lineTo(Fm.x1, ax.yy(0)); g.stroke();
    p.forEach(function (q) {
      const x = ax.xx(q.d), y = ax.yy(q.v - Hh * q.d), e = Hh * q.sd;
      g.strokeStyle = D.alpha(mCol(state.method), 0.55); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, ax.yy(q.v - Hh * (q.d - q.sd))); g.lineTo(x, ax.yy(q.v - Hh * (q.d + q.sd))); g.stroke();
      D.ball(g, x, y, 4, mCol(state.method), { shadow: false, ring: q.i === state.sel ? '#ffffff' : null });
      void e;
    });
    g.restore();
    D.haloText(g, T('綠帶：本動速度 ±250 km/s', 'Green band: peculiar velocities ±250 km/s'), Fm.x0 + 8, Fm.y0 + 10, C['hb-true'], 'left', 'middle', '700 10.5px ' + FONT);
    if (!p.length) D.haloText(g, T('用這個方法還沒有量測', 'No measurements with this method yet'), (Fm.x0 + Fm.x1) / 2, (Fm.y0 + Fm.y1) / 2 + 20, C.muted, 'center', 'middle', '600 12px ' + FONT);
    axisBox(g, Fm);
  }

  // =====================================================================
  // 三、宇宙的年齡
  // =====================================================================
  let ageCache = null;
  function ageModel() {
    const key = state.H0 + '|' + state.Om + '|' + state.OL;
    if (ageCache && ageCache.key === key) return ageCache;
    const M = HC.model(state.H0, state.Om, state.OL), age = HC.age(M), rec = HC.recollapses(M);
    const hist = HC.history(M, rec ? 400 : 40, -80);
    const aA = HC.aAccel(M);
    ageCache = { key: key, M: M, age: age, rec: rec, hist: hist, crunch: hist.crunch, bounce: !age, zacc: aA && aA < 1 ? 1 / aA - 1 : null, accNow: HC.q0(M) < 0 };
    if (aA && aA < 1 && age) ageCache.tacc = HC.lookback(M, 1 / aA - 1);
    return ageCache;
  }
  const refCache = {};
  function refHist(id) {
    const H0 = id === 'planck' ? 67.4 : state.H0, key = id + '|' + H0;
    if (!refCache[key]) {
      const m = id === 'planck' ? HC.model(67.4, 0.315, 0.685) : id === 'eds' ? HC.model(H0, 1, 0) : HC.model(H0, 0, 0);
      refCache[key] = HC.history(m, 40, -80);
    }
    return refCache[key];
  }
  function tRange() {
    const A = ageModel(), bang = A.hist.bang;
    return { t0: Math.max(-40, Math.min(-16, bang != null ? bang - 1.5 : -16)), t1: 30 };
  }
  function drawAge(g, W, H) {
    const b = { x: 6, y: 6, w: W - 12, h: H - 12 };
    spaceBox(g, b); bgStars(g, b, 60);
    const A = ageModel(), tr = tRange(), narrow = W < 560;
    const Fm = { x0: b.x + 44, x1: b.x + b.w - 14, y0: b.y + (narrow ? 56 : 40), y1: b.y + b.h - 40 };
    const xx = function (t) { return Fm.x0 + (t - tr.t0) / (tr.t1 - tr.t0) * (Fm.x1 - Fm.x0); };
    const yy = function (a) { return Fm.y1 - a / 3 * (Fm.y1 - Fm.y0); };
    // 格線
    g.strokeStyle = 'rgba(226,232,240,0.1)'; g.lineWidth = 1;
    for (let a = 0; a <= 3; a += 0.5) { const y = yy(a); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); sText(g, num(a, 1), Fm.x0 - 6, y, '#94a3b8', 'right', 'middle', '10px ' + FONT); }
    const st = (tr.t1 - tr.t0) > 50 ? 10 : 5;
    for (let t = Math.ceil(tr.t0 / st) * st; t <= tr.t1; t += st) { const x = xx(t); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); sText(g, (t > 0 ? '+' : '') + (EN ? String(t) : String(t * 10)), x, Fm.y1 + 12, '#94a3b8', 'center', 'middle', '10px ' + FONT); }
    sText(g, T('時間（億年；0 是現在）', 'Time (billion years; 0 is now)'), (Fm.x0 + Fm.x1) / 2, Fm.y1 + 28, '#cbd5e1', 'center', 'middle', '600 10.5px ' + FONT);
    sText(g, T('宇宙的大小 a', 'Size of the universe a'), b.x + 10, b.y + 16, '#cbd5e1', 'left', 'middle', '600 10.5px ' + FONT);
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0 - 4, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0 + 8); g.clip();
    // 最老的恆星、地球
    const xs = xx(-HC.OLDEST_STARS), xe = xx(-HC.EARTH_AGE), young = A.age != null && A.age < HC.OLDEST_STARS;
    g.strokeStyle = young ? D.alpha(C['hb-warn'], 0.9) : 'rgba(253,224,71,0.5)'; g.setLineDash([3, 4]); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(xs, Fm.y0); g.lineTo(xs, Fm.y1); g.stroke();
    g.strokeStyle = 'rgba(56,189,248,0.5)'; g.beginPath(); g.moveTo(xe, Fm.y0); g.lineTo(xe, Fm.y1); g.stroke(); g.setLineDash([]);
    // 參考曲線
    const curve = function (h, col, w, dash) {
      g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); let on = false;
      h.pts.forEach(function (p) { if (p.t < tr.t0 - 1 || p.t > tr.t1 + 1) return; const x = xx(p.t), y = yy(Math.min(3.3, p.a)); if (on) g.lineTo(x, y); else { g.moveTo(x, y); on = true; } });
      g.stroke(); g.setLineDash([]);
    };
    curve(refHist('planck'), 'rgba(148,163,184,0.55)', 1.3, [5, 4]);
    curve(refHist('eds'), 'rgba(251,146,60,0.55)', 1.3, [2, 4]);
    curve(refHist('empty'), 'rgba(163,230,53,0.5)', 1.3, [8, 4]);
    g.save(); g.shadowColor = C['hb-curve']; g.shadowBlur = 10; curve(A.hist, '#7dd3fc', 3); g.restore();
    // 現在
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(xx(0), Fm.y0); g.lineTo(xx(0), Fm.y1); g.stroke();
    D.ball(g, xx(0), yy(1), 5, '#ffffff', { shadow: false, glow: 0.6 });
    // 大霹靂、大崩墜
    if (A.hist.bang != null) { const x = xx(A.hist.bang); g.fillStyle = 'rgba(253,224,71,0.35)'; g.beginPath(); g.arc(x, yy(0), 12, 0, Math.PI * 2); g.fill(); D.ball(g, x, yy(0), 5, '#fde047', { shadow: false, glow: 1 }); }
    if (A.crunch != null && A.crunch <= tr.t1) { const x = xx(A.crunch); D.ball(g, x, yy(0), 5, '#f87171', { shadow: false, glow: 1 }); }
    // 播放中的點
    const run = state.run.age;
    if (run) {
      const t = run.t, p = interpA(A.hist, t);
      if (p != null) D.ball(g, xx(t), yy(Math.min(3.3, p)), 7, '#fde047', { shadow: false, glow: 1, ring: '#ffffff' });
    }
    g.restore();
    // 標籤
    sText(g, T('現在', 'Now'), xx(0) + 6, Fm.y0 + 8, '#ffffff', 'left', 'middle', '700 11px ' + FONT);
    sText(g, T('最老的恆星', 'Oldest stars'), xs + 4, Fm.y0 + 26, young ? '#f87171' : '#fde68a', 'left', 'middle', '600 10px ' + FONT);
    sText(g, T('地球誕生', 'Earth forms'), xe + 4, Fm.y0 + 42, '#7dd3fc', 'left', 'middle', '600 10px ' + FONT);
    if (A.hist.bang != null && A.hist.bang >= tr.t0) sText(g, T('大霹靂', 'Big Bang'), xx(A.hist.bang) + 8, yy(0) - 14, '#fde047', 'left', 'middle', '700 11px ' + FONT);
    if (A.crunch != null && A.crunch <= tr.t1) sText(g, T('大崩墜', 'Big Crunch'), xx(A.crunch) - 8, yy(0) - 14, '#f87171', 'right', 'middle', '700 11px ' + FONT);
    const lg = [['#7dd3fc', T('你的宇宙', 'Your universe')], ['rgba(148,163,184,0.9)', 'Planck'], ['rgba(251,146,60,0.9)', T('只有物質', 'Matter only')], ['rgba(163,230,53,0.9)', T('空的', 'Empty')]];
    let lx = b.x + b.w - 10, ly = b.y + 16;
    for (let k = lg.length - 1; k >= 0; k--) { g.font = '700 10.5px ' + FONT; const w = g.measureText(lg[k][1]).width; sText(g, lg[k][1], lx, ly, lg[k][0], 'right', 'middle', '700 10.5px ' + FONT); lx -= w + 14; if (narrow && k === 2) { lx = b.x + b.w - 10; ly += 15; } }
    const msg = A.age != null ? T('年齡 ', 'Age ') + gyr(A.age) : T('沒有大霹靂：往回推會反彈', 'No Big Bang: going back, it bounces');
    sTag(g, msg, b.x + b.w - 10, b.y + (narrow ? 47 : 40), young ? C['hb-warn'] : '#fde047', 'right');
  }
  function interpA(h, t) {
    const P = h.pts; if (!P.length || t < P[0].t || t > P[P.length - 1].t) return null;
    let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].t <= t) lo = m; else hi = m; }
    const p = P[lo], q = P[hi]; return q.t === p.t ? p.a : p.a + (q.a - p.a) * (t - p.t) / (q.t - p.t);
  }
  let omCache = null;
  function chartAgeOm(g, W, H) {
    const Fm = frame0(W, H);
    if (!omCache || omCache.H0 !== state.H0) {
      const flat = [], open = [];
      for (let k = 0; k <= 60; k++) { const om = 3 * k / 60; flat.push({ om: om, t: HC.age(HC.model(state.H0, om, 1 - om - HC.omegaR(state.H0))) }); open.push({ om: om, t: HC.age(HC.model(state.H0, om, 0)) }); }
      omCache = { H0: state.H0, flat: flat, open: open };
    }
    const tH = HC.hubbleTime(state.H0), ymax = Math.max(20, tH * 1.35);
    const ax = axes(g, Fm, 0, 3, 0, ymax, T('物質 Ωm', 'Matter Ωm'), T('年齡（十億年）', 'Age (billion years)'));
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    [[HC.OLDEST_STARS, '#d97706'], [HC.EARTH_AGE, '#0284c7']].forEach(function (q) { g.strokeStyle = D.alpha(q[1], 0.8); g.setLineDash([5, 4]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(Fm.x0, ax.yy(q[0])); g.lineTo(Fm.x1, ax.yy(q[0])); g.stroke(); g.setLineDash([]); });
    g.strokeStyle = D.alpha(C.text, 0.4); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(Fm.x0, ax.yy(tH)); g.lineTo(Fm.x1, ax.yy(tH)); g.stroke(); g.setLineDash([]);
    const line = function (arr, col) { g.strokeStyle = col; g.lineWidth = 2.4; g.beginPath(); let on = false; arr.forEach(function (p) { if (p.t == null) { on = false; return; } const x = ax.xx(p.om), y = ax.yy(p.t); if (on) g.lineTo(x, y); else { g.moveTo(x, y); on = true; } }); g.stroke(); };
    line(omCache.flat, C['hb-curve']); line(omCache.open, C['hb-hub']);
    g.restore();
    D.haloText(g, T('藍：平坦（ΩΛ = 1 − Ωm）', 'Blue: flat (ΩΛ = 1 − Ωm)'), Fm.x1 - 6, Fm.y0 + 10, C['hb-curve'], 'right', 'middle', '700 10.5px ' + FONT);
    D.haloText(g, T('橘：沒有暗能量（ΩΛ = 0）', 'Orange: no dark energy (ΩΛ = 0)'), Fm.x1 - 6, Fm.y0 + 25, C['hb-hub'], 'right', 'middle', '700 10.5px ' + FONT);
    D.haloText(g, T('最老的恆星', 'Oldest stars'), Fm.x0 + 6, ax.yy(HC.OLDEST_STARS) - 8, '#d97706', 'left', 'middle', '600 10px ' + FONT);
    D.haloText(g, T('地球', 'Earth'), Fm.x0 + 6, ax.yy(HC.EARTH_AGE) - 8, '#0284c7', 'left', 'middle', '600 10px ' + FONT);
    D.haloText(g, '1/H', Fm.x1 - 6, ax.yy(tH) - 8, C.muted, 'right', 'middle', '600 10px ' + FONT);
    const A = ageModel();
    if (A.age != null && state.Om <= 3) D.ball(g, ax.xx(state.Om), ax.yy(Math.min(ymax, A.age)), 6, C['hb-target'], { shadow: false, ring: '#ffffff' });
    axisBox(g, Fm);
  }
  let planeImg = null;
  function planeFrame(W, H) { return frame0(W, H); }
  const OM_MAX = 3, OL_MIN = -1, OL_MAX = 1.5;
  function chartPlane(g, W, H) {
    const Fm = planeFrame(W, H), w = Math.round(Fm.x1 - Fm.x0), h = Math.round(Fm.y1 - Fm.y0);
    const ax = axes(g, Fm, 0, OM_MAX, OL_MIN, OL_MAX, T('物質 Ωm', 'Matter Ωm'), T('暗能量 ΩΛ', 'Dark energy ΩΛ'), function (v) { return num(v, 1); }, function (v) { return num(v, 1); });
    if (!planeImg || planeImg.w !== w || planeImg.h !== h || planeImg.dark !== C.text) {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w / 3)); c.height = Math.max(1, Math.round(h / 3));
      const q = c.getContext('2d'), img = q.createImageData(c.width, c.height);
      for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
        const om = (i + 0.5) / c.width * OM_MAX, ol = OL_MAX - (j + 0.5) / c.height * (OL_MAX - OL_MIN);
        const M = HC.model(70, om, ol, false); let col = null;
        let bang = true; for (let k = 1; k <= 200; k++) { const a = k / 200; if (HC.F(M, a) <= 0) { bang = false; break; } }
        if (!bang) col = [220, 38, 38, 70];
        else if (HC.recollapses(M)) col = [37, 99, 235, 45];
        const o = (j * c.width + i) * 4; if (col) { img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = col[3]; }
      }
      q.putImageData(img, 0, 0); planeImg = { c: c, w: w, h: h, dark: C.text };
    }
    g.save(); g.imageSmoothingEnabled = true; g.drawImage(planeImg.c, Fm.x0, Fm.y0, w, h);
    g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    g.strokeStyle = D.alpha(C.text, 0.7); g.lineWidth = 1.6; g.beginPath(); g.moveTo(ax.xx(0), ax.yy(1)); g.lineTo(ax.xx(2.5), ax.yy(-1.5)); g.stroke();
    g.strokeStyle = D.alpha(C['hb-hub'], 0.9); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(ax.xx(0), ax.yy(0)); g.lineTo(ax.xx(3), ax.yy(1.5)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = D.alpha(C.text, 0.3); g.beginPath(); g.moveTo(Fm.x0, ax.yy(0)); g.lineTo(Fm.x1, ax.yy(0)); g.stroke();
    MODELS.forEach(function (m) { if (m.Om <= OM_MAX) D.ball(g, ax.xx(m.Om), ax.yy(m.OL), 3.2, D.alpha(C.text, 0.55), { shadow: false }); });
    g.restore();
    D.haloText(g, T('平坦', 'Flat'), ax.xx(0.35), ax.yy(0.65) - 8, C.text, 'left', 'middle', '700 10.5px ' + FONT);
    D.haloText(g, T('加速 ↑／減速 ↓', 'Speeding up ↑ / slowing ↓'), ax.xx(2.95), ax.yy(1.475) + 12, C['hb-hub'], 'right', 'middle', '700 10.5px ' + FONT);
    D.haloText(g, T('紅：沒有大霹靂', 'Red: no Big Bang'), Fm.x0 + 8, Fm.y0 + 10, C['hb-warn'], 'left', 'middle', '700 10.5px ' + FONT);
    D.haloText(g, T('藍：將來會大崩墜', 'Blue: ends in a Big Crunch'), Fm.x0 + 8, Fm.y1 - 10, C['hb-curve'], 'left', 'middle', '700 10.5px ' + FONT);
    D.ball(g, ax.xx(Math.min(OM_MAX, state.Om)), ax.yy(Math.max(OL_MIN, Math.min(OL_MAX, state.OL))), 6.5, C['hb-target'], { shadow: false, ring: '#ffffff' });
    axisBox(g, Fm);
  }

  // =====================================================================
  // 主畫面與下方的圖
  // =====================================================================
  function drawMain() {
    const W = cvSize.w, H = cvSize.h, g = ctx;
    g.clearRect(0, 0, W, H);
    D.backdrop(g, W, H);
    if (state.mode === 'expand') drawExpand(g, W, H);
    else if (state.mode === 'measure') drawMeasure(g, W, H);
    else drawAge(g, W, H);
  }
  function drawChart() {
    const g = gtx, W = grSize.w, H = grSize.h, c = state.chart[state.mode];
    g.clearRect(0, 0, W, H); D.backdrop(g, W, H);
    if (state.mode === 'expand') { if (c === 'a') chartVR(g, W, H); else chartTrip(g, W, H); }
    else if (state.mode === 'measure') { if (c === 'a') chartHubble(g, W, H); else chartResid(g, W, H); }
    else { if (c === 'a') chartAgeOm(g, W, H); else chartPlane(g, W, H); }
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    const dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
    lastFrame = ts;
    const run = state.run[state.mode];
    if (run && run.playing) stepRun(dt);
    const er = state.run.expand; if (er && er.flash > 0) er.flash = Math.max(0, er.flash - dt * 1.5);
    drawMain(); drawChart();
    if ((run && run.playing) || (er && er.flash > 0 && state.mode === 'expand')) requestDraw(); else lastFrame = 0;
  }
  function sound() { const Ls = window.LabSound; return Ls && Ls.enabled() ? Ls : null; }
  function startRun(kind) {
    acted();
    const m = state.mode, run = state.run[m];
    if (run && !run.done && !run.playing) { run.playing = true; updateButtons(); requestDraw(); return; }
    if (run && run.playing) return;
    if (m === 'measure' && kind !== 'burst') { measureOne(); return; }
    if (m === 'expand') {
      if (!state.target) { setStatus(T('先點一個星系當目標。', 'Tap a galaxy to choose a target first.')); return; }
      if (state.a >= A_MAX - 1e-9) { setSlider(el.scale, 1); state.a = 1; }
      const chi0 = chiOf(state.target);
      state.run.expand = { a0: state.a, chi0: chi0, playing: true, done: false, arrived: false, z: null, flash: 0, vc: H_SIM * chi0 / HC.C_KMS };
      setStatus(T('粉紅色的星系送出一道光；空間一邊拉長，光一邊朝家裡走……', 'The pink galaxy sends a ray of light; space stretches while the light travels home…'));
      const snd = sound(); if (snd) snd.tone({ freq: 880, dur: 0.15, type: 'sine', gain: 0.05 });
    } else if (m === 'measure') {
      const todo = CAT.map(function (_, i) { return i; }).filter(function (i) { return HC.canMeasure(CAT[i], state.method) && !state.pts[state.method][i]; });
      if (!todo.length) { setStatus(T('能用這個方法量的星系都量過了。', 'Every galaxy this method can reach has been measured.')); return; }
      state.run.measure = { todo: todo, k: 0, acc: 0, playing: true, done: false, cur: null };
      setStatus(T('一個一個量……', 'Measuring one by one…'));
    } else {
      const A = ageModel(), t0 = A.hist.bang != null ? A.hist.bang : A.hist.pts[0].t;
      state.run.age = { t0: t0, t: t0, playing: true, done: false };
      setStatus(A.hist.bang != null ? T('從大霹靂開始播放……', 'Playing from the Big Bang…') : T('這個宇宙沒有大霹靂：從反彈的時候開始播放……', 'This universe has no Big Bang: playing from the bounce…'));
    }
    updateButtons(); afterChange(true); requestDraw();
  }
  function stepRun(dt) {
    const m = state.mode, run = state.run[m];
    if (m === 'expand') {
      const aArr = run.a0 * Math.exp(run.chi0 / R_HUB);
      let a = state.a + A_RATE * dt;
      if (a >= aArr) { a = aArr; setA(a); arrive(); return; }
      if (a >= A_MAX) { setA(A_MAX); finishRun(); return; }
      setA(a);
    } else if (m === 'measure') {
      run.acc += dt;
      while (run.acc >= 0.14 && run.k < run.todo.length) { run.acc -= 0.14; run.cur = run.todo[run.k]; addPoint(run.cur); run.k++; const snd = sound(); if (snd) snd.tone({ freq: 700 + 12 * run.k, dur: 0.04, type: 'triangle', gain: 0.025 }); }
      if (run.k >= run.todo.length) finishRun();
      updateReadouts();
    } else {
      run.t = Math.min(0, run.t + dt * Math.max(2, -run.t0) / 6);
      if (run.t >= 0) finishRun();
    }
  }
  function setA(a) { state.a = Math.max(A_MIN, Math.min(A_MAX, a)); setSlider(el.scale, Math.round(state.a * 100) / 100); refreshOutputs(); updateReadouts(); }
  function arrive() {
    const run = state.run.expand;
    run.arrived = true; run.flash = 1; run.z = state.a / run.a0 - 1;
    state.lastLight = { z: run.z, vc: run.vc, a0: run.a0, a1: state.a };
    const snd = sound();
    if (snd) { snd.tone({ freq: Math.max(260, 880 / (1 + run.z)), dur: 0.35, type: 'sine', gain: 0.06 }); }
    finishRun(true);
  }
  function finishRun(arrived) {
    const m = state.mode, run = state.run[m];
    run.playing = false; run.done = true;
    const snd = sound();
    let ev = null;
    if (m === 'expand') {
      if (arrived) setStatus(T('光到家了：出發時 a = ', 'The light is home: it left at a = ') + num(run.a0, 2) + T('，到達時 a = ', ' and arrived at a = ') + num(state.a, 2) + T('，波長拉長 ', '; its wavelength stretched by ') + num(1 + run.z, 3) + T(' 倍，z = ', '×, z = ') + num(run.z, 3) + T('。出發時它離家 ', '. When it left, the galaxy was ') + mpc(run.a0 * run.chi0) + T('，現在離家 ', ' away; now it is ') + mpc(state.a * run.chi0) + T('。', '.'));
      else { setStatus(T('宇宙已經拉長到 a = 3，光還在路上。', 'The universe has stretched to a = 3 and the light is still on its way.')); if (snd) snd.tone({ freq: 330, dur: 0.2, type: 'triangle', gain: 0.04 }); }
      ev = snapshot(); ev.anim = false; ev.arrived = !!arrived; ev.z = arrived ? run.z : null; ev.vEmit = run.vc;
    } else if (m === 'measure') {
      run.cur = null; state.run.measure = null;
      const f = fitNow();
      setStatus(T('量完了：', 'Done: ') + pts().length + T(' 個星系', ' galaxies') + (f && f.n >= 2 ? T('，哈伯常數 ', ', Hubble constant ') + num(f.H, 1) + ' ± ' + num(f.sH, 1) + ' km/s/Mpc' : '') + T('。', '.'));
      if (snd) { snd.tone({ freq: 1046, dur: 0.12, type: 'triangle', gain: 0.05 }); snd.tone({ freq: 1568, dur: 0.16, type: 'triangle', gain: 0.04, delay: 0.1 }); }
      state.last = ''; ev = snapshot(); ev.anim = false;
    } else {
      state.run.age = null;
      const A = ageModel();
      setStatus(A.age != null ? T('從大霹靂到現在：', 'From the Big Bang to now: ') + gyr(A.age) + T('。', '.') : T('從反彈到現在。', 'From the bounce to now.'));
      if (snd) { snd.tone({ freq: 784, dur: 0.12, type: 'triangle', gain: 0.05 }); snd.tone({ freq: 1175, dur: 0.18, type: 'triangle', gain: 0.04, delay: 0.1 }); }
      ev = snapshot(); ev.anim = false;
    }
    updateButtons(); updateReadouts();
    emit('run', ev);
    afterChange(true);
  }
  function pauseRun() { const run = state.run[state.mode]; if (!run || run.done) return; run.playing = !run.playing; updateButtons(); afterChange(true); requestDraw(); }
  function cancelRuns() { state.run = { expand: null, measure: null, age: null }; updateButtons(); }

  // ---------- 量測 ----------
  function addPoint(i) { const r = HC.measure(i, state.method); if (r) state.pts[state.method][i] = r; return r; }
  function measureOne() {
    const i = state.sel, g = CAT[i], m = HC.METHOD[state.method];
    if (!HC.canMeasure(g, state.method)) {
      setStatus(gName(i) + T('：', ': ') + (g.d > m.reach ? T('太遠了，', 'too far; ') + methodName(state.method) + T('只到約 ', ' only reaches about ') + m.reach + ' Mpc' : T('太近，這裡沒有看到 Ia 型超新星', 'too close; no Type Ia supernova has been seen here')) + T('。換一種方法試試。', '. Try another method.'));
      const snd = sound(); if (snd) snd.tone({ freq: 300, dur: 0.12, type: 'square', gain: 0.02 });
      return;
    }
    const r = addPoint(i);
    state.last = g.id;
    const snd = sound(); if (snd) snd.tone({ freq: 988, dur: 0.08, type: 'triangle', gain: 0.05 });
    setStatus(gName(i) + T('：距離 ', ': distance ') + mpc(r.d) + ' ± ' + sig(r.sd / r.d * 100, 2) + ' %' + T('，速度 ', ', velocity ') + kms(r.v) + (r.v < 0 ? T('（藍移：朝我們飛來）', ' (blueshift: coming towards us)') : '') + T('。', '.'));
    updateButtons(); updateReadouts();
    const ev = snapshot(); emit('run', ev);
    state.last = '';
    afterChange(true); requestDraw();
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function snapshot() {
    const run = state.run[state.mode], base = { mode: state.mode, chart: state.chart[state.mode], anim: !!(run && run.playing) };
    if (state.mode === 'expand') {
      const chi = chiOf(state.target), L = state.lastLight;
      return Object.assign(base, {
        a: state.a, homeMW: same(state.home, MW_POS), targetMW: same(state.target, MW_POS), hasTarget: !!state.target,
        dist: state.a * chi, chi: chi, v: H_SIM * chi, vc: H_SIM * chi / HC.C_KMS, H: H_SIM / state.a,
        z: null, arrived: false, vEmit: null, lastZ: L ? L.z : null
      });
    }
    if (state.mode === 'measure') {
      const p = pts(), f = p.length ? HC.fitH(p) : null, sel = state.sel, c = state.pts.cepheid[sel], s = state.pts.sn[sel];
      const g = state.last ? CAT[CAT_I[state.last]] : null;
      return Object.assign(base, {
        method: state.method, n: p.length, H: f ? f.H : null, sH: f && f.n >= 2 ? f.sH : null, rel: f && f.n >= 2 && f.H > 0 ? f.sH / f.H : null,
        age1: f ? f.age1 : null, ageL: f ? f.ageL : null,
        dmin: p.length ? Math.min.apply(null, p.map(function (q) { return q.d; })) : null, dmax: p.length ? Math.max.apply(null, p.map(function (q) { return q.d; })) : null,
        sel: CAT[sel].id, last: state.last, lastV: g ? g.v : null, lastLocal: g ? !!g.local : null, lastReal: g ? !!g.real : null,
        both: c && s ? Math.abs(c.d - s.d) / ((c.d + s.d) / 2) : null
      });
    }
    const A = ageModel();
    return Object.assign(base, {
      H0: state.H0, Om: state.Om, OL: state.OL, Ok: A.M.Ok, flat: Math.abs(A.M.Ok) <= 0.005, model: state.model,
      age: A.age, bang: A.age != null, crunch: A.crunch, recollapse: A.rec, q0: HC.q0(A.M), zacc: A.zacc, tH: HC.hubbleTime(state.H0)
    });
  }
  let lastEmit = 0;
  function afterChange(force) {
    updateReadouts();
    const tNow = performance.now();
    if (force || tNow - lastEmit > 200) { lastEmit = tNow; emit('state', snapshot()); }
    requestDraw();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.scale, num(state.a, 2));
    setOut(el.h0, num(state.H0, 1));
    setOut(el.om, num(state.Om, 3));
    setOut(el.ol, num(state.OL, 3));
    const pr = function (sel, attr, v) { document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); }); };
    pr('#modeSeg button', 'data-mode', state.mode);
    pr('#chartSeg button', 'data-chart', state.chart[state.mode]);
    pr('#methodSeg button', 'data-m', state.method);
    pr('#modelSeg button', 'data-p', state.model);
    $('expandPanel').hidden = state.mode !== 'expand';
    $('measurePanel').hidden = state.mode !== 'measure';
    $('agePanel').hidden = state.mode !== 'age';
    $('burst').hidden = state.mode !== 'measure';
    $('moveHome').disabled = !state.target || same(state.target, state.home);
    $('backHome').disabled = same(state.home, MW_POS);
  }
  function chartNames() {
    const n = { expand: [T('速度與距離', 'Speed and distance'), T('光的旅程', 'The light’s journey')], measure: [T('哈伯圖', 'Hubble diagram'), T('偏離定律多少', 'Departures from the law')], age: [T('年齡與物質', 'Age and matter'), T('Ωm–ΩΛ 平面', 'The Ωm–ΩΛ plane')] }[state.mode];
    const bs = document.querySelectorAll('#chartSeg button');
    bs[0].textContent = n[0]; bs[1].textContent = n[1];
  }
  function updateReadouts() {
    chartNames();
    if (state.mode === 'expand') {
      const tg = state.target, chi = chiOf(tg), r = state.a * chi, v = H_SIM * chi;
      setHTML('eV', tg ? 'v = ' + kms(v) : '—');
      setHTML('eR', tg ? mpc(r) + T('（', ' (') + sig(r * HC.MLY_PER_MPC / (EN ? 1000 : 100), 3) + T(' 億光年）', ' billion ly)') : '—');
      setHTML('eVc', tg ? sig(v / HC.C_KMS, 3) + (v > HC.C_KMS ? T('（比光快）', ' (faster than light)') : '') : '—');
      setHTML('eH', sig(H_SIM / state.a, 3) + ' km/s/Mpc');
      setHTML('eHub', mpc(R_HUB * state.a));
      const run = state.run.expand, aArr = tg ? state.a * Math.exp(chi / R_HUB) : null;
      setHTML('eZ', run && run.arrived ? 'z = ' + num(run.z, 3) + T('（已收到）', ' (received)') : tg ? (aArr <= A_MAX + 1e-9 ? T('在 a = ', 'arrives at a = ') + num(aArr, 2) + T(' 到達，z = ', ', z = ') + num(aArr / state.a - 1, 3) : T('a = 3 前到不了', 'not before a = 3')) : '—');
      setHTML('expandHint', T('拖動 a 讓宇宙變大變小：星系本身不變大，只有它們之間的距離變大。點畫面選一個星系（粉紅），可以搬家過去，看看那裡是不是也像宇宙的中心。', 'Drag a to make the universe bigger or smaller: the galaxies themselves do not grow, only the distances between them. Tap a galaxy (pink) and move home there: does it look like the centre too?'));
      setHTML('cvHint', T('格子上的 49 個星系往四面八方重複。綠色箭頭是從「家」看出去的退行速度：越遠越快，方向都朝外。橘色虛線圈是哈伯半徑，圈外的星系退行得比光還快。按「膨脹」，看粉紅色星系發出的光怎麼一路被拉長。', 'The 49 galaxies on the grid repeat in every direction. Green arrows show the recession speed seen from home: faster the farther, all pointing outwards. The dashed orange circle is the Hubble radius; galaxies outside it recede faster than light. Press “Expand” and watch the pink galaxy’s light being stretched on its way.'));
      setHTML('chartHint', state.chart.expand === 'a'
        ? T('從家裡看，每個星系的退行速度都落在同一條直線 v = H r 上：這就是哈伯定律。換一個家，直線還是一樣。', 'Seen from home, every galaxy lies on the same straight line v = H r: Hubble’s law. Change your home and the line is the same.')
        : T('時空圖：粉紅是那個星系離家的距離，黃色是光離家的距離。光一開始可能被空間帶著「往外」，最後還是會到家。', 'A space-time diagram: pink is the galaxy’s distance from home, yellow is the light’s. At first the light may even be carried outwards by space, but it gets home in the end.'));
    } else if (state.mode === 'measure') {
      const i = state.sel, g = CAT[i], z = g.v / HC.C_KMS, r = state.pts[state.method][i];
      setHTML('gName', gName(i));
      setHTML('gZ', num(z, 4));
      setHTML('gV', kms(g.v) + (g.v < 0 ? T('（藍移）', ' (blueshift)') : ''));
      setHTML('gC', r ? (r.P != null ? T('造父變星 P = ', 'Cepheid P = ') + num(r.P, 1) + T(' 天，', ' d, ') : T('超新星，', 'supernova, ')) + 'M = ' + num(r.M, 2) + '，m = ' + num(r.m, 2) : (HC.canMeasure(g, state.method) ? T('還沒量', 'not measured yet') : T('這個方法量不到', 'out of reach')));
      setHTML('gD', r ? mpc(r.d) + ' ± ' + sig(r.sd / r.d * 100, 2) + ' %' : '—');
      const f = fitNow();
      setHTML('mH', f && f.n >= 2 ? 'H<sub>0</sub> = ' + num(f.H, 1) + ' ± ' + num(f.sH, 1) : f ? 'H<sub>0</sub> = ' + num(f.H, 0) : '—');
      setHTML('mN', String(pts().length));
      setHTML('mT', f && f.age1 ? gyr(f.age1) : '—');
      setHTML('mAge', f && f.ageL ? gyr(f.ageL) + (f.ageL < HC.EARTH_AGE ? ' <span class="warn">' + T('比地球還年輕！', 'younger than the Earth!') + '</span>' : '') : '—');
      setHTML('mTrue', 'H<sub>0</sub> = 70 km/s/Mpc');
      const m = HC.METHOD[state.method];
      setHTML('methodHint', state.method === 'hubble' ? T('哈伯 1929 年的量法：造父變星與最亮的恆星，誤差 0.35 星等，而且距離尺度後來修正了約 7 倍。', 'Hubble’s 1929 method: Cepheids and the brightest stars, error 0.35 mag, and a distance scale later corrected by a factor of about 7.')
        : state.method === 'cepheid' ? T('哈伯太空望遠鏡拍造父變星：量週期得到絕對星等，誤差 0.15 星等（距離 7 %）；只到約 40 Mpc。', 'Cepheids with the Hubble Space Telescope: the period gives the absolute magnitude; error 0.15 mag (7 % in distance); reaches about 40 Mpc.')
          : T('Ia 型超新星最亮時 M ≈ −19.3，誤差 0.12 星等（距離 6 %），在很遠的星系也看得到；太近的星系沒有記錄到。', 'Type Ia supernovae peak at M ≈ −19.3, error 0.12 mag (6 % in distance), visible far away; none recorded in the nearest galaxies.'));
      void m;
      setHTML('cvHint', T('點一個星系，下面是它的光譜：吸收線往紅色那一端移動（紅移），移得越多跑得越快。選一種量距離的方法，按「量這個星系」，或「全部量一遍」。名字只標真實的星系，其他是模擬的。', 'Tap a galaxy; below is its spectrum: the absorption lines move towards the red (redshift), more for faster galaxies. Choose a method and press “Measure it”, or “Measure them all”. Only the real galaxies are named; the rest are simulated.'));
      setHTML('chartHint', state.chart.measure === 'a'
        ? T('每個點是一個星系（橫線是距離的誤差）。過原點的直線斜率就是哈伯常數。近處的點散得很開：本動速度比哈伯流還大。', 'Each dot is a galaxy (bars: distance error). The slope of the line through the origin is Hubble’s constant. Nearby dots scatter widely: their own motions outweigh the Hubble flow.')
        : T('每個星系的速度扣掉哈伯定律預測的值。近處的偏差和遠處差不多大（約 ±250 km/s），所以要量遠的星系，相對誤差才小。', 'Each galaxy’s velocity minus what Hubble’s law predicts. The scatter is about the same near and far (±250 km/s), so distant galaxies give a smaller relative error.'));
    } else {
      const A = ageModel(), q = HC.q0(A.M);
      setHTML('aAge', A.age != null ? T('年齡 ', 'Age ') + gyr(A.age) : T('沒有大霹靂', 'No Big Bang'));
      setHTML('aT', gyr(HC.hubbleTime(state.H0)));
      const Ok = A.M.Ok;
      setHTML('aK', num(Ok, 3) + T('（', ' (') + (Math.abs(Ok) <= 0.005 ? T('平坦', 'flat') : Ok > 0 ? T('開放', 'open') : T('封閉', 'closed')) + T('）', ')'));
      setHTML('aQ', 'q<sub>0</sub> = ' + num(q, 3) + T('（', ' (') + (q < 0 ? T('加速', 'speeding up') : T('減速', 'slowing down')) + T('）', ')'));
      setHTML('aAcc', A.zacc != null ? 'z = ' + num(A.zacc, 2) + (A.tacc ? T('（', ' (') + gyr(A.tacc) + T('前）', ' ago)') : '') : (q < 0 ? T('一直在加速', 'always') : T('沒有加速', 'never')));
      setHTML('aFut', A.rec ? (A.crunch != null ? T('大崩墜：', 'Big Crunch in ') + gyr(A.crunch) + T('後', '') : T('會停下來、收縮回去', 'it will stop and recollapse')) : T('永遠膨脹', 'Expands forever'));
      setHTML('aStar', A.age == null ? '—' : A.age < HC.OLDEST_STARS ? '<span class="warn">' + T('宇宙比最老的恆星還年輕！', 'Younger than the oldest stars!') + '</span>' : T('沒問題：比最老的恆星老', 'Fine: older than the oldest stars'));
      setHTML('ageHint', T('Ωk = 1 − Ωm − ΩΛ − Ωr 是空間的曲率。按下面的按鈕換成有名的宇宙模型，或在「Ωm–ΩΛ 平面」上直接點。', 'Ωk = 1 − Ωm − ΩΛ − Ωr is the curvature of space. Use the buttons for famous models, or tap directly on the “Ωm–ΩΛ plane”.'));
      setHTML('cvHint', T('亮藍色是你調配的宇宙大小 a 隨時間的變化，虛線是三個參考模型。往左一直推到 a = 0，就是大霹靂；最老的恆星和地球誕生的時間也標在上面。', 'Bright blue: how the size a of your universe changes with time; dashed: three reference models. Follow it left to a = 0 and you reach the Big Bang; the ages of the oldest stars and of the Earth are marked.'));
      setHTML('chartHint', state.chart.age === 'a'
        ? T('同一個哈伯常數下，物質越多，宇宙越年輕；沒有暗能量的宇宙，年齡永遠小於 1/H。', 'For the same Hubble constant, more matter means a younger universe; without dark energy the age is always less than 1/H.')
        : T('點這張圖可以直接選 Ωm 與 ΩΛ。黑線是平坦的宇宙，橘虛線以上是加速膨脹，紅色區沒有大霹靂，藍色區將來會大崩墜。', 'Tap this chart to choose Ωm and ΩΛ. The black line is a flat universe, above the orange dashed line the expansion speeds up, the red region has no Big Bang, the blue region ends in a Big Crunch.'));
    }
  }
  function updateButtons() {
    const run = state.run[state.mode];
    const idle = { expand: T('膨脹', 'Expand'), measure: T('量這個星系', 'Measure it'), age: T('從大霹靂播放', 'Play from the Big Bang') }[state.mode];
    const busy = { expand: T('膨脹中…', 'Expanding…'), measure: T('量測中…', 'Measuring…'), age: T('播放中…', 'Playing…') }[state.mode];
    $('go').textContent = run && !run.done && state.mode !== 'measure' ? (run.playing ? busy : T('繼續', 'Resume')) : idle;
    $('burst').textContent = run && !run.done && state.mode === 'measure' ? (run.playing ? busy : T('繼續', 'Resume')) : T('全部量一遍', 'Measure them all');
    $('pause').disabled = !run || run.done || !run.playing;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function fillButtons() {
    const mb = $('methodSeg'); mb.innerHTML = '';
    HC.METHODS.forEach(function (m) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-m', m.id); b.textContent = T(m.zh, m.en);
      b.addEventListener('click', function () { acted(); state.method = m.id; if (state.run.measure) state.run.measure = null; refreshOutputs(); updateButtons(); setStatus(methodName(m.id) + T('：', ': ') + T('點一個星系，按「量這個星系」。', 'tap a galaxy and press “Measure it”.')); afterChange(true); });
      mb.appendChild(b);
    });
    const pb = $('modelSeg'); pb.innerHTML = '';
    MODELS.forEach(function (m) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-p', m.id); b.textContent = T(m.zh, m.en);
      b.addEventListener('click', function () { acted(); applyModel(m); });
      pb.appendChild(b);
    });
  }
  function applyModel(m) {
    if (m.H0 != null) state.H0 = m.H0;
    state.Om = m.Om; state.OL = m.OL; state.model = m.id;
    setSlider(el.h0, state.H0); setSlider(el.om, state.Om); setSlider(el.ol, state.OL);
    state.run.age = null; updateButtons();
    const A = ageModel();
    setStatus(T(m.zh, m.en) + T('：', ': ') + (A.age != null ? T('年齡 ', 'age ') + gyr(A.age) : T('沒有大霹靂', 'no Big Bang')) + T('。', '.'));
    refreshOutputs(); afterChange(true);
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  el.scale.addEventListener('input', function () { if (quiet) return; acted(); state.a = Math.max(A_MIN, Math.min(A_MAX, val(el.scale))); if (state.run.expand && !state.run.expand.playing) state.run.expand = null; else if (state.run.expand) state.run.expand = null; updateButtons(); refreshOutputs(); afterChange(); });
  [el.h0, el.om, el.ol].forEach(function (inp) {
    inp.addEventListener('input', function () {
      if (quiet) return;
      acted();
      if (inp === el.h0) state.H0 = Math.max(40, Math.min(600, val(el.h0)));
      if (inp === el.om) state.Om = Math.max(0, Math.min(3, val(el.om)));
      if (inp === el.ol) state.OL = Math.max(-1, Math.min(1.5, val(el.ol)));
      state.model = ''; state.run.age = null; updateButtons(); refreshOutputs(); afterChange();
    });
  });
  [el.scale, el.h0, el.om, el.ol].forEach(function (inp) { inp.addEventListener('change', function () { if (!quiet) afterChange(true); }); });
  $('moveHome').addEventListener('click', function () {
    if (!state.target) return;
    acted(); const old = state.home; state.home = state.target; state.target = old; state.run.expand = null; state.lastLight = null;
    setStatus(T('搬家了！從這裡看，所有的星系一樣都在遠離你：宇宙沒有中心。原來的家變成粉紅色的目標。', 'You have moved! From here too, every galaxy is moving away from you: there is no centre. Your old home is now the pink target.'));
    updateButtons(); refreshOutputs(); afterChange(true);
  });
  $('backHome').addEventListener('click', function () {
    acted(); state.home = { i: MW, ox: 0, oy: 0 }; state.target = pickDefaultTarget(); state.run.expand = null; state.lastLight = null;
    setStatus(T('回到銀河系。', 'Back in the Milky Way.')); updateButtons(); refreshOutputs(); afterChange(true);
  });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.mode = b.getAttribute('data-mode');
      refreshOutputs(); updateButtons(); afterChange(true);
      setStatus({
        expand: T('按「膨脹」，看粉紅色星系的光怎麼一路被拉長。', 'Press “Expand” and watch the pink galaxy’s light stretch on its way.'),
        measure: T('點一個星系，選量距離的方法，按「量這個星系」。', 'Tap a galaxy, choose a method and press “Measure it”.'),
        age: T('調配物質與暗能量，看宇宙有多老、將來會怎樣。', 'Mix matter and dark energy and see how old the universe is and how it will end.')
      }[state.mode]);
    });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.chart[state.mode] = b.getAttribute('data-chart'); refreshOutputs(); afterChange(true); });
  });
  $('go').addEventListener('click', function () { startRun(); });
  $('burst').addEventListener('click', function () { startRun('burst'); });
  $('pause').addEventListener('click', function () { acted(); pauseRun(); });
  $('clear').addEventListener('click', function () {
    acted(); cancelRuns();
    if (state.mode === 'measure') state.pts = { hubble: {}, cepheid: {}, sn: {} };
    state.lastLight = null;
    setStatus(T('已清除量測與動畫，設定不變。', 'Measurements and animations cleared; the settings are kept.'));
    afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 點畫面 ----------
  function canvasPt(ev, c) { const r = c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  cv.addEventListener('click', function (ev) {
    const p = canvasPt(ev, cv), W = cvSize.w, H = cvSize.h;
    if (state.mode === 'expand') {
      if (state.run.expand && state.run.expand.playing) return;
      const s = Math.min(W - 12, H - 12) / 2 / VIEW, cx = W / 2, cy = H / 2;
      let best = null, bd = 26;
      visible(state.a).forEach(function (q) { const x = cx + q.dx * state.a * L_BOX * s, y = cy - q.dy * state.a * L_BOX * s, d = Math.hypot(x - p.x, y - p.y); if (d < bd && q.r > 1) { bd = d; best = q; } });
      if (best) {
        acted(); state.target = { i: best.i, ox: best.ox, oy: best.oy }; state.run.expand = null;
        const chi = chiOf(state.target);
        setStatus(T('選了這個星系：現在離家 ', 'Selected: now ') + mpc(state.a * chi) + T('，退行速度 ', ' from home, receding at ') + sig(H_SIM * chi / HC.C_KMS, 3) + T(' 倍光速。', ' times the speed of light.'));
        updateButtons(); refreshOutputs(); afterChange(true);
      }
    } else if (state.mode === 'measure') {
      const b = skyBox(W, H).sky; let best = null, bd = 40;
      CAT.forEach(function (g, i) { const q = galPos(i, b), d = Math.hypot(q.x - p.x, q.y - p.y) - galR(i, b) * 0.5; if (d < bd) { bd = d; best = i; } });
      if (best != null) { acted(); state.sel = best; setStatus(gName(best) + T('：紅移 z = ', ': redshift z = ') + num(CAT[best].v / HC.C_KMS, 4) + T('。', '.')); refreshOutputs(); afterChange(true); }
    }
  });
  function planeSet(ev) {
    const p = canvasPt(ev, gr), Fm = planeFrame(grSize.w, grSize.h);
    if (p.x < Fm.x0 || p.x > Fm.x1 || p.y < Fm.y0 || p.y > Fm.y1) return false;
    acted();
    state.Om = Math.round((p.x - Fm.x0) / (Fm.x1 - Fm.x0) * OM_MAX * 200) / 200;
    state.OL = Math.round((OL_MAX - (p.y - Fm.y0) / (Fm.y1 - Fm.y0) * (OL_MAX - OL_MIN)) * 200) / 200;
    state.model = ''; state.run.age = null;
    setSlider(el.om, state.Om); setSlider(el.ol, state.OL);
    updateButtons(); refreshOutputs(); afterChange(); return true;
  }
  let dragPlane = false;
  gr.addEventListener('pointerdown', function (ev) { if (state.mode === 'age' && state.chart.age === 'b' && planeSet(ev)) { dragPlane = true; try { gr.setPointerCapture(ev.pointerId); } catch (e) { /* 沒關係 */ } } });
  gr.addEventListener('pointermove', function (ev) { if (dragPlane) planeSet(ev); });
  gr.addEventListener('pointerup', function () { if (dragPlane) { dragPlane = false; afterChange(true); } });
  gr.addEventListener('pointercancel', function () { dragPlane = false; });

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('實驗畫面。膨脹：左右鍵改 a；量哈伯常數：左右鍵換星系；宇宙的年齡：左右鍵改物質、上下鍵改暗能量。按住 Shift 移動較多。', 'Experiment view. Expanding: left and right change a. Measuring: left and right change the galaxy. Age: left and right change matter, up and down change dark energy. Hold Shift for bigger steps.'),
      items: [{
        name: function () { return T('設定', 'Settings'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          acted();
          if (state.mode === 'expand') { if (!dx) return false; state.run.expand = null; setA(state.a + dx * (big ? 0.2 : 0.02)); }
          else if (state.mode === 'measure') { if (!dx) return false; state.sel = (state.sel + dx + CAT.length) % CAT.length; }
          else {
            if (dx) { state.Om = Math.max(0, Math.min(3, Math.round((state.Om + dx * (big ? 0.1 : 0.01)) * 1000) / 1000)); setSlider(el.om, state.Om); }
            if (dy) { state.OL = Math.max(-1, Math.min(1.5, Math.round((state.OL + dy * (big ? 0.1 : 0.01)) * 1000) / 1000)); setSlider(el.ol, state.OL); }
            state.model = ''; state.run.age = null;
          }
          updateButtons(); refreshOutputs(); afterChange();
          return true;
        },
        describe: function () { return state.mode === 'expand' ? 'a = ' + num(state.a, 2) : state.mode === 'measure' ? gName(state.sel) : 'Ωm ' + num(state.Om, 2) + '，ΩΛ ' + num(state.OL, 2); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  fillButtons();
  state.target = pickDefaultTarget();
  setSlider(el.scale, 1); setSlider(el.h0, 67.4); setSlider(el.om, 0.315); setSlider(el.ol, 0.685);
  state.acted = false;
  refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts();
  function themeChanged() { readColors(); planeImg = null; fillButtons(); refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts(); requestDraw(); }
  const dmq = window.matchMedia('(prefers-color-scheme: dark)');
  if (dmq.addEventListener) dmq.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('你住在銀河系（藍圈）。按「膨脹」，看粉紅色的星系送來的光。', 'You live in the Milky Way (blue ring). Press “Expand” and watch the light from the pink galaxy.'));
  requestDraw();
  // 測試用（Playwright）
  window.__hb = {
    state: state, HC: HC, snapshot: snapshot, fit: fitNow, visible: visible, chiOf: chiOf,
    set: function (o) {
      acted();
      if (o.mode) state.mode = o.mode;
      if (o.a != null) { state.run.expand = null; setA(o.a); }
      if (o.home) state.home = o.home;
      if (o.target) state.target = o.target;
      if (o.method) state.method = o.method;
      if (o.sel) state.sel = CAT_I[o.sel];
      if (o.model) applyModel(MODELS.filter(function (m) { return m.id === o.model; })[0]);
      if (o.H0 != null) { state.H0 = o.H0; setSlider(el.h0, o.H0); state.model = ''; }
      if (o.Om != null) { state.Om = o.Om; setSlider(el.om, o.Om); state.model = ''; }
      if (o.OL != null) { state.OL = o.OL; setSlider(el.ol, o.OL); state.model = ''; }
      if (o.chart) state.chart[state.mode] = o.chart;
      refreshOutputs(); updateButtons(); afterChange(true);
    },
    measure: function (id) { if (id) state.sel = CAT_I[id]; measureOne(); },
    finish: function () { if (!state.run[state.mode]) startRun(state.mode === 'measure' ? 'burst' : undefined); for (let k = 0; k < 2000 && state.run[state.mode] && state.run[state.mode].playing; k++) stepRun(0.1); requestDraw(); }
  };
})();
