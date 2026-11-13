/* fronts.js — 「冷鋒、暖鋒與梅雨鋒面」的畫面與互動
 * 物理計算全部在 fronts-core.js。 */
(function () {
  'use strict';
  const FC = window.FrontCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const LAT = 25;                 // 臺灣
  const RUN_SEC = 14;             // 一次通過大約播 14 秒
  const Z_VIEW = 11000;

  const DEF = {
    cold: { Tw: 25, Tdw: 20, Tc: 15, Tdc: 9, N: 80, U: 36, V: 10 },
    warm: { Tw: 20, Tdw: 15, Tc: 8, Tdc: 2, N: 150, U: 30, V: 6 },
    stat: { Tw: 28, Tdw: 25, Tc: 24, Tdc: 18, N: 100, U: 5, V: 12 }
  };
  const PRESETS = {
    cold: [
      { id: 'def', zh: '典型的冷鋒', en: 'Typical cold front', p: DEF.cold },
      { id: 'surge', zh: '寒流南下', en: 'Winter cold surge', p: { Tw: 22, Tdw: 17, Tc: 6, Tdc: -4, N: 60, U: 45, V: 14 } },
      { id: 'dry', zh: '乾冷鋒', en: 'Dry cold front', p: { Tw: 24, Tdw: 8, Tc: 16, Tdc: 2, N: 90, U: 30, V: 8 } }
    ],
    warm: [
      { id: 'def', zh: '典型的暖鋒', en: 'Typical warm front', p: DEF.warm },
      { id: 'humid', zh: '潮溼的暖鋒', en: 'Moist warm front', p: { Tw: 22, Tdw: 20, Tc: 10, Tdc: 5, N: 200, U: 20, V: 8 } }
    ],
    stat: [
      { id: 'def', zh: '梅雨鋒面', en: 'Plum rain front', p: DEF.stat },
      { id: 'jet', zh: '西南氣流增強', en: 'Strong south-westerly jet', p: { Tw: 29, Tdw: 26, Tc: 25, Tdc: 19, N: 100, U: 1, V: 18 } },
      { id: 'south', zh: '鋒面南移', en: 'Front moving south', p: { Tw: 28, Tdw: 24, Tc: 23, Tdc: 16, N: 100, U: 15, V: 10 } }
    ]
  };
  const KIND = {
    cb: { zh: '積雨雲', en: 'cumulonimbus' }, ns: { zh: '雨層雲', en: 'nimbostratus' },
    as: { zh: '高層雲', en: 'altostratus' }, cs: { zh: '卷層雲、卷雲', en: 'cirrostratus, cirrus' }
  };

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { tw: $('tw'), tdw: $('tdw'), tc: $('tc'), tdc: $('tdc'), slope: $('slope'), u: $('u'), v: $('v') };
  const state = {
    mode: 'cold', P: { cold: Object.assign({}, DEF.cold), warm: Object.assign({}, DEF.warm), stat: Object.assign({}, DEF.stat) },
    preset: { cold: 'def', warm: 'def', stat: 'def' }, chart: 'a',
    run: null, acted: false, anim: 0
  };
  let quiet = 0;
  function setSlider(inp, v) { quiet++; try { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; } finally { quiet--; } }
  const P = function () { return state.P[state.mode]; };

  // ---------- 物理（設定改變才重算） ----------
  let cache = null;
  function model() {
    const p = P(), key = state.mode + '|' + [p.Tw, p.Tdw, p.Tc, p.Tdc, p.N, p.U, p.V].join('|');
    if (cache && cache.key === key) return cache;
    const f = FC.make({ type: state.mode, Tw: p.Tw, Tdw: p.Tdw, Tc: p.Tc, Tdc: p.Tdc, slope: 1 / p.N, U: p.U, V: p.V });
    const ps = FC.pass(f), cum = [0], snowCum = [0];
    for (let i = 1; i < ps.rec.length; i++) {
      const d = (ps.rec[i - 1].rain + ps.rec[i].rain) / 2 * (ps.rec[i].t - ps.rec[i - 1].t);
      cum.push(cum[i - 1] + d); snowCum.push(snowCum[i - 1] + (ps.rec[i].T <= 0 && ps.rec[i - 1].T <= 0 ? d : 0));   // 和 pass() 的 snow 同一個算法
    }
    const reach = Math.max(f.sCloud || 0, f.sRain || 0, 200);
    const wkm = Math.max(360, Math.min(2200, reach * 1.25));
    cache = { key: key, f: f, ps: ps, cum: cum, snowCum: snowCum, wkm: wkm, dir: FC.TYPES[state.mode].dir };
    return cache;
  }
  /** 時刻 t（h）時測站的 s 與鋒面線的位置 X（km，測站在 X = 0） */
  function sAt(t) { const m = model(); return m.ps.s0 + m.dir * P().U * t; }
  function frontX(t) { const s = sAt(t); return state.mode === 'warm' ? -s : s; }
  /** 剖面上 X 處的 s */
  function sOfX(X, Xf) { return state.mode === 'warm' ? X - Xf : Xf - X; }
  function tNow() { return state.run ? state.run.t : 0; }
  /** 到時刻 t 為止，任意連續 H 小時的最大雨量（只看已經記下的紀錄） */
  function winMax(t, H) {
    const m = model(), rec = m.ps.rec, cum = m.cum; let best = 0, j = 0;
    for (let i = 0; i < rec.length && rec[i].t <= t + 1e-9; i++) { while (rec[i].t - rec[j].t > H + 1e-9) j++; if (cum[i] - cum[j] > best) best = cum[i] - cum[j]; }
    return best;
  }
  /** 中央氣象署的雨量分級 */
  function rainClass(m1, m3, m24) {
    if (m24 >= 500) return T('超大豪雨', 'extremely torrential rain');
    if (m24 >= 350) return T('大豪雨', 'torrential rain');
    if (m24 >= 200 || m3 >= 100) return T('豪雨', 'extremely heavy rain');
    if (m24 >= 80 || m1 >= 40) return T('大雨', 'heavy rain');
    return T('未達大雨', 'below heavy rain');
  }
  function snowAt(t) { const m = model(), i = Math.min(m.snowCum.length - 1, Math.max(0, Math.floor(t / (m.ps.rec.length > 1 ? m.ps.rec[1].t : 0.02)))); return m.snowCum[i]; }
  function cumAt(t) { const m = model(), dt = m.ps.rec.length > 1 ? m.ps.rec[1].t : 0.02, i = Math.min(m.cum.length - 1, Math.floor(t / dt)), u = Math.min(1, t / dt - i); return i + 1 < m.cum.length ? m.cum[i] + (m.cum[i + 1] - m.cum[i]) * u : m.cum[i]; }

  // ---------- 文字 ----------
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function degC(v, d) { return num(v, d == null ? 1 : d) + ' °C'; }
  function hrs(h) { return h == null ? '—' : h < 1 ? num(h * 60, 0) + T(' 分鐘', ' min') : num(h, h < 10 ? 1 : 0) + T(' 小時', ' h'); }
  const DIRS = [['北', 'N'], ['東北', 'NE'], ['東', 'E'], ['東南', 'SE'], ['南', 'S'], ['西南', 'SW'], ['西', 'W'], ['西北', 'NW']];
  function windName(b) { const d = DIRS[Math.round(((b % 360) + 360) % 360 / 45) % 8]; return T(d[0] + '風', d[1] + ' wind'); }
  function kindName(k) { return k ? T(KIND[k].zh, KIND[k].en) : T('晴', 'clear'); }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(msg) { setHTML('status', msg); }
  function nice(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e; }
  function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface',
      '--fr-sky0', '--fr-sky1', '--fr-ground0', '--fr-ground1', '--fr-cold', '--fr-warm', '--fr-surf', '--fr-cloud', '--fr-ns', '--fr-cb', '--fr-rain', '--fr-press', '--fr-td', '--fr-mark', '--fr-map']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    D.refresh();
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
    return { w: w, h: h };
  }
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); requestDraw(); }
  function tag(g, text, x, y, color, align, font) {
    g.font = font || '700 12px ' + FONT;
    const w = g.measureText(text).width + 14, h = 22;
    let bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const cw = g.canvas.clientWidth || 1e4; bx = Math.max(4, Math.min(cw - 4 - w, bx));
    D.roundRect(g, bx, y - h / 2, w, h, 11);
    g.fillStyle = D.dark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)'; g.fill();
    g.strokeStyle = D.alpha(color, 0.8); g.lineWidth = 1.2; g.stroke();
    g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, bx + 7, y + 0.5);
    return { x: bx, w: w };
  }
  function txt(g, s, x, y, color, align, font) { D.haloText(g, s, x, y, color, align || 'center', 'middle', font || '600 11px ' + FONT); }
  function plain(g, s, x, y, color, align, font) { g.font = font || '600 11px ' + FONT; g.fillStyle = color; g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
  // 柔邊雲團（預先畫好重複用）
  const blobs = new Map();
  function blobAt(g, x, y, rx, ry, color, a) {
    let b = blobs.get(color);
    if (!b) {
      b = document.createElement('canvas'); b.width = b.height = 64;
      const c = b.getContext('2d'), gr2 = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr2.addColorStop(0, D.alpha(color, 1)); gr2.addColorStop(0.55, D.alpha(color, 0.8)); gr2.addColorStop(1, D.alpha(color, 0));
      c.fillStyle = gr2; c.fillRect(0, 0, 64, 64);
      if (blobs.size > 40) blobs.clear();
      blobs.set(color, b);
    }
    g.globalAlpha = a; g.drawImage(b, x - rx, y - ry, 2 * rx, 2 * ry); g.globalAlpha = 1;
  }

  // 剖面的座標
  function layout(W, H) {
    const narrow = W < 560, mapH = narrow ? 64 : 70, x0 = narrow ? 30 : 40, x1 = W - 10, yTop = mapH + 18, yg = H - 34;
    const m = model(), Xmin = -0.75 * m.wkm, Xmax = 0.25 * m.wkm;
    return {
      narrow: narrow, mapH: mapH, x0: x0, x1: x1, yTop: yTop, yg: yg, Xmin: Xmin, Xmax: Xmax,
      px: function (X) { return x0 + (X - Xmin) / (Xmax - Xmin) * (x1 - x0); },
      Xof: function (x) { return Xmin + (x - x0) / (x1 - x0) * (Xmax - Xmin); },
      pz: function (z) { return yg - z / Z_VIEW * (yg - yTop); }
    };
  }
  /** 地圖上的方向：+x、往上 各是哪個方位 */
  function mapAxes() { return state.mode === 'stat' ? { xb: 180, ub: 90 } : { xb: 90, ub: 0 }; }
  function bearingVec(b) { const a = mapAxes(), r = Math.PI / 180; return { x: Math.cos((b - a.xb) * r), y: -Math.cos((b - a.ub) * r) }; }

  // ---------- 上方的天氣圖小條 ----------
  function drawMap(g, L, Xf) {
    const W = cvSize.w, y0 = 6, y1 = L.mapH, xF = L.px(Xf), cold = state.mode === 'warm' ? 1 : -1;   // 冷空氣在鋒面線的哪一邊（−1 左、+1 右）
    D.roundRect(g, 6, y0, W - 12, y1 - y0, 8); g.fillStyle = C['fr-map']; g.fill();
    g.save(); D.roundRect(g, 6, y0, W - 12, y1 - y0, 8); g.clip();
    // 兩邊的氣團
    const xa = Math.max(6, Math.min(W - 6, xF));
    g.fillStyle = D.alpha(C['fr-cold'], 0.14); if (cold < 0) g.fillRect(6, y0, xa - 6, y1 - y0); else g.fillRect(xa, y0, W - 6 - xa, y1 - y0);
    g.fillStyle = D.alpha(C['fr-warm'], 0.12); if (cold < 0) g.fillRect(xa, y0, W - 6 - xa, y1 - y0); else g.fillRect(6, y0, xa - 6, y1 - y0);
    // 等壓線（示意，鋒面在氣壓槽上，等壓線在鋒面轉折）
    g.strokeStyle = D.alpha(C.muted, 0.35); g.lineWidth = 1;
    for (let k = 0; k < 4; k++) { const yy = y0 + 10 + k * (y1 - y0 - 16) / 3; g.beginPath(); g.moveTo(6, yy - 8 * cold); g.lineTo(xF, yy); g.lineTo(W - 6, yy - 8 * cold); g.stroke(); }
    // 風
    const arrow = function (x, y, b, col) { const v = bearingVec(b + 180), L2 = 16; D.arrow(g, x - v.x * L2 / 2, y - v.y * L2 / 2, x + v.x * L2 / 2, y + v.y * L2 / 2, col, 1.8); };
    const ty = FC.TYPES[state.mode], ym = (y0 + y1) / 2 + 6;
    for (let k = 0; k < 3; k++) {
      const xc = xF + cold * (40 + k * 70), xw = xF - cold * (40 + k * 70);
      if (xc > 14 && xc < W - 14) arrow(xc, ym, ty.windC, C['fr-cold']);
      if (xw > 14 && xw < W - 14) arrow(xw, ym, ty.windW, C['fr-warm']);
    }
    // 鋒面線與符號
    g.lineWidth = 3;
    const n = Math.max(3, Math.floor((y1 - y0) / 16));
    const segH = (y1 - y0) / n;
    for (let k = 0; k < n; k++) {
      const ya = y0 + k * segH, yb = ya + segH, yc = (ya + yb) / 2;
      let col, sym;
      if (state.mode === 'cold') { col = C['fr-cold']; sym = 'tri'; }
      else if (state.mode === 'warm') { col = C['fr-warm']; sym = 'semi'; }
      else { col = k % 2 ? C['fr-warm'] : C['fr-cold']; sym = k % 2 ? 'semi' : 'tri'; }
      g.strokeStyle = col; g.beginPath(); g.moveTo(xF, ya); g.lineTo(xF, yb); g.stroke();
      g.fillStyle = col; g.beginPath();
      if (sym === 'tri') { const d = state.mode === 'stat' ? 1 : 1; g.moveTo(xF, yc - 6); g.lineTo(xF + d * 9, yc); g.lineTo(xF, yc + 6); }
      else { const d = state.mode === 'stat' ? -1 : 1; g.arc(xF, yc, 6, -Math.PI / 2, Math.PI / 2, d < 0); }
      g.closePath(); g.fill();
    }
    // 測站
    const xs = L.px(0); g.fillStyle = C['fr-mark']; g.beginPath(); g.arc(xs, y0 + 13, 4.5, 0, Math.PI * 2); g.fill();
    g.restore();
    txt(g, T('氣象站', 'Station'), xs, y0 + 26, C['fr-mark'], 'center', '700 10.5px ' + FONT);
    const lab = state.mode === 'stat' ? [T('北', 'N'), T('南', 'S')] : [T('西', 'W'), T('東', 'E')];
    txt(g, lab[0], 16, y0 + 12, C.muted, 'left', '700 10.5px ' + FONT); txt(g, lab[1], W - 16, y0 + 12, C.muted, 'right', '700 10.5px ' + FONT);
    txt(g, T('天氣圖', 'Weather map'), 30, y1 - 9, C.muted, 'left', '600 10px ' + FONT);
  }

  // ---------- 剖面 ----------
  function drawSection(g, L, Xf) {
    const W = cvSize.w, m = model(), f = m.f, ph = state.anim;
    // 天空
    const sky = g.createLinearGradient(0, L.yTop, 0, L.yg);
    sky.addColorStop(0, C['fr-sky0']); sky.addColorStop(1, C['fr-sky1']);
    g.fillStyle = sky; g.fillRect(L.x0, L.yTop - 8, L.x1 - L.x0, L.yg - L.yTop + 8);
    g.save(); g.beginPath(); g.rect(L.x0, L.yTop - 8, L.x1 - L.x0, L.yg - L.yTop + 8); g.clip();
    // 冷空氣的楔子
    const step = 3, cols = [];
    for (let x = L.x0; x <= L.x1 + step; x += step) { const X = L.Xof(x), s = sOfX(X, Xf); cols.push({ x: x, X: X, s: s, h: f.h(s), c: f.cloud(s), r: f.rain(s) }); }
    g.beginPath(); g.moveTo(cols[0].x, L.yg);
    cols.forEach(function (q) { g.lineTo(q.x, L.pz(Math.min(Z_VIEW + 500, q.h))); });
    g.lineTo(cols[cols.length - 1].x, L.yg); g.closePath();
    const cg = g.createLinearGradient(0, L.yTop, 0, L.yg); cg.addColorStop(0, D.alpha(C['fr-cold'], 0.16)); cg.addColorStop(1, D.alpha(C['fr-cold'], 0.38));
    g.fillStyle = cg; g.fill();
    // 暖空氣（上方淡淡的暖色）
    g.beginPath(); g.moveTo(cols[0].x, L.yTop - 8);
    cols.forEach(function (q) { g.lineTo(q.x, L.pz(Math.min(Z_VIEW + 500, q.h))); });
    g.lineTo(cols[cols.length - 1].x, L.yTop - 8); g.closePath();
    g.fillStyle = D.alpha(C['fr-warm'], 0.12); g.fill();
    // 對流層頂
    g.strokeStyle = D.alpha(C.text, 0.25); g.setLineDash([6, 5]); g.lineWidth = 1; g.beginPath(); g.moveTo(L.x0, L.pz(FC.Z_TOP)); g.lineTo(L.x1, L.pz(FC.Z_TOP)); g.stroke(); g.setLineDash([]);
    // 暖空氣的流線：沿著鋒面面往上爬
    const tan = f.tan, side = state.mode === 'warm' ? 1 : -1;     // 冷空氣（鋒面面升高）的方向
    g.lineWidth = 1.6; g.setLineDash([10, 9]); g.lineDashOffset = -ph * 26;
    [700, 2600, 4800].forEach(function (dz) {
      g.strokeStyle = D.alpha(C['fr-warm'], 0.55);
      g.beginPath(); let first = true;
      for (let x = L.x0; x <= L.x1; x += 4) {
        const X = L.Xof(x), s = sOfX(X, Xf), z = Math.max(0, s) * 1000 * tan + dz;
        if (z > FC.Z_TOP) continue;
        const y = L.pz(z); if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
      }
      g.stroke();
    });
    g.setLineDash([]);
    // 雲：用柔邊的雲團一團一團堆起來
    const dk = D.dark;
    cols.forEach(function (q, i) {
      if (!q.c || i % 2) return;
      const k = q.c.kind, yb = L.pz(q.c.base), yt0 = L.pz(FC.Z_TOP);
      if (k === 'cs') {
        // 卷層雲、卷雲：對流層頂下面薄薄一層、拉長的雲絲
        const y = yt0 + 6 + 8 * hash(i + 3);
        blobAt(g, q.x + 3 * hash(i), y, 16, 4, C['fr-cloud'], 0.5);
        if (i % 6 === 0) blobAt(g, q.x, y + 8, 22, 3, C['fr-cloud'], 0.35);
        return;
      }
      // 高層雲在雲底 2–3 km 之間漸變成下面會下雨的雲（積雨雲或雨層雲），不要在雨帶盡頭切出一道牆
      const wet = f.w >= FC.W_CB ? 'cb' : 'ns';
      const bl = k === 'as' ? Math.max(0, Math.min(1, (3000 - q.c.base) / 1000)) : 0;
      const kk = bl > 0.5 ? wet : k;
      const topOf = function (kind) { return kind === 'cb' ? yt0 - 4 : yt0 + (kind === 'as' ? 10 : 4) + 14 * hash(i + 11); };
      const top = topOf(k) + (topOf(wet) - topOf(k)) * bl;
      const rr = kk === 'cb' ? 13 : kk === 'ns' ? 12 : 10, gap = rr * 0.9;
      const bodyOf = function (kind) { return kind === 'cb' ? C['fr-cb'] : kind === 'ns' ? C['fr-ns'] : D.mix(C['fr-ns'], C['fr-cloud'], 0.5); };
      const aOf = function (kind) { return kind === 'cb' ? 0.78 : kind === 'ns' ? 0.62 : 0.4; };
      const body = bl > 0 ? D.mix(bodyOf(k), bodyOf(wet), bl) : bodyOf(k);
      // 雲底接近 6 km、快要變成卷層雲的高層雲越來越薄
      const a = (aOf(k) + (aOf(wet) - aOf(k)) * bl) * (k === 'as' ? Math.max(0.3, Math.min(1, (FC.Z_AS - q.c.base) / 1500)) : 1);
      for (let y = yb - rr * 0.4, j = 0; y > top; y -= gap, j++) {
        const u = (yb - y) / Math.max(1, yb - top);               // 0：雲底、1：雲頂
        const col = u < 0.12 ? D.shade(body, dk ? -0.25 : -0.18) : u > 0.85 ? C['fr-cloud'] : body;
        blobAt(g, q.x + (hash(i * 31 + j) - 0.5) * 6, y, rr * (0.85 + 0.35 * hash(i + j * 7)), rr * (0.85 + 0.35 * hash(i + j * 7)), col, a);
      }
      if (k === 'cb') blobAt(g, q.x, yt0 + 2, 14 + 8 * hash(i + 9), 12 + 6 * hash(i + 4), C['fr-cloud'], 0.85);
    });
    // 積雨雲的砧狀雲：在對流層頂往前（暖空氣那邊）伸出去
    const cb = cols.filter(function (q) { return q.c && q.c.kind === 'cb'; });
    if (cb.length) {
      const xa = side < 0 ? Math.max.apply(null, cb.map(function (q) { return q.x; })) : Math.min.apply(null, cb.map(function (q) { return q.x; }));
      const yt = L.pz(FC.Z_TOP), len = Math.min(140, Math.abs(L.px(80) - L.px(0)));
      g.fillStyle = D.alpha(C['fr-cb'], 0.92); g.beginPath();
      g.moveTo(xa, yt + 34); g.quadraticCurveTo(xa - side * len * 0.4, yt + 10, xa - side * len, yt + 2); g.lineTo(xa - side * len, yt - 6); g.quadraticCurveTo(xa - side * len * 0.4, yt - 10, xa, yt - 8); g.closePath(); g.fill();
    }
    // 雨與雨幡
    g.lineCap = 'round';
    cols.forEach(function (q, i) {
      if (!q.c) return;
      const yb = L.pz(q.c.base);
      if (q.r > 0) {
        const n = Math.min(4, Math.ceil(q.r / 2.5));
        g.strokeStyle = D.alpha(C['fr-rain'], Math.min(0.75, 0.25 + q.r * 0.06)); g.lineWidth = q.r > 5 ? 1.6 : 1.1;
        for (let k = 0; k < n; k++) {
          const off = ((ph * 160 + hash(i * 7 + k) * 400) % Math.max(20, L.yg - yb));
          const y = yb + off, x = q.x + hash(i + k * 13) * step;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, Math.min(L.yg, y + 9)); g.stroke();
        }
      } else if (q.c.kind === 'as' && i % 2 === 0) {
        g.strokeStyle = D.alpha(C['fr-rain'], 0.18); g.lineWidth = 1;
        const y = yb + ((ph * 60 + hash(i) * 200) % 30);
        g.beginPath(); g.moveTo(q.x, y); g.lineTo(q.x - 1.5, y + 7); g.stroke();
      }
    });
    // 鋒面面
    g.strokeStyle = C['fr-surf']; g.lineWidth = 2.6; g.beginPath(); let first = true;
    cols.forEach(function (q) { if (q.s < 0) return; const y = L.pz(q.h); if (y < L.yTop - 8) return; if (first) { g.moveTo(q.x, y); first = false; } else g.lineTo(q.x, y); });
    g.stroke();
    g.restore();
    // 地面
    const gg = g.createLinearGradient(0, L.yg, 0, L.yg + 30);
    gg.addColorStop(0, C['fr-ground0']); gg.addColorStop(1, C['fr-ground1']);
    g.fillStyle = gg; g.fillRect(L.x0, L.yg, L.x1 - L.x0, 30);
    // 冷空氣往前推的箭頭
    const xF = L.px(Xf);
    if (xF > L.x0 + 40 && xF < L.x1 + 200) {
      const xa = Math.min(L.x1 - 10, xF + side * 6), len = state.mode === 'warm' ? 26 : 46;
      if (state.mode !== 'warm') D.arrow(g, xa - len, L.yg - 14, xa - 4, L.yg - 14, C['fr-cold'], 2.6);
      else { const xb = Math.max(L.x0 + 10, xF + 40); D.arrow(g, xb + 20, L.yg - 14, xb + 20 + len, L.yg - 14, C['fr-cold'], 2); }
    }
    // 高度刻度
    for (let z = 0; z <= 10000; z += 2000) txt(g, String(z / 1000), L.x0 - 6, L.pz(z), C.muted, 'right', '10px ' + FONT);
    txt(g, 'km', L.x0 - 6, L.yTop - 10, C.muted, 'right', '600 10px ' + FONT);
    txt(g, T('對流層頂', 'Tropopause'), L.x0 + 6, L.pz(FC.Z_TOP) - 9, C.muted, 'left', '600 10px ' + FONT);
    // 氣團的名字
    const xc = side < 0 ? Math.max(L.x0 + 50, Math.min(xF - 70, L.x0 + 90)) : Math.min(L.x1 - 50, Math.max(xF + 90, L.x1 - 90));
    const xw = side < 0 ? Math.min(L.x1 - 60, Math.max(xF + 80, L.x1 - 70)) : Math.max(L.x0 + 60, Math.min(xF - 80, L.x0 + 80));
    if (Math.abs(xc - xF) > 30) tag(g, T('冷氣團 ', 'Cold air ') + degC(P().Tc, 0), xc, L.yg - 40, C['fr-cold'], 'center', '700 11px ' + FONT);
    if (Math.abs(xw - xF) > 30) tag(g, T('暖氣團 ', 'Warm air ') + degC(P().Tw, 0), xw, L.pz(1500), C['fr-warm'], 'center', '700 11px ' + FONT);
    // 坡度
    const sLab = Math.min(Math.abs(L.Xof(L.x1) - L.Xof(L.x0)) * 0.3, 4500 / (1000 * tan));
    const xl = L.px(Xf + (side > 0 ? 1 : -1) * sLab), yl = L.pz(sLab * 1000 * tan);
    if (xl > L.x0 + 60 && xl < L.x1 - 60) txt(g, T('鋒面面 1 : ', 'Front 1 : ') + P().N, xl + (side > 0 ? 8 : -8), yl - 12, C['fr-surf'], side > 0 ? 'right' : 'left', '700 11px ' + FONT);
    // 測站
    const xs = L.px(0), st = model().f.station(sAt(tNow()));
    g.fillStyle = D.shade(C['fr-ground1'], -0.1); g.fillRect(xs - 9, L.yg - 14, 18, 14);
    g.fillStyle = C['fr-mark']; g.beginPath(); g.moveTo(xs - 12, L.yg - 14); g.lineTo(xs, L.yg - 24); g.lineTo(xs + 12, L.yg - 14); g.closePath(); g.fill();
    g.strokeStyle = C.text; g.lineWidth = 1.4; g.beginPath(); g.moveTo(xs + 5, L.yg - 20); g.lineTo(xs + 5, L.yg - 40); g.stroke();
    const wv = bearingVec(st.wind + 180); D.arrow(g, xs + 5 - wv.x * 9, L.yg - 40, xs + 5 + wv.x * 9, L.yg - 40, C.text, 1.5);
    // 底下的距離刻度
    const span = L.Xmax - L.Xmin, sx = nice(span / (L.narrow ? 4 : 7));
    for (let k = Math.ceil(L.Xmin / sx); k * sx <= L.Xmax; k++) { const x = L.px(k * sx); if (x > L.x0 + 8 && x < L.x1 - 8) plain(g, num(k * sx, 0), x, L.yg + 10, '#f8fafc', 'center', '600 10px ' + FONT); }
    plain(g, T('離氣象站（km）', 'Distance from the station (km)'), L.x1 - 4, L.yg + 23, '#f8fafc', 'right', '600 10px ' + FONT);
    // 垂直放大
    const ve = ((L.Xmax - L.Xmin) / (L.x1 - L.x0)) / ((Z_VIEW / 1000) / (L.yg - L.yTop));
    txt(g, T('垂直放大 ', 'Vertical exaggeration ×') + (T('', '') + Math.round(ve / 10) * 10) + T(' 倍', ''), L.x0 + 6, L.yTop + 6, C.muted, 'left', '600 10px ' + FONT);
  }

  function drawMain() {
    const W = cvSize.w, H = cvSize.h, g = ctx;
    g.clearRect(0, 0, W, H); D.backdrop(g, W, H);
    const L = layout(W, H), Xf = frontX(tNow());
    drawSection(g, L, Xf);
    drawMap(g, L, Xf);
    // 時鐘
    const run = state.run, st = model().f.station(sAt(tNow()));
    const label = run ? T('第 ', 'Hour ') + num(run.t, 1) + T(' 小時', '') : T('按「讓鋒面通過」', 'Press “Let the front pass”');
    tag(g, label, W - 12, L.yTop + 8, run ? C.text : C.muted, 'right');
    if (st.rain > 0) tag(g, T('下雨 ', 'Rain ') + num(st.rain, 1) + ' mm/h', W - 12, L.yTop + 34, C['fr-rain'], 'right');
  }

  // =====================================================================
  // 下方的圖
  // =====================================================================
  function axisNum(v, st) { const dg = Math.max(0, -Math.floor(Math.log10(st) + 1e-9)); return num(v, dg); }
  function chartStation(g, W, H) {
    const m = model(), run = state.run, x0 = 44, x1 = W - 44, tEnd = m.ps.tEndRun;
    const xx = function (t) { return x0 + t / tEnd * (x1 - x0); };
    const A = { y0: 18, y1: Math.round(H * 0.52) }, B = { y0: Math.round(H * 0.52) + 22, y1: H - 30 };
    const tCur = run ? run.t : 0, rec = m.ps.rec, n = rec.length, dt = n > 1 ? rec[1].t : 0.02, iCur = Math.min(n - 1, Math.floor(tCur / dt + 1e-9));
    // 範圍（照整段紀錄，播放時刻度不會一直跳）
    let tMin = 1e9, tMax = -1e9; rec.forEach(function (r) { tMin = Math.min(tMin, r.T, r.Td); tMax = Math.max(tMax, r.T, r.Td); });
    tMin = Math.floor(tMin - 1); tMax = Math.ceil(tMax + 1);
    const pMin = Math.floor(m.ps.pMin - 1), pMax = Math.ceil(m.ps.pMax + 1);
    let rMax = Math.max(1, m.ps.peak * 1.15), cMax = Math.max(2, m.cum[m.cum.length - 1] * 1.1);
    const yA = function (v) { return A.y1 - (v - tMin) / (tMax - tMin) * (A.y1 - A.y0); };
    const yP = function (v) { return A.y1 - (v - pMin) / (pMax - pMin) * (A.y1 - A.y0); };
    const yR = function (v) { return B.y1 - v / rMax * (B.y1 - B.y0); };
    const yC = function (v) { return B.y1 - v / cMax * (B.y1 - B.y0); };
    // 格線與刻度
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    const sx = nice(tEnd / (W > 480 ? 8 : 4));
    for (let t = 0; t <= tEnd + 1e-9; t += sx) { const x = xx(t); g.beginPath(); g.moveTo(x, A.y0); g.lineTo(x, B.y1); g.stroke(); txt(g, num(t, 0), x, B.y1 + 11, C.muted, 'center', '10px ' + FONT); }
    txt(g, T('時間（小時）', 'Time (hours)'), (x0 + x1) / 2, B.y1 + 24, C.muted, 'center', '600 10.5px ' + FONT);
    const sy = nice((tMax - tMin) / 4);
    for (let v = Math.ceil(tMin / sy) * sy; v <= tMax; v += sy) { const y = yA(v); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); txt(g, axisNum(v, sy), x0 - 6, y, C.muted, 'right', '10px ' + FONT); }
    const sp = nice((pMax - pMin) / 4);
    for (let v = Math.ceil(pMin / sp) * sp; v <= pMax; v += sp) txt(g, axisNum(v, sp), x1 + 6, yP(v), C['fr-press'], 'left', '10px ' + FONT);
    const sr = nice(rMax / 3);
    for (let v = 0; v <= rMax; v += sr) { const y = yR(v); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); txt(g, axisNum(v, sr), x0 - 6, y, C['fr-rain'], 'right', '10px ' + FONT); }
    const sc = nice(cMax / 3);
    for (let v = 0; v <= cMax; v += sc) txt(g, axisNum(v, sc), x1 + 6, yC(v), C.text, 'left', '10px ' + FONT);
    txt(g, '°C', x0 - 6, A.y0 - 9, C.muted, 'right', '600 10px ' + FONT); txt(g, 'hPa', x1 + 6, A.y0 - 9, C['fr-press'], 'left', '600 10px ' + FONT);
    txt(g, 'mm/h', x0 - 4, B.y0 - 10, C['fr-rain'], 'right', '600 10px ' + FONT); txt(g, 'mm', x1 + 6, B.y0 - 10, C.text, 'left', '600 10px ' + FONT);
    g.strokeStyle = D.alpha(C.text, 0.45); g.strokeRect(x0, A.y0, x1 - x0, A.y1 - A.y0); g.strokeRect(x0, B.y0, x1 - x0, B.y1 - B.y0);
    if (!run) { txt(g, T('按「讓鋒面通過」開始記錄', 'Press “Let the front pass” to start recording'), (x0 + x1) / 2, (A.y0 + A.y1) / 2, C.muted, 'center', '600 12px ' + FONT); }
    else {
      const line = function (f, col, w, yf) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (let i = 0; i <= iCur; i++) { const x = xx(rec[i].t), y = yf(f(rec[i])); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); };
      // 雨量柱
      g.fillStyle = D.alpha(C['fr-rain'], 0.55);
      const bw = Math.max(1, (x1 - x0) / n);
      for (let i = 0; i <= iCur; i++) if (rec[i].rain > 0) { const x = xx(rec[i].t); g.fillRect(x, yR(rec[i].rain), bw + 0.4, B.y1 - yR(rec[i].rain)); }
      g.strokeStyle = C.text; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= iCur; i++) { const x = xx(rec[i].t), y = yC(m.cum[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
      line(function (r) { return r.p; }, C['fr-press'], 2, yP);
      line(function (r) { return r.Td; }, C['fr-td'], 2.2, yA);
      line(function (r) { return r.T; }, C['fr-warm'], 2.6, yA);
      if (m.ps.tFront != null && m.ps.tFront <= tCur) { const x = xx(m.ps.tFront); g.strokeStyle = D.alpha(C['fr-surf'], 0.7); g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, A.y0); g.lineTo(x, B.y1); g.stroke(); g.setLineDash([]); const lab = T('鋒面通過', 'Front passes'), fnt = '700 10.5px ' + FONT; g.font = fnt; const lw = g.measureText(lab).width, right = x + 4 + lw <= x1 - 4; txt(g, lab, right ? x + 4 : x - 4, A.y0 + 10, C['fr-surf'], right ? 'left' : 'right', fnt); }
      const x = xx(tCur); g.strokeStyle = D.alpha(C.text, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(x, A.y0); g.lineTo(x, B.y1); g.stroke();
    }
    txt(g, T('紅：氣溫　青：露點　紫：氣壓（右）', 'Red: temperature  Cyan: dew point  Purple: pressure (right)'), x0 + 8, A.y0 - 9, C.text, 'left', '600 10px ' + FONT);
    txt(g, T('藍柱：降雨率　線：累積雨量（右）', 'Bars: rain rate  Line: total rain (right)'), x0 + 30, B.y0 - 10, C.text, 'left', '600 10px ' + FONT);
  }
  function chartRain(g, W, H) {
    const m = model(), f = m.f, L = { x0: 44, x1: W - 16 }, y0 = 22, y1 = H - 34, Xf = frontX(tNow());
    const Xmin = -0.75 * m.wkm, Xmax = 0.25 * m.wkm;
    const xx = function (X) { return L.x0 + (X - Xmin) / (Xmax - Xmin) * (L.x1 - L.x0); };
    const rMax = Math.max(1, f.rain(0.5) * 1.2);
    const yy = function (v) { return y1 - v / rMax * (y1 - y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    const sx = nice((Xmax - Xmin) / (W > 480 ? 8 : 4));
    for (let k = Math.ceil(Xmin / sx); k * sx <= Xmax; k++) { const x = xx(k * sx); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); txt(g, num(k * sx, 0), x, y1 + 11, C.muted, 'center', '10px ' + FONT); }
    const sy = nice(rMax / 4);
    for (let v = 0; v <= rMax; v += sy) { const y = yy(v); g.beginPath(); g.moveTo(L.x0, y); g.lineTo(L.x1, y); g.stroke(); txt(g, axisNum(v, sy), L.x0 - 6, y, C.muted, 'right', '10px ' + FONT); }
    txt(g, T('離氣象站（km）', 'Distance from the station (km)'), (L.x0 + L.x1) / 2, y1 + 24, C.muted, 'center', '600 10.5px ' + FONT);
    txt(g, T('地面的降雨率（mm/h）', 'Rain rate at the ground (mm/h)'), 6, 10, C.muted, 'left', '600 10.5px ' + FONT);
    g.save(); g.beginPath(); g.rect(L.x0, y0, L.x1 - L.x0, y1 - y0); g.clip();
    g.beginPath(); g.moveTo(L.x0, y1);
    for (let x = L.x0; x <= L.x1; x += 2) { const X = Xmin + (x - L.x0) / (L.x1 - L.x0) * (Xmax - Xmin); g.lineTo(x, yy(f.rain(sOfX(X, Xf)))); }
    g.lineTo(L.x1, y1); g.closePath(); g.fillStyle = D.alpha(C['fr-rain'], 0.35); g.fill(); g.strokeStyle = C['fr-rain']; g.lineWidth = 2; g.stroke();
    // 雨帶寬度
    if (f.sRain != null) {
      const a = xx(Xf), b = xx(Xf + (state.mode === 'warm' ? 1 : -1) * f.sRain), yb = y0 + 14;
      g.strokeStyle = C.text; g.lineWidth = 1.2; g.beginPath(); g.moveTo(a, yb); g.lineTo(b, yb); g.stroke();
      [a, b].forEach(function (x) { g.beginPath(); g.moveTo(x, yb - 5); g.lineTo(x, yb + 5); g.stroke(); });
      const lab = T('雨帶 ', 'Rain band ') + num(f.sRain, 0) + ' km' + (P().U > 0 ? T(' ÷ ', ' ÷ ') + num(P().U, 1) + ' km/h ≈ ' + hrs(f.sRain / P().U) : '');
      txt(g, lab, Math.max(L.x0 + 80, Math.min(L.x1 - 80, (a + b) / 2)), yb + 14, C.text, 'center', '700 11px ' + FONT);
    }
    const xs = xx(0); g.strokeStyle = C['fr-mark']; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(xs, y0); g.lineTo(xs, y1); g.stroke(); g.setLineDash([]);
    g.restore();
    txt(g, T('氣象站', 'Station'), xs, y1 - 8, C['fr-mark'], 'center', '700 10.5px ' + FONT);
    g.strokeStyle = D.alpha(C.text, 0.45); g.strokeRect(L.x0, y0, L.x1 - L.x0, y1 - y0);
  }
  function drawChart() {
    const g = gtx, W = grSize.w, H = grSize.h;
    g.clearRect(0, 0, W, H); D.backdrop(g, W, H);
    if (state.chart === 'b') chartRain(g, W, H); else chartStation(g, W, H);
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
    const run = state.run;
    if (run && run.playing) { stepRun(dt); state.anim += dt; }
    drawMain(); drawChart();
    if (run && run.playing) requestDraw(); else lastFrame = 0;
  }
  function sound() { const Ls = window.LabSound; return Ls && Ls.enabled() ? Ls : null; }
  function rate() { return Math.max(1, model().ps.tEndRun / RUN_SEC); }
  function startRun() {
    acted();
    const run = state.run;
    if (run && !run.done && !run.playing) { run.playing = true; updateButtons(); requestDraw(); return; }
    if (run && run.playing) return;
    state.run = { t: 0, playing: true, done: false, passed: false, raining: false };
    setStatus({ cold: T('冷鋒從西邊推過來……', 'The cold front is pushing in from the west…'), warm: T('暖鋒還在很遠的西邊，先注意天空的雲……', 'The warm front is still far to the west; watch the clouds in the sky first…'), stat: T('梅雨鋒面停在附近，西南氣流把水氣一直送上來……', 'The plum rain front hangs nearby while the south-westerly flow keeps feeding it moisture…') }[state.mode]);
    const snd = sound(); if (snd) snd.tone({ freq: 660, dur: 0.1, type: 'sine', gain: 0.04 });
    updateButtons(); afterChange(true); requestDraw();
  }
  function stepRun(dt) {
    const run = state.run, m = model(), end = m.ps.tEndRun;
    run.t = Math.min(end, run.t + dt * rate());
    const st = m.f.station(sAt(run.t)), snd = sound();
    if (!run.passed && m.ps.tFront != null && run.t >= m.ps.tFront) {
      run.passed = true;
      setStatus({ cold: T('冷鋒通過了：氣溫下降、氣壓開始上升、風轉成西北風。', 'The cold front has passed: the temperature drops, the pressure starts to rise and the wind turns north-westerly.'), warm: T('暖鋒通過了：變暖、變潮溼，風轉成西南風。', 'The warm front has passed: warmer and more humid, with a south-westerly wind.'), stat: T('鋒面線通過測站，往南移了。', 'The front line has crossed the station and moved south.') }[state.mode]);
      if (snd) snd.sweep ? snd.sweep({ from: 700, to: 420, dur: 0.35, type: 'triangle', gain: 0.05 }) : snd.tone({ freq: 520, dur: 0.2, type: 'triangle', gain: 0.05 });
    }
    if (!run.raining && st.rain > 0.1) { run.raining = true; if (snd) snd.tone({ freq: 880, dur: 0.08, type: 'sine', gain: 0.03 }); }
    if (run.raining && st.rain <= 0.1) run.raining = false;
    if (run.t >= end - 1e-9) finishRun();
    updateReadouts();
  }
  function finishRun() {
    const run = state.run, m = model(), ps = m.ps;
    run.playing = false; run.done = true; run.t = ps.tEndRun;
    const ev = snapshot(); ev.anim = false;
    setStatus(T('紀錄完成：', 'Record complete: ') + hrs(ps.tEndRun) + T('內下了 ', ', total rain ') + num(ps.total, 1) + ' mm' + T('（下雨 ', ' (rain for ') + hrs(ps.hours) + T('，最大 ', ', peak ') + num(ps.peak, 1) + ' mm/h' + T('）；氣溫變化 ', '); temperature change ') + degC(ps.dT) + T('、氣壓變化 ', ', pressure change ') + num(ps.dP, 1) + ' hPa' + T('。', '.') + (ps.capped ? T('（72 小時還沒走完）', ' (still not through after 72 h)') : ''));
    const snd = sound(); if (snd) { snd.tone({ freq: 784, dur: 0.12, type: 'triangle', gain: 0.05 }); snd.tone({ freq: 1175, dur: 0.18, type: 'triangle', gain: 0.04, delay: 0.1 }); }
    updateButtons(); updateReadouts();
    emit('run', ev);
    afterChange(true);
  }
  function pauseRun() { const run = state.run; if (!run || run.done) return; run.playing = !run.playing; updateButtons(); afterChange(true); requestDraw(); }

  // =====================================================================
  // 事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function snapshot() {
    const m = model(), f = m.f, p = P(), run = state.run, ps = m.ps;
    const d = {
      mode: state.mode, chart: state.chart, anim: !!(run && run.playing), preset: state.preset[state.mode],
      Tw: p.Tw, Tdw: p.Tdw, Tc: p.Tc, Tdc: p.Tdc, N: p.N, U: p.U, V: p.V,
      w: f.w, zl: f.zl, band: f.sRain, bandHours: f.sRain != null && p.U > 0 ? f.sRain / p.U : null, rain0: f.rain(0.5),
      shear: FC.margulesShear(LAT, (p.Tw + p.Tc) / 2, f.tan, p.Tw - p.Tc), t: run ? run.t : 0
    };
    if (run && run.done) Object.assign(d, {
      done: true, total: ps.total, hours: ps.hours, peak: ps.peak, dT: ps.dT, dTd: ps.dTd, dP: ps.dP, pMin: ps.pMin, pMax: ps.pMax,
      wind0: ps.wind0, wind1: ps.wind1, clouds: ps.clouds.join(','), passed: ps.passed, capped: ps.capped, tFront: ps.tFront, tStart: ps.tStart, tEnd: ps.tEndRun,
      max1: ps.max1, max3: ps.max3, max24: ps.max24, tCloud: ps.tCloud, snow: ps.snow
    });
    return d;
  }
  let lastEmit = 0;
  function afterChange(force) {
    updateReadouts();
    const tNow2 = performance.now();
    if (force || tNow2 - lastEmit > 200) { lastEmit = tNow2; emit('state', snapshot()); }
    requestDraw();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    const p = P();
    setOut(el.tw, num(p.Tw, 1)); setOut(el.tdw, num(p.Tdw, 1)); setOut(el.tc, num(p.Tc, 1)); setOut(el.tdc, num(p.Tdc, 1));
    setOut(el.slope, String(p.N)); setOut(el.u, num(p.U, 1)); setOut(el.v, num(p.V, 1));
    const pr = function (sel, attr, v) { document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); }); };
    pr('#modeSeg button', 'data-mode', state.mode);
    pr('#chartSeg button', 'data-chart', state.chart);
    pr('#presetSeg button', 'data-p', state.preset[state.mode]);
    cv.setAttribute('aria-label', T('鋒面的剖面：', 'Cross-section through the front: ') + { cold: T('冷鋒', 'cold front'), warm: T('暖鋒', 'warm front'), stat: T('梅雨鋒面', 'plum rain front') }[state.mode]);
  }
  function updateReadouts() {
    const m = model(), f = m.f, p = P(), run = state.run, t = tNow(), st = f.station(sAt(t));
    setHTML('rRain', st.rain > 0.05 ? T('下雨 ', 'Raining ') + num(st.rain, 1) + ' mm/h' : st.cloud ? T('沒下雨', 'Not raining') : T('晴', 'Clear'));
    setHTML('rTime', run ? T('第 ', 'Hour ') + num(t, 1) + T(' 小時', '') : '—');
    setHTML('rSky', st.cloud ? kindName(st.cloud) + T('（雲底 ', ' (base ') + num(st.base / 1000, 1) + ' km' + T('）', ')') : T('晴（頭上沒有鋒面雲）', 'Clear (no frontal cloud overhead)'));
    setHTML('rT', degC(st.T)); setHTML('rTd', degC(st.Td)); setHTML('rP', num(st.p, 1) + ' hPa'); setHTML('rWind', windName(st.wind));
    if (run) {
      const sn = snowAt(t), m1 = winMax(t, 1), m3 = winMax(t, 3), m24 = winMax(t, 24);
      setHTML('rTot', num(cumAt(t), 1) + ' mm' + (sn >= 0.05 ? T('（其中雪 ', ' (snow ') + num(sn, 1) + ' mm' + T('）', ')') : ''));
      setHTML('rClass', '<b>' + rainClass(m1, m3, m24) + '</b>' + T('：最大 1 小時 ', ': max 1 h ') + num(m1, 1) + T('、3 小時 ', ', 3 h ') + num(m3, 1) + T('、24 小時 ', ', 24 h ') + num(m24, 1) + ' mm');
    } else { setHTML('rTot', '—'); setHTML('rClass', '—'); }
    setHTML('rW', num(f.w * 100, 1) + ' cm/s');
    setHTML('rLCL', num(f.zl, 0) + ' m');
    setHTML('rBand', f.sRain != null ? num(f.sRain, 0) + ' km' + (p.U > 0 ? T('，大約下 ', ', about ') + hrs(f.sRain / p.U) : T('，鋒面不動：一直下', ', front not moving: rain without end')) : T('沒有（雲底高於 2 km，雨下不到地面）', 'None (cloud base above 2 km, the rain never reaches the ground)'));
    setHTML('rShear', num(FC.margulesShear(LAT, (p.Tw + p.Tc) / 2, f.tan, p.Tw - p.Tc), 1) + ' m/s');
    setHTML('airHint', T('暖空氣的凝結高度 ', 'Warm air condenses at ') + '<b>' + num(f.zl, 0) + ' m</b>' + T('（氣溫和露點差 ', ' (temperature minus dew point ') + num(p.Tw - p.Tdw, 1) + T(' °C × 約 125 m）；兩個氣團溫差 ', ' °C × about 125 m); the air masses differ by ') + '<b>' + num(p.Tw - p.Tc, 1) + ' °C</b>' + T('。', '.'));
    setHTML('frontHint', T('上升速度 w = V × 坡度 = ', 'Uplift w = V × slope = ') + num(p.V, 1) + ' × 1/' + p.N + ' = <b>' + num(f.w * 100, 1) + ' cm/s</b>' + T('；鋒面前緣的降雨率 ', '; rain rate at the front edge ') + '<b>' + num(f.rain(0.5), 1) + ' mm/h</b>' + T('。', '.'));
    setHTML('cvHint', {
      cold: T('冷空氣（藍）像鏟子一樣鑽到暖空氣底下往前推，暖空氣被迫沿著陡的鋒面面往上衝，形成積雨雲：雨大但下不久。上方是天氣圖：藍色三角形指向冷鋒前進的方向。', 'The cold air (blue) digs under the warm air like a shovel and pushes it up the steep frontal surface into cumulonimbus: heavy rain that does not last long. The strip on top is the weather map: blue triangles point the way the cold front moves.'),
      warm: T('暖空氣慢慢爬上平緩的冷空氣斜坡：最前面是高高的卷雲，越近鋒面雲越低越厚，最後是下著綿綿細雨的雨層雲。天氣圖上紅色半圓指向暖鋒前進的方向。', 'The warm air slowly climbs the gentle slope of cold air: high cirrus far ahead, lower and thicker cloud nearer the front, and finally nimbostratus with steady drizzle. On the weather map red semicircles point the way the warm front moves.'),
      stat: T('五、六月，北方的冷空氣和南方溫暖潮溼的西南季風勢均力敵，鋒面幾乎停住；西南氣流不斷把水氣送上鋒面，雨一下就是好幾天。天氣圖上三角形和半圓交錯，指向相反的兩邊。', 'In May and June the cool northern air and the warm, moist south-westerly monsoon are evenly matched and the front almost stops; the south-westerly flow keeps carrying moisture up the front and it rains for days. On the weather map triangles and semicircles alternate, pointing in opposite directions.')
    }[state.mode]);
    setHTML('chartHint', state.chart === 'b'
      ? T('地面上每個地方現在的降雨率。同一個地方下雨的時間 ≈ 雨帶寬度 ÷ 鋒面移動的速度：鋒面走得越慢，雨下得越久、雨量越大。', 'The rain rate at the ground right now along the section. Rain at one place lasts about (width of the rain band) ÷ (speed of the front): the slower the front, the longer and heavier the total rain.')
      : T('氣象站一路記下的氣溫、露點、氣壓與雨量。冷鋒：氣溫驟降、氣壓上升；暖鋒：氣壓一路下降，過境後變暖。', 'What the weather station records: temperature, dew point, pressure and rain. Cold front: the temperature drops sharply and the pressure rises; warm front: the pressure falls all the way, then it turns warm.'));
  }
  function updateButtons() {
    const run = state.run;
    $('go').textContent = run && !run.done ? (run.playing ? T('鋒面通過中…', 'Front passing…') : T('繼續', 'Resume')) : T('讓鋒面通過', 'Let the front pass');
    $('pause').disabled = !run || run.done || !run.playing;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function syncSliders() { const p = P(); setSlider(el.tw, p.Tw); setSlider(el.tdw, p.Tdw); setSlider(el.tc, p.Tc); setSlider(el.tdc, p.Tdc); setSlider(el.slope, p.N); setSlider(el.u, p.U); setSlider(el.v, p.V); }
  function fillPresets() {
    const box = $('presetSeg'); box.innerHTML = '';
    PRESETS[state.mode].forEach(function (pr) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-p', pr.id); b.textContent = T(pr.zh, pr.en);
      b.addEventListener('click', function () {
        acted(); state.P[state.mode] = Object.assign({}, pr.p); state.preset[state.mode] = pr.id; state.run = null;
        syncSliders(); setStatus(T(pr.zh, pr.en) + T('：按「讓鋒面通過」。', ': press “Let the front pass”.'));
        refreshOutputs(); updateButtons(); afterChange(true);
      });
      box.appendChild(b);
    });
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function changed() { state.preset[state.mode] = ''; state.run = null; updateButtons(); refreshOutputs(); afterChange(); }
  function clampAll(src) {
    const p = P();
    if (src === 'tw' || src === 'tc') {
      if (p.Tc > p.Tw - 1) { if (src === 'tw') { p.Tc = Math.max(-10, Math.round((p.Tw - 1) * 10) / 10); setSlider(el.tc, p.Tc); } else { p.Tc = Math.round((p.Tw - 1) * 10) / 10; setSlider(el.tc, p.Tc); } }
    }
    if (p.Tdw > p.Tw) { p.Tdw = p.Tw; setSlider(el.tdw, p.Tdw); }
    if (p.Tdc > p.Tc) { p.Tdc = p.Tc; setSlider(el.tdc, p.Tdc); }
  }
  [['tw', 'Tw', 5, 35], ['tdw', 'Tdw', -10, 30], ['tc', 'Tc', -10, 30], ['tdc', 'Tdc', -25, 30], ['u', 'U', 0, 60], ['v', 'V', 1, 20]].forEach(function (a) {
    el[a[0]].addEventListener('input', function () {
      if (quiet) return;
      acted();
      const p = P(); p[a[1]] = Math.max(a[2], Math.min(a[3], val(el[a[0]])));
      if (a[0] === 'tdw' && p.Tdw > p.Tw) { p.Tdw = p.Tw; setSlider(el.tdw, p.Tdw); }
      if (a[0] === 'tdc' && p.Tdc > p.Tc) { p.Tdc = p.Tc; setSlider(el.tdc, p.Tdc); }
      if (a[0] === 'tc' && p.Tc > p.Tw - 1) { p.Tc = Math.round((p.Tw - 1) * 10) / 10; setSlider(el.tc, p.Tc); }
      clampAll(a[0]);
      changed();
    });
  });
  el.slope.addEventListener('input', function () { if (quiet) return; acted(); P().N = Math.max(30, Math.min(400, Math.round(val(el.slope)))); changed(); });
  Object.keys(el).forEach(function (k) { el[k].addEventListener('change', function () { if (!quiet) afterChange(true); }); });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      if (state.run && state.run.playing) state.run.playing = false;
      state.mode = b.getAttribute('data-mode'); state.run = null;
      syncSliders(); fillPresets(); refreshOutputs(); updateButtons(); afterChange(true);
      setStatus(T('按「讓鋒面通過」，看氣象站記到什麼。', 'Press “Let the front pass” and see what the station records.'));
    });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.chart = b.getAttribute('data-chart'); refreshOutputs(); afterChange(true); });
  });
  $('go').addEventListener('click', function () { startRun(); });
  $('pause').addEventListener('click', function () { acted(); pauseRun(); });
  $('clear').addEventListener('click', function () {
    acted(); state.run = null;
    setStatus(T('已清除紀錄，設定不變。', 'Records cleared; the settings are kept.'));
    updateButtons(); afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncSliders(); fillPresets();
  state.acted = false;
  refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts();
  function themeChanged() { readColors(); fillPresets(); refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts(); requestDraw(); }
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
  setStatus(T('按「讓鋒面通過」，看冷鋒掃過氣象站。', 'Press “Let the front pass” and watch the cold front sweep over the station.'));
  requestDraw();
  // 測試用（Playwright）
  window.__fr = {
    state: state, FC: FC, snapshot: snapshot, model: model,
    set: function (o) {
      acted();
      if (o.mode && o.mode !== state.mode) { state.mode = o.mode; state.run = null; fillPresets(); }
      const p = P(); let ch = false;
      ['Tw', 'Tdw', 'Tc', 'Tdc', 'N', 'U', 'V'].forEach(function (k) { if (o[k] != null) { p[k] = o[k]; ch = true; } });
      if (ch) { state.preset[state.mode] = ''; state.run = null; }
      if (o.chart) state.chart = o.chart;
      if (o.t != null && state.run) state.run.t = o.t;
      syncSliders(); refreshOutputs(); updateButtons(); afterChange(true);
    },
    at: function (t) { if (!state.run) state.run = { t: 0, playing: false, done: false, passed: false, raining: false }; state.run.t = t; updateReadouts(); requestDraw(); },
    finish: function () { if (!state.run || state.run.done) startRun(); for (let k = 0; k < 100000 && state.run && state.run.playing; k++) stepRun(0.1); requestDraw(); }
  };
})();
