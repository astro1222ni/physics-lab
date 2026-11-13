/*
 * buffer-solutions.js — 「緩衝溶液」的頁面程式（兩個燒杯、操作、讀數、曲線、數據表、音效、任務事件、3D 切換）
 * 化學核心在 js/buffer-solutions-core.js（BufCore）；3D 微觀檢視在 js/buffer-solutions-3d.js（BufSol3D）。
 * 畫面只「讀」核心算出的 pH 與莫耳數；顏色漸變、液滴落下都只是畫面效果，不影響任何數值。
 *
 * 任務事件（只在使用者操作之後送出，資料由 BufCore.mixData／addData 產生，欄位說明見 js/missions/buffer-solutions.js）：
 *   'mix'：改了緩衝系統、濃度、體積、對照，或按「換新的兩杯」「全部清除」之後
 *   'add'：每按一次「加入 HCl」「加入 NaOH」「加水稀釋」
 * 測試介面：window.__bs
 */
(function () {
  'use strict';
  const K = window.BufCore, LD = window.LabDraw;
  if (!K || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reduced = LD.reducedMotion();

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function signed(x, d) { const s = num(x, d); return x > 0 && s !== num(0, d) ? '+' + s : s; }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 4) return { m: num(x, Math.max(0, (sig || 3) - 1 - e)), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) {
    const p = sciParts(x, sig);
    return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>';
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    x = roundSig(x, sig || 3);
    const e = Math.floor(Math.log10(Math.abs(x)) + 1e-9);
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  function roundSig(x, s) { if (!x) return 0; const e = Math.floor(Math.log10(Math.abs(x))); const f = Math.pow(10, s - 1 - e); return Math.round(x * f) / f; }
  /** 濃度（M）：一律用小數，三位有效數字 */
  function conc(c) { return sigf(c, 3); }
  /** 莫耳數（mmol）的 HTML：很小時用科學記號 */
  function mmolHTML(x) { return Math.abs(x) >= 0.01 || x === 0 ? sigf(x, 3) : sciHTML(x, 3); }
  const f2 = function (x) { return num(x, 2); };

  // ======================= 系統與名稱 =======================
  const SYS = {
    ac: { HA: 'CH<sub>3</sub>COOH', A: 'CH<sub>3</sub>COO<sup>−</sup>', acidF: 'CH<sub>3</sub>COOH', baseF: 'CH<sub>3</sub>COONa',
      acid: ['醋酸', 'acetic acid'], base: ['醋酸鈉', 'sodium acetate'], Acid: ['醋酸', 'Acetic acid'], Base: ['醋酸鈉', 'Sodium acetate'] },
    ph: { HA: 'H<sub>2</sub>PO<sub>4</sub><sup>−</sup>', A: 'HPO<sub>4</sub><sup>2−</sup>', acidF: 'NaH<sub>2</sub>PO<sub>4</sub>', baseF: 'Na<sub>2</sub>HPO<sub>4</sub>',
      acid: ['磷酸二氫鈉', 'sodium dihydrogenphosphate'], base: ['磷酸氫二鈉', 'disodium hydrogenphosphate'], Acid: ['磷酸二氫鈉', 'NaH2PO4'], Base: ['磷酸氫二鈉', 'Na2HPO4'] },
    nh: { HA: 'NH<sub>4</sub><sup>+</sup>', A: 'NH<sub>3</sub>', acidF: 'NH<sub>4</sub>Cl', baseF: 'NH<sub>3</sub>',
      acid: ['氯化銨', 'ammonium chloride'], base: ['氨', 'ammonia'], Acid: ['氯化銨', 'Ammonium chloride'], Base: ['氨', 'Ammonia'] }
  };
  const L2 = function (a) { return T(a[0], a[1]); };
  /** HTML 化學式 → 畫布用的片段 [文字, 0 一般 / −1 下標 / 1 上標] */
  function partsOf(html) {
    const out = [];
    html.replace(/<(sub|sup)>(.*?)<\/\1>|([^<]+)/g, function (m, tag, inner, plain) {
      if (plain) out.push([plain, 0]); else out.push([inner, tag === 'sub' ? -1 : 1]);
      return m;
    });
    return out;
  }
  const H3O = 'H<sub>3</sub>O<sup>+</sup>', OHm = 'OH<sup>−</sup>', H2O = 'H<sub>2</sub>O';
  function lowerName(n) { return n.replace(/^(Pure|The|Acetic|Sodium|Ammonium|Ammonia)\b/, function (m) { return m.toLowerCase(); }); }
  function cmpName(c, sys) {
    const S = SYS[sys || state.sys];
    switch (c || state.comp) {
      case 'same': return run && run.cmp.Na > 0 ? T('同 pH 的 NaOH', 'NaOH, same pH') : T('同 pH 的 HCl', 'HCl, same pH');
      case 'dil10': return T('稀釋 10 倍的緩衝溶液', 'The buffer ÷ 10');
      case 'acid': return T('只有' + S.acid[0], S.Acid[1] + ' only');
      case 'base': return T('只有' + S.base[0], S.Base[1] + ' only');
      default: return T('純水', 'Pure water');
    }
  }

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, grid: c.grid, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk,
      HA: dk ? '#f0a24a' : '#d9822b', A: dk ? '#6aa2ee' : '#2f6fd0', H3O: dk ? '#ff6b5e' : '#e0483a', OH: dk ? '#b08cff' : '#7a4fd6', Hatom: dk ? '#eef1f5' : '#f4f6f9',
      cmp: dk ? '#c7a14a' : '#9a6b12'
    };
  }
  function rgbStr(a, al) { return al == null ? 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')' : 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + al + ')'; }
  /** 溶液的顏色：萬用指示劑（關掉時是幾乎無色的水） */
  function liquidRGB(pH) {
    if (!state.uind) return col.dark ? [120, 150, 180] : [200, 222, 240];
    return K.uiColor(pH);
  }

  // ======================= 狀態 =======================
  const state = { sys: 'ac', CHA: 0.1, CA: 0.1, V0: 100, comp: 'water', cs: 1, amt: 0.05, uind: true, theory: false, band: true, view: '2d' };
  let run = null;          // BufCore.createRun 的結果
  let runNo = 0;           // 第幾次配製（3D 用來判斷要不要重建）
  let archive = [];        // 舊的曲線 { p, pts }
  let rows = [];           // 數據表
  let userActed = false;
  let broke = false;       // 這一杯是否已經超出 pKa ± 1
  let view3 = null;
  const disp = [7, 7];     // 畫面上溶液顏色用的 pH（慢慢趨近真實值，只是畫面）
  const drops = [];        // 正在落下的液滴 { kind, t0 }
  const ripples = [];      // 液面的漣漪 { c, t0 }
  const tags = [null, null]; // 兩杯上方的短暫提示 { text, t0, color }
  let pour = null;         // 加水的水流 { t0 }

  function acted() { userActed = true; }
  function emit(type, data) { if (userActed && window.LabMission) window.LabMission.emit(type, data); }
  function params() { return { sys: state.sys, CHA: state.CHA, CA: state.CA, V0: state.V0, comp: state.comp }; }

  /** 換兩杯新的溶液：舊的曲線（有加過東西的）留在圖上 */
  function prep(sendMix) {
    if (run && run.pts.length > 1) {
      archive.push({ p: run.p, pts: run.pts.slice(), sys: run.p.sys });
      if (archive.length > 4) archive.shift();
    }
    run = K.createRun(params());
    runNo++;
    rows = [{ i: 0, kind: 'start', amt: null, net: 0, V: run.buf.V, pH: run.pH0, pHc: run.pHc0 }];
    broke = Math.abs(run.pH0 - K.pKa(state.sys)) > 1;
    disp[0] = run.pH0; disp[1] = run.pHc0;
    drops.length = 0; ripples.length = 0; tags[0] = tags[1] = null; pour = null;
    renderAll();
    if (sendMix) emit('mix', K.mixData(run));
  }

  // ======================= 音效 =======================
  function S() { return window.LabSound && window.LabSound.enabled && window.LabSound.enabled() ? window.LabSound : null; }
  function sndDrop(pH) { if (S()) S().tone({ freq: 420 + 45 * Math.max(0, Math.min(14, pH)), dur: 0.09, type: 'sine', gain: 0.13 }); }
  function sndJump(down) { if (S()) S().sweep({ from: down ? 900 : 420, to: down ? 420 : 900, dur: 0.28, type: 'triangle', gain: 0.09 }); }
  function sndBreak() {
    if (!S()) return;
    S().tone({ freq: 392, dur: 0.14, type: 'square', gain: 0.08 });
    S().tone({ freq: 330, dur: 0.22, type: 'square', gain: 0.08, delay: 0.16 });
  }
  function sndBack() { if (S()) { S().tone({ freq: 660, dur: 0.12, type: 'sine', gain: 0.1 }); S().tone({ freq: 880, dur: 0.16, type: 'sine', gain: 0.09, delay: 0.1 }); } }
  function sndWater() { if (S()) S().noise({ dur: 0.5, gain: 0.12, filter: 1500, q: 0.8 }); }
  function sndFull() { if (S()) S().sweep({ from: 520, to: 300, dur: 0.25, type: 'triangle', gain: 0.12 }); }
  function sndClick() { if (S()) S().tone({ freq: 1320, dur: 0.03, type: 'square', gain: 0.06 }); }

  // ======================= 加入 =======================
  function setStatus(msg, warn) { const el = $('status'); el.innerHTML = msg || ''; el.classList.toggle('warn', !!warn); }
  function doAdd(kind) {
    acted();
    const mL = kind === 'water' ? state.V0 : state.amt;
    const r = K.addTo(run, kind, mL, state.cs);
    if (!r.ok) {
      sndFull();
      setStatus(T('燒杯最多裝 250 mL，這一次加不下了。按「換新的兩杯」重新開始，或改用較少的量、較濃的 HCl／NaOH。',
        'A beaker holds at most 250 mL, so this will not fit. Press “Fresh beakers” to start again, or add less, or use more concentrated HCl / NaOH.'), true);
      updateButtons();
      return;
    }
    const net = run.base - run.acid;
    rows.push({ i: rows.length, kind: kind, amt: kind === 'water' ? mL : r.n, net: net, V: run.buf.V, pH: run.sb.pH, pHc: run.sc.pH });
    if (rows.length > 400) rows.splice(1, rows.length - 400);
    const now = performance.now();
    if (kind === 'water') { pour = { t0: now }; sndWater(); }
    else { drops.push({ kind: kind, t0: now }); if (drops.length > 6) drops.shift(); sndDrop(run.sb.pH); }
    if (reduced) { disp[0] = run.sb.pH; disp[1] = run.sc.pH; }
    // 提示：對照大跳、緩衝溶液超出（或回到）有效範圍
    let msg = '';
    if (kind !== 'water' && Math.abs(r.sdpHc) >= 1) {
      tags[1] = { text: T('pH 大跳 ', 'pH jumps ') + signed(r.sdpHc, 2), t0: now, color: col.pos };
      sndJump(r.sdpHc < 0);
    }
    const out = Math.abs(run.sb.pH - K.pKa(state.sys)) > 1;
    if (out && !broke) {
      broke = true;
      tags[0] = { text: T('超出緩衝範圍', 'Out of buffer range'), t0: now, color: col.pos };
      sndBreak();
      msg = T('緩衝溶液的 pH 已經離 pK<sub>a</sub> 超過 1：' + (run.sb.pH < K.pKa(state.sys) ? '共軛鹼' : '弱酸') + '快用完了，再加一點 pH 就會大幅改變。',
        'The buffer’s pH is now more than 1 away from pK<sub>a</sub>: the ' + (run.sb.pH < K.pKa(state.sys) ? 'conjugate base' : 'weak acid') + ' is nearly used up, and a little more will change the pH a lot.');
    } else if (!out && broke) {
      broke = false;
      tags[0] = { text: T('回到緩衝範圍', 'Back in range'), t0: now, color: col.probe };
      sndBack();
    }
    if (!msg) {
      const what = kind === 'water' ? T('兩杯各加入 ' + sigf(mL, 3) + ' mL 蒸餾水', sigf(mL, 3) + ' mL of distilled water added to each beaker')
        : T('兩杯各加入 ' + mmolHTML(r.n) + ' mmol ' + (kind === 'acid' ? 'HCl' : 'NaOH'), mmolHTML(r.n) + ' mmol of ' + (kind === 'acid' ? 'HCl' : 'NaOH') + ' added to each beaker');
      msg = what + T('：緩衝溶液的 pH 變化 ', '. Change in pH: buffer ') + signed(r.sdpH, 3) + T('，' + cmpName() + '的 pH 變化 ', ', ' + lowerName(cmpName()) + ' ') + signed(r.sdpHc, 2) + T('。', '.');
    }
    setStatus(msg, out);
    renderAll();
    kick();
    emit('add', K.addData(run, r, state.cs));
  }

  // ======================= 讀數 =======================
  function dl(rowsHTML) { return rowsHTML.map(function (r) { return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>'; }).join(''); }
  function updateReadouts() {
    const S = SYS[state.sys], sb = run.sb, sc = run.sc, pk = K.pKa(state.sys);
    const dp = sb.pH - run.pH0, dc = sc.pH - run.pHc0;
    const ratio = sb.nHA > 0 ? sb.nA / sb.nHA : Infinity;
    $('readout').innerHTML = dl([
      [T('緩衝溶液 pH', 'Buffer pH'), f2(sb.pH), 'big'],
      [T('與起點相比', 'Change from start'), signed(dp, 3), Math.abs(dp) > 1 ? 'warn' : ''],
      [T('右杯：', 'Right: ') + cmpName() + ' pH', f2(sc.pH), 'big'],
      [T('與起點相比', 'Change from start'), signed(dc, 2), Math.abs(dc) > 1 ? 'warn' : ''],
      [T('加入的 HCl／NaOH', 'HCl / NaOH added'), mmolHTML(run.acid) + '／' + mmolHTML(run.base) + ' mmol'],
      [T('加入的水', 'Water added'), sigf(run.water, 3) + ' mL'],
      [T('每杯體積', 'Volume of each'), num(run.buf.V, 2) + ' mL'],
      [S.HA + T('（弱酸）', ' (weak acid)'), mmolHTML(sb.nHA) + ' mmol'],
      [S.A + T('（共軛鹼）', ' (conjugate base)'), mmolHTML(sb.nA) + ' mmol'],
      ['[' + S.A + ']／[' + S.HA + ']', isFinite(ratio) ? sigf(ratio, 3) : '—', Math.abs(sb.pH - pk) > 1 ? 'warn' : '']
    ]);
    // 分析
    const hh = K.hhPH(state.sys, run.nHA0 + run.acid - run.base, run.nA0 - run.acid + run.base);
    const dn = K.toShift(run.buf, -1, state.cs, 400), up = K.toShift(run.buf, 1, state.cs, 400);
    const dnc = K.toShift(run.cmp, -1, state.cs, 400), upc = K.toShift(run.cmp, 1, state.cs, 400);
    const lim = function (x) { return x == null ? T('超過 400 mmol', 'over 400 mmol') : mmolHTML(x) + ' mmol'; };
    $('anaOut').innerHTML = dl([
      ['pK<sub>a</sub>（' + S.HA + '）', num(pk, 2)],
      [T('有效緩衝範圍', 'Effective range'), num(pk - 1, 2) + '–' + num(pk + 1, 2), Math.abs(sb.pH - pk) <= 1 ? 'good' : 'warn'],
      [T('亨德森公式估計的 pH', 'pH from Henderson–Hasselbalch'), hh == null ? T('不適用', 'not applicable') : f2(hh)],
      [T('精確計算的 pH', 'Exact pH'), f2(sb.pH)],
      [T('緩衝容量 β（左）', 'Buffer capacity β (left)'), sigf(sb.beta, 3) + ' M/pH'],
      [T('緩衝容量 β（右）', 'Buffer capacity β (right)'), (sc.beta >= 0.001 ? sigf(sc.beta, 3) : sciHTML(sc.beta, 3)) + ' M/pH'],
      [T('左杯 pH 降 1 要加 HCl', 'HCl to lower left pH by 1'), lim(dn)],
      [T('左杯 pH 升 1 要加 NaOH', 'NaOH to raise left pH by 1'), lim(up)],
      [T('右杯 pH 降 1 要加 HCl', 'HCl to lower right pH by 1'), lim(dnc)],
      [T('右杯 pH 升 1 要加 NaOH', 'NaOH to raise right pH by 1'), lim(upc)]
    ]);
  }
  function updateSysInfo() {
    const S = SYS[state.sys];
    $('chaLabel').innerHTML = T('弱酸：' + S.acid[0] + ' ', 'Weak acid: ') + S.acidF;
    $('caLabel').innerHTML = T('共軛鹼：' + S.base[0] + ' ', 'Conjugate base: ') + S.baseF;
    $('cmpAcidName').textContent = T('只有' + S.acid[0], S.Acid[1] + ' only');
    $('cmpBaseName').textContent = T('只有' + S.base[0], S.Base[1] + ' only');
    const pk = K.pKa(state.sys), n1 = state.CHA * state.V0, n2 = state.CA * state.V0;
    const eq = S.HA + ' ⇌ H<sup>+</sup> + ' + S.A;
    $('sysInfo').innerHTML = eq + T('，pK<sub>a</sub> = ', ', pK<sub>a</sub> = ') + num(pk, 2) + '<br>' +
      T('配好時：弱酸 ' + mmolHTML(n1) + ' mmol、共軛鹼 ' + mmolHTML(n2) + ' mmol，起始 pH ' + f2(run.pH0),
        'As made: weak acid ' + mmolHTML(n1) + ' mmol, conjugate base ' + mmolHTML(n2) + ' mmol, starting pH ' + f2(run.pH0));
  }
  function updateButtons() {
    const room = K.BEAKER_ML - run.buf.V + 1e-9;
    $('addAcid').disabled = state.amt > room;
    $('addBase').disabled = state.amt > room;
    $('addWater').disabled = state.V0 > room;
    $('addAcid').textContent = T('加入 HCl', 'Add HCl') + '（' + sigf(state.amt * state.cs, 3) + ' mmol）';
    $('addBase').textContent = T('加入 NaOH', 'Add NaOH') + '（' + sigf(state.amt * state.cs, 3) + ' mmol）';
    if (window.LabSettings && window.LabSettings.lang === 'en') {
      $('addAcid').textContent = 'Add HCl (' + sigf(state.amt * state.cs, 3) + ' mmol)';
      $('addBase').textContent = 'Add NaOH (' + sigf(state.amt * state.cs, 3) + ' mmol)';
    }
    $('addWater').textContent = T('加水稀釋（＋' + sigf(state.V0, 3) + ' mL）', 'Add water (+' + sigf(state.V0, 3) + ' mL)');
  }

  // ======================= 數據表 =======================
  function updateTable() {
    let h = '<thead><tr><th>#</th><th class="l">' + T('加入', 'Added') + '</th><th>' + T('淨加入鹼', 'Net base') + '<br><small>mmol</small></th><th>V<br><small>mL</small></th><th>' +
      T('左杯 pH', 'Left pH') + '</th><th>' + T('右杯 pH', 'Right pH') + '</th></tr></thead><tbody>';
    const last = rows.length - 1;
    const from = Math.max(0, rows.length - 200);
    for (let i = rows.length - 1; i >= from; i--) {
      const r = rows[i];
      const what = r.kind === 'start' ? T('起點', 'start') : r.kind === 'water' ? sigf(r.amt, 3) + ' mL ' + H2O :
        mmolHTML(r.amt) + ' ' + (r.kind === 'acid' ? 'HCl' : 'NaOH');
      h += '<tr' + (i === last && i > 0 ? ' class="latest"' : '') + '><td>' + r.i + '</td><td class="l">' + what + '</td><td>' + signed(r.net, 3) + '</td><td>' + num(r.V, 2) + '</td><td>' + f2(r.pH) + '</td><td>' + f2(r.pHc) + '</td></tr>';
    }
    $('tbl').innerHTML = h + '</tbody>';
  }

  // ======================= 畫布：兩個燒杯 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let Lw = null;
  function resize() {
    const W = cv.clientWidth || 600;
    const colW = W / 2;
    const bw = Math.min(170, colW * 0.6), bh = bw * 1.12;
    const fs = window.LabSettings ? (window.LabSettings.get('fs') || 1) : 1;
    const top = 70 + 14 * fs, gap = 64;
    const H = Math.round(top + gap + bh + 112 * fs + 14);
    cv.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    Lw = { W: W, H: H, dpr: dpr, colW: colW, bw: bw, bh: bh, top: top, yTop: top + gap, fs: fs };
    drawStage();
  }
  function font(px, bold) { return (bold ? '600 ' : '') + px + 'px ' + LD.FONT; }
  /** 畫化學式片段（有上下標），align: left/center/right；傳回寬度 */
  function drawParts(g, parts, x, y, px, color, align, bold, halo, maxW) {
    const sizeOf = function (lv) { return lv ? px * 0.72 : px; };
    const measure = function () { let ww = 0; parts.forEach(function (p) { g.font = font(sizeOf(p[1]), bold); ww += g.measureText(p[0]).width; }); return ww; };
    let w = measure();
    if (maxW && w > maxW) { px = Math.max(8, px * maxW / w); w = measure(); }
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    parts.forEach(function (p) {
      g.font = font(sizeOf(p[1]), bold);
      const yy = y + (p[1] < 0 ? px * 0.26 : p[1] > 0 ? -px * 0.42 : 0);
      if (halo) { g.lineWidth = 3; g.strokeStyle = LD.alpha(col.bg, 0.9); g.lineJoin = 'round'; g.strokeText(p[0], cx, yy); }
      g.fillStyle = color; g.fillText(p[0], cx, yy);
      cx += g.measureText(p[0]).width;
    });
    return w;
  }
  function fitText(g, text, maxW, px, bold) {
    let s = px;
    g.font = font(s, bold);
    while (g.measureText(text).width > maxW && s > 9) { s -= 0.5; g.font = font(s, bold); }
    return s;
  }

  function drawStage() {
    if (!Lw) return;
    const g = ctx, L = Lw, now = performance.now();
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    g.clearRect(0, 0, L.W, L.H);
    LD.backdrop(g, L.W, L.H);
    // 桌面
    const deskY = L.yTop + L.bh + 6;
    const dg = g.createLinearGradient(0, deskY, 0, deskY + 16);
    dg.addColorStop(0, LD.alpha(col.text, col.dark ? 0.16 : 0.08)); dg.addColorStop(1, LD.alpha(col.text, 0));
    g.fillStyle = dg; g.fillRect(0, deskY, L.W, 16);
    // 中間的分隔線
    g.strokeStyle = LD.alpha(col.border, 0.8); g.lineWidth = 1; g.setLineDash([4, 5]);
    g.beginPath(); g.moveTo(L.colW + 0.5, 12); g.lineTo(L.colW + 0.5, L.H - 12); g.stroke(); g.setLineDash([]);
    for (let c = 0; c < 2; c++) drawColumn(g, c, now);
  }

  function drawColumn(g, c, now) {
    const L = Lw, cx = L.colW * (c + 0.5), bw = L.bw, bh = L.bh, x0 = cx - bw / 2, y0 = L.yTop, y1 = y0 + bh;
    const st = c ? run.sc : run.sb, pHv = st.pH;
    const V = c ? run.cmp.V : run.buf.V;
    // ---- pH 計 ----
    const mw = Math.min(L.colW - 24, 150), mh = 50 + 6 * (L.fs - 1) * 10 / 3, mx = cx - mw / 2, my = 8;
    g.save();
    g.shadowColor = LD.shadowInk(0.25); g.shadowBlur = 8; g.shadowOffsetY = 3;
    const mg = g.createLinearGradient(0, my, 0, my + mh);
    mg.addColorStop(0, col.dark ? '#3a4250' : '#4a5361'); mg.addColorStop(1, col.dark ? '#232933' : '#2f3540');
    g.fillStyle = mg; LD.roundRect(g, mx, my, mw, mh, 9); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; LD.roundRect(g, mx + 0.5, my + 0.5, mw - 1, mh - 1, 9); g.stroke();
    // 液晶
    const lx = mx + 8, ly = my + 7, lw = mw - 16, lh = mh - 14;
    const lg = g.createLinearGradient(0, ly, 0, ly + lh);
    lg.addColorStop(0, '#cfe3c8'); lg.addColorStop(1, '#b4ccab');
    g.fillStyle = lg; LD.roundRect(g, lx, ly, lw, lh, 5); g.fill();
    const tg = tags[c];
    if (tg && now - tg.t0 < 1600 && c === 1) { g.fillStyle = LD.alpha(col.pos, 0.25 * (1 - (now - tg.t0) / 1600)); LD.roundRect(g, lx, ly, lw, lh, 5); g.fill(); }
    g.fillStyle = '#1d2a1b';
    g.font = font(11 * L.fs * 0.9, true); g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('pH', lx + 6, ly + 4);
    const big = Math.min(lh * 0.78, 30);
    g.font = '700 ' + big + 'px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(f2(pHv), lx + lw - 8, ly + lh / 2 + 1);
    // ---- 標題（燒杯下方） ----
    // ---- 滴管 ----
    const dx = cx - bw * 0.16, dTop = my + mh + 8, dTip = y0 - 6;
    drawDropper(g, dx, dTop, dTip, c, now);
    // ---- 電極與導線 ----
    const ex = cx + bw * 0.24, eTop = my + mh + 14, eBot = y1 - bh * 0.12;
    g.strokeStyle = col.dark ? '#7a8594' : '#3f4752'; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(mx + mw - 18, my + mh); g.bezierCurveTo(mx + mw - 10, my + mh + 16, ex + 6, eTop - 18, ex, eTop); g.stroke();
    // ---- 燒杯（玻璃背面） ----
    drawBeakerBack(g, x0, y0, bw, bh);
    // ---- 溶液 ----
    const innerTop = y0 + bh * 0.06, innerBot = y1 - 4, fullH = innerBot - innerTop;
    const hLiq = fullH * Math.min(1, V / 280);
    const ly0 = innerBot - hLiq;
    const rgb = liquidRGB(disp[c]);
    const a0 = state.uind ? 0.78 : 0.35;
    const lgr = g.createLinearGradient(x0, 0, x0 + bw, 0);
    lgr.addColorStop(0, rgbStr(rgb.map(function (v) { return Math.round(v * 0.82); }), a0));
    lgr.addColorStop(0.35, rgbStr(rgb, a0 * 0.92));
    lgr.addColorStop(0.7, rgbStr(rgb.map(function (v) { return Math.min(255, Math.round(v * 1.06 + 8)); }), a0 * 0.85));
    lgr.addColorStop(1, rgbStr(rgb.map(function (v) { return Math.round(v * 0.78); }), a0));
    g.fillStyle = lgr;
    g.beginPath();
    g.moveTo(x0 + 3, ly0 - 3);
    g.quadraticCurveTo(x0 + 6, ly0 + 2, x0 + 14, ly0 + 2);
    g.lineTo(x0 + bw - 14, ly0 + 2);
    g.quadraticCurveTo(x0 + bw - 6, ly0 + 2, x0 + bw - 3, ly0 - 3);
    g.lineTo(x0 + bw - 3, innerBot - 6);
    g.quadraticCurveTo(x0 + bw - 3, innerBot, x0 + bw - 9, innerBot);
    g.lineTo(x0 + 9, innerBot);
    g.quadraticCurveTo(x0 + 3, innerBot, x0 + 3, innerBot - 6);
    g.closePath(); g.fill();
    // 液面（彎月面）高光
    g.strokeStyle = rgbStr(rgb.map(function (v) { return Math.round(v * 0.65); }), 0.9); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x0 + 3, ly0 - 3); g.quadraticCurveTo(x0 + 6, ly0 + 2, x0 + 14, ly0 + 2); g.lineTo(x0 + bw - 14, ly0 + 2); g.quadraticCurveTo(x0 + bw - 6, ly0 + 2, x0 + bw - 3, ly0 - 3); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0 + 16, ly0 + 4.5); g.lineTo(x0 + bw - 16, ly0 + 4.5); g.stroke();
    // 漣漪
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i], u = (now - r.t0) / 600;
      if (u > 1) { ripples.splice(i, 1); continue; }
      if (r.c !== c) continue;
      g.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - u)) + ')'; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(dx, ly0 + 3, 4 + 18 * u, 1.5 + 4 * u, 0, 0, Math.PI * 2); g.stroke();
    }
    // 電極（插進溶液）
    const eg = g.createLinearGradient(ex - 4, 0, ex + 4, 0);
    eg.addColorStop(0, col.dark ? '#59626e' : '#6d7682'); eg.addColorStop(0.45, col.dark ? '#c8d0da' : '#e4e9ef'); eg.addColorStop(1, col.dark ? '#4b535e' : '#5b636e');
    g.fillStyle = eg; LD.roundRect(g, ex - 4, eTop, 8, eBot - eTop, 4); g.fill();
    g.fillStyle = col.dark ? 'rgba(210,230,255,0.55)' : 'rgba(170,200,230,0.7)';
    g.beginPath(); g.arc(ex, eBot - 2, 5.5, 0, Math.PI * 2); g.fill();
    // 加水的水流
    if (pour && c >= 0) {
      const u = (now - pour.t0) / 650;
      if (u >= 0 && u <= 1) {
        g.strokeStyle = LD.alpha(col.dark ? '#9fc6ef' : '#6aa6dd', 0.6 * (1 - Math.max(0, u - 0.7) / 0.3)); g.lineWidth = 3;
        g.beginPath(); g.moveTo(x0 + bw * 0.08, y0 - 30); g.quadraticCurveTo(x0 + bw * 0.1, y0, x0 + bw * 0.14, ly0); g.stroke();
      }
    }
    // ---- 燒杯（玻璃正面） ----
    drawBeakerFront(g, x0, y0, bw, bh, innerTop, fullH);
    // ---- 落下的液滴 ----
    drops.forEach(function (d) {
      const u = (now - d.t0) / 380;
      if (u < 0 || u > 1) return;
      const yy = dTip + (ly0 - dTip) * u * u;
      const dc = d.kind === 'acid' ? col.H3O : col.OH;
      LD.ball(g, dx, yy, 3.6, dc);
    });
    // ---- 燒杯下方的名稱與粒子比例條 ----
    const yL = y1 + 22 * L.fs;
    const maxW = L.colW - 14;
    const title = c ? T('右：', 'Right: ') + cmpName() : T('左：緩衝溶液', 'Left: buffer');
    const tpx = fitText(g, title, maxW, 13.5 * L.fs, true);
    g.font = font(tpx, true); g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = c ? col.cmp : col.accent;
    g.fillText(title, cx, yL);
    const sub = 'V = ' + num(V, 1) + ' mL';
    g.font = font(12 * L.fs); g.fillStyle = col.muted; g.fillText(sub, cx, yL + 17 * L.fs);
    drawSpeciesBar(g, c, cx, yL + 26 * L.fs, Math.min(maxW, bw * 1.25), st);
    // 提示（燒杯上方）
    if (tg && now - tg.t0 < 1800) {
      const a = 1 - Math.max(0, (now - tg.t0 - 1200) / 600);
      g.globalAlpha = a;
      const tp = fitText(g, tg.text, L.colW - 26, 12 * L.fs, true);
      LD.pill(g, tg.text, cx, y0 + bh * 0.5, tg.color, 'center', font(tp, true));
      g.globalAlpha = 1;
    }
  }

  function drawDropper(g, x, yTop, yTip, c, now) {
    const bulbH = 22, tubeTop = yTop + bulbH - 2;
    // 橡皮球
    const rb = g.createRadialGradient(x - 3, yTop + 6, 1, x, yTop + 10, 12);
    rb.addColorStop(0, col.dark ? '#d06a5c' : '#e57b6b'); rb.addColorStop(1, col.dark ? '#7a2c24' : '#a8382c');
    g.fillStyle = rb;
    g.beginPath(); g.ellipse(x, yTop + 10, 7.5, 11, 0, 0, Math.PI * 2); g.fill();
    // 玻璃管
    const tg = g.createLinearGradient(x - 4, 0, x + 4, 0);
    tg.addColorStop(0, LD.alpha(col.text, 0.25)); tg.addColorStop(0.4, 'rgba(255,255,255,0.55)'); tg.addColorStop(1, LD.alpha(col.text, 0.2));
    g.fillStyle = tg;
    g.beginPath(); g.moveTo(x - 3.5, tubeTop); g.lineTo(x + 3.5, tubeTop); g.lineTo(x + 3.5, yTip - 10); g.lineTo(x + 1.2, yTip); g.lineTo(x - 1.2, yTip); g.lineTo(x - 3.5, yTip - 10); g.closePath(); g.fill();
    g.strokeStyle = LD.alpha(col.text, 0.35); g.lineWidth = 0.8; g.stroke();
    // 最近一次加的是什麼
    const last = drops.length ? drops[drops.length - 1] : null;
    if (last && now - last.t0 < 2000) {
      const lab = last.kind === 'acid' ? 'HCl' : 'NaOH';
      const lc = last.kind === 'acid' ? col.H3O : col.OH;
      g.fillStyle = LD.alpha(lc, 0.55);
      g.fillRect(x - 2.4, (tubeTop + yTip) / 2, 4.8, (yTip - tubeTop) / 2 - 10);
      g.globalAlpha = 1 - Math.max(0, (now - last.t0 - 1400) / 600);
      LD.pill(g, lab, x - 12, (tubeTop + yTip) / 2 + 4, lc, 'right', font(11.5 * Lw.fs, true));
      g.globalAlpha = 1;
    }
  }

  function drawBeakerBack(g, x0, y0, bw, bh) {
    g.save();
    g.shadowColor = LD.shadowInk(0.22); g.shadowBlur = 12; g.shadowOffsetY = 4;
    g.fillStyle = LD.alpha(col.dark ? '#b8c8da' : '#dfe8f1', col.dark ? 0.08 : 0.35);
    g.beginPath();
    g.moveTo(x0, y0); g.lineTo(x0, y0 + bh - 8); g.quadraticCurveTo(x0, y0 + bh, x0 + 8, y0 + bh); g.lineTo(x0 + bw - 8, y0 + bh); g.quadraticCurveTo(x0 + bw, y0 + bh, x0 + bw, y0 + bh - 8); g.lineTo(x0 + bw, y0);
    g.closePath(); g.fill();
    g.restore();
    LD.contactShadow(g, x0 + bw / 2, y0 + bh, bw * 0.55, 0);
  }
  function drawBeakerFront(g, x0, y0, bw, bh, innerTop, fullH) {
    const ink = col.dark ? 'rgba(220,232,245,0.75)' : 'rgba(60,75,95,0.7)';
    g.strokeStyle = ink; g.lineWidth = 1.6; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x0 - 5, y0 - 2); g.quadraticCurveTo(x0, y0, x0, y0 + 6);
    g.lineTo(x0, y0 + bh - 8); g.quadraticCurveTo(x0, y0 + bh, x0 + 8, y0 + bh); g.lineTo(x0 + bw - 8, y0 + bh); g.quadraticCurveTo(x0 + bw, y0 + bh, x0 + bw, y0 + bh - 8);
    g.lineTo(x0 + bw, y0 + 2); g.lineTo(x0 + bw + 2, y0);
    g.stroke();
    // 高光
    const hg = g.createLinearGradient(x0, 0, x0 + bw, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.08, 'rgba(255,255,255,' + (col.dark ? 0.16 : 0.42) + ')'); hg.addColorStop(0.16, 'rgba(255,255,255,0)');
    hg.addColorStop(0.86, 'rgba(255,255,255,0)'); hg.addColorStop(0.92, 'rgba(255,255,255,' + (col.dark ? 0.1 : 0.25) + ')'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg; g.fillRect(x0 + 1, y0 + 6, bw - 2, bh - 14);
    // 刻度（50～250 mL）
    g.strokeStyle = ink; g.lineWidth = 1; g.fillStyle = ink;
    g.font = font(9.5 * Lw.fs); g.textAlign = 'left'; g.textBaseline = 'middle';
    for (let v = 50; v <= 250; v += 50) {
      const y = innerTop + fullH * (1 - v / 280);
      g.beginPath(); g.moveTo(x0 + 6, Math.round(y) + 0.5); g.lineTo(x0 + 6 + (v % 100 === 0 ? 16 : 11), Math.round(y) + 0.5); g.stroke();
      if (v % 100 === 0 || v === 250) g.fillText(String(v), x0 + 25, y);
    }
    for (let v = 25; v < 250; v += 50) {
      const y = innerTop + fullH * (1 - v / 280);
      g.beginPath(); g.moveTo(x0 + 6, Math.round(y) + 0.5); g.lineTo(x0 + 12, Math.round(y) + 0.5); g.stroke();
    }
    g.textAlign = 'left'; g.fillText('mL', x0 + 25, innerTop + fullH * (1 - 250 / 280) - 13 * Lw.fs);
  }

  /** 燒杯下方：弱酸／共軛鹼（或自由的 H3O+、OH-）的莫耳數比例條 */
  function drawSpeciesBar(g, c, cx, y, w, st) {
    const S = SYS[state.sys], L = Lw, px = 11.5 * L.fs, tw = L.colW - 12;
    const x = cx - w / 2, h = 9;
    if (st.nT > 0) {
      const fA = st.nA / st.nT;
      const wa = w * (1 - fA);
      const grd = function (color) { const gg = g.createLinearGradient(0, y, 0, y + h); gg.addColorStop(0, LD.shade(color, 0.25)); gg.addColorStop(1, LD.shade(color, -0.1)); return gg; };
      g.fillStyle = grd(col.HA); LD.roundRect(g, x, y, Math.max(0.01, wa), h, 3); g.fill();
      g.fillStyle = grd(col.A); LD.roundRect(g, x + wa, y, Math.max(0.01, w - wa), h, 3); g.fill();
      g.strokeStyle = LD.alpha(col.text, 0.25); g.lineWidth = 1; LD.roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, 3); g.stroke();
      const y2 = y + h + px + 3;
      drawParts(g, partsOf(S.HA).concat([[' ' + mmolText(st.nHA) + ' mmol', 0]]), cx, y2, px, col.HA, 'center', true, true, tw);
      drawParts(g, partsOf(S.A).concat([[' ' + mmolText(st.nA) + ' mmol', 0]]), cx, y2 + px + 5, px, col.A, 'center', true, true, tw);
    } else {
      const y2 = y + px;
      const sp = fitText(g, T('沒有弱酸與共軛鹼，只有自由的', 'no weak acid or base, only free'), tw, px * 0.9);
      g.font = font(sp); g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(T('沒有弱酸與共軛鹼，只有自由的', 'no weak acid or base, only free'), cx, y2);
      drawParts(g, partsOf(H3O).concat([[' ' + mmolText(st.nH) + ' mmol', 0]]), cx, y2 + px + 5, px, col.H3O, 'center', true, true, tw);
      drawParts(g, partsOf(OHm).concat([[' ' + mmolText(st.nOH) + ' mmol', 0]]), cx, y2 + 2 * px + 10, px, col.OH, 'center', true, true, tw);
    }
  }
  /** 畫布用的莫耳數文字（很小時寫成 a×10^n 的一般寫法：畫布不能用上標字元，改用 e 記法太醜，所以用 <0.001） */
  function mmolText(x) {
    if (x >= 0.01 || x === 0) return sigf(x, 3);
    if (x >= 0.001) return sigf(x, 2);
    return '< 0.001';
  }

  // ======================= 動畫迴圈（同一時間只有一條） =======================
  let raf = 0;
  function animating() {
    const now = performance.now();
    const tgt = [run.sb.pH, run.sc.pH];
    if (Math.abs(disp[0] - tgt[0]) > 0.002 || Math.abs(disp[1] - tgt[1]) > 0.002) return true;
    if (drops.some(function (d) { return now - d.t0 < 400; })) return true;
    if (ripples.length) return true;
    if (pour && now - pour.t0 < 700) return true;
    if (tags.some(function (t) { return t && now - t.t0 < 1800; })) return true;
    return false;
  }
  let lastT = 0;
  function loop(t) {
    raf = 0;
    if (state.view !== '2d') { lastT = 0; disp[0] = run.sb.pH; disp[1] = run.sc.pH; return; }
    const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
    lastT = t;
    // 液滴落到液面時才開始變色、產生漣漪（只是畫面）
    const now = performance.now();
    drops.forEach(function (d) {
      if (!d.landed && now - d.t0 >= 380) { d.landed = true; ripples.push({ c: 0, t0: now }); ripples.push({ c: 1, t0: now }); }
    });
    const ready = !drops.some(function (d) { return !d.landed; });
    if (ready) {
      const k = 1 - Math.exp(-dt / 0.18);
      disp[0] += (run.sb.pH - disp[0]) * k;
      disp[1] += (run.sc.pH - disp[1]) * k;
    }
    drawStage();
    if (animating()) raf = requestAnimationFrame(loop); else { lastT = 0; disp[0] = run.sb.pH; disp[1] = run.sc.pH; drawStage(); }
  }
  function kick() {
    if (reduced) { drops.length = 0; ripples.length = 0; pour = null; disp[0] = run.sb.pH; disp[1] = run.sc.pH; drawStage(); return; }
    if (!raf && state.view === '2d') raf = requestAnimationFrame(loop);
    if (state.view !== '2d') { disp[0] = run.sb.pH; disp[1] = run.sc.pH; }
  }

  // ======================= 圖：pH 對淨加入的酸鹼 =======================
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let G = null;
  function resizeGraph() {
    const W = gcv.clientWidth || 600;
    const H = W < 520 ? Math.round(Math.max(280, W * 0.82)) : 340;
    gcv.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gcv.width = Math.round(W * dpr); gcv.height = Math.round(H * dpr);
    G = { W: W, H: H, dpr: dpr };
  }
  function niceStep(span, n) {
    const raw = span / n, e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
  }
  function xRange() {
    let m = 0;
    run.pts.forEach(function (p) { m = Math.max(m, Math.abs(p.n)); });
    archive.forEach(function (a) { a.pts.forEach(function (p) { m = Math.max(m, Math.abs(p.n)); }); });
    if (state.theory) m = Math.max(m, (run.nHA0 + run.nA0) * 0.6);
    m = Math.max(m * 1.15, 0.2);
    const st = niceStep(m, 3);
    return Math.ceil(m / st) * st;
  }
  function drawGraph() {
    if (!G) resizeGraph();
    const g = gctx, W = G.W, H = G.H, fs = window.LabSettings ? (window.LabSettings.get('fs') || 1) : 1;
    g.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    LD.backdrop(g, W, H);
    const padL = 40 * fs, padR = 12, padT = 14, padB = 40 * fs;
    const X0 = padL, X1 = W - padR, Y0 = padT, Y1 = H - padB;
    const xm = xRange();
    const xs = function (n) { return X0 + (n + xm) / (2 * xm) * (X1 - X0); };
    const ys = function (p) { return Y1 - Math.max(0, Math.min(14, p)) / 14 * (Y1 - Y0); };
    const pk = K.pKa(state.sys);
    // 有效範圍色帶
    if (state.band) {
      g.fillStyle = LD.alpha(col.accent, col.dark ? 0.16 : 0.1);
      g.fillRect(X0, ys(pk + 1), X1 - X0, ys(pk - 1) - ys(pk + 1));
    }
    // 格線
    g.lineWidth = 1;
    const xst = niceStep(2 * xm, W < 520 ? 4 : 8);
    for (let p = 0; p <= 14; p += 1) {
      g.strokeStyle = LD.alpha(col.text, p % 2 ? 0.04 : 0.1);
      g.beginPath(); g.moveTo(X0, Math.round(ys(p)) + 0.5); g.lineTo(X1, Math.round(ys(p)) + 0.5); g.stroke();
    }
    for (let n = Math.ceil(-xm / xst) * xst; n <= xm + 1e-9; n += xst) {
      g.strokeStyle = LD.alpha(col.text, Math.abs(n) < 1e-9 ? 0.35 : 0.08);
      g.beginPath(); g.moveTo(Math.round(xs(n)) + 0.5, Y0); g.lineTo(Math.round(xs(n)) + 0.5, Y1); g.stroke();
    }
    // pKa 線
    g.strokeStyle = LD.alpha(col.accent, 0.75); g.setLineDash([5, 4]); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(X0, ys(pk)); g.lineTo(X1, ys(pk)); g.stroke(); g.setLineDash([]);
    // 軸文字
    g.fillStyle = col.muted; g.font = font(11 * fs); g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let p = 0; p <= 14; p += 2) g.fillText(String(p), X0 - 6, ys(p));
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let n = Math.ceil(-xm / xst) * xst; n <= xm + 1e-9; n += xst) g.fillText(num(n, xst < 0.1 ? 2 : xst < 1 ? 1 : 0), xs(n), Y1 + 5);
    g.fillText(T('← 加入 HCl　淨加入的鹼（mmol）　加入 NaOH →', '← HCl added    net base added (mmol)    NaOH added →'), (X0 + X1) / 2, Y1 + 8 + 13 * fs);
    g.save(); g.translate(12, (Y0 + Y1) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('pH', 0, 0); g.restore();
    drawParts(g, [['pK', 0], ['a', -1], [' = ' + num(pk, 2), 0]], X1 - 6, ys(pk) - 6, 11 * fs, col.accent, 'right', true, true);
    // 理論曲線
    g.save(); g.beginPath(); g.rect(X0, Y0 - 2, X1 - X0, Y1 - Y0 + 4); g.clip();
    if (state.theory) {
      [[K.make(state.sys, state.CHA, state.CA, state.V0), col.accent], [K.compareSol(run.p, K.make(state.sys, state.CHA, state.CA, state.V0)), col.cmp]].forEach(function (q) {
        const pts = K.curve(q[0], state.cs, -xm, xm, 160);
        g.strokeStyle = LD.alpha(q[1], 0.55); g.lineWidth = 1.4; g.setLineDash([3, 4]);
        g.beginPath(); pts.forEach(function (p, i) { const x = xs(p.n), y = ys(p.pH); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      });
      g.setLineDash([]);
    }
    // 舊曲線
    archive.forEach(function (a) {
      [['pH', col.accent], ['pHc', col.cmp]].forEach(function (k) {
        g.strokeStyle = LD.alpha(k[1], 0.28); g.lineWidth = 1.3;
        g.beginPath(); a.pts.forEach(function (p, i) { const x = xs(p.n), y = ys(p[k[0]]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      });
    });
    // 這一次的曲線
    [['pHc', col.cmp, true], ['pH', col.accent, false]].forEach(function (k) {
      g.strokeStyle = k[1]; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
      if (k[2]) g.setLineDash([6, 4]);
      g.beginPath(); run.pts.forEach(function (p, i) { const x = xs(p.n), y = ys(p[k[0]]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      g.setLineDash([]);
      run.pts.forEach(function (p, i) {
        const x = xs(p.n), y = ys(p[k[0]]), last = i === run.pts.length - 1;
        if (k[2]) { g.fillStyle = k[1]; g.fillRect(x - (last ? 3.5 : 2.5), y - (last ? 3.5 : 2.5), last ? 7 : 5, last ? 7 : 5); }
        else LD.ball(g, x, y, last ? 4.2 : 3, k[1]);
      });
    });
    g.restore();
    // 外框
    g.strokeStyle = LD.alpha(col.text, 0.35); g.lineWidth = 1; g.strokeRect(X0 + 0.5, Y0 + 0.5, X1 - X0 - 1, Y1 - Y0 - 1);
  }
  function updateLegend() {
    $('curveLegend').innerHTML =
      '<span><i class="ln" style="background:' + col.accent + '"></i>' + T('左：緩衝溶液', 'Left: buffer') + '</span> ' +
      '<span style="color:' + col.cmp + '"><i class="ln dash"></i><span style="color:var(--text)">' + T('右：', 'Right: ') + cmpName() + '</span></span> ' +
      (state.band ? '<span><i class="ln band" style="background:' + col.accent + '"></i>pK<sub>a</sub> ± 1</span> ' : '') +
      (archive.length ? '<span><i class="ln" style="background:' + col.accent + ';opacity:.35"></i>' + T('舊曲線', 'earlier runs') + '（' + archive.length + '）</span>' : '');
  }

  function renderAll() {
    updateReadouts();
    updateSysInfo();
    updateButtons();
    updateTable();
    updateLegend();
    drawStage();
    drawGraph();
    if (view3 && view3.active) view3.sync();
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const PER = 48;
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  /** 3D 用的粒子數：每顆 = 緩衝溶液中弱酸與共軛鹼總量的 1/48 */
  function snapshot() {
    const unit = (run.nHA0 + run.nA0) / PER;
    const cnt = function (st, V) {
      return { V: V, pH: st.pH, HA: Math.min(80, Math.round(st.nHA / unit)), A: Math.min(80, Math.round(st.nA / unit)),
        H: Math.min(40, Math.round(st.nH / unit)), OH: Math.min(40, Math.round(st.nOH / unit)) };
    };
    return { run: runNo, unit: unit, cubes: [cnt(run.sb, run.buf.V), cnt(run.sc, run.cmp.V)] };
  }
  function hud3() {
    const S = SYS[state.sys], s = snapshot();
    const chip = function (c) { return '<i class="chip" style="background:' + c + '"></i>'; };
    const line = function (k) {
      const q = s.cubes[k];
      return '<b>' + (k ? T('右：', 'Right: ') + cmpName() : T('左：緩衝溶液', 'Left: buffer')) + '</b><br>pH ' + f2(q.pH) + '&nbsp;&nbsp; ' +
        S.HA + ' ' + q.HA + '&nbsp;&nbsp; ' + S.A + ' ' + q.A + '<br>' + H3O + ' ' + (q.H >= 40 ? '40+' : q.H) + '&nbsp;&nbsp; ' + OHm + ' ' + (q.OH >= 40 ? '40+' : q.OH);
    };
    return {
      tl: line(0), tr: line(1),
      bl: chip(col.HA) + S.HA + T('（弱酸）', ' (weak acid)') + chip(col.A) + S.A + T('（共軛鹼）', ' (conj. base)') + chip(col.H3O) + H3O + chip(col.OH) + OHm +
        '<span class="tip">' + T('每一顆 = ' + mmolHTML(s.unit) + ' mmol・水分子與 Na<sup>+</sup>、Cl<sup>−</sup> 沒有畫出・拖曳旋轉、滾輪或雙指縮放',
          'Each particle = ' + mmolHTML(s.unit) + ' mmol · water and Na<sup>+</sup>, Cl<sup>−</sup> not drawn · drag to rotate, scroll or pinch to zoom') + '</span>'
    };
  }
  function host3Api() {
    return {
      T: T, host: host3, reduced: reduced,
      colors: function () { return col; },
      snapshot: snapshot,
      liquid: function (c) { return rgbStr(liquidRGB(c ? run.sc.pH : run.sb.pH)); },
      uind: function () { return state.uind; },
      hud: hud3,
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 燒杯。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
    };
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
      if (!webglAvailable() || !window.BufSol3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.BufSol3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
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
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 燒杯。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }

  // ======================= 控制項 =======================
  const chaEl = $('cha'), caEl = $('ca'), v0El = $('v0'), csEl = $('cs');
  // 濃度：對數刻度 1.00 × 10^-4 ～ 1.00 M（滑桿位置 0–400）
  const logC = {
    toValue: function (pos) { return roundSig(Math.pow(10, -4 + pos / 100), 3); },
    toPos: function (v) { return 100 * (Math.log10(Math.max(1e-4, v)) + 4); },
    min: 1e-4, max: 1, decimals: 5
  };
  // 滴管濃度：0.0100 ～ 2.00 M（滑桿位置 0–1000）
  const LS = Math.log10(200);
  const logS = {
    toValue: function (pos) { return roundSig(Math.pow(10, -2 + LS * pos / 1000), 3); },
    toPos: function (v) { return 1000 * (Math.log10(Math.max(0.01, v)) + 2) / LS; },
    min: 0.01, max: 2, decimals: 4
  };
  if (window.LabNum) { window.LabNum.register(chaEl, logC); window.LabNum.register(caEl, logC); window.LabNum.register(csEl, logS); }
  function val(el, map) { return window.LabNum ? window.LabNum.value(el) : map ? map.toValue(+el.value) : +el.value; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function readSliders() {
    state.CHA = clamp(val(chaEl, logC), 1e-4, 1);
    state.CA = clamp(val(caEl, logC), 1e-4, 1);
    state.V0 = clamp(val(v0El), 20, 200);
    state.cs = clamp(val(csEl, logS), 0.01, 2);
    $('chao').textContent = conc(state.CHA) + ' M';
    $('cao').textContent = conc(state.CA) + ' M';
    $('v0o').textContent = num(state.V0, state.V0 % 1 ? 1 : 0) + ' mL';
    $('cso').textContent = conc(state.cs) + ' M';
  }
  function setSeg(sel, attr, v) { document.querySelectorAll(sel + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); }); }

  [chaEl, caEl, v0El].forEach(function (el) {
    el.addEventListener('input', function () { acted(); readSliders(); prep(false); });
    el.addEventListener('change', function () { acted(); readSliders(); prep(true); setStatus(''); });
  });
  csEl.addEventListener('input', function () { acted(); readSliders(); updateButtons(); updateReadouts(); if (state.theory) drawGraph(); });
  csEl.addEventListener('change', function () { readSliders(); updateButtons(); updateReadouts(); if (state.theory) drawGraph(); });
  document.querySelectorAll('#sysSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); sndClick();
      state.sys = b.dataset.sys; setSeg('#sysSeg', 'data-sys', state.sys);
      prep(true); setStatus('');
    });
  });
  document.querySelectorAll('#cmpSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); sndClick();
      state.comp = b.dataset.cmp; setSeg('#cmpSeg', 'data-cmp', state.comp);
      prep(true); setStatus('');
    });
  });
  document.querySelectorAll('#amtSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); sndClick(); state.amt = +b.dataset.ml; setSeg('#amtSeg', 'data-ml', b.dataset.ml); updateButtons(); });
  });
  $('addAcid').addEventListener('click', function () { doAdd('acid'); });
  $('addBase').addEventListener('click', function () { doAdd('base'); });
  $('addWater').addEventListener('click', function () { doAdd('water'); });
  $('newRun').addEventListener('click', function () {
    acted(); sndClick(); prep(true);
    setStatus(T('換了兩杯剛配好的溶液；上一次的曲線留在圖上。', 'Two freshly made solutions; the last run’s curve stays on the graph.'));
  });
  $('clearAll').addEventListener('click', function () {
    acted(); sndClick();
    archive = []; run = null; prep(true);
    setStatus(T('已清除所有曲線與數據表。', 'All curves and the data table have been cleared.'));
  });
  $('uind').addEventListener('change', function () { acted(); state.uind = $('uind').checked; drawStage(); if (view3 && view3.active) view3.sync(); });
  $('theory').addEventListener('change', function () { acted(); state.theory = $('theory').checked; drawGraph(); });
  $('band').addEventListener('change', function () { acted(); state.band = $('band').checked; updateLegend(); drawGraph(); });
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---- 喇叭按鈕 ----
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
    if (ev.detail && ev.detail.name === 'fs') { resize(); resizeGraph(); drawGraph(); }
  });

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    renderAll();
    if (view3 && view3.active) view3.onTheme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', themeChanged);
  }
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', function () { resize(); resizeGraph(); drawGraph(); });

  // 測試用（Playwright、縮圖）
  window.__bs = {
    state: state, run: function () { return run; }, rows: function () { return rows; }, archive: function () { return archive; },
    add: doAdd, snapshot: snapshot, view: function () { return view3; }
  };

  // ======================= 啟動 =======================
  readColors();
  readSliders();
  prep(false);
  updateSoundButton();
  resize();
  resizeGraph();
  drawGraph();
})();
