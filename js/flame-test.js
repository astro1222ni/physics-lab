/*
 * flame-test.js — 「焰色反應」的頁面程式（本生燈與分光鏡的 2D 畫面、光譜圖、游標量測、未知樣品、能階圖、3D 切換、任務事件）
 * 化學計算在 js/flame-test-core.js（FlameCore）；3D 檢視在 js/flame-test-3d.js（FT3D）。畫面只「讀」核心算出的光譜與溫度。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'flame'：設定改變後（0.25 s 後）{ metals, unknown, conc, air, h, T（發光區 K）, Tw（白金絲 K）, hp, Hc, inCone, cobalt, lamp, TL, color（名稱）, dw, Ym, soot }
 *   'measure'：游標量測（拖曳放開、‹ › « »、找亮線、找暗線、記錄）{ lam, eV, sig, near{el,lam,d}, net, contrast, isPeak, isDip, resolvedD,
 *              metals, unknown, cobalt, lamp, TL, T, air, h, hp, Hc, inCone, soot, res, log, zoom, hotRatio }
 *   'identify'：未知樣品按「核對」{ correct, n（幾種金屬）, metals, answer, streak, mixNoCo（連續答對、沒用鈷玻璃的兩種金屬題數）, usedCobalt, usedScope }
 *   'view3d'：3D 檢視開啟成功 {}
 */
