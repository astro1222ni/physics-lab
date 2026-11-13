/* big-o.js — 「時間複雜度：成長速度的比較」的畫面與互動（計算在 big-o-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 五個小演算法真的在資料上執行（BigOCore.run），賽跑時共用一個時鐘、每一拍各做一次操作，
 * 每條跑道畫出「做了這麼多次操作之後」演算法真正的狀態。
 * 任務事件的資料由核心的 laneEvent／raceEvent／doubleEvent／compareEvent 產生（任務證明用的是同一套函式）。 */
(function () {
  'use strict';
  const B = window.BigOCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade, mix = D.mix;

  // ---------- 滑桿的換算（對數刻度） ----------
  const POS = 1000;
  function logFromPos(p, max) { return Math.max(1, Math.min(max, Math.round(Math.pow(max, p / POS)))); }
  function posFromLog(v, max) { return POS * Math.log(Math.max(1, v)) / Math.log(max); }
  const nFromPos = function (p) { return logFromPos(p, B.MAX_N); };
  const posFromN = function (n) { return posFromLog(n, B.MAX_N); };
  const cFromPos = function (p) { return logFromPos(p, 1000); };
  const posFromC = function (c) { return posFromLog(c, 1000); };
  const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
  const speedFromPos = function (p) { return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, Math.round(p)))]; };
  function posFromSpeed(v) {
    let best = 0, bd = Infinity;
    SPEEDS.forEach(function (s, i) { const d = Math.abs(Math.log(s) - Math.log(Math.max(1, v))); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // ---------- 五個演算法 ----------
  const ALG = {
    binary: { css: 'bin', mk: 'circle', zh: '二分搜尋', en: 'Binary search', fn: 'log', pitch: 1046.5 },
    linear: { css: 'lin', mk: 'square', zh: '循序搜尋', en: 'Sequential search', fn: 'n', pitch: 880 },
    merge: { css: 'mrg', mk: 'tri', zh: '合併排序', en: 'Merge sort', fn: 'nlogn', pitch: 740 },
    pairs: { css: 'pr', mk: 'dia', zh: '兩兩比較', en: 'Every pair', fn: 'n2', pitch: 587.3 },
    subsets: { css: 'sub', mk: 'plus', zh: '列出所有子集合', en: 'All subsets', fn: 'exp2', pitch: 440 }
  };
  const ORDER = B.ALGOS;
  /** 函數的寫法（畫布用的「豐富文字」：字串或 { t, sup }／{ t, sub }） */
  const FN = {
    log: ['log', { sub: '2' }, ' n'], sqrt: ['√n'], n: ['n'], nlogn: ['n log', { sub: '2' }, ' n'],
    n2: ['n²'], n3: ['n³'], exp2: ['2', { sup: 'n' }], fact: ['n!']
  };
  const FN_TEX = { log: '\\log_2 n', sqrt: '\\sqrt{n}', n: 'n', nlogn: 'n\\log_2 n', n2: 'n^2', n3: 'n^3', exp2: '2^n', fact: 'n!' };
  const DASH = { log: [], n: [9, 4], nlogn: [9, 3, 2, 3], n2: [4, 3], exp2: [1.5, 3.5] };

  // ---------- 狀態 ----------
  const state = {
    n: 12, shape: 'random', seed: 1113, speed: 20,
    run: null, t: 0, playing: false, done: {}, doneCount: 0, raceDone: false,
    mode: 'lin', points: [], dbl: null,
    fa: 'nlogn', a: 10, fb: 'n2', b: 1, cmp: null,
    fx: [], stepAge: 9
  };
  let rand = B.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'accent-soft',
      'bo-bin', 'bo-lin', 'bo-mrg', 'bo-pr', 'bo-sub', 'bo-ca', 'bo-cb', 'bo-cell', 'bo-lane']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function col(algo) { return C['bo-' + ALG[algo].css]; }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字的寫法 ----------
  function commas(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function sciOf(v) {
    const e = Math.floor(Math.log10(v));
    let m = v / Math.pow(10, e);
    if (!isFinite(m)) m = Math.pow(10, Math.log10(v) - e);
    if (m >= 9.995) return { m: 1, e: e + 1 };
    return { m: m, e: e };
  }
  /** 很大的數用 ln 表示時：{ m, e } */
  function sciFromLn(ln) { const l10 = ln / Math.LN10, e = Math.floor(l10); let m = Math.pow(10, l10 - e); if (m >= 9.995) return { m: 1, e: e + 1 }; return { m: m, e: e }; }
  function numParts(v) {
    if (!isFinite(v)) return ['∞'];
    if (v < 1e7 && Math.abs(v - Math.round(v)) < 1e-9) return [commas(v)];
    if (v < 1e7) return [B.trim(v, 2)];
    const s = sciOf(v);
    return [s.m.toFixed(2) + ' × 10', { sup: String(s.e) }];
  }
  /** 很大而且剛好是 2 的次方：寫成 2^k（例如交叉點 2^1000） */
  function pow2Exp(v) { if (!(v >= 1e7) || !isFinite(v)) return null; const k = Math.log2(v); return Number.isInteger(k) && Math.pow(2, k) === v ? k : null; }
  function bigHTML(v) { const k = pow2Exp(v); return k != null ? '2<sup>' + k + '</sup>' : numHTML(v); }
  function bigParts(v) { const k = pow2Exp(v); return k != null ? ['2', { sup: String(k) }] : numParts(v); }
  function numHTML(v) {
    if (!isFinite(v)) return '∞';
    if (v < 1e7 && Math.abs(v - Math.round(v)) < 1e-9) return commas(v);
    if (v < 1e7) return B.trim(v, 2);
    const s = sciOf(v);
    return s.m.toFixed(2) + ' × 10<sup>' + s.e + '</sup>';
  }
  function lnHTML(ln) {
    if (ln === -Infinity) return '0';
    if (ln < Math.log(1e7)) { const v = Math.exp(ln); return Math.abs(v - Math.round(v)) < 1e-7 ? commas(v) : B.trim(v, v < 10 ? 3 : v < 1000 ? 2 : 1); }
    const s = sciFromLn(ln);
    return s.m.toFixed(2) + ' × 10<sup>' + s.e + '</sup>';
  }
  const UNIT = { ns: ['奈秒', 'ns'], us: ['微秒', 'μs'], ms: ['毫秒', 'ms'], s: ['秒', 's'], min: ['分鐘', 'min'], h: ['小時', 'h'], d: ['天', 'days'], yr: ['年', 'years'] };
  function sig3(v) { return v >= 100 ? B.trim(v, 0) : v >= 10 ? B.trim(v, 1) : B.trim(v, 2); }
  function timeHTML(ns) {
    const h = B.humanTime(ns), u = T(UNIT[h.unit][0], UNIT[h.unit][1]);
    if (h.unit === 'yr' && h.v >= 1e5) { const s = sciOf(h.v); return s.m.toFixed(2) + ' × 10<sup>' + s.e + '</sup>&nbsp;' + u; }
    return sig3(h.v) + '&nbsp;' + u;
  }
  function timeParts(ns) {
    const h = B.humanTime(ns), u = T(UNIT[h.unit][0], UNIT[h.unit][1]);
    if (h.unit === 'yr' && h.v >= 1e5) { const s = sciOf(h.v); return [s.m.toFixed(2) + ' × 10', { sup: String(s.e) }, ' ' + u]; }
    return [sig3(h.v) + ' ' + u];
  }

  // ---------- 豐富文字（上標、下標自己畫，不用 Unicode 上下標字元） ----------
  function partFont(p, px, weight) { return fnt(typeof p === 'object' ? +(px * 0.7).toFixed(1) : px, weight); }
  function partText(p) { return typeof p === 'object' ? (p.sup != null ? p.sup : p.sub) : p; }
  function richWidth(c, parts, px, weight) {
    let w = 0;
    parts.forEach(function (p) { c.font = partFont(p, px, weight); w += c.measureText(partText(p)).width + (typeof p === 'object' ? 0.5 : 0); });
    return w;
  }
  /** 畫在 (x, y)，y 是文字中線；回傳寬度 */
  function rich(c, parts, x, y, px, weight, color, align, halo) {
    const w = richWidth(c, parts, px, weight);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    parts.forEach(function (p) {
      const o = typeof p === 'object';
      c.font = partFont(p, px, weight);
      const s = partText(p), dy = o ? (p.sup != null ? -px * 0.36 : px * 0.3) : 0;
      if (halo) { c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = alpha(C['canvas-bg'], 0.92); c.strokeText(s, cx, y + dy); }
      c.fillStyle = color;
      c.fillText(s, cx, y + dy);
      cx += c.measureText(s).width + (o ? 0.5 : 0);
    });
    return w;
  }
  /** 圓角底框的豐富文字標籤；(x, y) 是中線，回傳底框 */
  function richPill(c, parts, x, y, px, color, align, clamp) {
    const w = richWidth(c, parts, px, 650);
    c.font = fnt(px, 650);
    const th = D.textHeight(c.measureText('0Ag'), px * 1.25);
    const pw = w + 12, ph = th + 4;
    let bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    if (clamp) bx = Math.max(clamp[0], Math.min(clamp[1] - pw, bx));
    D.roundRect(c, bx, y - ph / 2, pw, ph, ph / 2);
    c.fillStyle = alpha(C['canvas-bg'], D.dark ? 0.88 : 0.93); c.fill();
    c.strokeStyle = alpha(color, D.dark ? 0.6 : 0.5); c.lineWidth = 1; c.stroke();
    rich(c, parts, bx + 6, y + 0.5, px, 650, color, 'left', false);
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }
  /** 橫軸刻度文字：靠近右緣時改成靠右對齊，不被切掉 */
  function tick(c, parts, x, y, W) {
    const w = richWidth(c, parts, 11, 500);
    if (x + w / 2 > W - 3) rich(c, parts, W - 3, y, 11, 500, C.muted, 'right', false);
    else rich(c, parts, x, y, 11, 500, C.muted, 'center', false);
  }
  function textH(c, px, w) { c.font = fnt(px, w); return D.textHeight(c.measureText('0Ag'), px * 1.25); }
  /** 記號：圓、方、三角、菱形、十字 */
  function marker(c, shape, x, y, r, color, hollow) {
    c.beginPath();
    if (shape === 'circle') c.arc(x, y, r, 0, Math.PI * 2);
    else if (shape === 'square') c.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
    else if (shape === 'tri') { c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 1.05, y + r * 0.75); c.lineTo(x - r * 1.05, y + r * 0.75); c.closePath(); }
    else if (shape === 'dia') { c.moveTo(x, y - r * 1.2); c.lineTo(x + r * 1.05, y); c.lineTo(x, y + r * 1.2); c.lineTo(x - r * 1.05, y); c.closePath(); }
    else { const a = r * 0.36, b = r * 1.1; c.moveTo(x - a, y - b); c.lineTo(x + a, y - b); c.lineTo(x + a, y - a); c.lineTo(x + b, y - a); c.lineTo(x + b, y + a); c.lineTo(x + a, y + a); c.lineTo(x + a, y + b); c.lineTo(x - a, y + b); c.lineTo(x - a, y + a); c.lineTo(x - b, y + a); c.lineTo(x - b, y - a); c.lineTo(x - a, y - a); c.closePath(); }
    if (hollow) { c.fillStyle = C['canvas-bg']; c.fill(); c.strokeStyle = color; c.lineWidth = 1.6; c.stroke(); }
    else { c.fillStyle = color; c.fill(); c.strokeStyle = alpha(C['canvas-bg'], 0.9); c.lineWidth = 1.2; c.stroke(); }
  }

  // ---------- 畫布 ----------
  const rv = $('race'), rctx = rv.getContext('2d');
  const hv = $('chart'), hctx = hv.getContext('2d');
  const kv = $('cmp'), kctx = kv.getContext('2d');
  let dpr = 1;
  const S = { rw: 300, rh: 420, hw: 300, hh: 260, kw: 300, kh: 260 };
  let RL = null;     // 賽跑的版面
  let HL = null;     // 成長曲線的座標換算
  let KL = null;     // 常數因子圖的座標換算
  let chartDirty = true, cmpDirty = true;

  function layoutRace(W) {
    const narrow = W < 560;
    const pad = narrow ? 6 : 10;
    const th = textH(rctx, 13, 650);
    const top = Math.round(th + 16);
    const head = Math.round(th + 12), vis = narrow ? 30 : 34, track = 20;
    const laneH = head + vis + track;
    const gap = narrow ? 7 : 8;
    return { W: W, narrow: narrow, pad: pad, th: th, top: top, head: head, vis: vis, track: track, laneH: laneH, gap: gap,
      H: Math.round(top + ORDER.length * (laneH + gap) + 2) };
  }
  function resize() {
    const w = rv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    S.rw = w; RL = layoutRace(w); S.rh = RL.H;
    if (rv.style.height !== S.rh + 'px') rv.style.height = S.rh + 'px';
    rv.width = Math.round(S.rw * dpr); rv.height = Math.round(S.rh * dpr);
    S.hw = hv.clientWidth || w;
    S.hh = S.hw < 560 ? Math.round(250 + textH(hctx, 11, 600) * 2) : 300;
    if (hv.style.height !== S.hh + 'px') hv.style.height = S.hh + 'px';
    hv.width = Math.round(S.hw * dpr); hv.height = Math.round(S.hh * dpr);
    S.kw = kv.clientWidth || w;
    S.kh = S.kw < 560 ? 240 : 260;
    if (kv.style.height !== S.kh + 'px') kv.style.height = S.kh + 'px';
    kv.width = Math.round(S.kw * dpr); kv.height = Math.round(S.kh * dpr);
    chartDirty = cmpDirty = true;
    requestDraw();
  }

  // =====================================================================
  // 賽跑：每條跑道在第 k 個操作之後的樣子
  // =====================================================================
  function total(algo) { return state.run.counts[algo]; }
  function kOf(algo) { return Math.min(Math.floor(state.t), total(algo)); }
  function maxTotal() { let m = 0; ORDER.forEach(function (a) { m = Math.max(m, total(a)); }); return m; }
  let mergeMemo = { k: -1, st: null, run: null };
  function mergeAt(k) {
    if (mergeMemo.run === state.run && mergeMemo.k === k) return mergeMemo.st;
    const st = B.mergeState(state.run.data, state.run.merges, k);
    mergeMemo = { k: k, st: st, run: state.run };
    return st;
  }

  function laneCard(c, x, y, w, h, algo, finished) {
    const color = col(algo);
    D.roundRect(c, x + 0.5, y + 2, w, h, 9);
    c.fillStyle = D.shadowInk(D.dark ? 0.35 : 0.07); c.fill();
    const g = c.createLinearGradient(0, y, 0, y + h);
    const face = finished ? mix(C['bo-lane'], color, D.dark ? 0.12 : 0.06) : C['bo-lane'];
    g.addColorStop(0, shade(face, D.dark ? 0.06 : 0.4)); g.addColorStop(1, shade(face, D.dark ? -0.12 : -0.03));
    D.roundRect(c, x, y, w, h, 9);
    c.fillStyle = g; c.fill();
    c.save(); D.roundRect(c, x, y, w, h, 9); c.clip();
    c.fillStyle = alpha('#ffffff', D.dark ? 0.06 : 0.65); c.fillRect(x, y, w, 1.2);
    c.fillStyle = color; c.fillRect(x, y, 4, h);
    c.restore();
    D.roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, 8.5);
    c.strokeStyle = finished ? alpha(color, D.dark ? 0.55 : 0.45) : alpha(C.text, D.dark ? 0.16 : 0.12);
    c.lineWidth = 1; c.stroke();
  }
  /** 一排格子（長條）：heights 0–1、style(i) → { fill, ring, dim } */
  function cellsRow(c, box, n, hOf, styleOf) {
    const cw = box.w / n, gap = cw >= 7 ? Math.min(2.2, cw * 0.16) : 0;
    const base = box.y + box.h;
    const thin = cw < 3;   // 很多格：對齊整數像素，避免細條紋（疊紋）
    if (cw < 1) {
      // 比一個像素還窄：每一欄像素只畫一格（有標記的那格優先，否則畫最高的），半透明的顏色才不會疊出深淺條紋
      const cols = Math.floor(box.w);
      for (let q = 0; q < cols; q++) {
        const i0 = Math.floor(q / cw), i1 = Math.min(n - 1, Math.floor((q + 1) / cw) - 1);
        let best = i0, bs = styleOf(i0);
        for (let i = i0 + 1; i <= Math.max(i0, i1); i++) {
          const st = styleOf(i);
          if ((st.ring && !bs.ring) || (!!st.ring === !!bs.ring && hOf(i) > hOf(best))) { best = i; bs = st; }
        }
        const hh = Math.round(Math.max(2, hOf(best) * box.h));
        c.fillStyle = bs.ring || bs.fill;
        c.fillRect(Math.floor(box.x) + q, Math.round(base - hh), 1, hh);
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      const s = styleOf(i);
      const hh = Math.max(2, hOf(i) * box.h);
      let x = box.x + i * cw + gap / 2, w = Math.max(0.6, cw - gap);
      if (thin) { x = Math.floor(box.x + i * cw); w = Math.max(1, Math.floor(box.x + (i + 1) * cw) - x); }
      if (cw >= 7) D.roundRect(c, x, base - hh, w, hh, Math.min(3, w * 0.3));
      else { c.beginPath(); c.rect(x, Math.round(base - hh), w, Math.round(hh)); }
      c.fillStyle = s.fill; c.fill();
      if (s.ring && cw >= 4) { c.strokeStyle = s.ring; c.lineWidth = 1.6; c.stroke(); }
    }
  }
  function neutral() { return alpha(C.muted, D.dark ? 0.38 : 0.3); }
  function dimmed(color) { return alpha(color, D.dark ? 0.22 : 0.18); }
  /** 目標卡（比每個數都大的那個數），畫在格子右邊 */
  function targetCard(c, x, y, w, h, color, miss) {
    D.roundRect(c, x, y, w, h, 5);
    c.fillStyle = alpha(color, D.dark ? 0.1 : 0.06); c.fill();
    c.setLineDash([3, 3]); c.strokeStyle = alpha(color, 0.8); c.lineWidth = 1.3; c.stroke(); c.setLineDash([]);
    const txt = String(state.run.target);
    let px = 12;
    c.font = fnt(px, 700);
    while (px > 8 && c.measureText(txt).width > w - 4) { px -= 0.5; c.font = fnt(px, 700); }
    c.fillStyle = miss ? alpha(color, 0.55) : color; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(txt, x + w / 2, y + h / 2 + 0.5);
    if (miss) { c.strokeStyle = alpha(color, 0.75); c.lineWidth = 1.4; c.beginPath(); c.moveTo(x + 4, y + h - 4); c.lineTo(x + w - 4, y + 4); c.stroke(); }
  }
  function glowAt(c, x, y, w, h, color) {
    if (reducedMotion) return;
    const u = Math.max(0, 1 - state.stepAge / 0.35);
    if (u <= 0) return;
    c.save(); c.globalAlpha = 0.5 * u;
    const g = c.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) * 1.2 + 6);
    g.addColorStop(0, alpha(color, 0.8)); g.addColorStop(1, alpha(color, 0));
    c.fillStyle = g; c.fillRect(x - 12, y - 12, w + 24, h + 24);
    c.restore();
  }

  function visSearch(c, box, algo) {
    const n = state.n, color = col(algo), k = kOf(algo), fin = k >= total(algo);
    const tw = Math.min(box.h * 1.3, RL.narrow ? 30 : 40);
    const cb = { x: box.x, y: box.y, w: box.w - tw - 8, h: box.h };
    const hOf = function (i) { return 0.32 + 0.68 * (i + 1) / n; };
    let lo = 0, hi = n - 1, mid = -1;
    if (algo === 'binary' && k > 0) { const s = state.run.binTrace[k - 1]; lo = s.lo2; hi = s.hi2; mid = s.mid; }
    if (algo === 'binary' && lo <= hi && k < total(algo)) {
      // 還沒排除的範圍：淡淡的底色與上方的括號
      const cw = cb.w / n, x0 = cb.x + lo * cw, x1 = cb.x + (hi + 1) * cw;
      D.roundRect(c, x0 - 1, cb.y - 3, x1 - x0 + 2, cb.h + 4, 4);
      c.fillStyle = alpha(color, D.dark ? 0.14 : 0.09); c.fill();
      c.strokeStyle = alpha(color, 0.65); c.lineWidth = 1.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, cb.y - 1); c.lineTo(x0, cb.y - 4); c.lineTo(x1, cb.y - 4); c.lineTo(x1, cb.y - 1); c.stroke();
    }
    cellsRow(c, cb, n, hOf, function (i) {
      if (algo === 'linear') {
        if (i === k - 1) return { fill: color, ring: shade(color, D.dark ? 0.3 : -0.25) };
        return i < k ? { fill: dimmed(color) } : { fill: neutral() };
      }
      if (i === mid) return { fill: color, ring: shade(color, D.dark ? 0.3 : -0.25) };
      if (i >= lo && i <= hi && !fin) return { fill: alpha(color, D.dark ? 0.55 : 0.45) };
      return { fill: k > 0 ? dimmed(C.muted) : neutral() };
    });
    const cur = algo === 'linear' ? k - 1 : mid;
    if (cur >= 0 && !fin) { const cw = cb.w / n; glowAt(c, cb.x + cur * cw, cb.y + cb.h * (1 - hOf(cur)), cw, cb.h * hOf(cur), color); }
    targetCard(c, box.x + box.w - tw, box.y + 2, tw, box.h - 2, color, fin);
  }
  function visPairs(c, box) {
    const n = state.n, color = col('pairs'), k = kOf('pairs'), tot = total('pairs'), fin = k >= tot;
    const gs = box.h;
    // 左邊的三角形：所有 i < j 的配對，由上往下一列一列做
    const gx = box.x, gy = box.y;
    c.save();
    c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + gs, gy); c.lineTo(gx + gs, gy + gs); c.closePath();
    c.fillStyle = neutral(); c.fill();
    c.clip();
    if (tot > 0 && k > 0) {
      const p = B.pairAt(n, Math.max(1, k));
      const rowFrac = fin ? 1 : (p.i + (p.j - p.i) / Math.max(1, n - 1 - p.i)) / Math.max(1, n - 1);
      const yy = gy + gs * rowFrac;
      c.fillStyle = alpha(color, 0.85);
      c.fillRect(gx, gy, gs, yy - gy);
    }
    c.restore();
    c.strokeStyle = alpha(color, 0.7); c.lineWidth = 1;
    c.beginPath(); c.moveTo(gx + 0.5, gy + 0.5); c.lineTo(gx + gs - 0.5, gy + 0.5); c.lineTo(gx + gs - 0.5, gy + gs - 0.5); c.closePath(); c.stroke();
    const cb = { x: box.x + gs + 10, y: box.y, w: box.w - gs - 10, h: box.h };
    const d = state.run.data;
    let pi = -1, pj = -1;
    if (k > 0 && !fin) { const p = B.pairAt(n, k); pi = p.i; pj = p.j; }
    cellsRow(c, cb, n, function (i) { return 0.25 + 0.75 * d[i] / n; }, function (i) {
      if (i === pj) return { fill: color, ring: shade(color, D.dark ? 0.3 : -0.25) };
      if (i === pi) return { fill: alpha(color, 0.5), ring: color };
      if (fin) return { fill: alpha(color, D.dark ? 0.4 : 0.32) };
      return { fill: i < pi ? dimmed(color) : neutral() };
    });
    if (pj >= 0) { const cw = cb.w / n; glowAt(c, cb.x + pj * cw, cb.y, cw, cb.h, color); }
  }
  function visMerge(c, box) {
    const n = state.n, color = col('merge'), k = kOf('merge'), fin = k >= total('merge');
    const st = mergeAt(k), a = st.arr, cur = st.cur;
    if (cur) {
      const cw = box.w / n, x0 = box.x + cur.lo * cw, x1 = box.x + (cur.hi + 1) * cw;
      D.roundRect(c, x0 - 1, box.y - 3, x1 - x0 + 2, box.h + 4, 4);
      c.fillStyle = alpha(color, D.dark ? 0.12 : 0.08); c.fill();
      c.strokeStyle = alpha(color, 0.65); c.lineWidth = 1.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, box.y - 1); c.lineTo(x0, box.y - 4); c.lineTo(x1, box.y - 4); c.lineTo(x1, box.y - 1); c.stroke();
    }
    const other = C['bo-bin'];
    cellsRow(c, box, n, function (i) { return 0.22 + 0.78 * a[i] / n; }, function (i) {
      if (fin) return { fill: alpha(color, D.dark ? 0.8 : 0.75) };
      if (cur && i >= cur.lo && i <= cur.hi) {
        if (i < cur.pos) return { fill: color };
        if (i < cur.split) return { fill: alpha(color, 0.42), ring: i === cur.pos ? color : null };
        return { fill: alpha(other, 0.35), ring: i === cur.split ? other : null };
      }
      return { fill: neutral() };
    });
    if (cur && !fin && cur.pos > cur.lo) { const cw = box.w / n; glowAt(c, box.x + (cur.pos - 1) * cw, box.y, cw, box.h, color); }
  }
  function visSubsets(c, box) {
    const n = state.n, color = col('subsets'), k = kOf('subsets'), fin = k >= total('subsets');
    const M = Math.min(n, RL.narrow ? 20 : 40);
    const lab = n > M ? T('前面還有 ' + (n - M) + ' 個', (n - M) + ' more') : '';
    c.font = fnt(11, 600);
    const lw = lab ? c.measureText(lab).width + 10 : 0;
    const cw = (box.w - lw) / M, gap = Math.min(3, cw * 0.14), sz = Math.min(cw - gap, box.h);
    const y = box.y + (box.h - sz) / 2;
    if (lab) { c.fillStyle = C.muted; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(lab, box.x, box.y + box.h / 2); }
    const idx = k - 1;       // 第 k 個子集合 = 二進位的 k − 1
    const d = state.run.data;
    for (let q = 0; q < M; q++) {
      const bit = M - 1 - q;   // 最右邊是第 0 個元素（變得最快）
      let on = false;
      if (fin) on = true;
      else if (idx >= 0) on = Math.floor(idx / Math.pow(2, bit)) % 2 === 1;
      const x = box.x + lw + q * cw + gap / 2;
      D.roundRect(c, x, y, sz, sz, Math.min(4, sz * 0.25));
      if (on) {
        const g = c.createLinearGradient(0, y, 0, y + sz);
        g.addColorStop(0, shade(color, D.dark ? 0.25 : 0.2)); g.addColorStop(1, shade(color, D.dark ? -0.1 : -0.15));
        c.fillStyle = g; c.fill();
      } else { c.fillStyle = neutral(); c.fill(); }
      if (sz >= 16 && bit < n) {
        c.font = fnt(Math.min(11, sz * 0.5), 650);
        c.fillStyle = on ? (D.dark ? '#0b1215' : '#ffffff') : alpha(C.text, 0.55);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(d[bit]), x + sz / 2, y + sz / 2 + 0.5);
      }
    }
  }
  function flag(c, x, y, h, color, on) {
    c.strokeStyle = alpha(C.text, 0.45); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.stroke();
    const s = Math.max(2.5, h / 4.2);
    for (let r = 0; r < 2; r++) for (let q = 0; q < 3; q++) {
      c.fillStyle = (r + q) % 2 ? (on ? color : alpha(C.muted, 0.6)) : alpha(C['canvas-bg'], 0.95);
      c.fillRect(x + 1 + q * s, y + r * s, s, s);
    }
    c.strokeStyle = alpha(C.text, 0.3); c.lineWidth = 0.8; c.strokeRect(x + 1, y, 3 * s, 2 * s);
  }
  function drawRace() {
    const c = rctx, W = S.rw, H = S.rh;
    if (!state.run || !RL) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, W, H);
    // 時鐘
    const t = Math.floor(state.t);
    const ty = RL.top / 2;
    c.font = fnt(13, 650);
    const clk = [T('時鐘：', 'Clock: ')].concat(numParts(t), [T(' 個操作', ' operations')]);
    rich(c, clk, RL.pad + 4, ty, 13, 650, C.text, 'left', true);
    const tp = ['= '].concat(timeParts(t), [T('（每個 1 奈秒）', ' (1 ns each)')]);
    if (RL.narrow) { tp.pop(); }
    rich(c, tp, W - RL.pad - 4, ty, 12.5, 600, C.muted, 'right', true);
    // 跑道
    const x = RL.pad, w = W - 2 * RL.pad;
    ORDER.forEach(function (algo, li) {
      const y = RL.top + li * (RL.laneH + RL.gap);
      const color = col(algo), k = kOf(algo), tot = total(algo), fin = state.done[algo] != null;
      laneCard(c, x, y, w, RL.laneH, algo, fin);
      // 標題列：記號、名稱、等級；右邊：次數
      const hy = y + RL.head / 2 + 2;
      marker(c, ALG[algo].mk, x + 18, hy, 5.2, color, false);
      c.font = fnt(13.5, 700);
      const name = T(ALG[algo].zh, ALG[algo].en);
      const right = numParts(k).concat([' / '], numParts(tot), [T(' 次', '')]);
      const rw = richWidth(c, right, 12.5, 650);
      let nx = x + 30;
      c.fillStyle = C.text; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(name, nx, hy + 0.5);
      nx += c.measureText(name).width + 8;
      const cls = ['Θ('].concat(FN[ALG[algo].fn], [')']);
      const clsW = richWidth(c, cls, 12, 600);
      const formulaTag = algo === 'subsets' && state.run.formula ? T('用公式算', 'by formula') : '';
      c.font = fnt(11, 650);
      const ftW = formulaTag ? c.measureText(formulaTag).width + 14 : 0;
      if (nx + clsW + ftW + rw + 24 < x + w - 10) {
        rich(c, cls, nx, hy + 0.5, 12, 600, C.muted, 'left', false);
        nx += clsW + 8;
      }
      if (formulaTag && nx + ftW + rw + 16 < x + w - 10) {
        c.font = fnt(11, 650);
        const fh = textH(c, 11, 650) + 4;
        D.roundRect(c, nx, hy - fh / 2, ftW, fh, fh / 2);
        c.fillStyle = alpha(color, D.dark ? 0.2 : 0.12); c.fill();
        c.fillStyle = color; c.textAlign = 'left'; c.fillText(formulaTag, nx + 7, hy + 0.5);
      }
      rich(c, right, x + w - 12, hy + 0.5, 12.5, 650, fin ? color : C.text, 'right', false);
      // 演算法現在的樣子
      const box = { x: x + 14, y: y + RL.head + 2, w: w - 28, h: RL.vis - 6 };
      if (algo === 'binary' || algo === 'linear') visSearch(c, box, algo);
      else if (algo === 'pairs') visPairs(c, box);
      else if (algo === 'merge') visMerge(c, box);
      else visSubsets(c, box);
      // 進度條與終點旗
      const py = y + RL.head + RL.vis + 5, ph = 6, px0 = x + 14, pw = w - 28 - 26;
      D.roundRect(c, px0, py, pw, ph, ph / 2);
      c.fillStyle = alpha(C.muted, D.dark ? 0.25 : 0.16); c.fill();
      const frac = tot > 0 ? Math.min(1, k / tot) : (fin ? 1 : 0);
      if (frac > 0) {
        const fw = Math.max(ph, pw * frac);
        const g = c.createLinearGradient(px0, 0, px0 + fw, 0);
        g.addColorStop(0, alpha(color, 0.65)); g.addColorStop(1, color);
        D.roundRect(c, px0, py, fw, ph, ph / 2);
        c.fillStyle = g; c.fill();
        c.fillStyle = alpha('#ffffff', D.dark ? 0.15 : 0.35); c.fillRect(px0 + ph / 2, py + 1, Math.max(0, fw - ph), 1);
      }
      if (fin) {
        // 跑完：終點旗換成名次（同一拍跑完的名次相同）
        const rk = String(state.done[algo]);
        const bx = px0 + pw + 14, by = py + ph / 2;
        c.beginPath(); c.arc(bx, by + 1, 8.5, 0, Math.PI * 2); c.fillStyle = D.shadowInk(D.dark ? 0.4 : 0.12); c.fill();
        c.beginPath(); c.arc(bx, by, 8.5, 0, Math.PI * 2);
        c.fillStyle = color; c.fill(); c.strokeStyle = C['canvas-bg']; c.lineWidth = 1.5; c.stroke();
        c.font = fnt(10, 800); c.fillStyle = D.dark ? '#0b1215' : '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(rk, bx, by + 0.5);
      } else flag(c, px0 + pw + 9, py - 4, 11, color, false);
      if (!fin && frac > 0 && frac < 1 && pw * frac > 40 && tot > 99) {
        c.font = fnt(10.5, 600); c.fillStyle = C.muted; c.textAlign = 'left'; c.textBaseline = 'middle';
        const pct = frac < 0.001 ? '< 0.1%' : B.trim(frac * 100, frac < 0.1 ? 1 : 0) + '%';
        c.fillText(pct, Math.min(px0 + pw * frac + 4, px0 + pw - 30), py + ph / 2 - 9);
      }
    });
  }

  // =====================================================================
  // 成長曲線
  // =====================================================================
  function niceCeil(v) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, v))));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  function niceStep(raw) { return niceCeil(raw); }
  function chartXmax() {
    let m = Math.max(8, state.n);
    state.points.forEach(function (p) { m = Math.max(m, p.n); });
    return m;
  }
  function drawChart() {
    const c = hctx, W = S.hw, H = S.hh, mode = state.mode;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, W, H);
    const th = textH(c, 11, 600);
    const narrow = W < 560;
    // 圖例（記號 = 實際次數）
    c.font = fnt(11, 600);
    const legend = ORDER.map(function (a) { return { a: a, s: T(ALG[a].zh, ALG[a].en) }; });
    const rows = [];
    let row = [], lx = 0;
    const maxW = W - 16;
    legend.forEach(function (it) {
      const w = c.measureText(it.s).width + 22;
      if (lx + w > maxW && row.length) { rows.push(row); row = []; lx = 0; }
      row.push({ it: it, w: w }); lx += w;
    });
    if (row.length) rows.push(row);
    const legH = rows.length * (th + 6) + 4;
    const padL = narrow ? 46 : 54, padR = narrow ? 12 : 64, padT = Math.round(legH + th + 14), padB = Math.round(th + 18);
    const iw = W - padL - padR, ih = H - padT - padB;
    let xMax = chartXmax();
    let X, Xinv, xt = [], xlab;
    if (mode === 'loglog') {
      const dec = Math.max(1, Math.ceil(Math.log10(xMax)));
      xMax = Math.pow(10, dec);
      X = function (n) { return padL + Math.log10(Math.max(1, n)) / dec * iw; };
      Xinv = function (px) { return Math.pow(10, (px - padL) / iw * dec); };
      for (let e = 0; e <= dec; e++) xt.push(Math.pow(10, e));
      xlab = function (v) { return numParts(v); };
    } else {
      xMax = niceCeil(xMax * 1.05);
      X = function (n) { return padL + n / xMax * iw; };
      Xinv = function (px) { return (px - padL) / iw * xMax; };
      const st = niceStep(xMax / (narrow ? 4 : 8));
      for (let v = 0; v <= xMax + 1e-9; v += st) xt.push(v);
      xlab = function (v) { return numParts(v); };
    }
    let Y, yt = [], yTop, yl;
    if (mode === 'lin') {
      yTop = niceCeil(xMax * xMax);
      if (yTop / (xMax * xMax) > 2.2) yTop = Math.ceil(xMax * xMax / niceStep(xMax * xMax / 5)) * niceStep(xMax * xMax / 5);
      Y = function (v) { return padT + ih - v / yTop * ih; };
      const st = niceStep(yTop / 5);
      for (let v = 0; v <= yTop + 1e-9; v += st) yt.push(v);
      yl = function (v) { return numParts(v); };
    } else {
      const topExp = Math.min(30, Math.max(2, Math.ceil(Math.max(2 * Math.log10(xMax), Math.min(30, xMax * Math.log10(2))))));
      yTop = Math.pow(10, topExp);
      Y = function (v) { return padT + ih - Math.log10(Math.max(1e-300, v)) / topExp * ih; };
      const st = topExp <= 8 ? 1 : topExp <= 16 ? 2 : topExp <= 25 ? 5 : 5;
      for (let e = 0; e <= topExp; e += st) yt.push(Math.pow(10, e));
      yl = function (v) { const e = Math.round(Math.log10(v)); return e <= 3 ? [String(Math.pow(10, e))] : ['10', { sup: String(e) }]; };
    }
    HL = { X: X, Xinv: Xinv, padL: padL, padR: padR, padT: padT, iw: iw, ih: ih, xMax: xMax, mode: mode };
    // 格線
    c.strokeStyle = alpha(C.text, D.dark ? 0.09 : 0.08); c.lineWidth = 1;
    xt.forEach(function (v, k) {
      const x = Math.round(X(v)) + 0.5;
      c.beginPath(); c.moveTo(x, padT); c.lineTo(x, padT + ih); c.stroke();
      if (mode !== 'loglog' && narrow && k % 2 && v !== xMax) return;
      tick(c, xlab(v), x, padT + ih + 6 + th / 2, W);
    });
    if (mode === 'loglog') {
      // 次格線（2、5）
      c.strokeStyle = alpha(C.text, D.dark ? 0.045 : 0.04);
      for (let e = 0; e < Math.log10(xMax); e++) [2, 5].forEach(function (f) { const x = Math.round(X(f * Math.pow(10, e))) + 0.5; c.beginPath(); c.moveTo(x, padT); c.lineTo(x, padT + ih); c.stroke(); });
      c.strokeStyle = alpha(C.text, D.dark ? 0.09 : 0.08);
    }
    yt.forEach(function (v) {
      const y = Math.round(Y(v)) + 0.5;
      c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + iw, y); c.stroke();
      rich(c, yl(v), padL - 6, y, 11, 500, C.muted, 'right', false);
    });
    c.strokeStyle = alpha(C.text, 0.35);
    c.beginPath(); c.moveTo(padL + 0.5, padT); c.lineTo(padL + 0.5, padT + ih + 0.5); c.lineTo(padL + iw, padT + ih + 0.5); c.stroke();
    c.font = fnt(11, 600); c.fillStyle = C.muted; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(T('指令執行次數', 'operations'), 6, legH + th / 2 + 6);
    c.textAlign = 'right'; c.fillText('n', W - 4, H - th / 2 - 3);
    // 時間的參考線（對數刻度）；文字最後才寫，不被曲線蓋住
    const timeLabels = [];
    if (mode !== 'lin') {
      const G = [[1e3, '1 微秒', '1 μs'], [1e6, '1 毫秒', '1 ms'], [1e9, '1 秒', '1 s'], [3.6e12, '1 小時', '1 h'], [B.NS.yr, '1 年', '1 yr'], [100 * B.NS.yr, '100 年', '100 yr']];
      c.save();
      G.forEach(function (g) {
        if (g[0] > yTop * 0.98) return;
        const y = Math.round(Y(g[0])) + 0.5;
        c.setLineDash([2, 4]); c.strokeStyle = alpha(C.accent, 0.45); c.lineWidth = 1;
        c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + iw, y); c.stroke(); c.setLineDash([]);
        timeLabels.push([T(g[1], g[2]), y]);
      });
      c.restore();
    }
    // 目前的 n
    const xn = X(state.n);
    c.save(); c.setLineDash([3, 3]); c.strokeStyle = alpha(C.text, 0.4);
    c.beginPath(); c.moveTo(xn, padT); c.lineTo(xn, padT + ih); c.stroke(); c.restore();
    // 五條函數曲線
    c.save();
    c.beginPath(); c.rect(padL, padT - 1, iw + 1, ih + 2); c.clip();
    const ends = [];
    ORDER.forEach(function (algo) {
      const f = ALG[algo].fn, color = col(algo);
      c.strokeStyle = color; c.lineWidth = 2.3; c.lineCap = 'round'; c.lineJoin = 'round';
      c.setLineDash(DASH[f]);
      c.beginPath();
      let started = false, last = null, exitPt = null;
      const N = 360;
      for (let s = 0; s <= N; s++) {
        const n = mode === 'loglog' ? Math.pow(xMax, s / N) : Math.max(1, s / N * xMax);
        const v = B.valF(f, n);
        if (mode !== 'lin' && v <= 0) continue;
        const px = X(n), py = Y(v);
        if (py < padT - 40) { if (started && !exitPt) { exitPt = { x: px, y: padT }; c.lineTo(px, padT - 40); } break; }
        if (!started) { c.moveTo(px, py); started = true; } else c.lineTo(px, py);
        last = { x: px, y: py };
      }
      c.stroke(); c.setLineDash([]);
      const e = exitPt || last;
      if (e) ends.push({ algo: algo, f: f, x: e.x, y: e.y, exit: !!exitPt });
    });
    c.restore();
    // 曲線名稱：畫在右端（或衝出圖外的地方），彼此避開
    // 右端的標籤由下往上排：最低的貼著曲線（但不低於橫軸），上面的依序讓開
    const gapY = th + 5;
    let floorY = padT + ih - th / 2 - 3;
    ends.filter(function (e) { return !e.exit; }).sort(function (p, q) { return q.y - p.y; }).forEach(function (e) {
      let y = Math.min(e.y - (narrow ? 10 : 0), floorY);
      floorY = y - gapY;
      const x = narrow ? padL + iw - 4 : padL + iw + 4;
      richPill(c, FN[e.f], x, y, 11.5, col(e.algo), narrow ? 'right' : 'left', [padL + 2, W - 2]);
    });
    // 衝出圖外的曲線：標在上緣，左右錯開
    const usedX = [];
    ends.filter(function (e) { return e.exit; }).sort(function (p, q) { return p.x - q.x; }).forEach(function (e) {
      let y = padT + 9;
      while (usedX.some(function (u) { return Math.abs(u.x - e.x) < 46 && Math.abs(u.y - y) < gapY; })) y += gapY;
      usedX.push({ x: e.x, y: y });
      richPill(c, FN[e.f], e.x, y, 11.5, col(e.algo), 'center', [padL + 2, W - 2]);
    });
    // 實驗點
    state.points.forEach(function (p) {
      if (p.n > xMax) return;
      const v = p.v;
      if (mode !== 'lin' && v <= 0) return;
      const px = X(p.n), py = Y(v);
      if (py < padT - 2 || py > padT + ih + 2) return;
      marker(c, ALG[p.algo].mk, px, py, 4.2, col(p.algo), p.formula);
    });
    // 圖例
    let ly = 8 + th / 2;
    rows.forEach(function (r) {
      let x = 10;
      r.forEach(function (q) {
        marker(c, ALG[q.it.a].mk, x + 5, ly, 4.2, col(q.it.a), false);
        c.font = fnt(11, 600); c.fillStyle = C.text; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(q.it.s, x + 13, ly + 0.5);
        x += q.w;
      });
      ly += th + 6;
    });
    // 時間參考線的文字：靠圖的左側（右端留給曲線名稱）
    timeLabels.forEach(function (q) { D.haloText(c, q[0], padL + 6, q[1] - 7, alpha(C.accent, 0.95), 'left', 'middle', fnt(10.5, 600)); });
    // n 的標籤
    richPill(c, ['n = ' + state.n], xn, narrow ? padT + 10 : padT + ih - 10, 11, C.text, 'center', [padL, padL + iw]);
    chartDirty = false;
  }

  // =====================================================================
  // 常數因子圖
  // =====================================================================
  function drawCmp() {
    const c = kctx, W = S.kw, H = S.kh;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, W, H);
    const x = state.cmp, fa = state.fa, fb = state.fb, a = state.a, b = state.b;
    const th = textH(c, 11, 600), narrow = W < 560;
    const padL = narrow ? 46 : 56, padR = narrow ? 12 : 18, padT = Math.round(th * 2 + 22), padB = Math.round(th + 18);
    const iw = W - padL - padR, ih = H - padT - padB;
    let Xmax = Math.max(16, state.n * 1.25);
    if (!x.same && x.cross > 1) Xmax = Math.max(Xmax, x.cross * 1.6);
    x.equal.forEach(function (e) { Xmax = Math.max(Xmax, e * 1.25); });
    const xLog = Xmax > 3000;
    let X, Xinv, xt = [];
    if (xLog) {
      const dec = Math.log10(Xmax);
      X = function (n) { return padL + Math.log10(Math.max(1, n)) / dec * iw; };
      Xinv = function (px) { return Math.pow(10, (px - padL) / iw * dec); };
      const st = dec <= 8 ? 1 : dec <= 20 ? 2 : dec <= 60 ? 10 : dec <= 150 ? 25 : 50;
      for (let e = 0; e <= dec; e += st) xt.push(Math.pow(10, e));
    } else {
      Xmax = niceCeil(Xmax);
      X = function (n) { return padL + n / Xmax * iw; };
      Xinv = function (px) { return (px - padL) / iw * Xmax; };
      const st = niceStep(Xmax / (narrow ? 4 : 8));
      for (let v = 0; v <= Xmax + 1e-9; v += st) xt.push(v);
    }
    KL = { X: X, Xinv: Xinv, padL: padL, iw: iw, Xmax: Xmax };
    // 兩條線的 log10 值
    const N = 300, sa = [], sb = [];
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; s <= N; s++) {
      const n = xLog ? Math.pow(Xmax, s / N) : Math.max(1, 1 + s / N * (Xmax - 1));
      const la = (Math.log(a) + B.lnF(fa, n)) / Math.LN10, lb = (Math.log(b) + B.lnF(fb, n)) / Math.LN10;
      sa.push({ n: n, v: la }); sb.push({ n: n, v: lb });
      [la, lb].forEach(function (v) { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    }
    lo = Math.floor(Math.max(lo, hi - 400)); hi = Math.ceil(hi + 0.05);
    if (hi - lo < 2) hi = lo + 2;
    const Y = function (l10) { return padT + ih - (l10 - lo) / (hi - lo) * ih; };
    // 格線
    c.strokeStyle = alpha(C.text, D.dark ? 0.09 : 0.08); c.lineWidth = 1;
    xt.forEach(function (v, k) {
      const px = Math.round(X(v)) + 0.5;
      c.beginPath(); c.moveTo(px, padT); c.lineTo(px, padT + ih); c.stroke();
      if (!xLog && narrow && k % 2 && v !== Xmax) return;
      const parts = xLog && v >= 1e4 ? ['10', { sup: String(Math.round(Math.log10(v))) }] : numParts(v);
      tick(c, parts, px, padT + ih + 6 + th / 2, W);
    });
    const span = hi - lo, yst = span <= 8 ? 1 : span <= 16 ? 2 : span <= 40 ? 5 : span <= 100 ? 20 : span <= 250 ? 50 : 100;
    for (let e = Math.ceil(lo / yst) * yst; e <= hi; e += yst) {
      const py = Math.round(Y(e)) + 0.5;
      c.beginPath(); c.moveTo(padL, py); c.lineTo(padL + iw, py); c.stroke();
      rich(c, e >= 0 && e <= 3 ? [String(Math.pow(10, e))] : ['10', { sup: String(e).replace('-', '−') }], padL - 6, py, 11, 500, C.muted, 'right', false);
    }
    c.strokeStyle = alpha(C.text, 0.35);
    c.beginPath(); c.moveTo(padL + 0.5, padT); c.lineTo(padL + 0.5, padT + ih + 0.5); c.lineTo(padL + iw, padT + ih + 0.5); c.stroke();
    c.font = fnt(11, 600); c.fillStyle = C.muted; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText('n', W - 4, H - th / 2 - 3);
    // 底色：哪一邊比較大
    c.save();
    c.beginPath(); c.rect(padL, padT, iw, ih); c.clip();
    // 兩條線之間整塊填色；用「在另一條線上方」的範圍裁切，A 大的地方是 A 的顏色、B 大的地方是 B 的顏色（不會有接縫）
    const fin = function (p) { return isFinite(p.v); };
    const pa = sa.filter(fin), pb = sb.filter(fin);
    if (pa.length > 1 && pb.length > 1) {
      const lo2 = Math.max(pa[0].n, pb[0].n);
      const qa = pa.filter(function (p) { return p.n >= lo2; }), qb = pb.filter(function (p) { return p.n >= lo2; });
      const between = function () {
        c.beginPath();
        qa.forEach(function (p, i) { if (i) c.lineTo(X(p.n), Y(p.v)); else c.moveTo(X(p.n), Y(p.v)); });
        for (let i = qb.length - 1; i >= 0; i--) c.lineTo(X(qb[i].n), Y(qb[i].v));
        c.closePath();
      };
      const above = function (q) {
        c.beginPath();
        q.forEach(function (p, i) { if (i) c.lineTo(X(p.n), Y(p.v)); else c.moveTo(X(p.n), Y(p.v)); });
        c.lineTo(X(q[q.length - 1].n), padT - 10); c.lineTo(X(q[0].n), padT - 10); c.closePath();
      };
      [[qb, C['bo-ca']], [qa, C['bo-cb']]].forEach(function (z) {
        if (!z[0].length) return;
        c.save(); above(z[0]); c.clip(); between();
        c.fillStyle = alpha(z[1], D.dark ? 0.18 : 0.11); c.fill(); c.restore();
      });
    }
    // 兩條線
    [[sa, C['bo-ca'], []], [sb, C['bo-cb'], [8, 5]]].forEach(function (q) {
      c.strokeStyle = q[1]; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash(q[2]);
      c.beginPath();
      let st = false;
      q[0].forEach(function (p) { if (!isFinite(p.v)) return; const px = X(p.n), py = Y(p.v); if (!st) { c.moveTo(px, py); st = true; } else c.lineTo(px, py); });
      c.stroke();
    });
    c.setLineDash([]);
    // 剛好相等的地方、交叉點
    const l10at = function (f, k, n) { return (Math.log(k) + B.lnF(f, n)) / Math.LN10; };
    x.equal.forEach(function (e) {
      if (e > Xmax) return;
      const py = Y(l10at(fa, a, e)), px = X(e);
      c.beginPath(); c.moveTo(px, py - 6); c.lineTo(px + 6, py); c.lineTo(px, py + 6); c.lineTo(px - 6, py); c.closePath();
      c.fillStyle = C.text; c.fill(); c.strokeStyle = C['canvas-bg']; c.lineWidth = 1.5; c.stroke();
    });
    c.restore();
    if (!x.same && x.cross > 1 && x.cross <= Xmax) {
      const e = x.cross, px = X(e), py = Y(Math.max(l10at(fa, a, e), l10at(fb, b, e)));
      if (isFinite(py)) {
        c.beginPath(); c.arc(px, py, 8, 0, Math.PI * 2);
        c.strokeStyle = C.text; c.lineWidth = 2; c.stroke();
        const lab = [T('交叉點 n ', 'crossover n ') + (x.approx && pow2Exp(e) == null ? '≈ ' : '= ')].concat(bigParts(e));
        richPill(c, lab, px, Math.max(padT + 10, py - 20), 11, C.text, 'center', [padL, padL + iw]);
      }
    }
    // 目前的 n
    if (state.n <= Xmax) {
      const px = X(state.n);
      c.save(); c.setLineDash([3, 3]); c.strokeStyle = alpha(C.text, 0.45);
      c.beginPath(); c.moveTo(px, padT); c.lineTo(px, padT + ih); c.stroke(); c.restore();
      [[fa, a, C['bo-ca']], [fb, b, C['bo-cb']]].forEach(function (q) {
        const v = l10at(q[0], q[1], state.n);
        if (!isFinite(v)) return;
        c.beginPath(); c.arc(px, Y(v), 4.5, 0, Math.PI * 2);
        c.fillStyle = q[2]; c.fill(); c.strokeStyle = C['canvas-bg']; c.lineWidth = 1.5; c.stroke();
      });
      richPill(c, ['n = ' + state.n], px, padT + ih - 10, 11, C.text, 'center', [padL, padL + iw]);
    }
    // 上方的說明：A、B 兩條線
    const la = ['A = ' + a + ' · '].concat(FN[fa]), lb = ['B = ' + b + ' · '].concat(FN[fb]);
    const yy = 10 + th / 2;
    c.strokeStyle = C['bo-ca']; c.lineWidth = 3; c.beginPath(); c.moveTo(10, yy); c.lineTo(30, yy); c.stroke();
    const wa = rich(c, la, 36, yy, 12.5, 700, C['bo-ca'], 'left', false);
    let bx = 36 + wa + 18, by = yy;
    const wbNeed = 26 + richWidth(c, lb, 12.5, 700);
    if (bx + wbNeed > W - 8) { bx = 10; by = yy + th + 8; }
    c.setLineDash([8, 5]); c.strokeStyle = C['bo-cb']; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 20, by); c.stroke(); c.setLineDash([]);
    rich(c, lb, bx + 26, by, 12.5, 700, C['bo-cb'], 'left', false);
    cmpDirty = false;
  }

  // =====================================================================
  // 動畫迴圈
  // =====================================================================
  let raf = 0, lastT = 0;
  function frame(now) {
    raf = 0;
    now = now || performance.now();
    const dt = lastT ? Math.min(1 / 30, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    let moving = false;
    if (state.playing && state.run) {
      const before = Math.floor(state.t);
      state.t = Math.min(maxTotal(), state.t + dt * state.speed);
      if (Math.floor(state.t) !== before) { state.stepAge = 0; tickSound(); }
      advance('play');
      moving = state.playing;
    }
    state.stepAge += dt;
    if (state.stepAge < 0.4 && !reducedMotion) moving = true;
    drawRace();
    if (chartDirty) drawChart();
    if (cmpDirty) drawCmp();
    if (moving) requestDraw(); else lastT = 0;
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }

  // =====================================================================
  // 賽跑的控制
  // =====================================================================
  function resetRace() {
    state.t = 0; state.playing = false; state.done = {}; state.doneCount = 0; state.raceDone = false;
    updatePlayLabel();
  }
  function rebuild() {
    state.run = B.run(state.n, state.shape, state.seed);
    mergeMemo = { k: -1, st: null, run: null };
    resetRace();
    updateCounts();
    chartDirty = true;
    requestDraw();
  }
  /** 檢查有哪些跑道剛跑完（同一拍跑完的名次相同） */
  function advance(via) {
    const t = Math.floor(state.t);
    const newly = ORDER.filter(function (a) { return state.done[a] == null && t >= total(a); });
    if (!newly.length) return;
    // 名次：次數少的先到；次數一樣（同一拍跑完）的名次相同。「直接跑完」一次到底時也照次數排
    const rank = state.doneCount + 1;
    const totals = newly.map(total).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort(function (p, q) { return p - q; });
    let r0 = rank;
    totals.forEach(function (v) { const g = newly.filter(function (a) { return total(a) === v; }); g.forEach(function (a) { state.done[a] = r0; }); r0 += g.length; });
    state.doneCount += newly.length;
    newly.forEach(function (a) { emit('lane', B.laneEvent(state.run, a, via)); });
    finishSound(newly);
    if (state.doneCount === ORDER.length) {
      state.playing = false; state.raceDone = true;
      updatePlayLabel();
      addRacePoints();
      emit('race', B.raceEvent(state.run, via));
      say(raceSummary());
    } else if (via !== 'skip') {
      say(newly.map(function (a) { return T(ALG[a].zh, ALG[a].en); }).join(T('、', ', ')) +
        T('第 ' + rank + ' 個跑完：' + commas(total(newly[0])) + ' 次。', ' finished ' + ordinal(rank) + ': ' + commas(total(newly[0])) + ' operations.'));
    }
  }
  function ordinal(k) { return k + (k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th'); }
  function raceSummary() {
    const r = state.run;
    const s = r.formula
      ? T('全部跑完。列出所有子集合有 2^' + r.n + ' ≈ ' + plainSci(r.counts.subsets) + ' 個，是用公式算的；每個 1 奈秒要 ' + plainTime(r.counts.subsets) + '。',
        'All done. There are 2^' + r.n + ' ≈ ' + plainSci(r.counts.subsets) + ' subsets, counted by formula; at 1 ns each that is ' + plainTime(r.counts.subsets) + '.')
      : T('全部跑完。最慢的是列出所有子集合：' + commas(r.counts.subsets) + ' 次，每個 1 奈秒要 ' + plainTime(r.counts.subsets) + '。',
        'All done. The slowest is listing every subset: ' + commas(r.counts.subsets) + ' operations, ' + plainTime(r.counts.subsets) + ' at 1 ns each.');
    return s;
  }
  function plainSci(v) { if (v < 1e7) return commas(v); const s = sciOf(v); return s.m.toFixed(2) + ' × 10^' + s.e; }
  function plainTime(ns) {
    const h = B.humanTime(ns), u = T(UNIT[h.unit][0], UNIT[h.unit][1]);
    const num = h.unit === 'yr' && h.v >= 1e5 ? plainSci(h.v) : sig3(h.v);
    return num + ' ' + u;
  }
  function addPoint(n, algo, v, formula, shape) {
    if (state.points.some(function (p) { return p.n === n && p.algo === algo && p.v === v; })) return;
    state.points.push({ n: n, algo: algo, v: v, formula: formula, shape: shape });
    if (state.points.length > 600) state.points.shift();
    chartDirty = true;
  }
  function addRacePoints() {
    const r = state.run;
    ORDER.forEach(function (a) { addPoint(r.n, a, r.counts[a], a === 'subsets' && r.formula, r.shape); });
  }
  function play() {
    if (state.playing) { state.playing = false; updatePlayLabel(); say(T('暫停。', 'Paused.')); return; }
    if (state.raceDone) resetRace();
    state.playing = true;
    updatePlayLabel();
    advance('play');
    if (state.run.formula && state.playing) {
      const sec = state.run.counts.subsets / state.speed;
      say(T('開始！照每秒 ' + commas(state.speed) + ' 個操作，列出所有子集合要跑 ' + plainTime(sec * 1e9) + '。', 'Go! At ' + commas(state.speed) + ' operations per second, listing every subset would take ' + plainTime(sec * 1e9) + '.'));
    } else if (state.playing) say(T('開始！每一拍每個演算法各做一次操作。', 'Go! On every tick each algorithm performs one operation.'));
    requestDraw();
  }
  function stepOnce() {
    state.playing = false;
    if (state.raceDone) resetRace();
    state.t = Math.min(maxTotal(), Math.floor(state.t) + 1);
    state.stepAge = 0;
    tickSound(true);
    updatePlayLabel();
    advance('step');
    if (!state.raceDone) say(stepText());
    requestDraw();
  }
  function stepText() {
    const t = Math.floor(state.t), r = state.run;
    const parts = [];
    if (t <= r.counts.binary) { const s = r.binTrace[t - 1]; if (s) parts.push(T('二分搜尋看 a[' + s.mid + '] = ' + r.sorted[s.mid], 'binary search looks at a[' + s.mid + '] = ' + r.sorted[s.mid])); }
    if (t <= r.counts.linear) parts.push(T('循序搜尋看 a[' + (t - 1) + ']', 'sequential search looks at a[' + (t - 1) + ']'));
    if (t <= r.counts.pairs) { const p = B.pairAt(r.n, t); parts.push(T('兩兩比較 a[' + p.i + '] 與 a[' + p.j + ']', 'every pair compares a[' + p.i + '] with a[' + p.j + ']')); }
    return T('第 ' + t + ' 拍：', 'Tick ' + t + ': ') + parts.join(T('；', '; ')) + (parts.length ? T('。', '.') : '');
  }
  function skip() {
    state.playing = false;
    if (state.raceDone) resetRace();
    state.t = maxTotal();
    updatePlayLabel();
    advance('skip');
    requestDraw();
  }
  function updatePlayLabel() {
    const b = $('play');
    b.textContent = state.playing ? T('暫停', 'Pause') : (state.t > 0 && !state.raceDone ? T('繼續', 'Resume') : T('開始賽跑', 'Start race'));
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const FORM_HTML = {
    binary: '⌊log<sub>2</sub> n⌋ + 1', linear: 'n', merge: '', pairs: 'n(n − 1)/2', subsets: '2<sup>n</sup>'
  };
  function rowName(a) { return '<span class="mk ' + ALG[a].mk + ' b-' + ALG[a].css + '"></span><span class="c-' + ALG[a].css + '">' + T(ALG[a].zh, ALG[a].en) + '</span>'; }
  function updateCounts() {
    const r = state.run;
    let h = '<thead><tr><th>' + T('演算法', 'Algorithm') + '</th><th>' + T('次數', 'Count') + '</th><th>' + T('時間', 'Time') + '</th></tr></thead><tbody>';
    ORDER.forEach(function (a) {
      const v = r.counts[a];
      let sub;
      if (a === 'merge') sub = T('上界 ', 'bound ') + commas(B.formula.merge(r.n)) + (r.shape === 'worst' ? T('（剛好）', ' (reached)') : '');
      else if (a === 'subsets' && r.formula) sub = '2<sup>' + r.n + '</sup>' + T('，用公式算', ', by formula');
      else sub = '= ' + FORM_HTML[a];
      h += '<tr><td class="nm">' + rowName(a) + '</td><td class="hl">' + numHTML(v) + '<small>' + sub + '</small></td><td>' + timeHTML(v) + '</td></tr>';
    });
    h += '</tbody>';
    setHTML('cntT', h);
  }
  function updateDbl() {
    const e = state.dbl;
    $('dblEmpty').hidden = !!e;
    if (!e) { setHTML('dblT', ''); return; }
    let h = '<thead><tr><th>n = ' + e.n0 + ' → ' + e.n1 + '</th><th>' + T('加倍前', 'Before') + '</th><th>' + T('加倍後', 'After') + '</th><th>' + T('倍數', 'Ratio') + '</th></tr></thead><tbody>';
    ORDER.forEach(function (a) {
      const r = e.ratio[a];
      let rt;
      if (r == null) rt = '—';
      else if (a === 'subsets') rt = '× ' + numHTML(r) + '<small>' + T('＝加倍前的次數', '= the count before') + '</small>';
      else rt = '× ' + B.trim(r, r < 10 ? 3 : 2) + (a === 'binary' ? '<small>' + T('多 ' + e.diff.binary + ' 次', '+' + e.diff.binary) + '</small>' : '');
      h += '<tr><td class="nm">' + rowName(a) + '</td><td>' + numHTML(e.before[a]) + '</td><td>' + numHTML(e.after[a]) + '</td><td class="hl">' + rt + '</td></tr>';
    });
    h += '</tbody>';
    setHTML('dblT', h);
  }
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function tex(s) {
    if (!window.katex) return s;
    try { return window.katex.renderToString(s, { throwOnError: false }); } catch (e) { return s; }
  }
  function fmtC(v) { return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : B.trim(v, v < 0.01 ? 5 : v < 1 ? 4 : 3); }
  function updateCmpOut() {
    const x = state.cmp, fa = state.fa, fb = state.fb, a = state.a, b = state.b, n = state.n;
    const nameA = FN_TEX[fa], nameB = FN_TEX[fb];
    const lines = [];
    lines.push(tex('A = ' + (a === 1 ? '' : a + '\\,') + nameA + ',\\quad B = ' + (b === 1 ? '' : b + '\\,') + nameB));
    if (x.same) {
      lines.push(T('同一種成長速度：A ÷ B 永遠是 ', 'The same growth rate: A ÷ B is always ') + fmtC(a / b) + T('，兩條線不會交叉', ', so the lines never cross') +
        (a === b ? T('（常數一樣，兩條線重合）', ' (equal constants: the lines coincide)') : '') + T('。所以 ', '. So ') + tex(nameA + ' = \\Theta(' + nameB + ')') + T('。', '.'));
    } else {
      const w = x.winner, slowF = w === 'A' ? fb : fa, fastF = w === 'A' ? fa : fb;
      const cS = w === 'A' ? b : a, cF = w === 'A' ? a : b;   // 慢的那一邊的常數、快的那一邊的常數
      lines.push(T('長得比較快的是 ', 'The faster-growing side is ') + '<b>' + w + '</b>' + T('（', ' (') + tex(FN_TEX[fastF]) + T('）。', ').'));
      const exact = !x.approx || pow2Exp(x.cross) != null;
      const crossTxt = (exact ? '= ' : '≈ ') + bigHTML(x.cross);
      if (x.cross <= 1) lines.push(T('從 n = 1 起 ' + w + ' 就不比較小。', 'From n = 1 on, ' + w + ' is never smaller.'));
      else lines.push(T('交叉點：從 n ', 'Crossover: from n ') + crossTxt + T(' 起，' + w + ' ≥ ' + (w === 'A' ? 'B' : 'A') + ' 永遠成立', ' on, ' + w + ' ≥ ' + (w === 'A' ? 'B' : 'A') + ' for ever') +
        (x.crossStrict !== x.cross ? T('（從 n = ' + bigHTML(x.crossStrict) + ' 起一直比較大）', ' (strictly larger from n = ' + bigHTML(x.crossStrict) + ')') : '') + T('。', '.'));
      if (x.equal.length) lines.push(T('剛好相等：n = ', 'Exactly equal at n = ') + x.equal.slice(0, 8).map(function (e) { return bigHTML(e); }).join(T('、', ', ')) + T('。', '.'));
      const n0 = Math.max(1, x.cross);
      lines.push(T('所以 ', 'So ') + tex(FN_TEX[slowF] + ' = O(' + FN_TEX[fastF] + ')') + T('：取 ', ': take ') + tex('c = ' + fmtC(cF / cS)) + T('、', ', ') +
        tex('n_0 ' + (exact ? '= ' : '\\approx ') + (pow2Exp(n0) != null ? '2^{' + pow2Exp(n0) + '}' : x.approx ? '2^{' + B.trim(Math.log2(n0), 2) + '}' : n0)) + T('。', '.'));
    }
    const at = B.cmpAt(fa, a, fb, b, n);
    const va = Math.log(a) + B.lnF(fa, n), vb = Math.log(b) + B.lnF(fb, n);
    lines.push(T('在 n = ' + n + '：A = ', 'At n = ' + n + ': A = ') + lnHTML(va) + T('，B = ', ', B = ') + lnHTML(vb) + T('，', ', ') +
      (at === 'eq' ? T('剛好相等。', 'exactly equal.') : at === 'A' ? T('A 比較大。', 'A is larger.') : T('B 比較大。', 'B is larger.')));
    setHTML('cmpOut', lines.map(function (s) { return '<p>' + s + '</p>'; }).join(''));
  }

  // ---------- 狀態列 ----------
  let sayTimer = 0;
  function say(msg) {
    const el = $('status');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 20);
  }

  // =====================================================================
  // 音效（預設關）
  // =====================================================================
  function sound() { const S2 = window.LabSound; return S2 && S2.enabled() ? S2 : null; }
  let tickT = 0;
  function tickSound(force) {
    const S2 = sound(); if (!S2) return;
    if (!force && state.speed > 20) return;
    const t = performance.now() / 1000;
    if (t - tickT < 0.045) return;
    tickT = t;
    S2.tone({ freq: 1250, dur: 0.025, type: 'triangle', gain: 0.05 });
  }
  function finishSound(list) {
    const S2 = sound(); if (!S2) return;
    list.slice(0, 3).forEach(function (a, i) {
      const f = ALG[a].pitch;
      S2.tone({ freq: f, dur: 0.12, gain: 0.18, delay: i * 0.06 });
      S2.tone({ freq: f * 1.5, dur: 0.18, gain: 0.12, delay: i * 0.06 + 0.08 });
    });
  }
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

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitCompare(via) { emit('compare', B.compareEvent(state.fa, state.a, state.fb, state.b, state.n, via)); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elN = $('nn'), elSpeed = $('speed'), elA = $('ca'), elB = $('cb');
  if (window.LabNum) {
    window.LabNum.register(elN, { toValue: nFromPos, toPos: posFromN, min: B.MIN_N, max: B.MAX_N, decimals: 0 });
    window.LabNum.register(elSpeed, { toValue: speedFromPos, toPos: posFromSpeed, min: 1, max: 1000000, decimals: 0 });
    window.LabNum.register(elA, { toValue: cFromPos, toPos: posFromC, min: 1, max: 1000, decimals: 0 });
    window.LabNum.register(elB, { toValue: cFromPos, toPos: posFromC, min: 1, max: 1000, decimals: 0 });
  }
  function readInt(el, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(val(el)))); }
  function refreshOutputs() {
    $('nno').textContent = String(state.n);
    $('speedo').textContent = String(state.speed);
    $('cao').textContent = String(state.a);
    $('cbo').textContent = String(state.b);
    $('dbl').disabled = state.n * 2 > B.MAX_N;
    $('dbl').title = state.n * 2 > B.MAX_N ? T('n 最大是 1000，加倍會超過', 'n is at most 1000; doubling would exceed it') : '';
  }
  function setN(n, emitIt) {
    n = Math.max(B.MIN_N, Math.min(B.MAX_N, Math.round(n)));
    if (window.LabNum) window.LabNum.set(elN, n); else { elN.value = String(posFromN(n)); onNInput(); if (emitIt) onNChange(); }
  }
  function onNInput() {
    const n = readInt(elN, B.MIN_N, B.MAX_N);
    if (n === state.n && state.run) { refreshOutputs(); return; }
    state.n = n;
    refreshOutputs();
    rebuild();
    recomputeCmp();
  }
  function onNChange() {
    onNInput();
    emitCompare('n');
    say(T('n = ' + state.n + '。按「開始賽跑」或「直接跑完」。', 'n = ' + state.n + '. Press “Start race” or “Run to the end”.'));
  }
  elN.addEventListener('input', onNInput);
  elN.addEventListener('change', onNChange);
  elSpeed.addEventListener('input', function () { state.speed = readInt(elSpeed, 1, 1000000); refreshOutputs(); });
  function setShape(s) {
    state.shape = s;
    ['shRandom', 'shSorted', 'shWorst'].forEach(function (id, j) { $(id).setAttribute('aria-pressed', String(B.SHAPES[j] === s)); });
    rebuild();
    say(s === 'random' ? T('合併排序用隨機打亂的資料。', 'Merge sort gets randomly shuffled data.')
      : s === 'sorted' ? T('合併排序用已排好的資料：每次合併，左半都先用完。', 'Merge sort gets sorted data: in every merge the left half runs out first.')
        : T('合併排序用最壞情況的資料：每次合併都要比到最後一個。', 'Merge sort gets worst-case data: every merge compares right to the last element.'));
  }
  $('shRandom').addEventListener('click', function () { setShape('random'); });
  $('shSorted').addEventListener('click', function () { setShape('sorted'); });
  $('shWorst').addEventListener('click', function () { setShape('worst'); });
  $('reseed').addEventListener('click', function () {
    state.seed = 1 + Math.floor(rand() * 2147483646);
    setShape('random');
    say(T('換了一組隨機資料：合併排序要比 ' + commas(state.run.counts.merge) + ' 次（上界 ' + commas(B.formula.merge(state.n)) + '）。', 'New random data: merge sort needs ' + commas(state.run.counts.merge) + ' comparisons (bound ' + commas(B.formula.merge(state.n)) + ').'));
  });
  $('play').addEventListener('click', play);
  $('stepBtn').addEventListener('click', stepOnce);
  $('skip').addEventListener('click', skip);
  $('restart').addEventListener('click', function () { resetRace(); say(T('時鐘歸零。', 'Clock reset.')); requestDraw(); });
  $('clear').addEventListener('click', function () {
    state.points = []; state.dbl = null;
    updateDbl(); chartDirty = true; requestDraw();
    say(T('清掉了圖上的實驗點與加倍實驗的表。', 'Cleared the chart points and the doubling table.'));
  });
  function setMode(m) {
    state.mode = m;
    ['axLin', 'axSemi', 'axLog'].forEach(function (id, j) { $(id).setAttribute('aria-pressed', String(['lin', 'semilog', 'loglog'][j] === m)); });
    chartDirty = true; requestDraw();
    emit('axis', { mode: m });
  }
  $('axLin').addEventListener('click', function () { setMode('lin'); });
  $('axSemi').addEventListener('click', function () { setMode('semilog'); });
  $('axLog').addEventListener('click', function () { setMode('loglog'); });
  $('dbl').addEventListener('click', function () {
    const n0 = state.n, n1 = 2 * n0;
    if (n1 > B.MAX_N) return;
    const ev = B.doubleEvent(n0, state.shape, state.seed);
    state.dbl = ev;
    ORDER.forEach(function (a) {
      addPoint(n0, a, ev.before[a], a === 'subsets' && n0 > B.REAL_SUBSET_MAX, state.shape);
      addPoint(n1, a, ev.after[a], a === 'subsets' && n1 > B.REAL_SUBSET_MAX, state.shape);
    });
    updateDbl();
    setN(n1, true);
    emit('double', ev);
    const S2 = sound(); if (S2) S2.sweep({ from: 420, to: 840, dur: 0.25, gain: 0.16 });
    const rp = ev.ratio.pairs;
    say(rp == null
      ? T('n 從 ' + n0 + ' 加倍到 ' + n1 + '：二分搜尋多 ' + ev.diff.binary + ' 次；n = 1 時兩兩比較是 0 次，算不出倍數。', 'n doubled from ' + n0 + ' to ' + n1 + ': binary search needs ' + ev.diff.binary + ' more; at n = 1 there are no pairs, so there is no ratio.')
      : T('n 從 ' + n0 + ' 加倍到 ' + n1 + '：二分搜尋多 ' + ev.diff.binary + ' 次，兩兩比較變成 ' + B.trim(rp, 3) + ' 倍。', 'n doubled from ' + n0 + ' to ' + n1 + ': binary search needs ' + ev.diff.binary + ' more, every pair ' + B.trim(rp, 3) + ' times as many.'));
  });
  // 常數因子
  function recomputeCmp() {
    state.cmp = B.crossover(state.fa, state.a, state.fb, state.b);
    updateCmpOut();
    cmpDirty = true; requestDraw();
  }
  function readCmp() {
    state.fa = $('fA').value; state.fb = $('fB').value;
    state.a = readInt(elA, 1, 1000); state.b = readInt(elB, 1, 1000);
    refreshOutputs();
    recomputeCmp();
  }
  $('fA').addEventListener('change', function () { readCmp(); emitCompare('cmp'); });
  $('fB').addEventListener('change', function () { readCmp(); emitCompare('cmp'); });
  elA.addEventListener('input', readCmp);
  elB.addEventListener('input', readCmp);
  elA.addEventListener('change', function () { readCmp(); emitCompare('cmp'); });
  elB.addEventListener('change', function () { readCmp(); emitCompare('cmp'); });

  // 點圖設定 n
  function nFromChartX(L, px) {
    if (!L) return null;
    const v = L.Xinv(Math.max(L.padL, Math.min(L.padL + L.iw, px)));
    return Math.max(B.MIN_N, Math.min(B.MAX_N, Math.round(v)));
  }
  hv.addEventListener('pointerdown', function (ev) {
    const r = hv.getBoundingClientRect(), n = nFromChartX(HL, ev.clientX - r.left);
    if (n != null) setN(n, true);
  });
  kv.addEventListener('pointerdown', function (ev) {
    const r = kv.getBoundingClientRect(), n = nFromChartX(KL, ev.clientX - r.left);
    if (n != null) setN(n, true);
  });
  if (window.LabKeys) {
    [hv, kv].forEach(function (cv) {
      window.LabKeys.attach(cv, {
        label: T('圖表。左右方向鍵把 n 減一、加一，Shift 加方向鍵一次改 10%。', 'Chart. Left and right arrow keys change n by one; with Shift, by 10%.'),
        items: [{
          name: function () { return 'n'; },
          move: function (dx, dy, big) {
            const d = dx || -dy;
            if (!d) return false;
            const step = big ? Math.max(1, Math.round(state.n * 0.1)) : 1;
            const n = Math.max(B.MIN_N, Math.min(B.MAX_N, state.n + d * step));
            if (n === state.n) return false;
            setN(n, true);
            return true;
          },
          describe: function () { return 'n = ' + state.n; }
        }],
        onChange: function () { requestDraw(); }
      });
    });
  }

  // 給測試用的介面（不影響畫面）
  window.BigOLab = {
    state: state,
    setN: function (n) { setN(n, true); },
    setCmp: function (fa, a, fb, b) {
      $('fA').value = fa; $('fB').value = fb;
      if (window.LabNum) { window.LabNum.set(elA, a); window.LabNum.set(elB, b); } else readCmp();
    },
    seed: function (s) { state.seed = s; rebuild(); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  state.n = readInt(elN, B.MIN_N, B.MAX_N);
  state.speed = readInt(elSpeed, 1, 1000000);
  state.fa = $('fA').value; state.fb = $('fB').value;
  state.a = readInt(elA, 1, 1000); state.b = readInt(elB, 1, 1000);
  refreshOutputs();
  updateSoundButton();
  rebuild();
  recomputeCmp();
  updateDbl();
  say(T('n = ' + state.n + '：按「開始賽跑」，看五個演算法用同一個時鐘一起跑。', 'n = ' + state.n + ': press “Start race” to watch the five algorithms run on one shared clock.'));
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    updateCounts(); updateDbl(); updateCmpOut(); updatePlayLabel(); updateSoundButton();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0, lastK = 0;
    new ResizeObserver(function () {
      if (rv.clientWidth !== lastW || kv.clientWidth !== lastK) { lastW = rv.clientWidth; lastK = kv.clientWidth; resize(); }
    }).observe(document.getElementById('lab'));
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.playing) { state.playing = false; updatePlayLabel(); } });
  resize();
})();
