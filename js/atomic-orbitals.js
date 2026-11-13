/*
 * atomic-orbitals.js — 「原子軌域的形狀」的頁面程式（2D 切面、節面、等值線、探針、徑向分布圖、認軌域、3D 切換、任務事件）
 * 波函數與所有數值都在 js/atomic-orbitals-core.js（AOCore）；3D 等值面與機率雲在 js/atomic-orbitals-3d.js（AO3D）。
 * 畫面只「讀」核心算出的數值：顏色深淺 ∝ |ψ|，節面、等值線、曲線都由公式計算，沒有手畫的形狀。
 *
 * 任務事件（只在使用者操作過之後送出；每個事件都帶 snap() 的完整狀態）：
 *   'state'：軌域、原子、副層加總、切面、切面位置、顯示方式改變
 *   'cursor'：徑向分布圖的游標移動 { r, P, cum, hits（這個軌域每個徑向節面是否被游標碰過） }
 *   'state' 在勾「整個副層加總」時，若有探針另附 pAng（|Y| ÷ 最大 |Y|，看探針是否在原本軌域的角節面上）、pRel（加總後的 |ψ|² ÷ 最大值）
 *   'probe'：2D 切面放探針 { px, py, pz, pr, theta（度）, rel（|ψ|² ÷ 全空間最大值）, sign }
 *   'pin'：保留一條徑向分布曲線
 *   'view3d'：3D 立體開啟成功；'opts3d'：3D 選項改變
 *   'quiz'：認軌域按「核對」{ hit（n 與副層都對）, exact（連哪一個軌域都對）, ql, streak, exactStreak }
 * snap()：{ id, n, l, key, Z, sum, plane, off, disp, blank（整片切面在節面上）, v3, style, pct, cut, nodes3, plane3,
 *           seen（自己選過的軌域）, pinned（'1s@1' 這種代號）, cur, cum, quiz（測驗題目還沒揭曉） }
 */
