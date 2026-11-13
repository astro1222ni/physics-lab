/* gene-expression.js — 「DNA 複製、轉錄與轉譯」的畫面與互動（計算全部在 gene-expression-core.js；3D 在 gene-expression-3d.js，切換時才載入） */
(function () {
  'use strict';
  const G = window.GeneCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';
  const TX_RATE = 40;      // RNA 聚合酶 II：每秒約 40 個鹼基
  const TL_RATE = 6;       // 真核核糖體：每秒約 6 個胺基酸
  const MAX_LEN = 150;
  const MAX_TUBES = 6;

  // =====================================================================
  // 顏色、數字
  // =====================================================================
  const C = {};
  const KEYS = ['ge-a', 'ge-t', 'ge-g', 'ge-c', 'ge-u', 'ge-np', 'ge-p', 'ge-pos', 'ge-neg', 'ge-stop', 'ge-heavy', 'ge-light', 'ge-tube', 'ge-good', 'ge-bad', 'ge-sel'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    KEYS.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function baseColor(b) { return C['ge-' + (b || 'n').toLowerCase()] || C['ge-stop']; }
  function aaColor(a) {
    const p = (G.AA[a] || G.AA['*'])[3];
    return p === 'np' ? C['ge-np'] : p === 'p' ? C['ge-p'] : p === '+' ? C['ge-pos'] : p === '-' ? C['ge-neg'] : C['ge-stop'];
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function aa3(a) { return (G.AA[a] || ['?'])[0]; }
  function aaName(a) { const q = G.AA[a]; return q ? T(q[1], q[2]) : '?'; }
  const KIND = {
    none: ['還沒有改', 'No change yet'],
    noncoding: ['改在讀碼框外：蛋白質不變', 'Outside the reading frame: the protein is unchanged'],
    silent: ['同義（沉默）突變：蛋白質不變', 'Synonymous (silent): the protein is unchanged'],
    missense: ['錯義突變', 'Missense'],
    nonsense: ['無意義突變：提早終止', 'Nonsense: stops early'],
    frameshift: ['移碼突變', 'Frameshift'],
    inframe: ['框內插入／缺失', 'In-frame insertion or deletion'],
    readthrough: ['終止密碼子不見了：讀過頭', 'Stop codon lost: read-through'],
    'lost-start': ['起始密碼子壞了', 'Start codon lost'],
    'gained-start': ['多了一個起始密碼子', 'New start codon'],
    complex: ['好幾種改變混在一起', 'Several changes combined']
  };
  function kindName(k) { const q = KIND[k] || KIND.complex; return T(q[0], q[1]); }
  const HYP = {
    semi: ['半保留', 'Semi-conservative'],
    cons: ['全保留', 'Conservative'],
    disp: ['分散', 'Dispersive']
  };
  function hypName(k) { return T(HYP[k][0], HYP[k][1]); }

  // =====================================================================
  // 共用
  // =====================================================================
  function sound() { const S0 = window.LabSound; return S0 && S0.enabled() ? S0 : null; }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function sndEdit(kind) {
    const S0 = sound(); if (!S0) return;
    if (kind === 'del') S0.sweep({ from: 620, to: 380, dur: 0.12, gain: 0.04, type: 'triangle' });
    else S0.tone({ freq: kind === 'ins' ? 660 : 523, dur: 0.07, gain: 0.04, type: 'triangle' });
  }
  function sndCodon(a) {
    const S0 = sound(); if (!S0) return;
    if (a === '*') { S0.tone({ freq: 784, dur: 0.12, gain: 0.04 }); setTimeout(function () { S0.tone({ freq: 523, dur: 0.22, gain: 0.04 }); }, 110); return; }
    const p = (G.AA[a] || G.AA['*'])[3];
    S0.tone({ freq: p === 'np' ? 440 : p === 'p' ? 523 : p === '+' ? 659 : 392, dur: 0.06, gain: 0.03, type: 'sine' });
  }
  function sndSpin() { const S0 = sound(); if (S0) S0.sweep({ from: 300, to: 900, dur: 0.9, gain: 0.035, type: 'sine' }); }
  function sndJudge(ok) {
    const S0 = sound(); if (!S0) return;
    if (ok) { [523, 659, 784].forEach(function (f, i) { setTimeout(function () { S0.tone({ freq: f, dur: 0.15, gain: 0.04 }); }, i * 100); }); }
    else S0.sweep({ from: 420, to: 260, dur: 0.3, gain: 0.04, type: 'sawtooth' });
  }
  function setStatus(id, s) { $(id).textContent = s; }
  function say(s) { const e = $('srSay'); e.textContent = ''; setTimeout(function () { e.textContent = s; }, 30); }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function fit(c, g, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }
  function panel(g, x, y, w, h) {
    D.roundRect(g, x, y, w, h, 10);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.35 : 0.72); g.fill();
    g.strokeStyle = D.alpha(D.c.border, 0.9); g.lineWidth = 1; g.stroke();
  }
  function title(g, s, x, y, col, align) { D.haloText(g, s, x, y, col || D.c.text, align || 'left', 'middle', '600 12px ' + FONT); }
  function small(g, s, x, y, col, align, base) { D.haloText(g, s, x, y, col || D.c.muted, align || 'left', base || 'middle', '11px ' + FONT); }
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  /** 依寬度斷行（中文逐字、英文逐詞） */
  function wrapLines(g, s, maxW, font) {
    g.font = font;
    const tokens = s.match(/[A-Za-z0-9'’′.,:;()\-–→%+]+\s*|\s+|./g) || [];
    const lines = []; let cur = '';
    tokens.forEach(function (t) {
      if (g.measureText(cur + t).width > maxW && cur) { lines.push(cur.trimEnd()); cur = t.trimStart(); }
      else cur += t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // =====================================================================
  // 一・從基因到蛋白質
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W1 = 300, H1 = 480;
  const PRESETS = {
    hbb: { seq: G.HBB, zh: 'β 血紅素', en: 'β-globin', sel: 12 + 19 },
    demo: { seq: G.DEMO, zh: '短短的基因', en: 'A tiny gene', sel: 3 },
    custom: { seq: '', zh: '自己輸入', en: 'Your own', sel: 0 }
  };
  const st = {
    preset: 'hbb', ref: G.HBB, seq: G.HBB, src: null, sel: 31, win: 0, winGoal: null,
    hist: [], info: null, tSeed: 1, runs: [], runNo: 0
  };
  const anim = { phase: 'idle', pos: 0, codon: 0, last: -1 };
  function identity(n) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }
  st.src = identity(st.seq.length);

  /** 重新計算序列的所有資訊 */
  function compute() {
    const seq = st.seq, ref = st.ref;
    const edits = G.editsFromMap(ref, seq, st.src);
    const c = G.classify(ref, seq, edits);
    const o = G.orf(seq), o0 = G.orf(ref);
    const both = G.bothStrands(seq);
    let insPos = -1, delPos = -1;
    edits.forEach(function (e) { if (e.kind === 'ins') insPos = e.pos; if (e.kind === 'del') delPos = e.pos; });
    const gc = seq.length ? (seq.match(/[GC]/g) || []).length / seq.length : 0;
    st.info = {
      preset: st.preset, seq: seq, len: seq.length, gc: gc, orf: o, orf0: o0, edits: edits,
      kind: c.kind, inOrf: c.inOrf, pRef: c.pRef, pMut: o ? o.protein : '', dAA: c.dAA, first: c.first,
      stopped: !!(o && o.stopped), both: both, pal: G.isPalindrome(seq),
      oneDel: G.oneAAdeleted(c.pRef, o ? o.protein : ''),
      nSub: edits.filter(function (e) { return e.kind === 'sub'; }).length,
      hasIns: edits.some(function (e) { return e.kind === 'ins'; }),
      hasDel: edits.some(function (e) { return e.kind === 'del'; }),
      idGap: insPos >= 0 && delPos >= 0 ? Math.abs(insPos - delPos) : -1
    };
    return st.info;
  }
  function geneEvent() {
    const f = st.info;
    return {
      preset: f.preset, seq: f.seq, len: f.len, kind: f.kind, nEdits: f.edits.length, nSub: f.nSub, hasIns: f.hasIns, hasDel: f.hasDel,
      idGap: f.idGap, editKinds: f.edits.map(function (e) { return e.kind; }), delLen: f.edits.reduce(function (s, e) { return s + (e.kind === 'del' ? e.len : 0); }, 0),
      pRef: f.pRef, pMut: f.pMut, dAA: f.dAA, stopped: f.stopped, fwd: f.both.fwd, rev: f.both.rev, pal: f.pal, oneDel: f.oneDel
    };
  }

  // ---------- 編輯 ----------
  function snapshot() {
    st.hist.push({ seq: st.seq, src: st.src.slice(), sel: st.sel });
    if (st.hist.length > 200) st.hist.shift();
  }
  function afterEdit(kind, msg) {
    stopAnim();
    compute();
    sndEdit(kind);
    renderAll();
    emit('gene', geneEvent());
    if (msg) setStatus('status', msg + verdictText());
    rebuild3();
  }
  function doSub(b) {
    if (!st.seq.length || st.seq[st.sel] === b) return;
    snapshot();
    const old = st.seq[st.sel];
    st.seq = st.seq.slice(0, st.sel) + b + st.seq.slice(st.sel + 1);
    afterEdit('sub', T('第 ' + (st.sel + 1) + ' 個鹼基 ' + old + ' → ' + b + '。', 'Base ' + (st.sel + 1) + ': ' + old + ' → ' + b + '. '));
  }
  function doIns(b) {
    if (st.seq.length >= MAX_LEN) { setStatus('status', T('最多 ' + MAX_LEN + ' 個鹼基。', 'At most ' + MAX_LEN + ' bases.')); return; }
    snapshot();
    const i = Math.min(st.sel, st.seq.length);
    st.seq = st.seq.slice(0, i) + b + st.seq.slice(i);
    st.src.splice(i, 0, -1);
    st.sel = i;
    afterEdit('ins', T('在第 ' + (i + 1) + ' 個位置插入 ' + b + '。', 'Inserted ' + b + ' at position ' + (i + 1) + '. '));
  }
  function doDel() {
    if (st.seq.length <= 3) { setStatus('status', T('至少要留 3 個鹼基。', 'Keep at least 3 bases.')); return; }
    snapshot();
    const old = st.seq[st.sel];
    st.seq = st.seq.slice(0, st.sel) + st.seq.slice(st.sel + 1);
    st.src.splice(st.sel, 1);
    const at = st.sel;
    st.sel = Math.min(st.sel, st.seq.length - 1);
    afterEdit('del', T('刪掉第 ' + (at + 1) + ' 個鹼基 ' + old + '。', 'Deleted base ' + (at + 1) + ' (' + old + '). '));
  }
  function undo() {
    const h = st.hist.pop();
    if (!h) { setStatus('status', T('沒有可以復原的步驟。', 'Nothing to undo.')); return; }
    st.seq = h.seq; st.src = h.src; st.sel = h.sel;
    afterEdit('sub', T('復原一步。', 'Undone. '));
  }
  function resetSeq() {
    st.seq = st.ref; st.src = identity(st.seq.length); st.hist = [];
    st.sel = Math.min(st.sel, st.seq.length - 1);
    afterEdit('sub', T('還原成原本的基因。', 'Gene restored. '));
  }
  function loadPreset(k) {
    if (k === 'custom') { $('seqIn').focus(); return; }
    st.preset = k; st.ref = PRESETS[k].seq; st.seq = st.ref; st.src = identity(st.seq.length); st.hist = [];
    st.sel = PRESETS[k].sel; st.win = 0; st.winGoal = null;
    centerOn(st.sel, true);
    stopAnim(); compute(); renderAll(); rebuild3();
    setStatus('status', k === 'hbb'
      ? T('β 血紅素基因的開頭：從第 13 個鹼基的 ATG 開始，讀出 31 個胺基酸。點一個鹼基，把它換掉。', 'The start of the β-globin gene: reading starts at the ATG at base 13 and gives 31 amino acids. Tap a base and change it.')
      : T('一個很短的基因：ATG 開始、TAG 結束。', 'A tiny gene: it starts at ATG and ends at TAG.'));
  }
  function applySeq() {
    const raw = $('seqIn').value;
    let s = G.clean(raw);
    if (s.length < 3) { setStatus('status', T('請輸入至少 3 個鹼基（只用 A、T、C、G）。', 'Type at least 3 bases (A, T, C and G only).')); return; }
    let note = '';
    if (s.length > MAX_LEN) { s = s.slice(0, MAX_LEN); note = T('（太長了，只取前 ' + MAX_LEN + ' 個）', ' (too long: only the first ' + MAX_LEN + ' are kept)'); }
    $('seqIn').value = s;
    st.preset = 'custom'; st.ref = s; st.seq = s; st.src = identity(s.length); st.hist = [];
    const o = G.orf(s);
    st.sel = o ? o.start : 0; st.win = 0; st.winGoal = null;
    centerOn(st.sel, true);
    stopAnim(); compute(); renderAll(); rebuild3();
    emit('gene', geneEvent());
    const f = st.info;
    setStatus('status', T('使用你輸入的 ' + s.length + ' 個鹼基', 'Using your ' + s.length + ' bases') + note + T('。', '. ') +
      (f.orf ? T('讀出 ' + f.pMut.length + ' 個胺基酸' + (f.stopped ? '。' : '，但沒有遇到終止密碼子。'), f.pMut.length + ' amino acids' + (f.stopped ? '.' : ', but no stop codon.'))
        : T('裡面沒有 ATG，核糖體找不到起點。', 'There is no ATG, so the ribosome has nowhere to start.')));
  }

  // ---------- 視窗與版面 ----------
  let L = null;
  function layout1() {
    const narrow = W1 < 640;
    const tw = narrow ? 21 : 24, lw = narrow ? 44 : 84;
    const mapY = 10, y0 = narrow ? 50 : 54;
    const y1 = y0 + tw + 9, y2 = y1 + tw + 32, y3 = y2 + tw + 12;
    const nWin = Math.max(6, Math.floor((W1 - lw - 10) / tw));
    const pTop = y3 + tw + (narrow ? 22 : 26);
    const bd = narrow ? 17 : 21, gap = 3;
    const pX0 = narrow ? 10 : 16, pW = W1 - 2 * pX0;
    const perRow = Math.max(8, Math.floor((pW - 12) / (bd + gap)));
    L = { narrow: narrow, tw: tw, lw: lw, mapY: mapY, y0: y0, y1: y1, y2: y2, y3: y3, nWin: nWin, pTop: pTop, bd: bd, gap: gap, pX0: pX0, pW: pW, perRow: perRow };
    return L;
  }
  function chainH(n, extra) {
    const rows = Math.max(1, Math.ceil((n + (extra ? 1 : 0)) / L.perRow));
    return 20 + rows * (L.bd + 6);
  }
  function neededH() {
    const f = st.info;
    const vl = verdictLines();
    return Math.round(L.pTop + 10 + chainH(f.pRef.length, true) + 8 + chainH(f.pMut.length, true) + 10 + vl.length * 18 + 16);
  }
  function resize1() {
    W1 = cv.clientWidth || 300;
    layout1();
    H1 = Math.max(L.narrow ? 420 : 400, neededH());
    fit(cv, ctx, H1);
    clampWin();
    request();
  }
  function clampWin() {
    const maxW = Math.max(0, st.seq.length - L.nWin);
    st.win = Math.max(0, Math.min(maxW, st.win));
  }
  function centerOn(i, instant) {
    if (!L) return;
    const goal = Math.max(0, Math.min(Math.max(0, st.seq.length - L.nWin), i - Math.floor(L.nWin / 2)));
    if (instant) { st.win = goal; st.winGoal = null; } else st.winGoal = goal;
  }
  function ensureVisible(i) {
    if (!L) return;
    if (i < st.win + 1 || i > st.win + L.nWin - 2) centerOn(i, reducedMotion);
  }
  function select(i) {
    st.sel = Math.max(0, Math.min(st.seq.length - 1, i));
    ensureVisible(st.sel);
    renderSel(); request(); rebuild3();
  }

  // ---------- 動畫 ----------
  function stopAnim() { anim.phase = 'idle'; anim.pos = 0; anim.codon = 0; anim.last = -1; updateRunBtn(); }
  function updateRunBtn() {
    $('runBtn').textContent = anim.phase === 'tx' || anim.phase === 'tl' ? T('停止', 'Stop') : T('轉錄＋轉譯', 'Transcribe and translate');
  }
  function startRun() {
    if (anim.phase === 'tx' || anim.phase === 'tl') { stopAnim(); request(); setStatus('status', T('停止了。', 'Stopped.')); return; }
    if (reducedMotion) { finishRun(); return; }
    anim.phase = 'tx'; anim.pos = 0; anim.codon = 0; anim.last = -1;
    updateRunBtn();
    setStatus('status', T('RNA 聚合酶沿著模板股合成 mRNA（每秒約 40 個鹼基）…', 'RNA polymerase builds the mRNA along the template strand (about 40 bases per second)…'));
    const S0 = sound(); if (S0) S0.sweep({ from: 330, to: 520, dur: 0.25, gain: 0.03, type: 'sine' });
    request();
  }
  function stepAnim(dt) {
    if (anim.phase === 'tx') {
      anim.pos += TX_RATE * dt;
      st.winGoal = null;
      st.win += ((anim.pos - L.nWin / 2) - st.win) * Math.min(1, dt * 6);
      clampWin();
      if (anim.pos >= st.seq.length) {
        const o = st.info.orf;
        if (!o) { finishRun(); return true; }
        anim.phase = 'tl'; anim.codon = 0; anim.last = -1;
        setStatus('status', T('核糖體從第一個 AUG 開始，每三個鹼基讀一個密碼子（每秒約 6 個）…', 'The ribosome starts at the first AUG and reads one codon per three bases (about 6 per second)…'));
      }
      return true;
    }
    if (anim.phase === 'tl') {
      const o = st.info.orf;
      anim.codon += TL_RATE * dt;
      const k = Math.floor(anim.codon);
      if (k !== anim.last && k < o.codons.length) { anim.last = k; sndCodon(G.codonAA(o.codons[k])); }
      const cx = o.start + 3 * Math.min(anim.codon, o.codons.length);
      st.winGoal = null;
      st.win += ((cx - L.nWin / 2) - st.win) * Math.min(1, dt * 5);
      clampWin();
      if (anim.codon >= o.codons.length) { finishRun(); }
      return true;
    }
    return false;
  }
  function finishRun() {
    anim.phase = 'done';
    updateRunBtn();
    const f = st.info, tgt = G.target(st.tSeed, 5);
    const match = f.stopped && f.pMut === tgt;
    st.runNo++;
    st.runs.unshift({ no: st.runNo, gene: st.preset, kind: f.kind, p: f.pMut, stopped: f.stopped, has: !!f.orf, match: match });
    if (st.runs.length > 12) st.runs.pop();
    renderRows1();
    emit('translate', { preset: f.preset, seq: f.seq, protein: f.pMut, stopped: f.stopped, hasOrf: !!f.orf, kind: f.kind, target: tgt, match: match });
    if (!f.orf) setStatus('status', T('轉錄完成，但 mRNA 上沒有 AUG，核糖體找不到起點，沒有蛋白質。', 'Transcription done, but the mRNA has no AUG: the ribosome has nowhere to start, so no protein is made.'));
    else setStatus('status', T('轉譯完成：', 'Translation finished: ') + f.pMut.length + T(' 個胺基酸', ' amino acids') +
      (f.stopped ? T('，在終止密碼子停下。', ', stopping at the stop codon.') : T('，讀到 mRNA 結尾都沒有終止密碼子。', ', with no stop codon before the end of the mRNA.')) +
      (match ? T('剛好是目標胜肽！', ' That is exactly the target peptide!') : ''));
    if (match) sndJudge(true);
    say(T('蛋白質：', 'Protein: ') + (f.pMut.split('').map(aa3).join('-') || '—'));
    request();
  }

  // ---------- 文字 ----------
  function verdictText() {
    const f = st.info, k = f.kind;
    let s = kindName(k);
    if (k === 'missense' && f.first >= 0) s += T('：第 ' + (f.first + 1) + ' 個胺基酸 ', ': amino acid ' + (f.first + 1) + ' ') + aa3(f.pRef[f.first]) + ' → ' + aa3(f.pMut[f.first]) + T('（' + aaName(f.pRef[f.first]) + ' → ' + aaName(f.pMut[f.first]) + '）', ' (' + aaName(f.pRef[f.first]) + ' → ' + aaName(f.pMut[f.first]) + ')');
    else if (k === 'nonsense') s += T('：只剩 ' + f.pMut.length + ' 個胺基酸（原本 ' + f.pRef.length + ' 個）', ': only ' + f.pMut.length + ' amino acids are left (of ' + f.pRef.length + ')');
    else if (k === 'frameshift') s += T('：從第 ' + (f.first + 1) + ' 個胺基酸起全部改變', ': every amino acid from number ' + (f.first + 1) + ' on changes') + (f.stopped ? '' : T('，而且沒有終止密碼子', ', and there is no stop codon'));
    else if (k === 'inframe') {
      const dl = f.pMut.length - f.pRef.length;
      if (f.oneDel) s += T('：剛好少了一個胺基酸', ': exactly one amino acid is missing');
      else if (dl === 0) s += T('：讀碼框救回來了，' + f.dAA + ' 個胺基酸不同', ': the reading frame is restored; ' + f.dAA + ' amino acids differ');
      else s += T('：' + (dl > 0 ? '多了 ' : '少了 ') + Math.abs(dl) + ' 個胺基酸', ': ' + Math.abs(dl) + ' amino acid' + (Math.abs(dl) > 1 ? 's ' : ' ') + (dl > 0 ? 'more' : 'fewer'));
    }
    else if (k === 'readthrough') s += T('：多了 ' + (f.pMut.length - f.pRef.length) + ' 個胺基酸', ': ' + (f.pMut.length - f.pRef.length) + ' extra amino acids');
    else if (k === 'lost-start') s += f.orf ? T('：從後面下一個 ATG 才開始讀', ': reading starts at the next ATG further on') : T('：沒有 ATG，做不出蛋白質', ': there is no ATG, so no protein is made');
    return s + T('。', '.');
  }
  function verdictLines() {
    return wrapLines(ctx, verdictText(), Math.max(120, (L ? L.pW : 300) - 24), '600 13px ' + FONT);
  }
  function renderSel() {
    const i = st.sel, b = st.seq[i], o = st.info.orf;
    let s = T('第 <code>' + (i + 1) + '</code> 個鹼基：', 'Base <code>' + (i + 1) + '</code>: ') + '<code>' + b + '</code>' +
      T('（配對 ', ' (pairs with ') + '<code>' + G.complement(b) + '</code>' + T('）', ')');
    if (o && i >= o.start && i < o.start + 3 * o.codons.length) {
      const k = Math.floor((i - o.start) / 3), cd = o.codons[k], a = G.codonAA(cd);
      s += T('<br>第 ' + (k + 1) + ' 個密碼子 ', '<br>codon ' + (k + 1) + ' ') + '<code>' + G.transcribe(cd) + '</code>' +
        T(' 的第 ' + ((i - o.start) % 3 + 1) + ' 個字母 → ', ', letter ' + ((i - o.start) % 3 + 1) + ' → ') + (a === '*' ? T('終止', 'stop') : aa3(a) + ' ' + aaName(a));
    } else s += T('<br>不在讀碼框內', '<br>outside the reading frame');
    $('selInfo').innerHTML = s;
  }
  function dl(id, rows) {
    $(id).innerHTML = rows.map(function (r) {
      return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>';
    }).join('');
  }
  function renderRo1() {
    const f = st.info, o = f.orf;
    const ek = { sub: 0, ins: 0, del: 0 };
    f.edits.forEach(function (e) { ek[e.kind] += e.kind === 'sub' ? 1 : e.len; });
    const bad = ['missense', 'nonsense', 'frameshift', 'lost-start', 'inframe', 'readthrough', 'complex'].indexOf(f.kind) >= 0;
    dl('ro1', [
      [T('長度', 'Length'), f.len + T(' 個鹼基', ' bases') + '<small>GC ' + num(f.gc * 100, 0) + '%</small>'],
      [T('讀碼框', 'Reading frame'), o ? T('第 ' + (o.start + 1) + '–' + o.end + ' 個鹼基', 'bases ' + (o.start + 1) + '–' + o.end) + '<small>' + o.codons.length + T(' 個密碼子', ' codons') + '</small>' : T('沒有 ATG', 'No ATG')],
      [T('蛋白質', 'Protein'), f.pMut.length + T(' 個胺基酸', ' amino acids') + (o && !f.stopped ? '<small>' + T('沒有終止密碼子', 'No stop codon') + '</small>' : '')],
      [T('改了', 'Changes'), f.edits.length ? T('替換 ' + ek.sub + '、插入 ' + ek.ins + '、刪除 ' + ek.del, ek.sub + ' substituted, ' + ek.ins + ' inserted, ' + ek.del + ' deleted') : T('沒有', 'None')],
      [T('結果', 'Effect'), kindName(f.kind), f.kind === 'none' ? '' : bad ? 'bad' : 'good'],
      [T('另一股', 'Other strand'), f.both.rev ? '<code>' + f.both.rev + '</code><small>' + T('反過來讀也是一個基因', 'Read backwards, it is a gene too') + '</small>' : '—']
    ]);
  }
  function renderTarget() {
    const t = G.target(st.tSeed, 5);
    $('target').innerHTML = T('目標胜肽：', 'Target peptide: ') + '<code>' + t.split('').map(aa3).join('–') + '</code>' +
      '<small>' + t.split('').map(aaName).join('、') + '</small>';
  }
  function renderGenes() {
    $('genes').innerHTML = ['hbb', 'demo', 'custom'].map(function (k) {
      return '<button type="button" data-g="' + k + '" aria-pressed="' + (st.preset === k) + '">' + T(PRESETS[k].zh, PRESETS[k].en) + '</button>';
    }).join('');
    $('geneHint').textContent = st.preset === 'hbb'
      ? T('人類 β 血紅素（HBB）基因的開頭，編碼序列只取前 31 個密碼子。', 'The start of the human β-globin (HBB) gene; only the first 31 codons of the coding sequence are used.')
      : st.preset === 'demo' ? T('一個 6 個密碼子長的小基因。', 'A small gene six codons long.')
        : T('你輸入的序列；改了以後和它比較。', 'Your own sequence; changes are compared with it.');
  }
  function renderRows1() {
    const tb = $('runs1');
    if (!st.runs.length) { tb.innerHTML = ''; return; }
    tb.innerHTML = '<thead><tr><th>#</th><th>' + T('基因', 'Gene') + '</th><th>' + T('結果', 'Effect') + '</th><th>' + T('蛋白質', 'Protein') + '</th><th>' + T('長度', 'Length') + '</th></tr></thead><tbody>' +
      st.runs.map(function (r) {
        const p = r.p.length > 14 ? r.p.slice(0, 14) + '…' : r.p;
        return '<tr><td>' + r.no + '</td><td>' + T(PRESETS[r.gene].zh, PRESETS[r.gene].en) + '</td><td>' + (r.has ? kindName(r.kind) : T('沒有 ATG', 'No ATG')) + (r.match ? T('（目標！）', ' (target!)') : '') +
          '</td><td class="seq">' + (p || '—') + (r.has && !r.stopped ? '…' : '') + '</td><td>' + r.p.length + '</td></tr>';
      }).join('') + '</tbody>';
  }
  function renderAll() { renderGenes(); renderSel(); renderRo1(); resize1(); }

  // ---------- 密碼表 ----------
  let codeWrap = null;
  function toggleCodeTable() {
    const on = $('codeTable').getAttribute('aria-pressed') !== 'true';
    $('codeTable').setAttribute('aria-pressed', String(on));
    if (!codeWrap) {
      codeWrap = document.createElement('div');
      codeWrap.className = 'tablewrap';
      $('runs1').parentNode.parentNode.insertBefore(codeWrap, $('runs1').parentNode);
    }
    codeWrap.hidden = !on;
    if (on) renderCodeTable();
  }
  function renderCodeTable() {
    if (!codeWrap || codeWrap.hidden) return;
    const B = 'UCAG';
    let h = '<table class="data runs"><caption style="text-align:left;caption-side:top;padding:4px 2px;color:var(--muted)">' + T('標準遺傳密碼表（mRNA 密碼子）', 'The standard genetic code (mRNA codons)') + '</caption><thead><tr><th></th>' +
      B.split('').map(function (b) { return '<th>' + T('第二個 ', '2nd ') + b + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (const a of B) {
      for (const c of B) {
        h += '<tr>' + (c === 'U' ? '<th rowspan="4">' + T('第一個 ', '1st ') + a + '</th>' : '');
        for (const b of B) {
          const cd = a + b + c, x = G.CODE[cd];
          h += '<td class="seq"><span style="color:' + aaColor(x) + ';font-weight:700">' + cd + '</span> ' + (x === '*' ? T('終止', 'Stop') : aa3(x)) + '</td>';
        }
        h += '</tr>';
      }
    }
    codeWrap.innerHTML = h + '</tbody></table>';
  }

  // ---------- 繪圖 ----------
  function tile(g, x, y, w, b, opt) {
    const col = baseColor(b);
    D.roundRect(g, x + 1, y, w - 2, w, 5);
    const gr = g.createLinearGradient(0, y, 0, y + w);
    gr.addColorStop(0, D.shade ? D.shade(col, 0.18) : col); gr.addColorStop(1, D.shade ? D.shade(col, -0.12) : col);
    g.fillStyle = gr; g.globalAlpha = opt && opt.alpha != null ? opt.alpha : 1; g.fill(); g.globalAlpha = 1;
    if (opt && opt.ring) { g.strokeStyle = opt.ring; g.lineWidth = 2.5; g.stroke(); }
    g.font = '700 ' + Math.round(w * 0.56) + 'px ' + MONO;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillText(b, x + w / 2 + 0.6, y + w / 2 + 1.4);
    g.fillStyle = '#ffffff'; g.fillText(b, x + w / 2, y + w / 2 + 0.8);
  }
  function bead(g, x, y, d, a, opt) {
    const col = aaColor(a);
    if (a === '*') {
      g.beginPath();
      for (let k = 0; k < 8; k++) { const t = Math.PI / 8 + k * Math.PI / 4; g.lineTo(x + Math.cos(t) * d / 2, y + Math.sin(t) * d / 2); }
      g.closePath(); g.fillStyle = col; g.fill();
      g.font = '700 ' + Math.round(d * 0.34) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText('STOP', x, y + 0.5);
      return;
    }
    D.ball(g, x, y, d / 2, col);
    if (opt && opt.ring) { g.beginPath(); g.arc(x, y, d / 2 + 2.5, 0, Math.PI * 2); g.strokeStyle = opt.ring; g.lineWidth = 2.2; g.stroke(); }
    g.font = '700 ' + Math.round(d * 0.52) + 'px ' + MONO; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillText(a, x + 0.5, y + 1.3);
    g.fillStyle = '#ffffff'; g.fillText(a, x, y + 0.8);
  }
  function drawMap() {
    const g = ctx, x0 = L.lw, x1 = W1 - 8, y = L.mapY, h = 12, n = st.seq.length;
    if (!n) return;
    const sx = (x1 - x0) / n;
    small(g, T('全長', 'Whole'), x0 - 8, y + h / 2, D.c.muted, 'right');
    for (let i = 0; i < n; i++) { g.fillStyle = D.alpha(baseColor(st.seq[i]), 0.75); g.fillRect(x0 + i * sx, y, Math.max(1, sx + 0.3), h); }
    const o = st.info.orf;
    if (o) {
      g.fillStyle = D.alpha(D.c.text, 0.55);
      g.fillRect(x0 + o.start * sx, y + h + 2, (o.end - o.start) * sx, 3);
    }
    // 改過的位置
    g.fillStyle = C['ge-sel'];
    for (let i = 0; i < n; i++) if (st.src[i] < 0 || st.seq[i] !== st.ref[st.src[i]]) { g.beginPath(); g.moveTo(x0 + (i + 0.5) * sx, y - 1); g.lineTo(x0 + (i + 0.5) * sx - 3.5, y - 7); g.lineTo(x0 + (i + 0.5) * sx + 3.5, y - 7); g.closePath(); g.fill(); }
    // 視窗
    D.roundRect(g, x0 + st.win * sx - 1, y - 2, Math.min(n, L.nWin) * sx + 2, h + 4, 3);
    g.strokeStyle = D.c.accent; g.lineWidth = 2; g.stroke();
  }
  function drawStrands() {
    const g = ctx, tw = L.tw, lw = L.lw, n = st.seq.length, f = st.info, o = f.orf;
    const xL = lw, xR = W1 - 8;
    const X = function (i) { return lw + (i - st.win) * tw; };
    const i0 = Math.max(0, Math.floor(st.win) - 1), i1 = Math.min(n, Math.ceil(st.win + L.nWin) + 1);
    // 列名
    const nm = L.narrow
      ? [T('編碼', 'Cod.'), T('模板', 'Tmpl'), 'mRNA', T('胺基酸', 'AA')]
      : [T('編碼股', 'Coding'), T('模板股', 'Template'), 'mRNA', T('胺基酸', 'Amino acid')];
    const ends = [["5'", "3'"], ["3'", "5'"], ["5'", "3'"], ['N', 'C']];
    [L.y0, L.y1, L.y2, L.y3].forEach(function (y, k) {
      D.haloText(g, nm[k], 4, y + tw / 2 - (L.narrow ? 0 : 6), D.c.text, 'left', 'middle', '600 ' + (L.narrow ? 10.5 : 12) + 'px ' + FONT);
      if (!L.narrow) small(g, ends[k][0] + ' → ' + ends[k][1], 4, y + tw / 2 + 8, D.c.muted, 'left');
    });
    g.save();
    g.beginPath(); g.rect(xL - 2, 0, xR - xL + 4, H1); g.clip();
    // 讀碼框的底色
    if (o) {
      for (let k = 0; k < o.codons.length; k++) {
        const s = o.start + 3 * k;
        if (s + 3 < i0 || s > i1) continue;
        if (anim.phase === 'tx' && s + 3 > anim.pos) continue;
        const isStop = G.codonAA(o.codons[k]) === '*', isStart = k === 0;
        const col = isStart ? C['ge-good'] : isStop ? C['ge-bad'] : D.c.text;
        D.roundRect(g, X(s) + 1, L.y2 - 5, 3 * tw - 2, tw + 10, 6);
        g.fillStyle = D.alpha(col, isStart || isStop ? 0.16 : (k % 2 ? 0.05 : 0.1)); g.fill();
      }
    }
    // 核糖體（畫在 mRNA 底下：大次單元在上、小次單元在下，框住正在讀的密碼子與前後各一個）
    if (anim.phase === 'tl' && o) {
      const k = Math.min(o.codons.length - 1, Math.floor(anim.codon));
      const x = X(o.start + 3 * k) + 1.5 * tw;
      const rc = D.dark ? '#b08968' : '#a47148';
      D.roundRect(g, x - 4.8 * tw, L.y2 - 15, 9.6 * tw, tw / 2 + 15, 14);
      g.fillStyle = D.alpha(rc, D.dark ? 0.34 : 0.26); g.fill();
      g.strokeStyle = D.alpha(rc, 0.9); g.lineWidth = 1.6; g.stroke();
      D.roundRect(g, x - 4 * tw, L.y2 + tw / 2, 8 * tw, tw / 2 + 9, 10);
      g.fillStyle = D.alpha(rc, D.dark ? 0.26 : 0.18); g.fill();
      g.strokeStyle = D.alpha(rc, 0.7); g.lineWidth = 1.2; g.stroke();
      // 正在讀的密碼子（A 位）
      D.roundRect(g, X(o.start + 3 * k) - 1, L.y2 - 3, 3 * tw + 2, tw + 6, 6);
      g.strokeStyle = C['ge-sel']; g.lineWidth = 2; g.stroke();
    }
    const txShown = anim.phase === 'tx' ? anim.pos : Infinity;
    for (let i = i0; i < i1; i++) {
      const x = X(i), b = st.seq[i];
      const isSel = i === st.sel;
      const changed = st.src[i] < 0 || b !== st.ref[st.src[i]];
      // 氫鍵
      const nb = b === 'G' || b === 'C' ? 3 : 2;
      g.strokeStyle = D.alpha(D.c.muted, 0.6); g.lineWidth = 1.2;
      for (let k = 0; k < nb; k++) {
        const xx = x + tw / 2 + (k - (nb - 1) / 2) * 4;
        g.beginPath(); g.setLineDash([2, 2]); g.moveTo(xx, L.y0 + tw + 1); g.lineTo(xx, L.y1 - 1); g.stroke();
      }
      g.setLineDash([]);
      tile(g, x, L.y0, tw, b, { ring: isSel ? C['ge-sel'] : changed ? D.alpha(C['ge-sel'], 0.6) : null });
      tile(g, x, L.y1, tw, G.complement(b), { ring: isSel ? C['ge-sel'] : null, alpha: 0.92 });
      if (i < txShown) tile(g, x, L.y2, tw, b === 'T' ? 'U' : b, {});
      if (changed && !isSel) { g.fillStyle = C['ge-sel']; g.beginPath(); g.arc(x + tw / 2, L.y0 - 5, 2.4, 0, Math.PI * 2); g.fill(); }
    }
    // 骨架線（兩股）
    [[L.y0 - 2], [L.y1 + tw + 2]].forEach(function (q) {
      g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 2;
      g.beginPath(); g.moveTo(Math.max(xL, X(0)), q[0]); g.lineTo(Math.min(xR, X(n)), q[0]); g.stroke();
    });
    // 胺基酸
    if (o) {
      const shown = anim.phase === 'tx' ? 0 : anim.phase === 'tl' ? Math.floor(anim.codon) : o.codons.length;
      for (let k = 0; k < Math.min(shown, o.codons.length); k++) {
        const s = o.start + 3 * k;
        if (s + 3 < i0 || s > i1) continue;
        const a = G.codonAA(o.codons[k]);
        bead(g, X(s) + 1.5 * tw, L.y3 + tw / 2 + 2, tw * 0.95, a, {});
        if (k > 0 && a !== '*') { g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 2; g.beginPath(); g.moveTo(X(s) - 1.5 * tw + tw * 0.5 + 1.5 * tw, L.y3 + tw / 2 + 2); g.lineTo(X(s) + 1.5 * tw - tw * 0.48, L.y3 + tw / 2 + 2); g.stroke(); }
      }
    }
    // 端點標示
    if (X(n) < xR - 4) {
      small(g, "3'", X(n) + 4, L.y0 + tw / 2); small(g, "5'", X(n) + 4, L.y1 + tw / 2);
      if (anim.phase !== 'tx') small(g, "3'", X(n) + 4, L.y2 + tw / 2);
    }
    // RNA 聚合酶
    if (anim.phase === 'tx') {
      const x = X(anim.pos);
      D.roundRect(g, x - 4 * tw, L.y0 - 10, 6 * tw, L.y2 + tw + 6 - (L.y0 - 10), 16);
      g.fillStyle = D.alpha(C['ge-u'], 0.16); g.fill();
      g.strokeStyle = D.alpha(C['ge-u'], 0.75); g.lineWidth = 1.6; g.stroke();
      D.haloText(g, T('RNA 聚合酶', 'RNA polymerase'), x - tw, L.y2 + tw + 16, C['ge-u'], 'center', 'middle', '600 11.5px ' + FONT);
    }
    // 核糖體的標籤
    if (anim.phase === 'tl' && o) {
      const k = Math.min(o.codons.length - 1, Math.floor(anim.codon));
      const x = X(o.start + 3 * k) + 1.5 * tw;
      const anti = G.complement(o.codons[k]).replace(/T/g, 'U');
      D.haloText(g, T('核糖體', 'Ribosome') + (G.codonAA(o.codons[k]) === '*' ? T('・終止', ' · stop') : T('・tRNA 反密碼子 ', ' · tRNA anticodon ') + anti),
        x, L.y2 - 22, D.c.text, 'center', 'middle', '600 11px ' + FONT);
    }
    g.restore();
    // 視窗兩側的漸隱提示
    if (st.win > 0.5) small(g, '◀', xL + 2, L.y0 - 10, D.c.accent);
    if (st.win + L.nWin < n - 0.5) small(g, '▶', xR - 2, L.y0 - 10, D.c.accent, 'right');
  }
  function drawChain(g, label, p, cmp, y, upto, stopped, hasOrf) {
    title(g, label, L.pX0 + 4, y + 8);
    const bd = L.bd, step = bd + L.gap, x0 = L.pX0 + 6 + bd / 2;
    const n = Math.min(p.length, upto);
    const items = [];
    for (let k = 0; k < n; k++) items.push(p[k]);
    if (stopped && upto >= p.length) items.push('*');
    if (!hasOrf) { small(g, T('（沒有 ATG，沒有蛋白質）', '(no ATG, no protein)'), L.pX0 + 6, y + 30); return; }
    items.forEach(function (a, k) {
      const r = Math.floor(k / L.perRow), c = k % L.perRow;
      const x = x0 + c * step, yy = y + 20 + r * (bd + 6) + bd / 2;
      const diff = cmp != null && a !== '*' && (k >= cmp.length || cmp[k] !== a);
      if (c > 0) { g.strokeStyle = D.alpha(D.c.text, 0.28); g.lineWidth = 2; g.beginPath(); g.moveTo(x - step + bd / 2, yy); g.lineTo(x - bd / 2, yy); g.stroke(); }
      bead(g, x, yy, bd, a, { ring: diff ? C['ge-bad'] : null });
    });
    if (!stopped && upto >= p.length && n > 0) {
      const k = items.length, r = Math.floor(k / L.perRow), c = k % L.perRow;
      small(g, '…', x0 + c * step - bd / 2, y + 20 + r * (bd + 6) + bd / 2, D.c.muted);
    }
  }
  function drawProteins() {
    const g = ctx, f = st.info;
    let y = L.pTop;
    const h = H1 - y - 8;
    panel(g, L.pX0, y - 8, L.pW, h);
    const o0 = f.orf0;
    drawChain(g, T('原本的蛋白質（' + f.pRef.length + ' 個胺基酸）', 'Original protein (' + f.pRef.length + ' amino acids)'), f.pRef, null, y, Infinity, !!(o0 && o0.stopped), !!o0);
    y += chainH(f.pRef.length, true) + 8;
    const upto = anim.phase === 'tx' ? 0 : anim.phase === 'tl' ? Math.floor(anim.codon) : Infinity;
    drawChain(g, T('現在的蛋白質（' + f.pMut.length + ' 個）', 'Current protein (' + f.pMut.length + ')') + (anim.phase === 'tl' ? T('・轉譯中…', ' · translating…') : ''), f.pMut, f.pRef, y, upto, f.stopped, !!f.orf);
    y += chainH(f.pMut.length, true) + 10;
    const k = f.kind;
    const col = k === 'none' ? D.c.muted : (k === 'silent' || k === 'noncoding') ? C['ge-good'] : C['ge-bad'];
    verdictLines().forEach(function (s, i) { D.haloText(g, s, L.pX0 + 8, y + 8 + i * 18, col, 'left', 'middle', '600 13px ' + FONT); });
  }
  function draw1() {
    if (!L) return;
    const g = ctx;
    g.clearRect(0, 0, W1, H1);
    D.backdrop && D.backdrop(g, W1, H1);
    drawMap();
    drawStrands();
    drawProteins();
  }

  // ---------- 指標 ----------
  let drag = null;
  cv.addEventListener('pointerdown', function (ev) {
    if (!L) return;
    const p = evPos(cv, ev);
    if (p[1] < L.mapY + 20 && p[0] >= L.lw - 4) {
      const n = st.seq.length, sx = (W1 - 8 - L.lw) / n;
      centerOn(Math.round((p[0] - L.lw) / sx), true); request(); rebuild3();
      drag = { map: true, id: ev.pointerId };
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      return;
    }
    drag = { x: p[0], y: p[1], win: st.win, moved: false, id: ev.pointerId };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    const p = evPos(cv, ev);
    if (drag.map) {
      const n = st.seq.length, sx = (W1 - 8 - L.lw) / n;
      centerOn(Math.round((p[0] - L.lw) / sx), true); request();
      return;
    }
    const dx = p[0] - drag.x;
    if (!drag.moved && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(p[1] - drag.y)) drag.moved = true;
    if (drag.moved) { st.winGoal = null; st.win = drag.win - dx / L.tw; clampWin(); request(); }
  });
  function endDrag(ev) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.map) { rebuild3(); return; }
    if (d.moved) { st.win = Math.round(st.win); clampWin(); request(); rebuild3(); return; }
    if (ev.type === 'pointercancel') return;
    const p = evPos(cv, ev);
    if (p[0] < L.lw || p[1] < L.y0 - 6 || p[1] > L.y3 + L.tw + 6) return;
    const i = Math.floor(st.win + (p[0] - L.lw) / L.tw);
    if (i >= 0 && i < st.seq.length) {
      select(i);
      const S0 = sound(); if (S0) S0.tone({ freq: 880, dur: 0.04, gain: 0.025 });
      say(T('第 ' + (i + 1) + ' 個鹼基 ' + st.seq[i], 'Base ' + (i + 1) + ': ' + st.seq[i]));
    }
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  window.LabKeys && window.LabKeys.attach(cv, {
    label: T('DNA 畫布：左右鍵移動選取（Shift 一次一個密碼子），按 A、T、C、G 換鹼基，Shift 加字母插入，Delete 刪除，Enter 轉錄＋轉譯。', 'DNA canvas: left and right move the selection (Shift for a whole codon); press A, T, C or G to change the base, Shift with a letter to insert, Delete to remove, Enter to transcribe and translate.'),
    items: [{
      name: T('鹼基', 'Base'),
      move: function (dx, dy, big) { const d = dx || dy; if (d) select(st.sel + d * (big ? 3 : 1)); return !!d; },
      describe: function () { return T('第 ' + (st.sel + 1) + ' 個鹼基 ' + st.seq[st.sel] + '。', 'Base ' + (st.sel + 1) + ': ' + st.seq[st.sel] + '.'); }
    }]
  });
  cv.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = (ev.key || '').toUpperCase();
    if (/^[ATCGU]$/.test(k)) {
      ev.preventDefault();
      const b = k === 'U' ? 'T' : k;
      if (ev.shiftKey) doIns(b); else doSub(b);
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); doDel(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); startRun(); }
  });

  // =====================================================================
  // 二・Meselson–Stahl
  // =====================================================================
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let W2 = 300, H2 = 440;
  const st2 = { denat: false, view: 'semi', obs: [], elim: { semi: false, cons: false, disp: false }, spins: 0 };
  const elGen = $('gen');
  function genV() { return Math.round(val(elGen)); }
  function refresh2() { $('geno').textContent = genV() + T(' 代', ''); }
  function bandName(b) {
    const m = { H: ['重', 'heavy'], M: ['中', 'hybrid'], L: ['輕', 'light'], h: ['重單股', 'heavy single'], l: ['輕單股', 'light single'], D: ['一條', 'one'], d: ['一條', 'one'] };
    const q = m[b.label] || ['', ''];
    return T(q[0], q[1]);
  }
  function bandsText(bs) {
    return bs.slice().sort(function (a, b) { return a.rho - b.rho; }).map(function (b) {
      return bandName(b) + ' ' + num(b.frac * 100, b.frac * 100 % 1 ? 1 : 0) + '%' + T('（', ' (') + num(b.rho, 3) + T('）', ')');
    }).join(T('、', ', '));
  }
  function spin() {
    const n = genV(), denat = st2.denat;
    st2.obs.push({ n: n, denat: denat, at: performance.now(), bands: G.bands('semi', n, denat) });
    if (st2.obs.length > MAX_TUBES) st2.obs.shift();
    st2.spins++;
    sndSpin();
    emit('ms-spin', { n: n, denat: denat });
    setStatus('status2', T('第 ' + n + ' 代', 'Generation ' + n) + (denat ? T('（加熱分成單股）', ' (heated into single strands)') : '') + T('：看到 ', ': ') +
      st2.obs[st2.obs.length - 1].bands.length + T(' 條帶——', ' band(s) — ') + bandsText(st2.obs[st2.obs.length - 1].bands) + T('。', '.'));
    renderRows2(); renderRo2(); request();
  }
  function eliminate(model) {
    if (st2.elim[model]) return;
    const obs = st2.obs.map(function (o) { return { n: o.n, denat: o.denat }; });
    const ok = G.canEliminate(model, obs);
    if (ok) {
      st2.elim[model] = true;
      const bad = obs.filter(function (o) { return !G.sameBands(G.bands(model, o.n, o.denat), G.bands('semi', o.n, o.denat)); })[0];
      setStatus('status2', T('排除了' + hypName(model) + '假說：第 ' + bad.n + ' 代' + (bad.denat ? '（單股）' : '') + '的試管和它的預測不合。',
        'The ' + hypName(model).toLowerCase() + ' hypothesis is ruled out: the generation-' + bad.n + (bad.denat ? ' (single-strand)' : '') + ' tube disagrees with its prediction.'));
    } else {
      setStatus('status2', st2.obs.length
        ? T('目前離心過的試管都和' + hypName(model) + '假說的預測相符，還不能排除它。', 'Every tube spun so far agrees with the ' + hypName(model).toLowerCase() + ' hypothesis, so it cannot be ruled out yet.')
        : T('還沒有離心過任何試管，沒有證據可以排除假說。', 'No tube has been spun yet, so there is no evidence to rule anything out.'));
    }
    sndJudge(ok);
    emit('ms-elim', { model: model, valid: ok, obs: obs, elim: { semi: st2.elim.semi, cons: st2.elim.cons, disp: st2.elim.disp } });
    renderHyps(); renderRo2(); request();
  }
  function renderHyps() {
    $('hyps').innerHTML = ['semi', 'cons', 'disp'].map(function (k) {
      const out = st2.elim[k];
      return '<button type="button" class="pick' + (out ? ' out' : '') + '" data-v="' + k + '" aria-pressed="' + (st2.view === k) + '">' + hypName(k) + (out ? T('（已排除）', ' (ruled out)') : '') + '</button>' +
        '<button type="button" class="elim" data-x="' + k + '"' + (out ? ' disabled' : '') + '>' + T('排除', 'Rule out') + '</button>';
    }).join('');
  }
  function renderRo2() {
    const n = genV(), d = st2.denat;
    const pred = G.bands(st2.view, n, d);
    const left = ['semi', 'cons', 'disp'].filter(function (k) { return !st2.elim[k]; }).map(hypName).join(T('、', ', '));
    dl('ro2', [
      [T('取樣', 'Sample'), T('第 ' + n + ' 代', 'Generation ' + n) + (d ? T('・單股', ' · single strands') : T('・雙股', ' · double strands'))],
      [hypName(st2.view) + T('的預測', ' predicts'), bandsText(pred)],
      [T('分子數', 'Molecules'), Math.pow(2, n) + T('（每個細菌一個 DNA，示意）', ' (one DNA per bacterium, schematic)')],
      [T('試管', 'Tubes'), st2.obs.length + ' / ' + MAX_TUBES],
      [T('還留著的假說', 'Still standing'), left || '—']
    ]);
  }
  function renderRows2() {
    const tb = $('runs2');
    if (!st2.obs.length) { tb.innerHTML = ''; return; }
    tb.innerHTML = '<thead><tr><th>#</th><th>' + T('代數', 'Generation') + '</th><th>' + T('樣品', 'Sample') + '</th><th>' + T('看到的條帶', 'Bands seen') + '</th></tr></thead><tbody>' +
      st2.obs.map(function (o, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + o.n + '</td><td>' + (o.denat ? T('單股', 'Single strands') : T('雙股', 'Double strands')) + '</td><td>' + bandsText(o.bands) + '</td></tr>';
      }).join('') + '</tbody>';
  }
  let L2 = null;
  function layout2() {
    const narrow = W2 < 640;
    if (narrow) L2 = { narrow: true, m: { x: 8, y: 8, w: W2 - 16, h: 210 }, t: { x: 8, y: 228, w: W2 - 16, h: H2 - 236 } };
    else { const mw = Math.round(W2 * 0.42); L2 = { narrow: false, m: { x: 8, y: 8, w: mw - 12, h: H2 - 16 }, t: { x: mw + 4, y: 8, w: W2 - mw - 12, h: H2 - 16 } }; }
  }
  function resize2() { W2 = cv2.clientWidth || 300; H2 = W2 < 640 ? 560 : 440; fit(cv2, ctx2, H2); layout2(); request(); }
  /** 依假說畫出第 n 代的分子 */
  function strandsOf(model, n) {
    const N = Math.pow(2, n), mols = [];
    const h = Math.pow(2, -n);
    for (let i = 0; i < N; i++) {
      if (n === 0) { mols.push([1, 1]); continue; }
      if (model === 'semi') mols.push(i < 2 ? [1, 0] : [0, 0]);
      else if (model === 'cons') mols.push(i === 0 ? [1, 1] : [0, 0]);
      else mols.push([h, h]);
    }
    return mols;
  }
  function drawStrand(g, x, y, w, th, f, seed) {
    // f = 重的比例（全保留、半保留是 0 或 1；分散是 1/2^n，切成 8 段畫）
    const seg = 8, sw = w / seg;
    const nh = f >= 1 ? seg : f <= 0 ? 0 : Math.max(1, Math.round(f * seg));
    for (let k = 0; k < seg; k++) {
      let heavy;
      if (nh === seg) heavy = true; else if (nh === 0) heavy = false;
      else heavy = ((k * 3 + seed * 5) % seg) < nh;
      if (f > 0 && f < 1 && f * seg < 1) heavy = k === (seed * 3) % seg && seed % 2 === 0;
      g.fillStyle = heavy ? C['ge-heavy'] : C['ge-light'];
      g.fillRect(x + k * sw, y, sw + 0.4, th);
    }
    g.strokeStyle = D.alpha(D.c.text, 0.25); g.lineWidth = 0.8; g.strokeRect(x, y, w, th);
  }
  function drawMolecules() {
    const g = ctx2, R = L2.m, n = genV(), model = st2.view, denat = st2.denat;
    panel(g, R.x, R.y, R.w, R.h);
    title(g, hypName(model) + T('假說：第 ' + n + ' 代', ' hypothesis: generation ' + n), R.x + 12, R.y + 16);
    small(g, Math.pow(2, n) + T(' 個 DNA 分子' + (denat ? '・加熱分成單股' : ''), ' DNA molecules' + (denat ? ' · heated apart' : '')), R.x + 12, R.y + 34);
    const mols = strandsOf(model, n), N = mols.length;
    const cols = N <= 1 ? 1 : N <= 2 ? 2 : N <= 4 ? 2 : 4, rows = Math.ceil(N / cols);
    const top = R.y + 50, bot = R.y + R.h - 34;
    const cw = (R.w - 24) / cols, ch = (bot - top) / Math.max(rows, 2);
    const mw = Math.min(cw - 18, 150), th = Math.max(4, Math.min(8, ch * 0.16));
    const gapS = denat ? Math.min(ch * 0.42, th * 3.2) : th * 0.9;
    mols.forEach(function (m, i) {
      const r = Math.floor(i / cols), c = i % cols;
      const cx = R.x + 12 + cw * (c + 0.5), cy = top + ch * (r + 0.5);
      const x = cx - mw / 2;
      const yA = cy - gapS / 2 - th, yB = cy + gapS / 2;
      if (!denat) {
        g.strokeStyle = D.alpha(D.c.muted, 0.55); g.lineWidth = 1;
        for (let k = 1; k < 10; k++) { const xx = x + k * mw / 10; g.beginPath(); g.moveTo(xx, yA + th); g.lineTo(xx, yB); g.stroke(); }
      }
      drawStrand(g, x, yA, mw, th, m[0], i * 2);
      drawStrand(g, x, yB, mw, th, m[1], i * 2 + 1);
    });
    // 圖例（同位素的質量數用上標）
    const ly = R.y + R.h - 16;
    g.fillStyle = C['ge-heavy']; g.fillRect(R.x + 12, ly - 5, 16, 8);
    iso(g, T('舊股（', 'Old strand ('), '15', T('N）', 'N)'), R.x + 32, ly);
    const lx = R.x + 12 + Math.min(R.w * 0.5, 150);
    g.fillStyle = C['ge-light']; g.fillRect(lx, ly - 5, 16, 8);
    iso(g, T('新股（', 'New strand ('), '14', T('N）', 'N)'), lx + 20, ly);
  }
  /** 「前文 + 上標質量數 + 後文」，基線置中對齊 y */
  function iso(g, pre, mass, post, x, y) {
    const font = '11px ' + FONT, sf = '8px ' + FONT;
    g.font = font; const w1 = g.measureText(pre).width;
    g.font = sf; const w2 = g.measureText(mass).width;
    D.haloText(g, pre, x, y, D.c.muted, 'left', 'middle', font);
    D.haloText(g, mass, x + w1 + 0.5, y - 4, D.c.muted, 'left', 'middle', sf);
    D.haloText(g, post, x + w1 + w2 + 1, y, D.c.muted, 'left', 'middle', font);
  }
  const RHO0 = 1.700, RHO1 = 1.745;
  function drawTubes(now) {
    const g = ctx2, R = L2.t;
    panel(g, R.x, R.y, R.w, R.h);
    title(g, T('氯化銫密度梯度離心', 'Caesium chloride density gradient'), R.x + 12, R.y + 16);
    const sub = wrapLines(g, T('上輕下重；暗帶是 DNA（紫外光吸收）', 'Light at the top, dense at the bottom; dark bands are DNA (UV absorption)'), R.w - 24, '11px ' + FONT);
    const nSub = Math.min(2, sub.length);
    sub.slice(0, 2).forEach(function (ln, i) { small(g, ln, R.x + 12, R.y + 33 + i * 14); });
    const top = R.y + 70 + 14 * nSub, bot = R.y + R.h - 44;
    const Y = function (rho) { return top + (rho - RHO0) / (RHO1 - RHO0) * (bot - top); };
    const anyDen = st2.obs.some(function (o) { return o.denat; }) || st2.denat;
    // 輕的單股（1.725）和重的雙股（1.724）幾乎在同一個位置，合用一條線
    const guides = [[G.RHO.L, T('輕 1.710', 'Light 1.710')], [G.RHO.M, T('中 1.717', 'Hybrid 1.717')], [G.RHO.H, anyDen ? T('重／輕單股', 'Heavy / light ss') : T('重 1.724', 'Heavy 1.724')]];
    if (anyDen) guides.push([G.RHO.H + G.SS, T('重單股 1.739', 'Heavy ss 1.739')]);
    g.font = '11px ' + FONT;
    const axW = Math.min(R.w * 0.42, 20 + Math.max.apply(null, guides.map(function (q) { return g.measureText(q[1]).width; })));
    const x0 = R.x + axW, x1 = R.x + R.w - 10;
    guides.forEach(function (q, k) {
      const y = Y(q[0]);
      g.strokeStyle = D.alpha(D.c.text, 0.14); g.setLineDash([4, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0 - 4, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
      small(g, q[1], x0 - 8, y, D.c.muted, 'right');
    });
    iso(g, 'g/cm', '3', '', R.x + 10, bot + 16);
    const slots = MAX_TUBES;
    const sw = (x1 - x0) / slots, tw = Math.min(40, sw - 14);
    const list = st2.obs.slice();
    for (let s = 0; s < slots; s++) {
      const o = list[s];
      const cx = x0 + sw * (s + 0.5), tx = cx - tw / 2;
      // 試管
      g.beginPath();
      g.moveTo(tx, top - 14); g.lineTo(tx, bot - tw / 2); g.arc(cx, bot - tw / 2, tw / 2, Math.PI, 0, true); g.lineTo(tx + tw, top - 14);
      if (!o) {
        g.setLineDash([3, 4]); g.strokeStyle = D.alpha(D.c.muted, 0.45); g.lineWidth = 1.2; g.stroke(); g.setLineDash([]);
        if (s === list.length) small(g, T('下一支', 'Next'), cx, bot + 14, D.c.muted, 'center');
        continue;
      }
      const gr = g.createLinearGradient(0, top, 0, bot);
      gr.addColorStop(0, D.alpha(C['ge-tube'], 0.85)); gr.addColorStop(1, D.mix ? D.mix(C['ge-tube'], D.c.text, 0.12) : C['ge-tube']);
      g.fillStyle = gr; g.fill();
      g.strokeStyle = D.alpha(D.c.text, 0.45); g.lineWidth = 1.3; g.stroke();
      // 條帶（離心動畫：從散開慢慢聚攏）
      const age = (now - o.at) / 1000, k = reducedMotion ? 1 : Math.min(1, age / 1.4);
      const ease = 1 - Math.pow(1 - k, 3);
      g.save(); g.clip();
      o.bands.forEach(function (b) {
        const yc = Y(b.rho) * ease + ((top + bot) / 2) * (1 - ease);
        const sig = 3 + (1 - ease) * 40;
        const a = (0.3 + 0.7 * Math.sqrt(b.frac)) * (0.35 + 0.65 * ease);
        const bg = g.createLinearGradient(0, yc - 3 * sig, 0, yc + 3 * sig);
        const dark = D.dark ? '#dbe4ff' : '#1b2330';
        bg.addColorStop(0, D.alpha(dark, 0)); bg.addColorStop(0.5, D.alpha(dark, a)); bg.addColorStop(1, D.alpha(dark, 0));
        g.fillStyle = bg; g.fillRect(tx, yc - 3 * sig, tw, 6 * sig);
      });
      g.restore();
      // 選取假說的預測（小三角形）與相符與否
      const pred = G.bands(st2.view, o.n, o.denat);
      pred.forEach(function (b) {
        const y = Y(b.rho), s2 = 3.5 + 3.5 * Math.sqrt(b.frac);
        g.fillStyle = D.c.accent;
        g.beginPath(); g.moveTo(tx + tw + 2, y); g.lineTo(tx + tw + 2 + s2 * 1.4, y - s2); g.lineTo(tx + tw + 2 + s2 * 1.4, y + s2); g.closePath(); g.fill();
      });
      if (k >= 1) {
        const same = G.sameBands(pred, o.bands);
        D.haloText(g, same ? '✓' : '✗', cx, top - 26, same ? C['ge-good'] : C['ge-bad'], 'center', 'middle', '700 15px ' + FONT);
      }
      small(g, T('第 ' + o.n + ' 代', 'Gen ' + o.n), cx, bot + 12, D.c.text, 'center');
      if (o.denat) small(g, T('單股', 'single'), cx, bot + 26, D.c.muted, 'center');
    }
    return list.some(function (o) { return now - o.at < 1500; });
  }
  function draw2(now) {
    if (!L2) return false;
    const g = ctx2;
    g.clearRect(0, 0, W2, H2);
    D.backdrop && D.backdrop(g, W2, H2);
    drawMolecules();
    return drawTubes(now);
  }
  window.LabKeys && window.LabKeys.attach(cv2, {
    label: T('離心畫布：左右鍵改代數，Enter 離心一次。', 'Centrifuge canvas: left and right change the generation, Enter spins.'),
    items: [{
      name: T('代數', 'Generation'),
      move: function (dx, dy) { const d = dx || -dy; if (d && window.LabNum) window.LabNum.set(elGen, genV() + d); return !!d; },
      describe: function () { return T('第 ' + genV() + ' 代。', 'Generation ' + genV() + '.'); }
    }]
  });
  cv2.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); spin(); } });

  // =====================================================================
  // 動畫迴圈
  // =====================================================================
  let raf = 0, lastNow = 0;
  function request() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    let more = false;
    if (stepAnim(dt)) more = true;
    if (st.winGoal != null) {
      st.win += (st.winGoal - st.win) * Math.min(1, dt * 10);
      if (Math.abs(st.win - st.winGoal) < 0.02) { st.win = st.winGoal; st.winGoal = null; }
      more = true;
    }
    draw1();
    if (view3 && view3.active) { view3.frame(); if (view3.busy && view3.busy()) more = true; }
    if (draw2(now)) more = true;
    if (more) request(); else lastNow = 0;
  }

  // =====================================================================
  // 3D：雙股螺旋，切換時才載入
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage1'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    G: G, T: T, D: D,
    colors: function () { return C; },
    seq: function () { return st.seq; },
    sel: function () { return st.sel; },
    orf: function () { return st.info.orf; },
    request: function () { request(); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 序列。', 'The 3D graphics context was lost, so the view switched back to the 2D strands.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.GE3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.GE3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/gene-expression-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.GE3D) throw new Error('gene-expression-3d.js did not load');
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
        view3 = window.GE3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) { view3.onShow(); request(); } });
        request();
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
      $('resetCam').hidden = true;
      resize1();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 序列。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D strands are kept.');
    resize1();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  function rebuild3() { if (view3 && view3.active) view3.rebuild(); }

  // =====================================================================
  // 事件綁定
  // =====================================================================
  $('genes').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-g]');
    if (b) loadPreset(b.getAttribute('data-g'));
  });
  $('applySeq').addEventListener('click', applySeq);
  $('seqIn').addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); applySeq(); } });
  $('undoBtn').addEventListener('click', undo);
  $('resetSeq').addEventListener('click', resetSeq);
  $('subBtns').addEventListener('click', function (ev) { const b = ev.target.closest('button[data-b]'); if (b) doSub(b.getAttribute('data-b')); });
  $('insBtns').addEventListener('click', function (ev) { const b = ev.target.closest('button[data-b]'); if (b) doIns(b.getAttribute('data-b')); });
  $('delBtn').addEventListener('click', doDel);
  $('prevB').addEventListener('click', function () { select(st.sel - 1); });
  $('nextB').addEventListener('click', function () { select(st.sel + 1); });
  $('newTarget').addEventListener('click', function () {
    st.tSeed = st.tSeed % 9973 + 1; renderTarget();
    setStatus('status', T('新的目標胜肽。', 'A new target peptide.'));
  });
  $('codeTable').addEventListener('click', toggleCodeTable);
  $('hintBtn').addEventListener('click', function () {
    const t = G.target(st.tSeed, 5);
    setStatus('status', T('提示：', 'Hint: ') + t.split('').map(function (a) {
      return aa3(a) + ' = ' + G.synonymous(a).map(function (c) { return c.replace(/U/g, 'T'); }).join('/');
    }).join(T('；', '; ')) + T('；終止 = TAA/TAG/TGA（編碼股寫法）。', '; stop = TAA/TAG/TGA (as written on the coding strand).'));
  });
  $('runBtn').addEventListener('click', startRun);
  $('skipBtn').addEventListener('click', function () { finishRun(); });
  $('clear1').addEventListener('click', function () {
    stopAnim(); st.runs = []; renderRows1(); request();
    setStatus('status', T('已清除動畫與紀錄表；DNA 序列沒有改變。', 'Animation and table cleared; the DNA sequence is unchanged.'));
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  elGen.addEventListener('input', function () { refresh2(); renderRo2(); request(); });
  $('denatBtn').addEventListener('click', function () {
    st2.denat = !st2.denat;
    $('denatBtn').setAttribute('aria-pressed', String(st2.denat));
    renderRo2(); request();
  });
  $('hyps').addEventListener('click', function (ev) {
    const p = ev.target.closest('button[data-v]'), x = ev.target.closest('button[data-x]');
    if (p) { st2.view = p.getAttribute('data-v'); renderHyps(); renderRo2(); request(); }
    if (x) eliminate(x.getAttribute('data-x'));
  });
  $('spinBtn').addEventListener('click', spin);
  $('clear2').addEventListener('click', function () {
    st2.obs = []; st2.elim = { semi: false, cons: false, disp: false };
    renderHyps(); renderRows2(); renderRo2(); request();
    setStatus('status2', T('已清掉所有試管，三種假說都回來了。', 'All tubes cleared; all three hypotheses are back.'));
  });

  // ---------- 分享目前設定 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { p: st.preset, r: st.preset === 'custom' ? st.ref : '', q: st.seq === st.ref ? '' : st.seq, t: st.tSeed }; },
    set: function (o) {
      if (!o) return;
      if (o.t) { st.tSeed = Math.max(1, Math.round(+o.t) || 1); renderTarget(); }
      let ref = null;
      if (o.p === 'custom' && typeof o.r === 'string') { const r = G.clean(o.r).slice(0, MAX_LEN); if (r.length >= 3) ref = r; }
      else if (PRESETS[o.p] && o.p !== 'custom') ref = PRESETS[o.p].seq;
      if (!ref) return;
      st.preset = o.p; st.ref = ref; st.seq = ref; st.src = identity(ref.length); st.hist = [];
      const q = typeof o.q === 'string' ? G.clean(o.q).slice(0, MAX_LEN) : '';
      if (q.length >= 3) {
        if (q.length === ref.length) st.seq = q;
        else { st.preset = 'custom'; st.ref = q; st.seq = q; st.src = identity(q.length); }
      }
      if (st.preset === 'custom') $('seqIn').value = st.ref;
      st.sel = Math.min(st.sel, st.seq.length - 1);
      stopAnim(); compute(); renderAll(); centerOn(st.sel, true);
    }
  });

  // ---------- 圖例 ----------
  function legends() {
    const sq = function (c) { return '<i class="sq" style="background:' + c + '"></i>'; };
    $('legend1').innerHTML =
      ['A', 'T', 'C', 'G', 'U'].map(function (b) { return '<span>' + sq(baseColor(b)) + b + '</span>'; }).join('') +
      '<span><i class="dot" style="background:' + C['ge-np'] + '"></i>' + T('疏水', 'Hydrophobic') + '</span>' +
      '<span><i class="dot" style="background:' + C['ge-p'] + '"></i>' + T('極性', 'Polar') + '</span>' +
      '<span><i class="dot" style="background:' + C['ge-pos'] + '"></i>' + T('帶正電', 'Positive') + '</span>' +
      '<span><i class="dot" style="background:' + C['ge-neg'] + '"></i>' + T('帶負電', 'Negative') + '</span>' +
      '<span><i class="dot" style="background:transparent;border:2px solid ' + C['ge-bad'] + '"></i>' + T('和原本不同', 'Differs from the original') + '</span>';
    $('legend2').innerHTML =
      '<span>' + sq(C['ge-heavy']) + T('含重氮的舊股', 'Old strand with heavy nitrogen') + '</span>' +
      '<span>' + sq(C['ge-light']) + T('新股', 'New strand') + '</span>' +
      '<span><i class="dot" style="background:' + D.c.accent + '"></i>' + T('▶ 選取假說的預測', '▶ Prediction of the chosen hypothesis') + '</span>';
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  layout1();
  compute();
  centerOn(st.sel, true);
  renderGenes(); renderSel(); renderRo1(); renderTarget(); renderRows1();
  refresh2(); renderHyps(); renderRo2(); renderRows2();
  updateSoundButton();
  legends();
  function themeChanged() {
    readColors();
    if (view3 && view3.active) view3.onTheme();
    legends(); renderCodeTable();
    request();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', function () {
    renderGenes(); renderSel(); renderRo1(); renderTarget(); renderRows1(); renderCodeTable();
    refresh2(); renderHyps(); renderRo2(); renderRows2(); legends(); updateRunBtn(); resize1(); request();
  });
  setStatus('status', T('β 血紅素基因的開頭已經選好第 7 個密碼子 GAG 中間的 A。按「轉錄＋轉譯」看蛋白質怎麼做出來，或直接把它換掉。', 'The β-globin gene is loaded with the A in the middle of codon 7 (GAG) selected. Press “Transcribe and translate” to watch the protein being made, or change the base right away.'));
  setStatus('status2', T('選一個代數，按「離心一次」，看 DNA 停在哪裡；再和三種假說的預測比較。', 'Choose a generation and press “Spin the sample” to see where the DNA settles, then compare with the three hypotheses.'));
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });
  resize1(); resize2();
  centerOn(st.sel, true);
  request();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastNow = 0; request(); } });

  // 測試與縮圖用
  window.__ge = {
    G: G, st: st, st2: st2, anim: anim,
    info: function () { return st.info; },
    preset: loadPreset, select: select, sub: doSub, ins: doIns, del: doDel, undo: undo, reset: resetSeq,
    type: function (s) { $('seqIn').value = s; applySeq(); },
    run: startRun, finish: function () { finishRun(); },
    target: function () { return G.target(st.tSeed, 5); },
    spin: function (n, denat) { if (window.LabNum) window.LabNum.set(elGen, n); st2.denat = !!denat; $('denatBtn').setAttribute('aria-pressed', String(st2.denat)); spin(); },
    view: function (k) { st2.view = k; renderHyps(); renderRo2(); request(); },
    elim: eliminate, setView: setView, redraw: request
  };
})();
