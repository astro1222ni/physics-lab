/*
 * stoichiometry.js — 「化學計量與限量試劑」的頁面程式（錐形瓶與排水集氣的 2D 畫面、放大鏡讀刻度、體積—時間圖、
 * 鹽酸量—產量圖、分析卡、結果表、任務事件）。化學核心在 js/stoichiometry-core.js（StoichCore）。
 * 氣泡、鎂帶的摺法、量筒移動的動畫只是示意；氫氣的量、量筒內外的水面、刻度與讀數都直接來自核心的計算。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'tick'：每 0.5 秒 { seg, runId, started, ended, t, V（量筒內氣體的真實體積 mL）, escaped, aligned, cap }
 *   'done'：反應結束（氣泡停止）{ seg, runId, lim（'Mg'／'HCl'／'both'）, m, c, VHCl, polished, nMg, nHCl, ratio（HCl ÷ Mg 莫耳數比）,
 *            T, P, cyl, cap, V, nGas（量筒內氫氣 mol）, nTheo（理論產量 mol）, escaped, tEnd }
 *   'analyze'：按「計算」{ seg, runId, ended, lim, limPick, reading, Vtrue, div, cap, readErr（|讀數 − 真實|，以最小刻度為單位）,
 *            onScale, valid（反應結束、沒有冒走、讀數在刻度內且差 ≤ 0.5 格）, aligned, vap, polished, T, P, Pw,
 *            m, c, VHCl, nTheo, nHCl, M, Merr, cHCl, cErr, Vm, VmErr, escaped }
 */
