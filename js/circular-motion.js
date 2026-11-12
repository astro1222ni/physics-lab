/* circular-motion.js — 「等速圓周運動」模組的畫面與互動（物理計算在 circular-motion-core.js；共用繪圖工具 LabDraw 在 drawkit.js） */
(function () {
  'use strict';
  const CC = window.CircularCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
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

  // ---------- 色彩（lab.css 代號；明暗、透明度用 LabDraw 的 alpha／shade／mix 調整） ----------
  let colors = {}, colorsVer = 0;
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--grid', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--b-mech', '--b-optics']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = D.dark;
    colorsVer++;
  }
  /** 畫布字型（settings.js 會依字體大小設定自動放大 px） */
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  /** settings.js 的畫布字體倍率（上標位移要跟著放大） */
  function fsk() {
    const f = window.LabSettings ? +window.LabSettings.get('fs') || 1 : 1;
    return 1 + (f - 1) * 0.7;
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
  const RAD = 9; // 面板圓角

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

  // ---------- 繪圖小工具 ----------
  /** 線條對齊物理像素（1 物理像素寬的線不糊） */
  function snapPx(v) { return (Math.round(v * dpr) + 0.5) / dpr; }
  function clipPanel(c, R) { D.roundRect(c, R.x, R.y, R.w, R.h, RAD); c.clip(); }
  function polyPath(c, pts) { pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); }
  /** 兩級格線的透明度（與 LabDraw.grid 相同） */
  function gridAlpha(major) { return colors.dark ? (major ? 0.11 : 0.05) : (major ? 0.1 : 0.04); }
  /** 圓角底框標籤（LabDraw.pill），垂直置中於 yc；align：left／center／right */
  function tag(c, text, x, yc, color, align, font) {
    c.font = font;
    const h = D.textHeight(c.measureText(text), 15) + 3;
    return D.pill(c, text, x, yc + h / 2, color, align, font);
  }
  function pillSize(c, text, font) {
    c.font = font;
    const m = c.measureText(text);
    return { w: m.width + 12, h: D.textHeight(m, 15) + 3 };
  }
  /**
   * 一行混合字型的文字（斜體的物理量、上標），垂直置中於 y，帶背景色描邊。
   * parts：[{ t, it（斜體）, sup（上標）}]；傳回總寬度。
   */
  function runs(c, parts, x, y, color, px, weight) {
    const k = fsk();
    let xx = x;
    parts.forEach(function (pt) {
      if (!pt) return;
      const f = fnt(pt.sup ? +(px * 0.72).toFixed(1) : px, weight, pt.it);
      c.font = f;
      const w = c.measureText(pt.t).width;
      D.haloText(c, pt.t, xx, pt.sup ? y - px * k * 0.32 : y, color, 'left', 'middle', f);
      xx += w + (pt.it ? 1 : 0.3);
    });
    return xx - x;
  }
  /** 座標軸末端的小箭頭（尖端在 (x, y)，方向 (ux, uy)） */
  function axisHead(c, x, y, ux, uy) {
    const l = 7, h = 3.4, nx = -uy, ny = ux;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - ux * l + nx * h, y - uy * l + ny * h);
    c.quadraticCurveTo(x - ux * l * 0.7, y - uy * l * 0.7, x - ux * l - nx * h, y - uy * l - ny * h);
    c.closePath();
    c.fill();
  }

  /**
   * 由亮到暗的漸層色標：亮部用白色、暗部用陰影色，各自只改透明度。
   * （畫布漸層不以預乘透明度內插，白色直接漸變到深色會在中間混出一片灰。）
   */
  function lightToShade(g, hi, lo, mid) {
    g.addColorStop(0, 'rgba(255,255,255,' + hi + ')');
    g.addColorStop(mid, 'rgba(255,255,255,0)');
    g.addColorStop(mid, D.shadowInk(0));
    g.addColorStop(1, D.shadowInk(lo));
  }

  // ---------- 不變的圖層（尺寸、主題或半徑改變時才重畫） ----------
  let bgKey = '';
  function bgKeyNow() { return [cw, ch, dpr, colorsVer, D.ver, state.r].join('|'); }

  /** 圖表區：與圓周區同一比例的空間格線（y–t 圖畫水平線、x–t 圖畫垂直線），每 0.2 m 一條、每 1 m 較明顯 */
  function spaceLines(c, R, dir) {
    const n = Math.ceil(VIEW_HALF / 0.2) + 1;
    [false, true].forEach(function (major) {
      c.beginPath();
      for (let i = -n; i <= n; i++) {
        if (i === 0 || (i % 5 === 0) !== major) continue;
        if (dir === 'h') {
          const y = snapPx(Y(i * 0.2));
          if (y < R.y || y > R.y + R.h) continue;
          c.moveTo(R.x, y); c.lineTo(R.x + R.w, y);
        } else {
          const x = snapPx(X(i * 0.2));
          if (x < R.x || x > R.x + R.w) continue;
          c.moveTo(x, R.y); c.lineTo(x, R.y + R.h);
        }
      }
      c.strokeStyle = alpha(colors.text, gridAlpha(major));
      c.lineWidth = 1 / dpr;
      c.stroke();
    });
  }

  function buildBackground() {
    bgKey = bgKeyNow();
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx, dark = colors.dark, base = colors['canvas-bg'];
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    // 托盤：面板之間的縫比畫布底色略深，四個面板像浮起的卡片
    c.fillStyle = dark ? shade(base, -0.4) : mix(base, colors.text, 0.06);
    c.fillRect(0, 0, cw, ch);
    const panels = [L.circ, L.ys, L.xs, L.corner];
    // 先畫全部投影，再畫面板本身（投影不會落在相鄰面板上）
    panels.forEach(function (R) {
      c.save();
      c.shadowColor = dark ? 'rgba(0,0,0,0.55)' : alpha(colors.text, 0.16);
      c.shadowBlur = 7;
      c.shadowOffsetY = 2;
      D.roundRect(c, R.x, R.y, R.w, R.h, RAD);
      c.fillStyle = base;
      c.fill();
      c.restore();
    });
    panels.forEach(function (R) {
      D.roundRect(c, R.x, R.y, R.w, R.h, RAD);
      c.fillStyle = base;
      c.fill();
      // 由上而下極淡的明暗
      const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
      lightToShade(g, dark ? 0.03 : 0.6, dark ? 0.16 : 0.03, 0.45);
      c.fillStyle = g;
      c.fill();
    });

    // ===== 圓周區（俯視的光滑桌面）=====
    const C = L.circ;
    c.save();
    clipPanel(c, C);
    // 暈影：圓心附近亮、四角暗
    const vg = c.createRadialGradient(L.cx, L.cy * 0.92, L.S * 0.1, L.cx, L.cy, L.S * 0.8);
    lightToShade(vg, dark ? 0.035 : 0.5, dark ? 0.28 : 0.055, 0.4);
    c.fillStyle = vg;
    c.fillRect(C.x, C.y, C.w, C.h);
    // 兩級格線：主格線每 1 m、次格線每 0.2 m
    D.grid(c, C.x, C.y, C.x + C.w, C.y + C.h, L.k, L.k * 0.2, L.cx, L.cy);
    // x、y 軸（末端小箭頭）與每 1 m 的刻度
    const ay = snapPx(L.cy), axx = snapPx(L.cx);
    const axc = alpha(colors.muted, 0.85);
    c.strokeStyle = axc;
    c.fillStyle = axc;
    c.lineCap = 'round';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(C.x + 6, ay); c.lineTo(C.x + C.w - 9, ay);
    c.moveTo(axx, C.y + C.h - 6); c.lineTo(axx, C.y + 9);
    c.stroke();
    axisHead(c, C.x + C.w - 4, ay, 1, 0);
    axisHead(c, axx, C.y + 4, 0, -1);
    c.lineWidth = 1;
    c.beginPath();
    [-2, -1, 1, 2].forEach(function (d) {
      const tx = snapPx(X(d)), ty = snapPx(Y(d));
      c.moveTo(tx, ay - 3); c.lineTo(tx, ay + 3);
      c.moveTo(axx - 3, ty); c.lineTo(axx + 3, ty);
    });
    c.stroke();
    const fTick = fnt(11), fAxis = fnt(12, 600);
    [-2, -1, 1, 2].forEach(function (d) { D.haloText(c, num(d, 0), X(d), L.cy + 5, colors.muted, 'center', 'top', fTick); });
    [-2, -1, 1, 2].forEach(function (d) { D.haloText(c, num(d, 0), L.cx + 6, Y(d), colors.muted, 'left', 'middle', fTick); });
    D.haloText(c, 'x (m)', C.x + C.w - 7, L.cy - 5, colors.muted, 'right', 'bottom', fAxis);
    if (L.narrow) D.haloText(c, 'y (m)', L.cx - 7, C.y + 5, colors.muted, 'right', 'top', fAxis);
    else D.haloText(c, 'y (m)', L.cx + 8, C.y + 5, colors.muted, 'left', 'top', fAxis);
    c.restore();

    // ===== 兩個圖表區：空間格線、零線與 ±r 虛線（縱軸／橫軸與圓周區同一比例） =====
    [[L.ys, 'h'], [L.xs, 'v']].forEach(function (it) {
      const R = it[0], hz = it[1] === 'h';
      c.save();
      clipPanel(c, R);
      spaceLines(c, R, it[1]);
      c.lineCap = 'round';
      c.strokeStyle = alpha(colors.muted, 0.8);
      c.lineWidth = 1;
      c.beginPath();
      if (hz) { c.moveTo(R.x + 4, snapPx(L.cy)); c.lineTo(R.x + R.w - 4, snapPx(L.cy)); }
      else { c.moveTo(snapPx(L.cx), R.y + 4); c.lineTo(snapPx(L.cx), R.y + R.h - 4); }
      c.stroke();
      c.setLineDash([4, 4]);
      c.lineCap = 'butt';
      c.strokeStyle = alpha(colors.muted, 0.5);
      c.beginPath();
      [state.r, -state.r].forEach(function (v) {
        if (hz) { c.moveTo(R.x + 4, snapPx(Y(v))); c.lineTo(R.x + R.w - 4, snapPx(Y(v))); }
        else { c.moveTo(snapPx(X(v)), R.y + 4); c.lineTo(snapPx(X(v)), R.y + R.h - 4); }
      });
      c.stroke();
      c.setLineDash([]);
      c.restore();
    });

    // ===== 右下角：箭頭比例尺 =====
    drawCornerStatic(c);
  }

  // ---------- 主繪圖 ----------
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

  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function draw() {
    if (!L) return;
    if (bgKey !== bgKeyNow()) buildBackground();
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

  /** 向量名稱（斜體）＋截短時的「≈」，置中於 (x, y)，帶背景色描邊 */
  function vecTag(name, over, x, y, color) {
    const fM = fnt(L.narrow ? 14 : 15, 700, true), fA = fnt(L.narrow ? 12 : 13, 700);
    ctx.font = fM;
    const w1 = ctx.measureText(name).width;
    let w2 = 0;
    if (over) { ctx.font = fA; w2 = ctx.measureText(' ≈').width; }
    const x0 = x - (w1 + w2) / 2;
    D.haloText(ctx, name, x0, y, color, 'left', 'middle', fM);
    if (over) D.haloText(ctx, ' ≈', x0 + w1 + 1, y, color, 'left', 'middle', fA);
  }

  /** 截短記號：箭身中段挖一個小缺口，畫兩條斜線（箭頭太長、畫不下時） */
  function breakMark(x0, y0, ux, uy, len, lw, color) {
    const nx = -uy, ny = ux;
    const mx = x0 + ux * len * 0.5, my = y0 + uy * len * 0.5, s = 2.2 * lw;
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.lineWidth = lw + 3;
    ctx.beginPath(); ctx.moveTo(mx - ux * 3, my - uy * 3); ctx.lineTo(mx + ux * 3, my + uy * 3); ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    [-3, 3].forEach(function (o) {
      const bx = mx + ux * o, by = my + uy * o;
      ctx.moveTo(bx - nx * s + ux * 2, by - ny * s + uy * 2);
      ctx.lineTo(bx + nx * s - ux * 2, by + ny * s - uy * 2);
    });
    ctx.stroke();
    ctx.restore();
  }

  /** 投影點：有立體感的小菱形（上亮下暗、背景色描邊） */
  function diamond(x, y, r, color) {
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, shade(color, 0.4));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.25));
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.95);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = g;
    ctx.fill();
  }

  /** 圓周區內的物件（裁切在區域內） */
  function drawCircle(p, s, d) {
    const C = L.circ, k = L.k, R = state.r * k, dark = colors.dark;
    const cut = state.tCut != null;
    ctx.save();
    clipPanel(ctx, C);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 圓周軌道：極淡的軌道面（純裝飾）＋柔和的軌道帶＋虛線
    const og = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, R);
    og.addColorStop(0, alpha(colors.accent, 0));
    og.addColorStop(0.7, alpha(colors.accent, dark ? 0.025 : 0.018));
    og.addColorStop(1, alpha(colors.accent, cut ? 0.03 : (dark ? 0.085 : 0.06)));
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(L.cx, L.cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(colors.accent, cut ? 0.06 : (dark ? 0.14 : 0.1));
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(L.cx, L.cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = alpha(colors.accent, cut ? 0.3 : 0.62);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(L.cx, L.cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // 剪斷後：沿切線的預測直線（虛線）
    if (cut) {
      const c = CC.stateAt(p, state.tCut), sp = Math.hypot(c.vx, c.vy);
      ctx.strokeStyle = alpha(colors.pos, 0.5);
      ctx.lineWidth = 1.3;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(X(c.x), Y(c.y));
      ctx.lineTo(X(c.x + c.vx / sp * 6), Y(c.y + c.vy / sp * 6));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 角度 θ：由 +x 軸量到半徑（繩子還在時）；扇形由內往外漸濃，弧線末端有小箭頭表示逆時針
    let thLabel = null;
    if (!cut) {
      const th = CC.wrapAngle(s.theta);
      const ar = Math.max(14, Math.min(R * 0.42, 30));
      const wg = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, ar);
      wg.addColorStop(0, alpha(colors.accent, 0.03));
      wg.addColorStop(1, alpha(colors.accent, dark ? 0.2 : 0.15));
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.moveTo(L.cx, L.cy); ctx.arc(L.cx, L.cy, ar, 0, -th, true); ctx.closePath(); ctx.fill();
      const arcCol = alpha(colors.text, dark ? 0.6 : 0.55);
      ctx.strokeStyle = arcCol;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(L.cx, L.cy, ar, 0, -th, true); ctx.stroke();
      if (th > 0.45) {
        ctx.fillStyle = arcCol;
        axisHead(ctx, L.cx + ar * Math.cos(th), L.cy - ar * Math.sin(th), -Math.sin(th), -Math.cos(th));
      }
      const mid = th / 2;
      if (L.narrow) {
        // 手機：弧旁只標 θ，數值放在右上角
        const lr = R < 40 ? R + 11 : ar + 9;
        thLabel = { letter: true, x: L.cx + lr * Math.cos(mid), y: L.cy - lr * Math.sin(mid) };
      } else {
        // 圓很小時把標籤放到圓外，避免壓在軌道與小球上
        const lr = R < 70 ? R + 24 : ar + 20;
        thLabel = { letter: false, x: L.cx + lr * Math.cos(mid) + 10 * Math.cos(mid), y: L.cy - lr * Math.sin(mid) };
      }
      thLabel.text = 'θ = ' + num(th * 180 / Math.PI, 0) + '°';
    }

    // 漸淡的軌跡：外層淡淡的光、中層主線、內層細高光（越舊越淡越細）
    if (state.show.trail) {
      const span = Math.min(state.t, 0.65 * state.T), N = 48;
      if (span > 0) {
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const tt = state.t - span + span * i / N;
          const q = CC.motionAt(p, tt, state.tCut);
          pts.push([X(q.x), Y(q.y)]);
        }
        const hi = shade(colors.accent, dark ? 0.45 : 0.6);
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 1; i <= N; i++) {
            const u = i / N;
            if (pass === 0) { ctx.strokeStyle = alpha(colors.accent, (dark ? 0.16 : 0.1) * u * u); ctx.lineWidth = 3 + 7 * u; }
            else if (pass === 1) { ctx.strokeStyle = alpha(colors.accent, 0.08 + 0.62 * u * u); ctx.lineWidth = 1 + 3.5 * u; }
            else { if (u < 0.35) continue; ctx.strokeStyle = alpha(hi, 0.55 * u * u); ctx.lineWidth = 0.6 + 0.9 * u; }
            ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
          }
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
      ctx.lineWidth = 1.4;
      for (let i = first; i <= k1; i++) {
        const tt = i * dt;
        if (tt > state.t) break;
        const onLine = cut && tt > state.tCut;
        const age = (state.t - tt) / keep;
        if (!onLine && age > 1) continue;
        const q = CC.motionAt(p, tt, state.tCut);
        const a = onLine ? 0.9 : 0.15 + 0.7 * (1 - age);
        const col = onLine ? colors.pos : colors.accent;
        const mx = X(q.x), my = Y(q.y);
        ctx.fillStyle = alpha(mix(colors['canvas-bg'], col, 0.22), a);
        ctx.strokeStyle = alpha(col, a);
        ctx.beginPath(); ctx.arc(mx, my, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = alpha(col, a * 0.85);
        ctx.beginPath(); ctx.arc(mx, my, 1.1, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 中心的釘子
    const pinR = Math.max(4, L.ballR * 0.5);

    // 繩子（管狀）
    const bx = X(s.x), by = Y(s.y);
    const ropeCol = dark ? shade(colors.muted, 0.12) : shade(colors.muted, -0.05);
    const ropeW = L.narrow ? 2.6 : 3;
    if (!cut) {
      D.tube(ctx, function (g) { g.moveTo(L.cx, L.cy); g.lineTo(bx, by); }, ropeCol, ropeW);
      // 半徑標籤 r：放在繩子中點、偏向軌跡那一側
      const ux = (bx - L.cx) / R, uy = (by - L.cy) / R;
      const ox = uy, oy = -ux; // 順時針側（軌跡在後方）
      if (R > 34) D.haloText(ctx, 'r', L.cx + ux * R * 0.3 + ox * 11, L.cy + uy * R * 0.3 + oy * 11, colors.muted, 'center', 'middle', fnt(13, 600, true));
    } else {
      // 剪斷後：釘子上留一段鬆垂的繩頭，小球上也帶一小段
      const c = CC.stateAt(p, state.tCut);
      const ux = c.x / state.r, uy = c.y / state.r;
      const len = Math.min(R * 0.38, 40);
      const ex = L.cx + ux * len, ey = L.cy - uy * len;
      D.tube(ctx, function (g) {
        g.moveTo(L.cx, L.cy);
        g.quadraticCurveTo(L.cx + ux * len * 0.6 - uy * 6, L.cy - uy * len * 0.6 - ux * 6, ex - uy * 3, ey - ux * 3);
      }, ropeCol, ropeW);
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const tx = -s.vx / sp, ty = s.vy / sp; // 畫布座標中與運動方向相反
      D.tube(ctx, function (g) {
        g.moveTo(bx, by);
        g.quadraticCurveTo(bx + tx * 8 + ty * 3, by + ty * 8 - tx * 3, bx + tx * 13 + ty * 1, by + ty * 13 - tx * 1);
      }, ropeCol, ropeW);
    }
    // 釘子：墊圈＋金屬小球
    const wg2 = ctx.createRadialGradient(L.cx - 1, L.cy - 1, pinR * 0.4, L.cx, L.cy, pinR + 3.5);
    wg2.addColorStop(0, alpha(colors.field, dark ? 0.35 : 0.22));
    wg2.addColorStop(1, alpha(colors.field, dark ? 0.12 : 0.08));
    ctx.fillStyle = wg2;
    ctx.beginPath(); ctx.arc(L.cx, L.cy, pinR + 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(colors.field, dark ? 0.35 : 0.25);
    ctx.lineWidth = 1;
    ctx.stroke();
    D.ball(ctx, L.cx, L.cy, pinR, colors.field, { glow: 0 });

    // 投影：小球在 x 軸、y 軸上的影子（做簡諧運動）
    if (state.show.proj) {
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = alpha(colors.equi, 0.75);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, L.cy); ctx.stroke();
      ctx.strokeStyle = alpha(colors['b-optics'], 0.75);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(L.cx, by); ctx.stroke();
      ctx.setLineDash([]);
      diamond(bx, L.cy, 5.5, colors.equi);
      diamond(L.cx, by, 5.5, colors['b-optics']);
    }

    // 文字：時間、慢動作、狀態、角度（畫在小球與向量下面，永遠不會蓋住小球）
    const f1 = fnt(L.narrow ? 12 : 13, 600);
    const f2 = fnt(L.narrow ? 11 : 12, 600);
    if (thLabel) {
      if (thLabel.letter) {
        D.haloText(ctx, 'θ', thLabel.x, thLabel.y, colors.text, 'center', 'middle', fnt(13, 600, true));
        tag(ctx, thLabel.text, C.x + C.w - 6, C.y + 14, colors.text, 'right', f1);
      } else {
        tag(ctx, thLabel.text, thLabel.x, thLabel.y, colors.text, 'center', fnt(12, 600));
      }
    }
    if (L.narrow) {
      // 手機畫面小：只留一行時間（含慢動作倍率），剪斷的說明交給下方狀態列
      tag(ctx, 't = ' + num(state.t, 2) + ' s' + (state.slow ? '  (' + SLOW + '×)' : ''), C.x + 6, C.y + C.h - 14, colors.text, 'left', f1);
    } else {
      const step = 22;
      tag(ctx, 't = ' + num(state.t, 2) + ' s', C.x + 6, C.y + 14, colors.text, 'left', f1);
      if (state.slow) tag(ctx, T('慢動作 ', 'Slow motion ') + SLOW + '×', C.x + 6, C.y + 14 + step, colors.accent, 'left', f2);
      if (cut) tag(ctx, T('繩已剪斷：F = 0', 'String cut: F = 0'), C.x + 6, C.y + C.h - 15, colors.pos, 'left', f1);
      tag(ctx, T('俯視圖', 'Top view'), C.x + C.w - 6, C.y + 14, colors.muted, 'right', f2);
    }

    // 向量：速度（切線）、加速度與合力（指向圓心）
    const lw = L.lw;
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
      D.arrow(ctx, x0, y0, x0 + v.ux * len, y0 + v.uy * len, v.color, lw);
      if (over) breakMark(x0, y0, v.ux, v.uy, len, lw, v.color);
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
      vecTag(v.label, over, lx, ly, v.color);
    });

    // 小球：桌面上的柔和陰影（光從左上方來，影子偏右下）＋立體球
    const br = L.ballR;
    const sx0 = bx + br * 0.28, sy0 = by + br * 0.38;
    const sg = ctx.createRadialGradient(sx0, sy0, br * 0.4, sx0, sy0, br * 1.5);
    sg.addColorStop(0, D.shadowInk(dark ? 0.42 : 0.2));
    sg.addColorStop(1, D.shadowInk(0));
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx0, sy0, br * 1.5, 0, Math.PI * 2); ctx.fill();
    D.ball(ctx, bx, by, br, colors.accent);

    // 純裝飾：每轉一圈的波紋、剪斷瞬間的火花
    drawEffects();
    ctx.restore();
  }

  function drawEffects() {
    const tNow = performance.now();
    state.fx = state.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const u = (tNow - e.t0) / e.dur;
      if (e.type === 'ring') {
        D.ripple(ctx, X(e.x), Y(e.y), L.ballR + 3, u, colors.accent);
      } else if (e.type === 'snap') {
        const cx = X(e.x), cy = Y(e.y);
        D.ripple(ctx, cx, cy, L.ballR + 2, u, colors.pos);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = alpha(colors.pos, 0.85 * (1 - u));
        ctx.lineWidth = 1.8 * (1 - u) + 0.6;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const a = e.a0 + i * Math.PI * 2 / 7;
          const r0 = 4 + 10 * u, r1 = 9 + 20 * u;
          ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
          ctx.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
        }
        ctx.stroke();
        ctx.restore();
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
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = alpha(colors['b-optics'], 0.5);
    ctx.beginPath(); ctx.moveTo(bx + L.ballR + 2, by); ctx.lineTo(tX(state.t, tw), by); ctx.stroke();
    ctx.strokeStyle = alpha(colors.equi, 0.55);
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

  /** 時間格線（兩級）：主格線在刻度上，次格線把刻度間隔分成 4 或 5 份；vertical 為 true 時畫垂直線（y–t 圖） */
  function timeGrid(R, tw, tk, vertical) {
    const mant = tk.step / Math.pow(10, Math.floor(Math.log10(tk.step) + 1e-9));
    const minor = tk.step / (Math.abs(mant - 2) < 1e-6 ? 4 : 5);
    const pos = vertical ? function (t) { return tX(t, tw); } : function (t) { return tY(t, tw); };
    const line = function (v) {
      const s = snapPx(v);
      if (vertical) { ctx.moveTo(s, R.y); ctx.lineTo(s, R.y + R.h); } else { ctx.moveTo(R.x, s); ctx.lineTo(R.x + R.w, s); }
    };
    ctx.lineWidth = 1 / dpr;
    if (Math.abs(pos(minor) - pos(0)) >= 6) {
      ctx.beginPath();
      for (let t = Math.ceil(tw.tL / minor - 1e-9) * minor; t <= tw.tR + 1e-9; t += minor) {
        if (Math.abs(t / tk.step - Math.round(t / tk.step)) < 1e-6) continue;
        line(pos(t));
      }
      ctx.strokeStyle = alpha(colors.text, gridAlpha(false));
      ctx.stroke();
    }
    ctx.beginPath();
    tk.list.forEach(function (t) { line(pos(t)); });
    ctx.strokeStyle = alpha(colors.text, gridAlpha(true));
    ctx.stroke();
  }

  /** 已發生的曲線：曲線與零線之間淡淡的面積（離零線越遠越濃）＋管狀曲線 */
  function drawPast(pts, col, vertical) {
    if (pts.length < 2) return;
    const dark = colors.dark, a0 = dark ? 0.22 : 0.15;
    const g = vertical ? ctx.createLinearGradient(0, Y(state.r), 0, Y(-state.r))
      : ctx.createLinearGradient(X(-state.r), 0, X(state.r), 0);
    g.addColorStop(0, alpha(col, a0));
    g.addColorStop(0.5, alpha(col, 0.01));
    g.addColorStop(1, alpha(col, a0));
    const first = pts[0], last = pts[pts.length - 1];
    ctx.beginPath();
    polyPath(ctx, pts);
    if (vertical) { ctx.lineTo(last[0], L.cy); ctx.lineTo(first[0], L.cy); }
    else { ctx.lineTo(L.cx, last[1]); ctx.lineTo(L.cx, first[1]); }
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    D.tube(ctx, function (c) { polyPath(c, pts); }, col, L.narrow ? 3 : 3.6);
  }
  function drawFuture(pts, col) {
    if (pts.length < 2) return;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = alpha(col, colors.dark ? 0.45 : 0.4);
    ctx.lineWidth = 1.3;
    ctx.beginPath(); polyPath(ctx, pts); ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawStripY(p, s, tw, d) {
    const R = L.ys, col = colors['b-optics'], dark = colors.dark;
    ctx.save();
    clipPanel(ctx, R);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const tk = timeTicks(tw, L.narrow ? 2 : 5);
    timeGrid(R, tw, tk, true);
    const titleText = T('y–t 圖', 'y–t graph'), titleFont = fnt(L.narrow ? 12 : 13, 700);
    const ts = pillSize(ctx, titleText, titleFont);
    const titleBottom = R.y + 13 + ts.h / 2, titleRight = R.x + 6 + ts.w;

    // 週期括號：兩個相鄰最高點之間（不可壓在標題上：先改用後面的最高點，放不下就移到標題下方）
    let bracketRight = -Infinity, bracketY = 0;
    if (state.tCut == null) {
      const w = CC.omegaOf(p);
      const kk = Math.ceil(((tw.tL * w + p.theta0) - Math.PI / 2) / (2 * Math.PI) - 1e-9);
      let t1 = (Math.PI / 2 + 2 * Math.PI * kk - p.theta0) / w;
      let yb = Math.max(R.y + 10, Y(state.r) - 8);
      const clash = function (ta) { return yb - 9 < titleBottom && tX(ta, tw) < titleRight + 4; };
      for (let i = 0; i < 3 && clash(t1) && t1 + 2 * state.T <= tw.tR; i++) t1 += state.T;
      if (clash(t1)) yb = titleBottom + 10;
      const t2 = t1 + state.T;
      if (t2 <= tw.tR) {
        const x1 = tX(t1, tw), x2 = tX(t2, tw);
        bracketRight = x2; bracketY = yb;
        ctx.strokeStyle = alpha(colors.text, 0.55);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x1, yb + 4); ctx.lineTo(x1, yb - 4); ctx.moveTo(x2, yb + 4); ctx.lineTo(x2, yb - 4);
        ctx.moveTo(x1, yb); ctx.lineTo(x2, yb);
        ctx.stroke();
        if (x2 - x1 > 22) tag(ctx, 'T', (x1 + x2) / 2, yb, colors.text, 'center', fnt(12, 600, true));
      }
    }

    // y(t) 曲線：預測（虛線）與已發生（管狀＋面積）
    const n = Math.max(60, Math.round(R.w / 2));
    const c = sampleCurve(p, tw, function (t, q) { return [tX(t, tw), Y(q.y)]; }, n);
    drawFuture(c.fut, col);
    drawPast(c.past, col, true);
    // 「現在」的時間線與目前位置
    const cx = tX(state.t, tw), cy = Y(s.y);
    ctx.strokeStyle = alpha(col, dark ? 0.3 : 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(snapPx(cx), R.y + 4); ctx.lineTo(snapPx(cx), R.y + R.h - 4); ctx.stroke();
    if (cy > R.y - 10 && cy < R.y + R.h + 10) D.ball(ctx, cx, cy, L.narrow ? 4.5 : 5.5, col, { glow: dark ? 0.4 : 0.18 });

    // 標題與刻度
    const f = fnt(L.narrow ? 11 : 12), fi = fnt(L.narrow ? 11 : 12, 600, true), fb = fnt(L.narrow ? 11 : 12, 600);
    tag(ctx, titleText, R.x + 6, R.y + 13, col, 'left', titleFont);
    // +r：平常放在虛線上方；太靠近頂端或會碰到週期括號時改放下方
    ctx.font = fi;
    const rLeft = R.x + R.w - 6 - ctx.measureText('+r').width;
    const rAbove = Y(state.r) - R.y >= 30 && !(bracketRight > rLeft - 14 && Math.abs(bracketY - (Y(state.r) - 9)) < 16);
    D.haloText(ctx, '+r', R.x + R.w - 6, Y(state.r) + (rAbove ? -9 : 9), colors.muted, 'right', 'middle', fi);
    D.haloText(ctx, '−r', R.x + R.w - 6, Y(-state.r) + 9 > R.y + R.h - 22 ? Y(-state.r) - 9 : Y(-state.r) + 9, colors.muted, 'right', 'middle', fi);
    const tlText = 't (s) →';
    ctx.font = fb;
    const tlx = R.x + R.w - 6 - ctx.measureText(tlText).width;
    D.haloText(ctx, tlText, R.x + R.w - 6, R.y + R.h - 11, colors.muted, 'right', 'middle', fb);
    const dec = tk.step < 1 ? 1 : 0;
    ctx.font = f;
    tk.list.forEach(function (t) {
      const x = tX(t, tw), hw = ctx.measureText(num(t, dec)).width / 2 + 4;
      if (x - hw < R.x + 4 || x + hw > tlx - 4) return;
      D.haloText(ctx, num(t, dec), x, R.y + R.h - 11, colors.muted, 'center', 'middle', f);
    });
    ctx.restore();
  }

  function drawStripX(p, s, tw, d) {
    const R = L.xs, col = colors.equi, dark = colors.dark;
    ctx.save();
    clipPanel(ctx, R);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const tk = timeTicks(tw, 4);
    timeGrid(R, tw, tk, false);

    const n = Math.max(50, Math.round(R.h / 2));
    const c = sampleCurve(p, tw, function (t, q) { return [X(q.x), tY(t, tw)]; }, n);
    drawFuture(c.fut, col);
    drawPast(c.past, col, false);
    const cx = X(s.x), cy = tY(state.t, tw);
    ctx.strokeStyle = alpha(col, dark ? 0.3 : 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(R.x + 4, snapPx(cy)); ctx.lineTo(R.x + R.w - 4, snapPx(cy)); ctx.stroke();
    if (cx > R.x - 10 && cx < R.x + R.w + 10) D.ball(ctx, cx, cy, L.narrow ? 4.5 : 5.5, col, { glow: dark ? 0.4 : 0.18 });

    const f = fnt(L.narrow ? 11 : 12), fb = fnt(L.narrow ? 11 : 12, 600);
    tag(ctx, T('x–t 圖', 'x–t graph'), R.x + 6, R.y + 12, col, 'left', fnt(L.narrow ? 12 : 13, 700));
    D.haloText(ctx, 't (s) ↓', R.x + R.w - 6, R.y + 12, colors.muted, 'right', 'middle', fb);
    const dec = tk.step < 1 ? 1 : 0;
    tk.list.forEach(function (t) {
      const y = tY(t, tw);
      if (y < R.y + 26 || y > R.y + R.h - 8) return;
      D.haloText(ctx, num(t, dec), R.x + 7, y, colors.muted, 'left', 'middle', f);
    });
    ctx.restore();
  }

  /** 右下角（不變的部分）：箭頭比例尺，與畫面上的箭頭同一比例 */
  function drawCornerStatic(c) {
    const R = L.corner;
    c.save();
    clipPanel(c, R);
    const px = L.narrow ? 11 : 12;
    D.haloText(c, T('箭頭比例', 'Arrow scale'), R.x + 10, R.y + 13, colors.muted, 'left', 'middle', fnt(px, 700));
    const rows = [
      { scale: SCALE_V, cands: [0.5, 1, 2, 5], unit: 'm/s', sup: '', color: colors.pos, label: 'v' },
      { scale: SCALE_A, cands: [1, 2, 5, 10, 20], unit: 'm/s', sup: '2', color: colors.neg, label: 'a' },
      { scale: SCALE_F, cands: [0.5, 1, 2, 5, 10], unit: 'N', sup: '', color: colors['b-mech'], label: 'F' }
    ];
    c.font = fnt(px, 600);
    const textW = c.measureText('a 20 m/s²').width;
    const maxLen = Math.max(16, Math.min(70, R.w - 26 - textW));
    const rowH = Math.min(26, (R.h - 26) / 3);
    rows.forEach(function (row, i) {
      let v = row.cands[0];
      row.cands.forEach(function (cd) { if (cd * row.scale * L.k <= maxLen) v = cd; });
      const len = v * row.scale * L.k;
      const y = R.y + 28 + rowH * (i + 0.5);
      D.arrow(c, R.x + 12, y, R.x + 12 + len, y, row.color, Math.max(2, L.lw - 0.6));
      runs(c, [{ t: row.label, it: true }, { t: ' ' + num(v, v < 1 ? 1 : 0) + ' ' + row.unit }, row.sup ? { t: row.sup, sup: true } : null],
        R.x + 19 + len, y, row.color, px, 600);
    });
    c.restore();
  }

  /** 右下角（每一幀）：空間足夠時（桌機）列出目前的大小，方便與箭頭比較 */
  function drawCorner(d) {
    const R = L.corner;
    const rowH = Math.min(26, (R.h - 26) / 3);
    const y0 = R.y + 28 + rowH * 3 + 14;
    if (R.y + R.h - y0 <= 76) return;
    const s = now(), cut = state.tCut != null;
    const sp = Math.hypot(s.vx, s.vy), am = Math.hypot(s.ax, s.ay);
    const px = L.narrow ? 11 : 12;
    ctx.save();
    clipPanel(ctx, R);
    ctx.strokeStyle = alpha(colors.text, 0.1);
    ctx.lineWidth = 1 / dpr;
    ctx.beginPath(); ctx.moveTo(R.x + 10, snapPx(y0 - 8)); ctx.lineTo(R.x + R.w - 10, snapPx(y0 - 8)); ctx.stroke();
    D.haloText(ctx, T('目前的大小', 'Current magnitudes'), R.x + 10, y0 + 6, colors.muted, 'left', 'middle', fnt(px, 700));
    const items = [
      [[{ t: '|' }, { t: 'v', it: true }, { t: '| = ' + num(sp, 2) + ' m/s' }], colors.pos],
      [[{ t: '|' }, { t: 'a', it: true }, { t: '| = ' + num(am, 2) + ' m/s' }, { t: '2', sup: true }].concat(cut ? [] :
        [{ t: '   (' }, { t: 'v', it: true }, { t: '2', sup: true }, { t: '/' }, { t: 'r', it: true }, { t: ' = ' + num(d.v * d.v / d.r, 2) + ')' }]), colors.neg],
      [[{ t: '|' }, { t: 'F', it: true }, { t: '| = ' + num(state.m * am, 2) + ' N' }], colors['b-mech']]
    ];
    items.forEach(function (it, i) { runs(ctx, it[0], R.x + 12, y0 + 26 + i * 20, it[1], px, 600); });
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
    sayParams();
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

  // ---------- 無障礙：讀數播報與畫布說明 ----------
  // 只在離散事件（改完條件、剪斷、暫停）寫入 aria-live 的 #srSay；每格都在變的即時讀數不播報
  let sayTimer = 0, sayParamTimer = 0;
  function say(msg) {
    const el = $('srSay');
    if (!el) return;
    clearTimeout(sayTimer);
    el.textContent = '';
    sayTimer = setTimeout(function () { el.textContent = msg; }, 60); // 先清空再寫，同樣的字也會再念一次
  }
  const MS2T = ' m/s²';
  function settingText() {
    const d = CC.derived(params());
    return T('半徑 ', 'Radius ') + num(d.r, 2) + ' m' + T('、週期 ', ', period ') + num(d.T, 2) + ' s' +
      T('：速率 ', ': speed ') + num(d.v, 2) + ' m/s' + T('，向心加速度 ', ', centripetal acceleration ') + num(d.a, 2) + MS2T +
      T('，向心力 ', ', centripetal force ') + num(d.F, 2) + ' N' + T('。', '.');
  }
  /** 改完條件後播報（連續改動時只念最後一次） */
  function sayParams() {
    clearTimeout(sayParamTimer);
    sayParamTimer = setTimeout(function () { say(settingText()); }, 350);
  }
  /** 畫布的文字說明（role="img"）：條件改變、剪斷或接回繩子時更新 */
  let labelKey = '';
  function updateLabel() {
    const d = CC.derived(params()), cut = state.tCut != null;
    const key = [d.r, d.T, d.m, cut, T('', 'en')].join('|');
    if (key === labelKey) return;
    labelKey = key;
    cv.removeAttribute('data-en-aria-label'); // 改由程式依語言更新
    cv.setAttribute('aria-label', T(
      '等速圓周運動俯視圖：小球在半徑 ' + num(d.r, 2) + ' m 的圓上逆時針轉動，週期 ' + num(d.T, 2) + ' s、速率 ' + num(d.v, 2) +
      ' m/s；速度箭頭沿切線，向心加速度 ' + num(d.a, 2) + MS2T + ' 指向圓心。' +
      (cut ? '繩子已剪斷，小球沿切線等速直線前進。' : '') + '右側是 y 對時間的正弦曲線，下方是 x 對時間的餘弦曲線。',
      'Top view of uniform circular motion: the ball goes anticlockwise round a circle of radius ' + num(d.r, 2) + ' m with period ' +
      num(d.T, 2) + ' s and speed ' + num(d.v, 2) + ' m/s; the velocity arrow is along the tangent and the centripetal acceleration of ' +
      num(d.a, 2) + MS2T + ' points to the centre.' + (cut ? ' The string is cut, so the ball moves along the tangent in a straight line at constant speed.' : '') +
      ' On the right is the y–t graph (a sine curve), below it the x–t graph (a cosine curve).'));
  }

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
    updateLabel();
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
      say(T('暫停：t = ', 'Paused: t = ') + num(state.t, 2) + ' s' +
        (cut ? T('，與圓心距離 ', ', distance from the centre ') + num(Math.hypot(s.x, s.y), 2) + ' m'
          : T('，θ = ', ', θ = ') + num(th, 1) + '°') +
        T('，x = ', ', x = ') + num(s.x, 2) + ' m' + T('，y = ', ', y = ') + num(s.y, 2) + ' m' + T('。', '.'));
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
    updateLabel();
    startLoop();
    requestDraw();
    const cd = cutData();
    emit('cut', cd);
    say(T('剪斷時 θ = ', 'Cut at θ = ') + num(cd.theta, 1) + '°' + T('：小球以 ', ': the ball leaves along the tangent at ') + num(cd.v, 2) +
      T(' m/s 沿切線飛出。', ' m/s.'));
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
    updateLabel();
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
  updateLabel();
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
