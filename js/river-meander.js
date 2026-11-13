/* river-meander.js — 「曲流、牛軛湖與河道變遷」的畫面與互動
 * 模型全部在 river-meander-core.js（MeanderCore）；這裡只負責時間推進、繪圖與操作。 */
(function () {
  'use strict';
  const K = window.MeanderCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FONT = D.FONT;
  const VL = K.VALLEY_L, VH = K.VALLEY_H, HILL = 350;   // 河谷外各畫 350 m 的山坡
  const SPDS = [10, 25, 100];
  const FRAME_BUDGET = 12;                              // 每一幀最多花 12 ms 算河道（慢的裝置自動放慢）

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { W: $('W'), k: $('k') };
  const state = {
    seed: 1, W: 80, k: 8, spd: 25, running: false, tool: 'look',
    hist: true, erode: true, flow: true,
    sel: null,          // 剖面位置（河道上的點，跟著河道走）[x, y]
    ox: null,           // 點到的牛軛湖（物件）
    acted: false
  };
  let R = K.create({ W: state.W, k: state.k, seed: state.seed });
  let series = [[0, K.sinuosity(R)]];
  let MIG = null, migKey = '';
  let flashes = [], seenCuts = 0, lastCutMsg = 0, preview = null;

  function readSliders() {
    state.W = Math.max(40, Math.min(160, Math.round(val(el.W) / 10) * 10));
    state.k = Math.max(2, Math.min(30, val(el.k)));
  }
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--rm-water', '--rm-water2', '--rm-bank', '--rm-cut', '--rm-bar', '--rm-plain', '--rm-plain2', '--rm-hill', '--rm-hill2', '--rm-scroll',
      '--rm-marsh', '--rm-art', '--rm-sel', '--rm-sin', '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = v.toFixed(d == null ? 0 : d);
    return (s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s).replace(/^-/, '−');
  }
  function km(m, d) { return num(m / 1000, d == null ? 2 : d) + ' km'; }
  function setText(id, s) { const e = $(id); if (e && e.textContent !== s) e.textContent = s; }
  function setHTML(id, s) { const e = $(id); if (e && e.innerHTML !== s) e.innerHTML = s; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function yearsTxt(t) { return T('第 ' + num(t, 0) + ' 年', 'year ' + num(t, 0)); }

  /** 目前河道的遷移速率（同一個河道形狀只算一次） */
  function mig() {
    const key = R.t + '|' + R.x.length + '|' + R.W + '|' + R.k + '|' + R.cuts + '|' + R.artCuts;
    if (!MIG || key !== migKey) {
      MIG = K.migration(R); migKey = key;
      let m = 0; for (let i = 0; i < MIG.R1.length; i++) m = Math.max(m, Math.abs(MIG.R1[i]));
      MIG.max = m;
    }
    return MIG;
  }
  function sinClass(s) {
    if (s < 1.05) return T('平直河道', 'straight');
    if (s < 1.5) return T('彎曲河道', 'sinuous');
    return T('曲流河', 'meandering');
  }

  // =====================================================================
  // 畫布與座標（上方是北；水由左＝西往右＝東流；河道 y > 0 是北岸）
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const xs = $('xs'), xctx = xs.getContext('2d');
  const sg = $('sg'), sctx = sg.getContext('2d');
  let size = { w: 600, h: 336, dpr: 1 }, xsSize = { w: 300, h: 190 }, sgSize = { w: 300, h: 190 };
  function fitOne(c, cx) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 190;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function fit() {
    size = fitOne(cv, ctx); xsSize = fitOne(xs, xctx); sgSize = fitOne(sg, sctx);
    bgKey = ''; layerKey = '';
  }
  function geom() {
    const m = size.w < 520 ? 4 : 8;
    const ww = VL + 2 * 150, wh = VH + 2 * HILL;
    const sc = Math.min((size.w - 2 * m) / ww, (size.h - 2 * m) / wh);
    const ox = (size.w - ww * sc) / 2 + 150 * sc, oy = (size.h - wh * sc) / 2 + (HILL + VH / 2) * sc;
    return { sc: sc, ox: ox, oy: oy };
  }
  function sx(x, g) { return g.ox + x * g.sc; }
  function sy(y, g) { return g.oy - y * g.sc; }
  function toWorld(px, py, g) { return [(px - g.ox) / g.sc, (g.oy - py) / g.sc]; }

  // ---------- 底圖：沖積平原與兩側山坡（快取） ----------
  let bg = null, bgKey = '';
  function background(g) {
    const key = [size.w, size.h, size.dpr, D.dark].join('|');
    if (bg && bgKey === key) return bg;
    const c = document.createElement('canvas');
    c.width = Math.round(size.w * size.dpr); c.height = Math.round(size.h * size.dpr);
    const b = c.getContext('2d');
    b.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    const x0 = sx(-150, g), x1 = sx(VL + 150, g), yt = sy(VH / 2 + HILL, g), yb = sy(-VH / 2 - HILL, g);
    const vt = sy(VH / 2, g), vb = sy(-VH / 2, g);
    // 谷底：中間亮、兩側稍暗
    const gr = b.createLinearGradient(0, vt, 0, vb);
    gr.addColorStop(0, C['rm-plain2']); gr.addColorStop(0.5, C['rm-plain']); gr.addColorStop(1, C['rm-plain2']);
    b.fillStyle = gr; b.fillRect(x0, vt, x1 - x0, vb - vt);
    // 田地與草叢的小點（固定亂數，畫面不閃）
    const rnd = K.rng(97);
    const n = Math.round((x1 - x0) * (vb - vt) / 90);
    for (let i = 0; i < n; i++) {
      const px = x0 + rnd() * (x1 - x0), py = vt + rnd() * (vb - vt), r = 0.6 + rnd() * 1.4;
      b.fillStyle = D.alpha(rnd() < 0.5 ? C['rm-hill2'] : C['surface'], D.dark ? 0.12 : 0.18);
      b.beginPath(); b.arc(px, py, r, 0, 6.283); b.fill();
    }
    // 兩側山坡：往外越來越暗，加幾條等高線
    [[vt, yt, -1], [vb, yb, 1]].forEach(function (s) {
      const g2 = b.createLinearGradient(0, s[0], 0, s[1]);
      g2.addColorStop(0, C['rm-hill']); g2.addColorStop(1, C['rm-hill2']);
      b.fillStyle = g2; b.fillRect(x0, Math.min(s[0], s[1]), x1 - x0, Math.abs(s[1] - s[0]));
      b.strokeStyle = D.alpha(C['text'], D.dark ? 0.12 : 0.1); b.lineWidth = 1;
      for (let q = 1; q <= 3; q++) {
        const yy = s[0] + (s[1] - s[0]) * q / 4;
        b.beginPath();
        for (let px = x0; px <= x1; px += 6) {
          const wob = Math.sin(px * 0.031 + q * 1.7) * 1.6 + Math.sin(px * 0.011 + q) * 2.2;
          if (px === x0) b.moveTo(px, yy + wob); else b.lineTo(px, yy + wob);
        }
        b.stroke();
      }
    });
    // 谷壁的邊緣：一條柔和的陰影線
    b.strokeStyle = D.alpha(C['text'], D.dark ? 0.35 : 0.28); b.lineWidth = 1.2;
    b.beginPath(); b.moveTo(x0, vt); b.lineTo(x1, vt); b.moveTo(x0, vb); b.lineTo(x1, vb); b.stroke();
    // 外框
    b.strokeStyle = D.alpha(C['text'], 0.25); b.lineWidth = 1;
    b.strokeRect(x0 + 0.5, yt + 0.5, x1 - x0 - 1, yb - yt - 1);
    bg = c; bgKey = key;
    return bg;
  }

  function pathOf(c, X, Y, g) {
    c.beginPath();
    c.moveTo(sx(X[0], g), sy(Y[0], g));
    for (let i = 1; i < X.length; i++) c.lineTo(sx(X[i], g), sy(Y[i], g));
  }

  // ---------- 舊河道與牛軛湖（變化慢，快取成一層） ----------
  let layer = null, layerKey = '';
  function oxStyle(o) {
    const age = R.t - o.t0, f = age / K.FILL_YR;
    if (f < 1) return { water: true, f: f, color: D.mix(C['rm-water2'], C['rm-marsh'], Math.pow(f, 1.6)), wf: 1 - 0.45 * f, a: 1 };
    return { water: false, f: f, color: C['rm-marsh'], wf: 0.5, a: Math.max(0.3, 0.9 - 0.3 * (f - 1)) };
  }
  function staticLayer(g) {
    const key = [size.w, size.h, size.dpr, D.dark, state.hist, R.hist.length, R.hist.length ? R.hist[R.hist.length - 1].t : 0,
      R.oxbows.length, R.oxbows.length ? R.oxbows[R.oxbows.length - 1].t0 : 0, Math.floor(R.t / 20), R.W, state.ox ? state.ox.t0 : -1].join('|');
    if (layer && layerKey === key) return layer;
    // 同一張畫布重複使用（時間在走時每 20 年才重畫一次；每次都建新畫布會讓手機與內顯卡住）
    const c = layer || document.createElement('canvas');
    const cw = Math.round(size.w * size.dpr), ch = Math.round(size.h * size.dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const b = c.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, cw, ch);
    b.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    b.lineJoin = 'round'; b.lineCap = 'round';
    // 舊河道：越新越清楚
    if (state.hist) {
      const H = R.hist, n = H.length;
      for (let q = 0; q < n; q++) {
        b.strokeStyle = D.alpha(C['rm-scroll'], (D.dark ? 0.16 : 0.14) + 0.36 * (q + 1) / n);
        b.lineWidth = 1;
        pathOf(b, H[q].x, H[q].y, g); b.stroke();
      }
    }
    // 牛軛湖：剛形成是水，慢慢變成溼地，再變成淡淡的痕跡
    const Wpx = Math.max(2.2, R.W * g.sc);
    R.oxbows.forEach(function (o) {
      const s = oxStyle(o);
      b.globalAlpha = s.a;
      if (s.water) {
        b.strokeStyle = D.alpha(C['rm-bank'], 0.55); b.lineWidth = Wpx * s.wf + 1.6;
        pathOf(b, o.x, o.y, g); b.stroke();
      }
      b.strokeStyle = s.color; b.lineWidth = Math.max(1.4, Wpx * s.wf);
      pathOf(b, o.x, o.y, g); b.stroke();
      if (s.water && Wpx > 3) {
        b.strokeStyle = D.alpha('#ffffff', D.dark ? 0.12 : 0.22); b.lineWidth = Math.max(1, Wpx * s.wf * 0.3);
        pathOf(b, o.x, o.y, g); b.stroke();
      }
      if (!s.water) {
        b.strokeStyle = D.alpha(C['rm-hill2'], 0.6); b.lineWidth = 1; b.setLineDash([2, 3]);
        pathOf(b, o.x, o.y, g); b.stroke(); b.setLineDash([]);
      }
      b.globalAlpha = 1;
      if (o === state.ox) {
        b.strokeStyle = C['rm-sel']; b.lineWidth = 2; b.setLineDash([5, 4]);
        pathOf(b, o.x, o.y, g); b.stroke(); b.setLineDash([]);
      }
    });
    layer = c; layerKey = key;
    return layer;
  }

  // ---------- 河道本身 ----------
  function normalAt(i) {
    const X = R.x, Y = R.y, n = X.length;
    const a = Math.max(0, i - 1), b2 = Math.min(n - 1, i + 1);
    const tx = X[b2] - X[a], ty = Y[b2] - Y[a], l = Math.hypot(tx, ty) || 1;
    return [ty / l, -tx / l];       // 右手法線（面向下游的右岸方向）
  }
  function drawRiver(g, phase) {
    const X = R.x, Y = R.y, n = X.length, Wpx = Math.max(2.2, R.W * g.sc);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const M = mig(), mx = M.max || 1;
    // 堆積：凸岸長出的沙（寬度隨堆積速度）
    if (state.erode) {
      // 依堆積速度分 6 級，每一級一次畫完（逐段描邊太慢）
      ctx.strokeStyle = C['rm-bar'];
      for (let lv = 1; lv <= 6; lv++) {
        const a = lv / 6, wb = R.W * (0.15 + 0.85 * a) * 0.9;
        ctx.lineWidth = Math.max(1, wb * g.sc);
        ctx.beginPath();
        for (let i = 1; i < n; i++) {
          const v = (M.R1[i] + M.R1[i - 1]) / 2, ai = Math.abs(v) / mx;
          if (ai < 0.08 || Math.min(6, Math.ceil(ai * 6)) !== lv) continue;
          const nr = normalAt(i), side = v > 0 ? -1 : 1;   // 往右移 → 左岸堆積
          const off = side * (R.W / 2 + wb / 2);
          ctx.moveTo(sx(X[i - 1] + nr[0] * off, g), sy(Y[i - 1] + nr[1] * off, g));
          ctx.lineTo(sx(X[i] + nr[0] * off, g), sy(Y[i] + nr[1] * off, g));
        }
        ctx.stroke();
      }
    }
    // 河岸（深色描邊）與水
    ctx.strokeStyle = D.alpha(C['rm-bank'], 0.85); ctx.lineWidth = Wpx + 2;
    pathOf(ctx, X, Y, g); ctx.stroke();
    ctx.strokeStyle = C['rm-water']; ctx.lineWidth = Wpx;
    pathOf(ctx, X, Y, g); ctx.stroke();
    if (Wpx > 3.5) {
      ctx.strokeStyle = D.alpha('#ffffff', D.dark ? 0.14 : 0.28); ctx.lineWidth = Wpx * 0.32;
      pathOf(ctx, X, Y, g); ctx.stroke();
    }
    // 侵蝕：被沖刷的凹岸（顏色深淺隨侵蝕速度）
    if (state.erode) {
      ctx.lineWidth = Math.max(1.4, Math.min(3, Wpx * 0.3));
      for (let lv = 1; lv <= 4; lv++) {
        ctx.strokeStyle = D.alpha(C['rm-cut'], 0.25 * lv);
        ctx.beginPath();
        for (let i = 1; i < n; i++) {
          const v = (M.R1[i] + M.R1[i - 1]) / 2, a = Math.abs(v) / mx;
          if (Math.min(4, Math.ceil(a * 4.0001 - 0.6)) !== lv) continue;
          const nr = normalAt(i), side = v > 0 ? 1 : -1, off = side * (R.W / 2 + 0.5 / g.sc);
          ctx.moveTo(sx(X[i - 1] + nr[0] * off, g), sy(Y[i - 1] + nr[1] * off, g));
          ctx.lineTo(sx(X[i] + nr[0] * off, g), sy(Y[i] + nr[1] * off, g));
        }
        ctx.stroke();
      }
    }
    // 水流：沿河道移動的白色短線
    if (state.flow) {
      ctx.strokeStyle = D.alpha('#ffffff', D.dark ? 0.45 : 0.7);
      ctx.lineWidth = Math.max(1, Math.min(2.2, Wpx * 0.22));
      ctx.setLineDash([5, 12]); ctx.lineDashOffset = -phase;
      pathOf(ctx, X, Y, g); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  }

  // =====================================================================
  // 剖面位置
  // =====================================================================
  function selIndex() {
    if (!state.sel) return -1;
    const nr = K.nearest(R, state.sel[0], state.sel[1]);
    return nr.i;
  }
  /** 剖面的資料（任務也用）：曲率、凹岸、水深、遷移速率、是不是河道上遷移最快的地方 */
  function selInfo() {
    const i = selIndex();
    if (i < 1 || i >= R.x.length - 1) return null;
    const M = mig(), cs = K.crossSection(R, i, M), si = K.sectionInfo(R, i, M);
    let s = 0; for (let q = 1; q <= i; q++) s += Math.hypot(R.x[q] - R.x[q - 1], R.y[q] - R.y[q - 1]);
    return Object.assign(si, { i: i, C: M.C[i], cs: cs, s: s });
  }

  function drawSel(g) {
    const i = selIndex();
    if (i < 0) return;
    const nr = normalAt(i), X = R.x[i], Y = R.y[i], half = R.W / 2 + Math.max(R.W * 0.6, 10 / g.sc);
    const ax = sx(X - nr[0] * half, g), ay = sy(Y - nr[1] * half, g), bx = sx(X + nr[0] * half, g), by = sy(Y + nr[1] * half, g);
    ctx.strokeStyle = D.alpha(C['surface'], 0.9); ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = C['rm-sel']; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    [[ax, ay], [bx, by]].forEach(function (p) { ctx.fillStyle = C['rm-sel']; ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 6.283); ctx.fill(); });
    const info = selInfo();
    if (info && Math.abs(info.c) >= 0.05) {
      // 凹岸在右手邊（c > 0）或左手邊
      const outer = info.c > 0 ? 1 : -1, L = half + 14 / g.sc;
      const ox2 = sx(X + nr[0] * L * outer, g), oy2 = sy(Y + nr[1] * L * outer, g);
      const ix = sx(X - nr[0] * L * outer, g), iy = sy(Y - nr[1] * L * outer, g);
      const font = '600 ' + Math.round(11 * (D.fs || 1)) + 'px ' + FONT;
      D.pill(ctx, T('凹岸', 'outer bank'), ox2, oy2 + 5, C['rm-cut'], 'center', font);
      D.pill(ctx, T('凸岸', 'inner bank'), ix, iy + 5, C['rm-scroll'], 'center', font);
    }
  }

  // =====================================================================
  // 主畫面
  // =====================================================================
  let flowPhase = 0;
  function drawMain() {
    const g = geom(), w = size.w, h = size.h;
    ctx.clearRect(0, 0, w, h);
    D.backdrop(ctx, w, h);
    ctx.drawImage(background(g), 0, 0, w, h);
    ctx.drawImage(staticLayer(g), 0, 0, w, h);
    drawRiver(g, flowPhase);
    // 人工截彎的預覽（滑鼠停在彎道上）
    if (preview && state.tool === 'cut') {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = D.alpha(C['rm-art'], 0.45); ctx.lineWidth = Math.max(3, R.W * g.sc + 3);
      pathOf(ctx, preview.lx, preview.ly, g); ctx.stroke();
      ctx.strokeStyle = C['rm-art']; ctx.lineWidth = Math.max(2, R.W * g.sc * 0.8); ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(sx(preview.a[0], g), sy(preview.a[1], g)); ctx.lineTo(sx(preview.b[0], g), sy(preview.b[1], g)); ctx.stroke();
      ctx.restore();
      D.pill(ctx, T('省下 ' + km(preview.saved, 1), 'saves ' + km(preview.saved, 1)), sx((preview.a[0] + preview.b[0]) / 2, g), sy((preview.a[1] + preview.b[1]) / 2, g) - 10, C['rm-art'], 'center', '600 11px ' + FONT);
    }
    // 截彎的漣漪
    const now = performance.now();
    flashes = flashes.filter(function (f) { return now - f.t0 < 1600; });
    flashes.forEach(function (f) {
      const u = (now - f.t0) / 1600;
      D.ripple(ctx, sx(f.x, g), sy(f.y, g), 6, u, f.art ? C['rm-art'] : C['rm-water2']);
    });
    drawSel(g);
    // 水流方向、比例尺、年份
    const fs = D.fs || 1;
    const font = '600 ' + Math.round(11 * fs) + 'px ' + FONT;
    const iy = sy(0, g), ix = sx(0, g);
    const flowC = D.dark ? C['rm-water'] : C['rm-water2'];
    D.arrow(ctx, ix - 2, iy - 16, ix + 30, iy - 16, flowC, 2);
    D.haloText(ctx, T('水流', 'flow'), ix + 34, iy - 16, flowC, 'left', 'middle', font);
    const bx = sx(150, g), by = sy(-VH / 2 - HILL * 0.5, g), bw = 1000 * g.sc;
    ctx.fillStyle = D.alpha(C['surface'], 0.8); D.roundRect(ctx, bx - 6, by - 14, bw + 12, 22, 6); ctx.fill();
    ctx.strokeStyle = C['text']; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by - 4); ctx.stroke();
    ctx.fillStyle = C['text']; ctx.font = '600 ' + Math.round(10 * fs) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('1 km', bx + bw / 2, by - 4);
    D.pill(ctx, yearsTxt(R.t), sx(VL, g) - 4, sy(VH / 2 + HILL * 0.5, g) + 6, C['text'], 'right', '700 ' + Math.round(12 * fs) + 'px ' + FONT);
    if (kb && kb.focused()) {
      ctx.strokeStyle = C['accent']; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      D.roundRect(ctx, 3, 3, w - 6, h - 6, 8); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // =====================================================================
  // 橫剖面
  // =====================================================================
  function drawXS() {
    const c = xctx, w = xsSize.w, h = xsSize.h, fs = D.fs || 1;
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    const font = Math.round(11 * fs) + 'px ' + FONT, bold = '600 ' + Math.round(11.5 * fs) + 'px ' + FONT;
    const info = state.ox ? null : selInfo();
    c.fillStyle = C['muted']; c.font = bold; c.textAlign = 'left'; c.textBaseline = 'top';
    if (state.ox) return drawOxXS(c, w, h, font, bold);
    if (!info) {
      c.fillText(T('橫剖面', 'Cross-section'), 10, 8);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font;
      c.fillText(T('點一下河道，看那裡的橫剖面', 'Tap the river to see its cross-section'), w / 2, h / 2);
      return;
    }
    const cs = info.cs, W = cs.W, Dm = cs.D;
    c.fillText(T('橫剖面（面向下游）', 'Cross-section (looking downstream)'), 10, 8);
    const pl = 10, pr = 10, pt = 64, pb = 20;
    const span = W * 2.4, hx = (w - pl - pr) / span;
    const bankH = 0.7 * Dm, depthMax = Math.max(cs.hMax, 1.6 * Dm);
    const vy = (h - pt - pb) / (bankH + depthMax);
    const X = function (n) { return pl + (n + span / 2) * hx; };     // n：往右岸為正（m）
    const Y = function (z) { return pt + (bankH - z) * vy; };         // z：高於水面為正（m）
    const ve = vy / hx;
    // 剖面形狀：河床 z = −h(n)；凸岸那邊的沙洲緩緩升到岸頂，凹岸是陡坎
    const outerRight = cs.c >= 0, N = cs.h.length;
    const bed = [];
    for (let q = 0; q < N; q++) bed.push([(q / (N - 1) - 0.5) * W, -cs.h[q]]);
    const innerSlope = W * 0.55;
    // 地面多邊形：左邊平原 → 左岸 → 河床 → 右岸 → 右邊平原 → 底
    const ground = [];
    const leftOuter = !outerRight;
    ground.push([-span / 2, bankH]);
    if (leftOuter) { ground.push([-W / 2 - W * 0.02, bankH]); ground.push([-W / 2, bed[0][1] * 0.6]); }
    else { ground.push([-W / 2 - innerSlope, bankH]); }
    bed.forEach(function (p) { ground.push(p); });
    if (leftOuter) { ground.push([W / 2 + innerSlope, bankH]); }
    else { ground.push([W / 2, bed[N - 1][1] * 0.6]); ground.push([W / 2 + W * 0.02, bankH]); }
    ground.push([span / 2, bankH]);
    const bottom = h - pb;
    // 水
    c.beginPath(); c.moveTo(X(-W / 2), Y(0));
    bed.forEach(function (p) { c.lineTo(X(p[0]), Y(Math.min(0, p[1]))); });
    c.lineTo(X(W / 2), Y(0)); c.closePath();
    const wg = c.createLinearGradient(0, Y(0), 0, Y(-depthMax));
    wg.addColorStop(0, D.alpha(C['rm-water'], 0.75)); wg.addColorStop(1, D.alpha(C['rm-water2'], 0.95));
    c.fillStyle = wg; c.fill();
    // 土與沙
    c.beginPath(); c.moveTo(X(ground[0][0]), Y(ground[0][1]));
    ground.forEach(function (p) { c.lineTo(X(p[0]), Y(p[1])); });
    c.lineTo(X(span / 2), bottom); c.lineTo(X(-span / 2), bottom); c.closePath();
    const sg2 = c.createLinearGradient(0, Y(bankH), 0, bottom);
    const soil = D.dark ? D.mix(C['rm-bank'], C['bg'], 0.55) : C['rm-bank'];
    sg2.addColorStop(0, D.mix(soil, C['rm-plain'], 0.35)); sg2.addColorStop(1, soil);
    c.fillStyle = sg2; c.fill();
    // 凸岸的新沙（曲流沙洲）
    c.beginPath();
    const sgn = outerRight ? -1 : 1;
    c.moveTo(X(sgn * (W / 2 + innerSlope)), Y(bankH));
    for (let q = 0; q < N; q++) {
      const p = bed[outerRight ? q : N - 1 - q];
      if (sgn * p[0] < -W * 0.05) break;
      c.lineTo(X(p[0]), Y(p[1]));
    }
    c.lineTo(X(0), Y(-cs.D * 0.9)); c.lineTo(X(sgn * (W / 2 + innerSlope * 0.6)), Y(bankH - Dm * 0.15)); c.closePath();
    c.fillStyle = D.alpha(C['rm-bar'], 0.9); c.fill();
    // 地表線、水面線
    c.strokeStyle = D.alpha(C['text'], 0.55); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(X(ground[0][0]), Y(ground[0][1])); ground.forEach(function (p) { c.lineTo(X(p[0]), Y(p[1])); }); c.stroke();
    c.strokeStyle = C['rm-water2']; c.lineWidth = 1.2; c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(X(-W / 2 - innerSlope * 0.3), Y(0)); c.lineTo(X(W / 2 + innerSlope * 0.3), Y(0)); c.stroke(); c.setLineDash([]);
    // 凹岸的陡坎：侵蝕記號
    const ob = outerRight ? W / 2 : -W / 2;
    c.strokeStyle = C['rm-cut']; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(X(ob + (outerRight ? W * 0.02 : -W * 0.02)), Y(bankH)); c.lineTo(X(ob), Y(-(outerRight ? cs.h[N - 1] : cs.h[0]) * 0.6)); c.stroke();
    // 螺旋流：表層往凹岸、底層往凸岸
    if (Math.abs(cs.c) >= 0.05) {
      const cx0 = X(0), cy0 = Y(-Dm * 0.55), rx = W * 0.28 * hx, ry = Math.max(6, Dm * 0.32 * vy);
      const dir = outerRight ? 1 : -1;
      c.strokeStyle = D.alpha('#ffffff', 0.9); c.lineWidth = 1.6;
      c.beginPath(); c.ellipse(cx0, cy0, rx, ry, 0, 0, 2 * Math.PI); c.stroke();
      D.arrow(c, cx0 - dir * rx * 0.2, cy0 - ry, cx0 + dir * rx * 0.25, cy0 - ry, '#ffffff', 1.6);
      D.arrow(c, cx0 + dir * rx * 0.2, cy0 + ry, cx0 - dir * rx * 0.25, cy0 + ry, '#ffffff', 1.6);
    }
    // 河道往哪邊移
    const mv = info.R1, ay = 32;
    if (Math.abs(mv) > 0.005) {
      const dir = mv > 0 ? 1 : -1;
      D.arrow(c, w / 2 - dir * 22, ay, w / 2 + dir * 22, ay, C['rm-cut'], 2);
      c.font = font; c.fillStyle = C['rm-cut']; c.textAlign = dir > 0 ? 'right' : 'left'; c.textBaseline = 'middle';
      c.fillText(T('河道往這邊移 ' + num(Math.abs(mv), 1) + ' m/年', 'channel moves ' + num(Math.abs(mv), 1) + ' m/yr'), w / 2 - dir * 28, ay);
    }
    // 標籤
    if (Math.abs(cs.c) >= 0.05) {
      const lo = outerRight ? 'right' : 'left';
      c.font = bold; c.textBaseline = 'bottom';
      c.fillStyle = C['rm-cut']; c.textAlign = lo;
      c.fillText(T('凹岸・攻擊坡（侵蝕）', 'outer: cut bank (erosion)'), lo === 'right' ? w - 6 : 6, pt - 4);
      c.fillStyle = D.dark ? C['rm-bar'] : C['rm-scroll']; c.textAlign = lo === 'right' ? 'left' : 'right';
      c.fillText(T('凸岸・滑走坡（堆積）', 'inner: point bar (deposition)'), lo === 'right' ? 6 : w - 6, pt - 4);
    } else {
      c.font = font; c.fillStyle = C['muted']; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText(T('這裡幾乎是直的：兩岸一樣深', 'Almost straight here: both sides equally deep'), w / 2, pt - 4);
    }
    c.font = font; c.fillStyle = C['muted']; c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText(T('垂直放大 ' + num(ve, 0) + ' 倍', 'vertical × ' + num(ve, 0)), w - 6, h - 3);
    c.textAlign = 'left';
    c.fillText(T('左岸', 'left bank') + ' ← → ' + T('右岸', 'right bank'), 6, h - 3);
  }
  function drawOxXS(c, w, h, font, bold) {
    const o = state.ox, age = R.t - o.t0, f = Math.min(1, age / K.FILL_YR), Wm = R.W, Dm = R.W / K.WD;
    c.fillText(T('牛軛湖的橫剖面', 'Oxbow lake cross-section'), 10, 8);
    const pl = 10, pt = 40, pb = 22, span = Wm * 2.4, hx = (w - 2 * pl) / span, bankH = 0.7 * Dm, depthMax = 1.6 * Dm;
    const vy = (h - pt - pb) / (bankH + depthMax);
    const X = function (n) { return pl + (n + span / 2) * hx; };
    const Y = function (z) { return pt + (bankH - z) * vy; };
    const bed = function (n) { const u = n / (Wm / 2); return -Dm * 1.25 * Math.max(0, 1 - u * u); };
    const fillTop = -Dm * 1.25 * (1 - f);                   // 淤積面
    const bottom = h - 6;
    // 土
    c.beginPath(); c.moveTo(X(-span / 2), Y(bankH)); c.lineTo(X(-Wm / 2 - Wm * 0.2), Y(bankH));
    for (let q = 0; q <= 40; q++) { const n = -Wm / 2 + Wm * q / 40; c.lineTo(X(n), Y(bed(n))); }
    c.lineTo(X(Wm / 2 + Wm * 0.2), Y(bankH)); c.lineTo(X(span / 2), Y(bankH)); c.lineTo(X(span / 2), bottom); c.lineTo(X(-span / 2), bottom); c.closePath();
    c.fillStyle = D.dark ? D.mix(C['rm-bank'], C['bg'], 0.55) : C['rm-bank']; c.fill();
    // 淤泥（越久越厚）
    c.beginPath();
    let started = false;
    for (let q = 0; q <= 40; q++) { const n = -Wm / 2 + Wm * q / 40, z = bed(n); if (z < fillTop) { if (!started) { c.moveTo(X(n), Y(fillTop)); started = true; } c.lineTo(X(n), Y(z)); } }
    if (started) { c.closePath(); c.fillStyle = D.mix(C['rm-bank'], C['rm-marsh'], 0.45); c.fill(); }
    // 水
    if (f < 1) {
      c.beginPath(); let st = false;
      for (let q = 0; q <= 40; q++) { const n = -Wm / 2 + Wm * q / 40, z = Math.max(bed(n), fillTop); if (z < 0) { if (!st) { c.moveTo(X(n), Y(0)); st = true; } c.lineTo(X(n), Y(z)); } }
      if (st) { c.closePath(); c.fillStyle = D.alpha(C['rm-water2'], 0.85); c.fill(); }
    }
    // 水草（後期）
    if (f > 0.5) {
      c.strokeStyle = C['rm-marsh']; c.lineWidth = 1.5;
      for (let q = 0; q < 12; q++) {
        const n = -Wm * 0.45 + Wm * 0.9 * (q + 0.5) / 12, z = Math.max(bed(n), fillTop);
        c.beginPath(); c.moveTo(X(n), Y(z)); c.lineTo(X(n) + (q % 2 ? 2 : -2), Y(z) - 8 - 6 * (f - 0.5)); c.stroke();
      }
    }
    c.font = font; c.fillStyle = C['text']; c.textAlign = 'center'; c.textBaseline = 'top';
    const pct = Math.round(f * 100);
    c.fillText(f < 1 ? T(num(age, 0) + ' 年前截彎形成，淤積約 ' + pct + '%', 'Cut off ' + num(age, 0) + ' years ago, about ' + pct + '% filled')
      : T(num(age, 0) + ' 年前截彎形成，已淤成溼地', 'Cut off ' + num(age, 0) + ' years ago, now a wetland'), w / 2, 26);
  }

  // =====================================================================
  // 彎曲度圖
  // =====================================================================
  function niceStep(span) { const s = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]; for (let i = 0; i < s.length; i++) if (span / s[i] <= 6) return s[i]; return 20000; }
  function drawSG() {
    const c = sctx, w = sgSize.w, h = sgSize.h, fs = D.fs || 1;
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    const font = Math.round(10.5 * fs) + 'px ' + FONT;
    c.fillStyle = C['muted']; c.font = '600 ' + Math.round(11.5 * fs) + 'px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(T('彎曲度隨時間', 'Sinuosity through time'), 10, 8);
    const pl = 34, pr = 12, pt = 30, pb = 26;
    const tMax = Math.max(200, Math.ceil(R.t / 100) * 100);
    let yMax = 2;
    series.forEach(function (p) { if (p[1] > yMax) yMax = p[1]; });
    yMax = Math.ceil(yMax * 2) / 2 + 0.25;
    const X = function (t) { return pl + t / tMax * (w - pl - pr); };
    const Y = function (s) { return pt + (yMax - s) / (yMax - 1) * (h - pt - pb); };
    // 格線
    c.strokeStyle = D.alpha(C['text'], 0.1); c.lineWidth = 1; c.font = font; c.fillStyle = C['muted'];
    c.textAlign = 'right'; c.textBaseline = 'middle';
    const ys = yMax > 4 ? 1 : 0.5;
    for (let s = 1; s <= yMax + 1e-9; s += ys) { c.beginPath(); c.moveTo(pl, Y(s)); c.lineTo(w - pr, Y(s)); c.stroke(); c.fillText(num(s, ys < 1 ? 1 : 0), pl - 4, Y(s)); }
    const ts = niceStep(tMax);
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let t = 0; t <= tMax + 1e-9; t += ts) { c.beginPath(); c.moveTo(X(t), pt); c.lineTo(X(t), h - pb); c.stroke(); c.fillText(num(t, 0), X(t), h - pb + 3); }
    c.textAlign = 'right'; c.fillText(T('年', 'yr'), w - pr, h - pb + 3 + Math.round(11 * fs));
    // 曲流河的門檻 1.5
    c.strokeStyle = D.alpha(C['rm-sel'], 0.6); c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(pl, Y(1.5)); c.lineTo(w - pr, Y(1.5)); c.stroke(); c.setLineDash([]);
    c.fillStyle = C['rm-sel']; c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillText(T('曲流河 1.5', 'meandering 1.5'), pl + 4, Y(1.5) - 2);
    // 截彎的時刻
    R.events.forEach(function (e) {
      const x = X(e.t);
      c.fillStyle = e.art ? C['rm-art'] : C['rm-water2'];
      c.beginPath(); c.moveTo(x, h - pb - 1); c.lineTo(x - 3.5, h - pb - 7); c.lineTo(x + 3.5, h - pb - 7); c.closePath(); c.fill();
    });
    // 曲線
    if (series.length > 1) {
      c.beginPath(); c.moveTo(X(series[0][0]), Y(1));
      series.forEach(function (p) { c.lineTo(X(p[0]), Y(p[1])); });
      c.lineTo(X(series[series.length - 1][0]), Y(1)); c.closePath();
      c.fillStyle = D.alpha(C['rm-sin'], 0.12); c.fill();
      c.beginPath(); series.forEach(function (p, i) { if (i) c.lineTo(X(p[0]), Y(p[1])); else c.moveTo(X(p[0]), Y(p[1])); });
      c.strokeStyle = C['rm-sin']; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
    }
    const s = K.sinuosity(R);
    D.ball(c, X(R.t), Y(s), 4.5, C['rm-sin']);
    D.pill(c, num(s, 2), Math.min(w - pr - 20, X(R.t) + 8), Y(s) - 6, C['rm-sin'], 'left', '700 ' + Math.round(11 * fs) + 'px ' + FONT);
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function updateReadouts() {
    const s = K.sinuosity(R), L = K.length(R), lam = K.wavelength(R), M = mig();
    setOut(el.W, num(state.W, 0));
    setOut(el.k, num(state.k, 1));
    setText('rT', num(R.t, 0) + T(' 年', ' years'));
    setText('rD', num(R.W / K.WD, 1) + ' m');
    setHTML('rSin', num(s, 3) + '<span class="chip-cls">' + sinClass(s) + '</span>');
    setText('rLen', km(L, 2));
    setText('rLam', lam ? num(lam, 0) + ' m' + T('（' + num(lam / R.W, 1) + ' 倍河寬）', ' (' + num(lam / R.W, 1) + ' W)') : T('—（彎還不明顯）', '— (bends too small yet)'));
    setText('rMig', num(M.max, 1) + T(' m/年', ' m/yr'));
    setText('rSlope', num(1 / s, 2) + ' ‰');
    setText('rCuts', String(R.cuts));
    setText('rArt', String(R.artCuts));
    let lakes = 0, marsh = 0;
    R.oxbows.forEach(function (o) { if (R.t - o.t0 < K.FILL_YR) lakes++; else marsh++; });
    setText('rLakes', String(lakes)); setText('rMarsh', String(marsh));
    const lc = R.lastCut;
    setText('rLast', lc ? T(yearsTxt(lc.t) + (lc.art ? '，人工截彎' : '，自然截彎') + '，截下 ' + km(lc.len, 1) + ' 的舊河道（' + num(R.t - lc.t, 0) + ' 年前）',
      'Year ' + num(lc.t, 0) + (lc.art ? ', by people' : ', natural') + ': ' + km(lc.len, 1) + ' of old channel cut off (' + num(R.t - lc.t, 0) + ' years ago)') : T('還沒有', 'none yet'));
    // 剖面
    if (state.ox) {
      const o = state.ox, age = R.t - o.t0;
      setText('rWhere', T('牛軛湖（' + (o.art ? '人工截彎' : '自然截彎') + '），長 ' + km(o.len, 1) + '，' + num(age, 0) + ' 年前形成' + (age >= K.FILL_YR ? '，已淤成溼地' : ''),
        'Oxbow lake (' + (o.art ? 'cut by people' : 'natural cut-off') + '), ' + km(o.len, 1) + ' long, formed ' + num(age, 0) + ' years ago' + (age >= K.FILL_YR ? ', now a wetland' : '')));
      ['rRad', 'rHo', 'rHi', 'rMv'].forEach(function (id) { setText(id, '—'); });
    } else {
      const info = selInfo();
      if (!info) {
        setText('rWhere', T('點一下河道', 'Tap the river'));
        ['rRad', 'rHo', 'rHi', 'rMv'].forEach(function (id) { setText(id, '—'); });
      } else {
        setText('rWhere', T('河道上，從上游端算起 ' + km(info.s, 2) + '（河谷 ' + km(R.x[info.i], 2) + ' 處）', 'On the river, ' + km(info.s, 2) + ' from the upstream end (' + km(R.x[info.i], 2) + ' down the valley)'));
        const rad = Math.abs(info.C) > 1e-6 ? 1 / Math.abs(info.C) : Infinity;
        setText('rRad', rad < 50 * R.W ? num(rad, 0) + ' m' + T('（' + num(rad / R.W, 1) + ' 倍河寬）', ' (' + num(rad / R.W, 1) + ' W)') : T('幾乎是直的', 'almost straight'));
        setText('rHo', Math.abs(info.c) >= 0.05 ? num(info.hOut, 1) + ' m' : num(info.cs.D, 1) + ' m');
        setText('rHi', Math.abs(info.c) >= 0.05 ? (info.bar ? T('0（露出沙洲）', '0 (bare sand)') : num(info.hIn, 1) + ' m') : num(info.cs.D, 1) + ' m');
        setText('rMv', num(Math.abs(info.R1), 2) + T(' m/年', ' m/yr') + (Math.abs(info.R1) > 0.005 ? T(info.R1 > 0 ? '，往右岸' : '，往左岸', info.R1 > 0 ? ', toward the right bank' : ', toward the left bank') : ''));
      }
    }
    $('run').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play');
    $('run').setAttribute('aria-pressed', state.running ? 'true' : 'false');
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function setStatus(s) { $('status').innerHTML = s; }
  function snapshot(act) {
    const extra = { running: state.running, act: act || 'run', tool: state.tool, sel: null, selOx: null };
    if (state.ox) extra.selOx = { age: R.t - state.ox.t0, len: state.ox.len, art: state.ox.art };
    else {
      const info = selInfo();
      if (info) extra.sel = { c: info.c, R1: info.R1, R1max: info.R1max, bar: info.bar, top: info.top, hOut: info.hOut, hIn: info.hIn };
    }
    return K.snapshot(R, extra);
  }
  let lastEmit = 0, emitTimer = 0;
  let lastRead = 0;
  function afterChange(force, act) {
    const tNow = performance.now();
    // 時間在走時讀數每 0.15 秒更新一次就夠了（每一幀都改文字會一直重新排版）
    if (force || act !== 'run' || tNow - lastRead > 150) { lastRead = tNow; updateReadouts(); }
    requestDraw();
    clearTimeout(emitTimer);
    if (force || tNow - lastEmit > 400) { lastEmit = tNow; emit('river', snapshot(act)); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit('river', snapshot('run')); }, 420);
  }

  // =====================================================================
  // 時間推進
  // =====================================================================
  function record() {
    const s = K.sinuosity(R), last = series[series.length - 1];
    const cutNow = R.cuts + R.artCuts !== seenCuts;
    if (cutNow || R.t - last[0] >= 2) {
      if (cutNow && R.t - last[0] > 0.01) series.push([R.t, last[1]]);   // 截彎前一刻
      series.push([R.t, s]);
    }
    if (series.length > 2400) {
      const out = [series[0]];
      for (let i = 1; i < series.length - 1; i += 2) out.push(series[i], series[i + 1]);
      // 每兩點留一點：保留較大的（截彎前的峰值）
      const thin = [series[0]];
      for (let i = 1; i < series.length - 1; i += 2) thin.push(series[i][1] >= series[i + 1][1] ? series[i] : series[i + 1]);
      thin.push(series[series.length - 1]);
      series = thin;
    }
  }
  function noticeCuts() {
    const total = R.cuts + R.artCuts;
    if (total === seenCuts) return;
    const n = Math.min(total - seenCuts, R.events.length);
    for (let q = R.events.length - n; q < R.events.length; q++) {
      const e = R.events[q];
      if (!reducedMotion) flashes.push({ x: e.x, y: e.y, art: e.art, t0: performance.now() });
    }
    seenCuts = total;
    if (state.ox && R.oxbows.indexOf(state.ox) < 0) state.ox = null;
    const now = performance.now(), lc = R.lastCut;
    if (lc && !lc.art && now - lastCutMsg > 1500) {
      lastCutMsg = now;
      setStatus(T(yearsTxt(lc.t) + '：曲流頸的兩岸碰在一起，河水抄了近路，留下 ' + km(lc.len, 1) + ' 長的牛軛湖。', 'Year ' + num(lc.t, 0) + ': the banks of a neck met and the river took the shortcut, leaving a ' + km(lc.len, 1) + ' oxbow lake.'));
    }
  }
  function advanceTo(target) {
    const t0 = performance.now();
    while (R.t < target - 1e-9 && performance.now() - t0 < FRAME_BUDGET) {
      K.step(R);
      record();
      noticeCuts();
    }
  }

  // =====================================================================
  // 動畫迴圈
  // =====================================================================
  let raf = 0, lastTs = 0, idleUntil = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    if (state.running) {
      advanceTo(R.t + state.spd * dt);
      afterChange(false, 'run');
    }
    if (state.flow && !reducedMotion && (state.running || ts < idleUntil)) flowPhase += dt * 22;
    drawMain(); drawXS(); drawSG();
    if (state.running || flashes.length || (state.flow && !reducedMotion && ts < idleUntil)) requestDraw();   // afterChange 可能已經排好下一幀：只排一次，否則每幀的回呼會加倍
    else lastTs = 0;
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setRun(on) {
    state.running = !!on;
    idleUntil = performance.now() + 2500;
    afterChange(true, state.running ? 'play' : 'pause');
  }
  $('run').addEventListener('click', function () {
    acted();
    setRun(!state.running);
    if (state.running) setStatus(T('時間開始走：每秒 ' + state.spd + ' 年。', 'Time is running: ' + state.spd + ' years per second.'));
    else setStatus(T('暫停在' + yearsTxt(R.t) + '。', 'Paused at ' + yearsTxt(R.t) + '.'));
  });
  $('step').addEventListener('click', function () {
    acted();
    if (state.running) state.running = false;
    const target = R.t + 1;
    let g = 0;
    while (R.t < target - 1e-9 && g++ < 5000) { K.step(R); record(); noticeCuts(); }
    setStatus(T('往前一年：' + yearsTxt(R.t) + '，彎曲度 ' + num(K.sinuosity(R), 3) + '。', 'One more year: ' + yearsTxt(R.t) + ', sinuosity ' + num(K.sinuosity(R), 3) + '.'));
    afterChange(true, 'step');
  });
  function restart(newSeed) {
    if (newSeed) state.seed = state.seed % 999 + 1;
    R = K.create({ W: state.W, k: state.k, seed: state.seed });
    series = [[0, K.sinuosity(R)]];
    seenCuts = 0; flashes = []; state.ox = null; state.sel = null; preview = null;
    MIG = null; layerKey = '';
  }
  $('newRiver').addEventListener('click', function () {
    acted(); restart(true);
    setStatus(T('換了一條新的河谷（第 ' + state.seed + ' 號），從第 0 年開始。', 'A new valley (no. ' + state.seed + '), starting at year 0.'));
    afterChange(true, 'reset');
  });
  $('clear').addEventListener('click', function () {
    acted(); restart(false);
    setStatus(T('同一條河谷從頭開始：牛軛湖、舊河道和彎曲度紀錄都清掉了。', 'This valley starts again: oxbow lakes, old channels and the sinuosity record are cleared.'));
    afterChange(true, 'reset');
  });
  function paramChanged() {
    acted();
    const oldW = R.W;
    readSliders();
    R.W = state.W; R.k = state.k;
    if (R.W !== oldW) { K.resample(R); layerKey = ''; }
    MIG = null;
    afterChange(true, 'param');
  }
  [el.W, el.k].forEach(function (inp) { inp.addEventListener('input', paramChanged); inp.addEventListener('change', paramChanged); });
  document.querySelectorAll('#spdSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.spd = +b.getAttribute('data-spd');
      document.querySelectorAll('#spdSeg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      setStatus(T('速度：每秒 ' + state.spd + ' 年（電腦算不過來時會自動放慢）。', 'Speed: ' + state.spd + ' years per second (slower if your device cannot keep up).'));
      afterChange(true, 'param');
    });
  });
  function setTool(t) {
    state.tool = t; preview = null;
    $('toolLook').setAttribute('aria-pressed', t === 'look' ? 'true' : 'false');
    $('toolCut').setAttribute('aria-pressed', t === 'cut' ? 'true' : 'false');
    $('lab').classList.toggle('cutmode', t === 'cut');
    $('hintLook').hidden = t !== 'look'; $('hintCut').hidden = t !== 'cut';
    requestDraw();
  }
  $('toolLook').addEventListener('click', function () { acted(); setTool('look'); afterChange(true, 'tool'); });
  $('toolCut').addEventListener('click', function () {
    acted(); setTool('cut');
    setStatus(T('人工截彎：點一個彎道，從它最窄的頸部挖一條新河道。', 'Cut a bend: tap a bend to dig a new channel across its narrowest neck.'));
    afterChange(true, 'tool');
  });
  function toggle(id, key) {
    $(id).addEventListener('click', function () {
      acted(); state[key] = !state[key];
      $(id).setAttribute('aria-pressed', state[key] ? 'true' : 'false');
      layerKey = ''; idleUntil = performance.now() + 2500;
      afterChange(true, 'layer');
    });
  }
  toggle('tHist', 'hist'); toggle('tErode', 'erode'); toggle('tFlow', 'flow');

  // ---------- 點畫布 ----------
  function hitOxbow(p, thr) {
    let best = null, bd = thr;
    for (let q = R.oxbows.length - 1; q >= 0; q--) {
      const o = R.oxbows[q];
      for (let i = 0; i < o.x.length; i++) {
        const d = Math.hypot(o.x[i] - p[0], o.y[i] - p[1]);
        if (d < bd) { bd = d; best = o; }
      }
    }
    return best ? { o: best, d: bd } : null;
  }
  function selectAt(p, g) {
    const nr = K.nearest(R, p[0], p[1]);
    const thrCh = Math.max(1.5 * R.W, 16 / g.sc), thrOx = Math.max(R.W, 12 / g.sc);
    const ho = hitOxbow(p, thrOx);
    if (ho && (nr.d > thrCh || ho.d < nr.d)) {
      state.ox = ho.o; state.sel = null;
      const age = R.t - ho.o.t0;
      setStatus(T('牛軛湖：' + num(age, 0) + ' 年前' + (ho.o.art ? '人工截彎' : '自然截彎') + '留下的舊河道，長 ' + km(ho.o.len, 1) + (age >= K.FILL_YR ? '，已經淤成溼地。' : '。'),
        'Oxbow lake: old channel left ' + num(age, 0) + ' years ago by a ' + (ho.o.art ? 'cut made by people' : 'natural cut-off') + ', ' + km(ho.o.len, 1) + ' long' + (age >= K.FILL_YR ? ', now a wetland.' : '.')));
      layerKey = '';
      afterChange(true, 'oxbow');
      return;
    }
    if (nr.d > Math.max(3 * thrCh, 40 / g.sc)) {
      setStatus(T('離河道太遠了：點在河道上（藍色）看橫剖面。', 'Too far from the river: tap on the blue channel.'));
      return;
    }
    state.ox = null; state.sel = [R.x[nr.i], R.y[nr.i]]; layerKey = '';
    const info = selInfo();
    if (info) {
      const curved = Math.abs(info.c) >= 0.05;
      setStatus(curved ? T('彎道：凹岸水深 ' + num(info.hOut, 1) + ' m、凸岸 ' + (info.bar ? '露出沙洲' : num(info.hIn, 1) + ' m') + '，河道每年往凹岸移 ' + num(Math.abs(info.R1), 2) + ' m。',
        'Bend: ' + num(info.hOut, 1) + ' m deep at the outer bank, ' + (info.bar ? 'bare sand' : num(info.hIn, 1) + ' m') + ' at the inner bank; the channel moves ' + num(Math.abs(info.R1), 2) + ' m a year toward the outer bank.')
        : T('這一段幾乎是直的，兩岸水深差不多。', 'This stretch is almost straight: both sides are about equally deep.'));
    }
    afterChange(true, 'select');
  }
  function cutAt(p) {
    const res = K.artificialCut(R, p[0], p[1]);
    preview = null; MIG = null; layerKey = '';
    if (!res) {
      setStatus(T('這裡沒有可以截的彎：彎張得太開（頸部比 12 倍河寬還寬），或離河道太遠。', 'Nothing to cut here: the bend is too open (neck wider than 12 W) or too far from the river.'));
      afterChange(true, 'nocut');
      return;
    }
    record(); noticeCuts();
    setStatus(T('人工截彎：挖了 ' + num(res.neck, 0) + ' m 的新河道，河道少走 ' + km(res.saved, 2) + '；彎曲度 ' + num(res.before, 2) + ' → ' + num(res.after, 2) + '。',
      'Cut made: ' + num(res.neck, 0) + ' m of new channel saves ' + km(res.saved, 2) + '; sinuosity ' + num(res.before, 2) + ' → ' + num(res.after, 2) + '.'));
    afterChange(true, 'art');
  }
  function pt(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (e) {
    const g = geom(), q = pt(e), p = toWorld(q[0], q[1], g);
    acted();
    if (state.tool === 'cut') cutAt(p); else selectAt(p, g);
  });
  let pvTimer = 0;
  cv.addEventListener('pointermove', function (e) {
    if (state.tool !== 'cut' || e.pointerType !== 'mouse') return;
    clearTimeout(pvTimer);
    const q = pt(e);
    pvTimer = setTimeout(function () {
      const g = geom(), p = toWorld(q[0], q[1], g);
      const c = Object.assign({}, R, { x: R.x.slice(), y: R.y.slice(), oxbows: R.oxbows.slice(), events: R.events.slice(), hist: [] });
      const res = K.artificialCut(c, p[0], p[1]);
      preview = res ? { lx: res.ox.x, ly: res.ox.y, a: [res.ox.x[0], res.ox.y[0]], b: [res.ox.x[res.ox.x.length - 1], res.ox.y[res.ox.y.length - 1]], saved: res.saved } : null;
      requestDraw();
    }, 40);
  });
  cv.addEventListener('pointerleave', function () { preview = null; requestDraw(); });

  // ---------- 鍵盤：沿著河道移動剖面 ----------
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('河谷俯視圖。方向鍵沿著河道移動橫剖面的位置（Shift 走大步）。', 'Valley seen from above. Arrow keys move the cross-section along the river (Shift for big steps).'),
    items: [{
      name: function () { return T('橫剖面位置', 'Cross-section position'); },
      move: function (dx, dy, big) {
        acted();
        let i = selIndex();
        if (i < 0) i = Math.floor(R.x.length / 2);
        else i += (dx || dy) * (big ? 10 : 1);
        i = Math.max(1, Math.min(R.x.length - 2, i));
        state.ox = null; state.sel = [R.x[i], R.y[i]];
        afterChange(true, 'select');
        return true;
      },
      describe: function () {
        const info = selInfo();
        if (!info) return T('還沒有選剖面', 'no cross-section yet');
        return T('從上游端 ' + km(info.s, 2) + '，曲率半徑 ' + (Math.abs(info.C) > 1e-6 ? num(1 / Math.abs(info.C), 0) + ' m' : '無限大') + '，河岸後退 ' + num(Math.abs(info.R1), 2) + ' m/年',
          km(info.s, 2) + ' from the upstream end, bend radius ' + (Math.abs(info.C) > 1e-6 ? num(1 / Math.abs(info.C), 0) + ' m' : 'infinite') + ', bank retreat ' + num(Math.abs(info.R1), 2) + ' m/yr');
      }
    }],
    onChange: function () { requestDraw(); }
  }) : null;

  // ---------- 分享：河谷、設定、圖層 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { s: state.seed, v: state.spd, h: state.hist ? 1 : 0, e: state.erode ? 1 : 0, f: state.flow ? 1 : 0 };
    },
    set: function (o) {
      if (!o) return;
      if (isFinite(o.s) && o.s >= 1 && o.s <= 999) state.seed = Math.round(o.s);
      if (SPDS.indexOf(o.v) >= 0) {
        state.spd = o.v;
        document.querySelectorAll('#spdSeg button').forEach(function (x) { x.setAttribute('aria-pressed', +x.getAttribute('data-spd') === state.spd ? 'true' : 'false'); });
      }
      state.hist = o.h !== 0; state.erode = o.e !== 0; state.flow = o.f !== 0;
      $('tHist').setAttribute('aria-pressed', state.hist ? 'true' : 'false');
      $('tErode').setAttribute('aria-pressed', state.erode ? 'true' : 'false');
      $('tFlow').setAttribute('aria-pressed', state.flow ? 'true' : 'false');
      readSliders();
      restart(false);
      updateReadouts(); requestDraw();
    }
  });

  // 給自動測試與證明腳本用
  window.__rm = {
    state: state, K: K, get R() { return R; }, snapshot: snapshot,
    run: function (years) { const end = R.t + years; let g = 0; while (R.t < end - 1e-9 && g++ < 200000) { K.step(R); record(); noticeCuts(); } afterChange(true, 'run'); },
    select: function (x, y) { state.ox = null; state.sel = [x, y]; afterChange(true, 'select'); },
    cut: function (x, y) { cutAt([x, y]); }, redraw: requestDraw
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readSliders();
  R.W = state.W; R.k = state.k;
  if (state.W !== 80 || state.k !== 8) { restart(false); }
  fit();
  updateReadouts();
  function themeChanged() {
    readColors(); bgKey = ''; layerKey = '';
    updateReadouts();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  let rsTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(rsTimer); rsTimer = setTimeout(function () { fit(); requestDraw(); }, 60); });
  if (window.ResizeObserver) new ResizeObserver(function () { fit(); requestDraw(); }).observe(cv);
  setStatus(T('按「播放」讓時間開始走；水由左往右流。', 'Press Play to start the clock; water flows from left to right.'));
  requestDraw();
})();
