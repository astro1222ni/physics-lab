/* electric-field.js — 「電場與等位線」模組的畫面與互動（物理計算在 field-core.js） */
(function () {
  'use strict';
  const FC = window.FieldCore;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };

  // ---------- 世界座標（cm，y 向上） ----------
  const W = 12, H = 8;
  const VIEW = { x0: 0, x1: W, y0: 0, y1: H };
  const LINE_BOUNDS = { x0: -8, x1: W + 8, y0: -8, y1: H + 8 };
  const GRID_N = { x: 240, y: 160 }; // 等位線／色階的格點數
  const LEVELS = [100, 200, 400, 800, 1600, 3200, 6400, 12800];

  const state = {
    charges: [
      { x: 4, y: 4, q: 3, label: 'A' },
      { x: 8, y: 4, q: -3, label: 'B' }
    ],
    show: { lines: true, equi: true, heat: true, grid: true },
    probe: { x: 6, y: 6, vx: 0, vy: 0, q: 1, m: 1, home: { x: 6, y: 6 }, trail: [] },
    running: false,
    ended: false,
    released: false,   // 從起點釋放後為 true（區分「釋放」與「繼續」）
    status: ''
  };

  // ---------- 畫布 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let scale = 1, dpr = 1;
  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = GRID_N.x + 1;
  heatCanvas.height = GRID_N.y + 1;
  const heatCtx = heatCanvas.getContext('2d');

  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--pos', '--neg', '--field', '--equi', '--grid', '--probe', '--text', '--muted', '--surface']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function hexRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function toPx(x, y) { return [x * scale, (H - y) * scale]; }
  function toWorld(px, py) { return [px / scale, H - py / scale]; }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * H / W * dpr);
    scale = w / W;
    draw();
  }

  // ---------- 由場源電荷算出的快取：格點電位、電力線 ----------
  let cache = null;
  function compute() {
    const nx = GRID_N.x, ny = GRID_N.y, dx = W / nx, dy = H / ny;
    const grid = new Float64Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        let v = FC.potentialAt(state.charges, i * dx, j * dy);
        if (!isFinite(v)) v = v > 0 ? 1e7 : -1e7;
        grid[j * (nx + 1) + i] = v;
      }
    }
    // 電位色階：tanh 壓縮，讓近處與遠處都看得出差異
    const img = heatCtx.createImageData(nx + 1, ny + 1);
    const bg = hexRgb(colors['canvas-bg']), pc = hexRgb(colors.pos), nc = hexRgb(colors.neg);
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const v = grid[j * (nx + 1) + i];
        const t = Math.tanh(v / 2500) * 0.42;
        const c = t >= 0 ? pc : nc, a = Math.abs(t);
        const o = ((ny - j) * (nx + 1) + i) * 4; // 影像的列由上往下
        img.data[o] = bg[0] + (c[0] - bg[0]) * a;
        img.data[o + 1] = bg[1] + (c[1] - bg[1]) * a;
        img.data[o + 2] = bg[2] + (c[2] - bg[2]) * a;
        img.data[o + 3] = 255;
      }
    }
    heatCtx.putImageData(img, 0, 0);

    const contours = [];
    LEVELS.forEach(function (L) {
      [L, -L].forEach(function (lv) {
        const segs = FC.contourSegments(grid, nx, ny, 0, 0, dx, dy, lv);
        if (segs.length) contours.push(segs);
      });
    });
    const hasPos = state.charges.some(function (c) { return c.q > 0; });
    const hasNeg = state.charges.some(function (c) { return c.q < 0; });
    if (hasPos && hasNeg) contours.push(FC.contourSegments(grid, nx, ny, 0, 0, dx, dy, 0));

    const lines = FC.fieldLines(state.charges, { bounds: LINE_BOUNDS, step: 0.04, maxSteps: 2500 });
    cache = { contours: contours, lines: lines };
  }
  function invalidate() { cache = null; requestDraw(); }

  // ---------- 繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function arrowHead(x, y, ux, uy, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + ux * size, y + uy * size);
    ctx.lineTo(x - ux * size * 0.6 - uy * size * 0.55, y - uy * size * 0.6 + ux * size * 0.55);
    ctx.lineTo(x - ux * size * 0.6 + uy * size * 0.55, y - uy * size * 0.6 - ux * size * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    if (!cache) compute();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wpx = W * scale, hpx = H * scale;
    ctx.fillStyle = colors['canvas-bg'];
    ctx.fillRect(0, 0, wpx, hpx);

    if (state.show.heat) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(heatCanvas, 0, 0, wpx, hpx);
    }

    if (state.show.grid) {
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < W; x++) { ctx.moveTo(x * scale, 0); ctx.lineTo(x * scale, hpx); }
      for (let y = 1; y < H; y++) { ctx.moveTo(0, y * scale); ctx.lineTo(wpx, y * scale); }
      ctx.stroke();
    }

    if (state.show.equi) {
      ctx.strokeStyle = colors.equi;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      cache.contours.forEach(function (segs) {
        segs.forEach(function (s) {
          const a = toPx(s[0], s[1]), b = toPx(s[2], s[3]);
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        });
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (state.show.lines) {
      ctx.strokeStyle = colors.field;
      ctx.lineWidth = 1.3;
      const arrowEvery = 2.2; // cm
      cache.lines.forEach(function (line) {
        const p = line.points;
        ctx.beginPath();
        let a = toPx(p[0][0], p[0][1]);
        ctx.moveTo(a[0], a[1]);
        for (let i = 1; i < p.length; i++) { a = toPx(p[i][0], p[i][1]); ctx.lineTo(a[0], a[1]); }
        ctx.stroke();
        // 箭頭：標示真正的電場方向（從負電荷描出的線要反向）
        let acc = arrowEvery * 0.55;
        for (let i = 1; i < p.length - 1; i++) {
          const sx = p[i][0] - p[i - 1][0], sy = p[i][1] - p[i - 1][1];
          acc += Math.hypot(sx, sy);
          if (acc < arrowEvery) continue;
          acc = 0;
          if (p[i][0] < 0.2 || p[i][0] > W - 0.2 || p[i][1] < 0.2 || p[i][1] > H - 0.2) continue;
          const len = Math.hypot(sx, sy) || 1;
          const q = toPx(p[i][0], p[i][1]);
          arrowHead(q[0], q[1], line.dir * sx / len, -line.dir * sy / len, 5, colors.field);
        }
      });
    }

    // 試探電荷軌跡
    const pr = state.probe;
    if (pr.trail.length > 1) {
      ctx.strokeStyle = colors.probe;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      pr.trail.forEach(function (t, i) { const q = toPx(t[0], t[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 場源電荷
    state.charges.forEach(function (c) {
      const p = toPx(c.x, c.y), r = 13;
      const col = c.q > 0 ? colors.pos : c.q < 0 ? colors.neg : colors.muted;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      if (c.q !== 0) { ctx.fillStyle = col; ctx.fill(); }
      ctx.lineWidth = 2;
      ctx.strokeStyle = c.q !== 0 ? colors.surface : col;
      ctx.stroke();
      ctx.fillStyle = c.q !== 0 ? '#fff' : col;
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.q > 0 ? '+' : c.q < 0 ? '−' : '0', p[0], p[1] + 1);
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = colors['canvas-bg'];
      ctx.strokeText(c.label + '  ' + fmtQ(c.q), p[0], p[1] - r - 11);
      ctx.fillStyle = colors.text;
      ctx.fillText(c.label + '  ' + fmtQ(c.q), p[0], p[1] - r - 11);
    });

    // 試探電荷與受力方向
    const pp = toPx(pr.x, pr.y);
    const e = FC.fieldAt(state.charges, pr.x, pr.y);
    const fx = pr.q * e.ex, fy = pr.q * e.ey, fm = Math.hypot(fx, fy);
    if (fm > 0 && isFinite(fm)) {
      const L = 44, ux = fx / fm, uy = -fy / fm;
      ctx.strokeStyle = colors.probe;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pp[0], pp[1]);
      ctx.lineTo(pp[0] + ux * L, pp[1] + uy * L);
      ctx.stroke();
      arrowHead(pp[0] + ux * L, pp[1] + uy * L, ux, uy, 8, colors.probe);
    }
    ctx.beginPath();
    ctx.arc(pp[0], pp[1], 7, 0, Math.PI * 2);
    ctx.fillStyle = colors.probe;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.surface;
    ctx.stroke();

    // 比例尺
    ctx.strokeStyle = colors.text;
    ctx.fillStyle = colors.text;
    ctx.lineWidth = 2;
    const sx0 = 14, sy0 = hpx - 14;
    ctx.beginPath();
    ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 + scale, sy0);
    ctx.moveTo(sx0, sy0 - 4); ctx.lineTo(sx0, sy0 + 4);
    ctx.moveTo(sx0 + scale, sy0 - 4); ctx.lineTo(sx0 + scale, sy0 + 4);
    ctx.stroke();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(T('1 cm', '1 cm'), sx0 + scale + 6, sy0 + 6);

    updateReadout(e);
  }

  // ---------- 數字格式 ----------
  // 科學記號用 HTML <sup> 排版，不依賴特殊上標字元（部分裝置字型缺字）
  function sci(v, unit) {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a === 0) return '0 ' + unit;
    if (a >= 0.01 && a < 1e4) return Number(v.toPrecision(3)).toLocaleString('en-US').replace('-', '−') + ' ' + unit;
    const ex = Math.floor(Math.log10(a));
    const m = v / Math.pow(10, ex);
    return m.toFixed(2).replace('-', '−') + ' × 10<sup>' + String(ex).replace('-', '−') + '</sup> ' + unit;
  }
  // 能量固定以 μJ、小數三位顯示，總能量守恆時數字才會「看得出」不變
  function fmtJ(j) {
    if (!isFinite(j)) return '—';
    const u = j * 1e6;
    return (Math.abs(u) < 0.0005 ? '0.000' : u.toFixed(3)).replace('-', '−') + ' μJ';
  }
  function fmtQ(q) { return (q > 0 ? '+' : q < 0 ? '−' : '') + Math.abs(q).toFixed(1) + ' nC'; }

  function updateReadout(e) {
    const pr = state.probe;
    const em = Math.hypot(e.ex, e.ey);
    $('rE').innerHTML = sci(em, 'N/C');
    if (em > 0 && isFinite(em)) {
      let deg = Math.atan2(e.ey, e.ex) * 180 / Math.PI;
      if (deg < 0) deg += 360;
      $('rDir').textContent = deg.toFixed(1) + T('°（由 +x 逆時針）', '° (CCW from +x)');
    } else {
      $('rDir').textContent = '—';
    }
    $('rV').innerHTML = sci(FC.potentialAt(state.charges, pr.x, pr.y), 'V');
    $('rF').innerHTML = sci(Math.abs(pr.q) * FC.NC * em, 'N');
    const en = FC.energy(state.charges, pr);
    $('rv').innerHTML = sci(Math.hypot(pr.vx, pr.vy) * 100, 'cm/s');
    $('rK').textContent = fmtJ(en.K);
    $('rU').textContent = fmtJ(en.U);
    $('rT').textContent = fmtJ(en.total);
    $('status').textContent = state.status;
  }

  // ---------- 音效（sound.js；音效關閉或沒有載入時完全不呼叫） ----------
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  /** 釋放：柔和的兩聲上行提示音 */
  function releaseSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 587, dur: 0.12, type: 'sine', gain: 0.4 });
    S.tone({ freq: 880, dur: 0.16, type: 'sine', gain: 0.32, delay: 0.07 });
  }
  /**
   * 撞上場源電荷：短促的「滋」電擊聲（高頻噪音 + 下滑的方波 + 鋸齒波嗡聲）。
   * 音量隨撞擊速率增加（cm/s 取對數壓縮），撞得越快越亮。
   */
  function zapSound(v) {
    const S = sound(); if (!S) return;
    const hard = clamp01(Math.log10(1 + v * 100) / Math.log10(1 + 100));
    const gain = 0.45 + 0.5 * hard;
    S.noise({ dur: 0.07 + 0.07 * hard, gain: gain, filter: 2600 + 2200 * hard, q: 1.6 });
    S.sweep({ from: 1300 + 700 * hard, to: 420, dur: 0.1, type: 'square', gain: gain * 0.45 });
    S.tone({ freq: 330 + 110 * hard, dur: 0.09 + 0.05 * hard, type: 'sawtooth', gain: gain * 0.4 });
  }
  /** 離開畫面：柔和的下滑音 */
  function exitSound() {
    const S = sound(); if (!S) return;
    S.sweep({ from: 760, to: 300, dur: 0.4, type: 'triangle', gain: 0.45 });
  }

  // ---------- 動畫 ----------
  let lastT = 0;
  function tick(t) {
    if (!state.running) return;
    const dt = Math.min((t - lastT) / 1000, 1 / 30);
    lastT = t;
    const pr = state.probe;
    const stop = FC.advance(state.charges, pr, dt, { bounds: VIEW, stopRadius: 0.3 });
    pr.trail.push([pr.x, pr.y]);
    if (pr.trail.length > 4000) pr.trail.shift();
    if (stop) {
      state.running = false;
      state.ended = true;
      if (stop.reason === 'hit') zapSound(Math.hypot(pr.vx, pr.vy)); else exitSound();
      $('run').textContent = T('釋放', 'Release');
      state.status = stop.reason === 'hit'
        ? T('試探電荷撞上了電荷 ' + state.charges[stop.charge].label + '。',
          'The test charge hit charge ' + state.charges[stop.charge].label + '.')
        : T('試探電荷離開了畫面。', 'The test charge left the screen.');
    }
    draw();
    if (state.running) requestAnimationFrame(tick);
  }
  function setRunning(on) {
    state.running = on;
    $('run').textContent = on ? T('暫停', 'Pause') : T('繼續', 'Resume');
    if (on) {
      state.status = T('運動中…（總能量應保持不變）', 'Moving… (the total energy should stay constant)');
      lastT = performance.now();
      requestAnimationFrame(tick);
    }
  }
  function resetProbe(x, y) {
    const pr = state.probe;
    if (x !== undefined) { pr.home = { x: x, y: y }; }
    pr.x = pr.home.x; pr.y = pr.home.y; pr.vx = 0; pr.vy = 0; pr.trail = [[pr.x, pr.y]];
    state.running = false;
    state.ended = false;
    state.released = false;
    $('run').textContent = T('釋放', 'Release');
    state.status = '';
    requestDraw();
  }

  // ---------- 控制項 ----------
  function bindSlider(id, fmt, onInput) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.textContent = fmt(+el.value); };
    el.addEventListener('input', function () { update(); onInput(+el.value); });
    update();
    return { el: el, set: function (v) { el.value = v; update(); } };
  }
  const sA = bindSlider('qA', fmtQ, function (v) { state.charges[0].q = v; invalidate(); });
  const sB = bindSlider('qB', fmtQ, function (v) { state.charges[1].q = v; invalidate(); });
  const sSep = bindSlider('sep', function (v) { return v.toFixed(1) + ' cm'; }, function (v) { placeSymmetric(v); invalidate(); });
  bindSlider('qp', fmtQ, function (v) { state.probe.q = v; requestDraw(); });
  bindSlider('mp', function (v) { return v.toFixed(1) + ' g'; }, function (v) { state.probe.m = v; requestDraw(); });

  function placeSymmetric(d) {
    state.charges[0].x = W / 2 - d / 2; state.charges[0].y = H / 2;
    state.charges[1].x = W / 2 + d / 2; state.charges[1].y = H / 2;
  }
  function syncSeparation() {
    const c = state.charges;
    const d = Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y);
    sSep.el.value = Math.min(9, Math.max(1, d));
    $('sepo').textContent = d.toFixed(1) + ' cm';
  }

  const PRESETS = {
    dipole: { a: 3, b: -3, d: 4 },
    like: { a: 3, b: 3, d: 4 },
    unequal: { a: 4, b: -2, d: 4 },
    single: { a: 3, b: 0, d: 0 }
  };
  document.querySelectorAll('[data-preset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const p = PRESETS[btn.dataset.preset];
      state.charges[0].q = p.a; state.charges[1].q = p.b;
      sA.set(p.a); sB.set(p.b);
      if (p.d) { placeSymmetric(p.d); sSep.set(p.d); }
      else { state.charges[0].x = W / 2; state.charges[0].y = H / 2; state.charges[1].x = W - 1.5; state.charges[1].y = 1.5; syncSeparation(); }
      resetProbe(W / 2 + (p.d ? 0 : 2), p.d ? H / 2 + 2 : H / 2);
      invalidate();
    });
  });

  [['showLines', 'lines'], ['showEqui', 'equi'], ['showHeat', 'heat'], ['showGrid', 'grid']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
  });

  $('run').addEventListener('click', function () {
    if (state.running) {
      state.running = false;
      $('run').textContent = T('繼續', 'Resume');
      state.status = T('已暫停', 'Paused');
      requestDraw();
      return;
    }
    if (state.ended) resetProbe(); // 上一次已撞上電荷或離開畫面：從起點重新釋放
    if (!state.released) { state.released = true; releaseSound(); } // 只在從起點釋放時發聲，暫停後繼續不再發聲
    setRunning(true);
  });
  $('resetProbe').addEventListener('click', function () { resetProbe(); });
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

  // ---------- 拖曳 ----------
  let drag = null;
  function eventWorld(ev) {
    const r = cv.getBoundingClientRect();
    const w = toWorld(ev.clientX - r.left, ev.clientY - r.top);
    return [Math.min(W, Math.max(0, w[0])), Math.min(H, Math.max(0, w[1]))];
  }
  cv.addEventListener('pointerdown', function (ev) {
    const w = eventWorld(ev);
    const hitR = 22 / scale;
    let best = -1, bd = Infinity;
    state.charges.forEach(function (c, i) {
      const d = Math.hypot(c.x - w[0], c.y - w[1]);
      if (d < hitR && d < bd) { bd = d; best = i; }
    });
    if (best >= 0) {
      drag = { type: 'charge', i: best };
    } else {
      drag = { type: 'probe' };
      resetProbe(w[0], w[1]);
    }
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    const w = eventWorld(ev);
    if (drag.type === 'charge') {
      state.charges[drag.i].x = w[0];
      state.charges[drag.i].y = w[1];
      syncSeparation();
      invalidate();
    } else {
      resetProbe(w[0], w[1]);
    }
  });
  const endDrag = function () { drag = null; };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 啟動 ----------
  readColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); invalidate(); });
  // 齒輪設定切換深淺色時也重畫（settings.js）
  window.addEventListener('lab:themechange', function () { readColors(); invalidate(); });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  else window.addEventListener('resize', resize);
  resize();
})();
