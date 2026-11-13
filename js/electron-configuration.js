/*
 * electron-configuration.js — 「電子組態」的頁面程式（軌域圖、逐一填入動畫、自己填、週期表選元素、圖表、紀錄、3D 切換、任務事件）
 * 化學核心在 js/electron-configuration-core.js（ECCore）；3D 能階階梯在 js/electron-configuration-3d.js（EC3D）。
 * 畫面只「讀」核心算出的組態；軌域圖上下的位置代表 n + l 規則的填入順序（示意，不是真實能量）。
 *
 * 任務事件（只在使用者操作之後送出）：
 *   'species'：換了原子或離子 { Z, q, N（電子數）, unpaired, exception（中性且是例外）, noble（組態等於哪個鈍氣，否則 0）, iso（看過的、電子數相同的粒子種數） }
 *   'fill'：「逐一填入」自己播完 { Z, q, N }
 *   'build'：自己填時每放一個或擦掉一個電子 { Z, q, N, count, ground, occMatch, hundOK, aufbauOK, key（'1s2 2s2 …'）, unpaired,
 *            fromGround（這一盤在這一步之前曾經填出基態） }
 *   'pauli'：自己填時想把同自旋的第二個電子放進同一個軌域 { Z, q }
 *   'view3d'：3D 能階階梯開啟成功 {}
 */
