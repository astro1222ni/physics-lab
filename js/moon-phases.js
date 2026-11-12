/* moon-phases.js — 「月相與日月食」的畫面與互動（物理計算全部在 moon-phases-core.js） */
(function () {
  'use strict';
  const K = window.MoonCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 本檔的版本號（?v=）：切換到 3D 時動態載入的 js/moon-phases-3d.js 沿用同一個版本號
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const DEG = K.DEG, TAU = K.TAU;
  const FONT = D.FONT;
  const RAD2MIN = 180 / Math.PI * 60;

  // ---------- 狀態 ----------
  const DEF = { doy: K.doyOf(9, 23), hour: 18.5, elong: 120, node: 100, peri: 30, rate: 1 };
  const state = {
    t: K.timeOf(0, DEF.doy, DEF.hour),
    el: null,
    running: !reducedMotion,
    rate: DEF.rate,              // 每秒（真實時間）經過的模擬時間（小時）
    frame: 'sun',                // 'sun'：太陽固定在右方；'star'：恆星方向固定
    trueScale: false,
    show: { names: true, shadow: true, inset: true },
    log: [],
    acted: false,                // 使用者操作過後才回報任務事件（預設狀態與自動播放不算）
    tween: null, demo: null, drag: null, hover: null,
    eclKey: '', fx: [],
    place: K.placeById('tw'),    // 觀測地點（預設臺灣：北緯 23.5°、東經 121°、UTC+8，與加入選單前完全相同）
    stdOff: 8                    // 這個地點的標準時間偏移（判斷是不是夏令時間）
  };
  let elVer = 0, placeVer = 0;
  function setEl(el) { state.el = el; elVer++; snapCache = null; }
  (function initEl() {
    let el = K.makeElements({});
    el = K.withNode(el, state.t, DEF.node * DEG);
    el = K.withPerigee(el, state.t, DEF.peri * DEG);
    el = K.placeElongation(el, state.t, DEF.elong * DEG);
    state.el = el;
  })();

  // ---------- 顏色 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface', '--pos', '--neg', '--equi', '--field', '--probe', '--b-astro', '--b-mech']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    if (!C['b-astro']) C['b-astro'] = C.accent;
    C.dark = D.dark;
    C.moon = C.dark ? '#c9c6bd' : '#a9a69c';
    C.copper = '#c4552d';
  }

  // ---------- 數字與文字 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function group(v) { return isFinite(v) ? Math.round(v).toLocaleString('en-US').replace(/,/g, ' ').replace('-', '−') : '—'; }
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(c) { return T(c.month + ' 月 ' + c.day + ' 日', MON_EN[c.month - 1] + ' ' + c.day); }
  function fmtClock(h) {
    let m = Math.round(((h % 24) + 24) % 24 * 60);
    if (m >= 1440) m -= 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  // ---------- 觀測地點與當地時間（模型時間 state.t 一律是 UTC+8；畫面上的日期、時刻都是所選地點的當地時間） ----------
  function plat() { return state.place.lat * DEG; }
  function plon() { return state.place.lon * DEG; }
  function isTW() { return state.place.id === 'tw'; }
  function placeName() { return T(state.place.zh, state.place.en); }
  function localT(t) { return K.localT(state.place, t); }
  function lcal(t) { return K.calendar(localT(t)); }
  function fmtLocalClock(t) { return fmtClock(lcal(t).hour); }
  /** UTC 偏移的寫法：UTC+8、UTC+5:30、UTC−4、UTC+0 */
  function utcText(o) {
    const a = Math.abs(o), h = Math.floor(a + 1e-9), m = Math.round((a - h) * 60);
    return 'UTC' + (o < 0 ? '−' : '+') + h + (m ? ':' + String(m).padStart(2, '0') : '');
  }
  function isDST(t) { return !!state.place.tz && K.utcOffset(state.place, t) > state.stdOff + 1e-9; }
  /** 目前的時區：「UTC−4，夏令時間」（short：「UTC−4 夏令」，畫布用） */
  function zoneText(t, short) {
    const s = utcText(K.utcOffset(state.place, t));
    if (!isDST(t)) return s;
    return s + (short ? T(' 夏令', ' DST') : T('，夏令時間', ', daylight saving time'));
  }
  function latText(v) { return v >= 0 ? T('北緯 ', '') + num(v, 2) + T('°', '° N') : T('南緯 ', '') + num(-v, 2) + T('°', '° S'); }
  function lonText(v) { return v >= 0 ? T('東經 ', '') + num(v, 2) + T('°', '° E') : T('西經 ', '') + num(-v, 2) + T('°', '° W'); }
  function fmtWhen(t) { const c = lcal(t); return fmtDate(c) + ' ' + fmtClock(c.hour); }
  function deg(v, d) { return num(v / DEG, d == null ? 1 : d) + '°'; }
  const DIR8 = function () { return [T('北', 'N'), T('東北', 'NE'), T('東', 'E'), T('東南', 'SE'), T('南', 'S'), T('西南', 'SW'), T('西', 'W'), T('西北', 'NW')]; };
  function azName(az) { return DIR8()[Math.round(K.norm(az) / (TAU / 8)) % 8]; }
  const PHASE_NAME = {
    new: ['新月（朔）', 'New moon'], waxC: ['眉月', 'Waxing crescent'], fq: ['上弦月', 'First quarter'], waxG: ['盈凸月', 'Waxing gibbous'],
    full: ['滿月（望）', 'Full moon'], wanG: ['虧凸月', 'Waning gibbous'], lq: ['下弦月', 'Last quarter'], wanC: ['殘月', 'Waning crescent']
  };
  function phaseName(key) { const p = PHASE_NAME[key]; return T(p[0], p[1]); }
  const LUNAR_NAME = { total: ['月全食', 'total lunar eclipse'], partial: ['月偏食', 'partial lunar eclipse'], penumbral: ['半影月食', 'penumbral lunar eclipse'] };
  const SOLAR_NAME = { total: ['日全食', 'total solar eclipse'], annular: ['日環食', 'annular solar eclipse'], partial: ['日偏食', 'partial solar eclipse'] };
  function eclName(kind, type, cap) {
    const n = (kind === 'lunar' ? LUNAR_NAME : SOLAR_NAME)[type];
    if (!n) return T('無', 'none');
    const s = T(n[0], n[1]);
    return cap ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  function setStatus(s) { $('status').textContent = s || ''; }
  const lastText = {};
  function setHTML(id, h) { if (lastText[id] !== h) { lastText[id] = h; $(id).innerHTML = h; } }

  // ---------- 由核心算出目前的一切（同一時刻只算一次） ----------
  let snapCache = null;
  function snap() {
    if (snapCache && snapCache.t === state.t && snapCache.v === elVer && snapCache.pv === placeVer) return snapCache;
    const t = state.t, el = state.el, la = plat(), lo = plon();
    const ph = K.phaseAt(el, t), m = ph.moon, s = ph.sun;
    const P = K.observer(t, la, lo);
    const hm = K.horizontal(m, t, la, lo), hs = K.horizontal(s, t, la, lo);
    const node = K.nodeLon(el, t), peri = K.periLon(el, t);
    const o = {
      t: t, v: elVer, pv: placeVer, ph: ph, m: m, s: s, P: P, hm: hm, hs: hs, node: node, peri: peri,
      lunar: K.lunarEclipse(m, s), solar: K.solarEclipse(m, s), loc: K.localSolar(m, s, P),
      ori: K.skyOrientation(el, t, la, lo), cal: lcal(t), key: K.phaseKey(ph.dLam),
      nodeDist: Math.min(Math.abs(K.wrapPi(m.u)), Math.abs(K.wrapPi(m.u - Math.PI))),
      sunNode: Math.min(Math.abs(K.wrapPi(s.lon - node)), Math.abs(K.wrapPi(s.lon - node - Math.PI))),
      dec: K.declination(m)
    };
    o.rising = K.horizontal(K.moonAt(el, t + 0.002), t + 0.002, la, lo).alt > hm.alt;
    snapCache = o;
    return o;
  }
  // 今天（當地時間 00:00–24:00；夏令時間切換那天是 23 或 25 小時）的升落與路徑：每天、每次改軌道或地點才重算
  let dayCache = null;
  function today() {
    const b = K.localDay(state.place, state.t), d0 = b.t0, span = b.t1 - b.t0;
    if (dayCache && dayCache.d0 === d0 && dayCache.v === elVer && dayCache.pv === placeVer) return dayCache;
    const el = state.el, la = plat(), lo = plon();
    const mr = K.riseSet(el, d0, 'moon', la, lo, span), sr = K.riseSet(el, d0, 'sun', la, lo, span);
    const mp = [], sp = [];
    for (let i = 0; i <= 96; i++) {
      const t = d0 + i / 96 * span;
      const a = K.horizontal(K.moonAt(el, t), t, la, lo), c = K.horizontal(K.sunAt(t), t, la, lo);
      mp.push([a.az, a.alt]); sp.push([c.az, c.alt]);
    }
    dayCache = { d0: d0, d1: b.t1, span: span, v: elVer, pv: placeVer, moon: mr, sun: sr, mp: mp, sp: sp };
    return dayCache;
  }
  /** 今天的升起、落下時刻（當地時間）；都沒有時說整天在地平線上或下 */
  function rsText(r, x, body) {
    if (x != null) return fmtLocalClock(x);
    if (r.rise == null && r.set == null) return r.upAll ? T('整天在地平線上', 'up all day') : T('整天在地平線下', 'down all day');
    return T('不發生', 'none');
  }
  function dayNote(day) {
    if (Math.abs(day.span * 24 - 24) < 0.01) return '';
    const h = Math.round(day.span * 24);
    return T('；這天因夏令時間調整，一天有 ' + h + ' 小時', '; this day has ' + h + ' hours (daylight saving change)');
  }
  let ageCache = { t: NaN, v: -1, age: 0 };
  function moonAge() {
    if (Math.abs(ageCache.t - state.t) < 1e-3 && ageCache.v === elVer) return ageCache.age;
    ageCache = { t: state.t, v: elVer, age: K.moonAge(state.el, state.t) };
    return ageCache.age;
  }

  // =====================================================================
  // 俯視圖（主畫布）
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let cw = 600, ch = 400, dpr = 1, L = null;
  function layoutTop() {
    const narrow = cw < 560;
    const H = narrow ? Math.round(cw * 1.16) : Math.round(Math.min(cw * 0.68, 600));
    const R0 = Math.min(cw, H) * (narrow ? 0.29 : 0.30);
    const mag = state.trueScale ? 1 : (narrow ? 10 : 8);
    const k = R0 / K.A_MOON;
    return {
      narrow: narrow, H: H, cx: cw * 0.5, cy: narrow ? H * 0.47 : H * 0.5 + 6, R0: R0, k: k, mag: mag,
      rE: K.R_EARTH * k * mag, rM: K.R_MOON * k * mag,
      f1: (narrow ? 11 : 12) + 'px ' + FONT, f2: '600 ' + (narrow ? 11 : 12) + 'px ' + FONT, f3: (narrow ? 10 : 11) + 'px ' + FONT
    };
  }
  function resizeTop() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layoutTop();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  function frameRot() { return state.frame === 'sun' ? K.sunLon(state.t) : 0; }
  /** 黃道座標（km）→ 俯視圖的螢幕座標 */
  function scr(x, y, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [L.cx + (x * c + y * s) * L.k, L.cy - (-x * s + y * c) * L.k];
  }
  /** 黃經 → 螢幕上的方向角（數學方向，y 向上） */
  function scrAngle(lon, rot) { return lon - rot; }
  function dirXY(a) { return [Math.cos(a), -Math.sin(a)]; }

  // 遠方恆星（純示意的背景點，固定在恆星座標裡：「太陽固定」時會隨時間慢慢轉）
  const STARS = (function () {
    let s = 7;
    const r = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const out = [];
    for (let i = 0; i < 90; i++) out.push({ a: r() * TAU, d: 0.15 + 0.85 * Math.sqrt(r()), m: r() });
    return out;
  })();

  function drawTop() {
    if (!L) return;
    const c = ctx, sn = snap(), rot = frameRot();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    // 遠方恆星
    const Rmax = Math.hypot(cw, ch) / 2;
    STARS.forEach(function (st) {
      const a = st.a - rot, x = L.cx + Math.cos(a) * st.d * Rmax, y = L.cy - Math.sin(a) * st.d * Rmax;
      if (x < 0 || y < 0 || x > cw || y > ch) return;
      c.fillStyle = D.alpha(C.text, (C.dark ? 0.22 : 0.13) + 0.2 * st.m);
      c.beginPath(); c.arc(x, y, 0.6 + 0.8 * st.m, 0, TAU); c.fill();
    });
    const aSun = scrAngle(sn.s.lon, rot);
    drawSunlight(c, aSun);
    if (state.show.shadow) drawShadows(c, sn, rot);
    drawOrbit(c, sn, rot);
    if (state.show.names) drawNames(c, sn, rot, aSun);
    drawDemo(c, sn, rot);
    drawEarth(c, sn, rot, aSun);
    drawMoonTop(c, sn, rot, aSun);
    if (state.show.inset) drawInset(c, sn);
    drawTopLabels(c, sn, rot);
    drawKbFocus(c);
  }

  function drawSunlight(c, a) {
    const u = dirXY(a);
    // 太陽：畫在畫面外（實際在 389 倍月地距離外），只露出光暈
    const far = Math.max(cw, ch) * 0.62;
    const sx = L.cx + u[0] * far, sy = L.cy + u[1] * far;
    const R = Math.min(cw, ch) * 0.16;
    const g = c.createRadialGradient(sx, sy, R * 0.2, sx, sy, R * 2.6);
    g.addColorStop(0, D.alpha(C.equi, C.dark ? 0.75 : 0.6));
    g.addColorStop(0.35, D.alpha(C.equi, C.dark ? 0.22 : 0.16));
    g.addColorStop(1, D.alpha(C.equi, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
    const gb = c.createRadialGradient(sx - R * 0.25, sy - R * 0.25, R * 0.1, sx, sy, R);
    gb.addColorStop(0, D.shade(C.equi, 0.75));
    gb.addColorStop(0.6, D.shade(C.equi, 0.25));
    gb.addColorStop(1, C.equi);
    c.fillStyle = gb;
    c.beginPath(); c.arc(sx, sy, R, 0, TAU); c.fill();
    // 平行的陽光
    const n = [-u[1], u[0]], half = Math.hypot(cw, ch) / 2;
    c.save();
    c.lineCap = 'round';
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const off = i * half / 3.4;
      const x0 = L.cx + n[0] * off + u[0] * half, y0 = L.cy + n[1] * off + u[1] * half;
      const x1 = L.cx + n[0] * off + u[0] * (L.R0 * 1.15), y1 = L.cy + n[1] * off + u[1] * (L.R0 * 1.15);
      const lg = c.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, D.alpha(C.equi, C.dark ? 0.34 : 0.3));
      lg.addColorStop(1, D.alpha(C.equi, 0));
      c.strokeStyle = lg;
      c.lineWidth = 1.2;
      c.setLineDash([2, 6]);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.restore();
  }

  /** 影子的多邊形：從 (ox, oy) 沿方向 u（螢幕單位向量）延伸；w(x) 為距離 x（km）處的半寬（px） */
  function conePoly(c, ox, oy, u, w0, wAt, xmax) {
    const n = [-u[1], u[0]], N = 12;
    c.beginPath();
    for (let i = 0; i <= N; i++) { const x = xmax * i / N, w = i === 0 ? w0 : wAt(x); c.lineTo(ox + u[0] * x * L.k + n[0] * w, oy + u[1] * x * L.k + n[1] * w); }
    for (let i = N; i >= 0; i--) { const x = xmax * i / N, w = i === 0 ? w0 : wAt(x); c.lineTo(ox + u[0] * x * L.k - n[0] * w, oy + u[1] * x * L.k - n[1] * w); }
    c.closePath();
  }
  function drawShadows(c, sn, rot) {
    const m = sn.m, s = sn.s, mag = L.mag;
    const diag = Math.hypot(cw, ch) / L.k;
    // 地球的影子：軸由地心指向背向太陽
    const aE = scrAngle(s.lon, rot) + Math.PI, uE = dirXY(aE);
    const D0 = K.len(s);
    const ink = function (a) { return D.shadowInk(a); };
    c.save();
    let g = c.createLinearGradient(L.cx, L.cy, L.cx + uE[0] * diag * L.k * 0.5, L.cy + uE[1] * diag * L.k * 0.5);
    g.addColorStop(0, ink(C.dark ? 0.2 : 0.1));
    g.addColorStop(1, ink(0.02));
    c.fillStyle = g;
    conePoly(c, L.cx, L.cy, uE, L.rE, function (x) { return mag * K.cone(K.R_SUN, K.R_EARTH, D0, x).rp * L.k; }, diag);
    c.fill();
    const cu = K.cone(K.R_SUN, K.R_EARTH, D0, 0);
    const xu = Math.min(cu.Lu, diag);
    g = c.createLinearGradient(L.cx, L.cy, L.cx + uE[0] * xu * L.k, L.cy + uE[1] * xu * L.k);
    g.addColorStop(0, ink(C.dark ? 0.5 : 0.3));
    g.addColorStop(1, ink(C.dark ? 0.32 : 0.18));
    c.fillStyle = g;
    conePoly(c, L.cx, L.cy, uE, L.rE, function (x) { return Math.max(0, mag * K.cone(K.R_SUN, K.R_EARTH, D0, x).ru * L.k); }, xu);
    c.fill();
    // 月球的影子：軸由太陽經過月球
    const ax = K.unit(K.sub(m, s));
    const aM = Math.atan2(ax.y, ax.x) - rot, uM = dirXY(aM);
    const pm = scr(m.x, m.y, rot), Dms = K.len(K.sub(m, s));
    const miss = sn.solar.type === 'none' && Math.cos(sn.ph.dLam) > 0.5;
    const cm = K.cone(K.R_SUN, K.R_MOON, Dms, 0);
    c.globalAlpha = miss ? 0.45 : 1;
    g = c.createLinearGradient(pm[0], pm[1], pm[0] + uM[0] * K.A_MOON * 1.3 * L.k, pm[1] + uM[1] * K.A_MOON * 1.3 * L.k);
    g.addColorStop(0, ink(C.dark ? 0.16 : 0.09));
    g.addColorStop(1, ink(0.01));
    c.fillStyle = g;
    conePoly(c, pm[0], pm[1], uM, L.rM, function (x) { return mag * K.cone(K.R_SUN, K.R_MOON, Dms, x).rp * L.k; }, K.A_MOON * 1.3);
    c.fill();
    c.fillStyle = ink(C.dark ? 0.42 : 0.26);
    conePoly(c, pm[0], pm[1], uM, L.rM, function (x) { return Math.max(0, mag * K.cone(K.R_SUN, K.R_MOON, Dms, x).ru * L.k); }, cm.Lu);
    c.fill();
    c.restore();
  }

  function orbitPts(sn, rot, N) {
    const out = [];
    for (let i = 0; i <= N; i++) {
      const u = TAU * i / N, p = K.orbitPoint(state.el, state.t, u), q = scr(p.x, p.y, rot);
      out.push([q[0], q[1], u, p.z]);
    }
    return out;
  }
  function drawOrbit(c, sn, rot) {
    const pts = orbitPts(sn, rot, 240);
    const up = pts.filter(function (p) { return p[2] <= Math.PI + 1e-9; });
    const dn = pts.filter(function (p) { return p[2] >= Math.PI - 1e-9; });
    c.save();
    c.lineCap = 'round';
    c.setLineDash([5, 5]);
    c.strokeStyle = D.alpha(C.muted, C.dark ? 0.75 : 0.7);
    c.lineWidth = 1.6;
    c.beginPath(); dn.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
    c.restore();
    D.tube(c, function (g) { up.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); }, C.accent, L.narrow ? 3.4 : 3.8);
    // 交點線
    const A = K.orbitPoint(state.el, state.t, 0), B = K.orbitPoint(state.el, state.t, Math.PI);
    const pa = scr(A.x, A.y, rot), pb = scr(B.x, B.y, rot);
    c.save();
    c.setLineDash([3, 5]);
    c.strokeStyle = D.alpha(C['b-astro'], 0.75);
    c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(pa[0], pa[1]); c.lineTo(pb[0], pb[1]); c.stroke();
    c.restore();
    // 近地點、遠地點
    const om = sn.peri - sn.node;
    const Pp = K.orbitPoint(state.el, state.t, om), Pa = K.orbitPoint(state.el, state.t, om + Math.PI);
    const pp = scr(Pp.x, Pp.y, rot), pq = scr(Pa.x, Pa.y, rot);
    const hp = state.hover === 'peri' || (state.drag && state.drag.type === 'peri');
    diamond(c, pq[0], pq[1], 4, D.alpha(C.muted, 0.9), false);
    diamond(c, pp[0], pp[1], hp ? 7.5 : 6, C.equi, true);
    L.handles = { asc: pa, desc: pb, peri: pp, apo: pq };
    nodeHandle(c, pa[0], pa[1], true, state.hover === 'asc' || (state.drag && state.drag.type === 'asc'));
    nodeHandle(c, pb[0], pb[1], false, state.hover === 'desc' || (state.drag && state.drag.type === 'desc'));
  }
  function diamond(c, x, y, r, col, rim) {
    c.save();
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath();
    c.fillStyle = col; c.fill();
    if (rim) { c.strokeStyle = D.alpha(C.surface, 0.9); c.lineWidth = 1.2; c.stroke(); }
    c.restore();
  }
  function nodeHandle(c, x, y, asc, hot) {
    const r = hot ? 9 : 7.5;
    if (hot) { c.fillStyle = D.alpha(C['b-astro'], 0.18); c.beginPath(); c.arc(x, y, r + 6, 0, TAU); c.fill(); }
    D.ball(c, x, y, r, C['b-astro'], { glow: 0 });
    c.save();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.8;
    c.lineCap = 'round'; c.lineJoin = 'round';
    const s = asc ? -1 : 1;
    c.beginPath(); c.moveTo(x - 3.2, y - s * 1.6); c.lineTo(x, y + s * 1.8); c.lineTo(x + 3.2, y - s * 1.6);
    c.stroke();
    c.restore();
  }

  /** 從地球看的月相小圖示（北半球習慣：盈月右邊亮） */
  function phaseIcon(c, x, y, r, dLam) {
    const lit = (1 - Math.cos(dLam)) / 2;
    c.save();
    c.fillStyle = D.shade(C.moon, -0.55);
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    const waxing = Math.sin(dLam) >= 0, s = waxing ? 1 : -1;
    const kx = 1 - 2 * lit; // 明暗界線的橢圓半軸比
    c.beginPath();
    c.arc(x, y, r, -Math.PI / 2, Math.PI / 2, s < 0);
    c.ellipse(x, y, Math.abs(kx) * r, r, 0, Math.PI / 2, -Math.PI / 2, (kx > 0) === (s > 0));
    c.closePath();
    c.fillStyle = D.shade(C.moon, 0.35);
    c.fill();
    c.strokeStyle = D.alpha(C.text, 0.25);
    c.lineWidth = 0.8;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    c.restore();
  }
  function drawNames(c, sn, rot, aSun) {
    const R = L.R0 * (L.narrow ? 1.36 : 1.3), ir = L.narrow ? 6 : 7.5;
    const keys = ['new', 'waxC', 'fq', 'waxG', 'full', 'wanG', 'lq', 'wanC'];
    for (let i = 0; i < 8; i++) {
      const a = aSun + i * Math.PI / 4, u = dirXY(a);
      const x = L.cx + u[0] * R, y = L.cy + u[1] * R;
      if (x < 8 || x > cw - 8 || y < 8 || y > ch - 8) continue;
      phaseIcon(c, x, y, ir, i * Math.PI / 4);
      const nm = phaseName(keys[i]).replace(/（.*）/, '');
      const ly = y + (u[1] > 0.3 ? ir + 13 : u[1] < -0.3 ? -ir - 4 : ir + 13);
      const lx = Math.max(30, Math.min(cw - 30, x));
      // 月球的名牌在附近時，讓位（只留小圖示）
      const mp = scr(sn.m.x, sn.m.y, rot), mr = Math.hypot(mp[0] - L.cx, mp[1] - L.cy) || 1, mo = Math.max(L.rM, 3) + 16;
      const mlx = mp[0] + (mp[0] - L.cx) / mr * mo, mly = mp[1] + (mp[1] - L.cy) / mr * mo;
      if (Math.abs(lx - mlx) < 58 && Math.abs(ly - 4 - mly) < 20) continue;
      D.haloText(c, nm, lx, ly, C.muted, 'center', 'alphabetic', L.f3);
    }
  }

  function drawEarth(c, sn, rot, aSun) {
    const x = L.cx, y = L.cy, r = Math.max(L.rE, 2.2);
    const earth = C.neg;
    if (r < 5) {
      D.ball(c, x, y, r, earth, { glow: 0.2 });
      return;
    }
    // 球體
    c.save();
    c.shadowColor = C.dark ? 'rgba(0,0,0,0.5)' : D.alpha(C.text, 0.25);
    c.shadowBlur = 8;
    c.fillStyle = earth;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.restore();
    const u = dirXY(aSun);
    const g = c.createRadialGradient(x + u[0] * r * 0.45, y + u[1] * r * 0.45, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, D.shade(earth, 0.55));
    g.addColorStop(0.55, D.shade(earth, 0.1));
    g.addColorStop(1, D.shade(earth, -0.3));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
    // 緯線（赤道、北回歸線）與經線：由地球自轉算出，從黃道北極往下看
    const th = K.lst(state.t, K.LON_TW) - K.LON_TW; // 格林威治恆星時
    const proj = function (lat, lon) {
      const q = K.eqToEcl(K.v3(Math.cos(lat) * Math.cos(lon + th), Math.cos(lat) * Math.sin(lon + th), Math.sin(lat)));
      const p = scr(q.x * K.A_MOON, q.y * K.A_MOON, rot);
      return [x + (p[0] - L.cx) * r / L.R0, y + (p[1] - L.cy) * r / L.R0, q.z];
    };
    const line = function (pts, col, w, dash) {
      c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []);
      c.beginPath();
      let pen = false;
      pts.forEach(function (p) { if (p[2] > 0) { if (pen) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); pen = true; } else pen = false; });
      c.stroke();
    };
    const lat = function (phi) { const a = []; for (let i = 0; i <= 72; i++) a.push(proj(phi, i * TAU / 72)); return a; };
    line(lat(0), D.alpha('#ffffff', 0.45), 1);
    line(lat(K.LAT_TW), D.alpha('#ffffff', 0.35), 0.9, [2, 2]);
    for (let k = 0; k < 6; k++) {
      const a = []; for (let i = 0; i <= 24; i++) a.push(proj(-Math.PI / 2 + Math.PI * i / 24, k * Math.PI / 3));
      line(a, D.alpha('#ffffff', 0.18), 0.8);
    }
    c.setLineDash([]);
    // 夜半球
    const n = [-u[1], u[0]];
    c.fillStyle = 'rgba(5,10,25,0.55)';
    c.beginPath();
    c.moveTo(x + n[0] * r * 1.1, y + n[1] * r * 1.1);
    c.lineTo(x + n[0] * r * 1.1 - u[0] * r * 1.2, y + n[1] * r * 1.1 - u[1] * r * 1.2);
    c.lineTo(x - n[0] * r * 1.1 - u[0] * r * 1.2, y - n[1] * r * 1.1 - u[1] * r * 1.2);
    c.lineTo(x - n[0] * r * 1.1, y - n[1] * r * 1.1);
    c.closePath(); c.fill();
    // 北極
    const np = proj(Math.PI / 2, 0);
    c.fillStyle = D.alpha('#ffffff', 0.75);
    c.beginPath(); c.arc(np[0], np[1], 1.6, 0, TAU); c.fill();
    c.restore();
    c.strokeStyle = D.alpha(C.surface, C.dark ? 0.35 : 0.8);
    c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    // 觀測地點（預設臺灣）
    const tw = proj(plat(), plon());
    L.tw = tw;
    if (tw[2] > -0.02) {
      c.fillStyle = C.pos;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.2;
      c.beginPath(); c.arc(tw[0], tw[1], 3.2, 0, TAU); c.fill(); c.stroke();
    } else {
      // 在地球背面（從黃道北極看不到）：只畫空心圈
      c.strokeStyle = D.alpha(C.pos, 0.85);
      c.lineWidth = 1.4;
      c.setLineDash([2, 2]);
      c.beginPath(); c.arc(tw[0], tw[1], 3.2, 0, TAU); c.stroke();
      c.setLineDash([]);
    }
  }

  function drawMoonTop(c, sn, rot, aSun) {
    const p = scr(sn.m.x, sn.m.y, rot), r = Math.max(L.rM, 1.6);
    L.moonP = p;
    const hot = state.hover === 'moon' || (state.drag && state.drag.type === 'moon');
    if (hot || L.rM < 3) {
      c.save();
      c.strokeStyle = D.alpha(C.accent, hot ? 0.75 : 0.5);
      c.lineWidth = 1.4;
      c.beginPath(); c.arc(p[0], p[1], Math.max(r + 5, 9), 0, TAU); c.stroke();
      c.restore();
    }
    // 投影
    c.save();
    c.shadowColor = C.dark ? 'rgba(0,0,0,0.55)' : D.alpha(C.text, 0.3);
    c.shadowBlur = 6; c.shadowOffsetY = 1.5;
    c.fillStyle = D.shade(C.moon, -0.55);
    c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.fill();
    c.restore();
    // 朝太陽的半球是亮的（俯視時明暗界線是一條直線）
    const sa = Math.atan2(-(sn.s.y - sn.m.y) * 0 + 0, 1); // 占位，下面直接用太陽方向
    void sa;
    const toSun = K.sub(sn.s, sn.m), a = Math.atan2(toSun.y, toSun.x) - rot;
    const u = dirXY(a);
    const ecl = sn.lunar.type;
    let lit = C.moon;
    if (ecl === 'total') lit = C.copper;
    else if (ecl === 'partial') lit = D.mix(C.moon, C.copper, 0.5);
    else if (ecl === 'penumbral') lit = D.shade(C.moon, -0.15);
    const g = c.createRadialGradient(p[0] + u[0] * r * 0.4, p[1] + u[1] * r * 0.4, r * 0.1, p[0], p[1], r);
    g.addColorStop(0, D.shade(lit, 0.6));
    g.addColorStop(1, lit);
    c.fillStyle = g;
    c.beginPath();
    c.arc(p[0], p[1], r, -a - Math.PI / 2, -a + Math.PI / 2);
    c.closePath();
    c.fill();
    c.strokeStyle = D.alpha(C.surface, C.dark ? 0.4 : 0.85);
    c.lineWidth = 0.9;
    c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.stroke();
  }

  function drawTopLabels(c, sn, rot) {
    const f2 = L.f2, f3 = L.f3;
    // 月球
    const p = L.moonP, ur = [p[0] - L.cx, p[1] - L.cy], ul = Math.hypot(ur[0], ur[1]) || 1;
    const off = Math.max(L.rM, 3) + 16;
    D.pill(c, T('月球', 'Moon'), p[0] + ur[0] / ul * off, p[1] + ur[1] / ul * off + 8, C.text, 'center', f2);
    // 交點與近地點（放在軌道內側，避開外圈的月相名稱）
    const H = L.handles;
    const inward = function (q, txt, col) {
      const v = [L.cx - q[0], L.cy - q[1]], d = Math.hypot(v[0], v[1]) || 1;
      D.pill(c, txt, q[0] + v[0] / d * 22, q[1] + v[1] / d * 22 + 8, col, 'center', f3);
    };
    inward(H.asc, T('升交點', 'Asc. node'), C['b-astro']);
    inward(H.desc, T('降交點', 'Desc. node'), C['b-astro']);
    if (!L.narrow) {
      inward(H.peri, T('近地點', 'Perigee'), C.equi);
      inward(H.apo, T('遠地點', 'Apogee'), C.muted);
    }
    // 地球、觀測地點（南半球的地點在俯視圖中位於地球背面：空心圈、文字變淡）
    if (L.rE >= 5 && L.tw) {
      const v = [L.tw[0] - L.cx, L.tw[1] - L.cy], d = Math.hypot(v[0], v[1]) || 1;
      const back = L.tw[2] <= -0.02;
      D.haloText(c, back ? placeName() + T('（在背面）', ' (far side)') : placeName(), L.tw[0] + v[0] / d * 10, L.tw[1] + v[1] / d * 10 + 4, back ? D.alpha(C.pos, 0.75) : C.pos, v[0] >= 0 ? 'left' : 'right', 'alphabetic', '600 ' + f3);
    } else {
      D.pill(c, T('地球', 'Earth'), L.cx, L.cy - Math.max(L.rE, 3) - 6, C.neg, 'center', f2);
    }
    // 月球「看起來」在影子裡，但其實沒有月食：說明原因
    const lu = sn.lunar;
    if (state.show.shadow && lu.x > 0 && lu.type === 'none') {
      const inPlane = Math.hypot(lu.off.x, lu.off.y);
      if (inPlane < L.mag * (lu.rp + K.R_MOON)) {
        const b = sn.m.lat / DEG;
        let msg;
        if (Math.abs(lu.off.z) > lu.rp + K.R_MOON) msg = T('從上面看像在影子裡，其實月球在影子' + (b > 0 ? '上方' : '下方') + '（黃緯 ' + num(b, 1) + '°）', 'Looks shadowed from above, but the Moon passes ' + (b > 0 ? 'above' : 'below') + ' it (latitude ' + num(b, 1) + '°)');
        else msg = T('影子與月球都放大了，實際上月球還沒進入影子', 'Sizes are enlarged: the Moon is not in the shadow yet');
        D.pill(c, msg, Math.max(8, Math.min(cw - 8, p[0])), p[1] - off - 6, C.muted, p[0] < cw * 0.3 ? 'left' : p[0] > cw * 0.7 ? 'right' : 'center', f3);
      }
    }
    // 太陽方向的說明
    const aS = scrAngle(sn.s.lon, rot), us = dirXY(aS);
    const ex = L.cx + us[0] * L.R0 * 1.55, ey = L.cy + us[1] * L.R0 * 1.55;
    const sunTxt = L.narrow ? T('陽光 →（太陽在 389 倍遠處）', 'Sunlight → (Sun 389× farther)') : T('陽光（太陽在 1.5 億 km 外，是月地距離的 389 倍）', 'Sunlight (the Sun is 150 million km away, 389× the Moon’s distance)');
    if (state.frame === 'sun') D.pill(c, sunTxt, cw - 8, L.narrow ? ch - 32 : ch - 10, D.shade(C.equi, C.dark ? 0.2 : -0.35), 'right', f3);
    else D.pill(c, T('太陽方向', 'To the Sun'), Math.max(40, Math.min(cw - 40, ex)), Math.max(22, Math.min(ch - 8, ey)), D.shade(C.equi, C.dark ? 0.2 : -0.35), 'center', f3);
    // 比例說明
    const scaleTxt = state.trueScale ? (L.narrow ? T('真實比例', 'True scale') : T('真實比例：地球、月球與距離都依比例', 'True scale: sizes and distances to scale'))
      : L.narrow ? T('尺寸未按比例：大小放大 ' + L.mag + ' 倍', 'Not to scale: sizes ×' + L.mag)
        : T('尺寸未按比例：地球、月球與影子寬度放大 ' + L.mag + ' 倍（距離依比例）', 'Not to scale: Earth, Moon and shadow widths ×' + L.mag + ' (distances to scale)');
    D.pill(c, scaleTxt, 8, ch - (state.frame === 'sun' && !L.narrow ? 32 : 10), state.trueScale ? C.accent : C.muted, 'left', f3);
    // 參考方向
    const fr = L.narrow ? (state.frame === 'sun' ? T('太陽固定在右方', 'Sun fixed on the right') : T('恆星方向固定', 'Stars fixed'))
      : state.frame === 'sun' ? T('太陽固定在右方（地球每天繞太陽約 1°，背景星空慢慢轉）', 'Sun fixed on the right (the stars turn about 1° a day)') : T('恆星方向固定（從黃道北極往下看）', 'Stars fixed (looking down from the ecliptic north pole)');
    if (!L.narrow || !state.show.inset) D.pill(c, fr, cw - 8, 22, C.muted, 'right', f3);
    // 時間
    D.pill(c, fmtWhen(state.t), state.show.inset ? cw - 8 : 8, state.show.inset ? (L.narrow ? 22 : 46) : 22, C.text, state.show.inset ? 'right' : 'left', f2);
  }

  /** 左上角：地球繞太陽的小圖（恆星方向固定） */
  function drawInset(c, sn) {
    const B = L.narrow ? 112 : 150, x0 = 8, y0 = 8;
    D.roundRect(c, x0, y0, B, B, 10);
    c.fillStyle = D.alpha(C.surface, C.dark ? 0.82 : 0.88);
    c.fill();
    c.strokeStyle = D.alpha(C.border, 1);
    c.lineWidth = 1;
    c.stroke();
    const cx = x0 + B / 2, cy = y0 + B / 2 + 7, rI = B * 0.3;
    c.save();
    c.setLineDash([2, 3]);
    c.strokeStyle = D.alpha(C.muted, 0.55);
    c.beginPath(); c.arc(cx, cy, rI, 0, TAU); c.stroke();
    c.restore();
    D.ball(c, cx, cy, 5.5, C.equi, { glow: 0.5 });
    const lE = sn.s.lon + Math.PI;
    // 「+1 恆星月／朔望月」：出發時的地球位置與走過的弧
    if (state.demo) {
      const l0 = state.demo.sun0 + Math.PI;
      c.save();
      c.strokeStyle = D.alpha(C.neg, 0.7);
      c.lineWidth = 2.2;
      c.beginPath(); c.arc(cx, cy, rI, -lE, -l0, K.wrapPi(lE - l0) < 0); c.stroke();
      c.restore();
      D.ball(c, cx + Math.cos(l0) * rI, cy - Math.sin(l0) * rI, 3, D.alpha(C.neg, 0.5), { glow: 0, shadow: false });
      const sl = state.demo.lon0;
      const ex = cx + Math.cos(l0) * rI, ey = cy - Math.sin(l0) * rI;
      c.save(); c.setLineDash([2, 3]); c.strokeStyle = D.alpha(C['b-astro'], 0.8); c.lineWidth = 1;
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(sl) * B, ey - Math.sin(sl) * B); c.stroke();
      const qx = cx + Math.cos(lE) * rI, qy = cy - Math.sin(lE) * rI;
      c.beginPath(); c.moveTo(qx, qy); c.lineTo(qx + Math.cos(sl) * B, qy - Math.sin(sl) * B); c.stroke();
      c.restore();
    }
    const ex = cx + Math.cos(lE) * rI, ey = cy - Math.sin(lE) * rI;
    c.save();
    c.strokeStyle = D.alpha(C.accent, 0.6);
    c.lineWidth = 1;
    c.beginPath(); c.arc(ex, ey, 10, 0, TAU); c.stroke();
    c.restore();
    D.ball(c, ex, ey, 4, C.neg, { glow: 0 });
    const lm = sn.m.lon;
    D.ball(c, ex + Math.cos(lm) * 10, ey - Math.sin(lm) * 10, 2.2, C.moon, { glow: 0, shadow: false });
    c.save();
    c.beginPath(); D.roundRect(c, x0, y0, B, B, 10); c.clip();
    D.haloText(c, T('地球繞太陽', 'Earth around the Sun'), x0 + 8, y0 + 16, C.text, 'left', 'alphabetic', '600 ' + L.f3);
    D.haloText(c, T('（月球軌道放大）', '(Moon’s orbit enlarged)'), x0 + 8, y0 + B - 7, C.muted, 'left', 'alphabetic', L.f3);
    c.restore();
  }

  /** 「+1 恆星月」「+1 朔望月」的比較標記 */
  function drawDemo(c, sn, rot) {
    const d = state.demo;
    if (!d) return;
    const a = d.lon0 - rot, u = dirXY(a);
    const R1 = L.R0 * 1.12;
    c.save();
    c.setLineDash([4, 5]);
    c.strokeStyle = D.alpha(C['b-astro'], 0.85);
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(L.cx + u[0] * L.rE, L.cy + u[1] * L.rE); c.lineTo(L.cx + u[0] * L.R0 * 1.5, L.cy + u[1] * L.R0 * 1.5); c.stroke();
    c.restore();
    star4(c, L.cx + u[0] * L.R0 * 1.55, L.cy + u[1] * L.R0 * 1.55, 7, C['b-astro']);
    if (!d.done) return;
    // 弧：恆星月 → 還差多少到同一月相；朔望月 → 比恆星月多走多少
    const aMoon = sn.m.lon - rot;
    const aTarget = d.kind === 'sid' ? sn.s.lon + d.dLam0 - rot : a;
    let from = aMoon, to = aTarget;
    if (d.kind === 'syn') { from = a; to = aMoon; }
    const sweep = K.norm(to - from);
    c.save();
    c.strokeStyle = C['b-mech'];
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    c.beginPath(); c.arc(L.cx, L.cy, R1, -from, -from - sweep, true); c.stroke();
    const ue = dirXY(from + sweep), n = [-ue[1], ue[0]];
    const tx = L.cx + ue[0] * R1, ty = L.cy + ue[1] * R1;
    c.fillStyle = C['b-mech'];
    c.beginPath(); c.moveTo(tx - n[0] * 7, ty - n[1] * 7); c.lineTo(tx + ue[0] * 4 - n[0] * 0, ty + ue[1] * 4); c.lineTo(tx + ue[0] * -4, ty + ue[1] * -4); c.closePath(); c.fill();
    c.restore();
    const mid = dirXY(from + sweep / 2);
    let lx = L.cx + mid[0] * R1 * 1.22, ly = L.cy + mid[1] * R1 * 1.22 + 8;
    // 弧很短時，標籤會壓到「月球」名牌：改放到軌道內側
    const p = L.moonP, ur = [p[0] - L.cx, p[1] - L.cy], ul = Math.hypot(ur[0], ur[1]) || 1, off = Math.max(L.rM, 3) + 16;
    const mx = p[0] + ur[0] / ul * off, my = p[1] + ur[1] / ul * off + 8;
    c.save(); c.font = L.f2;
    const wD = c.measureText(d.label).width + 18, wM = c.measureText(T('月球', 'Moon')).width + 18;
    c.restore();
    if (Math.abs(ly - my) < 26 && Math.abs(lx - mx) < (wD + wM) / 2 + 6) {
      lx = L.cx + mid[0] * L.R0 * 0.62; ly = L.cy + mid[1] * L.R0 * 0.62 + 8;
    }
    D.pill(c, d.label, Math.max(wD / 2 + 4, Math.min(cw - wD / 2 - 4, lx)), Math.max(24, Math.min(ch - 10, ly)), D.shade(C['b-mech'], C.dark ? 0.1 : -0.2), 'center', L.f2);
  }
  function star4(c, x, y, r, col) {
    c.save();
    c.fillStyle = col;
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.32 : r; c.lineTo(x + Math.cos(a) * rr, y - Math.sin(a) * rr); }
    c.closePath(); c.fill();
    c.restore();
  }

  // =====================================================================
  // 雜訊（地球示意圖的雲、天空全景的地面輪廓、日冕的光芒用；月面不用）
  // =====================================================================
  function hash3(i, j, k) {
    let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    let r = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    }
    return r;
  }
  function fbm(x, y, z, oct) {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
    return s;
  }
  // =====================================================================
  // 月面：真實的月面影像
  //   NASA 月球勘測軌道器（LRO）廣角相機（LROC WAC）的彩色月面圖，取自 NASA 科學視覺化工作室（SVS）
  //   「CGI Moon Kit」2019 年版 lroc_color_poles（https://svs.gsfc.nasa.gov/4720/），NASA 製作，公有領域。
  //   影像是等距長方投影：經度 −180°～180°（經度 0 在正中央、東經在右），緯度 90°～−90°（北在上）。
  //   月球同步自轉：經度 0、緯度 0 的近側永遠朝向地球，以正射投影畫成球；本模擬不計天平動。
  // =====================================================================
  const MOON_IMG = ['img/moon/lroc-color-2048.webp', 'img/moon/lroc-color-1024.jpg']; // 第二張給不支援 webp 的瀏覽器
  const moonImg = { el: null, levels: null, waiters: [] };
  const diskCache = new Map();
  (function loadMoonImage(i) {
    if (i >= MOON_IMG.length) return;   // 都載入失敗：月面畫成均勻的灰色（明暗與月相照樣正確）
    const im = new Image();
    im.decoding = 'async';
    im.onload = function () {
      moonImg.el = im; moonImg.levels = null; diskCache.clear();
      moonKey = ''; skyKey = '';
      moonImg.waiters.splice(0).forEach(function (f) { f(im); });
      requestDraw();
    };
    im.onerror = function () { loadMoonImage(i + 1); };
    im.src = MOON_IMG[i];
  })(0);
  /** 月面影像載入後呼叫 f(影像)（已載入就立刻呼叫）；3D 檢視的貼圖用 */
  function whenMoonImage(f) { if (moonImg.el) f(moonImg.el); else moonImg.waiters.push(f); }
  /** 影像的像素，縮成寬 1024、512、256、128 四層（畫小月亮時取小的一層，避免鋸齒） */
  function moonLevels() {
    if (moonImg.levels || !moonImg.el) return moonImg.levels;
    const out = [];
    try {
      let src = moonImg.el, w = Math.min(1024, moonImg.el.naturalWidth || 1024);
      while (w >= 128) {
        const c = document.createElement('canvas');
        c.width = w; c.height = w / 2;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, w, w / 2);
        out.push({ w: w, h: w / 2, px: g.getImageData(0, 0, w, w / 2).data });
        src = c; w /= 2;
      }
    } catch (e) { out.length = 0; }
    moonImg.levels = out;
    return out;
  }
  /**
   * 近側月面的正射投影（S×S 像素；rot = 月球北極在畫面上的角度 − 90°）：每個像素的顏色（0–1，RGB）與朝向觀者的分量 mz（圓外為 −1）。
   * 月面座標：x 東、y 北、z 朝向地球；經度 = atan2(x, z)、緯度 = asin(y)。只在大小或方向改變時重算。
   */
  function moonDisk(S, rot) {
    const key = S + '|' + rot.toFixed(4);
    const hit = diskCache.get(key);
    if (hit) return hit;
    const lv = moonLevels();
    let L0 = null;
    if (lv && lv.length) {
      L0 = lv[0];
      for (let i = lv.length - 1; i >= 0; i--) if (lv[i].w >= Math.PI * S) { L0 = lv[i]; break; }
    }
    const n = S * S, alb = new Float32Array(n * 3), mzA = new Float32Array(n);
    const cr = Math.cos(rot), sr = Math.sin(rot), half = S / 2;
    for (let j = 0; j < S; j++) {
      const v = 1 - (j + 0.5) / half;
      for (let i = 0; i < S; i++) {
        const u = (i + 0.5) / half - 1, r2 = u * u + v * v, k = j * S + i;
        if (r2 > 1) { mzA[k] = -1; continue; }
        const mx = u * cr + v * sr, my = -u * sr + v * cr, mz = Math.sqrt(1 - r2);
        mzA[k] = mz;
        if (!L0) { alb[3 * k] = alb[3 * k + 1] = alb[3 * k + 2] = 0.62; continue; }
        // 經緯度 → 影像座標，雙線性內插（經度方向首尾相接、緯度方向夾在邊上）
        const lon = Math.atan2(mx, mz), lat = Math.asin(my > 1 ? 1 : my < -1 ? -1 : my);
        const W = L0.w, H = L0.h, P = L0.px;
        const x = (lon / TAU + 0.5) * W - 0.5, y = (0.5 - lat / Math.PI) * H - 0.5;
        let x0 = Math.floor(x), y0 = Math.floor(y);
        const fx = x - x0, fy = y - y0;
        let x1 = x0 + 1, y1 = y0 + 1;
        x0 = (x0 + W) % W; x1 = x1 % W;
        y0 = y0 < 0 ? 0 : y0 >= H ? H - 1 : y0; y1 = y1 < 0 ? 0 : y1 >= H ? H - 1 : y1;
        const a = 4 * (y0 * W + x0), b = 4 * (y0 * W + x1), c2 = 4 * (y1 * W + x0), d = 4 * (y1 * W + x1);
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        for (let ch = 0; ch < 3; ch++) alb[3 * k + ch] = (P[a + ch] * w00 + P[b + ch] * w10 + P[c2 + ch] * w01 + P[d + ch] * w11) / 255;
      }
    }
    const out = { S: S, alb: alb, mz: mzA, real: !!L0 };
    if (diskCache.size > 6) diskCache.clear();
    diskCache.set(key, out);
    return out;
  }
  /** 近側月面的固定方向：北半球與赤道上月球北極朝上；南半球（面向北方看）月球南極朝上。同一個地點不隨時間旋轉 */
  function moonFaceRot() { return state.place.lat < 0 ? Math.PI : 0; }
  const MOON_GAIN = 1.08;   // 影像亮度 → 畫面亮度（滿月時亮的高地約 190／255，不會過曝）
  /**
   * 畫出月面（逐點）。o：{ R（px）, dpr, rot（月球北極在螢幕上的角度 − 90°；固定，見 moonFaceRot）, L（太陽方向，月面座標 x 東 y 北 z 朝觀者）,
   *   es（地球照 0–1）, ecl：{ lut, ru, x, m, a, E3, N3 }（月食時月面各點離地影軸的距離）, bg：背景色 [r,g,b] 或 null }
   */
  const moonBuf = document.createElement('canvas');
  function renderMoon(o) {
    const S = Math.max(8, Math.min(384, Math.round(o.R * 2 * o.dpr)));
    const disk = moonDisk(S, o.rot), AL = disk.alb, MZ = disk.mz;
    if (moonBuf.width !== S) { moonBuf.width = S; moonBuf.height = S; }
    const g = moonBuf.getContext('2d');
    const img = g.createImageData(S, S), px = img.data;
    const cr = Math.cos(o.rot), sr = Math.sin(o.rot);
    const Lx = o.L[0], Ly = o.L[1], Lz = o.L[2];
    const half = S / 2;
    const ecl = o.ecl;
    const bg = o.bg;
    const G255 = 255 * MOON_GAIN;
    for (let j = 0; j < S; j++) {
      const v = 1 - (j + 0.5) / half;
      for (let i = 0; i < S; i++) {
        const k = j * S + i, k4 = 4 * k, mz = MZ[k];
        if (mz < 0) { px[k4 + 3] = 0; continue; }
        const u = (i + 0.5) / half - 1;
        const mx = u * cr + v * sr, my = -u * sr + v * cr;
        const ar = AL[3 * k], ag = AL[3 * k + 1], ab = AL[3 * k + 2];
        const mu0 = mx * Lx + my * Ly + mz * Lz;
        let b = 0;
        if (mu0 > 0) {
          b = 2 * mu0 / (mu0 + mz + 1e-6); // Lommel–Seeliger：滿月時整個圓面一樣亮
          if (b > 1.35) b = 1.35;
          b *= Math.min(1, mu0 / 0.035);
        }
        let wr = b, wg = b, wb = b;
        if (ecl && b > 0) {
          const qx = ecl.m.x + K.R_MOON * (mx * ecl.E3.x + my * ecl.N3.x);
          const qy = ecl.m.y + K.R_MOON * (mx * ecl.E3.y + my * ecl.N3.y);
          const qz = ecl.m.z + K.R_MOON * (mx * ecl.E3.z + my * ecl.N3.z);
          const ax = qx * ecl.a.x + qy * ecl.a.y + qz * ecl.a.z;
          const rho = Math.sqrt(Math.max(0, qx * qx + qy * qy + qz * qz - ax * ax));
          const li = rho / ecl.step;
          const i0 = Math.min(ecl.lut.length - 2, Math.floor(li)), fr = Math.min(1, li - i0);
          const vis = ecl.lut[i0] * (1 - fr) + ecl.lut[i0 + 1] * fr;
          // 進入本影的光：被地球大氣折射、只剩紅光（亮度調高以便看見）
          const red = ecl.red * (1 - vis) * (rho < ecl.ru * 1.25 ? 0.45 + 0.55 * Math.min(1, rho / ecl.ru) : Math.max(0, 1 - (rho - ecl.ru * 1.25) / (ecl.ru * 0.6)));
          // 顯示時取平方根（像眼睛適應亮度一樣），半影裡的部分才看得出來
          const vd = Math.sqrt(vis);
          wr = b * (vd + red * 1.0); wg = b * (vd + red * 0.36); wb = b * (vd + red * 0.17);
        }
        // 地球照：暗面極淡的微光（亮度已放大，否則看不見）
        const es = o.es * (1 - Math.min(1, b * 8)) * 0.14;
        let R = G255 * ar * wr + 150 * ar * es, G = G255 * ag * wg + 165 * ag * es, Bc = G255 * ab * wb + 190 * ab * es;
        let A = 255;
        if (bg) { R += bg[0]; G += bg[1]; Bc += bg[2]; }
        // 邊緣反鋸齒
        const edge = (1 - Math.sqrt(1 - mz * mz)) * half;
        if (edge < 1) A = Math.max(0, edge) * 255;
        px[k4] = R > 255 ? 255 : R; px[k4 + 1] = G > 255 ? 255 : G; px[k4 + 2] = Bc > 255 ? 255 : Bc; px[k4 + 3] = A;
      }
    }
    g.putImageData(img, 0, 0);
    return moonBuf;
  }
  /** 月食時月面各點的亮度查表：在月球所在的距離，垂直影軸的距離 ρ → 看得到的太陽比例 */
  function eclipseInfo(sn, viewer) {
    const lu = sn.lunar;
    if (!(lu.x > 0) || lu.d - K.R_MOON > lu.rp * 1.02) return null;
    const a = lu.axis, n = 96, maxR = lu.rp + 2.2 * K.R_MOON, step = maxR / n;
    let perp = K.cross(a, K.v3(0, 0, 1));
    if (K.len(perp) < 1e-6) perp = K.v3(1, 0, 0);
    perp = K.unit(perp);
    const lut = new Float32Array(n + 2);
    for (let i = 0; i <= n + 1; i++) {
      const q = K.add(K.mul(a, lu.x), K.mul(perp, i * step));
      lut[i] = K.sunVisibleFrom(q, sn.s, K.v3(0, 0, 0), K.R_EARTH);
    }
    const f = K.unit(K.sub(sn.m, viewer));
    let N3 = K.sub(K.v3(0, 0, 1), K.mul(f, f.z));
    N3 = K.unit(N3);
    const E3 = K.cross(f, N3);
    return { lut: lut, step: step, ru: Math.max(1, lu.ru), m: sn.m, a: a, E3: E3, N3: N3, red: 0.75 };
  }
  /** 月面座標（x 東、y 北、z 朝觀者）中的太陽方向（物理核心計算，只和亮邊相對月球北極的角度有關） */
  const sunInMoonFrame = K.sunInMoonFrame;

  // ---------- 天空的顏色（真實天空的顏色，依太陽高度） ----------
  function lerp(a, b, u) { return a + (b - a) * u; }
  function lerp3(p, q, u) { return [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)]; }
  const SKY = [ // [太陽高度°, 天頂色, 地平線色]
    [-90, [5, 8, 18], [11, 16, 32]],
    [-18, [6, 10, 24], [14, 22, 44]],
    [-12, [12, 22, 50], [34, 44, 86]],
    [-6, [28, 52, 102], [196, 120, 92]],
    [0, [52, 92, 158], [240, 170, 112]],
    [8, [62, 122, 200], [178, 206, 232]],
    [90, [52, 118, 206], [166, 204, 238]]
  ];
  function skyColors(sunAlt) {
    const h = sunAlt / DEG;
    for (let i = 1; i < SKY.length; i++) {
      if (h <= SKY[i][0]) {
        const u = (h - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
        return [lerp3(SKY[i - 1][1], SKY[i][1], u), lerp3(SKY[i - 1][2], SKY[i][2], u)];
      }
    }
    return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
  }
  function rgbStr(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  /** 高度 alt 處的天空顏色（地平線到天頂內插） */
  function skyAt(alt, cols) { const u = Math.max(0, Math.min(1, Math.pow(Math.max(0, alt) / (Math.PI / 2), 0.6))); return lerp3(cols[1], cols[0], u); }

  // =====================================================================
  // 從地球看到的月亮（近照）
  // =====================================================================
  const mcv = $('moonCv'), mctx = mcv.getContext('2d');
  let mw = 300, mh = 300, mdpr = 1;
  function resizeMoon() {
    const w = mcv.clientWidth;
    if (!w) return;
    mdpr = Math.min(window.devicePixelRatio || 1, 2);
    mw = w; mh = Math.round(Math.min(340, Math.max(240, w * 0.86)));
    mcv.style.height = mh + 'px';
    mcv.width = Math.round(mw * mdpr); mcv.height = Math.round(mh * mdpr);
    moonKey = '';
    requestDraw();
  }
  let moonKey = '', moonLast = 0;
  function drawMoonView(force) {
    const c = mctx, sn = snap();
    const se = sn.solar;
    const solarView = se.type !== 'none';
    const R = Math.min(mw, mh) * 0.34;
    const cx = mw / 2, cy = mh / 2 + 8;
    // 背景：月亮所在高度的天空顏色（在地平線下時用夜空）
    const cols = skyColors(sn.hs.alt);
    const up = sn.hm.alt > 0;
    const key = [Math.round(sn.t * 2880), elVer, mw, mh, C.dark, solarView, LabSettingsKey()].join('|');
    const now = performance.now();
    if (!force && key === moonKey) return;
    if (!force && (state.running || state.tween) && now - moonLast < 45) return;
    moonKey = key; moonLast = now;
    c.setTransform(mdpr, 0, 0, mdpr, 0, 0);
    let bgc = up ? skyAt(sn.hm.alt, cols) : [10, 14, 26];
    if (solarView) bgc = solarSkyColor(sn);
    const g = c.createRadialGradient(cx, cy, R * 0.6, cx, cy, Math.hypot(mw, mh) * 0.6);
    g.addColorStop(0, rgbStr(lerp3(bgc, [255, 255, 255], 0.04)));
    g.addColorStop(1, rgbStr(lerp3(bgc, [0, 0, 0], 0.25)));
    c.fillStyle = g;
    c.fillRect(0, 0, mw, mh);
    const f2 = '600 12px ' + FONT, f3 = '11px ' + FONT;
    setHTML('moonCap', moonCapText(solarView));
    if (solarView) { drawSolarCloseup(c, sn, cx, cy, R, f2, f3); return; }
    // 月面：近側固定朝向地球，畫面方向固定（月球北極朝上；南半球南極朝上），不隨時間旋轉。
    // 太陽方向換算到月面座標（只和亮邊相對月球北極的角度有關），所以明暗界線落在月面上的位置是正確的。
    const ori = sn.ori;
    const Lm = sunInMoonFrame(sn.ph.phaseAngle, ori.limb, ori.north);
    const ecl = eclipseInfo(sn, sn.P);
    const dayBg = up && sn.hs.alt > -4 * DEG ? bgc.map(function (v) { return v * 0.85; }) : null;
    const img = renderMoon({ R: R, dpr: mdpr, rot: moonFaceRot(), L: Lm, es: (1 + Math.cos(sn.ph.psi)) / 2, ecl: ecl, bg: dayBg });
    if (!dayBg) {
      // 夜空：月亮外圍的光暈
      const lit = sn.ph.illum;
      const gl = c.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.9);
      gl.addColorStop(0, 'rgba(220,225,235,' + (0.12 * lit) + ')');
      gl.addColorStop(1, 'rgba(220,225,235,0)');
      c.fillStyle = gl;
      c.fillRect(0, 0, mw, mh);
    }
    c.imageSmoothingEnabled = true;
    c.drawImage(img, cx - R, cy - R, 2 * R, 2 * R);
    // 標籤
    const name = phaseName(sn.key);
    D.pill(c, name + T('・照亮 ', ' · lit ') + num(sn.ph.illum * 100, 1) + '%', 10, 26, C.text, 'left', f2);
    let note = '';
    if (sn.lunar.type !== 'none') note = eclName('lunar', sn.lunar.type, true) + (sn.lunar.type === 'total' ? T('：月球在地球本影中，呈紅銅色', ': copper red in the Earth’s umbra') : '');
    else if (!up) note = T('月亮現在在' + placeName() + '的地平線下（高度 ', 'The Moon is below the horizon at ' + placeName() + ' now (altitude ') + num(sn.hm.alt / DEG, 1) + '°）'.replace('）', T('）', ')'));
    if (note) D.pill(c, note, 10, mh - 10, sn.lunar.type !== 'none' ? C.pos : C.muted, 'left', f3);
    // 畫面上方是月球的哪一極（方向固定）
    arrowUp(c, mw - 30, 44, state.place.lat < 0 ? T('月球南極', 'Lunar S') : T('月球北極', 'Lunar N'));
  }
  /** 近照的說明：月面方向固定；日食時改成從日食最大的地點看、天頂朝上 */
  function moonCapText(solarView) {
    const nm = placeName();
    if (solarView) return T('<b>從地球看到的月亮</b>——日食：從日食最大的地點看，天頂朝上', '<b>The Moon seen from the Earth</b> — solar eclipse, seen where it is greatest, zenith up');
    return state.place.lat < 0
      ? T('<b>從地球看到的月亮</b>——從' + nm + '看（南半球面向北方，月球南極朝上）；同步自轉，近側永遠朝向地球', '<b>The Moon seen from the Earth</b> — from ' + nm + ' (southern hemisphere, facing north: lunar south up); it always keeps the same near side toward the Earth')
      : T('<b>從地球看到的月亮</b>——從' + nm + '看，月球北極朝上；同步自轉，近側永遠朝向地球', '<b>The Moon seen from the Earth</b> — from ' + nm + ', lunar north up; it always keeps the same near side toward the Earth');
  }
  function LabSettingsKey() { return window.LabSettings ? window.LabSettings.lang + (window.LabSettings.get('fs') || 1) : ''; }
  /** 深色天空上的文字：白字加深色描邊（淺色模式的 haloText 描邊是白色，會糊成一團） */
  function nightText(c, txt, x, y, color, align, base, font) {
    c.save();
    c.font = font; c.textAlign = align; c.textBaseline = base || 'alphabetic'; c.lineJoin = 'round';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.strokeText(txt, x, y);
    c.fillStyle = color;
    c.fillText(txt, x, y);
    c.restore();
  }
  function arrowUp(c, x, y, txt) {
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x, y + 14); c.lineTo(x, y - 6); c.stroke();
    c.beginPath(); c.moveTo(x, y - 11); c.lineTo(x - 4, y - 4); c.lineTo(x + 4, y - 4); c.closePath(); c.fill();
    c.restore();
    nightText(c, txt, x, y + 28, '#ffffff', 'center', 'alphabetic', '600 11px ' + FONT);
  }
  function solarSkyColor(sn) {
    const se = sn.solar;
    if (se.type === 'total') return [8, 12, 30];
    if (se.type === 'annular') return [40, 70, 120];
    return [58, 104, 170];
  }
  /** 日食的近照：從地表上最接近月影軸的地點看（天頂朝上） */
  function drawSolarCloseup(c, sn, cx, cy, R, f2, f3) {
    const G = K.greatestPoint(sn.m, sn.s);
    const loc = K.localSolar(sn.m, sn.s, G);
    const f = K.unit(K.sub(sn.m, G));
    let up = K.unit(G);
    up = K.sub(up, K.mul(f, K.dot(up, f)));
    if (K.len(up) < 1e-6) up = K.v3(0, 0, 1);
    up = K.unit(up);
    const right = K.cross(f, up);
    const sd = K.unit(K.sub(sn.s, G));
    const k = R / loc.rm;                    // px／弧度（月球半徑 = R）
    const sx = cx + K.dot(sd, right) * k, sy = cy - K.dot(sd, up) * k, Rs = loc.rs * k;
    // 日冕（全食時）
    if (loc.type === 'total') {
      const gc = c.createRadialGradient(sx, sy, Rs * 0.9, sx, sy, Rs * 3.4);
      gc.addColorStop(0, 'rgba(250,248,240,0.85)');
      gc.addColorStop(0.25, 'rgba(230,236,255,0.35)');
      gc.addColorStop(1, 'rgba(200,210,255,0)');
      c.fillStyle = gc;
      c.fillRect(0, 0, mw, mh);
      c.save();
      c.strokeStyle = 'rgba(240,244,255,0.25)';
      c.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) {
        const a = i / 26 * TAU + 0.3 * Math.sin(i * 7.1), l = Rs * (1.4 + 1.5 * hash3(i, 3, 9));
        c.beginPath(); c.moveTo(sx + Math.cos(a) * Rs, sy + Math.sin(a) * Rs); c.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); c.stroke();
      }
      c.restore();
    } else {
      const gl = c.createRadialGradient(sx, sy, Rs, sx, sy, Rs * 3);
      gl.addColorStop(0, 'rgba(255,240,200,0.55)');
      gl.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = gl;
      c.fillRect(0, 0, mw, mh);
    }
    // 太陽圓面（周邊減光）
    const gs = c.createRadialGradient(sx, sy, 0, sx, sy, Rs);
    gs.addColorStop(0, '#fffdf2');
    gs.addColorStop(0.7, '#fff3c8');
    gs.addColorStop(1, '#f6c56a');
    c.fillStyle = gs;
    c.beginPath(); c.arc(sx, sy, Rs, 0, TAU); c.fill();
    // 月球（背光面，幾乎全黑）
    c.fillStyle = '#16171c';
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 1;
    c.stroke();
    const tName = { total: T('日全食', 'Total solar eclipse'), annular: T('日環食', 'Annular solar eclipse'), partial: T('日偏食', 'Partial solar eclipse'), none: T('日偏食', 'Partial solar eclipse') }[loc.type];
    D.pill(c, tName + T('——從日食最大的地點看', ' — seen where it is greatest'), 10, 26, C.text, 'left', f2);
    D.pill(c, T('月球視直徑 ', 'Moon ') + num(2 * loc.rm * RAD2MIN, 1) + '′' + T('，太陽 ', ', Sun ') + num(2 * loc.rs * RAD2MIN, 1) + '′', 10, mh - 10, C.muted, 'left', f3);
    arrowUp(c, mw - 22, 44, T('天頂', 'Zenith'));
  }

  // =====================================================================
  // 影子的截面（依比例）
  // =====================================================================
  const scv = $('secCv'), sctx = scv.getContext('2d');
  let sw = 300, sh = 300, sdpr = 1;
  function resizeSec() {
    const w = scv.clientWidth;
    if (!w) return;
    sdpr = Math.min(window.devicePixelRatio || 1, 3);
    sw = w; sh = Math.round(Math.min(340, Math.max(240, w * 0.86)));
    scv.style.height = sh + 'px';
    scv.width = Math.round(sw * sdpr); scv.height = Math.round(sh * sdpr);
    requestDraw();
  }
  function drawSection() {
    const c = sctx, sn = snap();
    c.setTransform(sdpr, 0, 0, sdpr, 0, 0);
    D.backdrop(c, sw, sh);
    const f2 = '600 12px ' + FONT, f3 = '11px ' + FONT;
    const lunarSide = Math.cos(sn.ph.dLam) < 0;
    const half = 14500;                                   // 半個畫面代表的距離（km）
    const k = Math.min(sw, sh - 30) / 2 / half;
    const cx = sw / 2, cy = (sh + 14) / 2;
    D.grid(c, 0, 0, sw, sh, 5000 * k, 1000 * k, cx, cy);
    const pt = function (x, y) { return [cx + x * k, cy - y * k]; };
    if (lunarSide) drawLunarSection(c, sn, pt, k, cx, cy, f2, f3);
    else drawSolarSection(c, sn, pt, k, cx, cy, f2, f3);
    // 比例尺
    const L5 = 5000 * k;
    c.strokeStyle = D.alpha(C.text, 0.7); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(sw - 12 - L5, sh - 14); c.lineTo(sw - 12, sh - 14); c.moveTo(sw - 12 - L5, sh - 18); c.lineTo(sw - 12 - L5, sh - 10); c.moveTo(sw - 12, sh - 18); c.lineTo(sw - 12, sh - 10); c.stroke();
    D.haloText(c, '5000 km', sw - 12 - L5 / 2, sh - 20, C.text, 'center', 'alphabetic', f3);
  }
  function sectionBasis(a) {
    let up = K.sub(K.v3(0, 0, 1), K.mul(a, a.z));
    up = K.unit(up);
    return { up: up, right: K.cross(a, up) };
  }
  function drawLunarSection(c, sn, pt, k, cx, cy, f2, f3) {
    const lu = sn.lunar, a = lu.axis, B = sectionBasis(a);
    const x = K.len(sn.m);   // 影子的大小取在月球的距離（望的時候等於月球在影軸上的投影）
    const cc = K.cone(K.R_SUN, K.R_EARTH, K.len(sn.s), x);
    // 半影：看得到的太陽比例 → 由暗到亮
    const ei = (function () {
      const n = 40, out = [];
      let perp = K.unit(K.cross(a, K.v3(0, 0, 1)));
      for (let i = 0; i <= n; i++) {
        const rho = cc.rp * 1.02 * i / n;
        out.push([rho, K.sunVisibleFrom(K.add(K.mul(a, x), K.mul(perp, rho)), sn.s, K.v3(0, 0, 0), K.R_EARTH)]);
      }
      return out;
    })();
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, cc.rp * 1.02 * k);
    ei.forEach(function (e) { g.addColorStop(Math.min(1, e[0] / (cc.rp * 1.02)), D.shadowInk((C.dark ? 0.62 : 0.42) * (1 - e[1]))); });
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, cy, cc.rp * k, 0, TAU); c.fill();
    c.fillStyle = 'rgba(150,50,30,' + (C.dark ? 0.32 : 0.22) + ')';
    c.beginPath(); c.arc(cx, cy, cc.ru * k, 0, TAU); c.fill();
    c.setLineDash([4, 4]);
    c.strokeStyle = D.alpha(C.text, 0.4); c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cy, cc.rp * k, 0, TAU); c.stroke();
    c.setLineDash([]);
    c.strokeStyle = D.alpha(C.copper, 0.8); c.lineWidth = 1.4;
    c.beginPath(); c.arc(cx, cy, cc.ru * k, 0, TAU); c.stroke();
    // 黃道（水平線）
    c.setLineDash([2, 4]);
    c.strokeStyle = D.alpha(C.equi, 0.8);
    c.beginPath(); c.moveTo(0, cy); c.lineTo(sw, cy); c.stroke();
    c.setLineDash([]);
    D.haloText(c, T('黃道', 'Ecliptic'), 8, cy - 5, D.shade(C.equi, C.dark ? 0.1 : -0.3), 'left', 'alphabetic', f3);
    // 月球的路徑（前後 8 小時，每點 1 小時）
    const path = [];
    for (let h = -8; h <= 8; h += 0.5) {
      const t = state.t + h / 24, m = K.moonAt(state.el, t), s = K.sunAt(t);
      const L2 = K.lunarEclipse(m, s), Bb = sectionBasis(L2.axis);
      path.push([K.dot(L2.off, Bb.right), K.dot(L2.off, Bb.up), h]);
    }
    c.save();
    c.strokeStyle = D.alpha(C.accent, 0.7); c.lineWidth = 1.4; c.setLineDash([5, 4]);
    c.beginPath(); path.forEach(function (p, i) { const q = pt(p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.stroke();
    c.setLineDash([]);
    c.fillStyle = D.alpha(C.accent, 0.8);
    path.forEach(function (p) { if (p[2] % 1 === 0 && p[2] !== 0) { const q = pt(p[0], p[1]); c.beginPath(); c.arc(q[0], q[1], 1.8, 0, TAU); c.fill(); } });
    const pe = pt(path[path.length - 1][0], path[path.length - 1][1]), pp = pt(path[path.length - 3][0], path[path.length - 3][1]);
    D.arrow(c, pp[0], pp[1], pe[0], pe[1], C.accent, 1.6);
    c.restore();
    // 月球（依比例）＋影子蓋在上面
    const mx = K.dot(lu.off, B.right), my = K.dot(lu.off, B.up);
    const q = pt(mx, my), rM = K.R_MOON * k;
    const inView = q[0] > -rM && q[0] < sw + rM && q[1] > -rM && q[1] < sh + rM;
    if (inView) {
      // 順著陽光看，看到的是月球朝向太陽的一面（望的時候就是朝向地球的近側）：真實月面、黃道北方朝上、全亮
      const face = renderMoon({ R: rM, dpr: sdpr, rot: 0, L: [0, 0, 1], es: 0, ecl: null, bg: null });
      c.save();
      c.imageSmoothingEnabled = true;
      c.drawImage(face, q[0] - rM, q[1] - rM, 2 * rM, 2 * rM);
      c.beginPath(); c.arc(q[0], q[1], rM, 0, TAU); c.clip();
      const g2 = c.createRadialGradient(cx, cy, 0, cx, cy, cc.rp * 1.02 * k);
      ei.forEach(function (e) { g2.addColorStop(Math.min(1, e[0] / (cc.rp * 1.02)), 'rgba(10,8,8,' + (0.82 * (1 - e[1])) + ')'); });
      c.fillStyle = g2; c.fillRect(q[0] - rM, q[1] - rM, 2 * rM, 2 * rM);
      c.fillStyle = 'rgba(190,70,35,0.55)';
      c.beginPath(); c.arc(cx, cy, cc.ru * k, 0, TAU); c.fill();
      c.restore();
      c.strokeStyle = D.alpha(C.surface, 0.8); c.lineWidth = 1;
      c.beginPath(); c.arc(q[0], q[1], rM, 0, TAU); c.stroke();
      D.pill(c, T('月球', 'Moon'), q[0], q[1] - rM - 4, C.text, 'center', f3);
    } else {
      const ang = Math.acos(Math.max(-1, Math.min(1, K.dot(K.unit(sn.m), a)))) / DEG, an = num(ang, ang < 10 ? 2 : 0);
      const before = sn.ph.dLam < Math.PI;
      const txt = Math.abs(my) > Math.abs(mx)
        ? T('月球在地影' + (my > 0 ? '上方' : '下方') + ' ' + an + '°', 'Moon ' + an + '° ' + (my > 0 ? 'above' : 'below') + ' the shadow')
        : T('月球離地影 ' + an + '°（' + (before ? '還沒到望' : '已過了望') + '）', 'Moon ' + an + '° from the shadow (' + (before ? 'before' : 'after') + ' full moon)');
      edgeArrow(c, mx, my, k, cx, cy, txt, f3);
    }
    D.pill(c, T('地球的影子（在月球的距離）', 'Earth’s shadow at the Moon’s distance'), 8, 22, C.text, 'left', f2);
    D.haloText(c, T('本影 ', 'Umbra ') + group(cc.ru) + ' km', cx, cy + cc.ru * k + 14, D.shade(C.copper, C.dark ? 0.25 : -0.1), 'center', 'alphabetic', f3);
    D.haloText(c, T('半影 ', 'Penumbra ') + group(cc.rp) + ' km', cx, cy - cc.rp * k - 5, C.muted, 'center', 'alphabetic', f3);
    D.haloText(c, T('箭頭：月球前後 8 小時的路徑（每點 1 小時）', 'Arrow: the Moon’s path ±8 h (dots every hour)'), 8, sh - 32, C.muted, 'left', 'alphabetic', f3);
    D.pill(c, T('月食：', 'Lunar eclipse: ') + eclName('lunar', lu.type), 8, sh - 8, lu.type !== 'none' ? C.pos : C.muted, 'left', f2);
  }
  function edgeArrow(c, x, y, k, cx, cy, txt, f3) {
    const a = Math.atan2(y, x), L0 = Math.min(sw, sh) / 2 - 26;
    const ex = cx + Math.cos(a) * L0, ey = cy - Math.sin(a) * L0;
    D.arrow(c, cx + Math.cos(a) * (L0 - 30), cy - Math.sin(a) * (L0 - 30), ex, ey, C.accent, 2);
    c.font = f3;
    const fsc = window.LabSettings ? +(window.LabSettings.get('fs') || 1) : 1;
    const hw = Math.min(sw / 2 - 6, (c.measureText(txt).width * Math.max(1, fsc) + 14) / 2);
    D.pill(c, txt, Math.max(6 + hw, Math.min(sw - 6 - hw, ex)), Math.max(40, Math.min(sh - 40, ey + (Math.sin(a) > 0 ? 22 : -8))), C.accent, 'center', f3);
  }
  function drawSolarSection(c, sn, pt, k, cx, cy, f2, f3) {
    const se = sn.solar, a = se.axis, B = sectionBasis(a);
    // 畫面中心 = 地心（從太陽方向看地球：整個都是白天的半球）
    const shX = -K.dot(se.off, B.right), shY = -K.dot(se.off, B.up);
    const rE = K.R_EARTH * k;
    const ge = c.createRadialGradient(cx - rE * 0.3, cy - rE * 0.35, rE * 0.1, cx, cy, rE);
    ge.addColorStop(0, D.shade(C.neg, 0.55)); ge.addColorStop(0.7, D.shade(C.neg, 0.1)); ge.addColorStop(1, D.shade(C.neg, -0.25));
    c.save();
    c.shadowColor = C.dark ? 'rgba(0,0,0,0.5)' : D.alpha(C.text, 0.2); c.shadowBlur = 10;
    c.fillStyle = ge; c.beginPath(); c.arc(cx, cy, rE, 0, TAU); c.fill();
    c.restore();
    // 緯線：赤道與北回歸線（從太陽看）
    c.save();
    c.beginPath(); c.arc(cx, cy, rE, 0, TAU); c.clip();
    const th = K.lst(state.t, K.LON_TW) - K.LON_TW;
    const projE = function (lat, lon) {
      const q = K.eqToEcl(K.v3(Math.cos(lat) * Math.cos(lon + th), Math.cos(lat) * Math.sin(lon + th), Math.sin(lat)));
      return [cx + K.dot(q, B.right) * rE, cy - K.dot(q, B.up) * rE, -K.dot(q, a)];
    };
    [[0, 0.45, []], [K.LAT_TW, 0.35, [2, 2]]].forEach(function (L1) {
      c.strokeStyle = 'rgba(255,255,255,' + L1[1] + ')'; c.lineWidth = 1; c.setLineDash(L1[2]);
      c.beginPath(); let pen = false;
      for (let i = 0; i <= 96; i++) { const p = projE(L1[0], i * TAU / 96); if (p[2] > 0) { if (pen) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); pen = true; } else pen = false; }
      c.stroke();
    });
    c.setLineDash([]);
    // 月影（依比例）
    const cc = K.cone(K.R_SUN, K.R_MOON, K.len(K.sub(sn.m, sn.s)), Math.max(se.x, 1));
    const sp = pt(shX, shY);
    const gp = c.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], cc.rp * k);
    gp.addColorStop(0, 'rgba(0,0,10,0.6)'); gp.addColorStop(0.6, 'rgba(0,0,10,0.32)'); gp.addColorStop(1, 'rgba(0,0,10,0)');
    c.fillStyle = gp; c.beginPath(); c.arc(sp[0], sp[1], cc.rp * k, 0, TAU); c.fill();
    c.restore();
    c.setLineDash([4, 4]);
    c.strokeStyle = D.alpha(C.text, 0.45); c.lineWidth = 1;
    c.beginPath(); c.arc(sp[0], sp[1], cc.rp * k, 0, TAU); c.stroke();
    c.setLineDash([]);
    const ru = Math.abs(se.central ? se.ruSurface : cc.ru);
    c.fillStyle = se.type === 'annular' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.85)';
    c.strokeStyle = se.type === 'annular' ? C.equi : C.text;
    c.lineWidth = 1.6;
    c.beginPath(); c.arc(sp[0], sp[1], Math.max(2.5, ru * k), 0, TAU); c.fill(); c.stroke();
    // 月影中心的路徑（前後 3 小時）與觀測地點
    const path = [], twp = [];
    for (let h = -3; h <= 3; h += 0.25) {
      const t = state.t + h / 24, m = K.moonAt(state.el, t), s = K.sunAt(t), S2 = K.solarEclipse(m, s), Bb = sectionBasis(S2.axis);
      path.push([-K.dot(S2.off, Bb.right), -K.dot(S2.off, Bb.up), h]);
      const P = K.observer(t, plat(), plon());
      twp.push([K.dot(P, Bb.right), K.dot(P, Bb.up), -K.dot(P, S2.axis) > 0]);
    }
    c.save();
    c.strokeStyle = D.alpha(C.text, 0.55); c.lineWidth = 1.3; c.setLineDash([5, 4]);
    c.beginPath(); path.forEach(function (p, i) { const q = pt(p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.stroke();
    c.setLineDash([]);
    const pe = pt(path[path.length - 1][0], path[path.length - 1][1]), pq = pt(path[path.length - 3][0], path[path.length - 3][1]);
    D.arrow(c, pq[0], pq[1], pe[0], pe[1], D.alpha(C.text, 0.7), 1.5);
    // 觀測地點的路徑（地球自轉）
    c.strokeStyle = D.alpha(C.pos, 0.55); c.lineWidth = 1.2; c.setLineDash([2, 3]);
    c.beginPath(); let pen = false;
    twp.forEach(function (p) { const q = pt(p[0], p[1]); if (p[2]) { if (pen) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); pen = true; } else pen = false; });
    c.stroke(); c.setLineDash([]);
    c.restore();
    const P = sn.P, tw = pt(K.dot(P, B.right), K.dot(P, B.up));
    if (-K.dot(P, a) > 0) {
      c.fillStyle = C.pos; c.strokeStyle = '#fff'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(tw[0], tw[1], 3.5, 0, TAU); c.fill(); c.stroke();
      D.haloText(c, placeName(), tw[0] + 6, tw[1] - 5, C.pos, 'left', 'alphabetic', '600 ' + f3);
    } else {
      D.haloText(c, T(placeName() + '在夜晚的半球（看不到太陽）', placeName() + ' is on the night side'), cx, cy + rE + 16, C.pos, 'center', 'alphabetic', f3);
    }
    if (Math.hypot(shX, shY) * k > Math.min(sw, sh) / 2) {
      edgeArrow(c, shX, shY, k, cx, cy, T('月影從地球', 'Moon’s shadow passes ') + (shY > 0 ? T('上方', 'above') : T('下方', 'below')) + T('經過', ' the Earth'), f3);
    } else {
      D.haloText(c, (se.type === 'annular' ? T('偽本影（環食帶）', 'Antumbra (annular)') : T('本影（全食帶）', 'Umbra (total)')) + ' ' + group(2 * ru) + ' km', sp[0], sp[1] + Math.max(2.5, ru * k) + 14, C.text, 'center', 'alphabetic', '600 ' + f3);
    }
    D.pill(c, T('月球的影子落在地球上（從太陽方向看）', 'The Moon’s shadow on the Earth (seen from the Sun)'), 8, 22, C.text, 'left', f2);
    D.haloText(c, T('虛線：月影中心前後 3 小時的路徑', 'Dashed: path of the shadow’s centre ±3 h'), 8, sh - 32, C.muted, 'left', 'alphabetic', f3);
    D.pill(c, T('日食：', 'Solar eclipse: ') + eclName('solar', se.type) + (se.type !== 'none' && se.type !== 'partial' ? (se.central ? T('（中心食）', ' (central)') : T('（非中心食）', ' (non-central)')) : ''), 8, sh - 8, se.type !== 'none' ? C.pos : C.muted, 'left', f2);
  }

  // =====================================================================
  // 從觀測地點看的天空（360° 全景；北半球面向南方、南半球面向北方，月亮通常在畫面中間）
  // =====================================================================
  const kcv = $('skyCv'), kctx = kcv.getContext('2d');
  let kw = 600, kh = 260, kdpr = 1;
  const SKYSTARS = (function () {
    let s = 12345;
    const r = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const out = [];
    for (let i = 0; i < 260; i++) out.push({ ra: r() * TAU, dec: Math.asin(2 * r() - 1), m: Math.pow(r(), 3) });
    return out;
  })();
  function resizeSky() {
    const w = kcv.clientWidth;
    if (!w) return;
    kdpr = Math.min(window.devicePixelRatio || 1, 2);
    kw = w; kh = Math.round(w < 560 ? Math.max(210, w * 0.6) : Math.min(300, Math.max(230, w * 0.32)));
    kcv.style.height = kh + 'px';
    kcv.width = Math.round(kw * kdpr); kcv.height = Math.round(kh * kdpr);
    requestDraw();
  }
  let skyLast = 0, skyKey = '';
  /** 南半球面向北方看（月亮、太陽通常在北方的天空）；北半球與赤道上（含赤道）面向南方 */
  function skyFacesNorth() { return state.place.lat < 0; }
  function drawSky(force) {
    const c = kctx, sn = snap(), day = today();
    const key = [sn.t, elVer, placeVer, kw, kh, C.dark, LabSettingsKey()].join('|');
    const now = performance.now();
    if (!force && key === skyKey) return;
    if (!force && (state.running || state.tween) && now - skyLast < 40) return;
    skyKey = key; skyLast = now;
    c.setTransform(kdpr, 0, 0, kdpr, 0, 0);
    const narrow = kw < 560;
    const yH = Math.round(kh * (narrow ? 0.76 : 0.8)), top = 14;
    const ppd = (yH - top) / 90;
    // 面向南方：左東右西（方位 0° 在左緣）；面向北方：左西右東（方位 0° 在中間）
    const faceN = skyFacesNorth();
    const X = function (az) { return (K.norm(faceN ? az + Math.PI : az) / TAU) * kw; };
    const Y = function (alt) { return yH - alt / DEG * ppd; };
    const cols = skyColors(sn.hs.alt);
    // 天空
    const g = c.createLinearGradient(0, top, 0, yH);
    g.addColorStop(0, rgbStr(cols[0]));
    g.addColorStop(1, rgbStr(cols[1]));
    c.fillStyle = g;
    c.fillRect(0, 0, kw, yH);
    // 太陽附近的暮光
    const sh = sn.hs.alt / DEG;
    if (sh > -14 && sh < 14) {
      const sxp = X(sn.hs.az);
      const a = 0.55 * (1 - Math.abs(sh + 2) / 16);
      [sxp, sxp - kw, sxp + kw].forEach(function (x0) {
        const gw = c.createRadialGradient(x0, yH, 0, x0, yH, kw * 0.28);
        gw.addColorStop(0, 'rgba(255,170,90,' + Math.max(0, a) + ')');
        gw.addColorStop(1, 'rgba(255,170,90,0)');
        c.fillStyle = gw; c.fillRect(0, 0, kw, yH);
      });
    }
    // 星星（天黑後；隨恆星時轉動）
    if (sh < -4) {
      const vis = Math.min(1, (-4 - sh) / 10), th = sn.P.th, lat = plat();
      const sl = Math.sin(lat), cl = Math.cos(lat);
      SKYSTARS.forEach(function (st) {
        const H = th - st.ra;
        const sa = sl * Math.sin(st.dec) + cl * Math.cos(st.dec) * Math.cos(H);
        if (sa <= 0.02) return;
        const alt = Math.asin(sa);
        const az = Math.atan2(-Math.cos(st.dec) * Math.sin(H), Math.sin(st.dec) * cl - Math.cos(st.dec) * sl * Math.cos(H));
        c.fillStyle = 'rgba(255,255,255,' + (vis * (0.35 + 0.6 * st.m)) + ')';
        c.beginPath(); c.arc(X(az), Y(alt), 0.5 + 1.1 * st.m, 0, TAU); c.fill();
      });
    }
    // 高度格線
    c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = 1;
    [30, 60].forEach(function (h) { const y = Math.round(Y(h * DEG)) + 0.5; c.beginPath(); c.moveTo(0, y); c.lineTo(kw, y); c.stroke(); });
    [0.25, 0.5, 0.75].forEach(function (f) { const x = Math.round(kw * f) + 0.5; c.beginPath(); c.moveTo(x, top); c.lineTo(x, yH); c.stroke(); });
    const f3 = (narrow ? 10 : 11) + 'px ' + FONT, f2 = '600 ' + (narrow ? 11 : 12) + 'px ' + FONT;
    c.font = f3; c.fillStyle = 'rgba(255,255,255,0.55)'; c.textAlign = 'left'; c.textBaseline = 'middle';
    [30, 60].forEach(function (h) { c.fillText(h + '°', 4, Y(h * DEG) - 7); });
    // 今天的路徑
    const path = function (pts, col, dash) {
      c.save(); c.strokeStyle = col; c.lineWidth = 1.4; c.setLineDash(dash);
      c.beginPath(); let pen = false, px = 0;
      pts.forEach(function (p) {
        const x = X(p[0]), y = Y(p[1]);
        if (p[1] > -2 * DEG && (!pen || Math.abs(x - px) < kw / 2)) { if (pen) c.lineTo(x, y); else c.moveTo(x, y); pen = true; }
        else { pen = p[1] > -2 * DEG; if (pen) c.moveTo(x, y); }
        px = x;
      });
      c.stroke(); c.restore();
    };
    path(day.sp, 'rgba(255,214,120,0.45)', [1.5, 4]);
    path(day.mp, 'rgba(235,240,255,0.7)', [5, 4]);
    // 地面
    const night = sh < -6;
    const gg = c.createLinearGradient(0, yH, 0, kh);
    gg.addColorStop(0, night ? '#0d1310' : sh < 0 ? '#2a2f26' : '#3e5135');
    gg.addColorStop(1, night ? '#050806' : '#1b2418');
    c.fillStyle = gg;
    c.beginPath(); c.moveTo(0, kh); c.lineTo(0, yH);
    for (let x = 0; x <= kw; x += 6) c.lineTo(x, yH - 3 - 4 * vnoise(x / 40, 1.5, 2.5) - 2.5 * vnoise(x / 13, 7, 1));
    c.lineTo(kw, kh); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.beginPath(); c.moveTo(0, yH + 0.5); c.lineTo(kw, yH + 0.5); c.stroke();
    // 方位
    const NSEW = [T('北', 'N'), T('東', 'E'), T('南', 'S'), T('西', 'W')];
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      const q = Math.round((faceN ? f * 4 + 2 : f * 4)) % 4, x = f === 0 ? 6 : f === 1 ? kw - 6 : kw * f;
      nightText(c, NSEW[q], x, yH + 16, '#ffffff', f === 0 ? 'left' : f === 1 ? 'right' : 'center', 'alphabetic', '700 ' + (narrow ? 12 : 13) + 'px ' + FONT);
    });
    // 升落時刻標記（當地時間）
    const rsMark = function (tt, col, txt) {
      if (tt == null) return;
      const h = K.horizontal(txt === 'm' ? K.moonAt(state.el, tt) : K.sunAt(tt), tt, plat(), plon());
      const x = X(h.az);
      c.fillStyle = col; c.beginPath(); c.arc(x, yH, 2.5, 0, TAU); c.fill();
      c.font = f3; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = col;
      c.fillText(fmtLocalClock(tt), Math.max(16, Math.min(kw - 16, x)), yH + (txt === 'm' ? 30 : 42) - (narrow ? 4 : 0));
    };
    rsMark(day.moon.rise, 'rgba(235,240,255,0.95)', 'm');
    rsMark(day.moon.set, 'rgba(235,240,255,0.95)', 'm');
    rsMark(day.sun.rise, 'rgba(255,214,120,0.95)', 's');
    rsMark(day.sun.set, 'rgba(255,214,120,0.95)', 's');
    // 太陽
    const SR = narrow ? 10 : 12;
    let sunXY = null;
    if (sn.hs.alt > -1.2 * DEG) {
      const x = X(sn.hs.az), y = Y(sn.hs.alt);
      sunXY = [x, y];
      const gs = c.createRadialGradient(x, y, SR * 0.5, x, y, SR * 3.2);
      gs.addColorStop(0, 'rgba(255,240,190,0.75)'); gs.addColorStop(1, 'rgba(255,240,190,0)');
      c.fillStyle = gs; c.beginPath(); c.arc(x, y, SR * 3.2, 0, TAU); c.fill();
      c.fillStyle = '#fff6d8'; c.beginPath(); c.arc(x, y, SR, 0, TAU); c.fill();
      // 觀測地點看到的日食：月球的剪影（與日月同樣放大）
      if (sn.loc.type !== 'none') {
        const f = K.unit(K.sub(sn.s, sn.P));
        const B = K.horizonBasis(sn.P.th, sn.P.lat);
        const toH = function (v) { const q = K.eclToEq(v); return K.v3(K.dot(q, B.east), K.dot(q, B.north), K.dot(q, B.up)); };
        const fs = K.unit(toH(f)), fm = K.unit(toH(K.sub(sn.m, sn.P)));
        let up = K.sub(K.v3(0, 0, 1), K.mul(fs, fs.z)); up = K.unit(up);
        const right = K.cross(fs, up);
        const kk = SR / sn.loc.rs;
        c.fillStyle = '#121318';
        c.beginPath(); c.arc(x + K.dot(fm, right) * kk, y - K.dot(fm, up) * kk, sn.loc.rm * kk, 0, TAU); c.fill();
      }
      nightText(c, T('太陽', 'Sun') + ' ' + num(sh, 1) + '°', x, Math.max(top + 10, y - SR - 6), '#ffe9b0', 'center', 'alphabetic', f2);
    }
    // 月亮（真實月面、逐點畫出；月面方向與近照相同，固定不旋轉）
    const MR = narrow ? 11 : 13;
    if (sn.hm.alt > -1.2 * DEG) {
      const x = X(sn.hm.az), y = Y(sn.hm.alt);
      const ori = sn.ori;
      const ecl = eclipseInfo(sn, sn.P);
      const img = renderMoon({ R: MR, dpr: kdpr, rot: moonFaceRot(), L: sunInMoonFrame(sn.ph.phaseAngle, ori.limb, ori.north), es: (1 + Math.cos(sn.ph.psi)) / 2, ecl: ecl, bg: null });
      const gl = c.createRadialGradient(x, y, MR * 0.8, x, y, MR * 2.6);
      gl.addColorStop(0, 'rgba(230,235,245,' + (0.25 * sn.ph.illum * (night ? 1 : 0.4)) + ')'); gl.addColorStop(1, 'rgba(230,235,245,0)');
      c.fillStyle = gl; c.beginPath(); c.arc(x, y, MR * 2.6, 0, TAU); c.fill();
      // 白天的月亮：疊在藍天上會比較淡
      c.globalAlpha = sh > 0 ? 0.85 : 1;
      c.drawImage(img, x - MR, y - MR, 2 * MR, 2 * MR);
      c.globalAlpha = 1;
      const lab = T('月亮', 'Moon') + ' ' + num(sn.hm.alt / DEG, 1) + '°';
      const ly = y - MR - 6 < top + 10 ? y + MR + 16 : y - MR - 6;
      if (!sunXY || Math.hypot(sunXY[0] - x, sunXY[1] - ly) > 40) nightText(c, lab, x, ly, '#ffffff', 'center', 'alphabetic', f2);
    } else {
      const x = X(sn.hm.az);
      nightText(c, '▾ ' + T('月亮在地平線下 ', 'Moon below horizon ') + num(sn.hm.alt / DEG, 0) + '°', Math.max(70, Math.min(kw - 70, x)), kh - 8, 'rgba(235,240,255,0.85)', 'center', 'alphabetic', f3);
    }
    // 時間與說明
    D.pill(c, fmtDate(sn.cal) + ' ' + fmtClock(sn.cal.hour) + T('（當地時間 ', ' (local time, ') + zoneText(sn.t, true) + T('）', ')'), 8, top + 18, C.text, 'left', f2);
    if (!narrow) D.pill(c, T('太陽與月亮的大小放大約 20 倍', 'Sun and Moon drawn about 20× larger'), kw - 8, top + 18, C.muted, 'right', f3);
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  let readoutAt = 0;
  function updateReadouts(force) {
    const now = performance.now();
    if (!force && now - readoutAt < 120) return;
    readoutAt = now;
    const sn = snap(), day = today();
    const ph = sn.ph;
    setHTML('rPhase', phaseName(sn.key));
    setHTML('rAge', num(moonAge(), 2) + T(' 天', ' d'));
    setHTML('rIllum', num(ph.illum * 100, 1) + ' %');
    setHTML('rPsi', deg(ph.psi, 2));
    setHTML('rPh', deg(ph.phaseAngle, 2));
    const r = sn.m.r;
    setHTML('rDist', group(r) + ' km<small>' + T('近地點 ', 'perigee ') + group(K.A_MOON * (1 - K.E_MOON)) + T('、遠地點 ', ', apogee ') + group(K.A_MOON * (1 + K.E_MOON)) + ' km</small>');
    const dm = 2 * Math.asin(K.R_MOON / r) * RAD2MIN, ds = 2 * Math.asin(K.R_SUN / K.AU) * RAD2MIN;
    setHTML('rDiam', num(dm, 1) + '′ ／ ' + num(ds, 1) + '′<small>' + (dm > ds ? T('地心看：月球比太陽大', 'from the centre: Moon larger than the Sun') : T('地心看：月球比太陽小', 'from the centre: Moon smaller than the Sun')) + '</small>');
    setHTML('rLat', (sn.m.lat >= 0 ? '+' : '') + deg(sn.m.lat, 2) + '<small>' + T('最大 ±5.145°', 'max ±5.145°') + '</small>');
    const asc = Math.abs(K.wrapPi(sn.m.u)) < Math.PI / 2;
    setHTML('rNode', deg(sn.nodeDist, 1) + '<small>' + (asc ? T('靠近升交點', 'near the ascending node') : T('靠近降交點', 'near the descending node')) + '</small>');
    const season = sn.sunNode < 18.5 * DEG;
    setHTML('rSunNode', deg(sn.sunNode, 1) + '<small>' + (season ? T('食季：朔、望時可能有日月食', 'Eclipse season: eclipses possible at new or full moon') : T('不在食季', 'not an eclipse season')) + '</small>');
    const lu = sn.lunar;
    let lt = eclName('lunar', lu.type, true);
    if (lu.type === 'total' || lu.type === 'partial') lt += T('（本影食分 ', ' (umbral magnitude ') + num(lu.magU, 2) + T('）', ')');
    else if (lu.type === 'penumbral') lt += T('（半影食分 ', ' (penumbral magnitude ') + num(lu.magP, 2) + T('）', ')');
    setHTML('rLunar', lu.type === 'none' ? T('無', 'none') + '<small>' + (Math.cos(ph.dLam) > 0 ? T('不是望（滿月）', 'not a full moon') : T('月球離地影軸 ', 'Moon is ') + group(lu.d) + T(' km', ' km from the shadow axis')) + '</small>' : lt);
    $('rLunar').className = lu.type === 'none' ? '' : 'ecl';
    const se = sn.solar;
    let st = eclName('solar', se.type, true);
    if (se.type === 'total' || se.type === 'annular') st += se.central ? T('（中心食，γ = ', ' (central, γ = ') + num(se.gamma, 2) + T('）', ')') : T('（非中心食）', ' (non-central)');
    setHTML('rSolar', se.type === 'none' ? T('無', 'none') + '<small>' + (Math.cos(ph.dLam) < 0 ? T('不是朔（新月）', 'not a new moon') : T('月影軸離地心 ', 'shadow axis ') + num(se.gamma, 2) + T(' 個地球半徑', ' Earth radii from the centre')) + '</small>' : st);
    $('rSolar').className = se.type === 'none' ? '' : 'ecl';
    const lo = sn.loc;
    let ltxt;
    if (lo.type === 'none') ltxt = T('無', 'none');
    else if (sn.hs.alt < -0.83 * DEG) ltxt = T('看不到（太陽在地平線下）', 'not visible (Sun below the horizon)');
    else ltxt = eclName('solar', lo.type, true) + T('，食分 ', ', magnitude ') + num(lo.mag, 3);
    setHTML('rLocal', ltxt);
    $('rLocal').className = lo.type !== 'none' && sn.hs.alt >= -0.83 * DEG ? 'ecl' : '';
    setHTML('rMoonAlt', num(sn.hm.alt / DEG, 1) + '°，' .replace('，', T('，', ', ')) + T('方位 ', 'azimuth ') + num(sn.hm.az / DEG, 0) + '°（' .replace('（', T('（', ' (')) + azName(sn.hm.az) + T('）', ')') + (sn.hm.alt > 0 ? '' : '<small>' + T('在地平線下', 'below the horizon') + '</small>'));
    const both = function (r) {
      if (r.rise == null && r.set == null) return rsText(r, null);
      return rsText(r, r.rise) + ' ／ ' + rsText(r, r.set);
    };
    setHTML('rMoonRS', both(day.moon) + '<small>' + T('今天 00:00–24:00（當地時間 ' + zoneText(day.d0 + day.span / 2) + '）；上緣碰到地平線，含大氣折射', 'today 00:00–24:00 local time (' + zoneText(day.d0 + day.span / 2) + '); upper limb on the horizon, with refraction') + dayNote(day) + '</small>');
    setHTML('rSunAlt', num(sn.hs.alt / DEG, 1) + '°');
    setHTML('rSunRS', both(day.sun));
    setHTML('rLimb', limbWords(sn.ori.limb, sn.hm.az) + (sn.hm.alt > 0 ? '' : '<small>' + T('（月亮在地平線下）', '(the Moon is below the horizon)') + '</small>'));
    // 軌道說明
    setHTML('orbitInfo', T('太陽黃經目前 <b>', 'The Sun’s longitude is now <b>') + num(sn.s.lon / DEG, 1) + '°</b>' + T('；交點線指向太陽時（Ω ≈ 太陽黃經或 ±180°），朔望才有日月食。', '; eclipses need the line of nodes pointing at the Sun (Ω ≈ the Sun’s longitude or ±180°) at new or full moon.'));
  }
  /**
   * 在天空中亮面朝哪個方向（以當地的天頂為上；近照的月面方向是固定的，不是這個方向）。
   * 看著月亮時，右方是月亮方位 + 90°（面向南方時右邊是西、面向北方時右邊是東）
   */
  function limbWords(a, az) {
    const names = [T('右', 'right'), T('右上', 'upper right'), T('上', 'up'), T('左上', 'upper left'), T('左', 'left'), T('左下', 'lower left'), T('下', 'down'), T('右下', 'lower right')];
    const k = Math.round(K.norm(a) / (TAU / 8)) % 8;
    if (az != null && (k === 0 || k === 4)) {
      const d = azName(az + (k === 0 ? 1 : -1) * Math.PI / 2);
      return names[k] + T('（朝' + d + '方，指向太陽；在天空中以天頂為上）', ', toward ' + d + ' (toward the Sun; in the sky, zenith up)');
    }
    return names[k] + T('（指向太陽；在天空中以天頂為上）', ' (toward the Sun; in the sky, zenith up)');
  }

  // =====================================================================
  // 事件紀錄
  // =====================================================================
  const KIND = { new: ['新月（朔）', 'New moon'], fq: ['上弦', 'First quarter'], full: ['滿月（望）', 'Full moon'], lq: ['下弦', 'Last quarter'] };
  let logDirty = true;
  function renderLog() {
    if (!logDirty) return;
    logDirty = false;
    const tb = $('log');
    let h = '<thead><tr><th>' + T('日期、時刻', 'Date and time') + '</th><th>' + T('事件', 'Event') + '</th><th>' + T('說明', 'Notes') + '</th></tr></thead><tbody>';
    if (!state.log.length) h += '<tr class="empty"><td colspan="3">' + T('還沒有紀錄。按「播放」或「+1 朔望月」讓時間前進。', 'Nothing yet. Press Play or “+1 synodic month” to move time forward.') + '</td></tr>';
    state.log.slice(0, 120).forEach(function (e) {
      h += '<tr' + (e.ecl ? ' class="ecl"' : '') + '><td class="when">' + fmtWhen(e.t) + '</td><td class="ev">' + T(KIND[e.kind][0], KIND[e.kind][1]) + '</td><td class="note">' + logNote(e) + '</td></tr>';
    });
    $('log').innerHTML = h + '</tbody>';
  }
  function logNote(e) {
    const parts = [];
    if (e.gap != null) parts.push(T('距上一次 ', 'since the last one ') + num(e.gap, 2) + T(' 天', ' d'));
    if (e.ecl) {
      let s = eclName(e.eclKind, e.ecl.type, true);
      if (e.eclKind === 'lunar' && e.ecl.type !== 'penumbral') s += T('（本影食分 ', ' (umbral mag. ') + num(e.ecl.magU, 2) + T('）', ')');
      if (e.eclKind === 'solar' && e.ecl.central) s += T('（中心食）', ' (central)');
      if (e.twNote) s += T('；', '; ') + e.twNote;
      parts.unshift(s);
    } else if (e.kind === 'new' || e.kind === 'full') {
      parts.push(T('月球離交點 ', 'Moon ') + num(e.nodeDist, 1) + T('°，沒有食', '° from a node: no eclipse'));
    }
    return parts.join(T('；', '; '));
  }
  const lastEv = [-1e9, -1e9, -1e9, -1e9];
  function addLogEvent(kindIdx, tc) {
    // 同一次朔、望只記一次（停在那一刻再往前播放時不要重複）
    if (Math.abs(tc - lastEv[kindIdx]) < 0.02) return;
    lastEv[kindIdx] = tc;
    const kinds = ['new', 'fq', 'full', 'lq'];
    const kind = kinds[kindIdx];
    const el = state.el;
    const e = { t: tc, kind: kind, cal: lcal(tc) };   // 當地的日期（同一個月兩次滿月等，依所選地點的日曆）
    const prev = state.log.find(function (x) { return x.kind === kind; });
    if (prev && tc > prev.t) e.gap = tc - prev.t;
    const m = K.moonAt(el, tc);
    e.nodeDist = Math.min(Math.abs(K.wrapPi(m.u)), Math.abs(K.wrapPi(m.u - Math.PI))) / DEG;
    if (kind === 'new' || kind === 'full') {
      const ek = kind === 'new' ? 'solar' : 'lunar';
      const g = K.greatestEclipse(el, tc, ek);
      if (g.res.type !== 'none') {
        e.eclKind = ek;
        e.ecl = { type: g.res.type, central: !!g.res.central, magU: g.res.magU, gamma: g.res.gamma, t: g.t };
        const mg = K.moonAt(el, g.t), sg = K.sunAt(g.t);
        const nm = placeName(), la = plat(), lon = plon();
        if (ek === 'lunar') {
          const h = K.horizontal(mg, g.t, la, lon);
          e.twNote = h.alt > 0 ? T(nm + '看得到（月亮高度 ', 'visible from ' + nm + ' (Moon at ') + num(h.alt / DEG, 0) + '°）'.replace('）', T('）', ')')) : T(nm + '看不到（月亮在地平線下）', 'not visible from ' + nm);
        } else {
          const P = K.observer(g.t, la, lon), lo = K.localSolar(mg, sg, P), hs = K.horizontal(sg, g.t, la, lon);
          e.twNote = lo.type !== 'none' && hs.alt > 0 ? T(nm + '看到', nm + ' sees a ') + eclName('solar', lo.type) : T(nm + '看不到', 'not seen from ' + nm);
        }
      }
    }
    state.log.unshift(e);
    if (state.log.length > 300) state.log.length = 300;
    logDirty = true;
    // 音效：主要月相的輕聲；有日月食時多一個和弦
    const S = sound();
    if (S) {
      const f = { new: 523.25, fq: 659.25, full: 783.99, lq: 587.33 }[kind];
      S.tone({ freq: f, dur: 0.16, type: 'sine', gain: 0.22 });
      S.tone({ freq: f * 2, dur: 0.1, type: 'sine', gain: 0.06 });
      if (e.ecl) chime(e.ecl.type === 'total' || e.ecl.type === 'annular');
    }
    if (state.acted) emit('event', {
      kind: kind, t: tc, year: e.cal.year, month: e.cal.month, day: e.cal.day,
      eclipse: e.ecl ? e.ecl.type : 'none', eclKind: e.eclKind || '', central: !!(e.ecl && e.ecl.central), gap: e.gap == null ? null : e.gap
    });
  }

  // ---------- 音效 ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  /** 進入全食（或環食）時的輕柔和弦 */
  function chime(big) {
    const S = sound(); if (!S) return;
    [523.25, 659.25, 783.99, big ? 1046.5 : 0].forEach(function (f, i) { if (f) S.tone({ freq: f, dur: 1.1, type: 'sine', gain: 0.12, delay: i * 0.09 }); });
  }

  // =====================================================================
  // 時間前進（播放、跳躍）與事件偵測
  // =====================================================================
  function dLamAt(t) { return K.norm(K.moonAt(state.el, t).lon - K.sunLon(t)); }
  /** 由 t0 前進到 t1（t1 > t0）：找出經過的朔、上弦、望、下弦 */
  function detectEvents(t0, t1) {
    if (!(t1 > t0)) return;
    const found = [];
    if (t1 - t0 > 3) {
      for (let k = 0; k < 4; k++) {
        let tt = t0;
        for (let n = 0; n < 2000; n++) {
          const tc = K.findPhase(state.el, tt, k * Math.PI / 2, 1);
          if (!(tc <= t1)) break;
          found.push([k, tc]);
          tt = tc + 1e-6;
        }
      }
    } else {
      const d0 = dLamAt(t0), d1 = dLamAt(t1), adv = K.norm(d1 - d0);
      for (let k = 0; k < 4; k++) {
        const target = k * Math.PI / 2, need = K.norm(target - d0);
        if (need > 0 && need <= adv + 1e-9) {   // 容許誤差：跳躍剛好停在朔、望的那一刻也要記到
          let lo = t0, hi = t1;
          for (let i = 0; i < 50; i++) {
            const mid = (lo + hi) / 2;
            if (K.norm(dLamAt(mid) - d0) < need) lo = mid; else hi = mid;
          }
          found.push([k, (lo + hi) / 2]);
        }
      }
    }
    found.sort(function (a, b) { return a[1] - b[1]; });
    found.forEach(function (f) { addLogEvent(f[0], f[1]); });
  }
  function advance(dtDays) {
    const t0 = state.t, t1 = t0 + dtDays;
    if (dtDays > 0) detectEvents(t0, t1);
    state.t = t1;
    snapCache = null;
  }
  function startTween(t1, done, dur) {
    const wasRunning = state.running;
    state.running = false;
    state.tween = { t0: state.t, t1: t1, start: performance.now(), dur: reducedMotion ? 0 : (dur || 1200), done: done, resume: wasRunning };
    updateButtons();
    schedule();
  }
  function stepTween(now) {
    const tw = state.tween;
    const u = tw.dur ? Math.min(1, (now - tw.start) / tw.dur) : 1;
    const target = tw.t0 + (tw.t1 - tw.t0) * u;   // 等速前進（物理時間不加緩動）
    advance(target - state.t);
    if (u >= 1) {
      state.t = tw.t1;
      snapCache = null;
      state.tween = null;
      state.running = tw.resume;
      if (tw.done) tw.done();
      updateButtons();
      emitState();
    }
  }

  // =====================================================================
  // 滑桿與按鈕
  // =====================================================================
  const elDoy = $('doy'), elHr = $('hr'), elRate = $('rate'), elElong = $('elong'), elNode = $('node'), elPeri = $('peri');
  if (window.LabNum) {
    window.LabNum.register(elRate, {
      toValue: function (p) { return 0.1 * Math.pow(7200, p / 1000); },
      toPos: function (v) { return 1000 * Math.log(v / 0.1) / Math.log(7200); },
      min: 0.1, max: 720, decimals: 2
    });
  }
  function rateText(v) {
    if (v < 1) return Math.round(v * 60) + T(' 分鐘／秒', ' min/s');
    if (v < 24) return num(v, v < 10 ? 1 : 0) + T(' 小時／秒', ' h/s');
    return num(v / 24, v < 240 ? 1 : 0) + T(' 天／秒', ' d/s');
  }
  function setOut(id, txt) { const o = $(id); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setSlider(el, v) {
    if (document.activeElement === el && sliderHeld === el) return;
    if (window.LabNum) window.LabNum.clear(el);
    el.value = String(v);
  }
  let sliderHeld = null;
  function syncSliders() {
    const sn = snap();
    setSlider(elDoy, sn.cal.doy + 1);
    setSlider(elHr, Math.min(23.99, sn.cal.hour));
    setSlider(elElong, sn.ph.dLam / DEG);
    setSlider(elNode, sn.node / DEG);
    setSlider(elPeri, sn.peri / DEG);
    refreshOutputs();
  }
  function refreshOutputs() {
    const sn = snap();
    setOut('doyo', fmtDate(sn.cal) + T('（第 ' + (sn.cal.doy + 1) + ' 天）', ' (day ' + (sn.cal.doy + 1) + ')'));
    setOut('hro', fmtClock(sn.cal.hour));
    const hl = $('hrLbl'), hs = T('當地時間（' + zoneText(sn.t) + '，時）', 'Local time (' + zoneText(sn.t) + ', hours)');
    if (hl && hl.textContent !== hs) hl.textContent = hs;
    setOut('rateo', rateText(state.rate));
    setOut('elongo', num(sn.ph.dLam / DEG, 1) + '°');
    setOut('nodeo', num(sn.node / DEG, 1) + '°');
    setOut('perio', num(sn.peri / DEG, 1) + '°');
  }
  function acted() { state.acted = true; }
  function clearDemo() { if (state.demo) { state.demo = null; } }
  [elDoy, elHr, elElong, elNode, elPeri, elRate].forEach(function (el) {
    el.addEventListener('pointerdown', function () { sliderHeld = el; });
    el.addEventListener('pointerup', function () { sliderHeld = null; });
  });
  // 日期與時刻滑桿都是當地時間：先在當地日曆上改，再換回模型時間（臺灣兩者相同）
  elDoy.addEventListener('input', function () {
    const c = lcal(state.t);
    state.t = K.fromLocal(state.place, K.timeOf(c.year, Math.round(val(elDoy)) - 1, c.hour));
    snapCache = null; clearDemo(); acted();
    syncSliders(); requestDraw();
  });
  elHr.addEventListener('input', function () {
    const c = lcal(state.t);
    state.t = K.fromLocal(state.place, c.dayIndex + Math.min(23.9999, val(elHr)) / 24);
    snapCache = null; clearDemo(); acted();
    syncSliders(); requestDraw();
  });
  elRate.addEventListener('input', function () { state.rate = val(elRate); refreshOutputs(); });
  elElong.addEventListener('input', function () {
    setEl(K.placeElongation(state.el, state.t, val(elElong) * DEG));
    clearDemo(); acted(); syncSliders(); requestDraw();
  });
  elNode.addEventListener('input', function () {
    setEl(K.withNode(state.el, state.t, val(elNode) * DEG));
    clearDemo(); acted(); syncSliders(); requestDraw();
  });
  elPeri.addEventListener('input', function () {
    setEl(K.withPerigee(state.el, state.t, val(elPeri) * DEG));
    clearDemo(); acted(); syncSliders(); requestDraw();
  });
  [elDoy, elHr, elElong, elNode, elPeri].forEach(function (el) { el.addEventListener('change', function () { sliderHeld = null; emitState(); }); });
  ['regress', 'precess'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      setEl(K.withFlags(state.el, state.t, $('regress').checked, $('precess').checked));
      acted(); requestDraw(); emitState();
    });
  });
  [['showNames', 'names'], ['showShadow', 'shadow'], ['showInset', 'inset']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (ev) { state.show[p[1]] = ev.target.checked; requestDraw(); });
  });
  function setFrame(f) {
    state.frame = f;
    $('frSun').setAttribute('aria-pressed', String(f === 'sun'));
    $('frStar').setAttribute('aria-pressed', String(f === 'star'));
    requestDraw();
  }
  $('frSun').addEventListener('click', function () { setFrame('sun'); });
  $('frStar').addEventListener('click', function () { setFrame('star'); });
  function setScale(tr) {
    state.trueScale = tr;
    $('scMag').setAttribute('aria-pressed', String(!tr));
    $('scTrue').setAttribute('aria-pressed', String(tr));
    if (cw) L = layoutTop();
    if (view3) view3.onScale();
    requestDraw();
  }
  $('scMag').addEventListener('click', function () { setScale(false); });
  $('scTrue').addEventListener('click', function () { setScale(true); });

  function updateButtons() {
    $('play').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play');
  }
  $('play').addEventListener('click', function () {
    acted();
    if (state.tween) return;
    state.running = !state.running;
    updateButtons();
    if (state.running) schedule(); else emitState();
  });
  $('clear').addEventListener('click', function () {
    state.log = []; state.demo = null; logDirty = true;
    for (let i = 0; i < 4; i++) lastEv[i] = -1e9;
    setStatus(T('已清除事件紀錄與比較標記。', 'The event log and comparison marks are cleared.'));
    renderLog(); requestDraw();
  });
  $('dayBack').addEventListener('click', function () {
    acted(); clearDemo();
    if (state.tween) return;
    // 前後一天：當地的時刻不變（夏令時間切換的那天，實際經過 23 或 25 小時）
    state.t = K.fromLocal(state.place, localT(state.t) - 1); snapCache = null; syncSliders(); requestDraw(); emitState();
  });
  $('dayFwd').addEventListener('click', function () {
    acted(); clearDemo();
    if (state.tween) return;
    startTween(K.fromLocal(state.place, localT(state.t) + 1), function () { setStatus(T('前進 1 天：月球相對太陽向東移了約 12°，月出晚了約 50 分鐘。', 'One day later: the Moon has moved about 12° east of the Sun, and rises about 50 minutes later.')); }, 600);
  });
  $('sidMonth').addEventListener('click', function () {
    acted();
    if (state.tween) return;
    const sn = snap();
    const t1 = K.findMoonLon(state.el, state.t, sn.m.lon, 20);
    state.demo = { kind: 'sid', t0: state.t, lon0: sn.m.lon, dLam0: sn.ph.dLam, sun0: sn.s.lon, done: false, label: '' };
    const d = state.demo;
    startTween(t1, function () {
      const sn2 = snap();
      const lag = K.norm(d.dLam0 - sn2.ph.dLam);
      const more = K.findPhase(state.el, state.t, d.dLam0, 1) - state.t;
      d.done = true;
      d.label = T('還差 ' + num(lag / DEG, 1) + '°（約 ' + num(more, 2) + ' 天）', num(lag / DEG, 1) + '° to go (' + num(more, 2) + ' d)');
      setStatus(T('經過 ' + num(t1 - d.t0, 2) + ' 天（一個恆星月），月球回到出發時同一顆恆星的方向；但這段時間地球繞太陽走了 ' + num(K.norm(sn2.s.lon - d.sun0) / DEG, 1) + '°，所以月相還差 ' + num(lag / DEG, 1) + '°，要再約 ' + num(more, 2) + ' 天才回到同一個月相。',
        num(t1 - d.t0, 2) + ' days (one sidereal month): the Moon is back in the direction of the same star, but meanwhile the Earth has moved ' + num(K.norm(sn2.s.lon - d.sun0) / DEG, 1) + '° around the Sun, so the phase still lags by ' + num(lag / DEG, 1) + '° — about ' + num(more, 2) + ' more days.'));
      emit('step', { kind: 'sid', days: t1 - d.t0, lag: lag / DEG, more: more });
    });
  });
  $('synMonth').addEventListener('click', function () {
    acted();
    if (state.tween) return;
    const sn = snap();
    const t1 = K.findPhase(state.el, state.t + 20, sn.ph.dLam, 1);
    state.demo = { kind: 'syn', t0: state.t, lon0: sn.m.lon, dLam0: sn.ph.dLam, sun0: sn.s.lon, done: false, label: '' };
    const d = state.demo;
    startTween(t1, function () {
      const sn2 = snap();
      const extra = K.norm(sn2.m.lon - d.lon0);
      d.done = true;
      d.label = T('比恆星月多走 ' + num(extra / DEG, 1) + '°', num(extra / DEG, 1) + '° more than a sidereal month');
      setStatus(T('經過 ' + num(t1 - d.t0, 2) + ' 天，回到同一個月相（朔望月平均 29.53 天；月球在近地點附近走得快，所以每次略有不同）。這段時間月球相對恆星繞了 360° 再多 ' + num(extra / DEG, 1) + '°。',
        num(t1 - d.t0, 2) + ' days later the phase is the same again (the synodic month is 29.53 d on average; it varies because the Moon moves faster near perigee). Meanwhile the Moon has gone 360° plus ' + num(extra / DEG, 1) + '° around the stars.'));
      emit('step', { kind: 'syn', days: t1 - d.t0, extra: extra / DEG });
    });
  });
  function jumpPhase(target, kind) {
    acted(); clearDemo();
    if (state.tween) return;
    const t1 = K.findPhase(state.el, state.t, target, 1);
    startTween(t1, function () {
      const sn = snap();
      const e = kind === 'new' ? sn.solar : sn.lunar;
      setStatus(phaseName(kind) + T('：', ': ') + fmtWhen(state.t) + T('，照亮 ', ', ') + num(sn.ph.illum * 100, 2) + T('%。', '% lit. ') +
        (e.type !== 'none' ? eclName(kind === 'new' ? 'solar' : 'lunar', e.type, true) + T('！', '!') : T('月球離交點 ', 'The Moon is ') + num(sn.nodeDist / DEG, 1) + T('°，沒有發生食。', '° from a node: no eclipse.')));
      emit('step', { kind: kind });
    }, 900);
  }
  $('nextNew').addEventListener('click', function () { jumpPhase(0, 'new'); });
  $('nextFull').addEventListener('click', function () { jumpPhase(Math.PI, 'full'); });

  // 喇叭按鈕
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 拖曳（俯視圖） ----------
  function evPos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function hitTest(p) {
    if (!L || !L.handles || !L.moonP) return null;
    const d = function (q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); };
    const cand = [['moon', d(L.moonP), Math.max(L.rM, 4) + 14], ['asc', d(L.handles.asc), 18], ['desc', d(L.handles.desc), 18], ['peri', d(L.handles.peri), 14]];
    let best = null;
    cand.forEach(function (c) { if (c[1] <= c[2] && (!best || c[1] < best[1])) best = c; });
    return best ? best[0] : null;
  }
  function setHover(h) { if (state.hover !== h) { state.hover = h; cv.style.cursor = h ? 'grab' : 'default'; requestDraw(); } }
  function pointerLon(p) { return Math.atan2(-(p[1] - L.cy), p[0] - L.cx) + frameRot(); }
  let drag = null;
  cv.addEventListener('pointerdown', function (ev) {
    const p = evPos(ev), h = hitTest(p);
    if (!h) return;
    drag = { type: h, id: ev.pointerId };
    state.drag = drag;
    cv.setPointerCapture(ev.pointerId);
    cv.style.cursor = 'grabbing';
    acted(); clearDemo();
    ev.preventDefault();
    requestDraw();
  });
  cv.addEventListener('touchstart', function (ev) {
    const t = ev.touches[0]; if (!t) return;
    const r = cv.getBoundingClientRect();
    if (hitTest([t.clientX - r.left, t.clientY - r.top])) ev.preventDefault();
  }, { passive: false });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(ev);
    if (!drag) { if (ev.pointerType !== 'touch') setHover(hitTest(p)); return; }
    let lon = pointerLon(p);
    if (drag.type === 'moon') {
      // 靠近四個主要月相時自動對齊（±1.5°）
      let dl = K.norm(lon - K.sunLon(state.t));
      for (let k = 0; k <= 4; k++) if (Math.abs(dl - k * Math.PI / 2) < 1.5 * DEG) dl = (k % 4) * Math.PI / 2;
      setEl(K.placeElongation(state.el, state.t, dl));
    } else if (drag.type === 'asc' || drag.type === 'desc') {
      if (drag.type === 'desc') lon += Math.PI;
      setEl(K.withNode(state.el, state.t, K.norm(lon)));
    } else if (drag.type === 'peri') {
      setEl(K.withPerigee(state.el, state.t, K.norm(lon)));
    }
    syncSliders();
    requestDraw();
  });
  function endDrag(ev) {
    if (!drag) return;
    drag = null; state.drag = null;
    setHover(ev && ev.pointerType === 'mouse' ? hitTest(evPos(ev)) : null);
    emitState();
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag) setHover(null); });

  // =====================================================================
  // 任務（missions.js）：回報物理量
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  /**
   * 'state' 的資料。日期、時刻是所選地點的當地時間（臺灣與原本相同）。
   * 任務 4（黃昏的眉月）、6（上弦月幾點升起）、12（臺灣的日全食）的條件寫的是「臺灣」的天空：
   * 選了別的地點時，地平座標與當地日食一律回報「無」（NaN／'none'），這三個任務只在選臺灣時判定，不會被別的城市的天空誤判。
   */
  function missionData() {
    const sn = snap(), tw = isTW();
    return {
      dLam: sn.ph.dLam / DEG, illum: sn.ph.illum, phase: sn.key, age: moonAge(),
      hour: sn.cal.hour, month: sn.cal.month, day: sn.cal.day, doy: sn.cal.doy, year: sn.cal.year,
      place: state.place.id, placeLat: state.place.lat, placeLon: state.place.lon,
      moonAlt: tw ? sn.hm.alt / DEG : NaN, moonAz: tw ? sn.hm.az / DEG : NaN, sunAlt: tw ? sn.hs.alt / DEG : NaN, sunAz: tw ? sn.hs.az / DEG : NaN, rising: tw ? sn.rising : false,
      lunar: sn.lunar.type, magU: sn.lunar.magU, magP: sn.lunar.magP,
      solar: sn.solar.type, central: sn.solar.central, gamma: sn.solar.gamma, ruSurface: sn.solar.ruSurface,
      local: tw ? sn.loc.type : 'none', localMag: tw ? sn.loc.mag : NaN, dist: sn.m.r, moonDiam: 2 * Math.asin(K.R_MOON / sn.m.r) * RAD2MIN,
      lat: sn.m.lat / DEG, nodeDist: sn.nodeDist / DEG, sunNode: sn.sunNode / DEG, dec: sn.dec / DEG,
      trueScale: state.trueScale, frame: state.frame, regress: state.el.regress, precess: state.el.precess
    };
  }
  function emitState() { announce(); if (state.acted) emit('state', missionData()); }

  // =====================================================================
  // 無障礙：鍵盤操作、讀數播報、其他畫布的文字說明
  // =====================================================================
  /** 離散事件（放開滑桿、拖曳結束、跳到某一天、暫停）時，把主要結果寫進 aria-live 區（至少間隔 1 秒） */
  let announceTimer = 0, announceAt = 0;
  function summary() {
    const sn = snap(), day = today();
    const tc = function (x) { return rsText(day.moon, x); };
    let e = T('沒有日月食', 'no eclipse');
    if (sn.lunar.type !== 'none') e = eclName('lunar', sn.lunar.type);
    else if (sn.solar.type !== 'none') e = eclName('solar', sn.solar.type);
    const nm = placeName();
    return nm.charAt(0).toUpperCase() + nm.slice(1) + T(' ', ', ') + fmtWhen(state.t) + T('（當地時間）：', ' (local time): ') + phaseName(sn.key) + T('，照亮 ', ', ') + num(sn.ph.illum * 100, 1) + T('%；月出 ', '% lit; moonrise ') + tc(day.moon.rise) +
      T('、月落 ', ', moonset ') + tc(day.moon.set) + T('；月亮高度 ', '; Moon altitude ') + num(sn.hm.alt / DEG, 0) + T('°；', '°; ') + e + T('。', '.');
  }
  /** prefix：放在摘要前面的一句話（例如換了地點） */
  let announcePrefix = '';
  function announce(prefix) {
    clearTimeout(announceTimer);
    if (prefix) announcePrefix = prefix;   // 1 秒內又有新的播報時，換地點的那一句不要被蓋掉
    const wait = Math.max(0, 1000 - (performance.now() - announceAt));
    announceTimer = setTimeout(function () {
      announceAt = performance.now();
      const s = announcePrefix + summary(), el = $('srLive');
      announcePrefix = '';
      if (el && el.textContent !== s) el.textContent = s;
      describeCanvases();
    }, wait);
  }
  function describeCanvases() {
    const sn = snap();
    const lu = sn.lunar.type !== 'none' ? T('，', ', ') + eclName('lunar', sn.lunar.type) : '';
    // 近照裡亮面的方向：亮邊相對月球北極的角度，再加上畫面固定的方向
    const limbImg = sn.ori.limb - sn.ori.north + Math.PI / 2 + moonFaceRot();
    mcv.setAttribute('aria-label', T('從地球看到的月亮：', 'The Moon seen from the Earth: ') + phaseName(sn.key) + T('，照亮 ', ', ') + num(sn.ph.illum * 100, 0) + '%' + lu +
      T('；畫面中亮面朝', '; in the picture the bright side is toward the ') + limbWords(limbImg).replace(/（.*）| \(.*\)/, '') +
      (state.place.lat < 0 ? T('（月球南極朝上）', ' (lunar south up)') : T('（月球北極朝上）', ' (lunar north up)')));
    const side = Math.cos(sn.ph.dLam) < 0;
    scv.setAttribute('aria-label', side
      ? T('影子截面：地球的本影與半影在月球距離處，月食：', 'Shadow cross-section: the Earth’s umbra and penumbra at the Moon’s distance; lunar eclipse: ') + eclName('lunar', sn.lunar.type)
      : T('影子截面：月球的影子落在地球上，日食：', 'Shadow cross-section: the Moon’s shadow on the Earth; solar eclipse: ') + eclName('solar', sn.solar.type));
    kcv.setAttribute('aria-label', T('從' + placeName() + '看的天空（面向' + (skyFacesNorth() ? '北' : '南') + '方的全景）：月亮高度 ', 'The sky seen from ' + placeName() + ' (panorama facing ' + (skyFacesNorth() ? 'north' : 'south') + '): Moon altitude ') + num(sn.hm.alt / DEG, 0) + T('°、方位 ', '°, direction ') + azName(sn.hm.az) +
      T('；太陽高度 ', '; Sun altitude ') + num(sn.hs.alt / DEG, 0) + '°');
  }

  // 鍵盤：Enter 切換月球、升交點、近地點，方向鍵移動（右、上 = 逆時針，也就是黃經增加）
  const kbItems = [
    {
      name: function () { return T('月球', 'Moon'); },
      move: function (dx, dy, big) {
        const d = (dx || dy) * (big ? 10 : 1) * DEG;
        setEl(K.placeElongation(state.el, state.t, K.norm(snap().ph.dLam + d)));
        return true;
      },
      describe: function () { const sn = snap(); return T('月球與太陽的黃經差 ', 'Moon–Sun longitude difference ') + num(sn.ph.dLam / DEG, 0) + T('°，', '°, ') + phaseName(sn.key) + T('，照亮 ', ', lit ') + num(sn.ph.illum * 100, 0) + '%'; }
    },
    {
      name: function () { return T('升交點', 'Ascending node'); },
      move: function (dx, dy, big) { setEl(K.withNode(state.el, state.t, K.norm(snap().node + (dx || dy) * (big ? 10 : 1) * DEG))); return true; },
      describe: function () { const sn = snap(); return T('升交點黃經 ', 'Ascending node longitude ') + num(sn.node / DEG, 0) + T('°；交點線與太陽方向夾 ', '°; line of nodes ') + num(sn.sunNode / DEG, 0) + T('°', '° from the Sun'); }
    },
    {
      name: function () { return T('近地點', 'Perigee'); },
      move: function (dx, dy, big) { setEl(K.withPerigee(state.el, state.t, K.norm(snap().peri + (dx || dy) * (big ? 10 : 1) * DEG))); return true; },
      describe: function () { const sn = snap(); return T('近地點黃經 ', 'Perigee longitude ') + num(sn.peri / DEG, 0) + T('°；月地距離 ', '°; Earth–Moon distance ') + group(sn.m.r) + ' km'; }
    }
  ];
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('俯視的太陽、地球與月球軌道圖。按 Enter 切換月球、升交點、近地點，方向鍵移動（右或上是逆時針），Shift 加方向鍵一次 10°。',
      'Top view of the Sun, the Earth and the Moon’s orbit. Press Enter to switch between the Moon, the ascending node and the perigee; the arrow keys move it (right or up is counterclockwise), Shift with an arrow key moves 10°.'),
    items: kbItems,
    onChange: function () { requestDraw(); }
  }) : null;
  cv.addEventListener('lab:keymove', function () { acted(); clearDemo(); syncSliders(); emitState(); });
  function drawKbFocus(c) {
    if (!kb || !kb.focused() || !L || !L.handles) return;
    const i = kb.index();
    const p = i === 0 ? L.moonP : i === 1 ? L.handles.asc : L.handles.peri;
    if (!p) return;
    const r = i === 0 ? Math.max(L.rM, 4) + 10 : 14;
    c.save();
    c.setLineDash([5, 4]);
    c.strokeStyle = C.accent;
    c.lineWidth = 2;
    D.roundRect(c, p[0] - r, p[1] - r, 2 * r, 2 * r, 6);
    c.stroke();
    c.restore();
  }

  // 分享連結：時間與月球軌道要精確還原（滑桿的間隔是 1°，做日月食需要更細），再加上觀測地點
  // （p：城市代號；手動輸入時 p = 'man' 並帶 la、lo、uo＝緯度、經度、UTC 偏移）。舊的連結沒有 p，就維持預設的臺灣。
  // classroom.js 在 DOMContentLoaded 之後才動態載入，所以用佇列登記（還原在 load 之後才進行）；
  // 地點選單與輸入框加了 data-share-skip，只由這裡記錄，避免還原時先觸發「保持當地時間」而改到時間。
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const e = state.el, p = state.place;
      const o = { t: +state.t.toFixed(6), L0: +e.L0.toFixed(8), N0: +e.N0.toFixed(8), W0: +e.W0.toFixed(8), rg: e.regress ? 1 : 0, pr: e.precess ? 1 : 0, p: p.id };
      if (p.id === 'man') { o.la = p.lat; o.lo = p.lon; o.uo = p.utc; }
      return o;
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const ok = function (v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; };
      // 地點：未知的代號忽略；手動輸入的數字缺少或超出範圍時，用 manualPlace 夾到合理範圍（缺經度用 0、缺 UTC 偏移就由經度估）
      if (typeof o.p === 'string') {
        let np = null;
        if (o.p === 'man') np = K.manualPlace(ok(o.la, -1e3, 1e3) ? o.la : 0, ok(o.lo, -1e3, 1e3) ? o.lo : 0, ok(o.uo, -1e3, 1e3) ? o.uo : null);
        else np = K.placeById(o.p);
        if (np) applyPlace(np, { keepInstant: true, quiet: true });
      }
      if (ok(o.t, -1e6, 1e6)) state.t = o.t;
      const e = Object.assign({}, state.el);
      if (o.rg === 0 || o.rg === 1) e.regress = !!o.rg;
      if (o.pr === 0 || o.pr === 1) e.precess = !!o.pr;
      if (ok(o.L0, -1e7, 1e7)) e.L0 = o.L0;
      if (ok(o.N0, -1e7, 1e7)) e.N0 = o.N0;
      if (ok(o.W0, -1e7, 1e7)) e.W0 = o.W0;
      $('regress').checked = e.regress; $('precess').checked = e.precess;
      setEl(e);
      state.running = false; state.tween = null; state.demo = null;
      updateButtons(); syncSliders(); requestDraw(); announce();
    }
  });

  // =====================================================================
  // 觀測地點：選單（第 1 項手動輸入經緯度、第 2 項臺灣＝預設、其餘 18 個城市）
  // =====================================================================
  const elPlace = $('place'), manBox = $('manBox'), elLat = $('mLat'), elLon = $('mLon'), elUtc = $('mUtc');
  let utcAuto = true;   // 手動輸入時，UTC 偏移跟著經度估算，直到使用者自己改過
  (function buildPlaceOptions() {
    const opt = function (v, txt) { const o = document.createElement('option'); o.value = v; o.textContent = txt; return o; };
    elPlace.appendChild(opt('man', T('手動輸入經緯度', 'Enter latitude and longitude')));
    K.PLACES.forEach(function (p) { elPlace.appendChild(opt(p.id, T(p.zh, p.en))); });
    elPlace.value = state.place.id;
  })();
  function fmtIn(v) { return String(Math.round(v * 10000) / 10000); }
  /** 選單、手動輸入框、說明文字，以及頁面上寫著地點名稱的地方 */
  function updatePlaceUI() {
    const p = state.place, man = p.id === 'man', nm = placeName();
    if (elPlace.value !== p.id) elPlace.value = p.id;
    manBox.hidden = !man;
    if (man) {
      if (document.activeElement !== elLat) elLat.value = fmtIn(p.lat);
      if (document.activeElement !== elLon) elLon.value = fmtIn(p.lon);
      if (document.activeElement !== elUtc) elUtc.value = fmtIn(p.utc);
    }
    const off = K.utcOffset(p, state.t);
    let zone;
    if (man) zone = T('固定 ' + utcText(p.utc) + '（手動輸入不計夏令時間）', 'fixed ' + utcText(p.utc) + ' (no daylight saving for a typed location)');
    else if (!p.tz) zone = utcText(off) + T('（沒有夏令時間）', ' (no daylight saving)');
    else {
      const std = state.stdOff, alt = K.utcOffset(p, K.timeOf(0, K.doyOf(p.lat >= 0 ? 7 : 1, 15), 12));
      zone = T('標準時間 ', 'standard time ') + utcText(std) + (alt !== std ? T('，夏令時間 ', ', daylight saving ') + utcText(alt) : T('，沒有夏令時間', ', no daylight saving')) +
        T('；現在 ', '; now ') + utcText(off);
    }
    $('placeInfo').innerHTML = '<b>' + latText(p.lat) + T('、', ', ') + lonText(p.lon) + '</b>' + T('・', ' · ') + zone;
    document.querySelectorAll('.plc').forEach(function (s) { if (s.textContent !== nm) s.textContent = nm; });
    $('hSky').textContent = T('從' + nm + '看', 'Seen from ' + nm);
    $('dtLocal').textContent = T(nm + '看到的日食', 'Solar eclipse seen from ' + nm);
    setHTML('moonCap', moonCapText(snap().solar.type !== 'none'));
    $('skyCap').innerHTML = T('<b>從' + nm + '看的天空</b>（' + latText(p.lat) + '、' + lonText(p.lon) + '）——面向' + (skyFacesNorth() ? '北' : '南') + '方的 360° 全景，虛線是今天的路徑，時刻是當地時間',
      '<b>The sky from ' + nm + '</b> (' + latText(p.lat) + ', ' + lonText(p.lon) + ') — a 360° panorama facing ' + (skyFacesNorth() ? 'north' : 'south') + '; dashed lines are today’s paths, times are local');
  }
  /**
   * 換觀測地點。預設保持「當地的日期與時刻」（例如都看當地 18:30 的天空），所以真實的瞬間會差幾個小時；
   * keepInstant：保持同一瞬間（還原分享連結時）。quiet：不播報、不寫狀態列。
   */
  function applyPlace(np, opt) {
    opt = opt || {};
    const t0 = state.t, lt0 = localT(t0), dl0 = snap().ph.dLam;
    state.place = np; placeVer++;
    state.stdOff = K.standardOffset(np);
    if (!opt.keepInstant) state.t = K.fromLocal(np, lt0);
    snapCache = null; dayCache = null; logDirty = true; moonKey = ''; skyKey = '';
    for (const id in lastText) delete lastText[id];
    updatePlaceUI(); syncSliders(); requestDraw();
    if (opt.quiet) return;
    const nm = placeName(), dh = (state.t - t0) * 24;
    if (Math.abs(dh) > 1e-6) {
      const dd = K.wrapPi(snap().ph.dLam - dl0) / DEG;
      setStatus(T('換到' + nm + '：當地時間一樣是 ' + fmtWhen(state.t) + '，那是剛才的' + (dh > 0 ? '後 ' : '前 ') + num(Math.abs(dh), Math.abs(dh) % 1 ? 1 : 0) + ' 小時（時差），月球相對太陽' + (dh > 0 ? '多' : '少') + '走了 ' + num(Math.abs(dd), 1) + '°。',
        'Now at ' + nm + ': the local time is still ' + fmtWhen(state.t) + ', which is ' + num(Math.abs(dh), Math.abs(dh) % 1 ? 1 : 0) + ' h ' + (dh > 0 ? 'later' : 'earlier') + ' than before (time difference), so the Moon has moved ' + num(Math.abs(dd), 1) + '° ' + (dh > 0 ? 'further' : 'less') + ' relative to the Sun.'));
    } else setStatus(T('換到' + nm + '。', 'Now at ' + nm + '.'));
    announce(T('觀測地點換到' + nm + '（' + latText(np.lat) + '、' + lonText(np.lon) + '）。', 'Location changed to ' + nm + ' (' + latText(np.lat) + ', ' + lonText(np.lon) + '). '));
    if (state.acted) emit('state', missionData());
  }
  elPlace.addEventListener('change', function () {
    acted(); clearDemo();
    if (state.tween) { state.tween = null; updateButtons(); }
    const id = elPlace.value;
    if (id === 'man') {
      // 從目前的地點開始改（經緯度與 UTC 偏移先帶入目前的值）
      const p = state.place;
      utcAuto = true;
      applyPlace(K.manualPlace(p.lat, p.lon, p.id === 'man' ? p.utc : K.utcOffset(p, state.t)));
    } else {
      const np = K.placeById(id);
      if (np) applyPlace(np);
    }
  });
  /** 手動輸入框：打字時（數字合理就）立刻套用；離開或按 Enter 時把超出範圍的值夾回、寫回輸入框 */
  function manualFromInputs(commit) {
    const la = parseFloat(elLat.value), lo = parseFloat(elLon.value), u = parseFloat(elUtc.value);
    const okLa = isFinite(la) && la >= -90 && la <= 90, okLo = isFinite(lo) && lo >= -180 && lo <= 180;
    const okU = isFinite(u) && u >= K.UTC_MIN && u <= K.UTC_MAX;
    if (!commit && !(okLa && okLo && okU)) return;     // 打到一半（例如只打了「−」）先不動
    // 空白或不是數字：緯度、經度維持原值；UTC 偏移空白就由經度估算（manualPlace 的預設）
    const np = K.manualPlace(isFinite(la) ? la : state.place.lat, isFinite(lo) ? lo : state.place.lon, isFinite(u) ? u : null);
    const same = np.lat === state.place.lat && np.lon === state.place.lon && np.utc === state.place.utc;
    if (!same) applyPlace(np, { quiet: !commit });
    else if (commit) {
      setStatus(T('自訂地點：' + latText(np.lat) + '、' + lonText(np.lon) + '，固定 ' + utcText(np.utc) + '（不計夏令時間），當地時間 ' + fmtWhen(state.t) + '。',
        'Custom location: ' + latText(np.lat) + ', ' + lonText(np.lon) + ', fixed ' + utcText(np.utc) + ' (no daylight saving); local time ' + fmtWhen(state.t) + '.'));
      announce(T('觀測地點：' + latText(np.lat) + '、' + lonText(np.lon) + '，' + utcText(np.utc) + '。', 'Location: ' + latText(np.lat) + ', ' + lonText(np.lon) + ', ' + utcText(np.utc) + '. '));
      if (state.acted) emit('state', missionData());
    }
    if (commit) {
      elLat.value = fmtIn(np.lat); elLon.value = fmtIn(np.lon); elUtc.value = fmtIn(np.utc);
      if ((isFinite(la) && la !== np.lat) || (isFinite(lo) && lo !== np.lon) || (isFinite(u) && u !== np.utc)) {
        setStatus(T('緯度要在 −90°～90°、經度在 −180°～180°、UTC 偏移在 −12～+14 小時（取到 0.25 小時），已調整到範圍內。',
          'Latitude must be −90° to 90°, longitude −180° to 180° and the UTC offset −12 to +14 hours (in steps of 0.25 h); the value was brought into range.'));
      }
    }
  }
  /** 改經度時，UTC 偏移跟著估算 round(經度/15)（使用者自己改過 UTC 偏移之後就不再自動） */
  function autoUtc() {
    const lo = parseFloat(elLon.value);
    if (utcAuto && isFinite(lo)) elUtc.value = fmtIn(K.defaultUtc(Math.max(-180, Math.min(180, lo))));
  }
  elLat.addEventListener('input', function () { acted(); manualFromInputs(false); });
  elLat.addEventListener('change', function () { acted(); manualFromInputs(true); });
  elLon.addEventListener('input', function () { acted(); autoUtc(); manualFromInputs(false); });
  elLon.addEventListener('change', function () { acted(); autoUtc(); manualFromInputs(true); });
  elUtc.addEventListener('input', function () { utcAuto = false; acted(); manualFromInputs(false); });
  elUtc.addEventListener('change', function () { utcAuto = false; acted(); manualFromInputs(true); });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0, drawPending = false;
  function requestDraw() { drawPending = true; schedule(); }
  function schedule() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(now) {
    raf = 0;
    const dt = lastFrame ? Math.min(1 / 30, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    let moved = false;
    if (state.tween) { stepTween(now); moved = true; }
    else if (state.running && !document.hidden) { advance(state.rate / 24 * dt); moved = true; }
    if (moved) syncSliders();
    drawAll(moved);
    drawPending = false;
    if (state.running || state.tween || (view3 && view3.active && view3.busy())) raf = requestAnimationFrame(loop);
    else lastFrame = 0;
  }
  function drawAll(moved) {
    const is3 = !!(view3 && view3.active);
    if (is3) view3.frame(); else drawTop();
    drawMoonView(!moved);
    drawSection();
    drawSky(!moved);
    updateReadouts(!moved);
    renderLog();
    // 進入全食／環食時的音效（拖曳或時間經過都算，一次一聲）
    const sn = snap();
    const key = (sn.lunar.type === 'total' ? 'L' : '') + (sn.solar.type === 'total' || sn.solar.type === 'annular' ? 'S' + sn.solar.type : '');
    if (key !== state.eclKey) {
      if (key && key.length > state.eclKey.length) chime(true);
      state.eclKey = key;
    }
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/moon-phases-3d.js 與 three.js（以 import() 動態載入）；
  // 切回 2D 時整個釋放。3D 畫的是同一份物理（bridge 把狀態與核心交給它）。
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, snap: snap, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, group: group, fmtWhen: fmtWhen, phaseName: phaseName, eclName: eclName,
    mag: function () { return state.trueScale ? 1 : 8; },
    frameRot: function () { return frameRot(); },
    lang: function () { return LabSettingsKey(); },
    placeName: function () { return placeName(); },
    fbm: fbm, whenMoonImage: whenMoonImage,
    request: function () { schedule(); },
    onCam: function (kind) { emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Moon3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Moon3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/moon-phases-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Moon3D) throw new Error('moon-phases-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewNotes() {
    const is3 = !!(view3 && view3.active);
    $('resetCam').hidden = !is3;
    $('camBar').hidden = !is3;
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.Moon3D.create(lib, host3, bridge);
        stage.classList.add('is3d');
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
        requestDraw();
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
      resizeTop();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateViewNotes();
    resizeTop();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('camEdge').addEventListener('click', function () { if (view3) { view3.camTo('edge'); bridge.onCam('edge'); } });
  $('camSun').addEventListener('click', function () { if (view3) { view3.camTo('sun'); bridge.onCam('sun'); } });
  $('camTop').addEventListener('click', function () { if (view3) { view3.camTo('top'); bridge.onCam('top'); } });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  // 手機：俯視圖較小，左上角的小圖預設收起（可以在「顯示」勾回來）
  if (cv.clientWidth && cv.clientWidth < 560) { state.show.inset = false; $('showInset').checked = false; }
  if (window.LabNum) window.LabNum.set(elRate, DEF.rate); else elRate.value = 259;
  state.rate = val(elRate);
  state.acted = false; // LabNum.set 觸發的事件不算使用者操作
  state.stdOff = K.standardOffset(state.place);
  syncSliders();
  updatePlaceUI();
  describeCanvases();
  updateButtons();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastText) delete lastText[id];
    moonKey = ''; skyKey = '';
    logDirty = true;
    if (view3 && view3.active) view3.onTheme();
    refreshOutputs();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    const watch = function (el, fn) { let lw = 0; new ResizeObserver(function () { if (el.clientWidth !== lw) { lw = el.clientWidth; fn(); } }).observe(el); };
    watch(cv, resizeTop); watch(mcv, resizeMoon); watch(scv, resizeSec); watch(kcv, resizeSky);
  } else window.addEventListener('resize', function () { resizeTop(); resizeMoon(); resizeSec(); resizeSky(); });
  resizeTop(); resizeMoon(); resizeSec(); resizeSky();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; schedule(); } });
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」讓時間前進。', 'Reduced motion is on: press “Play” to move time forward.'));
  requestDraw();
  // 測試用（Playwright）：讀取狀態
  window.__moon = {
    state: state, snap: snap, K: K, today: today, missionData: missionData,
    setEl: function (el) { setEl(el); syncSliders(); requestDraw(); },
    setPlace: function (id, la, lo, uo) { applyPlace(id === 'man' ? K.manualPlace(la, lo, uo) : K.placeById(id)); }
  };
})();
