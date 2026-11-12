/*
 * hess-law.js — 「反應熱與赫斯定律」的頁面程式（卡計畫面、操作、溫度—時間圖、赫斯循環、分析、結果表、未知固體、任務事件）
 * 化學核心在 js/hess-law-core.js（HessCore）。畫面上的藥粒、傾倒與熱流箭頭只是示意；溫度、溶解量、反應量都直接來自核心的計算。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'tick'：每 0.5 秒 { mode（'solid'／'mix'／'cal'）, kind（固體：'NaOH'／'NH4NO3'／'X'；其他 null）, liquid（'water'／'HCl'；其他 null）,
 *            added, recording, T0（加入前的讀數平均；沒加入時為室溫）, reading（°C）, dT（reading − T0）, Troom,
 *            peak（加入後讀數離室溫最遠的距離 °C）, t, tAdd }
 *   'analyze'：按「計算」{ kind（'dis-NaOH'／'dis-NH4NO3'／'dis-X'／'r3'／'neut'／'other'）, method（'raw'／'ext'）, dH, ref（kJ/mol 或 null）,
 *            err（相對誤差，沒有參考值為 null）, lid, stir, excess（中和時過量試劑與限量試劑的莫耳數比）, revealed（未知固體已揭曉）,
 *            dTraw, dText, C, n, hess: { h1, h2, h3, e1, e2, e3 }（這一段實驗最新的三個值與誤差） }
 *   'calib'：卡計校正按「計算」{ C（J/K）, err（J/K）, method }
 */
