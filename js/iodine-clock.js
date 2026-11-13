/*
 * iodine-clock.js — 「碘鐘反應與速率定律」的頁面程式（實驗桌畫面、碼錶、圖表、數據表、速率定律核對、任務事件）
 * 化學核心在 js/iodine-clock-core.js（IodineCore）；3D 速率曲面在 js/iodine-clock-3d.js（Clock3D）。
 * 畫面只「讀」核心算出的濃度：燒杯顏色依比爾定律、碼錶讀數就是核心算出的變藍時間（讀到 0.01 s）。
 *
 * 任務事件（只在使用者按「混合並計時」之後才可能送出）：
 *   'run'：變藍並記入數據表 { …數據表的這一列, prev, fitI, fitP, arr（核心 runSummary 產生）, sinceOk }
 *   'never'：硫代硫酸根過量，氧化劑用掉 99% 仍沒變藍 { rx, unk, T, salt, I0, P0, S0, ratio }
 *   'answer'：「核對」{ rx, unk, m, n, k, mOk, nOk, kErr, tries, revealed, runs, nI, nP, at25, temps }
 */
(function () {
  'use strict';
  const C = window.IodineCore, LD = window.LabDraw;
  if (!C || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const FONT = LD.FONT;

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 4) return { m: num(x, Math.max(0, (sig || 3) - 1 - e)), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) {
    const p = sciParts(x, sig);
    return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>';
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  /** 碼錶格式：分:秒.百分秒（超過一小時加上時） */
  function clockText(t) {
    if (t == null || !isFinite(t)) return '—';
    const cs = Math.round(t * 100), h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, s = (cs % 6000) / 100;
    const ss = (s < 10 ? '0' : '') + s.toFixed(2);
    return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
  }
  function secText(t) { return t == null || !isFinite(t) ? '—' : (t >= 1000 ? num(t, 1) : num(t, 2)) + ' s'; }

  // ======================= 化學式（畫布用）：數字下標、^ 之後上標 =======================
  function parseChem(str) {
    const out = [];
    let sup = false, prev = '';
    for (const ch of String(str)) {
      if (ch === '^') { sup = true; continue; }
      if (sup && !/[0-9−+]/.test(ch)) sup = false;
      let k = 'n';
      if (sup) k = 'p';
      else if (/\d/.test(ch) && /[A-Za-z)\]]/.test(prev)) k = 'b';
      else if (/\d/.test(ch) && out.length && out[out.length - 1].k === 'b') k = 'b';
      if (out.length && out[out.length - 1].k === k) out[out.length - 1].t += ch; else out.push({ t: ch, k: k });
      prev = ch;
    }
    return out;
  }
  function chemWidth(ctx, str, size, weight) {
    let w = 0;
    parseChem(str).forEach(function (s) { ctx.font = (weight || 500) + ' ' + (s.k === 'n' ? size : size * 0.7) + 'px ' + FONT; w += ctx.measureText(s.t).width; });
    return w;
  }
  /** 化學式文字；halo 為描邊顏色（可省略） */
  function chemText(ctx, str, x, y, size, color, align, weight, halo) {
    const w = chemWidth(ctx, str, size, weight);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    parseChem(str).forEach(function (s) {
      const fs = s.k === 'n' ? size : size * 0.7, dy = s.k === 'b' ? size * 0.28 : s.k === 'p' ? -size * 0.42 : 0;
      ctx.font = (weight || 500) + ' ' + fs + 'px ' + FONT;
      if (halo) { ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = halo; ctx.strokeText(s.t, cx, y + dy); }
      ctx.fillStyle = color;
      ctx.fillText(s.t, cx, y + dy);
      cx += ctx.measureText(s.t).width;
    });
    return w;
  }
  /** 帶底框的化學式標籤 */
  function chemPill(ctx, str, x, y, size, color, align) {
    const w = chemWidth(ctx, str, size, 600), padX = 7, h = size + 10;
    const x0 = align === 'center' ? x - w / 2 - padX : align === 'right' ? x - w - 2 * padX : x;
    ctx.save();
    ctx.shadowColor = LD.shadowInk(0.18); ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
    LD.roundRect(ctx, x0, y - h / 2, w + 2 * padX, h, h / 2);
    ctx.fillStyle = LD.alpha(col.surface, 0.92); ctx.fill();
    ctx.restore();
    LD.roundRect(ctx, x0, y - h / 2, w + 2 * padX, h, h / 2);
    ctx.strokeStyle = LD.alpha(color, 0.55); ctx.lineWidth = 1; ctx.stroke();
    chemText(ctx, str, x0 + padX, y + size * 0.36, size, color, 'left', 600);
    return w + 2 * padX;
  }

  // ======================= 顏色 =======================
  let col = {};
  const BLUE = '#1b2a8c';          // 澱粉－碘錯合物的深藍（語意色）
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, grid: c.grid, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk,
      thio: dk ? '#f0a33a' : '#c9780c',       // 硫代硫酸根（時鐘）
      ox: c.pos || '#d1453b',                 // 氧化劑
      iod: dk ? '#8fa2ff' : '#2b3fb8',        // 碘（藍色深淺）
      glass: dk ? 'rgba(200,220,240,0.10)' : 'rgba(150,180,210,0.12)',
      glassEdge: dk ? 'rgba(210,225,240,0.55)' : 'rgba(90,110,135,0.55)'
    };
  }
  /** 水浴的顏色：5 °C 偏冰藍、25 °C 中性、45 °C 偏暖 */
  function bathColor(Tc) {
    const cold = '#5aa7e0', mid = col.dark ? '#7f9ab3' : '#9ec3dc', warm = '#e3925a';
    return Tc <= 25 ? LD.mix(cold, mid, Math.max(0, (Tc - 5) / 20)) : LD.mix(mid, warm, Math.min(1, (Tc - 25) / 20));
  }

  // ======================= 狀態 =======================
  const SPEEDS = [1, 10, 100, 1000];
  const state = { rx: 'ps', speed: 0, tab: 'time', ax: 'I', view: '2d', scale: 'lin' };
  let runs = [], seq = 0;
  let unk = null, unkSeq = 0;
  let saltPS = true;
  let beaker = null;          // { phase, o, p, pl, live, samples, simT, rec, pour0, flash0 }
  let lastRec = null;
  let view3 = null;
  const elKI = $('vKI'), elP = $('vP'), elS = $('vS'), elT = $('temp'), elSalt = $('salt');
  const cv = $('cv'), ctx = cv.getContext('2d'), gcv = $('gcv'), gctx = gcv.getContext('2d');
  let cw = 0, ch = 0, dpr = 1, gw = 0, gh = 0;

  function val(el) { return window.LabNum ? window.LabNum.value(el) : +el.value; }
  function recipe() {
    const o = { VKI: val(elKI), VP: val(elP), VS: val(elS), T: val(elT), salt: state.rx === 'ps' ? saltPS : true };
    if (state.rx === 'x' && unk) o.unk = unk.u;
    return o;
  }
  function oxName() { return state.rx === 'x' ? 'X' : 'S2O8^2−'; }

  // ======================= 一杯實驗 =======================
  function prepare() {
    const o = recipe();
    const p = C.params(o);
    beaker = { phase: 'ready', o: o, p: p, pl: null, live: null, samples: null, simT: 0, rec: null, pour0: 0, flash0: 0, tEnd: 0 };
  }
  function sampleRun(p, pl) {
    const tEnd = pl.never ? pl.tDone * 1.05 : Math.max(pl.tVis * 1.5, pl.tVis + 8);
    const r = C.createRun(p), N = 240, out = [];
    for (let i = 0; i <= N; i++) {
      const t = tEnd * i / N, s = r.at(t);
      out.push({ t: t, S: p.S0 > 0 ? s.S / p.S0 : 0, A: s.A / p.A0, B: C.blueness(s.C) });
    }
    return { tEnd: tEnd, pts: out };
  }
  function startMix() {
    acted();
    if (!beaker || beaker.phase !== 'ready') prepare();
    const b = beaker;
    if (!C.mix(b.o).ok) { setStatus(T('體積加起來超過 50.0 mL，請減少用量。', 'The volumes add up to more than 50.0 mL; use less.')); return; }
    b.pl = C.plan(b.p);
    b.live = C.createRun(b.p);
    b.samples = sampleRun(b.p, b.pl);
    b.tEnd = b.samples.tEnd;
    b.simT = 0;
    b.phase = 'run';
    b.pour0 = performance.now();
    if (window.LabSound && window.LabSound.enabled()) window.LabSound.noise({ dur: 0.35, gain: 0.18, filter: 1400, q: 0.8 });
    setStatus(b.p.S0 > 0 ? T('已混合，碼錶開始計時。', 'Mixed — the stopwatch is running.') : T('已混合（沒有加硫代硫酸鈉）。', 'Mixed (no sodium thiosulfate added).'));
    $('mix').textContent = T('重新混合並計時', 'Mix and time again');
    kick();
    refreshAll();
  }
  function cancelRun(msg) {
    if (beaker && beaker.phase === 'run') setStatus(msg || T('配方改變了，這一杯作廢；按「混合並計時」用新配方重做。', 'The recipe changed, so this beaker is discarded. Press “Mix and time” to start again.'));
    prepare();
  }
  function recordBlue() {
    const b = beaker;
    b.phase = 'blue';
    b.flash0 = performance.now();
    const rec = C.record(++seq, b.o, b.p, b.pl, unk && state.rx === 'x' ? unk.id : 0);
    runs.push(rec); b.rec = rec; lastRec = rec;
    if (rec.rx === 'x' && unk) unk.total++;
    let sinceOk = null;
    if (rec.rx === 'x' && unk && unk.okAfter != null) sinceOk = runs.filter(function (r) { return r.rx === 'x' && r.unk === rec.unk && r.id > unk.okAfter && r.id < rec.id; }).length;
    if (window.LabSound && window.LabSound.enabled()) {
      window.LabSound.tone({ freq: 1046, dur: 0.5, gain: 0.22 });
      window.LabSound.tone({ freq: 1568, dur: 0.6, gain: 0.12, delay: 0.02 });
    }
    if (rec.rate) statusHTML(rec);
    else setStatus(T('變藍了！碼錶停在 ' + secText(rec.t) + '。沒有硫代硫酸根，所以一混合就變藍，無法算速率。', 'Blue! The stopwatch stopped at ' + secText(rec.t) + '. Without thiosulfate it turns blue at once, so no rate can be worked out.'));
    if (window.LabMission) window.LabMission.emit('run', Object.assign({}, rec, C.runSummary(runs, rec), { sinceOk: sinceOk }));
    refreshAll();
  }
  function finishNever() {
    const b = beaker;
    b.phase = 'never';
    const rec = C.record(++seq, b.o, b.p, b.pl, unk && state.rx === 'x' ? unk.id : 0);
    runs.push(rec); b.rec = rec; lastRec = rec;
    if (rec.rx === 'x' && unk) unk.total++;
    if (window.LabSound && window.LabSound.enabled()) window.LabSound.tone({ freq: 330, dur: 0.3, type: 'triangle', gain: 0.14 });
    setStatus(T('氧化劑已經用掉 99%，硫代硫酸根還有剩：這一杯永遠不會變藍。', '99% of the oxidant is used up and thiosulfate is still left: this beaker will never turn blue.'));
    if (window.LabMission) window.LabMission.emit('never', { rx: rec.rx, unk: rec.unk, T: rec.T, salt: rec.salt, I0: rec.I0, P0: rec.P0, S0: rec.S0, ratio: rec.S0 / (2 * rec.P0) });
    refreshAll();
  }
  /** 狀態列：用 HTML 寫速率（上標） */
  function statusHTML(rec) {
    if (!rec || !rec.rate) return;
    $('status').innerHTML = T('變藍了！碼錶停在 ', 'Blue! The stopwatch stopped at ') + secText(rec.t) + T('。初速率 ≈ ', '. Initial rate ≈ ') +
      '[S<sub>2</sub>O<sub>3</sub><sup>2−</sup>]<sub>0</sub> ÷ 2t = ' + sciHTML(rec.rate, 3) + ' M/s';
  }

  // ======================= 動畫迴圈（同一時間只有一條） =======================
  let raf = 0, lastTs = 0;
  function needsAnim() {
    const b = beaker;
    if (!b) return false;
    if (b.phase === 'run') return true;
    const now = performance.now();
    if (b.phase === 'blue' && b.simT < b.tEnd) return true;
    if (!reducedMotion && now - b.pour0 < 900) return true;
    if (!reducedMotion && b.flash0 && now - b.flash0 < 700) return true;
    return false;
  }
  function kick() { if (!raf) { lastTs = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(ts) {
    raf = 0;
    const dt = Math.min(1 / 30, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;
    const b = beaker;
    if (b && (b.phase === 'run' || b.phase === 'blue')) {
      const before = b.simT;
      b.simT = Math.min(b.tEnd, b.simT + dt * SPEEDS[state.speed]);
      // 一倍速時碼錶每秒滴答一聲（只在計時中）
      if (b.phase === 'run' && state.speed === 0 && Math.floor(b.simT) > Math.floor(before) && window.LabSound && window.LabSound.enabled())
        window.LabSound.tone({ freq: 2200, dur: 0.012, gain: 0.05, type: 'square' });
      if (b.phase === 'run' && !b.pl.never && b.simT >= b.pl.tVis) recordBlue();
      else if (b.phase === 'run' && b.pl.never && b.simT >= b.pl.tDone) finishNever();
    }
    drawStage();
    if (state.tab === 'time') drawGraph();
    if (needsAnim()) raf = requestAnimationFrame(frame);
    else { drawStage(); drawGraph(); }
  }

  // ======================= 主畫面 =======================
  let G = null;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 560 ? Math.round(Math.max(440, w * 1.28)) : 400;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout();
    drawStage();
  }
  function layout() {
    const narrow = cw < 560;
    const sc = narrow ? { x: 0, y: 0, w: cw, h: ch * 0.6 } : { x: 0, y: 0, w: cw * 0.6, h: ch };
    const rc = narrow ? { x: 0, y: ch * 0.6, w: cw, h: ch * 0.4 } : { x: cw * 0.6, y: 0, w: cw * 0.4, h: ch };
    const benchY = sc.y + sc.h * (narrow ? 0.93 : 0.9);
    const cx = sc.x + sc.w * 0.58;
    const stW = Math.min(sc.w * 0.5, 230), stH = Math.max(22, sc.h * 0.085);
    const dishW = Math.min(sc.w * 0.54, 250), dishH = sc.h * 0.27;
    const bW = Math.min(sc.w * 0.25, 116), bH = Math.min(sc.h * 0.44, bW * 1.45);
    const stTop = benchY - stH;
    G = {
      narrow: narrow, sc: sc, rc: rc, benchY: benchY, cx: cx, stW: stW, stH: stH, stTop: stTop,
      dishW: dishW, dishH: dishH, dishBot: stTop - 2,
      bW: bW, bH: bH, bBot: stTop - 8,
      Bx: sc.x + sc.w * (narrow ? 0.14 : 0.15), BW: bW * 0.62, BH: bH * 0.55,
      fs: Math.max(11, Math.min(13, cw / 48))
    };
    if (narrow) {
      const R = Math.min(rc.w * 0.2, (rc.h - 40) / 2.5);
      G.sw = { x: rc.x + rc.w * 0.25, y: rc.y + R * 1.42 + 6, R: R };
      G.bars = { x: rc.x + rc.w * 0.5 + 6, y: rc.y + 16, w: rc.w * 0.5 - 18 };
    } else {
      const R = Math.min(rc.w * 0.3, (rc.h - 212) / 2.55);
      G.sw = { x: rc.x + rc.w / 2, y: rc.y + R * 1.45 + 8, R: R };
      G.bars = { x: rc.x + 14, y: G.sw.y + R * 1.08 + 64, w: rc.w - 28 };
    }
  }
  /** 目前畫面上的濃度（相對值） */
  function current() {
    const b = beaker;
    if (!b || b.phase === 'ready') return { S: 1, A: 1, B: 0, t: 0, mixed: false };
    const s = b.live.at(b.simT);
    return { S: b.p.S0 > 0 ? s.S / b.p.S0 : 0, A: s.A / b.p.A0, B: C.blueness(s.C), t: b.simT, mixed: true };
  }
  function drawStage() {
    if (!G || !cw) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    LD.backdrop(ctx, cw, ch);
    const cur = current();
    drawBench();
    drawStirrer(cur);
    drawBath(true);
    drawBeakerA(cur);
    drawBath(false);
    drawThermometer();
    drawBeakerB();
    drawStopwatch(cur);
    drawBars(cur);
    if (G.narrow) {
      ctx.strokeStyle = LD.alpha(col.border, 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(10, G.rc.y + 0.5); ctx.lineTo(cw - 10, G.rc.y + 0.5); ctx.stroke();
    }
    cv.setAttribute('aria-label', T('實驗桌：水浴 ' + num(beaker ? beaker.o.T : 25, 1) + ' °C 中的燒杯', 'Bench: a beaker in a ' + num(beaker ? beaker.o.T : 25, 1) + ' °C water bath') +
      (cur.mixed ? T('，碼錶 ' + secText(dispTime()) + (cur.B > 0.15 ? '，溶液已變藍' : '，溶液無色'), ', stopwatch ' + secText(dispTime()) + (cur.B > 0.15 ? ', the solution is blue' : ', the solution is colourless')) : T('，尚未混合', ', not mixed yet')));
  }
  function drawBench() {
    const y = G.benchY, x0 = G.sc.x, x1 = G.sc.x + G.sc.w;
    const g = ctx.createLinearGradient(0, y, 0, y + 30);
    g.addColorStop(0, col.dark ? '#3a3d44' : '#d9dde2'); g.addColorStop(1, col.dark ? '#24262b' : '#bfc5cc');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y, x1 - x0, Math.max(8, (G.narrow ? G.sc.y + G.sc.h : ch) - y));
    ctx.fillStyle = LD.alpha('#ffffff', col.dark ? 0.08 : 0.5);
    ctx.fillRect(x0, y, x1 - x0, 1);
  }
  function drawStirrer(cur) {
    const x = G.cx - G.stW / 2, y = G.stTop;
    LD.contactShadow(ctx, G.cx, G.benchY, G.stW * 0.55, 0);
    LD.block(ctx, x, y, G.stW, G.stH, col.dark ? '#5b6270' : '#e8ebef', { r: 6 });
    // 旋鈕與指示燈
    const ky = y + G.stH * 0.55;
    LD.ball(ctx, x + G.stW * 0.14, ky, Math.max(5, G.stH * 0.26), col.dark ? '#9aa3b0' : '#7d8794');
    const on = beaker && (beaker.phase === 'run' || beaker.phase === 'blue');
    ctx.beginPath(); ctx.arc(x + G.stW * 0.86, ky, 3.2, 0, 2 * Math.PI);
    ctx.fillStyle = on ? '#3cc46a' : LD.alpha(col.muted, 0.5); ctx.fill();
    if (on && !reducedMotion) { ctx.beginPath(); ctx.arc(x + G.stW * 0.86, ky, 7, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(60,196,106,0.18)'; ctx.fill(); }
  }
  function dishPath(back) {
    const w = G.dishW, h = G.dishH, x0 = G.cx - w / 2, yb = G.dishBot, yt = yb - h, ry = Math.max(5, w * 0.05);
    ctx.beginPath();
    if (back) { ctx.ellipse(G.cx, yt, w / 2, ry, 0, Math.PI, 2 * Math.PI); return { x0: x0, yt: yt, ry: ry }; }
    ctx.moveTo(x0, yt); ctx.lineTo(x0, yb - ry); ctx.ellipse(G.cx, yb - ry, w / 2, ry, 0, Math.PI, 0, true); ctx.lineTo(x0 + w, yt);
    return { x0: x0, yt: yt, ry: ry };
  }
  /** 水浴：back = true 畫後半部與水，false 畫前面的玻璃 */
  function drawBath(back) {
    const w = G.dishW, h = G.dishH, x0 = G.cx - w / 2, yb = G.dishBot, yt = yb - h, ry = Math.max(5, w * 0.05);
    const Tc = beaker ? beaker.o.T : val(elT), bc = bathColor(Tc);
    const wl = yt + h * 0.28;    // 水面
    if (back) {
      // 水
      ctx.save();
      ctx.beginPath(); ctx.moveTo(x0 + 2, wl); ctx.lineTo(x0 + 2, yb - ry); ctx.ellipse(G.cx, yb - ry, w / 2 - 2, ry - 1, 0, Math.PI, 0, true); ctx.lineTo(x0 + w - 2, wl); ctx.closePath();
      const g = ctx.createLinearGradient(0, wl, 0, yb);
      g.addColorStop(0, LD.alpha(bc, col.dark ? 0.32 : 0.28)); g.addColorStop(1, LD.alpha(bc, col.dark ? 0.5 : 0.42));
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(G.cx, wl, w / 2 - 2, ry - 1, 0, 0, 2 * Math.PI);
      ctx.fillStyle = LD.alpha(bc, col.dark ? 0.35 : 0.3); ctx.fill();
      ctx.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.25 : 0.6); ctx.lineWidth = 1; ctx.stroke();
      // 冰塊或熱氣（示意）
      if (Tc <= 10) {
        const n = Tc <= 6 ? 4 : 2;
        for (let i = 0; i < n; i++) {
          const ix = x0 + w * (0.12 + 0.2 * i) + (i % 2 ? w * 0.52 : 0), iy = wl - 3 + (i % 2) * 2, s = Math.max(8, w * 0.06);
          if (Math.abs(ix - G.cx) < G.bW * 0.62) continue;
          ctx.save(); ctx.translate(ix, iy); ctx.rotate((i % 3 - 1) * 0.3);
          LD.roundRect(ctx, -s / 2, -s / 2, s, s * 0.8, 2);
          ctx.fillStyle = 'rgba(235,248,255,0.75)'; ctx.fill(); ctx.strokeStyle = 'rgba(160,200,230,0.9)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.restore();
        }
      }
      // 盤的後緣
      ctx.beginPath(); ctx.ellipse(G.cx, yt, w / 2, ry, 0, Math.PI, 2 * Math.PI);
      ctx.strokeStyle = col.glassEdge; ctx.lineWidth = 1.2; ctx.stroke();
    } else {
      // 前面的玻璃
      ctx.beginPath(); ctx.moveTo(x0, yt); ctx.lineTo(x0, yb - ry); ctx.ellipse(G.cx, yb - ry, w / 2, ry, 0, Math.PI, 0, true); ctx.lineTo(x0 + w, yt);
      ctx.fillStyle = col.glass; ctx.fill();
      ctx.strokeStyle = col.glassEdge; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(G.cx, yt, w / 2, ry, 0, 0, Math.PI);
      ctx.stroke();
      // 高光
      ctx.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.25 : 0.6) + ')'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0 + 7, yt + 8); ctx.lineTo(x0 + 7, yb - ry - 4); ctx.stroke();
      if (Tc >= 40 && !reducedMotion) {
        ctx.strokeStyle = LD.alpha(col.muted, 0.35); ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const sx = x0 + w * (0.1 + 0.08 * i), sy = yt - 6;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(sx - 6, sy - 10, sx + 6, sy - 16, sx, sy - 26); ctx.stroke();
        }
      }
    }
  }
  /** 燒杯外形（略帶開口），傳回幾何 */
  function beakerGeom(cx, yb, w, h) {
    return { x0: cx - w / 2, x1: cx + w / 2, yb: yb, yt: yb - h, r: Math.min(10, w * 0.1), lip: Math.max(3, w * 0.05) };
  }
  function beakerPath(g) {
    ctx.beginPath();
    ctx.moveTo(g.x0 - g.lip * 0.4, g.yt);
    ctx.lineTo(g.x0, g.yt + g.lip);
    ctx.lineTo(g.x0, g.yb - g.r);
    ctx.quadraticCurveTo(g.x0, g.yb, g.x0 + g.r, g.yb);
    ctx.lineTo(g.x1 - g.r, g.yb);
    ctx.quadraticCurveTo(g.x1, g.yb, g.x1, g.yb - g.r);
    ctx.lineTo(g.x1, g.yt);
  }
  function liquidColor(blue) {
    const base = col.dark ? 'rgba(170,200,230,0.20)' : 'rgba(170,205,235,0.30)';
    if (blue <= 0.001) return base;
    const c = LD.mix(col.dark ? '#5d74c9' : '#7f8fd8', BLUE, Math.min(1, blue));
    return LD.alpha(c, 0.25 + 0.7 * blue);
  }
  function drawLiquid(g, frac, blue, swirl) {
    const ly = g.yb - (g.yb - g.yt) * 0.9 * frac;
    ctx.save();
    beakerPath(g); ctx.closePath(); ctx.clip();
    ctx.beginPath();
    const dip = swirl ? Math.min(5, (g.x1 - g.x0) * 0.04) : 0;
    ctx.moveTo(g.x0 - 2, ly - 2.5);
    ctx.quadraticCurveTo(g.x0 + 3, ly, g.x0 + 8, ly);
    ctx.quadraticCurveTo((g.x0 + g.x1) / 2, ly + dip * 2, g.x1 - 8, ly);
    ctx.quadraticCurveTo(g.x1 - 3, ly, g.x1 + 2, ly - 2.5);
    ctx.lineTo(g.x1 + 2, g.yb + 2); ctx.lineTo(g.x0 - 2, g.yb + 2); ctx.closePath();
    const lg = ctx.createLinearGradient(g.x0, 0, g.x1, 0);
    const c = liquidColor(blue);
    lg.addColorStop(0, c); lg.addColorStop(0.45, c); lg.addColorStop(1, blue > 0.2 ? LD.alpha(LD.shade(LD.mix('#7f8fd8', BLUE, blue), -0.35), 0.3 + 0.65 * blue) : c);
    ctx.fillStyle = lg; ctx.fill();
    // 彎月面亮線
    ctx.strokeStyle = blue > 0.4 ? 'rgba(160,175,255,0.45)' : 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0 + 8, ly); ctx.quadraticCurveTo((g.x0 + g.x1) / 2, ly + dip * 2, g.x1 - 8, ly); ctx.stroke();
    ctx.restore();
    return ly;
  }
  function drawBeakerA(cur) {
    const b = beaker, g = beakerGeom(G.cx, G.bBot, G.bW, G.bH);
    const VP = b ? b.o.VP : val(elP);
    const now = performance.now();
    const pourU = cur.mixed && !reducedMotion ? Math.min(1, (now - b.pour0) / 700) : 1;
    const vol = cur.mixed ? (C.V_TOTAL - VP * (1 - pourU)) : C.V_TOTAL - VP;
    LD.contactShadow(ctx, G.cx, G.bBot, G.bW * 0.5, 0);
    // 後壁
    beakerPath(g);
    ctx.fillStyle = col.glass; ctx.fill();
    const stir = cur.mixed && (b.phase === 'run' || b.phase === 'blue');
    const ly = drawLiquid(g, vol / 100, cur.B, stir);
    // 攪拌子（示意）
    const ang = reducedMotion || !stir ? 0.6 : now / 1000 * 9;
    const L = G.bW * 0.22, by = g.yb - 6, dx = Math.cos(ang) * L, dy = Math.sin(ang) * L * 0.22;
    ctx.lineCap = 'round';
    ctx.strokeStyle = col.dark ? '#c9ced6' : '#f4f6f8'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(G.cx - dx, by - dy); ctx.lineTo(G.cx + dx, by + dy); ctx.stroke();
    ctx.strokeStyle = LD.alpha('#7a828c', 0.6); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(G.cx - dx, by - dy + 2); ctx.lineTo(G.cx + dx, by + dy + 2); ctx.stroke();
    // 倒入時的水流
    if (cur.mixed && pourU < 1) {
      const sx = g.x0 + G.bW * 0.18, top = g.yt - G.BH * 0.5;
      ctx.strokeStyle = liquidColor(0); ctx.lineWidth = 5 * (1 - pourU) + 1;
      ctx.beginPath(); ctx.moveTo(sx, top); ctx.quadraticCurveTo(sx + 4, (top + ly) / 2, sx + 6, ly); ctx.stroke();
    }
    // 變藍的瞬間：從中心擴散的光暈（示意，減少動態時不畫）
    if (b && b.flash0 && !reducedMotion) {
      const u = (now - b.flash0) / 700;
      if (u >= 0 && u < 1) {
        ctx.save(); beakerPath(g); ctx.closePath(); ctx.clip();
        const rg = ctx.createRadialGradient(G.cx, (ly + g.yb) / 2, 2, G.cx, (ly + g.yb) / 2, G.bW * (0.2 + 0.9 * u));
        rg.addColorStop(0, 'rgba(120,140,255,' + (0.55 * (1 - u)) + ')'); rg.addColorStop(1, 'rgba(120,140,255,0)');
        ctx.fillStyle = rg; ctx.fillRect(g.x0, g.yt, G.bW, G.bH);
        ctx.restore();
      }
    }
    // 玻璃、刻度
    beakerPath(g);
    ctx.strokeStyle = col.glassEdge; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.3 : 0.7) + ')'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(g.x0 + 6, g.yt + 12); ctx.lineTo(g.x0 + 6, g.yb - 14); ctx.stroke();
    ctx.fillStyle = LD.alpha(col.text, 0.55); ctx.strokeStyle = LD.alpha(col.text, 0.45); ctx.lineWidth = 1;
    ctx.font = '500 ' + (G.fs - 2) + 'px ' + FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [25, 50, 75].forEach(function (v) {
      const yy = g.yb - (g.yb - g.yt) * 0.9 * v / 100;
      ctx.beginPath(); ctx.moveTo(g.x1 - 4, yy + 0.5); ctx.lineTo(g.x1 - (v === 50 ? 16 : 10), yy + 0.5); ctx.stroke();
      if (v === 50) ctx.fillText('50', g.x1 - 18, yy);
    });
    // 標籤
    const lab = 'KI + Na2S2O3 + ' + T('澱粉', 'starch');
    chemPill(ctx, 'A  ' + lab, G.cx, g.yt - 14 - (G.narrow ? 0 : 4), G.fs - 1, col.text, 'center');
  }
  function drawBeakerB() {
    const b = beaker, now = performance.now();
    const VP = b ? b.o.VP : val(elP);
    const mixed = b && b.phase !== 'ready';
    const u = mixed && !reducedMotion ? Math.min(1, (now - b.pour0) / 700) : (mixed ? 1 : 0);
    const pouring = mixed && u < 1;
    let cx = G.Bx, yb = G.benchY, ang = 0;
    if (pouring) {
      const k = Math.sin(Math.PI * Math.min(1, u * 1.25));
      cx = G.Bx + (G.cx - G.bW * 0.62 - G.Bx) * Math.min(1, u * 2.2);
      yb = G.benchY - (G.benchY - (G.bBot - G.bH - 4)) * Math.min(1, u * 2.2);
      ang = 1.6 * k;
    }
    const g = beakerGeom(0, 0, G.BW, G.BH);
    ctx.save();
    ctx.translate(cx, yb);
    ctx.rotate(ang);
    if (!pouring) LD.contactShadow(ctx, 0, 0, G.BW * 0.55, 0);
    beakerPath(g); ctx.fillStyle = col.glass; ctx.fill();
    const fill = mixed ? (pouring ? (1 - u) : 0) : VP / 25;
    if (fill > 0.002) {
      ctx.save(); beakerPath(g); ctx.closePath(); ctx.clip();
      const ly = g.yb - (g.yb - g.yt) * 0.9 * Math.min(1, fill);
      ctx.fillStyle = state.rx === 'x' ? LD.alpha(col.dark ? '#c9a8e8' : '#b48ad8', 0.35) : (col.dark ? 'rgba(170,200,230,0.22)' : 'rgba(170,205,235,0.32)');
      ctx.fillRect(g.x0 - 10, ly, G.BW + 20, g.yb - ly + 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(g.x0, ly); ctx.lineTo(g.x1, ly); ctx.stroke();
      ctx.restore();
    }
    beakerPath(g); ctx.strokeStyle = col.glassEdge; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.3 : 0.7) + ')'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(g.x0 + 5, g.yt + 8); ctx.lineTo(g.x0 + 5, g.yb - 9); ctx.stroke();
    ctx.restore();
    if (!pouring) {
      const name = state.rx === 'x' ? 'X' : '(NH4)2S2O8';
      chemPill(ctx, 'B  ' + name, cx, G.benchY - G.BH - 16, G.fs - 1, state.rx === 'x' ? col.accent : col.ox, 'center');
      ctx.fillStyle = col.muted; ctx.font = '500 ' + (G.fs - 1) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(mixed ? T('（已倒入）', '(poured in)') : num(VP, 2).replace(/0$/, '') + ' mL', cx, G.benchY + 5);
    }
  }
  function drawThermometer() {
    const Tc = beaker ? beaker.o.T : val(elT);
    const x = G.cx + G.dishW * 0.36, yTop = G.dishBot - G.dishH - G.bH * 0.35, yBot = G.dishBot - G.dishH * 0.2;
    const tw = 7, bulb = 6.5;
    LD.roundRect(ctx, x - tw / 2, yTop, tw, yBot - yTop, tw / 2);
    ctx.fillStyle = col.dark ? 'rgba(230,240,250,0.18)' : 'rgba(255,255,255,0.75)'; ctx.fill();
    ctx.strokeStyle = col.glassEdge; ctx.lineWidth = 1; ctx.stroke();
    const frac = (Tc + 10) / 70, yl = yBot - (yBot - yTop - 8) * frac;
    ctx.fillStyle = '#d6453b';
    ctx.fillRect(x - 1.4, yl, 2.8, yBot - yl);
    LD.ball(ctx, x, yBot + bulb - 2, bulb, '#d6453b');
    ctx.strokeStyle = LD.alpha(col.text, 0.35); ctx.lineWidth = 1;
    for (let k = 0; k <= 6; k++) { const yy = yBot - (yBot - yTop - 8) * (k * 10 + 10) / 70; ctx.beginPath(); ctx.moveTo(x + tw / 2, yy + 0.5); ctx.lineTo(x + tw / 2 + (k % 2 ? 3 : 5), yy + 0.5); ctx.stroke(); }
    LD.pill(ctx, num(Tc, 1) + ' °C', x + 7, yTop + 16, col.text, 'left');
  }
  function dispTime() {
    const b = beaker;
    if (!b || b.phase === 'ready') return 0;
    if (b.rec && b.rec.t != null) return b.rec.t;
    return b.simT;
  }
  function drawStopwatch(cur) {
    const S = G.sw, R = S.R, cx = S.x, cy = S.y;
    const t = dispTime();
    const stopped = beaker && beaker.rec && beaker.rec.t != null;
    // 按鈕與吊環
    LD.block(ctx, cx - R * 0.12, cy - R - R * 0.2, R * 0.24, R * 0.16, '#9aa3ad', { r: 2 });
    ctx.beginPath(); ctx.arc(cx, cy - R - R * 0.3, R * 0.11, 0, 2 * Math.PI);
    ctx.strokeStyle = '#8a939e'; ctx.lineWidth = 2.5; ctx.stroke();
    // 外殼
    ctx.save();
    ctx.shadowColor = LD.shadowInk(0.28); ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    const cg = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.08);
    cg.addColorStop(0, '#f4f6f8'); cg.addColorStop(0.7, '#b9c0c8'); cg.addColorStop(1, '#7c858f');
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, 2 * Math.PI); ctx.fillStyle = cg; ctx.fill();
    ctx.restore();
    // 錶面
    const fg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.05, cx, cy, R);
    fg.addColorStop(0, col.dark ? '#2c3038' : '#ffffff'); fg.addColorStop(1, col.dark ? '#1c1f25' : '#eef1f4');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fillStyle = fg; ctx.fill();
    // 刻度
    ctx.lineCap = 'round';
    for (let k = 0; k < 60; k++) {
      const a = k / 60 * 2 * Math.PI - Math.PI / 2, big = k % 5 === 0;
      const r1 = R * (big ? 0.82 : 0.88), r2 = R * 0.95;
      ctx.strokeStyle = LD.alpha(col.text, big ? 0.85 : 0.4); ctx.lineWidth = big ? 1.8 : 1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
    }
    ctx.fillStyle = col.text; ctx.font = '600 ' + Math.max(9, R * 0.13) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 60; k += 10) { const a = k / 60 * 2 * Math.PI - Math.PI / 2; ctx.fillText(String(k), cx + Math.cos(a) * R * 0.68, cy + Math.sin(a) * R * 0.68); }
    // 分鐘小錶盤（0–30 分）
    const sr = R * 0.24, sy = cy + R * 0.36;
    ctx.beginPath(); ctx.arc(cx, sy, sr, 0, 2 * Math.PI); ctx.strokeStyle = LD.alpha(col.text, 0.35); ctx.lineWidth = 1; ctx.stroke();
    for (let k = 0; k < 30; k += 5) { const a = k / 30 * 2 * Math.PI - Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * sr * 0.75, sy + Math.sin(a) * sr * 0.75); ctx.lineTo(cx + Math.cos(a) * sr, sy + Math.sin(a) * sr); ctx.stroke(); }
    const am = (t / 60 % 30) / 30 * 2 * Math.PI - Math.PI / 2;
    ctx.strokeStyle = col.text; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(cx + Math.cos(am) * sr * 0.85, sy + Math.sin(am) * sr * 0.85); ctx.stroke();
    // 秒針
    const as = (t % 60) / 60 * 2 * Math.PI - Math.PI / 2;
    ctx.strokeStyle = '#d6453b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(as) * R * 0.15, cy - Math.sin(as) * R * 0.15); ctx.lineTo(cx + Math.cos(as) * R * 0.86, cy + Math.sin(as) * R * 0.86); ctx.stroke();
    LD.ball(ctx, cx, cy, Math.max(3, R * 0.05), '#d6453b');
    // 數字讀數
    const txt = clockText(t);
    const fy = cy + R * 1.08 + 20;
    ctx.font = '700 ' + Math.max(15, R * 0.24) + 'px ' + FONT;
    const tw = ctx.measureText(txt).width + 18, th = Math.max(24, R * 0.32);
    LD.roundRect(ctx, cx - tw / 2, fy - th / 2, tw, th, 7);
    ctx.fillStyle = stopped ? LD.alpha(col.iod, col.dark ? 0.32 : 0.14) : (col.dark ? '#111418' : '#f7f8fa'); ctx.fill();
    ctx.strokeStyle = stopped ? col.iod : col.border; ctx.lineWidth = stopped ? 1.6 : 1; ctx.stroke();
    ctx.fillStyle = col.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, cx, fy + 1);
    if (SPEEDS[state.speed] > 1 && beaker && beaker.phase === 'run') LD.pill(ctx, '×' + SPEEDS[state.speed], cx + R * 0.95, cy - R * 0.9, col.accent, 'center');
    if (stopped) LD.pill(ctx, T('變藍，停錶', 'Blue: stopped'), cx, cy - R * 0.22, col.iod, 'center');
    else if (beaker && beaker.phase === 'never') LD.pill(ctx, T('不會變藍', 'Never blue'), cx, cy - R * 0.22, col.muted, 'center');
  }
  function drawBars(cur) {
    const B = G.bars, fs = G.fs;
    const rows = [
      { lab: 'S2O3^2−', v: beaker && beaker.p.S0 > 0 ? cur.S : 0, c: col.thio, note: T('（時鐘）', ' (clock)') },
      { lab: oxName(), v: cur.A, c: col.ox, note: '' },
      { lab: T('藍色深淺', 'Blueness'), v: cur.B, c: col.iod, note: '' }
    ];
    const gap = G.narrow ? Math.min(42, (G.rc.h - 34) / 3) : 40;
    ctx.fillStyle = col.muted; ctx.font = '600 ' + fs + 'px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(T('杯中的量（對初濃度）', 'In the beaker (vs start)'), B.x, B.y);
    rows.forEach(function (r, i) {
      const y = B.y + 16 + i * gap;
      chemText(ctx, r.lab + r.note, B.x, y + fs * 0.4, fs, r.c, 'left', 600);
      const by = y + fs * 0.75, bh = 10;
      LD.roundRect(ctx, B.x, by, B.w, bh, 5);
      ctx.fillStyle = LD.alpha(col.muted, 0.15); ctx.fill();
      const w = Math.max(0, Math.min(1, r.v)) * B.w;
      if (w > 0.5) {
        const gg = ctx.createLinearGradient(0, by, 0, by + bh);
        gg.addColorStop(0, LD.shade(r.c, 0.25)); gg.addColorStop(1, r.c);
        LD.roundRect(ctx, B.x, by, Math.max(w, 5), bh, 5); ctx.fillStyle = gg; ctx.fill();
      }
      ctx.fillStyle = col.text; ctx.font = '600 ' + (fs - 1) + 'px ' + FONT; ctx.textAlign = 'right';
      ctx.fillText(num(100 * Math.max(0, r.v), r.v > 0.995 || r.v < 0.005 ? 0 : 1) + '%', B.x + B.w, y + fs * 0.4);
      ctx.textAlign = 'left';
    });
  }

  // ======================= 圖表 =======================
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w; gh = w < 560 ? Math.round(Math.max(260, w * 0.78)) : 320;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function rxRuns() { return runs.filter(function (r) { return r.rx === state.rx && r.unk === (state.rx === 'x' && unk ? unk.id : 0); }); }
  function frameBox() {
    const narrow = gw < 520;
    return { x0: narrow ? 52 : 66, x1: gw - (narrow ? 12 : 20), y0: 16, y1: gh - (narrow ? 44 : 46) };
  }
  function axesFrame(f, xl, yl) {
    const c = gctx;
    c.strokeStyle = LD.alpha(col.text, 0.6); c.lineWidth = 1;
    c.beginPath(); c.moveTo(f.x0 + 0.5, f.y0); c.lineTo(f.x0 + 0.5, f.y1 + 0.5); c.lineTo(f.x1, f.y1 + 0.5); c.stroke();
    c.fillStyle = col.muted; c.font = '500 12px ' + FONT;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    chemTextG(xl, (f.x0 + f.x1) / 2, gh - 8, 12, col.muted, 'center');
    c.save(); c.translate(14, (f.y0 + f.y1) / 2); c.rotate(-Math.PI / 2);
    chemTextG(yl, 0, 0, 12, col.muted, 'center');
    c.restore();
  }
  function chemTextG(s, x, y, size, color, align) { return chemText(gctx, s, x, y, size, color, align, 500); }
  function placeholder(msg) {
    gctx.fillStyle = col.muted; gctx.font = '500 14px ' + FONT; gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
    const words = msg, maxW = gw - 40;
    // 簡單換行
    const lines = []; let line = '';
    for (const ch of words) { if (gctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch; }
    lines.push(line);
    lines.forEach(function (l, i) { gctx.fillText(l, gw / 2, gh / 2 + (i - (lines.length - 1) / 2) * 20); });
  }
  function drawGraph() {
    if (!gw) return;
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gctx.clearRect(0, 0, gw, gh);
    LD.backdrop(gctx, gw, gh);
    if (state.tab === 'time') drawTimeGraph();
    else if (state.tab === 'order') drawOrderGraph();
    else drawArrGraph();
  }
  function niceStep(span, n) {
    const raw = span / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function drawTimeGraph() {
    const b = beaker;
    if (!b || !b.samples) { placeholder(T('按「混合並計時」後，這裡畫出杯中硫代硫酸根、氧化劑與藍色深淺隨時間的變化。', 'After “Mix and time”, this graph shows how the thiosulfate, the oxidant and the blue colour change with time.')); return; }
    const f = frameBox(), c = gctx, tE = b.samples.tEnd;
    const X = function (t) { return f.x0 + (f.x1 - f.x0) * t / tE; }, Y = function (v) { return f.y1 - (f.y1 - f.y0) * v; };
    const st = niceStep(tE, gw < 520 ? 4 : 6);
    c.strokeStyle = LD.alpha(col.text, 0.08); c.lineWidth = 1;
    c.fillStyle = col.muted; c.font = '500 11px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'top';
    for (let t = 0; t <= tE + 1e-9; t += st) { const x = Math.round(X(t)) + 0.5; c.beginPath(); c.moveTo(x, f.y0); c.lineTo(x, f.y1); c.stroke(); c.fillText(num(t, st >= 1 ? 0 : Math.ceil(-Math.log10(st) - 1e-9)), x, f.y1 + 4); }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = 0; v <= 1.0001; v += 0.25) { const y = Math.round(Y(v)) + 0.5; c.beginPath(); c.moveTo(f.x0, y); c.lineTo(f.x1, y); c.stroke(); c.fillText(num(v * 100, 0) + '%', f.x0 - 4, y); }
    axesFrame(f, T('時間 t（s）', 'time t (s)'), T('對初濃度的比例', 'fraction of start'));
    const pts = b.samples.pts, upto = b.phase === 'ready' ? 0 : b.simT;
    const series = [
      { k: 'S', c: col.thio, on: b.p.S0 > 0 }, { k: 'A', c: col.ox, on: true }, { k: 'B', c: col.iod, on: true }
    ];
    series.forEach(function (s) {
      if (!s.on) return;
      c.strokeStyle = s.c; c.lineWidth = 2.4; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      let started = false;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        if (q.t > upto + 1e-9) {
          if (i > 0) { const p0 = pts[i - 1], u = (upto - p0.t) / (q.t - p0.t); c.lineTo(X(upto), Y(p0[s.k] + (q[s.k] - p0[s.k]) * u)); }
          break;
        }
        if (!started) { c.moveTo(X(q.t), Y(q[s.k])); started = true; } else c.lineTo(X(q.t), Y(q[s.k]));
      }
      c.stroke();
    });
    if (b.rec && b.rec.t != null) {
      const x = X(b.rec.t);
      c.setLineDash([5, 4]); c.strokeStyle = col.iod; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x, f.y0); c.lineTo(x, f.y1); c.stroke(); c.setLineDash([]);
      LD.pill(c, T('變藍 ', 'blue at ') + secText(b.rec.t), Math.min(f.x1 - 50, Math.max(f.x0 + 50, x)), f.y0 + 14, col.iod, 'center');
    }
    if (upto > 0 && upto < tE) {
      c.strokeStyle = LD.alpha(col.text, 0.35); c.lineWidth = 1;
      const x = Math.round(X(upto)) + 0.5; c.beginPath(); c.moveTo(x, f.y0); c.lineTo(x, f.y1); c.stroke();
    }
  }
  function logTicks(lo, hi) {
    const out = [], e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
    for (let e = e0; e <= e1; e++) [1, 2, 5].forEach(function (m) { const v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); });
    return out;
  }
  function bestGroup(list, fn) {
    if (!list.length) return null;
    const ref = list[list.length - 1];
    let g = fn(list, ref);
    if (g) return g;
    let best = null;
    list.forEach(function (r) { const q = fn(list, r); if (q && (!best || q.nx > best.nx || (q.nx === best.nx && q.n > best.n))) best = q; });
    return best;
  }
  function tickLabelHTML(v) { const p = sciParts(v, 2); return p.e == null ? p.m : null; }
  function drawSciCanvas(c, v, x, y, align) {
    const p = sciParts(v, 2);
    if (p.e == null) { c.textAlign = align; c.fillText(p.m, x, y); return; }
    LD.supText(c, (p.m === '1.0' ? '' : p.m + '×') + '10', num(p.e, 0), x, y, col.muted, '500 11px ' + FONT, align);
  }
  function drawOrderGraph() {
    const list = rxRuns().filter(function (r) { return r.rate > 0; });
    if (list.length < 1) { placeholder(T('做幾次實驗後，這裡用對數座標畫出速率對濃度的關係，直線的斜率就是級數。', 'After a few runs, this log–log graph shows rate against concentration; the slope of the line is the order.')); return; }
    const key = state.ax === 'I' ? 'I0' : 'P0';
    const g = bestGroup(list, function (L, r) { return C.orderGroup(L, r, state.ax); });
    const f = frameBox(), c = gctx;
    const xs = list.map(function (r) { return r[key]; }), ys = list.map(function (r) { return r.rate; });
    let xlo = Math.min.apply(null, xs) / 1.6, xhi = Math.max.apply(null, xs) * 1.6, ylo = Math.min.apply(null, ys) / 2, yhi = Math.max.apply(null, ys) * 2;
    const X = function (v) { return f.x0 + (f.x1 - f.x0) * (Math.log(v) - Math.log(xlo)) / (Math.log(xhi) - Math.log(xlo)); };
    const Y = function (v) { return f.y1 - (f.y1 - f.y0) * (Math.log(v) - Math.log(ylo)) / (Math.log(yhi) - Math.log(ylo)); };
    c.strokeStyle = LD.alpha(col.text, 0.08); c.lineWidth = 1; c.fillStyle = col.muted; c.font = '500 11px ' + FONT;
    c.textBaseline = 'top';
    logTicks(xlo, xhi).forEach(function (v) { const x = Math.round(X(v)) + 0.5; c.beginPath(); c.moveTo(x, f.y0); c.lineTo(x, f.y1); c.stroke(); c.textAlign = 'center'; c.fillText(sigf(v, 2), x, f.y1 + 4); });
    c.textBaseline = 'middle';
    const yt = logTicks(ylo, yhi);
    yt.forEach(function (v, i) { const y = Math.round(Y(v)) + 0.5; c.strokeStyle = LD.alpha(col.text, 0.08); c.lineWidth = 1; c.beginPath(); c.moveTo(f.x0, y); c.lineTo(f.x1, y); c.stroke(); if (yt.length < 8 || i % 2 === 0) drawSciCanvas(c, v, f.x0 - 4, y, 'right'); });
    axesFrame(f, (state.ax === 'I' ? '[I^−]' : (state.rx === 'x' ? '[X]' : '[S2O8^2−]')) + '0' + T('（M，對數）', ' (M, log)'), T('初速率（M/s，對數）', 'initial rate (M/s, log)'));
    const inG = function (r) { return g && g.pts.indexOf(r) >= 0; };
    list.forEach(function (r) {
      const x = X(r[key]), y = Y(r.rate), on = inG(r);
      c.beginPath(); c.arc(x, y, on ? 6 : 4.5, 0, 2 * Math.PI);
      if (on) { LD.ball(c, x, y, 6, col.accent); }
      else { c.strokeStyle = LD.alpha(col.muted, 0.8); c.lineWidth = 1.5; c.stroke(); }
    });
    if (g) {
      const a = g.fit.intercept, s = g.fit.slope;
      const xa = Math.min.apply(null, g.pts.map(function (r) { return r[key]; })) / 1.25, xb = Math.max.apply(null, g.pts.map(function (r) { return r[key]; })) * 1.25;
      c.strokeStyle = col.accent; c.lineWidth = 2; c.setLineDash([7, 5]);
      c.beginPath(); c.moveTo(X(xa), Y(Math.exp(a + s * Math.log(xa)))); c.lineTo(X(xb), Y(Math.exp(a + s * Math.log(xb)))); c.stroke(); c.setLineDash([]);
      LD.pill(c, T('斜率 = ', 'slope = ') + num(s, 3) + T('（' + g.nx + ' 種濃度）', ' (' + g.nx + ' concentrations)'), f.x0 + 10, f.y0 + 14, col.accent, 'left');
    }
  }
  function drawArrGraph() {
    const list = rxRuns().filter(function (r) { return r.t > 0; });
    if (list.length < 1) { placeholder(T('同一個配方在不同溫度各做一次，這裡畫出 ln(1/t) 對 1/T，斜率 = −Ea/R。', 'Run one recipe at several temperatures: this graph shows ln(1/t) against 1/T, and the slope is −Ea/R.')); return; }
    const g = bestGroup(list, function (L, r) { return C.arrGroup(L, r); });
    const f = frameBox(), c = gctx;
    const xs = list.map(function (r) { return 1000 / (r.T + 273.15); }), ys = list.map(function (r) { return Math.log(1 / r.t); });
    let xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs), ylo = Math.min.apply(null, ys), yhi = Math.max.apply(null, ys);
    const px = Math.max(0.02, (xhi - xlo) * 0.12), py = Math.max(0.3, (yhi - ylo) * 0.12);
    xlo -= px; xhi += px; ylo -= py; yhi += py;
    const X = function (v) { return f.x0 + (f.x1 - f.x0) * (v - xlo) / (xhi - xlo); }, Y = function (v) { return f.y1 - (f.y1 - f.y0) * (v - ylo) / (yhi - ylo); };
    c.strokeStyle = LD.alpha(col.text, 0.08); c.lineWidth = 1; c.fillStyle = col.muted; c.font = '500 11px ' + FONT;
    const sx = niceStep(xhi - xlo, gw < 520 ? 4 : 6), sy = niceStep(yhi - ylo, 5);
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = Math.ceil(xlo / sx) * sx; v <= xhi; v += sx) { const x = Math.round(X(v)) + 0.5; c.beginPath(); c.moveTo(x, f.y0); c.lineTo(x, f.y1); c.stroke(); c.fillText(num(v, sx < 0.01 ? 3 : 2), x, f.y1 + 4); }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = Math.ceil(ylo / sy) * sy; v <= yhi; v += sy) { const y = Math.round(Y(v)) + 0.5; c.beginPath(); c.moveTo(f.x0, y); c.lineTo(f.x1, y); c.stroke(); c.fillText(num(v, sy < 1 ? 1 : 0), f.x0 - 4, y); }
    axesFrame(f, T('1/T（10^−3 K^−1）', '1/T (10^−3 K^−1)'), 'ln(1/t)');
    list.forEach(function (r) {
      const on = g && g.pts.indexOf(r) >= 0, x = X(1000 / (r.T + 273.15)), y = Y(Math.log(1 / r.t));
      if (on) LD.ball(c, x, y, 6, col.pos);
      else { c.beginPath(); c.arc(x, y, 4.5, 0, 2 * Math.PI); c.strokeStyle = LD.alpha(col.muted, 0.8); c.lineWidth = 1.5; c.stroke(); }
    });
    if (g) {
      const xa = xlo + px * 0.5, xb = xhi - px * 0.5;
      const yv = function (v) { return g.fit.intercept + g.fit.slope * v / 1000; };
      c.strokeStyle = col.pos; c.lineWidth = 2; c.setLineDash([7, 5]);
      c.beginPath(); c.moveTo(X(xa), Y(yv(xa))); c.lineTo(X(xb), Y(yv(xb))); c.stroke(); c.setLineDash([]);
      LD.pill(c, 'Ea = ' + num(g.Ea, 1) + ' kJ/mol' + T('（' + g.nT + ' 個溫度）', ' (' + g.nT + ' temperatures)'), f.x1 - 10, f.y0 + 14, col.pos, 'right');
    }
  }
  function updateGraphText() {
    const lg = $('gLegend'), h = $('gHint');
    $('axSeg').hidden = state.tab !== 'order';
    if (state.tab === 'time') {
      lg.innerHTML = '<span><i class="ln" style="background:' + col.thio + '"></i>S<sub>2</sub>O<sub>3</sub><sup>2−</sup>' + T('（時鐘）', ' (clock)') + '</span>　' +
        '<span><i class="ln" style="background:' + col.ox + '"></i>' + (state.rx === 'x' ? 'X' : 'S<sub>2</sub>O<sub>8</sub><sup>2−</sup>') + '</span>　' +
        '<span><i class="ln" style="background:' + col.iod + '"></i>' + T('藍色深淺 1 − 10<sup>−A</sup>', 'blueness 1 − 10<sup>−A</sup>') + '</span>';
      h.textContent = T('硫代硫酸根直線下降，降到零的那一刻藍色才出現；氧化劑在這段時間只用掉一點點，所以這段時間的平均速率就是初速率。',
        'The thiosulfate falls in a straight line and the blue appears only when it reaches zero. Meanwhile only a little oxidant is used, so the average rate over this time is the initial rate.');
    } else if (state.tab === 'order') {
      lg.innerHTML = '<span><i class="dot" style="background:' + col.accent + '"></i>' + T('其他條件都相同的一組（擬合）', 'one set with everything else the same (fitted)') + '</span>　<span><i class="dot" style="border:1.5px solid ' + col.muted + '"></i>' + T('其他實驗', 'other runs') + '</span>';
      h.textContent = T('只有「其他濃度、溫度、硫代硫酸根、離子強度設定都相同」的實驗才放在同一條線上。斜率 ≈ 0、1、2 就是零級、一級、二級。',
        'Only runs with the same other concentration, temperature, thiosulfate and ionic-strength setting share a line. A slope near 0, 1 or 2 means zero, first or second order.');
    } else {
      lg.innerHTML = '<span><i class="dot" style="background:' + col.pos + '"></i>' + T('同一個配方（擬合）', 'the same recipe (fitted)') + '</span>　<span><i class="dot" style="border:1.5px solid ' + col.muted + '"></i>' + T('其他實驗', 'other runs') + '</span>';
      h.textContent = T('配方相同時 k ∝ 1/t，所以 ln(1/t) 對 1/T 的斜率 = −Ea/R。', 'With the same recipe k ∝ 1/t, so the slope of ln(1/t) against 1/T is −Ea/R.');
    }
  }

  // ======================= 數據表 =======================
  function renderTable() {
    const el = $('tbl');
    let h = '<thead><tr><th>#</th><th>' + T('反應', 'Reaction') + '</th><th>KI<br><small>mL</small></th><th>' + T('氧化劑', 'Oxidant') + '<br><small>mL</small></th><th>Na<sub>2</sub>S<sub>2</sub>O<sub>3</sub><br><small>mL</small></th><th>T<br><small>°C</small></th><th>' + T('補足', 'Top-up') + '</th>' +
      '<th>[I<sup>−</sup>]<sub>0</sub><br><small>M</small></th><th>[' + T('氧化劑', 'ox') + ']<sub>0</sub><br><small>M</small></th><th>[S<sub>2</sub>O<sub>3</sub><sup>2−</sup>]<sub>0</sub><br><small>M</small></th><th>t<br><small>s</small></th><th>' + T('初速率', 'rate') + '<br><small>M/s</small></th></tr></thead><tbody>';
    if (!runs.length) h += '<tr class="empty"><td colspan="12">' + T('還沒有紀錄。', 'No runs yet.') + '</td></tr>';
    runs.forEach(function (r) {
      h += '<tr' + (r === lastRec ? ' class="latest"' : '') + '><td>' + r.id + '</td><td>' + (r.rx === 'x' ? 'X' + (r.unk > 1 ? '<sub>' + r.unk + '</sub>' : '') : 'S<sub>2</sub>O<sub>8</sub><sup>2−</sup>') + '</td><td>' + num(r.VKI, 2) + '</td><td>' + num(r.VP, 2) + '</td><td>' + num(r.VS, 2) + '</td><td>' + num(r.T, 1) +
        '</td><td>' + (r.rx === 'x' ? '—' : r.salt ? T('鹽溶液', 'salts') : T('純水', 'water')) + '</td><td>' + sigf(r.I0, 3) + '</td><td>' + sigf(r.P0, 3) + '</td><td>' + sciHTML(r.S0, 3) + '</td><td>' +
        (r.never ? T('不變藍', 'never') : num(r.t, 2)) + '</td><td>' + (r.rate ? sciHTML(r.rate, 3) : '—') + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
    const wrap = el.parentElement;
    if (wrap && runs.length) wrap.scrollTop = wrap.scrollHeight;
  }

  // ======================= 讀數與文字 =======================
  function refreshOutputs() {
    $('vKIo').textContent = num(val(elKI), 2) + ' mL';
    $('vPo').textContent = num(val(elP), 2) + ' mL';
    $('vSo').textContent = num(val(elS), 2) + ' mL';
    $('tempo').textContent = num(val(elT), 1) + ' °C';
  }
  function updateReadouts() {
    const o = recipe(), c = C.mix(o);
    const ox = state.rx === 'x' ? '[X]<sub>0</sub>' : '[S<sub>2</sub>O<sub>8</sub><sup>2−</sup>]<sub>0</sub>';
    const mu = state.rx === 'x' ? null : C.ionicStrength(c, saltPS);
    $('readout').innerHTML =
      '<dt>[I<sup>−</sup>]<sub>0</sub></dt><dd>' + sigf(c.I0, 3) + ' M</dd>' +
      '<dt>' + ox + '</dt><dd>' + sigf(c.P0, 3) + ' M</dd>' +
      '<dt>[S<sub>2</sub>O<sub>3</sub><sup>2−</sup>]<sub>0</sub></dt><dd>' + sciHTML(c.S0, 3) + ' M</dd>' +
      '<dt>' + T('補足液', 'Top-up') + '<br><small>' + (state.rx === 'x' ? T('（X 沒有鹽效應）', '(X has no salt effect)') : saltPS ? T('KCl／K<sub>2</sub>SO<sub>4</sub> 鹽溶液', 'KCl / K<sub>2</sub>SO<sub>4</sub> solution') : T('純水', 'plain water')) + '</small></dt><dd>' + (c.ok ? num(c.fill, 2) : '<span style="color:var(--pos)">' + num(c.fill, 2) + '</span>') + ' mL</dd>' +
      '<dt>' + T('離子強度 μ', 'Ionic strength μ') + '</dt><dd>' + (mu == null ? '—' : sigf(mu, 3) + ' M') + '</dd>' +
      '<dt>' + T('碼錶', 'Stopwatch') + '</dt><dd class="big">' + (beaker && beaker.rec && beaker.rec.t != null ? secText(beaker.rec.t) : beaker && beaker.phase === 'never' ? T('不變藍', 'never blue') : beaker && beaker.phase === 'run' ? T('計時中', 'running') : '—') + '</dd>';
    $('fillHint').innerHTML = c.ok ? (state.rx === 'x' ? T('X 是中性分子，沒有鹽效應，「保持離子強度」對它沒有影響。', 'X is a neutral molecule with no salt effect, so “Keep the ionic strength” does not affect it.') :
      saltPS ? T('補足液是 KCl 與 K<sub>2</sub>SO<sub>4</sub> 溶液，每一杯的離子強度都是 0.22 M。', 'The top-up is KCl and K<sub>2</sub>SO<sub>4</sub> solution, so every beaker has an ionic strength of 0.22 M.') :
        T('補足液是純水：離子強度隨配方改變。', 'The top-up is plain water: the ionic strength changes with the recipe.')) :
      T('體積加起來超過 50.0 mL，請減少用量。', 'The volumes add up to more than 50.0 mL; use less.');
  }
  function updateRxText() {
    const x = state.rx === 'x';
    $('rxInfo').innerHTML = x ?
      T('虛構的氧化劑 X：X + 2I<sup>−</sup> → I<sub>2</sub> + …，速率定律未知。用初速率法找出 m、n 與 k。', 'An invented oxidant X: X + 2I<sup>−</sup> → I<sub>2</sub> + …, with an unknown rate law. Use initial rates to find m, n and k.') +
        (unk ? T('（第 ' + unk.id + ' 個未知反應' + (unk.revealed ? '，已揭曉' : '') + '）', ' (unknown no. ' + unk.id + (unk.revealed ? ', revealed' : '') + ')') : '') :
      'S<sub>2</sub>O<sub>8</sub><sup>2−</sup> + 2I<sup>−</sup> → 2SO<sub>4</sub><sup>2−</sup> + I<sub>2</sub>' + T('，碘鐘：I<sub>2</sub> + 2S<sub>2</sub>O<sub>3</sub><sup>2−</sup> → 2I<sup>−</sup> + S<sub>4</sub>O<sub>6</sub><sup>2−</sup>。', '; clock: I<sub>2</sub> + 2S<sub>2</sub>O<sub>3</sub><sup>2−</sup> → 2I<sup>−</sup> + S<sub>4</sub>O<sub>6</sub><sup>2−</sup>.');
    $('vPlab').textContent = x ? T('0.100 M 氧化劑 X', '0.100 M oxidant X') : T('0.100 M 過硫酸銨', '0.100 M ammonium persulfate');
    $('axP').innerHTML = x ? T('對 [X]<sub>0</sub>', 'Against [X]<sub>0</sub>') : T('對 [S<sub>2</sub>O<sub>8</sub><sup>2−</sup>]<sub>0</sub>', 'Against [S<sub>2</sub>O<sub>8</sub><sup>2−</sup>]<sub>0</sub>');
    $('lawText').innerHTML = 'r = k[' + (x ? 'X' : 'S<sub>2</sub>O<sub>8</sub><sup>2−</sup>') + ']<sup>m</sup>[I<sup>−</sup>]<sup>n</sup>';
    $('ansMLab').innerHTML = x ? T('X 的級數 m', 'Order in X, m') : T('S<sub>2</sub>O<sub>8</sub><sup>2−</sup> 的級數 m', 'Order in S<sub>2</sub>O<sub>8</sub><sup>2−</sup>, m');
    $('reveal').hidden = !x; $('unkNew').hidden = !x;
    elSalt.disabled = x;
    elSalt.checked = x ? true : saltPS;
    updateUnit();
  }
  function updateUnit() {
    const m = parseInt($('ansM').value, 10), n = parseInt($('ansN').value, 10);
    if (!isFinite(m) || !isFinite(n)) { $('kUnit').textContent = T('（先選好 m、n 才知道單位）', '(choose m and n to see the unit)'); return; }
    const p = C.kUnitPow(m, n);
    $('kUnit').innerHTML = T('單位：', 'unit: ') + (p === 0 ? '' : 'M' + (p === 1 ? '' : '<sup>' + num(p, 0) + '</sup>') + ' ') + 's<sup>−1</sup>';
  }
  function updateLast() {
    const r = lastRec, el = $('lastOut');
    if (!r) { el.textContent = T('還沒有紀錄。按「混合並計時」開始。', 'No runs yet. Press “Mix and time”.'); return; }
    if (r.never) { el.innerHTML = T('第 ' + r.id + ' 杯：硫代硫酸根 ≥ 2 倍氧化劑，永遠不會變藍。', 'Run ' + r.id + ': the thiosulfate is at least twice the oxidant, so it never turns blue.'); return; }
    const half = r.S0 / 2;
    el.innerHTML = T('第 ' + r.id + ' 杯：t = ', 'Run ' + r.id + ': t = ') + secText(r.t) + '<br>Δ[' + (r.rx === 'x' ? 'X' : 'S<sub>2</sub>O<sub>8</sub><sup>2−</sup>') + '] = [S<sub>2</sub>O<sub>3</sub><sup>2−</sup>]<sub>0</sub>/2 = ' + sciHTML(half, 3) + ' M' +
      (r.rate ? '<br>' + T('初速率 ≈ Δ/t = ', 'initial rate ≈ Δ/t = ') + sciHTML(r.rate, 3) + ' M/s' : '<br>' + T('沒有硫代硫酸根，無法算速率。', 'No thiosulfate, so no rate can be worked out.'));
  }
  function setStatus(s) { $('status').textContent = s; }
  function refreshAll() {
    refreshOutputs();
    updateReadouts();
    renderTable();
    updateLast();
    updateGraphText();
    drawStage();
    drawGraph();
    if (view3 && view3.active) view3.rebuild();
  }

  // ======================= 速率定律核對 =======================
  function checkAnswer() {
    acted();
    const m = parseInt($('ansM').value, 10), n = parseInt($('ansN').value, 10);
    const out = $('ansOut');
    if (!isFinite(m) || !isFinite(n)) { out.textContent = T('先選好兩個級數 m 與 n。', 'Choose both orders, m and n, first.'); return; }
    const x = state.rx === 'x';
    if (x && !unk) newUnknown();
    const truth = x ? unk.u : { m: 1, n: 1, k25: C.kPS(25, C.MU_REF) };
    const kv = C.parseNum($('ansK').value);
    const kErr = isFinite(kv) && kv > 0 ? Math.abs(kv / truth.k25 - 1) : null;
    const mOk = m === truth.m, nOk = n === truth.n;
    let tries = 0, revealed = false;
    if (x) { unk.tries++; tries = unk.tries; revealed = unk.revealed; if (mOk && nOk && unk.okAfter == null) unk.okAfter = seq; unk.lastAns = { m: m, n: n, k: isFinite(kv) && kv > 0 ? kv : null }; }
    const stats = C.answerStats(runs, state.rx, x ? unk.id : 0);
    if (x) stats.runs = unk.total;
    let h = (mOk ? '<span class="ok">' + T('m 正確', 'm is right') + '</span>' : '<span class="no">' + T('m 不對', 'm is wrong') + '</span>') + T('，', ', ') +
      (nOk ? '<span class="ok">' + T('n 正確', 'n is right') + '</span>' : '<span class="no">' + T('n 不對', 'n is wrong') + '</span>') + T('。', '.');
    if (kErr == null) h += T('（沒有填 k，或看不懂這個數字。）', ' (No k given, or the number could not be read.)');
    else if (!(mOk && nOk)) h += T('級數不對時，k 的數值與單位都不會對。', ' With wrong orders, k cannot be right either.');
    else if (kErr <= 0.05) h += ' <span class="ok">' + T('k 也對了', 'k is right too') + '</span>' + T('（誤差 ' + num(kErr * 100, 1) + '%）。', ' (error ' + num(kErr * 100, 1) + '%).');
    else h += T(' k 的誤差 ' + num(kErr * 100, 1) + '%，' + (kv > truth.k25 ? '偏大' : '偏小') + '。', ' k is off by ' + num(kErr * 100, 1) + '%: too ' + (kv > truth.k25 ? 'large' : 'small') + '.');
    if (!x && mOk && nOk && !(stats.nI >= 2 && stats.nP >= 2)) h += T('（提醒：級數要由實驗決定，至少各改兩種濃度做做看。）', ' (Remember: the orders must come from experiments — try at least two of each concentration.)');
    if (x) h += T('（第 ' + tries + ' 次核對）', ' (check no. ' + tries + ')');
    out.innerHTML = h;
    if (window.LabSound && window.LabSound.enabled()) {
      if (mOk && nOk && kErr != null && kErr <= 0.05) { window.LabSound.tone({ freq: 880, dur: 0.12, gain: 0.2 }); window.LabSound.tone({ freq: 1320, dur: 0.16, gain: 0.16, delay: 0.1 }); }
      else window.LabSound.tone({ freq: 300, dur: 0.15, type: 'triangle', gain: 0.12 });
    }
    if (window.LabMission) window.LabMission.emit('answer', Object.assign({ rx: state.rx, unk: x ? unk.id : 0, m: m, n: n, k: isFinite(kv) ? kv : null, mOk: mOk, nOk: nOk, kErr: kErr, tries: tries, revealed: revealed }, stats));
    updateRxText();
    if (view3 && view3.active) view3.rebuild();
  }
  function revealUnknown() {
    acted();
    if (!unk) return;
    unk.revealed = true;
    const u = unk.u, p = C.kUnitPow(u.m, u.n);
    $('ansOut').innerHTML = T('答案：', 'Answer: ') + 'r = k[X]<sup>' + u.m + '</sup>[I<sup>−</sup>]<sup>' + u.n + '</sup>' + T('，25 °C 的 k = ', ', k at 25 °C = ') + sciHTML(u.k25, 3) + ' ' +
      (p === 0 ? '' : 'M' + (p === 1 ? '' : '<sup>' + num(p, 0) + '</sup>') + ' ') + 's<sup>−1</sup>' + T('，Ea = ', ', Ea = ') + u.Ea + ' kJ/mol' + T('。這個已揭曉，換一個再挑戰。', '. This one is revealed; try another.');
    updateRxText();
    if (view3 && view3.active) view3.rebuild();
  }
  function newUnknown() {
    unkSeq++;
    unk = { u: C.newUnknown(), id: unkSeq, tries: 0, revealed: false, okAfter: null, total: 0, lastAns: null };
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
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
  /** 3D 要畫的資料：目前溫度下的速率曲面與量到的點 */
  function data3() {
    const o = recipe(), Tc = o.T, x = state.rx === 'x';
    let surf = null, kind = null;
    if (!x) {
      const S0 = C.mix(o).S0;
      surf = function (I, P) { const mu = saltPS ? C.MU_REF : I + 3 * P + 3 * S0; return C.kPS(Tc, mu) * P * I; };
      kind = 'model';
    } else if (unk && unk.revealed) {
      const u = unk.u; surf = function (I, P) { return C.kX(u, Tc) * Math.pow(P, u.m) * Math.pow(I, u.n); }; kind = 'truth';
    } else if (unk && unk.lastAns && unk.lastAns.k) {
      const a = unk.lastAns; surf = function (I, P) { return a.k * Math.pow(P, a.m) * Math.pow(I, a.n); }; kind = 'answer';
    }
    const pts = rxRuns().filter(function (r) { return r.rate > 0 && Math.abs(r.T - Tc) < 0.5 && (x || !!r.salt === !!saltPS); })
      .map(function (r) { return { I0: r.I0, P0: r.P0, rate: r.rate, latest: r === lastRec }; });
    const c = C.mix(o);
    return { rx: state.rx, Tc: Tc, salt: saltPS, surf: surf, kind: kind, pts: pts, cur: { I0: c.I0, P0: c.P0 },
      Imin: C.STOCK.KI * C.RANGE.KI[0] / C.V_TOTAL, Imax: C.STOCK.KI * C.RANGE.KI[1] / C.V_TOTAL,
      Pmin: C.STOCK.P * C.RANGE.P[0] / C.V_TOTAL, Pmax: C.STOCK.P * C.RANGE.P[1] / C.V_TOTAL };
  }
  function host3Api() {
    return {
      T: T, host: host3, colors: function () { return col; }, data: data3, scale: function () { return state.scale; },
      chemWidth: chemWidth, chemText: chemText, sciParts: sciParts, num: num, sigf: sigf,
      contextLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 實驗桌。', 'The 3D graphics context was lost, so the view switched back to the 2D bench.'); }
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
      if (!webglAvailable() || !window.Clock3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Clock3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false; $('scaleSeg').hidden = false;
        view3.rebuild();
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
      $('resetCam').hidden = true; $('scaleSeg').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true; $('scaleSeg').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 實驗桌。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D bench is kept.');
    resize();
  }

  // ======================= 操作 =======================
  let userActed = false;
  function acted() { userActed = true; }
  function onRecipe() {
    acted();
    refreshOutputs();
    if (beaker && beaker.phase !== 'ready') {
      if (beaker.phase === 'run') cancelRun(); else { prepare(); setStatus(''); }
    } else prepare();
    updateReadouts();
    drawStage();
    if (view3 && view3.active) view3.rebuild();
  }
  [elKI, elP, elS, elT].forEach(function (el) { el.addEventListener('input', onRecipe); });
  elSalt.addEventListener('change', function () {
    if (state.rx !== 'ps') { elSalt.checked = true; return; }
    saltPS = elSalt.checked;
    onRecipe();
    $('status').innerHTML = (saltPS ? T('補足液改回 KCl／K<sub>2</sub>SO<sub>4</sub> 鹽溶液：每一杯的離子強度相同。', 'Top-up back to KCl / K<sub>2</sub>SO<sub>4</sub> solution: every beaker has the same ionic strength.') :
      T('改用純水補足：離子強度會隨配方改變，k 也會跟著變。', 'Topping up with plain water: the ionic strength now changes with the recipe, and so does k.'));
  });
  document.querySelectorAll('#rxSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      if (b.dataset.rx === state.rx) return;
      state.rx = b.dataset.rx;
      document.querySelectorAll('#rxSeg button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); });
      if (state.rx === 'x' && !unk) newUnknown();
      $('ansOut').textContent = '';
      if (beaker && beaker.phase === 'run') cancelRun(T('換了反應，這一杯作廢。', 'The reaction changed, so this beaker is discarded.')); else prepare();
      lastRec = null;
      updateRxText();
      refreshAll();
    });
  });
  $('mix').addEventListener('click', startMix);
  $('fresh').addEventListener('click', function () { acted(); prepare(); setStatus(T('換了一杯新的，還沒混合。', 'A fresh beaker, not mixed yet.')); $('mix').textContent = T('混合並計時', 'Mix and time'); refreshAll(); });
  $('clearAll').addEventListener('click', function () {
    acted();
    runs = []; lastRec = null;
    if (beaker && beaker.phase !== 'run') prepare();
    setStatus(T('已清除數據表與圖上的紀錄。', 'The table and the graphs have been cleared.'));
    refreshAll();
  });
  [0, 1, 2, 3].forEach(function (k) {
    $('sp' + k).addEventListener('click', function () {
      acted(); state.speed = k;
      [0, 1, 2, 3].forEach(function (j) { $('sp' + j).setAttribute('aria-pressed', String(j === k)); });
      drawStage();
    });
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
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') { resize(); resizeGraph(); drawGraph(); }
  });
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.tab = b.dataset.tab;
      document.querySelectorAll('#tabs button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); });
      updateGraphText(); drawGraph();
    });
  });
  document.querySelectorAll('#axSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.ax = b.dataset.ax;
      document.querySelectorAll('#axSeg button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); });
      drawGraph();
    });
  });
  document.querySelectorAll('#scaleSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.scale = b.dataset.scale;
      document.querySelectorAll('#scaleSeg button').forEach(function (q) { q.setAttribute('aria-pressed', String(q === b)); });
      if (view3 && view3.active) view3.rebuild();
    });
  });
  $('ansM').addEventListener('change', updateUnit);
  $('ansN').addEventListener('change', updateUnit);
  $('check').addEventListener('click', checkAnswer);
  $('ansK').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); } });
  $('reveal').addEventListener('click', revealUnknown);
  $('unkNew').addEventListener('click', function () {
    acted();
    if (beaker && beaker.phase === 'run') cancelRun(T('換了未知反應，這一杯作廢。', 'A new unknown, so this beaker is discarded.'));
    newUnknown(); prepare(); lastRec = null;
    $('ansOut').textContent = T('換了一個新的未知氧化劑 X。', 'A new unknown oxidant X.');
    $('ansK').value = ''; $('ansM').value = ''; $('ansN').value = '';
    updateRxText(); refreshAll();
  });
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    updateGraphText();
    if (view3 && view3.active) view3.onTheme();
    drawStage(); drawGraph();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', function () { resize(); resizeGraph(); drawGraph(); });

  // 測試用（Playwright）：讀取目前狀態（短名 __ic）
  window.__ic = {
    state: state, runs: function () { return runs; }, beaker: function () { return beaker; }, unk: function () { return unk; },
    acted: function () { return userActed; }
  };

  // ======================= 啟動 =======================
  readColors();
  prepare();
  updateSoundButton();
  updateRxText();
  resize();
  resizeGraph();
  refreshAll();
})();
