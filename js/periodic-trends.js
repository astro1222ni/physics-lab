/*
 * periodic-trends.js — 「週期表與週期性」的頁面程式（週期表熱圖、元素卡、電子殼層、圖表、猜猜看、3D 切換、任務事件）
 * 化學數據與計算在 js/periodic-trends-core.js（PTCore）；3D 立體長條圖在 js/periodic-trends-3d.js（PT3D）。
 * 畫面只「讀」核心的數值，著色、長條高度都是由數值換算而來。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'select'：選取元素或換著色性質 { Z, prop（'r'／'IE'／'EN'／'mp'／'rho'／'cat'）, hiddenSel（選到的值正被猜猜看藏起來） }
 *   'graph'：圖表內容改變 { tab（'z'／'period'／'group'）, prop（圖表用的數值性質）, period, group（鑭系錒系為 null）, Z }
 *   'view3d'：3D 立體長條圖開啟成功 { prop }
 *   'predict'：猜猜看按「核對」{ prop, Z, guess, actual, err（相對誤差）, hit（err ≤ 0.10）, streak（含這一題的連續猜中數） }
 */
(function () {
  'use strict';
  const P = window.PTCore, LD = window.LabDraw;
  if (!P || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const isEn = function () { return T('0', '1') === '1'; };
  const reducedMotion = LD.reducedMotion();
  const NUM_PROPS = ['r', 'IE', 'EN', 'mp', 'rho'];
  const HIT = 0.10;
  const NOBLE = [2, 10, 18, 36, 54, 86, 118];

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
  function parseNum(s) {
    s = String(s || '').normalize('NFKC').replace(/[，,]/g, '.').replace(/[−–—]/g, '-').replace(/\s+/g, '');
    s = s.replace(/(pm|kj\/mol|kj|°c|g\/cm3)$/i, '');
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
  }
  function pct(x) { return num(x * 100, x < 0.1 ? 1 : 0) + '%'; }

  // ======================= 名稱與數值的文字 =======================
  function nm(Z) { const e = P.EL[Z]; return T(e.zh, e.en); }
  function nmFull(Z) { const e = P.EL[Z]; return isEn() ? e.en : T(e.zh, e.en) + '（' + e.sym + '）'; }
  function propName(p) { return p === 'cat' ? T('元素類別', 'Kind of element') : T(P.PROPS[p].zh, P.PROPS[p].en); }
  function unitOf(p) { return p === 'cat' || p === 'EN' ? '' : P.PROPS[p].unit; }
  /** 讀數（純文字） */
  function fmt(p, v, withUnit) {
    if (v == null) return '—';
    let s;
    if (p === 'r') s = num(v, 0);
    else if (p === 'IE') s = num(v, 1);
    else if (p === 'EN') s = num(v, 2);
    else if (p === 'mp') s = num(v, Math.abs(v) >= 1000 ? 0 : 1);
    else s = v < 0.01 ? sigf(v * 1000, 3) : sigf(v, 3);
    if (!withUnit) return s;
    if (p === 'rho') return s + (v < 0.01 ? ' g/L' : ' g/cm³');
    const u = unitOf(p);
    return u ? s + ' ' + u : s;
  }
  /** 格子裡的短數字 */
  function short(p, v) {
    if (v == null) return '';
    if (p === 'EN') return num(v, 2);
    if (p === 'rho') return v < 0.01 ? '<0.01' : v >= 10 ? num(v, 1) : sigf(v, 2);
    return num(v, 0);
  }
  function cfgHTML(Z) {
    const e = P.EL[Z], m = e.cfg.match(/^\[([A-Za-z]+)\]/);
    const toks = (e.cfg.replace(/^\[[A-Za-z]+\]/, '').match(/\d[spdf]\d+/g) || []).slice();
    toks.sort(function (a, b) { return (+a[0]) - (+b[0]) || 'spdf'.indexOf(a[1]) - 'spdf'.indexOf(b[1]); });
    return (m ? '[' + m[1] + '] ' : '') + toks.map(function (t) { return t.slice(0, 2) + '<sup>' + t.slice(2) + '</sup>'; }).join(' ');
  }
  function stateText(Z) {
    const e = P.EL[Z];
    const s = e.state === 'g' ? T('氣體', 'gas') : e.state === 'l' ? T('液體', 'liquid') : T('固體', 'solid');
    return e.stateExpected ? T('預計是', 'expected ') + s : s;
  }
  function groupText(Z) {
    const q = P.pos(Z);
    if (q.group) return String(q.group);
    return Z <= 71 ? T('鑭系（第 3 族的位置）', 'lanthanide (in group 3)') : T('錒系（第 3 族的位置）', 'actinide (in group 3)');
  }

  // ======================= 顏色 =======================
  let col = {};
  const RAMP_L = ['#f8f5e4', '#f6d38f', '#ef9d5c', '#d75c4f', '#a3356b', '#57226f'];
  const RAMP_D = ['#2c2b3b', '#433670', '#7d3b7f', '#c6555b', '#ec9450', '#f9d991'];
  const CAT_HUE = { alk: '#e8735a', ae: '#f0a54a', tm: '#e3c75a', ptm: '#93bd63', mtd: '#4fb39b', nm: '#4f9fd6', hal: '#7486e0', ng: '#ac7fd8', lan: '#df84b6', act: '#c9708a' };
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk,
      ramp: dk ? RAMP_D : RAMP_L,
      none: dk ? '#3a3d44' : '#e4e6ea', noneInk: dk ? '#80858f' : '#9aa0a8'
    };
  }
  function rampAt(t) {
    const R = col.ramp, x = Math.max(0, Math.min(1, t)) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x));
    return LD.mix(R[i], R[i + 1], x - i);
  }
  function lum(c) { const r = LD.rgb(c); return (0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]) / 255; }
  function inkOn(bg) { return lum(bg) > 0.55 ? '#1d2228' : '#f5f6f8'; }
  function catColor(cat) { const h = CAT_HUE[cat] || '#999999'; return col.dark ? LD.mix(h, '#1b1d22', 0.35) : LD.mix(h, '#ffffff', 0.38); }

  // 每個性質的著色範圍（有數據的元素中的最大與最小；密度用對數）
  const RANGE = {};
  NUM_PROPS.forEach(function (p) {
    const ex = P.extremes(p), lo = P.value(ex.min, p), hi = P.value(ex.max, p);
    RANGE[p] = P.PROPS[p].log ? { lo: Math.log10(lo), hi: Math.log10(hi), log: true, vlo: lo, vhi: hi } : { lo: lo, hi: hi, log: false, vlo: lo, vhi: hi };
  });
  function norm(p, v) {
    if (v == null) return null;
    const R = RANGE[p], x = R.log ? Math.log10(v) : v;
    return (x - R.lo) / (R.hi - R.lo);
  }

  // ======================= 狀態 =======================
  const state = { prop: 'IE', lastNum: 'IE', Z: 11, tab: 'z', view: '2d' };
  const game = { on: false, prop: null, Z: null, revealed: true, n: 0, streak: 0, best: 0, hist: [], lastZ: null };
  let userActed = false;
  let view3 = null;
  function acted() { userActed = true; }
  function emit(type, data) { if (userActed && window.LabMission) window.LabMission.emit(type, data); }
  function gp() { return state.prop === 'cat' ? state.lastNum : state.prop; }
  function isHidden(Z, p) { return game.on && !game.revealed && Z === game.Z && p === game.prop; }
  function shownVal(Z, p) { return isHidden(Z, p) ? null : P.value(Z, p); }
  function cellColor(Z) {
    if (state.prop === 'cat') return catColor(P.EL[Z].cat);
    if (isHidden(Z, state.prop)) return col.none;
    const t = norm(state.prop, P.value(Z, state.prop));
    return t == null ? col.none : rampAt(t);
  }
  function snd() { return window.LabSound && window.LabSound.enabled(); }

  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const shcv = $('shcv'), sctx = shcv.getContext('2d');
  let kb = null;

  // ======================= 週期表版面 =======================
  let cw = 0, ch = 0, dpr = 1, L = null;
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function layout() {
    const narrow = cw < 560;
    const pad = narrow ? 4 : 10;
    const lw0 = narrow ? 11 : 18;
    const cell = Math.min((cw - 2 * pad - lw0) / 18, 66);
    const cellH = cell * (narrow ? 1.18 : 1.1);
    const gap = Math.max(1, Math.round(cell * 0.06));
    const gh = Math.max(13, Math.min(18, cell * 0.42));
    const x0 = pad + lw0 + (cw - 2 * pad - lw0 - cell * 18) / 2;
    const y0 = pad + gh;
    L = { narrow: narrow, pad: pad, cell: cell, cellH: cellH, gap: gap, gh: gh, x0: x0, y0: y0, lw: lw0, fgap: cellH * 0.42 };
    ch = Math.round(y0 + cellH * 9 + L.fgap + pad + 2);
  }
  function rowY(row) { return row <= 7 ? L.y0 + (row - 1) * L.cellH : L.y0 + 7 * L.cellH + L.fgap + (row - 9) * L.cellH; }
  function colX(c) { return L.x0 + (c - 1) * L.cell; }
  function cellRect(Z) {
    const q = P.pos(Z);
    return { x: colX(q.col) + L.gap / 2, y: rowY(q.row) + L.gap / 2, w: L.cell - L.gap, h: L.cellH - L.gap };
  }
  const GRID = {};
  for (let Z = 1; Z <= P.N; Z++) { const q = P.pos(Z); GRID[q.row + ',' + q.col] = Z; }
  const ROWS = [1, 2, 3, 4, 5, 6, 7, 9, 10];
  function hitTable(x, y) {
    let best = null, bd = Infinity;
    for (let Z = 1; Z <= P.N; Z++) {
      const r = cellRect(Z), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const d = Math.max(Math.abs(x - cx) / (L.cell / 2), Math.abs(y - cy) / (L.cellH / 2));
      if (d < bd) { bd = d; best = Z; }
    }
    return bd <= 1.25 ? best : null;
  }
  /** 鍵盤在週期表上移動：左右找同一列的下一格、上下找同一行的下一格（跳過空格） */
  function gridMove(Z, dx, dy) {
    const q = P.pos(Z);
    if (dx) {
      for (let c = q.col + dx; c >= 1 && c <= 18; c += dx) { const z = GRID[q.row + ',' + c]; if (z) return z; }
      return null;
    }
    let ri = ROWS.indexOf(q.row);
    for (ri += dy; ri >= 0 && ri < ROWS.length; ri += dy) { const z = GRID[ROWS[ri] + ',' + q.col]; if (z) return z; }
    return null;
  }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    layout();
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    resizeGraph(); resizeShell();
    drawTable(); drawGraph(); drawShell();
  }

  // ======================= 畫週期表 =======================
  let pulse = 0;
  function font(px, weight) { return (weight || '') + ' ' + px.toFixed(1) + 'px ' + LD.FONT; }
  function drawTable() {
    if (!L) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, cw, ch);
    const cell = L.cell, cH = L.cellH;
    const selQ = P.pos(state.Z);
    // 圖表的週期或族（淡淡的帶子）
    if (state.tab === 'period' || (state.tab === 'group' && selQ.group)) {
      g.save();
      g.fillStyle = LD.alpha(col.accent, col.dark ? 0.14 : 0.1);
      if (state.tab === 'period') LD.roundRect(g, colX(1) - 2, rowY(selQ.period) - 1, cell * 18 + 4, cH + 2, 5);
      else {
        const gm = P.groupMembers(selQ.group), top = rowY(P.pos(gm[0]).row), bot = rowY(P.pos(gm[gm.length - 1]).row) + cH;
        LD.roundRect(g, colX(selQ.group) - 1, top - 2, cell + 2, bot - top + 4, 5);
      }
      g.fill();
      g.restore();
    }
    // 族號、週期號
    const lf = Math.min(fsz(10), Math.max(7.5, cell * 0.36));
    g.fillStyle = col.muted; g.font = font(lf); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let gN = 1; gN <= 18; gN++) {
      const top = P.groupMembers(gN)[0], r = cellRect(top);
      g.fillText(String(gN), r.x + r.w / 2, r.y - 3);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let p = 1; p <= 7; p++) g.fillText(String(p), L.x0 - 3, rowY(p) + cH / 2);
    // 鑭系、錒系的位置記號與下方兩列的名稱
    [[6, '57–71', T('鑭系', 'La–Lu')], [7, '89–103', T('錒系', 'Ac–Lr')]].forEach(function (a, i) {
      const x = colX(3) + L.gap / 2, y = rowY(a[0]) + L.gap / 2, w = cell - L.gap, h = cH - L.gap;
      g.save();
      g.setLineDash([3, 2]); g.strokeStyle = LD.alpha(col.muted, 0.7); g.lineWidth = 1;
      LD.roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, 3); g.stroke();
      g.restore();
      g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = font(Math.max(6.5, Math.min(fsz(10), cell * 0.21)));
      g.fillText(cell < 34 ? (i ? '**' : '*') : a[1], x + w / 2, y + h / 2);
      const fy = rowY(9 + i) + cH / 2;
      g.font = font(Math.max(7.5, Math.min(fsz(11), cell * 0.3)));
      g.fillText((cell < 34 ? (i ? '** ' : '* ') : '') + a[2], colX(1) + cell, fy);
    });
    // 元素格
    for (let Z = 1; Z <= P.N; Z++) drawCell(g, Z, false);
    drawCell(g, state.Z, true);
    if (game.on && !game.revealed && game.Z !== state.Z) drawCell(g, game.Z, false);
    drawKey(g);
    if (kb && kb.focused && kb.focused()) {
      const r = cellRect(state.Z);
      g.save(); g.strokeStyle = col.accent; g.lineWidth = 2; g.setLineDash([4, 3]);
      LD.roundRect(g, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 6); g.stroke(); g.restore();
    }
  }
  function drawCell(g, Z, sel) {
    const r = cellRect(Z), e = P.EL[Z], cell = L.cell;
    const bg = cellColor(Z), ink = inkOn(bg);
    const hid = isHidden(Z, state.prop) || (game.on && !game.revealed && Z === game.Z);
    const noData = state.prop !== 'cat' && P.value(Z, state.prop) == null;
    g.save();
    if (sel) {
      g.shadowColor = LD.shadowInk(0.35); g.shadowBlur = 8; g.shadowOffsetY = 2;
    }
    g.fillStyle = bg;
    LD.roundRect(g, r.x, r.y, r.w, r.h, Math.min(4, cell * 0.12)); g.fill();
    g.shadowColor = 'transparent';
    // 立體感：上亮下暗
    const lg = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    lg.addColorStop(0, 'rgba(255,255,255,' + (col.dark ? 0.08 : 0.22) + ')');
    lg.addColorStop(1, 'rgba(0,0,0,' + (col.dark ? 0.12 : 0.06) + ')');
    g.fillStyle = lg; g.fill();
    if (noData && !hid) {
      g.save(); g.clip();
      g.strokeStyle = LD.alpha(col.noneInk, 0.35); g.lineWidth = 1;
      for (let k = -r.h; k < r.w; k += 5) { g.beginPath(); g.moveTo(r.x + k, r.y + r.h); g.lineTo(r.x + k + r.h, r.y); g.stroke(); }
      g.restore();
    }
    if (sel) {
      g.strokeStyle = col.accent; g.lineWidth = cell < 26 ? 2 : 2.5;
      LD.roundRect(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, Math.min(5, cell * 0.14)); g.stroke();
    }
    if (hid) {
      const a = reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(pulse * 5);
      g.strokeStyle = LD.alpha(col.pos, a); g.lineWidth = 2;
      LD.roundRect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 3); g.stroke();
    }
    g.textAlign = 'center'; g.fillStyle = noData && !hid ? col.noneInk : ink;
    const big = cell >= 38, mid = cell >= 28;
    const fsS = Math.max(7.5, Math.min(cell * (big ? 0.34 : 0.42), fsz(17)));
    g.textBaseline = 'middle';
    g.font = font(fsS, '700');
    const symY = big ? r.y + r.h * 0.47 : mid ? r.y + r.h * 0.56 : r.y + r.h / 2;
    g.fillText(e.sym, r.x + r.w / 2, symY);
    if (mid) {
      g.font = font(Math.max(6.5, Math.min(cell * 0.2, fsz(10))));
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.globalAlpha = 0.85;
      g.fillText(String(Z), r.x + 2.5, r.y + 2);
      g.globalAlpha = 1;
    }
    if (big && state.prop !== 'cat') {
      g.font = font(Math.max(7, Math.min(cell * 0.19, fsz(10))));
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(hid ? '?' : short(state.prop, P.value(Z, state.prop)), r.x + r.w / 2, r.y + r.h - 3);
    } else if (hid && !big) {
      g.font = font(Math.max(7, cell * 0.3), '700');
      g.textAlign = 'right'; g.textBaseline = 'top';
      g.fillStyle = col.pos;
      g.fillText('?', r.x + r.w - 1, r.y);
    }
    g.restore();
  }
  /** 表上方的空白區（第 3–12 族、第 1–3 週期）：放選取元素的放大卡 */
  function drawKey(g) {
    const x = colX(3) + L.gap, y = rowY(1) + L.gap, w = L.cell * 10 - 2 * L.gap, h = L.cellH * 3 - 2 * L.gap - (L.narrow ? 0 : L.cellH * 0.15);
    const Z = state.Z, e = P.EL[Z];
    const bs = Math.min(h, w * 0.32);
    const bg = cellColor(Z), ink = inkOn(bg);
    g.save();
    g.shadowColor = LD.shadowInk(0.25); g.shadowBlur = 10; g.shadowOffsetY = 3;
    g.fillStyle = bg; LD.roundRect(g, x, y + (h - bs) / 2, bs, bs, 6); g.fill();
    g.restore();
    g.save();
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(bs * 0.42, '800');
    g.fillText(e.sym, x + bs / 2, y + h / 2 + bs * 0.04);
    g.font = font(Math.max(7, bs * 0.15));
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(String(Z), x + 4, y + (h - bs) / 2 + 3);
    // 右邊文字
    const tx = x + bs + Math.max(6, bs * 0.14), tw = w - bs - 8;
    const f1 = Math.max(9, Math.min(fsz(15), h * 0.22)), f2 = Math.max(8, Math.min(fsz(12.5), h * 0.17));
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = col.text; g.font = font(f1, '700');
    g.fillText(fitText(g, isEn() ? e.en : T(e.zh, e.en) + '  ' + e.en, tw), tx, y + h * 0.3);
    g.font = font(f2); g.fillStyle = col.muted;
    g.fillText(fitText(g, T('原子量 ', 'Atomic mass ') + e.mass, tw), tx, y + h * 0.56);
    let line;
    if (state.prop === 'cat') line = T(P.CATS[e.cat][0], P.CATS[e.cat][1]);
    else line = propName(state.prop) + '  ' + (isHidden(Z, state.prop) ? '?' : fmt(state.prop, P.value(Z, state.prop), true));
    g.font = font(f2, '600'); g.fillStyle = state.prop === 'cat' ? col.text : col.accent;
    g.fillText(fitText(g, line, tw), tx, y + h * 0.82);
    g.restore();
  }
  function fitText(g, s, w) {
    if (g.measureText(s).width <= w) return s;
    while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1);
    return s + '…';
  }

  // ======================= 電子殼層 =======================
  let sw = 0, sh = 190;
  function resizeShell() {
    const w = shcv.clientWidth;
    if (!w) return;
    sw = w;
    shcv.width = Math.round(sw * dpr); shcv.height = Math.round(sh * dpr);
  }
  function drawShell() {
    if (!sw) return;
    const g = sctx, Z = state.Z, shl = P.shells(Z), n = shl.length;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, sw, sh);
    LD.backdrop(g, sw, sh);
    const cx = sw * 0.4, cy = sh / 2;
    const rn = 12, rmax = Math.min(sh / 2 - 8, cx - 8);
    const step = (rmax - rn - 4) / n;
    const val = P.valence(Z);
    for (let k = 0; k < n; k++) {
      const R = rn + 4 + step * (k + 0.75);
      g.strokeStyle = LD.alpha(col.muted, 0.45); g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      const cnt = shl[k], outer = k === n - 1;
      const dr = Math.max(1.6, Math.min(3.2, (Math.PI * 2 * R) / Math.max(cnt, 1) * 0.3));
      for (let j = 0; j < cnt; j++) {
        const a = -Math.PI / 2 + (j / cnt) * Math.PI * 2 + k * 0.35;
        LD.ball(g, cx + R * Math.cos(a), cy + R * Math.sin(a), dr, outer ? col.accent : col.neg);
      }
    }
    LD.ball(g, cx, cy, rn, col.pos);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(Z >= 100 ? 8.5 : 10, '700');
    g.fillText('+' + Z, cx, cy + 0.5);
    // 右邊：每層電子數
    const tx = cx + rmax + 14;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const f = Math.min(fsz(12.5), (sh - 20) / 8.6);
    g.font = font(f); g.fillStyle = col.muted;
    g.fillText(T('各層電子數', 'Electrons per shell'), tx, 18);
    shl.forEach(function (c, k) {
      g.fillStyle = k === n - 1 ? col.accent : col.text;
      g.font = font(f, k === n - 1 ? '700' : '');
      g.fillText('n = ' + (k + 1) + ' : ' + c, tx, 18 + (k + 1) * f * 1.3);
    });
    if (val != null) {
      g.font = font(f, '600'); g.fillStyle = col.accent;
      g.fillText(T('價電子 ', 'Valence ') + val, tx, 18 + (n + 1) * f * 1.3 + 4);
    }
  }

  // ======================= 元素卡（DOM） =======================
  function updateCard() {
    const Z = state.Z, e = P.EL[Z], q = P.pos(Z);
    const sym = $('elSym'), bg = cellColor(Z);
    sym.textContent = e.sym;
    sym.style.background = bg; sym.style.color = inkOn(bg);
    $('elName').textContent = isEn() ? e.en : T(e.zh, e.en) + '　' + e.en;
    $('elSub').textContent = T('原子序 ', 'Atomic number ') + Z + T('・原子量 ', ' · atomic mass ') + e.mass;
    const rows = [];
    const row = function (dt, dd, cls) { rows.push('<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'); };
    row(T('電子組態', 'Electron configuration'), cfgHTML(Z) + (e.predicted ? T('（預測）', ' (predicted)') : ''), 'cfg');
    row(T('週期、族', 'Period, group'), q.period + T('、', ', ') + groupText(Z));
    row(T('區塊', 'Block'), P.block(Z) + T(' 區', '-block'));
    row(T('類別', 'Kind'), T(P.CATS[e.cat][0], P.CATS[e.cat][1]));
    row(T('室溫狀態', 'State at 25 °C'), stateText(Z));
    NUM_PROPS.forEach(function (p) {
      const hid = isHidden(Z, p);
      let v = hid ? '?' : fmt(p, P.value(Z, p), true);
      if (p === 'mp' && Z === 6 && !hid) v += T('（昇華）', ' (sublimes)');
      if (p === 'mp' && Z === 2 && !hid) v += T('（需加壓）', ' (under pressure)');
      row(propName(p), v, p === state.prop ? 'big' : '');
    });
    const val = P.valence(Z);
    row(T('價電子數', 'Valence electrons'), val == null ? T('—（過渡元素）', '— (transition element)') : String(val));
    row(T('有效核電荷（史萊特）', 'Effective nuclear charge (Slater)'), 'Z<sub>eff</sub> ≈ ' + num(P.slaterZeff(Z), 2));
    $('elOut').innerHTML = rows.join('');
  }

  // ======================= 圖例與說明 =======================
  function updateLegend() {
    const lg = $('legend');
    if (state.prop === 'cat') {
      lg.innerHTML = Object.keys(P.CATS).map(function (k) {
        return '<span><i class="sp" style="background:' + catColor(k) + '"></i>' + T(P.CATS[k][0], P.CATS[k][1]) + '</span>';
      }).join('');
    } else {
      const R = RANGE[state.prop];
      const grad = 'linear-gradient(90deg,' + col.ramp.join(',') + ')';
      lg.innerHTML = '<span>' + propName(state.prop) + (R.log ? T('（對數色階）', ' (log scale)') : '') + '</span>' +
        '<span>' + fmt(state.prop, R.vlo, true) + '<i class="ramp" style="background:' + grad + '"></i>' + fmt(state.prop, R.vhi, true) + '</span>' +
        '<span><i class="sp" style="background:' + col.none + '"></i>' + T('沒有可靠數據', 'no reliable data') + '</span>';
    }
    const H = {
      r: T('原子半徑（單鍵共價半徑）：同週期往右變小，同族往下變大。', 'Atomic radius (single-bond covalent radius): smaller to the right of a period, larger down a group.'),
      IE: T('第一游離能：從氣態原子拿走一個電子所需的能量。同週期往右大致變大，同族往下變小。', 'First ionization energy: the energy to remove one electron from a gaseous atom. It roughly rises across a period and falls down a group.'),
      EN: T('電負度（鮑林）：原子在化學鍵中吸引共用電子的能力。右上角最大。', 'Electronegativity (Pauling): how strongly an atom pulls shared electrons in a bond. Largest at the top right.'),
      mp: T('熔點（1 atm）：每個週期中間最高，鈍氣與鹼金屬很低。', 'Melting point (1 atm): highest in the middle of each period, low for noble gases and alkali metals.'),
      rho: T('密度（室溫、1 atm）：用對數色階，氣體大約只有固體的千分之一。', 'Density (room temperature, 1 atm), on a logarithmic colour scale: the gases are about a thousand times less dense than the solids.'),
      cat: T('元素類別：金屬在左下、非金屬在右上，類金屬在中間的斜線上。', 'Kinds of element: metals at the lower left, nonmetals at the upper right, metalloids along the staircase between them.')
    };
    $('propHint').textContent = H[state.prop];
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0, gHits = [];
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
  /** 座標軸；o.log 時 y 是 log10 */
  function axes(g, o) {
    const narrow = gw < 480;
    const Lm = narrow ? 46 : 58, Rm = 12, Tp = 30, B = o.xlab ? (narrow ? 38 : 40) : 26;
    const X0 = Lm, X1 = gw - Rm, Y0 = gh - B, Y1 = Tp;
    const sx = function (v) { return X0 + (v - o.x0) / (o.x1 - o.x0) * (X1 - X0); };
    const sy = function (v) { return Y0 - (v - o.y0) / (o.y1 - o.y0) * (Y0 - Y1); };
    g.save();
    g.lineWidth = 1;
    g.font = font(fsz(11)); g.fillStyle = col.muted;
    if (o.log) {
      for (let k = Math.ceil(o.y0); k <= Math.floor(o.y1); k++) {
        const y = sy(k);
        g.strokeStyle = LD.alpha(col.text, col.dark ? 0.1 : 0.08);
        g.beginPath(); g.moveTo(X0, y); g.lineTo(X1, y); g.stroke();
        g.textAlign = 'right'; g.textBaseline = 'middle';
        g.fillText(k >= 0 ? String(Math.pow(10, k)) : '0.' + '0'.repeat(-k - 1) + '1', X0 - 5, y);
      }
    } else {
      const ys = niceStep(o.y1 - o.y0, 5), yd = decOf(ys);
      for (let v = Math.ceil(o.y0 / ys - 1e-9) * ys; v <= o.y1 + 1e-9; v += ys) {
        const y = sy(v);
        g.strokeStyle = LD.alpha(col.text, Math.abs(v) < 1e-9 ? 0.3 : col.dark ? 0.1 : 0.08);
        g.beginPath(); g.moveTo(X0, y); g.lineTo(X1, y); g.stroke();
        g.textAlign = 'right'; g.textBaseline = 'middle';
        g.fillText(num(v, yd), X0 - 5, y);
      }
    }
    g.strokeStyle = LD.alpha(col.text, 0.45);
    g.beginPath(); g.moveTo(X0, Y1); g.lineTo(X0, Y0); g.lineTo(X1, Y0); g.stroke();
    g.fillStyle = col.text; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = font(fsz(12), '600');
    g.fillText(o.ylab, 6, 18);
    if (o.xlab) { g.textAlign = 'right'; g.font = font(fsz(12)); g.fillStyle = col.muted; g.fillText(o.xlab, X1, gh - 6); }
    g.restore();
    return { sx: sx, sy: sy, X0: X0, X1: X1, Y0: Y0, Y1: Y1 };
  }
  function yRange(p, vals) {
    if (P.PROPS[p].log) {
      const lv = vals.filter(function (v) { return v != null && v > 0; }).map(Math.log10);
      if (!lv.length) return { y0: -1, y1: 1, log: true };
      return { y0: Math.floor(Math.min.apply(null, lv)), y1: Math.ceil(Math.max.apply(null, lv) + 0.05), log: true };
    }
    const v = vals.filter(function (x) { return x != null; });
    if (!v.length) return { y0: 0, y1: 1 };
    let lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (lo > 0) lo = 0;
    const st = niceStep((hi - lo) || 1, 5);
    return { y0: Math.floor(lo / st) * st, y1: Math.ceil(hi * 1.06 / st) * st || st };
  }
  function ylabOf(p) { const u = unitOf(p); return propName(p) + (u ? (isEn() ? ' (' + u + ')' : '（' + u + '）') : ''); }
  function drawGraph() {
    if (!gw) return;
    const g = gctx, p = gp();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, gw, gh);
    gHits = [];
    const lg = $('gLegend'), hint = $('gHint');
    lg.textContent = '';
    if (state.tab === 'z') drawZGraph(g, p);
    else drawBars(g, p);
    const HT = {
      z: T('每條虛線是一個鈍氣，也就是一個週期的結尾。看看每個週期是不是重複同樣的形狀。點圖上的點可以選元素。', 'Each dashed line is a noble gas — the end of a period. See whether each period repeats the same shape. Tap a point to choose its element.'),
      period: T('選取元素所在的週期（主表的一列，鑭系錒系不算）。點長條可以選元素。', 'The period of the chosen element (one row of the main table; lanthanides and actinides are not included). Tap a bar to choose its element.'),
      group: T('選取元素所在的族（一行）。點長條可以選元素。', 'The group of the chosen element (one column). Tap a bar to choose its element.')
    };
    hint.textContent = (state.prop === 'cat' ? T('元素類別沒有數值，圖表畫的是 ', 'Kind of element has no number, so the graph shows ') + propName(p) + T('。', '. ') : '') + HT[state.tab];
  }
  function drawZGraph(g, p) {
    let zmax = 1;
    for (let Z = 1; Z <= P.N; Z++) if (P.value(Z, p) != null) zmax = Z;
    zmax = Math.min(118, Math.ceil((zmax + 1) / 10) * 10);
    const vals = []; for (let Z = 1; Z <= zmax; Z++) vals.push(P.value(Z, p));
    const yr = yRange(p, vals);
    const A = axes(g, { x0: 0, x1: zmax + 1, y0: yr.y0, y1: yr.y1, log: yr.log, ylab: ylabOf(p), xlab: T('原子序 Z', 'Atomic number Z') });
    const Y = function (v) { return A.sy(yr.log ? Math.log10(v) : v); };
    g.save();
    // 週期的分界（鈍氣）
    g.font = font(fsz(10)); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    let prev = 0;
    NOBLE.forEach(function (z, i) {
      if (z > zmax) {
        if (prev < zmax && A.sx(zmax) - A.sx(prev) > 16) { g.fillStyle = col.muted; g.fillText(String(i + 1), (A.sx(prev) + A.sx(zmax)) / 2, A.Y1 + 11); }
        prev = Infinity;
        return;
      }
      const x = A.sx(z);
      g.strokeStyle = LD.alpha(col.muted, 0.5); g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(x, A.Y1); g.lineTo(x, A.Y0); g.stroke();
      g.setLineDash([]);
      g.fillStyle = col.muted;
      if (A.sx(z) - A.sx(prev) > 16) g.fillText(String(i + 1), (A.sx(prev) + x) / 2, A.Y1 + 11);
      prev = z;
    });
    // 折線
    g.strokeStyle = col.accent; g.lineWidth = 1.8; g.lineJoin = 'round';
    g.beginPath();
    let pen = false;
    for (let Z = 1; Z <= zmax; Z++) {
      const v = shownVal(Z, p);
      if (v == null || (yr.log && v <= 0)) { pen = false; continue; }
      const x = A.sx(Z), y = Y(v);
      if (pen) g.lineTo(x, y); else g.moveTo(x, y);
      pen = true;
      gHits.push({ Z: Z, x: x, y: y });
    }
    g.stroke();
    const narrow = gw < 480;
    for (let Z = 1; Z <= zmax; Z++) {
      const v = shownVal(Z, p);
      if (v == null || (yr.log && v <= 0)) continue;
      const e = P.EL[Z], isNg = e.cat === 'ng', isAlk = e.cat === 'alk';
      g.fillStyle = isNg ? col.pos : isAlk ? col.neg : col.accent;
      g.beginPath(); g.arc(A.sx(Z), Y(v), isNg || isAlk ? 3 : narrow ? 1.6 : 2.2, 0, Math.PI * 2); g.fill();
    }
    // 猜猜看藏起來的元素
    if (game.on && !game.revealed && game.prop === p && game.Z <= zmax) {
      g.fillStyle = col.pos; g.font = font(fsz(13), '700'); g.textAlign = 'center';
      g.fillText('?', A.sx(game.Z), A.Y0 - 6);
    }
    // 選取的元素
    const v = shownVal(state.Z, p);
    if (state.Z <= zmax) {
      const x = A.sx(state.Z);
      g.strokeStyle = LD.alpha(col.text, 0.35); g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(x, A.Y1); g.lineTo(x, A.Y0); g.stroke(); g.setLineDash([]);
      if (v != null && !(yr.log && v <= 0)) {
        LD.ball(g, x, Y(v), 5, col.accent);
        const right = x < (A.X0 + A.X1) / 2;
        LD.pill(g, P.EL[state.Z].sym + ' ' + fmt(p, v, true), x + (right ? 9 : -9), Math.max(A.Y1 + 14, Y(v) - 8), col.text, right ? 'left' : 'right', '600 ' + fsz(12) + 'px ' + LD.FONT);
      }
    }
    g.restore();
    $('gLegend').innerHTML = '<span>' + T('上緣的數字：週期', 'Numbers along the top: period') + '</span>' +
      '<span><i class="sp" style="background:' + col.pos + '"></i>' + T('鈍氣', 'noble gases') + '</span>' +
      '<span><i class="sp" style="background:' + col.neg + '"></i>' + T('鹼金屬', 'alkali metals') + '</span>';
  }
  function drawBars(g, p) {
    const q = P.pos(state.Z);
    let list, title;
    if (state.tab === 'period') { list = P.periodMembers(q.period); title = T('第 ' + q.period + ' 週期', 'Period ' + q.period); }
    else {
      if (!q.group) {
        g.fillStyle = col.muted; g.font = font(fsz(14)); g.textAlign = 'center'; g.textBaseline = 'middle';
        const s = T('鑭系、錒系元素沒有族號（放在第 3 族的位置）。', 'Lanthanides and actinides have no group number (they sit in group 3).');
        const s2 = T('請在主表上選一個元素。', 'Choose an element in the main table.');
        g.fillText(fitText(g, s, gw - 20), gw / 2, gh / 2 - 12); g.fillText(s2, gw / 2, gh / 2 + 12);
        return;
      }
      list = P.groupMembers(q.group); title = T('第 ' + q.group + ' 族', 'Group ' + q.group);
    }
    const vals = list.map(function (Z) { return P.value(Z, p); });
    const yr = yRange(p, vals);
    const A = axes(g, { x0: 0, x1: list.length, y0: yr.y0, y1: yr.y1, log: yr.log, ylab: ylabOf(p), xlab: null });
    const Y = function (v) { return A.sy(yr.log ? Math.log10(v) : v); };
    const base = yr.log ? A.Y0 : A.sy(Math.max(yr.y0, Math.min(0, yr.y1)));
    const bw = (A.X1 - A.X0) / list.length;
    // 游離能的例外：比同週期左邊的元素還小
    const drop = {};
    if (state.tab === 'period' && p === 'IE') {
      for (let i = 1; i < list.length; i++) {
        const a = shownVal(list[i - 1], p), b = shownVal(list[i], p);
        if (a != null && b != null && b < a) drop[list[i]] = true;
      }
    }
    g.save();
    g.fillStyle = col.text; g.font = font(fsz(12), '600'); g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.fillText(title, A.X1, 18);
    list.forEach(function (Z, i) {
      const x = A.X0 + bw * i, cx = x + bw / 2, v = shownVal(Z, p), sel = Z === state.Z;
      gHits.push({ Z: Z, x: cx, y: (A.Y0 + A.Y1) / 2, bar: true, x0: x, x1: x + bw });
      g.fillStyle = sel ? col.accent : col.muted; g.textAlign = 'center'; g.textBaseline = 'top';
      g.font = font(Math.min(fsz(12), bw * 0.5), sel ? '700' : '');
      g.fillText(P.EL[Z].sym, cx, A.Y0 + 5);
      if (isHidden(Z, p)) {
        g.fillStyle = col.pos; g.font = font(Math.min(fsz(16), bw * 0.7), '700'); g.textBaseline = 'alphabetic';
        g.fillText('?', cx, A.Y0 - 6);
        return;
      }
      if (v == null || (yr.log && v <= 0)) {
        g.fillStyle = col.noneInk; g.font = font(Math.min(fsz(11), bw * 0.45)); g.textBaseline = 'alphabetic';
        g.fillText('—', cx, A.Y0 - 6);
        return;
      }
      const y = Y(v), top = Math.min(y, base), h = Math.abs(base - y);
      const c0 = norm(p, v);
      const fill = c0 == null ? col.muted : rampAt(c0);
      const w = Math.max(3, bw * 0.68);
      g.save();
      g.shadowColor = LD.shadowInk(0.2); g.shadowBlur = 4; g.shadowOffsetY = 1;
      g.fillStyle = fill; LD.roundRect(g, cx - w / 2, top, w, Math.max(1.5, h), Math.min(3, w / 4)); g.fill();
      g.restore();
      const lgr = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      lgr.addColorStop(0, 'rgba(255,255,255,0.18)'); lgr.addColorStop(1, 'rgba(0,0,0,0.1)');
      g.fillStyle = lgr; LD.roundRect(g, cx - w / 2, top, w, Math.max(1.5, h), Math.min(3, w / 4)); g.fill();
      g.strokeStyle = sel ? col.accent : LD.alpha(col.text, 0.25); g.lineWidth = sel ? 2.5 : 1;
      LD.roundRect(g, cx - w / 2, top, w, Math.max(1.5, h), Math.min(3, w / 4)); g.stroke();
      if (drop[Z]) {
        g.save(); g.strokeStyle = col.pos; g.lineWidth = 2; g.setLineDash([4, 3]);
        LD.roundRect(g, cx - w / 2 - 4, top - 4, w + 8, Math.max(1.5, h) + 8, 5); g.stroke(); g.restore();
      }
      if (bw >= 30 || sel || drop[Z]) {
        g.fillStyle = drop[Z] ? col.pos : col.text; g.font = font(Math.min(fsz(10.5), bw * 0.32), sel ? '700' : ''); g.textBaseline = 'alphabetic';
        const ty = v >= 0 || yr.log ? top - 4 : top + h + 12;
        g.fillText(short(p, v), cx, Math.max(A.Y1 + 10, ty - (drop[Z] ? 5 : 0)));
      }
    });
    if (Object.keys(drop).length) {
      $('gLegend').innerHTML = '<span><i class="sp" style="border:2px dashed ' + col.pos + ';background:transparent"></i>' + T('比左邊的元素還小（例外）', 'lower than the element to its left (an exception)') + '</span>';
    }
    g.restore();
  }
  function hitGraph(x, y) {
    let best = null, bd = Infinity;
    gHits.forEach(function (h) {
      if (h.bar) { if (x >= h.x0 && x < h.x1) { best = h.Z; bd = 0; } return; }
      const d = Math.abs(h.x - x) * 2 + Math.abs(h.y - y) * 0.3;
      if (d < bd) { bd = d; best = h.Z; }
    });
    return bd < 60 ? best : null;
  }

  // ======================= 選取、性質、圖表分頁 =======================
  let lastToneZ = null;
  function selectZ(Z, quiet) {
    if (!Z || Z < 1 || Z > P.N) return;
    state.Z = Z;
    if (!quiet && snd() && Z !== lastToneZ) {
      const v = state.prop === 'cat' ? null : shownVal(Z, state.prop), t = v == null ? null : norm(state.prop, v);
      if (t == null) window.LabSound.tone({ freq: 300, dur: 0.06, gain: 0.04, type: 'triangle' });
      else window.LabSound.tone({ freq: 300 + 900 * t, dur: 0.09, gain: 0.06, type: 'sine' });
    }
    lastToneZ = Z;
    refreshAll();
    report();
  }
  function setProp(p) {
    if (p === state.prop) return;
    if (game.on && !game.revealed && p !== game.prop) {
      endRound(T('換了著色的性質，這一題結束，連續猜中歸零。', 'You changed the property, so this round is over and the streak is reset.'));
    }
    state.prop = p;
    if (p !== 'cat') state.lastNum = p;
    if (snd()) window.LabSound.sweep({ from: 440, to: 660, dur: 0.12, gain: 0.05, type: 'sine' });
    refreshAll();
    report();
  }
  function setTab(t) { state.tab = t; refreshAll(); report(); }
  function report() {
    const q = P.pos(state.Z);
    emit('select', { Z: state.Z, prop: state.prop, hiddenSel: state.prop !== 'cat' && isHidden(state.Z, state.prop) });
    emit('graph', { tab: state.tab, prop: gp(), period: q.period, group: q.group, Z: state.Z, hiddenSel: isHidden(state.Z, gp()) });
  }
  function syncSegs() {
    document.querySelectorAll('#propSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.prop === state.prop)); });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab)); });
  }
  function setStatus(s) { $('status').textContent = s || ''; }
  function findEl(s) {
    s = String(s || '').normalize('NFKC').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) { const z = +s; return z >= 1 && z <= P.N ? z : null; }
    const lo = s.toLowerCase();
    for (let Z = 1; Z <= P.N; Z++) { const e = P.EL[Z]; if (e.sym.toLowerCase() === lo) return Z; }
    for (let Z = 1; Z <= P.N; Z++) { const e = P.EL[Z]; if (e.en.toLowerCase() === lo || e.zh === s || T(e.zh, e.en) === s) return Z; }
    for (let Z = 1; Z <= P.N; Z++) { const e = P.EL[Z]; if (lo.length >= 3 && e.en.toLowerCase().indexOf(lo) === 0) return Z; }
    return null;
  }
  function goFind() {
    acted();
    const Z = findEl($('findEl').value);
    if (Z == null) { setStatus(T('找不到「' + $('findEl').value + '」。請輸入元素符號（例如 Na）、名稱或原子序（1–118）。', 'Could not find “' + $('findEl').value + '”. Type a symbol (such as Na), a name or an atomic number (1–118).')); return; }
    setStatus('');
    selectZ(Z);
  }

  // ======================= 猜猜看 =======================
  function startRound() {
    acted();
    if (P.GAME_PROPS.indexOf(state.prop) < 0) {
      state.prop = 'IE'; state.lastNum = 'IE';
      setStatus(T('猜猜看只考原子半徑、游離能與電負度，已改成依游離能著色。', 'The guessing game uses atomic radius, ionization energy or electronegativity, so the colouring has switched to ionization energy.'));
    }
    game.on = true; game.prop = state.prop; game.revealed = false; game.n++;
    game.Z = P.pick(game.prop, Math.random, game.lastZ);
    game.lastZ = game.Z;
    state.Z = game.Z;
    $('guess').value = '';
    $('gameOut').textContent = '';
    setGameUI();
    refreshAll();
    report();
    if (snd()) window.LabSound.sweep({ from: 520, to: 880, dur: 0.18, gain: 0.05, type: 'triangle' });
    startPulse();
  }
  function setGameUI() {
    const open = game.on && !game.revealed;
    $('gameOn').hidden = game.on;
    $('gameNext').hidden = !game.on || open;
    $('gameIn').hidden = !open;
    if (game.on) {
      const u = unitOf(game.prop);
      $('guessLabel').textContent = T('你的預測', 'Your prediction') + (u ? (isEn() ? ' (' + u + ')' : '（' + u + '）') : '');
      $('gameQ').textContent = T('第 ' + game.n + ' 題：閃爍的「?」是 ' + nmFull(game.Z) + '。由鄰居推出它的' + propName(game.prop) + '。',
        'Round ' + game.n + ': the flashing “?” is ' + nmFull(game.Z) + '. Predict its ' + propName(game.prop).toLowerCase() + ' from its neighbours.') +
        (game.streak ? T('（目前連續猜中 ' + game.streak + ' 題）', ' (current streak: ' + game.streak + ')') : '');
    } else $('gameQ').textContent = '';
  }
  function check() {
    if (!game.on || game.revealed) return;
    acted();
    const g = parseNum($('guess').value);
    if (!isFinite(g)) { $('gameOut').textContent = T('請輸入一個數字。', 'Please type a number.'); return; }
    const actual = P.value(game.Z, game.prop), err = P.guessErr(g, actual), hit = err <= HIT;
    game.streak = hit ? game.streak + 1 : 0;
    game.best = Math.max(game.best, game.streak);
    game.revealed = true;
    game.hist.unshift({ Z: game.Z, prop: game.prop, guess: g, actual: actual, err: err, hit: hit });
    if (game.hist.length > 12) game.hist.length = 12;
    $('gameOut').textContent = T('實際值 ' + fmt(game.prop, actual, true) + '，你猜 ' + fmt(game.prop, g, true) + '，誤差 ' + pct(err) + '。',
      'The actual value is ' + fmt(game.prop, actual, true) + '; you guessed ' + fmt(game.prop, g, true) + ', off by ' + pct(err) + '. ') +
      (hit ? T('猜中了！連續猜中 ' + game.streak + ' 題。', 'A hit! Streak: ' + game.streak + '.') : T('差了一點，連續猜中歸零。看看它和鄰居的關係再試一題。', 'Not quite; the streak is reset. Compare it with its neighbours and try another.'));
    if (snd()) {
      if (hit) { window.LabSound.tone({ freq: 784, dur: 0.1, gain: 0.08 }); window.LabSound.tone({ freq: 1175, dur: 0.18, gain: 0.08, delay: 0.11 }); }
      else window.LabSound.tone({ freq: 392, dur: 0.16, gain: 0.07, type: 'triangle' });
    }
    emit('predict', { prop: game.prop, Z: game.Z, guess: g, actual: actual, err: err, hit: hit, streak: game.streak });
    setGameUI(); renderGameTable(); refreshAll();
  }
  function giveUp() {
    if (!game.on || game.revealed) return;
    acted();
    const actual = P.value(game.Z, game.prop);
    game.revealed = true; game.streak = 0;
    $('gameOut').textContent = T('答案是 ' + fmt(game.prop, actual, true) + '。連續猜中歸零。', 'The answer is ' + fmt(game.prop, actual, true) + '. The streak is reset.');
    setGameUI(); refreshAll();
  }
  function endRound(msg) {
    game.revealed = true; game.streak = 0;
    $('gameOut').textContent = msg;
    setGameUI();
  }
  function clearGame() {
    acted();
    game.on = false; game.revealed = true; game.streak = 0; game.best = 0; game.hist = []; game.n = 0;
    $('gameOut').textContent = '';
    setGameUI(); renderGameTable(); refreshAll();
    setStatus(T('已清除猜猜看的紀錄與連勝。', 'The guesses and the streak have been cleared.'));
  }
  function renderGameTable() {
    const t = $('gameTbl');
    let h = '<thead><tr><th>' + T('元素', 'Element') + '</th><th style="text-align:left">' + T('性質', 'Property') + '</th><th>' + T('預測', 'Guess') + '</th><th>' + T('實際', 'Actual') + '</th><th>' + T('誤差', 'Error') + '</th></tr></thead><tbody>';
    if (!game.hist.length) h += '<tr class="empty"><td colspan="5">' + T('還沒有紀錄。按「開始」猜第一題。', 'Nothing yet. Press Start for the first round.') + '</td></tr>';
    game.hist.forEach(function (r) {
      h += '<tr><td>' + P.EL[r.Z].sym + '</td><td class="l">' + propName(r.prop) + '</td><td>' + fmt(r.prop, r.guess) + '</td><td>' + fmt(r.prop, r.actual) + '</td><td style="color:' + (r.hit ? col.probe : col.pos) + '">' + pct(r.err) + (r.hit ? ' ✓' : '') + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  let pulseRaf = 0, pulseT0 = 0;
  function startPulse() {
    if (reducedMotion || pulseRaf) return;
    pulseT0 = performance.now();
    const loop = function (now) {
      pulseRaf = 0;
      if (!game.on || game.revealed || document.hidden) { drawTable(); return; }
      pulse = (now - pulseT0) / 1000;
      if (state.view === '2d') drawTable();
      pulseRaf = requestAnimationFrame(loop);
    };
    pulseRaf = requestAnimationFrame(loop);
  }

  // ======================= 全部重畫 =======================
  function refreshAll() {
    syncSegs();
    updateLegend();
    updateCard();
    drawTable(); drawGraph(); drawShell();
    if (view3) view3.update();
    if (game.on) setGameUI();
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
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
      T: T, host: host3, N: P.N,
      cell: function (Z) {
        const q = P.pos(Z), p = state.prop;
        const hid = game.on && !game.revealed && Z === game.Z && (p === 'cat' || p === game.prop);
        let t;
        if (p === 'cat') t = null; else t = hid ? null : norm(p, P.value(Z, p));
        return { row: q.row, col: q.col, sym: P.EL[Z].sym, t: t, color: hid ? col.none : cellColor(Z), noData: !hid && p !== 'cat' && t == null, hidden: hid, cat: p === 'cat' };
      },
      selected: function () { return state.Z; },
      select: function (Z) { acted(); selectZ(Z); },
      colors: function () { return col; },
      hud: function () {
        const Z = state.Z, e = P.EL[Z];
        return {
          tl: propName(state.prop) + (state.prop === 'cat' ? '' : (RANGE[state.prop].log ? T('（高度：對數）', ' (height: log scale)') : '')),
          tr: e.sym + ' ' + nm(Z) + (state.prop === 'cat' ? '  ' + T(P.CATS[e.cat][0], P.CATS[e.cat][1]) : '  ' + (isHidden(Z, state.prop) ? '?' : fmt(state.prop, P.value(Z, state.prop), true)))
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
      if (!webglAvailable() || !window.PT3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.PT3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update();
        emit('view3d', { prop: state.prop });
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
      if (game.on && !game.revealed) startPulse();
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
    const p = canvasPoint(cv, ev), Z = hitTable(p[0], p[1]);
    acted();
    if (Z) selectZ(Z);
  });
  gcv.addEventListener('click', function (ev) {
    const p = canvasPoint(gcv, ev), Z = hitGraph(p[0], p[1]);
    acted();
    if (Z) selectZ(Z);
  });
  document.querySelectorAll('#propSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); setProp(b.dataset.prop); }); });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); setTab(b.dataset.tab); }); });
  $('prevEl').addEventListener('click', function () { acted(); selectZ(state.Z > 1 ? state.Z - 1 : P.N); });
  $('nextEl').addEventListener('click', function () { acted(); selectZ(state.Z < P.N ? state.Z + 1 : 1); });
  $('goEl').addEventListener('click', goFind);
  $('findEl').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goFind(); } });
  $('gameOn').addEventListener('click', startRound);
  $('gameNext').addEventListener('click', startRound);
  $('gameClear').addEventListener('click', clearGame);
  $('check').addEventListener('click', check);
  $('giveUp').addEventListener('click', giveUp);
  $('guess').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } });
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

  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('週期表。方向鍵在表上移動選取元素；按 Enter 切換到「著色的性質」，再用方向鍵換性質。',
        'Periodic table. The arrow keys move the selection around the table; press Enter to switch to “colour by”, then use the arrow keys to change the property.'),
      items: [
        { name: function () { return T('元素', 'Element'); },
          move: function (dx, dy) {
            if (!dx && !dy) return false;
            acted();
            const z = gridMove(state.Z, Math.sign(dx), -Math.sign(dy));   // LabKeys：往上是 +1；表上往上是列號變小
            if (z) selectZ(z);
            return true;
          },
          describe: function () {
            const Z = state.Z;
            return nmFull(Z) + T('，原子序 ', ', atomic number ') + Z + T('，第 ', ', period ') + P.pos(Z).period + T(' 週期，', ', ') +
              (state.prop === 'cat' ? T(P.CATS[P.EL[Z].cat][0], P.CATS[P.EL[Z].cat][1]) : propName(state.prop) + ' ' + (isHidden(Z, state.prop) ? '?' : fmt(state.prop, P.value(Z, state.prop), true)));
          } },
        { name: function () { return T('著色的性質', 'Colour by'); },
          move: function (dx, dy) {
            const d = dx || -dy; if (!d) return false;
            const L6 = NUM_PROPS.concat(['cat']), i = L6.indexOf(state.prop);
            acted();
            setProp(L6[(i + (d > 0 ? 1 : -1) + L6.length) % L6.length]);
            return true;
          },
          describe: function () { return propName(state.prop); } }
      ],
      onChange: function () { drawTable(); }
    });
  }

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    if (view3) view3.onTheme();
    renderGameTable();
    updateSoundButton();
    refreshAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0, ls = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
    new ResizeObserver(function () { if (shcv.clientWidth !== ls) { ls = shcv.clientWidth; resizeShell(); drawShell(); } }).observe(shcv);
  } else window.addEventListener('resize', resize);

  // 測試用（Playwright）
  window.__ptr = {
    state: state, game: game, select: function (Z) { acted(); selectZ(Z); }, setProp: function (p) { acted(); setProp(p); },
    setTab: function (t) { acted(); setTab(t); }, hidden: isHidden,
    cell: function (Z) { const r = cellRect(Z); return [r.x + r.w / 2, r.y + r.h / 2]; },
    bar: function (Z) { const h = gHits.filter(function (x) { return x.Z === Z; })[0]; return h ? [h.x, h.y] : null; }
  };

  // ======================= 啟動 =======================
  readColors();
  cw = cv.clientWidth || 600; layout();
  updateSoundButton();
  renderGameTable();
  setGameUI();
  resize();
  refreshAll();
})();
