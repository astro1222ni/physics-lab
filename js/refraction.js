/* refraction.js — 「折射與全反射」模組的畫面與互動（物理計算在 refraction-core.js） */
(function () {
  'use strict';
  const RC = window.RefractionCore;
  const LD = window.LabDraw; // 共用繪圖工具（drawkit.js）：背景、格線、立體球、陰影色（純裝飾，不改任何物理量）
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const DEG = Math.PI / 180;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let kbMain = null, kbChart = null; // 鍵盤操作（keys.js），在檔案後段建立
  const state = {
    mode: 'ray',          // ray | wave | fibre
    n1: 1.00, n2: 1.50,   // 上方（入射）與下方介質
    th1: 40 * DEG,        // 入射角（rad）
    side: -1,             // 雷射在法線左側（−1）或右側（+1）
    nm: 532,              // 雷射真空波長（nm）
    nCore: 1.50, nClad: 1.33,
    thIn: 35 * DEG,       // 光纖端面射入角（rad，相對於光纖軸）
    inSide: 1,            // +1：光先往上界面走
    showArcs: true, showProt: true, showMarks: true, showSP: false,
    anim: !reducedMotion, // 波前與光纖的動畫（減少動態效果時預設暫停）
    tau: 0,               // 波前相位（週期數）
    pulse: 0,             // 光纖脈衝的時間（s）
    hover: false
  };

  // ---------- 顏色 ----------
  const colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--pos', '--neg', '--field', '--equi', '--grid', '--probe', '--surface', '--b-optics']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function tokenRGB(name) {
    const v = (colors[name] || '').trim();
    let m = v.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
      let h = m[1];
      if (h.length < 6) h = h.split('').map(function (c) { return c + c; }).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = v.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(',').slice(0, 3).map(function (x) { return parseFloat(x); });
    return [128, 128, 128];
  }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function isDark() { const c = tokenRGB('canvas-bg'); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 110; }
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

  /** 雷射顏色：淺色背景時光束核心稍微加深，確保對比 */
  function laser() {
    const rgb = RC.wavelengthToRGB(state.nm);
    const dark = isDark();
    return { rgb: rgb, core: dark ? rgb : mix(rgb, [20, 24, 30], state.nm < 450 ? 0.1 : 0.28), hot: mix(rgb, WHITE, 0.65), dark: dark };
  }

  // ---------- 數字格式 ----------
  function trim(v, dec, minDec) {
    let s = v.toFixed(dec);
    if (dec > minDec) s = s.replace(new RegExp('(\\.\\d{' + minDec + '}\\d*?)0+$'), '$1').replace(/\.$/, '');
    return s.replace('-', '−');
  }
  const fmtN = function (n) { return trim(n, 3, 2); };
  const fmtA = function (rad) { return trim(rad / DEG, 2, 1) + '°'; };
  const fmtA2 = function (rad) { return (rad / DEG).toFixed(2) + '°'; };
  function fmtPct(x) {
    const p = x * 100;
    if (p >= 99.995 && x < 1) return '99.99%';
    if (p > 0 && p < 0.01) return '< 0.01%';
    return (p >= 10 ? p.toFixed(1) : p.toFixed(2)) + '%';
  }
  function fmtSpeedHTML(n) {
    const v = RC.speed(n) / 1e8;
    return v.toFixed(2) + ' × 10<sup>8</sup> m/s';
  }
  function mediumName(n, fibreCore) {
    const near = function (x) { return Math.abs(n - x) < 1e-9; };
    if (fibreCore && near(1.48)) return T('纖芯', 'Core');
    for (let i = 0; i < RC.MEDIA.length; i++) if (near(RC.MEDIA[i].n)) return T(RC.MEDIA[i].zh, RC.MEDIA[i].en);
    if (near(1.46)) return T('包層玻璃', 'Cladding glass');
    return T('自訂介質', 'Custom');
  }

  // ---------- 畫布 ----------
  function makeCanvas(id) { const cv = $(id); return { cv: cv, ctx: cv.getContext('2d'), w: 0, h: 0, dpr: 1 }; }
  const main = makeCanvas('cv');
  const chart = makeCanvas('chart');
  function sizeCanvas(o) {
    o.dpr = Math.min(3, window.devicePixelRatio || 1);
    o.w = o.cv.clientWidth;
    o.h = o.cv.clientHeight;
    o.cv.width = Math.max(1, Math.round(o.w * o.dpr));
    o.cv.height = Math.max(1, Math.round(o.h * o.dpr));
  }
  function begin(o) {
    const ctx = o.ctx;
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    ctx.clearRect(0, 0, o.w, o.h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  // ---------- 文字標籤（含下標／上標，一律有半透明底框） ----------
  // parts：字串或 [文字, 'sub' | 'sup']
  const FONT = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif';
  const FONT_SMALL = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
  function norm(parts) { return (Array.isArray(parts) ? parts : [parts]).map(function (p) { return typeof p === 'string' ? [p, ''] : p; }); }
  function measureParts(ctx, parts) {
    let w = 0;
    norm(parts).forEach(function (p) { ctx.font = p[1] ? FONT_SMALL : FONT; w += ctx.measureText(p[0]).width; });
    ctx.font = FONT;
    return w;
  }
  function fontPx(ctx) { const m = ctx.font.match(/(\d+(?:\.\d+)?)px/); return m ? +m[1] : 13; }
  /** 在 (x, y) 畫一個圓角底框標籤；align = 'left' | 'center' | 'right'。回傳外框 {x, y, w, h} */
  function pill(ctx, parts, x, y, opt) {
    opt = opt || {};
    ctx.font = FONT;
    const fs = fontPx(ctx);
    const padX = 6, h = Math.round(fs + 9);
    const w = measureParts(ctx, parts) + padX * 2;
    let bx = opt.align === 'right' ? x - w : opt.align === 'left' ? x : x - w / 2;
    if (opt.clamp !== false) bx = Math.max(4, Math.min(main.w - w - 4, bx));
    const by = y - h / 2;
    if (!opt.plain) {
      // 與 LabDraw.pill 同一種底框：畫布底色半透明＋語意色細框
      roundRect(ctx, bx, by, w, h, h / 2);
      ctx.fillStyle = opt.bg || LD.alpha(colors['canvas-bg'], LD.dark ? 0.86 : 0.9);
      ctx.fill();
      ctx.strokeStyle = opt.stroke || LD.alpha(opt.color || colors.muted, LD.dark ? 0.45 : 0.35);
      ctx.lineWidth = 1;
      roundRect(ctx, bx + 0.5, by + 0.5, w - 1, h - 1, h / 2 - 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = opt.color || colors.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let cx = bx + padX;
    norm(parts).forEach(function (p) {
      ctx.font = p[1] ? FONT_SMALL : FONT;
      const dy = p[1] === 'sub' ? fs * 0.28 : p[1] === 'sup' ? -fs * 0.32 : 0;
      ctx.fillText(p[0], cx, y + dy + 0.5);
      cx += ctx.measureText(p[0]).width;
    });
    ctx.font = FONT;
    return { x: bx, y: by, w: w, h: h };
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- 幾何 ----------
  /** 由點 (x, y) 沿單位向量 (ux, uy) 到畫布邊緣的距離 */
  function toEdge(x, y, ux, uy, W, H) {
    let t = Infinity;
    if (ux > 1e-9) t = Math.min(t, (W - x) / ux);
    if (ux < -1e-9) t = Math.min(t, -x / ux);
    if (uy > 1e-9) t = Math.min(t, (H - y) / uy);
    if (uy < -1e-9) t = Math.min(t, -y / uy);
    return Math.max(0, t);
  }
  function rayGeom() {
    const W = main.w, H = main.h;
    const cy = Math.round(H * 0.5), ox = W / 2;
    const m = Math.min(W, H);
    const f = RC.fresnel(state.n1, state.n2, state.th1);
    const s1 = Math.sin(state.th1), c1 = Math.cos(state.th1);
    const sd = state.side;
    const uIn = [-sd * s1, c1];        // 入射光前進方向（畫面座標，y 向下）
    const uRe = [-sd * s1, -c1];       // 反射光
    let uTr = null;
    if (!f.tir) uTr = [-sd * Math.sin(f.theta2), Math.cos(f.theta2)];
    const srcR = Math.min(H * 0.5 - 22, W * 0.5 - 34) * 0.92;
    return {
      W: W, H: H, cy: cy, ox: ox, m: m, f: f, uIn: uIn, uRe: uRe, uTr: uTr,
      srcR: srcR, sx: ox - uIn[0] * srcR, sy: cy - uIn[1] * srcR,
      thc: RC.criticalAngle(state.n1, state.n2), thb: RC.brewsterAngle(state.n1, state.n2)
    };
  }

  // ---------- 背景：兩種介質 ----------
  function tintAlpha(n, dark) {
    const t = Math.max(0, Math.min(1, (n - 1) / 1.5));
    return (dark ? 0.30 : 0.22) * Math.pow(t, 0.75);
  }
  /** 介質的材質（純裝飾）：預設的水、玻璃、鑽石各有質感；自訂折射率當成一般透明固體 */
  function mediumKind(n) {
    const near = function (x) { return Math.abs(n - x) < 1e-9; };
    if (n < 1.0005) return 'air';
    if (near(1.33)) return 'water';
    if (near(2.42)) return 'diamond';
    return 'glass';
  }
  /** 介質的色調：由 --neg（玻璃）往 --accent 偏一點（水），全部由色彩代號混合而來 */
  function mediumTint(kind) {
    return kind === 'water' ? LD.mix(colors.neg, colors.accent, 0.38) : kind === 'diamond' ? LD.mix(colors.neg, colors.surface, 0.12) : LD.mix(colors.neg, colors.accent, 0.12);
  }
  /**
   * 一塊介質（edge：界面在這塊的 'top' 或 'bottom'）：顏色深淺隨折射率增加，
   * 靠近界面較亮、越深越暗；水有柔和的水紋、玻璃與鑽石有斜向的反光帶，看起來像一塊透明材料。
   */
  function fillMedium(ctx, x, y, w, h, n, dark, edge, plain) {
    const a = tintAlpha(n, dark);
    if (a <= 0.001 || w <= 0 || h <= 0) return;
    const kind = mediumKind(n);
    const tint = mediumTint(kind);
    const iy = edge === 'top' ? y : y + h, fy = edge === 'top' ? y + h : y, s = edge === 'top' ? 1 : -1;
    const g = ctx.createLinearGradient(0, iy, 0, fy);
    g.addColorStop(0, LD.alpha(LD.shade(tint, 0.12), a * 0.78));
    g.addColorStop(0.35, LD.alpha(tint, a));
    g.addColorStop(1, LD.alpha(LD.shade(tint, -0.22), a * 1.3));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    if (plain) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const hi = 'rgba(255,255,255,';
    if (kind === 'water') {
      // 水紋：與水面平行的柔和波浪亮線，越深越淡、越疏
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        const d = 9 + i * (10 + i * 5), yy = iy + s * d;
        if ((yy - y) * (yy - (y + h)) > 0) break;
        const amp = 1.6 + i * 0.5, lam = 70 + i * 22, ph = i * 1.7;
        ctx.strokeStyle = hi + ((dark ? 0.07 : 0.42) * (1 - i / 7)).toFixed(3) + ')';
        ctx.beginPath();
        for (let xx = x - 4; xx <= x + w + 4; xx += 6) {
          const yv = yy + amp * Math.sin(xx / lam * 2 * Math.PI + ph) + 0.6 * amp * Math.sin(xx / (lam * 0.37) + ph * 2.3);
          if (xx === x - 4) ctx.moveTo(xx, yv); else ctx.lineTo(xx, yv);
        }
        ctx.stroke();
      }
    } else if (kind !== 'air') {
      // 玻璃、鑽石：兩條斜向的柔和反光帶
      const band = function (cx, bw, al) {
        ctx.save();
        ctx.translate(cx, (y + y + h) / 2);
        ctx.rotate(-0.62);
        const L = Math.hypot(w, h);
        const gr = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
        gr.addColorStop(0, hi + '0)');
        gr.addColorStop(0.5, hi + al.toFixed(3) + ')');
        gr.addColorStop(1, hi + '0)');
        ctx.fillStyle = gr;
        ctx.fillRect(-bw / 2, -L, bw, 2 * L);
        ctx.restore();
      };
      const k = kind === 'diamond' ? 1.35 : 1;
      band(x + w * 0.22, Math.max(40, w * 0.16), (dark ? 0.045 : 0.34) * k);
      band(x + w * 0.32, Math.max(10, w * 0.035), (dark ? 0.05 : 0.38) * k);
      band(x + w * 0.78, Math.max(30, w * 0.1), (dark ? 0.03 : 0.22) * k);
      if (kind === 'diamond') {
        // 鑽石：淡淡的切割刻面線
        ctx.strokeStyle = hi + (dark ? 0.06 : 0.45) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const step = Math.max(60, w / 6);
        for (let xx = x - step; xx < x + w + step; xx += step) {
          ctx.moveTo(xx, iy); ctx.lineTo(xx + step / 2, fy); ctx.lineTo(xx + step, iy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  /** 界面：光密一側有一道亮的表面反光，光疏一側有很淡的陰影，再加一條清楚的界面線 */
  function interfaceLine(ctx, x0, x1, y, dark, n1, n2) {
    const same = Math.abs(n1 - n2) < 1e-9;
    const s = n2 >= n1 ? 1 : -1; // 光密的一側：+1 在下方
    if (!same) {
      const gl = ctx.createLinearGradient(0, y, 0, y + s * 16);
      gl.addColorStop(0, dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.7)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x0, Math.min(y, y + s * 16), x1 - x0, 16);
      const sh = ctx.createLinearGradient(0, y, 0, y - s * 9);
      sh.addColorStop(0, LD.shadowInk(dark ? 0.3 : 0.07));
      sh.addColorStop(1, LD.shadowInk(0));
      ctx.fillStyle = sh;
      ctx.fillRect(x0, Math.min(y, y - s * 9), x1 - x0, 9);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = LD.alpha(colors.field, same ? 0.18 : dark ? 0.5 : 0.38);
    ctx.beginPath(); ctx.moveTo(x0, y + 0.5 * s); ctx.lineTo(x1, y + 0.5 * s); ctx.stroke();
    if (!same) {
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.moveTo(x0, y + 1.5 * s); ctx.lineTo(x1, y + 1.5 * s); ctx.stroke();
    }
  }
  /** 不變的圖層（背景、介質、格線、界面、量角器）畫在離屏畫布，只在參數、尺寸或主題改變時重畫 */
  const layer = { cv: document.createElement('canvas'), key: '' };
  function staticLayer(o, key, paint) {
    const full = key + '|' + o.w + 'x' + o.h + '@' + o.dpr + '|' + LD.ver;
    if (layer.key !== full) {
      layer.cv.width = Math.max(1, Math.round(o.w * o.dpr));
      layer.cv.height = Math.max(1, Math.round(o.h * o.dpr));
      const c = layer.cv.getContext('2d');
      c.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
      c.clearRect(0, 0, o.w, o.h);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      paint(c);
      layer.key = full;
    }
    return layer.cv;
  }
  function gridStep(m) { return Math.max(36, Math.round(m / 8)); }
  function gridMinor(st) { return st >= 56 ? st / 4 : st / 2; }

  // ---------- 光束 ----------
  /** 畫一段光束；I = 相對光強 0–1。亮度與粗細 ∝ √I（標示的百分比為精確值） */
  function beam(ctx, x0, y0, x1, y1, I, L, opt) {
    opt = opt || {};
    const v = Math.sqrt(Math.max(0, Math.min(1, I)));
    if (v < 0.004) return;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.5) return;
    ctx.save();
    if (L.dark) ctx.globalCompositeOperation = 'lighter';
    const glow = [[16, L.dark ? 0.10 : 0.07], [7, L.dark ? 0.20 : 0.13]];
    glow.forEach(function (gw) {
      ctx.strokeStyle = rgba(L.rgb, gw[1] * v);
      ctx.lineWidth = gw[0] * (0.55 + 0.45 * v);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    });
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = rgba(L.core, 0.25 + 0.75 * v);
    ctx.lineWidth = 1 + 2 * v;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (L.dark) {
      ctx.strokeStyle = rgba(L.hot, 0.85 * v);
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    if (opt.arrow !== false && len > 40) {
      const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      const t = opt.arrowAt != null ? opt.arrowAt : 0.55;
      const ax = x0 + ux * len * t, ay = y0 + uy * len * t;
      // 方向箭頭：略帶弧度的三角形＋背景色描邊，在光暈上也看得清楚
      const s = 4.6 + 3.4 * v;
      ctx.beginPath();
      ctx.moveTo(ax + ux * s * 1.5, ay + uy * s * 1.5);
      ctx.quadraticCurveTo(ax - ux * s * 0.2, ay - uy * s * 0.2, ax - ux * s + uy * s, ay - uy * s - ux * s);
      ctx.lineTo(ax - ux * s * 0.45, ay - uy * s * 0.45);
      ctx.lineTo(ax - ux * s - uy * s, ay - uy * s + ux * s);
      ctx.quadraticCurveTo(ax - ux * s * 0.2, ay - uy * s * 0.2, ax + ux * s * 1.5, ay + uy * s * 1.5);
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = LD.alpha(colors['canvas-bg'], (L.dark ? 0.55 : 0.85) * (0.4 + 0.6 * v));
      ctx.stroke();
      ctx.fillStyle = rgba(L.dark ? mix(L.rgb, WHITE, 0.35) : L.core, 0.35 + 0.65 * v);
      ctx.fill();
    }
    ctx.restore();
  }
  /** 光照到界面的亮點（裝飾，不影響物理） */
  function hotSpot(ctx, x, y, L, I) {
    const r = 10 + 8 * Math.sqrt(I);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(L.dark ? L.hot : L.rgb, L.dark ? 0.85 : 0.55));
    g.addColorStop(0.35, rgba(L.rgb, L.dark ? 0.35 : 0.22));
    g.addColorStop(1, rgba(L.rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
  }

  /**
   * 雷射筆：金屬圓筒（橫向漸層＝圓柱感）、止滑環、鍍鉻前環、發光的出光口，指向 (ux, uy)；
   * (x, y) 是出光口（光線的起點，位置不變）。hover：滑鼠移到上面或正在拖曳；focus：鍵盤選取中（畫焦點框）。
   */
  function laserDevice(ctx, x, y, ux, uy, L, hover, focus) {
    const ang = Math.atan2(uy, ux);
    const dark = L.dark;
    ctx.save();
    ctx.translate(x, y);
    if (hover) {
      const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 38);
      g.addColorStop(0, LD.alpha(colors.accent, 0.32));
      g.addColorStop(1, LD.alpha(colors.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 38, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.rotate(ang);
    const k = hover ? 1.08 : 1;
    ctx.scale(k, k);
    const small = ctx.canvas.clientWidth < 560; // 手機上縮短機身，不要伸出畫布左緣
    const len = small ? 42 : 54, hw = small ? 7.5 : 8.5, front = small ? 8 : 9;
    const metal = dark ? LD.shade(colors.field, -0.42) : LD.mix(colors.field, colors.muted, 0.35);
    // 投影（陰影位移在畫面座標，不受旋轉影響）
    ctx.save();
    ctx.shadowColor = dark ? 'rgba(0,0,0,0.6)' : LD.alpha(colors.text, 0.32);
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = metal;
    roundRect(ctx, -len, -hw, len - front + 1, hw * 2, hw * 0.85);
    ctx.fill();
    ctx.restore();
    // 筒身：上亮下暗＋上方一道反光
    const body = ctx.createLinearGradient(0, -hw, 0, hw);
    body.addColorStop(0, LD.shade(metal, 0.55));
    body.addColorStop(0.22, LD.shade(metal, 0.22));
    body.addColorStop(0.6, metal);
    body.addColorStop(1, LD.shade(metal, -0.45));
    ctx.fillStyle = body;
    roundRect(ctx, -len, -hw, len - front + 1, hw * 2, hw * 0.85);
    ctx.fill();
    // 止滑環（尾端）
    ctx.strokeStyle = LD.alpha(LD.shade(metal, -0.5), 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const xx = -len + 7 + i * 3.2; ctx.moveTo(xx, -hw + 1.5); ctx.lineTo(xx, hw - 1.5); }
    ctx.stroke();
    // 開關（雷射顏色）
    ctx.fillStyle = rgba(L.rgb, 0.9);
    roundRect(ctx, -32, -hw - 1.6, 10, 3.4, 1.7);
    ctx.fill();
    // 鍍鉻前環
    const ring = ctx.createLinearGradient(0, -hw, 0, hw);
    ring.addColorStop(0, '#f6f9fa');
    ring.addColorStop(0.35, '#c9d2d6');
    ring.addColorStop(0.7, '#8d989e');
    ring.addColorStop(1, '#dfe5e8');
    ctx.fillStyle = ring;
    roundRect(ctx, -front, -hw + 0.8, front, hw * 2 - 1.6, 2.5);
    ctx.fill();
    ctx.strokeStyle = LD.alpha(LD.shade(metal, -0.5), 0.5);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // 筒身上方的細高光
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-len + 6, -hw + 2.4); ctx.lineTo(-front - 3, -hw + 2.4); ctx.stroke();
    // 出光口：雷射色的小光點
    const ap = ctx.createRadialGradient(0, 0, 0, 0, 0, 6);
    ap.addColorStop(0, rgba(L.hot, 1));
    ap.addColorStop(0.45, rgba(L.rgb, 0.85));
    ap.addColorStop(1, rgba(L.rgb, 0));
    ctx.fillStyle = ap;
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, 2 * Math.PI); ctx.fill();
    if (focus) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = LD.alpha(colors.accent, 0.95);
      ctx.lineWidth = 2 / k;
      roundRect(ctx, -len - 7, -hw - 7, len + 15, hw * 2 + 14, 9);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  /** 鍵盤焦點框（--accent 虛線圓角框） */
  function focusBox(ctx, x, y, w, h) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = LD.alpha(colors.accent, 0.95);
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 量角器、法線、角度弧 ----------
  function protractor(ctx, g) {
    const R = Math.min(g.m * 0.36, g.srcR - 30);
    if (R < 50) return;
    const c = tokenRGB('field');
    const dark = LD.dark;
    ctx.save();
    // 透明壓克力量角器：一圈淡淡的環帶，外緣亮、內緣細線
    const band = 12;
    const rg = ctx.createRadialGradient(g.ox, g.cy, R - band, g.ox, g.cy, R);
    rg.addColorStop(0, rgba(c, 0));
    rg.addColorStop(1, rgba(c, dark ? 0.09 : 0.07));
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(g.ox, g.cy, R, 0, 2 * Math.PI); ctx.arc(g.ox, g.cy, R - band, 0, 2 * Math.PI, true); ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(c, 0.22);
    ctx.beginPath(); ctx.arc(g.ox, g.cy, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(g.ox, g.cy, R - 1, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
    ctx.strokeStyle = rgba(c, 0.08);
    ctx.beginPath(); ctx.arc(g.ox, g.cy, R - band, 0, 2 * Math.PI); ctx.stroke();
    for (let d = 0; d < 360; d += 5) {
      const a = d * DEG;
      const major = d % 10 === 0;
      const r0 = R - (d % 30 === 0 ? 9 : major ? 6 : 3.5);
      ctx.strokeStyle = rgba(c, major ? 0.30 : 0.18);
      ctx.beginPath();
      ctx.moveTo(g.ox + Math.cos(a) * r0, g.cy + Math.sin(a) * r0);
      ctx.lineTo(g.ox + Math.cos(a) * R, g.cy + Math.sin(a) * R);
      ctx.stroke();
    }
    // 由法線量起的度數：30°、60°（四個象限）；手機上量角器小，數字會和角度標籤擠在一起，只留刻度
    if (R >= 125) [30, 60].forEach(function (d) {
      [[1, -1], [-1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        const a = d * DEG;
        const r = R - 21;
        LD.haloText(ctx, d + '°', g.ox + q[0] * Math.sin(a) * r, g.cy + q[1] * Math.cos(a) * r, LD.alpha(colors.muted, 0.95), 'center', 'middle', '11px ' + LD.FONT);
      });
    });
    ctx.restore();
  }
  function dashedLine(ctx, x0, y0, x1, y1, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1.2;
    ctx.setLineDash(dash || [6, 5]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }
  /** 角度弧：由角度 a0 掃到 a1（畫布角度，rad），扇形淡色填滿＋實線弧 */
  function angleArc(ctx, x, y, r, a0, a1, rgb) {
    const ccw = a1 < a0;
    ctx.save();
    ctx.fillStyle = rgba(rgb, 0.13);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0, a1, ccw); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(rgb, 0.95);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1, ccw); ctx.stroke();
    ctx.restore();
  }
  /** 角度標籤：放在角平分線外側；與法線的水平距離至少半個標籤寬，避免壓在法線上 */
  function angleLabel(ctx, g, parts, amid, r, color, side) {
    ctx.font = FONT;
    const w = measureParts(ctx, parts) + 12;
    let x = g.ox + Math.cos(amid) * r, y = g.cy + Math.sin(amid) * r;
    const minDx = w / 2 + 6;
    if (Math.abs(x - g.ox) < minDx) x = g.ox + side * minDx;
    const up = y < g.cy;
    if (Math.abs(y - g.cy) < 13) y = g.cy + (up ? -13 : 13);
    pill(ctx, parts, x, y, { color: color });
  }

  // ====================================================================
  // 光線模式與波前模式
  // ====================================================================
  /** 背景（暈影）＋上下兩種介質＋兩級格線（以入射點為原點）＋界面＋（光線模式）量角器：快取在離屏圖層 */
  function drawMedia(ctx, g, dark, prot) {
    const key = ['rw', state.n1, state.n2, prot ? 1 : 0, dark ? 1 : 0].join('|');
    ctx.drawImage(staticLayer(main, key, function (c) {
      LD.backdrop(c, g.W, g.H);
      fillMedium(c, 0, 0, g.W, g.cy, state.n1, dark, 'bottom');
      fillMedium(c, 0, g.cy, g.W, g.H - g.cy, state.n2, dark, 'top');
      const st = gridStep(g.m);
      LD.grid(c, 0, 0, g.W, g.H, st, gridMinor(st), g.ox, g.cy);
      interfaceLine(c, 0, g.W, g.cy, dark, state.n1, state.n2);
      if (prot) protractor(c, g);
    }), 0, 0, g.W, g.H);
  }
  function mediumLabels(ctx, g) {
    const lab = function (n, idx, y) {
      const name = mediumName(n);
      const parts = g.W < 560 ? [name + '  n', [String(idx), 'sub'], ' = ' + fmtN(n)]
        : [name + '  n', [String(idx), 'sub'], ' = ' + fmtN(n) + '   v = ' + (RC.speed(n) / 1e8).toFixed(2) + '×10', ['8', 'sup'], ' m/s'];
      return pill(ctx, parts, 8, y, { align: 'left', color: colors.text });
    };
    lab(state.n1, 1, 16);
    lab(state.n2, 2, g.H - 16);
  }

  function drawRayScene() {
    const ctx = begin(main);
    const g = rayGeom();
    const L = laser();
    const dark = L.dark;
    drawMedia(ctx, g, dark, state.showProt);
    // 法線
    dashedLine(ctx, g.ox, 4, g.ox, g.H - 4, rgba(tokenRGB('muted'), 0.75), 1.2, [6, 5]);
    // 臨界角（光密 → 光疏時）：以虛線標出兩側臨界入射方向
    const posRGB = tokenRGB('pos');
    if (state.showMarks && isFinite(g.thc)) {
      const Rr = Math.min(g.m * 0.42, g.srcR + 10);
      [-1, 1].forEach(function (s) {
        dashedLine(ctx, g.ox, g.cy, g.ox + s * Math.sin(g.thc) * Rr, g.cy - Math.cos(g.thc) * Rr, rgba(posRGB, 0.75), 1.3, [3, 4]);
      });
    }
    const f = g.f;
    const eRe = toEdge(g.ox, g.cy, g.uRe[0], g.uRe[1], g.W, g.H);
    // 光束：先畫反射與折射，最後畫入射光（壓在最上面）
    beam(ctx, g.ox, g.cy, g.ox + g.uRe[0] * eRe, g.cy + g.uRe[1] * eRe, f.R, L, { arrowAt: 0.5 });
    let eTr = 0;
    if (g.uTr) {
      eTr = toEdge(g.ox, g.cy, g.uTr[0], g.uTr[1], g.W, g.H);
      beam(ctx, g.ox, g.cy, g.ox + g.uTr[0] * eTr, g.cy + g.uTr[1] * eTr, f.T, L, { arrowAt: 0.5 });
    }
    beam(ctx, g.sx, g.sy, g.ox, g.cy, 1, L, { arrowAt: 0.5 });
    hotSpot(ctx, g.ox, g.cy, L, 1);

    if (state.showArcs) drawArcs(ctx, g, f);
    if (state.showMarks && isFinite(g.thc)) {
      // 臨界角的數值放在右上角（虛線已標出方向），避免與光線標籤擠在一起
      pill(ctx, [T('臨界角 ', 'Critical ') + 'θ', ['c', 'sub'], ' = ' + fmtA2(g.thc)], g.W - 8, 16, { align: 'right', color: colors.pos, stroke: rgba(posRGB, 0.45) });
    }
    // R、T 標示
    const pctPill = function (txt, x, y, color) { pill(ctx, txt, x, y, { color: color }); };
    const dR = Math.min(eRe * (g.W < 560 ? 0.6 : 0.78), g.m * 0.47);
    if (f.tir) {
      pctPill(g.W < 560 ? T('全反射 R = 100%', 'TIR  R = 100%') : T('全反射  R = 100%', 'Total internal reflection  R = 100%'), g.ox + g.uRe[0] * dR, g.cy + g.uRe[1] * dR - 4, colors.pos);
      pill(ctx, T('沒有折射光', 'No refracted ray'), g.ox - state.side * Math.min(g.W * 0.25, 120), g.cy + 22, { color: colors.muted });
    } else {
      pctPill(T('反射 R = ', 'Reflected R = ') + fmtPct(f.R), g.ox + g.uRe[0] * dR, g.cy + g.uRe[1] * dR - 4, colors.pos);
      const dT = Math.min(eTr * 0.72, g.m * 0.42);
      pctPill(T('折射 T = ', 'Refracted T = ') + fmtPct(f.T), g.ox + g.uTr[0] * dT, g.cy + g.uTr[1] * dT + 4, colors.neg);
    }
    mediumLabels(ctx, g);
    pill(ctx, T('法線', 'Normal'), g.ox + 6, g.H - 16, { align: 'left', color: colors.muted });
    laserDevice(ctx, g.sx, g.sy, g.uIn[0], g.uIn[1], L, state.hover || dragging, kbMain && kbMain.focused());
  }

  function drawArcs(ctx, g, f) {
    const r1 = Math.max(26, g.m * 0.12);
    const eq = tokenRGB('equi'), ac = tokenRGB('accent');
    const up = -Math.PI / 2, down = Math.PI / 2;
    if (state.th1 > 0.2 * DEG) {
      const aIn = Math.atan2(-g.uIn[1], -g.uIn[0]); // 指向雷射
      const aRe = Math.atan2(g.uRe[1], g.uRe[0]);
      angleArc(ctx, g.ox, g.cy, r1, up, aIn, eq);
      angleArc(ctx, g.ox, g.cy, r1, up, aRe, eq);
      const lr = r1 + 20;
      angleLabel(ctx, g, ['θ', ['1', 'sub'], ' ' + fmtA2(state.th1)], (up + aIn) / 2, lr, colors.equi, state.side);
      angleLabel(ctx, g, ['θ', ['1', 'sub'], '′ ' + fmtA2(state.th1)], (up + aRe) / 2, lr, colors.equi, -state.side);
    }
    if (g.uTr && f.theta2 > 0.2 * DEG) {
      const aTr = Math.atan2(g.uTr[1], g.uTr[0]);
      const r2 = r1 * 1.15;
      angleArc(ctx, g.ox, g.cy, r2, down, aTr, ac);
      angleLabel(ctx, g, ['θ', ['2', 'sub'], ' ' + fmtA2(f.theta2)], (down + aTr) / 2, r2 + 20, colors.accent, -state.side);
    }
  }

  // ---------- 波前模式 ----------
  /**
   * 一道光束的波前：寬 w 的帶狀區域（中心線過 O、方向 u），只畫在 half（'top' | 'bottom'）那一側。
   * 波峰位置 s = (k + τ)λ（s 由 O 沿 u 量起）：各光束在 O 點同時有波峰，所以界面上的波峰連續。
   */
  function waveBand(ctx, g, u, w, lam, I, half, sMin, sMax, L) {
    const v = Math.sqrt(Math.max(0, I));
    if (v < 0.01) return;
    const p = [-u[1], u[0]];
    ctx.save();
    ctx.beginPath();
    if (half === 'top') ctx.rect(0, 0, g.W, g.cy); else ctx.rect(0, g.cy, g.W, g.H - g.cy);
    ctx.clip();
    const hw = w / 2;
    const corner = function (s, q) { return [g.ox + u[0] * s + p[0] * q, g.cy + u[1] * s + p[1] * q]; };
    const c1 = corner(sMin, -hw), c2 = corner(sMax, -hw), c3 = corner(sMax, hw), c4 = corner(sMin, hw);
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.lineTo(c4[0], c4[1]);
    ctx.closePath();
    ctx.clip();
    // 帶狀光束：橫向高斯狀的漸層（中央亮、兩側淡）
    const gx0 = g.ox - p[0] * hw, gy0 = g.cy - p[1] * hw, gx1 = g.ox + p[0] * hw, gy1 = g.cy + p[1] * hw;
    const band = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    const a = (L.dark ? 0.16 : 0.10) * v;
    band.addColorStop(0, rgba(L.rgb, 0));
    band.addColorStop(0.25, rgba(L.rgb, a * 0.6));
    band.addColorStop(0.5, rgba(L.rgb, a));
    band.addColorStop(0.75, rgba(L.rgb, a * 0.6));
    band.addColorStop(1, rgba(L.rgb, 0));
    ctx.fillStyle = band;
    const xs = [c1[0], c2[0], c3[0], c4[0]], ys = [c1[1], c2[1], c3[1], c4[1]];
    const bx0 = Math.max(0, Math.min.apply(null, xs)), by0 = Math.max(0, Math.min.apply(null, ys));
    ctx.fillRect(bx0, by0, Math.min(g.W, Math.max.apply(null, xs)) - bx0, Math.min(g.H, Math.max.apply(null, ys)) - by0);
    const crest = function (alpha, col) {
      const gr = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      gr.addColorStop(0, rgba(col, 0));
      gr.addColorStop(0.18, rgba(col, alpha * 0.55));
      gr.addColorStop(0.5, rgba(col, alpha));
      gr.addColorStop(0.82, rgba(col, alpha * 0.55));
      gr.addColorStop(1, rgba(col, 0));
      return gr;
    };
    const frac = state.tau - Math.floor(state.tau);
    const k0 = Math.floor(sMin / lam - frac) - 1, k1 = Math.ceil(sMax / lam - frac) + 1;
    const soft = crest((L.dark ? 0.30 : 0.26) * v, L.rgb);
    const sharp = crest((L.dark ? 0.95 : 0.9) * v, L.dark ? L.hot : L.core);
    if (L.dark) ctx.globalCompositeOperation = 'lighter';
    [[soft, Math.max(2, lam * 0.32)], [sharp, 1.4]].forEach(function (pass) {
      ctx.strokeStyle = pass[0];
      ctx.lineWidth = pass[1] + (L.dark ? 0 : 0.3);
      ctx.beginPath();
      for (let k = k0; k <= k1; k++) {
        const s = (k + frac) * lam;
        const cx = g.ox + u[0] * s, cy = g.cy + u[1] * s;
        ctx.moveTo(cx - p[0] * hw, cy - p[1] * hw);
        ctx.lineTo(cx + p[0] * hw, cy + p[1] * hw);
      }
      ctx.stroke();
    });
    ctx.restore();
  }
  /** 標出一個波長的長度（與光束平行、在光束旁邊） */
  function lambdaBracket(ctx, g, u, w, s0, lam, parts, color, flip) {
    const p = [-u[1], u[0]];
    const off = (w / 2 + 9) * (flip ? -1 : 1);
    const ax = g.ox + u[0] * s0 + p[0] * off, ay = g.cy + u[1] * s0 + p[1] * off;
    const bx = ax + u[0] * lam, by = ay + u[1] * lam;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.moveTo(ax - p[0] * 4, ay - p[1] * 4); ctx.lineTo(ax + p[0] * 4, ay + p[1] * 4);
    ctx.moveTo(bx - p[0] * 4, by - p[1] * 4); ctx.lineTo(bx + p[0] * 4, by + p[1] * 4);
    ctx.stroke();
    ctx.restore();
    const lo = off + (flip ? -1 : 1) * 14;
    const mx = g.ox + u[0] * (s0 + lam / 2) + p[0] * lo, my = g.cy + u[1] * (s0 + lam / 2) + p[1] * lo;
    pill(ctx, parts, mx, my, { color: color });
  }
  function waveScale(g) { return Math.max(16, Math.min(40, g.m * 0.085)); }

  function drawWaveScene() {
    const ctx = begin(main);
    const g = rayGeom();
    const L = laser();
    drawMedia(ctx, g, L.dark, false);
    dashedLine(ctx, g.ox, 4, g.ox, g.H - 4, rgba(tokenRGB('muted'), 0.6), 1.1, [6, 5]);
    const f = g.f;
    const lam0 = waveScale(g);
    const lam1 = lam0 / state.n1, lam2 = lam0 / state.n2;
    const w = Math.max(46, Math.min(130, g.m * 0.24));
    const eIn = toEdge(g.ox, g.cy, -g.uIn[0], -g.uIn[1], g.W, g.H) + w;
    const eRe = toEdge(g.ox, g.cy, g.uRe[0], g.uRe[1], g.W, g.H) + w;
    waveBand(ctx, g, g.uRe, w, lam1, f.R, 'top', -w, eRe, L);
    waveBand(ctx, g, g.uIn, w, lam1, 1, 'top', -eIn, w, L);
    if (g.uTr) {
      const w2 = w * Math.cos(f.theta2) / Math.cos(state.th1);
      const eTr = toEdge(g.ox, g.cy, g.uTr[0], g.uTr[1], g.W, g.H) + w2;
      waveBand(ctx, g, g.uTr, w2, lam2, f.T, 'bottom', -w2, eTr, L);
    } else {
      evanescent(ctx, g, w, lam0, L);
    }
    // 細的中心光線（參考用）
    const c = rgba(L.core, 0.55);
    dashedLine(ctx, g.ox - g.uIn[0] * (eIn - w), g.cy - g.uIn[1] * (eIn - w), g.ox, g.cy, c, 1, [2, 5]);
    if (state.showArcs) drawArcs(ctx, g, f);
    // 波長標示
    const sIn = -Math.min(eIn - w, g.m * 0.55) * 0.62;
    lambdaBracket(ctx, g, g.uIn, w, sIn - lam1 / 2, lam1, ['λ', ['1', 'sub']], colors.text, state.side > 0);
    if (g.uTr) {
      const w2 = w * Math.cos(f.theta2) / Math.cos(state.th1);
      const eTr = toEdge(g.ox, g.cy, g.uTr[0], g.uTr[1], g.W, g.H);
      lambdaBracket(ctx, g, g.uTr, w2, Math.min(eTr, g.m * 0.5) * 0.55, lam2, ['λ', ['2', 'sub']], colors.text, state.side < 0);
    }
    mediumLabels(ctx, g);
    pill(ctx, T('示意圖：波長已放大', 'Schematic: wavelength enlarged'), g.W - 8, 16, { align: 'right', color: colors.muted });
    if (f.tir) pill(ctx, T('全反射  R = 100%', 'Total internal reflection  R = 100%'), g.W - 8, g.cy - 18, { align: 'right', color: colors.pos });
    if (kbMain && kbMain.focused()) {
      // 波前模式沒有畫雷射筆：鍵盤選取時在入射方向上畫一個把手＋焦點框
      LD.ball(ctx, g.sx, g.sy, 7, colors.accent);
      focusBox(ctx, g.sx - 14, g.sy - 14, 28, 28);
    }
  }
  /** 全反射時的漸逝波：波峰垂直於界面、沿界面前進，強度隨深度指數衰減 */
  function evanescent(ctx, g, w, lam0, L) {
    const s1 = Math.sin(state.th1);
    const q = state.n1 * state.n1 * s1 * s1 - state.n2 * state.n2;
    const depth = q > 0 ? lam0 / (4 * Math.PI * Math.sqrt(q)) : Infinity; // 強度降為 1/e 的深度（與波長相同放大比例）
    const reach = Math.min(g.H - g.cy - 4, 3 * depth);
    if (reach < 2) return;
    const foot = Math.min(g.W, w / Math.cos(state.th1)) / 2;
    const ux = g.uIn[0];
    const period = lam0 / (state.n1 * Math.abs(ux)); // 沿界面的波峰間距
    const frac = state.tau - Math.floor(state.tau);
    ctx.save();
    ctx.beginPath(); ctx.rect(g.ox - foot, g.cy, foot * 2, reach); ctx.clip();
    const fadeV = ctx.createLinearGradient(0, g.cy, 0, g.cy + reach);
    const a = L.dark ? 0.9 : 0.75;
    // 強度 ∝ e^(−y/δ)；畫面邊緣前 25% 再額外收尾（只影響接近臨界角、δ 很大時的末端）
    for (let i = 0; i <= 12; i++) {
      const y = reach * i / 12;
      const taper = i / 12 > 0.75 ? Math.max(0, (1 - i / 12) / 0.25) : 1;
      fadeV.addColorStop(i / 12, rgba(L.core, a * Math.exp(-y / depth) * taper));
    }
    ctx.strokeStyle = fadeV;
    ctx.lineWidth = 1.4;
    const dir = ux >= 0 ? 1 : -1;
    const k0 = Math.floor(-foot / period) - 1, k1 = Math.ceil(foot / period) + 1;
    ctx.beginPath();
    for (let k = k0; k <= k1; k++) {
      const x = g.ox + dir * (k + frac) * period;
      ctx.moveTo(x, g.cy); ctx.lineTo(x, g.cy + reach);
    }
    ctx.stroke();
    ctx.restore();
    pill(ctx, T('漸逝波', 'Evanescent wave'), g.ox + dir * Math.min(foot + 40, g.W * 0.3), g.cy + Math.min(reach, 40) / 2 + 14, { color: colors.muted });
  }

  // ====================================================================
  // 光纖模式
  // ====================================================================
  function fibreGeom() {
    const W = main.w, H = main.h;
    const cy = Math.round(H * 0.5);
    const x0 = Math.round(W * (W < 500 ? 0.3 : 0.26)), x1 = W - 10;
    const a = Math.round(Math.max(16, Math.min(42, H * 0.085)));
    const clad = Math.round(Math.max(18, H * 0.10));
    const tr = RC.fibreTrace({ n0: 1, nCore: state.nCore, nClad: state.nClad, thetaIn: state.inSide * state.thIn, length: x1 - x0, thickness: 2 * a, maxBounces: 300 });
    const Ls = Math.min(x0 - 26, H * 0.42);
    const ci = Math.cos(state.thIn), si = Math.sin(state.thIn);
    const uIn = [ci, -state.inSide * si];
    return { W: W, H: H, cy: cy, x0: x0, x1: x1, a: a, clad: clad, tr: tr, Ls: Ls, uIn: uIn, lx: x0 - uIn[0] * Ls, ly: cy - uIn[1] * Ls };
  }
  function toScreen(G, pt) { return [G.x0 + pt.x, G.cy - pt.y]; }

  /**
   * 光纖的靜態圖層：背景、格線、玻璃棒（包層＋纖芯，位置與厚度和計算完全相同）。
   * 玻璃棒加上圓柱般的明暗、上緣一道高光、磨亮的端面與柔和投影（純裝飾）。
   */
  function paintFibre(c, G, dark) {
    LD.backdrop(c, G.W, G.H);
    const st = gridStep(Math.min(G.W, G.H));
    LD.grid(c, 0, 0, G.W, G.H, st, gridMinor(st), G.x0, G.cy);
    const hasClad = state.nClad > 1.0005;
    const top = hasClad ? G.cy - G.a - G.clad : G.cy - G.a, bot = hasClad ? G.cy + G.a + G.clad : G.cy + G.a;
    const len = G.x1 - G.x0, rodH = bot - top;
    // 投影：玻璃棒浮在背景上方
    c.save();
    c.shadowColor = LD.shadowInk(dark ? 0.6 : 0.2);
    c.shadowBlur = 18;
    c.shadowOffsetY = 9;
    c.fillStyle = colors['canvas-bg'];
    c.fillRect(G.x0, top, len, rodH);
    c.restore();
    c.fillStyle = LD.alpha(colors['canvas-bg'], 1);
    c.fillRect(G.x0, top, len, rodH);
    if (hasClad) {
      fillMedium(c, G.x0, top, len, G.clad, state.nClad, dark, 'bottom', true);
      fillMedium(c, G.x0, G.cy + G.a, len, G.clad, state.nClad, dark, 'top', true);
    }
    fillMedium(c, G.x0, G.cy - G.a, len, 2 * G.a, state.nCore, dark, 'top', true);
    // 纖芯內部微亮（光被關在裡面的感覺）
    const cg = c.createLinearGradient(0, G.cy - G.a, 0, G.cy + G.a);
    cg.addColorStop(0, LD.alpha(colors.surface, dark ? 0.04 : 0.45));
    cg.addColorStop(0.3, LD.alpha(colors.surface, 0));
    cg.addColorStop(1, LD.shadowInk(dark ? 0.18 : 0.05));
    c.fillStyle = cg;
    c.fillRect(G.x0, G.cy - G.a, len, 2 * G.a);
    // 整根玻璃棒的圓柱明暗
    const rg = c.createLinearGradient(0, top, 0, bot);
    rg.addColorStop(0, dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.75)');
    rg.addColorStop(0.1, dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.22)');
    rg.addColorStop(0.4, 'rgba(255,255,255,0)');
    rg.addColorStop(0.82, LD.shadowInk(0));
    rg.addColorStop(1, LD.shadowInk(dark ? 0.32 : 0.1));
    c.fillStyle = rg;
    c.fillRect(G.x0, top, len, rodH);
    // 界面線（纖芯／包層、外表面）
    c.lineWidth = 1;
    c.strokeStyle = LD.alpha(colors.field, dark ? 0.5 : 0.4);
    c.beginPath();
    [G.cy - G.a, G.cy + G.a].forEach(function (y) { c.moveTo(G.x0, y + 0.5); c.lineTo(G.x1, y + 0.5); });
    if (hasClad) [top, bot].forEach(function (y) { c.moveTo(G.x0, y + 0.5); c.lineTo(G.x1, y + 0.5); });
    c.stroke();
    c.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.9)';
    c.beginPath();
    [G.cy - G.a, G.cy + G.a].forEach(function (y) { c.moveTo(G.x0, y + 1.5); c.lineTo(G.x1, y + 1.5); });
    c.stroke();
    // 上緣的細高光
    c.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(G.x0 + 6, top + rodH * 0.07 + 1); c.lineTo(G.x1 - 3, top + rodH * 0.07 + 1); c.stroke();
    // 磨亮的端面（入射端）與切面（末端）
    const face = c.createLinearGradient(G.x0 - 3, 0, G.x0 + 2, 0);
    face.addColorStop(0, LD.alpha(colors.field, dark ? 0.45 : 0.3));
    face.addColorStop(1, dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.95)');
    c.fillStyle = face;
    c.fillRect(G.x0 - 2.5, top, 4, rodH);
    c.strokeStyle = LD.alpha(colors.field, dark ? 0.55 : 0.45);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(G.x0 - 2, top); c.lineTo(G.x0 - 2, bot); c.moveTo(G.x1 + 0.5, top); c.lineTo(G.x1 + 0.5, bot); c.stroke();
  }

  function drawFibreScene() {
    const ctx = begin(main);
    const G = fibreGeom();
    const L = laser();
    const dark = L.dark;
    const tr = G.tr;
    const top = G.cy - G.a - G.clad, bot = G.cy + G.a + G.clad;
    ctx.drawImage(staticLayer(main, ['f', state.nCore, state.nClad, dark ? 1 : 0].join('|'), function (c) { paintFibre(c, G, dark); }), 0, 0, G.W, G.H);
    // 端面的法線（光纖軸方向）
    dashedLine(ctx, G.x0 - Math.min(G.Ls, 70), G.cy, G.x0 + 60, G.cy, rgba(tokenRGB('muted'), 0.75), 1.1, [5, 4]);

    // 端面反射
    const eRef = Math.min(G.Ls * 0.7, 90);
    beam(ctx, G.x0, G.cy, G.x0 - G.uIn[0] * eRef, G.cy + G.uIn[1] * eRef, tr.entry.R, L, { arrow: false });
    // 入射光
    beam(ctx, G.lx, G.ly, G.x0, G.cy, 1, L, { arrowAt: 0.55 });
    // 漏出的光：在包層中依折射角前進並漸淡
    const clipTop = state.nClad > 1.0005 ? G.clad : Math.min(G.clad, 40);
    tr.leaks.forEach(function (lk) {
      const p = toScreen(G, lk);
      const st = state.nCore * Math.cos(tr.thetaR) / state.nClad; // sinθt = n芯 sinφ / n包
      if (st >= 1) return;
      const tt = Math.asin(st);
      const ux = Math.sin(tt), uy = -lk.side * Math.cos(tt);
      const len = Math.min(clipTop / Math.max(0.2, Math.cos(tt)), 80);
      beam(ctx, p[0], p[1], p[0] + ux * len, p[1] + uy * len, lk.P, L, { arrow: false });
    });
    // 纖芯中的鋸齒光路
    for (let i = 0; i < tr.points.length - 1; i++) {
      const a = toScreen(G, tr.points[i]), b = toScreen(G, tr.points[i + 1]);
      beam(ctx, a[0], a[1], b[0], b[1], tr.points[i].P, L, { arrow: i === 0, arrowAt: 0.5 });
    }
    hotSpot(ctx, G.x0, G.cy, L, 1);
    // 末端輸出亮點
    const last = toScreen(G, tr.points[tr.points.length - 1]);
    if (tr.out > 0.002) hotSpot(ctx, last[0], last[1], L, tr.out);
    // 光脈衝
    drawPulse(ctx, G, L);

    // 角度標示
    if (state.showArcs) fibreArcs(ctx, G);
    // 標籤
    pill(ctx, T('空氣', 'Air') + '  n = 1.00', 8, 16, { align: 'left' });
    pill(ctx, [T('纖芯', 'Core') + '  n = ' + fmtN(state.nCore)], G.x1 - 6, G.cy + G.a - 13, { align: 'right' });
    if (state.nClad > 1.0005) pill(ctx, [T('包層', 'Cladding') + '  n = ' + fmtN(state.nClad)], G.x1 - 6, bot - 13, { align: 'right' });
    else pill(ctx, [T('外面是空氣（無包層）', 'Surrounded by air (no cladding)')], G.x1 - 6, bot - 13, { align: 'right', color: colors.muted });
    const msg = tr.tir ? T('側面全反射：抵達末端 ', 'TIR at the sides: reaching the end ') + fmtPct(tr.out)
      : T('側面部分折射漏光：抵達末端 ', 'Light leaks at the sides: reaching the end ') + fmtPct(tr.out);
    pill(ctx, msg, G.x1 - 6, top - 16, { align: 'right', color: tr.tir ? colors.accent : colors.pos });
    laserDevice(ctx, G.lx, G.ly, G.uIn[0], G.uIn[1], L, state.hover || dragging, kbMain && kbMain.focused());
  }
  function fibreArcs(ctx, G) {
    const tr = G.tr;
    const eq = tokenRGB('equi'), ac = tokenRGB('accent');
    if (state.thIn > 0.3 * DEG) {
      const aIn = Math.atan2(-G.uIn[1], -G.uIn[0]); // 指向雷射
      angleArc(ctx, G.x0, G.cy, 30, Math.PI, aIn, eq);
      const mid = (Math.PI + (aIn < 0 ? aIn + 2 * Math.PI : aIn)) / 2;
      const r = 50;
      pill(ctx, ['θ', [T('入', 'in'), 'sub']], G.x0 + Math.cos(mid) * r - 4, G.cy + Math.sin(mid) * r, { color: colors.equi });
      const aR = -state.inSide * tr.thetaR;
      angleArc(ctx, G.x0, G.cy, 24, 0, aR, ac);
    }
    // 第一次碰到側面：入射角 φ 與臨界角 θc
    if (tr.points.length > 2 && tr.bounces > 0) {
      const b = toScreen(G, tr.points[1]), a0 = toScreen(G, tr.points[0]);
      const inward = b[1] < G.cy ? Math.PI / 2 : -Math.PI / 2;
      const back = Math.atan2(a0[1] - b[1], a0[0] - b[0]);
      const rr = Math.min(26, G.a * 0.9);
      angleArc(ctx, b[0], b[1], rr, inward, back, eq);
      dashedLine(ctx, b[0], b[1] - Math.sin(inward) * 18, b[0], b[1] + Math.sin(inward) * G.a * 1.4, rgba(tokenRGB('muted'), 0.7), 1, [3, 3]);
      if (state.showMarks && isFinite(tr.thetaC)) {
        const ac2 = inward + (back > inward ? 1 : -1) * tr.thetaC;
        const Lc = G.a * 1.15;
        dashedLine(ctx, b[0], b[1], b[0] + Math.cos(ac2) * Lc, b[1] + Math.sin(ac2) * Lc, rgba(tokenRGB('pos'), 0.8), 1.3, [3, 4]);
      }
      const side = b[1] < G.cy ? -1 : 1;
      pill(ctx, ['φ ' + fmtA2(tr.phi)], b[0], b[1] + side * 14 - (side < 0 ? 0 : 0), { color: colors.equi });
    }
  }
  /** 光脈衝沿光路前進：空氣中速度 c、纖芯中 c/n（畫面上的速度比例正確） */
  function pulsePath(G) {
    const pts = [[G.lx, G.ly]].concat(G.tr.points.map(function (p) { return toScreen(G, p); }));
    const seg = [];
    let tTot = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      const n = i === 0 ? 1 : state.nCore;
      const dt = len * n;
      seg.push({ a: pts[i], b: pts[i + 1], t0: tTot, dt: dt, P: i === 0 ? 1 : G.tr.points[i - 1].P });
      tTot += dt;
    }
    return { seg: seg, total: tTot };
  }
  function drawPulse(ctx, G, L) {
    const path = pulsePath(G);
    if (!path.total) return;
    const SPEED = 260; // 空氣中 px/s（畫面時間）
    const t = (state.pulse * SPEED) % (path.total + 140);
    const s = path.seg.find(function (q) { return t >= q.t0 && t < q.t0 + q.dt; });
    if (!s) return;
    const f = (t - s.t0) / s.dt;
    const x = s.a[0] + (s.b[0] - s.a[0]) * f, y = s.a[1] + (s.b[1] - s.a[1]) * f;
    const v = Math.sqrt(s.P);
    const r = 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(L.dark ? WHITE : L.core, 0.95 * v));
    g.addColorStop(0.4, rgba(L.rgb, 0.6 * v));
    g.addColorStop(1, rgba(L.rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
  }

  // ====================================================================
  // R、T 對入射角的關係圖
  // ====================================================================
  let chartLayout = null;
  function chartPair() {
    return state.mode === 'fibre'
      ? { n1: state.nCore, n2: state.nClad, th: state.mode === 'fibre' ? fibreGeomLite().phi : 0 }
      : { n1: state.n1, n2: state.n2, th: state.th1 };
  }
  function fibreGeomLite() {
    const thR = RC.refractionAngle(1, state.nCore, state.thIn);
    return { phi: Math.PI / 2 - thR };
  }
  function drawChart() {
    const ctx = begin(chart);
    const W = chart.w, H = chart.h;
    const dark = isDark();
    LD.backdrop(ctx, W, H);
    ctx.font = FONT;
    const fs = fontPx(ctx);
    const PL = Math.round(fs * 3.2), PR = 14, PT = Math.round(fs * 2.4), PB = Math.round(fs * 2.2);
    const PW = W - PL - PR, PH = H - PT - PB;
    chartLayout = { PL: PL, PW: PW, PT: PT, PH: PH };
    const pr = chartPair();
    const xOf = function (d) { return PL + d / 90 * PW; };
    const yOf = function (v) { return PT + (1 - v) * PH; };
    // 繪圖區：比背景略亮（淺色）或略深（深色）的圓角面板
    LD.roundRect(ctx, PL - 0.5, PT - 0.5, PW + 1, PH + 1, 4);
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.16)' : LD.alpha(colors.surface, 0.75);
    ctx.fill();
    // 標題
    const title = state.mode === 'fibre'
      ? [T('纖芯→包層：反射率對側面入射角 φ', 'Core → cladding: reflectance vs side angle φ')]
      : [T('反射率、穿透率對入射角 θ', 'Reflectance and transmittance vs angle θ'), ['1', 'sub']];
    if (measureParts(ctx, title) > W - PL) {
      title.length = 0;
      if (state.mode === 'fibre') title.push(T('反射率對側面入射角 φ', 'Reflectance vs side angle φ'));
      else title.push(T('R、T 對入射角 θ', 'R and T vs angle θ'), ['1', 'sub']);
    }
    pill(ctx, title, PL - 6, PT / 2, { align: 'left', plain: true, clamp: false });
    // 全反射區
    const thc = RC.criticalAngle(pr.n1, pr.n2);
    const posRGB = tokenRGB('pos'), negRGB = tokenRGB('neg'), fieldRGB = tokenRGB('field');
    if (isFinite(thc)) {
      const xc = xOf(thc / DEG);
      ctx.save();
      ctx.beginPath(); ctx.rect(xc, PT, PL + PW - xc, PH); ctx.clip();
      ctx.fillStyle = rgba(posRGB, dark ? 0.10 : 0.06);
      ctx.fillRect(xc, PT, PL + PW - xc, PH);
      ctx.strokeStyle = rgba(posRGB, dark ? 0.16 : 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = xc - PH; x < PL + PW; x += 9) { ctx.moveTo(x, PT + PH); ctx.lineTo(x + PH, PT); }
      ctx.stroke();
      ctx.restore();
      if (PL + PW - xc > 60) {
        ctx.font = FONT;
        pillC(ctx, T('全反射', 'TIR'), (xc + PL + PW) / 2, PT + PH * 0.55, colors.pos);
      }
    }
    // 格線：次格線（每 5°、每 5%）＋主格線
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(fieldRGB, dark ? 0.045 : 0.035);
    ctx.beginPath();
    for (let d = 5; d < 90; d += 5) if (d % 15) { const xx = Math.round(xOf(d)) + 0.5; ctx.moveTo(xx, PT); ctx.lineTo(xx, PT + PH); }
    for (let v = 0.05; v < 0.999; v += 0.05) if (Math.abs(v * 4 - Math.round(v * 4)) > 1e-6) { const yy = Math.round(yOf(v)) + 0.5; ctx.moveTo(PL, yy); ctx.lineTo(PL + PW, yy); }
    ctx.stroke();
    for (let v = 0; v <= 1.0001; v += 0.25) {
      ctx.strokeStyle = rgba(fieldRGB, v === 0 || v > 0.99 ? 0.22 : 0.08);
      ctx.beginPath(); ctx.moveTo(PL, Math.round(yOf(v)) + 0.5); ctx.lineTo(PL + PW, Math.round(yOf(v)) + 0.5); ctx.stroke();
    }
    for (let d = 0; d <= 90; d += 15) {
      ctx.strokeStyle = rgba(fieldRGB, d % 30 === 0 ? 0.10 : 0.05);
      ctx.beginPath(); ctx.moveTo(Math.round(xOf(d)) + 0.5, PT); ctx.lineTo(Math.round(xOf(d)) + 0.5, PT + PH); ctx.stroke();
    }
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach(function (v) { ctx.fillText(Math.round(v * 100) + '%', PL - 6, yOf(v)); });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let d = 0; d <= 90; d += (PW < 260 ? 30 : 15)) ctx.fillText(d + '°', xOf(d), PT + PH + 5);
    // 曲線
    const N = Math.max(90, Math.round(PW));
    const curve = function (fn, rgb, width, dash, alpha) {
      ctx.save();
      ctx.strokeStyle = rgba(rgb, alpha || 1);
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const d = 90 * i / N;
        const f = RC.fresnel(pr.n1, pr.n2, Math.min(d, 89.999) * DEG);
        const y = yOf(fn(f));
        if (i === 0) ctx.moveTo(xOf(d), y); else ctx.lineTo(xOf(d), y);
      }
      ctx.stroke();
      ctx.restore();
    };
    if (state.showSP) {
      curve(function (f) { return f.Rs; }, posRGB, 1.4, [6, 4], 0.75);
      curve(function (f) { return f.Rp; }, posRGB, 1.6, [1.5, 3.5], 0.85);
    }
    // R 曲線下方淡淡的面積（全反射區已有底色，不再重複）
    ctx.save();
    if (isFinite(thc)) { ctx.beginPath(); ctx.rect(PL, PT, xOf(thc / DEG) - PL, PH); ctx.clip(); }
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    for (let i = 0; i <= N; i++) { const d = 90 * i / N; ctx.lineTo(xOf(d), yOf(RC.fresnel(pr.n1, pr.n2, Math.min(d, 89.999) * DEG).R)); }
    ctx.lineTo(xOf(90), yOf(0));
    ctx.closePath();
    const fillG = ctx.createLinearGradient(0, PT, 0, PT + PH);
    fillG.addColorStop(0, rgba(posRGB, dark ? 0.20 : 0.12));
    fillG.addColorStop(1, rgba(posRGB, 0.02));
    ctx.fillStyle = fillG;
    ctx.fill();
    ctx.restore();
    curve(function (f) { return f.T; }, negRGB, 2.2);
    curve(function (f) { return f.R; }, posRGB, 2.4);
    // 臨界角、布魯斯特角
    ctx.font = FONT;
    if (state.showMarks) {
      const thb = RC.brewsterAngle(pr.n1, pr.n2);
      const marks = [];
      if (isFinite(thc)) marks.push([thc, ['θ', ['c', 'sub']], colors.pos]);
      if (Math.abs(pr.n1 - pr.n2) > 1e-6 && (!isFinite(thc) || thb < thc)) marks.push([thb, ['θ', ['B', 'sub']], colors.muted]);
      marks.forEach(function (mk, i) {
        const x = xOf(mk[0] / DEG);
        dashedLine(ctx, x, PT, x, PT + PH, mk[2], 1.1, [3, 3]);
        pillC(ctx, mk[1], x, PT + 10 + i * 0, mk[2]);
      });
    }
    // 目前角度
    const th = pr.th;
    if (isFinite(th)) {
      const f = RC.fresnel(pr.n1, pr.n2, Math.min(th, 89.999 * DEG));
      const x = xOf(th / DEG);
      const probe = tokenRGB('probe');
      ctx.strokeStyle = LD.alpha(colors['canvas-bg'], 0.7);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + PH); ctx.stroke();
      ctx.strokeStyle = rgba(probe, 0.9);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + PH); ctx.stroke();
      if (kbChart && kbChart.focused()) focusBox(ctx, x - 9, PT - 5, 18, PH + 10);
      LD.ball(ctx, x, yOf(f.T), 5, colors.neg, { glow: dark ? 0.35 : 0 });
      LD.ball(ctx, x, yOf(f.R), 5, colors.pos, { glow: dark ? 0.35 : 0 });
      const txt = 'R ' + fmtPct(f.R) + ' · T ' + fmtPct(f.T);
      ctx.font = FONT;
      const tw = measureParts(ctx, txt) + 12;
      const right = x + 10 + tw < PL + PW;
      const yy = PT + PH * (f.R > 0.5 ? 0.78 : 0.22);
      pillC(ctx, txt, right ? x + 8 + tw / 2 : x - 8 - tw / 2, yy, colors.text, true);
    }
  }
  function pillC(ctx, parts, x, y, color, noClamp) {
    // 圖表用（以圖表畫布寬度限制位置）
    const save = main.w;
    main.w = chart.w;
    pill(ctx, parts, x, y, { color: color, clamp: !noClamp });
    main.w = save;
  }

  // ====================================================================
  // 讀數與狀態文字
  // ====================================================================
  function setText(id, t) { $(id).textContent = t; }
  /** 狀態說明（看得到的文字）：內容沒變就不重寫，避免螢幕閱讀器重複朗讀 */
  function setStatus(s) { const el = $('status'); if (el.textContent !== s) el.textContent = s; }

  // ---------- 讀數播報（螢幕閱讀器）：設定穩定下來後才念一次最重要的結果，間隔至少 1 秒 ----------
  let liveTimer = 0, liveLast = '', liveAt = 0, liveStatus = '', keyQuiet = 0;
  function summary() {
    const sep = T('，', ', ');
    if (state.mode === 'fibre') {
      const tr = fibreGeom().tr;
      return [T('射入角 ', 'Launch angle ') + fmtA(state.thIn) + (state.thIn > 0.05 * DEG ? (state.inSide > 0 ? T('（雷射在光纖軸下方）', ' (laser below the axis)') : T('（雷射在光纖軸上方）', ' (laser above the axis)')) : ''),
        T('側面入射角 φ ', 'side angle φ ') + fmtA(tr.phi) + (tr.tir ? T('，全反射', ', totally reflected') : T('，有光漏出', ', light leaks out')),
        T('抵達末端 ', 'power at the far end ') + fmtPct(tr.out)].join(sep) + T('。', '.');
    }
    const f = RC.fresnel(state.n1, state.n2, state.th1);
    const out = [T('入射角 ', 'Angle of incidence ') + fmtA(state.th1) + (state.th1 > 0.05 * DEG ? (state.side < 0 ? T('（雷射在法線左側）', ' (laser left of the normal)') : T('（雷射在法線右側）', ' (laser right of the normal)')) : '')];
    out.push(f.tir ? T('全反射，沒有折射光', 'total internal reflection, no refracted ray') : T('折射角 ', 'angle of refraction ') + fmtA(f.theta2));
    out.push(T('反射率 ', 'reflectance ') + fmtPct(f.R));
    if (!f.tir) out.push(T('穿透率 ', 'transmittance ') + fmtPct(f.T));
    return out.join(sep) + T('。', '.');
  }
  /** 要念的句子：讀數＋（狀態說明有改變時）狀態說明 */
  function speech() {
    updateReadout(); // 鍵盤移動後畫面還沒重畫：先更新狀態說明，念的內容才會一致
    let txt = summary();
    const st = $('status').textContent;
    if (st && st !== liveStatus) { txt += ' ' + st; liveStatus = st; }
    liveLast = txt;
    liveAt = Date.now();
    return txt;
  }
  function scheduleAnnounce() {
    const live = $('live');
    if (!live || !userActed) return;
    clearTimeout(liveTimer);
    if (dragging || chartDrag) return;
    liveTimer = setTimeout(function () {
      if (Date.now() < keyQuiet) return; // 鍵盤移動時 keys.js 已經念過
      const prevSt = liveStatus;
      const txt = speech();
      if (txt === live.textContent && liveStatus === prevSt) return;
      live.textContent = txt;
    }, Math.max(600, 1000 - (Date.now() - liveAt)));
  }

  function updateReadout() {
    if (state.mode === 'fibre') return updateFibreReadout();
    const n1 = state.n1, n2 = state.n2, th = state.th1;
    const f = RC.fresnel(n1, n2, th);
    const thc = RC.criticalAngle(n1, n2), thb = RC.brewsterAngle(n1, n2);
    setText('r1', fmtA2(th));
    setText('r1r', fmtA2(th));
    const exactCrit = isFinite(thc) && Math.abs(th - thc) < 1e-9;
    setText('r2', f.tir ? (exactCrit ? T('90°（恰為臨界角）', '90° (exactly critical)') : T('無（全反射）', 'None (TIR)')) : fmtA2(f.theta2));
    $('r2').classList.toggle('flag', f.tir);
    if (isFinite(thc)) setText('rc', fmtA2(thc));
    else $('rc').innerHTML = T('無', 'None') + ' <small>(n<sub>1</sub> ≤ n<sub>2</sub>)</small>';
    setText('rb', Math.abs(n1 - n2) > 1e-9 ? fmtA2(thb) : '—');
    setText('rR', fmtPct(f.R));
    setText('rT', fmtPct(f.T));
    setText('rSP', fmtPct(f.Rs) + T('、', ', ') + fmtPct(f.Rp));
    $('rv1').innerHTML = fmtSpeedHTML(n1);
    $('rv2').innerHTML = fmtSpeedHTML(n2);
    setText('rl1', (state.nm / n1).toFixed(0) + ' nm');
    setText('rl2', (state.nm / n2).toFixed(0) + ' nm');
    $('qCritV').textContent = isFinite(thc) ? fmtA2(thc) : T('無', 'none');
    $('qCrit').disabled = !isFinite(thc);
    $('qBrewV').textContent = Math.abs(n1 - n2) > 1e-9 ? fmtA2(thb) : '—';
    $('qBrew').disabled = Math.abs(n1 - n2) <= 1e-9;
    // 狀態說明
    let s;
    if (Math.abs(n1 - n2) < 1e-9) s = T('兩種介質的折射率相同：光直線前進，沒有反射。', 'Both media have the same refractive index: the light goes straight on and nothing is reflected.');
    else if (f.tir) s = exactCrit
      ? T('恰好在臨界角：折射光沿界面掠過，強度為 0；角度再大就全反射。', 'Exactly at the critical angle: the refracted ray grazes along the interface with zero intensity; any larger angle gives total internal reflection.')
      : T('全反射：入射角 ≥ 臨界角，光全部反射回上方介質。', 'Total internal reflection: the angle of incidence is at least the critical angle, so all the light is reflected back.');
    else if (Math.abs(th - thb) < 0.15 * DEG) s = T('布魯斯特角：p 偏振光完全不反射，反射光是純 s 偏振；反射光與折射光互相垂直。', 'Brewster angle: p-polarised light is not reflected at all, so the reflected light is purely s-polarised; the reflected and refracted rays are perpendicular.');
    else if (th < 0.05 * DEG) s = T('垂直入射：光不偏折；反射率只由兩介質折射率的差異決定。', 'Normal incidence: the light is not bent, and the reflectance depends only on how different the two refractive indices are.');
    else if (n2 > n1) s = T('進入光密介質：光變慢，折射光偏向法線（θ2 < θ1）。', 'Entering a denser medium: the light slows down and bends toward the normal (θ2 < θ1).');
    else s = T('進入光疏介質：光變快，折射光偏離法線（θ2 > θ1）；入射角到達臨界角時將全反射。', 'Entering a less dense medium: the light speeds up and bends away from the normal (θ2 > θ1); at the critical angle it will be totally reflected.');
    setStatus(s);
  }
  function updateFibreReadout() {
    const tr = fibreGeom().tr;
    const ta = RC.acceptanceAngle(state.nCore, state.nClad, 1);
    setText('f1', fmtA2(state.thIn));
    setText('fr', fmtA2(tr.thetaR));
    setText('fphi', fmtA2(tr.phi));
    setText('fc', isFinite(tr.thetaC) ? fmtA2(tr.thetaC) : T('無', 'None'));
    setText('fa', isNaN(ta) ? T('無（無法導光）', 'None (cannot guide)') : ta >= Math.PI / 2 - 1e-12 ? T('90°（任何角度）', '90° (any angle)') : fmtA2(ta));
    setText('fna', RC.numericalAperture(state.nCore, state.nClad) > 0 ? RC.numericalAperture(state.nCore, state.nClad).toFixed(3) : '0');
    setText('fent', fmtPct(tr.entry.T));
    setText('fb', String(tr.bounces));
    setText('fout', fmtPct(tr.out));
    $('fout').classList.toggle('flag', !tr.tir);
    $('qAccV').textContent = isNaN(ta) ? T('無', 'none') : fmtA2(Math.min(ta, 89.9 * DEG));
    $('qAccept').disabled = isNaN(ta);
    let s;
    if (state.nCore <= state.nClad) s = T('纖芯的折射率沒有大於包層，不會全反射，光很快就漏光。', 'The core is not denser than the cladding, so there is no total internal reflection and the light soon leaks out.');
    else if (tr.tir) s = T('側面入射角 φ ≥ 臨界角：每次都全反射，光被限制在纖芯中前進。', 'Side angle φ ≥ critical angle: every reflection is total, so the light is trapped in the core.');
    else s = T('射入角超過最大接收角：側面入射角 φ 小於臨界角，每次反射都有光漏出。', 'Launch angle beyond the acceptance angle: φ is below the critical angle, so light leaks out at every reflection.');
    setStatus(s);
  }

  // ====================================================================
  // 繪製排程與動畫
  // ====================================================================
  let pending = false;
  function drawAll() {
    updateReadout();
    if (state.mode === 'ray') drawRayScene();
    else if (state.mode === 'wave') drawWaveScene();
    else drawFibreScene();
    drawChart();
    scheduleMission();
    scheduleAnnounce();
  }
  function requestDraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; drawAll(); });
  }
  let animReq = 0, lastT = 0, visible = true;
  function animates() { return state.anim && state.mode !== 'ray' && visible && !document.hidden; }
  function loop(t) {
    animReq = 0;
    if (!animates()) return;
    const dt = Math.min(1 / 30, (t - (lastT || t)) / 1000);
    lastT = t;
    state.tau += 0.55 * dt;
    state.pulse += dt;
    if (state.mode === 'wave') drawWaveScene(); else drawFibreScene();
    animReq = requestAnimationFrame(loop);
  }
  function startAnim() {
    if (animReq || !animates()) return;
    lastT = 0;
    animReq = requestAnimationFrame(loop);
  }

  // ====================================================================
  // 控制項
  // ====================================================================
  function bindSlider(id, fmt, onInput) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.textContent = fmt(val(el)); };
    el.addEventListener('input', function () { onInput(val(el)); update(); requestDraw(); });
    update();
    return {
      el: el,
      /** 程式設定精確值（例如拖曳畫布、臨界角按鈕）：滑桿移到最近的位置，數字顯示精確值 */
      show: function (v) {
        if (window.LabNum) window.LabNum.clear(el);
        el.value = String(v);
        out.textContent = fmt(v);
      },
      set: function (v) { if (window.LabNum) window.LabNum.set(el, v); else { el.value = String(v); el.dispatchEvent(new Event('input')); } }
    };
  }
  const nFmt = function (v) { return fmtN(v); };
  const degFmt = function (v) { return trim(v, 2, 1) + '°'; };
  const sN1 = bindSlider('n1', nFmt, function (v) { state.n1 = v; syncPresets(); });
  const sN2 = bindSlider('n2', nFmt, function (v) { state.n2 = v; syncPresets(); });
  const sTh = bindSlider('th', degFmt, function (v) { state.th1 = v * DEG; });
  const sCore = bindSlider('nCore', nFmt, function (v) { state.nCore = v; syncPresets(); });
  const sClad = bindSlider('nClad', nFmt, function (v) { state.nClad = v; syncPresets(); });
  const sIn = bindSlider('thIn', degFmt, function (v) { state.thIn = v * DEG; });

  function setTh1(rad) {
    state.th1 = Math.max(0, Math.min(89.9 * DEG, rad));
    sTh.show(Math.round(state.th1 / DEG * 100) / 100);
    $('tho').textContent = fmtA(state.th1);
    requestDraw();
  }
  function setThIn(rad) {
    state.thIn = Math.max(0, Math.min(89.9 * DEG, rad));
    sIn.show(Math.round(state.thIn / DEG * 100) / 100);
    $('thIno').textContent = fmtA(state.thIn);
    requestDraw();
  }

  function presetGroup(groupId, slider) {
    const btns = Array.prototype.slice.call(document.querySelectorAll('#' + groupId + ' [data-n]'));
    btns.forEach(function (b) { b.addEventListener('click', function () { slider.set(+b.dataset.n); }); });
    return function (n) { btns.forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.n - n) < 1e-9)); }); };
  }
  const syncP1 = presetGroup('pre1', sN1), syncP2 = presetGroup('pre2', sN2);
  const syncPC = presetGroup('preCore', sCore), syncPCl = presetGroup('preClad', sClad);
  function syncPresets() {
    syncP1(state.n1); syncP2(state.n2); syncPC(state.nCore); syncPCl(state.nClad);
    const tint = tokenRGB('neg');
    const dark = isDark();
    $('chip1').style.background = rgba(tint, Math.max(0.03, tintAlpha(state.n1, dark) * 1.6));
    $('chip2').style.background = rgba(tint, Math.max(0.03, tintAlpha(state.n2, dark) * 1.6));
  }
  $('swap').addEventListener('click', function () {
    const a = state.n1, b = state.n2;
    sN1.set(b); sN2.set(a);
  });
  $('qNormal').addEventListener('click', function () { setTh1(0); });
  $('qCrit').addEventListener('click', function () { const c = RC.criticalAngle(state.n1, state.n2); if (isFinite(c)) setTh1(c); });
  $('qBrew').addEventListener('click', function () { setTh1(RC.brewsterAngle(state.n1, state.n2)); });
  $('qAxis').addEventListener('click', function () { setThIn(0); });
  $('qAccept').addEventListener('click', function () {
    const ta = RC.acceptanceAngle(state.nCore, state.nClad, 1);
    if (!isNaN(ta)) setThIn(Math.min(ta, 89.9 * DEG));
  });

  document.querySelectorAll('[data-nm]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.nm = +b.dataset.nm;
      document.querySelectorAll('[data-nm]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      syncLegend();
      requestDraw();
    });
  });
  function syncLegend() {
    const c = laser();
    $('legend').style.setProperty('--beam', rgba(c.core, 1));
  }

  ['showArcs', 'showProt', 'showMarks', 'showSP'].forEach(function (id) {
    $(id).addEventListener('change', function (ev) {
      state[id] = ev.target.checked;
      if (id === 'showSP') document.querySelectorAll('.legend .sp').forEach(function (e) { e.hidden = !state.showSP; });
      requestDraw();
    });
  });
  document.querySelectorAll('.legend .sp').forEach(function (e) { e.hidden = !state.showSP; });

  function syncAnimButton() {
    $('anim').hidden = state.mode === 'ray';
    $('anim').textContent = state.anim ? T('暫停動畫', 'Pause animation') : T('播放動畫', 'Play animation');
  }
  $('anim').addEventListener('click', function () {
    state.anim = !state.anim;
    syncAnimButton();
    if (state.anim) startAnim(); else requestDraw();
  });

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
    document.querySelectorAll('[data-m]').forEach(function (e) { e.hidden = e.dataset.m.split(' ').indexOf(mode) < 0; });
    $('mediaCard').hidden = mode === 'fibre';
    $('fibreCard').hidden = mode !== 'fibre';
    syncAnimButton();
    requestDraw();
    startAnim();
  }
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  // ---------- 拖曳（滑鼠與觸控） ----------
  let dragging = false;
  function local(ev) { const r = main.cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function nearSource(p) {
    if (state.mode === 'fibre') { const G = fibreGeom(); return Math.hypot(p[0] - G.lx, p[1] - G.ly) < 34; }
    const g = rayGeom();
    return Math.hypot(p[0] - g.sx, p[1] - g.sy) < 34;
  }
  function dragTo(p) {
    if (state.mode === 'fibre') {
      const G = fibreGeom();
      const dx = Math.min(-1, p[0] - G.x0), dy = p[1] - G.cy;
      if (Math.abs(dy) > 0.5) state.inSide = dy > 0 ? 1 : -1;
      setThIn(Math.round(Math.atan2(Math.abs(dy), -dx) / DEG * 10) / 10 * DEG);
      return;
    }
    const W = main.w, H = main.h;
    let dx = p[0] - W / 2, dy = p[1] - Math.round(H * 0.5);
    if (dy > 0) dy = -dy; // 拖到界面下方時取鏡像（雷射永遠在上方介質）
    if (Math.abs(dx) > 1) state.side = dx < 0 ? -1 : 1;
    setTh1(Math.round(Math.atan2(Math.abs(dx), Math.max(1e-6, -dy)) / DEG * 10) / 10 * DEG);
  }
  main.cv.addEventListener('pointerdown', function (ev) {
    dragging = true;
    try { main.cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    dragTo(local(ev));
  });
  main.cv.addEventListener('pointermove', function (ev) {
    const p = local(ev);
    if (dragging) { dragTo(p); return; }
    if (ev.pointerType === 'mouse') {
      const h = nearSource(p);
      if (h !== state.hover) { state.hover = h; main.cv.style.cursor = h ? 'grab' : 'crosshair'; requestDraw(); }
    }
  });
  const endDrag = function () { if (dragging) { dragging = false; requestDraw(); } };
  main.cv.addEventListener('pointerup', endDrag);
  main.cv.addEventListener('pointercancel', endDrag);
  main.cv.addEventListener('pointerleave', function () { if (state.hover) { state.hover = false; requestDraw(); } });

  // ---------- 圖表：點擊、拖曳、方向鍵改變角度 ----------
  let chartDrag = false;
  function chartSet(ev) {
    if (!chartLayout) return;
    const r = chart.cv.getBoundingClientRect();
    const d = Math.max(0, Math.min(89.9, (ev.clientX - r.left - chartLayout.PL) / chartLayout.PW * 90));
    applyChartAngle(Math.round(d * 10) / 10 * DEG);
  }
  function applyChartAngle(rad) {
    if (state.mode === 'fibre') {
      // 側面入射角 φ → 端面射入角：sinθin = n芯 cosφ（超出範圍時取最接近的可達角度）
      const s = state.nCore * Math.cos(rad);
      setThIn(s >= 1 ? 89.9 * DEG : Math.asin(Math.max(0, s)));
    } else setTh1(rad);
  }
  chart.cv.addEventListener('pointerdown', function (ev) {
    chartDrag = true;
    try { chart.cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    chartSet(ev);
  });
  chart.cv.addEventListener('pointermove', function (ev) { if (chartDrag) chartSet(ev); });
  const endChartDrag = function () { if (chartDrag) { chartDrag = false; requestDraw(); } };
  chart.cv.addEventListener('pointerup', endChartDrag);
  chart.cv.addEventListener('pointercancel', endChartDrag);

  // ---------- 鍵盤操作（keys.js）：畫布上的雷射、圖上的目前角度 ----------
  const deg01 = function (rad) { return Math.round(rad / DEG * 10) / 10 * DEG; }; // 與拖曳相同：取到 0.1°
  /**
   * 轉動雷射（與拖曳相同的範圍 0°–89.9°，可跨到法線或光纖軸的另一側）。
   * 光線／波前：左右鍵讓雷射沿圓弧左右移動，上鍵靠向法線、下鍵遠離法線。
   * 光纖：上下鍵讓雷射上下移動（可跨過光纖軸），左右鍵減小／加大射入角。
   */
  function moveLaser(dx, dy, big) {
    const step = (big ? 5 : 0.5) * DEG, MAX = 89.9 * DEG;
    keyQuiet = Date.now() + 1500;
    if (state.mode === 'fibre') {
      let s = -state.inSide * state.thIn; // > 0：雷射在光纖軸上方
      if (dy) s += dy * step;
      else s = (s > 0 || (s === 0 && state.inSide < 0) ? 1 : -1) * Math.max(0, Math.abs(s) + dx * step);
      const before = [state.inSide, state.thIn];
      if (s > 1e-12) state.inSide = -1; else if (s < -1e-12) state.inSide = 1;
      setThIn(deg01(Math.min(MAX, Math.abs(s))));
      return before[0] !== state.inSide || Math.abs(before[1] - state.thIn) > 1e-12;
    }
    let a = state.side * state.th1; // < 0：雷射在法線左側
    if (dx) a += dx * step;
    else a = (a > 0 || (a === 0 && state.side > 0) ? 1 : -1) * Math.max(0, Math.abs(a) - dy * step);
    const before = [state.side, state.th1];
    if (a > 1e-12) state.side = 1; else if (a < -1e-12) state.side = -1;
    setTh1(deg01(Math.min(MAX, Math.abs(a))));
    return before[0] !== state.side || Math.abs(before[1] - state.th1) > 1e-12;
  }
  if (window.LabKeys) {
    kbMain = window.LabKeys.attach(main.cv, {
      label: T('折射實驗畫布。方向鍵轉動雷射：光線與波前模式，左右鍵讓雷射沿圓弧移動（可跨到法線另一側），上鍵靠向法線、下鍵遠離法線；光纖模式，上下鍵移動雷射、左右鍵改變射入角。每次 0.5°，按住 Shift 每次 5°。',
        'Refraction canvas. Use the arrow keys to swing the laser. In the ray and wavefront views, left and right move it along its arc (it can cross the normal), up turns it toward the normal and down away from it. In the fibre view, up and down move the laser, left and right change the launch angle. 0.5° a step; hold Shift for 5°.'),
      items: [{
        name: function () { return T('雷射', 'Laser'); },
        move: moveLaser,
        describe: speech
      }],
      onChange: requestDraw
    });
    kbChart = window.LabKeys.attach(chart.cv, {
      label: T('反射率與穿透率對入射角的關係圖。左右（或上下）方向鍵改變目前的角度，每次 0.5°，按住 Shift 每次 5°；也可以點擊或拖曳。',
        'Graph of reflectance and transmittance against the angle. Use the left and right (or up and down) arrow keys to change the current angle, 0.5° a step, 5° with Shift; you can also click or drag.'),
      items: [{
        name: function () { return T('目前角度', 'Current angle'); },
        move: function (dx, dy, big) {
          const cur = chartPair().th, d = dx || dy;
          const v = Math.max(0, Math.min(89.9 * DEG, cur + d * (big ? 5 : 0.5) * DEG));
          if (Math.abs(v - cur) < 1e-12) return false;
          keyQuiet = Date.now() + 1500;
          applyChartAngle(v);
          return true;
        },
        describe: speech
      }],
      onChange: requestDraw
    });
  }

  // ---------- 分享連結：雷射在哪一側、精確的角度（滑桿與按鈕由 classroom.js 記錄） ----------
  // classroom.js 比本檔晚載入：先放進 LAB_SHARE_EXTRAS，它載入後會補登記（已載入時 push 直接登記）
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { s: state.side, i: state.inSide, a: state.th1, b: state.thIn }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const ok = function (v) { return typeof v === 'number' && isFinite(v); };
      if (o.s === 1 || o.s === -1) state.side = o.s;
      if (o.i === 1 || o.i === -1) state.inSide = o.i;
      if (ok(o.a)) setTh1(o.a); // setTh1、setThIn 會把角度限制在 0°–89.9°
      if (ok(o.b)) setThIn(o.b);
      requestDraw();
    }
  });

  // ---------- 任務模式（missions.js）：設定穩定下來後回報一次目前的光學量 ----------
  // 只在使用者親自操作之後才回報（預設狀態不會意外完成任務）；拖曳雷射時不回報，放開後才回報。
  let missionTimer = 0, userActed = false;
  ['input', 'change', 'click', 'pointerdown', 'keydown'].forEach(function (t) {
    document.querySelector('.lab').addEventListener(t, function (e) { if (e.isTrusted) userActed = true; }, true);
  });
  function scheduleMission() {
    if (!window.LabMission || !userActed) return;
    clearTimeout(missionTimer);
    if (dragging) return;
    missionTimer = setTimeout(function () {
      const toDeg = function (r) { return r / DEG; };
      const a = RC.interfaceInfo(state.n1, state.n2, state.th1, state.nm);
      const b = RC.fibreInfo(state.nCore, state.nClad, state.thIn, 1);
      window.LabMission.emit('setup', {
        mode: state.mode, nm: state.nm,
        n1: state.n1, n2: state.n2, th1: toDeg(state.th1), th2: toDeg(a.th2), tir: a.tir,
        crit: toDeg(a.crit), brew: toDeg(a.brew), dev: toDeg(a.dev),
        R: a.R, T: a.T, Rs: a.Rs, Rp: a.Rp, lam1: a.lam1, lam2: a.lam2, v1: a.v1, v2: a.v2, depth: a.depth / state.nm,
        nCore: state.nCore, nClad: state.nClad, thIn: toDeg(state.thIn), thR: toDeg(b.thR), phi: toDeg(b.phi),
        fCrit: toDeg(b.crit), acc: toDeg(b.acc), NA: b.NA, guided: b.guided, entryT: b.entryT, wallR: b.wallR
      });
    }, 300);
  }

  // ---------- 啟動 ----------
  function onTheme() { readColors(); syncPresets(); syncLegend(); syncAnimButton(); requestDraw(); }
  readColors();
  syncPresets();
  syncLegend();
  setTh1(state.th1);
  setThIn(state.thIn);
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);

  function onResize() { sizeCanvas(main); sizeCanvas(chart); drawAll(); }
  if (window.ResizeObserver) {
    let roPending = false;
    const ro = new ResizeObserver(function () {
      if (roPending) return;
      roPending = true;
      requestAnimationFrame(function () { roPending = false; onResize(); });
    });
    ro.observe(main.cv);
    ro.observe(chart.cv);
  } else window.addEventListener('resize', onResize);
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) startAnim();
    }).observe(main.cv);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) startAnim(); });
  setMode(state.mode);
  onResize();
  // settings.js 在 DOMContentLoaded 套用英文時會換掉按鈕內容（例如臨界角數值），之後再更新一次
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { syncAnimButton(); requestDraw(); });
})();
