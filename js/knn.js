/* knn.js — 「k 最近鄰分類」的畫面與操作
 * 計算全部在 js/knn-core.js（Session、留一法、RegionJob）；這裡只負責畫、操作、音效、送任務事件。
 * 區域上色：先同步算一張 40 × 40 的粗略版，再每一幀用約 6 ms 算精細版（150 × 150）的幾列，畫面不會卡住。
 */
(function () {
  'use strict';
  const K = window.KnnCore, D = window.LabDraw;
  if (!K || !D) return;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade;
  const G = K.GRID;
  const L = 1.12;                 // 特徵平面畫出 [−L, L]²（資料點只能放在 [−1, 1]²）
  const REG_N = 150, REG_COARSE = 40;
  const fnt = function (px, w) { return (w || 500) + ' ' + px + 'px ' + FONT; };
  const now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
  const NAMES = ['A', 'B', 'C'];

  // =====================================================================
  // 狀態
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d'), cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const stage = $('stage');
  const state = {
    cls: 0, playing: false, rate: 4, acc: 0, lastT: 0, showRegion: true, showWrong: true,
    hover: null, drag: null, down: null, cursor: { gx: 0, gy: 0 }, sndAt: 0,
    lastPred: null, predAt: -1e9, walkAt: -1e9, ghosts: [], log: [], boxDirty: true
  };
  let C = {};
  const S = new K.Session({ emit: onEmit });
  S.loadPreset('blobs', true);     // 一打開是「兩團」（不送任何任務事件）

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['a', 'b', 'c', 'q', 'wrong', 'cur', 'ok', 'panel'].forEach(function (k) { C[k] = cs.getPropertyValue('--kn-' + k).trim() || '#888888'; });
    C.text = D.c.text; C.muted = D.c.muted; C.bg = D.c['canvas-bg']; C.border = D.c.border; C.accent = D.c.accent; C.surface = D.c.surface;
    reg.paintKey = '';
  }
  const COL = function (c) { return c === 0 ? C.a : c === 1 ? C.b : c === 2 ? C.c : C.muted; };
  const clsName = function (c) { return c >= 0 ? NAMES[c] : '—'; };
  const clsTxt = function (c) { return c >= 0 ? T(NAMES[c] + ' 類', 'class ' + NAMES[c]) : '—'; };

  // =====================================================================
  // 數字格式
  // =====================================================================
  function numTxt(v, d) {
    if (!isFinite(v)) return '∞';
    if (Math.abs(v) < 1e-12) return '0';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    return s + a.toFixed(d == null ? (a >= 100 ? 1 : a >= 10 ? 2 : 3) : d);
  }
  function pct(c, n) { return n ? (100 * c / n).toFixed(1) + '%' : '—'; }
  function x2Txt(gy) { return numTxt(gy / G * S.cfg.scale, S.cfg.scale === 100 ? 0 : 2); }
  function coordTxt(gx, gy) { return '(' + numTxt(gx / G, 2) + ', ' + x2Txt(gy) + ')'; }
  function cfgName(cfg) {
    return (cfg.metric === 'euclid' ? T('歐氏', 'Euclid') : T('曼哈頓', 'Manhattan')) + '・x2 × ' + cfg.scale + (cfg.std ? T('・標準化', '・std') : '');
  }
  const SET_NAME = function (s) {
    return { blobs: T('兩團', 'Two blobs'), three: T('三團', 'Three blobs'), moons: T('月牙', 'Moons'), checker: T('棋盤', 'Checkerboard'), noisy: T('有雜訊', 'Noisy'),
      custom: T('自訂', 'Custom'), empty: T('空的', 'Empty') }[s] || s;
  };

  // =====================================================================
  // 版面
  // =====================================================================
  let W = 600, H = 520, dpr = 1, cw2 = 0, ch2 = 170;
  const P = { x: 8, y: 8, s: 400, k: 100 };          // 特徵平面
  const NR = { x: 0, y: 0, w: 200, h: 200 };          // 最近的鄰居
  const VR = { x: 0, y: 0, w: 200, h: 200 };          // 投票
  let wide = true;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(280, cv.clientWidth || 600);
    wide = W >= 620;
    if (wide) {
      const side = Math.max(200, Math.min(250, W * 0.3));
      P.s = Math.min(W - side - 28, 560);
      P.x = 8; P.y = 8;
      H = P.s + 16;
      const cx = P.x + P.s + 16, cw = W - cx - 8;
      NR.x = cx; NR.y = 8; NR.w = cw; NR.h = Math.round(P.s * 0.56);
      VR.x = cx; VR.y = NR.y + NR.h + 10; VR.w = cw; VR.h = P.s - NR.h - 10;
    } else {
      P.s = W - 12; P.x = 6; P.y = 6;
      const hw = (W - 12 - 8) / 2;
      NR.x = 6; NR.y = P.y + P.s + 10; NR.w = hw; NR.h = 210;
      VR.x = 6 + hw + 8; VR.y = NR.y; VR.w = hw; VR.h = 210;
      H = NR.y + NR.h + 6;
    }
    P.k = P.s / (2 * L);
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cw2 = Math.max(260, cv2.clientWidth || W); ch2 = 170;
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    draw(); drawChart();
  }
  const X = function (x) { return P.x + P.s / 2 + x * P.k; };
  const Y = function (y) { return P.y + P.s / 2 - y * P.k; };
  const dataOf = function (px, py) { return { x: (px - P.x - P.s / 2) / P.k, y: (P.y + P.s / 2 - py) / P.k }; };
  function ptR() { return Math.max(5.5, Math.min(9, P.k * 0.045)); }

  // =====================================================================
  // 任務事件（Session 送出來的事件原封不動轉送）
  // =====================================================================
  function onEmit(type, data) {
    if (window.LabMission) window.LabMission.emit(type, data);
  }

  // =====================================================================
  // 音效（預設關；事件密集時節流）
  // =====================================================================
  function sound() { const s = window.LabSound; return s && s.enabled() ? s : null; }
  const PITCH = [523.25, 659.25, 783.99];
  function sndPred(c) {
    const s = sound(); if (!s || c < 0) return;
    const t = now(); if (t - state.sndAt < 90) return; state.sndAt = t;
    s.tone({ freq: PITCH[c], dur: 0.1, type: 'triangle', gain: 0.13 });
  }
  function sndPoint(add) { const s = sound(); if (s) s.tone({ freq: add ? 990 : 520, dur: 0.035, type: 'triangle', gain: 0.1 }); }
  function sndWalk(ok, fast) {
    const s = sound(); if (!s) return;
    const t = now(); if (fast && t - state.sndAt < 70) return; state.sndAt = t;
    if (ok) s.tone({ freq: 880, dur: 0.05, type: 'sine', gain: 0.09 });
    else s.sweep({ from: 440, to: 290, dur: 0.14, type: 'sawtooth', gain: 0.05 });
  }
  function sndDone(acc) {
    const s = sound(); if (!s) return;
    const notes = acc >= 0.9 ? [523.25, 659.25, 783.99, 1046.5] : acc >= 0.7 ? [523.25, 659.25, 783.99] : [392, 349.23];
    notes.forEach(function (f, i) { s.tone({ freq: f, dur: 0.15, type: 'sine', gain: 0.16, delay: 0.08 + i * 0.09 }); });
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
  // 文字說明
  // =====================================================================
  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg || ''; }, 20); }
  function presetMsg(name) {
    const n = S.serial[name];
    return {
      blobs: T('兩團（第 ' + n + ' 份）：A 在左、B 在右，兩團都拉得很長。', 'Two blobs (set ' + n + '): A on the left, B on the right, both stretched tall.'),
      three: T('三團（第 ' + n + ' 份）：A、B、C 三類排成三角形。', 'Three blobs (set ' + n + '): classes A, B and C in a triangle.'),
      moons: T('月牙（第 ' + n + ' 份）：兩個交錯的半圓，一條直線分不開，鄰居卻分得開。', 'Moons (set ' + n + '): two interlocking half-circles. No straight line separates them, but neighbours can.'),
      checker: T('棋盤（第 ' + n + ' 份）：四個象限交錯，像 XOR。', 'Checkerboard (set ' + n + '): the four quadrants alternate, like XOR.'),
      noisy: T('有雜訊（第 ' + n + ' 份）：有幾個點的類別被標反了。k = 1 會被它們騙。', 'Noisy (set ' + n + '): a few points carry the wrong label, and k = 1 is fooled by them.')
    }[name] || '';
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h, cls) {
    const el = $(id);
    if (lastHTML[id] !== h) { lastHTML[id] = h; el.innerHTML = h; }
    if (cls !== undefined && el.className !== cls) el.className = cls;
  }
  const span = function (c, t) { return '<span class="c' + 'abc'[c] + '">' + t + '</span>'; };
  let resubCache = { key: '', v: null };
  function updateReadouts() {
    const qa = S.qa, n = S.points.length, cnt = K.counts(S.points), cfg = S.cfg;
    setHTML('rN', n + T('（' + cnt.join('／') + '）', ' (' + cnt.join(' / ') + ')'));
    setHTML('rQ', coordTxt(S.q.gx, S.q.gy));
    setHTML('rK', n ? String(qa.kEff) + (cfg.k > n ? T('（k 比點數大：用全部）', ' (k > n: all of them)') : '') : '—');
    setHTML('rKth', n ? numTxt(qa.kthD) + (cfg.std ? T('（標準化單位）', ' (standardised)') : '') : '—');
    setHTML('rVotes', n ? qa.votes.map(function (v, c) { return span(c, String(v)); }).join('：') : '—');
    setHTML('rPred', qa.pred >= 0 ? span(qa.pred, clsTxt(qa.pred)) + (qa.tie !== 'none' ? T('（平手後決定）', ' (after a tie)') : '') : '—');
    const cur = S.looAt(cfg.k), best = S.best();
    setHTML('rLoo', cur ? cur.correct + '／' + n + ' = ' + pct(cur.correct, n) : '—');
    if (best) {
      const ks = best.ks.slice(0, 3).join('、') + (best.ks.length > 3 ? T(' 等', '…') : '');
      setHTML('rBest', 'k = ' + ks + T('（', ' (') + pct(best.correct, n) + T('）', ')'));
    } else setHTML('rBest', '—');
    const rk = S._cacheKey + '|' + cfg.k;
    if (resubCache.key !== rk) resubCache = { key: rk, v: K.resubstitution(S.points, cfg, cfg.k) };
    setHTML('rResub', n ? resubCache.v.correct + '／' + n + ' = ' + pct(resubCache.v.correct, n) : '—');
    setHTML('rDist', n >= 2 ? String(n * (n - 1)) : '—');
    const w = S.walk;
    setHTML('rWalk', w && w.pos ? w.pos + '／' + w.n + T('，猜對 ', ', right: ') + w.correct : T('還沒開始', 'not started'));
    updateVoteBox();
    updateWalkBox();
    $('playBtn').textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play');
    $('playBtn').setAttribute('aria-pressed', String(state.playing));
  }
  function updateVoteBox() {
    const qa = S.qa, n = S.points.length;
    let h;
    if (!n) h = '<span class="muted">' + T('沒有資料點：在左邊的平面上點一下放點，或選一份預設資料。', 'No points: tap the plane to place some, or pick a preset.') + '</span>';
    else {
      const parts = [];
      qa.votes.forEach(function (v, c) { if (v) parts.push(span(c, NAMES[c]) + ' ' + v + T(' 票', '')); });
      h = T('最近的 ' + qa.kEff + ' 個鄰居：', 'The nearest ' + qa.kEff + ' neighbour' + (qa.kEff > 1 ? 's' : '') + ': ') + parts.join(T('、', ', ')) + '。';
      if (qa.tie === 'none') h += ' <span class="tag ok">' + T('猜 ', 'guess ') + clsName(qa.pred) + '</span>';
      else {
        const sums = qa.tied.map(function (c) { return span(c, NAMES[c]) + ' ' + numTxt(qa.sums[c]); }).join(T('、', ', '));
        h += '<br>' + T('票數平手，比距離總和：', 'Tied vote; compare the total distances: ') + sums + '。 ';
        h += qa.tie === 'dist' ? '<span class="tag tie">' + T('總和小的勝：', 'smaller total wins: ') + clsName(qa.pred) + '</span>'
          : '<span class="tag tie">' + T('總和也相同，看最前面的鄰居：', 'totals equal too; the first neighbour decides: ') + clsName(qa.pred) + '</span>';
      }
      if (qa.orderSensitive) h += '<br><span class="muted">' + T('第 k 名有幾個點一樣遠，照「先放的先選」；如果改成後放的先選，答案會不一樣。', 'Several points tie for the k-th place and the one placed earlier is taken; taking the later one would change the answer.') + '</span>';
      if (S.cfg.k > n) h += '<br><span class="muted">' + T('k 比點數大，所有的點都投票，所以哪裡都猜人數最多的那一類。', 'k is larger than the number of points, so every point votes and the biggest class wins everywhere.') + '</span>';
    }
    setHTML('voteBox', h);
  }
  function updateWalkBox() {
    const w = S.walk, n = S.points.length;
    let h;
    if (n < 2) h = '<span class="muted">' + T('至少要有 2 個點才能做留一法。', 'Leave-one-out needs at least 2 points.') + '</span>';
    else if (!w || !w.last) h = '<span class="muted">' + T('按「單步」：拿出第一個點當考題，用其他 ' + (n - 1) + ' 個點的 k 個最近鄰來猜它。', 'Press “Step”: the first point is taken out and guessed by the k nearest of the other ' + (n - 1) + ' points.') + '</span>';
    else {
      const r = w.last, p = S.points[r.i];
      const parts = [];
      r.votes.forEach(function (v, c) { if (v) parts.push(span(c, NAMES[c]) + ' ' + v); });
      h = T('第 ' + r.pos + ' 題：點 ' + coordTxt(p.gx, p.gy) + '，其實是 ', 'Question ' + r.pos + ': the point ' + coordTxt(p.gx, p.gy) + ' is really ') + span(p.c, clsName(p.c)) + T('。', '. ') +
        T('其他點裡最近的 ' + r.kEff + ' 個投票：', 'The nearest ' + r.kEff + ' of the others vote: ') + parts.join(T('、', ', ')) + ' → ' + clsName(r.pred) + ' ' +
        (r.ok ? '<span class="tag ok">' + T('猜對', 'right') + '</span>' : '<span class="tag bad">' + T('猜錯', 'wrong') + '</span>');
      if (w.done) h += '<br>' + T('走完了：猜對 ' + w.correct + '／' + w.n + ' = ' + pct(w.correct, w.n) + '，總共算了 ' + w.dist + ' 個距離。', 'Finished: ' + w.correct + ' / ' + w.n + ' = ' + pct(w.correct, w.n) + ' right, ' + w.dist + ' distances computed in all.');
    }
    setHTML('walkBox', h);
  }

  // =====================================================================
  // 實驗紀錄
  // =====================================================================
  function renderLog() {
    const h = state.log, tb = $('hist');
    $('histEmpty').hidden = h.length > 0;
    if (!h.length) { tb.innerHTML = ''; return; }
    let s = '<thead><tr><th>' + T('資料', 'Data') + '</th><th>n</th><th>k</th><th>' + T('距離', 'Distance') + '</th><th>x2</th><th>' + T('標準化', 'Std') + '</th><th>' +
      T('猜對', 'Right') + '</th><th>' + T('正確率', 'Accuracy') + '</th></tr></thead><tbody>';
    for (let i = h.length - 1; i >= 0; i--) {
      const e = h[i];
      s += '<tr><td>' + SET_NAME(e.set) + '</td><td>' + e.n + '</td><td>' + e.kEff + '</td><td>' + (e.metric === 'euclid' ? T('歐氏', 'Euclid') : T('曼哈頓', 'Manhattan')) +
        '</td><td>× ' + e.scale + '</td><td>' + (e.std ? T('有', 'yes') : T('無', 'no')) + '</td><td>' + e.correct + '</td><td>' + pct(e.correct, e.n) + '</td></tr>';
    }
    tb.innerHTML = s + '</tbody>';
  }

  // =====================================================================
  // 決策區域（分批計算）
  // =====================================================================
  const reg = { key: '', job: null, coarse: null, img: null, coarseImg: null, paintKey: '', fineDone: false };
  function regionKey() { return S._cacheKey + '|' + Math.min(S.cfg.k, S.points.length); }
  function ensureRegion() {
    if (!state.showRegion || !S.points.length) return;
    const key = regionKey();
    if (key === reg.key) return;
    reg.key = key;
    const k = Math.min(S.cfg.k, S.points.length);
    reg.coarse = new K.RegionJob(S.points, S.cfg, k, REG_COARSE, L);
    reg.coarse.run();
    reg.coarseImg = paint(reg.coarse, reg.coarseImg);
    reg.job = new K.RegionJob(S.points, S.cfg, k, REG_N, L);
    reg.fineDone = false; reg.segs = null;
  }
  function paint(job, cvs) {
    const N = job.N;
    if (!cvs) cvs = document.createElement('canvas');
    if (cvs.width !== N) { cvs.width = N; cvs.height = N; }
    const g = cvs.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const bg = D.rgb(C.bg), cols = [D.rgb(C.a), D.rgb(C.b), D.rgb(C.c)];
    const base = D.dark ? 0.1 : 0.08, sp = D.dark ? 0.24 : 0.22;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = j * N + i, c = job.cls[o], q = o * 4;
      if (c < 0) { d[q] = bg[0]; d[q + 1] = bg[1]; d[q + 2] = bg[2]; d[q + 3] = 255; continue; }
      const a = base + sp * Math.max(0, Math.min(1, (job.conf[o] - 0.34) / 0.66));
      const cc = cols[c];
      d[q] = bg[0] + (cc[0] - bg[0]) * a; d[q + 1] = bg[1] + (cc[1] - bg[1]) * a; d[q + 2] = bg[2] + (cc[2] - bg[2]) * a; d[q + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cvs;
  }
  /**
   * 分界線：對每一類做 marching squares（格子中心為頂點，在相鄰兩格中間切開），比畫格子邊緣的鋸齒平順。
   * 傳回線段陣列 [x0, y0, x1, y1, …]（資料座標）。只是畫線，不改變任何分類結果。
   */
  function contours(job) {
    const N = job.N, cl = job.cls, segs = [];
    const cx = function (i) { return -L + (i + 0.5) * 2 * L / N; }, cy = function (j) { return L - (j + 0.5) * 2 * L / N; };
    const present = [false, false, false];
    for (let o = 0; o < cl.length; o++) if (cl[o] >= 0) present[cl[o]] = true;
    for (let c = 0; c < 3; c++) {
      if (!present[c]) continue;
      for (let j = 0; j + 1 < N; j++) for (let i = 0; i + 1 < N; i++) {
        const a = cl[j * N + i] === c ? 1 : 0, b = cl[j * N + i + 1] === c ? 1 : 0, d = cl[(j + 1) * N + i] === c ? 1 : 0, e = cl[(j + 1) * N + i + 1] === c ? 1 : 0;
        const code = a * 8 + b * 4 + e * 2 + d;
        if (code === 0 || code === 15) continue;
        const xm = (cx(i) + cx(i + 1)) / 2, ym = (cy(j) + cy(j + 1)) / 2;
        const T0 = [xm, cy(j)], R0 = [cx(i + 1), ym], B0 = [xm, cy(j + 1)], L0 = [cx(i), ym];
        const add = function (p, q) { segs.push(p[0], p[1], q[0], q[1]); };
        switch (code) {
          case 1: case 14: add(L0, B0); break;
          case 2: case 13: add(B0, R0); break;
          case 3: case 12: add(L0, R0); break;
          case 4: case 11: add(T0, R0); break;
          case 6: case 9: add(T0, B0); break;
          case 7: case 8: add(L0, T0); break;
          case 5: add(L0, T0); add(B0, R0); break;
          case 10: add(T0, R0); add(L0, B0); break;
        }
      }
    }
    return segs;
  }
  function regionTick() {
    if (!state.showRegion || !reg.job || reg.fineDone) return false;
    reg.job.run(6);
    if (reg.job.done) { reg.img = paint(reg.job, reg.img); reg.segs = contours(reg.job); reg.fineDone = true; reg.paintKey = D.ver + C.a + C.b + C.c; }
    return true;
  }
  function repaintRegion() {
    if (reg.coarse) reg.coarseImg = paint(reg.coarse, reg.coarseImg);
    if (reg.fineDone && reg.job) reg.img = paint(reg.job, reg.img);
    reg.paintKey = D.ver + C.a + C.b + C.c;
  }

  // =====================================================================
  // 同步：任何操作之後呼叫
  // =====================================================================
  function sync() {
    ensureRegion();
    updateReadouts();
    updatePresetButtons();
    requestDraw();
  }

  // =====================================================================
  // 2D 繪圖
  // =====================================================================
  function drawTri(c, x, y, r, col, opts) {
    opts = opts || {};
    const R = r * 1.3, h = R * 1.5;
    const pts = [[x, y - R], [x + R * 0.866, y + R * 0.5], [x - R * 0.866, y + R * 0.5]];
    c.save();
    if (opts.shadow !== false) { c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.25); c.shadowBlur = 6; c.shadowOffsetY = 2; }
    const g = c.createLinearGradient(0, y - R, 0, y - R + h);
    g.addColorStop(0, shade(col, 0.28)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.2));
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]); c.lineTo(pts[2][0], pts[2][1]); c.closePath();
    c.lineJoin = 'round';
    c.fillStyle = g; c.fill();
    c.restore();
    c.save();
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]); c.lineTo(pts[2][0], pts[2][1]); c.closePath();
    c.strokeStyle = alpha(shade(col, -0.4), 0.7); c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1] + 1.5); c.lineTo(pts[2][0] + 1.5, pts[2][1] - 1);
    c.strokeStyle = alpha(shade(col, 0.7), 0.6); c.lineWidth = 1; c.stroke();
    c.restore();
  }
  /** 一個類別的記號：A 圓、B 方塊、C 三角形（色弱也分得出） */
  function marker(c, cls, x, y, r, opts) {
    opts = opts || {};
    const col = COL(cls);
    if (cls === 0) D.ball(c, x, y, r, col, { shadow: opts.shadow });
    else if (cls === 1) { const s = r * 1.72; D.block(c, x - s / 2, y - s / 2, s, s, col, { r: Math.min(3, s * 0.2), shadow: opts.shadow }); }
    else drawTri(c, x, y, r, col, opts);
  }
  function starPath(c, x, y, R) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.46 : R;
      const px = x + rr * Math.cos(a), py = y + rr * Math.sin(a);
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
  }
  function drawStar(c, x, y, R, col) {
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : alpha(C.text, 0.3); c.shadowBlur = 8; c.shadowOffsetY = 2;
    starPath(c, x, y, R);
    const g = c.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
    g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.3));
    c.fillStyle = g; c.fill();
    c.restore();
    c.save();
    starPath(c, x, y, R);
    c.lineJoin = 'round'; c.lineWidth = 2.2; c.strokeStyle = C.q; c.stroke();
    starPath(c, x, y, R - 2.2);
    c.lineWidth = 1; c.strokeStyle = alpha('#ffffff', D.dark ? 0.35 : 0.75); c.stroke();
    c.restore();
  }
  function ring(c, x, y, r, color, width, dash, a) {
    c.save(); c.globalAlpha = a == null ? 1 : a; c.strokeStyle = color; c.lineWidth = width; if (dash) c.setLineDash(dash);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.restore();
  }
  /** 第 k 近的距離在平面上的範圍：歐氏是橢圓（單位 × 1 且不標準化時是圓）、曼哈頓是菱形 */
  function reachShape(c, qx, qy, d) {
    let ax, by;
    if (S.cfg.std && S.P && S.P.std) { ax = d * Math.sqrt(S.P.V1) / S.P.nn / G; by = d * Math.sqrt(S.P.V2) / S.P.nn / G; }
    else { ax = d; by = d / S.cfg.scale; }
    const rx = ax * P.k, ry = by * P.k, x = X(qx), y = Y(qy);
    c.beginPath();
    if (S.cfg.metric === 'euclid') c.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
    else { c.moveTo(x + rx, y); c.lineTo(x, y - ry); c.lineTo(x - rx, y); c.lineTo(x, y + ry); c.closePath(); }
  }

  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(frame); }
  function frame(tm) {
    rafId = 0;
    if (state.playing) playTick(tm);
    const busy = regionTick();
    draw();
    drawChart();
    const t = now();
    if (state.playing || busy || (!reducedMotion && (t - state.predAt < 900 || t - state.walkAt < 900))) requestDraw();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    D.backdrop(ctx, W, H);
    drawPlane();
    drawNeighbours(NR);
    drawVote(VR);
  }

  function drawPlane() {
    const c = ctx, r = ptR(), x0 = P.x, y0 = P.y, s = P.s, pts = S.points, qa = S.qa, tt = now();
    // 平面底板（浮起的卡片）
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.16);
    c.shadowBlur = 12; c.shadowOffsetY = 3;
    D.roundRect(c, x0, y0, s, s, 10);
    c.fillStyle = C.bg; c.fill();
    c.restore();
    c.save();
    D.roundRect(c, x0, y0, s, s, 10);
    c.clip();
    if (state.showRegion && pts.length) {
      if (reg.paintKey !== D.ver + C.a + C.b + C.c) repaintRegion();
      const im = reg.fineDone ? reg.img : reg.coarseImg;
      if (im) { c.imageSmoothingEnabled = true; c.drawImage(im, X(-L), Y(L), 2 * L * P.k, 2 * L * P.k); }
      if (reg.fineDone && reg.segs && reg.segs.length) {
        const sg = reg.segs;
        c.save();
        c.beginPath();
        for (let t = 0; t < sg.length; t += 4) { c.moveTo(X(sg[t]), Y(sg[t + 1])); c.lineTo(X(sg[t + 2]), Y(sg[t + 3])); }
        c.lineCap = 'round'; c.lineJoin = 'round';
        c.strokeStyle = alpha(C.text, D.dark ? 0.42 : 0.34); c.lineWidth = 1.4; c.stroke();
        c.restore();
      }
    }
    D.grid(c, x0, y0, x0 + s, y0 + s, P.k * 0.5, P.k * 0.1, X(0), Y(0));
    c.strokeStyle = alpha(C.text, D.dark ? 0.32 : 0.28); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, Y(0) + 0.5); c.lineTo(x0 + s, Y(0) + 0.5); c.moveTo(X(0) + 0.5, y0); c.lineTo(X(0) + 0.5, y0 + s); c.stroke();
    c.save(); c.setLineDash([3, 4]); c.strokeStyle = alpha(C.text, 0.22);
    c.strokeRect(X(-1), Y(1), 2 * P.k, 2 * P.k); c.restore();

    // 查詢點的 k 個鄰居：連線與範圍
    const qx = S.q.gx / G, qy = S.q.gy / G;
    const nb = pts.length ? qa.list.slice(0, qa.kEff) : [];
    if (nb.length) {
      const d = qa.kthD;
      c.save();
      reachShape(c, qx, qy, d);
      c.fillStyle = alpha(C.q, D.dark ? 0.1 : 0.07); c.fill();
      c.setLineDash([6, 4]); c.lineWidth = 1.8; c.strokeStyle = alpha(C.q, 0.9); c.stroke();
      c.restore();
      const thin = nb.length > 25;
      nb.forEach(function (e) {
        const p = pts[e.i];
        c.save();
        c.strokeStyle = alpha(COL(p.c), thin ? 0.35 : 0.7); c.lineWidth = thin ? 1 : 1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(X(qx), Y(qy)); c.lineTo(X(p.x), Y(p.y)); c.stroke();
        c.restore();
      });
    }
    // 留一法這一題：被拿出來的點與它的鄰居
    const w = S.walk, wl = w && w.last && !state.hideWalk ? w.last : null;
    if (wl && pts[wl.i]) {
      const p = pts[wl.i];
      wl.list.forEach(function (e) {
        const q = pts[e.i]; if (!q) return;
        c.save(); c.setLineDash([3, 3]); c.strokeStyle = alpha(C.cur, 0.8); c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(X(p.x), Y(p.y)); c.lineTo(X(q.x), Y(q.y)); c.stroke(); c.restore();
      });
    }
    c.restore();   // 結束裁切

    // 外框、刻度、軸名稱
    c.save();
    D.roundRect(c, x0 + 0.5, y0 + 0.5, s - 1, s - 1, 10);
    c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
    c.restore();
    const sc = S.cfg.scale;
    [-1, -0.5, 0.5, 1].forEach(function (v) {
      const lab = (v < 0 ? '−' : '') + String(Math.abs(v));
      const lab2 = (v < 0 ? '−' : '') + String(Math.abs(v) * sc);
      D.haloText(c, lab, X(v), Y(0) + 13, C.muted, 'center', 'middle', fnt(10.5));
      D.haloText(c, lab2, X(0) - 5, Y(v), sc === 100 ? C.q : C.muted, 'right', 'middle', fnt(10.5, sc === 100 ? 700 : 500));
    });
    const near = function (lx, ly) { return pts.some(function (p) { return Math.hypot(X(p.x) - lx, Y(p.y) - ly) < 22; }); };
    D.vecLabel(c, 'x', '1', x0 + s - 14, near(x0 + s - 14, Y(0) - 11) ? Y(0) - 28 : Y(0) - 11, C.text);
    const x2x = near(X(0) + 15, y0 + 13) ? X(0) + 32 : X(0) + 15;
    D.vecLabel(c, 'x', '2', x2x, y0 + 13, C.text);
    if (sc === 100) D.pill(c, T('單位 × 100', 'unit × 100'), x2x + 12, y0 + 21, C.q, 'left', fnt(10.5, 700));

    // 資料點
    const nbSet = {};
    nb.forEach(function (e) { nbSet[e.i] = true; });
    const wrongK = state.showWrong ? looWrong() : null;
    pts.forEach(function (p) { D.contactShadow(c, X(p.x), Y(p.y) + r * 0.95, r * 0.8, 0.2); });
    pts.forEach(function (p, i) {
      const x = X(p.x), y = Y(p.y);
      if (state.hover === i || (state.drag && state.drag.i === i)) { c.save(); c.fillStyle = alpha(COL(p.c), 0.2); c.beginPath(); c.arc(x, y, r + 7, 0, Math.PI * 2); c.fill(); c.restore(); }
      marker(c, p.c, x, y, r);
    });
    pts.forEach(function (p, i) {
      const x = X(p.x), y = Y(p.y);
      if (nbSet[i]) ring(c, x, y, r + 4, C.q, 1.8);
      if (wrongK && wrongK[i]) ring(c, x, y, r + (nbSet[i] ? 8 : 4.5), C.wrong, 1.6, [3.5, 3]);
    });
    if (wl && pts[wl.i]) {
      const p = pts[wl.i], x = X(p.x), y = Y(p.y);
      const age = (tt - state.walkAt) / 900;
      ring(c, x, y, r + 7 + (reducedMotion ? 0 : Math.max(0, 1 - age) * 3), C.cur, 2.6);
      if (!reducedMotion && age < 1) D.ripple(c, x, y, r + 6, age, wl.ok ? C.ok : C.wrong);
      const above = y - r - 12 > y0 + 18;
      D.pill(c, T('考題', 'test') + ' ' + (wl.ok ? '✓' : '✗'), x, above ? y - r - 10 : y + r + 26, wl.ok ? C.ok : C.wrong, 'center', fnt(10.5, 700));
    }
    // 查詢點
    const sx = X(qx), sy = Y(qy), R = r * 1.9;
    if (state.hover === 'q' || (state.drag && state.drag.q)) { c.save(); c.fillStyle = alpha(C.q, 0.18); c.beginPath(); c.arc(sx, sy, R + 8, 0, Math.PI * 2); c.fill(); c.restore(); }
    const pulse = reducedMotion ? 0 : Math.max(0, 1 - (tt - state.predAt) / 900);
    if (pulse > 0 && qa.pred >= 0) D.ripple(c, sx, sy, R, 1 - pulse, COL(qa.pred));
    drawStar(c, sx, sy, R, qa.pred >= 0 ? COL(qa.pred) : C.muted);
    if (pts.length) {
      const lab = qa.pred >= 0 ? T('猜 ', 'guess ') + NAMES[qa.pred] + (qa.tie !== 'none' ? T('（平手）', ' (tie)') : '') : '?';
      const up = sy - R - 6 > y0 + 22;
      const lx = Math.max(x0 + 40, Math.min(x0 + s - 40, sx));
      D.pill(c, lab, lx, up ? sy - R - 5 : sy + R + 22, qa.pred >= 0 ? COL(qa.pred) : C.muted, 'center', fnt(11.5, 700));
    }
    // 鍵盤游標
    if (kb && kb.focused()) {
      const onQ = kb.index() === 0;
      const gx = onQ ? S.q.gx : state.cursor.gx, gy = onQ ? S.q.gy : state.cursor.gy;
      const x = X(gx / G), y = Y(gy / G), rr = onQ ? R + 5 : r + 6;
      c.save(); c.strokeStyle = C.accent; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2);
      if (!onQ) { c.moveTo(x - rr - 6, y); c.lineTo(x - rr + 3, y); c.moveTo(x + rr - 3, y); c.lineTo(x + rr + 6, y); c.moveTo(x, y - rr - 6); c.lineTo(x, y - rr + 3); c.moveTo(x, y + rr - 3); c.lineTo(x, y + rr + 6); }
      c.stroke(); c.restore();
    }
    if (!pts.length) D.pill(c, T('點一下平面放點（現在放 ' + NAMES[state.cls] + ' 類）', 'Tap the plane to place a point (class ' + NAMES[state.cls] + ')'), x0 + s / 2, y0 + s - 8, C.muted, 'center', fnt(wide ? 12 : 11, 600));
    else if (state.showRegion && !reg.fineDone) D.pill(c, T('上色計算中…', 'colouring…'), x0 + s - 8, y0 + s - 8, C.muted, 'right', fnt(10.5, 600));
  }
  /** 目前 k 時留一法猜錯的點（布林陣列） */
  function looWrong() {
    const Lo = S._loo;
    if (!Lo || Lo.n < 2 || !Lo.perPoint) return null;
    const t = K.kIndex(Lo.ks, S.cfg.k);
    return Lo.perPoint.map(function (row) { return !row[t]; });
  }

  function panelCard(R, title) {
    const c = ctx;
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.45)' : alpha(C.text, 0.12);
    c.shadowBlur = 10; c.shadowOffsetY = 2;
    D.roundRect(c, R.x, R.y, R.w, R.h, 10);
    c.fillStyle = C.panel; c.fill();
    c.restore();
    D.roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 10);
    c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
    D.haloText(c, title, R.x + 10, R.y + 18, C.text, 'left', 'alphabetic', fnt(12.5, 700));
  }
  /** 最近的鄰居：依距離排好的長條，第 k 名之後畫一條虛線 */
  function drawNeighbours(R) {
    const c = ctx, x0 = R.x, y0 = R.y, pw = R.w, ph = R.h;
    if (pw < 110) return;
    panelCard(R, T('最近的鄰居', 'Nearest neighbours'));
    const qa = S.qa, n = S.points.length;
    D.haloText(c, T('依距離排序', 'sorted by distance'), x0 + 10, y0 + 33, C.muted, 'left', 'alphabetic', fnt(wide ? 11 : 10.5));
    if (!n) { D.haloText(c, T('沒有點', 'no points'), x0 + pw / 2, y0 + ph / 2, C.muted, 'center', 'middle', fnt(11.5)); return; }
    const top = y0 + 42, bot = y0 + ph - 10;
    const show = Math.min(n, qa.kEff + 2);
    const list = qa.full.slice(0, show);
    const cut = qa.kEff < show;
    const gap = cut ? 18 : 0;
    const rowH = Math.min(18, (bot - top - gap) / show);
    let dmax = 0;
    list.forEach(function (e) { dmax = Math.max(dmax, e.d); });
    dmax = dmax > 0 ? dmax : 1;
    const big = rowH >= 13;
    const left = x0 + (big ? 44 : 22), right = x0 + pw - (big ? 46 : 10);
    for (let j = 0; j < show; j++) {
      const e = list[j], p = S.points[e.i], y = top + j * rowH + (j >= qa.kEff ? gap : 0), mid = y + rowH / 2;
      const inK = j < qa.kEff;
      c.globalAlpha = inK ? 1 : 0.42;
      if (big) D.haloText(c, String(j + 1), x0 + 14, mid, C.muted, 'center', 'middle', fnt(10.5, 600));
      if (rowH >= 7) marker(c, p.c, x0 + (big ? 30 : 13), mid, Math.min(5, rowH * 0.3), { shadow: false });
      const bw = Math.max(1.5, (right - left) * e.d / dmax), bh = Math.max(1, rowH * 0.56);
      const col = COL(p.c);
      const g = c.createLinearGradient(0, mid - bh / 2, 0, mid + bh / 2);
      g.addColorStop(0, shade(col, 0.25)); g.addColorStop(1, shade(col, -0.12));
      D.roundRect(c, left, mid - bh / 2, bw, bh, Math.min(3, bh / 2));
      c.fillStyle = g; c.fill();
      if (big) D.haloText(c, numTxt(e.d), x0 + pw - 8, mid, C.text, 'right', 'middle', fnt(10.5));
      c.globalAlpha = 1;
    }
    if (cut) {
      const y = Math.round(top + qa.kEff * rowH + gap / 2);
      c.save(); c.setLineDash([5, 4]); c.strokeStyle = C.q; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x0 + 6, y + 0.5); c.lineTo(x0 + pw - 60, y + 0.5); c.stroke(); c.restore();
      D.pill(c, 'k = ' + qa.kEff, x0 + pw - 8, y + 8, C.q, 'right', fnt(10.5, 700));
    } else if (S.cfg.k >= n) D.pill(c, T('全部 ' + n + ' 個都投票', 'all ' + n + ' vote'), x0 + pw - 8, y0 + ph - 4, C.q, 'right', fnt(10.5, 700));
  }
  /** 投票：每一類一根直條 */
  function drawVote(R) {
    const c = ctx, x0 = R.x, y0 = R.y, pw = R.w, ph = R.h;
    if (pw < 110 || ph < 90) return;
    panelCard(R, T('投票', 'The vote'));
    const qa = S.qa, n = S.points.length;
    if (!n) return;
    const cnt = K.counts(S.points);
    const cls = [0, 1, 2].filter(function (k) { return cnt[k] > 0 || qa.votes[k] > 0; });
    const top = y0 + 46, bot = y0 + ph - 54;
    const slot = (pw - 20) / cls.length, bw = Math.min(46, slot * 0.5);
    const kE = Math.max(1, qa.kEff);
    cls.forEach(function (k, j) {
      const cx = x0 + 10 + slot * (j + 0.5), v = qa.votes[k], h = (bot - top) * v / kE, col = COL(k);
      c.save();
      D.roundRect(c, cx - bw / 2, top, bw, bot - top, 5);
      c.fillStyle = alpha(C.bg, 0.8); c.fill();
      c.strokeStyle = alpha(C.border, 0.8); c.lineWidth = 1; c.stroke();
      c.restore();
      if (h > 0.5) D.block(c, cx - bw / 2 + 2, bot - h, bw - 4, h, col, { r: 4, shadow: false });
      if (k === qa.pred) {
        c.save(); c.strokeStyle = C.q; c.lineWidth = 2.2;
        D.roundRect(c, cx - bw / 2 - 3, top - 3, bw + 6, bot - top + 6, 7); c.stroke(); c.restore();
      }
      D.haloText(c, String(v), cx, Math.max(top + 10, bot - h - 8), C.text, 'center', 'middle', fnt(12, 700));
      marker(c, k, cx, bot + 14, 5.5, { shadow: false });
      D.haloText(c, NAMES[k], cx, bot + 29, k === qa.pred ? C.text : C.muted, 'center', 'middle', fnt(11, k === qa.pred ? 700 : 500));
    });
    const note = qa.tie === 'none' ? T('票最多的勝出', 'most votes wins') : qa.tie === 'dist' ? T('平手：距離總和小的勝', 'tie: smaller total distance') : T('平手：看最前面的鄰居', 'tie: first neighbour decides');
    D.haloText(c, note, x0 + pw / 2, y0 + ph - 8, qa.tie === 'none' ? C.muted : C.cur, 'center', 'alphabetic', fnt(wide ? 11 : 10.5, qa.tie === 'none' ? 500 : 700));
  }

  /** 留一法正確率對 k 的圖（虛線是換設定之前的舊曲線） */
  const CH = { l: 40, r: 14, top: 30, bot: 24 };
  function chartX(t, m) { const pw = cw2 - CH.l - CH.r; return CH.l + (m <= 1 ? pw / 2 : pw * t / (m - 1)); }
  function drawChart() {
    const c = ctx2, w = cw2, h = ch2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    const Lo = S._loo, n = S.points.length;
    const title = T('留一法正確率對 k', 'Leave-one-out accuracy vs k');
    let right = '';
    if (Lo && Lo.n >= 2) {
      const cur = S.looAt(S.cfg.k), best = S.best();
      right = 'k = ' + S.cfg.k + T('：', ': ') + pct(cur.correct, n) + T('　最好 ', '   best ') + 'k = ' + best.ks[0] + T('：', ': ') + pct(best.correct, n);
    }
    // 窄螢幕放不下一行時，讀數改放在標題下一行
    c.font = fnt(12, 700); const tw = c.measureText(title).width;
    const rf = fnt(wide ? 11.5 : 10.5, 600); c.font = rf; const rw = c.measureText(right).width;
    const two = right && CH.l + tw + 16 + rw > w - CH.r;
    const l = CH.l, top = two ? CH.top + 14 : CH.top, ph = h - top - CH.bot, pw = w - CH.l - CH.r;
    D.haloText(c, title, l, 17, C.text, 'left', 'alphabetic', fnt(12, 700));
    if (right) D.haloText(c, right, two ? l : w - CH.r, two ? 33 : 17, C.muted, two ? 'left' : 'right', 'alphabetic', rf);
    const YY = function (a) { return top + ph - a * ph; };
    [0, 0.5, 1].forEach(function (a) {
      c.strokeStyle = alpha(C.text, a === 0 ? 0.25 : 0.08); c.lineWidth = 1;
      c.beginPath(); c.moveTo(l, Math.round(YY(a)) + 0.5); c.lineTo(l + pw, Math.round(YY(a)) + 0.5); c.stroke();
      D.haloText(c, (a * 100) + '%', l - 6, YY(a), C.muted, 'right', 'middle', fnt(10.5));
    });
    if (!Lo || Lo.n < 2) { D.haloText(c, T('至少要 2 個點', 'needs at least 2 points'), l + pw / 2, top + ph / 2, C.muted, 'center', 'middle', fnt(12)); return; }
    const m = Lo.ks.length;
    // 舊曲線
    state.ghosts.forEach(function (gh, gi) {
      if (gh.n !== n) return;
      const mm = gh.correct.length;
      c.save(); c.setLineDash([4, 4]); c.strokeStyle = alpha(C.muted, 0.75 - gi * 0.15); c.lineWidth = 1.4;
      c.beginPath();
      gh.correct.forEach(function (v, t) { const x = chartX(t, mm), y = YY(v / n); if (t) c.lineTo(x, y); else c.moveTo(x, y); });
      c.stroke(); c.restore();
      const lastY = YY(gh.correct[mm - 1] / n);
      D.haloText(c, gh.label, chartX(mm - 1, mm) - 2, lastY - 7 - gi * 12, C.muted, 'right', 'alphabetic', fnt(10));
    });
    // 目前的曲線
    const curT = K.kIndex(Lo.ks, S.cfg.k);
    const xk = chartX(curT, m);
    c.save(); c.strokeStyle = alpha(C.q, 0.6); c.lineWidth = 1.5; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(xk + 0.5, top - 4); c.lineTo(xk + 0.5, top + ph); c.stroke(); c.restore();
    c.save();
    const g = c.createLinearGradient(0, top, 0, top + ph);
    g.addColorStop(0, alpha(C.accent, 0.22)); g.addColorStop(1, alpha(C.accent, 0.02));
    c.beginPath(); c.moveTo(chartX(0, m), YY(0));
    Lo.correct.forEach(function (v, t) { c.lineTo(chartX(t, m), YY(v / n)); });
    c.lineTo(chartX(m - 1, m), YY(0)); c.closePath(); c.fillStyle = g; c.fill();
    c.beginPath();
    Lo.correct.forEach(function (v, t) { const x = chartX(t, m), y = YY(v / n); if (t) c.lineTo(x, y); else c.moveTo(x, y); });
    c.strokeStyle = C.accent; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
    c.restore();
    let mx = 0;
    Lo.correct.forEach(function (v) { mx = Math.max(mx, v); });
    const dotR = m > 30 ? 2.2 : 3;
    Lo.correct.forEach(function (v, t) {
      const x = chartX(t, m), y = YY(v / n);
      if (v === mx) D.ball(c, x, y, dotR + 1.6, C.ok, { shadow: false });
      else { c.fillStyle = C.accent; c.beginPath(); c.arc(x, y, dotR, 0, Math.PI * 2); c.fill(); }
    });
    D.ball(c, xk, YY(Lo.correct[curT] / n), 5, C.q, { shadow: false });
    // 橫軸
    const step = m > 24 ? 5 : m > 12 ? 2 : 1;
    const lastX = chartX(m - 1, m);
    for (let t = 0; t < m; t += step) {
      if (t !== m - 1 && (m - 1) % step && lastX - chartX(t, m) < 20) continue;   // 太靠近最後一個就不寫，免得數字黏在一起
      D.haloText(c, String(Lo.ks[t]), chartX(t, m), h - 9, C.muted, 'center', 'alphabetic', fnt(10));
    }
    if ((m - 1) % step) D.haloText(c, String(Lo.ks[m - 1]), lastX, h - 9, C.muted, 'center', 'alphabetic', fnt(10));
  }

  // =====================================================================
  // 留一法：單步、播放、跑完
  // =====================================================================
  function needPoints() { if (S.points.length < 2) { say(T('至少要有 2 個點才能做留一法。', 'Leave-one-out needs at least 2 points.')); return true; } return false; }
  function walkFinished(w) {
    if (!w || !w.done) return;
    state.log.push({ set: S.set, n: w.n, kEff: Math.min(S.cfg.k, w.n - 1), metric: S.cfg.metric, scale: S.cfg.scale, std: S.cfg.std, correct: w.correct });
    if (state.log.length > 30) state.log.shift();
    renderLog();
    sndDone(w.correct / w.n);
  }
  function alreadyDone() {
    const w = S.walk;
    if (!w || !w.done) return false;
    say(T('留一法已經走完了，按「重來」可以再走一次。', 'Leave-one-out is finished; press “Restart” to walk it again.'));
    return true;
  }
  function doStep() {
    if (needPoints() || alreadyDone()) return;
    const rec = S.walkStep(true);
    if (!rec) return;
    state.walkAt = now();
    sndWalk(rec.ok, false);
    walkFinished(S.walk);
    say(T('第 ' + rec.pos + '／' + rec.n + ' 題：' + (rec.ok ? '猜對' : '猜錯') + '，到目前猜對 ' + rec.correct + ' 題。', 'Question ' + rec.pos + ' / ' + rec.n + ': ' + (rec.ok ? 'right' : 'wrong') + '; ' + rec.correct + ' right so far.'));
    sync();
  }
  function doRun() {
    if (needPoints() || alreadyDone()) return;
    stopPlay();
    let r;
    while ((r = S.walkStep(false))) { /* 一路走完 */ }
    state.walkAt = now();
    walkFinished(S.walk);
    const w = S.walk;
    say(T('留一法走完：猜對 ' + w.correct + '／' + w.n + ' = ' + pct(w.correct, w.n) + '。', 'Leave-one-out finished: ' + w.correct + ' / ' + w.n + ' = ' + pct(w.correct, w.n) + ' right.'));
    sync();
  }
  function playTick(tm) {
    if (!state.lastT) state.lastT = tm;
    const dt = Math.min(0.25, Math.max(0, (tm - state.lastT) / 1000));
    state.lastT = tm;
    state.acc += dt * state.rate;
    let n = Math.min(30, Math.floor(state.acc));
    state.acc -= n;
    let any = false, rec = null;
    for (let i = 0; i < n; i++) {
      rec = S.walkStep(false);
      if (!rec) break;
      any = true;
      sndWalk(rec.ok, true);
      if (S.walk.done) break;
    }
    if (any) {
      state.walkAt = now();
      if (S.walk.done) { walkFinished(S.walk); stopPlay(); say(T('留一法走完：猜對 ' + S.walk.correct + '／' + S.walk.n + '。', 'Leave-one-out finished: ' + S.walk.correct + ' / ' + S.walk.n + ' right.')); }
      updateReadouts();
    } else if (!S.walk || S.walk.done) stopPlay();
  }
  function startPlay() {
    if (needPoints() || alreadyDone()) return;
    state.playing = true; state.lastT = 0; state.acc = 1;
    updateReadouts(); requestDraw();
  }
  function stopPlay() {
    if (!state.playing) return;
    state.playing = false;
    updateReadouts();
  }
  $('stepBtn').addEventListener('click', function () { stopPlay(); doStep(); });
  $('runBtn').addEventListener('click', doRun);
  $('playBtn').addEventListener('click', function () { if (state.playing) stopPlay(); else startPlay(); });
  $('restartBtn').addEventListener('click', function () {
    stopPlay(); S.walkReset();
    say(T('留一法回到第一題。', 'Leave-one-out is back at the first question.'));
    sync();
  });
  $('wipeBtn').addEventListener('click', function () {
    stopPlay(); S.walkReset();
    state.log.length = 0; state.ghosts.length = 0;
    renderLog();
    say(T('已清除實驗紀錄與舊曲線，留一法回到第一題；資料與設定保留。', 'The log and the old curves were cleared and leave-one-out is back at the first question; data and settings are kept.'));
    sync();
  });

  // =====================================================================
  // 資料
  // =====================================================================
  function updatePresetButtons() {
    document.querySelectorAll('.presets [data-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(S.set === b.getAttribute('data-set'))); });
  }
  /** 資料一改，舊曲線就不能比了 */
  function dataChanged() { state.ghosts.length = 0; }
  function afterQuery() {
    const p = S.qa.pred;
    if (p !== state.lastPred) { state.lastPred = p; state.predAt = now(); sndPred(p); }
  }
  document.querySelectorAll('.presets [data-set]').forEach(function (b) {
    b.addEventListener('click', function () {
      const name = b.getAttribute('data-set');
      stopPlay();
      S.loadPreset(name);
      dataChanged();
      afterQuery();
      say(presetMsg(name));
      sync();
    });
  });
  function setCls(c) {
    state.cls = c;
    ['clsA', 'clsB', 'clsC'].forEach(function (id, i) { $(id).setAttribute('aria-pressed', String(i === c)); });
    requestDraw();
  }
  $('clsA').addEventListener('click', function () { setCls(0); });
  $('clsB').addEventListener('click', function () { setCls(1); });
  $('clsC').addEventListener('click', function () { setCls(2); });
  $('clearPts').addEventListener('click', function () {
    stopPlay();
    S.clear();
    dataChanged();
    afterQuery();
    say(T('資料清空了。點一下平面放點；用「放 A 類」「放 B 類」「放 C 類」切換類別。', 'All points removed. Tap the plane to place points; switch the class with “Place A”, “Place B” and “Place C”.'));
    sync();
  });
  function addAt(gx, gy, c) {
    if (S.points.length >= K.MAX_POINTS) { say(T('最多 ' + K.MAX_POINTS + ' 個點。', 'At most ' + K.MAX_POINTS + ' points.')); return false; }
    stopPlay();
    if (!S.addPoint(gx, gy, c)) return false;
    dataChanged(); sndPoint(true); afterQuery();
    say(T('放了一個 ' + NAMES[c] + ' 類的點 ' + coordTxt(gx, gy) + '，共 ' + S.points.length + ' 個點。', 'Placed a class ' + NAMES[c] + ' point at ' + coordTxt(gx, gy) + '; ' + S.points.length + ' points in all.'));
    sync();
    return true;
  }
  function removeIdx(i) {
    const p = S.points[i];
    if (!p) return false;
    stopPlay();
    if (!S.removeAt(i)) return false;
    dataChanged(); sndPoint(false); afterQuery();
    say(T('移除了 ' + coordTxt(p.gx, p.gy) + ' 的點，剩下 ' + S.points.length + ' 個。', 'Removed the point at ' + coordTxt(p.gx, p.gy) + '; ' + S.points.length + ' left.'));
    state.hover = null;
    sync();
    return true;
  }
  function moveQueryTo(gx, gy) {
    if (!S.moveQuery(gx, gy)) return false;
    afterQuery();
    sync();
    return true;
  }

  // ---------- 畫布：拖曳查詢點、放點、移除、拖曳點 ----------
  function evPos(e) { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
  function hitQuery(px, py) { return Math.hypot(X(S.q.gx / G) - px, Y(S.q.gy / G) - py) <= ptR() * 1.9 + 8; }
  function hitPoint(px, py) {
    const r = ptR() + 7;
    let best = -1, bd = r;
    S.points.forEach(function (p, i) { const d = Math.hypot(X(p.x) - px, Y(p.y) - py); if (d <= bd) { bd = d; best = i; } });
    return best;
  }
  function inPlane(px, py) { const d = dataOf(px, py); return Math.abs(d.x) <= 1.03 && Math.abs(d.y) <= 1.03; }
  function snap(px, py) { const d = dataOf(px, py); return { gx: K.toGrid(d.x), gy: K.toGrid(d.y) }; }
  cv.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    const b = cv.getBoundingClientRect(), t = e.touches[0], x = t.clientX - b.left, y = t.clientY - b.top;
    if (hitQuery(x, y) || hitPoint(x, y) >= 0) e.preventDefault();   // 按在星形或點上：拖曳，不捲動頁面
  }, { passive: false });
  cv.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    const q = evPos(e);
    state.down = { x: q.x, y: q.y, moved: false };
    if (hitQuery(q.x, q.y)) state.drag = { q: true };
    else {
      const i = hitPoint(q.x, q.y);
      if (i >= 0) state.drag = { i: i, id: S.points[i].id };
    }
    if (state.drag) {
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      cv.style.cursor = 'grabbing';
      requestDraw();
    }
  });
  cv.addEventListener('pointermove', function (e) {
    const q = evPos(e), dn = state.down;
    if (dn && Math.hypot(q.x - dn.x, q.y - dn.y) > 6) dn.moved = true;
    if (state.drag && dn && dn.moved) {
      const g = snap(q.x, q.y);
      if (state.drag.q) { moveQueryTo(g.gx, g.gy); return; }
      const i = S.points.findIndex(function (p) { return p.id === state.drag.id; });
      if (i < 0) { state.drag = null; return; }
      const p = S.points[i];
      if (g.gx !== p.gx || g.gy !== p.gy) {
        stopPlay();
        if (S.movePoint(i, g.gx, g.gy)) { dataChanged(); afterQuery(); sync(); }
      }
      return;
    }
    if (!dn) {
      const h = hitQuery(q.x, q.y) ? 'q' : (function () { const i = hitPoint(q.x, q.y); return i >= 0 ? i : null; })();
      if (h !== state.hover) { state.hover = h; requestDraw(); }
      cv.style.cursor = h != null ? 'grab' : (inPlane(q.x, q.y) ? 'crosshair' : 'default');
    }
  });
  function endPointer(e, cancel) {
    const dn = state.down, drag = state.drag;
    state.down = null; state.drag = null;
    cv.style.cursor = '';
    if (!dn || cancel) { requestDraw(); return; }
    const q = evPos(e);
    if (drag) {
      if (drag.q) {
        if (dn.moved) say(T('查詢點在 ' + coordTxt(S.q.gx, S.q.gy) + '：', 'Query point at ' + coordTxt(S.q.gx, S.q.gy) + ': ') + (S.qa.pred >= 0 ? T('猜 ' + NAMES[S.qa.pred] + ' 類。', 'guess class ' + NAMES[S.qa.pred] + '.') : ''));
      } else if (!dn.moved) {
        const i = S.points.findIndex(function (p) { return p.id === drag.id; });
        if (i >= 0) removeIdx(i);
      } else {
        const p = S.points.find(function (pp) { return pp.id === drag.id; });
        if (p) say(T('把點移到 ' + coordTxt(p.gx, p.gy) + '。', 'Moved the point to ' + coordTxt(p.gx, p.gy) + '.'));
      }
      requestDraw();
      return;
    }
    if (!dn.moved && Math.hypot(q.x - dn.x, q.y - dn.y) < 8 && inPlane(q.x, q.y)) {
      const g = snap(q.x, q.y);
      if (S.indexAt(g.gx, g.gy) < 0) addAt(g.gx, g.gy, state.cls);
    }
    requestDraw();
  }
  cv.addEventListener('pointerup', function (e) { endPointer(e, false); });
  cv.addEventListener('pointercancel', function (e) { endPointer(e, true); });
  cv.addEventListener('pointerleave', function () { if (!state.down && state.hover != null) { state.hover = null; requestDraw(); } });

  // ---------- 鍵盤：查詢點、放點游標 ----------
  cv.addEventListener('keydown', function (e) {
    if (!kb || kb.index() !== 1) return;
    const k = e.key.toLowerCase(), cur = state.cursor;
    const cls = { a: 0, b: 1, c: 2, '1': 0, '2': 1, '3': 2 }[k];
    let handled = true;
    if (cls != null) { if (S.indexAt(cur.gx, cur.gy) < 0) addAt(cur.gx, cur.gy, cls); }
    else if (k === 'delete' || k === 'backspace') { const i = S.indexAt(cur.gx, cur.gy); if (i >= 0) removeIdx(i); }
    else handled = false;
    if (handled) { e.preventDefault(); requestDraw(); }
  });
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('特徵平面畫布：資料點、星形的查詢點與它的 k 個最近鄰。Enter 切換「查詢點」或「放點游標」，方向鍵移動；放點游標上按 A、B、C（或 1、2、3）放那一類的點，Delete 移除。',
      'Feature-plane canvas: the data points, the star-shaped query point and its k nearest neighbours. Enter switches between the query point and the placing cursor; arrow keys move it. On the cursor, press A, B or C (or 1, 2, 3) to place a point of that class, Delete to remove one.'),
    items: [{
      name: function () { return T('查詢點', 'Query point'); },
      move: function (dx, dy, big) { const st = big ? 5 : 1; return moveQueryTo(S.q.gx + dx * st, S.q.gy + dy * st); },
      describe: function () { return T('查詢點在 ' + coordTxt(S.q.gx, S.q.gy) + '，猜 ' + clsName(S.qa.pred) + ' 類。', 'Query point at ' + coordTxt(S.q.gx, S.q.gy) + ', guess class ' + clsName(S.qa.pred) + '.'); }
    }, {
      name: function () { return T('放點游標', 'Placing cursor'); },
      move: function (dx, dy, big) {
        const st = big ? 5 : 1;
        state.cursor.gx = Math.max(-G, Math.min(G, state.cursor.gx + dx * st));
        state.cursor.gy = Math.max(-G, Math.min(G, state.cursor.gy + dy * st));
        return true;
      },
      describe: function () {
        const i = S.indexAt(state.cursor.gx, state.cursor.gy), pos = coordTxt(state.cursor.gx, state.cursor.gy);
        return i >= 0 ? T('游標在 ' + pos + '，這裡有一個 ' + NAMES[S.points[i].c] + ' 類的點。', 'Cursor at ' + pos + ': a class ' + NAMES[S.points[i].c] + ' point is here.')
          : T('游標在 ' + pos + '，這裡沒有點。', 'Cursor at ' + pos + ': no point here.');
      }
    }],
    onChange: function () { requestDraw(); }
  }) : null;

  // ---------- 正確率圖：點一下設定 k ----------
  cv2.addEventListener('click', function (e) {
    const Lo = S._loo; if (!Lo || Lo.n < 2) return;
    const b = cv2.getBoundingClientRect(), x = e.clientX - b.left, m = Lo.ks.length;
    let best = 0, bd = Infinity;
    for (let t = 0; t < m; t++) { const d = Math.abs(chartX(t, m) - x); if (d < bd) { bd = d; best = t; } }
    setK(Lo.ks[best], true);
  });

  // =====================================================================
  // 設定
  // =====================================================================
  const elK = $('kSl'), elRate = $('rate');
  if (window.LabNum) window.LabNum.register(elK, { toValue: function (pos) { return 2 * Math.round(pos) + 1; }, toPos: function (v) { return (v - 1) / 2; }, min: 1, max: K.K_MAX, decimals: 0 });
  function readK() { const v = Math.round(val(elK)); return Math.max(1, Math.min(K.K_MAX, 2 * Math.round((v - 1) / 2) + 1)); }
  function refreshOutputs() {
    $('kOut').textContent = String(S.cfg.k);
    $('rateo').textContent = String(Math.round(val(elRate)));
  }
  function setK(k, fromChart) {
    if (fromChart && window.LabNum) window.LabNum.set(elK, k);
    stopPlay();
    if (S.setCfg('k', k)) {
      afterQuery();
      say(T('k = ' + S.cfg.k + '：查詢點問最近的 ' + Math.min(S.cfg.k, S.points.length) + ' 個鄰居。', 'k = ' + S.cfg.k + ': the query point asks its nearest ' + Math.min(S.cfg.k, S.points.length) + ' neighbours.'));
    }
    refreshOutputs();
    sync();
  }
  elK.addEventListener('input', function () { setK(readK(), false); });
  elRate.addEventListener('input', function () { refreshOutputs(); state.rate = Math.max(1, Math.round(val(elRate))); });
  /** 換距離、單位或標準化：舊曲線留下來對照（最多 3 條） */
  function setCfg(key, v, msg) {
    const before = S._loo && S._loo.n >= 2 ? { correct: S._loo.correct.slice(), n: S._loo.n, label: cfgName(S.cfg) } : null;
    stopPlay();
    if (!S.setCfg(key, v)) return;
    if (before) { state.ghosts.unshift(before); if (state.ghosts.length > 3) state.ghosts.pop(); }
    afterQuery();
    if (msg) say(msg);
    sync();
  }
  function seg2(a, b, key, va, vb, ma, mb) {
    const set = function (v) {
      $(a).setAttribute('aria-pressed', String(v === va));
      $(b).setAttribute('aria-pressed', String(v === vb));
      setCfg(key, v, v === va ? ma() : mb());
    };
    $(a).addEventListener('click', function () { set(va); });
    $(b).addEventListener('click', function () { set(vb); });
  }
  seg2('metE', 'metM', 'metric', 'euclid', 'manhattan',
    function () { return T('歐氏距離：直線的長度，一樣遠的點排成圓。', 'Euclidean distance: the straight-line length; equally distant points form a circle.'); },
    function () { return T('曼哈頓距離：橫走加直走的路程，一樣遠的點排成菱形。', 'Manhattan distance: across plus up, like walking city blocks; equally distant points form a diamond.'); });
  seg2('unit1', 'unit100', 'scale', 1, 100,
    function () { return T('x2 的單位 × 1。', 'Unit of x2: × 1.'); },
    function () { return S.cfg.std ? T('x2 的單位 × 100，但已經標準化，所以結果不受影響。', 'Unit of x2: × 100, but the features are standardised, so nothing changes.')
      : T('x2 的單位 × 100：x2 一點點的差距就比 x1 的差距大很多，距離幾乎只看 x2。', 'Unit of x2: × 100. A tiny difference in x2 now outweighs any difference in x1, so the distance looks almost only at x2.'); });
  $('stdChk').addEventListener('change', function () {
    const on = $('stdChk').checked;
    setCfg('std', on, on ? T('標準化：每個特徵減去平均、除以標準差，再量距離。', 'Standardised: each feature has its mean subtracted and is divided by its standard deviation before distances are measured.')
      : T('不標準化：直接用原本的數值量距離。', 'Not standardised: distances use the raw values.'));
  });
  $('regionChk').addEventListener('change', function () {
    state.showRegion = $('regionChk').checked;
    if (state.showRegion) reg.key = '';
    sync();
  });
  $('wrongChk').addEventListener('change', function () { state.showWrong = $('wrongChk').checked; requestDraw(); });

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.KnnLab = {
    session: S, state: state,
    add: function (x, y, c) { return addAt(K.toGrid(x), K.toGrid(y), c); },
    query: function (x, y) { return moveQueryTo(K.toGrid(x), K.toGrid(y)); },
    setK: function (k) { if (window.LabNum) window.LabNum.set(elK, k); setK(k, false); },
    toPx: function (x, y) { return { x: X(x), y: Y(y) }; },
    regionDone: function () { return !state.showRegion || reg.fineDone || !S.points.length; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    updateReadouts();
    renderLog();
    updateSoundButton();
    requestDraw();
  }
  readColors();
  S.setCfg('k', readK(), true);
  state.rate = Math.max(1, Math.round(val(elRate)));
  state.showRegion = $('regionChk').checked;
  state.showWrong = $('wrongChk').checked;
  if ($('stdChk').checked) S.setCfg('std', true, true);
  state.lastPred = S.qa.pred;
  refreshOutputs();
  sync();
  renderLog();
  updateSoundButton();
  say(presetMsg('blobs'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); });
  resize();
})();