(function () {
  'use strict';
  const A = window.AOCore, LD = window.LabDraw;
  if (!A || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const LN = A.L_NAMES;
  const DEF_KEY = ['s', 'pz', 'dz2', 'fz3'];
  const CUR_MAX = 120;            // 游標滑桿的最大半徑（a0）
  const SUP_M1 = '<sup>−1</sup>', A0H = 'a<sub>0</sub>';

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function rStr(r) { return num(r, r < 10 ? 2 : 1); }
  function pm(r) { return num(r * A.A0_PM, r * A.A0_PM < 100 ? 1 : 0) + ' pm'; }
  /** 科學記號（HTML）：3 位有效數字 */
  function sciH(x) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e <= 3) return num(x, Math.max(0, 2 - e));
    const m = x / Math.pow(10, e);
    return num(m, 2) + ' × 10<sup>' + (e < 0 ? '−' + (-e) : e) + '</sup>';
  }

  // ======================= 狀態 =======================
  const state = { n: 2, l: 1, key: 'pz', Z: 1, sum: false, plane: 'xz', off: 0, disp: 'dens', auto: true, half: 10,
    style: 'iso', logc: false, pct: 90, nodes3: true, cut: false, plane3: false, cur: 2, probe: null, showR: false, view: '2d' };
  const pinned = [];              // { n, l, Z, r995 }
  const seen = new Set();         // 使用者自己選過的軌域代號（測驗出題不算）
  let hits = [], hitsFor = '';    // 游標碰過哪幾個徑向節面
  const quiz = { on: false, o: null, revealed: true, streak: 0, best: 0, exact: 0, n: 0, hist: [], prev: null };
  let userActed = false;
  let view3 = null;
  function acted() { userActed = true; }
  function orb() { return { n: state.n, l: state.l, key: state.key, Z: state.Z }; }
  function hiddenQ() { return quiz.on && !quiz.revealed; }
  function snd() { return window.LabSound && window.LabSound.enabled(); }

  // ======================= 衍生數值（換軌域、原子、副層加總、等值面機率時重算） =======================
  let info = null;
  const isoCache = new Map();
  function isoFor(o, pct, sum) {
    const k = A.id(o) + '@' + o.Z + '|' + pct + '|' + (sum ? 1 : 0);
    if (!isoCache.has(k)) {
      if (isoCache.size > 40) isoCache.clear();
      isoCache.set(k, A.isoLevel(o, pct / 100, sum));
    }
    return isoCache.get(k);
  }
  function derive() {
    const o = orb(), rc = A.rCut(o.n, o.Z);
    const tab = A.radialTable(o.n, o.l, o.Z, rc, 3000);
    const inv = function (f) { // 累積機率的反查
      let lo = 0, hi = tab.N;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab.C[m] < f) lo = m; else hi = m; }
      const s = tab.C[hi] - tab.C[lo];
      return (lo + (s > 0 ? (f - tab.C[lo]) / s : 0)) * tab.h;
    };
    const r995 = inv(0.995);
    info = {
      id: A.id(o), tab: tab, rc: rc,
      nodes: A.radialNodes(o.n, o.l, o.Z), ang: state.sum ? [] : A.angularNodes(o.key),
      rMax: A.rMax(o.n, o.l, o.Z), mean: A.meanR(o.n, o.l, o.Z), r90: inv(0.9), r995: r995,
      maxD: A.maxDensity(o, state.sum), iso: isoFor(o, state.pct, state.sum),
      autoHalf: Math.max(1.2, Math.round(r995 * 1.04 * 10) / 10)
    };
    info.psiMax = Math.sqrt(info.maxD);
    if (hitsFor !== info.id + '@' + o.Z) { hitsFor = info.id + '@' + o.Z; hits = info.nodes.map(function () { return false; }); }
  }
  function Rfast(r) { return A.lookup(info.tab, info.tab.R, r); }
  /** 某點的 ψ（副層加總時傳回 √密度，恆正） */
  function psiAt(x, y, z) {
    const r = Math.sqrt(x * x + y * y + z * z), Rv = r >= info.rc ? 0 : Rfast(r);
    if (state.sum) return Math.abs(Rv) / Math.sqrt(4 * Math.PI);
    return Rv * A.Y(state.key, x, y, z);
  }
  function blankNow() { return A.sliceIsNodal(state.key, state.plane, state.off, state.sum); }

  function snap() {
    const cum = A.lookup(info.tab, info.tab.C, state.cur);
    return {
      id: info.id, n: state.n, l: state.l, key: state.key, Z: state.Z, sum: state.sum,
      plane: state.plane, off: state.off, disp: state.disp, blank: blankNow(),
      v3: !!(view3 && view3.active), style: state.style, pct: state.pct, cut: state.cut, nodes3: state.nodes3, plane3: state.plane3,
      seen: Array.from(seen), pinned: pinned.map(function (p) { return p.n + LN[p.l] + '@' + p.Z; }),
      cur: state.cur, cum: cum, P: A.radialP(state.n, state.l, state.cur, state.Z), nodes: info.nodes.slice(), hits: hits.slice(), rMax: info.rMax,
      quiz: hiddenQ()
    };
  }
  function emit(type, extra) { if (userActed && window.LabMission) window.LabMission.emit(type, Object.assign(snap(), extra || {})); }

  // ======================= 顏色 =======================
  let col = {}, lutD = null, lutP = null;
  function readColors() {
    if (LD.refresh) LD.refresh();
    const c = LD.c, dark = LD.dark;
    col = { bg: c['canvas-bg'], text: c.text, muted: c.muted, accent: c.accent, pos: c.pos, neg: c.neg, node: c.equi, field: c.field, probe: c.probe, dark: dark };
    // 機率密度色階：亮度單調（淺色模式由淺到深，深色模式由暗到亮）
    const end = dark ? LD.mix(c.accent, '#ffffff', 0.8) : LD.shade(c.accent, -0.55);
    lutD = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255, s = t < 0.55 ? LD.mix(c['canvas-bg'], c.accent, t / 0.55) : LD.mix(c.accent, end, (t - 0.55) / 0.45);
      const q = LD.rgb(s); lutD[3 * i] = q[0]; lutD[3 * i + 1] = q[1]; lutD[3 * i + 2] = q[2];
    }
    // 波函數色階：發散型（藍－背景－紅），強度 ∝ |ψ|
    lutP = new Uint8ClampedArray(511 * 3);
    const pe = dark ? LD.mix(c.pos, '#ffffff', 0.25) : LD.shade(c.pos, -0.25), ne = dark ? LD.mix(c.neg, '#ffffff', 0.25) : LD.shade(c.neg, -0.25);
    for (let i = 0; i < 511; i++) {
      const t = (i - 255) / 255, a = Math.abs(t);
      const s = a < 0.7 ? LD.mix(c['canvas-bg'], t >= 0 ? c.pos : c.neg, a / 0.7) : LD.mix(t >= 0 ? c.pos : c.neg, t >= 0 ? pe : ne, (a - 0.7) / 0.3);
      const q = LD.rgb(s); lutP[3 * i] = q[0]; lutP[3 * i + 1] = q[1]; lutP[3 * i + 2] = q[2];
    }
    layerKey = '';
  }
  function lutCss(lut, i) { return 'rgb(' + lut[3 * i] + ',' + lut[3 * i + 1] + ',' + lut[3 * i + 2] + ')'; }

  // ======================= 畫布文字（下標、上標要自己畫） =======================
  /** parts：[{ t, sub, sup }]；畫在 (x, y)（基線），align 'left'／'center'／'right'；pill 為真時加圓角底框 */
  function rich(ctx, parts, x, y, color, opts) {
    opts = opts || {};
    const size = opts.size || 12, w8 = opts.weight || 600;
    const fN = w8 + ' ' + size + 'px ' + LD.FONT, fS = w8 + ' ' + (size * 0.72).toFixed(1) + 'px ' + LD.FONT;
    let w = 0;
    const ws = parts.map(function (p) { ctx.font = p.sub || p.sup ? fS : fN; const m = ctx.measureText(p.t).width + (p.sub || p.sup ? 0.5 : 0); w += m; return m; });
    let x0 = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
    if (opts.pill) {
      const ph = size + 8, bx = x0 - 6, by = y - size - 2;
      LD.roundRect(ctx, bx, by, w + 12, ph, ph / 2);
      ctx.fillStyle = LD.alpha(col.bg, col.dark ? 0.86 : 0.9); ctx.fill();
      ctx.strokeStyle = LD.alpha(color || col.muted, col.dark ? 0.45 : 0.35); ctx.lineWidth = 1; ctx.stroke();
    }
    parts.forEach(function (p, i) {
      const dy = p.sub ? size * 0.24 : p.sup ? -size * 0.38 : 0;
      LD.haloText(ctx, p.t, x0, y + dy, color, 'left', 'alphabetic', p.sub || p.sup ? fS : fN);
      x0 += ws[i];
    });
    return w;
  }
  /** 軌域名稱的 parts：2pz → [2p][z 下標]；副層加總 → [2p] */
  function nameParts(o, sum) {
    if (sum) return [{ t: o.n + LN[o.l] }];
    const txt = A.ANG[o.key].txt;
    return txt.length > 1 ? [{ t: o.n + txt.charAt(0) }, { t: txt.slice(1), sub: true }] : [{ t: o.n + txt }];
  }
  function a0Parts(prefix) { return [{ t: prefix + 'a' }, { t: '0', sub: true }]; }
  function nameHtml(o, sum) { return sum ? o.n + LN[o.l] : A.html(o); }

  // ======================= 2D 切面 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  let layerKey = '', psiGrid = null, yGrid = null, gw = 0, gh = 0;
  let segIso = [], segAng = [];
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = cv.clientWidth || 400; H = cv.clientHeight || W;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    layerKey = '';
    schedule();
  }
  function scaleNow() { return Math.min(W, H) / (2 * state.half); }
  function toPx(u, v) { const s = scaleNow(); return [W / 2 + u * s, H / 2 - v * s]; }
  function fromPx(x, y) { const s = scaleNow(); return [(x - W / 2) / s, (H / 2 - y) / s]; }

  /** 格點上計算 ψ 與角度部分 Y（格點在格子中心，永遠不會剛好落在座標軸上） */
  function buildLayer() {
    const key = [info.id, state.Z, state.sum, state.plane, state.off, state.half, state.disp, state.logc, W, H, state.pct, LD.ver, col.bg].join('|');
    if (key === layerKey) return;
    layerKey = key;
    gw = Math.max(90, Math.min(240, Math.round(W / 2.6))); gh = Math.max(60, Math.round(gw * H / W));
    psiGrid = new Float32Array(gw * gh); yGrid = new Float32Array(gw * gh);
    const s = scaleNow(), du = W / s / gw, dv = H / s / gh, u0 = -W / (2 * s), v0 = H / (2 * s);
    for (let j = 0; j < gh; j++) {
      const v = v0 - (j + 0.5) * dv;
      for (let i = 0; i < gw; i++) {
        const u = u0 + (i + 0.5) * du, p = A.slicePoint(state.plane, u, v, state.off);
        psiGrid[j * gw + i] = psiAt(p[0], p[1], p[2]);
        yGrid[j * gw + i] = state.sum ? 1 : A.Y(state.key, p[0], p[1], p[2]);
      }
    }
    layer.width = gw; layer.height = gh;
    const img = lctx.createImageData(gw, gh), d = img.data, pm = info.psiMax || 1;
    for (let k = 0; k < gw * gh; k++) {
      let t = psiGrid[k] / pm;
      // 對數色階：|ψ| 由最大值往下 3 個數量級（|ψ|² 是 6 個數量級）
      if (state.logc) { const a = Math.abs(t); t = a < 1e-3 ? 0 : Math.sign(t) * (1 + Math.log10(a) / 3); }
      let r, g, b;
      if (state.disp === 'phase' && !state.sum) {
        const i = Math.max(0, Math.min(510, Math.round(255 + 255 * t)));
        r = lutP[3 * i]; g = lutP[3 * i + 1]; b = lutP[3 * i + 2];
      } else {
        const i = Math.max(0, Math.min(255, Math.round(255 * Math.abs(t))));
        r = lutD[3 * i]; g = lutD[3 * i + 1]; b = lutD[3 * i + 2];
      }
      d[4 * k] = r; d[4 * k + 1] = g; d[4 * k + 2] = b; d[4 * k + 3] = 255;
    }
    lctx.putImageData(img, 0, 0);
    // 等值線（|ψ| = c，也就是 3D 等值面和切面的交線）與角節面（Y 變號的地方）
    const toP = function (fi, fj) { return [(fi + 0.5) * W / gw, (fj + 0.5) * H / gh]; };
    const c = info.iso.c;
    segIso = marching(function (k) { return Math.abs(psiGrid[k]) - c; }, toP);
    segAng = state.sum || blankNow() ? [] : marching(function (k) { return yGrid[k]; }, toP);
  }
  /** 方格行進法：f(k) 的 0 等值線，傳回線段 [x1, y1, x2, y2] */
  function marching(f, toP) {
    const out = [], val = new Float32Array(gw * gh);
    for (let k = 0; k < gw * gh; k++) val[k] = f(k);
    const lerp = function (a, b) { return a / (a - b); };
    for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const a = val[j * gw + i], b = val[j * gw + i + 1], c2 = val[(j + 1) * gw + i + 1], d = val[(j + 1) * gw + i];
      const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c2 > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const top = function () { return toP(i + lerp(a, b), j); }, right = function () { return toP(i + 1, j + lerp(b, c2)); };
      const bot = function () { return toP(i + lerp(d, c2), j + 1); }, left = function () { return toP(i, j + lerp(a, d)); };
      const add = function (p, q) { out.push(p[0], p[1], q[0], q[1]); };
      switch (idx) {
        case 1: case 14: add(left(), top()); break;
        case 2: case 13: add(top(), right()); break;
        case 3: case 12: add(left(), right()); break;
        case 4: case 11: add(right(), bot()); break;
        case 6: case 9: add(top(), bot()); break;
        case 7: case 8: add(left(), bot()); break;
        case 5: add(left(), top()); add(right(), bot()); break;
        case 10: add(top(), right()); add(left(), bot()); break;
      }
    }
    return out;
  }
  function strokeSegs(seg, color, width, dash) {
    if (!seg.length) return;
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k < seg.length; k += 4) { ctx.moveTo(seg[k], seg[k + 1]); ctx.lineTo(seg[k + 2], seg[k + 3]); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }
  function niceStep(span) {
    const raw = span / 6, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function draw2D() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildLayer();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(layer, 0, 0, W, H);
    // 極淡的暈影
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col.dark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.05)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = scaleNow(), P = A.PLANES[state.plane];
    // 格線（以 a0 為單位）
    const step = niceStep(2 * state.half), c0 = toPx(0, 0);
    LD.grid(ctx, 0, 0, W, H, step * s, step * s / 5 > 6 ? step * s / 5 : 0, c0[0], c0[1]);
    // 座標軸
    ctx.save();
    ctx.strokeStyle = LD.alpha(col.text, 0.38); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, c0[1]); ctx.lineTo(W, c0[1]); ctx.moveTo(c0[0], 0); ctx.lineTo(c0[0], H); ctx.stroke();
    ctx.restore();
    LD.arrow(ctx, W - 34, c0[1], W - 8, c0[1], LD.alpha(col.text, 0.7), 1.6);
    LD.arrow(ctx, c0[0], 34, c0[0], 8, LD.alpha(col.text, 0.7), 1.6);
    rich(ctx, [{ t: P.uName }], W - 10, c0[1] - 8, col.text, { align: 'right', size: 14, weight: 700 });
    rich(ctx, [{ t: P.vName }], c0[0] + 9, 22, col.text, { size: 14, weight: 700 });
    // 刻度
    ctx.save();
    for (let k = -Math.floor(state.half / step); k <= Math.floor(state.half / step); k++) {
      if (!k) continue;
      const p = toPx(k * step, 0), q = toPx(0, k * step);
      if (p[0] > 16 && p[0] < W - 40) LD.haloText(ctx, num(k * step, step < 1 ? 1 : 0), p[0], Math.min(H - 4, c0[1] + 15), LD.alpha(col.text, 0.75), 'center', 'alphabetic', '11px ' + LD.FONT);
      if (q[1] > 40 && q[1] < H - 10) LD.haloText(ctx, num(k * step, step < 1 ? 1 : 0), Math.max(4, c0[0] - 5), q[1] + 4, LD.alpha(col.text, 0.75), 'right', 'alphabetic', '11px ' + LD.FONT);
    }
    ctx.restore();
    // 等值面的切線（實線）
    strokeSegs(segIso, LD.alpha(col.text, col.dark ? 0.85 : 0.75), 1.6);
    // 徑向節面：球面和切面的交線是圓（半徑 √(r² − d²)）
    ctx.save();
    ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeStyle = col.node;
    info.nodes.forEach(function (rn) {
      if (rn <= Math.abs(state.off)) return;
      const rr = Math.sqrt(rn * rn - state.off * state.off) * s;
      ctx.beginPath(); ctx.arc(c0[0], c0[1], rr, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();
    // 角節面
    strokeSegs(segAng, LD.alpha(col.field, col.dark ? 0.9 : 0.8), 2, [3, 5]);
    // 原子核（切面通過原子核時）
    if (Math.abs(state.off) < 0.5 * state.half / 60) LD.ball(ctx, c0[0], c0[1], 4, col.pos, {});
    // 整片切面在節面上
    if (blankNow()) {
      rich(ctx, [{ t: T('整個切面都在節面上：處處 ψ = 0', 'This whole plane is a node: ψ = 0 everywhere') }], W / 2, H / 2 + 34, col.text, { align: 'center', pill: true, size: 14 });
    }
    // 左上：切面說明；右上：軌域名稱
    const offTxt = P.nName + ' = ' + num(state.off, 2) + ' ';
    rich(ctx, [{ t: P.uName + P.vName + T(' 切面，', ' slice, ') + offTxt + 'a' }, { t: '0', sub: true }], 12, 24, col.text, { pill: true, size: 12 });
    if (hiddenQ()) rich(ctx, [{ t: '?' }], W - 14, 26, col.accent, { align: 'right', pill: true, size: 16, weight: 800 });
    else {
      const o = orb(), parts = nameParts(o, state.sum);
      if (state.sum) parts.push({ t: T(' 副層加總', ' subshell (sum)') });
      if (state.Z > 1) parts.push({ t: state.Z === 2 ? '  He' : '  Li' }, { t: state.Z === 2 ? '+' : '2+', sup: true });
      rich(ctx, parts, W - 14, 26, col.accent, { align: 'right', pill: true, size: 16, weight: 700 });
    }
    // 比例尺
    const sb = niceStep(2 * state.half) * s, sbv = niceStep(2 * state.half);
    const bx = 14, by = H - 16;
    ctx.save();
    ctx.strokeStyle = col.text; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + sb, by); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4); ctx.moveTo(bx + sb, by - 4); ctx.lineTo(bx + sb, by + 4); ctx.stroke();
    ctx.restore();
    rich(ctx, a0Parts(num(sbv, sbv < 1 ? 1 : 0) + ' ').concat([{ t: ' = ' + pm(sbv) }]), bx + sb + 10, by + 4, col.text, { pill: true, size: 11 });
    // 探針
    if (state.probe) {
      const p = toPx(state.probe.u, state.probe.v);
      ctx.save();
      ctx.strokeStyle = col.dark ? '#ffffff' : '#111111'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col.probe; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2);
      ctx.moveTo(p[0] - 13, p[1]); ctx.lineTo(p[0] - 4, p[1]); ctx.moveTo(p[0] + 4, p[1]); ctx.lineTo(p[0] + 13, p[1]);
      ctx.moveTo(p[0], p[1] - 13); ctx.lineTo(p[0], p[1] - 4); ctx.moveTo(p[0], p[1] + 4); ctx.lineTo(p[0], p[1] + 13);
      ctx.stroke();
      ctx.restore();
      const pr = probeInfo();
      const txt = '|ψ|² ' + T('＝最大值的 ', '= ') + num(pr.rel * 100, pr.rel < 0.1 ? 2 : 1) + '%' + T('', ' of max');
      const right = p[0] > W - 190;
      rich(ctx, [{ t: txt }], p[0] + (right ? -16 : 16), p[1] - 12, col.probe, { align: right ? 'right' : 'left', pill: true, size: 12 });
    }
  }

  // ======================= 探針 =======================
  function probeInfo() {
    if (!state.probe) return null;
    const p = A.slicePoint(state.plane, state.probe.u, state.probe.v, state.off);
    const r = Math.hypot(p[0], p[1], p[2]);
    const o = orb();
    const d = A.density(o, p[0], p[1], p[2], state.sum);
    const ps = state.sum ? Math.sqrt(d) : A.psi(o, p[0], p[1], p[2]);
    const theta = r > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, p[2] / r))) * 180 / Math.PI : 0;
    return { x: p[0], y: p[1], z: p[2], r: r, theta: theta, d: d, rel: info.maxD > 0 ? d / info.maxD : 0,
      sign: state.sum ? 0 : Math.abs(ps) < 1e-12 * info.psiMax ? 0 : ps > 0 ? 1 : -1 };
  }
  function setProbe(u, v, quiet) {
    const lim = state.half * 1.5;
    state.probe = { u: Math.max(-lim, Math.min(lim, u)), v: Math.max(-lim, Math.min(lim, v)) };
    schedule(); renderReadouts();
    if (!quiet) {
      const p = probeInfo();
      emit('probe', { px: p.x, py: p.y, pz: p.z, pr: p.r, theta: p.theta, rel: p.rel, sign: p.sign });
    }
  }
  let dragging = false;
  function canvasPoint(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (ev) {
    acted(); dragging = true;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    const p = fromPx.apply(null, canvasPoint(cv, ev)); setProbe(p[0], p[1]);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!dragging) return;
    const p = fromPx.apply(null, canvasPoint(cv, ev)); setProbe(p[0], p[1]);
  });
  const endDrag = function () { dragging = false; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('keydown', function (e) {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!k) return;
    e.preventDefault(); acted();
    const st = state.half / (e.shiftKey ? 200 : 40), pr = state.probe || { u: 0, v: 0 };
    setProbe(pr.u + k[0] * st, pr.v + k[1] * st);
  });

  // ======================= 徑向分布圖 =======================
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let GW = 0, GH = 0, gdpr = 1, gx = null;
  const PIN_COLORS = ['neg', 'pos', 'equi', 'probe', 'field', 'muted'];
  function resizeGraph() {
    gdpr = Math.min(window.devicePixelRatio || 1, 2.5);
    GW = gcv.clientWidth || 400; GH = gcv.clientHeight || 300;
    gcv.width = Math.round(GW * gdpr); gcv.height = Math.round(GH * gdpr);
    schedule();
  }
  function curveTable(p) { return A.radialTable(p.n, p.l, p.Z, A.rCut(p.n, p.Z), 1500); }
  function graphRange() {
    let xr = info.r995 * 1.04, ym = 0;
    pinned.forEach(function (p) { xr = Math.max(xr, p.r995 * 1.04); });
    const curves = [{ tab: info.tab }].concat(pinned.map(function (p) { return { tab: p.tab }; }));
    curves.forEach(function (c) { for (let i = 0; i <= c.tab.N; i++) if (c.tab.r[i] <= xr && c.tab.P[i] > ym) ym = c.tab.P[i]; });
    return { xr: xr, ym: ym * 1.14 };
  }
  function drawGraph() {
    if (!GW) return;
    const g = gctx;
    g.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    LD.backdrop(g, GW, GH);
    const L = 50, Rm = state.showR ? 46 : 16, Tm = 26, B = 40;
    const pw = GW - L - Rm, ph = GH - Tm - B;
    const rg = graphRange();
    gx = { L: L, T: Tm, pw: pw, ph: ph, xr: rg.xr };
    const X = function (r) { return L + r / rg.xr * pw; }, Yp = function (v) { return Tm + ph - v / rg.ym * ph; };
    // 格線與刻度
    const st = niceStep(rg.xr);
    LD.grid(g, L, Tm, L + pw, Tm + ph, st / rg.xr * pw, 0, L, Tm + ph);
    g.save();
    g.strokeStyle = LD.alpha(col.text, 0.5); g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, Tm); g.lineTo(L, Tm + ph); g.lineTo(L + pw, Tm + ph); g.stroke();
    g.restore();
    for (let r = 0; r <= rg.xr + 1e-9; r += st) LD.haloText(g, num(r, st < 1 ? 1 : 0), X(r), Tm + ph + 15, LD.alpha(col.text, 0.8), 'center', 'alphabetic', '11px ' + LD.FONT);
    rich(g, [{ t: T('r（', 'r (') }, { t: 'a' }, { t: '0', sub: true }, { t: T('）', ')') }], L + pw, GH - 6, col.text, { align: 'right', size: 12 });
    rich(g, [{ t: 'P(r) = r' }, { t: '2', sup: true }, { t: 'R' }, { t: '2', sup: true }], L + 4, Tm - 9, col.text, { size: 12 });
    // 保留的曲線
    pinned.forEach(function (p, i) {
      const c = col[PIN_COLORS[i % PIN_COLORS.length]] || LD.c[PIN_COLORS[i % PIN_COLORS.length]];
      g.save();
      g.beginPath();
      for (let k = 0; k <= 400; k++) { const r = rg.xr * k / 400, v = A.lookup(p.tab, p.tab.P, r); if (k) g.lineTo(X(r), Yp(v)); else g.moveTo(X(r), Yp(v)); }
      g.strokeStyle = c; g.lineWidth = 1.8; g.setLineDash([7, 4]); g.lineCap = 'round'; g.stroke();
      g.restore();
      const rp = A.rMax(p.n, p.l, p.Z);
      if (rp <= rg.xr) {
        const parts = [{ t: p.n + LN[p.l] }];
        if (p.Z > 1) parts.push({ t: p.Z === 2 ? ' He' : ' Li' }, { t: p.Z === 2 ? '+' : '2+', sup: true });
        rich(g, parts, X(rp), Yp(A.radialP(p.n, p.l, rp, p.Z)) - 6, c, { align: 'center', pill: true, size: 11 });
      }
    });
    // 目前的曲線：填色＋游標以內的累積面積
    const N = Math.max(200, Math.round(pw));
    const path = function () {
      g.beginPath(); g.moveTo(X(0), Yp(0));
      for (let k = 0; k <= N; k++) { const r = rg.xr * k / N; g.lineTo(X(r), Yp(A.lookup(info.tab, info.tab.P, r))); }
    };
    g.save();
    path(); g.lineTo(X(rg.xr), Yp(0)); g.closePath();
    const gr = g.createLinearGradient(0, Tm, 0, Tm + ph);
    gr.addColorStop(0, LD.alpha(col.accent, col.dark ? 0.32 : 0.22)); gr.addColorStop(1, LD.alpha(col.accent, 0.04));
    g.fillStyle = gr; g.fill();
    // 游標以內
    const rc = Math.min(state.cur, rg.xr);
    g.beginPath(); g.moveTo(X(0), Yp(0));
    for (let k = 0; k <= N; k++) { const r = rc * k / N; g.lineTo(X(r), Yp(A.lookup(info.tab, info.tab.P, r))); }
    g.lineTo(X(rc), Yp(0)); g.closePath();
    g.fillStyle = LD.alpha(col.accent, col.dark ? 0.5 : 0.38); g.fill();
    path();
    g.strokeStyle = col.accent; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    g.restore();
    // R(r) 疊圖（任意單位，正負看得出來）
    if (state.showR) {
      let rmx = 0;
      for (let i = 0; i <= info.tab.N; i++) if (info.tab.r[i] <= rg.xr) rmx = Math.max(rmx, Math.abs(info.tab.R[i]));
      const y0 = Tm + ph * 0.5, Yr = function (v) { return y0 - v / (rmx || 1) * ph * 0.45; };
      g.save();
      g.strokeStyle = LD.alpha(col.text, 0.25); g.setLineDash([2, 4]); g.beginPath(); g.moveTo(L, y0); g.lineTo(L + pw, y0); g.stroke();
      g.setLineDash([5, 4]); g.strokeStyle = col.field; g.lineWidth = 1.6; g.beginPath();
      for (let k = 0; k <= N; k++) { const r = rg.xr * k / N, v = A.lookup(info.tab, info.tab.R, r); if (k) g.lineTo(X(r), Yr(v)); else g.moveTo(X(r), Yr(v)); }
      g.stroke();
      g.restore();
      rich(g, [{ t: 'R(r)' }], L + pw + 4, y0 - ph * 0.45 + 4, col.field, { size: 11 });
      LD.haloText(g, '0', L + pw + 6, y0 + 4, col.muted, 'left', 'alphabetic', '10px ' + LD.FONT);
    }
    // 徑向節面、最可能半徑、平均半徑
    info.nodes.forEach(function (rn) {
      if (rn > rg.xr) return;
      g.save(); g.setLineDash([4, 4]); g.strokeStyle = col.node; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X(rn), Tm + 4); g.lineTo(X(rn), Tm + ph); g.stroke(); g.restore();
      g.save(); g.fillStyle = col.node; g.beginPath(); g.arc(X(rn), Tm + ph, 4.5, 0, Math.PI * 2); g.fill(); g.restore();
    });
    if (!hiddenQ()) {
      const xm = X(info.rMax), ym = Yp(A.radialP(state.n, state.l, info.rMax, state.Z));
      g.save(); g.fillStyle = col.accent; g.beginPath(); g.moveTo(xm, ym - 5); g.lineTo(xm - 6, ym - 15); g.lineTo(xm + 6, ym - 15); g.closePath(); g.fill(); g.restore();
      rich(g, [{ t: 'r' }, { t: 'max', sub: true }], xm, ym - 19, col.accent, { align: 'center', size: 12 });
      if (info.mean <= rg.xr) {
        const xa = X(info.mean);
        g.save(); g.strokeStyle = LD.alpha(col.text, 0.55); g.lineWidth = 1.5; g.beginPath(); g.moveTo(xa, Tm + ph - 10); g.lineTo(xa, Tm + ph + 4); g.stroke(); g.restore();
        rich(g, [{ t: '⟨r⟩' }], xa, Tm + ph - 13, col.muted, { align: 'center', size: 11 });
      }
    }
    // 游標
    const xc = X(rc);
    g.save(); g.strokeStyle = col.text; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(xc, Tm); g.lineTo(xc, Tm + ph); g.stroke(); g.restore();
    LD.ball(g, xc, Tm + ph, 6.5, col.accent, {});
    const cum = A.lookup(info.tab, info.tab.C, state.cur);
    const right = xc > L + pw - 150;
    rich(g, a0Parts('r = ' + num(state.cur, 3) + ' ').concat([{ t: T('，以內 ', ', inside ') + num(cum * 100, 1) + '%' }]),
      xc + (right ? -8 : 8), Tm + 16, col.text, { align: right ? 'right' : 'left', pill: true, size: 12 });
    // 測驗中：曲線名稱是 ?
    if (hiddenQ()) rich(g, [{ t: '?' }], L + pw - 6, Tm + 16, col.accent, { align: 'right', pill: true, size: 14, weight: 800 });
  }
  function setCursor(r, from) {
    const old = state.cur;
    state.cur = Math.max(0, Math.min(CUR_MAX, r));
    if (from !== 'slider') { if (window.LabNum) window.LabNum.set(elCur, state.cur); else elCur.value = curPos(state.cur); }
    $('curo').innerHTML = num(state.cur, 3) + ' ' + A0H;
    // 穿過徑向節面：一聲短促的「喀」
    info.nodes.forEach(function (rn, i) {
      if ((old - rn) * (state.cur - rn) <= 0 && old !== state.cur && snd()) window.LabSound.tone({ freq: 1320, dur: 0.035, gain: 0.05, type: 'square' });
      if (Math.abs(state.cur - rn) <= 0.05 / state.Z) hits[i] = true;
    });
    schedule(); renderReadouts();
    emit('cursor', {});
  }
  let gDrag = false;
  function gEvent(ev) {
    if (!gx) return;
    const p = canvasPoint(gcv, ev), r = (p[0] - gx.L) / gx.pw * gx.xr;
    setCursor(Math.max(0, Math.min(gx.xr, r)), 'graph');
  }
  gcv.addEventListener('pointerdown', function (ev) { acted(); gDrag = true; try { gcv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } gEvent(ev); });
  gcv.addEventListener('pointermove', function (ev) { if (gDrag) gEvent(ev); });
  gcv.addEventListener('pointerup', function () { gDrag = false; });
  gcv.addEventListener('pointercancel', function () { gDrag = false; });
  gcv.addEventListener('keydown', function (e) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d || !gx) return;
    e.preventDefault(); acted();
    setCursor(state.cur + d * gx.xr / (e.shiftKey ? 2000 : 400), 'graph');
  });

  // ======================= 讀數 =======================
  function row(dt, dd, cls) { return '<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; }
  function a0h(r) { return rStr(r) + ' ' + A0H; }
  function renderReadouts() {
    const o = orb(), hq = hiddenQ(), Q = '?';
    let h = '';
    const mList = function () {
      const m = A.ANG[state.key].m;
      if (state.sum) return T('全部 ', 'all ') + (2 * state.l + 1) + T(' 個（', ' (') + (state.l ? '−' + state.l + ' … +' + state.l : '0') + T('）', ')');
      return m === 0 ? '0' : '±' + m + T(' 組合', ' (combined)');
    };
    h += row(T('軌域', 'Orbital'), hq ? Q : nameHtml(o, state.sum) + (state.sum ? T('（副層加總）', ' (subshell sum)') : ''), 'big');
    h += row(T('主量子數 n', 'Principal n'), hq ? Q : String(state.n));
    h += row(T('角量子數 l', 'Angular l'), hq ? Q : state.l + T('（' + LN[state.l] + '）', ' (' + LN[state.l] + ')'));
    h += row(T('磁量子數 m<sub>l</sub>', 'Magnetic m<sub>l</sub>'), hq ? Q : mList());
    h += row(T('能量 E<sub>n</sub>', 'Energy E<sub>n</sub>'), hq ? Q : num(A.energyEV(state.n, state.Z), 3) + ' eV<br>' + num(A.energyKJ(state.n, state.Z), 0) + ' kJ/mol');
    h += row(T('徑向節面', 'Radial nodes'), hq ? Q : info.nodes.length + T(' 個', '') + (info.nodes.length ? '<br>r = ' + info.nodes.map(rStr).join(', ') + ' ' + A0H : ''), 'wr');
    h += row(T('角節面', 'Angular nodes'), hq ? Q : state.sum ? T('加總後沒有（球形）', 'none after summing (spherical)') :
      info.ang.length + T(' 個', '') + (info.ang.length ? '<br>' + info.ang.map(function (a) { return T(a.zh, a.en); }).join(T('、', '; ')) : ''), 'wr');
    h += row(T('節面總數', 'Total nodes'), hq ? Q : (state.sum ? info.nodes.length : state.n - 1) + (state.sum ? '' : ' = n − 1'));
    h += row(T('最可能半徑', 'Most probable radius'), hq ? Q : a0h(info.rMax) + '<br>' + pm(info.rMax));
    h += row(T('平均半徑 ⟨r⟩', 'Mean radius ⟨r⟩'), hq ? Q : a0h(info.mean) + '<br>' + pm(info.mean));
    h += row(T('90% 的機率在半徑', '90% probability within'), hq ? Q : a0h(info.r90) + T(' 以內', ''));
    $('qOut').innerHTML = h;
    // 游標與探針
    const cum = A.lookup(info.tab, info.tab.C, state.cur), P = A.radialP(state.n, state.l, state.cur, state.Z);
    let c = '';
    c += row(T('游標半徑 r', 'Cursor radius r'), num(state.cur, 3) + ' ' + A0H + '<br>' + pm(state.cur));
    c += row(T('徑向分布 P(r)', 'Radial distribution P(r)'), sciH(P) + ' ' + A0H + SUP_M1);
    c += row(T('0 到 r 的機率', 'Probability from 0 to r'), num(cum * 100, 2) + '%', 'big');
    const pr = probeInfo();
    if (!pr) c += row(T('探針', 'Probe'), T('點 2D 切面放探針', 'tap the 2D slice'), 'wr');
    else {
      c += row(T('探針位置 (x, y, z)', 'Probe position (x, y, z)'), '(' + [pr.x, pr.y, pr.z].map(function (v) { return num(v, 2); }).join(', ') + ') ' + A0H, 'wr');
      c += row(T('探針離原子核', 'Probe distance r'), a0h(pr.r) + '<br>θ = ' + num(pr.theta, 1) + '°' + T('（與 +z 軸）', ' (from +z)'));
      c += row(T('探針處 ψ 的正負', 'Sign of ψ at the probe'), state.sum ? T('—（加總沒有正負）', '— (sum has no sign)') : pr.sign > 0 ? '+' : pr.sign < 0 ? '−' : T('0（在節面上）', '0 (on a node)'));
      c += row(T('探針處的密度 |ψ|<sup>2</sup>', 'Density |ψ|<sup>2</sup> at the probe'), sciH(pr.d) + ' ' + A0H + '<sup>−3</sup><br>' + T('＝最大值的 ', '= ') + num(pr.rel * 100, 2) + '%' + T('', ' of max'));
    }
    $('cOut').innerHTML = c;
  }

  // ======================= 控制項 =======================
  const elOff = $('off'), elZoom = $('zoom'), elPct = $('pct'), elCur = $('cur');
  const zToV = function (p) { return Math.pow(100, p / 1000); }, vToZ = function (v) { return 1000 * Math.log(v) / Math.log(100); };
  const curVal = function (p) { return CUR_MAX * Math.pow(p / 1000, 2); }, curPos = function (r) { return 1000 * Math.sqrt(r / CUR_MAX); };
  if (window.LabNum) {
    window.LabNum.register(elZoom, { toValue: zToV, toPos: vToZ, min: 1, max: 100, decimals: 1 });
    window.LabNum.register(elCur, { toValue: curVal, toPos: curPos, min: 0, max: CUR_MAX, decimals: 3 });
  }
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  function setSlider(el, v) { if (window.LabNum) window.LabNum.set(el, v); else el.value = v; }

  function buildKeys() {
    const box = $('kPick');
    box.innerHTML = '';
    A.KEYS[state.l].forEach(function (k) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.key = k;
      b.innerHTML = A.ANG[k].html;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { acted(); userPick(state.n, state.l, k); });
      box.appendChild(b);
    });
  }
  function syncUI() {
    const hq = hiddenQ();
    document.querySelectorAll('#nPick button').forEach(function (b) { b.setAttribute('aria-pressed', String(!hq && +b.dataset.n === state.n)); });
    document.querySelectorAll('#lPick button').forEach(function (b) {
      const l = +b.dataset.l;
      b.disabled = !hq && l >= state.n;
      b.setAttribute('aria-pressed', String(!hq && l === state.l));
    });
    if ($('kPick').dataset.l !== String(state.l) || !$('kPick').children.length) { buildKeys(); $('kPick').dataset.l = String(state.l); }
    document.querySelectorAll('#kPick button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(!hq && b.dataset.key === state.key));
      b.disabled = state.sum && !hq;
    });
    document.querySelectorAll('#zPick button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.z === state.Z)); });
    document.querySelectorAll('#planePick button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.plane === state.plane)); });
    const ph = $('dispPick').querySelector('[data-disp="phase"]');
    ph.disabled = state.sum;
    document.querySelectorAll('#dispPick button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.disp === (state.sum ? 'dens' : state.disp))); });
    document.querySelectorAll('#stylePick button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.style === state.style)); });
    $('sumChk').checked = state.sum; $('sumChk').disabled = hq;
    $('autoChk').checked = state.auto; $('logChk').checked = state.logc;
    elZoom.disabled = state.auto;
    $('nodeChk').checked = state.nodes3; $('cutChk').checked = state.cut; $('planeChk').checked = state.plane3; $('rChk').checked = state.showR;
    $('offLabel').textContent = T('切面位置 ', 'Slice position ') + A.PLANES[state.plane].nName + T('（離原子核的距離）', ' (distance from the nucleus)');
    $('offo').innerHTML = num(state.off, 2) + ' ' + A0H;
    $('zoomo').innerHTML = num(state.half, 1) + ' ' + A0H;
    $('pcto').textContent = state.pct + '%';
    $('curo').innerHTML = num(state.cur, 3) + ' ' + A0H;
    $('pinBtn').disabled = hq;
    updateLegend();
  }
  function updateLegend() {
    let h = '';
    const rampD = 'linear-gradient(90deg,' + [0, 64, 128, 192, 255].map(function (i) { return lutCss(lutD, i); }).join(',') + ')';
    const rampP = 'linear-gradient(90deg,' + [0, 128, 255, 383, 510].map(function (i) { return lutCss(lutP, i); }).join(',') + ')';
    if (state.view === '3d') {
      if (state.sum) h += '<span><span class="sw" style="background:' + col.accent + '"></span>' + T('副層加總（沒有正負）', 'subshell sum (no sign)') + '</span>';
      else h += '<span><span class="sw" style="background:' + col.pos + '"></span>ψ &gt; 0</span><span><span class="sw" style="background:' + col.neg + '"></span>ψ &lt; 0</span>';
      h += '<span><span class="sw" style="background:' + LD.alpha(col.node, 0.6) + '"></span>' + T('節面', 'nodes') + '</span>';
    } else {
      const sc = state.logc ? T('（對數：3 個數量級）', ' (log scale, 3 decades)') : '';
      if (state.disp === 'phase' && !state.sum) h += '<span>−<span class="ramp" style="background:' + rampP + '"></span>+ ' + T('ψ 的正負（深淺 ∝ |ψ|）', 'sign of ψ (strength ∝ |ψ|)') + sc + '</span>';
      else h += '<span>0<span class="ramp" style="background:' + rampD + '"></span>' + T('最大　顏色深淺 ∝ |ψ| = √|ψ|²', 'max  colour ∝ |ψ| = √|ψ|²') + sc + '</span>';
      h += '<span><span class="ln" style="border-color:' + LD.alpha(col.text, 0.75) + '"></span>' + T('等值面（包住 ', 'isosurface (') + state.pct + T('% 機率）', '% inside)') + '</span>';
      h += '<span><span class="ln dash" style="border-color:' + col.node + '"></span>' + T('徑向節面', 'radial node') + '</span>';
      if (!state.sum) h += '<span><span class="ln dash" style="border-color:' + col.field + '"></span>' + T('角節面', 'angular node') + '</span>';
    }
    $('legend').innerHTML = h;
    let g = '<span><span class="ln" style="border-color:' + col.accent + '"></span>' + (hiddenQ() ? '?' : nameHtml(orb(), state.sum)) + '</span>';
    g += '<span><span class="ln dash" style="border-color:' + col.node + '"></span>' + T('徑向節面', 'radial node') + '</span>';
    if (pinned.length) g += '<span>' + T('虛線：保留的曲線', 'dashed: kept curves') + '</span>';
    $('gLegend').innerHTML = g;
  }
  function applyAuto() {
    if (state.auto) { state.half = info.autoHalf; setSlider(elZoom, state.half); }
    if (state.probe) state.probe = null;
  }
  function refreshAll() {
    syncUI();
    renderReadouts();
    if (view3) view3.update('all');
    schedule();
  }
  let rafId = 0;
  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = 0; draw2D(); drawGraph(); });
  }

  /** 換軌域（使用者按的） */
  function userPick(n, l, key) {
    if (hiddenQ()) endRound(T('自己換了軌域，這一題算放棄。', 'You changed the orbital yourself, so this round is given up.'));
    if (l >= n) l = n - 1;
    if (A.ANG[key] == null || A.ANG[key].l !== l) key = DEF_KEY[l];
    const changed = n !== state.n || l !== state.l || key !== state.key;
    state.n = n; state.l = l; state.key = key;
    if (!state.sum) seen.add(A.id(orb()));
    derive(); applyAuto(); refreshAll();
    if (changed && snd()) {
      const f = 300 + 520 * (1 - 1 / (n * n)) + 30 * l;   // 能階越高越擠在一起：音高也越來越近
      window.LabSound.tone({ freq: f, dur: 0.16, gain: 0.06, type: 'sine' });
    }
    emit('state', {});
  }
  document.querySelectorAll('#nPick button').forEach(function (b) { b.addEventListener('click', function () { acted(); const n = +b.dataset.n; userPick(n, Math.min(state.l, n - 1), state.key); }); });
  document.querySelectorAll('#lPick button').forEach(function (b) { b.addEventListener('click', function () { acted(); const l = +b.dataset.l; userPick(state.n, l, l === state.l ? state.key : DEF_KEY[l]); }); });
  document.querySelectorAll('#zPick button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const z = +b.dataset.z;
      if (z === state.Z) return;
      state.Z = z; derive(); applyAuto(); refreshAll();
      if (snd()) window.LabSound.sweep({ from: 420, to: 420 + 160 * z, dur: 0.16, gain: 0.05 });
      emit('state', {});
    });
  });
  $('sumChk').addEventListener('change', function () {
    acted();
    state.sum = this.checked;
    if (!state.sum) seen.add(A.id(orb()));
    derive(); layerKey = ''; refreshAll();
    // 探針還在：附上「單一軌域在這個方向的角度部分」與加總後的密度，給「縫隙被補滿」的判定用
    const pi = probeInfo(), ex = {};
    if (pi && pi.r > 1e-9) { ex.pAng = Math.abs(A.Y(state.key, pi.x, pi.y, pi.z)) / A.maxAbsY(state.key); ex.pRel = pi.rel; }
    emit('state', ex);
  });
  document.querySelectorAll('#planePick button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const wasBlank = blankNow();
      state.plane = b.dataset.plane; refreshAll(); blankSound(wasBlank);
      emit('state', {});
    });
  });
  function blankSound(was) {
    if (!was && blankNow() && snd()) window.LabSound.sweep({ from: 700, to: 300, dur: 0.25, gain: 0.05, type: 'triangle' });
  }
  elOff.addEventListener('input', function () {
    acted();
    const wasBlank = blankNow(), old = state.off;
    state.off = val(elOff);
    // 切面穿過原子核：一聲提示（節面平面都通過原子核）
    if (old * state.off <= 0 && old !== state.off && snd()) window.LabSound.tone({ freq: 880, dur: 0.05, gain: 0.04, type: 'triangle' });
    syncUI(); renderReadouts(); schedule(); if (view3) view3.update('slice'); blankSound(wasBlank);
    emit('state', {});
  });
  document.querySelectorAll('#dispPick button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.disp = b.dataset.disp; refreshAll(); emit('state', {}); });
  });
  elZoom.addEventListener('input', function () { acted(); state.half = val(elZoom); syncUI(); schedule(); if (view3) view3.update('slice'); });
  $('autoChk').addEventListener('change', function () {
    acted(); state.auto = this.checked;
    if (state.auto) { state.half = info.autoHalf; setSlider(elZoom, state.half); }
    syncUI(); schedule(); if (view3) view3.update('slice');
  });
  document.querySelectorAll('#stylePick button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.style = b.dataset.style; syncUI(); if (view3) view3.update('opts'); emit('opts3d', {}); });
  });
  elPct.addEventListener('input', function () {
    acted();
    state.pct = Math.round(val(elPct));
    info.iso = isoFor(orb(), state.pct, state.sum);
    layerKey = ''; syncUI(); schedule(); if (view3) view3.update('iso');
    emit('opts3d', {});
  });
  $('nodeChk').addEventListener('change', function () { acted(); state.nodes3 = this.checked; if (view3) view3.update('opts'); emit('opts3d', {}); });
  $('cutChk').addEventListener('change', function () { acted(); state.cut = this.checked; if (view3) view3.update('opts'); emit('opts3d', {}); });
  $('planeChk').addEventListener('change', function () { acted(); state.plane3 = this.checked; if (view3) view3.update('slice'); emit('opts3d', {}); });
  $('logChk').addEventListener('change', function () { acted(); state.logc = this.checked; syncUI(); schedule(); });
  $('rChk').addEventListener('change', function () { acted(); state.showR = this.checked; schedule(); });
  elCur.addEventListener('input', function () { acted(); setCursor(val(elCur), 'slider'); });
  $('pinBtn').addEventListener('click', function () {
    acted();
    if (hiddenQ()) return;
    const k = state.n + ',' + state.l + ',' + state.Z;
    if (!pinned.some(function (p) { return p.n + ',' + p.l + ',' + p.Z === k; })) {
      if (pinned.length >= 6) pinned.shift();
      const p = { n: state.n, l: state.l, Z: state.Z, r995: info.r995 };
      p.tab = curveTable(p);
      pinned.push(p);
      if (snd()) window.LabSound.tone({ freq: 660, dur: 0.08, gain: 0.05 });
      $('status').textContent = T('已保留 ', 'Kept ') + state.n + LN[state.l] + T(' 的徑向分布曲線（共 ', ' radial curve (') + pinned.length + T(' 條）。', ' in all).');
    } else $('status').textContent = T('這條曲線已經保留了。', 'This curve is already kept.');
    updateLegend(); schedule();
    emit('pin', {});
  });
  $('clearAll').addEventListener('click', function () {
    acted();
    pinned.length = 0;
    $('status').textContent = T('已清除保留的曲線。', 'The kept curves were cleared.');
    updateLegend(); schedule();
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // ======================= 認軌域 =======================
  function fillKeySelect() {
    const l = +$('qL').value, sel = $('qK'), old = sel.value;
    sel.innerHTML = '<option value="">' + T('（不指定）', '(not chosen)') + '</option>' +
      A.KEYS[l].map(function (k) { return '<option value="' + k + '">' + A.ANG[k].txt + '</option>'; }).join('');
    if (A.KEYS[l].indexOf(old) >= 0) sel.value = old;
  }
  function setQuizUI() {
    $('quizIn').hidden = !hiddenQ();
    $('quizNext').hidden = !quiz.on || hiddenQ();
    $('quizOn').hidden = quiz.on;
    renderQuizTable();
  }
  function renderQuizTable() {
    const t = $('quizTbl');
    if (!quiz.hist.length) { t.innerHTML = '<tr class="empty"><td>' + T('還沒有紀錄', 'No answers yet') + '</td></tr>'; return; }
    let h = '<tr><th>#</th><th>' + T('你的答案', 'Your answer') + '</th><th>' + T('正確答案', 'Answer') + '</th><th>' + T('結果', 'Result') + '</th></tr>';
    quiz.hist.slice().reverse().forEach(function (r) {
      h += '<tr><td>' + r.k + '</td><td>' + r.ans + '</td><td>' + r.right + '</td><td>' + (r.give ? T('看答案', 'shown') : r.exact ? T('全對 ★', 'exact ★') : r.hit ? T('對', 'right') : T('錯', 'wrong')) + '</td></tr>';
    });
    t.innerHTML = h;
  }
  function startRound() {
    acted();
    const o = A.pickQuiz(Math.random, quiz.prev);
    quiz.on = true; quiz.o = o; quiz.revealed = false; quiz.prev = A.id(o); quiz.n++;
    state.n = o.n; state.l = o.l; state.key = o.key; state.sum = false;
    const b = A.bestPlane(o.key);
    derive();
    state.plane = b.plane; state.off = Math.round(b.offsetFrac * info.rMax * 100) / 100; setSlider(elOff, state.off);
    state.auto = true; applyAuto();
    $('quizQ').textContent = T('第 ', 'Question ') + quiz.n + T(' 題：這是哪一個軌域？（連續答對 ', ': which orbital is this? (streak ') + quiz.streak + T('）', ')');
    $('quizOut').textContent = '';
    $('qN').value = '1'; $('qL').value = '0'; fillKeySelect();
    setQuizUI(); refreshAll();
    if (snd()) window.LabSound.sweep({ from: 520, to: 880, dur: 0.18, gain: 0.05, type: 'triangle' });
  }
  function reveal() {
    quiz.revealed = true;
    setQuizUI(); refreshAll();
  }
  function endRound(msg) {
    quiz.streak = 0; quiz.exact = 0;
    $('quizOut').textContent = msg;
    reveal();
  }
  function checkQuiz() {
    if (!hiddenQ()) return;
    acted();
    const o = quiz.o, an = +$('qN').value, al = +$('qL').value, ak = $('qK').value;
    const hit = an === o.n && al === o.l, exact = hit && ak === o.key;
    quiz.streak = hit ? quiz.streak + 1 : 0;
    quiz.exact = exact ? quiz.exact + 1 : 0;
    quiz.best = Math.max(quiz.best, quiz.streak);
    const ansTxt = an + LN[al] + (ak ? '（' + A.ANG[ak].txt.slice(1) + '）' : '');
    quiz.hist.push({ k: quiz.n, ans: ansTxt, right: A.html(o), hit: hit, exact: exact });
    if (quiz.hist.length > 30) quiz.hist.shift();
    const nr = o.n - o.l - 1;
    $('quizOut').innerHTML = (hit ? (exact ? T('完全正確！', 'Exactly right!') : T('答對了！', 'Right!')) : T('不對，', 'Not quite: ')) +
      T('答案是 ', 'it is ') + A.html(o) + T('：徑向節面 ', ' — ') + nr + T(' 個、角節面 ', ' radial and ') + o.l + T(' 個。', ' angular nodes.') +
      T('連續答對 ', ' Streak ') + quiz.streak + T('，最佳 ', ', best ') + quiz.best + T('。', '.');
    if (snd()) {
      if (hit) { window.LabSound.tone({ freq: 784, dur: 0.1, gain: 0.08 }); window.LabSound.tone({ freq: exact ? 1568 : 1175, dur: 0.18, gain: 0.08, delay: 0.11 }); }
      else window.LabSound.tone({ freq: 392, dur: 0.16, gain: 0.07, type: 'triangle' });
    }
    reveal();
    emit('quiz', { hit: hit, exact: exact, ql: o.l, qn: o.n, qkey: o.key, ansN: an, ansL: al, ansKey: ak, streak: quiz.streak, exactStreak: quiz.exact });
  }
  function giveUp() {
    if (!hiddenQ()) return;
    acted();
    quiz.hist.push({ k: quiz.n, ans: '—', right: A.html(quiz.o), give: true });
    endRound(T('答案是 ', 'It is ') + A.text(quiz.o) + T('。連勝歸零。', '. The streak is reset.'));
  }
  function clearQuiz() {
    acted();
    quiz.hist = []; quiz.streak = 0; quiz.exact = 0; quiz.best = 0; quiz.n = 0;
    if (hiddenQ()) reveal();
    quiz.on = false;
    $('quizQ').textContent = ''; $('quizOut').textContent = T('紀錄已清除。', 'The record was cleared.');
    setQuizUI();
  }
  $('quizOn').addEventListener('click', startRound);
  $('quizNext').addEventListener('click', startRound);
  $('quizCheck').addEventListener('click', checkQuiz);
  $('quizGive').addEventListener('click', giveUp);
  $('quizClear').addEventListener('click', clearQuiz);
  $('qL').addEventListener('change', fillKeySelect);

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function host3Api() {
    return {
      T: T, host: host3, A: A,
      orbital: function () { return { n: state.n, l: state.l, key: state.key, Z: state.Z, sum: state.sum }; },
      opts: function () { return { style: state.style, pct: state.pct, nodes: state.nodes3, cut: state.cut, plane3: state.plane3, plane: state.plane, off: state.off, half: state.half }; },
      info: function () { return info; },
      hidden: hiddenQ,
      colors: function () { return col; },
      hud: function () {
        const o = orb();
        const nm = hiddenQ() ? '?' : (state.sum ? o.n + LN[o.l] + T(' 副層加總', ' subshell (sum)') : A.text(o)) + (state.Z === 2 ? '  He+' : state.Z === 3 ? '  Li2+' : '');
        return {
          tl: nm,
          tr: (state.style === 'cloud' ? T('機率雲：依 |ψ|² 抽 15000 點', 'Dot cloud: 15 000 points') : T('等值面包住 ', 'Isosurface: ') + state.pct + T('% 的機率', '% inside')) +
            '\n' + T('最遠到 ', 'reaches ') + rStr(info.iso.rOut) + ' a0 = ' + pm(info.iso.rOut)
        };
      },
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
    };
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.AO3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.AO3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        $('stageHint').hidden = false;
        updateLegend();
        emit('view3d', {});
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateLegend();
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateLegend();
    resize();
  }
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ======================= 主題、字體、尺寸 =======================
  function themeChanged() {
    readColors();
    if (view3) view3.onTheme();
    fillKeySelect();
    updateSoundButton();
    refreshAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  }
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') { resize(); resizeGraph(); }
  });
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', function () { resize(); resizeGraph(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(); });

  // 測試用（Playwright；名稱不可用 __pt，那是試玩工具自己用的）
  window.__ao = {
    state: state, quiz: quiz, pinned: pinned, info: function () { return info; }, snap: function () { return snap(); },
    pick: function (n, l, key) { acted(); userPick(n, l, key); },
    probeAt: function (u, v) { acted(); setProbe(u, v); },
    cursor: function (r) { acted(); setCursor(r, 'graph'); },
    px: toPx
  };

  // ======================= 啟動 =======================
  readColors();
  updateSoundButton();
  derive();
  state.half = info.autoHalf;
  setSlider(elOff, 0); setSlider(elZoom, state.half); setSlider(elPct, state.pct); setSlider(elCur, state.cur);
  fillKeySelect();
  setQuizUI();
  resize(); resizeGraph();
  refreshAll();
})();
