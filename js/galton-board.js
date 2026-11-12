/* galton-board.js — 「高爾頓板與二項分布」的畫面與互動（數學計算在 galton-board-core.js；
 * 共用繪圖工具 LabDraw 在 drawkit.js；3D 釘板在 galton-board-3d.js，切換到 3D 時才載入）
 *
 * 每顆球在每根釘子用亂數決定往左或往右（機率 p 往右），從不使用二項分布公式來放球；
 * 理論機率只用來畫對照的虛線、常態曲線與讀數。 */
(function () {
  'use strict';
  const G = window.GaltonCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const alpha = D.alpha, shade = D.shade;
  const MAX_ACTIVE = 260;     // 同時在空中的球最多幾顆（再多就直接落到格子裡）
  const HOP = 0.12;           // 球從一根釘子跳到下一根的時間（秒）
  const BOUNCE = 0.35;        // 碰到釘子後往上彈的程度（拋物線頂點高出起點 BOUNCE²/(1 + 2·BOUNCE) 層）

  // ---------- 狀態 ----------
  const state = {
    n: 10, p: 0.5,
    P: G.pmf(10, 0.5), counts: G.zeros(11), N: 0,
    balls: [], queue: 0, spawnRate: 0, spawnAcc: 0,
    playing: false, rate: 12,
    sel: null, lastPath: null, lastK: null,
    show: { theory: true, normal: false, stats: true, pascal: false, path: true },
    hidden: null, round: 0, log: [],
    tvHist: [],
    disp: G.zeros(11), yTop: 0.3, fx: []
  };
  let rand = G.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  /** 落球實際使用的 p（挑戰時是神祕的 p） */
  function pEff() { return state.hidden ? state.hidden.p : state.p; }

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface',
      'gb-ball', 'gb-peg', 'gb-theory', 'gb-normal', 'gb-mean', 'gb-sel', 'gb-wood']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字格式 ----------
  function num(v, dec) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function trimN(v, dec) { return G.trim(v, dec).replace('-', '−'); }
  /** 機率：小於 0.001 時用科學記號 */
  function probText(v) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    if (v < 0.001) { const e = Math.floor(Math.log10(v)); return num(v / Math.pow(10, e), 2) + ' × 10<sup>' + String(e).replace('-', '−') + '</sup>'; }
    return num(v, 4);
  }
  function intText(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let dpr = 1, cw = 300, ch = 400, L = null, cw2 = 300, ch2 = 170;
  const RAD = 9;
  function layout() {
    const n = state.n, narrow = cw < 600;
    const padX = narrow ? 8 : 16, axisW = narrow ? 34 : 44;
    const inner = cw - 2 * padX - axisW;
    const bw = Math.min(inner / (n + 1), narrow ? 40 : 54);
    const cx = padX + axisW + inner / 2;
    const rh = Math.max(9, Math.min(bw * 0.866, (narrow ? 200 : 250) / Math.max(n, 1)));
    const ballR = Math.max(2.2, Math.min(bw * 0.25, rh * 0.36, 8));
    const pegR = Math.max(1.6, Math.min(bw * 0.12, rh * 0.16, 5));
    const top = 10, hopH = narrow ? 30 : 40;
    const yp0 = top + hopH + Math.max(ballR * 2 + 6, rh * 0.6);
    const binsTop = yp0 + (n - 1) * rh + rh * 0.75 + pegR;
    const binsH = narrow ? Math.max(160, Math.min(cw * 0.52, 230)) : Math.max(170, Math.min(cw * 0.28, 250));
    const baseY = binsTop + binsH;
    return {
      narrow: narrow, padX: padX, axisW: axisW, bw: bw, cx: cx, rh: rh, ballR: ballR, pegR: pegR,
      top: top, hopH: hopH, yp0: yp0, binsTop: binsTop, binsH: binsH, baseY: baseY,
      H: Math.round(baseY + (narrow ? 50 : 54)),
      left: cx - (n + 1) / 2 * bw, right: cx + (n + 1) / 2 * bw
    };
  }
  function pegX(r, j) { return L.cx + (j - r / 2) * L.bw; }
  function pegY(r) { return L.yp0 + r * L.rh; }
  function binX(k) { return L.cx + (k - state.n / 2) * L.bw; }
  /** 球停在第 r 層第 j 根釘子頂上時的球心 */
  function restXY(r, j) { return { x: pegX(r, j), y: pegY(r) - L.pegR - L.ballR }; }
  /** 第 k 格目前長條的頂端（球落進去停的地方） */
  function barTopY(k) { return L.baseY - barH(state.disp[k] || 0) - L.ballR; }
  function barH(v) { return Math.max(0, v) / state.yTop * L.binsH * 0.94; }
  function resize() {
    const w = cv.clientWidth || (L ? cw : 0);   // 3D 檢視時 2D 畫布被隱藏，沿用上次的寬度（3D 也用這個版面換算球的位置）
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    ch2 = cw2 < 600 ? 150 : 170;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr);
    cv2.height = Math.round(ch2 * dpr);
    chartDirty = true;
    requestDraw();
  }

  // =====================================================================
  // 落球
  // =====================================================================
  /** 一段動作：from、to 是「邏輯位置」（畫的時候才換成像素，改版面也不會錯位） */
  function spawnBall() {
    const d = G.drop(rand, state.n, pEff());
    const b = { path: d.path, k: d.k, r: -1, j: 0, t: 0, seg: null };
    nextSeg(b);
    state.balls.push(b);
  }
  function nextSeg(b) {
    const n = state.n;
    if (b.r === -1) {               // 從漏斗口落到第一根釘子
      b.seg = { from: { hop: true }, to: { peg: [0, 0] }, dur: HOP * 1.6, beta: 0 };
      b.r = 0; b.j = 0;
      return;
    }
    const right = b.path[b.r];
    if (b.r < n - 1) {
      b.seg = { from: { peg: [b.r, b.j] }, to: { peg: [b.r + 1, b.j + right] }, dur: HOP, beta: BOUNCE };
      b.hitRow = b.r;
      b.r++; b.j += right;
    } else {                         // 最後一根釘子彈進格子，自由落體到長條頂端
      const fall = Math.max(1, (L.baseY - L.binsTop) / L.rh);
      b.seg = { from: { peg: [b.r, b.j] }, to: { bin: b.k }, dur: HOP * Math.sqrt(0.6 * fall + 1), beta: 0.18 };
      b.hitRow = b.r;
      b.r = n;
    }
    if (b.hitRow != null) pegTick(b.hitRow);
  }
  function posOf(q) {
    if (q.hop) return { x: L.cx, y: L.top + 4 };
    if (q.peg) return restXY(q.peg[0], q.peg[1]);
    return { x: binX(q.bin), y: barTopY(q.bin) };
  }
  function ballXY(b) {
    const s = Math.min(1, b.t / b.seg.dur);
    const A = posOf(b.seg.from), B = posOf(b.seg.to), be = b.seg.beta;
    return { x: A.x + (B.x - A.x) * s, y: A.y + (B.y - A.y) * ((1 + 2 * be) * s * s - 2 * be * s) };
  }
  function stepBalls(dt) {
    const speed = state.playing && state.rate > 30 ? 1.35 : 1;
    for (let i = state.balls.length - 1; i >= 0; i--) {
      const b = state.balls[i];
      b.t += dt * speed;
      while (b.t >= b.seg.dur) {
        b.t -= b.seg.dur;
        if (b.seg.to.bin != null) { land(b.k, b.path); state.balls.splice(i, 1); break; }
        nextSeg(b);
      }
    }
  }
  /** 一顆球落進第 k 格 */
  function land(k, path) {
    state.counts[k]++;
    state.N++;
    state.lastPath = path; state.lastK = k;
    recordTV();
    landSound(k);
    if (L && !reducedMotion) state.fx.push({ k: k, t: 0 });
    dirty = true;
    emitDrop('ball');
  }
  /** 一次很多顆（不動畫）：分段落下，讓差距圖每段都有一個點 */
  function dropBatch(count) {
    let left = count;
    const p = pEff();
    while (left > 0) {
      const chunk = Math.min(left, Math.max(1, Math.ceil(state.N * 0.06)));
      G.dropMany(rand, state.n, p, chunk, state.counts);
      state.N += chunk;
      left -= chunk;
      recordTV();
    }
    state.lastPath = null; state.lastK = null;
    if (sound()) { landSound(Math.round(state.n * p)); }
    dirty = true;
    emitDrop('batch');
    say(T('放了 ', 'Dropped ') + intText(count) + T(' 顆球，共 ', ' balls; ') + intText(state.N) + T(' 顆。', ' in total.'));
  }
  /** 排隊落下 count 顆，每秒 rate 顆（動畫） */
  function enqueue(count, rate) {
    if (reducedMotion) { for (let i = 0; i < count; i++) { const d = G.drop(rand, state.n, pEff()); land(d.k, d.path); } return; }
    state.queue += count;
    state.spawnRate = Math.max(state.spawnRate, rate);
    requestDraw();
  }
  function spawnStep(dt) {
    let rate = 0;
    if (state.queue > 0) rate = state.spawnRate;
    if (state.playing) rate = Math.max(rate, state.rate);
    if (!rate) { state.spawnAcc = 0; return; }
    state.spawnAcc += dt * rate;
    while (state.spawnAcc >= 1) {
      state.spawnAcc -= 1;
      if (state.queue > 0) state.queue--;
      else if (!state.playing) break;
      if (state.balls.length >= MAX_ACTIVE) { const d = G.drop(rand, state.n, pEff()); land(d.k, d.path); }
      else spawnBall();
    }
    if (state.queue <= 0 && !state.playing) { state.queue = 0; state.spawnRate = 0; }
  }
  /** 差距隨球數的紀錄（球數每多約 3% 記一點） */
  function recordTV() {
    if (!state.N) return;
    const h = state.tvHist;
    const last = h.length ? h[h.length - 1][0] : 0;
    if (state.N < 30 || state.N >= last * 1.03) {
      h.push([state.N, G.tv(state.counts, state.P)]);
      if (h.length > 700) state.tvHist = h.filter(function (v, i) { return i % 2 === 0 || i === h.length - 1; });
    }
  }
  /** 清掉所有球（設定不變） */
  function resetCounts() {
    state.counts = G.zeros(state.n + 1);
    state.disp = G.zeros(state.n + 1);
    state.N = 0;
    state.balls = []; state.queue = 0; state.spawnRate = 0; state.spawnAcc = 0;
    state.lastPath = null; state.lastK = null; state.tvHist = []; state.fx = [];
    dirty = true;
    requestDraw();
  }

  // =====================================================================
  // 繪圖：釘板與格子
  // =====================================================================
  function reachable(r, j, k) { return j <= k && k <= j + (state.n - r); }
  function drawBoard() {
    const n = state.n, bw = L.bw;
    D.backdrop(ctx, cw, ch);
    // 板子（木板＋玻璃反光）
    const bx0 = L.left - bw * 0.25, bx1 = L.right + bw * 0.25, by0 = L.top, by1 = L.baseY + 4;
    ctx.save();
    const wood = ctx.createLinearGradient(0, by0, 0, by1);
    wood.addColorStop(0, alpha(C['gb-wood'], D.dark ? 0.2 : 0.13));
    wood.addColorStop(1, alpha(C['gb-wood'], D.dark ? 0.1 : 0.06));
    ctx.fillStyle = wood;
    D.roundRect(ctx, bx0, by0, bx1 - bx0, by1 - by0, 10); ctx.fill();
    ctx.strokeStyle = alpha(C['gb-wood'], D.dark ? 0.45 : 0.35); ctx.lineWidth = 1.2; ctx.stroke();
    const gl = ctx.createLinearGradient(bx0, by0, bx1, by1);
    gl.addColorStop(0, alpha('#ffffff', D.dark ? 0.05 : 0.35));
    gl.addColorStop(0.35, alpha('#ffffff', 0));
    ctx.fillStyle = gl;
    D.roundRect(ctx, bx0, by0, bx1 - bx0, by1 - by0, 10); ctx.fill();
    ctx.restore();
    // 漏斗
    const fx = L.cx, fy = restXY(0, 0).y - L.ballR - 2, fw = Math.min(bw * 1.6, 60);
    ctx.save();
    ctx.strokeStyle = shade(C['gb-wood'], D.dark ? 0.1 : -0.15); ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx - fw, L.top + 2); ctx.lineTo(fx - L.ballR * 1.6, fy);
    ctx.moveTo(fx + fw, L.top + 2); ctx.lineTo(fx + L.ballR * 1.6, fy);
    ctx.stroke();
    ctx.restore();
    // 選取的格子：會經過的釘子與那一格
    const sel = state.sel;
    if (sel != null) {
      // 去第 sel 格的球可能碰到的釘子：每根畫一圈光暈，聯集一次填色（重疊處不會變深）
      ctx.save();
      ctx.fillStyle = alpha(C['gb-sel'], D.dark ? 0.16 : 0.11);
      ctx.beginPath();
      const hr = Math.min(bw * 0.62, L.rh * 0.95);
      for (let r = 0; r < n; r++) for (let j = 0; j <= r; j++) {
        if (!reachable(r, j, sel)) continue;
        const x = pegX(r, j), y = pegY(r);
        ctx.moveTo(x + hr, y); ctx.arc(x, y, hr, 0, Math.PI * 2);
      }
      ctx.fill('nonzero');
      ctx.fillStyle = alpha(C['gb-sel'], D.dark ? 0.2 : 0.12);
      ctx.fillRect(binX(sel) - bw / 2, L.binsTop, bw, L.binsH);
      ctx.restore();
    }
    // 釘子（與巴斯卡數字）
    const pascal = state.show.pascal;
    for (let r = 0; r < n; r++) {
      for (let j = 0; j <= r; j++) {
        const x = pegX(r, j), y = pegY(r);
        const on = sel != null && reachable(r, j, sel);
        D.ball(ctx, x, y, L.pegR, on ? C['gb-sel'] : C['gb-peg'], { shadow: true, glow: 0 });
        if (pascal) pascalLabel(G.choose(r, j), x, y - L.pegR - 2, on);
      }
    }
    // 最新一顆球的路徑
    if (state.show.path && state.lastPath && state.lastPath.length === n) {
      ctx.save();
      ctx.strokeStyle = alpha(C['gb-ball'], 0.6); ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
      ctx.beginPath();
      let j = 0;
      const p0 = restXY(0, 0);
      ctx.moveTo(p0.x, p0.y);
      for (let r = 0; r < n; r++) { j += state.lastPath[r]; if (r < n - 1) { const q = restXY(r + 1, j); ctx.lineTo(q.x, q.y); } }
      ctx.lineTo(binX(state.lastK), L.binsTop + 6);
      ctx.stroke();
      ctx.restore();
    }
    drawBins();
    // 空中的球
    for (let i = 0; i < state.balls.length; i++) {
      const q = ballXY(state.balls[i]);
      D.ball(ctx, q.x, q.y, L.ballR, C['gb-ball'], { glow: D.dark ? 0.2 : 0 });
    }
    // 落地的漣漪
    for (let i = 0; i < state.fx.length; i++) {
      const f = state.fx[i];
      D.ripple(ctx, binX(f.k), barTopY(f.k) + L.ballR, L.ballR * 0.6, f.t / 0.35, C['gb-ball']);
    }
  }
  function pascalLabel(v, x, yb, on) {
    const s = String(v);
    let px = Math.min(11, L.bw * 0.38);
    ctx.font = fnt(px, 600);
    let w = ctx.measureText(s).width;
    if (w > L.bw * 0.92) { px = px * L.bw * 0.92 / w; ctx.font = fnt(px, 600); w = ctx.measureText(s).width; }
    if (px < 6.5 || L.rh < px + 2 * L.pegR + 3) return;
    D.haloText(ctx, s, x, yb, on ? C['gb-sel'] : C.muted, 'center', 'bottom', fnt(px, 600));
  }
  function niceStep(top) {
    const steps = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5];
    for (let i = 0; i < steps.length; i++) if (top / steps[i] <= 5) return steps[i];
    return 0.5;
  }
  function drawBins() {
    const n = state.n, bw = L.bw, x0 = L.left, x1 = L.right, top = L.binsTop, base = L.baseY;
    const hidden = !!state.hidden;
    // 縱軸刻度（機率）
    const step = niceStep(state.yTop);
    ctx.save();
    ctx.font = fnt(L.narrow ? 10.5 : 11.5, 500);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = 0; v <= state.yTop * 0.94 + 1e-9; v += step) {
      const y = base - barH(v);
      ctx.strokeStyle = alpha(C.text, v === 0 ? 0.35 : 0.08); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillText(G.trim(v, 3), x0 - 5, y);
    }
    ctx.restore();
    // 長條（實驗的相對次數）
    for (let k = 0; k <= n; k++) {
      const h = barH(state.disp[k]);
      if (h < 0.3) continue;
      const bx = binX(k) - bw / 2 + Math.max(1.5, bw * 0.08), bwid = bw - 2 * Math.max(1.5, bw * 0.08);
      const g = ctx.createLinearGradient(bx, 0, bx + bwid, 0);
      g.addColorStop(0, shade(C['gb-ball'], 0.25));
      g.addColorStop(0.45, C['gb-ball']);
      g.addColorStop(1, shade(C['gb-ball'], -0.22));
      ctx.fillStyle = g;
      D.roundRect(ctx, bx, base - h, bwid, h, Math.min(4, bwid / 3, h / 2));
      ctx.fill();
    }
    // 隔板
    ctx.save();
    ctx.strokeStyle = alpha(shade(C['gb-wood'], D.dark ? 0.2 : -0.2), 0.75); ctx.lineWidth = Math.max(1.2, Math.min(2.4, bw * 0.06));
    ctx.beginPath();
    for (let k = 0; k <= n + 1; k++) { const x = x0 + k * bw; ctx.moveTo(x, top); ctx.lineTo(x, base); }
    ctx.stroke();
    ctx.strokeStyle = alpha(C.text, 0.55); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 - 4, base + 0.5); ctx.lineTo(x1 + 4, base + 0.5); ctx.stroke();
    ctx.restore();
    // 平均 ± 標準差（理論）
    const mu = G.mean(n, pEff()), sig = Math.sqrt(G.variance(n, pEff()));
    if (state.show.stats && !hidden) {
      const xm = L.cx + (mu - n / 2) * bw;
      ctx.save();
      if (sig > 0) {
        ctx.fillStyle = alpha(C['gb-mean'], D.dark ? 0.08 : 0.06);
        ctx.fillRect(xm - sig * bw, top, 2 * sig * bw, L.binsH);
      }
      ctx.strokeStyle = alpha(C['gb-mean'], 0.85); ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(xm, top); ctx.lineTo(xm, base); ctx.stroke();
      ctx.setLineDash([]);
      if (sig > 0) D.arrow(ctx, xm, top + 28, xm + sig * bw, top + 28, C['gb-mean'], 1.4);
      ctx.restore();
      D.pill(ctx, 'μ = np = ' + trimN(mu, 2), xm, top + 19, C['gb-mean'], 'center', fnt(L.narrow ? 10.5 : 11.5, 600));
      if (sig > 0 && sig * bw > 22) D.haloText(ctx, 'σ', xm + sig * bw / 2, top + 26, C['gb-mean'], 'center', 'bottom', fnt(12, 700, true));
    }
    // 理論機率（虛線）與常態曲線
    if (state.show.theory && !hidden) {
      ctx.save();
      ctx.strokeStyle = C['gb-theory']; ctx.lineWidth = 2.2; ctx.setLineDash([5, 3]);
      for (let k = 0; k <= n; k++) {
        const y = base - barH(state.P[k]);
        ctx.beginPath(); ctx.moveTo(binX(k) - bw * 0.46, y); ctx.lineTo(binX(k) + bw * 0.46, y); ctx.stroke();
      }
      ctx.restore();
    }
    if (state.show.normal && !hidden && sig > 0) {
      ctx.save();
      ctx.strokeStyle = C['gb-normal']; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      ctx.beginPath();
      const steps = Math.max(80, (n + 1) * 16);
      for (let i = 0; i <= steps; i++) {
        const xv = -0.5 + (n + 1) * i / steps;
        const y = base - barH(G.normPdf(xv, mu, sig));
        const x = L.cx + (xv - n / 2) * bw;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    // 格子編號、路徑數、實驗平均
    const fz = L.narrow ? 10.5 : 12;
    const every = bw < 15 ? 2 : 1;
    for (let k = 0; k <= n; k++) {
      if (k % every && k !== n) continue;
      D.haloText(ctx, String(k), binX(k), base + 4, k === state.sel ? C['gb-sel'] : C.muted, 'center', 'top', fnt(fz, k === state.sel ? 700 : 500));
    }
    if (state.show.pascal) {
      for (let k = 0; k <= n; k++) {
        const s = String(G.choose(n, k));
        let px = Math.min(11, bw * 0.38);
        ctx.font = fnt(px, 600);
        const w = ctx.measureText(s).width;
        if (w > bw * 0.95) px = px * bw * 0.95 / w;
        if (px < 6.5) continue;
        D.haloText(ctx, s, binX(k), base + 4 + fz + 4, C['gb-sel'], 'center', 'top', fnt(px, 600));
      }
    }
    if (state.show.stats && state.N > 0) {
      const st = G.stats(state.counts);
      const xm = L.cx + (st.mean - n / 2) * bw, y = base + (state.show.pascal ? 4 + 2 * fz + 10 : 4 + fz + 6);
      ctx.save();
      ctx.fillStyle = C['gb-ball']; ctx.strokeStyle = shade(C['gb-ball'], -0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xm, y - 1); ctx.lineTo(xm - 6, y + 9); ctx.lineTo(xm + 6, y + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      const lx = xm + 10 + 60 > cw ? xm - 10 : xm + 10;
      D.haloText(ctx, 'x̄ = ' + num(st.mean, 2), lx, y + 5, shade(C['gb-ball'], D.dark ? 0.1 : -0.3), lx < xm ? 'right' : 'left', 'middle', fnt(L.narrow ? 10.5 : 11.5, 700));
    }
    if (hidden) D.pill(ctx, T('神祕的 p：理論藏起來了', 'Mystery p: theory hidden'), L.cx, top + 19, C.muted, 'center', fnt(L.narrow ? 10.5 : 11.5, 600));
  }

  // =====================================================================
  // 繪圖：差距與球數（對數—對數）
  // =====================================================================
  function drawChart() {
    const w = cw2, h = ch2, narrow = w < 600;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.clearRect(0, 0, w, h);
    D.backdrop(ctx2, w, h);
    const ml = narrow ? 44 : 52, mr = 12, mt = 12, mb = 26;
    const pw = w - ml - mr, ph = h - mt - mb;
    const maxN = Math.max(state.N, 1);
    const xMax = Math.max(3, Math.ceil(Math.log10(maxN) + 0.05));
    const X = function (N) { return ml + Math.log10(N) / xMax * pw; };
    const Y = function (v) { return mt + (-Math.log10(Math.max(v, 1e-4))) / 3 * ph; };
    ctx2.save();
    ctx2.font = fnt(narrow ? 10 : 11, 500);
    ctx2.fillStyle = C.muted;
    ctx2.textAlign = 'center'; ctx2.textBaseline = 'top';
    for (let e = 0; e <= xMax; e++) {
      const x = X(Math.pow(10, e));
      ctx2.strokeStyle = alpha(C.text, 0.09); ctx2.lineWidth = 1;
      ctx2.beginPath(); ctx2.moveTo(x, mt); ctx2.lineTo(x, mt + ph); ctx2.stroke();
      ctx2.fillText(['1', '10', '100', '1k', '10k', '100k', '1M', '10M'][e] || '', x, mt + ph + 5);
    }
    ctx2.textAlign = 'right'; ctx2.textBaseline = 'middle';
    for (let e = 0; e <= 3; e++) {
      const v = Math.pow(10, -e), y = Y(v);
      ctx2.strokeStyle = alpha(C.text, e === 3 ? 0.3 : 0.09);
      ctx2.beginPath(); ctx2.moveTo(ml, y); ctx2.lineTo(ml + pw, y); ctx2.stroke();
      ctx2.fillText(['1', '0.1', '0.01', '0.001'][e], ml - 5, y);
    }
    ctx2.textAlign = 'right'; ctx2.textBaseline = 'bottom';
    ctx2.fillText(T('球數 N →', 'balls N →'), ml + pw - 4, mt + ph - 3);
    ctx2.restore();
    if (state.hidden) {
      D.pill(ctx2, T('挑戰中：理論藏起來了，差距暫不顯示', 'Challenge: the theory is hidden, so the gap is not shown'), ml + pw / 2, mt + ph / 2 - 10, C.muted, 'center', fnt(narrow ? 10.5 : 11.5, 600));
      return;
    }
    // 典型差距 ∝ 1/√N
    ctx2.save();
    ctx2.beginPath();
    ctx2.rect(ml, mt, pw, ph); ctx2.clip();
    ctx2.strokeStyle = alpha(C['gb-theory'], 0.75); ctx2.lineWidth = 1.6; ctx2.setLineDash([5, 4]);
    ctx2.beginPath();
    let first = true;
    for (let e = 0; e <= xMax * 20; e++) {
      const N = Math.pow(10, e / 20), v = G.expectedTV(state.P, N);
      if (!isFinite(v) || v <= 0) continue;
      if (first) { ctx2.moveTo(X(N), Y(v)); first = false; } else ctx2.lineTo(X(N), Y(v));
    }
    ctx2.stroke();
    ctx2.setLineDash([]);
    const hst = state.tvHist;
    if (hst.length) {
      ctx2.strokeStyle = C['gb-ball']; ctx2.lineWidth = 2; ctx2.lineJoin = 'round';
      ctx2.beginPath();
      hst.forEach(function (q, i) { const x = X(q[0]), y = Y(q[1]); if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y); });
      ctx2.stroke();
    }
    ctx2.restore();
    if (hst.length) {
      const q = hst[hst.length - 1];
      D.ball(ctx2, X(q[0]), Y(q[1]), 4, C['gb-ball'], { shadow: false });
    }
  }

  function draw() {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    drawBoard();
    if (kb && kb.focused()) {
      ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      D.roundRect(ctx, 2, 2, cw - 4, ch - 4, RAD); ctx.stroke(); ctx.restore();
    }
  }

  // ---------- 動畫迴圈 ----------
  let raf = 0, lastT = 0, dirty = true, chartDirty = true;
  /** 長條高度與縱軸平順地移到目標 */
  function easeBars(dt) {
    const N = state.N;
    let moving = false;
    let want = 0;
    for (let k = 0; k <= state.n; k++) {
      const target = N ? state.counts[k] / N : 0;
      const cur = state.disp[k] || 0;
      const nv = reducedMotion ? target : cur + (target - cur) * Math.min(1, dt * 12);
      state.disp[k] = Math.abs(nv - target) < 1e-5 ? target : nv;
      if (state.disp[k] !== target) moving = true;
      want = Math.max(want, target, state.hidden ? 0 : state.P[k]);
    }
    want = Math.max(0.05, want * 1.3);
    const ny = reducedMotion ? want : state.yTop + (want - state.yTop) * Math.min(1, dt * 6);
    state.yTop = Math.abs(ny - want) < 1e-5 ? want : ny;
    if (state.yTop !== want) moving = true;
    return moving;
  }
  function frame(now) {
    raf = 0;
    now = now || performance.now();
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    spawnStep(dt);
    if (L) stepBalls(dt);
    for (let i = state.fx.length - 1; i >= 0; i--) { state.fx[i].t += dt; if (state.fx[i].t > 0.35) state.fx.splice(i, 1); }
    const moving = easeBars(dt);
    if (dirty) { updateReadouts(); dirty = false; chartDirty = true; }
    const is3d = stage.classList.contains('is3d');
    if (!is3d) draw();
    else if (view3 && view3.active) view3.frame();
    if (chartDirty) { drawChart(); chartDirty = false; }
    const busy = state.balls.length || state.queue > 0 || state.playing || state.fx.length || moving;
    if (busy) requestDraw(); else lastT = 0;
  }
  function requestDraw() {
    if (raf) return;
    raf = requestAnimationFrame(frame);
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = '';
  function setEq(tex) {
    if (tex === eqKey) return;
    eqKey = tex;
    const el = $('rEq');
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function pTex(p) { return G.trim(p, 2); }
  function updateReadouts() {
    const n = state.n, hidden = !!state.hidden, p = pEff();
    const st = G.stats(state.counts);
    const th = function (s) { return hidden ? ' <small>（?）</small>'.replace('（', T('（', ' (')).replace('）', T('）', ')')) : ' <small>' + T('（', ' (') + s + T('）', ')') + '</small>'; };
    setHTML('rN', intText(state.N));
    setHTML('rMean', num(st.mean, 3) + th(trimN(n * p, 3)));
    setHTML('rVar', num(st.variance, 3) + th(trimN(G.variance(n, p), 4)));
    setHTML('rSd', num(st.sd, 3) + th(num(Math.sqrt(G.variance(n, p)), 3)));
    setHTML('rEst', num(G.estimateP(state.counts, n), 3) + (state.N ? ' <small>± ' + num(G.stdErrP(Math.min(0.99, Math.max(0.01, G.estimateP(state.counts, n))), n, state.N), 3) + '</small>' : ''));
    setHTML('rTv', hidden ? '?' : num(G.tv(state.counts, state.P), 4));
    const k = state.sel;
    if (k == null) {
      setHTML('rK', '—'); setHTML('rPaths', '—'); setHTML('rP', '—'); setHTML('rF', '—');
      setEq('P(X = k) = \\binom{' + n + '}{k}\\,' + (hidden ? 'p^{k}(1-p)^{' + n + '-k}' : '(' + pTex(p) + ')^{k}(' + pTex(1 - p) + ')^{' + n + '-k}'));
    } else {
      const Pk = state.P[k];
      setHTML('rK', String(k));
      setHTML('rPaths', intText(G.choose(n, k)));
      setHTML('rP', hidden ? '?' : probText(Pk));
      setHTML('rF', state.N ? probText(state.counts[k] / state.N) + ' <small>(' + intText(state.counts[k]) + ')</small>' : '—');
      let tex = 'P(X = ' + k + ') = \\binom{' + n + '}{' + k + '}';
      if (hidden) tex += 'p^{' + k + '}(1-p)^{' + (n - k) + '}';
      else {
        tex += '(' + pTex(p) + ')^{' + k + '}(' + pTex(1 - p) + ')^{' + (n - k) + '}';
        if (Math.abs(p - 0.5) < 1e-12) tex += ' = \\frac{' + G.choose(n, k) + '}{' + Math.pow(2, n) + '}';
        tex += Pk > 0 && Pk < 0.001 ? ' \\approx ' + num(Pk / Math.pow(10, Math.floor(Math.log10(Pk))), 3).replace('−', '-') + '\\times 10^{' + Math.floor(Math.log10(Pk)) + '}' : ' \\approx ' + num(Pk, 4);
      }
      setEq(tex);
    }
  }

  // =====================================================================
  // 狀態列、報讀、音效
  // =====================================================================
  let sayTimer = 0;
  function say(msg) {
    const el = $('status');
    if (!el) return;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 30);
  }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let tickBudget = 0, tickT = 0, landBudget = 0, landT = 0;
  function budget(which) {
    const t = performance.now() / 1000;
    if (which === 'tick') { if (t - tickT > 0.04) { tickT = t; return true; } return false; }
    if (t - landT > 0.045) { landT = t; return true; }
    return false;
  }
  function pegTick(r) {
    const S = sound(); if (!S || !budget('tick')) return;
    S.tone({ freq: 880 + 26 * r, dur: 0.025, type: 'triangle', gain: 0.05 });
  }
  function landSound(k) {
    const S = sound(); if (!S || !budget('land')) return;
    S.tone({ freq: 300 * Math.pow(2, 1.5 * k / Math.max(1, state.n)), dur: 0.09, type: 'sine', gain: 0.13 });
  }
  function chime(ok) {
    const S = sound(); if (!S) return;
    if (ok) {
      S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: 0.28 });
      S.tone({ freq: 987.77, dur: 0.24, type: 'sine', gain: 0.24, delay: 0.11 });
    } else S.tone({ freq: 523.25, dur: 0.12, type: 'triangle', gain: 0.22 });
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
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // =====================================================================
  // 任務模式：回報數學量
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitDrop(src) {
    const st = G.stats(state.counts);
    emit('drop', { src: src, n: state.n, p: state.p, hidden: !!state.hidden, N: state.N, mean: st.mean, variance: st.variance,
      tv: G.tv(state.counts, state.P), counts: state.counts.slice() });
  }
  function emitBoard() {
    if (state.hidden) return;
    const n = state.n, p = state.p;
    emit('board', { n: n, p: p, mean: G.mean(n, p), variance: G.variance(n, p), normErr: G.maxNormalErr(n, p), modes: G.modes(n, p) });
  }
  function emitSelect(src) {
    if (state.sel == null || state.hidden) return;
    const n = state.n, k = state.sel, P = state.P;
    const top = G.topBins(P);
    emit('select', { src: src, n: n, p: state.p, k: k, prob: P[k], paths: G.choose(n, k), isTop: top.indexOf(k) >= 0 });
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elN = $('nn'), elP = $('pp'), elRate = $('rate');
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  /** 滑桿旁的數字；挑戰神祕的 p 時 p 顯示「?」 */
  function refreshOutputs() {
    $('nno').textContent = fmtSlider(val(elN), elN);
    $('ppo').textContent = state.hidden ? '?' : fmtSlider(val(elP), elP);
    $('rateo').textContent = fmtSlider(val(elRate), elRate);
  }
  function setBoard(n, p) {
    const changed = n !== state.n || p !== state.p;
    state.n = n; state.p = p;
    state.P = G.pmf(n, pEff());
    if (state.sel != null && state.sel > n) state.sel = n;
    resetCounts();
    if (L) resize();
    if (changed && view3 && view3.active) view3.rebuild();
  }
  function readBoard() { return { n: Math.round(val(elN)), p: Math.round(val(elP) * 100) / 100 }; }
  [elN, elP].forEach(function (el) {
    el.addEventListener('input', function () {
      refreshOutputs();
      const b = readBoard();
      if (b.n === state.n && b.p === state.p) return;
      setBoard(b.n, b.p);
      say(T('換了釘板，重新開始統計：', 'New board, counting from zero: ') + 'n = ' + b.n + (state.hidden ? '' : '，p = '.replace('，', T('，', ', ')) + G.trim(b.p, 2)));
      refreshOutputs();
    });
    el.addEventListener('change', function () { emitBoard(); refreshOutputs(); });
  });
  elRate.addEventListener('input', function () { state.rate = Math.round(val(elRate)); refreshOutputs(); });
  $('drop1').addEventListener('click', function () { enqueue(1, 30); });
  $('drop10').addEventListener('click', function () { enqueue(10, 20); });
  $('drop100').addEventListener('click', function () { enqueue(100, 60); });
  $('drop1000').addEventListener('click', function () { dropBatch(1000); requestDraw(); });
  function updatePlayLabel() {
    const b = $('play');
    b.textContent = state.playing ? T('暫停', 'Pause') : T('連續落球', 'Keep dropping');
    b.setAttribute('aria-pressed', String(state.playing));
  }
  function stopPlay() { if (!state.playing) return; state.playing = false; updatePlayLabel(); }
  $('play').addEventListener('click', function () {
    state.playing = !state.playing;
    updatePlayLabel();
    requestDraw();
  });
  $('clear').addEventListener('click', function () {
    stopPlay();
    resetCounts();
    say(T('已全部清除，設定不變。', 'Cleared; the settings are kept.'));
  });
  [['showTheory', 'theory'], ['showNormal', 'normal'], ['showStats', 'stats'], ['showPascal', 'pascal'], ['showPath', 'path']].forEach(function (pr) {
    const el = $(pr[0]);
    state.show[pr[1]] = el.checked;
    el.addEventListener('change', function () {
      state.show[pr[1]] = el.checked;
      if (L) resize();
      requestDraw();
    });
  });

  // ---------- 選取格子 ----------
  function selectBin(k, src) {
    k = Math.max(0, Math.min(state.n, k));
    state.sel = k;
    dirty = true;
    requestDraw();
    emitSelect(src);
    if (view3 && view3.active) view3.rebuild();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!L) return;
    const rect = cv.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    if (y < L.binsTop - 8 || x < L.left - 4 || x > L.right + 4) return;
    const k = Math.floor((x - L.left) / L.bw);
    selectBin(k, 'tap');
    say(T('選取第 ', 'Selected bin ') + state.sel + T(' 格：', ': ') + T('路徑數 ', 'paths ') + intText(G.choose(state.n, state.sel)) +
      (state.hidden ? '' : T('，機率 ', ', probability ') + num(state.P[state.sel], 4)));
  });
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('高爾頓板畫布。左右方向鍵選取格子，看它的路徑數與機率。', 'Galton board canvas. Use the left and right arrow keys to select a bin and see its number of paths and its probability.'),
      items: [{
        name: function () { return T('選取的格子', 'Selected bin'); },
        move: function (dx) {
          if (!dx) return false;
          const cur = state.sel == null ? G.modes(state.n, state.p)[0] - dx : state.sel;
          selectBin(cur + dx, 'key');
          return true;
        },
        describe: function () {
          if (state.sel == null) return T('還沒有選取格子', 'No bin selected');
          return T('第 ', 'Bin ') + state.sel + T(' 格，路徑數 ', ', paths ') + intText(G.choose(state.n, state.sel)) +
            (state.hidden ? '' : T('，機率 ', ', probability ') + num(state.P[state.sel], 4)) +
            (state.N ? T('，實驗 ', ', experiment ') + num(state.counts[state.sel] / state.N, 4) : '');
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 挑戰：神祕的 p ----------
  const chalMsg = $('chalMsg');
  function setChal(msg, ok) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', !!ok); }
  function startHidden() {
    stopPlay();
    state.hidden = { p: G.hiddenP(rand, state.p), round: ++state.round };
    state.P = G.pmf(state.n, state.hidden.p);
    elP.disabled = true;
    $('guessRow').hidden = false;
    $('guess').value = '';
    resetCounts();
    refreshOutputs();
    setChal(T('第 ' + state.round + ' 回：神祕的 p 藏好了。放一些球，再猜 p。', 'Round ' + state.round + ': the mystery p is hidden. Drop some balls, then guess p.'));
    if (view3 && view3.active) view3.rebuild();
  }
  function endHidden() {
    const hp = state.hidden.p;
    state.hidden = null;
    elP.disabled = false;
    $('guessRow').hidden = true;
    // 揭曉：把 p 換成真正的值，但保留已經落下的球，讓學生看到理論和自己的實驗對照
    state.p = hp;
    state.P = G.pmf(state.n, hp);
    if (window.LabNum) window.LabNum.set(elP, hp); else elP.value = hp;  // state.p 已是 hp，輸入事件不會清掉球
    refreshOutputs();
    state.tvHist = [];
    if (state.N) state.tvHist.push([state.N, G.tv(state.counts, state.P)]);
    dirty = true;
    requestDraw();
    if (view3 && view3.active) view3.rebuild();
  }
  function guess() {
    if (!state.hidden) return;
    const raw = String($('guess').value || '').replace(',', '.').trim();
    const g = parseFloat(raw);
    if (!isFinite(g) || g < 0 || g > 1) { setChal(T('請輸入 0 到 1 之間的數，例如 0.37。', 'Type a number between 0 and 1, for example 0.37.')); return; }
    if (!state.N) { setChal(T('先放幾顆球再猜。', 'Drop some balls before guessing.')); return; }
    const hp = state.hidden.p, err = Math.abs(g - hp);
    const row = { round: state.hidden.round, n: state.n, N: state.N, guess: g, p: hp, err: err };
    state.log.push(row);
    const ok = err <= 0.02 + 1e-9;
    chime(ok);
    emit('guess', { n: state.n, p: hp, guess: g, N: state.N, err: err, round: row.round });
    setChal((ok ? T('猜中了！', 'Got it! ') : '') + T('真正的 p = ', 'The true p = ') + G.trim(hp, 2) + T('，你猜 ', '; you guessed ') + G.trim(g, 3) +
      T('，差 ', ', off by ') + G.trim(err, 3) + T('。', '.') + (ok ? '' : T('再挑戰一次？', ' Try another round?')), ok);
    endHidden();
    renderLog();
  }
  $('newHidden').addEventListener('click', startHidden);
  $('guessBtn').addEventListener('click', guess);
  $('guess').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); guess(); } });
  function renderLog() {
    const tb = $('log');
    const rows = state.log.slice(-8).reverse();
    $('logEmpty').hidden = rows.length > 0;
    if (!rows.length) { tb.innerHTML = ''; return; }
    let h = '<thead><tr><th>' + T('回', 'Rd') + '</th><th>n</th><th>N</th><th>' + T('猜', 'Guess') + '</th><th>p</th><th>' + T('差', 'Off') + '</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>' + r.n + '</td><td>' + intText(r.N) + '</td><td>' + G.trim(r.guess, 3) + '</td><td>' + G.trim(r.p, 2) + '</td><td' +
        (r.err <= 0.02 + 1e-9 ? ' style="color:var(--gb-mean);font-weight:700"' : '') + '>' + G.trim(r.err, 3) + '</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/galton-board-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  /** 給 3D 的資料：以釘子間距為 1 個單位，x 向右、w 向下（從第一層釘子起算） */
  const bridge = {
    G: G, T: T, D: D, state: state, reducedMotion: reducedMotion,
    colors: function () { return C; },
    geom: function () {
      const u = L.bw;
      return { n: state.n, rh: L.rh / u, pegR: L.pegR / u, ballR: L.ballR / u, binsTop: (L.binsTop - L.yp0) / u, binsH: L.binsH / u, top: (L.top - L.yp0) / u };
    },
    balls: function () {
      const u = L.bw, out = [];
      for (let i = 0; i < state.balls.length; i++) { const q = ballXY(state.balls[i]); out.push((q.x - L.cx) / u, (q.y - L.yp0) / u); }
      return out;
    },
    bars: function () { return state.disp.map(function (v) { return barH(v) / L.bw; }); },
    theory: function () { return state.hidden ? null : state.P.map(function (v) { return barH(v) / L.bw; }); },
    stats: function () { return G.stats(state.counts); },
    num: num, intText: intText,
    onRotate: function () { emit('rotate3d', {}); },
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
      if (window.Galton3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Galton3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/galton-board-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Galton3D) throw new Error('galton-board-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
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
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.Galton3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
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
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // 給測試用的介面（不影響畫面）
  window.__gb = {
    state: state,
    setHidden: function (p) { startHidden(); state.hidden.p = p; state.P = G.pmf(state.n, p); dirty = true; requestDraw(); },
    seed: function (s) { rand = G.rng(s); },
    binPt: function (k) { return L ? [L.left + (k + 0.5) * L.bw, L.binsTop + L.binsH / 2] : null; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  (function () { const b = readBoard(); state.n = b.n; state.p = b.p; state.P = G.pmf(b.n, b.p); state.counts = G.zeros(b.n + 1); state.disp = G.zeros(b.n + 1); })();
  state.rate = Math.round(val(elRate));
  refreshOutputs();
  renderLog();
  updateSoundButton();
  updatePlayLabel();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    dirty = true;
    renderLog();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); });
  resize();
  updateReadouts();
})();
