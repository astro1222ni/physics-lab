/* equipotential.js — 「等位線與電場（導電紙與水槽）」的畫面與互動（物理計算在 equipotential-core.js） */
(function () {
  'use strict';
  const EC = window.EquipotentialCore;
  let studyApplying = false;
  const LD = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FF = LD.FONT;
  const SW = EC.SHEET_W, SH = EC.SHEET_H;
  const NUDGE = 0.05;          // 方向鍵每按一次移動的距離（cm）
  const NUDGE_BIG = 0.5;       // Shift＋方向鍵（cm）
  const NUDGE_FINE = 0.01;     // Alt＋方向鍵（cm）
  const FINE = 0.2;            // 精細拖曳的比例
  const MARK_SIGMA = 0.05;     // 含誤差：描點到方格紙上的誤差（cm）
  const OFFSET_MAX = 0.015;    // 含誤差：電表零點偏差上限（V）
  const JITTER_V = 0.008;      // 含誤差：三用電表最後一位的跳動（V）
  const JITTER_I = 0.15e-6;    // 含誤差：檢流計指針的抖動（A）
  const SIGMA_AMP = 0.04;      // 含誤差：導電紙導電度的起伏（±4 %）
  const reduced = LD.reducedMotion();

  // ---------------------------------------------------------------------
  // 狀態
  // ---------------------------------------------------------------------
  const state = {
    type: 'circles', d: 14, a: 0.75, L: 20, V0: 6, power: false,
    medium: new URLSearchParams(location.search).get('medium') === 'water' ? 'water' : 'paper', ac: false,
    meter: 'dmm', noise: false, seed: 1,
    n2: { x: 18.5, y: 13.5 }, n1: { x: 11.5, y: 5.5 }, clip: false, sel: 'n2', fine: false,
    sheets: {},                // 設定代號 → { recs: [], est: null, rev }
    drawLines: false, drawField: false, showTheory: false, showStream: false, showHeat: false,
    n1Touched: false, estimated: false,
    offset: 0, jitter: 0, jitterI: 0,
    needle: 0                  // 檢流計指針（畫面用，-1…1）
  };
  let lastStatus = '';
  let kb = null;               // 鍵盤操作（js/keys.js）
  const KB_IDS = ['n2', 'n1'];

  // ---------------------------------------------------------------------
  // 數值解（1 V 的解，依電源電壓縮放；同一設定只解一次）
  // ---------------------------------------------------------------------
  const solCache = new Map();
  function cfgOf(V0) {
    const c = { type: state.type, d: state.d, a: state.a, L: state.L, V0: V0 == null ? 1 : V0, medium: state.medium };
    if (state.noise) c.sigma = { seed: state.seed, amp: SIGMA_AMP };
    return c;
  }
  function solKey(h) { return [state.medium, state.type, state.d, state.a, state.L, state.noise ? state.seed : 0, h].join('|'); }
  let preview = false;   // 拖曳滑桿時先用較粗的網格
  function getSol() {
    const h = preview ? 0.25 : 0.125;
    const k = solKey(h);
    let s = solCache.get(k);
    if (!s) {
      s = EC.solve(cfgOf(1), { h: h });
      s.key = k;
      s.derived = {};
      if (solCache.size > 10) solCache.delete(solCache.keys().next().value);
      solCache.set(k, s);
    }
    return s;
  }
  function voltage() { return EC.voltageModel(Object.assign({}, state, { V0: state.power ? state.V0 : 0 })); }
  function V0eff() { return voltage().bulk; }
  function potAt(x, y) { return voltage().negative + V0eff() * EC.potentialAt(getSol(), x, y); }
  function probePotAt(x, y) {
    const e = EC.electrodeAt(els(), x, y);
    return e < 0 ? potAt(x, y) : (els()[e].sign > 0 && state.power ? state.V0 : 0);
  }
  function supplyCurrent() { return EC.currentAcross(getSol()) * V0eff(); }
  function symbols(text) { return text.replace(/N([12])/g, 'N<sub>$1</sub>').replace(/V0/g, 'V<sub>0</sub>'); }
  function fieldAt(x, y) { const f = EC.fieldAt(getSol(), x, y), k = V0eff(); return { ex: f.ex * k, ey: f.ey * k, E: f.E * k }; }
  function els() { return getSol().els; }
  function negEl() { return els().find(function (e) { return e.sign < 0; }); }
  function posEl() { return els().find(function (e) { return e.sign > 0; }); }
  function elCenter(e) { return e.kind === 'circle' ? { x: e.x, y: e.y } : { x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2 }; }
  /** 電極輪廓（封閉折線），當作等位線使用 */
  function elPath(e) {
    const p = [];
    if (e.kind === 'circle') {
      for (let q = 0; q <= 96; q++) { const t = 2 * Math.PI * q / 96; p.push([e.x + e.r * Math.cos(t), e.y + e.r * Math.sin(t)]); }
      return p;
    }
    const c = [[e.x0, e.y0], [e.x1, e.y0], [e.x1, e.y1], [e.x0, e.y1], [e.x0, e.y0]];
    for (let i = 1; i < c.length; i++) {
      const n = 24;
      for (let q = (i === 1 ? 0 : 1); q <= n; q++) p.push([c[i - 1][0] + (c[i][0] - c[i - 1][0]) * q / n, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * q / n]);
    }
    return p;
  }

  // ---------------------------------------------------------------------
  // 方格紙（每一種設定一張）與記錄
  // ---------------------------------------------------------------------
  function sheetKey(medium) { const m = medium || state.medium; return [m, m === 'paper' ? false : state.ac, state.type, state.d, state.a, state.L, state.V0, state.noise ? state.seed : 0].join('|'); }
  function sheet() {
    const k = sheetKey();
    if (!state.sheets[k]) state.sheets[k] = { recs: [], est: null, rev: 0 };
    return state.sheets[k];
  }
  let anaCache = { key: '', groups: [], curves: [], sketch: null };
  /** 分組、排序、平滑後的等位線（依方格紙修訂版快取） */
  function analysis() {
    const sh = sheet();
    const key = sheetKey() + '#' + sh.rev + '#' + LD.ver;
    if (anaCache.key === key) return anaCache;
    const recs = sh.recs;
    const groups = EC.groupRecords(recs.map(function (r) { return { n1x: r.n1x, n1y: r.n1y, reading: r.lineReading == null ? r.reading : r.lineReading, V1: r.V1 }; }));
    groups.forEach(function (g, n) {
      g.name = 'L' + (n + 1);
      g.pts = g.idx.map(function (i) { return [recs[i].x, recs[i].y]; });
      g.trueV = g.idx.map(function (i) { return recs[i].V2; });
      let span = 0;
      for (let i = 0; i < g.pts.length; i++) for (let j = i + 1; j < g.pts.length; j++) span = Math.max(span, Math.hypot(g.pts[i][0] - g.pts[j][0], g.pts[i][1] - g.pts[j][1]));
      g.span = span;
      g.vRange = g.trueV.length ? Math.max.apply(null, g.trueV) - Math.min.apply(null, g.trueV) : 0;
      if (g.pts.length >= 3) {
        const o = EC.orderPoints(g.pts);
        g.closed = o.closed;
        g.path = EC.smoothPath(o.pts, o.closed, 10);
      } else if (g.pts.length === 2) {
        g.closed = false; g.path = g.pts.slice();
      } else g.path = null;
    });
    anaCache = { key: key, groups: groups, sketch: null };
    return anaCache;
  }
  /** 依電位由高到低的曲線（同電位只留點數最多的一條），頭尾加上正、負電極 */
  function curvesForSketch(minPts) {
    const A = analysis();
    const list = A.groups.filter(function (g) { return g.path && g.pts.length >= minPts; })
      .sort(function (a, b) { return b.pts.length - a.pts.length; });
    const kept = [];
    list.forEach(function (g) { if (!kept.some(function (k) { return Math.abs(k.V - g.V) < 0.15; })) kept.push(g); });
    kept.sort(function (a, b) { return b.V - a.V; });
    const pe = posEl(), ne = negEl();
    const vm = voltage();
    const curves = [{ V: vm.positive, path: elPath(pe), isElectrode: true, center: pe.kind === 'circle' ? [pe.x, pe.y] : null }];
    kept.forEach(function (g) { if (g.V < vm.positive - 0.05 && g.V > vm.negative + 0.05) curves.push({ V: g.V, path: g.path, g: g }); });
    curves.push({ V: vm.negative, path: elPath(ne), isElectrode: true, center: ne.kind === 'circle' ? [ne.x, ne.y] : null });
    return curves;
  }
  function sketch() {
    const A = analysis();
    if (A.sketch) return A.sketch;
    const curves = curvesForSketch(3);
    const nMeasured = curves.length - 2;
    const measured = curves.filter(function (c) { return !c.isElectrode; }).map(function (c) { return { V: c.V, path: c.path }; });
    const vm = voltage(), waterEls = els().map(function (e) { return Object.assign({}, e, { V: e.sign > 0 ? vm.positive : vm.negative }); });
    A.sketch = { lines: nMeasured >= 1 && vm.bulk > 0 ? EC.sketchFieldLines(measured, { els: waterEls, V0: state.V0, nSeeds: 9 }) : [], nMeasured: nMeasured, curves: curves };
    return A.sketch;
  }

  // ---------------------------------------------------------------------
  // 電表
  // ---------------------------------------------------------------------
  function n1Pos() {
    if (state.clip) { const c = elCenter(negEl()); return { x: c.x, y: c.y }; }
    return state.n1;
  }
  /** 目前的電表讀數：{ dV（真值）, reading（以 V 表示，含誤差與取捨）, text, I（檢流計，A）} */
  function meterNow() {
    const p1 = n1Pos(), p2 = state.n2;
    const V1 = probePotAt(p1.x, p1.y), V2 = probePotAt(p2.x, p2.y), dV = V2 - V1;
    if (state.meter !== 'galv') {
      const r0 = EC.dmmReading(state.ac ? Math.abs(dV) : dV, state.noise ? { offset: state.offset, jitter: state.jitter } : null);
      const r = state.ac ? Math.max(0, r0) : r0;
      return { V1: V1, V2: V2, dV: dV, reading: r, text: fmtSigned(r, 2) + ' V', unit: 'V' };
    }
    const I = EC.galvCurrent(dV, state.noise ? { jitterI: state.jitterI } : null);
    let uA = Math.round(I * 1e7) / 10;
    if (Math.abs(uA) < 0.05) uA = 0;
    const over = Math.abs(I) > EC.GALV_FS;
    return { V1: V1, V2: V2, dV: dV, I: I, uA: uA, over: over, reading: uA * 1e-6 * EC.GALV_R,
      text: (over ? (I > 0 ? '> +50' : '< −50') : fmtSigned(uA, 1)) + ' μA', unit: 'μA' };
  }
  function fmt(x, d) { return (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d); }
  function fmtSigned(x, d) { const s = fmt(x, d); return s.charAt(0) === '-' ? '−' + s.slice(1) : (+s > 0 ? '+' + s : s); }
  function minus(s) { return String(s).replace(/^-/, '−'); }

  // ---------------------------------------------------------------------
  // 色彩
  // ---------------------------------------------------------------------
  function midInk() { return LD.mix(LD.c.text, LD.c['canvas-bg'], 0.3); }
  /** 電位 → 顏色（低：藍、中：中性、高：紅；亮度對稱的發散色階） */
  function potColor(V) {
    const V0 = state.V0 || 1;
    const u = Math.max(0, Math.min(1, V / V0));
    return u < 0.5 ? LD.mix(LD.c.neg, midInk(), u * 2) : LD.mix(midInk(), LD.c.pos, (u - 0.5) * 2);
  }
  function paperColor() { return LD.dark ? LD.mix(LD.c['canvas-bg'], LD.c.text, 0.075) : LD.mix(LD.c['canvas-bg'], LD.c.text, 0.025); }

  // ---------------------------------------------------------------------
  // 版面
  // ---------------------------------------------------------------------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const G = { w: 0, h: 0, s: 10, bx: 0, by: 0, band: 100, dpr: 1 };
  function layout() {
    const w = cv.clientWidth || 600;
    const small = innerWidth < 1240;
    const learning = document.documentElement.classList.contains('eq-study');
    const mL = small ? 8 : 20, mR = small ? 8 : 12;
    const band = small ? 68 : learning ? 76 : 110;
    const maxS = learning && !small ? Math.max(20,(innerHeight-220-band-34)/SH) : 28;
    const scale = Math.min(maxS,(w-mL-mR)/SW);
    const bw = scale*SW, bh = scale*SH, h = Math.round(band+10+bh+28);
    G.w=w;G.h=h;G.s=scale;G.band=band;
    G.bx=Math.round(mL+(w-mL-mR-bw)/2);G.by=band+10;
    G.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (cv.style.height !== h + 'px') cv.style.height = h + 'px';
    const W = Math.round(w * G.dpr), H = Math.round(h * G.dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  function smallTicks() { return innerWidth < 1240; }
  function X(x) { return G.bx + x * G.s; }
  function Y(y) { return G.by + (SH - y) * G.s; }
  function wx(px) { return (px - G.bx) / G.s; }
  function wy(py) { return SH - (py - G.by) / G.s; }

  // ---------------------------------------------------------------------
  // 靜態圖層（背景、紙、方格、色階、計算的等位線與電流線、電極）
  // ---------------------------------------------------------------------
  const stat = document.createElement('canvas');
  let statKey = '';
  let staticLabels=[],labelQueue=[],labelBoxes=[];
  function derived(name, fn) {
    const s = getSol();
    if (!(name in s.derived)) s.derived[name] = fn(s);
    return s.derived[name];
  }
  function heatImage() {
    return derived('heat', function (s) {
      const c = document.createElement('canvas');
      c.width = s.nx; c.height = s.ny;
      return { cv: c, ver: -1 };
    });
  }
  function drawStatic() {
    const key = [G.w, G.h, G.dpr, LD.ver, getSol().key, state.medium, voltage().negative, V0eff(), state.showTheory, state.showStream, state.showHeat, state.V0, window.EquipotentialStudy?.theoryFractions].join('|');
    if (key === statKey) return;
    statKey = key;staticLabels=[];
    stat.width = cv.width; stat.height = cv.height;
    const g = stat.getContext('2d');
    g.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    LD.backdrop(g, G.w, G.h);
    const x0 = X(0), y0 = Y(SH), x1 = X(SW), y1 = Y(0);
    // 實驗桌上的紙：柔和投影＋紙面
    g.save();
    g.shadowColor = LD.dark ? 'rgba(0,0,0,0.55)' : LD.alpha(LD.c.text, 0.22);
    g.shadowBlur = 12; g.shadowOffsetY = 3;
    g.fillStyle = paperColor();
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.restore();
    if (state.medium === 'water') drawTray(g, x0, y0, x1 - x0, y1 - y0);
    // 電位色階
    if (state.showHeat && V0eff() > 0) {
      const s = getSol(), hi = heatImage();
      if (hi.ver !== LD.ver) {
        const c2 = hi.cv.getContext('2d'), img = c2.createImageData(s.nx, s.ny);
        const neg = LD.rgb(LD.c.neg), pos = LD.rgb(LD.c.pos), mid = LD.rgb(midInk());
        for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
          const u = s.V[j * s.nx + i];
          const a = u < 0.5 ? neg : mid, b = u < 0.5 ? mid : pos, t = u < 0.5 ? u * 2 : (u - 0.5) * 2;
          const o = ((s.ny - 1 - j) * s.nx + i) * 4;
          img.data[o] = a[0] + (b[0] - a[0]) * t; img.data[o + 1] = a[1] + (b[1] - a[1]) * t; img.data[o + 2] = a[2] + (b[2] - a[2]) * t;
          img.data[o + 3] = 255;
        }
        c2.putImageData(img, 0, 0);
        hi.ver = LD.ver;
      }
      g.save();
      g.globalAlpha = LD.dark ? 0.38 : 0.3;
      g.imageSmoothingEnabled = true;
      g.drawImage(hi.cv, x0, y0, x1 - x0, y1 - y0);
      g.restore();
    }
    // 方格：1 cm 主格、0.5 cm 次格；每 5 cm 一條較深的線
    LD.grid(g, x0, y0, x1, y1, G.s, G.s >= 14 ? G.s / 5 : G.s / 2, x0, y1);
    g.beginPath();
    for (let x = 0; x <= SW; x += 5) { const px = Math.round(X(x) * G.dpr) / G.dpr + 0.5 / G.dpr; g.moveTo(px, y0); g.lineTo(px, y1); }
    for (let y = 0; y <= SH; y += 5) { const py = Math.round(Y(y) * G.dpr) / G.dpr + 0.5 / G.dpr; g.moveTo(x0, py); g.lineTo(x1, py); }
    g.strokeStyle = LD.alpha(LD.c.text, LD.dark ? 0.17 : 0.15);
    g.lineWidth = 1 / G.dpr;
    g.stroke();
    g.strokeStyle = LD.alpha(LD.c.text, 0.3);
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    // 刻度數字（cm）
    g.font = '12.5px ' + FF;
    // 水槽的盤緣壓在刻度數字下面：改用正文色並加一圈底色描邊，數字才不會被盤緣淡化（11/16 主串審稿）
    const onRim = state.medium === 'water';
    g.fillStyle = onRim ? LD.c.text : LD.c.muted;
    g.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.92); g.lineWidth = 3; g.lineJoin = 'round';
    const label = function (t, x, y) { if (onRim) g.strokeText(t, x, y); g.fillText(t, x, y); };
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let x = 0; x <= SW; x += 5) label(String(x), X(x), y1 + 4);
    g.textAlign = smallTicks() ? 'left' : 'right'; g.textBaseline = 'middle';
    for (let y = 5; y <= SH; y += 5) label(String(y), x0 - 4, Y(y));   // 0 只標在 x 軸
    g.textAlign = 'right'; g.textBaseline = 'top';
    label('cm', x0 - 8, y1 + 4);
    // 計算的電流線（＝電力線）
    if (state.showStream && V0eff() > 0) {
      const lines = derived('stream', function (s) { return EC.streamlines(s, 14); });
      g.save();
      g.setLineDash([6, 4]);
      g.lineCap = 'round'; g.lineJoin = 'round';
      lines.forEach(function (l) {
        g.beginPath();
        l.pts.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); });
        g.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.7); g.lineWidth = 3.2; g.stroke();
        g.strokeStyle = LD.alpha(LD.c.accent, 0.85); g.lineWidth = 1.4; g.stroke();
      });
      g.restore();
      lines.forEach(function (l) { arrowOnPath(g, l.pts, 0.5, LD.c.accent, 6); });
    }
    // 計算的等位線（每 1 V）
    if (state.showTheory && V0eff() > 0) {
      const vm = voltage(), levels = [];
      const fractions=window.EquipotentialStudy?.theoryFractions;
      if(fractions)fractions.forEach(function(f){levels.push(vm.negative+f*vm.bulk);});else for (let v = 1; v < vm.positive - 1e-9; v += 1) if (v > vm.negative) levels.push(v);
      const cs = derived('contours' + vm.bulk + ':' + vm.negative + ':' + levels.join(','), function (s) { return levels.map(function (v) { return { v: v, lines: EC.contour(s, (v - vm.negative) / vm.bulk) }; }); });
      g.save();
      g.setLineDash([2, 4]);
      g.lineCap = 'round';
      cs.forEach(function (c) {
        c.lines.forEach(function (l) {
          g.beginPath();
          l.pts.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); });
          g.strokeStyle = LD.c.equi; g.lineWidth = 1.6; g.stroke();
        });
      });
      g.restore();
      // 標籤：每一級放在最長那條線上靠上方的一點
      cs.forEach(function (c) {
        let best = null;
        c.lines.forEach(function (l) { if (!best || l.pts.length > best.pts.length) best = l; });
        if (!best) return;
        let p = best.pts[0];
        best.pts.forEach(function (q) { if (q[1] > p[1]) p = q; });
        const py = Math.max(Y(p[1]) + 13, Y(SH) + 15);
        staticLabels.push({text:c.v+' V',col:LD.c.equi,anchor:[X(p[0]),Y(p[1])],cands:[[X(p[0]),py]],priority:10});
      });
    }
    // 電極（銀色、外圈標正負）
    els().forEach(function (e) { drawElectrode(g, e); });
  }
  function drawElectrode(g, e) {
    const silver = state.medium === 'water' ? copperInk() : LD.mix(LD.c.surface, LD.c.text, LD.dark ? 0.45 : 0.28);
    const rim = e.sign > 0 ? LD.c.pos : LD.c.neg;
    if (e.kind === 'circle') {
      const cx = X(e.x), cy = Y(e.y), r = e.r * G.s;
      if (state.medium === 'water') {
        const shadow = g.createRadialGradient(cx, cy + 3, r * 0.3, cx, cy + 3, r * 1.65);
        shadow.addColorStop(0, LD.shadowInk(0.44)); shadow.addColorStop(1, LD.shadowInk(0));
        g.fillStyle = shadow; g.beginPath(); g.ellipse(cx, cy + 3, r * 1.65, r * 1.12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = LD.shade(silver, -0.48); g.beginPath(); g.arc(cx, cy + 3, r, 0, Math.PI * 2); g.fill();
      }
      g.save();
      g.shadowColor = LD.dark ? 'rgba(0,0,0,0.5)' : LD.alpha(LD.c.text, 0.25);
      g.shadowBlur = 5; g.shadowOffsetY = 1.5;
      const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
      gr.addColorStop(0, LD.shade(silver, 0.7));
      gr.addColorStop(0.5, silver);
      gr.addColorStop(1, LD.shade(silver, -0.3));
      g.fillStyle = gr;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.restore();
      g.strokeStyle = state.medium === 'water' ? LD.shade(silver, 0.65) : rim; g.lineWidth = state.medium === 'water' ? 1.2 : Math.max(1.5, Math.min(3, r * 0.25));
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      if (state.medium === 'water') {
        g.strokeStyle = LD.alpha(LD.shade(silver, 0.88), 0.92); g.lineWidth = 1.5;
        g.beginPath(); g.arc(cx, cy, Math.max(1, r - 1.8), Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      }
      signText(g, e.sign, cx, cy, r);
    } else {
      const x = X(e.x0), y = Y(e.y1), w = (e.x1 - e.x0) * G.s, h = (e.y1 - e.y0) * G.s;
      g.save();
      g.shadowColor = LD.dark ? 'rgba(0,0,0,0.5)' : LD.alpha(LD.c.text, 0.25);
      g.shadowBlur = 5; g.shadowOffsetX = 1;
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, LD.shade(silver, -0.15));
      gr.addColorStop(0.4, LD.shade(silver, 0.55));
      gr.addColorStop(1, LD.shade(silver, -0.25));
      g.fillStyle = gr;
      g.fillRect(x, y, w, h);
      g.restore();
      g.strokeStyle = rim; g.lineWidth = 1.6;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // 端子及紅黑導線已標極性，長條旁不再加重複的正負記號。
    }
  }
  function signText(g, sign, x, y, r) {
    const fs = Math.max(11, Math.min(16, r * 1.3));
    LD.haloText(g, sign > 0 ? '+' : '−', x, y + 0.5, sign > 0 ? LD.c.pos : LD.c.neg, 'center', 'middle', '700 ' + fs.toFixed(1) + 'px ' + FF);
  }

  /** 淺盤的內緣就是求解邊界；厚壁與高光畫在外側，不改變量測比例。 */
  function drawTray(g, x, y, w, h) {
    const aqua = waterInk();
    g.save();
    LD.roundRect(g, x - 6, y - 3, w + 12, h + 14, 9);
    g.fillStyle = LD.alpha(LD.shade(aqua, -0.35), 0.8); g.fill();
    LD.roundRect(g, x - 6, y - 6, w + 12, h + 12, 9);
    const rim = g.createLinearGradient(x, y - 6, x + w, y + h + 10);
    rim.addColorStop(0, LD.alpha(LD.shade(aqua, 0.85), 0.8));
    rim.addColorStop(0.45, LD.alpha(aqua, 0.28));
    rim.addColorStop(1, LD.alpha(aqua, 0.75));
    g.fillStyle = rim; g.fill();
    g.strokeStyle = LD.alpha(LD.shade(aqua, 0.8), 0.65); g.lineWidth = 1.4; g.stroke();
    // 厚壁只留在邊緣；內側重新露出墊紙，避免整盤被盤緣底色染深。
    g.fillStyle = LD.mix(paperColor(), aqua, LD.dark ? 0.30 : 0.22); g.fillRect(x, y, w, h);
    g.strokeStyle = LD.alpha(LD.shade(aqua, -0.25), 0.7); g.lineWidth = 2; g.strokeRect(x, y, w, h);
    g.strokeStyle = LD.alpha(LD.shade(aqua, 0.95), 0.76); g.lineWidth = 1.3; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    g.beginPath(); g.moveTo(x + 8, y - 3); g.lineTo(x + w - 8, y - 3);
    g.moveTo(x + 3, y + 7); g.lineTo(x + 3, y + h - 7);
    g.strokeStyle = LD.alpha(LD.shade(aqua, 0.9), 0.8); g.lineWidth = 1; g.stroke();
    g.restore();
  }
  function waterInk() { return LD.mix(LD.c.neg, LD.c.probe, 0.52); }
  function copperInk() { return LD.mix(LD.c.pos, LD.c.equi, 0.55); }
  /** 在折線上 frac 的位置畫一個小箭頭 */
  function arrowOnPath(g, pts, frac, color, size) {
    if (pts.length < 3) return;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + d >= L * frac && d > 0) {
        const t = (L * frac - acc) / d;
        const px = X(pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0])), py = Y(pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]));
        const ux = (X(pts[i][0]) - X(pts[i - 1][0])), uy = (Y(pts[i][1]) - Y(pts[i - 1][1])), n = Math.hypot(ux, uy) || 1;
        const ax = ux / n, ay = uy / n;
        g.save();
        g.beginPath();
        g.moveTo(px + ax * size, py + ay * size);
        g.lineTo(px - ax * size * 0.7 - ay * size * 0.62, py - ay * size * 0.7 + ax * size * 0.62);
        g.lineTo(px - ax * size * 0.35, py - ay * size * 0.35);
        g.lineTo(px - ax * size * 0.7 + ay * size * 0.62, py - ay * size * 0.7 - ax * size * 0.62);
        g.closePath();
        g.lineJoin = 'round';
        g.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.8); g.lineWidth = 2.5; g.stroke();
        g.fillStyle = color; g.fill();
        g.restore();
        return;
      }
      acc += d;
    }
  }

  // ---------------------------------------------------------------------
  // 動態圖層
  // ---------------------------------------------------------------------
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }
  function draw() {
    if (stage.classList.contains('is3d')) { if (view3) view3.update(); return; }
    layout();
    if (window.EquipotentialStudy && window.EquipotentialStudy.drawIntro(ctx, G)) return;
    drawStatic();labelQueue=staticLabels.slice();labelBoxes=[];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(stat, 0, 0);
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    if (state.medium === 'water') drawWater();
    const A = analysis();
    // 學生畫的電力線（在等位線下面）
    if (state.drawField) {
      const sk = sketch();
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      sk.lines.forEach(function (l) {
        ctx.beginPath();
        l.forEach(function (p, i) { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); });
        ctx.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.75); ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = LD.c.field; ctx.lineWidth = 1.7; ctx.stroke();
      });
      ctx.restore();
      sk.lines.forEach(function (l) { arrowOnPath(ctx, l, 0.27, LD.c.field, 6.5); arrowOnPath(ctx, l, 0.73, LD.c.field, 6.5); });
    }
    // 量到的等位線
    if (state.drawLines) {
      A.groups.forEach(function (g) {
        if (!g.path || g.pts.length < 2) return;
        const col = potColor(g.V);
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        g.path.forEach(function (p, i) { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); });
        ctx.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.8); ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.restore();
      });
    }
    // 記錄點與線的名稱
    const sh = sheet();
    const placed = ['n1', 'n2'].map(function (id) {
      const p = probeGeom(id);
      return { x0: Math.min(p.tx - 16, p.hx - 8), x1: Math.max(p.tx + 28, p.hx + 8), y0: Math.min(p.ty - 18, p.hy - 8), y1: p.ty + 28 };
    });   // 先替探針握把與標牌保留空間，再放線名。
    A.groups.forEach(function (g) {
      const col = potColor(g.V);
      g.idx.forEach(function (i) {
        const r = sh.recs[i]; if(r.given)return; const px = X(r.x), py = Y(r.y), k = 4;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px - k, py - k); ctx.lineTo(px + k, py + k); ctx.moveTo(px + k, py - k); ctx.lineTo(px - k, py + k);
        ctx.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.85); ctx.lineWidth = 4.5; ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        if (i === sh.recs.length - 1) { ctx.strokeStyle = LD.alpha(col, 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px, py, 7.5, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      });
      if (g.pts.length >= 2 || state.drawLines) {
        // 線名＋電位（畫面窄時只寫線名），先試最上方那一點的上方，擋到別的標籤就換位置
        let top = g.pts[0], bot = g.pts[0];
        g.pts.forEach(function (p) { if (p[1] > top[1]) top = p; if (p[1] < bot[1]) bot = p; });
        const given = g.idx.every(function(i){return sh.recs[i].given;});
        const text = given ? fmt(g.V, 2)+' V' : G.s < 16 ? g.name : g.name + ' ' + fmt(g.V, 2) + ' V';
        placeLabel(placed, text, col, [[X(top[0]) - 28, Y(top[1]) - 8], [X(top[0]) + 28, Y(top[1]) - 8], [X(bot[0]) - 28, Y(bot[1]) + 23], [X(top[0]), Y(top[1]) - 27], [X(bot[0]), Y(bot[1]) + 42]],[X(top[0]),Y(top[1])]);
      }
    });
    // 電場估算
    drawWires();
    drawProbe('n1');
    drawProbe('n2');
    drawKeyFocus();
    if (sh.est) drawEstimate(sh.est);   // 估算結果畫在探針上面，不被握把擋住
    drawBand();
    if (window.EquipotentialStudy) window.EquipotentialStudy.drawOverlay(ctx, { X: X, Y: Y, w: G.w, h: G.h });
    paintLabels();
    if (!state.power) {
      LD.pill(ctx, T('電源未接通', 'Supply off'), X(SW / 2), Y(SH) + 22, LD.c.muted, 'center', '600 12px ' + FF);
    }
  }
  /** 標牌先統一排位，再畫在場線上方；不移動任何物理座標。 */
  function placeLabel(placed,text,col,cands,anchor){labelQueue.push({text,col,cands,anchor:anchor||cands[0],priority:20});}
  function queuePointLabel(text,x,y,col,sub){const px=X(x),py=Y(y);labelQueue.push({text,col,sub,anchor:[px,py],priority:sub?100:80,cands:[[px+30,py+28],[px-32,py-15],[px+35,py-18],[px-40,py+30],[px,py-42],[px,py+52]]});}
  function paintLabels(){
    const bodies=['n1','n2'].map(id=>{const p=probeGeom(id);return {x0:Math.min(p.tx,p.hx)-7,x1:Math.max(p.tx,p.hx)+7,y0:Math.min(p.ty,p.hy)-7,y1:Math.max(p.ty,p.hy)+7};});
    if(smallTicks())bodies.push({x0:X(0),x1:X(0)+24,y0:Y(SH)-4,y1:Y(0)+4});
    const overlaps=(a,b)=>Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));
    labelQueue.sort((a,b)=>b.priority-a.priority).forEach(item=>{const fs=item.sub?16:13.5,font='700 '+fs+'px '+FF;ctx.font=font;const metric=ctx.measureText(item.text),w=metric.width+16,h=Math.max(25,(metric.actualBoundingBoxAscent||fs)+9);const at=item.anchor||item.cands[0],cands=item.cands.slice();
      for(const r of [45,70,105,145])for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]])cands.push([at[0]+r*dx,at[1]+r*dy]);
      const boxes=cands.map(c=>{const x=Math.max(X(0)+w/2+3,Math.min(X(SW)-w/2-3,c[0])),y=Math.max(Y(SH)+h+3,Math.min(Y(0)-3,c[1]));return {x0:x-w/2,y0:y-h,x1:x+w/2,y1:y,x,y};});
      const all=labelBoxes.concat(bodies);let best=boxes[0],score=Infinity;for(const box of boxes){const penalty=all.reduce((v,b)=>v+overlaps(box,b),0);if(penalty<score){best=box;score=penalty;}if(!penalty)break;}
      labelBoxes.push(Object.assign({text:item.text},best));ctx.save();ctx.strokeStyle=LD.alpha(item.col,.65);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(at[0],at[1]);ctx.lineTo(best.x,best.y-h/2);ctx.stroke();LD.roundRect(ctx,best.x0,best.y0,w,h,6);ctx.fillStyle=LD.c['canvas-bg'];ctx.fill();ctx.strokeStyle=LD.alpha(item.col,.5);ctx.stroke();
      ctx.fillStyle=item.col;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=font;if(item.sub){const main=ctx.measureText('N').width;ctx.textAlign='left';ctx.fillText('N',best.x-main/2-3,best.y-h/2);ctx.font='700 11.5px '+FF;ctx.fillText(item.sub,best.x+main/2-3,best.y-h/2+5);}else ctx.fillText(item.text,best.x,best.y-h/2);ctx.restore();
    });
  }
  function drawEstimate(e) {
    const ax = X(e.a[0]), ay = Y(e.a[1]), bx = X(e.b[0]), by = Y(e.b[1]);
    const col = LD.c.probe;
    ctx.save();
    ctx.lineCap = 'round';
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 5, ny = dx / L * 5;
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.moveTo(ax - nx, ay - ny); ctx.lineTo(ax + nx, ay + ny);
    ctx.moveTo(bx - nx, by - ny); ctx.lineTo(bx + nx, by + ny);
    ctx.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.85); ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const txt = 'Δd ' + e.dd.toFixed(2) + ' cm ・ E ≈ ' + e.E.toFixed(3) + ' V/cm';
    ctx.font = '600 11px ' + FF;
    const w = ctx.measureText(txt).width + 12;
    const px = Math.min(Math.max(mx, X(0) + w / 2 + 2), X(SW) - w / 2 - 2);
    // 標籤放在線段下方（紅探針的握把朝右上），太靠近紙的下緣時改放上方
    const py = my + 40 > Y(0) - 2 ? my - 12 : my + 40;
    LD.pill(ctx, txt, px, py, col, 'center', '600 11px ' + FF);
  }

  // 探針的畫法：針尖在 (x, y)，握把往右上（N2）或左上（N1）斜出去
  function probeGeom(id) {
    const p = id === 'n1' ? n1Pos() : state.n2;
    const tx = X(p.x), ty = Y(p.y);
    const ang = id === 'n1' ? -2.2 : -0.95;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const Lh = Math.max(26, Math.min(40, G.s * 1.6));
    return { tx: tx, ty: ty, ux: ux, uy: uy, hx: tx + ux * (Lh + 8), hy: ty + uy * (Lh + 8), L: Lh };
  }
  let hover = null;
  function drawProbe(id) {
    const g = probeGeom(id);
    const col = id === 'n2' ? LD.c.pos : (LD.dark ? LD.mix(LD.c.field, LD.c.muted, 0.4) : LD.c.field);
    const sel = state.sel === id, hov = hover === id;
    // 接觸點的光暈
    ctx.save();
    if (sel || hov) {
      const rg = ctx.createRadialGradient(g.tx, g.ty, 0, g.tx, g.ty, 15);
      rg.addColorStop(0, LD.alpha(col, sel ? 0.35 : 0.22));
      rg.addColorStop(1, LD.alpha(col, 0));
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(g.tx, g.ty, 15, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // 針（金屬）
    const s1x = g.tx + g.ux * 2, s1y = g.ty + g.uy * 2, s2x = g.tx + g.ux * 9, s2y = g.ty + g.uy * 9;
    LD.tube(ctx, function (c) { c.moveTo(s1x, s1y); c.lineTo(s2x, s2y); }, LD.mix(LD.c.surface, LD.c.text, 0.4), 2.6);
    // 握把（下方投影＋管狀）
    const e1x = g.tx + g.ux * 9, e1y = g.ty + g.uy * 9, e2x = g.tx + g.ux * (g.L + 8), e2y = g.ty + g.uy * (g.L + 8);
    ctx.save();
    ctx.strokeStyle = LD.shadowInk(LD.dark ? 0.45 : 0.18);
    ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(e1x + 3, e1y + 5); ctx.lineTo(e2x + 3, e2y + 5); ctx.stroke();
    ctx.restore();
    LD.tube(ctx, function (c) { c.moveTo(e1x, e1y); c.lineTo(e2x, e2y); }, col, hov || sel ? 8.5 : 7.5);
    // 針尖
    ctx.fillStyle = LD.c.text;
    ctx.beginPath(); ctx.arc(g.tx, g.ty, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = LD.alpha(col, 0.9); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(g.tx, g.ty, 4.2, 0, Math.PI * 2); ctx.stroke();
    // 真正下標標牌和其他名稱一起避讓，保持針尖原座標。
    const p=id==='n1'?n1Pos():state.n2;
    queuePointLabel('N'+(id==='n1'?'1':'2'),p.x,p.y,col,id==='n1'?'1':'2');
  }
  function terminalPos(which) {
    const b = bandBoxes();
    if (which === 'sup+') return { x: b.sup.x + b.sup.w * 0.62, y: b.sup.y + b.sup.h - 9 };
    if (which === 'sup-') return { x: b.sup.x + b.sup.w * 0.84, y: b.sup.y + b.sup.h - 9 };
    if (which === 'com') return { x: b.met.x + b.met.w * 0.18, y: b.met.y + b.met.h - 9 };
    return { x: b.met.x + b.met.w * 0.4, y: b.met.y + b.met.h - 9 };
  }
  function elContact(e) {
    if (e.kind === 'circle') return { x: X(e.x), y: Y(e.y) };
    return { x: X((e.x0 + e.x1) / 2), y: Y(e.y1) + 3 };
  }
  /** 導線：從 (x0, y0) 沿方向 (u0x, u0y) 出發，沿方向 (u1x, u1y) 到達 (x1, y1)（柔軟下垂的三次曲線） */
  function wire(x0, y0, u0x, u0y, x1, y1, u1x, u1y, color, alpha, width) {
    const L = Math.hypot(x1 - x0, y1 - y0), k = Math.max(24, L * 0.42);
    ctx.save();
    ctx.globalAlpha = alpha;
    LD.tube(ctx, function (c) { c.moveTo(x0, y0); c.bezierCurveTo(x0 + u0x * k, y0 + u0y * k, x1 - u1x * k, y1 - u1y * k, x1, y1); }, color, width);
    ctx.restore();
  }
  /** 電源 → 電極：先沿著儀器與紙之間的空隙走到電極正上方，再垂直放下來接到電極（不在紙上斜斜穿過） */
  function supplyWire(t, c, color) {
    const ay = Y(SH) - 3;
    ctx.save();
    ctx.globalAlpha = 0.8;
    LD.tube(ctx, function (g) {
      g.moveTo(t.x, t.y);
      g.bezierCurveTo(t.x, ay, t.x + (c.x - t.x) * 0.15, ay, (t.x + c.x) / 2, ay);
      g.bezierCurveTo(c.x - (c.x - t.x) * 0.15, ay, c.x, ay, c.x, ay + 8);
      g.lineTo(c.x, c.y);
    }, color, 3);
    ctx.restore();
  }
  function wireInk() { return LD.dark ? LD.mix(LD.c.field, LD.c.muted, 0.5) : LD.mix(LD.c.field, LD.c.text, 0.3); }
  function drawWires() {
    const pe = posEl(), ne = negEl();
    const sp = terminalPos('sup+'), sn = terminalPos('sup-');
    const cp = elContact(pe), cn = elContact(ne);
    const blk = wireInk();
    // 電源 → 電極：從端子往下，由上方接到電極
    supplyWire(sp, cp, LD.c.pos);
    supplyWire(sn, cn, blk);
    [cp, cn].forEach(function (c, i) { LD.ball(ctx, c.x, c.y, 3.6, i ? blk : LD.c.pos, { glow: 0 }); });
    // 探針 → 電表：沿握把方向出去，再往上接到端子
    const g1 = probeGeom('n1'), g2 = probeGeom('n2');
    const tc = terminalPos('com'), tv = terminalPos('v');
    wire(g1.hx, g1.hy, g1.ux, g1.uy, tc.x, tc.y, 0, -1, blk, 0.62, 2.6);
    wire(g2.hx, g2.hy, g2.ux, g2.uy, tv.x, tv.y, 0, -1, LD.c.pos, 0.62, 2.6);
  }

  // ---------------------------------------------------------------------
  // 上方的儀器：電源供應器與電表
  // ---------------------------------------------------------------------
  function bandBoxes() {
    const bw = Math.min(200, Math.max(120, G.w * 0.36)), bh = G.band - 14;
    return { sup: { x: 8, y: 6, w: bw, h: bh }, met: { x: G.w - 8 - bw, y: 6, w: bw, h: bh } };
  }
  function lcd(x, y, w, h, text, unit, on) {
    const bg = LD.dark ? LD.shade(LD.c['canvas-bg'], -0.45) : LD.mix(LD.c.text, '#000000', 0.25);
    LD.roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = LD.alpha(LD.c.text, 0.25); ctx.lineWidth = 1; ctx.stroke();
    if (!on) return;
    const digit = LD.shade(LD.c.probe, LD.dark ? 0.25 : 0.45);
    const fs = Math.max(12, Math.min(22, h * 0.62));
    ctx.save();
    ctx.shadowColor = LD.alpha(digit, 0.6); ctx.shadowBlur = 6;
    ctx.fillStyle = digit;
    ctx.font = '700 ' + fs.toFixed(1) + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const uw = unit ? Math.max(14, fs * 0.9) : 0;
    ctx.fillText(text, x + w - 6 - uw, y + h / 2 + 1);
    if (unit) { ctx.font = '600 ' + (fs * 0.55).toFixed(1) + 'px ' + FF; ctx.textAlign = 'left'; ctx.fillText(unit, x + w - uw - 2, y + h / 2 + 2); }
    ctx.restore();
  }
  function post(x, y, color, label) {
    LD.ball(ctx, x, y, 5, color, { glow: 0 });
    if (label) LD.haloText(ctx, label, x, y + (G.band < 80 ? 14 : -10), LD.c.muted, 'center', 'alphabetic', '600 9.5px ' + FF);
  }
  function drawBand() {
    const b = bandBoxes();
    const body = LD.mix(LD.c.surface, LD.c.text, LD.dark ? 0.12 : 0.08);
    const blk = LD.dark ? LD.mix(LD.c.field, LD.c.muted, 0.5) : LD.mix(LD.c.field, LD.c.text, 0.3);
    // 電源供應器
    const s = b.sup;
    LD.block(ctx, s.x, s.y, s.w, s.h, body, { r: 7 });
    LD.haloText(ctx, state.ac ? T('交流 1 kHz', 'AC 1 kHz') : T('直流電源', 'DC supply'), s.x + 8, s.y + 14, LD.c.muted, 'left', 'alphabetic', '600 10.5px ' + FF);
    const on = state.power;
    // 電源指示燈
    const led = on ? LD.c.probe : LD.mix(LD.c.muted, LD.c.surface, 0.4);
    if (on) { const rg = ctx.createRadialGradient(s.x + s.w - 12, s.y + 11, 0, s.x + s.w - 12, s.y + 11, 9); rg.addColorStop(0, LD.alpha(led, 0.55)); rg.addColorStop(1, LD.alpha(led, 0)); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(s.x + s.w - 12, s.y + 11, 9, 0, Math.PI * 2); ctx.fill(); }
    LD.ball(ctx, s.x + s.w - 12, s.y + 11, 3.5, led, { glow: 0, shadow: false });
    const lh = Math.max(20, Math.min(32, s.h * 0.34));
    lcd(s.x + 8, s.y + 20, s.w - 16, lh, state.V0.toFixed(1), 'V', on);
    if (on && s.h > 100) {
      const I = supplyCurrent() * 1000;
      LD.haloText(ctx, 'I = ' + I.toFixed(2) + ' mA', s.x + 8, s.y + 20 + lh + 13, LD.c.muted, 'left', 'alphabetic', '600 10.5px ' + FF);
    }
    const tp = terminalPos('sup+'), tn = terminalPos('sup-');
    post(tp.x, tp.y, LD.c.pos, '+');
    post(tn.x, tn.y, blk, '−');
    // 電表
    const m = b.met;
    if (state.meter === 'phone') { drawHeadphones(m); return; }
    const mBody = state.meter === 'dmm' ? LD.mix(LD.c.equi, LD.c.surface, LD.dark ? 0.55 : 0.45) : body;
    LD.block(ctx, m.x, m.y, m.w, m.h, mBody, { r: 7 });
    const mn = meterNow();
    if (state.meter === 'dmm') {
      LD.haloText(ctx, state.ac ? T('三用電表 ACV', 'Multimeter ACV') : T('三用電表 DCV', 'Multimeter DCV'), m.x + 8, m.y + 14, LD.c.text, 'left', 'alphabetic', '600 10.5px ' + FF);
      const shown = mn.reading;
      lcd(m.x + 8, m.y + 20, m.w - 16, lh, fmtSigned(shown, 2).replace('+', ''), 'V', true);
    } else {
      LD.haloText(ctx, T('檢流計 μA', 'Galvanometer μA'), m.x + 8, m.y + 14, LD.c.text, 'left', 'alphabetic', '600 10.5px ' + FF);
      drawGalv(m.x + 8, m.y + 18, m.w - 16, m.h - 40);
    }
    const tc = terminalPos('com'), tv = terminalPos('v');
    post(tc.x, tc.y, blk, 'COM');
    post(tv.x, tv.y, LD.c.pos, state.meter === 'dmm' ? 'V' : '+');
    // 中間的說明
    const midL = s.x + s.w + 8, midR = m.x - 8;
    if (midR - midL > 70) {
      const name = state.type === 'circles' ? T('兩圓形電極', 'Two circles') : state.type === 'bars' ? T('平行長條電極', 'Parallel bars') : T('長條與圓形', 'Bar and circle');
      LD.haloText(ctx, name, (midL + midR) / 2, G.band * 0.42, LD.c.text, 'center', 'middle', '600 12px ' + FF);
      LD.haloText(ctx, (state.noise ? T('含誤差', 'with errors') : T('理想', 'ideal')), (midL + midR) / 2, G.band * 0.42 + 16, LD.c.muted, 'center', 'middle', '11px ' + FF);
    }
  }
  function drawGalv(x, y, w, h) {
    LD.roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = LD.mix(LD.c.surface, LD.c['canvas-bg'], 0.5); ctx.fill();
    ctx.strokeStyle = LD.alpha(LD.c.text, 0.25); ctx.lineWidth = 1; ctx.stroke();
    const cx = x + w / 2, cy = y + h - 3, R = Math.min(w * 0.46, h - 6);
    const A = 0.75; // 半刻度角（rad）
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = -10; k <= 10; k++) {
      const a = -Math.PI / 2 + A * k / 10, big = k % 5 === 0;
      const r1 = R * (big ? 0.78 : 0.86), r2 = R * 0.95;
      ctx.beginPath(); ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a));
      ctx.strokeStyle = k === 0 ? LD.c.probe : LD.alpha(LD.c.text, big ? 0.7 : 0.4); ctx.lineWidth = big ? 1.4 : 1; ctx.stroke();
    }
    ctx.font = '9px ' + FF; ctx.fillStyle = LD.c.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [-50, 0, 50].forEach(function (v) { const a = -Math.PI / 2 + A * v / 50; ctx.fillText(minus(String(v)), cx + R * 0.62 * Math.cos(a), cy + R * 0.62 * Math.sin(a)); });
    const a = -Math.PI / 2 + A * Math.max(-1.08, Math.min(1.08, state.needle));
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * 0.93 * Math.cos(a), cy + R * 0.93 * Math.sin(a));
    ctx.strokeStyle = LD.c.pos; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
    LD.ball(ctx, cx, cy, 3, LD.c.text, { glow: 0, shadow: false });
  }

  function phoneLevel() {
    const v = Math.abs(meterNow().dV);
    return !state.power || v <= 0.02 ? 0 : Math.min(1, Math.log1p((v - 0.02) / 0.02) / Math.log1p(state.V0 / 0.02));
  }
  function drawHeadphones(m) {
    const col = waterInk(), cx = m.x + m.w / 2, cy = m.y + m.h * 0.55, r = Math.min(27, m.h * 0.30);
    LD.haloText(ctx, T('耳機 · 1 kHz', 'Headphones · 1 kHz'), cx, m.y + 12, LD.c.text, 'center', 'middle', '600 11px ' + FF);
    LD.tube(ctx, function (g) { g.arc(cx, cy, r, Math.PI, 2 * Math.PI); }, col, 7);
    [-1, 1].forEach(function (sgn) {
      LD.block(ctx, cx + sgn * r - 6, cy - 7, 12, 23, LD.mix(col, LD.c.text, 0.3), { r: 5 });
    });
    const level = phoneLevel();
    if (level > 0) for (let i = 0; i < 3; i++) {
      const phase = reduced ? (i + 0.4) / 3 : (fxTime * 1.25 + i / 3) % 1;
      const rr = r + 5 + phase * (7 + level * 17);
      ctx.beginPath(); ctx.arc(cx, cy, rr, -0.55, 0.55);
      ctx.strokeStyle = LD.alpha(col, (1 - phase) * 0.85 * level); ctx.lineWidth = 1.4 + level; ctx.stroke();
    }
    LD.haloText(ctx, level ? T('音量', 'Level') + ' ' + Math.round(level * 100) + ' %' : T('零點 · 安靜', 'Null · quiet'), cx, m.y + m.h - 6, LD.c.text, 'center', 'middle', '600 13px ' + FF);
  }

  // 水面裝飾與氣泡採實際幀間隔；只在前景、實驗區可見時運作。
  let fxTime = 0, fxRaf = 0, fxLast = 0, bubbleAt = 0, benchVisible = true;
  const wakes = [];
  function addWake(p, force) {
    if (state.medium !== 'water') return;
    const last = wakes[wakes.length - 1];
    if (!force && last && fxTime - last.t < 0.045 && Math.hypot(last.x - p.x, last.y - p.y) < 0.35) return;
    if (reduced) wakes.length = 0;
    wakes.push({ x: p.x, y: p.y, t: fxTime }); if (wakes.length > 24) wakes.shift();
  }
  function bubblesOn() { return state.medium === 'water' && state.power && !state.ac && V0eff() > 1e-8; }
  function drawWater() {
    const aqua = waterInk();
    const time = reduced ? 0 : fxTime;
    ctx.save();
    ctx.beginPath(); ctx.rect(X(0), Y(SH), SW * G.s, SH * G.s); ctx.clip();
    // 焦散用少量長波紋疊出光網，透明度保持低，格線與記錄仍清楚。
    const glint = ctx.createLinearGradient(X(0), Y(SH), X(SW), Y(0));
    glint.addColorStop(0, LD.alpha(LD.shade(aqua, 0.9), 0));
    glint.addColorStop(0.34, LD.alpha(LD.shade(aqua, 0.9), 0));
    glint.addColorStop(0.47, LD.alpha(LD.shade(aqua, 0.95), LD.dark ? 0.14 : 0.25));
    glint.addColorStop(0.58, LD.alpha(LD.shade(aqua, 0.9), 0)); glint.addColorStop(1, LD.alpha(aqua, 0));
    ctx.fillStyle = glint; ctx.fillRect(X(0), Y(SH), SW * G.s, SH * G.s);
    ctx.lineWidth = 1.35;
    for (let j = 0; j < 11; j++) {
      ctx.beginPath();
      for (let x = 0; x <= SW; x += 0.7) {
        const y = (j + 0.5) * SH / 11 + 0.38 * Math.sin(x * 0.62 + time * 0.3 + j) + 0.23 * Math.sin(x * 1.4 - time * 0.2);
        if (!x) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
      }
      if (!LD.dark) { ctx.strokeStyle = LD.alpha(aqua, 0.17); ctx.lineWidth = 2.6; ctx.stroke(); }
      ctx.lineWidth = 1.35; ctx.strokeStyle = LD.alpha(LD.shade(aqua, 0.9), LD.dark ? 0.29 : 0.48); ctx.stroke();
      ctx.beginPath();
      for (let y = 0; y <= SH; y += 0.7) {
        const x = j * SW / 10 + 0.5 * Math.sin(y * 0.7 - time * 0.22 + j);
        if (!y) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
      }
      if (!LD.dark) { ctx.strokeStyle = LD.alpha(aqua, 0.09); ctx.lineWidth = 2.2; ctx.stroke(); }
      ctx.lineWidth = 1.35; ctx.strokeStyle = LD.alpha(LD.shade(aqua, 0.8), LD.dark ? 0.15 : 0.24); ctx.stroke();
    }
    els().forEach(function (e, index) {
      const c = elCenter(e), r = e.kind === 'circle' ? e.r * G.s + 2 : 5;
      ctx.strokeStyle = LD.alpha(LD.shade(aqua, 0.9), 0.72); ctx.lineWidth = 1.1;
      if (e.kind === 'circle') { ctx.beginPath(); ctx.ellipse(X(c.x), Y(c.y) + 1, r, r * 0.86, 0, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.strokeRect(X(e.x0) - 2, Y(e.y1) - 2, (e.x1 - e.x0) * G.s + 4, (e.y1 - e.y0) * G.s + 4); }
      if (!bubblesOn()) return;
      // 氣泡大小與數量隨畫面比例放大：電腦版（G.s 約 25 px/cm）不可小到看不見（11/16 主串審稿）
      const k = Math.max(1, Math.min(2.2, G.s / 11));
      const count = Math.round((e.sign < 0 ? 24 : 8) * Math.sqrt(k)), streams = e.sign < 0 ? 4 : 2;
      for (let i = 0; i < count; i++) {
        const stream = i % streams, age = (time * (0.43 + stream * 0.025) + Math.floor(i / streams) / (count / streams) + stream * 0.11 + index * 0.17) % 1;
        const a = (stream + 0.25) * Math.PI * 2 / streams;
        const bx = X(c.x) + (e.kind === 'circle' ? Math.cos(a) * e.r * G.s : (stream % 2 ? 1 : -1) * ((e.x1 - e.x0) * G.s / 2 + 1)) + Math.sin(age * 7 + stream) * 1.65;
        const originY = e.kind === 'circle' ? Y(c.y) - Math.sin(a) * e.r * G.s : Y(e.y0 + (stream + 0.5) * (e.y1 - e.y0) / streams);
        const by = originY - age * (24 + G.s * 3.6), rad = (0.75 + ((i * 0.37) % 1) * 1.25) * k;
        const alpha = age > 0.86 ? (1 - age) / 0.14 : 1;
        ctx.beginPath(); ctx.arc(bx, by, age > 0.95 ? Math.min(2, rad + (age - 0.95) * 18) : rad, 0, Math.PI * 2);
        ctx.fillStyle = LD.alpha(LD.shade(aqua, 0.75), alpha * (LD.dark ? 0.12 : 0.3)); ctx.fill();
        if (!LD.dark) { ctx.strokeStyle = LD.alpha(LD.shade(aqua, -0.6), alpha * 0.9); ctx.lineWidth = 1.2 * k; ctx.stroke(); }
        ctx.strokeStyle = LD.alpha(LD.shade(aqua, 0.98), alpha * 0.95); ctx.lineWidth = 0.75 * k; ctx.stroke();
        ctx.beginPath(); ctx.arc(bx - rad * 0.3, by - rad * 0.35, Math.max(0.32, rad * 0.25), 0, Math.PI * 2);
        ctx.fillStyle = LD.alpha(LD.shade(aqua, 1), alpha * 0.95); ctx.fill();
      }
    });
    wakes.forEach(function (p) {
      const age = reduced ? 0.18 : time - p.t;
      if (age >= 0.6) return;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.ellipse(X(p.x), Y(p.y), 3 + age * 25 + i * 4.5, 2 + age * 19 + i * 3.4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = LD.alpha(LD.shade(aqua, -0.55), 0.38 * (1 - age / 0.6)); ctx.lineWidth = 3.1; ctx.stroke();
        ctx.strokeStyle = LD.alpha(LD.shade(aqua, 0.98), (0.98 - i * 0.16) * (1 - age / 0.6)); ctx.lineWidth = 1.5; ctx.stroke();
      }
    });
    ctx.restore();
  }
  function effectsFrame(t) {
    fxRaf = 0;
    if (document.hidden || !benchVisible || state.medium !== 'water') { fxLast = 0; return; }
    fxTime += fxLast ? Math.min(1 / 30, (t - fxLast) / 1000) : 0;
    fxLast = t;
    while (!reduced && wakes.length && fxTime - wakes[0].t > 0.6) wakes.shift();
    if (!stage.classList.contains('is3d')) requestDraw();
    if (bubblesOn() && window.LabSound && LabSound.enabled() && t - bubbleAt > 470) {
      bubbleAt = t;
      LabSound.sweep({ from: 780 + (Math.sin(fxTime * 7) + 1) * 180, to: 1500, dur: 0.035, gain: 0.018 });
    }
    if (!reduced || (bubblesOn() && window.LabSound && LabSound.enabled())) fxRaf = requestAnimationFrame(effectsFrame);
    else fxLast = 0;
  }
  function syncEffects() {
    if (fxRaf) cancelAnimationFrame(fxRaf);
    fxRaf = 0; fxLast = 0;
    if (!document.hidden && benchVisible && state.medium === 'water') fxRaf = requestAnimationFrame(effectsFrame);
    syncPhone();
    if (view3) view3.update();
  }

  // ---------------------------------------------------------------------
  // 檢流計指針動畫、含誤差時電表跳動
  // ---------------------------------------------------------------------
  let animRaf = 0, lastT = 0;
  function needleTarget() {
    if (state.meter !== 'galv') return 0;
    const m = meterNow();
    return m.I / EC.GALV_FS;
  }
  function animate(t) {
    animRaf = 0;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    const target = needleTarget();
    const k = reduced ? 1 : 1 - Math.exp(-dt / 0.09);
    state.needle += (target - state.needle) * k;
    requestDraw();
    if (Math.abs(target - state.needle) > 0.002) animRaf = requestAnimationFrame(animate);
    else { state.needle = target; lastT = 0; }
  }
  function kickNeedle() { if (!animRaf && state.meter === 'galv') { lastT = 0; animRaf = requestAnimationFrame(animate); } }
  let jitterTimer = 0;
  function setJitter() {
    clearInterval(jitterTimer);
    jitterTimer = 0;
    state.jitter = 0; state.jitterI = 0;
    if (!state.noise || reduced) return;
    const r = EC.rng((Date.now() & 0xffff) + 7);
    jitterTimer = setInterval(function () {
      if (document.hidden) return;
      state.jitter = JITTER_V * EC.gauss(r);
      state.jitterI = JITTER_I * EC.gauss(r);
      updateReadouts();
      kickNeedle();
      requestDraw();
    }, 350);
  }

  // ---------------------------------------------------------------------
  // 操作：拖曳探針、點紙面、方向鍵
  // ---------------------------------------------------------------------
  const stage = $('stage');
  let drag = null, voice = null;
  function local(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function inBoard(p) { return p.x >= X(0) - 6 && p.x <= X(SW) + 6 && p.y >= Y(SH) - 6 && p.y <= Y(0) + 6; }
  function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function hitProbe(p) {
    // 夾在負極上的黑探針不會被誤觸拉走（要移動它，先選「黑探針 N1」）
    const order = state.sel === 'n1' ? ['n1', 'n2'] : state.clip ? ['n2'] : ['n2', 'n1'];
    for (let i = 0; i < order.length; i++) {
      const g = probeGeom(order[i]);
      if (Math.hypot(p.x - g.tx, p.y - g.ty) <= 22 || distSeg(p.x, p.y, g.tx, g.ty, g.hx, g.hy) <= 12) return order[i];
    }
    return null;
  }
  function clampP(x, y) { return { x: Math.min(SW, Math.max(0, x)), y: Math.min(SH, Math.max(0, y)) }; }
  function setProbe(id, x, y) {
    const p = clampP(x, y);
    if (id === 'n1') {
      if (state.clip) { state.clip = false; }
      state.n1 = p; state.n1Touched = true;
    } else state.n2 = p;
    addWake(p, false);
    probeMoved();
  }
  function probeMoved() {
    if(!studyApplying)dispatchEvent(new CustomEvent('eqp:probemove'));
    nullFeedback();
    updateReadouts();
    kickNeedle();
    updateVoice();
    syncPhone();
    requestDraw();
    if (view3) view3.update();
  }
  function select(id) {
    state.sel = id;
    document.querySelectorAll('[data-sel]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sel') === id)); });
    if (kb && kb.index() !== KB_IDS.indexOf(id)) kb.select(KB_IDS.indexOf(id));
    requestDraw();
    window.dispatchEvent(new Event('eqp:probeselect'));
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (stage.classList.contains('is3d')) return;
    const p = local(ev);
    let id = hitProbe(p);
    const grabbed = !!id;
    if (id) {
      select(id);
    } else if (inBoard(p)) {
      id = state.sel;
      setProbe(id, wx(p.x), wy(p.y));
    } else return;
    const cur = id === 'n1' ? n1Pos() : state.n2;
    addWake(cur, true); requestDraw();
    drag = { id: id, px: p.x, py: p.y, x: cur.x, y: cur.y, pid: ev.pointerId, grabbed: grabbed, moved: false };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    startVoice();
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = local(ev);
    if (drag && ev.pointerId === drag.pid) {
      const k = state.fine ? FINE : 1;
      if (Math.hypot(p.x - drag.px, p.y - drag.py) > 3) drag.moved = true;
      if (!drag.moved) return;
      setProbe(drag.id, drag.x + (p.x - drag.px) / G.s * k, drag.y - (p.y - drag.py) / G.s * k);
      return;
    }
    if (ev.pointerType === 'mouse') {
      const h = hitProbe(p);
      if (h !== hover) { hover = h; requestDraw(); }
      cv.style.cursor = h ? 'grab' : inBoard(p) ? 'crosshair' : 'default';
    }
  });
  function endDrag(ev) {
    if (!drag || (ev && ev.pointerId !== drag.pid)) return;
    const d = drag;
    drag = null;
    // 在探針附近「點一下」（沒有拖曳）：把探針移到點的位置（點在針尖上則不動）
    if (d.grabbed && !d.moved && ev && ev.type === 'pointerup') {
      const p = local(ev), g = probeGeom(d.id);
      const r = Math.hypot(p.x - g.tx, p.y - g.ty);
      if (inBoard(p) && r > 9 && r <= 22) setProbe(d.id, wx(p.x), wy(p.y));
    }
    stopVoice();
    emitProbe();
    srSay(probeDesc(d.id));
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (hover) { hover = null; requestDraw(); } });
  // ---- 鍵盤操作（js/keys.js）：Enter 切換探針、方向鍵 0.05 cm、Shift 0.5 cm、Alt 0.01 cm、R 記錄 ----
  // 走的路與方向鈕、拖曳相同（setProbe 的邊界限制、'probe' 任務事件）
  function probeName(id) { return id === 'n2' ? T('紅探針 N2', 'red probe N2') : T('黑探針 N1', 'black probe N1'); }
  function probeDesc(id) {
    const p = id === 'n1' ? n1Pos() : state.n2;
    let s = probeName(id) + (id === 'n1' && state.clip ? T('夾在負極', ' clipped to the negative electrode') : ' (' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + ') cm');
    s += state.power ? T('，電表讀數 ', ', meter reading ') + minus(meterNow().text) : T('，電源未接通', ', supply off');
    return s + T('。', '.');
  }
  function keyStep(id, dx, dy, step) {
    if (stage.classList.contains('is3d')) return false;
    if (state.sel !== id) select(id);
    const p = id === 'n1' ? n1Pos() : state.n2, clip0 = state.clip;
    nudge(dx * step, dy * step);
    const q = id === 'n1' ? n1Pos() : state.n2;
    return q.x !== p.x || q.y !== p.y || clip0 !== state.clip;
  }
  let srTimer = 0;
  /** 拖曳結束時把讀數念一次（螢幕閱讀器；不在每一格更新） */
  function srSay(text) {
    clearTimeout(srTimer);
    srTimer = setTimeout(function () { const el = $('srMeter'); if (el && el.textContent !== text) el.textContent = text; }, 450);
  }
  // Alt＋方向鍵的極小步與 R 記錄：要在 LabKeys 之前攔下
  cv.addEventListener('keydown', function (ev) {
    const k = ev.key;
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey) {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
      if (!d) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (keyStep(state.sel, d[0], d[1], NUDGE_FINE)) {
        if (kb) kb.say(probeDesc(state.sel));
        cv.dispatchEvent(new CustomEvent('lab:keymove', { bubbles: true, detail: { index: KB_IDS.indexOf(state.sel) } }));
      }
      return;
    }
    if ((k === 'r' || k === 'R') && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); record(); }
  });
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: benchAria(),
      items: KB_IDS.map(function (id) {
        return {
          name: function () { return probeName(id); },
          move: function (dx, dy, big) { return keyStep(id, dx, dy, big ? NUDGE_BIG : NUDGE); },
          describe: function () { return probeDesc(id); }
        };
      }),
      onChange: function () {
        const id = KB_IDS[kb.index()];
        if (id && id !== state.sel) select(id); else requestDraw();
      }
    });
    if (kb.index() !== KB_IDS.indexOf(state.sel)) kb.select(KB_IDS.indexOf(state.sel));
  }
  /** 鍵盤選取的探針周圍畫虛線圓角框（--accent） */
  function drawKeyFocus() {
    if (!kb || !kb.focused()) return;
    const id = KB_IDS[kb.index()];
    if (!id) return;
    const g = probeGeom(id), pad = 5;
    const x0 = Math.min(g.tx - 13, g.hx - 7), x1 = Math.max(g.tx + 13, g.hx + 7);
    const y0 = Math.min(g.ty - 13, g.hy - 7), y1 = Math.max(g.ty + 13, g.hy + 7);
    ctx.save();
    ctx.strokeStyle = LD.c.accent; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    LD.roundRect(ctx, x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, 8); ctx.stroke();
    ctx.restore();
  }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function nudge(dx, dy) {
    const p = state.sel === 'n1' ? n1Pos() : state.n2;
    setProbe(state.sel, r4(p.x + dx), r4(p.y + dy));
    emitProbeSoon();
  }
  let probeTimer = 0;
  function emitProbeSoon() { clearTimeout(probeTimer); probeTimer = setTimeout(emitProbe, 400); }
  document.querySelectorAll('.nudge button').forEach(function (b) {
    let rep = 0, hold = 0;
    const dx = +b.getAttribute('data-nx'), dy = +b.getAttribute('data-ny');
    const stop = function () { clearTimeout(hold); clearInterval(rep); hold = rep = 0; };
    b.addEventListener('pointerdown', function () {
      stop();
      hold = setTimeout(function () { rep = setInterval(function () { nudge(dx * NUDGE, dy * NUDGE); }, 70); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (e) { b.addEventListener(e, stop); });
    b.addEventListener('click', function () { if (!rep) nudge(dx * NUDGE, dy * NUDGE); });
  });

  // 檢流計的「聲音零位指示」：拖曳時，離零愈遠聲音愈大
  function startVoice() {
    if (!window.LabSound || !LabSound.enabled() || state.meter !== 'galv' || !state.power) return;
    voice = LabSound.voice({ freq: 420, type: 'triangle', gain: 0 });
    updateVoice();
  }
  function updateVoice() {
    if (!voice) return;
    const m = meterNow();
    const u = Math.min(1, Math.abs(m.I) / EC.GALV_FS);
    voice.set({ freq: 380 + 520 * u, gain: u < 0.004 ? 0 : 0.08 + 0.32 * Math.pow(u, 0.6) }, 0.05);
  }
  function stopVoice() { if (voice) { voice.stop(0.12); voice = null; } }

  let phoneVoice = null, previousReading = null;
  function syncPhone() {
    const on = state.meter === 'phone' && state.medium === 'water' && state.ac && state.power && !document.hidden && benchVisible && window.LabSound && LabSound.enabled();
    if (!on) { if (phoneVoice) phoneVoice.stop(0.05); phoneVoice = null; return; }
    if (!phoneVoice || !phoneVoice.playing) phoneVoice = LabSound.voice({ freq: 1000, type: 'sine', gain: 0 });
    phoneVoice.set({ freq: 1000, gain: phoneLevel() * 0.15 }, 0.04);
  }
  function nullFeedback() {
    const reading = Math.abs(meterNow().reading);
    if (state.power && previousReading !== null && previousReading > 0.02 + 1e-9 && reading <= 0.02 + 1e-9 && window.LabSound) {
      LabSound.tone({ freq: 1320, dur: 0.15, gain: 0.25 });
      LabSound.tone({ freq: 1980, dur: 0.12, delay: 0.025, gain: 0.10 });
    }
    previousReading = state.power ? reading : null;
  }

  // ---------------------------------------------------------------------
  // 記錄、刪除、清除
  // ---------------------------------------------------------------------
  function gaussR() { return EC.gauss(Math.random); }
  function record() {
    if (!state.power) { setStatus(T('電源還沒接通：先按「接通電源」。', 'The supply is off: press “Switch on the supply” first.')); return; }
    const m = meterNow();
    if (state.meter === 'galv' && m.over) { setStatus(T('指針超出刻度，讀不出來：把紅探針移到接近零的地方再記錄。', 'The needle is off the scale: move the red probe closer to the null point before recording.')); return; }
    const p1 = n1Pos(), p2 = state.n2;
    const sh = sheet();
    const mx = state.noise ? p2.x + MARK_SIGMA * gaussR() : p2.x, my = state.noise ? p2.y + MARK_SIGMA * gaussR() : p2.y;
    // N1 的電位：夾在負極時就是 0；否則用電表對負極量得（理想時為真值）
    const V1 = state.clip ? 0 : m.V1;
    const rec = { x: Math.min(SW, Math.max(0, mx)), y: Math.min(SH, Math.max(0, my)), xt: p2.x, yt: p2.y,
      n1x: +p1.x.toFixed(3), n1y: +p1.y.toFixed(3), clip: state.clip, V1: V1, V2: m.V2, dV: m.dV,
      reading: m.reading, lineReading: state.ac ? Math.sign(m.dV) * m.reading : m.reading, text: m.text, meter: state.meter };
    sh.recs.push(rec);
    sh.rev++;
    const A = analysis();
    const g = A.groups.find(function (q) { return q.idx.indexOf(sh.recs.length - 1) >= 0; });
    setStatus(T('記錄第 ', 'Point ') + sh.recs.length + T(' 點：', ' recorded: ') + '(' + rec.x.toFixed(1) + ', ' + rec.y.toFixed(1) + ') cm' + T('，讀數 ', ', reading ') + minus(m.text) +
      ' → ' + g.name + T('（', ' (') + fmt(g.V, 2) + ' V' + T('，', ', ') + g.pts.length + T(' 點）', ' points)'));
    if (window.LabSound) {
      LabSound.tone({ freq: 330 + 420 * Math.max(0, Math.min(1, m.V2 / state.V0)), dur: 0.11, type: 'sine', gain: 0.32 });
      LabSound.noise({ dur: 0.03, gain: 0.18, filter: 3200, q: 1 });
      const chimeKey = rec.n1x + '|' + rec.n1y + '|' + fmt(g.V, 1);
      sh.chimed = sh.chimed || {};
      if (g.pts.length === 6 && !sh.chimed[chimeKey]) {
        sh.chimed[chimeKey] = true;
        [523.25, 659.25, 783.99].forEach(function (freq, i) { LabSound.tone({ freq: freq, dur: 0.18, delay: 0.04 + i * 0.045, gain: 0.12 }); });
      }
    }
    afterChange();
    emitRecord(rec, g);
    if (state.drawLines) emitLines();
    if (state.drawField) emitField();
  }
  function afterChange() {
    renderTable();
    updateSteps();
    requestDraw();
    if (view3) view3.update();
  }
  $('rec').addEventListener('click', record);
  $('undo').addEventListener('click', function () {
    const sh = sheet();
    if (!sh.recs.length) return;
    sh.recs.pop(); sh.rev++; sh.est = null;
    setStatus(T('已刪除最後一點。', 'The last point was deleted.'));
    afterChange();
  });
  $('clearAll').addEventListener('click', function () {
    state.sheets = {};
    $('mediumCompare').textContent = '';
    state.estimated = false;
    anaCache.key = '';
    setStatus(T('已清除所有記錄點、等位線與估算結果（設定保留）。', 'All points, lines and estimates were cleared (settings kept).'));
    renderEst(null);
    afterChange();
  });

  // ---------------------------------------------------------------------
  // 估算電場
  // ---------------------------------------------------------------------
  function estimate() {
    if (!state.power) { setStatus(T('電源還沒接通。', 'The supply is off.')); return; }
    const A = analysis(), P = [state.n2.x, state.n2.y];
    const Vp = potAt(P[0], P[1]);
    const cands = A.groups.filter(function (g) { return g.path && g.pts.length >= 2; }).map(function (g) { return { V: g.V, path: g.path, name: g.name, g: g }; });
    const pe = posEl(), ne = negEl();
    cands.push({ V: voltage().positive, path: elPath(pe), name: state.medium === 'water' ? T('正極水側', '+ interface') : T('正極', '+ electrode'), el: true });
    cands.push({ V: voltage().negative, path: elPath(ne), name: state.medium === 'water' ? T('負極水側', '− interface') : T('負極', '− electrode'), el: true });
    let up = null, dn = null;
    cands.forEach(function (c) {
      if (c.V >= Vp && (!up || c.V < up.V || (c.V === up.V && !c.el))) up = c;
      if (c.V < Vp && (!dn || c.V > dn.V || (c.V === dn.V && !c.el))) dn = c;
    });
    if (!up || !dn || up.V - dn.V < 0.05) {
      setStatus(T('紅探針兩側要各有一條等位線（或電極）才能估算。', 'There must be an equipotential line (or an electrode) on each side of the red probe.'));
      return;
    }
    const r = EC.estimateField(up.path, up.V, dn.path, dn.V, P);
    if (!r) return;
    const mid = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
    const Ec = fieldAt(mid[0], mid[1]).E;
    const est = { a: r.a, b: r.b, dd: r.dd, dV: r.dV, E: r.E, Ecalc: Ec, err: Ec > 0 ? (r.E - Ec) / Ec : NaN,
      up: up.name, dn: dn.name, VA: up.V, VB: dn.V, usesEl: !!(up.el || dn.el), mid: mid };
    sheet().est = est;
    state.estimated = true;
    renderEst(est);
    setStatus(T('估算完成：E ≈ ', 'Estimate: E ≈ ') + est.E.toFixed(3) + ' V/cm' + T('，計算值 ', ', computed ') + Ec.toFixed(3) + ' V/cm' + T('。', '.'));
    if (window.LabSound) LabSound.tone({ freq: 660, dur: 0.1, type: 'sine', gain: 0.25 });
    updateSteps();
    requestDraw();
    emitEstimate(est);
  }
  function renderEst(e) {
    if (!e) { ['eLines', 'eDd', 'eEst', 'eCalc', 'eErr'].forEach(function (id) { $(id).textContent = '—'; }); return; }
    $('eLines').textContent = T(e.up + '（' + fmt(e.VA, 2) + ' V）／' + e.dn + '（' + fmt(e.VB, 2) + ' V）', e.up + ' (' + fmt(e.VA, 2) + ' V) / ' + e.dn + ' (' + fmt(e.VB, 2) + ' V)');
    $('eDd').textContent = e.dd.toFixed(2) + ' cm';
    $('eEst').textContent = e.E.toFixed(3) + ' V/cm';
    $('eCalc').textContent = e.Ecalc.toFixed(3) + ' V/cm';
    $('eErr').textContent = isFinite(e.err) ? minus((e.err * 100).toFixed(1)) + ' %' : '—';
  }
  $('est').addEventListener('click', estimate);

  // ---------------------------------------------------------------------
  // 數據表、讀數、步驟
  // ---------------------------------------------------------------------
  function renderTable() {
    const sh = sheet(), A = analysis();
    const head = '<thead><tr><th>' + T('線', 'Line') + '</th><th>#</th><th>x<small>(cm)</small></th><th>y<small>(cm)</small></th><th>' +
      T('讀數', 'Reading') + '</th><th>' + T('線的電位', 'Line potential') + '<small>(V)</small></th></tr></thead>';
    if(sh.recs.length&&sh.recs.every(function(r){return r.given;})){
      $('tbl').innerHTML=head+'<tbody><tr class="empty"><td colspan="6">'+T('這是題目給定的線，不列作你的實測記錄；可到自學第 4 段描點。','These are given curves, not your measured records. Trace your own points in Section 4.')+'</td></tr></tbody>';
      $('tsum').textContent=''; return;
    }
    if (!sh.recs.length) {
      $('tbl').innerHTML = head + '<tbody><tr class="empty"><td colspan="6">' + T('還沒有記錄點。移動紅探針到讀數為零（或目標電壓）的地方，按「記錄」。', 'No points yet. Move the red probe to where the meter reads zero (or the target voltage) and press “Record”.') + '</td></tr></tbody>';
      $('tsum').textContent = '';
      return;
    }
    let rows = '';
    A.groups.forEach(function (g) {
      const col = potColor(g.V);
      g.idx.forEach(function (i, n) {
        const r = sh.recs[i];
        rows += '<tr' + (i === sh.recs.length - 1 ? ' class="latest"' : '') + '><td class="g">' + (n === 0 ? '<i style="background:' + col + '"></i>' + g.name : '') + '</td><td>' + (i + 1) +
          '</td><td>' + r.x.toFixed(1) + '</td><td>' + r.y.toFixed(1) + '</td><td>' + minus(r.text) + '</td><td>' + (n === 0 ? fmt(g.V, 2) : '') + '</td></tr>';
      });
    });
    $('tbl').innerHTML = head + '<tbody>' + rows + '</tbody>';
    const full = A.groups.filter(function (g) { return g.pts.length >= 5; }).length;
    $('tsum').textContent = T('共 ', 'Total: ') + sh.recs.length + T(' 點、', ' points, ') + A.groups.length + T(' 組；至少 5 點的等位線 ', ' groups; lines with at least 5 points: ') + full + T(' 條。', '.');
  }
  function updateReadouts() {
    const m = meterNow(), p1 = n1Pos(), p2 = state.n2;
    $('rMeterLabel').innerHTML = state.meter === 'galv' ? T('檢流計電流', 'Galvanometer current') : state.ac ? symbols(T('交流有效值 |V(N2) − V(N1)|', 'AC RMS |V(N2) − V(N1)|')) : symbols(T('電表讀數 V(N2) − V(N1)', 'Meter reading V(N2) − V(N1)'));
    $('rMeter').textContent = state.power ? minus(m.text) : '0';
    $('rN2').textContent = '(' + p2.x.toFixed(2) + ', ' + p2.y.toFixed(2) + ') cm';
    $('rN1').textContent = state.clip ? T('夾在負極（0 V）', 'clipped to − (0 V)') : '(' + p1.x.toFixed(2) + ', ' + p1.y.toFixed(2) + ') cm';
    const ds = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    $('rDs').textContent = ds.toFixed(2) + ' cm';
    $('rDvDs').textContent = state.meter === 'dmm' && state.power && ds > 0.05 && !state.clip ? minus((m.reading / ds).toFixed(3)) + ' V/cm' : '—';
    const I = supplyCurrent();
    $('rI').textContent = state.power ? (I * 1000).toFixed(3) + ' mA' : '0';
    // 計算值
    const Vp = potAt(p2.x, p2.y), f = fieldAt(p2.x, p2.y);
    $('cV').textContent = state.power ? Vp.toFixed(3) + ' V' : '0';
    $('cE').textContent = state.power ? f.E.toFixed(3) + ' V/cm' + T('（', ' (') + (f.E * 100).toFixed(1) + T(' V/m）', ' V/m)') : '0';
    $('cDir').textContent = state.power && f.E > 1e-6 ? minus((Math.atan2(f.ey, f.ex) * 180 / Math.PI).toFixed(0)) + '°' + T('（由 +x 逆時針）', ' (from +x, counter-clockwise)') : '—';
    $('cJ').textContent = state.power ? (f.E * 100 / EC.sheetResistance(state) * 1000).toFixed(3) + ' mA/m' : '0';
    const I1 = EC.currentAcross(getSol());
    $('cR').textContent = I1 > 0 ? (1 / I1 / 1000).toFixed(2) + ' kΩ' : '—';
    $('rBulk').textContent = voltage().bulk.toFixed(2) + (state.ac ? T(' V（有效值）', ' V RMS') : ' V');
    $('rPolar').textContent = voltage().Vp.toFixed(2) + ' V';
  }
  // 站長 11/16：「步驟要去找到那個『估算電場』，可是他卻找不到……實驗步驟可能還要再寫詳細一點」
  // → 每一步寫出按鈕上的真實字樣與它在哪一張卡片。
  const STEPS = [
    ['在「電極與電源」卡選電極（兩圓形電極／平行長條／長條與圓形）、拉「電源電壓 V0」，再按同一張卡的「接通電源」（手機在畫布下方的「電極與電源」分頁）。', 'In “Electrodes and power supply”, pick the electrodes, set the supply voltage V0, then press “Switch on the supply” in that card (on a phone: the “Power” tab under the canvas).'],
    ['黑探針 N1 固定不動：在畫布上把它拖到紙上任一點；或按「電表與探針」卡的「黑探針夾到負極（0 V）」，讀數就直接是 N2 的電位。', 'Keep black N1 still: drag it to any point on the sheet, or press “Clip N1 to the negative electrode (0 V)” in “Meter and probes” so the reading is the potential of N2.'],
    ['移動紅探針 N2（在畫布上拖，或用「電表與探針」卡的方向鍵、浮動的「⠿ 微調」小鍵盤細調），讓讀數為 0.00 V（N1 夾負極時，找目標電壓，例如 2.00 V），再按畫布正下方的「記錄」。', 'Move red N2 (drag it, or use the arrows in “Meter and probes” or the floating “⠿ Fine move” keypad) until the reading is 0.00 V (with N1 clipped, the target voltage such as 2.00 V), then press “Record” right under the canvas.'],
    ['同一個讀數找至少 5 點，散開在整條線上；再換一個目標電壓（或移動 N1），描出至少 4 條等位線。', 'Find at least 5 points at the same reading, spread along the whole line; then change the target voltage (or move N1) and trace at least 4 lines.'],
    ['在「作圖與分析」卡勾選「把同一條線的點連成平滑的等位線」。', 'In “Drawing and analysis”, tick “Join the points of each line with a smooth curve”.'],
    ['同一張卡勾選「畫出與等位線垂直的電力線」，看電力線和等位線是不是處處垂直。', 'In the same card, tick “Draw field lines at right angles to them” and check they cross at right angles everywhere.'],
    ['把紅探針放在兩條你描的等位線之間，按「作圖與分析」卡的「估算紅探針處的電場」，看「差異」一欄和計算值差多少。', 'Put the red probe between two lines you traced, press “Estimate E at the red probe” in “Drawing and analysis”, and read the “Difference” row.']
  ];
  function stepsDone() {
    const A = analysis(), sh = sheet();
    return [
      state.power,
      state.n1Touched || state.clip || sh.recs.length > 0,
      sh.recs.length > 0,
      A.groups.filter(function (g) { return g.pts.length >= 5; }).length >= 4,
      state.drawLines && A.groups.some(function (g) { return g.pts.length >= 3; }),
      state.drawField && sketch().lines.length > 0,
      !!sh.est
    ];
  }
  function stepState(){
    const d=stepsDone(),now=d.indexOf(false);
    return STEPS.map(function(s,i){
      const text=i===0&&state.medium==='water'
        ? T('水槽保持水平、電極入水；在畫布上方選「直流」或「交流（1 kHz）」，在「電極與電源」卡設定「電源電壓 V0」，再按「接通電源」。','Keep the tray level and electrodes immersed. Choose DC or AC (1 kHz) above the canvas, set the supply voltage V0 in “Electrodes and power supply”, then press “Switch on the supply”.')
        : i===1&&state.medium==='water'
          ? T('黑探針 N1 固定插在水中；或按「電表與探針」卡的「黑探針夾到負極（0 V）」作參考。','Keep black N1 fixed in the water, or press “Clip N1 to the negative electrode (0 V)” in “Meter and probes” for a metal reference.')
          : T(s[0],s[1]);
      return {html:symbols(text),done:d[i],current:i===now};
    });
  }
  function guideProbe(id,to){return {canvas:'#cv',client:true,at:function(){const p=to|| (id==='n1'?n1Pos():state.n2);const r=cv.getBoundingClientRect();return {x:r.left+X(p.x),y:r.top+Y(p.y)};}};}
  function guideDefinitions(study){const label=function(id){return function(){return $(id).closest('label')||$(id);};};const focus=function(id,study){return function(){return state.sel===id?guideProbe(id):document.querySelector(study?'#eq-study-tools button:nth-child('+(id==='n1'?2:3)+')':'[data-sel="'+id+'"]');};};const gesture=id=>()=>state.sel===id?'drag':'tap';const open=()=>stage.classList.contains('is3d')?$('view2d'):null;
    if(study)return [
      {target:()=>document.querySelector('#eq-study-tools button'),hint:()=>T('接通電源','Switch on the supply')},
      {target:focus('n1',true),to:guideProbe('n1',{x:15,y:3}),action:gesture('n1'),opener:open,hint:()=>T('固定黑探針','Place the black probe')},
      {target:()=>state.sel!=='n2'?document.querySelector('#eq-study-tools button:nth-child(3)'):state.power&&Math.abs(meterNow().reading)<=.02?document.querySelector('[data-vpad-record]'):guideProbe('n2'),action:()=>state.sel!=='n2'||state.power&&Math.abs(meterNow().reading)<=.02?'tap':'drag',opener:()=>stage.classList.contains('is3d')?$('view2d'):document.querySelector('.vpad-launch'),hint:()=>T('找零點並記錄','Find a null and record')},
      {target:()=>analysis().groups.some(g=>g.pts.length>=6)?document.querySelector('#eq-study-tools button:nth-child(5)'):document.querySelector('[data-vpad-record]'),opener:()=>document.querySelector('.vpad-launch'),hint:()=>T('記錄六點，再連成等位線','Record six points, then join the line')},
      {target:()=>document.querySelector('#eq-study-tools button:nth-child(6)'),hint:()=>T('換參考點','Change the reference')},
      {target:()=>document.querySelector('#eq-study-tools button:nth-child(7)'),hint:()=>T('畫電力線','Draw field lines')},
      {target:()=>document.querySelector('#eq-study-tools button:nth-child(8)'),hint:()=>T('估算電場','Estimate the field')}
    ];
    return [
      {target:'#power',hint:()=>T('接通電源','Switch on the supply')},
      {target:focus('n1'),action:gesture('n1'),opener:open,hint:()=>T('把黑探針固定在'+(state.medium==='water'?'水中':'紙面'),state.medium==='water'?'Keep the black probe in the water':'Keep the black probe on the paper')},
      {target:focus('n2'),action:gesture('n2'),opener:open,hint:()=>T('拖紅探針找等電位點','Move the red probe to an equipotential point')},
      {target:'#rec',hint:()=>T('記錄更多等位點','Record more equipotential points')},
      {target:label('drawLines'),action:'tick',hint:()=>T('連成平滑的等位線','Join the equipotentials')},
      {target:label('drawField'),action:'tick',hint:()=>T('畫出電力線','Draw field lines')},
      {target:'#est',hint:()=>T('估算紅探針處的電場','Estimate the field at the red probe')}
    ];
  }
  function updateSteps(){const a=stepState();$('steps').innerHTML=a.map(s=>'<li class="'+(s.done?'done':s.current?'now':'')+'">'+s.html+'</li>').join('');if(window.LabStepGuide&&!window.EquipotentialStudy?.observing){LabStepGuide.define(guideDefinitions(false),{key:'equipotential'});LabStepGuide.update(a.findIndex(s=>s.current),{key:'equipotential',auto:true});}}
  function setStatus(s) { lastStatus = s; $('status').innerHTML = symbols(s); }
  function meterHint() {
    $('meterHint').innerHTML = symbols(state.meter === 'phone'
      ? (window.LabSound && LabSound.enabled() ? T('聽 1 kHz 的聲音：音量越小越接近等電位，讀數 ≤ 0.02 V 就安靜。交流讀數是有效值。', 'Listen at 1 kHz: a quieter tone means closer to equal potential; at ≤ 0.02 V it is quiet. AC readings are RMS.') : T('耳機找零點：請先開啟「音效」，再移動探針，聽聲音最小的位置。', 'Headphone null detection: turn sound on first, then move a probe and listen for the quietest point.'))
      : state.ac ? T('三用電表讀交流電壓有效值 |V(N2) − V(N1)|。1 kHz 交流在本模型中沒有極化；零點仍是 ≤ 0.02 V。', 'The multimeter reads AC RMS |V(N2) − V(N1)|. The 1 kHz AC model has no polarization; the null tolerance is still ≤ 0.02 V.')
      : state.meter === 'dmm'
      ? T('三用電表顯示 V(N2) − V(N1)，解析度 0.01 V。把 N1 夾到負極，讀數就是 N2 的電位：可以直接找 1.00 V、2.00 V…… 的點。', 'The multimeter shows V(N2) − V(N1) to 0.01 V. Clip N1 to the negative electrode and the reading is the potential of N2: look directly for 1.00 V, 2.00 V, …')
      : T('檢流計中央為零：指針偏右表示 N2 的電位比 N1 高。找指針回到正中央（0 μA）的點，就是與 N1 等電位的點。', 'Centre-zero galvanometer: a deflection to the right means N2 is at a higher potential than N1. Where the needle returns to the centre (0 μA), N2 is at the same potential as N1.'));
    $('galvAcHint').hidden = !state.ac;
    $('mediumHint').innerHTML = symbols(state.medium === 'water' ? (state.noise && !state.ac ? T('水深 1.0 cm · 0.1 % 食鹽水 · R□ = 500 Ω/□。直流極化：水中電壓 = V0 − Vp；負極金屬外會先跳一段電位。', 'Depth 1.0 cm · 0.1% salt water · R□ = 500 Ω/sq. DC polarization: bulk voltage = V0 − Vp; potential jumps just outside the negative metal.') : T('水深 1.0 cm · 0.1 % 食鹽水 · R□ = 500 Ω/□。均勻水槽與導電紙的正規化等位線相同。', 'Depth 1.0 cm · 0.1% salt water · R□ = 500 Ω/sq. A uniform tray and paper have the same normalized equipotentials.')) : T('導電紙 R□ = 5000 Ω/□。材質切換保留設定，各自保存方格紙記錄。', 'Paper R□ = 5000 Ω/sq. Switching medium keeps the settings; each medium has its own records.'));
  }
  /** 操作說明與報讀一併依材質更新；方格紙是兩種實驗共同的記錄媒介。 */
  function benchAria(english) {
    const tr = english ? function (zh, en) { return en; } : T;
    const bench = state.medium === 'water'
      ? tr('透明水槽俯視圖：底下墊方格紙，0.1 % 食鹽水深 1.0 cm，兩個銅電極與紅探針 N2、黑探針 N1 入水。', 'Top view of a transparent tray over grid paper: 0.1% salt water, 1.0 cm deep, with two copper electrodes and red N2 and black N1 immersed.')
      : tr('導電紙實驗桌俯視圖：兩個電極、紅探針 N2 與黑探針 N1 輕觸紙面。', 'Top view of the conducting-paper bench: two electrodes, with red N2 and black N1 touching the paper.');
    return bench + (state.ac ? tr('電源為 1 kHz 交流，電壓為有效值。', 'The source is 1 kHz AC; voltages are RMS.') : tr('電源為直流。', 'The source is DC.')) + tr('拖探針移動。Enter 換探針，方向鍵移動 0.05 cm，Shift 為 0.5 cm，Alt 為 0.01 cm，R 記錄。', 'Drag probes to move them. Enter selects a probe; arrows move 0.05 cm, Shift 0.5 cm, Alt 0.01 cm; R records.');
  }
  function mediumCopy() {
    document.querySelectorAll('[data-medium-only]').forEach(function (el) { el.hidden = el.dataset.mediumOnly !== state.medium; });
    cv.setAttribute('aria-label', benchAria());
    cv.setAttribute('data-en-aria-label', benchAria(true));
    $('landscapeHint').textContent = state.medium === 'water'
      ? T('曲面高度＝水中該點的電位，與 2D 共用數值解；這是電位圖，並非水面真的起伏。拖曳旋轉；左下角切到「平移」可上下左右、斜向拖曳；雙指或滾輪朝該處放大。', 'Surface height = the water potential, using the 2D solution. This is a potential graph, not a rising water surface. Drag to rotate; switch to Pan (bottom left) to drag the view in any direction; pinch or scroll to zoom there.')
      : T('曲面高度＝導電紙上該點的電位，與 2D 共用數值解。拖曳旋轉；左下角切到「平移」可上下左右、斜向拖曳；雙指或滾輪朝該處放大。', 'Surface height = the potential on the paper, using the 2D solution. Drag to rotate; switch to Pan (bottom left) to drag the view in any direction; pinch or scroll to zoom there.');
    $('landscapeHint').removeAttribute('data-en');
  }
  function supplyStatus() {
    if (!state.power) return T('電源關閉。', 'Supply off.');
    if (state.medium === 'paper') return T('電源接通：紙上有穩定電流了。', 'Supply on: a steady current flows through the paper.');
    return state.ac ? T('交流接通：水中以有效值量測，沒有極化與電解氣泡。', 'AC on: water measurements are RMS, with no polarization or electrolysis bubbles.')
      : (state.noise
        ? T('直流接通：兩極電解冒氣泡；「含誤差」計入電極極化，水中分到的電壓比電源小。', 'DC on: both electrodes bubble from electrolysis; “With errors” includes electrode polarization, so the water gets less than the supply voltage.')
        : T('直流接通：兩極電解冒氣泡（負極的氫氣泡較多）；理想條件不計電極極化。', 'DC on: both electrodes bubble from electrolysis (more hydrogen at the negative one); ideal conditions ignore electrode polarization.'));
  }

  // ---------------------------------------------------------------------
  // 任務事件
  // ---------------------------------------------------------------------
  // 水槽事件用獨立名稱，既有導電紙任務的函式與門檻完整保留，避免同一操作連帶領星。
  function emit(type, data) {
    if (studyApplying) return;
    if (window.EquipotentialStudy && window.EquipotentialStudy.observing) {
      window.dispatchEvent(new CustomEvent('eqp:action', { detail: { type: type, data: data } }));
      return;
    }
    if (window.LabMission) window.LabMission.emit(state.medium === 'water' ? 'water-' + type : type, data);
  }
  function common() {
    const A = analysis();
    return {
      type: state.type, d: state.d, a: state.a, L: state.L, V0: state.V0, power: state.power, noise: state.noise, meter: state.meter,
      medium: state.medium, ac: state.ac, clip: state.clip, bulkVoltage: V0eff(),
      fullBars: state.type !== 'circles' && state.L >= SH,
      groups: A.groups.map(function (g) { return { V: g.V, n: g.pts.length, span: g.span, vRange: g.vRange }; }),
      total: sheet().recs.length, drawLines: state.drawLines, drawField: state.drawField
    };
  }
  function probeInfo() {
    const p1 = n1Pos(), p2 = state.n2, m = meterNow();
    const e2 = EC.electrodeAt(els(), p2.x, p2.y);
    const corner = Math.min(Math.hypot(p2.x, p2.y), Math.hypot(SW - p2.x, p2.y), Math.hypot(p2.x, SH - p2.y), Math.hypot(SW - p2.x, SH - p2.y));
    // 長條背後：長條外側、離長條外緣至少 1 cm
    let behind = false;
    els().forEach(function (e) {
      if (e.kind !== 'rect') return;
      if (e.sign > 0 && p2.x <= e.x0 - 1 && p2.y >= e.y0 && p2.y <= e.y1) behind = true;
      if (e.sign < 0 && p2.x >= e.x1 + 1 && p2.y >= e.y0 && p2.y <= e.y1) behind = true;
    });
    return {
      x: p2.x, y: p2.y, x1: p1.x, y1: p1.y, clip: state.clip, reading: m.reading, dV: m.dV, V1: m.V1, V2: m.V2,
      onElectrode: e2 >= 0, n1OnElectrode: state.clip || EC.electrodeAt(els(), p1.x, p1.y) >= 0,
      dist12: Math.hypot(p2.x - p1.x, p2.y - p1.y), corner: corner, behind: behind,
      E2: fieldAt(p2.x, p2.y).E, Ecent: fieldAt(SW / 2, SH / 2).E
    };
  }
  function emitRecord(rec, g) {
    emit('record', Object.assign(common(), probeInfo(), { x: rec.xt, y: rec.yt, mx: rec.x, my: rec.y, reading: rec.reading,
      groupN: g.pts.length, groupV: g.V, groupSpan: g.span, groupVRange: g.vRange }));
    compareMedia();
  }
  function compareMedia() {
    if (window.EquipotentialStudy && window.EquipotentialStudy.observing) return;
    if (state.medium !== 'water' || !state.power) return;
    const other = state.sheets[sheetKey('paper')];
    if (!other || other.recs.length < 5) return;
    const groups = EC.groupRecords(other.recs);
    groups.forEach(function (g) {
      g.pts = g.idx.map(function (i) { return [other.recs[i].x, other.recs[i].y]; });
      const o = EC.orderPoints(g.pts); g.path = EC.smoothPath(o.pts, o.closed, 10);
    });
    const match = EC.compareEquipotentials(analysis().groups, groups);
    if (match) {
      $('mediumCompare').textContent = T('紙／水兩條實測線：平均距離 ', 'Paper / water measured lines: mean distance ') + match.meanDistance.toFixed(3) + ' cm';
      if (window.LabMission) LabMission.emit('mediumcompare', Object.assign(common(), match, { sameConfig: true }));
    }
  }
  function emitProbe() { if (state.power) emit('probe', Object.assign(common(), probeInfo())); }
  function emitLines() { emit('lines', common()); }
  function emitField() { const sk = sketch(); emit('fieldlines', Object.assign(common(), { nCurves: sk.curves.filter(function (c) { return c.g && c.g.pts.length >= 4; }).length, nLines: sk.lines.length })); }
  function emitEstimate(e) {
    const m = e.mid;
    const dEl = Math.min.apply(null, els().map(function (q) { return EC.distToElectrode(q, m[0], m[1]); }));
    emit('estimate', Object.assign(common(), { Eest: e.E, Ecalc: e.Ecalc, err: e.err, dd: e.dd, dV: e.dV, x: m[0], y: m[1], VA: e.VA, VB: e.VB,
      usesEl: e.usesEl, distEl: dEl, Ecent: fieldAt(SW / 2, SH / 2).E, sheet: sheetKey() }));
  }

  // ---------------------------------------------------------------------
  // 控制項
  // ---------------------------------------------------------------------
  const elD = $('d'), elA = $('a'), elL = $('L'), elV = $('V0');
  function refreshOutputs() {
    $('do').textContent = val(elD).toFixed(1) + ' cm';
    $('ao').textContent = val(elA).toFixed(2) + ' cm';
    $('Lo').textContent = val(elL).toFixed(0) + ' cm' + (val(elL) >= SH ? T('（邊到邊）', ' (edge to edge)') : '');
    $('V0o').textContent = val(elV).toFixed(1) + ' V';
    $('dLabel').textContent = state.type === 'circles' ? T('兩圓心的距離 d', 'Distance between the centres d')
      : state.type === 'bars' ? T('兩長條內緣的距離 d', 'Gap between the bars d') : T('長條內緣到圓心的距離 d', 'Bar edge to circle centre d');
    $('boxA').hidden = state.type === 'bars';
    $('boxL').hidden = state.type === 'circles';
  }
  function readSliders() {
    state.d = Math.round(val(elD) * 2) / 2;
    state.a = Math.round(val(elA) * 100) / 100;
    state.L = Math.round(val(elL));
    state.V0 = Math.round(val(elV) * 10) / 10;
    // 圓形電極不可超出紙面
    if (state.type !== 'bars') state.d = Math.min(state.d, SW - 2 * state.a - 1);
  }
  function configChanged(fast) {
    preview = !!fast;
    readSliders();
    $('mediumCompare').textContent = '';
    refreshOutputs();
    stopVoice();
    if (!fast) { anaCache.key = ''; renderTable(); renderEst(sheet().est); updateSteps(); }
    updateReadouts();
    previousReading = state.power ? Math.abs(meterNow().reading) : null;
    meterHint(); syncEffects();
    kickNeedle();
    requestDraw();
    if (view3 && !fast) view3.update();
  }
  [elD, elA, elL, elV].forEach(function (el) {
    el.addEventListener('input', function () { configChanged(true); });
    el.addEventListener('change', function () { configChanged(false); });
  });
  document.querySelectorAll('[data-type]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.type = b.getAttribute('data-type');
      document.querySelectorAll('[data-type]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      configChanged(false);
    });
  });
  document.querySelectorAll('[data-meter]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.disabled || b.hidden) return;
      state.meter = b.getAttribute('data-meter');
      document.querySelectorAll('[data-meter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      meterHint();
      updateReadouts();
      state.needle = 0;
      kickNeedle();
      requestDraw();
      stopVoice(); syncPhone(); previousReading = Math.abs(meterNow().reading);
      if (view3) view3.update();
    });
  });
  document.querySelectorAll('[data-noise]').forEach(function (b) {
    b.addEventListener('click', function () {
      const on = b.getAttribute('data-noise') === '1';
      if (on === state.noise) return;
      state.noise = on;
      if (on) {
        state.seed = 1 + Math.floor(Math.random() * 1e6);
        state.offset = (Math.random() * 2 - 1) * OFFSET_MAX;
      } else state.offset = 0;
      document.querySelectorAll('[data-noise]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      setJitter();
      setStatus(on ? (state.medium === 'water' ? T('含誤差：水中導電度略不均勻，電表有零點偏差與跳動；直流另有電極極化。', 'With errors: the liquid conductivity varies slightly, the meter has offset and jitter, and DC adds electrode polarization.') : T('含誤差：換上一張導電度略不均勻的紙，電表也有零點偏差與跳動。', 'With errors: a slightly non-uniform sheet, and the meter now has a zero offset and a flickering last digit.')) : T('理想條件。', 'Ideal conditions.'));
      configChanged(false);
    });
  });
  document.querySelectorAll('[data-sel]').forEach(function (b) { b.addEventListener('click', function () { select(b.getAttribute('data-sel')); }); });
  $('fine').addEventListener('change', function (ev) { state.fine = ev.target.checked; });
  $('clip').addEventListener('click', function () {
    state.clip = true; state.n1Touched = true;
    setStatus(T('黑探針夾在負極上：電表讀數就是紅探針處的電位（對負極）。', 'N1 is clipped to the negative electrode: the reading is now the potential of N2 (relative to −).'));
    if (state.meter !== 'dmm') setStatus(lastStatus + T('（建議改用三用電表）', ' (the multimeter is more useful here)'));
    probeMoved();
    updateSteps();
  });
  function powerBtn() {
    const b = $('power');
    b.setAttribute('aria-pressed', String(state.power));
    b.textContent = state.power ? T('關閉電源', 'Switch off the supply') : T('接通電源', 'Switch on the supply');
  }
  $('power').addEventListener('click', function () {
    state.power = !state.power;
    powerBtn();
    if (window.LabSound) {
      LabSound.noise({ dur: 0.04, gain: 0.3, filter: 2400, q: 1.5 });
      if (state.power) LabSound.tone({ freq: 520, dur: 0.12, type: 'sine', gain: 0.25 });
    }
    setStatus(supplyStatus());
    previousReading = state.power ? Math.abs(meterNow().reading) : null;
    syncEffects();
    updateReadouts(); updateSteps(); kickNeedle(); requestDraw();
    if (view3) view3.update();
  });
  [['drawLines', 'drawLines'], ['drawField', 'drawField'], ['showTheory', 'showTheory'], ['showStream', 'showStream'], ['showHeat', 'showHeat']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (ev) {
      state[p[1]] = ev.target.checked;
      updateSteps();
      requestDraw();
      if (view3) view3.update();
      if (p[0] === 'drawLines' && ev.target.checked) emitLines();
      if (p[0] === 'drawField' && ev.target.checked) emitField();
    });
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
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); meterHint(); syncEffects(); requestDraw(); }
  });

  function mediumControls() {
    mediumCopy();
    document.querySelectorAll('[data-medium]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.medium === state.medium)); });
    $('sourceMode').hidden = state.medium !== 'water';
    $('meterPhone').hidden = state.medium !== 'water';
    $('meterPhone').disabled = !state.ac;
    $('meterGalv').disabled = state.ac;
    document.querySelectorAll('[data-ac]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.ac === '1') === state.ac)); });
    document.querySelectorAll('[data-meter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.meter === state.meter)); });
    $('rigHint').hidden = viewMode !== 'rig';
    $('landscapeHint').hidden = viewMode !== '3d';
    $('surfaceLegend').hidden = viewMode !== '3d';
  }
  document.querySelectorAll('[data-medium]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.medium = b.dataset.medium;
      if (state.medium === 'paper') { state.ac = false; if (state.meter === 'phone') state.meter = 'dmm'; }
      mediumControls(); configChanged(false);
      setStatus(state.medium === 'water' ? T('換成水槽：電極、電壓與探針位置保留；使用水槽的記錄。', 'Water tray selected: electrode, voltage and probe settings kept; showing the tray records.') : T('換回導電紙與它的記錄。', 'Back to the paper and its records.'));
    });
  });
  document.querySelectorAll('[data-ac]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.medium !== 'water') return;
      state.ac = b.dataset.ac === '1';
      if ((state.ac && state.meter === 'galv') || (!state.ac && state.meter === 'phone')) state.meter = 'dmm';
      mediumControls(); configChanged(false);
      setStatus(supplyStatus());
    });
  });

  // ---------------------------------------------------------------------
  // 3D 電位地形（three.js 只在切換到 3D 時才載入）
  // ---------------------------------------------------------------------
  let view3 = null, threeLib = null, loadToken = 0, viewMode = '2d';
  const host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function env3() {
    return {
      host: host3, T: T,
      isVisible: function () { return benchVisible && !document.hidden; },
      data: function () {
        const A = analysis(), sh = sheet();
        return {
          sol: getSol(), V0: state.V0, V0eff: V0eff(), offset: voltage().negative, power: state.power,
          medium: state.medium, ac: state.ac, meter: state.meter, reading: meterNow().text, phoneLevel: phoneLevel(), current: supplyCurrent(),
          recs: sh.recs, groups: A.groups, n1: n1Pos(), n2: state.n2, clip: state.clip,
          showStream: state.showStream, showTheory: state.showTheory, drawLines: state.drawLines,
          potColor: potColor,
          stream: state.showStream && V0eff() > 0 ? derived('stream', function (s) { return EC.streamlines(s, 14); }) : null
        };
      },
      contour: function (level) { return EC.contour(getSol(), level); },
      moveProbe: function (id, x, y) { select(id); setProbe(id, x, y); },
      endProbe: function () { emitProbe(); },
      onLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
    };
  }
  function setPressed(mode) {
    stage.classList.toggle('is-rig', mode === 'rig');
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
    $('viewRig').setAttribute('aria-pressed', String(mode === 'rig'));
    $('resetCam').hidden = mode === '2d';
    viewMode = mode;
    mediumControls();
  }
  function setView(mode) {
    if (mode !== '2d') {
      if (viewMode === mode && view3) return;
      if (view3) { view3.dispose(); view3 = null; }
      const token = ++loadToken;
      setPressed(mode);
      if (!webglAvailable() || !window.Equipotential3D || !window.EquipotentialRig3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        preview = false;
        view3 = (mode === 'rig' ? window.EquipotentialRig3D : window.Equipotential3D).create(lib, env3());
        stage.classList.add('is3d');
        viewMsg.textContent = '';
        requestAnimationFrame(function () { if (view3) view3.update(); });
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
      statKey = '';
      requestDraw();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    requestDraw();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('viewRig').addEventListener('click', function () { setView('rig'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------------------------------------------------------------------
  // 啟動
  // ---------------------------------------------------------------------
  function onTheme() {
    mediumCopy();
    statKey = '';
    anaCache.key = '';
    renderTable();
    updateSteps();
    updateReadouts();
    meterHint();
    powerBtn();
    updateSoundButton();
    refreshOutputs();
    if (sheet().est) renderEst(sheet().est);
    if (view3) view3.onTheme();
    requestDraw();
  }
  window.addEventListener('lab:themechange', onTheme);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopVoice(); syncEffects(); });
  if (window.IntersectionObserver) new IntersectionObserver(function (entries) { benchVisible = entries[0].isIntersecting; syncEffects(); }, { rootMargin: '150px' }).observe(stage);
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    if (dm.addEventListener) dm.addEventListener('change', onTheme);
  }
  if (window.ResizeObserver) new ResizeObserver(function () { statKey = ''; requestDraw(); }).observe(cv);
  else window.addEventListener('resize', function () { statKey = ''; requestDraw(); });

  // 分享連結：兩支探針的位置、N1 是否夾在負極、選取的探針（拖曳出來的狀態）
  // classroom.js 在 DOMContentLoaded 才載入：還沒有 LabShare 時，等 load 再登記（還原在 load 之後才做）
  function regShare() {
    if (!window.LabShare) return false;
    window.LabShare.register({
      get: function () {
        return { n2: [r4(state.n2.x), r4(state.n2.y)], n1: [r4(state.n1.x), r4(state.n1.y)], clip: state.clip, sel: state.sel, medium: state.medium, ac: state.ac };
      },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        const pt = function (a) {
          return Array.isArray(a) && a.length === 2 && typeof a[0] === 'number' && typeof a[1] === 'number' && isFinite(a[0]) && isFinite(a[1]) ? clampP(a[0], a[1]) : null;
        };
        const p2 = pt(o.n2), p1 = pt(o.n1);
        if (p2) state.n2 = p2;
        if (p1) { if (p1.x !== state.n1.x || p1.y !== state.n1.y) state.n1Touched = true; state.n1 = p1; }
        if (typeof o.clip === 'boolean') { state.clip = o.clip; if (o.clip) state.n1Touched = true; }
        if (o.sel === 'n1' || o.sel === 'n2') select(o.sel);
        if (o.medium === 'paper' || o.medium === 'water') state.medium = o.medium;
        if (typeof o.ac === 'boolean') state.ac = state.medium === 'water' && o.ac;
        if ((!state.ac || state.medium !== 'water') && state.meter === 'phone') state.meter = 'dmm';
        if (state.ac && state.meter === 'galv') state.meter = 'dmm';
        mediumControls(); meterHint(); syncEffects();
        probeMoved();
        updateSteps();
      }
    });
    return true;
  }
  if (!regShare()) window.addEventListener('load', regShare);

  /** 自學與範例只調用這份實驗狀態，設定題目時不偽造學生的操作事件。 */
  window.EquipotentialLab = {
    snapshot: function () {
      const A = analysis(), sh = sheet();
      return Object.assign({}, common(), probeInfo(), {
        n1: Object.assign({}, n1Pos()), n2: Object.assign({}, state.n2),
        showTheory: state.showTheory, view: viewMode,
        ready3D: !!view3, records: JSON.parse(JSON.stringify(sh.recs)), estimate: sh.est,
        paths: A.groups.map(function (g) { return { V:g.V, pts:g.pts, path:g.path, n:g.pts.length, ownN:g.idx.filter(function(i){return !sh.recs[i].given;}).length, vRange:g.vRange }; }),
        fields: state.drawField ? sketch().lines : [], els: els(), given: sh.recs.some(function (r) { return r.given; })
      });
    },
    preset: function (o, records) {
      studyApplying = true;
      try {
        ['type','medium','ac','noise','meter','power','clip','drawLines','drawField','showTheory','showHeat','showStream'].forEach(function (k) { if (o[k] != null) state[k] = o[k]; });
        [['d',elD],['a',elA],['L',elL],['V0',elV]].forEach(function (p) { if (o[p[0]] != null) { if (window.LabNum) LabNum.set(p[1],o[p[0]]); else p[1].value=o[p[0]]; } });
        if (o.n1) state.n1 = clampP(o.n1.x,o.n1.y);
        if (o.n2) state.n2 = clampP(o.n2.x,o.n2.y);
        document.querySelectorAll('[data-type]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.type===state.type)); });
        document.querySelectorAll('[data-noise]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.noise==='1')===state.noise)); });
        [['drawLines','drawLines'],['drawField','drawField'],['showTheory','showTheory'],['showHeat','showHeat'],['showStream','showStream']].forEach(function (p) { $(p[0]).checked=state[p[1]]; });
        readSliders();
        if (records) { const sh=sheet(); sh.recs=JSON.parse(JSON.stringify(records)); sh.rev++; sh.est=null; }
        setJitter(); mediumControls(); powerBtn(); configChanged(false); updateSteps();
      } finally { studyApplying=false; }
    },
    move: function (id,x,y) { select(id); setProbe(id,x,y); emitProbe(); },
    discardGiven: function () {
      Object.keys(state.sheets).forEach(function(k){const sh=state.sheets[k];if(sh.recs.some(function(r){return r.given;})){sh.recs=sh.recs.filter(function(r){return !r.given;});sh.rev++;sh.est=null;}});
      configChanged(false);
    },
    tweak: nudge, record:record, steps:stepState, guides:guideDefinitions,
    labels:function(){return labelBoxes.map(b=>Object.assign({},b));},
    label:queuePointLabel,
    board:function(){const r=cv.getBoundingClientRect();return {left:r.left+X(0),right:r.left+X(SW),top:r.top+Y(SH),bottom:r.top+Y(0),width:SW*G.s,height:SH*G.s};},
    get selected() { return state.sel; },
    get currentView() { return viewMode; },
    get meterType() { return state.meter; },
    probe: function(id) { return Object.assign({},id==='n1'?n1Pos():state.n2); },
    focus: select,
    screenPoint: function (x,y) { const r=cv.getBoundingClientRect(); return {x:r.left+X(x),y:r.top+Y(y)}; },
    view: setView, redraw: requestDraw,
    resetView: function () { if (view3) view3.resetCamera(); }
  };

  readSliders();
  mediumControls();
  refreshOutputs();
  powerBtn();
  meterHint();
  updateSoundButton();
  renderTable();
  updateSteps();
  updateReadouts();
  setStatus(T('先按「接通電源」，再移動探針。', 'Switch on the supply first, then move the probes.'));
  requestDraw();
  syncEffects();
})();