(function () {
  'use strict';
  const S = window.StoichCore, LD = window.LabDraw;
  if (!S || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const SPEEDS = [1, 4, 16, 64];
  const FONT = LD.FONT;

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
    return num(x, Math.max(0, Math.min(8, (sig || 3) - 1 - e)));
  }
  function signed(x, d) { return (x > 0 ? '+' : '') + num(x, d); }
  function pct(x) { return x == null || !isFinite(x) ? '—' : signed(x * 100, Math.abs(x) < 0.01 ? 2 : 1) + '%'; }
  /** 科學記號（HTML，上標用 <sup>） */
  function sci(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 4) return sigf(x, sig);
    let m = x / Math.pow(10, e);
    let ms = m.toFixed((sig || 3) - 1);
    let ee = e;
    if (Math.abs(parseFloat(ms)) >= 10) { ee = e + 1; ms = (x / Math.pow(10, ee)).toFixed((sig || 3) - 1); }
    return num(parseFloat(ms), (sig || 3) - 1) + ' × 10<sup>' + (ee < 0 ? '−' + (-ee) : ee) + '</sup>';
  }
  function parseNum(s) {
    s = String(s || '').normalize('NFKC').replace(/[，,]/g, '.').replace(/[−–—]/g, '-').replace(/\s+/g, '').replace(/ml$/i, '');
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
  }
  /** 化學式：數字變下標（HTML） */
  function fH(s) { return s.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>'); }

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk,
      water: dk ? '#3d6f8c' : '#a8d3ea', waterDeep: dk ? '#2a5068' : '#7fb8d8', acid: dk ? '#3f7f8c' : '#9ccfe6',
      glass: dk ? '#a9c3cf' : '#6f8c9b', gas: dk ? 'rgba(220,235,245,0.10)' : 'rgba(255,255,255,0.55)',
      mg: dk ? '#d9dee4' : '#b9c1ca', mgDark: dk ? '#7b848e' : '#79828c', oxide: dk ? '#8d8a80' : '#8e8a7d',
      rubber: dk ? '#6b4b45' : '#7d4e45', steel: dk ? '#aeb6bf' : '#7e8790', wood: dk ? '#3a3128' : '#d9c6a6', woodDark: dk ? '#2a231c' : '#b89f7b',
      bubble: dk ? 'rgba(235,245,255,0.75)' : 'rgba(255,255,255,0.9)', h2: c.accent
    };
  }

  // ======================= 狀態 =======================
  const state = { speed: 1, tab: 'vt', lim: 'Mg', running: false, cyl: 100, aligned: false };
  let run = null, rows = [], lastRowT = -1, runId = 0, seg = 0;
  let results = [], doneRuns = [];
  let userActed = false, syncing = false;
  let dropAnim = -1, dropStart = 0;      // 鎂帶落入的動畫（真實時間）
  let lastStep5 = 0, wasFull = false;
  let dispOff = null;                    // 量筒顯示位置（cm，動畫用）
  let fBubbles = [], tBubbles = [], eBubbles = [], fAcc = 0, tAcc = 0;

  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const el = { mass: $('mass'), conc: $('conc'), vol: $('vol'), temp: $('temp'), pres: $('pres'), polished: $('polished'), vap: $('vap'), inV: $('inV') };
  const statusEl = $('status');
  function val(e) { return window.LabNum ? window.LabNum.value(e) : +e.value; }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function setStatus(s) { statusEl.textContent = s || ''; }
  function acted() { userActed = true; }

  function runOpts() {
    return { m: val(el.mass), c: val(el.conc), V: val(el.vol), T: val(el.temp), P: val(el.pres), cyl: state.cyl, polished: el.polished.checked };
  }
  /** 新的一次實驗（設定保留）：新的鎂帶與鹽酸，量筒裝滿水 */
  function newRun() {
    run = S.createRun(runOpts());
    S.setAligned(run, state.aligned);
    runId++;
    rows = [[0, 0]]; lastRowT = 0;
    state.running = false;
    dropAnim = -1; lastStep5 = 0; wasFull = false;
    fBubbles = []; tBubbles = []; eBubbles = [];
    dispOff = null;
    $('calcOut').innerHTML = '';
    if (cw) layout();
    updatePlay();
  }
  function C() { return S.CYLINDERS[run.o.cyl]; }

  // ======================= 主迴圈（只有一條 requestAnimationFrame） =======================
  let raf = 0, lastTs = 0, lastRead = 0, phase = 0;
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    const dtw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dtw > 0) {
      if (state.running) advance(dtw * SPEEDS[state.speed]);
      if (!reducedMotion) { phase += dtw; stepBubbles(dtw); }
      if (dropAnim >= 0) { dropAnim = Math.min(1, (performance.now() - dropStart) / 600); if (dropAnim >= 1) dropAnim = -1; }
      stepOffset(dtw);
    }
    const now = performance.now();
    if (now - lastRead > 250) { lastRead = now; updateReadouts(); drawGraph(); }
    drawStage();
    if (state.running || dropAnim >= 0 || offMoving() || (!reducedMotion && (fBubbles.length || tBubbles.length || eBubbles.length))) raf = requestAnimationFrame(loop);
  }
  /** 模擬時間前進 dt 秒 */
  function advance(dt) {
    const before = S.nGas(run);
    S.step(run, dt);
    const t = run.t, V = S.gas(run).V;
    if (t - lastRowT >= Math.max(0.25, t / 400) || run.ended) { rows.push([t, V]); lastRowT = t; }
    afterAdvance(before);
  }
  function afterAdvance() {
    const g = S.gas(run), C0 = C();
    const stepV = C0.div * 5;
    const k = Math.floor(g.V / stepV);
    if (k > lastStep5) { lastStep5 = k; if (snd()) window.LabSound.tone({ freq: Math.min(1300, 420 + g.V / C0.cap * 620), dur: 0.05, gain: 0.05, type: 'sine' }); }
    if (run.escaped && !wasFull) {
      wasFull = true;
      setStatus(T('量筒裝滿了！多出來的氣體從筒口冒走，收集不到。', 'The cylinder is full! The extra gas bubbles out of its mouth and is lost.'));
      if (snd()) { window.LabSound.sweep({ from: 520, to: 280, dur: 0.35, gain: 0.07, type: 'triangle' }); window.LabSound.noise({ dur: 0.2, gain: 0.08, filter: 900, q: 0.8 }); }
    }
    if (run.ended && state.running) {
      state.running = false;
      updatePlay();
      onEnded();
    }
  }
  function onEnded() {
    rows.push([run.t, S.gas(run).V]);
    const A = run.A, g = S.gas(run);
    const d = {
      seg: seg, runId: runId, lim: A.lim, m: run.o.m, c: run.o.c, VHCl: run.o.V, polished: run.o.polished, nMg: A.nMg, nHCl: A.nHCl, ratio: A.ratio,
      T: run.o.T, P: run.o.P, cyl: run.o.cyl, cap: C().cap, V: g.V, nGas: S.nGas(run), nTheo: A.xiMax, escaped: run.escaped, tEnd: run.tEnd
    };
    doneRuns.push(d);
    const leftTxt = A.lim === 'Mg' ? T('鎂帶完全溶解，鹽酸有剩。', 'The ribbon is gone; acid is left over.')
      : A.lim === 'HCl' ? T('鹽酸用完了，還剩下一段鎂帶。', 'The acid is used up; some ribbon is left.')
      : T('鎂帶與鹽酸剛好同時用完。', 'The ribbon and the acid ran out together.');
    setStatus(T('反應結束：氣泡不再產生。', 'Reaction over: no more bubbles. ') + leftTxt + (run.escaped ? T('（有氣體從量筒冒走了）', ' (Some gas escaped from the cylinder.)') : state.aligned ? '' : T('讀數前記得「對齊液面」。', ' Remember to “Level the water” before reading.')));
    if (snd()) { window.LabSound.tone({ freq: 660, dur: 0.12, gain: 0.07 }); window.LabSound.tone({ freq: 990, dur: 0.2, gain: 0.07, delay: 0.13 }); }
    if (userActed && window.LabMission) window.LabMission.emit('done', d);
    refreshAll();
  }

  // ======================= 操作 =======================
  function togglePlay() {
    if (run.ended) { changed(T('新的一次實驗：換新的鎂帶與鹽酸。', 'New run: fresh ribbon and acid.')); }
    if (!run.started) {
      S.start(run);
      state.running = true;
      dropAnim = 0; dropStart = performance.now();
      setStatus(T('鎂帶放進鹽酸，塞緊瓶塞：開始冒出氫氣。', 'The ribbon drops into the acid and the stopper is pushed in: hydrogen starts bubbling.'));
      if (snd()) { window.LabSound.sweep({ from: 1000, to: 420, dur: 0.12, gain: 0.07, type: 'sine' }); window.LabSound.sweep({ from: 800, to: 360, dur: 0.1, gain: 0.05, type: 'sine', delay: 0.09 }); }
    } else {
      state.running = !state.running;
      setStatus(state.running ? '' : T('已暫停。', 'Paused.'));
    }
    updatePlay();
    startLoop();
  }
  function skipToEnd() {
    acted();
    if (run.ended) return;
    if (!run.started) { S.start(run); dropAnim = 0; dropStart = performance.now(); }
    state.running = true;
    const target = run.tEnd;
    // 分段前進，讓體積—時間圖有完整的曲線
    const n = 160, t0 = run.t;
    for (let i = 1; i <= n && !run.ended; i++) {
      const t = t0 + (target - t0) * i / n;
      const before = S.nGas(run);
      S.setTime(run, t);
      rows.push([run.t, S.gas(run).V]); lastRowT = run.t;
      afterAdvance(before);
    }
    if (!run.ended) { S.setTime(run, target); afterAdvance(); }
    updatePlay(); refreshAll(); startLoop();
  }
  function setAligned(on) {
    acted();
    state.aligned = !!on;
    const before = S.nGas(run);
    S.setAligned(run, state.aligned);
    $('alignBtn').setAttribute('aria-pressed', String(state.aligned));
    if (S.nGas(run) < before - 1e-15 && !wasFull) { wasFull = true; }
    setStatus(state.aligned ? T('量筒上下移動，內外水面一樣高：量筒內氣體的壓力等於大氣壓。', 'The cylinder has been moved until the water levels inside and outside match: the gas is at atmospheric pressure.')
      : T('量筒夾回原來的位置：筒內水面比外面高，氣體壓力小於大氣壓。', 'The cylinder is clamped back in its first position: the water inside is higher, so the gas is below atmospheric pressure.'));
    if (snd()) window.LabSound.sweep({ from: state.aligned ? 300 : 520, to: state.aligned ? 520 : 300, dur: 0.25, gain: 0.05, type: 'triangle' });
    refreshAll(); startLoop();
  }
  function changed(msg) {
    acted();
    newRun();
    setStatus(msg == null ? T('設定已改變：重新開始一次實驗。', 'Settings changed: a new run.') : msg);
    refreshAll();
  }
  function updatePlay() {
    const b = $('play');
    b.textContent = !run.started ? T('開始反應', 'Start') : run.ended ? T('再做一次', 'Again') : state.running ? T('暫停', 'Pause') : T('繼續', 'Resume');
    $('skipEnd').disabled = run.ended;
  }

  // ======================= 分析 =======================
  function calc() {
    acted();
    const out = $('calcOut');
    const reading = parseNum(el.inV.value);
    if (!run.started) { out.innerHTML = '<span class="warn">' + T('先按「開始反應」收集氫氣。', 'Press “Start” first to collect some hydrogen.') + '</span>'; return; }
    if (!(reading > 0) || reading > 1000) { out.innerHTML = '<span class="warn">' + T('請在「量筒讀數」填入從放大鏡讀到的體積（mL）。', 'Type the volume you read in the magnifier into “Cylinder reading” (mL).') + '</span>'; el.inV.focus(); return; }
    const o = run.o, g = S.gas(run), C0 = C();
    const a = S.analyze(o, { reading: reading, lim: state.lim, vap: el.vap.checked });
    const readErr = Math.abs(reading - g.V) / C0.div;
    const onScale = S.onScale(o.cyl, g.V);
    const valid = run.ended && !run.escaped && onScale && readErr <= 0.5;
    const L = [];
    L.push(T('T = ', 'T = ') + num(o.T, 1) + ' + 273.15 = ' + num(a.TK, 2) + ' K');
    L.push(el.vap.checked
      ? 'P(H<sub>2</sub>) = P − P(H<sub>2</sub>O) = ' + num(o.P, 1) + ' − ' + num(a.Pw, 2) + ' = ' + num(a.PH2, 2) + ' mmHg'
      : 'P(H<sub>2</sub>) = P = ' + num(o.P, 1) + ' mmHg' + T('（沒有扣除水蒸氣壓）', ' (vapour pressure not subtracted)'));
    L.push('n(H<sub>2</sub>) = PV/RT = ' + num(a.PH2, 2) + ' × ' + sigf(reading, 4) + ' ÷ (62363.6 × ' + num(a.TK, 2) + ') = ' + sci(a.nH2, 4) + ' mol');
    L.push('V<sub>STP</sub> = ' + sigf(reading, 4) + ' × (' + num(a.PH2, 2) + ' ÷ 760) × (273.15 ÷ ' + num(a.TK, 2) + ') = ' + num(a.Vstp, 2) + ' mL');
    let good = false;
    if (state.lim === 'Mg') {
      L.push('n(Mg) = ' + sigf(o.m, 4) + ' ÷ 24.305 = ' + sci(a.nMgS, 4) + ' mol');
      L.push(T('莫耳體積 V<sub>m</sub> = V<sub>STP</sub> ÷ n(Mg) = ', 'Molar volume V<sub>m</sub> = V<sub>STP</sub> ÷ n(Mg) = ') + '<span class="res">' + num(a.Vm, 3) + ' L/mol</span>' + T('（公認值 22.414，誤差 ', ' (accepted 22.414, error ') + pct(a.VmErr) + T('）', ')'));
      L.push(T('鎂的原子量 = m ÷ n(H<sub>2</sub>) = ', 'Atomic mass of Mg = m ÷ n(H<sub>2</sub>) = ') + '<span class="res">' + num(a.M, 3) + '</span>' + T('（公認值 24.305，誤差 ', ' (accepted 24.305, error ') + pct(a.Merr) + T('）', ')'));
      good = Math.abs(a.Merr) <= 0.02;
    } else {
      L.push('n(HCl) = ' + sigf(o.c, 4) + ' M × ' + sigf(o.V, 4) + ' mL = ' + sci(a.nHClS, 4) + ' mol');
      L.push(T('莫耳體積 V<sub>m</sub> = V<sub>STP</sub> ÷ (n(HCl) ÷ 2) = ', 'Molar volume V<sub>m</sub> = V<sub>STP</sub> ÷ (n(HCl) ÷ 2) = ') + '<span class="res">' + num(a.Vm, 3) + ' L/mol</span>' + T('（誤差 ', ' (error ') + pct(a.VmErr) + T('）', ')'));
      L.push(T('鹽酸濃度 = 2n(H<sub>2</sub>) ÷ V = ', 'Concentration of the acid = 2n(H<sub>2</sub>) ÷ V = ') + '<span class="res">' + num(a.cHCl, 4) + ' M</span>' + T('（標示 ', ' (label ') + num(o.c, 3) + ' M' + T('，誤差 ', ', error ') + pct(a.cErr) + T('）', ')'));
      good = Math.abs(a.cErr) <= 0.02;
    }
    L.push(T('產率 = ', 'Yield = ') + num(a.yieldPct, 1) + '%');
    const W = [];
    if (!run.ended) W.push(T('反應還沒結束（還在冒泡），氫氣還沒收集完。', 'The reaction is not over yet (still bubbling): not all the hydrogen has been collected.'));
    if (run.escaped) W.push(T('有氣體從量筒冒走了，收集到的比產生的少。', 'Some gas escaped from the cylinder, so you collected less than was made.'));
    if (!state.aligned) W.push(T('量筒內外液面不相平：氣體壓力不等於大氣壓。', 'The water levels are not equal: the gas is not at atmospheric pressure.'));
    if (!onScale) W.push(g.V < C0.low ? T('氣體體積在最低刻度以下，讀不準：換小一點的量筒或多放一點鎂。', 'The gas is below the lowest mark and cannot be read well: use a smaller cylinder or more magnesium.') : T('氣體超出刻度範圍。', 'The gas is beyond the scale.'));
    else if (readErr > 0.5) W.push(T('你的讀數和刻度對不太上，再仔細看一次放大鏡（讀彎月面最低點）。', 'Your reading does not match the scale; look at the magnifier again (read the bottom of the meniscus).'));
    if (a.yieldPct > 103) W.push(T('產率超過 100%，限量試劑選對了嗎？', 'A yield above 100%: did you pick the right limiting reactant?'));
    out.innerHTML = L.join('<br>') + (W.length ? '<br><span class="warn">' + W.join('<br>') + '</span>' : '');
    results.push({
      seg: seg, runId: runId, m: o.m, c: o.c, V: o.V, T: o.T, P: o.P, cyl: o.cyl, reading: reading, aligned: state.aligned, vap: el.vap.checked,
      lim: state.lim, M: a.M, cHCl: a.cHCl, Vm: a.Vm, err: state.lim === 'Mg' ? a.Merr : a.cErr, VmErr: a.VmErr
    });
    renderTable();
    if (snd()) {
      if (good) { window.LabSound.tone({ freq: 784, dur: 0.1, gain: 0.08 }); window.LabSound.tone({ freq: 1175, dur: 0.18, gain: 0.08, delay: 0.11 }); }
      else window.LabSound.tone({ freq: 392, dur: 0.16, gain: 0.07, type: 'triangle' });
    }
    if (userActed && window.LabMission) window.LabMission.emit('analyze', {
      seg: seg, runId: runId, ended: run.ended, lim: run.A.lim, limPick: state.lim, reading: reading, Vtrue: g.V, div: C0.div, cap: C0.cap,
      readErr: readErr, onScale: onScale, valid: valid, aligned: state.aligned, vap: el.vap.checked, polished: o.polished,
      T: o.T, P: o.P, Pw: S.vapor(o.T), m: o.m, c: o.c, VHCl: o.V, nTheo: run.A.xiMax, nHCl: run.A.nHCl,
      M: a.M, Merr: a.Merr, cHCl: a.cHCl, cErr: a.cErr, Vm: a.Vm, VmErr: a.VmErr, escaped: run.escaped
    });
  }
  function renderTable() {
    const t = $('tbl');
    let h = '<thead><tr><th>#</th><th>Mg<br><small>g</small></th><th>HCl<br><small>' + T('mL × M', 'mL × M') + '</small></th><th>T<br><small>°C</small></th><th>P<br><small>mmHg</small></th>'
      + '<th>' + T('讀數', 'Reading') + '<br><small>mL</small></th><th>' + T('對齊', 'Level') + '</th><th>' + T('扣 P(H<sub>2</sub>O)', '− P(H<sub>2</sub>O)') + '</th>'
      + '<th>' + T('結果', 'Result') + '</th><th>V<sub>m</sub><br><small>L/mol</small></th><th>' + T('誤差', 'Error') + '</th></tr></thead><tbody>';
    const list = results.filter(function (r) { return r.seg === seg; });
    if (!list.length) h += '<tr class="empty"><td colspan="11">' + T('還沒有結果：反應結束後讀出量筒刻度，在「分析」卡按「計算」。', 'No results yet: when the reaction is over, read the cylinder and press “Calculate” in the “Analysis” card.') + '</td></tr>';
    list.forEach(function (r, i) {
      const res = r.lim === 'Mg' ? T('原子量 ', 'Mg ') + num(r.M, 3) : 'c = ' + num(r.cHCl, 3) + ' M';
      h += '<tr><td>' + (i + 1) + '</td><td>' + num(r.m, 4) + '</td><td>' + sigf(r.V, 3) + ' × ' + num(r.c, 2) + '</td><td>' + num(r.T, 1) + '</td><td>' + num(r.P, 0) + '</td><td>' + sigf(r.reading, 4)
        + '</td><td>' + (r.aligned ? '✓' : '✗') + '</td><td>' + (r.vap ? '✓' : '✗') + '</td><td class="l">' + res + '</td><td>' + num(r.Vm, 3) + '</td><td>' + pct(r.err) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }

  // ======================= 讀數卡 =======================
  function updateReadouts() {
    const A = run.A, g = S.gas(run), lf = S.left(run), C0 = C();
    const pr = run.tEnd > 0 && A.xiMax > 0 ? Math.min(1, run.nMade / A.xiMax) : 0;
    const vRound = Math.round(g.V / C0.div) * C0.div;
    const vTxt = !run.started ? T('（還沒開始）', '(not started)') : g.V < C0.low ? T('低於最低刻度', 'below the lowest mark') : g.V > C0.cap ? T('超出刻度', 'beyond the scale') : T('約 ', 'about ') + num(vRound, C0.div < 1 ? 1 : 0) + ' mL';
    const items = [
      [T('時間', 'Time'), num(run.t, run.t < 100 ? 1 : 0) + ' s'],
      [T('反應進度', 'Progress'), num(pr * 100, 1) + '%' + (run.ended ? T('（結束）', ' (over)') : '')],
      [T('鎂', 'Magnesium') + '<small>' + T('莫耳數（當成純鎂）', 'amount (taken as pure Mg)') + '</small>', sci(run.o.m / S.M_MG, 4) + ' mol'],
      [T('HCl', 'HCl') + '<small>' + T('莫耳數 = 濃度 × 體積', 'amount = concentration × volume') + '</small>', sci(A.nHCl, 4) + ' mol'],
      [T('剩下的鎂', 'Magnesium left'), num(lf.mMg, 4) + ' g'],
      [T('剩下的 HCl', 'HCl left'), sci(lf.nHCl, 3) + ' mol'],
      [T('量筒內的氣體', 'Gas in the cylinder') + '<small>' + T('精確讀數請看放大鏡', 'read the magnifier for the exact value') + '</small>', vTxt],
      [T('內外液面差 h', 'Level difference h') + '<small>' + T('筒內水面比外面高', 'water inside above outside') + '</small>', state.aligned ? T('0（已對齊）', '0 (levelled)') : num(g.h, 1) + ' cm'],
      [T('量筒內氣體的壓力', 'Pressure of the gas'), num(g.Pgas, 1) + ' mmHg'],
      [T('水的飽和蒸氣壓', 'Vapour pressure of water') + '<small>' + num(run.o.T, 1) + ' °C</small>', num(g.Pw, 2) + ' mmHg'],
      [T('氫氣的分壓', 'Partial pressure of H<sub>2</sub>'), num(g.Pdry, 1) + ' mmHg']
    ];
    $('readout').innerHTML = items.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
  }

  // ======================= 版面 =======================
  let cw = 0, ch = 0, dpr = 1, G = null;
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 560 ? Math.round(Math.max(470, w * 1.3)) : 440;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout();
    resizeGraph();
    drawStage(); drawGraph();
  }
  function layout() {
    const narrow = cw < 560, C0 = C();
    const pad = narrow ? 8 : 12;
    const benchY = ch - (narrow ? 26 : 32);
    const fx = narrow ? cw * 0.17 : cw * 0.15;
    const fbw = narrow ? Math.min(44, cw * 0.12) : Math.min(66, cw * 0.09);
    const fbh = narrow ? 88 : 122, fnw = narrow ? 11 : 15, fnh = narrow ? 26 : 34;
    const tx0 = narrow ? cw * 0.38 : cw * 0.36, tx1 = narrow ? cw * 0.85 : cw * 0.78;
    const depth = C0.Lin + 2.5;
    const s = Math.min(narrow ? 11 : 12, (benchY - 8 - (narrow ? 34 : 30)) / (C0.Htop + depth));   // px/cm（量筒與水槽）
    const topY = benchY - 8 - s * (C0.Htop + depth);
    const waterY = topY + C0.Htop * s;
    const cx = tx0 + (tx1 - tx0) * 0.56;
    const rimY = waterY - 1.5 * s;
    const neckTop = benchY - fbh - fnh;
    const yUp = Math.min(rimY - (narrow ? 14 : 20), neckTop - 18);
    const mw = narrow ? Math.min(150, cw * 0.36) : Math.min(200, tx0 - pad - 16), mh = Math.max(96, Math.min(narrow ? 140 : 160, yUp - 12 - pad));
    G = {
      narrow: narrow, pad: pad, benchY: benchY, fx: fx, fbw: fbw, fbh: fbh, fnw: fnw, fnh: fnh,
      neckTop: benchY - fbh - fnh, kf: fbw * 2 / 8.5,
      tx0: tx0, tx1: tx1, topY: topY, s: s, waterY: waterY, rimY: rimY, tBot: benchY - 6, yUp: yUp,
      cx: cx, rIn: C0.d / 2 * s, wall: Math.max(2, Math.min(3.2, s * 0.22)),
      rodX: Math.min(cw - 10, tx1 + (narrow ? 16 : 30)),
      mx: pad, my: pad + (narrow ? 0 : 0), mw: mw, mh: mh
    };
  }
  /** 量筒頂端（內側，量筒底部）在水面上方幾 cm：沒對齊時是 Htop；對齊時是氣柱長 V/A */
  function targetOff() {
    const g = S.gas(run), C0 = C();
    return state.aligned ? g.V / C0.A : C0.Htop;
  }
  function stepOffset(dt) {
    const tgt = targetOff();
    if (dispOff == null || reducedMotion) { dispOff = tgt; return; }
    const k = 1 - Math.exp(-dt * 9);
    dispOff += (tgt - dispOff) * k;
    if (Math.abs(tgt - dispOff) < 0.005) dispOff = tgt;
  }
  function offMoving() { return dispOff != null && Math.abs(targetOff() - dispOff) > 0.005; }

  // ======================= 畫面 =======================
  function flaskPath(c, ins) {
    const g = G, x = g.fx, b = g.benchY - 2 - ins, R = g.fbw - ins, r = g.fnw - ins, top = g.benchY - g.fbh, nt = g.neckTop - 2;
    c.beginPath();
    c.moveTo(x - r, nt);
    c.lineTo(x - r, top);
    c.lineTo(x - R + 6, b - 8);
    c.quadraticCurveTo(x - R, b, x - R + 10, b);
    c.lineTo(x + R - 10, b);
    c.quadraticCurveTo(x + R, b, x + R - 6, b - 8);
    c.lineTo(x + r, top);
    c.lineTo(x + r, nt);
  }
  /** 錐形瓶液面高度（px）：把瓶身當成圓錐台，體積照比例 */
  function liquidHeight(Vml) {
    const g = G, R = g.fbw - 3, r = g.fnw - 3, H = g.fbh;
    const vol = function (y) { const a = (R - r) / H; return Math.PI * (R * R * y - R * a * y * y + a * a * y * y * y / 3); };
    const target = Math.min(0.92, Vml / 70) * vol(H);   // 瓶身當成約 70 mL（示意）
    let lo = 0, hi = H;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (vol(m) < target) lo = m; else hi = m; }
    return lo;
  }
  function halfWidthAt(y) {   // 瓶身內半寬（y 從瓶底往上，px）
    const g = G; return (g.fbw - 3) - ((g.fbw - g.fnw) * y / g.fbh);
  }
  /** 鎂帶的折線：長度 len（px），在 (x0, y) 附近摺成 Z 字形 */
  function ribbonPath(len, cxr, yb, hang) {
    const pts = [];
    if (len <= 0.5) return pts;
    const seg = hang ? Math.min(G.fbh * 0.38, 46) : Math.max(24, G.fbw * 1.25);
    let left = len, i = 0, x = cxr - (hang ? 0 : Math.min(seg, len) / 2), y = yb;
    pts.push([x, y]);
    while (left > 0.01 && i < 12) {
      const L = Math.min(seg, left);
      if (hang) { y += L; x += (i % 2 ? -3 : 3); }
      else { x += (i % 2 ? -1 : 1) * L * 0.97; y -= L * 0.06 + 1.6; }
      pts.push([x, y]);
      left -= L; i++;
    }
    return pts;
  }
  function drawStage() {
    if (!G) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(c, cw, ch);
    drawBench(c);
    drawStand(c);
    drawTroughBack(c);
    drawCylinder(c);
    drawTube(c);
    drawTroughFront(c);
    drawThermo(c);
    drawFlask(c);
    drawLevelMarks(c);
    drawMagnifier(c);
    drawLabels(c);
    if (kb && kb.focused()) {
      c.save(); c.strokeStyle = col.accent; c.setLineDash([5, 4]); c.lineWidth = 1.5;
      LD.roundRect(c, 3, 3, cw - 6, ch - 6, 10); c.stroke(); c.restore();
    }
  }
  function drawBench(c) {
    const y = G.benchY;
    const g = c.createLinearGradient(0, y, 0, ch);
    g.addColorStop(0, LD.shade(col.wood, 0.08)); g.addColorStop(0.18, col.wood); g.addColorStop(1, col.woodDark);
    c.fillStyle = g; c.fillRect(0, y, cw, ch - y);
    c.fillStyle = LD.alpha('#ffffff', col.dark ? 0.12 : 0.5); c.fillRect(0, y, cw, 1);
    c.fillStyle = LD.shadowInk(0.12); c.fillRect(0, y + 1, cw, 1);
  }
  function drawStand(c) {
    const g = G, x = g.rodX;
    // 底座
    LD.contactShadow(c, x - 6, g.benchY, 34, 0);
    LD.block(c, x - 34, g.benchY - 8, 52, 8, col.steel, { r: 3 });
    // 鐵棒
    const rg = c.createLinearGradient(x - 3, 0, x + 3, 0);
    rg.addColorStop(0, LD.shade(col.steel, -0.25)); rg.addColorStop(0.4, LD.shade(col.steel, 0.45)); rg.addColorStop(1, LD.shade(col.steel, -0.35));
    c.fillStyle = rg; c.fillRect(x - 3, 10, 6, g.benchY - 18);
  }
  function cylGeom() {
    const g = G, C0 = C();
    const off = dispOff == null ? targetOff() : dispOff;
    const yTop = g.waterY - off * g.s;                  // 筒內頂端（量筒底的內面）
    const yMouth = yTop + C0.Lin * g.s;
    const gs = S.gas(run);
    const yMen = yTop + (gs.V / C0.A) * g.s;              // 彎月面最低點
    return { yTop: yTop, yMouth: yMouth, yMen: yMen, x0: g.cx - g.rIn, x1: g.cx + g.rIn, gas: gs };
  }
  function drawTroughBack(c) {
    const g = G;
    const x0 = g.tx0, x1 = g.tx1, y0 = g.rimY - 0.6 * g.s, y1 = g.tBot;
    LD.contactShadow(c, (x0 + x1) / 2, g.benchY, (x1 - x0) * 0.55, 0);
    // 後壁的玻璃
    c.fillStyle = LD.alpha(col.glass, col.dark ? 0.08 : 0.06);
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
    // 水
    const wg = c.createLinearGradient(0, g.waterY, 0, y1);
    wg.addColorStop(0, LD.alpha(col.water, col.dark ? 0.55 : 0.55));
    wg.addColorStop(1, LD.alpha(col.waterDeep, col.dark ? 0.75 : 0.7));
    c.fillStyle = wg;
    c.fillRect(x0 + 2, g.waterY, x1 - x0 - 4, y1 - g.waterY - 2);
    // 水面（後緣的亮線）
    c.fillStyle = LD.alpha(col.water, 0.9);
    c.beginPath(); c.ellipse((x0 + x1) / 2, g.waterY, (x1 - x0) / 2 - 2, Math.max(2, g.s * 0.35), 0, Math.PI, 0); c.fill();
  }
  function drawTroughFront(c) {
    const g = G;
    const x0 = g.tx0, x1 = g.tx1, y0 = g.rimY - 0.6 * g.s, y1 = g.tBot;
    c.save();
    c.lineWidth = 2;
    c.strokeStyle = LD.alpha(col.glass, col.dark ? 0.85 : 0.75);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y1); c.lineTo(x1, y1); c.lineTo(x1, y0); c.stroke();
    c.fillStyle = LD.alpha(col.glass, 0.5); c.fillRect(x0, y1, x1 - x0, 4);
    // 前緣水面線（輕微波動，只是裝飾）
    c.strokeStyle = LD.alpha(col.dark ? '#cfe8f5' : '#ffffff', col.dark ? 0.5 : 0.85);
    c.lineWidth = 1.4;
    c.beginPath();
    for (let x = x0 + 2; x <= x1 - 2; x += 4) {
      const cg = cylGeom();
      if (x > cg.x0 - G.wall - 1 && x < cg.x1 + G.wall + 1) { c.moveTo(x + 4, g.waterY); continue; }
      const yy = g.waterY + (reducedMotion ? 0 : Math.sin(x * 0.07 + phase * 2.2) * 0.6);
      if (x === x0 + 2) c.moveTo(x, yy); else c.lineTo(x, yy);
    }
    c.stroke();
    // 玻璃高光
    c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.18 : 0.6); c.lineWidth = 2;
    c.beginPath(); c.moveTo(x0 + 5, y0 + 6); c.lineTo(x0 + 5, y1 - 8); c.stroke();
    c.restore();
  }
  function drawCylinder(c) {
    const g = G, C0 = C(), cg = cylGeom(), w = g.wall;
    const x0 = cg.x0, x1 = cg.x1;
    // 量筒的底座（倒過來在上面）
    const footW = g.rIn * 2 + 16, footH = Math.max(5, g.s * 0.55);
    LD.block(c, g.cx - footW / 2, cg.yTop - w - footH, footW, footH, LD.mix(col.glass, col.bg, 0.45), { r: 3 });
    // 筒內：氣體與水
    c.save();
    c.beginPath(); c.rect(x0, cg.yTop, x1 - x0, cg.yMouth - cg.yTop); c.clip();
    // 水（筒內）
    const wg = c.createLinearGradient(x0, 0, x1, 0);
    wg.addColorStop(0, LD.alpha(col.waterDeep, 0.75)); wg.addColorStop(0.45, LD.alpha(col.water, 0.62)); wg.addColorStop(1, LD.alpha(col.waterDeep, 0.8));
    c.fillStyle = wg; c.fillRect(x0, cg.yMen - 4, x1 - x0, cg.yMouth - cg.yMen + 4);
    // 氣體
    c.fillStyle = col.bg; c.fillRect(x0, cg.yTop, x1 - x0, Math.max(0, cg.yMen - cg.yTop));
    c.fillStyle = col.gas; c.fillRect(x0, cg.yTop, x1 - x0, Math.max(0, cg.yMen - cg.yTop));
    // 彎月面（凹面，中間最低）
    const mh = Math.min(5, Math.max(2.5, g.s * 0.16));
    if (cg.yMen > cg.yTop + 1) {
      c.fillStyle = col.bg;
      c.beginPath(); c.moveTo(x0, cg.yMen - mh); c.quadraticCurveTo(g.cx, cg.yMen + mh, x1, cg.yMen - mh); c.lineTo(x1, cg.yMen - mh - 1); c.lineTo(x0, cg.yMen - mh - 1); c.closePath();
      c.fill();
      c.fillStyle = col.gas; c.fill();
      c.strokeStyle = LD.alpha(col.dark ? '#d9eef8' : '#3b6c88', 0.85); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x0, cg.yMen - mh); c.quadraticCurveTo(g.cx, cg.yMen + mh, x1, cg.yMen - mh); c.stroke();
    }
    // 筒內氣泡
    tBubbles.forEach(function (b) { drawBubble(c, b.x, b.y, b.r); });
    c.restore();
    // 刻度（主畫面只畫較粗的格；數字倒著寫，跟真的倒立量筒一樣）
    const step = C0.cap === 25 ? 1 : C0.cap === 100 ? 5 : 10, lab = C0.cap === 25 ? 5 : C0.cap === 100 ? 20 : 50;
    c.save();
    c.strokeStyle = LD.alpha(col.text, 0.55); c.lineWidth = 1;
    c.beginPath();
    for (let v = Math.ceil(C0.low / step) * step; v <= C0.cap + 1e-9; v += step) {
      const y = cg.yTop + v / C0.A * g.s, big = Math.abs(v / lab - Math.round(v / lab)) < 1e-9;
      c.moveTo(x0 + 1, Math.round(y) + 0.5); c.lineTo(x0 + (big ? g.rIn * 0.75 : g.rIn * 0.4), Math.round(y) + 0.5);
    }
    c.stroke();
    c.fillStyle = LD.alpha(col.text, 0.7);
    c.font = '600 ' + fsz(8.5).toFixed(1) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let v = Math.ceil(C0.low / lab) * lab; v <= C0.cap + 1e-9; v += lab) {
      const y = cg.yTop + v / C0.A * g.s;
      c.save(); c.translate(x0 + g.rIn * 1.25, y); c.rotate(Math.PI); c.fillText(String(v), 0, 0); c.restore();
    }
    c.restore();
    // 玻璃壁
    const gl = function (x) {
      const gg = c.createLinearGradient(x - w, 0, x + w, 0);
      gg.addColorStop(0, LD.alpha(col.glass, 0.5)); gg.addColorStop(0.5, LD.alpha('#ffffff', col.dark ? 0.25 : 0.75)); gg.addColorStop(1, LD.alpha(col.glass, 0.6));
      c.fillStyle = gg; c.fillRect(x - w / 2, cg.yTop - w, w, cg.yMouth - cg.yTop + w);
    };
    gl(x0 - w / 2); gl(x1 + w / 2);
    c.fillStyle = LD.alpha(col.glass, 0.7); c.fillRect(x0 - w, cg.yTop - w, x1 - x0 + 2 * w, w);
    // 筒口的唇
    c.fillStyle = LD.alpha(col.glass, 0.75);
    LD.roundRect(c, x0 - w - 2, cg.yMouth - 2, x1 - x0 + 2 * w + 4, 4, 2); c.fill();
    // 高光
    c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.2 : 0.55); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x1 - g.rIn * 0.35, cg.yTop + 4); c.lineTo(x1 - g.rIn * 0.35, cg.yMouth - 4); c.stroke();
    // 夾子
    const yc = cg.yTop + C0.Lin * g.s * 0.22;
    c.fillStyle = LD.shade(col.steel, -0.1);
    c.fillRect(x1 + w, yc - 3, g.rodX - x1 - w, 6);
    LD.block(c, x1 + w - 2, yc - 9, 10, 18, col.rubber, { r: 3 });
    LD.block(c, g.rodX - 7, yc - 8, 14, 16, LD.shade(col.steel, -0.2), { r: 3 });
    // 冒走的氣泡
    eBubbles.forEach(function (b) { drawBubble(c, b.x, b.y, b.r); });
  }
  function drawBubble(c, x, y, r) {
    c.fillStyle = col.bubble;
    c.strokeStyle = LD.alpha(col.dark ? '#e6f4ff' : '#4d7f9c', 0.7);
    c.lineWidth = 0.8;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = LD.alpha('#ffffff', 0.9);
    c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, Math.PI * 2); c.fill();
  }
  /** 導管：瓶塞 → 上 → 右 → 下到水裡（玻璃管），再接橡皮管到量筒口下方 */
  function tubePts() {
    const g = G, cg = cylGeom();
    const yUp = g.yUp;
    const xIn = g.tx0 + Math.max(16, (g.cx - g.rIn - g.tx0) * 0.35);
    const tipY = cg.yMouth - Math.min(8, g.s * 0.7);
    const glass = [[g.fx, g.neckTop + 6], [g.fx, yUp], [xIn, yUp], [xIn, g.waterY + 1.2 * g.s]];
    const bendY = Math.max(cg.yMouth + 14, g.waterY + 2 * g.s);
    const rub = [[xIn, g.waterY + 1.2 * g.s], [xIn, Math.min(g.tBot - 8, bendY)], [g.cx - g.rIn * 0.3, Math.min(g.tBot - 8, bendY)], [g.cx - g.rIn * 0.3, tipY]];
    return { glass: glass, rub: rub, tip: [g.cx - g.rIn * 0.3, tipY] };
  }
  function drawTube(c) {
    const tp = tubePts();
    const poly = function (pts) { return function (cc) { pts.forEach(function (p, i) { if (i) cc.lineTo(p[0], p[1]); else cc.moveTo(p[0], p[1]); }); }; };
    LD.tube(c, poly(tp.rub), col.rubber, 5);
    // 玻璃管：外壁亮、管內透明
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); poly(tp.glass)(c);
    c.strokeStyle = LD.alpha(col.glass, col.dark ? 0.9 : 0.85); c.lineWidth = 6; c.stroke();
    c.strokeStyle = LD.mix(col.bg, col.surface, 0.3); c.lineWidth = 3; c.stroke();
    c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.25 : 0.7); c.lineWidth = 1; c.translate(-0.8, -0.8); c.stroke();
    c.restore();
  }
  function drawThermo(c) {
    const g = G, x = g.tx0 + (g.narrow ? 9 : 14), y0 = g.rimY - 2.6 * g.s, y1 = Math.min(g.tBot - 10, g.waterY + 8 * g.s);
    c.save();
    c.fillStyle = LD.alpha(col.glass, 0.25); c.strokeStyle = LD.alpha(col.glass, 0.8); c.lineWidth = 1;
    LD.roundRect(c, x - 3, y0, 6, y1 - y0, 3); c.fill(); c.stroke();
    const frac = Math.max(0.05, Math.min(1, (run.o.T + 5) / 50));
    c.fillStyle = col.pos;
    c.fillRect(x - 1, y1 - 4 - (y1 - y0 - 10) * frac, 2, (y1 - y0 - 10) * frac);
    c.beginPath(); c.arc(x, y1 - 3, 4.5, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function drawFlask(c) {
    const g = G, x = g.fx;
    LD.contactShadow(c, x, g.benchY, g.fbw * 1.05, 0);
    // 液體
    const lh = liquidHeight(run.o.V);
    const ly = g.benchY - 3 - lh;
    c.save();
    flaskPath(c, 2); c.closePath(); c.clip();
    c.fillStyle = col.bg; c.fillRect(x - g.fbw, g.neckTop, g.fbw * 2, g.benchY - g.neckTop);
    const ag = c.createLinearGradient(0, ly, 0, g.benchY);
    ag.addColorStop(0, LD.alpha(col.acid, col.dark ? 0.7 : 0.8)); ag.addColorStop(1, LD.alpha(LD.shade(col.acid, -0.25), 0.9));
    c.fillStyle = ag; c.fillRect(x - g.fbw, ly, g.fbw * 2, g.benchY - ly);
    c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.35 : 0.85); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x - g.fbw, ly); c.lineTo(x + g.fbw, ly); c.stroke();
    // 鎂帶
    const lf = S.left(run);
    const len = S.ribbonLength(lf.mMg) * g.kf;
    const dropped = run.started && dropAnim < 0;
    const hangY = g.neckTop + g.fnh * 0.7;
    const restY = g.benchY - 6;
    let pts;
    if (!run.started) pts = ribbonPath(len, x, hangY, true);
    else if (!dropped) {
      const u = Math.max(0, dropAnim), p0 = ribbonPath(len, x, hangY, true), p1 = ribbonPath(len, x, restY, false);
      pts = (u < 0.5 ? p0 : p1).map(function (p) { return [p[0], p[1] + (u < 0.5 ? u * 2 * (restY - hangY - G.fbh * 0.3) : 0)]; });
    } else pts = ribbonPath(len, x, restY, false);
    if (pts.length > 1) {
      const oxide = !run.o.polished && (!run.started || run.t < S.OXIDE_DELAY);
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = oxide ? LD.shade(col.oxide, -0.15) : col.mgDark; c.lineWidth = 4.4;
      c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
      c.strokeStyle = oxide ? col.oxide : col.mg; c.lineWidth = 2.8; c.stroke();
      c.strokeStyle = LD.alpha('#ffffff', oxide ? 0.25 : 0.8); c.lineWidth = 0.9;
      c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1] - 0.8); else c.moveTo(p[0], p[1] - 0.8); }); c.stroke();
    }
    if (!run.started) {   // 吊鎂帶的細線
      c.strokeStyle = LD.alpha(col.text, 0.5); c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(x, g.neckTop + 4); c.lineTo(x, hangY); c.stroke();
    }
    fBubbles.forEach(function (b) { drawBubble(c, b.x, b.y, b.r); });
    c.restore();
    // 玻璃
    c.save();
    flaskPath(c, 0);
    c.lineWidth = 2.2; c.strokeStyle = LD.alpha(col.glass, col.dark ? 0.9 : 0.8); c.stroke();
    c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.25 : 0.7); c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - g.fnw + 4, g.neckTop + 6); c.lineTo(x - g.fnw + 4, g.benchY - g.fbh + 4); c.lineTo(x - g.fbw * 0.62, g.benchY - 22); c.stroke();
    c.restore();
    // 瓶塞
    const sw = g.fnw + 3, sy = g.neckTop - 6;
    const rg = c.createLinearGradient(0, sy, 0, sy + 18);
    rg.addColorStop(0, LD.shade(col.rubber, 0.2)); rg.addColorStop(1, LD.shade(col.rubber, -0.25));
    c.fillStyle = rg;
    c.beginPath(); c.moveTo(x - sw, sy); c.lineTo(x + sw, sy); c.lineTo(x + g.fnw - 1, sy + 18); c.lineTo(x - g.fnw + 1, sy + 18); c.closePath(); c.fill();
  }
  function drawLevelMarks(c) {
    const g = G, cg = cylGeom();
    if (!run.started) return;
    const h = cg.gas.h;
    if (state.aligned || Math.abs(h) < 0.05) return;
    // 水槽水面的延長虛線，與筒內水面的高度差 h
    c.save();
    c.setLineDash([4, 3]); c.strokeStyle = LD.alpha(col.accent, 0.85); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cg.x0 - 18, g.waterY); c.lineTo(cg.x1 + 6, g.waterY); c.stroke();
    c.setLineDash([]);
    const bx = cg.x0 - 14;
    c.beginPath(); c.moveTo(bx, g.waterY); c.lineTo(bx, cg.yMen); c.moveTo(bx - 4, g.waterY); c.lineTo(bx + 4, g.waterY); c.moveTo(bx - 4, cg.yMen); c.lineTo(bx + 4, cg.yMen); c.stroke();
    c.restore();
    LD.pill(c, 'h = ' + num(h, 1) + ' cm', bx - 4, (g.waterY + cg.yMen) / 2 + 8, col.accent, 'right', '600 ' + fsz(11).toFixed(1) + 'px ' + FONT);
  }
  /** 放大鏡：彎月面附近的刻度（精確），數字正著寫方便讀 */
  function drawMagnifier(c) {
    const g = G, C0 = C(), cg = cylGeom();
    const x = g.mx, y = g.my, w = g.mw, h = g.mh;
    const Vt = cg.gas.V;
    c.save();
    c.shadowColor = LD.shadowInk(0.25); c.shadowBlur = 10; c.shadowOffsetY = 3;
    LD.roundRect(c, x, y, w, h, 12); c.fillStyle = LD.mix(col.bg, col.surface, 0.5); c.fill();
    c.restore();
    c.save();
    LD.roundRect(c, x, y, w, h, 12); c.clip();
    const Z = Math.max(15, Math.min(26, (h - fsz(12) * 1.5 - 6) / 6));   // 每一格的像素（至少看得到 6 格，一定有一個數字）
    const titleH = fsz(12) * 1.5 + 6;
    const midY = y + titleH + (h - titleH) / 2;
    const Vc = run.started ? Vt : C0.low + 3 * C0.div;
    const yOf = function (v) { return midY + (v - Vc) / C0.div * Z; };
    const sx0 = x + 10, sx1 = x + w - 10;
    const yM = yOf(Vt);
    // 水與氣體
    if (run.started) {
      const menH = Math.min(Z * 0.9, 0.15 * C0.A / C0.div * Z);   // 彎月面高約 1.5 mm
      c.fillStyle = LD.alpha(col.water, 0.7); c.fillRect(sx0, yM - menH - 2, sx1 - sx0, y + h - yM + menH + 2);
      c.fillStyle = LD.mix(col.bg, col.surface, 0.5);
      c.beginPath(); c.moveTo(sx0, yM - menH); c.quadraticCurveTo((sx0 + sx1) / 2, yM + menH, sx1, yM - menH); c.lineTo(sx1, yM - menH - 3); c.lineTo(sx0, yM - menH - 3); c.closePath(); c.fill();
      c.strokeStyle = LD.alpha(col.dark ? '#d9eef8' : '#2f5f7c', 0.95); c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(sx0, yM - menH); c.quadraticCurveTo((sx0 + sx1) / 2, yM + menH, sx1, yM - menH); c.stroke();
    } else {
      c.fillStyle = LD.alpha(col.water, 0.7); c.fillRect(sx0, y + titleH, sx1 - sx0, h - titleH);
    }
    // 刻度
    const labEvery = 10;   // 每 10 格長刻度，每 5 格寫數字
    const kLo = Math.ceil((Vc - (midY - y) / Z * C0.div) / C0.div), kHi = Math.floor((Vc + (y + h - midY) / Z * C0.div) / C0.div);
    c.strokeStyle = col.text; c.fillStyle = col.text; c.lineWidth = 1.2;
    c.font = '600 ' + fsz(11).toFixed(1) + 'px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (let k = kLo; k <= kHi; k++) {
      const v = k * C0.div;
      if (v < C0.low - 1e-9 || v > C0.cap + 1e-9) continue;
      const yy = Math.round(yOf(v)) + 0.5;
      const big = k % labEvery === 0, mid = !big && k % 5 === 0;
      const L = big ? (sx1 - sx0) * 0.42 : mid ? (sx1 - sx0) * 0.32 : (sx1 - sx0) * 0.2;
      c.strokeStyle = col.text; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(sx0, yy); c.lineTo(sx0 + L, yy); c.stroke();
      if (big || mid) LD.haloText(c, num(v, Math.abs(v - Math.round(v)) > 1e-9 ? 1 : 0), sx0 + L + 5, yy, col.text, 'left', 'middle', (big ? '700 ' : '600 ') + fsz(11).toFixed(1) + 'px ' + FONT);
    }
    // 玻璃壁
    c.fillStyle = LD.alpha(col.glass, 0.35); c.fillRect(x, y + titleH, 10, h - titleH);
    c.restore();
    // 外框與標題
    c.save();
    LD.roundRect(c, x, y, w, h, 12); c.strokeStyle = LD.alpha(col.accent, 0.6); c.lineWidth = 1.5; c.stroke();
    c.fillStyle = LD.mix(col.bg, col.surface, 0.2);
    LD.roundRect(c, x + 1, y + 1, w - 2, titleH - 2, 11); c.fill();
    const tt = !run.started ? (g.narrow ? T('放大鏡', 'Magnifier') : T('放大鏡：量筒刻度', 'Magnifier: cylinder scale'))
      : Vt < C0.low ? T('低於最低刻度', 'Below lowest mark') : Vt > C0.cap ? T('超出刻度', 'Beyond the scale') : g.narrow ? T('放大鏡', 'Magnifier') : T('放大鏡（讀最低點）', 'Magnifier (read the bottom)');
    LD.haloText(c, tt, x + w / 2, y + titleH / 2 + 1, col.muted, 'center', 'middle', '600 ' + fsz(11.5).toFixed(1) + 'px ' + FONT);
    c.restore();
    // 指到量筒彎月面的引線
    if (run.started && Vt > 0.3) {
      c.save(); c.setLineDash([3, 4]); c.strokeStyle = LD.alpha(col.accent, 0.55); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + w, Math.min(y + h - 6, Math.max(y + titleH, yM))); c.lineTo(cg.x0 - 2, cg.yMen); c.stroke();
      c.restore();
      c.save(); c.strokeStyle = LD.alpha(col.accent, 0.8); c.lineWidth = 1.4;
      c.beginPath(); c.arc(G.cx, cg.yMen, G.rIn + 6, 0, Math.PI * 2); c.stroke(); c.restore();
    }
  }
  function drawLabels(c) {
    const g = G, f = '600 ' + fsz(11.5).toFixed(1) + 'px ' + FONT, f2 = fsz(11).toFixed(1) + 'px ' + FONT;
    const yb = ch - 6, rx = cw - g.pad;
    // 大氣壓、水溫（窄螢幕：大氣壓放到桌面那一行，水溫放進水槽裡）
    if (g.narrow) {
      LD.haloText(c, 'P = ' + num(run.o.P, 0) + ' mmHg', rx, yb, col.text, 'right', 'alphabetic', f);
      LD.pill(c, num(run.o.T, 1) + ' °C', g.tx0 + 4, g.waterY + 9.5 * g.s, col.pos, 'left', f2);
    } else {
      LD.pill(c, T('大氣壓 ', 'Air pressure ') + num(run.o.P, 0) + ' mmHg', rx, g.pad + fsz(12) * 1.5 + 2, col.text, 'right', f);
      LD.pill(c, num(run.o.T, 1) + ' °C', g.tx0 + 6, g.rimY - 2.8 * g.s, col.pos, 'left', f2);
      LD.haloText(c, T('示意圖（器材未依比例）', 'Schematic (not to scale)'), g.tx1, yb, col.muted, 'right', 'alphabetic', f2);
    }
    // 錐形瓶的內容
    c.font = f;
    const mgTxt = 'Mg ' + num(run.o.m, 4) + ' g', mgW = c.measureText(mgTxt).width;
    LD.haloText(c, mgTxt, Math.max(g.pad + mgW / 2, g.fx), yb, col.text, 'center', 'alphabetic', f);
    const lyy = g.benchY - 3 - liquidHeight(run.o.V);
    if (g.narrow) LD.pill(c, num(run.o.c, 2) + ' M · ' + num(run.o.V, 1) + ' mL', g.pad, Math.max(g.neckTop + 40, lyy - 4), col.text, 'left', f2);
    else {
      LD.pill(c, 'HCl ' + num(run.o.c, 2) + ' M', g.fx + g.fnw + 10, g.neckTop + 30, col.text, 'left', f2);
      LD.pill(c, num(run.o.V, 1) + ' mL', g.fx + g.fnw + 10, g.neckTop + 30 + fsz(11) * 1.5 + 6, col.muted, 'left', f2);
    }
    // 反應中的狀態
    const sx = g.narrow ? g.pad : g.fx, sa = g.narrow ? 'left' : 'center';
    if (run.started && !run.ended && !state.running) LD.pill(c, T('暫停', 'Paused'), sx, g.neckTop - 14, col.muted, sa, f);
    if (run.ended) LD.pill(c, T('反應結束', 'Reaction over'), sx, g.neckTop - 14, col.probe, sa, f);
    if (run.escaped) {
      const cg = cylGeom();
      LD.pill(c, T('氣體冒走！', 'Gas escaping!'), Math.min(g.cx + g.rIn + 10, cw - g.pad - 90), Math.min(g.tBot - 4, cg.yMouth + 22), col.pos, 'left', f);
    }
  }


  // ======================= 氣泡（示意） =======================
  function stepBubbles(dt) {
    if (!G) return;
    const g = G, cg = cylGeom();
    const rate = run.started && state.running && !run.ended ? S.rateAt(run.o, run.t) : 0;   // mol/s
    const mlps = rate * S.R_ML * (run.o.T + 273.15) / Math.max(100, run.o.P - S.vapor(run.o.T)) * SPEEDS[state.speed];
    const nps = rate > 0 ? Math.max(3, Math.min(40, mlps / 0.25)) : 0;
    // 錐形瓶裡：從鎂帶冒出
    fAcc += nps * 1.6 * dt;
    const lh = liquidHeight(run.o.V), ly = g.benchY - 3 - lh;
    const len = S.ribbonLength(S.left(run).mMg) * g.kf;
    if (dropAnim < 0) {
      const pts = ribbonPath(len, g.fx, g.benchY - 6, false);
      while (fAcc >= 1 && pts.length > 1) {
        fAcc -= 1;
        const i = Math.floor(Math.random() * (pts.length - 1)), u = Math.random();
        fBubbles.push({ x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u - 2, r: 1 + Math.random() * 1.6, vy: 30 + Math.random() * 40 });
      }
    }
    if (fAcc > 1) fAcc = 1;
    fBubbles = fBubbles.filter(function (b) {
      b.y -= b.vy * dt; b.vy += 20 * dt; b.x += Math.sin(b.y * 0.2) * 0.2;
      const hw = halfWidthAt(g.benchY - b.y);
      b.x = Math.max(g.fx - hw + 2, Math.min(g.fx + hw - 2, b.x));
      return b.y > ly + 1;
    });
    // 量筒口：氣泡上升到彎月面
    tAcc += nps * dt;
    const tip = tubePts().tip;
    while (tAcc >= 1) {
      tAcc -= 1;
      const r = 1.5 + Math.random() * 2.2;
      if (run.escaped && cg.gas.full) eBubbles.push({ x: g.cx + g.rIn + 4 + Math.random() * 4, y: cg.yMouth + 2, r: r, vy: 50 + Math.random() * 30, vx: 8 + Math.random() * 10 });
      else tBubbles.push({ x: tip[0] + (Math.random() - 0.5) * 3, y: tip[1], r: r, vy: 40 + Math.random() * 40 });
    }
    tBubbles = tBubbles.filter(function (b) { b.y -= b.vy * dt; b.vy += 30 * dt; b.x += (g.cx - b.x) * 0.6 * dt; return b.y > cg.yMen + b.r; });
    eBubbles = eBubbles.filter(function (b) { b.y -= b.vy * dt; b.x += b.vx * dt; return b.y > g.waterY + 1; });
    if (fBubbles.length > 160) fBubbles.splice(0, fBubbles.length - 160);
    if (tBubbles.length > 80) tBubbles.splice(0, tBubbles.length - 80);
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w; gh = w < 560 ? 280 : 300;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function axes(c, box, xmax, ymax, xl, yl) {
    const xs = niceStep(xmax, gw < 500 ? 4 : 7), ys = niceStep(ymax, 5);
    LD.grid(c, box.x0, box.y0, box.x1, box.y1, 0, 0);
    c.save();
    c.strokeStyle = LD.alpha(col.text, 0.1); c.lineWidth = 1;
    c.beginPath();
    for (let v = xs; v <= xmax + 1e-9; v += xs) { const x = Math.round(box.x0 + v / xmax * (box.x1 - box.x0)) + 0.5; c.moveTo(x, box.y0); c.lineTo(x, box.y1); }
    for (let v = ys; v <= ymax + 1e-9; v += ys) { const y = Math.round(box.y1 - v / ymax * (box.y1 - box.y0)) + 0.5; c.moveTo(box.x0, y); c.lineTo(box.x1, y); }
    c.stroke();
    c.strokeStyle = LD.alpha(col.text, 0.55);
    c.beginPath(); c.moveTo(box.x0 + 0.5, box.y0); c.lineTo(box.x0 + 0.5, box.y1 + 0.5); c.lineTo(box.x1, box.y1 + 0.5); c.stroke();
    const f = fsz(11).toFixed(1) + 'px ' + FONT;
    c.fillStyle = col.muted; c.font = f; c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = 0; v <= xmax + 1e-9; v += xs) c.fillText(num(v, xs < 1 ? 1 : 0), box.x0 + v / xmax * (box.x1 - box.x0), box.y1 + 4);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = 0; v <= ymax + 1e-9; v += ys) c.fillText(num(v, ys < 1 ? (ys < 0.1 ? 2 : 1) : 0), box.x0 - 5, box.y1 - v / ymax * (box.y1 - box.y0));
    c.restore();
    LD.haloText(c, xl, box.x1, box.y1 + fsz(11) * 1.3 + 8, col.muted, 'right', 'top', '600 ' + f);
    LD.haloText(c, yl, box.x0 + 4, box.y0 - 6, col.muted, 'left', 'bottom', '600 ' + f);
  }
  function drawGraph() {
    if (!gw) return;
    const c = gctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(c, gw, gh);
    const box = { x0: gw < 500 ? 46 : 56, y0: fsz(12) * 1.5 + 14, x1: gw - 14, y1: gh - fsz(11) * 2.6 - 14 };
    if (state.tab === 'vt') drawVT(c, box); else drawYield(c, box);
  }
  function drawVT(c, box) {
    const C0 = C();
    const gFinal = S.gasState(run.o.cyl, Math.min(run.A.xiMax, S.capacityMol(run.o.cyl, run.o.T, run.o.P, state.aligned)), run.o.T, run.o.P, state.aligned);
    const vEnd = run.ended ? run.t : run.tEnd;
    const xmax = Math.max(10, rows.length > 1 ? Math.max(rows[rows.length - 1][0] * 1.08, Math.min(vEnd * 1.1, rows[rows.length - 1][0] * 3 + 10)) : Math.min(vEnd * 1.1, 600));
    const ymax = Math.max(C0.cap, gFinal.V) * 1.08;
    axes(c, box, xmax, ymax, T('時間 t（s）', 'time t (s)'), T('量筒內氣體 V（mL）', 'gas in the cylinder V (mL)'));
    const X = function (t) { return box.x0 + t / xmax * (box.x1 - box.x0); }, Y = function (v) { return box.y1 - v / ymax * (box.y1 - box.y0); };
    c.save();
    // 容量與最低刻度
    c.setLineDash([2, 4]); c.strokeStyle = LD.alpha(col.pos, 0.7); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(box.x0, Y(C0.cap)); c.lineTo(box.x1, Y(C0.cap)); c.stroke();
    c.strokeStyle = LD.alpha(col.muted, 0.6);
    c.beginPath(); c.moveTo(box.x0, Y(C0.low)); c.lineTo(box.x1, Y(C0.low)); c.stroke();
    // 理論產量
    c.setLineDash([7, 5]); c.strokeStyle = col.probe; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(box.x0, Y(gFinal.V)); c.lineTo(box.x1, Y(gFinal.V)); c.stroke();
    c.setLineDash([]);
    // 數據
    if (rows.length > 1) {
      c.strokeStyle = col.neg; c.lineWidth = 2.4; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      rows.forEach(function (r, i) { const x = X(Math.min(r[0], xmax)), y = Y(r[1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      c.stroke();
      const last = rows[rows.length - 1];
      LD.ball(c, X(Math.min(last[0], xmax)), Y(last[1]), 4, col.neg, { shadow: false });
    }
    c.restore();
    const f = '600 ' + fsz(11).toFixed(1) + 'px ' + FONT;
    LD.pill(c, T('量筒容量 ', 'capacity ') + C0.cap + ' mL', box.x1 - 4, Y(C0.cap) - 2, col.pos, 'right', f);
    LD.pill(c, T('理論產量 ', 'theoretical ') + num(gFinal.V, 1) + ' mL', box.x1 - 4, Y(gFinal.V) + (Math.abs(Y(gFinal.V) - Y(C0.cap)) < 22 ? 22 : -2), col.probe, 'right', f);
    $('gLegend').innerHTML = '<span><span class="ln" style="background:' + col.neg + '"></span>' + T('量筒內氣體的體積', 'gas in the cylinder') + '</span>'
      + '<span style="color:' + col.probe + '"><span class="ln dash"></span>' + T('理論產量（目前的液面狀態）', 'theoretical yield (present water levels)') + '</span>';
    $('gHint').textContent = T('理論產量 = 限量試劑決定的氫氣莫耳數，換算成量筒裡的體積（含水蒸氣）。氣泡越來越慢，是因為反應物越來越少。',
      'Theoretical yield = moles of hydrogen set by the limiting reactant, turned into a volume in the cylinder (water vapour included). The bubbling slows down as the reactants are used up.');
  }
  function sameMC(d) { return Math.abs(d.m - run.o.m) < 1e-9 && Math.abs(d.c - run.o.c) < 1e-9 && d.polished === run.o.polished; }
  function drawYield(c, box) {
    const o = run.o, Vmax = 50;
    const theo = function (V) { return S.amounts({ m: o.m, c: o.c, V: V, polished: o.polished }).xiMax * 1000; };
    const pts = doneRuns.filter(function (d) { return d.seg === seg && sameMC(d); });
    const ymax = Math.max(theo(Vmax), 0.1, pts.reduce(function (a, d) { return Math.max(a, d.nGas * 1000); }, 0)) * 1.18;
    axes(c, box, Vmax, ymax, T('加入的鹽酸 V（mL）', 'acid added V (mL)'), T('氫氣 n（mmol）', 'hydrogen n (mmol)'));
    const X = function (v) { return box.x0 + v / Vmax * (box.x1 - box.x0); }, Y = function (n) { return box.y1 - n / ymax * (box.y1 - box.y0); };
    const A0 = S.amounts({ m: o.m, c: o.c, V: 1, polished: o.polished });
    const Vk = (2 * A0.nMg + 2 * A0.nMgO) / o.c * 1000;   // 轉折點（mL）
    c.save();
    c.strokeStyle = col.probe; c.lineWidth = 2.2; c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i <= 200; i++) { const V = Vmax * i / 200, x = X(V), y = Y(theo(V)); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    if (Vk > 0 && Vk < Vmax) c.lineTo(X(Vk), Y(theo(Vk)));
    c.stroke();
    // 目前的鹽酸體積
    c.setLineDash([4, 4]); c.strokeStyle = LD.alpha(col.accent, 0.8); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(X(o.V), box.y0); c.lineTo(X(o.V), box.y1); c.stroke();
    c.setLineDash([]);
    c.restore();
    pts.forEach(function (d) { LD.ball(c, X(d.VHCl), Y(d.nGas * 1000), 5, d.lim === 'HCl' ? col.neg : col.pos, { shadow: false }); });
    const f = '600 ' + fsz(11).toFixed(1) + 'px ' + FONT;
    if (Vk > 0 && Vk < Vmax) {
      LD.ball(c, X(Vk), Y(theo(Vk)), 3.5, col.probe, { shadow: false });
      LD.pill(c, T('轉折點 ', 'corner ') + num(Vk, 1) + ' mL', X(Vk) + (X(Vk) > (box.x0 + box.x1) / 2 ? -6 : 6), Y(theo(Vk)) - 8, col.probe, X(Vk) > (box.x0 + box.x1) / 2 ? 'right' : 'left', f);
    }
    $('gLegend').innerHTML = '<span style="color:' + col.probe + '"><span class="ln" style="background:' + col.probe + '"></span>' + T('理論產量', 'theoretical yield') + '</span>'
      + '<span><span class="dot" style="background:' + col.neg + '"></span>' + T('實驗：鹽酸是限量試劑', 'run: acid limiting') + '</span>'
      + '<span><span class="dot" style="background:' + col.pos + '"></span>' + T('實驗：鎂是限量試劑', 'run: magnesium limiting') + '</span>';
    const other = doneRuns.filter(function (d) { return d.seg === seg && !sameMC(d); }).length;
    $('gHint').textContent = T('鎂的質量 ', 'Magnesium ') + num(o.m, 4) + ' g' + T('、鹽酸 ', ', acid ') + num(o.c, 2) + ' M' + T('：鹽酸少於轉折點時由鹽酸決定產量，多於轉折點時由鎂決定。圖上的點是做完的實驗（量筒內收集到的氫氣）', ': below the corner the acid sets the yield; above it the magnesium does. The dots are finished runs (hydrogen collected)')
      + (other ? T('；另有 ' + other + ' 次條件不同，沒有畫出。', '; ' + other + ' run(s) with other conditions are not shown.') : T('。', '.'));
  }

  // ======================= 介面同步 =======================
  function syncSegs() {
    document.querySelectorAll('#cylSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.cyl === state.cyl)); });
    document.querySelectorAll('#limSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lim === state.lim)); });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab)); });
    [0, 1, 2, 3].forEach(function (k) { $('sp' + k).setAttribute('aria-pressed', String(k === state.speed)); });
    $('alignBtn').setAttribute('aria-pressed', String(state.aligned));
  }
  function outputs() {
    const set = function (id, txt) { const o = $(id); if (o && document.activeElement !== o) o.textContent = txt; };
    set('masso', num(val(el.mass), 4) + ' g');
    set('conco', num(val(el.conc), 2) + ' M');
    set('volo', num(val(el.vol), 1) + ' mL');
    set('tempo', num(val(el.temp), 1) + ' °C');
    set('preso', num(val(el.pres), 0) + ' mmHg');
  }
  function refreshAll() {
    outputs(); syncSegs(); updatePlay(); updateReadouts(); renderTable();
    drawStage(); drawGraph();
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function buildVpTable() {
    const t = $('vpTable');
    if (!t) return;
    let h = '<thead><tr><th>' + T('溫度', 'Temperature') + '<br><small>°C</small></th>';
    const temps = [0, 5, 10, 15, 20, 25, 30, 35, 40];
    let r1 = '<tr><td class="l">mmHg</td>', r2 = '<tr><td class="l">kPa</td>';
    temps.forEach(function (tc) { h += '<th>' + tc + '</th>'; r1 += '<td>' + num(S.vapor(tc), 2) + '</td>'; r2 += '<td>' + num(S.vaporKPa(tc), 3) + '</td>'; });
    t.innerHTML = h + '</tr></thead><tbody>' + r1 + '</tr>' + r2 + '</tr></tbody>';
  }

  // ======================= 事件 =======================
  [el.mass, el.conc, el.vol, el.temp, el.pres].forEach(function (e) {
    e.addEventListener('input', function () { if (!syncing) changed(); });
  });
  el.polished.addEventListener('change', function () { changed(); });
  document.querySelectorAll('#cylSeg button').forEach(function (b) {
    b.addEventListener('click', function () { if (+b.dataset.cyl === state.cyl) return; state.cyl = +b.dataset.cyl; changed(); });
  });
  document.querySelectorAll('#limSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.lim = b.dataset.lim; syncSegs(); }); });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.tab = b.dataset.tab; syncSegs(); drawGraph(); }); });
  $('play').addEventListener('click', function () { acted(); togglePlay(); });
  $('skipEnd').addEventListener('click', skipToEnd);
  $('alignBtn').addEventListener('click', function () { setAligned(!state.aligned); });
  $('restart').addEventListener('click', function () { changed(T('新的一次實驗：換新的鎂帶與鹽酸，量筒重新裝滿水。', 'New run: fresh ribbon and acid, the cylinder refilled with water.')); });
  $('clearAll').addEventListener('click', function () {
    acted();
    results = []; doneRuns = []; seg++;
    renderTable(); drawGraph();
    setStatus(T('已清除結果表與圖上的數據點（目前這次實驗保留）。', 'The results table and the points on the graph have been cleared (the current run is kept).'));
  });
  [0, 1, 2, 3].forEach(function (k) { $('sp' + k).addEventListener('click', function () { acted(); state.speed = k; syncSegs(); }); });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
  });
  el.vap.addEventListener('change', acted);
  $('calc').addEventListener('click', calc);
  el.inV.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); calc(); } });

  let kb = null;
  function setValUser(e, v) { if (window.LabNum) window.LabNum.set(e, v); else { e.value = v; e.dispatchEvent(new Event('input')); } }
  if (window.LabKeys) {
    const stepIn = function (e, d, big) {
      const st = +e.step || 1, lo = +e.min, hi = +e.max;
      setValUser(e, Math.max(lo, Math.min(hi, Math.round((val(e) + d * st * (big ? 10 : 1)) / st) * st)));
    };
    kb = window.LabKeys.attach(cv, {
      label: T('實驗畫面。空白鍵開始或暫停反應，L 鍵對齊液面。按 Enter 切換要調整的項目，方向鍵改變數值，Shift 加方向鍵改變得更多。',
        'Experiment. Space starts or pauses the reaction; L levels the water. Press Enter to pick what to adjust; the arrow keys change it; hold Shift for bigger steps.'),
      items: [
        { name: function () { return T('鎂的質量', 'Mass of magnesium'); },
          move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; stepIn(el.mass, d, big); return true; },
          describe: function () { return num(val(el.mass), 4) + ' g'; } },
        { name: function () { return T('鹽酸的體積', 'Volume of acid'); },
          move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; stepIn(el.vol, d, big); return true; },
          describe: function () { const g = S.gas(run); return num(val(el.vol), 1) + ' mL' + T('，量筒內氣體約 ', ', gas about ') + num(g.V, 0) + ' mL'; } }
      ],
      onChange: function () { drawStage(); }
    });
    cv.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); acted(); togglePlay(); }
      else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setAligned(!state.aligned); }
    });
  }

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    refreshAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && state.running) startLoop(); });

  // 任務：每 0.5 秒回報一次目前的狀態
  function tickData() {
    const g = S.gas(run);
    return { seg: seg, runId: runId, started: run.started, ended: run.ended, t: run.t, V: g.V, escaped: run.escaped, aligned: state.aligned, cap: C().cap };
  }
  setInterval(function () { if (userActed && window.LabMission) window.LabMission.emit('tick', tickData()); }, 500);

  // 測試用（Playwright）：讀取目前狀態
  window.__st = {
    state: state, run: function () { return run; }, rows: function () { return rows; }, results: function () { return results; }, doneRuns: function () { return doneRuns; },
    gas: function () { return S.gas(run); }, tick: tickData
  };

  // ======================= 啟動 =======================
  readColors();
  cw = cv.clientWidth || 600; ch = 440;
  newRun();
  layout();
  syncSegs();
  buildVpTable();
  updateSoundButton();
  resize();
  refreshAll();
  startLoop();
})();
