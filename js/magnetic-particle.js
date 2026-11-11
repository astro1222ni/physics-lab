/* magnetic-particle.js — 「帶電粒子在磁場中運動」模組的畫面與互動（物理計算在 magnetic-particle-core.js） */
(function () {
  'use strict';
  const MC = window.MagneticParticleCore;
  const $ = function (id) { return document.getElementById(id); };

  // ---------- 世界座標（cm，y 向上）；物理核心用 SI（m） ----------
  const W = 24, H = 16;
  const CM = 0.01;
  const MARGIN = 0.6; // 粒子超出畫面這麼多 cm 就停止
  const BOUNDS = { x0: -MARGIN * CM, x1: (W + MARGIN) * CM, y0: -MARGIN * CM, y1: (H + MARGIN) * CM };
  const SPEEDS = [0.1, 0.2, 0.5, 1, 2]; // 動畫中 1 秒對應的真實時間（μs）
  const F_REF = 2 * MC.E_CHARGE * 3e5 * 0.1; // 力向量長 50 px 時的大小（N）
  const TRAIL_MAX = 30000;

  // 滑桿的「教學單位」：B (mT)、q (e)、m (u)、v (10^5 m/s)、ang (°)、E (kV/m)
  const par = { B: 100, q: 2, m: 4, v: 3, ang: 0, E: 0, region: false, speed: 2 };
  const state = {
    start: { x: 12, y: 14.2 },
    p: null,
    trail: [],
    show: { trail: true, vec: true, orbit: true },
    running: false,
    ended: false,
    status: ''
  };

  /** 由滑桿設定組成物理核心用的場（SI） */
  function fieldCfg() {
    const th = par.ang * Math.PI / 180;
    const E = par.E * 1e3; // V/m；正值指向發射方向逆時針轉 90°：(−sinθ, cosθ)
    return {
      Bz: par.B * 1e-3,
      Ex: -E * Math.sin(th),
      Ey: E * Math.cos(th),
      region: par.region ? { xMin: (W / 2) * CM } : null
    };
  }
  function launchVelocity() {
    const th = par.ang * Math.PI / 180, v = par.v * 1e5;
    return [v * Math.cos(th), v * Math.sin(th)];
  }

  function resetParticle() {
    const v = launchVelocity();
    state.p = {
      x: state.start.x * CM, y: state.start.y * CM, vx: v[0], vy: v[1],
      q: par.q * MC.E_CHARGE, m: par.m * MC.AMU, t: 0, turn: 0, tField: 0
    };
    state.trail = [[state.p.x, state.p.y]];
    state.ended = false;
    state.status = '';
    if (!state.running) $('run').textContent = '發射';
    requestDraw();
  }

  /** 讓（純磁場的）圓軌道圓心落在 (cx, cy) cm 的出發點 */
  function startForCenter(cx, cy) {
    const v = launchVelocity();
    const q = par.q * MC.E_CHARGE, m = par.m * MC.AMU, B = par.B * 1e-3;
    const k = m / (q * B) / CM; // cm·s/m
    // 圓心 = r + k (vy, −vx) → 出發點 = 圓心 − k (vy, −vx)
    return { x: cx - k * v[1], y: cy + k * v[0] };
  }

  // ---------- 畫布 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let scale = 1, dpr = 1;
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--pos', '--neg', '--field', '--equi', '--grid', '--probe', '--text', '--muted', '--surface', '--accent', '--accent-soft']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function toPx(x, y) { return [x * scale, (H - y) * scale]; }        // cm → px
  function siPx(x, y) { return [x / CM * scale, (H - y / CM) * scale]; } // m → px
  function toWorld(px, py) { return [px / scale, H - py / scale]; }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    if (!w) return;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * H / W * dpr);
    scale = w / W;
    draw();
  }

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
  /** 從 (x, y) px 畫一支向量（dx, dy 為 px，y 向下） */
  function vector(x, y, dx, dy, color, label, dashed) {
    const L = Math.hypot(dx, dy);
    if (L < 1) return;
    const ux = dx / L, uy = dy / L, head = Math.min(9, 3 + L * 0.25);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + ux * (L - head * 0.6), y + uy * (L - head * 0.6));
    ctx.stroke();
    ctx.setLineDash([]);
    arrowHead(x + ux * (L - head), y + uy * (L - head), ux, uy, head, color);
    if (label) {
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lx = x + ux * (L + 10), ly = y + uy * (L + 10);
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = colors['canvas-bg'];
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = color;
      ctx.fillText(label, lx, ly);
    }
  }

  function fieldRect() {
    // 有場的區域（px）
    const x0 = par.region ? W / 2 : 0;
    return [x0 * scale, 0, (W - x0) * scale, H * scale];
  }

  // 磁場符號：射出紙面 = 圓圈中一點，射入紙面 = 叉叉（用畫的，不用字型）
  function drawBSymbols() {
    if (par.B === 0) return;
    const s = Math.max(3.5, Math.min(7, scale * 0.24));
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = colors.muted;
    ctx.fillStyle = colors.muted;
    ctx.lineWidth = Math.max(1.2, s * 0.24);
    for (let i = 0; i < W / 2; i++) {
      const x = 1 + 2 * i;
      if (par.region && x < W / 2) continue;
      for (let j = 0; j < H / 2; j++) {
        const q = toPx(x, 1 + 2 * j);
        if (par.B > 0) {
          ctx.beginPath(); ctx.arc(q[0], q[1], s, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(q[0], q[1], s * 0.32, 0, Math.PI * 2); ctx.fill();
        } else {
          const d = s * 0.78;
          ctx.beginPath();
          ctx.moveTo(q[0] - d, q[1] - d); ctx.lineTo(q[0] + d, q[1] + d);
          ctx.moveTo(q[0] + d, q[1] - d); ctx.lineTo(q[0] - d, q[1] + d);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // 電場：平行等距的電力線（方向與發射方向垂直）
  function drawEField() {
    if (par.E === 0) return;
    const th = par.ang * Math.PI / 180, sg = Math.sign(par.E);
    const ex = -Math.sin(th) * sg, ey = Math.cos(th) * sg; // E 的單位向量（世界座標）
    const tx = Math.cos(th), ty = Math.sin(th);             // 與電力線垂直的方向
    const r = fieldRect();
    ctx.save();
    ctx.beginPath(); ctx.rect(r[0], r[1], r[2], r[3]); ctx.clip();
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = colors.field;
    ctx.lineWidth = 1.2;
    // 電力線錯開磁場符號與方格線（中心偏移半個間距）
    const gap = 3, cx = (par.region ? W * 3 / 4 : W / 2) + 1.5 * tx, cy = H / 2 + 1.5 * ty, R = Math.hypot(W, H);
    for (let k = -8; k <= 8; k++) {
      const ox = cx + k * gap * tx, oy = cy + k * gap * ty;
      const a = toPx(ox - ex * R, oy - ey * R), b = toPx(ox + ex * R, oy + ey * R);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      for (let d = -R; d <= R; d += 4) {
        const q = toPx(ox + ex * (d + 2), oy + ey * (d + 2));
        arrowHead(q[0], q[1], ex, -ey, 6.5, colors.field);
      }
    }
    ctx.restore();
  }

  function draw() {
    if (!state.p) return;
    const f = fieldCfg();
    const p = state.p;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wpx = W * scale, hpx = H * scale;
    ctx.fillStyle = colors['canvas-bg'];
    ctx.fillRect(0, 0, wpx, hpx);

    // 場區底色與邊界
    if (par.region) {
      ctx.fillStyle = colors['accent-soft'];
      ctx.fillRect(wpx / 2, 0, wpx / 2, hpx);
    }

    // 1 cm 方格
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < W; x++) { ctx.moveTo(x * scale, 0); ctx.lineTo(x * scale, hpx); }
    for (let y = 1; y < H; y++) { ctx.moveTo(0, y * scale); ctx.lineTo(wpx, y * scale); }
    ctx.stroke();

    if (par.region) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(wpx / 2, 0); ctx.lineTo(wpx / 2, hpx); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillStyle = colors.accent;
      ctx.textAlign = 'left';
      ctx.fillText('場區', wpx / 2 + 6, 6);
      ctx.textAlign = 'right';
      ctx.fillStyle = colors.muted;
      ctx.fillText('無場區', wpx / 2 - 6, 6);
    }

    drawEField();
    drawBSymbols();

    // 圓軌道（有電場時為導引中心的迴旋圓）與圓心
    const c = MC.center(p, f);
    if (state.show.orbit && c && c.r > 0) {
      const o = siPx(c.x, c.y), rp = c.r / CM * scale;
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.3;
      if (rp < 20000) {
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(o[0], o[1], rp, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (o[0] > -10 && o[0] < wpx + 10 && o[1] > -10 && o[1] < hpx + 10) {
        ctx.strokeStyle = colors.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(o[0] - 6, o[1]); ctx.lineTo(o[0] + 6, o[1]);
        ctx.moveTo(o[0], o[1] - 6); ctx.lineTo(o[0], o[1] + 6);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        const pp = siPx(p.x, p.y);
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(pp[0], pp[1]); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 出發點
    const sp = toPx(state.start.x, state.start.y);
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sp[0], sp[1], 5, 0, Math.PI * 2); ctx.stroke();

    const pc = par.q > 0 ? colors.pos : par.q < 0 ? colors.neg : colors.muted;

    // 軌跡
    if (state.show.trail && state.trail.length > 1) {
      ctx.strokeStyle = pc;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      state.trail.forEach(function (t, i) { const q = siPx(t[0], t[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 速度與力的向量
    const pp = siPx(p.x, p.y);
    const F = MC.forces(p, f);
    if (state.show.vec) {
      const v = Math.hypot(p.vx, p.vy);
      if (v > 0) { const L = 14 + 56 * v / 5e5; vector(pp[0], pp[1], p.vx / v * L, -p.vy / v * L, colors.probe, 'v'); }
      const fl = function (fx, fy) {
        const m = Math.hypot(fx, fy);
        const L = Math.min(110, 50 * m / F_REF);
        return m > 0 ? [fx / m * L, -fy / m * L] : [0, 0];
      };
      const fe = fl(F.ex, F.ey), fb = fl(F.bx, F.by);
      vector(pp[0], pp[1], fe[0], fe[1], colors.field, 'qE', true);
      vector(pp[0], pp[1], fb[0], fb[1], colors.equi, 'F');
    }

    // 粒子
    ctx.beginPath();
    ctx.arc(pp[0], pp[1], 8, 0, Math.PI * 2);
    ctx.fillStyle = pc;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.surface;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(par.q > 0 ? '+' : par.q < 0 ? '−' : '0', pp[0], pp[1] + 1);

    // 比例尺
    ctx.strokeStyle = colors.text;
    ctx.fillStyle = colors.text;
    ctx.lineWidth = 2;
    const sx0 = 12, sy0 = hpx - 12, L2 = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 + L2, sy0);
    ctx.moveTo(sx0, sy0 - 4); ctx.lineTo(sx0, sy0 + 4);
    ctx.moveTo(sx0 + L2, sy0 - 4); ctx.lineTo(sx0 + L2, sy0 + 4);
    ctx.stroke();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.strokeText('2 cm', sx0 + L2 + 6, sy0 + 6);
    ctx.fillText('2 cm', sx0 + L2 + 6, sy0 + 6);

    updateReadout(f, F);
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
  function signed(v, digits) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(digits); }
  function fmtLen(m) {
    const cm = m / CM;
    return cm < 1000 ? cm.toFixed(2) + ' cm' : sci(m, 'm');
  }
  function fmtTime(s) {
    const us = s * 1e6;
    if (us < 1000) return us.toPrecision(3) + ' μs';
    return sci(s, 's');
  }
  function fmtEV(j) {
    const ev = j / MC.E_CHARGE;
    const d = ev < 100 ? 2 : 1;
    return ev.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' eV';
  }

  function showRows(cls, on) {
    document.querySelectorAll('.' + cls).forEach(function (el) { el.classList.toggle('hide', !on); });
  }

  function updateReadout(f, F) {
    const p = state.p;
    const q = par.q * MC.E_CHARGE, m = par.m * MC.AMU, B = par.B * 1e-3, v0 = par.v * 1e5;
    if (par.q === 0 || par.B === 0) {
      $('rR').textContent = par.q === 0 ? '∞（q = 0 不受磁力）' : '∞（B = 0）';
      $('rT').textContent = '—';
    } else {
      $('rR').innerHTML = v0 === 0 ? '0 cm' : fmtLen(MC.radius(m, q, v0, B));
      $('rT').innerHTML = fmtTime(MC.period(m, q, B));
    }
    $('rF').innerHTML = sci(Math.hypot(F.bx, F.by), 'N');
    showRows('eRow', par.E !== 0);
    if (par.E !== 0) {
      $('rFe').innerHTML = sci(Math.hypot(F.ex, F.ey), 'N');
      $('rVd').innerHTML = par.B === 0 ? '—（B = 0）' : sci(Math.abs(par.E * 1e3 / B), 'm/s');
    }
    $('rv').innerHTML = sci(Math.hypot(p.vx, p.vy), 'm/s');
    $('rK').textContent = fmtEV(MC.kinetic(p));
    $('rt').textContent = (p.t * 1e6).toFixed(3) + ' μs';
    const turns = p.turn / (2 * Math.PI);
    $('rTurn').textContent = Math.abs(turns) < 0.0005 ? '0 圈' : (turns < 0 ? '順時針 ' : '逆時針 ') + Math.abs(turns).toFixed(3) + ' 圈';
    showRows('regRow', par.region);
    if (par.region) $('rTf').textContent = (p.tField * 1e6).toFixed(3) + ' μs';
    $('status').textContent = state.status;
  }

  function updateSelectorHint() {
    const need = 0.1 * par.B * par.v; // kV/m：E = vB（mT × 10^5 m/s = 0.1 kV/m）
    let s;
    if (par.B === 0 || par.v === 0) s = '速度選擇器需要 B 與 v 都不為零。';
    else {
      s = '以目前的 v 與 B，直線前進需 E = vB = ' + signed(need, 2) + ' kV/m';
      s += Math.abs(par.E - need) < 1e-9 ? '（目前正好滿足）。' : '。';
    }
    $('selHint').textContent = s;
  }

  // ---------- 動畫 ----------
  let lastT = 0;
  function tick(t) {
    if (!state.running) return;
    const dt = Math.min((t - lastT) / 1000, 1 / 30);
    lastT = t;
    const p = state.p;
    const stop = MC.advance(p, fieldCfg(), dt * SPEEDS[par.speed] * 1e-6, {
      bounds: BOUNDS, maxStep: 1e-4, maxAngle: 0.01,
      trail: state.trail,
      trailSpacing: Math.max(1e-4, 1.5 / scale * CM)
    });
    if (state.trail.length > TRAIL_MAX) state.trail.splice(0, state.trail.length - TRAIL_MAX);
    if (stop) {
      state.running = false;
      state.ended = true;
      $('run').textContent = '發射';
      state.status = '粒子離開了畫面。按「發射」從出發點重新開始，或點擊畫布換一個出發點。';
    }
    draw();
    if (state.running) requestAnimationFrame(tick);
  }
  function setRunning(on) {
    if (on && !state.running) {
      state.running = true;
      $('run').textContent = '暫停';
      state.status = '';
      lastT = performance.now();
      requestAnimationFrame(tick);
    } else if (!on) {
      state.running = false;
      $('run').textContent = state.ended ? '發射' : '繼續';
    }
  }

  $('run').addEventListener('click', function () {
    if (state.running) {
      setRunning(false);
      state.status = '已暫停';
      requestDraw();
      return;
    }
    if (state.ended) resetParticle();
    setRunning(true);
  });
  $('reset').addEventListener('click', function () { setRunning(false); resetParticle(); });

  // ---------- 控制項 ----------
  function bindSlider(id, key, fmt) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.innerHTML = fmt(+el.value); };
    el.addEventListener('input', function () {
      par[key] = +el.value;
      update();
      updateSelectorHint();
      if (key !== 'speed') resetParticle();
    });
    update();
    return function (v) { el.value = v; par[key] = v; update(); };
  }
  const set = {
    B: bindSlider('B', 'B', function (v) { return v === 0 ? '0 mT' : signed(v, 0) + ' mT（' + (v > 0 ? '射出紙面' : '射入紙面') + '）'; }),
    q: bindSlider('q', 'q', function (v) { return v === 0 ? '0' : signed(v, 0) + ' e'; }),
    m: bindSlider('m', 'm', function (v) { return v + ' u'; }),
    v: bindSlider('v', 'v', function (v) { return v.toFixed(1) + ' × 10<sup>5</sup> m/s'; }),
    ang: bindSlider('ang', 'ang', function (v) { return v + '°'; }),
    E: bindSlider('E', 'E', function (v) { return v === 0 ? '0（關閉）' : signed(v, 1) + ' kV/m'; }),
    speed: bindSlider('speed', 'speed', function (v) { return '1 秒 = ' + SPEEDS[v] + ' μs'; })
  };
  $('region').addEventListener('change', function (ev) { par.region = ev.target.checked; resetParticle(); });
  [['showTrail', 'trail'], ['showVec', 'vec'], ['showOrbit', 'orbit']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
  });

  const PRESETS = {
    circle: { B: 100, q: 2, m: 4, v: 3, ang: 0, E: 0, region: false, center: [W / 2, H / 2] },
    region: { B: -100, q: 2, m: 4, v: 2, ang: 0, E: 0, region: true, start: [2, 3.5] },
    selector: { B: 100, q: 2, m: 4, v: 3, ang: 0, E: 30, region: false, start: [1.5, 8] },
    drift: { B: 200, q: 2, m: 4, v: 0, ang: 0, E: 20, region: false, start: [1.5, 7] }
  };
  const STATUS = {
    circle: '純磁場：正電荷在射出紙面的磁場中順時針做等速圓周運動。',
    region: '粒子垂直射入磁場區，走半圓後反向射出。',
    selector: 'E = vB：電力與磁力抵消，粒子直線前進。試著只改 v，或只改 q、m。',
    drift: '由靜止釋放：粒子沿 E×B 方向以 E/B 的平均速度漂移（擺線）。'
  };
  function applyPreset(name) {
    const pr = PRESETS[name];
    ['B', 'q', 'm', 'v', 'ang', 'E'].forEach(function (k) { set[k](pr[k]); });
    par.region = pr.region;
    $('region').checked = pr.region;
    if (pr.center) state.start = startForCenter(pr.center[0], pr.center[1]);
    else state.start = { x: pr.start[0], y: pr.start[1] };
    updateSelectorHint();
    resetParticle();
  }
  document.querySelectorAll('[data-preset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyPreset(btn.dataset.preset);
      setRunning(true);
      state.status = STATUS[btn.dataset.preset];
    });
  });

  // ---------- 點擊／拖曳畫布：改變出發點 ----------
  let dragging = false;
  function eventWorld(ev) {
    const r = cv.getBoundingClientRect();
    const w = toWorld(ev.clientX - r.left, ev.clientY - r.top);
    return { x: Math.min(W - 0.2, Math.max(0.2, w[0])), y: Math.min(H - 0.2, Math.max(0.2, w[1])) };
  }
  cv.addEventListener('pointerdown', function (ev) {
    dragging = true;
    state.start = eventWorld(ev);
    resetParticle();
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!dragging) return;
    state.start = eventWorld(ev);
    resetParticle();
  });
  const endDrag = function () { dragging = false; };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 啟動 ----------
  readColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); requestDraw(); });
  // 齒輪設定切換深淺色時也重畫（settings.js）
  window.addEventListener('lab:themechange', function () { readColors(); requestDraw(); });
  applyPreset('circle');
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  else window.addEventListener('resize', resize);
  resize();
})();
