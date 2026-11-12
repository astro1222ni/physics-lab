/* sorting.js — 「排序演算法比較」的畫面與互動（演算法與計數在 sorting-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 單一演算法：核心先把整個排序跑完、記成步驟清單，畫面照清單一步一步重播（上一步 = 從頭重播到前一步）。
 * 五種一起比：同一份資料五個小畫面，每一步每種演算法各做一個基本操作（比較、交換或寫入），先跑完的基本操作最少。
 * 任務事件（使用者按了單步、播放或直接跑完，跑到最後一步時才送出）：'finish'（單一演算法）、'race'（五種一起比）。
 */
(function () {
  'use strict';
  const S = window.SortingCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade, mix = D.mix;

  const ALGOS = S.ALGOS;
  const NAME = {
    bubble: ['泡沫排序', 'Bubble sort'], selection: ['選擇排序', 'Selection sort'], insertion: ['插入排序', 'Insertion sort'],
    merge: ['合併排序', 'Merge sort'], quick: ['快速排序', 'Quicksort']
  };
  const SHORT = { bubble: ['泡沫', 'Bubble'], selection: ['選擇', 'Selection'], insertion: ['插入', 'Insertion'], merge: ['合併', 'Merge'], quick: ['快速', 'Quick'] };
  const SHAPE_NAME = {
    random: ['亂序', 'random'], nearly: ['幾乎排好', 'nearly sorted'], reversed: ['反序', 'reversed'],
    few: ['很多重複', 'many duplicates'], sorted: ['已排好', 'sorted'], custom: ['自訂', 'custom']
  };
  const MK = { bubble: '●', selection: '■', insertion: '▲', merge: '◆', quick: '✕' };
  const ACOL = { bubble: 'so-bub', selection: 'so-sel', insertion: 'so-ins', merge: 'so-mer', quick: 'so-qui' };
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function nm(a) { return T(NAME[a][0], NAME[a][1]); }
  function sn(a) { return T(SHORT[a][0], SHORT[a][1]); }
  function shapeName(s) { return T(SHAPE_NAME[s][0], SHAPE_NAME[s][1]); }

  // ---------- 狀態 ----------
  const state = {
    mode: 'single', n: 24, shape: 'random', seed: 1, custom: [5, 2, 8, 2, 9, 1, 7, 3],
    algo: 'bubble', median3: false, ties: true, rate: 8,
    values: [], vmin: 1, vmax: 1, rank: [], mult: [],
    res: null, st: null, finished: false,
    race: null,
    playing: false, acc: 0,
    chart: [], lastPt: null,
    sweep: -1, fx: []
  };

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface',
      'so-bar', 'so-cmp', 'so-swap', 'so-done', 'so-pivot', 'so-write', 'so-aux', 'so-bub', 'so-sel', 'so-ins', 'so-mer', 'so-qui']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  const fmtInt = S.fmtInt;

  // ---------- 資料 ----------
  function makeValues() {
    if (state.shape === 'custom') return state.custom.slice();
    return S.makeData(state.n, state.shape, state.seed);
  }
  /** 相同值的原本順序：rank[id] = 這個值第幾次出現（0 起），mult[id] = 這個值一共幾個 */
  function analyse() {
    const v = state.values, seen = {}, tot = {};
    v.forEach(function (x) { tot[x] = (tot[x] || 0) + 1; });
    state.rank = v.map(function (x) { const r = seen[x] || 0; seen[x] = r + 1; return r; });
    state.mult = v.map(function (x) { return tot[x]; });
    state.vmin = Math.min.apply(null, v);
    state.vmax = Math.max.apply(null, v);
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let dpr = 1, cw = 600, ch = 380, cw2 = 600, ch2 = 220, L = null;
  function layout() {
    const narrow = cw < 560;
    const n = state.values.length;
    if (state.mode === 'race') {
      const cols = cw >= 620 ? 2 : 1, gap = 8;
      const pw = (cw - 16 - gap * (cols - 1)) / cols;
      const ph = cols === 2 ? 150 : 116;
      const rows = Math.ceil(6 / cols) - (cols === 1 ? 1 : 0);   // 一欄時五格，兩欄時六格（第六格放說明）
      return { race: true, narrow: narrow, cols: cols, gap: gap, pw: pw, ph: ph, H: 8 + rows * ph + (rows - 1) * gap + 8 };
    }
    const padL = narrow ? 30 : 40, padR = narrow ? 10 : 16;
    const left = padL, right = cw - padR, bw = (right - left) / Math.max(1, n);
    const hudH = 34, markH = 22;
    const barsTop = hudH + markH;
    const barsH = narrow ? 168 : 212;
    const base = barsTop + barsH;
    const idxH = 16, ptrH = 22;
    const isMerge = state.algo === 'merge';
    const auxTop = base + idxH + ptrH + 30;   // 留空間給區段括號與「暫存區」標題，不重疊
    const auxH = isMerge ? (narrow ? 64 : 82) : 0;
    const H = isMerge ? auxTop + auxH + 30 : base + idxH + ptrH + 12;
    return { race: false, narrow: narrow, left: left, right: right, bw: bw, hudH: hudH, barsTop: barsTop, barsH: barsH, base: base,
      idxY: base + 4, ptrY: base + idxH + 4, auxTop: auxTop, auxH: auxH, H: Math.round(H) };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    ch2 = cw2 < 560 ? 210 : 240;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr);
    cv2.height = Math.round(ch2 * dpr);
    chartDirty = true;
    requestDraw();
  }

  // =====================================================================
  // 建立排序（資料或演算法改變時）
  // =====================================================================
  function rebuild() {
    stopPlay();
    state.values = makeValues();
    analyse();
    state.finished = false;
    state.sweep = -1; state.fx = [];
    if (state.mode === 'single') {
      state.res = S.run(state.algo, state.values, { median3: state.median3 });
      state.st = S.playState(state.res);
      state.race = null;
    } else {
      state.res = null; state.st = null;
      state.race = { list: ALGOS.map(function (a) {
        const r = S.run(a, state.values, { median3: state.median3 });
        return { algo: a, res: r, st: S.playState(r), place: 0, doneTick: -1 };
      }), tick: 0, places: 0, done: false };
    }
    if (L) resize();
    lastOp = null;
    updateAll();
    say(startText());
  }
  function restart() {
    stopPlay();
    state.finished = false;
    state.sweep = -1; state.fx = [];
    if (state.mode === 'single') state.st = S.playState(state.res);
    else state.race.list.forEach(function (r) { r.st = S.playState(r.res); r.place = 0; r.doneTick = -1; }), state.race.tick = 0, state.race.places = 0, state.race.done = false;
    lastOp = null;
    updateAll();
    say(startText());
  }
  function atEnd() {
    if (state.mode === 'single') return state.st.k >= state.res.steps;
    return state.race.done;
  }

  // =====================================================================
  // 前進、後退
  // =====================================================================
  let lastOp = null;
  /** 前進 count 步（使用者按單步、播放或直接跑完） */
  function advance(count) {
    if (state.mode === 'single') {
      const st = state.st;
      if (st.k >= state.res.steps) return;
      let op = null;
      for (let i = 0; i < count && st.k < state.res.steps; i++) op = S.stepForward(st) || op;
      if (op) { lastOp = op; stepSound(op, st, state.values); if (!reducedMotion && count <= 2) addFx(op); }
      if (st.k >= state.res.steps) finishSingle();
      else sayStep(op);
    } else {
      const R = state.race;
      if (R.done) return;
      for (let i = 0; i < count && !R.done; i++) {
        R.tick++;
        let finishedNow = [];
        R.list.forEach(function (r) {
          if (r.st.k >= r.res.steps) return;
          S.stepForward(r.st);
          if (r.st.k >= r.res.steps) finishedNow.push(r);
        });
        if (finishedNow.length) {
          const place = R.places + 1;
          finishedNow.forEach(function (r) { r.place = place; r.doneTick = R.tick; });
          R.places += finishedNow.length;
          raceDoneSound(place);
        }
        // 已排好、只有 n − 1 步的演算法：零步的不存在（n ≥ 2），所以每個都有名次
        if (R.list.every(function (r) { return r.st.k >= r.res.steps; })) { R.done = true; finishRace(); }
      }
      if (!R.done) raceTick();
    }
    updateAll();
    requestDraw();
  }
  function back() {
    if (state.mode !== 'single') return false;
    const st = state.st;
    if (st.k <= 0) return false;
    stopPlay();
    state.st = S.seek(state.res, st.k - 1);
    state.finished = false;
    state.sweep = -1;
    lastOp = lastBasic(state.st);
    sayStep(lastOp);
    updateAll();
    requestDraw();
    return true;
  }
  /** 播放狀態的最後一個基本操作（後退後要重新描述它） */
  function lastBasic(st) {
    const ops = st.res.ops;
    for (let p = st.p - 1; p >= 0; p--) if (S.isBasic(ops[p])) return ops[p];
    return null;
  }
  function toEnd() {
    stopPlay();
    if (atEnd()) return;
    if (state.mode === 'single') advance(state.res.steps);
    else advance(1e6);
  }

  // ---------- 完成 ----------
  function finishSingle() {
    if (state.finished) return;
    state.finished = true;
    stopPlay();
    const r = state.res;
    addPoint(state.algo, r.n, r.comps);
    state.sweep = reducedMotion ? -1 : 0;
    doneSound(state.values);
    let msg = T('排好了！共 ', 'Sorted! ') + fmtInt(r.steps) + T(' 步：比較 ', ' steps: ') + fmtInt(r.comps) + T(' 次', ' comparisons') +
      (state.algo === 'merge' ? T('、寫入 ', ', ') + fmtInt(r.writes) + T(' 次', ' writes') : T('、交換 ', ', ') + fmtInt(r.swaps) + T(' 次', ' swaps')) + T('。', '.');
    if (r.hasDup) msg += r.stable ? T('相同的值都保持原本的順序。', ' Equal values kept their order.') : T('有 ', ' ') + r.broken + T(' 對相同的值被打亂了順序。', (r.broken === 1 ? ' pair' : ' pairs') + ' of equal values swapped order.');
    say(msg);
    emitFinish();
  }
  function finishRace() {
    stopPlay();
    const R = state.race;
    R.list.forEach(function (r) { addPoint(r.algo, r.res.n, r.res.comps); });
    renderRaceTable();
    const first = R.list.filter(function (r) { return r.place === 1; }).map(function (r) { return nm(r.algo); });
    say(T('全部跑完！最先完成：', 'All done! First to finish: ') + first.join(T('、', ', ')) + T('（基本操作最少）。', ' (fewest basic operations).'));
    emitRace();
  }

  // =====================================================================
  // 播放迴圈
  // =====================================================================
  let raf = 0, lastT = 0, chartDirty = true;
  function frame(now) {
    raf = 0;
    now = now || performance.now();
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    if (state.playing) {
      state.acc += dt * state.rate;
      const k = Math.floor(state.acc);
      if (k > 0) { state.acc -= k; advance(k); }
    }
    if (state.sweep >= 0) { state.sweep += dt / 0.8; if (state.sweep > 1.2) state.sweep = -1; }
    for (let i = state.fx.length - 1; i >= 0; i--) { state.fx[i].t += dt; if (state.fx[i].t > 0.35) state.fx.splice(i, 1); }
    draw();
    if (chartDirty) { drawChart(); chartDirty = false; }
    if (state.playing || state.sweep >= 0 || state.fx.length) requestDraw(); else lastT = 0;
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function setPlaying(on) {
    state.playing = on;
    state.acc = on ? 1 : 0;   // 按下播放立刻走第一步
    const b = $('play');
    b.textContent = on ? T('暫停', 'Pause') : T('播放', 'Play');
    b.setAttribute('aria-pressed', String(on));
    $('status').setAttribute('aria-live', on ? 'off' : 'polite');
    if (on) requestDraw();
  }
  function stopPlay() { if (state.playing) setPlaying(false); }

  // =====================================================================
  // 繪圖：單一演算法
  // =====================================================================
  function stateColor(st, p) {
    const hl = st.hl;
    if (hl) {
      if (hl.t === 'swap' && (p === hl.i || p === hl.j)) return C['so-swap'];
      if (hl.t === 'cmp' && !hl.aux && (p === hl.i || p === hl.j)) return C['so-cmp'];
      if (hl.t === 'write' && p === hl.k) return C['so-write'];
    }
    if (st.pivot === p) return C['so-pivot'];
    if (st.min === p && !st.done[p]) return C['so-pivot'];
    if (st.done[p]) return C['so-done'];
    return null;
  }
  /** 相同值的深淺：第一個最淺、最後一個最深 */
  function tieShade(color, id) {
    if (!state.ties || state.mult[id] < 2) return color;
    const m = state.mult[id], r = state.rank[id];
    return shade(color, 0.32 - 0.62 * r / (m - 1));
  }
  function barH(v, H) { return Math.max(4, (v / Math.max(1, state.vmax)) * H); }
  /** 一根有立體感的長條：左亮右暗、頂端高光 */
  function bar(c, x, y, w, h, color, faded) {
    const r = Math.min(3.5, w / 3, h / 2);
    c.save();
    if (faded) c.globalAlpha = 0.42;
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(color, 0.24));
    g.addColorStop(0.42, color);
    g.addColorStop(1, shade(color, -0.24));
    c.fillStyle = g;
    D.roundRect(c, x, y, w, h, r);
    c.fill();
    if (w >= 4 && h >= 4) {
      c.fillStyle = alpha('#ffffff', D.dark ? 0.22 : 0.4);
      D.roundRect(c, x + 0.5, y + 0.5, w - 1, Math.min(2, h - 1), r);
      c.fill();
    }
    c.restore();
  }
  function tri(c, x, y, s, color) {   // 向下的小三角形（比較）
    c.save();
    c.fillStyle = color; c.strokeStyle = alpha(C['canvas-bg'], 0.9); c.lineWidth = 1.5; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x - s, y - s * 0.9); c.lineTo(x + s, y - s * 0.9); c.lineTo(x, y + s * 0.6); c.closePath();
    c.stroke(); c.fill();
    c.restore();
  }
  function diamond(c, x, y, s, color) {
    c.save();
    c.fillStyle = color; c.strokeStyle = alpha(C['canvas-bg'], 0.9); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.8, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.8, y); c.closePath();
    c.stroke(); c.fill();
    c.restore();
  }
  function swapArc(c, x0, x1, y, color) {   // 交換：兩根長條之間往上拱的雙向箭頭
    const h = Math.min(16, 6 + Math.abs(x1 - x0) * 0.18);
    c.save();
    c.strokeStyle = color; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo((x0 + x1) / 2, y - h * 2, x1, y); c.stroke();
    const head = function (x, dir) {
      c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x - 4 * dir, y - 6); c.lineTo(x + 3 * dir, y - 5.5); c.closePath(); c.fillStyle = color; c.fill();
    };
    head(x0, x1 > x0 ? 1 : -1); head(x1, x1 > x0 ? -1 : 1);
    c.restore();
  }
  function downArrow(c, x, y0, y1, color) {
    D.arrow(c, x, y0, x, y1, color, 2);
  }
  function hudPill(c, text, x, yb, color, align, narrow) {
    return D.pill(c, text, x, yb, color, align, fnt(narrow ? 11 : 12, 650));
  }

  function drawSingle() {
    const st = state.st, res = state.res, vals = state.values, n = vals.length;
    const bw = L.bw, gapw = Math.max(1, Math.min(4, bw * 0.18)), w = Math.max(1.5, bw - gapw);
    const X = function (p) { return L.left + p * bw + gapw / 2; };
    const XC = function (p) { return L.left + (p + 0.5) * bw; };
    D.backdrop(ctx, cw, ch);
    // 值的格線與刻度
    ctx.save();
    ctx.font = fnt(L.narrow ? 10 : 11, 500);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const vmax = Math.max(1, state.vmax);
    const ticks = [0, Math.round(vmax / 2), vmax];
    ticks.forEach(function (tv, i) {
      const y = Math.round(L.base - (tv / vmax) * L.barsH) + 0.5;
      ctx.strokeStyle = alpha(C.text, i === 0 ? 0.32 : 0.08); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.left - 3, y); ctx.lineTo(L.right, y); ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillText(String(tv), L.left - 6, y);
    });
    ctx.restore();
    // 處理中的區段（合併、快速）：淡色底帶與底部括號
    const rg = st.range;
    if (rg) {
      ctx.save();
      ctx.fillStyle = alpha(state.algo === 'merge' ? C['so-write'] : C['so-pivot'], D.dark ? 0.09 : 0.06);
      D.roundRect(ctx, L.left + rg.lo * bw, L.barsTop - 6, (rg.hi - rg.lo + 1) * bw, L.barsH + 6, 6);
      ctx.fill();
      ctx.restore();
    }
    // 泡沫排序：這一輪會掃到哪裡
    if (state.algo === 'bubble' && st.pass >= 0 && !atEnd()) {
      ctx.save();
      ctx.strokeStyle = alpha(C['so-done'], 0.55); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
      const x = L.left + (st.passHi + 1) * bw;
      ctx.beginPath(); ctx.moveTo(x, L.barsTop - 4); ctx.lineTo(x, L.base); ctx.stroke();
      ctx.restore();
    }
    // 插入排序：左邊已經相對排好的部分
    if (state.algo === 'insertion' && st.sortedTo >= 0 && !atEnd()) {
      ctx.save();
      ctx.fillStyle = alpha(C['so-done'], D.dark ? 0.07 : 0.05);
      D.roundRect(ctx, L.left, L.barsTop - 6, (st.sortedTo + 1) * bw, L.barsH + 6, 6);
      ctx.fill();
      ctx.restore();
    }
    // 長條
    const ties = state.ties && res.hasDup;
    const showVal = bw >= 17;
    for (let p = 0; p < n; p++) {
      const id = st.arr[p], v = vals[id];
      const h = barH(v, L.barsH), x = X(p), y = L.base - h;
      let col = stateColor(st, p) || C['so-bar'];
      if (!stateColor(st, p) && state.algo === 'insertion' && st.sortedTo >= p && !atEnd()) col = mix(C['so-bar'], C['so-done'], 0.25);
      col = tieShade(col, id);
      const faded = rg && (p < rg.lo || p > rg.hi) && !st.done[p];
      bar(ctx, x, y, w, h, col, faded);
      if (showVal && h >= 18) {
        ctx.save();
        ctx.font = fnt(bw >= 26 ? 12 : 10.5, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = inkOn(col, faded);
        ctx.fillText(String(v), XC(p), y + 3);
        ctx.restore();
      }
      if (ties && state.mult[id] >= 2 && state.rank[id] < 26 && bw >= 11) {
        const letter = LETTERS[state.rank[id]];
        const fz = bw >= 22 ? 11 : 9.5;
        if (h >= fz + 8 + (showVal && h >= 18 ? 14 : 0)) {
          ctx.save(); if (faded) ctx.globalAlpha = 0.5;
          ctx.font = fnt(fz, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillStyle = alpha('#ffffff', 0.92);
          ctx.fillText(letter, XC(p), L.base - 3);
          ctx.restore();
        } else D.haloText(ctx, letter, XC(p), y - 3, C.text, 'center', 'bottom', fnt(fz, 700));
      }
    }
    // 底線與就位圓點
    ctx.save();
    ctx.strokeStyle = alpha(C.text, 0.45); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(L.left - 3, L.base + 0.5); ctx.lineTo(L.right, L.base + 0.5); ctx.stroke();
    ctx.restore();
    // 完成掃描：從左到右亮一遍
    if (state.sweep >= 0) {
      const sx = L.left + state.sweep * (L.right - L.left);
      ctx.save();
      const g = ctx.createLinearGradient(sx - 50, 0, sx + 10, 0);
      g.addColorStop(0, alpha('#ffffff', 0)); g.addColorStop(0.8, alpha('#ffffff', D.dark ? 0.22 : 0.45)); g.addColorStop(1, alpha('#ffffff', 0));
      ctx.fillStyle = g;
      ctx.fillRect(sx - 50, L.barsTop - 4, 60, L.barsH + 4);
      ctx.restore();
    }
    // 索引與指標
    const showIdx = bw >= 13 ? 1 : bw >= 7 ? 4 : 8;
    ctx.save();
    ctx.font = fnt(L.narrow ? 9.5 : 10.5, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = alpha(C.muted, 0.85);
    for (let p = 0; p < n; p++) if (p % showIdx === 0 || p === n - 1) ctx.fillText(String(p), XC(p), L.idxY);
    ctx.restore();
    for (let p = 0; p < n; p++) if (st.done[p]) {
      ctx.save(); ctx.fillStyle = C['so-done'];
      ctx.beginPath(); ctx.arc(XC(p), L.base - 0.5, Math.min(2.6, bw * 0.22), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    drawPointers(st, XC);
    // 區段括號（合併、快速）
    if (rg) {
      const y = L.ptrY + 17, x0 = L.left + rg.lo * bw + 2, x1 = L.left + (rg.hi + 1) * bw - 2;
      ctx.save();
      ctx.strokeStyle = alpha(state.algo === 'merge' ? C['so-write'] : C['so-pivot'], 0.75); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y - 4); ctx.lineTo(x0, y); ctx.lineTo(x1, y); ctx.lineTo(x1, y - 4); ctx.stroke();
      if (state.algo === 'merge' && rg.mid != null) { const xm = L.left + (rg.mid + 1) * bw; ctx.beginPath(); ctx.moveTo(xm, y - 5); ctx.lineTo(xm, y + 2); ctx.stroke(); }
      ctx.restore();
    }
    // 合併排序的暫存區
    if (state.algo === 'merge') drawAux(st, X, XC, w);
    // 上方的記號列：比較 ▼、交換 ⇄、樞紐 ◆、寫回 ↓
    const my = L.barsTop - 10;
    const hl = st.hl;
    if (st.med3) st.med3.forEach(function (p) { ctx.save(); ctx.fillStyle = alpha(C['so-pivot'], 0.5); ctx.beginPath(); ctx.arc(XC(p), my, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
    if (hl) {
      if (hl.t === 'cmp' && !hl.aux) { tri(ctx, XC(hl.i), my, 6, C['so-cmp']); tri(ctx, XC(hl.j), my, 6, C['so-cmp']); }
      else if (hl.t === 'swap') swapArc(ctx, XC(hl.i), XC(hl.j), my + 4, C['so-swap']);
      else if (hl.t === 'write') downArrow(ctx, XC(hl.k), my - 8, my + 6, C['so-write']);
    }
    // 樞紐／目前最小值 ◆ 畫在比較 ▼ 上面；同一根長條同時被比較時，縮小放進三角形裡，兩個記號都看得到
    const onCmp = function (p) { return hl && hl.t === 'cmp' && !hl.aux && (p === hl.i || p === hl.j); };
    const dia = function (p) { if (onCmp(p)) diamond(ctx, XC(p), my - 2.5, 3.6, C['so-pivot']); else diamond(ctx, XC(p), my, 6, C['so-pivot']); };
    if (st.pivot >= 0) dia(st.pivot);
    if (state.algo === 'selection' && st.min >= 0 && !atEnd() && !(hl && hl.t === 'swap')) dia(st.min);
    // 事件閃光
    state.fx.forEach(function (f) {
      f.ps.forEach(function (p) {
        if (p < 0 || p >= n) return;
        const h = barH(vals[st.arr[p]], L.barsH);
        D.ripple(ctx, XC(p), L.base - h, Math.max(4, w * 0.5), f.t / 0.35, f.color);
      });
    });
    // HUD：演算法名與計數
    const nar = L.narrow;
    let hx = hudPill(ctx, MK[state.algo] + ' ' + nm(state.algo) + (state.algo === 'quick' && state.median3 ? T('（三數取中）', ' (median of 3)') : ''), 8, 26, C[ACOL[state.algo]], 'left', nar);
    if (state.algo === 'bubble' && st.pass >= 0 && !atEnd()) hudPill(ctx, T('第 ' + (st.pass + 1) + ' 輪', 'Pass ' + (st.pass + 1)), hx.x + hx.w + 6, 26, C.muted, 'left', nar);
    const cnt = counts(state.algo, st);
    hudPill(ctx, cnt, cw - 8, 26, C.text, 'right', nar);
  }
  /** 指標列：i、j、k、key 等小標 */
  /** 畫面右上角的計數：比較 43・交換 32／43 comparisons · 32 swaps（合併排序是寫入） */
  function counts(algo, st, short) {
    const en = function (k, w) { return fmtInt(k) + ' ' + w + (k === 1 ? '' : 's'); };
    const ec = short ? fmtInt(st.c) + ' comp.' : en(st.c, 'comparison');
    if (algo === 'merge') return T('比較 ' + fmtInt(st.c) + '・寫入 ' + fmtInt(st.w), ec + ' · ' + en(st.w, 'write'));
    return T('比較 ' + fmtInt(st.c) + '・交換 ' + fmtInt(st.s), ec + ' · ' + en(st.s, 'swap'));
  }
  /** 長條上的字：亮的顏色用深字，暗的顏色用白字 */
  function inkOn(col, faded) {
    // 淡掉的長條（透明度 0.42）實際看到的是它和畫布底色的混色
    const c = D.rgb(faded ? mix(C['canvas-bg'], col, 0.42) : col), lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    const a = faded ? 0.7 : 0.92;
    return lum > 0.6 ? 'rgba(15,23,42,' + a + ')' : 'rgba(255,255,255,' + a + ')';
  }
  function drawPointers(st, XC) {
    const y = L.ptrY, f = fnt(L.narrow ? 10.5 : 11.5, 700), n = state.values.length;
    const put = function (p, label, color) {
      if (p < -1 || p > n) return;
      const x = p < 0 ? L.left - 8 : XC(p);
      D.haloText(ctx, '↑' + label, x, y, color, 'center', 'top', f);
    };
    if (atEnd()) return;
    const a = state.algo, hl = st.hl;
    if (a === 'selection' && st.minRow >= 0) put(st.minRow, 'i', C.text);
    if (a === 'insertion' && st.key >= 0) put(st.key, 'key', C['so-cmp']);
    if (a === 'bubble' && hl && hl.t !== 'write') put(Math.min(hl.i, hl.j), 'j', C.text);
    if (a === 'quick' && st.ptr && st.pivot >= 0) {
      put(st.ptr.i, 'i', C['so-pivot']);
      if (st.ptr.j !== st.ptr.i) put(st.ptr.j, 'j', C.text);
    }
    if (a === 'merge' && st.ptr && st.copy && st.ptr.k != null) put(st.ptr.k, 'k', C['so-write']);
  }
  /** 合併排序的暫存區：複製過來的那一段，已經寫回的淡掉 */
  function drawAux(st, X, XC, w) {
    const top = L.auxTop, H = L.auxH, base = top + H;
    ctx.save();
    ctx.fillStyle = alpha(C['so-aux'], D.dark ? 0.1 : 0.08);
    D.roundRect(ctx, L.left - 4, top - 4, L.right - L.left + 8, H + 26, 8);
    ctx.fill();
    ctx.restore();
    D.haloText(ctx, T('暫存區', 'Buffer'), L.left, top - 6, C.muted, 'left', 'bottom', fnt(L.narrow ? 10.5 : 11.5, 600));
    const cp = st.copy;
    if (!cp || !st.aux) {
      D.haloText(ctx, T('（合併時，把兩半複製到這裡，再一個個寫回上面）', '(when merging, the two halves are copied here and written back one by one)'),
        (L.left + L.right) / 2, top + H / 2, alpha(C.muted, 0.9), 'center', 'middle', fnt(L.narrow ? 10 : 11, 500));
      return;
    }
    const hl = st.hl, ptr = st.ptr || {};
    for (let p = cp.lo; p <= cp.hi; p++) {
      const id = st.aux[p], v = state.values[id];
      const h = Math.max(3, (v / Math.max(1, state.vmax)) * (H - 4));
      const used = p <= cp.mid ? p < ptr.i : p < ptr.j;
      let col = C['so-aux'];
      if (hl && hl.t === 'cmp' && hl.aux && (p === hl.i || p === hl.j)) col = C['so-cmp'];
      if (hl && hl.t === 'write' && p === hl.from) col = C['so-write'];
      col = tieShade(col, id);
      const dim = used && !(hl && hl.t === 'write' && p === hl.from);
      bar(ctx, X(p), base - h, w, h, col, dim);
      if (L.bw >= 17 && h >= 18) {
        ctx.save();
        ctx.font = fnt(L.bw >= 26 ? 12 : 10.5, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = inkOn(col, dim);
        ctx.fillText(String(v), XC(p), base - h + 3);
        ctx.restore();
      }
    }
    // 左右兩半的分界
    const xm = L.left + (cp.mid + 1) * L.bw;
    ctx.save();
    ctx.strokeStyle = alpha(C.text, 0.35); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xm, top); ctx.lineTo(xm, base + 2); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = alpha(C.text, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.left + cp.lo * L.bw, base + 0.5); ctx.lineTo(L.left + (cp.hi + 1) * L.bw, base + 0.5); ctx.stroke();
    ctx.restore();
    const f = fnt(L.narrow ? 10.5 : 11.5, 700);
    if (ptr.i != null && ptr.i <= cp.mid) D.haloText(ctx, '↑i', XC(ptr.i), base + 3, C.text, 'center', 'top', f);
    if (ptr.j != null && ptr.j <= cp.hi) D.haloText(ctx, '↑j', XC(ptr.j), base + 3, C.text, 'center', 'top', f);
    // 寫回：從暫存區畫一條箭頭到上面的位置 k
    if (hl && hl.t === 'write') {
      // 起點：暫存區那根長條的頂端；終點：上面「↑k」的正下方（不穿過索引數字）
      const x0 = XC(hl.from), x1 = XC(hl.k);
      const v0 = state.values[st.aux[hl.from]], h0 = Math.max(3, (v0 / Math.max(1, state.vmax)) * (H - 4));
      const y0 = base - h0 - 4, y1 = L.ptrY + (L.narrow ? 15 : 16), dy = y0 - y1;
      ctx.save();
      ctx.strokeStyle = alpha(C['so-write'], 0.85); ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0, y0 - dy * 0.55, x1, y1 + dy * 0.45, x1, y1 + 5); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = alpha(C['so-write'], 0.95);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 4, y1 + 7); ctx.lineTo(x1 + 4, y1 + 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // =====================================================================
  // 繪圖：五種一起比
  // =====================================================================
  function panelRect(i) {
    const col = i % L.cols, row = Math.floor(i / L.cols);
    return { x: 8 + col * (L.pw + L.gap), y: 8 + row * (L.ph + L.gap), w: L.pw, h: L.ph };
  }
  function drawRace() {
    D.backdrop(ctx, cw, ch);
    const R = state.race;
    R.list.forEach(function (r, i) { drawPanel(r, panelRect(i)); });
    if (L.cols === 2) {
      const b = panelRect(5);
      ctx.save();
      ctx.strokeStyle = alpha(C.text, 0.12); ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      D.roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 10); ctx.stroke();
      ctx.restore();
      const lines = R.done ? raceSummaryLines() : [T('每一步，五種演算法', 'In every step each algorithm'), T('各做一個基本操作', 'does one basic operation'), T('（一次比較、交換或寫入）。', '(a comparison, swap or write).'), T('第 ', 'Step ') + fmtInt(R.tick) + T(' 步', '')];
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach(function (s, k) {
        ctx.font = fnt(k === lines.length - 1 && !R.done ? 15 : 12.5, k === lines.length - 1 && !R.done ? 700 : 500);
        ctx.fillStyle = k === lines.length - 1 && !R.done ? C.text : C.muted;
        ctx.fillText(s, b.x + b.w / 2, b.y + b.h / 2 + (k - (lines.length - 1) / 2) * 21);
      });
      ctx.restore();
    }
  }
  function raceSummaryLines() {
    const R = state.race;
    const sorted = R.list.slice().sort(function (a, b) { return a.place - b.place || a.res.steps - b.res.steps; });
    return [T('名次（步數）', 'Finishing order (steps)')].concat(sorted.map(function (r) { return r.place + '. ' + sn(r.algo) + '  ' + fmtInt(r.res.steps); }));
  }
  function drawPanel(r, b) {
    const st = r.st, vals = state.values, n = vals.length, ac = C[ACOL[r.algo]];
    const done = st.k >= r.res.steps;
    ctx.save();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.45)' : alpha(C.text, 0.12); ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.fillStyle = D.dark ? alpha('#ffffff', 0.035) : alpha('#ffffff', 0.85);
    D.roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = done ? alpha(ac, 0.85) : alpha(C.text, 0.1); ctx.lineWidth = done ? 2 : 1;
    D.roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 10); ctx.stroke();
    ctx.restore();
    const nar = b.w < 330;
    const title = MK[r.algo] + ' ' + (nar ? sn(r.algo) : nm(r.algo));
    D.haloText(ctx, title, b.x + 10, b.y + 16, ac, 'left', 'middle', fnt(nar ? 12.5 : 13.5, 700));
    // 計數放不下（窄的面板、英文）就改用短寫法
    const cf = fnt(nar ? 11.5 : 12.5, 600);
    ctx.save();
    ctx.font = fnt(nar ? 12.5 : 13.5, 700); const tw = ctx.measureText(title).width;
    ctx.font = cf;
    let cnt = counts(r.algo, st);
    if (tw + ctx.measureText(cnt).width + 34 > b.w) cnt = counts(r.algo, st, true);
    ctx.restore();
    D.haloText(ctx, cnt, b.x + b.w - 10, b.y + 16, C.text, 'right', 'middle', cf);
    // 小長條圖
    const top = b.y + 30, bottom = b.y + b.h - 18, H = bottom - top;
    const left = b.x + 10, right = b.x + b.w - 10, bw = (right - left) / n;
    const gapw = Math.max(0.6, Math.min(2, bw * 0.16)), w = Math.max(1, bw - gapw);
    for (let p = 0; p < n; p++) {
      const id = st.arr[p], v = vals[id];
      const h = Math.max(2, (v / Math.max(1, state.vmax)) * H);
      let col = stateColor(st, p) || C['so-bar'];
      col = tieShade(col, id);
      bar(ctx, left + p * bw + gapw / 2, bottom - h, w, h, col, false);
    }
    ctx.save();
    ctx.strokeStyle = alpha(C.text, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, bottom + 0.5); ctx.lineTo(right, bottom + 0.5); ctx.stroke();
    ctx.restore();
    // 進度條
    const py = b.y + b.h - 10, frac = r.res.steps ? st.k / r.res.steps : 1;
    ctx.save();
    ctx.fillStyle = alpha(C.text, 0.1);
    D.roundRect(ctx, left, py - 2.5, right - left, 5, 2.5); ctx.fill();
    ctx.fillStyle = ac;
    D.roundRect(ctx, left, py - 2.5, Math.max(5, (right - left) * frac), 5, 2.5); ctx.fill();
    ctx.restore();
    if (done) D.pill(ctx, T('第 ' + r.place + ' 名', ['1st', '2nd', '3rd', '4th', '5th'][r.place - 1] || r.place + 'th') + T('・', ' · ') + fmtInt(r.res.steps) + T(' 步', ' steps'),
      b.x + b.w / 2, top + 22, r.place === 1 ? C['so-done'] : C.text, 'center', fnt(nar ? 11.5 : 12.5, 700));
  }

  function draw() {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (state.mode === 'single') drawSingle(); else drawRace();
    if (kb && kb.focused()) {
      ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      D.roundRect(ctx, 2, 2, cw - 4, ch - 4, 8); ctx.stroke(); ctx.restore();
    }
  }
  function addFx(op) {
    if (op.t === 'swap') state.fx.push({ t: 0, ps: [op.i, op.j], color: C['so-swap'] });
    else if (op.t === 'write') state.fx.push({ t: 0, ps: [op.k], color: C['so-write'] });
  }

  // =====================================================================
  // 比較次數對 n 圖
  // =====================================================================
  function addPoint(a, n, c) {
    const key = a + '|' + n + '|' + c;
    if (!state.chart.some(function (q) { return q.key === key; })) {
      state.chart.push({ key: key, a: a, n: n, c: c });
      if (state.chart.length > 400) state.chart.shift();
    }
    state.lastPt = key;
    chartDirty = true;
    requestDraw();
  }
  function marker(c, kind, x, y, s, color) {
    c.save();
    c.fillStyle = color; c.strokeStyle = alpha(C['canvas-bg'], 0.9); c.lineWidth = 1.4; c.lineJoin = 'round';
    c.beginPath();
    if (kind === 'bubble') c.arc(x, y, s, 0, Math.PI * 2);
    else if (kind === 'selection') c.rect(x - s * 0.9, y - s * 0.9, s * 1.8, s * 1.8);
    else if (kind === 'insertion') { c.moveTo(x, y - s * 1.1); c.lineTo(x + s, y + s * 0.8); c.lineTo(x - s, y + s * 0.8); c.closePath(); }
    else if (kind === 'merge') { c.moveTo(x, y - s * 1.15); c.lineTo(x + s, y); c.lineTo(x, y + s * 1.15); c.lineTo(x - s, y); c.closePath(); }
    if (kind === 'quick') {
      c.lineCap = 'round';
      c.lineWidth = 4.2; c.strokeStyle = alpha(C['canvas-bg'], 0.9);
      c.moveTo(x - s * 0.8, y - s * 0.8); c.lineTo(x + s * 0.8, y + s * 0.8); c.moveTo(x + s * 0.8, y - s * 0.8); c.lineTo(x - s * 0.8, y + s * 0.8);
      c.stroke();
      c.lineWidth = 2.2; c.strokeStyle = color; c.stroke();
    } else { c.stroke(); c.fill(); }
    c.restore();
  }
  function drawChart() {
    const w = cw2, h = ch2, narrow = w < 560;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.clearRect(0, 0, w, h);
    D.backdrop(ctx2, w, h);
    const ml = narrow ? 42 : 50, mr = 14, mt = 14, mb = 28;
    const pw = w - ml - mr, ph = h - mt - mb;
    const NMAX = 64, CMAX = S.compBounds('quick', 64, true).max; // 2,202：全部相同＋三數取中
    const X = function (n) { return ml + n / NMAX * pw; };
    const Y = function (c) { return mt + ph - c / CMAX * ph; };
    ctx2.save();
    ctx2.font = fnt(narrow ? 10 : 11, 500);
    ctx2.fillStyle = C.muted;
    ctx2.textAlign = 'center'; ctx2.textBaseline = 'top';
    for (let n = 0; n <= NMAX; n += 8) {
      const x = Math.round(X(n)) + 0.5;
      ctx2.strokeStyle = alpha(C.text, n === 0 ? 0.3 : 0.08); ctx2.lineWidth = 1;
      ctx2.beginPath(); ctx2.moveTo(x, mt); ctx2.lineTo(x, mt + ph); ctx2.stroke();
      ctx2.fillText(String(n), x, mt + ph + 5);
    }
    ctx2.textAlign = 'right'; ctx2.textBaseline = 'middle';
    for (let c = 0; c <= CMAX; c += 500) {
      const y = Math.round(Y(c)) + 0.5;
      ctx2.strokeStyle = alpha(C.text, c === 0 ? 0.3 : 0.08);
      ctx2.beginPath(); ctx2.moveTo(ml, y); ctx2.lineTo(ml + pw, y); ctx2.stroke();
      ctx2.fillText(fmtInt(c), ml - 5, y);
    }
    ctx2.textAlign = 'right'; ctx2.textBaseline = 'bottom';
    ctx2.fillText('n →', ml + pw - 2, mt + ph - 9);
    ctx2.textAlign = 'left'; ctx2.textBaseline = 'top';
    ctx2.fillText(T('比較次數', 'comparisons'), ml + 5, mt + 2);
    ctx2.restore();
    // 目前資料的 n
    const nNow = state.values.length;
    if (nNow) {
      ctx2.save();
      ctx2.strokeStyle = alpha(C.accent, 0.35); ctx2.setLineDash([2, 4]); ctx2.lineWidth = 1.2;
      ctx2.beginPath(); ctx2.moveTo(X(nNow), mt); ctx2.lineTo(X(nNow), mt + ph); ctx2.stroke();
      ctx2.restore();
    }
    // 參考曲線
    ctx2.save();
    ctx2.beginPath(); ctx2.rect(ml, mt - 2, pw, ph + 2); ctx2.clip();
    const curve = function (f, color, width, dash) {
      ctx2.strokeStyle = color; ctx2.lineWidth = width; ctx2.setLineDash(dash || []); ctx2.lineJoin = 'round';
      ctx2.beginPath();
      for (let n = 1; n <= NMAX; n++) { const x = X(n), y = Y(f(n)); if (n === 1) ctx2.moveTo(x, y); else ctx2.lineTo(x, y); }
      ctx2.stroke();
    };
    curve(function (n) { return S.half(n); }, alpha(C.text, 0.42), 1.8);
    curve(S.mergeWorst, alpha(C['so-mer'], 0.75), 1.6, [6, 4]);
    curve(function (n) { return n - 1; }, alpha(C.text, 0.42), 1.6, [1.5, 3.5]);
    ctx2.restore();
    const lf = fnt(narrow ? 10 : 11, 600);
    D.haloText(ctx2, 'n(n − 1)/2', X(narrow ? 47 : 52), Y(S.half(narrow ? 47 : 52)) - 4, C.muted, 'right', 'bottom', lf);
    // 點
    const r = narrow ? 3.6 : 4.2;
    state.chart.forEach(function (q) {
      if (q.key === state.lastPt) return;
      marker(ctx2, q.a, X(q.n), Y(q.c), r, C[ACOL[q.a]]);
    });
    const last = state.chart.find(function (q) { return q.key === state.lastPt; });
    if (last) {
      ctx2.save();
      ctx2.fillStyle = alpha(C[ACOL[last.a]], D.dark ? 0.28 : 0.2);
      ctx2.beginPath(); ctx2.arc(X(last.n), Y(last.c), r * 2.6, 0, Math.PI * 2); ctx2.fill();
      ctx2.restore();
      marker(ctx2, last.a, X(last.n), Y(last.c), r * 1.2, C[ACOL[last.a]]);
    }
    if (!state.chart.length) D.pill(ctx2, T('跑完一次排序就多一個點', 'Finish a sort to add a point'), ml + 8, mt + (narrow ? 37 : 41), C.muted, 'left', fnt(narrow ? 11 : 12, 600)); // 左上角：曲線都在下面，不會疊到參考線的標籤
    $('chartCount').textContent = state.chart.length ? T(state.chart.length + ' 個點', state.chart.length + (state.chart.length === 1 ? ' point' : ' points')) : '';
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function setClass(id, c) { const el = $(id); if (el.className !== c) el.className = c; }
  let eqKey = '';
  /** 兩行的公式（讀數區很窄，一行放不下） */
  function two(a, b) { return '\\begin{gathered}' + a + '\\\\' + b + '\\end{gathered}'; }
  function setEq(tex) {
    if (tex === eqKey) return;
    eqKey = tex;
    const el = $('rEq');
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function small(s) { return ' <small>' + T('（', '(') + s + T('）', ')') + '</small>'; }
  function updateAll() {
    const n = state.values.length;
    if (state.mode === 'single') {
      const st = state.st, res = state.res, a = state.algo, end = atEnd();
      const bd = S.compBounds(a, n, state.median3);
      setHTML('stepInfo', T('第 ', 'Step ') + fmtInt(st.k) + ' / ' + fmtInt(res.steps) + T(' 步', ''));
      setHTML('rC', fmtInt(st.c) + small(a === 'selection' ? T('一定是 ', 'always ') + fmtInt(bd.max) : T('最多 ', 'at most ') + fmtInt(bd.max)));
      setHTML('rS', a === 'merge' ? '—' : fmtInt(st.s));
      setHTML('rW', a === 'merge' ? fmtInt(st.w) + small(T('共 ', 'total ') + fmtInt(S.mergeWrites(n))) : '<small>' + T('只算合併排序', 'merge sort only') + '</small>');
      setHTML('rStep', fmtInt(st.k) + ' / ' + fmtInt(res.steps));
      const inv = S.inversions(state.values);
      setHTML('rInv', fmtInt(inv) + (S.dupCount(state.values) === 0 && n >= 2 ? small(T('平均 ', 'average ') + trimNum(n * (n - 1) / 4)) : ''));
      if (!end) { setHTML('rStable', T('排完才知道', 'known at the end')); setClass('rStable', ''); }
      else if (!res.hasDup) { setHTML('rStable', T('沒有相同的值', 'no equal values')); setClass('rStable', ''); }
      else if (res.stable) { setHTML('rStable', T('穩定 ✓', 'stable ✓')); setClass('rStable', 'ok'); }
      else { setHTML('rStable', T('打亂了 ', 'scrambled ') + res.broken + T(' 對', res.broken === 1 ? ' pair' : ' pairs')); setClass('rStable', 'bad'); }
      if (a === 'merge' || a === 'quick') {
        setHTML('rDepth', end ? T('最深 ', 'max ') + res.maxDepth : (st.range ? T('目前 ', 'now ') + st.range.d : '—') + (a === 'merge' ? small('⌈log<sub>2</sub> n⌉ = ' + S.ceilLog2(n)) : ''));
      } else setHTML('rDepth', T('不用遞迴', 'not recursive'));
      // 公式
      const half = fmtInt(S.half(n)).replace(/,/g, '{,}');
      let tex = '', note = '';
      if (a === 'bubble') { tex = 'n-1 = ' + (n - 1) + ' \\;\\le\\; C \\;\\le\\; \\tfrac{n(n-1)}{2} = ' + half; note = T('最多比 n(n − 1)/2 次；資料已經排好時，一輪沒有交換就結束，只比 n − 1 次。交換次數 = 逆序數。', 'At most n(n − 1)/2 comparisons; on sorted data the first pass makes no swap and it stops after n − 1. Swaps = inversions.'); }
      else if (a === 'selection') { tex = two('C = \\tfrac{n(n-1)}{2} = ' + half, 'S \\le n-1 = ' + (n - 1)); note = T('比較次數和資料長怎樣無關；每一輪最多交換一次。', 'The number of comparisons does not depend on the data; at most one swap per pass.'); }
      else if (a === 'insertion') { tex = two('n-1 \\;\\le\\; C \\;\\le\\; \\tfrac{n(n-1)}{2}', 'S = ' + fmtInt(inv).replace(/,/g, '{,}')); note = T('交換次數 = 資料的逆序數；已經排好時只比 n − 1 次。', 'Swaps = the number of inversions in the data; on sorted data only n − 1 comparisons.'); }
      else if (a === 'merge') { tex = two('C \\le n\\lceil \\log_2 n\\rceil - 2^{\\lceil \\log_2 n\\rceil} + 1 = ' + S.mergeWorst(n), 'W = ' + S.mergeWrites(n)); note = T('最壞的比較次數；寫入次數和資料無關。', 'The worst-case number of comparisons; the number of writes does not depend on the data.'); }
      else if (state.median3) { tex = two('p = \\operatorname{med}(a_l,\\, a_m,\\, a_r)', 'C \\le \\tfrac{n(n-1)}{2} + 3(n-2) = ' + fmtInt(S.compBounds('quick', n, true).max).replace(/,/g, '{,}')); note = T('三數取中：比較區段最左 <i>a</i><sub>l</sub>、中間 <i>a</i><sub>m</sub>、最右 <i>a</i><sub>r</sub> 三個值，取中位數 <i>p</i> 當樞紐。這 2–3 次比較也算進去，所以全部相同的資料會比 n(n − 1)/2 還多。', 'Median of three: compare the leftmost <i>a</i><sub>l</sub>, middle <i>a</i><sub>m</sub> and rightmost <i>a</i><sub>r</sub> values of the section and use their median <i>p</i> as the pivot. These 2–3 comparisons count too, so data whose values are all equal takes even more than n(n − 1)/2.'); }
      else { tex = S.quickMin(n) + ' \\;\\le\\; C \\;\\le\\; \\tfrac{n(n-1)}{2} = ' + half; note = T('取最後一個當樞紐：最少（每次剛好對半分）與最多（每次只分掉一個）的比較次數。', 'Last value as pivot: the fewest comparisons (every split exactly in half) and the most (every split removes only one value).'); }
      setEq(tex);
      setHTML('eqNote', note);
    } else {
      const R = state.race;
      setHTML('stepInfo', T('第 ', 'Step ') + fmtInt(R.tick) + T(' 步', ''));
      setEq(two('\\tfrac{n(n-1)}{2} = ' + fmtInt(S.half(n)).replace(/,/g, '{,}'), 'n\\lceil \\log_2 n\\rceil - 2^{\\lceil \\log_2 n\\rceil} + 1 = ' + S.mergeWorst(n)));
      setHTML('eqNote', T('上：泡沫、選擇、插入、快速排序最多的比較次數', 'Top: the most comparisons for bubble, selection, insertion and quick sort') + (state.median3 ? T('（勾了三數取中的快速排序最多再加 3(n − 2) 次）', ' (quick sort with median of three: up to 3(n − 2) more)') : '') + T('；下：合併排序最多的比較次數（n = ', '; bottom: the most for merge sort (n = ') + n + T('）。', ').'));
      renderRaceTable();
    }
  }
  function trimNum(v) { return String(Math.round(v * 100) / 100); }
  function renderRaceTable() {
    if (state.mode !== 'race') return;
    const R = state.race;
    const hasDup = S.dupCount(state.values) > 0;
    // 讀數區很窄：名次放在演算法前面，步數看畫面上的小標籤
    let h = '<thead><tr><th>' + T('名次・演算法', 'Place · algorithm') + '</th><th>' + T('比較', 'Comp.') + '</th><th>' + T('交換／寫入', 'Swaps / writes') + '</th><th>' + T('穩定', 'Stable') + '</th></tr></thead><tbody>';
    R.list.forEach(function (r) {
      const done = r.st.k >= r.res.steps;
      const sw = r.algo === 'merge' ? fmtInt(r.st.w) + ' W' : fmtInt(r.st.s);
      const stab = !done ? '…' : !hasDup ? '—' : r.res.stable ? '✓' : '✗';
      h += '<tr><td><span class="pl' + (done && r.place === 1 ? ' win' : '') + '">' + (done ? r.place : '') + '</span><span class="mk" style="color:var(--' + ACOL[r.algo] + ')">' + MK[r.algo] + '</span>' + sn(r.algo) + '</td><td>' + fmtInt(r.st.c) + '</td><td>' + sw + '</td><td' +
        (done && hasDup ? ' style="color:var(' + (r.res.stable ? '--so-done' : '--so-swap') + ');font-weight:700"' : '') + '>' + stab + '</td></tr>';
    });
    setHTML('raceTable', h + '</tbody>');
    setHTML('raceNote', T('名次看步數（比較 + 交換 + 寫入），步數最少的先跑完；每一格畫面上有步數。「穩定」：✓ 相同的值保持原本順序，✗ 被打亂，— 資料沒有相同的值。', 'Places go by steps (comparisons + swaps + writes): the fewest steps finishes first; each panel shows its steps. “Stable”: ✓ equal values kept their order, ✗ scrambled, — no equal values in the data.'));
  }

  // =====================================================================
  // 狀態列（每一步在做什麼）、音效
  // =====================================================================
  let sayTimer = 0, sayLast = 0;
  function say(msg) {
    const el = $('status');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg || ''; sayLast = performance.now(); }, 20);
  }
  function startText() {
    const n = state.values.length;
    if (state.mode === 'race') return T('五種演算法要排同一份 ' + n + ' 個數的資料（' + shapeName(state.shape) + '）。按「播放」或「單步」開始比賽。', 'Five algorithms will sort the same ' + n + ' values (' + shapeName(state.shape) + '). Press “Play” or “Step” to start the race.');
    return T(nm(state.algo) + '：' + n + ' 個數（' + shapeName(state.shape) + '），共 ' + fmtInt(state.res.steps) + ' 步。按「單步」或「播放」開始。', nm(state.algo) + ': ' + n + ' values (' + shapeName(state.shape) + '), ' + fmtInt(state.res.steps) + ' steps in all. Press “Step” or “Play” to begin.');
  }
  function sayStep(op) {
    if (!op) return;
    if (state.playing && performance.now() - sayLast < 260) return;
    say(describe(op, state.st));
  }
  function describe(op, st) {
    const vals = state.values, a = state.algo;
    const V = function (p) { return vals[st.arr[p]]; };
    if (op.t === 'cmp' && op.aux) {
      // 合併：op.i 是右半的位置、op.j 是左半的位置；右邊嚴格比較小才先放右邊（相同時先放左邊，所以穩定）
      const R = vals[st.aux[op.i]], Lv = vals[st.aux[op.j]];
      return T('合併：比較左半的 ' + Lv + ' 和右半的 ' + R + '：' + (op.r < 0 ? R + ' 比較小，先寫回 ' + R + '。' : Lv + ' 不比 ' + R + ' 大，先寫回 ' + Lv + '。'),
        'Merge: compare ' + Lv + ' from the left half with ' + R + ' from the right half: ' + (op.r < 0 ? R + ' is smaller, so ' + R + ' goes back first.' : Lv + ' is not larger than ' + R + ', so ' + Lv + ' goes back first.'));
    }
    if (op.t === 'cmp') {
      const x = V(op.i), y = V(op.j), rel = x > y ? ' > ' : x < y ? ' < ' : ' = ';
      const head = T('比較 a[' + op.i + '] = ' + x + ' 和 a[' + op.j + '] = ' + y + '：' + x + rel + y, 'Compare a[' + op.i + '] = ' + x + ' with a[' + op.j + '] = ' + y + ': ' + x + rel + y);
      let tail = '';
      if (st.med3) tail = T('（三數取中）', ' (median of three)');
      else if (a === 'bubble') tail = x > y ? T('，左邊比較大，要交換。', '; the left one is larger, so swap.') : T('，不用換。', '; no swap.');
      else if (a === 'selection') tail = x < y ? T('，找到更小的，記住它。', '; a new smallest value.') : T('，最小值不變。', '; the smallest stays the same.');
      else if (a === 'insertion') tail = x > y ? T('，往左換一格。', '; move it one place left.') : T('，停在這裡。', '; it stops here.');
      else if (a === 'quick') tail = x <= y ? T('，不比樞紐大，換到前面。', '; not larger than the pivot, so it goes to the front.') : T('，比樞紐大，留在後面。', '; larger than the pivot, so it stays behind.');
      return head + tail;
    }
    if (op.t === 'swap') return T('交換 a[' + op.i + '] 和 a[' + op.j + ']。', 'Swap a[' + op.i + '] and a[' + op.j + '].') + (a === 'quick' && st.pivot < 0 ? T('樞紐 ' + V(op.i === op.j ? op.i : (st.done[op.i] ? op.i : op.j)) + ' 就位了。', ' The pivot is now in place.') : '');
    if (op.t === 'write') return T('把 ' + V(op.k) + ' 寫回 a[' + op.k + ']。', 'Write ' + V(op.k) + ' back into a[' + op.k + '].');
    return '';
  }
  function sound() { const L2 = window.LabSound; return L2 && L2.enabled() ? L2 : null; }
  let sndT = 0;
  function pitch(v) { const lo = state.vmin, hi = state.vmax; return 300 * Math.pow(2, 2 * (hi > lo ? (v - lo) / (hi - lo) : 0.5)); }   // 300–1200 Hz
  function stepSound(op, st, vals) {
    const L2 = sound(); if (!L2) return;
    const t = performance.now(); if (t - sndT < 30) return; sndT = t;
    if (op.t === 'cmp') {
      const a = op.aux ? vals[st.aux[op.i]] : vals[st.arr[op.i]], b = op.aux ? vals[st.aux[op.j]] : vals[st.arr[op.j]];
      L2.tone({ freq: pitch(Math.max(a, b)), dur: 0.05, type: 'triangle', gain: 0.13 });
    } else if (op.t === 'swap') {
      const a = vals[st.arr[op.i]], b = vals[st.arr[op.j]];
      L2.tone({ freq: pitch(Math.max(a, b)) * 1.5, dur: 0.06, type: 'square', gain: 0.05 });
      L2.tone({ freq: pitch(Math.min(a, b)) * 1.5, dur: 0.06, type: 'square', gain: 0.04, delay: 0.035 });
    } else if (op.t === 'write') {
      L2.tone({ freq: pitch(vals[st.arr[op.k]]), dur: 0.06, type: 'sine', gain: 0.16 });
    }
  }
  /** 排好時由低到高掃一遍 */
  function doneSound(vals) {
    const L2 = sound(); if (!L2) return;
    const sorted = vals.slice().sort(function (x, y) { return x - y; });
    const k = Math.min(24, sorted.length);
    for (let i = 0; i < k; i++) {
      const v = sorted[Math.round(i * (sorted.length - 1) / Math.max(1, k - 1))];
      L2.tone({ freq: pitch(v), dur: 0.07, type: 'triangle', gain: 0.12, delay: i * 0.6 / k });
    }
  }
  function raceDoneSound(place) {
    const L2 = sound(); if (!L2) return;
    const f = [987.77, 880, 783.99, 659.25, 587.33][Math.min(4, place - 1)];
    L2.tone({ freq: f, dur: 0.18, type: 'sine', gain: 0.22 });
    if (place === 1) L2.tone({ freq: f * 1.5, dur: 0.22, type: 'sine', gain: 0.16, delay: 0.09 });
  }
  let raceSayT = 0;
  function raceTick() {
    const t = performance.now();
    if (state.playing && t - raceSayT < 400) return;
    raceSayT = t;
    const R = state.race;
    say(T('第 ' + fmtInt(R.tick) + ' 步：', 'Step ' + fmtInt(R.tick) + ': ') + R.list.map(function (r) { return sn(r.algo) + ' ' + fmtInt(r.st.c); }).join(T('、', ', ')) + T('（比較次數）', ' (comparisons)'));
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
  // 任務模式：回報計數
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function baseInfo() {
    const v = state.values;
    return {
      n: v.length, shape: state.shape, custom: state.shape === 'custom', median3: state.median3, values: v.slice(),
      inv: S.inversions(v), cycles: S.cycles(v), distinct: S.distinct(v), dup: S.dupCount(v),
      sortedIn: S.isSorted(v), reversedIn: S.isStrictlyDecreasing(v),
      chart: state.chart.map(function (q) { return { a: q.a, n: q.n, c: q.c }; })
    };
  }
  function emitFinish() {
    const r = state.res;
    emit('finish', Object.assign(baseInfo(), { mode: 'single', algo: state.algo, comps: r.comps, swaps: r.swaps, writes: r.writes, steps: r.steps,
      stable: r.stable, broken: r.broken, maxDepth: r.maxDepth }));
  }
  function emitRace() {
    const results = {};
    state.race.list.forEach(function (r) {
      results[r.algo] = { comps: r.res.comps, swaps: r.res.swaps, writes: r.res.writes, steps: r.res.steps, stable: r.res.stable, broken: r.res.broken, maxDepth: r.res.maxDepth, place: r.place };
    });
    emit('race', Object.assign(baseInfo(), { mode: 'race', results: results }));
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elN = $('nn'), elSpeed = $('speed');
  const SPEED_MAX = 500;
  if (window.LabNum) window.LabNum.register(elSpeed, {
    toValue: function (p) { return Math.max(1, Math.round(Math.pow(SPEED_MAX, p / 100))); },
    toPos: function (v) { return Math.log(Math.max(1, v)) / Math.log(SPEED_MAX) * 100; },
    min: 1, max: SPEED_MAX, decimals: 0
  });
  function speedVal() { return window.LabNum ? Math.max(1, Math.round(val(elSpeed))) : Math.max(1, Math.round(Math.pow(SPEED_MAX, +elSpeed.value / 100))); }
  function refreshOutputs() {
    $('nno').textContent = String(Math.round(val(elN)));
    $('speedo').textContent = String(speedVal());
  }
  elN.addEventListener('input', function () {
    refreshOutputs();
    if (state.shape === 'custom') return;
    const n = Math.round(val(elN));
    if (n === state.n) return;
    state.n = n;
    rebuild();
  });
  elSpeed.addEventListener('input', function () { state.rate = speedVal(); refreshOutputs(); });

  function setPressedIn(box, attr, v) {
    box.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === v)); });
  }
  function updateDataUI() {
    setPressedIn($('shapeChips'), 'data-shape', state.shape);
    const custom = state.shape === 'custom';
    $('customBox').hidden = !custom;
    elN.disabled = custom;
    const si = $('seedInfo');
    if (custom) si.textContent = T('自訂 ' + state.custom.length + ' 個數；「洗牌」會打亂它們', state.custom.length + ' custom values; “Shuffle” mixes them up');
    else if (state.shape === 'sorted' || state.shape === 'reversed') si.textContent = T('（固定的資料；「洗牌」改成亂序）', '(fixed data; “Shuffle” switches to random)');
    else si.textContent = T('第 ' + state.seed + ' 份', 'data set #' + state.seed);
  }
  $('shapeChips').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-shape]');
    if (!b) return;
    const s = b.getAttribute('data-shape');
    if (s === state.shape) return;
    state.shape = s;
    if (s === 'custom') readCustom(false);
    updateDataUI();
    rebuild();
  });
  $('shuffle').addEventListener('click', function () {
    if (state.shape === 'custom') {
      const r = S.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0), a = state.custom;
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const v = a[i]; a[i] = a[j]; a[j] = v; }
      $('custom').value = a.join(' ');
      setCustomMsg('', false);
    } else {
      if (state.shape === 'sorted' || state.shape === 'reversed') state.shape = 'random';
      state.seed++;
    }
    updateDataUI();
    rebuild();
  });
  function setCustomMsg(msg, bad) { const el = $('customMsg'); el.textContent = msg; el.classList.toggle('bad', !!bad); }
  /** 讀自訂資料；有錯就說明，能用的部分照樣用 */
  function readCustom(announce) {
    const p = S.parseCustom($('custom').value);
    if (p.error === 'few') { setCustomMsg(T('至少要 2 個 1 到 99 的整數。', 'Type at least 2 whole numbers from 1 to 99.'), true); return false; }
    state.custom = p.values;
    if (p.error === 'many') setCustomMsg(T('最多 64 個，只用前 64 個。', 'At most 64 values; only the first 64 are used.'), true);
    else if (p.error === 'range') setCustomMsg(T('只能用 1 到 99 的整數，其他的略過了。', 'Only whole numbers from 1 to 99 are used; the others were skipped.'), true);
    else setCustomMsg(announce ? T('已套用 ' + p.values.length + ' 個數。', 'Using ' + p.values.length + ' values.') : '', false);
    return true;
  }
  $('apply').addEventListener('click', function () {
    if (state.shape !== 'custom') state.shape = 'custom';
    if (!readCustom(true)) return;
    updateDataUI();
    rebuild();
  });
  $('custom').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('apply').click(); } });
  $('ties').addEventListener('change', function () { state.ties = $('ties').checked; requestDraw(); });

  $('algoChips').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-algo]');
    if (!b) return;
    const a = b.getAttribute('data-algo');
    if (state.mode === 'race') setMode('single');
    if (a === state.algo && state.mode === 'single') return;
    state.algo = a;
    setPressedIn($('algoChips'), 'data-algo', a);
    rebuild();
  });
  $('med3').addEventListener('change', function () {
    state.median3 = $('med3').checked;
    if (state.mode === 'race' || state.algo === 'quick') rebuild();
  });
  function setMode(m) {
    if (m === state.mode) return;
    state.mode = m;
    $('modeSingle').setAttribute('aria-pressed', String(m === 'single'));
    $('modeRace').setAttribute('aria-pressed', String(m === 'race'));
    $('readSingle').hidden = m === 'race';
    $('raceBox').hidden = m !== 'race';
    $('raceHint').hidden = m !== 'race';
    $('back').disabled = m === 'race';
    setPressedIn($('algoChips'), 'data-algo', m === 'race' ? '' : state.algo);
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    rebuild();
  }
  $('modeSingle').addEventListener('click', function () { setMode('single'); });
  $('modeRace').addEventListener('click', function () { setMode('race'); });

  $('step').addEventListener('click', function () {
    stopPlay();
    if (atEnd()) { say(T('已經跑完了。按「重來」從頭再跑一次。', 'Already finished. Press “Restart” to run it again.')); return; }
    advance(1);
  });
  $('back').addEventListener('click', function () { if (!back()) say(T('已經在第 0 步。', 'Already at step 0.')); });
  $('play').addEventListener('click', function () {
    if (state.playing) { stopPlay(); return; }
    if (atEnd()) restart();
    setPlaying(true);
  });
  $('toEnd').addEventListener('click', toEnd);
  $('reset').addEventListener('click', restart);
  $('clear').addEventListener('click', function () {
    state.chart = []; state.lastPt = null;
    chartDirty = true;
    restart();
    say(T('已全部清除：圖上的點與比賽紀錄都清掉了，資料與演算法不變。', 'Cleared: the chart points and the race record are gone; the data and algorithm are kept.'));
  });

  // ---------- 鍵盤：左右方向鍵一步一步走 ----------
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('排序畫布。右方向鍵前進一步，左方向鍵後退一步。', 'Sorting canvas. Right arrow: one step forward; left arrow: one step back.'),
      items: [{
        name: function () { return T('排序步驟', 'Sorting step'); },
        move: function (dx) {
          if (dx > 0) { stopPlay(); if (atEnd()) return false; advance(1); return true; }
          if (dx < 0) return back();
          return false;
        },
        describe: function () { return $('status').textContent || startText(); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // 給測試用的介面（不影響畫面）
  window.__so = { state: state, S: S };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  state.n = Math.round(val(elN));
  state.rate = speedVal();
  state.ties = $('ties').checked;
  state.median3 = $('med3').checked;
  refreshOutputs();
  updateSoundButton();
  updateDataUI();
  rebuild();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    updateAll();
    chartDirty = true;
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); });
  resize();
})();
