/*
 * reaction-rate.js — 「反應速率與碰撞學說」的頁面程式（畫面、操作、圖表、任務事件）
 * 化學核心在 js/reaction-rate-core.js（RateCore）；3D 檢視在 js/reaction-rate-3d.js（Rate3D）。
 * 這個檔案不做任何化學計算以外的「美化修正」：畫面上的分子位置、碰撞與反應都直接來自核心的模擬。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'tick'：模擬進行中每 0.5 秒一次 { run（這一次的摘要）, runs（數據表所有的列，含這一次）, eq（最近 500 ps 的正逆反應次數）,
 *           arr（同一反應、不同溫度的阿瑞尼斯擬合）, speed }
 *   'answer'：未知反應按「核對答案」{ ans, err（相對誤差，取對門檻 E0 與對圖上應得值兩者較小的）, nT（量過的溫度數）, tries, revealed }
 */
(function () {
  'use strict';
  const K = window.RateCore, LD = window.LabDraw;
  if (!K || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const isEn = !!(window.LabSettings && window.LabSettings.lang === 'en');
  const reducedMotion = LD.reducedMotion();

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  /** 科學記號的兩部分：{ m: '1.23', e: 9 }（|x| 在 0.01–1000 之間時 e = null） */
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 3) return { m: num(x, Math.max(0, (sig || 3) - 1 - e)), e: null };
    let m = x / Math.pow(10, e);
    let mm = num(m, (sig || 3) - 1);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(x * (1 + 1e-12), sig); // 進位到 10.0 的情形（極少見）
    return { m: mm, e: e };
  }
  function sciHTML(x, sig) {
    const p = sciParts(x, sig);
    return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>';
  }
  function pct(x, d) { return x == null || !isFinite(x) ? '—' : num(100 * x, d == null ? 1 : d) + '%'; }

  // ======================= 元素 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const elT = $('temp'), elEa = $('ea'), elDH = $('dh'), elNA = $('na'), elNB = $('nb');
  const elCat = $('cat'), elSt = $('steric'), elHeat = $('heatGas');
  const statusEl = $('status');
  function val(el) { return window.LabNum ? window.LabNum.value(el) : +el.value; }
  function setVal(el, v) { if (window.LabNum) window.LabNum.set(el, v); else el.value = v; }

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c;
    col = {
      A: c.neg || '#2f6fd0', B: c.pos || '#d1453b', C: c.probe || '#0d7f57', D: c.equi || '#8a5a00',
      text: c.text, muted: c.muted, border: c.border, grid: c.grid, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      dark: LD.dark
    };
  }
  function spColor(sp) { return sp === K.A ? col.A : sp === K.B ? col.B : sp === K.C ? col.C : col.D; }
  /** 溫度的顏色：200 K 偏藍、400 K 中性、1000 K 偏紅（只用來提示冷熱） */
  function tempColor(Tk) {
    if (Tk <= 400) return LD.mix(col.A, col.muted, Math.max(0, Math.min(1, (Tk - 200) / 200)));
    return LD.mix(col.muted, col.B, Math.max(0, Math.min(1, (Tk - 400) / 600)));
  }

  // ======================= 狀態 =======================
  const SPEEDS = [2, 20, 200];                 // ps／秒
  const state = { running: !reducedMotion, speed: 1, tab: 'energy', emode: 'ke', view: '2d' };
  let cur = null;                              // 這一次實驗
  let runs = [];                               // 已結束的實驗（摘要）
  let runSeq = 0;
  let mys = null;                              // 未知反應 { id, E0, tries, revealed, solved }
  let mysSeq = 0;
  let userActed = false;
  let view3 = null;
  const flashes = [];                          // 畫面上的閃光 { x, y, z, kind, t0 }
  const FL_DUR = 650, FL_MAX = 90;

  function cfg() {
    if (mys) return { T: val(elT), Ea: mys.E0, dH: -30, cat: false, steric: false, heat: false, nA: val(elNA), nB: val(elNB), mys: mys.id };
    return { T: val(elT), Ea: val(elEa), dH: val(elDH), cat: elCat.checked, steric: elSt.checked, heat: elHeat.checked, nA: val(elNA), nB: val(elNB), mys: 0 };
  }
  function keyOf(c) { return c.mys ? 'm' + c.mys : [c.Ea, c.dH, c.cat ? 1 : 0, c.steric ? 1 : 0].join('|'); }

  function makeRun() {
    const c = cfg();
    const sim = K.createSim({ T: c.T, Ea: c.Ea, dH: c.dH, cat: c.cat, steric: c.steric, nA: c.nA, nB: c.nB, heat: c.heat ? 'gas' : 'bath' });
    sim.keepEvents = true;
    // 分子動能直方圖的範圍：看得到 Ea 與分布的尾巴
    const EaU = K.effectiveEa(c.Ea, c.dH, false);
    const Emax = Math.max(10, Math.min(70, Math.max(7 * K.RT(c.T), 1.3 * EaU + 3)));
    return {
      id: ++runSeq, cfg: c, key: keyOf(c), sim: sim, slowFwd: 0, Tgas: c.T, TgasMax: c.T,
      eqS: [{ t: 0, f: 0, r: 0 }], nextEq: 5, Emax: Emax, keHist: new Float64Array(40), keTot: 0,
      halfSaid: false, recent: []
    };
  }
  /** 一次實驗的摘要（數據表、圖、任務共用） */
  function summary(r) {
    const s = r.sim, st = s.stats, m = K.measure(s), c = r.cfg;
    const lim = Math.min(s.n0[K.A], s.n0[K.B]);
    return {
      id: r.id, key: r.key, mys: c.mys, T: c.T, Ea: c.mys ? null : c.Ea, EaF: c.mys ? null : s.EaF, dH: c.dH,
      cat: c.cat, steric: c.steric, heat: c.heat, nA: c.nA, nB: c.nB,
      t: s.t, collAB: st.collAB, enoughAB: st.enoughAB, fwd: st.fwd, rev: st.rev,
      k: st.fwd > 0 ? m.kF_SI : null, kErr: m.relErrF, rate0: m.rate0, rate0n: m.rate0n, tHalf: st.tHalf, t10: st.t10,
      conv: lim > 0 ? (st.fwd - st.rev) / lim : 0,
      fracObs: m.fracObs, effObs: m.effObs, fracTh: c.mys ? null : K.fracAbove(s.EaF, c.T),
      Tgas: r.Tgas, TgasMax: r.TgasMax, slowFwd: r.slowFwd
    };
  }

  // ======================= 模擬控制 =======================
  function newRun(say) {
    if (cur && cur.sim.t >= 5 && cur.sim.stats.collAB > 0) {
      runs.push(summary(cur));
      if (runs.length > 40) runs.shift();
    }
    cur = makeRun();
    flashes.length = 0;
    if (say) setStatus(say);
    refreshAll();
  }
  function setStatus(s) { statusEl.textContent = s; }

  // ---------- 動畫迴圈 ----------
  let raf = 0, lastTs = 0, lagEma = 1, lastTick = 0, lastRead = 0, lastTable = 0;
  let lastSnd = 0, lastSnd1 = 0;
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    if (!state.running) return;
    const dtw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dtw > 0) advanceSim(dtw);
    drawAll();
    if (view3 && view3.active) view3.frame();
    const now = performance.now();
    if (now - lastRead > 250) { lastRead = now; updateReadouts(); }
    if (now - lastTable > 600) { lastTable = now; renderTable(); }
    if (userActed && now - lastTick > 500) { lastTick = now; emitTick(); }
    raf = requestAnimationFrame(loop);
  }
  function advanceSim(dtw) {
    const s = cur.sim, want = SPEEDS[state.speed] * dtw;
    const t0 = performance.now(), budget = 13;
    let done = 0, n = 0;
    while (done < want - 1e-9) {
      const d = Math.min(K.DT, want - done);
      K.step(s, d);
      done += d;
      if ((++n & 15) === 0 && performance.now() - t0 > budget) break;
    }
    lagEma += 0.08 * (done / want - lagEma);
    afterSteps();
  }
  function afterSteps() {
    const r = cur, s = r.sim, now = performance.now();
    // 事件 → 閃光、聲音
    const ev = s.ev;
    for (let k = 0; k < ev.length; k++) {
      const e = ev[k];
      if (e.ab) { r.recent.push({ E: e.E, kind: e.kind, t0: now }); if (r.recent.length > 40) r.recent.shift(); }
      if (e.kind === 0) continue;
      if (e.kind === 2 && state.speed === 0) r.slowFwd++;
      if (flashes.length >= FL_MAX) flashes.shift();
      flashes.push({ x: e.x, y: e.y, z: e.z, kind: e.kind, t0: now });
      if (window.LabSound && window.LabSound.enabled()) {
        if (e.kind >= 2 && now - lastSnd > 110) {
          lastSnd = now;
          window.LabSound.tone({ freq: e.kind === 2 ? 784 : 587, dur: 0.07, type: 'sine', gain: 0.1 });
        } else if (e.kind === 1 && state.speed < 2 && now - lastSnd1 > 160) {
          lastSnd1 = now;
          window.LabSound.tone({ freq: 330, dur: 0.05, type: 'triangle', gain: 0.05 });
        }
      }
    }
    ev.length = 0;
    // 氣體溫度、動能直方圖
    r.Tgas = K.kineticTemp(s);
    if (s.t > 2) r.TgasMax = Math.max(r.TgasMax, r.Tgas);
    const bw = r.Emax / r.keHist.length;
    for (let i = 0; i < s.N; i++) {
      const E = 0.5 * K.M * (s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i] + s.vz[i] * s.vz[i]);
      const b = Math.floor(E / bw);
      if (b < r.keHist.length) r.keHist[b]++;
      r.keTot++;
    }
    // 最近 500 ps 的正逆反應（每 5 ps 記一點）
    while (s.t >= r.nextEq) {
      r.eqS.push({ t: s.t, f: s.stats.fwd, r: s.stats.rev });
      r.nextEq += 5;
      if (r.eqS.length > 400) r.eqS.splice(1, 1);
    }
    // 半生期
    if (!r.halfSaid && s.stats.tHalf != null) {
      r.halfSaid = true;
      setStatus(T('A 已用掉一半：半生期 ', 'Half of A has reacted: half-life ') + num(s.stats.tHalf, 0) + ' ps' + T('。', '.'));
      if (window.LabSound && window.LabSound.enabled()) {
        window.LabSound.tone({ freq: 1047, dur: 0.12, gain: 0.16 });
        window.LabSound.tone({ freq: 1319, dur: 0.16, gain: 0.13, delay: 0.1 });
      }
    }
  }
  function eqWindow(r) {
    const s = r.sim, list = r.eqS;
    let base = list[0];
    for (let i = list.length - 1; i >= 0; i--) if (list[i].t <= s.t - 500 + 1e-9) { base = list[i]; break; }
    return { span: s.t - base.t, f: s.stats.fwd - base.f, r: s.stats.rev - base.r };
  }

  // ======================= 2D 透視容器 =======================
  let cw = 0, ch = 0, dpr = 1;
  const YAW = -35 * Math.PI / 180, PITCH = 22 * Math.PI / 180, CAMD = 46;
  const cyw = Math.cos(YAW), syw = Math.sin(YAW), cp = Math.cos(PITCH), spp = Math.sin(PITCH);
  const HL = K.L / 2, WL = HL + K.D / 2;      // 分子中心可到達的半邊長、畫出來的器壁
  const cam = { F: 1, cx: 0, cy: 0 };
  /** 模擬座標（nm）→ 畫面。out：{ x, y, d（朝向觀眾的深度）, s（透視縮放）} */
  function proj(x, y, z, out) {
    const X = x - HL, Y = y - HL, Z = z - HL;
    const x1 = X * cyw + Z * syw, z1 = -X * syw + Z * cyw;
    const y2 = Y * cp - z1 * spp, d = z1 * cp + Y * spp;
    const s = CAMD / (CAMD - d);
    out.x = cam.cx + cam.F * x1 * s; out.y = cam.cy - cam.F * y2 * s; out.d = d; out.s = s;
    return out;
  }
  const CORNERS = [];
  [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { [-1, 1].forEach(function (c) { CORNERS.push([a, b, c]); }); }); });
  function cornerPos(c) { return [HL + c[0] * WL, HL + c[1] * WL, HL + c[2] * WL]; }
  function fitCamera() {
    cam.F = 1; cam.cx = 0; cam.cy = 0;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const o = {};
    CORNERS.forEach(function (c) { const p = cornerPos(c); proj(p[0], p[1], p[2], o); x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x); y0 = Math.min(y0, o.y); y1 = Math.max(y1, o.y); });
    const mT = 34, mB = 14, mX = 12;
    const F = Math.min((cw - 2 * mX) / (x1 - x0), (ch - mT - mB) / (y1 - y0));
    cam.F = F;
    cam.cx = cw / 2 - F * (x0 + x1) / 2;
    cam.cy = mT + (ch - mT - mB) / 2 - F * (y0 + y1) / 2;
  }
  // 立方體的六個面（頂點以 CORNERS 的索引表示）與外法向量
  const FACES = [
    { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]] },
    { n: [1, 0, 0], v: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
    { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
    { n: [0, 1, 0], v: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] }
  ];
  function faceFront(f) {
    // 面的中心往外移一點，若更靠近觀眾，就是朝向觀眾的面
    const a = {}, b = {};
    proj(HL + f.n[0] * WL, HL + f.n[1] * WL, HL + f.n[2] * WL, a);
    proj(HL + f.n[0] * (WL + 1), HL + f.n[1] * (WL + 1), HL + f.n[2] * (WL + 1), b);
    // 透視：視線由相機到面中心；用深度差近似（相機距離遠大於容器）
    return b.d > a.d + 0.02 * (b.s - a.s);
  }

  let sortIdx = new Int32Array(0), px = new Float32Array(0), py = new Float32Array(0), pd = new Float32Array(0), ps = new Float32Array(0);
  function ensureBuf(n) {
    if (sortIdx.length >= n) return;
    sortIdx = new Int32Array(n); px = new Float32Array(n); py = new Float32Array(n); pd = new Float32Array(n); ps = new Float32Array(n);
  }
  const _o = {};

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 560 ? Math.round(Math.max(320, w * 0.95)) : Math.round(Math.min(480, Math.max(380, w * 0.62)));
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    fitCamera();
    resizeGraph();
    drawAll();
  }

  function drawBox(front) {
    const Tw = cur ? cur.cfg.T : 400;
    const tc = tempColor(Tw);
    ctx.save();
    FACES.forEach(function (f) {
      const isFront = faceFront(f);
      if (isFront !== front) return;
      const pts = f.v.map(function (c) { const p = cornerPos(c); return proj(p[0], p[1], p[2], {}); });
      ctx.beginPath();
      pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath();
      if (!front) {
        ctx.fillStyle = LD.alpha(tc, col.dark ? 0.1 : 0.06);
        ctx.fill();
        // 底面與背面的細格線（每 2 nm）：看得出深度
        ctx.strokeStyle = LD.alpha(col.text, col.dark ? 0.07 : 0.06);
        ctx.lineWidth = 1;
        const ax = f.n[0] !== 0 ? [1, 2] : f.n[1] !== 0 ? [0, 2] : [0, 1];
        const fixed = f.n[0] !== 0 ? 0 : f.n[1] !== 0 ? 1 : 2;
        const sgn = f.n[fixed];
        ax.forEach(function (axis) {
          const other = ax[0] === axis ? ax[1] : ax[0];
          for (let g = -WL + 2.3; g < WL - 0.2; g += 2) {
            const a = [0, 0, 0], b = [0, 0, 0];
            a[fixed] = b[fixed] = HL + sgn * WL;
            a[axis] = b[axis] = HL + g;
            a[other] = HL - WL; b[other] = HL + WL;
            const pa = proj(a[0], a[1], a[2], {}), pb = proj(b[0], b[1], b[2], {});
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          }
        });
      } else {
        // 正面的玻璃：極淡的反光
        const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
        g.addColorStop(0, LD.alpha(col.surface, col.dark ? 0.04 : 0.1));
        g.addColorStop(0.5, LD.alpha(col.surface, 0));
        g.addColorStop(1, LD.alpha(col.surface, col.dark ? 0.03 : 0.06));
        ctx.fillStyle = g;
        ctx.fill();
      }
    });
    // 稜線：兩個相鄰面都是背面的畫在分子後面，其餘畫在前面
    const backSet = FACES.map(function (f) { return !faceFront(f); });
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const a = CORNERS[i], b = CORNERS[j];
      let diff = 0, ax = -1;
      for (let k = 0; k < 3; k++) if (a[k] !== b[k]) { diff++; ax = k; }
      if (diff !== 1) continue;
      // 這條稜線屬於哪兩個面
      const fs = [];
      FACES.forEach(function (f, fi) {
        const k = f.n[0] ? 0 : f.n[1] ? 1 : 2;
        if (k !== ax && a[k] === f.n[k] && b[k] === f.n[k]) fs.push(fi);
      });
      const isBack = fs.every(function (fi) { return backSet[fi]; });
      if (isBack === front) continue;
      const pa = cornerPos(a), pb = cornerPos(b);
      const p1 = proj(pa[0], pa[1], pa[2], {}), p2 = proj(pb[0], pb[1], pb[2], {});
      ctx.strokeStyle = front ? LD.alpha(tc, col.dark ? 0.85 : 0.75) : LD.alpha(tc, col.dark ? 0.45 : 0.4);
      ctx.lineWidth = front ? 2 : 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMolecules() {
    const s = cur.sim, N = s.N;
    ensureBuf(N);
    for (let i = 0; i < N; i++) {
      proj(s.x[i], s.y[i], s.z[i], _o);
      px[i] = _o.x; py[i] = _o.y; pd[i] = _o.d; ps[i] = _o.s; sortIdx[i] = i;
    }
    const idx = Array.prototype.slice.call(sortIdx.subarray(0, N));
    idx.sort(function (a, b) { return pd[a] - pd[b]; });
    // 地板上的影子（高度越高越淡）：立體感
    ctx.save();
    ctx.fillStyle = col.dark ? 'rgba(0,0,0,0.3)' : LD.alpha(col.text, 0.07);
    for (let k = 0; k < N; k++) {
      const i = idx[k];
      proj(s.x[i], -K.D / 2, s.z[i], _o);
      const h = s.y[i] / K.L;
      const rr = cam.F * K.D / 2 * _o.s * (1 + 0.5 * h);
      ctx.globalAlpha = 0.9 * (1 - 0.7 * h);
      ctx.beginPath(); ctx.ellipse(_o.x, _o.y, rr, rr * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const steric = cur.cfg.steric;
    const dmin = -WL * 1.8, dspan = WL * 3.6;
    for (let k = 0; k < N; k++) {
      const i = idx[k], sp = s.sp[i];
      const r = Math.max(1.5, Math.round(cam.F * K.D / 2 * ps[i] * 4) / 4);
      const fog = Math.max(0, Math.min(1, (pd[i] - dmin) / dspan));
      ctx.globalAlpha = 0.72 + 0.28 * fog;
      LD.ball(ctx, px[i], py[i], r, spColor(sp));
      if (steric && (sp === K.A || sp === K.C)) {
        // 可反應的一端：朝向觀眾那一半才看得到
        const ux = s.ux[i], uy = s.uy[i], uz = s.uz[i];
        const x1 = ux * cyw + uz * syw, z1 = -ux * syw + uz * cyw;
        const y2 = uy * cp - z1 * spp, dz = z1 * cp + uy * spp;
        if (dz > -0.2) {
          ctx.globalAlpha = (0.72 + 0.28 * fog) * Math.min(1, (dz + 0.2) / 0.5);
          ctx.fillStyle = col.dark ? '#ffffff' : col.surface;
          ctx.strokeStyle = LD.alpha(col.dark ? '#000000' : col.text, 0.6);
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(px[i] + x1 * r * 0.62, py[i] - y2 * r * 0.62, r * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFlashes(now) {
    for (let k = flashes.length - 1; k >= 0; k--) if (now - flashes[k].t0 > FL_DUR) flashes.splice(k, 1);
    flashes.forEach(function (f) {
      const u = (now - f.t0) / FL_DUR;
      proj(f.x, f.y, f.z, _o);
      const r0 = cam.F * K.D / 2 * _o.s;
      if (f.kind === 1) {
        ctx.save();
        ctx.strokeStyle = LD.alpha(col.muted, 0.7 * (1 - u));
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(_o.x, _o.y, r0 * (1.3 + 1.2 * u), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        return;
      }
      const c = f.kind === 2 ? col.C : col.A;
      const g = ctx.createRadialGradient(_o.x, _o.y, 0, _o.x, _o.y, r0 * (2.2 + 1.5 * u));
      g.addColorStop(0, LD.alpha(col.dark ? '#ffffff' : c, 0.7 * (1 - u)));
      g.addColorStop(0.4, LD.alpha(c, 0.4 * (1 - u)));
      g.addColorStop(1, LD.alpha(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(_o.x, _o.y, r0 * (2.2 + 1.5 * u), 0, Math.PI * 2); ctx.fill();
      LD.ripple(ctx, _o.x, _o.y, r0 * 1.2, u, c);
    });
  }

  function hudInfo() {
    const r = cur, s = r.sim;
    const heat = r.cfg.heat;
    return {
      t: T('t = ', 't = ') + num(s.t, s.t < 100 ? 1 : 0) + ' ps',
      temp: heat ? T('氣體 ', 'Gas ') + num(r.Tgas, 0) + ' K' : T('器壁 ', 'Walls ') + num(r.cfg.T, 0) + ' K',
      tcol: tempColor(heat ? r.Tgas : r.cfg.T),
      paused: !state.running,
      lag: state.running && lagEma < 0.7 ? T('這台裝置目前約 ', 'This device manages about ') + num(SPEEDS[state.speed] * lagEma, 0) + T(' ps/秒', ' ps/s') : ''
    };
  }

  function drawStage() {
    if (!cur || !cw || state.view === '3d') return;
    const now = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(ctx, cw, ch);
    drawBox(false);
    drawMolecules();
    drawFlashes(now);
    drawBox(true);
    const h = hudInfo();
    const font = '600 ' + 12 * (window.LabSettings && window.LabSettings.get('fs') || 1) + 'px ' + LD.FONT;
    LD.pill(ctx, h.t, 10, 24, col.text, 'left', font);
    LD.pill(ctx, h.temp, cw - 10, 24, LD.shade(h.tcol, col.dark ? 0.3 : -0.2), 'right', font);
    if (h.paused) LD.pill(ctx, T('已暫停', 'Paused'), cw / 2, 24, col.muted, 'center', font);
    else if (h.lag) LD.haloText(ctx, h.lag, cw / 2, ch - 8, col.muted, 'center', 'alphabetic', '11px ' + LD.FONT);
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w;
    gh = w < 560 ? Math.round(Math.max(260, w * 0.78)) : 330;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  /** 文字含上下標：parts = [[文字, 0 一般／1 上標／−1 下標], …] */
  function rich(g, parts, x, y, color, size, align, weight) {
    size = size || fsz(12);
    const f0 = (weight || '') + ' ' + size + 'px ' + LD.FONT, f1 = (weight || '') + ' ' + (size * 0.72).toFixed(1) + 'px ' + LD.FONT;
    let w = 0;
    parts.forEach(function (p) { g.font = p[1] ? f1 : f0; w += g.measureText(p[0]).width; });
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = color;
    parts.forEach(function (p) {
      g.font = p[1] ? f1 : f0;
      g.fillText(p[0], cx, y + (p[1] > 0 ? -size * 0.38 : p[1] < 0 ? size * 0.22 : 0));
      cx += g.measureText(p[0]).width;
    });
    return w;
  }
  function niceStep(span, n) {
    const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  /** 畫座標軸，傳回換算函式。o：{ x0, x1, y0, y1, xl（軸名 parts）, yl, xdec, ydec, xticks, yticks } */
  function axes(g, o) {
    const narrow = gw < 480;
    const L = narrow ? 44 : 54, R = 12, Tp = 30, B = narrow ? 40 : 42;
    const X0 = L, X1 = gw - R, Y0 = gh - B, Y1 = Tp;
    const sx = function (v) { return X0 + (v - o.x0) / (o.x1 - o.x0) * (X1 - X0); };
    const sy = function (v) { return Y0 - (v - o.y0) / (o.y1 - o.y0) * (Y0 - Y1); };
    g.save();
    g.strokeStyle = LD.alpha(col.text, col.dark ? 0.1 : 0.08);
    g.lineWidth = 1;
    const xs = niceStep(o.x1 - o.x0, o.xticks || (narrow ? 4 : 6)), ys = niceStep(o.y1 - o.y0, o.yticks || 5);
    g.font = fsz(11) + 'px ' + LD.FONT;
    g.fillStyle = col.muted;
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let v = Math.ceil(o.x0 / xs - 1e-9) * xs; v <= o.x1 + 1e-9; v += xs) {
      const X = Math.round(sx(v)) + 0.5;
      g.beginPath(); g.moveTo(X, Y1); g.lineTo(X, Y0); g.stroke();
      g.fillText(num(v, o.xdec != null ? o.xdec : (xs < 1 ? Math.ceil(-Math.log10(xs)) : 0)), X, Y0 + 4);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(o.y0 / ys - 1e-9) * ys; v <= o.y1 + 1e-9; v += ys) {
      const Y = Math.round(sy(v)) + 0.5;
      g.beginPath(); g.moveTo(X0, Y); g.lineTo(X1, Y); g.stroke();
      g.fillText(num(v, o.ydec != null ? o.ydec : (ys < 1 ? Math.ceil(-Math.log10(ys) - 1e-9) : 0)), X0 - 5, Y);
    }
    g.strokeStyle = LD.alpha(col.text, 0.55);
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(X0, Y1); g.lineTo(X0, Y0); g.lineTo(X1, Y0); g.stroke();
    if (o.xl) rich(g, o.xl, (X0 + X1) / 2, gh - 6, col.muted, fsz(12), 'center');
    if (o.yl) rich(g, o.yl, 4, 16, col.muted, fsz(12), 'left');
    g.restore();
    return { sx: sx, sy: sy, X0: X0, X1: X1, Y0: Y0, Y1: Y1 };
  }
  function line(g, pts, color, width, dash) {
    g.save();
    g.strokeStyle = color; g.lineWidth = width || 2; g.lineJoin = 'round';
    if (dash) g.setLineDash(dash);
    g.beginPath();
    pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.stroke();
    g.restore();
  }
  function note(g, text, x, y, color, align) {
    LD.haloText(g, text, x, y, color || col.text, align || 'left', 'alphabetic', fsz(12) + 'px ' + LD.FONT);
  }
  const EA = [['E', 0], ['a', -1]];

  function drawGraph() {
    if (!cur || !gw) return;
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col.bg; g.fillRect(0, 0, gw, gh);
    if (state.tab === 'energy') drawEnergy(g);
    else if (state.tab === 'profile') drawProfile(g);
    else if (state.tab === 'conc') drawConc(g);
    else drawArr(g);
  }

  function drawEnergy(g) {
    const r = cur, c = r.cfg, s = r.sim, hide = !!c.mys;
    const EaF = s.EaF, EaU = K.effectiveEa(c.Ea, c.dH, false);
    const RT = K.RT(c.T);
    if (state.emode === 'ke') {
      const Emax = r.Emax, nb = r.keHist.length, bw = Emax / nb;
      let ymax = 0;
      for (let E = 0.01; E < Emax; E += Emax / 200) ymax = Math.max(ymax, K.keDensity(E, c.T));
      const prev = prevT();
      if (prev) for (let E = 0.01; E < Emax; E += Emax / 200) ymax = Math.max(ymax, K.keDensity(E, prev));
      for (let b = 0; b < nb; b++) if (r.keTot) ymax = Math.max(ymax, r.keHist[b] / (r.keTot * bw));
      const A = axes(g, { x0: 0, x1: Emax, y0: 0, y1: ymax * 1.12, xl: [[T('分子的動能 E（kJ/mol）', 'Kinetic energy of a molecule E (kJ/mol)'), 0]],
        yl: [[T('分子所占比例（每 kJ/mol）', 'Fraction of molecules (per kJ/mol)'), 0]], ydec: ymax > 0.1 ? 2 : 3 });
      drawEnergyCommon(g, A, r, hide, EaF, EaU, Emax, bw, function (b) { return r.keTot ? r.keHist[b] / (r.keTot * bw) : 0; }, nb,
        function (E, Tk) { return K.keDensity(E, Tk); }, prev);
      if (!hide) {
        const th = K.keFracAbove(EaF, c.T);
        let obs = 0; for (let b = 0; b < nb; b++) if ((b + 0.5) * bw >= EaF) obs += r.keHist[b];
        note(g, T('動能 ≥ Ea 的分子：理論 ', 'Molecules with E ≥ Ea: theory ') + pct(th) + T('，模擬 ', ', simulated ') + (r.keTot ? pct(obs / r.keTot) : '—'), A.X1, A.Y1 - 12, col.text, 'right');
      }
    } else {
      const Emax = r.Emax;
      const st = s.stats;
      const bw = Math.max(K.HIST_DE, Math.round(Emax / 40 / K.HIST_DE) * K.HIST_DE), per = Math.round(bw / K.HIST_DE);
      const nb = Math.ceil(Emax / bw);
      const dens = function (b) {
        if (!st.collAB) return 0;
        let n = 0; for (let k = 0; k < per; k++) { const i = b * per + k; if (i < K.HIST_N) n += st.hist[i]; }
        return n / (st.collAB * bw);
      };
      let ymax = 1 / RT;
      for (let b = 0; b < nb; b++) ymax = Math.max(ymax, dens(b));
      const A = axes(g, { x0: 0, x1: Emax, y0: 0, y1: ymax * 1.12, xl: [[T('碰撞時沿連心線的相對動能（kJ/mol）', 'Energy along the line of centres in a collision (kJ/mol)'), 0]],
        yl: [[T('碰撞所占比例（每 kJ/mol）', 'Fraction of collisions (per kJ/mol)'), 0]], ydec: ymax > 0.1 ? 2 : 3 });
      drawEnergyCommon(g, A, r, hide, EaF, EaU, Emax, bw, dens, nb, function (E, Tk) { return K.collisionEnergyDensity(E, Tk); }, prevT());
      if (!hide) {
        note(g, T('能量足夠的碰撞：理論 ', 'Collisions with enough energy: theory ') + pct(K.fracAbove(EaF, c.T)) + T('，模擬 ', ', simulated ') +
          (st.collAB ? pct(st.enoughAB / st.collAB) : '—') + T('（', ' (') + st.collAB + T(' 次）', ' collisions)'), A.X1, A.Y1 - 12, col.text, 'right');
      } else note(g, T('A–B 碰撞 ', 'A–B collisions: ') + st.collAB + T(' 次', ''), A.X1, A.Y1 - 12, col.text, 'right');
    }
  }
  function drawEnergyCommon(g, A, r, hide, EaF, EaU, Emax, bw, dens, nb, theory, prev) {
    const c = r.cfg;
    // 直方圖（模擬）
    g.save();
    for (let b = 0; b < nb; b++) {
      const v = dens(b);
      if (!(v > 0)) continue;
      const E0 = b * bw, over = !hide && E0 + bw / 2 >= EaF;
      g.fillStyle = over ? LD.alpha(col.C, col.dark ? 0.55 : 0.45) : LD.alpha(col.muted, col.dark ? 0.35 : 0.28);
      const x0 = A.sx(E0) + 0.5, x1 = A.sx(Math.min(Emax, E0 + bw)) - 0.5;
      g.fillRect(x0, A.sy(v), Math.max(1, x1 - x0), A.Y0 - A.sy(v));
    }
    g.restore();
    // 上一次（不同溫度）的理論曲線
    if (prev) {
      const pts = [];
      for (let E = 0.02; E <= Emax; E += Emax / 160) pts.push([A.sx(E), A.sy(theory(E, prev))]);
      line(g, pts, LD.alpha(col.muted, 0.9), 1.5, [5, 4]);
      const E1 = Emax * 0.08 + 2 * K.RT(prev) * 0.5;
      note(g, num(prev, 0) + ' K', A.sx(Math.min(Emax * 0.9, E1 + Emax * 0.05)), A.sy(theory(E1, prev)) - 6, col.muted, 'left');
    }
    // 理論曲線，Ea 右邊塗色
    const pts = [];
    for (let E = 0.02; E <= Emax; E += Emax / 200) pts.push([A.sx(E), A.sy(theory(E, c.T)), E]);
    if (!hide && EaF < Emax) {
      g.save();
      g.beginPath();
      g.moveTo(A.sx(EaF), A.Y0);
      g.lineTo(A.sx(EaF), A.sy(theory(Math.max(0.02, EaF), c.T)));
      pts.forEach(function (p) { if (p[2] >= EaF) g.lineTo(p[0], p[1]); });
      g.lineTo(A.sx(Emax), A.Y0);
      g.closePath();
      g.fillStyle = LD.alpha(col.C, col.dark ? 0.22 : 0.16);
      g.fill();
      g.restore();
    }
    line(g, pts, col.accent, 2.4);
    note(g, num(c.T, 0) + ' K', pts[Math.round(pts.length * 0.12)][0] + 8, pts[Math.round(pts.length * 0.12)][1] - 6, col.accent, 'left');
    // Ea 的位置
    if (!hide) {
      const mark = function (E, color, dash, lab) {
        if (E > Emax) return;
        const X = A.sx(E);
        line(g, [[X, A.Y0], [X, A.Y1 + 6]], color, 1.6, dash);
        rich(g, lab, X + 4, A.Y1 + 18, color, fsz(12), 'left', '600');
      };
      if (c.cat && EaU > EaF + 1e-9) mark(EaU, col.muted, [4, 4], EA.concat([[T('（無催化）', ' (uncatalysed)'), 0]]));
      mark(EaF, col.B, null, c.cat ? EA.concat([[T('（催化）', ' (catalysed)'), 0]]) : EA);
    }
  }
  function prevT() {
    for (let i = runs.length - 1; i >= 0; i--) if (runs[i].T !== cur.cfg.T) return runs[i].T;
    return null;
  }

  function drawProfile(g) {
    const r = cur, c = r.cfg, hide = !!c.mys;
    const dH = c.dH;
    const EaU = K.effectiveEa(c.Ea, dH, false), EaC = K.effectiveEa(c.Ea, dH, true);
    const top = hide ? Math.max(10, dH + 12) : Math.max(EaU, 2);
    const y0 = Math.min(0, dH) - 6, y1 = Math.max(top, 0) + 10;
    const A = axes(g, { x0: 0, x1: 1, y0: y0, y1: y1, xl: [[T('反應進程 →', 'Reaction progress →'), 0]], yl: [[T('位能（kJ/mol）', 'Potential energy (kJ/mol)'), 0]], xticks: 1, xdec: 0 });
    // 把 x 軸刻度蓋掉（反應進程沒有數值）
    g.fillStyle = col.bg; g.fillRect(A.X0 - 20, A.Y0 + 2, A.X1 - A.X0 + 40, 16);
    const curve = function (peak) {
      const pts = [];
      for (let k = 0; k <= 160; k++) {
        const x = k / 160;
        const sm = x < 0.25 ? 0 : x > 0.75 ? 1 : (function (u) { return u * u * (3 - 2 * u); })((x - 0.25) / 0.5);
        const base = dH * sm;
        const bump = (peak - dH / 2) * Math.exp(-Math.pow((x - 0.5) / 0.11, 2));
        pts.push([A.sx(x), A.sy(base + bump)]);
      }
      return pts;
    };
    // 最近的 A–B 碰撞能量（短橫線）：綠色＝發生反應
    if (!hide) {
      const now = performance.now();
      r.recent.forEach(function (e) {
        const a = Math.max(0, 1 - (now - e.t0) / 4000);
        if (a <= 0 || e.E > y1) return;
        g.strokeStyle = LD.alpha(e.kind >= 2 ? col.C : col.muted, (e.kind >= 2 ? 0.95 : 0.55) * a);
        g.lineWidth = e.kind >= 2 ? 2.4 : 1.4;
        const X = A.sx(0.04 + 0.12 * ((e.E * 7.3) % 1));
        g.beginPath(); g.moveTo(X - 6, A.sy(e.E)); g.lineTo(X + 6, A.sy(e.E)); g.stroke();
      });
    }
    line(g, curve(hide ? top : EaU), hide ? col.muted : col.text, 2.4, hide ? [6, 5] : null);
    if (c.cat && !hide) line(g, curve(EaC), col.accent, 2.2, [7, 5]);
    // 標示
    const yR = A.sy(0), yP = A.sy(dH);
    note(g, 'A + B', A.sx(0.03), yR - 8, col.text, 'left');
    note(g, 'C + D', A.sx(0.97), yP - 8, col.text, 'right');
    if (hide) {
      rich(g, EA.concat([[' = ?', 0]]), A.sx(0.5), A.sy(top) - 10, col.text, fsz(13), 'center', '600');
    } else {
      const peak = c.cat ? EaC : EaU;
      const xa = A.sx(0.36);
      dArrow(g, xa, yR, xa, A.sy(peak), col.B);
      rich(g, EA.concat(c.cat ? [[T(' 催化', ' cat.'), 0]] : []).concat([[' = ' + num(peak, 1), 0]]), xa - 6, (yR + A.sy(peak)) / 2, col.B, fsz(12), 'right', '600');
      const xb = A.sx(0.64);
      dArrow(g, xb, yP, xb, A.sy(peak), col.A);
      rich(g, [[T('逆 ', 'rev. '), 0]].concat(EA).concat([[' = ' + num(peak - dH, 1), 0]]), xb + 6, (yP + A.sy(peak)) / 2, col.A, fsz(12), 'left', '600');
      if (Math.abs(dH) > 0.5) {
        const xc = A.sx(0.9);
        line(g, [[A.sx(0.8), yR], [A.sx(0.97), yR]], LD.alpha(col.muted, 0.8), 1, [3, 3]);
        dArrow(g, xc, yR, xc, yP, col.D);
        note(g, 'ΔH = ' + num(dH, 1), xc - 6, (yR + yP) / 2 + 4, col.D, 'right');
      }
      if (c.cat) note(g, T('虛線：催化途徑（兩端高度不變）', 'Dashed: catalysed path (ends unchanged)'), A.X1, A.Y1 - 12, col.accent, 'right');
    }
  }
  function dArrow(g, x0, y0, x1, y1, color) {
    if (Math.abs(y1 - y0) < 6) return;
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    LD.arrow(g, xm, ym, x0, y0, color, 1.6);
    LD.arrow(g, xm, ym, x1, y1, color, 1.6);
  }

  function drawConc(g) {
    const r = cur, s = r.sim, c = r.cfg;
    const ser = s.series;
    const tmax = Math.max(50, s.t * 1.08);
    const cmax = K.molarity(Math.max(c.nA, c.nB)) * 1.1;
    const A = axes(g, { x0: 0, x1: tmax, y0: 0, y1: cmax, xl: [[T('時間 t（ps）', 'Time t (ps)'), 0]], yl: [[T('濃度（mol/L）', 'Concentration (mol/L)'), 0]], ydec: 2 });
    // 理論曲線（速率方程式的數值積分）
    if (!c.mys && !c.heat) {
      const th = K.theory({ T: c.T, Ea: c.Ea, dH: c.dH, cat: c.cat, steric: c.steric, nA: c.nA, nB: c.nB });
      let a = c.nA, b = c.nB, cc = 0, dd = 0;
      const pa = [[A.sx(0), A.sy(K.molarity(a))]], pc = [[A.sx(0), A.sy(0)]], pb = [[A.sx(0), A.sy(K.molarity(b))]];
      const h = tmax / 400;
      for (let t = 0; t < tmax; t += h) {
        // 二階的龍格–庫塔
        const f = function (a1, b1, c1, d1) { return th.kF * a1 * b1 / K.V - th.kR * c1 * d1 / K.V; };
        const k1 = f(a, b, cc, dd), k2 = f(a - k1 * h / 2, b - k1 * h / 2, cc + k1 * h / 2, dd + k1 * h / 2);
        a -= k2 * h; b -= k2 * h; cc += k2 * h; dd += k2 * h;
        pa.push([A.sx(t + h), A.sy(K.molarity(a))]); pb.push([A.sx(t + h), A.sy(K.molarity(b))]); pc.push([A.sx(t + h), A.sy(K.molarity(cc))]);
      }
      line(g, pa, LD.alpha(col.A, 0.45), 4);
      if (c.nA !== c.nB) line(g, pb, LD.alpha(col.B, 0.45), 4);
      line(g, pc, LD.alpha(col.C, 0.45), 4);
    }
    const P = function (key) { return ser.map(function (p) { return [A.sx(p.t), A.sy(K.molarity(p[key]))]; }).concat([[A.sx(s.t), A.sy(K.molarity(s.count[{ a: 0, b: 1, c: 2, d: 3 }[key]]))]]); };
    line(g, P('d'), col.D, 1.8, [2, 3]);
    line(g, P('c'), col.C, 2);
    line(g, P('b'), col.B, 1.8, c.nA === c.nB ? [6, 4] : null);
    line(g, P('a'), col.A, 2);
    if (s.stats.tHalf != null) {
      const X = A.sx(s.stats.tHalf);
      line(g, [[X, A.Y0], [X, A.Y1 + 4]], LD.alpha(col.text, 0.5), 1.2, [4, 4]);
      rich(g, [['t', 0], ['1/2', -1], [' = ' + num(s.stats.tHalf, 0) + ' ps', 0]], X + 4, A.Y1 + 16, col.text, fsz(12), X > A.X1 - 110 ? 'right' : 'left');
    }
  }

  /** 數據表中所有的列（含這一次） */
  function allRows() { return runs.concat(cur ? [summary(cur)] : []); }
  function arrGroup(rows, key, minN) {
    return rows.filter(function (r) { return r.key === key && !r.heat && r.fwd >= minN && r.k > 0; });
  }
  function drawArr(g) {
    const rows = allRows().filter(function (r) { return !r.heat && r.fwd >= 10 && r.k > 0; });
    if (!rows.length) {
      const A = axes(g, { x0: 1, x1: 5, y0: 20, y1: 26, xl: [['1000/T（K', 0], ['−1', 1], ['）', 0]], yl: [['ln k', 0]] });
      note(g, T('在不同溫度各做一次（每次至少 10 次反應），', 'Run at several temperatures (at least 10 reactions each)'), (A.X0 + A.X1) / 2 - 140, (A.Y0 + A.Y1) / 2 - 8, col.muted, 'left');
      note(g, T('這裡會畫出 ln k 對 1/T 的圖。', 'and ln k against 1/T is plotted here.'), (A.X0 + A.X1) / 2 - 140, (A.Y0 + A.Y1) / 2 + 12, col.muted, 'left');
      return;
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    rows.forEach(function (r) {
      const x = 1000 / r.T, y = Math.log(r.k), e = r.kErr || 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y - e); y1 = Math.max(y1, y + e);
    });
    const xpad = Math.max(0.3, (x1 - x0) * 0.12), ypad = Math.max(0.5, (y1 - y0) * 0.15);
    const A = axes(g, { x0: Math.max(0, x0 - xpad), x1: x1 + xpad, y0: y0 - ypad, y1: y1 + ypad, xl: [['1000/T（K', 0], ['−1', 1], ['）', 0]],
      yl: [['ln k（k：L mol', 0], ['−1', 1], [' s', 0], ['−1', 1], ['）', 0]], xdec: 1, ydec: 1 });
    const key = cur.key;
    const grp = arrGroup(rows, key, 10);
    rows.forEach(function (r) {
      const on = r.key === key;
      const X = A.sx(1000 / r.T), Y = A.sy(Math.log(r.k)), e = r.kErr || 0;
      g.strokeStyle = on ? col.accent : LD.alpha(col.muted, 0.7);
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(X, A.sy(Math.log(r.k) - e)); g.lineTo(X, A.sy(Math.log(r.k) + e)); g.stroke();
      LD.ball(g, X, Y, on ? 4.5 : 3.5, on ? col.accent : col.muted, { shadow: false });
    });
    const fit = grp.length >= 2 && distinctT(grp) >= 2 ? K.arrhenius(grp.map(function (r) { return { T: r.T, k: r.k, n: r.fwd }; })) : null;
    if (fit) {
      const xa = A.sx(Math.max(0, x0 - xpad)), xb = A.sx(x1 + xpad);
      const yf = function (X) { const inv = (X - A.X0) / (A.X1 - A.X0) * ((x1 + xpad) - Math.max(0, x0 - xpad)) + Math.max(0, x0 - xpad); return fit.intercept + fit.slope * inv / 1000; };
      line(g, [[xa, A.sy(yf(xa))], [xb, A.sy(yf(xb))]], col.accent, 1.8, [6, 4]);
      const parts = [[T('斜率 = ', 'slope = ') + num(fit.slope, 0) + ' K　', 0]].concat(EA).concat([[' = ' + num(fit.Ea, 2) + ' ± ' + num(fit.EaErr, 2) + ' kJ/mol', 0]]);
      rich(g, parts, A.X1, A.Y1 - 10, col.text, fsz(12), 'right', '600');
      if (!cur.cfg.mys) {
        const app = K.apparentEa(cur.sim.EaF, grp.map(function (r) { return { T: r.T, n: r.fwd }; }));
        rich(g, [[T('理論：圖上應得 ', 'Theory: the plot should give '), 0]].concat(EA).concat([[' = ' + num(app, 2) + T('（門檻 ', ' (threshold ') + num(cur.sim.EaF, 1) + T('）', ')'), 0]]),
          A.X1, A.Y1 + 8, col.muted, fsz(11), 'right');
      }
    }
  }
  function distinctT(rows) { const s = {}; rows.forEach(function (r) { s[r.T] = 1; }); return Object.keys(s).length; }

  function drawAll() { drawStage(); drawGraph(); }

  // ======================= 讀數、表格 =======================
  function dl(el, rows) {
    el.innerHTML = rows.map(function (r) {
      return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>';
    }).join('');
  }
  function updateReadouts() {
    if (!cur) return;
    const r = cur, s = r.sim, st = s.stats, c = r.cfg, m = K.measure(s);
    const names = [['A', col.A], ['B', col.B], ['C', col.C], ['D', col.D]];
    $('spRow').innerHTML = names.map(function (p, i) {
      return '<div><span><i style="background:' + p[1] + '"></i>' + p[0] + '</span><b>' + s.count[i] + '</b>' + num(K.molarity(s.count[i]), 3) + ' M</div>';
    }).join('');
    dl($('readout'), [
      [T('經過時間', 'Elapsed time'), num(s.t, 1) + ' ps'],
      [c.heat ? T('氣體溫度<small>反應熱留在氣體裡</small>', 'Gas temperature<small>heat stays in the gas</small>') : T('氣體溫度', 'Gas temperature'), num(r.Tgas, 0) + ' K'],
      [T('正反應 A + B → C + D', 'Forward A + B → C + D'), st.fwd + T(' 次', '')],
      [T('逆反應 C + D → A + B', 'Reverse C + D → A + B'), st.rev + T(' 次', '')]
    ]);
    const th = c.mys ? null : K.theory({ T: c.T, Ea: c.Ea, dH: c.dH, cat: c.cat, steric: c.steric, nA: c.nA, nB: c.nB });
    const rows = [];
    if (!c.mys) {
      rows.push([T('A–B 碰撞次數', 'A–B collisions'), st.collAB]);
      rows.push([T('能量足夠的比例<small>理論 ', 'Enough energy<small>theory ') + pct(th.frac) + '</small>', pct(m.fracObs)]);
      rows.push([T('有效碰撞的比例<small>理論 ', 'Effective collisions<small>theory ') + pct(th.frac * th.p) + '</small>', pct(m.effObs)]);
    }
    rows.push([T('速率常數 k<small>L/(mol·s)', 'Rate constant k<small>L/(mol·s)') + (st.fwd ? T('，誤差約 ±', ', about ±') + pct(m.relErrF, 0) : '') + '</small>',
      st.fwd ? sciHTML(m.kF_SI, 3) : '—', 'big']);
    if (th && !c.heat) rows.push([T('k 的理論值', 'k in theory'), sciHTML(th.kF_SI, 3)]);
    rows.push([T('初速率<small>mol/(L·s)，轉化 10% 前的平均</small>', 'Initial rate<small>mol/(L·s), mean over the first 10%</small>'), m.rate0 != null ? sciHTML(m.rate0, 3) : '—']);
    rows.push([T('半生期', 'Half-life'), st.tHalf != null ? num(st.tHalf, 0) + ' ps' : '—']);
    if (!c.mys && (st.rev > 0 || s.count[K.C] > 0)) {
      const Q = s.count[K.A] * s.count[K.B] > 0 ? s.count[K.C] * s.count[K.DD] / (s.count[K.A] * s.count[K.B]) : null;
      rows.push([T('Q = [C][D]/[A][B]<small>平衡常數 K = ', 'Q = [C][D]/[A][B]<small>equilibrium constant K = ') + (th.K > 1000 ? sciHTML(th.K, 2) : num(th.K, th.K < 10 ? 2 : 0)) + '</small>',
        Q == null ? '—' : Q > 1000 ? sciHTML(Q, 2) : num(Q, Q < 10 ? 2 : 0)]);
    }
    dl($('anaOut'), rows);
    describeCanvas();
  }
  function describeCanvas() {
    if (!cur) return;
    const s = cur.sim;
    cv.setAttribute('aria-label', T('反應容器（立體透視圖）：', 'Reaction box (perspective drawing): ') + 'A ' + s.count[0] + '、B ' + s.count[1] + '、C ' + s.count[2] + '、D ' + s.count[3] +
      T(' 個分子，溫度 ', ' molecules, temperature ') + num(cur.Tgas, 0) + ' K' + T('，經過 ', ', time ') + num(s.t, 0) + ' ps' + T('。', '.'));
  }

  function renderTable() {
    const rows = allRows().slice().reverse();
    const th = '<thead><tr><th>#</th><th>T<br><small>K</small></th><th>E<sub>a</sub><br><small>kJ/mol</small></th><th>ΔH<br><small>kJ/mol</small></th>' +
      '<th>' + T('催化', 'Cat.') + '</th><th>' + T('方向', 'Orient.') + '</th><th>A</th><th>B</th><th>' + T('時間', 'Time') + '<br><small>ps</small></th>' +
      '<th>' + T('反應次數', 'Reactions') + '<br><small>' + T('正／逆', 'fwd/rev') + '</small></th><th>k<br><small>L/(mol·s)</small></th><th>' + T('初速率', 'Initial rate') +
      '<br><small>mol/(L·s)</small></th><th>' + T('半生期', 'Half-life') + '<br><small>ps</small></th></tr></thead>';
    let body = rows.map(function (r) {
      const curRow = cur && r.id === cur.id;
      return '<tr' + (curRow ? ' class="cur"' : '') + '><td>' + r.id + (r.heat ? '*' : '') + '</td><td>' + num(r.T, 0) + '</td><td>' + (r.mys ? '?' + r.mys : num(r.Ea, 1)) + '</td><td>' + num(r.dH, 0) +
        '</td><td>' + (r.cat ? '✓' : '') + '</td><td>' + (r.steric ? '✓' : '') + '</td><td>' + r.nA + '</td><td>' + r.nB + '</td><td>' + num(r.t, 0) + '</td><td>' + r.fwd + '／' + r.rev +
        '</td><td>' + (r.k ? sciHTML(r.k, 3) : '—') + '</td><td>' + (r.rate0 != null ? sciHTML(r.rate0, 2) : '—') + '</td><td>' + (r.tHalf != null ? num(r.tHalf, 0) : '—') + '</td></tr>';
    }).join('');
    if (!rows.length) body = '<tr class="empty"><td colspan="13">—</td></tr>';
    const t = $('tbl');
    const html = th + '<tbody>' + body + '</tbody>';
    if (t._html !== html) { t.innerHTML = html; t._html = html; }
  }

  function refreshOutputs() {
    $('tempo').textContent = num(val(elT), 0) + ' K';
    $('eao').textContent = mys ? '?' : num(val(elEa), 1) + ' kJ/mol';
    $('dho').textContent = num(mys ? -30 : val(elDH), 1) + ' kJ/mol';
    $('nao').textContent = num(val(elNA), 0) + T(' 個', '');
    $('nbo').textContent = num(val(elNB), 0) + T(' 個', '');
  }
  function refreshAll() {
    refreshOutputs();
    updateReadouts();
    renderTable();
    updateGraphText();
    drawAll();
    if (view3 && view3.active) view3.frame();
  }

  // ======================= 圖例、說明 =======================
  function updateLegend() {
    const sp = function (c, t) { return '<span><i class="sp" style="background:' + c + '"></i>' + t + '</span>'; };
    $('spLegend').innerHTML = sp(col.A, 'A') + sp(col.B, 'B') + sp(col.C, 'C') + sp(col.D, 'D') +
      '<span><i class="fl" style="color:' + col.C + '"></i>' + T('反應', 'Reaction') + '</span>' +
      '<span><i class="fl" style="color:' + col.muted + ';border-style:dashed"></i>' + T('能量夠、方向不對', 'Enough energy, wrong way') + '</span>' +
      (cur && cur.cfg.steric ? '<span><i class="sp" style="background:#ffffff;width:8px;height:8px;border-color:' + col.text + '"></i>' + T('A 的可反應端（白點）', 'Reactive end of A (white dot)') + '</span>' : '');
  }
  function updateGraphText() {
    const t = state.tab, c = cur ? cur.cfg : {};
    $('eModeSeg').hidden = t !== 'energy';
    let lg = '', hint = '';
    const ln = function (color, txt, cls) { return '<span><i class="ln' + (cls ? ' ' + cls : '') + '" style="background:' + color + ';color:' + color + '"></i>' + txt + '</span>'; };
    if (t === 'energy') {
      lg = ln(col.accent, T('理論分布（這個溫度）', 'Theory (this temperature)')) + ln(col.muted, T('上一次的溫度', 'Previous temperature'), 'dash') +
        '<span><i class="sp" style="background:' + col.C + ';border-radius:2px"></i>' + T('模擬：超過 Ea', 'Simulated: above Ea') + '</span>';
      hint = state.emode === 'ke'
        ? T('分子的動能分布（馬克士威–波茲曼）。溫度越高，曲線越矮越寬，超過 Ea 的部分變多。注意：決定能不能反應的是「碰撞時沿連心線的相對動能」，請切換到右邊的按鈕看。',
          'The kinetic-energy distribution of the molecules (Maxwell–Boltzmann). The hotter the gas, the lower and wider the curve and the more molecules beyond Ea. What decides a reaction is the energy along the line of centres in a collision — see the other button.')
        : T('每一次 A–B 碰撞沿連心線的相對動能。理論上是指數分布，能量 ≥ Ea 的比例恰好是 e^(−Ea/RT)。綠色長條是能量夠、可能反應的碰撞。',
          'The energy along the line of centres for every A–B collision. In theory this is an exponential distribution, and the fraction with at least Ea is exactly e^(−Ea/RT). Green bars: collisions with enough energy.');
      if (c.mys) hint = T('未知反應：不顯示活化能的位置。', 'Unknown reaction: the position of the activation energy is not shown.');
    } else if (t === 'profile') {
      lg = ln(col.text, T('反應途徑', 'Reaction path')) + (c.cat ? ln(col.accent, T('催化途徑', 'Catalysed path'), 'dash') : '') +
        '<span><i class="ln" style="background:' + col.C + '"></i>' + T('最近的碰撞：反應', 'Recent collisions: reacted') + '</span><span><i class="ln" style="background:' + col.muted + '"></i>' + T('沒有反應', 'did not react') + '</span>';
      hint = T('左邊的短橫線是最近 40 次 A–B 碰撞的能量：高過能障（而且方向對）的才會越過山頂。正反應與逆反應的活化能相差 ΔH。',
        'The short dashes on the left are the energies of the last 40 A–B collisions: only those above the barrier (and the right way round) get over the top. Forward and reverse activation energies differ by ΔH.');
    } else if (t === 'conc') {
      lg = ln(col.A, '[A]') + ln(col.B, '[B]', c.nA === c.nB ? 'dash' : '') + ln(col.C, '[C]') + ln(col.D, '[D]', 'dot') +
        (c.mys || c.heat ? '' : '<span><i class="ln" style="background:' + LD.alpha(col.A, 0.45) + ';height:6px"></i>' + T('速率定律的計算值', 'Rate-law prediction') + '</span>');
      hint = T('粗的淡線是用理論 k 解速率方程式 −d[A]/dt = k[A][B] − k′[C][D] 的結果；細線是模擬中真正數到的分子數。',
        'The thick pale lines solve the rate equation −d[A]/dt = k[A][B] − k′[C][D] with the theoretical k; the thin lines are the molecules actually counted in the simulation.');
    } else {
      lg = '<span><i class="sp" style="background:' + col.accent + '"></i>' + T('同一反應（這次的條件）', 'Same reaction as now') + '</span><span><i class="sp" style="background:' + col.muted + '"></i>' + T('其他反應', 'Other reactions') + '</span>';
      hint = T('同一反應在不同溫度量到的 k：ln k 對 1/T 是直線，斜率 = −Ea/R。誤差線約 ±1/√(反應次數)。「反應熱留在氣體裡」的實驗溫度不固定，不畫。',
        'k measured at different temperatures for the same reaction: ln k against 1/T is a straight line with slope −Ea/R. Error bars about ±1/√(number of reactions). Runs with “heat stays in the gas” are left out (their temperature is not constant).');
    }
    $('gLegend').innerHTML = lg;
    $('gHint').textContent = hint;
    const names = { energy: T('能量分布圖', 'Energy distribution'), profile: T('反應進程的能量圖', 'Energy profile'), conc: T('濃度對時間的圖', 'Concentration against time'), arr: T('阿瑞尼斯圖', 'Arrhenius plot') };
    gcv.setAttribute('aria-label', names[t] + T('。', '. ') + hint);
  }

  // ======================= 任務事件 =======================
  function emitTick() {
    if (!window.LabMission || !cur) return;
    const rows = allRows();
    const sum = rows[rows.length - 1];
    let arr = null;
    if (!cur.cfg.mys && !cur.cfg.heat) {
      const grp = arrGroup(rows, cur.key, 80);
      if (grp.length >= 2 && distinctT(grp) >= 2) {
        const f = K.arrhenius(grp.map(function (r) { return { T: r.T, k: r.k, n: r.fwd }; }));
        let lo = Infinity, hi = -Infinity;
        grp.forEach(function (r) { lo = Math.min(lo, r.T); hi = Math.max(hi, r.T); });
        if (f) arr = { nT: distinctT(grp), span: hi - lo, Ea: f.Ea, EaApp: K.apparentEa(cur.sim.EaF, grp.map(function (r) { return { T: r.T, n: r.fwd }; })), EaF: cur.sim.EaF };
      }
    }
    window.LabMission.emit('tick', { run: sum, runs: rows, eq: eqWindow(cur), arr: arr, speed: state.speed });
  }
  function acted() { userActed = true; }

  // ======================= 未知反應 =======================
  function mysRows() { return allRows().filter(function (r) { return mys && r.mys === mys.id && r.fwd > 0 && r.k > 0; }); }
  function startMystery() {
    mys = { id: ++mysSeq, E0: K.mysteryEa(), tries: 0, revealed: false, solved: false };
    $('mysBox').hidden = false;
    $('mysOn').hidden = true;
    $('ansEa').value = '';
    $('check').disabled = false;
    setMysUI();
    $('mysOut').innerHTML = T('未知反應 ?', 'Unknown reaction ?') + mys.id + T('：', ': ') + T('ΔH = −30 kJ/mol，沒有催化劑，不考慮方向。改溫度做幾次實驗，看阿瑞尼斯圖。', 'ΔH = −30 kJ/mol, no catalyst, orientation ignored. Run it at several temperatures and look at the Arrhenius plot.');
    newRun(T('開始未知反應。', 'Unknown reaction started.'));
    setTab('arr');
  }
  function stopMystery() {
    mys = null;
    $('mysBox').hidden = true;
    $('mysOn').hidden = false;
    $('mysOut').textContent = '';
    setMysUI();
    newRun(T('回到一般模式。', 'Back to normal mode.'));
  }
  function setMysUI() {
    const on = !!mys;
    [elEa, elDH, elCat, elSt, elHeat].forEach(function (el) { el.disabled = on; });
    $('condHint').textContent = on ? T('未知反應：活化能看不到，ΔH 固定 −30 kJ/mol；可以改溫度與分子數。', 'Unknown reaction: the activation energy is hidden and ΔH is −30 kJ/mol; you can change the temperature and the numbers of molecules.')
      : T('改任何條件都會重新開始一次實驗。點一下數字可直接輸入。', 'Any change starts a new run. Tap a number to type an exact value.');
    refreshOutputs();
  }
  function parseNum(s) {
    s = String(s || '').trim().replace(/，/g, '.').replace(/,/g, '.').replace(/[−–]/g, '-');
    if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function checkAnswer() {
    if (!mys) return;
    acted();
    const a = parseNum($('ansEa').value);
    const out = $('mysOut');
    if (!(a > 0)) { out.innerHTML = '<span class="no">' + T('請輸入一個正數（kJ/mol）。', 'Please enter a positive number (kJ/mol).') + '</span>'; return; }
    const rows = mysRows();
    if (!rows.length) { out.innerHTML = '<span class="no">' + T('先做實驗量出 k 再填答案。', 'Measure k first, then enter your answer.') + '</span>'; return; }
    if (mys.tries >= 3 && !mys.solved) { out.innerHTML = T('這個未知反應已經核對 3 次了：按「揭曉答案」或「換一個」。', 'You have checked this one 3 times: press “Reveal” or “Another one”.'); return; }
    mys.tries++;
    const app = K.apparentEa(mys.E0, rows.map(function (r) { return { T: r.T, n: r.fwd }; }));
    const err = Math.min(Math.abs(a - mys.E0) / mys.E0, Math.abs(a - app) / app);
    const nT = distinctT(rows.filter(function (r) { return r.fwd >= 30; }));
    if (err <= 0.1) {
      mys.solved = true;
      out.innerHTML = '<span class="ok">' + (err <= 0.04 ? T('非常準確！', 'Spot on!') : T('答對了！', 'Correct!')) + '</span>' +
        T('誤差 ', ' Error ') + pct(err, 1) + T('。', '.') + (nT < 2 ? T('（只用了一個溫度？下次多量幾個溫度。）', ' (Only one temperature? Next time measure a few more.)') : '');
      if (window.LabSound && window.LabSound.enabled()) { window.LabSound.tone({ freq: 880, dur: 0.12, gain: 0.2 }); window.LabSound.tone({ freq: 1320, dur: 0.16, gain: 0.16, delay: 0.1 }); }
    } else {
      out.innerHTML = '<span class="no">' + T('還不夠準。', 'Not close enough yet.') + '</span>' +
        T('多量幾個溫度、溫差拉大、每次多一點反應次數，再看阿瑞尼斯圖的斜率。（已核對 ', ' Use more temperatures over a wider range and more reactions per run, then read the slope again. (Checked ') + mys.tries + T(' 次，最多 3 次）', ' of 3 times)');
    }
    if (window.LabMission) window.LabMission.emit('answer', { ans: a, err: err, nT: nT, tries: mys.tries, revealed: mys.revealed });
  }
  function reveal() {
    if (!mys) return;
    acted();
    mys.revealed = true;
    const rows = mysRows();
    const app = rows.length ? K.apparentEa(mys.E0, rows.map(function (r) { return { T: r.T, n: r.fwd }; })) : null;
    $('mysOut').innerHTML = T('答案：門檻能量 ', 'Answer: threshold energy ') + 'E<sub>a</sub> = ' + num(mys.E0, 1) + ' kJ/mol' +
      (app ? T('；用你量過的溫度，阿瑞尼斯圖應得 ', '; with the temperatures you used, the Arrhenius plot should give ') + num(app, 1) + ' kJ/mol' : '') + T('。（揭曉後不算任務）', '. (After revealing, this one no longer counts for missions.)');
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function host3Api() {
    return {
      T: T, host: host3,
      sim: function () { return cur.sim; },
      run: function () { return cur; },
      colors: function () { return col; },
      spColor: spColor, tempColor: tempColor,
      flashes: function () { return flashes; }, FL_DUR: FL_DUR,
      hud: hudInfo,
      running: function () { return state.running; },
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
    };
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
      if (!webglAvailable() || !window.Rate3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Rate3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.frame();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
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
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }

  // ======================= 操作 =======================
  function setTab(t) {
    state.tab = t;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === t)); });
    updateGraphText();
    drawGraph();
  }
  function setSpeed(i) {
    state.speed = i;
    [0, 1, 2].forEach(function (k) { $('sp' + k).setAttribute('aria-pressed', String(k === i)); });
    lagEma = 1;
  }
  function setRunning(on) {
    state.running = on;
    $('play').textContent = on ? T('暫停', 'Pause') : T('播放', 'Play');
    if (on) startLoop(); else { drawAll(); if (view3 && view3.active) view3.frame(); }
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  let syncing = false;
  function onSlider(el) {
    if (syncing) return;
    acted();
    // 吸熱反應的活化能不可能小於 ΔH：兩個滑桿互相推
    if (!mys) {
      syncing = true;
      if (el === elDH && val(elDH) > val(elEa)) setVal(elEa, Math.min(40, Math.ceil(val(elDH) * 2) / 2));
      if (el === elEa && val(elEa) < val(elDH)) setVal(elDH, Math.floor(val(elEa)));
      syncing = false;
    }
    refreshOutputs();
    newRun('');
    updateLegend();
  }
  [elT, elEa, elDH, elNA, elNB].forEach(function (el) {
    el.addEventListener('input', function () { onSlider(el); });
  });
  [elCat, elSt, elHeat].forEach(function (el) {
    el.addEventListener('change', function () {
      acted();
      newRun(el === elCat ? (el.checked ? T('加入催化劑：活化能降低。', 'Catalyst added: lower activation energy.') : T('移除催化劑。', 'Catalyst removed.')) :
        el === elSt ? (el.checked ? T('方向要對才反應：A 只有一端（四分之一的表面）能反應。', 'Orientation matters: only one end of A (a quarter of its surface) can react.') : T('不考慮方向。', 'Orientation ignored.')) :
          (el.checked ? T('反應熱留在氣體裡：放熱反應會讓氣體變熱。', 'The heat of reaction now stays in the gas: an exothermic reaction heats it.') : T('反應熱由器壁（恆溫槽）吸收，溫度固定。', 'The heat of reaction is taken up by the walls (heat bath); the temperature is fixed.')));
      updateLegend();
    });
  });
  $('play').addEventListener('click', function () { acted(); setRunning(!state.running); });
  $('restart').addEventListener('click', function () { acted(); newRun(T('重新開始：上一次的結果留在數據表。', 'New run: the last run stays in the data table.')); if (!state.running) setRunning(true); });
  $('clearAll').addEventListener('click', function () {
    acted();
    runs = [];
    cur = null;
    newRun(T('已清除數據表與所有統計。', 'The data table and all statistics have been cleared.'));
  });
  [0, 1, 2].forEach(function (k) { $('sp' + k).addEventListener('click', function () { acted(); setSpeed(k); }); });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') { resize(); }
  });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); setTab(b.dataset.tab); }); });
  document.querySelectorAll('#eModeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.emode = b.dataset.emode;
      document.querySelectorAll('#eModeSeg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      updateGraphText();
      drawGraph();
    });
  });
  $('mysOn').addEventListener('click', function () { acted(); startMystery(); });
  $('mysOff').addEventListener('click', function () { acted(); stopMystery(); });
  $('mysNew').addEventListener('click', function () { acted(); startMystery(); });
  $('check').addEventListener('click', checkAnswer);
  $('ansEa').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); } });
  $('reveal').addEventListener('click', reveal);
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    updateLegend();
    updateGraphText();
    updateReadouts();
    if (view3 && view3.active) view3.onTheme();
    drawAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);
  // 暫停時圖表仍要更新閃光淡出（反應進程的短橫線）：低頻重畫
  setInterval(function () { if (!state.running && cur) { drawAll(); if (view3 && view3.active) view3.frame(); } }, 400);

  // ======================= 啟動 =======================
  readColors();
  newRun('');
  updateLegend();
  updateSoundButton();
  setSpeed(1);
  setRunning(state.running);
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
})();
