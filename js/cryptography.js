/* cryptography.js — 「加密：從凱撒密碼到公鑰」的畫面與互動（計算在 cryptography-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 學生輸入的文字只在這個分頁裡處理：一律用 textContent 顯示，不用 innerHTML 放使用者文字、不 eval、不連網。
 * 密碼盤轉動、箱子上鎖開鎖只是把「已經算好的結果」用動畫呈現，不改任何數值。
 * 任務事件只在使用者操作之後送出（見 js/missions/cryptography.js 開頭的說明）。 */
(function () {
  'use strict';
  const K = window.CryptoCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha, shade = D.shade, mix = D.mix, mod = K.mod;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = function () { return !!(mq && mq.matches); };
  const TAU = Math.PI * 2, STEP = TAU / 26;
  const MINUS = '−';
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function fnt(px, weight, family) { return (weight ? weight + ' ' : '') + px + 'px ' + (family || FONT); }
  function ease(u) { u = clamp(u, 0, 1); return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function signed(x) { return x < 0 ? MINUS + (-x) : String(x); }
  function wrapAngle(a) { while (a <= -Math.PI) a += TAU; while (a > Math.PI) a -= TAU; return a; }

  // ---------- 元件 ----------
  const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
  const elIn = $('inText'), elOut = $('outText');
  const elK = $('k'), elG = $('g'), elOverlay = $('overlay'), elChiAll = $('chiAll');
  const elKey = $('key'), elL = $('L'), elCol = $('col'), elCs = $('cs');
  const elP = $('p'), elQ = $('q'), elE = $('e'), elM = $('M');
  const tabBtns = Array.prototype.slice.call(document.querySelectorAll('.tabs [role="tab"]'));

  // ---------- 狀態 ----------
  const state = {
    tab: 'caesar',
    text: K.DEFAULT_TEXT, textSrc: 'default', sampleIdx: 0,
    prov: null,                 // 凱撒「把輸出放回輸入」累積：{ plain, shift, user }（輸入 = plain 位移 shift）
    caesar: { k: 1, dir: 'enc', back: null, rot: -STEP, drag: null },
    freq: { g: 0, overlay: true, chiAll: false },
    vig: { key: 'KEY', keySrc: 'default', dir: 'enc', L: 1, col: 1, guess: [0], guessAuto: false, keyAuto: false },   // guessAuto：猜的金鑰是「自動找金鑰」填的
    myst: null, mystPrev: { caesar: -1, vig: -1 }, cracks: [],
    rsa: { p: 43, q: 59, e: 5, M: 2026, key: null, C: null, R: null, lastM: null, stat: null, view: 'none', anim: null, eve: null, log: [] },
    lastC: null,                // 凱撒分頁最近一次的輸入與輸出（按「把輸出放回輸入」或自己貼上輸出時用）
    hover: null, flash: 0
  };
  let qrand = K.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const cache = { cnt: K.counts(''), out: '', best: 0, chis: [], cipherL: '', prof: [] };

  // ---------- 色彩 ----------
  let C = {};
  const TOK = ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'bg', 'cr-plain', 'cr-cipher', 'cr-key', 'cr-ref', 'cr-pub',
    'cr-priv', 'cr-eve', 'cr-ok', 'cr-warn', 'cr-disc', 'cr-disc2', 'cr-wood', 'cr-c1', 'cr-c2', 'cr-c3', 'cr-c4', 'cr-c5', 'cr-c6'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    TOK.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function colColor(j) { return C['cr-c' + (1 + mod(j, 6))]; }

  // =====================================================================
  // 計算（每次改變都重算；文字最多 1500 個字元，很快）
  // =====================================================================
  function curOutput() {
    const t = state.text;
    if (state.tab === 'caesar') return K.caesarApply(t, state.caesar.k, state.caesar.dir);
    if (state.tab === 'freq') return K.caesar(t, -state.freq.g);
    if (state.tab === 'vig') return K.vigenere(t, state.vig.key, state.vig.dir);
    return '';
  }
  function recompute() {
    cache.cnt = K.counts(state.text);
    cache.out = curOutput();
    cache.best = K.bestShift(cache.cnt);
    cache.chis = cache.cnt.n ? K.chiAll(cache.cnt) : [];
    if (state.tab === 'vig') {
      cache.cipherL = K.lettersOnly(state.vig.dir === 'dec' ? state.text : cache.out);
      cache.prof = K.iocProfile(cache.cipherL, K.MAX_L);
    }
    if (state.tab === 'caesar') {
      const cz = state.caesar, s = cz.dir === 'enc' ? cz.k : -cz.k, pv = state.prov;
      state.lastC = {
        input: state.text, out: cache.out, k: cz.k, dir: cz.dir,
        prov: pv ? { plain: pv.plain, shift: pv.shift + s, user: pv.user } : { plain: state.text, shift: s, user: state.textSrc === 'typed' }
      };
    }
  }
  /** 把凱撒最近一次的輸出當成新的輸入：記下它是由哪段文字位移多少得來的 */
  function adoptCaesarOutput() {
    const lc = state.lastC;
    state.prov = { plain: lc.prov.plain, shift: lc.prov.shift, user: lc.prov.user };
    state.caesar.back = { prevIn: lc.input, k: lc.k, dir: lc.dir };
  }

  // =====================================================================
  // 版面
  // =====================================================================
  let dpr = 1, cw = 320, ch = 300, Lay = null;
  function measure(text, font) { ctx.font = font; return ctx.measureText(text).width; }
  function layout() {
    const W = cw, t = state.tab, narrow = W < 560;
    if (t === 'caesar') {
      if (W >= 600) {
        const R = Math.min(178, W * 0.25);
        const cx = 18 + R, cy = 22 + R;
        const rx = cx + R + 34;
        return { wide: true, H: Math.round(2 * R + 44), disc: { cx: cx, cy: cy, R: R }, right: { x: rx, w: W - rx - 14, y: 22 } };
      }
      const R = Math.min(150, (W - 28) / 2);
      const cy = 22 + R;
      const tw = W - 20, cwid = Math.min(28, tw / 13), th = Math.min(26, cwid * 0.92);
      const ty = cy + R + 26;
      return { wide: false, H: Math.round(ty + 22 + 2 * (2 * th + 18) + 18), disc: { cx: W / 2, cy: cy, R: R }, table: { x: 10 + (tw - 13 * cwid) / 2, y: ty, w: 13 * cwid } };
    }
    if (t === 'freq') {
      const top = 36, mainH = narrow ? 180 : 220, x0 = 38;
      const lab = 42;
      const chiTop = top + mainH + lab + 30;
      const chiH = 84;
      const H = state.freq.chiAll ? chiTop + chiH + 26 : top + mainH + lab + 6;
      return { H: H, top: top, mainH: mainH, x0: x0, x1: W - 10, chiTop: chiTop, chiB: chiTop + chiH };
    }
    if (t === 'vig') {
      const lf = fnt(12, 700);
      const labW = Math.ceil(Math.max(measure(T('明文', 'Plain'), lf), measure(T('金鑰', 'Key'), lf), measure(T('密文', 'Cipher'), lf))) + 10;
      const avail = W - 20 - labW;
      const cell = clamp(avail / 24, 19, 27);
      const nCells = Math.max(1, Math.floor(avail / cell));
      const th = cell - 3, rowH = th + 5;
      const rowsY = 28;
      const bT = rowsY + 3 * rowH + 8 + 36, bB = bT + (narrow ? 88 : 100);
      const cT = bB + 22 + 34, cB = cT + (narrow ? 84 : 96);
      return { H: Math.round(cB + 26), labW: labW, cell: cell, nCells: nCells, th: th, rowH: rowH, rowsY: rowsY, bT: bT, bB: bB, cT: cT, cB: cB, x0: 38, x1: W - 10 };
    }
    // rsa
    if (!narrow) {
      const H = 398, bw = Math.min(330, W * 0.46);
      return {
        H: H, narrow: false, s: 1, wireY: 170,
        board: { x: (W - bw) / 2, y: 12, w: bw, h: 66 },
        snd: { x: 70, feet: 236 }, rcv: { x: W - 70, feet: 236 }, eve: { x: W / 2, feet: 330 },
        boxNone: 70 + 66, boxLocked: W / 2, boxOpen: W - 70 - 68, boxEve: { x: W / 2 - 78, yb: 330 },
        formula: { x: 14, y: H - 30 }
      };
    }
    const H = 478, bw = W - 32;
    return {
      H: H, narrow: true, s: 0.82, wireY: 160,
      board: { x: 16, y: 10, w: bw, h: 62 },
      snd: { x: 36, feet: 224 }, rcv: { x: W - 36, feet: 224 }, eve: { x: W / 2, feet: 346 },
      boxNone: 36 + 50, boxLocked: W / 2, boxOpen: W - 36 - 52, boxEve: { x: 64, yb: 346 },
      formula: { x: 10, y: H - 34 }
    };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    Lay = layout();
    ch = Lay.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    requestDraw();
  }

  // =====================================================================
  // 繪圖工具
  // =====================================================================
  /** 字母方塊：淡色底、上亮下暗、頂邊高光；strong 時外框加粗 */
  function tile(c, x, y, w, h, color, text, opts) {
    opts = opts || {};
    const r = Math.min(6, w * 0.24);
    const base = opts.fill || mix(C['canvas-bg'], color, D.dark ? 0.2 : 0.1);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(base, D.dark ? 0.1 : 0.55));
    g.addColorStop(1, shade(base, D.dark ? -0.18 : -0.05));
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.16); c.shadowBlur = 3; c.shadowOffsetY = 1.2;
    D.roundRect(c, x, y, w, h, r); c.fillStyle = g; c.fill();
    c.restore();
    D.roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
    c.strokeStyle = opts.stroke || alpha(color, opts.strong ? 0.95 : (D.dark ? 0.42 : 0.34));
    c.lineWidth = opts.strong ? 1.7 : 1;
    c.stroke();
    c.fillStyle = alpha('#ffffff', D.dark ? 0.07 : 0.6);
    c.fillRect(x + r, y + 1, Math.max(0, w - 2 * r), 1);
    if (text) {
      c.font = opts.font || fnt(Math.round(clamp(h * 0.56, 10, 16)), 700, MONO);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = opts.ink || color;
      c.fillText(text, x + w / 2, y + h / 2 + 1);
    }
  }
  /** 立體長條（圓柱感：左亮右暗、頂端圓角與高光） */
  function bar3d(c, x, y, w, h, color) {
    if (h < 0.5) return;
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(color, D.dark ? 0.2 : 0.3));
    g.addColorStop(0.45, color);
    g.addColorStop(1, shade(color, -0.22));
    const r = Math.min(3, w / 2, h);
    c.beginPath();
    c.moveTo(x, y + h); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h);
    c.closePath();
    c.fillStyle = g; c.fill();
    c.fillStyle = alpha('#ffffff', D.dark ? 0.18 : 0.35);
    c.fillRect(x + 1, y + 0.5, Math.max(0, w - 2), 1);
  }
  function chevron(c, x, y0, y1, color, up) {
    const a = up ? y1 : y0, b = up ? y0 : y1;
    c.save();
    c.strokeStyle = color; c.lineWidth = 1.4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x, a); c.lineTo(x, b); c.stroke();
    const d = up ? 1 : -1;
    c.beginPath(); c.moveTo(x - 3.2, b + 3.6 * d); c.lineTo(x, b); c.lineTo(x + 3.2, b + 3.6 * d); c.stroke();
    c.restore();
  }
  function annulus(c, cx, cy, r0, r1) {
    c.beginPath();
    c.arc(cx, cy, r1, 0, TAU);
    c.moveTo(cx + r0, cy);
    c.arc(cx, cy, r0, 0, TAU, true);
  }
  function sector(c, cx, cy, r0, r1, a0, a1) {
    c.beginPath();
    c.arc(cx, cy, r1, a0, a1);
    c.arc(cx, cy, r0, a1, a0, true);
    c.closePath();
  }
  function radialLetter(c, cx, cy, r, a, chr, color, font) {
    c.save();
    c.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    c.rotate(a + Math.PI / 2);
    c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = color;
    c.fillText(chr, 0, 1);
    c.restore();
  }
  /** 一串文字與上標：segs = [[文字, 上標或 null, 顏色]] */
  function seq(c, segs, x, y, color, font) {
    let px = x;
    segs.forEach(function (s) {
      const col = s[2] || color;
      if (s[1] != null) px += D.supText(c, s[0], String(s[1]), px, y, col, font, 'left');
      else { D.haloText(c, s[0], px, y, col, 'left', 'alphabetic', font); c.font = font; px += c.measureText(s[0]).width; }
    });
    return px - x;
  }
  function dashedLine(c, x0, y0, x1, y1, color, w, dash) {
    c.save(); c.strokeStyle = color; c.lineWidth = w || 1; c.setLineDash(dash || [5, 4]);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore();
  }
  function focusBox(c, x, y, w, h) {
    c.save(); c.strokeStyle = C.accent; c.lineWidth = 2; c.setLineDash([6, 4]);
    D.roundRect(c, x, y, w, h, 8); c.stroke(); c.restore();
  }

  // =====================================================================
  // 繪圖：主程式
  // =====================================================================
  let drawQueued = false, lastT = 0;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
  function frame(t) {
    drawQueued = false;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    const busy = step(t, dt);
    draw(t);
    if (busy) requestDraw(); else lastT = 0;
  }
  function step(t, dt) {
    let busy = false;
    const cz = state.caesar;
    if (!cz.drag) {
      const target = -cz.k * STEP;
      const d = wrapAngle(target - cz.rot);
      if (Math.abs(d) > 0.0015 && !reduced()) { cz.rot += d * Math.min(1, dt * 13); busy = true; }
      else cz.rot = target;
    }
    const a = state.rsa.anim;
    if (a) { if (reduced() || t >= a.t0 + a.dur) state.rsa.anim = null; else busy = true; }
    if (state.flash && t < state.flash + 700 && !reduced()) busy = true;
    return busy;
  }
  function draw(t) {
    if (!Lay) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    if (state.tab === 'caesar') drawCaesar(c);
    else if (state.tab === 'freq') drawFreq(c, t);
    else if (state.tab === 'vig') drawVig(c);
    else drawRsa(c, t);
  }

  // =====================================================================
  // 凱撒：密碼盤、密碼表、字母帶
  // =====================================================================
  function usedLetters() {
    const u = new Array(26).fill(false);
    for (let i = 0; i < 26; i++) u[i] = cache.cnt.c[i] > 0;
    return u;
  }
  function drawCaesar(c) {
    const L = Lay, d = L.disc;
    drawDisc(c, d.cx, d.cy, d.R);
    if (kb && kb.focused()) { c.save(); c.strokeStyle = C.accent; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath(); c.arc(d.cx, d.cy, d.R + 5, 0, TAU); c.stroke(); c.restore(); }
    const used = usedLetters();
    const enc = state.caesar.dir === 'enc';
    const tTitle = enc ? T('加密：上排明文 → 下排密文', 'Encrypt: top row (plain) → bottom row (cipher)') : T('解密：上排密文 → 下排明文', 'Decrypt: top row (cipher) → bottom row (plain)');
    if (L.wide) {
      const x = L.right.x, w = L.right.w;
      let y = L.right.y;
      D.haloText(c, tTitle, x, y + 10, C.muted, 'left', 'alphabetic', fnt(12.5, 600));
      y = drawTable(c, x, y + 20, w, used);
      y += 22;
      D.haloText(c, T('訊息的前幾個字母', 'The first letters of the message'), x, y + 10, C.muted, 'left', 'alphabetic', fnt(12.5, 600));
      y = drawStrip(c, x, y + 20, w);
      D.haloText(c, T('只有 26 種位移：最多試 25 次一定破解。', 'Only 26 shifts: 25 tries always break it.'), x, Math.min(L.H - 12, y + 30), C.muted, 'left', 'alphabetic', fnt(12, 500));
    } else {
      const tb = L.table;
      D.haloText(c, tTitle, cw / 2, tb.y + 4, C.muted, 'center', 'alphabetic', fnt(12, 600));
      drawTable(c, tb.x, tb.y + 14, tb.w, used);
    }
  }
  function drawDisc(c, cx, cy, R) {
    const cz = state.caesar, k = cz.k, rot = cz.rot;
    const rO1 = R, rO0 = R * 0.735, rI1 = R * 0.712, rI0 = R * 0.455, rH = R * 0.4;
    const disc = C['cr-disc'], disc2 = C['cr-disc2'];
    // 底盤與投影
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.6 : 0.26); c.shadowBlur = 22; c.shadowOffsetY = 8;
    c.beginPath(); c.arc(cx, cy, rO1, 0, TAU); c.fillStyle = disc; c.fill();
    c.restore();
    // 外圈（左上亮、右下暗）
    let g = c.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.12, cx, cy, R * 1.04);
    g.addColorStop(0, shade(disc, D.dark ? 0.16 : 0.75));
    g.addColorStop(0.62, disc);
    g.addColorStop(1, shade(disc, D.dark ? -0.32 : -0.16));
    annulus(c, cx, cy, rO0, rO1); c.fillStyle = g; c.fill();
    // 金屬外緣
    const rim = c.createLinearGradient(0, cy - R, 0, cy + R);
    rim.addColorStop(0, shade(disc, D.dark ? 0.35 : 0.85));
    rim.addColorStop(1, shade(disc, D.dark ? -0.5 : -0.35));
    c.strokeStyle = rim; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, rO1 - 1.5, 0, TAU); c.stroke();
    // 外圈格線與字母（明文）
    c.strokeStyle = alpha(C.text, D.dark ? 0.16 : 0.12); c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (i + 0.5) * STEP;
      c.moveTo(cx + Math.cos(a) * rO0, cy + Math.sin(a) * rO0);
      c.lineTo(cx + Math.cos(a) * (rO1 - 3), cy + Math.sin(a) * (rO1 - 3));
    }
    c.stroke();
    const fo = fnt(Math.round(clamp(R * 0.105, 11, 19)), 800);
    for (let i = 0; i < 26; i++) radialLetter(c, cx, cy, (rO0 + rO1) / 2 + 1, -Math.PI / 2 + i * STEP, K.letter(i), C['cr-plain'], fo);
    // 凹槽
    annulus(c, cx, cy, rI1, rO0); c.fillStyle = alpha(D.dark ? '#000000' : C.text, D.dark ? 0.4 : 0.14); c.fill();
    // 內圈（可以轉的那一圈）
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.55 : 0.25); c.shadowBlur = 8; c.shadowOffsetY = 2;
    c.beginPath(); c.arc(cx, cy, rI1, 0, TAU); c.fillStyle = disc2; c.fill();
    c.restore();
    g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.34, R * 0.08, cx, cy, rI1 * 1.05);
    g.addColorStop(0, shade(disc2, D.dark ? 0.18 : 0.7));
    g.addColorStop(0.6, disc2);
    g.addColorStop(1, shade(disc2, D.dark ? -0.3 : -0.14));
    annulus(c, cx, cy, rI0, rI1); c.fillStyle = g; c.fill();
    if (cz.drag || (state.hover && state.hover.zone === 'disc')) {
      c.strokeStyle = alpha(C.accent, cz.drag ? 0.75 : 0.4); c.lineWidth = 2.5;
      c.beginPath(); c.arc(cx, cy, rI1 - 1.2, 0, TAU); c.stroke();
    }
    c.strokeStyle = alpha(C.text, D.dark ? 0.15 : 0.11); c.lineWidth = 1;
    c.beginPath();
    for (let j = 0; j < 26; j++) {
      const a = -Math.PI / 2 + (j + 0.5) * STEP + rot;
      c.moveTo(cx + Math.cos(a) * (rI0 + 2), cy + Math.sin(a) * (rI0 + 2));
      c.lineTo(cx + Math.cos(a) * (rI1 - 2), cy + Math.sin(a) * (rI1 - 2));
    }
    c.stroke();
    const fi = fnt(Math.round(clamp(R * 0.088, 10, 16)), 800);
    for (let j = 0; j < 26; j++) radialLetter(c, cx, cy, (rI0 + rI1) / 2 + 0.5, -Math.PI / 2 + j * STEP + rot, K.letter(j), C['cr-cipher'], fi);
    // 中心軸
    drawHub(c, cx, cy, rH);
    // 指標窗（12 點鐘方向：外圈 A 對著內圈的哪個字母）
    sector(c, cx, cy, rI0 - 1, rO1 + 1, -Math.PI / 2 - STEP / 2, -Math.PI / 2 + STEP / 2);
    c.fillStyle = alpha(C.accent, D.dark ? 0.16 : 0.1); c.fill();
    c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke();
    c.save();
    c.fillStyle = C.accent;
    c.beginPath(); c.moveTo(cx - 7, cy - rO1 - 11); c.lineTo(cx + 7, cy - rO1 - 11); c.lineTo(cx, cy - rO1 - 2); c.closePath(); c.fill();
    c.restore();
  }
  function drawHub(c, cx, cy, r) {
    const cz = state.caesar, k = cz.k, enc = cz.dir === 'enc';
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.55 : 0.25); c.shadowBlur = 10; c.shadowOffsetY = 3;
    const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, shade(C.surface, D.dark ? 0.12 : 0.9));
    g.addColorStop(1, shade(C.surface, D.dark ? -0.2 : -0.08));
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fillStyle = g; c.fill();
    c.restore();
    c.strokeStyle = alpha(C.text, D.dark ? 0.25 : 0.14); c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cy, r - 0.5, 0, TAU); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = fnt(Math.round(clamp(r * 0.19, 9.5, 13)), 600); c.fillStyle = C.muted;
    c.fillText(enc ? T('加密位移 k', 'shift k (encrypt)') : T('解密位移 k', 'shift k (decrypt)'), cx, cy - r * 0.5);
    c.font = fnt(Math.round(r * 0.6), 800); c.fillStyle = C.accent;
    c.fillText(String(k), cx, cy + r * 0.04);
    let sub;
    if (k === 13) sub = 'ROT13';
    else if (k === 0) sub = T('沒有改變', 'no change');
    else sub = enc ? 'A → ' + K.letter(k) : K.letter(k) + ' → A';
    c.font = fnt(Math.round(clamp(r * 0.22, 10, 15)), 700, k === 13 || k === 0 ? FONT : MONO);
    c.fillStyle = k === 13 ? C['cr-ok'] : C.muted;
    c.fillText(sub, cx, cy + r * 0.58);
  }
  function drawTable(c, x, y, w, used) {
    const k = state.caesar.k, enc = state.caesar.dir === 'enc';
    const cwid = Math.min(30, w / 13), tw = cwid - 3, th = Math.min(26, cwid * 0.92);
    const topCol = enc ? C['cr-plain'] : C['cr-cipher'], botCol = enc ? C['cr-cipher'] : C['cr-plain'];
    const f = fnt(Math.round(clamp(th * 0.58, 10, 15)), 700, MONO);
    for (let s = 0; s < 2; s++) {
      const y0 = y + s * (2 * th + 18 + 10);
      for (let j = 0; j < 13; j++) {
        const i = s * 13 + j, xx = x + j * cwid;
        tile(c, xx, y0, tw, th, topCol, K.letter(i), { strong: used[i], font: f });
        chevron(c, xx + tw / 2, y0 + th + 3, y0 + th + 15, alpha(C.muted, 0.7), false);
        tile(c, xx, y0 + th + 18, tw, th, botCol, K.letter(enc ? i + k : i - k), { strong: used[i], font: f });
      }
    }
    return y + 2 * (2 * th + 18) + 10;
  }
  function drawStrip(c, x, y, w) {
    const enc = state.caesar.dir === 'enc', k = state.caesar.k;
    const inp = K.lettersOnly(state.text), outp = K.lettersOnly(cache.out);
    const cell = 30, sz = 26;
    const n = Math.min(inp.length, Math.max(1, Math.floor((w - 52) / cell)));
    if (!inp.length) { D.haloText(c, T('輸入框裡還沒有英文字母。', 'There are no English letters in the input yet.'), x, y + 18, C.muted, 'left', 'alphabetic', fnt(13, 500)); return y + 30; }
    const topCol = enc ? C['cr-plain'] : C['cr-cipher'], botCol = enc ? C['cr-cipher'] : C['cr-plain'];
    const f = fnt(15, 700, MONO);
    for (let j = 0; j < n; j++) {
      const xx = x + j * cell;
      tile(c, xx, y, sz, sz, topCol, inp[j], { font: f });
      chevron(c, xx + sz / 2, y + sz + 3, y + sz + 15, alpha(C.muted, 0.7), false);
      tile(c, xx, y + sz + 18, sz, sz, botCol, outp[j], { font: f });
    }
    D.pill(c, (enc ? '+' : MINUS) + k, x + n * cell + 4, y + sz + 18, C.accent, 'left', fnt(12.5, 700));
    if (inp.length > n) D.haloText(c, '…', x + n * cell - 2, y + 2 * sz + 18 - 4, C.muted, 'left', 'alphabetic', fnt(14, 700));
    return y + 2 * sz + 18;
  }

  // =====================================================================
  // 頻率分析
  // =====================================================================
  function drawFreqBars(c, x0, x1, yTop, yBase, cnt, g, overlay, barColor, hoverI) {
    const N = cnt.n, bw = (x1 - x0) / 26;
    let maxP = 0;
    for (let i = 0; i < 26; i++) {
      if (N) maxP = Math.max(maxP, cnt.c[i] / N * 100);
      if (overlay) maxP = Math.max(maxP, K.FREQ_EN[mod(i - g, 26)]);
    }
    const ymax = Math.max(14, Math.ceil(maxP / 2) * 2);
    const ys = function (v) { return yBase - v / ymax * (yBase - yTop); };
    const stepV = ymax > 24 ? 10 : (ymax > 14 ? 4 : 2);
    c.lineWidth = 1;
    for (let v = 0; v <= ymax + 0.01; v += stepV / (stepV === 2 ? 1 : 2)) {
      const yy = Math.round(ys(v)) + 0.5;
      c.strokeStyle = alpha(C.text, v === 0 ? 0.28 : 0.07);
      c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke();
      if (Math.abs(v / stepV - Math.round(v / stepV)) < 1e-6 && v > 0) D.haloText(c, v + '%', x0 - 4, yy + 4, C.muted, 'right', 'alphabetic', fnt(10.5, 500));
    }
    if (hoverI != null && hoverI >= 0) {
      D.roundRect(c, x0 + hoverI * bw + 1, yTop - 4, bw - 2, yBase - yTop + 40, 4);
      c.fillStyle = alpha(C.accent, D.dark ? 0.12 : 0.07); c.fill();
    }
    if (overlay) {
      for (let i = 0; i < 26; i++) {
        const p = K.FREQ_EN[mod(i - g, 26)], xc = x0 + (i + 0.5) * bw, yy = ys(p);
        D.roundRect(c, xc - bw * 0.42, yy, bw * 0.84, yBase - yy, Math.min(3, bw * 0.2));
        c.fillStyle = alpha(C['cr-ref'], D.dark ? 0.2 : 0.14); c.fill();
        c.strokeStyle = alpha(C['cr-ref'], 0.75); c.lineWidth = 1; c.stroke();
      }
    }
    if (N) {
      for (let i = 0; i < 26; i++) {
        if (!cnt.c[i]) continue;
        const p = cnt.c[i] / N * 100, xc = x0 + (i + 0.5) * bw, yy = ys(p);
        bar3d(c, xc - bw * 0.26, yy, bw * 0.52, yBase - yy, barColor);
      }
    }
    if (overlay) {
      const iE = mod(4 + g, 26), xc = x0 + (iE + 0.5) * bw;
      D.haloText(c, 'E', xc, ys(K.FREQ_EN[4]) - 5, C['cr-ref'], 'center', 'alphabetic', fnt(11.5, 800));
    }
    return { bw: bw, ys: ys };
  }
  function drawFreq(c, t) {
    const L = Lay, cnt = cache.cnt, N = cnt.n, g = state.freq.g, best = cache.best;
    const x0 = L.x0, x1 = L.x1, yTop = L.top, yBase = L.top + L.mainH;
    D.haloText(c, T('每個字母占全部字母的比例（%）', 'Share of each letter (%)'), x0, 18, C.muted, 'left', 'alphabetic', fnt(12.5, 600));
    if (N) {
      const chi = K.chiSquared(cnt, g), isBest = g === best;
      const txt = 'χ²(g = ' + g + ') = ' + chi.toFixed(1) + (isBest ? T('　最小', '  smallest') : '');
      const fl = state.flash && t < state.flash + 700 && !reduced() ? 1 - (t - state.flash) / 700 : 0;
      const box = D.pill(c, txt, x1, 26, isBest ? C['cr-ok'] : C.muted, 'right', fnt(12.5, 700));
      if (fl > 0) { D.roundRect(c, box.x - 3, box.y - 3, box.w + 6, box.h + 6, (box.h + 6) / 2); c.strokeStyle = alpha(C['cr-ok'], 0.7 * fl); c.lineWidth = 2; c.stroke(); }
    }
    const hi = state.hover && state.hover.zone === 'freq' ? state.hover.i : -1;
    const r = drawFreqBars(c, x0, x1, yTop, yBase, cnt, g, state.freq.overlay, C['cr-cipher'], hi);
    const fs = Math.round(clamp(r.bw * 0.62, 9.5, 14));
    for (let i = 0; i < 26; i++) {
      const xc = x0 + (i + 0.5) * r.bw;
      D.haloText(c, K.letter(i), xc, yBase + 16, C['cr-cipher'], 'center', 'alphabetic', fnt(fs, 800, MONO));
      D.haloText(c, K.letter(i - g), xc, yBase + 33, C['cr-plain'], 'center', 'alphabetic', fnt(fs - 1, 600, MONO));
    }
    D.haloText(c, T('輸入', 'in'), x0 - 4, yBase + 16, C['cr-cipher'], 'right', 'alphabetic', fnt(10, 600));
    D.haloText(c, T('解密', 'out'), x0 - 4, yBase + 33, C['cr-plain'], 'right', 'alphabetic', fnt(10, 600));
    if (!N) D.haloText(c, T('輸入框裡還沒有英文字母。', 'There are no English letters in the input yet.'), (x0 + x1) / 2, (yTop + yBase) / 2, C.muted, 'center', 'middle', fnt(14, 500));
    if (kb && kb.focused()) focusBox(c, x0 - 34, yTop - 8, x1 - x0 + 40, yBase - yTop + 46);
    if (state.freq.chiAll && N) drawChiAll(c, x0, L.chiTop, x1, L.chiB);
  }
  function drawChiAll(c, x0, yT, x1, yB) {
    const chis = cache.chis, g = state.freq.g, best = cache.best;
    D.haloText(c, T('所有位移的 χ²（越低越吻合；縱軸是對數刻度）', 'χ² for every shift (lower = better; log scale)'), x0, yT - 10, C.muted, 'left', 'alphabetic', fnt(12, 600));
    let lo = Infinity, hi = 0;
    chis.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    const lg = function (v) { return Math.log(Math.max(v, 1e-9)) / Math.LN10; };
    const span = Math.max(0.5, lg(hi) - lg(lo) + 0.2);
    const ys = function (v) { return yB - (lg(v) - lg(lo) + 0.2) / span * (yB - yT); };
    const bw = (x1 - x0) / 26;
    c.strokeStyle = alpha(C.text, 0.25); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, yB + 0.5); c.lineTo(x1, yB + 0.5); c.stroke();
    const hiI = state.hover && state.hover.zone === 'chi' ? state.hover.i : -1;
    for (let k = 0; k < 26; k++) {
      const xc = x0 + (k + 0.5) * bw, yy = ys(chis[k]);
      if (k === hiI) { D.roundRect(c, xc - bw / 2 + 1, yT - 4, bw - 2, yB - yT + 20, 4); c.fillStyle = alpha(C.accent, 0.08); c.fill(); }
      bar3d(c, xc - bw * 0.3, yy, bw * 0.6, yB - yy, k === best ? C['cr-ok'] : mix(C['cr-ref'], C['canvas-bg'], 0.25));
      if (k === g) {
        D.roundRect(c, xc - bw * 0.38, yy - 3, bw * 0.76, yB - yy + 3, 3);
        c.strokeStyle = C.accent; c.lineWidth = 1.8; c.stroke();
      }
      if (k % 5 === 0 || k === g) D.haloText(c, String(k), xc, yB + 14, k === g ? C.accent : C.muted, 'center', 'alphabetic', fnt(k === g ? 11.5 : 10.5, k === g ? 800 : 500));
    }
  }

  // =====================================================================
  // 維吉尼亞
  // =====================================================================
  function drawVig(c) {
    const L = Lay, W = cw, enc = state.vig.dir === 'enc';
    const input = K.lettersOnly(state.text), output = K.lettersOnly(cache.out);
    const P = enc ? input : output, X = enc ? output : input;
    const ks = K.keyShifts(state.vig.key), kl = ks.length, Lg = state.vig.L, col = state.vig.col;
    // (A) 字母帶
    D.haloText(c, T('金鑰一再重複；同一種顏色 = 同一個位移', 'The key repeats: same colour = same shift'), 10, 16, C.muted, 'left', 'alphabetic', fnt(12.5, 600));
    const lx = 10, x0 = 10 + L.labW, cell = L.cell, th = L.th;
    const n = Math.min(P.length, L.nCells);
    const rows = [[T('明文', 'Plain'), C['cr-plain']], [T('金鑰', 'Key'), C['cr-key']], [T('密文', 'Cipher'), C['cr-cipher']]];
    rows.forEach(function (r, i) { D.haloText(c, r[0], lx, L.rowsY + i * L.rowH + th / 2 + 4, r[1], 'left', 'alphabetic', fnt(12, 700)); });
    const f = fnt(Math.round(clamp(th * 0.6, 10, 15)), 700, MONO);
    if (!P.length) D.haloText(c, T('輸入框裡還沒有英文字母。', 'There are no English letters in the input yet.'), x0, L.rowsY + L.rowH + th / 2 + 4, C.muted, 'left', 'alphabetic', fnt(13, 500));
    for (let j = 0; j < n; j++) {
      const xx = x0 + j * cell;
      tile(c, xx, L.rowsY, cell - 3, th, C['cr-plain'], P[j], { font: f });
      if (kl) { const cc = colColor(j % kl); tile(c, xx, L.rowsY + L.rowH, cell - 3, th, cc, K.letter(ks[j % kl]), { font: f, ink: cc, fill: mix(C['canvas-bg'], cc, D.dark ? 0.26 : 0.16) }); }
      const inCol = j % Lg === col - 1;
      tile(c, xx, L.rowsY + 2 * L.rowH, cell - 3, th, C['cr-cipher'], X[j], { font: f, strong: inCol, stroke: inCol ? colColor(col - 1) : null });
      c.fillStyle = colColor(j % Lg);
      c.beginPath(); c.arc(xx + (cell - 3) / 2, L.rowsY + 2 * L.rowH + th + 5, inCol ? 2.6 : 1.6, 0, TAU); c.fill();
    }
    if (!kl && P.length) D.haloText(c, T('（沒有金鑰：輸出和輸入一樣）', '(no key: the output equals the input)'), x0, L.rowsY + L.rowH + th / 2 + 4, C.muted, 'left', 'alphabetic', fnt(12.5, 500));
    if (P.length > n) D.haloText(c, '…', x0 + n * cell - 1, L.rowsY + 2 * L.rowH + th - 3, C.muted, 'left', 'alphabetic', fnt(14, 700));
    // (B) 重合指數對金鑰長度
    const bx0 = L.x0, bx1 = L.x1;
    D.haloText(c, T('猜金鑰長度 L：每一欄的平均重合指數', 'Key length L: average index of coincidence'), 10, L.bT - 14, C.muted, 'left', 'alphabetic', fnt(12.5, 600));
    const ymin = 0.03, ymax = 0.08;
    const ysB = function (v) { return L.bB - (clamp(v, ymin, ymax) - ymin) / (ymax - ymin) * (L.bB - L.bT); };
    const prof = cache.prof, bwB = (bx1 - bx0) / K.MAX_L;
    c.strokeStyle = alpha(C.text, 0.28); c.lineWidth = 1;
    c.beginPath(); c.moveTo(bx0, L.bB + 0.5); c.lineTo(bx1, L.bB + 0.5); c.stroke();
    [0.04, 0.05, 0.06, 0.07].forEach(function (v) { D.haloText(c, v.toFixed(2), bx0 - 4, ysB(v) + 4, C.muted, 'right', 'alphabetic', fnt(10, 500)); });
    const hiB = state.hover && state.hover.zone === 'ic' ? state.hover.i : -1;
    for (let i = 0; i < K.MAX_L; i++) {
      const v = prof[i], xc = bx0 + (i + 0.5) * bwB;
      if (i === hiB) { D.roundRect(c, xc - bwB / 2 + 1, L.bT - 6, bwB - 2, L.bB - L.bT + 22, 4); c.fillStyle = alpha(C.accent, 0.08); c.fill(); }
      if (isFinite(v)) {
        const u = clamp((v - K.IC_RANDOM) / (K.IC_EN - K.IC_RANDOM), 0, 1);
        const yy = ysB(v);
        bar3d(c, xc - bwB * 0.3, yy, bwB * 0.6, L.bB - yy, mix(mix(C['cr-ref'], C['canvas-bg'], 0.2), C['cr-ok'], u));
        if (i + 1 === Lg) {
          D.roundRect(c, xc - bwB * 0.38, yy - 3, bwB * 0.76, L.bB - yy + 3, 3); c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke();
          D.haloText(c, v.toFixed(3), xc, yy - 7, C.accent, 'center', 'alphabetic', fnt(11, 700));
        }
      }
      D.haloText(c, String(i + 1), xc, L.bB + 14, i + 1 === Lg ? C.accent : C.muted, 'center', 'alphabetic', fnt(i + 1 === Lg ? 12 : 10.5, i + 1 === Lg ? 800 : 500));
    }
    [[K.IC_EN, T('英文 0.066', 'English 0.066')], [K.IC_RANDOM, T('隨機 0.038', 'random 0.038')]].forEach(function (r) {
      const yy = Math.round(ysB(r[0])) + 0.5;
      dashedLine(c, bx0, yy, bx1, yy, alpha(r[0] > 0.05 ? C['cr-ok'] : C['cr-ref'], 0.85), 1.2, [6, 4]);
      D.pill(c, r[1], bx1, yy - 2, r[0] > 0.05 ? C['cr-ok'] : C['cr-ref'], 'right', fnt(11, 700));
    });
    // (C) 第 c 欄的字母頻率
    const colStr = K.columns(cache.cipherL, Lg)[col - 1] || '';
    const cc = K.counts(colStr), cs = state.vig.guess[col - 1] || 0;
    D.haloText(c, T('第 ' + col + ' 欄（' + cc.n + ' 個字母）', 'Column ' + col + ' (' + cc.n + ' letters)'), 10, L.cT - 14, colColor(col - 1), 'left', 'alphabetic', fnt(12.5, 700));
    if (cc.n) {
      const chi = K.chiSquared(cc, cs), best = K.bestShift(cc) === cs;
      D.pill(c, T('位移 ', 'shift ') + cs + T(' → 金鑰字母 ', ' → key letter ') + K.letter(cs) + '　χ² = ' + chi.toFixed(1), L.x1, L.cT - 6, best ? C['cr-ok'] : C.muted, 'right', fnt(11.5, 700));
    }
    const hiC = state.hover && state.hover.zone === 'col' ? state.hover.i : -1;
    const r2 = drawFreqBars(c, L.x0, L.x1, L.cT + 6, L.cB, cc, cs, true, colColor(col - 1), hiC);
    const fs = Math.round(clamp(r2.bw * 0.6, 9, 13));
    for (let i = 0; i < 26; i++) D.haloText(c, K.letter(i), L.x0 + (i + 0.5) * r2.bw, L.cB + 15, C['cr-cipher'], 'center', 'alphabetic', fnt(fs, 700, MONO));
    if (kb && kb.focused()) {
      const ix = kb.index();
      if (ix === 0) focusBox(c, L.x0 - 34, L.bT - 10, L.x1 - L.x0 + 40, L.bB - L.bT + 30);
      else focusBox(c, L.x0 - 34, L.cT - 2, L.x1 - L.x0 + 40, L.cB - L.cT + 24);
    }
  }

  // =====================================================================
  // 公鑰（玩具 RSA）
  // =====================================================================
  function person(c, x, feet, s, color, label) {
    const bw = 38 * s, bh = 36 * s, hr = 12.5 * s;
    D.contactShadow(c, x, feet, bw * 0.6, 0);
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.45 : 0.2); c.shadowBlur = 6; c.shadowOffsetY = 2;
    const g = c.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
    g.addColorStop(0, shade(color, D.dark ? 0.2 : 0.3)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.28));
    c.beginPath();
    c.moveTo(x - bw / 2, feet);
    c.lineTo(x - bw / 2, feet - bh + bw / 2);
    c.arc(x, feet - bh + bw / 2, bw / 2, Math.PI, 0);
    c.lineTo(x + bw / 2, feet);
    c.closePath();
    c.fillStyle = g; c.fill();
    c.restore();
    D.ball(c, x, feet - bh - hr + 3 * s, hr, mix(C.surface, color, D.dark ? 0.5 : 0.3));
    D.pill(c, label, x, feet + 21 * s, color, 'center', fnt(12.5, 700));
  }
  function keyIcon(c, x, y, s, color) {
    c.save();
    c.translate(x, y);
    D.block(c, 5 * s, -2.2 * s, 22 * s, 4.4 * s, color, { r: 1.6 });
    c.fillStyle = shade(color, -0.12);
    c.fillRect(19 * s, 2 * s, 3 * s, 4 * s);
    c.fillRect(24 * s, 2 * s, 3 * s, 5.5 * s);
    const g = c.createRadialGradient(-2.5 * s, -2.5 * s, 0.5, 0, 0, 7.5 * s);
    g.addColorStop(0, shade(color, 0.55)); g.addColorStop(1, shade(color, -0.25));
    c.beginPath(); c.arc(0, 0, 7.5 * s, 0, TAU); c.arc(0, 0, 3 * s, 0, TAU, true);
    c.fillStyle = g; c.fill('evenodd');
    c.restore();
  }
  function padlock(c, x, y, s, closedU, color) {
    const bw = 17 * s, bh = 13 * s, lift = (1 - closedU) * 8 * s;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = shade(C.muted, D.dark ? 0.25 : -0.05); c.lineWidth = 3.4 * s;
    c.beginPath();
    c.moveTo(x - 5 * s, y + 1 - lift);
    c.lineTo(x - 5 * s, y - 6 * s - lift);
    c.arc(x, y - 6 * s - lift, 5 * s, Math.PI, 0);
    c.lineTo(x + 5 * s, y + (closedU > 0.95 ? 1 : -3 * s) - lift);
    c.stroke();
    c.strokeStyle = alpha('#ffffff', D.dark ? 0.25 : 0.55); c.lineWidth = 1 * s;
    c.beginPath(); c.arc(x, y - 6 * s - lift, 5 * s, Math.PI * 1.15, Math.PI * 1.6); c.stroke();
    c.restore();
    D.block(c, x - bw / 2, y, bw, bh, color, { r: 2.5 });
    c.fillStyle = alpha('#000000', 0.45);
    c.beginPath(); c.arc(x, y + bh * 0.42, 1.8 * s, 0, TAU); c.fill();
    c.fillRect(x - 0.8 * s, y + bh * 0.42, 1.6 * s, 4 * s);
  }
  function box(c, x, yb, s, openU, shakeU, label, labelColor) {
    const w = 46 * s, h = 30 * s;
    const sx = shakeU > 0 ? Math.sin(shakeU * 38) * 3.5 * (1 - shakeU) : 0;
    x += sx;
    D.contactShadow(c, x, yb, w * 0.55, 0);
    const wood = C['cr-wood'];
    D.block(c, x - w / 2, yb - h, w, h, wood, { r: 4 });
    c.strokeStyle = alpha(shade(wood, -0.4), 0.35); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x - w / 2 + 3, yb - h * 0.35); c.lineTo(x + w / 2 - 3, yb - h * 0.35); c.stroke();
    if (openU > 0.35) {
      c.save();
      D.roundRect(c, x - w * 0.3, yb - h - 8 * s * openU, w * 0.6, 12 * s, 2);
      c.fillStyle = C.surface; c.fill(); c.strokeStyle = alpha(C.text, 0.25); c.stroke();
      c.restore();
    }
    c.save();
    c.translate(x - w / 2 - 2, yb - h);
    c.rotate(-openU * 1.9);
    D.block(c, 0, -8 * s, w + 4, 8 * s, shade(wood, 0.12), { r: 3 });
    c.restore();
    padlock(c, x, yb - h + 3 * s, s, 1 - openU, C['cr-pub']);
    if (label) D.pill(c, label, x + 10 * s * openU, yb - h - (14 + 34 * openU) * s, labelColor || C.text, 'center', fnt(12.5, 700));
  }
  function boardDraw(c, b, r) {
    D.block(c, b.x, b.y, b.w, b.h, C['cr-wood'], { r: 6 });
    c.strokeStyle = alpha(shade(C['cr-wood'], -0.45), 0.25); c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(b.x + 4, b.y + i * b.h / 4); c.lineTo(b.x + b.w - 4, b.y + i * b.h / 4 + (i % 2 ? 1.5 : -1)); c.stroke(); }
    const px = b.x + 9, py = b.y + 7, pw = b.w - 18, ph = b.h - 14;
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.22); c.shadowBlur = 5; c.shadowOffsetY = 2;
    c.fillStyle = shade(C.surface, D.dark ? 0.06 : 0);
    c.fillRect(px, py, pw, ph);
    c.restore();
    D.ball(c, px + 9, py + 6, 3.4, C['cr-warn'], { shadow: false });
    D.ball(c, px + pw - 9, py + 6, 3.4, C['cr-warn'], { shadow: false });
    keyIcon(c, px + 20, py + ph / 2 + 2, 0.9, C['cr-pub']);
    const tx = px + 52;
    D.haloText(c, T('公鑰（公開給所有人）', 'Public key (for everyone)'), tx, py + ph / 2 - 4, C['cr-pub'], 'left', 'alphabetic', fnt(12, 700));
    const k = r.key;
    const line = k && k.ok ? '(n, e) = (' + k.n + ', ' + k.e + ')' : T('還沒有可用的金鑰', 'no usable key yet');
    D.haloText(c, line, tx, py + ph / 2 + 14, k && k.ok ? C.text : C['cr-warn'], 'left', 'alphabetic', fnt(13.5, 800, k && k.ok ? MONO : FONT));
  }
  function magnifier(c, x, y, s, color) {
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = shade(color, -0.2); c.lineWidth = 3.2 * s;
    c.beginPath(); c.moveTo(x + 6 * s, y + 6 * s); c.lineTo(x + 13 * s, y + 13 * s); c.stroke();
    c.fillStyle = alpha(C.surface, 0.55);
    c.beginPath(); c.arc(x, y, 7.5 * s, 0, TAU); c.fill();
    c.strokeStyle = color; c.lineWidth = 2.2 * s; c.stroke();
    c.strokeStyle = alpha('#ffffff', 0.7); c.lineWidth = 1.2 * s;
    c.beginPath(); c.arc(x, y, 4.5 * s, Math.PI * 1.1, Math.PI * 1.55); c.stroke();
    c.restore();
  }
  /** 箱子在某個畫面狀態下的位置與開合 */
  function boxPose(view, L) {
    const wy = L.wireY - 3;
    if (view === 'none') return { x: L.boxNone, yb: wy, open: 1 };
    if (view === 'locked') return { x: L.boxLocked, yb: wy, open: 0 };
    if (view === 'opened' || view === 'pubok') return { x: L.boxOpen, yb: wy, open: 1 };
    if (view === 'pubfail') return { x: L.boxOpen, yb: wy, open: 0 };
    return { x: L.boxEve.x, yb: L.boxEve.yb, open: 1 };   // eve
  }
  function boxLabel(view) {
    const r = state.rsa;
    if (view === 'none') return [T('訊息 M = ', 'message M = ') + r.M, C['cr-plain']];
    if (view === 'locked') return [T('密文 C = ', 'cipher C = ') + r.C, C['cr-cipher']];
    if (view === 'opened') return [T('打開了：', 'opened: ') + r.R + (r.R === r.lastM ? ' ✓' : ''), C['cr-ok']];
    if (view === 'pubok') return [T('公鑰也打開了：', 'the public key opened it: ') + r.R, C['cr-ok']];
    if (view === 'pubfail') return [T('打不開：得到 ', 'will not open: got ') + r.R, C['cr-warn']];
    return [T('竊聽者讀到 ', 'the eavesdropper reads ') + r.R, C['cr-eve']];
  }
  function drawRsa(c, t) {
    const L = Lay, r = state.rsa, k = r.key, s = L.s, W = cw;
    const ok = !!(k && k.ok);
    // 線路
    D.tube(c, function (g) { g.moveTo(L.snd.x + 24 * s, L.wireY); g.lineTo(L.rcv.x - 24 * s, L.wireY); }, mix(C['cr-ref'], C['canvas-bg'], 0.2), 7);
    D.haloText(c, T('網路：任何人都看得到', 'Network: anyone can see it'), W / 2, L.wireY + 22, C.muted, 'center', 'alphabetic', fnt(11.5, 600));
    // 竊聽線
    const ev = L.eve, eveHead = ev.feet - 36 * s - 25 * s;
    dashedLine(c, W / 2, L.wireY + 28, W / 2, eveHead - 8, alpha(C['cr-eve'], 0.6), 1.5, [3, 4]);
    // 公告欄
    boardDraw(c, L.board, r);
    // 人物
    person(c, L.snd.x, L.snd.feet, s, C['cr-plain'], T('寄件人', 'Sender'));
    person(c, L.rcv.x, L.rcv.feet, s, C['cr-priv'], T('收件人', 'Receiver'));
    person(c, ev.x, ev.feet, s, C['cr-eve'], T('竊聽者', 'Eavesdropper'));
    magnifier(c, ev.x + 22 * s, ev.feet - 52 * s, s, C['cr-eve']);
    // 收件人的私鑰
    const pkY = L.rcv.feet + 48 * s;
    if (ok) {
      const pk = D.pill(c, T('私鑰 d = ', 'private d = ') + k.d, W - 10, pkY, C['cr-priv'], 'right', fnt(12.5, 800));
      keyIcon(c, pk.x - 36, pk.y + pk.h / 2, 0.85, C['cr-priv']);
      D.haloText(c, T('p = ' + k.p + '、q = ' + k.q + ' 也要保密', 'p = ' + k.p + ', q = ' + k.q + ' stay secret too'), W - 10, pkY + 17, C.muted, 'right', 'alphabetic', fnt(11.5, 500));
    }
    // 竊聽者的資訊
    const ex = L.narrow ? W / 2 : ev.x + 46, ey = L.narrow ? ev.feet + 52 * s : ev.feet + 2;
    const al = L.narrow ? 'center' : 'left';
    if (r.eve) {
      const e1 = D.pill(c, 'n = ' + r.eve.p + ' × ' + r.eve.q + T('（試除 ' + r.eve.steps + ' 次）', ' (' + r.eve.steps + ' trial divisions)'), ex, ey, C['cr-eve'], al, fnt(12, 700));
      const kx = al === 'center' ? W / 2 - 50 : ex + 18;
      keyIcon(c, kx, e1.y + e1.h + 13, 0.8, C['cr-priv']);
      D.haloText(c, T('算出 d = ', 'works out d = ') + r.eve.d, kx + 28, e1.y + e1.h + 17, C['cr-priv'], 'left', 'alphabetic', fnt(12, 700));
    } else {
      D.pill(c, T('看得到 n、e 和 C', 'sees n, e and C'), ex, ey, C.muted, al, fnt(12, 600));
    }
    // 箱子
    if (ok) {
      const a = r.anim;
      let pose, label, shake = 0;
      if (a) {
        const u = clamp((t - a.t0) / a.dur, 0, 1);
        const p0 = boxPose(a.from, L), p1 = boxPose(a.to, L);
        const mv = ease(clamp((u - 0.18) / 0.6, 0, 1));
        let open;
        if (a.to === 'locked') open = 1 - ease(clamp(u / 0.2, 0, 1));
        else if (a.to === 'pubfail') { open = 0; shake = u > 0.75 ? (u - 0.75) / 0.25 : 0; }
        else open = ease(clamp((u - 0.78) / 0.22, 0, 1));
        if (a.from === 'none' && a.to !== 'locked') open = 0;
        pose = { x: p0.x + (p1.x - p0.x) * mv, yb: p0.yb + (p1.yb - p0.yb) * mv, open: open };
        label = boxLabel(u < 0.5 ? a.from : a.to);
        // 鑰匙飛過去
        if (a.to !== 'locked' && u > 0.45 && u < 0.95) {
          const kc = a.to === 'pubok' || a.to === 'pubfail' ? C['cr-pub'] : C['cr-priv'];
          const v = (u - 0.45) / 0.5;
          keyIcon(c, pose.x - 50 * s + 20 * v * s, pose.yb - 18 * s, 0.8, kc);
        }
      } else {
        pose = boxPose(r.view, L);
        label = boxLabel(r.view);
        if (r.view === 'pubfail') keyIcon(c, pose.x - 46 * s, pose.yb - 18 * s, 0.8, C['cr-pub']);
      }
      box(c, pose.x, pose.yb, s, pose.open, shake, label[0], label[1]);
    } else {
      D.pill(c, keyProblem(), W / 2, L.wireY - 14, C['cr-warn'], 'center', fnt(12.5, 700));
    }
    // 公式
    const f = fnt(L.narrow ? 12.5 : 13.5, 600), fx = L.formula.x, fy = L.formula.y;
    const showNums = ok && r.C != null && !L.narrow;
    seq(c, [[T('加密：', 'Lock: '), null, C.muted], ['C = M', 'e'], [' mod n']].concat(showNums ? [['　→　' + r.lastM, k.e], [' mod ' + k.n + ' = ' + r.C, null, C['cr-cipher']]] : []), fx, fy, C.text, f);
    const showR = ok && r.R != null && r.view === 'opened' && !L.narrow;
    seq(c, [[T('解密：', 'Unlock: '), null, C.muted], ['M = C', 'd'], [' mod n']].concat(showR ? [['　→　' + r.C, k.d], [' mod ' + k.n + ' = ' + r.R, null, C['cr-ok']]] : []), fx, fy + 22, C.text, f);
    if (kb && kb.focused()) {
      if (kb.index() === 0) focusBox(c, L.snd.x - 34 * s, L.wireY - 66 * s, 140 * s, 110 * s);
      else focusBox(c, L.board.x - 6, L.board.y - 4, L.board.w + 12, L.board.h + 8);
    }
  }

  // =====================================================================
  // 音效（預設關；主要頻率都在 250 Hz 以上）
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let lastTick = 0;
  function sndTick() {
    const S = sound(); if (!S) return;
    const now = performance.now();
    if (now - lastTick < 35) return;
    lastTick = now;
    S.tone({ freq: 1500, dur: 0.018, type: 'square', gain: 0.05 });
  }
  function sndAlign() { const S = sound(); if (!S) return; S.tone({ freq: 784, dur: 0.1, type: 'sine', gain: 0.16 }); S.tone({ freq: 1175, dur: 0.16, type: 'sine', gain: 0.14, delay: 0.08 }); }
  function sndCrack(ok) {
    const S = sound(); if (!S) return;
    if (ok) [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { S.tone({ freq: f, dur: 0.16, type: 'sine', gain: 0.2, delay: i * 0.09 }); });
    else S.sweep({ from: 420, to: 260, dur: 0.28, type: 'triangle', gain: 0.14 });
  }
  function sndLock() { const S = sound(); if (!S) return; S.noise({ dur: 0.05, gain: 0.25, filter: 2500 }); S.tone({ freq: 620, dur: 0.08, type: 'square', gain: 0.07, delay: 0.04 }); }
  function sndUnlock() { const S = sound(); if (!S) return; S.noise({ dur: 0.04, gain: 0.2, filter: 3000 }); S.sweep({ from: 520, to: 1040, dur: 0.22, type: 'sine', gain: 0.16, delay: 0.05 }); }
  function sndRattle() { const S = sound(); if (!S) return; for (let i = 0; i < 3; i++) { S.noise({ dur: 0.035, gain: 0.22, filter: 1800, delay: 0.5 + i * 0.09 }); S.tone({ freq: 300, dur: 0.05, type: 'square', gain: 0.06, delay: 0.5 + i * 0.09 }); } }
  function sndEve() { const S = sound(); if (!S) return; S.sweep({ from: 1200, to: 420, dur: 0.35, type: 'sawtooth', gain: 0.07 }); S.tone({ freq: 330, dur: 0.18, type: 'triangle', gain: 0.14, delay: 0.32 }); }
  function sndAuto(n) { const S = sound(); if (!S) return; for (let i = 0; i < Math.min(n, 12); i++) S.tone({ freq: 500 + 60 * i, dur: 0.05, type: 'triangle', gain: 0.1, delay: 0.05 * i }); }
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
  // 事件與畫面更新
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg || ''; }, 20); }
  function emitCaesar(src) {
    emit('caesar', K.caesarEvent({ src: src, input: state.text, k: state.caesar.k, dir: state.caesar.dir, back: state.caesar.back, myst: state.myst ? state.myst.kind : '' }));
  }
  function emitFreq(src) {
    emit('freq', K.freqEvent({ src: src, input: state.text, g: state.freq.g, overlay: state.freq.overlay, chiAll: state.freq.chiAll, myst: state.myst, prov: state.prov }));
  }
  function emitVig(src) {
    emit('vig', K.vigEvent({ src: src, input: state.text, key: state.vig.key, keySrc: state.vig.keySrc, dir: state.vig.dir, L: state.vig.L, myst: state.myst, autoKey: !!(state.myst && state.myst.autoKey) }));
  }
  function emitCurrent(src) {
    if (state.tab === 'caesar') emitCaesar(src);
    else if (state.tab === 'freq') emitFreq(src);
    else if (state.tab === 'vig') emitVig(src);
  }

  let muting = false;
  /** 程式改滑桿：不觸發滑桿自己的處理（避免重複送事件） */
  function setSlider(el, v) {
    muting = true;
    try {
      if (window.LabNum) window.LabNum.set(el, v);
      else { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    } finally { muting = false; }
  }
  function readInt(el) { return Math.round(val(el)); }
  function syncOutputs() {
    $('ko').textContent = String(state.caesar.k);
    $('go').textContent = String(state.freq.g);
    $('Lo').textContent = String(state.vig.L);
    $('colo').textContent = String(state.vig.col);
    $('cso').textContent = String(state.vig.guess[state.vig.col - 1] || 0);
    $('eo').textContent = String(state.rsa.e);
    $('Mo').textContent = String(state.rsa.M);
  }
  function refresh() {
    recompute();
    updateTextUI();
    updatePanel();
    syncOutputs();
    requestDraw();
  }

  function updateTextUI() {
    const t = state.tab;
    const out = cache.out;
    elOut.textContent = out;
    let isCipher = false, label = '';
    if (t === 'caesar') { isCipher = state.caesar.dir === 'enc'; label = isCipher ? T('密文（輸出）', 'Ciphertext (output)') : T('明文（輸出）', 'Plaintext (output)'); }
    else if (t === 'freq') { label = T('用 g = ' + state.freq.g + ' 解密的結果', 'Decrypted with g = ' + state.freq.g); }
    else if (t === 'vig') { isCipher = state.vig.dir === 'enc'; label = isCipher ? T('密文（輸出）', 'Ciphertext (output)') : T('明文（輸出）', 'Plaintext (output)'); }
    elOut.className = 'outbox mono ' + (isCipher ? 'cipher' : 'plain');
    $('outLabel').textContent = label;
    const n = cache.cnt.n, len = state.text.length;
    $('inCount').textContent = T(n + ' 個字母', n + ' letters') + (len > K.MAX_TEXT - 200 ? '・' + len + ' / ' + K.MAX_TEXT : '');
    $('outCount').textContent = '';
    const m = state.myst;
    $('crackBtn').disabled = !m || m.solved;
  }

  function updatePanel() {
    const t = state.tab;
    if (t === 'caesar') {
      const k = state.caesar.k, enc = state.caesar.dir === 'enc';
      $('rMapC').textContent = enc ? 'A → ' + K.letter(k) + ', B → ' + K.letter(k + 1) : K.letter(k) + ' → A, ' + K.letter(k + 1) + ' → B';
    } else if (t === 'freq') {
      const cnt = cache.cnt, N = cnt.n;
      $('rN').textContent = String(N);
      if (N) {
        const chi = K.chiSquared(cnt, state.freq.g);
        $('rChi').textContent = chi.toFixed(1) + (state.freq.g === cache.best ? T('（最小）', ' (smallest)') : '');
        const top = K.topLetter(cnt);
        $('rTop').textContent = K.letter(top) + '（' + (cnt.c[top] / N * 100).toFixed(1) + '%）';
        const ic = K.ioc(cnt);
        $('rIc').textContent = isFinite(ic) ? ic.toFixed(4) : '—';
      } else { $('rChi').textContent = '—'; $('rTop').textContent = '—'; $('rIc').textContent = '—'; }
    } else if (t === 'vig') {
      const ks = K.keyShifts(state.vig.key);
      $('rKeyLen').textContent = ks.length ? T(ks.length + ' 個字母', ks.length + ' letters') : T('沒有金鑰', 'no key');
      const sh = ks.slice(0, 6).join(' · ') + (ks.length > 6 ? ' …' : '');
      $('rShifts').textContent = ks.length ? sh : '—';
      const icv = K.ioc(K.counts(cache.cipherL));
      $('rIcV').textContent = isFinite(icv) ? icv.toFixed(4) : '—';
      const v = cache.prof[state.vig.L - 1];
      $('rIocL').textContent = isFinite(v) ? v.toFixed(4) : '—';
      const colStr = K.columns(cache.cipherL, state.vig.L)[state.vig.col - 1] || '';
      const cc = K.counts(colStr);
      $('rChiCol').textContent = cc.n ? K.chiSquared(cc, state.vig.guess[state.vig.col - 1] || 0).toFixed(1) : '—';
      $('rGuess').textContent = K.keyFromShifts(state.vig.guess);
    } else updateRsaPanel();
    $('dirC').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.dir === state.caesar.dir)); });
    $('dirV').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.dir === state.vig.dir)); });
  }

  // =====================================================================
  // 分頁
  // =====================================================================
  function applyTabVisibility() {
    document.querySelectorAll('#lab [data-tabs]').forEach(function (el) {
      el.hidden = el.getAttribute('data-tabs').split(' ').indexOf(state.tab) < 0;
    });
    tabBtns.forEach(function (b) {
      const on = b.dataset.tab === state.tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }
  function setTab(tab, user) {
    if (tab === state.tab) return;
    state.tab = tab;
    state.hover = null;
    applyTabVisibility();
    setKbItems();
    refresh();
    resize();
    if (tab === 'caesar') say(T('凱撒密碼：每個字母往後移 k 格。', 'Caesar cipher: every letter moves k places along.'));
    else if (tab === 'freq') say(T('頻率分析：調「猜測位移 g」，讓實心長條和灰色外框對齊。', 'Frequency analysis: change “Guessed shift g” until the bars line up with the grey outlines.'));
    else if (tab === 'vig') say(T('維吉尼亞密碼：金鑰的每個字母各是一個位移，輪流使用。', 'Vigenère cipher: each key letter is a shift, used in turn.'));
    else say(T('公鑰：公開的 (n, e) 負責鎖，只有收件人知道的 d 負責開。', 'Public key: the published (n, e) locks, the receiver’s secret d unlocks.'));
    if (user) emitCurrent('tab');
  }
  tabBtns.forEach(function (b, i) {
    b.addEventListener('click', function () { setTab(b.dataset.tab, true); });
    b.addEventListener('keydown', function (e) {
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabBtns.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + tabBtns.length - 1) % tabBtns.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabBtns.length - 1;
      if (j < 0) return;
      e.preventDefault();
      tabBtns[j].focus();
      setTab(tabBtns[j].dataset.tab, true);
    });
  });

  // =====================================================================
  // 文字（輸入框、範例、放回輸入）
  // =====================================================================
  function setText(s, src) {
    state.text = K.clampText(s);
    if (elIn.value !== state.text) elIn.value = state.text;
    state.textSrc = src;
  }
  function cancelMyst(msg) {
    if (!state.myst) return;
    state.myst = null;
    $('mystMsg').className = 'msg';
    $('mystMsg').textContent = msg || '';
  }
  let textTimer = 0;
  function applyTextInput() {
    clearTimeout(textTimer);
    const s = K.clampText(elIn.value);
    if (s === state.text) return;
    const lc = state.lastC;
    if (lc && s === lc.out && lc.out !== lc.input) {   // 自己把凱撒的輸出貼回輸入：和按「把輸出放回輸入」一樣
      adoptCaesarOutput();
      setText(s, 'swap');
      refresh();
      emitCurrent('text');
      return;
    }
    setText(s, 'typed');
    state.prov = null;
    state.caesar.back = null;
    if (state.myst && !state.myst.solved) cancelMyst(T('你改了文字，這一題先取消；想挑戰就再按一次。', 'You edited the text, so this challenge is cancelled; press the button again for a new one.'));
    else if (state.myst) cancelMyst('');
    refresh();
    emitCurrent('text');
  }
  elIn.addEventListener('input', function () { clearTimeout(textTimer); textTimer = setTimeout(applyTextInput, 300); });
  elIn.addEventListener('change', applyTextInput);

  $('sampleBtn').addEventListener('click', function () {
    state.sampleIdx = (state.sampleIdx + 1) % K.SAMPLES.length;
    setText(K.SAMPLES[state.sampleIdx], 'sample');
    state.prov = null; state.caesar.back = null;
    cancelMyst('');
    refresh();
    say(T('換了一段範例（' + cache.cnt.n + ' 個字母）。', 'New sample text (' + cache.cnt.n + ' letters).'));
    emitCurrent('sample');
  });

  $('swapBtn').addEventListener('click', function () {
    const t = state.tab;
    if (t !== 'caesar' && t !== 'vig') return;
    const out = cache.out;
    if (t === 'caesar') adoptCaesarOutput();
    else {
      state.prov = null;
      state.caesar.back = null;
    }
    setText(out, 'swap');
    refresh();
    say(T('輸出搬到輸入了；現在的輸出是對它再做一次同樣的動作。', 'The output is now the input; the new output applies the same step again.'));
    emitCurrent('swap');
  });

  $('wipeBtn').addEventListener('click', function () {
    state.cracks = [];
    renderCracks();
    const r = state.rsa;
    r.log = []; r.C = null; r.R = null; r.lastM = null; r.stat = null; r.view = 'none'; r.anim = null; r.eve = null;
    renderRsaLog();
    state.flash = 0;
    if (state.myst && state.myst.solved) cancelMyst('');
    refresh();
    say(T('已清除破解紀錄、加密紀錄和畫面上的標記；設定和文字沒有改變。', 'Cleared the crack log, the encryption log and the marks on the canvas; settings and text are unchanged.'));
  });

  // =====================================================================
  // 凱撒控制
  // =====================================================================
  function setK(k, src, opt) {
    opt = opt || {};
    k = mod(Math.round(k), 26);
    const changed = k !== state.caesar.k;
    state.caesar.k = k;
    if (changed && state.myst) state.myst.caesarTouched = true;
    if (readInt(elK) !== k) setSlider(elK, k);
    refresh();
    if (changed) sndTick();
    if (!opt.noEmit) emitCaesar(src);
  }
  elK.addEventListener('input', function () { if (muting) return; setK(readInt(elK), 'k'); });
  $('dirC').querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.caesar.dir = b.dataset.dir;
      refresh();
      say(state.caesar.dir === 'enc' ? T('加密：外圈（明文）→ 內圈（密文）。', 'Encrypt: outer ring (plain) → inner ring (cipher).') : T('解密：內圈（密文）→ 外圈（明文）。', 'Decrypt: inner ring (cipher) → outer ring (plain).'));
      emitCaesar('dir');
    });
  });

  // =====================================================================
  // 頻率分析控制
  // =====================================================================
  function setG(g, src) {
    g = mod(Math.round(g), 26);
    const changed = g !== state.freq.g;
    state.freq.g = g;
    if (readInt(elG) !== g) setSlider(elG, g);
    refresh();
    if (changed) {
      if (cache.cnt.n && g === cache.best) { sndAlign(); state.flash = performance.now(); requestDraw(); }
      else sndTick();
    }
    emitFreq(src);
  }
  elG.addEventListener('input', function () { if (muting) return; setG(readInt(elG), 'g'); });
  elOverlay.addEventListener('change', function () { state.freq.overlay = elOverlay.checked; refresh(); emitFreq('overlay'); });
  elChiAll.addEventListener('change', function () {
    state.freq.chiAll = elChiAll.checked;
    if (state.freq.chiAll && state.myst) state.myst.chiShown = true;
    refresh(); resize();
    emitFreq('chiAll');
  });

  // =====================================================================
  // 維吉尼亞控制
  // =====================================================================
  let keyTimer = 0;
  function applyKeyInput() {
    clearTimeout(keyTimer);
    const k = K.keyFromShifts(K.keyShifts(elKey.value));
    if (k === state.vig.key && state.vig.keySrc === 'typed') return;
    state.vig.key = k;
    state.vig.keySrc = 'typed';
    state.vig.keyAuto = false;
    refresh();
    emitVig('key');
  }
  elKey.addEventListener('input', function () { clearTimeout(keyTimer); keyTimer = setTimeout(applyKeyInput, 300); });
  elKey.addEventListener('change', applyKeyInput);
  $('dirV').querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.vig.dir = b.dataset.dir;
      refresh();
      emitVig('dir');
    });
  });
  function setL(Lg, src) {
    Lg = clamp(Math.round(Lg), 1, K.MAX_L);
    const changed = Lg !== state.vig.L;
    state.vig.L = Lg;
    const old = state.vig.guess;
    state.vig.guess = [];
    for (let i = 0; i < Lg; i++) state.vig.guess.push(old[i] || 0);
    elCol.max = String(Lg);
    if (state.vig.col > Lg) state.vig.col = Lg;
    if (readInt(elL) !== Lg) setSlider(elL, Lg);
    setSlider(elCol, state.vig.col);
    setSlider(elCs, state.vig.guess[state.vig.col - 1]);
    refresh();
    if (changed) sndTick();
    emitVig(src);
  }
  elL.addEventListener('input', function () { if (muting) return; setL(readInt(elL), 'L'); });
  function setCol(cn) {
    cn = clamp(Math.round(cn), 1, state.vig.L);
    state.vig.col = cn;
    if (readInt(elCol) !== cn) setSlider(elCol, cn);
    setSlider(elCs, state.vig.guess[cn - 1]);
    refresh();
  }
  elCol.addEventListener('input', function () { if (muting) return; setCol(readInt(elCol)); });
  function setCs(v) {
    v = mod(Math.round(v), 26);
    const i = state.vig.col - 1, changed = state.vig.guess[i] !== v;
    state.vig.guess[i] = v;
    if (readInt(elCs) !== v) setSlider(elCs, v);
    refresh();
    if (changed) {
      const colStr = K.columns(cache.cipherL, state.vig.L)[i] || '';
      const cc = K.counts(colStr);
      if (cc.n && K.bestShift(cc) === v) sndAlign(); else sndTick();
    }
  }
  elCs.addEventListener('input', function () { if (muting) return; setCs(readInt(elCs)); });
  $('autoKeyBtn').addEventListener('click', function () {
    const Lg = state.vig.L;
    if (cache.cipherL.length < 2 * Lg) { say(T('字母太少，沒辦法分欄統計。', 'Too few letters to count each column.')); return; }
    state.vig.guess = K.recoverKey(cache.cipherL, Lg);
    state.vig.guessAuto = true;
    if (state.myst) state.myst.autoKey = true;
    setSlider(elCs, state.vig.guess[state.vig.col - 1]);
    refresh();
    sndAuto(Lg);
    say(T('每一欄取 χ² 最小的位移：猜的金鑰是 ' + K.keyFromShifts(state.vig.guess) + '。', 'Each column takes the shift with the smallest χ²: the guessed key is ' + K.keyFromShifts(state.vig.guess) + '.'));
  });
  $('useGuessBtn').addEventListener('click', function () {
    if (state.vig.dir === 'enc') {   // 先把密文搬到輸入，猜的金鑰才是拿來解這段密文
      setText(K.vigenere(state.text, state.vig.key, 'enc'), 'swap');
      state.prov = null; state.caesar.back = null;
    }
    state.vig.key = K.keyFromShifts(state.vig.guess);
    elKey.value = state.vig.key;
    state.vig.keySrc = 'guess';
    state.vig.keyAuto = state.vig.guessAuto;
    state.vig.dir = 'dec';
    refresh();
    say(T('用猜的金鑰 ' + state.vig.key + ' 解密。', 'Decrypting with the guessed key ' + state.vig.key + '.'));
    emitVig('guess');
  });

  // =====================================================================
  // 破解挑戰
  // =====================================================================
  function loadMystery(kind) {
    const m = kind === 'caesar' ? K.makeCaesarMystery(qrand, state.mystPrev.caesar) : K.makeVigMystery(qrand, state.mystPrev.vig);
    state.mystPrev[kind] = m.idx;
    state.myst = { kind: m.kind, idx: m.idx, k: m.k, key: m.key, plain: m.plain, cipher: m.cipher, chiShown: state.freq.chiAll, caesarTouched: false, autoKey: false, solved: false };
    setText(m.cipher, 'myst');
    state.prov = null; state.caesar.back = null;
    state.caesar.dir = 'dec';
    state.vig.dir = 'dec';
    state.vig.guess = state.vig.guess.map(function () { return 0; });
    state.vig.guessAuto = false;
    setSlider(elCs, 0);
    if (kind === 'vig' && state.tab !== 'vig') { state.tab = 'vig'; applyTabVisibility(); setKbItems(); resize(); }
    $('mystMsg').className = 'msg';
    $('mystMsg').textContent = kind === 'caesar'
      ? T('一段用凱撒密碼鎖上的訊息（' + K.lettersOnly(m.cipher).length + ' 個字母）已放進輸入框。找出位移，讓輸出變成看得懂的英文。', 'A message locked with a Caesar cipher (' + K.lettersOnly(m.cipher).length + ' letters) is in the input box. Find the shift that turns the output into readable English.')
      : T('一段用維吉尼亞密碼鎖上的訊息（' + K.lettersOnly(m.cipher).length + ' 個字母）已放進輸入框。先找金鑰長度，再找每一欄的位移。', 'A message locked with a Vigenère cipher (' + K.lettersOnly(m.cipher).length + ' letters) is in the input box. Find the key length first, then the shift of each column.');
    refresh();
    say(T('祕密訊息來了。', 'Here is a secret message.'));
    emitCurrent('myst');
  }
  $('mystC').addEventListener('click', function () { loadMystery('caesar'); });
  $('mystV').addEventListener('click', function () { loadMystery('vig'); });
  $('crackBtn').addEventListener('click', function () {
    const m = state.myst;
    if (!m || m.solved) return;
    const t = state.tab;
    const ev = K.crackEvent({
      output: cache.out, myst: m, tab: t, usedKey: t === 'vig' ? state.vig.key : '', keySrc: t === 'vig' ? state.vig.keySrc : '',
      chiShown: m.chiShown, caesarTouched: m.caesarTouched,
      autoKey: m.autoKey || (t === 'vig' && state.vig.keySrc === 'guess' && state.vig.keyAuto)   // 金鑰是之前「自動找金鑰」找到的也算
    });
    const msg = $('mystMsg');
    if (ev.ok) {
      m.solved = true;
      state.cracks.unshift({ kind: m.kind, key: m.kind === 'caesar' ? 'k = ' + m.k : m.key, tab: t, letters: ev.letters });
      if (state.cracks.length > 8) state.cracks.length = 8;
      renderCracks();
      msg.className = 'msg ok';
      msg.textContent = m.kind === 'caesar'
        ? T('破解成功！金鑰是位移 k = ' + m.k + '。', 'Cracked! The key was the shift k = ' + m.k + '.')
        : T('破解成功！金鑰是 ' + m.key + '（' + m.key.length + ' 個字母）。', 'Cracked! The key was ' + m.key + ' (' + m.key.length + ' letters).');
      sndCrack(true);
      say(msg.textContent);
    } else {
      msg.className = 'msg bad';
      msg.textContent = T('還不是原文：輸出裡還有看不懂的字。', 'Not yet: the output still has words that make no sense.');
      sndCrack(false);
      say(msg.textContent);
    }
    updateTextUI();
    emit('crack', ev);
  });
  function tabName(t) {
    return { caesar: T('凱撒密碼', 'Caesar'), freq: T('頻率分析', 'Frequency'), vig: T('維吉尼亞密碼', 'Vigenère'), rsa: T('公鑰', 'Public key') }[t] || t;
  }
  function renderCracks() {
    const tab = $('crackLog');
    if (!state.cracks.length) { tab.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let h = '<thead><tr><th>' + T('密碼', 'Cipher') + '</th><th>' + T('金鑰', 'Key') + '</th><th>' + T('用的分頁', 'Tab') + '</th><th>' + T('字母', 'Letters') + '</th></tr></thead><tbody>';
    state.cracks.forEach(function (r) {
      h += '<tr><td>' + (r.kind === 'caesar' ? T('凱撒', 'Caesar') : T('維吉尼亞', 'Vigenère')) + '</td><td class="mono">' + r.key + '</td><td>' + tabName(r.tab) + '</td><td>' + r.letters + '</td></tr>';
    });
    tab.innerHTML = h + '</tbody>';
  }

  // =====================================================================
  // 公鑰控制
  // =====================================================================
  function fillPrimes() {
    [elP, elQ].forEach(function (sel) {
      sel.innerHTML = '';
      K.PRIMES.forEach(function (p) { const o = document.createElement('option'); o.value = String(p); o.textContent = String(p); sel.appendChild(o); });
    });
    elP.value = String(state.rsa.p);
    elQ.value = String(state.rsa.q);
  }
  function keyProblem() {
    const k = state.rsa.key;
    if (!k) return '';
    if (k.reason === 'same') return T('p 和 q 要選兩個不同的質數', 'p and q must be two different primes');
    if (k.reason === 'gcd') return T('e 和 φ(n) 有公因數 ' + k.g + '，找不到私鑰 d', 'e and φ(n) share the factor ' + k.g + ', so there is no private key d');
    if (k.reason === 'range') return T('e 要介於 1 和 φ(n) 之間', 'e must lie between 1 and φ(n)');
    return '';
  }
  function updateKey() {
    const r = state.rsa;
    r.p = +elP.value; r.q = +elQ.value;
    const n = r.p * r.q, phi = (r.p - 1) * (r.q - 1);
    const emax = Math.max(3, phi - 1);
    elE.min = '3'; elE.max = String(emax);
    let e = clamp(readInt(elE), 3, emax);
    if (e !== r.e || readInt(elE) !== e) { r.e = e; setSlider(elE, e); }
    elM.max = String(Math.max(1, n - 1));
    if (r.M > n - 1) { r.M = n - 1; setSlider(elM, r.M); }
    r.key = K.rsaKey(r.p, r.q, r.e);
    r.C = null; r.R = null; r.lastM = null; r.stat = null; r.view = 'none'; r.anim = null; r.eve = null;
    refresh();
  }
  elP.addEventListener('change', function () { updateKey(); say(keyMsgText()); });
  elQ.addEventListener('change', function () { updateKey(); say(keyMsgText()); });
  elE.addEventListener('input', function () { if (muting) return; state.rsa.e = readInt(elE); updateKey(); });
  $('nextE').addEventListener('click', function () {
    const r = state.rsa, phi = (r.p - 1) * (r.q - 1);
    if (r.p === r.q) return;
    const e = K.nextValidE(r.e, phi);
    if (e == null) return;
    r.e = e; setSlider(elE, e);
    updateKey();
    say(keyMsgText());
  });
  elM.addEventListener('input', function () {
    if (muting) return;
    const r = state.rsa;
    r.M = clamp(readInt(elM), 0, Math.max(0, r.p * r.q - 1));
    r.C = null; r.R = null; r.lastM = null; r.stat = null; r.view = 'none'; r.anim = null; r.eve = null;
    refresh();
  });
  function keyMsgText() {
    const k = state.rsa.key;
    if (!k) return '';
    if (!k.ok) return keyProblem() + T('。', '.');
    return T('e × d = ' + k.e + ' × ' + k.d + ' = ' + (k.e * k.d) + ' = ' + Math.floor(k.e * k.d / k.phi) + ' × ' + k.phi + ' + 1 ✓', 'e × d = ' + k.e + ' × ' + k.d + ' = ' + (k.e * k.d) + ' = ' + Math.floor(k.e * k.d / k.phi) + ' × ' + k.phi + ' + 1 ✓');
  }
  function startAnim(from, to, dur) {
    state.rsa.anim = reduced() ? null : { from: from, to: to, t0: performance.now(), dur: dur };
    state.rsa.view = to;
    requestDraw();
  }
  function logRsa(act) {
    const r = state.rsa;
    r.log.unshift({ act: act, n: r.key.n, e: r.key.e, M: r.lastM, C: r.C, R: r.R });
    if (r.log.length > 8) r.log.length = 8;
    renderRsaLog();
  }
  function rsaEmit(act, steps) {
    emit('rsa', K.rsaEvent({ act: act, key: state.rsa.key, M: state.rsa.lastM, C: state.rsa.C, R: act === 'enc' ? null : state.rsa.R, steps: steps }));
  }
  $('encBtn').addEventListener('click', function () {
    const r = state.rsa, k = r.key;
    if (!k || !k.ok) return;
    const st = {};
    r.lastM = r.M;
    r.C = K.modPow(r.M, k.e, k.n, st);
    r.R = null; r.eve = null; r.stat = st;
    startAnim('none', 'locked', 1100);
    sndLock();
    logRsa('enc');
    refresh();
    say(T('用公鑰鎖上：C = ' + r.M + ' 的 ' + k.e + ' 次方 mod ' + k.n + ' = ' + r.C + '。', 'Locked with the public key: C = ' + r.M + ' to the power ' + k.e + ' mod ' + k.n + ' = ' + r.C + '.'));
    rsaEmit('enc', st.sq + st.mul);
  });
  $('decBtn').addEventListener('click', function () {
    const r = state.rsa, k = r.key;
    if (!k || !k.ok || r.C == null) return;
    const st = {};
    r.R = K.modPow(r.C, k.d, k.n, st); r.stat = st; r.eve = null;
    startAnim('locked', 'opened', 1300);
    sndUnlock();
    logRsa('dec');
    refresh();
    say(T('私鑰打開了箱子：解出 ' + r.R + (r.R === r.lastM ? '，正是原來的訊息。' : '。'), 'The private key opened the box: ' + r.R + (r.R === r.lastM ? ', the original message.' : '.')));
    rsaEmit('dec', st.sq + st.mul);
  });
  $('decPubBtn').addEventListener('click', function () {
    const r = state.rsa, k = r.key;
    if (!k || !k.ok || r.C == null) return;
    const st = {};
    r.R = K.modPow(r.C, k.e, k.n, st); r.stat = st; r.eve = null;
    const ok = r.R === r.lastM;
    startAnim('locked', ok ? 'pubok' : 'pubfail', 1400);
    if (ok) sndUnlock(); else sndRattle();
    logRsa('decPub');
    refresh();
    say(ok ? T('咦？公鑰竟然也打開了：得到 ' + r.R + '。', 'Surprise: the public key opened it too, giving ' + r.R + '.') : T('公鑰打不開：再算一次 e 次方，得到 ' + r.R + '，不是原來的訊息。', 'The public key cannot open it: raising to the power e again gives ' + r.R + ', not the message.'));
    rsaEmit('decPub', st.sq + st.mul);
  });
  $('eveBtn').addEventListener('click', function () {
    const r = state.rsa, k = r.key;
    if (!k || !k.ok || r.C == null) return;
    const f = K.factor(k.n);
    const phi2 = (f.p - 1) * (f.q - 1), d2 = K.modInverse(k.e, phi2);
    r.R = d2 == null ? null : K.modPow(r.C, d2, k.n);
    r.eve = { p: f.p, q: f.q, steps: f.steps, d: d2 };
    startAnim('locked', 'eve', 1300);
    sndEve();
    logRsa('eve');
    refresh();
    say(T('竊聽者試除了 ' + f.steps + ' 次，把 n 拆成 ' + f.p + ' × ' + f.q + '，算出 d = ' + d2 + '，讀到 ' + r.R + '。', 'After ' + f.steps + ' trial divisions the eavesdropper splits n into ' + f.p + ' × ' + f.q + ', works out d = ' + d2 + ' and reads ' + r.R + '.'));
    rsaEmit('eve', f.steps);
  });
  function actName(a) {
    return { enc: T('公鑰加密', 'encrypt'), dec: T('私鑰解密', 'decrypt'), decPub: T('公鑰解密', 'decrypt (e)'), eve: T('竊聽者', 'eavesdrop') }[a] || a;
  }
  function renderRsaLog() {
    const tab = $('rsaLog'), log = state.rsa.log;
    if (!log.length) { tab.innerHTML = ''; return; }
    let h = '<thead><tr><th>' + T('動作', 'Action') + '</th><th>M</th><th>C</th><th>' + T('解出', 'Out') + '</th></tr></thead><tbody>';
    log.forEach(function (r) {
      const res = r.act === 'enc' ? '—' : (r.R == null ? '—' : r.R + (r.R === r.M ? ' ✓' : ' ✗'));
      h += '<tr><td>' + actName(r.act) + '</td><td>' + r.M + '</td><td>' + r.C + '</td><td>' + res + '</td></tr>';
    });
    tab.innerHTML = h + '</tbody>';
  }
  function updateRsaPanel() {
    const r = state.rsa, k = r.key;
    const ok = !!(k && k.ok);
    $('rn').textContent = k ? String(k.n) : '—';
    $('rphi').textContent = k && k.reason !== 'same' ? String(k.phi) : '—';
    $('rPub').textContent = ok ? '(' + k.n + ', ' + k.e + ')' : '—';
    $('rPriv').textContent = ok ? String(k.d) : '—';
    const km = $('keyMsg');
    km.className = 'msg ' + (ok ? 'ok' : 'bad');
    km.textContent = keyMsgText();
    $('nextE').disabled = r.p === r.q;
    $('encBtn').disabled = !ok;
    ['decBtn', 'decPubBtn', 'eveBtn'].forEach(function (id) { $(id).disabled = !ok || r.C == null; });
    // 擴展歐幾里得的步驟
    const tab = $('egcdTab');
    if (ok) {
      const eg = K.egcd(k.phi, k.e);
      let h = '<thead><tr><th>a</th><th>b</th><th>' + T('商 q', 'quotient q') + '</th><th>' + T('餘數 r', 'remainder r') + '</th></tr></thead><tbody>';
      eg.rows.forEach(function (row) { h += '<tr><td>' + row.a + '</td><td>' + row.b + '</td><td>' + row.q + '</td><td>' + row.r + '</td></tr>'; });
      tab.innerHTML = h + '</tbody>';
      $('egcdRes').textContent = k.phi + ' × (' + signed(eg.x) + ') + ' + k.e + ' × (' + signed(eg.y) + ') = 1 ⇒ d = ' + signed(eg.y) + ' mod ' + k.phi + ' = ' + k.d;
    } else { tab.innerHTML = ''; $('egcdRes').textContent = ''; }
    // 訊息
    const pad = ('000' + r.M).slice(-4);
    const pb = K.paperBlock(r.M);
    const show = function (ch) { return ch === ' ' ? T('空白', 'space') : ch; };
    $('rPaper').textContent = pb
      ? T('依 1978 年 RSA 論文的編法（空白 = 00、A = 01、…、Z = 26），' + pad + ' 可以讀成「' + show(pb[0]) + '」「' + show(pb[1]) + '」兩個字元。', 'With the coding of the 1978 RSA paper (space = 00, A = 01, …, Z = 26), ' + pad + ' reads as the two characters “' + show(pb[0]) + '” and “' + show(pb[1]) + '”.')
      : T('依 1978 年 RSA 論文的編法（每兩位數 00–26 代表空白或一個字母），' + pad + ' 讀不成字母。', 'With the coding of the 1978 RSA paper (each pair of digits 00–26 is a space or a letter), ' + pad + ' is not two letters.');
    $('rC').textContent = r.C == null ? '—' : String(r.C);
    $('rR').textContent = r.R == null ? '—' : String(r.R) + (r.R === r.lastM ? ' ✓' : ' ✗');
    $('rSteps').textContent = r.stat ? T('平方 ' + r.stat.sq + ' 次、乘 ' + r.stat.mul + ' 次', r.stat.sq + ' squarings, ' + r.stat.mul + ' multiplications') : '—';
    $('rEveSteps').textContent = r.eve ? String(r.eve.steps) : '—';
    $('rEvePQ').textContent = r.eve ? r.eve.p + ' × ' + r.eve.q : '—';
    $('rEveD').textContent = r.eve ? String(r.eve.d) : '—';
    $('rEveR').textContent = r.eve && r.R != null ? String(r.R) + (r.R === r.lastM ? ' ✓' : '') : '—';
  }

  // =====================================================================
  // 畫布：指標與鍵盤
  // =====================================================================
  function pos(ev) { const rc = cv.getBoundingClientRect(); return { x: ev.clientX - rc.left, y: ev.clientY - rc.top }; }
  function hit(p) {
    const L = Lay;
    if (!L) return null;
    if (state.tab === 'caesar') {
      const d = L.disc;
      if (Math.hypot(p.x - d.cx, p.y - d.cy) <= d.R) return { zone: 'disc' };
      return null;
    }
    if (state.tab === 'freq') {
      if (!cache.cnt.n) return null;
      const bw = (L.x1 - L.x0) / 26;
      if (p.x >= L.x0 && p.x <= L.x1) {
        const i = clamp(Math.floor((p.x - L.x0) / bw), 0, 25);
        if (p.y >= L.top - 6 && p.y <= L.top + L.mainH + 38) return { zone: 'freq', i: i };
        if (state.freq.chiAll && p.y >= L.chiTop - 6 && p.y <= L.chiB + 18) return { zone: 'chi', i: i };
      }
      return null;
    }
    if (state.tab === 'vig') {
      if (p.x >= L.x0 && p.x <= L.x1) {
        if (p.y >= L.bT - 6 && p.y <= L.bB + 18) return { zone: 'ic', i: clamp(Math.floor((p.x - L.x0) / ((L.x1 - L.x0) / K.MAX_L)), 0, K.MAX_L - 1) };
        if (p.y >= L.cT && p.y <= L.cB + 18) return { zone: 'col', i: clamp(Math.floor((p.x - L.x0) / ((L.x1 - L.x0) / 26)), 0, 25) };
      }
      return null;
    }
    return null;
  }
  // 觸控：按在密碼盤上時不要捲動頁面
  cv.addEventListener('touchstart', function (ev) {
    if (state.tab !== 'caesar' || !ev.touches.length) return;
    const h = hit(pos(ev.touches[0]));
    if (h && h.zone === 'disc') ev.preventDefault();
  }, { passive: false });
  cv.addEventListener('pointerdown', function (ev) {
    const p = pos(ev), h = hit(p);
    if (!h) return;
    if (h.zone === 'disc') {
      const d = Lay.disc;
      state.caesar.drag = { a: Math.atan2(p.y - d.cy, p.x - d.cx), id: ev.pointerId, moved: false };
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 舊瀏覽器 */ }
      ev.preventDefault();
      requestDraw();
    } else if (h.zone === 'freq') { setG(mod(h.i - 4, 26), 'bar'); say(T('假設 ' + K.letter(h.i) + ' 代表 E：g = ' + state.freq.g + '。', 'Suppose ' + K.letter(h.i) + ' stands for E: g = ' + state.freq.g + '.')); }
    else if (h.zone === 'chi') setG(h.i, 'chi');
    else if (h.zone === 'ic') setL(h.i + 1, 'bar');
    else if (h.zone === 'col') { setCs(mod(h.i - 4, 26)); say(T('假設這一欄的 ' + K.letter(h.i) + ' 代表 E：位移 ' + state.vig.guess[state.vig.col - 1] + '。', 'Suppose ' + K.letter(h.i) + ' in this column stands for E: shift ' + state.vig.guess[state.vig.col - 1] + '.')); }
  });
  cv.addEventListener('pointermove', function (ev) {
    const dr = state.caesar.drag;
    if (dr && ev.pointerId === dr.id) {
      const d = Lay.disc, p = pos(ev);
      const a = Math.atan2(p.y - d.cy, p.x - d.cx);
      const da = wrapAngle(a - dr.a);
      dr.a = a;
      if (Math.abs(da) > 0) dr.moved = true;
      state.caesar.rot += da;
      const k = mod(Math.round(-state.caesar.rot / STEP), 26);
      if (k !== state.caesar.k) setK(k, 'drag', { noEmit: true });
      else requestDraw();
      return;
    }
    if (ev.pointerType !== 'mouse') return;
    const h = hit(pos(ev));
    const key = h ? h.zone + (h.i != null ? h.i : '') : '';
    const old = state.hover ? state.hover.zone + (state.hover.i != null ? state.hover.i : '') : '';
    if (key !== old) {
      state.hover = h;
      cv.style.cursor = h ? (h.zone === 'disc' ? 'grab' : 'pointer') : 'default';
      requestDraw();
    }
  });
  function endDrag(ev) {
    const dr = state.caesar.drag;
    if (!dr || (ev && ev.pointerId !== dr.id)) return;
    state.caesar.drag = null;
    requestDraw();
    if (dr.moved) {
      say(T('位移 k = ' + state.caesar.k + '：A → ' + K.letter(state.caesar.k) + '。', 'Shift k = ' + state.caesar.k + ': A → ' + K.letter(state.caesar.k) + '.'));
      emitCaesar('drag');
    }
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (state.hover) { state.hover = null; cv.style.cursor = 'default'; requestDraw(); } });

  const kbItems = [];
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('加密實驗畫布。方向鍵轉動密碼盤或調整數值，Enter 切換要調整的項目，Shift 加方向鍵一次動 5 格。', 'Encryption canvas. Arrow keys turn the wheel or change values, Enter picks what to change, Shift with an arrow moves 5 steps.'),
    items: kbItems,
    onChange: requestDraw
  }) : null;
  function setKbItems() {
    kbItems.length = 0;
    const t = state.tab;
    if (t === 'caesar') {
      kbItems.push({
        name: function () { return T('密碼盤內圈', 'inner ring of the wheel'); },
        move: function (dx, dy, big) { const d = (dx || dy) * (big ? 5 : 1); if (!d) return false; setK(state.caesar.k + d, 'key'); return true; },
        describe: function () { return T('位移 k = ' + state.caesar.k + '，A → ' + K.letter(state.caesar.k), 'shift k = ' + state.caesar.k + ', A → ' + K.letter(state.caesar.k)); }
      });
    } else if (t === 'freq') {
      kbItems.push({
        name: function () { return T('猜測位移 g', 'guessed shift g'); },
        move: function (dx, dy, big) { const d = (dx || dy) * (big ? 5 : 1); if (!d) return false; setG(state.freq.g + d, 'key'); return true; },
        describe: function () { return 'g = ' + state.freq.g + (cache.cnt.n ? '，χ² = ' + K.chiSquared(cache.cnt, state.freq.g).toFixed(1) : ''); }
      });
    } else if (t === 'vig') {
      kbItems.push({
        name: function () { return T('猜金鑰長度 L', 'guessed key length L'); },
        move: function (dx, dy) { const d = dx || dy; if (!d) return false; setL(state.vig.L + d, 'key'); return true; },
        describe: function () { const v = cache.prof[state.vig.L - 1]; return 'L = ' + state.vig.L + (isFinite(v) ? T('，平均重合指數 ', ', average IC ') + v.toFixed(3) : ''); }
      });
      kbItems.push({
        name: function () { return T('第幾欄 c', 'column c'); },
        move: function (dx, dy) { const d = dx || dy; if (!d) return false; setCol(state.vig.col + d); return true; },
        describe: function () { return T('第 ' + state.vig.col + ' 欄', 'column ' + state.vig.col); }
      });
      kbItems.push({
        name: function () { return T('這一欄的位移', 'shift of this column'); },
        move: function (dx, dy, big) { const d = (dx || dy) * (big ? 5 : 1); if (!d) return false; setCs(state.vig.guess[state.vig.col - 1] + d); return true; },
        describe: function () { const v = state.vig.guess[state.vig.col - 1]; return T('位移 ' + v + '，金鑰字母 ' + K.letter(v), 'shift ' + v + ', key letter ' + K.letter(v)); }
      });
    } else {
      kbItems.push({
        name: function () { return T('訊息 M', 'message M'); },
        move: function (dx, dy, big) {
          const d = (dx || dy) * (big ? 50 : 1); if (!d) return false;
          const r = state.rsa, n = r.p * r.q;
          r.M = clamp(r.M + d, 0, Math.max(0, n - 1)); setSlider(elM, r.M);
          r.C = null; r.R = null; r.lastM = null; r.stat = null; r.view = 'none'; r.anim = null; r.eve = null;
          refresh(); return true;
        },
        describe: function () { return 'M = ' + state.rsa.M; }
      });
      kbItems.push({
        name: function () { return T('公開指數 e', 'public exponent e'); },
        move: function (dx, dy) {
          const d = dx || dy; if (!d) return false;
          const r = state.rsa, phi = (r.p - 1) * (r.q - 1);
          if (r.p === r.q) return false;
          let e = r.e;
          for (let i = 0; i < phi; i++) { e += d; if (e < 3) e = phi - 1; if (e > phi - 1) e = 3; if (K.gcd(e, phi) === 1) break; }
          r.e = e; setSlider(elE, e); updateKey(); return true;
        },
        describe: function () { const k = state.rsa.key; return 'e = ' + state.rsa.e + (k && k.ok ? '，d = ' + k.d : ''); }
      });
    }
    if (kb) kb.select(0);
  }

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.CryptoLab = {
    state: state,
    core: K,
    output: function () { return cache.out; },
    tab: function (t) { setTab(t, true); },
    text: function (s) { elIn.value = s; applyTextInput(); },
    key: function (s) { elKey.value = s; applyKeyInput(); },
    seed: function (s) { qrand = K.rng(s); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() {
    readColors();
    renderCracks();
    renderRsaLog();
    updateSoundButton();
    refresh();
  }
  readColors();
  fillPrimes();
  elIn.value = state.text;
  elKey.value = state.vig.key;
  state.caesar.k = mod(readInt(elK), 26);
  state.caesar.rot = -state.caesar.k * STEP;
  state.freq.g = mod(readInt(elG), 26);
  state.freq.overlay = elOverlay.checked;
  state.freq.chiAll = elChiAll.checked;
  state.rsa.e = readInt(elE);
  state.rsa.M = readInt(elM);
  applyTabVisibility();
  setKbItems();
  updateKey();
  renderCracks();
  renderRsaLog();
  updateSoundButton();
  refresh();
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
