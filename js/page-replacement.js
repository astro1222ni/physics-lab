/* page-replacement.js — 「分頁置換」的畫面與互動（置換計算在 page-replacement-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 核心一次把四種方法整串算完（每一步之後每個框放哪一頁、決策值、換出哪一頁），畫面依目前的步數 k 重畫。
 * 框數 1–7 的缺頁次數也先算好，畫在「框數與缺頁次數」圖上。
 * 任務事件 'run'：使用者按「播放」「單步」「直接跑完」跑到最後一步時送出；已經在最後一步時再改字串、框數或 LFU 的算法，
 *   畫面直接顯示新的完整結果，也送出一次（src = 'update'，短時間內連續改只送最後一次）。載入頁面、不操作不會送出。
 */
(function () {
  'use strict';
  const K = window.PageReplCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha, shade = D.shade;
  const reducedMotion = function () { return D.reducedMotion(); };
  const fmt = K.fmt;
  const ALGOS = K.ALGOS;
  const LIM = K.LIMITS;

  const NAME = { fifo: 'FIFO', lru: 'LRU', lfu: 'LFU', opt: 'OPT' };
  const SUB = { fifo: ['先進先出', 'first in, first out'], lru: ['最近最少使用', 'least recently used'], lfu: ['最不常使用', 'least frequently used'], opt: ['最佳（預知未來）', 'optimal (sees ahead)'] };
  const KEYCAP = { fifo: ['框下：第幾步載入', 'below: step loaded'], lru: ['框下：最後用到的步', 'below: step last used'], lfu: ['框下：用了幾次', 'below: number of uses'], opt: ['框下：下次用到的步', 'below: step of next use'] };
  const PRESETS = {
    silb: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1],
    belady: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
    loop: [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]
  };
  const PRESET_NAME = {
    silb: ['課本的參考字串', 'the textbook string'], belady: ['Belady 的經典字串', 'Belady’s classic string'], loop: ['繞圈子', 'a loop']
  };

  // ---------- 狀態 ----------
  const state = {
    refs: PRESETS.silb.slice(), sheet: 'default', preset: '', rev: false, seed: 0, len: 20, kinds: 6,
    frames: 3, lfuKeep: false, speed: 1.5, focus: 'fifo',
    res: null, curves: null,
    k: 0, playing: false, atEnd: false, logged: false, acc: 0,
    anim: null, log: [], ran: {}
  };

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'pr-fifo', 'pr-lru', 'pr-lfu', 'pr-opt', 'pr-hit', 'pr-fault', 'pr-slot']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    C.pg = [];
    for (let i = 0; i < 10; i++) C.pg.push(cs.getPropertyValue('--pr-c' + i).trim() || '#888888');
    C.ink = C.pg.map(function (c) { const r = D.rgb(c); return (0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]) > 160 ? '#14181f' : '#ffffff'; });
  }
  const algoColor = function (a) { return C['pr-' + a]; };
  const pageColor = function (p) { return C.pg[((p % 10) + 10) % 10]; };
  const pageInk = function (p) { return C.ink[((p % 10) + 10) % 10]; };
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  const stepLabel = function (t) { return String(t + 1); };
  function keyText(a, v) {
    if (v === null || v === undefined) return '';
    if (a === 'lfu') return '×' + v;
    if (a === 'opt' && !isFinite(v)) return '∞';
    return stepLabel(v);
  }

  /** 一頁：立體圓角方塊（上亮下暗漸層、頂邊高光、底邊暗線、輕微投影）＋頁號 */
  function pageBox(ctx, x, y, w, h, p, opts) {
    opts = opts || {};
    const col = pageColor(p);
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    D.block(ctx, x, y, w, h, col, { r: Math.min(7, h * 0.22), shadow: opts.shadow !== false });
    ctx.font = fnt(opts.fs || Math.round(Math.min(18, h * 0.5)), 700);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3;
    ctx.strokeStyle = pageInk(p) === '#ffffff' ? alpha(shade(col, -0.5), 0.5) : alpha('#ffffff', 0.5);
    ctx.strokeText(String(p), x + w / 2, y + h / 2 + 1);
    ctx.fillStyle = pageInk(p);
    ctx.fillText(String(p), x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }
  /** 空框：虛線外框 */
  function emptySlot(ctx, x, y, w, h) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    D.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
    ctx.fillStyle = alpha(C['pr-slot'], D.dark ? 0.08 : 0.06);
    ctx.fill();
    ctx.strokeStyle = alpha(C['pr-slot'], 0.75);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  /** 命中／缺頁的小圓章：顏色＋記號（✓／✗），色弱也分得出 */
  function badge(ctx, x, y, r, hit) {
    const col = hit ? C['pr-hit'] : C['pr-fault'];
    D.ball(ctx, x, y, r, col, { shadow: true, glow: 0 });
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.6, r * 0.32);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (hit) { ctx.moveTo(x - r * 0.45, y + r * 0.02); ctx.lineTo(x - r * 0.1, y + r * 0.38); ctx.lineTo(x + r * 0.5, y - r * 0.36); }
    else { const s = r * 0.38; ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); }
    ctx.stroke();
    ctx.restore();
  }

  // =====================================================================
  // 計算
  // =====================================================================
  function recompute() {
    const o = { lfuKeep: state.lfuKeep };
    state.res = K.runAll(state.refs, state.frames, o);
    state.curves = K.curves(state.refs, o);
  }
  const n = function () { return state.refs.length; };
  const stepOf = function (a, k) { return k > 0 ? state.res[a].steps[k - 1] : null; };
  const ranKey = function () { return state.refs.join(',') + '|' + (state.lfuKeep ? 1 : 0); };

  // =====================================================================
  // 主畫布：參考字串＋四種方法的記憶體框
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const cv3 = $('cv3'), ctx3 = cv3.getContext('2d');
  let dpr = 1, cw = 600, ch = 420, cw2 = 600, ch2 = 220, cw3 = 600, ch3 = 240, L = null;
  function layout() {
    const narrow = cw < 560;
    const pad = narrow ? 8 : 12;
    const F = state.frames;
    const hudH = 30;
    const cellMin = narrow ? 23 : 26;
    let avail = cw - 2 * pad;
    if (n() * cellMin > avail) avail -= 24; // 放不下：左右各留 12 px 給「…」
    const vis = Math.max(1, Math.min(n(), Math.floor(avail / cellMin)));
    const cellW = Math.min(36, avail / vis);
    const cellH = narrow ? 28 : 32;
    const tapeTop = hudH + 18;
    const labelW = narrow ? 0 : 108, rightW = narrow ? 0 : 118;
    const fx0 = pad + (narrow ? 6 : labelW + 6), fx1 = cw - pad - (narrow ? 6 : rightW + 6);
    const gap = narrow ? 6 : 8;
    const bw = Math.max(26, Math.min(56, (fx1 - fx0 - (F - 1) * gap) / F));
    const bh = narrow ? 36 : 42;
    const headH = narrow ? 20 : 0;
    const laneH = narrow ? headH + 10 + bh + 22 : 80;
    const laneTop = tapeTop + cellH + 22;
    const laneGap = 8;
    const H = laneTop + 4 * laneH + 3 * laneGap + 10;
    return { narrow: narrow, pad: pad, hudH: hudH, vis: vis, cellW: cellW, cellH: cellH, tapeTop: tapeTop, labelW: labelW, rightW: rightW,
      fx0: fx0, fx1: fx1, gap: gap, bw: bw, bh: bh, headH: headH, laneH: laneH, laneTop: laneTop, laneGap: laneGap, H: Math.round(H) };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    ch2 = layout2().H;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    cw3 = cv3.clientWidth || cw;
    ch3 = cw3 < 560 ? 230 : 260;
    if (cv3.style.height !== ch3 + 'px') cv3.style.height = ch3 + 'px';
    cv3.width = Math.round(cw3 * dpr); cv3.height = Math.round(ch3 * dpr);
    dirty2 = dirty3 = true;
    requestDraw();
  }
  function animU() {
    const a = state.anim;
    if (!a || a.k !== state.k) return 1;
    return Math.min(1, (performance.now() - a.at) / a.dur);
  }
  const ease = function (u) { return 1 - Math.pow(1 - u, 3); };

  function draw() {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const u = animU();
    drawHud();
    drawTape(u);
    ALGOS.forEach(function (a, j) { drawLane(a, j, u); });
  }
  function drawHud() {
    const k = state.k, N = n();
    D.pill(ctx, T('第 ', 'Step ') + k + ' / ' + N + T(' 步', ''), 8, 24, C.accent, 'left', fnt(13, 700));
    const txt = k > 0 ? T('這一步用到頁 ', 'This step uses page ') + state.refs[k - 1] : T('還沒開始：記憶體是空的', 'Not started: memory is empty');
    D.pill(ctx, txt, cw - 8, 24, C.text, 'right', fnt(12.5, 600));
  }
  function tapeWindow() {
    const N = n(), vis = L.vis;
    const cur = Math.max(0, state.k - 1);
    let s = Math.max(0, Math.min(N - vis, cur - Math.floor(vis / 2)));
    if (N <= vis) s = 0;
    return s;
  }
  function tapeX(i, s) { return L.pad + (i - s) * L.cellW + (cw - 2 * L.pad - L.vis * L.cellW) / 2; }
  function drawTape(u) {
    const N = n(), s = tapeWindow(), k = state.k;
    const y = L.tapeTop, h = L.cellH, w = L.cellW;
    // 底下的凹槽
    const x0 = tapeX(s, s) - 4, x1 = tapeX(Math.min(N, s + L.vis), s) + 4;
    D.roundRect(ctx, x0, y - 4, x1 - x0, h + 8, 9);
    ctx.fillStyle = alpha(C.text, D.dark ? 0.08 : 0.05);
    ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.12); ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let i = s; i < Math.min(N, s + L.vis); i++) {
      const x = tapeX(i, s);
      const past = i < k - 1, cur = i === k - 1;
      if (w >= 24 || (i + 1) % 5 === 0 || cur) {
        ctx.font = fnt(10.5, cur ? 700 : 400);
        ctx.fillStyle = cur ? C.accent : C.muted;
        ctx.fillText(String(i + 1), x + w / 2, y - 7);
      }
      const lift = cur ? -2 * ease(u) : 0;
      pageBox(ctx, x + 2, y + lift, w - 4, h, state.refs[i], { alpha: past ? 0.38 : 1, shadow: cur, fs: Math.min(15, Math.round(h * 0.5)) });
      if (cur) {
        D.roundRect(ctx, x + 0.5, y - 1.5 + lift, w - 1, h + 3, 8);
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
        // 指向下面記憶體的小三角形
        ctx.beginPath();
        ctx.moveTo(x + w / 2 - 6, y + h + 6); ctx.lineTo(x + w / 2 + 6, y + h + 6); ctx.lineTo(x + w / 2, y + h + 13);
        ctx.closePath(); ctx.fillStyle = C.accent; ctx.fill();
      }
      if (i === k && k < N && !state.playing) {
        // 下一步要用的頁：虛線框
        ctx.save(); ctx.setLineDash([3, 3]);
        D.roundRect(ctx, x + 0.5, y - 1.5, w - 1, h + 3, 8);
        ctx.strokeStyle = alpha(C.accent, 0.7); ctx.lineWidth = 1.2; ctx.stroke();
        ctx.restore();
      }
    }
    // 視窗外還有字：左右淡出的「…」
    ctx.font = fnt(13, 700); ctx.fillStyle = C.muted; ctx.textBaseline = 'middle';
    if (s > 0) { ctx.textAlign = 'left'; ctx.fillText('…', 1, y + h / 2); }
    if (s + L.vis < N) { ctx.textAlign = 'right'; ctx.fillText('…', cw - 1, y + h / 2); }
  }
  function frameX(i) {
    const F = state.frames, tot = F * L.bw + (F - 1) * L.gap;
    const x0 = L.fx0 + Math.max(0, (L.fx1 - L.fx0 - tot) / 2);
    return x0 + i * (L.bw + L.gap);
  }
  function drawLane(a, j, u) {
    const top = L.laneTop + j * (L.laneH + L.laneGap);
    const col = algoColor(a);
    const res = state.res[a], k = state.k, st = stepOf(a, k);
    const F = state.frames;
    // 車道底色與左邊的色條
    D.roundRect(ctx, L.pad, top, cw - 2 * L.pad, L.laneH, 10);
    ctx.fillStyle = alpha(col, D.dark ? 0.1 : 0.06);
    ctx.fill();
    ctx.strokeStyle = alpha(col, 0.28); ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    D.roundRect(ctx, L.pad, top, cw - 2 * L.pad, L.laneH, 10); ctx.clip();
    ctx.fillStyle = col; ctx.fillRect(L.pad, top, 4, L.laneH);
    ctx.restore();
    const faults = st ? st.faults : 0, hits = k - faults;
    const rate = k ? Math.round(100 * hits / k) : 0;
    // 標籤
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (L.narrow) {
      ctx.font = fnt(13.5, 700); ctx.fillStyle = col;
      ctx.fillText(NAME[a], L.pad + 10, top + 16);
      const w1 = ctx.measureText(NAME[a]).width;
      ctx.font = fnt(11); ctx.fillStyle = C.muted;
      ctx.fillText(T(KEYCAP[a][0], KEYCAP[a][1]), L.pad + 16 + w1, top + 16);
      ctx.textAlign = 'right'; ctx.font = fnt(12, 700);
      ctx.fillStyle = C['pr-fault'];
      const ft = T('缺頁 ', 'faults ') + faults;
      ctx.fillText(ft, cw - L.pad - 10, top + 16);
    } else {
      ctx.font = fnt(16, 700); ctx.fillStyle = col;
      ctx.fillText(NAME[a], L.pad + 14, top + 24);
      ctx.font = fnt(11.5); ctx.fillStyle = C.muted;
      ctx.fillText(T(SUB[a][0], SUB[a][1]), L.pad + 14, top + 40);
      ctx.font = fnt(10.5); ctx.fillStyle = alpha(C.muted, 0.95);
      ctx.fillText(T(KEYCAP[a][0], KEYCAP[a][1]), L.pad + 14, top + 56);
      // 右邊的計數
      const rx = cw - L.pad - L.rightW;
      ctx.font = fnt(13, 700); ctx.fillStyle = C['pr-fault'];
      ctx.fillText(T('缺頁 ', 'Faults ') + faults, rx + 8, top + 20);
      ctx.fillStyle = C['pr-hit'];
      ctx.fillText(T('命中 ', 'Hits ') + hits, rx + 8, top + 36);
      ctx.font = fnt(11.5); ctx.fillStyle = C.muted;
      ctx.fillText(T('命中率 ', 'Hit ratio ') + (k ? rate + '%' : '—'), rx + 8, top + 52);
    }
    const by = top + L.headH + 10, bw = L.bw, bh = L.bh;
    const mem = st ? st.mem : new Array(F).fill(null);
    for (let i = 0; i < F; i++) {
      const x = frameX(i);
      const isCur = st && i === st.idx;
      if (mem[i] === null) emptySlot(ctx, x, by, bw, bh);
      else if (isCur && !st.hit && u < 1) {
        // 新載入的頁從上面落進框裡
        emptySlot(ctx, x, by, bw, bh);
        const e = ease(u);
        pageBox(ctx, x, by - (1 - e) * bh * 0.9, bw, bh, mem[i], { alpha: 0.25 + 0.75 * e });
      } else pageBox(ctx, x, by, bw, bh, mem[i]);
      if (isCur) {
        const rc = st.hit ? C['pr-hit'] : C['pr-fault'];
        const pulse = st.hit && u < 1 ? (1 - u) : 0;
        D.roundRect(ctx, x - 2.5 - pulse * 3, by - 2.5 - pulse * 3, bw + 5 + pulse * 6, bh + 5 + pulse * 6, 9);
        ctx.strokeStyle = alpha(rc, 0.95); ctx.lineWidth = 2.2; ctx.stroke();
        badge(ctx, x + bw - 2, by + 1, L.narrow ? 7.5 : 8.5, st.hit);
      }
      // 決策值
      if (st && st.key[i] !== null) {
        ctx.font = fnt(11, isCur ? 700 : 500);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = isCur ? col : C.muted;
        ctx.fillText(keyText(a, st.key[i]), x + bw / 2, by + bh + 15);
      }
    }
    // 被換出的頁：從框裡飛出去（動畫結束後留一個小標籤）
    if (st && st.victim !== null) {
      const x = frameX(st.idx);
      if (u < 1 && !reducedMotion()) {
        const e = ease(u);
        const s = 0.8 - 0.25 * e;
        const vw = bw * s, vh = bh * s;
        pageBox(ctx, x + bw * 0.1 + e * bw * 0.55, by + bh * 0.1 - e * bh * 0.95, vw, vh, st.victim, { alpha: 1 - e, shadow: false });
      } else {
        const tag = '↗' + st.victim;
        ctx.font = fnt(11.5, 700);
        const tw = ctx.measureText(tag).width + 10;
        const tx = Math.max(L.pad + 2, x - 5), ty = by + 3; // 框的左上角（右上角是命中／缺頁的圓章）
        D.roundRect(ctx, tx, ty - 8, tw, 16, 8);
        ctx.fillStyle = alpha(C['canvas-bg'], 0.92); ctx.fill();
        ctx.strokeStyle = alpha(C['pr-fault'], 0.6); ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C['pr-fault']; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tag, tx + tw / 2, ty + 0.5);
      }
    }
    if (!L.narrow && st) {
      // 這一步的結果
      const rx = cw - L.pad - L.rightW;
      ctx.font = fnt(11.5, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = st.hit ? C['pr-hit'] : C['pr-fault'];
      const r = st.hit ? T('✓ 命中', '✓ hit') : st.victim !== null ? T('✗ 缺頁・換出 ', '✗ fault, out ') + st.victim : T('✗ 缺頁・放空框', '✗ fault, free frame');
      ctx.fillText(r, rx + 8, top + 70);
    }
  }

  // =====================================================================
  // 歷程表（課本的表格）
  // =====================================================================
  let dirty2 = true, dirty3 = true;
  function layout2() {
    const w = cw2 || 600, narrow = w < 560;
    const labW = narrow ? 36 : 48;
    const N = n(), F = state.frames;
    const colW = Math.max(narrow ? 21 : 22, Math.min(32, (w - labW - 10) / N));
    const per = Math.max(1, Math.floor((w - labW - 10) / colW));
    const bands = Math.ceil(N / per);
    const rowH = narrow ? 21 : 23;
    const bandH = rowH + 6 + F * rowH + 6 + 18 + 16 + 14;
    return { narrow: narrow, labW: labW, colW: colW, per: per, bands: bands, rowH: rowH, bandH: bandH, H: Math.round(bands * bandH + 8) };
  }
  function draw2() {
    const M = layout2();
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx2, cw2, ch2);
    const a = state.focus, res = state.res[a], k = state.k, N = n(), F = state.frames;
    const col = algoColor(a);
    for (let b = 0; b < M.bands; b++) {
      const top = 8 + b * M.bandH;
      const j0 = b * M.per, j1 = Math.min(N, j0 + M.per);
      const x0 = M.labW + 4;
      // 列名
      ctx2.font = fnt(11, 600); ctx2.fillStyle = C.muted; ctx2.textAlign = 'right'; ctx2.textBaseline = 'middle';
      ctx2.fillText(T('參考', 'ref'), M.labW - 2, top + M.rowH / 2);
      for (let i = 0; i < F; i++) ctx2.fillText(T('框', 'F') + (i + 1), M.labW - 2, top + M.rowH + 6 + i * M.rowH + M.rowH / 2);
      const yRes = top + M.rowH + 6 + F * M.rowH + 6;
      ctx2.fillText(T('結果', 'result'), M.labW - 2, yRes + 9);
      ctx2.fillText(T('換出', 'out'), M.labW - 2, yRes + 18 + 8);
      // 框的底色
      D.roundRect(ctx2, x0 - 2, top + M.rowH + 3, (j1 - j0) * M.colW + 4, F * M.rowH + 6, 6);
      ctx2.fillStyle = alpha(col, D.dark ? 0.08 : 0.05); ctx2.fill();
      ctx2.strokeStyle = alpha(col, 0.25); ctx2.lineWidth = 1; ctx2.stroke();
      for (let j = j0; j < j1; j++) {
        const x = x0 + (j - j0) * M.colW;
        const shown = j < k, cur = j === k - 1;
        const st = res.steps[j];
        // 參考的頁
        pageBox(ctx2, x + 2, top + 2, M.colW - 4, M.rowH - 4, state.refs[j], { alpha: shown ? 1 : 0.4, shadow: false, fs: 12 });
        if (cur) {
          D.roundRect(ctx2, x + 0.5, top + 0.5, M.colW - 1, M.rowH + 6 + F * M.rowH + 6 + 34, 6);
          ctx2.strokeStyle = alpha(C.accent, 0.9); ctx2.lineWidth = 1.6; ctx2.stroke();
        }
        if (!shown) continue;
        for (let i = 0; i < F; i++) {
          const y = top + M.rowH + 6 + i * M.rowH;
          const p = st.mem[i];
          const isNew = !st.hit && st.idx === i, isHit = st.hit && st.idx === i;
          if (isNew) {
            D.roundRect(ctx2, x + 2, y + 2, M.colW - 4, M.rowH - 4, 5);
            ctx2.fillStyle = alpha(C['pr-fault'], D.dark ? 0.26 : 0.16); ctx2.fill();
          }
          if (isHit) {
            D.roundRect(ctx2, x + 2, y + 2, M.colW - 4, M.rowH - 4, 5);
            ctx2.strokeStyle = C['pr-hit']; ctx2.lineWidth = 1.6; ctx2.stroke();
          }
          if (p !== null) {
            ctx2.font = fnt(12.5, isNew ? 800 : 500);
            ctx2.fillStyle = isNew ? C.text : alpha(C.text, 0.72);
            ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
            ctx2.fillText(String(p), x + M.colW / 2, y + M.rowH / 2 + 0.5);
          }
        }
        // 結果：✓／✗（顏色＋記號）
        ctx2.font = fnt(13, 800); ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
        ctx2.fillStyle = st.hit ? C['pr-hit'] : C['pr-fault'];
        ctx2.fillText(st.hit ? '✓' : '✗', x + M.colW / 2, yRes + 9);
        if (st.victim !== null) {
          ctx2.font = fnt(11, 600); ctx2.fillStyle = alpha(C['pr-fault'], 0.85);
          ctx2.fillText(String(st.victim), x + M.colW / 2, yRes + 18 + 8);
        }
      }
    }
    const st = stepOf(a, k);
    $('histNote').textContent = NAME[a] + T('：到第 ', ': up to step ') + k + T(' 步，缺頁 ', ', ') + (st ? st.faults : 0) + T(' 次', ' faults');
  }

  // =====================================================================
  // 框數與缺頁次數圖
  // =====================================================================
  const MARK = { fifo: 'circle', lru: 'square', lfu: 'tri', opt: 'diamond' };
  const DASH = { fifo: [], lru: [7, 4], lfu: [2, 3.5], opt: [11, 4, 2, 4] };
  const OFF = { fifo: -4.5, lru: -1.5, lfu: 1.5, opt: 4.5 };
  function marker(g, kind, x, y, r, color, filled) {
    g.beginPath();
    if (kind === 'circle') g.arc(x, y, r, 0, Math.PI * 2);
    else if (kind === 'square') g.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
    else if (kind === 'tri') { g.moveTo(x, y - r * 1.15); g.lineTo(x + r * 1.05, y + r * 0.75); g.lineTo(x - r * 1.05, y + r * 0.75); g.closePath(); }
    else { g.moveTo(x, y - r * 1.2); g.lineTo(x + r * 1.05, y); g.lineTo(x, y + r * 1.2); g.lineTo(x - r * 1.05, y); g.closePath(); }
    g.fillStyle = filled ? color : alpha(C['canvas-bg'], 0.95);
    g.fill();
    g.strokeStyle = color; g.lineWidth = 1.6; g.setLineDash([]); g.stroke();
  }
  function layout3() {
    const narrow = cw3 < 560;
    const x0 = narrow ? 36 : 48, x1 = cw3 - (narrow ? 12 : 22), y0 = 24, y1 = ch3 - 38;
    return { narrow: narrow, x0: x0, x1: x1, y0: y0, y1: y1 };
  }
  function niceMax(v) { const s = [4, 5, 6, 8, 10, 12, 15, 20, 25, 30]; for (let i = 0; i < s.length; i++) if (v <= s[i]) return s[i]; return Math.ceil(v / 5) * 5; }
  function draw3() {
    ctx3.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx3, cw3, ch3);
    const M = layout3(), cvs = state.curves, N = n();
    let mx = 1; ALGOS.forEach(function (a) { cvs[a].forEach(function (v) { mx = Math.max(mx, v); }); });
    const yMax = niceMax(mx);
    const xf = function (f) { return M.x0 + (M.x1 - M.x0) * (f - 0.5) / 7; };
    const yv = function (v) { return M.y1 - (M.y1 - M.y0) * v / yMax; };
    // 目前框數的直條
    const xc = xf(state.frames), bw = (M.x1 - M.x0) / 7;
    ctx3.fillStyle = alpha(C.accent, D.dark ? 0.12 : 0.08);
    ctx3.fillRect(xc - bw / 2, M.y0 - 6, bw, M.y1 - M.y0 + 6);
    // 格線與刻度
    const step = yMax <= 6 ? 1 : yMax <= 12 ? 2 : yMax <= 20 ? 4 : 5;
    ctx3.font = fnt(10.5); ctx3.textAlign = 'right'; ctx3.textBaseline = 'middle';
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      const y = Math.round(yv(v)) + 0.5;
      ctx3.strokeStyle = alpha(C.text, v === 0 ? 0.3 : 0.09); ctx3.lineWidth = 1;
      ctx3.beginPath(); ctx3.moveTo(M.x0, y); ctx3.lineTo(M.x1, y); ctx3.stroke();
      ctx3.fillStyle = C.muted; ctx3.fillText(String(v), M.x0 - 6, y);
    }
    ctx3.textAlign = 'center'; ctx3.textBaseline = 'top';
    for (let f = 1; f <= 7; f++) { ctx3.fillStyle = f === state.frames ? C.accent : C.muted; ctx3.font = fnt(11, f === state.frames ? 700 : 400); ctx3.fillText(String(f), xf(f), M.y1 + 5); }
    ctx3.font = fnt(11); ctx3.fillStyle = C.muted;
    ctx3.fillText(T('框數', 'frames'), (M.x0 + M.x1) / 2, M.y1 + 20);
    ctx3.textAlign = 'left'; ctx3.textBaseline = 'alphabetic';
    ctx3.fillText(T('缺頁次數', 'page faults'), 4, 13);
    // 下限：不同頁的個數
    const dct = K.distinct(state.refs);
    const yd = Math.round(yv(dct)) + 0.5;
    ctx3.save(); ctx3.setLineDash([2, 4]);
    ctx3.strokeStyle = alpha(C.muted, 0.8); ctx3.lineWidth = 1;
    ctx3.beginPath(); ctx3.moveTo(M.x0, yd); ctx3.lineTo(M.x1, yd); ctx3.stroke();
    ctx3.restore();
    D.pill(ctx3, T('不同的頁 ', 'different pages ') + dct, M.x0 + 4, yd - 3, C.muted, 'left', fnt(10.5, 600)); // 左下角通常是空的（框少時缺頁多）
    // Belady 異常：往上翹的那一段加紅色光暈
    const anomalyTags = [];
    ALGOS.forEach(function (a) {
      K.anomalies(cvs[a]).forEach(function (f) {
        const xa = xf(f) + OFF[a], xb = xf(f + 1) + OFF[a], ya = yv(cvs[a][f - 1]), yb = yv(cvs[a][f]);
        ctx3.save();
        ctx3.strokeStyle = alpha(C['pr-fault'], 0.35); ctx3.lineWidth = 9; ctx3.lineCap = 'round';
        ctx3.beginPath(); ctx3.moveTo(xa, ya); ctx3.lineTo(xb, yb); ctx3.stroke();
        ctx3.restore();
        anomalyTags.push({ x: (xa + xb) / 2, y: Math.min(ya, yb), a: a, d: cvs[a][f] - cvs[a][f - 1] });
      });
    });
    // 四條折線
    const ran = state.ran[ranKey()] || {};
    ALGOS.forEach(function (a) {
      const c = algoColor(a);
      ctx3.save();
      ctx3.setLineDash(DASH[a]); ctx3.strokeStyle = c; ctx3.lineWidth = 2;
      ctx3.beginPath();
      cvs[a].forEach(function (v, i) { const x = xf(i + 1) + OFF[a], y = yv(v); if (i) ctx3.lineTo(x, y); else ctx3.moveTo(x, y); });
      ctx3.stroke();
      ctx3.restore();
      cvs[a].forEach(function (v, i) { marker(ctx3, MARK[a], xf(i + 1) + OFF[a], yv(v), M.narrow ? 3.6 : 4.2, c, !!ran[i + 1]); });
    });
    anomalyTags.forEach(function (t, i) {
      D.pill(ctx3, '↑ ' + NAME[t.a] + ' +' + t.d, t.x, t.y - 8 - (i % 2) * 18, C['pr-fault'], 'center', fnt(10.5, 700));
    });
    // 目前框數的數值
    const f = state.frames;
    $('curveNote').textContent = T(f + ' 個框：', f + ' frames: ') + ALGOS.map(function (a) { return NAME[a] + ' ' + cvs[a][f - 1]; }).join(T('、', ', '));
  }

  // ---------- 重畫排程 ----------
  let raf = 0, lastTs = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = -1;
    try {
      if (state.playing) {
        const dt = lastTs ? Math.min(1 / 30, (ts - lastTs) / 1000) : 0;
        lastTs = ts;
        state.acc += dt * state.speed;
        if (state.acc >= 1) { state.acc -= 1; advance('play'); }
      } else lastTs = 0;
      draw();
      if (dirty2) { draw2(); dirty2 = false; }
      if (dirty3) { draw3(); dirty3 = false; }
    } finally {
      raf = state.playing || animU() < 1 ? requestAnimationFrame(frame) : 0;
    }
  }

  // =====================================================================
  // 步進、音效與說明
  // =====================================================================
  let lastSound = 0;
  function feedback() {
    const S = window.LabSound && window.LabSound.enabled() ? window.LabSound : null;
    const st = stepOf(state.focus, state.k);
    if (!S || !st) return;
    const now = performance.now();
    if (now - lastSound < 60) return;
    lastSound = now;
    if (st.hit) S.tone({ freq: 880, dur: 0.07, type: 'sine', gain: 0.15 });
    else {
      S.tone({ freq: 330, dur: 0.12, type: 'triangle', gain: 0.2 });
      if (st.victim !== null) S.noise({ dur: 0.05, gain: 0.2, filter: 2400, q: 1.3, delay: 0.05 });
    }
  }
  function startAnim() {
    state.anim = reducedMotion() ? null : { k: state.k, at: performance.now(), dur: Math.max(140, Math.min(450, 750 / state.speed)) };
  }
  /** 前進一步（播放、單步共用） */
  function advance(src) {
    if (state.k >= n()) return;
    state.k++;
    startAnim();
    feedback();
    say(describe(state.k));
    if (state.k >= n()) finish(src);
    else updateStep();
  }
  function reason(a, st) {
    if (st.hit) return T('命中', 'hit');
    if (st.victim === null) return T('缺頁，放進空框', 'fault, into a free frame');
    const c = st.cand[st.idx];
    const why = a === 'fifo' ? T('最早載入，第 ' + stepLabel(c) + ' 步', 'loaded first, at step ' + stepLabel(c))
      : a === 'lru' ? T('最久沒用，上次在第 ' + stepLabel(c) + ' 步', 'least recently used, last at step ' + stepLabel(c))
        : a === 'lfu' ? T('次數最少：' + c + ' 次', 'fewest uses: ' + c)
          : (isFinite(c) ? T('下次用到最晚：第 ' + stepLabel(c) + ' 步', 'next use furthest away: step ' + stepLabel(c)) : T('之後不再用到', 'never used again'));
    return T('缺頁，換出 ', 'fault, evicts ') + st.victim + T('（', ' (') + why + T('）', ')');
  }
  function describe(k) {
    if (k <= 0) return '';
    const p = state.refs[k - 1];
    return T('第 ' + k + ' 步，頁 ' + p + '：', 'Step ' + k + ', page ' + p + ': ') +
      ALGOS.map(function (a) { return NAME[a] + ' ' + reason(a, stepOf(a, k)); }).join(T('；', '; ')) + T('。', '.');
  }
  let sayTimer = 0;
  function say(msg) {
    const el = $('status');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 30);
  }

  // ---------- 播放控制 ----------
  function setPlayLabel() { $('play').textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play'); }
  function startPlay() {
    if (state.k >= n()) { state.k = 0; state.atEnd = false; state.logged = false; }
    state.playing = true; state.acc = 1; lastTs = 0; setPlayLabel(); updateStep();
  }
  function stopPlay() { state.playing = false; setPlayLabel(); }
  function markRan() {
    const key = ranKey();
    const r = state.ran[key] = state.ran[key] || {};
    r[state.frames] = true;
    const keys = Object.keys(state.ran);
    if (keys.length > 60) delete state.ran[keys[0]];
  }
  function finish(src) {
    state.k = n();
    const was = state.atEnd;
    state.atEnd = true;
    stopPlay();
    if (!state.logged || !was) { addLog(); state.logged = true; }
    markRan();
    dirty3 = true;
    emitRun(src);
    const S = window.LabSound && window.LabSound.enabled() ? window.LabSound : null;
    if (S) S.sweep({ from: 420, to: 1100, dur: 0.3, gain: 0.14, delay: 0.12 });
    const F = state.res;
    say(T('跑完了：缺頁 ', 'Finished: page faults ') + ALGOS.map(function (a) { return NAME[a] + ' ' + F[a].faults; }).join(T('、', ', ')) + T('（共 ', ' (out of ') + n() + T(' 次參考）。', ' references).'));
    updateStep();
  }
  function stepFwd() {
    stopPlay();
    if (state.k >= n()) { state.k = 0; state.atEnd = false; state.logged = false; }
    advance('step');
  }
  function stepBack() {
    stopPlay();
    state.k = Math.max(0, state.k - 1);
    state.atEnd = false;
    state.anim = null;
    say(state.k > 0 ? describe(state.k) : T('回到第 0 步：記憶體是空的。', 'Back to step 0: memory is empty.'));
    updateStep();
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function eventData(src) {
    return Object.assign({ src: src, refs: state.refs.slice(), sheet: state.sheet, preset: state.preset }, K.summary(state.refs, state.frames, state.lfuKeep));
  }
  let emitTimer = 0;
  function emitRun(src) {
    clearTimeout(emitTimer);
    if (window.LabMission) window.LabMission.emit('run', eventData(src));
  }
  function emitLater() { clearTimeout(emitTimer); emitTimer = setTimeout(function () { emitRun('update'); }, 250); }

  // =====================================================================
  // 設定改變
  // =====================================================================
  /** 字串或設定改了：已經跑到最後就直接顯示新結果（並送出任務事件），否則回到第 0 步 */
  function changed() {
    stopPlay();
    recompute();
    state.anim = null;
    if (state.atEnd) {
      state.k = n();
      addLog();
      markRan();
      emitLater();
      const F = state.res;
      say(T('已更新：缺頁 ', 'Updated: page faults ') + ALGOS.map(function (a) { return NAME[a] + ' ' + F[a].faults; }).join(T('、', ', ')) + T('。', '.'));
    } else {
      state.k = 0;
      say('');
    }
    $('refs').value = K.format(state.refs);
    updateSeed();
    if (L) resize();
    updateAll();
  }

  // ---------- 參考字串 ----------
  const elRefs = $('refs'), elLen = $('len'), elKinds = $('kinds'), elFrames = $('frames'), elSpeed = $('speed');
  function errText(p) {
    if (p.code === 'empty') return T('請輸入至少一個頁號。', 'Please type at least one page number.');
    if (p.code === 'long') return T('最多 30 頁（現在有 ' + p.n + ' 頁）。', 'At most 30 pages (this has ' + p.n + ').');
    return T('「' + p.token + '」不是 0–99 的整數頁號。', '“' + p.token + '” is not a whole page number from 0 to 99.');
  }
  function applyText() {
    const p = K.parse(elRefs.value);
    if (!p.ok) {
      $('refErr').textContent = errText(p);
      elRefs.classList.add('bad');
      return;
    }
    $('refErr').textContent = '';
    elRefs.classList.remove('bad');
    if (p.refs.join(',') === state.refs.join(',')) { elRefs.value = K.format(state.refs); return; }
    state.refs = p.refs; state.sheet = 'hand'; state.preset = ''; state.rev = false;
    $('preset').value = '';
    changed();
  }
  $('apply').addEventListener('click', applyText);
  elRefs.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); applyText(); } });
  elRefs.addEventListener('change', applyText);
  elRefs.addEventListener('input', function () { if (elRefs.classList.contains('bad')) { elRefs.classList.remove('bad'); $('refErr').textContent = ''; } });
  $('preset').addEventListener('change', function () {
    const k = $('preset').value;
    if (!PRESETS[k]) return;
    state.refs = PRESETS[k].slice(); state.sheet = 'preset'; state.preset = k; state.rev = false;
    $('refErr').textContent = ''; elRefs.classList.remove('bad');
    changed();
  });
  function newRandom() {
    state.refs = K.randomRefs(state.seed, state.len, state.kinds); state.sheet = 'random'; state.preset = ''; state.rev = false;
    $('preset').value = ''; $('refErr').textContent = ''; elRefs.classList.remove('bad');
    changed();
  }
  $('rand').addEventListener('click', function () { state.seed++; newRandom(); });
  $('rev').addEventListener('click', function () { state.refs = state.refs.slice().reverse(); state.rev = !state.rev; changed(); });
  elLen.addEventListener('input', function () { state.len = Math.round(val(elLen)); $('leno').textContent = String(state.len); state.seed = Math.max(1, state.seed); newRandom(); });
  elKinds.addEventListener('input', function () { state.kinds = Math.round(val(elKinds)); $('kindso').textContent = String(state.kinds); state.seed = Math.max(1, state.seed); newRandom(); });
  function updateSeed() {
    const s = state.sheet;
    let t = s === 'random' ? T('隨機字串 #', 'Random string #') + state.seed + T('（長度 ' + state.len + '、頁面種類 ' + state.kinds + '）', ' (length ' + state.len + ', ' + state.kinds + ' kinds of page)')
      : s === 'preset' ? T('範例：', 'Example: ') + T(PRESET_NAME[state.preset][0], PRESET_NAME[state.preset][1])
        : s === 'hand' ? T('自己輸入的字串', 'Your own string') : T('預設：課本的參考字串', 'Default: the textbook string');
    if (state.rev) t += T('，倒過來', ', reversed');
    $('seedInfo').textContent = t + T('。共 ', '. ') + n() + T(' 頁，', ' pages, ') + K.distinct(state.refs) + T(' 種不同的頁。', ' different.');
  }

  // ---------- 記憶體設定 ----------
  function setFrames(f) {
    f = Math.max(LIM.framesMin, Math.min(LIM.framesMax, Math.round(f)));
    $('frameso').textContent = String(f);
    if (f === state.frames) return;
    state.frames = f;
    changed();
  }
  elFrames.addEventListener('input', function () { setFrames(val(elFrames)); });
  $('keep').addEventListener('change', function () { state.lfuKeep = $('keep').checked; changed(); });
  elSpeed.addEventListener('input', function () { state.speed = Math.max(0.5, val(elSpeed)); $('speedo').textContent = fmt(state.speed, 1); });

  // ---------- 播放列 ----------
  $('play').addEventListener('click', function () { if (state.playing) stopPlay(); else startPlay(); });
  $('step').addEventListener('click', stepFwd);
  $('back').addEventListener('click', stepBack);
  $('toEnd').addEventListener('click', function () { stopPlay(); if (state.k < n()) { state.k = n() - 1; advance('end'); } else finish('end'); });
  $('reset').addEventListener('click', function () { stopPlay(); state.k = 0; state.atEnd = false; state.logged = false; state.anim = null; say(T('回到第 0 步：記憶體是空的。', 'Back to step 0: memory is empty.')); updateStep(); });
  $('clear').addEventListener('click', function () {
    stopPlay(); state.log = []; state.ran = {}; state.k = 0; state.atEnd = false; state.logged = false; state.anim = null;
    renderLog(); dirty3 = true;
    say(T('紀錄與圖上跑過的點都清除了，回到第 0 步。', 'Records and the points you ran are cleared; back to step 0.'));
    updateStep();
  });
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
  // 歷程表要看的方法
  const tabBtns = Array.prototype.slice.call(document.querySelectorAll('#tabs button'));
  tabBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      state.focus = b.getAttribute('data-algo');
      tabBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      dirty2 = true; updateReadouts(); requestDraw();
    });
  });
  // 點圖換框數
  cv3.addEventListener('click', function (ev) {
    const M = layout3(), rect = cv3.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const f = Math.round((x - M.x0) / ((M.x1 - M.x0) / 7) + 0.5);
    if (f >= 1 && f <= 7) { if (window.LabNum) window.LabNum.set(elFrames, f); else elFrames.value = f; setFrames(f); }
  });

  // =====================================================================
  // 讀數與表格
  // =====================================================================
  let eqKey = '';
  function setEq(tex) {
    if (tex === eqKey) return;
    eqKey = tex;
    const el = $('rEq');
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function updateReadouts() {
    const k = state.k, N = n();
    const rows = [
      [T('目前的步數', 'Current step'), k + ' <small>/ ' + N + '</small>'],
      [T('這一步用到的頁', 'Page used in this step'), k > 0 ? String(state.refs[k - 1]) : '—'],
      [T('不同的頁（缺頁的下限）', 'Different pages (least possible faults)'), String(K.distinct(state.refs))]
    ];
    $('ro').innerHTML = rows.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('');
    let best = Infinity;
    ALGOS.forEach(function (a) { const st = stepOf(a, k); best = Math.min(best, st ? st.faults : 0); });
    let h = '<thead><tr><th>' + T('方法', 'Algorithm') + '</th><th>' + T('缺頁', 'Faults') + '</th><th>' + T('命中', 'Hits') + '</th><th>' + T('命中率', 'Hit ratio') + '</th></tr></thead><tbody>';
    ALGOS.forEach(function (a) {
      const st = stepOf(a, k), f = st ? st.faults : 0;
      h += '<tr><td><span class="chip" style="background:var(--pr-' + a + ')"></span>' + NAME[a] + '</td><td' + (k && f === best ? ' class="best"' : '') + '>' + f + '</td><td>' + (k - f) + '</td><td>' + (k ? fmt(100 * (k - f) / k, 1) + '%' : '—') + '</td></tr>';
    });
    $('sumTable').innerHTML = h + '</tbody>';
    const a = state.focus, st = stepOf(a, k), hits = st ? k - st.faults : 0;
    if (k > 0) setEq('\\begin{aligned} \\text{' + T('命中率', 'hit ratio') + '}_{\\text{' + NAME[a] + '}} &= \\frac{' + T('\\text{命中}', '\\text{hits}') + '}{' + T('\\text{參考}', '\\text{references}') + '} \\\\ &= \\frac{' + hits + '}{' + k + '} \\approx ' + fmt(100 * hits / k, 1) + '\\% \\end{aligned}');
    else setEq('\\text{' + T('命中率', 'hit ratio') + '} = \\frac{' + T('\\text{命中}', '\\text{hits}') + '}{' + T('\\text{參考}', '\\text{references}') + '}');
    $('eqNote').textContent = T('缺頁率 = 1 − 命中率。上面的式子是歷程表選的方法（' + NAME[a] + '），算到目前這一步。', 'Fault rate = 1 − hit ratio. The formula is for the algorithm chosen for the history table (' + NAME[a] + '), up to the current step.');
  }
  function shortStr(refs) { return refs.length > 12 ? refs.slice(0, 12).join(' ') + ' …' : refs.join(' '); }
  function addLog() {
    const R = state.res;
    const key = state.refs.join(',') + '|' + state.frames + '|' + state.lfuKeep;
    const last = state.log[state.log.length - 1];
    if (last && last.key === key) return;
    state.log.push({ key: key, str: shortStr(state.refs), n: n(), f: state.frames, keep: state.lfuKeep, fifo: R.fifo.faults, lru: R.lru.faults, lfu: R.lfu.faults, opt: R.opt.faults });
    if (state.log.length > 40) state.log.shift();
    renderLog();
  }
  function renderLog() {
    const tb = $('logTable');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { tb.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('參考字串', 'Reference string') + '</th><th>' + T('框', 'Frames') + '</th><th>FIFO</th><th>LRU</th><th>LFU</th><th>OPT</th></tr></thead><tbody>';
    state.log.slice().reverse().forEach(function (x, k) {
      const m = Math.min(x.fifo, x.lru, x.lfu, x.opt);
      const c = function (v) { return '<td' + (v === m ? ' class="best"' : '') + '>' + v + '</td>'; };
      h += '<tr><td>' + (state.log.length - k) + '</td><td class="str">' + x.str + '</td><td>' + x.f + '</td>' + c(x.fifo) + c(x.lru) + '<td' + (x.lfu === m ? ' class="best"' : '') + '>' + x.lfu + (x.keep ? '*' : '') + '</td>' + c(x.opt) + '</tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }
  function updateStep() {
    updateReadouts();
    dirty2 = true;
    requestDraw();
  }
  function updateAll() {
    dirty2 = dirty3 = true;
    updateStep();
  }

  // ---------- 鍵盤（畫布上左右鍵 = 上一步／單步） ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('分頁置換畫布。方向鍵右：處理下一頁；方向鍵左：回到上一步。', 'Page-replacement canvas. Right arrow: handle the next page; left arrow: go back one step.'),
      items: [{
        name: function () { return T('步數', 'Step'); },
        move: function (dx) { if (dx > 0) stepFwd(); else if (dx < 0) stepBack(); else return false; return true; },
        describe: function () { return T('第 ' + state.k + ' 步。', 'Step ' + state.k + '. ') + ($('status').textContent || ''); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // 給測試用的介面（不影響畫面；不要叫 __pt）
  window.PageReplLab = {
    state: state,
    setRefs: function (s) { elRefs.value = Array.isArray(s) ? s.join(' ') : String(s); applyText(); },
    setFrames: function (f) { if (window.LabNum) window.LabNum.set(elFrames, f); else elFrames.value = f; setFrames(f); },
    setKeep: function (b) { $('keep').checked = !!b; $('keep').dispatchEvent(new Event('change')); },
    reverse: function () { $('rev').click(); },
    toEnd: function () { $('toEnd').click(); },
    stepTo: function (k) { stopPlay(); state.k = Math.max(0, Math.min(k, n())); state.atEnd = false; state.anim = null; say(describe(state.k)); updateStep(); },
    focus: function (a) { const b = tabBtns.find(function (x) { return x.getAttribute('data-algo') === a; }); if (b) b.click(); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  state.len = Math.round(val(elLen)); $('leno').textContent = String(state.len);
  state.kinds = Math.round(val(elKinds)); $('kindso').textContent = String(state.kinds);
  state.frames = Math.round(val(elFrames)); $('frameso').textContent = String(state.frames);
  state.speed = val(elSpeed); $('speedo').textContent = fmt(state.speed, 1);
  state.lfuKeep = $('keep').checked;
  elRefs.value = K.format(state.refs);
  recompute();
  updateSeed();
  renderLog();
  updateAll();
  updateSoundButton();
  setPlayLabel();
  say(T('按「播放」或「單步」，看四種方法一頁一頁處理參考字串。', 'Press “Play” or “Step” to watch the four algorithms handle the reference string page by page.'));
  function themeChanged() { readColors(); dirty2 = dirty3 = true; requestDraw(); }
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', themeChanged);
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', function () { updateSeed(); renderLog(); updateAll(); say(describe(state.k)); setPlayLabel(); updateSoundButton(); });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2 || cv3.clientWidth !== cw3) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  }
  resize();
})();
