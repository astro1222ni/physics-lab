/* photoelectric.js — 「光電效應」模組的畫面與互動（物理計算在 photoelectric-core.js） */
(function () {
  'use strict';
  const PC = window.PhotoCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const EN = function () { return !!(window.LabSettings && window.LabSettings.lang === 'en'); };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 時間與畫面比例（固定，頁面上有說明） ----------
  const TIME_SCALE = 2.5e7;   // 畫面 1 s = 實際 40 ns
  const SLOW = 0.25;
  const PHOTON_SPEED = 5.5;   // cm／畫面秒（示意，未依比例）
  const PHOTON_RATE = 0.15;   // 每 μW、波長 400 nm 時每畫面秒畫出的光子數；畫出的光子數 ∝ N = P/hf ∝ Pλ
  const G = PC.GEOMETRY;
  const D_CM = G.d * 100, WC_CM = G.Wc * 100, WA_CM = G.Wa * 100;
  const PLATE = 0.13;         // cm：極板厚度（只是畫的）
  const WALL = 2.12;          // cm：玻璃內壁（|y|）
  const RANGES = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000]; // nA：電流表量程

  const state = {
    lambda: 400, Pu: 60, metal: 'Na', V: 1,
    running: !reducedMotion,
    slow: false,
    photons: [], electrons: [], fx: [], photonAcc: 0,
    series: [], colorIdx: 0,
    stops: [],
    sweep: null,
    needle: 0, wirePhase: 0,
    msg: '', msgUntil: 0
  };
  let A = null; // 目前的計算結果（PC.analyze）

  function phi() { return PC.metal(state.metal).phi; }
  function params(V) { return { lambda: state.lambda, phi: phi(), P: state.Pu * 1e-6, V: V == null ? state.V : V }; }
  function recompute() { A = PC.analyze(params()); }
  function metalName(id) { const m = PC.metal(id); return T(m.zh, m.en); }

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-modern', '--b-optics', '--b-mech', '--b-wave', '--b-em']
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
  function shade(c, f) {
    const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  function mix(c1, c2, t) {
    const a = rgbOf(c1), b = rgbOf(c2);
    return 'rgb(' + a.map(function (x, i) { return Math.round(x + (b[i] - x) * t); }).join(',') + ')';
  }
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }
  /** 金屬的顏色（由色彩代號調出來的金屬色調） */
  function metalColor(id) {
    const grey = mix(colors.field, colors.muted, 0.5);
    switch (id) {
      case 'Cs': return mix(colors.equi, grey, 0.25);
      case 'K': return mix(grey, colors['b-optics'], 0.18);
      case 'Na': return mix(grey, colors.equi, 0.12);
      case 'Zn': return mix(grey, colors.neg, 0.3);
      case 'Cu': return mix(colors['b-mech'], colors.pos, 0.25);
      default: return mix(grey, colors.surface, 0.25);
    }
  }
  /** 密立坎圖與擬合表上每種金屬的顏色 */
  function metalPlotColor(id) {
    return { Cs: colors.equi, K: colors['b-optics'], Na: colors.pos, Zn: colors.neg, Cu: colors['b-mech'], Pt: colors.probe }[id] || colors.text;
  }
  /** 波長 → 顏色：可見光用光譜色；紫外線、紅外線看不見，以紫色、暗紅色示意 */
  function lightRGB(L) {
    if (L < 380) return rgbOf(colors['b-optics']);
    if (L > 750) return rgbOf(shade(colors.pos, -0.35));
    let r = 0, g = 0, b = 0;
    if (L < 440) { r = (440 - L) / 60; b = 1; }
    else if (L < 490) { g = (L - 440) / 50; b = 1; }
    else if (L < 510) { g = 1; b = (510 - L) / 20; }
    else if (L < 580) { r = (L - 510) / 70; g = 1; }
    else if (L < 645) { r = 1; g = (645 - L) / 65; }
    else r = 1;
    const k = L < 420 ? 0.45 + 0.55 * (L - 380) / 40 : L > 700 ? 0.45 + 0.55 * (750 - L) / 50 : 1;
    return [r, g, b].map(function (x) { return Math.round(255 * Math.pow(x * k, 0.8)); });
  }
  function lightColor(L, a) { const c = lightRGB(L); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; }
  function invisible(L) { return L < 380 || L > 750; }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, d) { const s = num(v, d); return v > 0 && s !== num(0, d) ? '+' + s : s; }
  /** 科學記號（HTML，用 <sup>） */
  function sci(v, d, unit) {
    if (!(isFinite(v)) || v === 0) return num(0, 0) + (unit ? ' ' + unit : '');
    const e = Math.floor(Math.log10(Math.abs(v)));
    let m = v / Math.pow(10, e);
    let ee = e;
    if (Math.abs(+m.toFixed(d)) >= 10) { m /= 10; ee++; }
    return num(m, d) + ' × 10<sup>' + num(ee, 0) + '</sup>' + (unit ? ' ' + unit : '');
  }
  /** 電流（nA），電流表的解析度 0.001 nA */
  function nA(I) {
    if (PC.isZeroCurrent(I)) return '0.000';
    const x = Math.max(I * 1e9, 0.001);
    return x < 10 ? x.toFixed(3) : x < 100 ? x.toFixed(2) : x.toFixed(1);
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s.replace('-', '−');
  }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const bg = document.createElement('canvas'), bgc = bg.getContext('2d');
  const fg = document.createElement('canvas'), fgc = fg.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, L = null, bgDirty = true;
  let eSprite = null; // 電子的小圖（預先畫好）

  function layout() {
    const narrow = cw < 620;
    const X0 = -1.75, X1 = 3.05, Y0 = -3.4, Y1 = 4.7; // cm：場景範圍
    let k, sw, ox, oy, h, col, energy;
    if (!narrow) {
      h = Math.round(Math.max(440, Math.min(560, cw * 0.6)));
      sw = Math.round(cw * 0.45);
      k = Math.min((h - 24) / (Y1 - Y0), (sw - 12) / (X1 - X0));
      ox = (sw - (X1 - X0) * k) / 2 - X0 * k;
      oy = 12 + Y1 * k;
      col = { x: sw + 10, w: cw - sw - 18 };
      energy = { x: col.x, y: 10, w: col.w, h: 118 };
    } else {
      sw = Math.round(cw * 0.62);
      k = (sw - 6) / (X1 - X0);
      ox = 4 - X0 * k;
      oy = 8 + Y1 * k;
      const sceneH = Math.round(8 + (Y1 - Y0) * k + 6);
      col = { x: sw + 4, w: cw - sw - 8 };
      energy = { x: 6, y: sceneH + 6, w: cw - 12, h: 112 };
      h = energy.y + energy.h + 6;
    }
    const o = { narrow: narrow, k: k, ox: ox, oy: oy, sw: sw, col: col, energy: energy, h: h };
    // 導線的兩列高度
    o.yA = oy + 2.82 * k;
    o.yK = oy + 3.18 * k;
    // 電流表與電源（電流表外框：中心上方 1.1R、下方 1.25R）
    if (!narrow) {
      const top = energy.y + energy.h + 34, bot = o.yA - 26;
      const R = Math.max(40, Math.min(col.w * 0.21, 96, (bot - top) / 2.35));
      o.am = { R: R, cx: col.x + col.w * 0.26, cy: top + 1.1 * R + Math.max(0, (bot - top - 2.35 * R) / 2) };
      const bw = Math.min(col.w * 0.42, 200), bh = Math.min(bw * 0.62, 124);
      o.sup = { x: col.x + col.w * 0.57, y: o.am.cy - bh * 0.55, w: bw, h: bh };
    } else {
      const R = Math.min((col.w - 22) / 2.44, 56);
      o.am = { R: R, cx: col.x + 1.22 * R + 1, cy: o.yA - 22 - R * 1.25 };
      const bw = col.w - 4, bh = Math.min(bw * 0.86, 104);
      o.sup = { x: col.x + 2, y: Math.max(22, o.am.cy - R * 1.1 - 46 - bh), w: bw, h: bh };
    }
    const am = o.am;
    o.amBottom = am.cy + am.R * 1.25;
    o.amL = { x: am.cx - am.R * 0.8, y: o.amBottom };
    o.amR = { x: am.cx + am.R * 0.8, y: o.amBottom };
    o.supA = { x: o.sup.x + o.sup.w * 0.3, y: o.sup.y + o.sup.h };
    o.supK = { x: o.sup.x + o.sup.w * 0.72, y: o.sup.y + o.sup.h };
    // 電子在外電路的路徑：陽極 → 電流表 → 電源 → 陰極（null 表示經過儀器內部）
    const xa = ox + (D_CM + PLATE / 2) * k, xk = ox - PLATE / 2 * k;
    const yBaseA = oy + WA_CM / 2 * k, yBaseK = oy + WC_CM / 2 * k;
    if (!narrow) {
      o.route = [
        [xa, yBaseA], [xa, o.yA], [o.amL.x, o.yA], [o.amL.x, o.amL.y], null,
        [o.amR.x, o.amR.y], [o.amR.x, o.yA], [o.supA.x, o.yA], [o.supA.x, o.supA.y], null,
        [o.supK.x, o.supK.y], [o.supK.x, o.yK], [xk, o.yK], [xk, yBaseK]
      ];
    } else {
      // 窄螢幕：電源在電流表上方，導線沿右側上去
      const xr1 = col.x + col.w - 13, xr2 = col.x + col.w - 4, yS = o.sup.y + o.sup.h;
      o.route = [
        [xa, yBaseA], [xa, o.yA], [o.amL.x, o.yA], [o.amL.x, o.amL.y], null,
        [o.amR.x, o.amR.y], [o.amR.x, o.yA], [xr1, o.yA], [xr1, yS + 14], [o.supA.x, yS + 14], [o.supA.x, yS], null,
        [o.supK.x, yS], [o.supK.x, yS + 6], [xr2, yS + 6], [xr2, o.yK], [xk, o.yK], [xk, yBaseK]
      ];
    }
    // 燈：對準陰極中心
    o.lamp = { x: 1.62, y: 3.62 };
    return o;
  }
  function X(x) { return L.ox + x * L.k; }
  function Y(y) { return L.oy - y * L.k; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.h;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    [bg, fg].forEach(function (c) { c.width = cv.width; c.height = cv.height; });
    buildSprite();
    bgDirty = true;
    draw();
    resizeGraphs();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  const FONT = function (px, w) { return (w || 600) + ' ' + px + 'px system-ui, sans-serif'; };

  /**
   * 帶上下標的文字：parts = [[文字, ''|'sub'|'sup'], …]，畫在 (x, y)（垂直置中），align = 'left'|'center'|'right'。
   * box 為 true 時加半透明圓角底框。傳回寬度。
   */
  function rich(c, parts, x, y, o) {
    o = o || {};
    const size = o.size || 12, weight = o.weight || 600;
    if (typeof parts === 'string') parts = [[parts, '']];
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    const segs = parts.map(function (p) {
      const small = p[1] === 'sub' || p[1] === 'sup';
      c.font = FONT(small ? Math.round(size * 0.74) : size, weight);
      return { t: p[0], f: c.font, w: c.measureText(p[0]).width, dy: p[1] === 'sub' ? size * 0.3 : p[1] === 'sup' ? -size * 0.38 : 0 };
    });
    const w = segs.reduce(function (s, g) { return s + g.w; }, 0);
    let x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    if (o.box) { // 有底框的標籤不超出畫布左右邊緣
      const cwid = c.canvas.width / dpr;
      x0 = Math.max(8, Math.min(cwid - 8 - w, x0));
    }
    if (o.box) {
      const ph = size + 7, pad = 5;
      c.fillStyle = alpha(colors['canvas-bg'], o.boxAlpha == null ? 0.84 : o.boxAlpha);
      roundRect(c, x0 - pad, y - ph / 2, w + 2 * pad, ph, ph / 2);
      c.fill();
      c.strokeStyle = o.border || alpha(colors.muted, colors.dark ? 0.4 : 0.28); c.lineWidth = 1; c.stroke();
    }
    c.fillStyle = o.color || colors.text;
    segs.forEach(function (g) { c.font = g.f; c.fillText(g.t, x0, y + g.dy + 0.5); x0 += g.w; });
    return w;
  }

  // ---------- 預先畫好的電子小圖：drawkit 的立體球＋柔和光暈 ----------
  function buildSprite() {
    const r = Math.max(3, Math.min(4.6, L.k * 0.06));
    const s = Math.ceil((r * 3.2) * 2 * dpr);
    eSprite = document.createElement('canvas');
    eSprite.width = eSprite.height = s;
    const c = eSprite.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = s / dpr / 2;
    const glow = c.createRadialGradient(m, m, r * 0.5, m, m, r * 3.1);
    glow.addColorStop(0, alpha(colors.neg, colors.dark ? 0.62 : 0.4));
    glow.addColorStop(0.45, alpha(colors.neg, colors.dark ? 0.2 : 0.12));
    glow.addColorStop(1, alpha(colors.neg, 0));
    c.fillStyle = glow;
    c.beginPath(); c.arc(m, m, r * 3.1, 0, Math.PI * 2); c.fill();
    D.ball(c, m, m, r, colors.neg, { glow: 0, shadow: false });
    eSprite.r = r;
    eSprite.half = m;
  }

  // ---------- 不變的圖層（參數、主題或大小改變時重畫） ----------
  function buildLayers() {
    bgDirty = false;
    const c = bgc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const edge = shade(base, colors.dark ? -0.35 : -0.05);
    // 場景區：中心亮、四角暗
    const rg = c.createRadialGradient(X(0.6), Y(0.6), L.k * 0.5, X(0.6), Y(0.6), L.k * 6);
    rg.addColorStop(0, colors.dark ? shade(base, 0.035) : base);
    rg.addColorStop(1, edge);
    c.fillStyle = rg;
    roundRect(c, 0, 0, L.sw, L.narrow ? L.energy.y - 4 : ch, 8);
    c.fill();
    // 儀器區（像實驗桌面：上亮下暗）
    const ig = c.createLinearGradient(0, 0, 0, ch);
    ig.addColorStop(0, base); ig.addColorStop(1, edge);
    c.fillStyle = ig;
    if (!L.narrow) { roundRect(c, L.col.x - 4, 0, cw - L.col.x + 4, ch, 8); c.fill(); }
    else {
      roundRect(c, L.col.x - 2, 0, cw - L.col.x + 2, L.energy.y - 4, 8); c.fill();
      roundRect(c, 0, L.energy.y - 2, cw, ch - L.energy.y + 2, 8); c.fill();
    }
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    roundRect(c, 0.5, 0.5, cw - 1, ch - 1, 8); c.stroke();

    drawWires(c);
    drawTubeBack(c);
    drawBeam(c);      // 光束穿過玻璃進到管內，終點在陰極表面
    drawLamp(c);
    drawField(c);
    drawPlates(c);
    drawEnergy(c);
    drawAmmeterFace(c);
    drawSupply(c);
    drawSceneLabels(c);

    // 前景：玻璃的厚度與反光（畫在電子上面，增加立體感）
    const f = fgc;
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.clearRect(0, 0, cw, ch);
    drawGlassFront(f);
  }

  /** 玻璃管外形（cm 座標換成畫面座標） */
  function tubeBox() {
    return { x: X(-0.78), y: Y(2.32), w: (2.6 + (D_CM - 1)) * L.k, h: 4.64 * L.k, r: 0.95 * L.k };
  }
  function envelopePath(c, inset) {
    const b = tubeBox(), i = inset || 0;
    roundRect(c, b.x + i, b.y + i, b.w - 2 * i, b.h - 2 * i, Math.max(0, b.r - i));
  }
  function glassLine(a) { return alpha(colors.dark ? '#ffffff' : colors.field, a); }

  function drawTubeBack(c) {
    const b = tubeBox(), k = L.k;
    const tint = mix(colors['b-modern'], colors['canvas-bg'], colors.dark ? 0.8 : 0.88);
    // 排氣封口：玻璃管頂端的小尖嘴（真空管抽完氣後封起來的地方）
    const nx = b.x + b.w / 2, nw = Math.max(5, 0.15 * k), nh = Math.max(5, 0.2 * k);
    c.fillStyle = shade(tint, colors.dark ? 0.06 : -0.05);
    roundRect(c, nx - nw / 2, b.y - nh, nw, nh + 4, nw / 2); c.fill();
    c.strokeStyle = glassLine(colors.dark ? 0.3 : 0.4); c.lineWidth = 1.2; c.stroke();
    // 玻璃管的投影
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.18) + ')';
    c.shadowBlur = 16; c.shadowOffsetY = 5;
    envelopePath(c);
    c.fillStyle = alpha(colors['canvas-bg'], 0.9);
    c.fill();
    c.restore();
    // 真空的內部：圓柱形的玻璃，兩側（光斜穿玻璃）顏色較濃、左側迎光
    envelopePath(c);
    const g = c.createLinearGradient(b.x, 0, b.x + b.w, 0);
    g.addColorStop(0, shade(tint, -0.12));
    g.addColorStop(0.1, shade(tint, colors.dark ? 0.07 : 0.05));
    g.addColorStop(0.5, tint);
    g.addColorStop(0.86, shade(tint, colors.dark ? -0.08 : -0.03));
    g.addColorStop(1, shade(tint, colors.dark ? -0.24 : -0.14));
    c.fillStyle = g;
    c.fill();
    // 頂部與底部的弧面（看得到玻璃另一側的曲面）
    c.save();
    envelopePath(c); c.clip();
    c.strokeStyle = glassLine(colors.dark ? 0.1 : 0.16); c.lineWidth = 1;
    c.beginPath(); c.ellipse(b.x + b.w / 2, b.y + b.r * 0.62, b.w * 0.42, b.r * 0.28, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.restore();
    // 管座：絕緣的電木底座、與玻璃相接處有一圈金屬套環
    const bx = X(-0.55), bw = (2.15 + D_CM - 1) * k, by = Y(-2.2), bh = 0.42 * k;
    const baseCol = colors.dark ? shade(colors.surface, 0.1) : mix(colors.text, colors.surface, 0.3);
    D.block(c, bx, by, bw, bh, baseCol, { r: 4 });
    const metal = mix(colors.field, colors.muted, 0.4);
    const mg = c.createLinearGradient(0, by - 3, 0, by + 3);
    mg.addColorStop(0, shade(metal, 0.55)); mg.addColorStop(0.5, metal); mg.addColorStop(1, shade(metal, -0.35));
    c.fillStyle = mg;
    roundRect(c, bx + 4, by - 3, bw - 8, 6, 3); c.fill();
    // 「真空」標示
    rich(c, T('真空', 'vacuum'), X(0.5), Y(-2.02), { size: L.narrow ? 9 : 11, weight: 500, color: alpha(colors.muted, 0.9), align: 'center' });
  }

  function drawGlassFront(c) {
    const b = tubeBox(), k = L.k;
    c.save();
    // 玻璃的厚度：外緣較亮的一道、內緣較淡的一道
    envelopePath(c);
    c.lineWidth = 2.2;
    c.strokeStyle = glassLine(colors.dark ? 0.34 : 0.42);
    c.stroke();
    envelopePath(c, 3.2);
    c.lineWidth = 1;
    c.strokeStyle = glassLine(colors.dark ? 0.13 : 0.2);
    c.stroke();
    envelopePath(c);
    c.clip();
    // 左側寬而柔和的反光帶
    const sg = c.createLinearGradient(b.x, 0, b.x + b.w * 0.22, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.45, 'rgba(255,255,255,' + (colors.dark ? 0.07 : 0.24) + ')');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sg;
    c.fillRect(b.x, b.y, b.w * 0.22, b.h);
    // 細的高光
    c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.16 : 0.55) + ')';
    c.lineCap = 'round';
    c.lineWidth = Math.max(3, k * 0.09);
    c.beginPath(); c.moveTo(X(-0.6), Y(1.5)); c.lineTo(X(-0.6), Y(-1.3)); c.stroke();
    c.lineWidth = Math.max(1.5, k * 0.035);
    c.beginPath(); c.moveTo(X(-0.45), Y(1.8)); c.lineTo(X(-0.45), Y(0.6)); c.stroke();
    c.beginPath(); c.arc(X(0.5 + (D_CM - 1) / 2), Y(1.4), 0.8 * k, -Math.PI * 0.42, -Math.PI * 0.2); c.stroke();
    // 右側暗面的反射亮邊
    c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.1 : 0.4) + ')';
    c.lineWidth = Math.max(1, k * 0.022);
    c.beginPath(); c.moveTo(b.x + b.w - 0.13 * k, Y(1.25)); c.lineTo(b.x + b.w - 0.13 * k, Y(-1.05)); c.stroke();
    c.restore();
  }

  /** 金屬極板：橫向明暗（立體）、縱向細髮絲紋、上下倒角 */
  function metalPlate(c, x, y, w, h, col, litRight) {
    const g = c.createLinearGradient(x, 0, x + w, 0);
    if (litRight) {
      g.addColorStop(0, shade(col, -0.42)); g.addColorStop(0.4, shade(col, -0.1));
      g.addColorStop(0.75, col); g.addColorStop(0.93, shade(col, 0.5)); g.addColorStop(1, shade(col, 0.25));
    } else {
      g.addColorStop(0, shade(col, 0.5)); g.addColorStop(0.2, shade(col, 0.2));
      g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.4));
    }
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)';
    c.shadowBlur = 6; c.shadowOffsetX = litRight ? -1.5 : 1.5; c.shadowOffsetY = 2.5;
    c.fillStyle = g;
    roundRect(c, x, y, w, h, 2); c.fill();
    c.restore();
    c.save();
    roundRect(c, x, y, w, h, 2); c.clip();
    // 髮絲紋（沿著極板長邊）
    const n = Math.max(2, Math.round(w / 2.6));
    c.lineWidth = 0.7;
    for (let i = 0; i < n; i++) {
      c.strokeStyle = i % 2 ? 'rgba(255,255,255,' + (colors.dark ? 0.08 : 0.2) + ')' : 'rgba(0,0,0,' + (colors.dark ? 0.16 : 0.08) + ')';
      const xx = x + (i + 0.5) * w / n;
      c.beginPath(); c.moveTo(xx, y + 1); c.lineTo(xx, y + h - 1); c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,' + (colors.dark ? 0.3 : 0.6) + ')'; c.fillRect(x, y, w, 1.2);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, y + h - 1.2, w, 1.2);
    c.restore();
    c.strokeStyle = alpha(shade(col, -0.55), 0.55); c.lineWidth = 0.8;
    roundRect(c, x + 0.4, y + 0.4, w - 0.8, h - 0.8, 2); c.stroke();
  }

  function drawPlates(c) {
    const k = L.k;
    // 陰極：鍍了金屬的極板，迎光的表面在右側
    const mc = metalColor(state.metal);
    const cx0 = X(-PLATE), cy0 = Y(WC_CM / 2), cwid = PLATE * k, chei = WC_CM * k;
    metalPlate(c, cx0, cy0, cwid, chei, mc, true);
    // 照光區：表面被光照亮（亮度隨功率）
    if (state.Pu > 0) {
      const pa = 0.08 + 0.3 * state.Pu / 100;
      c.save();
      if (colors.dark) c.globalCompositeOperation = 'lighter';
      const lg = c.createRadialGradient(X(0), Y(0), 1, X(0), Y(0), WC_CM / 2 * k);
      lg.addColorStop(0, lightColor(state.lambda, pa));
      lg.addColorStop(1, lightColor(state.lambda, 0));
      c.fillStyle = lg;
      c.fillRect(X(0) - 2, cy0, WC_CM * 0.5 * k, chei);
      // 表面本身的亮邊
      const sg = c.createLinearGradient(0, cy0, 0, cy0 + chei);
      sg.addColorStop(0, lightColor(state.lambda, 0));
      sg.addColorStop(0.5, lightColor(state.lambda, Math.min(0.9, 0.25 + 0.6 * state.Pu / 100)));
      sg.addColorStop(1, lightColor(state.lambda, 0));
      c.fillStyle = sg;
      c.fillRect(X(0) - 1.6, cy0 + 1, 2.2, chei - 2);
      c.restore();
    }
    // 陽極：鎳色金屬板，迎向陰極的一面在左側
    const am = mix(colors.field, colors.muted, 0.45);
    const ax0 = X(D_CM), ay0 = Y(WA_CM / 2), aw = PLATE * k, ah = WA_CM * k;
    metalPlate(c, ax0, ay0, aw, ah, am, false);
    // 引線（穿過管座）
    [[X(-PLATE / 2), Y(-WC_CM / 2)], [X(D_CM + PLATE / 2), Y(-WA_CM / 2)]].forEach(function (p) {
      D.tube(c, function (cc) { cc.moveTo(p[0], p[1]); cc.lineTo(p[0], Y(-2.2)); }, shade(am, -0.05), 2.8);
    });
    // 極板的正負號（依電壓方向）
    if (Math.abs(state.V) > 0.004) {
      const plusA = state.V > 0;
      const sz = Math.max(11, Math.min(15, k * 0.22));
      const sA = plusA ? '+' : '−', sK = plusA ? '−' : '+';
      const colA = plusA ? colors.pos : colors.neg, colK = plusA ? colors.neg : colors.pos;
      [0.9, 0, -0.9].forEach(function (yy) {
        rich(c, sA, X(D_CM + PLATE) + 9, Y(yy), { size: sz, weight: 800, color: colA, align: 'center' });
      });
      [0.45, -0.45].forEach(function (yy) {
        rich(c, sK, X(-PLATE) - 8, Y(yy), { size: sz, weight: 800, color: colK, align: 'center' });
      });
    }
  }

  function drawField(c) {
    const V = state.V;
    if (Math.abs(V) < 0.004) return;
    const a = 0.16 + 0.5 * Math.min(1, Math.abs(V) / 5);
    const dir = V > 0 ? -1 : 1; // 電場由高電位指向低電位
    c.save();
    c.globalAlpha = Math.min(1, a + 0.12);
    [1.15, 0.35, -0.35, -1.15].forEach(function (yy) {
      const x0 = X(0.5 * D_CM - dir * 0.26 * D_CM), x1 = X(0.5 * D_CM + dir * 0.26 * D_CM), y = Y(yy);
      D.arrow(c, x0, y, x1, y, colors.field, 1.7);
    });
    c.restore();
    rich(c, 'E', X(0.5 * D_CM), Y(1.15) - 11, { size: 12, weight: 700, color: alpha(colors.field, Math.min(1, a + 0.3)), align: 'center' });
  }

  /** 燈的位置與方向（指向陰極中心） */
  function lampGeom() {
    const lx = X(L.lamp.x), ly = Y(L.lamp.y);
    const tx = X(0), ty = Y(0);
    const ang = Math.atan2(ty - ly, tx - lx);
    return { x: lx, y: ly, ang: ang, ux: Math.cos(ang), uy: Math.sin(ang), half: 0.2 * L.k };
  }
  function drawLamp(c) {
    const g = lampGeom(), k = L.k;
    const on = state.Pu > 0;
    c.save();
    c.translate(g.x, g.y);
    c.rotate(g.ang);
    // 燈罩（圓柱形金屬外殼）
    const len = 0.95 * k, rad = 0.36 * k;
    const body = mix(colors.field, colors.muted, 0.35);
    const cyl = function (col) {
      const gr = c.createLinearGradient(0, -rad, 0, rad);
      gr.addColorStop(0, shade(col, 0.5)); gr.addColorStop(0.3, shade(col, 0.12)); gr.addColorStop(0.62, col); gr.addColorStop(1, shade(col, -0.45));
      return gr;
    };
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.22) + ')';
    c.shadowBlur = 10; c.shadowOffsetY = 3;
    c.fillStyle = cyl(body);
    roundRect(c, -len, -rad, len, rad * 2, rad * 0.35); c.fill();
    c.shadowColor = 'transparent';
    // 後蓋（較暗）
    c.fillStyle = cyl(shade(body, -0.3));
    roundRect(c, -len, -rad, len * 0.14, rad * 2, rad * 0.35); c.fill();
    // 散熱紋
    c.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const x = -len + 0.08 * len + i * len * 0.14;
      c.strokeStyle = alpha(shade(body, -0.55), 0.55);
      c.beginPath(); c.moveTo(x, -rad + 3); c.lineTo(x, rad - 3); c.stroke();
      c.strokeStyle = alpha(shade(body, 0.6), 0.45);
      c.beginPath(); c.moveTo(x + 1, -rad + 3); c.lineTo(x + 1, rad - 3); c.stroke();
    }
    // 前緣的金屬圈
    const ring = mix(colors.field, colors.surface, colors.dark ? 0.1 : 0.35);
    c.fillStyle = cyl(ring);
    roundRect(c, -0.16 * k, -rad * 1.06, 0.16 * k, rad * 2.12, rad * 0.22); c.fill();
    // 透鏡（發光）
    const lr = c.createRadialGradient(-2, 0, 1, -2, 0, rad * 1.1);
    lr.addColorStop(0, on ? 'rgba(255,255,255,0.95)' : alpha(colors.muted, 0.6));
    lr.addColorStop(0.45, on ? lightColor(state.lambda, 0.9) : alpha(colors.muted, 0.5));
    lr.addColorStop(1, on ? lightColor(state.lambda, 0.35) : alpha(colors.muted, 0.3));
    c.fillStyle = lr;
    c.beginPath(); c.ellipse(0, 0, rad * 0.32, rad * 0.88, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = shade(body, -0.3); c.lineWidth = 1.5; c.stroke();
    // 透鏡上的反光
    c.strokeStyle = 'rgba(255,255,255,' + (on ? 0.7 : 0.5) + ')'; c.lineWidth = 1.2; c.lineCap = 'round';
    c.beginPath(); c.ellipse(0, 0, rad * 0.2, rad * 0.66, 0, Math.PI * 1.15, Math.PI * 1.45); c.stroke();
    c.restore();
    // 光暈
    if (on) {
      const hr = (0.5 + 0.6 * state.Pu / 100) * k;
      c.save();
      if (colors.dark) c.globalCompositeOperation = 'lighter';
      const halo = c.createRadialGradient(g.x, g.y, 1, g.x, g.y, hr);
      halo.addColorStop(0, lightColor(state.lambda, (colors.dark ? 0.35 : 0.22) * (0.3 + state.Pu / 100)));
      halo.addColorStop(1, lightColor(state.lambda, 0));
      c.fillStyle = halo;
      c.beginPath(); c.arc(g.x, g.y, hr, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }
  /** 光束：中間亮、邊緣柔和的三層；深色模式用加色混合，像真的光 */
  function drawBeam(c) {
    if (!(state.Pu > 0)) return;
    const g = lampGeom();
    const nx = -g.uy, ny = g.ux;
    const p1 = [g.x + nx * g.half, g.y + ny * g.half], p2 = [g.x - nx * g.half, g.y - ny * g.half];
    const t1 = [X(0), Y(WC_CM / 2 - 0.05)], t2 = [X(0), Y(-WC_CM / 2 + 0.05)];
    const inv = invisible(state.lambda);
    const a = (inv ? 0.05 : 0.08) + (inv ? 0.12 : 0.26) * state.Pu / 100;
    // 哪一邊對應陰極的上緣：取距離較近的配對，避免光束交叉
    const d1 = Math.hypot(p1[0] - t1[0], p1[1] - t1[1]) + Math.hypot(p2[0] - t2[0], p2[1] - t2[1]);
    const d2 = Math.hypot(p1[0] - t2[0], p1[1] - t2[1]) + Math.hypot(p2[0] - t1[0], p2[1] - t1[1]);
    const A1 = d1 < d2 ? t1 : t2, A2 = d1 < d2 ? t2 : t1;
    const mx = (A1[0] + A2[0]) / 2, my = (A1[1] + A2[1]) / 2;
    c.save();
    if (colors.dark) c.globalCompositeOperation = 'lighter';
    [[1, 0.5], [0.66, 0.42], [0.32, 0.45]].forEach(function (ly) {
      const s = ly[0], f = ly[1];
      const gr = c.createLinearGradient(g.x, g.y, mx, my);
      gr.addColorStop(0, lightColor(state.lambda, a * f * (colors.dark ? 1.1 : 1)));
      gr.addColorStop(1, lightColor(state.lambda, a * f * 0.55));
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(g.x + (p1[0] - g.x) * s, g.y + (p1[1] - g.y) * s);
      c.lineTo(mx + (A1[0] - mx) * s, my + (A1[1] - my) * s);
      c.lineTo(mx + (A2[0] - mx) * s, my + (A2[1] - my) * s);
      c.lineTo(g.x + (p2[0] - g.x) * s, g.y + (p2[1] - g.y) * s);
      c.closePath();
      c.fill();
    });
    c.restore();
    if (inv) {
      c.setLineDash([4, 5]);
      c.strokeStyle = lightColor(state.lambda, 0.55);
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(A1[0], A1[1]); c.moveTo(p2[0], p2[1]); c.lineTo(A2[0], A2[1]); c.stroke();
      c.setLineDash([]);
    }
  }

  function drawSceneLabels(c) {
    const k = L.k, sz = L.narrow ? 11 : 12;
    const g = lampGeom();
    // 光源標籤
    const lname = state.lambda < 380 ? T('紫外線', 'UV') : state.lambda > 750 ? T('紅外線', 'IR') : T('可見光', 'visible');
    const lx = g.x - 0.45 * k;
    rich(c, 'λ = ' + fmtSlider(state.lambda, $('lam')) + ' nm', lx, Y(L.lamp.y + 0.55), { size: sz, color: colors.text, align: 'right', box: true });
    rich(c, lname + (invisible(state.lambda) ? T('（看不見，示意色）', L.narrow ? ' (invisible)' : ' (invisible; shown in colour)') : ''), lx, Y(L.lamp.y + 0.55) + sz + 8,
      { size: L.narrow ? 10 : 11, weight: 500, color: colors.muted, align: 'right', box: true, boxAlpha: 0.7 });
    // 陰極、陽極
    const m = PC.metal(state.metal);
    // 標籤放在玻璃管外，用細線指向極板
    const lead = function (x0, y0, x1, y1) {
      c.strokeStyle = alpha(colors.muted, 0.7); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.fillStyle = alpha(colors.muted, 0.9); c.beginPath(); c.arc(x1, y1, 2, 0, Math.PI * 2); c.fill();
    };
    const kx = X(-1.2), ky = Y(0.95);
    lead(kx + 4, ky + sz * 0.6, X(-PLATE) - 1, Y(0.5));
    rich(c, T('陰極', 'Cathode'), kx, ky, { size: sz, color: colors.text, align: 'center', box: true });
    rich(c, m.id, kx, ky + sz + 8, { size: sz, weight: 700, color: metalPlotColor(state.metal), align: 'center', box: true, boxAlpha: 0.75 });
    const ax = X(2.32), ay = Y(-0.95);
    lead(ax - 4, ay - sz * 0.5, X(D_CM + PLATE) + 1, Y(-0.55));
    rich(c, T('陽極', 'Anode'), ax, ay, { size: sz, color: colors.text, align: 'center', box: true });
    // 加速／減速
    const V = state.V;
    const word = Math.abs(V) < 0.004 ? T('V = 0：沒有電場', 'V = 0: no field') : V > 0 ? T('加速電場', 'accelerating') : T('減速電場', 'retarding');
    rich(c, word, X(0.5 * D_CM), Y(-1.5), { size: L.narrow ? 9 : 11, weight: 600, color: V < 0 ? colors.pos : colors.muted, align: 'center', box: true, boxAlpha: 0.75 });
    // 比例說明
    const sx = 8, sy = Y(-3.25) + 0;
    if (!L.narrow) rich(c, T('畫面 1 s = 實際 40 ns', '1 s on screen = 40 ns'), sx + 4, Math.min(sy, ch - 12), { size: 11, weight: 500, color: colors.muted, box: true, boxAlpha: 0.7 });
  }

  // ---------- 導線（轉角畫成圓角；連接關係不變） ----------
  /** 外電路的每一段連續路線（route 中 null 隔開）轉成圓角折線的取樣點 */
  function routePolys() {
    if (L.polys) return L.polys;
    const pieces = [];
    let piece = [];
    L.route.forEach(function (p) {
      if (!p) { if (piece.length > 1) pieces.push(piece); piece = []; } else piece.push(p);
    });
    if (piece.length > 1) pieces.push(piece);
    L.polys = pieces.map(function (pts) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1], b = pts[i], n = pts[i + 1];
        const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(n[0] - b[0], n[1] - b[1]);
        const r = Math.min(Math.max(4, L.k * 0.12), 12, l1 * 0.45, l2 * 0.45);
        if (!(r >= 1.5)) { out.push(b); continue; }
        const s = [b[0] - (b[0] - a[0]) / l1 * r, b[1] - (b[1] - a[1]) / l1 * r];
        const e = [b[0] + (n[0] - b[0]) / l2 * r, b[1] + (n[1] - b[1]) / l2 * r];
        for (let j = 0; j <= 6; j++) {
          const t = j / 6, mt = 1 - t;
          out.push([mt * mt * s[0] + 2 * mt * t * b[0] + t * t * e[0], mt * mt * s[1] + 2 * mt * t * b[1] + t * t * e[1]]);
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    });
    return L.polys;
  }
  function drawWires(c) {
    const polys = routePolys();
    const w = Math.max(2.4, L.k * 0.05);
    const base = mix(colors.field, colors.muted, 0.3);
    const path = function (cc) { polys.forEach(function (P) { P.forEach(function (p, i) { if (i) cc.lineTo(p[0], p[1]); else cc.moveTo(p[0], p[1]); }); }); };
    c.save();
    c.translate(0.8, 1.6);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = colors.dark ? 'rgba(0,0,0,0.4)' : alpha(colors.text, 0.12);
    c.lineWidth = w + 2;
    c.beginPath(); path(c); c.stroke();
    c.restore();
    D.tube(c, path, base, w + 1.6);
  }
  /** 導線上的電子流（小點的速率 ∝ 電流；方向：陽極 → 電流表 → 電源 → 陰極） */
  function drawWireFlow() {
    if (!A || !(A.I > 0) || A.zero) return;
    const spacing = 16, r = Math.max(1.6, Math.min(2, L.k * 0.026));
    let acc = 0;
    ctx.fillStyle = alpha(colors.neg, colors.dark ? 0.9 : 0.8);
    routePolys().forEach(function (P) {
      for (let i = 1; i < P.length; i++) {
        const s0 = P[i - 1], s1 = P[i];
        const dx = s1[0] - s0[0], dy = s1[1] - s0[1], len = Math.hypot(dx, dy);
        if (len < 0.01) continue;
        let d = ((state.wirePhase - acc) % spacing + spacing) % spacing;
        for (; d < len; d += spacing) { ctx.beginPath(); ctx.arc(s0[0] + dx * d / len, s0[1] + dy * d / len, r, 0, Math.PI * 2); ctx.fill(); }
        acc += len;
      }
    });
  }

  // ---------- 電流表 ----------
  function meterRange() {
    const Is = A ? A.Isat * 1e9 : 0;
    return RANGES.find(function (r) { return r >= Is * 1.0000001; }) || RANGES[RANGES.length - 1];
  }
  const NEEDLE_SPAN = 1.6; // rad：指針全幅（左右各一半）
  /** 電流表的幾何：外框、錶窗、指針轉軸 */
  function meterGeom() {
    const m = L.am, R = m.R;
    return {
      R: R, cx: m.cx,
      box: { x: m.cx - R * 1.22, y: m.cy - R * 1.1, w: R * 2.44, h: R * 2.35 },
      win: { x: m.cx - R * 1.06, y: m.cy - R * 0.98, w: R * 2.12, h: R * 1.3 },
      px: m.cx, py: m.cy + R * 0.22,      // 轉軸
      r0: R * 0.98                        // 刻度半徑
    };
  }
  function meterAngle(u) { return -Math.PI / 2 - NEEDLE_SPAN / 2 + NEEDLE_SPAN * u; }
  /** 儀器外殼上的一字螺絲 */
  function screw(c, x, y, r, rot) {
    const met = mix(colors.field, colors.surface, colors.dark ? 0.1 : 0.4);
    const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.3, x, y, r);
    g.addColorStop(0, shade(met, 0.6)); g.addColorStop(1, shade(met, -0.35));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = alpha(shade(met, -0.6), 0.8); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x - r * 0.7 * Math.cos(rot), y - r * 0.7 * Math.sin(rot)); c.lineTo(x + r * 0.7 * Math.cos(rot), y + r * 0.7 * Math.sin(rot)); c.stroke();
  }
  function drawAmmeterFace(c) {
    const g = meterGeom(), R = g.R, b = g.box, w = g.win;
    const body = mix(colors.surface, colors.field, colors.dark ? 0.15 : 0.08);
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.2) + ')'; c.shadowBlur = 12; c.shadowOffsetY = 4;
    const gr = c.createLinearGradient(0, b.y, 0, b.y + b.h);
    gr.addColorStop(0, shade(body, colors.dark ? 0.08 : 0.4)); gr.addColorStop(1, shade(body, colors.dark ? -0.25 : -0.1));
    c.fillStyle = gr;
    roundRect(c, b.x, b.y, b.w, b.h, 10); c.fill();
    c.restore();
    c.strokeStyle = alpha(colors.text, 0.15); c.lineWidth = 1;
    roundRect(c, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 10); c.stroke();
    c.fillStyle = 'rgba(255,255,255,' + (colors.dark ? 0.08 : 0.6) + ')';
    c.fillRect(b.x + 8, b.y + 1, b.w - 16, 1);
    const sr = Math.max(2.4, Math.min(3.6, R * 0.05));
    [[b.x + 7, b.y + b.h - 7, 0.5], [b.x + b.w - 7, b.y + b.h - 7, 2.2], [b.x + b.w - 7, b.y + 7, 1.1]].forEach(function (p) { screw(c, p[0], p[1], sr, p[2]); });
    // 錶窗（內陰影）
    c.save();
    roundRect(c, w.x, w.y, w.w, w.h, 6); c.clip();
    const face = c.createLinearGradient(0, w.y, 0, w.y + w.h);
    face.addColorStop(0, colors.dark ? shade(colors['canvas-bg'], 0.12) : '#ffffff');
    face.addColorStop(1, colors.dark ? shade(colors['canvas-bg'], 0.03) : shade(colors['canvas-bg'], -0.05));
    c.fillStyle = face;
    c.fillRect(w.x, w.y, w.w, w.h);
    const ins = c.createLinearGradient(0, w.y, 0, w.y + 9);
    ins.addColorStop(0, 'rgba(0,0,0,' + (colors.dark ? 0.38 : 0.14) + ')'); ins.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ins; c.fillRect(w.x, w.y, w.w, 9);
    // 刻度
    const rng = meterRange();
    c.lineCap = 'round';
    c.strokeStyle = alpha(colors.accent, 0.45); c.lineWidth = 2.5;
    c.beginPath(); c.arc(g.px, g.py, g.r0, meterAngle(0), meterAngle(1)); c.stroke();
    // 防視差的鏡面弧帶
    c.strokeStyle = alpha(mix(colors.field, '#ffffff', colors.dark ? 0.1 : 0.55), colors.dark ? 0.35 : 0.8); c.lineWidth = 2.6;
    c.beginPath(); c.arc(g.px, g.py, g.r0 * 0.79, meterAngle(0.04), meterAngle(0.96)); c.stroke();
    c.strokeStyle = alpha(colors.text, 0.75);
    for (let i = 0; i <= 20; i++) {
      const a = meterAngle(i / 20);
      const len = i % 10 === 0 ? 0.16 : i % 2 === 0 ? 0.1 : 0.055;
      c.lineWidth = i % 10 === 0 ? 1.6 : 1;
      c.beginPath();
      c.moveTo(g.px + Math.cos(a) * g.r0, g.py + Math.sin(a) * g.r0);
      c.lineTo(g.px + Math.cos(a) * g.r0 * (1 - len), g.py + Math.sin(a) * g.r0 * (1 - len));
      c.stroke();
    }
    const fs = Math.max(9, Math.min(12, R * 0.15));
    [0, 0.5, 1].forEach(function (u) {
      const a = meterAngle(u), v = rng * u;
      rich(c, v === 0 ? '0' : String(+v.toPrecision(3)), g.px + Math.cos(a) * g.r0 * 0.66, g.py + Math.sin(a) * g.r0 * 0.66 + 2, { size: fs, weight: 600, color: colors.muted, align: 'center' });
    });
    rich(c, 'nA', w.x + w.w - 6, w.y + w.h - 9, { size: fs, weight: 700, color: colors.text, align: 'right' });
    c.restore();
    c.strokeStyle = alpha(colors.text, 0.22); c.lineWidth = 1;
    roundRect(c, w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1, 6); c.stroke();
    rich(c, 'A', b.x + 11, b.y + 12, { size: Math.max(11, fs + 1), weight: 800, color: colors.accent, align: 'center' });
    // 端子
    [L.amL, L.amR].forEach(function (p, i) { D.ball(c, p.x, p.y, 5.5, i === 0 ? colors.neg : colors.pos, { glow: 0 }); });
    rich(c, T('電流表', 'Ammeter'), g.cx, b.y - 10, { size: L.narrow ? 10 : 11, weight: 600, color: colors.muted, align: 'center' });
  }
  function drawNeedle() {
    const g = meterGeom(), R = g.R;
    const rng = meterRange();
    const target = A ? Math.min(1.04, A.I * 1e9 / rng) : 0;
    const a = meterAngle(Math.max(-0.02, state.needle));
    const len = g.r0 * 0.94;
    ctx.save();
    ctx.beginPath(); const w = g.win; roundRect(ctx, w.x, w.y, w.w, w.h, 6); ctx.clip();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(g.px + 1.5, g.py + 2); ctx.lineTo(g.px + 1.5 + Math.cos(a) * len, g.py + 2 + Math.sin(a) * len); ctx.stroke();
    ctx.strokeStyle = colors.pos; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(g.px, g.py); ctx.lineTo(g.px + Math.cos(a) * len, g.py + Math.sin(a) * len); ctx.stroke();
    D.ball(ctx, g.px, g.py, 5.5, colors.field, { glow: 0 });
    // 錶窗玻璃的斜向反光
    const gl = ctx.createLinearGradient(w.x, w.y, w.x + w.w * 0.6, w.y + w.h);
    gl.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.08 : 0.4) + ')');
    gl.addColorStop(0.42, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.restore();
    // 數字讀數
    const fs = Math.max(11, Math.min(15, R * 0.19));
    const yR = g.win.y + g.win.h + (g.box.y + g.box.h - g.win.y - g.win.h) * 0.42;
    rich(ctx, nA(A ? A.I : 0) + ' nA', g.cx, yR, { size: fs, weight: 700, color: colors.text, align: 'center' });
    rich(ctx, T('量程 ', 'range ') + rng + ' nA', g.cx, yR + fs * 0.5 + 8, { size: Math.max(9, fs - 4), weight: 500, color: colors.muted, align: 'center' });
    return target;
  }

  // ---------- 電源 ----------
  function drawSupply(c) {
    const s = L.sup;
    const body = mix(colors.surface, colors['b-modern'], colors.dark ? 0.12 : 0.08);
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.2) + ')'; c.shadowBlur = 12; c.shadowOffsetY = 4;
    const gr = c.createLinearGradient(0, s.y, 0, s.y + s.h);
    gr.addColorStop(0, shade(body, colors.dark ? 0.1 : 0.45)); gr.addColorStop(1, shade(body, colors.dark ? -0.25 : -0.1));
    c.fillStyle = gr;
    roundRect(c, s.x, s.y, s.w, s.h, 8); c.fill();
    c.restore();
    c.strokeStyle = alpha(colors.text, 0.15); c.lineWidth = 1;
    roundRect(c, s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1, 8); c.stroke();
    c.fillStyle = 'rgba(255,255,255,' + (colors.dark ? 0.08 : 0.6) + ')';
    c.fillRect(s.x + 6, s.y + 1, s.w - 12, 1);
    // 液晶顯示（凹進去）
    const lw = s.w * 0.84, lh = Math.min(s.h * 0.36, 34), lx = s.x + (s.w - lw) / 2, ly = s.y + s.h * 0.2;
    c.fillStyle = shade(colors.field, colors.dark ? -0.86 : -0.45);
    roundRect(c, lx, ly, lw, lh, 4); c.fill();
    const lin = c.createLinearGradient(0, ly, 0, ly + 6);
    lin.addColorStop(0, 'rgba(0,0,0,0.45)'); lin.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = lin; roundRect(c, lx, ly, lw, lh, 4); c.fill();
    c.strokeStyle = alpha(colors.probe, 0.25); c.lineWidth = 1; c.stroke();
    // 液晶面板是固定大小的「儀器」，字體不跟著放大（除以字體設定，抵銷 settings.js 的縮放）
    const fsc = (window.LabSettings && window.LabSettings.get('fs')) || 1;
    const fs = Math.min(lh * 0.62, s.w * (L.narrow ? 0.17 : 0.15)) / fsc;
    c.save();
    c.shadowColor = alpha(colors.probe, 0.6); c.shadowBlur = 6;
    rich(c, signed(state.V, 2) + ' V', lx + lw - 6, ly + lh / 2, { size: Math.round(fs), weight: 700, color: shade(colors.probe, colors.dark ? 0.1 : 0.35), align: 'right' });
    c.restore();
    if (!L.narrow) rich(c, [['V', ''], ['AK', 'sub']], lx + 5, ly + lh / 2, { size: Math.max(9, Math.round(fs * 0.6)), weight: 600, color: alpha(colors.probe, 0.75) });
    // 調整電壓的旋鈕（指標的角度跟著 V 轉，−5 V 到 +5 V）
    const kr = Math.max(7, Math.min(12, s.h * 0.1)), kx = s.x + s.w * 0.51, ky = s.y + s.h * 0.69;
    if (ky - kr > ly + lh + 3) {
      const knob = colors.dark ? shade(colors.surface, 0.18) : mix(colors.text, colors.surface, 0.25);
      D.ball(c, kx, ky, kr, knob, { glow: 0 });
      c.strokeStyle = alpha(colors.dark ? '#000000' : '#ffffff', 0.25); c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const t = i / 16 * Math.PI * 2;
        c.moveTo(kx + Math.cos(t) * kr * 0.78, ky + Math.sin(t) * kr * 0.78); c.lineTo(kx + Math.cos(t) * kr * 0.95, ky + Math.sin(t) * kr * 0.95);
      }
      c.stroke();
      const ka = -Math.PI * 1.25 + Math.PI * 1.5 * (state.V + 5) / 10;
      c.strokeStyle = colors.dark ? colors.text : '#ffffff'; c.lineWidth = 1.8; c.lineCap = 'round';
      c.beginPath(); c.moveTo(kx + Math.cos(ka) * kr * 0.25, ky + Math.sin(ka) * kr * 0.25); c.lineTo(kx + Math.cos(ka) * kr * 0.72, ky + Math.sin(ka) * kr * 0.72); c.stroke();
    }
    rich(c, T('可調電源', 'Power supply'), s.x + s.w / 2, s.y - 9, { size: L.narrow ? 10 : 11, weight: 600, color: colors.muted, align: 'center' });
    // 端子：接陽極的一端標示電位高低
    const hiA = state.V >= 0;
    [[L.supA, hiA ? '+' : '−', hiA ? colors.pos : colors.neg, 'A'], [L.supK, hiA ? '−' : '+', hiA ? colors.neg : colors.pos, 'K']].forEach(function (t) {
      const p = t[0];
      D.ball(c, p.x, p.y - 6, 6, t[2], { glow: 0 });
      rich(c, t[1], p.x, p.y - 20, { size: 13, weight: 800, color: t[2], align: 'center' });
      if (!L.narrow) rich(c, T(t[3] === 'A' ? '接陽極' : '接陰極', t[3] === 'A' ? 'to A' : 'to K'), p.x + 10, p.y - 6, { size: 10, weight: 500, color: colors.muted });
    });
  }

  // ---------- 能量關係圖 ----------
  function drawEnergy(c) {
    const R = L.energy;
    c.font = FONT(11, 600);
    const labW = Math.max(c.measureText(T('光子', 'photon')).width, c.measureText(T('電子', 'electron')).width);
    const pad = { l: Math.round(labW + 22), r: 14 };
    const x0 = R.x + pad.l, x1 = R.x + R.w - pad.r;
    const EMAX = 13;
    const xe = function (e) { return x0 + (x1 - x0) * Math.min(e, EMAX) / EMAX; };
    c.strokeStyle = alpha(colors.text, 0.1); c.lineWidth = 1;
    roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8); c.stroke();
    rich(c, [[T('能量：hf = φ + K', 'Energy: hf = φ + K'), ''], ['max', 'sub']], R.x + 10, R.y + 13, { size: 12, weight: 700, color: colors.text });
    const bh = Math.round(Math.min(22, Math.max(16, R.h * 0.15)));
    const by1 = R.y + Math.round(R.h * 0.28), by2 = by1 + bh + Math.round(R.h * 0.13);
    const E = A.EeV, ph = A.phi, K = A.Kmax;
    // 刻度
    c.strokeStyle = alpha(colors.text, 0.1);
    c.beginPath();
    for (let e = 0; e <= EMAX; e++) { const x = Math.round(xe(e)) + 0.5; c.moveTo(x, by1 - 4); c.lineTo(x, by2 + bh + 3); }
    c.stroke();
    for (let e = 0; e <= EMAX; e += (L.narrow ? 4 : 2)) rich(c, String(e), xe(e), by2 + bh + 12, { size: 10, weight: 500, color: colors.muted, align: 'center' });
    rich(c, 'eV', x1, R.y + 13, { size: 10, weight: 600, color: colors.muted, align: 'right' });
    // 第一列：光子能量
    rich(c, T('光子', 'photon'), x0 - 8, by1 + bh / 2, { size: 11, weight: 600, color: colors.muted, align: 'right' });
    const g1 = c.createLinearGradient(0, by1, 0, by1 + bh);
    g1.addColorStop(0, lightColor(state.lambda, 0.95)); g1.addColorStop(1, lightColor(state.lambda, 0.65));
    c.fillStyle = g1;
    roundRect(c, x0, by1, Math.max(2, xe(E) - x0), bh, 4); c.fill();
    c.strokeStyle = alpha(colors.text, 0.25); c.stroke();
    rich(c, 'hf = ' + num(E, 2) + ' eV', Math.min(xe(E) + 6, x1 - 2), by1 + bh / 2, { size: 11, color: colors.text, align: xe(E) + 90 > x1 ? 'right' : 'left', box: xe(E) + 90 > x1, boxAlpha: 0.8 });
    // 第二列：功函數 + 動能
    rich(c, T('電子', 'electron'), x0 - 8, by2 + bh / 2, { size: 11, weight: 600, color: colors.muted, align: 'right' });
    const phW = xe(ph) - x0;
    c.save();
    roundRect(c, x0, by2, phW, bh, 4); c.clip();
    c.fillStyle = alpha(colors.muted, 0.28); c.fillRect(x0, by2, phW, bh);
    c.strokeStyle = alpha(colors.muted, 0.55); c.lineWidth = 1;
    c.beginPath();
    for (let x = x0 - bh; x < x0 + phW; x += 6) { c.moveTo(x, by2 + bh); c.lineTo(x + bh, by2); }
    c.stroke();
    c.restore();
    rich(c, 'φ ' + num(ph, 2), x0 + phW / 2, by2 + bh / 2, { size: 10, weight: 700, color: colors.text, align: 'center', box: true, boxAlpha: 0.7 });
    if (A.emits) {
      const g2 = c.createLinearGradient(0, by2, 0, by2 + bh);
      g2.addColorStop(0, shade(colors.neg, 0.25)); g2.addColorStop(1, shade(colors.neg, -0.15));
      c.fillStyle = g2;
      roundRect(c, xe(ph), by2, Math.max(2, xe(E) - xe(ph)), bh, 4); c.fill();
      // 減速電壓要花掉的能量 e|V|
      if (state.V < 0) {
        const eV = -state.V;
        c.save();
        c.beginPath(); c.rect(xe(ph), by2 - 3, Math.max(1, xe(ph + eV) - xe(ph)), bh + 6); c.clip();
        c.strokeStyle = alpha(colors.pos, 0.9); c.lineWidth = 1.5;
        c.setLineDash([3, 2]);
        roundRect(c, xe(ph) + 0.75, by2 - 2.25, xe(ph + eV) - xe(ph) - 1.5, bh + 4.5, 3); c.stroke();
        c.restore();
        c.setLineDash([]);
      }
      const lab = [['K', ''], ['max', 'sub'], [' = ' + num(K, 2) + ' eV', '']];
      const xl = xe(E) + 6;
      if (xl + 110 < x1) rich(c, lab, xl, by2 + bh / 2, { size: 11, color: colors.neg });
      else rich(c, lab, xe(ph) - 6, by2 + bh / 2 + bh + 2, { size: 11, color: colors.neg, align: 'right', box: true });
      if (state.V < 0) {
        const xv = xe(ph + -state.V);
        rich(c, 'e|V|', Math.min(xv, x1 - 14), by2 - 7, { size: 10, weight: 700, color: colors.pos, align: 'center', box: true, boxAlpha: 0.8 });
      }
    } else {
      rich(c, T('hf < φ：電子出不來', 'hf < φ: no electron escapes'), Math.min(xe(ph) + 6, x1 - 150), by2 + bh / 2, { size: 11, color: colors.pos, box: true });
    }
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }
  function draw() {
    if (!L || !A) return;
    if (bgDirty) buildLayers();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    drawWireFlow();
    drawPhotons();
    drawElectrons();
    drawEffects();
    ctx.drawImage(fg, 0, 0, cw, ch);
    const target = drawNeedle();
    if (!state.running && !state.sweep) state.needle = target;
  }

  // ---------- 光子 ----------
  function spawnPhoton() {
    const g = lampGeom();
    const nx = -g.uy, ny = g.ux;
    const off = (Math.random() * 2 - 1) * g.half * 0.9;
    const sx = g.x + nx * off, sy = g.y + ny * off;
    const y0 = (Math.random() - 0.5) * WC_CM; // cm
    const tx = X(0), ty = Y(y0);
    const dist = Math.hypot(tx - sx, ty - sy) / L.k;
    state.photons.push({ sx: (sx - L.ox) / L.k, sy: (L.oy - sy) / L.k, y0: y0, u: 0, dur: dist / PHOTON_SPEED });
  }
  function drawPhotons() {
    const k = L.k;
    const lw = Math.max(1.4, k * 0.028);
    const wl = Math.max(3.2, Math.min(9, 2.6 + state.lambda / 110)); // 波包的「波長」（示意，隨 λ 變長）
    const col = lightColor(state.lambda, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    state.photons.forEach(function (p) {
      const sx = X(p.sx), sy = Y(p.sy), tx = X(0), ty = Y(p.y0);
      const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const cx = sx + dx * p.u, cy = sy + dy * p.u;
      const half = wl * 1.7, amp = Math.max(2.5, k * 0.05);
      // 光暈
      ctx.strokeStyle = lightColor(state.lambda, colors.dark ? 0.25 : 0.18);
      ctx.lineWidth = lw * 3;
      ctx.beginPath(); ctx.moveTo(cx - ux * half, cy - uy * half); ctx.lineTo(cx + ux * half * 0.6, cy + uy * half * 0.6); ctx.stroke();
      // 高斯包絡的正弦波
      ctx.strokeStyle = colors.dark ? col : shade(col, -0.12);
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i <= 26; i++) {
        const s = -half + 2 * half * i / 26;
        const env = Math.exp(-(s * s) / (half * half * 0.32));
        const w = amp * env * Math.sin(2 * Math.PI * s / wl + p.u * 30);
        const x = cx + ux * s + nx * w, y = cy + uy * s + ny * w;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      if (invisible(state.lambda) && !colors.dark) {
        ctx.strokeStyle = alpha(colors.text, 0.25); ctx.lineWidth = 0.6; ctx.stroke();
      }
    });
  }
  function stepPhotons(dts) {
    const rate = PHOTON_RATE * state.Pu * (state.lambda / 400);
    state.photonAcc += rate * dts;
    let guard = 0;
    while (state.photonAcc >= 1 && guard++ < 20) { state.photonAcc -= 1; spawnPhoton(); }
    if (state.photonAcc > 3) state.photonAcc = 0;
    const keep = [];
    state.photons.forEach(function (p) {
      p.u += dts / p.dur;
      if (p.u < 1) { keep.push(p); return; }
      arrive(p);
    });
    state.photons = keep;
  }
  /** 光子打到陰極：hf > φ 才打出電子（動能在 0 ～ K_max 均勻、方向依餘弦定律） */
  function arrive(p) {
    if (A.emits) {
      const e0 = { y0: p.y0 / 100, K: Math.random() * A.Kmax, s: Math.random() * 2 - 1 };
      state.electrons.push({ st: PC.electronStart(e0), trail: [], age: 0, free: false, fade: 0 });
      if (!reducedMotion) state.fx.push({ type: 'emit', x: 0, y: p.y0, t0: performance.now(), dur: 260 });
    } else if (!reducedMotion) {
      state.fx.push({ type: 'absorb', x: 0, y: p.y0, t0: performance.now(), dur: 320 });
    }
  }

  // ---------- 電子 ----------
  function stepElectrons(dts) {
    const dtReal = dts / TIME_SCALE;
    const a = PC.accelOf(state.V);
    const keep = [];
    state.electrons.forEach(function (e) {
      e.age += dts;
      if (e.free || e.fade > 0) {
        e.st.x += e.st.vx * dtReal; e.st.y += e.st.vy * dtReal;
        e.fade += dts;
      } else {
        const r = PC.stepElectron(e.st, a, dtReal);
        e.st = r.st;
        if (r.event === 'anode') { hitAnode(e); return; }
        if (r.event === 'cathode') e.fade = 0.0001;
        else if (r.event === 'miss') e.free = true;
        else if (Math.abs(e.st.y) * 100 > WALL) e.fade = 0.0001;
        else if (e.age > 9) e.fade = 0.0001;
      }
      e.trail.push([e.st.x * 100, e.st.y * 100]);
      if (e.trail.length > 16) e.trail.shift();
      if (e.fade > 0.45) return;
      if (Math.abs(e.st.y * 100) > WALL + 0.3 || e.st.x * 100 > D_CM + 1.2) return;
      keep.push(e);
    });
    state.electrons = keep;
  }
  function hitAnode(e) {
    if (!reducedMotion) state.fx.push({ type: 'hit', x: D_CM, y: e.st.y * 100, t0: performance.now(), dur: 300 });
    tickSound();
  }
  function drawElectrons() {
    if (!eSprite) return;
    const sp = eSprite, h = sp.half;
    ctx.lineCap = 'round';
    state.electrons.forEach(function (e) {
      const fa = e.fade > 0 ? Math.max(0, 1 - e.fade / 0.45) : 1;
      // 漸淡的拖尾
      const tr = e.trail;
      for (let i = 1; i < tr.length; i++) {
        const u = i / tr.length;
        ctx.strokeStyle = alpha(colors.neg, (0.05 + 0.4 * u * u) * fa);
        ctx.lineWidth = 0.6 + 2 * u;
        ctx.beginPath(); ctx.moveTo(X(tr[i - 1][0]), Y(tr[i - 1][1])); ctx.lineTo(X(tr[i][0]), Y(tr[i][1])); ctx.stroke();
      }
      ctx.globalAlpha = fa;
      ctx.drawImage(sp, X(e.st.x * 100) - h, Y(e.st.y * 100) - h, h * 2, h * 2);
      ctx.globalAlpha = 1;
    });
  }
  function drawEffects() {
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now - f.t0 < f.dur; });
    state.fx.forEach(function (f) {
      const u = (now - f.t0) / f.dur;
      const x = X(f.x), y = Y(f.y);
      if (f.type === 'hit') {
        const r = 2 + 7 * u;
        const gl = ctx.createRadialGradient(x, y, 0, x, y, r);
        gl.addColorStop(0, alpha(colors.neg, 0.75 * (1 - u)));
        gl.addColorStop(1, alpha(colors.neg, 0));
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
      } else if (f.type === 'emit') {
        ctx.fillStyle = lightColor(state.lambda, 0.55 * (1 - u));
        ctx.beginPath(); ctx.arc(x + 1, y, 2 + 6 * u, -Math.PI / 2, Math.PI / 2); ctx.fill();
      } else if (f.type === 'absorb') {
        ctx.fillStyle = alpha(colors['b-mech'], 0.35 * (1 - u));
        ctx.beginPath(); ctx.arc(x + 1, y, 2 + 3 * u, -Math.PI / 2, Math.PI / 2); ctx.fill();
      } else if (f.type === 'record') {
        // 記錄停止電壓：電流表外圈的短暫光環
        ctx.strokeStyle = alpha(colors.accent, 0.8 * (1 - u));
        ctx.lineWidth = 3;
        const b = meterGeom().box; roundRect(ctx, b.x - 6 * u, b.y - 6 * u, b.w + 12 * u, b.h + 12 * u, 10 + 6 * u); ctx.stroke();
      }
    });
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let lastTickAt = -1;
  /** 電子到達陽極：像蓋革計數器的輕「喀」聲（限制頻率，主要頻率在 250 Hz 以上） */
  function tickSound() {
    const S = sound(); if (!S) return;
    const t = performance.now();
    if (t - lastTickAt < 45) return;
    lastTickAt = t;
    S.noise({ dur: 0.012, gain: 0.32, filter: 3400, q: 1.4 });
    S.tone({ freq: 1900, dur: 0.02, type: 'triangle', gain: 0.12 });
  }
  /** 記錄停止電壓：兩聲上升的短音 */
  function recordSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 660, dur: 0.08, type: 'sine', gain: 0.25 });
    S.tone({ freq: 990, dur: 0.12, type: 'sine', gain: 0.22, delay: 0.08 });
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function tick(now) {
    if (!state.running && !state.sweep) { loopOn = false; return; }
    const dt = Math.min((now - lastT) / 1000, 1 / 30);
    lastT = now;
    const dts = dt * (state.slow ? SLOW : 1);
    if (state.sweep) stepSweep(dt);
    if (state.running) {
      stepPhotons(dts);
      stepElectrons(dts);
      // 電流表指針：機械阻尼（約 0.12 s），減少動態效果時直接到位
      const rng = meterRange();
      const target = A ? Math.min(1.04, A.I * 1e9 / rng) : 0;
      state.needle = reducedMotion ? target : state.needle + (target - state.needle) * Math.min(1, dt / 0.12);
      if (A && A.I > 0 && !A.zero) state.wirePhase += dt * 50 * Math.min(1, A.I * 1e9 / rng);
    }
    draw();
    if (state.running || state.sweep) requestAnimationFrame(tick); else loopOn = false;
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  function setStatus(msg, hold) {
    state.msg = msg || '';
    state.msgUntil = hold ? performance.now() + hold : 0;
    $('status').textContent = state.msg;
  }
  /** 依目前狀態給提示（記錄停止電壓的訊息保留幾秒） */
  function autoStatus() {
    if (state.msgUntil && performance.now() < state.msgUntil) return;
    let m = '';
    if (!(state.Pu > 0)) m = T('光源關閉（P = 0）：沒有光子，也就沒有光電子。', 'The light is off (P = 0): no photons, so no photoelectrons.');
    else if (!A.emits) m = T('光子能量 hf = ' + num(A.EeV, 2) + ' eV 小於' + metalName(state.metal) + '的功函數 φ = ' + num(A.phi, 2) + ' eV：一個光電子也沒有——光再強也一樣。',
      'Photon energy hf = ' + num(A.EeV, 2) + ' eV is less than the work function of ' + metalName(state.metal).toLowerCase() + ', φ = ' + num(A.phi, 2) + ' eV: not a single photoelectron, however bright the light.');
    else if (A.zero) m = T('電流為零：減速電場 e|V| ≥ K_max，連最快的電子也折返了。', 'Zero current: the retarding field takes e|V| ≥ K_max, so even the fastest electrons turn back.');
    else if (A.collected > 0.9995) m = T('飽和：所有光電子都到達陽極。', 'Saturated: every photoelectron reaches the anode.');
    setStatus(m);
  }

  // ---------- 電流－電壓圖與密立坎圖 ----------
  const iv = $('iv'), ivc = iv.getContext('2d');
  const mk = $('mk'), mkc = mk.getContext('2d');
  let gw = { iv: [300, 200], mk: [300, 200] };
  function resizeGraphs() {
    [[iv, 'iv'], [mk, 'mk']].forEach(function (p) {
      const el = p[0], w = el.clientWidth;
      if (!w) return;
      const h = Math.round(Math.max(220, Math.min(300, w * 0.68)));
      if (el.style.height !== h + 'px') el.style.height = h + 'px';
      el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
      gw[p[1]] = [w, h];
    });
    drawGraphs();
  }
  const SERIES_COLORS = ['neg', 'pos', 'probe', 'equi', 'b-optics', 'b-mech', 'b-wave', 'field'];
  function seriesKey() { return state.metal + '|' + state.lambda + '|' + state.Pu; }
  function addPoint() {
    if (!A) return;
    const key = seriesKey();
    let s = state.series.find(function (x) { return x.key === key; });
    if (!s) {
      s = { key: key, metal: state.metal, lambda: state.lambda, Pu: state.Pu, color: SERIES_COLORS[state.colorIdx++ % SERIES_COLORS.length], pts: {} };
      state.series.push(s);
      if (state.series.length > 8) state.series.shift();
    }
    s.pts[(Math.round(state.V * 100) / 100).toFixed(2)] = A.I;
    s.last = performance.now();
    requestGraphs();
  }
  let graphPending = false;
  function requestGraphs() {
    if (graphPending) return;
    graphPending = true;
    requestAnimationFrame(function () { graphPending = false; drawGraphs(); });
  }
  function niceUp(x) {
    if (!(x > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function graphFrame(c, w, h, pad) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const base = colors['canvas-bg'];
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, base); g.addColorStop(1, shade(base, colors.dark ? -0.3 : -0.04));
    c.fillStyle = g;
    roundRect(c, 0, 0, w, h, 8); c.fill();
    c.strokeStyle = alpha(colors.text, 0.08); c.lineWidth = 1;
    roundRect(c, 0.5, 0.5, w - 1, h - 1, 8); c.stroke();
    return { x0: pad.l, x1: w - pad.r, y0: h - pad.b, y1: pad.t };
  }
  function drawGraphs() { if (A && gw) { drawIV(); drawMillikan(); } }

  function drawIV() {
    const w = gw.iv[0], h = gw.iv[1], c = ivc;
    const F = graphFrame(c, w, h, { l: 50, r: 12, t: 26, b: 34 });
    let imax = A.Isat * 1e9;
    state.series.forEach(function (s) { for (const k in s.pts) imax = Math.max(imax, s.pts[k] * 1e9); });
    const top = niceUp(imax * 1.08 || 1);
    const xv = function (V) { return F.x0 + (F.x1 - F.x0) * (V + 5) / 10; };
    const yi = function (I) { return F.y0 - (F.y0 - F.y1) * I * 1e9 / top; };
    const px = function (v) { return Math.round(v) + 0.5; };
    // 格線
    c.strokeStyle = alpha(colors.text, 0.06);
    c.beginPath();
    for (let V = -5; V <= 5; V++) { c.moveTo(px(xv(V)), F.y1); c.lineTo(px(xv(V)), F.y0); }
    for (let i = 0; i <= 5; i++) { const y = px(F.y0 - (F.y0 - F.y1) * i / 5); c.moveTo(F.x0, y); c.lineTo(F.x1, y); }
    c.stroke();
    c.strokeStyle = alpha(colors.muted, 0.75);
    c.beginPath(); c.moveTo(F.x0, px(F.y0)); c.lineTo(F.x1, px(F.y0)); c.moveTo(px(xv(0)), F.y1 - 4); c.lineTo(px(xv(0)), F.y0); c.stroke();
    for (let V = -5; V <= 5; V += (w < 360 ? 2.5 : 1)) rich(c, num(V, V % 1 ? 1 : 0), xv(V), F.y0 + 10, { size: 10, weight: 500, color: colors.muted, align: 'center' });
    for (let i = 0; i <= 5; i++) {
      const v = top * i / 5;
      rich(c, String(+v.toPrecision(3)), F.x0 - 5, F.y0 - (F.y0 - F.y1) * i / 5, { size: 10, weight: 500, color: colors.muted, align: 'right' });
    }
    rich(c, 'V (V)', F.x1, F.y0 + 23, { size: 11, color: colors.muted, align: 'right' });
    rich(c, 'I (nA)', 8, 12, { size: 11, color: colors.muted });
    rich(c, T('減速 ←', '← retarding'), xv(-2.5), F.y1 - 13, { size: 10, weight: 500, color: alpha(colors.pos, 0.9), align: 'center' });
    rich(c, T('→ 加速', 'accelerating →'), xv(2.5), F.y1 - 13, { size: 10, weight: 500, color: colors.muted, align: 'center' });
    // 資料
    const curKey = seriesKey();
    state.series.forEach(function (s) {
      const col = colors[s.color];
      const keys = Object.keys(s.pts).map(Number).sort(function (a, b) { return a - b; });
      c.strokeStyle = alpha(col, s.key === curKey ? 0.95 : 0.5);
      c.lineWidth = s.key === curKey ? 2 : 1.4;
      c.lineJoin = 'round';
      c.beginPath();
      keys.forEach(function (V, i) { const x = xv(V), y = yi(s.pts[V.toFixed(2)]); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      c.stroke();
      c.fillStyle = alpha(col, s.key === curKey ? 1 : 0.6);
      const step = Math.max(1, Math.floor(keys.length / 60));
      keys.forEach(function (V, i) { if (i % step) return; c.beginPath(); c.arc(xv(V), yi(s.pts[V.toFixed(2)]), 2.1, 0, Math.PI * 2); c.fill(); });
    });
    // 圖例（最近的 4 組）
    const shown = state.series.slice(-4);
    shown.forEach(function (s, i) {
      const lab = s.metal + ' · ' + s.lambda + ' nm · ' + s.Pu + ' μW';
      rich(c, lab, F.x0 + 8, F.y1 + 10 + i * 16, { size: 10, weight: s.key === curKey ? 700 : 500, color: colors[s.color], box: true, boxAlpha: 0.75 });
    });
    // 已記錄的停止電壓（目前這組）
    state.stops.forEach(function (st) {
      if (st.metal !== state.metal || st.lambda !== state.lambda) return;
      const x = xv(-st.Vs);
      c.fillStyle = colors.accent;
      c.beginPath(); c.moveTo(x, F.y0 - 1); c.lineTo(x - 5, F.y0 - 10); c.lineTo(x + 5, F.y0 - 10); c.closePath(); c.fill();
    });
    // 目前的工作點
    const x = xv(state.V), y = yi(A.I);
    const col = colors[(state.series.find(function (s) { return s.key === curKey; }) || { color: 'accent' }).color];
    const halo = c.createRadialGradient(x, y, 1, x, y, 11);
    halo.addColorStop(0, alpha(col, 0.45)); halo.addColorStop(1, alpha(col, 0));
    c.fillStyle = halo; c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill();
    c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.stroke();
    const nset = state.series.length;
    setLabel(iv, T('電流對電壓的關係圖：', 'Graph of current against voltage: ') + nset + T(' 組資料；目前 V = ', nset === 1 ? ' data set; now V = ' : ' data sets; now V = ') +
      signed(state.V, 2) + T(' V，I = ', ' V, I = ') + nA(A.I) + T(' nA。', ' nA.'));
    if (state.series.length === 0 || Object.keys((state.series.find(function (s) { return s.key === curKey; }) || { pts: {} }).pts).length < 3) {
      rich(c, T('改變電壓 V，或按「自動掃描」', 'Change V, or press “Sweep”'), (F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2 + 20, { size: 11, weight: 500, color: colors.muted, align: 'center', box: true, boxAlpha: 0.7 });
    }
  }

  function computeFits() {
    const out = {};
    PC.METALS.forEach(function (m) {
      const pts = state.stops.filter(function (s) { return s.metal === m.id; });
      if (!pts.length) return;
      const F = PC.millikanFit(pts.map(function (s) { return { f: s.f, Vs: s.Vs }; }));
      const fs = {};
      pts.forEach(function (s) { fs[s.lambda] = 1; });
      out[m.id] = { n: pts.length, nf: Object.keys(fs).length, fit: F, f0True: PC.thresholdFrequency(m.phi), phi: m.phi };
    });
    return out;
  }

  function drawMillikan() {
    const w = gw.mk[0], h = gw.mk[1], c = mkc;
    const F = graphFrame(c, w, h, { l: 40, r: 14, t: 18, b: 34 });
    const FMAX = 31, VMIN = -6, VMAX = 6;
    const xf = function (f) { return F.x0 + (F.x1 - F.x0) * f / FMAX; }; // f 以 10^14 Hz 為單位
    const yv = function (V) { return F.y0 - (F.y0 - F.y1) * (V - VMIN) / (VMAX - VMIN); };
    const px = function (v) { return Math.round(v) + 0.5; };
    c.strokeStyle = alpha(colors.text, 0.06);
    c.beginPath();
    for (let f = 0; f <= 30; f += 5) { c.moveTo(px(xf(f)), F.y1); c.lineTo(px(xf(f)), F.y0); }
    for (let V = VMIN; V <= VMAX; V += 2) { c.moveTo(F.x0, px(yv(V))); c.lineTo(F.x1, px(yv(V))); }
    c.stroke();
    c.strokeStyle = alpha(colors.muted, 0.75);
    c.beginPath(); c.moveTo(F.x0, px(yv(0))); c.lineTo(F.x1, px(yv(0))); c.moveTo(px(F.x0), F.y1); c.lineTo(px(F.x0), F.y0); c.stroke();
    for (let f = 0; f <= 30; f += (w < 360 ? 10 : 5)) rich(c, String(f), xf(f), F.y0 + 10, { size: 10, weight: 500, color: colors.muted, align: 'center' });
    for (let V = VMIN; V <= VMAX; V += 2) rich(c, num(V, 0), F.x0 - 5, yv(V), { size: 10, weight: 500, color: colors.muted, align: 'right' });
    rich(c, [['f (10', ''], ['14', 'sup'], [' Hz)', '']], F.x1, F.y0 + 23, { size: 11, color: colors.muted, align: 'right' });
    rich(c, [['V', ''], ['s', 'sub'], [' (V)', '']], F.x0 + 6, F.y1 + 4, { size: 11, color: colors.muted });
    // 目前的光（頻率位置）
    const fNow = A.f / 1e14;
    c.strokeStyle = lightColor(state.lambda, 0.55); c.setLineDash([3, 4]); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(px(xf(fNow)), F.y1); c.lineTo(px(xf(fNow)), F.y0); c.stroke();
    c.setLineDash([]);
    // 擬合直線與資料點
    const fits = computeFits();
    c.save();
    c.beginPath(); c.rect(F.x0, F.y1, F.x1 - F.x0, F.y0 - F.y1); c.clip();
    Object.keys(fits).forEach(function (id) {
      const ft = fits[id].fit, col = metalPlotColor(id);
      if (!ft) return;
      const lineAt = function (f) { return (ft.slope * f * 1e14 + ft.intercept); };
      // 外插部分（虛線）
      c.strokeStyle = alpha(col, 0.55); c.lineWidth = 1.3; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(xf(0), yv(lineAt(0))); c.lineTo(xf(FMAX), yv(lineAt(FMAX))); c.stroke();
      c.setLineDash([]);
      // 資料範圍內（實線）
      const pts = state.stops.filter(function (s) { return s.metal === id; });
      let fmin = Infinity, fmax = -Infinity;
      pts.forEach(function (s) { fmin = Math.min(fmin, s.f / 1e14); fmax = Math.max(fmax, s.f / 1e14); });
      fmin = Math.min(fmin, ft.f0 / 1e14);
      c.strokeStyle = col; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(xf(fmin), yv(lineAt(fmin))); c.lineTo(xf(fmax), yv(lineAt(fmax))); c.stroke();
      // 截止頻率
      c.fillStyle = colors['canvas-bg']; c.strokeStyle = col; c.lineWidth = 1.6;
      c.beginPath(); c.arc(xf(ft.f0 / 1e14), yv(0), 3.5, 0, Math.PI * 2); c.fill(); c.stroke();
    });
    c.restore();
    state.stops.forEach(function (s) {
      const col = metalPlotColor(s.metal), x = xf(s.f / 1e14), y = yv(s.Vs);
      const g = c.createRadialGradient(x - 1.2, y - 1.2, 0.5, x, y, 4.5);
      g.addColorStop(0, shade(col, 0.55)); g.addColorStop(1, shade(col, -0.25));
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, 4.2, 0, Math.PI * 2); c.fill();
    });
    // 金屬標籤（在直線右端或點旁）
    Object.keys(fits).forEach(function (id) {
      const pts = state.stops.filter(function (s) { return s.metal === id; });
      let best = pts[0];
      pts.forEach(function (s) { if (s.f > best.f) best = s; });
      const x = xf(best.f / 1e14), y = yv(best.Vs);
      rich(c, id, Math.min(x + 8, F.x1 - 14), y - 10, { size: 11, weight: 700, color: metalPlotColor(id), box: true, boxAlpha: 0.8 });
    });
    const nst = state.stops.length;
    let mlab = T('密立坎圖（停止電壓對頻率）：已記錄 ', 'Millikan plot of stopping voltage against frequency: ') + nst + T(' 個點', nst === 1 ? ' point recorded' : ' points recorded');
    Object.keys(fits).forEach(function (id) { if (fits[id].fit) mlab += T('；', '; ') + metalName(id) + T('的直線求得 h = ', ' line gives h = ') + hText(fits[id].fit.h); });
    setLabel(mk, mlab + T('。', '.'));
    if (!state.stops.length) {
      rich(c, T('還沒有資料：找到停止電壓後按「記錄」', 'No data yet: find a stopping voltage and press “Record”'), (F.x0 + F.x1) / 2, yv(3.2), { size: 11, weight: 500, color: colors.muted, align: 'center', box: true, boxAlpha: 0.7 });
    } else rich(c, T('斜率 = h/e', 'slope = h/e'), F.x1 - 4, yv(-4.8), { size: 11, weight: 600, color: colors.muted, align: 'right', box: true, boxAlpha: 0.7 });
  }

  function updateFitsCard() {
    const fits = computeFits(), ids = Object.keys(fits);
    if (!ids.length) {
      $('fits').innerHTML = '<p class="empty">' + T('還沒有資料。把電壓調到電流剛好歸零，再按「記錄停止電壓」。', 'No data yet. Set the voltage so that the current just becomes zero, then press “Record stopping voltage”.') + '</p>';
      return;
    }
    $('fits').innerHTML = ids.map(function (id) {
      const d = fits[id], ft = d.fit;
      const head = '<div class="m"><i style="background:' + metalPlotColor(id) + '"></i>' + metalName(id) + ' ' + id + ' · ' + d.n + T(' 點', d.n === 1 ? ' point' : ' points') + '</div>';
      if (!ft) return '<div class="row">' + head + '<div class="v">' + T('再記錄一個不同頻率的點，才能畫出直線。', 'Record a point at another frequency to draw a line.') + '</div></div>';
      const err = (ft.h / PC.H - 1) * 100;
      return '<div class="row">' + head +
        '<div class="v">' + T('斜率', 'slope') + ' h/e = ' + sci(ft.slope, 3, 'V·s') + '</div>' +
        '<div class="v">h = ' + sci(ft.h, 3, 'J·s') + ' <span class="err">' + T('（與公認值差 ', '(') + signed(err, 1) + '%' + T('）', ' from the accepted value)') + '</span></div>' +
        '<div class="v">f<sub>0</sub> = ' + sci(ft.f0, 3, 'Hz') + T('，', ', ') + 'φ = ' + num(ft.phi, 2) + ' eV</div></div>';
    }).join('');
  }

  // ---------- 螢幕閱讀器：畫布說明（參數改變時更新）與讀數播報（離散事件後寫進 aria-live 的 #srLive） ----------
  function setLabel(el, t) { if (el.getAttribute('aria-label') !== t) el.setAttribute('aria-label', t); }
  /** 純文字的 h（不用上標字元） */
  function hText(h) { return num(h / 1e-34, 3) + T(' × 10 的 −34 次方 J·s', ' × 10^−34 J·s'); }
  function updateAria() {
    if (!A) return;
    const kind = state.lambda < 380 ? T('紫外線', 'ultraviolet') : state.lambda > 750 ? T('紅外線', 'infrared') : T('可見光', 'visible light');
    let t = T('光電效應模擬畫面：波長 ', 'Photoelectric effect simulation: light of wavelength ') + fmtSlider(state.lambda, elL) + ' nm' +
      T('的' + kind + '、功率 ', ' (' + kind + ', power ') + fmtSlider(state.Pu, elP) + ' μW' + T(' 照在', ') shines on a ') + metalName(state.metal) +
      T('陰極（功函數 ', ' cathode (work function ') + num(A.phi, 2) + T(' eV）；陽極電壓 ', ' eV); anode voltage ') + signed(state.V, 2) + ' V' + T('。', '. ');
    if (!(state.Pu > 0)) t += T('光源關閉，沒有光電子。', 'The light is off, so there are no photoelectrons.');
    else if (!A.emits) t += T('光子能量 ', 'The photon energy ') + num(A.EeV, 2) + T(' eV 小於功函數，沒有光電子。', ' eV is below the work function: no photoelectrons.');
    else t += T('光電子的最大動能 ', 'Photoelectrons leave with up to ') + num(A.Kmax, 2) + T(' eV，電流表 ', ' eV; the ammeter reads ') + nA(A.I) + T(' nA。', ' nA.');
    setLabel(cv, t);
  }
  let announceTimer = 0;
  function announce(prefix) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () {
      const el = $('srLive');
      if (!el || !A) return;
      let t;
      if (!(state.Pu > 0)) t = T('光源關閉，電流表 0.000 nA。', 'The light is off; the ammeter reads 0.000 nA.');
      else if (!A.emits) t = T('hf = ', 'hf = ') + num(A.EeV, 2) + T(' eV 小於 φ = ', ' eV is less than φ = ') + num(A.phi, 2) + T(' eV，沒有光電子，電流表 0.000 nA。', ' eV: no photoelectrons; the ammeter reads 0.000 nA.');
      else t = T('電流表 ', 'Ammeter ') + nA(A.I) + T(' nA，最大動能 ', ' nA, maximum kinetic energy ') + num(A.Kmax, 2) + T(' eV，停止電壓 ', ' eV, stopping voltage ') + num(A.Vs, 2) + T(' V。', ' V.');
      el.textContent = (prefix || '') + t;
    }, 350);
  }

  // ---------- 讀數 ----------
  function setHTML(id, html) { const el = $(id); if (el.innerHTML !== html) el.innerHTML = html; }
  function updateReadout() {
    setHTML('rf', sci(A.f, 3, 'Hz'));
    setHTML('rE', num(A.EeV, 3) + ' eV<small>= ' + sci(A.EJ, 3, 'J') + '</small>');
    setHTML('rphi', num(A.phi, 2) + ' eV<small>= ' + sci(A.phi * PC.E_CHARGE, 3, 'J') + '</small>');
    if (A.emits) {
      setHTML('rK', num(A.Kmax, 3) + ' eV<small>= ' + sci(A.KmaxJ, 3, 'J') + '</small>');
      setHTML('rVs', num(A.Vs, 3) + ' V');
    } else {
      setHTML('rK', T('沒有光電子', 'no photoelectrons') + '<small>hf ≤ φ</small>');
      setHTML('rVs', '—');
    }
    setHTML('rf0', sci(A.f0, 3, 'Hz'));
    setHTML('rl0', num(A.lambda0, 1) + ' nm');
    setHTML('rN', A.N > 0 ? sci(A.N, 3, T('個/s', '/s')) : num(0, 0));
    setHTML('rIs', nA(A.Isat) + ' nA');
    setHTML('rI', nA(A.I) + ' nA');
  }

  // ---------- 滑桿與控制 ----------
  const elL = $('lam'), elP = $('pw'), elV = $('volt');
  function refreshOutputs() {
    $('lamo').textContent = fmtSlider(val(elL), elL) + ' nm';
    $('pwo').textContent = fmtSlider(val(elP), elP) + ' μW';
    const v = val(elV);
    $('volto').textContent = (v > 0.0001 ? '+' : '') + fmtSlider(v, elV) + ' V';
    $('swatch').style.background = lightColor(val(elL), 1);
    $('lamMark').style.left = ((val(elL) - 100) / 700 * 100) + '%';
    const l0 = PC.thresholdWavelength(phi());
    $('thMark').style.left = ((l0 - 100) / 700 * 100) + '%';
  }
  function readSliders() {
    state.lambda = val(elL);
    state.Pu = val(elP);
    state.V = val(elV);
  }
  function changed(opts) {
    readSliders();
    recompute();
    refreshOutputs();
    updateReadout();
    autoStatus();
    bgDirty = true;
    if (opts && opts.point) addPoint(); // 只有改變電壓時才在 I–V 圖加點
    if (!state.running && !state.sweep) state.needle = Math.min(1.04, A.I * 1e9 / meterRange());
    requestDraw();
    if (opts && opts.graphs) requestGraphs();
    updateAria();
  }
  [elL, elP, elV].forEach(function (el) {
    el.addEventListener('input', function () {
      if (el !== elV && state.sweep) stopSweep(false);
      if (el === elV && state.sweep && el.dataset.sweeping !== '1') stopSweep(false);
      changed({ graphs: el !== elV, point: el === elV });
    });
    el.addEventListener('change', function () {
      emitChange(el === elL ? 'lambda' : el === elP ? 'P' : 'V');
      announce();
    });
  });

  // 金屬按鈕
  function buildMetalButtons() {
    const box = $('metals');
    box.innerHTML = '';
    PC.METALS.forEach(function (m) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = m.id;
      b.setAttribute('aria-pressed', String(m.id === state.metal));
      b.innerHTML = metalName(m.id) + ' ' + m.id + '<small>' + num(m.phi, 2) + ' eV</small>';
      b.addEventListener('click', function () { setMetal(m.id, true); });
      box.appendChild(b);
    });
  }
  function setMetal(id, user) {
    if (state.sweep) stopSweep(false);
    state.metal = id;
    $('metals').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === id)); });
    changed({ graphs: true });
    if (user) { emitChange('metal'); announce(); }
  }

  // 自動掃描
  function setV(v) {
    if (window.LabNum) window.LabNum.clear(elV);
    elV.value = String(v);
    elV.dataset.sweeping = '1';
    elV.dispatchEvent(new Event('input', { bubbles: true }));
    elV.dataset.sweeping = '';
  }
  function startSweep() {
    state.sweep = { v: -5 };
    $('sweep').setAttribute('aria-pressed', 'true');
    $('sweep').textContent = T('停止掃描', 'Stop sweep');
    setV(-5);
    startLoop();
  }
  function stopSweep(finished) {
    state.sweep = null;
    $('sweep').setAttribute('aria-pressed', 'false');
    $('sweep').textContent = T('自動掃描 V', 'Sweep V');
    if (finished) { emitChange('V'); announce(); }
  }
  function stepSweep(dt) {
    const sw = state.sweep;
    sw.v = Math.min(5, sw.v + dt * 10 / 3.2);
    setV(Math.round(sw.v * 100) / 100);
    if (sw.v >= 5) stopSweep(true);
  }
  $('sweep').addEventListener('click', function () { if (state.sweep) stopSweep(false); else startSweep(); });

  // 記錄停止電壓
  $('record').addEventListener('click', function () {
    const p = params();
    const r = PC.stopCheck(p);
    const msgs = {
      noLight: T('光源關閉，沒有光電子可以測量。', 'The light is off: there are no photoelectrons to measure.'),
      noEmission: T('hf ≤ φ：沒有光電子，沒有停止電壓可以測。', 'hf ≤ φ: no photoelectrons, so there is no stopping voltage to measure.'),
      outOfRange: T('停止電壓超過 5 V，這個電源量不到；請把波長調長一點。', 'The stopping voltage is above 5 V, beyond this power supply; use a longer wavelength.'),
      notZero: T('電流還不是零：把 V 再往負的方向調。', 'The current is not zero yet: make V more negative.'),
      notEdge: T('電流是零，但還不是「剛好」歸零：把 V 往正的方向調，找到電流剛要出現的位置。', 'The current is zero, but not just zero: make V less negative until you find where the current is about to appear.')
    };
    if (r !== 'ok') { setStatus(msgs[r], 5000); return; }
    const rec = { metal: state.metal, phi: phi(), lambda: state.lambda, f: A.f, Pu: state.Pu, Vs: -state.V, VsTrue: A.Vs };
    const i = state.stops.findIndex(function (s) { return s.metal === rec.metal && s.lambda === rec.lambda && s.Pu === rec.Pu; });
    if (i >= 0) state.stops.splice(i, 1);
    state.stops.push(rec);
    if (!reducedMotion) state.fx.push({ type: 'record', x: 0, y: 0, t0: performance.now(), dur: 500 });
    recordSound();
    setStatus('', 4000);
    $('status').innerHTML = T('已記錄：f = ', 'Recorded: f = ') + sci(A.f, 3, 'Hz') + T('，V<sub>s</sub> = ', ', V<sub>s</sub> = ') + num(rec.Vs, 2) + ' V';
    updateFitsCard();
    requestGraphs();
    requestDraw();
    const ft = computeFits()[state.metal];
    announce(T('已記錄停止電壓 ', 'Recorded stopping voltage ') + num(rec.Vs, 2) + ' V' +
      (ft && ft.fit ? T('；最佳直線求得 h = ', '; the best-fit line gives h = ') + hText(ft.fit.h) : '') + T('。', '. '));
    if (window.LabMission) {
      window.LabMission.emit('stop', Object.assign(snapshot(), { Vs: rec.Vs, VsTrue: rec.VsTrue, records: state.stops.map(function (s) { return Object.assign({}, s); }), fits: computeFits() }));
    }
  });

  // 任務模式（missions.js）：回報這次改變後的狀態與改變前的狀態
  function snapshot() {
    return {
      metal: state.metal, phi: A.phi, lambda: state.lambda, f: A.f, E: A.EeV, P: state.Pu, V: state.V,
      I: A.I, Isat: A.Isat, Kmax: A.Kmax, Vs: A.Vs, emits: A.emits, zero: A.zero, collected: A.collected, f0: A.f0
    };
  }
  let lastSnap = null;
  function emitChange(key) {
    const s = snapshot();
    if (window.LabMission) window.LabMission.emit('change', Object.assign({ key: key, base: lastSnap }, s));
    lastSnap = s;
  }

  // 播放／暫停
  function updateButtons() { $('play').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play'); }
  $('play').addEventListener('click', function () {
    state.running = !state.running;
    updateButtons();
    if (state.running) startLoop(); else requestDraw();
  });
  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; });

  // 全部清除：清掉 I–V 圖、密立坎圖的點與畫面上的粒子（滑桿設定不變）
  $('reset').addEventListener('click', function () {
    if (state.sweep) stopSweep(false);
    state.series = []; state.colorIdx = 0; state.stops = [];
    state.photons = []; state.electrons = []; state.fx = []; state.photonAcc = 0;
    addPoint();
    updateFitsCard();
    requestGraphs();
    requestDraw();
    setStatus(T('已全部清除，滑桿設定不變。', 'Everything is cleared; the slider settings are kept.'), 3000);
    if (window.LabMission) window.LabMission.emit('reset', {});
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
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });
  updateSoundButton();

  // ---------- 啟動 ----------
  readColors();
  buildMetalButtons();
  readSliders();
  recompute();
  refreshOutputs();
  updateReadout();
  updateButtons();
  updateFitsCard();
  lastSnap = snapshot();
  updateAria();
  function themeChanged() {
    readColors();
    if (L) { buildSprite(); bgDirty = true; }
    $('swatch').style.background = lightColor(val(elL), 1);
    updateFitsCard();
    requestDraw();
    requestGraphs();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0, lastG = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); }
      else if (iv.clientWidth !== lastG) { lastG = iv.clientWidth; resizeGraphs(); }
    }).observe(document.querySelector('.stage'));
  }
  window.addEventListener('resize', function () { resize(); });
  resize();
  addPoint();
  autoStatus();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始動畫。', 'Reduced motion is on: press “Play” to start the animation.'));
  if (state.running) startLoop();
  // 測試用（Playwright）：讀取目前狀態
  window.__photo = { state: state, analysis: function () { return A; }, fits: computeFits };
})();
