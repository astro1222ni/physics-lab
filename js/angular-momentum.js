/* angular-momentum.js — 「角動量守恆」模組的畫面與互動
 * 物理計算在 angular-momentum-core.js（AngMomCore）；共用繪圖工具 LabDraw 在 drawkit.js；
 * 3D 檢視在 angular-momentum-3d.js（three.js 切換到 3D 時才以 import() 載入）。 */
(function () {
  'use strict';
  const C = window.AngMomCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = D.reducedMotion();
  const alpha = D.alpha, shade = D.shade, mix = D.mix;

  // ---------- 固定的畫面比例與常數（畫面上都有說明） ----------
  const SLOW = 0.25;
  const VIEW = { hole: 2.1, plat: 1.05, disk: 0.34 };   // m：主畫面中心到邊緣
  const SCALE_V = 0.3, SCALE_T = 0.25, MAX_ARROW = 1.5; // 模式一：速度每 1 m/s 畫 0.3 m、張力每 1 N 畫 0.25 m
  const SCALE_VD = 0.15;                                // 模式二：啞鈴速度每 1 m/s 畫 0.15 m
  const TARGET = { x: -1.5, y: 1.1, r: 0.05 };          // 目標靶（m）
  const BODY = { sx: 0.19, sy: 1.42, upper: 0.34, fore: 0.39, platTop: 0.12, head: 1.63 }; // 人的尺寸（m，平台面以上）
  const STRIP_WIN = 12;                                 // s：下方時間圖的視窗

  // ---------- 狀態 ----------
  const S = { mode: 'hole', running: !reducedMotion, slow: false, fx: [] };
  const H = { st: null, p: null, hist: [], graph: [], vr: [], dtA: 1, nextMark: 0, markIdx: 0, exited: false, lastSample: -1,
    show: { v: true, T: true, trail: true, area: true, target: false } };
  const P = { p: { Mb: 60, md: 2 }, rOut: 0.75, rIn: 0.2, w1: 2, t: 0, phi: 0, r: 0.75, L: 0, mv: null, armsIn: false, drop: null,
    graph: [], ref: null, lastSample: -1, show: { vd: true, ring: true } };
  const K = { p: null, t: 0, ph: 'held', tDrop: 0, tContact: 0, a1: 0, a2: 0, c1: 0, c2: 0, res: null, graph: [], lastSample: -1, emitted: false,
    show: { w: true, fr: true } };

  // ---------- 顏色 ----------
  let col = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface', '--pos', '--neg', '--equi', '--field', '--probe',
      '--b-mech', '--b-optics', '--b-thermo', '--b-wave']
      .forEach(function (k) { col[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    col.dark = D.dark;
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function fsk() { const f = window.LabSettings ? +window.LabSettings.get('fs') || 1 : 1; return 1 + (f - 1) * 0.7; }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function sig(v, n) { // 有效位數
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(v))));
    return num(v, Math.min(d, 6));
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s.replace('-', '−');
  }
  function niceCeil(v) {
    if (!(v > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (let i = 0; i < steps.length; i++) if (f <= steps[i] + 1e-9) return steps[i] * e;
    return 10 * e;
  }
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, Lo = null;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');
  const RAD = 9;

  function layout() {
    const narrow = cw < 560, gap = narrow ? 6 : 8;
    if (!narrow) {
      const Sm = Math.round(cw * 0.56), rw = cw - Sm - gap, ah = Math.round(Sm * 0.47);
      const Hb = Math.round(Math.max(150, cw * 0.22));
      return { narrow: narrow, gap: gap, main: { x: 0, y: 0, w: Sm, h: Sm }, A: { x: Sm + gap, y: 0, w: rw, h: ah },
        B: { x: Sm + gap, y: ah + gap, w: rw, h: Sm - ah - gap }, strip: { x: 0, y: Sm + gap, w: cw, h: Hb }, H: Sm + gap + Hb };
    }
    const Sm = cw, hw = Math.floor((cw - gap) / 2), ah = Math.round(cw * 0.62), Hb = Math.round(cw * 0.47);
    return { narrow: narrow, gap: gap, main: { x: 0, y: 0, w: Sm, h: Sm }, A: { x: 0, y: Sm + gap, w: hw, h: ah },
      B: { x: hw + gap, y: Sm + gap, w: cw - hw - gap, h: ah }, strip: { x: 0, y: Sm + gap + ah + gap, w: cw, h: Hb }, H: Sm + gap + ah + gap + Hb };
  }
  /** 主畫面：物理座標（m，y 向上）→ 畫布 */
  function mk() { return Lo.main.w / 2 / VIEW[S.mode]; }
  function MX(x) { return Lo.main.x + Lo.main.w / 2 + x * mk(); }
  function MY(y) { return Lo.main.y + Lo.main.h / 2 - y * mk(); }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    Lo = layout();
    ch = Lo.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    bgKey = '';
    draw();
  }

  // ---------- 繪圖小工具 ----------
  function snapPx(v) { return (Math.round(v * dpr) + 0.5) / dpr; }
  function clipPanel(c, R) { D.roundRect(c, R.x, R.y, R.w, R.h, RAD); c.clip(); }
  function tag(c, text, x, yc, color, align, font) {
    c.font = font;
    const h = D.textHeight(c.measureText(text), 15) + 3;
    return D.pill(c, text, x, yc + h / 2, color, align, font);
  }
  function pillW(c, text, font) { c.font = font; return c.measureText(text).width + 12; }
  /** 長條圖上並排兩根長條的數值：太擠時把較高那根的數值往上錯開一行，不互相重疊 */
  function pairValues(c, a, b, font) {
    c.font = font;
    const wa = c.measureText(a.t).width, wb = c.measureText(b.t).width, gap = 11;
    if ((wa + wb) / 2 + 3 > Math.abs(b.x - a.x) && Math.abs(a.y - b.y) < gap) {
      if (a.y <= b.y) a.y = b.y - gap; else b.y = a.y - gap;
    }
    [a, b].forEach(function (o) { D.haloText(c, o.t, o.x, o.y, col.text, 'center', 'bottom', font); });
  }
  /** 一行混合字型（斜體物理量、上標、下標），垂直置中於 y；parts：[{ t, it, sup, sub }] */
  function runs(c, parts, x, y, color, px, weight, align) {
    const k = fsk();
    const items = parts.filter(Boolean).map(function (pt) {
      const f = fnt(pt.sup || pt.sub ? +(px * 0.72).toFixed(1) : px, weight, pt.it);
      c.font = f;
      return { pt: pt, f: f, w: c.measureText(pt.t).width + (pt.it ? 1 : 0.3) };
    });
    const total = items.reduce(function (a, b) { return a + b.w; }, 0);
    let xx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    items.forEach(function (it) {
      const dy = it.pt.sup ? -px * k * 0.32 : it.pt.sub ? px * k * 0.22 : 0;
      D.haloText(c, it.pt.t, xx, y + dy, color, 'left', 'middle', it.f);
      xx += it.w;
    });
    return total;
  }
  function lightToShade(g, hi, lo, mid) {
    g.addColorStop(0, 'rgba(255,255,255,' + hi + ')');
    g.addColorStop(mid, 'rgba(255,255,255,0)');
    g.addColorStop(mid, D.shadowInk(0));
    g.addColorStop(1, D.shadowInk(lo));
  }
  /** 截短記號：箭身中段兩條斜線 */
  function breakMark(x0, y0, ux, uy, len, lw, color) {
    const nx = -uy, ny = ux, mx = x0 + ux * len * 0.5, my = y0 + uy * len * 0.5, s = 2.2 * lw;
    ctx.save();
    ctx.lineCap = 'butt'; ctx.strokeStyle = col['canvas-bg']; ctx.lineWidth = lw + 3;
    ctx.beginPath(); ctx.moveTo(mx - ux * 3, my - uy * 3); ctx.lineTo(mx + ux * 3, my + uy * 3); ctx.stroke();
    ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    ctx.beginPath();
    [-3, 3].forEach(function (o) {
      const bx = mx + ux * o, by = my + uy * o;
      ctx.moveTo(bx - nx * s + ux * 2, by - ny * s + uy * 2); ctx.lineTo(bx + nx * s - ux * 2, by + ny * s - uy * 2);
    });
    ctx.stroke(); ctx.restore();
  }
  /** 固定比例的向量箭頭（太長截短並標 ≈）：(x0, y0) 起點（px），(ux, uy) 畫布方向，lenM 物理長度（m），k px/m */
  function vecArrow(x0, y0, ux, uy, lenM, k, maxM, color, lw, label, sub) {
    if (!(lenM > 0)) return;
    const over = lenM > maxM, len = Math.min(lenM, maxM) * k;
    if (len < 3) return;
    D.arrow(ctx, x0, y0, x0 + ux * len, y0 + uy * len, color, lw);
    if (over) breakMark(x0, y0, ux, uy, len, lw, color);
    if (label) {
      const lx = x0 + ux * (len + 12), ly = y0 + uy * (len + 12);
      D.vecLabel(ctx, label + (over ? ' ≈' : ''), sub, lx, ly, color);
    }
  }
  /** 彎曲的轉動箭頭（畫布座標，逆時針為正的角度 a0 → a1，以數學方向計） */
  function arcArrow(c, cx, cy, rad, a0, a1, color, lw) {
    if (Math.abs(a1 - a0) < 0.05) return;
    const ccw = a1 > a0;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = alpha(col['canvas-bg'], 0.75); c.lineWidth = lw + 3;
    c.beginPath(); c.arc(cx, cy, rad, -a0, -a1 + (ccw ? 0.12 : -0.12) * 0, ccw); c.stroke();
    c.strokeStyle = color; c.lineWidth = lw;
    c.beginPath(); c.arc(cx, cy, rad, -a0, -a1, ccw); c.stroke();
    // 箭頭
    const ex = cx + rad * Math.cos(a1), ey = cy - rad * Math.sin(a1);
    const tx = (ccw ? -1 : 1) * Math.sin(a1), ty = (ccw ? -1 : 1) * Math.cos(a1); // 畫布中的切線方向
    const hl = 4 + lw * 2.2, hw = 2 + lw * 1.1;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(ex + tx * hl * 0.55, ey + ty * hl * 0.55);
    c.lineTo(ex - tx * hl * 0.45 - ty * hw, ey - ty * hl * 0.45 + tx * hw);
    c.lineTo(ex - tx * hl * 0.45 + ty * hw, ey - ty * hl * 0.45 - tx * hw);
    c.closePath(); c.fill();
    c.restore();
  }
  /** ⊙（指出畫面）的向量符號 */
  function outOfPage(c, x, y, r, color) {
    c.save();
    c.fillStyle = alpha(col['canvas-bg'], 0.9);
    c.beginPath(); c.arc(x, y, r + 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = color; c.lineWidth = 1.8;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.fillStyle = color;
    c.beginPath(); c.arc(x, y, Math.max(1.8, r * 0.3), 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // ---------- 不變的圖層（尺寸、主題、模式改變時重畫） ----------
  let bgKey = '';
  function bgKeyNow() { return [cw, ch, dpr, D.ver, S.mode, col.dark].join('|'); }
  function buildBackground() {
    bgKey = bgKeyNow();
    bg.width = cv.width; bg.height = cv.height;
    const c = bgctx, dark = col.dark, base = col['canvas-bg'];
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    c.fillStyle = dark ? shade(base, -0.4) : mix(base, col.text, 0.06);
    c.fillRect(0, 0, cw, ch);
    const panels = [Lo.main, Lo.A, Lo.B, Lo.strip];
    panels.forEach(function (R) {
      c.save();
      c.shadowColor = dark ? 'rgba(0,0,0,0.55)' : alpha(col.text, 0.16);
      c.shadowBlur = 7; c.shadowOffsetY = 2;
      D.roundRect(c, R.x, R.y, R.w, R.h, RAD); c.fillStyle = base; c.fill();
      c.restore();
    });
    panels.forEach(function (R) {
      D.roundRect(c, R.x, R.y, R.w, R.h, RAD);
      c.fillStyle = base; c.fill();
      const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
      lightToShade(g, dark ? 0.03 : 0.6, dark ? 0.16 : 0.03, 0.45);
      c.fillStyle = g; c.fill();
    });
    // 主畫面：暈影、格線
    const M = Lo.main, k = mk(), cx = M.x + M.w / 2, cy = M.y + M.h / 2;
    c.save();
    clipPanel(c, M);
    const vg = c.createRadialGradient(cx, cy * 0.92, M.w * 0.1, cx, cy, M.w * 0.8);
    lightToShade(vg, dark ? 0.035 : 0.5, dark ? 0.28 : 0.055, 0.4);
    c.fillStyle = vg; c.fillRect(M.x, M.y, M.w, M.h);
    if (S.mode === 'hole') {
      // 光滑桌面：極淡的木紋色調＋格線（每 1 m、每 0.2 m）
      const tg = c.createRadialGradient(cx, cy, 0, cx, cy, M.w * 0.75);
      tg.addColorStop(0, alpha(col.equi, dark ? 0.05 : 0.045));
      tg.addColorStop(1, alpha(col.equi, dark ? 0.015 : 0.012));
      c.fillStyle = tg; c.fillRect(M.x, M.y, M.w, M.h);
      D.grid(c, M.x, M.y, M.x + M.w, M.y + M.h, k, k * 0.2, cx, cy);
      // 座標軸（細）與 ±1、±2 m 的刻度
      c.strokeStyle = alpha(col.muted, 0.45); c.lineWidth = 1;
      c.beginPath(); c.moveTo(M.x + 4, snapPx(cy)); c.lineTo(M.x + M.w - 4, snapPx(cy)); c.moveTo(snapPx(cx), M.y + 4); c.lineTo(snapPx(cx), M.y + M.h - 4); c.stroke();
      const fT = fnt(Lo.narrow ? 10 : 11);
      [-2, -1, 1, 2].forEach(function (d) {
        D.haloText(c, num(d, 0), cx + d * k, cy + 5, col.muted, 'center', 'top', fT);
        D.haloText(c, num(d, 0), cx + 5, cy - d * k, col.muted, 'left', 'middle', fT);
      });
      D.haloText(c, 'x (m)', M.x + M.w - 6, cy - 6, col.muted, 'right', 'bottom', fnt(Lo.narrow ? 10.5 : 11.5, 600));
      D.haloText(c, 'y (m)', cx + 7, M.y + 6, col.muted, 'left', 'top', fnt(Lo.narrow ? 10.5 : 11.5, 600));
    } else if (S.mode === 'plat') {
      // 地板：每 0.5 m 的地磚縫
      D.grid(c, M.x, M.y, M.x + M.w, M.y + M.h, k * 0.5, k * 0.1, cx, cy);
    } else {
      D.grid(c, M.x, M.y, M.x + M.w, M.y + M.h, k * 0.1, k * 0.02, cx, cy);
    }
    c.restore();
  }

  // =====================================================================
  // 模式一：穿過小孔的繩子
  // =====================================================================
  function holeParams() { return { m: val($('m1')), r0: val($('r0')), v0: val($('v0')) }; }
  function holeReset(keepAngle) {
    const th = keepAngle && H.st && H.st.phase === 'hold' ? H.st.th : 0;
    H.p = holeParams();
    H.st = C.holeCreate(Object.assign({ theta0: th }, H.p));
    H.dtA = (2 * Math.PI * H.p.r0 / H.p.v0) / 12;
    H.hist = []; H.graph = []; H.vr = [];
    H.nextMark = H.dtA; H.markIdx = 0; H.exited = false; H.lastSample = -1;
    H.handDepth = null;
    pushHist(true);
    sampleHole(true);
    recHole('start', T('起始', 'Start'));
  }
  function pushHist(mark) {
    const k = C.holeKin(H.st);
    H.hist.push({ t: H.st.t, x: k.x, y: k.y, mk: !!mark });
    // 保留：最近 6 個扇形或 12 秒（取長者），最多 6000 點
    const keep = Math.max(7 * H.dtA, 12);
    while (H.hist.length > 6000 || (H.hist.length > 2 && H.st.t - H.hist[0].t > keep)) H.hist.shift();
  }
  function sampleHole(force) {
    if (!force && H.st.t - H.lastSample < 1 / 30) return;
    H.lastSample = H.st.t;
    const k = C.holeKin(H.st), L0 = H.st.L0, K0 = H.st.K0;
    H.graph.push({ t: H.st.t, L: k.L / L0, K: k.K / K0, W: (K0 + k.W) / K0 });
    if (H.graph.length > 4000) H.graph.shift();
    H.vr.push([k.r, k.v]);
    if (H.vr.length > 3000) H.vr.shift();
  }
  /** 推進模式一 dt 秒（物理時間），處理等時間標記、取樣與事件 */
  function holeStep(dt) {
    let rem = dt;
    while (rem > 1e-12) {
      const om = Math.abs(H.st.om) || 0;
      const toMark = H.nextMark - H.st.t;
      const d = Math.min(rem, Math.max(1e-9, toMark), 1 / 120, om > 0 ? 0.04 / om : 1);
      const ev = C.holeAdvance(H.st, d);
      rem -= d;
      let marked = false;
      if (H.st.t >= H.nextMark - 1e-9) { marked = true; H.markIdx++; H.nextMark = (H.markIdx + 1) * H.dtA; }
      pushHist(marked);
      sampleHole(false);
      ev.forEach(holeEvent);
      if (H.st.phase === 'free' && !H.exited) {
        const k = C.holeKin(H.st), out = VIEW.hole + 0.06;
        if (Math.abs(k.x) > out || Math.abs(k.y) > out) { holeExit(); return; }
      }
    }
  }
  function holeEvent(e) {
    if (e.type === 'arrive') {
      const ms = H.st.moveStart, k = C.holeKin(H.st);
      const pull = H.st.r < ms.r;
      setStatus(pull
        ? T('收繩完成：半徑 ' + num(ms.r, 2) + ' → ' + num(H.st.r, 2) + ' m，速率 ×' + num(ms.r / H.st.r, 2) + '、角速度 ×' + num(H.st.om / ms.om, 2) + '，L 不變。',
          'Done: radius ' + num(ms.r, 2) + ' → ' + num(H.st.r, 2) + ' m, speed ×' + num(ms.r / H.st.r, 2) + ', angular speed ×' + num(H.st.om / ms.om, 2) + ', L unchanged.')
        : T('放繩完成：半徑 ' + num(ms.r, 2) + ' → ' + num(H.st.r, 2) + ' m，速率變成 ' + num(ms.r / H.st.r, 2) + ' 倍。',
          'Done: radius ' + num(ms.r, 2) + ' → ' + num(H.st.r, 2) + ' m; the speed is now ' + num(ms.r / H.st.r, 2) + ' times as large.'));
      recHole('move', pull ? T('收繩', 'Pulled in') : T('放繩', 'Let out'));
      emit('arrive', {
        m: H.st.m, r0: ms.r, r1: H.st.r, v0: ms.r * ms.om, v1: k.v, w0: ms.om, w1: H.st.om, K0: ms.K, K1: k.K,
        W: H.st.W - ms.W, T1: k.T, L: k.L, u: val($('u'))
      });
      updateButtons();
    } else if (e.type === 'snap') {
      const k = C.holeKin(H.st);
      snapSound();
      if (!reducedMotion) S.fx.push({ type: 'snap', x: k.x, y: k.y, t0: performance.now(), dur: 420, a0: Math.random() * Math.PI });
      setStatus(T('繩子斷了！張力超過 30 N。小球沿當時的速度方向直線飛出，角動量仍然不變。',
        'The string broke! The tension went over 30 N. The ball flies off in a straight line along its velocity at that instant — its angular momentum is still the same.'));
      H.handDepth = C.HOLE.rope - H.st.free.r;
      recHole('free', T('繩斷', 'String broke'));
      emit('snap', { T: e.T, r: k.r, v: k.v, L: k.L, m: H.st.m });
      updateButtons();
    }
  }
  function holeExit() {
    H.exited = true;
    S.running = false;
    const f = H.st.free, q = C.freeClosest(f, TARGET.x, TARGET.y), k = C.holeKin(H.st);
    const hit = q.miss <= TARGET.r;
    setStatus(hit
      ? T('命中目標靶！（偏差 ' + num(q.miss * 100, 1) + ' cm）小球沿直線滑出桌面。按「重新開始」再試一次。', 'Bullseye! (missed by ' + num(q.miss * 100, 1) + ' cm) The ball slid off the table in a straight line. Press “Start again” to try again.')
      : T('小球沿直線等速滑出桌面：力臂 r⊥ = ' + num(k.rperp, 3) + ' m 一直不變，所以 L 也不變。按「重新開始」再試一次。',
        'The ball slid off the table in a straight line at constant speed: the lever arm r⊥ = ' + num(k.rperp, 3) + ' m never changed, so neither did L. Press “Start again” to try again.'));
    emit('exit', {
      why: f.why, m: H.st.m, r: f.r, x0: f.x, y0: f.y, vx: f.vx, vy: f.vy, v: Math.hypot(f.vx, f.vy),
      vr: (f.x * f.vx + f.y * f.vy) / Math.hypot(f.x, f.y), rperp: k.rperp, L: k.L, miss: q.miss, tau: q.tau
    });
    updateButtons();
  }

  function drawHoleMain() {
    const M = Lo.main, k = mk(), st = H.st, kin = C.holeKin(st), dark = col.dark;
    const hx = MX(0), hy = MY(0);
    const free = st.phase === 'free';
    ctx.save();
    clipPanel(ctx, M);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // 目標靶
    if (H.show.target) {
      const tx = MX(TARGET.x), ty = MY(TARGET.y), tr = Math.max(TARGET.r * k, 6);
      [[2.6, 0.05], [1.8, 0.09], [1, 0.16]].forEach(function (rg, i) {
        ctx.fillStyle = alpha(i % 2 ? col['canvas-bg'] : col.pos, i === 2 ? 0.75 : rg[1] + (dark ? 0.06 : 0.04));
        ctx.beginPath(); ctx.arc(tx, ty, tr * rg[0], 0, Math.PI * 2); ctx.fill();
      });
      ctx.strokeStyle = alpha(col.pos, 0.8); ctx.lineWidth = 1.4;
      [1, 1.8, 2.6].forEach(function (s) { ctx.beginPath(); ctx.arc(tx, ty, tr * s, 0, Math.PI * 2); ctx.stroke(); });
      ctx.fillStyle = col.pos; ctx.beginPath(); ctx.arc(tx, ty, 1.8, 0, Math.PI * 2); ctx.fill();
      // 標籤不超出畫面左右邊緣（窄螢幕時靶靠近左邊）
      const tgF = fnt(Lo.narrow ? 10.5 : 11.5, 600), tgT = T('目標', 'Target') + ' (−1.50, 1.10)', tgW = pillW(ctx, tgT, tgF);
      const tgX = Math.max(M.x + 6 + tgW / 2, Math.min(M.x + M.w - 6 - tgW / 2, tx));
      tag(ctx, tgT, tgX, ty - tr * 2.6 - 12, col.pos, 'center', tgF);
    }

    // 等時間掃過的面積：最近 6 個扇形（數值面積由實際路徑的多邊形算出）
    const areaLabels = [];
    if (H.show.area) {
      const marks = [];
      H.hist.forEach(function (p, i) { if (p.mk) marks.push(i); });
      const first = Math.max(0, marks.length - 6);
      for (let j = first; j < marks.length; j++) {
        const i0 = marks[j], i1 = j + 1 < marks.length ? marks[j + 1] : H.hist.length - 1;
        if (i1 - i0 < 1) continue;
        const complete = j + 1 < marks.length;
        const poly = [[0, 0]];
        let span = 0, prevA = Math.atan2(H.hist[i0].y, H.hist[i0].x);
        for (let i = i0; i <= i1; i++) {
          poly.push([H.hist[i].x, H.hist[i].y]);
          const a = Math.atan2(H.hist[i].y, H.hist[i].x);
          let da = a - prevA; da -= 2 * Math.PI * Math.round(da / (2 * Math.PI)); span += da; prevA = a;
        }
        if (span > 5.6) continue; // 轉超過一圈的扇形會自己重疊，不畫
        const age = (marks.length - 1 - j) / 6;
        const cc = (H.markIdx - (marks.length - 1 - j)) % 2 ? col.equi : col.accent;
        ctx.beginPath();
        ctx.moveTo(MX(0), MY(0));
        for (let i = 1; i < poly.length; i++) ctx.lineTo(MX(poly[i][0]), MY(poly[i][1]));
        ctx.closePath();
        ctx.fillStyle = alpha(cc, (dark ? 0.2 : 0.15) * (1 - 0.55 * age) * (complete ? 1 : 0.7));
        ctx.fill();
        ctx.strokeStyle = alpha(cc, (dark ? 0.5 : 0.45) * (1 - 0.5 * age));
        ctx.lineWidth = 1;
        ctx.stroke();
        if (complete && marks.length - 1 - j <= 2) {
          // 標籤放在扇形的形心附近
          let gx = 0, gy = 0, A = 0;
          for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q = poly[(i + 1) % poly.length], cr = p[0] * q[1] - q[0] * p[1];
            A += cr; gx += (p[0] + q[0]) * cr; gy += (p[1] + q[1]) * cr;
          }
          if (Math.abs(A) > 1e-9) areaLabels.push({ x: gx / (3 * A), y: gy / (3 * A), A: Math.abs(A / 2), c: cc });
        }
      }
    }

    // 漸淡的軌跡
    if (H.show.trail && H.hist.length > 1) {
      const per = st.phase === 'free' ? 30 : 2 * Math.PI / Math.max(1e-6, Math.abs(st.om));
      const span = Math.min(10, Math.max(1.5, per));
      const t0 = st.t - span;
      const pts = [];
      for (let i = 0; i < H.hist.length; i++) if (H.hist[i].t >= t0 || (free && H.hist[i].t >= st.free.t0 - 0.2)) pts.push(H.hist[i]);
      const N = pts.length;
      if (N > 1) {
        const hi = shade(col.accent, dark ? 0.45 : 0.6);
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 1; i < N; i++) {
            let u = (pts[i].t - t0) / span; u = Math.max(0, Math.min(1, u));
            if (free && pts[i].t >= st.free.t0) u = Math.max(u, 0.85);
            if (pass === 0) { ctx.strokeStyle = alpha(col.accent, (dark ? 0.16 : 0.1) * u * u); ctx.lineWidth = 3 + 6 * u; }
            else if (pass === 1) { ctx.strokeStyle = alpha(col.accent, 0.08 + 0.62 * u * u); ctx.lineWidth = 1 + 3 * u; }
            else { if (u < 0.35) continue; ctx.strokeStyle = alpha(hi, 0.55 * u * u); ctx.lineWidth = 0.6 + 0.8 * u; }
            ctx.beginPath(); ctx.moveTo(MX(pts[i - 1].x), MY(pts[i - 1].y)); ctx.lineTo(MX(pts[i].x), MY(pts[i].y)); ctx.stroke();
          }
        }
      }
    }

    // 鬆手後：直線的延長（虛線）與力臂 r⊥
    if (free) {
      const f = st.free, sp = Math.hypot(f.vx, f.vy);
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = alpha(col.pos, 0.5); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(MX(f.x - f.vx / sp * 6), MY(f.y - f.vy / sp * 6)); ctx.lineTo(MX(f.x + f.vx / sp * 6), MY(f.y + f.vy / sp * 6)); ctx.stroke();
      // 垂足
      const tau = -(f.x * f.vx + f.y * f.vy) / (sp * sp);
      const fx = f.x + f.vx * tau, fy = f.y + f.vy * tau;
      ctx.strokeStyle = alpha(col.neg, 0.8); ctx.lineWidth = 1.4; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(MX(fx), MY(fy)); ctx.stroke();
      ctx.setLineDash([]);
      // 直角記號
      const ux = fx / (Math.hypot(fx, fy) || 1), uy = fy / (Math.hypot(fx, fy) || 1), wx = f.vx / sp, wy = f.vy / sp, q = 7;
      ctx.strokeStyle = alpha(col.neg, 0.8); ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MX(fx) - ux * q, MY(fy) + uy * q);
      ctx.lineTo(MX(fx) - ux * q + wx * q, MY(fy) + uy * q - wy * q);
      ctx.lineTo(MX(fx) + wx * q, MY(fy) - wy * q);
      ctx.stroke();
      if (Math.hypot(fx, fy) * k > 26) runs(ctx, [{ t: 'r', it: true }, { t: '⊥', sub: true }], MX(fx / 2) + 6, MY(fy / 2) - 8, col.neg, 13, 600);
    }

    // 小孔（金屬墊圈＋黑洞）
    const holeR = Math.max(4.5, 0.03 * k);
    const ring = ctx.createRadialGradient(hx - 1.5, hy - 1.5, holeR * 0.3, hx, hy, holeR + 4);
    ring.addColorStop(0, shade(col.field, dark ? 0.1 : 0.55));
    ring.addColorStop(0.7, alpha(col.field, dark ? 0.55 : 0.4));
    ring.addColorStop(1, alpha(col.field, 0.05));
    ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(hx, hy, holeR + 4, 0, Math.PI * 2); ctx.fill();
    const hg = ctx.createRadialGradient(hx + 1, hy + 1, 0, hx, hy, holeR);
    hg.addColorStop(0, '#000'); hg.addColorStop(1, dark ? '#20282b' : '#3b4549');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, holeR, 0, Math.PI * 2); ctx.fill();

    // 繩子
    const bx = MX(kin.x), by = MY(kin.y);
    const ropeCol = dark ? shade(col.muted, 0.15) : shade(col.muted, -0.1);
    const ropeW = Lo.narrow ? 2.4 : 2.8;
    if (!free) {
      D.tube(ctx, function (g) { g.moveTo(hx, hy); g.lineTo(bx, by); }, ropeCol, ropeW);
    } else {
      // 鬆開的繩子：拖在小球後面（繩子還沒完全滑出小孔時，從小孔連到小球，鬆鬆的）
      const left = C.HOLE.rope - kin.r;
      const dx = hx - bx, dy = hy - by, dd = Math.hypot(dx, dy) || 1;
      if (left > 0) {
        const mx2 = (hx + bx) / 2 - dy / dd * 8, my2 = (hy + by) / 2 + dx / dd * 8;
        D.tube(ctx, function (g) { g.moveTo(hx, hy); g.quadraticCurveTo(mx2, my2, bx, by); }, alpha(ropeCol, 0.8), ropeW * 0.85);
      } else {
        const tl = Math.min(C.HOLE.rope * k, 60);
        D.tube(ctx, function (g) { g.moveTo(bx, by); g.quadraticCurveTo(bx + dx / dd * tl * 0.5 - dy / dd * 6, by + dy / dd * tl * 0.5 + dx / dd * 6, bx + dx / dd * tl, by + dy / dd * tl); }, alpha(ropeCol, 0.8), ropeW * 0.85);
      }
    }
    // 半徑標籤
    if (!free && kin.r * k > 40) {
      const ux = (bx - hx) / (kin.r * k), uy = (by - hy) / (kin.r * k);
      D.haloText(ctx, 'r', hx + ux * kin.r * k * 0.45 + uy * 11, hy + uy * kin.r * k * 0.45 - ux * 11, col.muted, 'center', 'middle', fnt(13, 600, true));
    }

    // 角動量 L（⊙ 朝上）
    outOfPage(ctx, hx, hy, Math.max(7, holeR + 3), col.neg);
    const fL = fnt(Lo.narrow ? 11 : 12, 600);
    outOfPage(ctx, M.x + M.w - 16, M.y + M.h - 16, 6, col.neg);
    D.haloText(ctx, 'L = ' + sig(kin.L, 3) + ' kg·m²/s', M.x + M.w - 28, M.y + M.h - 16, col.neg, 'right', 'middle', fL);

    // 向量：張力（指向小孔）與速度
    const lw = Lo.narrow ? 2.4 : 2.8;
    const br = Math.max(7, Math.min(11, 0.06 * k));
    if (H.show.T && !free && kin.T > 0 && kin.r > 1e-6) {
      const ux = -(bx - hx) / (kin.r * k), uy = -(by - hy) / (kin.r * k);
      vecArrow(bx + ux * br, by + uy * br, ux, uy, kin.T * SCALE_T, k, Math.min(MAX_ARROW, Math.max(0.05, kin.r - 0.05)), col['b-mech'], lw, 'T');
    }
    if (H.show.v && kin.v > 0) {
      vecArrow(bx, by, kin.vx / kin.v, -kin.vy / kin.v, kin.v * SCALE_V, k, MAX_ARROW, col.pos, lw, 'v');
    }

    // 小球：桌面上的陰影＋立體球
    const sg = ctx.createRadialGradient(bx + br * 0.28, by + br * 0.38, br * 0.4, bx + br * 0.28, by + br * 0.38, br * 1.5);
    sg.addColorStop(0, D.shadowInk(dark ? 0.42 : 0.2)); sg.addColorStop(1, D.shadowInk(0));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(bx + br * 0.28, by + br * 0.38, br * 1.5, 0, Math.PI * 2); ctx.fill();
    D.ball(ctx, bx, by, br, col.accent);

    // 扇形面積的標籤（畫在最上層）
    // 只標最近兩塊，放不下（太靠近小孔、小球、邊緣或彼此重疊）就不標
    const placed = [];
    const fA = fnt(Lo.narrow ? 10 : 11, 600);
    areaLabels.reverse().forEach(function (a) {
      const x = MX(a.x), y = MY(a.y), text = num(a.A * 1e4, 0) + ' cm²', w = pillW(ctx, text, fA);
      if (x < M.x + w / 2 + 6 || x > M.x + M.w - w / 2 - 6 || y < M.y + 30 || y > M.y + M.h - 34) return;
      if (Math.hypot(x - hx, y - hy) < 26 || Math.hypot(x - bx, y - by) < 22) return;
      if (placed.some(function (q) { return Math.abs(q.x - x) < (q.w + w) / 2 + 4 && Math.abs(q.y - y) < 20; })) return;
      placed.push({ x: x, y: y, w: w });
      tag(ctx, text, x, y, shade(a.c, dark ? 0.25 : -0.25), 'center', fA);
    });

    // 文字：時間、慢動作、狀態
    const f1 = fnt(Lo.narrow ? 11.5 : 12.5, 600), f2 = fnt(Lo.narrow ? 10.5 : 11.5, 600);
    tag(ctx, 't = ' + num(st.t, 2) + ' s' + (S.slow ? '  (' + SLOW + '×)' : ''), M.x + 6, M.y + 14, col.text, 'left', f1);
    tag(ctx, T('俯視圖', 'Top view'), M.x + M.w - 6, M.y + 14, col.muted, 'right', f2);
    let stText = '', stCol = col.muted;
    if (st.phase === 'move') { stText = st.pl.sgn < 0 ? T('收繩中 ↓', 'Pulling in ↓') : T('放繩中 ↑', 'Letting out ↑'); stCol = col['b-mech']; }
    else if (free) { stText = st.free.why === 'snap' ? T('繩斷：T = 0', 'String broken: T = 0') : T('鬆手：T = 0', 'Let go: T = 0'); stCol = col.pos; }
    if (stText) tag(ctx, stText, M.x + 6, M.y + M.h - 15, stCol, 'left', f1);
    drawFx();
    ctx.restore();
  }

  /** 側視圖：桌面剖面、小孔、垂下的繩子與手 */
  function drawHoleSide() {
    const R = Lo.A, st = H.st, kin = C.holeKin(st), dark = col.dark, free = st.phase === 'free';
    ctx.save();
    clipPanel(ctx, R);
    const titleF = fnt(Lo.narrow ? 11 : 12.5, 700);
    const top = R.y + 34;
    const k = Math.min((R.w - 16) / 4.3, (R.h - 44) / 2.25);
    const cx = R.x + R.w / 2;
    const X = function (x) { return cx + x * k; }, Y = function (d) { return top + d * k; }; // d：桌面以下的深度（m）
    const thick = Math.max(5, 0.05 * k), gapW = Math.max(3, 0.025 * k);
    // 桌板（左右兩塊，中間是小孔）
    const tw = 2.15 * k;
    D.block(ctx, cx - tw, top, tw - gapW / 2, thick, mix(col.equi, col['canvas-bg'], dark ? 0.55 : 0.35), { r: 2, shadow: true });
    D.block(ctx, cx + gapW / 2, top, tw - gapW / 2, thick, mix(col.equi, col['canvas-bg'], dark ? 0.55 : 0.35), { r: 2, shadow: true });
    // 桌面上的小球（側面看到的是 x 投影）
    const ropeCol = dark ? shade(col.muted, 0.15) : shade(col.muted, -0.1);
    const bx = X(kin.x), br = Math.max(4.5, Math.min(8, 0.06 * k));
    const by = top - br;
    // 垂下的繩子長度
    const hang = free ? Math.max(0, C.HOLE.rope - kin.r) : C.HOLE.rope - kin.r;
    const handY = free ? Y(H.handDepth || (C.HOLE.rope - st.free.r)) : Y(hang);
    if (!free) {
      D.tube(ctx, function (g) { g.moveTo(cx, top - 1); g.lineTo(bx, by + br * 0.4); }, ropeCol, 2.2);
      D.tube(ctx, function (g) { g.moveTo(cx, top); g.lineTo(cx, handY - 4); }, ropeCol, 2.2);
    } else if (hang > 0) {
      D.tube(ctx, function (g) { g.moveTo(cx, top - 1); g.lineTo(bx, by + br * 0.4); }, alpha(ropeCol, 0.75), 2);
      D.tube(ctx, function (g) { g.moveTo(cx, top); g.lineTo(cx, Y(hang)); }, alpha(ropeCol, 0.75), 2);
    }
    // 手
    drawHand(cx, handY, Math.max(7, Math.min(12, k * 0.13)), free);
    if (!free && H.show.T && kin.T > 0) {
      const lenM = kin.T * SCALE_T, maxM = (R.y + R.h - 8 - handY - 14) / k;
      if (maxM > 0.05) {
        ctx.save();
        const over = lenM > maxM, len = Math.min(lenM, maxM) * k;
        // 手往下拉繩子的力（大小等於張力 T），畫在繩子左邊
        D.arrow(ctx, cx - 15, handY + 2, cx - 15, handY + 2 + len, col['b-mech'], 2.2);
        if (over) breakMark(cx - 15, handY + 2, 0, 1, len, 2.2, col['b-mech']);
        D.vecLabel(ctx, 'T' + (over ? ' ≈' : ''), '', cx - 30, handY + 2 + len * 0.55, col['b-mech']);
        ctx.restore();
      }
    }
    D.contactShadow(ctx, bx, top, br, 0);
    D.ball(ctx, bx, by, br, col.accent);
    // 尺寸線：手在桌面下多深（繩子全長 2.3 m 減去桌面上的 r）
    const depth = free ? (H.handDepth || 0) : hang, dx = cx + 22, y0 = top + thick + 2, y1 = handY - 10;
    if (y1 - y0 > 24) {
      ctx.save();
      ctx.strokeStyle = alpha(col.muted, 0.8); ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx - 4, y0); ctx.lineTo(dx + 4, y0); ctx.moveTo(dx, y0); ctx.lineTo(dx, y1); ctx.moveTo(dx - 4, y1); ctx.lineTo(dx + 4, y1);
      ctx.stroke();
      ctx.restore();
      const fD = fnt(Lo.narrow ? 10 : 11, 600);
      D.haloText(ctx, num(depth, 2) + ' m', dx + 6, (y0 + y1) / 2 - 7, col.muted, 'left', 'middle', fD);
      D.haloText(ctx, T('桌面下', 'below'), dx + 6, (y0 + y1) / 2 + 7, col.muted, 'left', 'middle', fD);
    }
    tag(ctx, T('側視圖', 'Side view'), R.x + 6, R.y + 14, col.text, 'left', titleF);
    ctx.restore();
  }
  function drawHand(x, y, s, open) {
    const skin = col.dark ? '#c99a7c' : '#e2b393';
    ctx.save();
    // 前臂（從右下方伸過來）
    D.tube(ctx, function (g) { g.moveTo(x + s * 0.6, y + s * 0.6); g.lineTo(x + s * 3.2, y + s * 2.4); }, shade(skin, -0.12), s * 1.1);
    // 拳頭
    const g = ctx.createRadialGradient(x - s * 0.35, y - s * 0.35, s * 0.1, x, y, s * 1.1);
    g.addColorStop(0, shade(skin, 0.35)); g.addColorStop(0.7, skin); g.addColorStop(1, shade(skin, -0.25));
    ctx.fillStyle = g;
    ctx.beginPath();
    if (open) ctx.ellipse(x + s * 0.2, y + s * 0.15, s * 0.95, s * 0.7, 0.5, 0, Math.PI * 2);
    else ctx.ellipse(x, y, s * 0.85, s * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alpha(shade(skin, -0.45), 0.7); ctx.lineWidth = 1;
    ctx.stroke();
    if (!open) { // 指節
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.moveTo(x - s * 0.55, y + i * s * 0.32); ctx.lineTo(x + s * 0.1, y + i * s * 0.32); }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** v–r 圖：理論曲線 v = L/(mr) 與實際的 (r, v) */
  function drawHoleVR() {
    const R = Lo.B, st = H.st, kin = C.holeKin(st), dark = col.dark;
    ctx.save();
    clipPanel(ctx, R);
    const h = st.L0 / st.m;
    // 上方留給標題列（標題、圖例），縱軸名稱放在標題列下面，不與標題重疊
    const pad = { l: Lo.narrow ? 30 : 36, r: 10, t: 42, b: 26 };
    const x0 = R.x + pad.l, x1 = R.x + R.w - pad.r, y0 = R.y + pad.t, y1 = R.y + R.h - pad.b;
    const rMax = 2.0;
    let vMax = Math.max(H.p.v0 * 1.6, h / 0.6);
    H.vr.forEach(function (p) { vMax = Math.max(vMax, p[1] * 1.1); });
    vMax = niceCeil(vMax);
    const X = function (r) { return x0 + r / rMax * (x1 - x0); }, Y = function (v) { return y1 - v / vMax * (y1 - y0); };
    // 格線與刻度
    const ys = niceStep(vMax / (Lo.narrow ? 3 : 4)), xs = Lo.narrow ? 1 : 0.5;
    ctx.lineWidth = 1 / dpr;
    ctx.beginPath();
    for (let v = 0; v <= vMax + 1e-9; v += ys) { const y = snapPx(Y(v)); ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    for (let r = 0; r <= rMax + 1e-9; r += xs) { const x = snapPx(X(r)); ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    ctx.strokeStyle = alpha(col.text, dark ? 0.11 : 0.1); ctx.stroke();
    ctx.strokeStyle = alpha(col.muted, 0.8); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y1); ctx.lineTo(x1 + 4, y1); ctx.stroke();
    const fT = fnt(Lo.narrow ? 9.5 : 10.5);
    for (let v = 0; v <= vMax + 1e-9; v += ys) D.haloText(ctx, num(v, ys < 1 ? 1 : 0), x0 - 4, Y(v), col.muted, 'right', 'middle', fT);
    for (let r = 0; r <= rMax + 1e-9; r += xs) D.haloText(ctx, num(r, xs < 1 ? 1 : 0), X(r), y1 + 4, col.muted, 'center', 'top', fT);
    D.haloText(ctx, 'r (m)', x1, y1 - 6, col.muted, 'right', 'bottom', fnt(Lo.narrow ? 10 : 11, 600, true));
    // 理論曲線 v = h/r（虛線）
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 2); ctx.clip();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = alpha(col.neg, 0.8); ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 160; i++) {
      const r = Math.max(h / vMax * 0.98, 0.02) + (rMax - h / vMax * 0.98) * i / 160;
      const x = X(r), y = Y(h / r);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
    // 實際的點
    if (H.vr.length > 1) {
      D.tube(ctx, function (g) { H.vr.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); }, col.pos, 2.6);
    }
    ctx.restore();
    D.ball(ctx, X(Math.min(kin.r, rMax)), Y(Math.min(kin.v, vMax)), 5, col.pos, { glow: dark ? 0.4 : 0.15 });
    tag(ctx, T('v–r 圖', 'v–r graph'), R.x + 6, R.y + 14, col.pos, 'left', fnt(Lo.narrow ? 11 : 12.5, 700));
    // 圖例
    const lf = fnt(Lo.narrow ? 9.5 : 10.5, 600);
    const lx = R.x + R.w - 8;
    runs(ctx, [{ t: 'v = ' }, { t: 'L', it: true }, { t: '/(' }, { t: 'mr', it: true }, { t: ')' }], lx, R.y + 14, col.neg, Lo.narrow ? 9.5 : 10.5, 600, 'right');
    D.haloText(ctx, 'v (m/s)', x0 + 4, y0 - 3, col.muted, 'left', 'bottom', lf);
    ctx.restore();
  }

  /** 下方時間圖：L/L0、K/K0、(K0 + W)/K0 */
  function drawRatioStrip(series, title, legend) {
    const R = Lo.strip, dark = col.dark;
    ctx.save();
    clipPanel(ctx, R);
    const tNow = curTime();
    const tL = Math.max(0, tNow - 0.85 * STRIP_WIN), tR = tL + STRIP_WIN;
    const pad = { l: Lo.narrow ? 30 : 38, r: 12, t: 32, b: 24 };
    const x0 = R.x + pad.l, x1 = R.x + R.w - pad.r, y0 = R.y + pad.t, y1 = R.y + R.h - pad.b;
    let yMax = 1.5, yMin = 0;
    series.forEach(function (s) { s.pts.forEach(function (p) { if (p[0] >= tL - 0.1) { yMax = Math.max(yMax, p[1] * 1.1); yMin = Math.min(yMin, p[1] * 1.1); } }); });
    yMax = niceCeil(yMax);
    if (yMin < 0) yMin = -niceCeil(-yMin);
    const X = function (t) { return x0 + (t - tL) / (tR - tL) * (x1 - x0); }, Y = function (v) { return y1 - (v - yMin) / (yMax - yMin) * (y1 - y0); };
    const ys = niceStep((yMax - yMin) / (Lo.narrow ? 3 : 4)), ts = niceStep(STRIP_WIN / (Lo.narrow ? 4 : 8));
    ctx.lineWidth = 1 / dpr;
    ctx.beginPath();
    for (let v = Math.ceil(yMin / ys) * ys; v <= yMax + 1e-9; v += ys) { const y = snapPx(Y(v)); ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    for (let t = Math.ceil(tL / ts) * ts; t <= tR + 1e-9; t += ts) { const x = snapPx(X(t)); ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    ctx.strokeStyle = alpha(col.text, dark ? 0.11 : 0.1); ctx.stroke();
    ctx.strokeStyle = alpha(col.muted, 0.8); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y1); ctx.lineTo(x1 + 4, y1); ctx.stroke();
    if (yMin < 0) { ctx.beginPath(); ctx.moveTo(x0, snapPx(Y(0))); ctx.lineTo(x1, snapPx(Y(0))); ctx.stroke(); }
    const fT = fnt(Lo.narrow ? 9.5 : 10.5);
    for (let v = Math.ceil(yMin / ys) * ys; v <= yMax + 1e-9; v += ys) D.haloText(ctx, num(v, ys < 1 ? 1 : 0), x0 - 4, Y(v), col.muted, 'right', 'middle', fT);
    for (let t = Math.ceil(tL / ts) * ts; t <= tR + 1e-9; t += ts) {
      const x = X(t);
      if (x > x1 - 40) continue;
      D.haloText(ctx, num(t, ts < 1 ? 1 : 0), x, y1 + 4, col.muted, 'center', 'top', fT);
    }
    D.haloText(ctx, 't (s)', x1, y1 + 4, col.muted, 'right', 'top', fnt(Lo.narrow ? 10 : 11, 600, true));
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0 - 3, x1 - x0, y1 - y0 + 6); ctx.clip();
    series.forEach(function (s) {
      const pts = s.pts.filter(function (p) { return p[0] >= tL - 0.2; });
      if (pts.length < 2) return;
      if (s.dash) {
        ctx.setLineDash(s.dash); ctx.strokeStyle = s.color; ctx.lineWidth = s.w || 1.6;
        ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); }); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        D.tube(ctx, function (g) { pts.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); }, s.color, s.w || 3);
      }
      const last = pts[pts.length - 1];
      if (s.dot !== false) D.ball(ctx, X(last[0]), Y(last[1]), 3.6, s.color, { glow: 0, shadow: false });
    });
    ctx.restore();
    tag(ctx, title, R.x + 6, R.y + 14, col.text, 'left', fnt(Lo.narrow ? 11 : 12.5, 700));
    // 圖例（放在標題右邊；放不下就換到第二行）
    const lf = Lo.narrow ? 10 : 11;
    let lx = R.x + 12 + pillW(ctx, title, fnt(Lo.narrow ? 11 : 12.5, 700)) + 8, ly = R.y + 14;
    legend.forEach(function (it) {
      ctx.font = fnt(lf, 600);
      const w = 18 + it.parts.reduce(function (a, p) { ctx.font = fnt(p.sub ? lf * 0.72 : lf, 600, p.it); return a + ctx.measureText(p.t).width + 1; }, 0) + 10;
      if (lx + w > R.x + R.w - 6) { lx = x0 + 4; ly += 18; }
      ctx.strokeStyle = it.color; ctx.lineWidth = it.dash ? 1.6 : 3; ctx.setLineDash(it.dash || []);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 14, ly); ctx.stroke(); ctx.setLineDash([]);
      runs(ctx, it.parts, lx + 18, ly, it.color, lf, 600);
      lx += w;
    });
    ctx.restore();
  }

  function updateHoleReadout() {
    const st = H.st, k = C.holeKin(st);
    const LU = ' kg·m<sup>2</sup>/s';
    setHTML('h_t', num(st.t, 2) + ' s');
    setHTML('h_r', num(k.r, 3) + ' m');
    setHTML('h_v', num(k.v, 3) + ' m/s<small>' + T('切向 ', 'tangential ') + num(k.vt, 3) + T('、徑向 ', ', radial ') + num(k.rd, 3) + ' m/s</small>');
    setHTML('h_w', num(k.om, 3) + ' rad/s');
    setHTML('h_L', num(k.L, 4) + LU + '<small>' + T('相對漂移 ', 'relative drift ') + (Math.abs(k.L / st.L0 - 1) < 1e-12 ? '0' : sig(Math.abs(k.L / st.L0 - 1), 2)) + '</small>');
    setHTML('h_rp', num(k.rperp, 3) + ' m');
    setHTML('h_T', st.phase === 'free' ? '0 N<small>' + T('繩子沒有拉著小球', 'nothing pulls the ball') + '</small>' : num(k.T, 3) + ' N<small>mrω<sup>2</sup> = mv<sub>⊥</sub><sup>2</sup>/r = ' + num(st.m * k.vt * k.vt / k.r, 3) + ' N</small>');
    setHTML('h_K', num(k.K, 4) + ' J<small>' + T('起始 ', 'start ') + num(st.K0, 4) + ' J，ΔK = ' + num(k.K - st.K0, 4) + ' J</small>');
    setHTML('h_W', num(k.W, 4) + ' J');
    setHTML('h_A', num(k.arealRate, 4) + ' m<sup>2</sup>/s<small>= L/(2m)</small>');
  }

  // =====================================================================
  // 模式二：旋轉平台
  // =====================================================================
  function platRead() {
    P.p = { Mb: val($('Mb')), md: val($('md')) };
    P.rOut = val($('rOut')); P.rIn = val($('rIn')); P.w1 = val($('w1'));
  }
  function platReset() {
    platRead();
    P.t = 0; P.r = P.rOut; P.armsIn = false; P.mv = null; P.drop = null;
    P.L = C.platformI(P.p, P.rOut).total * P.w1;
    P.ref = { w: P.w1, I: C.platformI(P.p, P.rOut).total, L: P.L, K: 0.5 * P.L * P.w1 };
    P.W = 0;
    P.graph = []; P.lastSample = -1;
    samplePlat(true);
    recPlat('start', T('伸手（起始）', 'Arms out (start)'));
  }
  function platI() { return P.drop ? C.platformI(P.p, 0, true).total : C.platformI(P.p, P.r).total; }
  function platOmega() { return P.drop ? P.drop.w : P.L / platI(); }
  function platK() {
    if (P.drop) return 0.5 * C.platformI(P.p, 0, true).total * P.drop.w * P.drop.w;
    let rd = 0;
    if (P.mv) rd = C.armAt(P.mv.r0, P.mv.r1, P.mv.dur, P.t - P.mv.t0).rd;
    return C.spinEnergy(P.p, P.L, P.r, rd, 0).total;
  }
  function platLsys() { return platI() * platOmega(); }
  function samplePlat(force) {
    if (!force && P.t - P.lastSample < 1 / 30) return;
    P.lastSample = P.t;
    const w = platOmega(), I = platI(), Kk = 0.5 * I * w * w;
    P.graph.push({ t: P.t, w: w / P.ref.w, I: I / P.ref.I, L: I * w / P.ref.L, K: Kk / P.ref.K });
    if (P.graph.length > 4000) P.graph.shift();
  }
  function platStep(dt) {
    let rem = dt;
    while (rem > 1e-12) {
      const d = Math.min(rem, 1 / 120);
      rem -= d;
      if (P.mv) {
        const ta = P.t - P.mv.t0, tb = Math.min(ta + d, P.mv.dur);
        P.phi += C.spinAngle(P.p, P.L, P.mv.r0, P.mv.r1, P.mv.dur, ta, tb, 4);
        const extra = ta + d - tb;
        P.t += d;
        P.r = C.armAt(P.mv.r0, P.mv.r1, P.mv.dur, tb).r;
        if (tb >= P.mv.dur - 1e-12) {
          P.r = P.mv.r1;
          P.phi += P.L / C.platformI(P.p, P.r).total * extra;
          finishArms();
        }
      } else {
        P.phi += platOmega() * d;
        P.t += d;
      }
      if (P.drop) P.drop.tau = P.t - P.drop.t0;
      samplePlat(false);
    }
  }
  function startArms() {
    if (P.mv || P.drop) return;
    const r1 = P.armsIn ? P.rOut : P.rIn;
    if (Math.abs(r1 - P.r) < 1e-9) return;
    P.mv = { r0: P.r, r1: r1, t0: P.t, dur: C.armDuration(P.r, r1), I0: platI(), w0: platOmega(), K0: platK() };
    if (r1 < P.r) armsSound(true); else armsSound(false);
    setStatus(r1 < P.r ? T('收手中……', 'Pulling the arms in…') : T('伸手中……', 'Stretching the arms out…'));
    play();
  }
  function finishArms() {
    const mv = P.mv;
    P.mv = null;
    P.armsIn = mv.r1 < mv.r0;
    const I1 = platI(), w1 = platOmega(), K1 = platK();
    P.W += K1 - mv.K0;
    setStatus(P.armsIn
      ? T('收手完成：I 變成 ' + num(I1 / mv.I0, 3) + ' 倍，ω 變成 ' + num(w1 / mv.w0, 3) + ' 倍（I 與 ω 的乘積 L 不變）；轉動動能增加 ' + num(K1 - mv.K0, 2) + ' J，來自肌肉作的功。',
        'Arms in: I became ' + num(I1 / mv.I0, 3) + ' times, ω ' + num(w1 / mv.w0, 3) + ' times (their product L is unchanged); the kinetic energy rose by ' + num(K1 - mv.K0, 2) + ' J, the work done by the muscles.')
      : T('伸手完成：ω 變回 ' + num(w1, 2) + ' rad/s，動能減少 ' + num(mv.K0 - K1, 2) + ' J（肌肉作負功，這份能量在肌肉裡變成熱）。',
        'Arms out: ω is back to ' + num(w1, 2) + ' rad/s and the kinetic energy fell by ' + num(mv.K0 - K1, 2) + ' J (the muscles do negative work; the energy becomes heat in them).'));
    recPlat('move', P.armsIn ? T('收手', 'Arms in') : T('伸手', 'Arms out'));
    emit('arms', {
      dir: P.armsIn ? 'in' : 'out', md: P.p.md, Mb: P.p.Mb, rOut: P.rOut, rIn: P.rIn, r0: mv.r0, r1: mv.r1,
      I0: mv.I0, I1: I1, w0: mv.w0, w1: w1, K0: mv.K0, K1: K1, W: K1 - mv.K0, L: P.L
    });
    updateButtons();
  }
  function dropDumbbells() {
    if (P.mv || P.drop || !(P.p.md > 0)) return;
    const w = platOmega();
    // 鬆手瞬間：兩個啞鈴的位置與速度（＝手的位置與 ωr 的切線速度），之後各自做拋體運動、繼續以 ω 自轉
    P.drop = { t0: P.t, tau: 0, w: w, r: P.r, phi0: P.phi, db: C.dumbbellRelease(P.phi, P.r, w), Lbefore: P.L, hy: BODY.platTop + handHeight(P.r) };
    dropSound();
    setStatus(T('鬆開啞鈴：啞鈴沿切線飛出，帶走自己的角動量；人的轉速仍是 ' + num(w, 2) + ' rad/s，沒有變快。',
      'Dumbbells released: they fly off along the tangent, carrying their own angular momentum away; the person still turns at ' + num(w, 2) + ' rad/s — no faster.'));
    recPlat('free', T('鬆開啞鈴', 'Dumbbells released'));
    emit('drop', { r: P.r, w: w, wAfter: w, md: P.p.md, L: P.L, Lperson: C.platformI(P.p, 0, true).total * w, armsIn: P.armsIn });
    updateButtons();
    play();
  }
  function handHeight(r) {
    const s = Math.max(0, Math.min(1, (C.PLAT.rArmMax - r) / (C.PLAT.rArmMax - C.PLAT.rArmMin)));
    return BODY.sy - 0.24 * s;
  }
  /** 人的姿勢（身體座標：x' 向右、y' 向前、z 向上，m）：兩肩、兩肘、兩手 */
  function posture(r) {
    const a = C.armForward(r), hy = handHeight(r);
    const out = [];
    [1, -1].forEach(function (sg) {
      const S0 = [sg * BODY.sx, 0, BODY.sy], Hd = [sg * r * Math.cos(a), r * Math.sin(a), hy];
      let dx = Hd[0] - S0[0], dy = Hd[1] - S0[1], dz = Hd[2] - S0[2];
      let d = Math.hypot(dx, dy, dz);
      const l1 = BODY.upper, l2 = BODY.fore;
      const dc = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-4, d));
      const ux = dx / d, uy = dy / d, uz = dz / d;
      const am = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), hh = Math.sqrt(Math.max(0, l1 * l1 - am * am));
      // 手肘指向：向外、向下、略向後
      let px = sg * 0.45, py = -0.25, pz = -1;
      const dot = px * ux + py * uy + pz * uz;
      px -= dot * ux; py -= dot * uy; pz -= dot * uz;
      const pn = Math.hypot(px, py, pz) || 1;
      const E = [S0[0] + ux * am + px / pn * hh, S0[1] + uy * am + py / pn * hh, S0[2] + uz * am + pz / pn * hh];
      out.push({ s: S0, e: E, h: Hd });
    });
    return out;
  }
  function rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

  function drawPlatMain() {
    const M = Lo.main, k = mk(), dark = col.dark;
    const cx = MX(0), cy = MY(0);
    const phi = P.phi, w = platOmega();
    ctx.save();
    clipPanel(ctx, M);
    // 平台（木頭圓盤，木紋跟著轉）
    const Rp = C.PLAT.Rp * k;
    D.contactShadow(ctx, cx + 3, cy + 5, Rp * 1.02, 0.1);
    const wood = mix(col.equi, col['canvas-bg'], dark ? 0.35 : 0.2);
    const pg = ctx.createRadialGradient(cx - Rp * 0.3, cy - Rp * 0.35, Rp * 0.1, cx, cy, Rp);
    pg.addColorStop(0, shade(wood, 0.3)); pg.addColorStop(0.75, wood); pg.addColorStop(1, shade(wood, -0.3));
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = alpha(shade(wood, -0.45), 0.35); ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = phi + i * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Rp * Math.cos(a), cy - Rp * Math.sin(a)); ctx.stroke();
    }
    // 平台上的紅色記號（看得出轉了多少）
    ctx.fillStyle = alpha(col.pos, 0.85);
    const ma = phi - 0.6;
    ctx.beginPath(); ctx.arc(cx + Rp * 0.86 * Math.cos(ma), cy - Rp * 0.86 * Math.sin(ma), Math.max(3, Rp * 0.06), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = alpha(shade(wood, -0.5), 0.7); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, Rp - 1, 0, Math.PI * 2); ctx.stroke();

    // 伸手／收手的位置（虛線圓）
    if (P.show.ring && !P.drop) {
      ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2;
      [[P.rOut, T('伸手', 'out')], [P.rIn, T('收手', 'in')]].forEach(function (it, i) {
        ctx.strokeStyle = alpha(col.muted, 0.6);
        ctx.beginPath(); ctx.arc(cx, cy, it[0] * k, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.setLineDash([]);
      const lf = fnt(Lo.narrow ? 10 : 11, 600);
      D.haloText(ctx, T('伸手 ', 'out ') + num(P.rOut, 2) + ' m', cx + P.rOut * k * 0.7071 + 4, cy + P.rOut * k * 0.7071 + 2, col.muted, 'left', 'top', lf);
    }

    // 人（俯視）：肩膀、頭、手臂、啞鈴
    const pos = posture(P.r), bodyA = phi + Math.PI / 2; // 身體的 +x'（右手）方向角 = φ − 90°…正面朝 φ+90°
    const toW = function (p) { const q = rot(p[0], p[1], phi); return [cx + q[0] * k, cy - q[1] * k]; };
    const skin = dark ? '#c99a7c' : '#e2b393', shirt = col.neg, hair = dark ? '#3a2c25' : '#4a3628';
    // 手臂（在身體下方先畫遠端的部分）
    pos.forEach(function (a) {
      const s0 = toW(a.s), e0 = toW(a.e), h0 = toW(a.h);
      D.tube(ctx, function (g) { g.moveTo(s0[0], s0[1]); g.lineTo(e0[0], e0[1]); g.lineTo(h0[0], h0[1]); }, skin, Math.max(5, 0.075 * k));
    });
    // 啞鈴
    const dbR = Math.max(4, (0.03 + 0.012 * Math.cbrt(Math.max(0.1, P.p.md))) * k);
    const dumbs = [];
    if (!P.drop) {
      pos.forEach(function (a) { dumbs.push({ p: toW(a.h), yaw: phi }); });
    } else {
      const tl = landTime(), tau = Math.min(P.drop.tau, tl);
      P.drop.db.forEach(function (d) { dumbs.push({ p: [cx + (d.x + d.vx * tau) * k, cy - (d.y + d.vy * tau) * k], vel: [d.vx, d.vy], yaw: P.drop.phi0 + P.drop.w * tau, landed: P.drop.tau >= tl }); });
    }
    if (P.p.md > 0) dumbs.forEach(function (d, i) {
      // 啞鈴的握把沿身體的前後方向（飛出後繼續以 ω 自轉，落地為止）
      const q = rot(0, 1, d.yaw), tx = q[0], ty = -q[1];
      const hl = dbR * 1.3;
      D.tube(ctx, function (g) { g.moveTo(d.p[0] - tx * hl, d.p[1] - ty * hl); g.lineTo(d.p[0] + tx * hl, d.p[1] + ty * hl); }, col.field, Math.max(2.5, dbR * 0.4));
      D.ball(ctx, d.p[0] - tx * hl, d.p[1] - ty * hl, dbR, shade(col.field, dark ? -0.2 : 0.05));
      D.ball(ctx, d.p[0] + tx * hl, d.p[1] + ty * hl, dbR, shade(col.field, dark ? -0.2 : 0.05));
    });
    // 身體與頭畫在手臂、啞鈴之上（從上往下看，肩膀與頭比手高）
    const sh = toW([0, 0]);
    ctx.save();
    ctx.translate(sh[0], sh[1]);
    ctx.rotate(-phi);
    const bw = 0.23 * k, bd = 0.12 * k;
    ctx.save(); ctx.shadowColor = dark ? 'rgba(0,0,0,0.5)' : alpha(col.text, 0.25); ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    const bgr = ctx.createRadialGradient(-bw * 0.3, -bd * 0.5, bd * 0.2, 0, 0, bw);
    bgr.addColorStop(0, shade(shirt, 0.35)); bgr.addColorStop(1, shade(shirt, -0.2));
    ctx.fillStyle = bgr; ctx.beginPath(); ctx.ellipse(0, 0, bw, bd, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 頭（略往前）
    const hr = 0.095 * k;
    const hg = ctx.createRadialGradient(-hr * 0.3, -hr * 0.6, hr * 0.1, 0, -bd * 0.15, hr);
    hg.addColorStop(0, shade(hair, 0.35)); hg.addColorStop(1, hair);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, -bd * 0.15, hr, 0, Math.PI * 2); ctx.fill();
    // 鼻子（正面方向）
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, -bd * 0.15 - hr * 0.98, hr * 0.22, hr * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 啞鈴的速度（畫在最上層）
    if (P.p.md > 0 && P.show.vd) dumbs.forEach(function (d, i) {
      if (d.landed) return;
      let vx, vy;
      if (!P.drop) { const hp = pos[i].h, q = rot(-hp[1] * w, hp[0] * w, phi); vx = q[0]; vy = q[1]; }
      else { vx = d.vel[0]; vy = d.vel[1]; }
      const vm = Math.hypot(vx, vy);
      if (vm > 1e-6) vecArrow(d.p[0], d.p[1], vx / vm, -vy / vm, vm * SCALE_VD, k, 0.6, col.pos, Lo.narrow ? 2.2 : 2.6, i === 0 ? 'v' : '');
    });
    // 轉動方向
    const arR = Rp + 10;
    arcArrow(ctx, cx, cy, arR, phi + 2.3, phi + 2.3 + Math.min(2.4, 0.25 + 0.3 * Math.abs(w)), alpha(col.neg, 0.85), 2);

    // L 指出畫面
    const lf = fnt(Lo.narrow ? 11 : 12, 600);
    outOfPage(ctx, M.x + 18, M.y + M.h - 18, 7, col.neg);
    D.haloText(ctx, 'L = ' + sig(platLsys(), 3) + ' kg·m²/s' + (P.drop ? T('（人＋平台）', ' (person + turntable)') : ''), M.x + 32, M.y + M.h - 18, col.neg, 'left', 'middle', lf);
    const f1 = fnt(Lo.narrow ? 11.5 : 12.5, 600), f2 = fnt(Lo.narrow ? 10.5 : 11.5, 600);
    tag(ctx, 't = ' + num(P.t, 2) + ' s' + (S.slow ? '  (' + SLOW + '×)' : ''), M.x + 6, M.y + 14, col.text, 'left', f1);
    tag(ctx, T('俯視圖', 'Top view'), M.x + M.w - 6, M.y + 14, col.muted, 'right', f2);
    tag(ctx, 'ω = ' + num(w, 2) + ' rad/s', M.x + 6, M.y + 38, col.neg, 'left', f1);
    drawFx();
    ctx.restore();
  }
  function landTime() { return Math.sqrt(2 * Math.max(0.05, (P.drop ? P.drop.hy : 1.4)) / C.G0); }

  /** 正視圖：人站在平台上（依轉角畫出手臂的投影，前後遮擋正確） */
  function drawPlatSide() {
    const R = Lo.A, dark = col.dark, phi = P.phi;
    ctx.save();
    clipPanel(ctx, R);
    const k = Math.min((R.h - 30) / 2.05, (R.w - 16) / 2.0);
    const cx = R.x + R.w / 2, floor = R.y + R.h - 10;
    const X = function (x) { return cx + x * k; }, Y = function (z) { return floor - z * k; };
    const skin = dark ? '#c99a7c' : '#e2b393', shirt = col.neg, pants = dark ? '#3d4a63' : '#41506b', hair = dark ? '#3a2c25' : '#4a3628';
    // 地板陰影
    D.contactShadow(ctx, cx, floor, C.PLAT.Rp * k * 1.05, 0);
    // 平台：側面＋頂面橢圓
    const Rp = C.PLAT.Rp * k, top = Y(BODY.platTop), ey = Rp * 0.22;
    const wood = mix(col.equi, col['canvas-bg'], dark ? 0.35 : 0.2);
    D.block(ctx, cx - Rp * 0.3, Y(0.06), Rp * 0.6, 0.06 * k, col.field, { r: 2 });
    const sideG = ctx.createLinearGradient(cx - Rp, 0, cx + Rp, 0);
    sideG.addColorStop(0, shade(wood, -0.35)); sideG.addColorStop(0.4, shade(wood, 0.05)); sideG.addColorStop(1, shade(wood, -0.4));
    ctx.fillStyle = sideG;
    ctx.beginPath(); ctx.moveTo(cx - Rp, top); ctx.lineTo(cx - Rp, top + 0.06 * k); ctx.ellipse(cx, top + 0.06 * k, Rp, ey, 0, Math.PI, 0, true); ctx.lineTo(cx + Rp, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(wood, 0.18); ctx.beginPath(); ctx.ellipse(cx, top, Rp, ey, 0, 0, Math.PI * 2); ctx.fill();
    // 平台上的紅色記號：轉到前方時看得到
    const ma = phi - 0.6, mxp = Math.cos(ma), myp = Math.sin(ma);
    if (myp < 0.2) { ctx.fillStyle = alpha(col.pos, 0.85); ctx.beginPath(); ctx.ellipse(X(C.PLAT.Rp * 0.86 * mxp), top - ey * 0.86 * myp * -1 * 1, 3, 2, 0, 0, Math.PI * 2); ctx.fill(); }

    // 人：依深度排序（觀察者在 −y 方向；y 越大越遠）
    const pos = posture(P.r);
    const parts = [];
    const toS = function (p) { const q = rot(p[0], p[1], phi); return { x: X(q[0]), y: Y(BODY.platTop + p[2]), d: q[1] }; };
    pos.forEach(function (a, i) {
      const s0 = toS(a.s), e0 = toS(a.e), h0 = toS(a.h);
      parts.push({ d: (s0.d + e0.d + h0.d) / 3, draw: function () {
        D.tube(ctx, function (g) { g.moveTo(s0.x, s0.y); g.lineTo(e0.x, e0.y); g.lineTo(h0.x, h0.y); }, skin, Math.max(3.5, 0.07 * k));
        if (!P.drop && P.p.md > 0) drawDumbbellSide(h0, phi, a.h, k);
      } });
    });
    parts.push({ d: 0, draw: function () { drawFigure(X, Y, k, skin, shirt, pants, hair, phi); } });
    parts.sort(function (a, b) { return b.d - a.d; });
    parts.forEach(function (p) { p.draw(); });
    // 鬆手後的啞鈴：往下掉
    if (P.drop && P.p.md > 0) {
      const tl = landTime(), tau = Math.min(P.drop.tau, tl);
      P.drop.db.forEach(function (d) {
        const x = d.x + d.vx * tau, z = Math.max(0.05, P.drop.hy - 0.5 * C.G0 * tau * tau);
        const rr = Math.max(3, 0.045 * k);
        D.ball(ctx, X(x), Y(z), rr, shade(col.field, dark ? -0.2 : 0.05));
      });
    }
    // 角動量向量：沿轉軸朝上
    const Lsys = platLsys(), lenM = Math.min(0.3, 0.012 * Lsys + 0.06);
    const headTop = Y(BODY.platTop + BODY.head + 0.13);
    D.arrow(ctx, cx, headTop, cx, headTop - lenM * k, col.neg, 2.6, { label: 'L', lx: 12, ly: 6 });
    // 轉動方向的橢圓箭頭
    ctx.save();
    ctx.strokeStyle = alpha(col.neg, 0.75); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(cx, headTop - lenM * k * 0.45, 14, 4.5, 0, 0.2, Math.PI * 1.75); ctx.stroke();
    ctx.restore();
    tag(ctx, T('正視圖', 'Front view'), R.x + 6, R.y + 14, col.text, 'left', fnt(Lo.narrow ? 11 : 12.5, 700));
    ctx.restore();
  }
  function drawFigure(X, Y, k, skin, shirt, pants, hair, phi) {
    const base = BODY.platTop;
    // 腿
    [-0.09, 0.09].forEach(function (x) {
      const q = Math.cos(phi) * x;
      D.block(ctx, X(q) - 0.06 * k, Y(base + 0.85), 0.12 * k, 0.85 * k, pants, { r: 4, shadow: false });
    });
    // 軀幹（寬度隨轉角變：正面寬、側面窄）
    const wHalf = (0.2 * Math.abs(Math.cos(phi)) + 0.13 * Math.abs(Math.sin(phi)));
    D.block(ctx, X(-wHalf), Y(base + 1.47), 2 * wHalf * k, 0.64 * k, shirt, { r: 8 });
    // 脖子與頭
    D.block(ctx, X(-0.045), Y(base + 1.55), 0.09 * k, 0.1 * k, shade(skin, -0.08), { r: 3, shadow: false });
    D.ball(ctx, X(0), Y(base + BODY.head), Math.max(5, 0.105 * k), skin, { shadow: false });
    // 頭髮（後腦朝向 −正面）
    ctx.save();
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.ellipse(X(0), Y(base + BODY.head + 0.05), 0.1 * k, 0.065 * k, 0, Math.PI, 0); ctx.fill();
    ctx.restore();
  }
  function drawDumbbellSide(h0, phi, hp, k) {
    const dark = col.dark;
    const rr = Math.max(3, (0.03 + 0.012 * Math.cbrt(Math.max(0.1, P.p.md))) * k);
    // 握把沿切線方向：投影長度隨轉角變
    const tdir = rot(-hp[1], hp[0], phi), n = Math.hypot(tdir[0], tdir[1]) || 1;
    const hl = 0.06 * k * Math.abs(tdir[0] / n);
    D.tube(ctx, function (g) { g.moveTo(h0.x - hl, h0.y); g.lineTo(h0.x + hl, h0.y); }, col.field, Math.max(2, rr * 0.4));
    D.ball(ctx, h0.x - hl, h0.y, rr, shade(col.field, dark ? -0.2 : 0.05), { shadow: false });
    D.ball(ctx, h0.x + hl, h0.y, rr, shade(col.field, dark ? -0.2 : 0.05), { shadow: false });
  }

  /** 長條圖：伸手 vs 收手（I、ω、L、K） */
  function drawPlatBars() {
    const R = Lo.B, dark = col.dark;
    ctx.save();
    clipPanel(ctx, R);
    const L = P.L;
    const a = C.armChange(P.p, L, P.rOut, P.rIn);
    const groups = [
      { name: 'I', unit: 'kg·m²', v: [a.I1, a.I2], c: col.equi },
      { name: 'ω', unit: 'rad/s', v: [a.w1, a.w2], c: col['b-mech'] },
      { name: 'L', unit: 'kg·m²/s', v: [L, L], c: col.neg },
      { name: 'K', unit: 'J', v: [a.K1, a.K2], c: col.pos }
    ];
    const cur = P.drop ? -1 : P.mv ? -1 : P.armsIn ? 1 : 0;
    const pad = { l: 8, r: 8, t: 34, b: 34 };
    const x0 = R.x + pad.l, x1 = R.x + R.w - pad.r, y0 = R.y + pad.t, y1 = R.y + R.h - pad.b;
    const gw = (x1 - x0) / groups.length;
    const bw = Math.min(26, gw * 0.3);
    const fv = fnt(Lo.narrow ? 9 : 10, 600), fn = fnt(Lo.narrow ? 12 : 13, 700, true), fr = fnt(Lo.narrow ? 9.5 : 10.5, 700);
    ctx.strokeStyle = alpha(col.muted, 0.6); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, snapPx(y1)); ctx.lineTo(x1, snapPx(y1)); ctx.stroke();
    groups.forEach(function (g, gi) {
      const gx = x0 + gw * (gi + 0.5), mx = Math.max(g.v[0], g.v[1]) || 1;
      const vals = g.v.map(function (v, i) {
        const h = (y1 - y0 - 16) * v / mx;
        const bx = gx + (i ? 2 : -2 - bw);
        const c0 = i ? g.c : mix(g.c, col['canvas-bg'], 0.45);
        D.block(ctx, bx, y1 - h, bw, h, c0, { r: 3, shadow: cur === i });
        if (cur === i) { ctx.strokeStyle = alpha(col.text, 0.8); ctx.lineWidth = 1.5; D.roundRect(ctx, bx - 1.5, y1 - h - 1.5, bw + 3, h + 3, 4); ctx.stroke(); }
        return { t: sig(v, 3), x: bx + bw / 2, y: y1 - h - 4 };
      });
      pairValues(ctx, vals[0], vals[1], fv);
      D.haloText(ctx, g.name, gx, y1 + 11, g.c, 'center', 'middle', fn);
      const ratio = g.v[1] / g.v[0];
      const rt = g.name === 'L' ? '= ' : (ratio >= 1 ? '×' + num(ratio, 2) : '×' + num(ratio, 2));
      D.haloText(ctx, rt, gx, y1 + 25, col.muted, 'center', 'middle', fr);
    });
    tag(ctx, T('伸手 vs 收手', 'Arms out vs in'), R.x + 6, R.y + 14, col.text, 'left', fnt(Lo.narrow ? 11 : 12.5, 700));
    // 圖例：淡色 = 伸手，深色 = 收手
    const lf = fnt(Lo.narrow ? 9.5 : 10.5, 600);
    ctx.font = lf;
    const t2 = T('收手', 'in'), t1 = T('伸手', 'out');
    const w2 = ctx.measureText(t2).width, w1 = ctx.measureText(t1).width;
    let lx = R.x + R.w - 8 - w2;
    D.haloText(ctx, t2, lx, R.y + 14, col.text, 'left', 'middle', lf);
    D.block(ctx, lx - 13, R.y + 9, 10, 10, col.muted, { r: 2, shadow: false });
    lx -= 13 + 8 + w1;
    D.haloText(ctx, t1, lx, R.y + 14, col.text, 'left', 'middle', lf);
    D.block(ctx, lx - 13, R.y + 9, 10, 10, mix(col.muted, col['canvas-bg'], 0.45), { r: 2, shadow: false });
    if (R.y + 14 + 18 < y0) { /* 空間足夠 */ }
    ctx.restore();
  }
  function updatePlatReadout() {
    const I = platI(), w = platOmega(), Kk = 0.5 * I * w * w, parts = C.platformI(P.p, P.r);
    const LU = ' kg·m<sup>2</sup>/s', IU = ' kg·m<sup>2</sup>';
    setHTML('p_t', num(P.t, 2) + ' s');
    setHTML('p_r', P.drop ? T('—（已鬆開）', '— (released)') : num(P.r, 3) + ' m');
    setHTML('p_I', num(I, 3) + IU + '<small>' + T('人體 ', 'body ') + num(parts.body, 3) + ' + ' + T('平台 ', 'turntable ') + num(parts.plat, 3) + (P.drop ? '' : ' + ' + T('啞鈴 ', 'dumbbells ') + num(parts.dumb, 3)) + '</small>');
    setHTML('p_w', num(w, 3) + ' rad/s<small>' + num(w / (2 * Math.PI), 3) + T(' 圈/秒', ' rev/s') + '</small>');
    setHTML('p_L', num(I * w, 3) + LU + (P.drop ? '<small>' + T('加上飛出的啞鈴：', 'with the flying dumbbells: ') + num(P.drop.Lbefore, 3) + '</small>' : ''));
    setHTML('p_K', num(Kk, 3) + ' J');
    setHTML('p_W', num(P.W, 3) + ' J<small>' + T('收手為正、伸手為負', 'positive pulling in, negative stretching out') + '</small>');
  }

  // =====================================================================
  // 模式三：兩盤相合
  // =====================================================================
  function diskRead() {
    return { M1: val($('M1')), R1: val($('R1')), w1: val($('wA')), M2: val($('M2')), R2: val($('R2')), w2: val($('wB')), mu: val($('mu')) };
  }
  function diskReset() {
    K.p = diskRead();
    K.res = C.coupleResult(K.p);
    K.t = 0; K.ph = 'held'; K.emitted = false;
    K.graph = []; K.lastSample = -1;
    sampleDisk(true);
  }
  function diskOmegas() {
    if (K.ph === 'slip' || K.ph === 'locked') { const q = C.coupleAt(K.p, K.t - K.tContact); return [q.w1, q.w2, q.Q]; }
    return [K.p.w1, K.p.w2, 0];
  }
  function diskAngles() {
    if (K.ph === 'slip' || K.ph === 'locked') { const q = C.coupleAt(K.p, K.t - K.tContact); return [K.c1 + q.a1, K.c2 + q.a2]; }
    return [K.a1, K.a2];
  }
  function upperHeight() {
    if (K.ph === 'held') return C.DISK.h0;
    if (K.ph === 'fall') return Math.max(0, C.DISK.h0 - 0.5 * C.G0 * (K.t - K.tDrop) * (K.t - K.tDrop));
    return 0;
  }
  function sampleDisk(force) {
    if (!force && K.t - K.lastSample < 1 / 60) return;
    K.lastSample = K.t;
    const w = diskOmegas();
    K.graph.push({ t: K.t, w1: w[0], w2: w[1] });
    if (K.graph.length > 4000) K.graph.shift();
  }
  function diskStep(dt) {
    let rem = dt;
    while (rem > 1e-12) {
      const d = Math.min(rem, 1 / 240);
      rem -= d;
      if (K.ph === 'held' || K.ph === 'fall') {
        K.a1 += K.p.w1 * d; K.a2 += K.p.w2 * d;
        K.t += d;
        if (K.ph === 'fall' && K.t - K.tDrop >= C.dropTime()) {
          K.ph = 'slip'; K.tContact = K.tDrop + C.dropTime(); K.c1 = K.a1; K.c2 = K.a2;
          // 修正：落地時刻在這一步之內
          const over = K.t - K.tContact;
          K.c1 -= K.p.w1 * over; K.c2 -= K.p.w2 * over;
          contactSound();
          if (!reducedMotion) S.fx.push({ type: 'clack', t0: performance.now(), dur: 380 });
        }
      } else {
        K.t += d;
      }
      if (K.ph === 'slip' && K.t - K.tContact >= K.res.tLock) {
        K.ph = 'locked';
        lockSound();
        const r = K.res;
        setStatus(T('兩盤一起轉了：ω = ' + num(r.wf, 3) + ' rad/s。L 不變，動能少了 ' + num(r.frac * 100, 1) + '%（變成熱）。',
          'The discs now turn together at ω = ' + num(r.wf, 3) + ' rad/s. L is unchanged; ' + num(r.frac * 100, 1) + '% of the kinetic energy became heat.'));
        if (!K.emitted) {
          K.emitted = true;
          recDisk();
          emit('couple', Object.assign({}, K.p, { I1: r.I1, I2: r.I2, wf: r.wf, K0: r.K0, K1: r.K1, loss: r.loss, frac: r.frac, tLock: r.tLock, L: r.L }));
        }
        updateButtons();
      }
      sampleDisk(false);
    }
  }
  function dropDisk() {
    if (K.ph !== 'held') { diskReset(); setStatus(T('上盤拿起來了，可以再放一次。', 'The upper disc is lifted again; drop it once more.')); updateButtons(); requestDraw(); return; }
    K.ph = 'fall'; K.tDrop = K.t;
    setStatus(T('上盤落下……', 'The upper disc is falling…'));
    updateButtons();
    play();
  }

  function discPaint(cx, cy, R, ang, color, opts) {
    const dark = col.dark;
    opts = opts || {};
    ctx.save();
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    const a0 = opts.glass ? (dark ? 0.4 : 0.34) : 1;
    g.addColorStop(0, alpha(shade(color, 0.45), a0)); g.addColorStop(0.7, alpha(color, a0)); g.addColorStop(1, alpha(shade(color, -0.3), a0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // 同心圓紋（金屬車削的感覺）
    ctx.strokeStyle = alpha(shade(color, opts.glass ? 0.5 : -0.35), 0.25); ctx.lineWidth = 1;
    for (let rr = R * 0.25; rr < R * 0.95; rr += R * 0.17) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); }
    // 記號：一條粗的半徑帶與三個點
    ctx.strokeStyle = alpha(opts.mark || shade(color, -0.5), 0.9); ctx.lineWidth = Math.max(3, R * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + R * 0.2 * Math.cos(ang), cy - R * 0.2 * Math.sin(ang)); ctx.lineTo(cx + R * 0.88 * Math.cos(ang), cy - R * 0.88 * Math.sin(ang)); ctx.stroke();
    ctx.fillStyle = alpha(opts.mark || shade(color, -0.5), 0.75);
    [2.1, 4.2].forEach(function (o) { ctx.beginPath(); ctx.arc(cx + R * 0.7 * Math.cos(ang + o), cy - R * 0.7 * Math.sin(ang + o), Math.max(2, R * 0.045), 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = opts.glass ? alpha(shade(color, dark ? 0.1 : -0.3), 0.95) : alpha(shade(color, -0.45), 0.75); ctx.lineWidth = opts.glass ? 2.2 : 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R - 0.75, 0, Math.PI * 2); ctx.stroke();
    if (opts.glass) { // 玻璃的反光
      ctx.strokeStyle = 'rgba(255,255,255,' + (dark ? 0.25 : 0.55) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.92, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
    }
    ctx.restore();
  }
  function drawDiskMain() {
    const M = Lo.main, k = mk(), dark = col.dark;
    const cx = MX(0), cy = MY(0);
    const ang = diskAngles(), w = diskOmegas(), h = upperHeight();
    const R1 = K.p.R1 * k, R2 = K.p.R2 * k;
    ctx.save();
    clipPanel(ctx, M);
    // 底座陰影、下盤
    D.contactShadow(ctx, cx + 2, cy + 4, R1 * 1.02, 0.05);
    discPaint(cx, cy, R1, ang[0], mix(col.accent, col['canvas-bg'], 0.15), { mark: shade(col.accent, -0.55) });
    // 摩擦生熱的光暈
    if (K.ph === 'slip') {
      const slip = Math.abs(w[0] - w[1]) / Math.max(1e-6, Math.abs(K.p.w1 - K.p.w2));
      const rc = Math.min(R1, R2);
      const hg = ctx.createRadialGradient(cx, cy, rc * 0.2, cx, cy, rc);
      hg.addColorStop(0, alpha(col.pos, 0.05 * slip)); hg.addColorStop(0.8, alpha(col.pos, (dark ? 0.35 : 0.25) * slip)); hg.addColorStop(1, alpha(col.pos, 0));
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, rc, 0, Math.PI * 2); ctx.fill();
    }
    // 上盤的影子（越高越淡、越偏）
    const lift = h / C.DISK.h0;
    if (lift > 0.02) {
      const so = 4 + 14 * lift;
      ctx.fillStyle = D.shadowInk((dark ? 0.35 : 0.18) * (1 - 0.4 * lift));
      ctx.beginPath(); ctx.arc(cx + so, cy + so * 1.2, R2, 0, Math.PI * 2); ctx.fill();
    }
    // 上盤（壓克力，半透明）
    discPaint(cx, cy, R2 * (1 + 0.05 * lift), ang[1], mix(col.equi, col['canvas-bg'], 0.1), { glass: true, mark: shade(col.equi, col.dark ? 0.25 : -0.25) });
    // 中心軸
    D.ball(ctx, cx, cy, Math.max(4, 0.012 * k), col.field, { glow: 0 });
    // 轉動箭頭（弧長 ∝ ω）
    if (K.show.w) {
      const sc = 0.12;
      if (Math.abs(w[0]) > 0.05) arcArrow(ctx, cx, cy, R1 + 9, 0.6, 0.6 + Math.max(-2.6, Math.min(2.6, sc * w[0] + Math.sign(w[0]) * 0.25)), shade(col.accent, -0.15), 2.4);
      if (Math.abs(w[1]) > 0.05) arcArrow(ctx, cx, cy, R2 * 0.55, 3.8, 3.8 + Math.max(-2.6, Math.min(2.6, sc * w[1] + Math.sign(w[1]) * 0.25)), shade(col.equi, col.dark ? 0.2 : -0.35), 2.4);
    }
    // 摩擦力矩：兩盤受到的大小相等、方向相反
    if (K.show.fr && K.ph === 'slip') {
      const sg = Math.sign(K.p.w1 - K.p.w2), rr = Math.min(R1, R2) * 0.8;
      arcArrow(ctx, cx, cy, rr, -0.4, -0.4 - sg * 0.9, col.pos, 2.2);
      arcArrow(ctx, cx, cy, rr, 2.75, 2.75 + sg * 0.9, col.pos, 2.2);
      D.haloText(ctx, T('摩擦力矩', 'friction torque'), cx + rr * Math.cos(-0.85) + 6, cy - rr * Math.sin(-0.85) + 4, col.pos, 'left', 'middle', fnt(Lo.narrow ? 10 : 11, 600));
    }
    const f1 = fnt(Lo.narrow ? 11.5 : 12.5, 600), f2 = fnt(Lo.narrow ? 10.5 : 11.5, 600);
    tag(ctx, 't = ' + num(K.t, 2) + ' s' + (S.slow ? '  (' + SLOW + '×)' : ''), M.x + 6, M.y + 14, col.text, 'left', f1);
    tag(ctx, T('俯視圖', 'Top view'), M.x + M.w - 6, M.y + 14, col.muted, 'right', f2);
    const phText = { held: T('上盤拿在上方', 'Upper disc held above'), fall: T('上盤落下', 'Upper disc falling'), slip: T('滑動中：摩擦生熱', 'Slipping: friction heats'), locked: T('一起轉動', 'Turning together') }[K.ph];
    tag(ctx, phText, M.x + 6, M.y + M.h - 15, K.ph === 'slip' ? col.pos : col.muted, 'left', f1);
    // L
    outOfPage(ctx, M.x + M.w - 18, M.y + M.h - 18, 7, col.neg);
    D.haloText(ctx, 'L = ' + sig(K.res.L, 3) + ' kg·m²/s', M.x + M.w - 32, M.y + M.h - 18, col.neg, 'right', 'middle', fnt(Lo.narrow ? 11 : 12, 600));
    drawFx();
    ctx.restore();
  }
  function drawDiskSide() {
    const R = Lo.A, dark = col.dark;
    ctx.save();
    clipPanel(ctx, R);
    const k = Math.min((R.w - 20) / 0.66, (R.h - 40) / 0.24);
    // 窄面板時寬度決定比例，內容（約 0.2 m 高）放在面板中間偏下，不全擠在底部
    const cx = R.x + R.w / 2, floor = Math.min(R.y + R.h - 12, R.y + 24 + (R.h - 24) / 2 + 0.1 * k);
    const Y = function (z) { return floor - z * k; };
    const ang = diskAngles(), h = upperHeight();
    const th = 0.02;
    // 底座與軸
    D.contactShadow(ctx, cx, floor, 0.12 * k, 0);
    D.block(ctx, cx - 0.1 * k, Y(0.04), 0.2 * k, 0.04 * k, col.field, { r: 3 });
    D.tube(ctx, function (g) { g.moveTo(cx, Y(0.04)); g.lineTo(cx, Y(0.04 + th * 2 + C.DISK.h0 + 0.05)); }, shade(col.field, 0.2), Math.max(3, 0.012 * k));
    function slab(z0, Rr, a, color, glass) {
      const x0 = cx - Rr * k, w = 2 * Rr * k, y = Y(z0 + th), hh = th * k;
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      const aa = glass ? 0.7 : 1;
      g.addColorStop(0, alpha(shade(color, -0.35), aa)); g.addColorStop(0.35, alpha(shade(color, 0.25), aa)); g.addColorStop(1, alpha(shade(color, -0.4), aa));
      ctx.fillStyle = g; D.roundRect(ctx, x0, y, w, hh, 2); ctx.fill();
      ctx.strokeStyle = alpha(shade(color, -0.5), 0.6); ctx.lineWidth = 1; ctx.stroke();
      // 側面的記號（轉到前方時看得到）
      const s = Math.sin(a), c = Math.cos(a);
      if (s < 0.1) {
        ctx.fillStyle = alpha(shade(color, -0.6), 0.85 * Math.min(1, (0.1 - s) * 3));
        ctx.fillRect(cx + Rr * k * c - 2, y + 1, 4, hh - 2);
      }
    }
    slab(0.04, K.p.R1, ang[0], mix(col.accent, col['canvas-bg'], 0.15), false);
    if (K.ph === 'slip') {
      const rc = Math.min(K.p.R1, K.p.R2) * k;
      const gg = ctx.createLinearGradient(0, Y(0.04 + th) - 6, 0, Y(0.04 + th) + 6);
      gg.addColorStop(0, alpha(col.pos, 0)); gg.addColorStop(0.5, alpha(col.pos, dark ? 0.6 : 0.45)); gg.addColorStop(1, alpha(col.pos, 0));
      ctx.fillStyle = gg; ctx.fillRect(cx - rc, Y(0.04 + th) - 6, 2 * rc, 12);
    }
    slab(0.04 + th + h, K.p.R2, ang[1], mix(col.equi, col['canvas-bg'], 0.1), true);
    // 夾具（上盤被拿著時）
    if (K.ph === 'held') {
      ctx.strokeStyle = alpha(col.muted, 0.9); ctx.lineWidth = 2;
      const yy = Y(0.04 + 2 * th + h);
      ctx.beginPath(); ctx.moveTo(cx - 0.05 * k, yy - 10); ctx.lineTo(cx - 0.05 * k, yy - 1); ctx.moveTo(cx + 0.05 * k, yy - 10); ctx.lineTo(cx + 0.05 * k, yy - 1); ctx.moveTo(cx - 0.05 * k, yy - 10); ctx.lineTo(cx + 0.05 * k, yy - 10); ctx.stroke();
    }
    tag(ctx, T('側視圖', 'Side view'), R.x + 6, R.y + 14, col.text, 'left', fnt(Lo.narrow ? 11 : 12.5, 700));
    ctx.restore();
  }
  function drawDiskBars() {
    const R = Lo.B, dark = col.dark, r = K.res;
    ctx.save();
    clipPanel(ctx, R);
    const q = diskOmegas();
    const Lnow = r.I1 * q[0] + r.I2 * q[1], Know = 0.5 * r.I1 * q[0] * q[0] + 0.5 * r.I2 * q[1] * q[1], Qnow = q[2];
    const pad = { l: 10, r: 10, t: 34, b: 36 };
    const x0 = R.x + pad.l, x1 = R.x + R.w - pad.r, y0 = R.y + pad.t, y1 = R.y + R.h - pad.b;
    const gw = (x1 - x0) / 2, bw = Math.min(30, gw * 0.3);
    const fv = fnt(Lo.narrow ? 9 : 10, 600), fn = fnt(Lo.narrow ? 12 : 13, 700, true), fr = fnt(Lo.narrow ? 9.5 : 10.5, 700);
    ctx.strokeStyle = alpha(col.muted, 0.6); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, snapPx(y1)); ctx.lineTo(x1, snapPx(y1)); ctx.stroke();
    const Hh = y1 - y0 - 16;
    // L：之前、現在
    const Lm = Math.max(Math.abs(r.L), 1e-9);
    const lv = [[r.L, mix(col.neg, col['canvas-bg'], 0.45)], [Lnow, col.neg]].map(function (it, i) {
      const gx = x0 + gw * 0.5, bx = gx + (i ? 2 : -2 - bw), hgt = Hh * Math.abs(it[0]) / Lm;
      D.block(ctx, bx, y1 - hgt, bw, Math.max(1, hgt), it[1], { r: 3, shadow: false });
      return { t: sig(it[0], 3), x: bx + bw / 2, y: y1 - hgt - 4 };
    });
    pairValues(ctx, lv[0], lv[1], fv);
    D.haloText(ctx, 'L', x0 + gw * 0.5, y1 + 11, col.neg, 'center', 'middle', fn);
    D.haloText(ctx, T('不變', 'same'), x0 + gw * 0.5, y1 + 25, col.muted, 'center', 'middle', fr);
    // K：之前、現在（加上熱 Q 疊在上面）
    const Km = Math.max(r.K0, 1e-9);
    {
      const gx = x0 + gw * 1.5;
      const b0 = gx - 2 - bw, b1 = gx + 2;
      const h0 = Hh * r.K0 / Km, h1 = Hh * Know / Km, hq = Hh * Qnow / Km;
      D.block(ctx, b0, y1 - h0, bw, Math.max(1, h0), mix(col.pos, col['canvas-bg'], 0.45), { r: 3, shadow: false });
      D.block(ctx, b1, y1 - h1, bw, Math.max(1, h1), col.pos, { r: 3, shadow: false });
      if (hq > 0.5) {
        ctx.save();
        D.roundRect(ctx, b1, y1 - h1 - hq, bw, hq, 3);
        ctx.fillStyle = alpha(col['b-thermo'], dark ? 0.35 : 0.25); ctx.fill();
        ctx.setLineDash([3, 3]); ctx.strokeStyle = alpha(col['b-thermo'], 0.9); ctx.lineWidth = 1.2; ctx.stroke();
        ctx.restore();
        if (hq > 14) D.haloText(ctx, 'Q', b1 + bw / 2, y1 - h1 - hq / 2, col['b-thermo'], 'center', 'middle', fnt(11, 700, true));
      }
      pairValues(ctx, { t: sig(r.K0, 3), x: b0 + bw / 2, y: y1 - h0 - 4 }, { t: sig(Know, 3), x: b1 + bw / 2, y: y1 - h1 - hq - 4 }, fv);
      D.haloText(ctx, 'K', gx, y1 + 11, col.pos, 'center', 'middle', fn);
      D.haloText(ctx, (K.ph === 'locked' ? T('損失 ', 'lost ') : T('預測損失 ', 'loss ')) + num(r.frac * 100, 1) + '%', gx, y1 + 25, col.muted, 'center', 'middle', fr);
    }
    tag(ctx, T('相合前 vs 現在', 'Before vs now'), R.x + 6, R.y + 14, col.text, 'left', fnt(Lo.narrow ? 11 : 12.5, 700));
    ctx.restore();
  }
  function updateDiskReadout() {
    const r = K.res, q = diskOmegas();
    const LU = ' kg·m<sup>2</sup>/s', IU = ' kg·m<sup>2</sup>';
    setHTML('d_t', num(K.t, 2) + ' s');
    setHTML('d_I', num(r.I1, 4) + '、' + num(r.I2, 4) + IU);
    setHTML('d_w1', num(q[0], 3) + ' rad/s');
    setHTML('d_w2', num(q[1], 3) + ' rad/s');
    setHTML('d_L', num(r.I1 * q[0] + r.I2 * q[1], 4) + LU);
    setHTML('d_K', num(0.5 * r.I1 * q[0] * q[0] + 0.5 * r.I2 * q[1] * q[1], 4) + ' J');
    setHTML('d_Q', num(q[2], 4) + ' J');
    setHTML('d_wf', num(r.wf, 3) + ' rad/s<small>' + T('滑動 ', 'slips for ') + num(r.tLock, 2) + T(' s 後一起轉', ' s') + '</small>');
  }

  // =====================================================================
  // 共通：主繪圖、讀數、事件效果
  // =====================================================================
  function curTime() { return S.mode === 'hole' ? H.st.t : S.mode === 'plat' ? P.t : K.t; }
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }
  function draw() {
    if (!Lo) return;
    updateReadout();
    if (view3 && view3.active) { view3.frame(); return; }
    if (bgKey !== bgKeyNow()) buildBackground();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    if (S.mode === 'hole') {
      drawHoleMain(); drawHoleSide(); drawHoleVR();
      const lf = H.graph;
      drawRatioStrip([
        { pts: lf.map(function (g) { return [g.t, g.K]; }), color: col.pos, w: 3.4 },
        { pts: lf.map(function (g) { return [g.t, g.W]; }), color: col.equi, dash: [5, 4], w: 1.8, dot: false },
        { pts: lf.map(function (g) { return [g.t, g.L]; }), color: col.neg, w: 3 }
      ], T('與起始值的比', 'Ratio to start'), [
        { color: col.neg, parts: [{ t: 'L', it: true }, { t: '/' }, { t: 'L', it: true }, { t: '0', sub: true }] },
        { color: col.pos, parts: [{ t: 'K', it: true }, { t: '/' }, { t: 'K', it: true }, { t: '0', sub: true }] },
        { color: col.equi, dash: [5, 4], parts: [{ t: '(' }, { t: 'K', it: true }, { t: '0', sub: true }, { t: ' + ' }, { t: 'W', it: true }, { t: ')/' }, { t: 'K', it: true }, { t: '0', sub: true }] }
      ]);
    } else if (S.mode === 'plat') {
      drawPlatMain(); drawPlatSide(); drawPlatBars();
      const g = P.graph;
      drawRatioStrip([
        { pts: g.map(function (q) { return [q.t, q.I]; }), color: col.equi, w: 3 },
        { pts: g.map(function (q) { return [q.t, q.K]; }), color: col.pos, w: 3 },
        { pts: g.map(function (q) { return [q.t, q.L]; }), color: col.neg, w: 3 },
        { pts: g.map(function (q) { return [q.t, q.w]; }), color: col['b-mech'], w: 2.2, dash: [6, 3], dot: false }
      ], T('與伸手時的比', 'Ratio to arms out'), [
        { color: col.equi, parts: [{ t: 'I', it: true }] },
        { color: col['b-mech'], dash: [6, 3], parts: [{ t: 'ω', it: true }] },
        { color: col.neg, parts: [{ t: 'L', it: true }] },
        { color: col.pos, parts: [{ t: 'K', it: true }] }
      ]);
    } else {
      drawDiskMain(); drawDiskSide(); drawDiskBars();
      const g = K.graph;
      drawRatioStrip([
        { pts: g.map(function (q) { return [q.t, q.w1]; }), color: shade(col.accent, -0.05), w: 3 },
        { pts: g.map(function (q) { return [q.t, q.w2]; }), color: shade(col.equi, col.dark ? 0.1 : -0.2), w: 3 }
      ], T('角速度 ω (rad/s)', 'Angular speed ω (rad/s)'), [
        { color: shade(col.accent, -0.05), parts: [{ t: 'ω', it: true }, { t: '1', sub: true }, { t: T(' 下盤', ' lower') }] },
        { color: shade(col.equi, col.dark ? 0.1 : -0.2), parts: [{ t: 'ω', it: true }, { t: '2', sub: true }, { t: T(' 上盤', ' upper') }] }
      ]);
    }
  }
  function drawFx() {
    const tNow = performance.now();
    S.fx = S.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
    S.fx.forEach(function (e) {
      const u = (tNow - e.t0) / e.dur;
      if (e.type === 'snap' && S.mode === 'hole') {
        const x = MX(e.x), y = MY(e.y);
        D.ripple(ctx, x, y, 10, u, col.pos);
        ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = alpha(col.pos, 0.85 * (1 - u)); ctx.lineWidth = 1.8 * (1 - u) + 0.6;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) { const a = e.a0 + i * Math.PI * 2 / 7, r0 = 4 + 10 * u, r1 = 9 + 20 * u; ctx.moveTo(x + r0 * Math.cos(a), y + r0 * Math.sin(a)); ctx.lineTo(x + r1 * Math.cos(a), y + r1 * Math.sin(a)); }
        ctx.stroke(); ctx.restore();
      } else if (e.type === 'clack' && S.mode === 'disk') {
        D.ripple(ctx, MX(0), MY(0), Math.min(K.p.R1, K.p.R2) * mk(), u, col.equi);
      } else if (e.type === 'letgo' && S.mode === 'hole') {
        D.ripple(ctx, MX(e.x), MY(e.y), 10, u, col.accent);
      }
    });
  }

  // ---------- 紀錄表（table.data；classroom.js 會自動加「下載 CSV」與「複製表格」） ----------
  function addRow(id, kind, cells) {
    const tb = $(id).tBodies[0];
    const last = tb.rows[tb.rows.length - 1];
    if (kind === 'start' && last && last.className === 'ev-start') tb.removeChild(last); // 拖曳滑桿時只留最後一個起始列
    const tr = document.createElement('tr');
    tr.className = 'ev-' + kind;
    tr.innerHTML = '<th scope="row">' + cells[0] + '</th>' + cells.slice(1).map(function (c) { return '<td>' + c + '</td>'; }).join('');
    tb.appendChild(tr);
    while (tb.rows.length > 80) tb.deleteRow(0);
  }
  function clearRows(id) { $(id).tBodies[0].innerHTML = ''; }
  function recHole(kind, label) {
    const k = C.holeKin(H.st);
    addRow('recHole', kind, [label, num(k.r, 3), num(k.v, 3), num(k.om, 3), num(k.L, 4), num(k.K, 4), num(k.W, 4)]);
  }
  function recPlat(kind, label) {
    const I = platI(), w = platOmega();
    addRow('recPlat', kind, [label, P.drop ? '—' : num(P.r, 3), num(I, 4), num(w, 3), num(I * w, 3), num(0.5 * I * w * w, 3)]);
  }
  function recDisk() {
    const r = K.res, n = $('recDisk').tBodies[0].rows.length + 1;
    addRow('recDisk', 'move', [String(n), num(r.I1, 4), num(r.I2, 4), num(K.p.w1, 2), num(K.p.w2, 2), num(r.wf, 3), num(r.L, 4), num(r.frac * 100, 1) + '%']);
  }

  // ---------- 無障礙：畫布說明與參數播報 ----------
  // 離散事件（收放完成、鬆手、繩斷、收手、兩盤一起轉）寫進 aria-live 的 #status；
  // 改完條件後在 #srSay 播報一次（連續改動只念最後一次）；每格都在變的讀數不播報
  let sayTimer = 0, sayParamTimer = 0;
  function say(msg) {
    const el = $('srSay');
    if (!el) return;
    clearTimeout(sayTimer);
    el.textContent = '';
    sayTimer = setTimeout(function () { el.textContent = msg; }, 60);
  }
  const LU_T = ' kg·m²/s';
  function settingText() {
    if (S.mode === 'hole') {
      const p = holeParams(), L = p.m * p.v0 * p.r0;
      return T('小球 ' + num(p.m, 2) + ' kg、半徑 ' + num(p.r0, 2) + ' m、速率 ' + num(p.v0, 2) + ' m/s：角動量 ' + num(L, 3) + LU_T + '，張力 ' + num(p.m * p.v0 * p.v0 / p.r0, 2) + ' N。',
        'Ball ' + num(p.m, 2) + ' kg, radius ' + num(p.r0, 2) + ' m, speed ' + num(p.v0, 2) + ' m/s: angular momentum ' + num(L, 3) + LU_T + ', tension ' + num(p.m * p.v0 * p.v0 / p.r0, 2) + ' N.');
    }
    if (S.mode === 'plat') {
      const a = C.armChange(P.p, P.L, P.rOut, P.rIn);
      return T('伸手 I = ' + num(a.I1, 3) + '、收手 I = ' + num(a.I2, 3) + ' kg·m²；收手後角速度會從 ' + num(a.w1, 2) + ' 變成 ' + num(a.w2, 2) + ' rad/s。',
        'Arms out I = ' + num(a.I1, 3) + ', arms in I = ' + num(a.I2, 3) + ' kg·m²; pulling in changes the angular speed from ' + num(a.w1, 2) + ' to ' + num(a.w2, 2) + ' rad/s.');
    }
    const r = K.res;
    return T('兩盤相合後會以 ' + num(r.wf, 3) + ' rad/s 一起轉，動能損失 ' + num(r.frac * 100, 1) + '%。',
      'After coupling the discs will turn together at ' + num(r.wf, 3) + ' rad/s, losing ' + num(r.frac * 100, 1) + '% of the kinetic energy.');
  }
  function sayParams() {
    clearTimeout(sayParamTimer);
    sayParamTimer = setTimeout(function () { say(settingText()); }, 350);
  }
  /** 畫布的文字說明（role="img"）：模式、條件或階段改變時更新（不是每一格） */
  let labelKey = '';
  function updateLabel() {
    let key, zh, en;
    if (S.mode === 'hole') {
      const st = H.st, ph = st.phase, k = C.holeKin(st);
      key = ['h', H.p.m, H.p.r0, H.p.v0, ph, ph === 'hold' ? st.r.toFixed(3) : ''].join('|');
      const where = ph === 'free' ? T('繩子已不再拉著小球，小球沿直線等速滑出。', 'The string no longer pulls the ball; it slides off in a straight line at constant speed.')
        : ph === 'move' ? T('手正在收放繩子。', 'The hand is moving the string.')
          : T('小球在半徑 ' + num(st.r, 2) + ' m 的圓上逆時針轉，速率 ' + num(k.v, 2) + ' m/s。', 'The ball goes anticlockwise round a circle of radius ' + num(st.r, 2) + ' m at ' + num(k.v, 2) + ' m/s.');
      zh = '穿過小孔的繩子：俯視圖中，光滑桌面上 ' + num(H.p.m, 2) + ' kg 的小球由穿過中央小孔的繩子拉著，角動量 ' + num(st.L0, 3) + LU_T + ' 保持不變。' + where +
        '右邊是側視圖與速率對半徑的圖，下方是 L、K 與起始值的比隨時間變化的圖。';
      en = 'String through a hole: top view of a ' + num(H.p.m, 2) + ' kg ball on a smooth table held by a string through a central hole; its angular momentum stays at ' + num(st.L0, 3) + LU_T + '. ' + where +
        ' On the right are a side view and a speed–radius graph; below, L and K relative to their starting values against time.';
    } else if (S.mode === 'plat') {
      const I = platI(), w = platOmega();
      key = ['p', P.p.md, P.p.Mb, P.rOut, P.rIn, P.w1, !!P.mv, P.armsIn, !!P.drop].join('|');
      zh = '旋轉平台：俯視圖中，人站在無摩擦的平台上，雙手各拿 ' + num(P.p.md, 1) + ' kg 啞鈴，' + (P.drop ? '已鬆開啞鈴，' : P.armsIn ? '手臂收回，' : '手臂伸出，') +
        '轉動慣量 ' + num(I, 3) + ' kg·m²、角速度 ' + num(w, 2) + ' rad/s。右邊是正視圖與伸手、收手的比較長條圖，下方是 I、ω、L、K 隨時間的變化。';
      en = 'Turntable: top view of a person on a frictionless turntable holding a ' + num(P.p.md, 1) + ' kg dumbbell in each hand, ' + (P.drop ? 'dumbbells released, ' : P.armsIn ? 'arms in, ' : 'arms out, ') +
        'moment of inertia ' + num(I, 3) + ' kg·m², angular speed ' + num(w, 2) + ' rad/s. On the right are a front view and bars comparing arms out and in; below, I, ω, L and K against time.';
    } else {
      const r = K.res;
      key = ['d', K.p.M1, K.p.R1, K.p.w1, K.p.M2, K.p.R2, K.p.w2, K.p.mu, K.ph].join('|');
      const phz = { held: '上盤拿在下盤上方', fall: '上盤正在落下', slip: '兩盤互相滑動、摩擦生熱', locked: '兩盤已一起轉動' }[K.ph];
      const phe = { held: 'the upper disc is held above the lower one', fall: 'the upper disc is falling', slip: 'the discs slip against each other and friction makes heat', locked: 'the discs now turn together' }[K.ph];
      zh = '兩盤相合：同一根軸上兩個圓盤的俯視圖，' + phz + '。總角動量 ' + num(r.L, 3) + LU_T + ' 不變，最後轉速 ' + num(r.wf, 2) + ' rad/s。右邊是側視圖與相合前後的長條圖，下方是兩盤角速度隨時間的圖。';
      en = 'Two discs: top view of two discs on one axle; ' + phe + '. The total angular momentum stays at ' + num(r.L, 3) + LU_T + ' and the final rate is ' + num(r.wf, 2) + ' rad/s. On the right are a side view and before/after bars; below, both angular speeds against time.';
    }
    key += '|' + T('', 'en');
    if (key === labelKey) return;
    labelKey = key;
    cv.removeAttribute('data-en-aria-label'); // 改由程式依語言更新
    cv.setAttribute('aria-label', T(zh, en));
  }

  // ---------- 讀數 ----------
  const lastText = {};
  function setHTML(id, html) { if (lastText[id] === html) return; lastText[id] = html; $(id).innerHTML = html; }
  function updateReadout() {
    updateLabel();
    if (S.mode === 'hole') { updateHoleReadout(); syncTheta(); }
    else if (S.mode === 'plat') updatePlatReadout();
    else updateDiskReadout();
  }
  /** 位置角滑桿跟著小球（不觸發事件） */
  let lastThShown = null;
  function syncTheta() {
    const el = $('th'), hold = H.st.phase === 'hold';
    el.disabled = !hold;
    if (!hold) return;
    let deg = (H.st.th * 180 / Math.PI) % 360; if (deg < 0) deg += 360;
    if (lastThShown !== null && Math.abs(deg - lastThShown) < 0.05) return;
    lastThShown = deg;
    if (document.activeElement === el) return;
    if (window.LabNum) window.LabNum.clear(el);
    el.value = String(Math.round(deg));
    $('tho').textContent = num(deg, 1) + '°';
  }

  // ---------- 音效（音效關閉時完全不呼叫） ----------
  function sound() { const Sd = window.LabSound; return Sd && Sd.enabled() ? Sd : null; }
  function snapSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.noise({ dur: 0.05, gain: 0.85, filter: 2600, q: 0.9 });
    Sd.sweep({ from: 1500, to: 420, dur: 0.09, type: 'triangle', gain: 0.55 });
    Sd.tone({ freq: 330, dur: 0.12, type: 'sine', gain: 0.3, delay: 0.01 });
  }
  function letgoSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.noise({ dur: 0.03, gain: 0.25, filter: 3200, q: 1.5 });
    Sd.tone({ freq: 740, dur: 0.08, type: 'triangle', gain: 0.25 });
  }
  function armsSound(inward) {
    const Sd = sound(); if (!Sd) return;
    if (inward) Sd.sweep({ from: 420, to: 880, dur: 0.35, type: 'triangle', gain: 0.35 });
    else Sd.sweep({ from: 880, to: 420, dur: 0.35, type: 'triangle', gain: 0.35 });
  }
  function dropSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.tone({ freq: 1250, dur: 0.06, type: 'triangle', gain: 0.3 });
    Sd.tone({ freq: 1870, dur: 0.05, type: 'sine', gain: 0.2, delay: 0.01 });
    const tl = landTime();
    Sd.noise({ dur: 0.08, gain: 0.7, filter: 520, q: 0.8, delay: tl });
    Sd.tone({ freq: 290, dur: 0.1, type: 'sine', gain: 0.45, delay: tl });
  }
  function contactSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.noise({ dur: 0.04, gain: 0.6, filter: 1800, q: 1.1 });
    Sd.tone({ freq: 520, dur: 0.08, type: 'triangle', gain: 0.35 });
  }
  function lockSound() {
    const Sd = sound(); if (!Sd) return;
    Sd.tone({ freq: 880, dur: 0.1, type: 'sine', gain: 0.25 });
    Sd.tone({ freq: 1320, dur: 0.12, type: 'sine', gain: 0.15, delay: 0.06 });
  }
  /** 轉速對應的持續聲：f = 300·√ω（ω 變 4 倍，音高升一個八度） */
  let hum = [null, null];
  function humFreq(w) { return Math.max(260, Math.min(1700, 300 * Math.sqrt(Math.max(0.05, Math.abs(w))))); }
  function updateHum() {
    const Sd = sound();
    let ws = [];
    if (Sd && S.running) {
      if (S.mode === 'hole') ws = [Math.abs(H.st.om)];
      else if (S.mode === 'plat') ws = [platOmega()];
      else { const q = diskOmegas(); ws = [q[0], q[1]]; }
    }
    for (let i = 0; i < 2; i++) {
      const w = ws[i];
      const on = w != null && Math.abs(w) > 0.15;
      if (on) {
        const g = 0.06 + 0.03 * Math.min(1, Math.abs(w) / 10);
        if (!hum[i] || !hum[i].playing) hum[i] = Sd.voice({ freq: humFreq(w), type: 'triangle', gain: g });
        else hum[i].set({ freq: humFreq(w), gain: g }, 0.06);
      } else if (hum[i]) { hum[i].stop(0.15); hum[i] = null; }
    }
  }
  function stopHum() { hum.forEach(function (h) { if (h) h.stop(0.12); }); hum = [null, null]; }

  // ---------- 任務模式 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function tick(tNow) {
    if (!S.running) { loopOn = false; stopHum(); return; }
    const dt = Math.min((tNow - lastT) / 1000, 1 / 30) * (S.slow ? SLOW : 1);
    lastT = tNow;
    if (S.mode === 'hole') holeStep(dt);
    else if (S.mode === 'plat') platStep(dt);
    else diskStep(dt);
    updateHum();
    updateButtons();
    draw();
    if (S.running) requestAnimationFrame(tick); else { loopOn = false; stopHum(); }
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }
  function play() { S.running = true; updateButtons(); startLoop(); }
  function pause() { S.running = false; stopHum(); updateButtons(); requestDraw(); }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function setBtn(id, zh, en, html) {
    const b = $(id), text = T(zh, en);
    if (html) { if (b.innerHTML !== text) b.innerHTML = text; }
    else if (b.textContent !== text) b.textContent = text;
  }
  function updateButtons() {
    const ended = S.mode === 'hole' && H.exited;
    setBtn('play', S.running ? '暫停' : (curTime() > 0 && !ended ? '繼續' : '播放'), S.running ? 'Pause' : (curTime() > 0 && !ended ? 'Resume' : 'Play'));
    if (S.mode === 'hole') {
      const st = H.st, r1 = val($('r1'));
      if (st.phase === 'move') { setBtn('pull', st.pl.sgn < 0 ? '收繩中…' : '放繩中…', st.pl.sgn < 0 ? 'Pulling…' : 'Letting out…'); $('pull').disabled = true; }
      else if (st.phase === 'free') { setBtn('pull', '拉繩到 r<sub>1</sub>', 'Pull to r<sub>1</sub>', true); $('pull').disabled = true; }
      else if (Math.abs(r1 - st.r) < 0.004) { setBtn('pull', '已在 r<sub>1</sub>', 'Already at r<sub>1</sub>', true); $('pull').disabled = true; }
      else { setBtn('pull', r1 < st.r ? '拉繩到 r<sub>1</sub>' : '放繩到 r<sub>1</sub>', r1 < st.r ? 'Pull to r<sub>1</sub>' : 'Let out to r<sub>1</sub>', true); $('pull').disabled = false; }
      if (st.phase === 'free') setBtn('letgo', '重新開始', 'Start again'); else setBtn('letgo', '鬆手', 'Let go');
    } else if (S.mode === 'plat') {
      setBtn('arms', P.mv ? (P.mv.r1 < P.mv.r0 ? '收手中…' : '伸手中…') : (P.armsIn ? '伸手' : '收手'),
        P.mv ? (P.mv.r1 < P.mv.r0 ? 'Pulling in…' : 'Stretching…') : (P.armsIn ? 'Stretch arms out' : 'Pull arms in'));
      $('arms').disabled = !!(P.mv || P.drop);
      setBtn('dropDb', P.drop ? '拿回啞鈴' : '鬆開啞鈴', P.drop ? 'Pick the dumbbells up' : 'Let go of the dumbbells');
      $('dropDb').disabled = !P.drop && (!!P.mv || !(P.p.md > 0));
    } else {
      setBtn('dropDisk', K.ph === 'held' ? '放下上盤' : '拿起上盤', K.ph === 'held' ? 'Drop the upper disc' : 'Lift the upper disc');
    }
  }

  // ---------- 按鈕 ----------
  $('play').addEventListener('click', function () {
    if (S.running) { pause(); return; }
    if (S.mode === 'hole' && H.exited) { holeReset(false); setStatus(''); }
    setStatus($('status').textContent);
    play();
  });
  $('pull').addEventListener('click', function () {
    if (H.st.phase !== 'hold') return;
    const pl = C.holeStartMove(H.st, val($('r1')), val($('u')));
    if (!pl) return;
    setStatus(pl.sgn < 0 ? T('手以 ' + num(pl.uc, 2) + ' m/s 收繩……', 'The hand pulls the string in at ' + num(pl.uc, 2) + ' m/s…')
      : T('手以 ' + num(pl.uc, 2) + ' m/s 放繩……' + (pl.uc < val($('u')) - 1e-6 ? '（小球往外跑不了那麼快，繩子才不會鬆）' : ''),
        'The hand lets the string out at ' + num(pl.uc, 2) + ' m/s…' + (pl.uc < val($('u')) - 1e-6 ? ' (the ball cannot move out faster than this without the string going slack)' : '')));
    play();
  });
  $('letgo').addEventListener('click', function () {
    if (H.st.phase === 'free') { holeReset(false); setStatus(T('重新開始：小球回到起始半徑。', 'Started again: the ball is back at the starting radius.')); updateButtons(); requestDraw(); return; }
    C.holeRelease(H.st, 'letgo');
    H.handDepth = C.HOLE.rope - H.st.free.r;
    const k = C.holeKin(H.st);
    letgoSound();
    if (!reducedMotion) S.fx.push({ type: 'letgo', x: k.x, y: k.y, t0: performance.now(), dur: 350 });
    setStatus(T('鬆手了！張力消失，小球沿切線方向等速直線滑出；r⊥ = ' + num(k.rperp, 3) + ' m，L 不變。',
      'Let go! The tension is gone and the ball slides off in a straight line at constant speed; r⊥ = ' + num(k.rperp, 3) + ' m, so L is unchanged.'));
    recHole('free', T('鬆手', 'Let go'));
    emit('letgo', { r: k.r, v: k.v, vr: k.rd, rperp: k.rperp, L: k.L, m: H.st.m, x: k.x, y: k.y, vx: k.vx, vy: k.vy });
    play();
  });
  $('arms').addEventListener('click', startArms);
  $('dropDb').addEventListener('click', function () {
    if (P.drop) { platReset(); setStatus(T('拿回啞鈴，重新開始（手臂伸出）。', 'Dumbbells back in hand; starting again with the arms out.')); updateButtons(); requestDraw(); return; }
    dropDumbbells();
  });
  $('dropDisk').addEventListener('click', dropDisk);
  $('reset').addEventListener('click', function () {
    clearRows({ hole: 'recHole', plat: 'recPlat', disk: 'recDisk' }[S.mode]);
    if (S.mode === 'hole') holeReset(false);
    else if (S.mode === 'plat') platReset();
    else diskReset();
    S.fx = [];
    setStatus(T('已全部清除，滑桿設定不變。', 'Everything is cleared; the slider settings are kept.'));
    updateButtons();
    requestDraw();
  });
  $('slow').addEventListener('change', function (ev) { S.slow = ev.target.checked; requestDraw(); });
  [['showV', H, 'v'], ['showT', H, 'T'], ['showTrail', H, 'trail'], ['showArea', H, 'area'], ['showTarget', H, 'target'],
    ['showVd', P, 'vd'], ['showRing', P, 'ring'], ['showW', K, 'w'], ['showFr', K, 'fr']].forEach(function (it) {
    $(it[0]).addEventListener('change', function (ev) { it[1].show[it[2]] = ev.target.checked; if (view3 && view3.active) view3.update(); requestDraw(); });
  });

  // 喇叭按鈕：切換全站音效設定
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
    if (!window.LabSettings.get('sound')) stopHum();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); if (!ev.detail.value) stopHum(); } });

  // ---------- 滑桿 ----------
  const UNITS = { m1: 'kg', r0: 'm', v0: 'm/s', r1: 'm', u: 'm/s', th: '°', md: 'kg', rOut: 'm', rIn: 'm', w1: 'rad/s', Mb: 'kg',
    M1: 'kg', R1: 'm', wA: 'rad/s', M2: 'kg', R2: 'm', wB: 'rad/s', mu: '' };
  function showOut(id) { const el = $(id); $(id + 'o').textContent = fmtSlider(val(el), el) + (UNITS[id] ? (UNITS[id] === '°' ? '°' : ' ' + UNITS[id]) : ''); }
  Object.keys(UNITS).forEach(function (id) {
    const el = $(id);
    el.addEventListener('input', function () {
      showOut(id);
      if (id === 'm1' || id === 'r0' || id === 'v0') { holeReset(true); setStatus(''); }
      else if (id === 'r1' || id === 'u') { /* 下一次收放才用到 */ }
      else if (id === 'th') {
        if (H.st.phase === 'hold') {
          // 分享連結還原設定時不暫停（只在學生自己調整位置角時暫停）
          if (S.running && !(window.LabShare && window.LabShare.restoring)) pause();
          H.st.th = val(el) * Math.PI / 180;
          lastThShown = val(el);
          H.hist = []; pushHist(false);
          setStatus(T('位置角改成 ' + num(val(el), 1) + '°（暫停中）。按「鬆手」看小球沿切線飛出。', 'Position angle set to ' + num(val(el), 1) + '° (paused). Press “Let go” to see the ball leave along the tangent.'));
        }
      } else if (['md', 'rOut', 'rIn', 'w1', 'Mb'].indexOf(id) >= 0) { platReset(); setStatus(''); }
      else { diskReset(); setStatus(''); }
      if (view3 && view3.active) view3.update();
      if (id !== 'th') sayParams();
      updateButtons();
      requestDraw();
    });
  });

  // ---------- 實驗切換 ----------
  const MODES = { hole: 'modeHole', plat: 'modePlat', disk: 'modeDisk' };
  function setMode(m) {
    if (m === S.mode) return;
    stopHum();
    S.mode = m;
    S.fx = [];
    Object.keys(MODES).forEach(function (k) { $(MODES[k]).setAttribute('aria-pressed', String(k === m)); });
    document.querySelectorAll('.am [data-mode]').forEach(function (el) { el.hidden = el.getAttribute('data-mode') !== m; });
    setStatus('');
    bgKey = '';
    updateButtons();
    if (view3 && view3.active) view3.setMode(m);
    if (S.running) startLoop();
    requestDraw();
  }
  $('modeHole').addEventListener('click', function () { setMode('hole'); });
  $('modePlat').addEventListener('click', function () { setMode('plat'); });
  $('modeDisk').addEventListener('click', function () { setMode('disk'); });

  // =====================================================================
  // 3D 檢視（three.js 以 import() 延遲載入；場景在 angular-momentum-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  /** 給 3D 的狀態（同一個物理核心算出來的量，單位 m） */
  function state3() {
    if (S.mode === 'hole') {
      const st = H.st, k = C.holeKin(st), free = st.phase === 'free';
      const trailT = st.t - Math.min(10, Math.max(1.5, free ? 30 : 2 * Math.PI / Math.max(1e-6, Math.abs(st.om))));
      return {
        mode: 'hole', x: k.x, y: k.y, r: k.r, vx: k.vx, vy: k.vy, v: k.v, T: k.T, L: k.L, free: free, why: free ? st.free.why : '',
        hang: free ? Math.max(0, C.HOLE.rope - k.r) : C.HOLE.rope - k.r, handDepth: free ? (H.handDepth || 0) : C.HOLE.rope - k.r,
        rope: C.HOLE.rope, trail: H.show.trail ? H.hist.filter(function (p) { return p.t >= trailT || (free && p.t >= st.free.t0 - 0.2); }).map(function (p) { return [p.x, p.y]; }) : [],
        showV: H.show.v, showT: H.show.T, target: H.show.target ? TARGET : null, scaleV: SCALE_V, scaleT: SCALE_T, maxArrow: MAX_ARROW
      };
    }
    if (S.mode === 'plat') {
      const dumb = [];
      if (P.drop && P.p.md > 0) {
        const tl = landTime(), tau = Math.min(P.drop.tau, tl);
        P.drop.db.forEach(function (d) {
          dumb.push({ x: d.x + d.vx * tau, y: d.y + d.vy * tau, z: Math.max(0, P.drop.hy - 0.5 * C.G0 * tau * tau), vx: d.vx, vy: d.vy,
            yaw: P.drop.phi0 + P.drop.w * tau, landed: P.drop.tau >= tl });
        });
      }
      return {
        mode: 'plat', phi: P.phi, r: P.r, md: P.p.md, posture: posture(P.r), dropped: !!P.drop, dumb: dumb, w: platOmega(), L: platLsys(),
        Ltot: P.drop ? P.drop.Lbefore : P.L, showV: P.show.vd, rOut: P.rOut, rIn: P.rIn, hOut: handHeight(P.rOut), hIn: handHeight(P.rIn), showRing: P.show.ring
      };
    }
    const q = diskOmegas(), a = diskAngles();
    return { mode: 'disk', R1: K.p.R1, R2: K.p.R2, M1: K.p.M1, M2: K.p.M2, a1: a[0], a2: a[1], w1: q[0], w2: q[1], h: upperHeight(), h0: C.DISK.h0,
      slip: K.ph === 'slip' ? Math.abs(q[0] - q[1]) / Math.max(1e-9, Math.abs(K.p.w1 - K.p.w2)) : 0,
      phase: K.ph, L: K.res.L, held: K.ph === 'held', showW: K.show.w, showFr: K.show.fr };
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.AngMom3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.AngMom3D.create(lib, {
          host: $('view3'), core: C, T: T, state: state3, mode: S.mode,
          tokens: function () { readColors(); return Object.assign({}, col, { dark: D.dark }); },
          lost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
        });
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update();
        requestDraw();
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
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 啟動 ----------
  readColors();
  Object.keys(UNITS).forEach(showOut);
  holeReset(false);
  platReset();
  diskReset();
  updateSoundButton();
  updateButtons();
  function themeChanged() { readColors(); bgKey = ''; if (view3 && view3.active) view3.onTheme(); requestDraw(); }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', themeChanged);
  }
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  }
  window.addEventListener('resize', function () { resize(); });
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
  if (S.running) startLoop();
  // 測試與縮圖用的小介面（不影響物理）
  window.__am = { setMode: setMode, state: function () { return { mode: S.mode, hole: H.st, plat: P, disk: K }; }, setView: setView };
})();
