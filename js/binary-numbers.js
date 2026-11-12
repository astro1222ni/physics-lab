/* binary-numbers.js — 「二進位與進位制」的畫面與互動（計算在 binary-numbers-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 數值一律立刻改變；燈泡亮暗、進位火花、溢位閃光只是把「已經算好的結果」用動畫呈現（物理誠實：不改任何數值）。
 * 任務事件只在使用者操作之後送出（見 js/missions/binary-numbers.js 開頭的說明）。 */
(function () {
  'use strict';
  const B = window.BinaryCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade;
  const HIST_MAX = 48;          // 波形圖保留的步數
  const STEP_MS = 75;           // 進位一格一格傳的間隔（毫秒）

  // ---------- 狀態 ----------
  const state = {
    n: 8, v: 0, b: 3,
    tgt: new Array(16).fill(0),   // 畫面上每一盞燈「目前應該」的亮暗（進位動畫時逐格更新）
    disp: new Array(16).fill(0),  // 畫面上的亮度 0–1（往 tgt 漸變）
    flips: [], sparks: [], flashes: [],
    chain: 0, shlRun: 0, runStart: null, vSrc: 'start',
    auto: false, rate: 4, acc: 0,
    hist: [0],
    show: { place: true, hex: true, oct: false },
    lad: { v: 0, rows: B.ladder(0), shown: 0, stepped: true },
    quiz: null, rounds: [], streak: 0,
    focus: 0, hover: -1, kbFocus: false
  };
  let qrand = B.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface',
      'bn-on', 'bn-off', 'bn-panel', 'bn-carry', 'bn-hex', 'bn-oct', 'bn-warn', 'bn-ok']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    sprites = {};
  }
  function fnt(px, weight, family) { return (weight ? weight + ' ' : '') + px + 'px ' + (family || FONT); }
  function intText(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function binGrouped(v, n) { return B.groups(v, n, 4).join(' '); }

  // =====================================================================
  // 版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const stage = $('stage'), lab = $('lab');
  let dpr = 1, cw = 320, ch = 300, cw2 = 320, ch2 = 170, L = null;
  function layout() {
    const n = state.n, W = cw, narrow = W < 560;
    const padX = narrow ? 6 : 16;
    const avail = W - 2 * padX - 16;
    let perRow = n, pitch = avail / n;
    if (pitch < 46 && n > 8) { perRow = 8; pitch = avail / 8; }
    pitch = Math.min(pitch, 72);
    const rows = Math.ceil(n / perRow);
    const r = Math.max(10, Math.min(19, pitch * 0.29));
    const placeH = state.show.place ? 34 : 8;
    const digitH = 20;
    const quiz = !!state.quiz;
    const hexH = state.show.hex && !quiz ? 26 : 0, octH = state.show.oct && !quiz ? 26 : 0;
    const rowH = placeH + 2 * r + 10 + digitH + hexH + octH + 6;
    const panelTop = 8;
    const panelW = perRow * pitch + 16;
    const panelH = rows * rowH + 8;
    const bigH = 58;
    return {
      narrow: narrow, perRow: perRow, pitch: pitch, rows: rows, r: r, placeH: placeH, digitH: digitH, hexH: hexH, octH: octH, rowH: rowH,
      panelTop: panelTop, panelW: panelW, panelH: panelH, panelX: (W - panelW) / 2,
      right: (W + perRow * pitch) / 2, bigY: panelTop + panelH + 12, H: Math.round(panelTop + panelH + bigH)
    };
  }
  /** 第 i 個位元（0 = 最低位）的燈在畫布上的位置 */
  function lampPos(i) {
    const col = i % L.perRow, rowFromBottom = Math.floor(i / L.perRow);
    const row = L.rows - 1 - rowFromBottom;
    const x = L.right - (col + 0.5) * L.pitch;
    const y0 = L.panelTop + 4 + row * L.rowH;
    const cy = y0 + L.placeH + L.r + 2;
    const dy = cy + L.r + 10 + L.digitH / 2;
    return { x: x, y0: y0, cy: cy, dy: dy, gy: cy + L.r + 10 + L.digitH, row: row };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    const rowH = cw2 < 560 ? 12 : 14;
    ch2 = Math.max(130, 26 + state.n * rowH + 22);
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr);
    cv2.height = Math.round(ch2 * dpr);
    sprites = {};
    requestDraw();
  }
  function relayout() { L = layout(); resize(); }

  // =====================================================================
  // 燈泡（預先畫成小圖重複使用）
  // =====================================================================
  let sprites = {};
  function sprite(kind, r) {
    const key = kind + '|' + r.toFixed(1) + '|' + dpr + '|' + D.ver;
    if (sprites[key]) return sprites[key];
    const R = kind === 'glow' ? r * 2.4 : r + 4;
    const c = document.createElement('canvas');
    const S = Math.ceil(R * 2 * dpr) + 2;
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const o = S / dpr / 2;
    if (kind === 'glow') {
      const gr = g.createRadialGradient(o, o, r * 0.6, o, o, R);
      gr.addColorStop(0, alpha(C['bn-on'], D.dark ? 0.55 : 0.42));
      gr.addColorStop(0.45, alpha(C['bn-on'], D.dark ? 0.2 : 0.14));
      gr.addColorStop(1, alpha(C['bn-on'], 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(o, o, R, 0, Math.PI * 2); g.fill();
    } else {
      // 金屬燈座（上亮下暗的環）
      const bz = g.createLinearGradient(0, o - r - 4, 0, o + r + 4);
      bz.addColorStop(0, shade(C['bn-panel'], D.dark ? 0.32 : 0.55));
      bz.addColorStop(1, shade(C['bn-panel'], D.dark ? -0.45 : -0.32));
      g.fillStyle = bz;
      g.beginPath(); g.arc(o, o, r + 3.2, 0, Math.PI * 2); g.fill();
      // 燈泡玻璃
      const on = kind === 'on';
      const base = on ? C['bn-on'] : C['bn-off'];
      const gr = g.createRadialGradient(o - r * 0.33, o - r * 0.36, r * 0.08, o, o, r);
      if (on) {
        gr.addColorStop(0, shade(base, 0.85));
        gr.addColorStop(0.35, shade(base, 0.35));
        gr.addColorStop(0.8, base);
        gr.addColorStop(1, shade(base, -0.28));
      } else {
        gr.addColorStop(0, shade(base, D.dark ? 0.25 : 0.55));
        gr.addColorStop(0.55, base);
        gr.addColorStop(1, shade(base, D.dark ? -0.45 : -0.3));
      }
      g.fillStyle = gr;
      g.beginPath(); g.arc(o, o, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = alpha(shade(base, -0.5), on ? 0.55 : 0.5);
      g.lineWidth = 1;
      g.stroke();
      // 玻璃上的反光
      g.fillStyle = 'rgba(255,255,255,' + (on ? 0.55 : (D.dark ? 0.22 : 0.6)) + ')';
      g.beginPath(); g.ellipse(o - r * 0.32, o - r * 0.42, r * 0.34, r * 0.2, -0.5, 0, Math.PI * 2); g.fill();
    }
    sprites[key] = { c: c, o: o };
    return sprites[key];
  }
  function blit(s, x, y, a) {
    ctx.globalAlpha = a;
    ctx.drawImage(s.c, x - s.o, y - s.o, s.c.width / dpr, s.c.height / dpr);
    ctx.globalAlpha = 1;
  }

  // =====================================================================
  // 繪圖
  // =====================================================================
  let drawQueued = false;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
  let lastT = 0;
  function frame(t) {
    drawQueued = false;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    let busy = step(t, dt);
    draw(t);
    drawChart();
    if (busy || state.auto) requestDraw(); else lastT = 0;
  }
  /** 推進動畫；回傳是否還有東西在動 */
  function step(t, dt) {
    let busy = false;
    // 排好時間的燈號翻轉
    state.flips = state.flips.filter(function (f) {
      if (t >= f.at || reducedMotion) { state.tgt[f.i] = f.to; return false; }
      busy = true; return true;
    });
    for (let i = 0; i < 16; i++) {
      const d = state.tgt[i] - state.disp[i];
      if (Math.abs(d) > 0.004) { state.disp[i] += reducedMotion ? d : d * Math.min(1, dt * 22); busy = true; }
      else state.disp[i] = state.tgt[i];
    }
    state.sparks = state.sparks.filter(function (s) { if (t < s.at + s.dur) { busy = true; return true; } return false; });
    state.flashes = state.flashes.filter(function (f) { if (t < f.at + f.dur) { busy = true; return true; } return false; });
    // 自動數數
    if (state.auto) {
      state.acc += dt * state.rate;
      let k = 0;
      while (state.acc >= 1 && k < 3) { state.acc -= 1; k++; autoStep(t); }
      if (state.acc > 2) state.acc = 0;
      busy = true;
    }
    return busy;
  }

  function draw(t) {
    if (!L) return;
    const w = cw, h = ch;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    D.backdrop(ctx, w, h);
    const n = state.n, quiz = state.quiz;

    // 面板（像早期電腦的前面板）
    const px = L.panelX, py = L.panelTop, pw = L.panelW, ph = L.panelH;
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.55 : 0.18);
    ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    D.roundRect(ctx, px, py, pw, ph, 14);
    const pg = ctx.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, shade(C['bn-panel'], D.dark ? 0.06 : 0.35));
    pg.addColorStop(1, shade(C['bn-panel'], D.dark ? -0.25 : -0.06));
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.restore();
    D.roundRect(ctx, px + 0.5, py + 0.5, pw - 1, ph - 1, 14);
    ctx.strokeStyle = alpha(C.text, D.dark ? 0.16 : 0.12);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 14, py + 1.5); ctx.lineTo(px + pw - 14, py + 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,' + (D.dark ? 0.07 : 0.7) + ')'; ctx.stroke();
    // 兩列時，中間畫一條細分隔線（上面一列是高位元組）
    for (let row = 1; row < L.rows; row++) {
      const yy = Math.round(py + 4 + row * L.rowH) + 0.5;
      ctx.beginPath(); ctx.moveTo(px + 12, yy); ctx.lineTo(px + pw - 12, yy);
      ctx.strokeStyle = alpha(C.text, 0.08); ctx.stroke();
    }

    // 群組括號（十六進位 4 位元、八進位 3 位元）
    if (!quiz) {
      if (state.show.hex) drawGroups(4, C['bn-hex'], 0);
      if (state.show.oct) drawGroups(3, C['bn-oct'], state.show.hex ? 26 : 0);
    }

    const sOff = sprite('off', L.r), sOn = sprite('on', L.r), sGlow = sprite('glow', L.r);
    const ladBit = ladderBit();
    for (let i = 0; i < n; i++) {
      const p = lampPos(i);
      const a = state.disp[i];
      // 位值
      if (state.show.place) {
        D.supText(ctx, '2', String(i), p.x, p.y0 + 14, C.muted, fnt(L.narrow ? 12 : 13, 600), 'center');
        const pv = intText(Math.pow(2, i));
        ctx.font = fnt(pv.length > 4 ? 9.5 : 10.5, 500);
        ctx.fillStyle = alpha(C.muted, 0.9);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(pv, p.x, p.y0 + 28);
      }
      if (a > 0.01) blit(sGlow, p.x, p.cy, a);
      blit(sOff, p.x, p.cy, 1);
      if (a > 0.01) blit(sOn, p.x, p.cy, a);
      // 位元的數字
      const bitNow = state.tgt[i];
      ctx.font = fnt(16, 700, MONO);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = bitNow ? C.text : alpha(C.muted, 0.8);
      ctx.fillText(bitNow ? '1' : '0', p.x, p.dy);
      // 滑過、鍵盤焦點、除法階梯的位元
      if (i === state.hover && !quizLocked()) ring(p, alpha(C.accent, 0.55), false);
      if (state.kbFocus && i === state.focus) ring(p, C.accent, true);
      if (ladBit === i) {
        const pulse = 0.5 + 0.5 * Math.sin(t / 180);
        ctx.beginPath(); ctx.arc(p.x, p.cy, L.r + 7 + pulse * 2, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(C['bn-hex'], 0.5 + 0.4 * pulse); ctx.lineWidth = 2; ctx.stroke();
      }
    }

    // 進位火花
    state.sparks.forEach(function (s) {
      const u = Math.max(0, Math.min(1, (t - s.at) / s.dur));
      if (t < s.at) return;
      const a = lampPos(s.from);
      let bx, by;
      if (s.to < n) { const q = lampPos(s.to); bx = q.x; by = q.cy; }
      else { bx = a.x - L.pitch * 0.9; by = a.cy; }        // 從最高位掉出燈排（溢位）
      const x = a.x + (bx - a.x) * u, y = a.cy + (by - a.cy) * u - Math.sin(u * Math.PI) * L.r * 0.9;
      const fade = s.to >= n ? 1 - u : 1;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, alpha(s.color || C['bn-carry'], 0.95 * fade));
      g.addColorStop(1, alpha(s.color || C['bn-carry'], 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * fade) + ')';
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    });

    // 大字：十進位的值
    if (!quiz) {
      const y = L.bigY + 22;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = fnt(L.narrow ? 13 : 14, 500);
      const lab1 = T('十進位', 'Decimal');
      const big = '= ' + intText(state.v);
      ctx.font = fnt(L.narrow ? 26 : 30, 700, MONO);
      const wBig = ctx.measureText(big).width;
      ctx.font = fnt(L.narrow ? 13 : 14, 500);
      const wLab = ctx.measureText(lab1).width;
      const x0 = w / 2 - (wBig + wLab + 10) / 2;
      D.haloText(ctx, lab1, x0, y - 2, C.muted, 'left', 'alphabetic', fnt(L.narrow ? 13 : 14, 500));
      D.haloText(ctx, big, x0 + wLab + 10, y + 2, C.text, 'left', 'alphabetic', fnt(L.narrow ? 26 : 30, 700, MONO));
      const sub = T('十六進位 ', 'hex ') + B.toBase(state.v, 16) + T('　八進位 ', '   octal ') + B.toBase(state.v, 8);
      D.haloText(ctx, sub, w / 2, y + 22, alpha(C.muted, 0.95), 'center', 'alphabetic', fnt(12.5, 500, MONO));
    } else {
      D.haloText(ctx, T('挑戰中：數值先藏起來', 'Challenge running: the value is hidden'), w / 2, L.bigY + 26, C.muted, 'center', 'alphabetic', fnt(14, 600));
    }

    // 閃光文字（溢位、餘數）
    state.flashes.forEach(function (f) {
      const u = (t - f.at) / f.dur;
      if (u < 0) return;
      const a = u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.55) / 0.45);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      let x, yb;
      if (f.side === 'left') { const p = lampPos(Math.min(n - 1, state.n - 1)); x = Math.max(L.panelX + 30, p.x - L.pitch * 0.2); yb = p.y0 + (L.placeH > 10 ? 12 : 4); }
      else { const p = lampPos(0); x = Math.min(cw - 30, p.x + L.pitch * 0.2); yb = p.y0 + (L.placeH > 10 ? 12 : 4); }
      D.pill(ctx, f.text, x, yb + 4, f.color, f.side === 'left' ? 'left' : 'right', fnt(12.5, 700));
      ctx.globalAlpha = 1;
    });
  }
  function ring(p, color, dashed) {
    ctx.save();
    if (dashed) ctx.setLineDash([4, 3]);
    D.roundRect(ctx, p.x - L.pitch / 2 + 3, p.cy - L.r - 7, L.pitch - 6, 2 * L.r + 14 + L.digitH, 10);
    ctx.strokeStyle = color; ctx.lineWidth = dashed ? 2 : 1.5; ctx.stroke();
    ctx.restore();
  }
  function drawGroups(k, color, dy) {
    const n = state.n, g = Math.ceil(n / k);
    for (let gi = 0; gi < g; gi++) {
      const lo = gi * k, hi = Math.min(n - 1, lo + k - 1);
      let digit = 0;
      for (let i = hi; i >= lo; i--) digit = digit * 2 + B.bit(state.v, i);
      // 一組可能跨兩列（八進位、兩列時）：每列畫一段，數字標在最低位所在的那段
      const segs = {};
      for (let i = lo; i <= hi; i++) { const p = lampPos(i); (segs[p.row] = segs[p.row] || []).push(i); }
      Object.keys(segs).forEach(function (row) {
        const list = segs[row];
        const a = lampPos(list[list.length - 1]), b = lampPos(list[0]);
        const xl = a.x - L.pitch * 0.42, xr = b.x + L.pitch * 0.42, y = a.gy + 5 + dy;
        ctx.beginPath();
        ctx.moveTo(xl, y - 4); ctx.lineTo(xl, y); ctx.lineTo(xr, y); ctx.lineTo(xr, y - 4);
        ctx.strokeStyle = alpha(color, 0.75); ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.stroke();
        if (list.indexOf(lo) >= 0) D.pill(ctx, B.DIGITS[digit], (xl + xr) / 2, y + 18, color, 'center', fnt(13, 700, MONO));
      });
    }
  }

  // ---------- 波形圖 ----------
  function drawChart() {
    const w = cw2, h = ch2, c = ctx2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    const n = state.n, hist = state.hist;
    const left = 40, right = w - 12, top = 12, bottom = h - 24;
    const rowH = (bottom - top) / n;
    // 列標籤與底線
    for (let r = 0; r < n; r++) {
      const i = n - 1 - r, y = top + (r + 1) * rowH;
      c.beginPath(); c.moveTo(left, Math.round(y) + 0.5); c.lineTo(right, Math.round(y) + 0.5);
      c.strokeStyle = alpha(C.text, 0.06); c.lineWidth = 1; c.stroke();
      if (rowH >= 9) D.supText(c, '2', String(i), left - 8, y - rowH * 0.22, C.muted, fnt(Math.min(12, rowH * 0.9), 600), 'right');
    }
    if (hist.length < 2) {
      D.haloText(c, T('按「+1」或「自動數數」，這裡會畫出每個位元隨時間的變化。', 'Press “+1” or “Count automatically” to draw how each bit changes over time.'), (left + right) / 2, (top + bottom) / 2, C.muted, 'center', 'middle', fnt(13, 500));
    } else {
      const m = hist.length, dx = (right - left) / (HIST_MAX - 1);
      const x0 = right - (m - 1) * dx;
      for (let r = 0; r < n; r++) {
        const i = n - 1 - r, yLow = top + (r + 1) * rowH - 2, yHigh = top + r * rowH + Math.max(2, rowH * 0.22);
        // 高電位的區塊（淡色填滿）
        c.fillStyle = alpha(C['bn-on'], D.dark ? 0.2 : 0.16);
        for (let k = 0; k < m; k++) {
          if (B.bit(hist[k], i)) {
            const xa = x0 + k * dx, xb = k < m - 1 ? xa + dx : xa + Math.min(dx, 6);
            c.fillRect(xa, yHigh, xb - xa, yLow - yHigh);
          }
        }
        // 波形線
        c.beginPath();
        for (let k = 0; k < m; k++) {
          const y = B.bit(hist[k], i) ? yHigh : yLow, xa = x0 + k * dx;
          if (k === 0) c.moveTo(xa, y);
          else { const yp = B.bit(hist[k - 1], i) ? yHigh : yLow; c.lineTo(xa, yp); c.lineTo(xa, y); }
        }
        c.lineTo(x0 + (m - 1) * dx + Math.min(dx, 6), B.bit(hist[m - 1], i) ? yHigh : yLow);
        c.strokeStyle = shade(C['bn-on'], D.dark ? 0.05 : -0.2);
        c.lineWidth = rowH > 10 ? 1.6 : 1.2; c.lineJoin = 'round'; c.lineCap = 'round';
        c.stroke();
      }
    }
    D.haloText(c, T('時間 →（每格 = 數值改變一次）', 'time → (one step per change)'), right, h - 7, C.muted, 'right', 'alphabetic', fnt(11.5, 500));
  }

  // =====================================================================
  // 音效
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function bitFreq(i) { return 1400 * Math.pow(0.9, i); }   // 位元越高，音越低（最低約 290 Hz）
  function sndToggle(on) { const S = sound(); if (S) S.tone({ freq: on ? 880 : 560, dur: 0.04, type: 'triangle', gain: 0.14 }); }
  function sndFlips(order, gap) {
    const S = sound(); if (!S) return;
    order.forEach(function (i, k) { S.tone({ freq: bitFreq(i), dur: 0.06, type: 'sine', gain: 0.13, delay: k * gap / 1000 }); });
  }
  function sndOverflow(delay) { const S = sound(); if (S) S.sweep({ from: 880, to: 280, dur: 0.32, type: 'sawtooth', gain: 0.09, delay: delay || 0 }); }
  function sndShift(left) { const S = sound(); if (S) S.sweep({ from: left ? 420 : 760, to: left ? 760 : 420, dur: 0.14, type: 'triangle', gain: 0.12 }); }
  function sndChime(ok) {
    const S = sound(); if (!S) return;
    if (ok) { S.tone({ freq: 659.25, dur: 0.14, type: 'sine', gain: 0.25 }); S.tone({ freq: 987.77, dur: 0.22, type: 'sine', gain: 0.22, delay: 0.1 }); }
    else S.tone({ freq: 311.13, dur: 0.22, type: 'triangle', gain: 0.22 });
  }
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

  // =====================================================================
  // 數值改變（所有操作都經過這裡）
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg || ''; }, 20); }

  /**
   * 把數值設成 nv。src：操作來源；anim：'carry'（進位一格一格傳）、'shift'、'none'。
   * 回傳改變的位元。
   */
  function setValue(nv, src, opt) {
    opt = opt || {};
    const prev = state.v, n = state.n;
    const order = opt.order || B.changedBits(prev, nv, n);
    state.v = nv;
    // 這個值是怎麼來的（隱藏任務要親手設定的值，不算 ÷2、−1 之類一路滑過去的值）
    const prevSrc = state.vSrc;
    if (src !== 'base' && (nv !== prev || src !== 'bits')) state.vSrc = src;
    // 「只用 +1、×2 從 0 開始」的步數，與連續 ×2 的次數
    if (src !== 'base') {
      if (nv === 0) state.chain = 0;
      else if ((src === 'inc' || src === 'shl') && state.chain >= 0) state.chain++;
      else if (src !== 'bits' || nv !== prev) state.chain = -1;
      if (src === 'shl') { if (state.shlRun === 0) state.runStart = prev; state.shlRun++; }
      else if (src !== 'bits' || nv !== prev) { state.shlRun = 0; state.runStart = null; }
    }
    // 畫面：排定翻轉時間
    const now = performance.now();
    const gap = opt.gap != null ? opt.gap : STEP_MS;
    state.flips = state.flips.filter(function (f) { state.tgt[f.i] = f.to; return false; });  // 前一段動畫直接完成
    if (opt.anim === 'carry' && !reducedMotion && gap > 0) {
      order.forEach(function (i, k) {
        state.flips.push({ i: i, to: B.bit(nv, i), at: now + k * gap });
        if (k > 0) state.sparks.push({ from: order[k - 1], to: i, at: now + (k - 1) * gap, dur: gap });
      });
      if (opt.overflow) state.sparks.push({ from: n - 1, to: n, at: now + (order.length - 1) * gap, dur: 260, color: C['bn-warn'] });
    } else {
      for (let i = 0; i < 16; i++) state.tgt[i] = i < n ? B.bit(nv, i) : 0;
    }
    for (let i = n; i < 16; i++) { state.tgt[i] = 0; state.disp[i] = 0; }
    if (nv !== prev || src === 'inc' || src === 'dec') {
      state.hist.push(nv);
      if (state.hist.length > HIST_MAX) state.hist.splice(0, state.hist.length - HIST_MAX);
    }
    // 除法階梯跟著新的值重來
    if (nv !== state.lad.v) resetLadder();
    updateReadouts();
    requestDraw();
    if (src !== 'silent') {
      emit('value', {
        src: src, n: n, v: nv, prev: prev, changed: order.length, overflow: !!opt.overflow, ones: B.popcount(nv),
        b: state.b, inB: B.toBase(nv, state.b), hex: B.toBase(nv, 16),
        chain: state.chain, shlRun: state.shlRun, runStart: state.runStart, vSrc: state.vSrc, prevSrc: prevSrc
      });
    }
    return order;
  }
  function flash(text, color, side) { state.flashes.push({ text: text, color: color, side: side, at: performance.now() + (side === 'left' ? 120 : 0), dur: 1400 }); requestDraw(); }

  // ---------- 操作 ----------
  function opsAllowed() { return !state.quiz; }
  function doInc(src) {
    const r = B.inc(state.v, state.n);
    const gap = src === 'auto' ? Math.min(STEP_MS, 600 / state.rate / Math.max(1, r.flipped.length)) : STEP_MS;
    setValue(r.v, src || 'inc', { order: r.flipped, anim: 'carry', overflow: r.overflow, gap: gap });
    if (src === 'auto') { const S = sound(); if (S) S.tone({ freq: bitFreq(r.flipped[r.flipped.length - 1]), dur: 0.05, type: 'sine', gain: 0.12 }); }
    else sndFlips(r.flipped, STEP_MS);
    if (r.overflow) {
      flash(T('溢位！回到 0', 'Overflow! Back to 0'), C['bn-warn'], 'left');
      if (src !== 'auto') sndOverflow(r.flipped.length * STEP_MS / 1000);
      say(T('溢位：' + state.n + ' 個位元裝不下 ' + intText(B.maxOf(state.n) + 1) + '，最高位的進位掉出去了，數值繞回 0。',
        'Overflow: ' + state.n + ' bits cannot hold ' + intText(B.maxOf(state.n) + 1) + '; the carry fell off the top and the number wrapped round to 0.'));
    } else if (src !== 'auto') {
      say(T('+1：' + r.flipped.length + ' 盞燈改變（' + (r.flipped.length - 1) + ' 次進位）。', '+1: ' + r.flipped.length + ' lamp' + (r.flipped.length > 1 ? 's' : '') + ' changed (' + (r.flipped.length - 1) + ' carr' + (r.flipped.length - 1 === 1 ? 'y' : 'ies') + ').'));
    }
  }
  function doDec() {
    const r = B.dec(state.v, state.n);
    setValue(r.v, 'dec', { order: r.flipped, anim: 'carry', overflow: r.overflow });
    sndFlips(r.flipped, STEP_MS);
    if (r.overflow) {
      flash(T('借位繞回最大值', 'Borrow wrapped to the top'), C['bn-warn'], 'left');
      say(T('0 − 1：借不到位，數值繞回 ' + intText(r.v) + '（' + state.n + ' 個位元全亮）。', '0 − 1: nothing to borrow from, so the number wraps to ' + intText(r.v) + ' (all ' + state.n + ' bits on).'));
    } else say(T('−1：' + r.flipped.length + ' 盞燈改變。', '−1: ' + r.flipped.length + ' lamp' + (r.flipped.length > 1 ? 's' : '') + ' changed.'));
  }
  function doShl() {
    const r = B.shl(state.v, state.n);
    setValue(r.v, 'shl', { overflow: r.overflow });
    sndShift(true);
    if (r.overflow) {
      flash(T('最高位被推出去：溢位', 'Top bit pushed out: overflow'), C['bn-warn'], 'left');
      if (state.v === 0) say(T('×2 之後竟然變成 0：唯一亮著的最高位被推出燈排了。', '×2 gave 0: the only lamp that was on was the top one, and it was pushed out.'));
      else say(T('×2：每個位元往左移一格，最高位的 1 被推出去（溢位），所以結果不是原來的兩倍。', '×2: every bit moved one place left and the top 1 fell off (overflow), so the result is not twice the old value.'));
    } else say(T('×2：每個位元往左移一格，右邊補 0。', '×2: every bit moved one place left and a 0 came in on the right.'));
  }
  function doShr() {
    const r = B.shr(state.v, state.n);
    setValue(r.v, 'shr', {});
    sndShift(false);
    flash(T('餘數 ', 'remainder ') + r.lost, r.lost ? C['bn-oct'] : C.muted, 'right');
    say(T('÷2：每個位元往右移一格，掉出去的位元 ' + r.lost + ' 就是餘數。', '÷2: every bit moved one place right; the bit that fell off, ' + r.lost + ', is the remainder.'));
  }
  function doClear() { setValue(0, 'clear', {}); say(T('歸零。', 'Reset to 0.')); }
  function toggleBit(i, src) {
    if (quizLocked() || i < 0 || i >= state.n) return;
    const nv = B.toggle(state.v, i, state.n);
    setValue(nv, src || 'toggle', {});
    const on = B.bit(nv, i);
    sndToggle(on);
    say(T('第 ' + i + ' 位（位值 ' + intText(Math.pow(2, i)) + '）' + (on ? '亮' : '暗') + '，數值 ' + intText(nv) + '。',
      'Bit ' + i + ' (worth ' + intText(Math.pow(2, i)) + ') is ' + (on ? 'on' : 'off') + '; the value is ' + intText(nv) + '.'));
  }
  function autoStep() { doInc('auto'); }
  function setAuto(on) {
    if (on && !opsAllowed()) return;
    state.auto = on; state.acc = 0;
    $('autoBtn').setAttribute('aria-pressed', String(on));
    $('autoBtn').textContent = on ? T('停止數數', 'Stop counting') : T('自動數數', 'Count automatically');
    if (on) requestDraw();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] !== html) { lastHTML[id] = html; $(id).innerHTML = html; } }
  function katexInto(el, tex) {
    if (el._tex === tex) return;
    el._tex = tex;
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: false }); return; } catch (e) { /* 退回純文字 */ } }
    el.textContent = tex;
  }
  const inputs = { 2: $('in2'), 8: $('in8'), 10: $('in10'), 16: $('in16') };
  function refreshInputs() {
    Object.keys(inputs).forEach(function (k) {
      const el = inputs[k], b = +k;
      el.value = b === 2 ? binGrouped(state.v, state.n) : B.toBase(state.v, b);
      el.classList.remove('bad');
    });
  }
  function updateReadouts() {
    const n = state.n, v = state.v;
    refreshInputs();
    setHTML('rOnes', B.popcount(v) + ' ／ ' + n);
    setHTML('rMax', intText(B.maxOf(n)) + ' = 2<sup>' + n + '</sup> − 1');
    setHTML('rCount', intText(Math.pow(2, n)) + ' = 2<sup>' + n + '</sup>');
    // 位值相加的式子
    const terms = [];
    for (let i = n - 1; i >= 0; i--) if (B.bit(v, i)) terms.push('2^{' + i + '}');
    katexInto($('sumEq'), v === 0 ? '0 = (' + '0'.repeat(Math.min(n, 16)) + ')_2' : intText(v).replace(/,/g, '{,}') + ' = ' + terms.join(' + '));
    // 任意進位
    const b = state.b, dg = B.digitsOf(v, b).slice().reverse();
    let html = '';
    dg.forEach(function (d) {
      html += '<div class="dg"><b>' + B.DIGITS[d.d] + '</b><span>' + (d.k === 0 ? '1' : b + '<sup>' + d.k + '</sup>') + '</span><span>' + intText(d.place) + '</span></div>';
    });
    setHTML('digitsB', html);
    const parts = dg.map(function (d) { return d.d + '\\times' + b + '^{' + d.k + '}'; });
    katexInto($('baseEq'), '(' + B.toBase(v, b) + ')_{' + b + '} = ' + (parts.length > 6 ? parts.slice(0, 6).join(' + ') + ' + \\cdots' : parts.join(' + ')) + ' = ' + intText(v).replace(/,/g, '{,}'));
    $('bbo').textContent = String(b);
    $('nbo').textContent = String(n);
  }

  // ---------- 四種寫法：輸入 ----------
  function baseName(b) { return b === 2 ? T('二進位', 'binary') : b === 8 ? T('八進位', 'octal') : b === 10 ? T('十進位', 'decimal') : T('十六進位', 'hexadecimal'); }
  function setMsg(text, cls) { const el = $('baseMsg'); el.textContent = text; el.className = 'msg' + (cls ? ' ' + cls : ''); }
  function applyInput(b) {
    if (!opsAllowed()) return;
    const el = inputs[b];
    const raw = el.value;
    const v = B.fromBase(raw, b);
    if (!isFinite(v)) {
      el.classList.add('bad');
      setMsg(T('「' + raw.trim() + '」不是合法的' + baseName(b) + '數字（' + (b === 16 ? '只能用 0–9 和 A–F' : '只能用 0–' + (b - 1)) + '）。',
        '“' + raw.trim() + '” is not a valid ' + baseName(b) + ' number (use ' + (b === 16 ? '0–9 and A–F' : '0–' + (b - 1)) + ' only).'), 'bad');
      return;
    }
    if (v > B.maxOf(B.MAX_BITS)) {
      el.classList.add('bad');
      setMsg(T('這裡最多 16 個位元（最大 65,535）。', 'This lab has at most 16 bits (largest 65,535).'), 'bad');
      return;
    }
    if (v > B.maxOf(state.n)) {
      el.classList.add('bad');
      const k = B.bitLength(v);
      setMsg(T(state.n + ' 個位元放不下 ' + intText(v) + '，至少要 ' + k + ' 個位元。請先把「位元數 n」調大。',
        state.n + ' bits cannot hold ' + intText(v) + '; it needs at least ' + k + ' bits. Increase “Number of bits n” first.'), 'bad');
      return;
    }
    const prev = state.v;
    setValue(v, 'type' + b, {});
    if (v !== prev) sndToggle(true);
    setMsg(T('已設成 ' + intText(v) + '。', 'Set to ' + intText(v) + '.'), 'ok');
  }
  Object.keys(inputs).forEach(function (k) {
    const el = inputs[k], b = +k;
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyInput(b); } });
    el.addEventListener('change', function () { applyInput(b); });
    el.addEventListener('input', function () {
      const s = el.value.trim();
      el.classList.toggle('bad', s !== '' && !isFinite(B.fromBase(s, b)));
    });
  });

  // =====================================================================
  // 除法階梯
  // =====================================================================
  function resetLadder() {
    state.lad = { v: state.v, rows: B.ladder(state.v), shown: 0, stepped: true };
    renderLadder();
  }
  function ladderBit() { const l = state.lad; return l.shown > 0 && l.shown <= l.rows.length && l.v === state.v ? l.shown - 1 : -1; }
  function renderLadder() {
    const l = state.lad, tab = $('ladTab');
    if (!l.shown) { tab.innerHTML = ''; $('ladRes').textContent = ''; return; }
    let html = '';
    for (let k = 0; k < l.shown; k++) {
      const r = l.rows[k];
      html += '<tr' + (k === l.shown - 1 ? ' class="new"' : '') + '><td>' + intText(r.q) + ' ÷ 2</td><td>= ' + intText(r.quo) + '</td><td class="r">' + T('餘 ', 'r ') + r.r + '</td></tr>';
    }
    tab.innerHTML = html;
    if (l.shown === l.rows.length) {
      const bits = l.rows.map(function (r) { return r.r; }).reverse().join('');
      $('ladRes').textContent = T('除到 0 了。餘數由下往上讀：', 'Down to 0. Read the remainders from the bottom up: ') + bits + T('（二進位）', ' (binary)');
    } else $('ladRes').textContent = T('再除下去……（新的餘數是第 ' + (l.shown - 1) + ' 位）', 'Keep dividing… (the new remainder is bit ' + (l.shown - 1) + ')');
  }
  function ladStep() {
    if (!opsAllowed()) return;
    const l = state.lad;
    if (l.v !== state.v) resetLadder();
    if (state.lad.shown >= state.lad.rows.length) { $('ladRes').textContent = T('已經除到 0 了，按「重來」可以再做一次。', 'Already down to 0. Press “Start over” to do it again.'); return; }
    state.lad.shown++;
    renderLadder();
    const S = sound(); if (S) S.tone({ freq: bitFreq(state.lad.shown - 1), dur: 0.08, type: 'sine', gain: 0.14 });
    requestDraw(); keepPulse();
    if (state.lad.shown === state.lad.rows.length) emit('ladder', { v: state.lad.v, steps: state.lad.rows.length, stepped: state.lad.stepped });
  }
  function ladAll() {
    if (!opsAllowed()) return;
    if (state.lad.v !== state.v) resetLadder();
    if (state.lad.shown < state.lad.rows.length) state.lad.stepped = false;
    state.lad.shown = state.lad.rows.length;
    renderLadder(); requestDraw();
    emit('ladder', { v: state.lad.v, steps: state.lad.rows.length, stepped: state.lad.stepped });
  }
  let pulseTimer = 0;
  function keepPulse() {   // 除法階梯的位元圈圈會呼吸，畫面需要持續重畫一小段時間
    if (reducedMotion) return;
    clearInterval(pulseTimer);
    let k = 0;
    pulseTimer = setInterval(function () { requestDraw(); if (++k > 60 || ladderBit() < 0) clearInterval(pulseTimer); }, 50);
  }
  $('ladStep').addEventListener('click', ladStep);
  $('ladAll').addEventListener('click', ladAll);
  $('ladReset').addEventListener('click', function () { resetLadder(); requestDraw(); });

  // =====================================================================
  // 轉換挑戰
  // =====================================================================
  function quizLocked() { return !!(state.quiz && state.quiz.q && (state.quiz.q.kind === 'read' || state.quiz.wait)); }
  function questionText(q) {
    const name = q.base === 16 ? T('十六進位', 'hexadecimal') : q.base === 8 ? T('八進位', 'octal') : T('十進位', 'decimal');
    if (q.kind === 'read') return T('這排燈是十進位多少？', 'What decimal number do these lamps show?');
    return T('把燈設成' + name + ' <b>' + B.toBase(q.v, q.base) + '</b>，再按「確定」。', 'Set the lamps to ' + name + ' <b>' + B.toBase(q.v, q.base) + '</b>, then press “Check”.');
  }
  function quizStart() {
    if (state.n < 4) { $('quizQ').textContent = T('至少要 4 個位元才能挑戰，請先把「位元數 n」調大。', 'You need at least 4 bits for the challenge; increase “Number of bits n” first.'); return; }
    setAuto(false);
    state.quiz = { n: state.n, i: 0, correct: 0, t0: performance.now(), q: null, wait: false, prev: -1 };
    state.streak = 0;
    lab.classList.add('quizzing');
    $('quizStart').hidden = true; $('quizStop').hidden = false;
    setDisabled(true);
    relayout();
    nextQuestion();
    tickQuiz();
  }
  function setDisabled(on) {
    ['incBtn', 'decBtn', 'shlBtn', 'shrBtn', 'autoBtn'].forEach(function (id) { $(id).disabled = on; });
    $('nb').disabled = on;
  }
  function nextQuestion() {
    const z = state.quiz;
    z.q = B.question(qrand, z.n, z.prev);
    z.prev = z.q.v; z.wait = false;
    setValue(z.q.kind === 'read' ? z.q.v : 0, 'silent', {});
    $('quizQ').innerHTML = '<span>' + T('第 ' + (z.i + 1) + '／10 題：', 'Question ' + (z.i + 1) + ' of 10: ') + '</span>' + questionText(z.q);
    $('quizAnsRow').hidden = z.q.kind !== 'read';
    $('quizIn').value = '';
    $('quizOk').disabled = false;
    $('clearBtn').disabled = z.q.kind === 'read';
    requestDraw();
  }
  function quizCheck() {
    const z = state.quiz;
    if (!z || !z.q || z.wait) return;
    let ok;
    if (z.q.kind === 'read') {
      const s = $('quizIn').value.trim();
      if (!/^\d{1,6}$/.test(s.replace(/,/g, ''))) { $('quizIn').focus(); return; }
      ok = +s.replace(/,/g, '') === z.q.v;
    } else ok = state.v === z.q.v;
    z.wait = true;
    z.i++;
    if (ok) { z.correct++; state.streak++; } else state.streak = 0;
    sndChime(ok);
    emit('quiz', { ok: ok, streak: state.streak, n: z.n, kind: z.q.kind, base: z.q.base });
    $('quizOk').disabled = true;
    const right = z.q.kind === 'read' ? intText(z.q.v) : binGrouped(z.q.v, z.n);
    $('quizQ').innerHTML = ok ? T('✓ 答對了！', '✓ Correct!') : T('✗ 正確答案是 <b>' + right + '</b>', '✗ The answer is <b>' + right + '</b>');
    if (!ok && z.q.kind === 'set') { state.tgt.fill(0); setValue(z.q.v, 'silent', {}); }
    if (z.i >= 10) { setTimeout(quizEnd, reducedMotion ? 300 : 900); return; }
    setTimeout(function () { if (state.quiz === z) nextQuestion(); }, reducedMotion ? 300 : 900);
  }
  function quizEnd() {
    const z = state.quiz;
    if (!z) return;
    const time = Math.round((performance.now() - z.t0) / 100) / 10;
    state.rounds.push({ n: z.n, correct: z.correct, time: time });
    emit('round', { correct: z.correct, total: 10, time: time, n: z.n });
    quizExit();
    $('quizQ').innerHTML = T('這一回合答對 <b>' + z.correct + '／10</b>，用了 ' + time.toFixed(1) + ' 秒。', 'This round: <b>' + z.correct + ' / 10</b> correct in ' + time.toFixed(1) + ' s.');
    renderRounds();
  }
  function quizExit() {
    state.quiz = null;
    lab.classList.remove('quizzing');
    $('quizStart').hidden = false; $('quizStop').hidden = true;
    $('quizAnsRow').hidden = true; $('quizOk').disabled = true; $('clearBtn').disabled = false;
    setDisabled(false);
    $('quizStat').innerHTML = '';
    relayout();
    updateReadouts();
  }
  function tickQuiz() {
    const z = state.quiz;
    if (!z) return;
    const s = (performance.now() - z.t0) / 1000;
    $('quizStat').innerHTML = '<span>' + T('答對 ', 'Correct ') + '<b>' + z.correct + '</b>／' + z.i + '</span><span>' + T('連對 ', 'Streak ') + '<b>' + state.streak + '</b></span><span>' + T('時間 ', 'Time ') + '<b>' + s.toFixed(1) + '</b> ' + T('秒', 's') + '</span>';
    setTimeout(tickQuiz, 200);
  }
  function renderRounds() {
    const tab = $('roundLog');
    if (!state.rounds.length) { tab.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let html = '<tr><th>' + T('回合', 'Round') + '</th><th>' + T('位元數', 'Bits') + '</th><th>' + T('答對', 'Correct') + '</th><th>' + T('時間（秒）', 'Time (s)') + '</th></tr>';
    state.rounds.forEach(function (r, k) { html += '<tr><td>' + (k + 1) + '</td><td>' + r.n + '</td><td>' + r.correct + '／10</td><td>' + r.time.toFixed(1) + '</td></tr>'; });
    tab.innerHTML = html;
  }
  $('quizStart').addEventListener('click', quizStart);
  $('quizStop').addEventListener('click', function () { quizExit(); $('quizQ').textContent = T('挑戰結束。按「開始挑戰」再來一次。', 'Challenge stopped. Press “Start the challenge” to try again.'); });
  $('quizOk').addEventListener('click', quizCheck);
  $('quizIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); quizCheck(); } });

  // =====================================================================
  // 控制項
  // =====================================================================
  const elN = $('nb'), elB = $('bb'), elRate = $('rate');
  function readN() { return Math.max(1, Math.min(16, Math.round(val(elN)))); }
  elN.addEventListener('input', function () {
    const n = readN();
    if (n === state.n) return;
    state.n = n;
    state.focus = Math.min(state.focus, n - 1);
    const nv = B.wrap(state.v, n);
    relayout();
    setValue(nv, 'bits', {});
    say(T(n + ' 個位元：0 到 ' + intText(B.maxOf(n)) + '，共 ' + intText(Math.pow(2, n)) + ' 種組合。', n + ' bits: 0 to ' + intText(B.maxOf(n)) + ', ' + intText(Math.pow(2, n)) + ' patterns.'));
  });
  elB.addEventListener('input', function () {
    const b = Math.max(2, Math.min(16, Math.round(val(elB))));
    if (b === state.b) return;
    state.b = b;
    updateReadouts();
    emit('value', { src: 'base', n: state.n, v: state.v, prev: state.v, changed: 0, overflow: false, ones: B.popcount(state.v), b: b, inB: B.toBase(state.v, b), hex: B.toBase(state.v, 16), chain: state.chain, shlRun: state.shlRun, runStart: state.runStart, vSrc: state.vSrc, prevSrc: state.vSrc });
  });
  elRate.addEventListener('input', function () { state.rate = Math.max(1, Math.round(val(elRate))); $('rateo').textContent = String(state.rate); });
  ['showPlace', 'showHex', 'showOct'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      state.show.place = $('showPlace').checked; state.show.hex = $('showHex').checked; state.show.oct = $('showOct').checked;
      relayout();
    });
  });
  $('incBtn').addEventListener('click', function () { if (opsAllowed()) doInc('inc'); });
  $('decBtn').addEventListener('click', function () { if (opsAllowed()) doDec(); });
  $('shlBtn').addEventListener('click', function () { if (opsAllowed()) doShl(); });
  $('shrBtn').addEventListener('click', function () { if (opsAllowed()) doShr(); });
  $('clearBtn').addEventListener('click', function () { if (!quizLocked()) doClear(); });
  $('autoBtn').addEventListener('click', function () { setAuto(!state.auto); });
  $('wipeBtn').addEventListener('click', function () {
    state.hist = [state.v];
    state.rounds = [];
    renderRounds();
    resetLadder();
    state.flashes = [];
    say(T('已清除波形圖、除法階梯與挑戰紀錄。', 'Cleared the timing chart, the division ladder and the challenge log.'));
    requestDraw();
  });

  // ---------- 畫布：點燈 ----------
  function hitLamp(ev) {
    if (!L) return -1;
    const rect = cv.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    for (let i = 0; i < state.n; i++) {
      const p = lampPos(i);
      if (Math.abs(x - p.x) <= L.pitch / 2 && y >= p.cy - L.r - 12 && y <= p.dy + L.digitH * 0.6) return i;
    }
    return -1;
  }
  cv.addEventListener('pointerdown', function (ev) {
    const i = hitLamp(ev);
    if (i < 0) return;
    state.focus = i;
    toggleBit(i, 'toggle');
  });
  cv.addEventListener('pointermove', function (ev) {
    const i = ev.pointerType === 'mouse' ? hitLamp(ev) : -1;
    if (i !== state.hover) { state.hover = i; cv.style.cursor = i >= 0 && !quizLocked() ? 'pointer' : 'default'; requestDraw(); }
  });
  cv.addEventListener('pointerleave', function () { if (state.hover !== -1) { state.hover = -1; requestDraw(); } });
  cv.addEventListener('focus', function () { state.kbFocus = true; requestDraw(); });
  cv.addEventListener('blur', function () { state.kbFocus = false; requestDraw(); });
  cv.addEventListener('keydown', function (e) {
    const n = state.n;
    let used = true;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') state.focus = Math.min(n - 1, state.focus + 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') state.focus = Math.max(0, state.focus - 1);
    else if (e.key === 'Home') state.focus = n - 1;
    else if (e.key === 'End') state.focus = 0;
    else if (e.key === ' ' || e.key === 'Enter') { toggleBit(state.focus, 'toggle'); requestDraw(); e.preventDefault(); return; }
    else if (e.key === '+' || e.key === '=') { if (opsAllowed()) doInc('inc'); }
    else if (e.key === '-') { if (opsAllowed()) doDec(); }
    else if (e.key === 'Escape') { cv.blur(); }
    else used = false;
    if (used) {
      e.preventDefault();
      if (/Arrow|Home|End/.test(e.key)) say(T('第 ' + state.focus + ' 位（位值 ' + intText(Math.pow(2, state.focus)) + '）：' + (B.bit(state.v, state.focus) ? '亮' : '暗'), 'Bit ' + state.focus + ' (worth ' + intText(Math.pow(2, state.focus)) + '): ' + (B.bit(state.v, state.focus) ? 'on' : 'off')));
      requestDraw();
    }
  });

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.BinaryLab = {
    state: state,
    set: function (v) { setValue(B.wrap(v, state.n), 'type10', {}); },
    bits: function (n) { if (window.LabNum) window.LabNum.set(elN, n); else elN.value = n; elN.dispatchEvent(new Event('input')); },
    base: function (b) { if (window.LabNum) window.LabNum.set(elB, b); else elB.value = b; elB.dispatchEvent(new Event('input')); },
    seed: function (s) { qrand = B.rng(s); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    $('sumEq')._tex = ''; $('baseEq')._tex = '';
    updateReadouts();
    renderLadder();
    renderRounds();
    updateSoundButton();
    if (state.auto) setAuto(true);
    requestDraw();
  }
  readColors();
  state.n = readN();
  state.b = Math.max(2, Math.min(16, Math.round(val(elB))));
  state.rate = Math.max(1, Math.round(val(elRate)));
  $('rateo').textContent = String(state.rate);
  state.show.place = $('showPlace').checked; state.show.hex = $('showHex').checked; state.show.oct = $('showOct').checked;
  updateReadouts();
  renderRounds();
  updateSoundButton();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) setAuto(false); });
  resize();
})();
