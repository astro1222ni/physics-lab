/* image-digitization.js — 「圖片數位化：取樣、解析度與色深」的畫面與互動（計算在 image-digitization-core.js；共用繪圖工具 LabDraw 在 drawkit.js；3D 色立方在 image-digitization-3d.js，切到 3D 時才載入）
 *
 * 畫面上的數值都由核心算出：左邊是原圖（數學式畫的連續圖，用細點陣顯示），右邊是同一張圖取樣成 w × h 像素、每色版 b 位元量化的結果。
 * 任務事件只在使用者操作之後送出（見 js/missions/image-digitization.js 開頭的說明）。 */
(function () {
  'use strict';
  const K = window.ImageDigitCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const alpha = D.alpha, shade = D.shade;
  const HD_BYTES = 1920 * 1080 * 3;       // 1920 × 1080 全彩（24 位元）
  const REC_MAX = 12;                     // 記錄表最多幾列
  const CLOUD_MAX = 3000;                 // 3D 點雲最多幾個像素

  // ---------- 狀態 ----------
  const state = {
    scene: 'sunset', w: 64, h: 48, lock: true, method: 'center', mode: 'color', b: 8,
    split: 0.5, grid: false, dots: false, nyq: true,
    sel: null,          // 選取的位置 { u, v }（0–1；改解析度後對應到新的像素）
    view: '2d', recs: []
  };
  let cur = null;       // 目前的計算結果

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface',
      'id-sel', 'id-nyq', 'id-band', 'id-r', 'id-g', 'id-b', 'id-frame', 'id-ok', 'id-warn']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, family) { return (weight ? weight + ' ' : '') + px + 'px ' + (family || FONT); }
  function intText(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /** 最多 d 位小數，去掉多餘的 0 */
  function num(x, d) {
    if (!isFinite(x)) return '—';
    let s = x.toFixed(d);
    if (d > 0) s = s.replace(/\.?0+$/, '');
    const p = s.split('.');
    return intText(p[0]) + (p[1] ? '.' + p[1] : '');
  }
  /** 有效數字 3 位的小數字（例如 0.148） */
  function sig3(x) {
    if (x === 0) return '0';
    const d = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(x))));
    return num(x, Math.min(d, 6));
  }
  function hex2(v) { return (v < 16 ? '0' : '') + v.toString(16).toUpperCase(); }
  function sceneName(sc) {
    return sc === 'sunset' ? T('山景日落', 'Mountain sunset') : sc === 'checker' ? T('棋盤', 'Checkerboard')
      : sc === 'rings' ? T('同心圓', 'Rings') : sc === 'eyechart' ? T('視力表', 'Eye chart') : T('色相環', 'Color wheel');
  }
  function modeName(mode) { return mode === 'gray' ? T('灰階', 'Grayscale') : T('彩色', 'Color'); }

  // =====================================================================
  // 計算（取樣有快取；量化每次重算，很快）
  // =====================================================================
  const sampleCache = new Map();
  function getSamples(scene, w, h, method) {
    const key = scene + '|' + w + '|' + h + '|' + method;
    let s = sampleCache.get(key);
    if (s) { sampleCache.delete(key); sampleCache.set(key, s); return s; }
    s = K.sample(scene, w, h, method);
    sampleCache.set(key, s);
    if (sampleCache.size > 8) sampleCache.delete(sampleCache.keys().next().value);
    return s;
  }
  const pix = document.createElement('canvas'), pixCtx = pix.getContext('2d');
  function compute() {
    const S = state;
    const samples = getSamples(S.scene, S.w, S.h, S.method);
    const q = K.quantize(samples, S.w, S.h, S.mode, S.b);
    const band = S.scene === 'sunset' ? K.skyBand(samples, S.w, S.h, S.mode, S.b) : null;
    const bpp = K.bppOf(S.mode, S.b);
    pix.width = S.w; pix.height = S.h;
    pixCtx.putImageData(new ImageData(q.rgba, S.w, S.h), 0, 0);
    cur = {
      scene: S.scene, w: S.w, h: S.h, method: S.method, mode: S.mode, b: S.b,
      samples: samples, q: q, band: band, bpp: bpp, size: K.fileSize(S.w, S.h, bpp), ver: (cur ? cur.ver : 0) + 1
    };
  }
  /** 選取的像素（沒有選取時為 null） */
  function selPixel() {
    if (!state.sel || !cur) return null;
    const i = Math.max(0, Math.min(cur.w - 1, Math.floor(state.sel.u * cur.w)));
    const j = Math.max(0, Math.min(cur.h - 1, Math.floor(state.sel.v * cur.h)));
    return { i: i, j: j };
  }
  /** 第 (i, j) 個像素的取樣值、代碼與存下的值 */
  function pixelInfo(i, j) {
    const o = (j * cur.w + i) * 3, s = cur.samples;
    const samp = [s[o], s[o + 1], s[o + 2]], y = K.luma(samp[0], samp[1], samp[2]);
    const r = cur.q.rgba, k = (j * cur.w + i) * 4;
    const out = [r[k], r[k + 1], r[k + 2]];
    let code;
    if (cur.mode === 'gray') code = [cur.q.codes[j * cur.w + i]];
    else code = [cur.q.codes[(j * cur.w + i) * 3], cur.q.codes[(j * cur.w + i) * 3 + 1], cur.q.codes[(j * cur.w + i) * 3 + 2]];
    let hue = null, sat = null;
    if (cur.scene === 'wheel') {
      const p = K.wheelPolar((i + 0.5) / cur.w, (j + 0.5) / cur.h);
      if (p) { hue = p.hue; sat = p.sat; }
    }
    return { i: i, j: j, samp: samp, y: y, code: code, disp: cur.mode === 'gray' ? [out[0]] : out, rgb: out, hue: hue, sat: sat };
  }

  // =====================================================================
  // 原圖的顯示點陣（依顯示大小計算，最多 720 × 540；先給快速的小圖，再在背景補細的）
  // =====================================================================
  const rasters = {};   // scene → { W, canvas }
  let rasterJob = 0;
  function makeRasterCanvas(scene, W) {
    const H = Math.round(W * K.ASPECT);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').putImageData(new ImageData(K.raster(scene, W, H), W, H), 0, 0);
    return { W: W, canvas: c };
  }
  function wantRasterW() {
    if (!L) return 320;
    return Math.max(160, Math.min(720, Math.ceil(L.imgW * dpr / 40) * 40));
  }
  function originalFor(scene) {
    const want = wantRasterW();
    let r = rasters[scene];
    if (!r) { r = rasters[scene] = makeRasterCanvas(scene, 160); }
    if (r.W < want) {
      const job = ++rasterJob;
      setTimeout(function () {
        if (job !== rasterJob) return;
        const now = rasters[scene];
        if (now && now.W >= want) return;
        rasters[scene] = makeRasterCanvas(scene, want);
        requestDraw();
      }, 40);
    }
    return r;
  }

  // =====================================================================
  // 版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const stage = $('stage');
  let dpr = 1, cw = 320, ch = 300, cw2 = 320, ch2 = 200, L = null;
  function layout() {
    const W = cw, narrow = W < 560;
    const pad = narrow ? 8 : 18, mat = narrow ? 6 : 11;
    const vh = window.innerHeight || 800;
    const maxW = Math.max(240, Math.min(780, (vh * 0.68) / K.ASPECT));
    const imgW = Math.floor(Math.min(W - 2 * pad - 2 * mat, maxW));
    const imgH = Math.round(imgW * K.ASPECT);
    const x0 = Math.round((W - imgW) / 2), y0 = pad + mat;
    return { narrow: narrow, pad: pad, mat: mat, x0: x0, y0: y0, imgW: imgW, imgH: imgH, H: imgH + 2 * (pad + mat) + 4 };
  }
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
    cw2 = cv2.clientWidth || cw;
    ch2 = cw2 < 560 ? 200 : 230;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr);
    cv2.height = Math.round(ch2 * dpr);
    requestDraw();
  }
  const splitX = function () { return L.x0 + state.split * L.imgW; };
  const handleR = function () { return L.narrow ? 13 : 15; };

  // =====================================================================
  // 繪圖：主畫布
  // =====================================================================
  function drawFrame() {
    const x = L.x0 - L.mat, y = L.y0 - L.mat, w = L.imgW + 2 * L.mat, h = L.imgH + 2 * L.mat;
    // 相框：外陰影（立體感）、由上往下略暗的白邊、內緣的斜面
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.55 : 0.28);
    ctx.shadowBlur = L.narrow ? 10 : 18;
    ctx.shadowOffsetY = L.narrow ? 3 : 6;
    D.roundRect(ctx, x, y, w, h, 7);
    ctx.fillStyle = C['id-frame'];
    ctx.fill();
    ctx.restore();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(C['id-frame'], D.dark ? 0.1 : 0.35));
    g.addColorStop(1, shade(C['id-frame'], D.dark ? -0.15 : -0.06));
    D.roundRect(ctx, x, y, w, h, 7);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = alpha(D.dark ? '#ffffff' : '#000000', D.dark ? 0.1 : 0.1);
    ctx.lineWidth = 1;
    ctx.stroke();
    // 圖片的凹槽
    ctx.fillStyle = alpha('#000000', D.dark ? 0.5 : 0.18);
    ctx.fillRect(L.x0 - 1.5, L.y0 - 1.5, L.imgW + 3, L.imgH + 3);
  }
  function drawImages() {
    const sx = splitX(), x0 = L.x0, y0 = L.y0, W = L.imgW, H = L.imgH;
    const orig = originalFor(state.scene);
    // 左：原圖（平滑）
    if (sx > x0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, sx - x0, H); ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(orig.canvas, x0, y0, W, H);
      ctx.restore();
    }
    // 右：數位化（每個像素是一塊實心色塊）
    if (sx < x0 + W) {
      ctx.save();
      ctx.beginPath(); ctx.rect(sx, y0, x0 + W - sx, H); ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pix, x0, y0, W, H);
      ctx.restore();
    }
    // 圖片內緣的細陰影（凹進相框）
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, W, H); ctx.clip();
    ctx.shadowColor = alpha('#000000', 0.45);
    ctx.shadowBlur = 6;
    ctx.strokeStyle = alpha('#000000', 0.5);
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 - 1, y0 - 1, W + 2, H + 2);
    ctx.restore();
  }
  function snapPx(v) { return (Math.round(v * dpr) + 0.5) / dpr; }
  function drawGridAndDots() {
    const w = cur.w, h = cur.h, pw = L.imgW / w, ph = L.imgH / h;
    const x0 = L.x0, y0 = L.y0;
    if (state.grid && Math.min(pw, ph) >= 5) {
      ctx.save();
      ctx.beginPath();
      for (let i = 1; i < w; i++) { const x = snapPx(x0 + i * pw); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + L.imgH); }
      for (let j = 1; j < h; j++) { const y = snapPx(y0 + j * ph); ctx.moveTo(x0, y); ctx.lineTo(x0 + L.imgW, y); }
      ctx.lineWidth = 1 / dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.38)';
      ctx.stroke();
      ctx.translate(1 / dpr, 1 / dpr);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.stroke();
      ctx.restore();
    }
    if (state.dots && Math.min(pw, ph) >= 4 && w * h <= 40000) {
      ctx.save();
      if (cur.method === 'center') {
        const r = Math.max(1.1, Math.min(3, Math.min(pw, ph) * 0.12));
        ctx.beginPath();
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const x = x0 + (i + 0.5) * pw, y = y0 + (j + 0.5) * ph;
          ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = Math.max(0.8, r * 0.45);
        ctx.stroke(); ctx.fill();
      } else {
        const ix = Math.max(1, pw * 0.14), iy = Math.max(1, ph * 0.14);
        ctx.beginPath();
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) ctx.rect(x0 + i * pw + ix, y0 + j * ph + iy, pw - 2 * ix, ph - 2 * iy);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.stroke();
        ctx.translate(0.6, 0.6);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  function drawSceneMarks() {
    const x0 = L.x0, y0 = L.y0, W = L.imgW, H = L.imgH;
    const small = fnt(L.narrow ? 10.5 : 11.5, 600);
    if (cur.scene === 'rings' && state.nyq) {
      const nb = K.nyquistBox(cur.w, cur.h);
      const u0 = 0.5 - nb.hx, u1 = 0.5 + nb.hx, v0 = 0.5 - nb.hy / K.ASPECT, v1 = 0.5 + nb.hy / K.ASPECT;
      const bx0 = Math.max(x0, x0 + u0 * W), bx1 = Math.min(x0 + W, x0 + u1 * W);
      const by0 = Math.max(y0, y0 + v0 * H), by1 = Math.min(y0 + H, y0 + v1 * H);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, W, H); ctx.clip();
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.strokeRect(bx0 + 1.5, by0 + 1.5, bx1 - bx0 - 3, by1 - by0 - 3);
      ctx.lineWidth = 2;
      ctx.strokeStyle = C['id-nyq'];
      ctx.strokeRect(bx0 + 1.5, by0 + 1.5, bx1 - bx0 - 3, by1 - by0 - 3);
      ctx.restore();
      const tx = Math.min(Math.max((bx0 + bx1) / 2, x0 + 60), x0 + W - 60);
      D.pill(ctx, T('奈奎斯特範圍', 'Nyquist limit'), tx, Math.max(by0 + 4, y0 + 26) + 18, C['id-nyq'], 'center', small);
    }
    if (cur.scene === 'sunset' && cur.band && cur.band.rows > 0 && W >= 200) {
      const b = cur.band, ph = H / cur.h;
      const x = x0 + (b.col + 0.5) / cur.w * W;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(x, y0 + 2); ctx.lineTo(x, y0 + b.rows * ph); ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = C['id-band'];
      ctx.stroke();
      ctx.setLineDash([]);
      // 最長色帶的位置：一段粗的括號
      const ya = y0 + b.bandAt * ph, yb = y0 + (b.bandAt + b.band) * ph, bx = x + Math.max(4, W / cur.w * 0.5 + 3);
      ctx.lineCap = 'round';
      ctx.lineWidth = 5.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.moveTo(bx, ya + 1.5); ctx.lineTo(bx, Math.max(ya + 1.6, yb - 1.5)); ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = C['id-band'];
      ctx.stroke();
      ctx.restore();
      const text = T('最長色帶 ' + b.band + ' 列', 'longest band: ' + b.band + (b.band === 1 ? ' row' : ' rows'));
      D.pill(ctx, text, x - 8, Math.min(y0 + H - 6, Math.max(y0 + 48, (ya + yb) / 2 + 10)), C['id-band'], 'right', small);
    }
    if (cur.scene === 'eyechart' && W >= 300) {
      K.EROWS.forEach(function (r, k) {
        const s = K.eyeStrokePx(k, cur.w);
        const yb = y0 + r.y0 / K.EV * H - 3;
        if (yb - y0 < 16) return;
        D.pill(ctx, T('筆畫 ' + num(s, 2) + ' 像素', 'stroke ' + num(s, 2) + ' px'), x0 + 6, yb, C.muted, 'left', fnt(L.narrow ? 10 : 11, 600));
      });
    }
  }
  function drawDivider() {
    const sx = splitX(), y0 = L.y0, H = L.imgH, r = handleR(), cy = y0 + H / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - 1.25, y0, 2.5, H);
    ctx.restore();
    // 兩側細細的深色邊，白色的圖上也看得到分界線
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(sx - 2.25, y0, 1, H);
    ctx.fillRect(sx + 1.25, y0, 1, H);
    // 把手：立體的圓鈕
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    const g = ctx.createRadialGradient(sx - r * 0.35, cy - r * 0.4, r * 0.1, sx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d9e0e8');
    ctx.beginPath(); ctx.arc(sx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(sx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.5; ctx.strokeStyle = C.accent; ctx.stroke();
    ctx.fillStyle = '#334155';
    const a = r * 0.36, gap = r * 0.18;
    ctx.beginPath();
    ctx.moveTo(sx - gap, cy - a); ctx.lineTo(sx - gap - a * 1.1, cy); ctx.lineTo(sx - gap, cy + a); ctx.closePath();
    ctx.moveTo(sx + gap, cy - a); ctx.lineTo(sx + gap + a * 1.1, cy); ctx.lineTo(sx + gap, cy + a); ctx.closePath();
    ctx.fill();
    // 兩側的標籤
    const f = fnt(L.narrow ? 11 : 12.5, 700), ty = y0 + (L.narrow ? 22 : 26);
    if (state.split > 0.16) D.pill(ctx, T('原圖', 'Original'), L.x0 + 7, ty, C.text, 'left', f);
    if (state.split < 0.84 || L.imgW >= 600 && state.split < 0.9) {
      const text = T('數位化 ', 'Digitized ') + cur.w + ' × ' + cur.h + T('・' + cur.bpp + ' 位元', ' · ' + cur.bpp + (cur.bpp === 1 ? ' bit' : ' bits'));
      D.pill(ctx, text, L.x0 + L.imgW - 7, ty, C.accent, 'right', f);
    }
  }
  /** 選取的像素：加框，旁邊畫一個放大鏡（9 × 9 或 7 × 7 個像素） */
  function drawSelection() {
    const p = selPixel();
    if (!p) return;
    const pw = L.imgW / cur.w, ph = L.imgH / cur.h;
    const px = L.x0 + p.i * pw, py = L.y0 + p.j * ph, pcx = px + pw / 2, pcy = py + ph / 2;
    const bw = Math.max(pw, 9), bh = Math.max(ph, 9);
    ctx.save();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(pcx - bw / 2, pcy - bh / 2, bw, bh);
    ctx.lineWidth = 2; ctx.strokeStyle = C['id-sel'];
    ctx.strokeRect(pcx - bw / 2, pcy - bh / 2, bw, bh);
    ctx.restore();
    // 放大鏡的位置：預設在右上方，碰到邊就換邊
    const R = L.narrow ? 46 : 70, n = L.narrow ? 7 : 9, gap = R + (L.narrow ? 14 : 22);
    let mx = pcx + gap, my = pcy - gap;
    if (mx + R > L.x0 + L.imgW + L.mat) mx = pcx - gap;
    if (my - R < 2) my = pcy + gap;
    if (my + R > ch - 2) my = Math.max(R + 2, pcy - gap);
    // 引線
    const ang = Math.atan2(my - pcy, mx - pcx);
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.moveTo(pcx + Math.cos(ang) * bw * 0.6, pcy + Math.sin(ang) * bh * 0.6); ctx.lineTo(mx - Math.cos(ang) * R, my - Math.sin(ang) * R); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = C['id-sel'];
    ctx.stroke();
    ctx.restore();
    // 鏡片的陰影
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2);
    ctx.fillStyle = C['canvas-bg']; ctx.fill();
    ctx.restore();
    // 鏡片裡的像素
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, R - 1, 0, Math.PI * 2); ctx.clip();
    const cell = 2 * R / n, half = (n - 1) / 2, rgba = cur.q.rgba;
    for (let dj = -half - 1; dj <= half + 1; dj++) for (let di = -half - 1; di <= half + 1; di++) {
      const i = p.i + di, j = p.j + dj, x = mx + (di - 0.5) * cell, y = my + (dj - 0.5) * cell;
      if (i < 0 || j < 0 || i >= cur.w || j >= cur.h) {
        ctx.fillStyle = ((i + j) & 1) ? alpha(C.muted, 0.18) : alpha(C.muted, 0.08);
      } else {
        const k = (j * cur.w + i) * 4;
        ctx.fillStyle = 'rgb(' + rgba[k] + ',' + rgba[k + 1] + ',' + rgba[k + 2] + ')';
      }
      ctx.fillRect(x, y, cell + 0.6, cell + 0.6);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    for (let k = -half - 1; k <= half + 1; k++) {
      const x = snapPx(mx + (k - 0.5) * cell), y = snapPx(my + (k - 0.5) * cell);
      ctx.moveTo(x, my - R); ctx.lineTo(x, my + R); ctx.moveTo(mx - R, y); ctx.lineTo(mx + R, y);
    }
    ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeRect(mx - cell / 2, my - cell / 2, cell, cell);
    ctx.lineWidth = 2; ctx.strokeStyle = C['id-sel'];
    ctx.strokeRect(mx - cell / 2, my - cell / 2, cell, cell);
    // 玻璃的反光
    const gl = ctx.createLinearGradient(mx - R, my - R, mx + R * 0.2, my + R * 0.2);
    gl.addColorStop(0, 'rgba(255,255,255,0.32)');
    gl.addColorStop(0.45, 'rgba(255,255,255,0.06)');
    gl.addColorStop(0.46, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(mx - R, my - R, 2 * R, 2 * R);
    ctx.restore();
    // 金屬鏡框
    const rim = ctx.createLinearGradient(mx - R, my - R, mx + R, my + R);
    rim.addColorStop(0, '#f1f5f9'); rim.addColorStop(0.5, '#94a3b8'); rim.addColorStop(1, '#475569');
    ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2);
    ctx.lineWidth = L.narrow ? 4 : 5; ctx.strokeStyle = rim; ctx.stroke();
    ctx.beginPath(); ctx.arc(mx, my, R + (L.narrow ? 2 : 2.5), 0, Math.PI * 2);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    // 下方的座標
    D.pill(ctx, '(' + p.i + ', ' + p.j + ')', mx, my + R + (L.narrow ? 18 : 21), C['id-sel'], 'center', fnt(L.narrow ? 10.5 : 11.5, 700, MONO));
    return { mx: mx, my: my, R: R };
  }
  function drawFocus(mag) {
    if (!kb || !kb.focused()) return;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.accent;
    if (kb.index() === 0) {
      const r = handleR() + 6;
      D.roundRect(ctx, splitX() - r, L.y0 + L.imgH / 2 - r, 2 * r, 2 * r, r);
      ctx.stroke();
    } else if (mag) {
      ctx.beginPath(); ctx.arc(mag.mx, mag.my, mag.R + 7, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  function draw() {
    if (!L || !cur) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    drawFrame();
    drawImages();
    drawGridAndDots();
    drawSceneMarks();
    drawDivider();
    const mag = drawSelection();
    drawFocus(mag);
  }

  // =====================================================================
  // 繪圖：量化的階梯圖
  // =====================================================================
  function richText(c, parts, x, y, color, font, align) {
    // parts：字串或 { sup: '…' }；畫在 (x, y)，傳回總寬
    const px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(font) || [0, 12])[1]);
    const supFont = font.replace(/(\d+(?:\.\d+)?)px/, (px * 0.72).toFixed(1) + 'px');
    let total = 0;
    parts.forEach(function (p) { c.font = typeof p === 'string' ? font : supFont; total += c.measureText(typeof p === 'string' ? p : p.sup).width + (typeof p === 'string' ? 0 : 1); });
    let xx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    parts.forEach(function (p) {
      if (typeof p === 'string') { D.haloText(c, p, xx, y, color, 'left', 'alphabetic', font); c.font = font; xx += c.measureText(p).width; }
      else { D.haloText(c, p.sup, xx + 0.5, y - px * 0.38, color, 'left', 'alphabetic', supFont); c.font = supFont; xx += c.measureText(p.sup).width + 1; }
    });
    return total;
  }
  function drawChart() {
    if (!cur) return;
    const c = ctx2, W = cw2, H = ch2, narrow = W < 480;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, W, H);
    const tickF = fnt(narrow ? 10 : 11, 500), axPx = narrow ? 10.5 : 11.5, axF = fnt(axPx, 600);
    c.font = tickF;
    // 左邊留給：直書的軸名＋刻度數字＋色條，依實際字寬算，窄螢幕也不會疊在一起
    const gl = Math.ceil(Math.max(narrow ? 44 : 58, 4 + axPx + 6 + c.measureText('255').width + 16));
    const gr = narrow ? 12 : 18, gt = 14, gb = narrow ? 40 : 44;
    const gx0 = gl, gx1 = W - gr, gy0 = gt, gy1 = H - gb;
    const X = function (v) { return gx0 + v / 255 * (gx1 - gx0); };
    const Y = function (v) { return gy1 - v / 255 * (gy1 - gy0); };
    // 格線（在 64、128、192）與刻度
    c.beginPath();
    [64, 128, 192].forEach(function (v) {
      c.moveTo(snapPx(X(v)), gy0); c.lineTo(snapPx(X(v)), gy1);
      c.moveTo(gx0, snapPx(Y(v))); c.lineTo(gx1, snapPx(Y(v)));
    });
    c.strokeStyle = alpha(C.text, D.dark ? 0.11 : 0.1); c.lineWidth = 1 / dpr;
    c.stroke();
    c.strokeStyle = alpha(C.text, 0.35); c.lineWidth = 1;
    c.strokeRect(snapPx(gx0), snapPx(gy0), Math.round(gx1 - gx0), Math.round(gy1 - gy0));
    [0, 64, 128, 192, 255].forEach(function (v) {
      D.haloText(c, String(v), X(v), gy1 + 22, C.muted, 'center', 'alphabetic', tickF);
      D.haloText(c, String(v), gx0 - 16, Y(v) + 4, C.muted, 'right', 'alphabetic', tickF);
    });
    // 兩條色條：下方是原本的值（連續），左側是存下的值（一階一階）
    const barH = 7;
    const gx = c.createLinearGradient(gx0, 0, gx1, 0);
    gx.addColorStop(0, '#000000'); gx.addColorStop(1, '#ffffff');
    c.fillStyle = gx;
    c.fillRect(gx0, gy1 + 3, gx1 - gx0, barH);
    const Lv = (1 << cur.b) - 1;
    for (let q = 0; q <= Lv; q++) {
      const lo = q === 0 ? 0 : (q - 0.5) * 255 / Lv, hi = q === Lv ? 255 : (q + 0.5) * 255 / Lv, v = K.codeToValue(q, cur.b);
      c.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      c.fillRect(gx0 - 3 - barH, Y(hi), barH, Y(lo) - Y(hi) + 0.5);
    }
    c.strokeStyle = alpha(C.text, 0.3);
    c.strokeRect(gx0 + 0.5, gy1 + 3.5, gx1 - gx0 - 1, barH - 1);
    c.strokeRect(gx0 - 3 - barH + 0.5, gy0 + 0.5, barH - 1, gy1 - gy0 - 1);
    // 軸名
    D.haloText(c, T('原本的值 x（0–255）', 'original value x (0–255)'), (gx0 + gx1) / 2, H - 4, C.muted, 'center', 'alphabetic', axF);
    c.save();
    c.translate(4 + axPx / 2, (gy0 + gy1) / 2);
    c.rotate(-Math.PI / 2);
    D.haloText(c, T('存下的值 x′', 'stored value x′'), 0, 0, C.muted, 'center', 'middle', axF);
    c.restore();
    // 不失真的對角線
    c.save();
    c.setLineDash([5, 5]);
    c.strokeStyle = alpha(C.text, 0.4); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(255), Y(255)); c.stroke();
    c.restore();
    // 階梯（管狀：陰影、主色、高光）
    c.beginPath();
    let prevV = K.codeToValue(0, cur.b);
    c.moveTo(X(0), Y(prevV));
    for (let q = 1; q <= Lv; q++) {
      const t = (q - 0.5) * 255 / Lv, v = K.codeToValue(q, cur.b);
      c.lineTo(X(t), Y(prevV)); c.lineTo(X(t), Y(v));
      prevV = v;
    }
    c.lineTo(X(255), Y(prevV));
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.save(); c.translate(0, 1.5);
    c.strokeStyle = D.shadowInk(0.25); c.lineWidth = 4.5; c.stroke();
    c.restore();
    c.strokeStyle = C.accent; c.lineWidth = 3; c.stroke();
    c.save(); c.translate(-0.4, -0.7);
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 0.9; c.stroke();
    c.restore();
    // 選取的像素：每個色版一個點，誤差畫成垂直的線
    const p = selPixel();
    if (p) {
      const info = pixelInfo(p.i, p.j);
      const chans = cur.mode === 'gray'
        ? [{ x: info.y, v: info.disp[0], col: C.text }]
        : [{ x: info.samp[0], v: info.rgb[0], col: C['id-r'] }, { x: info.samp[1], v: info.rgb[1], col: C['id-g'] }, { x: info.samp[2], v: info.rgb[2], col: C['id-b'] }];
      chans.forEach(function (ch) {
        c.save();
        c.strokeStyle = ch.col; c.lineWidth = 2; c.setLineDash([3, 3]);
        c.beginPath(); c.moveTo(X(ch.x), Y(ch.x)); c.lineTo(X(ch.x), Y(ch.v)); c.stroke();
        c.restore();
        D.ball(c, X(ch.x), Y(ch.v), narrow ? 4.5 : 5.5, ch.col);
      });
    }
    // 說明文字（放在對角線左上方的空白處）
    const f1 = fnt(narrow ? 12 : 13.5, 700), f2 = fnt(narrow ? 11 : 12, 500);
    const step = 255 / Lv;
    const tx = gx0 + 10, ty = gy0 + (narrow ? 18 : 22);
    const lv = intText(Lv + 1);
    richText(c, [T('b = ' + cur.b + ' 位元 → 2', 'b = ' + cur.b + (cur.b === 1 ? ' bit → 2' : ' bits → 2')), { sup: String(cur.b) }, T(' = ' + lv + ' 階', ' = ' + lv + ' levels')], tx, ty, C.text, f1);
    D.haloText(c, T('每階 ≈ ' + num(step, 2) + '，誤差最多 ≈ ' + num(step / 2, 2), 'step ≈ ' + num(step, 2) + ', error at most ≈ ' + num(step / 2, 2)), tx, ty + (narrow ? 17 : 20), C.muted, 'left', 'alphabetic', f2);
    if (cur.mode === 'color' && W >= 420) {
      D.haloText(c, T('（R、G、B 各自量化）', '(R, G and B are quantized separately)'), tx, ty + (narrow ? 33 : 38), C.muted, 'left', 'alphabetic', f2);
    }
  }

  // =====================================================================
  // 動畫迴圈（只在需要時畫）
  // =====================================================================
  let rafId = 0, needCompute = true, pendingSrc = null, prevSnap = null;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(frame); }
  /** 還有沒算完的設定就馬上算（點像素、記錄時用，確保讀到的是最新的圖） */
  function flush() { if (needCompute && rafId) { cancelAnimationFrame(rafId); rafId = 0; frame(); } }
  function frame() {
    rafId = 0;
    if (needCompute) {
      needCompute = false;
      compute();
      updateReadouts();
      if (view3) view3.update();
      if (pendingSrc) {
        emitImage(pendingSrc);
        if (state.sel) emitProbe('settings');
        pendingSrc = null;
      }
    }
    draw();
    drawChart();
  }
  /** 使用者改了設定：下一格重算，算完送出任務事件 */
  function changed(src) {
    if (!pendingSrc) prevSnap = snapOf();
    pendingSrc = src || 'settings';
    needCompute = true;
    requestDraw();
  }
  function snapOf() {
    return cur ? { w: cur.w, h: cur.h, bpp: cur.bpp, bits: cur.size.bits, method: cur.method, mode: cur.mode, b: cur.b, scene: cur.scene } : null;
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitImage(src) {
    if (!cur) return;
    const b = cur.band;
    emit('image', {
      src: src, scene: cur.scene, w: cur.w, h: cur.h, lock: state.lock, mode: cur.mode, b: cur.b, bpp: cur.bpp, method: cur.method,
      bits: cur.size.bits, bytes: cur.size.bytes, colors: cur.q.colors, levels: 1 << cur.b, err: cur.q.err,
      band: b ? b.band : 0, bandPrev: b ? b.bandPrev : null, bandRows: b ? b.rows : 0,
      uniform: cur.q.colors === 1,
      faithful: cur.scene === 'checker' && K.checkerFaithful(cur.w, cur.h),
      eyeRows: cur.scene === 'eyechart' ? K.eyeRowsExact(cur.w, cur.h) : 0,
      view: state.view, nyq: state.nyq,
      prev: prevSnap
    });
  }
  function emitProbe(src) {
    const p = selPixel();
    if (!p) return;
    const info = pixelInfo(p.i, p.j);
    emit('probe', {
      src: src, scene: cur.scene, w: cur.w, h: cur.h, i: p.i, j: p.j, method: cur.method, mode: cur.mode, b: cur.b,
      key: [cur.scene, cur.w, cur.h, p.i, p.j, cur.method].join('|'),
      samp: info.samp, y: info.y, code: info.code, disp: info.disp, rgb: info.rgb,
      gray: cur.mode === 'gray' ? info.disp[0] : null, hue: info.hue, sat: info.sat
    });
  }

  // =====================================================================
  // 音效（預設關）：選取像素時的音高跟著它存下的亮度走，所以位元越少，聽到的音階越少
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let lastPickSnd = 0;
  function sndPixel(info) {
    const S = sound(); if (!S) return;
    const now = performance.now();
    if (now - lastPickSnd < 70) return;
    lastPickSnd = now;
    const y = K.luma(info.rgb[0], info.rgb[1], info.rgb[2]);
    S.tone({ freq: 262 * Math.pow(2, 2 * y / 255), dur: 0.13, type: 'sine', gain: 0.2 });
  }
  function sndBits(b) {
    const S = sound(); if (!S) return;
    S.tone({ freq: 330 * Math.pow(2, (b - 1) / 4), dur: 0.07, type: 'triangle', gain: 0.12 });
  }
  function sndRecord() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 659.25, dur: 0.12, type: 'sine', gain: 0.2 });
    S.tone({ freq: 880, dur: 0.18, type: 'sine', gain: 0.18, delay: 0.08 });
  }
  function sndClear() { const S = sound(); if (S) S.sweep({ from: 700, to: 300, dur: 0.18, type: 'triangle', gain: 0.12 }); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] !== html) { lastHTML[id] = html; $(id).innerHTML = html; } }
  function katexInto(el, tex) {
    if (el._tex === tex) return;
    el._tex = tex;
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: false }); return; } catch (e) { /* 退回純文字 */ } }
    el.textContent = tex;
  }
  const texNum = function (v) { return intText(v).replace(/,/g, '{,}'); };
  function bitsWord(n) { return T(' 位元', n === 1 ? ' bit' : ' bits'); }
  function updateReadouts() {
    const S = cur, sz = S.size;
    $('wwo').textContent = String(S.w);
    $('hho').textContent = String(S.h);
    $('bitso').textContent = String(S.b);
    $('splito').textContent = String(Math.round(state.split * 100));
    setHTML('bitsHint', S.mode === 'gray'
      ? T('灰階：每個像素只存亮度 Y 一個色版，共 b 位元。', 'Grayscale: each pixel stores one channel, the brightness Y, in b bits.')
      : T('彩色：每個像素存 R、G、B 三個色版，每個 b 位元，共 3b 位元。', 'Color: each pixel stores three channels, R, G and B, with b bits each — 3b bits in all.'));
    setHTML('rBpp', S.mode === 'gray' ? S.b + bitsWord(S.b) : '3 × ' + S.b + ' = ' + S.bpp + bitsWord(S.bpp));
    setHTML('rLevels', '2<sup>' + S.bpp + '</sup> = ' + intText(Math.pow(2, S.bpp)));
    setHTML('rUsed', intText(S.q.colors));
    setHTML('rErr', num(S.q.err, 2) + ' <small>' + T('（最多 ' + num(127.5 / ((1 << S.b) - 1), 2) + '）', '(at most ' + num(127.5 / ((1 << S.b) - 1), 2) + ')') + '</small>');
    const isSun = S.scene === 'sunset';
    $('rBandDt').hidden = !isSun; $('rBand').hidden = !isSun;
    if (isSun) setHTML('rBand', S.band && S.band.rows ? T(S.band.band + ' 列', S.band.band + (S.band.band === 1 ? ' row' : ' rows')) + ' <small>' + T('／天空 ' + S.band.rows + ' 列', '/ sky ' + S.band.rows + ' rows') + '</small>' : '—');
    katexInto($('sizeEq'), S.w + ' \\times ' + S.h + ' \\times ' + S.bpp + ' = ' + texNum(sz.bits) + '\\ \\text{bit}' +
      (sz.bits % 8 === 0 ? ' = ' : ' \\to ') + texNum(sz.bytes) + '\\ \\text{B}');
    setHTML('rPx', S.w + ' × ' + S.h + ' = ' + intText(S.w * S.h));
    setHTML('rBits', intText(sz.bits));
    setHTML('rBytes', intText(sz.bytes) + ' B');
    setHTML('rKB', num(sz.kB, 3) + ' KB');
    setHTML('rKiB', num(sz.KiB, 3) + ' KiB');
    setHTML('rHD', T('6.22 MB <small>（5.93 MiB）</small>', '6.22 MB <small>(5.93 MiB)</small>'));
    const ratio = sz.bytes / HD_BYTES;
    setHTML('rRatio', sig3(ratio * 100) + '%' + (ratio > 0 && ratio < 0.5 ? ' <small>' + T('（約 1/', '(about 1/') + intText(Math.round(1 / ratio)) + T('）', ')') + '</small>' : ''));
    updatePixelCard();
  }
  function updatePixelCard() {
    const p = selPixel();
    $('pxEmpty').hidden = !!p;
    $('pxSw').hidden = !p;
    if (!p) { setHTML('pxTab', ''); setHTML('pxPos', ''); $('pxSw').style.background = ''; return; }
    const info = pixelInfo(p.i, p.j), b = cur.b;
    const hex = '#' + hex2(info.rgb[0]) + hex2(info.rgb[1]) + hex2(info.rgb[2]);
    $('pxSw').style.background = hex;
    setHTML('pxPos', T('像素', 'Pixel') + ' (' + p.i + ', ' + p.j + ')<small>' + T('左上角是 (0, 0)・', 'top-left is (0, 0) · ') + hex + '</small>');
    let h = '<thead><tr><th>' + T('色版', 'Channel') + '</th><th>' + T('取樣值', 'Sampled') + '</th><th>' + T('代碼', 'Code') + '</th><th>' + T('二進位', 'Binary') + '</th><th>' + T('存下的值', 'Stored') + '</th></tr></thead><tbody>';
    const rows = cur.mode === 'gray'
      ? [{ n: T('亮度 Y', 'Brightness Y'), x: info.y, q: info.code[0], v: info.disp[0], col: '' }]
      : [{ n: 'R', x: info.samp[0], q: info.code[0], v: info.rgb[0], col: 'var(--id-r)' }, { n: 'G', x: info.samp[1], q: info.code[1], v: info.rgb[1], col: 'var(--id-g)' }, { n: 'B', x: info.samp[2], q: info.code[2], v: info.rgb[2], col: 'var(--id-b)' }];
    rows.forEach(function (r) {
      h += '<tr><th class="ch"' + (r.col ? ' style="color:' + r.col + '"' : '') + '>' + r.n + '</th><td>' + num(r.x, 1) + '</td><td>' + r.q + '</td><td class="bin">' + K.binary(r.q, b) + '</td><td>' + r.v + '</td></tr>';
    });
    setHTML('pxTab', h + '</tbody>');
  }
  function renderRecords() {
    const rows = state.recs;
    $('recEmpty').hidden = rows.length > 0;
    if (!rows.length) { setHTML('recTab', ''); return; }
    let h = '<thead><tr><th>' + T('原圖', 'Picture') + '</th><th>' + T('像素', 'Pixels') + '</th><th>' + T('色深', 'Depth') + '</th><th>bpp</th><th>' + T('位元組', 'Bytes') + '</th><th>KiB</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr><td>' + sceneName(r.scene) + '</td><td>' + r.w + '×' + r.h + '</td><td>' + modeName(r.mode) + ' ' + r.b + '</td><td>' + r.bpp + '</td><td>' + intText(r.bytes) + '</td><td>' + num(r.bytes / 1024, 2) + '</td></tr>';
    });
    setHTML('recTab', h + '</tbody>');
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elW = $('ww'), elH = $('hh'), elBits = $('bits'), elSplit = $('split'), elLock = $('lock');
  function setRange(el, v) { if (window.LabNum) { window.LabNum.clear(el); } el.value = String(v); }
  function readW() { return Math.max(1, Math.min(K.W_MAX, Math.round(val(elW)))); }
  function readH() { return Math.max(1, Math.min(K.H_MAX, Math.round(val(elH)))); }
  elW.addEventListener('input', function () {
    state.w = readW();
    if (state.lock) { state.h = K.heightFor(state.w); setRange(elH, state.h); }
    changed('w');
  });
  elH.addEventListener('input', function () {
    state.h = readH();
    if (state.lock) { state.w = K.widthFor(state.h); setRange(elW, state.w); }
    changed('h');
  });
  elLock.addEventListener('change', function () {
    state.lock = elLock.checked;
    if (state.lock) { state.h = K.heightFor(state.w); setRange(elH, state.h); }
    changed('lock');
  });
  elBits.addEventListener('input', function () {
    const b = Math.max(1, Math.min(8, Math.round(val(elBits))));
    if (b !== state.b) sndBits(b);
    state.b = b;
    changed('b');
  });
  elSplit.addEventListener('input', function () {
    state.split = Math.max(0, Math.min(1, val(elSplit) / 100));
    $('splito').textContent = String(Math.round(state.split * 100));
    requestDraw();
  });
  function setPressedGroup(ids, on) { ids.forEach(function (id) { $(id).setAttribute('aria-pressed', String(id === on)); }); }
  $('mCenter').addEventListener('click', function () { state.method = 'center'; setPressedGroup(['mCenter', 'mArea'], 'mCenter'); changed('method'); });
  $('mArea').addEventListener('click', function () { state.method = 'area'; setPressedGroup(['mCenter', 'mArea'], 'mArea'); changed('method'); });
  $('modeGray').addEventListener('click', function () { state.mode = 'gray'; setPressedGroup(['modeGray', 'modeColor'], 'modeGray'); changed('mode'); });
  $('modeColor').addEventListener('click', function () { state.mode = 'color'; setPressedGroup(['modeGray', 'modeColor'], 'modeColor'); changed('mode'); });
  $('showGrid').addEventListener('change', function () { state.grid = this.checked; requestDraw(); hintSmall(); });
  $('showDots').addEventListener('change', function () { state.dots = this.checked; requestDraw(); hintSmall(); });
  $('showNyq').addEventListener('change', function () { state.nyq = this.checked; changed('nyq'); });
  const sceneBtns = Array.prototype.slice.call(document.querySelectorAll('.scenes button[data-scene]'));
  sceneBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.scene = btn.dataset.scene;
      sceneBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      $('nyqWrap').hidden = state.scene !== 'rings';
      changed('scene');
      say(sceneTip());
    });
  });
  function sceneTip() {
    switch (state.scene) {
      case 'sunset': return T('山景日落：天空是平滑的漸層，位元數少的時候最容易看出色帶。', 'Mountain sunset: the sky is a smooth gradient, the best place to see banding when there are too few bits.');
      case 'checker': return T('棋盤：橫 24 格、直 18 格，邊緣各切掉半格。像素格和方格對不準時會怎樣？', 'Checkerboard: 24 squares across and 18 down, with half a square cut off at each edge. What happens when the pixels do not line up with the squares?');
      case 'rings': return T('同心圓：越外圈條紋越細。像素太少時，會冒出原圖沒有的圓圈。', 'Rings: the stripes get finer towards the edges. With too few pixels, rings appear that are not in the original.');
      case 'eyechart': return T('視力表：每一列的 E 越來越小。每一筆至少要多少像素才看得出開口的方向？', 'Eye chart: the E gets smaller row by row. How many pixels does one stroke need before you can tell which way it opens?');
      default: return T('色相環：方向是色相、離中心的距離是飽和度。每色版只剩 1 位元時會剩幾種顏色？', 'Color wheel: the direction is the hue and the distance from the center is the saturation. How many colors are left with 1 bit per channel?');
    }
  }
  function hintSmall() {
    if (!cur || !L) return;
    const pw = L.imgW / cur.w, ph = L.imgH / cur.h;
    if (state.grid && Math.min(pw, ph) < 5) say(T('像素太小，格線畫不清楚：把寬 w 調小一點就看得到。', 'The pixels are too small to draw the grid: make the width w smaller to see it.'));
    else if (state.dots && (Math.min(pw, ph) < 4 || cur.w * cur.h > 40000)) say(T('像素太小，取樣點畫不清楚：把寬 w 調小一點就看得到。', 'The pixels are too small to draw the sample points: make the width w smaller to see them.'));
  }
  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg || ''; }, 20); }

  // 記錄、全部清除
  $('recBtn').addEventListener('click', function () {
    flush();
    if (!cur) return;
    state.recs.push({ scene: cur.scene, w: cur.w, h: cur.h, mode: cur.mode, b: cur.b, bpp: cur.bpp, bytes: cur.size.bytes });
    if (state.recs.length > REC_MAX) state.recs.shift();
    renderRecords();
    sndRecord();
    say(T('記下了：' + cur.w + ' × ' + cur.h + '、' + modeName(cur.mode) + ' ' + cur.b + ' 位元 → ' + intText(cur.size.bytes) + ' 位元組。', 'Recorded: ' + cur.w + ' × ' + cur.h + ', ' + modeName(cur.mode).toLowerCase() + ' ' + cur.b + '-bit → ' + intText(cur.size.bytes) + ' bytes.'));
  });
  $('wipeBtn').addEventListener('click', function () {
    state.recs = [];
    state.sel = null;
    renderRecords();
    updatePixelCard();
    sndClear();
    say(T('已清除記錄表與選取的像素（設定不變）。', 'The notebook and the selected pixel are cleared (the settings stay).'));
    requestDraw();
  });

  // =====================================================================
  // 畫布：拖曳分界線、點選像素
  // =====================================================================
  let drag = null, lastPickKey = '';
  function posOf(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function nearDivider(p, touch) {
    const r = handleR(), sx = splitX(), cy = L.y0 + L.imgH / 2;
    if (Math.hypot(p.x - sx, p.y - cy) <= r + (touch ? 10 : 5)) return true;
    return Math.abs(p.x - sx) <= (touch ? 12 : 7) && p.y >= L.y0 && p.y <= L.y0 + L.imgH;
  }
  function inImage(p) { return p.x >= L.x0 && p.x <= L.x0 + L.imgW && p.y >= L.y0 && p.y <= L.y0 + L.imgH; }
  function setSplitFromX(x) {
    state.split = Math.max(0, Math.min(1, (x - L.x0) / L.imgW));
    setRange(elSplit, Math.round(state.split * 100));
    $('splito').textContent = String(Math.round(state.split * 100));
    requestDraw();
  }
  function pickAt(p) {
    flush();
    const u = Math.max(0, Math.min(0.999999, (p.x - L.x0) / L.imgW)), v = Math.max(0, Math.min(0.999999, (p.y - L.y0) / L.imgH));
    state.sel = { u: u, v: v };
    afterPick();
  }
  function afterPick() {
    const q = selPixel();
    if (!q) return;
    const key = cur.ver + '|' + q.i + '|' + q.j;
    updatePixelCard();
    requestDraw();
    if (key === lastPickKey) return;
    lastPickKey = key;
    const info = pixelInfo(q.i, q.j);
    sndPixel(info);
    emitProbe('pick');
    const hex = '#' + hex2(info.rgb[0]) + hex2(info.rgb[1]) + hex2(info.rgb[2]);
    say(T('像素 (' + q.i + ', ' + q.j + ')：存下 ' + hex, 'Pixel (' + q.i + ', ' + q.j + '): stored ' + hex) +
      (cur.mode === 'gray' ? T('（亮度 ' + info.disp[0] + '）', ' (brightness ' + info.disp[0] + ')') : ''));
  }
  cv.addEventListener('pointerdown', function (e) {
    if (!L || !cur) return;
    const p = posOf(e), touch = e.pointerType === 'touch';
    if (nearDivider(p, touch)) drag = 'split';
    else if (inImage(p)) { drag = 'pick'; pickAt(p); }
    else return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!L) return;
    const p = posOf(e);
    if (drag === 'split') { setSplitFromX(p.x); return; }
    if (drag === 'pick') { pickAt(p); return; }
    cv.style.cursor = nearDivider(p, false) ? 'ew-resize' : inImage(p) ? 'crosshair' : 'default';
  });
  function endDrag() { drag = null; }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // 鍵盤：Enter 切換「分界線」與「選取的像素」，方向鍵移動
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('圖片數位化畫布：左邊是原圖，右邊是數位化的結果。按 Enter 切換分界線或選取的像素，方向鍵移動，Shift 加方向鍵移動得更多。',
      'Image digitization canvas: the original on the left, the digitized result on the right. Press Enter to switch between the divider and the selected pixel; arrow keys move it, Shift moves further.'),
    items: [
      { name: function () { return T('分界線', 'Divider'); },
        move: function (dx, dy, big) {
          if (!dx) return false;
          state.split = Math.max(0, Math.min(1, Math.round((state.split + dx * (big ? 0.1 : 0.02)) * 100) / 100));
          setRange(elSplit, Math.round(state.split * 100));
          $('splito').textContent = String(Math.round(state.split * 100));
          requestDraw();
          return true;
        },
        describe: function () { return T('分界線在 ' + Math.round(state.split * 100) + '%', 'Divider at ' + Math.round(state.split * 100) + '%'); } },
      { name: function () { return T('選取的像素', 'Selected pixel'); },
        move: function (dx, dy, big) {
          if (!cur) return false;
          let q = selPixel();
          if (!q) q = { i: Math.floor(cur.w / 2), j: Math.floor(cur.h / 2) };
          else {
            const step = big ? 8 : 1;
            q = { i: Math.max(0, Math.min(cur.w - 1, q.i + dx * step)), j: Math.max(0, Math.min(cur.h - 1, q.j - dy * step)) };
          }
          state.sel = { u: (q.i + 0.5) / cur.w, v: (q.j + 0.5) / cur.h };
          afterPick();
          return true;
        },
        describe: function () {
          const q = selPixel();
          if (!q) return T('還沒有選取像素，按方向鍵選取中間的像素。', 'No pixel selected yet; press an arrow key to select the middle one.');
          const info = pixelInfo(q.i, q.j);
          return T('像素 (' + q.i + ', ' + q.j + ')，存下的值 ', 'Pixel (' + q.i + ', ' + q.j + '), stored value ') + info.disp.join(', ');
        } }
    ],
    onChange: requestDraw
  }) : null;

  // =====================================================================
  // 3D 色立方：切換到 3D 時才載入 js/image-digitization-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const host3 = $('view3'), viewMsg = $('viewMsg');
  /** 點雲：最多 CLOUD_MAX 個像素（均勻抽樣），src 是取樣到的顏色，dst 是存下的顏色（0–255） */
  let cloudCache = null;
  function cloud() {
    if (!cur) return null;
    if (cloudCache && cloudCache.ver === cur.ver) return cloudCache;
    const N = cur.w * cur.h, n = Math.min(N, CLOUD_MAX);
    const src = new Float32Array(n * 3), dst = new Float32Array(n * 3);
    const s = cur.samples, r = cur.q.rgba;
    for (let m = 0; m < n; m++) {
      const k = n === N ? m : Math.min(N - 1, Math.floor(((m * 0.6180339887) % 1) * N));
      src[m * 3] = s[k * 3]; src[m * 3 + 1] = s[k * 3 + 1]; src[m * 3 + 2] = s[k * 3 + 2];
      dst[m * 3] = r[k * 4]; dst[m * 3 + 1] = r[k * 4 + 1]; dst[m * 3 + 2] = r[k * 4 + 2];
    }
    // 用到的量化格點（彩色時是代碼的三元組；灰階是一個代碼）
    const used = new Set(), codes = cur.q.codes;
    if (cur.mode === 'gray') for (let k = 0; k < N; k++) used.add(codes[k]);
    else for (let k = 0; k < N; k++) used.add((codes[k * 3] * 256 + codes[k * 3 + 1]) * 256 + codes[k * 3 + 2]);
    cloudCache = { ver: cur.ver, n: n, N: N, src: src, dst: dst, mode: cur.mode, b: cur.b, scene: cur.scene, method: cur.method, used: used };
    return cloudCache;
  }
  const bridge = {
    K: K, T: T, D: D, reducedMotion: reducedMotion,
    colors: function () { return C; },
    cloud: cloud,
    intText: intText,
    onRotate: function (dir) { if (cur) emit('rotate3d', { dir: dir, scene: cur.scene, mode: cur.mode, b: cur.b }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 圖片。', 'The 3D graphics context was lost, so the view switched back to the 2D image.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.ImageDigit3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.ImageDigit3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/image-digitization-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.ImageDigit3D) throw new Error('image-digitization-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function show3dButtons(on) { $('resetCam').hidden = !on; $('replaySnap').hidden = !on; }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressedGroup(['view2d', 'view3d'], 'view3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 色立方…', 'Loading the 3D color cube…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.ImageDigit3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        show3dButtons(true);
        state.view = '3d';
        changed('view');
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressedGroup(['view2d', 'view3d'], 'view2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      show3dButtons(false);
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      const was3d = state.view === '3d';
      state.view = '2d';
      resize();
      if (was3d) changed('view');
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressedGroup(['view2d', 'view3d'], 'view2d');
    show3dButtons(false);
    state.view = '2d';
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 圖片。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D image is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('replaySnap').addEventListener('click', function () { if (view3) view3.replay(); });

  // ---------- 測試用介面（Playwright 腳本使用；和使用者操作走同一條路，會送出任務事件） ----------
  window.ImageDigitLab = {
    state: state,
    info: function () { flush(); return cur ? { w: cur.w, h: cur.h, bpp: cur.bpp, bits: cur.size.bits, bytes: cur.size.bytes, colors: cur.q.colors, band: cur.band, eyeRows: cur.scene === 'eyechart' ? K.eyeRowsExact(cur.w, cur.h) : 0 } : null; },
    scene: function (sc) { const b = sceneBtns.filter(function (x) { return x.dataset.scene === sc; })[0]; if (b) b.click(); },
    size: function (w, h) {
      if (h != null && elLock.checked) elLock.click();
      if (window.LabNum) window.LabNum.set(elW, w); else { elW.value = w; elW.dispatchEvent(new Event('input')); }
      if (h != null) { if (window.LabNum) window.LabNum.set(elH, h); else { elH.value = h; elH.dispatchEvent(new Event('input')); } }
    },
    bits: function (b) { if (window.LabNum) window.LabNum.set(elBits, b); else { elBits.value = b; elBits.dispatchEvent(new Event('input')); } },
    pick: function (i, j) { flush(); if (!cur) return; state.sel = { u: (i + 0.5) / cur.w, v: (j + 0.5) / cur.h }; afterPick(); },
    view: setView,
    view3: function () { return view3; }
  };

  // =====================================================================
  // 原圖按鈕的小縮圖
  // =====================================================================
  function makeThumbs() {
    document.querySelectorAll('.scenes .sw[data-thumb]').forEach(function (el) {
      try {
        const W = 96, H = 72, c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.getContext('2d').putImageData(new ImageData(K.raster(el.dataset.thumb, W, H), W, H), 0, 0);
        el.style.backgroundImage = 'url(' + c.toDataURL() + ')';
        el.style.backgroundSize = 'cover';
      } catch (e) { /* 縮圖失敗不影響實驗 */ }
    });
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    $('sizeEq')._tex = '';
    if (cur) updateReadouts();
    renderRecords();
    updateSoundButton();
    if (view3) view3.onTheme();
    requestDraw();
  }
  readColors();
  // 頁面重新整理時，瀏覽器可能保留表單的值：一律從控制項讀起
  state.w = readW();
  state.lock = elLock.checked;
  state.h = state.lock ? K.heightFor(state.w) : readH();
  if (state.lock) setRange(elH, state.h);
  state.b = Math.max(1, Math.min(8, Math.round(val(elBits))));
  state.split = Math.max(0, Math.min(1, val(elSplit) / 100));
  state.grid = $('showGrid').checked; state.dots = $('showDots').checked; state.nyq = $('showNyq').checked;
  setPressedGroup(['mCenter', 'mArea'], 'mCenter');
  setPressedGroup(['modeGray', 'modeColor'], 'modeColor');
  renderRecords();
  updateSoundButton();
  makeThumbs();
  say(T('點一下圖上的像素，用放大鏡讀出它的數值；拖曳中間的分界線，比較原圖和數位化的結果。', 'Tap a pixel in the image to read its values with the magnifier; drag the divider to compare the original with the digitized result.'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
