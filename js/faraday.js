/* faraday.js — 「法拉第定律與冷次定律」模組的畫面與互動（物理計算在 faraday-core.js） */
(function () {
  'use strict';
  const FC = window.FaradayCore;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  // ---------- 固定比例（畫面上有說明） ----------
  const SCALE_VA = 0.1;   // 模式 A 磁鐵速度箭頭：每 1 m/s 畫 0.1 m
  const SCALE_VB = 0.25;  // 模式 B 速度箭頭：每 1 m/s 畫 0.25 m
  const SCALE_FB = 0.4;   // 模式 B 力箭頭：每 1 N 畫 0.4 m
  const SLOW = 0.25;
  const V_REF = 0.5;      // 拖曳時用來決定檢流計量程的參考速率（m/s）
  const WINS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 40, 60];
  const LINES = FC.fieldLines(8, { xMax: 1.0, yMax: 0.6, step: 0.0015 });

  const state = {
    mode: 'A',
    running: !reducedMotion,
    slow: false,
    t: 0,
    ended: false,
    acted: false,        // 使用者操作過才回報任務事件（預設狀態不會觸發任務）
    A: {
      motion: 'pass', dir: 1, flipped: false, N: 100, a: 0.03, R: 10, v: 0.5, f: 0.5,
      dx: -FC.PASS_X, dv: 0, target: -FC.PASS_X, dragging: false, grab: 0, hover: false,
      x0run: -FC.PASS_X, lastCycle: 0, stillFor: 0, dragPeakI: 0
    },
    B: { sub: 'release', Bsign: -1, B: 1, L: 0.5, R: 1, m: 0.2, v0: 1.5, F: 0.4, tEnd: Infinity, endReason: null, halfSent: false },
    hist: [],            // 拖曳模式的紀錄 {t, phi, eps, I}
    scale: null,         // 圖表縱軸範圍與檢流計量程
    flow: 0,             // 電流方向動畫的相位（純視覺）
    needle: 0,           // 檢流計指針（顯示用，略有慣性）
    show: { lines: true, current: true, poles: true, tangent: true },
    fx: []
  };

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-em', '--b-thermo']
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
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  /** 1–2–2.5–5 序列中不小於 x 的「整齊」數 */
  function niceUp(x) {
    if (!(x > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / e;
    const m = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(function (c) { return c >= f - 1e-9; });
    return m * e;
  }
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  function decOf(step) { return step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)); }

  // ---------- 參數 ----------
  function pA() { return { N: state.A.N, a: state.A.a, R: state.A.R, flipped: state.A.flipped }; }
  function pB() {
    const b = state.B;
    return { sub: b.sub, B: b.B, Bsign: b.Bsign, L: b.L, R: b.R, m: b.m, v0: b.v0, F: b.F, x0: FC.RAIL.x0 };
  }
  function passDur() { return FC.passDuration(state.A.v); }

  /** 模式 A：時刻 t 的磁鐵位置與速度 */
  function magnetAt(t) {
    const A = state.A;
    if (A.motion === 'pass') return FC.passState(t, A.v, A.dir);
    if (A.motion === 'osc') return FC.oscState(t, A.f);
    return { x: A.dx, v: A.dv };
  }
  /** 目前的完整狀態 */
  function snapA() {
    const m = magnetAt(state.t), p = pA();
    const s = FC.coilState(m.x, m.v, p);
    s.q = -p.N * (s.phi - FC.coilFlux(state.A.x0run, p.a, p.flipped)) / p.R;
    return s;
  }
  function snapB() {
    const B = state.B, s = FC.rodState(Math.min(state.t, B.tEnd), pB());
    if (state.t >= B.tEnd && B.endReason === 'rail') {
      // 撞到末端擋塊後停住：沒有電流也沒有力（動能在碰撞中損失）
      s.v = 0; s.eps = 0; s.I = 0; s.dphi = 0; s.Fb = 0; s.Fext = 0; s.P = 0; s.KE = 0;
    }
    return s;
  }

  /** 圖表用的數值（顯示單位：A 為 mWb、V、mA；B 為 Wb、V、A） */
  function graphValuesAt(t) {
    if (state.mode === 'A') {
      const m = magnetAt(t), s = FC.coilState(m.x, m.v, pA());
      return { phi: s.phi * 1e3, eps: s.eps, I: s.I * 1e3, dphi: s.dphi * 1e3 };
    }
    const s = FC.rodState(Math.min(t, state.B.tEnd), pB()), o = state.B.Bsign;
    const after = t > state.B.tEnd;
    return { phi: o * s.phi, eps: after ? 0 : o * s.eps, I: after ? 0 : o * s.I, dphi: after ? 0 : o * s.dphi };
  }
  function prescribed() { return !(state.mode === 'A' && state.A.motion === 'drag'); }

  // ---------- 一次實驗（run）的設定 ----------
  function runLength() {
    if (state.mode === 'A') return state.A.motion === 'pass' ? passDur() : Infinity;
    return state.B.tEnd;
  }
  function windowInfo() {
    let W, fixed;
    const len = runLength();
    if (isFinite(len) && len <= 60) {
      W = WINS.find(function (w) { return w >= len * 1.04; }) || 60; fixed = true;
    } else if (state.mode === 'A' && state.A.motion === 'osc') {
      W = WINS.find(function (w) { return w >= 2.5 / state.A.f; }) || 15; fixed = false;
    } else { W = state.mode === 'A' ? 6 : 10; fixed = false; }
    const tL = fixed ? 0 : Math.max(0, state.t - 0.8 * W);
    return { W: W, tL: tL, tR: tL + W, fixed: fixed };
  }

  function computeScale() {
    const sc = {};
    if (state.mode === 'A') {
      const p = pA(), A = state.A;
      const phiC = FC.coilFlux(0, p.a, p.flipped) * 1e3;
      let epsM;
      if (A.motion === 'pass') epsM = FC.passSummary(p, A.v, A.dir).epsPeak;
      else if (A.motion === 'osc') epsM = FC.oscPeak(p, A.f);
      else epsM = p.N * V_REF * FC.maxAbs(function (x) { return FC.coilFluxSlope(x, p.a, p.flipped); }, -0.2, 0.2, 800);
      const pm = niceUp(Math.abs(phiC) * 1.05);
      sc.phi = phiC >= 0 ? [0, pm] : [-pm, 0];
      sc.eps = niceUp(epsM * 1.05);
      sc.I = niceUp(epsM / p.R * 1e3 * 1.05);
      sc.range = niceUp(epsM / p.R * 1e3 * 1.02); // 檢流計量程（mA）
    } else {
      const p = pB(), B = state.B;
      const tE = isFinite(B.tEnd) ? B.tEnd : 10;
      const sEnd = FC.rodState(tE, p), s0 = FC.rodState(0, p);
      const vt = FC.rodDerived(p).vt;
      const phiExt = [s0.phi, sEnd.phi];
      const pm = niceUp(Math.max(Math.abs(phiExt[0]), Math.abs(phiExt[1])) * 1.05);
      sc.phi = [0, pm]; // 模式 B：Φ 以磁場方向為正
      const vmax = Math.max(Math.abs(p.v0), p.sub === 'force' ? Math.abs(vt) : 0, 1e-3);
      sc.eps = niceUp(p.B * p.L * vmax * 1.05);
      sc.I = niceUp(p.B * p.L * vmax / p.R * 1.05);
      sc.range = sc.I;
      sc.Pmax = Math.pow(p.B * p.L * vmax, 2) / p.R;
    }
    state.scale = sc;
  }

  function computeRodEnd() {
    const B = state.B, p = pB();
    const tau = FC.rodDerived(p).tau;
    const tRail = FC.rodTimeTo(FC.RAIL.D, p, 3600);
    const tStop = p.sub === 'release' && p.v0 > 0 ? tau * Math.log(1000) : Infinity;
    B.tEnd = Math.min(tRail, tStop);
    B.endReason = !isFinite(B.tEnd) ? null : tRail <= tStop ? 'rail' : 'stopped';
  }

  /** 重新開始一次實驗：時間歸零、清除紀錄（running 決定是否立即播放） */
  function restartRun(play) {
    state.t = 0;
    state.ended = false;
    state.hist = [];
    state.fx = [];
    const A = state.A;
    if (state.mode === 'A') {
      if (A.motion === 'pass') { A.dx = FC.passStart(A.dir); }
      else if (A.motion === 'osc') { A.dx = -FC.OSC_A; }
      A.dv = 0;
      A.target = A.dx;
      A.x0run = magnetAt(0).x;
      A.lastCycle = 0;
      A.stillFor = 0;
      A.dragPeakI = 0;
    } else {
      computeRodEnd();
      state.B.halfSent = false;
    }
    computeScale();
    lastSignificant = 0;
    if (play != null) state.running = play;
    setStatus('');
    updateButtons();
    if (state.running) startLoop();
    stopVoiceIfIdle();
    requestDraw();
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300;
  let L = null;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');

  function layout() {
    const narrow = cw < 640;
    const gap = narrow ? 6 : 8;
    let S, strips = [], H;
    if (!narrow) {
      H = clamp(Math.round(cw * 0.6), 400, 560);
      const sw = Math.round(cw * 0.6);
      S = { x: 0, y: 0, w: sw, h: H };
      const gx = sw + gap, gw = cw - gx, sh = (H - 2 * gap) / 3;
      for (let i = 0; i < 3; i++) strips.push({ x: gx, y: i * (sh + gap), w: gw, h: sh });
    } else {
      const sh0 = Math.round(cw * 0.84);
      S = { x: 0, y: 0, w: cw, h: sh0 };
      const sh = Math.max(100, Math.round(cw * 0.3));
      for (let i = 0; i < 3; i++) strips.push({ x: 0, y: sh0 + gap + i * (sh + gap), w: cw, h: sh });
      H = sh0 + 3 * (sh + gap);
    }
    const out = { narrow: narrow, gap: gap, S: S, strips: strips, H: H };
    // 模式 A：線圈中心在畫面中央，軸線在上方 36% 處
    const view = narrow ? 0.17 : 0.22;
    const kA = S.w / (2 * view);
    const gR = narrow ? Math.min(S.h * 0.15, S.w * 0.13) : Math.min(S.h * 0.16, S.w * 0.2, 72);
    out.A = { k: kA, view: view, cx: S.x + S.w / 2, sy: S.y + S.h * 0.36, gx: S.x + S.w / 2, gy: S.y + S.h - gR - (narrow ? 12 : 18), gR: gR };
    // 模式 B：俯視圖，x 由 −0.18 m 到 2.14 m
    const kB = Math.min((S.w - 12) / 2.32, (S.h - 70) / 1.25);
    out.B = { k: kB, ox: S.x + 6 + 0.18 * kB, cy: S.y + S.h * 0.47 };
    return out;
  }
  function XA(x) { return L.A.cx + x * L.A.k; }
  function YA(y) { return L.A.sy - y * L.A.k; }
  function XB(x) { return L.B.ox + x * L.B.k; }
  function YB(y) { return L.B.cy - y * L.B.k; }

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

  /** 不變的圖層：區域底色、格線、模式 B 的磁場符號 */
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const edge = shade(base, colors.dark ? -0.35 : -0.045);
    const S = L.S;
    const rg = c.createRadialGradient(S.x + S.w / 2, S.y + S.h * 0.42, Math.min(S.w, S.h) * 0.1, S.x + S.w / 2, S.y + S.h * 0.42, Math.max(S.w, S.h) * 0.75);
    rg.addColorStop(0, colors.dark ? shade(base, 0.03) : base);
    rg.addColorStop(1, edge);
    c.fillStyle = rg;
    roundRect(c, S.x, S.y, S.w, S.h, 8);
    c.fill();
    L.strips.forEach(function (R) {
      const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
      g.addColorStop(0, base);
      g.addColorStop(1, edge);
      c.fillStyle = g;
      roundRect(c, R.x, R.y, R.w, R.h, 8);
      c.fill();
    });
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    [S].concat(L.strips).forEach(function (R) { roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 8); c.stroke(); });

    c.save();
    roundRect(c, S.x, S.y, S.w, S.h, 8);
    c.clip();
    const px = function (v) { return Math.round(v) + 0.5; };
    if (state.mode === 'A') {
      // 格線：主格線每 5 cm、次格線每 1 cm（以線圈中心為原點）
      const k = L.A.k, n = Math.ceil(L.A.view / 0.01) + 1, ny = Math.ceil(S.h / k / 0.01) + 1;
      [[0.035, false], [0.09, true]].forEach(function (lv) {
        c.strokeStyle = alpha(colors.text, lv[0] * (colors.dark ? 0.8 : 1));
        c.beginPath();
        for (let i = -n; i <= n; i++) {
          if ((i % 5 === 0) !== lv[1]) continue;
          c.moveTo(px(XA(i * 0.01)), S.y); c.lineTo(px(XA(i * 0.01)), S.y + S.h);
        }
        for (let j = -ny; j <= ny; j++) {
          if ((j % 5 === 0) !== lv[1]) continue;
          const y = YA(j * 0.01);
          if (y < S.y || y > S.y + S.h) continue;
          c.moveTo(S.x, px(y)); c.lineTo(S.x + S.w, px(y));
        }
        c.stroke();
      });
      // 線圈軸線
      c.strokeStyle = alpha(colors.muted, 0.35);
      c.setLineDash([3, 5]);
      c.beginPath(); c.moveTo(S.x + 4, px(L.A.sy)); c.lineTo(S.x + S.w - 4, px(L.A.sy)); c.stroke();
      c.setLineDash([]);
      // 比例尺：5 cm
      const sx = S.x + 12, sy0 = L.A.sy + (L.narrow ? 0.075 : 0.085) * k;
      if (sy0 < L.A.gy - L.A.gR - 20) {
        c.strokeStyle = alpha(colors.muted, 0.9);
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(sx, sy0 - 4); c.lineTo(sx, sy0 + 4); c.moveTo(sx, sy0); c.lineTo(sx + 0.05 * k, sy0);
        c.moveTo(sx + 0.05 * k, sy0 - 4); c.lineTo(sx + 0.05 * k, sy0 + 4);
        c.stroke();
        c.font = '11px system-ui, sans-serif';
        c.fillStyle = colors.muted;
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText('5 cm', sx + 0.025 * k, sy0 + 6);
      }
    } else {
      // 均勻磁場的符號（⊗ 入紙面、⊙ 出紙面），濃淡隨 B 變化
      const B = state.B, sp = L.narrow ? 30 : 36, r = L.narrow ? 4.5 : 5;
      const a = 0.12 + 0.3 * clamp(B.B / 2, 0, 1);
      c.strokeStyle = alpha(colors['b-em'], a);
      c.fillStyle = alpha(colors['b-em'], a);
      c.lineWidth = 1.2;
      for (let y = S.y + sp / 2; y < S.y + S.h; y += sp) {
        for (let x = S.x + sp / 2; x < S.x + S.w; x += sp) {
          c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
          if (B.Bsign < 0) {
            const d = r * 0.62;
            c.beginPath(); c.moveTo(x - d, y - d); c.lineTo(x + d, y + d); c.moveTo(x + d, y - d); c.lineTo(x - d, y + d); c.stroke();
          } else {
            c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill();
          }
        }
      }
    }
    c.restore();
  }

  // ---------- 繪圖工具 ----------
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
  /** 小箭頭（電流方向）：在 (x, y) 沿 (ux, uy) 方向 */
  function chevron(x, y, ux, uy, s, color) {
    const nx = -uy, ny = ux;
    ctx.beginPath();
    ctx.moveTo(x + ux * s, y + uy * s);
    ctx.lineTo(x - ux * s * 0.7 + nx * s * 0.8, y - uy * s * 0.7 + ny * s * 0.8);
    ctx.lineTo(x - ux * s * 0.25, y - uy * s * 0.25);
    ctx.lineTo(x - ux * s * 0.7 - nx * s * 0.8, y - uy * s * 0.7 - ny * s * 0.8);
    ctx.closePath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.85);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
  }
  function sphereSmall(x, y, col, r) {
    r = r || (L.narrow ? 4.5 : 5.5);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, shade(col, 0.6));
    g.addColorStop(1, shade(col, -0.3));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }
  function draw() {
    if (!L || !state.scale) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    const s = state.mode === 'A' ? snapA() : snapB();
    if (state.mode === 'A') drawSceneA(s); else drawSceneB(s);
    drawGraphs(s);
    updateReadout(s);
  }

  // ======================= 模式 A：磁鐵與線圈 =======================
  function drawSceneA(s) {
    const S = L.S, k = L.A.k, sy = L.A.sy, A = state.A, sc = state.scale;
    ctx.save();
    roundRect(ctx, S.x, S.y, S.w, S.h, 8);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const a = A.a, ry = a * k, rx = ry * 0.3, h = FC.COIL.len / 2;
    const level = clamp(Math.abs(s.I * 1e3) / sc.range, 0, 1);

    // 1. 磁力線（磁鐵座標平移；翻轉時左右鏡射）
    if (state.show.lines) drawFieldLines(s.x, A.flipped, a);

    // 2. 線圈骨架（半透明圓筒）
    const x1 = XA(-h - 0.004), x2 = XA(h + 0.004);
    const cg = ctx.createLinearGradient(0, sy - ry, 0, sy + ry);
    cg.addColorStop(0, alpha(colors.equi, colors.dark ? 0.1 : 0.07));
    cg.addColorStop(0.5, alpha(colors.equi, 0.02));
    cg.addColorStop(1, alpha(colors.equi, colors.dark ? 0.12 : 0.1));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(x1, sy, rx, ry, 0, Math.PI / 2, Math.PI * 1.5);
    ctx.lineTo(x2, sy - ry);
    ctx.ellipse(x2, sy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    // 3. 線圈的後半圈（被磁鐵擋住的那一半）
    const nDraw = clamp(Math.round(A.N / 40) + 4, 4, 13);
    const xs = [];
    for (let i = 0; i < nDraw; i++) xs.push(XA(-h + 2 * h * i / (nDraw - 1)));
    const copper = colors.equi;
    xs.forEach(function (x) {
      ctx.strokeStyle = shade(copper, colors.dark ? -0.45 : -0.25);
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.ellipse(x, sy, rx, ry, 0, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // 4. 磁鐵
    drawMagnet(s, A);

    // 5. 線圈的前半圈（管狀：底層粗而暗，上層細而亮）
    xs.forEach(function (x) {
      ctx.strokeStyle = shade(copper, colors.dark ? -0.15 : -0.08);
      ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.ellipse(x, sy, rx, ry, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.strokeStyle = alpha(shade(copper, 0.55), 0.9);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x - 0.8, sy - 0.6, rx, ry, 0, -Math.PI / 2 + 0.15, Math.PI / 2 - 0.5); ctx.stroke();
    });

    // 6. 導線與檢流計
    const gx = L.A.gx, gy = L.A.gy, gR = L.A.gR;
    const yBus = gy - gR - (L.narrow ? 10 : 16);
    const tL = [gx - gR * 0.55, gy - gR * 0.82], tR = [gx + gR * 0.55, gy - gR * 0.82];
    const leadL = [[xs[0], sy + ry], [xs[0], yBus], [tL[0], yBus], [tL[0], tL[1]]];
    const leadR = [[xs[xs.length - 1], sy + ry], [xs[xs.length - 1], yBus + 8], [tR[0], yBus + 8], [tR[0], tR[1]]];
    const wire = shade(colors.muted, colors.dark ? 0.05 : -0.15), wireL = shade(colors.muted, colors.dark ? 0.5 : 0.5);
    tube(leadL, 2.6, wire, wireL);
    tube(leadR, 2.6, wire, wireL);
    drawGalvanometer(s, gx, gy, gR);

    // 7. 電流方向：前半圈上的小箭頭（I > 0 時在前面往下流），以及導線上的箭頭
    if (state.show.current && level > 0.01) {
      const sg = s.I > 0 ? 1 : -1, col = colors.probe, ph = state.flow;
      const cs = L.narrow ? 4 : 5;
      const pick = [0, Math.floor((nDraw - 1) / 2), nDraw - 1];
      xs.forEach(function (x, i) {
        if (pick.indexOf(i) < 0 || (i === pick[1] && nDraw < 5)) return;
        for (let j = 0; j < 2; j++) {
          let u = ((j / 2 + ph + i * 0.13) % 1 + 1) % 1;
          u = 0.12 + 0.76 * u;
          const th = -Math.PI / 2 + u * Math.PI;
          const px = x + rx * Math.cos(th), py = sy + ry * Math.sin(th);
          let tx = -rx * Math.sin(th), ty = ry * Math.cos(th);
          const tm = Math.hypot(tx, ty) || 1;
          chevron(px, py, sg * tx / tm, sg * ty / tm, cs, col);
        }
      });
      // 導線：I > 0 時由右側導線流進檢流計的「+」端，再由左側導線流回線圈
      [[leadR, sg], [leadL, -sg]].forEach(function (pr) {
        const path = pr[0], d = pr[1];
        const segs = [];
        let tot = 0;
        for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); segs.push(l); tot += l; }
        const n = Math.max(2, Math.round(tot / 46));
        for (let j = 0; j < n; j++) {
          let u = ((j / n + ph * 0.5) % 1 + 1) % 1;
          let dist = u * tot, i = 0;
          while (i < segs.length - 1 && dist > segs[i]) { dist -= segs[i]; i++; }
          const p0 = path[i], p1 = path[i + 1], f = segs[i] ? dist / segs[i] : 0;
          const ux = (p1[0] - p0[0]) / (segs[i] || 1), uy = (p1[1] - p0[1]) / (segs[i] || 1);
          chevron(p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, d * ux, d * uy, cs * 0.9, col);
        }
      });
    }

    // 8. 感應磁極：線圈兩端的 N／S 與線圈內感應磁場的方向
    if (state.show.poles && level > 0.02) {
      const cp = FC.coilPoles(s.I);
      const yl = sy - ry - (L.narrow ? 14 : 18);
      const f = '800 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif';
      const op = 0.35 + 0.65 * Math.min(1, level * 2.5);
      ctx.globalAlpha = op;
      ctx.textAlign = 'center';
      const xl = XA(-h) - 12, xr = XA(h) + 12;
      pill(cp.left, xl, yl, cp.left === 'N' ? colors.pos : colors.neg, f, 0.9);
      pill(cp.right, xr, yl, cp.right === 'N' ? colors.pos : colors.neg, f, 0.9);
      // 線圈自己的磁場：由 S 端指向 N 端
      const dir = s.I > 0 ? 1 : -1;
      const len = Math.max(10, xr - xl - 26);
      arrow((xl + xr) / 2 - dir * len / 2, yl, dir, 0, len, 2, colors['b-em'], false);
      ctx.globalAlpha = 1;
    }

    // 9. 文字
    const f1 = '600 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif';
    const f2 = (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    pill('t = ' + num(state.t, 2) + ' s' + (state.slow && A.motion !== 'drag' ? '  (' + SLOW + '×)' : ''), S.x + 10, S.y + 14, colors.text, f1, 0.8);
    if (!L.narrow) {
      ctx.textAlign = 'right';
      pill(T('側視圖', 'Side view'), S.x + S.w - 10, S.y + 14, colors.muted, f2, 0.7);
    }
    // 檢流計旁：ε 與 I；電流方向放在右上角
    const epsTxt = 'ε = ' + num(s.eps, 3) + ' V', iTxt = 'I = ' + num(s.I * 1e3, 2) + ' mA';
    if (L.narrow) {
      ctx.textAlign = 'left';
      pill(epsTxt, S.x + 8, gy - 12, colors['b-mech'], f1, 0.85);
      pill(iTxt, S.x + 8, gy + 12, colors.probe, f1, 0.85);
      pill(T('量程 ±', 'Range ±') + rangeText(sc.range) + ' mA', gx + gR + 8, gy + gR * 0.5, colors.muted, f2, 0.75);
    } else {
      const gyT = gy + gR * 0.15;
      ctx.textAlign = 'right';
      pill(epsTxt, gx - gR - 10, gyT, colors['b-mech'], f1, 0.85);
      ctx.textAlign = 'left';
      pill(iTxt, gx + gR + 10, gyT, colors.probe, f1, 0.85);
    }
    const dirTxt = circText(FC.circulation(s.I, s.x));
    if (dirTxt) {
      ctx.textAlign = 'right';
      pill(dirTxt, S.x + S.w - 10, S.y + (L.narrow ? 14 : 38), colors.muted, f2, 0.8);
    }
    if (A.motion === 'drag' && !A.everDragged) {
      ctx.textAlign = 'center';
      pill(T('↔ 拖曳磁鐵', '↔ Drag the magnet'), XA(s.x), YA(FC.MAG.halfW) - 30, colors.accent, f1, 0.85);
    }
    ctx.restore();
  }
  function circText(c) {
    if (!c) return '';
    const side = state.mode === 'A' ? T('從磁鐵側看：', 'From the magnet’s side: ') : T('由上往下看：', 'Seen from above: ');
    return side + (c === 'cw' ? T('順時針', 'clockwise') : T('逆時針', 'anticlockwise'));
  }

  function drawFieldLines(xm, flipped, a) {
    const sg = flipped ? -1 : 1, k = L.A.k, sy = L.A.sy, cx = L.A.cx;
    const S = L.S;
    const base = alpha(colors.field, colors.dark ? 0.3 : 0.26);
    const hi = alpha(colors['b-em'], colors.dark ? 0.95 : 0.85);
    LINES.forEach(function (ln) {
      const pts = ln.pts;
      // 是否穿過線圈（在 x = 0 的平面上 |y| < a）
      let through = false;
      for (let i = 1; i < pts.length; i++) {
        const x0 = xm + sg * pts[i - 1][0], x1 = xm + sg * pts[i][0];
        if ((x0 <= 0 && x1 > 0) || (x0 >= 0 && x1 < 0)) {
          const f = x0 / (x0 - x1), y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
          if (Math.abs(y) < a) { through = true; break; }
        }
      }
      ctx.strokeStyle = through ? hi : base;
      ctx.lineWidth = through ? 1.8 : 1.2;
      [1, -1].forEach(function (my) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < pts.length; i += 2) {
          const X = cx + (xm + sg * pts[i][0]) * k, Y = sy - my * pts[i][1] * k;
          if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
        }
        const lp = pts[pts.length - 1];
        ctx.lineTo(cx + (xm + sg * lp[0]) * k, sy - my * lp[1] * k);
        ctx.stroke();
        // 方向箭頭：放在線上可見的位置（由 N 極出發往 S 極）
        const n = pts.length;
        [0.3, 0.7].forEach(function (fr) {
          const i = Math.max(1, Math.min(n - 2, Math.round(n * fr)));
          const X = cx + (xm + sg * pts[i][0]) * k, Y = sy - my * pts[i][1] * k;
          if (X < S.x + 8 || X > S.x + S.w - 8 || Y < S.y + 8 || Y > S.y + S.h - 8) return;
          const X2 = cx + (xm + sg * pts[i + 1][0]) * k, Y2 = sy - my * pts[i + 1][1] * k;
          const dx = X2 - X, dy = Y2 - Y, d = Math.hypot(dx, dy) || 1;
          if (Math.abs(Y - sy) < FC.MAG.halfW * k + 4 && Math.abs(X - XA(xm)) < FC.MAG.len / 2 * k + 4) return; // 在磁鐵上就不畫
          const ux = dx / d, uy = dy / d, s = 4;
          ctx.fillStyle = through ? hi : alpha(colors.field, colors.dark ? 0.5 : 0.45);
          ctx.beginPath();
          ctx.moveTo(X + ux * s, Y + uy * s);
          ctx.lineTo(X - ux * s - uy * s * 0.75, Y - uy * s + ux * s * 0.75);
          ctx.lineTo(X - ux * s + uy * s * 0.75, Y - uy * s - ux * s * 0.75);
          ctx.closePath();
          ctx.fill();
        });
      });
    });
  }

  function magnetRect(x) {
    const k = L.A.k, hl = FC.MAG.len / 2, hw = FC.MAG.halfW;
    return { x: XA(x - hl), y: YA(hw), w: 2 * hl * k, h: 2 * hw * k };
  }
  function drawMagnet(s, A) {
    const r = magnetRect(s.x), k = L.A.k;
    const nRight = !A.flipped;
    const hover = A.hover || A.dragging;
    // 投影
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.55 : 0.28) + ')';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = colors.field;
    roundRect(ctx, r.x, r.y, r.w, r.h, 4);
    ctx.fill();
    ctx.restore();
    // 兩半：N（紅）、S（藍），由上而下的漸層
    [[r.x, nRight ? 'S' : 'N'], [r.x + r.w / 2, nRight ? 'N' : 'S']].forEach(function (half, i) {
      const col = half[1] === 'N' ? colors.pos : colors.neg;
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, shade(col, 0.38));
      g.addColorStop(0.45, col);
      g.addColorStop(1, shade(col, -0.32));
      ctx.fillStyle = g;
      ctx.save();
      ctx.beginPath();
      ctx.rect(half[0], r.y - 1, r.w / 2, r.h + 2);
      ctx.clip();
      roundRect(ctx, r.x, r.y, r.w, r.h, 4);
      ctx.fill();
      ctx.restore();
      ctx.font = '800 ' + clamp(Math.round(r.h * 0.62), 10, 16) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      const lx = i === 0 ? r.x + r.w * 0.16 : r.x + r.w * 0.84;
      ctx.fillText(half[1], lx, r.y + r.h / 2 + 0.5);
    });
    // 頂邊高光、分界線
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r.x + 4, r.y + 1.5); ctx.lineTo(r.x + r.w - 4, r.y + 1.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.moveTo(r.x + r.w / 2 + 0.5, r.y); ctx.lineTo(r.x + r.w / 2 + 0.5, r.y + r.h); ctx.stroke();
    if (hover) {
      ctx.strokeStyle = alpha(colors.accent, 0.8);
      ctx.lineWidth = 2;
      roundRect(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 6);
      ctx.stroke();
    }
    // 速度箭頭（每 1 m/s 畫 0.1 m）
    if (Math.abs(s.v) > 1e-3) {
      const len = Math.abs(s.v) * SCALE_VA * k, cap = 0.2 * k, over = len > cap;
      const y = r.y - (L.narrow ? 12 : 14);
      const ux = s.v > 0 ? 1 : -1;
      const x0 = ux > 0 ? r.x + 6 : r.x + r.w - 6; // 從磁鐵後端出發，避免被線圈擋住
      arrow(x0, y, ux, 0, Math.min(len, cap), L.narrow ? 2.2 : 2.6, colors.accent, over);
      ctx.textAlign = ux > 0 ? 'left' : 'right';
      pill('v' + (over ? ' ≈' : ''), x0 + ux * (Math.min(len, cap) + 6), y, colors.accent, '700 12px system-ui, sans-serif', 0.8);
    }
  }

  function drawGalvanometer(s, gx, gy, gR) {
    const sc = state.scale, Ima = s.I * 1e3;
    // 外殼
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.22) + ')';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    const cg = ctx.createRadialGradient(gx - gR * 0.3, gy - gR * 0.4, gR * 0.1, gx, gy, gR * 1.05);
    cg.addColorStop(0, shade(colors.field, colors.dark ? -0.35 : 0.35));
    cg.addColorStop(1, shade(colors.field, colors.dark ? -0.65 : -0.05));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(gx, gy, gR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 錶面
    const fr = gR * 0.84;
    const fg = ctx.createLinearGradient(0, gy - fr, 0, gy + fr);
    fg.addColorStop(0, colors.dark ? shade(colors.surface, 0.12) : '#ffffff');
    fg.addColorStop(1, colors.dark ? shade(colors.surface, -0.1) : shade(colors['canvas-bg'], -0.06));
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(gx, gy, fr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(colors.text, 0.25);
    ctx.lineWidth = 1;
    ctx.stroke();
    // 接線柱
    [[-1, '−'], [1, '+']].forEach(function (p) {
      const x = gx + p[0] * gR * 0.55, y = gy - gR * 0.82;
      const tg = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5);
      tg.addColorStop(0, shade(colors.equi, 0.6));
      tg.addColorStop(1, shade(colors.equi, -0.3));
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    });
    // 刻度：中央為零，±60°
    const px = gx, py = gy + fr * 0.2, nl = fr * 0.92, span = Math.PI / 3;
    ctx.strokeStyle = alpha(colors.text, 0.6);
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      const th = -Math.PI / 2 + i / 4 * span;
      const r1 = nl * (i % 2 === 0 ? 0.8 : 0.86), r2 = nl * 0.95;
      ctx.beginPath();
      ctx.moveTo(px + r1 * Math.cos(th), py + r1 * Math.sin(th));
      ctx.lineTo(px + r2 * Math.cos(th), py + r2 * Math.sin(th));
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(px, py, nl * 0.95, -Math.PI / 2 - span, -Math.PI / 2 + span); ctx.stroke();
    const f = (gR < 56 ? 9 : 10) + 'px system-ui, sans-serif';
    ctx.font = f;
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lr = nl * 1.07;
    ctx.fillText('0', px, py - lr);
    ctx.fillText('−', px + lr * Math.cos(-Math.PI / 2 - span), py + lr * Math.sin(-Math.PI / 2 - span));
    ctx.fillText('+', px + lr * Math.cos(-Math.PI / 2 + span), py + lr * Math.sin(-Math.PI / 2 + span));
    ctx.font = '700 ' + (gR < 56 ? 11 : 13) + 'px system-ui, sans-serif';
    ctx.fillStyle = colors.text;
    ctx.fillText('G', gx, gy + fr * (L.narrow ? 0.6 : 0.5));
    if (!L.narrow) {
      ctx.font = f;
      ctx.fillStyle = colors.muted;
      ctx.fillText('±' + rangeText(sc.range) + ' mA', gx, gy + fr * 0.75);
    }
    // 指針
    const frac = clamp(state.needle / sc.range, -1.08, 1.08);
    const th = -Math.PI / 2 + frac * span;
    const peg = Math.abs(Ima) > sc.range * 1.0001;
    ctx.strokeStyle = peg ? colors.pos : colors.text;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + nl * 0.92 * Math.cos(th), py + nl * 0.92 * Math.sin(th)); ctx.stroke();
    sphereSmall(px, py, colors.field, 3.5);
    if (peg) {
      ctx.textAlign = 'center';
      pill(T('超過量程', 'Off scale'), gx, gy - fr - 2, colors.pos, '700 11px system-ui, sans-serif', 0.9);
    }
  }
  function rangeText(r) { return r >= 10 ? num(r, 0) : r >= 1 ? num(r, r % 1 ? 1 : 0) : num(r, decOf(r / 10)); }

  // ======================= 模式 B：導體棒 =======================
  function drawSceneB(s) {
    const S = L.S, k = L.B.k, B = state.B, sc = state.scale;
    ctx.save();
    roundRect(ctx, S.x, S.y, S.w, S.h, 8);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const hL = B.L / 2, D = FC.RAIL.D;
    const yT = YB(hL), yB = YB(-hL), xR = XB(0), xRod = XB(s.x);
    const level = clamp(Math.abs(s.I) / sc.range, 0, 1);

    // 1. 迴路面積（磁通量）
    const ag = ctx.createLinearGradient(xR, 0, xRod, 0);
    ag.addColorStop(0, alpha(colors['b-em'], colors.dark ? 0.1 : 0.07));
    ag.addColorStop(1, alpha(colors['b-em'], colors.dark ? 0.24 : 0.17));
    ctx.fillStyle = ag;
    ctx.fillRect(xR, yT, xRod - xR, yB - yT);

    // 2. 預測位置：放開後停下的位置／終端速度
    const d = FC.rodDerived(pB());
    if (B.sub === 'release' && B.v0 > 0) {
      const xs = FC.RAIL.x0 + B.v0 * d.tau;
      if (xs < D) {
        const X = XB(xs);
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = alpha(colors.accent, 0.7);
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(X, yT - 14); ctx.lineTo(X, yB + 14); ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = 'center';
        pill(T('停止位置 x0 + v0τ', 'Stops at x0 + v0τ'), X, yT - 24, colors.accent, '600 11px system-ui, sans-serif', 0.85);
      }
    }

    // 3. 軌道（管狀）與末端擋塊
    const rail = shade(colors.equi, colors.dark ? -0.1 : -0.05), railL = alpha(shade(colors.equi, 0.6), 0.9);
    [yT, yB].forEach(function (y) { tube([[XB(-0.04), y], [XB(D + 0.03), y]], L.narrow ? 4 : 5, rail, railL); });
    [yT, yB].forEach(function (y) {
      const x = XB(D + 0.03);
      const g = ctx.createLinearGradient(0, y - 8, 0, y + 8);
      g.addColorStop(0, shade(colors.field, 0.3));
      g.addColorStop(1, shade(colors.field, -0.2));
      ctx.fillStyle = g;
      roundRect(ctx, x, y - 8, 7, 16, 2);
      ctx.fill();
    });
    // 距離刻度
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = 0.5; x <= D + 1e-9; x += 0.5) {
      ctx.strokeStyle = alpha(colors.muted, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(XB(x)) + 0.5, yB + 6); ctx.lineTo(Math.round(XB(x)) + 0.5, yB + 11); ctx.stroke();
      ctx.fillText(num(x, 1) + ' m', XB(x), yB + 13);
    }

    // 4. 電阻（發熱時發光）
    const P = s.P, glow = sc.Pmax > 0 ? clamp(P / sc.Pmax, 0, 1) : 0;
    tube([[xR, yT], [xR, yB]], 3, shade(colors.muted, colors.dark ? 0.05 : -0.15), shade(colors.muted, 0.5));
    const rw = L.narrow ? 12 : 14, rh = Math.min(Math.max(28, (yB - yT) * 0.5), yB - yT - 10);
    if (glow > 0.01) {
      const gg = ctx.createRadialGradient(xR, L.B.cy, 2, xR, L.B.cy, rh * 0.9 + 10);
      gg.addColorStop(0, alpha(colors['b-thermo'], 0.55 * glow));
      gg.addColorStop(1, alpha(colors['b-thermo'], 0));
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(xR, L.B.cy, rh * 0.9 + 10, 0, Math.PI * 2); ctx.fill();
    }
    const rg = ctx.createLinearGradient(xR - rw / 2, 0, xR + rw / 2, 0);
    const body = colors.dark ? shade(colors.equi, -0.35) : shade(colors.equi, 0.55);
    rg.addColorStop(0, shade(body, -0.2));
    rg.addColorStop(0.4, shade(body, 0.25));
    rg.addColorStop(1, shade(body, -0.3));
    ctx.fillStyle = rg;
    roundRect(ctx, xR - rw / 2, L.B.cy - rh / 2, rw, rh, 5);
    ctx.fill();
    // 鋸齒
    ctx.strokeStyle = glow > 0.05 ? alpha(colors['b-thermo'], 0.6 + 0.4 * glow) : alpha(colors.text, 0.55);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const nz = 6;
    for (let i = 0; i <= nz; i++) {
      const y = L.B.cy - rh / 2 + 4 + (rh - 8) * i / nz, x = xR + (i % 2 ? rw * 0.28 : -rw * 0.28);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(xR, y);
    }
    ctx.stroke();
    ctx.textAlign = 'right';
    pill('R', xR - rw / 2 - 4, L.B.cy, colors.text, 'italic 700 12px system-ui, sans-serif', 0.75);

    // 5. 電流方向：沿迴路移動的小箭頭（I > 0 為逆時針）
    if (state.show.current && level > 0.01) {
      const path = [[xRod, yB], [xRod, yT], [xR, yT], [xR, yB], [xRod, yB]];
      const segs = [];
      let tot = 0;
      for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); segs.push(l); tot += l; }
      const sg = s.I > 0 ? 1 : -1, n = Math.max(4, Math.round(tot / 40));
      for (let j = 0; j < n; j++) {
        const u = ((j / n + state.flow * 0.25) % 1 + 1) % 1;
        let dist = u * tot, i = 0;
        while (i < segs.length - 1 && dist > segs[i]) { dist -= segs[i]; i++; }
        if (!segs[i]) continue;
        const p0 = path[i], p1 = path[i + 1], f = dist / segs[i];
        const ux = (p1[0] - p0[0]) / segs[i], uy = (p1[1] - p0[1]) / segs[i];
        const x = p0[0] + (p1[0] - p0[0]) * f, y = p0[1] + (p1[1] - p0[1]) * f;
        if (i === 3 && Math.abs(x - xR) < 3) continue;
        if (i === 2 && Math.abs(y - L.B.cy) < rh / 2 + 2) continue; // 不畫在電阻本體上
        chevron(x, y, sg * ux, sg * uy, L.narrow ? 4 : 5, colors.probe);
      }
    }

    // 6. 導體棒（圓柱，左右暗、中間亮）
    const ext = 0.05 * k, rwid = L.narrow ? 7 : 9;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.25) + ')';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    const bg2 = ctx.createLinearGradient(xRod - rwid / 2, 0, xRod + rwid / 2, 0);
    const metal = colors.dark ? shade(colors.field, -0.1) : shade(colors.field, 0.25);
    bg2.addColorStop(0, shade(metal, -0.4));
    bg2.addColorStop(0.35, shade(metal, 0.55));
    bg2.addColorStop(1, shade(metal, -0.45));
    ctx.fillStyle = bg2;
    roundRect(ctx, xRod - rwid / 2, yT - ext, rwid, yB - yT + 2 * ext, rwid / 2);
    ctx.fill();
    ctx.restore();

    // 7. 箭頭：速度、磁力、外力
    const lw = L.narrow ? 2.4 : 2.8;
    const lab = '700 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif';
    const cap = 0.62 * k;
    function vec(y, value, scale, color, label) {
      if (Math.abs(value) < 1e-6) return;
      const len = Math.abs(value) * scale * k, over = len > cap, ux = value > 0 ? 1 : -1;
      const x0 = xRod + ux * (rwid / 2 + 2);
      arrow(x0, y, ux, 0, Math.min(len, cap), lw, color, over);
      ctx.textAlign = ux > 0 ? 'left' : 'right';
      pill(label + (over ? ' ≈' : ''), x0 + ux * (Math.min(len, cap) + 6), y, color, lab, 0.8);
    }
    const yMid = L.B.cy, yq = Math.max(14, (yB - yT) * 0.26);
    vec(yMid, s.v, SCALE_VB, colors.accent, 'v');
    vec(yMid - yq, s.Fb, SCALE_FB, colors.neg, T('F磁', 'F_B'));
    if (B.sub !== 'release') vec(yMid + yq, s.Fext, SCALE_FB, colors['b-mech'], T('F外', 'F_ext'));

    // 8. 文字
    const f1 = '600 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif';
    const f2 = (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    pill('t = ' + num(Math.min(state.t, B.tEnd), 2) + ' s' + (state.slow ? '  (' + SLOW + '×)' : ''), S.x + 10, S.y + 14, colors.text, f1, 0.8);
    if (!L.narrow) {
      ctx.textAlign = 'right';
      pill(T('俯視圖', 'Top view') + '  B ' + (B.Bsign < 0 ? '⊗' : '⊙') + ' ' + num(B.B, 2) + ' T', S.x + S.w - 10, S.y + 14, colors['b-em'], f2, 0.8);
    } else {
      ctx.textAlign = 'right';
      pill('B ' + (B.Bsign < 0 ? '⊗' : '⊙') + ' ' + num(B.B, 2) + ' T', S.x + S.w - 10, S.y + 14, colors['b-em'], f2, 0.8);
    }
    // Φ = BLx 標在面積內
    const wArea = xRod - xR;
    ctx.textAlign = 'center';
    // Φ = BLx 標在面積正中央（避開棒旁的力箭頭標籤）
    const phiTxt = 'Φ = BLx = ' + num(Math.abs(s.phi), 3) + ' Wb';
    ctx.font = f2;
    if (wArea - rw > ctx.measureText(phiTxt).width + 24) pill(phiTxt, (xR + rw / 2 + xRod) / 2, L.B.cy, colors['b-em'], f2, 0.8);
    // 底部：ε、I、方向
    const yb = S.y + S.h - 14;
    ctx.textAlign = 'left';
    const p1 = pill('ε = ' + num(B.Bsign * s.eps, 3) + ' V', S.x + 10, yb, colors['b-mech'], f1, 0.85);
    const p2 = pill('I = ' + num(B.Bsign * s.I, 3) + ' A', p1.x + p1.w + 12, yb, colors.probe, f1, 0.85);
    const ct = circText(FC.rodCirculation(s.I));
    if (ct && !L.narrow) pill(ct, p2.x + p2.w + 12, yb, colors.muted, f2, 0.8);
    else if (ct) { pill(ct, S.x + 10, yb - 22, colors.muted, f2, 0.8); }
    ctx.restore();
  }

  // ======================= 圖表：Φ、ε、I 對時間 =======================
  function drawGraphs(s) {
    const tw = windowInfo(), sc = state.scale;
    const unitA = state.mode === 'A';
    const defs = [
      { key: 'phi', title: unitA ? 'Φ (mWb)' : 'Φ (Wb)', color: colors['b-em'], lo: sc.phi[0], hi: sc.phi[1] },
      { key: 'eps', title: 'ε (V)', color: colors['b-mech'], lo: -sc.eps, hi: sc.eps },
      { key: 'I', title: unitA ? 'I (mA)' : 'I (A)', color: colors.probe, lo: -sc.I, hi: sc.I }
    ];
    // 拖曳時：紀錄超出範圍就放大（只放大、不縮小）
    if (!prescribed()) {
      let mE = 0, mI = 0;
      state.hist.forEach(function (h) { if (h.t >= tw.tL) { mE = Math.max(mE, Math.abs(h.eps)); mI = Math.max(mI, Math.abs(h.I)); } });
      if (mE > sc.eps) { sc.eps = niceUp(mE * 1.05); defs[1].lo = -sc.eps; defs[1].hi = sc.eps; }
      if (mI > sc.I) { sc.I = niceUp(mI * 1.05); defs[2].lo = -sc.I; defs[2].hi = sc.I; }
    }
    const data = sampleGraph(tw);
    const cur = graphValuesNow(s);
    defs.forEach(function (d, i) { drawStrip(L.strips[i], d, data, cur, tw, i === 2); });
  }
  function graphValuesNow(s) {
    if (state.mode === 'A') return { phi: s.phi * 1e3, eps: s.eps, I: s.I * 1e3, dphi: s.dphi * 1e3 };
    const after = state.t >= state.B.tEnd && state.B.endReason === 'rail', o = state.B.Bsign;
    return { phi: o * s.phi, eps: after ? 0 : o * s.eps, I: after ? 0 : o * s.I, dphi: after ? 0 : o * s.dphi };
  }
  /** 曲線取樣：已發生的部分（實線）與預測（虛線，只有運動已知時才畫） */
  function sampleGraph(tw) {
    const past = [], fut = [];
    if (prescribed()) {
      const n = Math.max(120, Math.round((L.strips[0].w) / 1.5));
      const tEndRun = state.mode === 'A' && state.A.motion === 'pass' ? passDur() : state.mode === 'B' ? state.B.tEnd : Infinity;
      for (let i = 0; i <= n; i++) {
        const t = tw.tL + tw.W * i / n;
        if (t > tEndRun + 1e-9 && t > state.t) { break; }
        const v = graphValuesAt(t);
        v.t = t;
        if (t <= state.t) past.push(v);
        else {
          if (!fut.length) { const c = graphValuesAt(state.t); c.t = state.t; past.push(c); fut.push(c); }
          fut.push(v);
        }
      }
      if (!fut.length && past.length && past[past.length - 1].t < state.t) { const c = graphValuesAt(state.t); c.t = state.t; past.push(c); }
      // 運動在視窗內結束：把結束後的平線畫出來
      if (isFinite(tEndRun) && tEndRun < tw.tR && state.t >= tEndRun) {
        const c = graphValuesAt(tEndRun + 1e-9); c.t = tw.tR;
        const last = past[past.length - 1];
        if (last && last.t < tw.tR) { const z = Object.assign({}, c); z.t = Math.max(last.t, tEndRun); past.push(z); past.push(c); }
      }
    } else {
      state.hist.forEach(function (h) { if (h.t >= tw.tL - 0.05) past.push(h); });
    }
    return { past: past, fut: fut };
  }
  function drawStrip(R, d, data, cur, tw, last) {
    ctx.save();
    roundRect(ctx, R.x, R.y, R.w, R.h, 8);
    ctx.clip();
    const pad = { l: 8, r: 10, t: L.narrow ? 24 : 26, b: last ? 22 : 8 };
    const x0 = R.x + pad.l, x1 = R.x + R.w - pad.r, y0 = R.y + pad.t, y1 = R.y + R.h - pad.b;
    const TX = function (t) { return x0 + (t - tw.tL) / tw.W * (x1 - x0); };
    const VY = function (v) { return y1 - (v - d.lo) / (d.hi - d.lo) * (y1 - y0); };
    const px = function (v) { return Math.round(v) + 0.5; };
    // 時間格線
    const step = niceStep(tw.W / (L.narrow ? 4 : 5));
    ctx.strokeStyle = alpha(colors.text, 0.07);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ticks = [];
    for (let t = Math.ceil(tw.tL / step - 1e-9) * step; t <= tw.tR + 1e-9; t += step) { ticks.push(t); ctx.moveTo(px(TX(t)), y0 - 4); ctx.lineTo(px(TX(t)), y1 + 2); }
    ctx.stroke();
    // 上下界與零線
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = alpha(colors.muted, 0.35);
    ctx.beginPath();
    [d.lo, d.hi].forEach(function (v) { if (v !== 0) { ctx.moveTo(x0, px(VY(v))); ctx.lineTo(x1, px(VY(v))); } });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = alpha(colors.muted, 0.75);
    ctx.beginPath(); ctx.moveTo(x0, px(VY(0))); ctx.lineTo(x1, px(VY(0))); ctx.stroke();
    // 預測（虛線）
    const pts = function (arr) { return arr.map(function (p) { return [TX(p.t), VY(clamp(p[d.key], d.lo - (d.hi - d.lo) * 0.2, d.hi + (d.hi - d.lo) * 0.2))]; }); };
    if (data.fut.length > 1) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = alpha(d.color, 0.4);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      pts(data.fut).forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (data.past.length > 1) tube(pts(data.past), L.narrow ? 2.4 : 2.8, shade(d.color, colors.dark ? -0.1 : -0.12), alpha(shade(d.color, 0.55), 0.8));
    // 目前時刻
    const ct = Math.min(state.t, state.mode === 'B' ? state.B.tEnd : Infinity);
    const cx = TX(ct), cy = VY(clamp(cur[d.key], d.lo - (d.hi - d.lo) * 0.2, d.hi + (d.hi - d.lo) * 0.2));
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = alpha(colors.text, 0.3);
    ctx.beginPath(); ctx.moveTo(px(cx), y0 - 4); ctx.lineTo(px(cx), y1 + 2); ctx.stroke();
    ctx.setLineDash([]);
    // Φ–t 的切線：斜率 = dΦ/dt
    if (d.key === 'phi' && state.show.tangent && cx >= x0 - 1 && cx <= x1 + 1) {
      const hw = tw.W * 0.12;
      const sx = (x1 - x0) / tw.W, sv = (y1 - y0) / (d.hi - d.lo);
      const slopePx = -cur.dphi * sv / sx; // 畫布上每 1 px 的變化
      const dxp = hw * sx;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = alpha(colors.text, 0.65);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(cx - dxp, cy - slopePx * dxp); ctx.lineTo(cx + dxp, cy + slopePx * dxp); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (cx >= x0 - 2 && cx <= x1 + 2) sphereSmall(cx, cy, d.color);
    // 標題、刻度、讀值
    const f = (L.narrow ? 11 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const tp = pill(d.title, R.x + 8, R.y + 13, d.color, '700 ' + (L.narrow ? 12 : 13) + 'px system-ui, sans-serif', 0.85);
    let note = '';
    if (d.key === 'phi' && state.show.tangent) note = T('虛線斜率 = dΦ/dt = ', 'dashed slope = dΦ/dt = ') + num(cur.dphi, 3) + (state.mode === 'A' ? ' mWb/s' : ' Wb/s');
    if (d.key === 'eps') note = state.mode === 'A' ? 'ε = −N dΦ/dt = ' + num(cur.eps, 3) + ' V' : 'ε = −dΦ/dt = ' + num(cur.eps, 3) + ' V';
    if (d.key === 'I') note = 'I = ε/R = ' + num(cur.I, state.mode === 'A' ? 2 : 3) + (state.mode === 'A' ? ' mA' : ' A');
    if (note) {
      ctx.font = f;
      if (tp.x + tp.w + 8 + ctx.measureText(note).width + 10 < R.x + R.w - 4) pill(note, tp.x + tp.w + 8, R.y + 13, colors.muted, f, 0.75);
    }
    ctx.textAlign = 'right';
    const vdec = function (v) { const a = Math.abs(v); return a >= 10 ? 0 : a >= 1 ? 1 : a >= 0.1 ? 2 : 3; };
    [d.hi, d.lo].forEach(function (v) {
      if (v === 0) return;
      const y = VY(v);
      pill(num(v, vdec(v)), x1 - 2, y + (v > 0 ? 8 : -8), colors.muted, f, 0.6);
    });
    if (last) {
      ctx.textAlign = 'right';
      const tl = pill('t (s) →', R.x + R.w - 5, R.y + R.h - 11, colors.muted, '600 ' + f, 0.75);
      ctx.textAlign = 'center';
      ctx.font = f;
      const dec = step < 1 ? 1 : 0;
      ticks.forEach(function (t) {
        const x = TX(t), hw2 = ctx.measureText(num(t, dec)).width / 2 + 6;
        if (x - hw2 < R.x + 4 || x + hw2 > tl.x - 2) return;
        pill(num(t, dec), x, R.y + R.h - 11, colors.muted, f, 0.6);
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
  function dirWord(x) { return x > 0 ? T('向右', 'to the right') : x < 0 ? T('向左', 'to the left') : ''; }
  function updateReadout(s) {
    if (state.mode === 'A') {
      setHTML('aT', num(state.t, 2) + ' s');
      setHTML('aX', num(s.x * 100, 1) + ' cm');
      setHTML('aV', num(s.v, 3) + ' m/s');
      setHTML('aPhi', num(s.phi * 1e3, 4) + ' mWb');
      setHTML('aDphi', num(s.dphi * 1e3, 3) + ' mWb/s');
      setHTML('aEps', num(s.eps, 3) + ' V' + '<small>= −' + state.A.N + ' × (' + num(s.dphi * 1e3, 3) + ' mWb/s)</small>');
      setHTML('aI', num(s.I * 1e3, 2) + ' mA');
      const c = FC.circulation(s.I, s.x);
      setHTML('aDir', c ? (c === 'cw' ? T('順時針', 'clockwise') : T('逆時針', 'anticlockwise')) + '<small>' + (s.x <= 0 ? T('從左側看', 'seen from the left') : T('從右側看', 'seen from the right')) + '</small>' : T('—（沒有電流）', '— (no current)'));
      const np = FC.nearPole(s.I, s.x);
      const repel = np && s.force * (s.x - FC.COIL.xc) > 0;
      setHTML('aPole', np ? np + T(' 極', ' pole') + '<small>' + (repel ? T('排斥磁鐵', 'repels the magnet') : T('吸引磁鐵', 'attracts the magnet')) + '</small>' : '—');
      setHTML('aQ', num(s.q * 1e3, 3) + ' mC<small>= −NΔΦ/R</small>');
      setHTML('aF', num(Math.abs(s.force) * 1e3, 2) + ' mN' + (Math.abs(s.force) > 1e-9 ? '<small>' + dirWord(s.force) + T('（阻礙運動）', ' (opposes the motion)') + '</small>' : ''));
      setHTML('aP', num(s.power * 1e3, 2) + ' mW');
    } else {
      const B = state.B;
      setHTML('bT', num(Math.min(state.t, B.tEnd), 2) + ' s');
      setHTML('bX', num(s.x, 3) + ' m');
      setHTML('bV', num(s.v, 3) + ' m/s');
      const o = B.Bsign;
      setHTML('bPhi', num(o * s.phi, 4) + ' Wb');
      setHTML('bDphi', num(o * s.dphi, 3) + ' Wb/s');
      setHTML('bEps', num(o * s.eps, 3) + ' V<small>|ε| = BLv</small>');
      setHTML('bI', num(o * s.I, 3) + ' A');
      const c = FC.rodCirculation(s.I);
      setHTML('bDir', c ? (c === 'cw' ? T('順時針', 'clockwise') : T('逆時針', 'anticlockwise')) : T('—（沒有電流）', '— (no current)'));
      setHTML('bFb', num(Math.abs(s.Fb), 3) + ' N' + (Math.abs(s.Fb) > 1e-9 ? '<small>' + dirWord(s.Fb) + T('（阻礙運動）', ' (opposes the motion)') + '</small>' : ''));
      setHTML('bFe', B.sub === 'release' ? T('0（已放開）', '0 (let go)') : num(s.Fext, 3) + ' N' + (B.sub === 'const' ? T('<small>= B²L²v/R（保持等速）</small>', '<small>= B²L²v/R (keeps v steady)</small>').replace(/²/g, '<sup>2</sup>') : ''));
      setHTML('bP', num(s.P, 3) + ' W');
      const KE0 = 0.5 * B.m * B.v0 * B.v0;
      setHTML('bQ', num(s.heat, 4) + ' J' + (B.sub === 'release' ? '<small>' + T('初動能 ', 'initial KE ') + num(KE0, 4) + ' J</small>' : B.sub === 'force' ? '<small>' + T('外力作功 ', 'work by F ') + num(s.work, 4) + ' J</small>' : ''));
      setHTML('bK', num(s.KE, 4) + ' J');
      setHTML('bTau', num(s.tau, 3) + ' s');
      setHTML('bVt', B.sub === 'force' ? num(s.vt, 3) + ' m/s' : '—');
    }
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let voice = null, lastSignificant = 0, lastTickAt = 0;
  /** 持續的聲音：音量與音高隨 |I|（相對於量程）變化 */
  function updateVoice(Irel) {
    const S = sound();
    if (!S || !state.running || document.hidden) { stopVoice(); return; }
    const lv = clamp(Math.abs(Irel), 0, 1.2);
    const freq = 330 + 300 * Math.min(1, lv), gain = lv < 0.015 ? 0.0001 : 0.05 + 0.3 * Math.min(1, lv);
    if (!voice || !voice.playing) voice = S.voice({ freq: freq, type: 'triangle', gain: gain });
    else voice.set({ freq: freq, gain: gain }, 0.05);
  }
  function stopVoice() { if (voice) { voice.stop(0.15); voice = null; } }
  function stopVoiceIfIdle() { if (!state.running) stopVoice(); }
  /** 電流方向反轉時：檢流計指針的輕「嗒」聲 */
  function tickSound() {
    const S = sound(); if (!S) return;
    const tNow = performance.now();
    if (tNow - lastTickAt < 120) return;
    lastTickAt = tNow;
    S.tone({ freq: 1600, dur: 0.03, type: 'sine', gain: 0.4 });
    S.noise({ dur: 0.015, gain: 0.12, filter: 3800, q: 1.2 });
  }
  /** 導體棒撞到軌道末端 */
  function thudSound() {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.06, gain: 0.6, filter: 1100, q: 0.9 });
    S.tone({ freq: 300, dur: 0.12, type: 'triangle', gain: 0.4 });
  }

  // ---------- 任務事件 ----------
  function emit(type, data) { if (window.LabMission && state.acted) window.LabMission.emit(type, data); }
  function dataA(s) {
    const A = state.A;
    return { mode: 'A', motion: A.motion, N: A.N, a: A.a, R: A.R, v: A.v, f: A.f, dir: A.dir, flipped: A.flipped };
  }
  function dataB(s) {
    const B = state.B;
    return Object.assign({ mode: 'B', sub: B.sub, B: B.B, Bsign: B.Bsign, L: B.L, R: B.R, m: B.m, v0: B.v0, F: B.F },
      s ? { t: s.t, x: s.x, v: s.v, eps: s.eps, I: s.I, P: s.P, heat: s.heat, work: s.work, KE: s.KE, tau: s.tau, vt: s.vt } : {});
  }
  let lastLive = 0;
  function emitLive(s) {
    const tNow = performance.now();
    if (tNow - lastLive < 100) return;
    lastLive = tNow;
    if (state.mode === 'A') {
      const A = state.A;
      emit('liveA', Object.assign(dataA(s), {
        x: s.x, vel: s.v, phi: s.phi, eps: s.eps, I: s.I, nearPole: Math.abs(s.I) > 1e-6 ? FC.nearPole(s.I, s.x) : null,
        centered: Math.abs(s.x - FC.COIL.xc) <= 0.004, stillFor: A.stillFor, dragPeakI: A.dragPeakI
      }));
    } else emit('liveB', dataB(s));
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function tick(tNow) {
    if (!state.running) { loopOn = false; stopVoice(); return; }
    const dtReal = Math.min((tNow - lastT) / 1000, 1 / 30);
    lastT = tNow;
    const A = state.A;
    const drag = state.mode === 'A' && A.motion === 'drag';
    const dt = dtReal * (state.slow && !drag ? SLOW : 1);
    let s;
    if (state.mode === 'A') {
      if (A.motion === 'pass') {
        state.t += dt;
        if (state.t >= passDur()) { state.t = passDur(); finishPass(); }
      } else if (A.motion === 'osc') {
        state.t += dt;
        const c = Math.floor(state.t * A.f + 1e-9);
        if (c > A.lastCycle) {
          A.lastCycle = c;
          const pk = FC.oscPeak(pA(), A.f);
          emit('cycle', Object.assign(dataA(), { epsPeak: pk, IPeak: pk / A.R }));
        }
      } else {
        // 拖曳：磁鐵經由臨界阻尼的彈簧跟著手指（ω0 = 2π × 6 Hz），每 1 ms 一步
        state.t += dt;
        const w0 = 2 * Math.PI * 6, n = Math.max(1, Math.ceil(dt / 0.001)), h = dt / n;
        for (let i = 0; i < n; i++) {
          const acc = w0 * w0 * (A.target - A.dx) - 2 * w0 * A.dv;
          A.dv += acc * h;
          A.dx += A.dv * h;
        }
        if (Math.abs(A.dv) < 1e-5 && Math.abs(A.target - A.dx) < 1e-6) { A.dv = 0; A.dx = A.target; }
      }
      s = snapA();
      if (drag) {
        state.hist.push({ t: state.t, phi: s.phi * 1e3, eps: s.eps, I: s.I * 1e3, dphi: s.dphi * 1e3 });
        while (state.hist.length && state.hist[0].t < state.t - 70) state.hist.shift();
        A.dragPeakI = Math.max(A.dragPeakI, Math.abs(s.I));
        if (Math.abs(s.v) < 1e-3 && Math.abs(s.x) <= 0.004) A.stillFor += dt; else A.stillFor = 0;
      }
    } else {
      const B = state.B, prevT = state.t;
      state.t += dt;
      const p = pB(), tau = FC.rodDerived(p).tau, tHalf = tau * Math.LN2;
      if (B.sub === 'release' && B.v0 > 0 && !B.halfSent && prevT < tHalf && state.t >= tHalf && tHalf <= B.tEnd) {
        B.halfSent = true;
        emit('rodHalf', Object.assign(dataB(FC.rodState(tHalf, p)), { tHalf: tHalf }));
      }
      if (state.t >= B.tEnd) { state.t = B.tEnd; finishRod(); }
      s = snapB();
    }
    // 檢流計指針（略有慣性，只影響顯示）與電流動畫
    const Idisp = state.mode === 'A' ? s.I * 1e3 : s.I;
    const range = state.scale.range;
    state.needle = reducedMotion ? Idisp : state.needle + (Idisp - state.needle) * (1 - Math.exp(-dtReal / 0.05));
    if (!reducedMotion) state.flow += clamp(Idisp / range, -1.2, 1.2) * dtReal * 1.4 * (state.slow && !drag ? SLOW : 1);
    // 電流方向反轉的「嗒」聲
    const rel = Idisp / range;
    if (Math.abs(rel) > 0.06) {
      const sg = rel > 0 ? 1 : -1;
      if (lastSignificant && sg !== lastSignificant) tickSound();
      lastSignificant = sg;
    }
    updateVoice(state.running ? rel : 0);
    emitLive(s);
    updateButtons();
    draw();
    if (state.running) requestAnimationFrame(tick); else { loopOn = false; stopVoice(); }
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }
  function finishPass() {
    state.running = false;
    state.ended = true;
    const A = state.A, sum = FC.passSummary(pA(), A.v, A.dir);
    emit('passEnd', Object.assign(dataA(), {
      epsPeak: sum.epsPeak, IPeak: sum.IPeak, firstSign: sum.firstSign, qHalf: sum.qHalf, qTotal: sum.qTotal, phiMax: sum.phiMax
    }));
    setStatus(T('磁鐵已穿過線圈：最大電動勢 ', 'The magnet has passed through: peak emf ') + num(sum.epsPeak, 3) + ' V' + T('，', ', ') +
      T('進入時流過的電量 ', 'charge while entering ') + num(Math.abs(sum.qHalf) * 1e3, 3) + ' mC' + T('。按「再來一次」重做。', '. Press “Go again” to repeat.'));
  }
  function finishRod() {
    state.running = false;
    state.ended = true;
    const B = state.B, s = FC.rodState(B.tEnd, pB());
    if (B.endReason === 'rail') {
      thudSound();
      setStatus(T('導體棒到達軌道末端。按「播放」再來一次。', 'The rod reached the end of the rails. Press “Play” to go again.'));
    } else {
      setStatus(T('導體棒幾乎停下了：滑行 ', 'The rod has practically stopped after sliding ') + num(s.x - FC.RAIL.x0, 3) + ' m' +
        T('，產生的熱 ', '; heat produced ') + num(s.heat, 4) + ' J' + T('（初動能 ', ' (initial KE ') + num(0.5 * B.m * B.v0 * B.v0, 4) + ' J' + T('）。', ').'));
    }
    emit('liveB', dataB(s)); // 最後一刻的即時量（不受節流影響）
    emit('rodEnd', Object.assign(dataB(s), { reason: B.endReason, travel: s.x - FC.RAIL.x0, KE0: 0.5 * B.m * B.v0 * B.v0 }));
  }
  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    const txt = state.running ? T('暫停', 'Pause') : state.ended ? T('再來一次', 'Go again') : state.t > 0 ? T('繼續', 'Resume') : T('播放', 'Play');
    if ($('play').textContent !== txt) $('play').textContent = txt;
  }

  // ---------- 操作 ----------
  function acted() { state.acted = true; }
  $('play').addEventListener('click', function () {
    acted();
    if (state.running) { state.running = false; stopVoice(); updateButtons(); requestDraw(); return; }
    if (state.ended) { restartRun(true); return; }
    state.running = true;
    setStatus('');
    updateButtons();
    startLoop();
  });
  $('reset').addEventListener('click', function () {
    acted();
    restartRun(false);
    setStatus(T('已全部清除，滑桿設定不變。按「播放」開始。', 'Everything is cleared; the slider settings are kept. Press “Play” to start.'));
  });
  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; requestDraw(); });
  [['showLines', 'lines'], ['showCurrent', 'current'], ['showPoles', 'poles'], ['showTangent', 'tangent']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
  });
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
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); if (!ev.detail.value) voice = null; }
  });
  updateSoundButton();

  function press(ids, on) { ids.forEach(function (id) { $(id).setAttribute('aria-pressed', String(id === on)); }); }

  function setMode(m) {
    if (m === state.mode) return;
    acted();
    state.mode = m;
    press(['modeA', 'modeB'], m === 'A' ? 'modeA' : 'modeB');
    ['cardA', 'legendA', 'hintA', 'readA', 'chkLines', 'chkPoles'].forEach(function (id) { $(id).hidden = m !== 'A'; });
    ['cardB', 'legendB', 'hintB', 'readB'].forEach(function (id) { $(id).hidden = m !== 'B'; });
    stopVoice();
    state.needle = 0;
    restartRun(!reducedMotion);
    buildBackground();
    requestDraw();
  }
  $('modeA').addEventListener('click', function () { setMode('A'); });
  $('modeB').addEventListener('click', function () { setMode('B'); });

  function setMotion(mv, keepPos) {
    const A = state.A;
    if (mv === A.motion) return;
    const cur = magnetAt(state.t);
    A.motion = mv;
    press(['mvPass', 'mvOsc', 'mvDrag'], mv === 'pass' ? 'mvPass' : mv === 'osc' ? 'mvOsc' : 'mvDrag');
    $('boxDir').hidden = mv !== 'pass';
    $('boxV').hidden = mv !== 'pass';
    $('boxF').hidden = mv !== 'osc';
    if (mv === 'drag') {
      // 拖曳時磁鐵要留在畫面內
      const lim = L ? Math.min(FC.DRAG_X, L.A.view - FC.MAG.len / 2) : FC.DRAG_X;
      A.dx = clamp(cur.x, -lim, lim); A.dv = 0; A.target = A.dx;
    }
    if (mv === 'drag' && keepPos) {
      // 從自動運動切換到拖曳：保持目前位置，重新開始記錄
      restartRun(true);
    } else restartRun(mv === 'drag' ? state.running : !reducedMotion || state.running);
  }
  $('mvPass').addEventListener('click', function () { acted(); setMotion('pass'); });
  $('mvOsc').addEventListener('click', function () { acted(); setMotion('osc'); });
  $('mvDrag').addEventListener('click', function () { acted(); setMotion('drag'); });
  function setDir(d) {
    acted();
    if (state.A.dir === d) return;
    state.A.dir = d;
    press(['dirR', 'dirL'], d > 0 ? 'dirR' : 'dirL');
    restartRun(state.running || !reducedMotion);
  }
  $('dirR').addEventListener('click', function () { setDir(1); });
  $('dirL').addEventListener('click', function () { setDir(-1); });
  $('flip').addEventListener('click', function () {
    acted();
    const A = state.A;
    A.flipped = !A.flipped;
    $('flip').setAttribute('aria-pressed', String(A.flipped));
    if (A.motion === 'drag') { computeScale(); state.hist = []; state.t = 0; A.x0run = A.dx; requestDraw(); }
    else restartRun(state.running || !reducedMotion);
  });

  // 滑桿
  const elsA = { v: $('v'), f: $('f'), N: $('N'), a: $('a'), Ra: $('Ra') };
  const elsB = { B: $('B'), L: $('L'), Rb: $('Rb'), m: $('m'), v0: $('v0'), FB: $('FB') };
  function refreshOutputs() {
    const o = function (el, unit) { $(el.id + 'o').textContent = fmtSlider(val(el), el) + (unit ? ' ' + unit : ''); };
    o(elsA.v, 'm/s'); o(elsA.f, 'Hz'); o(elsA.N, T('匝', 'turns')); o(elsA.a, 'cm'); o(elsA.Ra, 'Ω');
    o(elsB.B, 'T'); o(elsB.L, 'm'); o(elsB.Rb, 'Ω'); o(elsB.m, 'kg'); o(elsB.v0, 'm/s'); o(elsB.FB, 'N');
  }
  function readSliders() {
    const A = state.A, B = state.B;
    A.v = val(elsA.v); A.f = val(elsA.f); A.N = Math.round(val(elsA.N)); A.a = val(elsA.a) / 100; A.R = val(elsA.Ra);
    B.B = val(elsB.B); B.L = val(elsB.L); B.R = val(elsB.Rb); B.m = val(elsB.m); B.v0 = val(elsB.v0); B.F = val(elsB.FB);
  }
  Object.keys(elsA).forEach(function (key) {
    elsA[key].addEventListener('input', function () {
      acted();
      readSliders();
      refreshOutputs();
      if (state.mode !== 'A') return;
      if (state.A.motion === 'drag') { computeScale(); requestDraw(); }
      else restartRun(state.running);
    });
  });
  Object.keys(elsB).forEach(function (key) {
    elsB[key].addEventListener('input', function () {
      acted();
      readSliders();
      refreshOutputs();
      if (state.mode !== 'B') return;
      if (key === 'B') buildBackground();
      restartRun(state.running);
    });
  });
  function setSub(sub) {
    acted();
    const B = state.B;
    if (B.sub === sub) return;
    B.sub = sub;
    press(['subConst', 'subForce', 'subRelease'], sub === 'const' ? 'subConst' : sub === 'force' ? 'subForce' : 'subRelease');
    $('boxFB').hidden = sub !== 'force';
    $('v0Label').innerHTML = sub === 'const' ? T('速率 v', 'Speed v') : T('初速 v<sub>0</sub>', 'Initial speed v<sub>0</sub>');
    restartRun(state.running || !reducedMotion);
  }
  $('subConst').addEventListener('click', function () { setSub('const'); });
  $('subForce').addEventListener('click', function () { setSub('force'); });
  $('subRelease').addEventListener('click', function () { setSub('release'); });
  function setBdir(sg) {
    acted();
    if (state.B.Bsign === sg) return;
    state.B.Bsign = sg;
    press(['bIn', 'bOut'], sg < 0 ? 'bIn' : 'bOut');
    buildBackground();
    restartRun(state.running || !reducedMotion);
  }
  $('bIn').addEventListener('click', function () { setBdir(-1); });
  $('bOut').addEventListener('click', function () { setBdir(1); });

  // ---------- 拖曳磁鐵 ----------
  function canvasPos(ev) {
    const r = cv.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }
  function hitMagnet(p, touch) {
    if (state.mode !== 'A' || !L) return false;
    const x = magnetAt(state.t).x, r = magnetRect(x), m = touch ? 14 : 6;
    return p[0] >= r.x - m && p[0] <= r.x + r.w + m && p[1] >= r.y - m - 4 && p[1] <= r.y + r.h + m + 4;
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = canvasPos(ev);
    if (!hitMagnet(p, ev.pointerType !== 'mouse')) return;
    ev.preventDefault();
    acted();
    const A = state.A;
    if (A.motion !== 'drag') setMotion('drag', true);
    A.dragging = true;
    A.everDragged = true;
    A.grab = (p[0] - XA(A.dx)) / L.A.k;
    A.target = A.dx;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    if (!state.running) { state.running = true; state.ended = false; setStatus(''); updateButtons(); startLoop(); }
    requestDraw();
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = canvasPos(ev), A = state.A;
    if (A.dragging) {
      const lim = Math.min(FC.DRAG_X, L.A.view - FC.MAG.len / 2);
      A.target = clamp((p[0] - L.A.cx) / L.A.k - A.grab, -lim, lim);
      return;
    }
    if (ev.pointerType === 'mouse') {
      const h = hitMagnet(p, false);
      if (h !== A.hover) { A.hover = h; cv.style.cursor = h ? 'grab' : 'default'; requestDraw(); }
    }
  });
  function endDrag() {
    const A = state.A;
    if (!A.dragging) return;
    A.dragging = false;
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (state.A.hover) { state.A.hover = false; cv.style.cursor = 'default'; requestDraw(); } });

  // ---------- 啟動 ----------
  readColors();
  readSliders();
  refreshOutputs();
  restartRun(state.running);
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
})();
