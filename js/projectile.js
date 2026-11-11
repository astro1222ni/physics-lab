/* projectile.js — 「拋體運動」模組的畫面與互動（物理計算在 projectile-core.js） */
(function () {
  'use strict';
  const PC = window.ProjectileCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };

  const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 8];
  const MAX_GHOSTS = 5;
  const GHOST_COLORS = ['neg', 'equi', 'pos', 'field', 'probe'];
  const MARGIN = { l: 44, r: 12, t: 12, b: 30 }; // 畫布邊距（CSS px），留給刻度數字

  const state = {
    v0: 20, theta: 45, h0: 0, g: 9.8, k: 0.01, drag: false,
    speed: 1,
    show: { pred: true, v: true, comp: true, dots: true },
    fly: null,         // { s, trail, running, launched, landed }
    ghosts: [],        // 已落地的軌跡
    launches: 0,
    status: ''
  };

  /** 目前的物理參數（關閉阻力時 k = 0） */
  function params() {
    return { v0: state.v0, theta: state.theta, h0: state.h0, g: state.g, k: state.drag ? state.k : 0 };
  }

  // ---------- 由參數算出的快取：預測軌跡、理想拋物線、最佳仰角 ----------
  let cache = null;
  let optKey = '', optCache = null;
  function compute() {
    const p = params();
    const pred = PC.predict(p);
    const ideal = state.drag ? PC.predict(Object.assign({}, p, { k: 0 })) : pred;
    const key = [p.v0, p.h0, p.g, p.k].join(',');
    if (key !== optKey) { optKey = key; optCache = PC.optimalAngle(p); }
    // 速度箭頭的比例：以無阻力落地速率（整段飛行中最大的速率）為基準
    const vref = Math.max(1, Math.sqrt(p.v0 * p.v0 + 2 * p.g * p.h0));
    cache = { p: p, pred: pred, ideal: ideal, opt: optCache, vref: vref };
  }

  function newFlight() {
    const p = params();
    state.fly = { s: PC.initialState(p), trail: [], running: false, launched: false, landed: false };
    state.fly.trail.push([state.fly.s.x, state.fly.s.y, 0]);
  }

  // ---------- 畫布 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 200;
  let view = null, viewLocked = false;

  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--grid', '--accent', '--accent-soft',
      '--pos', '--neg', '--equi', '--field', '--probe', '--surface']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    cw = cv.clientWidth;
    ch = cv.clientHeight || Math.round(cw * 2 / 3);
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    view = null;
    viewLocked = false;
    draw();
  }

  /** 1、2、5 × 10^n 的「好看」刻度間距 */
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }

  /** 自動縮放：讓預測軌跡、理想拋物線、比較軌跡與目前軌跡都放得進畫面，x、y 等比例 */
  function computeView() {
    let xmax = 1, ymax = Math.max(1, state.h0);
    function scan(pts) {
      for (let i = 0; i < pts.length; i++) {
        if (pts[i][0] > xmax) xmax = pts[i][0];
        if (pts[i][1] > ymax) ymax = pts[i][1];
      }
    }
    scan(cache.pred.points);
    if (state.drag) scan(cache.ideal.points);
    state.ghosts.forEach(function (g) { scan(g.pts); });
    if (state.fly) scan(state.fly.trail);
    const plotW = cw - MARGIN.l - MARGIN.r, plotH = ch - MARGIN.t - MARGIN.b;
    const xlo = -0.05 * xmax;
    const scale = Math.min(plotW / (xmax * 1.1 - xlo), plotH / (ymax * 1.12));
    return {
      scale: scale,
      ox: MARGIN.l - xlo * scale,
      oy: ch - MARGIN.b,
      xlo: xlo,
      xhi: xlo + plotW / scale,
      yhi: plotH / scale,
      plotW: plotW,
      plotH: plotH
    };
  }

  function toPx(x, y) { return [view.ox + x * view.scale, view.oy - y * view.scale]; }

  // ---------- 繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function arrow(x0, y0, x1, y1, color, width, label, lx, ly) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 2) return;
    const ux = dx / L, uy = dy / L, hs = Math.min(9, L * 0.45);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * hs * 0.7, y1 - uy * hs * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * hs - uy * hs * 0.5, y1 - uy * hs + ux * hs * 0.5);
    ctx.lineTo(x1 - ux * hs + uy * hs * 0.5, y1 - uy * hs - ux * hs * 0.5);
    ctx.closePath();
    ctx.fill();
    if (label) {
      const px = lx === undefined ? x1 + ux * 11 : x1 + lx, py = ly === undefined ? y1 + uy * 11 : y1 + ly;
      haloText(label, px, py, color, 'center', 'middle', '600 12px system-ui, sans-serif');
    }
  }

  function haloText(text, x, y, color, align, base, font) {
    ctx.font = font || '12px system-ui, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = base || 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function polyline(pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const q = toPx(pts[i][0], pts[i][1]);
      if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    }
    ctx.stroke();
  }

  function fmtTick(v, step) {
    const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return num(v, d);
  }

  function drawAxes() {
    const step = niceStep(56 / view.scale);
    const top = MARGIN.t, right = cw - MARGIN.r;
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    for (let i = Math.ceil(view.xlo / step); i * step <= view.xhi + 1e-9; i++) {
      if (i === 0) continue;
      const px = view.ox + i * step * view.scale;
      ctx.moveTo(px, top); ctx.lineTo(px, view.oy);
    }
    for (let j = 1; j * step <= view.yhi + 1e-9; j++) {
      const py = view.oy - j * step * view.scale;
      ctx.moveTo(MARGIN.l, py); ctx.lineTo(right, py);
    }
    ctx.stroke();

    // y 軸（發射點正下方）與地面
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(view.ox, top); ctx.lineTo(view.ox, view.oy);
    ctx.stroke();
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN.l, view.oy); ctx.lineTo(right, view.oy);
    ctx.stroke();

    // 刻度數字
    ctx.fillStyle = colors.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = Math.ceil(view.xlo / step); i * step <= view.xhi + 1e-9; i++) {
      const px = view.ox + i * step * view.scale;
      if (px > right - 36) continue; // 留位置給軸名稱
      ctx.fillText(fmtTick(i * step, step), px, view.oy + 5);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let j = 0; j * step <= view.yhi + 1e-9; j++) {
      const py = view.oy - j * step * view.scale;
      if (py < top + 14) continue;
      ctx.fillText(fmtTick(j * step, step), MARGIN.l - 6, py);
    }
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('x (m)', right, view.oy + 5);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('y (m)', MARGIN.l - 6, top - 2);
  }

  function drawPlatform() {
    if (state.h0 <= 0) return;
    const a = toPx(0, state.h0), w = Math.min(16, Math.max(6, a[0] - MARGIN.l));
    ctx.fillStyle = colors.border;
    ctx.fillRect(a[0] - w, a[1], w, view.oy - a[1]);
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.strokeRect(a[0] - w + 0.5, a[1] + 0.5, w - 1, view.oy - a[1] - 1);
  }

  function drawAngle() {
    const a = toPx(0, state.h0), r = 30, th = state.theta * Math.PI / 180;
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + r + 12, a[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(a[0], a[1], r, -th, 0);
    ctx.stroke();
    const mid = th / 2;
    haloText(state.theta + '°', a[0] + (r + 14) * Math.cos(mid), a[1] - (r + 10) * Math.sin(mid) + 4, colors.muted, 'left', 'middle');
  }

  function drawGhosts() {
    const placed = [];
    state.ghosts.forEach(function (g) {
      const col = colors[GHOST_COLORS[g.color]];
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      polyline(g.pts);
      ctx.globalAlpha = 1;
      // 編號標在該軌跡的最高點（互補角射程相同但最高點不同，才不會疊在一起）；
      // 水平或向下發射時最高點就是發射點，改標在落地點
      let top = g.pts[0];
      g.pts.forEach(function (pt) { if (pt[1] > top[1]) top = pt; });
      const atLanding = top === g.pts[0];
      if (atLanding) top = g.pts[g.pts.length - 1];
      const q = toPx(top[0], top[1]);
      if (atLanding) q[1] -= 11;
      while (placed.some(function (o) { return Math.hypot(o[0] - q[0], o[1] - q[1]) < 17; })) q[0] += 18;
      placed.push(q);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(q[0], q[1], 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.surface;
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(g.n), q[0], q[1] + 0.5);
    });
  }

  function drawPrediction() {
    if (!state.show.pred) return;
    const pr = cache.pred;
    if (state.drag) {
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      polyline(cache.ideal.points);
    }
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.globalAlpha = 0.75;
    polyline(pr.points);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // 最高點與落地點
    if (pr.tApex > 0) {
      const xa = interpX(pr.points, pr.tApex);
      const q = toPx(xa, pr.H);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, Math.PI * 2); ctx.stroke();
      haloText('H = ' + num(pr.H, 2) + ' m', q[0], q[1] - 9, colors.accent, 'center', 'bottom');
    }
    if (pr.R > 0) {
      const q = toPx(pr.R, 0);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - 7); ctx.lineTo(q[0], q[1] + 4); ctx.stroke();
      const right = q[0] > cw - 90;
      haloText('R = ' + num(pr.R, 2) + ' m', q[0] + (right ? -6 : 6), q[1] - 6, colors.accent, right ? 'right' : 'left', 'bottom');
    }
  }

  function interpX(pts, t) {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][2] >= t) {
        const a = pts[i - 1], b = pts[i], f = b[2] > a[2] ? (t - a[2]) / (b[2] - a[2]) : 0;
        return a[0] + (b[0] - a[0]) * f;
      }
    }
    return pts[pts.length - 1][0];
  }

  function drawFlight() {
    const f = state.fly, s = f.s;
    if (f.trail.length > 1) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2.5;
      polyline(f.trail);
    }
    // 等時距標記：相鄰兩點相隔相同時間
    if (state.show.dots && f.trail.length > 1) {
      const Tf = cache.pred.T;
      const dt = Tf > 0 ? niceStep(Tf / 12) : 0;
      if (dt > 0) {
        ctx.fillStyle = colors.surface;
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.5;
        let m = 1;
        const tr = f.trail;
        for (let i = 1; i < tr.length; i++) {
          while (m * dt <= tr[i][2] + 1e-9) {
            const a = tr[i - 1], b = tr[i], u = b[2] > a[2] ? (m * dt - a[2]) / (b[2] - a[2]) : 1;
            const q = toPx(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
            ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            m++;
          }
        }
        haloText(T('標記間隔 ', 'Marker interval ') + num(dt, dt < 0.1 ? 2 : dt < 1 ? 1 : 0) + ' s', cw - MARGIN.r - 4, MARGIN.t + 24, colors.muted, 'right', 'top');
      }
    }

    // 速度向量與分量
    const q = toPx(s.x, s.y);
    const k = 0.2 * Math.min(view.plotW, view.plotH) / cache.vref; // px per (m/s)
    if (state.show.comp) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1;
      if (state.show.v) {
        ctx.beginPath();
        ctx.moveTo(q[0] + s.vx * k, q[1]); ctx.lineTo(q[0] + s.vx * k, q[1] - s.vy * k);
        ctx.moveTo(q[0], q[1] - s.vy * k); ctx.lineTo(q[0] + s.vx * k, q[1] - s.vy * k);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // 分量的標籤放在箭頭旁邊（vx 在下方、vy 在左方），避免和 v 的標籤重疊
      arrow(q[0], q[1], q[0] + s.vx * k, q[1], colors.neg, 2.5, 'vx', -8, 12);
      arrow(q[0], q[1], q[0], q[1] - s.vy * k, colors.equi, 2.5, 'vy', -14, s.vy > 0 ? 6 : -6);
    }
    if (state.show.v) arrow(q[0], q[1], q[0] + s.vx * k, q[1] - s.vy * k, colors.pos, 3, 'v');

    ctx.beginPath();
    ctx.arc(q[0], q[1], 7, 0, Math.PI * 2);
    ctx.fillStyle = colors.accent;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.surface;
    ctx.stroke();

    haloText('t = ' + num(s.t, 2) + ' s', cw - MARGIN.r - 4, MARGIN.t + 4, colors.text, 'right', 'top', '600 13px system-ui, sans-serif');
  }

  function draw() {
    if (!cache) compute();
    if (!state.fly) newFlight();
    if (!view || !viewLocked) view = computeView();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors['canvas-bg'];
    ctx.fillRect(0, 0, cw, ch);
    drawAxes();
    drawPlatform();
    drawGhosts();
    drawPrediction();
    drawAngle();
    drawFlight();
    updateReadout();
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }

  function updateReadout() {
    const s = state.fly.s, p = cache.p, pr = cache.pred;
    $('rt').textContent = num(s.t, 2) + ' s';
    $('rx').textContent = num(s.x, 2) + ' m';
    $('ry').textContent = num(s.y, 2) + ' m';
    $('rvx').textContent = num(s.vx, 2) + ' m/s';
    $('rvy').textContent = num(s.vy, 2) + ' m/s';
    $('rv').textContent = num(Math.hypot(s.vx, s.vy), 2) + ' m/s';
    $('rE').textContent = num(PC.energyPerMass(p, s), 1) + ' J/kg';

    $('method').textContent = state.drag ? T('數值解（RK4）', 'Numerical (RK4)') : T('解析解', 'Analytical');
    const id = cache.ideal;
    const extra = function (v, d, unit) { return state.drag ? '<br><small>' + T('無阻力時 ', 'No drag: ') + num(v, d) + ' ' + unit + '</small>' : ''; };
    $('pT').innerHTML = num(pr.T, 2) + ' s' + extra(id.T, 2, 's');
    $('pR').innerHTML = num(pr.R, 2) + ' m' + extra(id.R, 2, 'm');
    $('pH').innerHTML = num(pr.H, 2) + ' m' + extra(id.H, 2, 'm');
    $('pOpt').innerHTML = num(cache.opt.theta, 1) + '°<br><small>' + T('此時 R = ', 'giving R = ') + num(cache.opt.R, 2) + ' m</small>';
    $('rVt').textContent = state.drag ? num(PC.terminalSpeed(p), 1) + ' m/s' : '—';
    $('status').textContent = state.status;
  }

  function renderGhosts() {
    const ul = $('ghosts');
    if (!state.ghosts.length) {
      ul.innerHTML = '<li class="none"><span class="empty">' +
        T('尚無紀錄：按「發射」，落地後的軌跡會保留在這裡。', 'Nothing saved yet: press “Launch”, and each trajectory is kept here after it lands.') + '</span></li>';
      return;
    }
    const gap = T('　', '&emsp;');
    ul.innerHTML = state.ghosts.map(function (g) {
      return '<li><span class="sw" style="background:var(--' + GHOST_COLORS[g.color] + ')">' + g.n + '</span>' +
        '<span>' + g.desc + '<br><span class="meta">R ' + num(g.R, 2) + ' m' + gap + 'H ' + num(g.H, 2) + ' m' + gap + 'T ' + num(g.T, 2) + ' s</span></span></li>';
    }).join('');
  }

  // ---------- 動畫 ----------
  let lastT = 0, rafId = 0;
  function tick(now) {
    const f = state.fly;
    if (!f.running) return;
    const dt = Math.min((now - lastT) / 1000, 1 / 30) * state.speed;
    lastT = now;
    const landed = PC.advance(cache.p, f.s, dt, { trail: f.trail });
    if (landed) land();
    draw();
    if (f.running) rafId = requestAnimationFrame(tick);
  }

  function land() {
    const f = state.fly, s = f.s, p = cache.p;
    f.running = false;
    f.landed = true;
    $('run').textContent = T('再發射一次', 'Launch again');
    state.launches++;
    // 抽樣保留軌跡（最多約 600 點）
    const every = Math.max(1, Math.ceil(f.trail.length / 600));
    const pts = f.trail.filter(function (pt, i) { return i % every === 0; });
    pts.push(f.trail[f.trail.length - 1]);
    let H = 0;
    f.trail.forEach(function (pt) { if (pt[1] > H) H = pt[1]; });
    state.ghosts.push({
      n: state.launches,
      color: (state.launches - 1) % GHOST_COLORS.length,
      pts: pts,
      R: s.x, H: Math.max(H, cache.pred.H), T: s.t,
      desc: p.theta + '°' + T('，', ', ') + 'v<sub>0</sub> = ' + num(p.v0, 1) + ' m/s' + T('，', ', ') + 'g = ' + num(p.g, 2) +
        (p.k > 0 ? T('，有阻力 k/m = ', ', drag k/m = ') + fmtK(p.k) : T('，無阻力', ', no drag')) +
        (p.h0 > 0 ? T('，', ', ') + 'h<sub>0</sub> = ' + num(p.h0, 1) + ' m' : '')
    });
    if (state.ghosts.length > MAX_GHOSTS) state.ghosts.shift();
    renderGhosts();
    state.status = T('第 ' + state.launches + ' 次發射落地：t = ' + num(s.t, 2) + ' s，射程 ' + num(s.x, 2) + ' m。',
      'Flight ' + state.launches + ' landed: t = ' + num(s.t, 2) + ' s, range ' + num(s.x, 2) + ' m.');
  }

  function start() {
    const f = state.fly;
    f.running = true;
    f.launched = true;
    $('run').textContent = T('暫停', 'Pause');
    state.status = state.drag && state.g === PC.G_PRESETS.moon
      ? T('提醒：月球沒有大氣，這裡的阻力只是假想比較。', 'Note: the Moon has no atmosphere, so drag here is only a hypothetical comparison.')
      : T('飛行中…', 'In flight…');
    lastT = performance.now();
    cancelAnimationFrame(rafId); // 確保只有一個動畫迴圈
    rafId = requestAnimationFrame(tick);
  }

  function resetFlight(msg) {
    newFlight();
    $('run').textContent = T('發射', 'Launch');
    state.status = msg || '';
    requestDraw();
  }

  /** 任一參數改變：停止目前的飛行並重新預測 */
  function paramsChanged() {
    cache = null;
    resetFlight();
  }

  // ---------- 控制項 ----------
  function fmtK(k) { return Number(k.toPrecision(2)).toString() + ' m<sup>−1</sup>'; }

  function bindSlider(id, fmt, onInput) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.innerHTML = fmt(+el.value); };
    el.addEventListener('input', function () { update(); onInput(+el.value); });
    update();
    return { el: el, set: function (v) { el.value = v; update(); } };
  }

  bindSlider('v0', function (v) { return num(v, 1) + ' m/s'; }, function (v) { state.v0 = v; paramsChanged(); });
  const sTheta = bindSlider('theta', function (v) { return v + '°'; }, function (v) { state.theta = v; paramsChanged(); });
  bindSlider('h0', function (v) { return num(v, 1) + ' m'; }, function (v) { state.h0 = v; paramsChanged(); });
  const sG = bindSlider('g', function (v) { return num(v, 2) + ' m/s<sup>2</sup>'; }, function (v) { state.g = v; syncPresets(); paramsChanged(); });
  bindSlider('k', function (v) { return fmtK(Math.pow(10, v)); }, function (v) { state.k = Number(Math.pow(10, v).toPrecision(3)); if (state.drag) paramsChanged(); });
  bindSlider('speed', function (i) { return SPEEDS[i] + '×'; }, function (i) { state.speed = SPEEDS[i]; });
  state.k = Number(Math.pow(10, +$('k').value).toPrecision(3));

  const presetBtns = document.querySelectorAll('[data-g]');
  function syncPresets() {
    presetBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.g - state.g) < 1e-9)); });
  }
  presetBtns.forEach(function (b) {
    b.addEventListener('click', function () { state.g = +b.dataset.g; sG.set(state.g); syncPresets(); paramsChanged(); });
  });
  syncPresets();

  $('drag').addEventListener('change', function (ev) {
    state.drag = ev.target.checked;
    $('k').disabled = !state.drag;
    $('dragBox').classList.toggle('dim', !state.drag);
    $('legIdeal').style.display = state.drag ? '' : 'none';
    paramsChanged();
  });
  $('legIdeal').style.display = 'none';

  [['showPred', 'pred'], ['showV', 'v'], ['showComp', 'comp'], ['showDots', 'dots']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
  });

  $('run').addEventListener('click', function () {
    const f = state.fly;
    if (f.running) {
      f.running = false;
      $('run').textContent = T('繼續', 'Resume');
      state.status = T('已暫停', 'Paused');
      requestDraw();
      return;
    }
    if (f.landed) newFlight();
    start();
  });
  $('reset').addEventListener('click', function () { resetFlight(); });
  $('clearGhosts').addEventListener('click', function () {
    state.ghosts = [];
    renderGhosts();
    requestDraw();
  });

  // ---------- 在畫布上拖曳調整仰角 ----------
  let aiming = false;
  function aim(ev) {
    const r = cv.getBoundingClientRect();
    const a = toPx(0, state.h0);
    const dx = ev.clientX - r.left - a[0], dy = a[1] - (ev.clientY - r.top);
    if (Math.hypot(dx, dy) < 8) return;
    let deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
    if (deg < 0) deg = dx >= 0 ? 0 : 90;
    deg = Math.min(90, Math.max(0, deg));
    if (deg === state.theta) return;
    state.theta = deg;
    sTheta.set(deg);
    paramsChanged();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!view) return;
    aiming = true;
    viewLocked = true; // 拖曳時固定縮放，避免畫面跟著跳動
    cv.setPointerCapture(ev.pointerId);
    aim(ev);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) { if (aiming) aim(ev); });
  const endAim = function () {
    if (!aiming) return;
    aiming = false;
    viewLocked = false;
    requestDraw();
  };
  cv.addEventListener('pointerup', endAim);
  cv.addEventListener('pointercancel', endAim);

  // ---------- 啟動 ----------
  readColors();
  renderGhosts();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); requestDraw(); });
  // 齒輪設定切換深淺色時也重畫（settings.js）
  window.addEventListener('lab:themechange', function () { readColors(); requestDraw(); });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  else window.addEventListener('resize', resize);
  resize();
})();
