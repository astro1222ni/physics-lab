/* standing-waves.js — 「繩波的反射與駐波」模組的畫面與互動（物理計算在 standing-waves-core.js） */
(function () {
  'use strict';
  const SW = window.StandingCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const isEn = function () { return !!(window.LabSettings && window.LabSettings.lang === 'en'); };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 固定的物理設定（畫面上有說明） ----------
  const PULSE_A = 3;     // cm：脈波高度
  const DRIVE_A = 1;     // cm：振盪器送出的波的振幅
  const RHO = 0.7;       // 振盪器端對回來的波的振幅反射比例
  const Y_VIEW = 8;      // cm：縱軸半高
  const NH = 6;          // 共振按鈕個數
  const SLOW = 0.25;
  const PITCH_BASE = 262; // Hz：基頻 f1 對應的音高（中央 C）——按比例的聲音類比
  const BEADS = 20;      // 繩上小珠的間隔數

  const state = {
    mode: 'A', end: 'fixed',
    L: 2, v: 2, w: 0.4, shape: 'sine', f: 1,
    presetF: null,       // 共振按鈕設定的精確頻率（滑桿只能顯示到 0.001 Hz）
    t: 0,
    running: !reducedMotion,
    done: false,         // 模式 A：反射脈波已離開畫面
    slow: false,
    show: { inc: true, ref: true, sum: true, beads: true, env: true, nodes: true },
    fx: [],              // 純裝飾的短暫效果（不影響物理）
    auto: true,          // 載入頁面時自動播放的第一個脈波（不是使用者操作，不回報任務事件）
    skipped: false,      // 這次是否用過「跳到穩定狀態」
    steadyMark: 0        // 已回報到第幾個「每 10 次往返」
  };

  function pA() { return { L: state.L, v: state.v, w: state.w, A: PULSE_A, shape: state.shape, end: state.end }; }
  function pB() { return { L: state.L, v: state.v, f: state.f, a: DRIVE_A, rho: RHO, end: state.end }; }
  function yAt(x, t) { return state.mode === 'A' ? SW.pulseAt(pA(), x, t) : SW.drivenAt(pB(), x, t); }

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-wave']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
  }
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  function alpha(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  /** f > 0 往白色混合、f < 0 往黑色混合 */
  function shade(c, f) {
    const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 有效位數約 3 位 */
  function sig(v) {
    const a = Math.abs(v);
    return num(v, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3);
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  function ord(m) {
    const s = m % 100 >= 11 && m % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][m % 10] || 'th';
    return m + s;
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300;
  let L = null;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');

  function layout() {
    const narrow = cw < 560;
    const Hm = Math.round(cw * (narrow ? 0.74 : 0.4));
    const Hs = state.mode === 'B' ? Math.round(cw * (narrow ? 0.36 : 0.17)) : 0;
    const gap = Hs ? (narrow ? 6 : 8) : 0;
    const padL = narrow ? 46 : 72, padR = narrow ? 30 : 44;
    const top = narrow ? (state.mode === 'B' ? 50 : 32) : 34, bottom = narrow ? 22 : 24;
    const x0 = padL, x1 = cw - padR;
    const plotH = Hm - top - bottom;
    return {
      narrow: narrow, Hm: Hm, Hs: Hs, gap: gap, padL: padL, padR: padR, top: top, bottom: bottom,
      M: { x: 0, y: 0, w: cw, h: Hm },
      S: { x: 0, y: Hm + gap, w: cw, h: Hs },
      x0: x0, x1: x1, kx: (x1 - x0) / state.L,
      cy: top + plotH / 2, ky: plotH / 2 / Y_VIEW,
      lw: narrow ? 3.4 : 4.2,
      bead: narrow ? 3.2 : 4
    };
  }
  function X(x) { return L.x0 + x * L.kx; }
  function Y(y) { return L.cy - y * L.ky; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.Hm + L.gap + L.Hs;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    buildBackground();
    draw();
  }
  /** 參數改變（不影響畫布大小）：重算比例與背景 */
  function relayout() {
    if (!L) return;
    const old = L;
    L = layout();
    if (L.Hm + L.gap + L.Hs !== old.Hm + old.gap + old.Hs) { resize(); return; }
    buildBackground();
    requestDraw();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  /** 畫 f 加下標 m（不用 Unicode 下標字元，避免部分字型缺字） */
  function fSub(c, m, x, y, size, color, weight) {
    c.save();
    c.fillStyle = color;
    c.textBaseline = 'alphabetic';
    c.font = 'italic ' + (weight || 600) + ' ' + size + 'px system-ui, sans-serif';
    const wf = c.measureText('f').width;
    c.font = (weight || 600) + ' ' + Math.round(size * 0.72) + 'px system-ui, sans-serif';
    const ws = c.measureText(String(m)).width;
    const x0 = c.textAlign === 'center' ? x - (wf + ws + 1) / 2 : c.textAlign === 'right' ? x - wf - ws - 1 : x;
    c.textAlign = 'left';
    c.font = 'italic ' + (weight || 600) + ' ' + size + 'px system-ui, sans-serif';
    c.fillText('f', x0, y);
    c.font = (weight || 600) + ' ' + Math.round(size * 0.72) + 'px system-ui, sans-serif';
    c.fillText(String(m), x0 + wf + 1, y + size * 0.28);
    c.restore();
  }

  // ---------- 共振曲線區的座標 ----------
  function stripBox() {
    const S = L.S, padl = L.narrow ? 30 : 38;
    return { x: S.x + padl, y: S.y + (L.narrow ? 26 : 28), w: S.w - padl - 14, h: S.h - (L.narrow ? 26 : 28) - (L.narrow ? 20 : 22) };
  }
  function fAxisMax() { return 3.25 * state.v / state.L; } // 6.5 倍的 v/2L：可容納兩種邊界的前 6 個共振
  function gainMax() { return 1.3 / (1 - RHO); }
  function FX(f, B) { return B.x + f / fAxisMax() * B.w; }
  function GY(g, B) { return B.y + B.h - g / gainMax() * B.h; }

  /** 不變的圖層：底色、格線、座標軸、牆或桿、振盪器外殼、共振曲線（參數或主題改變時才重畫） */
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const edge = shade(base, colors.dark ? -0.35 : -0.045);
    const M = L.M;
    // 主區：中間亮、上下略暗
    const g = c.createLinearGradient(0, M.y, 0, M.y + M.h);
    g.addColorStop(0, edge);
    g.addColorStop(0.5, colors.dark ? shade(base, 0.03) : base);
    g.addColorStop(1, edge);
    c.fillStyle = g;
    roundRect(c, M.x, M.y, M.w, M.h, 8);
    c.fill();
    const rg = c.createRadialGradient(cw / 2, L.cy, 10, cw / 2, L.cy, cw * 0.65);
    rg.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.025 : 0.35) + ')');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg;
    roundRect(c, M.x, M.y, M.w, M.h, 8);
    c.fill();
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    roundRect(c, M.x + 0.5, M.y + 0.5, M.w - 1, M.h - 1, 8);
    c.stroke();

    const px = function (v) { return Math.round(v) + 0.5; };
    const yTop = Y(Y_VIEW), yBot = Y(-Y_VIEW);
    // 格線：x 每 0.1 m（次）、0.5 m（主）；y 每 1 cm（次）、2 cm（主）
    c.save();
    c.beginPath(); c.rect(L.x0, yTop, L.x1 - L.x0, yBot - yTop); c.clip();
    [[0.04, false], [0.1, true]].forEach(function (lv) {
      c.strokeStyle = alpha(colors.text, lv[0] * (colors.dark ? 0.8 : 1));
      c.beginPath();
      for (let i = 0; i <= Math.round(state.L * 10); i++) {
        if ((i % 5 === 0) !== lv[1]) continue;
        const xx = px(X(i / 10));
        c.moveTo(xx, yTop); c.lineTo(xx, yBot);
      }
      for (let j = -Y_VIEW; j <= Y_VIEW; j++) {
        if (j === 0 || ((j % 2 === 0) !== lv[1])) continue;
        const yy = px(Y(j));
        c.moveTo(L.x0, yy); c.lineTo(L.x1, yy);
      }
      c.stroke();
    });
    c.restore();
    // 平衡位置（y = 0）
    c.strokeStyle = alpha(colors.muted, 0.55);
    c.setLineDash([5, 5]);
    c.beginPath(); c.moveTo(state.mode === 'A' ? 4 : L.x0, px(L.cy)); c.lineTo(L.x1, px(L.cy)); c.stroke();
    c.setLineDash([]);
    // x 刻度
    c.font = '11px system-ui, sans-serif';
    c.fillStyle = alpha(colors.muted, 0.95);
    c.textAlign = 'center';
    c.textBaseline = 'top';
    const tickY = yBot + 5;
    const step = state.L / (L.x1 - L.x0) * 60 > 0.5 ? 1 : 0.5;
    for (let x = 0; x <= state.L - step * 0.45 + 1e-9; x += step) c.fillText(num(x, step < 1 ? 1 : 0), X(x), tickY);
    c.font = '600 11px system-ui, sans-serif';
    c.fillStyle = colors.text;
    c.fillText('L = ' + num(state.L, state.L % 1 ? (Math.round(state.L * 10) === state.L * 10 ? 1 : 2) : 0) + ' m', X(state.L), tickY);
    c.strokeStyle = alpha(colors.muted, 0.6);
    c.beginPath();
    for (let x = 0; x <= state.L + 1e-9; x += 0.5) { c.moveTo(px(X(x)), yBot); c.lineTo(px(X(x)), yBot + 3); }
    c.stroke();
    c.font = '600 11px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    if (!L.narrow) c.fillText('x (m)', 4, tickY);
    // y 刻度（±4 cm）與單位
    c.font = '10px system-ui, sans-serif';
    c.fillStyle = alpha(colors.muted, 0.9);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.strokeStyle = alpha(base, 0.85);
    c.lineWidth = 3;
    c.lineJoin = 'round';
    [4, -4].forEach(function (y) { const s = 'y = ' + num(y, 0) + ' cm'; c.strokeText(s, L.x0 + 4, Y(y)); c.fillText(s, L.x0 + 4, Y(y)); });

    // 反射端
    if (state.end === 'fixed') drawWall(c, yTop, yBot);
    else drawRod(c, yTop, yBot);
    // 振盪器外殼（模式 B）
    if (state.mode === 'B') drawDriverBody(c);
    if (state.mode === 'B') buildStrip(c);
  }

  /** 固定端：有斜紋的牆，立體的金屬感 */
  function drawWall(c, yTop, yBot) {
    const x = X(state.L) + 2, w = L.padR - 8, y = yTop - 6, h = yBot - yTop + 12;
    const base = colors.dark ? shade(colors.muted, -0.35) : shade(colors.muted, 0.45);
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(base, colors.dark ? 0.18 : 0.25));
    g.addColorStop(0.35, base);
    g.addColorStop(1, shade(base, -0.25));
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.18) + ')';
    c.shadowBlur = 8; c.shadowOffsetX = 2; c.shadowOffsetY = 2;
    c.fillStyle = g;
    roundRect(c, x, y, w, h, 4);
    c.fill();
    c.restore();
    c.save();
    roundRect(c, x, y, w, h, 4);
    c.clip();
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.16 : 0.13);
    c.lineWidth = 1;
    c.beginPath();
    for (let k = -w; k < h + w; k += 7) { c.moveTo(x, y + k); c.lineTo(x + w, y + k - w); }
    c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.18 : 0.6) + ')';
    c.beginPath(); c.moveTo(x + 1.5, y + 3); c.lineTo(x + 1.5, y + h - 3); c.stroke();
  }

  /** 自由端：光滑直桿（兩層線條的圓柱感），上下有固定座 */
  function drawRod(c, yTop, yBot) {
    const x = X(state.L), y0 = yTop - 8, y1 = yBot + 2;
    const base = colors.dark ? shade(colors.muted, -0.1) : shade(colors.muted, 0.25);
    const g = c.createLinearGradient(x - 3, 0, x + 3, 0);
    g.addColorStop(0, shade(base, -0.3));
    g.addColorStop(0.35, shade(base, 0.55));
    g.addColorStop(1, shade(base, -0.4));
    c.fillStyle = g;
    roundRect(c, x - 3, y0, 6, y1 - y0, 3);
    c.fill();
    // 固定座
    [y0 - 2, y1 - 8].forEach(function (yy) {
      const gb = c.createLinearGradient(0, yy, 0, yy + 8);
      gb.addColorStop(0, shade(base, 0.2));
      gb.addColorStop(1, shade(base, -0.35));
      c.fillStyle = gb;
      roundRect(c, x - 7, yy, cw - x + 3, 8, 3);
      c.fill();
    });
  }

  /** 振盪器外殼（左邊界外），右側有一道導槽 */
  function drawDriverBody(c) {
    const bw = L.narrow ? 24 : 38, bh = L.narrow ? 64 : 84;
    const bx = L.narrow ? 6 : 12, by = L.cy - bh / 2;
    const base = colors.dark ? shade(colors.accent, -0.45) : shade(colors.accent, -0.05);
    const g = c.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, shade(base, 0.22));
    g.addColorStop(1, shade(base, -0.25));
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.22) + ')';
    c.shadowBlur = 8; c.shadowOffsetY = 3;
    c.fillStyle = g;
    roundRect(c, bx, by, bw, bh, 6);
    c.fill();
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(bx + 5, by + 1.5); c.lineTo(bx + bw - 5, by + 1.5); c.stroke();
    // 導槽
    c.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(c, bx + bw - 7, by + 8, 4, bh - 16, 2);
    c.fill();
    // 波形小圖示
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 1.4;
    c.beginPath();
    const cx = bx + (bw - 7) / 2, r = Math.min(7, (bw - 10) / 2);
    for (let i = 0; i <= 16; i++) {
      const xx = cx - r + i / 16 * 2 * r, yy = L.cy - Math.sin(i / 16 * 2 * Math.PI) * r * 0.5;
      if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy);
    }
    c.stroke();
    c.font = (L.narrow ? '600 10px' : '600 11px') + ' system-ui, sans-serif';
    c.fillStyle = colors.muted;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText(T('振盪器', 'Driver'), 3, by + bh + 5);
    L.driver = { bx: bx, by: by, bw: bw, bh: bh };
  }

  function stripTitle() {
    return L.narrow ? T('共振曲線（左右拖曳選頻率）', 'Resonance curve (drag to set f)')
      : T('共振曲線：穩定振幅 ÷ 振盪器振幅（左右拖曳選頻率）', 'Resonance curve: steady amplitude ÷ driver amplitude (drag sideways to set f)');
  }
  /** 共振曲線：穩定振幅 ÷ 振盪器振幅，對頻率作圖 */
  function buildStrip(c) {
    const S = L.S, B = stripBox();
    const base = colors['canvas-bg'], edge = shade(base, colors.dark ? -0.35 : -0.045);
    const g = c.createLinearGradient(0, S.y, 0, S.y + S.h);
    g.addColorStop(0, base);
    g.addColorStop(1, edge);
    c.fillStyle = g;
    roundRect(c, S.x, S.y, S.w, S.h, 8);
    c.fill();
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    roundRect(c, S.x + 0.5, S.y + 0.5, S.w - 1, S.h - 1, 8);
    c.stroke();
    const px = function (v) { return Math.round(v) + 0.5; };
    // 格線與刻度
    const fmax = fAxisMax(), st = niceStep(fmax / (L.narrow ? 4 : 8));
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.08 : 0.1);
    c.beginPath();
    for (let f = st; f < fmax; f += st) { c.moveTo(px(FX(f, B)), B.y); c.lineTo(px(FX(f, B)), B.y + B.h); }
    [1, 2, 3].forEach(function (gg) { c.moveTo(B.x, px(GY(gg, B))); c.lineTo(B.x + B.w, px(GY(gg, B))); });
    c.stroke();
    c.strokeStyle = alpha(colors.muted, 0.7);
    c.beginPath(); c.moveTo(B.x, px(B.y + B.h)); c.lineTo(B.x + B.w, px(B.y + B.h)); c.moveTo(px(B.x), B.y); c.lineTo(px(B.x), B.y + B.h); c.stroke();
    c.font = '10px system-ui, sans-serif';
    c.fillStyle = alpha(colors.muted, 0.95);
    c.textAlign = 'center';
    c.textBaseline = 'top';
    const fd = st < 0.1 ? 2 : st < 1 ? 1 : 0;
    for (let f = 0; f < fmax - st * 0.4; f += st) c.fillText(num(f, f === 0 ? 0 : fd), FX(f, B), B.y + B.h + 4);
    c.textAlign = 'right';
    c.font = '600 11px system-ui, sans-serif';
    c.fillText('f (Hz)', B.x + B.w, B.y + B.h + 4 + (L.narrow ? 0 : 0));
    c.font = '10px system-ui, sans-serif';
    c.textBaseline = 'middle';
    [1, 2, 3].forEach(function (gg) { c.fillText(gg + '×', B.x - 4, GY(gg, B)); });
    // 曲線（填色＋線）
    const N = Math.max(200, Math.round(B.w * 1.5));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N * fmax;
      const gg = f === 0 ? SW.gain(state.end, 1e-9, state.v, state.L, RHO) : SW.gain(state.end, f, state.v, state.L, RHO);
      pts.push([FX(f, B), GY(Math.min(gg, gainMax()), B)]);
    }
    const fill = c.createLinearGradient(0, B.y, 0, B.y + B.h);
    fill.addColorStop(0, alpha(colors['b-wave'], colors.dark ? 0.32 : 0.24));
    fill.addColorStop(1, alpha(colors['b-wave'], 0.02));
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(B.x, B.y + B.h);
    pts.forEach(function (p) { c.lineTo(p[0], p[1]); });
    c.lineTo(B.x + B.w, B.y + B.h);
    c.closePath();
    c.fill();
    c.strokeStyle = colors['b-wave'];
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.beginPath();
    pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    c.stroke();
    // 共振頻率標記
    c.textAlign = 'center';
    SW.harmonics(state.end, state.v, state.L, NH).forEach(function (h) {
      const xx = FX(h.f, B);
      if (xx > B.x + B.w + 1) return;
      c.strokeStyle = alpha(colors.muted, 0.45);
      c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(px(xx), GY(1 / (1 - RHO), B) + 6); c.lineTo(px(xx), B.y + B.h); c.stroke();
      c.setLineDash([]);
      fSub(c, h.m, xx, GY(1 / (1 - RHO), B) - 14, 11, colors.muted, 600);
    });
    // 標題
    c.font = '600 11px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText(stripTitle(), S.x + 8, S.y + 7);
  }

  // ---------- 繪圖工具 ----------
  function pill(text, x, y, color, font, bgAlpha) {
    ctx.font = font || '600 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const m = ctx.measureText(text), tw = m.width;
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 15;
    const ph = fh + 3, pw = tw + 10;
    const al = ctx.textAlign;
    const bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - tw - 5 : x - 5;
    ctx.fillStyle = alpha(colors['canvas-bg'], bgAlpha == null ? 0.86 : bgAlpha);
    roundRect(ctx, bx, y - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 0.5);
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }
  function pillWidth(text, font) { ctx.font = font || '600 12px system-ui, sans-serif'; return ctx.measureText(text).width + 10; }

  function strokePath(pts) {
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
  }
  /** 兩層線條的「繩子」：底層粗而暗，上層細而亮、略偏上 */
  function tube(pts, w, base, light) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = base;
    ctx.lineWidth = w;
    strokePath(pts);
    if (!light) return;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(0.8, w * 0.34);
    strokePath(pts.map(function (p) { return [p[0], p[1] - w * 0.22]; }));
  }
  function sphere(x, y, R, base) {
    const g = ctx.createRadialGradient(x - R * 0.33, y - R * 0.35, R * 0.08, x, y, R);
    g.addColorStop(0, shade(base, 0.65));
    g.addColorStop(0.45, base);
    g.addColorStop(1, shade(base, -0.42));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(shade(base, 0.7), colors.dark ? 0.5 : 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, R - 0.5, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
  }
  /** 小箭頭（脈波前進方向） */
  function dirArrow(x, y, dir, color) {
    const len = L.narrow ? 22 : 28, lw = 2.2, head = 4 * lw * 0.9;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = lw;
    const xs = x - dir * len / 2, xe = x + dir * len / 2;
    ctx.beginPath(); ctx.moveTo(xs, y); ctx.lineTo(xe - dir * head * 0.7, y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xe, y);
    ctx.quadraticCurveTo(xe - dir * head * 0.45, y + lw * 0.6, xe - dir * head, y + 1.7 * lw);
    ctx.lineTo(xe - dir * head * 0.75, y);
    ctx.lineTo(xe - dir * head, y - 1.7 * lw);
    ctx.quadraticCurveTo(xe - dir * head * 0.45, y - lw * 0.6, xe, y);
    ctx.fill();
  }

  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  // ---------- 主繪圖 ----------
  function draw() {
    if (!L) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = state.t, A = state.mode === 'A';
    const xs = A ? -(L.x0 - 2) / L.kx : 0;   // 模式 A：繩子向左延伸到畫面邊緣
    const N = Math.max(160, Math.round((L.x1 - X(xs)) / 1.5));
    const inc = [], ref = [], sum = [];
    for (let i = 0; i <= N; i++) {
      const x = xs + (state.L - xs) * i / N;
      const r = yAt(x, t);
      inc.push([X(x), Y(r.inc), x]); ref.push([X(x), Y(r.ref), x]); sum.push([X(x), Y(r.sum), x]);
    }
    const pB_ = A ? null : pB();
    const steadyA = A ? 0 : SW.steadyAmplitude(pB_);
    const near = A ? null : SW.nearestHarmonic(pB_);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, cw, L.Hm); ctx.clip();

    // 包絡線（模式 B）：穩定後每一點的最大位移
    if (!A && state.show.env) drawEnvelope(pB_, steadyA);
    // 波節／波腹位置（共振時）
    if (!A && state.show.nodes && near.resonant) drawNodeGuides(pB_, steadyA, true);

    // 被選中的小珠：只上下運動的軌道
    if (state.show.beads && state.show.sum) {
      const xb = state.L * 7 / BEADS;
      ctx.strokeStyle = alpha(colors.probe, 0.35);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(Math.round(X(xb)) + 0.5, Y(Y_VIEW) + 2); ctx.lineTo(Math.round(X(xb)) + 0.5, Y(-Y_VIEW) - 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // 繩子（合成波）
    if (state.show.sum) drawString(sum, A);
    // 入射波與反射波（細虛線疊在繩子上）
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const visible = function (arr) { return A ? arr.filter(function (p) { return p[2] >= 0; }) : arr; };
    if (state.show.inc) {
      ctx.strokeStyle = colors.pos; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
      strokePath(visible(inc));
    }
    if (state.show.ref) {
      ctx.strokeStyle = colors.neg; ctx.lineWidth = 2.4; ctx.setLineDash([1, 5]);
      strokePath(visible(ref));
    }
    ctx.setLineDash([]);

    // 小珠
    if (state.show.beads && state.show.sum) {
      for (let j = 0; j <= BEADS; j++) {
        const x = state.L * j / BEADS;
        if (j === BEADS && state.end === 'free') continue; // 自由端畫環
        const y = yAt(x, t).sum;
        sphere(X(x), Y(y), j === 7 ? L.bead * 1.35 : L.bead, j === 7 ? colors.probe : (colors.dark ? shade(colors.field, -0.1) : shade(colors.field, 0.25)));
      }
    }

    // 端點：固定端的夾頭、自由端的環
    const yL = yAt(state.L, t).sum;
    if (state.end === 'fixed') sphere(X(state.L), Y(0), L.narrow ? 4.5 : 5.5, colors.dark ? shade(colors.muted, 0.1) : shade(colors.muted, -0.1));
    else drawRing(X(state.L), Y(yL));
    // 振盪器的推桿（模式 B）
    if (!A) drawPlunger(yAt(0, t).sum);

    // 模式 A：脈波前進方向
    if (A) drawPulseArrows();
    drawInfo(near, true);
    if (!A && state.show.nodes && near.resonant) drawNodeGuides(pB_, steadyA, false);
    drawEffects();
    drawInfo(near);
    ctx.restore();

    if (!A) drawStripDynamic(near);
    updateLive();
  }

  function drawString(sum, A) {
    const col = colors.field;
    const baseC = colors.dark ? shade(col, -0.25) : shade(col, 0.05);
    const light = colors.dark ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.55)';
    // 柔和的陰影
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,' + (colors.dark ? 0.35 : 0.12) + ')';
    ctx.lineWidth = L.lw + 2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokePath(sum.filter(function (p) { return p[2] >= 0; }).map(function (p) { return [p[0] + 1, p[1] + 3]; }));
    ctx.restore();
    if (A) {
      // x < 0 的部分：向左漸淡（繩子很長，延伸到畫面外）
      const left = sum.filter(function (p) { return p[2] <= 0; });
      const gB = ctx.createLinearGradient(0, 0, L.x0, 0);
      gB.addColorStop(0, alpha(baseC, 0));
      gB.addColorStop(1, alpha(baseC, 1));
      const gl = ctx.createLinearGradient(0, 0, L.x0, 0);
      gl.addColorStop(0, 'rgba(255,255,255,0)');
      gl.addColorStop(1, light);
      tube(left, L.lw, gB, gl);
    }
    tube(sum.filter(function (p) { return p[2] >= 0; }), L.lw, baseC, light);
  }

  function drawRing(x, y) {
    const rx = L.narrow ? 4.5 : 5.5, ry = L.narrow ? 9 : 11;
    const base = colors.dark ? shade(colors.equi, -0.1) : shade(colors.equi, 0.05);
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = shade(base, -0.35);
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = shade(base, 0.45);
    ctx.beginPath(); ctx.ellipse(x - 0.6, y - 0.8, rx - 0.6, ry - 0.8, 0, Math.PI * 0.95, Math.PI * 1.75); ctx.stroke();
  }

  function drawPlunger(y0) {
    const d = L.driver; if (!d) return;
    const yy = Y(y0), xs = d.bx + d.bw - 5, xe = X(0);
    const base = colors.dark ? shade(colors.muted, 0.05) : shade(colors.muted, -0.05);
    const g = ctx.createLinearGradient(0, yy - 3, 0, yy + 3);
    g.addColorStop(0, shade(base, 0.45));
    g.addColorStop(1, shade(base, -0.35));
    ctx.fillStyle = g;
    roundRect(ctx, xs, yy - 2.5, xe - xs, 5, 2.5);
    ctx.fill();
    // 夾頭
    const gb = ctx.createLinearGradient(0, yy - 7, 0, yy + 7);
    gb.addColorStop(0, shade(colors.accent, 0.3));
    gb.addColorStop(1, shade(colors.accent, -0.35));
    ctx.fillStyle = gb;
    roundRect(ctx, xe - 4, yy - 7, 8, 14, 3);
    ctx.fill();
  }

  function drawEnvelope(p, A) {
    const N = Math.max(120, Math.round((L.x1 - L.x0) / 2));
    const up = [], dn = [];
    for (let i = 0; i <= N; i++) {
      const x = state.L * i / N, e = SW.envelope(p, x, A);
      up.push([X(x), Y(e)]); dn.push([X(x), Y(-e)]);
    }
    ctx.fillStyle = alpha(colors['b-wave'], colors.dark ? 0.1 : 0.07);
    ctx.beginPath();
    up.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    for (let i = dn.length - 1; i >= 0; i--) ctx.lineTo(dn[i][0], dn[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = alpha(colors['b-wave'], 0.75);
    ctx.lineWidth = 1.3;
    ctx.setLineDash([6, 4]);
    strokePath(up); strokePath(dn);
    ctx.setLineDash([]);
  }

  /** 共振時的波節（◆）與波腹（●）：under = true 畫導引線，false 畫標記與標籤 */
  function drawNodeGuides(p, A, under) {
    const pts = SW.standingPoints(p);
    const yBot = Y(-Y_VIEW), font = '600 11px system-ui, sans-serif';
    if (under) {
      ctx.strokeStyle = alpha(colors.accent, 0.35);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      pts.nodes.forEach(function (x) { ctx.moveTo(Math.round(X(x)) + 0.5, L.cy); ctx.lineTo(Math.round(X(x)) + 0.5, yBot - 10); });
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const nodeTxt = T('波節', 'node'), antiTxt = T('波腹', 'antinode');
    // 波腹：包絡線頂點的小圓點與標籤
    let lastR = -1e9;
    const aw = pillWidth(antiTxt, font);
    pts.antinodes.slice().sort(function (a, b) { return a - b; }).forEach(function (x) {
      const xx = X(x), yy = Y(2 * A);
      ctx.fillStyle = alpha(colors.equi, 0.25);
      ctx.beginPath(); ctx.arc(xx, yy, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colors.equi;
      ctx.beginPath(); ctx.arc(xx, yy, 3.6, 0, Math.PI * 2); ctx.fill();
      const lx = Math.min(Math.max(xx, L.x0 + aw / 2), L.x1 - aw / 2);
      if (lx - aw / 2 > lastR + 4 && !hitsInfo(lx - aw / 2, yy - 22, aw, 18)) {
        ctx.textAlign = 'center';
        pill(antiTxt, lx, yy - 13, colors.equi, font, 0.8);
        lastR = lx + aw / 2;
      }
    });
    // 波節：平衡線上的菱形，標籤放在下方
    lastR = -1e9;
    const nw = pillWidth(nodeTxt, font);
    pts.nodes.slice().sort(function (a, b) { return a - b; }).forEach(function (x) {
      const xx = X(x);
      ctx.save();
      ctx.translate(xx, L.cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = alpha(colors['canvas-bg'], 0.9);
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = colors.accent;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
      const lx = Math.min(Math.max(xx, L.x0 + nw / 2), L.x1 - nw / 2);
      if (lx - nw / 2 > lastR + 4) {
        ctx.textAlign = 'center';
        pill(nodeTxt, lx, yBot - 10, colors.accent, font, 0.8);
        lastR = lx + nw / 2;
      }
    });
  }

  function drawPulseArrows() {
    const p = pA(), x0 = SW.pulseX0(p), t = state.t;
    const ci = x0 + p.v * t, cr = 2 * p.L - x0 - p.v * t;
    const gap = L.narrow ? 14 : 18;
    if (state.show.inc && ci > p.w * 0.3 && ci < p.L - p.w * 0.6) dirArrow(X(ci), Y(PULSE_A) - gap, 1, colors.pos);
    if (state.show.ref && cr < p.L - p.w * 0.6 && cr > 0.15) {
      const s = SW.reflectSign(p.end);
      dirArrow(X(cr), s > 0 ? Y(PULSE_A) - gap : Y(-PULSE_A) + gap, -1, colors.neg);
    }
  }

  function drawEffects() {
    const tNow = performance.now();
    state.fx = state.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const k = (tNow - e.t0) / e.dur;
      ctx.strokeStyle = alpha(e.color, 0.55 * (1 - k));
      ctx.lineWidth = 2.5 * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(X(state.L), Y(e.y), 6 + 26 * k, 0, Math.PI * 2); ctx.stroke();
    });
    if (state.fx.length) requestDraw();
  }

  let infoRects = [];
  function hitsInfo(x0, y0, w, h) {
    return infoRects.some(function (r) { return x0 < r.x + r.w + 3 && x0 + w > r.x - 3 && y0 < r.y + r.h + 3 && y0 + h > r.y - 3; });
  }
  function drawInfo(near, measureOnly) {
    const font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const x = 10, y = L.narrow ? 14 : 16;
    const tTxt = 't = ' + num(state.t, state.t < 100 ? 2 : 1) + ' s' + (state.slow ? T('（慢動作 0.25×）', ' (0.25× slow)') : '');
    infoRects = [];
    const draw1 = function (text, xx, yy, color) {
      const w = pillWidth(text, font), h = 18;
      const r = { x: xx - 5, y: yy - h / 2, w: w, h: h };
      infoRects.push(r);
      if (!measureOnly) pill(text, xx, yy, color, font, 0.8);
      return r;
    };
    const b = draw1(tTxt, x, y, colors.text);
    let line = '', col = colors.muted;
    if (state.mode === 'A') {
      const tm = SW.pulseTimes(pA());
      if (state.t >= tm.tHit) {
        line = state.end === 'fixed' ? T('固定端：反射脈波倒立', 'Fixed end: reflected pulse inverted') : T('自由端：反射脈波正立', 'Free end: reflected pulse upright');
        col = colors.neg;
      }
    } else if (near.resonant) {
      line = T('共振：第 ' + near.m + ' 諧音', 'Resonance: ' + ord(near.m) + ' harmonic');
      col = colors.accent;
    } else {
      line = T('不在共振頻率', 'Not at a resonance');
    }
    if (line) {
      const w2 = pillWidth(line, font);
      if (b.x + b.w + 6 + w2 < L.x1 - 10) draw1(line, b.x + b.w + 11, y, col);
      else draw1(line, x, y + b.h + 4, col);
    }
  }

  /** 共振曲線上目前頻率的標記 */
  function drawStripDynamic(near) {
    const B = stripBox(), fmax = fAxisMax();
    const out = state.f > fmax;
    const xx = out ? B.x + B.w : FX(state.f, B);
    const gg = Math.min(SW.gain(state.end, state.f, state.v, state.L, RHO), gainMax());
    const col = near.resonant ? colors.accent : colors.pos;
    ctx.strokeStyle = alpha(col, 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(Math.round(xx) + 0.5, B.y - 2); ctx.lineTo(Math.round(xx) + 0.5, B.y + B.h); ctx.stroke();
    if (!out) sphere(xx, GY(gg, B), 5, col);
    const txt = 'f = ' + sig(state.f) + ' Hz' + (out ? ' →' : '');
    const fnt = '600 11px system-ui, sans-serif', pw = pillWidth(txt, fnt);
    // 優先放在標題列右側；放不下時才放在標記旁
    ctx.font = '600 11px system-ui, sans-serif';
    const titleR = L.S.x + 8 + ctx.measureText(stripTitle()).width;
    if (titleR + 12 < L.S.x + L.S.w - 8 - pw) {
      ctx.textAlign = 'right';
      pill(txt, L.S.x + L.S.w - 13, L.S.y + 14, col, fnt, 0.9);
    } else {
      const right = xx + 8 + pw <= B.x + B.w;
      ctx.textAlign = right ? 'left' : 'right';
      pill(txt, xx + (right ? 10 : -10), B.y + B.h * 0.74, col, fnt, 0.9);
    }
  }

  // ---------- 讀數 ----------
  function setHTML(id, html) { const el = $(id); if (el && el.innerHTML !== html) el.innerHTML = html; }
  const cm = function (v) { return num(v, 2) + ' cm'; };
  function updateStatic() {
    const v = state.v, Lm = state.L;
    if (state.mode === 'A') {
      const tm = SW.pulseTimes(pA());
      setHTML('cAv', num(v, 2) + ' m/s');
      setHTML('cAL', num(Lm, 2) + ' m');
      setHTML('cAw', num(state.w, 2) + ' m');
      setHTML('cAhit', 't = ' + num(tm.tHit, 2) + ' s<small>' + T('(L + w/2)/v', '(L + w/2)/v') + '</small>');
      setHTML('cAref', state.end === 'fixed' ? T('倒立（相位改變 π）', 'inverted (phase change π)') : T('正立（相位不變）', 'upright (no phase change)'));
    } else {
      const p = pB(), near = SW.nearestHarmonic(p), free = state.end === 'free';
      const f1 = SW.fundamental(state.end, v, Lm);
      setHTML('cBv', num(v, 2) + ' m/s');
      setHTML('cBL', num(Lm, 2) + ' m');
      setHTML('cBlam', sig(SW.wavelength(v, state.f)) + ' m');
      setHTML('cBf1t', T('基頻', 'Fundamental') + ' f<sub>1</sub> = ' + (free ? 'v/4L' : 'v/2L'));
      setHTML('cBf1', sig(f1) + ' Hz');
      const hs = SW.harmonics(state.end, v, Lm, NH);
      setHTML('cBlistT', T('共振頻率 ', 'Resonant frequencies ') + hs.slice(0, 3).map(function (h) { return 'f<sub>' + h.m + '</sub>'; }).join(', ') + ', …');
      setHTML('cBlist', hs.map(function (h) { return sig(h.f); }).join(T('、', ', ')) + ' Hz' +
        '<small>' + (free ? T('只有奇數倍（1, 3, 5, …）× f<sub>1</sub>', 'odd multiples only (1, 3, 5, …) × f<sub>1</sub>') : T('整數倍 n × f<sub>1</sub>', 'whole-number multiples n × f<sub>1</sub>')) + '</small>');
      const dev = near.rel * 100;
      setHTML('cBnear', 'f<sub>' + near.m + '</sub> = ' + sig(near.f) + ' Hz<small>' +
        (near.resonant ? T('共振', 'resonance') : T('偏離 ', 'off by ') + (dev > 0 ? '+' : '−') + num(Math.abs(dev), Math.abs(dev) < 10 ? 1 : 0) + '%') + '</small>');
      $('cBnear').classList.toggle('ok', near.resonant);
      const c = SW.modeCounts(state.end, near.n);
      setHTML('cBcount', near.resonant ? c.nodes + T('／', ' / ') + c.antinodes : T('—（非共振）', '— (not resonant)'));
      setHTML('cBtr', num(SW.roundTrip(p), 2) + ' s');
      const As = SW.steadyAmplitude(p);
      setHTML('cBamp', num(As, 3) + ' cm<small>' + T('最大位移 2A = ', 'largest displacement 2A = ') + cm(2 * As) + '</small>');
      // 共振按鈕
      const box = $('harm');
      if (box.children.length !== NH) {
        box.innerHTML = '';
        for (let n = 1; n <= NH; n++) {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.n = String(n);
          b.addEventListener('click', function () { presetHarmonic(+b.dataset.n); });
          box.appendChild(b);
        }
      }
      hs.forEach(function (h, i) {
        const b = box.children[i];
        const html = '<b>f<sub>' + h.m + '</sub></b><small>' + sig(h.f) + ' Hz</small>';
        if (b.innerHTML !== html) b.innerHTML = html;
        b.setAttribute('aria-pressed', String(near.resonant && near.n === h.n));
        b.setAttribute('aria-label', T('設定為共振頻率 f', 'Set to resonant frequency f') + h.m + ' = ' + sig(h.f) + ' Hz');
      });
    }
  }
  function updateLive() {
    const t = state.t;
    if (state.mode === 'A') {
      setHTML('rAt', num(t, 2) + ' s');
      setHTML('rAyL', cm(yAt(state.L, t).sum));
      let best = 0;
      for (let i = 0; i <= 400; i++) { const y = yAt(state.L * i / 400, t).sum; if (Math.abs(y) > Math.abs(best)) best = y; }
      setHTML('rAmax', cm(best));
    } else {
      const p = pB(), Tr = SW.roundTrip(p);
      setHTML('rBt', num(t, 2) + ' s');
      setHTML('rBn', String(Math.floor(t / Tr + 1e-9)));
      setHTML('rBamp', cm(SW.drivenAmplitudeAt(p, t)) + '<small>' + T('穩定值 ', 'steady value ') + cm(SW.steadyAmplitude(p)) + '</small>');
      setHTML('rBy0', cm(yAt(0, t).sum));
      setHTML('rByL', cm(yAt(state.L, t).sum));
    }
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  /** 脈波在端點反射的輕「嗒」聲：固定端較硬、自由端較輕 */
  function clickSound() {
    const S = sound(); if (!S) return;
    if (state.end === 'fixed') {
      S.tone({ freq: 1150, dur: 0.035, type: 'sine', gain: 0.4 });
      S.tone({ freq: 575, dur: 0.06, type: 'triangle', gain: 0.25 });
      S.noise({ dur: 0.02, gain: 0.18, filter: 3200, q: 1.2 });
    } else {
      S.tone({ freq: 1700, dur: 0.03, type: 'sine', gain: 0.3 });
      S.tone({ freq: 850, dur: 0.05, type: 'sine', gain: 0.18 });
    }
  }
  /**
   * 駐波的「音高類比」：基頻 f1 對應 262 Hz，頻率等比例換算（第 n 諧音 = n × 262 Hz）；
   * 音量跟著行進波目前的振幅（共振時越來越大聲）。
   */
  let voice = null;
  function updateVoice() {
    const S = sound();
    const want = S && state.mode === 'B' && state.running;
    if (!want) { if (voice) { voice.stop(0.15); voice = null; } return; }
    const f1 = SW.fundamental(state.end, state.v, state.L);
    const freq = Math.max(160, Math.min(4000, PITCH_BASE * state.f / f1));
    const amp = SW.drivenAmplitudeAt(pB(), state.t) * (1 - RHO) / DRIVE_A; // 0–1
    const gain = 0.05 + 0.4 * Math.min(1, amp);
    if (!voice || !voice.playing) voice = S.voice({ freq: freq, type: 'triangle', gain: gain });
    else voice.set({ freq: freq, gain: gain }, 0.06);
  }

  // ---------- 任務模式（missions.js）：回報事件 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function pulseData() {
    const p = pA(), tm = SW.pulseTimes(p);
    let mx = 0;
    for (let i = 0; i <= 400; i++) mx = Math.max(mx, Math.abs(yAt(state.L * i / 400, state.t).sum));
    return { end: p.end, shape: p.shape, v: p.v, L: p.L, w: p.w, A: p.A, t: state.t,
      tHit: tm.tHit, tStart: tm.tStart, tEnd: tm.tEnd, maxAbs: mx, yEnd: yAt(state.L, state.t).sum };
  }
  /** 模式 B：每累積 10 次往返（約達穩定）回報一次駐波的狀態 */
  function checkSteady() {
    const p = pB(), Tr = SW.roundTrip(p), M = Math.floor(state.t / Tr + 1e-9);
    const mark = Math.floor(M / 10);
    if (mark < 1 || mark <= state.steadyMark) return;
    state.steadyMark = mark;
    const near = SW.nearestHarmonic(p), c = SW.modeCounts(p.end, near.n), pts = SW.standingPoints(p);
    emit('steady', {
      end: p.end, f: p.f, v: p.v, L: p.L, lambda: SW.wavelength(p.v, p.f), f1: SW.fundamental(p.end, p.v, p.L),
      resonant: near.resonant, n: near.n, m: near.m, fn: near.f,
      nodes: near.resonant ? c.nodes : null, antinodes: near.resonant ? c.antinodes : null,
      nodePositions: pts.nodes.slice(), antinodePositions: pts.antinodes.slice(),
      ampSteady: SW.steadyAmplitude(p), ampNow: SW.drivenAmplitudeAt(p, state.t), gain: SW.gain(p.end, p.f, p.v, p.L, RHO),
      t: state.t, roundTrips: M, skipped: state.skipped
    });
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function tick(tNow) {
    if (!state.running) { loopOn = false; updateVoice(); return; }
    const dt = Math.min((tNow - lastT) / 1000, 1 / 30) * (state.slow ? SLOW : 1);
    lastT = tNow;
    const t0 = state.t;
    state.t = t0 + dt;
    if (state.mode === 'A') {
      const tm = SW.pulseTimes(pA());
      if (t0 < tm.tHit && state.t >= tm.tHit) {
        clickSound();
        if (!state.auto) emit('pulseReflected', pulseData());
        if (!reducedMotion) state.fx.push({ t0: tNow, dur: 420, y: state.end === 'free' ? 2 * PULSE_A : 0, color: state.end === 'fixed' ? colors.neg : colors.equi });
      }
      if (state.t >= tm.tGone) {
        state.t = tm.tGone;
        state.running = false;
        state.done = true;
        setStatus(T('反射脈波已離開畫面。按「送出脈波」再送一次。', 'The reflected pulse has left the picture. Press “Send a pulse” to send another.'));
      }
    }
    else checkSteady();
    updateVoice();
    updateButtons();
    draw();
    if (state.running) requestAnimationFrame(tick); else loopOn = false;
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    const txt = state.running ? T('暫停', 'Pause') : state.t > 0 && !state.done ? T('繼續', 'Resume') : T('播放', 'Play');
    if ($('play').textContent !== txt) $('play').textContent = txt;
  }

  /** 從頭開始（繩子靜止、t = 0）；play 決定是否立即播放 */
  function restart(play) {
    state.t = 0;
    state.auto = false;
    state.skipped = false;
    state.steadyMark = 0;
    state.done = false;
    state.fx = [];
    state.running = play;
    updateButtons();
    updateStatic();
    if (play) startLoop(); else updateVoice();
    requestDraw();
  }

  $('play').addEventListener('click', function () {
    if (state.running) {
      state.running = false;
      state.auto = false; // 使用者按了暫停：之後的事件都算是自己的操作
      if (state.mode === 'A') emit('paused', pulseData());
      updateVoice();
      updateButtons();
      requestDraw();
      return;
    }
    if (state.done) { setStatus(''); restart(true); return; }
    state.running = true;
    setStatus('');
    updateButtons();
    startLoop();
  });
  $('send').addEventListener('click', function () { setStatus(''); restart(true); });
  $('steady').addEventListener('click', function () {
    const Tr = SW.roundTrip(pB());
    if (state.t < 40 * Tr) state.t += 40 * Tr;
    state.skipped = true;
    state.auto = false;
    checkSteady();
    setStatus(T('已跳過約 40 次往返：振幅已達穩定值。', 'Skipped about 40 round trips: the amplitude has reached its steady value.'));
    updateButtons();
    requestDraw();
  });
  // 全部清除：繩子回到靜止、時間歸零（滑桿設定不變）
  $('reset').addEventListener('click', function () {
    restart(false);
    setStatus(state.mode === 'A'
      ? T('已全部清除，滑桿設定不變。按「送出脈波」開始。', 'Everything is cleared; the slider settings are kept. Press “Send a pulse” to start.')
      : T('已全部清除，滑桿設定不變。按「播放」讓振盪器開始送波。', 'Everything is cleared; the slider settings are kept. Press “Play” to start the driver.'));
  });
  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; requestDraw(); });

  [['showInc', 'inc'], ['showRef', 'ref'], ['showSum', 'sum'], ['showBeads', 'beads'], ['showEnv', 'env'], ['showNodes', 'nodes']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
  });

  // 喇叭按鈕：切換全站音效設定（齒輪面板也能切換，兩邊同步）
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
    updateVoice();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); if (!ev.detail.value) voice = null; updateVoice(); }
  });
  updateSoundButton();

  // ---------- 模式與端點 ----------
  function setSeg(ids, on) { ids.forEach(function (id) { $(id).setAttribute('aria-pressed', String(id === on)); }); }
  function updateHints() {
    const fixed = state.end === 'fixed';
    let s = fixed ? T('繩端綁在牆上，不能移動。', 'The end of the string is tied to a wall and cannot move.')
      : T('繩端套著一個很輕的環，可以在光滑的直桿上自由上下滑動。', 'The end of the string is tied to a light ring that slides freely up and down a smooth rod.');
    if (state.mode === 'B') s += T('左端是振盪器（對回來的波近似固定端）。', ' The left end is the driver (close to a fixed end for returning waves).');
    $('endHint').textContent = s;
  }
  function setMode(m) {
    if (m === state.mode) return;
    state.mode = m;
    setSeg(['modeA', 'modeB'], m === 'A' ? 'modeA' : 'modeB');
    const B = m === 'B';
    $('cardA').hidden = B; $('cardB').hidden = !B;
    $('calcA').hidden = B; $('calcB').hidden = !B;
    $('liveA').hidden = B; $('liveB').hidden = !B;
    $('send').hidden = B; $('steady').hidden = !B;
    $('hintA').hidden = B; $('hintB').hidden = !B;
    document.querySelectorAll('.only-b, .leg-b').forEach(function (el) { el.hidden = !B; });
    $('endFixed').textContent = T('固定端', 'Fixed end');
    $('endFree').textContent = T('自由端', 'Free end');
    updateHints();
    setStatus('');
    resize();
    restart(!reducedMotion);
  }
  $('modeA').addEventListener('click', function () { setMode('A'); });
  $('modeB').addEventListener('click', function () { setMode('B'); });
  function setEnd(e) {
    if (e === state.end) return;
    state.end = e;
    setSeg(['endFixed', 'endFree'], e === 'fixed' ? 'endFixed' : 'endFree');
    updateHints();
    paramsChanged();
  }
  $('endFixed').addEventListener('click', function () { setEnd('fixed'); });
  $('endFree').addEventListener('click', function () { setEnd('free'); });
  [['shSine', 'sine'], ['shGauss', 'gauss'], ['shTri', 'tri']].forEach(function (pair) {
    $(pair[0]).addEventListener('click', function () {
      if (state.shape === pair[1]) return;
      state.shape = pair[1];
      setSeg(['shSine', 'shGauss', 'shTri'], pair[0]);
      paramsChanged();
    });
  });

  // ---------- 滑桿 ----------
  const elL = $('L'), elV = $('v'), elW = $('w'), elF = $('f');
  function showOut(el, unit) { $(el.id + 'o').textContent = fmtSlider(val(el), el) + ' ' + unit; }
  function readF() {
    const v = val(elF);
    // 共振按鈕給的精確頻率：滑桿值仍等於它四捨五入到 0.001 Hz 時繼續使用
    if (state.presetF != null && Math.abs(v - Math.round(state.presetF * 1000) / 1000) < 1e-9) return state.presetF;
    state.presetF = null;
    return v;
  }
  function readSliders() {
    state.L = val(elL);
    state.v = val(elV);
    state.w = val(elW);
    state.f = readF();
  }
  function refreshOutputs() {
    showOut(elL, 'm');
    showOut(elV, 'm/s');
    showOut(elW, 'm');
    showOut(elF, 'Hz');
  }
  /** 任何設定改變：繩子從靜止重新開始（播放狀態不變；模式 A 已結束時重新送出脈波） */
  function paramsChanged() {
    readSliders();
    refreshOutputs();
    relayout();
    const play = state.running || (state.mode === 'A' && state.done && !reducedMotion);
    if (state.done) setStatus('');
    restart(play);
  }
  [elL, elV, elW, elF].forEach(function (el) {
    el.addEventListener('input', paramsChanged);
  });
  function presetHarmonic(n) {
    const fn = SW.harmonicFreq(state.end, n, state.v, state.L);
    state.presetF = fn;
    if (window.LabNum) window.LabNum.set(elF, fn); // 會觸發 input 事件 → paramsChanged
    else { elF.value = fn; elF.dispatchEvent(new Event('input')); }
    if (!state.running && !reducedMotion) { state.running = true; startLoop(); updateButtons(); }
    setStatus(T('振盪器以共振頻率 f', 'The driver runs at the resonant frequency f') + SW.harmonicMultiple(state.end, n) + ' = ' + sig(fn) + T(' Hz 送波：每往返一次，振幅就變大一些。', ' Hz: the amplitude grows a little with every round trip.'));
  }

  // 在共振曲線上拖曳選頻率（接近共振頻率時自動對準）
  let dragging = false;
  function freqFromEvent(ev) {
    const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, B = stripBox();
    let f = Math.max(0, Math.min(1, (x - B.x) / B.w)) * fAxisMax();
    let snap = null;
    SW.harmonics(state.end, state.v, state.L, NH).forEach(function (h) {
      if (Math.abs(FX(h.f, B) - x) < 9) snap = h.f;
    });
    if (snap != null) f = snap;
    return { f: Math.max(+elF.min, Math.min(+elF.max, f)), snap: snap };
  }
  function inStrip(ev) {
    if (state.mode !== 'B' || !L) return false;
    const r = cv.getBoundingClientRect(), y = ev.clientY - r.top;
    return y >= L.S.y && y <= L.S.y + L.S.h;
  }
  function applyFreq(ev) {
    const q = freqFromEvent(ev);
    if (Math.abs(q.f - state.f) < 1e-12) return;
    state.presetF = q.snap;
    if (window.LabNum) window.LabNum.set(elF, q.f);
    else { elF.value = q.f; elF.dispatchEvent(new Event('input')); }
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!inStrip(ev)) return;
    dragging = true;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    applyFreq(ev);
    if (!state.running && !reducedMotion) { state.running = true; startLoop(); updateButtons(); }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (dragging) { applyFreq(ev); return; }
    cv.style.cursor = inStrip(ev) ? 'ew-resize' : 'default';
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
    cv.addEventListener(t, function () { dragging = false; });
  });

  // ---------- 啟動 ----------
  document.querySelectorAll('.only-b, .leg-b').forEach(function (el) { el.hidden = state.mode !== 'B'; });
  readColors();
  readSliders();
  refreshOutputs();
  updateHints();
  updateStatic();
  updateButtons();
  function themeChanged() { readColors(); if (L) buildBackground(); updateStatic(); requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  window.addEventListener('resize', function () { resize(); });
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
  if (state.running) startLoop();
})();
