/* binary-search.js — 「線性搜尋與二分搜尋」的畫面與互動（計算在 binary-search-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 兩種搜尋真的在畫面上的卡片執行（BinarySearchCore.stepper），每一步各比一次；
 * 任務事件的資料由核心的 searchEvent／sweepEvent／gameEvent 產生（任務證明用的是同一套函式）。 */
(function () {
  'use strict';
  const B = window.BinarySearchCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade, mix = D.mix;

  // 卡片張數滑桿：對數刻度（位置 0–1000 → n = 4 到 1023），小的 n 也調得準
  const N_POS = 1000, N_LN = Math.log(B.MAX_N / B.MIN_N);
  function nFromPos(p) { return Math.max(B.MIN_N, Math.min(B.MAX_N, Math.round(B.MIN_N * Math.exp(N_LN * p / N_POS)))); }
  function posFromN(n) { return N_POS * Math.log(n / B.MIN_N) / N_LN; }

  // ---------- 狀態 ----------
  const state = {
    seed: 1112, n: 20, kind: 'sorted', first: false,
    data: null, vmin: 0, vmax: 1, target: 0, occ: null,
    run: null, playing: false, acc: 0, speed: 2, stepAge: 9,
    band: { lo: 0, hi: 19 },
    fx: [],
    points: [],
    sweep: null,
    game: null, games: [], gameNo: 0
  };
  let rand = B.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface',
      'bs-lin', 'bs-bin', 'bs-hit', 'bs-miss', 'bs-target', 'bs-card', 'bs-track']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function numTxt(v) { return String(v).replace('-', '−'); }
  function fix(v, dec) { return isFinite(v) ? B.trim(v, dec).replace('-', '−') : '—'; }
  function idx(i) { return 'a[' + i + ']'; }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const tv = $('tree'), tctx = tv.getContext('2d');
  const hv = $('chart'), hctx = hv.getContext('2d');
  const gv = $('gcv'), gctx = gv.getContext('2d');
  let dpr = 1;
  const S = { cw: 300, ch: 280, tw: 300, th: 240, hw: 300, hh: 210, gw: 300, gh: 76 };
  let L = null, TL = null;
  let dirty = true, treeDirty = true, chartDirty = true, gameDirty = true;

  /** 文字高度（已含字體大小設定的縮放） */
  function textH(c, px, w) { c.font = fnt(px, w); return D.textHeight(c.measureText('0Ag'), px * 1.25); }

  // =====================================================================
  // 版面：上面一排線性搜尋、下面一排二分搜尋
  // =====================================================================
  function layoutMain(W) {
    const n = state.n, narrow = W < 600;
    const padL = narrow ? 10 : 34, padR = narrow ? 10 : 12;
    const inner = W - padL - padR;
    let mode = 'bars', rows = 1, cols = n, gap = 0, cwid = 0, chgt = 0, rowGap = 0, slot, bodyH;
    if (n <= 40) {
      gap = n <= 16 ? 6 : 3;
      const minW = narrow ? 27 : 20;
      const maxCols = Math.max(1, Math.floor((inner + gap) / (minW + gap)));
      rows = Math.ceil(n / maxCols);
      if (rows <= (narrow ? 3 : 4)) { mode = 'cards'; cols = Math.ceil(n / rows); }
      else rows = 1;
    }
    const th = textH(ctx, 12, 650);
    const pillH = th + 5;
    if (mode === 'cards') {
      slot = inner / cols;
      cwid = Math.min(56, slot - gap);
      chgt = Math.round(Math.max(32, Math.min(48, cwid * 1.25)));
      rowGap = rows > 1 ? Math.round(pillH + 22) : 0;
      bodyH = rows * chgt + (rows - 1) * rowGap;
    } else {
      cols = n;
      slot = inner / n;
      bodyH = narrow ? 76 : 96;
    }
    const topBar = Math.round(pillH + 10), head = Math.round(pillH + 10), ptr = Math.round(pillH + 10);
    const lanes = [];
    let y = topBar;
    for (let k = 0; k < 2; k++) {
      const bottom = k === 0 ? 12 : Math.round(th + 20);
      const h = head + ptr + bodyH + bottom;
      lanes.push({ y: y, h: h, bodyTop: y + head + ptr, bodyBot: y + head + ptr + bodyH });
      y += h + 10;
    }
    return { W: W, narrow: narrow, padL: padL, padR: padR, inner: inner, mode: mode, rows: rows, cols: cols, gap: gap,
      cwid: cwid, chgt: chgt, rowGap: rowGap, slot: slot, bodyH: bodyH, topBar: topBar, head: head, ptr: ptr, pillH: pillH, th: th,
      lanes: lanes, H: Math.round(y - 4) };
  }
  /** 第 i 張卡在第 lane 排的位置 */
  function cardRect(i, lane) {
    const ln = L.lanes[lane];
    if (L.mode === 'cards') {
      const r = Math.floor(i / L.cols), c = i % L.cols;
      const cx = L.padL + (c + 0.5) * L.slot;
      return { x: cx - L.cwid / 2, y: ln.bodyTop + r * (L.chgt + L.rowGap), w: L.cwid, h: L.chgt, cx: cx, row: r };
    }
    const x = L.padL + i * L.slot;
    return { x: x, y: ln.bodyTop, w: L.slot, h: L.bodyH, cx: x + L.slot / 2, row: 0 };
  }
  /** 長條圖：數值 → 長條高度 */
  function barH(v) {
    const span = Math.max(1, state.vmax - state.vmin);
    return 6 + (v - state.vmin) / span * (L.bodyH - 12);
  }

  // =====================================================================
  // 決策樹的版面
  // =====================================================================
  function layoutTree(W) {
    const n = state.n, TR = B.tree(n), h = TR.height, narrow = W < 600;
    const padL = narrow ? 30 : 34, padR = narrow ? 10 : 12, inner = W - padL - padR;
    const gap = h <= 4 ? (narrow ? 40 : 46) : h <= 6 ? (narrow ? 34 : 40) : (narrow ? 26 : 31);
    const th = textH(tctx, 12, 650);
    const top = Math.round(th + 26);
    const ext = n <= 63;
    const levels = [];
    for (let d = 0; d < h; d++) levels.push([]);
    for (let i = 0; i < n; i++) levels[TR.depth[i]].push(i);
    const H = Math.round(top + (h - 1) * gap + (ext ? gap * 0.8 + 8 : 0) + 22);
    return { W: W, H: H, padL: padL, padR: padR, inner: inner, gap: gap, top: top, ext: ext, h: h, TR: TR, slot: inner / n, levels: levels, narrow: narrow };
  }
  function nodeX(i) { return TL.padL + (i + 0.5) * TL.slot; }
  function nodeY(d) { return TL.top + d * TL.gap; }
  function levelSpacing(d) { return TL.slot * Math.pow(2, TL.h - 1 - d); }
  function nodeR(d) { return Math.max(1.3, Math.min(13, levelSpacing(d) * 0.42)); }
  function extX(after) { return TL.padL + (after + 1) * TL.slot; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    S.cw = w;
    L = layoutMain(w);
    S.ch = L.H;
    if (cv.style.height !== S.ch + 'px') cv.style.height = S.ch + 'px';
    cv.width = Math.round(S.cw * dpr); cv.height = Math.round(S.ch * dpr);
    S.tw = tv.clientWidth || w;
    TL = layoutTree(S.tw);
    S.th = TL.H;
    if (tv.style.height !== S.th + 'px') tv.style.height = S.th + 'px';
    tv.width = Math.round(S.tw * dpr); tv.height = Math.round(S.th * dpr);
    S.hw = hv.clientWidth || w;
    S.hh = S.hw < 600 ? 190 : 220;
    if (hv.style.height !== S.hh + 'px') hv.style.height = S.hh + 'px';
    hv.width = Math.round(S.hw * dpr); hv.height = Math.round(S.hh * dpr);
    S.gw = gv.clientWidth || 280;
    S.gh = Math.round(textH(gctx, 12, 600) * 2 + 50);
    if (gv.style.height !== S.gh + 'px') gv.style.height = S.gh + 'px';
    gv.width = Math.round(S.gw * dpr); gv.height = Math.round(S.gh * dpr);
    dirty = treeDirty = chartDirty = gameDirty = true;
    requestDraw();
  }

  // =====================================================================
  // 小工具：圓角標籤
  // =====================================================================
  /** 圓角標籤（yTop 是上緣）。o：{ size, weight, dot, solid, ink, clamp: [左, 右] } */
  function tag(c, text, x, yTop, color, align, o) {
    o = o || {};
    const size = o.size || 12;
    c.font = fnt(size, o.weight || 650);
    const m = c.measureText(text), tw = m.width, th = D.textHeight(m, size * 1.25);
    const dot = o.dot ? th * 0.55 + 5 : 0;
    const pw = tw + 14 + dot, ph = th + 5;
    let bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    if (o.clamp) bx = Math.max(o.clamp[0], Math.min(o.clamp[1] - pw, bx));
    D.roundRect(c, bx, yTop, pw, ph, ph / 2);
    c.fillStyle = o.solid ? color : alpha(C['canvas-bg'], D.dark ? 0.88 : 0.94);
    c.fill();
    c.strokeStyle = o.solid ? alpha(shade(color, -0.3), 0.5) : alpha(color, D.dark ? 0.6 : 0.5);
    c.lineWidth = 1;
    c.stroke();
    if (o.dot) {
      c.beginPath(); c.arc(bx + 7 + th * 0.27, yTop + ph / 2, th * 0.27, 0, Math.PI * 2);
      c.fillStyle = color; c.fill();
    }
    c.fillStyle = o.solid ? (o.ink || (D.dark ? '#0b1215' : '#ffffff')) : (o.ink || color);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(text, bx + 7 + dot, yTop + ph / 2 + 0.5);
    return { x: bx, y: yTop, w: pw, h: ph };
  }
  /** 把字型縮到放得進 maxW */
  function fitFont(c, text, maxW, px, minPx, weight) {
    let s = px;
    for (; s > minPx; s -= 0.5) { c.font = fnt(s, weight); if (c.measureText(text).width <= maxW) return s; }
    c.font = fnt(minPx, weight);
    return minPx;
  }
  function lift() {
    if (reducedMotion) return 4;
    const u = Math.min(1, state.stepAge / 0.16);
    return 4 * (1 - Math.pow(1 - u, 3));
  }

  // =====================================================================
  // 卡片與長條
  // =====================================================================
  /** 一張卡：o = { fade, lift, ring, glow, dashed, badge, badgeColor } */
  function drawCard(r, v, o) {
    const x = r.x, y = r.y - (o.lift || 0), w = r.w, h = r.h;
    const rad = Math.min(7, w * 0.22);
    ctx.save();
    ctx.globalAlpha = o.fade == null ? 1 : o.fade;
    // 輕微投影（不用 shadowBlur，卡片多時也不吃效能）
    D.roundRect(ctx, x + 0.5, y + 2.5 + (o.lift || 0) * 0.6, w, h, rad);
    ctx.fillStyle = D.shadowInk(D.dark ? 0.4 : 0.1 + (o.lift ? 0.05 : 0));
    ctx.fill();
    if (o.ring && o.glow) { ctx.shadowColor = alpha(o.ring, D.dark ? 0.75 : 0.45); ctx.shadowBlur = 12; }
    const face = o.ring && !o.dashed ? mix(C['bs-card'], o.ring, D.dark ? 0.2 : 0.1) : C['bs-card'];
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(face, D.dark ? 0.08 : 0.5));
    g.addColorStop(0.6, face);
    g.addColorStop(1, shade(face, D.dark ? -0.18 : -0.06));
    D.roundRect(ctx, x, y, w, h, rad);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    // 頂邊高光
    ctx.save();
    D.roundRect(ctx, x, y, w, h, rad); ctx.clip();
    ctx.fillStyle = alpha('#ffffff', D.dark ? 0.08 : 0.7);
    ctx.fillRect(x, y, w, 1.2);
    ctx.restore();
    D.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, rad - 0.5));
    if (o.ring) {
      ctx.strokeStyle = o.ring; ctx.lineWidth = 2;
      if (o.dashed) ctx.setLineDash([4, 3]);
      ctx.stroke(); ctx.setLineDash([]);
    } else { ctx.strokeStyle = alpha(C.text, D.dark ? 0.22 : 0.17); ctx.lineWidth = 1; ctx.stroke(); }
    // 數字
    const txt = numTxt(v);
    fitFont(ctx, txt, w - 4, Math.min(16, h * 0.42), 7.5, 650);
    ctx.fillStyle = o.ring && !o.dashed ? shade(o.ring, D.dark ? 0.35 : -0.25) : C.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + w / 2, y + h / 2 + 0.5);
    if (o.badge) {
      ctx.globalAlpha = o.fade == null || o.fade >= 1 ? 1 : 0.85;
      const br = Math.max(6, Math.min(8, w * 0.2));
      const bx = x + w - br * 0.55, by = y + br * 0.4;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = o.badgeColor || C['bs-bin']; ctx.fill();
      ctx.strokeStyle = C['canvas-bg']; ctx.lineWidth = 1.2; ctx.stroke();
      fitFont(ctx, String(o.badge), br * 1.6, 10, 7, 700);
      ctx.fillStyle = D.dark ? '#0b1215' : '#ffffff';
      ctx.fillText(String(o.badge), bx, by + 0.5);
    }
    ctx.restore();
  }

  /** 一排的背景軌道與標題 */
  function laneFrame(k, color, name, right) {
    const ln = L.lanes[k];
    const x = 3, w = S.cw - 6;
    ctx.save();
    D.roundRect(ctx, x, ln.y, w, ln.h, 11);
    const g = ctx.createLinearGradient(0, ln.y, 0, ln.y + ln.h);
    g.addColorStop(0, C['bs-track']);
    g.addColorStop(1, alpha(C['bs-track'], 0.35));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = alpha(C.border, 0.9); ctx.lineWidth = 1; ctx.stroke();
    D.roundRect(ctx, x + 1, ln.y + 10, 3, ln.h - 20, 1.5);
    ctx.fillStyle = alpha(color, 0.85); ctx.fill();
    ctx.restore();
    tag(ctx, name, L.padL, ln.y + 6, color, 'left', { dot: true, weight: 700 });
    if (right) tag(ctx, right, S.cw - L.padR, ln.y + 6, color, 'right', { weight: 650 });
  }

  // =====================================================================
  // 主畫布
  // =====================================================================
  function drawMain() {
    if (!L || !state.data) return;
    const W = S.cw, H = S.ch;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, W, H);
    const run = state.run;
    tag(ctx, T('目標 ', 'Target ') + numTxt(state.target), L.padL, 5, C['bs-target'], 'left', { solid: true, weight: 700, size: 12.5 });
    const kindName = { sorted: T('排好的', 'sorted'), dups: T('有重複的值', 'with repeats'), unsorted: T('沒排序', 'not sorted') }[state.kind];
    const rightTop = 'n = ' + state.n + ' · ' + kindName + (run && run.steps ? ' · ' + T('第 ' + run.steps + ' 步', 'step ' + run.steps) : '');
    tag(ctx, rightTop, W - L.padR, 5, C.muted, 'right', { weight: 600, size: 11.5 });

    const lin = run ? run.lin : null, bin = run ? run.bin : null;
    laneFrame(0, C['bs-lin'], T('線性搜尋', 'Linear search'), T('比較 ', '') + (lin ? lin.cmp : 0) + T(' 次', ' comparisons'));
    let right2 = T('比較 ', '') + (bin ? bin.cmp : 0) + T(' 次', ' comparisons');
    const left = remaining();
    if (!(bin && bin.done)) right2 += T(' · 剩 ', ' · ') + left + T(' 張', ' left');
    laneFrame(1, C['bs-bin'], T('二分搜尋', 'Binary search'), right2);

    if (L.mode === 'cards') { drawLinearCards(); drawBinaryCards(); }
    else { drawBars(0); drawBars(1); }
    drawFx();
  }
  function remaining() {
    const bin = state.run ? state.run.bin : null;
    if (!bin) return state.n;
    return Math.max(0, bin.hi - bin.lo + 1);
  }
  function clampX() { return [4, S.cw - 4]; }

  function drawLinearCards() {
    const a = state.data.a, n = state.n, t = state.target;
    const lin = state.run ? state.run.lin : null;
    for (let i = 0; i < n; i++) {
      const rc = cardRect(i, 0);
      let o = {};
      if (lin && lin.cmp > 0) {
        if (lin.found === i) o = { ring: C['bs-hit'], glow: true, lift: lift() };
        else if (i === lin.last && !lin.done) o = { ring: C['bs-lin'], glow: true, lift: lift() };
        else if (i <= lin.last) o = { fade: 0.4 };
      }
      drawCard(rc, a[i], o);
    }
    if (lin && lin.cmp > 0) {
      const i = lin.last, rc = cardRect(i, 0), v = a[i];
      const yb = rc.y - lift() - 4 - L.pillH;
      if (lin.found >= 0) tag(ctx, numTxt(v) + ' = ' + numTxt(t) + ' ✓', rc.cx, yb, C['bs-hit'], 'center', { clamp: clampX(), solid: true });
      else if (!lin.done) tag(ctx, numTxt(v) + ' ≠ ' + numTxt(t), rc.cx, yb, C['bs-lin'], 'center', { clamp: clampX() });
      else tag(ctx, T('全部看完：找不到', 'Checked all: not found'), rc.cx, yb, C['bs-miss'], 'center', { clamp: clampX(), solid: true });
    }
  }

  function drawBinaryCards() {
    const a = state.data.a, n = state.n, t = state.target;
    const run = state.run, bin = run ? run.bin : null;
    const blo = state.band.lo, bhi = state.band.hi;
    const badges = {};
    if (bin) bin.path.forEach(function (p, k) { badges[p.mid] = k + 1; });
    const current = bin && bin.last && !bin.done ? bin.last.mid : -1;
    // 剩下的範圍：卡片後面淡淡的底色
    for (let r = 0; r < L.rows; r++) {
      const i0 = Math.max(Math.ceil(blo - 0.001), r * L.cols), i1 = Math.min(Math.floor(bhi + 0.001), r * L.cols + L.cols - 1, n - 1);
      if (i1 < i0) continue;
      const fr = (blo - Math.floor(blo)), A = cardRect(i0, 1), Bc = cardRect(i1, 1);
      const x0 = (i0 === Math.ceil(blo - 0.001) && fr > 0.001 ? A.x - fr * L.slot : A.x) - 3;
      const x1 = Bc.x + Bc.w + 3;
      D.roundRect(ctx, x0, A.y - 4, x1 - x0, L.chgt + 8, 8);
      ctx.fillStyle = alpha(C['bs-bin'], D.dark ? 0.14 : 0.08);
      ctx.fill();
    }
    for (let i = 0; i < n; i++) {
      const rc = cardRect(i, 1);
      const inside = i >= blo - 0.5 && i <= bhi + 0.5;
      let o = { fade: inside ? 1 : 0.28 };
      if (bin && bin.done && bin.found === i) o = { ring: C['bs-hit'], glow: true, lift: lift() };
      else if (i === current) o = { ring: C['bs-bin'], glow: true, lift: lift() };
      else if (bin && state.first && bin.ans === i && !bin.done) o = { ring: C['bs-hit'], dashed: true, fade: o.fade };
      if (badges[i]) { o.badge = badges[i]; o.badgeColor = bin.found === i && bin.done ? C['bs-hit'] : C['bs-bin']; }
      drawCard(rc, a[i], o);
    }
    if (!bin) { loHiMarks(0, n - 1); return; }
    const p = bin.last;
    if (bin.done) {
      if (bin.found >= 0) {
        const rc = cardRect(bin.found, 1);
        tag(ctx, numTxt(a[bin.found]) + ' = ' + numTxt(t) + ' ✓', rc.cx, rc.y - lift() - 4 - L.pillH, C['bs-hit'], 'center', { clamp: clampX(), solid: true });
      } else missMark();
      return;
    }
    if (p) {
      const rc = cardRect(p.mid, 1), v = a[p.mid];
      const txt = p.rel === 0 ? numTxt(v) + ' = ' + numTxt(t) + (state.first ? T(' ← 再往左', ' ← go on left') : ' ✓')
        : p.rel < 0 ? numTxt(v) + ' < ' + numTxt(t) + ' →' : '← ' + numTxt(v) + ' > ' + numTxt(t);
      tag(ctx, txt, rc.cx, rc.y - lift() - 4 - L.pillH, C['bs-bin'], 'center', { clamp: clampX() });
    }
    loHiMarks(bin.lo, bin.hi);
  }
  /** lo、hi 的小三角形與文字（卡片下方） */
  function loHiMarks(lo, hi) {
    if (lo > hi) return;
    const draw = function (i, label) {
      const rc = cardRect(i, 1);
      const y = rc.y + rc.h + 4;
      ctx.beginPath(); ctx.moveTo(rc.cx, y); ctx.lineTo(rc.cx - 5, y + 6); ctx.lineTo(rc.cx + 5, y + 6); ctx.closePath();
      ctx.fillStyle = C['bs-bin']; ctx.fill();
      D.haloText(ctx, label, rc.cx, y + 8, C['bs-bin'], 'center', 'top', fnt(11, 700));
    };
    if (lo === hi) draw(lo, 'lo = hi');
    else {
      const A = cardRect(lo, 1), Bc = cardRect(hi, 1);
      if (A.row === Bc.row && Bc.cx - A.cx < 30) { draw(lo, 'lo'); D.haloText(ctx, 'hi', Bc.cx + 8, Bc.y + Bc.h + 12, C['bs-bin'], 'left', 'top', fnt(11, 700)); }
      else { draw(lo, 'lo'); draw(hi, 'hi'); }
    }
  }
  /** 二分搜尋找不到：在 hi 與 lo 之間的空隙畫一條紅色虛線（目標應該插入的位置） */
  function missMark() {
    const bin = state.run.bin, n = state.n;
    let x, y0, y1;
    if (L.mode === 'cards') {
      const ref = bin.hi >= 0 ? cardRect(bin.hi, 1) : cardRect(0, 1);
      x = bin.hi >= 0 ? ref.x + ref.w + L.gap / 2 + (L.slot - L.cwid - L.gap) / 2 : ref.x - (L.slot - L.cwid) / 2;
      if (bin.hi >= 0 && bin.hi < n - 1) { const nx = cardRect(bin.hi + 1, 1); if (nx.row === ref.row) x = (ref.x + ref.w + nx.x) / 2; }
      y0 = ref.y - 6; y1 = ref.y + ref.h + 6;
    } else {
      x = L.padL + (bin.hi + 1) * L.slot;
      y0 = L.lanes[1].bodyTop - 6; y1 = L.lanes[1].bodyBot + 6;
    }
    ctx.save();
    ctx.setLineDash([4, 3]); ctx.strokeStyle = C['bs-miss']; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.restore();
    tag(ctx, T('範圍空了：找不到', 'Range empty: not found'), x, y0 - L.pillH - 2, C['bs-miss'], 'center', { clamp: clampX(), solid: true });
  }

  /** 長條模式（卡片太多時）：高度 ∝ 數值，目標是一條水平虛線 */
  function drawBars(lane) {
    const a = state.data.a, n = state.n, t = state.target;
    const ln = L.lanes[lane];
    const base = ln.bodyBot, run = state.run;
    const lin = run ? run.lin : null, bin = run ? run.bin : null;
    const bw = L.slot, gp = bw >= 4 ? Math.min(1.5, bw * 0.22) : 0;
    const blo = state.band.lo, bhi = state.band.hi;
    // 範圍底色
    if (lane === 1) {
      const x0 = L.padL + Math.max(0, blo) * bw, x1 = L.padL + Math.min(n, bhi + 1) * bw;
      if (x1 > x0) {
        ctx.fillStyle = alpha(C['bs-bin'], D.dark ? 0.15 : 0.09);
        ctx.fillRect(x0, ln.bodyTop - 2, x1 - x0, L.bodyH + 4);
      }
    }
    // 分類後一次畫（上千根長條也很快）
    const groups = { base: [], fade: [], visit: [] };
    const special = [];
    for (let i = 0; i < n; i++) {
      let g = 'base';
      if (lane === 0) {
        if (lin && lin.cmp > 0) {
          if (i === lin.found || (i === lin.last && !lin.done)) { special.push(i); continue; }
          if (i <= lin.last) g = 'visit';
        }
      } else {
        if (bin && ((bin.done && bin.found === i) || (bin.last && i === bin.last.mid && !bin.done))) { special.push(i); continue; }
        const inside = i >= blo - 0.5 && i <= bhi + 0.5;
        if (!inside) g = 'fade';
      }
      groups[g].push(i);
    }
    const grad = ctx.createLinearGradient(0, ln.bodyTop, 0, base);
    grad.addColorStop(0, shade(C.muted, D.dark ? 0.25 : 0.1));
    grad.addColorStop(1, shade(C.muted, D.dark ? -0.25 : 0.55));
    const fillGroup = function (list, style, a2) {
      if (!list.length) return;
      ctx.globalAlpha = a2;
      ctx.fillStyle = style;
      ctx.beginPath();
      list.forEach(function (i) { const h = barH(a[i]); ctx.rect(L.padL + i * bw + gp / 2, base - h, Math.max(0.6, bw - gp), h); });
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    fillGroup(groups.base, grad, 1);
    fillGroup(groups.fade, grad, 0.22);
    fillGroup(groups.visit, C['bs-lin'], 0.35);
    // 二分搜尋走過的 mid：長條頂端的小點
    if (lane === 1 && bin) {
      bin.path.forEach(function (p) {
        const x = L.padL + (p.mid + 0.5) * bw, y = base - barH(a[p.mid]);
        ctx.beginPath(); ctx.arc(x, y - 3, 2.6, 0, Math.PI * 2); ctx.fillStyle = C['bs-bin']; ctx.fill();
      });
    }
    // 基準線
    ctx.strokeStyle = alpha(C.text, 0.25); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.padL - 2, base + 0.5); ctx.lineTo(L.padL + L.inner + 2, base + 0.5); ctx.stroke();
    // 目標值的水平虛線
    const yT = t < state.vmin ? base - 3 : t > state.vmax ? ln.bodyTop + 2 : base - barH(t);
    ctx.save();
    ctx.setLineDash([6, 4]); ctx.strokeStyle = alpha(C['bs-target'], 0.85); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(L.padL, yT); ctx.lineTo(L.padL + L.inner, yT); ctx.stroke();
    ctx.restore();
    // 特別的長條（正在看、找到）
    special.forEach(function (i) {
      const found = lane === 0 ? i === lin.found : (bin.done && bin.found === i);
      const col = found ? C['bs-hit'] : lane === 0 ? C['bs-lin'] : C['bs-bin'];
      const h = barH(a[i]), w = Math.max(3, bw - gp), x = L.padL + (i + 0.5) * bw - w / 2;
      ctx.save();
      ctx.shadowColor = alpha(col, D.dark ? 0.8 : 0.5); ctx.shadowBlur = 10;
      ctx.fillStyle = col;
      ctx.fillRect(x, base - h, w, h);
      ctx.restore();
    });
    // 標籤
    const pillY = ln.bodyTop - L.ptr + 4;
    const leader = function (i, col) {
      const x = L.padL + (i + 0.5) * bw, y = base - barH(a[i]);
      ctx.save(); ctx.strokeStyle = alpha(col, 0.7); ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(x, pillY + L.pillH); ctx.lineTo(x, y - 2); ctx.stroke(); ctx.restore();
      return x;
    };
    if (lane === 0 && lin && lin.cmp > 0) {
      const i = lin.last, v = a[i];
      if (lin.found >= 0) tag(ctx, idx(i) + ' = ' + numTxt(v) + ' ✓', leader(i, C['bs-hit']), pillY, C['bs-hit'], 'center', { clamp: clampX(), solid: true });
      else if (!lin.done) tag(ctx, idx(i) + ' = ' + numTxt(v) + ' ≠ ' + numTxt(t), leader(i, C['bs-lin']), pillY, C['bs-lin'], 'center', { clamp: clampX() });
      else tag(ctx, T('全部看完：找不到', 'Checked all: not found'), S.cw / 2, pillY, C['bs-miss'], 'center', { clamp: clampX(), solid: true });
    }
    if (lane === 1) {
      if (bin && bin.done) {
        if (bin.found >= 0) tag(ctx, idx(bin.found) + ' = ' + numTxt(a[bin.found]) + ' ✓', leader(bin.found, C['bs-hit']), pillY, C['bs-hit'], 'center', { clamp: clampX(), solid: true });
        else missMark();
      } else if (bin && bin.last) {
        const p = bin.last, v = a[p.mid];
        const txt = 'mid = ' + p.mid + ': ' + (p.rel === 0 ? numTxt(v) + ' = ' + numTxt(t) + (state.first ? ' ←' : ' ✓') : p.rel < 0 ? numTxt(v) + ' < ' + numTxt(t) + ' →' : '← ' + numTxt(v) + ' > ' + numTxt(t));
        tag(ctx, txt, leader(p.mid, C['bs-bin']), pillY, C['bs-bin'], 'center', { clamp: clampX() });
      }
      // lo、hi
      if (!(bin && bin.done)) {
        const lo = bin ? bin.lo : 0, hi = bin ? bin.hi : n - 1;
        const y = base + 4;
        [[lo, 'lo'], [hi, 'hi']].forEach(function (q, k) {
          const x = L.padL + (q[0] + 0.5) * bw;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 6); ctx.lineTo(x + 5, y + 6); ctx.closePath();
          ctx.fillStyle = C['bs-bin']; ctx.fill();
          const lab = lo === hi ? (k ? '' : 'lo = hi') : q[1];
          if (lab) D.haloText(ctx, lab, x + (lo !== hi && hi - lo < 30 / bw ? (k ? 9 : -9) : 0), y + 8, C['bs-bin'], lo !== hi && hi - lo < 30 / bw ? (k ? 'left' : 'right') : 'center', 'top', fnt(11, 700));
        });
      }
    }
    // 目標標籤（右端）
    tag(ctx, numTxt(t), L.padL + L.inner, yT - L.pillH / 2, C['bs-target'], 'right', { size: 11, solid: true, clamp: clampX() });
  }

  function drawFx() {
    state.fx.forEach(function (f) {
      const u = f.t / 0.5;
      let x, y, r;
      if (L.mode === 'cards') { const rc = cardRect(f.i, f.lane); x = rc.cx; y = rc.y + rc.h / 2; r = Math.max(rc.w, rc.h) * 0.55; }
      else { x = L.padL + (f.i + 0.5) * L.slot; y = L.lanes[f.lane].bodyBot - barH(state.data.a[f.i]); r = 10; }
      D.ripple(ctx, x, y, r, u, C['bs-hit']);
    });
  }

  // =====================================================================
  // 決策樹
  // =====================================================================
  let treeLayer = null;
  function buildTreeLayer() {
    if (!TL) return;
    if (!treeLayer) treeLayer = document.createElement('canvas');
    treeLayer.width = tv.width; treeLayer.height = tv.height;
    const c = treeLayer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, S.tw, S.th);
    const TR = TL.TR, n = state.n, a = state.data.a, h = TL.h;
    // 每一層的導引線與層號
    for (let d = 0; d < h; d++) {
      const y = Math.round(nodeY(d)) + 0.5;
      c.strokeStyle = alpha(C.text, D.dark ? 0.07 : 0.06); c.lineWidth = 1;
      c.beginPath(); c.moveTo(TL.padL - 4, y); c.lineTo(S.tw - TL.padR, y); c.stroke();
      c.beginPath(); c.arc(TL.padL - 17, y, 8.5, 0, Math.PI * 2);
      c.fillStyle = alpha(C['bs-bin'], D.dark ? 0.2 : 0.1); c.fill();
      fitFont(c, String(d + 1), 14, 11, 7, 700);
      c.fillStyle = C['bs-bin']; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(d + 1), TL.padL - 17, y + 0.5);
    }
    // 邊
    c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const d = TR.depth[i];
      if (levelSpacing(d) < 5) continue;
      [TR.left[i], TR.right[i]].forEach(function (ch) {
        if (ch < 0) return;
        c.strokeStyle = alpha(C.text, D.dark ? 0.26 : 0.22); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(nodeX(i), nodeY(d)); c.lineTo(nodeX(ch), nodeY(d + 1)); c.stroke();
      });
    }
    // 找不到時停的空隙（小方塊）
    if (TL.ext) {
      TR.ext.forEach(function (e) {
        const x = extX(e.after), y = nodeY(e.depth), s = Math.max(3, Math.min(7, TL.slot * 0.28));
        if (e.parent >= 0) {
          c.save(); c.setLineDash([2, 3]); c.strokeStyle = alpha(C.muted, 0.45); c.lineWidth = 1;
          c.beginPath(); c.moveTo(nodeX(e.parent), nodeY(e.depth - 1)); c.lineTo(x, y - s); c.stroke(); c.restore();
        }
        D.roundRect(c, x - s, y - s, 2 * s, 2 * s, 1.5);
        c.fillStyle = alpha(C.muted, D.dark ? 0.25 : 0.14); c.fill();
        c.strokeStyle = alpha(C.muted, 0.55); c.lineWidth = 1; c.stroke();
      });
    }
    // 節點
    for (let d = 0; d < h; d++) {
      const r = nodeR(d), sp = levelSpacing(d), list = TL.levels[d];
      if (sp < 2.2) {
        // 太密：畫成一條細細的點線
        c.fillStyle = alpha(C.muted, D.dark ? 0.6 : 0.5);
        list.forEach(function (i) { c.fillRect(nodeX(i) - 0.6, nodeY(d) - 1.6, 1.2, 3.2); });
        continue;
      }
      list.forEach(function (i) {
        const x = nodeX(i), y = nodeY(d);
        if (r < 4) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = alpha(C.muted, 0.8); c.fill(); return; }
        const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        g.addColorStop(0, shade(C['bs-card'], D.dark ? 0.2 : 0.6));
        g.addColorStop(1, shade(C['bs-card'], D.dark ? -0.15 : -0.1));
        c.save();
        c.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.18); c.shadowBlur = 4; c.shadowOffsetY = 1.5;
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = g; c.fill();
        c.restore();
        c.strokeStyle = alpha(C.text, D.dark ? 0.35 : 0.3); c.lineWidth = 1; c.stroke();
        if (r >= 6.5) {
          const txt = numTxt(a[i]);
          fitFont(c, txt, r * 1.75, 11.5, 7, 650);
          c.fillStyle = C.text; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(txt, x, y + 0.5);
        }
      });
    }
    treeDirty = false;
  }
  function drawTree() {
    if (!TL || !state.data) return;
    if (treeDirty || !treeLayer) buildTreeLayer();
    const c = tctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, tv.width, tv.height);
    c.drawImage(treeLayer, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const h = TL.h, a = state.data.a;
    const full = B.isPerfect(state.n);
    const opts = [
      T('樹高 ' + h + ' 層 → 最多比較 ' + h + ' 次', 'Height ' + h + ' → at most ' + h + ' comparisons') + (full ? T('・每層都排滿', ' · every level full') : ''),
      T('樹高 ' + h + ' 層 → 最多 ' + h + ' 次', 'Height ' + h + ' → at most ' + h) + (full ? T('・排滿', ' · full') : '')
    ];
    c.font = fnt(12, 700);
    const txt = opts.find(function (s) { return c.measureText(s).width + 20 <= S.tw - 40; }) || opts[1];
    tag(c, txt, S.tw - TL.padR, 6, C['bs-bin'], 'right', { weight: 700, clamp: [4, S.tw - 4] });
    const run = state.run, bin = run ? run.bin : null;
    if (!bin || !bin.path.length) return;
    // 目前的路徑
    const pts = bin.path.map(function (p, k) { return { x: nodeX(p.mid), y: nodeY(k), i: p.mid, d: k }; });
    let tail = null;
    if (bin.done && bin.lo > bin.hi && TL.ext) {
      const d = bin.path.length;
      tail = { x: extX(bin.lo - 1), y: nodeY(d) };
    }
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = alpha(C['bs-bin'], 0.35); c.lineWidth = 7;
    c.beginPath(); pts.forEach(function (p, k) { if (k) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); if (tail) c.lineTo(tail.x, tail.y); c.stroke();
    c.strokeStyle = C['bs-bin']; c.lineWidth = 2.6;
    c.beginPath(); pts.forEach(function (p, k) { if (k) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); if (tail) c.lineTo(tail.x, tail.y); c.stroke();
    c.restore();
    if (tail) {
      const s = Math.max(4.5, Math.min(8, TL.slot * 0.32));
      const col = bin.found >= 0 ? C['bs-bin'] : C['bs-miss'];
      D.roundRect(c, tail.x - s, tail.y - s, 2 * s, 2 * s, 2);
      c.fillStyle = col; c.fill();
      c.strokeStyle = C['canvas-bg']; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(tail.x - s * 0.5, tail.y - s * 0.5); c.lineTo(tail.x + s * 0.5, tail.y + s * 0.5);
      c.moveTo(tail.x + s * 0.5, tail.y - s * 0.5); c.lineTo(tail.x - s * 0.5, tail.y + s * 0.5); c.stroke();
    }
    pts.forEach(function (p, k) {
      const last = k === pts.length - 1;
      const found = bin.found === p.i && (bin.done || state.first);
      const col = found ? C['bs-hit'] : C['bs-bin'];
      const r = Math.max(5, nodeR(p.d) + (last ? 1.5 : 0.5));
      if (last && !bin.done && !reducedMotion) D.ripple(c, p.x, p.y, r, Math.min(1, state.stepAge / 0.45), col);
      D.ball(c, p.x, p.y, r, col, { glow: last || found ? 0.45 : 0.2 });
      if (r >= 6.5) {
        const s = numTxt(a[p.i]);
        fitFont(c, s, r * 1.75, 11.5, 7, 700);
        c.fillStyle = D.dark ? '#0b1215' : '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(s, p.x, p.y + 0.5);
      } else if (last || found) {
        tag(c, numTxt(a[p.i]), p.x + r + 4, p.y - L.pillH / 2, col, 'left', { size: 11, clamp: [4, S.tw - 4] });
      }
    });
  }

  // =====================================================================
  // 平均比較次數對 n 的圖
  // =====================================================================
  let binAvgArr = null;
  function binAvgTable() {
    if (binAvgArr) return binAvgArr;
    const I = new Float64Array(1025);
    for (let s = 2; s <= 1024; s++) { const l = Math.floor((s - 1) / 2), r = s - 1 - l; I[s] = s - 1 + I[l] + I[r]; }
    binAvgArr = new Float64Array(1025);
    for (let s = 1; s <= 1024; s++) binAvgArr[s] = 1 + I[s] / s;
    return binAvgArr;
  }
  /** 好讀的刻度間隔：1、2、5 乘 10 的幾次方 */
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  function drawChart() {
    const c = hctx, W = S.hw, H = S.hh;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, W, H);
    const log = $('logScale').checked;
    let nMax = Math.max(state.n, 16);
    state.points.forEach(function (p) { nMax = Math.max(nMax, p.n); });
    let xMax = 32;
    while (xMax < nMax && xMax < 1024) xMax *= 2;
    const lin = function (n) { return (n + 1) / 2; };
    let top = lin(xMax);
    state.points.forEach(function (p) { if (p.n <= xMax && isFinite(p.lin)) top = Math.max(top, p.lin); });
    const yStep = log ? 0 : niceStep(top / 4);
    const yMax = log ? 1024 : Math.max(8, Math.ceil(top * 1.02 / yStep) * yStep);
    const th = textH(c, 11, 600);
    const padL = 40, padR = 14, padT = Math.round(th * 2 + 14), padB = Math.round(th + 16);
    const iw = W - padL - padR, ih = H - padT - padB;
    const X = function (n) { return log ? padL + (Math.log2(n) - 2) / (Math.log2(xMax) - 2) * iw : padL + n / xMax * iw; };
    const Y = function (v) { return log ? padT + ih - Math.log2(Math.max(1, v)) / Math.log2(yMax) * ih : padT + ih - v / yMax * ih; };
    // 格線與刻度
    c.font = fnt(11, 500); c.fillStyle = C.muted; c.strokeStyle = alpha(C.text, D.dark ? 0.09 : 0.08); c.lineWidth = 1;
    const xt = [];
    if (log) { for (let v = 4; v <= xMax; v *= 2) xt.push(v); }
    else { const st = xMax / (W < 600 ? 4 : 8); for (let v = 0; v <= xMax + 0.1; v += st) xt.push(v); }
    xt.forEach(function (v, k) {
      const x = Math.round(X(v)) + 0.5;
      c.beginPath(); c.moveTo(x, padT); c.lineTo(x, padT + ih); c.stroke();
      if (log && W < 600 && k % 2 && v !== xMax) return;
      c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(String(v), x, padT + ih + 4);
    });
    const yt = [];
    if (log) { for (let v = 1; v <= yMax; v *= 4) yt.push(v); }
    else { for (let v = 0; v <= yMax + 1e-9; v += yStep) yt.push(v); }
    yt.forEach(function (v) {
      const y = Math.round(Y(v)) + 0.5;
      c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + iw, y); c.stroke();
      c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(B.trim(v, 1), padL - 5, y);
    });
    c.strokeStyle = alpha(C.text, 0.35);
    c.beginPath(); c.moveTo(padL + 0.5, padT); c.lineTo(padL + 0.5, padT + ih + 0.5); c.lineTo(padL + iw, padT + ih + 0.5); c.stroke();
    c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = C.muted; c.font = fnt(11, 600);
    c.fillText(T('比較次數', 'comparisons'), 6, 6);
    c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText('n', W - 4, H - 3);
    // 目前的 n
    const xn = X(state.n);
    c.save(); c.setLineDash([3, 3]); c.strokeStyle = alpha(C['bs-target'], 0.55);
    c.beginPath(); c.moveTo(xn, padT); c.lineTo(xn, padT + ih); c.stroke(); c.restore();
    // 理論曲線
    const tab = binAvgTable();
    c.save();
    c.beginPath(); c.rect(padL, padT - 2, iw + 2, ih + 4); c.clip();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = C['bs-lin']; c.lineWidth = 2.2;
    c.beginPath();
    for (let n = 4; n <= xMax; n += (log ? 1 : Math.max(1, Math.floor(xMax / 256)))) { const x = X(n), y = Y(lin(n)); if (n === 4) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
    c.strokeStyle = C['bs-bin']; c.lineWidth = 2.2;
    c.beginPath();
    for (let n = 4; n <= xMax; n++) { const x = X(n), y = Y(tab[Math.min(1024, n)]); if (n === 4) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
    c.setLineDash([5, 4]); c.lineWidth = 1.5; c.strokeStyle = alpha(C['bs-bin'], 0.75);
    c.beginPath();
    let prev = null;
    for (let n = 4; n <= xMax; n++) {
      const w = B.worst(n), x = X(n), y = Y(w);
      if (prev == null) c.moveTo(x, y); else if (w !== prev) { c.lineTo(x, Y(prev)); c.lineTo(x, y); }
      prev = w;
    }
    c.lineTo(X(xMax), Y(prev));
    c.stroke();
    c.setLineDash([]);
    // 實驗點：單次搜尋（小空心點）、每個目標都找一次的平均（大實心點）
    state.points.forEach(function (p) {
      [['lin', C['bs-lin']], ['bin', C['bs-bin']]].forEach(function (q) {
        const v = p[q[0]];
        if (!isFinite(v)) return;
        const x = X(p.n), y = Y(v);
        c.beginPath(); c.arc(x, y, p.avg ? 4.6 : 2.6, 0, Math.PI * 2);
        if (p.avg) { c.fillStyle = q[1]; c.fill(); c.strokeStyle = C['canvas-bg']; c.lineWidth = 1.5; c.stroke(); }
        else { c.strokeStyle = alpha(q[1], 0.85); c.lineWidth = 1.3; c.stroke(); }
      });
    });
    c.restore();
    // 圖例
    const items = [[C['bs-lin'], false, T('線性 (n+1)/2', 'linear (n+1)/2')], [C['bs-bin'], false, T('二分平均', 'binary avg')], [C['bs-bin'], true, T('二分最壞', 'binary worst')]];
    let lx = padL + 4;
    const ly = Math.round(th + 12);
    c.font = fnt(11, 600);
    items.forEach(function (it) {
      const w = c.measureText(it[2]).width;
      if (lx + 24 + w > W - 6) return;
      c.strokeStyle = it[0]; c.lineWidth = it[1] ? 1.5 : 2.2; c.setLineDash(it[1] ? [4, 3] : []);
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 16, ly); c.stroke(); c.setLineDash([]);
      c.fillStyle = C.text; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(it[2], lx + 20, ly);
      lx += 30 + w;
    });
    chartDirty = false;
  }

  // =====================================================================
  // 猜數字的數線
  // =====================================================================
  function drawGame() {
    const c = gctx, W = S.gw, H = S.gh, g = state.game;
    if (!g) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, W, H);
    const th = textH(c, 12, 600);
    const padL = 16, padR = 16, iw = W - padL - padR, N = g.N;
    const y0 = Math.round(th + 16), bh = 12;
    const X = function (v) { return padL + (v - 1) / Math.max(1, N - 1) * iw; };
    const cell = iw / Math.max(1, N - 1);
    const left = g.done ? 0 : g.hi - g.lo + 1;
    c.font = fnt(12, 600); c.textBaseline = 'top';
    c.textAlign = 'left'; c.fillStyle = g.done ? C['bs-hit'] : C['bs-bin'];
    c.fillText(g.done ? T('答案：', 'Answer: ') + g.secret : T('還可能：', 'Possible: ') + g.lo + '–' + g.hi + T('（' + left + ' 個）', ' (' + left + ')'), padL - 6, 5);
    c.textAlign = 'right'; c.fillStyle = C.muted;
    c.fillText(T('猜了 ' + g.guesses + ' 次・保證 ' + B.guessOptimal(N) + ' 次', g.guesses + ' guesses · ' + B.guessOptimal(N) + ' guaranteed'), W - padR + 6, 5);
    // 軌道
    D.roundRect(c, padL - 6, y0, iw + 12, bh, bh / 2);
    c.fillStyle = alpha(C.muted, D.dark ? 0.22 : 0.14); c.fill();
    c.strokeStyle = alpha(C.muted, 0.35); c.lineWidth = 1; c.stroke();
    // 還可能的範圍
    const lo = g.done ? g.secret : g.lo, hi = g.done ? g.secret : g.hi;
    const x0 = X(lo) - Math.max(2, cell / 2), x1 = X(hi) + Math.max(2, cell / 2);
    const col = g.done ? C['bs-hit'] : C['bs-bin'];
    const gr = c.createLinearGradient(0, y0, 0, y0 + bh);
    gr.addColorStop(0, shade(col, 0.3)); gr.addColorStop(1, shade(col, -0.15));
    D.roundRect(c, Math.max(padL - 6, x0), y0, Math.max(4, Math.min(padL + iw + 6, x1) - Math.max(padL - 6, x0)), bh, bh / 2);
    c.save(); c.shadowColor = alpha(col, 0.5); c.shadowBlur = 8; c.fillStyle = gr; c.fill(); c.restore();
    // 猜過的數
    g.history.forEach(function (h, k) {
      const x = X(Math.max(1, Math.min(N, h.x))), lastOne = k === g.history.length - 1;
      const cc = h.result === 'hit' ? C['bs-hit'] : h.result === 'low' ? C['bs-bin'] : C['bs-lin'];
      const s = lastOne ? 6 : 4.5;
      c.beginPath(); c.moveTo(x, y0 - 2); c.lineTo(x - s, y0 - 2 - s * 1.4); c.lineTo(x + s, y0 - 2 - s * 1.4); c.closePath();
      c.fillStyle = lastOne ? cc : alpha(cc, 0.6); c.fill();
    });
    // 兩端與範圍的數字
    c.font = fnt(11, 600); c.textBaseline = 'top';
    const yb = y0 + bh + 5;
    const labels = [[1, 'left', C.muted], [N, 'right', C.muted]];
    if (!g.done) { if (g.lo > 1) labels.push([g.lo, 'center', C['bs-bin']]); if (g.hi < N) labels.push([g.hi, 'center', C['bs-bin']]); }
    else labels.push([g.secret, 'center', C['bs-hit']]);
    const used = [];
    labels.forEach(function (q) {
      const s = String(q[0]), w = c.measureText(s).width;
      let x = q[1] === 'left' ? padL - 6 : q[1] === 'right' ? W - padR + 6 : X(q[0]);
      const bx = q[1] === 'left' ? x : q[1] === 'right' ? x - w : x - w / 2;
      if (used.some(function (u) { return bx < u[1] + 4 && bx + w > u[0] - 4; })) return;
      used.push([bx, bx + w]);
      c.textAlign = q[1]; c.fillStyle = q[2];
      c.fillText(s, x, yb);
    });
    gameDirty = false;
  }

  // =====================================================================
  // 動畫迴圈
  // =====================================================================
  let raf = 0, lastT = 0;
  function frame(now) {
    raf = 0;
    now = now || performance.now();
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    let moving = false;
    if (state.playing && state.run) {
      state.acc += dt * state.speed;
      let guard = 0;
      while (state.acc >= 1 && state.playing && guard++ < 60) { state.acc -= 1; doStep('play'); }
      moving = true;
    }
    state.stepAge += dt;
    if (state.stepAge < 0.5) moving = true;
    for (let i = state.fx.length - 1; i >= 0; i--) { state.fx[i].t += dt; if (state.fx[i].t > 0.5) state.fx.splice(i, 1); }
    if (state.fx.length) moving = true;
    // 範圍的緩動（介面過場）
    const tgt = bandTarget();
    ['lo', 'hi'].forEach(function (k) {
      const v = state.band[k], w = tgt[k];
      if (reducedMotion || Math.abs(w - v) < 0.01) state.band[k] = w;
      else { state.band[k] = v + (w - v) * Math.min(1, dt * 12); moving = true; }
    });
    if (dirty) { updateReadouts(); dirty = false; }
    drawMain();
    drawTree();
    if (chartDirty) drawChart();
    if (gameDirty) drawGame();
    if (moving) requestDraw(); else lastT = 0;
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function bandTarget() {
    const bin = state.run ? state.run.bin : null;
    if (!bin) return { lo: 0, hi: state.n - 1 };
    if (bin.done) return bin.found >= 0 && !state.first ? { lo: bin.found, hi: bin.found } : { lo: bin.lo, hi: bin.hi };
    return { lo: bin.lo, hi: bin.hi };
  }

  // =====================================================================
  // 搜尋的執行
  // =====================================================================
  function newRun() {
    state.run = B.stepper(state.data.a, state.target, state.first);
    state.run.via = '';
    state.acc = 0;
  }
  function finished() { return state.run && state.run.lin.done && state.run.bin.done; }
  /** 一步：兩種搜尋各比一次 */
  function doStep(via) {
    const run = state.run;
    if (!run || finished()) return;
    const linBefore = run.lin.done, binBefore = run.bin.done;
    const done = B.step(run);
    run.via = via;
    state.stepAge = 0;
    stepSound(run, linBefore, binBefore);
    if (!linBefore && run.lin.done && run.lin.found >= 0 && !reducedMotion) state.fx.push({ lane: 0, i: run.lin.found, t: 0 });
    if (!binBefore && run.bin.done && run.bin.found >= 0 && !reducedMotion) state.fx.push({ lane: 1, i: run.bin.found, t: 0 });
    describeStep(run, linBefore, binBefore);
    dirty = true;
    if (done) finish();
  }
  function finish() {
    const run = state.run;
    state.playing = false;
    updatePlayLabel();
    const ev = B.searchEvent(state.data, state.target, state.first);
    ev.via = run.via;
    state.points.push({ n: state.n, lin: ev.linCmp, bin: ev.binCmp, avg: false });
    if (state.points.length > 400) state.points.splice(0, state.points.length - 400);
    chartDirty = true;
    let msg = T('結束：線性搜尋比了 ', 'Done: linear search made ') + ev.linCmp + T(' 次、二分搜尋比了 ', ' comparisons, binary search ') + ev.binCmp + T(' 次。', '.');
    if (state.kind === 'unsorted' && ev.inArray && ev.binFound < 0) msg += T('二分搜尋漏掉了：目標其實在 ', ' Binary search missed it: the target is at ') + idx(ev.firstIdx) + T('，因為資料沒有排序。', ', because the cards are not sorted.');
    say(msg, true);
    emit('search', ev);
    dirty = true;
    requestDraw();
  }
  function describeStep(run, linBefore, binBefore) {
    const a = state.data.a, t = numTxt(state.target);
    const parts = [];
    const lin = run.lin, bin = run.bin;
    if (!linBefore) {
      const i = lin.last;
      parts.push(T('線性：', 'Linear: ') + idx(i) + ' = ' + numTxt(a[i]) + (lin.found === i ? T('，找到了！', ' — found!') : T('，不是 ', ', not ') + t + (lin.done ? T('；全部看完，找不到。', '; all checked, not found.') : T('。', '.'))));
    }
    if (!binBefore && bin.last) {
      const p = bin.last, v = numTxt(a[p.mid]);
      let s = T('二分：', 'Binary: ') + 'mid = ⌊(' + p.lo + ' + ' + p.hi + ')/2⌋ = ' + p.mid + T('，', ', ') + idx(p.mid) + ' = ' + v;
      if (p.rel === 0) s += state.first ? T('，相等；記下來，再往左找有沒有更前面的。', ' — equal; remember it and keep looking to the left.') : T('，找到了！', ' — found!');
      else s += (p.rel < 0 ? ' < ' : ' > ') + t + (p.rel < 0 ? T('，往右找', ', look right') : T('，往左找', ', look left'));
      if (bin.done) s += bin.found >= 0 ? (state.first ? T('。範圍空了：第一個出現在 ', '. Range empty: the first occurrence is ') + idx(bin.found) + T('。', '.') : '') : T('。範圍空了：找不到。', '. Range empty: not found.');
      else if (p.rel !== 0 || state.first) s += T('，剩 ', '; left: ') + idx(bin.lo) + '–' + idx(bin.hi) + T('（' + (bin.hi - bin.lo + 1) + ' 張）。', ' (' + (bin.hi - bin.lo + 1) + ' cards).');
      parts.push(s);
    }
    say(parts.join(' '));
  }
  function play() {
    if (!state.run || finished()) newRun();
    state.playing = !state.playing;
    if (state.playing && state.acc < 0.999) state.acc = 0.999; // 按下去馬上走第一步
    updatePlayLabel();
    dirty = true;
    requestDraw();
  }
  function stepOnce() {
    if (!state.run || finished()) newRun();
    state.playing = false;
    doStep('step');
    updatePlayLabel();
    requestDraw();
  }
  function skip() {
    if (!state.run || finished()) newRun();
    state.playing = false;
    const run = state.run;
    const linBefore = run.lin.done, binBefore = run.bin.done;
    B.runAll(run);
    run.via = 'skip';
    state.stepAge = 0;
    if (!linBefore && run.lin.found >= 0 && !reducedMotion) state.fx.push({ lane: 0, i: run.lin.found, t: 0 });
    if (!binBefore && run.bin.found >= 0 && !reducedMotion) state.fx.push({ lane: 1, i: run.bin.found, t: 0 });
    doneSound(run);
    finish();
  }
  function resetRun(msg) {
    state.run = null;
    state.playing = false;
    state.acc = 0;
    updatePlayLabel();
    dirty = true;
    if (msg) say(msg);
    requestDraw();
  }
  function updatePlayLabel() {
    const b = $('play');
    const mid = state.run && !finished() && state.run.steps > 0;
    b.textContent = state.playing ? T('暫停', 'Pause') : mid ? T('繼續', 'Continue') : T('開始搜尋', 'Start search');
    b.setAttribute('aria-pressed', String(state.playing));
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  const eqKeys = {};
  function setEq(id, tex) {
    if (eqKeys[id] === tex) return;
    eqKeys[id] = tex;
    const el = $(id);
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function midTex(lo, hi, mid) {
    return '\\begin{aligned} mid &= \\left\\lfloor \\frac{lo + hi}{2} \\right\\rfloor \\\\ &= \\left\\lfloor \\frac{' + lo + ' + ' + hi + '}{2} \\right\\rfloor = ' + mid + ' \\end{aligned}';
  }
  function small(s) { return ' <small>' + s + '</small>'; }
  function times(k) { return T(k + ' 次', String(k)); }
  function updateReadouts() {
    const n = state.n, run = state.run, a = state.data.a;
    const lin = run ? run.lin : null, bin = run ? run.bin : null;
    setHTML('rLin', times(lin ? lin.cmp : 0) + small(T('（最多 ' + n + ' 次）', '(at most ' + n + ')')));
    setHTML('rBin', times(bin ? bin.cmp : 0) + small(T('（最多 ' + B.worst(n) + ' 次）', '(at most ' + B.worst(n) + ')')));
    if (!bin) setHTML('rRange', idx(0) + '–' + idx(n - 1) + small(T('（' + n + ' 張）', '(' + n + ')')));
    else if (bin.done && bin.found >= 0 && !state.first) setHTML('rRange', '—');
    else if (bin.lo > bin.hi) setHTML('rRange', T('空的', 'empty') + small('(lo > hi)'));
    else setHTML('rRange', idx(bin.lo) + '–' + idx(bin.hi) + small(T('（' + (bin.hi - bin.lo + 1) + ' 張）', '(' + (bin.hi - bin.lo + 1) + ')')));
    const res = function (o) {
      if (!o || (!o.done && o.cmp === 0)) return '—';
      if (!o.done) return T('搜尋中…', 'searching…');
      return o.found >= 0 ? idx(o.found) + ' = ' + numTxt(a[o.found]) : T('找不到', 'not found');
    };
    setHTML('rLinRes', res(lin));
    let br = res(bin);
    if (bin && bin.done && bin.found < 0 && state.occ.count > 0) br += small(T('（其實在 ' + idx(state.occ.first) + '）', '(it is at ' + idx(state.occ.first) + ')'));
    setHTML('rBinRes', br);
    $('rPlainT').hidden = !state.first; $('rPlain').hidden = !state.first;
    if (state.first) {
      const pl = B.binarySearch(a, state.target, false);
      setHTML('rPlain', pl.found >= 0 ? idx(pl.found) + small(T('（比 ' + pl.cmp + ' 次）', '(' + pl.cmp + ' comparisons)')) : T('找不到', 'not found'));
    }
    // mid 的算法
    if (bin && bin.last) {
      const p = bin.last;
      setEq('rEqMid', midTex(p.lo, p.hi, p.mid));
    } else {
      setEq('rEqMid', midTex(0, n - 1, Math.floor((n - 1) / 2)));
    }
    setEq('rEqWorst', '\\begin{aligned} C_{\\max} &= \\lfloor \\log_2 n \\rfloor + 1 \\\\ &= \\lfloor \\log_2 ' + n + ' \\rfloor + 1 = ' + (B.worst(n) - 1) + ' + 1 = ' + B.worst(n) + ' \\end{aligned}');
    // 每個目標都找一次
    const sw = state.sweep;
    if (!sw) ['sLin', 'sBin', 'sRatio', 'sMax', 'sFail', 'sFound'].forEach(function (id) { setHTML(id, '—'); });
    else {
      const theory = sw.kind === 'sorted';
      setHTML('sLin', T(fix(sw.linAvg, 2) + ' 次', fix(sw.linAvg, 2)) + (theory ? small(T('（理論 ', '(theory ') + fix(B.avgLinearSuccess(sw.n), 2) + T('）', ')')) : ''));
      setHTML('sBin', T(fix(sw.binAvg, 2) + ' 次', fix(sw.binAvg, 2)) + (theory ? small(T('（理論 ', '(theory ') + fix(B.avgBinarySuccess(sw.n), 2) + T('）', ')')) : ''));
      setHTML('sRatio', fix(sw.ratio, 2) + T(' 倍', '×'));
      setHTML('sMax', times(sw.binMax) + small(T('（樹高 ' + sw.worst + '）', '(tree height ' + sw.worst + ')')));
      setHTML('sFail', sw.failMin == null ? '—' : sw.failMin === sw.failMax ? T('都是 ' + sw.failMin + ' 次', 'always ' + sw.failMin) : T(sw.failMin + ' 或 ' + sw.failMax + ' 次', sw.failMin + ' or ' + sw.failMax));
      setHTML('sFound', sw.binFound + ' ／ ' + sw.keys + small(T('個', 'numbers')));
    }
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
  function budget() { const t = performance.now() / 1000; if (t - tickT > 0.045) { tickT = t; return true; } return false; }
  function stepSound(run, linBefore, binBefore) {
    const S2 = sound(); if (!S2) return;
    const fast = state.playing && state.speed > 12;
    if (!fast || budget()) {
      if (!linBefore) S2.tone({ freq: 760, dur: 0.03, type: 'triangle', gain: 0.06 });
      if (!binBefore && run.bin.last && run.bin.last.rel !== 0) S2.tone({ freq: run.bin.last.rel < 0 ? 620 : 420, dur: 0.08, type: 'sine', gain: 0.13, delay: 0.02 });
    }
    if ((!linBefore && run.lin.done) || (!binBefore && run.bin.done)) doneSound(run, linBefore, binBefore);
  }
  function doneSound(run, linBefore, binBefore) {
    const S2 = sound(); if (!S2) return;
    const lb = linBefore == null ? false : linBefore, bb = binBefore == null ? false : binBefore;
    if (!bb && run.bin.done) {
      if (run.bin.found >= 0) { S2.tone({ freq: 659.25, dur: 0.14, gain: 0.24 }); S2.tone({ freq: 987.77, dur: 0.22, gain: 0.2, delay: 0.1 }); }
      else S2.sweep({ from: 520, to: 320, dur: 0.22, gain: 0.18 });
    }
    if (!lb && run.lin.done) {
      if (run.lin.found >= 0) { S2.tone({ freq: 523.25, dur: 0.12, gain: 0.2, delay: 0.05 }); S2.tone({ freq: 783.99, dur: 0.2, gain: 0.17, delay: 0.15 }); }
      else S2.sweep({ from: 480, to: 300, dur: 0.22, gain: 0.15, delay: 0.05 });
    }
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

  // =====================================================================
  // 資料與目標
  // =====================================================================
  function rebuild() {
    state.data = B.makeData(state.seed, state.n, state.kind);
    let lo = Infinity, hi = -Infinity;
    state.data.a.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; });
    state.vmin = lo; state.vmax = hi;
    state.occ = B.occurrences(state.data.a, state.target);
    state.sweep = null;
    state.band = { lo: 0, hi: state.n - 1 };
    treeDirty = true; chartDirty = true;
  }
  function setTarget(v, msg) {
    v = Math.max(-999, Math.min(9999, Math.round(v)));
    state.target = v;
    state.occ = B.occurrences(state.data.a, v);
    $('target').value = String(v);
    resetRun(msg || T('目標換成 ', 'Target set to ') + numTxt(v) + T('。按「開始搜尋」或「單步」。', '. Press “Start search” or “Step”.'));
  }
  const elN = $('nn'), elSpeed = $('speed'), elGN = $('gN');
  if (window.LabNum) window.LabNum.register(elN, { toValue: nFromPos, toPos: posFromN, min: B.MIN_N, max: B.MAX_N, decimals: 0 });
  function readN() { return Math.max(B.MIN_N, Math.min(B.MAX_N, Math.round(val(elN)))); }
  function refreshOutputs() {
    $('nno').textContent = String(readN());
    $('speedo').textContent = String(Math.round(val(elSpeed)));
    $('gNo').textContent = String(Math.round(val(elGN)));
  }
  elN.addEventListener('input', function () {
    refreshOutputs();
    const n = readN();
    if (n === state.n) return;
    state.n = n;
    rebuild();
    resetRun(T('卡片換成 ', 'Now ') + n + T(' 張，目標不變。', ' cards; the target is kept.'));
    resize();
  });
  elSpeed.addEventListener('input', function () { state.speed = Math.max(1, Math.round(val(elSpeed))); refreshOutputs(); });
  function setKind(k) {
    if (k === state.kind) return;
    state.kind = k;
    ['kSorted', 'kDups', 'kUnsorted'].forEach(function (id, j) { $(id).setAttribute('aria-pressed', String(B.KINDS[j] === k)); });
    rebuild();
    resetRun({
      sorted: T('排好的卡片（由小到大、不重複）。', 'Sorted cards (increasing, no repeats).'),
      dups: T('排好的卡片，但有些值重複。', 'Sorted cards with some repeated values.'),
      unsorted: T('同一批數字，打亂了順序：二分搜尋的前提不成立了。', 'The same numbers shuffled: binary search’s assumption no longer holds.')
    }[k]);
    dirty = true; requestDraw();
  }
  $('kSorted').addEventListener('click', function () { setKind('sorted'); });
  $('kDups').addEventListener('click', function () { setKind('dups'); });
  $('kUnsorted').addEventListener('click', function () { setKind('unsorted'); });
  $('firstMode').addEventListener('change', function () {
    state.first = $('firstMode').checked;
    state.sweep = null;
    resetRun(state.first ? T('二分搜尋改成「找第一個出現的位置」：相等時不停，繼續往左找。', 'Binary search now finds the first occurrence: on “equal” it keeps looking to the left.') : T('二分搜尋改回一般版：相等就停。', 'Back to the ordinary binary search: it stops on “equal”.'));
  });
  $('reseed').addEventListener('click', function () {
    state.seed = 1 + Math.floor(rand() * 2147483646);
    rebuild();
    resetRun(T('換了一組新的卡片，目標不變。', 'A new set of cards; the target is kept.'));
  });
  function applyTargetInput() {
    const el = $('target');
    const v = el.valueAsNumber;
    if (!isFinite(v) || Math.abs(v - Math.round(v)) > 1e-9) {
      el.value = String(state.target);
      say(T('目標要是整數。', 'The target must be a whole number.'));
      return;
    }
    if (Math.round(v) === state.target && state.run == null) return;
    setTarget(v);
  }
  $('target').addEventListener('change', applyTargetInput);
  $('target').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyTargetInput(); } });
  $('setTarget').addEventListener('click', applyTargetInput);
  $('rndIn').addEventListener('click', function () { setTarget(B.randomPresent(state.data.a, rand)); });
  $('rndOut').addEventListener('click', function () { setTarget(B.randomAbsent(state.data.a, rand)); });
  $('play').addEventListener('click', play);
  $('stepBtn').addEventListener('click', stepOnce);
  $('skip').addEventListener('click', skip);
  $('restart').addEventListener('click', function () { resetRun(T('回到第一步。', 'Back to the first step.')); });
  $('clear').addEventListener('click', function () {
    state.points = [];
    state.sweep = null;
    state.games = []; state.gameNo = 0;
    renderLog();
    resetRun(T('已全部清除：圖上的點、平均與猜數字的紀錄都清掉了，設定不變。', 'Cleared: the chart points, the averages and the guessing log are gone; the settings are kept.'));
    chartDirty = true;
    newGame(true);
  });
  $('logScale').addEventListener('change', function () { chartDirty = true; requestDraw(); });

  // ---------- 每個目標都找一次 ----------
  $('sweep').addEventListener('click', function () {
    const ev = B.sweepEvent(state.data, state.first);
    state.sweep = ev;
    state.points.push({ n: state.n, lin: ev.linAvg, bin: ev.binAvg, avg: true });
    chartDirty = true; dirty = true;
    const S2 = sound(); if (S2) S2.sweep({ from: 400, to: 900, dur: 0.25, gain: 0.16 });
    say(T('每個數都找了一次：線性搜尋平均 ', 'Searched for every number: linear search averages ') + fix(ev.linAvg, 2) + T(' 次、二分搜尋平均 ', ', binary search ') + fix(ev.binAvg, 2) + T(' 次。', ' comparisons.') +
      (state.kind === 'unsorted' ? T('二分搜尋只找到 ', ' Binary search found only ') + ev.binFound + T(' 個。', ' of them.') : ''));
    emit('sweep', ev);
    requestDraw();
  });

  // ---------- 點卡片、點樹 ----------
  function cardAt(x, y) {
    if (!L) return -1;
    for (let lane = 0; lane < 2; lane++) {
      const ln = L.lanes[lane];
      if (y < ln.y || y > ln.y + ln.h) continue;
      if (L.mode === 'bars') { const i = Math.floor((x - L.padL) / L.slot); return i >= 0 && i < state.n ? i : -1; }
      for (let i = 0; i < state.n; i++) {
        const rc = cardRect(i, lane);
        if (x >= rc.x - L.gap / 2 && x <= rc.x + rc.w + L.gap / 2 && y >= rc.y - 8 && y <= rc.y + rc.h + 8) return i;
      }
    }
    return -1;
  }
  cv.addEventListener('pointerdown', function (ev) {
    const r = cv.getBoundingClientRect();
    const i = cardAt(ev.clientX - r.left, ev.clientY - r.top);
    if (i < 0) return;
    setTarget(state.data.a[i], T('目標換成 ', 'Target set to ') + numTxt(state.data.a[i]) + T('（' + idx(i) + ' 的數）。', ' (the number on ' + idx(i) + ').'));
  });
  tv.addEventListener('pointerdown', function (ev) {
    if (!TL) return;
    const r = tv.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    const d = Math.round((y - TL.top) / TL.gap);
    if (d < 0 || d >= TL.h || Math.abs(y - nodeY(d)) > TL.gap * 0.5) return;
    let best = -1, bd = Infinity;
    TL.levels[d].forEach(function (i) { const dd = Math.abs(nodeX(i) - x); if (dd < bd) { bd = dd; best = i; } });
    if (best < 0 || bd > Math.max(14, levelSpacing(d) / 2)) return;
    setTarget(state.data.a[best], T('目標換成 ', 'Target set to ') + numTxt(state.data.a[best]) + T('：決策樹第 ' + (d + 1) + ' 層的節點，找它要比 ' + (d + 1) + ' 次。', ': a node on level ' + (d + 1) + ' of the tree, so finding it takes ' + (d + 1) + ' comparisons.'));
  });
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('搜尋畫布。左右方向鍵把目標換成隔壁卡片的數，上下方向鍵把目標加減 1。', 'Search canvas. Left and right arrow keys set the target to the number on the neighbouring card; up and down change the target by 1.'),
      items: [{
        name: function () { return T('目標', 'Target'); },
        move: function (dx, dy) {
          const a = state.data.a;
          if (dy) { setTarget(state.target + dy); return true; }
          if (!dx) return false;
          let i = state.occ.count ? state.occ.first : -1;
          if (i < 0) {
            if (state.kind === 'unsorted') i = dx > 0 ? -1 : a.length;
            else { let lo = 0; while (lo < a.length && a[lo] < state.target) lo++; i = dx > 0 ? lo - 1 : lo; }
          }
          const j = Math.max(0, Math.min(a.length - 1, i + dx));
          setTarget(a[j]);
          return true;
        },
        describe: function () {
          return T('目標 ', 'Target ') + numTxt(state.target) + (state.occ.count ? T('，在 ', ', on ') + idx(state.occ.first) : T('，不在卡片裡', ', not on any card'));
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 猜數字
  // =====================================================================
  function newGame(quiet) {
    const N = Math.max(10, Math.min(1000, Math.round(val(elGN))));
    state.game = B.newGame(N, $('cheat').checked, rand);
    $('gIn').max = String(N);
    $('gIn').value = '';
    if (!quiet) setMsg(state.game.adversary ? T('新的一局：1 到 ' + N + '。這台電腦會耍賴喔！', 'New game: 1 to ' + N + '. This computer cheats!') : T('新的一局：電腦想好了一個 1 到 ' + N + ' 的數。', 'New game: the computer has picked a number from 1 to ' + N + '.'), '');
    else setMsg('', '');
    gameDirty = true; requestDraw();
  }
  function setMsg(s, cls) { const el = $('gMsg'); el.textContent = s; el.className = 'msg' + (cls ? ' ' + cls : ''); }
  function doGuess() {
    const g = state.game, el = $('gIn');
    if (!g) return;
    if (g.done) { setMsg(T('這一局結束了，按「開始新的一局」再玩。', 'This game is over; press “New game” to play again.'), ''); return; }
    const x = el.valueAsNumber;
    if (!isFinite(x) || Math.abs(x - Math.round(x)) > 1e-9 || x < 1 || x > g.N) {
      setMsg(T('請猜 1 到 ' + g.N + ' 的整數。', 'Guess a whole number from 1 to ' + g.N + '.'), '');
      return;
    }
    const rec = B.guess(g, x, rand);
    const S2 = sound();
    const wasted = rec.wasted ? T('（這個數早就不可能了）', ' (that number was already ruled out)') : '';
    if (rec.result === 'hit') {
      const opt = B.guessOptimal(g.N);
      setMsg((g.adversary ? T('只剩這個數了：', 'Only this one is left: ') : T('猜中了！', 'Correct! ')) + rec.x + T('，用了 ' + g.guesses + ' 次（保證要 ' + opt + ' 次）。', ' in ' + g.guesses + ' guesses (' + opt + ' guaranteed).'), 'ok');
      if (S2) { S2.tone({ freq: 659.25, dur: 0.14, gain: 0.26 }); S2.tone({ freq: 987.77, dur: 0.24, gain: 0.22, delay: 0.11 }); }
      state.gameNo++;
      state.games.unshift({ no: state.gameNo, N: g.N, adversary: g.adversary, guesses: g.guesses, opt: opt });
      if (state.games.length > 30) state.games.length = 30;
      renderLog();
      emit('game', B.gameEvent(g));
    } else {
      setMsg((rec.result === 'low' ? T('太小了！', 'Too small!') : T('太大了！', 'Too big!')) + wasted + T('還可能：' + g.lo + '–' + g.hi + '。', ' Still possible: ' + g.lo + '–' + g.hi + '.'), rec.result === 'low' ? 'lo' : 'hi');
      if (S2) S2.sweep(rec.result === 'low' ? { from: 380, to: 600, dur: 0.16, gain: 0.16 } : { from: 600, to: 380, dur: 0.16, gain: 0.16 });
    }
    el.value = '';
    el.focus({ preventScroll: true });
    gameDirty = true; requestDraw();
  }
  function renderLog() {
    const tb = $('glog');
    if (!state.games.length) { tb.innerHTML = ''; $('glogEmpty').hidden = false; return; }
    $('glogEmpty').hidden = true;
    let h = '<thead><tr><th>' + T('局', '#') + '</th><th>N</th><th>' + T('電腦', 'Computer') + '</th><th>' + T('次數', 'Guesses') + '</th><th>' + T('保證', 'Guaranteed') + '</th></tr></thead><tbody>';
    state.games.forEach(function (r) {
      const good = r.guesses <= r.opt;
      h += '<tr><td>' + r.no + '</td><td>' + r.N + '</td><td>' + (r.adversary ? T('耍賴', 'cheats') : T('誠實', 'honest')) + '</td><td' + (good ? ' class="best"' : '') + '>' + r.guesses + '</td><td>' + r.opt + '</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }
  $('gGo').addEventListener('click', doGuess);
  $('gIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doGuess(); } });
  $('gNew').addEventListener('click', function () { newGame(false); });
  elGN.addEventListener('input', function () { refreshOutputs(); });
  elGN.addEventListener('change', function () { refreshOutputs(); if (state.game && Math.round(val(elGN)) !== state.game.N) newGame(false); });
  $('cheat').addEventListener('change', function () { newGame(false); });

  // 給測試用的介面（不影響畫面）
  window.__bs = {
    state: state,
    setTarget: function (v) { setTarget(v); },
    setSeed: function (s) { state.seed = s; rebuild(); resetRun(); },
    rng: function (s) { rand = B.rng(s); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  state.n = readN();
  state.speed = Math.max(1, Math.round(val(elSpeed)));
  rebuild();
  state.target = state.data.a[Math.round(0.65 * (state.n - 1))];
  state.occ = B.occurrences(state.data.a, state.target);
  $('target').value = String(state.target);
  refreshOutputs();
  updateSoundButton();
  updatePlayLabel();
  renderLog();
  newGame(true);
  say(T('目標是 ', 'The target is ') + numTxt(state.target) + T('。按「開始搜尋」看兩種方法同時找。', '. Press “Start search” to watch both methods look for it.'));
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    for (const id in eqKeys) delete eqKeys[id];
    renderLog();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0, lastG = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lastW || gv.clientWidth !== lastG) { lastW = cv.clientWidth; lastG = gv.clientWidth; resize(); }
    }).observe(document.getElementById('lab'));
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.playing) { state.playing = false; updatePlayLabel(); } });
  resize();
})();