(function () {
  'use strict';
  const H = window.HessCore, LD = window.LabDraw;
  if (!H || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const LCD_BG = '#17201f', LCD_FG = '#8ef0c4';
  const T_MAX = 3600;        // 最長記錄時間 s
  const DT_REC = 2;          // 記錄間隔 s
  const SPEEDS = [1, 5, 20, 60];

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
  function signed(x, d) { return (x > 0 ? '+' : '') + num(x, d); }
  function pct(x) { return signed(x * 100, Math.abs(x) < 0.1 ? 1 : 0) + '%'; }
  function parseNum(s) {
    s = String(s || '').normalize('NFKC').replace(/[，,]/g, '.').replace(/[−–—]/g, '-').replace(/\s+/g, '');
    s = s.replace(/[x×]10\^?([-+]?\d+)$/i, 'e$1');
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
  }

  // ======================= 名稱 =======================
  function solidName(k) {
    return k === 'NaOH' ? T('氫氧化鈉', 'sodium hydroxide') : k === 'NH4NO3' ? T('硝酸銨', 'ammonium nitrate') : T('未知固體 X', 'unknown solid X');
  }
  function fH(s) { return s.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>'); }
  function fP(s) {   // 化學式 → 畫布 parts（數字下標）
    const out = [];
    s.split(/(\d+)/).forEach(function (p, i) { if (p) out.push([p, i % 2 ? -1 : 0]); });
    return out;
  }

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk,
      water: dk ? '#4f7f9a' : '#a9d0e6', foam: dk ? '#d8d4ca' : '#fbfaf6', foamShade: dk ? '#9c978c' : '#d9d5cb',
      steel: dk ? '#b8c0c8' : '#8d969f', hot: dk ? '#ff7a5c' : '#d9462f', cold: dk ? '#6fb0ff' : '#2f78d0',
      glass: dk ? '#a9c3cf' : '#7d97a5', pellet: dk ? '#f0eee8' : '#ffffff', pelletX: dk ? '#c8b7ea' : '#b39ad9'
    };
  }

  // ======================= 狀態 =======================
  const state = { mode: 'solid', solid: 'NaOH', liq: 'water', speed: 1, tab: 'curve', meth: 'ext', recording: false, started: false };
  let run = null, rows = [], nextRec = DT_REC, peak = 0, peakLatched = false, endLatched = false;
  let results = [], seg = 0, rowSeq = 0;
  let unk = null;
  let fitTouched = false;
  let userActed = false, syncing = false;
  let addAnim = -1, addAnimStart = 0;     // 加入的動畫（真實時間）
  let lastDeg = null;

  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const el = {
    mass: $('mass'), liqV: $('liqV'), liqC: $('liqC'), cb: $('cb'), Vb: $('Vb'), ca: $('ca'), Va: $('Va'),
    Vc: $('Vc'), Vh: $('Vh'), Th: $('Th'), Troom: $('Troom'), lid: $('lid'), stir: $('stir'), ta: $('ta'), tb: $('tb')
  };
  const statusEl = $('status');
  function val(e) { return window.LabNum ? window.LabNum.value(e) : +e.value; }
  function setVal(e, v) { syncing = true; if (window.LabNum) window.LabNum.set(e, v); else e.value = v; syncing = false; }
  function snd() { return window.LabSound && window.LabSound.enabled(); }

  function runOpts() {
    const o = { mode: state.mode, Troom: val(el.Troom), lid: el.lid.checked, stir: el.stir.checked };
    if (state.mode === 'solid') {
      o.solid = { kind: state.solid, mass: val(el.mass) };
      o.liquid = { kind: state.liq, V: val(el.liqV), c: val(el.liqC) };
    } else if (state.mode === 'mix') o.mix = { cb: val(el.cb), Vb: val(el.Vb), ca: val(el.ca), Va: val(el.Va) };
    else o.cal = { Vc: val(el.Vc), Vh: val(el.Vh), Th: val(el.Th) };
    return o;
  }
  /** 新的一次實驗（設定保留）：杯子倒掉、回到室溫、停止記錄 */
  function newRun() {
    run = H.createRun(runOpts());
    rows = [[0, H.reading(run)]];
    nextRec = DT_REC; peak = 0; peakLatched = false; endLatched = false;
    state.recording = false; state.started = false;
    fitTouched = false;
    addAnim = -1;
    lastDeg = null;
    makePellets();
    updatePlay();
    $('addBtn').disabled = false;
    $('calcOut').innerHTML = '';
  }

  // ======================= 主迴圈 =======================
  let raf = 0, lastTs = 0, lastRead = 0, phase = 0;
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    const dtw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dtw > 0) {
      if (state.recording) advance(dtw * SPEEDS[state.speed]);
      if (!reducedMotion) phase += dtw;
      if (addAnim >= 0) { addAnim = Math.min(1, (performance.now() - addAnimStart) / (state.mode === 'solid' ? 800 : 1500)); if (addAnim >= 1) addAnim = -1; }
    }
    const now = performance.now();
    if (now - lastRead > 250) { lastRead = now; updateReadouts(); drawGraph(); }
    drawStage();
    if (state.recording || addAnim >= 0 || (!reducedMotion && Math.abs(run.T - run.Troom) > 0.3)) raf = requestAnimationFrame(loop);
  }
  /** 模擬時間前進 dt 秒，每 2 秒記錄一個讀數 */
  function advance(dt) {
    const target = Math.min(T_MAX, run.t + dt);
    while (run.t < target - 1e-9) {
      const nx = Math.min(target, nextRec);
      H.step(run, nx - run.t);
      if (run.t >= nextRec - 1e-9) { rows.push([nextRec, H.reading(run)]); nextRec += DT_REC; afterSample(); }
    }
    if (run.t >= T_MAX - 1e-9) {
      state.recording = false;
      updatePlay();
      setStatus(T('已經記錄 60 分鐘，停止記錄。可以分析這次的數據，或按「重做一次」。', 'An hour has been recorded, so recording has stopped. Analyse the data, or press “New run”.'));
      if (snd()) window.LabSound.sweep({ from: 660, to: 330, dur: 0.4, gain: 0.08, type: 'triangle' });
    }
  }
  function afterSample() {
    const r = H.reading(run);
    if (run.added) {
      const d = Math.abs(r - run.Troom);
      if (d > peak) peak = d;
      // 溫度每變 1 °C 響一聲（音高隨溫度）
      const deg = Math.floor(r);
      if (lastDeg != null && deg !== lastDeg && snd()) window.LabSound.tone({ freq: Math.max(260, Math.min(1400, 520 + (r - run.Troom) * 28)), dur: 0.05, gain: 0.05, type: 'sine' });
      lastDeg = deg;
      if (!peakLatched && run.t - run.tAdd > 6) {
        const done = run.mode === 'solid' ? run.nDis / run.solid.n > 0.97 : run.x > 0.99;
        if (done) {
          peakLatched = true;
          setStatus(run.mode === 'cal' ?
            T('熱水和冷水已經混合均勻。等溫度穩定地慢慢下降，再到「分析」卡算卡計的熱容量。', 'The hot and cold water have mixed. Wait until the temperature falls steadily, then work out the heat capacity on the “Analysis” card.') :
            T('反應已經差不多完成了，接下來溫度會慢慢回到室溫。多記錄幾分鐘的冷卻，再到「分析」卡擬合直線。', 'The reaction is practically over; from now on the temperature drifts back towards room temperature. Record a few minutes of cooling, then fit a line on the “Analysis” card.'));
        }
      }
      if (!endLatched && peak >= 5 && Math.abs(r - run.Troom) <= 0.3 && run.t - run.tAdd > 60) {
        endLatched = true;
        setStatus(T('溫度又回到室溫了：放出（或吸收）的熱，全部和空氣交換掉了。', 'Back to room temperature: all the heat has been exchanged with the air.'));
      }
    }
    if (fitTouched === false && run.added) autoFit();
  }

  // ======================= 操作 =======================
  function startRec() {
    state.recording = true; state.started = true;
    updatePlay();
    setStatus('');
    if (snd()) window.LabSound.tone({ freq: 660, dur: 0.08, gain: 0.07 });
    startLoop();
  }
  function togglePlay() {
    if (run.t >= T_MAX - 1e-9) { setStatus(T('已經記錄 60 分鐘了：按「重做一次」重新開始。', 'An hour has already been recorded: press “New run” to start again.')); return; }
    if (state.recording) { state.recording = false; updatePlay(); setStatus(''); }
    else startRec();
  }
  function doAdd() {
    if (run.added) return;
    acted();
    H.add(run);
    $('addBtn').disabled = true;
    addAnim = 0; addAnimStart = performance.now();
    if (reducedMotion) addAnim = -1;
    if (!state.recording) startRec();
    if (snd()) {
      if (run.mode === 'solid') { window.LabSound.sweep({ from: 1100, to: 420, dur: 0.12, gain: 0.07, type: 'sine' }); window.LabSound.sweep({ from: 900, to: 380, dur: 0.1, gain: 0.05, type: 'sine', delay: 0.09 }); }
      else window.LabSound.sweep({ from: 520, to: 300, dur: 0.6, gain: 0.05, type: 'triangle' });
    }
    setStatus(run.mode === 'solid' ? T('固體已經倒進杯中，蓋好杯蓋。看溫度怎麼變。', 'The solid is in the cup and the lid is back on. Watch the temperature.') :
      run.mode === 'mix' ? T('鹽酸已經倒進氫氧化鈉溶液中，蓋好杯蓋。', 'The hydrochloric acid has been poured into the sodium hydroxide solution and the lid is back on.') :
      T('熱水已經倒進冷水中，蓋好杯蓋。', 'The hot water has been poured into the cold water and the lid is back on.'));
    startLoop();
  }
  function updatePlay() {
    const b = $('play');
    b.textContent = state.recording ? T('暫停', 'Pause') : state.started ? T('繼續記錄', 'Resume') : T('開始記錄', 'Start recording');
  }
  function acted() { userActed = true; }

  // ======================= 分析 =======================
  function lastT() { return rows.length ? rows[rows.length - 1][0] : 0; }
  function anaRaw() {
    if (!run.added) return null;
    const after = rows.filter(function (r) { return r[0] > run.tAdd; });
    if (after.length < 3) return null;
    return H.analyze(rows, run.tAdd, val(el.ta), val(el.tb));
  }
  function autoFit() {
    const A = H.analyze(rows, run.tAdd, 0, 0);
    if (!A) return;
    setRangeMax();
    const ta = Math.min(lastT(), Math.ceil((A.tExt + 30) / 2) * 2);
    const tb = Math.min(lastT(), ta + 240);
    setVal(el.ta, ta); setVal(el.tb, tb);
  }
  function setRangeMax() {
    const mx = Math.max(60, Math.ceil(lastT() / 2) * 2);
    [el.ta, el.tb].forEach(function (e) { if (+e.max !== mx) { const v = val(e); e.max = mx; setVal(e, Math.min(v, mx)); } });
  }
  /** 目前方法下的分析結果 */
  function analysis() {
    const A = anaRaw();
    if (!A) return null;
    const ok = A.fit && A.fit.n >= 5 && val(el.tb) - val(el.ta) >= 10;
    const dT = state.meth === 'ext' ? (ok ? A.dText : null) : A.dTraw;
    return Object.assign({}, A, { fitOk: ok, dT: dT, m: H.finalMass(run) });
  }
  function kindOf() {
    if (run.mode === 'mix') return 'neut';
    if (run.mode === 'cal') return 'cal';
    const ref = H.reference(run);
    if (!ref) return 'other';
    if (run.liquid.kind === 'HCl' && run.base) return 'r3';
    return 'dis-' + run.solid.kind;
  }
  function kindLabel(k, r) {
    switch (k) {
      case 'dis-NaOH': return T('NaOH 溶解', 'NaOH dissolving') + (r && r.liq === 'HCl' ? T('（鹽酸中）', ' (in HCl)') : '');
      case 'dis-NH4NO3': return T('NH<sub>4</sub>NO<sub>3</sub> 溶解', 'NH<sub>4</sub>NO<sub>3</sub> dissolving');
      case 'dis-X': return T('X 溶解', 'X dissolving');
      case 'r3': return T('NaOH(s) + 鹽酸', 'NaOH(s) + HCl');
      case 'neut': return T('中和', 'Neutralisation');
      case 'cal': return T('卡計校正', 'Calibration');
      default: return T('NaOH(s) + 不足的鹽酸', 'NaOH(s) + too little HCl');
    }
  }
  function hessNow() {
    const last = function (k) { for (let i = results.length - 1; i >= 0; i--) { const r = results[i]; if (r.seg === seg && r.kind === k && !(k === 'dis-NaOH' && r.liq !== 'water')) return r; } return null; };
    const a = last('dis-NaOH'), b = last('neut'), c = last('r3');
    return { h1: a ? a.dH : null, h2: b ? b.dH : null, h3: c ? c.dH : null, e1: a ? a.err : null, e2: b ? b.err : null, e3: c ? c.err : null };
  }
  function calc() {
    acted();
    const out = $('calcOut');
    const A = analysis();
    if (!A) { out.innerHTML = T('還沒有加入後的數據：先按「加入」並記錄一段時間。', 'There is no data after adding yet: press “Add” and record for a while.'); return; }
    if (A.dT == null) { out.innerHTML = T('擬合範圍內的點太少：等冷卻記錄久一點，或把擬合範圍拉大（至少 10 s、5 個點）。', 'Too few points in the fitting range: record more of the cooling, or widen the range (at least 10 s and 5 points).'); return; }
    const meth = state.meth;
    if (run.mode === 'cal') {
      const Tf = A.T0 + A.dT;
      const C = H.calibC(run.cal.Vc, run.cal.Vh, run.cal.Th, A.T0, Tf);
      const err = C - H.C_CAL;
      out.innerHTML = T('熱水放出的熱 = 冷水吸收的熱 + 卡計吸收的熱', 'Heat lost by the hot water = heat gained by the cold water + heat gained by the calorimeter') + '<br>' +
        'C = [' + num(run.cal.Vh, 1) + ' × 4.18 × (' + num(run.cal.Th, 1) + ' − ' + num(Tf, 2) + ') − ' + num(run.cal.Vc, 1) + ' × 4.18 × ' + num(A.dT, 2) + '] ÷ ' + num(A.dT, 2) +
        ' = <span class="res">' + num(C, 1) + ' J/K</span><br>' +
        T('（模擬的設定值是 ' + H.C_CAL + ' J/K，相差 ', '(the value set in the simulation is ' + H.C_CAL + ' J/K: off by ') + signed(err, 1) + ' J/K' + T('）已填入熱容量欄。', '.) It has been entered in the heat-capacity box.');
      $('inC').value = num(C, 1).replace('−', '-');
      addRow({ kind: 'cal', meth: meth, dT: A.dT, C: C, n: null, dH: null, ref: null, err: null, Ccal: C });
      if (userActed && window.LabMission) window.LabMission.emit('calib', { C: C, err: err, method: meth });
      ding(Math.abs(err) <= 5);
      return;
    }
    const Cin = $('inC').value.trim() === '' ? 0 : parseNum($('inC').value);
    const n = parseNum($('inN').value);
    if (!isFinite(Cin) || Cin < 0) { out.innerHTML = T('卡計的熱容量 C 要填 0 或正數（J/K）。', 'The heat capacity C must be zero or a positive number (J/K).'); return; }
    if (!isFinite(n) || n <= 0) { out.innerHTML = T('請填反應的莫耳數 n（mol），例如 0.0500。', 'Enter the amount that reacted, n (mol), for example 0.0500.'); return; }
    const dH = H.dHfrom(A.m, Cin, A.dT, n);
    const q = (H.C_W * A.m + Cin) * A.dT;
    const ref = H.reference(run);
    const k = kindOf();
    const err = ref ? dH / ref.dH - 1 : null;
    const hidden = k === 'dis-X' && unk && !unk.revealed;
    let h = 'q = (m c + C) ΔT = (' + num(A.m, 1) + ' × 4.18 + ' + sigf(Cin, 3) + ') × ' + num(A.dT, 2) + ' = ' + num(q, 0) + ' J<br>' +
      'ΔH = −q ÷ n = ' + num(-q, 0) + ' ÷ ' + sigf(n, 3) + ' = <span class="res">' + num(dH, 1) + ' kJ/mol</span><br>';
    if (!ref) h += T('這次 NaOH 比 HCl 多：放出的熱一部分是溶解熱、一部分是中和熱，沒有單一的參考值。', 'This time there is more NaOH than HCl: part of the heat is heat of solution and part is heat of neutralisation, so there is no single reference value.');
    else if (hidden) h += T('參考值：按「揭曉答案」後顯示。', 'Reference value: shown after you press “Reveal”.');
    else h += T('參考值 ', 'Reference ') + num(ref.dH, 2) + ' kJ/mol' + T('，誤差 ', '; error ') + pct(err);
    out.innerHTML = h;
    const r = addRow({ kind: k, meth: meth, dT: A.dT, C: Cin, n: n, dH: dH, ref: ref ? ref.dH : null, err: err });
    const excess = run.mode === 'mix' ? Math.max(run.nb, run.na) / Math.min(run.nb, run.na) : null;
    if (userActed && window.LabMission) window.LabMission.emit('analyze', {
      kind: k, method: meth, dH: dH, ref: ref ? ref.dH : null, err: err, lid: run.lid, stir: run.stir, excess: excess,
      revealed: !!(unk && unk.revealed), dTraw: A.dTraw, dText: A.fitOk ? A.dText : null, C: Cin, n: n, hess: hessNow(), row: r.id
    });
    ding(err != null && Math.abs(err) <= 0.05);
  }
  function ding(good) {
    if (!snd()) return;
    if (good) { window.LabSound.tone({ freq: 784, dur: 0.1, gain: 0.08 }); window.LabSound.tone({ freq: 1175, dur: 0.18, gain: 0.08, delay: 0.11 }); }
    else window.LabSound.tone({ freq: 392, dur: 0.16, gain: 0.07, type: 'triangle' });
  }
  function addRow(o) {
    const r = Object.assign({ id: ++rowSeq, seg: seg, liq: run.mode === 'solid' ? run.liquid.kind : null, mode: run.mode, unkId: run.mode === 'solid' && run.solid.kind === 'X' && unk ? unk.id : 0 }, o);
    results.push(r);
    renderTable();
    drawGraph();
    return r;
  }

  // ======================= 未知固體 =======================
  let unkSeq = 0;
  function startUnknown() {
    acted();
    const u = H.newUnknown();
    unk = { id: ++unkSeq, M: u.M, dH: u.dH, revealed: false };
    $('solidSeg').querySelector('[data-solid="X"]').disabled = false;
    state.mode = 'solid'; state.solid = 'X'; state.liq = 'water';
    syncSegs();
    newRun();
    setUnkUI();
    setStatus(T('未知固體 X 已經放在錶玻璃上。', 'The unknown solid X is on the watch glass.'));
    refreshAll();
  }
  function stopUnknown() {
    acted();
    unk = null;
    $('solidSeg').querySelector('[data-solid="X"]').disabled = true;
    if (state.solid === 'X') { state.solid = 'NaOH'; syncSegs(); newRun(); }
    setUnkUI();
    refreshAll();
  }
  function reveal() {
    if (!unk) return;
    acted();
    unk.revealed = true;
    setUnkUI();
    renderTable();
  }
  function setUnkUI() {
    $('unkOn').hidden = !!unk;
    $('unkNew').hidden = $('reveal').hidden = $('unkOff').hidden = !unk;
    $('reveal').disabled = !!(unk && unk.revealed);
    $('unkOut').innerHTML = !unk ? '' :
      T('X 的莫耳質量 M = ', 'Molar mass of X: M = ') + num(unk.M, 1) + ' g/mol' +
      (unk.revealed ? '<br>' + T('答案：ΔH = ', 'Answer: ΔH = ') + '<strong>' + signed(unk.dH, 1) + ' kJ/mol</strong>' + (unk.dH < 0 ? T('（放熱）', ' (exothermic)') : T('（吸熱）', ' (endothermic)')) : '');
  }

  // ======================= 藥粒與動畫 =======================
  let pellets = [];
  function makePellets() {
    pellets = [];
    if (state.mode !== 'solid') return;
    const n = Math.max(3, Math.min(26, Math.round(val(el.mass) * 3)));
    for (let i = 0; i < n; i++) pellets.push({ u: Math.random(), v: Math.random(), gx: (Math.random() - 0.5), gy: Math.random(), r: 0.75 + Math.random() * 0.5, rot: Math.random() * 3 });
  }

  // ======================= 版面 =======================
  let cw = 0, ch = 0, dpr = 1, G = null;
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 560 ? Math.round(Math.max(380, w * 1.05)) : 420;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout();
    resizeGraph();
    drawStage(); drawGraph();
  }
  function layout() {
    const narrow = cw < 560;
    const pad = narrow ? 10 : 16;
    const labH = fsz(13) * 1.5 + 12;
    const bot = ch - pad - labH;
    const cupH = Math.min(ch * 0.5, 230);
    const cupW = Math.min(cw * (narrow ? 0.42 : 0.3), 210);
    const cx = narrow ? cw * 0.64 : cw * 0.6;
    const mh = Math.max(46, fsz(13) * 3.4), mw = Math.min(narrow ? 128 : 150, cw * 0.36);
    G = {
      narrow: narrow, pad: pad, bot: bot, top: bot - cupH, cupH: cupH, cupW: cupW, cx: cx, wall: narrow ? 7 : 9,
      mw: mw, mh: mh, my: pad + 4, px: cx - cupW * 0.16, sxr: cx + cupW * 0.2,
      lx: narrow ? cw * 0.2 : cw * 0.24
    };
  }
  /** 杯子的梯形（內縮 ins） */
  function cupPoly(ins) {
    const a = G.cupW / 2 - ins, b = G.cupW * 0.38 - ins * 0.92;
    return [[G.cx - a, G.top], [G.cx + a, G.top], [G.cx + b, G.bot - ins], [G.cx - b, G.bot - ins]];
  }
  function polyPath(g, p) { g.beginPath(); p.forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); }
  /** 杯內半寬（y 處） */
  function halfAt(y, ins) {
    const a = G.cupW / 2 - ins, b = G.cupW * 0.38 - ins * 0.92;
    const f = (y - G.top) / (G.bot - ins - G.top);
    return a + (b - a) * Math.max(0, Math.min(1, f));
  }
  function liquidVol() {
    if (run.mode === 'solid') return run.liquid.V + run.nDis * run.solid.M / 1.6;   // 固體溶入的體積（示意）
    return (run.mode === 'mix' ? run.mix.Vb : run.cal.Vc) + run.x * (run.mode === 'mix' ? run.mix.Va : run.cal.Vh);
  }
  function liqY(V) { const f = 0.12 + 0.72 * Math.min(1, V / 220); return G.bot - G.wall - (G.cupH - G.wall - 10) * f; }

  // ======================= 畫圖工具 =======================
  function rich(g, ps, x, y, color, size, align, weight) {
    size = size || fsz(12);
    const f0 = (weight || '') + ' ' + size + 'px ' + LD.FONT, f1 = (weight || '') + ' ' + (size * 0.72).toFixed(1) + 'px ' + LD.FONT;
    let w = 0;
    ps.forEach(function (p) { g.font = p[1] ? f1 : f0; w += g.measureText(p[0]).width; });
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = color;
    ps.forEach(function (p) {
      g.font = p[1] ? f1 : f0;
      g.fillText(p[0], cx, y + (p[1] > 0 ? -size * 0.38 : p[1] < 0 ? size * 0.22 : 0));
      cx += g.measureText(p[0]).width;
    });
    return w;
  }
  function richW(g, ps, size, weight) {
    size = size || fsz(12);
    let w = 0;
    ps.forEach(function (p) { g.font = (weight || '') + ' ' + (p[1] ? (size * 0.72).toFixed(1) : size) + 'px ' + LD.FONT; w += g.measureText(p[0]).width; });
    return w;
  }
  function richPill(g, ps, x, y, color, size, align, weight) {
    size = size || fsz(12);
    const w = richW(g, ps, size, weight), h = size * 1.45;
    const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.save();
    g.fillStyle = LD.alpha(col.surface, col.dark ? 0.88 : 0.92);
    g.strokeStyle = LD.alpha(color, 0.45);
    g.lineWidth = 1;
    LD.roundRect(g, bx - 6, y - size * 1.02, w + 12, h, 6);
    g.fill(); g.stroke();
    g.restore();
    rich(g, ps, bx, y, color, size, 'left', weight);
    return w + 12;
  }
  function rr(g, x, y, w, h, r) { LD.roundRect(g, x, y, w, h, r); }
  /** 溫度造成的液體顏色 */
  function liquidColor(Tc) {
    const d = Math.max(-1, Math.min(1, (Tc - run.Troom) / 12));
    return d >= 0 ? LD.mix(col.water, col.hot, d * 0.62) : LD.mix(col.water, col.cold, -d * 0.62);
  }
  function lcd(g, x, y, w, h, main, sub) {
    g.save();
    const sg = g.createLinearGradient(0, y, 0, y + h);
    sg.addColorStop(0, LD.shade(col.muted, col.dark ? -0.35 : 0.55)); sg.addColorStop(1, LD.shade(col.muted, col.dark ? -0.55 : 0.25));
    g.fillStyle = sg;
    g.shadowColor = LD.shadowInk(0.25); g.shadowBlur = 8; g.shadowOffsetY = 3;
    rr(g, x, y, w, h, 9); g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = LD.alpha(col.text, 0.25); g.lineWidth = 1; g.stroke();
    g.fillStyle = LCD_BG;
    rr(g, x + 6, y + 6, w - 12, h - 12, 5); g.fill();
    g.fillStyle = LCD_FG;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 ' + fsz(17) + 'px ui-monospace, Consolas, monospace';
    g.fillText(main, x + w / 2, y + h * 0.4);
    g.font = fsz(10.5) + 'px ' + LD.FONT; g.fillStyle = LD.alpha(LCD_FG, 0.78);
    g.fillText(sub, x + w / 2, y + h * 0.74);
    if (state.recording) { g.fillStyle = (Math.floor(phase * 2) % 2) ? '#ff5a4f' : LD.alpha('#ff5a4f', 0.35); g.beginPath(); g.arc(x + 14, y + 14, 3.2, 0, 7); g.fill(); }
    g.restore();
  }
  /** 鋼製探棒 */
  function rod(g, x, y0, y1, w, color) {
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gr.addColorStop(0, LD.shade(color, -0.35)); gr.addColorStop(0.4, LD.shade(color, 0.45)); gr.addColorStop(1, LD.shade(color, -0.25));
    g.fillStyle = gr;
    rr(g, x - w / 2, y0, w, y1 - y0, w / 2); g.fill();
  }
  /** 波浪箭頭：從 (x, y) 沿方向 (ux, uy) 長 L */
  function wavyArrow(g, x, y, ux, uy, L, color, a, off) {
    const nx = -uy, ny = ux;
    g.save();
    g.strokeStyle = LD.alpha(color, a); g.fillStyle = LD.alpha(color, a);
    g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath();
    for (let s = 0; s <= L - 6; s += 1.5) {
      const w = Math.sin((s / L) * Math.PI * 3 - off * 6) * 3;
      const px = x + ux * s + nx * w, py = y + uy * s + ny * w;
      if (s) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
    const tx = x + ux * L, ty = y + uy * L;
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - ux * 8 + nx * 4.5, ty - uy * 8 + ny * 4.5); g.lineTo(tx - ux * 8 - nx * 4.5, ty - uy * 8 - ny * 4.5); g.closePath(); g.fill();
    g.restore();
  }

  // ======================= 畫面 =======================
  function drawHeatFlow(g) {
    const d = run.T - run.Troom;
    if (Math.abs(d) < 0.3) return;
    const out = d > 0, a = Math.min(0.85, 0.25 + Math.abs(d) / 6);
    const color = out ? col.hot : col.cold;
    const L = 22 + Math.min(14, Math.abs(d) * 1.5);
    const off = phase * (out ? 1 : -1);
    const ys = [G.top + G.cupH * 0.38, G.top + G.cupH * 0.7];
    ys.forEach(function (y) {
      const hw = halfAt(y, 0);
      [-1, 1].forEach(function (s) {
        const x0 = G.cx + s * (hw + 6);
        if (out) wavyArrow(g, x0, y, s, 0, L, color, a, off);
        else wavyArrow(g, x0 + s * L, y, -s, 0, L, color, a, off);
      });
    });
    const yTop = G.top - (run.lid ? 18 : 6);
    const n = run.lid ? 1 : 2, L2 = run.lid ? L * 0.8 : L * 1.25;
    for (let i = 0; i < n; i++) {
      const x = G.cx + (n === 1 ? G.cupW * 0.08 : (i ? 1 : -1) * G.cupW * 0.14);
      if (out) wavyArrow(g, x, yTop, 0, -1, L2, color, a * (run.lid ? 0.7 : 1), off);
      else wavyArrow(g, x, yTop - L2, 0, 1, L2, color, a * (run.lid ? 0.7 : 1), off);
    }
  }
  function drawCup(g) {
    const c = G;
    // 桌上的影子
    g.save();
    g.fillStyle = LD.shadowInk(col.dark ? 0.35 : 0.16);
    g.beginPath(); g.ellipse(c.cx + 6, c.bot + 3, c.cupW * 0.46, 7, 0, 0, 7); g.fill();
    g.restore();
    // 外杯（保麗龍）
    const outer = cupPoly(0);
    const fg = g.createLinearGradient(c.cx - c.cupW / 2, 0, c.cx + c.cupW / 2, 0);
    fg.addColorStop(0, col.foamShade); fg.addColorStop(0.35, col.foam); fg.addColorStop(0.75, col.foam); fg.addColorStop(1, col.foamShade);
    g.fillStyle = fg;
    polyPath(g, outer); g.fill();
    // 保麗龍的顆粒紋路
    g.save(); polyPath(g, outer); g.clip();
    g.fillStyle = LD.alpha(col.foamShade, col.dark ? 0.35 : 0.5);
    for (let i = 0; i < 70; i++) { const u = (i * 0.6180339) % 1, v = (i * 0.7548776) % 1; g.beginPath(); g.arc(c.cx - c.cupW / 2 + u * c.cupW, c.top + v * c.cupH, 1.1, 0, 7); g.fill(); }
    g.restore();
    // 剖面：內部
    const inner = cupPoly(c.wall);
    const ig = g.createLinearGradient(c.cx - c.cupW / 2, 0, c.cx + c.cupW / 2, 0);
    ig.addColorStop(0, LD.shade(col.foamShade, col.dark ? -0.3 : -0.07)); ig.addColorStop(0.5, LD.shade(col.foam, col.dark ? -0.2 : -0.03)); ig.addColorStop(1, LD.shade(col.foamShade, col.dark ? -0.36 : -0.12));
    g.fillStyle = ig;
    polyPath(g, inner); g.fill();
    // 兩層杯子的接縫
    g.save();
    g.strokeStyle = LD.alpha(col.text, 0.22); g.lineWidth = 1; g.setLineDash([3, 3]);
    polyPath(g, cupPoly(c.wall * 0.5)); g.stroke();
    g.restore();
    g.strokeStyle = LD.alpha(col.text, 0.35); g.lineWidth = 1.2;
    polyPath(g, outer); g.stroke();
    polyPath(g, inner); g.stroke();
  }
  function drawLiquid(g) {
    const c = G, inner = cupPoly(c.wall);
    const ly = liqY(liquidVol());
    const lc = liquidColor(run.T);
    g.save();
    polyPath(g, inner); g.clip();
    const lg = g.createLinearGradient(0, ly, 0, c.bot);
    lg.addColorStop(0, LD.alpha(lc, col.dark ? 0.62 : 0.55)); lg.addColorStop(1, LD.alpha(LD.shade(lc, -0.2), col.dark ? 0.78 : 0.72));
    g.fillStyle = lg;
    g.fillRect(c.cx - c.cupW, ly, c.cupW * 2, c.bot - ly);
    // 液面
    const hw = halfAt(ly, c.wall);
    g.strokeStyle = LD.alpha(LD.shade(lc, 0.5), 0.9); g.lineWidth = 2;
    g.beginPath(); g.moveTo(c.cx - hw, ly + 1); g.lineTo(c.cx + hw, ly + 1); g.stroke();
    // 混合中的漩渦（倒入的溶液或熱水還沒混勻）
    if (run.mode !== 'solid' && run.added && run.x < 0.98) {
      g.strokeStyle = LD.alpha(run.mode === 'cal' ? col.hot : col.text, 0.35 * (1 - run.x)); g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(c.cx + (k - 1) * 18, ly + 22 + k * 12, 16 + k * 4, 5, 0, phase * 4 + k, phase * 4 + k + 4); g.stroke(); }
    }
    g.restore();
    return ly;
  }
  function pelletColor() { return run.mode === 'solid' && run.solid.kind === 'X' ? col.pelletX : col.pellet; }
  function drawPellet(g, x, y, r, rot) {
    g.save();
    g.translate(x, y); g.rotate(rot);
    const pc = pelletColor();
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.2);
    gr.addColorStop(0, LD.shade(pc, 0.3)); gr.addColorStop(1, LD.shade(pc, -0.18));
    g.fillStyle = gr;
    g.strokeStyle = LD.alpha(col.text, 0.35); g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(0, 0, r * 1.25, r * 0.8, 0, 0, 7); g.fill(); g.stroke();
    g.restore();
  }
  /** 杯底尚未溶解的藥粒 */
  function drawPelletsInCup(g) {
    if (run.mode !== 'solid' || !run.added) return;
    const frac = 1 - run.nDis / run.solid.n;
    if (frac < 0.01) return;
    const k = Math.cbrt(frac);
    const dropP = addAnim >= 0 ? addAnim : 1;
    const bw = halfAt(G.bot - G.wall - 6, G.wall) * 0.85;
    pellets.forEach(function (p, i) {
      const r = 5.2 * p.r * k;
      const tx = G.cx - bw + p.u * bw * 2, ty = G.bot - G.wall - r * 0.8 - (i % 3) * 2;
      if (dropP < 1) {
        const pi = Math.min(1, Math.max(0, (dropP - (i / pellets.length) * 0.35) / 0.65));
        const sx = G.lx + p.gx * 30, sy = G.bot - 46 - p.gy * 6;
        const x = sx + (tx - sx) * pi, y = sy + (ty - sy) * pi - Math.sin(pi * Math.PI) * 80;
        if (pi > 0) drawPellet(g, x, y, 5.2 * p.r, p.rot + pi * 3);
        return;
      }
      drawPellet(g, tx, ty, r, p.rot);
      // 溶解的細流
      if (run.nDis / run.solid.n < 0.97 && !reducedMotion) {
        g.save(); g.strokeStyle = LD.alpha(pelletColor(), 0.45); g.lineWidth = 1;
        const yy = ty - r - 3 - ((phase * 14 + i * 7) % 16);
        g.beginPath(); g.moveTo(tx, ty - r); g.quadraticCurveTo(tx + 4, (ty - r + yy) / 2, tx, yy); g.stroke();
        g.restore();
      }
    });
  }
  /** 左邊：錶玻璃上的藥粒，或要倒入的燒杯 */
  function drawLeft(g) {
    const x = G.lx, by = G.bot;
    if (run.mode === 'solid') {
      // 錶玻璃與支架
      g.save();
      g.fillStyle = LD.shadowInk(col.dark ? 0.3 : 0.12);
      g.beginPath(); g.ellipse(x + 4, by + 2, 40, 5, 0, 0, 7); g.fill();
      g.strokeStyle = LD.alpha(col.glass, 0.9); g.lineWidth = 3;
      g.beginPath(); g.moveTo(x - 22, by); g.lineTo(x - 12, by - 36); g.moveTo(x + 22, by); g.lineTo(x + 12, by - 36); g.stroke();
      const gg = g.createLinearGradient(0, by - 50, 0, by - 36);
      gg.addColorStop(0, LD.alpha(col.glass, 0.15)); gg.addColorStop(1, LD.alpha(col.glass, 0.45));
      g.fillStyle = gg; g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x - 42, by - 50); g.quadraticCurveTo(x, by - 26, x + 42, by - 50); g.quadraticCurveTo(x, by - 36, x - 42, by - 50); g.fill(); g.stroke();
      g.restore();
      if (!run.added) pellets.forEach(function (p) { drawPellet(g, x + p.gx * 52, by - 44 - p.gy * 4 + Math.abs(p.gx) * 6, 5.2 * p.r, p.rot); });
      const kind = run.solid.kind;
      richPill(g, kind === 'X' ? [['X ' + num(run.solid.mass, 2) + ' g', 0]] : fP(kind).concat([[' ' + num(run.solid.mass, 2) + ' g', 0]]), x, by + fsz(13) * 1.25 + 4, col.text, fsz(G.narrow ? 11.5 : 12.5), 'center', '600');
      return;
    }
    // 燒杯（HCl 或熱水）
    const hot = run.mode === 'cal';
    const V = hot ? run.cal.Vh : run.mix.Va;
    const bw = G.narrow ? 46 : 56, bh = G.narrow ? 62 : 74;
    const p = addAnim >= 0 ? addAnim : (run.added ? 1 : 0);
    // 倒的動作：0–0.3 移到杯口、0.3–0.75 傾倒、0.75–1 回到桌上
    const lift = p < 0.3 ? p / 0.3 : p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
    const tilt = p < 0.3 ? 0 : p < 0.45 ? (p - 0.3) / 0.15 : p < 0.6 ? 1 : p < 0.75 ? 1 - (p - 0.6) / 0.15 : 0;
    const homeX = x, homeY = by;
    const pourX = G.cx - G.cupW / 2 - bw * 0.25, pourY = G.top - 30;
    const ox = homeX + (pourX - homeX) * lift, oy = homeY + (pourY - homeY) * lift;
    const ang = tilt * 1.75;
    const remain = run.added ? (addAnim >= 0 ? Math.max(1 - Math.min(1, (p - 0.3) / 0.35), 0) : 0) : 1;
    g.save();
    if (lift === 0) { g.fillStyle = LD.shadowInk(col.dark ? 0.3 : 0.12); g.beginPath(); g.ellipse(ox + 3, oy + 2, bw * 0.62, 5, 0, 0, 7); g.fill(); }
    g.translate(ox + bw / 2, oy);
    g.rotate(ang);
    const x0 = -bw, y0 = -bh;   // 以右下角為轉軸
    // 液體
    const lf = 0.2 + 0.7 * Math.min(1, V / 100);
    if (remain > 0.02) {
      const lh = (bh - 6) * lf * remain;
      g.save();
      rr(g, x0 + 3, y0 + 2, bw - 6, bh - 5, 4); g.clip();
      g.rotate(-ang);
      const lc = hot ? LD.mix(col.water, col.hot, Math.min(0.75, (run.cal.Th - run.Troom) / 50)) : col.water;
      g.fillStyle = LD.alpha(lc, col.dark ? 0.7 : 0.62);
      // 液面保持水平（大致）
      const cxr = -bw / 2, cyr = -3 - lh;
      g.fillRect(cxr - bh * 2, cyr + Math.sin(ang) * bw * 0.2 * (1 - remain), bh * 4, bh * 3);
      g.restore();
    }
    // 玻璃
    g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0 - 3, y0 - 2); g.lineTo(x0, y0); g.lineTo(x0, -3); g.quadraticCurveTo(x0, 0, x0 + 3, 0); g.lineTo(-3, 0); g.quadraticCurveTo(0, 0, 0, -3); g.lineTo(0, y0); g.lineTo(3, y0 - 4); g.stroke();
    g.fillStyle = LD.alpha('#ffffff', col.dark ? 0.06 : 0.25);
    g.fillRect(x0 + 4, y0 + 4, 5, bh - 10);
    g.restore();
    // 倒出的水流
    if (tilt > 0.6 && remain > 0.02) {
      const lipX = ox + bw / 2 + Math.sin(ang) * bh, lipY = oy - Math.cos(ang) * bh;
      const ly = liqY(liquidVol());
      g.save();
      g.strokeStyle = LD.alpha(hot ? LD.mix(col.water, col.hot, 0.4) : col.water, 0.85); g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(lipX, lipY); g.quadraticCurveTo(lipX + 14, lipY + 10, Math.max(lipX + 10, G.cx - G.cupW * 0.2), ly); g.stroke();
      g.restore();
    }
    // 熱水的蒸氣
    if (hot && lift === 0 && remain > 0.02 && run.cal.Th > 42 && !reducedMotion) {
      const n = Math.min(4, 1 + Math.floor((run.cal.Th - 40) / 10));
      g.save();
      g.strokeStyle = LD.alpha(col.muted, 0.45); g.lineWidth = 1.6; g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const sx2 = ox + (i - (n - 1) / 2) * 11, s0 = oy - bh - 4 - ((phase * 12 + i * 9) % 18);
        g.beginPath(); g.moveTo(sx2, s0); g.bezierCurveTo(sx2 - 5, s0 - 6, sx2 + 5, s0 - 12, sx2, s0 - 18); g.stroke();
      }
      g.restore();
    }
    if (lift === 0) {
      const lbl = hot ? [[T('熱水 ', 'Hot water ') + num(run.cal.Th, 1) + ' °C · ' + num(V, 0) + ' mL', 0]] :
        [['HCl ' + num(run.mix.ca, 2) + ' M · ' + num(V, 0) + ' mL', 0]];
      richPill(g, lbl, x, by + fsz(13) * 1.25 + 4, hot ? col.hot : col.text, fsz(G.narrow ? 11.5 : 12.5), 'center', '600');
    }
  }
  function cupLabel() {
    if (run.mode === 'solid') {
      const lq = run.liquid.kind === 'water' ? [[num(run.liquid.V, 0) + ' mL ' + T('水', 'water'), 0]] : [['HCl ' + num(run.liquid.c, 2) + ' M · ' + num(run.liquid.V, 0) + ' mL', 0]];
      return lq;
    }
    if (run.mode === 'mix') return [['NaOH ' + num(run.mix.cb, 2) + ' M · ' + num(run.mix.Vb, 0) + ' mL', 0]];
    return [[T('冷水 ', 'Cold water ') + num(run.cal.Vc, 0) + ' mL', 0]];
  }
  let kb = null;
  function drawStage() {
    if (!G || !cw || !run) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, cw, ch);
    // 桌面
    const tg = g.createLinearGradient(0, G.bot - 2, 0, ch);
    tg.addColorStop(0, LD.alpha(col.muted, col.dark ? 0.16 : 0.1)); tg.addColorStop(1, LD.alpha(col.muted, 0));
    g.fillStyle = tg; g.fillRect(0, G.bot - 2, cw, ch - G.bot + 2);
    drawHeatFlow(g);
    drawCup(g);
    // 攪拌棒的上下位置
    const stirring = run.stir && !reducedMotion && (state.recording || addAnim >= 0);
    const bob = stirring ? (Math.sin(phase * 5) + 1) / 2 : 0;
    const ly0 = liqY(liquidVol());
    const ringY = G.bot - G.wall - 12 - bob * Math.max(0, Math.min(36, (G.bot - G.wall - 12) - (ly0 + 14)));
    const ringRx = G.cupW * 0.26;
    // 攪拌環（液面下）與探棒
    g.save();
    g.strokeStyle = col.steel; g.lineWidth = 2.4;
    g.beginPath(); g.ellipse(G.cx, ringY, ringRx, 4.5, 0, 0, 7); g.stroke();
    g.restore();
    const stirL = (G.bot - G.wall - 12) - (G.top - 46), rTop = ringY - stirL, sxr = G.cx + ringRx;
    rod(g, sxr, rTop, ringY, 3, col.steel);
    rod(g, G.px, G.my + G.mh, G.bot - G.wall - 8, 6, col.steel);
    drawPelletsInCup(g);
    drawLiquid(g);
    // 杯蓋（加入時掀起）
    const lidUp = addAnim >= 0 ? Math.sin(Math.min(1, addAnim) * Math.PI) * 30 : 0;
    if (run.lid) {
      const lx0 = G.cx - G.cupW / 2 - 7, lw = G.cupW + 14, ly = G.top - 10 - lidUp;
      g.save();
      g.shadowColor = LD.shadowInk(0.25); g.shadowBlur = 6; g.shadowOffsetY = 2;
      const lg = g.createLinearGradient(0, ly, 0, ly + 11);
      lg.addColorStop(0, col.foam); lg.addColorStop(1, col.foamShade);
      g.fillStyle = lg;
      rr(g, lx0, ly, lw, 11, 4); g.fill();
      g.shadowColor = 'transparent';
      g.strokeStyle = LD.alpha(col.text, 0.35); g.lineWidth = 1; g.stroke();
      g.restore();
    }
    // 杯口上方的棒子（蓋子之上）
    rod(g, G.px, G.my + G.mh, G.top - 4 - lidUp, 6, col.steel);
    rod(g, sxr, rTop, G.top - 4 - lidUp, 3, col.steel);
    // 攪拌棒的握把
    g.save(); g.strokeStyle = col.steel; g.lineWidth = 2.4; g.beginPath(); g.arc(sxr, rTop - 6, 6, 0, 7); g.stroke(); g.restore();
    // 溫度計
    lcd(g, G.px - G.mw / 2, G.my, G.mw, G.mh, num(H.reading(run), 1) + ' °C',
      state.recording ? 't = ' + num(run.t, 0) + ' s' : state.started ? T('暫停', 'Paused') + ' · t = ' + num(run.t, 0) + ' s' : T('待命', 'Ready'));
    drawLeft(g);
    // 室溫
    richPill(g, [[T('室溫 ', 'Room ') + num(run.Troom, 1) + ' °C', 0]], G.pad + 6, G.pad + fsz(12) + 6, col.muted, fsz(12), 'left');
    // 杯子的標籤
    richPill(g, cupLabel(), G.cx, G.bot + fsz(13) * 1.25 + 4, col.text, fsz(G.narrow ? 11.5 : 12.5), 'center', '600');
    if (kb && kb.focused()) {
      const i = kb.index();
      const box = i === 0 ? [G.lx - 60, G.bot - 100, 120, 110] : [G.pad, G.pad, 130, fsz(12) + 18];
      g.save(); g.strokeStyle = col.accent; g.setLineDash([5, 4]); g.lineWidth = 2;
      rr(g, box[0], box[1], box[2], box[3], 10); g.stroke(); g.restore();
    }
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w;
    gh = w < 560 ? Math.round(Math.max(260, w * 0.78)) : 320;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function niceStep(span, k) {
    const raw = span / Math.max(1, k), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function decOf(step) { return step < 1 ? Math.min(6, Math.ceil(-Math.log10(step) - 1e-9)) : 0; }
  function axes(g, o) {
    const narrow = gw < 480;
    const Lm = narrow ? 44 : 54, Rm = 14, Tp = 30, B = narrow ? 40 : 42;
    const X0 = Lm, X1 = gw - Rm, Y0 = gh - B, Y1 = Tp;
    const sx = function (v) { return X0 + (v - o.x0) / (o.x1 - o.x0) * (X1 - X0); };
    const sy = function (v) { return Y0 - (v - o.y0) / (o.y1 - o.y0) * (Y0 - Y1); };
    g.save();
    g.strokeStyle = LD.alpha(col.text, col.dark ? 0.1 : 0.08);
    g.lineWidth = 1;
    const xs = niceStep(o.x1 - o.x0, narrow ? 4 : 6), ys = niceStep(o.y1 - o.y0, 5);
    g.font = fsz(11) + 'px ' + LD.FONT;
    g.fillStyle = col.muted;
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let v = Math.ceil(o.x0 / xs - 1e-9) * xs; v <= o.x1 + 1e-9; v += xs) {
      const X = Math.round(sx(v)) + 0.5;
      g.beginPath(); g.moveTo(X, Y1); g.lineTo(X, Y0); g.stroke();
      g.fillText(num(v, decOf(xs)), X, Y0 + 4);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(o.y0 / ys - 1e-9) * ys; v <= o.y1 + 1e-9; v += ys) {
      const Y = Math.round(sy(v)) + 0.5;
      g.beginPath(); g.moveTo(X0, Y); g.lineTo(X1, Y); g.stroke();
      g.fillText(num(v, decOf(ys)), X0 - 5, Y);
    }
    g.strokeStyle = LD.alpha(col.text, 0.55);
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(X0, Y1); g.lineTo(X0, Y0); g.lineTo(X1, Y0); g.stroke();
    if (o.xl) rich(g, o.xl, (X0 + X1) / 2, gh - 6, col.muted, fsz(12), 'center');
    if (o.yl) rich(g, o.yl, 4, 16, col.muted, fsz(12), 'left');
    g.restore();
    return { sx: sx, sy: sy, X0: X0, X1: X1, Y0: Y0, Y1: Y1 };
  }
  function line(g, pts, color, width, dash) {
    if (pts.length < 2) return;
    g.save();
    g.strokeStyle = color; g.lineWidth = width || 2; g.lineJoin = 'round';
    if (dash) g.setLineDash(dash);
    g.beginPath();
    pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.stroke();
    g.restore();
  }
  function drawMsg(g, text) {
    g.save();
    g.fillStyle = col.muted; g.font = fsz(13) + 'px ' + LD.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = text.split(/(?<=[，。：；、,.;:\s])/);
    const out = []; let lt = '';
    words.forEach(function (w) { if (g.measureText(lt + w).width > gw - 40 && lt) { out.push(lt); lt = w; } else lt += w; });
    if (lt) out.push(lt);
    const y = gh / 2 - (out.length - 1) * 11;
    out.forEach(function (l, i) { g.fillText(l.trim(), gw / 2, y + i * 22); });
    g.restore();
  }
  function arrowV(g, x, y0, y1, color) {
    if (Math.abs(y1 - y0) < 4) return;
    const s = y1 > y0 ? 1 : -1;
    g.save();
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1 - s * 7); g.stroke();
    g.beginPath(); g.moveTo(x, y1); g.lineTo(x - 5, y1 - s * 9); g.lineTo(x + 5, y1 - s * 9); g.closePath(); g.fill();
    g.restore();
  }
  function drawGraph() {
    if (!gw || !run) return;
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col.bg; g.fillRect(0, 0, gw, gh);
    if (state.tab === 'curve') drawCurve(g); else drawHess(g);
    updateLegend();
  }
  function drawCurve(g) {
    if (rows.length < 2) { drawMsg(g, T('按「開始記錄」後，溫度—時間圖會畫在這裡。', 'Press “Start recording” and the temperature–time graph appears here.')); return; }
    const tl = lastT();
    const xMax = tl <= 120 ? 120 : tl <= 300 ? 300 : tl <= 600 ? 600 : tl <= 1200 ? 1200 : tl <= 1800 ? 1800 : 3600;
    let lo = Infinity, hi = -Infinity;
    rows.forEach(function (r) { lo = Math.min(lo, r[1]); hi = Math.max(hi, r[1]); });
    const A = analysis();
    if (A && A.fitOk) { const y = A.fit.a + A.fit.b * run.tAdd; lo = Math.min(lo, y); hi = Math.max(hi, y); }
    lo = Math.min(lo, run.Troom); hi = Math.max(hi, run.Troom);
    const padY = Math.max(0.5, (hi - lo) * 0.12);
    const Ax = axes(g, { x0: 0, x1: xMax, y0: Math.floor((lo - padY) * 2) / 2, y1: Math.ceil((hi + padY) * 2) / 2, xl: [['t（s）', 0]], yl: [['T（°C）', 0]] });
    g.save();
    g.beginPath(); g.rect(Ax.X0, Ax.Y1, Ax.X1 - Ax.X0, Ax.Y0 - Ax.Y1); g.clip();
    // 室溫
    line(g, [[Ax.X0, Ax.sy(run.Troom)], [Ax.X1, Ax.sy(run.Troom)]], LD.alpha(col.muted, 0.6), 1, [2, 4]);
    if (run.added) {
      const X = Ax.sx(run.tAdd);
      line(g, [[X, Ax.Y1], [X, Ax.Y0]], LD.alpha(col.text, 0.45), 1.2, [5, 4]);
      if (A && state.meth === 'ext') {
        const ta = val(el.ta), tb = val(el.tb);
        g.fillStyle = LD.alpha(col.probe, col.dark ? 0.14 : 0.1);
        g.fillRect(Ax.sx(ta), Ax.Y1, Ax.sx(tb) - Ax.sx(ta), Ax.Y0 - Ax.Y1);
      }
    }
    // 數據
    line(g, rows.map(function (r) { return [Ax.sx(r[0]), Ax.sy(r[1])]; }), col.pos, 2.2);
    if (A) {
      // T0 基線
      line(g, [[Ax.sx(Math.max(0, run.tAdd - 30)), Ax.sy(A.T0)], [Ax.sx(run.tAdd) + 30, Ax.sy(A.T0)]], col.text, 1.6);
      if (state.meth === 'ext' && A.fitOk) {
        const tb = val(el.tb);
        line(g, [[Ax.sx(run.tAdd), Ax.sy(A.fit.a + A.fit.b * run.tAdd)], [Ax.sx(tb), Ax.sy(A.fit.a + A.fit.b * tb)]], col.probe, 2, [7, 5]);
        arrowV(g, Ax.sx(run.tAdd) - 8, Ax.sy(A.T0), Ax.sy(A.T0 + A.dText), col.probe);
        LD.ball(g, Ax.sx(run.tAdd), Ax.sy(A.T0 + A.dText), 4.5, col.probe, { glow: 0 });
      } else if (state.meth === 'raw') {
        line(g, [[Ax.sx(run.tAdd), Ax.sy(A.Text)], [Ax.sx(A.tExt), Ax.sy(A.Text)]], col.accent, 1.2, [3, 3]);
        arrowV(g, Ax.sx(A.tExt) + 8, Ax.sy(A.T0), Ax.sy(A.Text), col.accent);
        LD.ball(g, Ax.sx(A.tExt), Ax.sy(A.Text), 4.5, col.accent, { glow: 0 });
      }
    }
    g.restore();
    if (run.added) LD.pill(g, T('加入', 'Added'), Ax.sx(run.tAdd) + 4, Ax.Y1 + 14, col.muted, 'left', fsz(11) + 'px ' + LD.FONT);
    if (A && A.dT != null) {
      const txt = 'ΔT = ' + signed(A.dT, 2) + ' °C';
      LD.pill(g, txt, Ax.X1 - 4, Ax.Y1 + 14, state.meth === 'ext' ? col.probe : col.accent, 'right', '600 ' + fsz(12) + 'px ' + LD.FONT);
    }
  }
  /** 赫斯循環：三個焓的能階 */
  function drawHess(g) {
    const hs = hessNow();
    const narrow = gw < 480;
    const fs = fsz(narrow ? 11.5 : 12.5);
    const top = 34, bottom = gh - 46;
    const sc = (bottom - top) / Math.abs(H.DH3);
    const yT = top, yM = top + Math.abs(H.SOLIDS.NaOH.dH) * sc, yB = bottom;
    const xL0 = narrow ? 10 : 30, xL1 = gw * 0.62, xR0 = gw * 0.38, xR1 = gw - (narrow ? 10 : 30);
    const lvl = function (x0, x1, y, ps) {
      g.save(); g.strokeStyle = col.text; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.restore();
      rich(g, ps, (x0 + x1) / 2, y - 7, col.text, fs, 'center', '600');
    };
    lvl(xL0, xR1, yT, [['NaOH(s) + HCl(aq)', 0]]);
    lvl(xL0, xL1, yM, [['Na', 0], ['+', 1], ['(aq) + OH', 0], ['−', 1], ['(aq) + HCl(aq)', 0]]);
    lvl(xL0, xR1, yB, [['NaCl(aq) + H', 0], ['2', -1], ['O(l)', 0]]);
    const lab = function (x, y, sub, v, ref, color, align) {
      const name = [['ΔH', 0], [sub, -1], [' = ', 0]];
      const vs = v == null ? '?' : num(v, 1);
      rich(g, name.concat([[vs, 0]]), x, y, color, fs * 1.05, align, '700');
      rich(g, [[T('參考 ', 'ref. ') + num(ref, 2), 0]], x, y + fs * 1.35, col.muted, fs * 0.9, align);
    };
    const x1 = narrow ? gw * 0.16 : gw * 0.2, x3 = gw * 0.8;
    arrowV(g, x1, yT + 4, yM - 4, col.accent);
    arrowV(g, x1, yM + 4, yB - 4, col.neg);
    arrowV(g, x3, yT + 4, yB - 4, col.pos);
    lab(x1 + 10, (yT + yM) / 2 + 2, '1', hs.h1, H.SOLIDS.NaOH.dH, col.accent, 'left');
    lab(x1 + 10, (yM + yB) / 2 + 2, '2', hs.h2, H.DH_NEUT, col.neg, 'left');
    lab(x3 - 10, (yT + yB) / 2 + 2, '3', hs.h3, H.DH3, col.pos, 'right');
    let foot;
    if (hs.h1 != null && hs.h2 != null && hs.h3 != null) {
      const s = hs.h1 + hs.h2;
      foot = [['ΔH', 0], ['1', -1], [' + ΔH', 0], ['2', -1], [' = ' + num(s, 1) + T('　；　', ';  ') + 'ΔH', 0], ['3', -1], [' = ' + num(hs.h3, 1) + T('（相差 ', ' (difference ') + pct(s / hs.h3 - 1) + T('）', ')'), 0]];
    } else foot = [[T('量到的值會填進來（kJ/mol）：「分析」卡按「計算」', 'Measured values appear here (kJ/mol): press “Calculate” on the “Analysis” card'), 0]];
    rich(g, foot, gw / 2, gh - 14, col.text, fsz(12), 'center');
  }
  let legendKey = '';
  function updateLegend() {
    const key = state.tab + state.meth + (col.dark ? 1 : 0) + (window.LabSettings ? window.LabSettings.get('lang') : '');
    if (key === legendKey) return;
    legendKey = key;
    const ln = function (c, t, dash) { return '<span><span class="ln' + (dash ? ' dash' : '') + '" style="' + (dash ? 'color:' + c : 'background:' + c) + '"></span>' + t + '</span>'; };
    const box = function (c, t) { return '<span><span class="box" style="background:' + c + '"></span>' + t + '</span>'; };
    if (state.tab === 'curve') {
      let h = ln(col.pos, T('溫度計讀數', 'Thermometer reading')) + ln(col.text, T('加入前的溫度 T<sub>0</sub>', 'Starting temperature T<sub>0</sub>'));
      if (state.meth === 'ext') h += ln(col.probe, T('冷卻直線外插', 'Extrapolated cooling line'), true) + box(LD.alpha(col.probe, 0.25), T('擬合範圍', 'Fitting range'));
      else h += ln(col.accent, T('最高（最低）讀數', 'Highest (lowest) reading'), true);
      $('gLegend').innerHTML = h;
      $('gHint').innerHTML = state.meth === 'ext' ?
        T('外插法：用冷卻段的直線，往回延伸到加入的時刻，當作「沒有熱散失」時的溫度。擬合範圍要從反應完成以後開始。', 'Extrapolation: extend the straight cooling line back to the moment of adding and take that as the temperature with no heat loss. Start the fitting range after the reaction has finished.') :
        T('最高溫度法：直接用加入後的最高（吸熱時最低）讀數。熱一邊產生一邊散失，所以會低估。', 'Highest reading: use the highest (or, if endothermic, lowest) reading after adding. Heat is lost while it is still being produced, so this underestimates ΔT.');
    } else {
      $('gLegend').innerHTML = '';
      $('gHint').innerHTML = T('三個值取自這一段實驗（按「全部清除」重新開始）最新的計算：NaOH 溶於水、溶液中和、NaOH 固體加入足量鹽酸。', 'The three values are the latest calculations in this series (press “Clear all” to start a new one): NaOH dissolving in water, the neutralisation, and solid NaOH in excess hydrochloric acid.');
    }
  }

  // ======================= 讀數、分析卡、結果表 =======================
  function updateReadouts() {
    if (!run) return;
    const r = H.reading(run);
    const items = [[T('溫度計讀數', 'Thermometer'), num(r, 1) + ' °C', 'big'], [T('記錄時間', 'Time recorded'), num(run.t, 0) + ' s']];
    if (run.added) items.push([T('加入後', 'Since adding'), num(run.t - run.tAdd, 0) + ' s']);
    if (run.mode === 'solid') {
      const f = run.added ? run.nDis / run.solid.n : 0;
      items.push([T('已溶解', 'Dissolved'), num(f * 100, f > 0.995 ? 0 : 1) + '%']);
    } else if (run.added) items.push([T('已混合', 'Mixed'), num(run.x * 100, run.x > 0.995 ? 0 : 1) + '%']);
    $('readout').innerHTML = items.map(function (it) { return '<dt>' + it[0] + '</dt><dd' + (it[2] ? ' class="' + it[2] + '"' : '') + '>' + it[1] + '</dd>'; }).join('');
    updateAna();
    if (!statusOverride) statusEl.innerHTML = autoStatus();
    cv.setAttribute('aria-label', T('簡易卡計，溫度計讀數 ', 'Simple calorimeter; thermometer reads ') + num(r, 1) + ' °C');
  }
  function updateAna() {
    const A = analysis();
    const out = [];
    $('fitRows').hidden = state.meth !== 'ext';
    if (!A) out.push([T('先記錄、加入，再分析', 'Record and add first'), '—']);
    else {
      out.push([T('加入前的溫度 T<sub>0</sub>', 'Starting temperature T<sub>0</sub>'), num(A.T0, 2) + ' °C']);
      out.push([(A.exo ? T('最高讀數', 'Highest reading') : T('最低讀數', 'Lowest reading')) + '<small>t = ' + num(A.tExt, 0) + ' s</small>', num(A.Text, 1) + ' °C']);
      if (state.meth === 'ext') out.push([T('外插到加入時刻', 'Extrapolated to the moment of adding'), A.fitOk ? num(A.T0 + A.dText, 2) + ' °C' : T('點太少', 'too few points')]);
      out.push(['ΔT', A.dT == null ? '—' : signed(A.dT, 2) + ' °C', 'big']);
      out.push([run.mode === 'cal' ? T('冷水 + 熱水的質量', 'Mass of cold + hot water') : T('溶液的質量 m', 'Mass of solution m') + (run.mode === 'solid' ? '<small>' + T('含溶入的固體', 'including the dissolved solid') + '</small>' : ''), num(A.m, 2) + ' g']);
    }
    $('anaOut').innerHTML = out.map(function (it) { return '<dt>' + it[0] + '</dt><dd' + (it[2] ? ' class="' + it[2] + '"' : '') + '>' + it[1] + '</dd>'; }).join('');
    $('anaInputs').hidden = run.mode === 'cal';
    $('calc').textContent = run.mode === 'cal' ? T('計算卡計的熱容量', 'Find the heat capacity') : T('計算 ΔH', 'Calculate ΔH');
    $('inNLabel').innerHTML = run.mode === 'mix' ? T('生成的水 n（mol）', 'Water formed, n (mol)') :
      run.mode === 'solid' ? (run.solid.kind === 'X' ? 'X' : fH(run.solid.kind)) + T(' 的莫耳數 n（mol）', ': amount n (mol)') : 'n（mol）';
  }
  function renderTable() {
    const t = $('tbl');
    let h = '<thead><tr><th>#</th><th style="text-align:left">' + T('實驗', 'Experiment') + '</th><th>' + T('方法', 'Method') + '</th><th>ΔT<br><small>°C</small></th><th>C<br><small>J/K</small></th><th>n<br><small>mol</small></th><th>ΔH<br><small>kJ/mol</small></th><th>' + T('參考', 'Ref.') + '<br><small>kJ/mol</small></th></tr></thead><tbody>';
    if (!results.length) h += '<tr class="empty"><td colspan="8">' + T('還沒有結果：「分析」卡按「計算」後會列在這裡。', 'No results yet: they are listed here after you press “Calculate” on the “Analysis” card.') + '</td></tr>';
    results.forEach(function (r, i) {
      const hideRef = r.kind === 'dis-X' && unk && r.unkId === unk.id && !unk.revealed;
      const refTxt = r.kind === 'cal' ? T('設定 ', 'set ') + H.C_CAL + ' J/K' : r.ref == null ? '—' : hideRef ? '?' : num(r.ref, 2) + ' <small>(' + pct(r.err) + ')</small>';
      h += '<tr' + (r.seg !== seg ? ' style="opacity:.55"' : '') + '><td>' + (i + 1) + '</td><td class="l">' + kindLabel(r.kind, r) + '</td><td>' + (r.meth === 'ext' ? T('外插', 'extrap.') : T('最高', 'peak')) + '</td><td>' + signed(r.dT, 2) + '</td><td>' +
        (r.kind === 'cal' ? '<strong>' + num(r.Ccal, 1) + '</strong>' : sigf(r.C, 3)) + '</td><td>' + (r.n == null ? '—' : sigf(r.n, 3)) + '</td><td>' + (r.dH == null ? '—' : '<strong>' + num(r.dH, 1) + '</strong>') + '</td><td>' + refTxt + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  let statusOverride = '';
  function setStatus(s) { statusOverride = s; statusEl.innerHTML = s || autoStatus(); }
  function autoStatus() {
    if (!run) return '';
    if (!state.started) return T('按「開始記錄」，先記錄 30 秒左右加入前的溫度，再按「加入」。', 'Press “Start recording”, record about 30 s before adding, then press “Add”.');
    if (!run.added) return state.recording ? T('正在記錄加入前的溫度（', 'Recording the starting temperature (') + num(run.t, 0) + ' s' + T('）……準備好就按「加入」。', ')… press “Add” when you are ready.') : T('暫停中。', 'Paused.');
    return state.recording ? T('記錄中：溫度計每 2 秒記一筆。', 'Recording: one reading every 2 s.') : T('暫停中：可以先分析已記錄的數據。', 'Paused: you can analyse the data recorded so far.');
  }

  // ======================= 切換 =======================
  function syncSegs() {
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
    document.querySelectorAll('#solidSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.solid === state.solid)); });
    document.querySelectorAll('#liqSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.liq === state.liq)); });
    document.querySelectorAll('#methSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.meth === state.meth)); });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab)); });
    [0, 1, 2, 3].forEach(function (k) { $('sp' + k).setAttribute('aria-pressed', String(k === state.speed)); });
    $('solidCtl').hidden = state.mode !== 'solid';
    $('mixCtl').hidden = state.mode !== 'mix';
    $('calCtl').hidden = state.mode !== 'cal';
    $('liqCRow').hidden = state.liq !== 'HCl';
  }
  function refreshAll() {
    updateReadouts();
    renderTable();
    drawStage();
    drawGraph();
    startLoop();
  }
  function changed(msg) {
    acted();
    newRun();
    setStatus(msg === undefined ? (rows.length > 1 ? '' : T('設定已改變：杯子倒掉、重新開始。', 'Settings changed: the cup has been emptied for a new run.')) : msg);
    refreshAll();
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // ======================= 事件 =======================
  [el.mass, el.liqV, el.liqC, el.cb, el.Vb, el.ca, el.Va, el.Vc, el.Vh, el.Th, el.Troom].forEach(function (e) {
    e.addEventListener('input', function () { if (!syncing) changed(); });
  });
  [el.lid, el.stir].forEach(function (e) { e.addEventListener('change', function () { changed(); }); });
  [el.ta, el.tb].forEach(function (e) {
    e.addEventListener('input', function () {
      if (syncing) return;
      acted(); fitTouched = true;
      if (val(el.ta) > val(el.tb)) { if (e === el.ta) setVal(el.tb, val(el.ta)); else setVal(el.ta, val(el.tb)); }
      updateAna(); drawGraph();
    });
  });
  document.querySelectorAll('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.mode === state.mode) return; state.mode = b.dataset.mode; syncSegs(); changed(''); }); });
  document.querySelectorAll('#solidSeg button').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.solid === state.solid) return; state.solid = b.dataset.solid; syncSegs(); changed(''); }); });
  document.querySelectorAll('#liqSeg button').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.liq === state.liq) return; state.liq = b.dataset.liq; syncSegs(); changed(''); }); });
  document.querySelectorAll('#methSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.meth = b.dataset.meth; syncSegs(); updateAna(); drawGraph(); }); });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.tab = b.dataset.tab; syncSegs(); drawGraph(); }); });
  $('play').addEventListener('click', function () { acted(); togglePlay(); });
  $('addBtn').addEventListener('click', doAdd);
  $('restart').addEventListener('click', function () { changed(T('杯子已經倒掉洗乾淨，同樣的設定重新開始。', 'The cup has been emptied and rinsed: same settings, new run.')); });
  $('clearAll').addEventListener('click', function () {
    acted();
    results = []; seg++;
    renderTable(); drawGraph();
    setStatus(T('已清除結果表與赫斯循環（目前這杯的記錄保留）。', 'The results table and the Hess cycle have been cleared (the current run is kept).'));
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
  $('calc').addEventListener('click', calc);
  ['inC', 'inN'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); calc(); } }); });
  $('unkOn').addEventListener('click', startUnknown);
  $('unkNew').addEventListener('click', startUnknown);
  $('unkOff').addEventListener('click', stopUnknown);
  $('reveal').addEventListener('click', reveal);

  /** 程式代替使用者改滑桿（會觸發一般的 input 事件流程） */
  function setValUser(e, v) { if (window.LabNum) window.LabNum.set(e, v); else { e.value = v; e.dispatchEvent(new Event('input')); } }
  if (window.LabKeys) {
    const stepIn = function (e, d, big) {
      const st = +e.step || 1, lo = +e.min, hi = +e.max;
      setValUser(e, Math.max(lo, Math.min(hi, Math.round((val(e) + d * st * (big ? 10 : 1)) / st) * st)));
    };
    const mainEl = function () { return state.mode === 'solid' ? el.mass : state.mode === 'mix' ? el.Va : el.Th; };
    kb = window.LabKeys.attach(cv, {
      label: T('實驗畫面。空白鍵開始或暫停記錄，A 鍵加入。按 Enter 切換要調整的項目，方向鍵改變數值，Shift 加方向鍵改變得更多。', 'Experiment. Space starts or pauses recording; A adds. Press Enter to pick what to adjust; the arrow keys change it; hold Shift for bigger steps.'),
      items: [
        { name: function () { return state.mode === 'solid' ? T('固體的質量', 'Mass of solid') : state.mode === 'mix' ? T('倒入的鹽酸體積', 'Volume of HCl poured in') : T('熱水的溫度', 'Temperature of the hot water'); },
          move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; stepIn(mainEl(), d, big); return true; },
          describe: function () { const e = mainEl(); return (state.mode === 'solid' ? num(val(e), 2) + ' g' : state.mode === 'mix' ? num(val(e), 0) + ' mL' : num(val(e), 1) + ' °C') + T('，讀數 ', ', reading ') + num(H.reading(run), 1) + ' °C'; } },
        { name: function () { return T('室溫', 'Room temperature'); },
          move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; stepIn(el.Troom, d, big); return true; },
          describe: function () { return num(val(el.Troom), 1) + ' °C'; } }
      ],
      onChange: function () { drawStage(); }
    });
    cv.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); acted(); togglePlay(); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); doAdd(); }
    });
  }

  function buildDataTable() {
    const t = $('dataTable');
    if (!t) return;
    const rowsD = [
      ['NaOH(s) → Na<sup>+</sup>(aq) + OH<sup>−</sup>(aq)', H.SOLIDS.NaOH.dH, T('CRC 手冊', 'CRC Handbook')],
      ['NH<sub>4</sub>NO<sub>3</sub>(s) → NH<sub>4</sub><sup>+</sup>(aq) + NO<sub>3</sub><sup>−</sup>(aq)', H.SOLIDS.NH4NO3.dH, T('CRC 手冊', 'CRC Handbook')],
      ['H<sup>+</sup>(aq) + OH<sup>−</sup>(aq) → H<sub>2</sub>O(l)', H.DH_NEUT, T('由生成焓算出', 'from enthalpies of formation')],
      ['NaOH(s) + H<sup>+</sup>(aq) → Na<sup>+</sup>(aq) + H<sub>2</sub>O(l)', H.DH3, T('赫斯定律：第 1、3 式相加', "Hess's law: sum of the first and third rows")]
    ];
    let h = '<thead><tr><th style="text-align:left">' + T('反應', 'Reaction') + '</th><th>ΔH<br><small>kJ/mol</small></th><th style="text-align:left">' + T('來源', 'Source') + '</th></tr></thead><tbody>';
    rowsD.forEach(function (r) { h += '<tr><td class="l">' + r[0] + '</td><td>' + signed(r[1], 2) + '</td><td class="l">' + r[2] + '</td></tr>'; });
    t.innerHTML = h + '</tbody>';
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

  // 任務：每 0.5 秒回報一次目前的狀態
  function tickData() {
    const A = run.added ? H.analyze(rows, run.tAdd, 0, 0) : null;
    const T0 = A ? A.T0 : run.Troom, r = H.reading(run);
    return {
      mode: run.mode, kind: run.mode === 'solid' ? run.solid.kind : null, liquid: run.mode === 'solid' ? run.liquid.kind : null,
      added: run.added, recording: state.recording, T0: T0, reading: r, dT: r - T0, Troom: run.Troom, peak: peak, t: run.t, tAdd: run.tAdd
    };
  }
  setInterval(function () { if (userActed && window.LabMission) window.LabMission.emit('tick', tickData()); }, 500);

  // 測試用（Playwright）：讀取目前狀態、快轉
  window.__hl = {
    state: state, run: function () { return run; }, rows: function () { return rows; }, results: function () { return results; }, unk: function () { return unk; },
    tick: tickData, analysis: analysis, ffwd: function (sec) { if (state.recording) { advance(sec); updateReadouts(); drawGraph(); } }
  };

  // ======================= 啟動 =======================
  readColors();
  cw = cv.clientWidth || 600; ch = 420; layout();
  syncSegs();
  newRun();
  buildDataTable();
  updateSoundButton();
  setUnkUI();
  resize();
  refreshAll();
})();
