/* faraday.js — 「法拉第定律與冷次定律」模組的畫面與互動（物理計算在 faraday-core.js）
 * 3D 立體檢視在 js/faraday-3d.js：按「3D 立體」時才載入它與 three.js（vendor/three/），預設維持 2D。 */
(function () {
  'use strict';
  const FC = window.FaradayCore;
  const LD = window.LabDraw; // 共用繪圖工具（js/drawkit.js）：標籤、箭頭、立體球、管狀線條、格線、波紋
  // 本檔的版本號（tools/stamp.py 加在網址上），延遲載入 faraday-3d.js 時沿用，避免拿到快取的舊檔
  const SELF_VER = (function () {
    const sc = document.currentScript, m = sc && /[?&]v=(\w+)/.exec(sc.src);
    return m ? '?v=' + m[1] : '';
  })();
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
  let view3 = null;      // 目前的 3D 檢視（切回 2D 時釋放）
  // 鍵盤操作（js/keys.js）：kbItems 依模式更新（模式 A 只有磁鐵；模式 B 沒有可拖曳物件）
  let kb = null, kbVisible = false, magnetItem = null;
  const kbItems = [];
  function is3D() { return !!(view3 && view3.active); }

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-em', '--b-thermo']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
    // 漆包銅線：--equi（金黃）略偏向 --pos（紅），不另外發明色相
    colors.copper = mix(colors.equi, colors.pos, colors.dark ? 0.22 : 0.3);
  }
  function mix(a, b, u) {
    const p = rgbOf(a), q = rgbOf(b);
    return 'rgb(' + p.map(function (x, i) { return Math.round(x + (q[i] - x) * u); }).join(',') + ')';
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
      const sh0 = Math.round(cw * (is3D() ? 1 : 0.84)); // 3D 檢視在手機上用正方形
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
    place3();
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
      // 兩級格線（drawkit）：主格線每 5 cm、次格線每 1 cm，以線圈中心為原點
      const k = L.A.k;
      LD.grid(c, S.x, S.y, S.x + S.w, S.y + S.h, 0.05 * k, 0.01 * k, L.A.cx, L.A.sy);
      // 線圈軸線
      c.strokeStyle = alpha(colors.muted, 0.38);
      c.lineWidth = 1;
      c.setLineDash([3, 5]);
      c.beginPath(); c.moveTo(S.x + 4, px(L.A.sy)); c.lineTo(S.x + S.w - 4, px(L.A.sy)); c.stroke();
      c.setLineDash([]);
      // 比例尺：5 cm（半透明底框）
      const sx = S.x + 14, sy0 = L.A.sy + (L.narrow ? 0.075 : 0.085) * k;
      if (sy0 < L.A.gy - L.A.gR - 20) {
        const bw = 0.05 * k;
        c.fillStyle = alpha(colors['canvas-bg'], colors.dark ? 0.7 : 0.8);
        roundRect(c, sx - 7, sy0 - 9, bw + 14, 30, 7);
        c.fill();
        c.strokeStyle = alpha(colors.muted, 0.25);
        c.lineWidth = 1;
        c.stroke();
        c.strokeStyle = alpha(colors.text, 0.75);
        c.lineWidth = 1.5;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(sx, sy0 - 4); c.lineTo(sx, sy0 + 4); c.moveTo(sx, sy0); c.lineTo(sx + bw, sy0);
        c.moveTo(sx + bw, sy0 - 4); c.lineTo(sx + bw, sy0 + 4);
        c.stroke();
        c.font = '600 11px ' + LD.FONT;
        c.fillStyle = colors.muted;
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText('5 cm', sx + bw / 2, sy0 + 6);
      }
    } else {
      // 均勻磁場的符號（⊗ 入紙面、⊙ 出紙面），濃淡隨 B 變化；小圓帶極淡的底色與亮邊
      const B = state.B, sp = L.narrow ? 30 : 36, r = L.narrow ? 4.6 : 5.2;
      const a = 0.14 + 0.32 * clamp(B.B / 2, 0, 1);
      const em = colors['b-em'];
      c.lineCap = 'round';
      for (let y = S.y + sp / 2; y < S.y + S.h; y += sp) {
        for (let x = S.x + sp / 2; x < S.x + S.w; x += sp) {
          const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.5, x, y, r);
          g.addColorStop(0, alpha(shade(em, 0.6), a * 0.35));
          g.addColorStop(1, alpha(em, a * 0.18));
          c.fillStyle = g;
          c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
          c.strokeStyle = alpha(em, a);
          c.lineWidth = 1.2;
          c.stroke();
          if (B.Bsign < 0) {
            const d = r * 0.6;
            c.beginPath(); c.moveTo(x - d, y - d); c.lineTo(x + d, y + d); c.moveTo(x + d, y - d); c.lineTo(x - d, y + d); c.stroke();
          } else {
            c.fillStyle = alpha(em, Math.min(1, a * 1.6));
            c.beginPath(); c.arc(x, y, 1.7, 0, Math.PI * 2); c.fill();
          }
        }
      }
    }
    c.restore();
  }

  // ---------- 繪圖工具 ----------
  /**
   * 圓角底框標籤（drawkit 的 pill）：(x, y) 是底框的「垂直中心」，水平對齊沿用 ctx.textAlign。
   * bgAlpha 保留舊介面（drawkit 的底框透明度固定），傳回底框 {x, y, w, h}。
   */
  function pill(text, x, y, color, font, bgAlpha) {
    const f = font || '600 12px ' + LD.FONT;
    ctx.font = f;
    const ph = LD.textHeight(ctx.measureText(text), 15) + 3;
    const al = ctx.textAlign === 'right' || ctx.textAlign === 'end' ? 'right' : ctx.textAlign === 'center' ? 'center' : 'left';
    const box = LD.pill(ctx, text, al === 'right' ? x + 5 : al === 'left' ? x - 5 : x, y + ph / 2, color, al, f);
    ctx.textAlign = al;
    return box;
  }
  /** 管狀線條（drawkit 的 tube）：pts 為折線頂點 */
  function tube(pts, w, color) {
    LD.tube(ctx, function (c) { pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); }, color, w);
  }
  /**
   * 向量箭頭（drawkit 的 arrow，全站幾何一致）：從 (x0, y0) 沿 (ux, uy) 畫長 len。
   * broken：箭頭太長被截短時，在箭身中段畫兩道斜線（標「≈」）。
   */
  function arrow(x0, y0, ux, uy, len, lw, color, broken) {
    if (len < 1) return;
    LD.arrow(ctx, x0, y0, x0 + ux * len, y0 + uy * len, color, lw);
    if (broken) {
      const nx = -uy, ny = ux;
      const mx = x0 + ux * len * 0.45, my = y0 + uy * len * 0.45, s = 2.2 * lw;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = colors['canvas-bg'];
      ctx.lineWidth = lw + 2;
      ctx.beginPath(); ctx.moveTo(mx - ux * 2.5, my - uy * 2.5); ctx.lineTo(mx + ux * 2.5, my + uy * 2.5); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      [-3, 3].forEach(function (o) {
        const bx = mx + ux * o, by = my + uy * o;
        ctx.moveTo(bx - nx * s + ux * 2, by - ny * s + uy * 2);
        ctx.lineTo(bx + nx * s - ux * 2, by + ny * s - uy * 2);
      });
      ctx.stroke();
      ctx.restore();
    }
  }
  /** 小箭頭（電流方向）：在 (x, y) 沿 (ux, uy) 方向；略帶弧度、背景色描邊、上緣一點高光 */
  function chevron(x, y, ux, uy, s, color) {
    const nx = -uy, ny = ux;
    ctx.beginPath();
    ctx.moveTo(x + ux * s, y + uy * s);
    ctx.quadraticCurveTo(x + nx * s * 0.35, y + ny * s * 0.35, x - ux * s * 0.75 + nx * s * 0.85, y - uy * s * 0.75 + ny * s * 0.85);
    ctx.lineTo(x - ux * s * 0.25, y - uy * s * 0.25);
    ctx.lineTo(x - ux * s * 0.75 - nx * s * 0.85, y - uy * s * 0.75 - ny * s * 0.85);
    ctx.quadraticCurveTo(x - nx * s * 0.35, y - ny * s * 0.35, x + ux * s, y + uy * s);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.88);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
  }
  /** 立體小球（drawkit 的 ball，預先畫成小圖） */
  function sphereSmall(x, y, col, r, glow) {
    r = r || (L.narrow ? 4.5 : 5.5);
    LD.ball(ctx, x, y, r, col, glow == null ? null : { glow: glow });
  }
  /** 帶下標的標籤（例如停止位置 x0 + v0τ）：parts 為 [文字, 是否下標]，畫在圓角底框裡，(x, y) 為底框中心高度 */
  function subPill(parts, x, y, color, px, align) {
    const fMain = '600 ' + px + 'px ' + LD.FONT, fSub = '600 ' + (px * 0.74).toFixed(1) + 'px ' + LD.FONT;
    let w = 0;
    parts.forEach(function (p) { ctx.font = p[1] ? fSub : fMain; p.w = ctx.measureText(p[0]).width; w += p.w; });
    ctx.font = fMain;
    const ph = LD.textHeight(ctx.measureText('Mg'), px * 1.25) + 3, pw = w + 12;
    const bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    roundRect(ctx, bx, y - ph / 2, pw, ph, ph / 2);
    ctx.fillStyle = alpha(colors['canvas-bg'], colors.dark ? 0.86 : 0.9);
    ctx.fill();
    ctx.strokeStyle = alpha(color, colors.dark ? 0.45 : 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let cx = bx + 6;
    parts.forEach(function (p) {
      ctx.font = p[1] ? fSub : fMain;
      ctx.fillText(p[0], cx, y + 0.5 + (p[1] ? px * 0.28 : 0));
      cx += p.w;
    });
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
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
    const v3 = is3D();
    // 3D 檢視時，左邊（或上方）的實驗畫面由 3D 畫布蓋住，只畫圖表
    if (!v3) { if (state.mode === 'A') drawSceneA(s); else drawSceneB(s); }
    drawGraphs(s);
    updateReadout(s);
    if (v3) view3.frame(s);
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

    // 2. 線圈骨架（半透明圓筒）與兩端的擋板（後半）
    const x1 = XA(-h - 0.004), x2 = XA(h + 0.004);
    const cg = ctx.createLinearGradient(0, sy - ry, 0, sy + ry);
    cg.addColorStop(0, alpha(colors.equi, colors.dark ? 0.12 : 0.08));
    cg.addColorStop(0.3, alpha(colors.equi, colors.dark ? 0.05 : 0.03));
    cg.addColorStop(1, alpha(colors.equi, colors.dark ? 0.14 : 0.11));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(x1, sy, rx, ry, 0, Math.PI / 2, Math.PI * 1.5);
    ctx.lineTo(x2, sy - ry);
    ctx.ellipse(x2, sy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    // 斜投影：x 較小的東西離觀看者較近，所以右擋板在線後面、左擋板在線前面
    drawFlange(x2, sy, rx, ry, false);

    // 3. 漆包銅線：畫成螺旋，正面的線往右下斜、背面的線往右上斜（示意 N 匝中的幾匝）
    const nDraw = clamp(Math.round(A.N / 40) + 4, 4, 13);
    const M = nDraw - 1, xL = XA(-h), xR = XA(h), P = (xR - xL) / M;
    const wW = clamp(P * 0.5, 1.9, L.narrow ? 3.2 : 3.8);
    const helix = function (phi) { // phi = 0 在左端線圈底部；每 2π 一匝；I > 0 時電流沿 phi 增加的方向
      const th = Math.PI / 2 + phi, cx = xL + P * phi / (2 * Math.PI);
      return [cx + rx * Math.cos(th), sy + ry * Math.sin(th), P / (2 * Math.PI) - rx * Math.sin(th), ry * Math.cos(th)];
    };
    const halfPath = function (j, front) {
      return function (c) {
        const p0 = 2 * Math.PI * j + (front ? Math.PI : 0), n = 18;
        for (let i = 0; i <= n; i++) { const q = helix(p0 + Math.PI * i / n); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }
      };
    };
    const copper = colors.copper;
    // 背面的線（在磁鐵後面）：較暗、較細
    ctx.save();
    ctx.globalAlpha = colors.dark ? 0.62 : 0.72;
    ctx.strokeStyle = shade(copper, colors.dark ? -0.5 : -0.35);
    ctx.lineWidth = wW * 0.82;
    ctx.beginPath();
    for (let j = 0; j < M; j++) halfPath(j, false)(ctx);
    ctx.stroke();
    ctx.restore();
    drawFlange(x1, sy, rx, ry, false);

    // 4. 磁鐵
    drawMagnet(s, A);
    drawFlange(x2, sy, rx, ry, true);

    // 5. 正面的線（管狀：底層暗、中層由上而下的銅色漸層、上緣細高光）
    const fg = ctx.createLinearGradient(0, sy - ry, 0, sy + ry);
    fg.addColorStop(0, shade(copper, 0.42));
    fg.addColorStop(0.28, shade(copper, 0.12));
    fg.addColorStop(0.62, copper);
    fg.addColorStop(1, shade(copper, -0.38));
    const front = function (c) { for (let j = 0; j < M; j++) halfPath(j, true)(c); };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = shade(copper, colors.dark ? -0.55 : -0.45);
    ctx.lineWidth = wW + 1.2;
    ctx.beginPath(); front(ctx); ctx.stroke();
    ctx.strokeStyle = fg;
    ctx.lineWidth = wW * 0.78;
    ctx.beginPath(); front(ctx); ctx.stroke();
    // 高光：只畫在上半段（光從左上方來）
    const hg = ctx.createLinearGradient(0, sy - ry, 0, sy + ry * 0.6);
    hg.addColorStop(0, alpha(shade(copper, 0.85), colors.dark ? 0.75 : 0.9));
    hg.addColorStop(0.6, alpha(shade(copper, 0.7), colors.dark ? 0.3 : 0.4));
    hg.addColorStop(1, alpha(shade(copper, 0.7), 0));
    ctx.strokeStyle = hg;
    ctx.lineWidth = Math.max(0.7, wW * 0.26);
    ctx.translate(-wW * 0.12, -wW * 0.18);
    ctx.beginPath(); front(ctx); ctx.stroke();
    ctx.restore();
    drawFlange(x1, sy, rx, ry, true);

    // 6. 導線與檢流計
    const gx = L.A.gx, gy = L.A.gy, gR = L.A.gR;
    const yBus = gy - gR - (L.narrow ? 10 : 16);
    const tL = [gx - gR * 0.55, gy - gR * 0.82], tR = [gx + gR * 0.55, gy - gR * 0.82];
    const leadL = [[xL, sy + ry], [xL, yBus], [tL[0], yBus], [tL[0], tL[1]]];
    const leadR = [[xR, sy + ry], [xR, yBus + 8], [tR[0], yBus + 8], [tR[0], tR[1]]];
    const wire = shade(copper, colors.dark ? -0.05 : -0.1);
    tube(leadL, 3, wire);
    tube(leadR, 3, wire);
    drawGalvanometer(s, gx, gy, gR);

    // 7. 電流方向：正面線圈上的小箭頭（沿螺旋），以及導線上的箭頭
    if (state.show.current && level > 0.01) {
      const sg = s.I > 0 ? 1 : -1, col = colors.probe, ph = state.flow;
      const cs = L.narrow ? 4 : 5;
      const pick = M >= 3 ? [0, Math.floor(M / 2), M - 1] : [0, M - 1];
      pick.forEach(function (j, idx) {
        for (let m = 0; m < 2; m++) {
          let u = ((m / 2 + ph + idx * 0.13) % 1 + 1) % 1;
          u = 0.14 + 0.72 * u;
          const q = helix(2 * Math.PI * j + Math.PI + u * Math.PI);
          const tm = Math.hypot(q[2], q[3]) || 1;
          chevron(q[0], q[1], sg * q[2] / tm, sg * q[3] / tm, cs, col);
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
      const yl = sy - ry * 1.16 - (L.narrow ? 14 : 17);
      const f = '800 ' + (L.narrow ? 12 : 13) + 'px ' + LD.FONT;
      const op = 0.35 + 0.65 * Math.min(1, level * 2.5);
      ctx.globalAlpha = op;
      ctx.textAlign = 'center';
      const xl = XA(-h) - 12, xr = XA(h) + 12;
      pill(cp.left, xl, yl, cp.left === 'N' ? colors.pos : colors.neg, f, 0.9);
      pill(cp.right, xr, yl, cp.right === 'N' ? colors.pos : colors.neg, f, 0.9);
      // 線圈自己的磁場：由 S 端指向 N 端
      const dir = s.I > 0 ? 1 : -1;
      const len = Math.max(10, xr - xl - 28);
      arrow((xl + xr) / 2 - dir * len / 2, yl, dir, 0, len, 2, colors['b-em'], false);
      ctx.globalAlpha = 1;
    }

    // 9. 文字
    const f1 = '600 ' + (L.narrow ? 12 : 13) + 'px ' + LD.FONT;
    const f2 = (L.narrow ? 11 : 12) + 'px ' + LD.FONT;
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
    drawFx();
    ctx.restore();
  }
  /** 線圈骨架兩端的擋板（塑膠圓環，比線圈略大）；front：畫前半（蓋在磁鐵與線上）或後半 */
  function drawFlange(x, sy, rx, ry, front) {
    const ro = 1.16, ri = 0.86;
    const a0 = front ? -Math.PI / 2 : Math.PI / 2, a1 = front ? Math.PI / 2 : Math.PI * 1.5;
    const base = colors.dark ? shade(colors.muted, -0.35) : shade(colors.muted, 0.35);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, sy, rx * ro, ry * ro, 0, a0, a1);
    ctx.ellipse(x, sy, rx * ri, ry * ri, 0, a1, a0, true);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, sy - ry * ro, 0, sy + ry * ro);
    g.addColorStop(0, shade(base, 0.3));
    g.addColorStop(0.5, base);
    g.addColorStop(1, shade(base, -0.3));
    ctx.globalAlpha = front ? 0.92 : 0.7;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = alpha(shade(base, -0.45), 0.55);
    ctx.lineWidth = 0.8;
    ctx.stroke();
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
    const base = alpha(colors.field, colors.dark ? 0.3 : 0.25);
    const em = colors['b-em'];
    const hi = alpha(em, colors.dark ? 0.95 : 0.85);
    const glow = alpha(em, colors.dark ? 0.16 : 0.1);
    const buildPath = function (pts, my) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const X = cx + (xm + sg * pts[i][0]) * k, Y = sy - my * pts[i][1] * k;
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      const lp = pts[pts.length - 1];
      ctx.lineTo(cx + (xm + sg * lp[0]) * k, sy - my * lp[1] * k);
    };
    const heads = [];
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
      [1, -1].forEach(function (my) {
        buildPath(pts, my);
        if (through) {
          // 穿過線圈的磁力線：底下一層淡淡的光暈，上面一條細亮線
          ctx.strokeStyle = glow;
          ctx.lineWidth = 4.5;
          ctx.stroke();
          ctx.strokeStyle = hi;
          ctx.lineWidth = 1.6;
        } else {
          ctx.strokeStyle = base;
          ctx.lineWidth = 1.05;
        }
        ctx.stroke();
        // 方向箭頭：放在線上可見的位置（由 N 極出發往 S 極）
        const n = pts.length;
        [0.3, 0.7].forEach(function (fr) {
          const i = Math.max(1, Math.min(n - 2, Math.round(n * fr)));
          const X = cx + (xm + sg * pts[i][0]) * k, Y = sy - my * pts[i][1] * k;
          if (X < S.x + 8 || X > S.x + S.w - 8 || Y < S.y + 8 || Y > S.y + S.h - 8) return;
          if (Math.abs(Y - sy) < FC.MAG.halfW * k + 4 && Math.abs(X - XA(xm)) < FC.MAG.len / 2 * k + 4) return; // 在磁鐵上就不畫
          const X2 = cx + (xm + sg * pts[i + 1][0]) * k, Y2 = sy - my * pts[i + 1][1] * k;
          const dx = X2 - X, dy = Y2 - Y, d = Math.hypot(dx, dy) || 1;
          heads.push([X, Y, dx / d, dy / d, through]);
        });
      });
    });
    // 箭頭最後一起畫（略帶弧度的小三角形，與全站箭頭同一種形狀）
    heads.forEach(function (q) {
      const X = q[0], Y = q[1], ux = q[2], uy = q[3], s = q[4] ? 4.6 : 4;
      ctx.fillStyle = q[4] ? hi : alpha(colors.field, colors.dark ? 0.55 : 0.5);
      ctx.beginPath();
      ctx.moveTo(X + ux * s, Y + uy * s);
      ctx.quadraticCurveTo(X - uy * s * 0.25, Y + ux * s * 0.25, X - ux * s - uy * s * 0.72, Y - uy * s + ux * s * 0.72);
      ctx.lineTo(X - ux * s * 0.55, Y - uy * s * 0.55);
      ctx.lineTo(X - ux * s + uy * s * 0.72, Y - uy * s - ux * s * 0.72);
      ctx.quadraticCurveTo(X + uy * s * 0.25, Y - ux * s * 0.25, X + ux * s, Y + uy * s);
      ctx.closePath();
      ctx.fill();
    });
  }

  function magnetRect(x) {
    const k = L.A.k, hl = FC.MAG.len / 2, hw = FC.MAG.halfW;
    return { x: XA(x - hl), y: YA(hw), w: 2 * hl * k, h: 2 * hw * k };
  }
  /** 條形磁鐵：紅（N）藍（S）烤漆、上緣高光帶、中間的金屬接縫、壓印的字母 */
  function drawMagnet(s, A) {
    const r = magnetRect(s.x), k = L.A.k;
    const nRight = !A.flipped;
    const hover = A.hover || A.dragging;
    const rad = Math.min(5, r.h * 0.22);
    // 拖曳時的外框光暈（滑過或抓住）
    if (hover) {
      ctx.save();
      ctx.shadowColor = alpha(colors.accent, colors.dark ? 0.85 : 0.6);
      ctx.shadowBlur = 14;
      ctx.strokeStyle = alpha(colors.accent, 0.9);
      ctx.lineWidth = 2;
      roundRect(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, rad + 3);
      ctx.stroke();
      ctx.restore();
    }
    // 投影
    ctx.save();
    ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.6)' : alpha(colors.text, 0.3);
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = colors.field;
    roundRect(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.fill();
    ctx.restore();
    // 兩半：N（紅）、S（藍），烤漆的光澤：上緣亮帶、下緣反光
    [[r.x, nRight ? 'S' : 'N'], [r.x + r.w / 2, nRight ? 'N' : 'S']].forEach(function (half, i) {
      const col = half[1] === 'N' ? colors.pos : colors.neg;
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, shade(col, 0.32));
      g.addColorStop(0.16, shade(col, 0.58));
      g.addColorStop(0.32, shade(col, 0.12));
      g.addColorStop(0.7, col);
      g.addColorStop(0.9, shade(col, -0.3));
      g.addColorStop(1, shade(col, -0.12));
      ctx.save();
      ctx.beginPath();
      ctx.rect(half[0], r.y - 1, r.w / 2, r.h + 2);
      ctx.clip();
      roundRect(ctx, r.x, r.y, r.w, r.h, rad);
      ctx.fillStyle = g;
      ctx.fill();
      // 端面附近略暗（立體的邊角）
      const eg = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
      eg.addColorStop(0, 'rgba(0,0,0,0.18)');
      eg.addColorStop(0.05, 'rgba(0,0,0,0)');
      eg.addColorStop(0.95, 'rgba(0,0,0,0)');
      eg.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = eg;
      ctx.fill();
      ctx.restore();
      // 壓印的字母：白字＋下方一點暗影
      const fpx = clamp(Math.round(r.h * 0.62), 10, 16);
      ctx.font = '800 ' + fpx + 'px ' + LD.FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lx = i === 0 ? r.x + r.w * 0.16 : r.x + r.w * 0.84, ly = r.y + r.h / 2 + 0.5;
      ctx.fillStyle = alpha(shade(col, -0.6), 0.55);
      ctx.fillText(half[1], lx, ly + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(half[1], lx, ly);
    });
    // 中間的金屬接縫
    const mg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    const steel = colors.dark ? shade(colors.field, -0.05) : shade(colors.field, 0.7);
    mg.addColorStop(0, shade(steel, 0.5));
    mg.addColorStop(0.25, shade(steel, 0.75));
    mg.addColorStop(0.7, steel);
    mg.addColorStop(1, shade(steel, -0.35));
    ctx.fillStyle = mg;
    ctx.fillRect(r.x + r.w / 2 - 1.5, r.y, 3, r.h);
    // 頂邊高光、細外框
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(r.x + rad, r.y + 0.5, r.w - 2 * rad, 1);
    ctx.restore();
    roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, Math.max(0, rad - 0.5));
    ctx.strokeStyle = 'rgba(0,0,0,' + (colors.dark ? 0.45 : 0.28) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 鍵盤選取時的焦點框（--accent 虛線圓角框）
    if (kb && kbVisible && kb.focused() && kb.index() === 0 && kbItems[0] === magnetItem) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      roundRect(ctx, r.x - 6, r.y - 6, r.w + 12, r.h + 12, rad + 6);
      ctx.stroke();
      ctx.restore();
    }
    // 速度箭頭（每 1 m/s 畫 0.1 m）
    if (Math.abs(s.v) > 1e-3) {
      const len = Math.abs(s.v) * SCALE_VA * k, cap = 0.2 * k, over = len > cap;
      const y = r.y - (L.narrow ? 12 : 14);
      const ux = s.v > 0 ? 1 : -1;
      const x0 = ux > 0 ? r.x + 6 : r.x + r.w - 6; // 從磁鐵後端出發，避免被線圈擋住
      arrow(x0, y, ux, 0, Math.min(len, cap), L.narrow ? 2.2 : 2.6, colors.accent, over);
      const lx = x0 + ux * (Math.min(len, cap) + 9);
      LD.vecLabel(ctx, 'v', '', lx + ux * 2, y, colors.accent);
      if (over) LD.haloText(ctx, '≈', lx + ux * 12, y, colors.accent, 'center', 'middle', '700 12px ' + LD.FONT);
    }
  }

  /** 檢流計：電木外殼、鍍鉻錶框、奶白色錶面（深色模式較暗）、抗視差鏡面帶、刻度與數字、帶配重的指針、玻璃反光 */
  function drawGalvanometer(s, gx, gy, gR) {
    const sc = state.scale, Ima = s.I * 1e3, dark = colors.dark;
    // 外殼（電木）
    const caseBase = dark ? shade(colors.field, -0.74) : shade(colors.field, -0.12);
    ctx.save();
    ctx.shadowColor = dark ? 'rgba(0,0,0,0.6)' : alpha(colors.text, 0.32);
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    const cg = ctx.createRadialGradient(gx - gR * 0.35, gy - gR * 0.45, gR * 0.1, gx, gy, gR * 1.05);
    cg.addColorStop(0, shade(caseBase, 0.32));
    cg.addColorStop(0.6, caseBase);
    cg.addColorStop(1, shade(caseBase, -0.3));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(gx, gy, gR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 鍍鉻錶框
    const fr = gR * 0.84, bz = gR * 0.93;
    const chrome = dark ? shade(colors.field, -0.22) : shade(colors.field, 0.72);
    const bg2 = ctx.createLinearGradient(gx - bz, gy - bz, gx + bz, gy + bz);
    bg2.addColorStop(0, shade(chrome, 0.75));
    bg2.addColorStop(0.35, shade(chrome, -0.15));
    bg2.addColorStop(0.55, shade(chrome, 0.45));
    bg2.addColorStop(1, shade(chrome, -0.45));
    ctx.fillStyle = bg2;
    ctx.beginPath(); ctx.arc(gx, gy, bz, 0, Math.PI * 2); ctx.fill();
    // 錶面
    const fg = ctx.createLinearGradient(0, gy - fr, 0, gy + fr);
    const paper = mix(colors.surface, colors.equi, 0.035);
    fg.addColorStop(0, dark ? shade(colors.surface, 0.16) : paper);
    fg.addColorStop(1, dark ? shade(colors.surface, -0.08) : mix(paper, colors.equi, 0.06));
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(gx, gy, fr, 0, Math.PI * 2); ctx.fill();
    // 錶面內緣的陰影（錶面凹在錶框裡）
    const ig = ctx.createRadialGradient(gx, gy + fr * 0.08, fr * 0.78, gx, gy, fr);
    ig.addColorStop(0, 'rgba(0,0,0,0)');
    ig.addColorStop(1, dark ? 'rgba(0,0,0,0.45)' : alpha(colors.text, 0.16));
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.arc(gx, gy, fr, 0, Math.PI * 2); ctx.fill();
    // 接線柱（黃銅）
    [-1, 1].forEach(function (sgn) {
      const x = gx + sgn * gR * 0.55, y = gy - gR * 0.82;
      LD.ball(ctx, x, y, 4.6, colors.equi, { glow: 0 });
    });
    // 刻度：中央為零，±60°；細刻度每 1/10 量程、粗刻度每 1/2 量程
    const px = gx, py = gy + fr * 0.34, span = Math.PI / 3;
    const rT = fr * 0.8;           // 刻度弧的半徑
    const ink = dark ? alpha(colors.text, 0.82) : alpha(colors.text, 0.78);
    ctx.save();
    ctx.beginPath(); ctx.arc(gx, gy, fr, 0, Math.PI * 2); ctx.clip();
    // 抗視差鏡面帶（銀色細弧）
    ctx.lineCap = 'butt';
    ctx.strokeStyle = alpha(dark ? shade(chrome, -0.2) : shade(chrome, 0.1), dark ? 0.55 : 0.75);
    ctx.lineWidth = Math.max(2, fr * 0.05);
    ctx.beginPath(); ctx.arc(px, py, rT * 0.86, -Math.PI / 2 - span, -Math.PI / 2 + span); ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, rT, -Math.PI / 2 - span, -Math.PI / 2 + span); ctx.stroke();
    for (let i = -10; i <= 10; i++) {
      const th = -Math.PI / 2 + i / 10 * span, major = i % 5 === 0;
      const r1 = rT * (major ? 0.88 : 0.93);
      ctx.lineWidth = major ? 1.4 : 0.9;
      ctx.beginPath();
      ctx.moveTo(px + r1 * Math.cos(th), py + r1 * Math.sin(th));
      ctx.lineTo(px + rT * Math.cos(th), py + rT * Math.sin(th));
      ctx.stroke();
    }
    // 刻度數字（字級至少 11 px）
    const fNum = '600 11px ' + LD.FONT;
    ctx.font = fNum;
    ctx.fillStyle = dark ? alpha(colors.text, 0.85) : alpha(colors.text, 0.8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lr = rT + 9;
    const labs = L.narrow ? [-2, 0, 2] : [-2, -1, 0, 1, 2];
    labs.forEach(function (q) {
      const th = -Math.PI / 2 + q / 2 * span;
      const v = sc.range * q / 2;
      const t = q === 0 ? '0' : (q < 0 ? '−' : '+') + String(parseFloat(Math.abs(v).toPrecision(3)));
      // 兩端的數字往錶面內側對齊，小錶面上也不會被錶框切掉
      const yL = py + lr * Math.sin(th);
      let xL = px + lr * Math.cos(th);
      if (Math.abs(q) === 2) {
        // 錶面在這個高度的半寬（留 4 px），數字的外緣不超過它
        const lim = Math.sqrt(Math.max(0, fr * fr - (yL - gy) * (yL - gy))) - 4;
        xL = gx + Math.sign(q) * Math.min(Math.abs(xL - gx) + 4, lim);
      }
      ctx.textAlign = q === 2 ? 'right' : q === -2 ? 'left' : 'center';
      ctx.fillText(t, xL, yL);
    });
    // 錶面文字：G 與單位
    ctx.font = '700 ' + (gR < 56 ? 12 : 14) + 'px ' + LD.FONT;
    ctx.fillStyle = alpha(colors.text, 0.85);
    ctx.textAlign = 'center';
    ctx.fillText('G', gx, py + Math.max(fr * 0.3, 15));
    if (!L.narrow) {
      ctx.font = '11px ' + LD.FONT;
      ctx.fillStyle = colors.muted;
      ctx.fillText('mA', gx, py - rT * 0.5);
    }
    // 指針：先畫投影，再畫錐形指針與配重
    const frac = clamp(state.needle / sc.range, -1.08, 1.08);
    const th = -Math.PI / 2 + frac * span;
    const peg = Math.abs(Ima) > sc.range * 1.0001;
    const ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
    const nl = rT * 0.98, tail = rT * 0.2;
    const needlePath = function (ox, oy) {
      ctx.beginPath();
      ctx.moveTo(px + ox + ux * nl, py + oy + uy * nl);
      ctx.lineTo(px + ox + nx * 1.6, py + oy + ny * 1.6);
      ctx.lineTo(px + ox - ux * tail + nx * 1.2, py + oy - uy * tail + ny * 1.2);
      ctx.lineTo(px + ox - ux * tail - nx * 1.2, py + oy - uy * tail - ny * 1.2);
      ctx.lineTo(px + ox - nx * 1.6, py + oy - ny * 1.6);
      ctx.closePath();
    };
    needlePath(1.5, 2.2);
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.45)' : alpha(colors.text, 0.18);
    ctx.fill();
    needlePath(0, 0);
    ctx.fillStyle = peg ? colors.pos : (dark ? shade(colors.text, -0.05) : colors.field);
    ctx.fill();
    // 配重
    ctx.fillStyle = dark ? shade(colors.text, -0.35) : shade(colors.field, 0.15);
    ctx.beginPath(); ctx.arc(px - ux * tail, py - uy * tail, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 轉軸（金屬小球）
    sphereSmall(px, py, dark ? shade(colors.field, -0.2) : shade(colors.field, 0.25), 3.6, 0);
    // 玻璃反光
    ctx.save();
    ctx.beginPath(); ctx.arc(gx, gy, fr, 0, Math.PI * 2); ctx.clip();
    const gl = ctx.createLinearGradient(gx - fr, gy - fr, gx + fr * 0.2, gy + fr * 0.1);
    gl.addColorStop(0, 'rgba(255,255,255,' + (dark ? 0.1 : 0.42) + ')');
    gl.addColorStop(0.55, 'rgba(255,255,255,' + (dark ? 0.03 : 0.1) + ')');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.ellipse(gx - fr * 0.25, gy - fr * 0.45, fr * 0.95, fr * 0.5, -0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (peg) {
      ctx.textAlign = 'center';
      pill(T('超過量程', 'Off scale'), gx, gy - fr - 2, colors.pos, '700 11px ' + LD.FONT, 0.9);
    }
  }
  function rangeText(r) { return r >= 10 ? num(r, 0) : r >= 1 ? num(r, r % 1 ? 1 : 0) : num(r, decOf(r / 10)); }

  /** 事件回饋（純裝飾）：電流反向時檢流計的波紋、導體棒撞到擋塊的波紋 */
  function addFx(x, y, r0, color) {
    if (LD.reducedMotion()) return;
    state.fx.push({ x: x, y: y, r0: r0, color: color, t0: performance.now() });
    if (state.fx.length > 8) state.fx.shift();
    if (!state.running) runFx();
  }
  function drawFx() {
    if (!state.fx.length) return;
    const now = performance.now(), keep = [];
    state.fx.forEach(function (f) {
      const u = (now - f.t0) / 380;
      if (u >= 1) return;
      keep.push(f);
      LD.ripple(ctx, f.x, f.y, f.r0, Math.max(0, u), f.color);
    });
    state.fx = keep;
  }
  let fxOn = false;
  function runFx() {
    if (fxOn) return;
    fxOn = true;
    (function loop() {
      if (state.running || !state.fx.length) { fxOn = false; return; }
      draw();
      requestAnimationFrame(loop);
    })();
  }

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
        // 標籤「停止位置 x0 + v0τ」：下標用小字（畫布不可用 Unicode 下標字元）
        subPill([[T('停止位置 x', 'Stops at x'), 0], ['0', 1], [' + v', 0], ['0', 1], ['τ', 0]],
          clamp(X, S.x + 70, S.x + S.w - 70), yT - 25, colors.accent, L.narrow ? 11 : 12, 'center');
      }
    }

    // 3. 軌道：兩根銅管（下方柔和投影）＋末端鋼擋塊
    const railW = L.narrow ? 5 : 6, xa = XB(-0.04), xb = XB(D + 0.03);
    ctx.save();
    ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.55)' : alpha(colors.text, 0.22);
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2.5;
    ctx.strokeStyle = shade(colors.copper, -0.3);
    ctx.lineWidth = railW;
    ctx.beginPath();
    [yT, yB].forEach(function (y) { ctx.moveTo(xa, y); ctx.lineTo(xb, y); });
    ctx.stroke();
    ctx.restore();
    [yT, yB].forEach(function (y) { tube([[xa, y], [xb, y]], railW, colors.copper); });
    const steel = colors.dark ? shade(colors.field, -0.35) : shade(colors.field, 0.45);
    [yT, yB].forEach(function (y) { LD.block(ctx, xb, y - 9, 8, 18, steel, { r: 2 }); });
    // 距離刻度
    ctx.font = '11px ' + LD.FONT;
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = alpha(colors.muted, 0.6);
    ctx.lineWidth = 1;
    for (let x = 0.5; x <= D + 1e-9; x += 0.5) {
      const X = Math.round(XB(x)) + 0.5;
      ctx.beginPath(); ctx.moveTo(X, yB + railW / 2 + 3); ctx.lineTo(X, yB + railW / 2 + 8); ctx.stroke();
      ctx.fillText(num(x, 1) + ' m', XB(x), yB + railW / 2 + 10);
    }

    // 4. 電阻：銅導線＋陶瓷電阻本體（色環），發熱時變紅並發光
    const P = s.P, glow = sc.Pmax > 0 ? clamp(P / sc.Pmax, 0, 1) : 0;
    tube([[xR, yT], [xR, yB]], 3, colors.copper);
    const rw = L.narrow ? 12 : 14, rh = Math.min(Math.max(28, (yB - yT) * 0.5), yB - yT - 10);
    const ry0 = L.B.cy - rh / 2;
    if (glow > 0.01) {
      const gg = ctx.createRadialGradient(xR, L.B.cy, 2, xR, L.B.cy, rh * 0.9 + 10);
      gg.addColorStop(0, alpha(colors['b-thermo'], 0.55 * glow));
      gg.addColorStop(1, alpha(colors['b-thermo'], 0));
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(xR, L.B.cy, rh * 0.9 + 10, 0, Math.PI * 2); ctx.fill();
    }
    const ceramic = mix(colors.dark ? shade(colors.equi, -0.45) : mix(colors.equi, '#ffffff', 0.62), colors['b-thermo'], 0.55 * glow);
    ctx.save();
    ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.5)' : alpha(colors.text, 0.25);
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 1.5;
    ctx.shadowOffsetY = 2;
    const rg = ctx.createLinearGradient(xR - rw / 2, 0, xR + rw / 2, 0);
    rg.addColorStop(0, shade(ceramic, -0.32));
    rg.addColorStop(0.32, shade(ceramic, 0.3));
    rg.addColorStop(0.55, ceramic);
    rg.addColorStop(1, shade(ceramic, -0.42));
    ctx.fillStyle = rg;
    roundRect(ctx, xR - rw / 2, ry0, rw, rh, rw * 0.42);
    ctx.fill();
    ctx.restore();
    // 色環（裝飾，取自色彩代號）：棕、黑、紅、金
    const bands = [[shade(mix(colors.equi, colors.pos, 0.5), -0.45), 0.2], [shade(colors.field, colors.dark ? -0.75 : -0.55), 0.34], [colors.pos, 0.48], [colors.equi, 0.78]];
    ctx.save();
    roundRect(ctx, xR - rw / 2, ry0, rw, rh, rw * 0.42);
    ctx.clip();
    bands.forEach(function (b) {
      const bgr = ctx.createLinearGradient(xR - rw / 2, 0, xR + rw / 2, 0);
      bgr.addColorStop(0, shade(b[0], -0.35));
      bgr.addColorStop(0.32, shade(b[0], 0.35));
      bgr.addColorStop(1, shade(b[0], -0.45));
      ctx.fillStyle = bgr;
      ctx.globalAlpha = colors.dark ? 0.85 : 0.9;
      ctx.fillRect(xR - rw / 2, ry0 + rh * b[1] - 2, rw, 4);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    roundRect(ctx, xR - rw / 2 + 0.5, ry0 + 0.5, rw - 1, rh - 1, rw * 0.42);
    ctx.strokeStyle = alpha(shade(ceramic, -0.5), 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'right';
    pill('R', xR - rw / 2 - 4, L.B.cy, colors.text, 'italic 700 12px ' + LD.FONT);

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

    // 6. 導體棒：拋光鋼棒（左右暗、中間亮、兩端圓帽），與軌道接觸處有亮點
    const ext = 0.05 * k, rwid = L.narrow ? 7 : 9;
    const metal = colors.dark ? shade(colors.field, -0.12) : shade(colors.field, 0.3);
    ctx.save();
    ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.55)' : alpha(colors.text, 0.28);
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    const bg2 = ctx.createLinearGradient(xRod - rwid / 2, 0, xRod + rwid / 2, 0);
    bg2.addColorStop(0, shade(metal, -0.45));
    bg2.addColorStop(0.3, shade(metal, 0.6));
    bg2.addColorStop(0.42, shade(metal, 0.25));
    bg2.addColorStop(1, shade(metal, -0.5));
    ctx.fillStyle = bg2;
    roundRect(ctx, xRod - rwid / 2, yT - ext, rwid, yB - yT + 2 * ext, rwid / 2);
    ctx.fill();
    ctx.restore();
    roundRect(ctx, xRod - rwid / 2 + 0.5, yT - ext + 0.5, rwid - 1, yB - yT + 2 * ext - 1, rwid / 2);
    ctx.strokeStyle = alpha(shade(metal, -0.55), 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();
    // 細長高光
    ctx.strokeStyle = alpha('#ffffff', colors.dark ? 0.28 : 0.6);
    ctx.lineWidth = Math.max(1, rwid * 0.16);
    ctx.beginPath(); ctx.moveTo(xRod - rwid * 0.18, yT - ext + rwid * 0.7); ctx.lineTo(xRod - rwid * 0.18, yB + ext - rwid * 0.7); ctx.stroke();
    // 滑動接點：棒與兩根軌道相交處
    [yT, yB].forEach(function (y) {
      const cg = ctx.createRadialGradient(xRod - 1, y - 1, 0, xRod, y, rwid * 0.75);
      cg.addColorStop(0, alpha(shade(colors.copper, 0.7), 0.95));
      cg.addColorStop(0.5, alpha(colors.copper, 0.75));
      cg.addColorStop(1, alpha(colors.copper, 0));
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(xRod, y, rwid * 0.75, 0, Math.PI * 2); ctx.fill();
    });

    // 7. 箭頭：速度、磁力、外力（標籤為斜體主字＋下標）
    const lw = L.narrow ? 2.4 : 2.8;
    const cap = 0.62 * k;
    function vec(y, value, scale, color, main, sub) {
      if (Math.abs(value) < 1e-6) return;
      const len = Math.abs(value) * scale * k, over = len > cap, ux = value > 0 ? 1 : -1;
      const x0 = xRod + ux * (rwid / 2 + 2), Lc = Math.min(len, cap);
      arrow(x0, y, ux, 0, Lc, lw, color, over);
      const w = vecText(main, sub, x0 + ux * (Lc + 7), y, color, ux > 0 ? 'left' : 'right');
      if (over) LD.haloText(ctx, '≈', x0 + ux * (Lc + 11 + w), y, color, ux > 0 ? 'left' : 'right', 'middle', '600 13px ' + LD.FONT);
    }
    const yMid = L.B.cy, yq = Math.max(14, (yB - yT) * 0.26);
    vec(yMid, s.v, SCALE_VB, colors.accent, 'v', '');
    vec(yMid - yq, s.Fb, SCALE_FB, colors.neg, 'F', T('磁', 'B'));
    if (B.sub !== 'release') vec(yMid + yq, s.Fext, SCALE_FB, colors['b-mech'], 'F', T('外', 'ext'));

    // 8. 文字
    const f1 = '600 ' + (L.narrow ? 12 : 13) + 'px ' + LD.FONT;
    const f2 = (L.narrow ? 11 : 12) + 'px ' + LD.FONT;
    ctx.textAlign = 'left';
    pill('t = ' + num(Math.min(state.t, B.tEnd), 2) + ' s' + (state.slow ? '  (' + SLOW + '×)' : ''), S.x + 10, S.y + 14, colors.text, f1);
    ctx.textAlign = 'right';
    pill((L.narrow ? '' : T('俯視圖', 'Top view') + '  ') + 'B ' + (B.Bsign < 0 ? '⊗' : '⊙') + ' ' + num(B.B, 2) + ' T', S.x + S.w - 10, S.y + 14, colors['b-em'], f2);
    // Φ = BLx 標在面積正中央（避開棒旁的力箭頭標籤）
    const wArea = xRod - xR;
    ctx.textAlign = 'center';
    const phiTxt = 'Φ = BLx = ' + num(Math.abs(s.phi), 3) + ' Wb';
    ctx.font = f2;
    if (wArea - rw > ctx.measureText(phiTxt).width + 24) pill(phiTxt, (xR + rw / 2 + xRod) / 2, L.B.cy, colors['b-em'], f2);
    // 底部：ε、I、方向
    const yb = S.y + S.h - 14;
    ctx.textAlign = 'left';
    const p1 = pill('ε = ' + num(B.Bsign * s.eps, 3) + ' V', S.x + 10, yb, colors['b-mech'], f1);
    const p2 = pill('I = ' + num(B.Bsign * s.I, 3) + ' A', p1.x + p1.w + 12, yb, colors.probe, f1);
    const ct = circText(FC.rodCirculation(s.I));
    if (ct && !L.narrow) pill(ct, p2.x + p2.w + 12, yb, colors.muted, f2);
    else if (ct) { pill(ct, S.x + 10, yb - 22, colors.muted, f2); }
    drawFx();
    ctx.restore();
  }
  /** 向量名稱：斜體主字＋小一號下標（下標 11 px，手機上也看得清楚）；傳回總寬度 */
  function vecText(main, sub, x, y, color, align) {
    const fM = 'italic 600 ' + (L.narrow ? 13 : 14) + 'px ' + LD.FONT, fS = '600 11px ' + LD.FONT;
    ctx.font = fM;
    const w1 = ctx.measureText(main).width;
    ctx.font = fS;
    const w2 = sub ? ctx.measureText(sub).width + 1 : 0;
    const x0 = align === 'right' ? x - w1 - w2 : align === 'center' ? x - (w1 + w2) / 2 : x;
    LD.haloText(ctx, main, x0, y, color, 'left', 'middle', fM);
    if (sub) LD.haloText(ctx, sub, x0 + w1 + 1, y + 4.5, color, 'left', 'middle', fS);
    return w1 + w2;
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
    // 兩級格線：時間主格（有刻度數字）＋次格（主格的 1/5，夠寬才畫）；縱向在 ±1/2 範圍加次格
    const step = niceStep(tw.W / (L.narrow ? 4 : 5)), sub = step / 5;
    const ticks = [];
    ctx.lineWidth = 1;
    if (sub / tw.W * (x1 - x0) >= 8) {
      ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.05 : 0.04);
      ctx.beginPath();
      for (let t = Math.ceil(tw.tL / sub - 1e-9) * sub; t <= tw.tR + 1e-9; t += sub) { ctx.moveTo(px(TX(t)), y0); ctx.lineTo(px(TX(t)), y1); }
      [0.25, 0.5, 0.75].forEach(function (u) { const y = px(y0 + (y1 - y0) * u); ctx.moveTo(x0, y); ctx.lineTo(x1, y); });
      ctx.stroke();
    }
    ctx.strokeStyle = alpha(colors.text, colors.dark ? 0.11 : 0.1);
    ctx.beginPath();
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
    if (data.past.length > 1) {
      // 曲線下到零線的淡色面積（看得出正負），再畫管狀曲線
      const pp = pts(data.past), zy = VY(clamp(0, d.lo, d.hi));
      const ag = ctx.createLinearGradient(0, y0, 0, y1);
      ag.addColorStop(0, alpha(d.color, colors.dark ? 0.16 : 0.12));
      ag.addColorStop(0.5, alpha(d.color, 0.03));
      ag.addColorStop(1, alpha(d.color, colors.dark ? 0.16 : 0.12));
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.moveTo(pp[0][0], zy);
      pp.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
      ctx.lineTo(pp[pp.length - 1][0], zy);
      ctx.closePath();
      ctx.fill();
      tube(pp, L.narrow ? 2.6 : 3, d.color);
    }
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
    const f = (L.narrow ? 11 : 12) + 'px ' + LD.FONT;
    ctx.textAlign = 'left';
    const tp = pill(d.title, R.x + 8, R.y + 13, d.color, '700 ' + (L.narrow ? 12 : 13) + 'px ' + LD.FONT);
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
      if (lastSignificant && sg !== lastSignificant) {
        tickSound();
        if (state.mode === 'A' && !is3D()) addFx(L.A.gx, L.A.gy, L.A.gR * 0.55, colors.probe); // 指針換邊：檢流計周圍一圈淡出的波紋
      }
      lastSignificant = sg;
    }
    updateVoice(state.running ? rel : 0);
    emitLive(s);
    srNowTick(s);
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
      // 撞到末端：棒與兩根軌道的接點各一圈淡出的波紋
      if (!is3D()) [1, -1].forEach(function (sg) { addFx(XB(FC.RAIL.D), YB(sg * B.L / 2), 8, colors['b-mech']); });
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
    ['cardA', 'legendA', 'hintA', 'hint3A', 'readA', 'chkLines', 'chkPoles'].forEach(function (id) { $(id).hidden = m !== 'A'; });
    ['cardB', 'legendB', 'hintB', 'hint3B', 'readB'].forEach(function (id) { $(id).hidden = m !== 'B'; });
    stopVoice();
    state.needle = 0;
    restartRun(!reducedMotion);
    syncKbItems();
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
    if (state.mode !== 'A' || !L || is3D()) return false;
    const x = magnetAt(state.t).x, r = magnetRect(x), m = touch ? 14 : 6;
    return p[0] >= r.x - m && p[0] <= r.x + r.w + m && p[1] >= r.y - m - 4 && p[1] <= r.y + r.h + m + 4;
  }
  /** 抓住磁鐵：xp 為指標所在的 x（m）。2D 與 3D 共用 */
  function grabMagnet(xp) {
    acted();
    const A = state.A;
    if (A.motion !== 'drag') setMotion('drag', true);
    A.dragging = true;
    A.everDragged = true;
    A.grab = xp - A.dx;
    A.target = A.dx;
    if (!state.running) { state.running = true; state.ended = false; setStatus(''); updateButtons(); startLoop(); }
    requestDraw();
  }
  /** 拖曳中：磁鐵經由臨界阻尼的彈簧跟著指標，範圍與 2D 畫面相同 */
  function moveMagnet(xp) {
    const A = state.A;
    if (!A.dragging) return;
    const lim = Math.min(FC.DRAG_X, L.A.view - FC.MAG.len / 2);
    A.target = clamp(xp - A.grab, -lim, lim);
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = canvasPos(ev);
    if (!hitMagnet(p, ev.pointerType !== 'mouse')) return;
    ev.preventDefault();
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    grabMagnet((p[0] - L.A.cx) / L.A.k);
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = canvasPos(ev), A = state.A;
    if (A.dragging) {
      if (!is3D()) moveMagnet((p[0] - L.A.cx) / L.A.k);
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
  cv.addEventListener('pointerleave', function () { if (state.A.hover && !is3D()) { state.A.hover = false; cv.style.cursor = 'default'; requestDraw(); } });

  // ---------- 鍵盤操作（js/keys.js）：Enter 選取磁鐵，左右方向鍵移動 ----------
  // 每次 0.5 cm、Shift 加方向鍵 2 cm；和滑鼠拖曳一樣切到「用手拖曳」、範圍相同、磁鐵經由同一個彈簧跟上，任務事件也相同（由 tick 送出）
  const KEY_STEP = 0.005, KEY_BIG = 0.02;
  function dragLimit() { return L ? Math.min(FC.DRAG_X, L.A.view - FC.MAG.len / 2) : FC.DRAG_X; }
  function keyMoveMagnet(dir, big) {
    if (state.mode !== 'A' || !L || !dir) return false;
    acted();
    const A = state.A;
    if (A.motion !== 'drag') setMotion('drag', true);
    A.everDragged = true;
    const step = big ? KEY_BIG : KEY_STEP, lim = dragLimit();
    // 走到下一個格點（0.5 cm 或 2 cm 的整數倍），之後每次一格
    const n = dir > 0 ? Math.floor(A.target / step + 1e-6) + 1 : Math.ceil(A.target / step - 1e-6) - 1;
    const nt = clamp(Math.round(n * step * 1e6) / 1e6, -lim, lim);
    if (Math.abs(nt - A.target) < 1e-9) return false;
    A.target = nt;
    if (!state.running) { state.running = true; state.ended = false; setStatus(''); updateButtons(); startLoop(); }
    requestDraw();
    return true;
  }
  magnetItem = {
    name: function () { return T('磁鐵', 'magnet'); },
    move: function (dx, dy, big) { return keyMoveMagnet(dx, big); },
    describe: function () {
      const x = state.A.motion === 'drag' ? state.A.target : magnetAt(state.t).x;
      return T('磁鐵中心 x = ', 'Magnet centre x = ') + num(x * 100, 1) + ' cm' +
        (Math.abs(x) < 1e-9 ? T('，在線圈正中央', ', right at the centre of the coil') : T('（線圈中心在 x = 0）', ' (the coil centre is at x = 0)'));
    }
  };
  function canvasLabel() {
    if (state.mode === 'A') {
      return T('法拉第定律模擬畫布：磁鐵、線圈與檢流計，以及磁通量、感應電動勢、感應電流對時間的圖。按 Enter 選取磁鐵，左右方向鍵移動磁鐵（每次 0.5 cm，Shift 加方向鍵每次 2 cm）。',
        'Faraday’s law simulation: a magnet, a coil and a galvanometer, with graphs of flux, induced emf and induced current against time. Press Enter to select the magnet; the left and right arrow keys move it (0.5 cm per press, 2 cm with Shift).');
    }
    const B = state.B;
    return T('法拉第定律模擬畫布（俯視圖）：導體棒在 B = ' + num(B.B, 2) + ' T 的磁場中沿兩根軌道滑動，棒長 L = ' + num(B.L, 2) + ' m，旁邊是磁通量、感應電動勢、感應電流對時間的圖。',
      'Faraday’s law simulation (top view): a rod slides along two rails in a magnetic field B = ' + num(B.B, 2) + ' T, rod length L = ' + num(B.L, 2) + ' m, with graphs of flux, induced emf and induced current against time.');
  }
  /** 依模式更新鍵盤物件與畫布的角色、說明（模式 B 沒有可拖曳物件：role="img"） */
  function syncKbItems() {
    kbItems.length = 0;
    if (state.mode === 'A') kbItems.push(magnetItem);
    if (kb) kb.select(0);
    if (state.mode === 'A') {
      cv.setAttribute('role', 'application');
      cv.setAttribute('aria-roledescription', T('互動實驗畫布', 'interactive simulation canvas'));
      cv.tabIndex = 0;
    } else {
      cv.setAttribute('role', 'img');
      cv.removeAttribute('aria-roledescription');
      cv.tabIndex = -1;
    }
    const lab = canvasLabel();
    if (cv.getAttribute('aria-label') !== lab) cv.setAttribute('aria-label', lab);
  }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, { label: canvasLabel(), items: kbItems, onChange: requestDraw });
    // 焦點框只在用鍵盤操作時顯示（滑鼠點畫布拖曳時不顯示）
    cv.addEventListener('focus', function () { kbVisible = cv.matches(':focus-visible'); requestDraw(); });
    cv.addEventListener('keydown', function () { if (!kbVisible) { kbVisible = true; requestDraw(); } });
    cv.addEventListener('pointerdown', function () { kbVisible = false; });
  }
  syncKbItems();

  // ---------- 分享目前設定（classroom.js）：磁鐵反向與拖曳出來的磁鐵位置 ----------
  // 滑桿、模式按鈕由 classroom.js 自動記錄；「反向」是切換鈕、拖曳位置不在控制項裡，這裡自己記
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const A = state.A;
      return { fl: A.flipped ? 1 : 0, x: state.mode === 'A' && A.motion === 'drag' ? Math.round(A.target * 1e4) / 1e4 : null };
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const A = state.A;
      if ((o.fl === 1 || o.fl === true) !== A.flipped) $('flip').click();
      const x = Number(o.x);
      if (o.x != null && isFinite(x) && state.mode === 'A' && A.motion === 'drag') {
        A.dx = A.target = A.x0run = clamp(x, -dragLimit(), dragLimit());
        A.dv = 0;
        A.stillFor = 0;
        A.dragPeakI = 0;
        state.hist = [];
        state.t = 0;
        computeScale();
        requestDraw();
      }
    }
  });

  // ---------- 無障礙：讀數播報 ----------
  // 一次通過結束、導體棒停下等結果寫在看得見的 #status（aria-live）；
  // 改參數後的預測（停止調整約 0.9 s 後）寫進 .sr-only 的 #srSay；播放中的讀數每 1.5 s 寫進 #srNow
  let sayTimer = 0, sayParamTimer = 0, srNowAt = -1e9;
  function srSay(msg) {
    const el = $('srSay');
    if (!el || !msg) return;
    clearTimeout(sayTimer);
    el.textContent = '';
    sayTimer = setTimeout(function () { el.textContent = msg; }, 60); // 先清空再寫，同樣的字也會再念一次
  }
  function predictionText() {
    if (state.mode === 'A') {
      const A = state.A;
      if (A.motion === 'pass') {
        const sum = FC.passSummary(pA(), A.v, A.dir);
        return T('預測：磁鐵以 ' + num(A.v, 2) + ' m/s 穿過 ' + A.N + ' 匝線圈，最大感應電動勢 ' + num(sum.epsPeak, 3) + ' V，最大電流 ' + num(sum.IPeak * 1e3, 2) + ' mA，進入時流過的電量 ' + num(Math.abs(sum.qHalf) * 1e3, 3) + ' mC。',
          'Prediction: the magnet passes through the ' + A.N + '-turn coil at ' + num(A.v, 2) + ' m/s; peak emf ' + num(sum.epsPeak, 3) + ' V, peak current ' + num(sum.IPeak * 1e3, 2) + ' mA, charge while entering ' + num(Math.abs(sum.qHalf) * 1e3, 3) + ' mC.');
      }
      if (A.motion === 'osc') {
        const pk = FC.oscPeak(pA(), A.f);
        return T('預測：磁鐵以 ' + num(A.f, 2) + ' Hz 來回振盪，最大感應電動勢 ' + num(pk, 3) + ' V，最大電流 ' + num(pk / A.R * 1e3, 2) + ' mA。',
          'Prediction: the magnet oscillates at ' + num(A.f, 2) + ' Hz; peak emf ' + num(pk, 3) + ' V, peak current ' + num(pk / A.R * 1e3, 2) + ' mA.');
      }
      return T('用手拖曳：用滑鼠或手指拖磁鐵，或聚焦畫布後按方向鍵移動磁鐵。', 'Drag by hand: drag the magnet, or focus the canvas and use the arrow keys to move it.');
    }
    const B = state.B, p = pB(), d = FC.rodDerived(p);
    if (B.sub === 'release') {
      const xs = FC.RAIL.x0 + B.v0 * d.tau;
      return T('預測：放開後時間常數 τ = ' + num(d.tau, 3) + ' s，' + (xs < FC.RAIL.D ? '導體棒會停在 x = ' + num(xs, 3) + ' m。' : '導體棒會先撞到軌道末端。'),
        'Prediction: after letting go the time constant is τ = ' + num(d.tau, 3) + ' s; ' + (xs < FC.RAIL.D ? 'the rod stops at x = ' + num(xs, 3) + ' m.' : 'the rod reaches the end of the rails first.'));
    }
    if (B.sub === 'force') {
      return T('預測：固定外力 ' + num(B.F, 2) + ' N，終端速度 ' + num(d.vt, 3) + ' m/s，時間常數 τ = ' + num(d.tau, 3) + ' s。',
        'Prediction: with a constant force of ' + num(B.F, 2) + ' N the terminal speed is ' + num(d.vt, 3) + ' m/s, time constant τ = ' + num(d.tau, 3) + ' s.');
    }
    const eps = B.B * B.L * B.v0;
    return T('預測：等速 ' + num(B.v0, 2) + ' m/s，感應電動勢 BLv = ' + num(eps, 3) + ' V，電流 ' + num(eps / B.R, 3) + ' A。',
      'Prediction: at a steady ' + num(B.v0, 2) + ' m/s the induced emf is BLv = ' + num(eps, 3) + ' V and the current is ' + num(eps / B.R, 3) + ' A.');
  }
  function sayPrediction() {
    clearTimeout(sayParamTimer);
    sayParamTimer = setTimeout(function () { srSay(predictionText()); }, 900);
  }
  Object.keys(elsA).forEach(function (k) { elsA[k].addEventListener('input', sayPrediction); });
  Object.keys(elsB).forEach(function (k) { elsB[k].addEventListener('input', function () { sayPrediction(); syncKbItems(); }); });
  ['modeA', 'modeB', 'mvPass', 'mvOsc', 'mvDrag', 'dirR', 'dirL', 'flip', 'subConst', 'subForce', 'subRelease', 'bIn', 'bOut'].forEach(function (id) {
    $(id).addEventListener('click', sayPrediction);
  });
  /** 播放中的讀數（每 1.5 s 最多一次） */
  function srNowTick(s) {
    const now = performance.now();
    if (now - srNowAt < 1500) return;
    srNowAt = now;
    const el = $('srNow');
    if (!el) return;
    el.textContent = state.mode === 'A'
      ? 't = ' + num(state.t, 1) + ' s' + T('，磁鐵 x = ', ', magnet x = ') + num(s.x * 100, 1) + ' cm' + T('，ε = ', ', emf = ') + num(s.eps, 3) + ' V' + T('，I = ', ', I = ') + num(s.I * 1e3, 2) + ' mA'
      : 't = ' + num(Math.min(state.t, state.B.tEnd), 1) + ' s' + T('，x = ', ', x = ') + num(s.x, 2) + ' m' + T('，v = ', ', v = ') + num(s.v, 2) + ' m/s' + T('，I = ', ', I = ') + num(state.B.Bsign * s.I, 3) + ' A';
  }

  // =====================================================================
  // 3D 檢視（js/faraday-3d.js 與 three.js 都在切換到 3D 時才動態載入）
  // 3D 畫布蓋在 2D 畫布的實驗畫面區（L.S）上，右側（或下方）的 Φ、ε、I 圖表照常由 2D 畫布畫。
  // =====================================================================
  let threeLib = null, loadToken = 0;
  const stageEl = cv.closest('.stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function place3() {
    if (!L) return;
    const S = L.S;
    host3.style.left = S.x + 'px';
    host3.style.top = S.y + 'px';
    host3.style.width = S.w + 'px';
    host3.style.height = S.h + 'px';
  }
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = function () { reject(new Error('cannot load ' + src)); };
      document.head.appendChild(el);
    });
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const mod3 = window.Faraday3D ? Promise.resolve() : loadScript(new URL('js/faraday-3d.js' + SELF_VER, document.baseURI).href);
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), mod3]).then(function (mods) {
      if (!window.Faraday3D) throw new Error('Faraday3D missing');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  /** 給 3D 檢視讀取狀態、操作磁鐵的介面（3D 只負責畫，物理量全部來自這裡） */
  const bridge3 = {
    FC: FC, T: T, state: state, LINES: LINES,
    SCALE_VA: SCALE_VA, SCALE_VB: SCALE_VB, SCALE_FB: SCALE_FB, SLOW: SLOW,
    colors: function () { return colors; },
    scale: function () { return state.scale; },
    pB: pB,
    num: num, rangeText: function (r) { return rangeText(r); }, circText: function (c) { return circText(c); },
    grabMagnet: function (xp) { grabMagnet(xp); },
    moveMagnet: function (xp) { moveMagnet(xp); },
    endDrag: function () { endDrag(); },
    setHover: function (h) { if (state.A.hover !== h) { state.A.hover = h; requestDraw(); } },
    lost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (is3D()) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return; // 載入期間已切回 2D
        stageEl.classList.add('is3d');
        view3 = window.Faraday3D.create(lib, host3, bridge3);
        state.A.hover = false;
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        resize(); // 手機上實驗畫面改成正方形，並把 3D 畫布放到實驗畫面區
        requestAnimationFrame(function () { if (is3D()) draw(); });
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stageEl.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      state.A.hover = false;
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stageEl.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 啟動 ----------
  readColors();
  readSliders();
  refreshOutputs();
  restartRun(state.running);
  function themeChanged() { readColors(); if (L) buildBackground(); if (is3D()) view3.onTheme(); syncKbItems(); requestDraw(); }
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
