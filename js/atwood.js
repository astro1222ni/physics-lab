/* atwood.js — 「連體運動與阿特午機」模組的畫面與互動（物理計算在 atwood-core.js） */
(function () {
  'use strict';
  const C = window.AtwoodCore;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const g = C.G, DEG = Math.PI / 180;
  const SLOW = 0.25;
  const ACC_SCALE = 0.07;   // 加速度箭頭：每 1 m/s² 畫 0.07 m（實驗圖）
  const HAND_GRACE = 6;     // 手按碼錶：運動結束後最多再等 6 s

  // ======================= 狀態 =======================
  const state = {
    mode: 1, p: null, geo: null, tl: null, measure: null,
    t: 0, phase: 'ready',           // ready | running | paused | done
    slow: false, timing: 'gate',
    push: false, n: 3,
    hand: null,                      // { t: 停錶時間 } 或 null
    gateHit: false, recorded: false, evIdx: 0, impacts: 0, sawStop: false,
    vt: [], fx: [], runs: [],
    show: { forces: false, pairs: true, acc: true, comp: true },
    kF: 1, kS: 1, Fmax: 1, view: null, vtView: null,
    segKey: null
  };

  // ======================= 色彩 =======================
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-optics', '--b-wave', '--b-thermo']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
    colors.F = {
      W: colors.field, T: colors['b-mech'], N: colors.neg, S: colors.neg, f: colors['b-optics'],
      F: colors.pos, P: colors.probe, a: colors.accent
    };
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
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }

  // ======================= 數字 =======================
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  /** 力的大小：三位有效數字左右 */
  function fN(v) { const a = Math.abs(v); return num(v, a >= 100 ? 0 : a >= 10 ? 1 : 2); }

  // ======================= 參數 =======================
  const el = {};
  ['a1m1', 'a1m2', 'a1h', 'a1v', 'a2M', 'a2m', 'a2us', 'a2uk', 'a2d', 'a2v',
    'a3m1', 'a3m2', 'a3m3', 'a3F', 'a3us', 'a3uk', 'a3d', 'a3v',
    'a4M', 'a4m', 'a4th', 'a4us', 'a4uk', 'a4d', 'a4v'].forEach(function (id) { el[id] = $(id); });
  const UNITS = { m1: 'kg', m2: 'kg', m3: 'kg', M: 'kg', m: 'kg', h: 'm', d: 'm', v: 'm/s', F: 'N', th: '°', us: '', uk: '' };
  function unitOf(id) {
    const k = id.slice(2);
    return UNITS[k] != null ? UNITS[k] : '';
  }
  function showOut(id) {
    const e = el[id], u = unitOf(id);
    $(id + 'o').textContent = fmtSlider(val(e), e) + (u ? (u === '°' ? '°' : ' ' + u) : '');
  }
  function refreshOutputs() { Object.keys(el).forEach(showOut); }

  function readParams(mode) {
    if (mode === 1) return { m1: val(el.a1m1), m2: val(el.a1m2), h: val(el.a1h), v0: val(el.a1v) };
    if (mode === 2) return { M: val(el.a2M), m: val(el.a2m), muS: val(el.a2us), muK: val(el.a2uk), d: val(el.a2d), v0: val(el.a2v) };
    if (mode === 3) {
      const m = [val(el.a3m1), val(el.a3m2)];
      if (state.n === 3) m.push(val(el.a3m3));
      return { m: m, F: val(el.a3F), push: state.push, muS: val(el.a3us), muK: val(el.a3uk), d: val(el.a3d), v0: val(el.a3v) };
    }
    return { M: val(el.a4M), m: val(el.a4m), theta: val(el.a4th), muS: val(el.a4us), muK: val(el.a4uk), d: val(el.a4d), v0: val(el.a4v) };
  }
  /** 任務用：攤平的參數 */
  function flatParams() {
    const p = state.p, o = { mode: state.mode, v0: p.v0 };
    if (state.mode === 1) { o.m1 = p.m1; o.m2 = p.m2; o.h = p.h; }
    else if (state.mode === 3) {
      o.n = p.m.length; o.push = p.push; o.m1 = p.m[0]; o.m2 = p.m[1]; o.m3 = p.m.length > 2 ? p.m[2] : null;
      o.F = p.F; o.muS = p.muS; o.muK = p.muK; o.d = p.d;
    } else {
      o.M = p.M; o.m = p.m; o.muS = p.muS; o.muK = p.muK; o.d = p.d;
      if (state.mode === 4) o.theta = p.theta;
    }
    return o;
  }

  // ======================= 畫布 =======================
  const cv = $('scene'), ctx = cv.getContext('2d');
  const fcv = $('fbd'), fctx = fcv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, fw = 300, fh = 300;
  let L = null, FL = null;
  const bg = document.createElement('canvas'), bgctx = bg.getContext('2d');
  let c = ctx; // 目前繪圖的 context（共用工具函式）

  function roundRect(k, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    k.beginPath();
    k.moveTo(x + r, y);
    k.arcTo(x + w, y, x + w, y + h, r);
    k.arcTo(x + w, y + h, x, y + h, r);
    k.arcTo(x, y + h, x, y, r);
    k.arcTo(x, y, x + w, y, r);
    k.closePath();
  }

  /** 世界範圍（公尺） */
  function worldBox() {
    const p = state.p, G = state.geo;
    if (state.mode === 1) return { x0: -0.98, x1: 0.8, y0: -0.1, y1: G.ceiling + 0.14 };
    if (state.mode === 2) return { x0: -1.85, x1: 0.72, y0: -0.1, y1: G.tableH + 0.4 };
    if (state.mode === 4) return { x0: Math.min(G.P0.x - 0.3, -1.0), x1: G.pulley.x + 0.66, y0: -0.1, y1: Math.max(G.pulley.y + 0.3, 1.2) };
    const Fl = 0.32 * Math.min(1, (p.F || 0) / Math.max(1, state.Fmax || 1)) + 0.08;
    if (p.push) return { x0: -0.42 - Fl, x1: G.finish + 0.22, y0: -0.16, y1: 0.66 };
    return { x0: -0.22, x1: G.finish + 0.32 + Fl, y0: -0.16, y1: 0.66 };
  }

  function layout() {
    const narrow = cw < 640;
    const W = worldBox();
    const ww = W.x1 - W.x0, wh = W.y1 - W.y0;
    let world, side, infoBelow;
    if (narrow) {
      const wH = Math.max(210, Math.min(state.mode === 1 ? 480 : 430, cw * wh / ww + 10));
      world = { x: 0, y: 0, w: cw, h: wH };
      side = { x: 0, y: wH + 6, w: cw, h: 128 };
      infoBelow = true;
    } else if (state.mode === 3) {
      const wH = Math.max(220, Math.min(320, cw * wh / ww + 20));
      world = { x: 0, y: 0, w: cw, h: wH };
      side = { x: 0, y: wH + 8, w: cw, h: 150 };
      infoBelow = true;
    } else {
      const H = state.mode === 1 ? 540 : state.mode === 4 ? 500 : 450;
      const sw = Math.round(Math.min(330, cw * 0.36));
      world = { x: 0, y: 0, w: cw - sw - 8, h: H };
      side = { x: cw - sw, y: 0, w: sw, h: H };
      infoBelow = false;
    }
    // 世界 → 畫面
    const pad = 14;
    const k = Math.min((world.w - 2 * pad) / ww, (world.h - 2 * pad) / wh);
    const ox = world.x + (world.w - ww * k) / 2 - W.x0 * k;
    const oy = world.y + world.h - (world.h - wh * k) / 2 + W.y0 * k;
    // 資訊區：計時器＋ v–t 圖
    let timer, graph;
    if (infoBelow) {
      const tw = Math.round(Math.min(220, side.w * 0.38));
      timer = { x: side.x, y: side.y, w: tw, h: side.h };
      graph = { x: side.x + tw + 6, y: side.y, w: side.w - tw - 6, h: side.h };
    } else {
      timer = { x: side.x, y: side.y, w: side.w, h: 112 };
      graph = { x: side.x, y: side.y + 120, w: side.w, h: side.h - 120 };
    }
    return {
      narrow: narrow, world: world, side: side, timer: timer, graph: graph, k: k, ox: ox, oy: oy,
      H: infoBelow ? side.y + side.h : world.h, W: W,
      lw: narrow ? 2.2 : 2.6, fs: narrow ? 11 : 12
    };
  }
  function X(x) { return L.ox + x * L.k; }
  function Y(y) { return L.oy - y * L.k; }

  function resize() {
    const w = cv.clientWidth;
    if (!w || !state.p) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    // 實驗圖上力的比例：最大的力畫成約 0.4 m（模式 3 木塊較小，用 0.32 m）
    state.kS = (state.mode === 3 ? 0.32 : 0.4) * L.k / state.Fmax;
    ch = Math.round(L.H);
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    buildBackground();
    resizeFbd();
    state.segKey = null;
    draw();
  }

  // ======================= 文字與箭頭工具 =======================
  /** 解析 "m_1g"、"P_{12}" 之類的標記：_ 後的一個字或 {…} 為下標 */
  function parseRich(s) {
    const out = [];
    let i = 0, buf = '';
    while (i < s.length) {
      const ch2 = s[i];
      if (ch2 === '_' && i + 1 < s.length) {
        if (buf) { out.push({ t: buf, sub: false }); buf = ''; }
        if (s[i + 1] === '{') {
          const j = s.indexOf('}', i + 2);
          out.push({ t: s.slice(i + 2, j < 0 ? s.length : j), sub: true });
          i = j < 0 ? s.length : j + 1;
        } else { out.push({ t: s[i + 1], sub: true }); i += 2; }
        continue;
      }
      buf += ch2; i++;
    }
    if (buf) out.push({ t: buf, sub: false });
    return out;
  }
  function fontPx(f) { const m = /(\d+(?:\.\d+)?)px/.exec(f); return m ? +m[1] : 12; }
  function subFont(f) { return f.replace(/(\d+(?:\.\d+)?)px/, function (m, n) { return Math.round(n * 0.72) + 'px'; }); }
  function richWidth(s, font) {
    let w = 0;
    parseRich(s).forEach(function (seg) { c.font = seg.sub ? subFont(font) : font; w += c.measureText(seg.t).width; });
    return w;
  }
  /** 畫帶下標的文字；align: left | center | right；y 為垂直中心 */
  function richText(s, x, y, color, font, align) {
    const w = richWidth(s, font);
    let px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = color;
    const fp = fontPx(font);
    parseRich(s).forEach(function (seg) {
      c.font = seg.sub ? subFont(font) : font;
      c.fillText(seg.t, px, y + (seg.sub ? fp * 0.28 : 0.5));
      px += c.measureText(seg.t).width;
    });
    return w;
  }
  /** 有半透明底框的標籤（支援下標）；傳回外框 */
  function pill(s, x, y, color, font, align, bgA) {
    font = font || '600 12px system-ui, sans-serif';
    const w = richWidth(s, font);
    c.font = font;
    const m = c.measureText('Mg');
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : fontPx(font) * 1.25;
    const ph = fh + 3, pw = w + 10;
    let bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    if (c === ctx && L) {
      // 實驗圖上的標籤不超出世界區的邊緣
      const W0 = L.world;
      if (x >= W0.x && x <= W0.x + W0.w) bx = Math.max(W0.x + 3, Math.min(W0.x + W0.w - pw - 3, bx));
    }
    c.fillStyle = alpha(colors['canvas-bg'], bgA == null ? 0.86 : bgA);
    roundRect(c, bx, y - ph / 2, pw, ph, ph / 2);
    c.fill();
    richText(s, bx + 5, y, color, font, 'left');
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }
  function pillSize(s, font) {
    const w = richWidth(s, font);
    c.font = font;
    const m = c.measureText('Mg');
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : fontPx(font) * 1.25;
    return { w: w + 10, h: fh + 3 };
  }

  /** 向量箭頭（與其他模組相同的幾何）；dashed：虛線箭身；hollow：空心箭頭（反作用力） */
  function arrow(x0, y0, ux, uy, len, lw, color, opt) {
    opt = opt || {};
    if (len < 1) return;
    const head = Math.min(4 * lw, len * 0.6), hw = 1.7 * lw;
    const xt = x0 + ux * len, yt = y0 + uy * len;
    const xh = xt - ux * head, yh = yt - uy * head;
    const nx = -uy, ny = ux;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (len > head + 1) {
      c.lineWidth = lw;
      if (opt.dashed) c.setLineDash([lw * 2.2, lw * 1.8]);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(xh + ux * head * 0.3, yh + uy * head * 0.3); c.stroke();
      c.setLineDash([]);
    }
    c.beginPath();
    c.moveTo(xt, yt);
    c.quadraticCurveTo(xt - ux * head * 0.45 + nx * hw * 0.35, yt - uy * head * 0.45 + ny * hw * 0.35, xh + nx * hw, yh + ny * hw);
    c.lineTo(xh + ux * head * 0.2, yh + uy * head * 0.2);
    c.lineTo(xh - nx * hw, yh - ny * hw);
    c.quadraticCurveTo(xt - ux * head * 0.45 - nx * hw * 0.35, yt - uy * head * 0.45 - ny * hw * 0.35, xt, yt);
    c.closePath();
    if (opt.hollow) {
      c.fillStyle = colors['canvas-bg'];
      c.fill();
      c.lineWidth = 1.4;
      c.stroke();
    } else c.fill();
  }

  // ======================= 材質 =======================
  /** 鋼製砝碼（側視的圓柱）：左右暗、偏左亮；頂面橢圓；鉤子 */
  function steelWeight(x, yTop, w, h, label) {
    const base = colors.dark ? shade(colors.muted, -0.05) : shade(colors.muted, 0.05);
    // 投影
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.22) + ')';
    c.shadowBlur = 8; c.shadowOffsetY = 3;
    const gr = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gr.addColorStop(0, shade(base, -0.45));
    gr.addColorStop(0.28, shade(base, 0.45));
    gr.addColorStop(0.55, base);
    gr.addColorStop(1, shade(base, -0.5));
    c.fillStyle = gr;
    roundRect(c, x - w / 2, yTop, w, h, Math.min(4, h / 3));
    c.fill();
    c.restore();
    // 砝碼片的分隔線（每片約 8 px，只是質感）
    const nS = Math.max(1, Math.round(h / 9));
    c.strokeStyle = alpha(shade(base, -0.55), 0.55);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < nS; i++) {
      const yy = Math.round(yTop + h * i / nS) + 0.5;
      c.moveTo(x - w / 2 + 1, yy); c.lineTo(x + w / 2 - 1, yy);
    }
    c.stroke();
    // 頂邊高光
    c.strokeStyle = alpha('#ffffff', colors.dark ? 0.35 : 0.6);
    c.beginPath(); c.moveTo(x - w / 2 + 3, yTop + 1); c.lineTo(x + w / 2 - 3, yTop + 1); c.stroke();
    // 鉤子
    c.strokeStyle = shade(base, -0.35);
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(x, yTop); c.lineTo(x, yTop - 5);
    c.arc(x + 2.5, yTop - 5, 2.5, Math.PI, Math.PI * 1.9, false);
    c.stroke();
    if (label) {
      c.textAlign = 'center';
      if (h > 14 && w > 20) richText(label, x, yTop + h / 2, colors.dark ? '#111' : '#fff', '700 ' + (L.narrow ? 10 : 11) + 'px system-ui, sans-serif', 'center');
    }
  }
  /** 木塊：上亮下暗的漸層、頂邊高光、底邊暗線、木紋 */
  function woodBlock(x, y, w, h, label, tint) {
    const base0 = colors.dark ? shade(colors.equi, -0.2) : shade(colors.equi, 0.32);
    const base = tint ? shade(base0, tint) : base0;
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.22) + ')';
    c.shadowBlur = 8; c.shadowOffsetY = 3;
    const gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, shade(base, 0.22));
    gr.addColorStop(1, shade(base, -0.18));
    c.fillStyle = gr;
    roundRect(c, x, y, w, h, Math.min(5, h / 4));
    c.fill();
    c.restore();
    c.save();
    roundRect(c, x, y, w, h, Math.min(5, h / 4));
    c.clip();
    c.strokeStyle = alpha(shade(base, -0.4), 0.25);
    c.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const yy = y + h * i / 4;
      c.beginPath(); c.moveTo(x, yy); c.bezierCurveTo(x + w * 0.3, yy - 2, x + w * 0.6, yy + 2, x + w, yy - 1); c.stroke();
    }
    c.restore();
    c.strokeStyle = alpha('#ffffff', colors.dark ? 0.3 : 0.55);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + 4, y + 1); c.lineTo(x + w - 4, y + 1); c.stroke();
    c.strokeStyle = alpha('#000000', 0.25);
    c.beginPath(); c.moveTo(x + 4, y + h - 0.5); c.lineTo(x + w - 4, y + h - 0.5); c.stroke();
    if (label) richText(label, x + w / 2, y + h / 2, colors.dark ? '#1a1206' : '#3b2600', '700 ' + (L.narrow ? 11 : 12) + 'px system-ui, sans-serif', 'center');
  }
  /** 滑輪：金屬圓盤、輪溝、旋轉的輪輻 */
  function pulley(x, y, r, ang) {
    const base = colors.dark ? shade(colors.muted, -0.1) : shade(colors.muted, 0.2);
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.25) + ')';
    c.shadowBlur = 6; c.shadowOffsetY = 2;
    const gr = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, shade(base, 0.55));
    gr.addColorStop(0.6, base);
    gr.addColorStop(1, shade(base, -0.45));
    c.fillStyle = gr;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = alpha(shade(base, -0.6), 0.7);
    c.lineWidth = Math.max(1, r * 0.12);
    c.beginPath(); c.arc(x, y, r * 0.86, 0, Math.PI * 2); c.stroke();
    c.lineWidth = Math.max(1, r * 0.09);
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = ang + i * Math.PI * 2 / 3;
      c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22); c.lineTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72); c.stroke();
    }
    const hub = c.createRadialGradient(x - 1, y - 1, 0.5, x, y, r * 0.24);
    hub.addColorStop(0, shade(base, 0.7));
    hub.addColorStop(1, shade(base, -0.5));
    c.fillStyle = hub;
    c.beginPath(); c.arc(x, y, r * 0.24, 0, Math.PI * 2); c.fill();
  }
  /** 細繩：深色細線＋細亮線（管狀） */
  function rope(pts, slack) {
    const base = colors.dark ? shade(colors.text, -0.35) : shade(colors.text, 0.1);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = base;
    c.lineWidth = 1.8;
    c.beginPath();
    pts.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
    c.stroke();
    if (slack) return;
    c.strokeStyle = alpha(colors.dark ? '#ffffff' : '#ffffff', colors.dark ? 0.18 : 0.35);
    c.lineWidth = 0.6;
    c.beginPath();
    pts.forEach(function (q, i) { if (i) c.lineTo(q[0] - 0.4, q[1] - 0.4); else c.moveTo(q[0] - 0.4, q[1] - 0.4); });
    c.stroke();
  }
  function ropeSag(x0, y0, x1, y1, sag, side) {
    // 鬆弛的繩子：二次曲線往一側彎
    const mx = (x0 + x1) / 2 + side * sag, my = (y0 + y1) / 2;
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), d = u * u;
      pts.push([a * x0 + b * mx + d * x1, a * y0 + b * my + d * y1]);
    }
    rope(pts, true);
  }
  /** 接觸陰影 */
  function contactShadow(x, y, w, lift) {
    const a = (colors.dark ? 0.4 : 0.22) * Math.max(0, 1 - lift / 120);
    if (a <= 0.01) return;
    const r = w * 0.55 * (1 + lift / 200);
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.beginPath(); c.ellipse(x, y, r, Math.max(2, r * 0.18), 0, 0, Math.PI * 2); c.fill();
  }

  // ======================= 靜態背景（參數或主題改變時重畫） =======================
  function buildBackground() {
    bg.width = cv.width; bg.height = cv.height;
    c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'], edge = shade(base, colors.dark ? -0.35 : -0.05);
    // 世界區：徑向暈影
    const R = L.world;
    const rg = c.createRadialGradient(R.x + R.w / 2, R.y + R.h * 0.4, R.h * 0.1, R.x + R.w / 2, R.y + R.h * 0.4, Math.max(R.w, R.h) * 0.8);
    rg.addColorStop(0, colors.dark ? shade(base, 0.03) : base);
    rg.addColorStop(1, edge);
    c.fillStyle = rg;
    roundRect(c, R.x, R.y, R.w, R.h, 8); c.fill();
    [L.timer, L.graph].forEach(function (Q) {
      const gq = c.createLinearGradient(0, Q.y, 0, Q.y + Q.h);
      gq.addColorStop(0, base); gq.addColorStop(1, edge);
      c.fillStyle = gq;
      roundRect(c, Q.x, Q.y, Q.w, Q.h, 8); c.fill();
    });
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    [R, L.timer, L.graph].forEach(function (Q) { roundRect(c, Q.x + 0.5, Q.y + 0.5, Q.w - 1, Q.h - 1, 8); c.stroke(); });

    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8); c.clip();
    // 牆面格線：主格線 0.5 m、次格線 0.1 m
    const px = function (v) { return Math.round(v) + 0.5; };
    const W = L.W;
    [[0.035, 0.1, false], [0.08, 0.5, true]].forEach(function (lv) {
      c.strokeStyle = alpha(colors.text, lv[0] * (colors.dark ? 0.8 : 1));
      c.beginPath();
      const step = lv[1];
      for (let x = Math.ceil(W.x0 / step) * step; x <= W.x1 + 1e-9; x += step) {
        if (!lv[2] && Math.abs(x / 0.5 - Math.round(x / 0.5)) < 1e-6) continue;
        c.moveTo(px(X(x)), R.y); c.lineTo(px(X(x)), px(Y(0)));
      }
      for (let y = step; y <= W.y1 + 1e-9; y += step) {
        if (!lv[2] && Math.abs(y / 0.5 - Math.round(y / 0.5)) < 1e-6) continue;
        c.moveTo(R.x, px(Y(y))); c.lineTo(R.x + R.w, px(Y(y)));
      }
      c.stroke();
    });
    drawFloor();
    if (state.mode === 1) bgAtwood();
    else if (state.mode === 2) bgTable();
    else if (state.mode === 3) bgTrain();
    else bgIncline();
    // 比例尺（左上角）
    scaleBar(R.x + 10, R.y + 14);
    c.restore();
    c = ctx;
  }
  function scaleBar(x, y) {
    const len = 0.5 * L.k;
    const f = '600 ' + L.fs + 'px system-ui, sans-serif';
    const lab = '0.5 m';
    c.font = f;
    const tw = c.measureText(lab).width;
    c.fillStyle = alpha(colors['canvas-bg'], 0.8);
    roundRect(c, x - 4, y - 9, len + tw + 18, 20, 6); c.fill();
    c.strokeStyle = colors.muted; c.lineWidth = 1.5; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.moveTo(x, y); c.lineTo(x + len, y); c.moveTo(x + len, y - 4); c.lineTo(x + len, y + 4); c.stroke();
    c.fillStyle = colors.muted; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(lab, x + len + 6, y + 0.5);
  }
  function drawFloor() {
    const y0 = Y(0), R = L.world;
    const gr = c.createLinearGradient(0, y0, 0, R.y + R.h);
    const fb = colors.dark ? shade(colors.muted, -0.62) : shade(colors.muted, 0.62);
    gr.addColorStop(0, fb); gr.addColorStop(1, shade(fb, colors.dark ? -0.3 : -0.12));
    c.fillStyle = gr;
    c.fillRect(R.x, y0, R.w, R.y + R.h - y0);
    c.strokeStyle = alpha(colors.text, 0.12);
    c.lineWidth = 1;
    c.beginPath();
    for (let x = R.x - 20; x < R.x + R.w; x += 12) { c.moveTo(x, R.y + R.h); c.lineTo(x + 14, y0 + 2); }
    c.stroke();
    c.strokeStyle = colors.dark ? shade(colors.muted, -0.2) : shade(colors.muted, -0.15);
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(R.x, Math.round(y0) + 0.5); c.lineTo(R.x + R.w, Math.round(y0) + 0.5); c.stroke();
  }
  /** 金屬架（樑、桿）：上亮下暗 */
  function metalBar(x, y, w, h) {
    const base = colors.dark ? shade(colors.muted, -0.3) : shade(colors.muted, 0.15);
    const gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, shade(base, 0.35)); gr.addColorStop(1, shade(base, -0.3));
    c.fillStyle = gr;
    roundRect(c, x, y, w, h, Math.min(3, Math.abs(h) / 2, Math.abs(w) / 2)); c.fill();
  }
  function photogate(x, yBeam, gap, label, vertical) {
    // 光電閘：兩支柱子＋紅外光束（虛線）
    const col = colors.dark ? shade(colors.muted, -0.15) : shade(colors.text, 0.25);
    c.fillStyle = col;
    if (!vertical) {
      roundRect(c, x - gap / 2 - 5, yBeam - 9, 5, 18, 2); c.fill();
      roundRect(c, x + gap / 2, yBeam - 9, 5, 18, 2); c.fill();
      c.strokeStyle = alpha(colors.pos, 0.6); c.lineWidth = 1; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(x - gap / 2, yBeam); c.lineTo(x + gap / 2, yBeam); c.stroke(); c.setLineDash([]);
    } else {
      roundRect(c, x - 9, yBeam - gap / 2 - 5, 18, 5, 2); c.fill();
      roundRect(c, x - 9, yBeam + gap / 2, 18, 5, 2); c.fill();
      c.strokeStyle = alpha(colors.pos, 0.6); c.lineWidth = 1; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(x, yBeam - gap / 2); c.lineTo(x, yBeam + gap / 2); c.stroke(); c.setLineDash([]);
    }
    c.fillStyle = colors.pos;
    c.beginPath(); c.arc(vertical ? x : x - gap / 2 - 2.5, vertical ? yBeam - gap / 2 - 2.5 : yBeam - 6, 1.8, 0, Math.PI * 2); c.fill();
    if (label) pill(label, vertical ? x : x + gap / 2 + 8, vertical ? yBeam - gap / 2 - 16 : yBeam - 18, colors.muted, '600 ' + (L.fs - 1) + 'px system-ui, sans-serif', vertical ? 'center' : 'left', 0.7);
  }

  function bgAtwood() {
    const G = state.geo, P = G.pulley;
    // 天花板的樑
    metalBar(X(-0.5), Y(G.ceiling + 0.06), 1.0 * L.k, 0.06 * L.k);
    c.strokeStyle = alpha(colors.muted, 0.5); c.lineWidth = 1;
    c.beginPath();
    for (let x = -0.5; x < 0.5; x += 0.05) { c.moveTo(X(x), Y(G.ceiling + 0.06)); c.lineTo(X(x + 0.04), Y(G.ceiling + 0.11)); }
    c.stroke();
    // 滑輪支架
    const base = colors.dark ? shade(colors.muted, -0.25) : shade(colors.muted, 0.05);
    c.fillStyle = base;
    c.beginPath();
    c.moveTo(X(-0.03), Y(G.ceiling)); c.lineTo(X(0.03), Y(G.ceiling)); c.lineTo(X(0.012), Y(P.y)); c.lineTo(X(-0.012), Y(P.y)); c.closePath(); c.fill();
    // 地上的軟墊（m1 落地處）
    const pw = (G.B.w + 0.08) * L.k;
    c.fillStyle = alpha(colors.neg, colors.dark ? 0.35 : 0.22);
    roundRect(c, X(G.B.x) - pw / 2, Y(0) - 1, pw, 5, 2); c.fill();
    // 米尺（左側）：從地板到 1.2 m
    ruler(-0.8, 0, 1.2, true);
    // 起始高度 h 的標記
    c.strokeStyle = alpha(colors.accent, 0.6); c.lineWidth = 1; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(X(-0.77), Y(G.B.y0)); c.lineTo(X(G.B.x - G.B.w / 2 - 0.02), Y(G.B.y0)); c.stroke(); c.setLineDash([]);
    pill('h = ' + num(state.p.h, 2) + ' m', X(-0.76) + 4, Y(G.B.y0) - 11, colors.accent, '600 ' + L.fs + 'px system-ui, sans-serif', 'left', 0.8);
    // 光電閘（地板附近）
    photogate(X(G.B.x), Y(0.012), (G.B.w + 0.06) * L.k, null, false);
    pill(T('光電閘', 'Photogate'), X(G.B.x) - (G.B.w / 2 + 0.05) * L.k, Y(0.012) - 14, colors.muted, '600 ' + (L.fs - 1) + 'px system-ui, sans-serif', 'right', 0.7);
  }
  function ruler(x, y0, len, vertical) {
    const w = 0.035 * L.k;
    const base = colors.dark ? shade(colors.equi, -0.35) : shade(colors.equi, 0.72);
    c.fillStyle = base;
    if (vertical) roundRect(c, X(x) - w / 2, Y(y0 + len), w, len * L.k, 2);
    else roundRect(c, X(x), Y(y0) - w, len * L.k, w, 2);
    c.fill();
    c.strokeStyle = alpha(colors.text, 0.55); c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= Math.round(len * 100); i++) {
      const t = i / 100, l = i % 10 === 0 ? w * 0.7 : i % 5 === 0 ? w * 0.5 : w * 0.28;
      if (L.k * 0.01 < 2.2 && i % 5 !== 0) continue;
      if (vertical) { const yy = Math.round(Y(y0 + t)) + 0.5; c.moveTo(X(x) - w / 2, yy); c.lineTo(X(x) - w / 2 + l, yy); }
      else { const xx = Math.round(X(x + t)) + 0.5; c.moveTo(xx, Y(y0) - w); c.lineTo(xx, Y(y0) - w + l); }
    }
    c.stroke();
    c.font = '600 ' + (L.fs - 1) + 'px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    for (let i = 2; i <= Math.round(len * 10); i += 2) {
      const t = i / 10;
      if (vertical) { c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(num(t, 1), X(x) - w / 2 - 3, Y(y0 + t)); }
      else { c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(num(t, 1), X(x + t), Y(y0) + 3); }
    }
  }
  function table2Shape(G) {
    // 桌面（厚 0.05 m）與桌腳
    const top = G.tableH, x0 = G.tableL, x1 = G.tableR;
    const wood = colors.dark ? shade(colors.muted, -0.45) : shade(colors.muted, 0.45);
    const gr = c.createLinearGradient(0, Y(top), 0, Y(top - 0.05));
    gr.addColorStop(0, shade(wood, 0.25)); gr.addColorStop(1, shade(wood, -0.2));
    c.fillStyle = gr;
    roundRect(c, X(x0), Y(top), (x1 - x0) * L.k, 0.05 * L.k, 3); c.fill();
    c.strokeStyle = alpha('#ffffff', colors.dark ? 0.2 : 0.6); c.lineWidth = 1;
    c.beginPath(); c.moveTo(X(x0) + 3, Math.round(Y(top)) + 0.5); c.lineTo(X(x1) - 3, Math.round(Y(top)) + 0.5); c.stroke();
    [x0 + 0.06, x1 - 0.1].forEach(function (lx) { metalBar(X(lx), Y(top - 0.05), 0.04 * L.k, (top - 0.05) * L.k); });
  }
  function bgTable() {
    const G = state.geo, P = G.pulley;
    table2Shape(G);
    // 擋板
    metalBar(X(G.bumper), Y(G.tableH + 0.07), 0.05 * L.k, 0.07 * L.k);
    c.fillStyle = alpha(colors.neg, colors.dark ? 0.5 : 0.35);
    roundRect(c, X(G.bumper) - 3, Y(G.tableH + 0.06), 4, 0.05 * L.k, 1.5); c.fill();
    // 滑輪夾具
    metalBar(X(G.tableR - 0.02), Y(G.tableH + 0.01), 0.06 * L.k + (P.x - G.tableR) * L.k, 0.07 * L.k);
    // 桌邊尺（沿桌面）
    ruler(G.bumper - state.p.d - 0.02 - C.SIZE.blockW(state.p.M) * 0, G.tableH - 0.05, 0, false);
    // 起點與擋板之間的距離 d
    const xa = X(G.bumper - state.p.d), xb = X(G.bumper);
    const yy = Y(G.tableH) + 0.05 * L.k + 14;
    c.strokeStyle = alpha(colors.accent, 0.7); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(xa, yy - 5); c.lineTo(xa, yy + 5); c.moveTo(xa, yy); c.lineTo(xb, yy); c.moveTo(xb, yy - 5); c.lineTo(xb, yy + 5); c.stroke();
    pill('d = ' + num(state.p.d, 2) + ' m', (xa + xb) / 2, yy, colors.accent, '600 ' + L.fs + 'px system-ui, sans-serif', 'center', 0.85);
    gatePost(G.bumper - 0.03, G.tableH, 0, C.SIZE.blockH);
  }
  /** 側視的光電閘：一支立柱（沿表面法線）＋頂端感測頭；紅點是光束（垂直紙面）的位置 */
  function gatePost(xs, ys, ang, hgt) {
    const nx = -Math.sin(ang), ny = Math.cos(ang), tx = Math.cos(ang), ty = Math.sin(ang);
    const top = hgt + 0.1;
    const x0 = X(xs), y0 = Y(ys), x1 = X(xs + nx * top), y1 = Y(ys + ny * top);
    c.strokeStyle = colors.dark ? shade(colors.muted, -0.15) : shade(colors.text, 0.3);
    c.lineWidth = Math.max(2, 0.018 * L.k); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.save();
    c.translate(x1, y1); c.rotate(-ang);
    metalBar(-0.05 * L.k, -0.035 * L.k, 0.1 * L.k, 0.035 * L.k);
    c.restore();
    const bx = X(xs + nx * hgt / 2), by = Y(ys + ny * hgt / 2);
    c.fillStyle = alpha(colors.pos, 0.85);
    c.beginPath(); c.arc(bx, by, 2.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = alpha(colors.pos, 0.35); c.lineWidth = 1;
    c.beginPath(); c.arc(bx, by, 4.5, 0, Math.PI * 2); c.stroke();
    void tx; void ty;
    c.textAlign = 'left';
    pill(T('光電閘', 'Photogate'), x1 + 0.06 * L.k * Math.cos(ang) + 4, y1 - 0.06 * L.k * Math.sin(ang) - 10, colors.muted, '600 ' + (L.fs - 1) + 'px system-ui, sans-serif', 'left', 0.7);
  }
  function bgIncline() {
    const G = state.geo, P = G.pulley, th = G.theta * DEG;
    // 實驗桌
    const bx0 = G.P0.x - 0.22, bx1 = 0.04;
    const wood = colors.dark ? shade(colors.muted, -0.45) : shade(colors.muted, 0.45);
    const gr = c.createLinearGradient(0, Y(G.benchH), 0, Y(G.benchH - 0.05));
    gr.addColorStop(0, shade(wood, 0.25)); gr.addColorStop(1, shade(wood, -0.2));
    c.fillStyle = gr;
    roundRect(c, X(bx0), Y(G.benchH), (bx1 - bx0) * L.k, 0.05 * L.k, 3); c.fill();
    [bx0 + 0.06, bx1 - 0.1].forEach(function (lx) { metalBar(X(lx), Y(G.benchH - 0.05), 0.04 * L.k, (G.benchH - 0.05) * L.k); });
    // 斜面（三角形木塊）
    const wb = colors.dark ? shade(colors.accent, -0.55) : shade(colors.accent, 0.72);
    const gw = c.createLinearGradient(X(G.P0.x), Y(G.P1.y), X(0), Y(G.benchH));
    gw.addColorStop(0, shade(wb, 0.18)); gw.addColorStop(1, shade(wb, -0.15));
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.45 : 0.18) + ')'; c.shadowBlur = 8; c.shadowOffsetY = 2;
    c.fillStyle = gw;
    c.beginPath(); c.moveTo(X(G.P0.x), Y(G.P0.y)); c.lineTo(X(0), Y(G.benchH)); c.lineTo(X(G.P1.x), Y(G.P1.y)); c.closePath(); c.fill();
    c.restore();
    c.strokeStyle = alpha(colors.dark ? '#ffffff' : '#ffffff', colors.dark ? 0.25 : 0.7); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(X(G.P0.x), Y(G.P0.y)); c.lineTo(X(G.P1.x), Y(G.P1.y)); c.stroke();
    // 頂端延伸的滑輪架
    c.strokeStyle = colors.dark ? shade(colors.muted, -0.2) : shade(colors.muted, 0.1); c.lineWidth = Math.max(2, 0.025 * L.k);
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(X(G.P1.x), Y(G.P1.y)); c.lineTo(X(P.x), Y(P.y)); c.stroke();
    // 擋板（上、下）
    [G.stopTop, G.stopBot].forEach(function (s, i) {
      const q = slopePt(i === 0 ? s : s - 0.045, 0);
      c.save();
      c.translate(X(q.x), Y(q.y)); c.rotate(-th);
      metalBar(0, -0.08 * L.k, 0.045 * L.k, 0.08 * L.k);
      c.fillStyle = alpha(colors.neg, colors.dark ? 0.6 : 0.45);
      roundRect(c, i === 0 ? -2.5 : 0.045 * L.k - 1.5, -0.07 * L.k, 4, 0.06 * L.k, 1.5); c.fill();
      c.restore();
    });
    {
      const q = slopePt(G.stopTop - 0.035, 0);
      gatePost(q.x, q.y, th, C.SIZE.blockH);
    }
    // 角度 θ
    if (G.theta > 0.5) {
      const r = Math.min(60, Math.max(26, 0.3 * L.k));
      c.strokeStyle = alpha(colors.text, 0.6); c.lineWidth = 1.3;
      c.beginPath(); c.arc(X(G.P0.x), Y(G.P0.y), r, -th, 0); c.stroke();
      c.textAlign = 'left';
      pill('θ = ' + num(G.theta, 0) + '°', X(G.P0.x) + r + 4, Y(G.P0.y) - Math.max(9, r * Math.sin(th / 2) * 0.9), colors.text, '600 ' + L.fs + 'px system-ui, sans-serif', 'left', 0.8);
    }
  }
  /** 斜面上沿斜面距離 s（由底端量起）、垂直斜面高度 e 的點 */
  function slopePt(s, e) {
    const G = state.geo, th = G.theta * DEG;
    return { x: G.P0.x + s * Math.cos(th) - e * Math.sin(th), y: G.P0.y + s * Math.sin(th) + e * Math.cos(th) };
  }
  function bgTrain() {
    const G = state.geo;
    // 地面上的刻度（每 0.1 m）
    c.strokeStyle = alpha(colors.text, 0.3); c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= G.finish + 0.4; x += 0.1) {
      const xx = Math.round(X(x)) + 0.5, big = Math.abs(x * 2 - Math.round(x * 2)) < 1e-6;
      c.moveTo(xx, Y(0) + 2); c.lineTo(xx, Y(0) + (big ? 9 : 5));
    }
    c.stroke();
    // 起跑線（前方木塊的起點）與終點線
    const xs = X(G.front0), xf = X(G.finish);
    c.strokeStyle = alpha(colors.accent, 0.6); c.setLineDash([4, 4]); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(xs, Y(0)); c.lineTo(xs, Y(0.5)); c.stroke(); c.setLineDash([]);
    // 終點：棋盤格旗桿
    const hh = 0.5 * L.k, sq = Math.max(4, Math.min(8, 0.035 * L.k));
    for (let i = 0; i * sq < hh; i++) {
      c.fillStyle = i % 2 ? alpha(colors.text, 0.75) : alpha(colors['canvas-bg'], 0.95);
      c.fillRect(xf - sq / 2, Y(0) - (i + 1) * sq, sq, sq);
    }
    c.strokeStyle = alpha(colors.text, 0.6); c.lineWidth = 1;
    c.strokeRect(Math.round(xf - sq / 2) + 0.5, Y(0) - Math.ceil(hh / sq) * sq, sq, Math.ceil(hh / sq) * sq);
    const yy = Y(0) + 22;
    c.strokeStyle = alpha(colors.accent, 0.7); c.lineWidth = 1.2; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(xs, yy - 5); c.lineTo(xs, yy + 5); c.moveTo(xs, yy); c.lineTo(xf, yy); c.moveTo(xf, yy - 5); c.lineTo(xf, yy + 5); c.stroke();
    pill('d = ' + num(state.p.d, 2) + ' m', (xs + xf) / 2, yy, colors.accent, '600 ' + L.fs + 'px system-ui, sans-serif', 'center', 0.85);
    pill(T('終點', 'Finish'), xf, Y(0.5) - 12, colors.text, '700 ' + L.fs + 'px system-ui, sans-serif', 'center', 0.8);
  }

  // ======================= 動態繪圖 =======================
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function current() { return C.stateAt(state.tl, state.phase === 'ready' ? 0 : state.t); }

  function draw() {
    if (!L) return;
    c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    c.drawImage(bg, 0, 0, cw, ch);
    const st = current();
    const R = L.world;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 8); c.clip();
    if (state.mode === 1) drawAtwood(st);
    else if (state.mode === 2) drawTable(st);
    else if (state.mode === 3) drawTrain(st);
    else drawIncline(st);
    drawFx();
    c.restore();
    drawTimer();
    drawGraph();
    const key = segKey(st);
    if (key !== state.segKey) {
      state.segKey = key; drawFbd(st); updateReadouts(st);
      $('fbdNote').textContent = state.phase === 'ready'
        ? T('顯示釋放後瞬間的受力；所有箭頭使用同一個力的比例尺', 'Forces just after release; every arrow uses the same force scale')
        : T('所有箭頭使用同一個力的比例尺', 'Every arrow uses the same force scale');
    }
  }
  function segKey(st) { return state.mode + ':' + state.tl.segs.indexOf(st.seg) + ':' + state.phase.charAt(0) + ':' + (state.tl ? state.tl.segs.length : 0); }

  /** 物體上的力（實驗圖，依 kS 比例）；中心 (x, y) 為畫布座標 */
  function sceneForces(body, x, y, labels) {
    if (!state.show.forces) return;
    body.forces.forEach(function (f, i) {
      const F = Math.hypot(f.x, f.y);
      if (F < 1e-9) return;
      const ux = f.x / F, uy = -f.y / F;
      const len = F * state.kS;
      const off = parallelOffset(body.forces, i) * 5;
      arrow(x - uy * off, y + ux * off, ux, uy, len, L.lw - 0.4, colors.F[f.key]);
      if (labels !== false && len > 14) {
        const lab = forceLabel(f, body);
        pill(lab, x - uy * off + ux * (len + 10), y + ux * off + uy * (len + 10), colors.F[f.key], '600 ' + (L.fs - 1) + 'px system-ui, sans-serif', 'center', 0.7);
      }
    });
  }
  /** 方向相同的力往旁邊錯開 */
  function parallelOffset(list, i) {
    const f = list[i], F = Math.hypot(f.x, f.y);
    const same = [];
    list.forEach(function (q, j) {
      const Q = Math.hypot(q.x, q.y);
      if (Q < 1e-9) return;
      if ((q.x * f.x + q.y * f.y) / (Q * F) > 0.985) same.push(j);
    });
    if (same.length < 2) return 0;
    const k = same.indexOf(i);
    return k - (same.length - 1) / 2;
  }
  function accArrow(x, y, ax, ay, side) {
    if (!state.show.acc) return;
    const a = Math.hypot(ax, ay);
    if (a < 1e-6) return;
    const ux = ax / a, uy = -ay / a;
    let len = a * ACC_SCALE * L.k;
    const maxL = 0.55 * L.k;
    const broken = len > maxL;
    if (broken) len = maxL;
    const sx = x + side[0], sy = y + side[1];
    len = Math.max(len, 8);
    arrow(sx, sy, ux, uy, len, L.lw - 0.6, colors.accent, { dashed: true });
    pill(broken ? 'a ≈' : 'a', sx + ux * (len + 10), sy + uy * (len + 9), colors.accent, 'italic 700 ' + L.fs + 'px system-ui, sans-serif', 'center', 0.75);
  }
  /** 第三定律力對：物體受的力（實心）與物體施給接觸面的反作用力（空心），畫在接觸點 */
  function contactPair(x, y, fx, fy, key, label) {
    if (!state.show.pairs) return;
    const F = Math.hypot(fx, fy);
    if (F < 1e-6) return;
    const ux = fx / F, uy = -fy / F;
    const len = Math.max(8, F * state.kS * 0.8);
    const col = colors.F[key];
    arrow(x, y, ux, uy, len, L.lw - 0.8, col);
    arrow(x, y, -ux, -uy, len, L.lw - 0.8, col, { hollow: true });
    if (label && len > 10) {
      pill(label + '′', x - ux * (len + 10) + (Math.abs(ux) < 0.3 ? 14 : 0), y - uy * (len + 10), col, '600 ' + (L.fs - 1) + 'px system-ui, sans-serif', 'center', 0.7);
    }
  }

  /** 標籤放在物體右邊；放不下時改放左邊 */
  function labelBeside(text, xL, xR, y, color, font) {
    const w = pillSize(text, font).w;
    if (xR + 8 + w <= L.world.x + L.world.w - 3) pill(text, xR + 8, y, color, font, 'left', 0.8);
    else pill(text, xL - 8, y, color, font, 'right', 0.8);
  }
  function bodiesNow(st) { return C.bodyForces(state.mode, state.p, st).bodies; }

  // ---------- 模式 1：阿特午機 ----------
  function drawAtwood(st) {
    const G = state.geo, P = G.pulley, p = state.p;
    const R = P.r * L.k;
    const yB = G.B.y0 - st.xB, yA = G.A.y0 + st.xA;  // 底面高度
    const bTop = yB + G.B.h, aTop = yA + G.A.h;
    const wB = G.B.w * L.k, wA = G.A.w * L.k;
    contactShadow(X(G.B.x), Y(0), wB, (yB) * L.k);
    contactShadow(X(G.A.x), Y(0), wA, (yA) * L.k);
    // 繩子
    const tautR = st.taut;
    const top = [];
    for (let i = 0; i <= 18; i++) { const a = Math.PI + Math.PI * i / 18; top.push([X(P.x) + R * Math.cos(a), Y(P.y) + R * Math.sin(a)]); }
    rope([[X(G.B.x), Y(bTop) - 5]].concat([[X(-P.r), Y(P.y)]]).concat(top).concat(tautR ? [[X(P.r), Y(aTop) - 5]] : []), false);
    if (!tautR) {
      const slack = (st.xA - st.xB) * L.k;
      ropeSag(X(P.r), Y(P.y), X(G.A.x), Y(aTop) - 5, Math.min(0.12 * L.k, Math.sqrt(Math.max(0, slack) * 0.25 * L.k)), 1);
    }
    pulley(X(P.x), Y(P.y), R, -st.xB / P.r);
    // 物體
    steelWeight(X(G.B.x), Y(bTop), wB, G.B.h * L.k, 'm_1');
    steelWeight(X(G.A.x), Y(aTop), wA, G.A.h * L.k, 'm_2');
    // 釋放前：夾住 m1 的電磁鐵
    if (state.phase === 'ready') holdClamp(X(G.B.x) - wB / 2, Y(bTop) + G.B.h * L.k / 2, -1);
    const bs = bodiesNow(st);
    const A = bs[0], B = bs[1];
    // 質量標籤
    const f = '700 ' + L.fs + 'px system-ui, sans-serif';
    pill('m_1 = ' + num(p.m1, 3) + ' kg', X(G.B.x) - wB / 2 - 4, Y(bTop) - 14, colors.text, f, 'right', 0.8);
    pill('m_2 = ' + num(p.m2, 3) + ' kg', X(G.A.x) + wA / 2 + 24, Y(aTop) - 14, colors.text, f, 'left', 0.8);
    // 力與加速度
    sceneForces(B, X(G.B.x), Y(yB + G.B.h / 2));
    sceneForces(A, X(G.A.x), Y(yA + G.A.h / 2));
    accArrow(X(G.B.x), Y(yB + G.B.h / 2), B.ax, B.ay, [-wB / 2 - 12, 0]);
    accArrow(X(G.A.x), Y(yA + G.A.h / 2), A.ax, A.ay, [wA / 2 + 12, 0]);
    // 接觸地板時的第三定律力對
    const NB = B.forces.find(function (q) { return q.key === 'N'; });
    if (NB) contactPair(X(G.B.x), Y(0), 0, NB.y, 'N', 'N');
    const NA = A.forces.find(function (q) { return q.key === 'N'; });
    if (NA && yA < 1e-6) contactPair(X(G.A.x), Y(0), 0, NA.y, 'N', 'N');
  }
  function holdClamp(x, y, side) {
    // 電磁鐵（釋放前夾住物體）
    const w = 9, h = 16;
    const xx = side < 0 ? x - w - 1 : x + 1;
    metalBar(xx, y - h / 2, w, h);
    c.fillStyle = colors.pos;
    c.beginPath(); c.arc(xx + w / 2, y - h / 2 - 3, 2, 0, Math.PI * 2); c.fill();
  }

  // ---------- 模式 2：桌面＋懸掛 ----------
  function drawTable(st) {
    const G = state.geo, P = G.pulley, p = state.p;
    const R = P.r * L.k;
    const ax0 = G.A.x0 + st.xA;               // 木塊左緣
    const wA = G.A.w, hA = G.A.h;
    const yTopB = G.B.yTop0 - st.xB;
    const hB = G.B.h;
    contactShadow(X(G.B.x), Y(0), G.B.w * L.k, (yTopB - hB) * L.k);
    // 繩子：木塊前方中間 → 滑輪頂 → 右側往下
    const arc = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + Math.PI / 2 * i / 10; arc.push([X(P.x) + R * Math.cos(a), Y(P.y) + R * Math.sin(a)]); }
    rope([[X(ax0 + wA), Y(G.tableH + hA / 2)], [X(P.x), Y(P.y + P.r)]].concat(arc).concat(st.taut ? [[X(G.B.x), Y(yTopB) - 5]] : []), false);
    if (!st.taut) ropeSag(X(G.B.x), Y(P.y), X(G.B.x), Y(yTopB) - 5, 0.05 * L.k, 1);
    pulley(X(P.x), Y(P.y), R, st.xB / P.r);
    contactShadow(X(ax0 + wA / 2), Y(G.tableH), wA * L.k, 0);
    woodBlock(X(ax0), Y(G.tableH + hA), wA * L.k, hA * L.k, 'M');
    steelWeight(X(G.B.x), Y(yTopB), G.B.w * L.k, hB * L.k, 'm');
    if (state.phase === 'ready') holdClamp(X(ax0), Y(G.tableH + hA / 2), -1);
    const bs = bodiesNow(st), A = bs[0], B = bs[1];
    const f = '700 ' + L.fs + 'px system-ui, sans-serif';
    pill('M = ' + num(p.M, 3) + ' kg', X(ax0 + wA / 2), Y(G.tableH + hA) - 14, colors.text, f, 'center', 0.8);
    labelBeside('m = ' + num(p.m, 3) + ' kg', X(G.B.x) - G.B.w * L.k / 2, X(G.B.x) + G.B.w * L.k / 2, Y(yTopB) + 4, colors.text, f);
    pill('μ_s = ' + num(p.muS, 2) + '  μ_k = ' + num(p.muK, 2), X(G.tableL + 0.05), Y(G.tableH) + 0.05 * L.k + 14, colors.F.f, '600 ' + L.fs + 'px system-ui, sans-serif', 'left', 0.8);
    const cxA = X(ax0 + wA / 2), cyA = Y(G.tableH + hA / 2);
    sceneForces(A, cxA, cyA);
    sceneForces(B, X(G.B.x), Y(yTopB - hB / 2));
    accArrow(cxA, cyA - hA * L.k / 2 - 2, A.ax, A.ay, [0, -14]);
    accArrow(X(G.B.x), Y(yTopB - hB / 2), B.ax, B.ay, [-G.B.w * L.k / 2 - 14, 0]);
    // 木塊與桌面的第三定律力對（正向力、摩擦力）
    const N = A.forces.find(function (q) { return q.key === 'N'; });
    const fr = A.forces.find(function (q) { return q.key === 'f'; });
    const by = Y(G.tableH);
    if (N) contactPair(cxA - wA * L.k * 0.22, by, N.x, N.y, 'N', 'N');
    if (fr) contactPair(cxA + wA * L.k * 0.18, by, fr.x, fr.y, 'f', fr.kind === 'static' ? 'f_s' : 'f_k');
  }

  // ---------- 模式 4：斜面＋懸掛 ----------
  function drawIncline(st) {
    const G = state.geo, P = G.pulley, p = state.p, th = G.theta * DEG;
    const R = P.r * L.k;
    const s0 = G.A.s0 + st.xA, wA = G.A.w, hA = G.A.h;
    const yTopB = G.B.yTop0 - st.xB, hB = G.B.h;
    contactShadow(X(G.B.x), Y(0), G.B.w * L.k, (yTopB - hB) * L.k);
    // 繩子：木塊前方中點（距斜面 hA/2）→ 滑輪切點 → 右側往下
    const front = slopePt(s0 + wA, hA / 2);
    const tang = { x: P.x - Math.sin(th) * P.r, y: P.y + Math.cos(th) * P.r };
    const arc = [];
    const a0 = -(Math.PI / 2 + th), a1 = 0; // 畫布角度：切點 → 最右點
    for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12; arc.push([X(P.x) + R * Math.cos(a), Y(P.y) + R * Math.sin(a)]); }
    rope([[X(front.x), Y(front.y)], [X(tang.x), Y(tang.y)]].concat(arc).concat(st.taut ? [[X(G.B.x), Y(yTopB) - 5]] : []), false);
    if (!st.taut) ropeSag(X(G.B.x), Y(P.y), X(G.B.x), Y(yTopB) - 5, Math.min(0.12 * L.k, 0.4 * (st.xA - st.xB) * L.k + 4), -1);
    pulley(X(P.x), Y(P.y), R, st.xB / P.r);
    // 木塊（旋轉）
    const q0 = slopePt(s0, 0);
    c.save();
    c.translate(X(q0.x), Y(q0.y));
    c.rotate(-th);
    woodBlock(0, -hA * L.k, wA * L.k, hA * L.k, 'M');
    c.restore();
    steelWeight(X(G.B.x), Y(yTopB), G.B.w * L.k, hB * L.k, 'm');
    const ctr = slopePt(s0 + wA / 2, hA / 2);
    if (state.phase === 'ready') {
      const qh = slopePt(s0, hA / 2);
      holdClamp(X(qh.x), Y(qh.y), -1);
    }
    const bs = bodiesNow(st), A = bs[0], B = bs[1];
    const f = '700 ' + L.fs + 'px system-ui, sans-serif';
    const lab = slopePt(s0 + wA / 2, hA + 0.12);
    pill('M = ' + num(p.M, 3) + ' kg', X(lab.x) - 6, Y(lab.y), colors.text, f, 'right', 0.8);
    labelBeside('m = ' + num(p.m, 3) + ' kg', X(G.B.x) - G.B.w * L.k / 2, X(G.B.x) + G.B.w * L.k / 2, Y(yTopB) + 4, colors.text, f);
    const lp = slopePt(0.15, -0.1);
    pill('μ_s = ' + num(p.muS, 2) + '  μ_k = ' + num(p.muK, 2), X(lp.x) + 8, Y(G.benchH) + 0.05 * L.k + 14, colors.F.f, '600 ' + L.fs + 'px system-ui, sans-serif', 'left', 0.8);
    const cx = X(ctr.x), cy = Y(ctr.y);
    // 重力分量（虛線）
    if (state.show.comp && G.theta > 0.5) {
      const W = p.M * g, kS = state.kS;
      const ls = W * Math.sin(th) * kS, lc = W * Math.cos(th) * kS;
      arrow(cx, cy, -Math.cos(th), Math.sin(th), ls, L.lw - 1, alpha(colors.F.W, 0.7), { dashed: true });
      arrow(cx, cy, Math.sin(th), Math.cos(th), lc, L.lw - 1, alpha(colors.F.W, 0.7), { dashed: true });
      if (ls > 16) pill('Mg sinθ', cx - Math.cos(th) * (ls + 26), cy + Math.sin(th) * (ls + 8), colors.F.W, '600 ' + (L.fs - 1) + 'px system-ui, sans-serif', 'center', 0.7);
      if (lc > 16) pill('Mg cosθ', cx + Math.sin(th) * (lc + 10) + 24, cy + Math.cos(th) * (lc + 4), colors.F.W, '600 ' + (L.fs - 1) + 'px system-ui, sans-serif', 'center', 0.7);
    }
    sceneForces(A, cx, cy);
    sceneForces(B, X(G.B.x), Y(yTopB - hB / 2));
    const up = slopePt(s0 + wA / 2, hA + 0.04);
    accArrow(X(up.x), Y(up.y), A.ax, A.ay, [0, 0]);
    accArrow(X(G.B.x), Y(yTopB - hB / 2), B.ax, B.ay, [-G.B.w * L.k / 2 - 14, 0]);
    const N = A.forces.find(function (q) { return q.key === 'N'; });
    const fr = A.forces.find(function (q) { return q.key === 'f'; });
    const b1 = slopePt(s0 + wA * 0.28, 0), b2 = slopePt(s0 + wA * 0.72, 0);
    if (N) contactPair(X(b1.x), Y(b1.y), N.x, N.y, 'N', 'N');
    if (fr) contactPair(X(b2.x), Y(b2.y), fr.x, fr.y, 'f', fr.kind === 'static' ? 'f_s' : 'f_k');
  }

  // ---------- 模式 3：推拉連體 ----------
  function drawTrain(st) {
    const G = state.geo, p = state.p, n = p.m.length;
    const x = st.x, h = G.h;
    const bs = bodiesNow(st);
    const fsm = '600 ' + (L.fs - 1) + 'px system-ui, sans-serif';
    const f = '700 ' + L.fs + 'px system-ui, sans-serif';
    // 繩子（拉）
    if (!p.push) {
      for (let i = 0; i < n - 1; i++) {
        const xa = X(G.xs[i] + G.ws[i] + x), xb = X(G.xs[i + 1] + x);
        rope([[xa, Y(h / 2)], [xb, Y(h / 2)]], false);
      }
    }
    for (let i = 0; i < n; i++) {
      const bx = G.xs[i] + x;
      contactShadow(X(bx + G.ws[i] / 2), Y(0), G.ws[i] * L.k, 0);
      woodBlock(X(bx), Y(h), G.ws[i] * L.k, h * L.k, null, [0, -0.12, 0.12][i]);
      const ink = colors.dark ? '#1a1206' : '#3b2600';
      const cxb = X(bx + G.ws[i] / 2);
      const mtxt = num(p.m[i], 2) + ' kg', mf = '600 ' + (L.fs - 1) + 'px system-ui, sans-serif';
      if (richWidth(mtxt, mf) < G.ws[i] * L.k - 4 && h * L.k > 30) {
        richText('m_' + (i + 1), cxb, Y(h * 0.68), ink, '700 ' + L.fs + 'px system-ui, sans-serif', 'center');
        richText(mtxt, cxb, Y(h * 0.3), ink, mf, 'center');
      } else {
        richText('m_' + (i + 1), cxb, Y(h * 0.5), ink, '700 ' + L.fs + 'px system-ui, sans-serif', 'center');
        pill(mtxt, cxb, Y(0) + 12 + (i % 2) * 0, colors.muted, mf, 'center', 0.7);
      }
    }
    // 施力裝置：推桿或拉繩＋力感測器
    const sensor = colors.dark ? shade(colors.pos, -0.35) : shade(colors.pos, 0.6);
    let fx0, fux;
    if (p.push) {
      const x0 = X(G.xs[0] + x);
      const len = 0.34 * L.k;
      metalBar(x0 - len, Y(h / 2) - 3, len - 16, 6);
      c.fillStyle = sensor;
      roundRect(c, x0 - 18, Y(h / 2) - 10, 16, 20, 4); c.fill();
      c.strokeStyle = colors.F.F; c.lineWidth = 1.4;
      roundRect(c, x0 - 17.5, Y(h / 2) - 9.5, 15, 19, 4); c.stroke();
      fx0 = x0 - len - 6; fux = 1;
    } else {
      const xr = X(G.xs[n - 1] + G.ws[n - 1] + x);
      rope([[xr, Y(h / 2)], [xr + 0.2 * L.k, Y(h / 2)]], false);
      c.fillStyle = sensor;
      roundRect(c, xr + 0.2 * L.k, Y(h / 2) - 10, 18, 20, 4); c.fill();
      c.strokeStyle = colors.F.F; c.lineWidth = 1.4;
      roundRect(c, xr + 0.2 * L.k + 0.5, Y(h / 2) - 9.5, 17, 19, 4); c.stroke();
      fx0 = xr + 0.2 * L.k + 22; fux = 1;
    }
    // F 的箭頭（釋放後才施力）
    if (p.F > 0) {
      const len = Math.max(10, p.F * state.kS);
      const on = state.phase !== 'ready';
      const col = on ? colors.F.F : alpha(colors.F.F, 0.35);
      const xs = p.push ? fx0 - len : fx0;
      arrow(xs, Y(h / 2), fux, 0, len, L.lw, col, on ? null : { dashed: true });
      pill('F = ' + fN(p.F) + ' N' + (on || L.narrow ? '' : T('（釋放後施加）', ' (applied at release)')), xs + len / 2, Y(h / 2) - 20, col, f, 'center', 0.8);
    }
    // 每塊的受力（選擇顯示時）
    // 實驗圖上只畫每塊的重力、正向力、摩擦力與外力；木塊之間的力寫在接縫上
    for (let i = 0; i < n; i++) {
      sceneForces({ forces: bs[i].forces.filter(function (q) { return q.key !== 'P' && q.key !== 'T'; }) }, X(G.xs[i] + x + G.ws[i] / 2), Y(h / 2), false);
    }
    // 相鄰木塊之間的力：數值寫在接縫上方；推的時候畫出第三定律力對
    for (let i = 0; i < n - 1; i++) {
      const P = bs[i + 1].forces.find(function (q) { return (q.key === 'P' || q.key === 'T') && q.link === i; });
      const val0 = P ? Math.abs(P.x) : 0;
      const xm = p.push ? X(G.xs[i + 1] + x) : X(G.xs[i] + G.ws[i] + x + G.gap / 2);
      const lab = (p.push ? 'P_{' : 'T_{') + (i + 1) + (i + 2) + '} = ' + fN(val0) + ' N';
      pill(lab, xm, Y(h) - 14 - (L.narrow ? (i % 2) * 22 : 0), p.push ? colors.F.P : colors.F.T, fsm, 'center', 0.85);
      if (p.push && state.show.pairs && val0 > 1e-6) {
        const L2 = Math.max(9, val0 * state.kS * 0.8);
        arrow(xm, Y(h * 0.62), 1, 0, L2, L.lw - 0.6, colors.F.P);
        arrow(xm, Y(h * 0.62), -1, 0, L2, L.lw - 0.6, colors.F.P);
      }
    }
    if (bs.length) accArrow(X(G.xs[0] + x + (G.front0) / 2) - 20, Y(h) - (L.narrow ? 62 : 40), bs[0].ax, bs[0].ay, [0, 0]);
    // 第三定律：最左邊的木塊與地面之間的 N、f
    if (state.show.pairs) {
      const b0 = bs[0];
      const N = b0.forces.find(function (q) { return q.key === 'N'; });
      const fr = b0.forces.find(function (q) { return q.key === 'f'; });
      const xb = G.xs[0] + x;
      if (N) contactPair(X(xb + G.ws[0] * 0.3), Y(0), N.x, N.y, 'N', 'N');
      if (fr) contactPair(X(xb + G.ws[0] * 0.72), Y(0), fr.x, fr.y, 'f', st.seg.dyn.moving ? 'f_k' : 'f_s');
    }
    pill('μ_s = ' + num(p.muS, 2) + '  μ_k = ' + num(p.muK, 2), L.world.x + 8, Y(0) + 46, colors.F.f, '600 ' + L.fs + 'px system-ui, sans-serif', 'left', 0.8);
  }

  // ======================= 效果（純裝飾） =======================
  function drawFx() {
    const now = performance.now();
    state.fx = state.fx.filter(function (e) { return now - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const u = (now - e.t0) / e.dur;
      if (e.type === 'ring') {
        c.strokeStyle = alpha(e.color || colors.text, 0.5 * (1 - u));
        c.lineWidth = 2 * (1 - u) + 0.5;
        c.beginPath(); c.ellipse(e.x, e.y, 6 + 26 * u, 2 + 7 * u, 0, 0, Math.PI * 2); c.stroke();
        (e.dust || []).forEach(function (d) {
          c.fillStyle = alpha(colors.muted, 0.6 * (1 - u));
          c.beginPath(); c.arc(e.x + d[0] * u * 30, e.y - d[1] * u * 18 + u * u * 10, 1.6, 0, Math.PI * 2); c.fill();
        });
      } else if (e.type === 'beam') {
        c.fillStyle = alpha(colors.pos, 0.35 * (1 - u));
        c.beginPath(); c.arc(e.x, e.y, 6 + 10 * u, 0, Math.PI * 2); c.fill();
      } else if (e.type === 'jerk') {
        c.strokeStyle = alpha(colors.F.T, 0.7 * (1 - u));
        c.lineWidth = 2;
        c.beginPath(); c.arc(e.x, e.y, 5 + 14 * u, 0, Math.PI * 2); c.stroke();
      }
    });
    if (state.fx.length && state.phase !== 'running') requestDraw();
  }
  function fxAt(type, x, y, color) {
    if (reducedMotion) return;
    const dust = [];
    for (let i = 0; i < 6; i++) dust.push([Math.cos(i * 1.05 + 0.3) * (0.6 + 0.4 * ((i * 7) % 3) / 2), 0.5 + 0.5 * ((i * 5) % 3) / 2]);
    state.fx.push({ type: type, x: x, y: y, t0: performance.now(), dur: type === 'ring' ? 450 : 380, dust: dust, color: color });
  }

  // ======================= 計時器與 v–t 圖 =======================
  function timerValue() {
    if (state.timing === 'gate') {
      if (state.phase === 'ready') return { t: 0, text: '0.000', done: false };
      const m = state.measure;
      if (m && state.t >= m.t) return { t: m.t, text: num(m.t, 3), done: true };
      return { t: state.t, text: num(state.t, 3), done: false };
    }
    if (state.hand && state.hand.t != null) return { t: state.hand.t, text: num(state.hand.t, 2), done: true };
    if (state.phase === 'ready') return { t: 0, text: '0.00', done: false };
    return { t: state.t, text: num(state.t, 2), done: false };
  }
  function drawTimer() {
    const R = L.timer;
    c = ctx;
    const tv = timerValue();
    const narrow = R.w < 200;
    const title = state.timing === 'gate' ? T('光電計時器', 'Photogate timer') : T('碼錶（手按）', 'Stopwatch (by hand)');
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = '700 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    c.fillText(title, R.x + 10, R.y + 14);
    // LCD 面板
    const px = R.x + 8, py = R.y + 26, pw = R.w - 16, ph = Math.min(52, R.h - 60);
    const lcd = colors.dark ? '#0b1416' : shade(colors.accent, 0.9);
    c.fillStyle = lcd;
    roundRect(c, px, py, pw, ph, 6); c.fill();
    c.strokeStyle = alpha(colors.text, 0.15); c.lineWidth = 1;
    roundRect(c, px + 0.5, py + 0.5, pw - 1, ph - 1, 6); c.stroke();
    const fsz = Math.min(34, ph * 0.7, pw / 5.2);
    c.font = '700 ' + Math.round(fsz) + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    c.textAlign = 'right';
    c.fillStyle = tv.done ? (colors.dark ? '#7ff0c8' : shade(colors.accent, -0.2)) : (colors.dark ? alpha('#9ad', 0.95) : alpha(colors.text, 0.85));
    c.fillText(tv.text, px + pw - 30, py + ph / 2 + 1);
    c.font = '600 ' + Math.round(fsz * 0.5) + 'px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('s', px + pw - 24, py + ph / 2 + 3);
    // 狀態列
    let msg;
    if (state.phase === 'ready') msg = T('等待釋放', 'Ready');
    else if (state.staticRun) msg = T('沒有移動', 'Not moving');
    else if (tv.done) msg = state.timing === 'gate' ? T('已觸發', 'Triggered') : T('已停錶', 'Stopped');
    else if (state.timing === 'hand') msg = T('計時中…', 'Running…');
    else msg = T('計時中…', 'Timing…');
    c.font = '600 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif';
    c.fillStyle = tv.done ? colors.accent : colors.muted;
    c.textAlign = 'left';
    c.fillText(msg, R.x + 10, py + ph + 14);
    if (R.h > 100 && state.measure && state.timing === 'gate' && tv.done) {
      c.fillStyle = colors.muted;
      c.fillText((state.mode === 1 ? 'h' : 'd') + ' = ' + num(state.measure.d, 2) + ' m', R.x + 10, py + ph + 32);
    }
  }

  function vtRange() {
    // 由時間軸找出速度的範圍與時間範圍
    const tl = state.tl;
    let vmax = 0.2, vmin = 0;
    const tEnd = isFinite(tl.end.t) ? tl.end.t : 5;
    tl.segs.forEach(function (s) {
      const t1 = isFinite(s.t1) ? s.t1 : s.t0;
      const d = t1 - s.t0;
      if (tl.kind === 'train') {
        [s.v, s.v + s.a * d].forEach(function (v) { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); });
      } else {
        [s.vA, s.vA + s.aA * d, s.vB, s.vB + s.aB * d].forEach(function (v) { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); });
      }
    });
    return { t1: Math.max(1, Math.min(tEnd * 1.06 + 0.2, 16)), vmax: vmax * 1.12, vmin: vmin * 1.12 };
  }
  function drawGraph() {
    const R = L.graph, V = state.vtView;
    if (!V) return;
    c = ctx;
    const padL = 34, padR = 10, padT = 22, padB = 20;
    const gx = R.x + padL, gy = R.y + padT, gw = R.w - padL - padR, gh = R.h - padT - padB;
    const t1 = Math.max(V.t1, state.t * 1.05);
    const TX = function (t) { return gx + t / t1 * gw; };
    const VY = function (v) { return gy + (V.vmax - v) / (V.vmax - V.vmin) * gh; };
    // 格線與軸
    c.strokeStyle = alpha(colors.text, 0.07); c.lineWidth = 1;
    const vs = niceStep((V.vmax - V.vmin) / 4), ts = niceStep(t1 / 5);
    c.beginPath();
    for (let v = Math.ceil(V.vmin / vs) * vs; v <= V.vmax; v += vs) { const yy = Math.round(VY(v)) + 0.5; c.moveTo(gx, yy); c.lineTo(gx + gw, yy); }
    for (let t = ts; t <= t1; t += ts) { const xx = Math.round(TX(t)) + 0.5; c.moveTo(xx, gy); c.lineTo(xx, gy + gh); }
    c.stroke();
    c.strokeStyle = alpha(colors.muted, 0.8);
    c.beginPath(); c.moveTo(gx, Math.round(VY(0)) + 0.5); c.lineTo(gx + gw, Math.round(VY(0)) + 0.5); c.moveTo(Math.round(gx) + 0.5, gy); c.lineTo(Math.round(gx) + 0.5, gy + gh); c.stroke();
    const f = '600 ' + (L.fs - 1) + 'px system-ui, sans-serif';
    c.font = f; c.fillStyle = colors.muted;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = Math.ceil(V.vmin / vs) * vs; v <= V.vmax; v += vs) c.fillText(num(v, vs < 0.1 ? 2 : 1), gx - 4, VY(v));
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let t = ts; t <= t1 + 1e-9; t += ts) c.fillText(num(t, ts < 1 ? 1 : 0), TX(t), gy + gh + 4);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = '700 ' + L.fs + 'px system-ui, sans-serif';
    c.fillStyle = colors.text;
    const tt = T('v–t 圖', 'v–t graph');
    c.fillText(tt, R.x + 8, R.y + 11);
    const ttw = c.measureText(tt).width;
    c.font = f; c.fillStyle = colors.muted;
    const sub1 = T('　v (m/s)，正方向：', '  v (m/s), positive: ') + posDirText();
    c.fillText(c.measureText(sub1).width < R.w - ttw - 14 ? sub1 : T('　v (m/s)', '  v (m/s)'), R.x + 8 + ttw, R.y + 11);
    c.textAlign = 'right';
    c.fillText('t (s)', gx + gw, VY(0) - 8);
    // 曲線
    const pts = state.vt;
    if (pts.length > 1) {
      const draw1 = function (key, col, w) {
        c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath();
        pts.forEach(function (q, i) { const xx = TX(q.t), yy = VY(q[key]); if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); });
        c.stroke();
      };
      if (state.mode === 3) draw1('vA', colors.accent, 2.2);
      else {
        draw1('vA', alpha(colors.F.T, 0.95), 2.4);
        draw1('vB', colors.accent, 1.6);
      }
      const q = pts[pts.length - 1];
      c.fillStyle = colors.accent;
      c.beginPath(); c.arc(TX(q.t), VY(q.vB != null ? q.vB : q.vA), 3, 0, Math.PI * 2); c.fill();
    }
    if (state.mode !== 3) {
      // 圖例
      const ly = R.y + R.h - 8;
      c.font = f; c.textBaseline = 'middle'; c.textAlign = 'left';
      const la = state.mode === 1 ? 'm_2' : 'M', lb = state.mode === 1 ? 'm_1' : 'm';
      let xx = gx + 6;
      const yy0 = gy + 6;
      c.fillStyle = colors.accent; c.fillRect(xx, yy0 - 1, 12, 2.4);
      xx += richText(lb, xx + 16, yy0, colors.accent, f, 'left') + 26;
      c.fillStyle = colors.F.T; c.fillRect(xx, yy0 - 1, 12, 2.4);
      richText(la, xx + 16, yy0, colors.F.T, f, 'left');
      void ly;
    }
  }
  /** v–t 圖的正方向說明 */
  function posDirText() {
    if (state.mode === 1) return T('m1 向下', 'm1 down');
    if (state.mode === 2) return T('木塊朝滑輪', 'block toward pulley');
    if (state.mode === 3) return T('向右', 'to the right');
    return T('木塊沿斜面向上', 'block up the slope');
  }
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }

  // ======================= 受力圖畫布 =======================
  function resizeFbd() {
    const w = fcv.clientWidth;
    if (!w) return;
    fw = w;
    FL = fbdLayout();
    fh = Math.round(FL.H);
    if (fcv.style.height !== fh + 'px') fcv.style.height = fh + 'px';
    fcv.width = Math.round(fw * dpr);
    fcv.height = Math.round(fh * dpr);
    // 力的比例：所有段落中最大的力剛好放得下
    const n = state.mode === 3 ? state.p.m.length : 2;
    const box = FL.boxes[0];
    const r = Math.min(box.w, box.h) * 0.36;
    state.kF = r / state.Fmax;
  }
  function fbdLayout() {
    const narrow = fw < 640;
    const n = state.mode === 3 ? state.p.m.length : 2;
    const cols = narrow ? 1 : n;
    const rows = Math.ceil(n / cols);
    const gap = 8;
    const bw = (fw - gap * (cols - 1)) / cols;
    const bh = narrow ? 210 : 270;
    const boxes = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), k = i % cols;
      boxes.push({ x: k * (bw + gap), y: r * (bh + gap), w: bw, h: bh });
    }
    const sysH = state.mode === 2 || state.mode === 4 ? 176 : 150;
    const sys = { x: 0, y: rows * (bh + gap), w: fw, h: sysH };
    return { narrow: narrow, boxes: boxes, sys: sys, H: sys.y + sys.h, fs: narrow ? 11 : 12, lw: narrow ? 2.2 : 2.6 };
  }
  function forceLabel(f, body) {
    const k = f.key;
    if (k === 'W') {
      if (state.mode === 1) return body.id === 'B' ? 'm_1g' : 'm_2g';
      if (state.mode === 3) return 'm_' + (body.id + 1) + 'g';
      return body.id === 'A' ? 'Mg' : 'mg';
    }
    if (k === 'f') return f.kind === 'static' ? 'f_s' : 'f_k';
    if (k === 'P') return 'P_{' + (f.link + 1) + (f.link + 2) + '}';
    if (k === 'T') return state.mode === 3 ? 'T_{' + (f.link + 1) + (f.link + 2) + '}' : 'T';
    if (k === 'S') return T('N_{擋板}', 'N_{stop}');
    return k;
  }
  function bodyName(body) {
    if (state.mode === 1) return body.id === 'B' ? T('m_1（左）', 'm_1 (left)') : T('m_2（右）', 'm_2 (right)');
    if (state.mode === 3) return 'm_' + (body.id + 1);
    if (body.id === 'A') return state.mode === 2 ? T('木塊 M', 'Block M') : T('斜面上的木塊 M', 'Block M on the incline');
    return T('懸掛物 m', 'Hanging mass m');
  }

  function drawFbd(st) {
    if (!FL) return;
    c = fctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, fw, fh);
    const bodies = bodiesNow(st);
    // 依畫面的排列：模式 1 先畫 m1（B）；模式 2、4 先畫木塊（A）
    const order = state.mode === 1 ? [bodies[1], bodies[0]] : bodies;
    order.forEach(function (b, i) { fbdBox(FL.boxes[i], b, st); });
    fbdSystem(FL.sys, st, bodies);
    c = ctx;
  }
  function panelBg(R) {
    const base = colors['canvas-bg'], edge = shade(base, colors.dark ? -0.3 : -0.04);
    const gr = c.createLinearGradient(0, R.y, 0, R.y + R.h);
    gr.addColorStop(0, base); gr.addColorStop(1, edge);
    c.fillStyle = gr;
    roundRect(c, R.x, R.y, R.w, R.h, 8); c.fill();
    c.strokeStyle = alpha(colors.text, 0.08); c.lineWidth = 1;
    roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8); c.stroke();
  }
  function fbdBox(R, body, st) {
    panelBg(R);
    const fs = FL.fs, f = '600 ' + fs + 'px system-ui, sans-serif';
    pill(bodyName(body), R.x + 8, R.y + 14, colors.text, '700 ' + (fs + 1) + 'px system-ui, sans-serif', 'left', 0.9);
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2 + 10;
    // 物體（斜面上的木塊旋轉 θ）
    const s = Math.min(36, R.w * 0.14);
    const rot = state.mode === 4 && body.id === 'A' ? state.p.theta * DEG : 0;
    c.save();
    c.translate(cx, cy); c.rotate(-rot);
    if (rot) {
      c.strokeStyle = alpha(colors.muted, 0.5); c.lineWidth = 1; c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(-s * 2.2, s / 2); c.lineTo(s * 2.2, s / 2); c.stroke(); c.setLineDash([]);
    }
    const isHang = (state.mode === 1) || body.id === 'B';
    if (isHang && state.mode !== 3) {
      const gr = c.createLinearGradient(-s / 2, 0, s / 2, 0);
      const base = colors.dark ? shade(colors.muted, -0.05) : shade(colors.muted, 0.05);
      gr.addColorStop(0, shade(base, -0.4)); gr.addColorStop(0.3, shade(base, 0.45)); gr.addColorStop(1, shade(base, -0.45));
      c.fillStyle = gr;
      roundRect(c, -s / 2, -s / 2, s, s, 4); c.fill();
    } else {
      const base = colors.dark ? shade(colors.equi, -0.2) : shade(colors.equi, 0.32);
      const gr = c.createLinearGradient(0, -s / 2, 0, s / 2);
      gr.addColorStop(0, shade(base, 0.2)); gr.addColorStop(1, shade(base, -0.18));
      c.fillStyle = gr;
      roundRect(c, -s * 0.65, -s / 2, s * 1.3, s, 4); c.fill();
    }
    c.restore();
    // 力：由物體中心畫出
    const labels = [];
    body.forces.forEach(function (fo, i) {
      const F = Math.hypot(fo.x, fo.y);
      if (F < 1e-9) return;
      const ux = fo.x / F, uy = -fo.y / F;
      const len = F * state.kF;
      const off = parallelOffset(body.forces, i) * 7;
      const x0 = cx - uy * off, y0 = cy + ux * off;
      arrow(x0, y0, ux, uy, len, FL.lw, colors.F[fo.key]);
      labels.push({ text: forceLabel(fo, body) + ' = ' + fN(F) + ' N', x: x0 + ux * (len + 6), y: y0 + uy * (len + 6), ux: ux, uy: uy, color: colors.F[fo.key] });
    });
    placeLabels(labels, R, f);
    // 加速度（虛線，畫在旁邊）
    const a = Math.hypot(body.ax, body.ay);
    const yb = R.y + R.h - 14;
    if (a > 1e-6) {
      const ux = body.ax / a, uy = -body.ay / a;
      const len = Math.min(R.w * 0.22, 14 + a * 6);
      const ax0 = R.x + R.w - 18 - Math.max(0, ux) * len, ay0 = R.y + 44 - Math.min(0, uy) * len;
      arrow(ax0, ay0, ux, uy, len, FL.lw - 0.6, colors.accent, { dashed: true });
      pill('a', ax0 + ux * len / 2 - 14 * (Math.abs(uy) > 0.5 ? 1 : 0), ay0 + uy * len / 2 - (Math.abs(uy) > 0.5 ? 0 : 12), colors.accent, 'italic 700 ' + FL.fs + 'px system-ui, sans-serif', 'center', 0.8);
    }
    // ΣF = ma（底部一行）
    const Fn = C.netForce(body);
    const Fmag = Math.hypot(Fn[0], Fn[1]);
    const txt = 'ΣF = ' + fN(Fmag) + ' N = ' + (body.m != null ? num(body.m, 2) : '') + ' kg × ' + num(a, 2) + ' m/s²';
    c.font = f;
    if (c.measureText(txt).width > R.w - 16) richText('a = ' + num(a, 2) + ' m/s²', R.x + 10, yb, colors.accent, f, 'left');
    else richText(txt, R.x + 10, yb, colors.accent, f, 'left');
  }
  /** 標籤放在箭頭尖端外側；互相重疊或超出框時往旁邊推開 */
  function placeLabels(labels, R, f) {
    const boxes = [];
    labels.forEach(function (lb) {
      const sz = pillSize(lb.text, f);
      let x = lb.x + lb.ux * sz.w / 2, y = lb.y + lb.uy * (sz.h / 2);
      // 水平方向的力：標籤放在箭頭上方
      if (Math.abs(lb.uy) < 0.35) y -= sz.h * 0.9;
      const clampIn = function () {
        x = Math.max(R.x + sz.w / 2 + 4, Math.min(R.x + R.w - sz.w / 2 - 4, x));
        y = Math.max(R.y + 30 + sz.h / 2, Math.min(R.y + R.h - 28 - sz.h / 2, y));
      };
      clampIn();
      for (let it = 0; it < 8; it++) {
        const hit = boxes.find(function (b) { return Math.abs(b.x - x) < (b.w + sz.w) / 2 + 2 && Math.abs(b.y - y) < (b.h + sz.h) / 2 + 1; });
        if (!hit) break;
        y += (y >= hit.y ? 1 : -1) * (sz.h + 2);
        clampIn();
      }
      boxes.push({ x: x, y: y, w: sz.w, h: sz.h });
      pill(lb.text, x, y, lb.color, f, 'center', 0.88);
    });
  }

  /** 系統圖：沿繩子（運動）方向拉直，只畫外力 */
  function fbdSystem(R, st, bodies) {
    panelBg(R);
    const fs = FL.fs, f = '600 ' + fs + 'px system-ui, sans-serif';
    const titleF = '700 ' + (fs + 1) + 'px system-ui, sans-serif';
    const title = state.mode === 3 ? T('系統（所有木塊當成一個整體）', 'System (all blocks as one)') : T('系統（沿繩子方向拉直）', 'System (straightened along the string)');
    pill(title, R.x + 8, R.y + 14, colors.text, titleF, 'left', 0.9);
    // 比例尺（右上角）
    const sv2 = niceStep(state.Fmax / 3), sl = sv2 * state.kF;
    const sLab = num(sv2, sv2 < 1 ? 1 : 0) + ' N';
    const sx = R.x + R.w - sl - richWidth(sLab, f) - 18, sy = R.y + 14;
    if (sx > R.x + richWidth(title, titleF) + 30) {
      c.strokeStyle = colors.muted; c.lineWidth = 1.5; c.lineCap = 'butt';
      c.beginPath(); c.moveTo(sx, sy - 4); c.lineTo(sx, sy + 4); c.moveTo(sx, sy); c.lineTo(sx + sl, sy); c.moveTo(sx + sl, sy - 4); c.lineTo(sx + sl, sy + 4); c.stroke();
      richText(sLab, sx + sl + 6, sy, colors.muted, f, 'left');
    }
    const cy = R.y + 62;
    const sv = C.systemView(state.mode, state.p, st);
    if (state.mode !== 3 && !st.taut) {
      richText(T('繩子鬆弛（T = 0）：兩物體各自運動，', 'String slack (T = 0): the bodies move separately,'), R.x + R.w / 2, cy - 4, colors.muted, f, 'center');
      richText(T('不能當成一個系統。', 'so they cannot be treated as one system.'), R.x + R.w / 2, cy + 16, colors.muted, f, 'center');
      return;
    }
    // 方塊排成一列（+ 方向向右）
    let items;
    const p = state.p;
    if (state.mode === 3) items = p.m.map(function (m, i) { return { label: 'm_' + (i + 1), wood: true }; });
    else if (state.mode === 1) items = [{ label: 'm_2' }, { label: 'm_1' }];
    else items = [{ label: 'M', wood: true }, { label: 'm' }];
    const n = items.length;
    const bw = Math.min(54, R.w * 0.11), bh = 26, gap = Math.min(64, R.w * 0.1);
    const total = n * bw + (n - 1) * gap;
    const x0 = R.x + (R.w - total) / 2;
    const left = x0, right = x0 + total;
    c.strokeStyle = alpha(colors.text, 0.5); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x0 + bw / 2, cy); c.lineTo(right - bw / 2, cy); c.stroke();
    items.forEach(function (it, i) {
      const bx = x0 + i * (bw + gap);
      const base = it.wood ? (colors.dark ? shade(colors.equi, -0.2) : shade(colors.equi, 0.32)) : (colors.dark ? shade(colors.muted, -0.05) : shade(colors.muted, 0.15));
      const gr = c.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
      gr.addColorStop(0, shade(base, 0.2)); gr.addColorStop(1, shade(base, -0.2));
      c.fillStyle = gr;
      roundRect(c, bx, cy - bh / 2, bw, bh, 4); c.fill();
      richText(it.label, bx + bw / 2, cy, colors.dark ? '#111' : (it.wood ? '#3b2600' : '#fff'), '700 ' + fs + 'px system-ui, sans-serif', 'center');
    });
    // 外力（沿 + 方向）：line 上的畫在兩端，其他畫在方塊下方
    const ext = [];
    const kF = state.kF;
    if (state.mode === 3) {
      if (p.F > 0) ext.push({ v: p.F, key: 'F', label: 'F', side: p.push ? 'L' : 'R' });
      const fsum = st.seg.dyn.f.reduce(function (a, b) { return a + b; }, 0);
      if (Math.abs(fsum) > 1e-9) ext.push({ v: fsum, key: 'f', label: 'Σf', at: (left + right) / 2, below: 0 });
    } else {
      const B = bodies[1];
      const sg = st.seg;
      ext.push({ v: B.m * g, key: 'W', label: state.mode === 1 ? 'm_1g' : 'mg', side: 'R' });
      if (state.mode === 1) ext.push({ v: -p.m2 * g, key: 'W', label: 'm_2g', side: 'L' });
      if (state.mode === 4 && p.theta > 0) ext.push({ v: -p.M * g * Math.sin(p.theta * DEG), key: 'W', label: 'Mg sinθ', side: 'L' });
      let row = 0;
      if (Math.abs(sg.fA) > 1e-9) ext.push({ v: sg.fA, key: 'f', label: sg.kind === 'static' ? 'f_s' : 'f_k', at: left + bw / 2, below: row++ });
      if (Math.abs(sg.stopA) > 1e-9) ext.push({ v: sg.stopA, key: 'S', label: state.mode === 1 ? 'N' : T('N_{擋板}', 'N_{stop}'), at: left + bw / 2, below: row++ });
      if (Math.abs(sg.floorB) > 1e-9) ext.push({ v: -sg.floorB, key: 'N', label: 'N', at: right - bw / 2, below: 0 });
    }
    ext.forEach(function (e) {
      const len = Math.abs(e.v) * kF;
      const ux = e.v > 0 ? 1 : -1;
      const lab = e.label + ' = ' + fN(Math.abs(e.v)) + ' N';
      const lw = pillSize(lab, f).w;
      if (e.side) {
        // 在繩子延長線上：從方塊外側往外（或往內）畫
        let xs = e.side === 'R' ? right : left;
        if (e.side === 'L' && ux > 0) xs = left - len;
        if (e.side === 'R' && ux < 0) xs = right + len;
        arrow(xs, cy, ux, 0, len, FL.lw - 0.4, colors.F[e.key]);
        // 標籤在箭頭上方、不壓到方塊
        let lx = xs + ux * len / 2;
        if (e.side === 'R') lx = Math.max(lx, right + lw / 2 + 4);
        else lx = Math.min(lx, left - lw / 2 - 4);
        lx = Math.max(R.x + lw / 2 + 4, Math.min(R.x + R.w - lw / 2 - 4, lx));
        pill(lab, lx, cy - 18, colors.F[e.key], f, 'center', 0.85);
      } else {
        const ys = cy + bh / 2 + 10 + e.below * 27;
        arrow(e.at - (ux < 0 ? 0 : 0), ys, ux, 0, len, FL.lw - 0.4, colors.F[e.key]);
        pill(lab, e.at + ux * len / 2, ys + 13, colors.F[e.key], f, 'center', 0.85);
      }
    });
    // 合力與加速度
    const Fnet = sv.Fnet, M = sv.M;
    const a = M > 0 ? Fnet / M : 0;
    const txt = T('F_合', 'F_{net}') + ' = ' + fN(Fnet) + T(' N，', ' N, ') + T('m_總', 'm_{total}') + ' = ' + num(M, 3) + ' kg  →  a = ' + num(a, 3) + ' m/s²';
    const txt2 = 'a = ' + fN(Fnet) + ' N / ' + num(M, 3) + ' kg = ' + num(a, 3) + ' m/s²';
    const use = richWidth(txt, f) < R.w - 20 ? txt : txt2;
    richText(use, R.x + R.w / 2, R.y + R.h - 13, colors.accent, '700 ' + fs + 'px system-ui, sans-serif', 'center');
  }

  // ======================= 讀數（系統 vs 個別） =======================
  function sub(s) { return s.replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/_(.)/g, '<sub>$1</sub>'); }
  function updateReadouts(st) {
    const p = state.p, sv = C.systemView(state.mode, p, st);
    const bodies = bodiesNow(st);
    const MS2 = ' m/s<sup>2</sup>';
    let html = '';
    if (state.mode !== 3 && !st.taut) {
      html = T('繩子鬆弛（張力為零），兩物體各自運動：不能用「系統」一起算。', 'The string is slack (zero tension): the two bodies move separately, so the system view does not apply.');
    } else {
      let terms;
      if (state.mode === 1) terms = 'm<sub>1</sub>g − m<sub>2</sub>g = ' + fN(p.m1 * g) + ' − ' + fN(p.m2 * g);
      else if (state.mode === 2) terms = 'mg ' + (st.seg.fA ? (st.seg.fA < 0 ? '− ' : '+ ') + (st.seg.kind === 'static' ? 'f<sub>s</sub>' : 'f<sub>k</sub>') : '') + ' = ' + fN(p.m * g) + (st.seg.fA ? (st.seg.fA < 0 ? ' − ' : ' + ') + fN(Math.abs(st.seg.fA)) : '');
      else if (state.mode === 4) terms = 'mg − Mg sinθ ' + (st.seg.fA ? (st.seg.fA < 0 ? '− ' : '+ ') + (st.seg.kind === 'static' ? 'f<sub>s</sub>' : 'f<sub>k</sub>') : '') + ' = ' + fN(p.m * g) + ' − ' + fN(p.M * g * Math.sin(p.theta * DEG)) + (st.seg.fA ? (st.seg.fA < 0 ? ' − ' : ' + ') + fN(Math.abs(st.seg.fA)) : '');
      else terms = 'F − Σf = ' + fN(p.F) + ' − ' + fN(-st.seg.dyn.f.reduce(function (a, b) { return a + b; }, 0));
      const extra = (st.seg.stopA || st.seg.floorB) ? '<span class="note">' + T('（另有地板或擋板的支撐力）', '(plus the support force of the floor or a stopper)') + '</span>' : '';
      const mt = state.mode === 1 ? 'm<sub>1</sub> + m<sub>2</sub>' : state.mode === 3 ? 'Σm' : 'M + m';
      html = T('外力合力', 'Net external force') + ' F<sub>' + T('合', 'net') + '</sub> = ' + terms + ' = <b>' + fN(sv.Fnet) + ' N</b>' + extra + '<br>' +
        T('總質量', 'Total mass') + ' m<sub>' + T('總', 'total') + '</sub> = ' + mt + ' = <b>' + num(sv.M, 3) + ' kg</b><br>' +
        '<span class="big">a = F<sub>' + T('合', 'net') + '</sub> / m<sub>' + T('總', 'total') + '</sub> = ' + num(sv.Fnet / sv.M, 3) + MS2 + '</span>';
      if (state.staticRun || (st.seg.restA && st.seg.restB) || (st.seg.rest)) html += '<span class="note">' + T('靜止：合力為零。', 'At rest: the net force is zero.') + '</span>';
    }
    $('sysEq').innerHTML = html;
    // 個別物體
    const order = state.mode === 1 ? [bodies[1], bodies[0]] : bodies;
    let rows = '<table><thead><tr><th>' + T('物體', 'Body') + '</th><th>ΣF (N)</th><th>ma (N)</th></tr></thead><tbody>';
    order.forEach(function (b) {
      const Fn = C.netForce(b);
      const a = Math.hypot(b.ax, b.ay);
      // 沿運動方向的分量（有號）
      const dirx = b.ax, diry = b.ay;
      const along = a > 1e-9 ? (Fn[0] * dirx + Fn[1] * diry) / a : Math.hypot(Fn[0], Fn[1]);
      const parts = b.forces.filter(function (q) { return Math.hypot(q.x, q.y) > 1e-9; }).map(function (q) { return sub(forceLabel(q, b)); }).join(', ');
      rows += '<tr><td>' + sub(bodyName(b)) + '<small>' + parts + '</small></td><td>' + fN(along) + '</td><td>' + num(b.m, 3) + ' × ' + num(a, 3) + '<small>= ' + fN(b.m * a) + '</small></td></tr>';
    });
    rows += '</tbody></table>';
    $('bodyEq').innerHTML = rows;
  }

  // ======================= 模擬控制 =======================
  function rebuild(keepView) {
    state.p = readParams(state.mode);
    state.geo = C.geometry(state.mode, state.p);
    state.tl = C.timeline(state.mode, state.p);
    state.measure = C.firstMeasure(state.tl);
    // 最大的力（決定受力圖比例）
    let Fm = 1;
    state.tl.segs.forEach(function (sg) {
      const st = C.stateAt(state.tl, sg.t0 + (isFinite(sg.t1) ? (sg.t1 - sg.t0) / 2 : 0));
      C.bodyForces(state.mode, state.p, st).bodies.forEach(function (b) {
        b.forces.forEach(function (f) { Fm = Math.max(Fm, Math.hypot(f.x, f.y)); });
      });
      if (state.mode !== 3) Fm = Math.max(Fm, state.p.m * g || 0, (state.mode === 1 ? Math.max(state.p.m1, state.p.m2) * g : 0));
    });
    state.Fmax = Fm;
    state.vtView = vtRange();
    void keepView;
  }
  function putBack(msg) {
    stopWhirr();
    state.phase = 'ready';
    state.t = 0;
    state.hand = null;
    state.gateHit = false;
    state.recorded = false;
    state.evIdx = 0;
    state.impacts = 0;
    state.sawStop = false;
    state.staticRun = false;
    state.vt = [];
    state.fx = [];
    state.segKey = null;
    updateButtons();
    setStatus(msg || '');
  }
  function paramsChanged() {
    rebuild();
    putBack();
    L = null;
    resize();
  }

  // ---------- 音效 ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let whirr = null;
  function stopWhirr() { if (whirr) { whirr.stop(0.12); whirr = null; } }
  function updateWhirr(st) {
    const S = sound();
    if (!S || state.mode === 3 || state.phase !== 'running') { stopWhirr(); return; }
    const v = st.taut ? Math.abs(st.vA) : Math.abs(st.vB);
    const sp = v * (state.slow ? SLOW : 1);
    if (sp < 0.02) { stopWhirr(); return; }
    const freq = Math.min(1500, 280 + 520 * sp), gain = 0.05 + 0.1 * Math.min(1, sp / 2.5);
    if (!whirr || !whirr.playing) whirr = S.voice({ freq: freq, type: 'triangle', gain: gain });
    else whirr.set({ freq: freq, gain: gain }, 0.05);
  }
  function thump(v) {
    const S = sound(); if (!S) return;
    const k = Math.min(1, 0.25 + v / 2.5);
    S.noise({ dur: 0.07, gain: 0.7 * k, filter: 700, q: 0.8 });
    S.tone({ freq: 300, dur: 0.11, type: 'triangle', gain: 0.5 * k });
    S.tone({ freq: 460, dur: 0.05, type: 'sine', gain: 0.25 * k });
  }
  function twang(v) {
    const S = sound(); if (!S) return;
    const k = Math.min(1, 0.3 + v / 2);
    S.sweep({ from: 950, to: 620, dur: 0.1, type: 'triangle', gain: 0.4 * k });
    S.noise({ dur: 0.03, gain: 0.3 * k, filter: 2600, q: 1.2 });
  }
  function beep() { const S = sound(); if (!S) return; S.tone({ freq: 1568, dur: 0.07, type: 'sine', gain: 0.35 }); }
  function clickSound() {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.02, gain: 0.4, filter: 3800, q: 1.5 });
    S.tone({ freq: 1900, dur: 0.025, type: 'square', gain: 0.12 });
  }
  function releaseSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 620, dur: 0.05, type: 'triangle', gain: 0.3 });
    S.noise({ dur: 0.03, gain: 0.25, filter: 1800, q: 1 });
  }

  // ---------- 任務事件 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  /** 量測完成：寫入表格並回報 */
  function record(tMeas, method) {
    if (state.recorded || !state.measure) return;
    state.recorded = true;
    const m = state.measure, p = state.p;
    const tShow = method === 'gate' ? Math.round(tMeas * 1000) / 1000 : Math.round(tMeas * 100) / 100;
    const aMeas = C.accelFromTime(m.d, tShow, p.v0);
    const s0 = state.tl.segs[0];
    const aTh = Math.abs(state.mode === 3 ? s0.a : s0.aA);
    let gMeas = null;
    if (state.mode === 1 && Math.abs(p.m1 - p.m2) > 1e-9) gMeas = C.gFromAtwood(aMeas, p.m1, p.m2);
    const slowUsed = state.slow || state.runSlow;
    const row = { n: state.runs.length + 1, mode: state.mode, p: JSON.parse(JSON.stringify(p)), method: method, slow: slowUsed, paused: !!state.runPaused, t: tShow, d: m.d, aMeas: aMeas, aTh: aTh, gMeas: gMeas, n3: state.n };
    state.runs.push(row);
    renderRuns(true);
    emit('run', Object.assign(flatParams(), {
      timing: method, slow: slowUsed, paused: !!state.runPaused, t: tShow, tTrue: m.t, d: m.d, aMeas: aMeas, aTheory: aTh, gMeas: gMeas, dir: m.dir
    }));
  }
  function setupText(row) {
    const p = row.p;
    const tm = row.method === 'gate' ? T('光電', 'gate') : T('手按', 'hand') + (row.slow ? T('・慢動作', ' · slow') : '') + (row.paused ? T('・暫停過', ' · paused') : '');
    const v0 = p.v0 > 0 ? '，v<sub>0</sub> ' + num(p.v0, 2) : '';
    let s;
    if (row.mode === 1) s = T('阿特午機', 'Atwood') + '<small>m<sub>1</sub> ' + num(p.m1, 3) + '，m<sub>2</sub> ' + num(p.m2, 3) + ' kg，h ' + num(p.h, 2) + ' m' + v0 + '・' + tm + '</small>';
    else if (row.mode === 2) s = T('桌面', 'Table') + '<small>M ' + num(p.M, 3) + '，m ' + num(p.m, 3) + ' kg，μ<sub>k</sub> ' + num(p.muK, 2) + '，d ' + num(p.d, 2) + ' m' + v0 + '・' + tm + '</small>';
    else if (row.mode === 3) s = (p.push ? T('推', 'Push') : T('拉', 'Pull')) + ' ' + p.m.length + T(' 塊', ' blocks') + '<small>' + p.m.map(function (x) { return num(x, 2); }).join(' / ') + ' kg，F ' + fN(p.F) + ' N，μ<sub>k</sub> ' + num(p.muK, 2) + v0 + '・' + tm + '</small>';
    else s = T('斜面', 'Incline') + ' ' + num(p.theta, 0) + '°<small>M ' + num(p.M, 3) + '，m ' + num(p.m, 3) + ' kg，μ<sub>k</sub> ' + num(p.muK, 2) + v0 + '・' + tm + '</small>';
    if (window.LabSettings && window.LabSettings.lang === 'en') s = s.replace(/，/g, ', ').replace(/・/g, ' · ');
    return s;
  }
  function renderRuns(fresh) {
    const tb = $('runsBody');
    $('runs').hidden = state.runs.length === 0;
    $('runsEmpty').hidden = state.runs.length > 0;
    tb.innerHTML = state.runs.map(function (r, i) {
      const last = fresh && i === state.runs.length - 1;
      const dir = '';
      return '<tr' + (last ? ' class="new"' : '') + '><td>' + r.n + '</td><td>' + setupText(r) + '</td><td>' + num(r.t, r.method === 'gate' ? 3 : 2) +
        '</td><td>' + num(r.aMeas, 3) + dir + '</td><td>' + num(r.aTh, 3) + '</td><td>' + (r.gMeas != null ? num(r.gMeas, 2) + '<small>' + (r.gMeas >= g ? '+' : '−') + num(Math.abs(r.gMeas - g) / g * 100, 1) + '%</small>' : '—') + '</td></tr>';
    }).join('');
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false, lastFrameWall = 0;
  function speed() { return state.slow ? SLOW : 1; }
  function tick(tNow) {
    if (state.phase !== 'running') { loopOn = false; return; }
    const dt = Math.min((tNow - lastT) / 1000, 1 / 30) * speed();
    lastT = tNow;
    lastFrameWall = tNow;
    const t0 = state.t;
    state.t = t0 + dt;
    processEvents(t0, state.t);
    const st = C.stateAt(state.tl, state.t);
    // v–t 取樣
    const last = state.vt[state.vt.length - 1];
    if (!last || state.t - last.t > 0.008) pushVt(st, state.t);
    updateWhirr(st);
    // 結束：時間軸跑完（手按碼錶時多等一下）
    const endT = state.tl.end.t;
    if (isFinite(endT) && state.t >= endT) {
      const handWaiting = state.timing === 'hand' && !state.hand && state.measure && state.t < endT + HAND_GRACE;
      if (!handWaiting) finishRun();
    }
    updateButtons();
    draw();
    if (state.phase === 'running') requestAnimationFrame(tick); else loopOn = false;
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }
  function pushVt(st, t) {
    if (state.mode === 3) state.vt.push({ t: t, vA: st.v });
    else state.vt.push({ t: t, vA: st.vA, vB: st.vB });
    if (state.vt.length > 4000) state.vt.splice(0, 1);
  }
  /** 處理 (t0, t1] 之間發生的事件：聲音、效果、光電閘、任務 */
  function processEvents(t0, t1) {
    const ev = state.tl.events;
    while (state.evIdx < ev.length && ev[state.evIdx].t <= t1) {
      const e = ev[state.evIdx++];
      // v–t 圖：事件前後各取一點（速度的突變畫成垂直線）
      pushVt(C.stateAt(state.tl, e.t - 1e-7), e.t);
      pushVt(C.stateAt(state.tl, e.t + 1e-7), e.t);
      const pos = eventPos(e);
      if (e.type === 'stop') { state.sawStop = true; continue; }
      if (e.type === 'jerk') {
        twang(e.v);
        if (pos) fxAt('jerk', pos.x, pos.y);
        const prev = state.tl.events.slice(0, state.evIdx - 1).reverse().find(function (q) { return q.type !== 'stop' && q.type !== 'jerk'; });
        const slackTime = prev ? e.t - prev.t : 0;
        let rise = 0;
        const sl = state.tl.segs.find(function (s) { return !s.taut && s.t0 >= (prev ? prev.t : 0) - 1e-9 && s.t1 <= e.t + 1e-9 && s.vA === 0 && !s.restA; });
        if (sl && prev) rise = Math.abs(sl.xA - (state.mode === 1 ? state.tl.sys.bMax : 0));
        emit('jerk', Object.assign(flatParams(), { v: e.v, slackTime: slackTime, rise: rise, n: state.impacts }));
        continue;
      }
      // 撞擊（落地、擋板、終點）
      state.impacts++;
      if (e.type === 'finish') beep();
      else thump(e.v);
      if (pos) fxAt(e.type === 'finish' ? 'beam' : 'ring', pos.x, pos.y);
      if (state.measure && Math.abs(e.t - state.measure.t) < 1e-9) {
        // 光電閘觸發
        state.gateHit = true;
        if (state.timing === 'gate') { if (e.type !== 'finish') beep(); record(e.t, 'gate'); }
        if (state.timing === 'gate' && pos) fxAt('beam', pos.gx != null ? pos.gx : pos.x, pos.gy != null ? pos.gy : pos.y);
      }
      emit('impact', Object.assign(flatParams(), { type: e.type, v: e.v, t: e.t, n: state.impacts, afterStop: state.sawStop, a0: state.mode === 3 ? state.tl.segs[0].a : state.tl.segs[0].aA }));
    }
  }
  /** 事件發生處（畫布座標，用來放效果） */
  function eventPos(e) {
    if (!L) return null;
    const st = C.stateAt(state.tl, e.t), G = state.geo;
    if (state.mode === 1) {
      if (e.type === 'landB') return { x: X(G.B.x), y: Y(0) };
      if (e.type === 'bumpA0') return { x: X(G.A.x), y: Y(0) };
      if (e.type === 'jerk') return { x: X(G.pulley.x), y: Y(G.pulley.y) };
      return { x: X(G.pulley.x), y: Y(G.pulley.y - G.pulley.r) };
    }
    if (state.mode === 2) {
      if (e.type === 'bumpA') return { x: X(G.bumper), y: Y(G.tableH + 0.04) };
      return { x: X(G.pulley.x), y: Y(G.pulley.y) };
    }
    if (state.mode === 4) {
      if (e.type === 'bumpA') { const q = slopePt(G.stopTop, 0.05); return { x: X(q.x), y: Y(q.y) }; }
      if (e.type === 'bumpA0') { const q = slopePt(G.stopBot, 0.05); return { x: X(q.x), y: Y(q.y) }; }
      return { x: X(G.pulley.x), y: Y(G.pulley.y) };
    }
    void st;
    return { x: X(G.finish), y: Y(G.h * 0.6) };
  }
  function finishRun() {
    state.phase = 'done';
    stopWhirr();
    const end = state.tl.end;
    let msg = '';
    if (state.timing === 'hand' && !state.hand && state.measure) msg = T('沒有按停錶，這次沒有記錄。', 'The stopwatch was not stopped, so nothing was recorded.') + ' ';
    if (end.frozen && end.reason === 'finish') msg += T('前方木塊通過終點，記錄完成（之後的運動不模擬）。', 'The front block crossed the finish line; the run is recorded (motion after that is not simulated).');
    else if (end.frozen) msg += T('之後的往返運動不再模擬。', 'The remaining back-and-forth motion is not simulated.');
    else if (!state.measure) msg += T('這次運動中途停下或折返，沒有完整走完一段，無法量測。', 'The motion stopped or turned back before reaching the end, so there is nothing to measure.');
    else msg += T('運動結束。按「放回起點」或改變條件再試一次。', 'The motion is over. Press “Put back” or change the set-up to try again.');
    setStatus(msg);
  }

  function release() {
    if (state.phase !== 'ready') return;
    state.phase = 'running';
    state.t = 0;
    state.evIdx = 0;
    state.runSlow = state.slow;      // 這次運動中是否用過慢動作、暫停（手按計時的公平性）
    state.runPaused = false;
    state.vt = [{ t: 0, vA: state.p.v0, vB: state.p.v0 }];
    releaseSound();
    const s0 = state.tl.segs[0];
    const moving = state.mode === 3 ? !s0.rest : !(s0.restA && s0.restB);
    state.staticRun = !moving;
    if (!moving) {
      state.phase = 'done';
      setStatus(staticMessage(s0));
    } else setStatus(state.timing === 'hand' ? T('碼錶已開始：在抵達的瞬間按「停錶」（或點畫面、按空白鍵）。', 'The stopwatch is running: press “Stop watch” (or tap the picture, or press Space) the instant it arrives.') : '');
    // 任務：釋放瞬間的受力
    const st0 = C.stateAt(state.tl, 0);
    const d = flatParams();
    if (state.mode === 3) {
      const dyn = s0.dyn;
      Object.assign(d, { moves: moving, dir: moving ? 1 : 0, a: dyn.a, link: dyn.link.slice(), fKind: dyn.kind, timing: state.timing });
    } else {
      const fsMax = (state.mode === 1 ? 0 : (state.p.muS * s0.NA));
      Object.assign(d, { moves: moving, dir: moving ? (s0.aA > 0 || s0.vA > 0 ? 1 : -1) : 0, a: s0.aA, T: s0.T, f: s0.fA, fKind: s0.kind, fsMax: fsMax, N: s0.NA, timing: state.timing });
    }
    void st0;
    emit('release', d);
    updateButtons();
    state.segKey = null;
    if (state.phase === 'running') startLoop();
    requestDraw();
  }
  function staticMessage(s0) {
    if (state.mode === 1) return T('m1 不比 m2 重：m2 留在地上，系統不動（地板分擔了 m2 的一部分重量）。', 'm1 is not heavier than m2: m2 stays on the floor and nothing moves (the floor carries part of the weight of m2).');
    if (state.mode === 3) {
      const p = state.p, M = p.m.reduce(function (a, b) { return a + b; }, 0);
      return T('外力 F = ' + fN(p.F) + ' N 不大於最大靜摩擦力 μs Σm g = ' + fN(p.muS * M * g) + ' N，木塊不動。',
        'F = ' + fN(p.F) + ' N does not exceed the maximum static friction μs Σm g = ' + fN(p.muS * M * g) + ' N, so the blocks stay put.');
    }
    const fs = state.p.muS * s0.NA;
    return T('靜摩擦力撐住了：需要的靜摩擦力 ' + fN(Math.abs(s0.fA)) + ' N ≤ 最大靜摩擦力 μs N = ' + fN(fs) + ' N，系統不動。',
      'Static friction holds: the friction needed, ' + fN(Math.abs(s0.fA)) + ' N, is at most μs N = ' + fN(fs) + ' N, so nothing moves.');
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    const play = $('play');
    play.textContent = state.phase === 'ready' ? T('釋放', 'Release') : state.phase === 'running' ? T('暫停', 'Pause') : state.phase === 'paused' ? T('繼續', 'Resume') : T('再放一次', 'Release again');
    const lap = $('lap');
    lap.hidden = state.timing !== 'hand';
    lap.disabled = !(state.timing === 'hand' && !state.hand && !state.staticRun && (state.phase === 'running' || state.phase === 'paused'));
  }

  function stopWatch() {
    if (state.timing !== 'hand' || state.hand || state.staticRun || !(state.phase === 'running' || state.phase === 'paused')) return;
    // 停錶時刻 = 上一幀的模擬時間 + 之後經過的時間
    let t = state.t;
    if (state.phase === 'running') t += Math.min((performance.now() - lastFrameWall) / 1000, 1 / 30) * speed();
    state.hand = { t: t };
    clickSound();
    if (state.measure) {
      record(t, 'hand');
      const dt = Math.round(t * 100) / 100 - state.measure.t;
      setStatus(T('停錶：t = ', 'Stopped: t = ') + num(t, 2) + T(' s。', ' s. ') +
        (Math.abs(dt) < 0.005 ? T('幾乎正好在抵達的瞬間！', 'Almost exactly at the moment of arrival!')
          : T('比光電閘的時間' + (dt > 0 ? '晚 ' : '早 ') + num(Math.abs(dt), 2) + ' s（反應時間的影響）。', (dt > 0 ? 'Late' : 'Early') + ' by ' + num(Math.abs(dt), 2) + ' s compared with a photogate (your reaction time).')));
    }
    else setStatus(T('這次運動沒有一路走到底，無法量測。', 'This run did not go all the way, so it cannot be measured.'));
    if (isFinite(state.tl.end.t) && state.t >= state.tl.end.t) finishRun();
    updateButtons();
    requestDraw();
  }

  // ======================= 介面事件 =======================
  $('play').addEventListener('click', function () {
    if (state.phase === 'ready') { release(); return; }
    if (state.phase === 'running') { state.phase = 'paused'; state.runPaused = true; stopWhirr(); updateButtons(); requestDraw(); return; }
    if (state.phase === 'paused') { state.phase = 'running'; updateButtons(); startLoop(); return; }
    putBack(); release();
  });
  $('reset').addEventListener('click', function () { putBack(); requestDraw(); });
  $('lap').addEventListener('click', stopWatch);
  cv.addEventListener('pointerdown', function () { if (state.timing === 'hand') stopWatch(); });
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || state.timing !== 'hand') return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    if (tg && tg.tagName === 'BUTTON' && tg.id !== 'play' && tg.id !== 'lap') return;
    if ((state.phase === 'running' || state.phase === 'paused') && !state.hand && !state.staticRun) { e.preventDefault(); stopWatch(); }
  });
  $('clearAll').addEventListener('click', function () {
    state.runs = [];
    renderRuns(false);
    putBack(T('已全部清除：量測紀錄與速度圖都清掉了，滑桿設定不變。', 'Everything is cleared: the measurements and the graph are gone; slider settings are kept.'));
    requestDraw();
  });
  $('slow').addEventListener('change', function (ev) {
    state.slow = ev.target.checked;
    if (state.slow && state.phase !== 'ready') state.runSlow = true;
  });
  [['showForces', 'forces'], ['showPairs', 'pairs'], ['showAcc', 'acc'], ['showComp', 'comp']].forEach(function (pr) {
    $(pr[0]).addEventListener('change', function (ev) { state.show[pr[1]] = ev.target.checked; requestDraw(); });
  });
  function setTiming(m) {
    state.timing = m;
    $('timeGate').setAttribute('aria-pressed', String(m === 'gate'));
    $('timeHand').setAttribute('aria-pressed', String(m === 'hand'));
    $('timeHint').textContent = m === 'gate'
      ? T('光電計時器在釋放時開始、物體抵達時自動停止，讀到 0.001 s。', 'The photogate timer starts when the body is released and stops automatically, to 0.001 s.')
      : T('碼錶在釋放時自動開始；在物體抵達的瞬間按「停錶」（或點畫面、按空白鍵），讀到 0.01 s。', 'The stopwatch starts automatically at release; press “Stop watch” (or tap the picture, or press Space) the instant the body arrives. It reads to 0.01 s.');
    putBack();
    requestDraw();
  }
  $('timeGate').addEventListener('click', function () { setTiming('gate'); });
  $('timeHand').addEventListener('click', function () { setTiming('hand'); });

  // 喇叭按鈕
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
    if (!on) stopWhirr();
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // 分頁
  const tabs = [1, 2, 3, 4].map(function (i) { return $('tab' + i); });
  function setMode(m, focus) {
    if (m === state.mode && state.p) return;
    state.mode = m;
    tabs.forEach(function (b, i) {
      const on = i + 1 === m;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      $('panel' + (i + 1)).hidden = !on;
    });
    $('showComp').closest('label').hidden = m !== 4;
    if (focus) tabs[m - 1].focus();
    paramsChanged();
  }
  tabs.forEach(function (b, i) {
    b.addEventListener('click', function () { setMode(i + 1); });
    b.addEventListener('keydown', function (e) {
      let k = -1;
      if (e.key === 'ArrowRight') k = (i + 1) % 4;
      else if (e.key === 'ArrowLeft') k = (i + 3) % 4;
      else if (e.key === 'Home') k = 0;
      else if (e.key === 'End') k = 3;
      if (k >= 0) { e.preventDefault(); setMode(k + 1, true); }
    });
  });

  // 推／拉、木塊數
  function setPush(v) {
    state.push = v;
    $('modePush').setAttribute('aria-pressed', String(v));
    $('modePull').setAttribute('aria-pressed', String(!v));
    paramsChanged();
  }
  function setN(n) {
    state.n = n;
    $('n2').setAttribute('aria-pressed', String(n === 2));
    $('n3').setAttribute('aria-pressed', String(n === 3));
    $('box3m3').hidden = n !== 3;
    paramsChanged();
  }
  $('modePush').addEventListener('click', function () { if (!state.push) setPush(true); });
  $('modePull').addEventListener('click', function () { if (state.push) setPush(false); });
  $('n2').addEventListener('click', function () { if (state.n !== 2) setN(2); });
  $('n3').addEventListener('click', function () { if (state.n !== 3) setN(3); });

  // 搬砝碼（總質量不變）
  function moveMass(from, to) {
    const a = val(from), b = val(to);
    if (a - 0.01 < 0.05 - 1e-9 || b + 0.01 > 2 + 1e-9) {
      setStatus(T('砝碼不夠搬了（每邊 0.05～2 kg）。', 'No more slotted masses to move (each side 0.05–2 kg).'));
      return;
    }
    const na = Math.round((a - 0.01) * 1000) / 1000, nb = Math.round((b + 0.01) * 1000) / 1000;
    LabNum.set(from, na);
    LabNum.set(to, nb);
    refreshOutputs();
    paramsChanged();
    setStatus(T('搬了一個 10 g 砝碼：', 'Moved one 10 g mass: ') + 'Δm = ' + num(val(el.a1m1) - val(el.a1m2), 3) + ' kg' + T('，總質量 ', ', total ') + num(val(el.a1m1) + val(el.a1m2), 3) + ' kg');
  }
  $('move12').addEventListener('click', function () { moveMass(el.a1m1, el.a1m2); });
  $('move21').addEventListener('click', function () { moveMass(el.a1m2, el.a1m1); });

  // 滑桿
  Object.keys(el).forEach(function (id) {
    el[id].addEventListener('input', function () {
      // μk ≤ μs
      const pre = id.slice(0, 2);
      if (id.slice(2) === 'us' || id.slice(2) === 'uk') {
        const us = el[pre + 'us'], uk = el[pre + 'uk'];
        if (id.slice(2) === 'us' && val(uk) > val(us) + 1e-12) LabNum.set(uk, val(us));
        if (id.slice(2) === 'uk' && val(uk) > val(us) + 1e-12) LabNum.set(us, val(uk));
      }
      refreshOutputs();
      if (+id.charAt(1) === state.mode) paramsChanged();
    });
  });

  // ======================= 啟動 =======================
  readColors();
  refreshOutputs();
  rebuild();
  putBack();
  renderRuns(false);
  updateSoundButton();
  $('showComp').closest('label').hidden = true;
  function themeChanged() { readColors(); if (L) { buildBackground(); } state.segKey = null; renderRuns(false); requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0, lastFW = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lastW || fcv.clientWidth !== lastFW) { lastW = cv.clientWidth; lastFW = fcv.clientWidth; resize(); }
    }).observe(cv);
    new ResizeObserver(function () { if (fcv.clientWidth !== lastFW) { lastFW = fcv.clientWidth; resize(); } }).observe(fcv);
  } else window.addEventListener('resize', resize);
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：裝飾動畫已關閉。', 'Reduced motion is on: decorative animations are off.'));
})();
