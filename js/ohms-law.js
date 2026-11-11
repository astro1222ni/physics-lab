/* ohms-law.js — 「歐姆定律與電路」課本實驗的畫面與互動（物理計算在 ohms-law-core.js） */
(function () {
  'use strict';
  const K = window.OhmsLawCore;
  const LD = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FF = LD.FONT;
  const reducedMotion = LD.reducedMotion();

  // ---------- 固定的畫面比例（畫面說明中有寫） ----------
  const DOT_SPEED = 60;   // 滿刻度電流（目前毫安培計檔位）時電荷每秒移動 60 px（以 820 px 寬的畫面為準）
  const DOT_MAX = 3;      // 超過量程時，速率最多到 3 倍
  const DOT_GAP = 15;     // 電荷間距（px）
  const A_DIVS = K.AMMETER.divs, V_DIVS = K.VOLTMETER.divs;
  const A_DEC = [2, 1, 0], V_DEC = [2, 2];  // 含誤差時讀數的小數位數（半小格）；理想時多一位

  // ---------- 待測元件 ----------
  const MYST = K.mysteryX();
  const ORDER = ['a', 'b', 'c', 'd', 'e', 'carbon', 'X', 'lamp'];
  function trueR(key) {
    if (K.WIRES[key]) return K.wireR(K.WIRES[key]);
    if (key === 'carbon') return K.CARBON.actual;
    if (key === 'X') return MYST.actual;
    return null; // 燈泡：電阻隨溫度改變
  }
  function elemName(key) {
    const n = {
      a: ['銅線 a', 'Cu wire a'], b: ['銅線 b', 'Cu wire b'], c: ['銅線 c', 'Cu wire c'], d: ['銅線 d', 'Cu wire d'],
      e: ['鎳鉻線 e', 'NiCr wire e'], carbon: ['碳膜電阻', 'Carbon resistor'], X: ['神秘電阻 X', 'Mystery X'], lamp: ['小燈泡', 'Bulb']
    }[key];
    return T(n[0], n[1]);
  }
  function methodName(m, short) {
    if (short) return m === 'ext' ? T('外接', 'outside') : T('內接', 'inside');
    return m === 'ext' ? T('安培計外接法', 'ammeter outside') : T('安培計內接法', 'ammeter inside');
  }

  // ---------- 狀態 ----------
  const state = {
    el: 'b', method: 'int', ra: 1, rv: 0, ideal: true,
    emf: 1, box: 10,
    zero: { A: 0, V: 0 }, zeroed: { A: false, V: false }, zeroMade: false,
    burnt: false, revealed: false,
    pts: [], latest: -1, nextId: 1,
    dmm: null, lampCold: null, dmmEls: {},
    touched: { el: false, m: false },
    sol: null, rd: null, overPrev: { A: false, V: false },
    needle: { A: { p: 0, v: 0 }, V: { p: 0, v: 0 } },
    msg: '', warn: false
  };

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    LD.refresh();
    const cs = getComputedStyle(document.documentElement);
    C = Object.assign({}, LD.c);
    ['--b-em'].forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    C.dark = LD.dark;
    // 實驗器材的顏色都由色彩代號調出來（深淺色模式各自調整）
    C.red = C.pos;
    C.black = C.dark ? LD.mix(C.muted, C['canvas-bg'], 0.42) : LD.shade(C.text, -0.25);
    C.housing = C.dark ? LD.mix(C.surface, C.text, 0.17) : LD.mix(C.text, C.surface, 0.1);
    C.housingHi = LD.shade(C.housing, C.dark ? 0.12 : 0.18);
    C.face = C.dark ? LD.mix(C.text, C.surface, 0.12) : LD.mix(C.surface, C.equi, 0.045);
    C.ink = C.dark ? LD.mix(C.surface, C['canvas-bg'], 0.2) : C.text;
    C.metal = C.dark ? LD.mix(C.muted, C.text, 0.35) : LD.mix(C.muted, C.surface, 0.35);
    C.brass = LD.mix(C.equi, C.surface, C.dark ? 0.25 : 0.35);
    C.copper = LD.mix(C.equi, C.pos, 0.38);
    C.nichrome = LD.mix(C.muted, C.surface, C.dark ? 0.15 : 0.4);
    C.wood = C.dark ? LD.mix(C.equi, C.surface, 0.72) : LD.mix(C.equi, C.surface, 0.8);
    C.caseCol = C.dark ? LD.mix(C.surface, C.text, 0.1) : LD.mix(C.surface, C.muted, 0.12);
    C.lcd = C.dark ? LD.shade(C['canvas-bg'], -0.4) : LD.shade(C.field, -0.55);
    C.lcdInk = C.dark ? C.probe : LD.shade(C.probe, 0.35);
    C.dot = C.dark ? LD.shade(C.equi, 0.15) : LD.shade(C.equi, 0.25);
  }
  /** 燈絲的光色：溫度愈高愈偏白（只用 --equi 與 --pos 調出暖色） */
  function glowColor(Tk) {
    const warmC = (function () { const r = LD.rgb(C.equi), k = 255 / Math.max(1, r[0], r[1], r[2]); return 'rgb(' + r.map(function (x) { return Math.round(Math.min(255, x * k)); }).join(',') + ')'; })();
    const u = Math.max(0, Math.min(1, (Tk - 900) / 1700));
    return u < 0.5 ? LD.mix(LD.mix(C.pos, warmC, 0.35), warmC, u * 2) : LD.mix(warmC, '#ffffff', (u - 0.5) * 1.1);
  }
  /** 色環的顏色（色碼本身有物理意義，所以用真實顏色，不是介面配色） */
  const BAND = { black: '#1d1d1d', brown: '#7b4a26', red: '#d23a2e', orange: '#ec8a1e', yellow: '#efd21c', green: '#2f9a4a',
    blue: '#2f62c9', violet: '#7c4bc0', grey: '#8b8f93', white: '#f4f4f4', gold: '#c9a33b' };

  // ---------- 格式 ----------
  function fix(v, d) { return (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d); }
  function sig(v, n) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(v))));
    return v.toFixed(Math.min(6, d));
  }
  function fmtR(R, n) {
    if (R == null || !isFinite(R)) return '∞';
    if (R >= 1e4) return sig(R / 1000, n || 4) + ' kΩ';
    return sig(R, n || 4) + ' Ω';
  }
  function pct(x, d) { return (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d == null ? 1 : d) + '%'; }
  function aDec(r, ideal) { return A_DEC[r] + (ideal ? 1 : 0); }
  function vDec(r, ideal) { return V_DEC[r] + (ideal ? 1 : 0); }

  // ---------- 電路 ----------
  function fsA() { return K.AMMETER.ranges[state.ra]; }
  function fsV() { return K.VOLTMETER.ranges[state.rv]; }
  function elemDef() {
    if (state.el === 'lamp') return state.burnt ? { kind: 'open' } : { kind: 'lamp' };
    return { kind: 'R', R: trueR(state.el) };
  }
  function cfg() {
    return { emf: state.emf, rs: K.SUPPLY.r, Rbox: state.box, rA: K.ammeterR(fsA()), rV: K.voltmeterR(fsV()), method: state.method, elem: elemDef() };
  }
  /** 解電路、處理燈絲燒斷、產生讀數（含誤差時每次重新估讀） */
  function solve() {
    let s = K.bench(cfg());
    let burnNow = false;
    if (s.burn && state.el === 'lamp' && !state.burnt) {
      state.burnt = true; burnNow = true;
      s = K.bench(cfg());
    }
    state.sol = s;
    reread();
    return burnNow;
  }
  function reread() {
    const s = state.sol;
    const ideal = state.ideal;
    state.rd = {
      A: K.readMeter(s.IA, fsA(), A_DIVS, { ideal: ideal, zero: ideal ? 0 : state.zero.A }),
      V: K.readMeter(s.VV, fsV(), V_DIVS, { ideal: ideal, zero: ideal ? 0 : state.zero.V })
    };
  }

  // ======================= 數據 =======================
  function series(el, m) { return state.pts.filter(function (p) { return p.el === el && p.m === m; }); }
  function fitOf(list, el, m) {
    const use = list.filter(function (p) { return p.V > 0; });
    if (!use.length) return null;
    const f = K.fitOrigin(use.map(function (p) { return p.V; }), use.map(function (p) { return p.I; }));
    if (!f || !(f.k > 0)) return null;
    const Rt = trueR(el);
    const R = 1 / f.k;
    let vmin = Infinity, vmax = 0;
    use.forEach(function (p) { vmin = Math.min(vmin, p.V); vmax = Math.max(vmax, p.V); });
    // 含截距直線的截距標準誤差（判斷「沒有通過原點」是不是只是讀數誤差）
    let icptSE = NaN;
    const n = use.length;
    if (n >= 3 && isFinite(f.icpt)) {
      let mx = 0, sxx = 0, ssr = 0;
      use.forEach(function (p) { mx += p.V / n; });
      use.forEach(function (p) { sxx += (p.V - mx) * (p.V - mx); const r = p.I - f.icpt - f.slope * p.V; ssr += r * r; });
      if (sxx > 0) icptSE = Math.sqrt(ssr / (n - 2) * (1 / n + mx * mx / sxx));
    }
    return { icptSE: icptSE,
      el: el, m: m, n: list.length, R: R, k: f.k, r2: f.r2, slope: f.slope, icpt: f.icpt, maxRel: f.maxRel,
      Rtrue: Rt, err: Rt ? R / Rt - 1 : null, vmin: vmin, vmax: vmax,
      allReal: list.every(function (p) { return !p.ideal && p.zeroed; })
    };
  }
  function allFits() {
    const out = {};
    ORDER.forEach(function (el) {
      ['ext', 'int'].forEach(function (m) {
        const l = series(el, m);
        if (l.length) { const f = fitOf(l, el, m); out[el + '|' + m] = f || { el: el, m: m, n: l.length, R: NaN, err: null }; }
      });
    });
    return out;
  }
  function lampStats() {
    const L = state.pts.filter(function (p) { return p.el === 'lamp' && p.V > 0 && p.I > 0; });
    if (!L.length) return { n: 0, ratio: 0, rmin: NaN, rmax: NaN, vmin: NaN, vmax: NaN };
    let rmin = Infinity, rmax = 0, vmin = Infinity, vmax = 0;
    L.forEach(function (p) { const r = p.V / p.I; rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); vmin = Math.min(vmin, p.V); vmax = Math.max(vmax, p.V); });
    return { n: L.length, ratio: rmax / rmin, rmin: rmin, rmax: rmax, vmin: vmin, vmax: vmax };
  }

  // ======================= 畫布：實驗桌 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const stat = document.createElement('canvas'), sctx = stat.getContext('2d');
  let B = null;            // 版面
  let cables = [];         // 導線（取樣點、長度、電流）
  const phase = {};        // 各導線上電荷的位移

  function benchLayout(W) {
    const wide = W >= 560;
    let s, ox = 0, H, R;
    if (wide) {
      s = W / 820; H = Math.round(468 * s);
      R = {
        am: [18, 12, 232, 204], vm: [570, 12, 232, 204],
        board: [286, 232, 248, 96],
        box: [22, 344, 300, 112], sup: [514, 334, 288, 124],
        dmm: [348, 352, 128, 104]
      };
    } else {
      s = Math.min(W / 340, 1.3); ox = (W - 340 * s) / 2; H = Math.round(516 * s);
      R = {
        am: [4, 6, 162, 160], vm: [174, 6, 162, 160],
        board: [52, 222, 236, 88],
        box: [4, 384, 196, 120], sup: [206, 374, 130, 134],
        dmm: [244, 238, 92, 84]
      };
    }
    const sc = function (r) { return { x: ox + r[0] * s, y: r[1] * s, w: r[2] * s, h: r[3] * s }; };
    const L = { wide: wide, s: s, W: W, H: H };
    Object.keys(R).forEach(function (k) { L[k] = sc(R[k]); });
    if (!wide) L.dmm = { x: L.board.x + L.board.w - 92 * s, y: L.board.y + L.board.h + 6 * s, w: 92 * s, h: 64 * s };
    else L.dmm = { x: L.board.x + 62 * s, y: L.board.y + L.board.h + 14 * s, w: 124 * s, h: 82 * s };
    // 電表下方的接線柱
    const posts = function (m, n, labels) {
      const y = m.y + m.h - 19 * s;
      const xs = n === 4 ? [0.14, 0.40, 0.63, 0.86] : [0.17, 0.5, 0.83];
      return xs.map(function (f, i) { return { x: m.x + m.w * f, y: y, label: labels[i] }; });
    };
    L.amPosts = posts(L.am, 4, ['−', '5mA', '50mA', '500mA']);
    L.vmPosts = posts(L.vm, 3, ['−', '3V', '15V']);
    L.bL = { x: L.board.x + 20 * s, y: L.board.y + L.board.h * 0.56 };
    L.bR = { x: L.board.x + L.board.w - 20 * s, y: L.board.y + L.board.h * 0.56 };
    L.boxL = { x: L.box.x + 20 * s, y: L.box.y + 24 * s };
    L.boxR = { x: L.box.x + L.box.w - 20 * s, y: L.box.y + 24 * s };
    L.supP = { x: L.sup.x + (wide ? 30 : 24) * s, y: wide ? L.sup.y + L.sup.h - 26 * s : L.sup.y + 30 * s };
    L.supN = { x: L.sup.x + (wide ? 64 : 62) * s, y: wide ? L.sup.y + L.sup.h - 26 * s : L.sup.y + 30 * s };
    return L;
  }

  function resizeBench() {
    const W = cv.clientWidth;
    if (!W) return;
    B = benchLayout(W);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    B.dpr = dpr;
    if (cv.style.height !== B.H + 'px') cv.style.height = B.H + 'px';
    [cv, stat].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(B.H * dpr); });
    buildBench();
  }

  // ---- 小工具 ----
  function bez(p0, p1, p2, p3, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
    return out;
  }
  function polyLen(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return cum;
  }
  function pointAt(cb, d) {
    const cum = cb.cum, pts = cb.pts;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1, u = (d - cum[lo]) / seg;
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u];
  }
  function fitFont(c, text, weight, size, maxW) {
    let sz = size;
    c.font = weight + ' ' + sz + 'px ' + FF;
    while (sz > 7 && c.measureText(text).width > maxW) { sz -= 0.5; c.font = weight + ' ' + sz + 'px ' + FF; }
    return sz;
  }

  /** 一條導線：P0 → P3，兩端各有出線方向 d0、d3（單位向量），sag 為下垂量 */
  function cable(id, P0, d0, P3, d3, color, I, opts) {
    opts = opts || {};
    const s = B.s;
    const dist = Math.hypot(P3.x - P0.x, P3.y - P0.y);
    const k = Math.max(26 * s, Math.min(90 * s, dist * (opts.k || 0.42)));
    const sag = (opts.sag == null ? 18 : opts.sag) * s;
    const p0 = [P0.x, P0.y], p3 = [P3.x, P3.y];
    const p1 = [P0.x + d0[0] * k, P0.y + d0[1] * k + sag];
    const p2 = [P3.x + d3[0] * k, P3.y + d3[1] * k + sag];
    const pts = bez(p0, p1, p2, p3, 48);
    const cum = polyLen(pts);
    return { id: id, pts: pts, cum: cum, len: cum[cum.length - 1], color: color, I: I, volt: !!opts.volt };
  }

  /** 依目前的接法排出所有導線（電流方向即傳統電流方向） */
  function makeCables() {
    const s = state.sol, L = B;
    const aPlus = L.amPosts[1 + state.ra], aMinus = L.amPosts[0];
    const vPlus = L.vmPosts[1 + state.rv], vMinus = L.vmPosts[0];
    const down = [0, 1], up = [0, -1];
    const list = [];
    const Isrc = s.Isrc, IA = s.IA, IV = s.IV;
    // 電源＋ → 電阻箱（右）
    list.push(cable('c1', L.supP, up, L.boxR, up, C.red, Isrc, { sag: 10, k: 0.5 }));
    // 電阻箱（左）→ 毫安培計＋
    list.push(cable('c2', L.boxL, up, aPlus, down, C.red, Isrc, { sag: 6 }));
    // 毫安培計－ → 元件左端
    list.push(cable('c3', aMinus, down, L.bL, [-0.6, -0.8], C.black, IA, { sag: 14 }));
    // 元件右端 → 電源－
    list.push(cable('c4', L.bR, [0.7, 0.7], L.supN, up, C.black, Isrc, { sag: 10 }));
    // 伏特計＋：外接 → 元件左端；內接 → 毫安培計＋
    if (state.method === 'ext') list.push(cable('v1', L.bL, [-0.2, -1], vPlus, down, C.red, IV, { volt: true, sag: -6, k: 0.5 }));
    else list.push(cable('v1', aPlus, down, vPlus, down, C.red, IV, { volt: true, sag: 34, k: 0.55 }));
    // 伏特計－ → 元件右端
    list.push(cable('v2', vMinus, down, L.bR, [0.3, -0.95], C.black, IV, { volt: true, sag: 6 }));
    return list;
  }

  // ---- 背景與器材 ----
  function buildBench() {
    if (!B || !state.sol) return;
    readColorsIfNeeded();
    const c = sctx, W = B.W, H = B.H, s = B.s;
    c.setTransform(B.dpr, 0, 0, B.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    LD.backdrop(c, W, H);
    // 桌面：極淡的條紋（實驗桌的桌墊）
    const mat = c.createLinearGradient(0, 0, 0, H);
    mat.addColorStop(0, LD.alpha(C.text, 0));
    mat.addColorStop(1, LD.alpha(C.text, C.dark ? 0.05 : 0.035));
    c.fillStyle = mat; c.fillRect(0, 0, W, H);
    cables = makeCables();
    cables.forEach(function (cb) { if (phase[cb.id] == null) phase[cb.id] = Math.random() * DOT_GAP * s; });

    drawSupply(c);
    drawBox(c);
    drawBoard(c);
    drawMeterBody(c, B.am, 'A');
    drawMeterBody(c, B.vm, 'V');
    // 導線畫在器材上面（像真的拉在桌上），接頭最後畫
    cables.slice().sort(function (a, b) { return (a.volt ? 1 : 0) - (b.volt ? 1 : 0); }).forEach(function (cb) { drawCable(c, cb); });
    cables.forEach(function (cb) { plug(c, cb.pts[0], cb.color); plug(c, cb.pts[cb.pts.length - 1], cb.color); });
    drawTags(c);
    if (state.dmm) drawDMM(c);
  }
  let colorVer = -1;
  function readColorsIfNeeded() { if (colorVer !== LD.ver) { readColors(); colorVer = LD.ver; } }

  function drawCable(c, cb) {
    const w = Math.max(3, 4.6 * B.s);
    const path = function (g) { cb.pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); };
    // 投影
    c.save();
    c.translate(1.2 * B.s, 3 * B.s);
    c.beginPath(); path(c);
    c.strokeStyle = LD.shadowInk(C.dark ? 0.35 : 0.12);
    c.lineWidth = w + 2; c.lineCap = 'round'; c.lineJoin = 'round';
    c.stroke();
    c.restore();
    if (cb.volt) { // 伏特計的導線：外圈淡綠色光暈，與主電路區分
      c.save();
      c.beginPath(); path(c);
      c.strokeStyle = LD.alpha(C.probe, C.dark ? 0.45 : 0.38);
      c.lineWidth = w + 4.5; c.lineCap = 'round'; c.lineJoin = 'round';
      c.stroke();
      c.restore();
    }
    LD.tube(c, path, cb.color, w);
  }
  /** 香蕉插頭：導線端點的小圓柱 */
  function plug(c, p, col) {
    const r = Math.max(3.2, 4.4 * B.s);
    LD.ball(c, p[0], p[1], r, col, { shadow: true });
  }
  /** 接線柱：六角底座＋彩色螺帽 */
  function post(c, x, y, col, r) {
    r = r || Math.max(4.5, 6.5 * B.s);
    c.save();
    c.fillStyle = LD.shadowInk(C.dark ? 0.35 : 0.18);
    c.beginPath(); c.ellipse(x + 0.8, y + r * 0.55, r * 1.25, r * 0.6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = C.metal;
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.lineTo(x + r * 1.18 * Math.cos(a), y + r * 1.18 * Math.sin(a)); }
    c.closePath(); c.fill();
    c.strokeStyle = LD.alpha(LD.shade(C.metal, -0.4), 0.6); c.lineWidth = 0.8; c.stroke();
    c.restore();
    LD.ball(c, x, y, r * 0.86, col, { shadow: false });
  }

  function label(c, text, x, y, color, size, weight, align) {
    c.font = (weight || 600) + ' ' + (size || 11) * Math.max(0.85, Math.min(1.15, B.s * 1.05)) + 'px ' + FF;
    c.textAlign = align || 'center'; c.textBaseline = 'middle';
    c.fillStyle = color;
    c.fillText(text, x, y);
  }

  // ---- 直流電源供應器 ----
  function drawSupply(c) {
    const r = B.sup, s = B.s, wide = B.wide;
    LD.block(c, r.x, r.y, r.w, r.h, C.caseCol, { r: 8 * s });
    // 前面板
    const px = r.x + 6 * s, py = r.y + 6 * s, pw = r.w - 12 * s, ph = r.h - 12 * s;
    LD.roundRect(c, px, py, pw, ph, 6 * s);
    c.fillStyle = LD.alpha(LD.shade(C.caseCol, C.dark ? 0.06 : -0.04), 1); c.fill();
    c.strokeStyle = LD.alpha(C.text, 0.12); c.lineWidth = 1; c.stroke();
    const t1 = T('直流電源供應器', 'DC POWER SUPPLY'), t2 = '0–15 V  r = 0.5 Ω';
    const lw = wide ? 132 * s : pw - 14 * s, lh = 46 * s;
    const lx = wide ? px + pw - lw - 10 * s : px + 7 * s, ly = wide ? py + 36 * s : py + 40 * s;
    // 名稱與規格（寬版：右上；窄版：下方）
    c.textBaseline = 'top'; c.fillStyle = LD.alpha(C.text, 0.75);
    if (wide) {
      c.font = '700 ' + fitFont(c, t1, 700, 10.5 * Math.max(0.9, s), lw) + 'px ' + FF;
      c.textAlign = 'right'; c.fillText(t1, px + pw - 10 * s, py + 6 * s);
      label(c, t2, px + pw - 10 * s, py + 26 * s, LD.alpha(C.muted, 0.95), 9.5, 500, 'right');
    } else {
      c.font = '700 ' + fitFont(c, t1, 700, 10 * Math.max(0.9, s), pw - 14 * s) + 'px ' + FF;
      c.textAlign = 'left'; c.fillText(t1, px + 7 * s, ly + lh + 7 * s);
      c.font = '500 ' + fitFont(c, t2, 500, 9 * Math.max(0.9, s), pw - 14 * s) + 'px ' + FF;
      c.fillStyle = LD.alpha(C.muted, 0.95); c.fillText(t2, px + 7 * s, ly + lh + 22 * s);
    }
    // 液晶顯示：電壓（設定的電動勢）與電流
    LD.roundRect(c, lx, ly, lw, lh, 4 * s);
    c.fillStyle = C.lcd; c.fill();
    c.strokeStyle = LD.alpha(C.text, 0.25); c.stroke();
    const vtxt = state.emf.toFixed(2), itxt = Math.min(9.999, Math.max(0, state.sol.Isrc)).toFixed(3);
    c.save();
    c.shadowColor = LD.alpha(C.lcdInk, 0.6); c.shadowBlur = 5 * s;
    c.fillStyle = C.lcdInk; c.textBaseline = 'middle';
    c.font = '700 ' + Math.round(18 * s) + 'px ui-monospace, "SF Mono", Consolas, monospace';
    c.textAlign = 'right';
    c.fillText(vtxt, lx + lw * 0.7, ly + lh * 0.34);
    c.font = '600 ' + Math.round(12 * s) + 'px ui-monospace, Consolas, monospace';
    c.fillText(itxt, lx + lw * 0.7, ly + lh * 0.76);
    c.textAlign = 'left';
    c.font = '700 ' + Math.round(11 * s) + 'px ' + FF;
    c.fillText('V', lx + lw * 0.74, ly + lh * 0.36);
    c.fillText('A', lx + lw * 0.74, ly + lh * 0.76);
    c.restore();
    // 電壓旋鈕（角度隨 ε 轉）
    const kr = (wide ? 17 : 12) * s;
    const kx = wide ? lx - kr - 12 * s : px + pw - kr - 7 * s, ky = wide ? ly + lh / 2 - 4 * s : py + 18 * s;
    knob(c, kx, ky, kr, -2.4 + 4.8 * state.emf / K.SUPPLY.max);
    if (wide) label(c, T('電壓', 'VOLTAGE'), kx, ky + kr + 10 * s, LD.alpha(C.muted, 0.95), 9, 600, 'center');
    // 輸出端
    post(c, B.supP.x, B.supP.y, C.red);
    post(c, B.supN.x, B.supN.y, C.black);
    label(c, '+', B.supP.x, B.supP.y - 15 * s, C.red, 12, 800);
    label(c, '−', B.supN.x, B.supN.y - 15 * s, C.dark ? C.text : C.black, 12, 800);
  }
  function knob(c, x, y, r, ang) {
    c.save();
    c.shadowColor = LD.shadowInk(C.dark ? 0.5 : 0.3); c.shadowBlur = 6; c.shadowOffsetY = 2;
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    const base = C.dark ? LD.mix(C.surface, C.text, 0.3) : LD.shade(C.text, -0.1);
    g.addColorStop(0, LD.shade(base, 0.35)); g.addColorStop(0.6, base); g.addColorStop(1, LD.shade(base, -0.35));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.restore();
    // 刻紋
    c.strokeStyle = LD.alpha(C.dark ? '#000000' : '#ffffff', 0.18); c.lineWidth = 1;
    for (let i = 0; i < 18; i++) { const a = i * Math.PI / 9; c.beginPath(); c.moveTo(x + r * 0.82 * Math.cos(a), y + r * 0.82 * Math.sin(a)); c.lineTo(x + r * 0.98 * Math.cos(a), y + r * 0.98 * Math.sin(a)); c.stroke(); }
    c.strokeStyle = C.dark ? C.text : '#ffffff'; c.lineWidth = Math.max(1.5, r * 0.13); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + r * 0.2 * Math.sin(ang), y - r * 0.2 * Math.cos(ang)); c.lineTo(x + r * 0.78 * Math.sin(ang), y - r * 0.78 * Math.cos(ang)); c.stroke();
  }

  // ---- 十進位可變電阻箱 ----
  function drawBox(c) {
    const r = B.box, s = B.s, wide = B.wide;
    LD.block(c, r.x, r.y, r.w, r.h, C.housing, { r: 7 * s });
    const t = T('十進位可變電阻箱', 'DECADE RESISTANCE BOX');
    const inner = r.w - 76 * s;
    c.font = '700 ' + fitFont(c, t, 700, 10 * Math.max(0.9, s), inner) + 'px ' + FF;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = LD.alpha(C.dark ? C.text : C.surface, 0.85);
    c.fillText(t, r.x + r.w / 2, r.y + 14 * s);
    const digits = String(Math.round(state.box)).padStart(4, '0').split('').map(Number);
    const mult = ['×1000', '×100', '×10', '×1'];
    const span = r.w - 64 * s, x0 = r.x + 32 * s;
    const kr = Math.min(span / 8 - 3 * s, (r.h - 50 * s) / 2.7);
    for (let i = 0; i < 4; i++) {
      const kx = x0 + span * (i + 0.5) / 4, ky = r.y + r.h * 0.58;
      // 數字窗
      const ww = 15 * s, wh = 13 * s;
      LD.roundRect(c, kx - ww / 2, ky - kr - wh - 4 * s, ww, wh, 2 * s);
      c.fillStyle = C.dark ? LD.shade(C.surface, -0.4) : '#ffffff'; c.fill();
      label(c, String(digits[i]), kx, ky - kr - wh / 2 - 4 * s, C.dark ? C.text : C.text, 10.5, 700);
      knob(c, kx, ky, kr, -Math.PI * 0.8 + digits[i] * Math.PI * 1.6 / 9);
      label(c, mult[i], kx, ky + kr + 9 * s, LD.alpha(C.dark ? C.text : C.surface, 0.8), 9, 600);
    }
    post(c, B.boxL.x, B.boxL.y, C.brass);
    post(c, B.boxR.x, B.boxR.y, C.brass);
  }

  // ---- 待測元件板 ----
  function drawBoard(c) {
    const r = B.board, s = B.s;
    LD.contactShadow(c, r.x + r.w / 2, r.y + r.h, r.w * 0.48, 0);
    LD.block(c, r.x, r.y, r.w, r.h, C.wood, { r: 6 * s });
    // 木紋
    c.save();
    LD.roundRect(c, r.x, r.y, r.w, r.h, 6 * s); c.clip();
    c.strokeStyle = LD.alpha(LD.shade(C.wood, -0.5), C.dark ? 0.12 : 0.1); c.lineWidth = 1;
    for (let i = 1; i < 7; i++) {
      const y = r.y + r.h * i / 7;
      c.beginPath(); c.moveTo(r.x, y);
      c.bezierCurveTo(r.x + r.w * 0.3, y + 3 * s * Math.sin(i), r.x + r.w * 0.7, y - 3 * s * Math.cos(i), r.x + r.w, y + 2 * s);
      c.stroke();
    }
    c.restore();
    const cx = r.x + r.w / 2, cy = r.y + r.h * 0.5;
    const L = B.bL, R = B.bR;
    const el = state.el;
    if (K.WIRES[el]) drawSpool(c, cx, cy, r.w * 0.58, r.h * 0.62, el);
    else if (el === 'lamp') drawLamp(c, cx, r.y + r.h * 0.42, r);
    else drawResistor(c, cx, cy, r.w * 0.5, el);
    post(c, L.x, L.y, C.brass);
    post(c, R.x, R.y, C.brass);
  }
  /** 器材的名稱標籤：畫在導線上面，才不會被導線擋住 */
  function drawTags(c) {
    const s = B.s, r = B.board, el = state.el, cx = r.x + r.w / 2;
    LD.pill(c, 'R' + T('箱', 'box') + ' = ' + Math.round(state.box) + ' Ω', B.box.x + B.box.w / 2, B.box.y - 4 * s, C.text, 'center', '600 ' + (B.wide ? 12 : 11) + 'px ' + FF);
    let tag = elemName(el);
    if (K.WIRES[el]) {
      const w = K.WIRES[el];
      tag += '  Ø' + (w.d * 1000).toFixed(2) + ' mm · ' + w.L + ' m';
    } else if (el === 'lamp') tag += '  2.5 V 0.3 A';
    else if (el === 'carbon') tag += '  100 Ω ±5%';
    else if (el === 'X' && state.revealed) tag += '  ' + MYST.nominal + ' Ω ±5%';
    const f = '600 ' + (B.wide ? 11.5 : 10.5) + 'px ' + FF;
    c.font = f;
    const tw = c.measureText(tag).width + 14;
    LD.pill(c, tag, Math.max(tw / 2 + 2, Math.min(B.W - tw / 2 - 2, cx)), r.y - 5 * s, C.text, 'center', f);
  }
  function drawSpool(c, cx, cy, w, h, key) {
    const wd = K.WIRES[key], s = B.s;
    const col = wd.mat === 'Cu' ? C.copper : C.nichrome;
    const fl = Math.max(4, w * 0.07);
    const core = h * 0.36;
    const fill = Math.sqrt(wd.L * wd.d * wd.d / (20 * 0.28e-3 * 0.28e-3)); // 線圈體積 ∝ L d²（示意）
    const rad = core / 2 + (h / 2 - core / 2 - 2 * s) * (0.35 + 0.65 * fill);
    const x0 = cx - w / 2 + fl, x1 = cx + w / 2 - fl;
    // 引線：線圈兩端到接線柱
    c.strokeStyle = col; c.lineWidth = Math.max(1.2, 1.6 * s); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0 + 3 * s, cy - rad + 2 * s);
    c.quadraticCurveTo(B.bL.x + 14 * s, cy - rad - 6 * s, B.bL.x, B.bL.y); c.stroke();
    c.beginPath(); c.moveTo(x1 - 3 * s, cy + rad - 2 * s);
    c.quadraticCurveTo(B.bR.x - 12 * s, cy + rad + 4 * s, B.bR.x, B.bR.y); c.stroke();
    // 線圈（圓柱：上亮下暗）
    const g = c.createLinearGradient(0, cy - rad, 0, cy + rad);
    g.addColorStop(0, LD.shade(col, 0.45)); g.addColorStop(0.3, LD.shade(col, 0.12)); g.addColorStop(0.75, col); g.addColorStop(1, LD.shade(col, -0.45));
    c.fillStyle = g;
    c.fillRect(x0, cy - rad, x1 - x0, 2 * rad);
    // 一圈一圈的導線（間距 ∝ 直徑，示意）
    const pitch = Math.max(1.6, wd.d * 1000 * 11 * s);
    c.save();
    c.beginPath(); c.rect(x0, cy - rad, x1 - x0, 2 * rad); c.clip();
    c.strokeStyle = LD.alpha(LD.shade(col, -0.55), 0.45); c.lineWidth = Math.max(0.6, pitch * 0.32);
    for (let x = x0 - rad; x < x1 + rad; x += pitch) { c.beginPath(); c.moveTo(x, cy - rad); c.lineTo(x + pitch * 0.6, cy + rad); c.stroke(); }
    c.strokeStyle = LD.alpha(LD.shade(col, 0.7), 0.35); c.lineWidth = Math.max(0.4, pitch * 0.18);
    for (let x = x0 - rad + pitch * 0.35; x < x1 + rad; x += pitch) { c.beginPath(); c.moveTo(x, cy - rad); c.lineTo(x + pitch * 0.6, cy + rad * 0.2); c.stroke(); }
    c.restore();
    // 線軸的兩片凸緣（塑膠）
    const bob = LD.mix(C['b-em'] || C.neg, C.surface, C.dark ? 0.35 : 0.45);
    [cx - w / 2, x1].forEach(function (x) { LD.block(c, x, cy - h / 2, fl, h, bob, { r: 2.5 * s }); });
  }
  function drawResistor(c, cx, cy, w, key) {
    const s = B.s, h = Math.max(12, 18 * s), bw = w * 0.62;
    // 引線
    c.strokeStyle = C.metal; c.lineWidth = Math.max(1.5, 2 * s); c.lineCap = 'round';
    c.beginPath(); c.moveTo(B.bL.x, B.bL.y); c.quadraticCurveTo(cx - bw / 2 - 10 * s, cy, cx - bw / 2, cy); c.stroke();
    c.beginPath(); c.moveTo(cx + bw / 2, cy); c.quadraticCurveTo(cx + bw / 2 + 10 * s, cy, B.bR.x, B.bR.y); c.stroke();
    const body = key === 'X' ? LD.mix(C.neg, C.surface, 0.55) : LD.mix(C.equi, C.surface, 0.55);
    LD.block(c, cx - bw / 2, cy - h / 2, bw, h, body, { r: h / 2 });
    const nominal = key === 'X' ? MYST.nominal : K.CARBON.nominal;
    const bands = K.colorBands(nominal);
    const covered = key === 'X' && !state.revealed;
    const xs = [0.22, 0.36, 0.5, 0.76];
    if (!covered) {
      bands.forEach(function (b, i) {
        const x = cx - bw / 2 + bw * xs[i];
        const g = c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
        g.addColorStop(0, LD.shade(BAND[b], 0.3)); g.addColorStop(0.5, BAND[b]); g.addColorStop(1, LD.shade(BAND[b], -0.35));
        c.fillStyle = g;
        c.fillRect(x - 2.6 * s, cy - h / 2 + 0.5, 5.2 * s, h - 1);
      });
    } else {
      // 膠帶貼住色環
      const tx = cx - bw * 0.4, tw = bw * 0.8;
      c.save();
      c.shadowColor = LD.shadowInk(0.2); c.shadowBlur = 3; c.shadowOffsetY = 1;
      c.fillStyle = C.dark ? LD.mix(C.text, C.surface, 0.2) : '#f3efe2';
      c.beginPath();
      c.moveTo(tx, cy - h / 2 - 3 * s); c.lineTo(tx + tw, cy - h / 2 - 2 * s); c.lineTo(tx + tw - 2 * s, cy + h / 2 + 3 * s); c.lineTo(tx + 1 * s, cy + h / 2 + 2 * s);
      c.closePath(); c.fill();
      c.restore();
      label(c, '?  X  ?', cx, cy + 0.5, C.dark ? C.surface : C.text, 11, 800);
    }
    // 高光
    c.strokeStyle = 'rgba(255,255,255,' + (C.dark ? 0.2 : 0.55) + ')'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - bw / 2 + h / 2, cy - h / 2 + 2); c.lineTo(cx + bw / 2 - h / 2, cy - h / 2 + 2); c.stroke();
  }
  function drawLamp(c, cx, cy, r) {
    const s = B.s, sol = state.sol;
    const R = Math.min(r.h * 0.3, 22 * s);
    const P = state.burnt ? 0 : sol.PR;
    const b = Math.max(0, Math.min(1.4, P / 0.75));
    const Tk = sol.T || 300;
    const gc = glowColor(Tk);
    // 引線
    const sy = cy + R * 1.05;
    c.strokeStyle = C.metal; c.lineWidth = Math.max(1.5, 2 * s); c.lineCap = 'round';
    c.beginPath(); c.moveTo(B.bL.x, B.bL.y); c.quadraticCurveTo(cx - R * 1.6, sy + R * 0.9, cx - R * 0.55, sy + R * 0.75); c.stroke();
    c.beginPath(); c.moveTo(B.bR.x, B.bR.y); c.quadraticCurveTo(cx + R * 1.6, sy + R * 0.9, cx + R * 0.55, sy + R * 0.75); c.stroke();
    // 光暈（亮度 ∝ 功率）
    if (b > 0.01 && Tk > 750) {
      c.save();
      c.globalCompositeOperation = C.dark ? 'lighter' : 'source-over';
      const vis = Math.min(1, Math.pow(Math.max(0, (Tk - 750) / 1650), 1.6)) * Math.min(1, b + 0.15);
      const Rh = R * (1.5 + 3.2 * vis);
      const hg = c.createRadialGradient(cx, cy, R * 0.15, cx, cy, Rh);
      hg.addColorStop(0, LD.alpha(LD.mix(gc, '#ffffff', 0.4), (C.dark ? 0.8 : 0.65) * vis));
      hg.addColorStop(0.45, LD.alpha(gc, (C.dark ? 0.35 : 0.3) * vis));
      hg.addColorStop(1, LD.alpha(gc, 0));
      c.fillStyle = hg;
      c.beginPath(); c.arc(cx, cy, Rh, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // 燈座（銅色螺紋）
    const bw = R * 1.1, bh = R * 0.8;
    const bg = c.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
    bg.addColorStop(0, LD.shade(C.brass, -0.35)); bg.addColorStop(0.35, LD.shade(C.brass, 0.35)); bg.addColorStop(1, LD.shade(C.brass, -0.4));
    c.fillStyle = bg;
    LD.roundRect(c, cx - bw / 2, sy - bh * 0.2, bw, bh, 2 * s); c.fill();
    c.strokeStyle = LD.alpha(LD.shade(C.brass, -0.6), 0.5); c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = sy - bh * 0.2 + bh * i / 4; c.beginPath(); c.moveTo(cx - bw / 2, y); c.lineTo(cx + bw / 2, y - 2 * s); c.stroke(); }
    // 玻璃泡
    const vis2 = state.burnt ? 0 : Math.min(1, Math.pow(Math.max(0, (Tk - 750) / 1650), 1.6));
    const gl = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    gl.addColorStop(0, LD.alpha(LD.mix(C.surface, gc, vis2 * 0.8), 0.95));
    gl.addColorStop(0.7, LD.alpha(LD.mix(C.surface, gc, 0.1 + 0.6 * vis2), C.dark ? 0.35 : 0.55));
    gl.addColorStop(1, LD.alpha(LD.mix(C.muted, gc, vis2), C.dark ? 0.5 : 0.42));
    c.fillStyle = gl;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    if (state.burnt) { c.fillStyle = LD.alpha(C.text, 0.12); c.beginPath(); c.arc(cx, cy - R * 0.2, R * 0.75, Math.PI, 0); c.fill(); }
    // 燈絲
    c.strokeStyle = LD.alpha(C.text, 0.55); c.lineWidth = 1; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(cx - R * 0.3, sy - bh * 0.15); c.lineTo(cx - R * 0.42, cy - R * 0.1);
    c.moveTo(cx + R * 0.3, sy - bh * 0.15); c.lineTo(cx + R * 0.42, cy - R * 0.1);
    c.stroke();
    const fil = vis2 > 0.02 ? LD.mix(C.muted, LD.mix(gc, '#ffffff', 0.5), Math.min(1, 0.3 + vis2)) : LD.alpha(C.text, 0.7);
    c.strokeStyle = fil; c.lineWidth = 1.2 + 0.8 * vis2;
    c.beginPath();
    const n = 5, xa = cx - R * 0.42, xb = cx + R * 0.42, fy = cy - R * 0.1;
    c.moveTo(xa, fy);
    for (let i = 0; i < n; i++) {
      if (state.burnt && i === 2) { c.moveTo(xa + (i + 1) * (xb - xa) / n, fy); continue; }
      c.quadraticCurveTo(xa + (i + 0.5) * (xb - xa) / n, fy - R * 0.32, xa + (i + 1) * (xb - xa) / n, fy);
    }
    c.stroke();
    c.strokeStyle = LD.alpha(C.text, C.dark ? 0.45 : 0.35); c.lineWidth = 1.2;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (C.dark ? 0.35 : 0.85) + ')'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(cx, cy, R - 2.5, Math.PI * 1.08, Math.PI * 1.45); c.stroke();
    if (state.burnt) LD.pill(c, T('燈絲燒斷', 'filament broken'), cx + R + 6 * s, cy + 9, C.pos, 'left', '700 ' + (B.wide ? 11 : 10) + 'px ' + FF);
  }

  // ---- 電表（實驗桌上的樣子） ----
  /** 刻度數字的字級（錶面與指針共用同一個幾何） */
  function scaleText(fw, detail) { return detail ? Math.max(10, Math.min(15, fw * 0.034)) : Math.max(7, 9.5 * B.s); }
  /** 刻度弧的幾何：數字（半徑 1.13 rad）要完整留在錶面內；轉軸在錶面下緣附近 */
  function scaleGeom(fx, fy, fw, fh, detail) {
    const t = scaleText(fw, detail), pad = detail ? 8 : 4;
    const cx = fx + fw / 2;
    const rad = Math.max(10, Math.min((fw / 2 - pad - 1.6 * t) / 0.866, (1.1 * fh - pad - t) / 1.13));
    const cy = fy + pad + t * 0.6 + 1.13 * rad;
    return { cx: cx, cy: cy, rad: rad, t: t, a0: -50 * Math.PI / 180, a1: 50 * Math.PI / 180 };
  }
  function angOf(g, f) { return g.a0 + (g.a1 - g.a0) * f; }
  function polar(g, r, a) { return [g.cx + r * Math.sin(a), g.cy - r * Math.cos(a)]; }

  /** 錶面（刻度、數字、單位）；detail = true 為特寫（多畫鏡面與兩排數字） */
  function drawFace(c, fx, fy, fw, fh, kind, detail) {
    const s = detail ? 1 : B.s;
    LD.roundRect(c, fx, fy, fw, fh, 5 * s);
    const fg = c.createLinearGradient(0, fy, 0, fy + fh);
    fg.addColorStop(0, LD.shade(C.face, C.dark ? 0.04 : 0.3)); fg.addColorStop(1, LD.shade(C.face, C.dark ? -0.08 : -0.04));
    c.fillStyle = fg; c.fill();
    c.save();
    LD.roundRect(c, fx, fy, fw, fh, 5 * s); c.clip();
    const g = scaleGeom(fx, fy, fw, fh, detail);
    const divs = kind === 'A' ? A_DIVS : V_DIVS;
    const ink = C.ink;
    // 鏡面弧帶（避免視差）
    if (detail) {
      const r1 = g.rad * 0.83, r2 = g.rad * 0.9;
      c.beginPath();
      c.arc(g.cx, g.cy, r2, -Math.PI / 2 + g.a0 - 0.02, -Math.PI / 2 + g.a1 + 0.02);
      c.arc(g.cx, g.cy, r1, -Math.PI / 2 + g.a1 + 0.02, -Math.PI / 2 + g.a0 - 0.02, true);
      c.closePath();
      const mg = c.createLinearGradient(g.cx - g.rad, 0, g.cx + g.rad, 0);
      const base = C.dark ? LD.mix(C.muted, C.text, 0.3) : LD.mix(C.muted, C.surface, 0.55);
      mg.addColorStop(0, LD.shade(base, -0.1)); mg.addColorStop(0.3, LD.shade(base, 0.5)); mg.addColorStop(0.55, base); mg.addColorStop(0.8, LD.shade(base, 0.4)); mg.addColorStop(1, LD.shade(base, -0.15));
      c.fillStyle = mg; c.fill();
    }
    // 刻度弧線
    const rS = g.rad * (detail ? 0.93 : 0.92);
    c.strokeStyle = ink; c.lineWidth = detail ? 1.2 : Math.max(0.8, 1 * s);
    c.beginPath(); c.arc(g.cx, g.cy, rS, -Math.PI / 2 + g.a0, -Math.PI / 2 + g.a1); c.stroke();
    // 刻度線：每小格、每 5 格、每 10 格
    const step = detail ? 1 : (kind === 'A' ? 5 : 5);
    for (let i = 0; i <= divs; i += step) {
      const a = angOf(g, i / divs);
      const big = i % 10 === 0, mid = i % 5 === 0;
      const len = g.rad * (big ? 0.1 : mid ? 0.07 : 0.04);
      const p1 = polar(g, rS, a), p2 = polar(g, rS + len, a);
      c.lineWidth = big ? (detail ? 1.6 : 1.1) : (detail ? 0.9 : 0.8);
      c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke();
    }
    // 數字
    const ranges = kind === 'A' ? K.AMMETER.ranges : K.VOLTMETER.ranges;
    const cur = kind === 'A' ? state.ra : state.rv;
    const rows = detail && kind === 'V' ? [1, 0] : [cur];
    rows.forEach(function (ri, k) {
      const fs = kind === 'A' ? ranges[ri] * 1000 : ranges[ri];
      const active = ri === cur;
      const rr = g.rad * (1.13 + (detail ? 0 : 0.02) - k * 0.0) + (k === 1 ? -g.rad * 0.36 : 0);
      const sz = g.t;
      c.font = (active ? '700 ' : '500 ') + sz + 'px ' + FF;
      c.fillStyle = active ? ink : LD.alpha(ink, 0.45);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const nlab = divs / 10;
      for (let j = 0; j <= nlab; j++) {
        const v = fs * j / nlab;
        const a = angOf(g, j / nlab);
        const p = polar(g, k === 1 ? rr : rr, a);
        c.fillText(String(Math.round(v * 1000) / 1000), p[0], p[1]);
      }
    });
    // 單位與表名
    const uSize = detail ? Math.max(14, Math.min(22, fw * 0.05)) : Math.max(9, 14 * s);
    c.font = '800 ' + uSize + 'px ' + FF;
    c.fillStyle = LD.alpha(ink, 0.85); c.textAlign = 'center'; c.textBaseline = 'middle';
    const below = g.cy - g.rad * 0.64; // 刻度弧兩端的高度
    c.fillText(kind === 'A' ? 'mA' : 'V', g.cx, Math.min(fy + fh * 0.72, below + uSize * 0.2));
    if (detail) {
      c.font = '500 ' + Math.max(9, fw * 0.025) + 'px ' + FF;
      c.fillStyle = LD.alpha(ink, 0.55);
      c.fillText(kind === 'A' ? T('直流毫安培計', 'DC milliammeter') : T('直流伏特計', 'DC voltmeter'), g.cx, Math.min(fy + fh * 0.72, below + uSize * 0.2) + uSize * 0.95);
    }
    c.restore();
    c.strokeStyle = LD.alpha(C.text, C.dark ? 0.3 : 0.25); c.lineWidth = 1;
    LD.roundRect(c, fx + 0.5, fy + 0.5, fw - 1, fh - 1, 5 * s); c.stroke();
    return g;
  }
  /** 指針：p 為滿刻度的幾分之幾（指針擋片限制在 −3.5% 到 103.5%） */
  function drawNeedle(c, g, p, detail, over) {
    const q = Math.max(-0.035, Math.min(1.035, p));
    const a = angOf(g, q);
    const tip = polar(g, g.rad * (detail ? 0.985 : 0.97), a);
    const tail = polar(g, -g.rad * 0.08, a);
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = LD.shadowInk(C.dark ? 0.4 : 0.18); c.lineWidth = detail ? 2.4 : 1.6;
    c.beginPath(); c.moveTo(tail[0] + 1.5, tail[1] + 2); c.lineTo(tip[0] + 1.5, tip[1] + 2); c.stroke();
    c.strokeStyle = over ? C.pos : C.ink;
    c.lineWidth = detail ? 1.7 : 1.15;
    c.beginPath(); c.moveTo(tail[0], tail[1]); c.lineTo(tip[0], tip[1]); c.stroke();
    if (detail) { // 刀形指針的細尖端
      c.strokeStyle = over ? C.pos : C.ink; c.lineWidth = 0.9;
      const mid = polar(g, g.rad * 0.7, a);
      c.beginPath(); c.moveTo(mid[0], mid[1]); c.lineTo(tip[0], tip[1]); c.stroke();
    }
    c.restore();
  }
  function drawPivot(c, g, fx, fy, fw, fh, detail) {
    // 轉軸蓋（擋住指針根部）：在錶面下緣的半圓窗
    const r = detail ? Math.min(fw * 0.07, 22) : Math.max(5, fw * 0.07);
    const py = Math.min(fy + fh, g.cy);
    c.save();
    c.beginPath(); c.rect(fx, fy, fw, fh); c.clip();
    const pg = c.createLinearGradient(0, py - r, 0, py);
    pg.addColorStop(0, LD.shade(C.housing, 0.25)); pg.addColorStop(1, C.housing);
    c.fillStyle = pg;
    c.beginPath(); c.arc(g.cx, py, r * 1.6, Math.PI, 0); c.fill();
    c.restore();
    if (detail) { // 歸零螺絲
      const sr = r * 0.42, sx = g.cx, sy = py - r * 0.62;
      LD.ball(c, sx, sy, sr, C.metal, { shadow: false });
      const ang = (state.ideal || state.zeroed.A && state.zeroed.V) ? 0.2 : 0.9;
      c.strokeStyle = LD.alpha(LD.shade(C.metal, -0.6), 0.85); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(sx - sr * 0.7 * Math.cos(ang), sy - sr * 0.7 * Math.sin(ang)); c.lineTo(sx + sr * 0.7 * Math.cos(ang), sy + sr * 0.7 * Math.sin(ang)); c.stroke();
    }
  }

  function drawMeterBody(c, r, kind) {
    const s = B.s;
    LD.block(c, r.x, r.y, r.w, r.h, C.housing, { r: 8 * s });
    const fx = r.x + 8 * s, fy = r.y + 8 * s, fw = r.w - 16 * s, fh = r.h * 0.6;
    drawFace(c, fx, fy, fw, fh, kind, false);
    r.face = { x: fx, y: fy, w: fw, h: fh };
    // 接線柱與標示
    const posts = kind === 'A' ? B.amPosts : B.vmPosts;
    const cur = kind === 'A' ? state.ra : state.rv;
    posts.forEach(function (p, i) {
      const sel = i === 0 || i === cur + 1;
      post(c, p.x, p.y, i === 0 ? C.black : C.red);
      const lc = sel ? (C.dark ? C.text : C.surface) : LD.alpha(C.dark ? C.text : C.surface, 0.55);
      label(c, p.label, p.x, p.y - 13.5 * s, lc, i === 0 ? 12 : 9, sel ? 800 : 500);
    });
  }

  // ---- 數位三用電表（量電阻時才出現） ----
  function drawDMM(c) {
    const r = B.dmm, s = B.s, d = state.dmm;
    // 探針線
    const tipL = [B.bL.x - 3 * s, B.bL.y - 8 * s], tipR = [B.bR.x + 3 * s, B.bR.y - 8 * s];
    const jackR = [r.x + r.w * 0.3, r.y + r.h - 6 * s], jackB = [r.x + r.w * 0.7, r.y + r.h - 6 * s];
    [[jackR, tipL, C.red], [jackB, tipR, C.black]].forEach(function (q) {
      const pts = bez(q[0], [q[0][0], q[0][1] + 30 * s], [q[1][0], q[1][1] - 40 * s], q[1], 30);
      LD.tube(c, function (g) { pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); }, q[2], Math.max(2, 2.6 * s));
      LD.ball(c, q[1][0], q[1][1], Math.max(2.5, 3 * s), C.metal, { shadow: false });
    });
    LD.block(c, r.x, r.y, r.w, r.h, LD.mix(C.equi, C.surface, C.dark ? 0.15 : 0.35), { r: 7 * s });
    const lx = r.x + 7 * s, ly = r.y + 7 * s, lw = r.w - 14 * s, lh = r.h * 0.46;
    LD.roundRect(c, lx, ly, lw, lh, 3 * s);
    c.fillStyle = C.dark ? LD.mix(C.text, C.surface, 0.35) : LD.mix(C.surface, C.probe, 0.08); c.fill();
    let txt;
    if (d.over) txt = '1   .';
    else if (d.range === 200) txt = d.value.toFixed(1);
    else if (d.range === 2000) txt = d.value.toFixed(0);
    else txt = (d.value / 1000).toFixed(d.range === 20000 ? 2 : 1);
    const unit = d.range >= 20000 ? 'kΩ' : 'Ω';
    c.fillStyle = C.dark ? C.surface : C.text;
    c.font = '700 ' + Math.round(lh * 0.62) + 'px ui-monospace, Consolas, monospace';
    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText(txt, lx + lw - 20 * s, ly + lh * 0.55);
    c.font = '700 ' + Math.round(lh * 0.32) + 'px ' + FF; c.textAlign = 'left';
    c.fillText(unit, lx + lw - 18 * s, ly + lh * 0.6);
    // 旋鈕指在 Ω 檔
    const kr = Math.min(r.h * 0.2, r.w * 0.16);
    knob(c, r.x + r.w / 2, ly + lh + kr + 5 * s, kr, -0.4);
    label(c, 'Ω', r.x + r.w / 2 - kr - 9 * s, ly + lh + kr + 3 * s, C.text, 10, 800);
    post(c, jackR[0], jackR[1], C.red, Math.max(3, 4 * s));
    post(c, jackB[0], jackB[1], C.black, Math.max(3, 4 * s));
  }

  // ---- 每一幀：電荷、指針 ----
  let dotSprite = null;
  function drawBenchFrame() {
    if (!B || !state.sol) return;
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(stat, 0, 0);
    c.setTransform(B.dpr, 0, 0, B.dpr, 0, 0);
    // 電荷
    const rDot = Math.max(1.7, 2.3 * B.s);
    cables.forEach(function (cb) {
      const gap = DOT_GAP * B.s;
      const off = ((phase[cb.id] || 0) % gap + gap) % gap;
      for (let d = off + gap * 0.5; d < cb.len - gap * 0.3; d += gap) {
        const p = pointAt(cb, d);
        LD.ball(c, p[0], p[1], rDot, C.dot, { shadow: false, glow: C.dark ? 0.25 : 0 });
      }
    });
    // 實驗桌上兩個電表的指針
    ['A', 'V'].forEach(function (k) {
      const r = k === 'A' ? B.am : B.vm;
      if (!r.face) return;
      const f = r.face;
      const g = scaleGeom(f.x, f.y, f.w, f.h, false);
      c.save();
      LD.roundRect(c, f.x, f.y, f.w, f.h, 5 * B.s); c.clip();
      drawNeedle(c, g, state.needle[k].p, false, state.rd[k].over);
      c.restore();
      drawPivot(c, g, f.x, f.y, f.w, f.h, false);
    });
  }

  // ======================= 畫布：電表特寫 =======================
  const mv = $('mv'), mctx = mv.getContext('2d');
  let M = null;
  function resizeMeters() {
    const W = mv.clientWidth;
    if (!W) return;
    const wide = W >= 560;
    const fw = wide ? (W - 12) / 2 : W;
    const fh = Math.round(Math.min(fw * (wide ? 0.7 : 0.64), 300));
    const H = wide ? fh : fh * 2 + 10;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (mv.style.height !== H + 'px') mv.style.height = H + 'px';
    mv.width = Math.round(W * dpr); mv.height = Math.round(H * dpr);
    M = { W: W, H: H, dpr: dpr, wide: wide, boxes: wide ? [[0, 0, fw, fh], [fw + 12, 0, fw, fh]] : [[0, 0, fw, fh], [0, fh + 10, fw, fh]] };
    drawMeters();
  }
  function drawMeters() {
    if (!M || !state.rd) return;
    const c = mctx;
    c.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
    c.clearRect(0, 0, M.W, M.H);
    ['A', 'V'].forEach(function (k, i) {
      const b = M.boxes[i];
      drawCloseUp(c, b[0], b[1], b[2], b[3], k);
    });
  }
  function drawCloseUp(c, x, y, w, h, kind) {
    const rd = state.rd[kind];
    const ideal = state.ideal;
    LD.block(c, x + 1, y + 1, w - 2, h - 2, C.housing, { r: 12 });
    const bar = Math.max(40, Math.min(52, h * 0.2));
    const fx = x + 12, fy = y + 12, fw = w - 24, fh = h - 24 - bar;
    const g = drawFace(c, fx, fy, fw, fh, kind, true);
    c.save();
    LD.roundRect(c, fx, fy, fw, fh, 5); c.clip();
    // 指針在鏡中的倒影（含誤差時略為錯開，提醒視差）
    if (!ideal) {
      const q = Math.max(-0.035, Math.min(1.035, state.needle[kind].p));
      const a = angOf(g, q) + 0.012;
      const p1 = polar(g, g.rad * 0.83, a), p2 = polar(g, g.rad * 0.9, a);
      c.strokeStyle = LD.alpha(C.ink, 0.35); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke();
    }
    drawNeedle(c, g, state.needle[kind].p, true, rd.over);
    c.restore();
    drawPivot(c, g, fx, fy, fw, fh, true);
    // 檔位與讀數列
    const by = y + h - bar - 4, cxm = x + w / 2;
    const fs = kind === 'A' ? fsA() : fsV();
    const unit = kind === 'A' ? 'mA' : 'V';
    const div = kind === 'A' ? fs / A_DIVS * 1000 : fs / V_DIVS;
    const rangeTxt = kind === 'A'
      ? T('檔位 ', 'Range ') + fs * 1000 + ' mA'
      : T('檔位 ', 'Range ') + fs + ' V';
    const divTxt = T('每小格 ', 'division ') + sig(div, 2) + ' ' + unit + (ideal ? '' : T('，估讀到 ', ', read to ') + sig(div / 2, 2) + ' ' + unit);
    let readTxt, col = C.dark ? C.text : C.surface;
    if (rd.over) { readTxt = T('超過量程！', 'Off scale!'); col = C.pos; }
    else {
      const v = kind === 'A' ? rd.reading * 1000 : rd.reading;
      readTxt = T('讀數 ', 'Reading ') + fix(v, kind === 'A' ? aDec(state.ra, ideal) : vDec(state.rv, ideal)) + ' ' + unit;
    }
    const big = Math.max(13, Math.min(18, w * 0.042));
    const small = Math.max(10, Math.min(12.5, w * 0.03));
    c.textBaseline = 'middle';
    if (w >= 330) {
      c.font = '600 ' + small + 'px ' + FF; c.textAlign = 'left';
      c.fillStyle = LD.alpha(C.dark ? C.text : C.surface, 0.85);
      c.fillText(rangeTxt, x + 16, by + bar * 0.32);
      c.font = '500 ' + fitFont(c, divTxt, 500, small - 0.5, w * 0.5) + 'px ' + FF;
      c.fillStyle = LD.alpha(C.dark ? C.text : C.surface, 0.65);
      c.fillText(divTxt, x + 16, by + bar * 0.72);
      c.font = '800 ' + fitFont(c, readTxt, 800, big, w * 0.42) + 'px ' + FF; c.textAlign = 'right';
      c.fillStyle = col;
      c.fillText(readTxt, x + w - 16, by + bar * 0.5);
    } else {
      c.font = '800 ' + big + 'px ' + FF; c.textAlign = 'center'; c.fillStyle = col;
      c.fillText(readTxt, cxm, by + bar * 0.5);
    }
    // 零點偏移的提示
    if (!ideal && !state.zeroed[kind] && state.zero[kind] !== 0) {
      LD.pill(c, T('還沒歸零', 'not zeroed'), fx + fw - 6, fy + 22, C.pos, 'right', '700 11px ' + FF);
    }
  }

  // ======================= 畫布：I–V 圖 =======================
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let G = null;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    const narrow = w < 560;
    const h = narrow ? 320 : 360;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (gcv.style.height !== h + 'px') gcv.style.height = h + 'px';
    gcv.width = Math.round(w * dpr); gcv.height = Math.round(h * dpr);
    G = { w: w, h: h, dpr: dpr, narrow: narrow };
    drawGraph();
  }
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  function niceMax(v, n) {
    if (!(v > 0)) return 1;
    const st = niceStep(v / (n || 5));
    return Math.ceil(v / st - 1e-9) * st;
  }
  function decOf(step) { return step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)); }
  let gPulse = null;
  function drawGraph() {
    if (!G) return;
    readColorsIfNeeded();
    const c = gctx, W = G.w, H = G.h, dk = C.dark;
    c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    LD.backdrop(c, W, H);
    const font = '600 11px ' + FF;
    const el = state.el;
    const lists = { ext: series(el, 'ext'), int: series(el, 'int') };
    const fits = { ext: fitOf(lists.ext, el, 'ext'), int: fitOf(lists.int, el, 'int') };
    const P = { x: G.narrow ? 48 : 60, y: 40, w: 0, h: 0 };
    P.w = W - P.x - 16; P.h = H - P.y - 46;
    // 範圍：數據點與目前的讀數
    let xMax = 0, yMax = 0;
    ['ext', 'int'].forEach(function (m) { lists[m].forEach(function (p) { xMax = Math.max(xMax, p.V); yMax = Math.max(yMax, p.I * 1000); }); });
    const rd = state.rd;
    const live = rd && !rd.A.over && !rd.V.over && state.sol && state.emf > 0;
    if (live) { xMax = Math.max(xMax, rd.V.reading); yMax = Math.max(yMax, rd.A.reading * 1000); }
    if (!(xMax > 0)) xMax = 1;
    if (!(yMax > 0)) yMax = 10;
    xMax = niceMax(xMax * 1.12, 5);
    yMax = niceMax(yMax * 1.12, 5);
    const px = function (v) { return P.x + v / xMax * P.w; };
    const py = function (i) { return P.y + P.h - i / yMax * P.h; };
    LD.roundRect(c, P.x - 1, P.y - 1, P.w + 2, P.h + 2, 4);
    c.fillStyle = LD.alpha(C.surface, dk ? 0.28 : 0.55); c.fill();
    const xs = niceStep(xMax / (G.narrow ? 4 : 6)), ys = niceStep(yMax / 5);
    c.lineWidth = 1;
    [[dk ? 0.05 : 0.04, xs / 2, ys / 2], [dk ? 0.11 : 0.1, xs, ys]].forEach(function (lv) {
      c.strokeStyle = LD.alpha(C.text, lv[0]);
      c.beginPath();
      for (let x = lv[1]; x <= xMax + 1e-9; x += lv[1]) { const xx = Math.round(px(x)) + 0.5; c.moveTo(xx, P.y); c.lineTo(xx, P.y + P.h); }
      for (let y = lv[2]; y <= yMax + 1e-9; y += lv[2]) { const yy = Math.round(py(y)) + 0.5; c.moveTo(P.x, yy); c.lineTo(P.x + P.w, yy); }
      c.stroke();
    });
    c.strokeStyle = LD.alpha(C.muted, 0.9);
    c.beginPath();
    const ax0 = Math.round(px(0)) + 0.5, ay0 = Math.round(py(0)) + 0.5;
    c.moveTo(ax0, P.y); c.lineTo(ax0, P.y + P.h); c.moveTo(P.x, ay0); c.lineTo(P.x + P.w, ay0);
    for (let x = 0; x <= xMax + 1e-9; x += xs) { const xx = Math.round(px(x)) + 0.5; c.moveTo(xx, P.y + P.h); c.lineTo(xx, P.y + P.h + 3.5); }
    c.stroke();
    c.font = font; c.fillStyle = C.muted;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let x = 0; x <= xMax + 1e-9; x += xs) c.fillText(fix(x, decOf(xs)), px(x), P.y + P.h + 5);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = 0; y <= yMax + 1e-9; y += ys) c.fillText(fix(y, decOf(ys)), P.x - 6, py(y));
    const tf = '700 12px ' + FF;
    LD.haloText(c, 'I (mA)', 6, P.y - 12, C.text, 'left', 'bottom', tf);
    LD.haloText(c, 'V (V)', P.x + P.w, P.y + P.h + 30, C.text, 'right', 'middle', tf);

    c.save();
    c.beginPath(); c.rect(P.x, P.y - 2, P.w + 2, P.h + 4); c.clip();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const colOf = function (m) { return m === 'ext' ? C.neg : C.pos; };
    const Rt = trueR(el);
    const showTrue = Rt && (el !== 'X' || state.revealed);
    const dashed = function (k, col) {
      c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(xMax), py(k * xMax * 1000));
      c.strokeStyle = LD.alpha(C['canvas-bg'], 0.7); c.lineWidth = 4; c.stroke();
      c.strokeStyle = col; c.lineWidth = 1.6; c.setLineDash([6, 5]); c.stroke(); c.setLineDash([]);
    };
    if (showTrue) dashed(1 / Rt, LD.alpha(C.muted, 0.95));
    if (el === 'lamp') dashed(1 / K.LAMP.R0, LD.alpha(C.muted, 0.8));
    ['ext', 'int'].forEach(function (m) {
      const list = lists[m], f = fits[m];
      if (el === 'lamp') {
        if (list.length >= 2) {
          const sorted = list.slice().sort(function (a, b) { return a.V - b.V; });
          c.beginPath(); c.moveTo(px(0), py(0));
          sorted.forEach(function (p) { c.lineTo(px(p.V), py(p.I * 1000)); });
          c.strokeStyle = LD.alpha(colOf(m), 0.75); c.lineWidth = 2; c.stroke();
        }
      } else if (f && list.length >= 2) {
        c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(xMax), py(f.k * xMax * 1000));
        c.strokeStyle = LD.alpha(C['canvas-bg'], 0.75); c.lineWidth = 5.5; c.stroke();
        c.strokeStyle = colOf(m); c.lineWidth = 2.2; c.stroke();
      }
    });
    // 目前的工作點（還沒記錄）：空心圓
    if (live) {
      const x = px(rd.V.reading), y = py(rd.A.reading * 1000);
      c.strokeStyle = LD.alpha(colOf(state.method), 0.9); c.lineWidth = 1.6;
      c.setLineDash([3, 3]);
      c.beginPath(); c.arc(x, y, 7.5, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    const r = G.narrow ? 4.6 : 5.4;
    ['ext', 'int'].forEach(function (m) {
      lists[m].forEach(function (p) {
        const x = px(p.V), y = py(p.I * 1000);
        const latest = state.pts[state.latest] === p;
        if (latest) {
          c.strokeStyle = LD.alpha(colOf(m), 0.55); c.lineWidth = 1.5;
          c.beginPath(); c.arc(x, y, r + 4.5, 0, Math.PI * 2); c.stroke();
          if (gPulse) LD.ripple(c, x, y, r + 3, (performance.now() - gPulse) / 650, colOf(m));
        }
        LD.ball(c, x, y, r, colOf(m));
      });
    });
    c.restore();
    // 圖例
    let lx = P.x + 8, ly = P.y + 12;
    const legend = function (txt, col, dash) {
      c.font = font;
      const w = c.measureText(txt).width + 12 + 26;
      if (lx + w > P.x + P.w - 4) { lx = P.x + 8; ly += 22; }
      c.strokeStyle = col; c.lineWidth = 2.2; c.lineCap = 'round';
      if (dash) c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 16, ly); c.stroke(); c.setLineDash([]);
      const b = LD.pill(c, txt, lx + 22, ly + 9, col, 'left', font);
      lx = b.x + b.w + 10;
    };
    ['ext', 'int'].forEach(function (m) {
      const f = fits[m];
      if (!lists[m].length) return;
      if (el === 'lamp') legend(methodName(m, true) + ' · ' + lists[m].length + T(' 點', ' pts'), colOf(m));
      else legend(methodName(m, true) + (f ? ' R = ' + fmtR(f.R, 4) : ''), colOf(m));
    });
    if (showTrue) legend(T('真實 ', 'true ') + 'R = ' + fmtR(Rt, 4), C.muted, true);
    if (el === 'lamp') legend(T('冷電阻 ', 'cold ') + fmtR(K.LAMP.R0, 2), C.muted, true);
    if (!lists.ext.length && !lists.int.length) {
      const msg = T('調整電源電壓，按「記錄」把讀數畫上來（虛線圓圈是目前的讀數）', 'Set the supply voltage and press “Record” to plot the readings (the dashed circle is the present reading)');
      c.font = font;
      const words = /[一-鿿]/.test(msg) ? Array.from(msg) : msg.split(' ');
      const sep = /[一-鿿]/.test(msg) ? '' : ' ';
      const lines = []; let line = '';
      const maxW = Math.min(P.w - 30, 380);
      words.forEach(function (wd) { const t = line ? line + sep + wd : wd; if (c.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t; });
      if (line) lines.push(line);
      lines.forEach(function (ln, i) { LD.haloText(c, ln, P.x + P.w / 2, P.y + P.h * 0.62 + (i - (lines.length - 1) / 2) * 16, C.muted, 'center', 'middle', font); });
    }
  }
  function pulseGraph() {
    if (reducedMotion) { drawGraph(); return; }
    gPulse = performance.now();
    const step = function () {
      drawGraph();
      if (gPulse && performance.now() - gPulse < 650) requestAnimationFrame(step);
      else { gPulse = null; drawGraph(); }
    };
    requestAnimationFrame(step);
  }

  // ======================= 表格與讀數 =======================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] === html) return; lastHTML[id] = html; $(id).innerHTML = html; }
  function renderTable() {
    const el = state.el;
    const rows = state.pts.filter(function (p) { return p.el === el; });
    let h = '<tr><th>' + T('次', '#') + '</th><th>' + T('接法', 'Conn.') + '</th><th>V<br><small>(V)</small></th><th>I<br><small>(mA)</small></th><th>V/I<br><small>(Ω)</small></th></tr>';
    if (!rows.length) {
      h += '<tr class="empty"><td colspan="5">' + T('還沒有「' + elemName(el) + '」的數據。', 'No data for “' + elemName(el) + '” yet.') + '</td></tr>';
    }
    rows.forEach(function (p, i) {
      const latest = state.pts[state.latest] === p;
      h += '<tr' + (latest ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td class="m-' + p.m + '">' + methodName(p.m, true) + '</td><td>' + fix(p.V, p.vd) + '</td><td>' + fix(p.I * 1000, p.ad) + '</td><td>' + (p.I > 0 ? sig(p.V / p.I, 4) : '—') + '</td></tr>';
    });
    setHTML('tbl', h);
    // 結果整理
    const fits = allFits();
    let s = '<tr><th>' + T('元件', 'Part') + '</th><th>' + T('接法', 'Conn.') + '</th><th>' + T('點', 'n') + '</th><th>R<br><small>(Ω)</small></th><th>' + T('誤差', 'Error') + '</th></tr>';
    const keys = Object.keys(fits);
    if (!keys.length) s += '<tr class="empty"><td colspan="5">' + T('記錄數據後，每個元件、每種接法的結果會列在這裡。', 'After you record data, the result for each component and connection appears here.') + '</td></tr>';
    keys.forEach(function (k) {
      const f = fits[k];
      let Rtxt = isFinite(f.R) ? sig(f.R, 4) : '—', E = '—', cls = '';
      if (f.el === 'lamp') {
        const L = state.pts.filter(function (p) { return p.el === 'lamp' && p.m === f.m && p.I > 0 && p.V > 0; });
        if (L.length) { let a = Infinity, b = 0; L.forEach(function (p) { a = Math.min(a, p.V / p.I); b = Math.max(b, p.V / p.I); }); Rtxt = sig(a, 2) + '–' + sig(b, 2); }
      } else if (f.err != null && (f.el !== 'X' || state.revealed)) { E = pct(f.err, 1); if (Math.abs(f.err) < 0.01) cls = ' class="good"'; }
      else if (f.el === 'X') E = '?';
      s += '<tr><td>' + elemName(f.el) + '</td><td class="m-' + f.m + '">' + methodName(f.m, true) + '</td><td>' + f.n + '</td><td>' + Rtxt + '</td><td' + cls + '>' + E + '</td></tr>';
    });
    setHTML('sum', s);
  }

  function renderReadouts() {
    const s = state.sol, el = state.el, m = state.method;
    const rA = K.ammeterR(fsA()), rV = K.voltmeterR(fsV());
    // 分析結果
    const list = series(el, m), f = fitOf(list, el, m);
    let h = '<dt>' + T('目前這一組', 'This data set') + '</dt><dd>' + elemName(el) + '<small>' + methodName(m) + '</small></dd>';
    h += '<dt>' + T('數據點', 'Data points') + '</dt><dd>' + list.length + '</dd>';
    const Rt = trueR(el);
    if (el === 'lamp') {
      const ls = lampStats();
      h += '<dt>' + T('V/I 的範圍', 'Range of V/I') + '</dt><dd>' + (ls.n ? fmtR(ls.rmin, 3) + ' – ' + fmtR(ls.rmax, 3) : '—') + '</dd>';
      h += '<dt>' + T('最大 ÷ 最小', 'Largest ÷ smallest') + '</dt><dd>' + (ls.n >= 2 ? ls.ratio.toFixed(2) + ' ×' : '—') + '</dd>';
      h += '<dt>' + T('冷電阻（三用電表）', 'Cold resistance (multimeter)') + '</dt><dd>' + (state.lampCold != null ? fmtR(state.lampCold, 2) : '—') + '</dd>';
      h += '<dd class="wide">' + T('燈泡的 I–V 圖是曲線：電壓愈大，燈絲愈熱，V/I 愈大。這裡不畫通過原點的直線。', 'The bulb’s I–V graph is a curve: the higher the voltage, the hotter the filament and the larger V/I. No straight line through the origin is drawn.') + '</dd>';
    } else {
      h += '<dt>' + T('斜率', 'Slope') + ' <span class="f">k = I/V</span></dt><dd>' + (f ? sig(f.k * 1000, 4) + ' mA/V' : '—') + '</dd>';
      h += '<dt>' + T('實驗值', 'Measured') + ' <span class="f">R = 1/k</span></dt><dd><b>' + (f ? fmtR(f.R, 4) : '—') + '</b></dd>';
      if (f && list.length >= 3 && isFinite(f.icpt)) h += '<dt>' + T('含截距直線的截距', 'Intercept of the free line') + '</dt><dd>' + (f.icpt >= 0 ? '+' : '−') + sig(Math.abs(f.icpt * 1000), 2) + ' mA</dd>';
      const hidden = el === 'X' && !state.revealed;
      h += '<dt>' + T('真實值', 'True value') + '</dt><dd>' + (hidden ? T('？（色環被貼住）', '? (colour code hidden)') : fmtR(Rt, 4)) + (el === 'carbon' || (el === 'X' && !hidden) ? '<small>' + T('色環標示 ', 'marked ') + (el === 'X' ? MYST.nominal : 100) + ' Ω ±5%</small>' : '') + '</dd>';
      if (f && !hidden) {
        const good = Math.abs(f.err) < 0.01;
        h += '<dt>' + T('百分誤差', 'Percent error') + '</dt><dd' + (good ? ' class="good"' : '') + '>' + pct(f.err, 2) + '</dd>';
      }
      const pred = K.predictedR(m, Rt, rA, rV);
      h += '<dt>' + T('此接法的理論值 R′', 'Expected R′ for this connection') + '</dt><dd>' + (hidden ? '—' : fmtR(pred, 4) + '<small>' + pct(pred / Rt - 1, 2) + '</small>') + '</dd>';
      h += '<dd class="wide">' + (m === 'int'
        ? T('內接法：R′ = R + r<sub>A</sub>，一定偏大（目前 r<sub>A</sub> = ' + sig(rA, 2) + ' Ω）。', 'Ammeter inside: R′ = R + r<sub>A</sub>, always too large (now r<sub>A</sub> = ' + sig(rA, 2) + ' Ω).')
        : T('外接法：R′ = R r<sub>V</sub>/(R + r<sub>V</sub>)，一定偏小（目前 r<sub>V</sub> = ' + sig(rV / 1000, 2) + ' kΩ）。', 'Ammeter outside: R′ = R r<sub>V</sub>/(R + r<sub>V</sub>), always too small (now r<sub>V</sub> = ' + sig(rV / 1000, 2) + ' kΩ).')) + '</dd>';
      if (f && list.length >= 4 && isFinite(f.icpt) && isFinite(f.icptSE) && Math.abs(f.icpt) > 3 * f.icptSE && Math.abs(f.icpt) > 0.02 * f.k * f.vmax) {
        h += '<dd class="wide warn">' + T('數據的直線沒有通過原點：電表歸零了嗎？', 'The data do not line up through the origin: were the meters zeroed?') + '</dd>';
      }
    }
    setHTML('fitOut', h);
    // 真實情況
    const mA = function (I) { return sig(I * 1000, 4) + ' mA'; };
    const V = function (v) { return sig(v, 4) + ' V'; };
    let t = '';
    t += '<dt>' + T('元件兩端的電壓', 'Voltage across the part') + ' <span class="f">V<sub>R</sub></span></dt><dd>' + V(s.VR) + '</dd>';
    t += '<dt>' + T('流過元件的電流', 'Current through the part') + ' <span class="f">I<sub>R</sub></span></dt><dd>' + mA(s.IR) + '</dd>';
    t += '<dt>' + T('伏特計受到的電壓', 'Voltage on the voltmeter') + '</dt><dd>' + V(s.VV) + '</dd>';
    t += '<dt>' + T('流過毫安培計的電流', 'Current through the ammeter') + '</dt><dd>' + mA(s.IA) + '</dd>';
    t += '<dt>' + T('伏特計分走的電流', 'Current taken by the voltmeter') + ' <span class="f">I<sub>V</sub></span></dt><dd>' + sig(s.IV * 1000, 3) + ' mA</dd>';
    t += '<dt>' + T('毫安培計兩端的電壓', 'Voltage across the ammeter') + ' <span class="f">I r<sub>A</sub></span></dt><dd>' + sig(s.VA, 3) + ' V</dd>';
    t += '<dt>' + T('元件此刻的電阻', 'Resistance of the part now') + '</dt><dd>' + (el === 'X' && !state.revealed ? '?' : (state.burnt && el === 'lamp' ? '∞' : fmtR(s.Rx, 4))) + '</dd>';
    if (el === 'lamp') t += '<dt>' + T('燈絲溫度', 'Filament temperature') + '</dt><dd>' + (state.burnt ? '—' : Math.round(s.T) + ' K') + '<small>' + (state.burnt ? '' : T('功率 ', 'power ') + sig(s.PR, 3) + ' W') + '</small></dd>';
    t += '<dt>' + T('電源的電流與端電壓', 'Supply current, terminal voltage') + '</dt><dd>' + mA(s.Isrc) + '<small>' + V(s.Vterm) + '</small></dd>';
    setHTML('trueOut', t);
    // 電表資訊
    setHTML('meterInfo', T('毫安培計內電阻 ', 'Ammeter resistance ') + 'r<sub>A</sub> = ' + sig(rA, 2) + ' Ω　' + T('伏特計內電阻 ', 'Voltmeter resistance ') + 'r<sub>V</sub> = ' + sig(rV / 1000, 2) + ' kΩ<br>' +
      T('兩種接法誤差相同的電阻 ', 'Equal errors at ') + '≈ √(r<sub>A</sub> r<sub>V</sub>) = ' + fmtR(K.criticalR(rA, rV), 3));
    // 元件資訊
    let info;
    const el2 = state.el;
    if (K.WIRES[el2]) {
      const w = K.WIRES[el2];
      info = (w.mat === 'Cu' ? T('銅線', 'Copper wire') : T('鎳鉻合金線', 'Nichrome wire')) + T('，直徑 ', ', diameter ') + (w.d * 1000).toFixed(2) + ' mm' + T('、長 ', ', length ') + w.L + ' m' + T('。由 R = ρL/A 算出 ', '. From R = ρL/A: ') + fmtR(trueR(el2), 4) + T('。', '.');
    } else if (el2 === 'carbon') info = T('色環「棕黑棕金」= 100 Ω ±5%。實際上這一顆是 98.6 Ω。', 'Colour code brown-black-brown-gold = 100 Ω ±5%. This one is actually 98.6 Ω.');
    else if (el2 === 'X') info = state.revealed
      ? T('色環標示 ', 'Marked ') + MYST.nominal + ' Ω ±5%' + T('；這一顆的真實電阻是 ', '; this one is really ') + fmtR(MYST.actual, 4) + T('。', '.')
      : T('色環被膠帶貼住了，只能靠實驗量出來。先想想：該用哪一種接法？', 'The colour code is taped over, so you must measure it. Think first: which connection is better?');
    else info = state.burnt
      ? T('燈絲燒斷了（電路斷路）。', 'The filament has burnt out (open circuit).')
      : T('額定 2.5 V、0.3 A 的鎢絲燈泡。燈絲愈熱，電阻愈大；超過約 5 V 會燒斷。', 'A 2.5 V, 0.3 A tungsten bulb. The hotter the filament, the larger its resistance; above about 5 V it burns out.');
    setHTML('elInfo', info);
    $('reveal').hidden = !(el2 === 'X' && !state.revealed);
    $('newLamp').hidden = !(el2 === 'lamp' && state.burnt);
    $('zeroBtn').hidden = state.ideal;
    $('zeroBtn').disabled = state.ideal || (state.zeroed.A && state.zeroed.V);
  }

  // ---------- 步驟 ----------
  function renderSteps() {
    const el = state.el, m = state.method, other = m === 'ext' ? 'int' : 'ext';
    const n = series(el, m).length;
    const elemsDone = ORDER.filter(function (k) { return series(k, 'ext').length >= 3 || series(k, 'int').length >= 3; }).length;
    const done = [
      state.ideal || (state.zeroed.A && state.zeroed.V),
      state.touched.el || state.touched.m || state.pts.length > 0,
      n >= 6,
      n >= 3,
      series(el, other).length >= 3,
      elemsDone >= 2,
      !!state.dmmEls[el]
    ];
    let cur = done.indexOf(false);
    const lis = document.querySelectorAll('#steps li');
    lis.forEach(function (li, i) {
      li.classList.toggle('done', done[i]);
      li.classList.toggle('cur', i === cur);
      let pr = li.querySelector('.prog');
      if (i === 2) {
        if (!pr) { pr = document.createElement('span'); pr.className = 'prog'; li.appendChild(pr); }
        pr.textContent = T('進度 ', 'Progress ') + Math.min(n, 6) + ' / 6';
      }
    });
  }

  // ---------- 狀態列 ----------
  function setStatus(msg, warn) {
    state.msg = msg; state.warn = !!warn;
    const st = $('status');
    st.textContent = msg;
    st.classList.toggle('warn', !!warn);
  }
  function autoStatus() {
    const rd = state.rd;
    if (state.el === 'lamp' && state.burnt) { setStatus(T('燈絲燒斷了！燈泡兩端的電壓遠超過額定的 2.5 V。按「換一顆新燈泡」。', 'The filament has burnt out! The voltage across the bulb went far above its rated 2.5 V. Press “Fit a new bulb”.'), true); return; }
    if (rd.A.over && rd.V.over) { setStatus(T('兩個電表都超過量程！先把電壓調低，或換大一點的檔位。', 'Both meters are off scale! Turn the voltage down or choose larger ranges.'), true); return; }
    if (rd.A.over) { setStatus(T('毫安培計超過量程，指針打到底了！換大一點的檔位，或把電壓調低。', 'The milliammeter is off scale — the needle hit the stop! Choose a larger range or turn the voltage down.'), true); return; }
    if (rd.V.over) { setStatus(T('伏特計超過量程，指針打到底了！換 15 V 檔，或把電壓調低。', 'The voltmeter is off scale — the needle hit the stop! Choose the 15 V range or turn the voltage down.'), true); return; }
    if (state.emf === 0) { setStatus(T('電源是 0 V，電路中沒有電流。逐次調高電壓，每次按「記錄」。', 'The supply is at 0 V, so no current flows. Raise the voltage step by step and press “Record” each time.')); return; }
    const fa = rd.A.reading / fsA(), fv = rd.V.reading / fsV();
    if (fa < 0.2 || fv < 0.2) {
      const small = [];
      if (fa < 0.2 && state.ra > 0) small.push(T('毫安培計', 'the milliammeter'));
      if (fv < 0.2 && state.rv > 0) small.push(T('伏特計', 'the voltmeter'));
      if (small.length) { setStatus(T('指針偏轉很小：' + small.join('、') + '可以換小一點的檔位，讀數會更準。', 'The deflection is small: ' + small.join(' and ') + ' could use a smaller range for a more precise reading.')); return; }
    }
    setStatus(T('可以記錄了：按「記錄」把這一組讀數加進數據表。', 'Ready: press “Record” to add these readings to the table.'));
  }

  // ======================= 指針與動畫 =======================
  function needleTarget(k) { const rd = state.rd[k]; return rd.needle / (k === 'A' ? fsA() : fsV()); }
  function stepNeedles(dt) {
    let moving = false;
    ['A', 'V'].forEach(function (k) {
      const n = state.needle[k], tgt = Math.max(-0.035, Math.min(1.035, needleTarget(k)));
      if (reducedMotion) { n.p = tgt; n.v = 0; return; }
      const w = 16, z = 0.62; // 指針的機械擺動（略帶阻尼，約 0.3 s 停穩）
      const sub = 4, h = dt / sub;
      for (let i = 0; i < sub; i++) {
        const acc = w * w * (tgt - n.p) - 2 * z * w * n.v;
        n.v += acc * h; n.p += n.v * h;
        if (n.p > 1.035) { n.p = 1.035; n.v = -0.3 * n.v; }
        if (n.p < -0.035) { n.p = -0.035; n.v = -0.3 * n.v; }
      }
      if (Math.abs(n.p - tgt) > 2e-4 || Math.abs(n.v) > 2e-3) moving = true; else { n.p = tgt; n.v = 0; }
    });
    return moving;
  }
  function dotsMoving() {
    if (reducedMotion) return false;
    return cables.some(function (cb) { return Math.abs(cb.I) / fsA() > 1e-3; });
  }
  let raf = 0, lastT = 0, needMeters = true;
  function frame(now) {
    raf = 0;
    const dt = Math.min(1 / 30, Math.max(0, (now - lastT) / 1000)); lastT = now;
    const moving = stepNeedles(dt);
    if (!reducedMotion) {
      const v0 = DOT_SPEED * (B ? B.s : 1) / fsA();
      cables.forEach(function (cb) { phase[cb.id] = (phase[cb.id] || 0) + Math.min(DOT_MAX * DOT_SPEED * (B ? B.s : 1), v0 * Math.abs(cb.I)) * dt; });
    }
    drawBenchFrame();
    if (moving || needMeters) { drawMeters(); needMeters = moving; }
    if ((moving || dotsMoving()) && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() {
    needMeters = true;
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });

  // ======================= 音效 =======================
  const S = function () { return window.LabSound; };
  function sndTick() { if (S()) S().tone({ freq: 880, dur: 0.06, type: 'triangle', gain: 0.22 }); }
  function sndOver() { if (S()) { S().noise({ dur: 0.05, gain: 0.35, filter: 2600, q: 1.5 }); S().sweep({ from: 520, to: 300, dur: 0.22, type: 'sawtooth', gain: 0.12 }); } }
  function sndBurn() { if (S()) { S().noise({ dur: 0.09, gain: 0.5, filter: 3200, q: 0.8 }); S().tone({ freq: 1760, dur: 0.18, type: 'sine', gain: 0.08 }); } }
  function sndBeep() { if (S()) S().tone({ freq: 1000, dur: 0.14, type: 'square', gain: 0.12 }); }
  function sndClick() { if (S()) S().tone({ freq: 1320, dur: 0.03, type: 'square', gain: 0.1 }); }

  // ======================= 更新 =======================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function meterEvent(action, wasBurnt) {
    const s = state.sol, rd = state.rd;
    return {
      action: action, el: state.el, m: state.method, ideal: state.ideal, emf: state.emf, box: state.box,
      V: rd.V.reading, I: rd.A.reading, VV: s.VV, IA: s.IA, VR: s.VR, IR: s.IR,
      fsA: fsA(), fsV: fsV(), defA: rd.A.needle / fsA(), defV: rd.V.needle / fsV(),
      overA: rd.A.over, overV: rd.V.over, burnt: state.burnt, wasBurnt: !!wasBurnt
    };
  }
  /** 物理條件改變：重解電路、重畫一切。release = 使用者完成一次操作（回報任務事件） */
  function update(action, release) {
    const wasBurnt = state.burnt;
    const burnNow = solve();
    // 電源不是 0 V 時，三用電表拿開
    if (state.dmm && (state.emf > 0 || state.dmm.el !== state.el)) state.dmm = null;
    const over = { A: state.rd.A.over, V: state.rd.V.over };
    if ((over.A && !state.overPrev.A) || (over.V && !state.overPrev.V)) sndOver();
    state.overPrev = over;
    if (burnNow) {
      sndBurn();
      emit('burnout', { el: 'lamp', emf: state.emf, box: state.box, m: state.method });
    }
    buildBench();
    renderReadouts();
    renderTable();
    renderSteps();
    autoStatus();
    drawGraph();
    kick();
    if (release) emit('meter', meterEvent(action, wasBurnt));
  }

  // ======================= 控制項 =======================
  const emfEl = $('emf'), boxEl = $('box');
  if (window.LabNum) {
    window.LabNum.register(boxEl, {
      toValue: function (p) { return Math.round(Math.pow(10, p / 250) - 1); },
      toPos: function (v) { return 250 * Math.log10(Math.max(0, v) + 1); },
      min: 0, max: K.BOX_MAX, decimals: 0
    });
  }
  function readSliders() {
    state.emf = Math.max(0, Math.min(K.SUPPLY.max, val(emfEl)));
    state.box = Math.max(0, Math.min(K.BOX_MAX, Math.round(val(boxEl))));
    $('emfo').textContent = state.emf.toFixed(2) + ' V';
    $('boxo').textContent = state.box + ' Ω';
  }
  [emfEl, boxEl].forEach(function (el) {
    el.addEventListener('input', function () { readSliders(); update(el.id, false); });
    el.addEventListener('change', function () { readSliders(); update(el.id, true); });
  });

  function pressGroup(sel, attr, value) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))); });
  }
  document.querySelectorAll('.elems button').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = b.getAttribute('data-el');
      if (k === state.el) return;
      state.el = k; state.touched.el = true; state.latest = -1;
      pressGroup('.elems button', 'data-el', k);
      update('elem', true);
    });
  });
  document.querySelectorAll('.methods button').forEach(function (b) {
    b.addEventListener('click', function () {
      const m = b.getAttribute('data-m');
      if (m === state.method) return;
      state.method = m; state.touched.m = true;
      pressGroup('.methods button', 'data-m', m);
      update('method', true);
    });
  });
  document.querySelectorAll('#rangeA button').forEach(function (b) {
    b.addEventListener('click', function () {
      const r = +b.getAttribute('data-r');
      if (r === state.ra) return;
      state.ra = r; pressGroup('#rangeA button', 'data-r', r); sndClick();
      update('rangeA', true);
    });
  });
  document.querySelectorAll('#rangeV button').forEach(function (b) {
    b.addEventListener('click', function () {
      const r = +b.getAttribute('data-r');
      if (r === state.rv) return;
      state.rv = r; pressGroup('#rangeV button', 'data-r', r); sndClick();
      update('rangeV', true);
    });
  });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      const ideal = b.getAttribute('data-mode') === 'ideal';
      if (ideal === state.ideal) return;
      state.ideal = ideal;
      if (!ideal && !state.zeroMade) {
        // 第一次切到「含誤差」：兩個電表的指針沒有對準 0（各偏 0.3–1 小格，方向隨機）
        state.zeroMade = true;
        ['A', 'V'].forEach(function (k) { state.zero[k] = (Math.random() < 0.5 ? -1 : 1) * (0.3 + 0.7 * Math.random()); });
      }
      pressGroup('#modeSeg button', 'data-mode', ideal ? 'ideal' : 'real');
      update('mode', true);
      if (!ideal && !(state.zeroed.A && state.zeroed.V)) setStatus(T('含誤差模式：指針沒有對準 0。把電源調到 0 V，再按「電表歸零」。', 'With errors: the needles are not on zero. Turn the supply to 0 V and press “Zero the meters”.'));
    });
  });
  $('zeroBtn').addEventListener('click', function () {
    if (state.emf > 0) { setStatus(T('歸零要在沒有電流時做：先把電源調到 0 V。', 'Zero the meters with no current flowing: turn the supply to 0 V first.'), true); return; }
    state.zeroed.A = state.zeroed.V = true; state.zero.A = state.zero.V = 0;
    sndClick();
    update('zero', false);
    emit('zero', { ideal: state.ideal });
    setStatus(T('兩個電表都歸零了。現在可以開始量了。', 'Both meters are zeroed. You can start measuring.'));
  });
  $('reveal').addEventListener('click', function () {
    state.revealed = true;
    update('reveal', false);
    emit('reveal', { el: 'X', nominal: MYST.nominal, actual: MYST.actual });
  });
  $('newLamp').addEventListener('click', function () {
    state.burnt = false;
    update('newLamp', true);
    setStatus(T('換上新燈泡了。這次電壓不要超過額定太多！', 'New bulb fitted. Keep the voltage near its rating this time!'));
  });

  // ---- 記錄 ----
  $('rec').addEventListener('click', function () {
    const rd = state.rd, s = state.sol;
    if (rd.A.over || rd.V.over) { sndOver(); setStatus(T('電表超過量程，不能讀數。先換大一點的檔位。', 'A meter is off scale and cannot be read. Choose a larger range first.'), true); return; }
    if (rd.A.reading <= 0 && rd.V.reading <= 0) { setStatus(T('兩個電表都是 0，先調高電源電壓。', 'Both meters read zero: raise the supply voltage first.'), true); return; }
    const p = {
      id: state.nextId++, el: state.el, m: state.method, V: rd.V.reading, I: rd.A.reading,
      ra: state.ra, rv: state.rv, ideal: state.ideal, zeroed: state.ideal || (state.zeroed.A && state.zeroed.V),
      ad: aDec(state.ra, state.ideal), vd: vDec(state.rv, state.ideal), VR: s.VR, IR: s.IR
    };
    state.pts.push(p);
    state.latest = state.pts.length - 1;
    sndTick();
    reread(); // 再讀一次會有新的估讀誤差
    renderTable(); renderReadouts(); renderSteps(); pulseGraph(); kick();
    const list = series(p.el, p.m);
    setStatus(T('記錄了第 ' + list.length + ' 點：V = ' + fix(p.V, p.vd) + ' V、I = ' + fix(p.I * 1000, p.ad) + ' mA。', 'Point ' + list.length + ' recorded: V = ' + fix(p.V, p.vd) + ' V, I = ' + fix(p.I * 1000, p.ad) + ' mA.'));
    emit('record', {
      el: p.el, m: p.m, ideal: p.ideal, zeroed: p.zeroed, V: p.V, I: p.I, fsA: fsA(), fsV: fsV(),
      defA: p.I / fsA(), defV: p.V / fsV(), emf: state.emf, box: state.box,
      Rtrue: trueR(p.el), VR: s.VR, IR: s.IR, n: list.length, revealed: state.revealed, lampCold: state.lampCold,
      fit: fitOf(list, p.el, p.m), fits: allFits(), lamp: lampStats()
    });
  });
  $('undo').addEventListener('click', function () {
    if (!state.pts.length) return;
    const i = state.latest >= 0 ? state.latest : state.pts.length - 1;
    state.pts.splice(i, 1);
    state.latest = -1;
    renderTable(); renderReadouts(); renderSteps(); drawGraph();
    setStatus(T('移除了一點。', 'One point removed.'));
  });
  $('clearAll').addEventListener('click', function () {
    state.pts = []; state.latest = -1; state.dmm = null; state.lampCold = null; state.dmmEls = {};
    update('clear', false);
    setStatus(T('數據全部清除了；電源、電阻箱與電表的設定沒有改變。', 'All data cleared; the supply, box and meter settings are unchanged.'));
  });
  $('dmm').addEventListener('click', function () {
    if (state.emf > 0) {
      setStatus(T('量電阻前要先把電源調到 0 V：三用電表的 Ω 檔不能接在通電的電路上。', 'Turn the supply to 0 V first: the Ω setting of a multimeter must never be used on a live circuit.'), true);
      return;
    }
    const el = state.el;
    const R = el === 'lamp' ? (state.burnt ? Infinity : K.LAMP.R0) : trueR(el);
    const r = K.multimeter(R, { ideal: state.ideal });
    state.dmm = Object.assign({ el: el }, r);
    state.dmmEls[el] = true;
    if (el === 'lamp' && !state.burnt) state.lampCold = r.value;
    sndBeep();
    buildBench(); renderReadouts(); renderSteps(); kick();
    const shown = r.over ? T('超過量程（斷路）', 'over range (open circuit)') : (r.range >= 20000 ? (r.value / 1000).toFixed(2) + ' kΩ' : (r.range === 200 ? r.value.toFixed(1) : r.value.toFixed(0)) + ' Ω');
    setStatus(T('三用電表（元件已從電路拆下）：' + elemName(el) + ' = ' + shown + '。', 'Multimeter (part taken out of the circuit): ' + elemName(el) + ' = ' + shown + '.'));
    emit('multimeter', { el: el, value: r.value, over: r.over, Rtrue: R, cold: el === 'lamp' && !state.burnt });
  });

  // ---- 喇叭按鈕 ----
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
  updateSoundButton();

  // ======================= 啟動 =======================
  readColors(); colorVer = LD.ver;
  // 預設 R箱 = 10 Ω：直接設滑桿位置（LabNum.set 會送出 change 事件，載入時不可回報任務事件）
  boxEl.value = '260';
  if (window.LabNum) window.LabNum.clear(boxEl);
  readSliders();
  pressGroup('.elems button', 'data-el', state.el);
  pressGroup('.methods button', 'data-m', state.method);
  solve();
  // 開頭指針直接停在讀數上（不從 0 擺過來）
  ['A', 'V'].forEach(function (k) { state.needle[k].p = Math.max(-0.035, Math.min(1.035, needleTarget(k))); });
  state.overPrev = { A: state.rd.A.over, V: state.rd.V.over };
  function themeChanged() { readColors(); colorVer = LD.ver; buildBench(); drawGraph(); kick(); }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  }
  const widths = new WeakMap();
  function observe(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth !== widths.get(el)) { widths.set(el, el.clientWidth); fn(); } }).observe(el);
    window.addEventListener('resize', fn);
  }
  observe(cv, function () { resizeBench(); kick(); });
  observe(mv, function () { resizeMeters(); });
  observe(gcv, resizeGraph);
  resizeBench(); resizeMeters(); resizeGraph();
  renderReadouts(); renderTable(); renderSteps(); autoStatus();
  setStatus(T('預設：銅線 b 用安培計內接法。逐次調高電源電壓，每次按「記錄」，看看量到的電阻和 ρL/A 一樣嗎？', 'Default: copper wire b with the ammeter inside. Raise the supply voltage step by step and press “Record” each time — does the result match ρL/A?'));
  kick();
})();
