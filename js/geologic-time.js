/* geologic-time.js — 「地層與地質年代：相對定年與放射性定年」的畫面與互動
 * 地質與定年的計算全部在 geologic-time-core.js；3D 在 geologic-time-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const G = window.GeoTimeCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const TMAX = { A: 1800, B: 560 };
  const PLAY_SECONDS = 26;
  const SYS = ['U238', 'U235', 'K40', 'Rb87', 'C14'];

  // =====================================================================
  // 狀態
  // =====================================================================
  const state = { mode: 'story', scen: 'A', sys: 'U238', sel: null, selPt: null, playing: false, acted: false, seq: [], checked: false, last: null };
  const recs = { A: {}, B: {} };   // recs[剖面][單元] = { 定年法: 次數, ok: {定年法: 結果} }
  let S = G.scenario('A');
  let internal = false;
  const elT = $('t');
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function tmax() { return TMAX[state.scen]; }
  function posToT(p) { const u = (1000 - p) / 1000; return tmax() * u * u; }
  function tToPos(t) { return 1000 - 1000 * Math.sqrt(clamp(t, 0, tmax()) / tmax()); }
  function registerT() {
    if (window.LabNum) window.LabNum.register(elT, { toValue: posToT, toPos: tToPos, min: 0, max: tmax(), decimals: 3 });
  }
  registerT();
  function readT() { return window.LabNum ? clamp(window.LabNum.value(elT), 0, tmax()) : posToT(+elT.value); }
  function setT(t) { internal = true; if (window.LabNum) window.LabNum.set(elT, t); else elT.value = String(tToPos(t)); internal = false; }
  let tNow = 0;
  function tView() { return state.mode === 'story' ? tNow : 0; }

  // =====================================================================
  // 格式
  // =====================================================================
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function group(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  /** 時間（百萬年前）→ 文字 */
  function fmtT(t, short) {
    if (t <= 0) return T('現在', 'today');
    if (t < 1) return group(t * 1e6) + T(' 年前', ' years ago');
    const d = t >= 100 ? 0 : t >= 10 ? 1 : 2;
    if (short) return num(t, d) + ' Ma';
    return num(t, d) + T(' 百萬年前', ' million years ago') + (t >= 100 ? T('（' + num(t / 100, t >= 1000 ? 1 : 2) + ' 億年）', '') : '');
  }
  function fmtAge(age, sigma) {   // 年代 ± 誤差（百萬年）
    if (age < 1) return group(age * 1e6) + ' ± ' + group(Math.max(1, sigma * 1e6)) + T(' 年', ' years');
    const d = sigma >= 10 ? 0 : sigma >= 1 ? 1 : sigma >= 0.1 ? 2 : 3;
    return num(age, d) + ' ± ' + num(sigma, d) + T(' 百萬年', ' Myr');
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function niceStep(range, n) {
    const raw = range / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  // =====================================================================
  // 名稱
  // =====================================================================
  const ROCK_ZH = { gneiss: '片麻岩', granite: '花崗岩', sandstone: '砂岩', shale: '頁岩', limestone: '石灰岩', conglomerate: '礫岩', ash: '火山灰層', basalt: '玄武岩', gravel: '礫石層' };
  const ROCK_EN = { gneiss: 'gneiss', granite: 'granite', sandstone: 'sandstone', shale: 'shale', limestone: 'limestone', conglomerate: 'conglomerate', ash: 'volcanic ash bed', basalt: 'basalt', gravel: 'gravel' };
  const FOS_ZH = { trilobite: '三葉蟲', graptolite: '筆石', ammonite: '菊石', dinosaur: '恐龍' };
  const FOS_EN = { trilobite: 'trilobites', graptolite: 'graptolites', ammonite: 'ammonites', dinosaur: 'dinosaur bones' };
  const PER = {
    precambrian: ['前寒武紀', 'Precambrian', '#f4597a', 'Pre'], cambrian: ['寒武紀', 'Cambrian', '#7fa056', 'Cm'], ordovician: ['奧陶紀', 'Ordovician', '#009270', 'O'],
    silurian: ['志留紀', 'Silurian', '#b3e1b6', 'S'], devonian: ['泥盆紀', 'Devonian', '#cb8c37', 'D'], carboniferous: ['石炭紀', 'Carboniferous', '#67a599', 'C'],
    permian: ['二疊紀', 'Permian', '#f04028', 'P'], triassic: ['三疊紀', 'Triassic', '#812b92', 'T'], jurassic: ['侏羅紀', 'Jurassic', '#34b2c9', 'J'],
    cretaceous: ['白堊紀', 'Cretaceous', '#7fc64e', 'K'], paleogene: ['古近紀', 'Paleogene', '#fd9a52', 'Pg'], neogene: ['新近紀', 'Neogene', '#ffe619', 'N'], quaternary: ['第四紀', 'Quaternary', '#f9f97f', 'Q']
  };
  const ERA = { precambrian: ['前寒武紀', 'Precambrian'], paleozoic: ['古生代', 'Paleozoic'], mesozoic: ['中生代', 'Mesozoic'], cenozoic: ['新生代', 'Cenozoic'] };
  function eraAt(t) { for (let i = 0; i < G.ERAS.length; i++) if (t <= G.ERAS[i].from && t >= G.ERAS[i].to) return G.ERAS[i].id; return 'precambrian'; }
  function perName(id) { return id ? T(PER[id][0], PER[id][1]) : '—'; }
  function unitEv(u) { return u === G.BASE ? S.base : S.events[u]; }
  /** 單元的種類：base、pluton（花崗岩體）、dike（岩脈）、lava（熔岩流）、ash、sed */
  function kindOf(u) {
    if (u === G.BASE) return 'base';
    const e = S.events[u];
    if (e.type === 'dike') return e.rock === 'granite' ? 'pluton' : 'dike';
    if (e.rock === 'basalt') return 'lava';
    if (e.rock === 'ash') return 'ash';
    return 'sed';
  }
  function unitName(u) {
    const e = unitEv(u), k = kindOf(u);
    if (k === 'pluton') return T('花崗岩侵入體', 'granite intrusion');
    if (k === 'dike') return T('玄武岩岩脈', 'basalt dike');
    if (k === 'lava') return T('玄武岩熔岩流', 'basalt lava flow');
    const r = e.rock, fos = e.fossil;
    let s = T(ROCK_ZH[r], ROCK_EN[r]);
    if (fos) s += T('（含' + FOS_ZH[fos] + '化石）', ' with ' + FOS_EN[fos]);
    if (e.charcoal) s += T('（含木炭）', ' with charcoal');
    return s;
  }
  function itemName(i) {
    if (i === G.BASE || S.events[i].type === 'deposit' || S.events[i].type === 'dike') return unitName(i);
    const e = S.events[i];
    if (e.type === 'tilt') return T('地層傾斜', 'tilting of the strata');
    if (e.type === 'fault') return T('斷層', 'fault');
    return T('不整合面（侵蝕）', 'unconformity (erosion)');
  }
  function isMarine(e) { return e.type === 'deposit' && (e.rock === 'limestone' || e.rock === 'shale' || e.fossil === 'trilobite' || e.fossil === 'graptolite' || e.fossil === 'ammonite'); }
  function evText(e) {
    if (e === S.base) return T('變質作用形成片麻岩（基盤）', 'Metamorphism forms the gneiss basement');
    if (e.type === 'dike') return e.rock === 'granite' ? T('花崗岩岩漿侵入片麻岩，在地下慢慢冷卻', 'Granite magma intrudes the gneiss and cools slowly underground') : T('玄武岩岩漿沿裂縫侵入，形成岩脈', 'Basalt magma fills a crack, forming a dike');
    if (e.type === 'tilt') return T('造山運動：地層被擠壓傾斜 ' + e.angle + '°', 'Mountain building tilts the strata by ' + e.angle + '°');
    if (e.type === 'erode') return T('地殼抬升、地表被侵蝕', 'The crust is uplifted and the surface is eroded');
    if (e.type === 'fault') return T('正斷層：右側（上盤）往下滑 ' + e.slip + ' m', 'Normal fault: the right side (hanging wall) slips ' + e.slip + ' m down');
    const r = e.rock;
    if (r === 'ash') return T('火山噴發，火山灰落下', 'A volcano erupts and ash falls');
    if (r === 'basalt') return T('玄武岩熔岩流覆蓋地表', 'A basalt lava flow covers the land');
    if (r === 'gravel') return T('河流帶來礫石（含木炭）', 'A river brings gravel (with charcoal)');
    if (r === 'limestone') return T('溫暖的淺海：生物的碳酸鈣堆積成石灰岩', 'A warm shallow sea: shells and lime mud build limestone') + (e.fossil ? T('（' + FOS_ZH[e.fossil] + '）', ' (' + FOS_EN[e.fossil] + ')') : '');
    if (r === 'shale') return T('較深、較靜的海底：泥堆積成頁岩', 'A deeper, quiet sea floor: mud builds shale') + (e.fossil ? T('（' + FOS_ZH[e.fossil] + '）', ' (' + FOS_EN[e.fossil] + ')') : '');
    if (e.fossil === 'dinosaur') return T('河流與沙丘的沙堆積成砂岩（恐龍）', 'Rivers and dunes lay down sand (dinosaurs)');
    return T('海岸的沙堆積成砂岩', 'Beach sand builds sandstone') + (e.fossil ? T('（' + FOS_ZH[e.fossil] + '）', ' (' + FOS_EN[e.fossil] + ')') : '');
  }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function hexRGB(h) {
    h = (h || '#000000').trim();
    if (h[0] !== '#') { const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(h); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; }
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  const ROCK_COL = { gneiss: '#8d7f96', granite: '#e9b39c', sandstone: '#e2c27f', shale: '#8ea58c', limestone: '#a7bdd0', conglomerate: '#c4a982', ash: '#f3eedf', basalt: '#4a5260', gravel: '#c7ae86' };
  function hash2(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  let UCOL = {};
  function unitRGB(u) {
    if (UCOL[u]) return UCOL[u];
    const r = u === G.BASE ? S.base.rock : S.events[u].rock, c = hexRGB(ROCK_COL[r]), j = (hash2(u + 7, 3) - 0.5) * 0.14, k = D.dark ? 0.78 : 1;
    UCOL[u] = c.map(function (x) { return clamp(Math.round(x * (1 + j) * k), 0, 255); });
    return UCOL[u];
  }
  function unitCSS(u) { const c = unitRGB(u); return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface', '--gt-sel', '--gt-ok', '--gt-bad', '--gt-sky', '--gt-sky2', '--gt-sea']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    UCOL = {};
    buildLegend();
  }
  function buildLegend() {
    const rocks = {};
    rocks[S.base.rock] = 1;
    S.events.forEach(function (e) { if (e.rock) rocks[e.rock] = 1; });
    const k = D.dark ? 0.78 : 1;
    const h = Object.keys(rocks).map(function (r) {
      const c = hexRGB(ROCK_COL[r]).map(function (x) { return Math.round(x * k); });
      return '<span><i style="background:rgb(' + c.join(',') + ')"></i>' + T(ROCK_ZH[r], ROCK_EN[r]) + '</span>';
    }).join('');
    const L = $('legend'); if (L.innerHTML !== h) L.innerHTML = h;
  }

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gr = $('gr'), gtx = gr.getContext('2d');
  let cvSize = null, grSize = null, box = null;
  function fsz() { return 12 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 1); }
  function fit(c, g) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  let VE = 1.15;   // 垂直誇大（窄螢幕放大到 2，剖面才不會太扁）
  function wantHeight(W) {
    VE = W < 560 ? 2 : 1.15;
    const bw = W - (W >= 560 ? 56 : 44) - 10;
    return Math.round(bw * (G.Z_HI - G.Z_LO) / G.W * VE + 58);
  }
  function resizeCv() {
    const W = cv.clientWidth || 300, h = wantHeight(W) + 'px';
    if (cv.style.height !== h) cv.style.height = h;
    cvSize = fit(cv, ctx); grSize = fit(gr, gtx);
    const L = cvSize.w >= 560 ? 56 : 44;
    box = { l: L, r: cvSize.w - 10, t: 30, b: cvSize.h - 28 };
    imgKey = ''; labelCache = {}; requestDraw();
  }
  function X(x) { return box.l + x / G.W * (box.r - box.l); }
  function Z(z) { return box.t + (G.Z_HI - z) / (G.Z_HI - G.Z_LO) * (box.b - box.t); }
  function invX(px) { return (px - box.l) / (box.r - box.l) * G.W; }
  function invZ(py) { return G.Z_HI - (py - box.t) / (box.b - box.t) * (G.Z_HI - G.Z_LO); }

  // ---------- 剖面的點陣圖（逐點問「這裡是哪一層」，再依岩性畫紋路） ----------
  let imgKey = '', img = null, imgU = null, imgW = 0, imgH = 0;
  const off = { x: 0, z: 0 };
  function sectionImage(t, quick) {
    const dpr = quick ? 0.55 : Math.min(1.5, cvSize.dpr);
    const bw = box.r - box.l, bh = box.b - box.t;
    const pw = Math.max(1, Math.round(bw * dpr)), ph = Math.max(1, Math.round(bh * dpr));
    const n = G.countAt(S, t), dep = G.depositingAt(S, t);
    const key = S.id + '|' + n + '|' + (dep && dep.i === n ? Math.round(dep.frac * 400) : -1) + '|' + pw + 'x' + ph + '|' + (D.dark ? 1 : 0);
    if (imgKey === key) return img;
    const c = img || document.createElement('canvas');
    c.width = pw; c.height = ph;
    const g = c.getContext('2d'), id = g.createImageData(pw, ph), a = id.data;
    const U = new Int16Array(pw * ph);
    const mx = G.W / pw, mz = (G.Z_HI - G.Z_LO) / ph;
    const ppm = pw / G.W / dpr, ppz = ph / (G.Z_HI - G.Z_LO) / dpr;   // CSS 像素／公尺
    for (let j = 0; j < ph; j++) {
      const z = G.Z_HI - (j + 0.5) * mz;
      for (let i = 0; i < pw; i++) {
        const x = (i + 0.5) * mx;
        const u = G.rockAtTime(S, x, z, t, off);
        U[j * pw + i] = u;
        if (u === G.AIR) continue;
        const rock = u === G.BASE ? S.base.rock : S.events[u].rock;
        const px = off.x * ppm, py = -off.z * ppz;   // 形成當時的座標（CSS 像素），紋路跟著地層一起傾斜、錯動
        let f = 0;
        if (rock === 'sandstone') { const cx = Math.floor(px / 4), cy = Math.floor(py / 4); if (hash2(cx, cy) < 0.16 && Math.abs(px - cx * 4 - 2) < 0.9 && Math.abs(py - cy * 4 - 2) < 0.9) f = -0.22; }
        else if (rock === 'shale') { if (((py % 5) + 5) % 5 < 0.9) f = -0.16; else if (hash2(Math.floor(px / 6), Math.floor(py / 5)) < 0.08) f = -0.08; }
        else if (rock === 'limestone') { const row = Math.floor(py / 8), q = ((py % 8) + 8) % 8, bx = ((px + (row & 1) * 8) % 16 + 16) % 16; if (q < 0.9 || bx < 0.9) f = -0.2; }
        else if (rock === 'ash') { if (hash2(Math.floor(px / 2), Math.floor(py / 2)) < 0.15) f = -0.14; }
        else if (rock === 'basalt') { const h = hash2(Math.floor(px / 2), Math.floor(py / 2)); if (h < 0.1) f = 0.18; else if (h > 0.94) f = -0.2; }
        else if (rock === 'granite') { const h = hash2(Math.floor(px / 3), Math.floor(py / 3)); if (h < 0.14) f = -0.38; else if (h > 0.86) f = 0.2; }
        else if (rock === 'gneiss') { const s = py + 2.4 * Math.sin(px / 11) + 1.1 * Math.sin(px / 4.3); const q = ((s % 5) + 5) % 5; if (q < 1.1) f = -0.16; else if (q > 3.6 && q < 4.2) f = 0.08; }
        else if (rock === 'gravel' || rock === 'conglomerate') { const cx = Math.floor(px / 7), cy = Math.floor(py / 6), ox = cx * 7 + 3.5 + (hash2(cx, cy) - 0.5) * 2, oy = cy * 6 + 3 + (hash2(cy, cx) - 0.5) * 1.6, r = Math.hypot(px - ox, (py - oy) * 1.2); if (r < 2.6) f = r > 1.7 ? -0.3 : 0.1; }
        const col = unitRGB(u), k = 4 * (j * pw + i);
        const dz = 1 - 0.1 * (j / ph);   // 越深越暗一點
        for (let q = 0; q < 3; q++) { let v = col[q] * dz; v = f > 0 ? v + (255 - v) * f : v * (1 + f); a[k + q] = v; }
        a[k + 3] = 255;
      }
    }
    // 層與層的界線
    const ln = D.dark ? 0.5 : 0.62;
    for (let j = 1; j < ph; j++) for (let i = 1; i < pw; i++) {
      const p = j * pw + i, u = U[p];
      if (u === G.AIR) continue;
      if (U[p - 1] !== u || U[p - pw] !== u) {
        const k = 4 * p;
        if (U[p - pw] === G.AIR) { a[k] = Math.min(255, a[k] * 1.08 + 18); a[k + 1] = Math.min(255, a[k + 1] * 1.08 + 18); a[k + 2] = Math.min(255, a[k + 2] * 1.08 + 18); }   // 地表亮邊
        else { a[k] *= ln; a[k + 1] *= ln; a[k + 2] *= ln; }
      }
    }
    g.putImageData(id, 0, 0);
    img = c; imgU = U; imgW = pw; imgH = ph; imgKey = key;
    return c;
  }
  function unitAtPx(px, py) {   // 直接從目前畫面的點陣圖讀（和看到的完全一致）
    if (!imgU) return G.AIR;
    const i = Math.floor((px - box.l) / (box.r - box.l) * imgW), j = Math.floor((py - box.t) / (box.b - box.t) * imgH);
    if (i < 0 || j < 0 || i >= imgW || j >= imgH) return G.AIR;
    return imgU[j * imgW + i];
  }

  // ---------- 標籤位置與化石位置（每個剖面算一次） ----------
  let labelCache = {};
  function layout() {
    if (labelCache[S.id]) return labelCache[S.id];
    const NX = 120, NZ = 60, U = new Int16Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) U[j * NX + i] = G.rockAt(S, (i + 0.5) / NX * G.W, G.Z_HI - (j + 0.5) / NZ * (G.Z_HI - G.Z_LO), S.events.length);
    // 每格到「不同單元」的距離（格數，chamfer）
    const Dd = new Float32Array(NX * NZ).fill(1e9);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const u = U[j * NX + i];
      if (i === 0 || j === 0 || i === NX - 1 || j === NZ - 1 || U[j * NX + i - 1] !== u || U[j * NX + i + 1] !== u || U[(j - 1) * NX + i] !== u || U[(j + 1) * NX + i] !== u) Dd[j * NX + i] = 0.5;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) { const p = j * NX + i; Dd[p] = Math.min(Dd[p], Dd[p - 1] + 1, Dd[p - NX] + 1, Dd[p - NX - 1] + 1.41, Dd[p - NX + 1] + 1.41); }
      for (let j = NZ - 2; j > 0; j--) for (let i = NX - 2; i > 0; i--) { const p = j * NX + i; Dd[p] = Math.min(Dd[p], Dd[p + 1] + 1, Dd[p + NX] + 1, Dd[p + NX + 1] + 1.41, Dd[p + NX - 1] + 1.41); }
    }
    const best = {}, fos = {}, cand = {};
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const p = j * NX + i, u = U[p]; if (u === G.AIR) continue;
      // 偏好畫面中間、離邊界遠的位置
      const sc = Dd[p] * 1.6 - Math.abs(i - NX * 0.45) / NX * 3;
      if (!best[u] || sc > best[u].s) best[u] = { s: sc, x: (i + 0.5) / NX * G.W, z: G.Z_HI - (j + 0.5) / NZ * (G.Z_HI - G.Z_LO), d: Dd[p] };
      if (i > 2 && i < NX - 3 && j > 1 && j < NZ - 2) (cand[u] = cand[u] || []).push({ x: (i + 0.5) / NX * G.W, z: G.Z_HI - (j + 0.5) / NZ * (G.Z_HI - G.Z_LO), d: Dd[p] });
      const e = u >= 0 ? S.events[u] : null;
      if (e && e.fossil && Dd[p] >= 1.4 && hash2(i, j + u * 31) < 0.06) (fos[u] = fos[u] || []).push({ x: (i + 0.5) / NX * G.W, z: G.Z_HI - (j + 0.5) / NZ * (G.Z_HI - G.Z_LO) });
    }
    // 化石：每層最多 4 個、彼此分開
    Object.keys(fos).forEach(function (u) {
      const pts = fos[u], keep = [];
      pts.forEach(function (p) { if (keep.length < 4 && keep.every(function (q) { return Math.abs(q.x - p.x) > 500; })) keep.push(p); });
      fos[u] = keep;
    });
    // 標籤候選：離邊界越遠越前面
    Object.keys(cand).forEach(function (u) { cand[u].sort(function (a, b) { return b.d - a.d || Math.abs(a.x - G.W * 0.45) - Math.abs(b.x - G.W * 0.45); }); });
    labelCache[S.id] = { best: best, fos: fos, cand: cand };
    return labelCache[S.id];
  }
  // 斷層與不整合面的位置（現在的座標）
  function faultTrace(n) {
    const out = [];
    S.events.forEach(function (e, i) {
      if (e.type !== 'fault' || i >= n) return;
      let top = e.z0;
      for (let k = i + 1; k < n; k++) if (S.events[k].type === 'erode') top = Math.min(top, S.events[k].to);
      out.push({ i: i, e: e, x0: G.faultX(e, G.Z_LO), z0: G.Z_LO, x1: G.faultX(e, top), z1: top });
    });
    return out;
  }
  function unconfTraces(n, t) {
    const out = [];
    S.events.forEach(function (e, k) {
      if (e.type !== 'erode' || k >= n) return;
      const pts = []; let seg = [];
      for (let x0 = -400; x0 <= G.W + 400; x0 += 20) {
        const p = G.forward(S, x0, e.to, k, n);
        const above = G.rockAtTime(S, p[0], p[1] + 6, t), below = G.rockAtTime(S, p[0], p[1] - 6, t);
        const ok = p[0] >= 0 && p[0] <= G.W && above !== G.AIR && above > k && S.events[above].type === 'deposit' && below !== G.AIR && (below < k);
        if (ok) seg.push(p); else if (seg.length) { if (seg.length > 1) pts.push(seg); seg = []; }
      }
      if (seg.length > 1) pts.push(seg);
      if (pts.length) out.push({ i: k, segs: pts });
    });
    return out;
  }

  // ---------- 化石圖示 ----------
  function drawFossil(g, kind, x, y, s, col) {
    g.save(); g.translate(x, y); g.strokeStyle = col; g.fillStyle = D.alpha(col, 0.18); g.lineWidth = 1.1;
    if (kind === 'trilobite') {
      g.beginPath(); g.ellipse(0, 0, s * 0.55, s * 0.8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.18, -s * 0.75); g.lineTo(-s * 0.18, s * 0.75); g.moveTo(s * 0.18, -s * 0.75); g.lineTo(s * 0.18, s * 0.75); g.stroke();
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-s * 0.5, k * s * 0.24); g.lineTo(s * 0.5, k * s * 0.24); g.stroke(); }
    } else if (kind === 'ammonite') {
      g.beginPath();
      for (let a = 0; a < Math.PI * 5.2; a += 0.15) { const r = s * 0.08 * Math.exp(a * 0.17); const px = Math.cos(a) * r, py = Math.sin(a) * r; if (a) g.lineTo(px, py); else g.moveTo(px, py); }
      g.stroke();
      g.beginPath(); g.arc(0, 0, s * 0.8, 0, Math.PI * 2); g.fill();
    } else if (kind === 'graptolite') {
      g.beginPath(); g.moveTo(-s, s * 0.3); g.lineTo(s, -s * 0.3); g.stroke();
      for (let k = -3; k <= 3; k++) { const px = k * s * 0.28, py = -k * s * 0.084; g.beginPath(); g.moveTo(px, py); g.lineTo(px + s * 0.14, py - s * 0.3); g.stroke(); }
    } else {   // 恐龍骨頭
      g.rotate(-0.4);
      g.beginPath(); g.moveTo(-s * 0.7, -s * 0.12); g.lineTo(s * 0.7, -s * 0.12); g.moveTo(-s * 0.7, s * 0.12); g.lineTo(s * 0.7, s * 0.12); g.stroke();
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { g.beginPath(); g.arc(sx * s * 0.78, sy * s * 0.17, s * 0.2, 0, Math.PI * 2); g.fill(); g.stroke(); }); });
    }
    g.restore();
  }

  // ---------- 主畫面 ----------
  function drawMain() {
    if (!cvSize || !box) return;
    const W = cvSize.w, H = cvSize.h, g = ctx, fs = fsz(), t = tView();
    D.backdrop(g, W, H);
    const n = G.countAt(S, t), dep = G.depositingAt(S, t), depNow = dep && dep.i === n ? S.events[dep.i] : null;
    const level = G.levelAt(S, t);
    // 天空
    const sk = g.createLinearGradient(0, box.t, 0, Z(level));
    sk.addColorStop(0, C['gt-sky2']); sk.addColorStop(1, C['gt-sky']);
    g.fillStyle = sk; g.fillRect(box.l, box.t, box.r - box.l, box.b - box.t);
    // 海（正在堆積海相沉積時）
    if (depNow && isMarine(depNow)) {
      const sea = Z(level + (depNow.rock === 'shale' ? 140 : 70));
      g.fillStyle = C['gt-sea']; g.fillRect(box.l, Math.max(box.t, sea), box.r - box.l, Z(level) - Math.max(box.t, sea));
      g.strokeStyle = D.alpha(C.accent, 0.5); g.lineWidth = 1.2; g.beginPath();
      for (let x = box.l; x <= box.r; x += 4) { const y = sea + Math.sin(x / 9) * 1.5; if (x === box.l) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    const quick = state.playing;
    const im = sectionImage(t, quick);
    g.save(); g.imageSmoothingEnabled = !quick; g.drawImage(im, box.l, box.t, box.r - box.l, box.b - box.t); g.restore();
    // 地表（陸地時畫一層薄薄的土與草）
    if (!(depNow && isMarine(depNow)) && t <= 0.03) {
      g.strokeStyle = D.dark ? '#4d7c3a' : '#65a30d'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(box.l, Z(level) + 0.5); g.lineTo(box.r, Z(level) + 0.5); g.stroke();
    }
    // 化石
    const L = layout();
    Object.keys(L.fos).forEach(function (u) {
      u = +u; const e = S.events[u];
      L.fos[u].forEach(function (p) {
        if (G.rockAtTime(S, p.x, p.z, t) !== u) return;
        drawFossil(g, e.fossil, X(p.x), Z(p.z), Math.max(5, (box.r - box.l) / 110), D.dark ? '#f8fafc' : '#1f2937');
      });
    });
    // 斷層
    faultTrace(n).forEach(function (f) {
      g.strokeStyle = D.dark ? '#fecaca' : '#7f1d1d'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(X(f.x0), Z(f.z0)); g.lineTo(X(f.x1), Z(f.z1)); g.stroke();
      // 半箭頭：上盤往下
      const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2, ux = (X(f.x1) - X(f.x0)), uy = (Z(f.z1) - Z(f.z0)), L2 = Math.hypot(ux, uy), ex = ux / L2, ey = uy / L2;
      const cx = X(mx), cy = Z(mz), o = 6, len = 16;
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(cx - ey * o - ex * len / 2, cy + ex * o - ey * len / 2); g.lineTo(cx - ey * o + ex * len / 2, cy + ex * o + ey * len / 2); g.lineTo(cx - ey * o + ex * len / 2 - ex * 5 - ey * 3, cy + ex * o + ey * len / 2 - ey * 5 + ex * 3); g.stroke();   // 下盤（左）往上
      g.beginPath(); g.moveTo(cx + ey * o + ex * len / 2, cy - ex * o + ey * len / 2); g.lineTo(cx + ey * o - ex * len / 2, cy - ex * o - ey * len / 2); g.lineTo(cx + ey * o - ex * len / 2 + ex * 5 + ey * 3, cy - ex * o - ey * len / 2 + ey * 5 - ex * 3); g.stroke();   // 上盤（右）往下
    });
    // 不整合面（波浪線）
    unconfTraces(n, t).forEach(function (u) {
      g.strokeStyle = D.dark ? '#fde68a' : '#7c2d12'; g.lineWidth = 1.8;
      u.segs.forEach(function (seg) {
        g.beginPath();
        let s = 0;
        for (let k = 0; k < seg.length; k++) {
          const x = X(seg[k][0]), y = Z(seg[k][1]);
          if (k) s += Math.hypot(x - X(seg[k - 1][0]), y - Z(seg[k - 1][1]));
          const yy = y + Math.sin(s / 3.2) * 1.6;
          if (k) g.lineTo(x, yy); else g.moveTo(x, yy);
        }
        g.stroke();
      });
    });
    // 外框與高度刻度
    g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1; g.strokeRect(box.l + 0.5, box.t + 0.5, box.r - box.l - 1, box.b - box.t - 1);
    for (let z = -1500; z <= 400; z += 500) {
      const y = Z(z); g.strokeStyle = D.alpha(C.text, 0.4); g.beginPath(); g.moveTo(box.l - 4, y); g.lineTo(box.l, y); g.stroke();
      D.haloText(g, (z / 1000).toFixed(1).replace('-', '−'), box.l - 6, y, C.muted, 'right', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    }
    D.haloText(g, T('高度（km）', 'Elevation (km)'), 4, 13, C.muted, 'left', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
    // 比例尺
    const sb = 1000 / G.W * (box.r - box.l), sy = box.b + 15;
    g.strokeStyle = C.text; g.lineWidth = 2; g.beginPath(); g.moveTo(box.r - sb, sy); g.lineTo(box.r, sy); g.moveTo(box.r - sb, sy - 4); g.lineTo(box.r - sb, sy + 4); g.moveTo(box.r, sy - 4); g.lineTo(box.r, sy + 4); g.stroke();
    D.haloText(g, '1 km', box.r - sb - 6, sy, C.muted, 'right', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    D.haloText(g, T('垂直誇大 ×' + VE, 'vertical exaggeration ×' + VE), box.l, sy, C.muted, 'left', 'middle', '500 ' + (fs - 1.5) + 'px ' + FONT);
    // 模式專屬
    if (state.mode === 'story') drawStoryLabels(g, fs, t, n, depNow);
    else if (state.mode === 'date') drawDateLabels(g, fs);
    else drawOrderLabels(g, fs);
  }
  function drawStoryLabels(g, fs, t, n, depNow) {
    const tag = fmtT(t) + '・' + perName(G.periodAt(t) || 'precambrian');
    D.pill(g, tag, box.l + 6, box.t + 22, C.accent, 'left', '700 ' + fs + 'px ' + FONT);
    let txt = null;
    if (depNow) txt = evText(depNow);
    else if (n === 0) txt = evText(S.base);
    else { const e = S.events[n - 1]; txt = (e.type === 'erode' && n < S.events.length) ? T('侵蝕中：這段時間沒有留下地層', 'Eroding: this time leaves no rock behind') : evText(e); }
    if (txt) {
      g.font = '600 ' + (fs - 0.5) + 'px ' + FONT;
      const maxw = box.r - box.l - 12;
      let s = txt; while (g.measureText(s).width + 14 > maxw && s.length > 4) s = s.slice(0, -2);
      if (s !== txt) s = s.slice(0, -1) + '…';
      D.pill(g, s, box.r - 6, box.t + 22 + (cvSize.w < 560 ? 22 : 0), C.text, cvSize.w < 560 ? 'right' : 'right', '600 ' + (fs - 0.5) + 'px ' + FONT);
    }
  }
  function drawDateLabels(g, fs) {
    const L = layout();
    // 已定年的單元：小標籤
    const R = recs[state.scen];
    Object.keys(R).forEach(function (u) {
      u = +u; const r = R[u]; if (!r.best) return;
      const b = L.best[u]; if (!b || u === state.sel) return;
      D.pill(g, fmtT(r.best.age, true), X(b.x), Z(b.z) + 7, C.text, 'center', '600 ' + (fs - 1.5) + 'px ' + FONT);
    });
    if (state.sel == null) {
      D.pill(g, T('點一塊岩石來採樣', 'Tap a rock to take a sample'), (box.l + box.r) / 2, box.t + 22, C.accent, 'center', '700 ' + fs + 'px ' + FONT);
      return;
    }
    // 選取的單元：外框
    g.save();
    const pw = imgW, ph = imgH, sx = (box.r - box.l) / pw, sy = (box.b - box.t) / ph;
    g.fillStyle = D.alpha(C['gt-sel'], 0.9);
    for (let j = 1; j < ph - 1; j++) for (let i = 1; i < pw - 1; i++) {
      const p = j * pw + i;
      if (imgU[p] !== state.sel) continue;
      if (imgU[p - 1] !== state.sel || imgU[p + 1] !== state.sel || imgU[p - pw] !== state.sel || imgU[p + pw] !== state.sel) g.fillRect(box.l + i * sx - 0.6, box.t + j * sy - 0.6, sx + 1.2, sy + 1.2);
    }
    g.restore();
    // 採樣點
    const p = state.selPt;
    if (p) {
      const x = X(p.x), y = Z(p.z);
      g.strokeStyle = C['gt-sel']; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x, y); g.stroke();
      D.ball(g, x, y, 4.5, C['gt-sel']);
      g.fillStyle = C['gt-sel']; g.beginPath(); g.moveTo(x - 7, y - 22); g.lineTo(x + 7, y - 22); g.lineTo(x, y - 14); g.closePath(); g.fill();
      const name = unitName(state.sel), r = R[state.sel], tag = name + (r && r.best ? T('：', ': ') + fmtT(r.best.age, true) : '');
      const right = x > (box.l + box.r) / 2;
      D.pill(g, tag, right ? x - 10 : x + 10, y - 22, C['gt-sel'], right ? 'right' : 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
  }
  let orderPos = null;   // 排序題每個項目在畫面上的位置
  function drawOrderLabels(g, fs) {
    const L = layout(), items = G.orderItems(S), n = S.events.length;
    orderPos = {};
    const placed = new Set(state.seq);
    const fts = faultTrace(n), uts = unconfTraces(n, 0);
    // 每個項目的候選位置，再依序挑一個不和已放好的標籤重疊的（避讓）
    const cands = {};
    items.forEach(function (it) {
      const e = it === G.BASE ? null : S.events[it];
      if (!e || e.type === 'deposit' || e.type === 'dike') cands[it] = (L.cand[it] || []).filter(function (c, k) { return k < 400; });
      else if (e.type === 'fault') { const f = fts.find(function (q) { return q.i === it; }); if (f) cands[it] = [0.3, 0.2, 0.42, 0.12, 0.55, 0.65].map(function (u) { return { x: f.x0 + (f.x1 - f.x0) * u, z: f.z0 + (f.z1 - f.z0) * u }; }); }
      else if (e.type === 'erode') {
        const u = uts.find(function (q) { return q.i === it; });
        if (u) { const pts = []; u.segs.forEach(function (sg) { sg.forEach(function (p) { pts.push({ x: p[0], z: p[1] }); }); }); const k0 = Math.floor(pts.length * (0.12 + 0.13 * (it % 4))); cands[it] = pts.slice(k0).concat(pts.slice(0, k0)); }
      }
    });
    const ordered = Object.keys(cands).map(Number).sort(function (a, b) {
      const ea = a === G.BASE ? 0 : S.events[a].type === 'deposit' || S.events[a].type === 'dike' ? 1 : 0, eb = b === G.BASE ? 0 : S.events[b].type === 'deposit' || S.events[b].type === 'dike' ? 1 : 0;
      return ea - eb || cands[a].length - cands[b].length;
    });
    const spots = [], MIN = cvSize.w < 560 ? 21 : 28;
    ordered.forEach(function (it) {
      let pick = null, bestD = -1;
      for (let k = 0; k < cands[it].length; k++) {
        const c = cands[it][k], sx = X(c.x), sy = Z(c.z);
        if (sx < box.l + 13 || sx > box.r - 13 || sy < box.t + 13 || sy > box.b - 13) continue;
        let dmin = 1e9; spots.forEach(function (q) { dmin = Math.min(dmin, Math.hypot(q[0] - sx, q[1] - sy)); });
        if (dmin >= MIN) { pick = c; break; }
        if (dmin > bestD) { bestD = dmin; pick = c; }
      }
      if (!pick) return;
      spots.push([X(pick.x), Z(pick.z)]);
      orderPos[it] = { x: pick.x, z: pick.z };
    });
    items.forEach(function (it) {
      if (!orderPos[it]) return;
      const x = orderPos[it].x, z = orderPos[it].z;
      const lab = letterOf(it), px = X(x), py = Z(z), on = placed.has(it), r = cvSize.w < 560 ? 9 : 11;
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2);
      g.fillStyle = on ? D.alpha(C.muted, 0.85) : D.alpha(C['canvas-bg'], 0.92); g.fill();
      g.strokeStyle = on ? C.muted : C.accent; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = on ? C['canvas-bg'] : C.accent; g.font = '700 ' + (fs - 0.5) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(lab, px, py + 0.5);
    });
    const tilt = items.find(function (it) { return it >= 0 && S.events[it].type === 'tilt'; });
    $('tiltHint').textContent = tilt != null ? T('「' + letterOf(tilt) + '」是地層傾斜，圖上沒有標字母：看哪些地層是斜的。', '“' + letterOf(tilt) + '” is the tilting; it has no letter in the picture — look for the slanted beds.') : '';
  }

  // =====================================================================
  // 排序題
  // =====================================================================
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let letters = {};
  function buildLetters() {
    const items = G.orderItems(S), idx = items.map(function (_, i) { return i; });
    // 依剖面固定的打亂順序（字母不洩漏先後）
    idx.sort(function (a, b) { return hash2(items[a] + 17, S.id.charCodeAt(0)) - hash2(items[b] + 17, S.id.charCodeAt(0)); });
    letters = {};
    idx.forEach(function (k, j) { letters[items[k]] = LETTERS[j]; });
  }
  function letterOf(it) { return letters[it] || '?'; }
  function buildPick() {
    const items = G.orderItems(S).slice().sort(function (a, b) { return letterOf(a) < letterOf(b) ? -1 : 1; });
    const h = items.map(function (it) {
      const on = state.seq.indexOf(it) >= 0;
      return '<button type="button" data-it="' + it + '" aria-pressed="' + on + '"><b>' + letterOf(it) + '</b><span>' + itemName(it) + '</span></button>';
    }).join('');
    const P = $('pick'); if (P.innerHTML !== h) P.innerHTML = h;
    renderSeq();
  }
  function renderSeq() {
    const items = G.orderItems(S);
    let h = '';
    if (!state.seq.length) h = '<em>' + T('還沒有排任何事件（最老的先點）', 'Nothing placed yet (tap the oldest first)') + '</em>';
    else h = '<em>' + T('老', 'old') + '</em>' + state.seq.map(function (it, k) {
      const cls = state.checked ? (items[k] === it ? 'ok' : 'bad') : '';
      return '<span class="' + cls + '">' + letterOf(it) + '</span>';
    }).join('') + '<em>' + T('新', 'young') + '</em>';
    const Q = $('seq'); if (Q.innerHTML !== h) Q.innerHTML = h;
    setHTML('rN', String(items.length));
    setHTML('rPlaced', String(state.seq.length));
  }
  function addItem(it) {
    if (state.seq.indexOf(it) >= 0) { setStatus(T('「' + letterOf(it) + '」已經排過了。', '“' + letterOf(it) + '” is already placed.')); return; }
    acted(); state.seq.push(it); state.checked = false;
    const S2 = sound(); if (S2) S2.tone({ freq: 440 + 30 * Math.min(10, state.seq.length), dur: 0.06, gain: 0.06 });
    buildPick(); setHTML('rRes', '—'); requestDraw();
    if (state.seq.length === G.orderItems(S).length) check();
    else setStatus(T('第 ' + state.seq.length + ' 個：' + letterOf(it) + '（' + itemName(it) + '）', 'No. ' + state.seq.length + ': ' + letterOf(it) + ' (' + itemName(it) + ')'));
  }
  function check() {
    const items = G.orderItems(S);
    let ok = 0; while (ok < state.seq.length && state.seq[ok] === items[ok]) ok++;
    let right = 0; state.seq.forEach(function (it, k) { if (items[k] === it) right++; });
    const done = state.seq.length === items.length, perfect = done && ok === items.length;
    state.checked = true; renderSeq(); requestDraw();
    const S2 = sound();
    if (perfect) {
      if (S2) { S2.tone({ freq: 523, dur: 0.1, gain: 0.08 }); setTimeout(function () { S2.tone({ freq: 659, dur: 0.1, gain: 0.08 }); }, 110); setTimeout(function () { S2.tone({ freq: 784, dur: 0.16, gain: 0.08 }); }, 220); }
      setHTML('rRes', T('全對！', 'All correct!'));
      setStatus(T('全對！你用疊置、截切與不整合，排出了這面岩壁的完整歷史。', 'All correct! Using superposition, cross-cutting and unconformities you reconstructed the whole history of this cliff.'));
    } else {
      if (S2) S2.tone({ freq: 330, dur: 0.12, gain: 0.07 });
      setHTML('rRes', T('前 ' + ok + ' 個正確', 'First ' + ok + ' correct') + '<span class="sub">' + T('位置對的共 ' + right + ' 個', right + ' in the right place') + '</span>');
      setStatus(ok < state.seq.length ? T('從第 ' + (ok + 1) + ' 個（' + letterOf(state.seq[ok]) + '）開始不對。想想看：誰切過誰？誰壓在誰上面？', 'It goes wrong from No. ' + (ok + 1) + ' (' + letterOf(state.seq[ok]) + '). Think: what cuts what, and what lies on top of what?')
        : T('目前排的都對，繼續排下去。', 'Everything so far is right; keep going.'));
    }
    emit('order', { scen: state.scen, n: items.length, placed: state.seq.length, correct: ok, right: right, done: done, perfect: perfect, dated: datedList() });
  }

  // =====================================================================
  // 定年
  // =====================================================================
  function rec(u) { const R = recs[state.scen]; return R[u] || (R[u] = { k: {}, ok: {}, best: null }); }
  function measureNow() {
    if (state.sel == null) { setStatus(T('先在剖面上點一塊岩石採樣。', 'First tap a rock in the cross-section to take a sample.')); return; }
    acted();
    const u = state.sel, sys = state.sys, r = rec(u), k = (r.k[sys] || 0);
    r.k[sys] = k + 1;
    const m = G.measure(S, u, sys, k);
    state.last = { u: u, sys: sys, m: m, k: k + 1 };
    const S2 = sound();
    if (m.ok) {
      r.ok[sys] = m;
      if (m.what === 'formation' && (!r.best || m.sigma < r.best.sigma)) r.best = m;
      if (S2) { S2.tone({ freq: 880, dur: 0.05, gain: 0.05 }); setTimeout(function () { S2.tone({ freq: 660, dur: 0.1, gain: 0.07 }); }, 70); }
      setStatus(T('第 ' + (k + 1) + ' 次量測：', 'Measurement ' + (k + 1) + ': ') + fmtAge(m.age, m.sigma) + (m.what === 'detrital' ? T('——這是砂岩裡碎屑鋯石的年代，比砂岩本身老。', ' — the age of the zircon grains in the sandstone, older than the sandstone itself.') : T('。', '.')));
    } else {
      if (S2) S2.tone({ freq: 300, dur: 0.14, gain: 0.06 });
      setStatus(reasonText(m.reason, u, sys));
    }
    updateReadouts(); requestDraw();
    const okSys = Object.keys(r.ok);
    const a = r.ok.U238, b = r.ok.U235, ages = {};
    okSys.forEach(function (q) { ages[q] = [r.ok[q].age, r.ok[q].sigma, r.ok[q].what]; });
    emit('measure', { scen: state.scen, unit: u, rock: G.unitRock(S, u), kind: kindOf(u), sys: sys, ok: m.ok, reason: m.reason || null, age: m.ok ? m.age : null, sigma: m.ok ? m.sigma : null,
      what: m.what || null, formAge: G.unitAge(S, u), k: k + 1, dated: datedList(), best: bestMap(), sysOk: okSys, ages: ages, concord: !!(a && b && Math.abs(a.age - b.age) / Math.max(1e-9, (a.age + b.age) / 2) < 0.005) });
  }
  /** 這個剖面已經量到「形成年代」的單元與最好的年代 */
  function datedList() { const R = recs[state.scen]; return Object.keys(R).filter(function (q) { return R[q].best; }).map(Number); }
  function bestMap() { const R = recs[state.scen], o = {}; Object.keys(R).forEach(function (q) { if (R[q].best) o[q] = R[q].best.age; }); return o;
  }
  function reasonText(reason, u, sys) {
    const rock = G.unitRock(S, u);
    if (reason === 'no-carbon') return T('這塊岩石沒有生物留下的碳。碳十四只能量曾經活著的東西（木頭、木炭、骨頭、貝殼），而且不能超過約 5 萬年。', 'This rock contains no carbon from living things. Carbon-14 only works on things that were once alive (wood, charcoal, bone, shell), and only up to about 50 000 years.');
    if (reason === 'too-old') return T('這層有碳（化石、碳酸鈣），但它有幾億年老：經過幾萬個半衰期，碳十四早就衰變光了。', 'This layer does contain carbon (fossils, calcium carbonate), but it is hundreds of millions of years old: after tens of thousands of half-lives no carbon-14 is left.');
    if (reason === 'reset') return T('片麻岩經過變質作用，鉀–氬與銣–鍶時鐘被部分重設，量到的數字不可靠；鋯石的鈾–鉛時鐘比較耐得住，試試鈾–鉛。', 'The gneiss has been metamorphosed, which partly resets the K–Ar and Rb–Sr clocks; the uranium–lead clock in zircon survives better — try uranium–lead.');
    if (reason === 'mixed') return T('礫石是許多不同岩石的碎塊，每顆的年代都不一樣，量出來也不能代表礫石層。找找看裡面有沒有曾經活著的東西。', 'Gravel is a mix of pieces from many different rocks, each with its own age, so no single number dates the gravel. Look for something in it that was once alive.');
    if (reason === 'too-young') return T('太年輕了：子元素還太少，量不準。', 'Too young: too little daughter has formed to measure.');
    if (rock === 'ash' && sys === 'Rb87') return T('火山灰裡的礦物顆粒太少、種類太少，做不出等時線。改用鈾–鉛或鉀–氬。', 'An ash bed has too few kinds of mineral grains to make an isochron. Use uranium–lead or potassium–argon instead.');
    if (rock === 'sandstone' || rock === 'conglomerate') return T('砂岩裡的礦物都是從別處侵蝕來的碎屑；只有鋯石的鈾–鉛年代有意義，而它代表的是「來源岩石」的年代。', 'The minerals in a sandstone are grains eroded from elsewhere; only the uranium–lead age of its zircon means something, and that is the age of the source rock.');
    return T(ROCK_ZH[rock] + '沒有可以直接定年的礦物。地質學家用上下夾住它的火成岩來推算它的年代。', 'This ' + ROCK_EN[rock] + ' has no mineral that can be dated directly. Geologists bracket it between dated igneous layers above and below.');
  }
  function sysHint() {
    const s = state.sys;
    const h = { U238: T('鋯石裡的鈾 238 衰變成鉛 206。半衰期 44.7 億年，適合幾百萬年到地球年齡的岩石。', 'Uranium-238 in zircon decays to lead-206. Half-life 4.47 billion years: good from a few million years to the age of the Earth.'),
      U235: T('鈾 235 衰變成鉛 207，半衰期 7.04 億年。和鈾 238 一起用，兩個時鐘互相核對。', 'Uranium-235 decays to lead-207, half-life 704 million years. Used together with uranium-238, the two clocks check each other.'),
      K40: T('鉀 40 有 10.5% 衰變成氬 40（氣體），半衰期 12.5 億年。熔岩與火山灰冷卻後才開始累積氬。', '10.5% of potassium-40 decays to argon-40 (a gas), half-life 1.25 billion years. Argon starts to build up only once lava or ash has cooled.'),
      Rb87: T('銣 87 衰變成鍶 87，半衰期 496 億年。量同一岩體的幾種礦物，畫成等時線。', 'Rubidium-87 decays to strontium-87, half-life 49.6 billion years. Several minerals of one rock are plotted as an isochron.'),
      C14: T('碳 14 半衰期 5700 年，只能量曾經活著、5 萬年以內的東西。', 'Carbon-14 has a half-life of 5700 years and only dates once-living things younger than about 50 000 years.') };
    $('sysHint').textContent = h[s];
  }

  // =====================================================================
  // 圖表
  // =====================================================================
  function axes(g, bx, xr, yr, xl, yl, fs, opt) {
    opt = opt || {};
    const Xf = function (v) { return bx.l + (v - xr[0]) / (xr[1] - xr[0]) * (bx.r - bx.l); };
    const Yf = function (v) { return bx.b - (v - yr[0]) / (yr[1] - yr[0]) * (bx.b - bx.t); };
    const sx = opt.sx || niceStep(xr[1] - xr[0], 4), syy = opt.sy || niceStep(yr[1] - yr[0], 4);
    g.lineWidth = 1;
    for (let v = Math.ceil(yr[0] / syy - 1e-9) * syy; v <= yr[1] + 1e-9; v += syy) {
      const y = Math.round(Yf(v)) + 0.5; g.strokeStyle = D.alpha(C.text, 0.08); g.beginPath(); g.moveTo(bx.l, y); g.lineTo(bx.r, y); g.stroke();
      D.haloText(g, (opt.fy || function (q) { return num(q, syy < 0.1 ? 2 : syy < 1 ? 1 : 0); })(v), bx.l - 4, y, C.muted, 'right', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    }
    for (let v = Math.ceil(xr[0] / sx - 1e-9) * sx; v <= xr[1] + 1e-9; v += sx) {
      const x = Math.round(Xf(v)) + 0.5; g.strokeStyle = D.alpha(C.text, 0.06); g.beginPath(); g.moveTo(x, bx.t); g.lineTo(x, bx.b); g.stroke();
      D.haloText(g, (opt.fx || function (q) { return num(q, sx < 1 ? 1 : 0); })(v), x, bx.b + 11, C.muted, Math.abs(v - xr[1]) < sx * 0.3 ? 'right' : 'center', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    }
    g.strokeStyle = D.alpha(C.text, 0.4); g.strokeRect(bx.l + 0.5, bx.t + 0.5, bx.r - bx.l - 1, bx.b - bx.t - 1);
    D.haloText(g, xl, (bx.l + bx.r) / 2, bx.b + 25, C.muted, 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, yl, bx.l - 2, bx.t - 9, C.muted, 'left', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    return { X: Xf, Y: Yf };
  }
  function drawChart() {
    if (!grSize || state.mode === 'order') return;
    const W = grSize.w, H = grSize.h, g = gtx, fs = fsz();
    g.clearRect(0, 0, W, H);
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    if (state.mode === 'story') chartTimeline(g, W, H, fs);
    else chartDecay(g, W, H, fs);
  }
  /** 地質年代表＋事件（橫軸與時間滑桿同一個刻度） */
  function chartTimeline(g, W, H, fs) {
    const bx = { l: 14, r: W - 14, t: 26, b: H - 30 };
    const TX = function (t) { return bx.l + tToPos(t) / 1000 * (bx.r - bx.l); };
    const bandT = bx.b - 46, bandB = bx.b - 22, eraT = bx.b - 20, eraB = bx.b;
    // 紀
    const per = [{ id: 'precambrian', from: tmax(), to: 538.8 }].concat(G.PERIODS);
    per.forEach(function (p) {
      if (p.to >= tmax()) return;
      const x0 = TX(Math.min(p.from, tmax())), x1 = TX(p.to);
      g.fillStyle = D.dark ? D.alpha(PER[p.id][2], 0.75) : PER[p.id][2]; g.fillRect(x0, bandT, x1 - x0, bandB - bandT);
      g.strokeStyle = D.alpha(C['canvas-bg'], 0.9); g.lineWidth = 1; g.strokeRect(x0 + 0.5, bandT + 0.5, x1 - x0 - 1, bandB - bandT - 1);
      const w = x1 - x0, name = w > 54 ? perName(p.id) : w > 16 ? PER[p.id][3] : '';
      if (name) { g.fillStyle = '#1f2937'; g.font = '600 ' + (fs - 1.5) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, (x0 + x1) / 2, (bandT + bandB) / 2 + 0.5); }
    });
    // 代
    ['precambrian', 'paleozoic', 'mesozoic', 'cenozoic'].forEach(function (id, k) {
      const e = k === 0 ? { from: tmax(), to: 538.8 } : G.ERAS[k];
      if (e.to >= tmax()) return;
      const x0 = TX(Math.min(e.from, tmax())), x1 = TX(e.to);
      g.fillStyle = D.alpha(C.text, k % 2 ? 0.1 : 0.05); g.fillRect(x0, eraT, x1 - x0, eraB - eraT);
      if (x1 - x0 > 40) D.haloText(g, T(ERA[id][0], ERA[id][1]), (x0 + x1) / 2, (eraT + eraB) / 2, C.muted, 'center', 'middle', '600 ' + (fs - 1.5) + 'px ' + FONT);
    });
    // 事件刻度
    const evs = [{ t: S.base.t, e: S.base }].concat(S.events.map(function (e) { return { t: e.type === 'deposit' ? e.t0 : e.t, e: e }; }));
    evs.forEach(function (q, k) {
      if (q.t > tmax()) return;
      const x = TX(q.t), e = q.e, done = tView() <= q.t;
      let col = C.muted;
      if (e === S.base || e.type === 'deposit') col = unitCSS(e === S.base ? G.BASE : S.events.indexOf(e));
      else if (e.type === 'erode') col = D.dark ? '#fde68a' : '#7c2d12';
      else if (e.type === 'fault') col = D.dark ? '#fecaca' : '#7f1d1d';
      else if (e.type === 'tilt') col = C.accent;
      else col = unitCSS(S.events.indexOf(e));
      const y0 = bx.t + 8 + (k % 5) * Math.max(10, (bandT - bx.t - 30) / 5);
      g.strokeStyle = D.alpha(C.text, done ? 0.5 : 0.18); g.lineWidth = 1; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, bandT); g.stroke();
      g.fillStyle = done ? col : D.alpha(col, 0.35); g.strokeStyle = D.alpha(C.text, done ? 0.7 : 0.25);
      g.beginPath(); if (e.type === 'erode') { g.moveTo(x - 4, y0 - 4); g.lineTo(x + 4, y0 - 4); g.lineTo(x, y0 + 3); g.closePath(); } else if (e.type === 'tilt' || e.type === 'fault') g.rect(x - 3.5, y0 - 3.5, 7, 7); else g.arc(x, y0, 4, 0, Math.PI * 2);
      g.fill(); g.stroke();
    });
    // 目前時間
    const xn = TX(tView());
    g.strokeStyle = C.accent; g.lineWidth = 2; g.beginPath(); g.moveTo(xn, bx.t - 4); g.lineTo(xn, eraB); g.stroke();
    const lab = fmtT(tView(), true), right = xn > W * 0.7;
    D.pill(g, lab, right ? xn - 4 : xn + 4, bx.t - 2, C.accent, right ? 'right' : 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    // 時間標記
    [1500, 1000, 500, 250, 100, 50, 10].forEach(function (t) {
      if (t > tmax()) return;
      const x = TX(t);
      D.haloText(g, String(t), x, eraB + 11, C.muted, 'center', 'middle', '500 ' + (fs - 1.5) + 'px ' + FONT);
    });
    D.haloText(g, T('百萬年前（越右越接近現在）', 'Million years ago (later to the right)'), (bx.l + bx.r) / 2, eraB + 24, C.muted, 'center', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
    $('chartHint').textContent = T('地質年代表與這個剖面的事件：圓點＝沉積或火成活動、方塊＝傾斜或斷層、三角＝侵蝕。橫軸和時間滑桿的刻度相同，越接近現在越細。', 'The geologic time scale and the events in this section: circles = deposits or igneous activity, squares = tilting or faulting, triangles = erosion. The axis matches the time slider, stretched toward the present.');
  }
  /** 衰變曲線或等時線 */
  function chartDecay(g, W, H, fs) {
    const last = state.last && state.last.sys === state.sys && state.last.u === state.sel ? state.last : null;
    const m = last && last.m.ok ? last.m : null, sys = state.sys, Sy = G.SYSTEMS[sys];
    const bx = { l: 50, r: W - 14, t: 24, b: H - 34 };
    if (sys === 'Rb87' && m) {
      const xs = m.pts.map(function (p) { return p[0]; }), ys = m.pts.map(function (p) { return p[1]; });
      const ymin = Math.min(G.SR0, Math.min.apply(null, ys)), ymax = Math.max.apply(null, ys);
      const pad = (ymax - ymin) * 0.12 || 0.01;
      const A = axes(g, bx, [0, 20], [ymin - pad, ymax + pad], '', '', fs, { fy: function (q) { return num(q, 3); } });
      D.haloText(g, '87Rb / 86Sr', (bx.l + bx.r) / 2, bx.b + 25, C.muted, 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
      D.haloText(g, '87Sr / 86Sr', bx.l - 2, bx.t - 9, C.muted, 'left', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
      g.strokeStyle = D.alpha(C.text, 0.45); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(A.X(0), A.Y(G.SR0)); g.lineTo(A.X(20), A.Y(G.SR0)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = C.accent; g.lineWidth = 2.2; g.beginPath(); g.moveTo(A.X(0), A.Y(m.fit.icpt)); g.lineTo(A.X(20), A.Y(m.fit.icpt + 20 * m.fit.slope)); g.stroke();
      m.pts.forEach(function (p) { D.ball(g, A.X(p[0]), A.Y(p[1]), 5, C['gt-sel']); });
      D.haloText(g, T('斜率 = ', 'slope = ') + num(m.fit.slope, 5) + ' → t = ' + fmtT(m.age, true), A.X(1), A.Y(ymax + pad * 0.4), C.accent, 'left', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
      $('chartHint').textContent = T('等時線：四種礦物（斜長石、角閃石、鉀長石、黑雲母）一開始的鍶同位素比相同（虛線），銣越多的礦物長出越多的鍶 87，於是排成一直線；斜率 = e^(λt) − 1。', 'Isochron: four minerals (plagioclase, hornblende, K-feldspar, biotite) started with the same Sr ratio (dashed); the ones with more rubidium grew more 87Sr, so they line up; the slope is e^(λt) − 1.');
      return;
    }
    // 母元素剩下的比例與子元素：橫軸是半衰期的倍數（或年）
    const half = G.halfLife(sys);
    let tMaxYr = 4 * half;
    if (m) tMaxYr = Math.max(m.age * 1e6 * 1.5, sys === 'C14' ? 20000 : 1e8);
    if (sys !== 'C14') tMaxYr = Math.min(tMaxYr, 4 * half);
    const unit = sys === 'C14' ? 1 : 1e6, xl = sys === 'C14' ? T('年', 'Years') : T('百萬年', 'Million years');
    const A = axes(g, bx, [0, tMaxYr / unit], [0, 1], xl, '', fs, { sy: 0.25, fy: function (q) { return num(q * 100, 0) + '%'; }, fx: function (q) { return q >= 10000 ? group(q) : num(q, q < 10 && q % 1 ? 1 : 0); } });
    D.haloText(g, T('原子數占一開始母元素的比例', 'Atoms, as a share of the starting parent'), bx.l - 2, bx.t - 9, C.muted, 'left', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    // 半衰期刻度
    for (let k = 1; k <= 4; k++) {
      const tx = k * half; if (tx > tMaxYr) break;
      const x = A.X(tx / unit); g.strokeStyle = D.alpha(C.accent, 0.35); g.setLineDash([3, 4]); g.beginPath(); g.moveTo(x, bx.t); g.lineTo(x, bx.b); g.stroke(); g.setLineDash([]);
      D.haloText(g, k + 'T½', x + 3, bx.b - 9, C.accent, 'left', 'middle', '600 ' + (fs - 1.5) + 'px ' + FONT);
    }
    const parentCol = D.dark ? '#93c5fd' : '#1d4ed8', daughterCol = D.dark ? '#fdba74' : '#c2410c';
    g.lineWidth = 2.2;
    g.strokeStyle = parentCol; g.beginPath();
    for (let i = 0; i <= 160; i++) { const t = tMaxYr * i / 160, y = Math.exp(-Sy.lambda * t); if (i) g.lineTo(A.X(t / unit), A.Y(y)); else g.moveTo(A.X(t / unit), A.Y(y)); }
    g.stroke();
    if (sys !== 'C14') {
      g.strokeStyle = daughterCol; g.beginPath();
      for (let i = 0; i <= 160; i++) { const t = tMaxYr * i / 160, y = Sy.branch * (1 - Math.exp(-Sy.lambda * t)); if (i) g.lineTo(A.X(t / unit), A.Y(y)); else g.moveTo(A.X(t / unit), A.Y(y)); }
      g.stroke();
    }
    const names = { U238: ['238U', '206Pb'], U235: ['235U', '207Pb'], K40: ['40K', '40Ar'], Rb87: ['87Rb', '87Sr'], C14: ['14C', ''] }[sys];
    D.haloText(g, T('母元素 ', 'parent ') + names[0], bx.r - 6, A.Y(0.92), parentCol, 'right', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    if (names[1]) D.haloText(g, T('子元素 ', 'daughter ') + names[1], bx.r - 6, A.Y(sys === 'K40' ? 0.16 : 0.8), daughterCol, 'right', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    if (m) {
      const t = m.age * 1e6, x = A.X(t / unit), y = Math.exp(-Sy.lambda * t);
      g.strokeStyle = C['gt-sel']; g.lineWidth = 1.6; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, bx.b); g.lineTo(x, A.Y(y)); g.lineTo(bx.l, A.Y(y)); g.stroke(); g.setLineDash([]);
      D.ball(g, x, A.Y(y), 5, C['gt-sel']);
      D.pill(g, fmtT(m.age, true), x + 6, A.Y(y) - 6, C['gt-sel'], x > (bx.l + bx.r) * 0.65 ? 'right' : 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
    $('chartHint').textContent = sys === 'C14'
      ? T('碳十四每 5700 年少一半。量到剩下的比例，就能從曲線讀出經過了多久。', 'Carbon-14 halves every 5700 years. Measure how much is left and read off from the curve how long it has been.')
      : T('母元素每經過一個半衰期就少一半，子元素同時增加（鉀 40 只有 10.5% 變成氬 40）。量到子元素和母元素的比，就能從曲線讀出時間。', 'The parent halves every half-life while the daughter grows (only 10.5% of potassium-40 becomes argon-40). The daughter-to-parent ratio fixes the time on the curve.');
  }

  // =====================================================================
  // 讀數、事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const Sd = window.LabSound; return Sd && Sd.enabled() ? Sd : null; }
  function setStatus(s) { $('status').textContent = s; }
  function storySnap() {
    const t = tNow, n = G.countAt(S, t), dep = G.depositingAt(S, t), depNow = dep && dep.i === n ? S.events[dep.i] : null;
    const last = n > 0 ? S.events[n - 1] : null;
    return { scen: state.scen, t: t, period: G.periodAt(t) || 'precambrian', era: eraAt(t), n: n, dep: depNow ? depNow.rock : null, fossil: depNow ? depNow.fossil || null : null,
      last: last ? last.type : null, eroding: !depNow && !!last && last.type === 'erode' && n < S.events.length,
      angular: !depNow && !!last && last.type === 'erode' && n >= 2 && S.events[n - 2].type === 'tilt', playing: state.playing,
      depUnit: depNow ? dep.i : null, dated: datedList() };
  }
  let lastEmit = 0;
  function emitStory(force) {
    if (state.mode !== 'story') return;
    const t = performance.now();
    if (force || t - lastEmit > 250) { lastEmit = t; emit('story', storySnap()); }
  }
  function refreshOutputs() { setOut(elT, tNow <= 0 ? '0' : tNow < 1 ? num(tNow, 4) : num(tNow, tNow >= 100 ? 0 : tNow >= 10 ? 1 : 2)); }
  function buildEvents() {
    const evs = [{ t: S.base.t, e: S.base }].concat(S.events.map(function (e) { return { t: e.type === 'deposit' ? e.t0 : e.t, e: e }; }));
    const h = evs.map(function (q, k) {
      return '<li data-k="' + k + '"><span>' + (q.t < 1 ? group(q.t * 1e6) + T(' 年', ' yr') : num(q.t, q.t >= 100 ? 0 : 1) + ' Ma') + '</span><span>' + evText(q.e) + '</span></li>';
    }).join('');
    const L = $('events'); if (L.innerHTML !== h) L.innerHTML = h;
  }
  function markEvents() {
    const n = G.countAt(S, tNow), dep = G.depositingAt(S, tNow);
    document.querySelectorAll('#events li').forEach(function (li) {
      const k = +li.getAttribute('data-k') - 1;   // −1 = 基盤
      const done = k < n, now = dep && dep.i === n ? k === dep.i : k === n - 1;
      li.classList.toggle('done', done || k === -1);
      li.classList.toggle('now', !!now || (n === 0 && k === -1));
    });
  }
  function updateReadouts() {
    // 故事
    const t = tNow, n = G.countAt(S, t), dep = G.depositingAt(S, t), depNow = dep && dep.i === n ? S.events[dep.i] : null;
    setHTML('rT', fmtT(t));
    setHTML('rPer', T(ERA[eraAt(t)][0], ERA[eraAt(t)][1]) + '・' + perName(G.periodAt(t) || 'precambrian'));
    const last = n > 0 ? S.events[n - 1] : null;
    setHTML('rNow', depNow ? evText(depNow) : n === 0 ? evText(S.base) : last.type === 'erode' && n < S.events.length ? T('侵蝕中（沒有留下地層）', 'Erosion (no rock is left behind)') : evText(last));
    setHTML('rLevel', num(G.levelAt(S, t), 0) + ' m');
    markEvents();
    // 定年
    const sys = state.sys, half = G.halfLife(sys);
    setHTML('rHalf', half >= 1e8 ? T(num(half / 1e8, 2) + ' 億年', num(half / 1e9, 3) + ' billion years') : group(half) + T(' 年', ' years'));
    const last2 = state.last && state.last.u === state.sel && state.last.sys === sys ? state.last : null, m = last2 && last2.m;
    if (m && m.ok) {
      const lbl = { U238: '<sup>206</sup>Pb/<sup>238</sup>U', U235: '<sup>207</sup>Pb/<sup>235</sup>U', K40: '<sup>40</sup>Ar/<sup>40</sup>K', C14: T('剩下的 ', 'remaining ') + '<sup>14</sup>C', Rb87: T('等時線斜率', 'isochron slope') }[sys];
      const r = sys === 'Rb87' ? m.fit.slope : m.r;
      setHTML('rRatio', num(r, r < 0.01 ? 6 : r < 1 ? 4 : 3) + '<span class="sub">' + lbl + '</span>');
      setHTML('rAge', fmtAge(m.age, m.sigma) + '<span class="sub">' + T('第 ', 'measurement ') + last2.k + T(' 次量測（1σ）', ' (1σ)') + '</span>');
      setHTML('rWhat', m.what === 'detrital' ? T('來源岩石的年代（碎屑鋯石），比這層砂岩老', 'the source rock (detrital zircon), older than this sandstone') : kindOf(state.sel) === 'base' ? T('變質作用（鋯石再結晶）', 'metamorphism (zircon regrowth)') : sys === 'C14' ? T('樹木死亡的時間', 'when the tree died') : T('岩漿冷卻結晶的時間', 'when the magma cooled and crystallised'));
    } else if (m) {
      setHTML('rRatio', '—'); setHTML('rAge', T('無法定年', 'Cannot be dated')); setHTML('rWhat', '—');
    } else { setHTML('rRatio', '—'); setHTML('rAge', '—'); setHTML('rWhat', '—'); }
    const se = state.sel == null ? null : unitEv(state.sel);
    setHTML('rFos', se && se.fossil ? T(FOS_ZH[se.fossil] + '（生存於 ' + G.FOSSILS[se.fossil].from + '–' + G.FOSSILS[se.fossil].to + ' 百萬年前）', FOS_EN[se.fossil] + ' (lived ' + G.FOSSILS[se.fossil].from + '–' + G.FOSSILS[se.fossil].to + ' Ma)') : state.sel == null ? '—' : T('沒有', 'none'));
    $('selName').textContent = state.sel == null ? T('還沒有採樣', 'No sample yet') : unitName(state.sel);
    // 排序
    if (state.mode === 'order') renderSeq();
    sayNow();
  }
  function sayNow() {
    let txt;
    if (state.mode === 'story') txt = fmtT(tNow) + '，' + perName(G.periodAt(tNow) || 'precambrian') + '：' + $('rNow').textContent;
    else if (state.mode === 'date') txt = (state.sel == null ? T('還沒有採樣', 'No sample yet') : unitName(state.sel)) + '，' + $('rAge').textContent;
    else txt = T('已排 ', 'Placed ') + state.seq.length + ' / ' + G.orderItems(S).length;
    $('srNow').textContent = txt;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  let lastN = null;
  function storyCues() {
    const n = G.countAt(S, tNow);
    if (lastN != null && n > lastN && state.mode === 'story') {
      const e = S.events[n - 1], Sd = sound();
      const f = { deposit: 523, erode: 392, tilt: 330, fault: 294, dike: 659 }[e.type] || 440;
      if (Sd) Sd.tone({ freq: e.rock === 'ash' ? 784 : f, dur: 0.08, gain: 0.07 });
      setStatus(fmtT(e.type === 'deposit' ? e.t1 : e.t) + '：' + evText(e));
    }
    lastN = n;
  }
  function refreshAll() { tNow = readT(); storyCues(); refreshOutputs(); updateReadouts(); requestDraw(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  elT.addEventListener('input', function () { if (internal) return; acted(); if (state.playing) { state.playing = false; setPlayLabel(); } refreshAll(); emitStory(); });
  elT.addEventListener('change', function () { if (internal) return; refreshAll(); emitStory(true); });
  function applyMode() {
    const m = state.mode;
    setSeg('modeSeg', 'data-mode', m);
    $('storyCard').hidden = m !== 'story'; $('dateCard').hidden = m !== 'date'; $('orderCard').hidden = m !== 'order';
    $('rdStory').hidden = m !== 'story'; $('rdDate').hidden = m !== 'date'; $('rdOrder').hidden = m !== 'order';
    $('playBtn').hidden = m !== 'story';
    $('chartCard').hidden = m === 'order';
    if (m !== 'story') stopPlay();
    $('hint2d').textContent = m === 'story' ? T('拖時間滑桿或按「播放」，看每一層怎麼來的。波浪線是不整合面（被埋起來的侵蝕面），暗紅線是斷層。', 'Drag the time slider or press “Play” to see where each layer came from. The wavy lines are unconformities (old erosion surfaces); the dark red line is a fault.')
      : m === 'date' ? T('點岩層採樣，選定年法後按「量測」。每次量測都有一點誤差，可以多量幾次。', 'Tap a layer to sample it, choose a method and press “Measure”. Each measurement has a little error, so you can repeat it.')
        : T('只看岩石的關係（誰壓著誰、誰切過誰），由老到新點字母。', 'Using only how the rocks relate (what lies on what, what cuts what), tap the letters from oldest to youngest.');
    cv.setAttribute('aria-label', m === 'story' ? T('地層剖面：隨時間一層一層形成', 'Cross-section of the strata, building up through time') : m === 'date' ? T('地層剖面：點一塊岩石採樣定年', 'Cross-section: tap a rock to sample and date it') : T('地層剖面：每個事件標上字母', 'Cross-section with a letter on every event'));
    gr.setAttribute('aria-label', m === 'story' ? T('地質年代表與事件', 'Geologic time scale with the events') : T('放射性衰變曲線或等時線', 'Radioactive decay curves or isochron'));
    if (m === 'order') buildPick();
    imgKey = '';
    if (cvSize && !(view3 && view3.active)) resizeCv();
  }
  function scenHint() {
    $('scenHint').textContent = state.scen === 'A'
      ? T('參考大峽谷的層序：古老的片麻岩與花崗岩、傾斜的前寒武紀地層、古生代的海、中生代的陸地與海，最上面是現代河流的礫石。', 'Inspired by the Grand Canyon: ancient gneiss and granite, tilted Precambrian layers, Paleozoic seas, Mesozoic land and sea, and modern river gravel on top.')
      : T('較短的故事：三層古生代地層被岩脈切穿、被斷層錯開，再被侵蝕、被熔岩與砂岩蓋住。', 'A shorter story: three Paleozoic layers are cut by a dike, offset by a fault, eroded and then buried by lava and sandstone.');
  }
  function setScen(id) {
    state.scen = id; S = G.scenario(id); setSeg('scenSeg', 'data-scen', id);
    state.sel = null; state.selPt = null; state.last = null; state.seq = []; state.checked = false;
    stopPlay();
    registerT(); setT(Math.min(tNow, tmax())); tNow = readT(); lastN = G.countAt(S, tNow);
    UCOL = {}; imgKey = ''; buildLetters(); buildEvents(); buildLegend(); scenHint(); buildPick();
    setHTML('rRes', '—');
    if (view3) view3.rebuild();
  }
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.mode = b.getAttribute('data-mode'); applyMode(); refreshAll();
      setStatus(state.mode === 'story' ? T('地層的故事：拖時間或按播放。', 'The story: drag the time or press Play.')
        : state.mode === 'date' ? T('定年實驗室：點一塊岩石採樣。', 'Dating lab: tap a rock to take a sample.')
          : T('排出先後：從最老的事件開始點。', 'Put in order: start with the oldest event.'));
      if (view3) view3.rebuild();
      emitStory(true);
    });
  });
  document.querySelectorAll('#scenSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); setScen(b.getAttribute('data-scen')); refreshAll(); emitStory(true); setStatus(T('換成', 'Switched to ') + b.textContent + T('。', '.')); });
  });
  document.querySelectorAll('#sysSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.sys = b.getAttribute('data-sys'); setSeg('sysSeg', 'data-sys', state.sys); sysHint(); updateReadouts(); requestDraw(); });
  });
  $('measureBtn').addEventListener('click', measureNow);
  $('pick').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-it]'); if (!b) return;
    addItem(+b.getAttribute('data-it'));
  });
  $('undoBtn').addEventListener('click', function () { acted(); state.seq.pop(); state.checked = false; buildPick(); setHTML('rRes', '—'); requestDraw(); setStatus(T('退回一步。', 'Undone.')); });
  $('checkBtn').addEventListener('click', function () { acted(); if (!state.seq.length) { setStatus(T('先點幾個字母再檢查。', 'Place some letters first.')); return; } check(); });
  // 點剖面
  function selectAt(px, py) {
    if (!box || px < box.l || px > box.r || py < box.t || py > box.b) return;
    if (state.mode === 'date') {
      const u = unitAtPx(px, py);
      if (u === G.AIR) { setStatus(T('那裡是空氣，點岩石。', 'That is air; tap a rock.')); return; }
      acted(); state.sel = u; state.selPt = { x: invX(px), z: invZ(py) }; state.last = null;
      const se = unitEv(u);
      setStatus(T('採到樣本：', 'Sampled: ') + unitName(u) + (se.fossil ? T('。化石可以告訴你大概的時代。', '. The fossils give a rough age.') : T('。', '.')));
      updateReadouts(); requestDraw();
      emit('sample', { scen: state.scen, unit: u, rock: G.unitRock(S, u), kind: kindOf(u) });
    } else if (state.mode === 'order') {
      // 先找最近的字母
      let best = null, bd = 18;
      Object.keys(orderPos || {}).forEach(function (k) { const p = orderPos[k], d = Math.hypot(X(p.x) - px, Z(p.z) - py); if (d < bd) { bd = d; best = +k; } });
      if (best == null) {
        const n = S.events.length;
        faultTrace(n).forEach(function (f) { const d = segDist(px, py, X(f.x0), Z(f.z0), X(f.x1), Z(f.z1)); if (d < 8 && d < bd) { bd = d; best = f.i; } });
        unconfTraces(n, 0).forEach(function (u) { u.segs.forEach(function (sg) { for (let k = 1; k < sg.length; k++) { const d = segDist(px, py, X(sg[k - 1][0]), Z(sg[k - 1][1]), X(sg[k][0]), Z(sg[k][1])); if (d < 8 && d < bd) { bd = d; best = u.i; } } }); });
      }
      if (best == null) { const u = unitAtPx(px, py); if (u !== G.AIR && G.orderItems(S).indexOf(u) >= 0) best = u; }
      if (best != null) addItem(best);
    }
  }
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy, u = L2 ? clamp(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1) : 0;
    return Math.hypot(px - x0 - u * dx, py - y0 - u * dy);
  }
  cv.addEventListener('click', function (ev) {
    const r = cv.getBoundingClientRect();
    selectAt(ev.clientX - r.left, ev.clientY - r.top);
  });
  // 播放
  let lastTs = 0;
  function setPlayLabel() { $('playBtn').textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play'); $('playBtn').setAttribute('aria-pressed', String(state.playing)); }
  function stopPlay() { if (state.playing) { state.playing = false; setPlayLabel(); setT(tNow); imgKey = ''; requestDraw(); emitStory(true); } }
  $('playBtn').addEventListener('click', function () {
    acted();
    if (state.playing) { stopPlay(); return; }
    if (tNow <= 1e-9) { setT(tmax()); tNow = tmax(); lastN = 0; }
    if (reducedMotion) { setT(0); refreshAll(); emitStory(true); setStatus(T('已跳到現在（減少動態效果）。', 'Jumped to today (reduced motion).')); return; }
    state.playing = true; setPlayLabel(); lastTs = 0; requestDraw();
  });
  function stepPlay(ts) {
    if (!state.playing) return;
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts;
    const p = Math.min(1000, tToPos(tNow) + dt * 1000 / PLAY_SECONDS);
    const t = p >= 1000 ? 0 : posToT(p);
    elT.value = String(Math.round(p)); if (window.LabNum) window.LabNum.clear(elT);
    tNow = t; storyCues(); refreshOutputs(); updateReadouts();
    if (p >= 1000) { state.playing = false; setPlayLabel(); setT(0); tNow = 0; imgKey = ''; emitStory(true); setStatus(T('回到現在：這面岩壁記錄了 ' + num(tmax() / 100, 1) + ' 億年的歷史。', 'Back to today: this cliff records ' + num(tmax() / 1000, 2) + ' billion years of history.')); }
    else emitStory();
  }
  $('clearBtn').addEventListener('click', function () {
    acted(); stopPlay();
    recs[state.scen] = {}; state.sel = null; state.selPt = null; state.last = null; state.seq = []; state.checked = false;
    setT(tmax()); tNow = tmax(); lastN = 0; buildPick(); setHTML('rRes', '—');
    refreshAll();
    setStatus(T('量測紀錄與排好的順序都清掉了，時間回到開頭；剖面不變。', 'Measurements and your sequence are cleared and time is back at the start; the section stays.'));
    emitStory(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 鍵盤 ----------
  function unitsSorted() { return Array.from(G.visibleUnits(S, null, 80, 40).keys()).sort(function (a, b) { return a - b; }); }
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('地層剖面。故事模式：左右方向鍵移動時間（Shift 走大步）。定年模式：左右鍵換岩層，上下鍵換定年法。', 'Cross-section. Story: left/right moves the time (Shift for bigger steps). Dating: left/right picks a layer, up/down picks a method.'),
      items: [{
        name: function () { return state.mode === 'story' ? T('時間', 'Time') : state.mode === 'date' ? T('樣本', 'Sample') : T('排序', 'Order'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          if (state.mode === 'story') {
            if (!dx) return false;
            acted(); stopPlay();
            setT(posToT(clamp(tToPos(tNow) + dx * (big ? 50 : 5), 0, 1000))); refreshAll(); emitStory(true); return true;
          }
          if (state.mode === 'date') {
            acted();
            if (dx) {
              const us = unitsSorted(); let k = us.indexOf(state.sel); k = k < 0 ? (dx > 0 ? 0 : us.length - 1) : (k + dx + us.length) % us.length;
              state.sel = us[k]; const b = layout().best[state.sel]; state.selPt = b ? { x: b.x, z: b.z } : null; state.last = null;
            }
            if (dy) { let k = SYS.indexOf(state.sys); k = (k - dy + SYS.length) % SYS.length; state.sys = SYS[k]; setSeg('sysSeg', 'data-sys', state.sys); sysHint(); }
            updateReadouts(); requestDraw(); return true;
          }
          return false;
        },
        describe: function () {
          return state.mode === 'story' ? fmtT(tNow) + '，' + $('rNow').textContent
            : state.mode === 'date' ? (state.sel == null ? T('還沒有採樣', 'No sample yet') : unitName(state.sel)) + '，' + $('sysSeg').querySelector('[aria-pressed="true"]').textContent
              : T('已排 ', 'Placed ') + state.seq.length;
        }
      }]
    });
  }

  // ---------- 分享 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { m: state.mode, s: state.scen, y: state.sys }; },
    set: function (o) {
      if (!o) return;
      if (o.s === 'A' || o.s === 'B') setScen(o.s);
      if (o.m === 'story' || o.m === 'date' || o.m === 'order') state.mode = o.m;
      if (SYS.indexOf(o.y) >= 0) { state.sys = o.y; setSeg('sysSeg', 'data-sys', o.y); sysHint(); }
      applyMode(); refreshAll(); if (view3) view3.rebuild();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(ts) {
    raf = 0;
    stepPlay(ts);
    if (view3 && view3.active) view3.frame(ts); else drawMain();
    drawChart();
    if (state.playing || (view3 && view3.active && view3.busy())) requestDraw();
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 geologic-time-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    G: G, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion,
    S: function () { return S; }, t: function () { return tView(); }, fmtT: fmtT, unitName: unitName, perName: perName,
    /** 3D 方塊用的貼圖：和 2D 一樣的剖面點陣圖（空氣透明），縮放成 w × h */
    paint: function (kind, w, h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      if (!box) resizeCv();
      c.getContext('2d').drawImage(sectionImage(tView(), state.playing), 0, 0, w, h);
      return c;
    },
    request: function () { requestDraw(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.GeoTime3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.GeoTime3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/geologic-time-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.GeoTime3D) throw new Error('geologic-time-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewNotes() {
    const is3 = !!(view3 && view3.active);
    $('camBar').hidden = !is3;
    stage.classList.toggle('is3d', is3);
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D…', 'Loading 3D…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.GeoTime3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
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
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewNotes();
      resizeCv();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Tilt', 'Front', 'Top'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  updateSoundButton();
  setPlayLabel();
  buildLetters();
  buildEvents();
  scenHint();
  sysHint();
  setT(0); tNow = 0; lastN = G.countAt(S, 0);
  function themeChanged() {
    readColors(); imgKey = ''; labelCache = {};
    buildEvents(); scenHint(); sysHint(); applyMode(); setPlayLabel();
    updateSoundButton(); refreshOutputs(); updateReadouts();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || gr.clientWidth !== gw) { lw = cv.clientWidth; gw = gr.clientWidth; if (lw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  applyMode();
  resizeCv();
  refreshOutputs();
  updateReadouts();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) requestDraw(); });
  setStatus(T('這面岩壁記錄了 17 億年。按「播放」從最古老的片麻岩開始看。', 'This cliff records 1.7 billion years. Press “Play” to start from the oldest gneiss.'));
  requestDraw();
  // 測試用（Playwright）
  window.__gt = { state: state, G: G, S: function () { return S; }, setView: setView, storySnap: storySnap, recs: recs,
    mode: function (m) { acted(); state.mode = m; applyMode(); refreshAll(); if (view3) view3.rebuild(); },
    scen: function (s) { acted(); setScen(s); refreshAll(); },
    time: function (t) { acted(); setT(t); refreshAll(); emitStory(true); },
    pick: function (u, sys) { acted(); state.sel = u; const b = layout().best[u]; state.selPt = b ? { x: b.x, z: b.z } : null; if (sys) { state.sys = sys; setSeg('sysSeg', 'data-sys', sys); } state.last = null; updateReadouts(); requestDraw(); },
    measure: measureNow, add: addItem, items: function () { return G.orderItems(S); }, letters: function () { return letters; } };
})();
