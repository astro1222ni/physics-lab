/* cell-division.js — 「細胞分裂」的畫面與互動（計算全部在 cell-division-core.js；3D 在 cell-division-3d.js，切換時才載入） */
(function () {
  'use strict';
  const K = window.CellCore;
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
  const RATE = 0.9;            // 播放速度：每秒幾個時間單位（減數分裂全長約 12.7）
  const MAX_ROWS = 20, MAX_RUNS = 12;

  // =====================================================================
  // 顏色、數字
  // =====================================================================
  const C = {};
  const KEYS = ['cd-mat', 'cd-pat', 'cd-cyto', 'cd-mem', 'cd-nuc', 'cd-spin', 'cd-pole', 'cd-chrom', 'cd-dna', 'cd-xo', 'cd-bad', 'cd-ok', 'cd-k1', 'cd-k2'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    KEYS.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function pct(v, d) { return num(v * 100, d == null ? 1 : d) + '%'; }

  const STAGE_NAME = {
    G1: ['G1 期', 'G1 phase'], S: ['S 期（DNA 複製）', 'S phase (DNA replication)'], G2: ['G2 期', 'G2 phase'],
    pro: ['前期', 'Prophase'], prometa: ['前中期', 'Prometaphase'], meta: ['中期', 'Metaphase'], ana: ['後期', 'Anaphase'], telo: ['末期', 'Telophase'],
    pro1: ['前期 I', 'Prophase I'], meta1: ['中期 I', 'Metaphase I'], ana1: ['後期 I', 'Anaphase I'], telo1: ['末期 I', 'Telophase I'],
    pro2: ['前期 II', 'Prophase II'], meta2: ['中期 II', 'Metaphase II'], ana2: ['後期 II', 'Anaphase II'], telo2: ['末期 II', 'Telophase II']
  };
  // 時間軸上的縮寫（G1 等用一般字元以免字型缺字）
  const STAGE_SHORT = {
    G1: ['G1', 'G1'], S: ['S', 'S'], G2: ['G2', 'G2'], pro: ['前', 'P'], prometa: ['前中', 'PM'], meta: ['中', 'M'], ana: ['後', 'A'], telo: ['末', 'T'],
    pro1: ['前I', 'PI'], meta1: ['中I', 'MI'], ana1: ['後I', 'AI'], telo1: ['末I', 'TI'], pro2: ['前II', 'PII'], meta2: ['中II', 'MII'], ana2: ['後II', 'AII'], telo2: ['末II', 'TII']
  };
  const STAGE_TIP = {
    G1: ['細胞生長；每條染色體只有一條 DNA 分子，細絲狀散在核裡。', 'The cell grows; each chromosome is a single DNA molecule, spread out as thin threads in the nucleus.'],
    S: ['DNA 複製：每條染色體多出一條一模一樣的姊妹分體，DNA 由 2C 增加到 4C；染色體數（著絲點數）不變。', 'DNA replication: each chromosome gains an identical sister chromatid and DNA rises from 2C to 4C; the number of chromosomes (centromeres) stays the same.'],
    G2: ['準備分裂；中心體已複製成兩個。', 'Getting ready to divide; the centrosome has been copied.'],
    pro: ['染色體捲曲變粗，看得見兩條姊妹分體；兩個中心體往兩極移動，紡錘體開始形成。', 'The chromosomes coil up and the two sisters become visible; the centrosomes move apart and the spindle starts to form.'],
    prometa: ['核膜消失，紡錘絲接上每條染色體的著絲點，從兩邊拉。', 'The nuclear envelope breaks down and spindle fibres attach to every centromere, pulling from both sides.'],
    meta: ['所有染色體排在赤道板上——最容易數染色體的時刻。', 'All the chromosomes line up on the equator — the easiest moment to count them.'],
    ana: ['著絲點分開，姊妹分體被拉往兩極；這時細胞裡暫時有 4n 條染色體。', 'The centromeres split and the sisters are pulled to opposite poles; for a moment the cell holds 4n chromosomes.'],
    telo: ['兩極各形成一個細胞核，細胞質從中間縊開：兩個一模一樣的子細胞。', 'A nucleus forms at each pole and the cytoplasm pinches in two: two identical daughter cells.'],
    pro1: ['同源染色體兩兩配對（聯會），四條分體組成二價體；非姊妹分體在交叉處互換片段。', 'Homologous chromosomes pair up (synapsis) into bivalents of four chromatids; non-sister chromatids swap pieces at the chiasmata.'],
    meta1: ['二價體排在赤道兩側；每一對朝哪一極是隨機的，而且各對互不相關——獨立分配。', 'The bivalents line up across the equator; which way each pair faces is random and independent of the others — independent assortment.'],
    ana1: ['分開的是同源染色體，姊妹分體仍然連在一起。', 'The homologues separate; the sisters stay together.'],
    telo1: ['兩個細胞各有 n 條染色體，但每條仍有兩條分體（2C）。', 'Each of the two cells has n chromosomes, but each still has two chromatids (2C).'],
    pro2: ['沒有再複製 DNA，直接進入第二次分裂；紡錘體轉成和第一次垂直。', 'No more DNA is copied; the second division starts with a spindle at right angles to the first.'],
    meta2: ['每個細胞的染色體排在自己的赤道板上。', 'In each cell the chromosomes line up on its own equator.'],
    ana2: ['著絲點分開，姊妹分體被拉往兩極——和有絲分裂的後期一樣。', 'The centromeres split and the sisters move to opposite poles — just like anaphase of mitosis.'],
    telo2: ['四個配子，每個 n 條染色體、1C；因為互換和獨立分配，它們幾乎都不一樣。', 'Four gametes, each with n chromosomes and 1C; thanks to crossing over and independent assortment they are almost all different.']
  };
  function stageName(k) { const s = STAGE_NAME[k]; return T(s[0], s[1]); }

  // =====================================================================
  // 共用
  // =====================================================================
  function sound() { const S0 = window.LabSound; return S0 && S0.enabled() ? S0 : null; }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function sndClick(f) { const S0 = sound(); if (S0) S0.tone({ freq: f || 523, dur: 0.07, gain: 0.035, type: 'triangle' }); }
  /** 進入新的一期：音高隨時期上升 */
  function sndStage(i) { const S0 = sound(); if (S0) S0.tone({ freq: 392 * Math.pow(2, i / 12), dur: 0.09, gain: 0.03, type: 'sine' }); }
  /** 後期：拉開的滑音 */
  function sndPull() { const S0 = sound(); if (S0) S0.sweep({ from: 440, to: 300, dur: 0.5, gain: 0.03, type: 'triangle' }); }
  /** 交叉出現 */
  function sndXo() {
    const S0 = sound(); if (!S0) return;
    S0.tone({ freq: 1175, dur: 0.06, gain: 0.025, type: 'sine' }); setTimeout(function () { S0.tone({ freq: 1568, dur: 0.08, gain: 0.02, type: 'sine' }); }, 70);
  }
  /** 分裂完成：和弦；有不分離時改成不和諧的音 */
  function sndDone(bad) {
    const S0 = sound(); if (!S0) return;
    const f = bad ? [523, 554, 740] : [523, 659, 784];
    f.forEach(function (q, i) { setTimeout(function () { S0.tone({ freq: q, dur: 0.16, gain: 0.03, type: bad ? 'sawtooth' : 'sine' }); }, i * 90); });
  }
  function sndBatch() { const S0 = sound(); if (S0) S0.sweep({ from: 500, to: 900, dur: 0.18, gain: 0.025, type: 'triangle' }); }
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
  function small(g, s, x, y, col, align, base, size, weight) { D.haloText(g, s, x, y, col || D.c.muted, align || 'left', base || 'middle', (weight ? weight + ' ' : '') + (size || 11) + 'px ' + FONT); }
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function chipHTML(list, attr, cur, dis) {
    return list.map(function (o) {
      return '<button type="button" ' + attr + '="' + o.k + '" aria-pressed="' + (o.k === cur) + '"' + (dis ? ' disabled' : '') + '>' + T(o.zh, o.en) + '</button>';
    }).join('');
  }
  function pill(g, s, x, y, col, size, align) {
    g.font = '600 ' + (size || 12) + 'px ' + FONT;
    const w = g.measureText(s).width + 16, h = (size || 12) + 10;
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    D.roundRect(g, x0, y, w, h, h / 2);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.78 : 0.88); g.fill();
    g.strokeStyle = D.alpha(col || D.c.border, 0.7); g.lineWidth = 1; g.stroke();
    g.fillStyle = col || D.c.text; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(s, x0 + 8, y + h / 2 + 0.5);
    return w;
  }

  // =====================================================================
  // 一・看細胞分裂
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cvg = $('cvg'), gtx = cvg.getContext('2d');
  const MODES = [{ k: 'mitosis', zh: '有絲分裂', en: 'Mitosis' }, { k: 'meiosis', zh: '減數分裂', en: 'Meiosis' }];
  const XOS = [{ k: 'on', zh: '有互換', en: 'On' }, { k: 'off', zh: '不互換', en: 'Off' }];
  const NDS = [{ k: '0', zh: '正常', en: 'None' }, { k: '1', zh: '第一次', en: 'In I' }, { k: '2', zh: '第二次', en: 'In II' }];
  const el = { n: $('n') };
  const st1 = {
    mode: 'mitosis', n: 2, xo: true, nd: 0, seed: 1, rec: null, tau: 0, playing: false, last: 0,
    doneEmitted: false, lastStage: -1, rows: [], no: 0, series: null, W: 0, H: 0, G: null, lastXo: false
  };
  let seedCounter = 1;
  function nextSeed() { seedCounter = (seedCounter * 1103515245 + 12345 + Date.now()) % 2147483647 || 7; return seedCounter; }

  function build1(keepTau) {
    st1.n = Math.round(val(el.n));
    st1.rec = K.make({ mode: st1.mode, n: st1.n, xo: st1.xo, nd: st1.mode === 'meiosis' ? st1.nd : 0, ndPair: 0, seed: st1.seed });
    if (!keepTau) st1.tau = 0;
    st1.tau = Math.min(st1.tau, K.total(st1.mode));
    st1.doneEmitted = false; st1.lastStage = -1;
    // 時間序列：追蹤左（上）邊的細胞
    const N = 480, Tt = K.total(st1.mode), ch = [], dna = [], ncell = [];
    for (let i = 0; i <= N; i++) {
      const c = K.counts(st1.rec, Tt * i / N);
      ch.push(c.cells[0].chrom); dna.push(c.cells[0].dna); ncell.push(c.cells.length);
    }
    st1.series = { N: N, T: Tt, ch: ch, dna: dna, ncell: ncell };
    renderOutputs1(); renderRo1(); request1();
    if (view3 && view3.active) view3.rebuild();
  }
  function renderOutputs1() {
    const n = Math.round(val(el.n));
    $('no').textContent = n + T('（2n = ', ' (2n = ') + 2 * n + T('）', ')');
  }
  function renderChips1() {
    $('modes').innerHTML = chipHTML(MODES, 'data-m', st1.mode);
    $('xos').innerHTML = chipHTML(XOS, 'data-x', st1.xo ? 'on' : 'off', st1.mode !== 'meiosis');
    $('nds').innerHTML = chipHTML(NDS, 'data-d', String(st1.nd), st1.mode !== 'meiosis');
  }
  function stageNow() { return K.stageAt(st1.mode, st1.tau); }
  function countsNow() { return K.counts(st1.rec, st1.tau); }
  function isDone() { return st1.tau >= K.total(st1.mode) - 1e-9; }

  function gametesInfo() {
    const r = st1.rec, out = [];
    r.gametes.forEach(function (g) {
      const p0 = g.filter(function (q) { return q.p === 0; });
      out.push({
        size: g.length, geno: K.genotype(g), recomb: K.isRecombinant(K.genotype(g)),
        p0: p0.length, mixed: p0.length === 2 && p0[0].h !== p0[1].h,
        same: p0.length === 2 && p0[0].h === p0[1].h,
        p0diff: p0.length === 2 && K.genotype([p0[0]]) !== K.genotype([p0[1]])
      });
    });
    return out;
  }
  function stageData(paused) {
    const c = countsNow(), s = c.stage;
    return {
      mode: st1.mode, n: st1.n, xo: st1.mode === 'meiosis' && st1.xo, nd: st1.mode === 'meiosis' ? st1.nd : 0, stage: s.k, f: s.f, paused: !!paused,
      ncell: c.cells.length, cells: c.cells.map(function (x) { return { chrom: x.chrom, chromatids: x.chromatids, dna: Math.round(x.dna * 1000) / 1000 }; }),
      chiasmata: st1.mode === 'meiosis' ? st1.rec.xo.length : 0, replicated: c.replicated,
      sameSide: st1.mode === 'meiosis' && st1.rec.mi.every(function (x) { return x === st1.rec.mi[0]; })
    };
  }
  function doneData() {
    const gi = gametesInfo();
    const genos = gi.map(function (q) { return q.geno; });
    const uniq = {}; genos.forEach(function (x) { uniq[x] = 1; });
    return {
      mode: st1.mode, n: st1.n, xo: st1.mode === 'meiosis' && st1.xo, nd: st1.mode === 'meiosis' ? st1.nd : 0,
      ncell: gi.length, sizes: gi.map(function (q) { return q.size; }), genos: genos, distinct: Object.keys(uniq).length,
      chiasmata: st1.mode === 'meiosis' ? st1.rec.xo.length : 0,
      aneuploid: gi.filter(function (q) { return q.size !== (st1.mode === 'mitosis' ? 2 * st1.n : st1.n); }).length,
      mixedDisomic: gi.some(function (q) { return q.mixed; }), sameDisomic: gi.some(function (q) { return q.same; }),
      diffDisomic: gi.some(function (q) { return q.p0diff; }),
      allRecomb: gi.length === 4 && gi.every(function (q) { return q.p0 === 1 && q.recomb; })
    };
  }
  function emitStage(paused) { emit('cd-stage', stageData(paused)); }
  function onDone() {
    if (st1.doneEmitted) return;
    st1.doneEmitted = true;
    const d = doneData();
    emit('cd-done', d);
    addRow(d);
    sndDone(d.aneuploid > 0);
    const kind = st1.mode === 'mitosis' ? T('兩個子細胞', 'two daughter cells') : T('四個配子', 'four gametes');
    let msg = T('分裂完成：' + kind + '。', 'Division complete: ' + kind + '.');
    if (st1.mode === 'meiosis') {
      msg += T('配子的第 1 對：' + d.genos.join('、') + '。', ' Pair 1 in the gametes: ' + d.genos.join(', ') + '.');
      if (d.aneuploid) msg += T('有 ' + d.aneuploid + ' 個配子的染色體數不是 n（紅色）。', ' ' + d.aneuploid + ' gametes do not have n chromosomes (red).');
    }
    setStatus('status', msg); say(msg);
  }

  // ---------- 播放 ----------
  let rafP = 0;
  function play() {
    if (st1.playing) { pause(); return; }
    if (isDone()) { st1.tau = 0; st1.doneEmitted = false; st1.lastStage = -1; }
    st1.playing = true; st1.last = 0;
    $('playBtn').textContent = T('暫停', 'Pause');
    const loop = function (now) {
      if (!st1.playing) return;
      const dt = st1.last ? Math.min(0.05, (now - st1.last) / 1000) : 0;
      st1.last = now;
      advance(dt * RATE * (reducedMotion ? 1.5 : 1));
      if (isDone()) { pause(true); return; }
      rafP = requestAnimationFrame(loop);
    };
    rafP = requestAnimationFrame(loop);
  }
  function advance(d) {
    const before = stageNow();
    st1.tau = Math.min(K.total(st1.mode), st1.tau + d);
    tick(before);
    draw1Now();
  }
  /** 時期改變時的音效、狀態列、事件 */
  function tick(before) {
    const s = stageNow();
    if (s.i !== st1.lastStage) {
      st1.lastStage = s.i;
      sndStage(s.i);
      if (s.k === 'ana' || s.k === 'ana1' || s.k === 'ana2') sndPull();
      const tip = STAGE_TIP[s.k];
      setStatus('status', stageName(s.k) + T('：', ': ') + T(tip[0], tip[1]));
      if (st1.playing) emitStage(false);
    }
    // 交叉出現的那一刻
    const xoOn = st1.mode === 'meiosis' && st1.rec.xo.length && s.k === 'pro1' && s.f > 0.55;
    if (xoOn && !st1.lastXo) sndXo();
    st1.lastXo = !!xoOn;
    void before;
    if (isDone()) onDone();
  }
  function pause(ended) {
    st1.playing = false;
    if (rafP) cancelAnimationFrame(rafP); rafP = 0;
    $('playBtn').textContent = isDone() ? T('從頭播放', 'Play again') : T('播放', 'Play');
    if (!ended) emitStage(true);
    renderRo1(); request1();
  }
  function seek(t, quiet) {
    if (st1.playing) pause(true);
    st1.tau = Math.max(0, Math.min(K.total(st1.mode), t));
    if (st1.tau < K.total(st1.mode) - 1e-9) st1.doneEmitted = false;
    tick();
    $('playBtn').textContent = isDone() ? T('從頭播放', 'Play again') : T('播放', 'Play');
    if (!quiet) emitStage(true);
    renderRo1(); request1();
  }
  function step() {
    const s = stageNow(), st = K.STAGES[st1.mode];
    const ni = s.i + 1 < st.length ? s.i + 1 : s.i;
    let t = K.stageStart(st1.mode, ni) + 0.001;
    if (s.i === st.length - 1) t = K.total(st1.mode);
    // 每一期跳到「最容易看」的那一刻：開頭往後一點
    if (ni !== s.i) t = K.stageStart(st1.mode, ni) + st[ni].d * (st[ni].k === 'S' ? 0.3 : 0.75);   // S 期停在 30%：看得到正在複製
    seek(t);
    sndClick(660);
  }

  // ---------- 讀數 ----------
  function renderRo1() {
    if (!st1.rec) return;
    const c = countsNow(), s = c.stage, n = st1.n;
    const per = c.cells.map(function (x) { return x.chrom; });
    const dn = c.cells.map(function (x) { return num(x.dna, x.dna % 1 ? 1 : 0) + 'C'; });
    const nLabel = function (k) {
      if (k === 2 * n) return '2n';
      if (k === n) return 'n';
      if (k === 4 * n) return '4n';
      if (k === n + 1) return 'n+1';
      if (k === n - 1) return 'n−1';
      if (k === 2 * n + 2) return '2n+2';
      if (k === 2 * n - 2) return '2n−2';
      return String(k);
    };
    const rows = [];
    rows.push([T('時期', 'Stage'), stageName(s.k) + '<small>' + (st1.mode === 'mitosis' ? T('有絲分裂', 'Mitosis') : T('減數分裂', 'Meiosis')) + T('・2n = ', ' · 2n = ') + 2 * n + '</small>']);
    rows.push([T('細胞數', 'Cells'), String(c.cells.length)]);
    rows.push([T('每個細胞的染色體數', 'Chromosomes per cell'), per.map(function (k) { return k + '（' + nLabel(k) + '）'; }).join('、') + '<small>' + T('以著絲點計數', 'counted by centromeres') + '</small>']);
    rows.push([T('每條染色體的分體', 'Chromatids per chromosome'), c.joined && c.replicated > 0.999 ? '2' : c.replicated > 0 && c.replicated < 1 ? T('複製中', 'copying') : '1']);
    rows.push([T('每個細胞的 DNA 量', 'DNA per cell'), dn.join('、') + '<small>' + T('1C = 一套單倍體的 DNA', '1C = one haploid set of DNA') + '</small>']);
    if (st1.mode === 'meiosis') {
      rows.push([T('交叉數', 'Chiasmata'), st1.xo ? String(st1.rec.xo.length) + '<small>' + T('各對：', 'by pair: ') + perPair() + '</small>' : T('沒有（互換關閉）', 'none (off)')]);
      if (isDone()) {
        const gi = gametesInfo();
        rows.push([T('配子（第 1 對）', 'Gametes (pair 1)'), gi.map(function (q) { return q.geno + (q.size !== n ? '<span style="color:' + C['cd-bad'] + '">（' + nLabel(q.size) + '）</span>' : ''); }).join('、'), gi.some(function (q) { return q.size !== n; }) ? 'bad' : '']);
      }
    }
    $('ro1').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>'; }).join('');
  }
  function perPair() {
    const a = []; for (let p = 0; p < st1.n; p++) a.push(st1.rec.xo.filter(function (x) { return x.p === p; }).length);
    return a.join('、');
  }

  // ---------- 紀錄表 ----------
  function addRow(d) {
    st1.no++;
    st1.rows.unshift({
      no: st1.no, mode: d.mode, n: d.n, xo: d.xo, nd: d.nd, chi: d.chiasmata, sizes: d.sizes, genos: d.genos
    });
    if (st1.rows.length > MAX_ROWS) st1.rows.pop();
    renderRows1();
  }
  function renderRows1() {
    const t = $('runs1');
    if (!st1.rows.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('方式', 'Division') + '</th><th>2n</th><th>' + T('互換', 'Crossing over') + '</th><th>' + T('不分離', 'Nondisjunction') + '</th><th>' + T('交叉', 'Chiasmata') + '</th><th>' + T('子細胞或配子（染色體數：第 1 對）', 'Cells or gametes (chromosomes: pair 1)') + '</th></tr></thead><tbody>';
    st1.rows.forEach(function (r) {
      const ok = r.mode === 'mitosis' ? 2 * r.n : r.n;
      const cells = r.sizes.map(function (s, i) {
        const bad = s !== ok;
        const g = r.mode === 'meiosis' ? '：' + r.genos[i] : '';
        return '<span' + (bad ? ' style="color:' + C['cd-bad'] + ';font-weight:600"' : (r.mode === 'meiosis' && K.isRecombinant(r.genos[i]) ? ' style="color:' + C['cd-xo'] + ';font-weight:600"' : '')) + '>' + s + g + '</span>';
      }).join(' ／ ');
      h += '<tr><td>' + r.no + '</td><td>' + (r.mode === 'mitosis' ? T('有絲', 'Mitosis') : T('減數', 'Meiosis')) + '</td><td>' + 2 * r.n + '</td><td>' + (r.mode === 'meiosis' ? (r.xo ? T('有', 'on') : T('無', 'off')) : '—') + '</td><td>' +
        (r.nd ? (r.nd === 1 ? T('第一次', 'I') : T('第二次', 'II')) : '—') + '</td><td>' + (r.mode === 'meiosis' && r.xo ? r.chi : '—') + '</td><td>' + cells + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }

  // =====================================================================
  // 2D 細胞
  // =====================================================================
  function layout1() {
    const w = cv.clientWidth || 360;
    const h = w < 520 ? Math.round(Math.max(300, Math.min(380, w * 0.95))) : 470;
    const s = fit(cv, ctx, h);
    st1.W = s.w; st1.H = s.h;
    const hg = w < 520 ? 270 : 250;
    const sg = fit(cvg, gtx, hg);
    st1.G = { w: sg.w, h: sg.h };
  }
  let raf1 = 0;
  function request1() { if (!raf1) raf1 = requestAnimationFrame(function () { raf1 = 0; draw1Now(); }); }
  function draw1Now() {
    if (!(view3 && view3.active)) drawCell();
    else view3.update();
    drawGraph();
  }
  function shade(c, f) { return D.shade(c, f); }

  function drawCell() {
    const g = ctx, w = st1.W, h = st1.H;
    g.clearRect(0, 0, w, h);
    D.backdrop(g, w, h);
    const fr = K.frame(st1.rec, st1.tau);
    const S = Math.min((w - 16) / 3.75, (h - 54) / 2.4);
    const ox = w / 2, oy = 34 + (h - 34) / 2;
    const P = function (x, y) { return [ox + x * S, oy + y * S]; };
    // 細胞
    drawCells(g, fr.cells, P, S);
    // 細胞核
    fr.nuclei.forEach(function (nu) {
      if (nu.a <= 0.01) return;
      const p = P(nu.x, nu.y), r = nu.r * S;
      g.save();
      g.globalAlpha = nu.a;
      const gr = g.createRadialGradient(p[0] - r * 0.3, p[1] - r * 0.3, r * 0.1, p[0], p[1], r);
      gr.addColorStop(0, D.alpha(C['cd-nuc'], D.dark ? 0.16 : 0.10));
      gr.addColorStop(1, D.alpha(C['cd-nuc'], D.dark ? 0.28 : 0.2));
      g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
      if (nu.a < 0.98) g.setLineDash([5, 5]);
      g.strokeStyle = D.alpha(C['cd-nuc'], 0.85); g.lineWidth = 2; g.stroke();
      g.setLineDash([]);
      g.restore();
    });
    // 紡錘體
    if (fr.spindle > 0.01) drawSpindle(g, fr, P, S);
    // 染色體
    // 間期與前期：染色質留在核膜裡（剪裁在細胞核內）
    //（末期與末期 II 核膜重新出現後，也剪裁在各個新的細胞核內）
    const kk = fr.stage.k;
    const inNuc = fr.nuclei.length > 0 && ((['G1', 'S', 'G2', 'pro', 'pro1'].indexOf(kk) >= 0 && fr.envelope > 0.6) || ((kk === 'telo' || kk === 'telo2') && fr.nuclei[0].a > 0.35));
    if (inNuc) {
      g.save(); g.beginPath();
      fr.nuclei.forEach(function (nu) { const p = P(nu.x, nu.y), r = nu.r * S - 1.5; g.moveTo(p[0] + r, p[1]); g.arc(p[0], p[1], r, 0, Math.PI * 2); });
      g.clip();
    }
    fr.chromatids.forEach(function (q) { drawChromatid(g, q, P, S, fr); });
    if (inNuc) g.restore();
    // 交叉
    fr.chiasmata.forEach(function (x) {
      if (x.a <= 0.02) return;
      const p = P(x.x, x.y);
      g.save(); g.globalAlpha = x.a;
      D.ball(g, p[0], p[1], Math.max(3.5, S * 0.022), C['cd-xo'], { glow: 0.5 });
      g.restore();
    });
    // 中心體
    fr.poles.forEach(function (p0) {
      const p = P(p0.x, p0.y);
      D.ball(g, p[0] - 2.5, p[1], Math.max(3, S * 0.02), C['cd-pole'], { glow: 0.35 });
      D.ball(g, p[0] + 2.5, p[1] + 1.5, Math.max(3, S * 0.02), C['cd-pole'], { glow: 0.2 });
    });
    // 標題
    const s = fr.stage;
    const title = (st1.mode === 'mitosis' ? T('有絲分裂', 'Mitosis') : T('減數分裂', 'Meiosis')) + T('・', ' · ') + stageName(s.k);
    pill(g, title, 10, 8, D.c.text, 13);
    const c = countsNow();
    const sub = T('每個細胞 ', 'Per cell: ') + c.cells.map(function (x) { return x.chrom + T(' 條', ''); }).join(T('、', ', ')) + T('；DNA ', T('', '; DNA '), '; DNA ') + c.cells.map(function (x) { return num(x.dna, x.dna % 1 ? 1 : 0) + 'C'; }).join(T('、', ', '));
    if (w >= 520) pill(g, sub, w - 10, 8, D.c.muted, 12, 'right');
    else pill(g, sub, 10, h - 30, D.c.muted, 11.5);
    if (st1.mode === 'meiosis' && w >= 420) {
      small(g, T('示意圖（未依比例）', 'Schematic (not to scale)'), w - 10, h - 12, D.c.muted, 'right', 'middle', 10.5);
    }
  }
  function drawCells(g, cells, P, S) {
    // 細胞質
    cells.forEach(function (c) {
      const p = P(c.x, c.y), r = c.r * S;
      const gr = g.createRadialGradient(p[0] - r * 0.35, p[1] - r * 0.4, r * 0.1, p[0], p[1], r);
      gr.addColorStop(0, shade(C['cd-cyto'], D.dark ? 0.08 : 0.5));
      gr.addColorStop(1, shade(C['cd-cyto'], D.dark ? -0.15 : -0.06));
      g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    });
    // 細胞膜：每個圓只畫在其他圓外面的部分（分裂溝看起來是一條連續的膜）
    cells.forEach(function (c, i) {
      const p = P(c.x, c.y), r = c.r * S;
      g.save();
      g.beginPath();
      g.rect(-10, -10, st1.W + 20, st1.H + 20);
      cells.forEach(function (o, j) {
        if (j === i) return;
        const q = P(o.x, o.y), rr = o.r * S;
        g.moveTo(q[0] + rr, q[1]); g.arc(q[0], q[1], rr, 0, Math.PI * 2, true);
      });
      g.clip();
      g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2);
      g.lineWidth = 5; g.strokeStyle = D.alpha(shade(C['cd-mem'], -0.25), 0.55); g.stroke();
      g.lineWidth = 2.2; g.strokeStyle = C['cd-mem']; g.stroke();
      g.beginPath(); g.arc(p[0] - 0.8, p[1] - 0.8, r - 1.2, Math.PI * 1.05, Math.PI * 1.55);
      g.lineWidth = 1.2; g.strokeStyle = D.alpha('#ffffff', D.dark ? 0.25 : 0.6); g.stroke();
      g.restore();
    });
  }
  function centromereOf(q, P, S) {
    const Lw = q.len * (1 + 0.9 * (1 - q.cond));
    const cen = st1.rec.cens[q.p];
    const t = cen - 0.5;
    return P(q.x + Math.cos(q.ang) * Lw * t, q.y + Math.sin(q.ang) * Lw * t);
  }
  function drawSpindle(g, fr, P, S) {
    const a = fr.spindle;
    g.save();
    g.lineCap = 'round';
    // 星狀體
    fr.poles.forEach(function (p0) {
      const p = P(p0.x, p0.y);
      g.strokeStyle = D.alpha(C['cd-spin'], 0.28 * a); g.lineWidth = 1;
      for (let k = 0; k < 10; k++) {
        const an = k / 10 * Math.PI * 2;
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + Math.cos(an) * S * 0.12 * a, p[1] + Math.sin(an) * S * 0.12 * a); g.stroke();
      }
    });
    // 極間微管（兩極之間，重疊在中間）
    const pairs = [];
    if (fr.poles.length === 2) pairs.push([fr.poles[0], fr.poles[1]]);
    if (fr.poles.length === 4) { pairs.push([fr.poles[0], fr.poles[1]]); pairs.push([fr.poles[2], fr.poles[3]]); }
    pairs.forEach(function (pp) {
      const A = P(pp[0].x, pp[0].y), B = P(pp[1].x, pp[1].y);
      const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      g.strokeStyle = D.alpha(C['cd-spin'], 0.22 * a); g.lineWidth = 1;
      for (let k = -3; k <= 3; k++) {
        if (!k) continue;
        const off = k * S * 0.075;
        g.beginPath(); g.moveTo(A[0], A[1]);
        g.quadraticCurveTo((A[0] + B[0]) / 2 + nx * off * 1.6, (A[1] + B[1]) / 2 + ny * off * 1.6, B[0], B[1]);
        g.stroke();
      }
    });
    // 著絲點微管
    g.strokeStyle = D.alpha(C['cd-spin'], 0.75 * a); g.lineWidth = 1.3;
    fr.chromatids.forEach(function (q) {
      if (q.pole < 0 || !fr.poles[q.pole]) return;
      const p0 = fr.poles[q.pole], A = P(p0.x, p0.y), B = centromereOf(q, P, S);
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    });
    g.restore();
  }
  function drawChromatid(g, q, P, S, fr) {
    if (q.rep <= 0.01) return;
    const cond = q.cond, Lw = q.len * (1 + 0.9 * (1 - cond));
    const dx = Math.cos(q.ang), dy = Math.sin(q.ang), px = -dy, py = dx;
    const amp = (1 - cond) * 0.035, ph = q.c * 1.7;
    // 後期：兩臂繞著著絲點往赤道方向折成 V 字（著絲點帶頭、手臂拖在後面）
    const cen = st1.rec.cens[q.p], bend = q.bend || 0, GAM = 0.42;
    const cxp = q.x + dx * Lw * (cen - 0.5), cyp = q.y + dy * Lw * (cen - 0.5);
    const la = q.ang + bend * GAM, sa = q.ang + Math.PI + bend * (Math.PI - GAM);
    const Ld = [Math.cos(la), Math.sin(la)], Sd = [Math.cos(sa), Math.sin(sa)];
    const pt = function (t) {
      const wv = amp * Math.sin(t * Math.PI * 6 + ph);
      if (bend > 0.001) { const d = t >= cen ? Ld : Sd, r = Math.abs(t - cen) * Lw; return P(cxp + d[0] * r + px * wv, cyp + d[1] * r + py * wv); }
      return P(q.x + dx * Lw * (t - 0.5) + px * wv, q.y + dy * Lw * (t - 0.5) + py * wv);
    };
    const perpAt = function (t) { if (bend <= 0.001) return [px, py]; const tg = t >= cen ? Ld : [-Sd[0], -Sd[1]]; return [-tg[1], tg[0]]; };
    const wpx = Math.max(1.4, S * 0.038 * (0.28 + 0.72 * cond));
    const colOf = function (o) { return o ? C['cd-pat'] : C['cd-mat']; };
    g.save();
    g.globalAlpha = q.rep;
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = function (a, b, ox, oy) {
      const k = Math.max(2, Math.ceil((b - a) * (cond < 0.9 ? 30 : 6)));
      const ts = [];
      for (let i = 0; i <= k; i++) ts.push(a + (b - a) * i / k);
      if (bend > 0.001 && cen > a && cen < b) { ts.push(cen); ts.sort(function (u, v) { return u - v; }); }   // V 字的頂點
      g.beginPath();
      ts.forEach(function (t, i) { const p = pt(t); if (!i) g.moveTo(p[0] + ox, p[1] + oy); else g.lineTo(p[0] + ox, p[1] + oy); });
    };
    // 陰影層、主色、高光
    q.segs.forEach(function (sg) { path(sg.a, sg.b, 0, 0); g.lineWidth = wpx + 1.6; g.strokeStyle = shade(colOf(sg.o), -0.45); g.stroke(); });
    q.segs.forEach(function (sg) { path(sg.a, sg.b, 0, 0); g.lineWidth = wpx; g.strokeStyle = colOf(sg.o); g.stroke(); });
    if (cond > 0.4) q.segs.forEach(function (sg) { path(sg.a, sg.b, -wpx * 0.16, -wpx * 0.18); g.lineWidth = wpx * 0.3; g.strokeStyle = D.alpha(shade(colOf(sg.o), 0.55), 0.8 * cond); g.stroke(); });
    // 著絲點（縊痕）
    if (cond > 0.3) {
      const c = pt(st1.rec.cens[q.p]);
      g.beginPath(); g.arc(c[0], c[1], wpx * 0.42, 0, Math.PI * 2);
      g.fillStyle = D.alpha(shade(colOf(K.originAt(q.segs, st1.rec.cens[q.p])), -0.55), cond); g.fill();
    }
    // 第 1 對上的基因座 A、B（只在減數分裂）
    if (st1.mode === 'meiosis' && q.p === 0 && cond > 0.5) {
      [[K.LOCI.A, 'A'], [K.LOCI.B, 'B']].forEach(function (L) {
        const c = pt(L[0]), pp = perpAt(L[0]), px = pp[0], py = pp[1];
        const o = K.originAt(q.segs, L[0]);
        g.beginPath(); g.moveTo(c[0] - px * wpx * 0.55, c[1] - py * wpx * 0.55); g.lineTo(c[0] + px * wpx * 0.55, c[1] + py * wpx * 0.55);
        g.lineWidth = Math.max(1.5, wpx * 0.32); g.strokeStyle = D.alpha('#ffffff', 0.9 * cond); g.lineCap = 'butt'; g.stroke(); g.lineCap = 'round';
        if (cond > 0.85 && S > 90) {
          const lab = o ? L[1].toLowerCase() : L[1];
          // 標在分體外側（離姊妹遠的一邊）
          const showSide = q.lab != null ? q.lab : (q.s ? 1 : -1);
          if (showSide) small(g, lab, c[0] + px * (wpx + 6) * showSide, c[1] + py * (wpx + 6) * showSide, colOf(o), 'center', 'middle', 10.5, '700');
        }
      });
    }
    g.restore();
  }

  // =====================================================================
  // 時間軸圖：染色體數與 DNA 量
  // =====================================================================
  function graphLayout() {
    const G = st1.G, w = G.w, h = G.h;
    const x0 = w < 520 ? 40 : 48, x1 = w - 14;
    const strip = 74;
    const top = 8, bot = h - strip - 22;
    const mid = top + (bot - top) / 2;
    return { x0: x0, x1: x1, A: [top + 14, mid - 6], B: [mid + 14, bot], axisY: bot + 2, strip: [h - strip, h - 4] };
  }
  function xOfT(t, L) { return L.x0 + (L.x1 - L.x0) * t / st1.series.T; }
  function tOfX(x, L) { return Math.max(0, Math.min(st1.series.T, (x - L.x0) / (L.x1 - L.x0) * st1.series.T)); }
  function drawGraph() {
    const g = gtx, G = st1.G, w = G.w, h = G.h;
    if (!st1.series) return;
    g.clearRect(0, 0, w, h);
    D.backdrop(g, w, h);
    const L = graphLayout(), S = st1.series, n = st1.n;
    // 時期色帶
    const st = K.STAGES[st1.mode];
    st.forEach(function (s, i) {
      const a = xOfT(K.stageStart(st1.mode, i), L), b = xOfT(K.stageStart(st1.mode, i) + s.d, L);
      if (i % 2 === 0) { g.fillStyle = D.alpha(D.c.text, D.dark ? 0.05 : 0.035); g.fillRect(a, L.A[0] - 12, b - a, L.axisY - L.A[0] + 12); }
      const lab = T(STAGE_SHORT[s.k][0], STAGE_SHORT[s.k][1]);
      if (b - a > 14) small(g, lab, (a + b) / 2, L.axisY + 9, D.c.muted, 'center', 'middle', b - a > 26 ? 10.5 : 9);
    });
    // 減數分裂 I／II 的大括號標示
    if (st1.mode === 'meiosis' && w >= 420) {
      const s1 = xOfT(K.stageStart('meiosis', 3), L), e1 = xOfT(K.stageStart('meiosis', 7), L), e2 = L.x1;
      g.strokeStyle = D.alpha(D.c.muted, 0.6); g.lineWidth = 1;
      [[s1, e1, T('減數分裂 I', 'Meiosis I')], [e1, e2, T('減數分裂 II', 'Meiosis II')]].forEach(function (q) {
        g.beginPath(); g.moveTo(q[0] + 2, L.A[0] - 4); g.lineTo(q[0] + 2, L.A[0] - 8); g.lineTo(q[1] - 2, L.A[0] - 8); g.lineTo(q[1] - 2, L.A[0] - 4); g.stroke();
      });
    }
    // 兩張小圖
    const maxCh = Math.max(4 * n, Math.max.apply(null, S.ch));
    const maxD = 4;
    plotStep(g, L, L.A, S.ch, maxCh, C['cd-chrom'], T('染色體數', 'Chromosomes'), function (v) {
      return [[0, '0'], [n, 'n'], [2 * n, '2n'], [4 * n, '4n']].filter(function (q, i, a) { return i === 0 || q[0] !== a[i - 1][0]; });
    }, maxCh);
    plotStep(g, L, L.B, S.dna, maxD, C['cd-dna'], T('DNA 量', 'DNA'), function () { return [[0, '0'], [1, '1C'], [2, '2C'], [4, '4C']]; }, maxD);
    // 游標
    const xc = xOfT(st1.tau, L);
    g.strokeStyle = D.alpha(D.c.text, 0.7); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(xc + 0.5, L.A[0] - 6); g.lineTo(xc + 0.5, L.axisY); g.stroke();
    const i = Math.round(st1.tau / S.T * S.N);
    D.ball(g, xc, yOf(L.A, S.ch[i], maxCh), 4.5, C['cd-chrom'], { glow: 0.3 });
    D.ball(g, xc, yOf(L.B, S.dna[i], maxD), 4.5, C['cd-dna'], { glow: 0.3 });
    small(g, T('追蹤左（上）方的細胞', 'Following the left (top) cell'), L.x1, L.A[0] - 8, D.c.muted, 'right', 'middle', 10);
    // 子細胞或配子
    drawStrip(g, L);
  }
  function yOf(R, v, mx) { return R[1] - (R[1] - R[0]) * v / mx; }
  function plotStep(g, L, R, arr, mx, col, name, ticks) {
    g.strokeStyle = D.alpha(D.c.border, 0.9); g.lineWidth = 1;
    ticks().forEach(function (q) {
      const y = Math.round(yOf(R, q[0], mx)) + 0.5;
      g.beginPath(); g.moveTo(L.x0, y); g.lineTo(L.x1, y); g.strokeStyle = D.alpha(D.c.border, q[0] ? 0.55 : 0.9); g.stroke();
      small(g, q[1], L.x0 - 5, y, D.c.muted, 'right', 'middle', 10);
    });
    g.save();
    g.beginPath();
    const N = st1.series.N;
    for (let i = 0; i <= N; i++) {
      const x = L.x0 + (L.x1 - L.x0) * i / N, y = yOf(R, arr[i], mx);
      if (!i) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineWidth = 4; g.strokeStyle = D.alpha(col, 0.18); g.lineJoin = 'round'; g.stroke();
    g.lineWidth = 2.2; g.strokeStyle = col; g.stroke();
    // 已走過的部分加亮
    g.restore();
    small(g, name, L.x0 + 4, R[0] - 4, col, 'left', 'middle', 11, '600');
  }
  function drawStrip(g, L) {
    const y0 = L.strip[0], y1 = L.strip[1], w = st1.G.w;
    const r = st1.rec, done = isDone();
    const k = r.gametes.length;
    const gap = 8, bw = (w - 16 - gap * (k - 1)) / k;
    const lab = st1.mode === 'mitosis' ? T('子細胞', 'Daughter cell') : T('配子', 'Gamete');
    r.gametes.forEach(function (gm, i) {
      const x = 8 + i * (bw + gap);
      const bad = gm.length !== (st1.mode === 'mitosis' ? 2 * st1.n : st1.n);
      panel(g, x, y0, bw, y1 - y0);
      if (!done) {
        // 格子窄時分兩行（名稱／提示），避免溢出
        const tip = T('分裂完成後出現', 'appears when division ends'), cx = x + bw / 2, cy = (y0 + y1) / 2;
        if (bw >= 200) small(g, lab + ' ' + (i + 1) + T('：', ': ') + tip, cx, cy, D.c.muted, 'center', 'middle', 10.5);
        else { small(g, lab + ' ' + (i + 1), cx, cy - 8, D.c.muted, 'center', 'middle', 10.5, '700'); if (bw >= 70) small(g, bw < 120 ? T('完成後出現', 'pending') : tip, cx, cy + 8, D.c.muted, 'center', 'middle', 9.5); }
        if (bw < 150) { /* 窄版字已縮小 */ }
        return;
      }
      // 每條染色體畫成一根小直條
      const list = gm.slice().sort(function (a, b) { return a.p - b.p || a.h - b.h; });
      const m = list.length, colW = Math.min(12, (bw - 16) / Math.max(1, m)), hh = y1 - y0 - 30;
      list.forEach(function (q, j) {
        const cx = x + bw / 2 + (j - (m - 1) / 2) * colW;
        const L0 = hh * (0.45 + 0.55 * st1.rec.lengths[q.p] / 1.6);
        const top = y0 + 8 + (hh - L0);
        q.segs.forEach(function (sg) {
          g.beginPath(); g.moveTo(cx, top + sg.a * L0); g.lineTo(cx, top + sg.b * L0);
          g.lineCap = 'butt'; g.lineWidth = Math.max(3, colW * 0.62); g.strokeStyle = sg.o ? C['cd-pat'] : C['cd-mat']; g.stroke();
        });
      });
      const geno = st1.mode === 'meiosis' ? K.genotype(gm) : '';
      const txt = (st1.mode === 'mitosis' ? '2n = ' + gm.length : (bad ? (gm.length > st1.n ? 'n+1' : 'n−1') : 'n') + T('・', ' · ') + geno);
      small(g, txt, x + bw / 2, y1 - 11, bad ? C['cd-bad'] : (geno && K.isRecombinant(geno) ? shade(C['cd-xo'], D.dark ? 0 : -0.25) : D.c.text), 'center', 'middle', bw < 90 ? 10 : 11.5, '600');
      if (bad) { D.roundRect(g, x + 1, y0 + 1, bw - 2, y1 - y0 - 2, 9); g.strokeStyle = C['cd-bad']; g.lineWidth = 2; g.stroke(); }
    });
  }

  // ---------- 指標與鍵盤 ----------
  let dragG = false;
  cvg.addEventListener('pointerdown', function (ev) {
    const L = graphLayout(), p = evPos(cvg, ev);
    if (p[1] > L.axisY + 18) return;
    dragG = true; cvg.setPointerCapture && cvg.setPointerCapture(ev.pointerId);
    seek(tOfX(p[0], L), true);
  });
  cvg.addEventListener('pointermove', function (ev) { if (!dragG) return; const L = graphLayout(), p = evPos(cvg, ev); seek(tOfX(p[0], L), true); });
  const endDrag = function () { if (dragG) { dragG = false; emitStage(true); } };
  cvg.addEventListener('pointerup', endDrag); cvg.addEventListener('pointercancel', endDrag);
  const keyItem = {
    name: T('時間', 'Time'),
    move: function (dx, dy, big) {
      const d = dx || -dy; if (!d) return false;
      if (big) {
        const s = stageNow(), i = Math.max(0, Math.min(K.STAGES[st1.mode].length - 1, s.i + d));
        seek(K.stageStart(st1.mode, i) + K.STAGES[st1.mode][i].d * 0.75);
      } else seek(st1.tau + d * 0.1);
      return true;
    },
    describe: function () {
      const c = countsNow();
      return stageName(c.stage.k) + T('：', ': ') + c.cells.length + T(' 個細胞，每個 ', ' cells, each ') + c.cells.map(function (x) { return x.chrom; }).join('、') + T(' 條染色體、DNA ', ' chromosomes, DNA ') + c.cells.map(function (x) { return num(x.dna, 1) + 'C'; }).join('、') + T('。', '.');
    }
  };
  [cv, cvg].forEach(function (c) {
    if (window.LabKeys) window.LabKeys.attach(c, { label: T('細胞分裂：左右鍵前後移動時間（Shift 一次一期），空白鍵播放或暫停。', 'Cell division: left and right move through time (Shift for a whole stage); Space plays or pauses.'), items: [keyItem] });
    c.addEventListener('keydown', function (ev) { if (ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); play(); } });
  });

  // =====================================================================
  // 二・一千次減數分裂
  // =====================================================================
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const el2 = { d: $('d'), n2: $('n2') };
  const st2 = { d: 20, n: 3, cnt: null, total: 0, rec: 0, meioses: 0, pats: {}, runs: [], cur: null, no: 0, W: 0, H: 0, seed: 1 };
  function reset2(push) {
    if (push && st2.cur && st2.cur.total) { /* 舊的一輪已在 runs 裡 */ }
    st2.d = val(el2.d); st2.n = Math.round(val(el2.n2));
    st2.cnt = { AB: 0, Ab: 0, aB: 0, ab: 0 }; st2.total = 0; st2.rec = 0; st2.meioses = 0; st2.pats = {};
    st2.cur = null;
  }
  function stats2() {
    const r = st2.total ? st2.rec / st2.total : NaN, ci = K.wilson(st2.rec, st2.total);
    const distinct = Object.keys(st2.pats).length, possible = Math.pow(2, st2.n);
    return { d: st2.d, n: st2.n, meioses: st2.meioses, total: st2.total, rec: st2.rec, r: r, lo: ci[0], hi: ci[1], half: (ci[1] - ci[0]) / 2, haldane: K.haldane(st2.d / 100), distinct: distinct, possible: possible, counts: Object.assign({}, st2.cnt) };
  }
  function run2(N) {
    st2.seed = (st2.seed * 48271 + 11 + Math.floor(Math.random() * 1e6)) % 2147483647 || 3;
    const b = K.batch({ d: st2.d / 100, n: st2.n, N: N, seed: st2.seed });
    Object.keys(b.counts).forEach(function (k) { st2.cnt[k] = (st2.cnt[k] || 0) + b.counts[k]; });
    st2.total += b.total; st2.rec += b.rec; st2.meioses += N;
    b.patterns.forEach(function (p) { st2.pats[p] = (st2.pats[p] || 0) + 1; });
    const s = stats2();
    if (!st2.cur) { st2.no++; st2.cur = { no: st2.no }; st2.runs.unshift(st2.cur); if (st2.runs.length > MAX_RUNS) st2.runs.pop(); }
    Object.assign(st2.cur, { d: s.d, n: s.n, total: s.total, rec: s.rec, r: s.r, lo: s.lo, hi: s.hi, h: s.haldane, distinct: s.distinct, possible: s.possible });
    emit('cd-batch', { d: s.d, n: s.n, meioses: s.meioses, total: s.total, rec: s.rec, r: s.r, lo: s.lo, hi: s.hi, half: s.half, haldane: s.haldane, distinct: s.distinct, possible: s.possible });
    sndBatch();
    renderRo2(); renderRows2(); request2();
    const msg = T('已做 ' + s.meioses + ' 次減數分裂、' + s.total + ' 個配子：重組率 ' + pct(s.r) + '（95% 信賴區間 ' + pct(s.lo) + '–' + pct(s.hi) + '），Haldane 預測 ' + pct(s.haldane) + '；來源組合看過 ' + s.distinct + ' / ' + s.possible + ' 種。',
      s.meioses + ' meioses, ' + s.total + ' gametes: recombination ' + pct(s.r) + ' (95% CI ' + pct(s.lo) + '–' + pct(s.hi) + '), Haldane predicts ' + pct(s.haldane) + '; ' + s.distinct + ' of ' + s.possible + ' origin patterns seen.');
    setStatus('status2', msg); say(msg);
  }
  function renderOutputs2() {
    $('do').textContent = num(val(el2.d), 0) + ' cM';
    const n = Math.round(val(el2.n2));
    $('n2o').textContent = n + T('（2n = ', ' (2n = ') + 2 * n + T('）', ')');
  }
  function renderRo2() {
    const s = stats2();
    const rows = [];
    rows.push([T('減數分裂次數', 'Meioses'), String(s.meioses) + '<small>' + T('配子 ', 'gametes: ') + s.total + '</small>']);
    rows.push([T('親代型 AB／ab', 'Parental AB / ab'), s.counts.AB + '／' + s.counts.ab]);
    rows.push([T('重組型 Ab／aB', 'Recombinant Ab / aB'), s.counts.Ab + '／' + s.counts.aB]);
    rows.push([T('重組率 r', 'Recombination r'), s.total ? pct(s.r) + '<small>' + T('95% 信賴區間 ', '95% CI ') + pct(s.lo) + '–' + pct(s.hi) + '</small>' : '—']);
    rows.push([T('Haldane 預測', 'Haldane predicts'), pct(s.haldane, 2) + '<small>' + T('d = ', 'd = ') + num(s.d, 0) + ' cM' + (s.d <= 100 ? T('；若 r = d 會是 ', '; r = d would give ') + pct(s.d / 100, 1) : T('；若 r = d 會超過 100%，不可能', '; r = d would exceed 100%, which is impossible')) + '</small>']);
    const exp = K.expectDistinct(s.n, s.total);
    rows.push([T('來源組合', 'Origin patterns'), s.distinct + ' / ' + s.possible + T(' 種', '') + '<small>' + T('期望看到 ', 'expected ') + num(exp, exp < 10 ? 1 : 0) + T(' 種（2', ' (2') + '<sup>' + s.n + '</sup> = ' + s.possible + '）' + '</small>', s.total && s.distinct === s.possible ? 'good' : '']);
    $('ro2').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>'; }).join('');
  }
  function renderRows2() {
    const t = $('runs2');
    if (!st2.runs.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('距離', 'Distance') + '</th><th>n</th><th>' + T('配子', 'Gametes') + '</th><th>' + T('重組率', 'r') + '</th><th>' + T('95% 區間', '95% CI') + '</th><th>Haldane</th><th>' + T('組合', 'Patterns') + '</th></tr></thead><tbody>';
    st2.runs.forEach(function (r) {
      h += '<tr><td>' + r.no + '</td><td>' + num(r.d, 0) + ' cM</td><td>' + r.n + '</td><td>' + r.total + '</td><td class="rec">' + pct(r.r) + '</td><td>' + pct(r.lo) + '–' + pct(r.hi) + '</td><td>' + pct(r.h) + '</td><td>' + r.distinct + ' / ' + r.possible + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  function layout2() {
    const w = cv2.clientWidth || 360;
    const h = w < 560 ? 560 : 400;
    const s = fit(cv2, ctx2, h);
    st2.W = s.w; st2.H = s.h;
  }
  let raf2 = 0;
  function request2() { if (!raf2) raf2 = requestAnimationFrame(function () { raf2 = 0; draw2(); }); }
  function draw2() {
    const g = ctx2, w = st2.W, h = st2.H;
    g.clearRect(0, 0, w, h);
    D.backdrop(g, w, h);
    const narrow = w < 560;
    let A, B, Cg;
    if (narrow) { A = [8, 8, w - 16, 150]; B = [8, 166, w - 16, 250]; Cg = [8, 424, w - 16, h - 432]; }
    else { const lw = Math.round(w * 0.36); A = [8, 8, lw, 230]; Cg = [8, 246, lw, h - 254]; B = [lw + 16, 8, w - lw - 24, h - 16]; }
    drawBars(g, A);
    drawCurve(g, B);
    drawPatterns(g, Cg);
  }
  function drawBars(g, R) {
    panel(g, R[0], R[1], R[2], R[3]);
    const s = stats2();
    const keys = ['AB', 'Ab', 'aB', 'ab'];
    const cols = { AB: C['cd-mat'], ab: C['cd-pat'], Ab: C['cd-xo'], aB: C['cd-xo'] };
    small(g, T('四種配子（第 1 對）', 'Four kinds of gamete (pair 1)'), R[0] + 10, R[1] + 14, D.c.text, 'left', 'middle', 12, '600');
    const x0 = R[0] + 14, x1 = R[0] + R[2] - 10, y0 = R[1] + 34, y1 = R[1] + R[3] - 24;
    const mx = Math.max(1, s.counts.AB, s.counts.ab, s.counts.Ab, s.counts.aB);
    const bw = (x1 - x0) / 4;
    keys.forEach(function (k, i) {
      const v = s.counts[k], hgt = (y1 - y0 - 14) * v / mx;
      const x = x0 + i * bw + bw * 0.18, bwi = bw * 0.64;
      if (hgt > 0.5) {
        const gr = g.createLinearGradient(x, 0, x + bwi, 0);
        gr.addColorStop(0, shade(cols[k], 0.25)); gr.addColorStop(0.5, cols[k]); gr.addColorStop(1, shade(cols[k], -0.25));
        D.roundRect(g, x, y1 - hgt, bwi, hgt, Math.min(5, hgt / 2)); g.fillStyle = gr; g.fill();
      }
      small(g, k, x + bwi / 2, y1 + 11, D.c.text, 'center', 'middle', 12, '700');
      if (s.total) small(g, pct(v / s.total, 1), x + bwi / 2, y1 - hgt - 8, D.c.muted, 'center', 'middle', 10.5);
    });
    g.strokeStyle = D.alpha(D.c.border, 1); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, Math.round(y1) + 0.5); g.lineTo(x1, Math.round(y1) + 0.5); g.stroke();
    if (!s.total) small(g, T('按「做 1000 次」開始', 'Press “Run 1000 meioses”'), (x0 + x1) / 2, (y0 + y1) / 2, D.c.muted, 'center', 'middle', 11.5);
  }
  function drawCurve(g, R) {
    panel(g, R[0], R[1], R[2], R[3]);
    const x0 = R[0] + 44, x1 = R[0] + R[2] - 14, y0 = R[1] + 30, y1 = R[1] + R[3] - 34;
    const DMAX = 200, RMAX = 0.6;
    const X = function (d) { return x0 + (x1 - x0) * d / DMAX; }, Y = function (r) { return y1 - (y1 - y0) * r / RMAX; };
    small(g, T('重組率對距離', 'Recombination against distance'), R[0] + 10, R[1] + 14, D.c.text, 'left', 'middle', 12, '600');
    g.lineWidth = 1;
    for (let d = 0; d <= DMAX; d += 25) {
      const x = Math.round(X(d)) + 0.5;
      g.strokeStyle = D.alpha(D.c.border, d % 50 ? 0.35 : 0.8); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
      if (d % 50 === 0) small(g, String(d), x, y1 + 10, D.c.muted, 'center', 'middle', 10);
    }
    for (let r = 0; r <= RMAX + 1e-9; r += 0.1) {
      const y = Math.round(Y(r)) + 0.5;
      g.strokeStyle = D.alpha(D.c.border, 0.6); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      small(g, Math.round(r * 100) + '%', x0 - 5, y, D.c.muted, 'right', 'middle', 10);
    }
    small(g, T('距離 d（cM）', 'Distance d (cM)'), x1, y1 + 24, D.c.muted, 'right', 'middle', 10.5);
    // 50% 線
    g.setLineDash([6, 5]); g.strokeStyle = D.alpha(D.c.text, 0.5); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x0, Y(0.5)); g.lineTo(x1, Y(0.5)); g.stroke();
    // r = d
    g.strokeStyle = D.alpha(C['cd-k2'], 0.75);
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(RMAX * 100), Y(RMAX)); g.stroke();
    g.setLineDash([]);
    small(g, '50%', x1 - 4, Y(0.5) - 9, D.c.muted, 'right', 'middle', 10);
    small(g, 'r = d', X(52), Y(0.52) - 2, C['cd-k2'], 'right', 'middle', 10.5, '600');
    // Haldane 曲線
    g.beginPath();
    for (let d = 0; d <= DMAX; d += 1) { const x = X(d), y = Y(K.haldane(d / 100)); if (!d) g.moveTo(x, y); else g.lineTo(x, y); }
    g.lineWidth = 5; g.strokeStyle = D.alpha(C['cd-k1'], 0.18); g.stroke();
    g.lineWidth = 2.4; g.strokeStyle = C['cd-k1']; g.stroke();
    small(g, T('Haldane：r = (1 − exp(−d/50)) ÷ 2', 'Haldane: r = (1 − exp(−d/50)) ÷ 2'), X(120), Y(K.haldane(1.2)) - 14, C['cd-k1'], 'center', 'middle', 10.5, '600');
    // 目前的距離
    const xd = X(st2.d);
    g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 1; g.setLineDash([3, 4]);
    g.beginPath(); g.moveTo(xd, y0); g.lineTo(xd, y1); g.stroke(); g.setLineDash([]);
    // 量到的點
    st2.runs.slice().reverse().forEach(function (r) {
      if (!r.total) return;
      const x = X(r.d), cur = r === st2.cur;
      g.strokeStyle = cur ? C['cd-xo'] : D.alpha(D.c.text, 0.55); g.lineWidth = cur ? 2 : 1.4;
      g.beginPath(); g.moveTo(x, Y(r.lo)); g.lineTo(x, Y(r.hi)); g.stroke();
      g.beginPath(); g.moveTo(x - 4, Y(r.lo)); g.lineTo(x + 4, Y(r.lo)); g.moveTo(x - 4, Y(r.hi)); g.lineTo(x + 4, Y(r.hi)); g.stroke();
      D.ball(g, x, Y(r.r), cur ? 5 : 3.8, cur ? C['cd-xo'] : D.c.muted, { glow: cur ? 0.35 : 0 });
    });
  }
  function drawPatterns(g, R) {
    panel(g, R[0], R[1], R[2], R[3]);
    const s = stats2();
    small(g, T('獨立分配：配子的來源組合', 'Independent assortment: origin patterns'), R[0] + 10, R[1] + 14, D.c.text, 'left', 'middle', 12, '600');
    small(g, s.distinct + ' / ' + s.possible, R[0] + R[2] - 10, R[1] + 14, s.total && s.distinct === s.possible ? C['cd-ok'] : D.c.muted, 'right', 'middle', 12, '700');
    const K2 = s.possible, cols = Math.pow(2, Math.ceil(st2.n / 2)), rows = K2 / cols;
    const ax = R[0] + 10, ay = R[1] + 28, aw = R[2] - 20, ah = R[3] - 36;
    const cell = Math.max(3, Math.min(aw / cols, ah / rows, 34));
    const gx = ax + (aw - cell * cols) / 2, gy = ay + (ah - cell * rows) / 2;
    const expv = s.total / K2;
    for (let i = 0; i < K2; i++) {
      let key = '';
      for (let p = 0; p < st2.n; p++) key += (i >> (st2.n - 1 - p)) & 1 ? 'P' : 'M';
      const v = st2.pats[key] || 0;
      const x = gx + (i % cols) * cell, y = gy + Math.floor(i / cols) * cell;
      const a = v ? 0.25 + 0.75 * Math.min(1, v / (expv * 1.5)) : 0;
      D.roundRect(g, x + 1, y + 1, cell - 2, cell - 2, Math.min(4, cell / 4));
      g.fillStyle = v ? D.alpha(D.mix(C['cd-mat'], C['cd-pat'], key.split('').filter(function (c) { return c === 'P'; }).length / st2.n), a) : D.alpha(D.c.border, 0.35);
      g.fill();
      if (cell >= 28 && st2.n <= 4) small(g, key, x + cell / 2, y + cell / 2, D.c.text, 'center', 'middle', 9);
    }
  }
  // 鍵盤
  if (window.LabKeys) window.LabKeys.attach(cv2, {
    label: T('一千次減數分裂：左右鍵改兩個基因的距離（Shift 一次 10 cM），Enter 再做 1000 次。', 'A thousand meioses: left and right change the distance between the genes (Shift for 10 cM); Enter runs 1000 more.'),
    items: [{
      name: T('距離', 'Distance'),
      move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; if (window.LabNum) window.LabNum.set(el2.d, Math.max(0, Math.min(200, val(el2.d) + d * (big ? 10 : 1)))); return true; },
      describe: function () { const s = stats2(); return T('距離 ' + num(s.d, 0) + ' cM，Haldane 預測重組率 ' + pct(s.haldane) + (s.total ? '，量到 ' + pct(s.r) : '') + '。', 'Distance ' + num(s.d, 0) + ' cM, Haldane predicts ' + pct(s.haldane) + (s.total ? ', measured ' + pct(s.r) : '') + '.'); }
    }]
  });
  cv2.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); run2(1000); } });

  // =====================================================================
  // 3D 紡錘體（延遲載入）
  // =====================================================================
  const stage = $('stage1'), host3 = $('view3'), viewMsg = $('viewMsg');
  let view3 = null, threeLib = null, loadToken = 0;
  const bridge = {
    T: T, D: D, K: K,
    colors: function () { readColors(); return Object.assign({}, C); },
    frame: function () { return K.frame(st1.rec, st1.tau); },
    rec: function () { return st1.rec; },
    info: function () { const c = countsNow(); return { mode: st1.mode, stage: stageName(c.stage.k), cells: c.cells, n: st1.n }; },
    onContextLost: function () { fail3D(); }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.CD3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.CD3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/cell-division-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.CD3D) throw new Error('cell-division-3d.js did not load');
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
        view3 = window.CD3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) view3.onShow(); });
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 細胞。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D cell is kept.');
    resize1();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 事件綁定
  // =====================================================================
  function restart(newSeed) {
    if (st1.playing) pause(true);
    if (newSeed) st1.seed = nextSeed();
    build1(false);
    $('playBtn').textContent = T('播放', 'Play');
    tick();
  }
  el.n.addEventListener('input', function () { renderOutputs1(); restart(false); });
  $('modes').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-m]'); if (!b) return;
    st1.mode = b.getAttribute('data-m'); renderChips1(); restart(true); sndClick();
  });
  $('xos').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-x]'); if (!b || b.disabled) return;
    st1.xo = b.getAttribute('data-x') === 'on'; renderChips1(); restart(true); sndClick();
  });
  $('nds').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-d]'); if (!b || b.disabled) return;
    st1.nd = +b.getAttribute('data-d'); renderChips1(); restart(true); sndClick();
  });
  $('playBtn').addEventListener('click', play);
  $('stepBtn').addEventListener('click', step);
  $('againBtn').addEventListener('click', function () { restart(true); play(); });
  $('clear1').addEventListener('click', function () {
    st1.rows = []; st1.no = 0; renderRows1();
    setStatus('status', T('已清除配子紀錄表；設定沒有改變。', 'The table of gametes was cleared; the settings are unchanged.'));
  });
  let raf2c = 0;
  const onSet2 = function () {
    renderOutputs2();
    if (raf2c) return;
    raf2c = requestAnimationFrame(function () { raf2c = 0; reset2(true); renderRo2(); request2(); });
  };
  el2.d.addEventListener('input', onSet2);
  el2.n2.addEventListener('input', onSet2);
  $('run100').addEventListener('click', function () { run2(100); });
  $('run1000').addEventListener('click', function () { run2(1000); });
  $('clear2').addEventListener('click', function () {
    st2.runs = []; st2.no = 0; reset2(false);
    renderRo2(); renderRows2(); request2();
    setStatus('status2', T('已清掉所有統計；設定沒有改變。', 'All the counts were cleared; the settings are unchanged.'));
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 圖例 ----------
  function legend1() {
    const sq = function (c) { return '<i class="sq" style="background:' + c + '"></i>'; };
    const ln = function (c) { return '<i class="ln" style="border-color:' + c + '"></i>'; };
    const dot = function (c) { return '<i class="dot" style="background:' + c + '"></i>'; };
    $('legend1').innerHTML =
      '<span>' + sq(C['cd-mat']) + T('來自母方', 'From the mother') + '</span>' +
      '<span>' + sq(C['cd-pat']) + T('來自父方', 'From the father') + '</span>' +
      '<span>' + ln(C['cd-spin']) + T('紡錘絲', 'Spindle fibres') + '</span>' +
      '<span>' + dot(C['cd-pole']) + T('中心體', 'Centrosome') + '</span>' +
      '<span>' + dot(C['cd-xo']) + T('交叉', 'Chiasma') + '</span>' +
      '<span>' + ln(C['cd-chrom']) + T('染色體數', 'Chromosomes') + '</span>' +
      '<span>' + ln(C['cd-dna']) + T('DNA 量', 'DNA') + '</span>';
  }
  function legend2() {
    const sq = function (c) { return '<i class="sq" style="background:' + c + '"></i>'; };
    const ln = function (c, dash) { return '<i class="ln' + (dash ? ' dash' : '') + '" style="border-color:' + c + '"></i>'; };
    $('legend2').innerHTML =
      '<span>' + sq(C['cd-mat']) + 'AB' + T('（親代型）', ' (parental)') + '</span>' +
      '<span>' + sq(C['cd-pat']) + 'ab' + T('（親代型）', ' (parental)') + '</span>' +
      '<span>' + sq(C['cd-xo']) + 'Ab、aB' + T('（重組型）', ' (recombinant)') + '</span>' +
      '<span>' + ln(C['cd-k1']) + T('Haldane 作圖函數', 'Haldane mapping function') + '</span>' +
      '<span>' + ln(C['cd-k2'], true) + 'r = d</span>';
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  function resize1() { layout1(); request1(); if (view3 && view3.active) view3.resize(); }
  function resize2() { layout2(); request2(); }
  readColors();
  layout1(); layout2();
  renderChips1(); renderOutputs1(); renderOutputs2();
  build1(false);
  reset2(false);
  renderRo2(); renderRows1(); renderRows2();
  updateSoundButton();
  legend1(); legend2();
  tick();
  setStatus('status2', T('設定兩個基因的距離與染色體對數，再按「做 1000 次」。', 'Set the distance between the genes and the number of pairs, then press “Run 1000 meioses”.'));
  function themeChanged() {
    readColors();
    if (view3 && view3.active) view3.onTheme();
    legend1(); legend2(); renderRows1();
    request1(); request2();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', function () {
    renderChips1(); renderOutputs1(); renderOutputs2(); renderRo1(); renderRo2(); renderRows1(); renderRows2(); legend1(); legend2();
    $('playBtn').textContent = st1.playing ? T('暫停', 'Pause') : isDone() ? T('從頭播放', 'Play again') : T('播放', 'Play');
    st1.lastStage = -1; tick();
    if (view3 && view3.active) view3.onTheme();
    request1(); request2();
  });
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cvg, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });

  // 測試與縮圖用
  window.__cd = {
    K: K, st1: st1, st2: st2,
    mode: function (m) { st1.mode = m; renderChips1(); restart(true); },
    xo: function (on) { st1.xo = !!on; renderChips1(); restart(true); },
    nd: function (k) { st1.nd = k; renderChips1(); restart(true); },
    seed: function (s) { st1.seed = s; build1(false); tick(); },
    set: function (id, v) { const e = el[id] || el2[id]; if (e && window.LabNum) window.LabNum.set(e, v); },
    seek: function (t) { seek(t); },
    at: function (k, f) { const i = K.STAGES[st1.mode].findIndex(function (s) { return s.k === k; }); seek(K.stageStart(st1.mode, i) + K.STAGES[st1.mode][i].d * (f == null ? 0.75 : f)); },
    finish: function () { seek(K.total(st1.mode)); },
    play: play, pause: function () { pause(); },
    run: function (N) { if (raf2c) { cancelAnimationFrame(raf2c); raf2c = 0; reset2(true); } run2(N || 1000); },
    flush: function () { if (raf2c) { cancelAnimationFrame(raf2c); raf2c = 0; reset2(true); renderRo2(); } },
    setView: setView, redraw: function () { request1(); request2(); },
    stage: function () { return stageData(true); }, done: doneData, batch: stats2
  };
})();
