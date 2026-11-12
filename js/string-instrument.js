/* string-instrument.js — 「弦樂器：弦長、張力與品格」的畫面與互動
 * 物理計算在 string-instrument-core.js（StringCore）；音名與音分在 music-theory.js；聲音用 music-audio.js（MusicAudio）；
 * 共用繪圖工具 LabDraw 在 drawkit.js；3D 檢視在 string-instrument-3d.js（第一次切到 3D 才載入）。
 *
 * 畫布由上而下：調音表（聽到的音與偏差音分）、指板（品格、弦、手指、撥弦點；長度依比例、寬度放大示意）、
 * 選中那條弦的振動（模態疊加，慢動作、振幅放大）；第二張畫布是頻譜長條。 */
(function () {
  'use strict';
  const S = window.StringCore;
  const D = window.LabDraw;
  const MA = window.MusicAudio;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const VIS_F = 0.6;        // 慢動作：基頻在畫面上顯示成每秒 0.6 次
  const N_BARS = 16;        // 頻譜顯示的泛音數
  const MU_MIN = S.RANGES.muG[0], MU_MAX = S.RANGES.muG[1];

  // =====================================================================
  // 狀態
  // =====================================================================
  const state = {
    inst: 'guitar',
    insts: {},
    hand: 'press', fret: 0, finger: 0, touch: S.fretXi(12), tf: 12, rule: 'et', show18: false,
    beta: 0.2,
    play: null,          // { kind: 'pluck' | 'bow', t0, inf, amps, taus, h, life, bowId, sMin, sMax }
    pull: null,          // 在弦上拖曳：{ u }
    drag: null,          // 指板上拖曳：'neck' | 'string'
    log: [], logN: 0, bowN: 0
  };
  S.INST_IDS.forEach(function (id) { state.insts[id] = S.presetInstrument(id); });
  let applying = false;  // 程式正在改滑桿（不要當成使用者的操作）
  let gesture = null;    // 使用者正在拖曳的滑桿：改之前的值（調弦事件用）
  let voice = null;      // 拉弓的持續音

  function I() { return S.INSTRUMENTS[state.inst]; }
  function cur() { return state.insts[state.inst]; }
  function curStr() { return cur().strings[cur().si]; }
  function cfg(bow) {
    return { inst: state.inst, L: cur().L, strings: cur().strings, si: cur().si, hand: state.hand, fret: state.fret, finger: state.finger,
      rule: state.rule, touch: state.touch, beta: state.beta, bow: !!bow };
  }
  function info(bow) { return S.analyze(cfg(bow)); }
  /** 振動部分（手指到琴橋）在整條弦上的起點（離琴枕的比例） */
  function stopXi(inf) { return 1 - inf.Leff / inf.L; }

  // =====================================================================
  // 色彩與文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'bg',
      'si-wave', 'si-pick', 'si-touch', 'si-r18', 'si-good', 'si-warn', 'si-spec', 'si-finger',
      'si-rose', 'si-ebony', 'si-top', 'si-varnish', 'si-rod', 'si-fret']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, dec) { if (v == null || !isFinite(v)) return '—'; const s = num(Math.abs(v), dec); return (v > 0.5 * Math.pow(10, -dec) ? '+' : v < -0.5 * Math.pow(10, -dec) ? '−' : '±') + s; }
  function hz(f) { return f == null ? '—' : num(f, f >= 1000 ? 1 : 2) + ' Hz'; }
  function stringName(inst, i) {
    const s = S.INSTRUMENTS[inst].strings[i];
    const note = window.MusicTheory.noteName(s.midi);
    if (inst === 'guitar') return T('第 ' + s.label + ' 弦（' + note + '）', 'string ' + s.label + ' (' + note + ')');
    if (inst === 'violin') return T(s.label + ' 弦（' + note + '）', s.label + ' string (' + note + ')');
    return T(s.zh + '（' + note + '）', s.en + ' string (' + note + ')');
  }
  function stringShort(inst, i) {
    const s = S.INSTRUMENTS[inst].strings[i];
    if (inst === 'guitar') return s.label;
    if (inst === 'violin') return s.label;
    return T(s.zh, s.en);
  }
  function handText(inf) {
    if (inf.hand === 'touch') return T('輕觸 ', 'touch ') + num(inf.touch, 3) + T('（約第 ' + num(inf.touchFret, 1) + ' 品）', ' (≈ fret ' + num(inf.touchFret, 1) + ')');
    if (inf.fret != null) return inf.fret === 0 ? T('空弦', 'open') : T('第 ' + inf.fret + ' 品', 'fret ' + inf.fret) + (inf.rule === 'r18' ? T('（18 法則）', ' (rule of 18)') : '');
    return inf.finger < 0.005 ? T('空弦', 'open') : T('手指 +' + num(inf.finger, 2) + ' 半音', 'finger +' + num(inf.finger, 2) + ' st');
  }

  // =====================================================================
  // 畫布與版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let dpr = 1, cw = 300, ch = 400, Lo = null, cw2 = 300, ch2 = 170;
  function showErr() { return state.inst === 'guitar' && (state.show18 || state.rule === 'r18'); }
  function layout() {
    const narrow = cw < 560;
    const pad = narrow ? 8 : 14;
    const tunerH = narrow ? 46 : 50;
    const neckT = pad + tunerH + (narrow ? 8 : 12);
    const neckH = narrow ? 96 : 122;
    const numT = neckT + neckH;
    const errT = numT + 18;
    const errH = showErr() ? (narrow ? 34 : 40) : 0;
    const strT = errT + errH + (narrow ? 8 : 10);
    const strH = narrow ? 142 : 172;
    const head = narrow ? 22 : 40, tail = narrow ? 24 : 46;
    const x0 = pad + head, x1 = cw - pad - tail;
    const bw = narrow ? 60 : 80;
    return { narrow: narrow, pad: pad, tunerT: pad, tunerH: tunerH, neckT: neckT, neckH: neckH, neckY: neckT + neckH / 2, numT: numT,
      errT: errT, errH: errH, strT: strT, strH: strH, strY: strT + strH / 2, H: strT + strH + (narrow ? 22 : 26), x0: x0, x1: x1, bw: bw };
  }
  /** 離琴枕的比例 ξ → 畫布 x */
  function X(xi) { return Lo.x0 + xi * (Lo.x1 - Lo.x0); }
  function xiOf(px) { return (px - Lo.x0) / (Lo.x1 - Lo.x0); }
  /** 指板上第 i 條弦（0 = 最低音）在 ξ 處的 y：高音在上（和吉他譜一樣） */
  function stringY(i, xi) {
    const n = I().strings.length;
    const span = Lo.bw * (n > 2 ? 0.74 : 0.16) * (1 + 0.22 * Math.max(0, Math.min(1, xi)));
    const k = n === 1 ? 0 : (i / (n - 1) - 0.5);
    return Lo.neckY - k * span;
  }
  /** 指板（或琴桿）的半寬：從琴枕往琴身略微變寬 */
  function boardHalf(xi) { return Lo.bw / 2 * (1 + 0.16 * Math.max(0, Math.min(1, xi))); }
  /** 讀數的公式：手機或字體特大時縮小到放得下（最小 0.6 倍），不用左右捲動 */
  function fitEq() {
    const el = $('rEq'), k = el && el.querySelector('.katex');
    if (!k) return;
    k.style.fontSize = '';
    let f = 1.02;
    for (let i = 0; i < 5 && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && f > 0.6; i++) {
      f = Math.max(0.6, f * 0.97 * el.clientWidth / el.scrollWidth);
      k.style.fontSize = f.toFixed(3) + 'em';
    }
  }
  // KaTeX 的字型晚一點才載入（字變寬）：載入後再量一次
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(function () { fitEq(); });
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { fitEq(); });
  }
  function resize() {
    fitEq();
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    Lo = layout();
    ch = Lo.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    ch2 = cw2 < 560 ? 156 : 176;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    neckCache.key = '';
    requestDraw();
  }

  // =====================================================================
  // 繪圖：調音表
  // =====================================================================
  function drawTuner(c, inf) {
    const x = Lo.pad, y = Lo.tunerT, w = cw - 2 * Lo.pad, h = Lo.tunerH;
    c.save();
    D.roundRect(c, x, y, w, h, 10);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, alpha(C.text, D.dark ? 0.07 : 0.035));
    g.addColorStop(1, alpha(C.text, D.dark ? 0.03 : 0.015));
    c.fillStyle = g; c.fill();
    c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
    const narrow = Lo.narrow;
    const leftW = narrow ? 78 : 104, rightW = narrow ? 92 : 116;
    const has = inf.fSound != null;
    const cents = has ? inf.noteCents : null;
    const ok = has && Math.abs(cents) <= 3;
    const col = !has ? C.muted : ok ? C['si-good'] : Math.abs(cents) <= 10 ? C['si-warn'] : C['si-pick'];
    // 左：音名
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = has ? C.text : C.muted;
    c.font = fnt(narrow ? 19 : 22, 700);
    const nm = has ? inf.note : '—';
    c.fillText(nm, x + 10, y + h / 2 - (narrow ? 6 : 7));
    c.font = fnt(narrow ? 11 : 12, 600);
    c.fillStyle = col;
    c.fillText(has ? signed(cents, 1) + T(' 音分', ' ¢') : T('幾乎無聲', 'nearly silent'), x + 10, y + h / 2 + (narrow ? 11 : 13));
    // 右：頻率
    c.textAlign = 'right';
    c.fillStyle = C.text;
    c.font = fnt(narrow ? 13 : 15, 700);
    c.fillText(has ? hz(inf.fSound) : '—', x + w - 10, y + h / 2 - (narrow ? 6 : 7));
    c.font = fnt(narrow ? 10.5 : 11.5);
    c.fillStyle = C.muted;
    c.fillText(inf.hand === 'touch' && has ? T('第 ' + inf.lowest + ' 泛音', 'harmonic ' + inf.lowest) : T('聽到的音', 'you hear'), x + w - 10, y + h / 2 + (narrow ? 11 : 13));
    // 中：指針表（−50 到 +50 音分）
    const gx0 = x + leftW, gx1 = x + w - rightW, gy = y + h * 0.58;
    if (gx1 - gx0 > 60) {
      const G = function (cc) { return gx0 + (Math.max(-50, Math.min(50, cc)) + 50) / 100 * (gx1 - gx0); };
      c.fillStyle = alpha(C['si-good'], D.dark ? 0.22 : 0.16);
      D.roundRect(c, G(-3), gy - 9, G(3) - G(-3), 18, 3); c.fill();
      c.strokeStyle = alpha(C.text, 0.35); c.lineWidth = 1;
      c.beginPath();
      for (let k = -50; k <= 50; k += 10) {
        const px = Math.round(G(k)) + 0.5, tl = k === 0 ? 9 : k % 50 === 0 ? 7 : 4;
        c.moveTo(px, gy - tl); c.lineTo(px, gy + tl);
      }
      c.stroke();
      c.font = fnt(10); c.fillStyle = C.muted;
      [-50, 0, 50].forEach(function (k) { c.textAlign = k < 0 ? 'left' : k > 0 ? 'right' : 'center'; c.fillText((k > 0 ? '+' : k < 0 ? '−' : '') + Math.abs(k), G(k), y + 9); });
      if (has) {
        const px = G(cents);
        c.save();
        c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.25); c.shadowBlur = 4; c.shadowOffsetY = 1;
        c.fillStyle = col;
        c.beginPath(); c.moveTo(px, gy + 10); c.lineTo(px - 6, gy - 10); c.lineTo(px + 6, gy - 10); c.closePath(); c.fill();
        c.restore();
        if (Math.abs(cents) > 50) { c.fillStyle = col; c.font = fnt(10, 700); c.fillText(cents > 0 ? '▶' : '◀', cents > 0 ? gx1 + 8 : gx0 - 8, gy); }
      }
    }
    c.restore();
  }

  // =====================================================================
  // 繪圖：指板（靜態部分畫在離屏 canvas，參數改變時才重畫）
  // =====================================================================
  const neckCache = { key: '', cv: document.createElement('canvas') };
  function grainLines(c, x0, y0, x1, y1, color, seed, n, amp) {
    let s = seed;
    const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    c.save();
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    for (let k = 0; k < n; k++) {
      const yy = y0 + (y1 - y0) * rnd();
      const ph = rnd() * 6.28, f = 0.004 + 0.01 * rnd();
      c.strokeStyle = alpha(color, 0.05 + 0.1 * rnd());
      c.lineWidth = 0.6 + rnd() * 1.1;
      c.beginPath();
      for (let x = x0; x <= x1; x += 8) { const yv = yy + amp * Math.sin(ph + x * f); if (x === x0) c.moveTo(x, yv); else c.lineTo(x, yv); }
      c.stroke();
    }
    c.restore();
  }
  function stringColor(i) {
    const st = cur().strings[i], s = I().strings[i];
    const mat = st.mode === 'mat' ? st.mat : (s.kind === 'wound' ? 'wound' : s.core);
    if (mat === 'wound') return { base: '#c9b48a', hi: '#f4e7c4', lo: '#7a6236', wound: true };
    if (mat === 'steel') return { base: '#c3c8ce', hi: '#f6f8fa', lo: '#6c737a', wound: false };
    return { base: '#efe6d2', hi: '#fffaf0', lo: '#a89d86', wound: false };
  }
  function stringWidth(i) {
    const st = cur().strings[i], s = I().strings[i];
    let d;
    if (st.mode === 'mat') d = st.d;
    else if (s.kind === 'wound') d = s.d;
    else d = S.diameterFor(st.muG / 1000, S.MATERIALS[s.core].rho);
    return Math.max(1.1, Math.min(4.2, 0.7 + d * (Lo.narrow ? 1.25 : 1.6)));
  }
  function neckKey() {
    const c = cur();
    return [cw, ch, dpr, D.ver, state.inst, c.si, state.rule, state.show18, Lo.narrow, c.strings.map(function (s) { return s.mode + s.mat + s.d + (s.mode === 'mu' ? s.muG.toFixed(3) : ''); }).join(',')].join('|');
  }
  function drawNeckStatic(c) {
    const inst = state.inst, Lb = Lo;
    const y0 = Lb.neckT, y1 = Lb.neckT + Lb.neckH;
    c.save();
    c.beginPath(); c.rect(0, y0 - 2, cw, y1 - y0 + 4); c.clip();
    if (inst === 'guitar') drawGuitarBody(c, y0, y1);
    else if (inst === 'violin') drawViolinBody(c, y0, y1);
    else drawErhuBody(c, y0, y1);
    // 弦
    const n = I().strings.length;
    for (let i = 0; i < n; i++) {
      const w = stringWidth(i), col = stringColor(i);
      const ya = stringY(i, 0), yb = stringY(i, 1);
      const xa = inst === 'erhu' ? Lb.x0 - Lb.pad * 0.5 - 6 : Lb.x0, xb = Lb.x1;
      if (i === cur().si) {
        c.strokeStyle = alpha(C.accent, D.dark ? 0.5 : 0.35); c.lineWidth = w + 6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke();
      }
      // 投影
      c.strokeStyle = alpha('#000000', D.dark ? 0.45 : 0.25); c.lineWidth = w; c.lineCap = 'round';
      c.beginPath(); c.moveTo(xa, ya + 2.2); c.lineTo(xb, yb + 2.2); c.stroke();
      c.strokeStyle = col.lo; c.lineWidth = w;
      c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke();
      c.strokeStyle = col.base; c.lineWidth = w * 0.7;
      c.beginPath(); c.moveTo(xa, ya - w * 0.08); c.lineTo(xb, yb - w * 0.08); c.stroke();
      c.strokeStyle = alpha(col.hi, 0.85); c.lineWidth = Math.max(0.5, w * 0.22);
      c.beginPath(); c.moveTo(xa, ya - w * 0.22); c.lineTo(xb, yb - w * 0.22); c.stroke();
      if (col.wound && w > 1.8) {
        // 纏線的細紋
        c.strokeStyle = alpha(col.lo, 0.55); c.lineWidth = 0.6;
        c.beginPath();
        const len = Math.hypot(xb - xa, yb - ya), step = 2.4;
        for (let t = 0; t < len; t += step) {
          const u = t / len, px = xa + (xb - xa) * u, py = ya + (yb - ya) * u;
          c.moveTo(px - w * 0.3, py + w * 0.45); c.lineTo(px + w * 0.3, py - w * 0.45);
        }
        c.stroke();
      }
    }
    c.restore();
    // 品格號碼／半音刻度（指板下方）
    c.save();
    c.font = fnt(Lb.narrow ? 9.5 : 10.5);
    c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'top';
    const marks = [3, 5, 7, 9, 12, 15, 17, 19];
    if (I().frets) {
      (Lb.narrow ? [3, 5, 7, 9, 12, 15, 19] : marks).forEach(function (k) {
        const xm = (X(S.fretX(k - 1, 1, state.rule)) + X(S.fretX(k, 1, state.rule))) / 2;
        c.fillText(String(k), xm, Lb.numT + 3);
      });
    } else {
      c.strokeStyle = alpha(C.muted, 0.6); c.lineWidth = 1;
      c.beginPath();
      for (let k = 1; k <= 19; k++) { const px = Math.round(X(1 - Math.pow(2, -k / 12))) + 0.5; c.moveTo(px, Lb.numT + 1); c.lineTo(px, Lb.numT + (marks.indexOf(k) >= 0 ? 5 : 3)); }
      c.stroke();
      [5, 7, 12, 19].forEach(function (k) { c.fillText(String(k), X(1 - Math.pow(2, -k / 12)), Lb.numT + 5); });
      c.textAlign = 'left';
      c.fillText(T('半音', 'semitones'), X(1 - Math.pow(2, -19 / 12)) + 10, Lb.numT + 5);
    }
    c.restore();
    // 18 法則的位置差（放大）
    if (showErr()) drawRule18Bars(c);
  }
  /** 吉他：雲杉面板、音孔與花紋、玫瑰木指板、金屬品條、琴枕與琴橋、琴頭 */
  function drawGuitarBody(c, y0, y1) {
    const L0 = Lo, yc = L0.neckY;
    // 琴身（第 12 品接琴頸）
    const bx = X(0.5);
    c.save();
    c.beginPath();
    c.moveTo(cw + 10, y0 - 10);
    c.lineTo(bx + 40, y0 - 10);
    c.bezierCurveTo(bx + 4, y0 - 4, bx - 6, yc - L0.bw * 0.5, bx - 6, yc);
    c.bezierCurveTo(bx - 6, yc + L0.bw * 0.5, bx + 4, y1 + 4, bx + 40, y1 + 10);
    c.lineTo(cw + 10, y1 + 10); c.closePath();
    const gt = c.createLinearGradient(0, y0, 0, y1);
    gt.addColorStop(0, D.shade(C['si-top'], 0.12)); gt.addColorStop(0.5, C['si-top']); gt.addColorStop(1, D.shade(C['si-top'], -0.12));
    c.fillStyle = gt;
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.2); c.shadowBlur = 8; c.shadowOffsetX = -2;
    c.fill();
    c.shadowColor = 'transparent';
    c.clip();
    grainLines(c, bx - 10, y0 - 10, cw + 10, y1 + 10, '#5b3a17', 77, 26, 0.6);
    // 音孔與花紋（音孔中心約在弦長的 0.735）
    const hx = X(0.735), r = Math.min((L0.x1 - L0.x0) * 0.066, (y1 - y0) * 0.42);
    for (let k = 0; k < 4; k++) {
      c.strokeStyle = k % 2 ? alpha('#6b3f1d', 0.8) : alpha('#2f6b4f', 0.7);
      c.lineWidth = r * 0.07;
      c.beginPath(); c.arc(hx, yc, r * (1.12 + k * 0.08), 0, Math.PI * 2); c.stroke();
    }
    const gh = c.createRadialGradient(hx - r * 0.2, yc - r * 0.25, r * 0.1, hx, yc, r);
    gh.addColorStop(0, '#2a1a10'); gh.addColorStop(1, '#0b0705');
    c.fillStyle = gh;
    c.beginPath(); c.arc(hx, yc, r, 0, Math.PI * 2); c.fill();
    // 琴橋（綁弦座＋骨質弦枕，弦枕剛好在 ξ = 1）
    const bh = L0.bw * 1.18;
    D.block(c, L0.x1 - 5, yc - bh / 2, Math.min(28, L0.x1 > 0 ? (cw - L0.x1) - 4 : 20) + 5, bh, '#3d2516', { r: 4 });
    c.fillStyle = '#f2ead8';
    c.fillRect(L0.x1 - 1.5, yc - bh / 2 + 4, 3, bh - 8);
    c.restore();
    // 琴頭（左邊）與指板
    const hx0 = L0.pad - 2;
    D.block(c, hx0, yc - L0.bw * 0.55, L0.x0 - hx0 + 2, L0.bw * 1.1, '#4a2e1c', { r: 5 });
    if (!L0.narrow) {
      c.fillStyle = 'rgba(0,0,0,0.45)';
      D.roundRect(c, hx0 + 8, yc - L0.bw * 0.34, L0.x0 - hx0 - 14, L0.bw * 0.2, 3); c.fill();
      D.roundRect(c, hx0 + 8, yc + L0.bw * 0.14, L0.x0 - hx0 - 14, L0.bw * 0.2, 3); c.fill();
    }
    drawBoard(c, S.fretXi(19.6), C['si-rose'], 41);
    // 品條
    const rule = state.rule;
    for (let k = 1; k <= 19; k++) {
      const px = X(S.fretX(k, 1, rule)), hw = boardHalf(S.fretX(k, 1, rule));
      const gf = c.createLinearGradient(px - 1.6, 0, px + 1.6, 0);
      const fc = rule === 'r18' ? D.mix(C['si-fret'], C['si-r18'], 0.35) : C['si-fret'];
      gf.addColorStop(0, D.shade(fc, -0.35)); gf.addColorStop(0.45, D.shade(fc, 0.5)); gf.addColorStop(1, D.shade(fc, -0.25));
      c.fillStyle = gf;
      c.fillRect(px - 1.4, yc - hw, 2.8, hw * 2);
    }
    // 指板上的圓點（3、5、7、9、12、15、17、19）
    [3, 5, 7, 9, 15, 17, 19].forEach(function (k) {
      const xm = (X(S.fretX(k - 1, 1, rule)) + X(S.fretX(k, 1, rule))) / 2;
      dot(c, xm, yc);
    });
    { const xm = (X(S.fretX(11, 1, rule)) + X(S.fretX(12, 1, rule))) / 2; dot(c, xm, yc - L0.bw * 0.22); dot(c, xm, yc + L0.bw * 0.22); }
    // 18 法則的品格（對照時用淡色虛線）
    if (showErr()) {
      const other = rule === 'r18' ? 'et' : 'r18';
      c.save();
      c.setLineDash([3, 3]);
      c.strokeStyle = alpha(rule === 'r18' ? C['si-fret'] : C['si-r18'], 0.95); c.lineWidth = 1.2;
      c.beginPath();
      for (let k = 1; k <= 19; k++) { const xi = S.fretX(k, 1, other), px = X(xi), hw = boardHalf(xi) + 5; c.moveTo(px, yc - hw); c.lineTo(px, yc + hw); }
      c.stroke();
      c.restore();
    }
    nut(c);
  }
  function dot(c, x, y) {
    const r = Lo.narrow ? 2.2 : 3;
    c.fillStyle = 'rgba(240,232,214,0.85)';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  function nut(c) {
    const yc = Lo.neckY, hw = boardHalf(0) + 1;
    D.block(c, Lo.x0 - 3, yc - hw, 5, hw * 2, '#efe7d4', { r: 1.5, shadow: true });
  }
  /** 指板：從琴枕到 ξ = xiEnd，略帶梯形，木紋 */
  function drawBoard(c, xiEnd, color, seed) {
    const yc = Lo.neckY;
    const xa = Lo.x0, xb = X(xiEnd);
    const ha = boardHalf(0), hb = boardHalf(xiEnd);
    c.save();
    c.beginPath();
    c.moveTo(xa, yc - ha); c.lineTo(xb, yc - hb); c.quadraticCurveTo(xb + 6, yc, xb, yc + hb); c.lineTo(xa, yc + ha); c.closePath();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.6)' : alpha(C.text, 0.3); c.shadowBlur = 8; c.shadowOffsetY = 3;
    const g = c.createLinearGradient(0, yc - hb, 0, yc + hb);
    g.addColorStop(0, D.shade(color, 0.14)); g.addColorStop(0.5, color); g.addColorStop(1, D.shade(color, -0.22));
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    c.clip();
    grainLines(c, xa, yc - hb, xb + 6, yc + hb, '#000000', seed, 22, 0.8);
    c.fillStyle = alpha('#ffffff', 0.08);
    c.fillRect(xa, yc - hb, xb - xa, 1.5);
    c.restore();
  }
  /** 小提琴：烏木指板（沒有品）、上漆的琴身與 f 孔、琴碼 */
  function drawViolinBody(c, y0, y1) {
    const L0 = Lo, yc = L0.neckY;
    const bx = X(0.4);
    c.save();
    c.beginPath();
    c.moveTo(cw + 10, y0 - 10); c.lineTo(bx + 30, y0 - 10);
    c.bezierCurveTo(bx, y0 - 2, bx - 4, yc - L0.bw * 0.4, bx - 4, yc);
    c.bezierCurveTo(bx - 4, yc + L0.bw * 0.4, bx, y1 + 2, bx + 30, y1 + 10);
    c.lineTo(cw + 10, y1 + 10); c.closePath();
    const gt = c.createRadialGradient(X(0.95), yc, 10, X(0.95), yc, (L0.x1 - L0.x0) * 0.7);
    gt.addColorStop(0, D.shade(C['si-varnish'], 0.25)); gt.addColorStop(0.6, C['si-varnish']); gt.addColorStop(1, D.shade(C['si-varnish'], -0.3));
    c.fillStyle = gt;
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.2); c.shadowBlur = 8; c.shadowOffsetX = -2;
    c.fill();
    c.shadowColor = 'transparent';
    c.clip();
    grainLines(c, bx - 10, y0 - 10, cw + 10, y1 + 10, '#2a1205', 31, 30, 0.5);
    // f 孔（琴碼兩旁）
    [-1, 1].forEach(function (sg) {
      const fy = yc + sg * L0.bw * 0.78, fx = L0.x1;
      c.strokeStyle = '#1a0c05'; c.lineWidth = Lo.narrow ? 2 : 2.6; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(fx - 30, fy - sg * 5);
      c.bezierCurveTo(fx - 10, fy + sg * 8, fx + 6, fy - sg * 8, fx + 26, fy + sg * 4);
      c.stroke();
      c.fillStyle = '#1a0c05';
      c.beginPath(); c.arc(fx - 30, fy - sg * 5, 2.4, 0, Math.PI * 2); c.arc(fx + 26, fy + sg * 4, 2.4, 0, Math.PI * 2); c.fill();
    });
    c.restore();
    // 琴頭（弦軸箱）
    const hx0 = L0.pad - 2;
    D.block(c, hx0, yc - L0.bw * 0.36, L0.x0 - hx0 + 2, L0.bw * 0.72, D.shade(C['si-varnish'], -0.2), { r: 6 });
    drawBoard(c, 0.82, C['si-ebony'], 53);
    // 琴碼（楓木，薄片）
    const bh = L0.bw * 1.05;
    D.block(c, L0.x1 - 2.5, yc - bh / 2, 5, bh, '#e8d2a8', { r: 2 });
    nut(c);
  }
  /** 二胡：琴桿、千斤、琴筒（蟒皮）與琴碼；沒有指板 */
  function drawErhuBody(c, y0, y1) {
    const L0 = Lo, yc = L0.neckY;
    // 琴筒（六角形，蒙蟒皮；只畫出一部分）
    const dx = X(1.0) - 6, hh = (y1 - y0) * 0.48;
    c.save();
    c.beginPath();
    c.moveTo(dx - 18, yc - hh); c.lineTo(cw + 30, yc - hh); c.lineTo(cw + 30, yc + hh); c.lineTo(dx - 18, yc + hh); c.lineTo(dx - 34, yc); c.closePath();
    const gd = c.createLinearGradient(0, yc - hh, 0, yc + hh);
    gd.addColorStop(0, D.shade(C['si-rod'], 0.25)); gd.addColorStop(0.5, C['si-rod']); gd.addColorStop(1, D.shade(C['si-rod'], -0.3));
    c.fillStyle = gd;
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.25); c.shadowBlur = 8;
    c.fill();
    c.shadowColor = 'transparent';
    // 蟒皮的鱗紋
    c.clip();
    c.fillStyle = '#d9d0bd';
    c.fillRect(dx - 12, yc - hh + 6, cw, hh * 2 - 12);
    c.strokeStyle = 'rgba(70,55,35,0.45)'; c.lineWidth = 1;
    for (let gy = yc - hh + 8; gy < yc + hh; gy += 9) {
      for (let gx = dx - 12 + ((gy / 9) % 2) * 6; gx < cw; gx += 12) {
        c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + 6, gy + 5); c.lineTo(gx + 12, gy); c.stroke();
      }
    }
    c.restore();
    // 琴桿（貫穿全長的圓桿）
    const rh = L0.narrow ? 7 : 9;
    const gr = c.createLinearGradient(0, yc - rh, 0, yc + rh);
    gr.addColorStop(0, D.shade(C['si-rod'], 0.45)); gr.addColorStop(0.35, D.shade(C['si-rod'], 0.12)); gr.addColorStop(1, D.shade(C['si-rod'], -0.35));
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : alpha(C.text, 0.28); c.shadowBlur = 6; c.shadowOffsetY = 3;
    c.fillStyle = gr;
    D.roundRect(c, L0.pad - 2, yc - rh, dx - L0.pad, rh * 2, rh); c.fill();
    c.restore();
    // 琴軸（左端兩個）
    [-1, 1].forEach(function (sg) { D.ball(c, L0.pad + 8, yc + sg * (rh + 8), L0.narrow ? 4 : 5.5, D.shade(C['si-rod'], 0.2), { glow: 0 }); });
    // 琴碼（小木塊，站在蟒皮上）
    const bh = L0.bw * 0.62;
    D.block(c, L0.x1 - 3.5, yc - bh / 2, 7, bh, '#c9a46a', { r: 2 });
    // 千斤（繞弦的繩圈，相當於琴枕）
    c.save();
    c.strokeStyle = '#e6d6b0'; c.lineWidth = 2.2;
    for (let k = -2; k <= 2; k++) {
      c.beginPath(); c.moveTo(L0.x0 + k * 2.4, yc - L0.bw * 0.16); c.lineTo(L0.x0 + k * 2.4 + 1.5, yc + rh); c.stroke();
    }
    c.restore();
  }
  /** 18 法則與 2^(1/12) 的品格位置差（每一品一根細柱，高度 ∝ 位置差） */
  function drawRule18Bars(c) {
    const L = cur().L, top = Lo.errT, h = Lo.errH;
    const gmax = S.rule18Gap(S.rule18Worst(19), 1);
    const base = top + h - 4, usable = h - 16;
    c.save();
    c.strokeStyle = alpha(C.muted, 0.5); c.lineWidth = 1;
    c.beginPath(); c.moveTo(X(0), base + 0.5); c.lineTo(X(S.fretXi(19)) + 6, base + 0.5); c.stroke();
    let worst = 1;
    for (let k = 1; k <= 19; k++) {
      const gap = S.rule18Gap(k, 1), px = X(S.fretXi(k)), hh = usable * gap / gmax;
      c.strokeStyle = alpha(C['si-r18'], 0.75); c.lineWidth = Lo.narrow ? 2 : 2.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(px, base); c.lineTo(px, base - hh); c.stroke();
      c.fillStyle = C['si-r18'];
      c.beginPath(); c.arc(px, base - hh, Lo.narrow ? 1.8 : 2.2, 0, Math.PI * 2); c.fill();
      if (gap > S.rule18Gap(worst, 1)) worst = k;
    }
    const txt = T('18 法則的品比現代品格靠近琴枕：最多 ' + num(S.rule18Gap(worst, L) * 1000, 2) + ' mm（第 ' + worst + ' 品）',
      'Rule-of-18 frets sit nearer the nut than modern ones: at most ' + num(S.rule18Gap(worst, L) * 1000, 2) + ' mm (fret ' + worst + ')');
    D.pill(c, txt, X(0) + 2, top + (Lo.narrow ? 15 : 17), C['si-r18'], 'left', fnt(Lo.narrow ? 10 : 11, 600));
    c.restore();
  }
  function drawNeck(c, inf) {
    const key = neckKey();
    const oc = neckCache.cv;
    if (neckCache.key !== key) {
      neckCache.key = key;
      oc.width = Math.round(cw * dpr); oc.height = Math.round(ch * dpr);
      const g = oc.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cw, ch);
      drawNeckStatic(g);
    }
    c.drawImage(oc, 0, 0, cw, ch);
    // 動態的部分：振動部分的弦加亮、手指、輕觸點、撥弦點
    const si = cur().si, sx = stopXi(inf);
    const ya = stringY(si, sx), yb = stringY(si, 1);
    c.save();
    c.strokeStyle = alpha(C['si-wave'], D.dark ? 0.75 : 0.55); c.lineWidth = 1.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(X(sx), ya - stringWidth(si) * 0.9 - 1.5); c.lineTo(X(1), yb - stringWidth(si) * 0.9 - 1.5); c.stroke();
    c.restore();
    if (inf.hand === 'press' && inf.Leff < inf.L - 1e-9) {
      let fx;
      if (inf.fret != null) {
        const xa = S.fretX(inf.fret - 1, 1, state.rule), xb = S.fretX(inf.fret, 1, state.rule);
        fx = X(xb - 0.3 * (xb - xa));
      } else fx = X(sx);
      fingertip(c, fx, stringY(si, sx), 1);
    }
    if (inf.hand === 'touch') {
      const tx = X(inf.touch), ty = stringY(si, inf.touch);
      fingertip(c, tx, ty, 0.45);
      c.strokeStyle = C['si-touch']; c.lineWidth = 2.2;
      c.beginPath(); c.arc(tx, ty, Lo.narrow ? 6 : 7.5, 0, Math.PI * 2); c.stroke();
    }
    const px = X(1 - state.beta * inf.Leff / inf.L), py = stringY(si, 1 - state.beta * inf.Leff / inf.L);
    pick(c, px, py - (Lo.narrow ? 9 : 11));
    if (kb && kb.focused()) {
      const k = kb.index();
      let fx2, fy2;
      if (k === 0) { fx2 = px; fy2 = py - 6; }
      else if (k === 1) { fx2 = inf.hand === 'touch' ? X(inf.touch) : X(sx); fy2 = stringY(si, sx); }
      else { fx2 = (Lo.x0 + Lo.x1) / 2; fy2 = stringY(si, 0.5); }
      c.save();
      c.setLineDash([4, 3]); c.strokeStyle = C.accent; c.lineWidth = 1.5;
      if (k === 2) D.roundRect(c, Lo.x0 - 6, fy2 - 9, Lo.x1 - Lo.x0 + 12, 18, 6);
      else D.roundRect(c, fx2 - 14, fy2 - 16, 28, 32, 7);
      c.stroke();
      c.restore();
    }
  }
  function fingertip(c, x, y, op) {
    const r = Lo.narrow ? 7 : 9;
    c.save();
    c.globalAlpha = op;
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : alpha(C.text, 0.3); c.shadowBlur = 6; c.shadowOffsetY = 2;
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.5, r * 0.15, x, y, r * 1.4);
    g.addColorStop(0, D.shade(C['si-finger'], 0.45)); g.addColorStop(0.6, C['si-finger']); g.addColorStop(1, D.shade(C['si-finger'], -0.3));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(x, y, r * 0.95, r * 1.35, 0, 0, Math.PI * 2); c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = alpha('#ffffff', 0.35);
    c.beginPath(); c.ellipse(x - r * 0.15, y - r * 0.55, r * 0.45, r * 0.3, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  /** 撥弦點：一片小撥片 */
  function pick(c, x, y) {
    const s = Lo.narrow ? 7 : 8.5;
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.3); c.shadowBlur = 4; c.shadowOffsetY = 1.5;
    const g = c.createLinearGradient(x, y - s, x, y + s);
    g.addColorStop(0, D.shade(C['si-pick'], 0.35)); g.addColorStop(1, D.shade(C['si-pick'], -0.15));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - s, y - s * 0.7);
    c.quadraticCurveTo(x, y - s * 1.25, x + s, y - s * 0.7);
    c.quadraticCurveTo(x + s * 0.6, y + s * 0.3, x, y + s * 0.95);
    c.quadraticCurveTo(x - s * 0.6, y + s * 0.3, x - s, y - s * 0.7);
    c.fill();
    c.restore();
  }

  // =====================================================================
  // 繪圖：弦的振動（側面）
  // =====================================================================
  /** 目前畫面要畫的模態：撥弦或拉弓時用當下的快照，沒有聲音時用目前的設定（靜止） */
  function liveModes(now) {
    const p = state.play;
    if (!p) return null;
    const el = (now - p.t0) / 1000;
    const decay = p.kind === 'bow' ? null : p.taus.map(function (tau) { return Math.exp(-el / tau); });
    const ramp = p.kind === 'bow' ? Math.min(1, el / 0.15) : 1;
    const phase = reducedMotion ? 0 : 2 * Math.PI * VIS_F * el;
    const k = ramp * (p.boost || 1);
    return { inf: p.inf, amps: p.amps.map(function (a) { return a * k; }), decay: decay, phase: phase, bow: p.kind === 'bow', el: el, boost: p.boost || 1 };
  }
  /** 振幅很小（例如輕觸泛音）時，畫面上再放大，才看得到振動的形狀 */
  function boostOf(amps) {
    const sum = amps.reduce(function (s, a) { return s + Math.abs(a); }, 0);
    return sum > 1e-9 && sum < 0.25 ? 0.45 / sum : 1;
  }
  function drawString(c, inf, now) {
    const top = Lo.strT, h = Lo.strH, yc = Lo.strY, x0 = Lo.x0, x1 = Lo.x1;
    const Apx = h * 0.36;
    // 底板
    c.save();
    D.roundRect(c, Lo.pad, top, cw - 2 * Lo.pad, h, 10);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.018); c.fill();
    c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
    c.restore();
    const lm = liveModes(now);
    const use = lm ? lm.inf : inf;
    const sx = stopXi(use), xs = X(sx);
    // 靜止位置
    c.save();
    c.setLineDash([2, 5]); c.strokeStyle = alpha(C.muted, 0.45); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, yc + 0.5); c.lineTo(x1, yc + 0.5); c.stroke();
    c.restore();
    // 兩端：琴枕（千斤）與琴橋（琴碼）
    post(c, x0, yc, '#efe7d4');
    post(c, x1, yc, state.inst === 'guitar' ? '#f2ead8' : state.inst === 'violin' ? '#e8d2a8' : '#c9a46a');
    const lw = Math.max(1.6, Math.min(3.4, stringWidth(cur().si) * 0.9));
    // 不振動的部分（琴枕到手指）
    if (xs > x0 + 0.5) {
      c.strokeStyle = alpha(C.muted, 0.8); c.lineWidth = lw * 0.8; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, yc); c.lineTo(xs, yc); c.stroke();
    }
    // 振動部分
    const M = Lo.narrow ? 120 : 200;
    const pts = [];
    let yAt = null;
    if (lm) {
      for (let k = 0; k <= M; k++) {
        const u = k / M;
        pts.push([x1 - u * (x1 - xs), yc - Apx * S.shapeAt(u, lm.amps, lm.phase, lm.decay, lm.bow)]);
      }
      yAt = function (u) { return yc - Apx * S.shapeAt(u, lm.amps, lm.phase, lm.decay, lm.bow); };
    } else if (state.pull) {
      const u0 = state.pull.u, hh = 0.6;
      for (let k = 0; k <= M; k++) { const u = k / M; pts.push([x1 - u * (x1 - xs), yc - Apx * S.triangle(u, u0, hh)]); }
      yAt = function (u) { return yc - Apx * S.triangle(u, u0, hh); };
    } else {
      pts.push([x1, yc], [xs, yc]);
      yAt = function () { return yc; };
    }
    // 撥的瞬間的三角形（虛線參考）
    if (!state.pull && inf.hand === 'press') {
      const b = lm ? lm.inf.beta : state.beta, hh = lm && lm.bow ? 0 : 0.6 * (lm ? state.play.h / 0.6 : 1);
      if (hh) {
        c.save();
        c.setLineDash([5, 5]); c.strokeStyle = alpha(C['si-pick'], lm ? 0.35 : 0.55); c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(x1, yc); c.lineTo(x1 - b * (x1 - xs), yc - Apx * hh); c.lineTo(xs, yc); c.stroke();
        c.restore();
      }
    }
    // 輕觸：留下的最低模態的包絡與節點
    if (use.hand === 'touch' && use.lowest) {
      const k = use.lowest, ak = lm ? Math.abs(lm.amps[k - 1]) * (lm.decay ? lm.decay[k - 1] : 1) : 0.3;
      const amp = Apx * Math.max(ak, 0.08);
      c.save();
      c.setLineDash([3, 4]); c.strokeStyle = alpha(C['si-touch'], 0.6); c.lineWidth = 1.2;
      [-1, 1].forEach(function (sg) {
        c.beginPath();
        for (let j = 0; j <= M; j++) { const u = j / M, px = x1 - u * (x1 - xs), py = yc + sg * amp * Math.abs(Math.sin(k * Math.PI * u)); if (j) c.lineTo(px, py); else c.moveTo(px, py); }
        c.stroke();
      });
      c.restore();
      for (let j = 1; j < k; j++) {
        const px = x1 - (j / k) * (x1 - xs);
        D.ball(c, px, yc, Lo.narrow ? 3.2 : 4, C['si-touch'], { glow: 0.5, shadow: false });
      }
    }
    // 弦本身（管狀線條）
    D.tube(c, function (g) { pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); }, C['si-wave'], lw + 1.6);
    // 手指（按弦）或輕觸的手指
    if (use.hand === 'press' && use.Leff < use.L - 1e-9) {
      if (use.fret != null) {
        c.fillStyle = C['si-fret'];
        D.block(c, xs - 1.5, yc - 2, 3, 12, C['si-fret'], { r: 1, shadow: false });
      }
      fingertip(c, xs - (use.fret != null ? 7 : 0), yc - (Lo.narrow ? 9 : 11), 1);
    }
    if (use.hand === 'touch') {
      const tx = X(use.touch);
      fingertip(c, tx, yc - (Lo.narrow ? 10 : 12), 0.45);
      c.strokeStyle = C['si-touch']; c.lineWidth = 2;
      c.beginPath(); c.arc(tx, yc, Lo.narrow ? 6 : 7, 0, Math.PI * 2); c.stroke();
    }
    // 撥弦點（擦弦時是弓的位置）
    const b = state.pull ? state.pull.u : (lm ? lm.inf.beta : state.beta);
    const bx = x1 - b * (x1 - xs), by = yAt(b);
    if (lm && lm.bow) {
      c.save();
      c.strokeStyle = alpha(C['si-warn'], 0.85); c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(bx - 3, yc - h * 0.42); c.lineTo(bx + 3, yc + h * 0.42); c.stroke();
      c.strokeStyle = alpha('#f6ecd2', 0.9); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(bx - 5, yc - h * 0.42); c.lineTo(bx + 1, yc + h * 0.42); c.stroke();
      c.restore();
    } else {
      D.ball(c, bx, by, Lo.narrow ? 3.4 : 4.2, C['si-pick'], { glow: 0.3 });
      if (!lm) pick(c, bx, by - (Lo.narrow ? 13 : 15));
    }
    // 標籤
    const f = fnt(Lo.narrow ? 10.5 : 11.5, 600);
    const leftLbl = state.inst === 'erhu' ? T('千斤', 'qianjin') : T('琴枕', 'nut');
    const rightLbl = state.inst === 'erhu' ? T('琴碼', 'bridge') : T('琴橋', 'bridge');
    D.haloText(c, leftLbl, x0, top + h - 6, C.muted, 'center', 'alphabetic', fnt(Lo.narrow ? 10 : 11));
    D.haloText(c, rightLbl, x1, top + h - 6, C.muted, 'center', 'alphabetic', fnt(Lo.narrow ? 10 : 11));
    const slow = use.f1 / VIS_F;
    let sl = lm ? T('慢動作：放慢 ' + Math.round(slow) + ' 倍', 'Slow motion: ' + Math.round(slow) + '× slower') : T('靜止：按「撥一下」或在弦上拖曳', 'At rest: press “Pluck” or drag the string');
    if (lm && lm.boost > 1.05) sl += T('，振幅再放大 ' + num(lm.boost, 1) + ' 倍', ', height × ' + num(lm.boost, 1));
    D.pill(c, sl, Lo.pad + 8, top + (Lo.narrow ? 20 : 22), lm ? C['si-wave'] : C.muted, 'left', f);
    D.haloText(c, T('振幅放大示意', 'height exaggerated'), cw - Lo.pad - 8, top + 15, C.muted, 'right', 'alphabetic', fnt(Lo.narrow ? 10 : 11));
    // 比例尺：10 cm
    const L = cur().L, px10 = 0.1 / L * (x1 - x0);
    const sbx = (x0 + x1) / 2 - px10 / 2, sby = top + h - 10;
    c.strokeStyle = alpha(C.muted, 0.9); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(sbx, sby - 4); c.lineTo(sbx, sby); c.lineTo(sbx + px10, sby); c.lineTo(sbx + px10, sby - 4); c.stroke();
    D.haloText(c, '10 cm', sbx + px10 / 2, sby - 4, C.muted, 'center', 'alphabetic', fnt(10));
  }
  function post(c, x, y, color) {
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.25); c.shadowBlur = 4; c.shadowOffsetY = 2;
    const g = c.createLinearGradient(x - 5, 0, x + 5, 0);
    g.addColorStop(0, D.shade(color, -0.2)); g.addColorStop(0.5, D.shade(color, 0.2)); g.addColorStop(1, D.shade(color, -0.3));
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x - 6, y + 14); c.lineTo(x - 1.5, y); c.lineTo(x + 1.5, y); c.lineTo(x + 6, y + 14); c.closePath(); c.fill();
    c.restore();
  }

  // =====================================================================
  // 繪圖：頻譜
  // =====================================================================
  function drawSpectrum(now) {
    const c = ctx2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw2, ch2);
    const narrow = cw2 < 560;
    const left = narrow ? 30 : 38, right = cw2 - (narrow ? 8 : 14), top = narrow ? 30 : 32, bot = ch2 - (narrow ? 30 : 32);
    const lm = liveModes(now);
    const inf = lm ? lm.inf : info(false);
    // 格線
    c.save();
    c.strokeStyle = alpha(C.text, D.dark ? 0.1 : 0.08); c.lineWidth = 1 / dpr;
    c.beginPath();
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) { const y = Math.round(bot - v * (bot - top)) + 0.5 / dpr; c.moveTo(left, y); c.lineTo(right, y); });
    c.stroke();
    c.font = fnt(10); c.fillStyle = C.muted; c.textAlign = 'right'; c.textBaseline = 'middle';
    [0, 0.5, 1].forEach(function (v) { c.fillText(String(v), left - 5, bot - v * (bot - top)); });
    c.restore();
    const n = N_BARS, slot = (right - left) / n, bw = Math.max(5, slot * 0.62);
    for (let k = 1; k <= n; k++) {
      const A0 = inf.A[k - 1];
      let A = A0;
      if (lm && !lm.bow) A = A0 * lm.decay[k - 1];
      if (lm && lm.bow) A = A0 * Math.min(1, lm.el / 0.15);
      const cx = left + (k - 0.5) * slot, x = cx - bw / 2;
      const h0 = A0 * (bot - top), h = A * (bot - top);
      if (A0 < 0.01) {
        // 缺少的泛音：虛線空框
        c.save();
        c.setLineDash([3, 3]); c.strokeStyle = alpha(C.muted, 0.75); c.lineWidth = 1;
        D.roundRect(c, x + 0.5, bot - 16, bw - 1, 16, 3); c.stroke();
        c.restore();
      } else {
        if (h > 0.5) {
          const g = c.createLinearGradient(0, bot - h, 0, bot);
          g.addColorStop(0, D.shade(C['si-spec'], 0.3)); g.addColorStop(1, D.shade(C['si-spec'], -0.15));
          c.save();
          c.globalAlpha = lm ? 1 : 0.55;
          D.roundRect(c, x, bot - h, bw, h, Math.min(4, bw / 3)); c.fillStyle = g; c.fill();
          c.restore();
        }
        c.strokeStyle = alpha(C['si-spec'], 0.9); c.lineWidth = 1.2;
        D.roundRect(c, x + 0.5, bot - h0 + 0.5, bw - 1, Math.max(1, h0 - 1), Math.min(4, bw / 3)); c.stroke();
      }
      if (inf.hand === 'touch' && inf.lowest === k) {
        c.strokeStyle = C['si-touch']; c.lineWidth = 2;
        D.roundRect(c, x - 3, bot - Math.max(h0, 16) - 4, bw + 6, Math.max(h0, 16) + 8, 5); c.stroke();
      }
      c.fillStyle = C.muted; c.font = fnt(narrow ? 9.5 : 10.5, inf.lowest === k ? 700 : 400); c.textAlign = 'center'; c.textBaseline = 'top';
      if (!narrow || k % 1 === 0) c.fillText(String(k), cx, bot + 4);
    }
    const lbl = narrow ? T('頻譜：基頻 ' + hz(inf.f1) + ' 的 n 倍', 'Spectrum: n × ' + hz(inf.f1))
      : T('頻譜：基頻 ' + hz(inf.f1) + ' 的整數倍（下方數字是泛音次數 n）', 'Spectrum: whole multiples of the fundamental, ' + hz(inf.f1) + ' (numbers below: harmonic n)');
    D.pill(c, lbl, left, narrow ? 21 : 23, C['si-spec'], 'left', fnt(narrow ? 10 : 11.5, 600));
    if (inf.silent) D.pill(c, T('幾乎無聲', 'Nearly silent'), right, narrow ? 21 : 23, C['si-pick'], 'right', fnt(narrow ? 10 : 11.5, 700));
  }

  // =====================================================================
  // 主繪圖與動畫
  // =====================================================================
  let reducedMotion = D.reducedMotion();
  function draw(now) {
    if (!Lo) return;
    now = now || performance.now();
    const inf = info(false);
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    const lm = state.play ? state.play.inf : null;
    drawTuner(c, lm && state.play.kind === 'bow' ? info(true) : inf);
    drawNeck(c, inf);
    drawString(c, inf, now);
    drawSpectrum(now);
  }
  let raf = 0;
  function frame() {
    raf = 0;
    const now = performance.now();
    if (state.play && state.play.kind === 'pluck' && (now - state.play.t0) / 1000 > state.play.life) { state.play = null; updateStopBtn(); }
    if (!stage.classList.contains('is3d')) draw(now); else drawSpectrum(now);
    if (view3 && view3.active) view3.frame();
    if (state.play || state.pull) raf = requestAnimationFrame(frame);
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }

  // =====================================================================
  // 聲音
  // =====================================================================
  let sayTimer = 0;
  function say(msg) {
    const el = $('status');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 30);
  }
  function soundOffHint() {
    if (MA.enabled()) return false;
    say(MA.offHint());
    MA.flashSoundButton($('soundBtn'));
    return true;
  }
  function pluckModes(inf, h) {
    const modes = [];
    for (let n = 1; n <= inf.A.length; n++) {
      const a = inf.A[n - 1];
      if (a < 0.004) continue;
      modes.push({ f: n * inf.f1, a: a, tau: S.decayTau(n, inf.f1, inf.inst) });
    }
    return modes;
  }
  /** 撥一下：via = 'button' | 'canvas' | 'key'；h：拉起的高度（畫面與音量） */
  function pluck(via, h) {
    h = h || 0.6;
    if (state.play && state.play.kind === 'bow') stopBow(true);
    MA.stopAll(0.04);
    const inf = info(false);
    const taus = [];
    for (let n = 1; n <= inf.a.length; n++) taus.push(S.decayTau(n, inf.f1, inf.inst));
    const life = Math.min(9, 5 * taus[0]);
    state.play = { kind: 'pluck', t0: performance.now(), inf: inf, amps: inf.a.map(function (a) { return a * h; }), taus: taus, h: h, life: life };
    state.play.boost = boostOf(state.play.amps);
    let off = false;
    if (!inf.silent) {
      if (MA.enabled()) {
        MA.modal({ modes: pluckModes(inf, h), gain: Math.min(0.9, 0.45 + 0.45 * h) * (inf.hand === 'touch' ? Math.max(0.4, inf.peak) : 1), dur: life, attack: 0.004 });
      } else off = soundOffHint();
    }
    if (!off) say(describePlay(inf, false));
    updateLowHint(inf);
    addLog(inf, false);
    emit('pluck', Object.assign({ via: via }, inf));
    updateStopBtn();
    requestDraw();
  }
  function describePlay(inf, bow) {
    const who = stringName(inf.inst, inf.si) + T('，', ', ') + handText(inf);
    if (inf.silent) return (bow ? T('拉弓：', 'Bowing: ') : T('撥一下：', 'Pluck: ')) + who + T(' → 幾乎沒有聲音。', ' → almost no sound.');
    return (bow ? T('拉弓：', 'Bowing: ') : T('撥一下：', 'Pluck: ')) + who + ' → ' + hz(inf.fSound) + T('（', ' (') + inf.note + ' ' + signed(inf.noteCents, 1) + T(' 音分）', ' ¢)') +
      (inf.hand === 'touch' ? T('，第 ' + inf.lowest + ' 泛音', ', harmonic ' + inf.lowest) : '') + T('。', '.');
  }
  function bowPartials(inf) { return inf.A.slice(0, 20).map(function (a) { return a < 0.004 ? 0 : a; }); }
  function startBow() {
    if (I().frets) return;
    MA.stopAll(0.04);
    const inf = info(true);
    state.play = { kind: 'bow', t0: performance.now(), inf: inf, amps: inf.a.slice(), taus: null, h: 0.55, bowId: ++state.bowN, sMin: state.finger, sMax: state.finger, lastS: state.finger, maxStep: 0 };
    state.play.amps = inf.a.map(function (a) { return a * 0.55; });
    state.play.boost = boostOf(state.play.amps);
    $('bow').setAttribute('aria-pressed', 'true');
    $('bow').textContent = T('停止拉弓', 'Stop bowing');
    let off = false;
    voice = null;
    if (!inf.silent) {
      if (MA.enabled()) voice = MA.sustain({ f0: inf.f1, partials: bowPartials(inf), gain: 0.42, attack: 0.09, maxDur: 12, onEnd: function () { stopBow(false, true); } });
      else off = soundOffHint();
    }
    if (!off) say(describePlay(inf, true));
    updateLowHint(inf);
    addLog(inf, true);
    emit('bow', Object.assign({ via: 'button', bowId: state.play.bowId }, inf));
    updateStopBtn();
    requestDraw();
  }
  /** 拉弓中改了設定：聲音與畫面即時跟著變（滑音） */
  function updateBow() {
    const p = state.play;
    if (!p || p.kind !== 'bow') return;
    const inf = info(true);
    const wasSilent = p.inf.silent;
    p.inf = inf;
    p.amps = inf.a.map(function (a) { return a * 0.55; });
    p.boost = boostOf(p.amps);
    if (voice) {
      if (inf.silent) voice.set({ gain: 0.0001 }, 0.05);
      else voice.set({ f0: inf.f1, partials: bowPartials(inf), gain: 0.42 }, 0.06);
    } else if (wasSilent && !inf.silent && MA.enabled()) {
      voice = MA.sustain({ f0: inf.f1, partials: bowPartials(inf), gain: 0.42, attack: 0.09, maxDur: 12, onEnd: function () { stopBow(false, true); } });
    }
    if (state.hand === 'press') {
      // 滑音要連續：記下這一弓走過的範圍與單次最大的跳動（打字一次跳很遠不算滑）
      p.maxStep = Math.max(p.maxStep, Math.abs(state.finger - p.lastS));
      p.lastS = state.finger;
      p.sMin = Math.min(p.sMin, state.finger); p.sMax = Math.max(p.sMax, state.finger);
      emit('slide', { inst: state.inst, si: cur().si, bowId: p.bowId, s: state.finger, sMin: p.sMin, sMax: p.sMax, maxStep: p.maxStep, f1: inf.f1, fOpen: inf.fOpen });
    }
  }
  function stopBow(quiet, timeUp) {
    if (voice) { try { voice.stop(0.12); } catch (e) { /* 已停 */ } voice = null; }
    if (state.play && state.play.kind === 'bow') state.play = null;
    $('bow').setAttribute('aria-pressed', 'false');
    $('bow').textContent = T('拉弓（持續音）', 'Bow (sustained)');
    if (timeUp) say(T('拉弓 12 秒到了，自動停止。', 'Bowing stopped after 12 seconds.'));
    else if (!quiet) say(T('停止拉弓。', 'Stopped bowing.'));
    updateStopBtn();
    requestDraw();
  }
  function stopAll(msg) {
    const was = !!state.play || MA.playing();
    if (state.play && state.play.kind === 'bow') stopBow(true);
    MA.stopAll(0.08);
    state.play = null;
    state.pull = null;
    updateStopBtn();
    requestDraw();
    if (msg && was) say(T('已停止。', 'Stopped.'));
  }
  /** 撥弦還在響的時候改了設定：停下（畫面與聲音一致）；拉弓則即時跟著改 */
  function interrupt() {
    if (!state.play) return;
    if (state.play.kind === 'bow') { updateBow(); return; }
    MA.stopAll(0.1);
    state.play = null;
    updateStopBtn();
  }
  function updateStopBtn() { $('stop').disabled = !(state.play || MA.playing()); }
  MA.onChange(function () { updateStopBtn(); });
  function updateLowHint(inf) {
    const el = $('lowHint');
    const f = inf.fSound;
    if (f && f < 200) {
      el.hidden = false;
      el.textContent = T('手機或筆電的小喇叭放不出 200 Hz 以下的基音：這時你聽到的音高，是靠泛音撐起來的。', 'Small phone and laptop speakers cannot play fundamentals below 200 Hz: the pitch you hear then comes from the harmonics.');
    } else el.hidden = true;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
    if (!on && voice) { try { voice.stop(0.05); } catch (e) { /* 已停 */ } voice = null; }
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function snapshotPrev() {
    const inf = info(false);
    return { inst: state.inst, si: cur().si, L: inf.L, T: inf.T, mu: inf.mu, fOpen: inf.fOpen, mode: inf.mode, mat: inf.mat, d: inf.d };
  }
  /** 調弦（弦長、張力、線密度、材料、直徑）由使用者改完之後 */
  function emitTune(changed, prev) {
    const inf = info(false);
    emit('tune', Object.assign({ changed: changed, prev: prev || null }, inf));
    say(tuneMessage(inf));
  }
  function tuneMessage(inf) {
    const dev = inf.devs[inf.si];
    const tgt = window.MusicTheory.noteName(inf.target);
    return stringName(inf.inst, inf.si) + T('：空弦 ', ': open string ') + hz(inf.fOpen) + T('，離目標 ' + tgt + ' ', ', ') + signed(dev, 1) + T(' 音分', ' cents from ' + tgt) +
      (Math.abs(dev) <= 3 ? T('（調準了）', ' (in tune)') : '') + T('。', '.');
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab'), stage = $('stage');
  const elL = $('len'), elT = $('ten'), elMu = $('mu'), elD = $('dia'), elFret = $('fret'), elFinger = $('finger'), elTouch = $('touch'), elBeta = $('beta');
  const muToVal = function (p) { return MU_MIN * Math.pow(MU_MAX / MU_MIN, p / 1000); };
  const muToPos = function (v) { return 1000 * Math.log(v / MU_MIN) / Math.log(MU_MAX / MU_MIN); };
  if (window.LabNum) window.LabNum.register(elMu, { toValue: muToVal, toPos: muToPos, min: MU_MIN, max: MU_MAX, decimals: 3 });
  function setSlider(el, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(el, v); else el.value = String(v);
    applying = false;
  }
  function fmtOut(v, dec) { return num(v, dec); }
  /** 顯示的小數位：剛好是 base 位就顯示 base 位，否則顯示 more 位（打字輸入可以比滑桿細） */
  function decFor(v, base, more) { const p = Math.pow(10, base); return Math.abs(Math.round(v * p) - v * p) < 1e-6 ? base : more; }
  function refreshOutputs() {
    const st = curStr();
    $('leno').textContent = fmtOut(cur().L, 3);
    $('teno').textContent = fmtOut(st.T, decFor(st.T, 1, 2));
    $('muo').textContent = fmtOut(st.muG, 3);
    $('diao').textContent = fmtOut(st.d, decFor(st.d, 2, 3));
    $('freto').textContent = String(state.fret);
    $('fingero').textContent = fmtOut(state.finger, decFor(state.finger, 2, 3));
    $('toucho').textContent = fmtOut(state.touch, decFor(state.touch, 3, 4));
    $('betao').textContent = fmtOut(state.beta, decFor(state.beta, 2, 3));
    $('kgw').textContent = T('≈ ' + num(S.kgw(st.T), 2) + ' 公斤重', '≈ ' + num(S.kgw(st.T), 2) + ' kgf');
  }
  /** 把目前樂器與弦的數值放到滑桿上（程式改，不算使用者操作） */
  function syncSliders() {
    const st = curStr();
    setSlider(elL, cur().L);
    setSlider(elT, st.T);
    setSlider(elMu, Math.max(MU_MIN, Math.min(MU_MAX, st.muG)));
    const R = S.MATERIALS[st.mat].d;
    elD.min = String(R[0]); elD.max = String(R[1]);
    setSlider(elD, st.d);
    setSlider(elFret, state.fret);
    setSlider(elFinger, state.finger);
    setSlider(elTouch, state.touch);
    setSlider(elBeta, state.beta);
  }
  function syncUI() {
    lab.dataset.frets = I().frets ? '1' : '0';
    lab.dataset.hand = state.hand;
    lab.dataset.mumode = curStr().mode;
    document.querySelectorAll('#insts button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.inst === state.inst)); });
    $('handPress').setAttribute('aria-pressed', String(state.hand === 'press'));
    $('handTouch').setAttribute('aria-pressed', String(state.hand === 'touch'));
    $('ruleEt').setAttribute('aria-pressed', String(state.rule === 'et'));
    $('rule18').setAttribute('aria-pressed', String(state.rule === 'r18'));
    $('muDirect').setAttribute('aria-pressed', String(curStr().mode === 'mu'));
    $('muMat').setAttribute('aria-pressed', String(curStr().mode === 'mat'));
    document.querySelectorAll('#mats button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mat === curStr().mat)); });
    document.querySelectorAll('#touches button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.tf === state.tf)); });
    $('show18').checked = state.show18;
    buildStrings();
    updateNotes();
    refreshOutputs();
    updateReadouts();
  }
  function buildStrings() {
    const box = $('strings');
    const inf = info(false);
    const n = I().strings.length;
    // 按鈕只在換樂器時重建；其他時候就地更新文字與狀態（鍵盤焦點才不會因為調弦或選弦而跑掉）
    if (box.dataset.inst !== state.inst || box.children.length !== n) {
      box.textContent = '';
      for (let k = n - 1; k >= 0; k--) {   // 高音在前（和指板上一樣，高音在上）
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.si = k;
        b.appendChild(document.createElement('b')); b.appendChild(document.createElement('small'));
        box.appendChild(b);
      }
      box.dataset.inst = state.inst;
    }
    const set = function (el, prop, v) { if (el[prop] !== v) el[prop] = v; };
    const attr = function (el, a, v) { if (el.getAttribute(a) !== v) el.setAttribute(a, v); };
    Array.prototype.forEach.call(box.children, function (btn) {
      const k = +btn.dataset.si, dev = inf.devs[k], ok = Math.abs(dev) <= 3;
      const nm = window.MusicTheory.noteName(I().strings[k].midi);
      const lbl = state.inst === 'guitar' ? I().strings[k].label + ' · ' + nm : state.inst === 'violin' ? nm : stringShort(state.inst, k) + ' · ' + nm;
      attr(btn, 'aria-pressed', String(k === cur().si));
      attr(btn, 'aria-label', stringName(state.inst, k) + T('，離目標 ', ', ') + signed(dev, 1) + T(' 音分', ' cents off'));
      set(btn.children[0], 'textContent', lbl);
      set(btn.children[1], 'className', ok ? 'ok' : '');
      set(btn.children[1], 'textContent', (ok ? '✓ ' : '') + signed(dev, 0));
    });
  }
  function updateNotes() {
    const id = state.inst, st = curStr(), s = I().strings[cur().si];
    const notes = {
      guitar: T('弦長 650 mm（琴枕到琴橋）。剛從琴盒拿出來，還沒調音：調張力讓每條弦都變綠色。', 'Scale length 650 mm (nut to bridge). Straight out of the case and not yet tuned: adjust the tension until every string turns green.'),
      violin: T('弦長 328 mm。沒有品：手指可以按在任何位置，也可以拉弓、滑音。', 'String length 328 mm. No frets: the finger can stop the string anywhere, and you can bow and slide.'),
      erhu: T('千斤到琴碼約 400 mm。沒有指板，手指在空中按弦；拉弓時滑動手指就是滑音。', 'About 400 mm from the qianjin to the bridge. No fingerboard: the fingers press the strings in mid-air; slide the finger while bowing for a glissando.')
    };
    $('instNote').textContent = notes[id];
    let mn;
    if (st.mode === 'mat') {
      const rho = S.MATERIALS[st.mat].rho;
      mn = T('μ = ρπd²/4 = ' + rho + ' × π × (' + num(st.d, 2) + ' mm)² ÷ 4 = ' + num(S.stringMu(st) * 1000, 3) + ' g/m（' + T(S.MATERIALS[st.mat].zh, S.MATERIALS[st.mat].en) + '）',
        'μ = ρπd²/4 = ' + rho + ' × π × (' + num(st.d, 2) + ' mm)² ÷ 4 = ' + num(S.stringMu(st) * 1000, 3) + ' g/m (' + S.MATERIALS[st.mat].en.toLowerCase() + ')');
    } else if (s.kind === 'wound') {
      const solid = S.muWire(S.MATERIALS[s.core].rho, s.d) * 1000;
      mn = T('纏繞弦（' + (s.core === 'nylon' ? '尼龍' : '鋼') + '芯外纏金屬線）：直徑 ' + num(s.d, 2) + ' mm、' + num(st.muG, 2) + ' g/m；同樣粗的實心' + (s.core === 'nylon' ? '尼龍' : '鋼') + '弦只有 ' + num(solid, 2) + ' g/m。',
        'Wound string (a ' + s.core + ' core wrapped in metal wire): ' + num(s.d, 2) + ' mm across, ' + num(st.muG, 2) + ' g/m; a solid ' + s.core + ' string as thick would be only ' + num(solid, 2) + ' g/m.');
    } else {
      mn = T('實心' + (s.core === 'nylon' ? '尼龍' : '鋼') + '弦：直徑約 ' + num(S.diameterFor(st.muG / 1000, S.MATERIALS[s.core].rho), 2) + ' mm。', 'Plain ' + s.core + ' string, about ' + num(S.diameterFor(st.muG / 1000, S.MATERIALS[s.core].rho), 2) + ' mm across.');
    }
    $('muNote').textContent = mn;
    $('fretlessNote').textContent = T('沒有品，手指位置可以有小數：按得出平均律以外的音，也能滑音。', 'With no frets the finger position can be fractional: notes between the equal-tempered ones, and slides.');
  }
  let eqKey = '';
  function updateReadouts() {
    const inf = info(false);
    $('rHear').textContent = inf.silent ? T('幾乎無聲', 'nearly silent') : hz(inf.fSound);
    $('rNote').textContent = inf.silent ? '—' : inf.note + ' ' + signed(inf.noteCents, 1) + T(' 音分', ' ¢');
    $('rF1').textContent = hz(inf.f1);
    const dev = inf.devs[inf.si];
    $('rOpen').innerHTML = hz(inf.fOpen) + ' <small>' + T('目標 ', 'target ') + window.MusicTheory.noteName(inf.target) + ' ' + signed(dev, 1) + '</small>';
    $('rV').textContent = num(inf.v, 1) + ' m/s';
    $('rT').innerHTML = num(inf.T, 2) + ' N <small>(' + num(S.kgw(inf.T), 2) + ' kgw)</small>';
    $('rMu').textContent = num(inf.muG, 3) + ' g/m';
    $('rLeff').textContent = num(inf.Leff, 3) + ' m';
    if (inf.fret) {
      $('r18').textContent = T('差 ' + num(S.rule18Gap(inf.fret, inf.L) * 1000, 3) + ' mm、' + signed(S.rule18Cents(inf.fret), 1) + ' 音分',
        num(S.rule18Gap(inf.fret, inf.L) * 1000, 3) + ' mm, ' + signed(S.rule18Cents(inf.fret), 1) + ' ¢');
    } else $('r18').textContent = '—';
    // 數字都是 SI 單位（m、N、kg/m）；式子短一點，手機上才放得下
    const tex = 'f_1=\\dfrac{1}{2\\times' + inf.Leff.toFixed(3) + '}\\sqrt{\\dfrac{' + inf.T.toFixed(2) + '}{' + (inf.mu * 1000).toFixed(3) + '\\times10^{-3}}}=' + inf.f1.toFixed(2) + '\\ \\mathrm{Hz}';
    if (tex !== eqKey) {
      eqKey = tex;
      const el = $('rEq');
      if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
      else el.textContent = tex;
      fitEq();
    }
    buildTuneTable(inf);
    buildStrings();
    updateLowHint(inf);
    updateAria(inf);
  }
  function buildTuneTable(inf) {
    const n = I().strings.length;
    let h = '<tr><th>' + T('弦', 'String') + '</th><th>' + T('目標', 'Target') + '</th><th>' + T('頻率', 'Freq.') + '</th><th>' + T('偏差', 'Off') + '</th><th>' + T('到上一條', 'To next') + '</th></tr>';
    for (let k = n - 1; k >= 0; k--) {
      const s = I().strings[k], dev = inf.devs[k];
      const iv = k < n - 1 ? S.cents(inf.opens[k + 1] / inf.opens[k]) : null;
      h += '<tr' + (k === inf.si ? ' class="sel"' : '') + '><td>' + stringShort(state.inst, k) + '</td><td>' + window.MusicTheory.noteName(s.midi) + '</td><td>' +
        num(inf.opens[k], 2) + '</td><td class="' + (Math.abs(dev) <= 3 ? 'ok' : 'off') + '">' + signed(dev, 1) + '</td><td>' + (iv == null ? '' : num(iv, 1) + ' ¢') + '</td></tr>';
    }
    const t = $('tuneTable');
    if (t.innerHTML !== h) t.innerHTML = h;
  }
  let ariaT = 0;
  function updateAria(inf) {
    clearTimeout(ariaT);
    ariaT = setTimeout(function () {
      cv.setAttribute('aria-label', T('弦樂器畫布：', 'String instrument canvas: ') + T(S.INSTRUMENTS[inf.inst].zh, S.INSTRUMENTS[inf.inst].en) + T('，', ', ') + stringName(inf.inst, inf.si) + T('，', ', ') + handText(inf) +
        T('，撥弦位置 ', ', pluck position ') + num(inf.beta, 2) + T('，聽到 ', ', you hear ') + (inf.silent ? T('幾乎無聲', 'nearly nothing') : hz(inf.fSound) + ' ' + inf.note) +
        T('。Enter 切換撥弦點、手指、選弦，方向鍵移動，P 撥一下。', '. Enter switches between the plucking point, the finger and the string; arrow keys move; P plucks.'));
    }, 400);
  }

  // ---------- 滑桿：弦的參數（調弦） ----------
  function beginGesture() { if (!gesture) gesture = snapshotPrev(); }
  function endGesture(changed) {
    const prev = gesture; gesture = null;
    emitTune(changed, prev);
  }
  function stringChanged() {
    interrupt();
    neckCache.key = '';
    refreshOutputs(); updateReadouts(); updateNotes(); requestDraw();
  }
  elL.addEventListener('input', function () { if (applying) return; beginGesture(); cur().L = val(elL); stringChanged(); });
  elL.addEventListener('change', function () { if (applying) return; beginGesture(); cur().L = val(elL); endGesture('L'); });
  elT.addEventListener('input', function () { if (applying) return; beginGesture(); curStr().T = val(elT); stringChanged(); });
  elT.addEventListener('change', function () { if (applying) return; beginGesture(); curStr().T = val(elT); endGesture('T'); });
  elMu.addEventListener('input', function () { if (applying) return; beginGesture(); curStr().muG = val(elMu); stringChanged(); });
  elMu.addEventListener('change', function () { if (applying) return; beginGesture(); curStr().muG = val(elMu); endGesture('mu'); });
  elD.addEventListener('input', function () { if (applying) return; beginGesture(); curStr().d = val(elD); stringChanged(); });
  elD.addEventListener('change', function () { if (applying) return; beginGesture(); curStr().d = val(elD); endGesture('d'); });
  function nudgeT(dt) {
    const prev = snapshotPrev();
    const st = curStr();
    st.T = Math.max(S.RANGES.T[0], Math.min(S.RANGES.T[1], Math.round((st.T + dt) * 100) / 100));
    setSlider(elT, st.T);
    stringChanged();
    emitTune('T', prev);
  }
  $('tenDn').addEventListener('click', function () { nudgeT(-0.1); });
  $('tenUp').addEventListener('click', function () { nudgeT(0.1); });
  function setMuMode(mode) {
    const st = curStr();
    if (st.mode === mode) return;
    const prev = snapshotPrev();
    st.mode = mode;
    if (mode === 'mat') {
      const R = S.MATERIALS[st.mat].d;
      st.d = Math.max(R[0], Math.min(R[1], st.d));
    }
    syncSliders(); syncUI(); stringChanged();
    emitTune('mode', prev);
  }
  $('muDirect').addEventListener('click', function () { setMuMode('mu'); });
  $('muMat').addEventListener('click', function () { setMuMode('mat'); });
  document.querySelectorAll('#mats button').forEach(function (b) {
    b.addEventListener('click', function () {
      const st = curStr();
      if (st.mat === b.dataset.mat) return;
      const prev = snapshotPrev();
      st.mat = b.dataset.mat;
      const R = S.MATERIALS[st.mat].d;
      st.d = Math.max(R[0], Math.min(R[1], st.d));
      syncSliders(); syncUI(); stringChanged();
      emitTune('mat', prev);
    });
  });

  // ---------- 樂器與弦 ----------
  function setInst(id) {
    if (!S.INSTRUMENTS[id] || id === state.inst) return;
    stopAll();
    state.inst = id;
    syncSliders(); syncUI();
    neckCache.key = '';
    resize();
    say(T('換成' + S.INSTRUMENTS[id].zh + '：', 'Now the ' + S.INSTRUMENTS[id].en.toLowerCase() + ': ') + $('instNote').textContent);
  }
  document.querySelectorAll('#insts button').forEach(function (b) { b.addEventListener('click', function () { setInst(b.dataset.inst); }); });
  function setString(i) {
    i = Math.max(0, Math.min(I().strings.length - 1, i));
    if (i === cur().si) return;
    if (state.play && state.play.kind === 'pluck') interrupt();
    cur().si = i;
    syncSliders(); syncUI();
    if (state.play && state.play.kind === 'bow') updateBow();
    requestDraw();
  }
  $('strings').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-si]');
    if (b) setString(+b.dataset.si);
  });
  $('resetInst').addEventListener('click', function () {
    stopAll();
    const si = cur().si;
    state.insts[state.inst] = S.presetInstrument(state.inst);
    cur().si = Math.min(si, I().strings.length - 1);
    syncSliders(); syncUI(); neckCache.key = ''; requestDraw();
    say(T('已恢復成剛從琴盒拿出來的狀態（還沒調音）。', 'Restored to straight-out-of-the-case (untuned).'));
  });

  // ---------- 左手 ----------
  function setHand(h) {
    if (state.hand === h) return;
    state.hand = h;
    interrupt();
    syncUI(); requestDraw();
  }
  $('handPress').addEventListener('click', function () { setHand('press'); });
  $('handTouch').addEventListener('click', function () { setHand('touch'); });
  function leftChanged() { interrupt(); refreshOutputs(); updateReadouts(); requestDraw(); }
  elFret.addEventListener('input', function () { if (applying) return; state.fret = Math.round(val(elFret)); leftChanged(); });
  elFinger.addEventListener('input', function () { if (applying) return; state.finger = val(elFinger); leftChanged(); });
  elTouch.addEventListener('input', function () { if (applying) return; state.touch = val(elTouch); state.tf = null; syncTouchBtns(); leftChanged(); });
  function syncTouchBtns() { document.querySelectorAll('#touches button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.tf === state.tf)); }); }
  document.querySelectorAll('#touches button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tf = +b.dataset.tf;
      state.touch = S.fretXi(state.tf);
      setSlider(elTouch, state.touch);
      state.touch = S.fretXi(state.tf);   // 按鈕是精確的品格位置（滑桿只顯示到 0.001）
      syncTouchBtns(); leftChanged();
    });
  });
  function setRule(r) {
    if (state.rule === r) return;
    state.rule = r;
    interrupt();
    syncUI(); neckCache.key = ''; resize();
  }
  $('ruleEt').addEventListener('click', function () { setRule('et'); });
  $('rule18').addEventListener('click', function () { setRule('r18'); });
  $('show18').addEventListener('change', function () { state.show18 = $('show18').checked; neckCache.key = ''; resize(); });

  // ---------- 右手 ----------
  elBeta.addEventListener('input', function () { if (applying) return; state.beta = val(elBeta); leftChanged(); });

  // ---------- 播放列 ----------
  $('pluck').addEventListener('click', function () { pluck('button', 0.6); });
  $('bow').addEventListener('click', function () { if (state.play && state.play.kind === 'bow') stopBow(); else startBow(); });
  $('stop').addEventListener('click', function () { stopAll(true); });
  $('clear').addEventListener('click', function () {
    stopAll();
    state.log = []; state.logN = 0;
    renderLog();
    requestDraw();
    say(T('已清除撥弦紀錄。', 'Cleared the plucking record.'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && (state.play || state.pull)) { stopAll(false); }
  });

  // ---------- 撥弦紀錄 ----------
  function addLog(inf, bow) {
    state.log.push({ n: ++state.logN, inst: inf.inst, si: inf.si, hand: inf.hand, fret: inf.fret, finger: inf.finger, touch: inf.touch, rule: inf.rule,
      beta: inf.beta, f: inf.fSound, note: inf.note, bow: bow, T: inf.T });
    if (state.log.length > 40) state.log.shift();
    renderLog();
  }
  function instShort(id) { return id === 'guitar' ? T('吉他', 'Gtr') : id === 'violin' ? T('小提琴', 'Vn') : T('二胡', 'Erhu'); }
  /** 紀錄表用的短說明（存原始資料，換語言時重新產生文字） */
  function handShort(r) {
    if (r.hand === 'touch') return T('輕觸 ', 'touch ') + num(r.touch, 3);
    if (r.fret != null) return r.fret ? T('第 ' + r.fret + ' 品', 'fret ' + r.fret) + (r.rule === 'r18' ? T('（18）', ' (18)') : '') : T('空弦', 'open');
    return r.finger > 0.004 ? '+' + num(r.finger, 2) + T(' 半音', ' st') : T('空弦', 'open');
  }
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>#</th><th>' + T('弦', 'String') + '</th><th>' + T('左手', 'Left hand') + '</th><th>β</th><th>T (N)</th><th>' + T('聽到', 'Heard') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.n + (r.bow ? T(' 弓', ' bow') : '') + '</td><td>' + instShort(r.inst) + ' ' + stringShort(r.inst, r.si) + '</td><td>' + handShort(r) + '</td><td>' +
        num(r.beta, 2) + '</td><td>' + num(r.T, 1) + '</td><td>' + (r.f ? num(r.f, 1) + ' Hz ' + r.note : T('無聲', 'silent')) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // ---------- 畫布：指板上點選、在弦上拉起來撥 ----------
  function pointerXY(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function region(p) {
    if (!Lo) return null;
    if (p.y >= Lo.neckT - 4 && p.y <= Lo.numT + 14 && p.x >= Lo.pad && p.x <= cw - Lo.pad) return 'neck';
    if (p.y >= Lo.strT && p.y <= Lo.strT + Lo.strH && p.x >= Lo.x0 - 6 && p.x <= Lo.x1 + 6) return 'string';
    return null;
  }
  function nearestString(p) {
    const xi = Math.max(0, Math.min(1, xiOf(p.x)));
    let best = 0, bd = 1e9;
    for (let i = 0; i < I().strings.length; i++) { const d = Math.abs(stringY(i, xi) - p.y); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function neckAt(p, first) {
    if (first) setString(nearestString(p));
    const xi = xiOf(p.x);
    if (state.hand === 'press') {
      if (xi < 0.004) { setLeft(0); return; }
      if (I().frets) {
        if (xi > S.fretXi(19) + 0.01) return;
        let n = 1;
        while (n < 19 && S.fretX(n, 1, state.rule) < xi) n++;
        setLeft(n);
      } else {
        const sx = Math.max(0, Math.min(0.66, xi));
        setLeft(Math.max(0, Math.min(19, Math.round(12 * Math.log2(1 / (1 - sx)) * 100) / 100)));
      }
    } else {
      let t = Math.max(0.05, Math.min(0.95, xi));
      // 靠近品格位置（十二平均律）時吸附過去
      let snap = null;
      for (let n = 1; n <= 24; n++) { const fx = S.fretXi(n); if (Math.abs(X(fx) - p.x) < 5) snap = n; }
      if (snap) t = S.fretXi(snap);
      state.touch = t; state.tf = [12, 7, 5, 4].indexOf(snap) >= 0 ? snap : null;
      setSlider(elTouch, Math.round(t * 1000) / 1000);
      state.touch = t;
      syncTouchBtns(); leftChanged();
    }
  }
  /** 左手：吉他是品格（整數），無品樂器是半音位置 */
  function setLeft(v) {
    if (I().frets) { state.fret = Math.round(v); setSlider(elFret, state.fret); }
    else { state.finger = v; setSlider(elFinger, v); }
    leftChanged();
  }
  function pullU(p) {
    const inf = info(false);
    const xs = X(stopXi(inf));
    const u = (Lo.x1 - p.x) / (Lo.x1 - xs);
    return Math.max(0.05, Math.min(0.5, Math.round(u * 1000) / 1000));
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = pointerXY(ev);
    const r = region(p);
    if (!r) return;
    state.drag = r;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 有些瀏覽器不支援 */ }
    if (r === 'neck') neckAt(p, true);
    else {
      if (state.play && state.play.kind === 'pluck') interrupt();
      state.pull = { u: pullU(p) };
      requestDraw();
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = pointerXY(ev);
    if (state.drag === 'neck') { neckAt(p, false); return; }
    if (state.drag === 'string' && state.pull) { state.pull.u = pullU(p); requestDraw(); return; }
    const r = region(p);
    cv.style.cursor = r === 'string' ? 'grab' : r === 'neck' ? 'pointer' : 'default';
  });
  function endDrag(ev, cancel) {
    const was = state.drag;
    state.drag = null;
    if (was === 'string' && state.pull) {
      const u = state.pull.u;
      state.pull = null;
      if (cancel) { requestDraw(); return; }
      state.beta = u;
      setSlider(elBeta, u);
      state.beta = u;
      refreshOutputs();
      pluck('canvas', 0.6);
    }
  }
  cv.addEventListener('pointerup', function (ev) { endDrag(ev, false); });
  cv.addEventListener('pointercancel', function (ev) { endDrag(ev, true); });
  cv.addEventListener('keydown', function (e) {
    if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); pluck('key', 0.6); }
  });

  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('弦樂器畫布。Enter 切換撥弦點、手指、選弦，方向鍵移動，Shift 加方向鍵移動得更多，P 撥一下。', 'String instrument canvas. Enter switches between the plucking point, the finger and the string; arrow keys move, Shift for bigger steps; P plucks.'),
      items: [{
        name: function () { return T('撥弦點', 'Plucking point'); },
        move: function (dx, dy, big) {
          if (!dx) return false;
          // 往左（離琴橋越遠）β 變大
          state.beta = Math.max(0.05, Math.min(0.5, Math.round((state.beta - dx * (big ? 0.05 : 0.01)) * 1000) / 1000));
          setSlider(elBeta, state.beta);
          leftChanged();
          return true;
        },
        describe: function () { return T('撥弦位置 β = ', 'Pluck position β = ') + num(state.beta, 3); }
      }, {
        name: function () { return state.hand === 'touch' ? T('輕觸點', 'Touch point') : I().frets ? T('按的品格', 'Fret') : T('手指', 'Finger'); },
        move: function (dx, dy, big) {
          if (!dx) return false;
          if (state.hand === 'touch') {
            state.touch = Math.max(0.05, Math.min(0.95, Math.round((state.touch + dx * (big ? 0.01 : 0.001)) * 1000) / 1000));
            state.tf = null; setSlider(elTouch, state.touch); syncTouchBtns(); leftChanged();
          } else if (I().frets) setLeft(Math.max(0, Math.min(19, state.fret + dx * (big ? 5 : 1))));
          else setLeft(Math.max(0, Math.min(19, Math.round((state.finger + dx * (big ? 1 : 0.1)) * 100) / 100)));
          return true;
        },
        describe: function () { return handText(info(false)); }
      }, {
        name: function () { return T('弦', 'String'); },
        move: function (dx, dy) {
          const d = dy ? -dy : dx;
          if (!d) return false;
          setString(cur().si + d);
          return true;
        },
        describe: function () { return stringName(state.inst, cur().si); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 分享目前的設定（各樂器每條弦的張力、線密度、材料……） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const o = { v: 1, inst: state.inst, hand: state.hand, fret: state.fret, finger: state.finger, touch: state.touch, tf: state.tf, rule: state.rule, show18: state.show18, beta: state.beta, insts: {} };
      S.INST_IDS.forEach(function (id) {
        const c = state.insts[id];
        o.insts[id] = { L: c.L, si: c.si, s: c.strings.map(function (st) { return [st.T, st.muG, st.mode === 'mat' ? 1 : 0, st.mat === 'steel' ? 1 : 0, st.d]; }) };
      });
      return o;
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const clamp = function (v, lo, hi, dflt) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt; };
      stopAll();
      if (o.insts) S.INST_IDS.forEach(function (id) {
        const src = o.insts[id]; if (!src) return;
        const c = state.insts[id], n = S.INSTRUMENTS[id].strings.length;
        c.L = clamp(src.L, S.RANGES.L[0], S.RANGES.L[1], c.L);
        c.si = Math.round(clamp(src.si, 0, n - 1, c.si));
        if (Array.isArray(src.s)) src.s.slice(0, n).forEach(function (a, i) {
          if (!Array.isArray(a)) return;
          const st = c.strings[i];
          st.T = clamp(a[0], S.RANGES.T[0], S.RANGES.T[1], st.T);
          st.muG = clamp(a[1], MU_MIN, MU_MAX, st.muG);
          st.mode = a[2] ? 'mat' : 'mu';
          st.mat = a[3] ? 'steel' : 'nylon';
          const R = S.MATERIALS[st.mat].d;
          st.d = clamp(a[4], R[0], R[1], Math.max(R[0], Math.min(R[1], st.d)));
        });
      });
      if (S.INSTRUMENTS[o.inst]) state.inst = o.inst;
      state.hand = o.hand === 'touch' ? 'touch' : 'press';
      state.fret = Math.round(clamp(o.fret, 0, 19, 0));
      state.finger = clamp(o.finger, 0, 19, 0);
      state.touch = clamp(o.touch, 0.05, 0.95, S.fretXi(12));
      state.tf = [12, 7, 5, 4].indexOf(o.tf) >= 0 ? o.tf : null;
      if (state.tf) state.touch = S.fretXi(state.tf);
      state.rule = o.rule === 'r18' ? 'r18' : 'et';
      state.show18 = !!o.show18;
      state.beta = clamp(o.beta, 0.05, 0.5, 0.2);
      syncSliders(); syncUI();
      neckCache.key = '';
      resize();
    }
  });

  // =====================================================================
  // 3D 檢視（three.js 與 string-instrument-3d.js 都在第一次切到 3D 時才載入）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try {
      const cvx = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (cvx.getContext('webgl2') || cvx.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.StringInstrument3D) { resolve(); return; }
      const s = document.createElement('script');
      const v = (document.querySelector('script[src*="string-instrument.js"]') || {}).src || '';
      const q = /\?v=[^&#]+/.exec(v);
      s.src = src + (q ? q[0] : '');
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('3D script failed')); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return loadScript('js/string-instrument-3d.js').then(function () {
      return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]);
    }).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  /** 3D 場景需要的狀態（全部由同一個核心算出） */
  function snapshot3() {
    const now = performance.now();
    const inf = info(false);
    const lm = liveModes(now);
    const c = cur();
    return {
      inst: state.inst, L: c.L, si: c.si, rule: state.rule, show18: state.show18, hand: state.hand,
      strings: c.strings.map(function (st, i) { return { d: stringWidthMM(i), kind: stringKind(i) }; }),
      inf: lm ? lm.inf : inf, live: lm, beta: lm ? lm.inf.beta : state.beta,
      fret: inf.fret, Leff: (lm ? lm.inf : inf).Leff, touch: (lm ? lm.inf : inf).touch
    };
  }
  /** 弦的外觀：'wound'（纏繞）、'steel'、'nylon' */
  function stringKind(i) {
    const st = cur().strings[i], s = I().strings[i];
    return st.mode === 'mat' ? st.mat : (s.kind === 'wound' ? 'wound' : s.core);
  }
  function stringWidthMM(i) {
    const st = cur().strings[i], s = I().strings[i];
    if (st.mode === 'mat') return st.d;
    if (s.kind === 'wound') return s.d;
    return S.diameterFor(st.muG / 1000, S.MATERIALS[s.core].rho);
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
        try {
          stage.classList.add('is3d');
          view3 = window.StringInstrument3D.create(lib, {
            host: host3, T: T, S: S,
            snapshot: snapshot3,
            reducedMotion: function () { return reducedMotion; },
            onLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
          });
        } catch (err) {
          if (window.console) console.warn('3D view unavailable:', err);
          fail3D();
          return;
        }
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestDraw();
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
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // 給測試用的介面（不影響畫面）
  window.__si = {
    state: state, info: info, pluck: pluck, startBow: startBow, stopAll: stopAll, setInst: setInst, setString: setString,
    view: function () { return view3; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncSliders();
  syncUI();
  renderLog();
  updateSoundButton();
  updateStopBtn();
  function themeChanged() {
    readColors();
    reducedMotion = D.reducedMotion();
    neckCache.key = '';
    eqKey = '';
    syncUI(); renderLog(); updateSoundButton();
    if (state.play && state.play.kind === 'bow') { $('bow').textContent = T('停止拉弓', 'Stop bowing'); }
    else $('bow').textContent = T('拉弓（持續音）', 'Bow (sustained)');
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); if (ev.detail && ev.detail.name === 'fs') setTimeout(fitEq, 50); });
  if (window.ResizeObserver) {
    let lastW = 0, lastW2 = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== lastW2) { lastW = cv.clientWidth; lastW2 = cv2.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopAll(false); });
  resize();
})();
