/* lens-mirror.js — 「透鏡與面鏡成像」模組的畫面與互動（物理計算在 lens-mirror-core.js） */
(function () {
  'use strict';
  const LM = window.LensMirrorCore;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const P_MIN = 1, P_MAX = 45, H_MIN = 1, H_MAX = 10;

  const state = {
    el: 'convex-lens',
    fAbs: 10, p: 25, h: 6,
    show: { rays: true, fan: false, ext: true, dim: true, flow: false },
    hover: null,       // null | 'body' | 'tip'
    drag: null,
    phase: 0           // 光的行進動畫的相位（px）
  };

  // ---------- 色彩（lab.css 代號） ----------
  const colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--surface', '--accent', '--pos', '--neg', '--probe',
      '--equi', '--field', '--b-optics', '--b-wave']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
  }
  function rgbOf(c) {
    const s = String(c).trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) {
      let hx = m[1];
      if (hx.length < 6) hx = hx.split('').map(function (x) { return x + x; }).join('');
      return [parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16)];
    }
    m = s.match(/[\d.]+/g);
    return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
  }
  function alpha(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
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
    if (!isFinite(v)) return '∞';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, d) {
    if (!isFinite(v)) return v < 0 ? '−∞' : '∞';
    const s = num(v, d);
    return v > 0 && /[1-9]/.test(s) ? '+' + s : s;
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  function cm(v) { return num(v, Math.abs(v) >= 100 ? 1 : 2) + ' cm'; }

  // ---------- 文字（中英） ----------
  function elemName(e) { return T(e.zh, e.en); }
  function natureText(s) {
    if (s.atInfinity) return T('不成像（像在無窮遠）', 'No image (at infinity)');
    const sep = T('・', ' · ');
    const a = s.real ? T('實像', 'Real') : T('虛像', 'Virtual');
    const b = s.upright ? T('正立', 'upright') : T('倒立', 'inverted');
    const c = s.size === 'same' ? T('等大', 'same size') : s.size === 'magnified' ? T('放大', 'magnified') : T('縮小', 'reduced');
    return a + sep + b + sep + c;
  }
  function whereText(s) {
    if (s.atInfinity) return T('像在無窮遠', 'Image at infinity');
    const lens = s.element.kind === 'lens';
    if (s.real) return lens ? T('實像：在透鏡另一側', 'Real: on the far side of the lens') : T('實像：在鏡前', 'Real: in front of the mirror');
    return lens ? T('虛像：與物體同側', 'Virtual: on the object’s side') : T('虛像：在鏡後', 'Virtual: behind the mirror');
  }
  function statusText(s) {
    const lens = s.element.kind === 'lens';
    const id = s.element.id;
    if (id === 'plane-mirror') return T('平面鏡：像在鏡後與物體等距處，是正立、等大的虛像（q = −p，m = 1）。',
      'Plane mirror: the image is as far behind the mirror as the object is in front — virtual, upright and the same size (q = −p, m = 1).');
    if (id === 'concave-lens') return T('凹透鏡：不論物體在哪裡，都成正立、縮小的虛像，像與物體同側，在透鏡與焦點之間。',
      'Concave lens: wherever the object is, the image is virtual, upright and reduced, on the object’s side between the lens and the focus.');
    if (id === 'convex-mirror') return T('凸面鏡：不論物體在哪裡，都成正立、縮小的虛像，像在鏡後、鏡面與焦點之間。',
      'Convex mirror: wherever the object is, the image is virtual, upright and reduced, behind the mirror between the mirror and the focus.');
    switch (s.case) {
      case 'beyond2F': return lens
        ? T('物體在 2F 以外：成倒立、縮小的實像，像在透鏡另一側的 F′ 與 2F′ 之間。', 'Object beyond 2F: a real, inverted, reduced image on the far side, between F′ and 2F′.')
        : T('物體在曲率中心 C 以外：成倒立、縮小的實像，像在鏡前 F 與 C 之間。', 'Object beyond C: a real, inverted, reduced image in front of the mirror, between F and C.');
      case 'at2F': return lens
        ? T('物體在 2F 上：成倒立、等大的實像，像在另一側的 2F′ 上（q = 2f，m = −1）。', 'Object at 2F: a real, inverted image of the same size, at 2F′ on the far side (q = 2f, m = −1).')
        : T('物體在曲率中心 C 上：成倒立、等大的實像，像也在 C 上（q = 2f，m = −1）。', 'Object at C: a real, inverted image of the same size, also at C (q = 2f, m = −1).');
      case 'between': return lens
        ? T('物體在 F 與 2F 之間：成倒立、放大的實像，像在另一側的 2F′ 以外。', 'Object between F and 2F: a real, inverted, magnified image beyond 2F′ on the far side.')
        : T('物體在 F 與 C 之間：成倒立、放大的實像，像在 C 以外。', 'Object between F and C: a real, inverted, magnified image beyond C.');
      case 'atF': return lens
        ? T('物體在焦點 F 上：折射光互相平行，永不相交，不成像（像在無窮遠）。', 'Object at the focus F: the rays leave parallel and never meet — no image (it is at infinity).')
        : T('物體在焦點 F 上：反射光互相平行，永不相交，不成像（像在無窮遠）。', 'Object at the focus F: the reflected rays are parallel and never meet — no image (it is at infinity).');
      default: return lens
        ? T('物體在焦點以內：折射光發散，反向延長線交會成正立、放大的虛像，與物體同側（放大鏡）。', 'Object inside F: the rays diverge; their extensions meet at a virtual, upright, magnified image on the object’s side (a magnifying glass).')
        : T('物體在焦點以內：反射光發散，反向延長線在鏡後交會成正立、放大的虛像（化妝鏡）。', 'Object inside F: the reflected rays diverge; their extensions meet behind the mirror at a virtual, upright, magnified image (a make-up mirror).');
    }
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 150;
  let V = null; // 版面：{ k (px/cm), cx, cy, XW, YH, A (元件半高 cm), narrow }
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');

  function X(x) { return V.cx + x * V.k; }
  function Y(y) { return V.cy - y * V.k; }

  function layout() {
    const narrow = cw < 560;
    const XW = narrow ? 47.5 : 50;           // 中心到左右邊緣的距離（cm）
    const k = cw / (2 * XW);
    const YH = ch / 2 / k;
    return { narrow: narrow, XW: XW, k: k, YH: YH, cx: cw / 2, cy: Math.round(ch / 2) + 0.5, A: Math.min(16, YH * 0.72) };
  }

  function resize() {
    const w = cv.clientWidth, hh = cv.clientHeight;
    if (!w || !hh) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w; ch = hh;
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    V = layout();
    buildBackground();
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

  /** 不變的圖層：暈影背景、格線（每 10 cm 主格線、每 2 cm 次格線）、主軸與刻度、比例尺 */
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const rg = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.15, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
    rg.addColorStop(0, colors.dark ? shade(base, 0.035) : base);
    rg.addColorStop(1, shade(base, colors.dark ? -0.35 : -0.05));
    c.fillStyle = rg;
    roundRect(c, 0, 0, cw, ch, 8);
    c.fill();

    const px = function (v) { return Math.round(v) + 0.5; };
    const nx = Math.ceil(V.XW / 2) + 1, ny = Math.ceil(V.YH / 2) + 1;
    [[0.035, false], [0.09, true]].forEach(function (lv) {
      if (!lv[1] && V.k < 4.5) return; // 太密時不畫次格線
      c.strokeStyle = alpha(colors.text, lv[0] * (colors.dark ? 0.8 : 1));
      c.lineWidth = 1;
      c.beginPath();
      for (let i = -nx; i <= nx; i++) {
        if ((i % 5 === 0) !== lv[1]) continue;
        c.moveTo(px(X(i * 2)), 0); c.lineTo(px(X(i * 2)), ch);
      }
      for (let j = -ny; j <= ny; j++) {
        if (j === 0 || (j % 5 === 0) !== lv[1]) continue;
        c.moveTo(0, px(Y(j * 2))); c.lineTo(cw, px(Y(j * 2)));
      }
      c.stroke();
    });

    // 主軸：兩層線（底層較寬較淡）
    c.lineCap = 'round';
    c.strokeStyle = alpha(colors.muted, 0.22);
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(6, V.cy); c.lineTo(cw - 6, V.cy); c.stroke();
    c.strokeStyle = alpha(colors.muted, 0.85);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(6, V.cy); c.lineTo(cw - 6, V.cy); c.stroke();
    // 刻度：每 5 cm 短刻度、每 10 cm 長刻度
    c.strokeStyle = alpha(colors.muted, 0.6);
    c.beginPath();
    for (let i = -Math.floor(V.XW / 5); i <= Math.floor(V.XW / 5); i++) {
      if (i === 0) continue;
      const len = i % 2 === 0 ? 4 : 2.5;
      c.moveTo(px(X(i * 5)), V.cy - len); c.lineTo(px(X(i * 5)), V.cy + len);
    }
    c.stroke();
    // 主軸名稱
    c.font = '600 11px system-ui, sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'bottom';
    c.fillStyle = alpha(colors.muted, 0.9);
    c.fillText(T('主軸', 'principal axis'), cw - 8, V.cy - 5);

    // 比例尺：寬畫面放右上角；窄畫面放在左上角資訊框下方
    c.font = '600 11px system-ui, sans-serif';
    const lw0 = c.measureText('10 cm').width;
    const sx1 = V.narrow ? 20 + lw0 + 10 * V.k : cw - 12, sx0 = sx1 - 10 * V.k, sy = V.narrow ? 48 : 18;
    c.font = '600 11px system-ui, sans-serif';
    const lbl = '10 cm';
    const tw = c.measureText(lbl).width;
    c.fillStyle = alpha(colors.surface, 0.75);
    roundRect(c, sx0 - tw - 16, sy - 11, sx1 - sx0 + tw + 24, 20, 6);
    c.fill();
    c.strokeStyle = colors.muted;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(sx0, sy - 4); c.lineTo(sx0, sy + 4);
    c.moveTo(sx0, sy); c.lineTo(sx1, sy);
    c.moveTo(sx1, sy - 4); c.lineTo(sx1, sy + 4);
    c.stroke();
    c.fillStyle = colors.muted;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillText(lbl, sx0 - 6, sy);
  }

  // ---------- 小工具：標籤 ----------
  const FONT = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
  function fontPx() { const m = ctx.font.match(/(\d+(?:\.\d+)?)px/); return m ? +m[1] : 12; }
  /** 半透明圓角底框標籤；回傳外框 */
  function pill(text, x, y, opt) {
    opt = opt || {};
    ctx.save();
    ctx.font = opt.font || FONT;
    const fs = fontPx();
    const padX = 7, h = Math.round(fs + 9);
    const w = ctx.measureText(text).width + padX * 2;
    let bx = opt.align === 'right' ? x - w : opt.align === 'left' ? x : x - w / 2;
    bx = Math.max(4, Math.min(cw - w - 4, bx));
    let by = Math.max(4, Math.min(ch - h - 4, y - h / 2));
    if (opt.measure) { ctx.restore(); return { x: bx, y: by, w: w, h: h }; }
    ctx.shadowColor = 'rgba(0,0,0,0.16)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = alpha(colors.surface, opt.bgAlpha || 0.88);
    roundRect(ctx, bx, by, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (opt.stroke) { ctx.strokeStyle = opt.stroke; ctx.lineWidth = 1; if (opt.dashed) ctx.setLineDash([3, 3]); roundRect(ctx, bx + 0.5, by + 0.5, w - 1, h - 1, h / 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = opt.color || colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + padX, by + h / 2 + 0.5);
    ctx.restore();
    return { x: bx, y: by, w: w, h: h };
  }
  function overlap(a, b) { return a.x < b.x + b.w + 3 && b.x < a.x + a.w + 3 && a.y < b.y + b.h + 2 && b.y < a.y + a.h + 2; }
  /** 只有描邊光暈的小字（焦點名稱等） */
  function haloText(text, x, y, color, align) {
    ctx.save();
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.92);
    ctx.lineWidth = 4;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ---------- 光學元件 ----------
  function drawElement(sol, extendTo) {
    const e = sol.element;
    const x0 = X(0), yTop = Y(V.A), yBot = Y(-V.A);
    const glass = colors.neg;
    ctx.save();
    // 延伸的元件平面（主光線打在元件外時，課本畫法）
    if (extendTo > V.A) {
      ctx.strokeStyle = alpha(colors.muted, 0.55);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, Y(Math.min(extendTo, V.YH + 2))); ctx.lineTo(x0, yTop);
      ctx.moveTo(x0, yBot); ctx.lineTo(x0, Y(-Math.min(extendTo, V.YH + 2)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.kind === 'lens') {
      const tC = Math.max(9, Math.min(16, V.k * 1.5)); // 示意的厚度（px）
      const thin = 2.5;
      const conv = e.sign > 0;
      const half = conv ? tC / 2 : thin / 2;   // 中央半厚
      const edge = conv ? thin / 2 : tC / 2;   // 邊緣半厚
      const ctrl = 2 * half - edge;             // 二次曲線控制點，使中央半厚為 half
      const path = function () {
        ctx.beginPath();
        ctx.moveTo(x0 - edge, yTop);
        ctx.lineTo(x0 + edge, yTop);
        ctx.quadraticCurveTo(x0 + ctrl, V.cy, x0 + edge, yBot);
        ctx.lineTo(x0 - edge, yBot);
        ctx.quadraticCurveTo(x0 - ctrl, V.cy, x0 - edge, yTop);
        ctx.closePath();
      };
      // 柔和投影
      ctx.save();
      ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.5)' : 'rgba(20,40,60,0.18)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = alpha(glass, colors.dark ? 0.16 : 0.10);
      path(); ctx.fill();
      ctx.restore();
      // 玻璃：由左而右的漸層（左緣亮、右緣暗），再疊一層由上而下的光澤
      const g = ctx.createLinearGradient(x0 - tC, 0, x0 + tC, 0);
      g.addColorStop(0, alpha(shade(glass, 0.55), colors.dark ? 0.45 : 0.55));
      g.addColorStop(0.45, alpha(glass, colors.dark ? 0.28 : 0.20));
      g.addColorStop(1, alpha(shade(glass, -0.25), colors.dark ? 0.40 : 0.32));
      ctx.fillStyle = g;
      path(); ctx.fill();
      const g2 = ctx.createLinearGradient(0, yTop, 0, yBot);
      g2.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.10 : 0.35) + ')');
      g2.addColorStop(0.5, 'rgba(255,255,255,0)');
      g2.addColorStop(1, 'rgba(0,0,0,' + (colors.dark ? 0.12 : 0.05) + ')');
      ctx.fillStyle = g2;
      path(); ctx.fill();
      ctx.strokeStyle = alpha(shade(glass, colors.dark ? 0.2 : -0.15), 0.85);
      ctx.lineWidth = 1.2;
      path(); ctx.stroke();
      // 左側高光
      ctx.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.35 : 0.8) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 - edge + 1.2, yTop + 6);
      ctx.quadraticCurveTo(x0 - ctrl + 1.6, V.cy - (yBot - yTop) * 0.1, x0 - edge + 1.2 + (ctrl - edge) * 0.5, V.cy - (yBot - yTop) * 0.12);
      ctx.stroke();
      // 中央平面（光線轉折處）
      ctx.strokeStyle = alpha(colors.text, 0.18);
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(x0, yTop + 3); ctx.lineTo(x0, yBot - 3); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // 面鏡：鏡面朝左（物體在左方），背面畫斜線。凹面鏡兩端向左彎，凸面鏡兩端向右彎（示意）
      const sag = e.sign === 0 ? 0 : (e.sign > 0 ? -1 : 1) * Math.max(6, Math.min(12, V.k * 1.1));
      const xs = function (y) { const t = (y - V.cy) / (yBot - V.cy); return x0 + sag * t * t; };
      const N = 28;
      const curve = function (dx) {
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const y = yTop + (yBot - yTop) * i / N;
          if (i === 0) ctx.moveTo(xs(y) + dx, y); else ctx.lineTo(xs(y) + dx, y);
        }
      };
      // 背板（深色帶）＋斜線
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const y = yTop + (yBot - yTop) * i / N; if (i === 0) ctx.moveTo(xs(y), y); else ctx.lineTo(xs(y), y); }
      for (let i = N; i >= 0; i--) { const y = yTop + (yBot - yTop) * i / N; ctx.lineTo(xs(y) + 9, y); }
      ctx.closePath();
      const bgr = ctx.createLinearGradient(x0, 0, x0 + 10, 0);
      bgr.addColorStop(0, alpha(colors.field, colors.dark ? 0.35 : 0.22));
      bgr.addColorStop(1, alpha(colors.field, 0.02));
      ctx.fillStyle = bgr;
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = alpha(colors.field, colors.dark ? 0.55 : 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = yTop - 12; y < yBot + 12; y += 7) { ctx.moveTo(x0 - 14, y + 14); ctx.lineTo(x0 + 16, y - 14); }
      ctx.stroke();
      ctx.restore();
      // 鏡面：兩層（底層寬、上層細亮），帶銀色漸層
      ctx.lineCap = 'round';
      ctx.strokeStyle = alpha(colors.field, colors.dark ? 0.55 : 0.75);
      ctx.lineWidth = 4;
      curve(0.5); ctx.stroke();
      const sg = ctx.createLinearGradient(0, yTop, 0, yBot);
      sg.addColorStop(0, colors.dark ? 'rgba(235,245,250,0.95)' : 'rgba(255,255,255,0.95)');
      sg.addColorStop(0.5, colors.dark ? 'rgba(170,190,200,0.85)' : 'rgba(190,205,215,0.95)');
      sg.addColorStop(1, colors.dark ? 'rgba(220,235,240,0.95)' : 'rgba(250,252,255,0.95)');
      ctx.strokeStyle = sg;
      ctx.lineWidth = 1.6;
      curve(-0.6); ctx.stroke();
      // 鏡頂所在的平面（光線轉折處）
      if (sag !== 0) {
        ctx.strokeStyle = alpha(colors.text, 0.16);
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.lineTo(x0, yBot); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  /** 主軸上的特殊點：小球（徑向漸層）＋名稱 */
  function drawPoints(sol) {
    const e = sol.element;
    const pts = [];
    if (e.sign !== 0) {
      if (e.kind === 'lens') {
        pts.push(['F', sol.points.F], ['F′', sol.points.F2], ['2F', sol.points.twoF], ['2F′', sol.points.twoF2]);
      } else {
        pts.push(['F', sol.points.F], ['C', sol.points.C]);
      }
    }
    pts.push([e.kind === 'lens' ? 'O' : 'V', 0]);
    pts.forEach(function (pt) {
      const x = X(pt[1]);
      if (x < -10 || x > cw + 10) return;
      const isF = pt[0] === 'F' || pt[0] === 'F′';
      const col = isF ? colors['b-optics'] : colors.muted;
      const r = isF ? 4 : 3.2;
      if (pt[0] !== 'O' && pt[0] !== 'V') {
        const g = ctx.createRadialGradient(x - r * 0.35, V.cy - r * 0.35, 0.3, x, V.cy, r);
        g.addColorStop(0, shade(col, 0.6));
        g.addColorStop(1, col);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, V.cy, r, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = alpha(colors['canvas-bg'], 0.9);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      haloText(pt[0], x + (pt[0] === 'O' || pt[0] === 'V' ? -8 : 0), V.cy + 7, col);
    });
  }

  // ---------- 箭頭（物與像） ----------
  /** 直立箭頭：底在 (x, 0)，頂在 (x, yTip)（畫面座標） */
  function drawArrow(x, yBase, yTip, color, opt) {
    opt = opt || {};
    const len = yTip - yBase;          // 負值代表朝上
    const dir = len < 0 ? -1 : 1;
    const L = Math.abs(len);
    if (L < 1) return;
    const head = Math.min(15, L * 0.45), hw = Math.min(8, Math.max(4, head * 0.6));
    const sw = opt.width || 4;
    const yNeck = yTip - dir * head;
    ctx.save();
    if (opt.virtual) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = alpha(color, 0.16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x - sw / 2, yBase); ctx.lineTo(x - sw / 2, yNeck); ctx.lineTo(x - hw, yNeck);
      ctx.lineTo(x, yTip); ctx.lineTo(x + hw, yNeck); ctx.lineTo(x + sw / 2, yNeck); ctx.lineTo(x + sw / 2, yBase);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      return;
    }
    // 投影
    ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    const g = ctx.createLinearGradient(x - hw, 0, x + hw, 0);
    g.addColorStop(0, shade(color, 0.35));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -0.25));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - sw / 2, yBase);
    ctx.lineTo(x - sw / 2, yNeck);
    ctx.lineTo(x - hw, yNeck + dir * 1.5);
    ctx.quadraticCurveTo(x - hw * 0.35, yNeck - dir * head * 0.35, x, yTip);
    ctx.quadraticCurveTo(x + hw * 0.35, yNeck - dir * head * 0.35, x + hw, yNeck + dir * 1.5);
    ctx.lineTo(x + sw / 2, yNeck);
    ctx.lineTo(x + sw / 2, yBase);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // 左緣高光
    ctx.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.35 : 0.55) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - sw / 2 + 0.8, yBase); ctx.lineTo(x - sw / 2 + 0.8, yNeck); ctx.stroke();
    // 底座
    ctx.fillStyle = shade(color, -0.2);
    ctx.beginPath(); ctx.ellipse(x, yBase, 4.5, 2, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
  }

  // ---------- 光線 ----------
  /** 由 (x, y) 沿 (dx, dy) 走到離開畫面（加上邊界）所需的參數（cm）；dx、dy 為單位向量 */
  function exitParam(x, y, dx, dy) {
    const xm = V.XW + 6, ym = V.YH + 6;
    let t = 1e9;
    if (dx > 1e-12) t = Math.min(t, (xm - x) / dx);
    if (dx < -1e-12) t = Math.min(t, (-xm - x) / dx);
    if (dy > 1e-12) t = Math.min(t, (ym - y) / dy);
    if (dy < -1e-12) t = Math.min(t, (-ym - y) / dy);
    return Math.max(0, t);
  }
  /** 實際光線（實線，帶光暈），pts 為世界座標的折線；回傳像素長度 */
  function realPath(pts, color, w, glow, a) {
    a = a == null ? 1 : a;
    ctx.save();
    const line = function () {
      ctx.beginPath();
      pts.forEach(function (q, i) { if (i === 0) ctx.moveTo(X(q[0]), Y(q[1])); else ctx.lineTo(X(q[0]), Y(q[1])); });
    };
    if (glow) {
      if (colors.dark) ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = alpha(color, (colors.dark ? 0.13 : 0.10) * a);
      ctx.lineWidth = w * 4;
      line(); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = alpha(color, a);
    ctx.lineWidth = w;
    line(); ctx.stroke();
    ctx.restore();
  }
  function dashed(a, b, color, kind, k) {
    ctx.save();
    ctx.strokeStyle = alpha(color, (kind === 'aim' ? 0.55 : 0.85) * (k == null ? 1 : k));
    ctx.lineWidth = kind === 'aim' ? 1.2 : 1.5;
    ctx.setLineDash(kind === 'aim' ? [1.5, 4] : [6, 5]);
    ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.stroke();
    ctx.restore();
  }
  /** 光線方向的小箭頭（彎弧三角形） */
  function chevron(xw, yw, dx, dy, color, s) {
    const x = X(xw), y = Y(yw);
    const ux = dx, uy = -dy; // 畫面座標 y 向下
    s = s || 5;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + ux * s * 1.4, y + uy * s * 1.4);
    ctx.quadraticCurveTo(x - ux * s * 0.2, y - uy * s * 0.2, x - ux * s + uy * s, y - uy * s - ux * s);
    ctx.lineTo(x - ux * s * 0.45, y - uy * s * 0.45);
    ctx.lineTo(x - ux * s - uy * s, y - uy * s + ux * s);
    ctx.quadraticCurveTo(x - ux * s * 0.2, y - uy * s * 0.2, x + ux * s * 1.4, y + uy * s * 1.4);
    ctx.fill();
    ctx.restore();
  }

  const RAY_COLOR = { parallel: 'pos', center: 'probe', vertex: 'probe', focal: 'neg', radius: 'b-wave' };

  /**
   * 畫一條光線：入射段（實線）、出射段（實線，到畫面邊緣）、
   * 出射光的反向延長線（虛線，到虛像或 via 點）、入射光的定義延長線（點線，到 aim 點）。
   * 回傳光的行進動畫要用的折線。
   */
  function drawRay(r, sol, color, opt) {
    const w = opt.width;
    const tOut = exitParam(r.xh, r.yh, r.outDir[0], r.outDir[1]);
    const end = [r.xh + r.outDir[0] * tOut, r.yh + r.outDir[1] * tOut];
    if (opt.ext) {
      // 出射光的反向延長線
      let tb = 0;
      const back = function (x) {
        const t = (x - r.xh) / r.outDir[0];
        if (t < tb) tb = t;
      };
      if (!sol.real && !sol.atInfinity) back(sol.xImg);
      if (r.via) back(r.via.x);
      if (tb < 0) {
        tb = Math.max(tb, -exitParam(r.xh, r.yh, -r.outDir[0], -r.outDir[1]));
        dashed([r.xh, r.yh], [r.xh + r.outDir[0] * tb, r.yh + r.outDir[1] * tb], color, 'ext', opt.a);
      }
      // 入射光的定義點（F、C）不在實際入射段上時，用點線連到它
      if (r.aim) {
        if (r.aim.x < r.x0 - 1e-9) dashed([r.aim.x, r.aim.y], [r.x0, r.y0], color, 'aim', opt.a);
        else if (r.aim.x > 1e-9) dashed([r.xh, r.yh], [r.aim.x, r.aim.y], color, 'aim', opt.a);
      }
    }
    const pts = [[r.x0, r.y0], [r.xh, r.yh], end];
    realPath(pts, color, w, opt.glow, opt.a);
    if (opt.arrows) {
      const inLen = Math.hypot(r.xh - r.x0, r.yh - r.y0);
      if (inLen * V.k > 34) chevron(r.x0 + r.inDir[0] * inLen * 0.5, r.y0 + r.inDir[1] * inLen * 0.5, r.inDir[0], r.inDir[1], color);
      const outShow = Math.min(tOut, (V.XW * 0.6));
      if (outShow * V.k > 40) chevron(r.xh + r.outDir[0] * outShow * 0.55, r.yh + r.outDir[1] * outShow * 0.55, r.outDir[0], r.outDir[1], color);
    }
    return pts;
  }

  /** 光的行進：在實際光線上移動的小光點（純裝飾） */
  function drawFlow(paths) {
    if (!state.show.flow) return;
    ctx.save();
    ctx.lineCap = 'round';
    if (colors.dark) ctx.globalCompositeOperation = 'lighter';
    const period = 26;
    paths.forEach(function (pp) {
      let cum = 0;
      ctx.strokeStyle = alpha(pp.color, (colors.dark ? 0.9 : 0.75) * (pp.a || 1));
      ctx.lineWidth = pp.w + 2.2;
      ctx.setLineDash([0.1, period]);
      for (let i = 0; i + 1 < pp.pts.length; i++) {
        const a = pp.pts[i], b = pp.pts[i + 1];
        const L = Math.hypot(X(b[0]) - X(a[0]), Y(b[1]) - Y(a[1]));
        ctx.lineDashOffset = cum - state.phase;
        ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.stroke();
        cum += L;
      }
    });
    ctx.restore();
  }

  // ---------- 距離標示 ----------
  function dimLine(x0w, x1w, yPx, label, color, isDashed) {
    const lim = V.XW - 1.5 / V.k * 2, a = Math.max(-lim, Math.min(lim, x0w)), b = Math.max(-lim, Math.min(lim, x1w));
    const xa = X(a), xb = X(b);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.3;
    if (isDashed) ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(xa, yPx); ctx.lineTo(xb, yPx); ctx.stroke();
    ctx.setLineDash([]);
    // 兩端的短豎線與箭頭
    const tip = function (x, dir, clipped) {
      if (!clipped) { ctx.beginPath(); ctx.moveTo(x, yPx - 5); ctx.lineTo(x, yPx + 5); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x, yPx); ctx.lineTo(x - dir * 6, yPx - 3.2); ctx.lineTo(x - dir * 6, yPx + 3.2); ctx.closePath(); ctx.fill();
    };
    const dir = xb > xa ? 1 : -1;
    if (Math.abs(xb - xa) > 14) { tip(xa, -dir, a !== x0w); tip(xb, dir, b !== x1w); }
    ctx.restore();
    pill(label, (xa + xb) / 2, yPx, { color: color, font: '600 11px system-ui, sans-serif', bgAlpha: 0.9 });
  }

  // ---------- 主繪圖 ----------
  let lastPaths = [];
  function draw() {
    if (!V) return;
    const s = LM.solve(state.el, state.fAbs, state.p, state.h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const principal = LM.principalRays(state.el, state.fAbs, state.p, state.h);
    let extendTo = 0;
    if (state.show.rays) principal.forEach(function (r) { extendTo = Math.max(extendTo, Math.abs(r.yh)); });

    drawElement(s, extendTo);
    drawPoints(s);

    const paths = [];
    // 多條光線（在主光線底下）
    if (state.show.fan) {
      const fan = LM.fanRays(state.el, state.fAbs, state.p, state.h, V.A * 0.96, 11);
      const fc = colors.dark ? colors.text : colors.field;
      fan.forEach(function (r) {
        const pts = drawRay(r, s, fc, { a: colors.dark ? 0.38 : 0.32, width: 1.1, ext: state.show.ext && !s.real, arrows: false, glow: false });
        paths.push({ pts: pts, color: colors.dark ? colors.text : colors.field, w: 0.2, a: 0.45 });
      });
    }
    // 主光線
    if (state.show.rays) {
      principal.forEach(function (r) {
        const col = colors[RAY_COLOR[r.key]];
        const pts = drawRay(r, s, col, { width: 2, ext: state.show.ext, arrows: true, glow: true });
        paths.push({ pts: pts, color: col, w: 1.2 });
      });
    }
    drawFlow(paths);
    lastPaths = paths;

    // 物體
    const xo = X(-state.p);
    if (state.hover || state.drag) {
      const tipY = Y(state.h);
      const g = ctx.createRadialGradient(xo, (tipY + V.cy) / 2, 2, xo, (tipY + V.cy) / 2, Math.max(26, (V.cy - tipY) * 0.8));
      g.addColorStop(0, alpha(colors.accent, 0.28));
      g.addColorStop(1, alpha(colors.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(xo, (tipY + V.cy) / 2, Math.max(26, (V.cy - tipY) * 0.8), 0, 2 * Math.PI); ctx.fill();
    }
    drawArrow(xo, V.cy, Y(state.h), colors.equi, { width: (state.hover || state.drag) ? 5 : 4 });
    // 頂端的拖曳把手
    ctx.save();
    ctx.strokeStyle = alpha(colors.equi, state.hover === 'tip' || (state.drag && state.drag.tip) ? 0.95 : 0.45);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(xo, Y(state.h), 9, 0, 2 * Math.PI); ctx.stroke();
    ctx.restore();

    // 物體標籤與左上角資訊（先畫，像的標籤會避開它們）
    const labelBoxes = [{ x: xo - 10, y: Y(state.h) - 10, w: 20, h: V.cy - Y(state.h) + 10 }];
    labelBoxes.push(pill(T('物體', 'Object'), xo, Math.max(14, Y(state.h) - 18), { color: colors.equi, font: '600 11px system-ui, sans-serif' }));
    const fTxt = isFinite(s.f) ? signed(s.f, 1) + ' cm' : '∞';
    labelBoxes.push(pill(elemName(s.element) + '　f = ' + fTxt + (s.atInfinity ? '' : '　m = ' + signed(s.m, 2)), 8, 18, { align: 'left', bgAlpha: 0.8 }));

    // 像
    const imgCol = colors['b-optics'];
    let imgLabelDone = false;
    if (!s.atInfinity) {
      const xi = X(s.xImg);
      const onScreen = xi > -2 && xi < cw + 2;
      if (onScreen) {
        drawArrow(xi, V.cy, Y(s.hImg), imgCol, { virtual: !s.real, width: 4 });
        if (s.real) {
          // 實像的頂端：光線會聚處的小亮點
          const g = ctx.createRadialGradient(xi, Y(s.hImg), 0, xi, Y(s.hImg), 10);
          g.addColorStop(0, alpha(colors.dark ? '#ffffff' : imgCol, colors.dark ? 0.7 : 0.35));
          g.addColorStop(1, alpha(imgCol, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(xi, Y(s.hImg), 10, 0, 2 * Math.PI); ctx.fill();
        }
        const tipY = Y(s.hImg);
        const up = s.hImg > 0;
        const txt = T('像：', 'Image: ') + natureText(s);
        const io = { color: imgCol, stroke: alpha(imgCol, 0.6), dashed: !s.real };
        // 候選位置：箭頭頂端外側、頂端內側、主軸另一側；選第一個不與其他標籤重疊的
        const cands = [up ? tipY - 16 : tipY + 16, up ? V.cy + 40 : V.cy - 40, up ? tipY + 18 : tipY - 18];
        if (!s.real) cands.unshift(cands.splice(1, 1)[0]); // 虛像：標籤優先放在主軸另一側，不擋住延長線的交會處
        let best = cands[0];
        for (let i = 0; i < cands.length; i++) {
          const b = pill(txt, xi, cands[i], Object.assign({ measure: true }, io));
          if (!labelBoxes.some(function (o) { return overlap(o, b); })) { best = cands[i]; break; }
        }
        pill(txt, xi, best, io);
        imgLabelDone = true;
      } else {
        const right = xi >= cw;
        pill((right ? '' : '← ') + T('像在畫面外：q = ', 'Image off screen: q = ') + signed(s.q, 1) + ' cm' + (right ? ' →' : ''),
          right ? cw - 8 : 8, V.narrow ? 78 : 52, { align: right ? 'right' : 'left', color: imgCol, stroke: alpha(imgCol, 0.6), dashed: !s.real });
        imgLabelDone = true;
      }
    }
    if (!imgLabelDone) {
      pill(T('出射光互相平行：像在無窮遠（不成像）', 'Rays leave parallel: image at infinity (no image)'), cw / 2, V.narrow ? 78 : 22, { color: imgCol, stroke: alpha(imgCol, 0.6) });
    }

    // 距離標示（畫面下方）
    if (state.show.dim) {
      const pc = colors.equi;
      const y1 = ch - 40, y2 = ch - 16;
      dimLine(-state.p, 0, y1, 'p = ' + num(state.p, 1) + ' cm', pc, false);
      if (!s.atInfinity) dimLine(0, s.xImg, y2, 'q = ' + signed(s.q, 1) + ' cm', imgCol, !s.real);
    }
  }

  // ---------- 讀數與面板 ----------
  function updatePanel() {
    const s = LM.solve(state.el, state.fAbs, state.p, state.h);
    const e = s.element;
    $('rF').innerHTML = isFinite(s.f) ? signed(s.f, 2) + ' cm<small>' + (e.sign > 0 ? T('會聚（f > 0）', 'converging (f > 0)') : T('發散（f < 0）', 'diverging (f < 0)')) + '</small>'
      : '∞<small>' + T('平面鏡（1/f = 0）', 'plane mirror (1/f = 0)') + '</small>';
    $('rP').textContent = cm(s.p);
    $('rQ').innerHTML = (s.atInfinity ? '∞' : signed(s.q, Math.abs(s.q) >= 100 ? 1 : 2) + ' cm') + '<small>' + whereText(s) + '</small>';
    $('rM').innerHTML = s.atInfinity ? '∞' : signed(s.m, 3) + '<small>' + (s.upright ? T('m > 0：正立', 'm > 0: upright') : T('m < 0：倒立', 'm < 0: inverted')) + '</small>';
    $('rH').textContent = s.atInfinity ? '—' : signed(s.hImg, 2) + ' cm';
    $('rType').textContent = natureText(s);
    const inv = function (v) { return num(v, 4); };
    const q4 = s.atInfinity ? '0' : inv(s.invQ);
    $('rSum').innerHTML = inv(s.invP) + ' + ' + (s.invQ < 0 ? '(' + q4 + ')' : q4) + ' = ' + inv(s.invP + s.invQ) + ' cm<sup>−1</sup>';
    $('rInvF').innerHTML = inv(s.invF) + ' cm<sup>−1</sup>';
    $('status').textContent = statusText(s);

    // 物體位置表
    const conv = e.sign > 0;
    const plane = e.sign === 0;
    $('casesCard').hidden = plane;
    const fl = conv ? 'f' : '|f|';
    const COND = { beyond2F: 'p > 2' + fl, at2F: 'p = 2' + fl, between: fl + ' < p < 2' + fl, atF: 'p = ' + fl, insideF: 'p < ' + fl };
    const relCase = (function () {
      const fa = state.fAbs, p = state.p, nr = function (a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(a, b); };
      if (nr(p, 2 * fa)) return 'at2F';
      if (nr(p, fa)) return 'atF';
      return p > 2 * fa ? 'beyond2F' : p > fa ? 'between' : 'insideF';
    })();
    document.querySelectorAll('[data-case]').forEach(function (b) {
      const key = b.dataset.case;
      const c = LM.CASES.filter(function (x) { return x.key === key; })[0];
      const rs = LM.solve(state.el, state.fAbs, c.pf * state.fAbs, 1);
      b.querySelector('.cond').textContent = COND[key];
      b.querySelector('.res').textContent = natureText(rs);
      b.setAttribute('aria-pressed', String(key === relCase));
      const t = T('把物體移到 ', 'Move the object to ') + COND[key];
      b.title = t;
    });
    $('casesHint').textContent = conv
      ? (e.kind === 'lens' ? T('點一下可把物體移到該位置。凸透鏡兩側各有一個焦點：物方焦點 F 與像方焦點 F′。', 'Tap a row to move the object there. A convex lens has a focus on each side: F on the object side and F′ on the far side.')
        : T('點一下可把物體移到該位置。面鏡的 2f 就是曲率半徑 R，2F 即曲率中心 C。', 'Tap a row to move the object there. For a mirror 2f is the radius of curvature R, so 2F is the centre of curvature C.'))
      : (e.kind === 'lens' ? T('凹透鏡：每一列的結果都一樣——永遠是正立、縮小的虛像。凹透鏡的像方焦點 F′ 在物體同側。', 'Concave lens: every row gives the same result — always a virtual, upright, reduced image. Its image-side focus F′ is on the object’s side.')
        : T('凸面鏡：每一列的結果都一樣——永遠是正立、縮小的虛像。焦點 F 與曲率中心 C 都在鏡後。', 'Convex mirror: every row gives the same result — always a virtual, upright, reduced image. F and C are both behind the mirror.'));

    // 圖例：透鏡用「經過光心」，面鏡用「射向鏡頂」與「經過 C」
    const lens = e.kind === 'lens';
    const keys = LM.principalRays(state.el, state.fAbs, state.p, state.h).map(function (r) { return r.key; });
    $('lgCenter').hidden = !lens;
    $('lgVertex').hidden = keys.indexOf('vertex') < 0;
    $('lgFocal').hidden = keys.indexOf('focal') < 0;
    $('lgRadius').hidden = keys.indexOf('radius') < 0;
  }

  function update() {
    updatePanel();
    draw();
    syncFlow();
    scheduleMission();
  }

  // ---------- 任務模式：設定穩定下來（停止拖曳約 0.3 s）後回報一次成像結果 ----------
  // 只在使用者親自操作之後才回報（預設狀態不會意外完成任務）
  let missionTimer = 0, userActed = false;
  ['input', 'change', 'click', 'pointerdown', 'keydown'].forEach(function (t) {
    document.querySelector('.lab').addEventListener(t, function (e) { if (e.isTrusted) userActed = true; }, true);
  });
  function scheduleMission() {
    if (!window.LabMission || !userActed) return;
    clearTimeout(missionTimer);
    if (state.drag) return;
    missionTimer = setTimeout(function () {
      const s = LM.solve(state.el, state.fAbs, state.p, state.h);
      window.LabMission.emit('image', {
        element: state.el, kind: s.element.kind, f: s.f, fAbs: state.fAbs, p: state.p, h: state.h,
        q: s.q, m: s.m, hImg: s.hImg, real: s.real, upright: s.upright, size: s.size,
        atInfinity: s.atInfinity, case: s.case, fan: state.show.fan, rays: state.show.rays
      });
    }, 300);
  }

  // ---------- 控制項 ----------
  const sF = $('f'), sP = $('p'), sH = $('h');
  function readSliders() {
    state.fAbs = val(sF);
    state.p = val(sP);
    state.h = val(sH);
    $('fo').textContent = state.el === 'plane-mirror' ? '∞' : fmtSlider(state.fAbs, sF) + ' cm';
    $('po').textContent = fmtSlider(state.p, sP) + ' cm';
    $('ho').textContent = fmtSlider(state.h, sH) + ' cm';
  }
  [sF, sP, sH].forEach(function (el) { el.addEventListener('input', function () { readSliders(); update(); }); });

  function setP(v) { if (window.LabNum) window.LabNum.set(sP, v); else { sP.value = v; readSliders(); update(); } }
  function setH(v) { if (window.LabNum) window.LabNum.set(sH, v); else { sH.value = v; readSliders(); update(); } }

  function setElement(id) {
    state.el = id;
    document.querySelectorAll('[data-el]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.el === id)); });
    const plane = id === 'plane-mirror';
    sF.disabled = plane;
    $('boxF').style.opacity = plane ? '0.5' : '';
    $('planeNote').hidden = !plane;
    readSliders();
    update();
  }
  document.querySelectorAll('[data-el]').forEach(function (b) {
    b.addEventListener('click', function () { setElement(b.dataset.el); });
  });
  document.querySelectorAll('[data-case]').forEach(function (b) {
    b.addEventListener('click', function () {
      const c = LM.CASES.filter(function (x) { return x.key === b.dataset.case; })[0];
      setP(Math.max(P_MIN, Math.min(P_MAX, c.pf * state.fAbs)));
    });
  });
  [['showRays', 'rays'], ['showFan', 'fan'], ['showExt', 'ext'], ['showDim', 'dim'], ['showFlow', 'flow']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; update(); });
  });

  // ---------- 拖曳物體（滑鼠與觸控） ----------
  function local(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function hitTest(pt) {
    if (!V) return null;
    const xo = X(-state.p), yt = Y(state.h);
    if (Math.hypot(pt[0] - xo, pt[1] - yt) < 20) return 'tip';
    if (Math.abs(pt[0] - xo) < 16 && pt[1] > yt - 6 && pt[1] < V.cy + 12) return 'body';
    return null;
  }
  /** 由滑鼠位置求物距：四捨五入到 0.1 cm，靠近 F、2F 時吸附 */
  function pFromX(px) {
    let p = -(px - V.cx) / V.k;
    p = Math.round(p * 10) / 10;
    if (state.el !== 'plane-mirror') {
      const snap = 7 / V.k;
      [state.fAbs, 2 * state.fAbs].forEach(function (s) { if (Math.abs(p - s) < snap) p = s; });
    }
    return Math.max(P_MIN, Math.min(P_MAX, p));
  }
  function hFromY(py) {
    const h = Math.round((V.cy - py) / V.k * 10) / 10;
    return Math.max(H_MIN, Math.min(H_MAX, h));
  }
  function dragTo(pt) {
    const d = state.drag;
    const p = pFromX(pt[0] - d.dx);
    if (Math.abs(p - state.p) > 1e-9) setP(p);
    if (d.tip) {
      const h = hFromY(pt[1] - d.dy);
      if (Math.abs(h - state.h) > 1e-9) setH(h);
    }
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!V) return;
    const pt = local(ev);
    const hit = hitTest(pt);
    if (!hit && pt[0] > X(0) - 4) return; // 元件右側：不動作
    ev.preventDefault();
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    const xo = X(-state.p), yt = Y(state.h);
    state.drag = hit ? { tip: hit === 'tip', dx: pt[0] - xo, dy: hit === 'tip' ? pt[1] - yt : 0 } : { tip: false, dx: 0, dy: 0 };
    cv.style.cursor = 'grabbing';
    dragTo(pt);
    draw();
  });
  cv.addEventListener('pointermove', function (ev) {
    const pt = local(ev);
    if (state.drag) { dragTo(pt); return; }
    if (ev.pointerType === 'mouse') {
      const h = hitTest(pt);
      if (h !== state.hover) { state.hover = h; draw(); }
      cv.style.cursor = h === 'tip' ? 'move' : h ? 'ew-resize' : (V && pt[0] < X(0) - 4 ? 'pointer' : 'default');
    }
  });
  function endDrag() { if (state.drag) { state.drag = null; cv.style.cursor = 'default'; draw(); scheduleMission(); } }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (state.hover && !state.drag) { state.hover = null; draw(); } });
  cv.addEventListener('keydown', function (ev) {
    const big = ev.shiftKey;
    let handled = true;
    if (ev.key === 'ArrowLeft') setP(Math.min(P_MAX, Math.round((state.p + (big ? 5 : 0.5)) * 10) / 10));
    else if (ev.key === 'ArrowRight') setP(Math.max(P_MIN, Math.round((state.p - (big ? 5 : 0.5)) * 10) / 10));
    else if (ev.key === 'ArrowUp') setH(Math.min(H_MAX, Math.round((state.h + (big ? 1 : 0.5)) * 10) / 10));
    else if (ev.key === 'ArrowDown') setH(Math.max(H_MIN, Math.round((state.h - (big ? 1 : 0.5)) * 10) / 10));
    else handled = false;
    if (handled) ev.preventDefault();
  });

  // ---------- 光的行進動畫（純裝飾；減少動態效果時預設關閉） ----------
  let raf = 0, lastT = 0, visible = true;
  function frame(t) {
    raf = 0;
    if (!state.show.flow || !visible || document.hidden) return;
    const dt = lastT ? Math.min(1 / 30, (t - lastT) / 1000) : 0;
    lastT = t;
    state.phase = (state.phase + dt * 55) % 1e6;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function syncFlow() {
    if (state.show.flow && visible && !document.hidden && !raf) { lastT = 0; raf = requestAnimationFrame(frame); }
  }
  if (!reducedMotion) { state.show.flow = true; $('showFlow').checked = true; }

  // ---------- 啟動 ----------
  function onTheme() { readColors(); if (V) { buildBackground(); } update(); }
  readColors();
  readSliders();
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  if (window.ResizeObserver) {
    let pending = false;
    new ResizeObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; resize(); });
    }).observe(cv);
  } else window.addEventListener('resize', resize);
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      syncFlow();
    }).observe(cv);
  }
  document.addEventListener('visibilitychange', syncFlow);
  setElement(state.el);
  resize();
  // settings.js 在 DOMContentLoaded 套用英文時會換掉部分文字，之後再更新一次
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { readSliders(); update(); });
})();