(function () {
  'use strict';
  const E = window.ECCore, LD = window.LabDraw;
  if (!E || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const isEn = function () { return T('0', '1') === '1'; };
  const reducedMotion = LD.reducedMotion();
  const NS = E.NS, SUB = E.SUB, LL = E.LL;

  // 每個副層屬於哪一個「週期段」（ns 開始、np 結束）
  const ROWP = [];
  (function () { let p = 0; SUB.forEach(function (s) { if (s.l === 0) p = s.n; ROWP.push(p); }); })();
  function blockEnd(p) { let e = 0; for (let i = 0; i < NS; i++) if (ROWP[i] <= p) e = i; return e; }

  // ======================= 文字 =======================
  function chargeTxt(q) { if (!q) return ''; const a = Math.abs(q); return (a > 1 ? String(a) : '') + (q > 0 ? '+' : '−'); }
  function spHTML(Z, q) { return E.SYM[Z - 1] + (q ? '<sup>' + chargeTxt(q) + '</sup>' : ''); }
  function elName(Z) { return T(E.ZH[Z - 1], E.EN[Z - 1]); }
  function spName(Z, q) {
    if (!q) return elName(Z);
    return T(E.ZH[Z - 1] + '離子', E.EN[Z - 1] + ' ion');
  }
  function cfgHTML(occ, short) {
    const f = short ? E.shortForm(occ) : { core: null, tokens: E.tokens(occ) };
    if (!f.core && !f.tokens.length) return T('（沒有電子）', '(no electrons)');
    return (f.core ? '[' + f.core + '] ' : '') + f.tokens.map(function (t) { return '<span class="nw">' + t[0] + LL[t[1]] + '<sup>' + t[2] + '</sup></span>'; }).join(' ');
  }
  function qTxt(q) { return q > 0 ? '+' + q : q < 0 ? '−' + (-q) : '0'; }

  // ======================= 顏色 =======================
  let col = {};
  const BLOCK_HUE = { s: '#e8735a', p: '#4f9fd6', d: '#e3b84a', f: '#ac7fd8' };
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk
    };
    col.up = col.neg; col.down = col.pos;
  }
  function blockColor(b) { const h = BLOCK_HUE[b]; return col.dark ? LD.mix(h, '#1b1d22', 0.35) : LD.mix(h, '#ffffff', 0.38); }
  function lum(c) { const r = LD.rgb(c); return (0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]) / 255; }
  function inkOn(bg) { return lum(bg) > 0.55 ? '#1d2228' : '#f5f6f8'; }
  function font(px, weight) { return (weight || '') + ' ' + px.toFixed(1) + 'px ' + LD.FONT; }

  // ======================= 狀態 =======================
  const state = { Z: 8, q: 0, mode: 'auto', view: '2d', tab: 'unp', ghost: false, tool: 0, core: false };
  let shown = E.boxesOf(E.config(state.Z, state.q));   // 自動填入：畫面上的軌域圖（動畫中是一部分）
  let build = E.emptyBoxes();                          // 自己填：學生的軌域圖
  let anim = { on: false, steps: [], k: 0, next: 0, dt: 200 };
  let flyers = [];                                     // 飛行中的電子（純畫面效果）
  let flash = null;                                    // 包立的紅色閃爍 { s, o, until }
  let cursor = { s: 0, o: 0 };                         // 鍵盤游標（自己填）
  let stepNote = '';                                   // 動畫中畫在左上角的說明
  const record = [];                                   // 看過的粒子（最新在前）
  const seen = new Set();                              // 'Z,q'
  let userActed = false;
  let view3 = null;
  function acted() { userActed = true; }
  function emit(type, data) { if (userActed && window.LabMission) window.LabMission.emit(type, data); }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function target() { return E.config(state.Z, state.q); }
  function Nnow() { return state.Z - state.q; }
  function disp() { return state.mode === 'build' ? build : shown; }
  function occOf(b) { return b.map(function (r) { return r.reduce(function (a, o) { return a + o[0] + o[1]; }, 0); }); }

  const cv = $('cv'), ctx = cv.getContext('2d');
  const ptcv = $('ptcv'), pctx = ptcv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const zIn = $('zIn'), qIn = $('qIn');
  let kb = null;

  // ======================= 軌域圖版面 =======================
  let cw = 0, chh = 0, dpr = 1, LY = null;
  function rowsLast() {
    let P = ROWP[Math.max(0, E.highest(target()))];
    const hb = E.highest(occOf(disp()));
    if (hb >= 0) P = Math.max(P, ROWP[hb]);
    return blockEnd(Math.min(7, P + 1));
  }
  function layout() {
    const narrow = cw < 520;
    const pad = narrow ? 8 : 12, axisW = narrow ? 20 : 26;
    const last = rowsLast();
    let maxM = 3;
    for (let i = 0; i <= last; i++) maxM = Math.max(maxM, SUB[i].m);
    ctx.font = font(14, '700'); const labW = Math.ceil(ctx.measureText('4f').width) + 14;
    ctx.font = font(11); const cntW = Math.ceil(ctx.measureText('14 / 14').width) + 12;
    const bandW = Math.ceil(ctx.measureText(T('第 7 週期', 'Period 7')).width) + 10;
    let bw = Math.floor((cw - 2 * pad - axisW - labW - cntW - bandW) / maxM);
    bw = Math.max(22, Math.min(42, bw));
    const bh = Math.round(bw * 0.84);
    const rowGap = Math.round(bh + (narrow ? 8 : 10));
    const blkGap = narrow ? 10 : 14;
    const top = pad + 26;
    let nBlk = 0; for (let i = 1; i <= last; i++) if (ROWP[i] !== ROWP[i - 1]) nBlk++;
    chh = Math.round(top + (last + 1) * rowGap + nBlk * blkGap + pad);
    const rowY = [];
    let y = chh - pad;
    for (let i = 0; i <= last; i++) {
      if (i > 0 && ROWP[i] !== ROWP[i - 1]) y -= blkGap;
      y -= rowGap;
      rowY[i] = y + (rowGap - bh) / 2;
    }
    const x0 = pad + axisW + labW;
    LY = { narrow: narrow, pad: pad, axisW: axisW, labW: labW, bw: bw, bh: bh, rowGap: rowGap, rowY: rowY, last: last, x0: x0, cntX: x0 + maxM * bw + 8, top: top };
  }
  function boxRect(s, o) { return { x: LY.x0 + o * LY.bw + 1, y: LY.rowY[s], w: LY.bw - 2, h: LY.bh }; }
  function slotXY(s, o, spin) { const r = boxRect(s, o); return [r.x + r.w * (spin ? 0.68 : 0.32), r.y + r.h / 2]; }
  function hitBox(x, y) {
    if (!LY) return null;
    for (let s = 0; s <= LY.last; s++) {
      const y0 = LY.rowY[s];
      if (y < y0 - 4 || y > y0 + LY.bh + 4) continue;
      for (let o = 0; o < SUB[s].m; o++) { const r = boxRect(s, o); if (x >= r.x - 1 && x <= r.x + r.w + 1) return { s: s, o: o, half: x < r.x + r.w / 2 ? 0 : 1 }; }
    }
    return null;
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    layout();
    if (cv.style.height !== chh + 'px') cv.style.height = chh + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
    resizePT(); resizeGraph();
    draw(); drawPT(); drawGraph();
  }
  /** 列數可能改變（換元素、放到更高的副層）時重新排版 */
  function relayout() {
    if (!cw) return;
    const old = LY ? LY.last : -1;
    layout();
    if (LY.last !== old || cv.style.height !== chh + 'px') {
      cv.style.height = chh + 'px';
      cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
    }
  }

  // ======================= 畫軌域圖 =======================
  function spinArrow(g, x, yc, L, up, color, ghost, a) {
    const y0 = yc + (up ? L / 2 : -L / 2), y1 = yc + (up ? -L / 2 : L / 2);
    g.save();
    g.globalAlpha = a == null ? 1 : a;
    if (ghost) {
      g.strokeStyle = LD.alpha(color, 0.75); g.lineWidth = 1.4; g.setLineDash([2.5, 2.5]); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
      g.setLineDash([]);
      const h = L * 0.3, d = up ? 1 : -1;
      g.beginPath(); g.moveTo(x - h * 0.55, y1 + d * h); g.lineTo(x, y1); g.lineTo(x + h * 0.55, y1 + d * h); g.stroke();
    } else LD.arrow(g, x, y0, x, y1, color, Math.max(1.9, L * 0.1));
    g.restore();
  }
  function draw() {
    if (!LY) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, cw, chh);
    const b = disp(), occ = occOf(b), last = LY.last;
    const Ptop = ROWP[Math.max(0, E.highest(target()))];
    const ghostOn = state.mode === 'auto' && state.ghost && !state.q && E.isException(state.Z) && !anim.on;
    const mad = ghostOn ? E.boxesOf(E.aufbau(state.Z)) : null;
    // 週期段的底色帶與名稱
    let i0 = 0;
    for (let i = 0; i <= last; i++) {
      if (i === last || ROWP[i + 1] !== ROWP[i]) {
        const p = ROWP[i], yt = LY.rowY[i] - 5, yb = LY.rowY[i0] + LY.bh + 5;
        g.save();
        g.fillStyle = LD.alpha(col.accent, (p % 2 ? 0.05 : 0.025) * (col.dark ? 1.6 : 1));
        LD.roundRect(g, LY.pad + LY.axisW - 4, yt, cw - LY.pad * 2 - LY.axisW + 4, yb - yt, 8); g.fill();
        g.fillStyle = LD.alpha(col.muted, p > Ptop ? 0.6 : 1); g.font = font(11); g.textAlign = 'right'; g.textBaseline = 'middle';
        g.fillText(T('第 ' + p + ' 週期', 'Period ' + p), cw - LY.pad - 4, (yt + yb) / 2);
        g.restore();
        i0 = i + 1;
      }
    }
    // 能量軸（示意）
    const ax = LY.pad + LY.axisW * 0.45, yb0 = chh - LY.pad - 2, yt0 = LY.top - 4;
    LD.arrow(g, ax, yb0, ax, yt0, LD.alpha(col.muted, 0.9), 1.6);
    g.save();
    g.translate(ax - 2, (yb0 + yt0) / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = col.muted; g.font = font(11); g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(T('能量（填入順序，示意）', 'Energy (filling order, schematic)'), 0, -3);
    g.restore();
    // 副層列
    for (let s = 0; s <= last; s++) {
      const S = SUB[s], y = LY.rowY[s];
      const faded = ROWP[s] > Ptop && !occ[s];
      const a = faded ? 0.45 : 1;
      g.save();
      g.globalAlpha = a;
      g.fillStyle = col.text; g.font = font(14, '700'); g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(S.label, LY.x0 - 8, y + LY.bh / 2);
      const diff = ghostOn && occOf(mad)[s] !== occ[s];
      for (let o = 0; o < S.m; o++) {
        const r = boxRect(s, o), e = b[s][o], n = e[0] + e[1];
        const base = col.dark ? LD.mix(col.surface, '#ffffff', 0.04) : col.surface;
        const fill = n === 2 ? LD.mix(base, col.accent, col.dark ? 0.2 : 0.12) : n === 1 ? LD.mix(base, col.accent, col.dark ? 0.1 : 0.05) : base;
        g.fillStyle = fill;
        LD.roundRect(g, r.x, r.y, r.w, r.h, 3); g.fill();
        const lg = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        lg.addColorStop(0, 'rgba(255,255,255,' + (col.dark ? 0.06 : 0.5) + ')');
        lg.addColorStop(1, 'rgba(0,0,0,' + (col.dark ? 0.18 : 0.06) + ')');
        g.fillStyle = lg; LD.roundRect(g, r.x, r.y, r.w, r.h, 3); g.fill();
        g.strokeStyle = LD.alpha(col.text, col.dark ? 0.35 : 0.3); g.lineWidth = 1;
        LD.roundRect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 3); g.stroke();
        const L = r.h * 0.68;
        if (mad) {
          const m = mad[s][o];
          if (m[0] && !e[0]) spinArrow(g, r.x + r.w * 0.32, r.y + r.h / 2, L, true, col.muted, true);
          if (m[1] && !e[1]) spinArrow(g, r.x + r.w * 0.68, r.y + r.h / 2, L, false, col.muted, true);
        }
        if (e[0]) spinArrow(g, r.x + r.w * 0.32, r.y + r.h / 2, L, true, col.up);
        if (e[1]) spinArrow(g, r.x + r.w * 0.68, r.y + r.h / 2, L, false, col.down);
        if (flash && flash.s === s && flash.o === o) {
          const u = reducedMotion ? 1 : Math.max(0, (flash.until - performance.now()) / 700);
          g.strokeStyle = LD.alpha(col.pos, 0.35 + 0.65 * u); g.lineWidth = 3;
          LD.roundRect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 5); g.stroke();
        }
      }
      if (diff) {
        g.save(); g.strokeStyle = LD.alpha(col.pos, 0.85); g.lineWidth = 1.6; g.setLineDash([5, 3]);
        LD.roundRect(g, LY.x0 - 3, y - 3, S.m * LY.bw + 4, LY.bh + 6, 6); g.stroke(); g.restore();
      }
      g.font = font(11); g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = occ[s] === S.cap ? col.muted : occ[s] ? col.accent : LD.alpha(col.muted, 0.7);
      g.fillText(occ[s] + ' / ' + S.cap, Math.min(LY.cntX, LY.x0 + S.m * LY.bw + 8), y + LY.bh / 2);
      g.restore();
    }
    // 動畫中正要放電子的格子
    if (anim.on && anim.k < anim.steps.length) {
      const st = anim.steps[anim.k], s2 = st.type === 'move' ? st.s2 : st.s, o2 = st.type === 'move' ? st.o2 : st.o;
      if (s2 <= last) { const r = boxRect(s2, o2); g.save(); g.strokeStyle = LD.alpha(col.accent, 0.55); g.lineWidth = 2; g.setLineDash([3, 3]); LD.roundRect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 5); g.stroke(); g.restore(); }
    }
    // 飛行中的電子
    const now = performance.now();
    flyers.forEach(function (f) {
      const u = Math.max(0, Math.min(1, (now - f.t0) / f.dur)), e = 1 - Math.pow(1 - u, 3);
      const x = f.x0 + (f.x1 - f.x0) * e, yy = f.y0 + (f.y1 - f.y0) * e - (f.arc ? Math.sin(Math.PI * e) * f.arc : 0);
      spinArrow(g, x, yy, LY.bh * 0.68, !f.spin, f.spin ? col.down : col.up, false, f.out ? 1 - u : 1);
    });
    // 鍵盤游標
    if (state.mode === 'build' && kb && kb.focused && kb.focused() && cursor.s <= last) {
      const r = boxRect(cursor.s, cursor.o);
      g.save(); g.strokeStyle = col.accent; g.lineWidth = 2; g.setLineDash([4, 3]);
      LD.roundRect(g, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 6); g.stroke(); g.restore();
    }
    // 左上角：粒子與進度
    const head = anim.on || stepNote ? stepNote : E.SYM[state.Z - 1] + (state.q ? T('（電荷 ' + qTxt(state.q) + '）', ' (charge ' + qTxt(state.q) + ')') : '') + T('：' + Nnow() + ' 個電子', ': ' + Nnow() + ' electrons');
    LD.pill(g, head, LY.pad + LY.axisW + 2, LY.pad + 15, col.text, 'left', '600 12px ' + LD.FONT);
  }

  // ======================= 逐一填入 =======================
  let raf = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (document.hidden) { if (anim.on || flyers.length) setTimeout(kick, 250); return; }
    if (anim.on && now >= anim.next) stepAnim(now);
    let more = anim.on;
    if (flyers.length) {
      const keep = [];
      flyers.forEach(function (f) { if (now >= f.t0 + f.dur) land(f); else keep.push(f); });
      flyers = keep;
      if (flyers.length) more = true;
    }
    if (flash) { if (now < flash.until) more = true; else flash = null; }
    if (state.view === '2d') draw();
    if (more) kick();
  }
  function land(f) {
    if (f.land) { E.apply(shown, f.land); afterShownChange(); }
  }
  function stopAnim() {
    anim.on = false;
    flyers.forEach(land);
    flyers = [];
    stepNote = '';
  }
  function startFill() {
    acted();
    stopAnim();
    const st = E.steps(state.Z, state.q);
    shown = E.emptyBoxes();
    anim = { on: true, steps: st, k: 0, next: performance.now() + 350, dt: Math.max(70, Math.min(330, 7000 / Math.max(1, st.length))), lastPhase: null };
    stepNote = T('從空的原子開始', 'Starting from an empty atom');
    setStatus(T('照構築原理，一個一個放進 ' + state.Z + ' 個電子…', 'Following the aufbau principle, ' + state.Z + ' electrons go in one by one…'));
    refresh();
    kick();
  }
  function stepAnim(now) {
    if (anim.k >= anim.steps.length) { finishFill(); return; }
    const st = anim.steps[anim.k++];
    const nAdd = anim.steps.slice(0, anim.k).filter(function (x) { return x.type === 'add'; }).length;
    const dur = reducedMotion ? 0 : Math.min(300, anim.dt * 0.9);
    const spinTxt = function (sp) { return sp ? '↓' : '↑'; };
    if (st.phase !== anim.lastPhase) {
      if (st.phase === 'exception') setStatus(T('例外！真實的' + elName(state.Z) + '原子不照 n + l 規則：有電子要搬家。', 'An exception! The real ' + elName(state.Z).toLowerCase() + ' atom does not follow the n + l rule: some electrons move.'));
      else if (st.phase === 'ionize') setStatus(T('變成陽離子：先拿走 n 最大的電子。', 'Becoming a cation: the electrons with the largest n leave first.'));
      else if (st.phase === 'anion') setStatus(T('變成陰離子：多的電子照 n + l 規則放進下一個空位。', 'Becoming an anion: the extra electrons go into the next empty places by the n + l rule.'));
      anim.lastPhase = st.phase;
    }
    if (st.type === 'add') {
      stepNote = T('第 ' + nAdd + ' 個電子 → ' + SUB[st.s].label + ' ' + spinTxt(st.spin), 'Electron ' + nAdd + ' → ' + SUB[st.s].label + ' ' + spinTxt(st.spin));
      relayoutFor(st.s);
      if (dur) { const p = slotXY(st.s, st.o, st.spin); flyers.push({ x0: cw - LY.pad - 20, y0: LY.top - 6, x1: p[0], y1: p[1], t0: now, dur: dur, spin: st.spin, land: st }); }
      else { E.apply(shown, st); afterShownChange(); }
      if (snd()) window.LabSound.tone({ freq: 330 + 32 * st.s + (st.spin ? 0 : 18), dur: 0.07, gain: 0.045, type: st.spin ? 'triangle' : 'sine' });
    } else if (st.type === 'remove') {
      stepNote = T('拿走一個 ' + SUB[st.s].label + ' 電子', 'Removing a ' + SUB[st.s].label + ' electron');
      const p = slotXY(st.s, st.o, st.spin);
      E.apply(shown, st); afterShownChange();
      if (dur) flyers.push({ x0: p[0], y0: p[1], x1: cw - LY.pad - 10, y1: LY.top - 10, t0: now, dur: dur * 1.4, spin: st.spin, out: true });
      if (snd()) window.LabSound.sweep({ from: 760, to: 420, dur: 0.16, gain: 0.05, type: 'triangle' });
    } else {
      stepNote = T('一個 ' + SUB[st.s].label + ' 電子搬到 ' + SUB[st.s2].label, 'A ' + SUB[st.s].label + ' electron moves to ' + SUB[st.s2].label);
      const p0 = slotXY(st.s, st.o, st.spin), p1 = slotXY(st.s2, st.o2, st.spin2);
      E.apply(shown, { type: 'remove', s: st.s, o: st.o, spin: st.spin }); afterShownChange();
      const ad = { type: 'add', s: st.s2, o: st.o2, spin: st.spin2 };
      if (dur) flyers.push({ x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], arc: 40, t0: now, dur: Math.max(dur, 520), spin: st.spin2, land: ad });
      else { E.apply(shown, ad); afterShownChange(); }
      if (snd()) window.LabSound.sweep({ from: 480, to: 960, dur: 0.3, gain: 0.06, type: 'sine' });
    }
    const nx = anim.steps[anim.k];
    const slow = st.phase === 'exception' || (nx && nx.phase !== st.phase) ? 4 : st.phase === 'ionize' ? 2.5 : 1;
    anim.next = now + anim.dt * slow;
  }
  function relayoutFor(s) { if (LY && s > LY.last) { relayout(); } }
  function afterShownChange() { if (state.mode === 'auto') { updateCfgLine(); if (view3) view3.update(); } }
  function finishFill() {
    anim.on = false;
    flyers.forEach(land); flyers = [];
    shown = E.boxesOf(target());
    stepNote = '';
    setStatus(T('填好了：' + spHTML(state.Z, state.q) + ' 的基態，共 ' + Nnow() + ' 個電子、' + E.unpaired(target()) + ' 個未成對電子。',
      'Done: the ground state of ' + spHTML(state.Z, state.q) + ', ' + Nnow() + ' electrons, ' + E.unpaired(target()) + ' unpaired.'));
    if (snd()) { window.LabSound.tone({ freq: 659, dur: 0.1, gain: 0.07 }); window.LabSound.tone({ freq: 988, dur: 0.18, gain: 0.07, delay: 0.11 }); }
    emit('fill', { Z: state.Z, q: state.q, N: Nnow() });
    refresh();
  }
  function fillAll() {
    acted();
    stopAnim();
    shown = E.boxesOf(target());
    setStatus(T('一次填好：' + spHTML(state.Z, state.q) + ' 的基態。', 'Filled at once: the ground state of ' + spHTML(state.Z, state.q) + '.'));
    refresh();
  }

  // ======================= 自己填 =======================
  let groundSeen = false;   // 這一盤曾經填出基態（清空重填、換粒子就歸零）
  function resetBuild() {
    const g = state.core ? E.buildCore(state.Z, state.q) : 0;
    build = g ? E.boxesOf(E.aufbau(g)) : E.emptyBoxes();
    groundSeen = false;
  }
  function buildEval() { return E.evaluate(build, state.Z, state.q); }
  function place(s, o, tool) {
    if (state.mode !== 'build' || s > NS - 1 || o >= SUB[s].m) return;
    acted();
    const box = build[s][o];
    const r0 = buildEval();
    if (tool === 2) {
      if (box[1]) box[1] = 0; else if (box[0]) box[0] = 0; else return;
      if (snd()) window.LabSound.tone({ freq: 300, dur: 0.06, gain: 0.04, type: 'triangle' });
    } else {
      if (box[tool]) {
        flash = { s: s, o: o, until: performance.now() + 700 };
        setBuildMsg(T('包立不相容原理：同一個軌域裡的兩個電子，自旋必須相反。這一格已經有一個' + (tool ? '↓' : '↑') + '了。',
          'Pauli exclusion principle: the two electrons in one orbital must have opposite spins. This box already has a' + (tool ? ' ↓' : 'n ↑') + '.'), 'bad');
        if (snd()) window.LabSound.tone({ freq: 262, dur: 0.18, gain: 0.07, type: 'square' });
        emit('pauli', { Z: state.Z, q: state.q });
        kick();
        return;
      }
      if (r0.count >= r0.N) {
        setBuildMsg(T(spHTML(state.Z, state.q) + ' 只有 ' + r0.N + ' 個電子，已經放滿了。要改就先擦掉一個。',
          spHTML(state.Z, state.q) + ' has only ' + r0.N + ' electrons, and they are all placed. Erase one first to change it.'), 'bad');
        return;
      }
      box[tool] = 1;
      if (snd()) window.LabSound.tone({ freq: tool ? 440 : 523, dur: 0.07, gain: 0.05, type: 'sine' });
    }
    relayout();
    const r = buildEval();
    showBuildMsg(r);
    if (r.ground && snd()) { window.LabSound.tone({ freq: 659, dur: 0.1, gain: 0.07, delay: 0.08 }); window.LabSound.tone({ freq: 988, dur: 0.2, gain: 0.07, delay: 0.19 }); }
    emit('build', { Z: state.Z, q: state.q, N: r.N, count: r.count, ground: r.ground, occMatch: r.occMatch, hundOK: r.hundOK, aufbauOK: r.aufbauOK, key: r.key, unpaired: r.unpaired, fromGround: groundSeen });
    if (r.ground) groundSeen = true;
    refresh();
  }
  function setBuildMsg(html, cls) { const m = $('buildMsg'); m.innerHTML = html; m.className = 'buildmsg' + (cls ? ' ' + cls : ''); }
  function labels(list) { return list.map(function (i) { return SUB[i].label; }).join(T('、', ', ')); }
  function showBuildMsg(r) {
    r = r || buildEval();
    const nm = spHTML(state.Z, state.q);
    if (!r.N) { setBuildMsg(T(nm + ' 沒有電子，不用填。', nm + ' has no electrons to place.'), ''); return; }
    if (!r.count) { setBuildMsg(T('點軌域的格子放電子。目標：' + nm + '，共 ' + r.N + ' 個電子。', 'Tap the boxes to place electrons. Goal: ' + nm + ', ' + r.N + ' electrons.'), ''); return; }
    if (r.count < r.N) {
      const early = r.hundBad.filter(function (i) { const b = build[i]; return b.some(function (o) { return !o[0] && !o[1]; }) && b.some(function (o) { return o[0] && o[1]; }); });
      let s = T('已放 ' + r.count + ' 個，還差 ' + (r.N - r.count) + ' 個。', r.count + ' placed, ' + (r.N - r.count) + ' to go.');
      if (early.length) s += T('提醒：' + labels(early) + ' 還有空的軌域，電子卻先配對了（洪德定則）。', ' Note: ' + labels(early) + ' still has an empty orbital, yet electrons have paired (Hund\'s rule).');
      setBuildMsg(s, early.length ? 'bad' : '');
      return;
    }
    if (r.ground) { setBuildMsg(T('✓ 這就是 ' + nm + ' 的基態！未成對電子 ' + r.unpaired + ' 個。', '✓ This is the ground state of ' + nm + '! ' + r.unpaired + ' unpaired electron' + (r.unpaired === 1 ? '' : 's') + '.'), 'ok'); return; }
    if (r.occMatch) {
      setBuildMsg(T('每個副層的電子數都對了，但 ' + labels(r.hundBad) + ' 違反洪德定則：電子要先一格一個、自旋平行，放滿一輪才配對。',
        'Every subshell has the right number of electrons, but ' + labels(r.hundBad) + ' breaks Hund\'s rule: one per orbital with parallel spins first, then pairing.'), 'bad');
      return;
    }
    const madN = E.key(E.aufbau(r.N)) === r.key;
    if (state.q > 0 && madN) {
      setBuildMsg(T('這是「' + r.N + ' 個電子照 n + l 規則填」的結果，但陽離子是原子失去電子而來：先失去的是 n 最大的電子。',
        'This is what ' + r.N + ' electrons give by the n + l rule, but a cation comes from an atom that loses electrons: the ones with the largest n go first.'), 'bad');
      return;
    }
    if (!state.q && E.isException(state.Z) && madN) {
      setBuildMsg(T('照構築原理確實是這樣填，但 ' + nm + ' 是例外，真實的基態不一樣。到「自動填入」看看。',
        'This is exactly what the aufbau principle predicts, but ' + nm + ' is an exception: its real ground state is different. Check it in “Watch it fill”.'), 'bad');
      return;
    }
    if (!r.aufbauOK) {
      setBuildMsg(T('電子數對了，但這是激發態：還有能量較低的副層沒填滿，電子就放到了較高的副層。',
        'The number is right, but this is an excited state: a lower subshell is not full, yet an electron sits in a higher one.'), 'bad');
      return;
    }
    setBuildMsg(T('電子數對了，但不是 ' + nm + ' 的基態。', 'The number is right, but this is not the ground state of ' + nm + '.'), 'bad');
  }

  // ======================= 文字讀數 =======================
  function updateCfgLine() {
    const el = $('cfgLine');
    if (state.mode === 'build') {
      el.innerHTML = '<span class="lbl">' + T('你填的', 'Your diagram') + '</span>' + cfgHTML(occOf(build), false);
      return;
    }
    const occ = occOf(shown);
    let h = '<span class="lbl">' + T('電子組態', 'Configuration') + '</span>' + cfgHTML(occ, false);
    if (!anim.on && E.total(occ)) h += '<br><span class="lbl">' + T('簡寫', 'Short form') + '</span>' + cfgHTML(occ, true);
    if (state.ghost && !state.q && E.isException(state.Z) && !anim.on) {
      h += '<br><span class="ghost">' + T('構築原理的預測：', 'Aufbau prediction: ') + cfgHTML(E.aufbau(state.Z), true) + '</span>';
    }
    el.innerHTML = h;
  }
  function updateOut() {
    const Z = state.Z, q = state.q, occ = target(), N = Nnow(), u = E.unpaired(occ), p = E.pos(Z);
    $('elSym').innerHTML = spHTML(Z, q);
    $('elSym').style.background = blockColor(E.block(Z));
    $('elSym').style.color = inkOn(blockColor(E.block(Z)));
    $('elName').textContent = spName(Z, q);
    $('elSub').textContent = T('原子序 ' + Z + '・' + N + ' 個電子', 'Atomic number ' + Z + ' · ' + N + ' electron' + (N === 1 ? '' : 's'));
    const rows = [];
    const row = function (dt, dd, cls) { rows.push('<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'); };
    row(T('電子數', 'Electrons'), N + (q ? T('（' + Z + ' ' + (q > 0 ? '−' : '+') + ' ' + Math.abs(q) + '）', ' (' + Z + ' ' + (q > 0 ? '−' : '+') + ' ' + Math.abs(q) + ')') : ''));
    row(T('基態組態', 'Ground state'), cfgHTML(occ, true));
    row(T('未成對電子', 'Unpaired electrons'), String(u));
    row(T('磁性', 'Magnetism'), u ? T('順磁性（會被磁鐵吸引）', 'paramagnetic (attracted by a magnet)') : T('反磁性', 'diamagnetic'));
    row(T('週期、族', 'Period, group'), p.period + T('、', ', ') + (p.group ? p.group : (Z <= 71 ? T('鑭系', 'lanthanide') : T('錒系', 'actinide'))));
    row(T('區塊', 'Block'), E.block(Z) + T(' 區', '-block'));
    if (!q) { const v = E.valence(Z); if (v != null) row(T('價電子數', 'Valence electrons'), String(v)); }
    const ng = E.nobleMatch(occ);
    if (ng && (q || ng !== Z)) row(T('等電子', 'Isoelectronic with'), E.SYM[ng - 1] + T('（鈍氣）', ' (noble gas)'));
    if (!q && E.isException(Z)) row(T('構築原理的預測', 'Aufbau prediction'), cfgHTML(E.aufbau(Z), true) + T('（例外）', ' (exception)'));
    if (E.isPredicted(Z)) row(T('附註', 'Note'), T('理論預測', 'theoretical prediction'));
    $('out').innerHTML = rows.join('');
  }
  function updateLegend() {
    const up = '<b style="color:' + col.up + '">↑</b> ', dn = '<b style="color:' + col.down + '">↓</b> ';
    let h = '<span>' + up + T('自旋向上', 'spin up') + '（m<sub>s</sub> = +½）</span><span>' + dn + T('自旋向下', 'spin down') + '（m<sub>s</sub> = −½）</span>';
    if (isEn()) h = h.replace(/（/g, ' (').replace(/）/g, ')');
    if (state.mode === 'auto' && state.ghost) h += '<span><i class="sp" style="border:2px dashed ' + col.pos + ';background:transparent"></i>' + T('和構築原理的預測不同（虛線箭頭是預測）', 'differs from the aufbau prediction (dashed arrows)') + '</span>';
    $('legend').innerHTML = h;
    $('stageHint').textContent = state.mode === 'build'
      ? T('選「放 ↑」或「放 ↓」，再點格子放電子；選「擦掉」再點格子拿走電子。用鍵盤時先選取畫布：方向鍵移動游標，按 Enter 切到「放電子」，再按 ↑ 放 ↑、↓ 放 ↓、← 或 → 擦掉。',
        'Choose “Up” or “Down” and tap a box to place an electron; choose “Erase” and tap to remove one. With a keyboard, select the canvas: the arrow keys move the cursor, Enter switches to “place”, then ↑ places ↑, ↓ places ↓, ← or → erases.')
      : T('每一列是一個副層，每一格是一個軌域。越上面的副層越晚填（n + l 規則）。用鍵盤時先選取畫布：← → 換元素、↑ ↓ 換電荷。',
        'Each row is a subshell and each box an orbital. Higher rows fill later (n + l rule). With a keyboard, select the canvas: ← → change the element, ↑ ↓ change the charge.');
  }
  function setStatus(s) { $('status').innerHTML = s || ''; }

  // ======================= 選元素 =======================
  function syncSliders() {
    const r = E.chargeRange(state.Z);
    if (window.LabNum) { window.LabNum.clear(zIn); window.LabNum.clear(qIn); }
    zIn.value = String(state.Z);
    qIn.min = String(r.min); qIn.max = String(r.max);
    qIn.value = String(state.q);
    $('zOut').textContent = String(state.Z);
    $('qOut').textContent = qTxt(state.q);
  }
  function setSpecies(Z, q, how) {
    Z = Math.max(1, Math.min(E.N, Math.round(Z)));
    q = E.clampQ(Z, q);
    const changed = Z !== state.Z || q !== state.q;
    state.Z = Z; state.q = q;
    syncSliders();
    if (!changed) return;
    stopAnim();
    shown = E.boxesOf(target());
    resetBuild();
    setStatus(how === 'clampQ' ? T(elName(Z) + '在這裡可選的電荷是 ' + qTxt(E.chargeRange(Z).min) + ' 到 ' + qTxt(E.chargeRange(Z).max) + '。', 'For ' + elName(Z).toLowerCase() + ', the charge can be from ' + qTxt(E.chargeRange(Z).min) + ' to ' + qTxt(E.chargeRange(Z).max) + '.') : '');
    if (snd()) window.LabSound.tone({ freq: 300 + 6 * Math.min(Z, 100), dur: 0.08, gain: 0.05, type: 'sine' });
    relayout();
    if (state.mode === 'build') showBuildMsg();
    refresh();
    report();
  }
  function report() {
    const key = state.Z + ',' + state.q, N = Nnow();
    if (!seen.has(key)) seen.add(key);
    for (let k = record.length - 1; k >= 0; k--) if (record[k].Z === state.Z && record[k].q === state.q) record.splice(k, 1);
    record.unshift({ Z: state.Z, q: state.q, N: N });
    if (record.length > 14) record.length = 14;
    renderRecord();
    const occ = target();
    emit('species', { Z: state.Z, q: state.q, N: N, unpaired: E.unpaired(occ), exception: !state.q && E.isException(state.Z), noble: E.nobleMatch(occ), iso: isoCount(N) });
  }
  function isoCount(N) { let c = 0; seen.forEach(function (k) { const a = k.split(','); if (+a[0] - +a[1] === N) c++; }); return c; }
  function renderRecord() {
    const t = $('recTbl'), N = Nnow();
    let h = '<thead><tr><th>' + T('粒子', 'Species') + '</th><th>' + T('電子數', 'Electrons') + '</th><th style="text-align:left">' + T('組態', 'Configuration') + '</th><th>' + T('未成對', 'Unpaired') + '</th></tr></thead><tbody>';
    if (!record.length) h += '<tr class="empty"><td colspan="4">' + T('還沒有紀錄。換一個原子或離子試試。', 'Nothing yet. Choose an atom or ion.') + '</td></tr>';
    record.forEach(function (r) {
      const occ = E.config(r.Z, r.q);
      h += '<tr' + (r.N === N && userActed ? ' class="iso"' : '') + '><td>' + spHTML(r.Z, r.q) + '</td><td>' + r.N + '</td><td class="l">' + cfgHTML(occ, true) + '</td><td>' + E.unpaired(occ) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
    const iso = []; seen.forEach(function (k) { const a = k.split(','); if (+a[0] - +a[1] === N) iso.push(spHTML(+a[0], +a[1])); });
    $('isoInfo').innerHTML = iso.length > 1 ? T('和 ' + spHTML(state.Z, state.q) + ' 一樣有 ' + N + ' 個電子的：' + iso.join('、') + '（' + iso.length + ' 種）',
      'With ' + N + ' electrons, like ' + spHTML(state.Z, state.q) + ': ' + iso.join(', ') + ' (' + iso.length + ')') : '';
  }
  function clearAll() {
    acted();
    record.length = 0; seen.clear();
    renderRecord();
    setStatus(T('已清除看過的紀錄。', 'The list has been cleared.'));
  }
  function findEl(s) {
    s = String(s || '').normalize('NFKC').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) { const z = +s; return z >= 1 && z <= E.N ? z : null; }
    const lo = s.toLowerCase();
    for (let Z = 1; Z <= E.N; Z++) if (E.SYM[Z - 1].toLowerCase() === lo) return Z;
    for (let Z = 1; Z <= E.N; Z++) if (E.EN[Z - 1].toLowerCase() === lo || E.ZH[Z - 1] === s || T(E.ZH[Z - 1], E.EN[Z - 1]) === s) return Z;
    for (let Z = 1; Z <= E.N; Z++) if (lo.length >= 3 && E.EN[Z - 1].toLowerCase().indexOf(lo) === 0) return Z;
    return null;
  }
  function goFind() {
    acted();
    const v = $('findEl').value, Z = findEl(v);
    if (Z == null) { setStatus(T('找不到「' + v + '」。請輸入元素符號（例如 Fe）、名稱或原子序（1–118）。', 'Could not find “' + v + '”. Type a symbol (such as Fe), a name or an atomic number (1–118).')); return; }
    setSpecies(Z, state.q);
  }

  // ======================= 小週期表 =======================
  let pw = 0, ph = 0, PL = null;
  function resizePT() {
    const w = ptcv.clientWidth;
    if (!w) return;
    pw = w;
    const pad = 4, cell = Math.min(30, (pw - 2 * pad) / 18), cellH = cell * 1.06, gap = cellH * 0.45;
    PL = { pad: pad, cell: cell, cellH: cellH, gap: gap, x0: (pw - cell * 18) / 2 };
    ph = Math.round(pad * 2 + cellH * 9 + gap);
    ptcv.style.height = ph + 'px';
    ptcv.width = Math.round(pw * dpr); ptcv.height = Math.round(ph * dpr);
  }
  function ptRect(Z) {
    const q = E.pos(Z), row = q.row <= 7 ? q.row - 1 : q.row - 2;
    const y = PL.pad + row * PL.cellH + (q.row > 7 ? PL.gap : 0);
    return { x: PL.x0 + (q.col - 1) * PL.cell + 0.75, y: y + 0.75, w: PL.cell - 1.5, h: PL.cellH - 1.5 };
  }
  function drawPT() {
    if (!PL) return;
    const g = pctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, pw, ph);
    for (let Z = 1; Z <= E.N; Z++) {
      const r = ptRect(Z), bg = blockColor(E.block(Z)), sel = Z === state.Z;
      g.fillStyle = bg;
      LD.roundRect(g, r.x, r.y, r.w, r.h, Math.min(3, PL.cell * 0.12)); g.fill();
      const lg = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      lg.addColorStop(0, 'rgba(255,255,255,' + (col.dark ? 0.08 : 0.25) + ')'); lg.addColorStop(1, 'rgba(0,0,0,' + (col.dark ? 0.12 : 0.05) + ')');
      g.fillStyle = lg; g.fill();
      if (PL.cell >= 14) {
        g.fillStyle = inkOn(bg); g.font = font(Math.max(6.5, Math.min(11, PL.cell * 0.4)), sel ? '800' : '600');
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(E.SYM[Z - 1], r.x + r.w / 2, r.y + r.h / 2 + 0.5);
      }
      if (E.isException(Z)) {
        g.fillStyle = col.dark ? '#ffffff' : '#1d2228';
        g.beginPath(); g.arc(r.x + r.w - 2.6, r.y + 2.6, Math.max(1.4, PL.cell * 0.08), 0, Math.PI * 2); g.fill();
      }
    }
    const r = ptRect(state.Z);
    g.save();
    g.shadowColor = LD.shadowInk(0.35); g.shadowBlur = 6;
    g.strokeStyle = col.accent; g.lineWidth = 2.5;
    LD.roundRect(g, r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 4); g.stroke();
    g.restore();
    // 鑭系、錒系位置記號
    g.fillStyle = col.muted; g.font = font(Math.max(6.5, Math.min(10, PL.cell * 0.36))); g.textAlign = 'center'; g.textBaseline = 'middle';
    [[6, '*'], [7, '**']].forEach(function (a) { g.fillText(a[1], PL.x0 + 2.5 * PL.cell, PL.pad + (a[0] - 0.5) * PL.cellH); });
    g.textAlign = 'right';
    g.fillText('*', PL.x0 + 2 * PL.cell - 2, PL.pad + 7.5 * PL.cellH + PL.gap);
    g.fillText('**', PL.x0 + 2 * PL.cell - 2, PL.pad + 8.5 * PL.cellH + PL.gap);
  }
  function hitPT(x, y) {
    if (!PL) return null;
    for (let Z = 1; Z <= E.N; Z++) { const r = ptRect(Z); if (x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1) return Z; }
    return null;
  }
  function updatePTLegend() {
    $('ptLegend').innerHTML = ['s', 'p', 'd', 'f'].map(function (b) { return '<span><i class="sp" style="background:' + blockColor(b) + '"></i>' + b + T(' 區', '-block') + '</span>'; }).join('') +
      '<span><b aria-hidden="true">•</b> ' + T('例外（不照 n + l 規則）', 'exception (breaks the n + l rule)') + '</span>';
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0, gHits = [];
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w;
    gh = w < 560 ? Math.round(Math.max(270, w * 0.8)) : 300;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function drawGraph() {
    if (!gw) return;
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, gw, gh);
    gHits = [];
    if (state.tab === 'unp') drawUnp(g); else drawOrder(g);
  }
  function drawUnp(g) {
    const PE = [2, 10, 18, 36, 54, 86, 118];
    const zmax = Math.max(36, PE[E.period(state.Z) - 1]);
    const narrow = gw < 480;
    const X0 = narrow ? 34 : 42, X1 = gw - 10, Y0 = gh - 34, Y1 = 30;
    const ymax = 8;
    const sx = function (z) { return X0 + (z - 0.5) / zmax * (X1 - X0); };
    const sy = function (v) { return Y0 - v / ymax * (Y0 - Y1); };
    const bw = (X1 - X0) / zmax;
    g.save();
    g.font = font(11); g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = 0; v <= ymax; v += 2) {
      g.strokeStyle = LD.alpha(col.text, v ? (col.dark ? 0.1 : 0.08) : 0.4); g.lineWidth = 1;
      g.beginPath(); g.moveTo(X0, Math.round(sy(v)) + 0.5); g.lineTo(X1, Math.round(sy(v)) + 0.5); g.stroke();
      g.fillText(String(v), X0 - 5, sy(v));
    }
    g.fillStyle = col.text; g.font = font(12, '600'); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(T('未成對電子數（中性原子）', 'Unpaired electrons (neutral atoms)'), 6, 18);
    // 鈍氣分隔與符號
    g.font = font(10); g.textAlign = 'center';
    PE.forEach(function (z) {
      if (z > zmax) return;
      const x = sx(z) + bw / 2;
      g.strokeStyle = LD.alpha(col.muted, 0.45); g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(x, Y1); g.lineTo(x, Y0); g.stroke(); g.setLineDash([]);
      g.fillStyle = col.muted; g.fillText(E.SYM[z - 1], sx(z), Y0 + 13);
    });
    g.textAlign = 'right'; g.fillStyle = col.muted; g.font = font(11);
    g.fillText(T('原子序 Z', 'Atomic number Z'), X1, gh - 5);
    for (let z = 1; z <= zmax; z++) {
      const u = E.unpaired(E.config(z, 0)), x = sx(z), w = Math.max(1.5, bw * 0.78), sel = z === state.Z;
      const c = blockColor(E.block(z));
      gHits.push({ Z: z, x0: x - bw / 2, x1: x + bw / 2 });
      if (u) {
        g.fillStyle = c; LD.roundRect(g, x - w / 2, sy(u), w, Y0 - sy(u), Math.min(2, w / 3)); g.fill();
        g.strokeStyle = sel ? col.accent : LD.alpha(col.text, 0.3); g.lineWidth = sel ? 2.2 : 0.8;
        LD.roundRect(g, x - w / 2, sy(u), w, Y0 - sy(u), Math.min(2, w / 3)); g.stroke();
      } else if (sel) { g.fillStyle = col.accent; g.fillRect(x - w / 2, Y0 - 2, w, 2); }
      if (E.isException(z)) {
        const m = E.unpaired(E.aufbau(z));
        if (m !== u) {
          g.strokeStyle = col.pos; g.lineWidth = 1.5;
          g.beginPath(); g.arc(x, sy(m), Math.max(2.5, Math.min(4, bw * 0.4)), 0, Math.PI * 2); g.stroke();
        }
      }
    }
    const u0 = E.unpaired(E.config(state.Z, 0));
    LD.pill(g, E.SYM[state.Z - 1] + '：' + u0, sx(state.Z) + (state.Z < zmax * 0.7 ? 8 : -8), Math.max(Y1 + 12, sy(u0) - 6), col.text, state.Z < zmax * 0.7 ? 'left' : 'right', '600 12px ' + LD.FONT);
    g.restore();
    $('gLegend').innerHTML = ['s', 'p', 'd', 'f'].map(function (b) { return '<span><i class="sp" style="background:' + blockColor(b) + '"></i>' + b + T(' 區', '-block') + '</span>'; }).join('') +
      '<span><b style="color:' + col.pos + '">○</b> ' + T('構築原理預測的值（例外元素）', 'the aufbau prediction (exceptions)') + '</span>';
    $('gHint').textContent = T('每一區都在半滿時最高、全滿時回到 0。虛線是鈍氣（一個週期的結尾）。點長條可以選元素。', 'Each block peaks at half-filling and returns to zero when full. The dashed lines are the noble gases (the end of each period). Tap a bar to choose that element.') +
      (state.q ? T('（目前選的是離子，圖上畫的是中性原子。）', ' (You have chosen an ion; the graph shows neutral atoms.)') : '');
  }
  function drawOrder(g) {
    const occ = target();
    const narrow = gw < 480;
    const left0 = narrow ? 30 : 46, topY = 36;
    const cellW = Math.min(92, (gw - left0 - 14) / 4), cellH = Math.min(30, (gh - topY - 14) / 7);
    const left = Math.max(left0, Math.round((gw - 4 * cellW) / 2));
    const cx = function (l) { return left + l * cellW + cellW / 2; }, cy = function (n) { return topY + (n - 1) * cellH + cellH / 2; };
    g.save();
    g.fillStyle = col.text; g.font = font(12, '600'); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(T('對角線規則：沿箭頭依序填入', 'Diagonal rule: fill along the arrows in order'), 6, 18);
    g.font = font(12, '700'); g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let l = 0; l < 4; l++) g.fillText(LL[l], cx(l), topY - 9);
    g.textAlign = 'right';
    for (let n = 1; n <= 7; n++) g.fillText('n = ' + n, left - 6, cy(n));
    // 對角線箭頭
    const order = SUB;
    for (let k = 2; k <= 8; k++) {
      const cells = order.filter(function (s) { return s.n + s.l === k; });
      if (!cells.length) continue;
      const a = cells[0], b = cells[cells.length - 1];
      const x0 = cx(a.l) + cellW * 0.44, y0 = cy(a.n) - cellH * 0.46, x1 = cx(b.l) - cellW * 0.44, y1 = cy(b.n) + cellH * 0.46;
      LD.arrow(g, x0, y0, x1, y1, LD.alpha(col.accent, 0.55), 1.8);
    }
    const hi = E.highest(occ);
    order.forEach(function (s) {
      const w = cellW * 0.62, h = cellH * 0.72, x = cx(s.l) - w / 2, y = cy(s.n) - h / 2;
      const f = occ[s.i] / s.cap;
      g.fillStyle = col.dark ? LD.mix(col.surface, '#ffffff', 0.04) : col.surface;
      LD.roundRect(g, x, y, w, h, 4); g.fill();
      if (f > 0) {
        g.save(); LD.roundRect(g, x, y, w, h, 4); g.clip();
        g.fillStyle = blockColor(LL[s.l]); g.fillRect(x, y, w * f, h);
        g.restore();
      }
      g.strokeStyle = s.i === hi ? col.accent : LD.alpha(col.text, 0.3); g.lineWidth = s.i === hi ? 2.2 : 1;
      LD.roundRect(g, x, y, w, h, 4); g.stroke();
      g.fillStyle = col.text; g.font = font(12, '700'); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s.label, x + w / 2, y + h / 2 + 0.5);
      g.fillStyle = col.muted; g.font = font(9); g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText(String(s.i + 1), x + w + 2, y - 1);
    });
    g.restore();
    $('gLegend').innerHTML = '<span>' + T('格子塗色的比例：', 'Shading: ') + spHTML(state.Z, state.q) + T(' 每個副層填了多少', ' — how full each subshell is') + '</span><span>' + T('小數字：填入的順序', 'small numbers: order of filling') + '</span>';
    $('gHint').textContent = T('同一條斜線上的副層 n + l 相同；沿著箭頭由上往下、一條一條填。', 'Subshells on the same diagonal have the same n + l; fill along the arrows, one diagonal after another.');
  }
  function hitGraph(x) {
    for (let k = 0; k < gHits.length; k++) if (x >= gHits[k].x0 && x < gHits[k].x1) return gHits[k].Z;
    return null;
  }

  // ======================= 全部更新 =======================
  function syncSegs() {
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab)); });
    document.querySelectorAll('#toolSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.tool === state.tool)); });
    $('autoBox').hidden = state.mode !== 'auto';
    $('buildBox').hidden = state.mode !== 'build';
    cv.classList.toggle('build', state.mode === 'build');
  }
  function refresh() {
    syncSegs();
    relayout();
    updateCfgLine(); updateOut(); updateLegend();
    draw(); drawPT(); drawGraph();
    if (view3) view3.update();
  }
  function setMode(m) {
    if (m === state.mode) return;
    stopAnim();
    state.mode = m;
    shown = E.boxesOf(target());
    if (m === 'build') { resetBuild(); showBuildMsg(); }
    setStatus('');
    if (snd()) window.LabSound.tone({ freq: m === 'build' ? 587 : 440, dur: 0.08, gain: 0.045 });
    refresh();
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // ======================= 3D =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function host3Api() {
    return {
      T: T, host: host3, SUB: SUB,
      boxes: function () { return disp(); },
      colors: function () { return { up: col.up, down: col.down, accent: col.accent, text: col.text, muted: col.muted, dark: col.dark, block: { s: blockColor('s'), p: blockColor('p'), d: blockColor('d'), f: blockColor('f') } }; },
      hud: function () {
        const occ = occOf(disp());
        return {
          tl: spHTML(state.Z, state.q) + '　' + cfgHTML(occ, true),
          tr: T('電子 ', 'Electrons ') + E.total(occ) + ' / ' + Nnow() + '<br>' + T('未成對 ', 'Unpaired ') + occ.reduce(function (a, k, i) { return a + E.unpairedIn(k, SUB[i].m); }, 0)
        };
      },
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
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
      if (!webglAvailable() || !window.EC3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.EC3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update();
        emit('view3d', {});
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }

  // ======================= 事件 =======================
  function canvasPoint(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  cv.addEventListener('click', function (ev) {
    if (state.mode !== 'build') return;
    const p = canvasPoint(cv, ev), h = hitBox(p[0], p[1]);
    acted();
    if (!h) return;
    cursor = { s: h.s, o: h.o };
    place(h.s, h.o, state.tool);
  });
  ptcv.addEventListener('click', function (ev) {
    const p = canvasPoint(ptcv, ev), Z = hitPT(p[0], p[1]);
    acted();
    if (Z) setSpecies(Z, state.q);
  });
  gcv.addEventListener('click', function (ev) {
    if (state.tab !== 'unp') return;
    const p = canvasPoint(gcv, ev), Z = hitGraph(p[0]);
    acted();
    if (Z) setSpecies(Z, state.q);
  });
  zIn.addEventListener('input', function () {
    acted();
    const Z = Math.round(window.LabNum ? window.LabNum.value(zIn) : +zIn.value);
    const q0 = state.q, q1 = E.clampQ(Math.max(1, Math.min(E.N, Z)), q0);
    setSpecies(Z, q0, q1 !== q0 ? 'clampQ' : '');
  });
  qIn.addEventListener('input', function () {
    acted();
    const q = Math.round(window.LabNum ? window.LabNum.value(qIn) : +qIn.value);
    setSpecies(state.Z, q, E.clampQ(state.Z, q) !== q ? 'clampQ' : '');
  });
  $('prevEl').addEventListener('click', function () { acted(); setSpecies(state.Z > 1 ? state.Z - 1 : E.N, state.q); });
  $('nextEl').addEventListener('click', function () { acted(); setSpecies(state.Z < E.N ? state.Z + 1 : 1, state.q); });
  $('goEl').addEventListener('click', goFind);
  $('findEl').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goFind(); } });
  document.querySelectorAll('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); setMode(b.dataset.mode); }); });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.tab = b.dataset.tab; syncSegs(); drawGraph(); }); });
  document.querySelectorAll('#toolSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.tool = +b.dataset.tool; syncSegs(); }); });
  $('playBtn').addEventListener('click', startFill);
  $('fillAll').addEventListener('click', fillAll);
  $('ghostChk').addEventListener('change', function () {
    acted(); state.ghost = $('ghostChk').checked;
    if (state.ghost && !(E.isException(state.Z) && !state.q)) setStatus(T(spHTML(state.Z, state.q) + ' 照構築原理填就是基態，和預測一樣。換一個有「•」記號的元素看看。', 'For ' + spHTML(state.Z, state.q) + ' the aufbau prediction is the ground state. Try an element marked with “•”.'));
    else setStatus('');
    refresh();
  });
  $('coreChk').addEventListener('change', function () { acted(); state.core = $('coreChk').checked; resetBuild(); showBuildMsg(); refresh(); });
  $('resetBuild').addEventListener('click', function () { acted(); resetBuild(); showBuildMsg(); refresh(); });
  $('clearAll').addEventListener('click', clearAll);
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && (anim.on || flyers.length)) kick(); });

  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('軌域圖。自動填入時：← → 換元素、↑ ↓ 換電荷。自己填時：方向鍵移動游標，按 Enter 切到「放電子」，再按 ↑ 放 ↑、↓ 放 ↓、← 或 → 擦掉。',
        'Orbital diagram. Watching: ← → change the element, ↑ ↓ change the charge. Filling it yourself: the arrow keys move the cursor; press Enter to switch to “place”, then ↑ places ↑, ↓ places ↓, ← or → erases.'),
      items: [
        { name: function () { return state.mode === 'build' ? T('游標', 'Cursor') : T('元素與電荷', 'Element and charge'); },
          move: function (dx, dy) {
            if (!dx && !dy) return false;
            acted();
            if (state.mode !== 'build') { if (dx) setSpecies(state.Z + Math.sign(dx), state.q); else setSpecies(state.Z, state.q + Math.sign(dy)); return true; }
            if (dx) cursor.o = Math.max(0, Math.min(SUB[cursor.s].m - 1, cursor.o + Math.sign(dx)));
            else { cursor.s = Math.max(0, Math.min(LY ? LY.last : NS - 1, cursor.s + Math.sign(dy))); cursor.o = Math.min(cursor.o, SUB[cursor.s].m - 1); }
            return true;
          },
          describe: function () {
            if (state.mode !== 'build') return spName(state.Z, state.q) + T('，', ', ') + Nnow() + T(' 個電子，', ' electrons, ') + E.cfgText(target(), true);
            const e = build[cursor.s][cursor.o];
            return SUB[cursor.s].label + T(' 第 ' + (cursor.o + 1) + ' 格：', ' box ' + (cursor.o + 1) + ': ') + (e[0] ? '↑' : '') + (e[1] ? '↓' : '') + (!e[0] && !e[1] ? T('空的', 'empty') : '');
          } },
        { name: function () { return T('放電子', 'Place'); },
          move: function (dx, dy) {
            if (state.mode !== 'build' || (!dx && !dy)) return false;
            place(cursor.s, cursor.o, dx ? 2 : dy > 0 ? 0 : 1);
            return true;
          },
          describe: function () { return $('buildMsg').textContent; } }
      ],
      onChange: function () { draw(); }
    });
  }

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    if (view3) view3.onTheme();
    updateSoundButton(); updatePTLegend(); renderRecord();
    if (state.mode === 'build') showBuildMsg();
    refresh();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lp = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (ptcv.clientWidth !== lp) { lp = ptcv.clientWidth; resizePT(); drawPT(); } }).observe(ptcv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);

  // 測試用介面（短名 __ec；試玩工具自己用 __pt，不可撞名）
  window.__ec = {
    state: state, E: E,
    select: function (Z, q) { acted(); setSpecies(Z, q == null ? state.q : q); },
    mode: function (m) { acted(); setMode(m); },
    tool: function (t) { acted(); state.tool = t; syncSegs(); },
    core: function (on) { acted(); $('coreChk').checked = !!on; state.core = !!on; resetBuild(); showBuildMsg(); refresh(); },
    place: function (s, o, t) { place(s, o, t == null ? state.tool : t); },
    build: function () { return build; }, shown: function () { return shown; }, anim: function () { return anim; },
    box: function (s, o) { if (!LY || s > LY.last) return null; const r = boxRect(s, o); return [r.x + r.w / 2, r.y + r.h / 2]; },
    pt: function (Z) { const r = ptRect(Z); return [r.x + r.w / 2, r.y + r.h / 2]; },
    msg: function () { return $('buildMsg').textContent; }
  };

  readColors();
  cw = cv.clientWidth || 600;
  syncSliders();
  updateSoundButton();
  updatePTLegend();
  renderRecord();
  resize();
  refresh();
})();
