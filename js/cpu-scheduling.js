/* cpu-scheduling.js — 「CPU 排程」的畫面與互動（排程計算在 cpu-scheduling-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 核心一次把整個排程算完（甘特圖、每個事件之後的就緒佇列），畫面依目前時間 t 重建 CPU、佇列、甘特圖與時間線。
 * 六種方法、RR 的 q = 1…20 也都先算好，畫在並排比較圖與時間片圖上。
 * 任務事件 'run'：使用者按「播放」「單步」「直接跑完」跑到最後一刻時送出；已經跑到最後時再改工作表或設定，
 *   畫面直接顯示新的完整結果，也送出一次（src = 'update'，短時間內連續改只送最後一次）。載入頁面、不操作不會送出。
 */
(function () {
  'use strict';
  const K = window.CpuSchedCore;
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

  const NAME = {
    fcfs: ['FCFS', 'FCFS'], sjf: ['SJF', 'SJF'], srtf: ['SRTF', 'SRTF'], rr: ['RR', 'RR'],
    pn: ['優先權（不搶先）', 'Priority (non-preemptive)'], pp: ['優先權（可搶先）', 'Priority (preemptive)']
  };
  const SHORT = { fcfs: ['FCFS', 'FCFS'], sjf: ['SJF', 'SJF'], srtf: ['SRTF', 'SRTF'], rr: ['RR', 'RR'], pn: ['優先權', 'Priority'], pp: ['優先權搶先', 'Priority*'] };
  const SUB = {
    fcfs: ['先到先做', 'first come'], sjf: ['最短優先', 'shortest first'], srtf: ['最短剩餘', 'shortest left'], rr: ['輪流', 'round robin'],
    pn: ['不搶先', 'non-preemptive'], pp: ['可搶先', 'preemptive']
  };
  function nm(a) { return T(NAME[a][0], NAME[a][1]); }
  const PRESETS = {
    convoy: [[0, 24, 1], [0, 3, 1], [0, 3, 1]],
    srtf: [[0, 8, 1], [1, 4, 1], [2, 9, 1], [3, 5, 1]],
    stallings: [[0, 3, 1], [2, 6, 1], [4, 4, 1], [6, 5, 1], [8, 2, 1]],
    equal: [[0, 4, 1], [0, 4, 1], [0, 4, 1], [0, 4, 1], [0, 4, 1]]
  };
  const PRESET_NAME = {
    convoy: ['課本：24、3、3 同時到達', 'textbook: 24, 3, 3 together'], srtf: ['課本：SRTF 的例子', 'textbook: the SRTF example'],
    stallings: ['Stallings 的 A–E', 'Stallings’ A–E'], equal: ['五個一樣長', 'five equal jobs']
  };
  /** 預設工作表：五個行程，到達錯開、長短不一，六種方法的結果各有不同 */
  const DEFAULT_SHEET = [[0, 7, 3], [2, 4, 1], [3, 1, 4], [5, 5, 2], [6, 3, 5]];
  const toProcs = function (list) { return list.map(function (r) { return { arr: r[0], burst: r[1], pri: r[2] }; }); };

  // ---------- 狀態 ----------
  const state = {
    procs: toProcs(DEFAULT_SHEET), seed: 0, sheetSrc: 'default', preset: '', edits: 0,
    algo: 'fcfs', q: 3, cs: 0, tie: 'new', speed: 3,
    all: null, res: null, scan: null, Tmax: 20, times: [0],
    t: 0, playing: false, atEnd: false, logged: false,
    log: [], fx: []
  };

  // ---------- 色彩與花紋 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'cs-wait', 'cs-sw', 'cs-idle', 'cs-chip', 'cs-best']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    C.p = [];
    for (let i = 1; i <= 8; i++) C.p.push(cs.getPropertyValue('--cs-p' + i).trim() || '#888888');
    C.ink = C.p.map(function (c) { const r = D.rgb(c); return (0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]) > 150 ? '#14181f' : '#ffffff'; });
    pats = new WeakMap();
  }
  let pats = new WeakMap();
  /** 每個行程的花紋：0 素面、1 斜線、2 圓點、3 橫線、4 反斜線、5 直線、6 格子、7 鋸齒 */
  function patternFor(ctx, i) {
    let list = pats.get(ctx);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (!list || list.dpr !== dpr) { list = { dpr: dpr, p: [] }; pats.set(ctx, list); }
    if (list.p[i] !== undefined) return list.p[i];
    const kind = i % 8;
    if (kind === 0) { list.p[i] = null; return null; }
    const S = 8, cv = document.createElement('canvas');
    cv.width = Math.round(S * dpr); cv.height = Math.round(S * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const dark = C.ink[i] === '#14181f';
    g.strokeStyle = dark ? 'rgba(0,0,0,0.26)' : 'rgba(255,255,255,0.34)';
    g.fillStyle = g.strokeStyle;
    g.lineWidth = 1.3; g.lineCap = 'square';
    g.beginPath();
    if (kind === 1) { g.moveTo(-2, S + 2); g.lineTo(S + 2, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(S - 2, S + 2); g.lineTo(S + 2, S - 2); g.stroke(); }
    else if (kind === 2) { g.arc(S / 2, S / 2, 1.4, 0, Math.PI * 2); g.fill(); }
    else if (kind === 3) { g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke(); }
    else if (kind === 4) { g.moveTo(-2, -2); g.lineTo(S + 2, S + 2); g.moveTo(S - 2, -2); g.lineTo(S + 2, 2); g.moveTo(-2, S - 2); g.lineTo(2, S + 2); g.stroke(); }
    else if (kind === 5) { g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke(); }
    else if (kind === 6) { g.lineWidth = 1; g.moveTo(0, 0.5); g.lineTo(S, 0.5); g.moveTo(0.5, 0); g.lineTo(0.5, S); g.stroke(); }
    else if (kind === 7) { g.lineWidth = 1.1; g.moveTo(0, S * 0.7); g.lineTo(S / 2, S * 0.3); g.lineTo(S, S * 0.7); g.stroke(); }
    const pat = ctx.createPattern(cv, 'repeat');
    if (pat && pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix().scale(1 / dpr));
    list.p[i] = pat;
    return pat;
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  /** 一段行程方塊：由上而下的漸層、花紋、頂邊高光、底邊暗線 */
  function procBlock(ctx, x, y, w, h, i, opts) {
    opts = opts || {};
    if (w <= 0.3) return;
    const col = C.p[i % 8];
    const r = Math.min(opts.r == null ? 4 : opts.r, w / 2, h / 2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(col, 0.22));
    g.addColorStop(0.45, col);
    g.addColorStop(1, shade(col, -0.16));
    D.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    const pat = patternFor(ctx, i);
    if (pat) { ctx.fillStyle = pat; ctx.fill(); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(shade(col, -0.35), 0.7);
    ctx.stroke();
    if (w > 4 && h > 6) {
      ctx.beginPath();
      ctx.moveTo(x + r, y + 1.2); ctx.lineTo(x + w - r, y + 1.2);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.stroke();
    }
    if (opts.label && w >= (opts.minW || 20)) {
      ctx.font = fnt(opts.fs || 12, 700);
      const tw = ctx.measureText(opts.label).width;
      if (tw + 4 <= w) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = 3;
        ctx.strokeStyle = C.ink[i] === '#ffffff' ? alpha(shade(col, -0.5), 0.55) : alpha('#ffffff', 0.55);
        ctx.strokeText(opts.label, x + w / 2, y + h / 2 + 0.5);
        ctx.fillStyle = C.ink[i];
        ctx.fillText(opts.label, x + w / 2, y + h / 2 + 0.5);
      }
    }
  }
  /** 情境切換段：斜線花紋的窄塊 */
  function swBlock(ctx, x, y, w, h) {
    if (w <= 0.3) return;
    ctx.save();
    D.roundRect(ctx, x, y, w, h, Math.min(3, w / 2));
    ctx.fillStyle = alpha(C['cs-sw'], D.dark ? 0.22 : 0.16);
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = alpha(C['cs-sw'], 0.85);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = -h; k < w + h; k += 4) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
    ctx.stroke();
    ctx.restore();
    D.roundRect(ctx, x, y, w, h, Math.min(3, w / 2));
    ctx.strokeStyle = alpha(C['cs-sw'], 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  /** 閒置段：虛線外框 */
  function idleBlock(ctx, x, y, w, h, label) {
    if (w <= 0.5) return;
    ctx.save();
    ctx.setLineDash([3, 3]);
    D.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 3);
    ctx.strokeStyle = alpha(C['cs-idle'], 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    if (label) {
      ctx.font = fnt(11);
      if (ctx.measureText(label).width + 6 < w) {
        ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, x + w / 2, y + h / 2);
      }
    }
  }

  // =====================================================================
  // 計算
  // =====================================================================
  function opt() { return { q: state.q, cs: state.cs, tie: state.tie }; }
  function niceMax(v) {
    const steps = [10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400];
    for (let i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 100) * 100;
  }
  function recompute() {
    state.all = K.runAll(state.procs, opt());
    state.res = state.all[state.algo];
    state.scan = K.rrScan(state.procs, { cs: state.cs, tie: state.tie });
    let mk = 0;
    ALGOS.forEach(function (a) { mk = Math.max(mk, state.all[a].makespan); });
    state.Tmax = niceMax(mk);
    const set = { 0: true };
    state.res.segs.forEach(function (s) { set[s.t0] = true; set[s.t1] = true; });
    state.res.events.forEach(function (e) { set[e.t] = true; });
    state.times = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  // =====================================================================
  // 畫布與版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const cv3 = $('cv3'), ctx3 = cv3.getContext('2d');
  let dpr = 1, cw = 600, ch = 420, cw2 = 600, ch2 = 260, cw3 = 600, ch3 = 220, L = null;
  function layout() {
    const narrow = cw < 560;
    const n = state.procs.length;
    const padL = narrow ? 40 : 50, padR = narrow ? 10 : 16;
    const hudH = 30;
    const machTop = hudH + 6, machH = narrow ? 84 : 92;
    const arrTop = machTop + machH + 10, arrH = 20;
    const gTop = arrTop + arrH, gH = narrow ? 36 : 44;
    const axisY = gTop + gH + 4;
    const tlTop = axisY + 40, rh = narrow ? 16 : 19;
    const qTop = tlTop + n * rh + 12, qH = narrow ? 38 : 44;
    const H = qTop + qH + 22;
    return { narrow: narrow, padL: padL, padR: padR, x0: padL, x1: cw - padR, hudH: hudH, machTop: machTop, machH: machH,
      arrTop: arrTop, arrH: arrH, gTop: gTop, gH: gH, axisY: axisY, tlTop: tlTop, rh: rh, qTop: qTop, qH: qH, H: Math.round(H) };
  }
  function X(t) { return L.x0 + (L.x1 - L.x0) * t / state.Tmax; }
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
    ch3 = cw3 < 560 ? 200 : 230;
    if (cv3.style.height !== ch3 + 'px') cv3.style.height = ch3 + 'px';
    cv3.width = Math.round(cw3 * dpr); cv3.height = Math.round(ch3 * dpr);
    pats = new WeakMap();
    dirty2 = dirty3 = true;
    requestDraw();
  }

  // ---------- 主畫布 ----------
  function draw() {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const res = state.res, t = state.t;
    const st = K.stateAt(res, t);
    drawHud(st);
    drawMachine(st);
    drawGantt(t);
    drawTimelines(t);
    drawQueueStrip(t);
    drawCursor(t);
  }
  function drawHud(st) {
    const tTxt = 't = ' + fmt(state.t, 1);
    const left = D.pill(ctx, tTxt, 8, 24, C.accent, 'left', fnt(13, 700));
    let s;
    if (state.t >= state.res.makespan - 1e-9 && state.t > 0) s = T('全部完成', 'All done');
    else if (st.state === 'run') s = T('CPU：執行 P', 'CPU: running P') + (st.cur + 1) + T('（還剩 ', ' (') + fmt(st.rem[st.cur], 1) + T('）', ' left)');
    else if (st.state === 'cs') s = T('CPU：情境切換中', 'CPU: context switch');
    else s = T('CPU：閒置', 'CPU: idle');
    const right = D.pill(ctx, s, cw - 8, 24, st.state === 'run' ? C.p[st.cur % 8] : C.muted, 'right', fnt(12.5, 600));
    // 中間寫目前的方法；放不下（窄螢幕）就省略，上方的按鈕已經標示了
    const mid = nm(state.algo) + (state.algo === 'rr' ? '  q = ' + state.q : '');
    ctx.font = fnt(12, 600);
    const mw = ctx.measureText(mid).width + 12;
    let mx = cw / 2;
    const lo = left.x + left.w + 10 + mw / 2, hi = right.x - 10 - mw / 2;
    if (lo <= hi) { mx = Math.min(hi, Math.max(lo, mx)); D.pill(ctx, mid, mx, 24, C.text, 'center', fnt(12, 600)); }
  }
  /** 依照「下一個會被挑中」的順序排列就緒佇列（FCFS、RR 是真正的排隊順序） */
  function readyOrder(st) {
    const r = st.ready.slice();
    const a = state.algo, P = state.procs;
    if (a === 'fcfs' || a === 'rr') return r;
    const key = a === 'sjf' ? function (p) { return P[p].burst; } : a === 'srtf' ? function (p) { return st.rem[p]; } : function (p) { return P[p].pri; };
    return r.sort(function (x, y) { return key(x) - key(y) || P[x].arr - P[y].arr || x - y; });
  }
  function drawMachine(st) {
    const top = L.machTop, H = L.machH, narrow = L.narrow;
    const chip = narrow ? 64 : 74;
    const cx = 10, cy = top + (H - chip) / 2 + 6;
    // CPU 晶片：針腳、立體的封裝、中間的晶粒
    ctx.save();
    ctx.strokeStyle = alpha(C.muted, 0.75); ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 1; k <= 5; k++) {
      const u = k / 6;
      ctx.moveTo(cx + chip * u, cy - 5); ctx.lineTo(cx + chip * u, cy);
      ctx.moveTo(cx + chip * u, cy + chip); ctx.lineTo(cx + chip * u, cy + chip + 5);
      ctx.moveTo(cx - 5, cy + chip * u); ctx.lineTo(cx, cy + chip * u);
      ctx.moveTo(cx + chip, cy + chip * u); ctx.lineTo(cx + chip + 5, cy + chip * u);
    }
    ctx.stroke();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.6)' : alpha(C.text, 0.3);
    ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    const g = ctx.createLinearGradient(0, cy, 0, cy + chip);
    g.addColorStop(0, shade(C['cs-chip'], 0.25)); g.addColorStop(1, shade(C['cs-chip'], -0.25));
    D.roundRect(ctx, cx, cy, chip, chip, 7);
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    D.roundRect(ctx, cx, cy, chip, chip, 7);
    ctx.strokeStyle = alpha('#ffffff', D.dark ? 0.18 : 0.3); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = fnt(10, 700); ctx.fillStyle = alpha('#ffffff', 0.7); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('CPU', cx + 6, cy + 5);
    const ix = cx + 9, iy = cy + 19, iw = chip - 18, ih = chip - 28;
    if (st.state === 'run') {
      procBlock(ctx, ix, iy, iw, ih, st.cur, { label: 'P' + (st.cur + 1), fs: narrow ? 13 : 15, r: 5 });
      const b = state.procs[st.cur].burst, done = 1 - st.rem[st.cur] / b;
      ctx.fillStyle = alpha('#ffffff', 0.18); ctx.fillRect(ix, cy + chip - 7, iw, 3);
      ctx.fillStyle = alpha('#ffffff', 0.9); ctx.fillRect(ix, cy + chip - 7, iw * Math.max(0, Math.min(1, done)), 3);
    } else if (st.state === 'cs') {
      swBlock(ctx, ix, iy, iw, ih);
      ctx.font = fnt(16, 700); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⇄', ix + iw / 2, iy + ih / 2);
    } else {
      ctx.font = fnt(11, 600); ctx.fillStyle = alpha('#ffffff', 0.65); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const done = state.t >= state.res.makespan - 1e-9 && state.t > 0;
      ctx.fillText(done ? '✓' : T('閒置', 'idle'), ix + iw / 2, iy + ih / 2);
    }
    // 就緒佇列的托盤
    const tx = cx + chip + 22, tw = cw - tx - 10;
    const tileW = Math.min(narrow ? 38 : 46, (tw - 12) / 7 - 5), tileH = narrow ? 40 : 46;
    const ty = cy + chip / 2 - tileH / 2 - 2;
    ctx.font = fnt(11.5, 600); ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const head = state.algo === 'fcfs' || state.algo === 'rr' ? T('就緒佇列（最前面的先上）', 'Ready queue (front goes next)')
      : state.algo === 'sjf' ? T('就緒佇列（依執行時間排）', 'Ready queue (by burst)')
        : state.algo === 'srtf' ? T('就緒佇列（依剩餘時間排）', 'Ready queue (by time left)') : T('就緒佇列（依優先權排）', 'Ready queue (by priority)');
    ctx.fillText(head, tx + 2, ty - 8);
    D.roundRect(ctx, tx, ty - 3, tw, tileH + 18, 9);
    ctx.fillStyle = alpha(C.text, D.dark ? 0.07 : 0.045); ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.12); ctx.lineWidth = 1; ctx.stroke();
    // 內陰影：上緣暗一點，看起來是凹下去的托盤
    ctx.save();
    D.roundRect(ctx, tx, ty - 3, tw, tileH + 18, 9); ctx.clip();
    const ig = ctx.createLinearGradient(0, ty - 3, 0, ty + 6);
    ig.addColorStop(0, alpha(D.dark ? '#000000' : C.text, D.dark ? 0.35 : 0.1)); ig.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ig; ctx.fillRect(tx, ty - 3, tw, 10);
    ctx.restore();
    // 箭頭：佇列最前面 → CPU
    D.arrow(ctx, tx - 2, cy + chip / 2, cx + chip + 7, cy + chip / 2, C.muted, 1.8);
    const list = readyOrder(st);
    if (!list.length) {
      ctx.font = fnt(12); ctx.fillStyle = alpha(C.muted, 0.9); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(T('（沒有人在等）', '(nobody waiting)'), tx + 12, ty + tileH / 2 + 4);
    }
    list.forEach(function (p, k) {
      const x = tx + 8 + k * (tileW + 5);
      ctx.save();
      ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.22); ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      D.roundRect(ctx, x, ty + 3, tileW, tileH - 12, 5); ctx.fillStyle = C.p[p % 8]; ctx.fill();
      ctx.restore();
      procBlock(ctx, x, ty + 3, tileW, tileH - 12, p, { label: 'P' + (p + 1), fs: narrow ? 12 : 13, r: 5, minW: 10 });
      const info = state.algo === 'pn' || state.algo === 'pp' ? T('優先 ', 'pri ') + state.procs[p].pri : T('剩 ', '') + fmt(st.rem[p], 1) + T('', ' left');
      ctx.font = fnt(narrow ? 9.5 : 10.5); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(info, x + tileW / 2, ty + tileH - 6);
    });
  }
  function drawGantt(t) {
    const res = state.res, g0 = L.gTop, gh = L.gH;
    // 軌道
    D.roundRect(ctx, L.x0 - 3, g0 - 3, X(res.makespan) - L.x0 + 6, gh + 6, 7);
    ctx.fillStyle = alpha(C.text, D.dark ? 0.06 : 0.035); ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.1); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = fnt(L.narrow ? 10 : 11, 600); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(T('甘特圖', 'Gantt'), L.x0 - (L.narrow ? 4 : 6), g0 + gh / 2);
    // 到達標記
    const byT = {};
    state.procs.forEach(function (p, i) { (byT[p.arr] = byT[p.arr] || []).push(i); });
    Object.keys(byT).forEach(function (k) {
      const tt = +k, xs = X(tt), list = byT[k];
      const arrived = tt <= t + 1e-9;
      list.forEach(function (i, j) {
        const x = xs + (j - (list.length - 1) / 2) * 9;
        ctx.beginPath(); ctx.moveTo(x - 4, g0 - 12); ctx.lineTo(x + 4, g0 - 12); ctx.lineTo(x, g0 - 5); ctx.closePath();
        ctx.fillStyle = arrived ? C.p[i % 8] : alpha(C.p[i % 8], 0.35); ctx.fill();
        ctx.strokeStyle = alpha(shade(C.p[i % 8], -0.4), arrived ? 0.8 : 0.3); ctx.lineWidth = 0.8; ctx.stroke();
      });
    });
    // 還沒發生的部分：淡淡的預告
    ctx.save();
    ctx.globalAlpha = D.dark ? 0.2 : 0.16;
    res.segs.forEach(function (s) {
      if (s.t1 <= t + 1e-9) return;
      const a = X(Math.max(s.t0, t)), b = X(s.t1);
      if (s.kind === 'run') procBlock(ctx, a, g0, b - a, gh, s.p, {});
      else if (s.kind === 'cs') swBlock(ctx, a, g0 + 4, b - a, gh - 8);
      else idleBlock(ctx, a, g0 + 3, b - a, gh - 6, '');
    });
    ctx.restore();
    // 已經發生的部分
    ctx.save();
    res.segs.forEach(function (s) {
      if (s.t0 >= t - 1e-9) return;
      const a = X(s.t0), b = X(Math.min(s.t1, t));
      if (s.kind === 'run') procBlock(ctx, a, g0, b - a, gh, s.p, { label: 'P' + (s.p + 1), fs: L.narrow ? 11.5 : 13, minW: 16 });
      else if (s.kind === 'cs') swBlock(ctx, a, g0 + 4, b - a, gh - 8);
      else idleBlock(ctx, a, g0 + 3, b - a, gh - 6, T('閒置', 'idle'));
    });
    ctx.restore();
    // 時間片續用的記號
    res.ticks.forEach(function (k) {
      if (k.t > t + 1e-9) return;
      const x = X(k.t);
      ctx.save(); ctx.setLineDash([2, 2]); ctx.strokeStyle = alpha(C.ink[k.p] === '#ffffff' ? '#ffffff' : '#14181f', 0.75); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, g0 + 3); ctx.lineTo(x, g0 + gh - 3); ctx.stroke(); ctx.restore();
    });
    // 時間軸
    const span = L.x1 - L.x0, ppu = span / state.Tmax;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100];
    let step = steps[steps.length - 1];
    for (let i = 0; i < steps.length; i++) if (steps[i] * ppu >= (L.narrow ? 24 : 28)) { step = steps[i]; break; }
    const y = L.axisY;
    ctx.strokeStyle = alpha(C.text, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.x0, y + 0.5); ctx.lineTo(L.x1, y + 0.5); ctx.stroke();
    ctx.beginPath();
    if (ppu >= 5) for (let v = 0; v <= state.Tmax; v++) { const x = Math.round(X(v)) + 0.5; ctx.moveTo(x, y); ctx.lineTo(x, y + 3); }
    ctx.strokeStyle = alpha(C.text, 0.22); ctx.stroke();
    ctx.beginPath();
    ctx.font = fnt(11); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = 0; v <= state.Tmax + 1e-9; v += step) {
      const x = Math.round(X(v)) + 0.5;
      ctx.moveTo(x, y); ctx.lineTo(x, y + 6);
      ctx.fillText(String(v), x, y + 7);
    }
    ctx.strokeStyle = alpha(C.text, 0.4); ctx.stroke();
    // 波紋（行程做完的瞬間）
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now - f.at < 450; });
    state.fx.forEach(function (f) { D.ripple(ctx, X(f.t), g0 + gh / 2, 10, (now - f.at) / 450, C.p[f.p % 8]); });
  }
  function drawTimelines(t) {
    const res = state.res, P = state.procs;
    const top = L.tlTop, rh = L.rh;
    ctx.font = fnt(10.5, 600); ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(T('每個行程：等待（淡色）與執行（實心）', 'Each process: waiting (pale) and running (solid)'), L.x0, top - 3);
    P.forEach(function (p, i) {
      const y = top + i * rh, h = rh - 4;
      // 標籤
      D.roundRect(ctx, 6, y + 2, 9, h - 2, 2); ctx.fillStyle = C.p[i % 8]; ctx.fill();
      ctx.font = fnt(L.narrow ? 10.5 : 11.5, 700); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('P' + (i + 1), 18, y + rh / 2);
      // 底線
      ctx.strokeStyle = alpha(C.text, 0.06); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.x0, y + rh - 0.5); ctx.lineTo(L.x1, y + rh - 0.5); ctx.stroke();
      if (p.arr > t + 1e-9) return;
      const end = Math.min(res.fin[i], t);
      // 等待帶
      const a = X(p.arr), b = X(end);
      if (b > a) {
        D.roundRect(ctx, a, y + 4, b - a, h - 4, 2);
        ctx.fillStyle = alpha(C['cs-wait'], D.dark ? 0.3 : 0.22); ctx.fill();
        ctx.save(); ctx.setLineDash([3, 2]); ctx.strokeStyle = alpha(C['cs-wait'], 0.8); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      }
      res.segs.forEach(function (s) {
        if (s.kind !== 'run' || s.p !== i || s.t0 >= t - 1e-9) return;
        const u = X(s.t0), v = X(Math.min(s.t1, t));
        procBlock(ctx, u, y + 2, v - u, h, i, { r: 3 });
      });
      // 到達的小三角形
      ctx.beginPath(); ctx.moveTo(a, y + 2); ctx.lineTo(a + 5, y + rh / 2); ctx.lineTo(a, y + rh - 2); ctx.closePath();
      ctx.fillStyle = shade(C.p[i % 8], -0.15); ctx.fill();
      // 完成的打勾
      if (res.fin[i] <= t + 1e-9) {
        const x = X(res.fin[i]) + 7;
        D.ball(ctx, x, y + rh / 2, Math.min(6, rh / 2 - 2), C.p[i % 8], { shadow: false });
        ctx.font = fnt(9, 800); ctx.fillStyle = C.ink[i]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✓', x, y + rh / 2 + 0.5);
      }
    });
  }
  function drawQueueStrip(t) {
    const res = state.res, F = res.frames;
    const top = L.qTop, h = L.qH;
    const maxQ = Math.max(1, state.procs.length - 1);
    const yOf = function (k) { return top + h - (h - 6) * k / maxQ; };
    // 格線
    ctx.strokeStyle = alpha(C.text, 0.07); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= maxQ; k++) { const y = Math.round(yOf(k)) + 0.5; ctx.moveTo(L.x0, y); ctx.lineTo(L.x1, y); }
    ctx.stroke();
    ctx.font = fnt(10.5, 600); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(T('佇列', 'queue'), L.x0 - 6, top + h / 2);
    ctx.textAlign = 'right'; ctx.font = fnt(9.5);
    ctx.fillText(String(maxQ), L.x0 - 6, yOf(maxQ) + 1);
    // 階梯面積
    let area = 0;
    ctx.beginPath(); ctx.moveTo(X(0), yOf(0));
    for (let k = 0; k < F.length; k++) {
      const t0 = F[k].t, t1 = k + 1 < F.length ? F[k + 1].t : res.makespan;
      if (t0 >= t) break;
      const e = Math.min(t1, t), q = F[k].ready.length;
      area += q * (e - t0);
      ctx.lineTo(X(t0), yOf(q)); ctx.lineTo(X(e), yOf(q));
    }
    ctx.lineTo(X(Math.min(t, res.makespan)), yOf(0)); ctx.closePath();
    const g = ctx.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, alpha(C.accent, D.dark ? 0.45 : 0.32)); g.addColorStop(1, alpha(C.accent, 0.06));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = alpha(C.accent, 0.9); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = alpha(C.text, 0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.x0, yOf(0) + 0.5); ctx.lineTo(L.x1, yOf(0) + 0.5); ctx.stroke();
    const txt = T('面積 = 等待時間總和 = ', 'area = total waiting time = ') + fmt(area, 1);
    D.pill(ctx, txt, L.x1, top + h + 18, C.accent, 'right', fnt(11.5, 600));
  }
  function drawCursor(t) {
    if (t <= 0) return;
    const x = Math.round(X(t)) + 0.5;
    ctx.save();
    ctx.strokeStyle = alpha(C.accent, 0.85); ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, L.gTop - 14); ctx.lineTo(x, L.qTop + L.qH); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(x - 5, L.gTop - 18); ctx.lineTo(x + 5, L.gTop - 18); ctx.lineTo(x, L.gTop - 12); ctx.closePath();
    ctx.fillStyle = C.accent; ctx.fill();
  }

  // ---------- 並排比較圖 ----------
  let dirty2 = true, dirty3 = true;
  function layout2() {
    const narrow = cw2 < 560;
    const rowH = narrow ? 34 : 34, top = 6;
    const labW = narrow ? 76 : 120, valW = narrow ? 52 : 150;
    return { narrow: narrow, rowH: rowH, top: top, labW: labW, valW: valW, gx0: labW + 4, gx1: cw2 - valW - 10, H: top + 6 * rowH + 26 };
  }
  function draw2() {
    const M = layout2();
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx2, cw2, ch2);
    const all = state.all;
    const span = M.gx1 - M.gx0, Xc = function (t) { return M.gx0 + span * t / state.Tmax; };
    let best = Infinity, maxW = 0;
    ALGOS.forEach(function (a) { best = Math.min(best, all[a].avgW); maxW = Math.max(maxW, all[a].avgW); });
    ALGOS.forEach(function (a, k) {
      const y = M.top + k * M.rowH, r = all[a];
      if (a === state.algo) {
        D.roundRect(ctx2, 3, y + 1, cw2 - 6, M.rowH - 2, 7);
        ctx2.fillStyle = alpha(C.accent, D.dark ? 0.16 : 0.1); ctx2.fill();
        ctx2.strokeStyle = alpha(C.accent, 0.6); ctx2.lineWidth = 1.2; ctx2.stroke();
      }
      ctx2.textAlign = 'left'; ctx2.textBaseline = 'middle';
      ctx2.font = fnt(M.narrow ? 12 : 13, 700); ctx2.fillStyle = C.text;
      const main = T(SHORT[a][0], SHORT[a][1]);
      ctx2.fillText(M.narrow && a === 'pp' ? T('優先權', 'Priority') : main, 10, y + M.rowH / 2 - (M.narrow ? 6 : 0));
      if (M.narrow) {
        ctx2.font = fnt(9.5); ctx2.fillStyle = C.muted;
        ctx2.fillText(T(SUB[a][0], SUB[a][1]), 10, y + M.rowH / 2 + 8);
      } else {
        ctx2.font = fnt(11); ctx2.fillStyle = C.muted;
        const w0 = (function () { ctx2.font = fnt(13, 700); const w = ctx2.measureText(main).width; ctx2.font = fnt(11); return w; })();
        const sub = a === 'pp' ? '' : T(SUB[a][0], SUB[a][1]);
        if (w0 + 8 + ctx2.measureText(sub).width < M.labW) ctx2.fillText(sub, 10 + w0 + 6, y + M.rowH / 2 + 1);
        else if (a !== 'pp') { /* 放不下就不寫副標 */ }
      }
      // 迷你甘特圖
      const gy = y + 8, gh = M.rowH - 16;
      D.roundRect(ctx2, M.gx0 - 2, gy - 2, Xc(r.makespan) - M.gx0 + 4, gh + 4, 4);
      ctx2.fillStyle = alpha(C.text, 0.04); ctx2.fill();
      r.segs.forEach(function (s) {
        const u = Xc(s.t0), v = Xc(s.t1);
        if (s.kind === 'run') procBlock(ctx2, u, gy, v - u, gh, s.p, { r: 2.5, label: String(s.p + 1), fs: 10, minW: 13 });
        else if (s.kind === 'cs') swBlock(ctx2, u, gy + 2, v - u, gh - 4);
        else idleBlock(ctx2, u, gy + 1, v - u, gh - 2, '');
      });
      // 平均等待時間
      const vx = cw2 - M.valW - 4;
      const isBest = Math.abs(r.avgW - best) < 1e-9;
      if (!M.narrow) {
        const bw = (M.valW - 62) * (maxW > 0 ? r.avgW / maxW : 0);
        const bg = ctx2.createLinearGradient(0, y + 10, 0, y + M.rowH - 10);
        const bc = isBest ? C['cs-best'] : C.muted;
        bg.addColorStop(0, shade(bc, 0.25)); bg.addColorStop(1, shade(bc, -0.1));
        D.roundRect(ctx2, vx + 4, y + 11, Math.max(2, bw), M.rowH - 22, 3);
        ctx2.fillStyle = bg; ctx2.fill();
      }
      ctx2.font = fnt(12.5, 700); ctx2.textAlign = 'right'; ctx2.textBaseline = 'middle';
      ctx2.fillStyle = isBest ? C['cs-best'] : C.text;
      ctx2.fillText((isBest ? '★ ' : '') + fmt(r.avgW, 2), cw2 - 8, y + M.rowH / 2);
    });
    // 時間軸與欄名
    const ay = M.top + 6 * M.rowH + 3;
    ctx2.strokeStyle = alpha(C.text, 0.3); ctx2.lineWidth = 1;
    ctx2.beginPath(); ctx2.moveTo(M.gx0, ay + 0.5); ctx2.lineTo(M.gx1, ay + 0.5); ctx2.stroke();
    const ppu = span / state.Tmax, steps = [1, 2, 5, 10, 20, 25, 50, 100];
    let step = 100;
    for (let i = 0; i < steps.length; i++) if (steps[i] * ppu >= 24) { step = steps[i]; break; }
    ctx2.font = fnt(10); ctx2.fillStyle = C.muted; ctx2.textAlign = 'center'; ctx2.textBaseline = 'top';
    ctx2.beginPath();
    for (let v = 0; v <= state.Tmax + 1e-9; v += step) { const x = Math.round(Xc(v)) + 0.5; ctx2.moveTo(x, ay); ctx2.lineTo(x, ay + 4); ctx2.fillText(String(v), x, ay + 5); }
    ctx2.stroke();
    ctx2.textAlign = 'right';
    ctx2.fillText(M.narrow ? T('等待', 'wait') : T('平均等待時間', 'avg waiting time'), cw2 - 8, ay + 5);
  }

  // ---------- 時間片圖 ----------
  function draw3() {
    ctx3.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx3, cw3, ch3);
    const narrow = cw3 < 560;
    const l = narrow ? 34 : 44, r = narrow ? 30 : 44, top = 16, bot = 34;
    const x0 = l, x1 = cw3 - r, y0 = top, y1 = ch3 - bot;
    const sc = state.scan, W = sc.avgW, SW = sc.switches;
    const fc = state.all.fcfs.avgW, sr = state.all.srtf.avgW;
    let maxW = Math.max(fc, sr);
    W.forEach(function (v) { maxW = Math.max(maxW, v); });
    const yMax = niceStep(maxW * 1.1 || 1);
    let maxSw = 1; SW.forEach(function (v) { maxSw = Math.max(maxSw, v); });
    const swMax = niceStep(maxSw * 1.05);
    const xq = function (q) { return x0 + (x1 - x0) * (q - 0.5) / 20; };
    const yw = function (v) { return y1 - (y1 - y0) * v / yMax; };
    const ys = function (v) { return y1 - (y1 - y0) * v / swMax; };
    // 格線與座標
    const ticks = niceTicks(yMax);
    ctx3.font = fnt(10.5); ctx3.textBaseline = 'middle';
    ticks.forEach(function (v) {
      const y = Math.round(yw(v)) + 0.5;
      ctx3.strokeStyle = alpha(C.text, v === 0 ? 0.3 : 0.08); ctx3.lineWidth = 1;
      ctx3.beginPath(); ctx3.moveTo(x0, y); ctx3.lineTo(x1, y); ctx3.stroke();
      ctx3.fillStyle = C.muted; ctx3.textAlign = 'right'; ctx3.fillText(String(v), x0 - 5, y);
    });
    niceTicks(swMax).forEach(function (v) {
      ctx3.fillStyle = alpha(C['cs-sw'], 0.95); ctx3.textAlign = 'left'; ctx3.fillText(String(v), x1 + 5, ys(v));
    });
    // 切換次數（長條）
    const bw = (x1 - x0) / 20 * 0.6;
    SW.forEach(function (v, k) {
      const x = xq(k + 1) - bw / 2, y = ys(v);
      const g = ctx3.createLinearGradient(0, y, 0, y1);
      g.addColorStop(0, alpha(C['cs-sw'], 0.42)); g.addColorStop(1, alpha(C['cs-sw'], 0.16));
      D.roundRect(ctx3, x, y, bw, y1 - y, 2); ctx3.fillStyle = g; ctx3.fill();
    });
    // FCFS、SRTF 參考線
    ctx3.save();
    ctx3.setLineDash([6, 4]); ctx3.strokeStyle = C.p[1]; ctx3.lineWidth = 1.6;
    ctx3.beginPath(); ctx3.moveTo(x0, yw(fc)); ctx3.lineTo(x1, yw(fc)); ctx3.stroke();
    ctx3.setLineDash([2, 3]); ctx3.strokeStyle = C.p[2]; ctx3.lineWidth = 2;
    ctx3.beginPath(); ctx3.moveTo(x0, yw(sr)); ctx3.lineTo(x1, yw(sr)); ctx3.stroke();
    ctx3.restore();
    // 目前的 q
    const xc = xq(state.q);
    ctx3.strokeStyle = alpha(C.accent, 0.5); ctx3.lineWidth = 1;
    ctx3.beginPath(); ctx3.moveTo(Math.round(xc) + 0.5, y0 - 4); ctx3.lineTo(Math.round(xc) + 0.5, y1); ctx3.stroke();
    // 平均等待時間折線（管狀）
    const path = function () { ctx3.beginPath(); W.forEach(function (v, k) { const x = xq(k + 1), y = yw(v); if (k) ctx3.lineTo(x, y); else ctx3.moveTo(x, y); }); };
    path(); ctx3.strokeStyle = alpha(shade(C.accent, -0.3), 0.6); ctx3.lineWidth = 4; ctx3.stroke();
    path(); ctx3.strokeStyle = C.accent; ctx3.lineWidth = 2; ctx3.stroke();
    let minW = Infinity; W.forEach(function (v) { minW = Math.min(minW, v); });
    W.forEach(function (v, k) {
      const isMin = Math.abs(v - minW) < 1e-9, isCur = k + 1 === state.q;
      if (isMin) { ctx3.beginPath(); ctx3.arc(xq(k + 1), yw(v), 7, 0, Math.PI * 2); ctx3.strokeStyle = C['cs-best']; ctx3.lineWidth = 1.6; ctx3.stroke(); }
      D.ball(ctx3, xq(k + 1), yw(v), isCur ? 5 : 3.2, C.accent, { shadow: isCur });
    });
    // x 軸
    ctx3.font = fnt(10.5); ctx3.fillStyle = C.muted; ctx3.textAlign = 'center'; ctx3.textBaseline = 'top';
    for (let q = 1; q <= 20; q++) if (!narrow || q === 1 || q % 2 === 0) ctx3.fillText(String(q), xq(q), y1 + 4);
    ctx3.fillText(T('時間片 q', 'time quantum q'), (x0 + x1) / 2, y1 + 18);
    ctx3.textAlign = 'left'; ctx3.textBaseline = 'alphabetic'; ctx3.fillStyle = C.muted;
    ctx3.fillText(T('平均等待', 'avg wait'), 4, 11);
    ctx3.textAlign = 'right'; ctx3.fillStyle = alpha(C['cs-sw'], 0.95);
    ctx3.fillText(T('切換次數', 'switches'), cw3 - 4, 11);
    // 參考線的標籤
    const lab1 = D.pill(ctx3, 'FCFS ' + fmt(fc, 2), x1 - 4, yw(fc) - 3, C.p[1], 'right', fnt(10.5, 600));
    let ySr = yw(sr) + 17;
    if (ySr > y1 - 2) ySr = yw(sr) - 3;
    if (Math.abs(ySr - (yw(fc) - 3)) < 16) ySr = yw(fc) - 3 + (ySr > yw(fc) ? 17 : -17);
    D.pill(ctx3, 'SRTF ' + fmt(sr, 2), lab1.x - 4, ySr, C.p[2], 'right', fnt(10.5, 600));
    const yq = yw(W[state.q - 1]);
    const left = xc > (x0 + x1) / 2;
    D.pill(ctx3, 'q = ' + state.q + '：' + fmt(W[state.q - 1], 2), xc + (left ? -8 : 8), Math.max(y0 + 16, yq - 9), C.accent, left ? 'right' : 'left', fnt(11, 700));
  }
  function niceStep(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function niceTicks(max) {
    const step = niceStep(max / 4);
    const out = [];
    for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
    return out;
  }

  // ---------- 重畫排程 ----------
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  let lastTs = 0;
  function frame(ts) {
    // 畫這一幀的期間，requestDraw() 不另外排程（否則播放時每一幀會排兩次、越排越多）；結束時再決定要不要排下一幀
    raf = -1;
    try {
      if (state.playing) {
        const dt = lastTs ? Math.min(1 / 30, (ts - lastTs) / 1000) : 0;
        lastTs = ts;
        advance(state.t + dt * state.speed);
      } else lastTs = 0;
      draw();
      if (dirty2) { draw2(); dirty2 = false; }
      if (dirty3) { draw3(); dirty3 = false; }
    } finally {
      raf = state.playing || state.fx.length ? requestAnimationFrame(frame) : 0;
    }
  }

  // =====================================================================
  // 時間的推進、音效與說明
  // =====================================================================
  function eventsBetween(a, b) {
    return state.res.events.filter(function (e) { return e.t > a + 1e-9 && e.t <= b + 1e-9; });
  }
  function advance(nt) {
    const res = state.res;
    const old = state.t;
    nt = Math.min(nt, res.makespan);
    state.t = nt;
    const evs = eventsBetween(old, nt);
    if (evs.length) { feedback(evs); say(describeAt(evs[evs.length - 1].t)); }
    if (nt >= res.makespan - 1e-9) finish('play');
    updateTime();
  }
  let lastSound = 0;
  function feedback(evs) {
    const S = window.LabSound && window.LabSound.enabled() ? window.LabSound : null;
    const now = performance.now();
    evs.forEach(function (e) {
      if (e.type === 'finish' && !reducedMotion()) state.fx.push({ t: e.t, p: e.p, at: now });
    });
    if (!S || now - lastSound < 70) return;
    lastSound = now;
    const fin = evs.filter(function (e) { return e.type === 'finish'; }).pop();
    const sw = evs.some(function (e) { return e.type === 'preempt' || e.type === 'expire'; });
    const arr = evs.filter(function (e) { return e.type === 'arrive'; }).pop();
    const st = evs.filter(function (e) { return e.type === 'start'; }).pop();
    if (fin) { S.tone({ freq: 660, dur: 0.09, type: 'sine', gain: 0.18 }); S.tone({ freq: 990, dur: 0.14, type: 'sine', gain: 0.16, delay: 0.08 }); }
    else if (sw) S.noise({ dur: 0.05, gain: 0.22, filter: 2600, q: 1.4 });
    else if (arr) S.tone({ freq: 520 + 60 * arr.p, dur: 0.07, type: 'triangle', gain: 0.14 });
    else if (st) S.tone({ freq: 880, dur: 0.04, type: 'square', gain: 0.05 });
  }
  function reasonOf(p) {
    const a = state.algo;
    if (a === 'fcfs' || a === 'rr') return T('（排在佇列最前面）', ' (front of the queue)');
    if (a === 'sjf') return T('（執行時間最短）', ' (shortest burst)');
    if (a === 'srtf') return T('（剩餘時間最短）', ' (least time left)');
    return T('（優先權數字最小：', ' (smallest priority number: ') + state.procs[p].pri + T('）', ')');
  }
  function describeAt(t) {
    const evs = state.res.events.filter(function (e) { return Math.abs(e.t - t) < 1e-9; });
    if (!evs.length) return '';
    const parts = evs.map(function (e) {
      const P = 'P' + (e.p + 1);
      if (e.type === 'arrive') return P + T(' 到達', ' arrives');
      if (e.type === 'start') return P + T(' 開始執行', ' starts running') + reasonOf(e.p);
      if (e.type === 'preempt') return P + T(' 被 ', ' is preempted by ') + 'P' + (e.by + 1) + (state.algo === 'srtf' ? T(' 搶先（剩餘時間更短），回到佇列', ' (less time left) and goes back to the queue') : T(' 搶先（優先權更高），回到佇列', ' (more urgent) and goes back to the queue'));
      if (e.type === 'expire') return P + T(' 用完時間片，回到佇列最後面', ' uses up its quantum and goes to the back of the queue');
      if (e.type === 'renew') return P + T(' 用完時間片，但沒有別人在等，繼續做', ' uses up its quantum, but nobody else is waiting, so it carries on');
      return P + T(' 做完了', ' finishes');
    });
    const seg = state.res.segs.find(function (s) { return s.kind === 'cs' && Math.abs(s.t0 - t) < 1e-9; });
    if (seg) parts.push(T('情境切換 ', 'context switch for ') + fmt(state.cs, 1) + T(' 個時間單位', ' time units'));
    return 't = ' + fmt(t, 1) + T('：', ': ') + parts.join(T('；', '; ')) + T('。', '.');
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
    if (state.t >= state.res.makespan - 1e-9) { state.t = 0; state.atEnd = false; state.logged = false; }
    state.playing = true; lastTs = 0; setPlayLabel(); requestDraw();
  }
  function stopPlay() { state.playing = false; setPlayLabel(); }
  function finish(src) {
    state.t = state.res.makespan;
    const was = state.atEnd;
    state.atEnd = true;
    stopPlay();
    if (!state.logged || !was) { addLog(); state.logged = true; }
    emitRun(src);
    const S = window.LabSound && window.LabSound.enabled() ? window.LabSound : null;
    if (S) S.sweep({ from: 420, to: 1100, dur: 0.3, gain: 0.14 });
    say(T('全部完成：平均等待時間 ', 'All done: average waiting time ') + fmt(state.res.avgW, 2) + T('，平均周轉時間 ', ', average turnaround ') + fmt(state.res.avgT, 2) + T('，平均回應時間 ', ', average response ') + fmt(state.res.avgR, 2) + T('。', '.'));
    updateTime();
  }
  function stepFwd() {
    stopPlay();
    const res = state.res;
    if (state.t >= res.makespan - 1e-9) { state.t = 0; state.atEnd = false; state.logged = false; }
    const nt = state.times.find(function (v) { return v > state.t + 1e-9; });
    const target = nt == null ? res.makespan : nt;
    const evs = eventsBetween(state.t, target);
    state.t = target;
    feedback(evs);
    say(describeAt(target));
    if (target >= res.makespan - 1e-9) finish('step');
    else updateTime();
  }
  function stepBack() {
    stopPlay();
    let pv = 0;
    state.times.forEach(function (v) { if (v < state.t - 1e-9) pv = v; });
    state.t = pv;
    state.atEnd = false;
    say(pv > 0 ? describeAt(pv) : T('回到 t = 0。', 'Back to t = 0.'));
    updateTime();
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  const pick = function (r) { return { avgW: r.avgW, avgT: r.avgT, avgR: r.avgR, switches: r.switches, preempts: r.preempts, expires: r.expires, gap: r.gap, csTime: r.csTime, makespan: r.makespan, fin: r.fin.slice(), wait: r.wait.slice() }; };
  function eventData(src) {
    const r = state.res, P = state.procs, all = {};
    ALGOS.forEach(function (a) { all[a] = pick(state.all[a]); });
    let zero = {};
    const z = state.cs > 0 ? K.runAll(P, { q: state.q, cs: 0, tie: state.tie }) : state.all;
    ALGOS.forEach(function (a) { zero[a] = z[a].avgW; });
    const other = state.algo === 'rr' ? K.schedule(P, 'rr', { q: state.q, cs: state.cs, tie: state.tie === 'new' ? 'old' : 'new' }) : r;
    const keys = {};
    ALGOS.forEach(function (a) { keys[K.ganttKey(state.all[a])] = true; });
    const kinds = Object.keys(keys).length;
    return {
      src: src, algo: state.algo, q: state.q, cs: state.cs, tie: state.tie, n: P.length,
      arr: P.map(function (p) { return p.arr; }), burst: P.map(function (p) { return p.burst; }), pri: P.map(function (p) { return p.pri; }),
      sheet: state.sheetSrc, edits: state.edits,
      avgW: r.avgW, avgT: r.avgT, avgR: r.avgR, maxW: r.maxW,
      wait: r.wait.slice(), tat: r.tat.slice(), resp: r.resp.slice(), fin: r.fin.slice(), first: r.first.slice(),
      switches: r.switches, preempts: r.preempts, expires: r.expires, gap: r.gap, idle: r.idle, csTime: r.csTime, csShare: r.csShare,
      makespan: r.makespan, util: r.util,
      sameAsFcfs: K.sameGantt(r, state.all.fcfs),
      renews: r.ticks.length,
      ganttKinds: kinds,
      otherTieW: other.avgW,
      all: all, zero: zero,
      rrW: state.scan.avgW.slice(), rrSw: state.scan.switches.slice()
    };
  }
  function emitRun(src) {
    clearTimeout(emitTimer);
    if (window.LabMission) window.LabMission.emit('run', eventData(src));
  }
  let emitTimer = 0;
  function emitLater() { clearTimeout(emitTimer); emitTimer = setTimeout(function () { emitRun('update'); }, 250); }

  // =====================================================================
  // 設定改變
  // =====================================================================
  /** 工作表或設定改了：已經跑到最後就直接顯示新結果（並送出任務事件），否則回到 t = 0 */
  function changed() {
    stopPlay();
    recompute();
    if (state.atEnd) {
      state.t = state.res.makespan;
      addLog();
      emitLater();
      say(T('已更新：平均等待時間 ', 'Updated: average waiting time ') + fmt(state.res.avgW, 2) + T('。', '.'));
    } else {
      state.t = 0;
      say('');
    }
    dirty2 = dirty3 = true;
    if (L) resize(); else requestDraw();
    updateAll();
  }

  // ---------- 演算法 ----------
  const algoBtns = Array.prototype.slice.call(document.querySelectorAll('#algos button'));
  algoBtns.forEach(function (b) {
    b.addEventListener('click', function () { setAlgo(b.getAttribute('data-algo')); });
  });
  function setAlgo(a) {
    if (ALGOS.indexOf(a) < 0) return;
    state.algo = a;
    algoBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-algo') === a)); });
    renderSheet();
    changed();
  }

  // ---------- 工作表 ----------
  const elN = $('nn'), elQ = $('qq'), elCs = $('csw'), elSpeed = $('speed');
  function renderSheet() {
    const tb = $('sheet');
    const usePri = state.algo === 'pn' || state.algo === 'pp';
    let h = '<thead><tr><th scope="col">' + T('行程', 'Process') + '</th><th scope="col">' + T('到達時間', 'Arrival') + '</th><th scope="col">' + T('執行時間', 'Burst') + '</th><th scope="col">' + T('優先權', 'Priority') + '</th></tr></thead><tbody>';
    state.procs.forEach(function (p, i) {
      const lab = 'P' + (i + 1);
      h += '<tr class="' + (usePri ? '' : 'dim') + '"><td class="pid"><span class="chip" style="background:var(--cs-p' + (i + 1) + ')"></span>' + lab + '</td>' +
        '<td><input type="number" inputmode="numeric" min="0" max="' + LIM.arrMax + '" step="1" data-i="' + i + '" data-k="arr" value="' + p.arr + '" aria-label="' + lab + T(' 的到達時間', ' arrival time') + '"></td>' +
        '<td><input type="number" inputmode="numeric" min="1" max="' + LIM.burstMax + '" step="1" data-i="' + i + '" data-k="burst" value="' + p.burst + '" aria-label="' + lab + T(' 的執行時間', ' burst time') + '"></td>' +
        '<td class="pri"><input type="number" inputmode="numeric" min="1" max="' + LIM.priMax + '" step="1" data-i="' + i + '" data-k="pri" value="' + p.pri + '" aria-label="' + lab + T(' 的優先權', ' priority') + '"></td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }
  $('sheet').addEventListener('change', function (ev) {
    const el = ev.target;
    if (!el || el.tagName !== 'INPUT') return;
    const i = +el.getAttribute('data-i'), k = el.getAttribute('data-k');
    const p = state.procs[i];
    if (!p) return;
    const raw = el.value.trim();
    const v = raw === '' ? NaN : +raw;
    const lo = k === 'arr' ? 0 : 1, hi = k === 'arr' ? LIM.arrMax : k === 'burst' ? LIM.burstMax : LIM.priMax;
    const nv = isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : p[k];
    if (!isFinite(v) || nv !== v) { el.classList.add('bad'); setTimeout(function () { el.classList.remove('bad'); }, 900); }
    el.value = nv;
    if (nv === p[k]) return;
    p[k] = nv;
    state.sheetSrc = 'hand'; state.edits++; state.preset = '';
    updateSeed();
    changed();
  });
  function setN(n) {
    n = Math.max(LIM.nMin, Math.min(LIM.nMax, Math.round(n)));
    if (n === state.procs.length) return;
    while (state.procs.length > n) state.procs.pop();
    while (state.procs.length < n) state.procs.push(K.randomProc(state.seed + 1000, state.procs.length));
    $('nno').textContent = String(n);
    renderSheet();
    changed();
  }
  elN.addEventListener('input', function () { setN(val(elN)); });
  $('rand').addEventListener('click', function () {
    state.seed++;
    state.procs = K.randomSheet(state.seed, state.procs.length);
    state.sheetSrc = 'random'; state.edits = 0; state.preset = '';
    $('preset').value = '';
    renderSheet(); updateSeed(); changed();
  });
  $('preset').addEventListener('change', function () {
    const k = $('preset').value;
    if (!PRESETS[k]) return;
    state.procs = toProcs(PRESETS[k]);
    state.sheetSrc = 'preset'; state.edits = 0; state.preset = k;
    if (window.LabNum) window.LabNum.set(elN, state.procs.length); else elN.value = state.procs.length;
    $('nno').textContent = String(state.procs.length);
    renderSheet(); updateSeed(); changed();
  });
  function updateSeed() {
    const s = state.sheetSrc;
    $('seedInfo').textContent = s === 'random' ? T('隨機工作表 #', 'Random table #') + state.seed
      : s === 'preset' ? T('範例：', 'Example: ') + T(PRESET_NAME[state.preset][0], PRESET_NAME[state.preset][1])
        : s === 'hand' ? T('自己填的工作表', 'Your own table') : T('預設的工作表', 'Default table');
  }

  // ---------- 排程設定 ----------
  elQ.addEventListener('input', function () { state.q = Math.round(val(elQ)); $('qqo').textContent = String(state.q); changed(); });
  elCs.addEventListener('input', function () { state.cs = Math.round(val(elCs) * 2) / 2; $('cswo').textContent = fmt(state.cs, 1); changed(); });
  $('tieOld').addEventListener('change', function () { state.tie = $('tieOld').checked ? 'old' : 'new'; changed(); });
  elSpeed.addEventListener('input', function () { state.speed = Math.max(0.5, val(elSpeed)); $('speedo').textContent = fmt(state.speed, 1); });

  // ---------- 播放列 ----------
  $('play').addEventListener('click', function () { if (state.playing) stopPlay(); else startPlay(); });
  $('step').addEventListener('click', stepFwd);
  $('back').addEventListener('click', stepBack);
  $('toEnd').addEventListener('click', function () {
    const evs = eventsBetween(state.t, state.res.makespan);
    if (evs.length && !reducedMotion()) evs.filter(function (e) { return e.type === 'finish'; }).forEach(function (e) { state.fx.push({ t: e.t, p: e.p, at: performance.now() }); });
    finish('end');
  });
  $('reset').addEventListener('click', function () { stopPlay(); state.t = 0; state.atEnd = false; state.logged = false; say(T('回到 t = 0。', 'Back to t = 0.')); updateTime(); });
  $('clear').addEventListener('click', function () {
    stopPlay(); state.log = []; state.t = 0; state.atEnd = false; state.logged = false;
    renderLog(); say(T('紀錄已清除，回到 t = 0。', 'Records cleared; back to t = 0.')); updateTime();
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
  // 並排比較圖：點一列換成那種方法
  cv2.addEventListener('click', function (ev) {
    const M = layout2(), rect = cv2.getBoundingClientRect();
    const y = ev.clientY - rect.top;
    const k = Math.floor((y - M.top) / M.rowH);
    if (k >= 0 && k < ALGOS.length) setAlgo(ALGOS[k]);
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
    const r = state.res, t = state.t;
    const pct = function (v) { return fmt(v * 100, 1) + '%'; };
    const rows = [
      [T('目前時間 t', 'Current time t'), fmt(t, 1) + ' <small>/ ' + fmt(r.makespan, 1) + '</small>'],
      [T('平均等待時間', 'Average waiting time'), fmt(r.avgW, 2)],
      [T('平均周轉時間', 'Average turnaround time'), fmt(r.avgT, 2)],
      [T('平均回應時間', 'Average response time'), fmt(r.avgR, 2)],
      [T('最長的等待時間', 'Longest waiting time'), fmt(r.maxW, 2)],
      [T('情境切換次數', 'Context switches'), r.switches + (r.preempts + r.expires ? ' <small>' + T('（中途換下 ', '(cut off ') + (r.preempts + r.expires) + T(' 次）', ')') + '</small>' : '')],
      [T('切換花掉的時間', 'Time spent switching'), fmt(r.csTime, 1) + ' <small>' + pct(r.csShare) + '</small>'],
      [T('CPU 閒置時間', 'CPU idle time'), fmt(r.idle, 1)],
      [T('CPU 使用率', 'CPU utilization'), pct(r.util)]
    ];
    $('ro').innerHTML = rows.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('');
    const ws = r.wait.map(function (w) { return fmt(w, 1); });
    const sum = r.wait.reduce(function (s, v) { return s + v; }, 0);
    // 平均剛好是兩位小數以內的值就寫「=」，否則寫「≈」；行程多時分兩行，免得公式被切掉
    const exact = Math.abs(sum / r.n - Math.round(sum / r.n * 100) / 100) < 1e-9;
    const tail = '\\frac{' + fmt(sum, 1) + '}{' + r.n + '}' + (exact ? ' = ' : ' \\approx ') + fmt(r.avgW, 2);
    if (r.n <= 4) setEq('\\overline{W} = \\frac{' + ws.join(' + ') + '}{' + r.n + '} = ' + tail);
    else setEq('\\begin{aligned} \\overline{W} &= \\tfrac{1}{' + r.n + '}\\,(' + ws.join(' + ') + ') \\\\ &= ' + tail + ' \\end{aligned}');
    $('eqNote').textContent = T('每個行程的等待時間 = 周轉時間 − 執行時間 = 完成 − 到達 − 執行。', 'Waiting time of each process = turnaround − burst = completion − arrival − burst.');
  }
  function updateProcTable() {
    const r = state.res, t = state.t, P = state.procs;
    const st = K.stateAt(r, t);
    let h = '<thead><tr><th>' + T('行程', 'Process') + '</th><th>' + T('到達', 'Arrive') + '</th><th>' + T('執行', 'Burst') + '</th><th>' + T('開始', 'Start') + '</th><th>' + T('完成', 'Finish') +
      '</th><th>' + T('周轉', 'Turn&shy;around') + '</th><th>' + T('等待', 'Wait') + '</th><th>' + T('回應', 'Response') + '</th></tr></thead><tbody>';
    P.forEach(function (p, i) {
      const started = r.first[i] <= t + 1e-9 && t > 0, done = r.fin[i] <= t + 1e-9 && t > 0;
      const cur = st.state === 'run' && st.cur === i;
      const d = function (v, ok) { return ok ? '<td>' + fmt(v, 1) + '</td>' : '<td class="pend">—</td>'; };
      h += '<tr' + (cur ? ' class="cur"' : '') + '><td><span class="chip" style="background:var(--cs-p' + (i + 1) + ')"></span>P' + (i + 1) + '</td><td>' + p.arr + '</td><td>' + p.burst + '</td>' +
        d(r.first[i], started) + d(r.fin[i], done) + d(r.tat[i], done) + d(r.wait[i], done) + d(r.resp[i], started) + '</tr>';
    });
    $('procTable').innerHTML = h + '</tbody>';
  }
  function updateCmpTable() {
    const all = state.all;
    const best = { avgW: Infinity, avgT: Infinity, avgR: Infinity };
    ALGOS.forEach(function (a) { Object.keys(best).forEach(function (k) { best[k] = Math.min(best[k], all[a][k]); }); });
    let h = '<thead><tr><th>' + T('方法', 'Algorithm') + '</th><th>' + T('平均<br>等待', 'Avg<br>wait') + '</th><th>' + T('平均<br>周轉', 'Avg turn&shy;around') + '</th><th>' + T('平均<br>回應', 'Avg<br>response') +
      '</th><th>' + T('切換<br>次數', 'Switches') + '</th><th>' + T('CPU<br>使用率', 'CPU<br>use') + '</th></tr></thead><tbody>';
    ALGOS.forEach(function (a) {
      const r = all[a];
      const c = function (k) { return '<td' + (Math.abs(r[k] - best[k]) < 1e-9 ? ' class="best"' : '') + '>' + fmt(r[k], 2) + '</td>'; };
      h += '<tr' + (a === state.algo ? ' class="cur"' : '') + '><td>' + nm(a) + (a === 'rr' ? ' <small>q = ' + state.q + '</small>' : '') + '</td>' + c('avgW') + c('avgT') + c('avgR') +
        '<td>' + r.switches + '</td><td>' + fmt(r.util * 100, 1) + '%</td></tr>';
    });
    $('cmpTable').innerHTML = h + '</tbody>';
    let bestA = ALGOS.filter(function (a) { return Math.abs(all[a].avgW - best.avgW) < 1e-9; });
    $('cmpNote').textContent = T('平均等待最少：', 'Least average wait: ') + bestA.map(nm).join(T('、', ', '));
    const W = state.scan.avgW;
    let mw = Infinity; W.forEach(function (v) { mw = Math.min(mw, v); });
    const qs = []; W.forEach(function (v, k) { if (Math.abs(v - mw) < 1e-9) qs.push(k + 1); });
    $('scanNote').textContent = T('最少的平均等待 ', 'Least average wait ') + fmt(mw, 2) + T('，在 q = ', ' at q = ') + (qs.length > 4 ? qs.slice(0, 3).join(', ') + '…' : qs.join(', '));
  }
  function addLog() {
    const r = state.res;
    // 同一張表、同樣設定的結果已經是最後一列，就不再重複記錄
    const key = state.procs.map(function (p) { return p.arr + ',' + p.burst + ',' + p.pri; }).join(';') + '|' + state.algo + '|' + state.q + '|' + state.cs + '|' + state.tie;
    const last = state.log[state.log.length - 1];
    if (last && last.key === key) return;
    state.log.push({ key: key, algo: state.algo, q: state.q, cs: state.cs, tie: state.tie, n: state.procs.length, w: r.avgW, tt: r.avgT, rr: r.avgR, sw: r.switches });
    if (state.log.length > 40) state.log.shift();
    renderLog();
  }
  function renderLog() {
    const tb = $('logTable');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { tb.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('方法', 'Algorithm') + '</th><th>n</th><th>q</th><th>' + T('切換<br>成本', 'Switch<br>cost') + '</th><th>' + T('平均<br>等待', 'Avg<br>wait') +
      '</th><th>' + T('平均<br>周轉', 'Avg turn&shy;around') + '</th><th>' + T('平均<br>回應', 'Avg<br>response') + '</th><th>' + T('切換<br>次數', 'Switches') + '</th></tr></thead><tbody>';
    state.log.slice().reverse().forEach(function (x, k) {
      h += '<tr><td>' + (state.log.length - k) + '</td><td>' + nm(x.algo) + '</td><td>' + x.n + '</td><td>' + (x.algo === 'rr' ? x.q : '—') + '</td><td>' + fmt(x.cs, 1) + '</td><td>' + fmt(x.w, 2) +
        '</td><td>' + fmt(x.tt, 2) + '</td><td>' + fmt(x.rr, 2) + '</td><td>' + x.sw + '</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }
  function updateTime() {
    updateReadouts();
    updateProcTable();
    requestDraw();
  }
  function updateAll() {
    updateCmpTable();
    updateTime();
  }

  // ---------- 鍵盤（畫布上左右鍵 = 上一步／單步） ----------
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('排程畫布。方向鍵右：前進到下一個排程事件；方向鍵左：回到上一個。', 'Scheduling canvas. Right arrow: go to the next scheduling event; left arrow: go back to the previous one.'),
      items: [{
        name: function () { return T('時間', 'Time'); },
        move: function (dx) { if (dx > 0) stepFwd(); else if (dx < 0) stepBack(); else return false; return true; },
        describe: function () { return 't = ' + fmt(state.t, 1) + '. ' + ($('status').textContent || ''); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // 給測試用的介面（不影響畫面；不要叫 __pt）
  window.CpuSchedLab = {
    state: state,
    setSheet: function (list) {
      state.procs = list.map(function (r) { return K.sanitize(Array.isArray(r) ? { arr: r[0], burst: r[1], pri: r[2] } : r); });
      state.sheetSrc = 'hand'; state.edits++;
      if (window.LabNum) window.LabNum.set(elN, state.procs.length); else elN.value = state.procs.length;
      $('nno').textContent = String(state.procs.length);
      renderSheet(); updateSeed(); changed();
    },
    setAlgo: setAlgo,
    setQ: function (q) { if (window.LabNum) window.LabNum.set(elQ, q); else elQ.value = q; elQ.dispatchEvent(new Event('input')); },
    setCs: function (c) { if (window.LabNum) window.LabNum.set(elCs, c); else elCs.value = c; elCs.dispatchEvent(new Event('input')); },
    toEnd: function () { $('toEnd').click(); },
    stepTo: function (t) { stopPlay(); state.t = Math.max(0, Math.min(t, state.res.makespan)); state.atEnd = false; updateTime(); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  state.q = Math.round(val(elQ)); $('qqo').textContent = String(state.q);
  state.cs = Math.round(val(elCs) * 2) / 2; $('cswo').textContent = fmt(state.cs, 1);
  state.speed = val(elSpeed); $('speedo').textContent = fmt(state.speed, 1);
  state.tie = $('tieOld').checked ? 'old' : 'new';
  const n0 = Math.round(val(elN));
  if (n0 !== state.procs.length) { if (window.LabNum) window.LabNum.set(elN, state.procs.length); else elN.value = state.procs.length; }
  $('nno').textContent = String(state.procs.length);
  renderSheet();
  updateSeed();
  recompute();
  renderLog();
  updateAll();
  updateSoundButton();
  setPlayLabel();
  say(T('按「播放」或「單步」，看 CPU 一步一步排程。', 'Press “Play” or “Step” to watch the CPU being scheduled step by step.'));
  function themeChanged() { readColors(); dirty2 = dirty3 = true; requestDraw(); }
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', themeChanged);
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2 || cv3.clientWidth !== cw3) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  }
  resize();
})();
