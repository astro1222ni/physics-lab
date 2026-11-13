/*
 * paper-chromatography.js — 「紙色層分析」的頁面程式（展開槽與濾紙的畫面、操作、量測、圖表、未知樣品、任務事件）
 * 化學核心在 js/paper-chromatography-core.js（PaperChromCore，長度單位 cm、時間單位 s）；3D 檢視在 js/paper-chromatography-3d.js（Chrom3D）。
 * 畫面上的濾紙由核心算出的斑點位置、寬度、量直接畫成（比爾定律疊色）；美化不改變任何位置。
 *
 * 流程：準備（setup，濾紙吊在液面上方）→「放入展開槽」展開（run，可暫停）→「取出濾紙」（out）→ 趁濕「標記溶劑前緣」→ 點斑點量 Rf。
 * 改了濾紙或展開液的設定，就換一張新濾紙重來；蓋子可以在展開中途打開或蓋上。
 *
 * 任務事件（只在使用者操作之後送出）：
 *   'tick'：展開中每 0.5 秒 { t, s, sInf, top, dF, ranOff, submerged, frac, anySample, lid, lidOpenAll, lidClosedAll, solvent, phi, pen, penMove }
 *   'take'：取出濾紙時 { paper, t, dF, ranOff, submerged, lidOpenAll, lidClosedAll, solvent, phi, spot, z0, zL, pen, penMove,
 *            lanes: [{ key, n（看得見的成分數）, peaks（看得出的斑點數）, minRs, minRsRef（點樣 2 mm 時的最小 Rs）, comps: [{ id, rf, rfW, rfE, d }] }] }
 *   'measure'：量一個斑點 { paper, lane, key, d, dF, Rf, dom, purity, rfTrue, valid, ranOff, lidClosedAll, solvent, phi, hist（之前的量測） }
 *   'identify'：未知樣品按「核對答案」{ ok, revealed, tries, ran }
 */
