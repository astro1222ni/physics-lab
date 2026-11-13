/*
 * colligative-properties.js — 「沸點上升與凝固點下降」的頁面程式
 * （冷浴試管／加熱燒瓶的裝置圖、微觀示意、溫度—時間圖、ΔT—m 圖、分析、我的測量、未知物 X、3D 切換、音效、任務事件）
 * 化學核心在 js/colligative-properties-core.js（CollCore）；3D 檢視在 js/colligative-properties-3d.js（Coll3D）。
 * 畫面上的冰晶、氣泡、分子位置只是示意；溫度、結冰量、蒸發量都直接來自核心的計算。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'tick'：每 0.5 秒 { mode（'f'／'b'）, solvent, solute, w2, running, nucleated, superDepth（K）, boiling, bumped, superMax（K）,
 *            reading（°C）, frozen（0–1）, lost（0–1）, t, seeded }
 *   'measure'：按「記錄結果」CollCore.measure(...) 的內容，再加上
 *            { isX, unkId, revealed, prev:［這一系列之前的紀錄］, line: { n, k, kTh, r2, span }（同一組：同模式、溶劑、溶質、理想與否） }
 *   'answer'：未知物按「對答案」{ M（學生的答案）, Mtrue, err, revealed, measured（這個未知物量過沒有）, via: 最後一筆 X 的紀錄 }
 */
