/* brownian-motion.js — 「布朗運動與原子的存在」頁面程式
 * 物理全部在 js/brownian-motion-core.js；3D 場景在 js/brownian-motion-3d.js（three.js 延遲載入）。
 * 模式：md（分子視角，示意）、micro（顯微鏡與均方位移）、sed（沉降平衡）。
 * 任務事件（'md'、'record'、'photo'）只在使用者親手操作之後才送出；格式見 js/missions/brownian-motion.js 開頭。
 */
(function () {
  'use strict';
  const C = window.BrownianMotionCore, D = window.LabDraw;
  if (!C || !D) return;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const $ = function (id) { return document.getElementById(id); };
  const val = function (el) { return window.LabNum ? +window.LabNum.value(el) : +el.value; };
  const setVal = function (el, v) { if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const FONT = D.FONT;
  const font = function (px, w) { return (w || '600') + ' ' + px + 'px ' + FONT; };
  const reduced = D.reducedMotion();
  const UM = 1e-6;
  const minus = function (s) { s = String(s); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace(/^-/, '−'); };

  // ---------------- 顏色 ----------------
  const tok = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    ['field', 'field-edge', 'scope', 'grain', 'grain-hi', 'mol', 'big', 'trail', 'tube', 'liquid', 'fit', 'theory', 'ens'].forEach(function (k) {
      tok[k] = cs.getPropertyValue('--bm-' + k).trim() || '#888888';
    });
  }
  readTokens();

  // ---------------- 狀態 ----------------
  const st = {
    mode: 'micro', speed: 5, paused: reduced, slow: false,
    rows: [], nextId: 1, obs: null,
    sed: null, sedKey: '', sedS: null, counts: null, lastCounts: null, photos: 0, sedPos: null, flash: 0,
    md: null, mdKey: '', hits: 0, mdT: 0, imp: [0, 0], impRef: 1, trail: [], emitT: 0
  };
  const el = { T: $('T'), a: $('a'), N: $('N'), tObs: $('tObs'), ratio: $('ratio'), liquid: $('liquid'), material: $('material'), trails: $('trails'), onlyBig: $('onlyBig') };
  const cv = $('cv'), ctx = cv.getContext('2d'), gcv = $('gcv'), gctx = gcv.getContext('2d');
  const stage = $('stage');
  const newSeed = function () { return 1 + Math.floor(Math.random() * 2147483000); };
  const animRng = C.rng(newSeed()), photoRng = C.rng(newSeed());

  // 顆粒半徑：對數滑桿 0.1–5 μm
  if (window.LabNum) {
    window.LabNum.register(el.a, {
      toValue: function (p) { return 0.1 * Math.pow(50, p / 1000); },
      toPos: function (v) { return 1000 * Math.log(v / 0.1) / Math.log(50); },
      min: 0.1, max: 5, decimals: 3
    });
    window.LabNum.set(el.a, 0.5);
  }

  // 只有使用者親手操作過之後才送任務事件（分享連結還原、自動播放都不算）
  let acted = false;
  ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, function (e) { if (e.isTrusted) acted = true; }, true); });
  function emit(type, data) { if (acted && window.LabMission) window.LabMission.emit(type, data); }

  // ---------------- 參數 ----------------
  function P() {
    return { liquid: el.liquid.value, T: val(el.T), a: val(el.a), N: Math.round(val(el.N)), tObs: Math.round(val(el.tObs) * 10) / 10, material: el.material.value, ratio: Math.round(val(el.ratio)) };
  }
  const LIQ_NAME = function (k) { return k === 'gly50' ? T('甘油 50%', '50% glycerol') : k === 'gly80' ? T('甘油 80%', '80% glycerol') : T('水', 'water'); };
  const MAT_NAME = function (k) { return k === 'polystyrene' ? T('聚苯乙烯', 'polystyrene') : k === 'silica' ? T('二氧化矽', 'silica') : T('藤黃', 'gamboge'); };

  // ---------------- 數字格式 ----------------
  function sig(x, n) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    const d = Math.max(0, (n || 3) - 1 - Math.floor(Math.log10(Math.abs(x))));
    return x.toFixed(Math.min(d, 6));
  }
  /** 科學記號（HTML，上標用 <sup>） */
  function sci(x, n) {
    if (!isFinite(x)) return '—';
    const e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e);
    return m.toFixed((n || 3) - 1) + ' × 10<sup>' + minus(String(e)) + '</sup>';
  }
  const pct = function (x) { return isFinite(x) ? minus((x >= 0 ? '+' : '') + (x * 100).toFixed(1)) + '%' : '—'; };
  const um2s = function (Dm2) { return sig(Dm2 * 1e12, 3); };          // m²/s → μm²/s
  function lenUM(m) { const u = m * 1e6; return u >= 100 ? u.toFixed(0) : u >= 10 ? u.toFixed(1) : u >= 1 ? u.toFixed(2) : u.toFixed(3); }

  // ---------------- 畫布尺寸 ----------------
  let W = 0, H = 0, dpr = 1;
  function canvasH(w) {
    const narrow = w < 640;
    if (st.mode === 'md') return narrow ? Math.round(w * 0.82) : Math.round(clamp(w * 0.6, 340, 500));
    if (st.mode === 'sed') return narrow ? Math.round(w * 1.08) : Math.round(clamp(w * 0.62, 380, 520));
    return narrow ? Math.round(w * 1.02) : Math.round(clamp(w * 0.62, 380, 520));
  }
  function resize() {
    const w = cv.clientWidth || 600, h = canvasH(w);
    cv.style.height = h + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = w; H = h;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    layerKey = '';
    requestDraw();
  }

  // =====================================================================
  // 顯微鏡：一次觀察
  // =====================================================================
  function startObs(seed) {
    const p = P();
    seed = seed || newSeed();
    const o = C.observe({ liquid: p.liquid, T: p.T, a: p.a * UM, N: p.N, tObs: p.tObs, seed: seed });
    o.seed = seed; o.p = p; o.t = 0; o.done = false; o.recorded = false; o.stale = false; o.ta = null;
    st.obs = o;
    layerKey = '';
    if (reduced) finishObs(true);
    else say(T('觀察中……', 'Observing…'));
    updateButtons(); updateReadouts(); drawGraph(); renderAna();
    if (view3 && view3.active) view3.rebuild();
    requestDraw();
  }
  function finishObs(quiet) {
    const o = st.obs;
    if (!o || o.done) return;
    o.done = true; o.t = o.run.F * o.run.dt;
    const maxLag = Math.max(1, Math.min(o.run.F - 1, Math.floor(o.run.F / 2)));
    o.ta = C.msdTimeAvg(o.run, maxLag, 2);
    const r = o.row;
    const msg = T('觀察完成：D 量測 = ', 'Observation complete: measured D = ') + um2s(r.Dm) + ' μm²/s' +
      T('（理論 ', ' (theory ') + um2s(r.D) + ' μm²/s' + T('，相差 ', ', difference ') + pct(r.err) + T('）。按「記錄」存下這一次。', '). Press “Record” to keep it.');
    if (!quiet || reduced) say(msg);
    $('srState').textContent = msg;
    updateButtons(); updateReadouts(); drawGraph(); renderAna();
    if (view3 && view3.active) view3.update();
  }
  function interruptObs() {
    const o = st.obs;
    if (!o || o.stale) return;
    o.stale = true;
    say(T('設定已改變：按「開始觀察」重新觀察。', 'The settings have changed: press “Start observing” to observe again.'));
    updateButtons();
  }
  function record() {
    const o = st.obs;
    if (st.mode !== 'micro' || !o || !o.done || o.recorded || o.stale) return;
    const row = Object.assign({ id: st.nextId++ }, o.row);
    st.rows.push(row);
    o.recorded = true;
    clickSound();
    emit('record', { row: row, rows: st.rows.slice(), sed: st.sed });
    say(T('已記錄第 ', 'Recorded row ') + st.rows.length + T(' 筆：D = ', ': D = ') + um2s(row.Dm) + ' μm²/s' + T('，由它算出的亞佛加厥數 = ', '; the Avogadro number from it = ') + (row.NA / 1e23).toFixed(2) + T(' × 10 的 23 次方', ' × 10 to the 23rd'));
    updateButtons(); renderTable(); renderAna(); drawGraph();
  }

  // =====================================================================
  // 沉降平衡
  // =====================================================================
  function sedEnsure() {
    const p = P(), key = [p.material, p.a, p.T].join('|');
    if (key === st.sedKey && st.sedS) return;
    st.sedKey = key;
    const sp = C.sedParams(p.material, p.a * UM, p.T), view = C.sedView(sp.H, p.a * UM);
    const Lx = view.Hv * 1.25, Ly = view.Hv * 0.5;
    st.sedS = { sp: sp, view: view, Lx: Lx, Ly: Ly, a: p.a, material: p.material, T: p.T };
    st.counts = new Array(view.layers).fill(0); st.lastCounts = null; st.photos = 0;
    st.sedPos = C.sedSample(C.SED_N, sp.H, Lx, Ly, animRng);
    st.sedFit = null;
    layerKey = '';
  }
  function photo() {
    if (st.mode !== 'sed') return;
    sedEnsure();
    const S = st.sedS, p = P();
    const ph = C.sedPhoto(S.sp, S.view, S.Lx, S.Ly, photoRng);
    ph.counts.forEach(function (c, i) { st.counts[i] += c; });
    st.photos++;
    st.lastCounts = ph.counts;
    st.sedPos = ph.pos;
    const f = C.sedFit(p.material, p.a * UM, p.T, st.counts, S.view);
    st.sedFit = f;
    const d = { material: p.material, a: p.a, T: p.T, dRho: S.sp.dRho, H: S.sp.H / UM, Hm: f.fit.H / UM, Hse: f.fit.se / UM, half: f.fit.H / UM * Math.LN2,
      photos: st.photos, counted: f.counted, kB: f.kB, NA: f.NA, naErr: f.naErr, rows: st.rows.slice() };
    st.sed = d;
    st.flash = reduced ? 0 : 1;
    shutter();
    emit('photo', d);
    const msg = T('第 ', 'Photo ') + st.photos + T(' 張照片，這張數到 ', ': counted ') + ph.counts.reduce(function (s, c) { return s + c; }, 0) +
      T(' 顆、累計 ', ' particles, ') + f.counted + T(' 顆。', ' in total. ') +
      (isFinite(f.fit.H) ? T('擬合的標高 H = ', 'Fitted scale height H = ') + lenUM(f.fit.H) + ' μm' + T('（理論 ', ' (theory ') + lenUM(S.sp.H) + ' μm' + T('）。', ').') : '');
    say(msg); $('srState').textContent = msg;
    renderTable(); renderAna(); drawGraph(); updateReadouts();
    if (view3 && view3.active) view3.update();
    requestDraw();
  }

  // =====================================================================
  // 分子視角（示意）
  // =====================================================================
  const MD = { n: 400, W: 160, H: 100, r: 1, Rb: 6, dt: 0.05 };
  function kTnow() { return (val(el.T) + C.T0) / 293.15; }
  function mdEnsure() {
    const key = String(Math.round(val(el.ratio)));
    if (st.md && key === st.mdKey) return;
    st.mdKey = key;
    st.md = C.mdCreate({ n: MD.n, W: MD.W, H: MD.H, r: MD.r, Rb: MD.Rb, m: 1, M: +key, kT: kTnow(), seed: newSeed(), periodic: false });
    st.trail = []; st.hits = 0; st.mdT = 0; st.imp = [0, 0];
  }
  function mdRetemp() {
    const s = st.md;
    if (!s) return;
    const k = kTnow(), f = Math.sqrt(k / s.kT);
    for (let i = 0; i < s.n; i++) { s.vx[i] *= f; s.vy[i] *= f; }
    s.kT = k;
  }
  function mdAdvance(dtReal) {
    const s = st.md;
    if (!s || st.paused) return false;
    const steps = Math.max(1, Math.round((st.slow ? 3 : 12) * dtReal * 60));
    const decay = Math.exp(-MD.dt / 2.5);
    for (let k = 0; k < steps; k++) {
      const r = C.mdStep(s, MD.dt);
      st.imp[0] = st.imp[0] * decay + r.jx; st.imp[1] = st.imp[1] * decay + r.jy;
      if (el.onlyBig.checked) st.hits += r.hits;
    }
    const m = Math.hypot(st.imp[0], st.imp[1]);
    st.impRef = st.impRef * 0.995 + m * 0.005;
    st.trail.push(s.x[0], s.y[0]);
    if (st.trail.length > 2400) st.trail.splice(0, st.trail.length - 2400);
    if (el.onlyBig.checked) {
      st.mdT += dtReal;
      if (st.mdT - st.emitT >= 1) {
        st.emitT = st.mdT;
        emit('md', { onlyBig: true, hits: st.hits, ratio: Math.round(val(el.ratio)), t: st.mdT });
      }
    }
    return true;
  }

  // =====================================================================
  // 繪圖：顯微鏡
  // =====================================================================
  let layer = null, layerKey = '';
  function microGeom() {
    const o = st.obs, L = o ? o.L : C.fovFor(C.D(el.liquid.value, val(el.T), val(el.a) * UM), val(el.tObs), val(el.a) * UM);
    const R = Math.min(W, H) / 2 - 12, k = 2 * R / (1.45 * L);
    return { cx: W / 2, cy: H / 2, R: R, k: k, L: L };
  }
  function buildMicroLayer(G) {
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 顯微鏡筒身（深色）＋柔和的暈影
    const bg = g.createRadialGradient(G.cx, G.cy, G.R * 0.9, G.cx, G.cy, Math.hypot(W, H) * 0.6);
    bg.addColorStop(0, D.shade(tok.scope, 0.12)); bg.addColorStop(1, D.shade(tok.scope, -0.25));
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 鏡筒邊緣的金屬環
    g.beginPath(); g.arc(G.cx, G.cy, G.R + 7, 0, Math.PI * 2);
    const ring = g.createLinearGradient(G.cx - G.R, G.cy - G.R, G.cx + G.R, G.cy + G.R);
    ring.addColorStop(0, D.shade(tok.scope, 0.55)); ring.addColorStop(0.5, D.shade(tok.scope, 0.15)); ring.addColorStop(1, D.shade(tok.scope, -0.3));
    g.fillStyle = ring; g.fill();
    // 明視野：中央亮、邊緣暗
    g.save();
    g.beginPath(); g.arc(G.cx, G.cy, G.R, 0, Math.PI * 2); g.clip();
    const fg = g.createRadialGradient(G.cx - G.R * 0.15, G.cy - G.R * 0.2, G.R * 0.1, G.cx, G.cy, G.R);
    fg.addColorStop(0, D.shade(tok.field, 0.12)); fg.addColorStop(0.75, tok.field); fg.addColorStop(1, tok['field-edge']);
    g.fillStyle = fg; g.fillRect(G.cx - G.R, G.cy - G.R, 2 * G.R, 2 * G.R);
    // 目鏡刻度（十字線與每 1–2–5 的小刻度）
    const tick = C.nice125(G.L / 10), tp = tick * G.k;
    g.strokeStyle = D.alpha(D.dark ? '#ffffff' : '#2b2b2b', 0.16); g.lineWidth = 1;
    g.beginPath(); g.moveTo(G.cx - G.R, G.cy); g.lineTo(G.cx + G.R, G.cy); g.moveTo(G.cx, G.cy - G.R); g.lineTo(G.cx, G.cy + G.R); g.stroke();
    g.beginPath();
    for (let i = -20; i <= 20; i++) {
      if (!i) continue;
      const x = G.cx + i * tp, len = i % 5 === 0 ? 7 : 4;
      if (Math.abs(x - G.cx) > G.R - 4) continue;
      g.moveTo(x, G.cy - len); g.lineTo(x, G.cy + len);
      g.moveTo(G.cx - len, G.cy + i * tp); g.lineTo(G.cx + len, G.cy + i * tp);
    }
    g.stroke();
    // 起點範圍（虛線方框）
    g.setLineDash([4, 5]); g.strokeStyle = D.alpha(tok.trail, 0.28);
    g.strokeRect(G.cx - G.L / 2 * G.k, G.cy - G.L / 2 * G.k, G.L * G.k, G.L * G.k);
    g.setLineDash([]);
    // 邊緣的內陰影
    const inner = g.createRadialGradient(G.cx, G.cy, G.R * 0.82, G.cx, G.cy, G.R);
    inner.addColorStop(0, 'rgba(0,0,0,0)'); inner.addColorStop(1, 'rgba(0,0,0,' + (D.dark ? 0.45 : 0.22) + ')');
    g.fillStyle = inner; g.fillRect(G.cx - G.R, G.cy - G.R, 2 * G.R, 2 * G.R);
    g.restore();
    return c;
  }
  function posAt(o, i, t) {
    const run = o.run, fl = clamp(t / run.dt, 0, run.F), f0 = Math.floor(fl), f1 = Math.min(run.F, f0 + 1), u = fl - f0;
    const a = f0 * run.N + i, b = f1 * run.N + i;
    return [run.x[a] + (run.x[b] - run.x[a]) * u, run.y[a] + (run.y[b] - run.y[a]) * u];
  }
  function drawMicro() {
    const G = microGeom(), o = st.obs;
    const key = ['m', W, H, dpr, D.ver, G.L].join('|');
    if (key !== layerKey) { layer = buildMicroLayer(G); layerKey = key; }
    ctx.drawImage(layer, 0, 0, W, H);
    const X = function (x) { return G.cx + x * G.k; }, Y = function (y) { return G.cy - y * G.k; };
    ctx.save();
    ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R, 0, Math.PI * 2); ctx.clip();
    const a = (o ? o.p.a : val(el.a)) * UM, rpx = a * G.k, rDraw = Math.max(2.2, rpx);
    if (o) {
      const run = o.run, fNow = Math.floor(clamp(o.t / run.dt, 0, run.F));
      // 漸淡的軌跡：分段畫，越舊越淡
      if (el.trails.checked && fNow > 0) {
        const seg = Math.max(1, Math.ceil(fNow / 12));
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 1.4;
        for (let s0 = 0; s0 < fNow; s0 += seg) {
          const s1 = Math.min(fNow, s0 + seg), age = 1 - (s1 / Math.max(1, fNow));
          ctx.strokeStyle = D.alpha(tok.trail, 0.22 + 0.55 * (1 - age));
          ctx.beginPath();
          for (let i = 0; i < run.N; i++) {
            let q = s0 * run.N + i;
            ctx.moveTo(X(run.x[q]), Y(run.y[q]));
            for (let f = s0 + 1; f <= s1; f++) { q = f * run.N + i; ctx.lineTo(X(run.x[q]), Y(run.y[q])); }
          }
          ctx.stroke();
        }
        if (!o.done) {
          ctx.strokeStyle = D.alpha(tok.trail, 0.75); ctx.beginPath();
          for (let i = 0; i < run.N; i++) { const q = fNow * run.N + i, p = posAt(o, i, o.t); ctx.moveTo(X(run.x[q]), Y(run.y[q])); ctx.lineTo(X(p[0]), Y(p[1])); }
          ctx.stroke();
        }
      }
      // 顆粒（亮場下是暗色小球）
      for (let i = 0; i < run.N; i++) {
        const p = posAt(o, i, o.t);
        D.ball(ctx, X(p[0]), Y(p[1]), rDraw, i === 0 ? tok['grain-hi'] : tok.grain, { glow: 0, shadow: rDraw > 4 });
      }
      // 第 1 顆：起點與觀察結束時的方均根距離圈
      if (o.done) {
        const p0 = [run.x[0], run.y[0]], rr = Math.sqrt(4 * run.D * o.t) * G.k;
        ctx.setLineDash([5, 4]); ctx.strokeStyle = D.alpha(tok['grain-hi'], 0.75); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(X(p0[0]), Y(p0[1]), rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = tok['grain-hi']; ctx.beginPath(); ctx.arc(X(p0[0]), Y(p0[1]), 2.5, 0, Math.PI * 2); ctx.fill();
        const lx = X(p0[0]), ly = Y(p0[1]) - rr - 4;
        D.pill(ctx, T('√(4Dt)：方均根距離', '√(4Dt): rms distance'), clamp(lx, G.cx - G.R + 70, G.cx + G.R - 70), clamp(ly, G.cy - G.R + 24, G.cy + G.R - 4), tok['grain-hi'], 'center', font(11, '600'));
      }
    }
    ctx.restore();
    // 比例尺
    const sb = C.nice125(G.L / 4) / (C.nice125(G.L / 4) * G.k > G.R * 0.7 ? 2 : 1), sbp = sb * G.k;
    const bx = G.cx - G.R * 0.62, by = G.cy + G.R * 0.72;
    ctx.fillStyle = D.dark ? '#f2f2f2' : '#222222';
    ctx.fillRect(bx, by, sbp, 3);
    D.pill(ctx, lenUM(sb) + ' μm', bx + sbp / 2, by - 4, D.c.text, 'center', font(11, '700'));
    // 時間與狀態
    const pad = 10;
    const tNow = o ? o.t : 0, tEnd = o ? o.run.F * o.run.dt : val(el.tObs);
    D.pill(ctx, 't = ' + tNow.toFixed(1) + ' s / ' + tEnd.toFixed(0) + ' s', pad, pad + 22, D.c.text, 'left', font(12, '700'));
    D.pill(ctx, T('播放 ×', 'Playback ×') + st.speed + T('（每秒 10 張）', ' (10 frames/s)'), pad, pad + 46, D.c.muted, 'left', font(11, '600'));
    if (o && o.stale) D.pill(ctx, T('設定已改變：按「開始觀察」', 'Settings changed: press “Start observing”'), W / 2, H - pad, D.c.accent, 'center', font(12, '700'));
    else if (rpx < 2.2) D.pill(ctx, T('顆粒比一個像素還小，畫成光點', 'Particles are smaller than a pixel: drawn as dots'), W - pad, H - pad, D.c.muted, 'right', font(11, '600'));
    if (o) D.pill(ctx, 'N = ' + o.run.N + T('，', ', ') + 'a = ' + sig(o.p.a, 3) + ' μm', W - pad, pad + 22, D.c.text, 'right', font(11, '600'));
  }

  // =====================================================================
  // 繪圖：沉降平衡
  // =====================================================================
  function sedGeom() {
    const narrow = W < 560;
    const top = 44, bot = narrow ? 40 : 34, left = narrow ? 50 : 62;
    const chartW = narrow ? Math.round(W * 0.3) : Math.round(clamp(W * 0.28, 150, 240));
    const ww = W - left - chartW - 26, hh = H - top - bot;
    return { x0: left, y0: top, w: ww, h: hh, cx0: left + ww + 16, cw: chartW };
  }
  function buildSedLayer(G, S) {
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, W, H);
    // 玻璃槽：液體漸層、玻璃邊
    const lg = g.createLinearGradient(0, G.y0, 0, G.y0 + G.h);
    lg.addColorStop(0, D.shade(tok.liquid, 0.1)); lg.addColorStop(1, D.shade(tok.liquid, -0.06));
    D.roundRect(g, G.x0 - 6, G.y0 - 10, G.w + 12, G.h + 16, 8);
    g.fillStyle = D.alpha(tok.tube, 0.35); g.fill();
    g.fillStyle = lg; g.fillRect(G.x0, G.y0, G.w, G.h);
    g.strokeStyle = D.alpha(D.shade(tok.tube, -0.3), 0.9); g.lineWidth = 1.5;
    D.roundRect(g, G.x0 - 6, G.y0 - 10, G.w + 12, G.h + 16, 8); g.stroke();
    // 玻璃反光
    const hl = g.createLinearGradient(G.x0, 0, G.x0 + G.w, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0.18)'); hl.addColorStop(0.08, 'rgba(255,255,255,0)'); hl.addColorStop(0.92, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(255,255,255,0.12)');
    g.fillStyle = hl; g.fillRect(G.x0, G.y0, G.w, G.h);
    // 分層虛線與高度刻度
    const nl = S.view.layers, Hv = S.view.Hv;
    g.setLineDash([4, 4]); g.strokeStyle = D.alpha(D.c.text, 0.22); g.lineWidth = 1;
    for (let j = 1; j < nl; j++) { const y = Math.round(G.y0 + G.h - j / nl * G.h) + 0.5; g.beginPath(); g.moveTo(G.x0, y); g.lineTo(G.x0 + G.w, y); g.stroke(); }
    g.setLineDash([]);
    for (let j = 0; j <= nl; j++) {
      const y = G.y0 + G.h - j / nl * G.h;
      g.strokeStyle = D.alpha(D.c.text, 0.5); g.beginPath(); g.moveTo(G.x0 - 12, y); g.lineTo(G.x0 - 6, y); g.stroke();
      D.haloText(g, sig(Hv / nl * j * 1e6, 3), G.x0 - 14, y, D.c.muted, 'right', 'middle', font(11, '600'));
    }
    D.haloText(g, T('高度 h（μm）', 'Height h (μm)'), 8, G.y0 - 22, D.c.text, 'left', 'middle', font(11, '700'));
    // 底部
    g.fillStyle = D.shade(tok.tube, -0.2); g.fillRect(G.x0 - 6, G.y0 + G.h, G.w + 12, 6);
    // 右側計數圖的框
    g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(G.cx0, G.y0); g.lineTo(G.cx0, G.y0 + G.h); g.lineTo(G.cx0 + G.cw, G.y0 + G.h); g.stroke();
    D.haloText(g, T('各層累計顆粒數', 'Count per layer'), G.cx0, G.y0 - 22, D.c.text, 'left', 'middle', font(11, '700'));
    return c;
  }
  function drawSed() {
    sedEnsure();
    const S = st.sedS, G = sedGeom();
    const key = ['s', W, H, dpr, D.ver, st.sedKey].join('|');
    if (key !== layerKey) { layer = buildSedLayer(G, S); layerKey = key; }
    ctx.drawImage(layer, 0, 0, W, H);
    const Hv = S.view.Hv, kx = G.w / S.Lx, ky = G.h / Hv;
    const rpx = Math.max(1.6, S.sp.H > 0 ? (st.sedS.a * UM) * ky : 2);
    ctx.save();
    ctx.beginPath(); ctx.rect(G.x0, G.y0, G.w, G.h); ctx.clip();
    const pos = st.sedPos;
    // 前後景深：y（深度）越後面越淡、越小
    for (let i = 0; i < pos.n; i++) {
      const h = pos.h[i];
      if (h > Hv) continue;
      const depth = pos.y[i] / S.Ly;
      const r = rpx * (1.1 - 0.25 * depth);
      D.ball(ctx, G.x0 + pos.x[i] * kx, G.y0 + G.h - h * ky, r, depth > 0.5 ? D.shade(tok.grain, -0.12) : tok.grain, { glow: 0, shadow: r > 4 });
    }
    if (st.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (0.6 * st.flash) + ')'; ctx.fillRect(G.x0, G.y0, G.w, G.h); }
    ctx.restore();
    // 右側：各層累計數（長條）與指數理論曲線
    const nl = S.view.layers, tot = st.counts.reduce(function (s, c) { return s + c; }, 0);
    const lh = G.h / nl;
    const th = function (j) { return Math.exp(-(j * Hv / nl) / S.sp.H) - Math.exp(-((j + 1) * Hv / nl) / S.sp.H); };
    const expect = st.photos * C.SED_N;
    let cmax = 1;
    for (let j = 0; j < nl; j++) cmax = Math.max(cmax, st.counts[j], expect * th(j));
    for (let j = 0; j < nl; j++) {
      const y = G.y0 + G.h - (j + 1) * lh, w = st.counts[j] / cmax * (G.cw - 34);
      if (w > 0) D.block(ctx, G.cx0 + 1, y + lh * 0.18, w, lh * 0.64, tok.ens, { r: 3, shadow: false });
      if (st.photos) D.haloText(ctx, String(st.counts[j]), G.cx0 + 6 + w, y + lh / 2, D.c.text, 'left', 'middle', font(11, '700'));
    }
    if (st.photos) {
      ctx.save(); ctx.beginPath(); ctx.rect(G.cx0, G.y0 - 4, G.cw, G.h + 8); ctx.clip();
      ctx.strokeStyle = tok.theory; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      for (let s = 0; s <= 60; s++) {
        // 以 hh 為中心、厚度一層的預期顆粒數，曲線剛好通過每一層長條的中點
        const hh = s / 60 * Hv, dens = expect * 2 * Math.sinh(Hv / nl / 2 / S.sp.H) * Math.exp(-hh / S.sp.H);
        const x = G.cx0 + 1 + dens / cmax * (G.cw - 34), y = G.y0 + G.h - hh * ky;
        if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    } else {
      D.haloText(ctx, T('按「拍照計數」', 'Press “Photograph'), G.cx0 + G.cw / 2, G.y0 + G.h / 2 - 9, D.c.muted, 'center', 'middle', font(11, '600'));
      D.haloText(ctx, T('開始數', '& count”'), G.cx0 + G.cw / 2, G.y0 + G.h / 2 + 9, D.c.muted, 'center', 'middle', font(11, '600'));
    }
    // 標示
    const accel = S.sp.relax / 4;
    D.pill(ctx, MAT_NAME(S.material) + T('，', ', ') + 'a = ' + sig(S.a, 3) + ' μm，H = ' + lenUM(S.sp.H) + ' μm', G.x0, H - 8, D.c.text, 'left', font(11, '700'));
    if (!reduced) D.pill(ctx, (st.paused ? T('已暫停', 'Paused') : T('動畫加速 ×', 'Sped up ×') + sig(accel, 2)), G.x0 + G.w, 28, D.c.muted, 'right', font(11, '600'));
    D.pill(ctx, T('照片 ', 'Photos ') + st.photos + T(' 張', ''), W - 8, H - 8, D.c.text, 'right', font(11, '700'));
  }

  // =====================================================================
  // 繪圖：分子視角
  // =====================================================================
  function mdNote() {
    return [T('示意：大小與質量比都大幅縮小', 'Schematic: sizes and mass ratio scaled right down'),
      T('質量比 ', 'Mass ratio ') + Math.round(val(el.ratio)) + T('（真實的顆粒比水分子重十億倍以上）', ' (a real particle is over a billion times heavier)')];
  }
  function mdTwoLines() {
    ctx.font = font(11, '700');
    const t = mdNote();
    return ctx.measureText(t[0] + '；' + t[1]).width + 24 > W - 16;
  }
  function mdGeom() {
    const top = mdTwoLines() ? 62 : 40;
    const k = Math.min((W - 24) / MD.W, (H - top - 34) / MD.H);
    const bw = MD.W * k, bh = MD.H * k;
    return { k: k, x0: (W - bw) / 2, y0: top + (H - top - 34 - bh) / 2, w: bw, h: bh };
  }
  function buildMdLayer(G) {
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, W, H);
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : D.alpha(D.c.text, 0.2); g.shadowBlur = 10; g.shadowOffsetY = 3;
    D.roundRect(g, G.x0, G.y0, G.w, G.h, 10);
    const lg = g.createLinearGradient(0, G.y0, 0, G.y0 + G.h);
    lg.addColorStop(0, D.shade(tok.liquid, 0.12)); lg.addColorStop(1, D.shade(tok.liquid, -0.05));
    g.fillStyle = lg; g.fill();
    g.restore();
    D.roundRect(g, G.x0, G.y0, G.w, G.h, 10);
    g.strokeStyle = D.alpha(D.shade(tok.tube, -0.3), 0.9); g.lineWidth = 2; g.stroke();
    return c;
  }
  function drawMd() {
    mdEnsure();
    const G = mdGeom(), s = st.md, only = el.onlyBig.checked;
    const key = ['d', W, H, dpr, D.ver, G.y0].join('|');
    if (key !== layerKey) { layer = buildMdLayer(G); layerKey = key; }
    ctx.drawImage(layer, 0, 0, W, H);
    const X = function (x) { return G.x0 + x * G.k; }, Y = function (y) { return G.y0 + y * G.k; };
    ctx.save();
    D.roundRect(ctx, G.x0, G.y0, G.w, G.h, 10); ctx.clip();
    // 大顆粒的軌跡
    const tr = st.trail;
    if (tr.length > 4) {
      ctx.lineJoin = 'round'; ctx.lineWidth = 1.6;
      const n = tr.length / 2, seg = Math.max(2, Math.ceil(n / 10));
      for (let s0 = 0; s0 < n - 1; s0 += seg) {
        const s1 = Math.min(n - 1, s0 + seg);
        ctx.strokeStyle = D.alpha(tok.trail, 0.15 + 0.6 * (s1 / n));
        ctx.beginPath(); ctx.moveTo(X(tr[2 * s0]), Y(tr[2 * s0 + 1]));
        for (let q = s0 + 1; q <= s1; q++) ctx.lineTo(X(tr[2 * q]), Y(tr[2 * q + 1]));
        ctx.stroke();
      }
    }
    // 分子
    if (!only) {
      const rm = Math.max(1.6, MD.r * G.k);
      for (let i = 1; i < s.n; i++) D.ball(ctx, X(s.x[i]), Y(s.y[i]), rm, tok.mol, { glow: 0, shadow: false });
    }
    D.ball(ctx, X(s.x[0]), Y(s.y[0]), MD.Rb * G.k, tok.big, { glow: D.dark ? 0.25 : 0 });
    // 近一段時間的淨衝量（撞擊不平衡的方向）
    if (!only) {
      const m = Math.hypot(st.imp[0], st.imp[1]);
      if (m > 0 && st.impRef > 0) {
        const L = clamp(m / st.impRef * 30, 0, 70), ux = st.imp[0] / m, uy = st.imp[1] / m;
        const x0 = X(s.x[0]), y0 = Y(s.y[0]), r0 = MD.Rb * G.k + 3;
        if (L > 6) D.arrow(ctx, x0 + ux * r0, y0 + uy * r0, x0 + ux * (r0 + L), y0 + uy * (r0 + L), tok['grain-hi'], 2.5);
      }
    }
    ctx.restore();
    const note = mdNote();
    if (mdTwoLines()) {
      D.pill(ctx, note[0], W / 2, 26, D.c.accent, 'center', font(11, '700'));
      D.pill(ctx, note[1], W / 2, 50, D.c.accent, 'center', font(W < 420 ? 10 : 11, '700'));
    } else D.pill(ctx, note[0] + T('；', ' · ') + note[1], W / 2, 28, D.c.accent, 'center', font(11, '700'));
    D.pill(ctx, only ? T('只看大顆粒：被撞 ', 'Particle only: hit ') + st.hits + T(' 次', ' times') : T('紅箭頭：最近一段時間撞擊的淨衝量', 'Red arrow: net impulse of the recent collisions'), G.x0, H - 8, only ? D.c.text : tok['grain-hi'], 'left', font(11, '700'));
    if (st.paused) D.pill(ctx, T('已暫停', 'Paused'), W - 8, H - 8, D.c.muted, 'right', font(11, '700'));
    else if (st.slow) D.pill(ctx, T('慢放', 'Slow motion'), W - 8, H - 8, D.c.muted, 'right', font(11, '700'));
  }

  // =====================================================================
  // 繪製迴圈
  // =====================================================================
  let raf = 0, lastT = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = Math.min(1 / 20, lastT ? (now - lastT) / 1000 : 1 / 60);
    lastT = now;
    let more = false;
    const vis = !document.hidden;
    if (vis) {
      if (st.mode === 'micro' && st.obs && !st.obs.done && !st.obs.stale) {
        st.obs.t += dt * st.speed;
        if (st.obs.t >= st.obs.run.F * st.obs.run.dt) finishObs(false); else more = true;
      } else if (st.mode === 'sed' && !reduced) {
        sedEnsure();
        if (!st.paused) { const S = st.sedS; C.sedStep(st.sedPos, S.sp.relax / 240 * dt * 60, S.sp.D, S.sp.H, S.Lx, S.Ly, animRng); more = true; }
        if (st.flash > 0) { st.flash = Math.max(0, st.flash - dt * 3); more = true; }
      } else if (st.mode === 'md') {
        mdEnsure();
        if (mdAdvance(dt)) more = true;
      }
    }
    if (!stage.classList.contains('is3d')) draw();
    else if (view3 && view3.active) view3.update();
    if (more && vis) requestDraw(); else lastT = 0;
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (st.mode === 'micro') drawMicro(); else if (st.mode === 'sed') drawSed(); else drawMd();
  }

  // =====================================================================
  // 讀數、表格、分析
  // =====================================================================
  function rowHtml(dt, dd, cls) { return '<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; }
  function updateReadouts() {
    const p = P();
    let h = '';
    if (st.mode === 'micro') {
      const e = C.eta(p.liquid, p.T), Dd = C.diffusion(p.T, e, p.a * UM);
      h += rowHtml(T('黏滯係數 η', 'Viscosity η'), sig(e * 1e3, 3) + ' mPa·s');
      h += rowHtml(T('擴散係數 D（理論）', 'Diffusion coefficient D (theory)'), um2s(Dd) + ' μm<sup>2</sup>/s', 'em');
      h += rowHtml(T('觀察結束時的方均根距離 √(4Dt)', 'rms distance at the end, √(4Dt)'), lenUM(Math.sqrt(4 * Dd * p.tObs)) + ' μm');
      h += rowHtml(T('速度鬆弛時間 τ', 'Velocity relaxation time τ'), sig(C.relaxTime(p.a * UM, 1050, e) * 1e6, 2) + ' μs');
      const o = st.obs;
      if (o && o.done && !o.stale) {
        h += rowHtml(T('D（這次量測）', 'D (this run)'), um2s(o.row.Dm) + (isFinite(o.row.se) ? ' ± ' + sig(o.row.se * 1e12, 2) : '') + ' μm<sup>2</sup>/s', 'em');
        h += rowHtml(T('與理論相差', 'Difference from theory'), pct(o.row.err));
      }
    } else if (st.mode === 'sed') {
      sedEnsure();
      const S = st.sedS;
      h += rowHtml(T('密度差 ρ<sub>p</sub> − ρ<sub>f</sub>', 'Density difference ρ<sub>p</sub> − ρ<sub>f</sub>'), sig(S.sp.dRho, 3) + ' kg/m<sup>3</sup>');
      h += rowHtml(T('扣掉浮力的質量 m′', 'Mass minus buoyancy m′'), sci(S.sp.mPrime, 3) + ' kg');
      h += rowHtml(T('標高 H（理論）', 'Scale height H (theory)'), lenUM(S.sp.H) + ' μm', 'em');
      h += rowHtml(T('減半高度 H ln 2', 'Halving height H ln 2'), lenUM(S.sp.H * Math.LN2) + ' μm');
      h += rowHtml(T('視窗高度（6 層）', 'Window height (6 layers)'), lenUM(S.view.Hv) + ' μm');
      h += rowHtml(T('黏滯係數 η（水）', 'Viscosity η (water)'), sig(S.sp.eta * 1e3, 3) + ' mPa·s');
    } else {
      const s = st.md, M = Math.round(val(el.ratio));
      h += rowHtml(T('質量比 M/m', 'Mass ratio M/m'), String(M));
      h += rowHtml(T('大顆粒的方均根速率 ÷ 分子的', 'rms speed of the big particle ÷ a molecule’s'), '1/√' + M + ' = ' + (1 / Math.sqrt(M)).toFixed(3), 'em');
      h += rowHtml(T('分子數', 'Molecules'), String(MD.n));
      h += rowHtml(T('「只看大顆粒」後被撞的次數', 'Hits since “Particle only”'), el.onlyBig.checked ? String(st.hits) : '—');
      if (s) h += rowHtml(T('相對溫度 T/293 K', 'Relative temperature T/293 K'), s.kT.toFixed(3));
    }
    $('readout').innerHTML = h;
  }
  function liqShort(k) { return k === 'gly50' ? T('甘油50%', 'gly 50%') : k === 'gly80' ? T('甘油80%', 'gly 80%') : T('水', 'water'); }
  function renderTable() {
    const tb = $('tbl');
    let h = '';
    if (st.mode === 'sed') {
      sedEnsure();
      const S = st.sedS, nl = S.view.layers, w = S.view.Hv / nl;
      h = '<thead><tr><th>' + T('層', 'Layer') + '</th><th>' + T('高度範圍<br>(μm)', 'Height<br>(μm)') + '</th><th>' + T('這張', 'This photo') + '</th><th>' + T('累計 n', 'Total n') + '</th><th>ln n</th></tr></thead><tbody>';
      for (let j = nl - 1; j >= 0; j--) {
        const n = st.counts[j];
        h += '<tr><td>' + (j + 1) + '</td><td>' + sig(j * w * 1e6, 3) + '–' + sig((j + 1) * w * 1e6, 3) + '</td><td>' + (st.lastCounts ? st.lastCounts[j] : '—') + '</td><td class="em">' + (st.photos ? n : '—') + '</td><td>' + (n > 0 ? Math.log(n).toFixed(2) : '—') + '</td></tr>';
      }
      h += '</tbody>';
      tb.setAttribute('aria-label', T('各層的顆粒數', 'Particles per layer'));
    } else {
      h = '<thead><tr><th>#</th><th>' + T('液體', 'Liquid') + '</th><th>T<br>(°C)</th><th>η<br>(mPa·s)</th><th>a<br>(μm)</th><th>N</th><th>t<br>(s)</th>' +
        '<th>' + T('D 理論', 'D theory') + '<br>(μm<sup>2</sup>/s)</th><th>' + T('D 量測', 'D measured') + '<br>(μm<sup>2</sup>/s)</th><th>' + T('相差', 'Diff.') + '</th>' +
        '<th>k<sub>B</sub><br>(10<sup>−23</sup> J/K)</th><th>N<sub>A</sub><br>(10<sup>23</sup>/mol)</th></tr></thead><tbody>';
      if (!st.rows.length) h += '<tr class="empty"><td colspan="12">' + T('觀察完成後按「記錄」，數據會出現在這裡。', 'Press “Record” after an observation and the data will appear here.') + '</td></tr>';
      st.rows.forEach(function (r, i) {
        h += '<tr' + (i === st.rows.length - 1 ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td>' + liqShort(r.liquid) + '</td><td>' + minus(r.T.toFixed(1)) + '</td><td>' + sig(r.eta, 3) + '</td><td>' + sig(r.a, 3) + '</td><td>' + r.N + '</td><td>' + r.tObs.toFixed(0) +
          '</td><td>' + um2s(r.D) + '</td><td class="em">' + um2s(r.Dm) + (isFinite(r.se) ? ' ± ' + sig(r.se * 1e12, 2) : '') + '</td><td>' + pct(r.err) + '</td><td>' + (r.kB / 1e-23).toFixed(3) + '</td><td>' + (r.NA / 1e23).toFixed(2) + '</td></tr>';
      });
      h += '</tbody>';
      tb.setAttribute('aria-label', T('顯微鏡觀察的紀錄', 'Records of the microscope observations'));
    }
    tb.innerHTML = h;
  }
  function renderAna() {
    let h = '';
    if (st.mode === 'sed') {
      sedEnsure();
      const f = st.sedFit, S = st.sedS;
      if (f && isFinite(f.fit.H)) {
        h += rowHtml(T('照片／累計顆粒數', 'Photos / particles counted'), st.photos + ' / ' + f.counted);
        h += rowHtml(T('擬合的標高 H', 'Fitted scale height H'), lenUM(f.fit.H) + (isFinite(f.fit.se) ? ' ± ' + sig(f.fit.se * 1e6, 2) : '') + ' μm' + T('（理論 ', ' (theory ') + lenUM(S.sp.H) + ' μm）'.replace('）', T('）', ')')), 'em');
        h += rowHtml(T('減半高度', 'Halving height'), lenUM(f.fit.H * Math.LN2) + ' μm');
        h += rowHtml('k<sub>B</sub> = m′gH/T', sci(f.kB, 3) + ' J/K');
        h += rowHtml('N<sub>A</sub> = R/k<sub>B</sub>', sci(f.NA, 3) + ' /mol' + T('（與定義值相差 ', ' (') + pct(f.naErr) + T('）', ' from the defined value)'), 'em');
      } else h += rowHtml(T('擬合', 'Fit'), T('拍一張照片之後才算得出來', 'needs at least one photo'));
    } else if (st.mode === 'micro') {
      const r = st.rows[st.rows.length - 1];
      if (r) {
        h += rowHtml(T('最新一筆：k<sub>B</sub> = 6πηaD/T', 'Latest: k<sub>B</sub> = 6πηaD/T'), sci(r.kB, 3) + ' J/K');
        h += rowHtml('N<sub>A</sub> = R/k<sub>B</sub>', sci(r.NA, 3) + ' /mol' + T('（與定義值相差 ', ' (') + pct(r.naErr) + T('）', ' from the defined value)'), 'em');
        if (st.rows.length > 1) {
          const m = st.rows.reduce(function (s, x) { return s + x.NA; }, 0) / st.rows.length;
          h += rowHtml(T('所有紀錄的 N<sub>A</sub> 平均', 'Mean N<sub>A</sub> of all rows'), sci(m, 3) + ' /mol');
        }
      }
      const o = st.obs;
      if (o && o.done) h += rowHtml(T('擬合範圍（時間間隔）', 'Fitted time lags'), '0.1–' + (o.fit.K * 0.1).toFixed(1) + ' s');
    }
    $('ana').innerHTML = h;
  }

  // ---------------- 分析圖 ----------------
  let GW = 0, GH = 0, gdpr = 1;
  function sizeGraph() {
    GW = gcv.clientWidth || 600; GH = gcv.clientHeight || 300;
    gdpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gcv.width = Math.round(GW * gdpr); gcv.height = Math.round(GH * gdpr);
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function axes(g, box, xMin, xMax, yMin, yMax, xLab, yLab) {
    const X = function (x) { return box.L + (x - xMin) / (xMax - xMin) * box.w; };
    const Y = function (y) { return box.T + box.h - (y - yMin) / (yMax - yMin) * box.h; };
    const xs = niceStep(xMax - xMin, GW < 420 ? 4 : 6), ys = niceStep(yMax - yMin, 5);
    g.strokeStyle = D.alpha(D.c.text, 0.1); g.lineWidth = 1;
    for (let x = Math.ceil(xMin / xs) * xs; x <= xMax + 1e-9; x += xs) {
      g.beginPath(); g.moveTo(Math.round(X(x)) + 0.5, box.T); g.lineTo(Math.round(X(x)) + 0.5, box.T + box.h); g.stroke();
      D.haloText(g, minus(String(+x.toPrecision(6))), X(x), box.T + box.h + 13, D.c.muted, 'center', 'middle', font(11, '600'));
    }
    for (let y = Math.ceil(yMin / ys) * ys; y <= yMax + 1e-9; y += ys) {
      g.beginPath(); g.moveTo(box.L, Math.round(Y(y)) + 0.5); g.lineTo(box.L + box.w, Math.round(Y(y)) + 0.5); g.stroke();
      D.haloText(g, minus(String(+y.toPrecision(6))), box.L - 6, Y(y), D.c.muted, 'right', 'middle', font(11, '600'));
    }
    g.strokeStyle = D.alpha(D.c.text, 0.55); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(box.L, box.T); g.lineTo(box.L, box.T + box.h); g.lineTo(box.L + box.w, box.T + box.h); g.stroke();
    D.haloText(g, xLab, box.L + box.w / 2, GH - 8, D.c.text, 'center', 'alphabetic', font(12, '700'));
    // 縱軸名稱：parts 陣列，[文字, true] 表示上標（畫布不用 Unicode 上標字元）
    g.save(); g.translate(13, box.T + box.h / 2); g.rotate(-Math.PI / 2);
    const fm = font(12, '700'), fs = font(9, '700');
    const ws = yLab.map(function (q) { g.font = q[1] ? fs : fm; return g.measureText(q[0]).width; });
    let x0 = -ws.reduce(function (s2, v) { return s2 + v; }, 0) / 2;
    yLab.forEach(function (q, i) { D.haloText(g, q[0], x0, q[1] ? -5 : 0, D.c.text, 'left', 'middle', q[1] ? fs : fm); x0 += ws[i]; });
    g.restore();
    return { X: X, Y: Y };
  }
  function drawGraph() {
    const g = gctx;
    g.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    g.clearRect(0, 0, GW, GH);
    D.backdrop(g, GW, GH);
    const box = { L: 56, T: 14, w: GW - 56 - 14, h: GH - 14 - 42 };
    let lg = '';
    if (st.mode === 'sed') {
      sedEnsure();
      const S = st.sedS, nl = S.view.layers, w = S.view.Hv / nl * 1e6, f = st.sedFit;
      const pts = [];
      st.counts.forEach(function (n, j) { if (n > 0) pts.push([(j + 0.5) * w, Math.log(n)]); });
      let yMax = 1, yMin = 0;
      pts.forEach(function (p) { yMax = Math.max(yMax, p[1]); });
      yMax = Math.ceil(yMax + 0.5);
      const xMax = S.view.Hv * 1e6;
      const A = axes(g, box, 0, xMax, yMin, yMax, T('高度 h（μm）', 'Height h (μm)'), [['ln n']]);
      g.save(); g.beginPath(); g.rect(box.L, box.T - 4, box.w + 4, box.h + 4); g.clip();
      if (pts.length) {
        // 理論斜率 −1/H，通過擬合的截距附近（以總數校準）
        const tot = st.counts.reduce(function (s, c) { return s + c; }, 0), Hu = S.sp.H * 1e6;
        const n0 = tot * (1 - Math.exp(-w / Hu)) / (1 - Math.exp(-xMax / Hu));
        g.strokeStyle = tok.theory; g.lineWidth = 2; g.setLineDash([6, 4]);
        g.beginPath(); g.moveTo(A.X(0.5 * w), A.Y(Math.log(n0))); g.lineTo(A.X(xMax), A.Y(Math.log(n0) - (xMax - 0.5 * w) / Hu)); g.stroke();
        g.setLineDash([]);
        if (f && isFinite(f.fit.slope)) {
          const sl = f.fit.slope * 1e-6, c0 = Math.log(f.fit.n0);
          g.strokeStyle = tok.fit; g.lineWidth = 2;
          g.beginPath(); g.moveTo(A.X(0), A.Y(c0)); g.lineTo(A.X(xMax), A.Y(c0 + sl * xMax)); g.stroke();
        }
        pts.forEach(function (p) { D.ball(g, A.X(p[0]), A.Y(p[1]), 4.5, tok.ens, { glow: 0 }); });
      }
      g.restore();
      if (!pts.length) D.haloText(g, T('拍照計數後，點會出現在這裡', 'Points appear here after you photograph and count'), box.L + box.w / 2, box.T + box.h / 2, D.c.muted, 'center', 'middle', font(12, '600'));
      lg = '<span style="color:var(--bm-ens)"><i style="background:var(--bm-ens);height:8px;width:8px;border-radius:50%"></i>' + T('各層累計數的 ln n', 'ln n of each layer') + '</span>' +
        '<span style="color:var(--bm-fit)"><i style="background:var(--bm-fit)"></i>' + T('加權直線擬合（斜率 −1/H）', 'Weighted straight-line fit (slope −1/H)') + '</span>' +
        '<span style="color:var(--bm-theory)"><i class="dash"></i>' + T('理論斜率 −1/H', 'Theoretical slope −1/H') + '</span>';
      gcv.setAttribute('aria-label', T('分析圖：各層顆粒數的 ln n 對高度 h，直線的斜率是 −1/H', 'Graph of ln n against height h; the slope of the line is −1/H'));
    } else if (st.mode === 'micro') {
      const o = st.obs;
      const tEnd = o ? o.run.F * o.run.dt : val(el.tObs), Dd = o ? o.run.D : C.D(el.liquid.value, val(el.T), val(el.a) * UM);
      const tNow = o ? (o.done ? tEnd : o.t) : 0;
      const ens = o ? o.ens : null;
      let yMax = 4 * Dd * tEnd * 1e12 * 1.25;
      if (ens) for (let f = 1; f <= o.run.F; f++) if (f * o.run.dt <= tNow + 1e-9) yMax = Math.max(yMax, ens[f] * 1e12 * 1.05);
      const A = axes(g, box, 0, tEnd, 0, yMax, T('時間 t（s）', 'Time t (s)'), [['⟨r'], ['2', true], ['⟩ (μm'], ['2', true], [')']]);
      g.save(); g.beginPath(); g.rect(box.L, box.T - 4, box.w + 4, box.h + 4); g.clip();
      // 理論 4Dt
      g.strokeStyle = tok.theory; g.lineWidth = 2; g.setLineDash([6, 4]);
      g.beginPath(); g.moveTo(A.X(0), A.Y(0)); g.lineTo(A.X(tEnd), A.Y(4 * Dd * tEnd * 1e12)); g.stroke(); g.setLineDash([]);
      if (o) {
        // 多顆粒平均（從起點量）：實線＋點
        const F = o.run.F, step = Math.max(1, Math.round(F / 40));
        g.strokeStyle = D.alpha(tok.ens, 0.55); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(A.X(0), A.Y(0));
        for (let f = 1; f <= F && f * o.run.dt <= tNow + 1e-9; f++) g.lineTo(A.X(f * o.run.dt), A.Y(ens[f] * 1e12));
        g.stroke();
        for (let f = step; f <= F && f * o.run.dt <= tNow + 1e-9; f += step) D.ball(g, A.X(f * o.run.dt), A.Y(ens[f] * 1e12), 3.4, tok.ens, { glow: 0, shadow: false });
        if (o.done && o.ta) {
          // 時間平均（空心圓）
          const ML = o.ta.length - 1, st2 = Math.max(1, Math.round(ML / 20));
          for (let k = st2; k <= ML; k += st2) {
            g.beginPath(); g.arc(A.X(k * o.run.dt), A.Y(o.ta[k] * 1e12), 4, 0, Math.PI * 2);
            g.fillStyle = D.alpha(D.c['canvas-bg'], 0.9); g.fill(); g.strokeStyle = tok.trail; g.lineWidth = 1.8; g.stroke();
          }
          // 擬合直線與擬合範圍
          const K = o.fit.K;
          g.fillStyle = D.alpha(tok.fit, 0.12); g.fillRect(A.X(0), box.T, A.X(K * o.run.dt) - A.X(0), box.h);
          g.strokeStyle = tok.fit; g.lineWidth = 2;
          g.beginPath(); g.moveTo(A.X(0), A.Y(0)); g.lineTo(A.X(tEnd), A.Y(4 * o.fit.D * tEnd * 1e12)); g.stroke();
        }
      }
      g.restore();
      lg = '<span style="color:var(--bm-ens)"><i style="background:var(--bm-ens)"></i>' + T('多顆粒平均（從起點量）', 'Particle average (from the start)') + '</span>' +
        '<span style="color:var(--bm-trail)"><i style="background:none;border:2px solid var(--bm-trail);width:8px;height:8px;border-radius:50%"></i>' + T('時間平均（所有起點）', 'Time average (all starting frames)') + '</span>' +
        '<span style="color:var(--bm-fit)"><i style="background:var(--bm-fit)"></i>' + T('過原點擬合（色帶＝擬合範圍），斜率 = 4D', 'Fit through the origin (band = fitted lags), slope = 4D') + '</span>' +
        '<span style="color:var(--bm-theory)"><i class="dash"></i>' + T('理論 4Dt', 'Theory 4Dt') + '</span>';
      gcv.setAttribute('aria-label', T('分析圖：均方位移對時間，理論是通過原點、斜率 4D 的直線', 'Graph of the mean square displacement against time; the theory is a straight line through the origin with slope 4D'));
    }
    $('glegend').innerHTML = lg;
  }

  // =====================================================================
  // 介面
  // =====================================================================
  const statusEl = $('status');
  function say(t) { statusEl.textContent = t; }
  function outs() {
    $('To').textContent = minus(val(el.T).toFixed(1)) + ' °C';
    $('ao').textContent = sig(val(el.a), 3) + ' μm';
    $('No').textContent = String(Math.round(val(el.N)));
    $('tObso').textContent = (Math.round(val(el.tObs) * 10) / 10).toFixed(1) + ' s';
    $('ratioo').textContent = String(Math.round(val(el.ratio)));
    const lq = st.mode === 'sed' ? 'water' : el.liquid.value, e = C.eta(lq, val(el.T));
    $('etaHint').textContent = st.mode === 'md' ? T('溫度改變分子的平均動能：kT 與絕對溫度成正比。', 'Temperature sets the mean kinetic energy of the molecules: kT is proportional to the absolute temperature.')
      : T('這個溫度下' + (lq === 'water' ? '水' : LIQ_NAME(lq)) + '的黏滯係數 η = ', 'At this temperature the viscosity of ' + LIQ_NAME(lq) + ' is η = ') + sig(e * 1e3, 3) + ' mPa·s' + T('（溫度一變，η 也跟著變）', ' (η changes with temperature)');
  }
  function updateButtons() {
    const m = st.mode, o = st.obs;
    $('start').hidden = m !== 'micro'; $('record').hidden = m !== 'micro';
    $('photo').hidden = m !== 'sed';
    $('pause').hidden = m === 'micro' || (m === 'sed' && reduced);
    $('slow').hidden = m !== 'md';
    $('record').disabled = !(o && o.done && !o.recorded && !o.stale);
    $('start').textContent = o && !o.done && !o.stale ? T('重新觀察', 'Restart') : T('開始觀察', 'Start observing');
    $('pause').textContent = st.paused ? T('繼續', 'Resume') : T('暫停', 'Pause');
    $('pause').setAttribute('aria-pressed', String(st.paused));
    $('slow').setAttribute('aria-pressed', String(st.slow));
    ['sp1', 'sp5', 'sp20'].forEach(function (id) { $(id).setAttribute('aria-pressed', String(+id.slice(2) === st.speed)); });
  }
  function showCards() {
    const m = st.mode;
    $('liqBox').hidden = m !== 'micro';
    $('sedLiquid').hidden = m !== 'sed';
    $('matBox').hidden = m !== 'sed';
    $('aBox').hidden = m === 'md';
    $('microBox').hidden = m !== 'micro';
    $('mdBox').hidden = m !== 'md';
    $('dataCard').hidden = m === 'md';
    $('dataTitle').textContent = m === 'sed' ? T('拍照計數與分析', 'Counts and analysis') : T('紀錄與分析', 'Records and analysis');
    const hint = m === 'micro'
      ? T('顯微鏡的明視野。顆粒照真實大小繪製（太小時畫成光點），虛線方框是起點範圍；軌跡是每 0.1 s 一張照片連成的折線。紅色是第 1 顆，虛線圓是觀察結束時的方均根距離 √(4Dt)。',
        'The bright field of a microscope. Particles are drawn to scale (as dots when too small); the dashed square is where they start; the trails join frames taken every 0.1 s. Particle 1 is red; the dashed circle is the rms distance √(4Dt) at the end.')
      : m === 'sed'
        ? T('懸浮液的側視圖，依比例繪製（半透明的顆粒在後面）。右邊是各層累計的顆粒數，綠色虛線是平衡分布 n ∝ e^(−h/H) 的預期。',
          'A side view of the suspension, to scale (the fainter particles are further back). On the right: the total count per layer; the dashed green curve is the expected equilibrium n ∝ e^(−h/H).')
        : T('二維硬圓盤：藍色小圓盤是液體分子，黃色大圓盤是顆粒。大小與質量比都誇大了，只用來看撞擊怎麼讓顆粒亂跳。',
          'Hard discs in 2D: the small blue discs are liquid molecules and the big yellow one is the particle. Sizes and the mass ratio are exaggerated; this is only to see how the kicks make the particle jiggle.');
    $('hint2').textContent = hint;
    $('hint3').textContent = m === 'micro'
      ? T('3D：同一組亂數步（包括顯微鏡看不到的深度方向），所有顆粒移到同一個起點，顆粒畫成小球（大小不照比例）；半透明球的半徑是每個方向的分散 σ = √(2Dt)。可拖曳旋轉、縮放。',
        '3D: the same random steps (including the depth a microscope cannot see), with every particle moved to one starting point and drawn as a small ball (not to scale); the translucent sphere has radius σ = √(2Dt), the spread along each axis. Drag to rotate, pinch or scroll to zoom.')
      : T('3D：這一刻的顆粒放在方形玻璃管裡，旁邊是平衡分布的指數曲線。可拖曳旋轉、縮放。', '3D: the particles at this moment in a square glass tube, with the exponential equilibrium profile beside it. Drag to rotate, pinch or scroll to zoom.');
    cv.setAttribute('aria-label', m === 'micro'
      ? T('顯微鏡畫面：懸浮顆粒的布朗運動與軌跡、比例尺、時間。', 'Microscope view: the Brownian motion of suspended particles with their trails, a scale bar and the time.')
      : m === 'sed' ? T('沉降平衡：玻璃槽中的顆粒，下密上疏，右邊是各層的顆粒數。', 'Sedimentation equilibrium: particles in a glass cell, dense at the bottom and sparse at the top, with the count per layer on the right.')
        : T('分子視角示意：許多小分子撞擊一顆大顆粒。', 'Molecular view (schematic): many small molecules hitting one big particle.'));
  }
  function setMode(m, quiet) {
    if (st.mode === m) return;
    interruptObs();
    st.mode = m;
    document.querySelectorAll('.modes [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    if (m === 'md') { if (view3) setView('2d'); if (reduced) st.paused = true; }
    else if (/分子視角|molecular view/i.test(viewMsg.textContent)) viewMsg.textContent = '';
    if (m === 'sed') st.paused = false;
    showCards(); outs(); updateButtons(); updateReadouts(); renderTable(); renderAna();
    layerKey = '';
    resize(); sizeGraph(); drawGraph();
    if (view3 && view3.active) view3.rebuild();
    if (!quiet) {
      const t = m === 'micro' ? T('顯微鏡與均方位移：按「開始觀察」。', 'Microscope & MSD: press “Start observing”.')
        : m === 'sed' ? T('沉降平衡：按「拍照計數」數各層的顆粒。', 'Sedimentation: press “Photograph & count” to count the particles in each layer.')
          : T('分子視角：打開「只看大顆粒」，看看布朗看到的樣子。', 'Molecular view: switch on “Particle only” to see what Brown saw.');
      say(t); $('srState').textContent = t;
    }
    requestDraw();
  }
  document.querySelectorAll('.modes [data-mode]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });

  function onParam(kind) {
    outs();
    if (kind !== 'ratio' && st.mode === 'micro') interruptObs();
    if (st.mode === 'sed') { sedEnsure(); renderTable(); renderAna(); drawGraph(); }
    if (kind === 'T' && st.md) mdRetemp();
    if (kind === 'ratio' && st.mode === 'md') mdEnsure();
    if (st.mode === 'micro' && (!st.obs || st.obs.stale)) drawGraph();
    layerKey = '';
    updateReadouts(); requestDraw();
    if (view3 && view3.active) view3.update();
  }
  [['T', 'T'], ['a', 'a'], ['N', 'N'], ['tObs', 'tObs'], ['ratio', 'ratio']].forEach(function (p) {
    el[p[0]].addEventListener('input', function () { onParam(p[1]); });
  });
  el.liquid.addEventListener('change', function () { onParam('liquid'); });
  el.material.addEventListener('change', function () { onParam('material'); });
  el.trails.addEventListener('change', function () { requestDraw(); if (view3 && view3.active) view3.update(); });
  el.onlyBig.addEventListener('change', function () {
    st.hits = 0; st.mdT = 0; st.emitT = 0;
    const t = el.onlyBig.checked ? T('只看大顆粒：分子看不見了，大顆粒卻還在亂跳，就像布朗在顯微鏡下看到的。', 'Particle only: the molecules are hidden, yet the big particle keeps jiggling, just as Brown saw it.')
      : T('分子重新顯示。', 'The molecules are shown again.');
    say(t);
    updateReadouts(); requestDraw();
  });
  $('start').addEventListener('click', function () { startObs(); });
  $('record').addEventListener('click', record);
  $('photo').addEventListener('click', photo);
  $('pause').addEventListener('click', function () { st.paused = !st.paused; updateButtons(); lastT = 0; requestDraw(); });
  $('slow').addEventListener('click', function () { st.slow = !st.slow; updateButtons(); requestDraw(); });
  ['sp1', 'sp5', 'sp20'].forEach(function (id) {
    $(id).addEventListener('click', function () { st.speed = +id.slice(2); updateButtons(); requestDraw(); });
  });
  $('clearAll').addEventListener('click', function () {
    st.rows = []; st.nextId = 1;
    if (st.obs) { st.obs.recorded = true; }
    st.obs = null;
    st.sed = null; st.sedKey = ''; st.sedS = null;
    st.trail = []; st.hits = 0; st.mdT = 0; st.emitT = 0;
    layerKey = '';
    say(T('已清除紀錄、照片計數與軌跡（設定不變）。', 'Records, photo counts and trails cleared (settings kept).'));
    updateButtons(); updateReadouts(); renderTable(); renderAna(); drawGraph();
    if (view3 && view3.active) view3.rebuild();
    requestDraw();
  });

  // ---------------- 音效 ----------------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function clickSound() { const S = sound(); if (!S) return; S.noise({ dur: 0.03, gain: 0.45, filter: 2600, q: 1 }); S.tone({ freq: 1250, dur: 0.05, type: 'triangle', gain: 0.2 }); }
  function shutter() {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.025, gain: 0.5, filter: 3200, q: 1.2 });
    setTimeout(function () { const S2 = sound(); if (S2) { S2.noise({ dur: 0.04, gain: 0.4, filter: 1800, q: 1 }); S2.tone({ freq: 880, dur: 0.06, type: 'sine', gain: 0.12 }); } }, 70);
  }
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
    if (ev.detail && ev.detail.name === 'lang') { showCards(); outs(); updateButtons(); updateReadouts(); renderTable(); renderAna(); drawGraph(); updateSoundButton(); requestDraw(); }
  });

  // =====================================================================
  // 3D 檢視（three.js 以 import() 延遲載入；場景在 brownian-motion-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const viewMsg = $('viewMsg');
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
  function state3() {
    const s = { mode: st.mode };
    if (st.mode === 'micro') {
      const o = st.obs;
      s.micro = o ? { run: o.run, t: o.t, done: o.done, a: o.p.a * UM, key: o.seed + '|' + o.run.N + '|' + o.run.F + '|' + o.run.D, trails: el.trails.checked } : null;
    } else if (st.mode === 'sed') {
      sedEnsure();
      const S = st.sedS;
      s.sed = { pos: st.sedPos, Lx: S.Lx, Ly: S.Ly, Hv: S.view.Hv, H: S.sp.H, a: S.a * UM, layers: S.view.layers, key: st.sedKey };
    }
    return s;
  }
  function setPressed3(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (st.mode === 'md') {
        setPressed3('2d');
        viewMsg.textContent = T('分子視角是二維的示意圖，沒有 3D；3D 請切到「顯微鏡與均方位移」或「沉降平衡」。', 'The molecular view is a 2D schematic with no 3D version; for 3D switch to “Microscope & MSD” or “Sedimentation”.');
        return;
      }
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed3('3d');
      if (!webglAvailable() || !window.BrownianMotion3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.BrownianMotion3D.create(lib, {
          host: $('view3'), core: C, T: T, state: state3,
          tokens: function () { readTokens(); return Object.assign({}, tok, D.c, { dark: D.dark }); },
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
      setPressed3('2d');
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
    setPressed3('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 分享連結：播放速度與這次觀察的亂數種子（同一個連結看到同一組軌跡）
  // =====================================================================
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { sp: st.speed, seed: st.obs && st.mode === 'micro' && !st.obs.stale ? st.obs.seed : 0 }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if ([1, 5, 20].indexOf(+o.sp) >= 0) st.speed = +o.sp;
      if (st.mode === 'micro' && +o.seed > 0 && +o.seed < 2147483647) startObs(Math.floor(+o.seed));
      updateButtons();
    }
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  function onTheme() {
    D.refresh && D.refresh();
    readTokens(); layerKey = '';
    if (view3 && view3.active) view3.onTheme();
    requestDraw(); drawGraph();
  }
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastT = 0; requestDraw(); } });
  showCards(); outs(); updateButtons(); updateSoundButton(); renderTable(); renderAna(); updateReadouts();
  if (window.ResizeObserver) {
    let lastW = 0, lastG = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lastG) { lastG = gcv.clientWidth; sizeGraph(); drawGraph(); } }).observe(gcv);
  }
  window.addEventListener('resize', function () { resize(); sizeGraph(); drawGraph(); });
  resize(); sizeGraph();
  // 載入時自動播放一次觀察（不送任務事件）
  startObs();
  say(T('顯微鏡下的懸浮顆粒正在亂跳。看完後按「記錄」，或改設定再「開始觀察」。', 'Suspended particles are jiggling under the microscope. Press “Record” when the run ends, or change the settings and “Start observing”.'));
  // 測試介面（Playwright、縮圖用）
  window.__bm = {
    st: st, P: P, setMode: setMode, startObs: startObs, finishObs: finishObs, record: record, photo: photo,
    skip: function () { if (st.obs && !st.obs.done) finishObs(false); }
  };
})();
