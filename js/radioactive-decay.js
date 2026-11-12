/* radioactive-decay.js — 「放射性衰變與半衰期」模組的畫面與互動（物理計算在 radioactive-decay-core.js） */
(function () {
  'use strict';
  const DC = window.DecayCore;
  const LD = window.LabDraw; // 共用繪圖工具（js/drawkit.js）：標籤、立體球、管狀線條
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 常數 ----------
  const ANIM_HALF = 4;     // 真實核種：1× 速度下，母核一個半衰期 = 動畫 4 秒
  const ROLL_DT = 0.6;     // 骰子：1× 速度下每 0.6 秒擲一次
  const MAX_CLICKS = 40;   // 蓋革計數聲每秒最多約 40 聲，超過就隨機抽樣（仍保持隨機）
  const MAX_ARCHIVE = 12;  // 最多保留 12 條舊曲線
  const MAX_FX = 500;
  const PRESETS = {
    custom: { unit: 's' },
    i131: { half: 8.02, unit: 'd', name: ['碘-131', 'Iodine-131'], decay: ['β<sup>−</sup>', 'β<sup>−</sup>'], into: ['氙-131', 'xenon-131'], use: ['治療甲狀腺疾病', 'thyroid treatment'] },
    c14: { half: 5730, unit: 'y', name: ['碳-14', 'Carbon-14'], decay: ['β<sup>−</sup>', 'β<sup>−</sup>'], into: ['氮-14', 'nitrogen-14'], use: ['碳十四定年', 'radiocarbon dating'] },
    co60: { half: 5.27, unit: 'y', name: ['鈷-60', 'Cobalt-60'], decay: ['β<sup>−</sup>', 'β<sup>−</sup>'], extra: ['（並放出 γ 射線）', ' (with γ rays)'], into: ['鎳-60', 'nickel-60'], use: ['放射治療、滅菌', 'radiotherapy, sterilisation'] },
    rn222: { half: 3.82, unit: 'd', name: ['氡-222', 'Radon-222'], decay: ['α', 'α'], into: ['釙-218', 'polonium-218'], use: ['室內氡氣', 'radon gas in buildings'] },
    mo99: { half: 65.94, half2: 6.01, unit: 'h', name: ['鉬-99', 'Molybdenum-99'], decay: ['β<sup>−</sup>', 'β<sup>−</sup>'], into: ['鎝-99m', 'technetium-99m'], use: ['醫學造影的鎝-99m 發生器', 'Tc-99m generator for medical imaging'] },
    mystery: { unit: 's' }
  };

  const state = {
    mode: 'nuclei', preset: 'custom', N0: 1600, th: 3, th2: 1, chain: false,
    speed: 1, log: false, showTh: true, showMk: true,
    running: !reducedMotion,
    run: null, archive: [],
    mystery: { T: 5, id: 0, answered: false },
    fx: []
  };

  function isPreset() { return state.mode === 'nuclei' && state.preset !== 'custom' && state.preset !== 'mystery'; }
  function isMystery() { return state.mode === 'nuclei' && state.preset === 'mystery'; }
  function half() {
    if (state.mode === 'dice') return DC.DICE_HALF;
    if (state.preset === 'mystery') return state.mystery.T;
    if (state.preset === 'custom') return state.th;
    return PRESETS[state.preset].half;
  }
  function half2() {
    if (state.mode !== 'nuclei') return null;
    if (state.preset === 'custom' && state.chain) return state.th2;
    if (state.preset === 'mo99') return PRESETS.mo99.half2;
    return null;
  }
  function unit() { return state.mode === 'dice' ? 'roll' : PRESETS[state.preset].unit; }
  /** 模擬時間（該單位）每動畫秒前進多少 */
  function simRate() { return (isPreset() ? half() / ANIM_HALF : 1) * state.speed; }
  /** 圖表的橫軸：半衰期數（half）、秒（sec，神秘核種）、擲骰次數（roll） */
  function xKind() { return state.mode === 'dice' ? 'roll' : isMystery() ? 'sec' : 'half'; }

  // ---------- 單位與數字 ----------
  function uSuffix(u) {
    return u === 'd' ? T(' 天', ' d') : u === 'y' ? T(' 年', ' y') : u === 'h' ? T(' 小時', ' h') : u === 'roll' ? T(' 次', ' rolls') : ' s';
  }
  function uPer(u) {
    return u === 'd' ? T('/天', '/d') : u === 'y' ? T('/年', '/y') : u === 'h' ? T('/小時', '/h') : u === 'roll' ? T('/次', '/roll') : '/s';
  }
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 依大小自動決定小數位數 */
  function auto(v) {
    const a = Math.abs(v);
    return num(v, a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 2 : 3);
  }
  /** 科學記號（HTML，用 <sup>） */
  function sci(v, sig) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 0.01 && a < 1e5) return auto(v);
    const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
    return num(m, sig == null ? 2 : sig) + ' × 10<sup>' + num(e, 0) + '</sup>';
  }
  function timeStr(t, u) {
    if (u === 'roll') return num(t, 0) + uSuffix(u);
    return auto(t) + uSuffix(u);
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface', '--equi', '--probe', '--pos', '--b-modern', '--b-optics']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    const r = rgbOf(colors['canvas-bg']);
    colors.dark = (r[0] + r[1] + r[2]) / 3 < 100;
    colors.P = colors['b-modern'];
    colors.D = colors['b-optics'];
    colors.S = colors.muted;
    colors.flash = colors.equi;
  }
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  function alpha(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  function shade(c, f) {
    const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  function mix(c1, c2, f) {
    const a = rgbOf(c1), b = rgbOf(c2);
    return 'rgb(' + a.map(function (x, i) { return Math.round(x + (b[i] - x) * f); }).join(',') + ')';
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, L = null;
  const bg = document.createElement('canvas'), bgc = bg.getContext('2d');
  const gridLayer = document.createElement('canvas'), glc = gridLayer.getContext('2d');
  const arcLayer = document.createElement('canvas'), alc = arcLayer.getContext('2d');
  let arcKey = '';

  function layout() {
    const narrow = cw < 620, gap = narrow ? 8 : 10;
    let G, NG, AG, H;
    if (narrow) {
      const S = cw, gH = Math.round(cw * 0.64), aH = Math.round(cw * 0.44);
      G = { x: 0, y: 0, w: S, h: S };
      NG = { x: 0, y: S + gap, w: cw, h: gH };
      AG = { x: 0, y: S + gap + gH + gap, w: cw, h: aH };
      H = AG.y + aH;
    } else {
      const S = Math.round(Math.min(cw * 0.46, 470));
      const gH = Math.round(S * 0.6);
      G = { x: 0, y: 0, w: S, h: S };
      NG = { x: S + gap, y: 0, w: cw - S - gap, h: gH };
      AG = { x: S + gap, y: gH + gap, w: cw - S - gap, h: S - gH - gap };
      H = S;
    }
    return { narrow: narrow, G: G, NG: NG, AG: AG, H: H, band: narrow ? 26 : 28 };
  }

  /** 原子核方陣的格子：n × n，置中 */
  function gridGeom() {
    const G = L.G, n = Math.round(Math.sqrt(state.N0));
    const pad = Math.max(6, G.w * 0.025);
    const availW = G.w - 2 * pad, availH = G.h - L.band - pad;
    const c = Math.min(availW, availH) / n;
    const x0 = G.x + (G.w - c * n) / 2, y0 = G.y + L.band + (availH - c * n) / 2;
    return { n: n, c: c, x0: x0, y0: y0 };
  }
  let GG = null;

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
    buildBackground();
    rebuildGrid();
    arcKey = '';
    draw();
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

  /** 不變的圖層：三個區域的底色與邊框 */
  function buildBackground() {
    bg.width = cv.width; bg.height = cv.height;
    const c = bgc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const edge = shade(base, colors.dark ? -0.35 : -0.05);
    const G = L.G;
    const rg = c.createRadialGradient(G.x + G.w / 2, G.y + G.h * 0.45, G.w * 0.1, G.x + G.w / 2, G.y + G.h / 2, G.w * 0.78);
    rg.addColorStop(0, colors.dark ? shade(base, 0.04) : base);
    rg.addColorStop(1, edge);
    c.fillStyle = rg;
    roundRect(c, G.x, G.y, G.w, G.h, 8); c.fill();
    // 樣本盤：邊緣向內的柔和陰影（看起來凹進去）
    c.save();
    roundRect(c, G.x, G.y, G.w, G.h, 8); c.clip();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.65)' : alpha(colors.text, 0.2);
    c.shadowBlur = 12;
    c.shadowOffsetY = 3;
    c.lineWidth = 10;
    c.strokeStyle = colors.dark ? 'rgba(0,0,0,0.55)' : alpha(colors.text, 0.12);
    roundRect(c, G.x - 5, G.y - 5, G.w + 10, G.h + 10, 13); c.stroke();
    c.restore();
    [L.NG, L.AG].forEach(function (R) {
      const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
      g.addColorStop(0, base); g.addColorStop(1, edge);
      c.fillStyle = g;
      roundRect(c, R.x, R.y, R.w, R.h, 8); c.fill();
    });
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    [G, L.NG, L.AG].forEach(function (R) { roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8); c.stroke(); });
  }

  // ---------- 原子核與骰子的小圖（sprite） ----------
  let sprites = {};
  function makeSprite(size, fn) {
    const s = document.createElement('canvas');
    const px = Math.max(2, Math.ceil(size * dpr));
    s.width = px; s.height = px;
    const c = s.getContext('2d');
    c.setTransform(px / size, 0, 0, px / size, 0, 0);
    fn(c, size);
    return s;
  }
  /** 立體小球：亮點偏左上、邊緣加深、細亮邊 */
  function ball(c, x, y, R, base, a) {
    const g = c.createRadialGradient(x - R * 0.33, y - R * 0.36, R * 0.08, x, y, R);
    g.addColorStop(0, shade(base, 0.6));
    g.addColorStop(0.45, base);
    g.addColorStop(1, shade(base, -0.45));
    c.globalAlpha = a == null ? 1 : a;
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    if (R > 3) {
      c.strokeStyle = alpha(shade(base, 0.75), colors.dark ? 0.5 : 0.4);
      c.lineWidth = Math.max(0.6, R * 0.08);
      c.beginPath(); c.arc(x, y, R * 0.92, Math.PI * 1.05, Math.PI * 1.65); c.stroke();
    }
    if (R > 1.8) {
      // 鏡面亮點（左上）
      const hx = x - R * 0.36, hy = y - R * 0.42, hr = R * 0.45;
      const hg = c.createRadialGradient(hx, hy, 0, hx, hy, hr);
      hg.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.55 : 0.75) + ')');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hg;
      c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI * 2); c.fill();
    }
    if (R > 2.5 && !colors.dark) {
      c.strokeStyle = alpha(shade(base, -0.55), 0.35);
      c.lineWidth = 0.6;
      c.beginPath(); c.arc(x, y, R - 0.3, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
  }
  /** 原子核：格子大時畫成質子、中子聚在一起的團，小時是一顆小球 */
  function nucleus(c, size, base, scale, a) {
    const m = size / 2, R = size * 0.42 * scale;
    if (size >= 9 && R > 2.5) {
      const sh = c.createRadialGradient(m + R * 0.2, m + R * 0.35, R * 0.2, m + R * 0.2, m + R * 0.35, R * 1.15);
      sh.addColorStop(0, 'rgba(0,0,0,' + (colors.dark ? 0.4 : 0.2) * (a == null ? 1 : a) + ')');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sh;
      c.beginPath(); c.arc(m + R * 0.2, m + R * 0.35, R * 1.15, 0, Math.PI * 2); c.fill();
    }
    if (size >= 22 && scale > 0.8) {
      // 7 個核子：外圈 6 個、中央 1 個；質子較亮、中子較暗（只是示意）
      const r = R * 0.45, pts = [];
      for (let k = 0; k < 6; k++) { const th = k * Math.PI / 3 + 0.3; pts.push([m + Math.cos(th) * R * 0.55, m + Math.sin(th) * R * 0.55, k % 2]); }
      pts.sort(function (p, q) { return p[1] - q[1]; });
      pts.splice(3, 0, [m, m, 0]);
      pts.forEach(function (p) { ball(c, p[0], p[1], r, p[2] ? shade(base, -0.18) : shade(base, 0.12), a); });
    } else {
      ball(c, m, m, R, base, a);
    }
  }
  const PIPS = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
  };
  function die(c, size, face, dead) {
    const s = size * 0.84, o = (size - s) / 2, r = Math.max(1, s * 0.22);
    if (dead) {
      // 已離開桌面：只留下淡淡的空位
      c.fillStyle = alpha(colors.muted, colors.dark ? 0.08 : 0.05);
      roundRect(c, o, o, s, s, r); c.fill();
      if (size >= 6) {
        c.strokeStyle = alpha(colors.muted, colors.dark ? 0.24 : 0.2);
        c.lineWidth = Math.max(0.5, s * 0.045);
        roundRect(c, o + 0.5, o + 0.5, s - 1, s - 1, r); c.stroke();
      }
      return;
    }
    const body = mix('#ffffff', colors.P, colors.dark ? 0.12 : 0.05);
    // 投影
    c.fillStyle = 'rgba(0,0,0,' + (colors.dark ? 0.55 : 0.3) + ')';
    roundRect(c, o + s * 0.07, o + s * 0.14, s, s, r); c.fill();
    // 本體：上亮下暗
    const g = c.createLinearGradient(0, o, 0, o + s);
    g.addColorStop(0, body);
    g.addColorStop(0.6, shade(body, -0.06));
    g.addColorStop(1, shade(body, -0.2));
    c.fillStyle = g;
    roundRect(c, o, o, s, s, r); c.fill();
    if (size >= 7) {
      // 上緣的亮線與外框
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillRect(o + r, o + 0.6, s - 2 * r, Math.max(0.6, s * 0.05));
      c.strokeStyle = alpha(shade(colors.P, -0.35), colors.dark ? 0.75 : 0.8);
      c.lineWidth = Math.max(0.6, s * 0.05);
      roundRect(c, o + 0.5, o + 0.5, s - 1, s - 1, r); c.stroke();
    }
    if (size >= 13) {
      const pr = s * 0.085, d = s * 0.27;
      c.fillStyle = face === 6 ? shade(colors.pos, -0.1) : '#26323a';
      PIPS[face].forEach(function (p) { c.beginPath(); c.arc(size / 2 + p[0] * d, size / 2 + p[1] * d, pr, 0, Math.PI * 2); c.fill(); });
    }
  }
  function buildSprites() {
    sprites = {};
    if (!GG) return;
    const c = GG.c;
    if (state.mode === 'dice') {
      for (let f = 1; f <= 6; f++) sprites['f' + f] = makeSprite(c, function (x, s) { die(x, s, f, false); });
      sprites.dead = makeSprite(c, function (x, s) { die(x, s, 6, true); });
    } else {
      sprites.P = makeSprite(c, function (x, s) { nucleus(x, s, colors.P, 1, 1); });
      sprites.D = makeSprite(c, function (x, s) { nucleus(x, s, colors.D, 1, 1); });
      sprites.S = makeSprite(c, function (x, s) { nucleus(x, s, mix(colors.S, colors['canvas-bg'], 0.3), 0.5, colors.dark ? 0.42 : 0.34); });
    }
    // 衰變閃光：深色模式的金色光暈、中心亮點（預先畫好重複使用）
    sprites.glow = makeSprite(64, function (x) {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, alpha(shade(colors.flash, 0.7), 0.9));
      g.addColorStop(0.3, alpha(colors.flash, 0.5));
      g.addColorStop(1, alpha(colors.flash, 0));
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
    sprites.core = makeSprite(32, function (x) {
      const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, colors.dark ? 'rgba(255,255,255,1)' : alpha(shade(colors.flash, 0.6), 1));
      g.addColorStop(0.4, alpha(colors.dark ? shade(colors.flash, 0.35) : shade(colors.flash, 0.1), 0.95));
      g.addColorStop(1, alpha(colors.flash, 0));
      x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    });
  }
  function rebuildGrid() {
    if (!L) return;
    GG = gridGeom();
    gridLayer.width = cv.width; gridLayer.height = cv.height;
    buildSprites();
    paintAll();
  }
  function cellXY(i) { const n = GG.n; return [GG.x0 + (i % n) * GG.c, GG.y0 + Math.floor(i / n) * GG.c]; }
  function spriteOf(i) {
    const sim = state.run && state.run.sim;
    if (!sim) return null;
    const s = sim.state[i];
    if (sim.kind === 'dice') return s === 2 ? sprites.dead : sprites['f' + sim.face[i]];
    return s === 0 ? sprites.P : s === 1 ? sprites.D : sprites.S;
  }
  function paintCell(i) {
    const p = cellXY(i), c = GG.c;
    glc.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 對齊到裝置像素清除，避免殘影
    const x0 = Math.floor(p[0] * dpr) / dpr, y0 = Math.floor(p[1] * dpr) / dpr;
    const x1 = Math.ceil((p[0] + c) * dpr) / dpr, y1 = Math.ceil((p[1] + c) * dpr) / dpr;
    glc.clearRect(x0, y0, x1 - x0, y1 - y0);
    const sp = spriteOf(i);
    if (sp) glc.drawImage(sp, p[0], p[1], c, c);
  }
  function paintAll() {
    glc.setTransform(1, 0, 0, 1, 0, 0);
    glc.clearRect(0, 0, gridLayer.width, gridLayer.height);
    const sim = state.run && state.run.sim;
    if (!sim || !GG) return;
    glc.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 先畫已衰變的，再畫還活著的（陰影疊在上面比較自然）
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < sim.N0; i++) {
        const dead = sim.state[i] === 2;
        if ((pass === 0) !== dead) continue;
        const p = cellXY(i), sp = spriteOf(i);
        if (sp) glc.drawImage(sp, p[0], p[1], GG.c, GG.c);
      }
    }
  }

  // ---------- 一輪實驗 ----------
  function newRun(byUser, keepOld) {
    const old = state.run;
    if (keepOld !== false && old && old.kind !== 'sec') archiveRun(old);
    const N0 = state.N0, seed = (Math.random() * 4294967296) >>> 0;
    const sim = state.mode === 'dice' ? DC.createDice({ N0: N0, seed: seed })
      : DC.createSim({ N0: N0, halfLife: half(), halfLife2: half2(), seed: seed });
    const kind = xKind();
    const hl = half();
    state.run = {
      sim: sim, kind: kind, byUser: !!byUser, ended: false,
      ev: DC.events(N0 * 2 + 4),
      N0: N0, half: hl, half2: half2(), unit: unit(), preset: state.mode === 'dice' ? 'dice' : state.preset,
      mysteryId: state.mystery.id,
      hist: { t: [0], P: [N0], D: [0], S: [0] }, recDt: state.mode === 'dice' ? 1 : hl / 60, lastRec: 0,
      binW: state.mode === 'dice' ? 1 : kind === 'sec' ? 0.5 : hl / 4, bins: [],
      tHalfMeas: null, nextMark: 1, fit: null, fitAt: 0,
      rollAcc: 0, lastRoll: null, rate: 0
    };
    state.fx = [];
    if (lastKeepMsg) setStatus('');
    clickKeep = 1; lastKeepMsg = '';
    paintAll();
    arcKey = '';
    if (byUser) sayNewRun();
    if (byUser && keepOld !== false && window.LabMission) emit('archive', { runs: state.archive.map(function (r) { return { N0: r.N0, span: r.span, kind: r.kind, preset: r.preset }; }) });
    updateReadoutLayout();
    updateButtons();
    requestDraw();
  }

  function archiveRun(r) {
    const sim = r.sim;
    const span = r.kind === 'half' ? sim.t / r.half : sim.t;
    if (r.kind === 'half' ? span < 0.25 : span < 1) return;
    const sx = r.kind === 'half' ? 1 / r.half : 1;
    const xs = new Float32Array(r.hist.t.length), ys = new Float32Array(r.hist.t.length);
    for (let i = 0; i < xs.length; i++) { xs[i] = r.hist.t[i] * sx; ys[i] = r.hist.P[i] / r.N0; }
    state.archive.push({ kind: r.kind, N0: r.N0, preset: r.preset, span: span, x: xs, y: ys, chain: r.half2 != null });
    if (state.archive.length > MAX_ARCHIVE) state.archive.shift();
  }

  /** 記錄圖表資料（每個半衰期約 60 點；太多時抽掉一半） */
  function record(force) {
    const r = state.run, s = r.sim, h = r.hist;
    if (!force && s.t - r.lastRec < r.recDt) return;
    h.t.push(s.t); h.P.push(s.nP); h.D.push(s.nD); h.S.push(s.nS);
    r.lastRec = s.t;
    if (h.t.length > 3000) {
      ['t', 'P', 'D', 'S'].forEach(function (k) { h[k] = h[k].filter(function (_, i) { return i % 2 === 0 || i === h[k].length - 1; }); });
      r.recDt *= 2;
    }
  }

  // ---------- 動畫：時間推進 ----------
  /** 推進模擬時間 dt（模擬單位）；跨過 k·T½ 時切成兩段，剛好在標記處回報 */
  function advance(dt, frameSec) {
    const r = state.run;
    let left = dt;
    let guard = 0;
    while (left > 1e-12 && !r.ended && guard++ < 64) {
      const tm = r.nextMark * r.half;
      const h = Math.min(left, Math.max(0, tm - r.sim.t));
      if (h > 1e-12) subStep(h, frameSec * h / dt);
      left -= h;
      if (r.sim.t >= tm - 1e-9) {
        r.nextMark++;
        emit('mark', Object.assign({ k: r.nextMark - 1 }, snapshot()));
      }
    }
  }

  function subStep(h, realSec) {
    const r = state.run, s = r.sim, ev = r.ev;
    const t0 = s.t;
    const n = DC.step(s, h, ev);
    handleEvents(t0, h, realSec, n);
    record(false);
    afterChange();
  }

  function handleEvents(t0, h, realSec, n) {
    const r = state.run, ev = r.ev, nowMs = performance.now();
    // 估計目前每（真實）秒的衰變數，決定蓋革聲要不要抽樣
    if (realSec > 0) {
      const inst = n / realSec;
      r.rate += (inst - r.rate) * Math.min(1, realSec / 1.2); // 以時間加權的平均：等於最近約 1 秒的衰變數／時間
    }
    clickKeep = r.rate > MAX_CLICKS ? MAX_CLICKS / r.rate : 1;
    let clicks = 0;
    for (let k = 0; k < ev.n; k++) {
      const i = ev.idx[k], at = ev.at[k];
      paintCell(i);
      const b = Math.floor((t0 + at) / r.binW);
      r.bins[b] = (r.bins[b] || 0) + 1;
      if (!reducedMotion) addFx(i, ev.kind[k], nowMs + (h > 0 ? at / h : 0) * realSec * 1000 - realSec * 1000);
      if (Math.random() < clickKeep && clicks < 8) { click(h > 0 ? (at / h) * realSec : 0); clicks++; }
    }
    updateClickMsg();
  }

  function afterChange() {
    const r = state.run, s = r.sim;
    if (r.tHalfMeas == null && s.nP * 2 <= r.N0) { r.tHalfMeas = s.t; sayHalf(); }
    if (s.nP === 0 && s.nD === 0 && !r.ended) {
      r.ended = true;
      record(true);
      state.running = false;
      setStatus(s.kind === 'dice'
        ? T('所有骰子都擲出了 6 點，實驗結束。按「新的一輪」再擲一次，比較兩條曲線。', 'Every die has rolled a six. Press “New run” to roll again and compare the curves.')
        : T('所有原子核都衰變完了。按「新的一輪」重新開始，舊的曲線會保留下來比較。', 'Every nucleus has decayed. Press “New run” to start again; the old curve is kept for comparison.'));
      emit('end', snapshot());
      updateButtons();
    }
  }

  function doRoll() {
    const r = state.run, s = r.sim;
    if (r.ended || s.kind !== 'dice') return;
    const before = s.nP;
    const n = DC.roll(s, r.ev);
    r.lastRoll = n;
    r.bins[s.t - 1] = n;
    paintAll();
    const nowMs = performance.now();
    rollSound();
    const keep = n > 10 ? 10 / n : 1;
    let clicks = 0;
    for (let k = 0; k < r.ev.n; k++) {
      if (!reducedMotion) addFx(r.ev.idx[k], 2, nowMs + r.ev.at[k] * 160);
      if (Math.random() < keep && clicks < 10) { click(0.05 + r.ev.at[k] * 0.16); clicks++; }
    }
    record(true);
    afterChange();
    emit('roll', Object.assign({ before: before, decayed: n }, snapshot()));
    requestDraw();
  }

  // ---------- 裝飾效果（不影響物理） ----------
  function addFx(i, kind, t0) {
    state.fx.push({ i: i, kind: kind, t0: t0, a: Math.random() * Math.PI * 2 });
    const cap = state.N0 >= 10000 ? 140 : state.N0 >= 1600 ? 300 : MAX_FX;
    if (state.fx.length > cap) state.fx.splice(0, state.fx.length - cap);
  }
  const FX_DUR = 450;   // 衰變閃光的長度（ms，純裝飾）

  // ---------- 音效 ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let clickKeep = 1, lastKeepMsg = '';
  /** 蓋革計數器的「喀」：極短的寬頻噪音（主要能量在 2–5 kHz） */
  function click(delay) {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.006, gain: 0.85, filter: 3200 + Math.random() * 900, q: 0.7, attack: 0.0008, delay: Math.max(0, delay || 0) });
  }
  function rollSound() {
    const S = sound(); if (!S) return;
    for (let k = 0; k < 3; k++) S.noise({ dur: 0.025, gain: 0.25, filter: 1600 + k * 500, q: 2, delay: k * 0.035 });
  }
  function updateClickMsg() {
    let msg = '';
    if (sound() && clickKeep < 0.95) {
      const k = Math.round(1 / clickKeep);
      msg = T('衰變太頻繁，聽不出個別的聲音：目前隨機播放約每 ' + k + ' 次衰變中的 1 次。', 'Decays are too frequent to hear one by one: about 1 in ' + k + ' is played, chosen at random.');
    }
    if (msg !== lastKeepMsg) { lastKeepMsg = msg; setStatus(msg); }
  }

  // ---------- 任務 ----------
  function emit(type, data) {
    const r = state.run;
    if (!window.LabMission || !r || !r.byUser) return;
    window.LabMission.emit(type, data);
  }
  function snapshot() {
    const r = state.run, s = r.sim, hl = r.half, h2 = r.half2;
    const o = {
      mode: s.kind, preset: r.preset, N0: r.N0, N: s.nP, D: s.nD, S: s.nS, t: s.t, unit: r.unit,
      half: hl, half2: h2, chain: h2 != null, tOverT: s.t / hl, tau: hl / Math.LN2,
      Nth: s.kind === 'dice' ? DC.diceTheory(r.N0, s.t) : DC.theoryN(r.N0, hl, s.t),
      log: state.log, speed: state.speed, mystery: r.kind === 'sec',
      fitHalf: r.fit ? r.fit.halfLife : null, tHalfMeas: r.tHalfMeas, rolls: s.kind === 'dice' ? s.t : null
    };
    if (h2 != null) {
      const b = DC.bateman(r.N0, hl, h2, s.t);
      o.Dth = b.D; o.Pth = b.P;
      o.tmax = DC.daughterPeakTime(hl, h2);
      o.eqRatio = DC.equilibriumRatio(hl, h2);
      o.ratioDP = s.nP > 0 ? s.nD / s.nP : null;
    }
    return o;
  }

  // ---------- 圖表工具 ----------
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  /**
   * 標籤（drawkit）：(x, y) 為文字的垂直中心，水平對齊沿用 c.textAlign。
   * bgA = 0：不要底框，只畫帶背景色描邊的文字；其他：圓角底框。傳回 {x, w}（底框的左緣與寬度）
   */
  function pill(c, text, x, y, color, font, bgA) {
    font = font || '600 12px ' + LD.FONT;
    c.font = font;
    const al = c.textAlign === 'right' || c.textAlign === 'end' ? 'right' : c.textAlign === 'center' ? 'center' : 'left';
    const m = c.measureText(text), tw = m.width;
    let box;
    if (bgA === 0) {
      LD.haloText(c, text, x, y + 0.5, color, al, 'middle', font);
      box = { x: al === 'center' ? x - tw / 2 - 6 : al === 'right' ? x - tw - 6 : x - 6, w: tw + 12 };
    } else {
      const ph = LD.textHeight(m, 15) + 3;
      const b = LD.pill(c, text, al === 'right' ? x + 6 : al === 'left' ? x - 6 : x, y + ph / 2, color, al, font);
      box = { x: b.x, w: b.w };
    }
    c.textAlign = al;
    return box;
  }
  /** 帶下標的文字（例如 N0），避免使用 Unicode 下標字元 */
  function subText(c, base, sub, x, y, after) {
    const f = c.font;
    const w1 = c.measureText(base).width;
    c.fillText(base, x, y);
    const m = /(\d+)px/.exec(f), size = m ? +m[1] : 12;
    c.font = f.replace(/(\d+)px/, Math.round(size * 0.72) + 'px');
    const w2 = c.measureText(sub).width;
    c.fillText(sub, x + w1, y + size * 0.28);
    c.font = f;
    if (after) c.fillText(after, x + w1 + w2 + 1, y);
  }

  /** 目前圖表的橫軸範圍 */
  function xMax() {
    const r = state.run, k = r.kind;
    let cur = k === 'half' ? r.sim.t / r.half : r.sim.t;
    state.archive.forEach(function (a) { if (a.kind === k) cur = Math.max(cur, a.span); });
    const list = k === 'roll' ? [16, 24, 32, 48, 64, 96, 128] : k === 'sec' ? [30, 45, 60, 90, 120, 180, 240, 360] : [6, 8, 10, 12, 16, 20, 24, 32, 48];
    const need = cur * 1.04 + (k === 'roll' ? 1 : k === 'sec' ? 2 : 0.3);
    for (let i = 0; i < list.length; i++) if (list[i] >= need) return list[i];
    return Math.ceil(need / list[list.length - 1]) * list[list.length - 1];
  }
  /** 圖表左邊界：對數座標的刻度（例如 1/1024）比較寬；兩張圖一起改，橫軸才會上下對齊 */
  function marginL() { return state.log ? (L.narrow ? 47 : 50) : (L.narrow ? 40 : 44); }
  function frameOf(R) {
    const ml = marginL();
    return { x0: R.x + ml, x1: R.x + R.w - 12, y0: R.y + 24, y1: R.y + R.h - 26 };
  }
  // N 圖：縱軸是 N/N0
  const Y_TOP = 1.06;
  function fMin() { return 0.5 / state.run.N0; }
  function yN(F, f) {
    if (state.log) {
      const lo = Math.log2(fMin()), hi = Math.log2(Y_TOP);
      const v = f > 0 ? Math.log2(f) : lo - 1;
      return F.y1 - (Math.max(lo - 0.3, v) - lo) / (hi - lo) * (F.y1 - F.y0);
    }
    return F.y1 - f / Y_TOP * (F.y1 - F.y0);
  }
  function xPix(F, x, xm) { return F.x0 + x / xm * (F.x1 - F.x0); }
  function xOfT(t) { const r = state.run; return r.kind === 'half' ? t / r.half : t; }

  function xAxis(c, F, xm, title) {
    const r = state.run;
    c.font = '11px ' + LD.FONT;
    c.fillStyle = alpha(colors.muted, 0.95);
    c.textAlign = 'center'; c.textBaseline = 'top';
    const minPx = 26;
    let step = r.kind === 'half' ? 1 : niceStep(xm / 8);
    while ((F.x1 - F.x0) * step / xm < minPx) step *= 2;
    c.lineWidth = 1;
    const minor = step / (r.kind === 'half' && step === 1 ? 4 : 2);
    if ((F.x1 - F.x0) * minor / xm >= 7) {
      c.strokeStyle = alpha(colors.text, colors.dark ? 0.05 : 0.04);
      c.beginPath();
      for (let x = minor; x < xm + 1e-9; x += minor) {
        if (Math.abs(x / step - Math.round(x / step)) < 1e-6) continue;
        const px = Math.round(xPix(F, x, xm)) + 0.5; c.moveTo(px, F.y0); c.lineTo(px, F.y1);
      }
      c.stroke();
    }
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.11 : 0.1);
    c.beginPath();
    for (let x = step; x < xm + 1e-9; x += step) { const px = Math.round(xPix(F, x, xm)) + 0.5; c.moveTo(px, F.y0); c.lineTo(px, F.y1); }
    c.stroke();
    let tw = 0;
    if (title) { c.font = '600 11px ' + LD.FONT; tw = c.measureText(title).width; c.font = '11px ' + LD.FONT; }
    for (let x = 0; x <= xm + 1e-9; x += step) {
      const X = xPix(F, x, xm), lw = c.measureText(num(x, 0)).width;
      if (title && X + lw / 2 > F.x1 - tw - 8) continue;
      c.fillText(num(x, 0), X, F.y1 + 4);
    }
    // 座標軸
    c.strokeStyle = alpha(colors.muted, 0.7);
    c.beginPath(); c.moveTo(F.x0, Math.round(F.y1) + 0.5); c.lineTo(F.x1, Math.round(F.y1) + 0.5);
    c.moveTo(Math.round(F.x0) + 0.5, F.y0 - 4); c.lineTo(Math.round(F.x0) + 0.5, F.y1); c.stroke();
    if (title) {
      c.font = '600 11px ' + LD.FONT;
      c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillStyle = colors.muted;
      c.fillText(title, F.x1, F.y1 + 4);
    }
  }
  function xTitle() {
    const r = state.run;
    return r.kind === 'half' ? 't / T½' : r.kind === 'sec' ? 't (s)' : T('擲骰次數 n', 'rolls n');
  }
  /** 縱軸刻度：線性時 1、1/2、1/4、1/8、0；對數時每減半一格 */
  function yAxisN(c, F) {
    c.font = '11px ' + LD.FONT;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    const ticks = [];
    if (state.log) { for (let k = 0; Math.pow(2, -k) >= fMin(); k++) ticks.push(k); }
    else ticks.push(0, 1, 2, 3, 'zero');
    let lastY = -1e9;
    ticks.forEach(function (k) {
      const f = k === 'zero' ? 0 : Math.pow(2, -k), y = Math.round(yN(F, f)) + 0.5;
      c.strokeStyle = alpha(colors.text, colors.dark ? 0.11 : 0.1);
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(F.x0, y); c.lineTo(F.x1, y); c.stroke();
      if (Math.abs(y - lastY) < 16 && k !== 'zero') return;
      lastY = y;
      c.fillStyle = alpha(colors.muted, 0.95);
      c.fillText(k === 'zero' ? '0' : k === 0 ? '1' : '1/' + Math.pow(2, k), F.x0 - 5, y);
    });
    c.font = '600 12px ' + LD.FONT;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = colors.muted;
    subText(c, 'N/N', '0', F.x0 - (L.narrow ? 34 : 38), F.y0 - 13);
  }

  function polyline(c, xs, ys, n, mapX, mapY) {
    c.beginPath();
    for (let i = 0; i < n; i++) { const X = mapX(xs[i]), Y = mapY(ys[i]); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }
    c.stroke();
  }
  function fnCurve(c, F, xm, f, x0) {
    c.beginPath();
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const x = (x0 || 0) + (xm - (x0 || 0)) * i / N, X = xPix(F, x, xm), Y = yN(F, f(x));
      if (i) c.lineTo(X, Y); else c.moveTo(X, Y);
    }
    c.stroke();
  }

  /** 舊曲線圖層（只有在舊曲線、範圍、座標改變時才重畫） */
  function buildArchive(F, xm) {
    const r = state.run;
    const key = [state.archive.length, state.archive.length ? state.archive[state.archive.length - 1].span : 0, xm, state.log, r.kind, r.N0, cw, colors.dark, colors.P].join('|');
    if (key === arcKey) return;
    arcKey = key;
    arcLayer.width = cv.width; arcLayer.height = cv.height;
    const c = alc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    c.beginPath(); c.rect(F.x0, F.y0 - 6, F.x1 - F.x0, F.y1 - F.y0 + 6); c.clip();
    c.lineJoin = 'round'; c.lineCap = 'round';
    const list = state.archive.filter(function (a) { return a.kind === r.kind; });
    list.forEach(function (a, j) {
      const age = (list.length - j) / list.length;
      c.strokeStyle = alpha(colors.P, colors.dark ? 0.42 - 0.22 * age : 0.36 - 0.2 * age);
      c.lineWidth = 1.3;
      polyline(c, a.x, a.y, a.x.length, function (x) { return xPix(F, x, xm); }, function (f) { return yN(F, f); });
    });
    c.restore();
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function draw() {
    if (!L || !state.run) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    drawGrid();
    const xm = xMax();
    drawNGraph(xm);
    drawAGraph(xm);
    updateReadout();
    // 播放中每秒最多更新一次；沒在播放（暫停、結束、手動擲骰）時每次重畫都同步，免得摘要停在暫停前一秒的數字、和讀數區不同
    updateCanvasLabel(!state.running);
    srNowTick();
  }

  function drawGrid() {
    const G = L.G, r = state.run, s = r.sim;
    ctx.save();
    roundRect(ctx, G.x, G.y, G.w, G.h, 8); ctx.clip();
    ctx.drawImage(gridLayer, 0, 0, cw, ch);
    // 衰變閃光（純裝飾）：中心亮點很快變小、一圈清楚的細環向外擴張、射出一顆粒子（α 或 β，只是示意）
    const now = performance.now(), c = GG.c;
    const dark = colors.dark;
    const keep = [];
    if (state.fx.length) {
      const ringCol = dark ? shade(colors.flash, 0.2) : shade(colors.flash, -0.1);
      const headCol = dark ? shade(colors.flash, 0.55) : shade(colors.flash, -0.2);
      ctx.lineCap = 'round';
      state.fx.forEach(function (f) {
        const u = (now - f.t0) / FX_DUR;
        if (u >= 1) return;
        keep.push(f);
        if (u < 0) return;
        const p = cellXY(f.i), cx = p[0] + c / 2, cy = p[1] + c / 2;
        const e = 1 - u, ease = 1 - e * e;
        if (dark) {
          const R = Math.min(c * (0.6 + 0.8 * u) + 2, c * (0.42 + 0.45 * u) + 6);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = e * 0.8;
          ctx.drawImage(sprites.glow, cx - R, cy - R, 2 * R, 2 * R);
          ctx.globalCompositeOperation = 'source-over';
        }
        const coreR = Math.max(2.4, c * 0.6) * (1 - 0.55 * ease);
        ctx.globalAlpha = e * e;
        ctx.drawImage(sprites.core, cx - coreR, cy - coreR, 2 * coreR, 2 * coreR);
        const isDie = f.kind === 2 && GG && state.run && state.run.sim.kind === 'dice';
        const ringR = Math.max(c * 0.42, 2.2) + (isDie ? Math.min(5, c * 0.4 + 1) : Math.min(14, c * 0.8 + 5)) * ease;
        ctx.globalAlpha = e * (dark ? 0.85 : 0.9);
        ctx.strokeStyle = ringCol;
        ctx.lineWidth = Math.max(0.7, 1.7 * e);
        ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
        if (c >= 5 && !isDie) {
          const reach = Math.min(1.8 * c, 26) + 4, d0 = c * 0.35 + reach * ease, d1 = c * 0.35 + reach * Math.max(0, ease - 0.4);
          const ux = Math.cos(f.a), uy = Math.sin(f.a);
          ctx.globalAlpha = e * 0.55;
          ctx.strokeStyle = ringCol;
          ctx.lineWidth = Math.max(0.8, c * 0.06);
          ctx.beginPath(); ctx.moveTo(cx + ux * d1, cy + uy * d1); ctx.lineTo(cx + ux * d0, cy + uy * d0); ctx.stroke();
          ctx.globalAlpha = e;
          ctx.fillStyle = headCol;
          ctx.beginPath(); ctx.arc(cx + ux * d0, cy + uy * d0, Math.max(1, c * 0.07), 0, Math.PI * 2); ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    state.fx = keep;
    ctx.restore();

    // 上方標籤列
    const fs = L.narrow ? 11.5 : 12.5;
    ctx.textAlign = 'left';
    let label;
    if (s.kind === 'dice') label = T('桌上的骰子 ', 'Dice left ') + s.nP + ' / ' + r.N0;
    else if (r.half2 != null) label = T('母核 ', 'Parent ') + s.nP + T('　子核 ', '  Daughter ') + s.nD;
    else label = T('未衰變 ', 'Undecayed ') + s.nP + ' / ' + r.N0;
    pill(ctx, label, G.x + 10, G.y + L.band / 2 + 1, colors.text, '600 ' + fs + 'px ' + LD.FONT, 0);
    ctx.textAlign = 'right';
    const tl = s.kind === 'dice' ? T('第 ' + s.t + ' 擲', 'Roll ' + s.t)
      : 't = ' + timeStr(s.t, r.unit) + (r.kind === 'half' ? '  (' + num(s.t / r.half, 2) + ' T½)' : '');
    pill(ctx, tl, G.x + G.w - 10, G.y + L.band / 2 + 1, colors.muted, '600 ' + fs + 'px ' + LD.FONT, 0);
  }

  function drawNGraph(xm) {
    const r = state.run, s = r.sim, F = frameOf(L.NG);
    const map = function (t) { return xPix(F, xOfT(t), xm); };
    xAxis(ctx, F, xm, xTitle());
    yAxisN(ctx, F);
    // 標題
    ctx.textAlign = 'right';
    const ttl = r.kind === 'roll' ? T('剩下的骰子', 'Dice left') : T('剩下的比例', 'Fraction left');
    const ttlBox = pill(ctx, ttl, F.x1, L.NG.y + 12, colors.muted, '600 11.5px ' + LD.FONT, 0);

    buildArchive(F, xm);
    ctx.drawImage(arcLayer, 0, 0, cw, ch);

    ctx.save();
    ctx.beginPath(); ctx.rect(F.x0, F.y0 - 8, F.x1 - F.x0 + 6, F.y1 - F.y0 + 8); ctx.clip();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // 半衰期標記
    const showTheory = state.showTh && (r.kind !== 'sec' || state.mystery.answered);
    if (state.showMk && r.kind !== 'sec') {
      const stepX = r.kind === 'roll' ? DC.DICE_HALF : 1;
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      for (let k = 1; k * stepX <= xm; k++) {
        const X = Math.round(xPix(F, k * stepX, xm)) + 0.5, f = Math.pow(2, -k), Y = yN(F, f);
        ctx.strokeStyle = alpha(colors.accent, 0.35);
        ctx.beginPath(); ctx.moveTo(X, F.y1); ctx.lineTo(X, Y); ctx.lineTo(F.x0, Y); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (let k = 1; k * stepX <= xm; k++) {
        const X = xPix(F, k * stepX, xm), Y = yN(F, Math.pow(2, -k));
        ctx.fillStyle = alpha(colors.accent, 0.75);
        ctx.beginPath(); ctx.arc(X, Y, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 理論曲線
    if (showTheory) {
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.6;
      if (r.kind === 'roll') {
        ctx.strokeStyle = alpha(colors.text, 0.6);
        fnCurve(ctx, F, xm, function (x) { return Math.pow(5 / 6, x); });
      } else if (r.half2 != null) {
        const q = r.half2 / r.half;
        ctx.strokeStyle = alpha(colors.P, 0.9);
        fnCurve(ctx, F, xm, function (x) { return Math.pow(2, -x); });
        ctx.strokeStyle = alpha(colors.D, 0.9);
        fnCurve(ctx, F, xm, function (x) { return DC.bateman(1, 1, q, x).D; }, state.log ? 0.002 : 0);
        ctx.strokeStyle = alpha(colors.S, 0.7);
        fnCurve(ctx, F, xm, function (x) { return DC.bateman(1, 1, q, x).S; }, state.log ? 0.002 : 0);
      } else {
        ctx.strokeStyle = alpha(colors.text, 0.6);
        const sx = r.kind === 'sec' ? 1 / r.half : 1;
        fnCurve(ctx, F, xm, function (x) { return Math.pow(2, -x * sx); });
      }
      ctx.setLineDash([]);
    }
    // 神秘核種：猜測的曲線
    if (r.kind === 'sec') {
      const g = val($('guess'));
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = colors.accent;
      fnCurve(ctx, F, xm, function (x) { return Math.pow(2, -x / g); });
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      pill(ctx, T('猜測 T½ = ', 'Guess T½ = ') + num(g, 2) + ' s', F.x1 - 4, F.y0 + 10, colors.accent, '600 11.5px ' + LD.FONT);
    }

    // 這一輪的實測曲線（管狀雙層線）
    const H = r.hist, n = H.t.length;
    const tube = function (arr, col, w, norm) {
      LD.tube(ctx, function (cc) { for (let i = 0; i < n; i++) { const X = map(H.t[i]), Y = yN(F, arr[i] / norm); if (i) cc.lineTo(X, Y); else cc.moveTo(X, Y); } }, col, w + 0.6);
    };
    if (r.half2 == null && n > 1) {
      // 曲線下方的淡色面積（剩下的比例）
      const ag = ctx.createLinearGradient(0, F.y0, 0, F.y1);
      ag.addColorStop(0, alpha(colors.P, colors.dark ? 0.2 : 0.14));
      ag.addColorStop(1, alpha(colors.P, 0.02));
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.moveTo(map(H.t[0]), F.y1);
      for (let i = 0; i < n; i++) ctx.lineTo(map(H.t[i]), yN(F, H.P[i] / r.N0));
      ctx.lineTo(map(H.t[n - 1]), F.y1);
      ctx.closePath();
      ctx.fill();
    }
    if (r.half2 != null) { tube(H.S, colors.S, 2, r.N0); tube(H.D, colors.D, 2.6, r.N0); }
    tube(H.P, colors.P, 2.8, r.N0);
    // 目前位置：發光的點
    const cx = map(s.t);
    [[s.nP, colors.P]].concat(r.half2 != null ? [[s.nD, colors.D]] : []).forEach(function (q) {
      LD.ball(ctx, cx, yN(F, q[0] / r.N0), L.narrow ? 4.2 : 4.6, q[1], { glow: colors.dark ? 0.55 : 0.3 });
    });
    ctx.restore();

    // 半衰期標記的文字（裁切區外，放在圖框上緣）
    // （橫軸以半衰期為單位時刻度已經是 1、2、3…，只有骰子模式需要另外標出 T½）
    if (state.showMk && r.kind === 'roll') {
      const stepX = DC.DICE_HALF;
      ctx.textAlign = 'center';
      let lastX = -1e9;
      for (let k = 1; k * stepX <= xm; k++) {
        const X = xPix(F, k * stepX, xm);
        if (X - lastX < (L.narrow ? 34 : 38) || X + 18 > ttlBox.x - 4) continue;
        lastX = X;
        pill(ctx, (k === 1 ? '' : k) + 'T½', X, L.NG.y + 12, colors.accent, '600 11px ' + LD.FONT, 0.7);
      }
    }
    // 真實核種：說明一個半衰期是多久
    if (isPreset() || r.kind === 'roll') {
      ctx.textAlign = 'left';
      const txt = r.kind === 'roll' ? 'T½ ≈ 3.80 ' + T('次', 'rolls') : 'T½ = ' + timeStr(r.half, r.unit).trim();
      pill(ctx, txt, F.x0 + 6, F.y1 - 12, colors.muted, '600 11px ' + LD.FONT, 0.8);
    }
  }

  function drawAGraph(xm) {
    const r = state.run, s = r.sim, R = L.AG;
    const F = { x0: R.x + marginL(), x1: R.x + R.w - 12, y0: R.y + 22, y1: R.y + R.h - 24 };
    // 理論活度（每單位時間，或骰子每擲的衰變數）
    const theoryA = function (x) {
      if (r.kind === 'roll') return r.N0 * Math.pow(5 / 6, x - 0.5) / 6;
      const t = r.kind === 'half' ? x * r.half : x;
      return DC.chainActivity(r.N0, r.half, r.half2, t).A;
    };
    const showTheory = state.showTh && (r.kind !== 'sec' || state.mystery.answered);
    // 縱軸範圍：理論最大值（神秘核種只看實測，免得洩漏答案）
    let Amax = 0;
    if (r.kind !== 'sec') for (let i = 0; i <= 60; i++) Amax = Math.max(Amax, theoryA(xm * i / 60));
    const bw = r.binW;
    const complete = Math.floor(s.t / bw + 1e-9);
    for (let b = 0; b < r.bins.length; b++) if (r.bins[b]) Amax = Math.max(Amax, r.bins[b] / bw * (b < complete ? 1 : 0));
    if (!(Amax > 0)) Amax = r.N0 / 4;
    Amax *= 1.12;
    let yA;
    if (state.log) {
      const top = Math.pow(10, Math.ceil(Math.log10(Amax))), bot = top / 1e4;
      yA = function (a) { const v = a > 0 ? Math.log10(a) : Math.log10(bot) - 1; return F.y1 - (Math.max(Math.log10(bot) - 0.1, v) - Math.log10(bot)) / 4 * (F.y1 - F.y0); };
      // 刻度：每 10 倍一格
      ctx.font = '11px ' + LD.FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let e = 0; e <= 4; e++) {
        const a = bot * Math.pow(10, e), y = Math.round(yA(a)) + 0.5;
        ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.11 : 0.1); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(F.x0, y); ctx.lineTo(F.x1, y); ctx.stroke();
        if (e % (F.y1 - F.y0 < 90 ? 2 : 1) === 0) { ctx.fillStyle = alpha(colors.muted, 0.95); ctx.fillText(sciPlain(a), F.x0 - 5, y); }
      }
    } else {
      yA = function (a) { return F.y1 - a / Amax * (F.y1 - F.y0); };
      let st = niceStep(Amax / 3);
      ctx.font = '11px ' + LD.FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let a = 0; a <= Amax; a += st) {
        const y = Math.round(yA(a)) + 0.5;
        ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.11 : 0.1); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(F.x0, y); ctx.lineTo(F.x1, y); ctx.stroke();
        ctx.fillStyle = alpha(colors.muted, 0.95); ctx.fillText(sciPlain(a), F.x0 - 5, y);
      }
    }
    xAxis(ctx, F, xm, null);
    ctx.textAlign = 'right';
    const ttl = r.kind === 'roll' ? T('每擲衰變數', 'Decays per roll') : T('活度 A（次', 'Activity A (decays') + uPer(r.unit) + T('）', ')');
    pill(ctx, ttl, F.x1, R.y + 11, colors.muted, '600 11.5px ' + LD.FONT, 0);

    ctx.save();
    ctx.beginPath(); ctx.rect(F.x0, F.y0 - 6, F.x1 - F.x0 + 4, F.y1 - F.y0 + 6); ctx.clip();
    // 實測長條（最後一個未完成的區間畫淡一點）
    const sx = r.kind === 'half' ? 1 / r.half : 1;
    for (let b = 0; b < r.bins.length; b++) {
      const cnt = r.bins[b] || 0;
      if (!cnt) continue;
      const partial = b >= complete;
      const width = partial ? Math.max(1e-9, s.t - b * bw) : bw;
      const a = cnt / (partial ? Math.max(width, bw * 0.25) : bw);
      const X0 = xPix(F, b * bw * sx, xm) + 0.5, X1 = xPix(F, (b + 1) * bw * sx, xm) - 0.5;
      const Y = yA(a);
      if (Y >= F.y1 - 0.5) continue;
      const g = ctx.createLinearGradient(0, Y, 0, F.y1);
      g.addColorStop(0, alpha(shade(colors.flash, 0.25), partial ? 0.35 : 0.95));
      g.addColorStop(1, alpha(shade(colors.flash, -0.15), partial ? 0.2 : 0.7));
      ctx.fillStyle = g;
      roundRect(ctx, X0, Y, Math.max(1, X1 - X0), F.y1 - Y, Math.min(2.5, (X1 - X0) / 2));
      ctx.fill();
      if (!partial && X1 - X0 > 3) {
        ctx.fillStyle = alpha(shade(colors.flash, 0.6), 0.9);
        ctx.fillRect(X0 + 0.5, Y, Math.max(0.5, X1 - X0 - 1), 1);
        ctx.fillStyle = alpha(shade(colors.flash, 0.5), colors.dark ? 0.35 : 0.45);
        ctx.fillRect(X0 + 1, Y + 1.5, Math.min(2, (X1 - X0) * 0.2), F.y1 - Y - 1.5);
      }
    }
    if (showTheory) {
      ctx.lineJoin = 'round';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = alpha(colors.text, 0.65);
      ctx.beginPath();
      const xs0 = r.kind === 'roll' ? 0.5 : 0; // 骰子：第 n 擲的期望值畫在長條中央 x = n − 0.5
      for (let i = 0; i <= 160; i++) {
        const x = xs0 + (xm - xs0) * i / 160, X = xPix(F, x, xm), Y = yA(theoryA(x));
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.stroke();
      if (r.half2 != null) {
        // 母核、子核各自的活度
        [[function (t) { return DC.chainActivity(r.N0, r.half, r.half2, t).AP; }, colors.P], [function (t) { return DC.chainActivity(r.N0, r.half, r.half2, t).AD; }, colors.D]].forEach(function (q) {
          ctx.strokeStyle = alpha(q[1], 0.85); ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let i = 0; i <= 160; i++) {
            const x = xm * i / 160, X = xPix(F, x, xm), Y = yA(q[0](x * r.half));
            if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
          }
          ctx.stroke();
        });
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  function sciPlain(a) {
    if (a === 0) return '0';
    if (a >= 1e5 || a < 0.01) { const e = Math.floor(Math.log10(a)); const m = a / Math.pow(10, e); return (Math.abs(m - 1) < 1e-9 ? '' : num(m, 1) + '×') + '1e' + e; }
    return a >= 100 ? num(a, 0) : a >= 10 ? num(a, a % 1 ? 1 : 0) : num(a, a % 1 ? (a < 1 ? 2 : 1) : 0);
  }

  // ---------- 讀數 ----------
  let roMode = '';
  function updateReadoutLayout() {
    const r = state.run;
    const key = [r.sim.kind, r.half2 != null, r.kind, state.mystery.answered, window.LabSettings && window.LabSettings.lang].join('|');
    if (key === roMode) return;
    roMode = key;
    const rows = [];
    if (r.sim.kind === 'dice') {
      rows.push(['rN', T('桌上的骰子 N', 'Dice left N')]);
      rows.push(['rn', T('擲骰次數 n', 'Rolls n')]);
      rows.push(['rNth', T('理論 N<sub>0</sub>(5/6)<sup>n</sup>', 'Theory N<sub>0</sub>(5/6)<sup>n</sup>')]);
      rows.push(['rLast', T('這一擲擲出 6 點', 'Sixes on the last roll')]);
      rows.push(['rP', T('每擲的衰變機率 p', 'Chance per roll p')]);
      rows.push(['rT', T('半衰期 <span class="f">ln2 / ln(6/5)</span>', 'Half-life <span class="f">ln2 / ln(6/5)</span>')]);
      rows.push(['rTm', T('實測：剩下一半時是第幾擲', 'Measured: roll when half are gone')]);
      rows.push(['rFit', T('指數擬合的半衰期', 'Half-life from the fit')]);
    } else {
      rows.push(['rN', r.half2 != null ? T('母核 P', 'Parent P') : T('未衰變 N', 'Undecayed N')]);
      if (r.half2 != null) { rows.push(['rD', T('子核 D', 'Daughter D')]); rows.push(['rS', T('穩定核 S', 'Stable S')]); }
      else rows.push(['rS', T('已衰變 N<sub>0</sub> − N', 'Decayed N<sub>0</sub> − N')]);
      rows.push(['rt', T('經過時間 t', 'Elapsed time t')]);
      rows.push(['rT', T('半衰期 T<sub>1/2</sub>', 'Half-life T<sub>1/2</sub>')]);
      rows.push(['rL', T('衰變常數 <span class="f">λ = ln2/T<sub>1/2</sub></span>', 'Decay constant <span class="f">λ = ln2/T<sub>1/2</sub></span>')]);
      rows.push(['rTau', T('平均壽命 <span class="f">τ = 1/λ</span>', 'Mean life <span class="f">τ = 1/λ</span>')]);
      rows.push(['rA', T('活度 A（實測）', 'Activity A (measured)')]);
      rows.push(['rTm', T('實測：N 降到一半的時刻', 'Measured: time when N falls to half')]);
      rows.push(['rFit', T('指數擬合的半衰期', 'Half-life from the fit')]);
      if (r.half2 != null) rows.push(['rDP', T('子核／母核 D/P', 'Daughter / parent D/P')]);
    }
    $('ro').innerHTML = rows.map(function (q) { return '<dt>' + q[1] + '</dt><dd id="' + q[0] + '">—</dd>'; }).join('');
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }

  let fitClock = 0;
  function updateFit() {
    const r = state.run, now = performance.now();
    if (now - fitClock < 250 && !r.ended && state.running) return;
    fitClock = now;
    const s = r.sim;
    if (s.t < r.half * 0.4 || r.hist.t.length < 4) { r.fit = null; return; }
    r.fit = DC.fitExponential(r.hist.t, r.hist.P, 5);
  }

  function updateReadout() {
    const r = state.run, s = r.sim, u = r.unit;
    updateReadoutLayout();
    updateFit();
    const hidden = r.kind === 'sec' && !state.mystery.answered;
    const small = function (t) { return '<small>' + t + '</small>'; };
    if (s.kind === 'dice') {
      setHTML('rN', String(s.nP));
      setHTML('rn', String(s.t));
      setHTML('rNth', num(DC.diceTheory(r.N0, s.t), 1));
      setHTML('rLast', r.lastRoll == null ? '—' : r.lastRoll + small(T('期望值 ', 'expected ') + num((s.nP + r.lastRoll) / 6, 1)));
      setHTML('rP', '1/6' + small('λ = ln(6/5) ≈ 0.182' + T('/次', '/roll')));
      setHTML('rT', '3.80 ' + T('次', 'rolls') + small(T('平均壽命 6 次', 'mean life 6 rolls')));
      setHTML('rTm', r.tHalfMeas == null ? '—' : T('第 ' + r.tHalfMeas + ' 擲', 'roll ' + r.tHalfMeas));
      setHTML('rFit', r.fit ? num(r.fit.halfLife, 2) + ' ' + T('次', 'rolls') : '—');
      return;
    }
    const hl = r.half, lam = Math.LN2 / hl;
    const Nth = DC.theoryN(r.N0, hl, s.t);
    const b = r.half2 != null ? DC.bateman(r.N0, hl, r.half2, s.t) : null;
    setHTML('rN', s.nP + (hidden ? '' : small(T('理論 ', 'theory ') + num(Nth, 1) + (Nth > 0.5 ? T('・比值 ', ' · ratio ') + num(s.nP / Nth, 3) : ''))));
    if (b) {
      setHTML('rD', s.nD + small(T('理論 ', 'theory ') + num(b.D, 1)));
      setHTML('rS', s.nS + small(T('理論 ', 'theory ') + num(b.S, 1)));
    } else setHTML('rS', String(s.nS));
    setHTML('rt', timeStr(s.t, u) + (hidden ? '' : small('= ' + num(s.t / hl, 3) + ' T<sub>1/2</sub>')));
    if (hidden) {
      ['rT', 'rL', 'rTau'].forEach(function (id) { setHTML(id, T('？', '?')); });
    } else {
      setHTML('rT', timeStr(hl, u) + (r.half2 != null ? small(T('子核 ', 'daughter ') + timeStr(r.half2, u)) : ''));
      setHTML('rL', sci(lam, 3) + ' ' + uPer(u) + (r.half2 != null ? small('λ′ = ' + sci(Math.LN2 / r.half2, 3) + ' ' + uPer(u)) : ''));
      setHTML('rTau', timeStr(hl / Math.LN2, u) + small('≈ 1.443 T<sub>1/2</sub>'));
    }
    // 實測活度：最近一個完整區間
    const complete = Math.floor(s.t / r.binW + 1e-9);
    const lastBin = complete - 1;
    let aTxt = '—';
    if (lastBin >= 0) {
      const a = (r.bins[lastBin] || 0) / r.binW;
      const tm = (lastBin + 0.5) * r.binW;
      aTxt = sci(a, 2) + ' ' + uPer(u) + (hidden ? '' : small(T('理論 λN ≈ ', 'theory λN ≈ ') + sci(DC.chainActivity(r.N0, hl, r.half2, tm).A, 2)));
    }
    setHTML('rA', aTxt);
    setHTML('rTm', hidden ? T('？', '?') : r.tHalfMeas == null ? '—' : timeStr(r.tHalfMeas, u) + small(T('誤差 ', 'error ') + num((r.tHalfMeas / hl - 1) * 100, 1) + '%'));
    setHTML('rFit', hidden ? T('？', '?') : r.fit ? timeStr(r.fit.halfLife, u) + small(T('誤差 ', 'error ') + num((r.fit.halfLife / hl - 1) * 100, 1) + '%') : '—');
    if (b) {
      const eq = DC.equilibriumRatio(hl, r.half2);
      setHTML('rDP', (s.nP > 0 ? num(s.nD / s.nP, 3) : '—') + small(eq == null ? T('子核較長命：沒有平衡', 'longer-lived daughter: no equilibrium') : T('暫態平衡值 ', 'equilibrium value ') + num(eq, 3)));
    }
  }

  // ---------- 動畫迴圈 ----------
  let lastT = 0, loopOn = false;
  function frame(tNow) {
    const dtA = Math.min(Math.max(0, (tNow - lastT) / 1000), 1 / 30);
    lastT = tNow;
    const r = state.run;
    if (state.running && !r.ended) {
      if (r.sim.kind === 'dice') {
        r.rollAcc += dtA * state.speed;
        if (r.rollAcc >= ROLL_DT) { r.rollAcc -= ROLL_DT; doRoll(); }
      } else advance(dtA * simRate(), dtA);
    }
    if (!state.running) updateButtons();
    draw();
    if (state.running || state.fx.length) requestAnimationFrame(frame);
    else loopOn = false;
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(frame);
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    const r = state.run;
    const btn = $('play');
    const txt = state.running ? T('暫停', 'Pause') : r && r.ended ? T('再跑一輪', 'Run again') : r && r.sim.t > 0 ? T('繼續', 'Resume') : T('開始', 'Start');
    if (btn.textContent !== txt) btn.textContent = txt;
    $('roll').hidden = state.mode !== 'dice';
  }

  /** 使用者動了任何控制項：這一輪開始算任務 */
  function acted() { if (state.run) state.run.byUser = true; }

  $('play').addEventListener('click', function () {
    acted();
    const r = state.run;
    if (state.running) {
      state.running = false;
      updateButtons();
      emit('pause', snapshot());
      srSay(T('已暫停：', 'Paused: ') + timeText() + T('，', ', ') + countText() + T('。', '.'));
      requestDraw();
      return;
    }
    if (r.ended) { newRun(true); }
    state.running = true;
    if (lastKeepMsg === '') setStatus('');
    updateButtons();
    startLoop();
  });
  $('roll').addEventListener('click', function () {
    acted();
    if (state.run.ended) newRun(true);
    doRoll();
    const rr = state.run;
    if (rr.lastRoll != null) srSay(T('第 ' + rr.sim.t + ' 擲：擲出 6 點的有 ' + rr.lastRoll + ' 顆，桌上還剩 ' + rr.sim.nP + ' 顆。', 'Roll ' + rr.sim.t + ': ' + rr.lastRoll + ' sixes, ' + rr.sim.nP + ' dice left.'));
    if (!state.running) startLoop();
  });
  $('again').addEventListener('click', function () {
    newRun(true);
    state.running = true;
    setStatus(T('新的一輪開始了，舊的曲線變淡保留在圖上。', 'A new run has started; the old curve stays on the graph, faded.'));
    updateButtons();
    startLoop();
  });
  $('reset').addEventListener('click', function () {
    state.archive = [];
    state.running = false;
    newRun(true, false);
    setStatus(T('已全部清除，設定不變。按「開始」重新實驗。', 'Everything is cleared; the settings are kept. Press “Start” to begin again.'));
    if (window.LabMission && state.run) window.LabMission.emit('reset', {});
  });

  // 喇叭按鈕：切換全站音效設定
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
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); updateClickMsg(); }
  });

  // ---------- 控制項 ----------
  function press(group, attr, v) {
    group.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  function startFresh() {
    newRun(true);
    if (!reducedMotion || state.running) state.running = true;
    rebuildGrid();
    updateButtons();
    if (state.running) startLoop();
    requestDraw();
  }
  function updatePanels() {
    const dice = state.mode === 'dice';
    $('modeNuc').setAttribute('aria-pressed', String(!dice));
    $('modeDice').setAttribute('aria-pressed', String(dice));
    $('cardIso').hidden = dice;
    $('cardDice').hidden = !dice;
    $('cardMystery').hidden = !isMystery();
    $('boxCustom').hidden = state.preset !== 'custom';
    $('boxTh2').hidden = !state.chain;
    const chain = half2() != null;
    $('lgD').hidden = !chain;
    $('lgS').innerHTML = '<i class="dot" style="background:var(--muted)"></i>' + (chain ? T('穩定核', 'Stable nucleus') : dice ? T('擲出 6 點而退出', 'Rolled a six (out)') : T('已衰變', 'Decayed'));
    $('lgP').innerHTML = '<i class="dot" style="background:var(--b-modern)"></i>' + (dice ? T('桌上的骰子', 'Die on the table') : chain ? T('母核', 'Parent nucleus') : T('未衰變的原子核', 'Undecayed nucleus'));
    $('stageHint').innerHTML = dice
      ? T('每個方塊是一顆骰子；擲出 6 點（金色閃光）就離開。圖表的縱軸是桌上剩下的比例，橫軸是擲骰次數；變淡的曲線是先前幾輪。長條是每一擲擲出 6 點的骰子數。',
        'Each tile is a die; a die that rolls a six (gold flash) leaves the table. The graph shows the fraction still on the table against the number of rolls; faded curves are earlier runs. The bars show how many sixes each roll produced.')
      : isMystery()
        ? T('半衰期被隱藏了：橫軸改用秒。調整「猜測的 T<sub>1/2</sub>」，讓點線貼合實測曲線。活度長條是每 0.5 s 內平均每秒的衰變次數。',
          'The half-life is hidden, so the time axis is in seconds. Adjust “Your guess” until the dotted curve fits the data. The activity bars are the average decays per second in each 0.5 s.')
        : T('每個小球代表一個原子核。圖表的縱軸是尚未衰變的比例 N/N<sub>0</sub>，橫軸是經過幾個半衰期；變淡的曲線是先前幾輪的結果。活度長條是每 1/4 個半衰期內，平均每單位時間的衰變次數。',
          'Each dot is one nucleus. The graph shows the fraction still undecayed, N/N<sub>0</sub>, against time in half-lives; the faded curves are earlier runs. The activity bars are the average number of decays per unit time in each quarter of a half-life.');
    $('isoInfo').innerHTML = isoInfo();
  }
  function isoInfo() {
    if (state.preset === 'custom') {
      return T('自訂核種：1× 速度下以真實時間播放（模擬 1 秒 = 真實 1 秒）。', 'Custom nuclide: at 1× the simulation runs in real time (1 simulated second = 1 real second).');
    }
    if (state.preset === 'mystery') {
      return T('神秘核種：半衰期介於 2 到 12 秒之間，由你找出來。1× 速度下以真實時間播放。', 'Mystery nuclide: its half-life is somewhere between 2 and 12 s — find it. At 1× it runs in real time.');
    }
    const p = PRESETS[state.preset], nm = T(p.name[0], p.name[1]);
    const scale = p.half / ANIM_HALF;
    let s = '<strong>' + nm + '</strong>' + T('：', ': ') + T(p.decay[0], p.decay[1]) + T(' 衰變', ' decay') + (p.extra ? T(p.extra[0], p.extra[1]) : '') + ' → ' + T(p.into[0], p.into[1]) +
      T('，半衰期 ', ', half-life ') + '<strong>' + timeStr(p.half, p.unit).trim() + '</strong>';
    if (p.half2) s += T('；鎝-99m 的半衰期 ', '; technetium-99m half-life ') + '<strong>' + timeStr(p.half2, p.unit).trim() + '</strong>' + T('，再衰變成幾乎穩定的鎝-99', ', decaying to almost-stable technetium-99');
    s += T('。用途：', '. Use: ') + T(p.use[0], p.use[1]) + T('。', '.') + '<br>' +
      T('時間尺度：1× 速度下，動畫 1 秒 = ', 'Time scale: at 1×, 1 s of animation = ') + timeStr(scale, p.unit).trim() +
      T('（一個半衰期 = 動畫 4 秒）。', ' (one half-life = 4 s of animation).');
    return s;
  }

  $('modeNuc').addEventListener('click', function () { if (state.mode === 'nuclei') return; state.mode = 'nuclei'; updatePanels(); startFresh(); });
  $('modeDice').addEventListener('click', function () { if (state.mode === 'dice') return; state.mode = 'dice'; updatePanels(); startFresh(); });
  $('nSeg').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    const n = +b.getAttribute('data-n');
    press($('nSeg'), 'data-n', n);
    state.N0 = n;
    startFresh();
  });
  $('isoSeg').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    const p = b.getAttribute('data-p');
    if (p === 'mystery') newMystery();
    state.preset = p;
    press($('isoSeg'), 'data-p', p);
    updatePanels();
    startFresh();
  });

  const elTh = $('th'), elTh2 = $('th2'), elSpd = $('spd'), elGuess = $('guess');
  if (window.LabNum) window.LabNum.register(elSpd, {
    toValue: function (p) { return Math.pow(10, p); }, toPos: function (v) { return Math.log10(v); },
    min: 0.1, max: 10, decimals: 2
  });
  function refreshOutputs() {
    $('tho').textContent = fmtSlider(val(elTh), elTh) + ' s';
    $('th2o').textContent = fmtSlider(val(elTh2), elTh2) + ' s';
    const sp = val(elSpd);
    // 只去掉小數點後面的尾零（10 不能變成 1）
    const spTxt = num(sp, sp >= 9.995 ? 0 : 2);
    $('spdo').textContent = (spTxt.indexOf('.') >= 0 ? spTxt.replace(/\.?0+$/, '') : spTxt) + '×';
    $('guesso').textContent = fmtSlider(val(elGuess), elGuess) + ' s';
  }
  elTh.addEventListener('input', function () { refreshOutputs(); state.th = val(elTh); startFresh(); });
  elTh2.addEventListener('input', function () { refreshOutputs(); state.th2 = val(elTh2); startFresh(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.checked; updatePanels(); startFresh(); });
  elSpd.addEventListener('input', function () { refreshOutputs(); state.speed = val(elSpd); acted(); requestDraw(); });
  elGuess.addEventListener('input', function () { refreshOutputs(); acted(); requestDraw(); });
  $('log').addEventListener('change', function (e) { state.log = e.target.checked; acted(); arcKey = ''; requestDraw(); });
  $('showTh').addEventListener('change', function (e) { state.showTh = e.target.checked; requestDraw(); });
  $('showMk').addEventListener('change', function (e) { state.showMk = e.target.checked; requestDraw(); });

  // ---------- 神秘核種 ----------
  function newMystery() {
    state.mystery.T = Math.round((2 + Math.random() * 10) * 100) / 100;
    state.mystery.id++;
    state.mystery.answered = false;
    $('verdict').textContent = '';
    $('verdict').className = 'verdict';
    roMode = '';
  }
  $('newSample').addEventListener('click', function () { newMystery(); startFresh(); });
  $('submit').addEventListener('click', function () {
    acted();
    const r = state.run, g = val(elGuess), Tm = state.mystery.T;
    const err = (g - Tm) / Tm;
    const first = !state.mystery.answered;
    emit('guess', { guess: g, half: Tm, err: err, first: first, span: r.sim.t / Tm, N0: r.N0, t: r.sim.t });
    state.mystery.answered = true;
    roMode = '';
    const v = $('verdict');
    const good = Math.abs(err) <= 0.015;
    v.className = 'verdict ' + (good ? 'good' : 'bad');
    v.innerHTML = (good ? T('太棒了！', 'Excellent! ') : Math.abs(err) <= 0.06 ? T('很接近！', 'Close! ') : T('再試試看。', 'Not quite. ')) +
      T('真實的半衰期是 ', 'The true half-life is ') + num(Tm, 2) + ' s' + T('，你的答案誤差 ', '; your answer is off by ') + num(err * 100, 1) + '%' +
      (first ? '' : T('（這個樣本已經公布答案，換一個樣本再挑戰）', ' (this sample’s answer was already shown — try a new sample)')) + T('。', '.');
    requestDraw();
  });

  // ---------- 無障礙：畫布說明與讀數播報 ----------
  // 畫布沒有可拖曳的物件：role="img"，aria-label 描述目前的畫面（最多每秒更新一次）。
  // 一輪結束寫在看得見的 #status（aria-live）；剩下一半、暫停、手動擲骰、改設定後的新一輪寫進 .sr-only 的 #srSay；
  // 播放中的讀數每 1.5 s 寫進 #srNow。神秘核種不播報任何會洩漏半衰期的數字。
  let sayTimer = 0, sayParamTimer = 0, srNowAt = -1e9, labelAt = -1e9;
  function srSay(msg) {
    const el = $('srSay');
    if (!el || !msg) return;
    clearTimeout(sayTimer);
    el.textContent = '';
    sayTimer = setTimeout(function () { el.textContent = msg; }, 60); // 先清空再寫，同樣的字也會再念一次
  }
  function countText() {
    const r = state.run, s = r.sim;
    if (s.kind === 'dice') return T('桌上還剩 ' + s.nP + ' / ' + r.N0 + ' 顆骰子', s.nP + ' of ' + r.N0 + ' dice left on the table');
    if (r.half2 != null) return T('母核 ' + s.nP + '、子核 ' + s.nD + '、穩定核 ' + s.nS, 'parent ' + s.nP + ', daughter ' + s.nD + ', stable ' + s.nS);
    return T('未衰變 ' + s.nP + ' / ' + r.N0, s.nP + ' of ' + r.N0 + ' undecayed');
  }
  function timeText() {
    const r = state.run, s = r.sim;
    if (s.kind === 'dice') return T('第 ' + s.t + ' 擲', 'roll ' + s.t);
    return 't = ' + timeStr(s.t, r.unit).replace(/\s+/g, ' ') + (r.kind === 'half' ? T('（' + num(s.t / r.half, 2) + ' 個半衰期）', ' (' + num(s.t / r.half, 2) + ' half-lives)') : '');
  }
  function setupText() {
    const r = state.run;
    if (r.sim.kind === 'dice') return T('骰子比喻，' + r.N0 + ' 顆骰子，擲出 6 點就離開', 'dice analogy, ' + r.N0 + ' dice, a die that rolls a six leaves');
    if (r.kind === 'sec') return T('神秘核種（半衰期未知），N0 = ' + r.N0, 'mystery nuclide (unknown half-life), N0 = ' + r.N0);
    const p = PRESETS[r.preset];
    const nm = p && p.name ? T(p.name[0], p.name[1]) : T('自訂核種', 'custom nuclide');
    return nm + T('，N0 = ', ', N0 = ') + r.N0 + T('，半衰期 ', ', half-life ') + timeStr(r.half, r.unit).trim() +
      (r.half2 != null ? T('，子核半衰期 ', ', daughter half-life ') + timeStr(r.half2, r.unit).trim() : '');
  }
  function canvasLabel() {
    const r = state.run;
    const what = r.sim.kind === 'dice' ? T('骰子', 'dice') : T('原子核', 'nuclei');
    return T('放射性衰變模擬畫布（' + setupText() + '）：左邊是' + what + '的方陣，' + countText() + '，' + timeText() + '；右邊是剩下比例 N/N0 對時間的圖與活度長條圖。',
      'Radioactive decay simulation (' + setupText() + '): a grid of ' + what + ', ' + countText() + ', ' + timeText() + '; a graph of the fraction left, N/N0, against time and a bar chart of the activity.');
  }
  function updateCanvasLabel(force) {
    const now = performance.now();
    if (!force && now - labelAt < 1000) return;
    labelAt = now;
    const lab = canvasLabel();
    if (cv.getAttribute('aria-label') !== lab) cv.setAttribute('aria-label', lab);
  }
  function srNowTick() {
    if (!state.running || !state.run || state.run.ended) return;
    const now = performance.now();
    if (now - srNowAt < 1500) return;
    srNowAt = now;
    const el = $('srNow');
    if (el) el.textContent = timeText() + T('，', ', ') + countText();
  }
  function sayHalf() {
    const r = state.run;
    if (r.kind === 'sec') return;
    srSay(r.sim.kind === 'dice'
      ? T('剩下一半了：第 ' + r.tHalfMeas + ' 擲（理論平均約 3.80 擲）。', 'Half are gone: roll ' + r.tHalfMeas + ' (theory: about 3.80 rolls on average).')
      : T('剩下一半了：t = ' + timeStr(r.tHalfMeas, r.unit).trim() + '，半衰期 ' + timeStr(r.half, r.unit).trim() + '。', 'Half are left: t = ' + timeStr(r.tHalfMeas, r.unit).trim() + '; the half-life is ' + timeStr(r.half, r.unit).trim() + '.'));
  }
  function sayNewRun() {
    clearTimeout(sayParamTimer);
    sayParamTimer = setTimeout(function () { srSay(T('新的一輪：', 'New run: ') + setupText() + T('。', '.')); updateCanvasLabel(true); }, 900);
  }
  cv.setAttribute('role', 'img');

  // ---------- 啟動 ----------
  readColors();
  state.th = val(elTh); state.th2 = val(elTh2); state.speed = val(elSpd);
  refreshOutputs();
  updatePanels();
  updateSoundButton();
  newRun(false, false);
  function themeChanged() { readColors(); if (L) { buildBackground(); rebuildGrid(); } arcKey = ''; if (state.run) updateCanvasLabel(true); requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  resize();
  updateButtons();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「開始」讓原子核開始衰變。', 'Reduced motion is on: press “Start” to let the nuclei decay.'));
  if (state.running) startLoop();
})();
