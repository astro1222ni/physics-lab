/* hanoi.js — 「河內塔」的畫面與操作
 * 計算全部在 js/hanoi-core.js（Session：移動、上一步、打亂、自動解、廣度優先搜尋、挑戰、傳說）；這裡只負責畫、操作、音效、轉送任務事件。
 * 3D 檢視（主畫面）在 js/hanoi-3d.js，切到 3D 時才載入（three.js 也是那時才 import）；沒有 WebGL 時留在 2D，功能完全相同。
 * 動畫：盤子的「畫面位置」由 pose() 統一算（柱子編號＋第幾層），2D 與 3D 都用它，所以兩邊永遠一致。
 */
(function () {
  'use strict';
  const HC = window.HanoiCore, D = window.LabDraw;
  if (!HC || !D) return;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const PEG = HC.PEG;
  const fnt = function (px, w) { return (w || 500) + ' ' + px + 'px ' + FONT; };
  const now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const pegName = function (p) { return T(PEG[p] + ' 柱', 'peg ' + PEG[p]); };
  const AGE = 1.38e10;            // 宇宙年齡（年，Planck 2018）
  const FAST = 14;                // 自動解每秒超過這麼多步就不做搬動動畫

  // =====================================================================
  // 狀態
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cvR = $('cvRec'), ctxR = cvR.getContext('2d');
  const cvG = $('cvGraph'), ctxG = cvG.getContext('2d');
  const stage = $('stage');
  const ui = {
    sel: -1, cursor: 0, playing: false, acc: 0, lastT: 0, speed: 3, flash: null, solvedAt: 0, drag: null, down: null,
    bfs: null, pick: false, gCursor: -1, sndAt: 0, rate: 1, rotated: false, quizRes: null, focus: false, gFocus: false
  };
  let C = {};
  let view3 = null;
  const bridge = { rev: 0 };

  const S = new HC.Session({ emit: onEmit, n: 4 });

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = function (k, f) { return cs.getPropertyValue('--hn-' + k).trim() || f; };
    C.d = [null];
    for (let d = 1; d <= 10; d++) C.d.push(g('d' + d, '#888888'));
    ['wood', 'wood2', 'peg', 'goal', 'sel', 'bad', 'hint', 'trail', 'ok'].forEach(function (k) { C[k] = g(k, '#888888'); });
    C.text = D.c.text; C.muted = D.c.muted; C.bg = D.c['canvas-bg']; C.border = D.c.border; C.accent = D.c.accent; C.surface = D.c.surface;
    baseCache = null; graphCache = null;
  }

  // =====================================================================
  // 數字格式
  // =====================================================================
  function group(s) { return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function sci(a) { let e = Math.floor(Math.log10(a)), m = (a / Math.pow(10, e)).toFixed(2); if (m === '10.00') { m = '1.00'; e++; } return { m: m, e: e }; }
  /** HTML：大的數用 × 10<sup>k</sup> */
  function bigHtml(v, dec) {
    if (!isFinite(v)) return '∞';
    if (v >= 1e6) { const q = sci(v); return q.m + ' × 10<sup>' + q.e + '</sup>'; }
    return group(v.toFixed(dec == null ? 0 : dec));
  }
  function stateTxt(pos, n) { return HC.str(pos, n); }
  function moveTxt(m) { return T('盤 ' + m.disk + '：' + PEG[m.from] + ' → ' + PEG[m.to], 'disc ' + m.disk + ': ' + PEG[m.from] + ' → ' + PEG[m.to]); }

  // =====================================================================
  // 動畫：shown 是畫面上的擺法（落後 Session 一點點），cur 是正在飛的盤
  // =====================================================================
  const anim = { shown: S.pos.slice(), cur: null, queue: [] };
  function snapAnim() { anim.queue.length = 0; anim.cur = null; anim.shown = S.pos.slice(); ui.drag = null; }
  function finishAnim() {
    if (anim.cur) { anim.shown[anim.cur.disk] = anim.cur.to; anim.cur = null; }
    anim.queue.forEach(function (m) { anim.shown[m.disk] = m.to; });
    anim.queue.length = 0;
  }
  function moveDur(src) {
    if (reducedMotion) return 0;
    if (src === 'auto') return ui.speed > FAST ? 0 : Math.min(520, 820 / ui.speed);
    return 400;
  }
  function enqueue(m, src) {
    const dur = moveDur(src);
    if (!dur || anim.queue.length > 3) { finishAnim(); anim.shown[m.disk] = m.to; return; }
    anim.queue.push({ disk: m.disk, from: m.from, to: m.to, dur: dur, src: src });
    requestDraw();
  }
  function stackHeight(peg, except) {
    let h = 0;
    for (let d = 1; d <= S.n; d++) if (anim.shown[d] === peg && d !== except) h++;
    return h;
  }
  function levelOf(d) {
    const p = anim.shown[d];
    let L = 0;
    for (let e = S.n; e > d; e--) if (anim.shown[e] === p) L++;
    return L;
  }
  function stepAnim(t) {
    if (!anim.cur && anim.queue.length) {
      const m = anim.queue.shift();
      const fromL = levelOf(m.disk);
      anim.shown[m.disk] = -1;
      anim.cur = { disk: m.disk, from: m.from, to: m.to, t0: t, dur: m.dur, fromL: fromL, toL: stackHeight(m.to, m.disk) };
    }
    if (anim.cur && t - anim.cur.t0 >= anim.cur.dur) {
      anim.shown[anim.cur.disk] = anim.cur.to;
      const done = anim.cur;
      anim.cur = null;
      sndDrop(done.disk);
      if (anim.queue.length) stepAnim(t);
    }
  }
  const ease = function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
  /**
   * 盤 d 在畫面上的位置：x = 柱子編號（可以是小數，飛行中）、y = 第幾層（0 = 貼底座）。lift = 飛越柱頂時的層數（各檢視自己給）。
   */
  function pose(d, lift) {
    const c = anim.cur;
    if (c && c.disk === d) {
      const u = clamp((now() - c.t0) / c.dur, 0, 1);
      const a = Math.max(0.2, lift - c.fromL), b = Math.abs(c.to - c.from) * 2.2, e = Math.max(0.2, lift - c.toL);
      let s = ease(u) * (a + b + e);
      if (s < a) return { x: c.from, y: c.fromL + s, fly: true };
      s -= a;
      if (s < b) { const v = s / b; return { x: c.from + (c.to - c.from) * v, y: lift + 0.35 * Math.sin(Math.PI * v), fly: true }; }
      s -= b;
      return { x: c.to, y: lift - Math.min(s, e), fly: true };
    }
    const p = anim.shown[d];
    if (p < 0) return { x: 0, y: 0, fly: true };
    if (ui.sel === p && !c && !anim.queue.length && S.top(p) === d) return { x: p, y: lift - 0.25, fly: true, sel: true };
    return { x: p, y: levelOf(d), fly: false };
  }
  function animating() { return !!(anim.cur || anim.queue.length); }

  // =====================================================================
  // 任務事件與音效
  // =====================================================================
  function onEmit(type, data) {
    if (type === 'solved') { ui.solvedAt = now(); sndSolved(); }
    if (window.LabMission) window.LabMission.emit(type, data);
  }
  function sound() { const s = window.LabSound; return s && s.enabled() ? s : null; }
  function discFreq(d) { return 920 - (d - 1) * 58; }   // 盤越大越低（盤 10 也有 398 Hz）
  function sndPick(d) { const s = sound(); if (s) s.tone({ freq: discFreq(d), dur: 0.06, type: 'triangle', gain: 0.12 }); }
  function sndDrop(d) {
    const s = sound(); if (!s) return;
    const t = now();
    if (t - ui.sndAt < 60) return;
    ui.sndAt = t;
    s.noise({ dur: 0.04, gain: 0.12, filter: 1400 + 90 * (10 - d), q: 1.4 });
    s.tone({ freq: discFreq(d) * 0.75, dur: 0.07, type: 'sine', gain: 0.1 });
  }
  function sndBad() { const s = sound(); if (!s) return; s.tone({ freq: 280, dur: 0.16, type: 'square', gain: 0.07 }); s.tone({ freq: 265, dur: 0.16, type: 'square', gain: 0.05, delay: 0.09 }); }
  function sndSolved() { const s = sound(); if (s) [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { s.tone({ freq: f, dur: 0.18, type: 'sine', gain: 0.17, delay: 0.12 + i * 0.09 }); }); }
  function sndQuiz(ok) { const s = sound(); if (!s) return; if (ok) { s.tone({ freq: 784, dur: 0.09, type: 'sine', gain: 0.15 }); s.tone({ freq: 1175, dur: 0.14, type: 'sine', gain: 0.13, delay: 0.08 }); } else s.sweep({ from: 420, to: 270, dur: 0.25, type: 'triangle', gain: 0.1 }); }
  function sndLayer(u) { const s = sound(); if (s) s.tone({ freq: 330 + 700 * u, dur: 0.05, type: 'sine', gain: 0.07 }); }
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

  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').innerHTML = msg || ''; }, 20); }

  // =====================================================================
  // 操作：柱子、上一步、重來、打亂、全部清除
  // =====================================================================
  function changed() { bridge.rev++; recDirty = true; graphDirty = true; sync(); requestDraw(); }
  function stopPlay() { if (ui.playing) { ui.playing = false; $('playBtn').setAttribute('aria-pressed', 'false'); } }
  function distMsg() {
    const d = S.dist();
    if (d === 0) return '';
    return T('離目標最少還要 ' + d + ' 步。', ' At least ' + d + ' more moves to the target.');
  }
  function pegClick(p) {
    finishAnim();
    if (ui.sel < 0) {
      const d = S.top(p);
      if (!d) { say(T(pegName(p) + '是空的，沒有盤子可以拿。', 'Peg ' + PEG[p] + ' is empty — there is no disc to pick up.')); requestDraw(); return; }
      stopPlay();
      ui.sel = p;
      sndPick(d);
      say(T('拿起盤 ' + d + '（' + pegName(p) + '）。再選另一根柱子放下；選同一根柱子就放回去。', 'Picked up disc ' + d + ' from peg ' + PEG[p] + '. Choose another peg to put it down, or the same peg to put it back.'));
    } else if (ui.sel === p) {
      ui.sel = -1;
      say(T('放回原處。', 'Put back.'));
    } else {
      const a = ui.sel;
      ui.sel = -1;
      handMove(a, p);
      return;
    }
    changed();
  }
  function handMove(a, b) {
    finishAnim();
    stopPlay();
    const r = S.tryMove(a, b, 'hand');
    if (!r.ok) {
      if (r.reason === 'big') {
        ui.flash = { peg: b, from: a, t0: now(), disk: r.disk, onto: r.onto };
        sndBad();
        say(T('不行：盤 ' + r.disk + ' 比盤 ' + r.onto + ' 大，大盤不能壓在小盤上。', 'Not allowed: disc ' + r.disk + ' is bigger than disc ' + r.onto + ', and a bigger disc may never go on a smaller one.'));
      } else if (r.reason === 'empty') say(T(pegName(a) + '是空的。', 'Peg ' + PEG[a] + ' is empty.'));
      changed();
      return r;
    }
    enqueue(r, 'hand');
    afterMoveMsg(r);
    changed();
    return r;
  }
  function afterMoveMsg(r) {
    if (S.solved()) {
      const n = S.n, m = S.stack.length, best = S.seg.startDist;
      const fromFull = S.seg.startPerfect >= 0;
      say(T('完成！用了 ' + m + ' 步' + (m === best ? (fromFull ? '，就是最少的 2<sup>' + n + '</sup> − 1 = ' + best + ' 步。' : '，就是最少步數。') : '；最少是 ' + best + ' 步。'),
        'Done! ' + m + ' moves' + (m === best ? (fromFull ? ' — exactly the minimum 2<sup>' + n + '</sup> − 1 = ' + best + '.' : ' — the fewest possible.') : '; the fewest is ' + best + '.')));
    } else say(T('盤 ' + r.disk + '：' + PEG[r.from] + ' → ' + PEG[r.to] + '（第 ' + S.stack.length + ' 步）。', 'Disc ' + r.disk + ': ' + PEG[r.from] + ' → ' + PEG[r.to] + ' (move ' + S.stack.length + ').') + distMsg());
  }
  $('peg0').addEventListener('click', function () { pegClick(0); });
  $('peg1').addEventListener('click', function () { pegClick(1); });
  $('peg2').addEventListener('click', function () { pegClick(2); });
  $('undoBtn').addEventListener('click', function () {
    finishAnim(); stopPlay(); ui.sel = -1;
    const m = S.undo();
    if (!m) { say(T('已經在這一段的起點，沒有可以倒回的步。', 'Already at the start — there is no move to take back.')); changed(); return; }
    enqueue({ disk: m.disk, from: m.to, to: m.from }, 'hand');
    say(T('倒回一步：盤 ' + m.disk + ' 回到 ' + pegName(m.from) + '（剩 ' + S.stack.length + ' 步）。', 'Took back a move: disc ' + m.disk + ' returns to peg ' + PEG[m.from] + ' (' + S.stack.length + ' moves left).') + distMsg());
    changed();
  });
  function resetAll(msg) { stopPlay(); ui.sel = -1; ui.bfs = null; snapAnim(); if (msg) say(msg); changed(); }
  $('resetBtn').addEventListener('click', function () {
    S.reset();
    resetAll(T('整疊放回 A 柱，從頭開始。最少要 2<sup>' + S.n + '</sup> − 1 = ' + HC.minMoves(S.n) + ' 步' + (S.target.kind === 'peg' && S.target.peg !== 0 ? '。' : '（目標是自訂的擺法時另計）。'),
      'The whole tower is back on peg A. The fewest moves is 2<sup>' + S.n + '</sup> − 1 = ' + HC.minMoves(S.n) + (S.target.kind === 'peg' ? '.' : ' (for a custom target it differs).')));
  });
  $('shuffleBtn').addEventListener('click', function () {
    S.shuffle();
    resetAll(T('打亂成 ' + S.state() + '（盤 1 起每個盤在哪根柱）。離目標最少 ' + S.dist() + ' 步——試著用最少步數搬回去。', 'Shuffled to ' + S.state() + ' (the peg of each disc, disc 1 first). The target is at least ' + S.dist() + ' moves away — try to get there in the fewest moves.'));
  });
  $('clearBtn').addEventListener('click', function () {
    S.clearAll();
    ui.quizRes = null; renderQuiz();
    resetAll(T('已清除步數、走過的路、搜尋結果與挑戰紀錄，從目前的擺法重新計算；設定不變。', 'Cleared the move count, the path walked, the search result and the quiz record; counting starts again from the current position. Settings are unchanged.'));
  });

  // ---------- 盤子數、目標、最短路 ----------
  const elN = $('nDisks'), elSpeed = $('speed'), elLeg = $('legN');
  function readN() { return clamp(Math.round(val(elN)), 1, HC.MAX_N); }
  elN.addEventListener('input', function () {
    $('nDiskso').textContent = String(readN());
    if (S.setN(readN())) {
      if (S.n > HC.GRAPH_MAX) ui.pick = false;
      resetAll(T(S.n + ' 個盤子：最少 2<sup>' + S.n + '</sup> − 1 = ' + HC.minMoves(S.n) + ' 步，狀態共 3<sup>' + S.n + '</sup> = ' + group(HC.pow3(S.n)) + ' 種。', S.n + ' discs: at least 2<sup>' + S.n + '</sup> − 1 = ' + HC.minMoves(S.n) + ' moves; 3<sup>' + S.n + '</sup> = ' + group(HC.pow3(S.n)) + ' positions in all.'));
    }
  });
  function setGoal(p) {
    ui.pick = false;
    if (S.setTarget(p)) resetAll(T('目標改成整疊搬到 ' + pegName(p) + '。', 'Target: the whole tower on peg ' + PEG[p] + '.') + ' ' + distMsg());
    else changed();
  }
  $('goalB').addEventListener('click', function () { setGoal(1); });
  $('goalC').addEventListener('click', function () { setGoal(2); });
  $('goalX').addEventListener('click', function () {
    if (S.n > HC.GRAPH_MAX) { say(T('自訂目標要在狀態圖上點選，最多 7 個盤子。', 'A custom target is picked on the state graph, so at most 7 discs.')); return; }
    ui.pick = true;
    say(T('在狀態圖上點一個點，把那個擺法設成目標。', 'Tap a dot on the state graph to make that position the target.'));
    changed();
  });
  $('hint').addEventListener('change', function () {
    S.setHint($('hint').checked);
    if ($('hint').checked) say(T('最短路：畫面上的箭頭是最短路的下一步，狀態圖上的粗線是整條最短路。（這一段有開過最短路，有些任務就不算。）', 'Shortest path: the arrow shows its next move and the thick line on the state graph is the whole path. (Some missions do not count while it has been on.)'));
    changed();
  });
  function hintMove() {
    if (!S.hintOn || S.solved()) return null;
    if (S.target.kind === 'peg') return HC.pathToPerfect(S.pos, S.n, S.target.peg)[0] || null;
    const d = S.dist(), n = S.n;
    const mv = HC.legalMoves(S.pos, n).find(function (m) { const p = S.pos.slice(); p[HC.tops(p, n)[m[0]]] = m[1]; return S.distOf(p) === d - 1; });
    return mv ? { disk: S.top(mv[0]), from: mv[0], to: mv[1] } : null;
  }

  // ---------- 自動解 ----------
  function planMsg(r) {
    if (r.reason === 'custom') return T('自訂目標時沒有自動解：請親手走，可以打開「顯示最短路」。', 'There is no auto solve for a custom target: move by hand, and turn on “Show shortest path” if you like.');
    if (r.reason === 'solved') return T('已經在目標了。按「重來」或換一個目標。', 'Already at the target. Press “Restart” or choose another target.');
    if (r.reason === 'iter') return T('「最小盤輪流」只能從整疊開始：請按「重來」，或改用「遞迴」。', '“Smallest disc alternates” only works from a full tower: press “Restart”, or use “Recursive”.');
    return '';
  }
  function autoOnce(user) {
    const r = S.autoStep(user);
    if (!r.ok) { stopPlay(); say(planMsg(r)); changed(); return false; }
    r.moves.forEach(function (m) { enqueue(m, 'auto'); });
    if (S.auto && S.auto.finished) { stopPlay(); autoDoneMsg(); }
    else if (user && r.moves[0]) say(T('自動搬一步：', 'One automatic move: ') + moveTxt(r.moves[0]) + T('（第 ' + S.stack.length + ' 步）。', ' (move ' + S.stack.length + ').'));
    changed();
    return true;
  }
  function autoDoneMsg() {
    const a = S.auto;
    if (!a) return;
    say(a.alg === 'iter'
      ? T('最小盤輪流解完：' + a.moves.length + ' 步，' + (a.same ? '每一步都和遞迴解相同。' : '和遞迴解不同？'), 'Smallest disc alternates finished: ' + a.moves.length + ' moves' + (a.same ? ', every one the same as the recursive solution.' : '.'))
      : T('遞迴解完：' + a.moves.length + ' 步' + (a.fromPerfect ? '（2<sup>' + a.n + '</sup> − 1）' : '（從這個擺法出發的最少步數）') + '。', 'Recursion finished: ' + a.moves.length + ' moves' + (a.fromPerfect ? ' (2<sup>' + a.n + '</sup> − 1).' : ' (the fewest from this position).')));
  }
  $('playBtn').addEventListener('click', function () {
    finishAnim(); ui.sel = -1;
    if (ui.playing) { stopPlay(); say(T('暫停。', 'Paused.')); changed(); return; }
    const r = S.autoPlay();
    if (!r.ok) { say(planMsg(r)); changed(); return; }
    ui.playing = true; ui.acc = 1; ui.lastT = now();
    $('playBtn').setAttribute('aria-pressed', 'true');
    say(S.alg === 'iter' ? T('最小盤輪流：奇數步搬最小的盤（固定方向），偶數步做另一個唯一的合法移動。', 'Smallest disc alternates: odd moves move the smallest disc (always the same way round), even moves make the only other legal move.')
      : T('遞迴：看下面的呼叫堆疊與遞迴樹，每一步都在某一層呼叫裡。', 'Recursion: watch the call stack and the recursion tree below; every move happens inside some call.'));
    changed();
  });
  $('stepBtn').addEventListener('click', function () { finishAnim(); stopPlay(); ui.sel = -1; autoOnce(true); });
  $('skipBtn').addEventListener('click', function () {
    finishAnim(); stopPlay(); ui.sel = -1;
    const r = S.autoSkip();
    if (!r.ok) { say(planMsg(r)); changed(); return; }
    const k = r.moves.length;
    if (k > 3) { finishAnim(); r.moves.forEach(function (m) { anim.shown[m.disk] = m.to; }); sndDrop(1); }
    else r.moves.forEach(function (m) { enqueue(m, 'auto'); });
    if (S.auto && S.auto.finished) autoDoneMsg();
    else if (k) say(T('一口氣做完 ' + k + ' 步' + (k > 1 ? '（整個子問題）' : '') + '，回到上一層呼叫。', 'Did ' + k + ' move' + (k > 1 ? 's at once (a whole subproblem)' : '') + ' and returned to the calling level.'));
    changed();
  });
  function setAlg(a) {
    if (S.alg === a) return;
    stopPlay();
    S.alg = a;
    say(a === 'iter' ? T('最小盤輪流：不用遞迴，只看步數是奇數還是偶數。', 'Smallest disc alternates: no recursion, only whether the move number is odd or even.')
      : T('遞迴：把 n 個盤的問題拆成兩個 n − 1 個盤的問題。', 'Recursion: split the n-disc problem into two (n − 1)-disc problems.'));
    changed();
  }
  $('algRec').addEventListener('click', function () { setAlg('rec'); });
  $('algIter').addEventListener('click', function () { setAlg('iter'); });
  elSpeed.addEventListener('input', function () { ui.speed = clamp(Math.round(val(elSpeed)), 1, 60); $('speedo').textContent = String(ui.speed); });
  function stepPlay(t) {
    if (!ui.playing) return;
    const dt = Math.min(0.25, (t - ui.lastT) / 1000);
    ui.lastT = t;
    ui.acc = Math.min(ui.acc + dt * ui.speed, ui.speed > FAST ? 8 : 1);
    while (ui.playing && ui.acc >= 1) {
      if (ui.speed <= FAST && animating()) break;
      ui.acc -= 1;
      autoOnce(false);
    }
  }

  // ---------- 廣度優先搜尋 ----------
  $('bfsBtn').addEventListener('click', function () {
    finishAnim(); stopPlay();
    const r = S.bfsRun();
    ui.bfs = { res: r.res, data: r.data, t0: now(), code: S.code(), n: S.n, tcode: r.tcode, last: -1 };
    say(T('從 ' + r.data.start + ' 出發一層一層往外找：' + r.data.layers + ' 層就拜訪完全部 ' + group(r.data.visited) + ' 種擺法；目標在第 ' + r.data.dist + ' 層。',
      'Searching outward from ' + r.data.start + ' layer by layer: all ' + group(r.data.visited) + ' positions are reached in ' + r.data.layers + ' layers; the target is in layer ' + r.data.dist + '.'));
    changed();
  });

  // ---------- 挑戰 ----------
  function renderQuiz() {
    const q = S.quiz, box = $('answers'), qq = $('quizQ');
    if (q.open) {
      qq.innerHTML = q.kind === 'disk'
        ? T('10 個盤子從 A 柱搬到 C 柱的最少步數解法裡，<b>第 ' + q.k + ' 步</b>搬的是哪一個盤？', 'In the shortest solution for 10 discs from peg A to peg C, which disc moves at <b>step ' + q.k + '</b>?')
        : T('10 個盤子從 A 柱搬到 C 柱的最少步數解法裡，<b>第 ' + q.k + ' 步</b>是從哪根柱搬到哪根柱？', 'In the shortest solution for 10 discs from peg A to peg C, <b>step ' + q.k + '</b> goes from which peg to which peg?');
      box.hidden = false;
      box.classList.toggle('mv', q.kind === 'move');
      let h = '';
      if (q.kind === 'disk') for (let d = 1; d <= 10; d++) h += '<button type="button" data-a="' + d + '" aria-label="' + T('盤 ' + d, 'disc ' + d) + '">' + d + '</button>';
      else [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]].forEach(function (p) { h += '<button type="button" data-a="' + p[0] + ',' + p[1] + '">' + PEG[p[0]] + ' → ' + PEG[p[1]] + '</button>'; });
      box.innerHTML = h;
    } else {
      box.hidden = true; box.innerHTML = '';
      const r = ui.quizRes;
      if (!r) qq.innerHTML = '';
      else {
        const k = r.k, bin = k.toString(2), z = HC.trailingZeros(k), a = r.ans;
        const why = r.kind === 'disk'
          ? T('k = ' + k + ' 寫成二進位是 ' + bin + '，結尾有 ' + z + ' 個 0，所以搬盤 ' + (z + 1) + '。', 'k = ' + k + ' is ' + bin + ' in binary, ending in ' + z + ' zero' + (z === 1 ? '' : 's') + ', so disc ' + (z + 1) + ' moves.')
          : T('第 ' + k + ' 步搬盤 ' + a.disk + '（二進位 ' + bin + ' 結尾 ' + z + ' 個 0），這是它第 ' + a.m + ' 次搬；10 − ' + a.disk + ' 是' + ((10 - a.disk) % 2 ? '奇數，它照 A → B → C → A 繞' : '偶數，它照 A → C → B → A 繞') + '，所以是 ' + PEG[a.from] + ' → ' + PEG[a.to] + '。',
            'Step ' + k + ' moves disc ' + a.disk + ' (binary ' + bin + ' ends in ' + z + ' zero' + (z === 1 ? '' : 's') + '), its move number ' + a.m + '; 10 − ' + a.disk + ' is ' + ((10 - a.disk) % 2 ? 'odd, so it goes round A → B → C → A' : 'even, so it goes round A → C → B → A') + ', giving ' + PEG[a.from] + ' → ' + PEG[a.to] + '.');
        qq.innerHTML = '<b style="color:' + (r.ok ? 'var(--hn-ok)' : 'var(--hn-bad)') + '">' + (r.ok ? T('答對了！', 'Correct!') : T('不對。', 'Not quite.')) + '</b> ' + why + ' ' + T('按「出題」或「進階題」出下一題。', 'Press “New question” or “Hard question” for the next one.');
      }
    }
    const ks = S.quiz.kindStreak;
    $('rStreak').textContent = T('盤號題 ' + ks.disk + '、搬法題 ' + ks.move, 'disc ' + ks.disk + ', move ' + ks.move);
  }
  $('quizBtn').addEventListener('click', function () { S.quizNew('disk'); renderQuiz(); });
  $('quizHardBtn').addEventListener('click', function () { S.quizNew('move'); renderQuiz(); });
  $('answers').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-a]');
    if (!b || !S.quiz.open) return;
    const v = b.getAttribute('data-a');
    const r = S.quizAnswer(S.quiz.kind === 'disk' ? +v : v.split(',').map(Number));
    ui.quizRes = r;
    sndQuiz(r.ok);
    renderQuiz();
  });

  // ---------- 傳說 ----------
  function readLeg() { return clamp(Math.round(val(elLeg)), 1, 100); }
  function timeHtml(sec) {
    const Y = HC.YEAR;
    if (sec < 120) return bigHtml(sec, sec < 10 ? 3 : 0) + T(' 秒', ' s');
    if (sec < 7200) return (sec / 60).toFixed(1) + T(' 分鐘', ' minutes');
    if (sec < 172800) return (sec / 3600).toFixed(1) + T(' 小時', ' hours');
    if (sec < Y) return (sec / 86400).toFixed(1) + T(' 天', ' days');
    const y = sec / Y;
    return (y < 1e6 ? group(y.toFixed(y < 100 ? 1 : 0)) : bigHtml(y)) + T(' 年', ' years');
  }
  function legendShow() {
    const N = readLeg(), lt = HC.legendTime(N, ui.rate);
    $('legNo').textContent = String(N);
    $('rLegSteps').textContent = group(lt.steps);
    $('rLegTime').innerHTML = timeHtml(lt.seconds);
    const r = lt.years / AGE;
    $('rLegAge').innerHTML = r >= 1 ? T('宇宙年齡的 ', '') + bigHtml(r, r < 100 ? 1 : 0) + T(' 倍', ' × the age of the universe')
      : r >= 0.01 ? T('宇宙年齡的 ', '') + (r * 100).toFixed(r < 0.1 ? 1 : 0) + '%' + T('', ' of the age of the universe')
      : T('不到宇宙年齡的 1%', 'under 1% of the age of the universe');
    ['rate1', 'rate1k', 'rate1g'].forEach(function (id, i) { $(id).setAttribute('aria-pressed', String([1, 1000, 1e9][i] === ui.rate)); });
  }
  function legendEmit() { const N = readLeg(); S.legend(N, ui.rate); }
  elLeg.addEventListener('input', legendShow);
  elLeg.addEventListener('change', function () { legendShow(); legendEmit(); });
  [['rate1', 1], ['rate1k', 1000], ['rate1g', 1e9]].forEach(function (p) {
    $(p[0]).addEventListener('click', function () { ui.rate = p[1]; legendShow(); legendEmit(); });
  });

  // =====================================================================
  // 2D 主畫面（側面看三根柱子）
  // =====================================================================
  let W = 600, H = 340, dpr = 1;
  const G2 = {};
  function geom2d() {
    const n = S.n;
    G2.labelH = 30; G2.front = 15; G2.top = 10;
    G2.baseY = H - G2.labelH - G2.front;            // 底座上表面的前緣
    G2.surf = G2.baseY - G2.top * 0.45;              // 盤子放在這條線上
    G2.dh = clamp((G2.surf - 78) / (n + 2.4), 9, 28);
    G2.pegTop = G2.surf - (n + 1.1) * G2.dh - 6;      // 柱子只比整疊高一點：拿起的盤剛好越過柱頂
    G2.pegW = clamp(G2.dh * 0.42, 6, 12);
    const sp = (W - 16) / 3;
    G2.px = [8 + sp * 0.5, 8 + sp * 1.5, 8 + sp * 2.5];
    G2.maxW = Math.min(sp - 12, 250);
    G2.minW = Math.max(G2.maxW * 0.26, G2.pegW * 2.8);
    G2.lift = (G2.surf - (G2.pegTop - G2.dh * 0.95)) / G2.dh - 0.5;
  }
  function discW(d) { const n = S.n; return n === 1 ? G2.maxW * 0.62 : G2.minW + (G2.maxW - G2.minW) * (d - 1) / (n - 1); }
  function xOf(x) { const i = Math.floor(clamp(x, 0, 1.999)), f = clamp(x, 0, 2) - i; return G2.px[i] + (G2.px[Math.min(2, i + 1)] - G2.px[i]) * f; }
  function yOf(L) { return G2.surf - (L + 0.5) * G2.dh; }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(280, cv.clientWidth || 600);
    H = Math.round(clamp(W * 0.5, 262, 380));
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    baseCache = null;
    resizeRec(); resizeGraph();
    recDirty = graphDirty = true;
    requestDraw();
  }

  // ---------- 底座（木頭）：畫一次存起來 ----------
  let baseCache = null;
  function woodGrain(g, x0, y0, w, h, seed, a) {
    const r = HC.rng(seed);
    g.save();
    g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    for (let i = 0; i < Math.max(4, h / 2.2); i++) {
      const yy = y0 + r() * h, amp = 0.6 + r() * 1.6, f = 0.004 + r() * 0.012, ph = r() * 6;
      g.beginPath();
      for (let x = x0; x <= x0 + w; x += 6) { const y = yy + amp * Math.sin(x * f + ph) + 0.6 * Math.sin(x * f * 3.1 + ph * 2); if (x === x0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.strokeStyle = alpha(r() < 0.5 ? C.wood2 : shade(C.wood, 0.35), a * (0.4 + r() * 0.6));
      g.lineWidth = 0.6 + r() * 0.9;
      g.stroke();
    }
    g.restore();
  }
  function buildBase() {
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, W, H);
    const x0 = 10, x1 = W - 10, by = G2.baseY, tp = G2.top, fr = G2.front;
    // 底座的影子
    D.contactShadow(g, W / 2, by + fr + 1, (x1 - x0) * 0.5, 0.05);
    // 上表面（看得到一點點）
    g.save();
    g.beginPath();
    g.moveTo(x0 + 8, by - tp); g.lineTo(x1 - 8, by - tp); g.lineTo(x1, by); g.lineTo(x0, by); g.closePath();
    const gt = g.createLinearGradient(0, by - tp, 0, by);
    gt.addColorStop(0, shade(C.wood, 0.28)); gt.addColorStop(1, shade(C.wood, 0.08));
    g.fillStyle = gt; g.fill();
    g.clip();
    woodGrain(g, x0, by - tp, x1 - x0, tp, 7, 0.35);
    g.restore();
    // 前面
    D.roundRect(g, x0, by, x1 - x0, fr, 3);
    const gf = g.createLinearGradient(0, by, 0, by + fr);
    gf.addColorStop(0, shade(C.wood, -0.05)); gf.addColorStop(1, shade(C.wood, -0.3));
    g.fillStyle = gf; g.fill();
    g.save(); D.roundRect(g, x0, by, x1 - x0, fr, 3); g.clip();
    woodGrain(g, x0, by, x1 - x0, fr, 11, 0.5);
    g.fillStyle = alpha(shade(C.wood, 0.6), 0.5); g.fillRect(x0, by, x1 - x0, 1);
    g.restore();
    g.strokeStyle = alpha(shade(C.wood, -0.5), 0.5); g.lineWidth = 1;
    D.roundRect(g, x0 + 0.5, by + 0.5, x1 - x0 - 1, fr - 1, 3); g.stroke();
    baseCache = { c: c, key: W + 'x' + H + ':' + S.n + ':' + D.ver };
  }
  // ---------- 柱子與盤子 ----------
  function drawPeg(g, x, yFrom, yTo) {
    if (yTo >= yFrom) return;
    const w = G2.pegW;
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gr.addColorStop(0, shade(C.peg, -0.35)); gr.addColorStop(0.35, shade(C.peg, 0.25)); gr.addColorStop(0.55, shade(C.peg, 0.05)); gr.addColorStop(1, shade(C.peg, -0.4));
    g.fillStyle = gr;
    D.roundRect(g, x - w / 2, yTo, w, yFrom - yTo, Math.min(w / 2, 5));
    g.fill();
  }
  function drawPegCap(g, x) {
    const w = G2.pegW;
    g.beginPath(); g.ellipse(x, G2.pegTop + 1, w / 2, w * 0.28, 0, 0, Math.PI * 2);
    g.fillStyle = shade(C.peg, 0.35); g.fill();
  }
  function discGeom(d, cx, cy) {
    const w = discW(d), rx = w / 2, hb = G2.dh, e = Math.min(hb * 0.3, rx * 0.2, 7.5);
    return { x: cx, rx: rx, e: e, yT: cy - hb / 2, yB: cy + hb / 2 };
  }
  function drawDisc(g, d, cx, cy, opt) {
    opt = opt || {};
    const q = discGeom(d, cx, cy), col = C.d[d], x = q.x, rx = q.rx, e = q.e, yT = q.yT, yB = q.yB;
    // 側面（圓柱）
    g.save();
    if (opt.glow) { g.shadowColor = alpha(opt.glow, 0.85); g.shadowBlur = 14; }
    g.beginPath();
    g.moveTo(x - rx, yT); g.lineTo(x - rx, yB);
    g.ellipse(x, yB, rx, e, 0, Math.PI, 0, true);
    g.lineTo(x + rx, yT);
    g.ellipse(x, yT, rx, e, 0, 0, Math.PI, false);
    g.closePath();
    const gs = g.createLinearGradient(x - rx, 0, x + rx, 0);
    gs.addColorStop(0, shade(col, -0.42)); gs.addColorStop(0.18, shade(col, -0.05)); gs.addColorStop(0.36, shade(col, 0.32));
    gs.addColorStop(0.5, shade(col, 0.08)); gs.addColorStop(0.82, shade(col, -0.2)); gs.addColorStop(1, shade(col, -0.5));
    g.fillStyle = gs; g.fill();
    g.restore();
    // 漆面的反光帶
    g.save();
    g.beginPath(); g.moveTo(x - rx, yT); g.lineTo(x - rx, yB); g.ellipse(x, yB, rx, e, 0, Math.PI, 0, true); g.lineTo(x + rx, yT); g.ellipse(x, yT, rx, e, 0, 0, Math.PI, false); g.closePath();
    g.clip();
    const gv = g.createLinearGradient(0, yT, 0, yB + e);
    gv.addColorStop(0, 'rgba(255,255,255,0)'); gv.addColorStop(0.32, alpha('#ffffff', D.dark ? 0.16 : 0.26)); gv.addColorStop(0.5, 'rgba(255,255,255,0)'); gv.addColorStop(1, alpha('#000000', 0.12));
    g.fillStyle = gv; g.fillRect(x - rx, yT - e, 2 * rx, yB - yT + 2 * e);
    g.restore();
    // 上表面
    g.beginPath(); g.ellipse(x, yT, rx, e, 0, 0, Math.PI * 2);
    const gtop = g.createRadialGradient(x - rx * 0.35, yT - e * 0.3, 1, x, yT, rx);
    gtop.addColorStop(0, shade(col, 0.5)); gtop.addColorStop(0.6, shade(col, 0.22)); gtop.addColorStop(1, shade(col, 0.02));
    g.fillStyle = gtop; g.fill();
    g.strokeStyle = alpha(shade(col, 0.65), 0.7); g.lineWidth = 0.8; g.stroke();
    // 中間的孔
    if (rx > G2.pegW * 1.2) {
      g.beginPath(); g.ellipse(x, yT, G2.pegW * 0.72, Math.max(1.2, e * 0.42), 0, 0, Math.PI * 2);
      g.fillStyle = alpha(shade(col, -0.7), 0.85); g.fill();
    }
    // 外框
    g.beginPath(); g.moveTo(x - rx, yT); g.lineTo(x - rx, yB); g.ellipse(x, yB, rx, e, 0, Math.PI, 0, true); g.lineTo(x + rx, yT);
    g.strokeStyle = alpha(shade(col, -0.55), 0.6); g.lineWidth = 1; g.stroke();
    // 盤號
    const fs = Math.min(13, (yB - yT) * 0.66);
    if (fs >= 7.5 && rx > 12) {
      g.font = fnt(fs, 700); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 2.6; g.strokeStyle = alpha(shade(col, -0.6), 0.75);
      const ty = (yT + yB) / 2 + e * 0.45;
      g.strokeText(String(d), x, ty);
      g.fillStyle = '#ffffff'; g.fillText(String(d), x, ty);
    }
    if (opt.ring) {
      g.beginPath(); g.ellipse(x, yB, rx + 4, e + 3, 0, 0, Math.PI * 2);
      g.strokeStyle = alpha(opt.ring, 0.9); g.lineWidth = 2; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
    }
  }
  function draw2d() {
    const g = ctx, n = S.n, t = now();
    geom2d();
    if (!baseCache || baseCache.key !== W + 'x' + H + ':' + n + ':' + D.ver) buildBase();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(baseCache.c, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const goal = S.target.kind === 'peg' ? S.target.peg : -1;
    // 目標柱的底座發光
    if (goal >= 0) {
      const x = G2.px[goal], gg = g.createRadialGradient(x, G2.surf, 2, x, G2.surf, G2.maxW * 0.55);
      gg.addColorStop(0, alpha(C.goal, D.dark ? 0.32 : 0.22)); gg.addColorStop(1, alpha(C.goal, 0));
      g.save(); g.translate(0, G2.surf); g.scale(1, 0.22); g.translate(0, -G2.surf);
      g.fillStyle = gg; g.beginPath(); g.arc(x, G2.surf, G2.maxW * 0.55, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // 柱腳的孔與柱子
    for (let p = 0; p < 3; p++) {
      const x = G2.px[p];
      g.beginPath(); g.ellipse(x, G2.surf, G2.pegW * 0.95, G2.pegW * 0.3, 0, 0, Math.PI * 2);
      g.fillStyle = alpha(shade(C.wood, -0.6), 0.6); g.fill();
      drawPeg(g, x, G2.surf, G2.pegTop);
      drawPegCap(g, x);
    }
    // 鍵盤游標
    if (ui.focus) {
      const x = G2.px[ui.cursor];
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = C.accent; g.lineWidth = 1.6;
      D.roundRect(g, x - G2.maxW / 2 - 4, G2.pegTop - G2.dh * 1.4, G2.maxW + 8, G2.surf - G2.pegTop + G2.dh * 1.4 + 6, 10); g.stroke(); g.restore();
    }
    // 疊在柱子上的盤（由下往上），每根柱子最上面的盤之上再補畫一段柱子
    const flying = [];
    const lift = G2.lift;
    for (let p = 0; p < 3; p++) {
      let topY = G2.surf;
      for (let d = n; d >= 1; d--) {
        if (anim.shown[d] !== p) continue;
        const q = pose(d, lift);
        if (q.fly) { flying.push([d, q]); continue; }
        if (ui.drag && ui.drag.disk === d) continue;
        const cy = yOf(q.y);
        D.contactShadow(g, G2.px[p], cy + G2.dh / 2, discW(d) * 0.5, 0);
        drawDisc(g, d, G2.px[p], cy);
        topY = cy - G2.dh / 2;
      }
      if (topY < G2.surf) { drawPeg(g, G2.px[p], topY + 1, G2.pegTop); drawPegCap(g, G2.px[p]); }
    }
    if (anim.cur) flying.push([anim.cur.disk, pose(anim.cur.disk, lift)]);
    // 最短路的下一步（虛線弧形箭頭）
    const hm = hintMove();
    if (hm && !animating() && !ui.drag) {
      const xa = G2.px[hm.from], xb = G2.px[hm.to], ya = G2.pegTop - 10, top = G2.pegTop - 30;
      g.save(); g.setLineDash([6, 5]); g.strokeStyle = C.hint; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(xa, ya); g.quadraticCurveTo((xa + xb) / 2, top - 8, xb, ya); g.stroke(); g.restore();
      const ang = Math.atan2(ya - (top - 8), xb - (xa + xb) / 2);
      g.save(); g.translate(xb, ya); g.rotate(ang); g.fillStyle = C.hint;
      g.beginPath(); g.moveTo(2, 0); g.lineTo(-9, -5); g.lineTo(-9, 5); g.closePath(); g.fill(); g.restore();
      D.pill(g, T('下一步：盤 ' + hm.disk, 'next: disc ' + hm.disk), (xa + xb) / 2, top - 10, C.hint, 'center', fnt(12, 600));
    }
    // 拿起來的盤：哪些柱子可以放
    if (ui.sel >= 0 && !animating()) {
      const d = S.top(ui.sel);
      for (let p = 0; p < 3; p++) {
        if (p === ui.sel) continue;
        const tp = S.top(p), ok = !tp || tp > d, x = G2.px[p], y = G2.pegTop - 18;
        g.save(); g.strokeStyle = ok ? C.ok : C.bad; g.lineWidth = 2.6; g.lineCap = 'round';
        g.beginPath();
        if (ok) { g.moveTo(x - 7, y - 4); g.lineTo(x, y + 3); g.lineTo(x + 7, y - 4); }
        else { g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); }
        g.stroke(); g.restore();
      }
    }
    // 飛行中、拿起來的盤（畫在最上面），影子落在底座上
    flying.forEach(function (it) {
      const d = it[0], q = it[1];
      let x = xOf(q.x), cy = yOf(q.y);
      const fl = ui.flash && t - ui.flash.t0 < 450 && ui.flash.disk === d;
      if (fl) x += Math.sin((t - ui.flash.t0) / 22) * 5 * (1 - (t - ui.flash.t0) / 450);
      D.contactShadow(g, x, G2.surf, discW(d) * 0.5, clamp((G2.surf - cy) / (G2.surf - G2.pegTop + 40), 0, 1));
      drawDisc(g, d, x, cy, { glow: q.sel ? C.sel : null });
    });
    if (ui.drag) {
      const d = ui.drag.disk;
      D.contactShadow(g, ui.drag.x, G2.surf, discW(d) * 0.5, clamp((G2.surf - ui.drag.y) / (G2.surf - G2.pegTop + 40), 0, 1));
      drawDisc(g, d, ui.drag.x, ui.drag.y, { glow: C.sel });
    }
    // 違規：目標柱最上面的盤閃紅光
    if (ui.flash && t - ui.flash.t0 < 700) {
      const u = (t - ui.flash.t0) / 700, p = ui.flash.peg, h = stackHeight(p, -1);
      D.ripple(g, G2.px[p], yOf(Math.max(0, h - 1)), discW(ui.flash.onto) * 0.35, u, C.bad);
    }
    // 柱名與目標
    for (let p = 0; p < 3; p++) {
      const isGoal = p === goal;
      D.pill(g, isGoal ? PEG[p] + T(' · 目標', ' · target') : PEG[p], G2.px[p], H - 7, isGoal ? C.goal : C.muted, 'center', fnt(13, 700));
    }
    // 讀數
    const m = S.stack.length, dist = S.dist(), solvedNow = dist === 0 && m > 0;
    let bx = 8;
    const b1 = D.pill(g, T('步數 ', 'Moves ') + m, bx, 26, C.text, 'left', fnt(13, 700));
    bx += b1.w + 6;
    if (solvedNow) D.pill(g, T('完成！', 'Done!') + (m === S.seg.startDist ? T('（最少步數）', ' (fewest)') : T('（最少 ' + S.seg.startDist + ' 步）', ' (fewest ' + S.seg.startDist + ')')), bx, 26, C.ok, 'left', fnt(13, 700));
    else D.pill(g, T('離目標 ', 'To target ') + dist + T(' 步', ''), bx, 26, C.muted, 'left', fnt(12.5, 600));
    if (S.target.kind === 'custom') D.pill(g, T('目標：', 'Target: ') + S.state.call({ pos: S.target.pos, n: n }), W - 8, 26, C.goal, 'right', fnt(12.5, 700));
    else if (ui.pick) D.pill(g, T('在狀態圖上點選目標', 'Pick a target on the graph'), W - 8, 26, C.goal, 'right', fnt(12, 600));
    // 完成時的光環
    if (ui.solvedAt && t - ui.solvedAt < 1200 && goal >= 0) {
      const u = (t - ui.solvedAt) / 1200;
      D.ripple(g, G2.px[goal], yOf(n * 0.5), G2.maxW * 0.3, u, C.ok);
    }
  }

  // ---------- 2D 畫面的點選與拖曳 ----------
  function evPos(e, c) { const b = (c || cv).getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
  function pegAt(x) { geom2d(); let best = 0; for (let p = 1; p < 3; p++) if (Math.abs(x - G2.px[p]) < Math.abs(x - G2.px[best])) best = p; return best; }
  function onTopDisc(q) {
    const p = pegAt(q.x), d = S.top(p);
    if (!d) return -1;
    const h = stackHeight(p, -1), cy = yOf(h - 1);
    return Math.abs(q.x - G2.px[p]) <= discW(d) / 2 + 8 && Math.abs(q.y - cy) <= G2.dh * 1.2 ? p : -1;
  }
  cv.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    const b = cv.getBoundingClientRect(), t = e.touches[0];
    if (onTopDisc({ x: t.clientX - b.left, y: t.clientY - b.top }) >= 0) e.preventDefault();   // 按在最上面的盤上：拖曳，不捲動頁面
  }, { passive: false });
  cv.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    finishAnim();
    const q = evPos(e), p = onTopDisc(q);
    ui.down = { x: q.x, y: q.y, peg: pegAt(q.x), drag: p, moved: false };
    if (p >= 0) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } }
  });
  cv.addEventListener('pointermove', function (e) {
    const dn = ui.down;
    if (!dn) return;
    const q = evPos(e);
    if (!dn.moved && Math.hypot(q.x - dn.x, q.y - dn.y) > 7 && dn.drag >= 0) {
      dn.moved = true;
      stopPlay();
      ui.sel = -1;
      const d = S.top(dn.drag);
      ui.drag = { disk: d, from: dn.drag, x: q.x, y: q.y };
      sndPick(d);
      cv.style.cursor = 'grabbing';
    }
    if (ui.drag) { ui.drag.x = clamp(q.x, 10, W - 10); ui.drag.y = clamp(q.y, 8, G2.surf - G2.dh / 2); requestDraw(); }
  });
  function endPointer(e, cancel) {
    const dn = ui.down;
    ui.down = null;
    cv.style.cursor = '';
    if (!dn) return;
    if (ui.drag) {
      const dr = ui.drag, to = pegAt(dr.x);
      ui.drag = null;
      if (!cancel && to !== dr.from) handMove(dr.from, to);
      else { say(T('放回原處。', 'Put back.')); requestDraw(); }
      return;
    }
    if (!cancel && !dn.moved) pegClick(dn.peg);
  }
  cv.addEventListener('pointerup', function (e) { endPointer(e, false); });
  cv.addEventListener('pointercancel', function (e) { endPointer(e, true); });
  // 鍵盤：1、2、3 或 A、B、C 選柱子；左右鍵移動游標、Enter／空白鍵拿起或放下；Backspace 上一步
  cv.addEventListener('keydown', function (e) {
    const k = e.key;
    let handled = true;
    if (k === '1' || k === 'a' || k === 'A') pegClick(0);
    else if (k === '2' || k === 'b' || k === 'B') pegClick(1);
    else if (k === '3' || k === 'c' || k === 'C') pegClick(2);
    else if (k === 'ArrowLeft') { ui.cursor = (ui.cursor + 2) % 3; kbSay(); }
    else if (k === 'ArrowRight') { ui.cursor = (ui.cursor + 1) % 3; kbSay(); }
    else if (k === 'Enter' || k === ' ') pegClick(ui.cursor);
    else if (k === 'Backspace') $('undoBtn').click();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); requestDraw(); }
  });
  function kbSay() {
    const p = ui.cursor, d = S.top(p);
    say(T('游標在 ' + pegName(p) + '：' + (d ? '最上面是盤 ' + d : '空的') + '。', 'Cursor on peg ' + PEG[p] + ': ' + (d ? 'disc ' + d + ' on top' : 'empty') + '.'));
  }
  cv.addEventListener('focus', function () { ui.focus = true; requestDraw(); });
  cv.addEventListener('blur', function () { ui.focus = false; requestDraw(); });
  if (window.LabKeys) window.LabKeys.attach(cv, {
    label: T('河內塔畫布：三根柱子與盤子。點一根柱子拿起最上面的盤，再點另一根柱子放下；也可以直接拖曳盤子。鍵盤：1、2、3（或 A、B、C）選柱子，左右方向鍵移動游標、Enter 拿起或放下，Backspace 是上一步。',
      'Tower of Hanoi canvas: three pegs and the discs. Tap a peg to pick up its top disc, then tap another peg to put it down; you can also drag a disc. Keyboard: 1, 2, 3 (or A, B, C) pick a peg, left and right arrows move a cursor, Enter picks up or puts down, Backspace undoes.'),
    items: []
  });

  // =====================================================================
  // 遞迴圖：呼叫堆疊＋遞迴樹（＋尺）
  // =====================================================================
  let RW = 600, RH = 220, recDirty = true, recWide = true;
  function resizeRec() {
    RW = Math.max(280, cvR.clientWidth || W);
    recWide = RW >= 560;
    RH = recWide ? 230 : 300;
    cvR.style.height = RH + 'px';
    cvR.width = Math.round(RW * dpr); cvR.height = Math.round(RH * dpr);
  }
  const treeCache = { key: '', tree: null };
  /** 目前要畫的樹：{ tree, m（做到第幾步）, frame（目前的呼叫）, kind（'plan' 自動解／'follow' 親手照最佳解走／'preview' 預覽）, alg } */
  function recModel() {
    const a = S.auto, n = S.n;
    if (S.target.kind !== 'peg') return null;
    const t = S.target.peg;
    if (a && a.tree && (a.valid || a.finished) && a.alg === 'rec') return { tree: a.tree, m: a.m, frame: a.m ? a.tree.moves[a.m - 1].node : 0, kind: 'plan', alg: 'rec', from: a.from };
    if (a && a.alg === 'iter' && (a.valid || a.finished)) {
      const tr = cachedTree('h:' + n + ':' + a.from + ':' + t, function () { return HC.hanoiTree(n, a.from, t); });
      return { tree: tr, m: a.m, frame: a.m ? tr.moves[a.m - 1].node : 0, kind: 'plan', alg: 'iter', from: a.from };
    }
    const sp = S.seg.startPerfect;
    if (sp >= 0 && sp !== t) {
      const tr = cachedTree('h:' + n + ':' + sp + ':' + t, function () { return HC.hanoiTree(n, sp, t); });
      const st = S.stack;
      const follow = st.length <= tr.moves.length && st.every(function (mv, i) { const o = tr.moves[i]; return o.disk === mv.disk && o.from === mv.from && o.to === mv.to; });
      if (follow) return { tree: tr, m: st.length, frame: st.length ? tr.moves[st.length - 1].node : 0, kind: st.length ? 'follow' : 'preview', alg: S.alg, from: sp };
    }
    if (S.solved()) return null;
    const code = S.code();
    const tr = cachedTree('s:' + n + ':' + code + ':' + t, function () { return HC.solveTree(S.pos, n, t); });
    return { tree: tr, m: 0, frame: 0, kind: 'preview', alg: S.alg, from: HC.perfectPeg(S.pos, n) };
  }
  function cachedTree(key, make) {
    if (treeCache.key !== key) { treeCache.key = key; treeCache.tree = make(); }
    return treeCache.tree;
  }
  function frameLabel(nd) {
    if (nd.kind === 'hanoi') return 'hanoi(' + nd.k + ', ' + PEG[nd.from] + ', ' + PEG[nd.to] + ', ' + PEG[nd.via] + ')';
    return 'solve(' + nd.k + ', ' + PEG[nd.to] + ')';
  }
  function drawRec() {
    const g = ctxR;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, RW, RH);
    const M = recModel();
    if (!M || !M.tree.moves.length) {
      const msg = S.target.kind !== 'peg' ? T('自訂目標：沒有遞迴解，請親手走（可以開「顯示最短路」）', 'Custom target: no recursive solution — move by hand (try “Show shortest path”)')
        : T('已經在目標了。按「重來」或「打亂」再試一次。', 'Already at the target. Press “Restart” or “Shuffle” to try again.');
      D.haloText(g, msg, RW / 2, RH / 2, C.muted, 'center', 'middle', fnt(13, 500));
      return;
    }
    const tr = M.tree, nodes = tr.nodes, total = tr.moves.length, m = M.m;
    const path = HC.stackOf(tr, M.frame);
    const onPath = {};
    path.forEach(function (nd) { onPath[nd.id] = true; });
    const nextNode = m < total ? tr.moves[m].node : -1;
    // ---------- 版面 ----------
    let sx, sy, sw, sh, tx, ty, tw, th;
    if (recWide) { sx = 8; sy = 8; sw = Math.min(260, RW * 0.38); sh = RH - 16; tx = sx + sw + 14; ty = 8; tw = RW - tx - 10; th = RH - 16; }
    else { sx = 8; sy = 8; sw = RW - 16; sh = 128; tx = 10; ty = sy + sh + 8; tw = RW - 20; th = RH - ty - 8; }
    // ---------- 呼叫堆疊（最小盤輪流時改成規則說明） ----------
    g.save();
    D.roundRect(g, sx, sy, sw, sh, 8);
    g.fillStyle = alpha(C.surface, D.dark ? 0.5 : 0.75); g.fill();
    g.strokeStyle = alpha(C.border, 0.9); g.lineWidth = 1; g.stroke();
    g.restore();
    if (M.alg === 'iter' && M.kind === 'plan') drawIterRule(g, sx, sy, sw, sh, M);
    else {
      D.haloText(g, T('呼叫堆疊（上 = 最外層）', 'Call stack (top = outermost)'), sx + 8, sy + 15, C.muted, 'left', 'middle', fnt(11.5, 600));
      const rowH = 17, maxRows = Math.floor((sh - 26) / rowH);
      let rows = path;
      let skipped = 0;
      if (rows.length > maxRows) { skipped = rows.length - (maxRows - 1); rows = rows.slice(skipped); }
      let y = sy + 26;
      if (skipped) { D.haloText(g, T('⋮ 上面還有 ' + skipped + ' 層', '⋮ ' + skipped + ' more above'), sx + 10, y + rowH / 2, C.muted, 'left', 'middle', fnt(11.5, 500)); y += rowH; }
      rows.forEach(function (nd, i) {
        const cur = i === rows.length - 1, ind = Math.min(nd.depth, 9) * 6;
        if (cur) { D.roundRect(g, sx + 4, y, sw - 8, rowH - 1, 5); g.fillStyle = alpha(C.accent, D.dark ? 0.22 : 0.14); g.fill(); }
        D.haloText(g, frameLabel(nd), sx + 10 + ind, y + rowH / 2 + 0.5, cur ? C.text : C.muted, 'left', 'middle', '600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace');
        // 這一層的指令：已做完（實心）、正在做（框）、還沒做（空）
        const pc = HC.pcOf(tr, nd, m), k = nd.instr.length;
        for (let j = 0; j < k; j++) {
          const it = nd.instr[j], bx = sx + sw - 12 - (k - j) * 15, by = y + 3;
          const isMove = it.type === 'move';
          g.beginPath();
          if (isMove) g.arc(bx + 5.5, by + 5.5, 4.6, 0, Math.PI * 2); else D.roundRect(g, bx, by, 11, 11, 2.5);
          const col = isMove ? C.d[nd.k] : C.accent;
          if (j < pc) { g.fillStyle = alpha(col, 0.85); g.fill(); }
          else if (j === pc) { g.strokeStyle = col; g.lineWidth = 2; g.stroke(); }
          else { g.strokeStyle = alpha(C.muted, 0.5); g.lineWidth = 1; g.stroke(); }
        }
        y += rowH;
      });
      if (M.kind === 'preview') D.haloText(g, T('（按「單步」開始）', '(press “Step” to start)'), sx + 10, sy + sh - 10, C.muted, 'left', 'middle', fnt(11.5, 500));
    }
    // ---------- 遞迴樹 ----------
    const maxDepth = nodes.reduce(function (a, nd) { return Math.max(a, nd.depth); }, 0);
    const rulerH = Math.min(30, th * 0.2), top = ty + 22, bottom = ty + th - rulerH - 10;
    const dy = maxDepth ? (bottom - top) / maxDepth : 0;
    const xs = function (idx) { return tx + (idx - 0.5) / total * tw; };
    const posOf = function (nd) {
      let own = -1;
      nd.instr.forEach(function (it) { if (it.type === 'move') own = it.idx; });
      return { x: own > 0 ? xs(own) : xs((nd.L + nd.R) / 2), y: top + nd.depth * dy, own: own };
    };
    const P = nodes.map(posOf);
    const r = clamp(0.42 * tw / total, 1.3, 9);
    D.haloText(g, T('遞迴樹：第 ' + m + '／' + total + ' 步', 'Recursion tree: move ' + m + ' of ' + total), tx, ty + 8, C.muted, 'left', 'middle', fnt(11.5, 600));
    // 邊
    g.lineWidth = total > 200 ? 0.6 : 1;
    nodes.forEach(function (nd, i) {
      if (nd.parent < 0) return;
      const a = P[nd.parent], b = P[i], hot = onPath[nd.id] && onPath[nd.parent];
      g.strokeStyle = hot ? alpha(C.accent, 0.95) : alpha(C.muted, total > 200 ? 0.22 : 0.4);
      g.lineWidth = hot ? 2 : (total > 200 ? 0.6 : 1);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    });
    // 節點
    nodes.forEach(function (nd, i) {
      const p = P[i], done = p.own > 0 && p.own <= m, col = C.d[nd.k];
      if (r >= 3) {
        g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fillStyle = done ? col : alpha(C.bg, 0.95); g.fill();
        g.strokeStyle = done ? shade(col, -0.35) : alpha(col, 0.75); g.lineWidth = 1.2; g.stroke();
        if (r >= 6.5) {
          g.font = fnt(Math.min(11, r * 1.25), 700); g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = done ? '#ffffff' : C.text; g.fillText(String(nd.k), p.x, p.y + 0.5);
        }
      } else {
        g.fillStyle = done ? col : alpha(col, 0.35);
        g.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
      }
      if (onPath[nd.id] && M.kind !== 'preview') { g.beginPath(); g.arc(p.x, p.y, Math.max(r, 3) + 3, 0, Math.PI * 2); g.strokeStyle = C.accent; g.lineWidth = 2; g.stroke(); }
    });
    if (nextNode >= 0) {
      const p = P[nextNode];
      g.beginPath(); g.arc(p.x, p.y, Math.max(r, 3) + 5, 0, Math.PI * 2);
      g.strokeStyle = alpha(C.hint, 0.9); g.lineWidth = 2; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
    }
    // 尺：每一步一條刻度，長度 ∝ 搬的盤
    const ry = ty + th - 2;
    g.strokeStyle = alpha(C.muted, 0.6); g.lineWidth = 1;
    g.beginPath(); g.moveTo(tx, ry + 0.5); g.lineTo(tx + tw, ry + 0.5); g.stroke();
    const nmax = S.n;
    g.lineWidth = Math.max(0.6, Math.min(3, tw / total * 0.55));
    for (let i = 1; i <= total; i++) {
      const mv = tr.moves[i - 1], x = xs(i), h = rulerH * mv.disk / nmax;
      g.strokeStyle = i <= m ? C.d[mv.disk] : alpha(C.muted, 0.35);
      g.beginPath(); g.moveTo(x, ry); g.lineTo(x, ry - h); g.stroke();
    }
  }
  function drawIterRule(g, sx, sy, sw, sh, M) {
    const a = S.auto, n = S.n, t = S.target.peg, from = M.from >= 0 ? M.from : 0;
    const via = 3 - from - t, cyc = n % 2 ? [from, t, via] : [from, via, t];
    const lines = [
      [T('最小盤輪流（不用遞迴）', 'Smallest disc alternates (no recursion)'), C.muted, 600],
      [T('奇數步：盤 1 照 ', 'Odd moves: disc 1 goes ') + PEG[cyc[0]] + ' → ' + PEG[cyc[1]] + ' → ' + PEG[cyc[2]] + ' → ' + PEG[cyc[0]], C.text, 600],
      [T('偶數步：唯一不動盤 1 的合法移動', 'Even moves: the only legal move without disc 1'), C.text, 600]
    ];
    const m = a ? a.m : 0, total = a ? a.moves.length : 0;
    if (a && m < total) {
      const mv = a.moves[m];
      lines.push([T('下一步是第 ' + (m + 1) + ' 步（' + ((m + 1) % 2 ? '奇數' : '偶數') + '）：', 'Next is move ' + (m + 1) + ' (' + ((m + 1) % 2 ? 'odd' : 'even') + '): ') + moveTxt(mv), C.accent, 700]);
    } else if (a) lines.push([T('完成：', 'Done: ') + total + T(' 步，和遞迴', ' moves, ') + (a.same ? T('每一步都相同', 'identical to the recursion') : T('不同', 'different')), C.ok, 700]);
    let y = sy + 16;
    lines.forEach(function (l) {
      g.font = fnt(12, l[2]);
      wrapText(g, l[0], sx + 10, y, sw - 20, 16, l[1]).forEach(function () { y += 16; });
      y += 3;
    });
  }
  function wrapText(g, text, x, y, maxW, lh, color) {
    const words = /[一-鿿]/.test(text) ? text.split('') : text.split(/(\s+)/);
    const out = [];
    let line = '';
    words.forEach(function (w) {
      const tst = line + w;
      if (g.measureText(tst).width > maxW && line) { out.push(line); line = w.trimStart ? w.trimStart() : w; } else line = tst;
    });
    if (line) out.push(line);
    const font = g.font;
    out.forEach(function (l, i) { D.haloText(g, l, x, y + i * lh, color, 'left', 'middle', font); });
    return out;
  }

  // =====================================================================
  // 狀態圖（謝爾賓斯基三角形）
  // =====================================================================
  let GW = 600, GH = 420, graphDirty = true, graphCache = null;
  const GL = { s: 300, x0: 0, y0: 0 };
  const layoutCache = {}, edgeCache = {};
  function layoutOf(n) { return layoutCache[n] || (layoutCache[n] = HC.layout(n)); }
  function edgesOf(n) { return edgeCache[n] || (edgeCache[n] = HC.edges(n)); }
  function resizeGraph() {
    GW = Math.max(280, cvG.clientWidth || W);
    GH = Math.round(clamp(GW * 0.74, 270, 460));
    cvG.style.height = GH + 'px';
    cvG.width = Math.round(GW * dpr); cvG.height = Math.round(GH * dpr);
    GL.s = Math.min(GW - 48, (GH - 64) / 0.8660254);
    GL.x0 = (GW - GL.s) / 2; GL.y0 = GH - 26;
    graphCache = null;
  }
  const gx = function (xy, c) { return GL.x0 + xy[2 * c] * GL.s; };
  const gy = function (xy, c) { return GL.y0 - xy[2 * c + 1] * GL.s; };
  function nodeR(n) { return n <= 2 ? 6 : n === 3 ? 4.6 : n === 4 ? 3.2 : n === 5 ? 2.2 : n === 6 ? 1.4 : 1; }
  function buildGraph() {
    const n = S.n, c = document.createElement('canvas');
    c.width = cvG.width; c.height = cvG.height;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, GW, GH);
    if (n <= HC.GRAPH_MAX) {
      const xy = layoutOf(n), E = edgesOf(n);
      g.lineCap = 'round';
      const lw = n <= 3 ? 2.2 : n === 4 ? 1.8 : n === 5 ? 1.4 : n === 6 ? 1 : 0.75;
      for (let d = 1; d <= n; d++) {
        g.beginPath();
        E.forEach(function (e) { if (e[2] === d) { g.moveTo(gx(xy, e[0]), gy(xy, e[0])); g.lineTo(gx(xy, e[1]), gy(xy, e[1])); } });
        g.strokeStyle = alpha(C.d[d], D.dark ? 0.7 : 0.62);
        g.lineWidth = lw * (d === n ? 1.6 : 1);
        g.stroke();
      }
      const r = nodeR(n);
      if (r >= 1.4) {
        for (let k = 0; k < xy.length / 2; k++) {
          g.beginPath(); g.arc(gx(xy, k), gy(xy, k), r, 0, Math.PI * 2);
          g.fillStyle = C.bg; g.fill();
          g.strokeStyle = alpha(C.text, 0.45); g.lineWidth = r >= 3 ? 1.1 : 0.7; g.stroke();
        }
      }
      if (n <= 2) for (let k = 0; k < xy.length / 2; k++) D.haloText(g, HC.str(HC.decode(k, n), n), gx(xy, k), gy(xy, k) - 11, C.muted, 'center', 'middle', fnt(11, 600));
    } else {
      // 盤子太多：只畫三角形的輪廓（7 層）當背景，不畫個別的狀態
      g.fillStyle = alpha(C.muted, 0.13);
      (function tri(x, y, s, k) {
        if (k === 0) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y); g.lineTo(x + s / 2, y - s * 0.8660254); g.closePath(); g.fill(); return; }
        tri(x, y, s / 2, k - 1); tri(x + s / 2, y, s / 2, k - 1); tri(x + s / 4, y - s / 2 * 0.8660254, s / 2, k - 1);
      })(GL.x0, GL.y0, GL.s, 6);
    }
    // 三個角
    [[0, GL.x0 - 4, GL.y0 + 4, 'right'], [1, GL.x0 + GL.s / 2, GL.y0 - GL.s * 0.8660254 - 8, 'center'], [2, GL.x0 + GL.s + 4, GL.y0 + 4, 'left']].forEach(function (k) {
      D.pill(g, T('全在 ' + PEG[k[0]], 'all on ' + PEG[k[0]]), k[1], k[2] + (k[0] === 1 ? 0 : 14), C.muted, k[3], fnt(11.5, 600));
    });
    graphCache = { c: c, key: n + ':' + GW + 'x' + GH + ':' + D.ver };
  }
  const bfsCurCache = { code: -1, n: 0, dist: null };
  function distFromHere(code) {
    if (bfsCurCache.code !== S.code() || bfsCurCache.n !== S.n) { bfsCurCache.code = S.code(); bfsCurCache.n = S.n; bfsCurCache.dist = HC.bfs(S.code(), S.n).dist; }
    return bfsCurCache.dist[code];
  }
  function pathCodes() {
    const n = S.n, out = [S.code()];
    if (S.target.kind === 'peg') {
      const p = S.pos.slice();
      HC.pathToPerfect(p, n, S.target.peg).forEach(function (m) { p[m.disk] = m.to; out.push(HC.encode(p, n)); });
    } else {
      let c = S.code();
      const td = S.tdist;
      while (td[c] > 0) { const nb = HC.neighbors(c, n).find(function (x) { return td[x] === td[c] - 1; }); if (nb == null) break; out.push(nb); c = nb; }
    }
    return out;
  }
  function drawGraph() {
    const g = ctxG, n = S.n, t = now();
    if (!graphCache || graphCache.key !== n + ':' + GW + 'x' + GH + ':' + D.ver) buildGraph();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(graphCache.c, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const xy = layoutOf(n), small = n <= HC.GRAPH_MAX;
    const r = Math.max(2, nodeR(n));
    // 廣度優先搜尋：一層一層塗色
    const B = ui.bfs && ui.bfs.n === n && ui.bfs.code === S.code() ? ui.bfs : null;
    if (ui.bfs && !B) ui.bfs = null;
    let layer = -1;
    if (B) {
      const dur = Math.min(2600, 140 + B.data.layers * 45);
      const u = reducedMotion ? 1 : clamp((t - B.t0) / dur, 0, 1);
      layer = Math.floor(u * B.data.layers + 1e-9);
      if (layer !== B.last) { if (B.last >= 0 && t - ui.sndAt > 70) { ui.sndAt = t; sndLayer(layer / Math.max(1, B.data.layers)); } B.last = layer; }
      if (small) {
        const dist = B.res.dist, L = B.data.layers, rr = Math.max(1.6, nodeR(n) + 0.6);
        for (let c = 0; c < dist.length; c++) {
          if (dist[c] > layer) continue;
          g.fillStyle = mix(C.accent, C.hint, dist[c] / Math.max(1, L));
          g.beginPath(); g.arc(gx(xy, c), gy(xy, c), rr, 0, Math.PI * 2); g.fill();
        }
      }
      D.pill(g, T('廣度優先搜尋：第 ' + layer + '／' + B.data.layers + ' 層', 'Breadth-first search: layer ' + layer + ' of ' + B.data.layers), 8, 24, C.accent, 'left', fnt(12, 700));
    }
    if (small) {
      // 走過的路
      const st = S.stack;
      if (st.length) {
        g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
        g.beginPath();
        let c = S.seg.startCode;
        g.moveTo(gx(xy, c), gy(xy, c));
        const tail = st.slice(-600);
        if (tail.length < st.length) { c = st[st.length - tail.length - 1].code; g.moveTo(gx(xy, c), gy(xy, c)); }
        tail.forEach(function (m) { g.lineTo(gx(xy, m.code), gy(xy, m.code)); });
        g.strokeStyle = alpha(C.trail, 0.85); g.lineWidth = n <= 4 ? 3 : 2.2; g.stroke();
        g.restore();
      }
      // 最短路
      if (S.hintOn && !S.solved()) {
        const pc = pathCodes();
        g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
        g.beginPath(); pc.forEach(function (c, i) { if (i) g.lineTo(gx(xy, c), gy(xy, c)); else g.moveTo(gx(xy, c), gy(xy, c)); });
        g.strokeStyle = alpha(C.hint, 0.9); g.lineWidth = n <= 4 ? 4 : 3; g.setLineDash([7, 5]); g.stroke();
        g.restore();
      }
      // 鍵盤游標
      if (ui.gFocus && ui.gCursor >= 0 && ui.gCursor < Math.pow(3, n)) {
        g.save(); g.setLineDash([3, 3]); g.strokeStyle = C.accent; g.lineWidth = 1.6;
        g.beginPath(); g.arc(gx(xy, ui.gCursor), gy(xy, ui.gCursor), r + 6, 0, Math.PI * 2); g.stroke(); g.restore();
      }
    }
    // 目標（圓圈）
    const tc = S.target.kind === 'peg' ? HC.encode(HC.perfect(n, S.target.peg), n) : S.target.code;
    g.beginPath(); g.arc(gx(xy, tc), gy(xy, tc), r + 5, 0, Math.PI * 2);
    g.strokeStyle = C.goal; g.lineWidth = 2.6; g.stroke();
    // 目前的狀態（亮點，跟著畫面上的動畫走）
    const shownCode = anim.shown.every(function (p, i) { return i === 0 || p >= 0; }) ? HC.encode(anim.shown, n) : S.code();
    D.ball(g, gx(xy, shownCode), gy(xy, shownCode), Math.max(4.5, r + 2.4), C.accent, { glow: 0.5 });
    if (!small) D.pill(g, T(n + ' 個盤子有 ' + group(HC.pow3(n)) + ' 種擺法，太密不畫（最多畫到 7 個盤子）', n + ' discs: ' + group(HC.pow3(n)) + ' positions — too dense to draw (up to 7 discs)'), GW / 2, GH - 4, C.muted, 'center', fnt(11.5, 600));
    else if (ui.pick) D.pill(g, T('點一個點，把它設成目標', 'Tap a dot to make it the target'), GW - 8, 24, C.goal, 'right', fnt(12, 700));
  }
  function nearestState(q) {
    const n = S.n;
    if (n > HC.GRAPH_MAX) return -1;
    const xy = layoutOf(n);
    let best = -1, bd = Math.max(14, GL.s / (Math.pow(2, n) - 1) * 0.6);
    for (let c = 0; c < xy.length / 2; c++) { const d = Math.hypot(gx(xy, c) - q.x, gy(xy, c) - q.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function pickState(c) {
    if (c < 0) return;
    const n = S.n, s = HC.str(HC.decode(c, n), n);
    if (ui.pick) {
      finishAnim(); stopPlay(); ui.sel = -1;
      if (c === S.code()) { say(T('目標不能是目前的擺法，請點另一個點。', 'The target cannot be the current position; tap another dot.')); return; }
      S.setCustom(c);
      ui.bfs = null; snapAnim();
      say(T('目標設成 ' + s + '（盤 1 起每個盤在哪根柱）：離目前最少 ' + S.dist() + ' 步。', 'Target set to ' + s + ' (the peg of each disc, disc 1 first): ' + S.dist() + ' moves from here at the least.'));
      changed();
    } else {
      const pp = HC.perfectPeg(HC.decode(c, n), n);
      say(T('這個點是 ' + s + (pp >= 0 ? '（整疊在 ' + pegName(pp) + '）' : '') + '：離目前的擺法最少 ' + distFromHere(c) + ' 步。', 'This dot is ' + s + (pp >= 0 ? ' (the whole tower on peg ' + PEG[pp] + ')' : '') + ': ' + distFromHere(c) + ' moves from the current position at the least.'));
    }
  }
  cvG.addEventListener('click', function (e) { pickState(nearestState(evPos(e, cvG))); });
  cvG.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && S.n <= HC.GRAPH_MAX) { e.preventDefault(); e.stopImmediatePropagation(); if (ui.gCursor < 0) ui.gCursor = S.code(); pickState(ui.gCursor); }
  });
  cvG.addEventListener('focus', function () { ui.gFocus = true; if (ui.gCursor < 0 || ui.gCursor >= Math.pow(3, S.n)) ui.gCursor = S.code(); graphDirty = true; requestDraw(); });
  cvG.addEventListener('blur', function () { ui.gFocus = false; graphDirty = true; requestDraw(); });
  if (window.LabKeys) window.LabKeys.attach(cvG, {
    label: T('狀態圖：每一個點是一種合法的擺法，每一條線是一次合法的移動。方向鍵沿著線移動游標，Enter 查看游標所在的擺法（選了「自訂目標」時把它設成目標）。',
      'State graph: each dot is one legal position and each line is one legal move. Arrow keys move a cursor along the lines; Enter shows the position under the cursor (or makes it the target when “Custom target” is selected).'),
    items: [{
      name: function () { return T('狀態圖游標', 'Graph cursor'); },
      move: function (dx, dy) {
        const n = S.n;
        if (n > HC.GRAPH_MAX) return false;
        if (ui.gCursor < 0 || ui.gCursor >= Math.pow(3, n)) ui.gCursor = S.code();
        const xy = layoutOf(n), c = ui.gCursor;
        let best = -1, bs = 0.3;
        HC.neighbors(c, n).forEach(function (nb) {
          const vx = xy[2 * nb] - xy[2 * c], vy = xy[2 * nb + 1] - xy[2 * c + 1], L = Math.hypot(vx, vy) || 1;
          const s = (vx * dx + vy * dy) / L;
          if (s > bs) { bs = s; best = nb; }
        });
        if (best < 0) return false;
        ui.gCursor = best; graphDirty = true;
        return true;
      },
      describe: function () {
        const n = S.n;
        if (n > HC.GRAPH_MAX) return T('盤子超過 7 個，狀態圖不畫個別的點。', 'More than 7 discs: the graph does not show individual positions.');
        const c = ui.gCursor < 0 ? S.code() : ui.gCursor;
        return HC.str(HC.decode(c, n), n) + T('，離目前 ' + distFromHere(c) + ' 步', ', ' + distFromHere(c) + ' moves from here');
      }
    }],
    onChange: function () { graphDirty = true; requestDraw(); }
  });

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function sync() {
    const n = S.n, a = S.auto;
    $('nDiskso').textContent = String(n);
    setHTML('rMoves', String(S.stack.length));
    const d = S.dist();
    setHTML('rDist', d === 0 ? '<span style="color:var(--hn-ok);font-weight:700">' + T('0（完成）', '0 (done)') + '</span>' : String(d));
    setHTML('rMin', group(HC.minMoves(n)));
    setHTML('rIllegal', String(S.illegal));
    setHTML('rState', S.state());
    for (let p = 0; p < 3; p++) {
      const b = $('peg' + p);
      b.setAttribute('aria-pressed', String(ui.sel === p));
      b.classList.toggle('goal', S.target.kind === 'peg' && S.target.peg === p);
    }
    const custom = S.target.kind === 'custom' || ui.pick;
    $('goalB').setAttribute('aria-pressed', String(!custom && S.target.peg === 1));
    $('goalC').setAttribute('aria-pressed', String(!custom && S.target.peg === 2));
    $('goalX').setAttribute('aria-pressed', String(custom));
    $('goalX').disabled = n > HC.GRAPH_MAX;
    $('algRec').setAttribute('aria-pressed', String(S.alg === 'rec'));
    $('algIter').setAttribute('aria-pressed', String(S.alg === 'iter'));
    $('skipBtn').disabled = S.alg !== 'rec';
    $('hint').checked = S.hintOn;
    // 自動解
    const M = recModel();
    if (M && M.tree.moves.length) {
      const tr = M.tree, path = HC.stackOf(tr, M.frame), cur = path[path.length - 1];
      setHTML('rCall', M.alg === 'iter' && M.kind === 'plan' ? T('（不用遞迴）', '(no recursion)') : frameLabel(cur));
      setHTML('rDepth', M.alg === 'iter' && M.kind === 'plan' ? '—' : String(path.length) + T(' 層', ''));
      const nx = M.m < tr.moves.length ? tr.moves[M.m] : null;
      setHTML('rNext', nx ? moveTxt(nx) + T('（第 ' + (M.m + 1) + ' 步）', ' (move ' + (M.m + 1) + ')') : T('完成', 'done'));
      setHTML('stepBox', stepBoxHtml(M, cur, nx));
    } else {
      setHTML('rCall', '—'); setHTML('rDepth', '—'); setHTML('rNext', '—');
      setHTML('stepBox', S.target.kind !== 'peg' ? T('<span class="muted">自訂目標沒有遞迴解。</span>', '<span class="muted">There is no recursive solution for a custom target.</span>') : T('<span class="muted">已經在目標了。</span>', '<span class="muted">Already at the target.</span>'));
    }
    // 狀態圖
    setHTML('rStates', group(HC.pow3(n)));
    setHTML('rEdges', group(3 * (HC.pow3(n) - 1) / 2));
    const B = ui.bfs && ui.bfs.n === n && ui.bfs.code === S.code() ? ui.bfs : null;
    setHTML('rLayers', B ? String(B.data.layers) : '—');
    setHTML('rBfsDist', B ? String(B.data.dist) : '—');
    $('playBtn').setAttribute('aria-pressed', String(ui.playing));
    renderQuizStreak();
  }
  function renderQuizStreak() { const ks = S.quiz.kindStreak; $('rStreak').textContent = T('盤號題 ' + ks.disk + '、搬法題 ' + ks.move, 'disc ' + ks.disk + ', move ' + ks.move); }
  function stepBoxHtml(M, cur, nx) {
    const k = M.m + 1, std = M.tree.nodes[0].kind === 'hanoi';
    let h = '';
    if (!nx) h = T('<span class="tag ok">完成</span>', '<span class="tag ok">done</span>');
    else if (std) {
      const bin = k.toString(2), z = HC.trailingZeros(k);
      h = T('第 ' + k + ' 步：' + k + ' 寫成二進位是 ' + bin + '，結尾 ' + z + ' 個 0 → 搬盤 ' + (z + 1) + '。',
        'Move ' + k + ': ' + k + ' is ' + bin + ' in binary, ending in ' + z + ' zero' + (z === 1 ? '' : 's') + ' → disc ' + (z + 1) + '.');
    } else h = T('不是從整疊出發：盤 k 不在目標柱時，先把比它小的盤全部集中到第三根柱子，再搬盤 k，最後把小盤整疊搬到它上面。',
      'Not starting from a full tower: when disc k is not on the target peg, first gather all smaller discs on the third peg, then move disc k, then move the smaller tower onto it.');
    if (!cur || (M.alg === 'iter' && M.kind === 'plan')) return h;
    const P = function (p) { return PEG[p]; };
    let e;
    if (cur.kind === 'hanoi' && cur.k > 1) {
      const v = P(cur.via);
      e = T(frameLabel(cur) + '：先 hanoi(' + (cur.k - 1) + ', ' + P(cur.from) + ', ' + v + ', ' + P(cur.to) + ')，再搬盤 ' + cur.k + '：' + P(cur.from) + ' → ' + P(cur.to) + '，最後 hanoi(' + (cur.k - 1) + ', ' + v + ', ' + P(cur.to) + ', ' + P(cur.from) + ')。',
        frameLabel(cur) + ': first hanoi(' + (cur.k - 1) + ', ' + P(cur.from) + ', ' + v + ', ' + P(cur.to) + '), then disc ' + cur.k + ': ' + P(cur.from) + ' → ' + P(cur.to) + ', then hanoi(' + (cur.k - 1) + ', ' + v + ', ' + P(cur.to) + ', ' + P(cur.from) + ').');
    } else if (cur.kind === 'hanoi') e = T(frameLabel(cur) + '：只有一個盤，直接搬（遞迴到底的基本情況）。', frameLabel(cur) + ': a single disc — just move it (the base case where the recursion stops).');
    else e = T(frameLabel(cur) + '：讓盤 1 到盤 ' + cur.k + ' 都到 ' + P(cur.to) + ' 柱。', frameLabel(cur) + ': bring discs 1 to ' + cur.k + ' onto peg ' + P(cur.to) + '.');
    return h + '<br><span class="muted">' + e + '</span>';
  }

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(frame); }
  function frame(t) {
    rafId = 0;
    t = now();
    stepPlay(t);
    stepAnim(t);
    const is3d = !!(view3 && view3.active);
    if (is3d) view3.frame(); else draw2d();
    if (recDirty) { drawRec(); recDirty = false; }
    const bfsAnim = ui.bfs && now() - ui.bfs.t0 < 2800;
    if (graphDirty || animating() || bfsAnim || (ui.bfs && ui.bfs.last < ui.bfs.data.layers)) { drawGraph(); graphDirty = false; }
    const busy = ui.playing || animating() || ui.drag || (ui.flash && t - ui.flash.t0 < 750) || (ui.solvedAt && t - ui.solvedAt < 1300) || bfsAnim || (ui.sel >= 0 && is3d);
    if (busy && !document.hidden) requestDraw();
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/hanoi-3d.js 與 three.js
  // =====================================================================
  let threeLib = null, loadToken = 0;
  const host3 = $('view3'), viewMsg = $('viewMsg');
  Object.assign(bridge, {
    T: T, D: D, HC: HC, reducedMotion: reducedMotion,
    colors: function () { return C; },
    n: function () { return S.n; },
    pose: pose,
    shown: function () { return anim.shown; },
    animating: animating,
    sel: function () { return ui.sel; },
    top: function (p) { return S.top(p); },
    goal: function () { return S.target.kind === 'peg' ? S.target.peg : -1; },
    custom: function () { return S.target.kind === 'custom' ? S.state.call({ pos: S.target.pos, n: S.n }) : ''; },
    hint: hintMove,
    flash: function () { return ui.flash; },
    solvedAt: function () { return ui.solvedAt; },
    hud: function () {
      const m = S.stack.length, d = S.dist();
      return { moves: m, dist: d, done: d === 0 && m > 0, fewest: S.seg.startDist };
    },
    pegClick: function (p) { pegClick(p); },
    undo: function () { $('undoBtn').click(); },
    onRotate: function () { ui.rotated = true; },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  });
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Hanoi3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Hanoi3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/hanoi-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Hanoi3D) throw new Error('hanoi-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function remember(mode) { try { localStorage.setItem('hanoi-view', mode); } catch (e) { /* 忽略 */ } }
  function setView(mode, quiet) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(quiet); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.Hanoi3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        if (!quiet) say(T('3D：點柱子拿起最上面的盤，再點另一根柱子放下；拖曳空白處可以轉動視角。', '3D: tap a peg to pick up its top disc, then tap another peg to put it down; drag the background to turn the view.'));
        requestDraw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D(quiet);
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
  function fail3D(quiet) {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    if (!quiet) viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面；所有功能都一樣。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept; everything works the same.');
    resize();
  }
  $('view2d').addEventListener('click', function () { remember('2d'); setView('2d'); });
  $('view3d').addEventListener('click', function () { remember('3d'); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.HanoiLab = {
    session: S, ui: ui, anim: anim,
    pegClick: pegClick,
    move: function (a, b) { return handMove(a, b); },
    finish: function () { finishAnim(); requestDraw(); },
    setView: setView,
    view3: function () { return view3; },
    graphPoint: function (code) { const xy = layoutOf(S.n); return { x: gx(xy, code), y: gy(xy, code) }; },
    setN: function (n) { if (window.LabNum) window.LabNum.set(elN, n); else elN.value = n; elN.dispatchEvent(new Event('input', { bubbles: true })); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    sync();
    updateSoundButton();
    legendShow();
    renderQuiz();
    recDirty = graphDirty = true;
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  readColors();
  S.setN(readN());
  anim.shown = S.pos.slice();
  ui.speed = clamp(Math.round(val(elSpeed)), 1, 60);
  $('speedo').textContent = String(ui.speed);
  $('hint').checked = false;
  legendShow();
  sync();
  renderQuiz();
  updateSoundButton();
  say(T('把整疊從 A 柱搬到 C 柱：最少要 2<sup>' + S.n + '</sup> − 1 = ' + HC.minMoves(S.n) + ' 步。點柱子（或拖曳盤子）開始。', 'Move the whole tower from peg A to peg C: at least 2<sup>' + S.n + '</sup> − 1 = ' + HC.minMoves(S.n) + ' moves. Tap a peg (or drag a disc) to begin.'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', function () { for (const id in lastHTML) delete lastHTML[id]; sync(); legendShow(); renderQuiz(); updateSoundButton(); recDirty = graphDirty = true; requestDraw(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cvR.clientWidth !== RW || cvG.clientWidth !== GW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); else requestDraw(); });
  resize();
  // 3D 是主畫面：有 WebGL 就自動切過去（使用者選過 2D 就尊重）
  let pref = '';
  try { pref = localStorage.getItem('hanoi-view') || ''; } catch (e) { /* 忽略 */ }
  if (pref !== '2d' && webglAvailable()) setView('3d', true);
})();
