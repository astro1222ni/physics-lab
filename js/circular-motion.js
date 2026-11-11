/* circular-motion.js — 「等速圓周運動」模組的畫面與互動（物理計算在 circular-motion-core.js） */
(function () {
  'use strict';
  const CC = window.CircularCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 畫面比例（固定，畫面上有說明） ----------
  const VIEW_HALF = 2.35;  // m：圓周區域中心到邊緣的距離（r 最大 2 m）
  const SCALE_V = 0.3;     // 速度箭頭：每 1 m/s 畫 0.3 m
  const SCALE_A = 0.1;     // 加速度箭頭：每 1 m/s² 畫 0.1 m
  const SCALE_F = 0.2;     // 力箭頭：每 1 N 畫 0.2 m
  const MAX_ARROW = 2.2;   // m：超過這個長度的箭頭截短並標「≈」
  const WINDOWS = [4, 6, 8, 12, 16, 24, 30]; // s：x–t、y–t 圖的時間視窗
  const SLOW = 0.25;

  const state = {
    r: 1.5, T: 3, m: 0.5, hold: 'T',
    theta0: 0,          // t = 0 時的角位置（rad）
    t: 0,
    tCut: null,         // 剪斷繩子的時刻；null 代表繩子還在
    running: !reducedMotion, // 減少動態效果時預設暫停
    ended: false,       // 剪斷後小球已飛出畫面
    slow: false,
    show: { v: true, a: true, f: false, trail: true, dots: true, proj: true },
    fx: []              // 純裝飾的短暫效果（不影響物理）
  };

  function params() { return { r: state.r, T: state.T, m: state.m, theta0: state.theta0 }; }
  function now() { return CC.motionAt(params(), state.t, state.tCut); }

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--grid', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--b-mech', '--b-optics']
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
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 滑桿數字：顯示到可輸入的精度（去掉多餘的 0，但不少於滑桿間隔的位數） */
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300;
  let L = null; // 版面：各區域位置與比例
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');

  function layout() {
    const narrow = cw < 560;
    const S = Math.round(cw * (narrow ? 0.62 : 0.52));
    const Hb = Math.round(cw * (narrow ? 0.36 : 0.25));
    const gap = narrow ? 5 : 8;
    const k = S / 2 / VIEW_HALF; // px/m
    return {
      narrow: narrow, S: S, Hb: Hb, gap: gap, k: k,
      cx: S / 2, cy: S / 2,
      circ: { x: 0, y: 0, w: S, h: S },
      ys: { x: S + gap, y: 0, w: cw - S - gap, h: S },        // 右側：y–t 圖
      xs: { x: 0, y: S + gap, w: S, h: Hb },                  // 下方：x–t 圖
      corner: { x: S + gap, y: S + gap, w: cw - S - gap, h: Hb },
      ballR: Math.max(7, Math.min(12, k * 0.14)),
      lw: narrow ? 2.4 : 3
    };
  }
  function X(x) { return L.cx + x * L.k; }
  function Y(y) { return L.cy - y * L.k; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.S + L.gap + L.Hb;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
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

  /** 不變的圖層：三個區域的底色、圓周區的格線與座標軸（參數或主題改變時才重畫） */
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const edge = shade(base, colors.dark ? -0.35 : -0.045);
    // 圓周區：中心亮、四角暗的徑向暈影
    const C = L.circ;
    const rg = c.createRadialGradient(L.cx, L.cy, L.S * 0.1, L.cx, L.cy, L.S * 0.75);
    rg.addColorStop(0, colors.dark ? shade(base, 0.03) : base);
    rg.addColorStop(1, edge);
    c.fillStyle = rg;
    roundRect(c, C.x, C.y, C.w, C.h, 8);
    c.fill();
    // 兩個圖表區與角落：由上而下極淡的漸層
    [L.ys, L.xs, L.corner].forEach(function (R) {
      const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
      g.addColorStop(0, base);
      g.addColorStop(1, edge);
      c.fillStyle = g;
      roundRect(c, R.x, R.y, R.w, R.h, 8);
      c.fill();
    });
    // 細邊框
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    [C, L.ys, L.xs, L.corner].forEach(function (R) { roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8); c.stroke(); });

    // 圓周區格線：主格線每 1 m、次格線每 0.2 m
    c.save();
    roundRect(c, C.x, C.y, C.w, C.h, 8);
    c.clip();
    const px = function (v) { return Math.round(v) + 0.5; };
    const n = Math.ceil(VIEW_HALF / 0.2);
    [[0.04, false], [0.1, true]].forEach(function (lv) {
      c.strokeStyle = alpha(colors.text, lv[0] * (colors.dark ? 0.8 : 1));
      c.beginPath();
      for (let i = -n; i <= n; i++) {
        if (i === 0 || ((i % 5 === 0) !== lv[1])) continue;
        const d = i * 0.2;
        c.moveTo(px(X(d)), 0); c.lineTo(px(X(d)), L.S);
        c.moveTo(0, px(Y(d))); c.lineTo(L.S, px(Y(d)));
      }
      c.stroke();
    });
    // x、y 軸
    c.strokeStyle = alpha(colors.muted, 0.7);
    c.beginPath();
    c.moveTo(4, px(L.cy)); c.lineTo(L.S - 4, px(L.cy));
    c.moveTo(px(L.cx), 4); c.lineTo(px(L.cx), L.S - 4);
    c.stroke();
    // 刻度數字（每 1 m）
    c.font = '11px system-ui, sans-serif';
    c.fillStyle = alpha(colors.muted, 0.9);
    c.textAlign = 'center';
    c.textBaseline = 'top';
    [-2, -1, 1, 2].forEach(function (d) { c.fillText(num(d, 0), X(d), L.cy + 4); });
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    [-2, -1, 1, 2].forEach(function (d) { c.fillText(num(d, 0), L.cx + 5, Y(d)); });
    c.font = '600 12px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    c.textAlign = 'right';
    c.textBaseline = 'bottom';
    c.fillText('x (m)', L.S - 6, L.cy - 4);
    c.textBaseline = 'top';
    if (L.narrow) { c.textAlign = 'right'; c.fillText('y (m)', L.cx - 6, 6); }
    else { c.textAlign = 'left'; c.fillText('y (m)', L.cx + 6, 6); }
    c.restore();
  }

  // ---------- 繪圖工具 ----------
  /** 有半透明圓角底框的標籤；ctx.textAlign 決定水平對齊，垂直置中於 y */
  function pill(text, x, y, color, font, bgAlpha) {
    ctx.font = font || '600 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const m = ctx.measureText(text), tw = m.width;
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 15;
    const ph = fh + 3, pw = tw + 10;
    const al = ctx.textAlign;
    const bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - tw - 5 : x - 5;
    ctx.fillStyle = alpha(colors['canvas-bg'], bgAlpha == null ? 0.86 : bgAlpha);
    roundRect(ctx, bx, y - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 0.5);
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }

  /** 兩層線條的「管子」：底層粗而暗，上層細而亮、略偏上 */
  function tube(pts, w, base, light) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = base;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
    if (!light) return;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(0.8, w * 0.36);
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1] - w * 0.22); else ctx.moveTo(p[0], p[1] - w * 0.22); });
    ctx.stroke();
  }

  /**
   * 向量箭頭：箭身寬 lw，箭頭長約 4 倍箭身寬、兩側略帶弧度。
   * (x0, y0) 起點，(ux, uy) 單位方向（畫布座標），len 像素長度；broken 為 true 時在箭身畫截斷記號。
   */
  function arrow(x0, y0, ux, uy, len, lw, color, broken) {
    if (len < 1) return;
    const head = Math.min(4 * lw, len), hw = 1.7 * lw;
    const xt = x0 + ux * len, yt = y0 + uy * len;
    const xh = xt - ux * head, yh = yt - uy * head;
    const nx = -uy, ny = ux;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    if (len > head + 1) {
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(xh + ux * head * 0.3, yh + uy * head * 0.3); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(xt, yt);
    ctx.quadraticCurveTo(xt - ux * head * 0.45 + nx * hw * 0.35, yt - uy * head * 0.45 + ny * hw * 0.35, xh + nx * hw, yh + ny * hw);
    ctx.lineTo(xh + ux * head * 0.2, yh + uy * head * 0.2);
    ctx.lineTo(xh - nx * hw, yh - ny * hw);
    ctx.quadraticCurveTo(xt - ux * head * 0.45 - nx * hw * 0.35, yt - uy * head * 0.45 - ny * hw * 0.35, xt, yt);
    ctx.closePath();
    ctx.fill();
    if (broken) {
      // 截斷記號：箭身中段兩條斜線，中間挖空
      const mx = x0 + ux * len * 0.5, my = y0 + uy * len * 0.5, s = 2.2 * lw;
      ctx.strokeStyle = colors['canvas-bg'];
      ctx.lineWidth = lw + 2;
      ctx.beginPath(); ctx.moveTo(mx - ux * 2, my - uy * 2); ctx.lineTo(mx + ux * 2, my + uy * 2); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      [-3, 3].forEach(function (o) {
        const bx = mx + ux * o, by = my + uy * o;
        ctx.moveTo(bx - nx * s + ux * 2, by - ny * s + uy * 2);
        ctx.lineTo(bx + nx * s - ux * 2, by + ny * s - uy * 2);
      });
      ctx.stroke();
    }
  }

  /** 球體：亮點偏左上，邊緣加深，外加細亮邊 */
  function sphere(x, y, R, base) {
    // 桌面上的柔和接觸陰影
    const sh = ctx.createRadialGradient(x + R * 0.25, y + R * 0.45, R * 0.2, x + R * 0.25, y + R * 0.45, R * 1.5);
    sh.addColorStop(0, 'rgba(0,0,0,' + (colors.dark ? 0.45 : 0.24) + ')');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(x + R * 0.25, y + R * 0.45, R * 1.5, R * 1.25, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - R * 0.33, y - R * 0.35, R * 0.08, x, y, R);
    g.addColorStop(0, shade(base, 0.62));
    g.addColorStop(0.45, base);
    g.addColorStop(1, shade(base, -0.42));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(shade(base, 0.7), colors.dark ? 0.55 : 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, R - 0.5, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
  }

  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }

  // ---------- 時間視窗（x–t、y–t 圖） ----------
  function timeWindow() {
    const W = WINDOWS.find(function (w) { return w >= 2.2 * state.T; }) || WINDOWS[WINDOWS.length - 1];
    const tL = Math.max(0, state.t - 0.75 * W);
    return { W: W, tL: tL, tR: tL + W };
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function draw() {
    if (!L) return;
    const p = params(), s = now(), d = CC.derived(p), tw = timeWindow();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    drawStripY(p, s, tw, d);
    drawStripX(p, s, tw, d);
    drawCircle(p, s, d);
    drawGuides(s, tw);
    drawCorner(d);
    updateReadout(s, d);
  }

  /** 圓周區內的物件（裁切在區域內） */
  function drawCircle(p, s, d) {
    const C = L.circ, k = L.k, R = state.r * k;
    const cut = state.tCut != null;
    ctx.save();
    roundRect(ctx, C.x, C.y, C.w, C.h, 8);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 圓周軌道（虛線）
    ctx.strokeStyle = alpha(colors.accent, cut ? 0.3 : 0.55);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(L.cx, L.cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // 剪斷後：沿切線的預測直線（虛線）
    if (cut) {
      const c = CC.stateAt(p, state.tCut), sp = Math.hypot(c.vx, c.vy);
      ctx.strokeStyle = alpha(colors.pos, 0.45);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(X(c.x), Y(c.y));
      ctx.lineTo(X(c.x + c.vx / sp * 6), Y(c.y + c.vy / sp * 6));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 角度 θ：由 +x 軸量到半徑（繩子還在時）
    if (!cut) {
      const th = CC.wrapAngle(s.theta);
      const ar = Math.max(14, Math.min(R * 0.42, 30));
      ctx.strokeStyle = alpha(colors.text, 0.55);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(L.cx, L.cy, ar, 0, -th, true); ctx.stroke();
      // 扇形淡色填滿
      ctx.fillStyle = alpha(colors.accent, 0.1);
      ctx.beginPath(); ctx.moveTo(L.cx, L.cy); ctx.arc(L.cx, L.cy, ar, 0, -th, true); ctx.closePath(); ctx.fill();
      const mid = th / 2;
      // 圓很小時把標籤放到圓外，避免壓在軌道與小球上
      const lr = R < 70 ? R + (L.narrow ? 18 : 24) : ar + (L.narrow ? 16 : 20);
      ctx.textAlign = 'center';
      pill('θ = ' + num(th * 180 / Math.PI, 0) + '°', L.cx + lr * Math.cos(mid) + (L.narrow ? 6 : 10) * Math.cos(mid),
        L.cy - lr * Math.sin(mid), colors.text, '600 ' + (L.narrow ? 11 : 12) + 'px system-ui, sans-serif', 0.75);
    }

    // 漸淡的軌跡
    if (state.show.trail) {
      const span = Math.min(state.t, 0.65 * state.T), N = 48;
      if (span > 0) {
        let prev = null;
        for (let i = 0; i <= N; i++) {
          const tt = state.t - span + span * i / N;
          const q = CC.motionAt(p, tt, state.tCut), pt = [X(q.x), Y(q.y)];
          if (prev) {
            const u = i / N;
            ctx.strokeStyle = alpha(colors.accent, 0.08 + 0.62 * u * u);
            ctx.lineWidth = 1 + 3.5 * u;
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
          }
          prev = pt;
        }
      }
    }

    // 等時距標記：每 T/12 一點；剪斷後在直線上的點全部保留
    if (state.show.dots) {
      const dt = state.T / 12, keep = 1.2 * state.T;
      const k0 = Math.max(0, Math.ceil((state.t - keep) / dt - 1e-9));
      let k1 = Math.floor(state.t / dt + 1e-9);
      let first = k0;
      if (cut) first = Math.min(k0, Math.max(0, Math.ceil(state.tCut / dt - 1e-9)));
      ctx.lineWidth = 1.3;
      for (let i = first; i <= k1; i++) {
        const tt = i * dt;
        if (tt > state.t) break;
        const onLine = cut && tt > state.tCut;
        const age = (state.t - tt) / keep;
        if (!onLine && age > 1) continue;
        const q = CC.motionAt(p, tt, state.tCut);
        const a = onLine ? 0.9 : 0.15 + 0.7 * (1 - age);
        ctx.fillStyle = alpha(colors['canvas-bg'], a);
        ctx.strokeStyle = alpha(onLine ? colors.pos : colors.accent, a);
        ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

    // 中心的釘子
    const pinR = Math.max(4, L.ballR * 0.5);

    // 繩子（管狀）
    const bx = X(s.x), by = Y(s.y);
    const ropeBase = shade(colors.muted, colors.dark ? 0.05 : -0.1), ropeLight = shade(colors.muted, colors.dark ? 0.55 : 0.5);
    if (!cut) {
      tube([[L.cx, L.cy], [bx, by]], 2.4, ropeBase, ropeLight);
      // 半徑標籤 r：放在繩子中點、偏向軌跡那一側
      const ux = (bx - L.cx) / R, uy = (by - L.cy) / R;
      const ox = uy, oy = -ux; // 順時針側（軌跡在後方）
      ctx.textAlign = 'center';
      if (R > 34) pill('r', L.cx + ux * R * 0.3 + ox * 11, L.cy + uy * R * 0.3 + oy * 11, colors.muted, 'italic 600 12px system-ui, sans-serif', 0.7);
    } else {
      // 剪斷後：釘子上留一段鬆垂的繩頭，小球上也帶一小段
      const c = CC.stateAt(p, state.tCut);
      const ux = c.x / state.r, uy = c.y / state.r;
      const len = Math.min(R * 0.38, 40);
      const ex = L.cx + ux * len, ey = L.cy - uy * len;
      ctx.lineCap = 'round';
      ctx.strokeStyle = ropeBase;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(L.cx, L.cy);
      ctx.quadraticCurveTo(L.cx + ux * len * 0.6 - uy * 6, L.cy - uy * len * 0.6 - ux * 6, ex - uy * 3, ey - ux * 3);
      ctx.stroke();
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const tx = -s.vx / sp, ty = s.vy / sp; // 畫布座標中與運動方向相反
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + tx * 8 + ty * 3, by + ty * 8 - tx * 3, bx + tx * 13 + ty * 1, by + ty * 13 - tx * 1);
      ctx.stroke();
    }
    // 釘子：金屬感的小球
    const pg = ctx.createRadialGradient(L.cx - pinR * 0.35, L.cy - pinR * 0.35, pinR * 0.1, L.cx, L.cy, pinR);
    pg.addColorStop(0, shade(colors.field, colors.dark ? 0.4 : 0.6));
    pg.addColorStop(1, shade(colors.field, colors.dark ? -0.35 : -0.1));
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(L.cx, L.cy, pinR, 0, Math.PI * 2); ctx.fill();

    // 投影：小球在 x 軸、y 軸上的影子（做簡諧運動）
    if (state.show.proj) {
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = alpha(colors.equi, 0.7);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, L.cy); ctx.stroke();
      ctx.strokeStyle = alpha(colors['b-optics'], 0.7);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(L.cx, by); ctx.stroke();
      ctx.setLineDash([]);
      diamond(bx, L.cy, 5, colors.equi);
      diamond(L.cx, by, 5, colors['b-optics']);
    }

    // 向量：速度（切線）、加速度與合力（指向圓心）
    const lw = L.lw;
    const labelFont = '700 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif';
    const vecs = [];
    if (state.show.v) {
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 0) vecs.push({ ux: s.vx / sp, uy: -s.vy / sp, mag: sp * SCALE_V, color: colors.pos, label: 'v', off: 0, at: 'tip' });
    }
    const am = Math.hypot(s.ax, s.ay);
    const both = state.show.a && state.show.f;
    if (am > 0) {
      const ux = s.ax / am, uy = -s.ay / am;
      // a 的標籤放在箭身中段、速度那一側；F 的標籤放在箭頭尖端外
      if (state.show.a) vecs.push({ ux: ux, uy: uy, mag: am * SCALE_A, color: colors.neg, label: 'a', off: both ? -lw * 1.6 : 0, at: 'side' });
      if (state.show.f) vecs.push({ ux: ux, uy: uy, mag: state.m * am * SCALE_F, color: colors['b-mech'], label: 'F', off: both ? lw * 1.6 : 0, at: 'tip' });
    }
    vecs.forEach(function (v) {
      const over = v.mag > MAX_ARROW;
      const len = Math.min(v.mag, MAX_ARROW) * k;
      const nx = -v.uy, ny = v.ux;
      const x0 = bx + nx * v.off, y0 = by + ny * v.off;
      // 箭頭從球的邊緣附近開始，避免被球蓋住
      arrow(x0, y0, v.ux, v.uy, len, lw, v.color, over);
      let lx, ly;
      if (v.at === 'side') {
        // 速度方向（畫布座標）那一側
        const sp = Math.hypot(s.vx, s.vy) || 1, sx = s.vx / sp, sy = -s.vy / sp;
        const sg = v.off ? (v.off > 0 ? 1 : -1) : (nx * sx + ny * sy >= 0 ? 1 : -1); // 兩支箭頭並列時，標籤放在自己那一側
        const along = Math.max(len * 0.5, L.ballR + 8);
        lx = x0 + v.ux * along + nx * sg * 13; ly = y0 + v.uy * along + ny * sg * 13;
      } else {
        lx = x0 + v.ux * (len + 11) + nx * v.off * 2.5; ly = y0 + v.uy * (len + 11) + ny * v.off * 2.5;
      }
      ctx.textAlign = 'center';
      pill(v.label + (over ? ' ≈' : ''), lx, ly, v.color, labelFont, 0.8);
    });

    // 小球
    sphere(bx, by, L.ballR, colors.accent);

    // 純裝飾：每轉一圈的波紋、剪斷瞬間的火花
    drawEffects();

    // 文字：時間、慢動作、狀態
    ctx.textAlign = 'left';
    const f1 = '600 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif';
    const f2 = (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    // 桌機：時間在左上、剪斷提示在左下；手機：全部疊在左下（上方留給座標軸名稱）
    const lines = [{ text: 't = ' + num(state.t, 2) + ' s', color: colors.text, font: f1 }];
    if (state.slow) lines.push({ text: T('慢動作 ', 'Slow motion ') + SLOW + '×', color: colors.accent, font: f2 });
    const cutLine = cut ? { text: T('繩已剪斷：F = 0', 'String cut: F = 0'), color: colors.pos, font: f1 } : null;
    const step = L.narrow ? 19 : 22;
    if (L.narrow) {
      // 手機畫面小：只留一行時間（含慢動作倍率），剪斷的說明交給下方狀態列
      pill('t = ' + num(state.t, 2) + ' s' + (state.slow ? '  (' + SLOW + '×)' : ''), 10, C.h - 13, colors.text, f1, 0.8);
    } else {
      lines.forEach(function (ln, i) { pill(ln.text, 10, 14 + i * step, ln.color, ln.font, 0.8); });
      if (cutLine) pill(cutLine.text, 10, C.h - 14, cutLine.color, cutLine.font, 0.85);
      ctx.textAlign = 'right';
      pill(T('俯視圖', 'Top view'), C.w - 10, 14, colors.muted, f2, 0.7);
    }
    ctx.restore();
  }

  function diamond(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  function drawEffects() {
    const tNow = performance.now();
    state.fx = state.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const u = (tNow - e.t0) / e.dur;
      if (e.type === 'ring') {
        ctx.strokeStyle = alpha(colors.accent, 0.55 * (1 - u));
        ctx.lineWidth = 2 * (1 - u) + 0.5;
        ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), L.ballR + 3 + 16 * u, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'snap') {
        const cx = X(e.x), cy = Y(e.y);
        ctx.strokeStyle = alpha(colors.pos, 0.8 * (1 - u));
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const a = e.a0 + i * Math.PI * 2 / 7;
          const r0 = 4 + 10 * u, r1 = 9 + 20 * u;
          ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
          ctx.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
        }
        ctx.stroke();
      }
    });
  }

  /** 從小球拉到兩張圖目前位置的投影虛線 */
  function drawGuides(s, tw) {
    if (!state.show.proj) return;
    const bx = X(s.x), by = Y(s.y);
    const inside = Math.abs(s.x) < VIEW_HALF && Math.abs(s.y) < VIEW_HALF;
    if (!inside) return;
    ctx.save();
    ctx.setLineDash([2, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(colors['b-optics'], 0.45);
    ctx.beginPath(); ctx.moveTo(bx + L.ballR + 2, by); ctx.lineTo(tX(state.t, tw), by); ctx.stroke();
    ctx.strokeStyle = alpha(colors.equi, 0.5);
    ctx.beginPath(); ctx.moveTo(bx, by + L.ballR + 2); ctx.lineTo(bx, tY(state.t, tw)); ctx.stroke();
    ctx.restore();
  }

  // y–t 圖：時間向右；縱軸與圓周區相同比例
  function stripYPad() { return { l: 10, r: 12 }; }
  function tX(t, tw) {
    const R = L.ys, pd = stripYPad();
    return R.x + pd.l + (t - tw.tL) / tw.W * (R.w - pd.l - pd.r);
  }
  // x–t 圖：時間向下；橫軸與圓周區相同比例
  function stripXPad() { return { t: L.narrow ? 22 : 26, b: 10 }; }
  function tY(t, tw) {
    const R = L.xs, pd = stripXPad();
    return R.y + pd.t + (t - tw.tL) / tw.W * (R.h - pd.t - pd.b);
  }

  /** 沿時間取樣曲線點，分成「已發生」與「預測」兩段 */
  function sampleCurve(p, tw, map, n) {
    const past = [], fut = [];
    for (let i = 0; i <= n; i++) {
      const tt = tw.tL + tw.W * i / n;
      const q = CC.motionAt(p, tt, state.tCut);
      const pt = map(tt, q);
      if (tt <= state.t) past.push(pt);
      else {
        if (!fut.length && past.length) {
          const q0 = CC.motionAt(p, state.t, state.tCut);
          const p0 = map(state.t, q0);
          past.push(p0); fut.push(p0);
        }
        fut.push(pt);
      }
    }
    return { past: past, fut: fut };
  }

  function timeTicks(tw, maxN) {
    const step = niceStep(tw.W / maxN);
    const out = [];
    for (let t = Math.ceil(tw.tL / step - 1e-9) * step; t <= tw.tR + 1e-9; t += step) out.push(t);
    return { step: step, list: out };
  }

  function drawStripY(p, s, tw, d) {
    const R = L.ys, col = colors['b-optics'];
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, 8);
    ctx.clip();
    const px = function (v) { return Math.round(v) + 0.5; };
    // 時間格線
    const tk = timeTicks(tw, L.narrow ? 2 : 5);
    ctx.strokeStyle = alpha(colors.text, 0.07);
    ctx.lineWidth = 1;
    ctx.beginPath();
    tk.list.forEach(function (t) { ctx.moveTo(px(tX(t, tw)), R.y + 4); ctx.lineTo(px(tX(t, tw)), R.y + R.h - 4); });
    ctx.stroke();
    // y = 0 與 ±r
    ctx.strokeStyle = alpha(colors.muted, 0.7);
    ctx.beginPath(); ctx.moveTo(R.x + 4, px(L.cy)); ctx.lineTo(R.x + R.w - 4, px(L.cy)); ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = alpha(colors.muted, 0.45);
    ctx.beginPath();
    [state.r, -state.r].forEach(function (y) { ctx.moveTo(R.x + 4, px(Y(y))); ctx.lineTo(R.x + R.w - 4, px(Y(y))); });
    ctx.stroke();
    ctx.setLineDash([]);

    // 週期括號：兩個相鄰最高點之間
    if (state.tCut == null) {
      const w = CC.omegaOf(p);
      const kk = Math.ceil(((tw.tL * w + p.theta0) - Math.PI / 2) / (2 * Math.PI) - 1e-9);
      const t1 = (Math.PI / 2 + 2 * Math.PI * kk - p.theta0) / w, t2 = t1 + state.T;
      if (t2 <= tw.tR) {
        const x1 = tX(t1, tw), x2 = tX(t2, tw);
        const yb = Math.max(R.y + 10, Y(state.r) - 8);
        ctx.strokeStyle = alpha(colors.text, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, yb + 4); ctx.lineTo(x1, yb - 4); ctx.moveTo(x2, yb + 4); ctx.lineTo(x2, yb - 4);
        ctx.moveTo(x1, yb); ctx.lineTo(x2, yb);
        ctx.stroke();
        ctx.textAlign = 'center';
        if (x2 - x1 > 22) pill('T', (x1 + x2) / 2, yb, colors.text, 'italic 600 12px system-ui, sans-serif', 0.9);
      }
    }

    // y(t) 曲線
    const n = Math.max(60, Math.round(R.w / 2));
    const c = sampleCurve(p, tw, function (t, q) { return [tX(t, tw), Y(q.y)]; }, n);
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = alpha(col, 0.38);
    ctx.lineWidth = 1.3;
    ctx.beginPath(); c.fut.forEach(function (pt, i) { if (i) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]); }); ctx.stroke();
    ctx.setLineDash([]);
    if (c.past.length > 1) tube(c.past, L.narrow ? 2.4 : 3, shade(col, colors.dark ? -0.1 : -0.12), alpha(shade(col, 0.55), 0.8));
    // 目前位置
    const cx = tX(state.t, tw), cy = Y(s.y);
    if (cy > R.y - 10 && cy < R.y + R.h + 10) sphereSmall(cx, cy, col);

    // 標題與刻度
    const f = (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    pill(T('y–t 圖', 'y–t graph'), R.x + 8, R.y + 13, col, '700 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.85);
    ctx.textAlign = 'right';
    pill('+r', R.x + R.w - 6, Y(state.r) + (Y(state.r) - R.y < 30 ? 9 : -9), colors.muted, f, 0.6);
    pill('−r', R.x + R.w - 6, Y(-state.r) + 9 > R.y + R.h - 22 ? Y(-state.r) - 9 : Y(-state.r) + 9, colors.muted, f, 0.6);
    ctx.textAlign = 'right';
    const tl = pill('t (s) →', R.x + R.w - 5, R.y + R.h - 11, colors.muted, '600 ' + f, 0.75);
    ctx.textAlign = 'center';
    const dec = tk.step < 1 ? 1 : 0;
    ctx.font = f;
    tk.list.forEach(function (t) {
      const x = tX(t, tw), hw = ctx.measureText(num(t, dec)).width / 2 + 6;
      if (x - hw < R.x + 4 || x + hw > tl.x - 2) return;
      pill(num(t, dec), x, R.y + R.h - 11, colors.muted, f, 0.6);
    });
    ctx.restore();
  }

  function drawStripX(p, s, tw, d) {
    const R = L.xs, col = colors.equi;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, 8);
    ctx.clip();
    const px = function (v) { return Math.round(v) + 0.5; };
    const tk = timeTicks(tw, 4);
    ctx.strokeStyle = alpha(colors.text, 0.07);
    ctx.lineWidth = 1;
    ctx.beginPath();
    tk.list.forEach(function (t) { ctx.moveTo(R.x + 4, px(tY(t, tw))); ctx.lineTo(R.x + R.w - 4, px(tY(t, tw))); });
    ctx.stroke();
    ctx.strokeStyle = alpha(colors.muted, 0.7);
    ctx.beginPath(); ctx.moveTo(px(L.cx), R.y + 4); ctx.lineTo(px(L.cx), R.y + R.h - 4); ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = alpha(colors.muted, 0.45);
    ctx.beginPath();
    [state.r, -state.r].forEach(function (x) { ctx.moveTo(px(X(x)), R.y + 4); ctx.lineTo(px(X(x)), R.y + R.h - 4); });
    ctx.stroke();
    ctx.setLineDash([]);

    const n = Math.max(50, Math.round(R.h / 2));
    const c = sampleCurve(p, tw, function (t, q) { return [X(q.x), tY(t, tw)]; }, n);
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = alpha(col, 0.4);
    ctx.lineWidth = 1.3;
    ctx.beginPath(); c.fut.forEach(function (pt, i) { if (i) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]); }); ctx.stroke();
    ctx.setLineDash([]);
    if (c.past.length > 1) tube(c.past, L.narrow ? 2.4 : 3, shade(col, colors.dark ? -0.1 : -0.12), alpha(shade(col, 0.55), 0.8));
    const cx = X(s.x), cy = tY(state.t, tw);
    if (cx > R.x - 10 && cx < R.x + R.w + 10) sphereSmall(cx, cy, col);

    const f = (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    pill(T('x–t 圖', 'x–t graph'), R.x + 8, R.y + 12, col, '700 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.85);
    ctx.textAlign = 'right';
    pill('t (s) ↓', R.x + R.w - 5, R.y + 12, colors.muted, '600 ' + f, 0.75);
    ctx.textAlign = 'left';
    const dec = tk.step < 1 ? 1 : 0;
    tk.list.forEach(function (t) {
      const y = tY(t, tw);
      if (y < R.y + 26 || y > R.y + R.h - 8) return;
      pill(num(t, dec), R.x + 6, y, colors.muted, f, 0.6);
    });
    ctx.restore();
  }

  function sphereSmall(x, y, col) {
    const r = L.narrow ? 4.5 : 5.5;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, shade(col, 0.6));
    g.addColorStop(1, shade(col, -0.3));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  /** 右下角：箭頭比例尺（與畫面上的箭頭同一比例） */
  function drawCorner(d) {
    const R = L.corner;
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, 8);
    ctx.clip();
    const fT = '700 ' + (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    const f = '600 ' + (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = fT;
    ctx.fillStyle = colors.muted;
    ctx.fillText(T('箭頭比例', 'Arrow scale'), R.x + 10, R.y + 13);
    const rows = [
      { scale: SCALE_V, cands: [0.5, 1, 2, 5], unit: 'm/s', color: colors.pos, label: 'v' },
      { scale: SCALE_A, cands: [1, 2, 5, 10, 20], unit: 'm/s²', color: colors.neg, label: 'a' },
      { scale: SCALE_F, cands: [0.5, 1, 2, 5, 10], unit: 'N', color: colors['b-mech'], label: 'F' }
    ];
    ctx.font = f;
    const textW = ctx.measureText('a 20 m/s²').width;
    const maxLen = Math.max(16, Math.min(70, R.w - 26 - textW));
    const rowH = Math.min(26, (R.h - 26) / 3);
    rows.forEach(function (row, i) {
      let v = row.cands[0];
      row.cands.forEach(function (c) { if (c * row.scale * L.k <= maxLen) v = c; });
      const len = v * row.scale * L.k;
      const y = R.y + 28 + rowH * (i + 0.5);
      arrow(R.x + 12, y, 1, 0, len, Math.max(2, L.lw - 0.6), row.color, false);
      ctx.font = f;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = row.color;
      ctx.fillText(row.label + ' ' + num(v, v < 1 ? 1 : 0) + ' ' + row.unit, R.x + 18 + len, y);
    });
    // 空間足夠時（桌機）列出目前的大小，方便與箭頭比較
    const y0 = R.y + 28 + rowH * 3 + 14;
    if (R.y + R.h - y0 > 76) {
      const s = now(), cut = state.tCut != null;
      const sp = Math.hypot(s.vx, s.vy), am = Math.hypot(s.ax, s.ay);
      ctx.strokeStyle = alpha(colors.text, 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(R.x + 10, Math.round(y0 - 8) + 0.5); ctx.lineTo(R.x + R.w - 10, Math.round(y0 - 8) + 0.5); ctx.stroke();
      ctx.font = fT;
      ctx.fillStyle = colors.muted;
      ctx.fillText(T('目前的大小', 'Current magnitudes'), R.x + 10, y0 + 6);
      const items = [
        ['|v| = ' + num(sp, 2) + ' m/s', colors.pos],
        ['|a| = ' + num(am, 2) + ' m/s²' + (cut ? '' : '  (v²/r = ' + num(d.v * d.v / d.r, 2) + ')'), colors.neg],
        ['|F| = ' + num(state.m * am, 2) + ' N', colors['b-mech']]
      ];
      ctx.font = f;
      items.forEach(function (it, i) {
        ctx.fillStyle = it[1];
        ctx.fillText(it[0], R.x + 12, y0 + 26 + i * 20);
      });
    }
    ctx.restore();
  }

  // ---------- 讀數 ----------
  const lastText = {};
  function setHTML(id, html) {
    if (lastText[id] === html) return;
    lastText[id] = html;
    $(id).innerHTML = html;
  }
  function updateReadout(s, d) {
    const MS2 = ' m/s<sup>2</sup>';
    setHTML('dV', num(d.v, 2) + ' m/s');
    setHTML('dT', num(d.T, 2) + ' s');
    setHTML('dW', num(d.omega, 2) + ' rad/s');
    setHTML('dF', num(d.f, 3) + ' Hz');
    setHTML('dA', num(d.a, 2) + MS2 + '<small>ω<sup>2</sup>r = ' + num(d.omega * d.omega * d.r, 2) + MS2 + '</small>');
    setHTML('dFc', num(d.F, 2) + ' N<small>= ma = ' + num(d.m, 2) + ' kg × ' + num(d.a, 2) + MS2 + '</small>');
    const cut = state.tCut != null;
    const th = CC.wrapAngle(s.theta);
    setHTML('rt', num(state.t, 2) + ' s');
    setHTML('rth', cut ? T('—（繩已剪斷）', '— (string cut)')
      : num(th * 180 / Math.PI, 1) + '°<small>= ' + num(th, 2) + ' rad</small>');
    setHTML('rn', num(CC.turns(params(), cut ? state.tCut : state.t), 2) + T(' 圈', ' rev'));
    setHTML('rx', num(s.x, 2) + ' m');
    setHTML('ry', num(s.y, 2) + ' m');
    setHTML('rv', num(Math.hypot(s.vx, s.vy), 2) + ' m/s');
    setHTML('ra', num(Math.hypot(s.ax, s.ay), 2) + MS2);
    setHTML('rd', num(Math.hypot(s.x, s.y), 2) + ' m');
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  let lastTickAt = -1;
  /** 每轉一圈的輕「嗒」聲：短促的高音加一點點擊感（主要頻率都在 250 Hz 以上） */
  function tickSound() {
    const S = sound(); if (!S) return;
    const tNow = performance.now();
    if (tNow - lastTickAt < 90) return; // 週期很短時避免連成一串
    lastTickAt = tNow;
    S.tone({ freq: 1250, dur: 0.035, type: 'sine', gain: 0.45 });
    S.tone({ freq: 625, dur: 0.05, type: 'triangle', gain: 0.25 });
    S.noise({ dur: 0.015, gain: 0.12, filter: 3500, q: 1.2 });
  }
  /** 剪斷繩子的「啪」聲：明亮的短噪音＋快速下滑的繃弦聲 */
  function snapSound() {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.05, gain: 0.85, filter: 2600, q: 0.9 });
    S.sweep({ from: 1500, to: 420, dur: 0.09, type: 'triangle', gain: 0.55 });
    S.tone({ freq: 330, dur: 0.12, type: 'sine', gain: 0.3, delay: 0.01 });
  }

  // ---------- 任務模式（missions.js）：回報物理量 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  /** 目前的運動條件與公式計算結果（r m、T s、m kg、v m/s、ω rad/s、f Hz、a m/s²、F N） */
  function setting() {
    const d = CC.derived(params());
    return { r: d.r, T: d.T, m: d.m, v: d.v, omega: d.omega, f: d.f, a: d.a, F: d.F, hold: state.hold };
  }
  function sameSetting(a, b) { return !!(a && b) && a.r === b.r && a.T === b.T && a.m === b.m && a.hold === b.hold; }
  let committed = null; // 上一次回報的設定（一開始是預設值）
  /** 使用者放開滑桿、打完數字或切換「保持不變的量」之後，回報新的設定（附上前一個設定 prev） */
  function emitParams() {
    const cur = setting();
    if (sameSetting(cur, committed)) return;
    const prev = committed;
    committed = cur;
    emit('params', Object.assign({ prev: prev }, cur));
  }
  /** 剪斷瞬間的資料：剪斷角 theta（度，由 +x 軸逆時針，[0, 360)）、位置與速度 */
  function cutData() {
    const c = CC.stateAt(params(), state.tCut);
    let th = CC.wrapAngle(c.theta) * 180 / Math.PI;
    if (th >= 360) th -= 360;
    return Object.assign(setting(), { theta0: state.theta0, tCut: state.tCut, theta: th, xc: c.x, yc: c.y, vx: c.vx, vy: c.vy });
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function tick(tNow) {
    if (!state.running) { loopOn = false; return; }
    const dt = Math.min((tNow - lastT) / 1000, 1 / 30) * (state.slow ? SLOW : 1);
    lastT = tNow;
    const p = params(), t0 = state.t;
    state.t = t0 + dt;
    if (state.tCut == null) {
      // 通過基準線 θ = 0（+x 軸）時：每轉一圈一聲，加一個淡淡的波紋
      if (CC.turnsBetween(p, t0, state.t) > 0) {
        tickSound();
        if (!reducedMotion) state.fx.push({ type: 'ring', x: state.r, y: 0, t0: tNow, dur: 420 });
      }
      // 任務：從上次改條件（或接回繩子）起，不間斷地轉滿一圈、兩圈……
      const n0 = Math.floor(CC.turns(p, t0) + 1e-9), n1 = Math.floor(CC.turns(p, state.t) + 1e-9);
      if (n1 > n0) emit('lap', Object.assign(setting(), { n: n1 }));
    } else {
      const s = now(), out = VIEW_HALF + L.ballR / L.k + 0.05;
      if (Math.abs(s.x) > out || Math.abs(s.y) > out) {
        state.running = false;
        state.ended = true;
        setStatus(T('小球沿切線以等速直線飛出畫面（牛頓第一定律）。按「接回繩子」重新開始。',
          'The ball flew off along the tangent in a straight line at constant speed (Newton’s first law). Press “Reattach the string” to start again.'));
        emit('exit', Object.assign(cutData(), { tau: state.t - state.tCut, x: s.x, y: s.y }));
      }
    }
    updateButtons();
    draw();
    if (state.running) requestAnimationFrame(tick); else loopOn = false;
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    $('play').textContent = state.running ? T('暫停', 'Pause') : state.t > 0 && !state.ended ? T('繼續', 'Resume') : T('播放', 'Play');
    const cut = state.tCut != null;
    $('cut').textContent = cut ? T('接回繩子', 'Reattach the string') : T('剪斷繩子', 'Cut the string');
    $('cut').classList.toggle('cut-on', !cut);
  }

  function reattach(play) {
    state.tCut = null;
    state.theta0 = 0;
    state.t = 0;
    state.ended = false;
    state.fx = [];
    state.running = play;
    setStatus('');
    updateButtons();
    if (play) startLoop();
    requestDraw();
  }

  $('play').addEventListener('click', function () {
    if (state.running) {
      state.running = false;
      updateButtons();
      requestDraw();
      // 任務：暫停瞬間的狀態（繩子還在：角位置與投影的加速度；已剪斷：剪斷後經過的時間 tau 與離圓心的距離 d）
      const s = now(), cut = state.tCut != null;
      let th = NaN;
      if (!cut) { th = CC.wrapAngle(s.theta) * 180 / Math.PI; if (th >= 360) th -= 360; }
      emit('pause', Object.assign(setting(), {
        attached: !cut, t: state.t, theta: th, x: s.x, y: s.y, vx: s.vx, vy: s.vy, ax: s.ax, ay: s.ay,
        d: Math.hypot(s.x, s.y), tau: cut ? state.t - state.tCut : 0
      }));
      return;
    }
    if (state.ended) { reattach(true); return; }
    state.running = true;
    setStatus('');
    updateButtons();
    startLoop();
  });

  $('cut').addEventListener('click', function () {
    if (state.tCut != null) { reattach(true); return; }
    const s = now();
    state.tCut = state.t;
    snapSound();
    if (!reducedMotion) state.fx.push({ type: 'snap', x: s.x, y: s.y, t0: performance.now(), dur: 380, a0: Math.random() * Math.PI });
    setStatus(T('繩子剪斷了！合力變成零，小球保持剪斷瞬間的速度前進。', 'The string is cut! The net force is now zero, so the ball keeps the velocity it had at that instant.'));
    state.running = true; // 剪斷後自動播放，看小球飛出
    updateButtons();
    startLoop();
    requestDraw();
    emit('cut', cutData());
  });

  // 全部清除：清掉軌跡、x–t／y–t 圖與剪斷後的路徑，回到 t = 0（滑桿設定不變）
  $('reset').addEventListener('click', function () {
    reattach(false);
    setStatus(T('已全部清除，滑桿設定不變。按「播放」開始。', 'Everything is cleared; the slider settings are kept. Press “Play” to start.'));
  });

  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; requestDraw(); });

  [['showV', 'v'], ['showA', 'a'], ['showF', 'f'], ['showTrail', 'trail'], ['showDots', 'dots'], ['showProj', 'proj']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
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

  // ---------- 滑桿 ----------
  const elR = $('r'), elT = $('T'), elV = $('v'), elM = $('m');
  function showOut(el, unit) { $(el.id + 'o').textContent = fmtSlider(val(el), el) + ' ' + unit; }

  /**
   * 條件改變：繩子還在時保留小球目前的角位置，時間從 0 重新計算；
   * 已剪斷時直接接回繩子（從 θ = 0 開始）。
   */
  function paramsChanged(update) {
    const thNow = CC.angleAt(params(), state.t);
    update();
    if (state.tCut != null) {
      state.tCut = null;
      state.theta0 = 0;
      state.ended = false;
      setStatus('');
    } else {
      state.theta0 = CC.wrapAngle(thNow);
    }
    state.t = 0;
    state.fx = [];
    updateButtons();
    requestDraw();
  }

  function readSliders() {
    state.r = val(elR);
    state.m = val(elM);
    if (state.hold === 'T') state.T = val(elT);
    else state.T = CC.periodFromSpeed(state.r, val(elV));
  }
  function refreshOutputs() {
    showOut(elR, 'm');
    showOut(elT, 's');
    showOut(elV, 'm/s');
    showOut(elM, 'kg');
  }

  [elR, elT, elV, elM].forEach(function (el) {
    el.addEventListener('input', function () {
      refreshOutputs();
      if ((el === elT && state.hold !== 'T') || (el === elV && state.hold !== 'v')) return;
      paramsChanged(readSliders);
    });
    // 任務：放開滑桿或打完數字（拖曳途中經過的值不算）
    el.addEventListener('change', function () { emitParams(); });
  });

  function setHold(h) {
    if (h === state.hold) return;
    state.hold = h;
    $('holdT').setAttribute('aria-pressed', String(h === 'T'));
    $('holdV').setAttribute('aria-pressed', String(h === 'v'));
    $('boxT').hidden = h !== 'T';
    $('boxV').hidden = h !== 'v';
    // 把目前的值帶到另一個滑桿（超出範圍時會被限制在範圍內）
    const target = h === 'T' ? state.T : CC.speedFromPeriod(state.r, state.T);
    const el = h === 'T' ? elT : elV;
    if (window.LabNum) window.LabNum.set(el, target); // 會觸發 input 事件 → paramsChanged
    else { el.value = target; el.dispatchEvent(new Event('input')); }
    emitParams();
  }
  $('holdT').addEventListener('click', function () { setHold('T'); });
  $('holdV').addEventListener('click', function () { setHold('v'); });

  // ---------- 啟動 ----------
  readColors();
  readSliders();
  committed = setting();
  refreshOutputs();
  updateButtons();
  function themeChanged() { readColors(); if (L) buildBackground(); requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  window.addEventListener('resize', function () { resize(); });
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
  if (state.running) startLoop();
})();
