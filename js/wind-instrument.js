/* wind-instrument.js — 「管樂器：直笛、長笛與單簧管」的畫面與互動
 * 物理計算在 wind-instrument-core.js（WindCore）；音名與音分在 music-theory.js；聲音用 music-audio.js（MusicAudio）；
 * 共用繪圖工具 LabDraw 在 drawkit.js；3D 檢視在 wind-instrument-3d.js（第一次切到 3D 才載入）。
 *
 * 畫布由上而下：調音表（聽到的音與偏差音分）、管子的剖面（壓力駐波的色帶＋空氣小點；長度依比例尺、內徑放大示意）、
 * 沿著管子的壓力 p 與空氣位移 ξ（節點、腹點、有效開口）；第二張畫布是頻譜（共振位置與發聲的泛音）。 */
(function () {
  'use strict';
  const W = window.WindCore;
  const MT = window.MusicTheory;
  const D = window.LabDraw;
  const MA = window.MusicAudio;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const R = W.RANGES;
  const REC = W.REC;
  const VIS_F = 0.8;          // 慢動作：畫面上每秒振動 0.8 次
  const BREATH = 12;          // 一口氣最長 12 秒
  const HEAD = 0.085;         // 直笛頭管的接口（離唇口 8.5 cm；頭管拉出時接口露出一段）
  const REC_MAX = REC.L + R.pull[1] / 1000;
  const PRESETS = {
    flute: { type: 'open', L: 0.645, d: 19, corr: 'unflanged' },      // ≈ C4（長笛的近似）
    clarinet: { type: 'closed', L: 0.58, d: 15, corr: 'unflanged' },  // ≈ D3（降 B 調單簧管的最低音）
    pan: { type: 'closed', L: 0.1915, d: 12, corr: 'unflanged' }      // A4（排笛的一根管）
  };

  // =====================================================================
  // 狀態
  // =====================================================================
  const state = {
    inst: 'tube', type: W.DEFAULT.type, L: W.DEFAULT.L, d: W.DEFAULT.d, T: W.DEFAULT.T, m: W.DEFAULT.m, corr: W.DEFAULT.corr,
    holes: W.FINGERINGS.C5.slice(), pull: 0,
    blow: null,          // 吹氣中：{ t0, breath }
    breath: 0,           // 第幾口氣
    hist: [],            // 最近吹出的音（新的在前；任務比較用）
    log: [], logN: 0,
    drag: null
  };
  let applying = false;  // 程式正在改滑桿（不要當成使用者的操作）
  let voice = null;      // 吹氣的持續音
  let breathTimer = 0;

  function cfg() {
    return { inst: state.inst, type: state.type, L: state.L, d: state.d, T: state.T, m: state.m, corr: state.corr, holes: state.holes, pull: state.pull };
  }
  function info() { return W.analyze(cfg()); }

  // =====================================================================
  // 色彩與文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'bg',
      'wi-pos', 'wi-neg', 'wi-air', 'wi-p', 'wi-xi', 'wi-good', 'wi-warn', 'wi-spec', 'wi-glass', 'wi-metal',
      'wi-wood', 'wi-wood2', 'wi-reed', 'wi-finger', 'wi-end']
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
  function cents(r) { return 1200 * Math.log(r) / Math.LN2; }
  function modeText(inf) {
    return T('第 ' + inf.m + ' 模式', 'mode ' + inf.m) + (inf.type === 'closed' && inf.n !== inf.m ? T('（' + inf.n + ' 倍）', ' (×' + inf.n + ')') : '');
  }
  function holeName(k) { return k === 0 ? T('拇指孔', 'thumb hole') : T('第 ' + k + ' 孔', 'hole ' + k); }
  /** 指法的小圓點（HTML）：拇指孔在前，中間空一格 */
  function fingDots(holes) {
    let h = '<span class="fgd" aria-hidden="true">';
    holes.forEach(function (s, k) { h += (k === 1 ? '<i class="sep"></i>' : '') + '<i class="' + (s === 0 ? 'c' : s === 0.5 ? 'h' : 'o') + '"></i>'; });
    return h + '</span>';
  }
  function fingWords(holes) {
    return holes.map(function (s, k) { return holeName(k) + (s === 0 ? T('按住', ' covered') : s === 0.5 ? T('半開', ' half-open') : T('打開', ' open')); }).join(T('、', ', '));
  }

  // =====================================================================
  // 畫布與版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let dpr = 1, cw = 300, ch = 380, Lo = null, cw2 = 300, ch2 = 170;
  function layout() {
    const narrow = cw < 560;
    const pad = narrow ? 8 : 14;
    const tunerH = narrow ? 46 : 50;
    const tubeT = pad + tunerH + (narrow ? 8 : 12);
    const labH = narrow ? 20 : 24;
    const boreMax = narrow ? 32 : 44;
    const wallMax = narrow ? 8 : 10;
    const tubeY = tubeT + labH + wallMax + boreMax / 2;
    const dimT = tubeY + boreMax / 2 + wallMax + 4;       // 尺寸線（L、δ、拇指孔）
    const scaleT = dimT + (narrow ? 18 : 20);              // 比例尺與「放大示意」
    const graphT = scaleT + (narrow ? 22 : 24);
    const graphH = narrow ? 128 : 156;
    const x0 = pad + (narrow ? 46 : 70);
    const x1 = cw - pad - (narrow ? 22 : 40);
    return { narrow: narrow, pad: pad, tunerT: pad, tunerH: tunerH, tubeT: tubeT, labH: labH, boreMax: boreMax, wallMax: wallMax, tubeY: tubeY,
      dimT: dimT, scaleT: scaleT, graphT: graphT, graphH: graphH, gy: graphT + graphH / 2, ay: graphH / 2 - 30, H: graphT + graphH + pad, x0: x0, x1: x1 };
  }
  /** 長度比例：管子模式依管長微調（短管也看得清楚），直笛固定比例 */
  let K = 1000;
  function scaleFor(inf) {
    const w = Lo.x1 - Lo.x0;
    if (inf.inst === 'recorder') return w / REC_MAX;
    return w * (0.42 + 0.58 * (inf.L - 0.1) / 1.4) / inf.L;
  }
  function X(s) { return Lo.x0 + s * K; }
  /** 拖曳管子右端：游標的 x → 管長（和 scaleFor 互逆） */
  function lengthAt(px) {
    const w = Lo.x1 - Lo.x0;
    const L = 0.1 + ((px - Lo.x0) / w - 0.42) * 1.4 / 0.58;
    return Math.max(R.L[0], Math.min(R.L[1], Math.round(L * 1000) / 1000));
  }
  function boreH(inf) {
    if (inf.inst === 'recorder') return Lo.boreMax * 0.7;
    return Lo.boreMax * (0.62 + 0.38 * (inf.d - R.d[0]) / (R.d[1] - R.d[0]));
  }
  function wallPx(inf) { return inf.inst === 'recorder' ? Lo.wallMax : Math.max(3, Lo.wallMax * 0.5); }
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
    ch2 = cw2 < 560 ? 160 : 180;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
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
    const leftW = narrow ? 78 : 104, rightW = narrow ? 96 : 124;
    const cc = inf.cents;
    const ok = Math.abs(cc) <= 3;
    const col = ok ? C['wi-good'] : Math.abs(cc) <= 10 ? C['wi-warn'] : C['wi-pos'];
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = C.text;
    c.font = fnt(narrow ? 19 : 22, 700);
    c.fillText(inf.name, x + 10, y + h / 2 - (narrow ? 6 : 7));
    c.font = fnt(narrow ? 11 : 12, 600);
    c.fillStyle = col;
    c.fillText(signed(cc, 1) + T(' 音分', ' ¢'), x + 10, y + h / 2 + (narrow ? 11 : 13));
    c.textAlign = 'right';
    c.fillStyle = C.text;
    c.font = fnt(narrow ? 13 : 15, 700);
    c.fillText(hz(inf.f), x + w - 10, y + h / 2 - (narrow ? 6 : 7));
    c.font = fnt(narrow ? 10.5 : 11.5);
    c.fillStyle = C.muted;
    c.fillText(modeText(inf), x + w - 10, y + h / 2 + (narrow ? 11 : 13));
    const gx0 = x + leftW, gx1 = x + w - rightW, gy = y + h * 0.58;
    if (gx1 - gx0 > 60) {
      const G = function (v) { return gx0 + (Math.max(-50, Math.min(50, v)) + 50) / 100 * (gx1 - gx0); };
      c.fillStyle = alpha(C['wi-good'], D.dark ? 0.22 : 0.16);
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
      const px = G(cc);
      c.save();
      c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.25); c.shadowBlur = 4; c.shadowOffsetY = 1;
      c.fillStyle = col;
      c.beginPath(); c.moveTo(px, gy + 10); c.lineTo(px - 6, gy - 10); c.lineTo(px + 6, gy - 10); c.closePath(); c.fill();
      c.restore();
    }
    c.restore();
  }

  // =====================================================================
  // 繪圖：管子的剖面
  // =====================================================================
  /** 壓力 → 色帶的顏色（壓縮紅、稀疏藍；亮度隨大小單調） */
  function pCol(v, a) {
    const m = Math.min(1, Math.abs(v));
    return alpha(v >= 0 ? C['wi-pos'] : C['wi-neg'], (a == null ? 1 : a) * (0.06 + 0.6 * m));
  }
  /** 沿著有效長度建立壓力色帶的漸層 */
  function bandGradient(c, inf, s) {
    const xa = X(inf.sStart), xb = X(inf.sEnd);
    const g = c.createLinearGradient(xa, 0, Math.max(xa + 1, xb), 0);
    for (let i = 0; i < 40; i++) {
      const u = i / 39;
      g.addColorStop(u, pCol(W.shapeAt(inf.type, inf.n, u).p * s));
    }
    return g;
  }
  function uOf(inf, s) { return (s - inf.sStart) / inf.Lp; }
  /** 管內的空氣小點：每一點照位移 ξ(u)·sinφ 左右移動（擺幅放大示意） */
  function drawDots(c, inf, s, yT, bh, sMax) {
    const rows = Lo.narrow ? 3 : 4;
    const sp = Lo.narrow ? 6.5 : 7.5;
    const lamPx = inf.lambda * K, LpPx = inf.Lp * K;
    const A = Math.min(0.4 * lamPx / (2 * Math.PI), 0.12 * LpPx);
    const xa = X(0) + sp * 0.5, xb = X(sMax);
    const r = Lo.narrow ? 1.7 : 2;
    c.save();
    c.beginPath(); c.rect(X(0), yT, xb - X(0), bh); c.clip();
    // 有振動的小點
    c.fillStyle = alpha(C['wi-air'], D.dark ? 0.85 : 0.75);
    c.beginPath();
    const still = [];
    for (let row = 0; row < rows; row++) {
      const y = yT + (row + 0.5) * bh / rows;
      const off = row % 2 ? sp * 0.5 : 0;
      for (let px = xa + off; px <= xb; px += sp) {
        const s0 = (px - X(0)) / K;
        const u = uOf(inf, s0);
        if (u > 1.0001) { still.push(px, y); continue; }
        const dx = A * W.shapeAt(inf.type, inf.n, Math.max(0, u)).xi * s;
        c.moveTo(px + dx + r, y); c.arc(px + dx, y, r, 0, Math.PI * 2);
      }
    }
    c.fill();
    // 有效開口以下（直笛打開的孔下面）幾乎不振動：灰色、不動
    if (still.length) {
      c.fillStyle = alpha(C.muted, 0.45);
      c.beginPath();
      for (let i = 0; i < still.length; i += 2) { c.moveTo(still[i] + r, still[i + 1]); c.arc(still[i], still[i + 1], r, 0, Math.PI * 2); }
      c.fill();
    }
    c.restore();
  }
  /** 管壁：玻璃（管子模式）或木頭（直笛），上亮下暗，外緣一條高光 */
  function wallRect(c, x, y, w, h, color, top) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, D.shade(color, top ? 0.28 : 0.05));
    g.addColorStop(1, D.shade(color, top ? -0.05 : -0.28));
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
  }
  function drawTube(c, inf, s) {
    const bh = boreH(inf), wl = wallPx(inf);
    const yT = Lo.tubeY - bh / 2, yB = Lo.tubeY + bh / 2;
    const x0 = X(0), x1 = X(inf.L);
    const glass = C['wi-glass'];
    c.save();
    // 管口外那一小段還在振動的空氣（淡色）
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = bandGradient(c, inf, s);
    if (inf.sEnd > inf.L + 1e-6) { D.roundRect(c, x1, yT + 2, X(inf.sEnd) - x1, bh - 4, 4); c.fill(); }
    if (inf.type === 'open' && inf.sStart < -1e-6) { D.roundRect(c, X(inf.sStart), yT + 2, x0 - X(inf.sStart), bh - 4, 4); c.fill(); }
    c.restore();
    // 管內：空氣底色＋壓力色帶
    c.fillStyle = alpha(C.text, D.dark ? 0.05 : 0.03);
    c.fillRect(x0, yT, x1 - x0, bh);
    c.save();
    c.beginPath(); c.rect(x0, yT, Math.min(x1, X(inf.sEnd)) - x0, bh); c.clip();
    c.fillStyle = bandGradient(c, inf, s);
    c.fillRect(x0, yT, x1 - x0, bh);
    c.restore();
    // 管內的立體感：上緣亮、下緣暗
    const gi = c.createLinearGradient(0, yT, 0, yB);
    gi.addColorStop(0, alpha('#ffffff', D.dark ? 0.06 : 0.22)); gi.addColorStop(0.35, 'rgba(255,255,255,0)');
    gi.addColorStop(0.75, 'rgba(0,0,0,0)'); gi.addColorStop(1, alpha('#000000', D.dark ? 0.25 : 0.1));
    c.fillStyle = gi; c.fillRect(x0, yT, x1 - x0, bh);
    drawDots(c, inf, s, yT, bh, inf.L);
    if (inf.inst === 'recorder') drawRecorderBody(c, inf, yT, yB, wl);
    else {
      // 玻璃管壁
      c.save();
      c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.18); c.shadowBlur = 6; c.shadowOffsetY = 2;
      wallRect(c, x0, yT - wl, x1 - x0, wl, glass, true);
      wallRect(c, x0, yB, x1 - x0, wl, glass, false);
      c.restore();
      c.strokeStyle = alpha('#ffffff', D.dark ? 0.35 : 0.75); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x0 + 2, yT - wl + 0.5); c.lineTo(x1 - 2, yT - wl + 0.5); c.stroke();
      c.strokeStyle = alpha(D.shade(glass, -0.4), 0.7);
      c.beginPath(); c.moveTo(x0, yT - 0.5); c.lineTo(x1, yT - 0.5); c.moveTo(x0, yB + 0.5); c.lineTo(x1, yB + 0.5); c.stroke();
      // 管口的邊緣
      [x0, x1].forEach(function (xe) { D.block(c, xe - 1.5, yT - wl - 1, 3, wl + 1, D.shade(glass, -0.1), { r: 1, shadow: false }); D.block(c, xe - 1.5, yB, 3, wl + 1, D.shade(glass, -0.1), { r: 1, shadow: false }); });
      if (inf.type === 'closed') drawMouthpiece(c, x0, yT, yB, wl);
      else {
        // 開管：對著管口的邊緣吹氣
        const ax = x0 - (Lo.narrow ? 26 : 36);
        D.arrow(c, ax, yT - wl - (Lo.narrow ? 12 : 16), x0 - 3, yT + 2, alpha(C.muted, 0.9), Lo.narrow ? 1.8 : 2.2);
      }
    }
    // 拖曳把手（管子模式：右端可以拖）
    if (inf.inst === 'tube') {
      const hot = state.drag === 'end' || hover === 'end';
      c.fillStyle = alpha(C.accent, hot ? 0.9 : 0.55);
      D.roundRect(c, x1 - 2.5, yT - wl - 7, 5, bh + 2 * wl + 14, 2.5); c.fill();
      if (hot) { c.strokeStyle = alpha(C.accent, 0.35); c.lineWidth = 6; c.stroke(); }
    }
    drawEndLabels(c, inf, yT - wl);
    c.restore();
  }
  /** 單簧管的吹嘴：黑色錐形吹嘴、金屬束圈、簧片（閉口端） */
  function drawMouthpiece(c, x0, yT, yB, wl) {
    const mw = Lo.narrow ? 34 : 54;
    const top = yT - wl, bot = yB + wl;
    c.save();
    c.beginPath();
    c.moveTo(x0, top - 1); c.lineTo(x0 - mw * 0.55, top - 1);
    c.quadraticCurveTo(x0 - mw * 0.9, top + 2, x0 - mw, Lo.tubeY + (bot - top) * 0.16);
    c.lineTo(x0 - mw, bot - 4); c.lineTo(x0, bot + 1); c.closePath();
    const g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#4a4f57'); g.addColorStop(0.45, '#23262b'); g.addColorStop(1, '#101215');
    c.fillStyle = g;
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.6)' : alpha(C.text, 0.25); c.shadowBlur = 6; c.shadowOffsetY = 2;
    c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0 - 2, top + 0.5); c.lineTo(x0 - mw * 0.55, top + 0.5); c.stroke();
    // 簧片（下方）
    c.beginPath();
    c.moveTo(x0 - mw - 2, bot - 3); c.lineTo(x0 - 2, bot + 1); c.lineTo(x0 - 2, bot + 4); c.lineTo(x0 - mw - 2, bot + 0.5); c.closePath();
    const gr = c.createLinearGradient(0, bot - 3, 0, bot + 4);
    gr.addColorStop(0, D.shade(C['wi-reed'], 0.3)); gr.addColorStop(1, D.shade(C['wi-reed'], -0.2));
    c.fillStyle = gr; c.fill();
    // 束圈
    D.block(c, x0 - mw * 0.42, top - 2, Lo.narrow ? 5 : 7, bot - top + 7, C['wi-metal'], { r: 2, shadow: false });
    // 閉口：吹嘴與管子之間的封口
    D.block(c, x0 - 2.5, yT, 3, yB - yT, '#2b2e33', { r: 1, shadow: false });
    c.restore();
  }
  /** 直笛的木頭管身：鳥嘴、唇口的窗口、頭管接口、按孔與手指 */
  function recHoleX(k) { return X(state.pull / 1000 + REC.xs[k]); }
  function recHoleW(k) { return Math.max(5, REC.holeD[k] / 1000 * K); }
  function drawRecorderBody(c, inf, yT, yB, wl) {
    const x0 = X(0), x1 = X(inf.L);
    const wood = C['wi-wood'], wood2 = C['wi-wood2'];
    const beak = Math.min(Lo.x0 - Lo.pad - 6, 0.05 * K);
    const win = Math.max(6, 0.0065 * K);
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : alpha(C.text, 0.2); c.shadowBlur = 7; c.shadowOffsetY = 2;
    // 上管壁（唇口的窗口那一段挖空）與下管壁
    wallRect(c, x0, yT - wl, x1 - x0, wl, wood, true);
    wallRect(c, x0 - beak, yB, x1 - x0 + beak, wl, wood, false);
    c.restore();
    // 鳥嘴（頭部）：吹口在最左邊，風道沿著上方通到唇口
    c.save();
    c.beginPath();
    c.moveTo(x0 - win, yT - wl); c.lineTo(x0 - beak + 8, yT - wl);
    c.quadraticCurveTo(x0 - beak, yT - wl + 2, x0 - beak, yT + 6);
    c.lineTo(x0 - beak, yB); c.lineTo(x0 - win, yB); c.closePath();
    const gb = c.createLinearGradient(0, yT - wl, 0, yB);
    gb.addColorStop(0, D.shade(wood, 0.25)); gb.addColorStop(1, D.shade(wood, -0.15));
    c.fillStyle = gb;
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.18); c.shadowBlur = 6; c.shadowOffsetY = 2;
    c.fill();
    c.shadowColor = 'transparent';
    // 風道
    c.fillStyle = alpha('#1a0f05', 0.75);
    c.fillRect(x0 - beak + 3, yT - wl * 0.15, beak - win + 1, Math.max(2, wl * 0.45));
    c.restore();
    // 唇口：窗口右邊的尖邊
    c.fillStyle = D.shade(wood, 0.1);
    c.beginPath(); c.moveTo(x0, yT - wl); c.lineTo(x0 + 1.5, yT - wl); c.lineTo(x0 + 1.5, yT); c.lineTo(x0 - 3, yT); c.closePath(); c.fill();
    // 頭管接口：拉出時露出一段（顏色較淺的接榫）
    const xj = X(HEAD), xj2 = X(HEAD + state.pull / 1000);
    if (xj2 - xj > 0.5) {
      [[yT - wl, wl], [yB, wl]].forEach(function (r) {
        const g = c.createLinearGradient(0, r[0], 0, r[0] + r[1]);
        g.addColorStop(0, D.shade(C['wi-wood2'], 0.5)); g.addColorStop(1, D.shade(C['wi-wood2'], 0.15));
        c.fillStyle = g; c.fillRect(xj, r[0] + 1.5, xj2 - xj, r[1] - 3);
      });
    }
    c.strokeStyle = alpha(wood2, 0.9); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(xj + 0.5, yT - wl); c.lineTo(xj + 0.5, yT); c.moveTo(xj + 0.5, yB); c.lineTo(xj + 0.5, yB + wl);
    c.moveTo(xj2 + 0.5, yT - wl); c.lineTo(xj2 + 0.5, yT); c.moveTo(xj2 + 0.5, yB); c.lineTo(xj2 + 0.5, yB + wl); c.stroke();
    // 木紋高光
    c.strokeStyle = alpha('#ffffff', D.dark ? 0.15 : 0.4); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0 + 2, yT - wl + 0.5); c.lineTo(x1 - 2, yT - wl + 0.5); c.stroke();
    // 按孔：上管壁 1–7 孔，下管壁拇指孔；按住的孔畫手指
    for (let k = 0; k < 8; k++) {
      const hx = recHoleX(k), hw = recHoleW(k);
      const top = k > 0;
      const y0 = top ? yT - wl : yB;
      // 孔＝管壁上的缺口
      c.fillStyle = C['canvas-bg']; c.fillRect(hx - hw / 2, y0, hw, wl);
      c.fillStyle = alpha(C.text, D.dark ? 0.06 : 0.04); c.fillRect(hx - hw / 2, y0, hw, wl);
      c.strokeStyle = alpha(wood2, 0.8); c.lineWidth = 1;
      c.beginPath(); c.moveTo(hx - hw / 2 + 0.5, y0); c.lineTo(hx - hw / 2 + 0.5, y0 + wl); c.moveTo(hx + hw / 2 - 0.5, y0); c.lineTo(hx + hw / 2 - 0.5, y0 + wl); c.stroke();
      const st = inf.holes[k];
      if (st !== 1) fingertip(c, hx, top ? yT - wl : yB + wl, top, Math.max(hw * 1.9, Lo.narrow ? 10 : 14), st === 0.5);
      if (kb && kb.focused() && state.inst === 'recorder' && kb.index() === k) focusRing(c, hx - 11, (top ? yT - wl - 12 : yB) - 2, 22, wl + 16);
    }
  }
  /** 手指：圓潤的指腹，半開時只蓋一半 */
  function fingertip(c, x, yEdge, top, w, half) {
    const h = Lo.narrow ? 7 : 9;
    const yc = top ? yEdge - h * 0.45 : yEdge + h * 0.45;
    c.save();
    if (half) { c.beginPath(); c.rect(x - w, yc - h * 2, w, h * 4); c.clip(); }
    const g = c.createRadialGradient(x - w * 0.15, yc - h * 0.3, 1, x, yc, w * 0.6);
    g.addColorStop(0, D.shade(C['wi-finger'], 0.35)); g.addColorStop(0.7, C['wi-finger']); g.addColorStop(1, D.shade(C['wi-finger'], -0.25));
    c.fillStyle = g;
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.25); c.shadowBlur = 4; c.shadowOffsetY = top ? 1 : -1;
    c.beginPath(); c.ellipse(x, yc, w / 2, h / 2 + 1, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function focusRing(c, x, y, w, h) {
    c.save();
    c.setLineDash([4, 3]); c.strokeStyle = C.accent; c.lineWidth = 1.6;
    D.roundRect(c, x, y, w, h, 6); c.stroke();
    c.restore();
  }
  /** 管子兩端（或唇口、孔號）的標籤 */
  function drawEndLabels(c, inf, yTop) {
    const yb = Lo.tubeT + Lo.labH - 3;
    const f = fnt(Lo.narrow ? 10.5 : 11.5, 600);
    if (inf.inst === 'recorder') {
      D.pill(c, T('唇口', 'Labium'), X(0) - 2, yb, C.muted, 'center', f);
      c.font = fnt(Lo.narrow ? 10 : 11, 600); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      for (let k = 1; k < 8; k++) { c.fillStyle = inf.holes[k] === 1 ? C.accent : C.muted; c.fillText(String(k), recHoleX(k), yTop - (Lo.narrow ? 10 : 12)); }
      D.pill(c, T('管尾', 'Foot'), X(inf.L), yb, C.muted, 'right', f);
      return;
    }
    const lx = inf.type === 'closed' ? Math.max(Lo.pad + 2, X(0) - (Lo.narrow ? 34 : 54)) : Math.max(Lo.pad + 2, X(0) - 26);
    D.pill(c, inf.type === 'closed' ? T('閉口端', 'Closed end') : T('開口端', 'Open end'), lx, yb, inf.type === 'closed' ? C['wi-pos'] : C.muted, 'left', f);
    D.pill(c, T('開口端', 'Open end'), Math.min(cw - Lo.pad - 2, X(inf.L) + 10), yb, C.muted, 'right', f);
  }
  /** 管子下方：管長 L、管口修正 δ（或直笛的拇指孔）、比例尺與「放大示意」 */
  function drawDims(c, inf) {
    const y = Lo.dimT + 6;
    const narrow = Lo.narrow;
    c.save();
    c.lineCap = 'round';
    if (inf.inst === 'tube') {
      const xa = X(0), xb = X(inf.L);
      c.strokeStyle = alpha(C.muted, 0.8); c.lineWidth = 1;
      c.beginPath(); c.moveTo(xa, y); c.lineTo(xb, y); c.moveTo(xa, y - 4); c.lineTo(xa, y + 4); c.moveTo(xb, y - 4); c.lineTo(xb, y + 4); c.stroke();
      D.haloText(c, 'L = ' + num(inf.L, 3) + ' m', (xa + xb) / 2, y + 1, C.muted, 'center', 'middle', fnt(narrow ? 10.5 : 11.5, 600));
      // δ：有效開口超出管口的那一段
      const ends = [[inf.L, inf.sEnd]];
      if (inf.type === 'open') ends.push([inf.sStart, 0]);
      ends.forEach(function (e) {
        const a = X(e[0]), b = X(e[1]);
        if (b - a < 1.5) return;
        c.strokeStyle = C['wi-end']; c.lineWidth = 2;
        c.beginPath(); c.moveTo(a, y); c.lineTo(b, y); c.stroke();
        c.fillStyle = C['wi-end']; c.font = fnt(narrow ? 11 : 12, 700); c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillText('δ', (a + b) / 2, y + 3);
      });
    } else {
      c.font = fnt(narrow ? 10 : 11, 600); c.fillStyle = inf.holes[0] === 1 ? C.accent : C.muted;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(T('拇指孔（背面）', 'thumb hole (back)'), recHoleX(0) + (narrow ? 14 : 20), y + 2);
    }
    // 比例尺
    const ys = Lo.scaleT + 8;
    const opts = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
    let len = opts[0];
    for (let i = 0; i < opts.length; i++) if (opts[i] * K <= (narrow ? 90 : 130)) len = opts[i];
    const sx = Lo.x0, bw = len * K;
    c.fillStyle = alpha(C.text, 0.75);
    c.fillRect(sx, ys - 1.5, bw, 3);
    c.fillRect(sx, ys - 4, 1.5, 8); c.fillRect(sx + bw - 1.5, ys - 4, 1.5, 8);
    c.font = fnt(narrow ? 10.5 : 11.5, 600); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = C.muted;
    const sTxt = num(len * 100, 0) + ' cm';
    c.fillText(sTxt, sx + bw + 6, ys);
    // 右邊的「放大示意」：放不下就換短的說法（字體特大、英文、手機）
    const room = cw - Lo.pad - 2 - (sx + bw + 6 + c.measureText(sTxt).width + 14);
    const cands = inf.inst === 'recorder'
      ? [T('直笛示意：內徑、位移放大', 'Recorder (illustration): bore and motion enlarged'), T('內徑、位移放大', 'Bore, motion enlarged'), T('放大示意', 'Enlarged')]
      : [T('內徑、位移放大示意', 'Bore and motion enlarged'), T('放大示意', 'Enlarged')];
    const pick = cands.find(function (t) { return c.measureText(t).width <= room; });
    c.textAlign = 'right';
    if (pick) c.fillText(pick, cw - Lo.pad - 2, ys);
    c.restore();
  }

  // =====================================================================
  // 繪圖：沿著管子的壓力與位移
  // =====================================================================
  function drawGraph(c, inf, s, moving) {
    const gy = Lo.gy, ay = Lo.ay, top = Lo.graphT, bot = Lo.graphT + Lo.graphH;
    const xa = X(inf.sStart), xb = X(inf.sEnd);
    const narrow = Lo.narrow;
    c.save();
    // 底框
    D.roundRect(c, Lo.pad, top, cw - 2 * Lo.pad, Lo.graphH, 10);
    c.fillStyle = alpha(C.text, D.dark ? 0.035 : 0.02); c.fill();
    c.strokeStyle = alpha(C.border, 0.7); c.lineWidth = 1; c.stroke();
    // 軸
    c.strokeStyle = alpha(C.text, 0.3); c.lineWidth = 1;
    c.beginPath(); c.moveTo(Lo.pad + 8, Math.round(gy) + 0.5); c.lineTo(cw - Lo.pad - 8, Math.round(gy) + 0.5); c.stroke();
    // 管子實際的兩端（灰色點線）
    c.save();
    c.setLineDash([2, 3]); c.strokeStyle = alpha(C.muted, 0.6); c.lineWidth = 1;
    c.beginPath();
    [0, inf.L].forEach(function (sx) { const x = Math.round(X(sx)) + 0.5; c.moveTo(x, Lo.dimT - 2); c.lineTo(x, bot - 4); });
    c.stroke();
    c.restore();
    // 包絡（振幅的範圍）
    const N = 120;
    c.fillStyle = alpha(C['wi-p'], D.dark ? 0.12 : 0.08);
    c.beginPath();
    for (let i = 0; i <= N; i++) { const u = i / N, x = xa + (xb - xa) * u, v = Math.abs(W.shapeAt(inf.type, inf.n, u).p); if (i) c.lineTo(x, gy - ay * v); else c.moveTo(x, gy - ay * v); }
    for (let i = N; i >= 0; i--) { const u = i / N, x = xa + (xb - xa) * u, v = Math.abs(W.shapeAt(inf.type, inf.n, u).p); c.lineTo(x, gy + ay * v); }
    c.closePath(); c.fill();
    c.save();
    c.setLineDash([4, 4]); c.strokeStyle = alpha(C['wi-xi'], 0.4); c.lineWidth = 1;
    [1, -1].forEach(function (sg) {
      c.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N, x = xa + (xb - xa) * u, v = Math.abs(W.shapeAt(inf.type, inf.n, u).xi); if (i) c.lineTo(x, gy - sg * ay * v); else c.moveTo(x, gy - sg * ay * v); }
      c.stroke();
    });
    c.restore();
    // 有效開口以下：幾乎不振動（直笛）
    if (inf.inst === 'recorder' && X(inf.L) - xb > 4) {
      c.save(); c.setLineDash([2, 4]); c.strokeStyle = alpha(C.muted, 0.8); c.lineWidth = 2;
      c.beginPath(); c.moveTo(xb, gy); c.lineTo(X(inf.L), gy); c.stroke(); c.restore();
      if (X(inf.L) - xb > (narrow ? 70 : 96)) D.haloText(c, T('幾乎不振動', 'almost still'), (xb + X(inf.L)) / 2, gy - 10, C.muted, 'center', 'alphabetic', fnt(narrow ? 10 : 11));
    }
    // 瞬間的位移 ξ（虛線）與壓力 p（實線）
    c.save();
    c.setLineDash([6, 4]); c.strokeStyle = C['wi-xi']; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= N; i++) { const u = i / N, x = xa + (xb - xa) * u, v = W.shapeAt(inf.type, inf.n, u).xi * s; if (i) c.lineTo(x, gy - ay * v); else c.moveTo(x, gy - ay * v); }
    c.stroke();
    c.restore();
    D.tube(c, function (g) {
      for (let i = 0; i <= N; i++) { const u = i / N, x = xa + (xb - xa) * u, v = W.shapeAt(inf.type, inf.n, u).p * s; if (i) g.lineTo(x, gy - ay * v); else g.moveTo(x, gy - ay * v); }
    }, C['wi-p'], narrow ? 3 : 3.6);
    // 壓力節點（空心圓）與腹點（實心菱形）
    const nd = W.nodesOf(inf.type, inf.n);
    c.lineWidth = 1.8; c.strokeStyle = C['wi-p'];
    nd.pNodes.forEach(function (u) { const x = xa + (xb - xa) * u; c.fillStyle = C['canvas-bg']; c.beginPath(); c.arc(x, gy, 4.5, 0, Math.PI * 2); c.fill(); c.stroke(); });
    c.fillStyle = C['wi-p'];
    nd.pAnti.forEach(function (u) {
      const x = xa + (xb - xa) * u;
      [-1, 1].forEach(function (sg) { const y = gy + sg * ay; c.beginPath(); c.moveTo(x, y - 4.5); c.lineTo(x + 4.5, y); c.lineTo(x, y + 4.5); c.lineTo(x - 4.5, y); c.closePath(); c.fill(); });
    });
    // 標籤：一個節點（軸上方）、一個腹點（下方菱形旁邊）
    const lf = fnt(narrow ? 10 : 11, 600);
    const fits = function (text, x) { c.font = lf; return x + c.measureText(text).width + 16 < cw - Lo.pad - 4; };
    let ua = nd.pAnti[0];
    nd.pAnti.forEach(function (u) { if (Math.abs(u - 0.35) < Math.abs(ua - 0.35)) ua = u; });
    const xan = xa + (xb - xa) * ua;
    const ta = T('壓力腹點', 'Pressure antinode');
    const aRight = fits(ta, xan + 8);
    const ra = D.pill(c, ta, aRight ? xan + 8 : xan - 8, gy - ay + 8, C['wi-p'], aRight ? 'left' : 'right', lf);
    // 節點：先找管內的節點；沒有的話（第 1 模式）標在開管的吹口端或閉管的開口端
    const interior = nd.pNodes.filter(function (u) { return u > 0.02 && u < 0.98; });
    const un = interior.length ? interior[0] : (nd.pNodes.some(function (u) { return u < 0.02; }) ? 0 : 1);
    const xn = xa + (xb - xa) * un;
    const tn = T('壓力節點', 'Pressure node');
    const nRight = un < 0.98 && fits(tn, xn + 8);
    c.font = lf;
    const nw = c.measureText(tn).width + 12, nx0 = nRight ? xn + 8 : xn - 8 - nw;
    // 和腹點的標籤擠在一起時，改放到軸的下方
    const clash = nx0 < ra.x + ra.w + 4 && nx0 + nw > ra.x - 4 && gy - 6 - ra.h < ra.y + ra.h + 4;
    D.pill(c, tn, nRight ? xn + 8 : xn - 8, clash ? gy + 8 + ra.h : gy - 6, C['wi-p'], nRight ? 'left' : 'right', lf);
    // 有效開口（紫色虛線，從管子上方畫到圖的底部）
    c.save();
    c.setLineDash([5, 4]); c.strokeStyle = C['wi-end']; c.lineWidth = 1.6;
    c.beginPath();
    const ends = [inf.sEnd];
    if (inf.type === 'open' && inf.sStart < -1e-6) ends.push(inf.sStart);
    ends.forEach(function (sx) { const x = Math.round(X(sx)) + 0.5; c.moveTo(x, Lo.tubeT + Lo.labH - 2); c.lineTo(x, bot - 4); });
    c.stroke();
    c.restore();
    c.font = lf;
    const ex = X(inf.sEnd), xMinL = Lo.pad + 4, xMaxR = cw - Lo.pad - 4;
    let endTxt = inf.inst === 'recorder' && inf.first >= 0 ? T('有效開口（' + holeName(inf.first) + '下方 ' + num(inf.holeDelta * 1000, 1) + ' mm）', 'Effective open end (' + num(inf.holeDelta * 1000, 1) + ' mm below ' + holeName(inf.first) + ')') : T('有效開口', 'Effective open end');
    if (c.measureText(endTxt).width + 14 > xMaxR - xMinL) endTxt = T('有效開口', 'Effective open end');
    const tw = c.measureText(endTxt).width + 14;
    // 放在紫線右邊；放不下就放左邊；兩邊都放不下就貼著畫布邊緣
    let ebx = ex + 8;
    if (ebx + tw > xMaxR) ebx = ex - 8 - tw;
    if (ebx < xMinL) ebx = Math.max(xMinL, Math.min(xMaxR - tw, ex - tw / 2));
    D.pill(c, endTxt, ebx, bot - 6, C['wi-end'], 'left', lf);
    // 圖說與慢動作倍率
    let tag;
    if (!state.blow) tag = T('靜止：最大壓縮的瞬間', 'Still: greatest compression');
    else if (!moving) tag = T('減少動態：靜止畫面', 'Reduced motion: still');
    else tag = T('放慢約 ' + slowText(inf.f) + ' 倍', 'Slowed ≈ ' + slowText(inf.f) + '×');
    const rt = D.pill(c, tag, cw - Lo.pad - 8, top + 20, state.blow ? C['wi-good'] : C.muted, 'right', fnt(narrow ? 10 : 11, 600));
    // 左上的圖說：和右上的標籤擠在一起時換短的說法
    c.font = fnt(narrow ? 10.5 : 11.5, 600); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = C.muted;
    const capRoom = rt.x - 10 - (Lo.pad + 10);
    const caps = [T('沿著管子：壓力 p、空氣位移 ξ', 'Along the tube: pressure p, air displacement ξ'), T('壓力 p、位移 ξ', 'Pressure p, displacement ξ'), T('p、ξ', 'p, ξ')];
    const cap = caps.find(function (t) { return c.measureText(t).width <= capRoom; }) || caps[caps.length - 1];
    c.fillText(cap, Lo.pad + 10, top + 6);
    c.restore();
  }
  function slowText(f) {
    const r = f / VIS_F;
    const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(r)) - 1));
    return String(Math.round(r / p) * p);
  }

  // =====================================================================
  // 繪圖：頻譜
  // =====================================================================
  function subText(c, base, sub, x, y, color, px, align) {
    c.font = fnt(px, 600);
    const bw = c.measureText(base).width;
    c.font = fnt(px * 0.75, 600);
    const sw = c.measureText(sub).width;
    let x0 = x;
    if (align === 'right') x0 = x - bw - sw;
    else if (align === 'center') x0 = x - (bw + sw) / 2;
    c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = fnt(px, 600); c.fillText(base, x0, y);
    c.font = fnt(px * 0.75, 600); c.fillText(sub, x0 + bw, y + px * 0.28);
    return x0;
  }
  function drawSpectrum(inf) {
    const c = ctx2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw2, ch2);
    const narrow = cw2 < 560;
    const left = narrow ? 28 : 40, right = cw2 - (narrow ? 10 : 18), top = narrow ? 30 : 32, bot = ch2 - (narrow ? 38 : 40);
    const KN = 12;
    const KX = function (k) { return left + (k - 0.5) / KN * (right - left); };
    const Y = function (a) { return bot - a * (bot - top); };
    c.save();
    c.strokeStyle = alpha(C.text, 0.08); c.lineWidth = 1;
    c.beginPath();
    [0.5, 1].forEach(function (v) { const y = Math.round(Y(v)) + 0.5; c.moveTo(left, y); c.lineTo(right, y); });
    c.stroke();
    c.strokeStyle = alpha(C.text, 0.35);
    c.beginPath(); c.moveTo(left, Math.round(bot) + 0.5); c.lineTo(right, Math.round(bot) + 0.5); c.stroke();
    c.font = fnt(10); c.fillStyle = C.muted; c.textAlign = 'right'; c.textBaseline = 'middle';
    [0, 0.5, 1].forEach(function (v) { c.fillText(String(v), left - 5, Y(v)); });
    const bw = Math.max(6, (right - left) / KN * 0.5);
    // 發聲的泛音：第 j 個泛音在 f₁ 的 n·j 倍
    const sp = inf.spectrum;
    for (let j = 1; inf.n * j <= KN; j++) {
      const k = inf.n * j, x = KX(k);
      const a = sp[j - 1] / sp[0];
      if (a > 1e-9) {
        const y = Y(a);
        const g = c.createLinearGradient(0, y, 0, bot);
        g.addColorStop(0, D.shade(C['wi-spec'], 0.25)); g.addColorStop(1, D.shade(C['wi-spec'], -0.15));
        c.save();
        c.shadowColor = D.dark ? 'rgba(0,0,0,0.45)' : alpha(C.text, 0.18); c.shadowBlur = 4; c.shadowOffsetY = 1;
        c.fillStyle = g; D.roundRect(c, x - bw / 2, y, bw, bot - y, Math.min(3, bw / 3)); c.fill();
        c.restore();
      } else {
        // 缺少的泛音（閉管的偶數倍）：虛線空框
        const y = Y(1 / j);
        c.save(); c.setLineDash([3, 3]); c.strokeStyle = alpha(C.muted, 0.85); c.lineWidth = 1.2;
        D.roundRect(c, x - bw / 2, y, bw, bot - y, 2); c.stroke(); c.restore();
        if (bw >= 12) D.haloText(c, T('缺', 'none'), x, y - 4, C.muted, 'center', 'alphabetic', fnt(narrow ? 9.5 : 10.5, 600));
      }
    }
    // 管子的共振（三角形）：開管全部整數倍、閉管只有奇數倍
    for (let k = 1; k <= KN; k++) {
      const res = inf.type === 'open' || k % 2 === 1;
      const x = KX(k), y = bot + 3;
      if (res) {
        c.fillStyle = (k % inf.n === 0 && (inf.type === 'open' || ((k / inf.n) % 2 === 1))) ? C['wi-spec'] : alpha(C['wi-spec'], 0.35);
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 5, y + 8); c.lineTo(x - 5, y + 8); c.closePath(); c.fill();
      }
      c.font = fnt(narrow ? 9.5 : 10.5); c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(narrow ? String(k) : k + '×', x, y + 11);
    }
    // 標題與最低共振
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = fnt(narrow ? 11 : 12, 600); c.fillStyle = C.muted;
    c.fillText(T('頻譜（近似音色）', 'Spectrum (approximate timbre)'), left, narrow ? 15 : 16);
    const lbl = ' = ' + hz(inf.f1);
    c.font = fnt(narrow ? 11 : 12, 600);
    const lw = c.measureText(lbl).width;
    const xs = subText(c, 'f', '1', right - lw, narrow ? 15 : 16, C.text, narrow ? 11 : 12, 'right');
    c.font = fnt(narrow ? 11 : 12, 600); c.fillStyle = C.text; c.textAlign = 'left';
    c.fillText(lbl, right - lw, narrow ? 15 : 16);
    if (!narrow) { c.fillStyle = C.muted; c.textAlign = 'right'; c.fillText(T('最低共振 ', 'lowest resonance '), xs - 2, 16); }
    // 聽到的音：標在第一根長條的右上
    const hf = fnt(narrow ? 10 : 11, 600), ht = T('聽到 ', 'heard ') + hz(inf.f);
    c.font = hf;
    const hx = KX(inf.n) + bw / 2 + 4, hwid = c.measureText(ht).width + 12;
    D.pill(c, ht, hx + hwid < right ? hx : KX(inf.n) - bw / 2 - 4, Y(1) + 16, C['wi-spec'], hx + hwid < right ? 'left' : 'right', hf);
    c.restore();
  }

  // =====================================================================
  // 主繪圖與動畫
  // =====================================================================
  let reducedMotion = D.reducedMotion();
  let hover = null;
  function phase(now) {
    if (!state.blow || reducedMotion) return 1;
    return Math.sin(2 * Math.PI * VIS_F * (now - state.blow.t0) / 1000);
  }
  function draw(now) {
    if (!Lo) return;
    now = now || performance.now();
    const inf = info();
    K = scaleFor(inf);
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    const s = phase(now);
    drawTuner(c, inf);
    drawTube(c, inf, s);
    drawDims(c, inf);
    drawGraph(c, inf, s, !!state.blow && !reducedMotion);
    if (kb && kb.focused() && state.inst === 'tube') {
      const bh = boreH(inf), wl = wallPx(inf);
      if (kb.index() === 0) focusRing(c, X(inf.L) - 12, Lo.tubeY - bh / 2 - wl - 10, 24, bh + 2 * wl + 20);
      else focusRing(c, cw - Lo.pad - (Lo.narrow ? 100 : 128), Lo.tunerT + 2, Lo.narrow ? 96 : 124, Lo.tunerH - 4);
    }
    drawSpectrum(inf);
  }
  let raf = 0;
  function frame() {
    raf = 0;
    const now = performance.now();
    if (!stage.classList.contains('is3d')) draw(now); else drawSpectrum(info());
    if (view3 && view3.active) view3.frame();
    if (state.blow && !reducedMotion) raf = requestAnimationFrame(frame);
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
  function partials(inf) { return inf.spectrum.slice(); }
  function describe(inf) {
    let who;
    if (inf.inst === 'recorder') who = T('直笛', 'Recorder') + (inf.fing ? ' ' + T(inf.fing + ' 指法', inf.fing + ' fingering') : '') + (inf.pull > 0 ? T('（頭管拉出 ' + num(inf.pull, 1) + ' mm）', ' (head joint out ' + num(inf.pull, 1) + ' mm)') : '');
    else who = (inf.type === 'closed' ? T('閉管', 'Closed pipe') : T('開管', 'Open pipe')) + ' ' + num(inf.L, 3) + ' m' + T('、', ', ') + modeText(inf);
    return who + ' → ' + hz(inf.f) + T('（', ' (') + inf.name + ' ' + signed(inf.cents, 1) + T(' 音分），氣溫 ', ' ¢), air at ') + num(inf.T, 1) + ' °C' + T('。', '.');
  }
  function setBlowBtn(on) {
    const b = $('blow');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? T('停止吹氣', 'Stop blowing') : T('▶ 吹氣', '▶ Blow');
  }
  function startBlow() {
    if (state.blow) return;
    MA.stopAll(0.03);
    state.breath++;
    state.blow = { t0: performance.now(), breath: state.breath };
    const inf = info();
    setBlowBtn(true);
    voice = null;
    let off = false;
    if (MA.enabled()) {
      voice = MA.sustain({ f0: inf.f, partials: partials(inf), gain: 0.4, attack: 0.07, maxDur: BREATH, onEnd: function () { stopBlow(false, true); } });
      MA.hit({ filter: Math.min(7000, 3 * inf.f), q: 0.9, gain: 0.08, dur: 0.12 });
    } else off = soundOffHint();
    clearTimeout(breathTimer);
    breathTimer = setTimeout(function () { stopBlow(false, true); }, BREATH * 1000);
    emitNote('blow', null, off);
    updateHints(inf);
    updateStopBtn();
    requestDraw();
  }
  /** 吹氣中改了設定：聲音與畫面即時跟著變 */
  function retune() {
    if (!state.blow) return;
    const inf = info();
    if (voice) voice.set({ f0: inf.f, partials: partials(inf) }, 0.03);
    updateHints(inf);
  }
  function stopBlow(quiet, timeUp) {
    if (!state.blow) return;
    clearTimeout(breathTimer);
    if (voice) { try { voice.stop(0.1); } catch (e) { /* 已停 */ } voice = null; }
    state.blow = null;
    setBlowBtn(false);
    if (timeUp) say(T('一口氣吹完了（12 秒），自動停止。', 'Out of breath after 12 seconds: stopped.'));
    else if (!quiet) say(T('停止吹氣。', 'Stopped blowing.'));
    updateStopBtn();
    requestDraw();
  }
  function stopAll(msg) {
    const was = !!state.blow || MA.playing();
    stopBlow(true);
    MA.stopAll(0.08);
    updateStopBtn();
    requestDraw();
    if (msg && was) say(T('已停止。', 'Stopped.'));
  }
  function updateStopBtn() { $('stop').disabled = !(state.blow || MA.playing()); }
  MA.onChange(function () { updateStopBtn(); });
  function updateHints(inf) {
    const low = $('lowHint');
    if (inf.f < 200) {
      low.hidden = false;
      low.textContent = T('這個音低於 200 Hz：手機或筆電的小喇叭放不出這麼低的基音，你聽到的音高是靠泛音撐起來的；戴耳機聽得比較清楚。',
        'This note is below 200 Hz: small phone and laptop speakers cannot play such a low fundamental, so the pitch you hear comes from the harmonics; headphones work better.');
    } else low.hidden = true;
    $('hfWarn').hidden = !(inf.f >= 4000);
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
  // 任務事件：只在吹氣時發出 'note'
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  /** 吹奏紀錄與任務比較用的精簡資料 */
  function lite(inf, breath) {
    return { inst: inf.inst, type: inf.type, L: inf.L, d: inf.d, T: inf.T, v: inf.v, m: inf.m, n: inf.n, corr: inf.corr,
      holes: inf.holes ? inf.holes.slice() : null, fing: inf.fing, pull: inf.pull, f: inf.f, midi: inf.midi, name: inf.name, cents: inf.cents, breath: breath };
  }
  function emitNote(via, changed, quiet) {
    const inf = info();
    const prev = state.hist[0] || null;
    const data = Object.assign({}, inf, { via: via, changed: changed || null, breath: state.breath, prev: prev, hist: state.hist.slice() });
    state.hist.unshift(lite(inf, state.breath));
    if (state.hist.length > 12) state.hist.pop();
    addLog(inf, prev);
    emit('note', data);
    if (!quiet) say(describe(inf));
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab'), stage = $('stage');
  const elL = $('len'), elD = $('dia'), elT = $('temp'), elP = $('pull');
  function setSlider(el, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(el, v); else el.value = String(v);
    applying = false;
  }
  /** 顯示的小數位：剛好是 base 位就顯示 base 位，否則顯示 more 位（打字輸入可以比滑桿細） */
  function decFor(v, base, more) { const p = Math.pow(10, base); return Math.abs(Math.round(v * p) - v * p) < 1e-6 ? base : more; }
  function refreshOutputs() {
    const rec = state.inst === 'recorder';
    const L = rec ? REC.L + state.pull / 1000 : state.L;
    const d = rec ? REC.d : state.d;
    // 直笛的管長跟著頭管拉出改變：鎖住的滑桿也要跟著，讀值才和顯示一致
    if (rec && window.LabNum && Math.abs(window.LabNum.value(elL) - L) > 1e-9) setSlider(elL, L);
    $('leno').textContent = num(L, decFor(L, 3, 4));
    $('diao').textContent = num(d, decFor(d, 1, 2));
    $('tempo').textContent = num(state.T, decFor(state.T, 1, 2));
    $('pullo').textContent = num(state.pull, decFor(state.pull, 1, 2));
  }
  function syncSliders() {
    const rec = state.inst === 'recorder';
    setSlider(elL, rec ? REC.L + state.pull / 1000 : state.L);
    setSlider(elD, rec ? REC.d : state.d);
    setSlider(elT, state.T);
    setSlider(elP, state.pull);
  }
  function syncUI() {
    const rec = state.inst === 'recorder';
    lab.dataset.inst = state.inst;
    document.querySelectorAll('#insts button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.inst === state.inst)); });
    const type = rec ? 'open' : state.type;
    const m = rec ? (state.holes[0] === 0.5 ? 2 : 1) : state.m;
    const corr = rec ? 'unflanged' : state.corr;
    document.querySelectorAll('#types button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.type === type)); b.disabled = rec; });
    document.querySelectorAll('#modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.m === m)); b.disabled = rec; });
    document.querySelectorAll('#corrs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.corr === corr)); b.disabled = rec; });
    elL.disabled = rec; elD.disabled = rec;
    $('lenBox').classList.toggle('locked', rec); $('diaBox').classList.toggle('locked', rec);
    const fname = W.fingeringName(state.holes);
    document.querySelectorAll('#fings button').forEach(function (b) { b.setAttribute('aria-pressed', String(rec && b.dataset.f === fname)); });
    buildHoles();
    updateNotes();
    refreshOutputs();
    updateReadouts();
  }
  function buildHoles() {
    const box = $('holes');
    if (!box.children.length) {
      // 上排：拇指、1、2、3；下排：4–7
      for (let k = 0; k < 8; k++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.k = String(k);
        if (k === 0) b.className = 'thumb';
        b.innerHTML = '<span class="dot"></span><small></small>';
        box.appendChild(b);
      }
    }
    Array.prototype.forEach.call(box.children, function (b) {
      const k = +b.dataset.k, s = state.holes[k];
      const pressed = s === 0 ? 'true' : s === 0.5 ? 'mixed' : 'false';
      if (b.getAttribute('aria-pressed') !== pressed) b.setAttribute('aria-pressed', pressed);
      const lbl = k === 0 ? T('拇指', 'Thumb') : String(k);
      const sm = b.children[1];
      if (sm.textContent !== lbl) sm.textContent = lbl;
      const al = holeName(k) + T('：', ': ') + (s === 0 ? T('按住', 'covered') : s === 0.5 ? T('半開', 'half-open') : T('打開', 'open'));
      if (b.getAttribute('aria-label') !== al) b.setAttribute('aria-label', al);
    });
  }
  function updateNotes() {
    if (state.inst === 'recorder') {
      $('instNote').textContent = T('C 調高音直笛（示意）：內徑 12.5 mm 的圓柱管，唇口到管尾 320.5 mm，8 個孔。點畫布上的孔、下面的孔按鈕或常用指法。',
        'Soprano recorder in C (illustration): a 12.5 mm cylinder, 320.5 mm from the labium to the foot, 8 holes. Tap the holes on the canvas, the hole buttons or a common fingering.');
      $('tubeNote').textContent = T('直笛模式：管型、管長、內徑與管口修正由直笛決定（灰色是實際使用的值）；振動模式由拇指孔決定，半開 = 第 2 模式。',
        'Recorder mode: the kind of tube, length, bore and end correction are fixed by the recorder (the grey values are the ones used); the thumb hole picks the mode, half-open = mode 2.');
    } else {
      $('instNote').textContent = T('近似尺寸：長笛是兩端開的管子，約 0.65 m、內徑 19 mm；單簧管的簧片把吹嘴那端閉住，約 0.58 m、內徑 15 mm；排笛的每一根都是閉管。',
        'Approximate sizes: a flute is a pipe open at both ends, about 0.65 m long and 19 mm across; a clarinet’s reed closes the mouthpiece end, about 0.58 m and 15 mm; each pan-pipe tube is a closed pipe.');
      $('tubeNote').textContent = T('也可以拖曳畫布上管子的右端改變管長。', 'You can also drag the right end of the tube on the canvas to change its length.');
    }
    $('airNote').textContent = T('聲速 v = 331.3 + 0.606 × ' + num(state.T, 2) + ' = ' + num(W.soundSpeed(state.T), 2) + ' m/s',
      'Speed of sound v = 331.3 + 0.606 × ' + num(state.T, 2) + ' = ' + num(W.soundSpeed(state.T), 2) + ' m/s');
  }
  let eqKey = '';
  function updateReadouts() {
    const inf = info();
    $('rF').textContent = hz(inf.f);
    $('rNote').textContent = inf.name + '\u00a0' + signed(inf.cents, 1) + T('\u00a0音分', '\u00a0¢');   // 不換行空白：值換行時數字和單位不拆開
    $('rMode').textContent = modeText(inf);
    $('rV').textContent = num(inf.v, 2) + '\u00a0m/s';
    $('rLp').textContent = num(inf.L, 4) + '\u00a0→ ' + num(inf.Lp, 4) + '\u00a0m';
    $('rDelta').innerHTML = num(inf.delta * 1000, 2) + '&nbsp;mm <small>(' + (inf.kEnd ? num(inf.kEnd, 4) + ' r' : T('不計', 'ignored')) + ')</small>';
    if (inf.inst === 'recorder') {
      $('rHole').textContent = inf.first >= 0 ? holeName(inf.first) + T('，有效開口在它下方 ', '; effective end ') + num(inf.holeDelta * 1000, 1) + T('\u00a0mm', '\u00a0mm below it') : T('全部按住（管尾）', 'all covered (foot)');
    }
    $('rLam').textContent = num(inf.lambda, 4) + '\u00a0m';
    $('rRes').textContent = inf.res.slice(0, 4).map(function (f) { return num(f, 1); }).join(T('、', ', ')) + ' Hz';
    let tex;
    const Lp = inf.Lp.toFixed(4), v = inf.v.toFixed(2), f = inf.f.toFixed(2);
    if (inf.type === 'closed') tex = 'f=\\dfrac{(2m-1)\\,v}{4L\'}=\\dfrac{' + (2 * inf.m - 1) + '\\times' + v + '}{4\\times' + Lp + '}=' + f + '\\ \\mathrm{Hz}';
    else tex = 'f=\\dfrac{m\\,v}{2L\'}=\\dfrac{' + inf.m + '\\times' + v + '}{2\\times' + Lp + '}=' + f + '\\ \\mathrm{Hz}';
    if (tex !== eqKey) {
      eqKey = tex;
      const el = $('rEq');
      if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
      else el.textContent = tex;
      fitEq();
    }
    buildFingTable(inf);
    updateHints(inf);
    updateAria(inf);
  }
  function buildFingTable(inf) {
    if (inf.inst !== 'recorder') return;
    const rows = W.fingeringTable(state.T, state.pull);
    let h = '<tr><th>' + T('音名', 'Note') + '</th><th>' + T('指法', 'Fingering') + '</th><th>' + T('頻率', 'Freq.') + '</th><th>' + T('偏差', 'Off') + '</th></tr>';
    rows.forEach(function (r) {
      const sel = W.fingeringName(state.holes) === r.name;
      h += '<tr' + (sel ? ' class="sel"' : '') + '><td>' + r.name + '</td><td class="fg" aria-label="' + fingWords(r.holes) + '">' + fingDots(r.holes) + '</td><td>' + num(r.f, 1) + '</td><td class="' +
        (Math.abs(r.cents) <= 5 ? 'ok' : 'off') + '">' + signed(r.cents, 1) + '</td></tr>';
    });
    const t = $('fingTable');
    if (t.innerHTML !== h) t.innerHTML = h;
  }
  let ariaT = 0;
  function updateAria(inf) {
    clearTimeout(ariaT);
    ariaT = setTimeout(function () {
      const what = inf.inst === 'recorder'
        ? T('直笛，', 'Recorder, ') + (inf.fing ? T(inf.fing + ' 指法', inf.fing + ' fingering') : fingWords(inf.holes))
        : (inf.type === 'closed' ? T('閉管', 'closed pipe') : T('開管', 'open pipe')) + ' ' + num(inf.L, 3) + ' m' + T('、', ', ') + modeText(inf);
      cv.setAttribute('aria-label', T('管樂器畫布：', 'Wind instrument canvas: ') + what + T('，聽到 ', ', you hear ') + hz(inf.f) + ' ' + inf.name +
        (inf.inst === 'recorder' ? T('。Enter 切換按孔，方向鍵按住或放開，B 吹氣。', '. Enter picks a hole, arrow keys cover or uncover it, B blows.') : T('。Enter 切換管長與振動模式，方向鍵調整，B 吹氣。', '. Enter switches between the length and the mode, arrow keys adjust, B blows.')));
    }, 400);
  }

  /** 任何設定改變之後：final = true 表示使用者改完了（吹氣中就發一個 'note'） */
  function update(what, final) {
    refreshOutputs();
    updateReadouts();
    updateNotes();
    if (state.blow) { retune(); if (final) emitNote('change', what); }
    requestDraw();
  }
  // ---------- 滑桿 ----------
  elL.addEventListener('input', function () { if (applying) return; state.L = val(elL); update('L', false); });
  elL.addEventListener('change', function () { if (applying) return; state.L = val(elL); update('L', true); });
  elD.addEventListener('input', function () { if (applying) return; state.d = val(elD); update('d', false); });
  elD.addEventListener('change', function () { if (applying) return; state.d = val(elD); update('d', true); });
  elT.addEventListener('input', function () { if (applying) return; state.T = val(elT); update('T', false); });
  elT.addEventListener('change', function () { if (applying) return; state.T = val(elT); update('T', true); });
  elP.addEventListener('input', function () { if (applying) return; state.pull = val(elP); update('pull', false); });
  elP.addEventListener('change', function () { if (applying) return; state.pull = val(elP); update('pull', true); });
  // ---------- 分段按鈕 ----------
  function setInst(id) {
    if (id !== 'tube' && id !== 'recorder') return;
    if (state.inst === id) return;
    state.inst = id;
    if (kbItems) { kbItems.length = 0; Array.prototype.push.apply(kbItems, id === 'recorder' ? recItems : tubeItems); if (kb) kb.select(0); }
    syncSliders(); syncUI();
    update('inst', true);
  }
  document.querySelectorAll('#insts button').forEach(function (b) { b.addEventListener('click', function () { setInst(b.dataset.inst); }); });
  document.querySelectorAll('#types button').forEach(function (b) {
    b.addEventListener('click', function () { if (state.inst !== 'tube' || state.type === b.dataset.type) return; state.type = b.dataset.type; syncUI(); update('type', true); });
  });
  document.querySelectorAll('#modes button').forEach(function (b) {
    b.addEventListener('click', function () { const m = +b.dataset.m; if (state.inst !== 'tube' || state.m === m) return; state.m = m; syncUI(); update('m', true); });
  });
  document.querySelectorAll('#corrs button').forEach(function (b) {
    b.addEventListener('click', function () { if (state.inst !== 'tube' || state.corr === b.dataset.corr) return; state.corr = b.dataset.corr; syncUI(); update('corr', true); });
  });
  document.querySelectorAll('#presets button').forEach(function (b) {
    b.addEventListener('click', function () {
      const p = PRESETS[b.dataset.preset];
      if (!p) return;
      state.type = p.type; state.L = p.L; state.d = p.d; state.corr = p.corr; state.m = 1;
      syncSliders(); syncUI();
      update('preset', true);
      if (!state.blow) say(T('已換成', 'Switched to ') + T({ flute: '長笛', clarinet: '單簧管', pan: '排笛的一根管' }[b.dataset.preset], { flute: 'the flute', clarinet: 'the clarinet', pan: 'one pan-pipe tube' }[b.dataset.preset]) +
        T('的近似尺寸：', ' sizes: ') + (p.type === 'closed' ? T('閉管', 'closed pipe') : T('開管', 'open pipe')) + ' ' + num(p.L, 3) + ' m' + T('、內徑 ', ', bore ') + num(p.d, 0) + ' mm' + T('。按「吹氣」聽聽看。', '. Press “Blow” to hear it.'));
    });
  });
  // ---------- 直笛的孔與指法 ----------
  function toggleHole(k) {
    if (state.inst !== 'recorder' || k < 0 || k > 7) return;
    const s = state.holes[k];
    state.holes[k] = k === 0 ? (s === 0 ? 0.5 : s === 0.5 ? 1 : 0) : (s === 0 ? 1 : 0);
    syncUI();
    update('hole', true);
    if (!state.blow) say(holeName(k) + T('：', ': ') + (state.holes[k] === 0 ? T('按住', 'covered') : state.holes[k] === 0.5 ? T('半開', 'half-open') : T('打開', 'open')) + T('。', '.'));
  }
  $('holes').addEventListener('click', function (ev) {
    const b = ev.target.closest('button');
    if (b && b.dataset.k != null) toggleHole(+b.dataset.k);
  });
  function setFing(name) {
    if (!W.FINGERINGS[name]) return;
    if (state.inst !== 'recorder') { state.inst = 'recorder'; if (kbItems) { kbItems.length = 0; Array.prototype.push.apply(kbItems, recItems); if (kb) kb.select(0); } syncSliders(); }
    state.holes = W.FINGERINGS[name].slice();
    syncUI();
    update('fing', true);
    if (!state.blow) say(T(name + ' 的指法：', name + ' fingering: ') + fingWords(state.holes) + T('。', '.'));
  }
  $('fings').addEventListener('click', function (ev) {
    const b = ev.target.closest('button');
    if (b && b.dataset.f) setFing(b.dataset.f);
  });

  // ---------- 播放列 ----------
  $('blow').addEventListener('click', function () { if (state.blow) stopBlow(false); else startBlow(); });
  $('stop').addEventListener('click', function () { stopAll(true); });
  $('clear').addEventListener('click', function () {
    stopAll();
    state.log = []; state.logN = 0; state.hist = [];
    renderLog();
    requestDraw();
    say(T('已清除吹奏紀錄。', 'Cleared the playing record.'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.blow) stopBlow(false);
  });

  // ---------- 吹奏紀錄 ----------
  function addLog(inf, prev) {
    state.log.push({ n: ++state.logN, inst: inf.inst, type: inf.type, L: inf.L, m: inf.m, holes: inf.holes ? inf.holes.slice() : null, fing: inf.fing, pull: inf.pull,
      T: inf.T, f: inf.f, name: inf.name, cents: inf.cents, diff: prev ? cents(inf.f / prev.f) : null });
    if (state.log.length > 40) state.log.shift();
    renderLog();
  }
  function setShort(r) {
    if (r.inst === 'recorder') return T('直笛 ', 'Rec. ') + (r.fing || fingDots(r.holes)) + (r.pull > 0 ? T('，拉 ', ', +') + num(r.pull, 1) + ' mm' : '');
    return (r.type === 'closed' ? T('閉', 'cl.') : T('開', 'op.')) + ' ' + num(r.L, 3) + ' m' + (r.m > 1 ? T('・第 ' + r.m + ' 模式', ' · m' + r.m) : '');
  }
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>#</th><th>' + T('設定', 'Setting') + '</th><th>T (°C)</th><th>' + T('聽到', 'Heard') + '</th><th>' + T('和上一個差', 'Change') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.n + '</td><td>' + setShort(r) + '</td><td>' + num(r.T, 1) + '</td><td>' + num(r.f, 1) + ' Hz ' + r.name + '</td><td>' +
        (r.diff == null ? '' : signed(r.diff, 1) + ' ¢') + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // ---------- 畫布：拖曳管子右端、點直笛的孔 ----------
  function pointerXY(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function holeAt(p) {
    if (!Lo || state.inst !== 'recorder') return -1;
    const inf = info();
    K = scaleFor(inf);
    const bh = boreH(inf), wl = wallPx(inf);
    const yT = Lo.tubeY - bh / 2 - wl, yB = Lo.tubeY + bh / 2 + wl;
    if (p.y < yT - 22 || p.y > yB + 22) return -1;
    const back = p.y > Lo.tubeY;
    let best = -1, bd = Infinity;
    for (let k = back ? 0 : 1; k < (back ? 1 : 8); k++) {
      const d = Math.abs(p.x - recHoleX(k));
      if (d < bd) { bd = d; best = k; }
    }
    const tol = Math.max(14, 0.011 * K);
    return bd <= tol ? best : -1;
  }
  function endAt(p) {
    if (!Lo || state.inst !== 'tube') return false;
    const inf = info();
    K = scaleFor(inf);
    const bh = boreH(inf), wl = wallPx(inf);
    return Math.abs(p.x - X(inf.L)) <= 22 && p.y >= Lo.tubeY - bh / 2 - wl - 20 && p.y <= Lo.tubeY + bh / 2 + wl + 20;
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = pointerXY(ev);
    if (endAt(p)) {
      state.drag = 'end';
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 有些瀏覽器不支援 */ }
      ev.preventDefault();
      requestDraw();
      return;
    }
    const k = holeAt(p);
    if (k >= 0) { ev.preventDefault(); toggleHole(k); }
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = pointerXY(ev);
    if (state.drag === 'end') {
      const L = lengthAt(p.x);
      if (L !== state.L) { state.L = L; setSlider(elL, L); state.L = L; update('L', false); }
      return;
    }
    const h = endAt(p) ? 'end' : holeAt(p) >= 0 ? 'hole' : null;
    if (h !== hover) { hover = h; requestDraw(); }
    cv.style.cursor = h === 'end' ? 'ew-resize' : h === 'hole' ? 'pointer' : 'default';
  });
  function endDrag() {
    if (state.drag !== 'end') return;
    state.drag = null;
    update('L', true);
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (hover && !state.drag) { hover = null; requestDraw(); } });
  cv.addEventListener('keydown', function (e) {
    if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if (state.blow) stopBlow(false); else startBlow(); }
  });

  // ---------- 鍵盤 ----------
  let kb = null, kbItems = null;
  const tubeItems = [{
    name: function () { return T('管長（管子右端）', 'Tube length (right end)'); },
    move: function (dx, dy, big) {
      const d = dx || dy;
      if (!d) return false;
      const L = Math.max(R.L[0], Math.min(R.L[1], Math.round((state.L + d * (big ? 0.05 : 0.005)) * 1000) / 1000));
      if (L === state.L) return false;
      state.L = L; setSlider(elL, L); state.L = L;
      update('L', true);
      return true;
    },
    describe: function () { const inf = info(); return T('管長 ', 'Length ') + num(inf.L, 3) + T(' m，聽到 ', ' m, you hear ') + hz(inf.f) + ' ' + inf.name; }
  }, {
    name: function () { return T('振動模式', 'Mode of vibration'); },
    move: function (dx, dy) {
      const d = dx || dy;
      const m = Math.max(1, Math.min(3, state.m + d));
      if (!d || m === state.m) return false;
      state.m = m; syncUI(); update('m', true);
      return true;
    },
    describe: function () { const inf = info(); return modeText(inf) + T('，聽到 ', ', you hear ') + hz(inf.f) + ' ' + inf.name; }
  }];
  const recItems = [0, 1, 2, 3, 4, 5, 6, 7].map(function (k) {
    return {
      name: function () { return holeName(k); },
      move: function (dx, dy) { if (!dx && !dy) return false; toggleHole(k); return true; },
      describe: function () {
        const s = state.holes[k], inf = info();
        return holeName(k) + T('：', ': ') + (s === 0 ? T('按住', 'covered') : s === 0.5 ? T('半開', 'half-open') : T('打開', 'open')) + T('，聽到 ', '; you hear ') + hz(inf.f) + ' ' + inf.name;
      }
    };
  });
  if (window.LabKeys) {
    kbItems = tubeItems.slice();
    kb = window.LabKeys.attach(cv, {
      label: T('管樂器畫布。Enter 切換要調整的項目，方向鍵調整，Shift 加方向鍵調得更多，B 吹氣。', 'Wind instrument canvas. Enter picks what to adjust, arrow keys adjust it, Shift for bigger steps; B blows.'),
      items: kbItems,
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 分享目前的設定 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { v: 1, inst: state.inst, type: state.type, L: state.L, d: state.d, T: state.T, m: state.m, corr: state.corr, holes: state.holes.slice(), pull: state.pull };
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const clamp = function (v, lo, hi, dflt) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt; };
      stopAll();
      state.type = o.type === 'closed' ? 'closed' : 'open';
      state.L = clamp(o.L, R.L[0], R.L[1], W.DEFAULT.L);
      state.d = clamp(o.d, R.d[0], R.d[1], W.DEFAULT.d);
      state.T = clamp(o.T, R.T[0], R.T[1], W.DEFAULT.T);
      state.m = Math.round(clamp(o.m, 1, 3, 1));
      state.corr = W.CORRS.indexOf(o.corr) >= 0 ? o.corr : 'unflanged';
      state.pull = clamp(o.pull, R.pull[0], R.pull[1], 0);
      if (Array.isArray(o.holes) && o.holes.length === 8) {
        state.holes = o.holes.map(function (s, k) { s = +s; return k === 0 && s === 0.5 ? 0.5 : s === 1 ? 1 : 0; });
      }
      const inst = o.inst === 'recorder' ? 'recorder' : 'tube';
      if (inst !== state.inst) {
        state.inst = inst;
        if (kbItems) { kbItems.length = 0; Array.prototype.push.apply(kbItems, inst === 'recorder' ? recItems : tubeItems); if (kb) kb.select(0); }
      }
      syncSliders(); syncUI();
      resize();
    }
  });

  // =====================================================================
  // 3D 檢視（three.js 與 wind-instrument-3d.js 都在第一次切到 3D 時才載入）
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
      if (window.WindInstrument3D) { resolve(); return; }
      const s = document.createElement('script');
      const v = (document.querySelector('script[src*="wind-instrument.js"]') || {}).src || '';
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
    return loadScript('js/wind-instrument-3d.js').then(function () {
      return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]);
    }).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  /** 3D 場景需要的狀態（全部由同一個核心算出） */
  function snapshot3() {
    const inf = info();
    return { inf: inf, s: phase(performance.now()), blowing: !!state.blow, moving: !!state.blow && !reducedMotion, pull: state.pull / 1000, head: HEAD };
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
          view3 = window.WindInstrument3D.create(lib, {
            host: host3, T: T, W: W,
            snapshot: snapshot3,
            toggleHole: toggleHole,
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
  window.__wi = {
    state: state, info: info, startBlow: startBlow, stopBlow: stopBlow, stopAll: stopAll, setInst: setInst, setFing: setFing, toggleHole: toggleHole,
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
    eqKey = '';
    syncUI(); renderLog(); updateSoundButton();
    setBlowBtn(!!state.blow);
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); if (ev.detail && ev.detail.name === 'fs') setTimeout(fitEq, 50); });
  try { window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function () { reducedMotion = D.reducedMotion(); requestDraw(); }); } catch (e) { /* 舊瀏覽器 */ }
  if (window.ResizeObserver) {
    let lastW = 0, lastW2 = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== lastW2) { lastW = cv.clientWidth; lastW2 = cv2.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopAll(false); });
  resize();
})();