(function () {
  'use strict';
  const C = window.CollCore, LD = window.LabDraw;
  if (!C || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const FONT = LD.FONT;
  const LCD_BG = '#17201f', LCD_FG = '#8ef0c4';
  const SPEEDS = [1, 5, 20, 60];
  const EXAG = 6;   // 微觀示意：溶質粒子放大倍數

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  function signed(x, d) { return (x > 0 ? '+' : '') + num(x, d); }
  function pct(x) { return x == null ? '—' : signed(x * 100, Math.abs(x) < 0.1 ? 1 : 0) + '%'; }
  function parseNum(s) {
    s = String(s || '').normalize('NFKC').replace(/[，,]/g, '.').replace(/[−–—]/g, '-').replace(/\s+/g, '');
    s = s.replace(/[x×]10\^?([-+]?\d+)$/i, 'e$1');
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
  }
  function fH(s) { return s.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>'); }

  // ======================= 名稱 =======================
  function svName(k) { const s = C.SOLVENTS[k]; return T(s.zh, s.en); }
  function soName(k) { if (k === 'none') return T('（純溶劑）', '(pure solvent)'); const s = C.SOLUTES[k]; return T(s.zh, s.en); }
  function soLabelHTML(k) {
    const s = C.SOLUTES[k];
    if (k === 'X') return T('未知物 X', 'Unknown X');
    return T(s.zh, s.en) + '<br><small>' + fH(s.f) + '</small>';
  }

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', field: c.field || '#7b5cd6', dark: dk,
      glass: dk ? '#a9c3cf' : '#7d97a5', steel: dk ? '#b8c0c8' : '#8d969f',
      bath: dk ? '#2f5f86' : '#b9dcf2', ice: dk ? '#dbeefa' : '#f4fbff', hot: dk ? '#ff7a5c' : '#d9462f', cold: dk ? '#6fb0ff' : '#2f78d0',
      liq: {
        water: dk ? '#4f86a8' : '#a9d3ea', benzene: dk ? '#8f8a5c' : '#efe7b8', cyclohexane: dk ? '#6f8790' : '#dce9ee', acetic: dk ? '#7f7a92' : '#e4e0ef'
      },
      mol: { water: '#e0483a', benzene: '#7a7f88', cyclohexane: '#5f8a6a', acetic: '#c28a2c' },
      ion: { Na: '#8e5bd6', Cl: '#2fa84f', Mg: '#e08a1e', SO4: '#d6a51c', glucose: '#e2a33a', sucrose: '#d9733a', urea: '#3a9fd9', naph: '#6a6fd6', benzoic: '#c0457a', X: '#e04d8f' }
    };
  }

  // ======================= 狀態 =======================
  const state = { mode: 'f', sv: 'water', so: 'glucose', speed: 2, tab: 'curve', meth: 'ext', running: false, started: false, view: '2d' };
  let run = null, rows = [], nextRec = 1;
  let records = [], seg = 0, recSeq = 0;
  let unk = null, unkSeq = 0;
  let userActed = false, syncing = false;
  let fx = { seedT: -1, nucT: -1, bumpT: -1, boilT: -1 };   // 視覺效果的開始時間（performance.now）
  let lastPhase = '';
  let view3 = null;
  let kb = null;

  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const el = { w1: $('w1'), w2: $('w2'), Tbath: $('Tbath'), pw: $('pw'), stir: $('stir'), chips: $('chips'), reflux: $('reflux'), ideal: $('ideal') };
  const statusEl = $('status');
  function val(e) { return window.LabNum ? window.LabNum.value(e) : +e.value; }
  function setVal(e, v) { syncing = true; if (window.LabNum) window.LabNum.set(e, v); else e.value = v; syncing = false; }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function acted() { userActed = true; }

  function runOpts() {
    return {
      mode: state.mode, solvent: state.sv, solute: state.so, w1: val(el.w1), w2: val(el.w2), ideal: el.ideal.checked,
      stir: el.stir.checked, chips: el.chips.checked, reflux: el.reflux.checked, Tbath: val(el.Tbath), P: val(el.pw), Troom: 25,
      M: unk ? unk.M : null
    };
  }
  function newRun() {
    run = C.createRun(runOpts());
    rows = [C.sample(run)];
    nextRec = 1;
    state.running = false; state.started = false;
    fx = { seedT: -1, nucT: -1, bumpT: -1, boilT: -1 };
    bubbles.length = 0;
    lastPhase = phaseOf();
    updatePlay();
    $('recOut').innerHTML = '';
  }

  // ======================= 主迴圈（整頁只有這一條 requestAnimationFrame） =======================
  let raf = 0, lastTs = 0, lastRead = 0, phase = 0;
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    const dtw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dtw > 0) {
      if (state.running) advance(dtw * SPEEDS[state.speed]);
      if (!reducedMotion) { phase += dtw; stepBubbles(dtw); }
    }
    const now = performance.now();
    if (now - lastRead > 250) { lastRead = now; updateReadouts(); drawGraph(); }
    let moved = false;
    if (view3 && view3.active) moved = view3.frame(dtw);
    else drawStage();
    const fxOn = now - fx.seedT < 900 || now - fx.nucT < 900 || now - fx.bumpT < 1200 || bubbles.length > 0;
    if (state.running || (!reducedMotion && fxOn) || moved || (view3 && view3.active && !reducedMotion && view3.animating())) raf = requestAnimationFrame(loop);
  }
  function advance(dt) {
    const target = run.t + dt;
    while (run.t < target - 1e-9 && !run.ended) {
      const nx = Math.min(target, nextRec);
      C.step(run, nx - run.t);
      if (run.t >= nextRec - 1e-9) { rows.push(C.sample(run)); nextRec += 1; afterSample(); }
    }
    if (run.ended) {
      if (rows[rows.length - 1][0] < run.t - 0.5) rows.push(C.sample(run));
      state.running = false;
      updatePlay();
      setStatus(run.endReason === 'frozen' ? T('溶劑已經結冰 60%，實驗結束。可以分析、記錄結果。', '60% of the solvent has frozen, so the run is over. You can analyse and record the result.') :
        run.endReason === 'dry' ? T('溶劑已經蒸發掉一半，停止加熱。可以分析、記錄結果。', 'Half of the solvent has boiled away, so the heating stops. You can analyse and record the result.') :
          T('已經記錄 40 分鐘，實驗結束。', 'The run has reached 40 minutes and stops.'));
      if (snd()) window.LabSound.tone({ freq: 440, dur: 0.2, gain: 0.2 });
    }
  }
  function phaseOf() {
    if (!run) return '';
    if (run.ended) return 'end';
    if (run.mode === 'f') return run.nucleated ? 'freezing' : run.T < C.Tf(run) ? 'super' : 'cool';
    return run.boiling ? 'boil' : run.T > C.Tb(run) ? 'superheat' : 'heat';
  }
  function afterSample() {
    const ph = phaseOf();
    if (ph !== lastPhase) {
      if (ph === 'freezing') {
        fx.nucT = performance.now();
        setStatus(run.seeded ? T('晶種讓過冷的液體立刻開始結晶，溫度跳回凝固點附近。', 'The seed crystal starts the supercooled liquid crystallising at once; the temperature jumps back to near the freezing point.') :
          T('過冷了 ' + num(run.superDepth, 2) + ' K 才開始結晶！結晶放熱，溫度很快回升。', 'Crystals finally appear after ' + num(run.superDepth, 2) + ' K of supercooling! Freezing releases heat, so the temperature jumps back up.'));
        if (snd()) { window.LabSound.noise({ dur: 0.12, gain: 0.35, filter: 3200, q: 2 }); window.LabSound.tone({ freq: 1320, dur: 0.12, gain: 0.18, delay: 0.05 }); }
      } else if (ph === 'super' && lastPhase === 'cool') {
        setStatus(T('已經低於凝固點，但還沒結冰——這就是過冷。', 'Below the freezing point but still liquid — this is supercooling.'));
      } else if (ph === 'boil') {
        if (run.bumped) {
          fx.bumpT = performance.now();
          setStatus(T('突沸！過熱了 ' + num(run.superMax, 2) + ' K 的液體一下子劇烈沸騰。', 'Bumping! The liquid, overheated by ' + num(run.superMax, 2) + ' K, boils violently all at once.'));
          if (snd()) { window.LabSound.noise({ dur: 0.35, gain: 0.6, filter: 900, q: 0.8 }); window.LabSound.sweep({ from: 700, to: 300, dur: 0.3 }); }
        } else {
          fx.boilT = performance.now();
          setStatus(T('開始沸騰。', 'Boiling has started.'));
          if (snd()) { window.LabSound.noise({ dur: 0.3, gain: 0.2, filter: 1500, q: 1 }); window.LabSound.tone({ freq: 520, dur: 0.1, gain: 0.15 }); }
        }
      } else if (ph === 'superheat') {
        setStatus(T('已經超過沸點，卻還沒沸騰（沒有沸石）——過熱中，小心！', 'Above the boiling point but not boiling (no boiling chips) — the liquid is overheating. Careful!'));
      }
      lastPhase = ph;
    }
    // 冷浴不夠冷：溫度已經貼近冷浴、卻還沒結晶（不說出溶液的凝固點，免得洩漏答案）
    if (run.mode === 'f' && !run.nucleated && !run.ended && !run.warnedBath && run.T - run.Tbath < 0.4) {
      run.warnedBath = true;
      setStatus(T('溶液已經冷到和冷浴差不多，還是結不了冰：冷浴不夠冷。把冷浴調冷一點、少放一些溶質，或試試「加晶種」。',
        'The solution has cooled almost to the bath temperature and still will not freeze: the bath is not cold enough. Make the bath colder, use less solute, or try “Add a seed crystal”.'));
    }
  }

  // ======================= 氣泡（沸騰的示意） =======================
  const bubbles = [];
  function stepBubbles(dt) {
    for (let k = bubbles.length - 1; k >= 0; k--) {
      const b = bubbles[k];
      b.y -= b.v * dt; b.x += Math.sin(phase * 6 + b.p) * 0.15;
      b.r *= 1 + 0.25 * dt;
      if (b.y < 0) bubbles.splice(k, 1);
    }
    if (!run || run.mode !== 'b' || !run.boiling || run.ended || !state.running) return;
    const now = performance.now();
    const burst = now - fx.bumpT < 600;
    const rate = Math.min(40, 6 + run.rate * 200) * (burst ? 6 : 1);
    let n = rate * dt;
    while (n > 0 && bubbles.length < 160) {
      if (n < 1 && Math.random() > n) break;
      bubbles.push({ x: Math.random() * 2 - 1, y: 1, v: 0.35 + Math.random() * 0.5, r: (burst ? 2.5 : 1.2) + Math.random() * 1.8, p: Math.random() * 6 });
      n -= 1;
    }
  }

  // ======================= 版面 =======================
  let cw = 600, ch = 420, dpr = 1;
  let G = {};
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 560 ? Math.round(Math.max(400, w * 1.12)) : 430;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout();
    resizeGraph();
    drawStage(); drawGraph();
  }
  function layout() {
    const narrow = cw < 560;
    G.narrow = narrow;
    G.appW = narrow ? cw * 0.6 : cw * 0.56;
    G.ax = narrow ? cw * 0.34 : cw * 0.3;
    G.ground = ch - 22;
    G.mr = narrow ? Math.min(cw * 0.2, 82) : Math.min(cw * 0.17, ch * 0.3, 118);
    G.mx = narrow ? cw - G.mr - 10 : cw * 0.78;
    G.my = narrow ? G.mr + 64 : ch * 0.4;
  }

  // ======================= 畫裝置 =======================
  function liquidColor() { return col.liq[state.sv] || col.liq.water; }
  function drawStage() {
    if (!run) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(ctx, cw, ch);
    // 桌面
    const tg = ctx.createLinearGradient(0, G.ground, 0, ch);
    tg.addColorStop(0, LD.alpha(col.muted, col.dark ? 0.22 : 0.16)); tg.addColorStop(1, LD.alpha(col.muted, 0.04));
    ctx.fillStyle = tg; ctx.fillRect(0, G.ground, cw, ch - G.ground);
    ctx.strokeStyle = LD.alpha(col.muted, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, G.ground + 0.5); ctx.lineTo(cw, G.ground + 0.5); ctx.stroke();
    if (run.mode === 'f') drawFreezeRig(); else drawBoilRig();
    drawMicro();
    drawTopInfo();
  }
  function glassPath(path, fillAlpha) {
    ctx.save();
    ctx.fillStyle = LD.alpha(col.glass, fillAlpha == null ? (col.dark ? 0.1 : 0.08) : fillAlpha);
    path(); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = LD.alpha(col.glass, col.dark ? 0.85 : 0.75);
    path(); ctx.stroke();
    ctx.restore();
  }
  function highlight(x, y0, y1, w) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,' + (col.dark ? 0.22 : 0.55) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y0, w, y1 - y0);
  }
  function lcd(x, y, w, h, text, sub) {
    LD.block(ctx, x - 4, y - 4, w + 8, h + 8, col.dark ? '#3b4148' : '#5d6670', { r: 6 });
    ctx.fillStyle = LCD_BG; LD.roundRect(ctx, x, y, w, h, 4); ctx.fill();
    // 字太寬（負號、三位數）就縮小，不可超出螢幕
    let fsz = Math.round(h * 0.56);
    ctx.font = '700 ' + fsz + 'px ui-monospace, Consolas, monospace';
    const tw0 = ctx.measureText(text).width;
    if (tw0 > w - 14) { fsz = Math.max(9, Math.floor(fsz * (w - 14) / tw0)); ctx.font = '700 ' + fsz + 'px ui-monospace, Consolas, monospace'; }
    ctx.fillStyle = LCD_FG;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w - 8, y + h * 0.45);
    if (sub) { ctx.font = '600 ' + Math.max(9, Math.round(h * 0.2)) + 'px ' + FONT; ctx.fillStyle = LD.alpha(LCD_FG, 0.7); ctx.textAlign = 'left'; ctx.fillText(sub, x + 6, y + h - 7); }
  }
  // 決定性的亂數（冰晶位置固定，不會每一幀亂跳）
  function rnd(k) { const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }

  function drawFreezeRig() {
    const ax = G.ax, gy = G.ground;
    const bw = Math.min(G.appW * 0.78, 230), bh = Math.min(ch * 0.5, 230);
    const bx = ax - bw / 2, by = gy - bh;
    LD.contactShadow(ctx, ax, gy, bw * 0.5, 0);
    // 冷浴（燒杯）
    const bathTop = by + bh * 0.18;
    const bathPath = function () { ctx.beginPath(); ctx.moveTo(bx + 3, bathTop); ctx.lineTo(bx + 3, gy - 8); ctx.quadraticCurveTo(bx + 3, gy - 3, bx + 10, gy - 3); ctx.lineTo(bx + bw - 10, gy - 3); ctx.quadraticCurveTo(bx + bw - 3, gy - 3, bx + bw - 3, gy - 8); ctx.lineTo(bx + bw - 3, bathTop); ctx.closePath(); };
    const cold = Math.max(0, Math.min(1, (-run.Tbath + run.sv.Tf) / 25));
    const bg = ctx.createLinearGradient(0, bathTop, 0, gy);
    bg.addColorStop(0, LD.alpha(col.bath, 0.55 + 0.2 * cold)); bg.addColorStop(1, LD.alpha(LD.shade(col.bath, -0.25), 0.8));
    ctx.fillStyle = bg; bathPath(); ctx.fill();
    // 冰塊與鹽粒
    for (let k = 0; k < 9; k++) {
      const x = bx + 14 + rnd(k) * (bw - 40), y = bathTop + 6 + rnd(k + 20) * bh * 0.7;
      if (Math.abs(x + 12 - ax) < bw * 0.2) continue;
      const s = 14 + rnd(k + 40) * 10;
      ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.rotate((rnd(k + 60) - 0.5) * 0.8);
      const ig = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      ig.addColorStop(0, LD.alpha(col.ice, 0.95)); ig.addColorStop(1, LD.alpha(col.ice, 0.45));
      ctx.fillStyle = ig; LD.roundRect(ctx, -s / 2, -s / 2, s, s, 3); ctx.fill();
      ctx.strokeStyle = LD.alpha('#ffffff', 0.7); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = LD.alpha(col.dark ? '#e8eef2' : '#ffffff', 0.85);
    for (let k = 0; k < 40; k++) { const x = bx + 8 + rnd(k + 100) * (bw - 16), y = gy - 8 - rnd(k + 140) * 16; ctx.fillRect(x, y, 2, 2); }
    // 燒杯玻璃
    glassPath(function () { ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(bx, by + 4); ctx.lineTo(bx, gy - 8); ctx.quadraticCurveTo(bx, gy, bx + 8, gy); ctx.lineTo(bx + bw - 8, gy); ctx.quadraticCurveTo(bx + bw, gy, bx + bw, gy - 8); ctx.lineTo(bx + bw, by + 4); ctx.lineTo(bx + bw + 3, by); }, 0);
    highlight(bx + 6, by + 10, gy - 12, 8);
    // 試管
    const tw = Math.max(34, bw * 0.3), tx = ax - tw / 2, ty = by - bh * 0.28, tb = gy - bh * 0.16;
    const vol = run.w1 / run.sv.rho + run.w2 / 1.5;
    const lh = (tb - ty) * (0.3 + 0.45 * Math.min(1, vol / 220));
    const ly = tb - lh;
    const tubePath = function () { ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, tb - tw / 2); ctx.arc(ax, tb - tw / 2, tw / 2, Math.PI, 0, true); ctx.lineTo(tx + tw, ty); };
    // 空氣套管（外管）：讓試管冷得慢而均勻
    const jw = tw + 14, jx = ax - jw / 2, jt = by - 6, jb = tb + 9;
    ctx.fillStyle = LD.alpha(col.bg, col.dark ? 0.55 : 0.65);
    ctx.beginPath(); ctx.moveTo(jx, jt); ctx.lineTo(jx, jb - jw / 2); ctx.arc(ax, jb - jw / 2, jw / 2, Math.PI, 0, true); ctx.lineTo(jx + jw, jt); ctx.closePath(); ctx.fill();
    glassPath(function () { ctx.beginPath(); ctx.moveTo(jx, jt); ctx.lineTo(jx, jb - jw / 2); ctx.arc(ax, jb - jw / 2, jw / 2, Math.PI, 0, true); ctx.lineTo(jx + jw, jt); }, 0);
    // 液體
    ctx.save();
    ctx.beginPath(); ctx.moveTo(tx + 2, ly); ctx.lineTo(tx + 2, tb - tw / 2); ctx.arc(ax, tb - tw / 2, tw / 2 - 2, Math.PI, 0, true); ctx.lineTo(tx + tw - 2, ly); ctx.closePath();
    ctx.clip();
    const lg = ctx.createLinearGradient(tx, 0, tx + tw, 0);
    const lc = liquidColor();
    lg.addColorStop(0, LD.shade(lc, -0.12)); lg.addColorStop(0.45, lc); lg.addColorStop(1, LD.shade(lc, -0.18));
    ctx.fillStyle = lg; ctx.fillRect(tx, ly - 4, tw, tb - ly + 4);
    // 冰晶：沿管壁與底部長出的針狀晶體，數量隨結冰比例
    const ff = C.frozenFrac(run);
    if (run.nucleated) {
      ctx.fillStyle = LD.alpha(col.ice, 0.18 + 0.5 * ff); ctx.fillRect(tx, ly, tw, tb - ly);
      const nCr = Math.round(10 + 140 * Math.min(1, ff / 0.6));
      ctx.lineCap = 'round';
      for (let k = 0; k < nCr; k++) {
        const side = rnd(k * 3 + 1);
        const yy = ly + 4 + rnd(k * 3 + 2) * (tb - ly - 6);
        const x0 = side < 0.5 ? tx + 2 : tx + tw - 2;
        const len = (4 + rnd(k * 3 + 3) * tw * 0.45) * (0.4 + Math.min(1, ff / 0.4));
        const ang = (side < 0.5 ? 0 : Math.PI) + (rnd(k + 500) - 0.5) * 1.2;
        ctx.strokeStyle = LD.alpha(col.ice, 0.9); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + Math.cos(ang) * len, yy + Math.sin(ang) * len); ctx.stroke();
        ctx.strokeStyle = LD.alpha('#ffffff', 0.6); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x0 + Math.cos(ang) * len * 0.5, yy + Math.sin(ang) * len * 0.5); ctx.lineTo(x0 + Math.cos(ang) * len * 0.5 + Math.cos(ang - 0.9) * len * 0.3, yy + Math.sin(ang) * len * 0.5 + Math.sin(ang - 0.9) * len * 0.3); ctx.stroke();
      }
      const u = (performance.now() - fx.nucT) / 900;
      if (u >= 0 && u < 1 && !reducedMotion) { ctx.fillStyle = LD.alpha('#ffffff', 0.5 * (1 - u)); ctx.fillRect(tx, ly, tw, tb - ly); }
    }
    ctx.restore();
    // 液面彎月面
    ctx.strokeStyle = LD.alpha(LD.shade(lc, -0.35), 0.8); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(tx + 2, ly - 3); ctx.quadraticCurveTo(ax, ly + 3, tx + tw - 2, ly - 3); ctx.stroke();
    glassPath(tubePath);
    highlight(tx + 4, ty + 6, tb - tw / 2, 5);
    // 攪拌棒（環狀），攪拌時上下移動
    const sy = ly + (tb - ly) * 0.55 + (run.stir && state.running && !reducedMotion ? Math.sin(phase * 7) * (tb - ly) * 0.18 : 0);
    ctx.strokeStyle = col.steel; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx + tw * 0.78, ty - 26); ctx.lineTo(tx + tw * 0.78, sy); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ax, sy, tw * 0.36, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
    // 溫度計探針
    LD.tube(ctx, function (c) { c.moveTo(ax - 3, ty - 34); c.lineTo(ax - 3, tb - tw * 0.55); }, col.steel, 4);
    ctx.strokeStyle = LD.alpha(col.muted, 0.8); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax - 3, ty - 34); ctx.quadraticCurveTo(ax - 3, ty - 60, ax - 40, ty - 62); ctx.stroke();
    // 晶種掉落
    const su = (performance.now() - fx.seedT) / 600;
    if (su >= 0 && su < 1 && !reducedMotion) { ctx.fillStyle = col.ice; ctx.strokeStyle = col.accent; ctx.lineWidth = 1; const yy = ty - 30 + (ly - ty + 30) * su; ctx.beginPath(); ctx.moveTo(ax + 8, yy - 4); ctx.lineTo(ax + 12, yy); ctx.lineTo(ax + 8, yy + 4); ctx.lineTo(ax + 4, yy); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    // 標籤
    LD.pill(ctx, T('冷浴 ', 'Bath ') + num(run.Tbath, 1) + ' °C', bx + bw - 4, gy - 8, col.cold, 'right');
    G.lcd = { x: Math.max(6, ax - 40 - 118), y: ty - 84 };
  }

  function drawBoilRig() {
    const ax = G.ax, gy = G.ground;
    // 加熱板
    const pw = Math.min(G.appW * 0.7, 190), ph = 34, px = ax - pw / 2, py = gy - ph;
    LD.contactShadow(ctx, ax, gy, pw * 0.5, 0);
    LD.block(ctx, px, py, pw, ph, col.dark ? '#59606a' : '#d4d9de', { r: 6 });
    const heat = state.running && !run.ended ? run.P / 200 : 0;
    const pg = ctx.createLinearGradient(0, py - 6, 0, py + 2);
    pg.addColorStop(0, LD.mix(col.dark ? '#6b7178' : '#9aa2aa', col.hot, heat)); pg.addColorStop(1, LD.mix(col.dark ? '#3d4248' : '#7a838c', col.hot, heat * 0.7));
    ctx.fillStyle = pg; LD.roundRect(ctx, px + 10, py - 6, pw - 20, 8, 3); ctx.fill();
    if (heat > 0) { const gg = ctx.createRadialGradient(ax, py - 2, 4, ax, py - 2, pw * 0.5); gg.addColorStop(0, LD.alpha(col.hot, 0.35 * heat)); gg.addColorStop(1, LD.alpha(col.hot, 0)); ctx.fillStyle = gg; ctx.fillRect(px, py - 50, pw, 50); }
    LD.ball(ctx, px + pw - 20, py + ph / 2, 7, col.dark ? '#2e3338' : '#59616a', { shadow: false });
    ctx.fillStyle = col.hot; ctx.beginPath(); ctx.arc(px + 18, py + ph / 2, 3.5, 0, Math.PI * 2); ctx.globalAlpha = heat > 0 ? 1 : 0.25; ctx.fill(); ctx.globalAlpha = 1;
    LD.pill(ctx, num(run.P, 0) + ' W', px + pw - 34, py + ph - 6, col.text, 'right');
    // 圓底燒瓶
    const R = Math.min(pw * 0.42, ch * 0.17, 74);
    const fy = py - 8 - R * 0.95, nw = R * 0.36, ntop = fy - R * 1.95;
    const ang = Math.asin(nw / 2 / R);
    // 左頸→球→右頸
    const flaskPath2 = function () {
      ctx.beginPath(); ctx.moveTo(ax - nw / 2, ntop); ctx.lineTo(ax - nw / 2, fy - R * Math.cos(ang));
      ctx.arc(ax, fy, R, -Math.PI / 2 - ang, -Math.PI / 2 + ang, true);
      ctx.lineTo(ax + nw / 2, ntop);
    };
    // 液體：體積比例（示意）決定液面
    const vol = run.ws / run.sv.rho + run.w2 / 1.5;
    const frac = Math.max(0.12, Math.min(0.78, 0.18 + 0.55 * vol / 220));
    let lo = -R, hi = R;
    const area = function (h) { const d = R - h; return R * R * Math.acos(d / R) - d * Math.sqrt(Math.max(0, R * R - d * d)); };   // 液深 h 的弓形面積
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (area(mid + R) / (Math.PI * R * R) < frac) lo = mid; else hi = mid; }
    const depth = (lo + hi) / 2 + R, ly = fy + R - depth;
    const shake = (now) => (now - fx.bumpT < 600 && !reducedMotion) ? Math.sin(now / 25) * 3 : 0;
    const lyS = ly + shake(performance.now());
    ctx.save();
    ctx.beginPath(); ctx.arc(ax, fy, R - 2, 0, Math.PI * 2); ctx.clip();
    const lc = liquidColor();
    const lg = ctx.createRadialGradient(ax - R * 0.3, lyS + depth * 0.3, 2, ax, fy, R);
    lg.addColorStop(0, LD.shade(lc, 0.15)); lg.addColorStop(1, LD.shade(lc, -0.2));
    ctx.fillStyle = lg; ctx.fillRect(ax - R, lyS, 2 * R, fy + R - lyS);
    // 沸石
    if (run.chips) for (let k = 0; k < 4; k++) { const x = ax - R * 0.3 + k * R * 0.18, y = fy + R * 0.86 - (k % 2) * 3; LD.ball(ctx, x, y, 3.2, col.dark ? '#8a8f96' : '#6e747b', { shadow: false }); }
    // 氣泡
    bubbles.forEach(function (b) {
      const x = ax + b.x * R * 0.55, y = lyS + (fy + R * 0.9 - lyS) * b.y;
      if (y < lyS + 2) return;
      ctx.strokeStyle = LD.alpha('#ffffff', 0.85); ctx.lineWidth = 1;
      ctx.fillStyle = LD.alpha('#ffffff', 0.25);
      ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    ctx.restore();
    ctx.strokeStyle = LD.alpha(LD.shade(lc, -0.35), 0.8); ctx.lineWidth = 1.4;
    const half = Math.sqrt(Math.max(0, R * R - (lyS - fy) * (lyS - fy))) - 2;
    ctx.beginPath(); ctx.moveTo(ax - half, lyS); ctx.lineTo(ax + half, lyS); ctx.stroke();
    glassPath(flaskPath2);
    const hg = ctx.createRadialGradient(ax - R * 0.45, fy - R * 0.4, 1, ax - R * 0.45, fy - R * 0.4, R * 0.5);
    hg.addColorStop(0, 'rgba(255,255,255,' + (col.dark ? 0.25 : 0.6) + ')'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(ax, fy, R - 2, 0, Math.PI * 2); ctx.fill();
    // 回流冷凝管或蒸氣
    if (run.reflux) {
      const cw2 = nw * 1.7, cx0 = ax - cw2 / 2, ct = ntop - Math.min(ch * 0.3, 130), cb = ntop + 6;
      // 冷凝管外套（半透明玻璃，裡面流著冷卻水）
      const jg = ctx.createLinearGradient(cx0, 0, cx0 + cw2, 0);
      const ja = col.dark ? 0.32 : 0.22;
      jg.addColorStop(0, LD.alpha(col.cold, ja * 1.5)); jg.addColorStop(0.35, LD.alpha(col.cold, ja * 0.7)); jg.addColorStop(1, LD.alpha(col.cold, ja * 1.7));
      ctx.fillStyle = jg; LD.roundRect(ctx, cx0, ct, cw2, cb - ct, 8); ctx.fill();
      ctx.strokeStyle = LD.alpha(col.glass, 0.85); ctx.lineWidth = 1.2; LD.roundRect(ctx, cx0 + 0.5, ct + 0.5, cw2 - 1, cb - ct - 1, 8); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + (col.dark ? 0.12 : 0.4) + ')'; ctx.fillRect(cx0 + 3, ct + 8, 3, cb - ct - 16);
      glassPath(function () { ctx.beginPath(); ctx.rect(ax - nw * 0.28, ct - 14, nw * 0.56, cb - ct + 14); }, 0.05);
      ctx.strokeStyle = LD.alpha(col.cold, 0.8); ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx0 + cw2, cb - 16); ctx.lineTo(cx0 + cw2 + 18, cb - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx0, ct + 16); ctx.lineTo(cx0 - 18, ct + 10); ctx.stroke();
      if (run.boiling && state.running && !reducedMotion) {
        for (let k = 0; k < 3; k++) { const u = (phase * 0.8 + k / 3) % 1; ctx.fillStyle = LD.alpha(lc, 0.9); ctx.beginPath(); ctx.arc(ax + 1, ct + (ntop - ct) * u, 2, 0, Math.PI * 2); ctx.fill(); }
      }
      LD.pill(ctx, T('回流冷凝管', 'Reflux condenser'), cx0 + cw2 + 6, ct + 22, col.cold, 'left');
    } else if (run.boiling && !run.ended) {
      for (let k = 0; k < 6; k++) {
        const u = ((reducedMotion ? 0.3 : phase * 0.5) + k / 6) % 1;
        ctx.fillStyle = LD.alpha(col.dark ? '#e8eef2' : '#9aa7b2', 0.35 * (1 - u));
        ctx.beginPath(); ctx.arc(ax + Math.sin(k * 2 + phase) * 8 * u, ntop - u * 70, 5 + 10 * u, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 溫度計探針
    LD.tube(ctx, function (c) { c.moveTo(ax + 2, ntop - 40); c.lineTo(ax + 2, Math.max(lyS + 8, fy + R * 0.35)); }, col.steel, 4);
    ctx.strokeStyle = LD.alpha(col.muted, 0.8); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax + 2, ntop - 40); ctx.quadraticCurveTo(ax + 2, ntop - 60, ax - 40, ntop - 62); ctx.stroke();
    if (run.chips === false) LD.pill(ctx, T('沒有沸石', 'No boiling chips'), ax, fy + R + 4, col.pos, 'center');
    G.lcd = { x: Math.max(6, ax - 40 - 118), y: (run.reflux ? ntop - Math.min(ch * 0.3, 130) : ntop - 84) };
  }

  // 頂端：溫度計液晶與狀態
  function drawTopInfo() {
    const L = G.lcd || { x: 10, y: 10 };
    const x = Math.max(8, L.x), y = Math.max(8, Math.min(L.y, ch - 100));
    lcd(x, y, 118, 46, num(C.reading(run), 2) + ' °C', T('溫度計', 'Thermometer'));
    const ph = phaseOf();
    const lab = {
      cool: T('液體冷卻中', 'Liquid cooling'), super: T('過冷（低於凝固點，還沒結冰）', 'Supercooled (below the freezing point, no crystals yet)'),
      freezing: T('結晶中（固液共存）', 'Freezing (solid and liquid together)'), heat: T('加熱中', 'Heating'),
      superheat: T('過熱（超過沸點，還沒沸騰）', 'Overheated (above the boiling point, not boiling)'), boil: T('沸騰中', 'Boiling'), end: T('實驗結束', 'Run finished')
    }[ph];
    const pc = ph === 'super' || ph === 'superheat' ? col.pos : ph === 'freezing' ? col.cold : ph === 'boil' ? col.hot : col.muted;
    // 標籤不可壓到右邊的微觀圓：放不下就去掉括號裡的說明，再不行就縮小字
    const avail = (G.mx - G.mr) - 10 - 16;
    let txt = lab, fz = 12;
    ctx.font = '600 12px ' + FONT;
    if (ctx.measureText(txt).width + 12 > avail) txt = txt.replace(/\s*[（(].*$/, '');
    while (fz > 10 && (ctx.font = '600 ' + fz + 'px ' + FONT, ctx.measureText(txt).width + 12 > avail)) fz -= 0.5;
    LD.pill(ctx, txt, 10, ch - 30 > y + 80 ? y + 76 : y + 72, pc, 'left', '600 ' + fz + 'px ' + FONT);
    if (!state.started) {
      LD.pill(ctx, T('按「開始」', 'Press “Start”'), G.mx, G.my + G.mr + 58, col.accent, 'center');
    }
  }

  // ======================= 微觀示意 =======================
  function drawMicro() {
    const mx = G.mx, my = G.my, r = G.mr;
    ctx.save();
    ctx.shadowColor = LD.shadowInk(0.25); ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    ctx.fillStyle = col.bg; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, r - 1, 0, Math.PI * 2); ctx.clip();
    const f = run.mode === 'f';
    const lc = liquidColor();
    const surf = my - r * 0.25;    // 沸騰：液面；凝固：固液界面在下方
    const vg = ctx.createLinearGradient(0, my - r, 0, my + r);
    vg.addColorStop(0, LD.alpha(lc, 0.12)); vg.addColorStop(1, LD.alpha(lc, 0.5));
    ctx.fillStyle = f ? LD.alpha(lc, 0.38) : LD.alpha(col.muted, 0.06); ctx.fillRect(mx - r, my - r, 2 * r, 2 * r);
    const dm = Math.max(3, r * 0.06);   // 分子半徑
    const sp = dm * 2.35;
    const jig = reducedMotion ? 0 : 1;
    // 溶質粒子比例（粒子數），放大 EXAG 倍
    const x1 = C.solventMoleFrac(run), x2 = Math.min(0.4, (1 - x1) * EXAG);
    const soKey = run.w2 > 0 ? run.solute : null;
    function solutePart(k) {
      if (!soKey) return null;
      const so = C.SOLUTES[soKey];
      if (so.ions && !run.ideal) {
        // 真實 i：一部分離子配對（靠在一起）
        return { ions: so.ions, pair: rnd(k + 900) < (so.ions.length - run.i) / Math.max(1, so.ions.length - 1) };
      }
      if (so.ions) return { ions: so.ions, pair: false };
      return { mol: soKey, dimer: !!so.dimer && !run.ideal };
    }
    function drawSolute(x, y, s) {
      if (s.mol) {
        const c = col.ion[s.mol] || col.ion.X;
        if (s.dimer) { LD.ball(ctx, x - dm * 0.7, y, dm * 1.15, c, { shadow: false }); LD.ball(ctx, x + dm * 0.7, y, dm * 1.15, c, { shadow: false }); ctx.strokeStyle = LD.alpha(col.text, 0.6); ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x - dm * 0.2, y); ctx.lineTo(x + dm * 0.2, y); ctx.stroke(); ctx.setLineDash([]); }
        else LD.ball(ctx, x, y, dm * 1.35, c, { shadow: false });
      } else {
        const a = col.ion[s.ions[0]], b = col.ion[s.ions[1]];
        LD.ball(ctx, x, y, dm * 1.0, a, { shadow: false });
        if (s.pair) LD.ball(ctx, x + dm * 1.7, y + dm * 0.3, dm * 1.25, b, { shadow: false });
      }
    }
    if (f) {
      // 底部是晶體（只有溶劑分子，排列整齊），上方是溶液
      const ff = C.frozenFrac(run);
      const crH = run.nucleated ? r * (0.22 + 1.1 * ff) : 0;
      const top = my + r - crH;
      if (crH > 0) {
        ctx.fillStyle = LD.alpha(col.ice, col.dark ? 0.25 : 0.6); ctx.fillRect(mx - r, top, 2 * r, crH);
        for (let row = 0; top + row * sp * 0.86 < my + r; row++) {
          for (let c2 = -12; c2 <= 12; c2++) {
            const x = mx + c2 * sp + (row % 2 ? sp / 2 : 0), y = top + dm + row * sp * 0.86;
            LD.ball(ctx, x, y, dm, col.mol[state.sv], { shadow: false });
          }
        }
        ctx.strokeStyle = LD.alpha(col.cold, 0.7); ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(mx - r, top); ctx.lineTo(mx + r, top); ctx.stroke(); ctx.setLineDash([]);
      }
      // 溶液：溶劑分子與溶質粒子（溶質數目不變，所以結冰越多看起來越擠）
      const slots = [];
      for (let row = 0; my - r + dm + row * sp < top - dm; row++) for (let c2 = -12; c2 <= 12; c2++) slots.push([mx + c2 * sp + (row % 2 ? sp / 2 : 0), my - r + dm + row * sp]);
      slots.forEach(function (p, idx) {
        const isS = soKey && rnd(idx + 300) < x2;   // x2 用還是液體的溶劑算，結冰越多越擠
        const jx = jig * Math.sin(phase * 5 + idx) * dm * 0.35, jy = jig * Math.cos(phase * 4.3 + idx * 1.7) * dm * 0.35;
        if (isS) drawSolute(p[0] + jx, p[1] + jy, solutePart(idx)); else LD.ball(ctx, p[0] + jx, p[1] + jy, dm, col.mol[state.sv], { shadow: false });
      });
    } else {
      // 液面以下：溶液；以上：蒸氣（數目 ∝ x溶劑·P°(T)）
      ctx.fillStyle = LD.alpha(lc, 0.45); ctx.fillRect(mx - r, surf, 2 * r, my + r - surf);
      const slots = [];
      for (let row = 0; surf + dm + row * sp < my + r; row++) for (let c2 = -12; c2 <= 12; c2++) slots.push([mx + c2 * sp + (row % 2 ? sp / 2 : 0), surf + dm + 1 + row * sp]);
      slots.forEach(function (p, idx) {
        const isS = soKey && rnd(idx + 300) < x2;
        const jx = jig * Math.sin(phase * 6 + idx) * dm * 0.4, jy = jig * Math.cos(phase * 5.1 + idx * 1.7) * dm * 0.4;
        if (isS) drawSolute(p[0] + jx, p[1] + jy, solutePart(idx)); else LD.ball(ctx, p[0] + jx, p[1] + jy, dm, col.mol[state.sv], { shadow: false });
      });
      const P = x1 * C.vaporP(state.sv, run.T);
      const nv = Math.round(Math.min(26, 22 * P / 101.325));
      for (let k = 0; k < nv; k++) {
        const u = (rnd(k + 700) + (reducedMotion ? 0 : phase * (0.08 + 0.05 * rnd(k + 800)))) % 1;
        const x = mx - r + 2 * r * rnd(k + 750) + jig * Math.sin(phase * 2 + k) * 6;
        const y = surf - 6 - (surf - my + r - 6) * (k % 2 ? u : 1 - u);
        LD.ball(ctx, x, y, dm, col.mol[state.sv], { shadow: false });
      }
      ctx.strokeStyle = LD.alpha(LD.shade(lc, -0.4), 0.9); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(mx - r, surf); ctx.lineTo(mx + r, surf); ctx.stroke();
      LD.pill(ctx, 'P = ' + sigf(P, 3) + ' kPa', mx, my - r * 0.52, P >= 101.3 ? col.hot : col.text, 'center');
    }
    ctx.restore();
    ctx.strokeStyle = LD.alpha(col.muted, 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
    LD.haloText(ctx, T('微觀示意', 'Molecular view'), mx, my + r + 15, col.muted, 'center', 'alphabetic', '600 12px ' + FONT);
    LD.haloText(ctx, T('溶質放大 ×' + EXAG + '，不依比例', 'solute ×' + EXAG + ', not to scale'), mx, my + r + 30, col.muted, 'center', 'alphabetic', '11px ' + FONT);
  }

  // ======================= 圖表 =======================
  let gw = 600, gh = 320;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w; gh = w < 560 ? 300 : 320;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function axes(g, x0, y0, x1, y1, xa, xb, ya, yb, xl, yl) {
    const X = function (v) { return x0 + (v - xa) / (xb - xa) * (x1 - x0); };
    const Y = function (v) { return y1 - (v - ya) / (yb - ya) * (y1 - y0); };
    g.font = '11px ' + FONT; g.fillStyle = col.muted; g.strokeStyle = LD.alpha(col.muted, 0.14); g.lineWidth = 1;
    const sx = niceStep(xb - xa, gw < 500 ? 4 : 7), sy = niceStep(yb - ya, 5);
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let v = Math.ceil(xa / sx) * sx; v <= xb + 1e-9; v += sx) { const x = Math.round(X(v)) + 0.5; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.fillText(num(v, sx < 1 ? 1 : 0), x, y1 + 4); }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    const dy = sy < 0.1 ? 2 : sy < 1 ? 1 : 0;
    for (let v = Math.ceil(ya / sy) * sy; v <= yb + 1e-9; v += sy) { const y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.fillText(num(v, dy), x0 - 4, y); }
    g.strokeStyle = LD.alpha(col.muted, 0.6); g.beginPath(); g.moveTo(x0 + 0.5, y0); g.lineTo(x0 + 0.5, y1 + 0.5); g.lineTo(x1, y1 + 0.5); g.stroke();
    g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(xl, x1, y1 + 30);
    g.save(); g.translate(12, (y0 + y1) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(yl, 0, -2); g.restore();
    return { X: X, Y: Y };
  }
  function analysis() { return run ? C.analyze(rows, run, state.meth) : null; }
  function drawGraph() {
    if (!run) return;
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col.bg; g.fillRect(0, 0, gw, gh);
    if (state.tab === 'curve') drawCurve(g); else drawLine(g);
  }
  function drawCurve(g) {
    const x0 = 52, y0 = 14, x1 = gw - 12, y1 = gh - 36;
    const th = C.theory(run);
    const lastT = rows[rows.length - 1][0];
    const xb = Math.max(120, Math.ceil(lastT / 60) * 60);
    let lo = Infinity, hi = -Infinity;
    rows.forEach(function (r) { lo = Math.min(lo, r[1]); hi = Math.max(hi, r[1]); });
    lo = Math.min(lo, th.T0); hi = Math.max(hi, th.T0);
    // 只放大到相變附近（看得到細節），但整條曲線都在框內
    const pad = Math.max(0.3, (hi - lo) * 0.06);
    const A = axes(g, x0, y0, x1, y1, 0, xb, lo - pad, hi + pad, T('時間 t（s）', 'time t (s)'), T('溫度（°C）', 'temperature (°C)'));
    // 純溶劑的凝固點／沸點
    const yT0 = A.Y(th.T0);
    g.strokeStyle = LD.alpha(col.muted, 0.8); g.setLineDash([5, 4]); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x0, yT0); g.lineTo(x1, yT0); g.stroke(); g.setLineDash([]);
    LD.pill(g, (run.mode === 'f' ? T('純溶劑凝固點 ', 'pure solvent f.p. ') : T('純溶劑沸點 ', 'pure solvent b.p. ')) + num(th.T0, 1) + ' °C', x1 - 4, run.mode === 'f' ? yT0 - 3 : yT0 + 18, col.muted, 'right');
    // 曲線
    g.strokeStyle = run.mode === 'f' ? col.cold : col.hot; g.lineWidth = 2.2; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    rows.forEach(function (r, k) { const x = A.X(r[0]), y = A.Y(r[1]); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    // 分析
    const An = C.analyze(rows, run, state.meth);
    if (An.tOnset != null) {
      const yy = A.Y(rows.reduce(function (a, r) { return Math.abs(r[0] - An.tOnset) < Math.abs(a[0] - An.tOnset) ? r : a; })[1]);
      g.fillStyle = col.accent; g.beginPath(); g.arc(A.X(An.tOnset), yy, 3.5, 0, Math.PI * 2); g.fill();
    }
    if (state.meth === 'raw' && An.ok) {
      g.strokeStyle = col.accent; g.lineWidth = 2; g.beginPath(); g.arc(A.X(An.tTurn), A.Y(An.Tturn), 6, 0, Math.PI * 2); g.stroke();
      LD.pill(g, num(An.Tturn, 2) + ' °C', A.X(An.tTurn) + 8, A.Y(An.Tturn) + (run.mode === 'f' ? -8 : 24), col.accent, 'left');
    }
    if (An.line) {
      const L = An.line, tc = An.tCross == null ? L.t0 : An.tCross;
      g.strokeStyle = col.accent; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(A.X(L.t0), A.Y(L.a + L.b * L.t0)); g.lineTo(A.X(L.t1), A.Y(L.a + L.b * L.t1)); g.stroke();
      if (state.meth === 'ext') {
        g.setLineDash([5, 4]); g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(A.X(tc - 20), A.Y(L.a + L.b * (tc - 20))); g.lineTo(A.X(L.t0), A.Y(L.a + L.b * L.t0)); g.stroke(); g.setLineDash([]);
        const xc = A.X(tc), yc = A.Y(An.Text);
        g.fillStyle = col.accent; g.beginPath(); g.moveTo(xc, yc - 6); g.lineTo(xc + 6, yc); g.lineTo(xc, yc + 6); g.lineTo(xc - 6, yc); g.closePath(); g.fill();
        LD.pill(g, T('外插 ', 'extrap. ') + num(An.Text, 2) + ' °C', xc - 8, yc + (run.mode === 'f' ? -9 : 26), col.accent, 'right');
      }
    }
    drawInset(g, A, An, th, x0, y0, x1, y1);
    $('gLegend').innerHTML = '<span><i class="ln" style="background:' + (run.mode === 'f' ? col.cold : col.hot) + '"></i>' + T('溫度計讀數', 'thermometer reading') + '</span> <span style="color:' + col.muted + '"><i class="ln dash"></i>' + T('純溶劑', 'pure solvent') + '</span> <span style="color:' + col.accent + '"><i class="ln" style="background:' + col.accent + '"></i>' + (state.meth === 'ext' ? T('擬合直線與外插', 'fitted line and extrapolation') : T('直接讀的點', 'direct reading')) + '</span>';
    $('gHint').innerHTML = run.mode === 'f' ? T('凝固：過冷的低谷之後溫度跳回來。純溶劑是水平的平台；溶液的凝固線往下斜，往回延伸到與冷卻曲線相交的地方，就是溶液的凝固點。', 'Freezing: after the supercooling dip the temperature jumps back. A pure solvent gives a flat plateau; a solution’s freezing line slopes down — extend it back to where it meets the cooling curve to find the freezing point.') :
      T('沸騰：有回流冷凝管時溫度保持水平；沒有回流時溶劑蒸發、溶液變濃，沸點慢慢上升。', 'Boiling: with a reflux condenser the temperature stays level; without one the solvent boils away, the solution gets more concentrated and the boiling point creeps up.');
  }
  // 溫度—時間圖的放大小圖：整段 40 分鐘擠在一起時，過冷的低谷、平台與外插看不清楚
  function drawInset(g, A, An, th, x0, y0, x1, y1) {
    if (An.tOnset == null || x1 - x0 < 240) return;
    const L = An.line, ext = state.meth === 'ext' && L;
    const tc = ext ? (An.tCross == null ? L.t0 : An.tCross) : An.tOnset;
    const lastT = rows[rows.length - 1][0];
    const ta = Math.max(0, Math.min(An.tOnset, tc) - 45);
    let tb = Math.min(lastT, Math.max(An.tOnset, L ? L.t1 : An.tOnset) + 45);
    if (tb - ta < 60) tb = ta + 60;
    let lo = Infinity, hi = -Infinity;
    // 縱軸只看轉折之後（含過冷的谷底、過熱的峰）與純溶劑的線；之前的冷卻／加熱斜坡會被裁掉
    rows.forEach(function (r) { if (r[0] >= An.tOnset - 5 && r[0] <= tb) { lo = Math.min(lo, r[1]); hi = Math.max(hi, r[1]); } });
    if (!isFinite(lo)) return;
    lo = Math.min(lo, th.T0); hi = Math.max(hi, th.T0);
    if (ext && An.Text != null) { lo = Math.min(lo, An.Text); hi = Math.max(hi, An.Text); }
    const span = Math.max(0.3, hi - lo), pad = span * 0.22;
    const ya = lo - pad, yb = hi + pad;
    const w = Math.min(280, (x1 - x0) * 0.44), h = Math.min(140, (y1 - y0) * 0.55);
    const bx = x1 - w - 8, by = run.mode === 'f' ? y0 + 8 : y1 - h - 8;
    // 主圖上標出放大的範圍
    const rx0 = A.X(ta), rx1 = A.X(tb), ry0 = A.Y(yb), ry1 = A.Y(ya);
    g.strokeStyle = LD.alpha(col.accent, 0.7); g.lineWidth = 1; g.setLineDash([3, 3]);
    g.strokeRect(rx0, ry0, Math.max(3, rx1 - rx0), Math.max(3, ry1 - ry0)); g.setLineDash([]);
    // 小圖底框
    g.save();
    g.shadowColor = LD.alpha('#000000', col.dark ? 0.5 : 0.18); g.shadowBlur = 8; g.shadowOffsetY = 2;
    g.fillStyle = col.surface || col.bg; LD.roundRect(g, bx, by, w, h, 8); g.fill();
    g.restore();
    g.strokeStyle = LD.alpha(col.accent, 0.55); g.lineWidth = 1; LD.roundRect(g, bx + 0.5, by + 0.5, w - 1, h - 1, 8); g.stroke();
    const ix0 = bx + 40, ix1 = bx + w - 8, iy0 = by + 22, iy1 = by + h - 18;
    const X = function (v) { return ix0 + (v - ta) / (tb - ta) * (ix1 - ix0); };
    const Y = function (v) { return iy1 - (v - ya) / (yb - ya) * (iy1 - iy0); };
    g.font = '600 11px ' + FONT; g.fillStyle = col.muted; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(T('放大：轉折附近', 'Zoom: near the transition'), bx + 8, by + 15);
    // 縱軸刻度
    const st = niceStep(yb - ya, 3);
    g.font = '10px ' + FONT; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.strokeStyle = LD.alpha(col.muted, 0.14);
    for (let v = Math.ceil(ya / st) * st; v <= yb + 1e-9; v += st) {
      const y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(ix0, y); g.lineTo(ix1, y); g.stroke();
      g.fillText(num(v, st < 0.1 ? 2 : 1), ix0 - 4, y);
    }
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(num(ta, 0) + ' s', ix0, iy1 + 3); g.fillText(num(tb, 0) + ' s', ix1, iy1 + 3);
    g.save();
    g.beginPath(); g.rect(ix0, iy0 - 2, ix1 - ix0, iy1 - iy0 + 4); g.clip();
    // 純溶劑的凝固點／沸點
    if (th.T0 > ya && th.T0 < yb) {
      g.strokeStyle = LD.alpha(col.muted, 0.8); g.setLineDash([5, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(ix0, Y(th.T0)); g.lineTo(ix1, Y(th.T0)); g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = run.mode === 'f' ? col.cold : col.hot; g.lineWidth = 2; g.lineJoin = 'round';
    g.beginPath(); let first = true;
    rows.forEach(function (r) { if (r[0] < ta - 1 || r[0] > tb + 1) return; const x = X(r[0]), y = Y(r[1]); if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y); });
    g.stroke();
    if (state.meth === 'raw' && An.ok) {
      g.strokeStyle = col.accent; g.lineWidth = 2; g.beginPath(); g.arc(X(An.tTurn), Y(An.Tturn), 5, 0, Math.PI * 2); g.stroke();
    }
    if (L) {
      g.strokeStyle = col.accent; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(X(L.t0), Y(L.a + L.b * L.t0)); g.lineTo(X(Math.min(L.t1, tb)), Y(L.a + L.b * Math.min(L.t1, tb))); g.stroke();
      if (ext) {
        g.setLineDash([4, 3]); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(X(tc - 10), Y(L.a + L.b * (tc - 10))); g.lineTo(X(L.t0), Y(L.a + L.b * L.t0)); g.stroke(); g.setLineDash([]);
        const xc = X(tc), yc = Y(An.Text);
        g.fillStyle = col.accent; g.beginPath(); g.moveTo(xc, yc - 5); g.lineTo(xc + 5, yc); g.lineTo(xc, yc + 5); g.lineTo(xc - 5, yc); g.closePath(); g.fill();
      }
    }
    g.restore();
  }
  // ΔT—m 圖
  const GROUP_COLS = function () { return [col.accent, col.pos, col.probe, col.field, col.neg, col.hot, col.muted]; };
  function groupKey(r) { return r.mode + '|' + r.solvent + '|' + r.solute + '|' + (r.ideal ? 1 : 0); }
  function visibleRecs() { return records.filter(function (r) { return r.seg === seg && r.solute !== 'none' && (!r.isX || (unk && r.unkId === unk.id && unk.revealed) || r.revealed); }); }
  function drawLine(g) {
    const x0 = 52, y0 = 14, x1 = gw - 12, y1 = gh - 36;
    const recs = visibleRecs();
    let mmax = 0.5, dmax = 1;
    recs.forEach(function (r) { mmax = Math.max(mmax, r.m * 1.1); dmax = Math.max(dmax, r.dT * 1.15, r.dTth * 1.1); });
    const A = axes(g, x0, y0, x1, y1, 0, mmax, 0, dmax, T('重量莫耳濃度 m（mol/kg）', 'molality m (mol/kg)'), 'ΔT（K）');
    const groups = {}, order = [];
    recs.forEach(function (r) { const k = groupKey(r); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); });
    const cols = GROUP_COLS();
    let leg = '';
    order.forEach(function (k, gi) {
      const c = cols[gi % cols.length], rs = groups[k];
      const kTh = rs[0].i * rs[0].K;
      g.strokeStyle = LD.alpha(c, 0.7); g.setLineDash([5, 4]); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(A.X(0), A.Y(0)); const xe = Math.min(mmax, dmax / kTh); g.lineTo(A.X(xe), A.Y(kTh * xe)); g.stroke(); g.setLineDash([]);
      const fit = C.fitOrigin(rs.map(function (r) { return [r.m, r.dT]; }));
      if (fit && rs.length >= 2) { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(A.X(0), A.Y(0)); const xf = Math.min(mmax, dmax / fit.k); g.lineTo(A.X(xf), A.Y(fit.k * xf)); g.stroke(); }
      rs.forEach(function (r) { LD.ball(g, A.X(r.m), A.Y(r.dT), 4.5, c, { shadow: false }); });
      leg += '<span style="color:' + c + '"><i class="sp" style="background:' + c + '"></i>' + (rs[0].mode === 'f' ? 'ΔT<sub>f</sub>' : 'ΔT<sub>b</sub>') + '・' + svName(rs[0].solvent) + '・' + soName(rs[0].solute) +
        (fit && rs.length >= 2 ? T('，斜率 ', ', slope ') + sigf(fit.k, 3) : '') + T('（理論 ', ' (theory ') + sigf(kTh, 3) + T('）', ')') + '</span> ';
    });
    if (!order.length) {
      LD.haloText(g, T('按「記錄結果」把測量加進來', 'Press “Record result” to add measurements'), (x0 + x1) / 2, (y0 + y1) / 2, col.muted, 'center', 'middle', '13px ' + FONT);
    }
    $('gLegend').innerHTML = leg;
    $('gHint').innerHTML = T('每一組（同模式、溶劑、溶質）畫一條過原點的擬合直線（實線），虛線是 i·K 的理論斜率。ΔT 與 m 成正比，斜率就是 i·K。', 'Each set (same experiment, solvent and solute) gets a fitted line through the origin (solid); the dashed line has the theoretical slope i·K. ΔT is proportional to m, and the slope is i·K.');
  }

  // ======================= 讀數、分析卡、紀錄表 =======================
  function isXHidden() { return state.so === 'X' && run.solute === 'X' && !(unk && unk.revealed); }
  function updateReadouts() {
    if (!run) return;
    const r = C.reading(run);
    const items = [[T('溫度計讀數', 'Thermometer'), num(r, 2) + ' °C', 'big'], [T('時間', 'Time'), num(run.t, 0) + ' s']];
    const th = C.theory(run);
    if (run.w2 > 0) {
      items.push([T('重量莫耳濃度 m', 'Molality m') + '<small>' + T('開始時', 'at the start') + '</small>', isXHidden() ? '? mol/kg' : num(th.m, 3) + ' mol/kg']);
      if (run.solute !== 'X') items.push([T('凡特荷夫因子 i', "van ’t Hoff factor i") + '<small>' + (run.ideal ? T('理想', 'ideal') : T('實測（0.050 m）', 'measured (0.050 m)')) + '</small>', num(run.i, 1)]);
    }
    if (run.mode === 'f') items.push([T('已結冰的溶劑', 'Solvent frozen'), num(C.frozenFrac(run) * 100, 1) + '%']);
    else items.push([T('已蒸發的溶劑', 'Solvent boiled away'), num(C.lostFrac(run) * 100, 1) + '%']);
    $('readout').innerHTML = items.map(function (it) { return '<dt>' + it[0] + '</dt><dd' + (it[2] ? ' class="' + it[2] + '"' : '') + '>' + it[1] + '</dd>'; }).join('');
    updateAna();
    if (!statusOverride) statusEl.innerHTML = autoStatus();
    cv.setAttribute('aria-label', T('實驗裝置，溫度計讀數 ', 'Apparatus; thermometer reads ') + num(r, 2) + ' °C');
  }
  function updateAna() {
    const An = analysis();
    const th = C.theory(run);
    const out = [];
    const f = run.mode === 'f';
    if (An.tOnset == null) out.push([f ? T('還沒開始結晶', 'No crystals yet') : T('還沒開始沸騰', 'Not boiling yet'), '—']);
    else {
      out.push([f ? T('開始結晶', 'Crystals appeared') : T('開始沸騰', 'Boiling began'), 't = ' + num(An.tOnset, 0) + ' s']);
      if (!An.ok) out.push([T('還要再記錄', 'Keep recording for'), (An.need || 1) + ' s']);
      else {
        out.push([(f ? T('量到的凝固點', 'Measured freezing point') : T('量到的沸點', 'Measured boiling point')) + '<small>' + (state.meth === 'ext' ? T('外插法', 'extrapolated') : T('直接讀', 'read directly')) + '</small>', num(An.Tmeas, 2) + ' °C', 'big']);
        const dT = f ? th.T0 - An.Tmeas : An.Tmeas - th.T0;
        out.push([(f ? T('純溶劑的凝固點', 'Freezing point of pure solvent') : T('純溶劑的沸點', 'Boiling point of pure solvent')), num(th.T0, 1) + ' °C']);
        out.push([f ? 'ΔT<sub>f</sub>' : 'ΔT<sub>b</sub>', num(dT, 2) + ' K', 'big']);
        out.push([(f ? 'K<sub>f</sub>' : 'K<sub>b</sub>') + T('（溶劑）', ' (solvent)'), num(th.K, th.K < 1 ? 3 : 2) + ' K·kg/mol']);
        if (run.w2 > 0 && run.solute !== 'X') out.push([T('實驗的 i = ΔT ÷ (K·m)', 'Experimental i = ΔT ÷ (K·m)'), num(dT / (th.K * th.m), 2)]);
        if (run.solute === 'X') out.push([T('X 的質量／溶劑的質量', 'Mass of X / mass of solvent'), num(run.w2, 3) + ' g / ' + num(run.w1, 1) + ' g']);
      }
    }
    $('anaOut').innerHTML = out.map(function (it) { return '<dt>' + it[0] + '</dt><dd' + (it[2] ? ' class="' + it[2] + '"' : '') + '>' + it[1] + '</dd>'; }).join('');
    $('recBtn').disabled = !An.ok;
  }
  function renderTable() {
    const t = $('tbl');
    let h = '<thead><tr><th>#</th><th class="l">' + T('實驗', 'Experiment') + '</th><th class="l">' + T('溶劑・溶質', 'Solvent · solute') + '</th><th>m<br><small>mol/kg</small></th><th>' + T('方法', 'Method') + '</th><th>T<br><small>°C</small></th><th>ΔT<br><small>K</small></th><th>' + T('理論 ΔT', 'Theory ΔT') + '<br><small>K</small></th><th>' + T('實驗 i', 'Exp. i') + '</th><th>' + T('誤差', 'Error') + '</th></tr></thead><tbody>';
    if (!records.length) h += '<tr class="empty"><td colspan="10">' + T('還沒有紀錄：在「分析」卡按「記錄結果」後會列在這裡。', 'No measurements yet: press “Record result” on the “Analysis” card.') + '</td></tr>';
    records.forEach(function (r, k) {
      const hide = r.isX && !(r.revealed || (unk && unk.id === r.unkId && unk.revealed));
      h += '<tr' + (r.seg !== seg ? ' style="opacity:.55"' : '') + '><td>' + (k + 1) + '</td><td class="l">' + (r.mode === 'f' ? T('凝固', 'freezing') : T('沸騰', 'boiling')) + '</td><td class="l">' + svName(r.solvent) + '・' + soName(r.solute) +
        '</td><td>' + (r.solute === 'none' ? '0' : hide ? '?' : num(r.m, 3)) + '</td><td>' + (r.method === 'ext' ? T('外插', 'extrap.') : T('直接', 'direct')) + '</td><td>' + num(r.Tmeas, 2) + '</td><td><strong>' + num(r.dT, 2) + '</strong></td><td>' + (hide ? '?' : num(r.dTth, 3)) +
        '</td><td>' + (r.iExp == null ? '—' : num(r.iExp, 2)) + '</td><td>' + (hide ? '?' : r.err == null ? signed(r.absErr, 2) + ' K' : pct(r.err)) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  let statusOverride = '';
  function setStatus(s) { statusOverride = s; statusEl.innerHTML = s || autoStatus(); }
  function autoStatus() {
    if (!run) return '';
    if (!state.started) return run.mode === 'f' ? T('按「開始」，試管放進冷浴開始冷卻。溫度計每秒記一筆。', 'Press “Start” to put the tube into the cold bath. The thermometer records once a second.') :
      T('按「開始」，打開加熱板。溫度計每秒記一筆。', 'Press “Start” to switch on the hot plate. The thermometer records once a second.');
    if (!state.running) return run.ended ? '' : T('暫停中。', 'Paused.');
    return run.mode === 'f' ? T('冷卻中……', 'Cooling…') : T('加熱中……', 'Heating…');
  }
  function stageHint() {
    $('stageHint').innerHTML = run && run.mode === 'f' ?
      T('試管與冷浴畫成剖面。冰晶、分子位置只是示意；溫度、結冰量由計算得到。', 'The tube and the bath are drawn cut open. The crystals and molecules are only a picture; the temperature and the amount frozen are calculated.') :
      T('燒瓶畫成剖面。氣泡、分子位置只是示意；溫度、蒸發量由計算得到。', 'The flask is drawn cut open. The bubbles and molecules are only a picture; the temperature and the amount boiled away are calculated.');
  }

  // ======================= 記錄結果 =======================
  function seriesPrev() {
    return records.filter(function (r) { return r.seg === seg; }).map(function (r) {
      return { mode: r.mode, solvent: r.solvent, solute: r.solute, electrolyte: r.electrolyte, ideal: r.ideal, dT: r.dT, m: r.m, w2: r.w2, Tmeas: r.Tmeas, err: r.err, isX: r.isX };
    });
  }
  function doRecord() {
    acted();
    const P = C.measure(run, rows, state.meth);
    if (!P) return;
    const isX = run.solute === 'X';
    const prev = seriesPrev();
    const rec = Object.assign({}, P, { seg: seg, isX: isX, unkId: isX && unk ? unk.id : null, revealed: isX && unk ? unk.revealed : false, id: ++recSeq });
    records.push(rec);
    // 同一組的直線
    const grp = records.filter(function (r) { return r.seg === seg && !r.isX && r.solute !== 'none' && groupKey(r) === groupKey(rec); });
    let line = null;
    if (grp.length >= 2) {
      const fit = C.fitOrigin(grp.map(function (r) { return [r.m, r.dT]; }));
      const ms = grp.map(function (r) { return r.m; });
      line = { n: grp.length, k: fit.k, kTh: grp[0].i * grp[0].K, r2: fit.r2, span: Math.max.apply(null, ms) / Math.min.apply(null, ms) };
    }
    if (userActed && window.LabMission) window.LabMission.emit('measure', Object.assign({}, P, { isX: isX, unkId: rec.unkId, revealed: rec.revealed, prev: prev, line: line }));
    const f = run.mode === 'f';
    $('recOut').innerHTML = T('已記錄第 ' + records.length + ' 筆：', 'Recorded #' + records.length + ': ') + (f ? 'ΔT<sub>f</sub>' : 'ΔT<sub>b</sub>') + ' = ' + num(P.dT, 2) + ' K' +
      (isX && !(unk && unk.revealed) ? T('（X 的理論值要對答案或揭曉後才知道）', ' (the theory for X stays hidden until you check or reveal)') :
        P.err == null ? T('（純溶劑：和表列值差 ', ' (pure solvent: ') + signed(P.absErr, 2) + T(' K）', ' K from the table value)') :
          T('（理論 ', ' (theory ') + num(P.dTth, 3) + T(' K，誤差 ', ' K, error ') + pct(P.err) + T('）', ')'));
    if (snd()) { window.LabSound.tone({ freq: 660, dur: 0.09, gain: 0.2 }); window.LabSound.tone({ freq: 880, dur: 0.12, gain: 0.2, delay: 0.09 }); }
    renderTable();
    drawGraph();
  }

  // ======================= 未知物 X =======================
  function rngX() { return Math.random(); }
  function startUnknown() {
    acted();
    unk = Object.assign(C.newUnknown(rngX), { id: ++unkSeq, revealed: false });
    $('inM').value = '';
    state.so = 'X';
    buildSolutes();
    setUnkUI();
    clampMass(true);
    changed('');
    $('unkOut').innerHTML = T('新的未知物 X 已經放在溶質裡（第 ' + unk.id + ' 個）。秤一些溶進溶劑，量 ΔT，算出莫耳質量。', 'A new unknown X (no. ' + unk.id + ') is now among the solutes. Dissolve some, measure ΔT, and work out the molar mass.');
  }
  function stopUnknown() {
    acted();
    unk = null;
    if (state.so === 'X') state.so = C.SOLUTES_FOR[state.sv][0];
    buildSolutes();
    setUnkUI();
    clampMass(true);
    changed('');
    $('unkOut').innerHTML = '';
  }
  function reveal() {
    if (!unk) return;
    acted();
    unk.revealed = true;
    records.forEach(function (r) { if (r.isX && r.unkId === unk.id) r.revealed = true; });
    $('unkOut').innerHTML = T('答案：X 的莫耳質量是 ', 'Answer: the molar mass of X is ') + num(unk.M, 1) + ' g/mol' + T('。這個已經揭曉，換一個再挑戰。', '. This one is revealed; try another.');
    renderTable(); drawGraph(); updateReadouts();
  }
  function checkAnswer() {
    if (!unk) return;
    acted();
    const v = parseNum($('inM').value);
    if (!(v > 0)) { $('unkOut').innerHTML = T('請輸入一個正數（g/mol）。', 'Please type a positive number (g/mol).'); return; }
    const xs = records.filter(function (r) { return r.isX && r.unkId === unk.id; });
    const last = xs.length ? xs[xs.length - 1] : null;
    const err = v / unk.M - 1;
    if (window.LabMission) window.LabMission.emit('answer', { M: v, Mtrue: unk.M, err: err, revealed: unk.revealed, measured: !!last,
      via: last ? { mode: last.mode, solvent: last.solvent, method: last.method, dT: last.dT, err: last.err } : null });
    const a = Math.abs(err);
    let msg;
    if (!last) msg = T('先量一次 X 的 ΔT（按「記錄結果」），再用它算莫耳質量。', 'Measure ΔT for X first (press “Record result”), then calculate the molar mass from it.');
    else if (a <= 0.01) msg = T('幾乎完全正確（1% 以內）！', 'Spot on (within 1%)!');
    else if (a <= 0.03) msg = T('正確（3% 以內）。想更準嗎？', 'Correct (within 3%). Can you get closer?');
    else if (a <= 0.1) msg = T('接近了，但還差一點。檢查 ΔT 的讀法與單位。', 'Close, but not quite. Check how you read ΔT and the units.');
    else msg = T('不對。檢查公式 M = K·W<sub>2</sub>×1000 ÷ (ΔT·W<sub>1</sub>) 與單位。', 'Not right. Check the formula M = K·W<sub>2</sub>×1000 ÷ (ΔT·W<sub>1</sub>) and the units.');
    $('unkOut').innerHTML = msg;
    if (snd()) {
      if (last && a <= 0.03) { window.LabSound.tone({ freq: 784, dur: 0.1, gain: 0.2 }); window.LabSound.tone({ freq: 988, dur: 0.1, gain: 0.2, delay: 0.1 }); window.LabSound.tone({ freq: 1175, dur: 0.18, gain: 0.2, delay: 0.2 }); }
      else window.LabSound.tone({ freq: 330, dur: 0.15, gain: 0.2, type: 'triangle' });
    }
  }
  function setUnkUI() {
    const on = !!unk;
    $('unkOn').hidden = on; $('unkNew').hidden = !on; $('reveal').hidden = !on; $('unkOff').hidden = !on; $('unkAns').hidden = !on;
  }

  // ======================= 控制項 =======================
  function buildSolutes() {
    const list = C.SOLUTES_FOR[state.sv].slice();
    if (unk) list.push('X');
    if (list.indexOf(state.so) < 0) state.so = list[0];
    $('soSeg').innerHTML = list.map(function (k) { return '<button type="button" data-so="' + k + '" aria-pressed="' + (k === state.so) + '">' + soLabelHTML(k) + '</button>'; }).join('');
    document.querySelectorAll('#soSeg button').forEach(function (b) {
      b.addEventListener('click', function () { if (b.dataset.so === state.so) return; state.so = b.dataset.so; syncSegs(); clampMass(true); changed(''); });
    });
  }
  function clampMass(resetDefault) {
    const mx = C.maxSoluteMass(state.sv, state.so, val(el.w1), unk ? unk.M : null);
    el.w2.max = String(mx);
    let v = val(el.w2);
    if (resetDefault) {
      // 換溶質時改成約 0.5 mol/kg（未知物：溶劑質量的 8%）
      v = state.so === 'X' ? Math.round(0.08 * val(el.w1) * 100) / 100 : Math.round(0.5 * C.SOLUTES[state.so].M * val(el.w1) / 1000 * 100) / 100;
    }
    setVal(el.w2, Math.min(mx, v));
    showOutputs();
  }
  function bathSetup(reset) {
    const R = C.bathRange(state.sv);
    el.Tbath.min = String(R.min); el.Tbath.max = String(R.max);
    setVal(el.Tbath, reset ? R.def : Math.max(R.min, Math.min(R.max, val(el.Tbath))));
  }
  function showOutputs() {
    $('w1o').textContent = num(val(el.w1), 1) + ' g';
    $('w2o').textContent = num(val(el.w2), 3) + ' g';
    $('Tbatho').textContent = num(val(el.Tbath), 1) + ' °C';
    $('pwo').textContent = num(val(el.pw), 0) + ' W';
  }
  function syncSegs() {
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
    document.querySelectorAll('#svSeg button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.sv === state.sv));
      const dis = state.mode === 'b' && !C.canBoil(b.dataset.sv);
      b.disabled = dis;
      b.title = dis ? T('環己烷沒有可靠的 Kb 表列值，這裡只做凝固點', 'No reliable tabulated Kb for cyclohexane, so it is used for freezing points only') : '';
    });
    document.querySelectorAll('#soSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.so === state.so)); });
    document.querySelectorAll('#methSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.meth === state.meth)); });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab)); });
    [0, 1, 2, 3].forEach(function (k) { $('sp' + k).setAttribute('aria-pressed', String(k === state.speed)); });
    $('fCtl').hidden = state.mode !== 'f';
    $('bCtl').hidden = state.mode !== 'b';
    $('seedBtn').hidden = state.mode !== 'f';
    $('methSeg').setAttribute('aria-label', state.mode === 'f' ? T('求凝固點的方法', 'How to read the freezing point') : T('求沸點的方法', 'How to read the boiling point'));
    el.ideal.disabled = state.so === 'X';
  }
  function updatePlay() {
    const b = $('play');
    if (!run) return;
    b.textContent = state.running ? T('暫停', 'Pause') : run.ended ? T('已結束', 'Finished') : state.started ? T('繼續', 'Resume') : T('開始', 'Start');
    b.disabled = run.ended;
    $('seedBtn').disabled = run.mode !== 'f' || run.nucleated || run.ended || !state.started;
  }
  function togglePlay() {
    if (run.ended) return;
    state.running = !state.running;
    state.started = true;
    updatePlay();
    setStatus('');
    startLoop();
  }
  function doSeed() {
    acted();
    if (!run || run.mode !== 'f') return;
    const ok = C.seed(run);
    fx.seedT = performance.now();
    if (snd()) window.LabSound.tone({ freq: 1600, dur: 0.05, gain: 0.15 });
    if (!ok) setStatus(run.nucleated ? T('已經在結晶了。', 'It is already crystallising.') : T('液體還高於凝固點，晶種一放進去就熔化了。等它冷到凝固點以下再加。', 'The liquid is still above its freezing point, so the seed simply melts. Add it once the liquid is below the freezing point.'));
    else { if (!state.running) { state.running = true; state.started = true; } }
    updatePlay();
    startLoop();
  }
  function refreshAll() {
    showOutputs();
    stageHint();
    updateReadouts();
    renderTable();
    drawStage();
    drawGraph();
    if (view3 && view3.active) view3.rebuild();
    startLoop();
  }
  function changed(msg) {
    acted();
    newRun();
    setStatus(msg === undefined ? T('設定已改變：從室溫重新開始。', 'Settings changed: a new run starts from room temperature.') : msg);
    refreshAll();
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
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
      T: T, host: host3, reducedMotion: reducedMotion,
      run: function () { return run; },
      colors: function () { return col; },
      liquidColor: liquidColor,
      vaporP: function () { return C.solventMoleFrac(run) * C.vaporP(run.solvent, run.T); },
      pureP: function () { return C.vaporP(run.solvent, run.T); },
      moleFrac: function () { return C.solventMoleFrac(run); },
      frozen: function () { return C.frozenFrac(run); },
      exag: EXAG,
      running: function () { return state.running; },
      kick: startLoop,
      hud: function () {
        const f = run.mode === 'f';
        const x1 = C.solventMoleFrac(run);
        return {
          tl: (f ? T('固液界面', 'Solid–liquid interface') : T('液面與蒸氣', 'Liquid surface and vapour')) + '・' + num(C.reading(run), 2) + ' °C',
          tr: f ? T('已結冰 ', 'Frozen ') + num(C.frozenFrac(run) * 100, 1) + '%' + (run.w2 > 0 ? '<br>' + T('溶質粒子只留在液體裡', 'Solute particles stay in the liquid') : '') :
            T('溶劑占液面 ', 'Solvent share of surface ') + num(x1 * 100, 1) + '%<br>P = ' + sigf(x1 * C.vaporP(run.solvent, run.T), 3) + ' kPa' + T('（沸騰要 101.3）', ' (boils at 101.3)'),
          br: T('溶質粒子放大 ×' + EXAG + '，不依比例', 'Solute ×' + EXAG + ', not to scale')
        };
      },
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
      if (!webglAvailable() || !window.Coll3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Coll3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        startLoop();
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }

  // ======================= 事件 =======================
  el.w1.addEventListener('input', function () { if (syncing) return; clampMass(false); changed(); });
  el.w2.addEventListener('input', function () { if (syncing) return; showOutputs(); changed(); });
  [el.Tbath, el.pw].forEach(function (e) { e.addEventListener('input', function () { if (syncing) return; showOutputs(); changed(); }); });
  [el.stir, el.chips, el.reflux, el.ideal].forEach(function (e) { e.addEventListener('change', function () { changed(); }); });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.mode === state.mode) return;
      state.mode = b.dataset.mode;
      if (state.mode === 'b' && !C.canBoil(state.sv)) { state.sv = 'water'; buildSolutes(); bathSetup(true); clampMass(true); }
      syncSegs(); changed('');
    });
  });
  document.querySelectorAll('#svSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.sv === state.sv || b.disabled) return;
      state.sv = b.dataset.sv;
      buildSolutes(); bathSetup(true); syncSegs(); clampMass(true); changed('');
    });
  });
  document.querySelectorAll('#methSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.meth = b.dataset.meth; syncSegs(); updateAna(); drawGraph(); }); });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.tab = b.dataset.tab; syncSegs(); drawGraph(); }); });
  $('play').addEventListener('click', function () { acted(); togglePlay(); });
  $('seedBtn').addEventListener('click', doSeed);
  $('restart').addEventListener('click', function () { changed(T('同樣的設定，從室溫重新開始。', 'Same settings, new run from room temperature.')); });
  $('clearAll').addEventListener('click', function () {
    acted();
    records = []; seg++;
    renderTable(); drawGraph();
    $('recOut').innerHTML = '';
    setStatus(T('已清除我的測量紀錄與 ΔT—m 圖（目前這次的曲線保留）。', 'My measurements and the ΔT–m graph have been cleared (the current curve is kept).'));
  });
  [0, 1, 2, 3].forEach(function (k) { $('sp' + k).addEventListener('click', function () { acted(); state.speed = k; syncSegs(); }); });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
  });
  $('recBtn').addEventListener('click', doRecord);
  $('unkOn').addEventListener('click', startUnknown);
  $('unkNew').addEventListener('click', startUnknown);
  $('unkOff').addEventListener('click', stopUnknown);
  $('reveal').addEventListener('click', reveal);
  $('checkM').addEventListener('click', checkAnswer);
  $('inM').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); } });
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) { view3.resetCamera(); startLoop(); } });

  function setValUser(e, v) { if (window.LabNum) window.LabNum.set(e, v); else { e.value = v; e.dispatchEvent(new Event('input')); } }
  if (window.LabKeys) {
    const stepIn = function (e, d, big) {
      const st = +e.step || 1, lo = +e.min, hi = +e.max;
      setValUser(e, Math.max(lo, Math.min(hi, Math.round((val(e) + d * st * (big ? 10 : 1)) / st) * st)));
    };
    const condEl = function () { return state.mode === 'f' ? el.Tbath : el.pw; };
    kb = window.LabKeys.attach(cv, {
      label: T('實驗裝置。P 鍵開始或暫停，S 鍵加晶種。按 Enter 切換要調整的項目，方向鍵改變數值，Shift 加方向鍵改變得更多。', 'Apparatus. P starts or pauses; S adds a seed crystal. Press Enter to pick what to adjust; the arrow keys change it; hold Shift for bigger steps.'),
      items: [
        { name: function () { return T('溶質的質量', 'Mass of solute'); },
          move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; stepIn(el.w2, d, big); return true; },
          describe: function () { return num(val(el.w2), 2) + ' g'; } },
        { name: function () { return state.mode === 'f' ? T('冷浴的溫度', 'Cold bath temperature') : T('加熱功率', 'Heater power'); },
          move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; stepIn(condEl(), d, big); return true; },
          describe: function () { return state.mode === 'f' ? num(val(el.Tbath), 1) + ' °C' : num(val(el.pw), 0) + ' W'; } }
      ],
      onChange: function () { drawStage(); }
    });
    cv.addEventListener('keydown', function (e) {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); acted(); togglePlay(); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); doSeed(); }
    });
  }

  function buildDataTable() {
    const t = $('dataTable');
    if (!t) return;
    let h = '<thead><tr><th class="l">' + T('溶劑', 'Solvent') + '</th><th>' + T('凝固點', 'Freezing point') + '<br><small>°C</small></th><th>K<sub>f</sub><br><small>K·kg/mol</small></th><th>' + T('沸點', 'Boiling point') + '<br><small>°C</small></th><th>K<sub>b</sub><br><small>K·kg/mol</small></th><th>' + T('熔化熱', 'Heat of fusion') + '<br><small>J/g</small></th><th>' + T('汽化熱', 'Heat of vap.') + '<br><small>J/g</small></th></tr></thead><tbody>';
    C.SOLVENT_KEYS.forEach(function (k) {
      const s = C.SOLVENTS[k];
      h += '<tr><td class="l">' + svName(k) + ' ' + fH(s.f) + '</td><td>' + num(s.Tf, 1) + '</td><td>' + s.Kf + '</td><td>' + num(s.Tb, 1) + '</td><td>' + (s.Kb == null ? '—' : s.Kb) + '</td><td>' + num(s.Lf, 1) + '</td><td>' + num(s.Lv, 0) + '</td></tr>';
    });
    h += '</tbody>';
    let h2 = '<thead><tr><th class="l">' + T('溶質', 'Solute') + '</th><th>M<br><small>g/mol</small></th><th>' + T('理想 i', 'Ideal i') + '</th><th>' + T('實測 i', 'Measured i') + '</th></tr></thead><tbody>';
    ['glucose', 'sucrose', 'urea', 'NaCl', 'MgCl2', 'MgSO4', 'naph', 'benzoic'].forEach(function (k) {
      const s = C.SOLUTES[k];
      h2 += '<tr><td class="l">' + soName(k) + ' ' + fH(s.f) + '</td><td>' + num(s.M, 2) + '</td><td>' + s.ideal + '</td><td>' + num(s.real, 1) + (k === 'benzoic' ? T('（在苯、環己烷中雙分子化）', ' (dimerised in benzene, cyclohexane)') : '') + '</td></tr>';
    });
    t.innerHTML = h;
    let t2 = $('dataTable2');
    if (!t2) {
      const wrap = document.createElement('div'); wrap.className = 'tablewrap';
      t2 = document.createElement('table'); t2.className = 'data'; t2.id = 'dataTable2';
      wrap.appendChild(t2);
      t.parentNode.parentNode.insertBefore(wrap, t.parentNode.nextSibling);
    }
    t2.innerHTML = h2 + '</tbody>';
  }

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    if (view3 && view3.active) view3.onTheme();
    refreshAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);

  // 任務：每 0.5 秒回報一次
  function tickData() {
    return {
      mode: run.mode, solvent: run.solvent, solute: run.w2 > 0 ? run.solute : 'none', w2: run.w2, running: state.running,
      nucleated: run.nucleated, superDepth: run.superDepth, boiling: run.boiling, bumped: run.bumped, superMax: run.superMax,
      reading: C.reading(run), frozen: C.frozenFrac(run), lost: C.lostFrac(run), t: run.t, seeded: run.seeded
    };
  }
  setInterval(function () { if (userActed && state.started && window.LabMission) window.LabMission.emit('tick', tickData()); }, 500);

  // 測試用（Playwright）：讀取狀態、快轉
  window.__cp = {
    state: state, run: function () { return run; }, rows: function () { return rows; }, records: function () { return records; }, unk: function () { return unk; },
    tick: tickData, analysis: analysis, view3: function () { return view3; },
    ffwd: function (sec) { if (state.running) { advance(sec); updateReadouts(); drawGraph(); drawStage(); } }
  };

  // ======================= 啟動 =======================
  readColors();
  cw = cv.clientWidth || 600; ch = 430; layout();
  buildSolutes();
  bathSetup(true);
  syncSegs();
  clampMass(false);
  newRun();
  buildDataTable();
  updateSoundButton();
  setUnkUI();
  resize();
  refreshAll();
})();