(function () {
  'use strict';
  const C = window.FlameCore, LD = window.LabDraw;
  if (!C || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const isEn = function () { return T('0', '1') === '1'; };
  const reduced = LD.reducedMotion();
  const FONT = LD.FONT;

  // ======================= 狀態 =======================
  const state = { metals: [], conc: 0.1, air: 0.8, h: 45, cobalt: false, lamp: false, TL: 2400, res: 1, cur: 550, zoom: 420, log: false, view: '2d' };
  const unk = { kind: 1, active: null, answer: [], streak: 0, mixNoCo: 0, n: 0, hist: [], last: null, R: C.rng((Date.now() ^ 0x5f3759df) >>> 0) };
  const recs = [];
  let S = null, col = null, userActed = false, view3 = null;
  function acted() { userActed = true; }
  function emit(type, data) { if (userActed && window.LabMission) window.LabMission.emit(type, data); }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function sampleMetals() { return unk.active ? unk.active.metals : state.metals; }
  function sampleConc() { return unk.active ? unk.active.conc : state.conc; }
  function mName(s) { const m = C.METALS[s]; return T(m.zh, m.en.charAt(0).toUpperCase() + m.en.slice(1)); }

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sig3(x) { if (!(x > 0)) return num(x, 0); const e = Math.floor(Math.log10(x)); return num(x, Math.max(0, 2 - e)); }
  function roundSig(x, n) { if (!(x > 0)) return x; const p = Math.pow(10, n - 1 - Math.floor(Math.log10(x))); return Math.round(x * p) / p; }
  function lamDec() { return state.zoom >= 400 ? 1 : state.zoom >= 40 ? 2 : 3; }

  // ======================= 滑桿 =======================
  const concEl = $('conc'), resEl = $('res'), airEl = $('air'), hEl = $('hgt'), tlEl = $('tl');
  const concMap = {
    toValue: function (p) { return roundSig(Math.pow(10, -3 + 3 * p / 1000), 3); },
    toPos: function (v) { return 1000 * (Math.log10(Math.max(0.001, v)) + 3) / 3; },
    min: 0.001, max: 1, decimals: 4
  };
  const resMap = {
    toValue: function (p) { return roundSig(0.05 * Math.pow(60, p / 1000), 3); },
    toPos: function (v) { return 1000 * Math.log(Math.max(0.05, v) / 0.05) / Math.log(60); },
    min: 0.05, max: 3, decimals: 3
  };
  if (window.LabNum) { window.LabNum.register(concEl, concMap); window.LabNum.register(resEl, resMap); }
  function val(el, map) { return window.LabNum ? window.LabNum.value(el) : map ? map.toValue(+el.value) : +el.value; }
  function setSlider(el, v) { if (window.LabNum) window.LabNum.set(el, v); else el.value = String(v); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function readSliders() {
    state.conc = clamp(val(concEl, concMap), 0.001, 1);
    state.res = clamp(val(resEl, resMap), 0.05, 3);
    state.air = clamp(val(airEl), 0, 100) / 100;
    state.h = clamp(val(hEl), 0, 120);
    state.TL = clamp(val(tlEl), 1000, 3000);
    state.cobalt = $('cobalt').checked;
    state.lamp = $('lamp').checked;
    state.log = $('logY').checked;
  }
  function showOutputs() {
    $('conco').textContent = sig3(state.conc) + ' mol/L';
    $('reso').textContent = (state.res < 0.1 ? num(state.res, 3) : state.res < 1 ? num(state.res, 2) : num(state.res, 2)) + ' nm';
    $('airo').textContent = num(state.air * 100, 0) + '%';
    $('hgto').textContent = num(state.h, 1) + ' mm';
    $('tlo').textContent = num(state.TL, 0) + ' K';
    tlEl.disabled = !state.lamp;
    $('tlRow').style.opacity = state.lamp ? '' : '0.6';
  }

  // ======================= 計算 =======================
  function compute() {
    S = C.spectrum({ metals: sampleMetals(), conc: sampleConc(), air: state.air, h: state.h, cobalt: state.cobalt, lamp: state.lamp, TL: state.TL, res: state.res });
    col = C.flameColor(S);
  }
  /** 顯示用：每條線的峰高照真實解析度，寬度至少 minSg（nm，避免比一個像素還細而看不到） */
  function dispVal(lam, minSg) {
    const sg = state.res / 2.3548, se = Math.max(sg, minSg || 0);
    let s = S.continuum(lam);
    const k = 1 / (sg * Math.sqrt(2 * Math.PI));
    for (let i = 0; i < S.lines.length; i++) {
      const u = (lam - S.lines[i].lam) / se;
      if (u > -7 && u < 7) s += S.lines[i].net * k * Math.exp(-0.5 * u * u);
    }
    return Math.max(0, s);
  }
  function visMax() {
    let m = 0;
    for (let l = C.LMIN; l <= C.LMAX; l += 0.5) m = Math.max(m, S.continuum(l));
    S.lines.forEach(function (l) { if (l.lam >= C.LMIN && l.lam <= C.LMAX) m = Math.max(m, dispVal(l.lam)); });
    return m;
  }
  function bbRGB(Tk) {
    const xyz = [0, 0, 0];
    for (let l = 380; l <= 780; l += 5) { const b = C.planck(l, Tk), c = C.cmf(l); xyz[0] += b * c[0]; xyz[1] += b * c[1]; xyz[2] += b * c[2]; }
    const c = C.colorOf(xyz);
    return c ? c.rgb : [255, 160, 80];
  }
  const rgbStr = function (c, a) { return a == null ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')' : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  /** 人眼感覺的亮度（對數）：相對 0.1 M 鈉焰 */
  function brightOf(Y) { return Y > 0 ? clamp((Math.log10(Y) + 4) / 4, 0, 1) : 0; }

  // ======================= 顏色 =======================
  let pal = {};
  function readColors() {
    const c = LD.c;
    pal = { text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface, pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: LD.dark };
  }

  // ======================= 主畫面（2D） =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let cw = 600, ch = 420, dpr = 1, G = null, drag = null, flick = 0;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w; ch = w < 560 ? Math.round(Math.max(380, w * 1.05)) : 440;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout(); draw();
  }
  function layout() {
    const narrow = cw < 560;
    const stripH = narrow ? 30 : 34, stripY = ch - stripH - 24;
    const top = 12, bottom = stripY - 26;
    const bx = cw * (narrow ? 0.34 : 0.32);
    const tubeH = (bottom - top) * 0.2;
    const yTop = bottom - tubeH;
    const s = (yTop - top - 6) / 135;            // px / mm
    G = { narrow: narrow, top: top, bottom: bottom, bx: bx, yTop: yTop, s: s, tubeR: Math.max(7, 7 * s), stripX: narrow ? 10 : 16, stripW: cw - (narrow ? 20 : 32), stripY: stripY, stripH: stripH,
      sx: cw * (narrow ? 0.66 : 0.6), lampX: cw * (narrow ? 0.07 : 0.06), coX: cw * (narrow ? 0.555 : 0.51) };
  }
  function yOf(hmm) { return G.yTop - hmm * G.s; }
  function flameR(hmm, F, wob) {
    const u = hmm / F.Hf;
    if (u < 0 || u > 1) return 0;
    const r0 = G.tubeR * 1.05;
    return r0 * (1 + 1.1 * Math.sin(Math.PI * Math.pow(u, 0.55) * 0.9)) * Math.pow(1 - u, 0.5) * (1 + (wob || 0) * Math.sin(u * 9 + flick * 7) * u);
  }
  function tempColor(Tk) {
    const u = clamp((Tk - 300) / 1600, 0, 1);
    const stops = pal.dark ? ['#20263a', '#5a2a6e', '#b8323a', '#f08a2c', '#ffe9a8'] : ['#d9dee8', '#8c6bb8', '#d0453b', '#f39a33', '#ffe27a'];
    const x = u * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
    return LD.mix(stops[i], stops[i + 1], x - i);
  }
  function draw() {
    if (!G || !S) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(c, cw, ch);
    const F = S.F, bx = G.bx;
    // ---- 實驗桌 ----
    const tg = c.createLinearGradient(0, G.bottom, 0, G.bottom + 14);
    tg.addColorStop(0, LD.alpha(pal.text, pal.dark ? 0.16 : 0.12)); tg.addColorStop(1, LD.alpha(pal.text, 0));
    c.fillStyle = tg; c.fillRect(0, G.bottom, cw, 14);
    // ---- 背景燈 ----
    const wy = yOf(state.h), zy = yOf(Math.min(state.h + 5, 135));
    if (state.lamp) {
      const lc = bbRGB(state.TL), lx = G.lampX + 10, r = Math.max(9, 11 * G.s / 1.6);
      const glow = c.createRadialGradient(lx, zy, 1, lx, zy, r * 3.2);
      glow.addColorStop(0, rgbStr(lc, 0.75)); glow.addColorStop(1, rgbStr(lc, 0));
      c.fillStyle = glow; c.beginPath(); c.arc(lx, zy, r * 3.2, 0, 7); c.fill();
      LD.ball(c, lx, zy, r, rgbStr(lc));
      c.save(); c.setLineDash([5, 5]); c.strokeStyle = rgbStr(lc, 0.55); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(lx + r, zy); c.lineTo(G.sx, zy); c.stroke(); c.restore();
      LD.pill(c, T('燈 ', 'Lamp ') + num(state.TL, 0) + ' K', Math.max(4, lx - r), zy + r + 22, pal.muted, 'left', '600 11px ' + FONT);
    }
    // ---- 溫度色條 ----
    const tbX = bx - G.tubeR * 3.3 - 26, tbW = 10, hMax = 135;
    for (let k = 0; k < 135; k += 1.5) {
      c.fillStyle = tempColor(C.temperature(k + 0.75, state.air));
      c.fillRect(tbX, yOf(k + 1.5), tbW, G.s * 1.5 + 0.6);
    }
    c.strokeStyle = LD.alpha(pal.text, 0.25); c.lineWidth = 1; c.strokeRect(tbX + 0.5, yOf(hMax) + 0.5, tbW - 1, G.s * hMax - 1);
    // 最熱的地方：星號
    star(c, tbX - 9, yOf(F.hp), 5.5, pal.pos);
    c.save(); c.setLineDash([2, 3]); c.strokeStyle = LD.alpha(pal.pos, 0.55); c.beginPath(); c.moveTo(tbX + tbW + 2, yOf(F.hp)); c.lineTo(bx - flameR(F.hp, F) - 4, yOf(F.hp)); c.stroke(); c.restore();
    if (!G.narrow) LD.haloText(c, T('最熱', 'Hottest'), tbX - 16, yOf(F.hp) + 4, pal.pos, 'right', 'alphabetic', '600 11px ' + FONT);
    // ---- 本生燈 ----
    burner(c, bx);
    // ---- 火焰 ----
    flame(c, bx, F);
    // ---- 白金絲 ----
    wire(c, bx, wy);
    // ---- 鈷玻璃 ----
    if (state.cobalt) {
      const gx = G.coX, gh = 120 * G.s * 0.55, gy = zy - gh / 2;
      const gg = c.createLinearGradient(gx, 0, gx + 10, 0);
      gg.addColorStop(0, 'rgba(40,70,200,0.55)'); gg.addColorStop(0.5, 'rgba(70,110,240,0.75)'); gg.addColorStop(1, 'rgba(30,50,170,0.55)');
      c.fillStyle = gg; LD.roundRect(c, gx, gy, 10, gh, 3); c.fill();
      c.strokeStyle = 'rgba(200,220,255,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(gx + 2.5, gy + 4); c.lineTo(gx + 2.5, gy + gh - 4); c.stroke();
      LD.pill(c, T('鈷玻璃', 'Cobalt glass'), gx + 5, gy - 4, '#3a5bd0', 'center', '600 11px ' + FONT);
    }
    // ---- 分光鏡 ----
    spectroscope(c, zy);
    // ---- 目鏡中的光譜 ----
    strip(c);
  }
  function star(c, x, y, r, color) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    c.closePath(); c.fillStyle = color; c.fill(); c.strokeStyle = LD.alpha(pal.bg, 0.9); c.lineWidth = 1; c.stroke();
  }
  function burner(c, bx) {
    const r = G.tubeR, yT = G.yTop, yB = G.bottom;
    // 底座
    const bw = r * 4.2, bh = Math.max(8, (yB - yT) * 0.16);
    LD.contactShadow(c, bx, yB, bw * 0.6, 0);
    const metal = pal.dark ? '#8d96a6' : '#a9b2bf';
    LD.block(c, bx - bw / 2, yB - bh, bw, bh, metal, { r: 5 });
    // 燈管（圓柱：左右暗、中間亮）
    const g = c.createLinearGradient(bx - r, 0, bx + r, 0);
    g.addColorStop(0, LD.shade(metal, -0.35)); g.addColorStop(0.35, LD.shade(metal, 0.45)); g.addColorStop(0.6, metal); g.addColorStop(1, LD.shade(metal, -0.45));
    c.fillStyle = g; c.fillRect(bx - r, yT, 2 * r, yB - bh - yT);
    // 空氣調節環與空氣孔
    const ry = yB - bh - (yB - yT) * 0.32, rh = (yB - yT) * 0.16;
    const g2 = c.createLinearGradient(bx - r * 1.25, 0, bx + r * 1.25, 0);
    g2.addColorStop(0, LD.shade('#b08a4a', -0.35)); g2.addColorStop(0.4, LD.shade('#c9a35c', 0.35)); g2.addColorStop(1, LD.shade('#b08a4a', -0.45));
    c.fillStyle = g2; LD.roundRect(c, bx - r * 1.25, ry, r * 2.5, rh, 3); c.fill();
    const hw = r * 0.9 * state.air;
    if (hw > 0.5) { c.fillStyle = LD.alpha('#000000', 0.55); LD.roundRect(c, bx - hw / 2, ry + rh * 0.25, hw, rh * 0.5, 2); c.fill(); }
    // 管口
    c.fillStyle = LD.shade(metal, -0.5); c.fillRect(bx - r, yT - 1, 2 * r, 2);
    // 瓦斯管
    c.strokeStyle = pal.dark ? '#c0603a' : '#d0704a'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(bx - bw / 2, yB - bh * 0.5); c.quadraticCurveTo(bx - bw, yB - 2, Math.max(4, bx - bw * 1.6), yB - 1); c.stroke();
    if (!G.narrow) LD.haloText(c, T('空氣孔', 'Air hole'), bx + r * 1.35 + 4, ry + rh * 0.7, pal.muted, 'left', 'alphabetic', '11px ' + FONT);
  }
  function flame(c, bx, F) {
    const wob = reduced ? 0 : 0.035;
    const N = 60;
    const path = function (scale) {
      c.beginPath();
      c.moveTo(bx - G.tubeR, G.yTop);
      for (let i = 0; i <= N; i++) { const hh = F.Hf * i / N; c.lineTo(bx - flameR(hh, F, wob) * scale, yOf(hh)); }
      for (let i = N; i >= 0; i--) { const hh = F.Hf * i / N; c.lineTo(bx + flameR(hh, F, wob) * scale, yOf(hh)); }
      c.closePath();
    };
    c.save();
    c.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over';
    // 外焰：本生燈自己的淡藍色
    const og = c.createLinearGradient(0, G.yTop, 0, yOf(F.Hf));
    og.addColorStop(0, 'rgba(90,120,255,' + (pal.dark ? 0.35 : 0.28) + ')'); og.addColorStop(1, 'rgba(120,140,255,0.04)');
    path(1); c.fillStyle = og; c.fill();
    // 煤灰（黃色發光火焰）
    const soot = S.sootShare();
    const sootA = clamp((0.5 - state.air) * 2, 0, 1);
    if (sootA > 0) {
      const sg = c.createLinearGradient(0, G.yTop, 0, yOf(F.Hf));
      sg.addColorStop(0, 'rgba(255,200,80,' + 0.15 * sootA + ')'); sg.addColorStop(0.35, 'rgba(255,190,70,' + 0.85 * sootA + ')'); sg.addColorStop(1, 'rgba(255,140,40,' + 0.25 * sootA + ')');
      path(0.95); c.fillStyle = sg; c.fill();
    }
    // 金屬的焰色：從白金絲往上
    const b = brightOf(col && col.Ym) * (1 - 0.7 * soot);
    if (col && col.mrgb && b > 0.01 && state.h < F.Hf + 10) {
      const y0 = yOf(Math.max(0, state.h - 2)), y1 = yOf(F.Hf);
      const mc = state.cobalt ? col.rgb : col.mrgb;
      const mg = c.createLinearGradient(0, y0, 0, y1);
      mg.addColorStop(0, rgbStr(mc, 0)); mg.addColorStop(0.08, rgbStr(mc, 0.9 * b)); mg.addColorStop(0.55, rgbStr(mc, 0.7 * b)); mg.addColorStop(1, rgbStr(mc, 0.05));
      c.save();
      c.beginPath(); c.rect(0, y1 - 4, cw, Math.max(0, y0 - y1 + 4)); c.clip();
      path(0.92); c.fillStyle = mg; c.fill();
      c.restore();
    }
    // 內焰（藍綠色的錐）
    if (F.Hc > 0) {
      const ap = yOf(F.Hc);
      const ig = c.createLinearGradient(0, G.yTop, 0, ap);
      ig.addColorStop(0, 'rgba(60,110,255,0.75)'); ig.addColorStop(1, 'rgba(70,200,230,0.85)');
      c.beginPath(); c.moveTo(bx - G.tubeR * 0.95, G.yTop); c.quadraticCurveTo(bx - G.tubeR * 0.7, ap + (G.yTop - ap) * 0.4, bx, ap);
      c.quadraticCurveTo(bx + G.tubeR * 0.7, ap + (G.yTop - ap) * 0.4, bx + G.tubeR * 0.95, G.yTop); c.closePath();
      c.strokeStyle = ig; c.lineWidth = 2.2; c.stroke();
      c.fillStyle = 'rgba(80,140,255,0.12)'; c.fill();
    }
    c.restore();
    // 標籤
    // 「外焰」標在火焰右側，避開光路（白金絲上方 5 mm）與白金絲下方的溫度標籤
    const ly = [0.85, 0.62, 0.4].map(function (u) { return F.Hf * u; }).filter(function (y) { return Math.abs(y - (state.h + 5)) > 9 && Math.abs(y - (state.h - 9)) > 9 && y > F.Hc + 4; })[0] || F.Hf * 0.85;
    const lx = bx + flameR(ly, F) + 8;
    if (F.Hc > 0) {
      LD.haloText(c, T('內焰', 'Inner cone'), bx + G.tubeR * 0.9 + 6, yOf(F.Hc * 0.55), pal.muted, 'left', 'middle', '11px ' + FONT);
    }
    LD.haloText(c, T('外焰', 'Outer flame'), lx, yOf(ly), pal.muted, 'left', 'middle', '11px ' + FONT);
  }
  function wire(c, bx, wy) {
    const x1 = G.coX - (state.cobalt ? 18 : 6), Tw = S.Tw;
    // 握把
    c.strokeStyle = pal.dark ? '#9aa3b0' : '#7d8794'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(bx + 5, wy); c.lineTo(x1 - 20, wy); c.stroke();
    LD.block(c, x1 - 22, wy - 4, 26, 8, pal.dark ? '#5b6573' : '#8a6f4e', { r: 3 });
    // 白金絲（熱時發紅）
    const hot = clamp((Tw - 900) / 900, 0, 1);
    const wc = LD.mix(pal.dark ? '#c9ced6' : '#9aa1ab', '#ffb060', hot);
    c.strokeStyle = wc; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(bx + 5, wy); c.lineTo(bx + 30, wy); c.stroke();
    c.beginPath(); c.arc(bx, wy, 4.5, 0, 7); c.stroke();
    if (hot > 0.05) { const g = c.createRadialGradient(bx, wy, 0, bx, wy, 12); g.addColorStop(0, 'rgba(255,170,90,' + 0.5 * hot + ')'); g.addColorStop(1, 'rgba(255,170,90,0)'); c.fillStyle = g; c.beginPath(); c.arc(bx, wy, 12, 0, 7); c.fill(); }
    if (sampleMetals().length) { c.fillStyle = 'rgba(245,245,245,0.85)'; c.beginPath(); c.arc(bx, wy + 3.5, 2.2, 0, 7); c.fill(); }
    // 拖曳提示
    if (drag || hoverWire) { c.strokeStyle = LD.alpha(pal.accent, 0.6); c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.arc(bx, wy, 11, 0, 7); c.stroke(); c.setLineDash([]); }
    const lab = num(Tw - 273.15, 0) + ' °C';
    LD.pill(c, T('白金絲 ', 'Wire ') + lab, bx + Math.max(flameR(state.h, S.F), G.tubeR) + 8, wy + 21, pal.text, 'left', '600 11px ' + FONT);
  }
  function spectroscope(c, zy) {
    const sx = G.sx, narrow = G.narrow, len = cw * (narrow ? 0.17 : 0.2), r = narrow ? 7 : 9;
    const px = sx + len, py = zy;
    // 入射光
    if (S.lines.length || state.lamp || state.air < 0.5) {
      c.save(); c.strokeStyle = LD.alpha(pal.text, 0.25); c.setLineDash([4, 4]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(G.bx + 14, zy); c.lineTo(sx, zy); c.stroke(); c.restore();
    }
    // 準直管
    const metal = pal.dark ? '#59616d' : '#5e6876';
    const g = c.createLinearGradient(0, py - r, 0, py + r);
    g.addColorStop(0, LD.shade(metal, 0.35)); g.addColorStop(0.45, metal); g.addColorStop(1, LD.shade(metal, -0.4));
    c.fillStyle = g; LD.roundRect(c, sx, py - r, len, 2 * r, 3); c.fill();
    c.fillStyle = '#111'; c.fillRect(sx - 1, py - r * 0.7, 3, r * 1.4);
    c.fillStyle = LD.alpha('#ffffff', 0.9); c.fillRect(sx, py - 0.6, 1.2, 1.2);
    // 稜鏡
    const pr = narrow ? 15 : 20, pcx = px + pr * 0.9, pcy = py;
    c.beginPath(); c.moveTo(pcx - pr, pcy + pr * 0.75); c.lineTo(pcx + pr, pcy + pr * 0.75); c.lineTo(pcx, pcy - pr * 1.05); c.closePath();
    const pg = c.createLinearGradient(pcx - pr, pcy - pr, pcx + pr, pcy + pr);
    pg.addColorStop(0, 'rgba(200,225,255,0.55)'); pg.addColorStop(1, 'rgba(120,160,220,0.35)');
    c.fillStyle = pg; c.fill(); c.strokeStyle = LD.alpha(pal.text, 0.45); c.lineWidth = 1; c.stroke();
    // 色散後的光線（最亮的幾條可見光）
    const vm = visMax(), list = topLines(8);
    const ex = pcx + pr * 0.55, ey = pcy;
    // 連續光譜（背景燈或煤灰）：一整片彩虹扇形
    if (vm > 0 && (state.lamp || S.sootShare() > 0.2)) {
      const L = Math.min(cw - ex - 8, (narrow ? 50 : 80));
      for (let lam = 400; lam <= 760; lam += 6) {
        const ang = 0.35 + 1.15 * ((1 / (lam * lam)) - 1 / (800 * 800)) / (1 / (380 * 380) - 1 / (800 * 800));
        const a = clamp(Math.sqrt(S.continuum(lam) / vm), 0, 0.55);
        if (a < 0.03) continue;
        c.strokeStyle = rgbStr(C.wavelengthRGB(lam) || [200, 200, 200], a); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + L * Math.cos(ang), ey + L * Math.sin(ang)); c.stroke();
      }
    }
    list.forEach(function (l) {
      const ang = 0.35 + 1.15 * ((1 / (l.lam * l.lam)) - 1 / (800 * 800)) / (1 / (380 * 380) - 1 / (800 * 800));   // 折射率 ∝ 1/λ²（柯西）
      const L = Math.min(cw - ex - 8, (narrow ? 50 : 80));
      const rgb = C.wavelengthRGB(l.lam) || [200, 200, 200], a = clamp(Math.sqrt(l.v / (vm || 1)), 0.08, 1);
      c.strokeStyle = rgbStr(rgb, a); c.lineWidth = 2;
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + L * Math.cos(ang), ey + L * Math.sin(ang)); c.stroke();
    });
    LD.haloText(c, T('分光鏡', 'Spectroscope'), sx + len / 2, py - r - 6, pal.muted, 'center', 'alphabetic', '600 11px ' + FONT);
  }
  /** 可見範圍裡最亮的幾條線（相同元素、相距 < 解析度的合併） */
  function topLines(n) {
    const out = [];
    S.lines.forEach(function (l) {
      if (l.lam < C.LMIN || l.lam > C.LMAX || l.net <= 0) return;
      const v = dispVal(l.lam);
      const o = out.filter(function (q) { return Math.abs(q.lam - l.lam) < Math.max(state.res, 0.3); })[0];
      if (o) { if (v > o.v) { o.v = v; o.lam = l.lam; } } else out.push({ lam: l.lam, v: v, el: l.el });
    });
    // 分子帶的中心也算（較寬的光）
    S.bands.forEach(function (b) { if (!out.some(function (q) { return Math.abs(q.lam - b.c) < 3; })) out.push({ lam: b.c, v: S.continuum(b.c), el: b.el, band: true }); });
    return out.sort(function (a, b) { return b.v - a.v; }).slice(0, n);
  }
  function strip(c) {
    const x0 = G.stripX, w = G.stripW, y0 = G.stripY, h = G.stripH;
    c.fillStyle = '#05060a'; LD.roundRect(c, x0, y0, w, h, 6); c.fill();
    const vm = visMax(), nmpp = (C.LMAX - C.LMIN) / w;
    if (vm > 0) {
      for (let i = 0; i < w; i++) {
        const lam = C.LMIN + (i + 0.5) * nmpp;
        const v = dispVal(lam, nmpp * 0.5) / vm;
        if (v < 0.004) continue;
        const rgb = C.wavelengthRGB(lam) || [120, 120, 120], b = Math.pow(clamp(v, 0, 1), 0.45);
        c.fillStyle = 'rgb(' + Math.round(rgb[0] * b) + ',' + Math.round(rgb[1] * b) + ',' + Math.round(rgb[2] * b) + ')';
        c.fillRect(x0 + i, y0 + 2, 1.2, h - 4);
      }
    }
    // 刻度
    c.strokeStyle = LD.alpha(pal.text, 0.5); c.lineWidth = 1;
    const step = G.narrow ? 100 : 50;
    for (let lam = 400; lam <= 800; lam += step) {
      const x = x0 + (lam - C.LMIN) / nmpp;
      c.beginPath(); c.moveTo(x + 0.5, y0 + h); c.lineTo(x + 0.5, y0 + h + 4); c.stroke();
      LD.haloText(c, String(lam), x, y0 + h + 15, pal.muted, 'center', 'alphabetic', '11px ' + FONT);
    }
    LD.haloText(c, T('波長（nm）', 'Wavelength (nm)'), x0 + w, y0 - 5, pal.muted, 'right', 'alphabetic', '11px ' + FONT);
    // 游標
    const cx = x0 + (state.cur - C.LMIN) / nmpp;
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx + 0.5, y0); c.lineTo(cx + 0.5, y0 + h); c.stroke();
    LD.haloText(c, T('目鏡中看到的光譜', 'Seen in the eyepiece'), x0 + 2, y0 - 5, pal.muted, 'left', 'alphabetic', '600 11px ' + FONT);
  }

  // ---- 拖曳白金絲 ----
  let hoverWire = false;
  function cpt(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function onWire(p) { const wy = yOf(state.h); return Math.abs(p[1] - wy) < 24 && p[0] > G.bx - 24 && p[0] < G.coX + 4; }
  cv.addEventListener('pointerdown', function (e) {
    const p = cpt(e);
    if (!onWire(p)) return;
    acted(); drag = { id: e.pointerId }; cv.setPointerCapture(e.pointerId); e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    const p = cpt(e);
    if (drag) {
      const h = clamp((G.yTop - p[1]) / G.s, 0, 120);
      setSlider(hEl, Math.round(h * 2) / 2); changed();
    } else {
      const hv = onWire(p);
      if (hv !== hoverWire) { hoverWire = hv; cv.style.cursor = hv ? 'ns-resize' : 'default'; draw(); }
    }
  });
  function endDrag() { if (drag) { drag = null; changed(); } }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ======================= 光譜圖 =======================
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let gw = 600, gh = 300, gdpr = 1, GR = null, gdrag = false;
  function resizeGraph() {
    const w = gcv.clientWidth; if (!w) return;
    gdpr = Math.min(window.devicePixelRatio || 1, 2);
    gw = w; gh = w < 560 ? 260 : 300;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * gdpr); gcv.height = Math.round(gh * gdpr);
  }
  function win() {
    if (state.zoom >= 420) return [C.LMIN, C.LMAX];
    const half = state.zoom / 2;
    let a = state.cur - half, b = state.cur + half;
    if (a < C.LMIN) { a = C.LMIN; b = a + state.zoom; }
    if (b > C.LMAX) { b = C.LMAX; a = b - state.zoom; }
    return [a, b];
  }
  function drawGraph() {
    if (!S) return;
    const c = gctx;
    c.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    LD.backdrop(c, gw, gh);
    const narrow = gw < 560;
    const L = narrow ? 40 : 52, R = 12, Tp = 30, B = 34;
    const W = gw - L - R, H = gh - Tp - B;
    const w = win(), a = w[0], b = w[1], nmpp = (b - a) / W;
    GR = { L: L, R: R, Tp: Tp, B: B, W: W, H: H, a: a, b: b };
    // 數值
    const vals = new Float64Array(Math.ceil(W) + 1);
    let vmax = 0;
    for (let i = 0; i <= W; i++) { const v = dispVal(a + i * nmpp, nmpp * 0.5); vals[i] = v; if (v > vmax) vmax = v; }
    const lg = state.log, DEC = 6;
    const top = vmax > 0 ? vmax * 1.08 : 1;
    const yv = function (v) {
      if (lg) { const lo = top * Math.pow(10, -DEC); const t = v <= lo ? 0 : Math.log10(v / lo) / DEC; return Tp + H - clamp(t, 0, 1) * H; }
      return Tp + H - clamp(v / top, 0, 1) * H;
    };
    // 格線與刻度
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
    const st = steps.filter(function (s) { return (b - a) / s <= (narrow ? 5 : 9); })[0] || 100;
    c.lineWidth = 1;
    for (let x = Math.ceil(a / st) * st; x <= b + 1e-9; x += st) {
      const px = L + (x - a) / nmpp;
      c.strokeStyle = LD.alpha(pal.text, 0.08); c.beginPath(); c.moveTo(Math.round(px) + 0.5, Tp); c.lineTo(Math.round(px) + 0.5, Tp + H); c.stroke();
      LD.haloText(c, num(x, st < 1 ? 1 : 0), px, Tp + H + 15, pal.muted, 'center', 'alphabetic', '11px ' + FONT);
    }
    LD.haloText(c, T('波長（nm）', 'Wavelength (nm)'), L + W, Tp + H + 29, pal.muted, 'right', 'alphabetic', '11px ' + FONT);
    if (lg) {
      for (let k = 0; k <= DEC; k += 2) { const y = Tp + H - k / DEC * H; c.strokeStyle = LD.alpha(pal.text, 0.08); c.beginPath(); c.moveTo(L, Math.round(y) + 0.5); c.lineTo(L + W, Math.round(y) + 0.5); c.stroke();
        LD.supText(c, '10', String(k - DEC).replace('-', '−'), L - 4, y + 4, pal.muted, '11px ' + FONT, 'right'); }
    } else {
      for (let k = 0; k <= 4; k++) { const y = Tp + H - k / 4 * H; c.strokeStyle = LD.alpha(pal.text, 0.08); c.beginPath(); c.moveTo(L, Math.round(y) + 0.5); c.lineTo(L + W, Math.round(y) + 0.5); c.stroke();
        LD.haloText(c, num(k * 25, 0), L - 4, y + 4, pal.muted, 'right', 'alphabetic', '11px ' + FONT); }
    }
    c.save(); c.translate(12, Tp + H / 2); c.rotate(-Math.PI / 2);
    LD.haloText(c, lg ? T('相對亮度（對數）', 'Relative brightness (log)') : T('相對亮度（%）', 'Relative brightness (%)'), 0, 0, pal.muted, 'center', 'middle', '11px ' + FONT); c.restore();
    c.strokeStyle = LD.alpha(pal.text, 0.35); c.strokeRect(L + 0.5, Tp + 0.5, W, H);
    // 填色（依波長）
    if (vmax > 0) {
      for (let i = 0; i <= W; i++) {
        const lam = a + i * nmpp, y = yv(vals[i]);
        if (y >= Tp + H - 0.5) continue;
        const rgb = C.wavelengthRGB(lam) || [140, 140, 150];
        c.fillStyle = rgbStr(rgb, pal.dark ? 0.75 : 0.6);
        c.fillRect(L + i, y, 1.1, Tp + H - y);
      }
      c.strokeStyle = pal.text; c.lineWidth = 1.2; c.lineJoin = 'round';
      c.beginPath();
      for (let i = 0; i <= W; i++) { const y = yv(vals[i]); if (i) c.lineTo(L + i, y); else c.moveTo(L, y); }
      c.stroke();
    } else {
      LD.haloText(c, T('沒有光（白金絲上沒有樣品，或不在火焰中）', 'No light (no sample on the wire, or the wire is out of the flame)'), L + W / 2, Tp + H / 2, pal.muted, 'center', 'middle', '13px ' + FONT);
    }
    // 樣品中金屬的譜線名稱（未知樣品時不標）
    if (!unk.active && vmax > 0) {
      const marks = [];
      S.lines.forEach(function (l) {
        if (l.lam < a || l.lam > b) return;
        const v = dispVal(l.lam, nmpp * 0.5), y = yv(v);
        if (y > Tp + H - 6 || Math.abs(l.net) <= 0) return;
        marks.push({ x: L + (l.lam - a) / nmpp, y: y, v: v, t: l.el + ' ' + num(l.lam, l.lam < 1000 && state.zoom < 40 ? 3 : 1) });
      });
      marks.sort(function (p, q) { return q.v - p.v; });
      const used = [];
      marks.forEach(function (m) {
        c.font = '600 11px ' + FONT;
        const tw = c.measureText(m.t).width + 12;
        if (used.some(function (u) { return Math.abs(u - m.x) < tw * 0.8; }) || used.length >= (narrow ? 4 : 7)) return;
        used.push(m.x);
        LD.pill(c, m.t, clamp(m.x, L + tw / 2, L + W - tw / 2), Math.max(Tp + 14, m.y - 4), pal.text, 'center', '600 11px ' + FONT);
      });
    }
    // 游標
    const cx = L + (state.cur - a) / nmpp;
    if (cx >= L - 1 && cx <= L + W + 1) {
      c.save(); c.strokeStyle = pal.accent; c.lineWidth = 1.5; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(Math.round(cx) + 0.5, Tp); c.lineTo(Math.round(cx) + 0.5, Tp + H); c.stroke(); c.restore();
      LD.pill(c, num(state.cur, lamDec()) + ' nm', clamp(cx, L + 34, L + W - 34), Tp - 4, pal.accent, 'center', '700 11px ' + FONT);
    }
  }
  function graphLam(e) { const r = gcv.getBoundingClientRect(), x = e.clientX - r.left; return GR ? clamp(GR.a + (x - GR.L) / GR.W * (GR.b - GR.a), C.LMIN, C.LMAX) : state.cur; }
  gcv.addEventListener('pointerdown', function (e) { acted(); gdrag = true; gcv.setPointerCapture(e.pointerId); setCur(graphLam(e), true); e.preventDefault(); });
  gcv.addEventListener('pointermove', function (e) { if (gdrag) setCur(graphLam(e), true); });
  function endG() { if (gdrag) { gdrag = false; measureNow(); } }
  gcv.addEventListener('pointerup', endG);
  gcv.addEventListener('pointercancel', endG);

  function setCur(l, keepWin) {
    const w = win();
    state.cur = clamp(l, C.LMIN, C.LMAX);
    if (state.zoom < 420 && keepWin && (state.cur < w[0] || state.cur > w[1])) { /* 視窗跟著移動 */ }
    drawGraph(); drawCurOut(); drawEnergy(); if (G) draw();
  }

  // ======================= 游標讀數、紀錄 =======================
  function nearestAll(l) { return C.nearestLine(l, C.ORDER); }
  function drawCurOut() {
    if (!S) return;
    const l = state.cur, e = C.photonEV(l), vm = visMax(), v = dispVal(l);
    const n = nearestAll(l);
    const rows = [
      [T('游標的波長', 'Cursor wavelength'), num(l, lamDec()) + ' nm', true],
      [T('光子能量', 'Photon energy'), num(e, 3) + ' eV'],
      [T('每莫耳光子', 'Per mole of photons'), num(e * C.EV_KJ, 1) + ' kJ/mol'],
      [T('相對亮度', 'Relative brightness'), vm > 0 ? (v / vm < 0.001 && v > 0 ? '< 0.1%' : num(100 * v / vm, 1) + '%') : '—']
    ];
    let html = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="big"' : '') + '>' + r[1] + '</dd>'; }).join('');
    if (n && n.d < 3) {
      html += '<dt>' + T('最接近的已知譜線', 'Nearest known line') + '<small>' + T('（九種金屬的原子譜線表）', '(atomic lines of the nine metals)') + '</small></dt><dd>' +
        n.el + ' ' + num(n.lam, 3) + ' nm<br><small>' + mName(n.el) + T('，相差 ', ', off by ') + num(n.d, 3) + ' nm</small></dd>';
    }
    $('curOut').innerHTML = html;
  }
  function renderRec() {
    const t = $('recTbl');
    let h = '<tr><th>#</th><th>' + T('波長', 'λ') + '<br><small>nm</small></th><th>' + T('能量', 'Energy') + '<br><small>eV</small></th><th class="l">' + T('最接近的已知譜線', 'Nearest known line') + '</th></tr>';
    if (!recs.length) h += '<tr class="empty"><td colspan="4">' + T('還沒有紀錄。把游標移到一條線上，按「記錄這條線」。', 'Nothing recorded yet. Put the cursor on a line and press “Record this line”.') + '</td></tr>';
    recs.slice().reverse().forEach(function (r) {
      h += '<tr><td>' + r.i + '</td><td>' + num(r.lam, 2) + '</td><td>' + num(r.e, 3) + '</td><td class="l">' + (r.n ? r.n.el + ' ' + num(r.n.lam, 2) + (r.n.d > 1 ? ' ?' : '') : '—') + '</td></tr>';
    });
    t.innerHTML = h;
  }
  function measureNow(extra) {
    if (!S) return null;
    const m = C.measure(S, state.cur);
    let hotRatio = null;
    if (m.near) {
      const Sh = C.spectrum({ metals: sampleMetals(), conc: sampleConc(), air: state.air, h: S.F.hp, cobalt: state.cobalt, lamp: state.lamp, TL: state.TL, res: state.res });
      const a = C.lineSignal(S, m.near.lam), b = C.lineSignal(Sh, m.near.lam);
      hotRatio = b !== 0 ? a / b : null;
    }
    const d = Object.assign(m, {
      metals: sampleMetals().slice(), unknown: !!unk.active, cobalt: state.cobalt, lamp: state.lamp, TL: state.TL, T: S.T, air: state.air, h: state.h,
      hp: S.F.hp, Hc: S.F.Hc, inCone: S.F.Hc > 0 && state.h < S.F.Hc, soot: S.sootShare(), res: state.res, log: state.log, zoom: state.zoom, hotRatio: hotRatio
    }, extra || {});
    if (unk.active && m.near && m.isPeak && m.sig > 1e-4) { unk.active.usedScope = true; unk.active.seen[m.near.el] = true; }
    emit('measure', d);
    return d;
  }
  let curTimer = 0;
  function stepCur(d) {
    acted();
    const stepSmall = state.zoom >= 420 ? 0.5 : state.zoom >= 40 ? 0.05 : 0.005;
    setCur(state.cur + d * stepSmall);
    clearTimeout(curTimer); curTimer = setTimeout(function () { measureNow(); }, 350);
  }
  $('curL').addEventListener('click', function () { stepCur(-1); });
  $('curR').addEventListener('click', function () { stepCur(1); });
  $('curL2').addEventListener('click', function () { stepCur(-10); });
  $('curR2').addEventListener('click', function () { stepCur(10); });
  function findLine(dark) {
    acted();
    const p = dark ? C.findDip(S, state.cur) : C.findPeak(S, state.cur);
    if (p == null) { status(dark ? T('游標附近找不到暗線。', 'No dark line near the cursor.') : T('游標附近找不到亮線，先把游標移近一點。', 'No bright line near the cursor — move the cursor closer first.')); return; }
    setCur(p);
    if (snd()) {
      const f = 300 + 700 * (C.LMAX - p) / (C.LMAX - C.LMIN);   // 光子能量越大，音越高
      if (dark) window.LabSound.tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.12 });
      else window.LabSound.tone({ freq: f, dur: 0.14, type: 'sine', gain: 0.14 });
    }
    measureNow();
  }
  $('peakBtn').addEventListener('click', function () { findLine(false); });
  $('dipBtn').addEventListener('click', function () { findLine(true); });
  $('recBtn').addEventListener('click', function () {
    acted();
    const n = nearestAll(state.cur), m = C.measure(S, state.cur);
    // el：記錄時游標在樣品某條譜線的亮線峰上（0.15 nm 以內）才記下元素（任務用，畫面不顯示）
    const el = m.near && m.near.d <= 0.15 && m.isPeak ? m.near.el : null;
    recs.push({ i: recs.length ? recs[recs.length - 1].i + 1 : 1, lam: state.cur, e: C.photonEV(state.cur), n: n, el: el });
    if (recs.length > 30) recs.shift();
    renderRec();
    measureNow({ rec: true, recs: recs.map(function (r) { return { lam: r.lam, el: r.el }; }) });
  });

  // ======================= 能階圖 =======================
  const ecv = $('ecv'), ectx = ecv.getContext('2d');
  let ew = 300, eh = 230, edpr = 1;
  function resizeEnergy() {
    const w = ecv.clientWidth; if (!w) return;
    edpr = Math.min(window.devicePixelRatio || 1, 2); ew = w; eh = 230;
    ecv.width = Math.round(ew * edpr); ecv.height = Math.round(eh * edpr);
  }
  /** 組態「2p6 3s」→ 去掉內層填滿的殼層，傳回 [[基字, 上標], …] */
  function cfgParts(cfg) {
    const toks = cfg.split(/\s+/).filter(function (t) { return !/^(1s2|2s2|2p6|3s2|3p6|3d10|4s2|4p6|4d10|5s2|5p6)$/.test(t); });
    const out = [];
    toks.forEach(function (t) { (t.match(/\d+[spdf]\d*/g) || [t]).forEach(function (q) { const m = /^(\d+[spdf])(\d*)$/.exec(q); out.push(m ? [m[1], m[2] && m[2] !== '1' ? m[2] : ''] : [q, '']); }); });
    return out.length ? out : [[toks.join(' ') || cfg, '']];
  }
  function drawLevelLabel(c, label, x, y, color) {
    const sp = label.lastIndexOf(' '), cfg = label.slice(0, sp), term = label.slice(sp + 1);
    const f = '11px ' + FONT;
    let cx = x;
    cfgParts(cfg).forEach(function (p) { cx += p[1] ? LD.supText(c, p[0], p[1], cx, y, color, f) : (LD.haloText(c, p[0], cx, y, color, 'left', 'alphabetic', f), c.measureText(p[0]).width); cx += 2; });
    const m = /^(\d)([A-Z])(\*?)(.*)$/.exec(term);
    if (m) {
      cx += 3;
      LD.haloText(c, m[1], cx, y - 4, color, 'left', 'alphabetic', '8px ' + FONT); c.font = '8px ' + FONT; cx += c.measureText(m[1]).width + 0.5;
      LD.haloText(c, m[2] + (m[3] ? '°' : ''), cx, y, color, 'left', 'alphabetic', f); c.font = f; cx += c.measureText(m[2] + (m[3] ? '°' : '')).width + 0.5;
      LD.haloText(c, m[4], cx, y + 3, color, 'left', 'alphabetic', '8px ' + FONT);
    }
  }
  function energyElement() {
    const n = nearestAll(state.cur);
    const ms = sampleMetals();
    if (n && n.d < 2 && (!unk.active || true)) return { el: n.el, lam: n.lam };
    if (!unk.active && ms.length) return { el: ms[0], lam: null };
    return n ? { el: n.el, lam: n.lam } : { el: 'Na', lam: null };
  }
  function drawEnergy() {
    const c = ectx;
    c.setTransform(edpr, 0, 0, edpr, 0, 0);
    LD.backdrop(c, ew, eh);
    const sel = energyElement(), m = C.METALS[sel.el];
    const lv = {};
    m.lines.forEach(function (l) { lv[Math.round(l.Ei)] = { E: l.Ei, lab: l.lo }; lv[Math.round(l.Ek)] = { E: l.Ek, lab: l.up }; });
    const levels = Object.keys(lv).map(function (k) { return lv[k]; }).sort(function (a, b) { return a.E - b.E; });
    const Emax = levels[levels.length - 1].E / 8065.544;
    const L = 40, R = ew < 330 ? 96 : 116, Tp = 36, B = 14, H = eh - Tp - B, W = ew - L - R;
    const ye = function (cm) { return Tp + H - (cm / 8065.544) / (Emax * 1.05) * H; };
    LD.haloText(c, mName(sel.el) + ' ' + sel.el, 6, 14, pal.text, 'left', 'alphabetic', '700 12px ' + FONT);
    // 縱軸
    c.strokeStyle = LD.alpha(pal.text, 0.35); c.lineWidth = 1; c.beginPath(); c.moveTo(L - 8.5, Tp); c.lineTo(L - 8.5, Tp + H); c.stroke();
    const st = Emax > 5 ? 2 : 1;
    for (let e = 0; e <= Emax * 1.05; e += st) { const y = ye(e * 8065.544); LD.haloText(c, String(e), L - 12, y + 4, pal.muted, 'right', 'alphabetic', '10px ' + FONT); }
    LD.haloText(c, 'eV', L - 12, Tp - 6, pal.muted, 'right', 'alphabetic', '10px ' + FONT);
    // 能階
    let lastY = 1e9;
    levels.forEach(function (v) {
      const y = ye(v.E);
      c.strokeStyle = pal.text; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, Math.round(y) + 0.5); c.lineTo(L + W, Math.round(y) + 0.5); c.stroke();
      if (Math.abs(lastY - y) > 11) { drawLevelLabel(c, v.lab, L + W + 4, y + 4, pal.muted); lastY = y; }
    });
    // 躍遷
    const lines = m.lines.slice().sort(function (a, b) { return a.lam - b.lam; });
    lines.forEach(function (l, i) {
      const x = L + 10 + (W - 20) * (lines.length > 1 ? i / (lines.length - 1) : 0.5);
      const on = sel.lam != null && Math.abs(l.lam - sel.lam) < 1e-6;
      const rgb = C.wavelengthRGB(l.lam) || [150, 150, 160];
      LD.arrow(c, x, ye(l.Ek), x, ye(l.Ei), rgbStr(rgb), on ? 3 : 1.6);
      if (on) LD.pill(c, num(l.lam, 1) + ' nm', clamp(x, L + 30, L + W - 30), (ye(l.Ek) + ye(l.Ei)) / 2 + 8, pal.text, 'center', '700 11px ' + FONT);
    });
    $('ecvHint').textContent = sel.lam != null
      ? T('箭頭是' + mName(sel.el) + '原子的電子從高能階掉到低能階、放出光子；粗箭頭是游標附近的 ' + num(sel.lam, 1) + ' nm。', 'Arrows: an electron in a ' + C.METALS[sel.el].en + ' atom drops from a higher to a lower level and gives out a photon. The thick arrow is the ' + num(sel.lam, 1) + ' nm line near the cursor.')
      : T('移動游標到一條線上，看它是哪兩個能階之間的躍遷。', 'Move the cursor onto a line to see which two levels it comes from.');
  }

  // ======================= 讀數 =======================
  function status(t) { $('status').textContent = t; }
  function drawReadout() {
    const F = S.F, ms = sampleMetals();
    const sample = unk.active ? T('未知樣品', 'Unknown sample') : ms.length ? ms.map(function (s) { return C.METALS[s].salt.replace(/(\d)/, '<sub>$1</sub>'); }).join(' + ') : T('沒有（乾淨的白金絲）', 'None (clean wire)');
    const swatch = col && col.rgb && (col.Ym > 0 || ms.length) ? '<span class="swatch" style="background:' + rgbStr(col.rgb) + '"></span>' : '';
    const cname = !ms.length ? T('淡藍（本生燈本身）', 'pale blue (the burner itself)') : col && col.name ? T(col.name.zh, col.name.en) + (brightOf(col.Ym) < 0.2 ? T('（很暗）', ' (very faint)') : '') : '—';
    const rows = [
      [T('樣品', 'Sample'), sample],
      [T('火焰顏色', 'Flame colour') + (state.cobalt ? '<small>' + T('（透過鈷玻璃）', '(through cobalt glass)') + '</small>' : ''), swatch + cname, true],
      [T('白金絲處的溫度', 'Temperature at the wire'), num(S.Tw, 0) + ' K（' + num(S.Tw - 273.15, 0) + ' °C）'],
      [T('發光區的平均溫度', 'Mean temperature of the glowing zone') + '<small>' + T('（白金絲上方 10 mm）', '(10 mm above the wire)') + '</small>', num(S.T, 0) + ' K'],
      [T('最熱的地方', 'Hottest point'), num(F.hp, 1) + ' mm・' + num(F.Tmax, 0) + ' K'],
      [T('內焰高度', 'Inner-cone height'), F.Hc > 0 ? num(F.Hc, 1) + ' mm' : T('沒有內焰', 'no inner cone')]
    ];
    if (state.lamp) rows.push([T('燈的亮度溫度', 'Lamp brightness temperature'), num(state.TL, 0) + ' K']);
    $('readout').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="big"' : '') + '>' + r[1] + '</dd>'; }).join('').replace(/K（/g, isEn() ? 'K (' : 'K（').replace(/ °C）/g, isEn() ? ' °C)' : ' °C）');
    const lg = [];
    lg.push('<span><i style="background:linear-gradient(90deg,' + tempColor(500) + ',' + tempColor(1200) + ',' + tempColor(1850) + ')"></i>' + T('溫度（色條）', 'Temperature (colour bar)') + '</span>');
    lg.push('<span><i style="background:' + pal.pos + ';height:8px;width:8px;border-radius:50%"></i>' + T('最熱的地方', 'Hottest point') + '</span>');
    lg.push('<span><i style="background:' + pal.accent + '"></i>' + T('游標', 'Cursor') + '</span>');
    $('legend').innerHTML = lg.join('');
  }

  // ======================= 更新 =======================
  let flameTimer = 0;
  function refresh() {
    readSliders(); showOutputs(); compute();
    drawReadout(); draw(); drawGraph(); drawCurOut(); drawEnergy();
    if (view3) view3.update();
  }
  function changed() {
    refresh();
    clearTimeout(flameTimer);
    flameTimer = setTimeout(emitFlame, 250);
  }
  function emitFlame() {
    if (!S) return;
    emit('flame', {
      metals: sampleMetals().slice(), unknown: !!unk.active, conc: sampleConc(), air: state.air, h: state.h, T: S.T, Tw: S.Tw, hp: S.F.hp, Hc: S.F.Hc,
      inCone: S.F.Hc > 0 && state.h < S.F.Hc, cobalt: state.cobalt, lamp: state.lamp, TL: state.TL,
      color: col && col.name ? col.name.zh : null, dw: col ? col.dw : null, Ym: col ? col.Ym : 0, soot: S.sootShare()
    });
  }

  // ======================= 樣品 =======================
  function setSampleUI() {
    document.querySelectorAll('#sampleSeg button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(!unk.active && state.metals.indexOf(b.dataset.m) >= 0));
      b.disabled = !!unk.active;
    });
    $('cleanBtn').disabled = !!unk.active;
    concEl.disabled = !!unk.active;
  }
  document.querySelectorAll('#sampleSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const m = b.dataset.m, i = state.metals.indexOf(m);
      if (i >= 0) state.metals.splice(i, 1);
      else { state.metals.push(m); if (state.metals.length > 2) state.metals.shift(); if (snd()) window.LabSound.noise({ dur: 0.22, gain: 0.22, filter: 3400, q: 0.8 }); }
      setSampleUI(); changed();
      const ms = state.metals;
      if (ms.length) status(T('白金絲沾上 ', 'The wire carries ') + ms.map(function (s) { return C.METALS[s].salt; }).join(' + ') + T(' 的溶液。火焰：', ' solution. Flame: ') + (col && col.name ? T(col.name.zh, col.name.en) : '—') + T('。', '.'));
      else status(T('白金絲上沒有樣品。', 'No sample on the wire.'));
    });
  });
  $('cleanBtn').addEventListener('click', function () { acted(); state.metals = []; setSampleUI(); changed(); status(T('用鹽酸洗過、在火焰中燒到沒有顏色：白金絲乾淨了。', 'Washed in hydrochloric acid and heated until the flame shows no colour: the wire is clean.')); });
  [concEl, airEl, hEl, tlEl, resEl].forEach(function (el) { el.addEventListener('input', function () { acted(); changed(); }); });
  $('cobalt').addEventListener('change', function () { acted(); if (unk.active && $('cobalt').checked) unk.active.usedCobalt = true; changed(); });
  $('lamp').addEventListener('change', function () { acted(); changed(); });
  $('logY').addEventListener('change', function () { acted(); readSliders(); drawGraph(); });
  document.querySelectorAll('#zoomSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.zoom = +b.dataset.z;
      document.querySelectorAll('#zoomSeg button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); });
      drawGraph(); drawCurOut();
    });
  });

  // ======================= 未知樣品 =======================
  function renderAns() {
    const box = $('ansSeg');
    if (!box.children.length) {
      C.ORDER.forEach(function (s) {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.m = s; b.setAttribute('aria-pressed', 'false');
        box.appendChild(b);
        b.addEventListener('click', function () {
          acted();
          const i = unk.answer.indexOf(s);
          if (i >= 0) unk.answer.splice(i, 1); else { unk.answer.push(s); if (unk.answer.length > unk.kind) unk.answer.shift(); }
          renderAns();
        });
      });
    }
    Array.prototype.forEach.call(box.children, function (b) { b.textContent = mName(b.dataset.m) + ' ' + b.dataset.m; b.setAttribute('aria-pressed', String(unk.answer.indexOf(b.dataset.m) >= 0)); });
  }
  function renderUnk() {
    $('unkIn').hidden = !unk.active; $('unkShow').hidden = !unk.active;
    $('unkStart').textContent = unk.active ? T('換一題', 'Another one') : T('新的未知樣品', 'New unknown');
    $('unkQ').textContent = unk.active
      ? T('第 ' + unk.n + ' 題：白金絲已沾上未知溶液（' + (unk.kind === 2 ? '兩種' : '一種') + '金屬的氯化物）。觀察焰色與光譜，選出' + (unk.kind === 2 ? '兩種' : '一種') + '金屬，再按「核對」。',
        'No. ' + unk.n + ': the wire carries an unknown solution (chloride' + (unk.kind === 2 ? 's of two metals' : ' of one metal') + '). Use the flame colour and the spectrum, choose ' + (unk.kind === 2 ? 'two metals' : 'one metal') + ', then press “Check”.')
      : '';
    renderAns();
    const t = $('unkTbl');
    let h = '<tr><th>#</th><th class="l">' + T('答案', 'Answer') + '</th><th class="l">' + T('你的答案', 'Yours') + '</th><th>' + T('結果', 'Result') + '</th></tr>';
    if (!unk.hist.length) h += '<tr class="empty"><td colspan="4">' + T('還沒有紀錄。', 'No record yet.') + '</td></tr>';
    unk.hist.slice().reverse().forEach(function (r) {
      h += '<tr><td>' + r.n + '</td><td class="l">' + r.metals.join(' + ') + '</td><td class="l">' + (r.answer.length ? r.answer.join(' + ') : '—') + '</td><td>' + (r.shown ? T('看答案', 'shown') : r.ok ? '✓' : '✗') + '</td></tr>';
    });
    t.innerHTML = h;
  }
  document.querySelectorAll('#unkSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); unk.kind = +b.dataset.k;
      document.querySelectorAll('#unkSeg button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); });
      if (unk.answer.length > unk.kind) unk.answer = unk.answer.slice(-unk.kind);
      renderUnk();
    });
  });
  /** 結束這一題：濃度滑桿回到出題前的設定 */
  function endUnknown() {
    if (unk.active && unk.prevConc != null) setSlider(concEl, unk.prevConc);
    unk.active = null;
  }
  $('unkStart').addEventListener('click', function () {
    acted();
    if (unk.active) { unk.streak = 0; }
    const u = C.newUnknown(unk.R, unk.kind === 2, unk.last);
    unk.n++; unk.last = u.metals;
    if (!unk.active) unk.prevConc = state.conc;
    unk.active = { metals: u.metals, conc: u.conc, kind: unk.kind, usedCobalt: state.cobalt, usedScope: false, seen: {} };
    setSlider(concEl, u.conc);   // 濃度滑桿停用，但顯示未知樣品的實際濃度
    unk.answer = [];
    $('unkOut').textContent = '';
    setSampleUI(); renderUnk(); changed();
    if (snd()) window.LabSound.noise({ dur: 0.22, gain: 0.22, filter: 3400, q: 0.8 });
    status(T('白金絲沾上了未知樣品。', 'The wire now carries the unknown sample.'));
  });
  $('unkCheck').addEventListener('click', function () {
    acted();
    const a = unk.active; if (!a) return;
    if (unk.answer.length !== a.kind) { $('unkOut').textContent = T('請選 ' + a.kind + ' 種金屬。', 'Please choose ' + a.kind + (a.kind === 1 ? ' metal.' : ' metals.')); return; }
    const ok = C.sameSet(unk.answer, a.metals);
    unk.streak = ok ? unk.streak + 1 : 0;
    if (a.kind === 2) unk.mixNoCo = ok && !a.usedCobalt ? unk.mixNoCo + 1 : 0;
    unk.hist.push({ n: unk.n, metals: a.metals.slice(), answer: unk.answer.slice(), ok: ok });
    if (unk.hist.length > 12) unk.hist.shift();
    emit('identify', { correct: ok, n: a.kind, metals: a.metals.slice(), answer: unk.answer.slice(), streak: unk.streak, mixNoCo: unk.mixNoCo, usedCobalt: a.usedCobalt, usedScope: a.usedScope });
    $('unkOut').innerHTML = (ok ? '<span class="ok">' + T('答對了！', 'Correct!') + '</span> ' : '<span class="no">' + T('不對。', 'Not quite.') + '</span> ') +
      T('答案是 ', 'It was ') + a.metals.map(function (s) { return mName(s) + '（' + C.METALS[s].salt + '）'; }).join(T('與', ' and ')).replace(/（/g, isEn() ? ' (' : '（').replace(/）/g, isEn() ? ')' : '）') +
      T('。連續答對 ', '. Streak: ') + unk.streak + T(' 題。', '.');
    if (snd()) {
      if (ok) { window.LabSound.tone({ freq: 784, dur: 0.1, gain: 0.14 }); window.LabSound.tone({ freq: 1047, dur: 0.16, gain: 0.12, delay: 0.09 }); }
      else window.LabSound.sweep({ from: 392, to: 262, dur: 0.25, gain: 0.12, type: 'triangle' });
    }
    endUnknown(); setSampleUI(); renderUnk(); changed();
  });
  $('unkShow').addEventListener('click', function () {
    acted();
    const a = unk.active; if (!a) return;
    unk.streak = 0; if (a.kind === 2) unk.mixNoCo = 0;
    unk.hist.push({ n: unk.n, metals: a.metals.slice(), answer: unk.answer.slice(), ok: false, shown: true });
    if (unk.hist.length > 12) unk.hist.shift();
    $('unkOut').textContent = T('答案是 ', 'It was ') + a.metals.map(mName).join(T('與', ' and ')) + T('。', '.');
    endUnknown(); setSampleUI(); renderUnk(); changed();
  });
  $('clearAll').addEventListener('click', function () {
    acted();
    recs.length = 0; unk.hist = []; unk.streak = 0; unk.mixNoCo = 0; unk.n = 0; endUnknown(); unk.answer = [];
    $('unkOut').textContent = '';
    renderRec(); setSampleUI(); renderUnk(); changed();
    status(T('已清除量測紀錄與未知樣品的紀錄。', 'Measurement table and unknown-sample record cleared.'));
  });

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
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
  function host3Api() {
    return {
      T: T, host: host3,
      get: function () {
        return {
          F: S.F, h: state.h, air: state.air, Tw: S.Tw, T: S.T, metals: sampleMetals(), rgb: col && col.rgb, mrgb: col && col.mrgb, bright: brightOf(col && col.Ym),
          soot: S.sootShare(), sootA: clamp((0.5 - state.air) * 2, 0, 1), cobalt: state.cobalt, lamp: state.lamp, lampRGB: bbRGB(state.TL), TL: state.TL,
          rays: topLines(8).map(function (l) { return { lam: l.lam, rgb: C.wavelengthRGB(l.lam) || [200, 200, 200], v: l.v }; }), vmax: visMax(),
          tempColor: tempColor, temperature: function (hh) { return C.temperature(hh, state.air); }, dark: pal.dark
        };
      },
      hud: function () {
        return {
          tl: T('白金絲 ', 'Wire ') + num(state.h, 1) + ' mm・' + num(S.Tw - 273.15, 0) + ' °C',
          tr: (unk.active ? T('未知樣品', 'Unknown sample') : sampleMetals().length ? sampleMetals().map(function (s) { return C.METALS[s].salt; }).join(' + ') : T('沒有樣品', 'No sample')) +
            (col && col.name && sampleMetals().length ? '・' + T(col.name.zh, col.name.en) : '')
        };
      },
      contextLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
    };
  }
  function setPressed(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.FT3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d'); state.view = '3d';
        view3 = window.FT3D.create(lib, host3Api());
        viewMsg.textContent = ''; $('resetCam').hidden = false;
        view3.update(); stopLoop();
        emit('view3d', {});
      }).catch(function (err) { if (token !== loadToken) return; if (window.console) console.warn('3D view unavailable:', err); fail3D(); });
    } else {
      loadToken++; setPressed('2d'); state.view = '2d';
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d'); $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize(); startLoop();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d'); state.view = '2d'; setPressed('2d'); $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize(); startLoop();
  }
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ======================= 火焰的閃動（只有一條動畫迴圈） =======================
  let raf = 0, lastT = 0;
  function loop(t) {
    raf = 0;
    if (state.view !== '2d' || document.hidden || reduced) return;
    if (t - lastT > 45) { lastT = t; flick = t / 1000; draw(); }
    raf = requestAnimationFrame(loop);
  }
  function startLoop() { if (!raf && !reduced && state.view === '2d') raf = requestAnimationFrame(loop); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) startLoop(); });

  // ======================= 其他 =======================
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
    if (ev.detail && ev.detail.name === 'fs') { resize(); resizeGraph(); resizeEnergy(); refresh(); }
  });
  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors(); updateSoundButton(); renderRec(); renderUnk(); refresh();
    if (view3) view3.onTheme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0, le = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
    new ResizeObserver(function () { if (ecv.clientWidth && ecv.clientWidth !== le) { le = ecv.clientWidth; resizeEnergy(); drawEnergy(); } }).observe(ecv);
  } else window.addEventListener('resize', function () { resize(); resizeGraph(); resizeEnergy(); refresh(); });

  // 測試用（Playwright）
  window.__ft = {
    state: state, unk: unk, get S() { return S; }, get col() { return col; },
    setCur: function (l) { acted(); setCur(l); }, measure: function () { acted(); return measureNow(); },
    wireY: function () { return yOf(state.h); }, wireX: function () { return G.bx + 20; }
  };

  // ======================= 啟動 =======================
  readColors();
  resize(); resizeGraph(); resizeEnergy();
  setSampleUI(); renderRec(); renderUnk(); updateSoundButton();
  refresh();
  startLoop();
})();
