/* seafloor-spreading.js — 「海底擴張與磁條帶」的畫面與互動
 * 物理計算全部在 seafloor-spreading-core.js；3D 方塊圖在 seafloor-spreading-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.SeafloorCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const T_START = 8;                 // 播放從 8 Ma 前開始
  const ZMAX = 4.6;                  // 剖面畫到海面下 4.6 km（8.1 Ma 的磁性層底約 4.1 km）
  const R_MA = 8.6;                  // 剖面畫到 8.6 Ma 的地殼（比年表多一點，看得到灰色的舊地殼）
  const MYSTERY_R = 400;             // 神秘海脊時剖面固定畫 ±400 km（不洩露速率）

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { uR: $('uR'), uL: $('uL'), zs: $('zs'), tau: $('tau') };
  const state = {
    uL: 2.5, uR: 2.5, sym: true, zs: 0, tau: 0, cx: 0,
    running: false, speed: 0.4, chart: 'gpts', acted: false, fullRun: false,
    mystery: null              // { u, done }：神秘海脊進行中
  };
  function rates() { return state.mystery ? { uL: state.mystery.u, uR: state.mystery.u } : { uL: state.uL, uR: state.uR }; }
  function P() { const r = rates(); return { uL: r.uL, uR: r.uR, tau: state.tau, zs: state.zs }; }
  function range() { if (state.mystery) return MYSTERY_R; const r = rates(); return R_MA * Math.max(r.uL, r.uR) * K.KM_PER_MA; }
  function readSliders() {
    state.uR = val(el.uR);
    state.uL = state.sym ? state.uR : val(el.uL);
    state.zs = val(el.zs);
    state.tau = val(el.tau);
  }
  let prof = null, xs = [], lastKey = '';
  function recompute(force) {
    const R = range(), p = P(), n = cvSize && cvSize.w < 520 ? 360 : 520;
    const key = [p.uL, p.uR, p.tau, p.zs, R, n].join('|');
    if (!force && key === lastKey) return;
    lastKey = key;
    xs = new Array(n + 1);
    for (let i = 0; i <= n; i++) xs[i] = -R + 2 * R * i / n;
    prof = K.profile(p, xs, R * 1.04);
    state.cx = Math.max(-R, Math.min(R, state.cx));
  }
  function anomalyAt(x) {
    const R = range(), n = xs.length - 1, u = (x + R) / (2 * R) * n, i = Math.max(0, Math.min(n - 1, Math.floor(u))), f = u - i;
    return prof.B[i] * (1 - f) + prof.B[i + 1] * f;
  }
  function crustAt(x) { return K.crustAt(P(), x); }
  function bmDist() { const p = P(); return [K.namedAt(p, 'brunhes', -1)[1], K.namedAt(p, 'brunhes', 1)[1]]; }
  // 亞期看不看得出來：用核心的固定解析度判定（和螢幕寬度無關），同一組設定只算一次
  let resKey = '', resVal = null;
  function stats() {
    let mx = -Infinity; for (let i = 0; i < prof.B.length; i++) if (prof.B[i] > mx) mx = prof.B[i];
    const p = P(), key = [p.uL, p.uR, p.tau, p.zs].join('|');
    if (key !== resKey) { resKey = key; resVal = { ja: K.resolved(p, 0.988, 1.072, 30, 1), cobb: K.resolved(p, 1.173, 1.185, 20, 1) }; }
    return { Bmax: mx, ja: resVal.ja, cobb: resVal.cobb };
  }

  // =====================================================================
  // 顏色與文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface',
      '--sf-n', '--sf-r', '--sf-old', '--sf-sea1', '--sf-sea2', '--sf-crust', '--sf-mantle', '--sf-magma', '--sf-curve', '--sf-cursor', '--sf-depth', '--sf-heat']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function chronName(t) {
    if (!(t <= K.T_MAX)) return T('8.1 Ma 以前', 'before 8.1 Ma');
    const sub = K.NAMED.filter(function (q) { return t >= q.a && t <= q.b; });
    const short = sub.filter(function (q) { return q.b - q.a < 0.5; });
    if (short.length) return T(short[0].zh + '正向亞期', short[0].en + ' normal subchron');
    if (t >= 1.173 && t <= 1.185) return T('卡布山正向亞期', 'Cobb Mountain normal subchron');
    if (sub.length) return T(sub[0].zh, sub[0].en);
    return K.polarity(t) > 0 ? T('正向期', 'normal chron') : T('反向期', 'reversed chron');
  }
  function polHTML(p, withName, t) {
    if (!p) return '<span class="pol o">' + T('未模擬', 'not modelled') + '</span>';
    const nm = withName ? chronName(t) : '', generic = nm === T('正向期', 'normal chron') || nm === T('反向期', 'reversed chron');
    return '<span class="pol ' + (p > 0 ? 'n' : 'r') + '">' + (p > 0 ? T('正向', 'Normal') : T('反向', 'Reversed')) + '</span>' + (nm && !generic ? '　' + nm : '');
  }
  function maText(t) { return t < 0.0005 ? T('現在', 'now') : num(t, 3) + T(' Ma 前', ' Myr ago'); }

  // =====================================================================
  // 主畫布：磁異常＋剖面
  // =====================================================================
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
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); recompute(); requestDraw(); }
  function lay() {
    const W = cvSize.w, H = cvSize.h, narrow = W < 520;
    const xl = narrow ? 40 : 52, xr = W - (narrow ? 12 : 18);
    const a0 = 26, a1 = Math.round(H * 0.36);           // 磁異常區
    const s0 = a1 + 34, s1 = H - 36;                    // 剖面：海面 s0、海面下 ZMAX 在 s1（底下留給距離刻度與軸名）
    const R = range();
    return { W: W, H: H, narrow: narrow, xl: xl, xr: xr, a0: a0, a1: a1, s0: s0, s1: s1, R: R,
      px: function (x) { return xl + (x + R) / (2 * R) * (xr - xl); },
      xOf: function (p) { return (p - xl) / (xr - xl) * 2 * R - R; },
      pz: function (z) { return s0 + z / ZMAX * (s1 - s0); } };
  }
  function niceCeil(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function seafloorZ(x) { const r = rates(), u = (x < 0 ? r.uL : r.uR) * K.KM_PER_MA; return K.depth(Math.abs(x) / u) / 1000; }
  function drawMain(tnow) {
    if (!cvSize || !prof) return;
    const L = lay(), g = ctx, W = L.W, H = L.H, fs = L.narrow ? 10.5 : 11.5;
    g.clearRect(0, 0, W, H);
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    // ---------- 磁異常 ----------
    let bm = 0; for (let i = 0; i < prof.B.length; i++) bm = Math.max(bm, Math.abs(prof.B[i]));
    const Bm = niceCeil(Math.max(100, bm * 1.08));
    const yB = function (b) { return (L.a0 + L.a1) / 2 - b / Bm * (L.a1 - L.a0) / 2; };
    const y0 = yB(0);
    g.save();
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    [-Bm, -Bm / 2, Bm / 2, Bm].forEach(function (b) { const y = Math.round(yB(b)) + 0.5; g.beginPath(); g.moveTo(L.xl, y); g.lineTo(L.xr, y); g.stroke(); });
    g.restore();
    // 正、負面積填色
    function fillPart(sign, color) {
      g.save(); g.beginPath(); g.moveTo(L.px(xs[0]), y0);
      for (let i = 0; i < xs.length; i++) { const b = sign > 0 ? Math.max(0, prof.B[i]) : Math.min(0, prof.B[i]); g.lineTo(L.px(xs[i]), yB(b)); }
      g.lineTo(L.px(xs[xs.length - 1]), y0); g.closePath();
      g.fillStyle = D.alpha(color, 0.32); g.fill(); g.restore();
    }
    fillPart(1, C['sf-n']); fillPart(-1, C['sf-r']);
    g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1; g.beginPath(); g.moveTo(L.xl, Math.round(y0) + 0.5); g.lineTo(L.xr, Math.round(y0) + 0.5); g.stroke();
    g.save(); g.lineJoin = 'round'; g.strokeStyle = C['sf-curve']; g.lineWidth = 1.8; g.beginPath();
    for (let i = 0; i < xs.length; i++) { const x = L.px(xs[i]), y = yB(prof.B[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke(); g.restore();
    [Bm, 0, -Bm].forEach(function (b) { D.haloText(g, (b > 0 ? '+' : '') + num(b, 0), L.xl - 5, yB(b), C.muted, 'right', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT); });
    D.haloText(g, L.narrow ? T('磁異常（nT）', 'Anomaly (nT)') : T('磁異常（nT）', 'Magnetic anomaly (nT)'), L.xl + 4, L.a0 - 12, C.muted, 'left', 'middle', '600 ' + fs + 'px ' + FONT);
    D.haloText(g, L.narrow ? T('磁力計深 ', 'Sensor depth ') + num(state.zs, 2) + ' km' : T('磁力計在海面下 ', 'Magnetometer ') + num(state.zs, 2) + T(' km', ' km below the surface'), L.xr, L.a0 - 12, C.muted, 'right', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);

    // ---------- 剖面 ----------
    // 天空與海
    const skyTop = L.a1 + 8;
    const sea = g.createLinearGradient(0, L.s0, 0, L.pz(3.8));
    sea.addColorStop(0, C['sf-sea1']); sea.addColorStop(1, C['sf-sea2']);
    g.fillStyle = sea; g.fillRect(L.xl, L.s0, L.xr - L.xl, L.s1 - L.s0);
    g.fillStyle = D.alpha(C['sf-sea1'], 0.25); g.fillRect(L.xl, skyTop, L.xr - L.xl, L.s0 - skyTop);
    // 海床以下：先畫下部地殼、再畫磁性層
    const cols = Math.min(600, Math.round(L.xr - L.xl));
    const floor = []; for (let i = 0; i <= cols; i++) { const x = -L.R + 2 * L.R * i / cols; floor.push([L.px(x), L.pz(seafloorZ(x))]); }
    g.save();
    g.beginPath(); g.moveTo(floor[0][0], floor[0][1]); floor.forEach(function (p) { g.lineTo(p[0], p[1]); });
    g.lineTo(L.xr, L.s1); g.lineTo(L.xl, L.s1); g.closePath();
    const crust = g.createLinearGradient(0, L.pz(2.6), 0, L.s1);
    crust.addColorStop(0, D.shade(C['sf-crust'], 0.05)); crust.addColorStop(1, D.shade(C['sf-crust'], -0.25));
    g.fillStyle = crust; g.fill();
    g.clip();
    // 中洋脊下方的岩漿庫
    const mx = L.px(0), mz = L.pz(3.6);
    const mg = g.createRadialGradient(mx, L.s1, 4, mx, mz, (L.s1 - L.pz(2.6)) * 1.25);
    mg.addColorStop(0, D.alpha(C['sf-magma'], 0.95)); mg.addColorStop(0.45, D.alpha(C['sf-magma'], 0.45)); mg.addColorStop(1, D.alpha(C['sf-magma'], 0));
    g.fillStyle = mg; g.fillRect(mx - 120, L.pz(2.5), 240, L.s1 - L.pz(2.5));
    // 磁性層（0.5 km）：每段依極性上色
    prof.els.forEach(function (e) {
      const x0 = L.px(e.a), x1 = L.px(e.b);
      const z0 = e.dA + state.zs, z1 = e.dB + state.zs;
      g.beginPath(); g.moveTo(x0, L.pz(z0)); g.lineTo(x1, L.pz(z1)); g.lineTo(x1, L.pz(z1 + K.LAYER)); g.lineTo(x0, L.pz(z0 + K.LAYER)); g.closePath();
      g.fillStyle = e.pol > 0 ? C['sf-n'] : e.pol < 0 ? C['sf-r'] : C['sf-old']; g.fill();
    });
    // 年表以外（較老）的海床：灰色斜線
    const r = rates(), edgeR = (K.T_MAX - state.tau) * r.uR * K.KM_PER_MA, edgeL = -(K.T_MAX - state.tau) * r.uL * K.KM_PER_MA;
    [[edgeR, L.R * 1.05], [-L.R * 1.05, edgeL]].forEach(function (q) {
      if (q[1] <= q[0]) return;
      const a = Math.max(-L.R, q[0]), b = Math.min(L.R, q[1]);
      if (b <= a) return;
      g.save();
      g.beginPath();
      for (let i = 0; i <= 40; i++) { const x = a + (b - a) * i / 40; const y = L.pz(seafloorZ(x)); if (i) g.lineTo(L.px(x), y); else g.moveTo(L.px(x), y); }
      for (let i = 40; i >= 0; i--) { const x = a + (b - a) * i / 40; g.lineTo(L.px(x), L.pz(seafloorZ(x) + K.LAYER)); }
      g.closePath(); g.fillStyle = C['sf-old']; g.fill(); g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
      for (let x = L.px(a) - 40; x < L.px(b) + 40; x += 7) { g.beginPath(); g.moveTo(x, L.pz(2.5)); g.lineTo(x + 24, L.pz(ZMAX)); g.stroke(); }
      g.restore();
    });
    // 層頂的亮線、層底的暗線（立體感）
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    g.beginPath(); floor.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1] + 0.5); else g.moveTo(p[0], p[1] + 0.5); }); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); floor.forEach(function (p, i) { const x = -L.R + 2 * L.R * i / cols, y = L.pz(seafloorZ(x) + K.LAYER); if (i) g.lineTo(p[0], y); else g.moveTo(p[0], y); }); g.stroke();
    g.restore();
    // 海床線
    g.save(); g.strokeStyle = D.shade(C['sf-crust'], -0.35); g.lineWidth = 1.6; g.lineJoin = 'round';
    g.beginPath(); floor.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); g.restore();
    // 上湧與擴張的箭頭
    const zA = 4.25, ax = Math.min(0.42 * L.R, 160);
    const k = (L.xr - L.xl) / (2 * L.R);
    if (!state.mystery || true) {
      const lenR = Math.max(14, Math.min(70, r.uR * 9)), lenL = Math.max(14, Math.min(70, r.uL * 9));
      D.arrow(g, L.px(ax) - lenR / 2, L.pz(zA), L.px(ax) + lenR / 2, L.pz(zA), '#fde68a', 2.4);
      D.arrow(g, L.px(-ax) + lenL / 2, L.pz(zA), L.px(-ax) - lenL / 2, L.pz(zA), '#fde68a', 2.4);
      if (!state.mystery) {
        mapText(g, num(r.uR, 1) + ' cm/yr', L.px(ax), L.pz(zA) - 11, '#fef3c7', 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
        mapText(g, num(r.uL, 1) + ' cm/yr', L.px(-ax), L.pz(zA) - 11, '#fef3c7', 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
      }
    }
    const t = tnow || 0, ph = reducedMotion ? 0 : (t / 900) % 1;
    for (let i = 0; i < 3; i++) {
      const u0 = (i / 3 + ph) % 1, y = L.s1 - 4 - u0 * (L.s1 - L.pz(3.3));
      g.globalAlpha = Math.sin(u0 * Math.PI) * 0.9;
      D.arrow(g, mx, y + 10, mx, y - 6, '#ffedd5', 2);
      g.globalAlpha = 1;
    }
    mapText(g, T('中洋脊', 'Ridge axis'), mx, L.pz(2.6) - 10, '#ffffff', 'center', 'bottom', '700 ' + fs + 'px ' + FONT);
    // 距離刻度
    const st = niceStep(2 * L.R, L.narrow ? 4 : 8);
    for (let x = -Math.floor(L.R / st) * st; x <= L.R + 1e-9; x += st) {
      const p = Math.round(L.px(x)) + 0.5;
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(p, L.s1 - 5); g.lineTo(p, L.s1); g.stroke();
      D.haloText(g, num(x, 0), p, L.s1 + 10, C.muted, 'center', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    }
    D.haloText(g, T('離中洋脊（km）', 'Distance from the ridge (km)'), L.xr, H - 3, C.muted, 'right', 'bottom', '600 ' + (fs - 0.5) + 'px ' + FONT);
    // 深度刻度
    [0, 2, 4].forEach(function (z) { D.haloText(g, num(z, 1), L.xl - 5, L.pz(z), C.muted, 'right', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT); });
    D.haloText(g, 'km', L.xl - 5, L.pz(1), C.muted, 'right', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    const ex = (2 * L.R / (L.xr - L.xl)) / (ZMAX / (L.s1 - L.s0));
    mapText(g, T('垂直放大約 ', 'Vertical exaggeration ≈ ×') + num(ex, 0) + T(' 倍', ''), L.xl + 6, L.s1 - 9, '#ffffff', 'left', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);

    // ---------- 船、磁力計、游標 ----------
    const cxp = L.px(state.cx), Bc = anomalyAt(state.cx);
    g.save(); g.strokeStyle = C['sf-cursor']; g.lineWidth = 1.2; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(cxp, L.a0); g.lineTo(cxp, L.a1); g.stroke(); g.restore();
    drawShip(g, cxp, L.s0, L.pz(state.zs), dragging || kbFocus);
    D.ball(g, cxp, yB(Bc), 5, C['sf-cursor'], { glow: 6 });
    tag(g, (Bc >= 0 ? '+' : '') + num(Bc, 0) + ' nT', cxp + (cxp > W - 110 ? -10 : 10), Math.max(L.a0 + 10, yB(Bc) - 14), C['sf-cursor'], cxp > W - 110 ? 'right' : 'left', '700 ' + (fs - 0.5) + 'px ' + FONT, L);
    // 時間與地磁方向
    const nowPol = K.polarity(state.tau);
    tag(g, (state.tau < 0.0005 ? T('現在', 'Present day') : maText(state.tau)) + '・' + chronName(state.tau), L.xl + 4, skyTop + 12, nowPol > 0 ? C['sf-n'] : C['sf-r'], 'left', '700 ' + fs + 'px ' + FONT, L);
    drawCompass(g, L.xr - 22, skyTop + 22, nowPol, fs, L);
  }
  /** 地圖文字：深色光暈 */
  function mapText(g, text, x, y, color, align, base, font) {
    g.save(); g.font = font; g.textAlign = align; g.textBaseline = base; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(6,14,26,0.8)'; g.lineWidth = 3.5; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y); g.restore();
  }
  /** 深底標籤；y 是框的中線 */
  function tag(g, text, x, y, color, align, font, L) {
    g.save(); g.font = font;
    const w = g.measureText(text).width + 14, h = parseFloat(/(\d+(\.\d+)?)px/.exec(font)[1]) + 9;
    let x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    x0 = Math.max(2, Math.min(L.W - w - 2, x0));
    const y0 = y - h / 2;
    D.roundRect(g, x0, y0, w, h, h / 2);
    g.fillStyle = 'rgba(8,14,24,0.82)'; g.fill();
    g.strokeStyle = D.alpha(color, 0.75); g.lineWidth = 1; g.stroke();
    g.fillStyle = D.mix(color, '#ffffff', 0.35); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x0 + 7, y0 + h / 2 + 0.5);
    g.restore();
  }
  function drawShip(g, x, ys, yf, hi) {
    // 拖纜
    g.save(); g.strokeStyle = 'rgba(30,41,59,0.75)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x - 10, ys - 2); g.quadraticCurveTo(x - 22, (ys + yf) / 2, x - 26, yf); g.stroke(); g.restore();
    // 魚形磁力計
    g.save(); g.translate(x - 26, yf);
    g.fillStyle = '#facc15'; g.strokeStyle = '#713f12'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(0, 0, 8, 3.4, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(-12, -3.5); g.lineTo(-12, 3.5); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // 船身
    g.save(); g.translate(x, ys);
    if (hi) { g.shadowColor = D.alpha(C['sf-cursor'], 0.8); g.shadowBlur = 10; }
    g.fillStyle = '#f8fafc'; g.strokeStyle = '#1e293b'; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(-16, -6); g.lineTo(16, -6); g.lineTo(11, 2); g.lineTo(-12, 2); g.closePath(); g.fill(); g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#e11d48'; g.fillRect(-4, -13, 10, 7); g.strokeRect(-4, -13, 10, 7);
    g.fillStyle = '#1e293b'; g.fillRect(-1, -19, 2, 6);
    g.restore();
    // 水面線
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - 20, ys + 0.5); g.lineTo(x + 20, ys + 0.5); g.stroke(); g.restore();
  }
  function drawCompass(g, x, y, pol, fs, L) {
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(8,14,24,0.78)'; g.beginPath(); g.arc(0, 0, 17, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.stroke();
    const up = pol >= 0 ? -1 : 1;     // 指北針的 N 極指向地理北方（正向）或南方（反向）
    g.fillStyle = '#ef4444'; g.beginPath(); g.moveTo(0, up * 12); g.lineTo(4, 0); g.lineTo(-4, 0); g.closePath(); g.fill();
    g.fillStyle = '#e2e8f0'; g.beginPath(); g.moveTo(0, -up * 12); g.lineTo(4, 0); g.lineTo(-4, 0); g.closePath(); g.fill();
    g.restore();
    tag(g, T('羅盤', 'Compass'), x, y + 30, '#e2e8f0', 'center', '600 ' + (fs - 1) + 'px ' + FONT, L);
  }

  // =====================================================================
  // 圖表
  // =====================================================================
  const GM = { l: 52, r: 18, t: 34, b: 34 };
  function plotBase(g, W, H) {
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, D.dark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.04)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  function drawChart() {
    if (!grSize) return;
    const W = grSize.w, H = grSize.h, g = gtx;
    g.clearRect(0, 0, W, H);
    plotBase(g, W, H);
    if (state.chart === 'gpts') drawGpts(g, W, H); else drawCurve(g, W, H, state.chart);
  }
  function drawGpts(g, W, H) {
    const fs = W < 520 ? 10.5 : 11.5, l = 14, r = W - 14, TM = K.T_MAX;
    const X = function (t) { return l + t / TM * (r - l); };
    const yb = Math.round(H * 0.36), hb = 34;
    // 極性條
    g.fillStyle = C['sf-r']; g.fillRect(l, yb, r - l, hb);
    K.NORMAL.forEach(function (p) { g.fillStyle = C['sf-n']; g.fillRect(X(p[0]), yb, Math.max(1, X(p[1]) - X(p[0])), hb); });
    g.strokeStyle = D.alpha(C.text, 0.4); g.lineWidth = 1; g.strokeRect(l + 0.5, yb + 0.5, r - l - 1, hb - 1);
    // 期名（下方）與亞期名（上方）
    [['brunhes', 0, 0.781], ['matuyama', 0.781, 2.581], ['gauss', 2.581, 3.596], ['gilbert', 3.596, 6.033]].forEach(function (q) {
      const N = K.NAMED.find(function (n) { return n.key === q[0]; });
      const xm = (X(q[1]) + X(q[2])) / 2;
      g.strokeStyle = D.alpha(C.text, 0.35); g.beginPath(); g.moveTo(X(q[1]) + 1, yb + hb + 5); g.lineTo(X(q[2]) - 1, yb + hb + 5); g.stroke();
      const SHORT = { brunhes: ['布容', 'Br.'], matuyama: ['松山', 'Matuyama'], gauss: ['高斯', 'Gauss'], gilbert: ['吉爾伯特', 'Gilbert'] };
      D.haloText(g, W < 520 ? T(SHORT[q[0]][0], SHORT[q[0]][1]) : T(N.zh, N.en.replace(/ (normal|reversed)$/, '')), xm, yb + hb + 16, C.text, 'center', 'middle', '600 ' + fs + 'px ' + FONT);
    });
    [['jaramillo', 1.03], ['olduvai', 1.86]].forEach(function (q, i) {
      const N = K.NAMED.find(function (n) { return n.key === q[0]; });
      // 窄螢幕兩個亞期名上下錯開，以免疊在一起
      const yy = W < 520 && i === 0 ? yb - 21 : yb - 7;
      g.save(); g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1; g.beginPath(); g.moveTo(X(q[1]), yy + 1); g.lineTo(X(q[1]), yb); g.stroke(); g.restore();
      D.haloText(g, T(N.zh, N.en), X(q[1]), yy, C.muted, 'center', 'bottom', '500 ' + (fs - 0.5) + 'px ' + FONT);
    });
    // 時間軸
    for (let t = 0; t <= 8; t += 1) {
      const p = Math.round(X(t)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.3); g.beginPath(); g.moveTo(p, yb + hb + 24); g.lineTo(p, yb + hb + 28); g.stroke();
      D.haloText(g, String(t), p, yb + hb + 37, C.muted, 'center', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    }
    D.haloText(g, T('百萬年前（Ma）', 'Million years ago (Ma)'), r, H - 4, C.muted, 'right', 'bottom', '600 ' + (fs - 0.5) + 'px ' + FONT);
    // 現在（播放時間）與船下方地殼的年齡
    const xt = X(Math.min(TM, state.tau));
    g.save(); g.strokeStyle = C.text; g.lineWidth = 2; g.beginPath(); g.moveTo(xt, yb - 22); g.lineTo(xt, yb + hb + 3); g.stroke(); g.restore();
    D.haloText(g, T('中洋脊正在形成', 'Forming at the ridge'), Math.min(r, Math.max(l, xt)), yb - (W < 520 ? 38 : 26), C.text, xt > W * 0.7 ? 'right' : 'left', 'bottom', '600 ' + fs + 'px ' + FONT);
    if (!state.mystery) {
      const c = crustAt(state.cx);
      if (c.inRecord) {
        const xc = X(c.born);
        g.save(); g.strokeStyle = C['sf-cursor']; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(xc, yb - 4); g.lineTo(xc, yb + hb + 22); g.stroke(); g.restore();
        D.ball(g, xc, yb + hb / 2, 4.5, C['sf-cursor'], { glow: 5 });
      }
    }
  }
  function drawCurve(g, W, H, kind) {
    const fs = W < 520 ? 10.5 : 11.5, isD = kind === 'depth';
    const r = rates(), tmax = Math.min(8, range() / (Math.max(r.uL, r.uR) * K.KM_PER_MA));
    const t1 = Math.max(1, Math.ceil(tmax));
    const X = function (t) { return GM.l + t / t1 * (W - GM.l - GM.r); };
    const y0v = isD ? 2500 : 0, y1v = isD ? Math.ceil((K.depth(t1) + 100) / 250) * 250 : 1000;
    const Y = isD ? function (v) { return GM.t + (v - y0v) / (y1v - y0v) * (H - GM.t - GM.b); }   // 深度往下
      : function (v) { return H - GM.b - (v - y0v) / (y1v - y0v) * (H - GM.t - GM.b); };
    const col = isD ? C['sf-depth'] : C['sf-heat'];
    // 格線
    const ys = isD ? 250 : 200;
    for (let v = y0v; v <= y1v + 1e-9; v += ys) {
      const p = Math.round(Y(v)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.07); g.lineWidth = 1; g.beginPath(); g.moveTo(GM.l, p); g.lineTo(W - GM.r, p); g.stroke();
      D.haloText(g, num(v, 0), GM.l - 5, p, col, 'right', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    }
    for (let t = 0; t <= t1; t += 1) {
      const p = Math.round(X(t)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.07); g.beginPath(); g.moveTo(p, GM.t); g.lineTo(p, H - GM.b); g.stroke();
      D.haloText(g, String(t), p, H - GM.b + 12, C.muted, 'center', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    }
    D.haloText(g, T('地殼年齡（Ma）', 'Age of the crust (Myr)'), W - GM.r, H - 4, C.muted, 'right', 'bottom', '600 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, isD ? T('水深（m，往下越深）', 'Water depth (m, deeper downward)') : T('熱流（mW/m²）', 'Heat flow (mW/m²)'), GM.l, GM.t - 14, col, 'left', 'middle', '600 ' + fs + 'px ' + FONT);
    const pts = [];
    for (let i = 0; i <= 300; i++) {
      const t = t1 * i / 300;
      if (!isD && t < 0.26) continue;
      pts.push([X(t), Y(isD ? K.depth(t) : K.heatFlow(t))]);
    }
    g.save(); g.strokeStyle = D.alpha(col, 0.25); g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke();
    g.strokeStyle = col; g.lineWidth = 2.2; g.stroke(); g.restore();
    if (!state.mystery) {
      const c = crustAt(state.cx);
      if (c.age <= t1) {
        const v = isD ? K.depth(c.age) : K.heatFlow(c.age);
        if (isD || c.age >= 0.26) {
          D.ball(g, X(c.age), Y(v), 5, C['sf-cursor'], { glow: 6 });
          const low = Y(v) < GM.t + 24;   // 太靠上緣（例如中洋脊上的水深），標籤放到點的下方
          D.haloText(g, num(v, 0) + (isD ? ' m' : ' mW/m²'), X(c.age) + 9, Y(v) + (low ? 9 : -9), C['sf-cursor'], 'left', low ? 'top' : 'bottom', '700 ' + fs + 'px ' + FONT);
        }
      }
    }
  }
  function chartAria() {
    return state.chart === 'gpts' ? T('地磁極性年表：0 到 8.1 Ma 的正向期與反向期', 'Geomagnetic polarity timescale: normal and reversed periods from 0 to 8.1 Ma')
      : state.chart === 'depth' ? T('海底深度隨地殼年齡變深', 'Seafloor depth against the age of the crust') : T('熱流隨地殼年齡減少', 'Heat flow against the age of the crust');
  }

  // =====================================================================
  // 讀數、事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').textContent = s; }
  function snapshot() {
    const r = rates(), c = crustAt(state.cx), s = stats(), bm = bmDist();
    return { uL: r.uL, uR: r.uR, sym: state.sym, zs: state.zs, tau: state.tau, playing: state.running, mystery: !!state.mystery, dragging: dragging,
      cx: state.cx, cAge: c.age, cBorn: c.born, cPol: c.pol, cIn: c.inRecord, cDepth: K.depth(c.age), cHeat: K.heatFlow(c.age), cB: anomalyAt(state.cx),
      bmL: bm[0], bmR: bm[1], Bmax: s.Bmax, ja: s.ja, cobb: s.cobb, R: range() };
  }
  let lastEmit = 0;
  function emitState(force) {
    const t = performance.now();
    if (force || t - lastEmit > 250) { lastEmit = t; emit('state', snapshot()); }
  }
  function refreshOutputs() {
    if (state.mystery) { setOut(el.uR, '?'); setOut(el.uL, '?'); }
    else { setOut(el.uR, outNum(state.uR, 1, 2)); setOut(el.uL, outNum(state.uL, 1, 2)); }
    setOut(el.zs, outNum(state.zs, 2, 2));
    setOut(el.tau, outNum(state.tau, 3, 3));
  }
  function updateReadouts() {
    const r = rates(), c = crustAt(state.cx), s = stats(), bm = bmDist(), hide = !!state.mystery, Q = '？';
    setHTML('rX', num(Math.abs(state.cx), 1) + ' km' + (Math.abs(state.cx) < 0.05 ? '' : state.cx > 0 ? T('（右邊）', ' (right)') : T('（左邊）', ' (left)')));
    const B = anomalyAt(state.cx);
    setHTML('rB', (B >= 0 ? '+' : '') + num(B, 0) + ' nT');
    setHTML('rPol', polHTML(c.inRecord ? c.pol : 0, !hide && c.inRecord, c.born));
    setHTML('rAge', hide ? Q : num(c.age, 3) + ' Ma' + (state.tau > 0.0005 && c.inRecord ? T('（形成於 ', ' (formed ') + num(c.born, 3) + T(' Ma 前）', ' Myr ago)') : ''));
    setHTML('rDepth', hide ? Q : num(K.depth(c.age), 0) + ' m');
    setHTML('rHeat', hide ? Q : c.age < 0.05 ? T('非常高（中洋脊上）', 'very high (on the ridge)') : num(K.heatFlow(c.age), 0) + ' mW/m²');
    setHTML('rBM', hide ? Q : state.tau >= 0.781 ? T('還沒形成', 'not formed yet') : T('左 ', 'left ') + num(bm[0], 1) + T(' km、右 ', ' km, right ') + num(bm[1], 1) + ' km');
    setHTML('rFull', hide ? Q : num(r.uL + r.uR, 2) + ' cm/yr' + T('（每年張開 ', ' (opens ') + num((r.uL + r.uR) * 10, 1) + T(' mm）', ' mm a year)'));
    setHTML('rMax', '+' + num(s.Bmax, 0) + ' nT');
    setHTML('rJa', hide ? Q : state.tau >= 1.072 ? T('還沒形成', 'not formed yet') : s.ja ? T('看得出一個獨立的峰', 'shows as a separate peak') : T('看不出來（和旁邊的訊號糊在一起）', 'not resolved (blurred into its neighbours)'));
    setHTML('rateHint', hide ? T('神秘海脊進行中：速率藏起來了。', 'Mystery ridge: the rate is hidden.')
      : T('全擴張速率 <b>' + num(r.uL + r.uR, 2) + '</b> cm/yr；1 cm/yr = 10 km／百萬年。', 'Full spreading rate <b>' + num(r.uL + r.uR, 2) + '</b> cm/yr; 1 cm/yr = 10 km per million years.'));
    const gap = K.depth(Math.abs(state.cx) / ((state.cx < 0 ? r.uL : r.uR) * K.KM_PER_MA)) / 1000 - state.zs;
    setHTML('zsHint', state.zs < 0.01 ? T('在海面：離磁性層約 <b>' + num(gap, 1) + '</b> km，窄的條帶會糊在一起。', 'At the surface: about <b>' + num(gap, 1) + '</b> km above the magnetised layer, so narrow stripes blur together.')
      : T('船下方離海床約 <b>' + num(gap * 1000, 0) + '</b> m（深拖）：離得越近，磁異常越大越尖銳。', 'About <b>' + num(gap * 1000, 0) + '</b> m above the seafloor under the ship (deep tow): the closer, the larger and sharper the anomaly.'));
    setHTML('chartHint', state.chart === 'gpts'
      ? T('橘色是正向期、藍色是反向期。黑線是中洋脊此刻正在形成的地殼；紫色虛線是船下方地殼形成的時間。', 'Orange = normal, blue = reversed. The black line is the crust forming at the ridge right now; the dashed purple line is when the crust under the ship formed.')
      : state.chart === 'depth' ? T('離中洋脊越遠，地殼越老、越冷、越重，海床就越深：深度和年齡的平方根成正比地增加。', 'The older the crust, the colder and denser it is and the deeper the seafloor: depth grows with the square root of age.')
        : T('剛形成的地殼最熱，熱流很大；之後和年齡的平方根成反比地減少。', 'New crust is hottest; heat flow then falls as one over the square root of age.'));
  }
  let lastSay = 0;
  function sayNow(force) {
    const B = anomalyAt(state.cx);
    const txt = T('離中洋脊 ', 'Distance ') + num(Math.abs(state.cx), 0) + T(' km，磁異常 ', ' km, anomaly ') + num(B, 0) + ' nT';
    const t = performance.now();
    if (force || t - lastSay > 3000) { $('srNow').textContent = txt; lastSay = t; }
  }
  function updatePlay() { $('play').textContent = state.running ? T('暫停', 'Pause') : state.tau < 0.0005 && state.fullRun === 'done' ? T('再播一次', 'Play again') : T('播放', 'Play'); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function refreshAll() { recompute(); refreshOutputs(); updateReadouts(); requestDraw(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  function syncSym() {
    $('uLWrap').hidden = state.sym;
    if (state.sym && window.LabNum) { window.LabNum.set(el.uL, state.uR); }
  }
  ['uR', 'uL', 'zs'].forEach(function (k) {
    el[k].addEventListener('input', function () {
      acted(); readSliders(); if (k === 'uR' && state.sym && window.LabNum) window.LabNum.set(el.uL, state.uR);
      refreshAll(); emitState();
    });
    el[k].addEventListener('change', function () { readSliders(); refreshAll(); emitState(true); });
  });
  el.tau.addEventListener('input', function () {
    if (internalTau) return;
    acted(); state.running = false; state.fullRun = false; updatePlay();
    readSliders(); refreshAll(); emitState();
  });
  el.tau.addEventListener('change', function () { if (internalTau) return; readSliders(); refreshAll(); emitState(true); });
  $('sym').addEventListener('change', function () {
    acted(); state.sym = $('sym').checked; syncSym(); readSliders(); refreshAll(); emitState(true);
  });
  document.querySelectorAll('#rateCard .presets button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.mystery) return;
      acted();
      const u = +b.getAttribute('data-u');
      $('sym').checked = true; state.sym = true; syncSym();
      if (window.LabNum) { window.LabNum.set(el.uR, u); window.LabNum.set(el.uL, u); }
      readSliders(); refreshAll(); emitState(true);
      setStatus(T('半擴張速率 ', 'Half-rate ') + num(u, 1) + T(' cm/yr（約略值）。', ' cm/yr (approximate).'));
    });
  });
  document.querySelectorAll('#speedSeg button').forEach(function (b) {
    b.addEventListener('click', function () { state.speed = +b.getAttribute('data-speed'); setSeg('speedSeg', 'data-speed', state.speed); });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.chart = b.getAttribute('data-chart'); setSeg('chartSeg', 'data-chart', state.chart);
      gr.setAttribute('aria-label', chartAria()); updateReadouts(); requestDraw();
      emit('chart', { chart: state.chart });
    });
  });
  // 程式自己移動時間滑桿（播放、重來）時，LabNum.set 也會送出 input／change：用旗標略過，免得把播放停掉
  let internalTau = false;
  function setTau(t) { internalTau = true; if (window.LabNum) window.LabNum.set(el.tau, Math.round(t * 1000) / 1000); else el.tau.value = t; internalTau = false; state.tau = t; }
  $('play').addEventListener('click', function () {
    acted();
    if (state.running) { state.running = false; updatePlay(); setStatus(T('暫停在 ', 'Paused at ') + maText(state.tau) + '（' + chronName(state.tau) + '）。'); emitState(true); requestDraw(); return; }
    if (state.tau < 0.0005) { setTau(T_START); state.fullRun = true; }
    else if (state.tau >= T_START - 0.1) state.fullRun = true;
    state.running = true; updatePlay();
    setStatus(T('時間往現在走：每秒 ', 'Time runs toward the present: ') + (state.speed * 100) + T(' 萬年。', ' × 10 000 years per second.'));
    recompute(); requestDraw();
  });
  $('restart').addEventListener('click', function () {
    acted();
    state.running = false; state.fullRun = false;
    setTau(T_START); state.cx = 0;
    refreshAll(); updatePlay(); emitState(true);
    setStatus(T('回到 800 萬年前：中洋脊兩邊還沒有這段時間的海床。按「播放」。', 'Back 8 million years: none of this seafloor exists yet. Press “Play”.'));
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 神秘海脊 ----------
  function setMysteryUI(on) {
    [el.uR, el.uL, $('sym')].forEach(function (e) { e.disabled = on; });
    document.querySelectorAll('#rateCard .presets button').forEach(function (b) { b.disabled = on; });
    $('guess').disabled = !on; $('guessBtn').disabled = !on; $('revealBtn').disabled = !on;
  }
  $('mysteryBtn').addEventListener('click', function () {
    acted();
    const u = Math.round((1 + Math.random() * 7) * 100) / 100;
    state.mystery = { u: u, done: false };
    state.running = false; setTau(0); state.cx = 0;
    setMysteryUI(true);
    $('guess').value = '';
    setHTML('guessMsg', T('新的神秘海脊（半擴張速率在 1–8 cm/yr 之間，兩邊一樣快）。剖面固定畫 ±400 km。', 'A new mystery ridge (half-rate between 1 and 8 cm/yr, symmetric). The section always shows ±400 km.'));
    refreshAll(); updatePlay(); emitState(true);
  });
  function endMystery(msg) {
    const u = state.mystery.u;
    state.mystery = null;
    setMysteryUI(false);
    $('sym').checked = true; state.sym = true; syncSym();
    if (window.LabNum) { window.LabNum.set(el.uR, u); window.LabNum.set(el.uL, u); }
    readSliders(); refreshAll(); emitState(true);
    setHTML('guessMsg', msg);
  }
  $('revealBtn').addEventListener('click', function () {
    if (!state.mystery) return;
    endMystery(T('答案：半擴張速率 <b>' + num(state.mystery.u, 2) + '</b> cm/yr。', 'Answer: half-rate <b>' + num(state.mystery.u, 2) + '</b> cm/yr.'));
  });
  function checkGuess() {
    if (!state.mystery) return;
    const g = parseFloat(String($('guess').value).replace(',', '.'));
    if (!(g > 0)) { setHTML('guessMsg', T('請輸入一個正的數字（cm/yr）。', 'Enter a positive number (cm/yr).')); return; }
    acted();
    const u = state.mystery.u, err = Math.abs(g - u) / u;
    emit('guess', { u: u, g: g, err: err });
    const S = sound();
    if (err <= 0.05) {
      if (S) { S.tone({ freq: 660, dur: 0.12, gain: 0.16 }); setTimeout(function () { S.tone({ freq: 990, dur: 0.2, gain: 0.14 }); }, 120); }
      endMystery(T('答對了！答案 <b>' + num(u, 2) + '</b> cm/yr，你差 ' + num(err * 100, 1) + '%。', 'Correct! The answer is <b>' + num(u, 2) + '</b> cm/yr; you were ' + num(err * 100, 1) + '% off.'));
    } else {
      if (S) S.tone({ freq: 330, dur: 0.18, gain: 0.14 });
      setHTML('guessMsg', T('還差一點：' + (g > u ? '猜得太大' : '猜得太小') + '（差超過 5%）。再量量看！', 'Not yet: ' + (g > u ? 'too high' : 'too low') + ' (more than 5% off). Measure again!'));
    }
  }
  $('guessBtn').addEventListener('click', checkGuess);
  $('guess').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); checkGuess(); } });

  // ---------- 拖曳船 ----------
  let dragging = false, kbFocus = false;
  function evX(ev) { const r = cv.getBoundingClientRect(); return ev.clientX - r.left; }
  function moveShip(x) { const R = range(); state.cx = Math.max(-R, Math.min(R, x)); }
  cv.addEventListener('pointerdown', function (ev) {
    if (view3 && view3.active) return;
    acted(); dragging = true; cv.setPointerCapture(ev.pointerId);
    moveShip(lay().xOf(evX(ev))); updateReadouts(); requestDraw(); emitState();
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!dragging) return;
    moveShip(lay().xOf(evX(ev))); updateReadouts(); sayNow(); requestDraw(); emitState();
  });
  function endDrag() { if (!dragging) return; dragging = false; updateReadouts(); sayNow(true); requestDraw(); emitState(true); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('海底擴張剖面。左右方向鍵移動船（Shift 走大步）。', 'Seafloor spreading section. Left and right arrows move the ship (Shift for bigger steps).'),
      items: [{
        name: function () { return T('船', 'Ship'); },
        move: function (dx, dy, big) {
          const d = dx || dy; if (!d) return false;
          acted(); kbFocus = true;
          const R = range();
          moveShip(state.cx + d * (big ? R / 10 : R / 200));
          updateReadouts(); requestDraw(); emitState(true); return true;
        },
        describe: function () { const B = anomalyAt(state.cx); return T('離中洋脊 ', 'Distance ') + num(state.cx, 1) + T(' km，磁異常 ', ' km, anomaly ') + num(B, 0) + ' nT'; }
      }],
      onChange: function () { requestDraw(); }
    });
    cv.addEventListener('blur', function () { kbFocus = false; requestDraw(); });
  }

  // ---------- 分享 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { ch: state.chart, x: Math.round(state.cx * 10) / 10, sym: state.sym ? 1 : 0 }; },
    set: function (o) {
      if (!o) return;
      if (o.sym === 0 || o.sym === 1) { state.sym = !!o.sym; $('sym').checked = state.sym; syncSym(); }
      readSliders(); recompute(true);
      if (isFinite(+o.x)) moveShip(+o.x);
      if (['gpts', 'depth', 'heat'].indexOf(o.ch) >= 0) { state.chart = o.ch; setSeg('chartSeg', 'data-chart', o.ch); gr.setAttribute('aria-label', chartAria()); }
      refreshAll();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0, lastRead = 0, lastPol = null;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    const dt = lastFrame ? Math.min(1 / 20, (tnow - lastFrame) / 1000) : 0;
    lastFrame = tnow;
    if (state.running && dt > 0 && !document.hidden) {
      const nt = Math.max(0, state.tau - dt * state.speed);
      setTau(nt);
      setOut(el.tau, outNum(nt, 3, 3));   // 滑桿旁的數字每一幀都跟上
      recompute();
      const pol = K.polarity(nt);
      if (lastPol != null && pol !== lastPol) {
        const S = sound(); if (S) S.tone({ freq: pol > 0 ? 660 : 440, dur: 0.12, gain: 0.12 });
      }
      lastPol = pol;
      if (nt <= 0) {
        state.running = false;
        const full = state.fullRun === true;
        state.fullRun = full ? 'done' : false;
        updatePlay();
        setStatus(T('到了現在：中洋脊兩邊各留下 800 萬年的磁條帶，左右互為鏡像。', 'The present: 8 million years of magnetic stripes on each side, mirror images of each other.'));
        if (full) { const r = rates(); emit('tape', { uL: r.uL, uR: r.uR }); }
        emitState(true);
      } else if (tnow - lastRead > 150) { lastRead = tnow; refreshOutputs(); updateReadouts(); emitState(); }
    } else lastPol = K.polarity(state.tau);
    if (view3 && view3.active) view3.frame(tnow); else drawMain(tnow);
    drawChart();
    if (state.running || (view3 && view3.active && view3.busy()) || (!reducedMotion && !(view3 && view3.active) && !document.hidden && animate2d)) raf = requestAnimationFrame(loop);
    else { lastFrame = 0; refreshOutputs(); updateReadouts(); }
  }
  // 上湧箭頭的動畫：只在畫面可見時慢慢跑（每秒約 30 幀以內的負擔很小；reduced-motion 時不跑）
  let animate2d = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { animate2d = es[0].isIntersecting; if (animate2d) requestDraw(); }).observe(cv);
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 seafloor-spreading-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, prof: function () { return { xs: xs, B: prof.B, els: prof.els }; }, range: range, rates: rates, seafloorZ: seafloorZ,
    maText: maText, chronName: chronName, anomalyAt: anomalyAt,
    request: function () { requestDraw(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 剖面。', 'The 3D graphics context was lost, so the view switched back to the 2D section.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Seafloor3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Seafloor3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/seafloor-spreading-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Seafloor3D) throw new Error('seafloor-spreading-3d.js did not load');
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
    $('camBar').hidden = !is3;
    stage.classList.toggle('is3d', is3);
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D…', 'Loading 3D…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.Seafloor3D.create(lib, host3, bridge);
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
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewNotes();
      resizeCv();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 剖面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D section is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Tilt', 'Top', 'Front'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncSym();
  readSliders();
  updatePlay();
  updateSoundButton();
  gr.setAttribute('aria-label', chartAria());
  function themeChanged() {
    readColors();
    updatePlay(); updateSoundButton(); updateReadouts();
    gr.setAttribute('aria-label', chartAria());
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  recompute(true);
  refreshOutputs();
  updateReadouts();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('現在的中洋脊：兩邊是 800 萬年來留下的磁條帶。按「播放」從頭看它們怎麼形成。', 'Today’s ridge, with 8 million years of magnetic stripes on each side. Press “Play” to watch them form.'));
  requestDraw();
  // 測試用（Playwright）
  window.__sf = { state: state, K: K, snapshot: snapshot, setView: setView, prof: function () { return prof; },
    ship: function (x) { moveShip(x); updateReadouts(); requestDraw(); emitState(true); },
    finish: function () { setTau(0.0001); requestDraw(); } };
})();
