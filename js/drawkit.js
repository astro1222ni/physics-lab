/*
 * drawkit.js — 全站共用的 2D 畫布繪圖工具（LabDraw），讓每個實驗的標籤、箭頭、球體、陰影一致。
 * 規範見 .claude/skills/physics-visual-design/SKILL.md；樣式取自已完成視覺升級的「拋體運動」。
 *
 * 載入：放在頁面程式之前（物理核心之後）：<script src="js/drawkit.js"></script>
 *
 * 顏色：LabDraw.c.<代號>（例如 LabDraw.c.accent、LabDraw.c['canvas-bg']），LabDraw.dark 為深色模式。
 *       lab:themechange 時自動重讀；模組自己的 themechange 處理只要重畫即可（drawkit 先載入，會先更新）。
 *       LabDraw.ver 在顏色或字體改變時遞增，可當成模組自己快取的鍵。
 * 所有繪圖函式第一個參數都是 ctx；座標一律是 CSS 像素（模組先 ctx.setTransform(dpr, …)）。
 * 純裝飾：這些函式只畫在指定位置，不會改變任何物理量的位置或大小。
 */
(function () {
  'use strict';
  const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", sans-serif';
  const TOKENS = ['bg', 'surface', 'text', 'muted', 'border', 'accent', 'accent-soft', 'pos', 'neg', 'field', 'equi', 'grid', 'probe', 'canvas-bg'];
  const D = { FONT: FONT, c: {}, dark: false, ver: 0 };

  // ---------- 顏色 ----------
  function rgb(c) {
    const s = String(c).trim();
    let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
    if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
    const n = s.match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  /** 半透明版本 */
  function alpha(c, a) { const r = rgb(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  /** f > 0 往白色混合、f < 0 往黑色混合（|f| ≤ 1） */
  function shade(c, f) {
    const r = rgb(c), t = f > 0 ? 255 : 0, k = Math.min(1, Math.abs(f));
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  /** 兩色內插（u = 0 → a，u = 1 → b） */
  function mix(a, b, u) {
    const p = rgb(a), q = rgb(b);
    return 'rgb(' + p.map(function (x, i) { return Math.round(x + (q[i] - x) * u); }).join(',') + ')';
  }
  function refresh() {
    const cs = getComputedStyle(document.documentElement);
    TOKENS.forEach(function (k) { D.c[k] = cs.getPropertyValue('--' + k).trim(); });
    const b = rgb(D.c['canvas-bg'] || '#ffffff');
    D.dark = (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) < 128;
    D.ver++;
    sprites.clear();
  }
  /** 陰影用的顏色：深色模式用黑，淺色模式用文字色（帶一點色調，比純黑柔和） */
  function shadowInk(a) { return alpha(D.dark ? '#000000' : D.c.text, a); }

  // ---------- 形狀 ----------
  function roundRect(ctx, x, y, w, h, r) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- 文字 ----------
  function textHeight(m, fallback) {
    return m && m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : fallback;
  }
  /** 帶背景色描邊（halo）的文字：在任何背景上都清楚 */
  function haloText(ctx, text, x, y, color, align, base, font) {
    ctx.font = font || '12px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = base || 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = alpha(D.c['canvas-bg'], 0.92);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color || D.c.text;
    ctx.fillText(text, x, y);
  }
  /**
   * 圓角底框標籤（pill）。align：left／center／right；(x, yb) 為底框「底邊」的參考點。
   * 傳回底框 {x, y, w, h}，方便其他標籤避開。
   */
  function pill(ctx, text, x, yb, color, align, font) {
    ctx.font = font || '600 12px ' + FONT;
    const m = ctx.measureText(text), tw = m.width, th = textHeight(m, 15);
    const pw = tw + 12, ph = th + 3;
    const bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    const by = yb - ph;
    roundRect(ctx, bx, by, pw, ph, ph / 2);
    ctx.fillStyle = alpha(D.c['canvas-bg'], D.dark ? 0.86 : 0.9);
    ctx.fill();
    ctx.strokeStyle = alpha(color || D.c.muted, D.dark ? 0.45 : 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color || D.c.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + pw / 2, by + ph / 2 + 0.5);
    return { x: bx, y: by, w: pw, h: ph };
  }
  /** 向量名稱（斜體主字＋下標），置中於 (x, y) */
  function vecLabel(ctx, text, sub, x, y, color) {
    const fMain = 'italic 600 13px ' + FONT, fSub = '600 9.5px ' + FONT;
    ctx.font = fMain;
    const w1 = ctx.measureText(text).width;
    let w2 = 0;
    if (sub) { ctx.font = fSub; w2 = ctx.measureText(sub).width + 0.5; }
    const x0 = x - (w1 + w2) / 2;
    haloText(ctx, text, x0, y, color, 'left', 'middle', fMain);
    if (sub) haloText(ctx, sub, x0 + w1 + 0.5, y + 4, color, 'left', 'middle', fSub);
  }
  /** 小字上標（畫布不可用 ⁰²³ 等上標字元）：先畫 base，再畫較小較高的 sup；傳回總寬度 */
  function supText(ctx, base, sup, x, y, color, font, align) {
    font = font || '12px ' + FONT;
    const px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(font) || [0, 12])[1]);
    const supFont = font.replace(/(\d+(?:\.\d+)?)px/, (px * 0.72).toFixed(1) + 'px');
    ctx.font = font; const w1 = ctx.measureText(base).width;
    ctx.font = supFont; const w2 = ctx.measureText(sup).width;
    const x0 = align === 'center' ? x - (w1 + w2) / 2 : align === 'right' ? x - w1 - w2 : x;
    haloText(ctx, base, x0, y, color, 'left', 'alphabetic', font);
    haloText(ctx, sup, x0 + w1 + 0.5, y - px * 0.38, color, 'left', 'alphabetic', supFont);
    return w1 + w2 + 0.5;
  }

  // ---------- 箭頭 ----------
  /**
   * 向量箭頭：略帶弧度的箭頭、背景色描邊、箭身上緣細高光（圓柱感）。全站幾何一致。
   * opts：{ label, sub, lx, ly（標籤相對箭頭尖端的位移，預設沿箭頭方向 11 px）, dash }
   */
  function arrow(ctx, x0, y0, x1, y1, color, width, opts) {
    opts = opts || {};
    width = width || 2.5;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 2) return;
    const ux = dx / L, uy = dy / L;
    const head = Math.min(4 * width, L * 0.45), hw = Math.min(1.75 * width, head * 0.5);
    const bx = x1 - ux * head, by = y1 - uy * head;
    const nx = -uy, ny = ux;
    const headPath = function () {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(x1 - ux * head * 0.45 + nx * hw * 0.35, y1 - uy * head * 0.45 + ny * hw * 0.35, bx + nx * hw, by + ny * hw);
      ctx.lineTo(bx + ux * head * 0.22, by + uy * head * 0.22);
      ctx.lineTo(bx - nx * hw, by - ny * hw);
      ctx.quadraticCurveTo(x1 - ux * head * 0.45 - nx * hw * 0.35, y1 - uy * head * 0.45 - ny * hw * 0.35, x1, y1);
      ctx.closePath();
    };
    const sx = bx + ux * head * 0.3, sy = by + uy * head * 0.3;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (opts.dash) ctx.setLineDash(opts.dash);
    ctx.strokeStyle = alpha(D.c['canvas-bg'], 0.75);
    ctx.lineWidth = width + 3;
    if (L > head) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(sx, sy); ctx.stroke(); }
    ctx.setLineDash([]);
    headPath();
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (opts.dash) ctx.setLineDash(opts.dash);
    if (L > head) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(sx, sy); ctx.stroke(); }
    ctx.setLineDash([]);
    headPath();
    ctx.fill();
    if (!opts.dash && L > head + 3) {
      const s = Math.sign(ny || 1), o = width * 0.2;
      ctx.strokeStyle = alpha(shade(color, 0.55), D.dark ? 0.35 : 0.5);
      ctx.lineWidth = Math.max(0.8, width * 0.32);
      ctx.beginPath();
      ctx.moveTo(x0 + ux * width - nx * o * s, y0 + uy * width - ny * o * s);
      ctx.lineTo(bx - nx * o * s, by - ny * o * s);
      ctx.stroke();
    }
    ctx.restore();
    if (opts.label) {
      const px = opts.lx === undefined ? x1 + ux * 11 : x1 + opts.lx;
      const py = opts.ly === undefined ? y1 + uy * 11 : y1 + opts.ly;
      vecLabel(ctx, opts.label, opts.sub, px, py, color);
    }
  }

  // ---------- 立體物件 ----------
  const sprites = new Map();
  function dprOf(ctx) {
    const t = ctx.getTransform ? ctx.getTransform() : null;
    return t ? Math.max(1, Math.min(3, Math.hypot(t.a, t.b))) : Math.min(3, window.devicePixelRatio || 1);
  }
  /**
   * 立體球（粒子、點電荷、擺錘…）：亮點在左上、邊緣加深、右下反光、細外框、投影；深色模式加淡光暈。
   * 預先畫成小圖重複使用（每一幀呼叫也不耗效能）。opts：{ glow（0–1，光暈強度）, shadow（預設 true）, ring（外框色）}
   */
  function ball(ctx, x, y, r, color, opts) {
    opts = opts || {};
    const dpr = dprOf(ctx);
    const glow = opts.glow == null ? (D.dark ? 0.32 : 0) : opts.glow;
    const key = [color, r.toFixed(2), dpr.toFixed(2), glow, opts.shadow === false ? 0 : 1, opts.ring || '', D.ver].join('|');
    let sp = sprites.get(key);
    if (!sp) {
      const pad = Math.max(6, r * 0.9), S = (r + pad) * 2;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(S * dpr); cv.height = Math.ceil(S * dpr);
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      const cx = S / 2, cy = S / 2;
      if (glow > 0) {
        const gl = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + pad);
        gl.addColorStop(0, alpha(color, glow));
        gl.addColorStop(1, alpha(color, 0));
        g.fillStyle = gl;
        g.beginPath(); g.arc(cx, cy, r + pad, 0, Math.PI * 2); g.fill();
      }
      if (opts.shadow !== false) {
        g.save();
        g.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : alpha(D.c.text, 0.32);
        g.shadowBlur = Math.min(8, 3 + r * 0.4);
        g.shadowOffsetY = Math.min(3, 1 + r * 0.15);
        g.fillStyle = color;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.38, r * 0.08, cx, cy, r);
      gr.addColorStop(0, shade(color, 0.72));
      gr.addColorStop(0.35, shade(color, 0.18));
      gr.addColorStop(0.8, color);
      gr.addColorStop(1, shade(color, -0.38));
      g.fillStyle = gr;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      if (r >= 4) {
        g.strokeStyle = alpha(shade(color, 0.6), 0.55);
        g.lineWidth = Math.min(1.2, r * 0.12);
        g.beginPath(); g.arc(cx, cy, r - g.lineWidth, Math.PI * 0.05, Math.PI * 0.7); g.stroke();
      }
      g.strokeStyle = opts.ring || alpha(D.c.surface, D.dark ? 0.55 : 0.9);
      g.lineWidth = r >= 5 ? 1.2 : 0.8;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      sp = { cv: cv, S: S };
      if (sprites.size > 300) sprites.clear();
      sprites.set(key, sp);
    }
    ctx.drawImage(sp.cv, x - sp.S / 2, y - sp.S / 2, sp.S, sp.S);
  }
  /**
   * 接觸陰影（地面上的柔和橢圓）。rx：物體半寬；lift：離地程度 0（貼地）～1（很高），越高越淡越大。
   */
  function contactShadow(ctx, x, surfaceY, rx, lift) {
    const u = Math.max(0, Math.min(1, lift || 0));
    const a = (D.dark ? 0.5 : 0.26) * (1 - 0.85 * u);
    if (a < 0.01) return;
    const RX = rx * (1.05 + 1.4 * u), RY = Math.max(2, rx * 0.18) * (1 + 0.6 * u);
    ctx.save();
    ctx.translate(x, surfaceY);
    ctx.scale(1, RY / RX);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, RX);
    g.addColorStop(0, shadowInk(a));
    g.addColorStop(1, shadowInk(0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, RX, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  /**
   * 立體方塊（車子、木塊、板子）：上亮下暗漸層、頂邊 1 px 高光、底邊暗線、圓角、輕微投影。
   * opts：{ r（圓角，預設 5）, shadow（預設 true）, stroke（外框色）}
   */
  function block(ctx, x, y, w, h, color, opts) {
    opts = opts || {};
    const r = opts.r == null ? Math.min(6, Math.min(w, h) * 0.2) : opts.r;
    ctx.save();
    if (opts.shadow !== false) {
      ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(D.c.text, 0.22);
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
    }
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(color, 0.16));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.14));
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.fillStyle = alpha(shade(color, 0.7), 0.55);
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = alpha(shade(color, -0.45), 0.5);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.restore();
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
    ctx.strokeStyle = opts.stroke || alpha(shade(color, -0.35), 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  /**
   * 管狀線條（軌道、繩子、導線、彈簧）：底層較粗較暗、上層較細較亮且略偏上，看起來有圓柱感。
   * path：會呼叫 path(ctx) 建立路徑（beginPath 由這裡做）。
   */
  function tube(ctx, path, color, width) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath(); path(ctx);
    ctx.strokeStyle = shade(color, -0.3);
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.translate(0, -width * 0.18);
    ctx.beginPath(); path(ctx);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * 0.62;
    ctx.stroke();
    ctx.beginPath(); path(ctx);
    ctx.strokeStyle = alpha(shade(color, 0.6), D.dark ? 0.35 : 0.55);
    ctx.lineWidth = Math.max(0.6, width * 0.2);
    ctx.translate(0, -width * 0.1);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 背景 ----------
  /** 畫布背景：--canvas-bg 加極淡的暈影（中心亮、四角暗）。 */
  function backdrop(ctx, w, h) {
    ctx.fillStyle = D.c['canvas-bg'];
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, D.dark ? 'rgba(0,0,0,0.22)' : alpha(D.c.text, 0.05));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  /**
   * 兩級格線：主格線（透明度約 0.10）與次格線（約 0.04）。
   * x0..x1、y0..y1 為格線範圍（CSS px）；major、minor 為間距（CSS px）；ox、oy 為對齊的原點。
   */
  function grid(ctx, x0, y0, x1, y1, major, minor, ox, oy) {
    const dpr = dprOf(ctx);
    const snap = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    ox = ox == null ? x0 : ox; oy = oy == null ? y0 : oy;
    const lines = function (step, a) {
      if (!(step > 2)) return;
      ctx.beginPath();
      for (let x = ox + Math.ceil((x0 - ox) / step) * step; x <= x1 + 0.01; x += step) { const s = snap(x); ctx.moveTo(s, y0); ctx.lineTo(s, y1); }
      for (let y = oy + Math.ceil((y0 - oy) / step) * step; y <= y1 + 0.01; y += step) { const s = snap(y); ctx.moveTo(x0, s); ctx.lineTo(x1, s); }
      ctx.strokeStyle = alpha(D.c.text, a);
      ctx.lineWidth = 1 / dpr;
      ctx.stroke();
    };
    if (minor) lines(minor, D.dark ? 0.05 : 0.04);
    lines(major, D.dark ? 0.11 : 0.1);
  }
  /** 事件閃光（碰撞、觸發）：在 (x, y) 畫一圈向外淡出的波紋。u：0 → 1 為經過時間比例。 */
  function ripple(ctx, x, y, r0, u, color) {
    if (u < 0 || u > 1) return;
    ctx.save();
    ctx.strokeStyle = alpha(color, 0.55 * (1 - u));
    ctx.lineWidth = 2 * (1 - u) + 0.5;
    ctx.beginPath(); ctx.arc(x, y, r0 * (1 + 1.8 * u), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(mq && mq.matches); }

  Object.assign(D, {
    rgb: rgb, alpha: alpha, shade: shade, mix: mix, shadowInk: shadowInk, refresh: refresh,
    roundRect: roundRect, textHeight: textHeight, haloText: haloText, pill: pill, vecLabel: vecLabel, supText: supText,
    arrow: arrow, ball: ball, contactShadow: contactShadow, block: block, tube: tube,
    backdrop: backdrop, grid: grid, ripple: ripple, reducedMotion: reducedMotion
  });
  window.LabDraw = D;
  refresh();
  window.addEventListener('lab:themechange', refresh);
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = function () { refresh(); };
    if (dm.addEventListener) dm.addEventListener('change', onScheme); else if (dm.addListener) dm.addListener(onScheme);
  }
})();
