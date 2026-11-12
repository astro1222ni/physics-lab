/* image-digitization-core.js — 「圖片數位化：取樣、解析度與色深」的計算核心（與畫面分離，Node 單元測試：tests/image-digitization-core.test.js）
 *
 * 原圖：五張全部用數學式畫出來的「連續」圖（不用任何照片）。座標 u、v 都從 0 到 1（u 向右、v 向下），畫面寬高比 4:3；
 *   以「畫面寬」為長度單位時，x = u、y = 0.75 v。顏色是 sRGB 的代碼值 0–255（浮點數，還沒量化）。
 * 取樣：把畫面切成 w × h 格，每一格（像素）取一個顏色。
 *   'center'：取每格中心點的顏色（教科書上的「取樣」）。
 *   'area'  ：整格平均（像相機的感光元件收集整格的光）。棋盤與視力表是幾何圖形，平均值用面積精確算出；
 *             其他圖用每格 s × s 個子取樣點平均（s 依像素數調整，總共約 26 萬點）。平均是直接對 sRGB 代碼值做。
 * 量化：每個色版用 b 位元，共 L = 2^b 階；代碼 q = round(x ÷ 255 × (L − 1))，存回 0–255 的顯示值 = round(q × 255 ÷ (L − 1))。
 *   灰階先用 ITU-R BT.601 的亮度公式 Y = 0.299 R + 0.587 G + 0.114 B 轉成一個色版。
 * 檔案大小（未壓縮、不含檔頭）：位元數 = w × h × 每像素位元數（灰階 b、彩色 3b）；位元組 = ⌈位元數 ÷ 8⌉；1 KB = 1000 B、1 KiB = 1024 B。
 */
