/* kepler.js — 「行星軌道與克卜勒定律」模組的畫面與互動（物理計算在 kepler-core.js） */
(function () {
  'use strict';
  const K = window.KeplerCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 本檔的版本號（?v=）：切換到 3D 時動態載入的 js/kepler-3d.js 沿用同一個版本號，避免讀到舊快取
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  // ---------- 兩種中心天體的設定（顯示單位：太陽用 AU、地球用 km） ----------
  const PRESETS = {
    sun: {
      mu: K.GM_SUN, R: K.R_SUN, Lu: K.AU, vRef: K.circularSpeed(K.GM_SUN, K.AU),
      M: { min: 0.2, max: 3, step: 0.05, dec: 2, def: 1 },
      r0: { min: 0.3, max: 2.5, step: 0.01, dec: 3, def: 1 },
      v0: { min: 2, max: 120, step: 0.1, dec: 2, def: 35 },
      ts: { min: 1, max: 400, def: 60, dec: 1, unit: K.DAY },     // 天／秒
      vw: { min: 0.6, max: 40, def: 2.6, dec: 2 },                  // AU
      phi0: 0
    },
    earth: {
      mu: K.GM_EARTH, R: K.R_EARTH, Lu: 1000, vRef: K.circularSpeed(K.GM_EARTH, K.R_EARTH),
      M: { min: 0.2, max: 3, step: 0.05, dec: 2, def: 1 },
      r0: { min: 6700, max: 60000, step: 10, dec: 0, def: 9000 },
      v0: { min: 0.5, max: 25, step: 0.01, dec: 3, def: 8 },
      ts: { min: 0.5, max: 600, def: 30, dec: 1, unit: 60 },      // 分鐘／秒
      vw: { min: 8000, max: 400000, def: 26000, dec: 0 },         // km
      phi0: 0
    }
  };
  const GHOST_MAX = 12, HIST_MAX = 12, NSEC = 12;
  const PALETTE = ['accent', 'b-optics', 'b-mech', 'b-wave', 'neg', 'probe', 'equi', 'pos'];

  const state = {
    preset: 'sun',
    M: 1, r0: K.AU, phi0: 0, v0: 35000, alpha: 0,
    vSnap: null,           // 'circ' | 'esc' | null：速率鎖定在圓周／脫離速率
    ts: 60 * K.DAY,        // 每秒（真實時間）模擬的秒數
    view: 3 * K.AU,        // 中心到最近畫面邊緣的距離（m）
    flight: null,          // 飛行中的軌道 { el, t, crashT, color, sig, ended, M }
    ghosts: [],            // 之前發射的軌道
    history: [],           // 第三定律紀錄
    launches: 0,
    running: !reducedMotion,
    show: { sec: false, ax: true, v: true, trail: true, ghost: true },
    fx: []                 // 純裝飾的短暫效果（不影響物理）
  };
  function P() { return PRESETS[state.preset]; }
  function mu() { return P().mu * state.M; }
  function isSun() { return state.preset === 'sun'; }

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-optics', '--b-wave', '--b-em']
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
  function col(key) { return colors[key] || colors.accent; }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 整數加千分位逗號 */
  function group(v) {
    if (!isFinite(v)) return '—';
    return Math.round(v).toLocaleString('en-US').replace('-', '−');
  }
  /** 三位有效數字左右 */
  function sig(v) {
    const a = Math.abs(v);
    return a >= 1000 ? group(v) : a >= 100 ? num(v, 0) : a >= 10 ? num(v, 1) : a >= 1 ? num(v, 2) : num(v, 3);
  }
  /** 科學記號（HTML）：4.46 × 10<sup>15</sup> */
  function sci(v, d) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    let ex = Math.floor(Math.log10(Math.abs(v)));
    let m = v / Math.pow(10, ex);
    if (Math.abs(+m.toFixed(d)) >= 10) { ex++; m /= 10; } // 例如 9.9996 進位成 10.00 時改寫成 1.000 × 10^(ex+1)
    return num(m, d) + ' × 10<sup>' + num(ex, 0) + '</sup>';
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
  // 物理量 → 顯示文字（純文字，畫布與 HTML 都可用）
  function fmtDist(m) { return isSun() ? num(m / K.AU, m / K.AU < 10 ? 3 : 2) + ' AU' : group(m / 1000) + ' km'; }
  function fmtSpeed(v) { return num(v / 1000, v < 10000 ? 3 : 2) + ' km/s'; }
  function fmtTime(s) {
    if (!isFinite(s)) return '—';
    if (isSun()) {
      const d = s / K.DAY;
      return Math.abs(d) < 1000 ? num(d, d < 10 ? 1 : 0) + T(' 天', ' d') : num(s / K.YEAR, 2) + T(' 年', ' yr');
    }
    const mi = s / 60;
    return Math.abs(mi) < 180 ? num(mi, 1) + ' min' : num(mi / 60, 2) + ' h';
  }
  /** 週期：太陽用年（附天數），地球用小時（附分鐘） */
  function fmtPeriodHTML(Tp) {
    if (!isFinite(Tp)) return T('—（不封閉，不會回來）', '— (open orbit)');
    if (isSun()) return num(Tp / K.YEAR, 3) + T(' 年', ' yr') + '<small>= ' + group(Tp / K.DAY) + T(' 天', ' days') + '</small>';
    return num(Tp / 3600, 3) + ' h<small>= ' + num(Tp / 60, 1) + ' min</small>';
  }

  // ---------- 發射條件與軌道 ----------
  function launchSig() { return [state.preset, state.M, state.r0, state.phi0, state.v0, state.alpha].join('|'); }
  function launchVec() { return K.launchState(state.r0, state.phi0, state.v0, state.alpha); }
  let previewCache = { sig: '', el: null, crashT: null };
  function preview() {
    const sg = launchSig();
    if (previewCache.sig !== sg) {
      const s = launchVec();
      const el = K.elementsFromState(mu(), s.x, s.y, s.vx, s.vy);
      previewCache = { sig: sg, el: el, crashT: K.crashTime(el, P().R) };
    }
    return previewCache;
  }
  function vCirc0() { return K.circularSpeed(mu(), state.r0); }
  function vEsc0() { return K.escapeSpeed(mu(), state.r0); }
  /** 畫面上主要描述的軌道：飛行中的軌道；沒有飛行時為預測軌道 */
  function mainOrbit() { return state.flight || preview(); }
  function previewDiffers() { return !state.flight || state.flight.sig !== launchSig(); }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, cx = 150, cy = 150, k = 1, narrow = false;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');
  let bgDirty = true;

  function X(x) { return cx + x * k; }
  function Y(y) { return cy - y * k; }
  function pxPerV() { return 0.4 * Math.min(cw, ch) / (P().v0.max * 1000); } // 箭頭長度 ∝ 速率（px per m/s）

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    narrow = cw < 560;
    ch = Math.round(narrow ? cw * 1.08 : Math.min(cw * 0.68, 600));
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    setScale();
    draw();
  }
  function setScale() {
    cx = cw / 2; cy = ch / 2;
    k = (Math.min(cw, ch) / 2 - 6) / state.view;
    bgDirty = true;
  }
  function rDraw() { return 0.75 * Math.hypot(cw, ch) / k; } // 畫軌道時取到的最遠距離（m）

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
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }

  /** 軌道上的點（世界座標，依真近點角取樣，只取 r ≤ rMax 的部分） */
  function conicPts(el, rMax, n) {
    const rg = K.nuRange(el, rMax);
    if (!rg) return [];
    n = n || 360;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const p = K.positionAtNu(el, rg[0] + (rg[1] - rg[0]) * i / n);
      pts.push([p.x, p.y]);
    }
    return pts;
  }
  function strokePts(c, pts, closed) {
    c.beginPath();
    pts.forEach(function (p, i) { if (i) c.lineTo(X(p[0]), Y(p[1])); else c.moveTo(X(p[0]), Y(p[1])); });
    if (closed) c.closePath();
    c.stroke();
  }
  function isClosed(el) {
    if (!(el.e < 1) || el.type === 'parabola') return false;
    const rg = K.nuRange(el, rDraw());
    return !!rg && rg[1] >= Math.PI;
  }

  /** 不變的圖層：背景暈影、星點、距離圈、之前的軌道（參數、主題或軌道清單改變時才重畫） */
  function buildBackground() {
    bgDirty = false;
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const rg = c.createRadialGradient(cx, cy, Math.min(cw, ch) * 0.05, cx, cy, Math.hypot(cw, ch) * 0.6);
    rg.addColorStop(0, colors.dark ? shade(base, 0.05) : base);
    rg.addColorStop(1, shade(base, colors.dark ? -0.4 : -0.05));
    c.fillStyle = rg;
    c.fillRect(0, 0, cw, ch);
    // 深色模式：極淡的星點（固定亂數，不閃爍）
    if (colors.dark) {
      let seed = 7;
      const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const n = Math.round(cw * ch / 2600);
      for (let i = 0; i < n; i++) {
        const x = rnd() * cw, y = rnd() * ch, r = 0.4 + rnd() * 0.9, a = 0.12 + rnd() * 0.35;
        c.fillStyle = alpha(colors.text, a);
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      }
    }
    // 距離圈（以中心天體為圓心）
    const stepM = niceStep(state.view / P().Lu / 2.6) * P().Lu;
    const maxR = Math.hypot(cw, ch) / 2 / k;
    c.lineWidth = 1;
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    for (let r = stepM, i = 1; r < maxR; r += stepM, i++) {
      c.strokeStyle = alpha(colors.text, i % 2 ? 0.06 : 0.1);
      c.setLineDash([2, 5]);
      c.beginPath(); c.arc(cx, cy, r * k, 0, TAU); c.stroke();
      c.setLineDash([]);
      const lx = cx + r * k * Math.cos(-2.35), ly = cy + r * k * Math.sin(-2.35); // 左上方（發射點預設在右側）
      const txt = isSun() ? sig(r / K.AU) + ' AU' : group(r / 1000) + ' km';
      if (lx - c.measureText(txt).width > 8 && ly > 56) {
        c.fillStyle = alpha(colors.muted, 0.85);
        c.textAlign = 'right';
        c.fillText(txt, lx - 3, ly - 1);
      }
    }
    // 之前的軌道（殘影）
    if (state.show.ghost) {
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      state.ghosts.forEach(function (g) {
        const pts = conicPts(g.el, rDraw(), 300);
        c.strokeStyle = alpha(col(g.color), colors.dark ? 0.42 : 0.38);
        c.lineWidth = 1.3;
        strokePts(c, pts, isClosed(g.el));
        // 發射點
        const s = K.stateAt(g.el, 0);
        c.fillStyle = alpha(col(g.color), 0.6);
        c.beginPath(); c.arc(X(s.x), Y(s.y), 2.6, 0, TAU); c.fill();
      });
      c.restore();
    }
  }

  // ---------- 繪圖工具 ----------
  /**
   * 有半透明圓角底框的標籤，可含下標：parts = [[文字, 是否下標], …] 或單一字串。
   * ctx.textAlign 決定水平對齊（left/center/right），垂直置中於 y。
   */
  function pill(parts, x, y, color, font, bgAlpha) {
    if (typeof parts === 'string') parts = [[parts, false]];
    font = font || '600 12px system-ui, sans-serif';
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
    const subFont = font.replace(/(\d+(?:\.\d+)?)px/, Math.round(size * 0.74) + 'px');
    ctx.textBaseline = 'middle';
    const ws = parts.map(function (p) { ctx.font = p[1] ? subFont : font; return ctx.measureText(p[0]).width; });
    const tw = ws.reduce(function (a, b) { return a + b; }, 0);
    ctx.font = font;
    const m = ctx.measureText('Hg');
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : size * 1.25;
    const ph = fh + 3, pw = tw + 10;
    const al = ctx.textAlign;
    let bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - pw : x - 5;
    bx = Math.max(2, Math.min(cw - pw - 2, bx)); // 不要被畫布邊緣切掉
    ctx.fillStyle = alpha(colors['canvas-bg'], bgAlpha == null ? 0.86 : bgAlpha);
    roundRect(ctx, bx, y - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    let xx = bx + 5;
    parts.forEach(function (p, i) {
      ctx.font = p[1] ? subFont : font;
      ctx.fillText(p[0], xx, y + 0.5 + (p[1] ? size * 0.28 : 0));
      xx += ws[i];
    });
    ctx.textAlign = al;
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }

  /** 向量箭頭：箭身寬 lw，箭頭長約 4 倍箭身寬、兩側略帶弧度（與其他模組相同的幾何） */
  function arrow(x0, y0, ux, uy, len, lw, color) {
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
  }

  /** 球體：亮點偏左上，邊緣加深，外加細亮邊與柔和投影 */
  function sphere(x, y, R, base, glow) {
    if (glow) {
      const g0 = ctx.createRadialGradient(x, y, R * 0.6, x, y, R * 2.6);
      g0.addColorStop(0, alpha(base, colors.dark ? 0.35 : 0.2));
      g0.addColorStop(1, alpha(base, 0));
      ctx.fillStyle = g0;
      ctx.beginPath(); ctx.arc(x, y, R * 2.6, 0, TAU); ctx.fill();
    }
    const sh = ctx.createRadialGradient(x + R * 0.2, y + R * 0.35, R * 0.3, x + R * 0.2, y + R * 0.35, R * 1.45);
    sh.addColorStop(0, 'rgba(0,0,0,' + (colors.dark ? 0.4 : 0.2) + ')');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.arc(x + R * 0.2, y + R * 0.35, R * 1.45, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(x - R * 0.33, y - R * 0.35, R * 0.08, x, y, R);
    g.addColorStop(0, shade(base, 0.62));
    g.addColorStop(0.45, base);
    g.addColorStop(1, shade(base, -0.42));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = alpha(shade(base, 0.7), colors.dark ? 0.55 : 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, R - 0.5), Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
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
  function cross(x, y, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
    ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r);
    ctx.stroke();
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  /** 目前飛行物體的狀態（撞擊後停在撞擊點） */
  function flightState() {
    const f = state.flight;
    if (!f) return null;
    return K.stateAt(f.el, f.t);
  }

  function draw() {
    if (view3 && view3.active) {
      // 3D 檢視：2D 畫布隱藏、不必重畫；到期的裝飾效果照樣移除（否則動畫迴圈不會停）
      const tNow = performance.now();
      state.fx = state.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
      view3.frame();
      updateReadout();
      return;
    }
    if (!cw) return;
    if (bgDirty) buildBackground();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const main = mainOrbit();
    if (state.show.sec) drawSectors(main);
    drawOrbits();
    drawBody();
    if (state.show.ax) drawAxes(main.el);
    drawFlight();
    drawLauncher();
    drawEffects();
    drawHud(main);
    updateReadout();
  }

  /** 飛行中的軌道（實線管狀）與預測軌道（虛線） */
  function drawOrbits() {
    const f = state.flight;
    if (f) {
      const pts = conicPts(f.el, rDraw());
      const c = col(f.color);
      ctx.strokeStyle = alpha(shade(c, colors.dark ? -0.2 : -0.1), 0.45);
      ctx.lineWidth = 3.4;
      strokePts(ctx, pts, isClosed(f.el));
      ctx.strokeStyle = alpha(shade(c, 0.45), colors.dark ? 0.55 : 0.75);
      ctx.lineWidth = 1.1;
      ctx.save(); ctx.translate(0, -0.7);
      strokePts(ctx, pts, isClosed(f.el));
      ctx.restore();
    }
    if (previewDiffers()) {
      const pv = preview();
      ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.6 : 0.55);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      strokePts(ctx, conicPts(pv.el, rDraw()), isClosed(pv.el));
      ctx.setLineDash([]);
    }
  }

  function apsisNames() {
    return isSun() ? [T('近日點', 'Perihelion'), T('遠日點', 'Aphelion')] : [T('近地點', 'Perigee'), T('遠地點', 'Apogee')];
  }

  /** 近日點、遠日點、半長軸 a、橢圓中心與另一個焦點；雙曲線畫漸近線 */
  function drawAxes(el) {
    if (el.type === 'circle' || el.e < 1e-4) return;
    const font = (narrow ? 11 : 12) + 'px system-ui, sans-serif';
    const fontB = '600 ' + font;
    const names = apsisNames();
    const rot = function (xp, yp) {
      const yq = el.dir * yp, c = Math.cos(el.omega), s = Math.sin(el.omega);
      return [c * xp - s * yq, s * xp + c * yq];
    };
    const ux = Math.cos(el.omega), uy = Math.sin(el.omega); // 指向近心點
    const peri = [el.rp * ux, el.rp * uy];
    const lineC = alpha(colors.text, 0.45);
    if (el.e < 1 && el.type !== 'parabola') {
      const a = el.a, e = el.e;
      const ctr = rot(-a * e, 0), f2 = rot(-2 * a * e, 0), apo = rot(-a * (1 + e), 0);
      const cb = rot(-a * e, el.b);
      // 長軸（淡虛線）與短軸
      ctx.strokeStyle = alpha(colors.text, 0.22);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(X(apo[0]), Y(apo[1])); ctx.lineTo(X(peri[0]), Y(peri[1])); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(ctr[0]), Y(ctr[1])); ctx.lineTo(X(cb[0]), Y(cb[1])); ctx.stroke();
      ctx.setLineDash([]);
      // 半長軸 a：中心 → 近心點（實線，兩端有小橫槓）
      ctx.strokeStyle = lineC;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(X(ctr[0]), Y(ctr[1])); ctx.lineTo(X(peri[0]), Y(peri[1])); ctx.stroke();
      const nx = -uy, ny = ux; // 世界座標中垂直於長軸
      const mid = [(ctr[0] + peri[0]) / 2, (ctr[1] + peri[1]) / 2];
      const off = 12 / k;
      const side = el.dir; // 標籤放在短軸的另一側
      ctx.textAlign = 'center';
      if (a * k > 30) pill([['a', false]], X(mid[0] - nx * off * side), Y(mid[1] - ny * off * side), colors.text, 'italic 700 ' + (narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.75);
      if (el.b * k > 26) {
        const mb = [(ctr[0] + cb[0]) / 2, (ctr[1] + cb[1]) / 2];
        pill([['b', false]], X(mb[0]) + 10 * ux, Y(mb[1]) - 10 * uy, colors.muted, 'italic 600 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif', 0.7);
      }
      // 中心與另一個焦點
      ctx.fillStyle = alpha(colors.text, 0.5);
      ctx.beginPath(); ctx.arc(X(ctr[0]), Y(ctr[1]), 2.2, 0, TAU); ctx.fill();
      if (e > 0.02) {
        cross(X(f2[0]), Y(f2[1]), 4, alpha(colors.text, 0.6));
        if (2 * a * e * k > 60 && el.rp * k > 70) {
          ctx.textAlign = 'center';
          pill(T('另一焦點', 'Empty focus'), X(f2[0]), Y(f2[1]) + 15, colors.muted, font, 0.7);
        }
      }
      // 遠日點
      if (Math.hypot(X(apo[0]) - cx, Y(apo[1]) - cy) < Math.hypot(cw, ch)) {
        diamond(X(apo[0]), Y(apo[1]), 5, colors.neg);
        apsisLabel(apo, names[1] + ' ' + fmtDist(el.ra), colors.neg, fontB);
      }
    } else {
      // 雙曲線：漸近線；拋物線沒有漸近線
      if (el.type !== 'parabola') {
        const A = -el.a, ctr = rot(A * el.e, 0);
        const th = Math.acos(-1 / el.e), L = 3 * Math.hypot(cw, ch) / k;
        ctx.strokeStyle = alpha(colors.text, 0.22);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        [1, -1].forEach(function (sg) {
          const d = rot(Math.cos(th), sg * Math.sin(th));
          ctx.beginPath(); ctx.moveTo(X(ctr[0] - d[0] * L * 0), Y(ctr[1] - d[1] * L * 0)); ctx.lineTo(X(ctr[0] + d[0] * L), Y(ctr[1] + d[1] * L)); ctx.stroke();
        });
        ctx.setLineDash([]);
        // |a|：中心 → 近心點
        ctx.strokeStyle = lineC;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(X(ctr[0]), Y(ctr[1])); ctx.lineTo(X(peri[0]), Y(peri[1])); ctx.stroke();
        if (A * k > 24) {
          ctx.textAlign = 'center';
          pill([['|a|', false]], X((ctr[0] + peri[0]) / 2) - uy * 12, Y((ctr[1] + peri[1]) / 2) - ux * 12, colors.text, 'italic 700 ' + (narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.75);
        }
      }
    }
    diamond(X(peri[0]), Y(peri[1]), 5, colors.pos);
    apsisLabel(peri, names[0] + ' ' + fmtDist(el.rp), colors.pos, fontB);
  }
  /** 點到線段的距離（畫布座標） */
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
    const u = L2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2)) : 0;
    return Math.hypot(px - x0 - u * dx, py - y0 - u * dy);
  }
  /**
   * 近／遠日點標籤：依序嘗試「外側、上方、下方、內側」，選第一個放得下、
   * 又不壓到發射箭頭的位置。
   */
  function apsisLabel(p, text, color, font) {
    const r = Math.hypot(p[0], p[1]) || 1;
    const ux = p[0] / r, uy = -p[1] / r;
    const px = X(p[0]), py = Y(p[1]);
    ctx.font = font;
    const w = ctx.measureText(text).width + 12, hh = 10;
    const g = launcherGeom();
    const side = function (u) { return u > 0.35 ? 'left' : u < -0.35 ? 'right' : 'center'; };
    const cands = [
      { al: side(ux), x: px + ux * 14, y: py + uy * 14 },
      { al: 'center', x: px, y: py - 18 },
      { al: 'center', x: px, y: py + 18 },
      { al: side(-ux), x: px - ux * 14, y: py - uy * 14 }
    ];
    let best = null;
    for (let i = 0; i < cands.length && !best; i++) {
      const c = cands[i];
      let x0 = c.al === 'left' ? c.x - 5 : c.al === 'right' ? c.x - w + 5 : c.x - w / 2;
      x0 = Math.max(2, Math.min(cw - w - 2, x0)); // pill 會被限制在畫布內
      if (c.y < 12 || c.y > ch - 12) continue;
      if (segDist(px, py, x0, c.y, x0 + w, c.y) < 9) continue; // 不可蓋住該點本身
      // 標籤矩形的中線與發射箭頭（含尖端把手）保持距離
      let d = Math.min(segDist(g.x0, g.y0, x0, c.y, x0 + w, c.y), segDist(g.tx, g.ty, x0, c.y, x0 + w, c.y) - 8);
      for (let j = 0; j <= 6; j++) d = Math.min(d, segDist(x0 + w * j / 6, c.y, g.x0, g.y0, g.tx, g.ty));
      if (d > hh + 5) best = c;
    }
    if (!best) best = cands[0];
    ctx.textAlign = best.al;
    let x = best.x;
    if (best.al === 'left') x = Math.min(x, cw - w - 2);
    if (best.al === 'right') x = Math.max(x, w + 2);
    if (best.al === 'center') x = Math.max(w / 2 + 2, Math.min(cw - w / 2 - 2, x));
    pill(text, x, Math.max(12, Math.min(ch - 12, best.y)), color, font, 0.8);
  }

  /** 中心天體：地球依比例；太陽太小，放大畫出並標示「未依比例」 */
  function bodyRadiusPx() {
    const real = P().R * k;
    return isSun() ? Math.max(real, narrow ? 8 : 10) : Math.max(real, 3);
  }
  function drawBody() {
    const R = bodyRadiusPx();
    if (isSun()) {
      const glow = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 4.2);
      glow.addColorStop(0, alpha(colors.equi, colors.dark ? 0.55 : 0.4));
      glow.addColorStop(0.4, alpha(colors['b-mech'], colors.dark ? 0.16 : 0.1));
      glow.addColorStop(1, alpha(colors['b-mech'], 0));
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, cy, R * 4.2, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      g.addColorStop(0, shade(colors.equi, 0.75));
      g.addColorStop(0.55, shade(colors.equi, colors.dark ? 0.15 : 0.25));
      g.addColorStop(1, colors['b-mech']);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    } else {
      // 大氣光暈
      const at = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.18 + 3);
      at.addColorStop(0, alpha(colors['b-wave'], colors.dark ? 0.45 : 0.3));
      at.addColorStop(1, alpha(colors['b-wave'], 0));
      ctx.fillStyle = at;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.18 + 3, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.38, R * 0.08, cx, cy, R);
      g.addColorStop(0, shade(colors['b-em'], 0.6));
      g.addColorStop(0.5, colors['b-em']);
      g.addColorStop(1, shade(colors['b-em'], -0.5));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      // 陸地的淡色斑塊（只是裝飾，固定形狀）
      if (R > 10) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
        ctx.fillStyle = alpha(colors.probe, colors.dark ? 0.4 : 0.45);
        [[-0.3, -0.2, 0.38, 0.22, 0.5], [0.25, 0.25, 0.3, 0.42, -0.3], [0.35, -0.45, 0.2, 0.12, 0.2]].forEach(function (b) {
          ctx.beginPath(); ctx.ellipse(cx + b[0] * R, cy + b[1] * R, b[2] * R, b[3] * R, b[4], 0, TAU); ctx.fill();
        });
        // 夜面：右下暗
        const sh = ctx.createLinearGradient(cx - R * 0.3, cy - R * 0.3, cx + R, cy + R);
        sh.addColorStop(0, 'rgba(0,0,0,0)');
        sh.addColorStop(1, 'rgba(0,0,0,' + (colors.dark ? 0.45 : 0.3) + ')');
        ctx.fillStyle = sh;
        ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
        ctx.restore();
      }
      ctx.strokeStyle = alpha(shade(colors['b-em'], 0.7), 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, R - 0.5), Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
    }
  }

  /** 等時間扇形（克卜勒第二定律） */
  let secCache = { key: '', list: null };
  function sectorTimes(o) {
    const el = o.el;
    const key = o.sig || previewCache.sig;
    if (secCache.key === key + '|' + state.view) return secCache.list;
    let dt, k0;
    if (el.e < 1 && el.type !== 'parabola') { dt = el.T / NSEC; k0 = 0; }
    else { dt = 2 * Math.PI * Math.sqrt(el.rp * el.rp * el.rp / el.mu) / NSEC; k0 = -NSEC / 2; }
    const list = [];
    for (let i = 0; i < NSEC; i++) {
      const t1 = el.tp + (k0 + i) * dt, t2 = t1 + dt;
      list.push({ t1: t1, t2: t2, area: K.fanArea(el, t1, t2, 400) });
    }
    list.dt = dt;
    list.exact = K.sweptArea(el, 0, dt);
    secCache = { key: key + '|' + state.view, list: list };
    return list;
  }
  /** 目前所在的扇形編號（沒有則 −1） */
  function currentSector(o, list) {
    const f = state.flight;
    if (!f || f !== o) return -1;
    const el = f.el;
    let t = f.t;
    if (el.e < 1 && el.type !== 'parabola') t = el.tp + ((t - el.tp) % el.T + el.T) % el.T;
    for (let i = 0; i < list.length; i++) if (t >= list[i].t1 && t < list[i].t2) return i;
    return -1;
  }
  function drawSectors(o) {
    const el = o.el;
    const list = sectorTimes(o);
    const cur = currentSector(o, list);
    const cA = colors.accent, cB = colors['b-optics'];
    list.forEach(function (s, i) {
      const u1 = K.anomalyAt(el, s.t1), u2 = K.anomalyAt(el, s.t2);
      const n = 40;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let j = 0; j <= n; j++) {
        const p = K.positionAtAnomaly(el, u1 + (u2 - u1) * j / n);
        ctx.lineTo(X(p.x), Y(p.y));
      }
      ctx.closePath();
      const c = i % 2 ? cB : cA;
      ctx.fillStyle = alpha(c, (i === cur ? 0.34 : 0.15) * (colors.dark ? 1.15 : 1));
      ctx.fill();
      ctx.strokeStyle = alpha(c, i === cur ? 0.7 : 0.3);
      ctx.lineWidth = i === cur ? 1.4 : 1;
      ctx.stroke();
    });
    // 兩塊代表性的面積標在畫面上：近心點旁與遠心點旁（封閉軌道）
    const closed = el.e < 1 && el.type !== 'parabola';
    const pick = closed ? [1, NSEC / 2 + 1] : [NSEC / 2 + 2]; // 避開近日點標籤
    const font = '600 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif';
    if (narrow) return; // 手機畫面太小：面積只列在下方的表格
    pick.forEach(function (i) {
      const s = list[i];
      const q = K.stateAt(el, (s.t1 + s.t2) / 2);
      const ux = q.x / q.r, uy = q.y / q.r;
      const lx = X(q.x * 0.6), ly = Y(q.y * 0.6);
      const far = q.r * k > 70;
      const x = far ? lx : X(q.x) + ux * 26, y = far ? ly : Y(q.y) - uy * 26;
      if (x < 10 || x > cw - 10 || y < 10 || y > ch - 10) return;
      ctx.textAlign = 'center';
      pill([['A', false], [String(i + 1), true], [' = ' + fmtArea(s.area), false]], x, y, shade(i % 2 ? cB : cA, colors.dark ? 0.2 : -0.2), font, 0.82);
    });
  }
  function areaUnit() { return isSun() ? K.AU * K.AU : 1e12; }
  function fmtArea(A) {
    const v = A / areaUnit();
    return (v >= 100 ? num(v, 1) : v >= 1 ? num(v, 3) : num(v, 4)) + (isSun() ? ' AU²' : '');
  }

  /** 飛行中的物體：漸淡軌跡、速度箭頭、本體 */
  function drawFlight() {
    const f = state.flight;
    if (!f) return;
    const s = flightState();
    const c = col(f.color);
    // 漸淡的軌跡
    if (state.show.trail && f.t > 0) {
      const el = f.el;
      const span = Math.min(f.t, isFinite(el.T) ? 0.3 * el.T : 2 * Math.PI * Math.sqrt(el.rp * el.rp * el.rp / el.mu) * 0.3);
      const N = 48;
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const q = K.stateAt(el, f.t - span + span * i / N), pt = [X(q.x), Y(q.y)];
        if (prev) {
          const u = i / N;
          ctx.strokeStyle = alpha(c, 0.06 + 0.7 * u * u);
          ctx.lineWidth = 1 + 3.2 * u;
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
        }
        prev = pt;
      }
    }
    const bx = X(s.x), by = Y(s.y);
    const inside = bx > -20 && bx < cw + 20 && by > -20 && by < ch + 20;
    if (inside && f.ended !== 'crash') {
      if (state.show.v) {
        const len = s.v * pxPerV();
        arrow(bx, by, s.vx / s.v, -s.vy / s.v, len, narrow ? 2.2 : 2.6, alpha(colors.pos, 0.92));
        if (len > 18) {
          ctx.textAlign = 'center';
          pill('v', bx + s.vx / s.v * (len + 11), by - s.vy / s.v * (len + 11), colors.pos, 'italic 700 ' + (narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.75);
        }
      }
      sphere(bx, by, narrow ? 5.5 : 6.5, c, true);
    } else if (inside) {
      // 撞擊點：小小的焦痕
      ctx.fillStyle = alpha(colors.text, 0.55);
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, TAU); ctx.fill();
    } else {
      offscreenMarker(s, c);
    }
  }
  /** 物體在畫面外：在邊緣畫一個指向它的小箭頭與距離 */
  function offscreenMarker(s, c) {
    const dx = X(s.x) - cx, dy = Y(s.y) - cy;
    const sc = Math.min((cw / 2 - 18) / Math.abs(dx || 1e-9), (ch / 2 - 18) / Math.abs(dy || 1e-9));
    const x = cx + dx * sc, y = cy + dy * sc, d = Math.hypot(dx, dy);
    arrow(x - dx / d * 12, y - dy / d * 12, dx / d, dy / d, 14, 2.4, c);
    ctx.textAlign = x > cx ? 'right' : 'left';
    pill(fmtDist(s.r), x - dx / d * 18 + (x > cx ? -2 : 2), y - dy / d * 18 + (y > cy ? -8 : 8), c, '600 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif', 0.8);
  }

  /** 發射點、速度箭頭，以及圓周速率／脫離速率的圈 */
  function launcherGeom() {
    const s = launchVec();
    const x0 = X(s.x), y0 = Y(s.y);
    const len = state.v0 * pxPerV();
    const ux = s.vx / state.v0, uy = -s.vy / state.v0;
    return { x0: x0, y0: y0, tx: x0 + ux * len, ty: y0 + uy * len, ux: ux, uy: uy, len: len };
  }
  function drawLauncher() {
    const g = launcherGeom();
    const kv = pxPerV();
    const rc = vCirc0() * kv, re = vEsc0() * kv;
    const active = hover || drag;
    // 兩個速率圈（虛線）
    [[rc, colors.accent, [T('v', 'v'), T('圓', 'circ')]], [re, colors['b-mech'], [T('v', 'v'), T('脫', 'esc')]]].forEach(function (r) {
      ctx.strokeStyle = alpha(r[1], active ? 0.85 : 0.55);
      ctx.lineWidth = active ? 1.5 : 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(g.x0, g.y0, r[0], 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    });
    // 圈的標籤：放在箭頭的反方向那一側，避免重疊
    const lab = function (r, color, sub, ang) {
      const x = g.x0 + Math.cos(ang) * r, y = g.y0 + Math.sin(ang) * r;
      ctx.textAlign = 'center';
      pill([['v', false], [sub, true]], x, y, color, '700 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif', 0.8);
    };
    const base = Math.atan2(g.uy, g.ux) + Math.PI;
    // 手機畫面小：圈的標籤只在拖曳時顯示（圖例已說明兩個圈的意義）
    if (!narrow || drag) {
      lab(rc, colors.accent, T('圓', 'circ'), base + 0.5);
      lab(re, colors['b-mech'], T('脫', 'esc'), base - 0.5);
    }
    // 速度箭頭
    const lw = narrow ? 2.8 : 3.2;
    arrow(g.x0, g.y0, g.ux, g.uy, g.len, lw, colors.pos);
    // 起點把手
    const hs = hover === 'start' || (drag && drag.type === 'start');
    ctx.fillStyle = colors['canvas-bg'];
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    if (hs) { ctx.fillStyle = alpha(colors.pos, 0.18); ctx.beginPath(); ctx.arc(g.x0, g.y0, 14, 0, TAU); ctx.fill(); ctx.fillStyle = colors['canvas-bg']; }
    ctx.beginPath(); ctx.arc(g.x0, g.y0, hs ? 7.5 : 6, 0, TAU); ctx.fill(); ctx.stroke();
    // 箭頭尖端把手
    const ht = hover === 'tip' || (drag && drag.type === 'tip');
    ctx.fillStyle = alpha(colors.pos, ht ? 0.28 : 0.14);
    ctx.beginPath(); ctx.arc(g.tx, g.ty, ht ? 15 : 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = alpha(colors.pos, 0.9);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(g.tx, g.ty, ht ? 15 : 11, 0, TAU); ctx.stroke();
    // 速率標籤（等於 v圓 或 v脫 時特別標出）
    const parts = [['v', false], ['0', true], [' = ' + num(state.v0 / 1000, 2) + ' km/s', false]];
    const rel = state.v0 / vCirc0();
    let tag = null;
    if (state.vSnap === 'circ' || Math.abs(rel - 1) < 1e-9) tag = [colors.accent, T('圓', 'circ')];
    else if (state.vSnap === 'esc' || Math.abs(rel - Math.SQRT2) < 1e-9) tag = [colors['b-mech'], T('脫', 'esc')];
    const font = '700 ' + (narrow ? 11 : 12) + 'px system-ui, sans-serif';
    const lx = g.tx + g.ux * 22, ly = g.ty + g.uy * 22;
    ctx.textAlign = g.ux > 0.3 ? 'left' : g.ux < -0.3 ? 'right' : 'center';
    const b = pill(parts, Math.max(8, Math.min(cw - 8, lx)), Math.max(12, Math.min(ch - 30, ly)), colors.pos, font, 0.85);
    if (tag) {
      ctx.textAlign = 'left';
      pill([[' = v', false], [tag[1], true]], b.x, b.y + b.h + 10, tag[0], font, 0.85);
    }
  }

  function drawEffects() {
    const tNow = performance.now();
    state.fx = state.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const u = (tNow - e.t0) / e.dur;
      const x = X(e.x), y = Y(e.y);
      if (e.type === 'ring') {
        ctx.strokeStyle = alpha(e.color, 0.6 * (1 - u));
        ctx.lineWidth = 2 * (1 - u) + 0.5;
        ctx.beginPath(); ctx.arc(x, y, 8 + 18 * u, 0, TAU); ctx.stroke();
      } else if (e.type === 'burst') {
        ctx.strokeStyle = alpha(colors.equi, 0.85 * (1 - u));
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = e.a0 + i * TAU / 9, r0 = 3 + 10 * u, r1 = 8 + 22 * u;
          ctx.moveTo(x + r0 * Math.cos(a), y + r0 * Math.sin(a));
          ctx.lineTo(x + r1 * Math.cos(a), y + r1 * Math.sin(a));
        }
        ctx.stroke();
      }
    });
  }

  /** 角落文字：時間、時間倍率、軌道類型、比例尺 */
  function drawHud(o) {
    const f1 = '600 ' + (narrow ? 12 : 13) + 'px system-ui, sans-serif';
    const f2 = (narrow ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const fl = state.flight;
    pill('t = ' + (fl ? fmtTime(fl.t) : '0'), 10, 14, colors.text, f1, 0.8);
    pill('×' + tsText(), 10, 14 + (narrow ? 20 : 22), colors.muted, f2, 0.7);
    // 軌道類型（右上）
    const el = o.el;
    ctx.textAlign = 'right';
    const b = pill(kindText(el, o.crashT) + '  e = ' + fmtE(el.e), cw - 10, 14, kindColor(el), f1, 0.85);
    if (previewDiffers() && state.flight) pill(T('虛線：尚未發射', 'Dashed: not launched yet'), cw - 10, 14 + b.h + 6, colors.muted, f2, 0.7);
    // 比例尺（左下）
    const target = Math.min(cw, ch) * 0.22;
    const step = niceStep(target / k / P().Lu) * P().Lu;
    const L = step * k;
    const x0 = 12, y0 = ch - 14;
    ctx.fillStyle = alpha(colors['canvas-bg'], 0.75);
    roundRect(ctx, x0 - 6, y0 - 22, L + 12, 30, 6);
    ctx.fill();
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0); ctx.lineTo(x0 + L, y0 - 4); ctx.stroke();
    ctx.font = f2;
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(isSun() ? sig(step / K.AU) + ' AU' : group(step / 1000) + ' km', x0 + L / 2, y0 - 4);
    if (isSun() && P().R * k < bodyRadiusPx()) {
      ctx.textAlign = 'right';
      pill(T('太陽大小未依比例', 'Sun not to scale'), cw - 10, ch - 14, colors.muted, f2, 0.7);
    }
  }
  function fmtE(e) { return e < 1e-6 ? '0' : e < 0.01 ? num(e, 4) : num(e, 3); }
  function kindText(el, crashT) {
    let s;
    if (el.type === 'circle') s = T('圓', 'Circle');
    else if (el.type === 'parabola') s = T('拋物線', 'Parabola');
    else if (el.type === 'hyperbola') s = T('雙曲線', 'Hyperbola');
    else s = T('橢圓', 'Ellipse');
    if (crashT != null) s += isSun() ? T('（撞上太陽）', ' (hits the Sun)') : T('（撞上地球）', ' (hits the Earth)');
    return s;
  }
  function kindColor(el) {
    return el.type === 'hyperbola' ? colors['b-mech'] : el.type === 'parabola' ? shade(colors['b-mech'], colors.dark ? 0.2 : -0.15) : colors.accent;
  }
  function tsText() {
    const v = state.ts / P().ts.unit;
    return sig(v) + (isSun() ? T(' 天/秒', ' d/s') : T(' 分鐘/秒', ' min/s'));
  }

  // ---------- 讀數 ----------
  const lastText = {};
  function setHTML(id, html) {
    if (lastText[id] === html) return;
    lastText[id] = html;
    $(id).innerHTML = html;
  }
  function updateReadout() {
    const o = mainOrbit();
    const pd = previewDiffers() && state.flight;
    // 若飛行中的軌道與滑桿設定不同，軌道卡片顯示「預測」的軌道
    const show = pd ? preview() : o, e2 = show.el;
    setHTML('oType', kindText(e2, show.crashT) + (pd ? T('（預測）', ' (predicted)') : ''));
    setHTML('oE', fmtE(e2.e));
    setHTML('oA', e2.type === 'parabola' ? '∞' : e2.a < 0 ? '−' + fmtDist(-e2.a) + T('<small>（雙曲線取負值）</small>', '<small>(negative for a hyperbola)</small>') : fmtDist(e2.a));
    setHTML('oT', fmtPeriodHTML(e2.T));
    setHTML('oRp', fmtDist(e2.rp));
    setHTML('oRa', isFinite(e2.ra) ? fmtDist(e2.ra) : '∞');
    setHTML('oEn', num(e2.energy / 1e6, Math.abs(e2.energy) < 1e7 ? 2 : 1) + ' MJ/kg');
    setHTML('oH', sci(Math.abs(e2.h), 3) + ' m<sup>2</sup>/s');
    // 即時讀數（飛行中的物體）
    const f = state.flight;
    if (f) {
      const s = flightState();
      setHTML('rT', fmtTime(f.t));
      setHTML('rR', fmtDist(s.r));
      setHTML('rV', fmtSpeed(s.v));
      setHTML('rVc', fmtSpeed(K.circularSpeed(f.el.mu, s.r)));
      setHTML('rVe', fmtSpeed(K.escapeSpeed(f.el.mu, s.r)));
      setHTML('rVv', fmtSpeed(K.visViva(f.el.mu, s.r, f.el.a)));
    } else {
      ['rT', 'rR', 'rV', 'rVc', 'rVe', 'rVv'].forEach(function (id) { setHTML(id, '—'); });
    }
    updateLaunchInfo();
    updateAreas();
  }
  function updateLaunchInfo() {
    const vc = vCirc0(), ve = vEsc0(), rel = state.v0 / vc;
    let eq = '';
    if (state.vSnap === 'circ' || Math.abs(rel - 1) < 1e-9) eq = T('（剛好等於圓周速率）', ' (exactly the circular speed)');
    else if (state.vSnap === 'esc' || Math.abs(rel - Math.SQRT2) < 1e-9) eq = T('（剛好等於脫離速率）', ' (exactly the escape speed)');
    setHTML('launchInfo', T('在 r<sub>0</sub> 處：', 'At r<sub>0</sub>: ') +
      'v<sub>' + T('圓', 'circ') + '</sub> = <b>' + fmtSpeed(vc) + '</b>、'.replace('、', T('、', ', ')) +
      'v<sub>' + T('脫', 'esc') + '</sub> = <b>' + fmtSpeed(ve) + '</b>；'.replace('；', T('；', '; ')) +
      'v<sub>0</sub> = <b>' + num(rel, 4) + '</b> v<sub>' + T('圓', 'circ') + '</sub>' + eq);
    // 速率刻度
    const pr = P().v0;
    [['gC', vc], ['gE', ve]].forEach(function (g) {
      const fr = (g[1] / 1000 - pr.min) / (pr.max - pr.min);
      const el = $(g[0]);
      el.hidden = !(fr >= 0 && fr <= 1);
      el.style.left = 'calc(9px + (100% - 18px) * ' + Math.max(0, Math.min(1, fr)).toFixed(4) + ')';
    });
    $('setC').setAttribute('aria-pressed', String(state.vSnap === 'circ'));
    $('setE').setAttribute('aria-pressed', String(state.vSnap === 'esc'));
  }

  /** 第二定律卡片：12 塊扇形的面積 */
  let areaKey = '';
  function updateAreas() {
    const o = mainOrbit(), el = o.el;
    const list = sectorTimes(o);
    const cur = currentSector(o, list);
    const key = secCache.key + '|' + cur + '|' + (window.LabSettings ? window.LabSettings.lang : '');
    if (key === areaKey) return;
    areaKey = key;
    const closed = el.e < 1 && el.type !== 'parabola';
    const unit = isSun() ? 'AU<sup>2</sup>' : '10<sup>6</sup> km<sup>2</sup>';
    setHTML('secInfo', (closed
      ? T('把一個週期分成 12 段相等的時間，每段 Δt = T/12 = ', 'The period is split into 12 equal times, Δt = T/12 = ')
      : T('開放軌道：以近日點為中心，每段 Δt = ', 'Open orbit: around perihelion, each Δt = ').replace('近日點', apsisNames()[0])) +
      '<b>' + fmtTime(list.dt) + '</b>' + T('。面積單位：', '. Area unit: ') + unit + T('（由軌道形狀量出的幾何面積）', ' (measured geometrically from the orbit)'));
    const vals = list.map(function (s) { return s.area / areaUnit(); });
    const mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
    const d = mx >= 100 ? 1 : mx >= 1 ? 3 : 4;
    $('areas').innerHTML = vals.map(function (v, i) {
      return '<li class="' + (i % 2 ? 'alt' : '') + (i === cur ? ' now' : '') + '"><span>A<sub>' + (i + 1) + '</sub></span>' + num(v, d) + '</li>';
    }).join('');
    const spread = (mx - mn) / (list.exact / areaUnit()) * 100;
    setHTML('areaSum', T('理論值 hΔt/2 = ', 'Theory hΔt/2 = ') + '<b>' + num(list.exact / areaUnit(), d) + '</b> ' + unit +
      T('；12 塊最大差異 ', '; largest difference ') + '<b>' + (spread < 1e-4 ? '&lt; 0.0001' : num(spread, 4)) + '%</b>' +
      (closed ? T('；總和 = πab = ', '; sum = πab = ') + num(K.ellipseArea(el) / areaUnit(), d) + ' ' + unit : ''));
  }

  // 畫含上標的文字：'10^8' 的 8 畫成小字上標（不使用部分 Android 字型缺字的 Unicode 上標數字）
  function fillSup(c, text, x, y, align) {
    const parts = String(text).split(/\^(-?\d+)/); // 偶數索引為一般文字，奇數索引為上標
    const base = c.font, m = base.match(/(\d+(?:\.\d+)?)px/), px = m ? +m[1] : 12;
    const small = base.replace(/(\d+(?:\.\d+)?)px/, (px * 0.72).toFixed(1) + 'px');
    let width = 0;
    parts.forEach(function (p, i) { c.font = i % 2 ? small : base; width += c.measureText(p).width; });
    const keep = c.textAlign;
    let cx = align === 'right' ? x - width : x;
    c.textAlign = 'left';
    const lift = (c.textBaseline === 'top' ? 0.1 : 0.38) * px;
    parts.forEach(function (p, i) {
      c.font = i % 2 ? small : base;
      c.fillText(p, cx, i % 2 ? y - lift : y);
      cx += c.measureText(p).width;
    });
    c.font = base; c.textAlign = keep;
  }

  // ---------- 第三定律：紀錄表與 T²–a³ 圖 ----------
  function k3Units() {
    // 太陽：T 用年、a 用 AU；地球：T² 用 10^8 s²、a³ 用 10^21 m³（比值 = 10^13 s²/m³）
    return isSun()
      ? { x: function (a) { return Math.pow(a / K.AU, 3); }, y: function (t) { return Math.pow(t / K.YEAR, 2); }, xl: 'a³ (AU³)', yl: 'T² (yr²)' }
      : { x: function (a) { return Math.pow(a, 3) / 1e21; }, y: function (t) { return t * t / 1e8; }, xl: 'a³ (10^21 m³)', yl: 'T² (10^8 s²)' };
  }
  function ratioHTML(Tp, a) {
    const r = Tp * Tp / (a * a * a);
    return isSun() ? num(r * Math.pow(K.AU, 3) / (K.YEAR * K.YEAR), 4) : sci(r, 2);
  }
  function updateHistory() {
    const sun = isSun();
    const head = '<tr><th>#</th><th>M' + (sun ? T('（太陽＝1）', ' (Sun = 1)') : T('（地球＝1）', ' (Earth = 1)')) + '</th>' +
      '<th>a' + (sun ? ' (AU)' : ' (km)') + '</th><th>T' + (sun ? T('（年）', ' (yr)') : ' (h)') + '</th><th class="ce">e</th>' +
      '<th>T<sup>2</sup>/a<sup>3</sup>' + (sun ? ' (yr<sup>2</sup>/AU<sup>3</sup>)' : ' (s<sup>2</sup>/m<sup>3</sup>)') + '</th></tr>';
    let rows = state.history.map(function (h) {
      return '<tr><td><span class="sw" style="background:' + col(h.color) + '"></span>' + h.n + '</td><td>' + num(h.M, 2) + '</td><td>' +
        (sun ? num(h.a / K.AU, 3) : group(h.a / 1000)) + '</td><td>' + (sun ? num(h.T / K.YEAR, 3) : num(h.T / 3600, 3)) + '</td><td class="ce">' + fmtE(h.e) +
        '</td><td class="k">' + ratioHTML(h.T, h.a) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr class="empty"><td colspan="6">' + T('還沒有紀錄：發射一條封閉軌道（圓或橢圓）就會出現在這裡。', 'No records yet: launch a closed orbit (circle or ellipse) to add one.') + '</td></tr>';
    $('hist').innerHTML = '<thead>' + head + '</thead><tbody>' + rows + '</tbody>';
    drawChart();
  }

  const chartCv = $('chart');
  const cctx = chartCv.getContext('2d');
  function drawChart() {
    const w = chartCv.clientWidth, h = chartCv.clientHeight;
    if (!w || !h) return;
    const d = Math.min(window.devicePixelRatio || 1, 3);
    if (chartCv.width !== Math.round(w * d)) chartCv.width = Math.round(w * d);
    if (chartCv.height !== Math.round(h * d)) chartCv.height = Math.round(h * d);
    const c = cctx;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, w, h);
    const base = colors['canvas-bg'];
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, base); gr.addColorStop(1, shade(base, colors.dark ? -0.3 : -0.04));
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    const U = k3Units();
    const pts = state.history.map(function (r) { return { x: U.x(r.a), y: U.y(r.T), color: col(r.color), M: r.M }; });
    // 各個中心質量的直線（斜率 = 4π²/GM，換成圖上的單位）
    const slope = function (M) {
      const kk = K.keplerRatio(P().mu * M); // s²/m³
      return U.y(Math.sqrt(kk)) / U.x(1); // 把 T²/a³ 換算成圖的單位：y(T)/x(a)，取 a = 1 m、T = √k s
    };
    const Ms = [];
    pts.forEach(function (p) { if (Ms.indexOf(p.M) < 0) Ms.push(p.M); });
    let xmax = 0, ymax = 0;
    pts.forEach(function (p) { xmax = Math.max(xmax, p.x); ymax = Math.max(ymax, p.y); });
    if (!pts.length) { xmax = U.x(state.view * 0.8); }
    xmax *= 1.15;
    ymax = Math.max(ymax * 1.12, pts.length ? 0 : slope(state.M) * xmax);
    if (!(ymax > 0)) ymax = slope(state.M) * xmax;
    const padL = 44, padR = 12, padT = 14, padB = 34;
    const PX = function (x) { return padL + x / xmax * (w - padL - padR); };
    const PY = function (y) { return h - padB - y / ymax * (h - padT - padB); };
    // 格線與刻度
    const fs = '11px system-ui, sans-serif';
    c.font = fs;
    c.lineWidth = 1;
    const sx = niceStep(xmax / (w < 400 ? 3 : 5)), sy = niceStep(ymax / 4);
    c.fillStyle = alpha(colors.muted, 0.95);
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let x = 0; x <= xmax + 1e-9; x += sx) {
      c.strokeStyle = alpha(colors.text, x ? 0.07 : 0.4);
      c.beginPath(); c.moveTo(Math.round(PX(x)) + 0.5, padT); c.lineTo(Math.round(PX(x)) + 0.5, h - padB); c.stroke();
      c.fillText(axisTick(x, sx), PX(x), h - padB + 4);
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = 0; y <= ymax + 1e-9; y += sy) {
      c.strokeStyle = alpha(colors.text, y ? 0.07 : 0.4);
      c.beginPath(); c.moveTo(padL, Math.round(PY(y)) + 0.5); c.lineTo(w - padR, Math.round(PY(y)) + 0.5); c.stroke();
      c.fillText(axisTick(y, sy), padL - 5, PY(y));
    }
    c.font = '600 12px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    c.textAlign = 'right'; c.textBaseline = 'bottom';
    fillSup(c, U.xl, w - padR, h - 2, 'right');
    c.textAlign = 'left'; c.textBaseline = 'top';
    fillSup(c, U.yl, padL + 4, 2, 'left');
    // 直線：目前質量（虛線）與紀錄中的各質量
    c.save();
    c.beginPath(); c.rect(padL, padT, w - padL - padR, h - padT - padB); c.clip();
    const lines = Ms.slice();
    if (lines.indexOf(state.M) < 0) lines.push(state.M);
    lines.forEach(function (M) {
      const s = slope(M);
      const cur = M === state.M;
      c.strokeStyle = alpha(colors.text, cur ? 0.5 : 0.3);
      c.lineWidth = 1.4;
      c.setLineDash(Ms.indexOf(M) < 0 ? [5, 5] : []);
      c.beginPath(); c.moveTo(PX(0), PY(0)); c.lineTo(PX(xmax), PY(s * xmax)); c.stroke();
      c.setLineDash([]);
      // 標籤：M 值
      const xe = Math.min(xmax * 0.92, ymax * 0.9 / s);
      c.font = '600 11px system-ui, sans-serif';
      c.fillStyle = alpha(colors.text, 0.75);
      c.textAlign = 'right'; c.textBaseline = 'bottom';
      c.fillText('M = ' + num(M, 2), PX(xe) - 4, PY(s * xe) - 3);
    });
    c.restore();
    // 資料點
    pts.forEach(function (p) {
      const x = PX(p.x), y = PY(p.y), r = 5;
      const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, shade(p.color, 0.6)); g.addColorStop(1, shade(p.color, -0.3));
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.strokeStyle = base; c.lineWidth = 1.2; c.stroke();
    });
    if (!pts.length) {
      c.font = '12px system-ui, sans-serif';
      c.fillStyle = colors.muted;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(T('發射封閉軌道後，資料點會落在這條線上', 'Points from closed orbits will fall on this line'), (padL + w - padR) / 2, padT + (h - padT - padB) * 0.3);
    }
  }
  function axisTick(v, step) {
    const dd = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    return num(v, dd);
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  let lastTickAt = -1;
  /** 通過近日點：輕柔的「叮」，越快音越高 */
  function periSound(vp) {
    const S = sound(); if (!S) return;
    const tNow = performance.now();
    if (tNow - lastTickAt < 90) return; // 週期很短時避免連成一串
    lastTickAt = tNow;
    const f = Math.max(300, Math.min(1700, 520 * Math.pow(vp / P().vRef, 0.8)));
    S.tone({ freq: f, dur: 0.07, type: 'sine', gain: 0.32 });
    S.tone({ freq: f * 2, dur: 0.035, type: 'sine', gain: 0.1 });
  }
  /** 脫離：柔和的上揚長音 */
  function escapeSound() {
    const S = sound(); if (!S) return;
    S.sweep({ from: 440, to: 880, dur: 0.7, type: 'sine', gain: 0.22, attack: 0.06 });
    S.tone({ freq: 1320, dur: 0.35, type: 'sine', gain: 0.08, delay: 0.35, attack: 0.05 });
  }
  /** 撞擊：短促的悶響 */
  function crashSound() {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.16, gain: 0.55, filter: 700, q: 0.8 });
    S.tone({ freq: 300, dur: 0.14, type: 'triangle', gain: 0.25 });
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function flightActive() { return state.flight && !state.flight.ended; }
  function tick(tNow) {
    const dt = Math.max(0, Math.min((tNow - lastT) / 1000, 1 / 30));
    lastT = tNow;
    const f = state.flight;
    if (state.running && f && !f.ended) {
      const t0 = f.t;
      let t1 = t0 + dt * state.ts;
      if (f.crashT != null && t1 >= f.crashT) t1 = f.crashT;
      if (K.periapsisPassages(f.el, t0, t1) > 0) {
        const vp = K.visViva(f.el.mu, f.el.rp, f.el.a);
        periSound(vp);
        if (!reducedMotion) {
          const pp = K.positionAtNu(f.el, 0);
          state.fx.push({ type: 'ring', x: pp.x, y: pp.y, t0: tNow, dur: 450, color: colors.pos });
        }
      }
      f.t = t1;
      if (isFinite(f.el.T) && Math.floor(t1 / f.el.T + 1e-9) > Math.floor(t0 / f.el.T + 1e-9) && !(f.crashT != null && t1 >= f.crashT)) missionEmit('lap', f);
      if (f.crashT != null && t1 >= f.crashT) {
        f.ended = 'crash';
        const s = flightState();
        crashSound();
        missionEmit('crash', f);
        if (!reducedMotion) state.fx.push({ type: 'burst', x: s.x, y: s.y, t0: tNow, dur: 500, a0: Math.random() * TAU });
        setStatus(isSun()
          ? T('撞上太陽了！近日點距離小於太陽半徑。', 'It hit the Sun! The perihelion distance is smaller than the Sun’s radius.')
          : T('撞上地球了！近地點距離小於地球半徑，速率不夠大或方向太偏向地球。', 'It hit the Earth! The perigee is below the surface: the launch was too slow or aimed too far inward.'));
      } else if (f.el.e >= 1 || f.el.type === 'parabola') {
        const s = flightState();
        if (s.r > 1.05 * Math.hypot(cw, ch) / 2 / k && s.x * s.vx + s.y * s.vy > 0) {
          f.ended = 'escape';
          escapeSound();
          missionEmit('escape', f);
          setStatus(T('已脫離！比能量 ε ≥ 0，物體不會再回來（v0 ≥ v脫）。', 'Escaped! The specific energy ε ≥ 0, so it never comes back (v0 ≥ v_esc).'));
        }
      }
      updateButtons();
    }
    draw();
    if ((state.running && flightActive()) || state.fx.length) requestAnimationFrame(tick);
    else loopOn = false;
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    const f = state.flight;
    $('play').textContent = !f ? T('播放', 'Play') : f.ended ? T('重播', 'Replay') : state.running ? T('暫停', 'Pause') : T('繼續', 'Resume');
    $('launch').textContent = f && !previewDiffers() ? T('重新發射', 'Launch again') : T('發射', 'Launch');
  }

  // ---------- 發射、殘影、紀錄 ----------
  function pushGhost(f) {
    state.ghosts.push({ el: f.el, color: f.color });
    while (state.ghosts.length > GHOST_MAX) state.ghosts.shift();
    bgDirty = true;
  }
  /** auto = true：載入頁面或切換天體時自動發射（不回報任務事件） */
  function launch(auto) {
    const pv = preview();
    const same = state.flight && state.flight.sig === pv.sig;
    if (state.flight && !same) pushGhost(state.flight);
    let color = same ? state.flight.color : PALETTE[state.launches % PALETTE.length];
    if (!same) state.launches++;
    state.flight = { el: pv.el, t: 0, crashT: pv.crashT, color: color, sig: pv.sig, ended: null, M: state.M, user: !auto,
      r0: state.r0, v0: state.v0, alpha: state.alpha, preset: state.preset };
    let recorded = false;
    if (!same && pv.el.e < 1 && pv.el.type !== 'parabola' && pv.crashT == null) {
      state.history.push({ n: state.launches, M: state.M, a: pv.el.a, T: pv.el.T, e: pv.el.e, color: color, user: !auto });
      while (state.history.length > HIST_MAX) state.history.shift();
      updateHistory();
      recorded = true;
    }
    if (!auto) {
      missionEmit('launch', state.flight);
      if (recorded) missionRecord();
    }
    state.fx = [];
    if (!reducedMotion || state.running) state.running = true;
    const el = pv.el;
    let msg;
    if (pv.crashT != null) msg = T('已發射：這條軌道會撞上中心天體。', 'Launched: this orbit runs into the central body.');
    else if (el.type === 'circle') msg = T('已發射：v0 = v圓 且水平發射 → 圓軌道（e = 0）。', 'Launched: v0 = v_circ, launched horizontally → circular orbit (e = 0).');
    else if (el.type === 'parabola') msg = T('已發射：v0 = v脫 → 拋物線（e = 1，ε = 0），剛好能脫離。', 'Launched: v0 = v_esc → parabola (e = 1, ε = 0): it just escapes.');
    else if (el.type === 'hyperbola') msg = T('已發射：v0 > v脫 → 雙曲線（e > 1，ε > 0），會脫離。', 'Launched: v0 > v_esc → hyperbola (e > 1, ε > 0): it escapes.');
    else msg = T('已發射：橢圓軌道（ε < 0），週期 ', 'Launched: elliptical orbit (ε < 0), period ') + fmtTime(el.T).replace(/<[^>]+>/g, '') + T('。', '.');
    setStatus(msg);
    updateButtons();
    startLoop();
    requestDraw();
  }

  // ---------- 任務模式（missions.js）：只回報使用者親自發射的軌道 ----------
  function orbitData(f) {
    const el = f.el, closed = el.e < 1 && el.type !== 'parabola';
    const vc = K.circularSpeed(el.mu, f.r0);
    return {
      preset: f.preset, M: f.M, r0: f.r0, v0: f.v0, vRel: f.v0 / vc, alpha: f.alpha / DEG,
      e: el.e, type: el.type, closed: closed, crash: f.crashT != null,
      a: el.a, T: el.T, rp: el.rp, ra: el.ra, energy: el.energy, h: el.h,
      aAU: el.a / K.AU, Tyr: el.T / K.YEAR, Th: el.T / 3600, Tmin: el.T / 60, rpKm: el.rp / 1000, raKm: el.ra / 1000,
      laps: closed ? Math.floor(f.t / el.T + 1e-9) : 0, t: f.t, sectors: state.show.sec
    };
  }
  function missionEmit(type, f) {
    if (!window.LabMission || !f || !f.user) return;
    window.LabMission.emit(type, orbitData(f));
  }
  function missionRecord() {
    if (!window.LabMission) return;
    window.LabMission.emit('record', {
      list: state.history.filter(function (h) { return h.user; }).map(function (h) {
        return { preset: state.preset, M: h.M, a: h.a, T: h.T, e: h.e };
      })
    });
  }

  $('launch').addEventListener('click', function () { state.running = true; launch(); });
  $('play').addEventListener('click', function () {
    const f = state.flight;
    if (!f) { state.running = true; launch(); return; }
    if (f.ended) { f.ended = null; f.t = 0; state.running = true; setStatus(''); updateButtons(); startLoop(); return; }
    state.running = !state.running;
    updateButtons();
    if (state.running) startLoop();
    requestDraw();
  });
  // 全部清除：清掉飛行中的軌道、殘影與第三定律紀錄（滑桿設定不變）
  function clearAll() {
    state.flight = null;
    state.ghosts = [];
    state.history = [];
    state.launches = 0;
    state.fx = [];
    bgDirty = true;
    updateHistory();
    updateButtons();
    requestDraw();
  }
  $('reset').addEventListener('click', function () {
    clearAll();
    setStatus(T('已全部清除，滑桿設定不變。按「發射」開始。', 'Everything is cleared; the slider settings are kept. Press “Launch” to start.'));
  });

  // 顯示選項（兩個「等時間扇形」勾選框同步）
  function setShow(key, on) {
    state.show[key] = on;
    if (key === 'sec') { $('showSec').checked = on; $('showSec2').checked = on; }
    if (key === 'ghost') bgDirty = true;
    requestDraw();
  }
  [['showSec', 'sec'], ['showSec2', 'sec'], ['showAx', 'ax'], ['showV', 'v'], ['showTrail', 'trail'], ['showGhost', 'ghost']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (ev) { setShow(p[1], ev.target.checked); });
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

  // ---------- 滑桿 ----------
  const elM = $('M'), elR = $('r0'), elV = $('v0'), elA = $('al'), elTs = $('ts'), elVw = $('vw');
  let quiet = false;
  /** 程式設定滑桿（不觸發自己的處理） */
  function setSlider(el, v) {
    quiet = true;
    if (window.LabNum) window.LabNum.set(el, v); else el.value = v;
    quiet = false;
  }
  function logReg(el, o) {
    const lmin = Math.log(o.min), lmax = Math.log(o.max);
    const toValue = function (pos) { return Math.exp(lmin + (lmax - lmin) * pos / 1000); };
    const toPos = function (v) { return Math.round((Math.log(v) - lmin) / (lmax - lmin) * 1000); };
    if (window.LabNum) window.LabNum.register(el, { toValue: toValue, toPos: toPos, min: o.min, max: o.max, decimals: o.dec });
    el._toValue = toValue;
  }
  function readLog(el) { return window.LabNum ? window.LabNum.value(el) : el._toValue(+el.value); }

  function refreshOutputs() {
    const pr = P();
    $('Mo').textContent = fmtSlider(val(elM), elM) + T(' 倍', ' ×');
    $('r0o').textContent = isSun() ? fmtSlider(val(elR), elR) + ' AU' : group(val(elR)) + ' km';
    $('v0o').textContent = (state.vSnap ? num(state.v0 / 1000, pr.v0.dec) : fmtSlider(val(elV), elV)) + ' km/s';
    $('alo').textContent = fmtSlider(val(elA), elA) + '°';
    $('tso').textContent = tsText();
    $('vwo').textContent = isSun() ? sig(readLog(elVw)) + ' AU' : group(readLog(elVw)) + ' km';
    $('Mlabel').textContent = isSun() ? T('質量 M（太陽質量的倍數）', 'Mass M (in solar masses)') : T('質量 M（地球質量的倍數）', 'Mass M (in Earth masses)');
    $('oRpL').innerHTML = (isSun() ? T('近日點距離', 'Perihelion distance') : T('近地點距離', 'Perigee distance')) + ' r<sub>p</sub>';
    $('oRaL').innerHTML = (isSun() ? T('遠日點距離', 'Aphelion distance') : T('遠地點距離', 'Apogee distance')) + ' r<sub>a</sub>';
  }

  /** 發射條件改變：只更新預測軌道（飛行中的物體繼續沿原軌道運動） */
  function launchChanged() {
    if (state.vSnap) {
      state.v0 = state.vSnap === 'circ' ? vCirc0() : vEsc0();
      setSlider(elV, state.v0 / 1000);
    }
    refreshOutputs();
    updateButtons();
    requestDraw();
  }

  elM.addEventListener('input', function () {
    if (quiet) return;
    state.M = val(elM);
    // 中心質量改變，飛行中的軌道就不再成立：留作殘影，等待重新發射
    if (state.flight) {
      pushGhost(state.flight);
      state.flight = null;
      setStatus(T('中心質量改變了：按「發射」用新的質量發射。', 'The central mass changed: press “Launch” to launch with the new mass.'));
    }
    launchChanged();
    drawChart();
  });
  elR.addEventListener('input', function () {
    if (quiet) return;
    state.r0 = val(elR) * P().Lu;
    launchChanged();
  });
  elV.addEventListener('input', function () {
    if (quiet) return;
    state.vSnap = null;
    state.v0 = val(elV) * 1000;
    launchChanged();
  });
  elA.addEventListener('input', function () {
    if (quiet) return;
    state.alpha = val(elA) * DEG;
    launchChanged();
  });
  elTs.addEventListener('input', function () {
    if (quiet) return;
    state.ts = readLog(elTs) * P().ts.unit;
    refreshOutputs();
    requestDraw();
  });
  elVw.addEventListener('input', function () {
    if (quiet) return;
    state.view = readLog(elVw) * P().Lu;
    setScale();
    refreshOutputs();
    requestDraw();
    drawChart();
  });

  function snapSpeed(kind) {
    state.vSnap = kind;
    launchChanged();
  }
  $('setC').addEventListener('click', function () {
    if (state.alpha !== 0) { state.alpha = 0; setSlider(elA, 0); }
    snapSpeed('circ');
  });
  $('setE').addEventListener('click', function () { snapSpeed('esc'); });

  // ---------- 中心天體切換 ----------
  function configSlider(el, o) {
    el.min = o.min; el.max = o.max; el.step = o.step; el.dataset.decimals = o.dec;
  }
  function applyPreset(name) {
    state.preset = name;
    const pr = P();
    $('pSun').setAttribute('aria-pressed', String(name === 'sun'));
    $('pEarth').setAttribute('aria-pressed', String(name === 'earth'));
    configSlider(elR, pr.r0);
    configSlider(elV, pr.v0);
    logReg(elTs, pr.ts);
    logReg(elVw, pr.vw);
    state.M = pr.M.def; setSlider(elM, pr.M.def);
    state.r0 = pr.r0.def * pr.Lu; setSlider(elR, pr.r0.def);
    state.v0 = pr.v0.def * 1000; setSlider(elV, pr.v0.def);
    state.vSnap = null;
    state.alpha = 0; setSlider(elA, 0);
    state.phi0 = pr.phi0;
    state.ts = pr.ts.def * pr.ts.unit; setSlider(elTs, pr.ts.def);
    state.view = pr.vw.def * pr.Lu; setSlider(elVw, pr.vw.def);
    secCache.key = '';
    clearAll();
    setScale();
    refreshOutputs();
  }
  $('pSun').addEventListener('click', function () {
    if (state.preset === 'sun') return;
    applyPreset('sun'); launch(true);
  });
  $('pEarth').addEventListener('click', function () {
    if (state.preset === 'earth') return;
    applyPreset('earth'); launch(true);
  });

  // ---------- 拖曳：發射點與速度箭頭 ----------
  let drag = null, hover = null;
  function evPos(ev) {
    const r = cv.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }
  function hitTest(p) {
    const g = launcherGeom();
    const dt = Math.hypot(p[0] - g.tx, p[1] - g.ty), ds = Math.hypot(p[0] - g.x0, p[1] - g.y0);
    if (dt < 24 && dt <= ds + 4) return 'tip';
    if (ds < 22) return 'start';
    return null;
  }
  function setHover(h) {
    if (h !== hover) { hover = h; requestDraw(); }
    cv.style.cursor = drag ? 'grabbing' : h ? 'grab' : '';
  }
  function dragStart(p) {
    const pr = P();
    const wx = (p[0] - cx) / k, wy = (cy - p[1]) / k;
    let r = Math.hypot(wx, wy);
    r = Math.max(pr.r0.min * pr.Lu, Math.min(pr.r0.max * pr.Lu, r));
    state.phi0 = Math.atan2(wy, wx);
    const disp = r / pr.Lu;
    setSlider(elR, disp);
    state.r0 = val(elR) * pr.Lu;
    launchChanged();
  }
  function dragTip(p) {
    const pr = P();
    const s = launchVec();
    const dx = (p[0] - X(s.x)), dy = -(p[1] - Y(s.y)); // 世界方向（y 向上）
    const c = Math.cos(state.phi0), sn = Math.sin(state.phi0);
    const along = dx * -sn + dy * c, radial = dx * c + dy * sn; // 沿切線（逆時針）與沿半徑向外的分量
    let a = Math.atan2(radial, along) / DEG;
    if (Math.abs(a) < 2.5) a = 0;
    a = Math.max(-85, Math.min(85, Math.round(a)));
    const kv = pxPerV();
    const lenPx = Math.hypot(dx, dy);
    let v = lenPx / kv;
    v = Math.max(pr.v0.min * 1000, Math.min(pr.v0.max * 1000, v));
    let snap = null;
    if (Math.abs(lenPx - vCirc0() * kv) < 7) snap = 'circ';
    else if (Math.abs(lenPx - vEsc0() * kv) < 7) snap = 'esc';
    if (a * DEG !== state.alpha) { setSlider(elA, a); state.alpha = a * DEG; }
    if (snap) { state.vSnap = snap; launchChanged(); return; }
    state.vSnap = null;
    setSlider(elV, v / 1000);
    state.v0 = val(elV) * 1000;
    launchChanged();
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = evPos(ev);
    const h = hitTest(p);
    if (!h) return; // 不在把手上：讓頁面照常捲動
    drag = { type: h };
    setHover(h);
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    ev.preventDefault();
  });
  // 手機：按在把手上時阻止頁面捲動
  cv.addEventListener('touchstart', function (ev) {
    const t = ev.touches[0]; if (!t) return;
    const r = cv.getBoundingClientRect();
    if (hitTest([t.clientX - r.left, t.clientY - r.top])) ev.preventDefault();
  }, { passive: false });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(ev);
    if (!drag) { if (ev.pointerType !== 'touch') setHover(hitTest(p)); return; }
    if (drag.type === 'start') dragStart(p); else dragTip(p);
  });
  function endDrag(ev) {
    if (!drag) return;
    drag = null;
    setHover(ev && ev.pointerType === 'mouse' ? hitTest(evPos(ev)) : null);
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag) setHover(null); });

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/kepler-3d.js 與 three.js（vendor/three/，以 import() 動態載入）；
  // 切回 2D 時整個釋放。3D 畫的是同一份物理（下面的 bridge 把本檔的狀態與 kepler-core.js 的計算交給它）。
  // =====================================================================
  let view3 = null;      // 目前的 3D 檢視（切回 2D 時釋放）
  let threeLib = null;   // { THREE, OrbitControls }
  let loadToken = 0;
  let cone3 = false;     // 3D 的「圓錐截痕」
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, state: state, colors: colors, reducedMotion: reducedMotion, coneOn: false,
    P: P, isSun: isSun, mainOrbit: mainOrbit, preview: preview, previewDiffers: previewDiffers, flightState: flightState,
    launchVec: launchVec, launchSig: launchSig, vCirc0: vCirc0, vEsc0: vEsc0, conicPts: conicPts,
    sectorTimes: sectorTimes, currentSector: currentSector, apsisNames: apsisNames,
    fmtDist: fmtDist, fmtArea: fmtArea, fmtTime: fmtTime, fmtE: fmtE, kindText: kindText, kindColor: kindColor, tsText: tsText,
    num: num, sig: sig, group: group, niceStep: niceStep, alpha: alpha, shade: shade, col: col,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };

  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Kepler3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Kepler3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/kepler-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Kepler3D) throw new Error('kepler-3d.js did not load');
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
    $('resetCam').hidden = !is3;
    $('camBar').hidden = !is3;
    $('coneNote').hidden = !(is3 && cone3);
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return; // 載入期間已切回 2D
        bridge.coneOn = cone3;
        view3 = window.Kepler3D.create(lib, host3, bridge);
        stage.classList.add('is3d');
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); draw(); } });
        draw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewNotes();
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateViewNotes();
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('camTop').addEventListener('click', function () { if (view3) view3.camTo('top'); });
  $('camEdge').addEventListener('click', function () { if (view3) view3.camTo('edge'); });
  $('cone3').addEventListener('click', function () {
    cone3 = !cone3;
    $('cone3').setAttribute('aria-pressed', String(cone3));
    updateViewNotes();
    if (view3) { view3.setCone(cone3); draw(); }
  });

  // ---------- 啟動 ----------
  readColors();
  applyPreset('sun');
  updateSoundButton();
  function themeChanged() {
    readColors();
    bgDirty = true;
    areaKey = '';
    for (const id in lastText) delete lastText[id];
    refreshOutputs();
    updateHistory();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { drawChart(); }).observe(chartCv);
  } else window.addEventListener('resize', function () { resize(); drawChart(); });
  resize();
  launch(true);
  if (reducedMotion) {
    state.running = false;
    updateButtons();
    setStatus(T('已偵測到「減少動態效果」設定：按「繼續」開始。', 'Reduced motion is on: press “Resume” to start.'));
  }
})();
