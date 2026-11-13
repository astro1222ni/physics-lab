/* parallax.js — 「恆星視差與秒差距」的畫面與互動
 * 物理計算全部在 parallax-core.js。畫面上的角度都放大了非常多倍。 */
(function () {
  'use strict';
  const PC = window.ParCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const EN = !!(window.LabSettings && window.LabSettings.lang === 'en');
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const SEED = 1838;
  const T_MAX = 3;
  const FOV_BASE = 120; // 拉長基線的望遠鏡視野（″）

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { dist: $('dist'), beta: $('beta'), date: $('date'), base: $('base') };
  const STAR = {}; PC.STARS.forEach(function (s) { STAR[s.id] = s; });
  const INST = {}; PC.INSTRUMENTS.forEach(function (i) { INST[i.id] = i; });
  const BASES = [
    { id: 'earth', zh: '地球直徑', en: 'Earth’s diameter', B: 12742 / PC.KM_PER_AU },
    { id: 'moon', zh: '地球到月球', en: 'Earth to Moon', B: 384400 / PC.KM_PER_AU },
    { id: 'orbit', zh: '地球軌道直徑', en: 'Earth’s orbit', B: 2 },
    { id: 'mars', zh: '火星軌道直徑', en: 'Mars’s orbit', B: 2 * 1.5237 },
    { id: 'nh', zh: '新視野號（2020）', en: 'New Horizons (2020)', B: 47 }
  ];
  const state = {
    mode: 'orbit', star: 'proxima', d: 1 / STAR.proxima.p, beta: STAR.proxima.beta, lam: STAR.proxima.lam, pm: true,
    t: 0, inst: 'bessel', fitPM: true, photos: [], k: 0, B: 2, base: 'orbit',
    chart: { orbit: 'a', measure: 'a', baseline: 'a' },
    run: { orbit: null, measure: null, baseline: null },
    acted: false
  };
  if (window.LabNum) {
    window.LabNum.register(el.dist, { toValue: function (p) { return Math.pow(10, p); }, toPos: Math.log10, min: 1, max: 10000, decimals: 3 });
    window.LabNum.register(el.base, { toValue: function (p) { return Math.pow(10, p); }, toPos: Math.log10, min: 3e-5, max: 200, decimals: 6 });
  }
  // LabNum.set 會送出 input／change 事件；程式自己設定滑桿時，事件處理要略過
  let quiet = 0;
  function setSlider(inp, v) { quiet++; try { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; } finally { quiet--; } }
  /** 只讀改動的那幾個滑桿（預設恆星的精確值不被滑桿的顯示精度蓋掉） */
  function readSliders(keys) {
    keys = keys || 'dbtB';
    if (keys.indexOf('d') >= 0) state.d = Math.max(1, Math.min(10000, val(el.dist)));
    if (keys.indexOf('b') >= 0) state.beta = Math.max(-90, Math.min(90, val(el.beta)));
    if (keys.indexOf('t') >= 0) state.t = Math.max(0, Math.min(T_MAX, val(el.date)));
    if (keys.indexOf('B') >= 0) state.B = Math.max(3e-5, Math.min(200, val(el.base)));
  }
  function star() {
    const s = state.star ? STAR[state.star] : null, on = !!(s && state.pm);
    return { lam: state.lam, beta: state.beta, p: 1 / state.d, mux: on ? s.mux : 0, muy: on ? s.muy : 0 };
  }
  function starName() { return state.star ? T(STAR[state.star].zh, STAR[state.star].en) : T('自訂的恆星', 'Custom star'); }
  function fitNow() { return state.photos.length ? PC.fit(state.photos, state.lam, state.beta, state.fitPM) : null; }
  function sigma() { return INST[state.inst].sigma; }

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
  function sci(v, n) {
    if (v == null || !isFinite(v)) return '—';
    if (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3)) {
      const e = Math.floor(Math.log10(Math.abs(v))), m = v / Math.pow(10, e);
      return sig(m, n) + ' × 10<sup>' + String(e).replace('-', '−') + '</sup>';
    }
    return sig(v, n);
  }
  /** 角度（″）：大的用角秒，小的用毫角秒、微角秒 */
  function ang(v, n) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v); n = n || 3;
    if (a >= 60) return sig(v / 60, n) + T(' 角分', ' arcmin');
    if (a >= 0.1 || a === 0) return sig(v, n) + '″';
    if (a >= 1e-4) return sig(v * 1000, n) + ' mas';
    return sig(v * 1e6, n) + ' µas';
  }
  /** 量到的值 ± 誤差，用同一個單位 */
  function angPm(v, e) {
    const a = Math.max(Math.abs(v), e), f = a >= 60 ? 60 : a >= 0.1 ? 1 : a >= 1e-4 ? 1e-3 : 1e-6;
    const u = f === 60 ? T(' 角分', ' arcmin') : f === 1 ? '″' : f === 1e-3 ? ' mas' : ' µas', dg = Math.max(0, 1 - Math.floor(Math.log10(e / f)));
    return num(v / f, Math.min(6, dg)) + ' ± ' + num(e / f, Math.min(6, dg)) + u;
  }
  /** 對數軸的刻度：角秒以上都寫成 ″ */
  function tickAng(v) { return v >= 0.1 ? sig(v, 1) + '″' : v >= 1e-4 ? sig(v * 1000, 1) + 'mas' : sig(v * 1e6, 1) + 'µas'; }
  function pcTxt(d) { return (d < 10 ? sig(d, 3) : d < 1e4 ? num(d, 0) : sig(d, 3)) + ' pc'; }
  function dateTxt(t) {
    const q = PC.dateOf(t);
    return EN ? 'Year ' + (q.year + 1) + ', ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][q.month - 1] + ' ' + q.day
      : '第 ' + (q.year + 1) + ' 年 ' + q.month + ' 月 ' + q.day + ' 日';
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(msg) { setHTML('status', msg); }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  /** 好讀的刻度值（1、2、5 × 10 的次方） */
  function nice(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e; }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface',
      '--px-space0', '--px-space1', '--px-orbit', '--px-earth', '--px-sun', '--px-star', '--px-path', '--px-pm', '--px-fit', '--px-photo',
      '--px-x', '--px-y', '--px-true', '--px-meas']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    D.refresh();
  }
  const INST_COL = { eye: '#a855f7', bessel: '#f59e0b', ccd: '#22c55e', hipparcos: '#0ea5e9', gaia: '#ec4899' };

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
  /** 太空背景上的字（深淺色模式都用亮字暗邊） */
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
  }
  function spaceBox(g, b, r) {
    D.roundRect(g, b.x, b.y, b.w, b.h, r == null ? 10 : r);
    const sg = g.createLinearGradient(0, b.y, 0, b.y + b.h);
    sg.addColorStop(0, C['px-space1']); sg.addColorStop(1, C['px-space0']);
    g.fillStyle = sg; g.fill();
  }
  function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  const BG = [];
  for (let i = 0; i < 70; i++) BG.push({ x: hash(i) * 2 - 1, y: hash(i + 500) * 2 - 1, m: hash(i + 900) });
  function bgStars(g, b, n) {
    g.save(); D.roundRect(g, b.x, b.y, b.w, b.h, 10); g.clip();
    for (let i = 0; i < (n || 70); i++) {
      const s = BG[i], x = b.x + (s.x + 1) / 2 * b.w, y = b.y + (s.y + 1) / 2 * b.h, r = 0.5 + 1.2 * s.m * s.m;
      g.fillStyle = 'rgba(226,232,240,' + (0.25 + 0.55 * s.m) + ')'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  // ---------------------------------------------------------------------
  // 地球軌道（俯視）
  // ---------------------------------------------------------------------
  function orbitView(g, b, opts) {
    spaceBox(g, b); bgStars(g, b, 40);
    const s = star(), cx = b.x + b.w / 2, cy = b.y + b.h / 2 + 6, R = Math.min(b.w, b.h) * (opts.small ? 0.3 : 0.27);
    const P = function (t) { const e = PC.earthPos(t); return { x: cx + R * e[0], y: cy - R * e[1] }; };
    const sl = state.lam * Math.PI / 180, Rs = Math.min(b.w, b.h) * (opts.small ? 0.45 : 0.4);
    const S = { x: cx + Rs * Math.cos(sl), y: cy - Rs * Math.sin(sl) };
    // 軌道
    g.strokeStyle = D.alpha(C['px-orbit'], 0.55); g.lineWidth = 1.4; g.setLineDash([4, 4]);
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    // 太陽
    D.ball(g, cx, cy, opts.small ? 7 : 11, C['px-sun'], { shadow: false, glow: 0.9 });
    const t = state.t, E = P(t), E2 = P(t + 0.5);
    // 兩條視線（誇大）
    if (!opts.small) {
      g.strokeStyle = D.alpha(C['px-star'], 0.75); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(E.x, E.y); g.lineTo(S.x, S.y); g.stroke();
      g.setLineDash([3, 4]); g.strokeStyle = D.alpha(C['px-star'], 0.4);
      g.beginPath(); g.moveTo(E2.x, E2.y); g.lineTo(S.x, S.y); g.stroke(); g.setLineDash([]);
      D.ball(g, E2.x, E2.y, 5, D.alpha(C['px-earth'], 0.45), { shadow: false });
      sText(g, T('半年後', 'Half a year later'), E2.x, E2.y + 14, '#94a3b8', 'center', 'middle', '10.5px ' + FONT);
      // 1 AU
      g.strokeStyle = 'rgba(226,232,240,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, cy); g.lineTo(E.x, E.y); g.stroke();
      sText(g, '1 AU', (cx + E.x) / 2 + 6, (cy + E.y) / 2 - 8, '#cbd5e1', 'left', 'middle', '600 10.5px ' + FONT);
      // 2p 的角
      const a1 = Math.atan2(E.y - S.y, E.x - S.x), a2 = Math.atan2(E2.y - S.y, E2.x - S.x);
      let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      g.strokeStyle = C['px-path']; g.lineWidth = 1.6; g.beginPath(); g.arc(S.x, S.y, 26, a1, a1 + da, da < 0); g.stroke();
      const am = a1 + da / 2;
      sText(g, T('2p（放大）', '2p (enlarged)'), S.x + 42 * Math.cos(am), S.y + 42 * Math.sin(am), C['px-path'], 'center', 'middle', '700 11px ' + FONT);
    }
    // 照片的日期
    if (opts.photos) state.photos.forEach(function (ph) { const q = P(ph.t); g.fillStyle = C['px-photo']; g.beginPath(); g.arc(q.x, q.y, 3, 0, Math.PI * 2); g.fill(); });
    // 地球
    D.ball(g, E.x, E.y, opts.small ? 5 : 7, C['px-earth'], { shadow: false, glow: 0.4 });
    // 恆星（方向是真的，距離放大縮小了很多）
    D.ball(g, S.x, S.y, opts.small ? 4 : 6, C['px-star'], { shadow: false, glow: 0.9 });
    if (!opts.small) {
      sText(g, starName(), S.x, S.y + (S.y < cy ? 18 : -16), C['px-star'], 'center', 'middle', '700 12px ' + FONT);
      sText(g, T('太陽', 'Sun'), cx, cy + 20, '#fde68a', 'center', 'middle', '600 11px ' + FONT);
      sText(g, T('地球', 'Earth'), E.x + 10, E.y - 10, '#93c5fd', 'left', 'middle', '700 11px ' + FONT);
      sText(g, T('從北黃極往下看', 'Seen from above the ecliptic'), b.x + 10, b.y + 14, '#cbd5e1', 'left', 'middle', '600 11px ' + FONT);
      sText(g, T('恆星實際的距離是地球軌道半徑的 ', 'The star is really ') + sig(state.d * PC.AU_PER_PC, 3) + T(' 倍', ' times the orbit radius away'), b.x + 10, b.y + 32, '#94a3b8', 'left', 'middle', '10.5px ' + FONT);
    } else sText(g, T('拍照的日期', 'Photo dates'), b.x + 8, b.y + 12, '#cbd5e1', 'left', 'middle', '600 10.5px ' + FONT);
  }

  // ---------------------------------------------------------------------
  // 望遠鏡的視野
  // ---------------------------------------------------------------------
  /** 一年的視差／量測的視野範圍：包住 3 年的路徑（量測時也包住照片） */
  function fieldScale(withPhotos) {
    const s = star(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const add = function (x, y) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (let i = 0; i <= 300; i++) { const a = PC.apparent(s, T_MAX * i / 300); add(a.x, a.y); }
    if (withPhotos) state.photos.forEach(function (ph) { add(ph.x, ph.y); });
    const half = Math.max((x1 - x0) / 2, (y1 - y0) / 2, s.p * 0.6, 1e-7);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, half: half };
  }
  function fieldView(g, b, opts) {
    const r = Math.min(b.w, b.h) / 2 - 8, cx = b.x + b.w / 2, cy = b.y + b.h / 2 + 4;
    // 視野
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    const sg = g.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
    sg.addColorStop(0, C['px-space1']); sg.addColorStop(1, C['px-space0']);
    g.fillStyle = sg; g.fill(); g.clip();
    bgStars(g, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, 55);
    g.strokeStyle = 'rgba(148,163,184,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
    const s = star(), fs = fieldScale(opts.photos), k = r * 0.78 / fs.half;
    const X = function (v) { return cx + (v - fs.cx) * k; }, Y = function (v) { return cy - (v - fs.cy) * k; };
    // 三年的路徑
    g.strokeStyle = D.alpha(C['px-path'], 0.35); g.lineWidth = 1.4; g.beginPath();
    for (let i = 0; i <= 600; i++) { const a = PC.apparent(s, T_MAX * i / 600); if (i) g.lineTo(X(a.x), Y(a.y)); else g.moveTo(X(a.x), Y(a.y)); }
    g.stroke();
    // 自行的直線
    if (s.mux || s.muy) {
      g.strokeStyle = D.alpha(C['px-pm'], 0.7); g.setLineDash([5, 4]); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(s.mux * T_MAX), Y(s.muy * T_MAX)); g.stroke(); g.setLineDash([]);
    }
    if (!opts.photos) {
      // 走過的部分
      g.strokeStyle = C['px-path']; g.lineWidth = 2.4; g.beginPath();
      const n = Math.max(2, Math.round(state.t * 200));
      for (let i = 0; i <= n; i++) { const a = PC.apparent(s, state.t * i / n); if (i) g.lineTo(X(a.x), Y(a.y)); else g.moveTo(X(a.x), Y(a.y)); }
      g.stroke();
    } else {
      // 照片與誤差圈
      const sg2 = sigma() * k;
      state.photos.forEach(function (ph) {
        if (sg2 > 2) { g.strokeStyle = D.alpha(C['px-photo'], 0.45); g.lineWidth = 1; g.beginPath(); g.arc(X(ph.x), Y(ph.y), Math.min(sg2, 3 * r), 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = C['px-photo']; g.beginPath(); g.arc(X(ph.x), Y(ph.y), 3.2, 0, Math.PI * 2); g.fill();
      });
      // 解出來的路徑
      const f = fitNow();
      if (f) {
        g.strokeStyle = C['px-fit']; g.lineWidth = 2; g.beginPath();
        for (let i = 0; i <= 300; i++) { const t = T_MAX * i / 300, q = PC.pfactor(state.lam, state.beta, t), x = f.x0 + f.mux * t + f.p * q.x, y = f.y0 + f.muy * t + f.p * q.y; if (i) g.lineTo(X(x), Y(y)); else g.moveTo(X(x), Y(y)); }
        g.stroke();
      }
    }
    // 目前的位置
    const a = PC.apparent(s, state.t);
    D.ball(g, X(a.x), Y(a.y), 6, C['px-star'], { shadow: false, glow: 1 });
    if (opts.flash) { g.strokeStyle = 'rgba(255,255,255,' + opts.flash + ')'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r - 2, 0, Math.PI * 2); g.stroke(); }
    g.restore();
    // 框與比例尺
    g.strokeStyle = 'rgba(148,163,184,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    const bar = nice(fs.half * 0.5), bl = bar * k;
    const bx = b.x + b.w - 14 - bl, by = b.y + b.h - 12;
    g.strokeStyle = '#e2e8f0'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + bl, by); g.moveTo(bx, by - 4); g.lineTo(bx, by + 4); g.moveTo(bx + bl, by - 4); g.lineTo(bx + bl, by + 4); g.stroke();
    D.haloText(g, ang(bar, 2), bx + bl / 2, by - 11, C.text, 'center', 'middle', '700 11px ' + FONT);
    D.haloText(g, opts.title, b.x + 6, b.y + 10, C.text, 'left', 'middle', '700 12px ' + FONT);
    if (!opts.photos) D.haloText(g, T('← 黃經增加', '← ecliptic longitude'), b.x + 6, b.y + b.h - 12, C.muted, 'left', 'middle', '10px ' + FONT);
  }

  // ---------------------------------------------------------------------
  // 拉長基線
  // ---------------------------------------------------------------------
  function baseGeom(g, b) {
    spaceBox(g, b); bgStars(g, b, 30);
    const lb = Math.log10(state.B), frac = 0.08 + 0.82 * (lb + 4.5) / 6.801;
    const L = (b.w - 40) * frac, cx = b.x + b.w / 2, yb = b.y + b.h - 34, S = { x: cx, y: b.y + 58 };
    const A = { x: cx - L / 2, y: yb }, B2 = { x: cx + L / 2, y: yb };
    g.strokeStyle = D.alpha(C['px-star'], 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(S.x, S.y); g.lineTo(B2.x, B2.y); g.stroke();
    g.strokeStyle = 'rgba(226,232,240,0.6)'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B2.x, B2.y); g.stroke(); g.setLineDash([]);
    D.ball(g, A.x, A.y, 6, C['px-earth'], { shadow: false, glow: 0.4 });
    D.ball(g, B2.x, B2.y, 5, '#cbd5e1', { shadow: false, glow: 0.3 });
    D.ball(g, S.x, S.y, 6, C['px-star'], { shadow: false, glow: 0.9 });
    sText(g, 'B = ' + sigAU(state.B), cx, yb + 16, '#e2e8f0', 'center', 'middle', '700 11.5px ' + FONT);
    sText(g, T('觀測者 A', 'Observer A'), A.x, yb - 14, '#93c5fd', L < 140 ? 'right' : 'center', 'middle', '600 10.5px ' + FONT);
    sText(g, T('觀測者 B', 'Observer B'), B2.x, yb - 14, '#e2e8f0', L < 140 ? 'left' : 'center', 'middle', '600 10.5px ' + FONT);
    sText(g, starName() + '：' + pcTxt(state.d), S.x, S.y - 16, C['px-star'], 'center', 'middle', '700 11.5px ' + FONT);
    const a1 = Math.atan2(A.y - S.y, A.x - S.x), a2 = Math.atan2(B2.y - S.y, B2.x - S.x);
    g.strokeStyle = C['px-path']; g.lineWidth = 1.6; g.beginPath(); g.arc(S.x, S.y, 30, a2, a1); g.stroke();
    sText(g, 'θ = ' + ang(PC.baselineShift(state.B, state.d)), S.x, S.y + 46, C['px-path'], 'center', 'middle', '700 12px ' + FONT);
    sText(g, T('角度與距離都不是真實比例', 'Angles and distances not to scale'), b.x + 8, b.y + 12, '#94a3b8', 'left', 'middle', '10.5px ' + FONT);
  }
  function sigAU(B) { return B >= 0.1 ? sig(B, 3) + ' AU' : sig(B * PC.KM_PER_AU, 3) + ' km'; }
  /** 兩個觀測者看到的視野（固定 2 角分寬） */
  function baseField(g, b, who, title) {
    const r = Math.min(b.w, b.h) / 2 - 10, cx = b.x + b.w / 2, cy = b.y + b.h / 2 + 6, th = PC.baselineShift(state.B, state.d);
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    const sg = g.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
    sg.addColorStop(0, C['px-space1']); sg.addColorStop(1, C['px-space0']); g.fillStyle = sg; g.fill(); g.clip();
    bgStars(g, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, 55);
    const k = r / (FOV_BASE / 2), dx = (who === 'A' ? 1 : -1) * th / 2 * k;
    if (Math.abs(dx) < 3 * r) D.ball(g, cx + dx, cy, 5.5, C['px-star'], { shadow: false, glow: 1 });
    g.strokeStyle = 'rgba(148,163,184,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
    g.restore();
    g.strokeStyle = who === 'A' ? D.alpha(C['px-earth'], 0.9) : 'rgba(203,213,225,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    D.haloText(g, title, cx, b.y + 8, C.text, 'center', 'middle', '700 11.5px ' + FONT);
    if (Math.abs(dx) > r) D.haloText(g, T('恆星跑出視野了', 'The star is out of the field'), cx, cy + r * 0.5, C.text, 'center', 'middle', '600 11px ' + FONT);
  }
  function drawBaseline(g, W, H) {
    const narrow = W < 560, run = state.run.baseline;
    let geo, fa, fb;
    if (narrow) { geo = { x: 6, y: 6, w: W - 12, h: H * 0.44 }; const fy = H * 0.44 + 16, fh = H - fy - 26; fa = { x: 4, y: fy, w: W / 2 - 6, h: fh }; fb = { x: W / 2 + 2, y: fy, w: W / 2 - 6, h: fh }; }
    else { geo = { x: 6, y: 6, w: W * 0.46, h: H - 12 }; const fx = W * 0.46 + 16, fw = (W - fx - 8) / 2; fa = { x: fx, y: 18, w: fw, h: H - 60 }; fb = { x: fx + fw + 4, y: 18, w: fw, h: H - 60 }; }
    baseGeom(g, geo);
    if (run) {
      // 閃爍比對：同一個視野輪流放 A、B 的照片
      const which = Math.floor(run.u * 12) % 2 ? 'B' : 'A';
      const big = { x: fa.x, y: fa.y, w: fb.x + fb.w - fa.x, h: fa.h };
      baseField(g, big, which, T('閃爍比對：', 'Blink: ') + (which === 'A' ? T('觀測者 A', 'observer A') : T('觀測者 B', 'observer B')));
    } else {
      baseField(g, fa, 'A', T('觀測者 A 看到的', 'Seen by A'));
      baseField(g, fb, 'B', T('觀測者 B 看到的', 'Seen by B'));
    }
    D.haloText(g, T('望遠鏡視野寬 2 角分；背景的星遠到不會動', 'Field 2 arcmin wide; the background stars are too far to move'), (fa.x + fb.x + fb.w) / 2, H - 12, C.muted, 'center', 'middle', '10.5px ' + FONT);
  }

  // ---------------------------------------------------------------------
  // 主畫面
  // ---------------------------------------------------------------------
  function drawMain() {
    const W = cvSize.w, H = cvSize.h, g = ctx, narrow = W < 560;
    g.clearRect(0, 0, W, H);
    D.backdrop(g, W, H);
    if (state.mode === 'baseline') { drawBaseline(g, W, H); return; }
    const flash = state.flash > 0 ? state.flash : 0;
    if (state.mode === 'orbit') {
      if (narrow) { orbitView(g, { x: 6, y: 6, w: W - 12, h: H * 0.42 }, {}); fieldView(g, { x: 6, y: H * 0.42 + 14, w: W - 12, h: H * 0.58 - 22 }, { title: T('望遠鏡裡看到的', 'In the telescope') }); }
      else { orbitView(g, { x: 6, y: 6, w: W * 0.47, h: H - 12 }, {}); fieldView(g, { x: W * 0.47 + 14, y: 8, w: W * 0.53 - 22, h: H - 16 }, { title: T('望遠鏡裡看到的', 'In the telescope') }); }
      sTagDate(g, W);
    } else {
      const ob = narrow ? { x: 8, y: 8, w: 130, h: 120 } : { x: 8, y: 8, w: 170, h: 160 };
      fieldView(g, { x: 6, y: 6, w: W - 12, h: H - 12 }, { photos: true, flash: flash, title: '' });
      orbitView(g, ob, { small: true, photos: true });
      const f = fitNow();
      sTag(g, INST[state.inst] ? T(INST[state.inst].zh, INST[state.inst].en) : '', W - 10, 18, INST_COL[state.inst], 'right', '700 11.5px ' + FONT);
      sTag(g, T('照片 ', 'Photos ') + state.photos.length + (f ? '｜p = ' + angPm(f.p, f.sp) : ''), W - 10, 42, f ? C['px-fit'] : '#e2e8f0', 'right', '700 11.5px ' + FONT);
      sTag(g, dateTxt(state.t), W - 10, 66, '#e2e8f0', 'right', '600 11px ' + FONT);
      D.haloText(g, T('橘點：照片（圈是誤差）', 'Orange: photos (circles: errors)'), 10, H - 30, C.text, 'left', 'middle', '10.5px ' + FONT);
      D.haloText(g, T('青線：解出來的路徑', 'Cyan: the fitted path'), 10, H - 14, C.text, 'left', 'middle', '10.5px ' + FONT);
    }
  }
  function sTagDate(g, W) { sTag(g, dateTxt(state.t), W - 12, 20, '#e2e8f0', 'right', '700 11.5px ' + FONT); }

  // =====================================================================
  // 下方的圖
  // =====================================================================
  function frame0(W, H) { return { x0: 60, x1: W - 16, y0: 20, y1: H - 34 }; }
  function axisBox(g, Fm) { g.strokeStyle = D.alpha(C.text, 0.45); g.lineWidth = 1; g.strokeRect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); }
  function drawChart() {
    const g = gtx, W = grSize.w, H = grSize.h;
    g.clearRect(0, 0, W, H); D.backdrop(g, W, H);
    if (state.mode === 'orbit') { if (state.chart.orbit === 'a') chartShift(g, W, H); else chartPD(g, W, H); }
    else if (state.mode === 'measure') { if (state.chart.measure === 'a') chartMeas(g, W, H); else chartPD(g, W, H); }
    else chartBase(g, W, H);
  }
  /** 角度軸的單位：″、mas 或 µas */
  function angUnit(maxAbs) { return maxAbs >= 0.1 ? { f: 1, u: '″' } : maxAbs >= 1e-4 ? { f: 1000, u: 'mas' } : { f: 1e6, u: 'µas' }; }
  function linAxes(g, Fm, y0, y1, unit, xlab, ylab) {
    const yy = function (v) { return Fm.y1 - (v - y0) / (y1 - y0) * (Fm.y1 - Fm.y0); };
    const xx = function (t) { return Fm.x0 + t / T_MAX * (Fm.x1 - Fm.x0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    const st = nice((y1 - y0) / 4);
    for (let i = Math.ceil(y0 / st); i * st <= y1 + 1e-12 * st; i++) { const v = i * st, y = yy(v); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); D.haloText(g, sig(v * unit.f, 3).replace(/^−?0$/, '0'), Fm.x0 - 6, y, C.muted, 'right', 'middle', '10px ' + FONT); }
    for (let yr = 0; yr <= T_MAX; yr++) { const x = xx(yr); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); if (yr < T_MAX) D.haloText(g, T('第 ' + (yr + 1) + ' 年', 'Year ' + (yr + 1)), x + 4, Fm.y1 + 12, C.muted, 'left', 'middle', '10px ' + FONT); }
    D.haloText(g, xlab, (Fm.x0 + Fm.x1) / 2, Fm.y1 + 27, C.muted, 'center', 'middle', '600 10.5px ' + FONT);
    D.haloText(g, ylab + '（' + unit.u + '）', 6, 10, C.muted, 'left', 'middle', '600 10.5px ' + FONT);
    return { xx: xx, yy: yy };
  }
  /** 視差位移對時間 */
  function chartShift(g, W, H) {
    const Fm = frame0(W, H), s = star(), m = Math.max(s.p, 1e-9) * 1.2, unit = angUnit(s.p);
    const ax = linAxes(g, Fm, -m, m, unit, T('時間（只畫視差，不含自行）', 'Time (parallax only, no proper motion)'), T('位移', 'Shift'));
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    [['x', C['px-x']], ['y', C['px-y']]].forEach(function (q) {
      g.strokeStyle = q[1]; g.lineWidth = 2.2; g.beginPath();
      for (let i = 0; i <= 400; i++) { const t = T_MAX * i / 400, f = PC.pfactor(state.lam, state.beta, t), v = s.p * f[q[0]]; if (i) g.lineTo(ax.xx(t), ax.yy(v)); else g.moveTo(ax.xx(t), ax.yy(v)); }
      g.stroke();
    });
    g.restore();
    const x = ax.xx(state.t);
    g.strokeStyle = D.alpha(C.text, 0.5); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); g.setLineDash([]);
    const f = PC.pfactor(state.lam, state.beta, state.t);
    D.ball(g, x, ax.yy(s.p * f.x), 4.5, C['px-x'], { shadow: false });
    D.ball(g, x, ax.yy(s.p * f.y), 4.5, C['px-y'], { shadow: false });
    D.haloText(g, T('黃經方向 Δλ cos β', 'Longitude Δλ cos β'), Fm.x0 + 8, Fm.y0 + 10, C['px-x'], 'left', 'middle', '700 11px ' + FONT);
    D.haloText(g, T('黃緯方向 Δβ', 'Latitude Δβ'), Fm.x0 + 8, Fm.y0 + 26, C['px-y'], 'left', 'middle', '700 11px ' + FONT);
    axisBox(g, Fm);
  }
  /** 照片的位置對時間，和解出來的曲線 */
  function chartMeas(g, W, H) {
    const Fm = frame0(W, H), s = star(), f = fitNow(), ph = state.photos;
    let lo = 1e9, hi = -1e9;
    const tr = function (t, c) { const a = PC.apparent(s, t); return c === 'x' ? a.x : a.y; };
    for (let i = 0; i <= 100; i++) { const t = T_MAX * i / 100; ['x', 'y'].forEach(function (c) { const v = tr(t, c); lo = Math.min(lo, v); hi = Math.max(hi, v); }); }
    ph.forEach(function (q) { lo = Math.min(lo, q.x, q.y); hi = Math.max(hi, q.x, q.y); });
    const pad = Math.max((hi - lo) * 0.08, s.p * 0.3, 1e-9); lo -= pad; hi += pad;
    const unit = angUnit(Math.max(Math.abs(lo), Math.abs(hi)));
    const ax = linAxes(g, Fm, lo, hi, unit, T('拍照的時間', 'Time of the photo'), T('位置', 'Position'));
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    [['x', C['px-x']], ['y', C['px-y']]].forEach(function (q) {
      // 真實的路徑（虛線）
      g.strokeStyle = D.alpha(q[1], 0.45); g.lineWidth = 1.3; g.setLineDash([4, 4]); g.beginPath();
      for (let i = 0; i <= 300; i++) { const t = T_MAX * i / 300, v = tr(t, q[0]); if (i) g.lineTo(ax.xx(t), ax.yy(v)); else g.moveTo(ax.xx(t), ax.yy(v)); }
      g.stroke(); g.setLineDash([]);
      if (f) {
        g.strokeStyle = q[1]; g.lineWidth = 2.2; g.beginPath();
        for (let i = 0; i <= 300; i++) { const t = T_MAX * i / 300, pf = PC.pfactor(state.lam, state.beta, t), v = q[0] === 'x' ? f.x0 + f.mux * t + f.p * pf.x : f.y0 + f.muy * t + f.p * pf.y; if (i) g.lineTo(ax.xx(t), ax.yy(v)); else g.moveTo(ax.xx(t), ax.yy(v)); }
        g.stroke();
      }
      ph.forEach(function (p) {
        const x = ax.xx(p.t), y = ax.yy(p[q[0]]), e = Math.abs(ax.yy(p[q[0]] + p.sigma) - y);
        g.strokeStyle = D.alpha(q[1], 0.6); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y - e); g.lineTo(x, y + e); g.stroke();
        D.ball(g, x, y, 3.5, q[1], { shadow: false });
      });
    });
    g.restore();
    D.haloText(g, T('藍：黃經方向；紅：黃緯方向；虛線是真正的路徑', 'Blue: longitude; red: latitude; dashed: the true path'), Fm.x0 + 8, Fm.y0 + 10, C.muted, 'left', 'middle', '10.5px ' + FONT);
    if (!ph.length) D.haloText(g, T('還沒有照片', 'No photos yet'), (Fm.x0 + Fm.x1) / 2, (Fm.y0 + Fm.y1) / 2, C.muted, 'center', 'middle', '600 12px ' + FONT);
    axisBox(g, Fm);
  }
  /** 視差與距離（對數），各種儀器一張照片的誤差 */
  function chartPD(g, W, H) {
    const Fm = frame0(W, H), lx0 = 0, lx1 = 4, ly0 = -4, ly1 = 2;
    const xx = function (d) { return Fm.x0 + (Math.log10(d) - lx0) / (lx1 - lx0) * (Fm.x1 - Fm.x0); };
    const yy = function (p) { return Fm.y1 - (Math.log10(Math.max(1e-6, p)) - ly0) / (ly1 - ly0) * (Fm.y1 - Fm.y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    [1, 10, 100, 1000, 10000].forEach(function (d) { const x = xx(d); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); D.haloText(g, String(d), x, Fm.y1 + 12, C.muted, 'center', 'middle', '10px ' + FONT); });
    [1e-4, 1e-3, 0.01, 0.1, 1, 10, 100].forEach(function (p) { const y = yy(p); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); D.haloText(g, tickAng(p), Fm.x0 - 6, y, C.muted, 'right', 'middle', '10px ' + FONT); });
    D.haloText(g, T('距離（pc）', 'Distance (pc)'), (Fm.x0 + Fm.x1) / 2, Fm.y1 + 27, C.muted, 'center', 'middle', '600 10.5px ' + FONT);
    D.haloText(g, T('視差', 'Parallax'), 6, 10, C.muted, 'left', 'middle', '600 10.5px ' + FONT);
    // 各儀器一張照片的誤差
    PC.INSTRUMENTS.forEach(function (ins) {
      const y = yy(ins.sigma); g.strokeStyle = D.alpha(INST_COL[ins.id], 0.8); g.setLineDash([5, 4]); g.lineWidth = ins.id === state.inst && state.mode === 'measure' ? 2.2 : 1.2;
      g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); g.setLineDash([]);
      D.haloText(g, T(ins.zh.replace(/（.*$/, ''), ins.en.replace(/ \(.*$/, '')) + ' σ', Fm.x1 - 4, y - 7, INST_COL[ins.id], 'right', 'middle', '600 10px ' + FONT);
    });
    // p = 1/d
    g.strokeStyle = C['px-true']; g.lineWidth = 2.4; g.beginPath(); g.moveTo(xx(1), yy(1)); g.lineTo(xx(1e4), yy(1e-4)); g.stroke();
    D.haloText(g, 'd = 1/p', xx(3), yy(1 / 3) - 12, C['px-true'], 'left', 'middle', '700 11px ' + FONT);
    PC.STARS.forEach(function (s) {
      const x = xx(1 / s.p), y = yy(s.p);
      D.ball(g, x, y, 3.2, C['px-true'], { shadow: false });
    });
    // 目前的恆星與量到的值
    const x = xx(state.d), y = yy(1 / state.d);
    D.ball(g, x, y, 6, C['px-meas'], { shadow: false, ring: '#ffffff' });
    D.haloText(g, starName(), x + 9, y + 12, C['px-meas'], 'left', 'middle', '700 11px ' + FONT);
    if (state.mode === 'measure') {
      const f = fitNow();
      if (f && f.p > 0) {
        const xm = xx(Math.min(1e4, Math.max(1, 1 / f.p))), yt = yy(f.p + f.sp), yb = yy(Math.max(1e-6, f.p - f.sp));
        g.strokeStyle = C['px-fit']; g.lineWidth = 2; g.beginPath(); g.moveTo(xm, yt); g.lineTo(xm, yb); g.stroke();
        D.ball(g, xm, yy(f.p), 4.5, C['px-fit'], { shadow: false });
      }
    }
    axisBox(g, Fm);
  }
  /** 基線與角位移 */
  function chartBase(g, W, H) {
    const Fm = frame0(W, H), lx0 = -4.5, lx1 = 2.301, ly0 = -6, ly1 = 3;
    const xx = function (B) { return Fm.x0 + (Math.log10(B) - lx0) / (lx1 - lx0) * (Fm.x1 - Fm.x0); };
    const yy = function (th) { return Fm.y1 - (Math.log10(Math.max(1e-7, th)) - ly0) / (ly1 - ly0) * (Fm.y1 - Fm.y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    [1e-4, 1e-3, 0.01, 0.1, 1, 10, 100].forEach(function (B) { const x = xx(B); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); if (W >= 520 || [1e-4, 0.01, 1, 100].indexOf(B) >= 0) D.haloText(g, String(B), x, Fm.y1 + 12, C.muted, 'center', 'middle', '10px ' + FONT); });
    [1e-6, 1e-4, 0.01, 1, 100].forEach(function (th) { const y = yy(th); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); D.haloText(g, tickAng(th), Fm.x0 - 6, y, C.muted, 'right', 'middle', '10px ' + FONT); });
    D.haloText(g, T('基線 B（AU）', 'Baseline B (AU)'), (Fm.x0 + Fm.x1) / 2, Fm.y1 + 27, C.muted, 'center', 'middle', '600 10.5px ' + FONT);
    D.haloText(g, T('角位移 θ', 'Angular shift θ'), 6, 10, C.muted, 'left', 'middle', '600 10.5px ' + FONT);
    ['eye', 'bessel', 'gaia'].forEach(function (id) {
      const y = yy(INST[id].sigma); g.strokeStyle = D.alpha(INST_COL[id], 0.8); g.setLineDash([5, 4]); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); g.setLineDash([]);
      D.haloText(g, T(INST[id].zh.replace(/（.*$/, ''), INST[id].en.replace(/ \(.*$/, '')), Fm.x0 + 6, y - 7, INST_COL[id], 'left', 'middle', '600 10px ' + FONT);
    });
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    g.strokeStyle = C['px-path']; g.lineWidth = 2.4; g.beginPath(); g.moveTo(xx(3e-5), yy(3e-5 / state.d)); g.lineTo(xx(200), yy(200 / state.d)); g.stroke();
    g.restore();
    BASES.forEach(function (q) { D.ball(g, xx(q.B), yy(q.B / state.d), 3.5, C['px-path'], { shadow: false }); });
    const x = xx(state.B), y = yy(PC.baselineShift(state.B, state.d));
    D.ball(g, x, y, 6, C['px-meas'], { shadow: false, ring: '#ffffff' });
    D.haloText(g, 'θ = ' + ang(PC.baselineShift(state.B, state.d)), x + (x > Fm.x1 - 100 ? -9 : 9), y + 12, C['px-meas'], x > Fm.x1 - 100 ? 'right' : 'left', 'middle', '700 11px ' + FONT);
    axisBox(g, Fm);
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastFrame = 0;
  state.flash = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    const dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
    lastFrame = ts;
    const run = state.run[state.mode];
    if (run && run.playing) stepRun(dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.5);
    drawMain(); drawChart();
    if ((run && run.playing) || state.flash > 0) requestDraw(); else lastFrame = 0;
  }
  function sound() { const Ls = window.LabSound; return Ls && Ls.enabled() ? Ls : null; }
  const DUR = { orbit: 8, measure: 3, baseline: 4 };
  function startRun(kind) {
    acted();
    const m = state.mode, run = state.run[m];
    if (run && !run.done && !run.playing) { run.playing = true; updateButtons(); requestDraw(); return; }
    if (run && run.playing) return;
    if (m === 'measure' && kind !== 'burst') { takePhoto(); return; }
    const t0 = m === 'orbit' ? (state.t > T_MAX - 1 + 1e-9 ? 0 : state.t) : m === 'measure' ? Math.min(state.t, T_MAX - 2) : 0;
    state.run[m] = { u: 0, playing: true, done: false, t0: t0, shots: 0 };
    if (m === 'orbit') setStatus(T('地球繞太陽一圈，看恆星在望遠鏡裡畫出什麼……', 'The Earth goes once round the Sun; watch what the star draws in the telescope…'));
    else if (m === 'measure') setStatus(T('兩年內平均拍 12 張……', 'Twelve photos spread over two years…'));
    else setStatus(T('把兩張照片輪流快速切換（閃爍比對）……', 'Flicking quickly between the two photos (blink comparison)…'));
    updateButtons(); afterChange(true); requestDraw();
  }
  function stepRun(dt) {
    const m = state.mode, run = state.run[m];
    run.u = Math.min(1, run.u + dt / DUR[m]);
    if (m === 'orbit') { setT(run.t0 + run.u); }
    else if (m === 'measure') {
      const want = Math.min(12, Math.floor(run.u * 12 + 1e-9) + (run.u >= 1 ? 0 : 1));
      while (run.shots < want) { setT(run.t0 + 2 * run.shots / 11); addPhoto(); run.shots++; }
    } else {
      const k = Math.floor(run.u * 12); if (k !== run.k) { run.k = k; const snd = sound(); if (snd) snd.tone({ freq: k % 2 ? 660 : 880, dur: 0.05, type: 'triangle', gain: 0.03 }); }
    }
    if (run.u >= 1) finishRun();
  }
  function setT(t) { state.t = Math.max(0, Math.min(T_MAX, t)); setSlider(el.date, Math.round(state.t * 1e4) / 1e4); refreshOutputs(); updateReadouts(); }
  function finishRun() {
    const m = state.mode, run = state.run[m];
    run.u = 1; run.playing = false; run.done = true;
    const snd = sound();
    if (snd) { snd.tone({ freq: 1046, dur: 0.12, type: 'triangle', gain: 0.05 }); snd.tone({ freq: 1568, dur: 0.16, type: 'triangle', gain: 0.04, delay: 0.1 }); }
    if (m === 'orbit') {
      const s = star();
      setStatus(T('一年過去，恆星畫出一個橢圓：半長軸 ', 'A year has passed and the star has traced an ellipse: semi-major axis ') + ang(s.p) + T('，半短軸 ', ', semi-minor axis ') + ang(s.p * Math.abs(Math.sin(state.beta * Math.PI / 180))) + T('。', '.') + (s.mux || s.muy ? T('加上自行，就成了波浪線。', ' Add the proper motion and it becomes a wavy line.') : ''));
      state.run.orbit = null;
    } else if (m === 'measure') {
      state.run.measure = null;
      measureStatus();
    } else {
      setStatus(T('兩張照片裡，背景的星都在原地，只有 ', 'In the two photos the background stars stay put; only ') + starName() + T(' 跳了 ', ' jumps by ') + ang(PC.baselineShift(state.B, state.d)) + T('。', '.'));
      state.run.baseline = null;
    }
    updateButtons(); updateReadouts();
    const snap = snapshot(); snap.anim = false;
    emit('run', snap);
    afterChange(true);
  }
  function pauseRun() { const run = state.run[state.mode]; if (!run || run.done) return; run.playing = !run.playing; updateButtons(); afterChange(true); requestDraw(); }
  function cancelRuns() { state.run = { orbit: null, measure: null, baseline: null }; updateButtons(); }

  // ---------- 拍照 ----------
  function addPhoto() {
    state.photos.push(PC.photo(star(), state.t, sigma(), SEED, state.k));
    state.k++; state.flash = 1;
    const snd = sound(); if (snd) snd.noise({ dur: 0.05, gain: 0.12, filter: 3000 });
  }
  function takePhoto() {
    addPhoto();
    measureStatus();
    updateButtons(); updateReadouts();
    emit('run', snapshot());
    afterChange(true); requestDraw();
  }
  function measureStatus() {
    const f = fitNow(), n = state.photos.length;
    if (!f) { setStatus(n ? T('再多拍幾張，才能解出視差（至少 ', 'Take a few more photos to solve for the parallax (at least ') + (state.fitPM ? 3 : 2) + T(' 張）。', ').') : T('選好日期，按「拍一張」。', 'Choose a date and press “Take a photo”.')); return; }
    const rel = f.sp / Math.abs(f.p);
    if (f.p <= 0) setStatus(T('量出來的視差是負的：誤差比視差還大，這顆星對這台儀器來說太遠了。', 'The measured parallax is negative: the error is larger than the parallax, so the star is too far for this instrument.'));
    else if (rel > 1) setStatus(T('誤差比視差本身還大：量不到。第谷就是這樣，看不到任何恆星的視差。', 'The error is bigger than the parallax itself: no detection. That was Tycho’s problem.'));
    else setStatus(T('距離 ', 'Distance ') + pcTxt(1 / f.p) + ' ± ' + sig(rel * 100, 2) + ' %' + (state.fitPM && f.span < 1 ? T('；照片還沒跨滿一年，自行和視差不容易分開。', '; the photos span less than a year, so proper motion and parallax are hard to separate.') : T('。', '.')));
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function snapshot() {
    const s = star(), f = fitNow(), pf = PC.pfactor(state.lam, state.beta, state.t);
    let opp = PC.sunLon(state.t) - (state.lam + 180); opp = ((opp % 360) + 540) % 360 - 180;
    const ts = state.photos.map(function (q) { return q.t; });
    const run = state.run[state.mode];
    return {
      mode: state.mode, star: state.star || '', d: state.d, p: s.p, beta: state.beta, lam: state.lam, pm: !!(s.mux || s.muy), mu: Math.hypot(s.mux, s.muy),
      t: state.t, opp: opp, ellA: s.p, ellB: s.p * Math.abs(Math.sin(state.beta * Math.PI / 180)), nowX: s.p * pf.x, nowY: s.p * pf.y,
      inst: state.inst, sigma: sigma(), n: state.photos.length, span: ts.length ? Math.max.apply(null, ts) - Math.min.apply(null, ts) : 0, gap: ts.length === 2 ? Math.abs(ts[1] - ts[0]) : null, fitPM: state.fitPM,
      fp: f ? f.p : null, fsp: f ? f.sp : null, rel: f && f.p > 0 ? f.sp / f.p : null, err: f ? Math.abs(f.p / s.p - 1) : null,
      B: state.B, base: state.base || '', theta: PC.baselineShift(state.B, state.d), ratio: PC.baselineShift(state.B, state.d) / (2 * s.p),
      chart: state.chart[state.mode], anim: !!(run && run.playing)
    };
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
    setOut(el.dist, outNum(state.d, 0, state.d < 10 ? 3 : state.d < 100 ? 2 : 1));
    setOut(el.beta, num(state.beta, 1));
    setOut(el.date, num(state.t, 3));
    setOut(el.base, state.B < 0.001 ? sig(state.B, 3) : outNum(state.B, 0, state.B < 0.1 ? 5 : state.B < 10 ? 3 : 1));
    const pr = function (sel, attr, v) { document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); }); };
    pr('#modeSeg button', 'data-mode', state.mode);
    pr('#chartSeg button', 'data-chart', state.chart[state.mode]);
    pr('#starSeg button', 'data-s', state.star);
    pr('#pmSeg button', 'data-pm', state.pm ? 'on' : 'off');
    pr('#instSeg button', 'data-i', state.inst);
    pr('#fitSeg button', 'data-fit', state.fitPM ? 'pm' : 'p');
    pr('#baseSeg button', 'data-b', state.base);
    $('orbitPanel').hidden = state.mode !== 'orbit';
    $('measurePanel').hidden = state.mode !== 'measure';
    $('basePanel').hidden = state.mode !== 'baseline';
    $('dateCard').hidden = state.mode === 'baseline';
    $('burst').hidden = state.mode !== 'measure';
  }
  function chartNames() {
    const n = { orbit: [T('位移與時間', 'Shift over time'), T('視差與距離', 'Parallax and distance')], measure: [T('照片的位置', 'Photo positions'), T('視差與距離', 'Parallax and distance')], baseline: [T('基線與角位移', 'Baseline and shift'), ''] }[state.mode];
    const bs = document.querySelectorAll('#chartSeg button');
    bs[0].textContent = n[0]; bs[1].textContent = n[1]; bs[1].hidden = !n[1];
  }
  function updateReadouts() {
    chartNames();
    const s = star(), dd = PC.distOf(s.p);
    setHTML('starHint', starName() + T('：黃經 ', ': ecliptic longitude ') + num(state.lam, 1) + '°' + T('，', ', ') + T('視差 ', 'parallax ') + ang(s.p) + (state.star ? T('；自行每年 ', '; proper motion ') + ang(Math.hypot(STAR[state.star].mux, STAR[state.star].muy)) + T('', ' per year') : T('；自訂的恆星沒有自行', '; a custom star has no proper motion')));
    setHTML('dateHint', dateTxt(state.t) + T('；太陽在黃經 ', '; the Sun is at longitude ') + num(PC.sunLon(state.t), 1) + '°');
    if (state.mode === 'orbit') {
      const pf = PC.pfactor(state.lam, state.beta, state.t);
      setHTML('oP', 'p = ' + ang(s.p));
      setHTML('oD', pcTxt(dd.pc));
      setHTML('oLy', sci(dd.ly, 3) + T(' 光年', ' ly'));
      setHTML('oAu', sci(dd.au, 3) + ' AU');
      setHTML('oA', ang(s.p));
      setHTML('oB', ang(s.p * Math.abs(Math.sin(state.beta * Math.PI / 180))));
      setHTML('oMu', s.mux || s.muy ? ang(Math.hypot(s.mux, s.muy)) : '0');
      setHTML('oNow', '(' + ang(s.p * pf.x, 2) + T('，', ', ') + ang(s.p * pf.y, 2) + ')');
      setHTML('cvHint', T('左（手機在上）：從北黃極往下看地球軌道，恆星的方向是真的，但距離縮短了非常多倍；相隔半年的兩條視線張開 2p。右（手機在下）：望遠鏡裡，恆星相對於遙遠的背景星畫出視差橢圓（粉紅），綠色虛線是自行。按「播放一年」，或拖動日期。', 'Left (top on phones): the Earth’s orbit seen from above; the direction to the star is true but the distance is shrunk enormously, and the two sight lines half a year apart open by 2p. Right (bottom on phones): in the telescope the star traces its parallax ellipse (pink) against the distant background; the green dashed line is the proper motion. Press “Play a year” or drag the date.'));
      setHTML('chartHint', state.chart.orbit === 'a'
        ? T('位移在一年內來回一次：黃經方向的振幅是 p，黃緯方向是 p|sin β|。在黃道上（β = 0）黃緯方向完全不動。', 'The shift goes back and forth once a year: amplitude p along longitude and p|sin β| along latitude. On the ecliptic (β = 0) the latitude never changes.')
        : T('綠線是 d = 1/p，綠點是真實的恆星；虛線是各種儀器一張照片的誤差 σ。視差比 σ 小很多的恆星，要拍很多張才量得到。', 'Green: d = 1/p, with the real stars as dots; dashed: the error σ of one photo for each instrument. Stars whose parallax is much smaller than σ need many photos.'));
    } else if (state.mode === 'measure') {
      const f = fitNow(), n = state.photos.length, ts = state.photos.map(function (q) { return q.t; });
      setHTML('mN', String(n));
      setHTML('mSpan', n > 1 ? sig(Math.max.apply(null, ts) - Math.min.apply(null, ts), 3) + T(' 年', ' yr') : '—');
      setHTML('mP', f ? angPm(f.p, f.sp) : '—');
      setHTML('mD', f && f.p > 0 ? pcTxt(1 / f.p) : f ? T('量不到', 'Not detected') : '—');
      setHTML('mErr', f && f.p > 0 ? '± ' + sig(f.sp / f.p * 100, 2) + ' %' : '—');
      setHTML('mMu', f && state.fitPM ? ang(Math.hypot(f.mux, f.muy)) + T(' / 年', ' / yr') : '—');
      setHTML('mTrue', pcTxt(state.d) + T('（p = ', ' (p = ') + ang(s.p) + T('）', ')'));
      const ins = INST[state.inst];
      setHTML('instHint', T('一張照片的位置誤差 σ = ', 'Error of one photo: σ = ') + '<b>' + ang(ins.sigma) + '</b>' + T('，是這顆星視差的 ', ', which is ') + sig(ins.sigma / s.p, 2) + T(' 倍。', ' times the star’s parallax.'));
      setHTML('cvHint', T('望遠鏡的視野（放大到看得見）：選日期、按「拍一張」，或按「兩年拍 12 張」。照片越多、跨的時間越長，解出來的視差越準。左上角是地球拍照時在軌道上的位置。', 'The telescope field (magnified): choose a date and press “Take a photo”, or “12 photos over two years”. More photos over a longer time give a better parallax. Top left: where the Earth was for each photo.'));
      setHTML('chartHint', state.chart.measure === 'a'
        ? T('每個點是一張照片（直線是誤差 σ），實線是用最小平方法解出來的視差＋自行。', 'Each dot is a photo (bars: the error σ); solid lines are the least-squares fit of parallax and proper motion.')
        : T('青色是你量到的視差與誤差；綠線上的粉紅點是真正的值。', 'Cyan: your measured parallax with its error; the pink dot on the green line is the true value.'));
    } else {
      const th = PC.baselineShift(state.B, state.d);
      setHTML('bTheta', 'θ = ' + ang(th));
      setHTML('bB', sigAU(state.B) + (state.B < 0.1 ? '（' + sig(state.B, 3) + ' AU）' : ''));
      setHTML('bD', pcTxt(state.d));
      setHTML('bRatio', sig(th / (2 * s.p), 3) + T(' 倍', '×'));
      setHTML('bEye', th >= 60 ? T('看得出來（≥ 1 角分）', 'Yes (≥ 1 arcmin)') : T('看不出來（肉眼約 1 角分）', 'No (eye: about 1 arcmin)'));
      setHTML('baseHint', T('兩個觀測者同時拍照，基線和恆星方向垂直。θ（″）= B（AU）÷ d（pc）。', 'Both observers photograph at the same moment, with the baseline perpendicular to the star. θ (″) = B (AU) ÷ d (pc).'));
      setHTML('cvHint', T('兩個相距 B 的觀測者同時看同一顆恆星：它在背景前的位置差了 θ。按「閃爍比對」，在同一個視野輪流放兩張照片，會動的就是近的恆星。', 'Two observers a distance B apart look at the same star at the same time: against the background it appears shifted by θ. Press “Blink” to flick between the two photos in one field; the star that jumps is the nearby one.'));
      setHTML('chartHint', T('θ 和 B 成正比（斜率 1）。虛線是肉眼、貝索與 Gaia 的精度；新視野號的 47 AU 基線讓比鄰星跳了半角分以上。', 'θ is proportional to B (slope 1). Dashed: the precision of the eye, Bessel and Gaia; New Horizons’ 47 AU baseline made Proxima jump by more than half an arcminute.'));
    }
    cv.setAttribute('aria-label', starName() + '，' + pcTxt(state.d) + '，p = ' + ang(s.p));
  }
  function updateButtons() {
    const run = state.run[state.mode];
    const idle = { orbit: T('播放一年', 'Play a year'), measure: T('拍一張', 'Take a photo'), baseline: T('閃爍比對', 'Blink') }[state.mode];
    const busy = { orbit: T('播放中…', 'Playing…'), measure: T('拍照中…', 'Taking photos…'), baseline: T('閃爍中…', 'Blinking…') }[state.mode];
    $('go').textContent = run && !run.done ? (run.playing ? busy : T('繼續', 'Resume')) : idle;
    $('burst').textContent = T('兩年拍 12 張', '12 photos over two years');
    $('pause').disabled = !run || run.done || !run.playing;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function fillButtons() {
    const sb = $('starSeg'); sb.innerHTML = '';
    PC.STARS.forEach(function (s) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-s', s.id); b.textContent = T(s.zh, s.en);
      b.addEventListener('click', function () { acted(); pickStar(s.id); });
      sb.appendChild(b);
    });
    const ib = $('instSeg'); ib.innerHTML = '';
    PC.INSTRUMENTS.forEach(function (i) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-i', i.id); b.textContent = T(i.zh, i.en) + '：σ ' + ang(i.sigma, 2);
      b.addEventListener('click', function () { acted(); state.inst = i.id; clearPhotos(); setStatus(T(i.zh, i.en) + T('：每張照片的誤差 ', ': each photo has an error of ') + ang(i.sigma) + T('。', '.')); refreshOutputs(); afterChange(true); });
      ib.appendChild(b);
    });
    const bb = $('baseSeg'); bb.innerHTML = '';
    BASES.forEach(function (q) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-b', q.id); b.textContent = T(q.zh, q.en);
      b.addEventListener('click', function () { acted(); state.B = q.B; state.base = q.id; setSlider(el.base, q.B); cancelRuns(); refreshOutputs(); afterChange(true); });
      bb.appendChild(b);
    });
  }
  function pickStar(id) {
    const s = STAR[id];
    state.star = id; state.d = 1 / s.p; state.beta = s.beta; state.lam = s.lam;
    setSlider(el.dist, state.d); setSlider(el.beta, s.beta);
    clearPhotos(); cancelRuns();
    setStatus(T(s.zh, s.en) + T('：視差 ', ': parallax ') + ang(s.p) + T('，距離 ', ', distance ') + pcTxt(1 / s.p) + T('（', ' (') + sig(PC.distOf(s.p).ly, 3) + T(' 光年）。', ' light years).'));
    refreshOutputs(); afterChange(true);
  }
  function clearPhotos() { state.photos = []; state.k = 0; }

  // =====================================================================
  // 控制項
  // =====================================================================
  [el.dist, el.beta].forEach(function (inp) {
    inp.addEventListener('input', function () {
      if (quiet) return;
      acted(); readSliders(inp === el.dist ? 'd' : 'b'); state.star = ''; clearPhotos(); cancelRuns();
      refreshOutputs(); afterChange();
    });
  });
  el.date.addEventListener('input', function () { if (quiet) return; acted(); readSliders('t'); const r = state.run[state.mode]; if (r && state.mode === 'orbit') state.run.orbit = null; updateButtons(); refreshOutputs(); afterChange(); });
  el.base.addEventListener('input', function () { if (quiet) return; acted(); readSliders('B'); state.base = ''; cancelRuns(); refreshOutputs(); afterChange(); });
  [el.dist, el.beta, el.date, el.base].forEach(function (inp) { inp.addEventListener('change', function () { if (!quiet) afterChange(true); }); });
  document.querySelectorAll('#pmSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.pm = b.getAttribute('data-pm') === 'on'; clearPhotos(); cancelRuns(); refreshOutputs(); afterChange(true); }); });
  document.querySelectorAll('#fitSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.fitPM = b.getAttribute('data-fit') === 'pm'; refreshOutputs(); if (state.photos.length) measureStatus(); afterChange(true); }); });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.mode = b.getAttribute('data-mode');
      refreshOutputs(); updateButtons(); afterChange(true);
      if (state.mode === 'measure') measureStatus();
      else setStatus({
        orbit: T('按「播放一年」，看恆星在望遠鏡裡畫出視差橢圓。', 'Press “Play a year” and watch the star trace its parallax ellipse.'),
        baseline: T('選一條基線，按「閃爍比對」看恆星跳多少。', 'Choose a baseline and press “Blink” to see how far the star jumps.')
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
    acted(); cancelRuns(); clearPhotos();
    setStatus(T('已清除照片與動畫，設定不變。', 'Photos and animations cleared; the settings are kept.'));
    afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('實驗畫面。左右鍵改日期；上下鍵改距離（拉長基線時改基線）。按住 Shift 移動較多。', 'Experiment view. Left and right change the date; up and down change the distance (or the baseline). Hold Shift for bigger steps.'),
      items: [{
        name: function () { return T('日期與距離', 'Date and distance'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          acted();
          if (dx && state.mode !== 'baseline') setSlider(el.date, Math.max(0, Math.min(T_MAX, state.t + dx * (big ? 1 / 12 : 1 / 365.25))));
          if (dy) {
            if (state.mode === 'baseline') { setSlider(el.base, Math.max(3e-5, Math.min(200, state.B * Math.pow(10, dy * (big ? 0.2 : 0.02))))); state.base = ''; }
            else { setSlider(el.dist, Math.max(1, Math.min(1e4, state.d * Math.pow(10, dy * (big ? 0.2 : 0.02))))); state.star = ''; clearPhotos(); }
          }
          readSliders(dx && state.mode !== 'baseline' ? (dy ? 'tdB' : 't') : 'dB'); cancelRuns(); refreshOutputs(); afterChange();
          return true;
        },
        describe: function () { return state.mode === 'baseline' ? 'B ' + sigAU(state.B) + '，θ ' + ang(PC.baselineShift(state.B, state.d)) : dateTxt(state.t) + '，' + pcTxt(state.d); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  fillButtons();
  pickStar('proxima');
  state.acted = false;
  setSlider(el.date, 0); setSlider(el.base, 2);
  state.t = 0; state.B = 2;
  refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts();
  function themeChanged() { readColors(); fillButtons(); refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts(); requestDraw(); }
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
  setStatus(T('比鄰星：離我們最近的恆星，視差只有 0.768″。按「播放一年」看它畫出的橢圓。', 'Proxima Centauri, the nearest star: its parallax is only 0.768″. Press “Play a year” to see the ellipse it draws.'));
  requestDraw();
  // 測試用（Playwright）
  window.__px = {
    state: state, PC: PC, snapshot: snapshot, fit: fitNow,
    set: function (o) {
      acted();
      if (o.mode) state.mode = o.mode;
      if (o.star) pickStar(o.star);
      if (o.inst) { state.inst = o.inst; clearPhotos(); }
      if (o.pm != null) state.pm = !!o.pm;
      if (o.fitPM != null) state.fitPM = !!o.fitPM;
      const map = { d: el.dist, beta: el.beta, t: el.date, B: el.base };
      Object.keys(map).forEach(function (k) { if (o[k] != null) setSlider(map[k], o[k]); });
      readSliders((o.d != null ? 'd' : '') + (o.beta != null ? 'b' : '') + (o.t != null ? 't' : '') + (o.B != null ? 'B' : ''));
      if (o.d != null || o.beta != null) { state.star = ''; clearPhotos(); }
      if (o.B != null) state.base = '';
      if (o.chart) state.chart[state.mode] = o.chart;
      refreshOutputs(); updateButtons(); afterChange(true);
    },
    photo: function (t) { if (t != null) setT(t); takePhoto(); },
    finish: function () { if (!state.run[state.mode]) startRun(state.mode === 'measure' ? 'burst' : undefined); stepRun(1e6); requestDraw(); }
  };
})();