(function (root) {
  'use strict';
  const ASPECT = 0.75;                 // 高 ÷ 寬
  const W_MAX = 320, H_MAX = 240;
  const SCENES = ['sunset', 'checker', 'rings', 'eyechart', 'wheel'];
  const RING_K = 256;                  // 同心圓：亮度 = ½ + ½ cos(π K r²)，r 以畫面寬為單位；局部條紋頻率 = K r（每個畫面寬幾週）
  const CHECK_NX = 24, CHECK_NY = 18;  // 棋盤：橫 24 格、直 18 格，畫面邊緣各切掉半格
  const BUDGET = 260000;               // 整格平均的子取樣點總數上限

  const clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  const lerp = function (a, b, t) { return a + (b - a) * t; };

  // =====================================================================
  // 解析度、檔案大小、量化
  // =====================================================================
  /** 固定 4:3 時，寬 w 對應的高（四捨五入，至少 1） */
  function heightFor(w) { return clamp(Math.round(w * ASPECT), 1, H_MAX); }
  function widthFor(h) { return clamp(Math.round(h / ASPECT), 1, W_MAX); }
  /** 每像素位元數 */
  function bppOf(mode, b) { return mode === 'gray' ? b : 3 * b; }
  /** 可表示的顏色數 2^bpp */
  function colorsOf(mode, b) { return Math.pow(2, bppOf(mode, b)); }
  /** 未壓縮、不含檔頭的檔案大小 */
  function fileSize(w, h, bpp) {
    const bits = w * h * bpp, bytes = Math.ceil(bits / 8);
    return { bits: bits, bytes: bytes, kB: bytes / 1000, KiB: bytes / 1024, MB: bytes / 1e6, MiB: bytes / 1048576 };
  }
  /** 0–255 的值量化成 b 位元：回傳代碼 */
  function quantCode(x, b) {
    const L = (1 << b) - 1;
    return clamp(Math.round(x / 255 * L), 0, L);
  }
  /** 代碼還原成 0–255 的顯示值 */
  function codeToValue(q, b) { const L = (1 << b) - 1; return Math.round(q * 255 / L); }
  function quantValue(x, b) { return codeToValue(quantCode(x, b), b); }
  /** BT.601 亮度（灰階） */
  function luma(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }
  /** 代碼寫成 b 位元的二進位字串 */
  function binary(q, b) { let s = q.toString(2); while (s.length < b) s = '0' + s; return s; }

  // =====================================================================
  // HSV → RGB（Smith 1978 的六角錐模型），h 為度，s、v 為 0–1，回傳 0–255
  // =====================================================================
  function hsv2rgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, hp = h / 60, x = c * (1 - Math.abs(hp % 2 - 1)), m = v - c;
    let r, g, b;
    if (hp < 1) { r = c; g = x; b = 0; }
    else if (hp < 2) { r = x; g = c; b = 0; }
    else if (hp < 3) { r = 0; g = c; b = x; }
    else if (hp < 4) { r = 0; g = x; b = c; }
    else if (hp < 5) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  // =====================================================================
  // 原圖一：山景日落
  // =====================================================================
  const SUN = { u: 0.66, v: 0.60, r: 0.045 };       // 太陽：圓心（u, v），半徑以畫面寬為單位
  const HORIZON = 0.72;                              // 湖面從這裡開始
  const BAND_U = 0.92;                               // 天空色帶的量測線
  // 天空：R 由上到下等速增加（色帶的量測主要看它），G、B 讓顏色由靛藍、紫、玫瑰到橘
  function skyColor(v) {
    const t = clamp(v / HORIZON, 0, 1.2);
    const r = clamp(lerp(20, 255, Math.min(t, 1)), 0, 255);
    let g, b;
    if (t < 0.5) g = lerp(28, 44, t / 0.5); else g = lerp(44, 176, Math.min(1, (t - 0.5) / 0.5));
    if (t < 0.42) b = lerp(104, 132, t / 0.42); else if (t < 0.72) b = lerp(132, 104, (t - 0.42) / 0.3); else b = lerp(104, 84, Math.min(1, (t - 0.72) / 0.28));
    return [r, g, b];
  }
  const tent = function (u, c, w) { const d = Math.abs(u - c) / w; return d >= 1 ? 0 : (1 - d) * (1 - d * 0.35); };
  /** 遠山的稜線（v 值，越小越高） */
  function ridgeFar(u) {
    return 0.665 - 0.17 * tent(u, 0.20, 0.24) - 0.11 * tent(u, 0.43, 0.17) - 0.075 * tent(u, 0.77, 0.15) - 0.05 * tent(u, 0.58, 0.1)
      - 0.008 * Math.sin(u * 47 + 0.6) - 0.005 * Math.sin(u * 113 + 2.1);
  }
  /** 近山的稜線 */
  function ridgeNear(u) {
    return 0.735 - 0.13 * tent(u, 0.06, 0.2) - 0.085 * tent(u, 0.3, 0.16) - 0.045 * tent(u, 0.5, 0.12)
      - 0.006 * Math.sin(u * 71 + 1.3) - 0.004 * Math.sin(u * 157);
  }
  function sunsetCol(u) { return { u: u, rf: ridgeFar(u), rn: ridgeNear(u), du: u - SUN.u }; }
  function sunsetAt(c, v) {
    const u = c.u;
    if (v >= HORIZON && v >= c.rn) {
      // 湖面：倒映天空（較暗）、太陽的光柱與細細的水波
      const vm = HORIZON - (v - HORIZON) * 1.6;
      const s = skyColor(Math.max(0.05, vm));
      const depth = (v - HORIZON) / (1 - HORIZON);
      const wave = 0.5 + 0.5 * Math.sin(v * 260 + Math.sin(u * 23) * 1.5);
      const k = 0.62 - 0.22 * depth;
      const streak = Math.exp(-(c.du * c.du) / (0.0016 + 0.01 * depth)) * (0.35 + 0.65 * wave) * (1 - depth * 0.7);
      return [clamp(s[0] * k + 210 * streak, 0, 255), clamp(s[1] * k + 150 * streak, 0, 255), clamp(s[2] * k + 70 * streak, 0, 255)];
    }
    if (v >= c.rn) {
      const t = clamp((v - c.rn) / 0.12, 0, 1);
      return [lerp(52, 30, t), lerp(36, 22, t), lerp(70, 46, t)];
    }
    if (v >= c.rf) {
      const t = clamp((v - c.rf) / 0.14, 0, 1);
      // 面向太陽的山坡稍亮
      const lit = 14 * Math.exp(-(c.du * c.du) / 0.02);
      return [lerp(126, 88, t) + lit, lerp(84, 60, t) + lit * 0.6, lerp(132, 108, t)];
    }
    const s = skyColor(v);
    const dx = c.du, dy = (v - SUN.v) * ASPECT, d2 = dx * dx + dy * dy;
    if (d2 <= SUN.r * SUN.r) return [255, 246, 222];
    const glow = Math.exp(-d2 / 0.012);
    return [clamp(s[0] + 40 * glow, 0, 255), clamp(s[1] + 78 * glow, 0, 255), clamp(s[2] + 40 * glow, 0, 255)];
  }
  /** 量測線上「天空」的下緣（v）：遠山、近山與太陽都不算天空 */
  function skyLimit(u0, u1) {
    let lim = 1;
    for (let k = 0; k <= 8; k++) {
      const u = lerp(u0, u1, k / 8);
      lim = Math.min(lim, ridgeFar(u), ridgeNear(u), HORIZON);
    }
    if (u1 >= SUN.u - SUN.r * 3 && u0 <= SUN.u + SUN.r * 3) lim = Math.min(lim, SUN.v - SUN.r * 3 / ASPECT);
    return lim;
  }

  // =====================================================================
  // 原圖二：棋盤（橫 24 格、直 18 格，邊緣各切半格）
  // =====================================================================
  /** 第 kx 欄、第 ky 列的方格：偶數和是白、奇數和是黑 */
  function checkerAt(u, v) {
    const kx = Math.floor(u * CHECK_NX + 0.5), ky = Math.floor(v * CHECK_NY + 0.5);
    return ((kx + ky) % 2 === 0) ? 255 : 0;
  }
  /** 中心點取樣用整數算（避免中心剛好落在格線時的浮點誤差）：第 i 欄中心所在的方格欄號 */
  function checkerCol(i, w) { return Math.floor(((2 * i + 1) * CHECK_NX + w) / (2 * w)); }
  function checkerRow(j, h) { return Math.floor(((2 * j + 1) * CHECK_NY + h) / (2 * h)); }
  /** 方波 (−1)^floor(t) 從 0 積分到 t（三角波，0–1） */
  function sqInt(t) { const f = Math.floor(t), r = t - f; return (f % 2 === 0) ? r : 1 - r; }
  /** 方波在 [a, b]（以畫面寬或高的比例）上的平均，n 為格數 */
  function sqAvg(a, b, n) { const ta = a * n + 0.5, tb = b * n + 0.5; return (sqInt(tb) - sqInt(ta)) / (tb - ta); }

  // =====================================================================
  // 原圖三：同心圓（亮度 ½ + ½ cos(π K r²)）
  // =====================================================================
  function ringsAt(dx2, v) { const dy = (v - 0.5) * ASPECT; const g = 127.5 + 127.5 * Math.cos(Math.PI * RING_K * (dx2 + dy * dy)); return [g, g, g]; }
  /** 寬 w（每個畫面寬 w 個樣本）時，不會混疊的範圍：|x − ½| < w ÷ (2K)，|y − 0.375| < (h ÷ 0.75) ÷ (2K)（以畫面寬為單位） */
  function nyquistBox(w, h) { return { hx: w / (2 * RING_K), hy: (h / ASPECT) / (2 * RING_K) }; }

  // =====================================================================
  // 原圖四：視力表（翻滾 E），座標單位 U = 畫面寬 ÷ 4000，全部是整數
  // =====================================================================
  const EU = 4000, EV = 3000;
  // e：E 的邊長；n：個數；g：間隔；x0、y0：第一個 E 的左上角
  const EROWS = [
    { e: 800, n: 3, g: 400, y0: 340 },
    { e: 400, n: 6, g: 200, y0: 1340 },
    { e: 200, n: 11, g: 100, y0: 1940 },
    { e: 100, n: 24, g: 40, y0: 2320 },
    { e: 50, n: 40, g: 30, y0: 2600 }
  ];
  (function () {
    let seed = 20261112;
    const rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    EROWS.forEach(function (r) {
      r.s = r.e / 5;
      r.x0 = (EU - (r.n * r.e + (r.n - 1) * r.g)) / 2;
      r.dirs = [];
      let prev = -1;
      for (let k = 0; k < r.n; k++) { let d; do { d = Math.floor(rnd() * 4); } while (d === prev); r.dirs.push(d); prev = d; }
      // 每個 E 拆成四個不重疊的長方形（在 5 × 5 的筆畫格裡）：dir 0 開口向右、1 向下、2 向左、3 向上
      r.rects = r.dirs.map(function (d, k) {
        const ox = r.x0 + k * (r.e + r.g), oy = r.y0, s = r.s;
        const base = d === 0 ? [[0, 0, 1, 5], [1, 0, 5, 1], [1, 2, 5, 3], [1, 4, 5, 5]]
          : d === 1 ? [[0, 0, 5, 1], [0, 1, 1, 5], [2, 1, 3, 5], [4, 1, 5, 5]]
          : d === 2 ? [[4, 0, 5, 5], [0, 0, 4, 1], [0, 2, 4, 3], [0, 4, 4, 5]]
          : [[0, 4, 5, 5], [0, 0, 1, 4], [2, 0, 3, 4], [4, 0, 5, 4]];
        return base.map(function (q) { return [ox + q[0] * s, oy + q[1] * s, ox + q[2] * s, oy + q[3] * s]; });
      });
    });
  })();
  /** 點 (X, Y)（單位 U）是否在墨水上；col 為整數比較用的分母技巧：判斷 a ≤ X < b */
  function eyeInkAt(X, Y) {
    for (let k = 0; k < EROWS.length; k++) {
      const r = EROWS[k];
      if (Y < r.y0 || Y >= r.y0 + r.e) continue;
      const rel = X - r.x0, pitch = r.e + r.g, idx = Math.floor(rel / pitch);
      if (idx < 0 || idx >= r.n) return false;
      const rs = r.rects[idx];
      for (let q = 0; q < 4; q++) if (X >= rs[q][0] && X < rs[q][2] && Y >= rs[q][1] && Y < rs[q][3]) return true;
      return false;
    }
    return false;
  }
  /** 中心點取樣（精確）：第 i 欄、第 j 列的中心，X = 4000(2i+1)/(2w)、Y = 3000(2j+1)/(2h)，用整數比較 */
  function eyeInkCenter(i, j, w, h) {
    const xn = EU * (2 * i + 1), xd = 2 * w, yn = EV * (2 * j + 1), yd = 2 * h;   // X = xn/xd、Y = yn/yd
    for (let k = 0; k < EROWS.length; k++) {
      const r = EROWS[k];
      if (yn < r.y0 * yd || yn >= (r.y0 + r.e) * yd) continue;
      const pitch = r.e + r.g, idx = Math.floor((xn - r.x0 * xd) / (pitch * xd));
      if (idx < 0 || idx >= r.n) return false;
      const rs = r.rects[idx];
      for (let q = 0; q < 4; q++) if (xn >= rs[q][0] * xd && xn < rs[q][2] * xd && yn >= rs[q][1] * yd && yn < rs[q][3] * yd) return true;
      return false;
    }
    return false;
  }
  /** 長方形 [x0, x1) × [y0, y1)（單位 U）被墨水蓋住的面積比例 */
  function eyeCoverage(x0, y0, x1, y1) {
    let area = 0;
    for (let k = 0; k < EROWS.length; k++) {
      const r = EROWS[k];
      if (y1 <= r.y0 || y0 >= r.y0 + r.e) continue;
      const pitch = r.e + r.g;
      const a = Math.max(0, Math.floor((x0 - r.x0) / pitch)), b = Math.min(r.n - 1, Math.floor((x1 - r.x0) / pitch));
      for (let idx = a; idx <= b; idx++) {
        const rs = r.rects[idx];
        for (let q = 0; q < 4; q++) {
          const ox = Math.min(x1, rs[q][2]) - Math.max(x0, rs[q][0]), oy = Math.min(y1, rs[q][3]) - Math.max(y0, rs[q][1]);
          if (ox > 0 && oy > 0) area += ox * oy;
        }
      }
    }
    return area / ((x1 - x0) * (y1 - y0));
  }
  /** 第 k 列 E 的筆畫寬是幾個像素（橫向） */
  function eyeStrokePx(k, w) { return EROWS[k].s / EU * w; }
  /** 每一列的所有邊都剛好落在像素的格線上（數位化後一點不差）。回傳布林陣列 */
  function eyeExactRows(w, h) {
    return EROWS.map(function (r) {
      const xs = [], ys = [];
      r.rects.forEach(function (rs) { rs.forEach(function (q) { xs.push(q[0], q[2]); ys.push(q[1], q[3]); }); });
      const okX = xs.every(function (X) { return (X * w) % EU === 0; });
      const okY = ys.every(function (Y) { return (Y * h) % EV === 0; });
      return okX && okY;
    });
  }
  /** 從最上面一列起，連續幾列一點不差 */
  function eyeRowsExact(w, h) { const a = eyeExactRows(w, h); let n = 0; while (n < a.length && a[n]) n++; return n; }

  // =====================================================================
  // 原圖五：色相環（HSV 圓盤，V = 1；色相 = 角度，飽和度 = 半徑）
  // =====================================================================
  const WHEEL = { cx: 0.5, cy: 0.375, R: 0.33, bg: [36, 38, 44] };
  /** 畫面上一點的色相（度，紅 0°、黃 60°、綠 120°、青 180°、藍 240°、洋紅 300°，逆時針）與飽和度；圓外回傳 null */
  function wheelPolar(u, v) {
    const dx = u - WHEEL.cx, dy = v * ASPECT - WHEEL.cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > WHEEL.R) return null;
    let hue = Math.atan2(-dy, dx) * 180 / Math.PI;
    if (hue < 0) hue += 360;
    return { hue: hue, sat: r / WHEEL.R };
  }
  function wheelAt(u, v) { const p = wheelPolar(u, v); return p ? hsv2rgb(p.hue, p.sat, 1) : WHEEL.bg.slice(); }

  // =====================================================================
  // 共用：任一點的顏色、整張圖的取樣
  // =====================================================================
  /** 原圖在 (u, v) 的顏色（0–255 浮點數） */
  function colorAt(scene, u, v) {
    switch (scene) {
      case 'sunset': return sunsetAt(sunsetCol(u), v);
      case 'checker': { const g = checkerAt(u, v); return [g, g, g]; }
      case 'rings': { const dx = u - 0.5; return ringsAt(dx * dx, v); }
      case 'eyechart': { const g = eyeInkAt(u * EU, v * EV) ? 0 : 255; return [g, g, g]; }
      case 'wheel': return wheelAt(u, v);
      default: return [0, 0, 0];
    }
  }
  /** 平滑的圖（日落、同心圓、色相環）：每一欄先算好只和 u 有關的部分 */
  function columnFn(scene) {
    if (scene === 'sunset') return { col: sunsetCol, at: sunsetAt };
    if (scene === 'rings') return { col: function (u) { const d = u - 0.5; return d * d; }, at: ringsAt };
    return { col: function (u) { return u; }, at: wheelAt };
  }
  /** 整格平均的子取樣數 s（每格 s × s 點） */
  function subSamples(w, h) { return clamp(Math.round(Math.sqrt(BUDGET / (w * h))), 2, 16); }

  /**
   * 取樣：回傳 Float32Array（w × h × 3，列優先，由左上開始），值為 0–255 的浮點數（還沒量化）
   */
  function sample(scene, w, h, method) {
    const out = new Float32Array(w * h * 3);
    if (scene === 'checker') {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let g;
        if (method === 'center') g = ((checkerCol(i, w) + checkerRow(j, h)) % 2 === 0) ? 255 : 0;
        else g = 255 * (1 + sqAvg(i / w, (i + 1) / w, CHECK_NX) * sqAvg(j / h, (j + 1) / h, CHECK_NY)) / 2;
        const o = (j * w + i) * 3; out[o] = out[o + 1] = out[o + 2] = g;
      }
      return out;
    }
    if (scene === 'eyechart') {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let g;
        if (method === 'center') g = eyeInkCenter(i, j, w, h) ? 0 : 255;
        else g = 255 * (1 - eyeCoverage(EU * i / w, EV * j / h, EU * (i + 1) / w, EV * (j + 1) / h));
        const o = (j * w + i) * 3; out[o] = out[o + 1] = out[o + 2] = g;
      }
      return out;
    }
    const F = columnFn(scene);
    if (method === 'center') {
      for (let i = 0; i < w; i++) {
        const c = F.col((i + 0.5) / w);
        for (let j = 0; j < h; j++) {
          const p = F.at(c, (j + 0.5) / h), o = (j * w + i) * 3;
          out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2];
        }
      }
      return out;
    }
    const s = subSamples(w, h), n = s * s;
    for (let i = 0; i < w; i++) {
      const cols = [];
      for (let a = 0; a < s; a++) cols.push(F.col((i + (a + 0.5) / s) / w));
      for (let j = 0; j < h; j++) {
        let r = 0, g = 0, b = 0;
        for (let a = 0; a < s; a++) for (let c = 0; c < s; c++) {
          const p = F.at(cols[a], (j + (c + 0.5) / s) / h);
          r += p[0]; g += p[1]; b += p[2];
        }
        const o = (j * w + i) * 3;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
      }
    }
    return out;
  }

  /**
   * 量化：samples 為 sample() 的結果。回傳
   *   codes：每像素的代碼（灰階一個、彩色三個，Uint8Array）
   *   rgba ：顯示用的 0–255 RGBA（Uint8ClampedArray，可直接放進 ImageData）
   *   colors：實際用到幾種顏色；err：平均量化誤差（0–255 單位，對每個色版平均）
   */
  function quantize(samples, w, h, mode, b) {
    const N = w * h, ch = mode === 'gray' ? 1 : 3;
    const codes = new Uint8Array(N * ch), rgba = new Uint8ClampedArray(N * 4);
    const L = (1 << b) - 1, seen = new Set();
    let err = 0;
    for (let k = 0; k < N; k++) {
      const o = k * 3;
      if (ch === 1) {
        const y = luma(samples[o], samples[o + 1], samples[o + 2]);
        const q = clamp(Math.round(y / 255 * L), 0, L), d = Math.round(q * 255 / L);
        codes[k] = q; rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = d; rgba[k * 4 + 3] = 255;
        err += Math.abs(d - y);
        seen.add(q);
      } else {
        let key = 0;
        for (let c = 0; c < 3; c++) {
          const x = samples[o + c], q = clamp(Math.round(x / 255 * L), 0, L), d = Math.round(q * 255 / L);
          codes[k * 3 + c] = q; rgba[k * 4 + c] = d;
          err += Math.abs(d - x);
          key = key * 256 + q;
        }
        rgba[k * 4 + 3] = 255;
        seen.add(key);
      }
    }
    return { codes: codes, rgba: rgba, colors: seen.size, err: err / (N * ch) };
  }

  /**
   * 天空的色帶（只有山景日落）：量測線（u = 0.92）所在的那一欄，從最上面到天空下緣為止，
   * 量化後「顏色完全相同」的連續列數的最大值。回傳 { rows（天空有幾列）, col（第幾欄）, band, bandAt（最長色帶從第幾列開始）, bandPrev（少 1 位元時；b = 1 為 null） }
   */
  function skyBand(samples, w, h, mode, b) {
    const i = Math.min(w - 1, Math.floor(BAND_U * w));
    const lim = skyLimit(i / w, (i + 1) / w);
    let rows = 0;
    while (rows < h && (rows + 1) / h <= lim) rows++;
    const run = function (bb) {
      if (rows === 0) return { best: 0, at: 0 };
      let best = 1, at = 0, cur = 1, start = 0, prev = null;
      for (let j = 0; j < rows; j++) {
        const o = (j * w + i) * 3;
        let key;
        if (mode === 'gray') key = quantCode(luma(samples[o], samples[o + 1], samples[o + 2]), bb);
        else key = (quantCode(samples[o], bb) * 256 + quantCode(samples[o + 1], bb)) * 256 + quantCode(samples[o + 2], bb);
        if (j > 0) { if (key === prev) { cur++; if (cur > best) { best = cur; at = start; } } else { cur = 1; start = j; } }
        prev = key;
      }
      return { best: best, at: at };
    };
    const now = run(b);
    return { rows: rows, col: i, band: now.best, bandAt: now.at, bandPrev: b > 1 ? run(b - 1).best : null };
  }

  /** 棋盤：每個像素都剛好只蓋住一個方格（像素格線對齊方格邊）→ 數位化後和原圖一模一樣 */
  function checkerFaithful(w, h) { return w % (2 * CHECK_NX) === 0 && h % (2 * CHECK_NY) === 0; }

  /** 原圖的顯示用點陣（W × H，RGBA）：日落與色相環每格 2 × 2 點平均，棋盤與視力表用精確面積，同心圓用整格平均 */
  function raster(scene, W, H) {
    // 同心圓也用整格平均：外圈條紋很細，點陣比條紋粗時平均成灰色，原圖本身才不會出現疊紋
    const s = sample(scene, W, H, scene === 'sunset' || scene === 'wheel' ? 'center' : 'area');
    const out = new Uint8ClampedArray(W * H * 4);
    if (scene === 'checker' || scene === 'eyechart' || scene === 'rings') {
      for (let k = 0; k < W * H; k++) { out[k * 4] = s[k * 3]; out[k * 4 + 1] = s[k * 3 + 1]; out[k * 4 + 2] = s[k * 3 + 2]; out[k * 4 + 3] = 255; }
      return out;
    }
    // 日落、色相環：再用 2 × 2 子取樣把邊緣（山的稜線、圓盤的邊）抗鋸齒
    const F = columnFn(scene);
    for (let i = 0; i < W; i++) {
      const c0 = F.col((i + 0.25) / W), c1 = F.col((i + 0.75) / W);
      for (let j = 0; j < H; j++) {
        const v0 = (j + 0.25) / H, v1 = (j + 0.75) / H;
        const a = F.at(c0, v0), b = F.at(c1, v0), c = F.at(c0, v1), d = F.at(c1, v1), o = (j * W + i) * 4;
        out[o] = (a[0] + b[0] + c[0] + d[0]) / 4; out[o + 1] = (a[1] + b[1] + c[1] + d[1]) / 4; out[o + 2] = (a[2] + b[2] + c[2] + d[2]) / 4; out[o + 3] = 255;
      }
    }
    return out;
  }

  const api = {
    ASPECT: ASPECT, W_MAX: W_MAX, H_MAX: H_MAX, SCENES: SCENES, RING_K: RING_K, CHECK_NX: CHECK_NX, CHECK_NY: CHECK_NY,
    SUN: SUN, HORIZON: HORIZON, BAND_U: BAND_U, WHEEL: WHEEL, EROWS: EROWS, EU: EU, EV: EV,
    heightFor: heightFor, widthFor: widthFor, bppOf: bppOf, colorsOf: colorsOf, fileSize: fileSize,
    quantCode: quantCode, codeToValue: codeToValue, quantValue: quantValue, luma: luma, binary: binary, hsv2rgb: hsv2rgb,
    skyColor: skyColor, ridgeFar: ridgeFar, ridgeNear: ridgeNear, skyLimit: skyLimit,
    checkerAt: checkerAt, checkerCol: checkerCol, checkerRow: checkerRow, checkerFaithful: checkerFaithful, sqAvg: sqAvg,
    nyquistBox: nyquistBox, eyeInkAt: eyeInkAt, eyeInkCenter: eyeInkCenter, eyeCoverage: eyeCoverage, eyeStrokePx: eyeStrokePx,
    eyeExactRows: eyeExactRows, eyeRowsExact: eyeRowsExact, wheelPolar: wheelPolar,
    colorAt: colorAt, subSamples: subSamples, sample: sample, quantize: quantize, skyBand: skyBand, raster: raster
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ImageDigitCore = api;
})(typeof window !== 'undefined' ? window : this);