(function () {
  'use strict';
  const P = window.PaperChromCore, LD = window.LabDraw;
  if (!P || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const snd = function () { return window.LabSound && window.LabSound.enabled() ? window.LabSound : null; };

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  function clock(t) {
    t = Math.max(0, Math.round(t));
    const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
    const two = function (v) { return (v < 10 ? '0' : '') + v; };
    return h ? h + ':' + two(m) + ':' + two(s) : m + ':' + two(s);
  }
  function compName(id) { const c = P.COMP[id]; return c ? T(c.zh, c.en) : id; }
  function sampleName(key) { const s = P.SAMPLES[key]; return s ? T(s.zh, s.en) : key; }
  function solvName(key, phi) {
    if (key === 'mix') {
      const p = Math.round(phi * 1000) / 10;
      if (p === 0) return T('水', 'water');
      if (p === 100) return T('乙醇', 'ethanol');
      return T('水＋乙醇 ' + num(p, p % 1 ? 1 : 0) + '%', 'water + ' + num(p, p % 1 ? 1 : 0) + '% ethanol');
    }
    return T(P.SOLV[key].zh, P.SOLV[key].en);
  }
  function solvShort(key, phi) {
    if (key === 'mix') { const p = Math.round(phi * 1000) / 10; return T('乙醇 ', 'EtOH ') + num(p, p % 1 ? 1 : 0) + '%'; }
    return { salt: T('食鹽水', 'salt water'), ace: T('丙酮', 'acetone'), pe: T('石油醚＋丙酮', 'pet. ether') }[key];
  }

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, grid: c.grid, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk,
      paper: dk ? [222, 218, 206] : [248, 246, 238], glass: dk ? '#9fb4c8' : '#7d97ad', pencil: dk ? '#4a4d52' : '#55595f',
      lane: ['#c2543a', '#2f7fb8', '#5a8f2e']
    };
  }
  /** 顏色 → 各色光的吸收向量（比爾定律：透射 = exp(−OD × a)） */
  const absCache = {};
  function absVec(hex) {
    if (absCache[hex]) return absCache[hex];
    const r = LD.rgb(hex).map(function (v) { return -Math.log(Math.max(0.03, v / 255)); });
    const m = Math.max(r[0], r[1], r[2]) || 1;
    return (absCache[hex] = r.map(function (v) { return v / m; }));
  }
  const GAIN = 3.0;   // 顏色深淺的顯示倍率（示意；不改變位置）
  /** 幾種染料疊在一起的顏色（parts：[[成分, OD], …]），scale 讓顏色飽和到看得清楚 */
  function mixColor(parts, scale) {
    let tot = 0;
    parts.forEach(function (q) { tot += q[1]; });
    const k = scale != null ? scale : (tot > 0 ? 1.4 / tot : 0);
    const A = [0, 0, 0];
    parts.forEach(function (q) { const a = absVec(P.COMP[q[0]].col); for (let i = 0; i < 3; i++) A[i] += q[1] * k * a[i]; });
    const p = [248, 246, 238];
    return 'rgb(' + p.map(function (v, i) { return Math.round(v * Math.exp(-A[i])); }).join(',') + ')';
  }

  // ======================= 狀態 =======================
  const SPEEDS = [10, 60, 300];
  const LANES = ['A', 'B', 'C'];
  const state = { phase: 'setup', running: false, speed: 1, lanes: ['ink', 'green', 'brown'], spot: 3, z0: 1.5, zL: 0.8, pen: false,
    solvent: 'mix', phi: 0, lid: true, tab: 'front', sq: false, view: '2d' };
  let run = null, snap = null, paperId = 0, frontMark = null, dryLeft = 0, dryTotal = 1;
  let meas = [];                     // 量測紀錄（全部清除之間）
  let curves = [], curCurve = null;  // 前緣—時間曲線
  let userActed = false, lift = 1, liftTarget = 1, lidAnim = 1;
  let X = P.makeUnknown((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let xState = { tries: 0, revealed: false, ran: false };
  let lastTick = 0, lastCm = 0, crossed = false, ranSaid = false, dissolveSaid = false;
  let view3 = null;
  const PH = { setup: 'setup', run: 'run', out: 'out' };

  function opts() {
    return { lanes: state.lanes.slice(), spot: state.spot, z0: state.z0, zL: state.zL, pen: state.pen, solvent: state.solvent, phi: state.phi, lid: state.lid, X: X.slice() };
  }
  function raised() { return state.zL + 0.5; }
  function acted() { userActed = true; }
  function setStatus(s) { $('status').innerHTML = s || ''; }

  // ======================= 滑桿 =======================
  const elSpot = $('spot'), elZ0 = $('z0'), elZL = $('zL'), elPhi = $('phi');
  let syncing = false;
  function val(e) { return window.LabNum ? window.LabNum.value(e) : +e.value; }
  function setVal(e, v) { if (window.LabNum) window.LabNum.set(e, v); else { e.value = v; e.dispatchEvent(new Event('input')); } }
  function refreshOutputs() {
    $('spoto').textContent = num(state.spot, 1) + ' mm';
    $('z0o').textContent = num(state.z0, 2) + ' cm';
    $('zLo').textContent = num(state.zL, 2) + ' cm';
    $('phio').textContent = num(state.phi * 100, Math.abs(state.phi * 1000 - Math.round(state.phi * 1000)) < 1e-6 && Math.round(state.phi * 1000) % 10 ? 1 : 0) + ' %';
  }

  // ======================= 濾紙（離屏畫布，2D 與 3D 共用） =======================
  const PX = 28;                                   // 每公分像素
  const paperCv = document.createElement('canvas');
  paperCv.width = Math.round(P.PAPER.W * PX); paperCv.height = Math.round(P.PAPER.H * PX);
  const pctx = paperCv.getContext('2d');
  const NPX = paperCv.width * paperCv.height;
  const base = new Float32Array(NPX);              // 紙纖維的明暗（0.94–1.0）
  (function fibres() {
    let s = 12345;
    const rnd = function () { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return ((s >>> 8) & 0xffff) / 65536; };
    for (let i = 0; i < NPX; i++) base[i] = 1 - 0.025 * rnd();
    // 細纖維：短線段
    const w = paperCv.width, h = paperCv.height;
    for (let k = 0; k < 900; k++) {
      let x = rnd() * w, y = rnd() * h;
      const a = rnd() * Math.PI, len = 6 + rnd() * 18, dx = Math.cos(a), dy = Math.sin(a), dv = 0.02 + 0.03 * rnd();
      for (let j = 0; j < len; j++) { const xi = Math.round(x + dx * j), yi = Math.round(y + dy * j); if (xi >= 0 && yi >= 0 && xi < w && yi < h) base[yi * w + xi] -= dv; }
    }
  })();
  const ABS = new Float32Array(NPX * 3);
  const img = pctx.createImageData(paperCv.width, paperCv.height);
  let paperVer = 0, paperDrawnAt = -1;
  function renderPaper() {
    const w = paperCv.width, h = paperCv.height;
    ABS.fill(0);
    const sn = snap;
    const addSpot = function (sp) {
      if (!(sp.amt > 0)) return;
      const a = absVec(P.COMP[sp.id].col), od = sp.od * GAIN;
      if (od < 0.004) return;
      const cx = sp.x * PX, cy = (P.PAPER.H - sp.z) * PX, sx = sp.sx * PX, sz = sp.sz * PX;
      const x0 = Math.max(0, Math.floor(cx - 3.6 * sx)), x1 = Math.min(w - 1, Math.ceil(cx + 3.6 * sx));
      const y0 = Math.max(0, Math.floor(cy - 3.6 * sz)), y1 = Math.min(h - 1, Math.ceil(cy + 3.6 * sz));
      for (let y = y0; y <= y1; y++) {
        const qy = (y + 0.5 - cy) / sz, gy = od * Math.exp(-0.5 * qy * qy);
        for (let x = x0; x <= x1; x++) {
          const qx = (x + 0.5 - cx) / sx, g = gy * Math.exp(-0.5 * qx * qx), i = (y * w + x) * 3;
          ABS[i] += g * a[0]; ABS[i + 1] += g * a[1]; ABS[i + 2] += g * a[2];
        }
      }
    };
    sn.lanes.forEach(function (L) { L.spots.forEach(addSpot); });
    if (sn.pen && sn.pen.amt > 0) {
      const a = absVec(P.COMP.pen.col), od = sn.pen.od * GAIN, cy = (P.PAPER.H - sn.pen.z) * PX, sz = sn.pen.sz * PX;
      const x0 = Math.round(0.35 * PX), x1 = Math.round((P.PAPER.W - 0.35) * PX);
      for (let y = Math.max(0, Math.floor(cy - 3.6 * sz)); y <= Math.min(h - 1, Math.ceil(cy + 3.6 * sz)); y++) {
        const q = (y + 0.5 - cy) / sz, g = od * Math.exp(-0.5 * q * q);
        for (let x = x0; x <= x1; x++) { const i = (y * w + x) * 3; ABS[i] += g * a[0]; ABS[i + 1] += g * a[1]; ABS[i + 2] += g * a[2]; }
      }
    }
    // 濕的部分（前緣以下）：展開中全濕，取出後慢慢乾
    let wet = 0;
    if (state.phase === PH.run) wet = 1; else if (state.phase === PH.out) wet = Math.max(0, dryLeft / dryTotal);
    const yF = (P.PAPER.H - sn.zF) * PX, band = 0.18 * PX;
    const pc = col.paper, d = img.data;
    for (let y = 0; y < h; y++) {
      let f = 1;
      if (wet > 0 && sn.t > 0 && y >= yF) {
        const u = (y - yF) / band;
        f = 1 - wet * (0.07 + (u < 1 ? 0.07 * (1 - u) : 0));
      }
      for (let x = 0; x < w; x++) {
        const k = y * w + x, i = k * 3, o = k * 4, b = base[k] * f;
        d[o] = pc[0] * b * Math.exp(-ABS[i]);
        d[o + 1] = pc[1] * b * Math.exp(-ABS[i + 1]);
        d[o + 2] = pc[2] * b * Math.exp(-ABS[i + 2]);
        d[o + 3] = 255;
      }
    }
    pctx.putImageData(img, 0, 0);
    paperVer++;
  }

  // ======================= 一張濾紙的生命週期 =======================
  function newRun() {
    run = P.createRun(opts());
    snap = P.snapshot(run);
    frontMark = null; dryLeft = 0;
    crossed = false; ranSaid = false; dissolveSaid = false; lastCm = 0;
  }
  function newPaper(msg) {
    state.phase = PH.setup; state.running = false;
    newRun();
    liftTarget = raised();
    if (reducedMotion) lift = liftTarget;
    setStatus(msg || '');
    refreshAll();
    kick();
  }
  function start() {
    acted();
    if (state.phase === PH.out) newPaper();
    if (state.phase === PH.setup) {
      paperId++;
      newRun();
      state.phase = PH.run;
      curCurve = { id: paperId, solv: solvShort(state.solvent, state.phi), pts: [[0, 0]], lid: state.lid };
      curves.push(curCurve);
      if (curves.length > 8) curves.shift();
      liftTarget = 0;
      if (reducedMotion) lift = 0;
      const S = snd();
      if (S) S.noise({ dur: 0.25, gain: 0.12, filter: 1400, q: 0.8 });
      if (run.submerged && state.lanes.some(function (k) { return k !== 'none'; })) {
        setStatus('<span class="warn">' + T('起始線在液面下面：樣品會直接溶進展開液裡！', 'The start line is under the solvent surface: the samples will dissolve straight into the solvent!') + '</span>');
        if (S) S.tone({ freq: 300, dur: 0.25, type: 'triangle', gain: 0.12, delay: 0.2 });
      } else setStatus(T('展開中：展開液靠毛細作用沿著濾紙往上爬。', 'Developing: the solvent climbs the paper by capillary action.'));
    }
    setRunning(true);
  }
  function setRunning(on) {
    state.running = on && state.phase === PH.run;
    lastTs = 0;
    refreshButtons();
    kick();
  }
  function takeOut() {
    if (state.phase !== PH.run) return;
    acted();
    state.phase = PH.out; state.running = false;
    snap = P.snapshot(run);
    dryTotal = dryLeft = dryTime();
    liftTarget = raised();
    if (reducedMotion) lift = liftTarget;
    const S = snd();
    if (S) S.sweep({ from: 420, to: 760, dur: 0.22, gain: 0.08 });
    if (state.lanes.indexOf('X') >= 0 && snap.dF >= 3 && !snap.submerged && run.o.X.join() === X.join()) xState.ran = true;
    setStatus(snap.ranOff ? '<span class="warn">' + T('溶劑前緣已經跑出濾紙上緣，量不到它真正走了多遠。', 'The solvent front ran off the top of the paper, so its true distance can no longer be measured.') + '</span>' :
      T('已取出濾紙。趁濾紙還濕、看得見前緣，按「標記溶劑前緣」。', 'Paper taken out. While it is still wet and the front is visible, press “Mark the solvent front”.'));
    if (userActed && window.LabMission) window.LabMission.emit('take', takeData());
    refreshAll();
    kick();
  }
  function dryTime() {   // 前緣還看得見的秒數（真實時間；揮發性越大越快乾）
    return { mix: 12 - 6 * state.phi, salt: 12, ace: 5, pe: 5 }[run.o.solvent];
  }
  function markFront() {
    if (state.phase !== PH.out) return;
    acted();
    if (frontMark != null) { setStatus(T('已經標記過溶劑前緣了。', 'The solvent front is already marked.')); return; }
    if (dryLeft <= 0) { setStatus('<span class="warn">' + T('濾紙已經乾了，看不到溶劑前緣，這張濾紙算不出 Rf。', 'The paper has dried and the solvent front is invisible: no Rf values from this paper.') + '</span>'); return; }
    frontMark = snap.zF;
    const S = snd();
    if (S) S.noise({ dur: 0.18, gain: 0.1, filter: 3200, q: 2 });
    setStatus(snap.ranOff ? T('前緣在濾紙上緣：畫下的線其實不是真正的前緣。', 'The front is at the top edge: the line you drew is not the true front.') :
      T('已用鉛筆畫下溶劑前緣（離起始線 ' + num(P.roundRuler(frontMark - state.z0), 2) + ' cm）。點斑點量 Rf。', 'Solvent front marked (' + num(P.roundRuler(frontMark - state.z0), 2) + ' cm from the start line). Tap the spots to measure Rf.'));
    // 已經量過的斑點補算 Rf
    meas.forEach(function (m) {
      if (m.paper === paperId && m.Rf == null) { finishMeas(m); emitMeas(m); }
    });
    refreshAll();
  }

  function takeData() {
    const s = snap;
    const ref = P.snapshot(run, 0.05);    // 同樣的展開、點樣直徑 2 mm
    return {
      paper: paperId, t: run.t, dF: s.dF, ranOff: s.ranOff, submerged: s.submerged, lidOpenAll: run.lidOpenAll, lidClosedAll: run.lidClosedAll,
      solvent: run.o.solvent, phi: run.o.phi, spot: run.o.spot, z0: run.o.z0, zL: run.o.zL, pen: run.o.pen, penMove: penMove(),
      lanes: s.lanes.map(function (L, i) {
        const pr = P.pairs(s, i), pr2 = P.pairs(ref, i);
        return { key: L.key, n: pr.n, nAll: pr.nAll, peaks: P.peaks(s, i).length, minRs: pr.minRs, minRsRef: pr2.minRs,
          comps: L.spots.map(function (sp) { return { id: sp.id, rf: sp.rf, rfW: P.rf(sp.id, 'mix', 0), rfE: P.rf(sp.id, 'mix', 1), d: sp.d, vis: sp.od >= P.VIS }; }) };
      })
    };
  }
  function penMove() { return snap && snap.pen ? Math.max(0, snap.pen.z - run.o.z0) : 0; }
  function tickData() {
    const s = snap, sv = run.sv;
    return { t: run.t, s: s.s, sInf: run.o.lid ? null : P.sInf(sv), top: P.topS(run), dF: s.dF, ranOff: s.ranOff, submerged: s.submerged, frac: s.frac,
      anySample: run.o.lanes.some(function (k) { return k !== 'none' && P.sampleComps(k, run.o.X).length > 0; }),
      lid: run.o.lid, lidOpenAll: run.lidOpenAll, lidClosedAll: run.lidClosedAll, solvent: run.o.solvent, phi: run.o.phi, pen: run.o.pen, penMove: penMove() };
  }

  // ======================= 量測 =======================
  function laneAt(xcm) {
    let best = -1, bd = 1.3;
    P.PAPER.lanes.forEach(function (x, i) { const d = Math.abs(xcm - x); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function finishMeas(m) {
    m.dF = frontMark != null ? P.roundRuler(frontMark - run.o.z0) : null;
    m.Rf = m.dF != null && m.dF > 0 ? m.d / m.dF : null;
    m.valid = m.Rf != null && !snap.ranOff && !snap.submerged;
  }
  function emitMeas(m) {
    if (!userActed || !window.LabMission) return;
    const hist = meas.filter(function (q) { return q !== m; }).map(function (q) { return Object.assign({}, q); });
    window.LabMission.emit('measure', Object.assign({}, m, { hist: hist }));
  }
  function measure(lane, z) {
    if (state.phase !== PH.out) { setStatus(T('先把濾紙從展開槽取出來，才能量。', 'Take the paper out of the tank before measuring.')); return; }
    if (lane < 0 || lane > 2) return;
    acted();
    const m = P.measureAt(snap, lane, z);
    if (!m) { setStatus(T(LANES[lane] + ' 道這裡看不到斑點。', 'No visible spot here in lane ' + LANES[lane] + '.')); return; }
    const d = P.roundRuler(m.z - run.o.z0);
    const dup = meas.find(function (q) { return q.paper === paperId && q.lane === lane && Math.abs(q.z - m.z) < 0.06; });
    if (dup) { setStatus(T('這個斑點量過了：', 'Already measured: ') + measText(dup)); return; }
    const sp = m.dom === 'pen' ? snap.pen : snap.lanes[lane].spots.find(function (q) { return q.id === m.dom; });
    const rec = { paper: paperId, lane: lane, key: snap.lanes[lane].key, z: m.z, d: d, dom: m.dom, purity: m.purity, rfTrue: sp ? sp.rf : null,
      od: m.od, ranOff: snap.ranOff, submerged: snap.submerged, lidClosedAll: run.lidClosedAll, solvent: run.o.solvent, phi: run.o.phi,
      lidOpenAll: run.lidOpenAll, stalled: stalledNow(), color: mixColor(m.parts), n: meas.length + 1 };
    finishMeas(rec);
    meas.push(rec);
    const S = snd();
    if (S) S.tone({ freq: rec.Rf != null ? 400 + 600 * rec.Rf : 360, dur: 0.12, type: 'sine', gain: 0.12 });
    setStatus(measText(rec));
    emitMeas(rec);
    refreshAll();
  }
  /** 整段沒蓋、前緣停在蒸發與毛細上升平衡的高度 s∞（低於紙頂） */
  function stalledNow() {
    if (!run || !run.lidOpenAll) return false;
    const sI = P.sInf(run.sv);
    return sI < P.topS(run) - 0.3 && snap.s >= 0.98 * sI;
  }
  function measText(m) {
    const head = LANES[m.lane] + T(' 道斑點：離起始線 ', ' lane spot: ') + num(m.d, 2) + T(' cm', ' cm from the start line');
    if (m.Rf == null) return head + T('；還沒標記溶劑前緣，算不出 Rf。', '; the solvent front is not marked, so there is no Rf.');
    return head + T('，前緣 ', ', front ') + num(m.dF, 2) + ' cm，R<sub>f</sub> = ' + num(m.d, 2) + ' ÷ ' + num(m.dF, 2) + ' = <b>' + num(m.Rf, 3) + '</b>' +
      (m.ranOff ? T('（前緣跑出紙外，這個值不準）', ' (the front ran off the paper: not reliable)') : '');
  }

  // ======================= 主迴圈（只有一條 requestAnimationFrame） =======================
  let raf = 0, lastTs = 0, lastPaper = 0, lastPanel = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  function needAnim() {
    return state.running || Math.abs(lift - liftTarget) > 1e-3 || Math.abs(lidAnim - (state.lid && state.phase !== PH.out ? 1 : 0)) > 1e-3 ||
      (state.phase === PH.out && dryLeft > 0) || (!reducedMotion && state.phase === PH.run && state.lid && state.view === '2d');
  }
  function loop(ts) {
    raf = 0;
    const dtw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    // 吊起／放下濾紙、蓋子
    if (lift !== liftTarget) { const sp = 7 * dtw; lift = Math.abs(liftTarget - lift) <= sp ? liftTarget : lift + Math.sign(liftTarget - lift) * sp; }
    const lidT = state.lid && state.phase !== PH.out ? 1 : 0;
    if (lidAnim !== lidT) { const sp = 3 * dtw; lidAnim = Math.abs(lidT - lidAnim) <= sp ? lidT : lidAnim + Math.sign(lidT - lidAnim) * sp; }
    if (state.running && lift === 0) advance(dtw * SPEEDS[state.speed]);
    if (state.phase === PH.out && dryLeft > 0) {
      dryLeft = Math.max(0, dryLeft - dtw);
      if (dryLeft === 0 && frontMark == null) setStatus(T('濾紙乾了，溶劑前緣已經看不見。下一次取出後要立刻標記。', 'The paper has dried and the solvent front is gone. Next time mark it as soon as you take the paper out.'));
    }
    if (ts - lastPaper > 90 || !state.running) { renderPaper(); lastPaper = ts; }
    drawStage(ts);
    if (view3 && view3.active) view3.frame();
    if (ts - lastPanel > 250) { lastPanel = ts; updateReadouts(); updateWetbar(); if (state.running) drawGraph(); }
    if (needAnim()) raf = requestAnimationFrame(loop);
    else { lastTs = 0; updateReadouts(); updateWetbar(); refreshButtons(); }
  }
  function advance(dt) {
    if (dt <= 0) return;
    const before = snap;
    P.step(run, dt, state.lid);
    snap = P.snapshot(run);
    if (curCurve) {
      const last = curCurve.pts[curCurve.pts.length - 1];
      if (run.t - last[0] >= Math.max(2, run.t / 300)) curCurve.pts.push([run.t, Math.sqrt(run.u)]);
    }
    const S = snd();
    // 前緣經過起始線、每公分、跑出紙外
    if (!crossed && before && snap.dF > 0 && !snap.submerged) {
      crossed = true;
      if (S) S.tone({ freq: 660, dur: 0.12, gain: 0.1 });
      setStatus(T('前緣經過起始線：樣品開始被帶著往上走。', 'The front has passed the start line: the samples start to move.'));
    }
    const cm = Math.floor(Math.max(0, snap.dF));
    if (cm > lastCm) { lastCm = cm; if (S && !snap.ranOff) S.tone({ freq: 420 + 45 * cm, dur: 0.05, type: 'triangle', gain: 0.05 }); }
    if (snap.ranOff && !ranSaid) {
      ranSaid = true;
      if (S) S.sweep({ from: 620, to: 300, dur: 0.35, gain: 0.1, type: 'triangle' });
      setStatus('<span class="warn">' + T('溶劑前緣跑到濾紙上緣了！應該在前緣接近上緣之前取出濾紙。', 'The solvent front has reached the top of the paper! Take the paper out before this happens.') + '</span>');
    }
    if (snap.submerged && snap.frac < 0.2 && !dissolveSaid) {
      dissolveSaid = true;
      setStatus('<span class="warn">' + T('樣品幾乎全部溶進槽裡的展開液了，濾紙上什麼都沒留下。', 'Almost all the sample has dissolved into the solvent in the tank; nothing is left on the paper.') + '</span>');
    }
    if (run.t > 6 * 3600) { setRunning(false); setStatus(T('已經展開 6 小時，自動暫停。', 'Six hours of development: paused automatically.')); }
    if (userActed && window.LabMission && performance.now() - lastTick > 500) { lastTick = performance.now(); window.LabMission.emit('tick', tickData()); }
  }

  // ======================= 2D 畫面 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let G = null, dpr = 1;
  function resize() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const wide = w >= 640;
    const xL = -2.7, xR = 13.3, sceneW = xR - xL, sceneH = 21.6;
    const k = Math.min((h - 18) / sceneH, ((wide ? w * 0.68 : w) - 10) / sceneW);
    const ox = (wide ? 10 : (w - sceneW * k) / 2) - xL * k + (wide ? Math.max(0, w * 0.68 - sceneW * k - 10) / 2 : 0);
    const oy = h - 8 - 0.9 * k;
    G = { w: w, h: h, k: k, ox: ox, oy: oy, wide: wide };
    drawStage(performance.now());
  }
  function X_(x) { return G.ox + x * G.k; }
  function Y_(z) { return G.oy - z * G.k; }
  const TANK = { x0: -2.0, x1: 11.0, top: 20.0, wall: 0.32 };
  function liquidRGB() {
    return { mix: state.phi > 0.5 ? '#cfe3f0' : '#bcd9ee', salt: '#c3dcee', ace: '#dde9f0', pe: '#efe9cf' }[(run || {}).o ? run.o.solvent : state.solvent];
  }
  function drawStage(ts) {
    if (!G) return;
    const c = ctx, k = G.k;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(c, G.w, G.h);
    const sn = snap, o = run.o, L = lift;
    // ---- 實驗桌與陰影 ----
    const yb = Y_(-0.6);
    c.fillStyle = LD.alpha(col.text, col.dark ? 0.08 : 0.05);
    c.fillRect(0, yb, G.w, G.h - yb);
    c.strokeStyle = LD.alpha(col.text, 0.18); c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, Math.round(yb) + 0.5); c.lineTo(G.w, Math.round(yb) + 0.5); c.stroke();
    LD.contactShadow(c, X_(4.5), yb, 7.6 * k, 0);
    const tx0 = X_(TANK.x0), tx1 = X_(TANK.x1), ty0 = Y_(TANK.top), tyb = Y_(0);
    // ---- 展開槽的後壁（淡淡的玻璃色） ----
    const back = c.createLinearGradient(tx0, 0, tx1, 0);
    back.addColorStop(0, LD.alpha(col.glass, 0.10)); back.addColorStop(0.5, LD.alpha(col.glass, 0.04)); back.addColorStop(1, LD.alpha(col.glass, 0.12));
    c.fillStyle = back; c.fillRect(tx0, ty0, tx1 - tx0, tyb - ty0);
    // ---- 蒸氣（蓋著蓋子、展開中） ----
    if (state.phase === PH.run && state.lid && !reducedMotion) {
      const tt = ts / 1000;
      for (let b = 0; b < 4; b++) {
        const zb = o.zL + ((tt * 0.35 + b * 4.6) % 18.5);
        const a = 0.05 * Math.sin(Math.PI * (zb - o.zL) / 18.5);
        const g = c.createLinearGradient(0, Y_(zb + 1.4), 0, Y_(zb - 1.4));
        g.addColorStop(0, LD.alpha(col.glass, 0)); g.addColorStop(0.5, LD.alpha(col.glass, a)); g.addColorStop(1, LD.alpha(col.glass, 0));
        c.fillStyle = g; c.fillRect(tx0, Y_(zb + 1.4), tx1 - tx0, 2.8 * k);
      }
    } else if (state.phase === PH.run && state.lid) {
      c.fillStyle = LD.alpha(col.glass, 0.04); c.fillRect(tx0, ty0, tx1 - tx0, tyb - ty0);
    }
    // ---- 濾紙（含玻璃棒、夾子） ----
    const px0 = X_(0), pw = P.PAPER.W * k, pyTop = Y_(P.PAPER.H + L), ph = P.PAPER.H * k;
    c.save();
    c.shadowColor = LD.shadowInk(0.25); c.shadowBlur = 8; c.shadowOffsetY = 2;
    c.fillStyle = '#fff'; c.fillRect(px0, pyTop, pw, ph);
    c.restore();
    c.imageSmoothingEnabled = true;
    c.drawImage(paperCv, px0, pyTop, pw, ph);
    c.strokeStyle = LD.alpha('#000000', 0.12); c.lineWidth = 1; c.strokeRect(Math.round(px0) + 0.5, Math.round(pyTop) + 0.5, Math.round(pw) - 1, Math.round(ph) - 1);
    // 鉛筆起始線與道的記號
    const yz0 = Y_(o.z0 + L);
    if (!o.pen) {
      c.strokeStyle = LD.alpha(col.pencil, 0.75); c.lineWidth = Math.max(1, 0.035 * k); c.lineCap = 'round';
      c.beginPath(); c.moveTo(X_(0.35), yz0); c.lineTo(X_(P.PAPER.W - 0.35), yz0 + 0.3); c.stroke();
    }
    c.font = '600 ' + Math.max(10, Math.round(0.5 * k)) + 'px ' + LD.FONT;
    c.fillStyle = LD.alpha(col.pencil, 0.8); c.textAlign = 'center'; c.textBaseline = 'top';
    P.PAPER.lanes.forEach(function (x, i) { if (o.lanes[i] !== 'none') c.fillText(LANES[i], X_(x), yz0 + 0.18 * k); });
    // 溶劑前緣的鉛筆線
    if (frontMark != null) {
      const yf = Y_(frontMark + L);
      c.strokeStyle = LD.alpha(col.pencil, 0.85); c.lineWidth = Math.max(1, 0.03 * k); c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(X_(0.2), yf); c.lineTo(X_(P.PAPER.W - 0.2), yf); c.stroke(); c.setLineDash([]);
    }
    // 量過的斑點
    meas.forEach(function (m) {
      if (m.paper !== paperId || state.phase !== PH.out) return;
      const x = X_(P.PAPER.lanes[m.lane]), y = Y_(m.z + L), r = 0.18 * k;
      c.strokeStyle = LD.alpha(col.pencil, 0.95); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
    });
    // 玻璃棒與夾子
    const yr = Y_(P.PAPER.H + 0.75 + L);
    LD.tube(c, function (q) { q.moveTo(tx0 + 2, yr); q.lineTo(tx1 - 2, yr); }, col.dark ? '#b7c6d4' : '#c9d6e2', Math.max(4, 0.28 * k));
    const cw = 1.6 * k, chh = 1.0 * k, cx = X_(P.PAPER.W / 2);
    LD.block(c, cx - cw / 2, Y_(P.PAPER.H + 0.3 + L) - chh / 2, cw, chh, col.dark ? '#59606a' : '#3b4048', { r: 3 });
    c.strokeStyle = col.dark ? '#c9d0d8' : '#9aa3ad'; c.lineWidth = Math.max(1.5, 0.08 * k);
    c.beginPath(); c.moveTo(cx - cw * 0.3, Y_(P.PAPER.H + 0.3 + L) - chh / 2); c.lineTo(cx - cw * 0.15, yr); c.moveTo(cx + cw * 0.3, Y_(P.PAPER.H + 0.3 + L) - chh / 2); c.lineTo(cx + cw * 0.15, yr); c.stroke();
    // ---- 展開液（畫在濾紙前面，半透明） ----
    const yl = Y_(o.zL);
    const lg = c.createLinearGradient(0, yl, 0, tyb);
    const lc = liquidRGB();
    lg.addColorStop(0, LD.alpha(lc, 0.55)); lg.addColorStop(1, LD.alpha(LD.shade(lc, -0.15), 0.75));
    c.fillStyle = lg; c.fillRect(tx0, yl, tx1 - tx0, tyb - yl);
    if (sn.submerged && sn.frac < 1) {   // 溶進去的樣品
      const parts = [];
      sn.lanes.forEach(function (Ln) { Ln.spots.forEach(function (sp) { parts.push([sp.id, sp.amt / run.frac * (1 - run.frac)]); }); });
      let tot = 0; parts.forEach(function (q) { tot += q[1]; });
      if (tot > 0) { c.fillStyle = LD.alpha(mixColor(parts), Math.min(0.45, tot * 2.2)); c.fillRect(tx0, yl, tx1 - tx0, tyb - yl); }
    }
    // 液面與彎月面（在器壁與濾紙處往上彎）
    const men = 0.22 * k;
    c.strokeStyle = LD.alpha(LD.shade(lc, -0.35), 0.9); c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(tx0, yl - men); c.quadraticCurveTo(tx0 + men * 0.4, yl, tx0 + men * 2, yl);
    if (L < o.zL) { c.lineTo(px0 - men * 1.5, yl); c.quadraticCurveTo(px0 - men * 0.3, yl, px0, yl - men * 0.8); c.moveTo(px0 + pw, yl - men * 0.8); c.quadraticCurveTo(px0 + pw + men * 0.3, yl, px0 + pw + men * 1.5, yl); }
    c.lineTo(tx1 - men * 2, yl); c.quadraticCurveTo(tx1 - men * 0.4, yl, tx1, yl - men); c.stroke();
    c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.25 : 0.6); c.lineWidth = 1;
    c.beginPath(); c.moveTo(tx0 + men * 2, yl + 2); c.lineTo(tx1 - men * 2, yl + 2); c.stroke();
    // ---- 玻璃槽壁、底座 ----
    const wallW = TANK.wall * k;
    [tx0 - wallW, tx1].forEach(function (x, i) {
      const g = c.createLinearGradient(x, 0, x + wallW, 0);
      g.addColorStop(0, LD.alpha(col.glass, i ? 0.35 : 0.55)); g.addColorStop(0.5, LD.alpha('#ffffff', col.dark ? 0.15 : 0.45)); g.addColorStop(1, LD.alpha(col.glass, i ? 0.55 : 0.35));
      c.fillStyle = g; c.fillRect(x, ty0, wallW, tyb - ty0 + wallW);
    });
    const bg = c.createLinearGradient(0, tyb, 0, tyb + 0.6 * k);
    bg.addColorStop(0, LD.alpha(col.glass, 0.6)); bg.addColorStop(1, LD.alpha(col.glass, 0.35));
    c.fillStyle = bg; c.fillRect(tx0 - wallW, tyb, tx1 - tx0 + 2 * wallW, 0.6 * k);
    // 玻璃反光
    c.save();
    c.beginPath(); c.rect(tx0, ty0, tx1 - tx0, tyb - ty0); c.clip();
    c.fillStyle = LD.alpha('#ffffff', col.dark ? 0.05 : 0.18);
    c.beginPath(); c.moveTo(tx0 + 0.6 * k, ty0); c.lineTo(tx0 + 1.2 * k, ty0); c.lineTo(tx0 + 0.2 * k, tyb); c.lineTo(tx0 - 0.4 * k, tyb); c.fill();
    c.beginPath(); c.moveTo(tx1 - 2.4 * k, ty0); c.lineTo(tx1 - 2.0 * k, ty0); c.lineTo(tx1 - 3.0 * k, tyb); c.lineTo(tx1 - 3.4 * k, tyb); c.fill();
    c.restore();
    // ---- 蓋子（玻璃板），打開時滑到右邊 ----
    const lidX = (1 - lidAnim) * 6.5 * k;
    const lg2 = c.createLinearGradient(0, ty0 - 0.45 * k, 0, ty0);
    lg2.addColorStop(0, LD.alpha('#ffffff', col.dark ? 0.25 : 0.7)); lg2.addColorStop(1, LD.alpha(col.glass, 0.6));
    c.fillStyle = lg2;
    LD.roundRect(c, tx0 - wallW - 0.4 * k + lidX, ty0 - 0.42 * k, tx1 - tx0 + 2 * wallW + 0.8 * k, 0.42 * k, 3); c.fill();
    c.strokeStyle = LD.alpha(col.glass, 0.8); c.lineWidth = 1; c.stroke();
    // ---- 尺（零點對齊起始線） ----
    drawRuler(c, L);
    // ---- 標籤 ----
    const fs = Math.max(11, Math.round(0.56 * k));
    const font = '600 ' + fs + 'px ' + LD.FONT;
    // 展開液名稱：寬螢幕寫在右側欄，窄螢幕放在左上角時間的下面（不蓋住起始線的 A、B、C）
    if (!G.wide) LD.pill(c, solvName(o.solvent, o.phi), tx0 + 0.25 * k, ty0 + 0.9 * k + fs * 1.9, col.text, 'left', font);
    if (o.z0 <= o.zL) LD.pill(c, T('起始線在液面下！', 'Start line under the surface!'), X_(P.PAPER.W / 2), Y_(o.z0 + L) - 0.9 * k, col.pos, 'center', font);
    if (state.phase === PH.run && sn.t > 0) {
      const yF = Y_(sn.zF + L);
      LD.pill(c, T('前緣', 'front') + ' ' + num(Math.max(0, sn.dF), 1) + ' cm', X_(P.PAPER.W) - 0.15 * k, yF - 0.2 * k, sn.ranOff ? col.pos : col.accent, 'right', font);
    }
    if (frontMark != null && state.phase === PH.out) LD.pill(c, T('溶劑前緣', 'solvent front'), X_(P.PAPER.W) - 0.15 * k, Y_(frontMark + L) - 0.2 * k, col.text, 'right', font);
    if (state.phase === PH.out) {
      meas.forEach(function (m) {
        if (m.paper !== paperId) return;
        LD.pill(c, m.Rf != null ? 'R' + T('f', 'f') + ' ' + num(m.Rf, 2) : num(m.d, 2) + ' cm', X_(P.PAPER.lanes[m.lane]) + 0.3 * k, Y_(m.z + L) + 0.32 * k, m.Rf != null ? col.text : col.muted, 'left', font);
      });
    }
    if (!G.wide) {
      // 窄螢幕：左上角顯示時間
      LD.pill(c, 't = ' + clock(run.t), tx0 + 0.25 * k, ty0 + 0.9 * k, col.text, 'left', font);
    } else drawSide(c, fs);
    // 鍵盤焦點
    if (kb && kb.focused && kb.focused()) {
      const i = kb.index();
      const y = i === 0 ? Y_(o.z0 + L) : Y_(o.zL);
      c.strokeStyle = col.accent; c.lineWidth = 2; c.setLineDash([5, 4]);
      LD.roundRect(c, (i === 0 ? px0 : tx0) - 4, y - 8, (i === 0 ? pw : tx1 - tx0) + 8, 16, 6); c.stroke(); c.setLineDash([]);
    }
  }
  function drawRuler(c, L) {
    const k = G.k, x0 = X_(11.85), w = 1.05 * k, z0 = run.o.z0 + L;
    const zTop = Math.min(20.2, z0 + 15.5), zBot = z0 - 0.6;
    const g = c.createLinearGradient(x0, 0, x0 + w, 0);
    g.addColorStop(0, col.dark ? '#d9cfa6' : '#f3e6b4'); g.addColorStop(1, col.dark ? '#bfb48c' : '#e2d197');
    c.save();
    c.shadowColor = LD.shadowInk(0.2); c.shadowBlur = 5; c.shadowOffsetY = 1;
    c.fillStyle = g; LD.roundRect(c, x0, Y_(zTop), w, (zTop - zBot) * k, 3); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(60,50,20,0.75)'; c.fillStyle = 'rgba(60,50,20,0.9)';
    c.font = Math.max(9, Math.round(0.42 * k)) + 'px ' + LD.FONT; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let mm = -5; mm <= Math.floor((zTop - z0) * 10); mm++) {
      const y = Math.round(Y_(z0 + mm / 10)) + 0.5, len = mm % 10 === 0 ? 0.42 : mm % 5 === 0 ? 0.28 : 0.16;
      if (k < 16 && mm % 5 !== 0) continue;
      c.lineWidth = mm % 10 === 0 ? 1.2 : 0.8;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + len * k, y); c.stroke();
      if (mm % 10 === 0 && mm >= 0 && (mm / 10) % (k < 18 ? 2 : 1) === 0) c.fillText(String(mm / 10), x0 + w - 0.08 * k, y);
    }
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText('cm', x0 + w / 2, Y_(zTop) - 2);
  }
  /** 寬螢幕：右側列出三道的樣品與時間 */
  function drawSide(c, fs) {
    const x = G.w * 0.7, w = G.w - x - 12;
    let y = 16;
    c.textAlign = 'left'; c.textBaseline = 'top';
    c.font = '700 ' + (fs + 2) + 'px ' + LD.FONT; c.fillStyle = col.text;
    c.fillText('t = ' + clock(run.t), x, y); y += fs * 1.9;
    c.font = '600 ' + fs + 'px ' + LD.FONT;
    const st = state.phase === PH.setup ? T('準備中', 'ready') : state.phase === PH.out ? T('已取出', 'out of the tank') : state.running ? T('展開中', 'developing') : T('暫停', 'paused');
    c.fillStyle = col.muted; c.fillText(st + '・' + T('時間 ×', 'time ×') + SPEEDS[state.speed], x, y); y += fs * 1.5;
    c.fillStyle = col.text; c.fillText(T('展開液：', 'Solvent: ') + solvName(run.o.solvent, run.o.phi) + (run.o.lid ? '' : T('（沒蓋）', ' (no lid)')), x, y, w); y += fs * 2;
    run.o.lanes.forEach(function (key, i) {
      c.fillStyle = col.text; c.font = '700 ' + fs + 'px ' + LD.FONT;
      c.fillText(LANES[i] + T('　', '  ') + sampleName(key), x, y, w); y += fs * 1.5;
      c.font = (fs - 1) + 'px ' + LD.FONT;
      if (key === 'X') { c.fillStyle = col.muted; c.fillText(T('成分未知', 'unknown dyes'), x + fs, y, w - fs); y += fs * 1.4; }
      else P.sampleComps(key).forEach(function (q) {
        c.fillStyle = P.COMP[q[0]].col; c.beginPath(); c.arc(x + fs * 0.6, y + fs * 0.55, fs * 0.38, 0, Math.PI * 2); c.fill();
        c.fillStyle = col.muted; c.fillText(compName(q[0]), x + fs * 1.3, y, w - fs * 1.3); y += fs * 1.35;
      });
      y += fs * 0.5;
    });
    if (run.o.pen) { c.fillStyle = col.pos; c.fillText(T('起始線：原子筆', 'Start line: ballpoint pen'), x, y, w); }
  }

  // ======================= 圖表 =======================
  const gcv = $('gcv'), gx = gcv.getContext('2d');
  let gdpr = 1;
  function resizeGraph() {
    const w = gcv.clientWidth, h = gcv.clientHeight;
    if (!w || !h) return;
    gdpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gcv.width = Math.round(w * gdpr); gcv.height = Math.round(h * gdpr);
  }
  function niceStep(r) { const p = Math.pow(10, Math.floor(Math.log10(r / 5))), m = r / 5 / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  function axes(b, xr, yr, xlab, ylab, xfmt) {
    const c = gx;
    const X = function (v) { return b.x + (v - xr[0]) / (xr[1] - xr[0]) * b.w; };
    const Y = function (v) { return b.y + b.h - (v - yr[0]) / (yr[1] - yr[0]) * b.h; };
    c.font = '12px ' + LD.FONT; c.lineWidth = 1;
    const sx = niceStep(xr[1] - xr[0]), sy = niceStep(yr[1] - yr[0]);
    c.strokeStyle = LD.alpha(col.text, 0.1); c.fillStyle = col.muted;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = Math.ceil(xr[0] / sx) * sx; v <= xr[1] + 1e-9; v += sx) {
      const x = Math.round(X(v)) + 0.5;
      c.beginPath(); c.moveTo(x, b.y); c.lineTo(x, b.y + b.h); c.stroke();
      if (xfmt !== false) c.fillText(xfmt ? xfmt(v) : num(v, sx < 1 ? 1 : 0), x, b.y + b.h + 4);
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = Math.ceil(yr[0] / sy) * sy; v <= yr[1] + 1e-9; v += sy) {
      const y = Math.round(Y(v)) + 0.5;
      c.beginPath(); c.moveTo(b.x, y); c.lineTo(b.x + b.w, y); c.stroke();
      c.fillText(num(v, sy < 0.1 ? 2 : sy < 1 ? 1 : 0), b.x - 5, y);
    }
    c.strokeStyle = LD.alpha(col.text, 0.45);
    c.strokeRect(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5, Math.round(b.w), Math.round(b.h));
    c.fillStyle = col.text; c.textAlign = 'center'; c.textBaseline = 'bottom';
    if (xlab) c.fillText(xlab, b.x + b.w / 2, b.y + b.h + 34);
    if (ylab) { c.save(); c.translate(14, b.y + b.h / 2); c.rotate(-Math.PI / 2); c.textBaseline = 'middle'; c.fillText(ylab, 0, 0); c.restore(); }
    return { X: X, Y: Y };
  }
  function drawGraph() {
    const w = gcv.clientWidth, h = gcv.clientHeight;
    if (!w || !h) return;
    const c = gx;
    c.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = col.bg; c.fillRect(0, 0, w, h);
    const b = { x: 52, y: 14, w: w - 66, h: h - 58 };
    if (state.tab === 'front') drawFront(b);
    else if (state.tab === 'prof') drawProfile(b);
    else drawRf(b);
  }
  function drawFront(b) {
    const c = gx, sq = state.sq;
    let tmax = 60, ymax = 1;
    curves.forEach(function (cu) { cu.pts.forEach(function (p) { tmax = Math.max(tmax, p[0]); ymax = Math.max(ymax, sq ? p[1] * p[1] : p[1]); }); });
    const top = P.topS(run);
    ymax = Math.min(Math.max(ymax * 1.12, sq ? 4 : 2), sq ? 400 : 22);
    const A = axes(b, [0, tmax / 60 * 1.05], [0, ymax], T('時間 t（分鐘）', 'time t (min)'), sq ? T('s²（cm²）', 's² (cm²)') : T('前緣離液面 s（cm）', 'front above surface s (cm)'));
    // 濾紙上緣
    const yTop = sq ? top * top : top;
    if (yTop <= ymax) {
      c.strokeStyle = LD.alpha(col.pos, 0.7); c.setLineDash([6, 4]); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(b.x, A.Y(yTop)); c.lineTo(b.x + b.w, A.Y(yTop)); c.stroke(); c.setLineDash([]);
      LD.pill(c, T('濾紙上緣', 'top of paper'), b.x + 6, A.Y(yTop) - 3, col.pos, 'left', '11px ' + LD.FONT);
    }
    if (!run.o.lid && state.phase !== PH.setup) {
      const si = P.sInf(run.sv), ys = sq ? si * si : si;
      if (ys <= ymax) {
        c.strokeStyle = LD.alpha(col.accent, 0.7); c.setLineDash([2, 4]); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(b.x, A.Y(ys)); c.lineTo(b.x + b.w, A.Y(ys)); c.stroke(); c.setLineDash([]);
        LD.pill(c, 's∞ = ' + num(si, 2) + ' cm', b.x + b.w - 6, A.Y(ys) - 3, col.accent, 'right', '11px ' + LD.FONT);
      }
    }
    curves.forEach(function (cu, i) {
      const cur = cu === curCurve && state.phase !== PH.setup;
      c.strokeStyle = cur ? col.accent : LD.alpha(col.muted, 0.55 + 0.4 * i / Math.max(1, curves.length));
      c.lineWidth = cur ? 2.4 : 1.4; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      cu.pts.forEach(function (p, j) { const y = sq ? p[1] * p[1] : p[1]; const x = A.X(p[0] / 60), yy = A.Y(Math.min(y, ymax)); if (j) c.lineTo(x, yy); else c.moveTo(x, yy); });
      c.stroke();
      const lp = cu.pts[cu.pts.length - 1];
      if (cu.pts.length > 1) LD.pill(c, '#' + cu.id + ' ' + cu.solv, A.X(lp[0] / 60) - 4, A.Y(Math.min(sq ? lp[1] * lp[1] : lp[1], ymax)) - 4, cur ? col.accent : col.muted, 'right', '11px ' + LD.FONT);
    });
    if (!curves.length) { c.fillStyle = col.muted; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '13px ' + LD.FONT; c.fillText(T('按「放入展開槽」開始記錄', 'Press “Put into the tank” to start recording'), b.x + b.w / 2, b.y + b.h / 2); }
  }
  function drawProfile(b) {
    const c = gx, sn = snap, z0 = run.o.z0;
    const prof = [0, 1, 2].map(function (i) { return P.profile(sn, i, 0.02); });
    let ymax = 0.1;
    prof.forEach(function (p) { p.forEach(function (q) { ymax = Math.max(ymax, q[1]); }); });
    const A = axes(b, [-z0, P.PAPER.H - z0], [0, ymax * 1.1], T('離起始線的距離（cm）', 'distance from the start line (cm)'), T('顏色深淺（吸光度）', 'colour depth (absorbance)'));
    // 起始線與前緣
    c.strokeStyle = LD.alpha(col.pencil, 0.7); c.lineWidth = 1;
    c.beginPath(); c.moveTo(A.X(0), b.y); c.lineTo(A.X(0), b.y + b.h); c.stroke();
    if (sn.t > 0) {
      c.strokeStyle = LD.alpha(col.accent, 0.8); c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(A.X(sn.dF), b.y); c.lineTo(A.X(sn.dF), b.y + b.h); c.stroke(); c.setLineDash([]);
      LD.pill(c, T('前緣', 'front'), A.X(sn.dF) - 3, b.y + 14, col.accent, 'right', '11px ' + LD.FONT);
    }
    const dash = [[], [7, 4], [2, 3]];
    prof.forEach(function (p, i) {
      if (run.o.lanes[i] === 'none' && !sn.pen) return;
      c.strokeStyle = col.lane[i]; c.lineWidth = 2; c.setLineDash(dash[i]); c.lineJoin = 'round';
      c.beginPath();
      p.forEach(function (q, j) { const x = A.X(q[0] - z0), y = A.Y(q[1]); if (j) c.lineTo(x, y); else c.moveTo(x, y); });
      c.stroke(); c.setLineDash([]);
      // 每個看得出來的斑點畫上它的顏色
      P.peaks(sn, i).forEach(function (pk) {
        const m = P.odAt(sn, i, pk.z);
        LD.ball(c, A.X(pk.z - z0), A.Y(pk.od), 5, mixColor(m.parts));
      });
    });
  }
  function drawRf(b) {
    const c = gx;
    const pts = meas.filter(function (m) { return m.Rf != null; });
    // x：乙醇百分比 0–100，右邊另外三欄：食鹽水、丙酮、石油醚＋丙酮
    const cat = { salt: 112, ace: 124, pe: 136 };
    const A = axes(b, [-4, 142], [0, 1], T('展開液', 'solvent'), 'Rf', function (v) { return v <= 100 ? num(v, 0) + '%' : ''; });
    c.fillStyle = col.muted; c.font = '11px ' + LD.FONT; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText(T('乙醇體積百分比', '% ethanol by volume'), A.X(50), b.y + b.h + 18);
    [['salt', T('鹽水', 'salt')], ['ace', T('丙酮', 'acet.')], ['pe', T('石油醚', 'PE')]].forEach(function (q) { c.fillText(q[1], A.X(cat[q[0]]), b.y + b.h + 4); });
    c.strokeStyle = LD.alpha(col.text, 0.3);
    c.beginPath(); c.moveTo(A.X(106), b.y); c.lineTo(A.X(106), b.y + b.h); c.stroke();
    pts.forEach(function (m) {
      const x = A.X(m.solvent === 'mix' ? m.phi * 100 : cat[m.solvent]), y = A.Y(Math.min(1, m.Rf));
      LD.ball(c, x, y, m.valid ? 6 : 4.5, m.color);
      if (!m.valid) { c.strokeStyle = col.pos; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, 7.5, 0, Math.PI * 2); c.stroke(); }
    });
    if (!pts.length) { c.fillStyle = col.muted; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '13px ' + LD.FONT; c.fillText(T('量到的 Rf 會畫在這裡', 'Measured Rf values appear here'), b.x + b.w / 2, b.y + b.h / 2); }
  }
  function updateGraphText() {
    const lg = $('gLegend'), hint = $('gHint');
    $('sqRow').hidden = state.tab !== 'front';
    if (state.tab === 'front') {
      lg.innerHTML = '<span><i class="ln" style="background:' + col.accent + '"></i>' + T('這一張濾紙', 'this paper') + '</span> <span><i class="ln" style="background:' + col.muted + '"></i>' + T('之前的濾紙', 'earlier papers') + '</span>';
      hint.innerHTML = state.sq ? T('s² 對 t 是直線（斜率 D）：前緣高度和 √t 成正比。沒蓋蓋子時曲線會往下彎、趨近 s∞²。', 's² against t is a straight line (slope D): the height grows like √t. With the lid off the line bends over towards s∞².') :
        T('前緣越爬越慢：爬兩倍高要四倍時間。', 'The front slows down as it climbs: twice the height takes four times as long.');
    } else if (state.tab === 'prof') {
      lg.innerHTML = [0, 1, 2].filter(function (i) { return run.o.lanes[i] !== 'none'; }).map(function (i) {
        return '<span><i class="ln" style="background:' + col.lane[i] + '"></i>' + LANES[i] + ' ' + sampleName(run.o.lanes[i]) + '</span>';
      }).join(' ');
      const parts = [];
      [0, 1, 2].forEach(function (i) {
        if (run.o.lanes[i] === 'none') return;
        const pk = P.peaks(snap, i).length, pr = P.pairs(snap, i);
        parts.push(LANES[i] + T(' 道看得出 ', ': ') + pk + T(' 個斑點', pk === 1 ? ' spot' : ' spots') + (pr.minRs != null && snap.t > 0 ? T('，相鄰成分最小 R', ', smallest R') + '<sub>s</sub> = ' + num(pr.minRs, 2) : ''));
      });
      hint.innerHTML = parts.join(T('；', '; ')) + (parts.length ? T('。', '.') : '') + ' ' + T('R<sub>s</sub> ≥ 1.5 時完全分開。', 'R<sub>s</sub> ≥ 1.5 means completely separated.');
    } else {
      lg.innerHTML = '<span>' + T('實心點：可靠的量測；紅圈：前緣跑出紙外或起始線泡水，不可靠。', 'Filled dots: reliable; red ring: the front ran off or the start line was under the solvent.') + '</span>';
      hint.innerHTML = T('同一種物質在不同展開液中的 R<sub>f</sub> 不同；在水＋乙醇中，兩種物質可能交換上下位置。', 'The same substance has different R<sub>f</sub> values in different solvents; in water + ethanol two substances can swap places.');
    }
  }

  // ======================= 面板 =======================
  function updateReadouts() {
    if (!run) return;
    const sn = snap, sv = run.sv, out = [];
    const s = Math.sqrt(run.u), eps = run.o.lid ? 0 : sv.eps;
    const v = s > 0 ? (sv.D - 2 * eps * run.u) / (2 * s) * 60 : null;
    out.push([T('展開時間', 'Development time'), state.phase === PH.setup ? '—' : clock(run.t)]);
    out.push([T('前緣離液面 s', 'Front above surface s'), state.phase === PH.setup ? '—' : num(sn.s, 2) + ' cm']);
    out.push([T('前緣離起始線 d<sub>f</sub>', 'Front from start line d<sub>f</sub>'), state.phase === PH.setup ? '—' : sn.dF > 0 ? num(sn.dF, 2) + ' cm' : T('還沒到', 'not yet')]);
    out.push([T('前緣上升速度', 'Speed of the front'), state.phase === PH.run && v != null && !sn.ranOff ? sigf(Math.max(0, v), 3) + ' cm/min' : '—']);
    out.push([T('毛細係數 D<small>s² = D·t</small>', 'Capillary coefficient D<small>s² = D·t</small>'), sigf(sv.D, 3) + ' cm²/s']);
    if (!run.o.lid) out.push([T('沒蓋時前緣的極限 s∞', 'Limit with lid off s∞'), num(P.sInf(sv), 2) + ' cm']);
    let st;
    if (state.phase === PH.setup) st = T('準備中（濾紙吊在液面上方）', 'Ready (paper above the solvent)');
    else if (state.phase === PH.out) st = T('已取出', 'Out of the tank') + (frontMark != null ? T('，前緣已標記', ', front marked') : dryLeft > 0 ? T('，前緣還看得見', ', front still visible') : T('，濾紙已乾', ', paper dry'));
    else st = state.running ? T('展開中', 'Developing') : T('暫停', 'Paused');
    if (sn.ranOff && state.phase !== PH.setup) st += T('（前緣跑出紙外）', ' (front ran off)');
    if (sn.submerged && state.phase !== PH.setup) st += T('（樣品溶進展開液）', ' (sample dissolving)');
    out.push([T('狀態', 'Status'), st]);
    $('readout').innerHTML = out.map(function (q) { return '<dt>' + q[0] + '</dt><dd>' + q[1] + '</dd>'; }).join('');
  }
  function updateSolvInfo() {
    const sv = P.solvent(state.solvent, state.phi);
    const t10 = sigf(P.timeTo(sv, 10) / 60, 2), g = num(sv.gamma, 1), e = num(sv.eta, 2), pol = num(sv.ETN, 2);
    $('solvInfo').innerHTML = T('表面張力 γ = ' + g + ' mN/m，黏度 η = ' + e + ' mPa·s，極性 E<sub>T</sub><sup>N</sup> ≈ ' + pol + '。蓋著蓋子時，前緣爬 10 cm 約需 ' + t10 + ' 分鐘。',
      'Surface tension γ = ' + g + ' mN/m, viscosity η = ' + e + ' mPa·s, polarity E<sub>T</sub><sup>N</sup> ≈ ' + pol + '. With the lid on the front climbs 10 cm in about ' + t10 + ' min.') +
      (state.solvent === 'pe' ? T('（石油醚是沸點低的烷類混合物，性質接近己烷。）', ' (Petroleum ether is a mixture of low-boiling alkanes, much like hexane.)') : '');
  }
  function updateWetbar() {
    const on = state.phase === PH.out && dryLeft > 0 && frontMark == null;
    $('wetbar').hidden = !on;
    if (on) $('wetfill').style.width = (100 * dryLeft / dryTotal).toFixed(1) + '%';
  }
  function updateSpotButtons() {
    const box = $('spotBtns');
    if (state.phase !== PH.out) {
      box.innerHTML = '';
      $('spotHint').textContent = T('先把濾紙從展開槽取出來。', 'Take the paper out of the tank first.');
      $('measOut').innerHTML = '';
      return;
    }
    $('spotHint').textContent = frontMark == null ? T('先標記溶劑前緣，再點斑點。', 'Mark the solvent front, then tap the spots.') : T('點一個斑點，用尺量它的中心。', 'Tap a spot to measure its centre with the ruler.');
    let h = '';
    [0, 1, 2].forEach(function (i) {
      P.peaks(snap, i).forEach(function (pk, j) {
        const m = P.odAt(snap, i, pk.z);
        const done = meas.some(function (q) { return q.paper === paperId && q.lane === i && Math.abs(q.z - pk.z) < 0.06; });
        h += '<button type="button" data-lane="' + i + '" data-z="' + pk.z.toFixed(3) + '" aria-pressed="' + done + '" aria-label="' + LANES[i] + T(' 道第 ', ' lane spot ') + (j + 1) + T(' 個斑點', '') + '"><i style="background:' + mixColor(m.parts) + '"></i>' + LANES[i] + (j + 1) + '</button>';
      });
    });
    box.innerHTML = h || '<span class="hint">' + T('看不到任何斑點。', 'No visible spots.') + '</span>';
    box.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { measure(+b.dataset.lane, +b.dataset.z); }); });
    const last = meas.filter(function (q) { return q.paper === paperId; }).slice(-1)[0];
    $('measOut').innerHTML = last ? measText(last) : '';
  }
  function buildTable() {
    const el = $('tbl');
    let h = '<thead><tr><th>#</th><th>' + T('濾紙', 'Paper') + '</th><th class="l">' + T('道／樣品', 'Lane / sample') + '</th><th class="l">' + T('展開液', 'Solvent') + '</th><th>d<sub>s</sub><br><small>cm</small></th><th>d<sub>f</sub><br><small>cm</small></th><th>R<sub>f</sub></th></tr></thead><tbody>';
    if (!meas.length) h += '<tr class="empty"><td colspan="7">' + T('取出濾紙、標記前緣後，點斑點量 Rf，結果會列在這裡。', 'Take the paper out, mark the front and tap the spots: the results are listed here.') + '</td></tr>';
    meas.forEach(function (m, i) {
      h += '<tr><td>' + (i + 1) + '</td><td>#' + m.paper + '</td><td class="l"><i style="background:' + m.color + '"></i>' + LANES[m.lane] + ' ' + sampleName(m.key) + '</td><td class="l">' + solvShort(m.solvent, m.phi) +
        '</td><td>' + num(m.d, 2) + '</td><td>' + (m.dF != null ? num(m.dF, 2) : '—') + '</td><td>' + (m.Rf != null ? (m.valid ? '<b>' + num(m.Rf, 3) + '</b>' : '<span class="warn">' + num(m.Rf, 3) + '</span>') : '—') + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }
  function refreshButtons() {
    const ph = state.phase;
    $('play').textContent = ph === PH.run ? (state.running ? T('暫停', 'Pause') : T('繼續展開', 'Continue')) : ph === PH.out ? T('再做一張', 'Another paper') : T('放入展開槽', 'Put into the tank');
    $('take').disabled = ph !== PH.run;
    $('mark').disabled = !(ph === PH.out && frontMark == null);
  }
  function refreshAll() {
    refreshOutputs();
    refreshButtons();
    updateReadouts();
    updateSolvInfo();
    updateWetbar();
    updateSpotButtons();
    buildTable();
    updateGraphText();
    if (view3 && view3.active && view3.onState) view3.onState();
    renderPaper();
    drawStage(performance.now());
    drawGraph();
  }

  // ======================= 未知樣品 X =======================
  function buildX() {
    $('xGrid').innerHTML = P.DYES.map(function (id) {
      return '<label><input type="checkbox" data-x="' + id + '"><i style="background:' + P.COMP[id].col + '"></i><span>' + compName(id) + '</span></label>';
    }).join('');
  }
  function checkX() {
    acted();
    const pick = [];
    document.querySelectorAll('#xGrid input').forEach(function (b) { if (b.checked) pick.push(b.dataset.x); });
    if (!pick.length) { $('xOut').textContent = T('先勾選你認為 X 含有的色素。', 'Tick the dyes you think X contains.'); return; }
    xState.tries++;
    const ok = pick.slice().sort().join() === X.slice().sort().join();
    const S = snd();
    if (S) { if (ok) { S.tone({ freq: 784, dur: 0.1, gain: 0.14 }); S.tone({ freq: 1047, dur: 0.16, gain: 0.12, delay: 0.09 }); } else S.sweep({ from: 392, to: 262, dur: 0.25, gain: 0.12, type: 'triangle' }); }
    $('xOut').innerHTML = ok ? '<span class="ok">' + T('答對了！', 'Correct!') + '</span> ' + T('X 含有：', 'X contains: ') + X.map(compName).join(T('、', ', ')) + T('。', '.') :
      '<span class="no">' + T('不對。', 'Not right.') + '</span> ' + (xState.ran ? T('比較 X 和標準品的斑點：顏色相同、R<sub>f</sub> 也相同才算同一種。換一種展開液再比對一次會更有把握。', 'Compare the spots of X with the standards: the same colour and the same R<sub>f</sub>. A second solvent makes it more certain.') :
        T('先把 X 和標準品點在同一張濾紙上展開（前緣至少走 3 cm）。', 'First develop X next to the standards on the same paper (let the front travel at least 3 cm).'));
    if (window.LabMission) window.LabMission.emit('identify', { ok: ok, revealed: xState.revealed, tries: xState.tries, ran: xState.ran });
  }
  function revealX() {
    acted();
    xState.revealed = true;
    $('xOut').innerHTML = T('答案：X 含有 ', 'Answer: X contains ') + X.map(compName).join(T('、', ', ')) + T('。這個 X 已揭曉，換一個再挑戰。', '. This X is revealed; try another one.');
  }
  function newX() {
    acted();
    let nx;
    do { nx = P.makeUnknown((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0); } while (nx.join() === X.join() && Math.random() < 0.9);
    X = nx;
    xState = { tries: 0, revealed: false, ran: false };
    document.querySelectorAll('#xGrid input').forEach(function (b) { b.checked = false; });
    $('xOut').textContent = T('換了一個新的 X。', 'A new X is ready.');
    if (state.lanes.indexOf('X') >= 0) { if (state.phase === PH.setup) { newRun(); refreshAll(); } else newPaper(T('換了新的 X：換一張新濾紙。', 'New X: here is a fresh paper.')); }
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const b = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(b + 'three.module.min.js'), import(b + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function host3Api() {
    return {
      T: T, host: host3, PAPER: P.PAPER, TANK: TANK,
      paper: function () { return paperCv; }, paperVer: function () { return paperVer; },
      geo: function () { return { zL: run.o.zL, z0: run.o.z0, lift: lift, lid: lidAnim, liquid: liquidRGB(), pen: run.o.pen, phase: state.phase, frontMark: frontMark }; },
      colors: function () { return col; },
      hud: function () {
        return { tl: 't = ' + clock(run.t) + (state.phase === PH.run ? (state.running ? '' : T('（暫停）', ' (paused)')) : state.phase === PH.out ? T('（已取出）', ' (out)') : T('（準備中）', ' (ready)')),
          tr: solvName(run.o.solvent, run.o.phi) + (state.phase !== PH.setup && snap.dF > 0 ? ' · d<sub>f</sub> = ' + num(snap.dF, 2) + ' cm' : '') };
      },
      animating: needAnim,
      contextLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
    };
  }
  function setPressed(m) { $('view2d').setAttribute('aria-pressed', String(m === '2d')); $('view3d').setAttribute('aria-pressed', String(m === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.Chrom3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Chrom3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.frame();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
      kick();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }

  // ======================= 操作 =======================
  /** 改了濾紙或展開液的設定 */
  function setupChanged(msg) {
    if (state.phase === PH.setup) { newRun(); liftTarget = raised(); if (reducedMotion) lift = liftTarget; refreshAll(); kick(); }
    else newPaper(msg || T('改了設定：換一張新的濾紙，照新的設定點樣。', 'Settings changed: a fresh paper has been spotted with the new settings.'));
  }
  ['A', 'B', 'C'].forEach(function (L, i) {
    const sel = $('lane' + L);
    sel.innerHTML = Object.keys(P.SAMPLES).map(function (k) { return '<option value="' + k + '">' + sampleName(k) + '</option>'; }).join('');
    sel.value = state.lanes[i];
    sel.addEventListener('change', function () { acted(); state.lanes[i] = sel.value; setupChanged(); });
  });
  function onSlider(el) {
    if (syncing) return;
    const v = val(el);
    if (el === elSpot) { if (v === state.spot) return; state.spot = v; }
    else if (el === elZ0) { if (v === state.z0) return; state.z0 = v; }
    else if (el === elZL) { if (v === state.zL) return; state.zL = v; }
    else if (el === elPhi) { if (v / 100 === state.phi) return; state.phi = v / 100; }
    acted();
    setupChanged();
  }
  [elSpot, elZ0, elZL, elPhi].forEach(function (el) { el.addEventListener('input', function () { onSlider(el); }); });
  $('pen').addEventListener('change', function () { acted(); state.pen = $('pen').checked; setupChanged(); });
  $('lid').addEventListener('change', function () {
    acted();
    state.lid = $('lid').checked;
    if (state.phase === PH.run) {
      if (run.o.lid !== state.lid) P.step(run, 0, state.lid);
      setStatus(state.lid ? T('蓋上蓋子：槽內的蒸氣飽和，濾紙不再蒸發。', 'Lid on: the tank fills with vapour and the paper stops evaporating.') :
        T('打開蓋子：濾紙上的展開液開始蒸發。', 'Lid off: the solvent starts to evaporate from the paper.'));
    } else if (state.phase === PH.setup) newRun();
    refreshAll();
    kick();
  });
  document.querySelectorAll('#solvSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      if (b.dataset.solv === state.solvent) return;
      state.solvent = b.dataset.solv;
      document.querySelectorAll('#solvSeg button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); });
      $('phiRow').hidden = state.solvent !== 'mix';
      setupChanged();
    });
  });
  $('play').addEventListener('click', function () {
    acted();
    if (state.phase === PH.run) setRunning(!state.running);
    else start();
  });
  $('take').addEventListener('click', takeOut);
  $('mark').addEventListener('click', markFront);
  $('newPaper').addEventListener('click', function () { acted(); newPaper(T('換了一張新濾紙。', 'A fresh paper.')); });
  $('clearAll').addEventListener('click', function () {
    acted();
    meas = []; curves = [];
    if (state.phase === PH.run && curCurve) curves.push(curCurve); else curCurve = null;
    setStatus(T('已清除量測紀錄與圖表。', 'Measurements and graphs cleared.'));
    refreshAll();
  });
  [0, 1, 2].forEach(function (k) {
    $('sp' + k).addEventListener('click', function () {
      acted(); state.speed = k;
      [0, 1, 2].forEach(function (j) { $('sp' + j).setAttribute('aria-pressed', String(j === k)); });
      drawStage(performance.now());
    });
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
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') { resize(); drawGraph(); }
  });
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.tab = b.dataset.tab;
      document.querySelectorAll('#tabs button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); });
      updateGraphText(); drawGraph();
    });
  });
  $('sq').addEventListener('change', function () { acted(); state.sq = $('sq').checked; updateGraphText(); drawGraph(); });
  $('xCheck').addEventListener('click', checkX);
  $('xReveal').addEventListener('click', revealX);
  $('xNew').addEventListener('click', newX);
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // 畫布：準備時拖曳起始線或液面；取出後點斑點量測
  let drag = null;
  function canvasXY(ev) { const b = cv.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; }
  function hitSetup(x, y) {
    if (state.phase !== PH.setup || !G) return null;
    if (x >= X_(0) - 6 && x <= X_(P.PAPER.W) + 6 && Math.abs(y - Y_(state.z0 + lift)) < 14) return 'z0';
    if (x >= X_(TANK.x0) && x <= X_(TANK.x1) && Math.abs(y - Y_(state.zL)) < 14) return 'zL';
    return null;
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = canvasXY(ev);
    const h = hitSetup(p[0], p[1]);
    if (h) { drag = h; cv.setPointerCapture(ev.pointerId); ev.preventDefault(); return; }
    if (state.phase === PH.out && G) {
      const xc = (p[0] - G.ox) / G.k, zc = (G.oy - p[1]) / G.k - lift;
      if (xc >= 0 && xc <= P.PAPER.W && zc >= 0 && zc <= P.PAPER.H) { const ln = laneAt(xc); if (ln >= 0) measure(ln, zc); }
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = canvasXY(ev);
    if (!drag) {
      const h = hitSetup(p[0], p[1]);
      cv.style.cursor = h ? 'ns-resize' : state.phase === PH.out && G && p[0] >= X_(0) && p[0] <= X_(P.PAPER.W) ? 'crosshair' : '';
      return;
    }
    const z = (G.oy - p[1]) / G.k;
    if (drag === 'z0') setVal(elZ0, Math.max(0.5, Math.min(4, Math.round((z - lift) * 10) / 10)));
    else setVal(elZL, Math.max(0.2, Math.min(3, Math.round(z * 10) / 10)));
  });
  function endDrag() { drag = null; }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('展開槽畫面。準備時按 Enter 切換起始線或液面，上下方向鍵移動，Shift 加方向鍵移動得更多。', 'Developing tank. Before a run, press Enter to pick the start line or the solvent surface; the up and down arrows move it; hold Shift for bigger steps.'),
      items: [
        { name: function () { return T('起始線', 'Start line'); },
          move: function (dx, dy, big) { if (!dy || state.phase !== PH.setup) return false; setVal(elZ0, Math.max(0.5, Math.min(4, state.z0 + dy * (big ? 0.5 : 0.1)))); return true; },
          describe: function () { return T('起始線離濾紙下緣 ', 'Start line ') + num(state.z0, 1) + T(' cm', ' cm above the lower edge'); } },
        { name: function () { return T('展開液液面', 'Solvent surface'); },
          move: function (dx, dy, big) { if (!dy || state.phase !== PH.setup) return false; setVal(elZL, Math.max(0.2, Math.min(3, state.zL + dy * (big ? 0.5 : 0.1)))); return true; },
          describe: function () { return T('展開液深度 ', 'Solvent depth ') + num(state.zL, 1) + ' cm'; } }
      ],
      onChange: function () { drawStage(performance.now()); }
    });
  }

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    for (const k in absCache) delete absCache[k];
    if (view3 && view3.active) view3.onTheme();
    refreshAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', function () { resize(); resizeGraph(); drawGraph(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastTs = 0; kick(); } });

  // 測試用（Playwright）
  window.__pc = {
    state: state, run: function () { return run; }, snap: function () { return snap; }, meas: function () { return meas; },
    X: function () { return X.slice(); }, xState: function () { return xState; }, frontMark: function () { return frontMark; },
    dry: function () { return dryLeft; }, advance: function (sec) { if (state.phase === PH.run) { advance(sec); refreshAll(); } },
    measure: measure, takeOut: takeOut, markFront: markFront
  };

  // ======================= 啟動 =======================
  readColors();
  buildX();
  $('phiRow').hidden = state.solvent !== 'mix';
  newRun();
  lift = liftTarget = raised();
  updateSoundButton();
  resize();
  resizeGraph();
  refreshAll();
  setStatus(T('按「放入展開槽」開始展開。', 'Press “Put into the tank” to start.'));
})();
