/*
 * solubility-equilibrium.js — 「溶解平衡與 Ksp」的頁面程式（燒杯畫面、加溶液／固體／水、粒子示意、離子積圖、濃度圖、紀錄、任務事件）
 * 化學核心在 js/solubility-equilibrium-core.js（SolubilityCore）：每次加入後直接解出平衡（哪些鹽沉澱、沉澱多少、各離子濃度）。
 * 畫面上的滴落、傾倒、落下的顆粒與粒子示意只是圖示；體積、沉澱量、濃度都來自核心的計算。
 *
 * 任務事件（只在使用者加入試劑或水之後送出）：
 *   'mix'：核心 settle() 的資料，另加 sats（本頁做成過的「只有一種固體加水」的飽和溶液，跨燒杯累積；按「全部清除」才清空）
 */
(function () {
  'use strict';
  const S = window.SolubilityCore, LD = window.LabDraw;
  if (!S || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const LOG_LO = -12;           // 圖上最低的 log 濃度
  const SOLN_KEYS = Object.keys(S.SOLN), SOLID_KEYS = Object.keys(S.SOLID);

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
  function roundSig(v, n) {
    if (!(v > 0)) return v;
    const p = Math.pow(10, n - 1 - Math.floor(Math.log10(v)));
    return Math.round(v * p) / p;
  }
  /** 質量（mg）：小於 0.01 mg 用科學記號 */
  function mgHTML(mg) { return mg < 0.01 ? sciHTML(mg, 2) : sigf(mg, 3); }
  function mL(v) { return num(v, Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 2); }

  // ======================= 名稱與化學式 =======================
  function fH(f) { return f.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>'); }
  function fP(f) {   // 化學式 → 畫布 parts（數字下標）
    const out = [];
    f.replace(/([A-Za-z\)])(\d+)/g, '$1\u0000$2\u0000').split('\u0000').forEach(function (p, i) { if (p) out.push([p, i % 2 ? -1 : 0]); });
    return out;
  }
  function chargeStr(z) { const a = Math.abs(z); return (a > 1 ? a : '') + (z > 0 ? '+' : '−'); }
  function ionH(i) { return fH(i) + '<sup>' + chargeStr(S.ION[i].z) + '</sup>'; }
  function ionP(i) { return fP(i).concat([[chargeStr(S.ION[i].z), 1]]); }
  function solnF(k) { return S.SOLN[k].f; }
  function nm(o) { return T(o.zh, o.en); }
  function catOf(k) { return Object.keys(S.SOLID[k].ions).filter(function (i) { return S.ION[i].z > 0; })[0]; }
  function anOf(k) { return Object.keys(S.SOLID[k].ions).filter(function (i) { return S.ION[i].z < 0; })[0]; }
  function colorWord(k) {
    const map = {
      AgBr: ['淡黃色', 'pale yellow'], AgI: ['黃色', 'yellow'], Ag2CrO4: ['紅棕色', 'red-brown'], PbI2: ['亮黃色', 'bright yellow'],
      PbCrO4: ['黃色', 'yellow'], BaCrO4: ['淡黃色', 'pale yellow']
    };
    const w = map[k] || ['白色', 'white'];
    return T(w[0], w[1]);
  }

  // ======================= 顏色 =======================
  let col = {};
  const ION_COL = {
    Ag: '#a9b6c4', Pb: '#5f6e7e', Ba: '#2f78d0', Ca: '#e08a3c', Na: '#9a9a9a', K: '#b39ad9',
    Cl: '#3fae6a', Br: '#b5542e', I: '#7b4fc9', F: '#45b8cc', CrO4: '#e2b21c', SO4: '#d9534f', NO3: '#8fa596'
  };
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', dark: dk,
      water: dk ? '#4f7f9a' : '#b9dcef', glass: dk ? '#a9c3cf' : '#7d97a5', bench: dk ? '#3a3631' : '#d9cdb8',
      over: dk ? '#ff8a7a' : '#d1453b', under: dk ? '#7fb2ff' : '#2f6fd0'
    };
  }
  function rgbStr(a, al) { return 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + (al == null ? 1 : al) + ')'; }
  function solidCol(k) { const r = S.SOLID[k].rgb; return col.dark ? rgbStr([Math.round(r[0] * 0.86), Math.round(r[1] * 0.86), Math.round(r[2] * 0.86)]) : rgbStr(r); }

  // ======================= 狀態 =======================
  let b = S.createBeaker();
  let steps = [];            // 這一杯每一步的 { c, p, V }（離子積圖的軌跡）
  let logRows = [];          // 操作紀錄（跨燒杯，全部清除才清空）
  let sats = [];             // 本頁做成過的純水飽和溶液（任務用，跨燒杯）
  let satRows = {};          // 飽和溶液比較表：鹽 → { c（陽離子濃度）, s }
  let beakerNo = 1, stepNo = 0;
  let focus = 'AgCl', focusManual = false, lastData = null;
  let soln = 'AgNO3';
  let tab = 'q';
  let userActed = false, syncing = false;

  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const el = { conc: $('conc'), mass: $('mass'), solidSel: $('solidSel'), kspSel: $('kspSel') };
  const statusEl = $('status');
  function val(e) { return window.LabNum ? window.LabNum.value(e) : +e.value; }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function setStatus(h) { statusEl.innerHTML = h; }

  // 對數滑桿：濃度 0.00001～1 M、質量 0.1～1000 mg（滑桿位置 0～1000）
  const concMap = {
    toValue: function (pos) { return roundSig(Math.pow(10, -5 + pos / 200), 3); },
    toPos: function (v) { return 200 * (Math.log10(Math.max(1e-5, v)) + 5); },
    min: 1e-5, max: 1, decimals: 5
  };
  const massMap = {
    toValue: function (pos) { return roundSig(Math.pow(10, -1 + pos / 250), 3); },
    toPos: function (v) { return 250 * (Math.log10(Math.max(0.1, v)) + 1); },
    min: 0.1, max: 1000, decimals: 2
  };
  if (window.LabNum) { window.LabNum.register(el.conc, concMap); window.LabNum.register(el.mass, massMap); }
  function concV() { const v = window.LabNum ? val(el.conc) : concMap.toValue(+el.conc.value); return Math.max(1e-5, Math.min(1, v)); }
  function massV() { const v = window.LabNum ? val(el.mass) : massMap.toValue(+el.mass.value); return Math.max(0.1, Math.min(1000, v)); }
  function showOutputs() {
    $('conco').textContent = sigf(concV(), 3) + ' M';
    $('masso').textContent = sigf(massV(), 3) + ' mg';
  }

  // ======================= 選單 =======================
  function buildControls() {
    let h = '';
    SOLN_KEYS.forEach(function (k) {
      const cr = k === 'K2CrO4';
      h += '<button type="button" data-soln="' + k + '" aria-pressed="' + (k === soln) + '" title="' + nm(S.SOLN[k]) + '">' +
        (cr ? '<span class="sw" style="background:#e9c21e"></span>' : '') + fH(solnF(k)) + '</button>';
    });
    $('solnSeg').innerHTML = h;
    const groups = [['Ag', '銀鹽', 'Silver salts'], ['Pb', '鉛鹽', 'Lead salts'], ['Ba', '鋇鹽', 'Barium salts'], ['Ca', '鈣鹽', 'Calcium salts']];
    const keep = el.solidSel.value || 'AgCl';
    let o = '';
    groups.forEach(function (g) {
      o += '<optgroup label="' + T(g[1], g[2]) + '">';
      SOLID_KEYS.filter(function (k) { return catOf(k) === g[0]; }).forEach(function (k) {
        o += '<option value="' + k + '">' + k + '　' + nm(S.SOLID[k]) + '</option>';
      });
      o += '</optgroup>';
    });
    el.solidSel.innerHTML = o;
    el.solidSel.value = keep;
    const fk = el.kspSel.value || 'auto';
    let q = '<option value="auto">' + T('自動（跟著燒杯裡最相關的鹽）', 'Automatic (the most relevant salt)') + '</option>';
    SOLID_KEYS.forEach(function (k) { q += '<option value="' + k + '">' + k + '　' + nm(S.SOLID[k]) + '</option>'; });
    el.kspSel.innerHTML = q;
    el.kspSel.value = fk;
  }
  function syncSegs() {
    Array.prototype.forEach.call($('solnSeg').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x.dataset.soln === soln)); });
    Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x.dataset.tab === tab)); });
    $('kspRow').hidden = tab !== 'q';
  }
  function updateButtons() {
    $('addDrop').disabled = b.V + S.DROP > S.V_MAX + 1e-9;
    $('add1').disabled = b.V + 1 > S.V_MAX + 1e-9;
    $('add10').disabled = b.V + 10 > S.V_MAX + 1e-9;
    $('water1').disabled = $('add1').disabled;
    $('water10').disabled = $('add10').disabled;
  }

  // ======================= 操作 =======================
  /** 燒杯裡最值得看的那種鹽：剛出現的沉澱 → 有沉澱的 → Q/Ksp 最大的 */
  function pickFocus(d) {
    if (d.appeared.length) return d.appeared[d.appeared.length - 1];
    const ps = Object.keys(d.p);
    if (ps.length) return ps.sort(function (a, c) { return S.pptMg(b, c) - S.pptMg(b, a); })[0];
    let best = null, bq = -1;
    Object.keys(d.Qr).forEach(function (k) { if (d.Qr[k] > bq) { bq = d.Qr[k]; best = k; } });
    return best || focus;
  }
  function act(kind, key, amt) {
    if (!userActed) { userActed = true; }
    const before = Object.assign({}, b.p);
    let d = null, what = '';
    if (kind === 'soln') {
      const c = concV();
      d = S.addSolution(b, key, c, amt);
      what = sigf(c, 3) + ' M ' + fH(solnF(key)) + ' ' + mL(amt) + ' mL';
      if (d) startPour(amt, key === 'K2CrO4' ? Math.min(1, 0.25 + 0.75 * Math.max(0, (Math.log10(c) + 4) / 4)) : 0);
    } else if (kind === 'solid') {
      d = S.addSolid(b, key, amt);
      what = T('固體 ', 'solid ') + fH(key) + ' ' + sigf(amt, 3) + ' mg';
      if (d) startSprinkle(key, amt);
    } else {
      d = S.addWater(b, amt);
      what = T('水 ', 'water ') + mL(amt) + ' mL';
      if (d) startWash(amt);
    }
    if (!d) {
      setStatus(T('燒杯裝不下了（最多 250 mL）。按「倒掉重來」換一個乾淨的燒杯。', 'The beaker is full (250 mL at most). Press “Empty the beaker” to start again.'));
      if (snd()) window.LabSound.tone({ freq: 300, dur: 0.12, gain: 0.06, type: 'triangle' });
      return;
    }
    stepNo++;
    d.sat.forEach(function (k) { if (sats.indexOf(k) < 0) sats.push(k); });
    d.sats = sats.slice();
    // 飽和溶液比較表：目前這杯「只有一種固體加水、固體沒溶完」
    Object.keys(b.p).forEach(function (k) {
      if (S.onlyUsed(b, ['w', 'x:' + k])) { const ci = catOf(k); satRows[k] = { c: b.c[ci], s: b.c[ci] / S.SOLID[k].ions[ci] }; }
    });
    if (!focusManual) focus = pickFocus(d);
    lastData = d;
    steps.push({ c: Object.assign({}, b.c), p: Object.assign({}, b.p), V: b.V });
    // 新出現或變多的沉澱：落下的顆粒
    Object.keys(b.p).forEach(function (k) {
      const dm = (b.p[k] - (before[k] || 0)) * S.SOLID[k].M * 1000;
      if (dm > 0) spawnGrains(k, dm, kind === 'solid' && key === k);
    });
    logRows.push({ n: stepNo, beaker: beakerNo, what: what, V: b.V, ppt: pptList() });
    if (logRows.length > 400) logRows.shift();
    // 狀態文字與音效
    let msg = T('加入 ', 'Added ') + what + T('。', '. ');
    if (d.appeared.length) {
      msg += d.appeared.map(function (k) { return T('出現' + colorWord(k) + '的 ', 'A ' + colorWord(k) + ' precipitate of ') + fH(k) + T(' 沉澱', ''); }).join(T('，', '; ')) + T('！', '!');
      if (snd()) { window.LabSound.sweep({ from: 620, to: 300, dur: 0.35, gain: 0.07, type: 'triangle' }); window.LabSound.noise({ dur: 0.25, gain: 0.05, filter: 2400, q: 0.8, delay: 0.05 }); }
    } else if (d.vanished.length) {
      msg += d.vanished.map(function (k) { return fH(k); }).join(T('、', ', ')) + T(' 全部溶解了。', ' has completely dissolved.');
      if (snd()) { window.LabSound.tone({ freq: 660, dur: 0.12, gain: 0.06 }); window.LabSound.tone({ freq: 990, dur: 0.18, gain: 0.05, delay: 0.1 }); }
    } else if (Object.keys(b.p).length) {
      msg += T('沉澱：', 'Precipitate: ') + pptList() + T('。', '.');
      if (snd()) window.LabSound.tone({ freq: kind === 'water' ? 520 : 880, dur: 0.05, gain: 0.05 });
    } else {
      let best = null, bq = -1;
      Object.keys(d.Qr).forEach(function (k) { if (d.Qr[k] > bq) { bq = d.Qr[k]; best = k; } });
      msg += best ? T('還沒有沉澱；最接近飽和的是 ', 'No precipitate yet; closest to saturation: ') + fH(best) + T('，Q/Ksp = ', ', Q/Ksp = ') + sigf(bq, 3) + T('。', '.') : T('沒有會沉澱的離子組合。', 'No pair of ions here can precipitate.');
      if (snd()) window.LabSound.tone({ freq: kind === 'water' ? 520 : 880, dur: 0.05, gain: 0.05 });
    }
    setStatus(msg);
    refreshAll();
    startLoop();
    if (window.LabMission) window.LabMission.emit('mix', d);
  }
  function pptList() {
    const ks = Object.keys(b.p);
    return ks.length ? ks.map(function (k) { return fH(k) + ' ' + mgHTML(S.pptMg(b, k)) + ' mg'; }).join(T('、', ', ')) : '—';
  }
  function newBeaker(msg) {
    b = S.createBeaker();
    steps = [];
    beakerNo++;
    if (!focusManual) focus = 'AgCl';
    lastData = null;
    pile = {}; grains = []; anims = []; pileOrder = [];
    if (logRows.length) logRows.push({ sep: true, beaker: beakerNo });
    setStatus(msg || T('換了一個乾淨的燒杯：50 mL 純水。', 'A clean beaker with 50 mL of pure water.'));
    refreshAll();
  }

  // ======================= 版面 =======================
  let cw = 0, ch = 0, dpr = 1, G = null;
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 560 ? Math.round(Math.max(400, w * 1.12)) : 440;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout();
    resizeGraph();
    drawStage(); drawGraph();
  }
  function layout() {
    const narrow = cw < 560;
    const pad = narrow ? 10 : 16;
    const bench = ch - (narrow ? 40 : 46);
    const bw = Math.min(narrow ? cw * 0.5 : cw * 0.32, 250);
    const bh = Math.min(ch * (narrow ? 0.5 : 0.6), 280);
    const bx = narrow ? cw * 0.3 : cw * 0.36;
    const mr = narrow ? Math.min(cw * 0.2, 80) : Math.min(cw * 0.15, 100);
    G = {
      narrow: narrow, pad: pad, bench: bench, bw: bw, bh: bh, bx: bx, top: bench - bh, wall: 3,
      mx: narrow ? cw - pad - mr - 4 : Math.min(cw - pad - mr - 8, bx + bw / 2 + mr + 60), my: pad + mr + (narrow ? 26 : 34), mr: mr
    };
  }
  /** 液面的 y（體積 V mL） */
  function liqY(V) { return G.bench - G.wall - (G.bh - 24) * Math.min(1, V / S.V_MAX); }

  // ======================= 動畫 =======================
  let anims = [], grains = [], pile = {}, pileOrder = [], micro = null;
  let raf = 0, lastTs = 0, phase = 0;
  function startPour(vol, yellow) { anims.push({ kind: 'pour', t0: performance.now(), dur: vol <= S.DROP ? 650 : vol <= 1 ? 900 : 1500, vol: vol, yellow: yellow }); }
  function startSprinkle(k, mg) { anims.push({ kind: 'solid', t0: performance.now(), dur: 1100, k: k, mg: mg }); }
  function startWash(vol) { anims.push({ kind: 'wash', t0: performance.now(), dur: vol <= 1 ? 800 : 1400 }); }
  function spawnGrains(k, dmg, fromAbove) {
    if (reducedMotion || !G) return;
    const n = Math.max(5, Math.min(60, Math.round(8 + 10 * Math.log10(1 + dmg))));
    const yl = liqY(b.V), hw = G.bw / 2 - G.wall - 6;
    for (let i = 0; i < n; i++) {
      grains.push({
        k: k, x: G.bx + (Math.random() * 2 - 1) * hw * (fromAbove ? 0.35 : 0.9), y: fromAbove ? yl - 30 - Math.random() * 40 : yl + 6 + Math.random() * (G.bench - yl) * 0.5,
        vy: 20 + Math.random() * 40, r: 0.9 + Math.random() * 1.6, delay: fromAbove ? Math.random() * 0.6 : Math.random() * 0.4, life: 0
      });
    }
  }
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dt > 0) {
      if (!reducedMotion) phase += dt;
      const now = performance.now();
      anims = anims.filter(function (a) { return now - a.t0 < a.dur; });
      // 沉澱堆的高度慢慢跟上真實的量
      const keys = Object.keys(b.p).concat(Object.keys(pile));
      keys.forEach(function (k) {
        const tgt = (b.p[k] || 0) * S.SOLID[k].M * 1000, cur = pile[k] || 0;
        const nx = reducedMotion ? tgt : cur + (tgt - cur) * Math.min(1, dt * 2.5);
        if (tgt === 0 && nx < Math.max(1e-6, cur * 0.01)) { delete pile[k]; pileOrder = pileOrder.filter(function (x) { return x !== k; }); }
        else { pile[k] = nx; if (pileOrder.indexOf(k) < 0) pileOrder.push(k); }
      });
      grains.forEach(function (g) {
        if (g.delay > 0) { g.delay -= dt; return; }
        g.life += dt; g.vy += 60 * dt; g.y += g.vy * dt * 0.6;
      });
      grains = grains.filter(function (g) { return g.y < G.bench - G.wall - pileH() - 1 && g.life < 4; });
      stepMicro(dt);
    }
    drawStage();
    const busy = anims.length || grains.length || pileBusy();
    if (busy || !reducedMotion) raf = requestAnimationFrame(loop);
  }
  function pileBusy() {
    return Object.keys(b.p).some(function (k) { return Math.abs((pile[k] || 0) - b.p[k] * S.SOLID[k].M * 1000) > 1e-9; }) || Object.keys(pile).some(function (k) { return !(b.p[k] > 0); });
  }
  /** 一種沉澱在燒杯底的厚度（px）：看得到最少 1.5 px，最多疊到燒杯高的 35% */
  function layerH(mg) { return mg > 0 ? Math.max(1.5, G.bh * 0.028 * Math.cbrt(mg)) : 0; }
  function pileH() { return Math.min(G.bh * 0.35, pileOrder.reduce(function (a, k) { return a + layerH(pile[k] || 0); }, 0)); }

  // ======================= 粒子示意 =======================
  function microCounts() {
    const ci = catOf(focus), ai = anOf(focus);
    const n = function (c) { return c > 0 ? Math.max(0, Math.min(16, Math.round(2 * (Math.log10(c) + 9)))) : 0; };
    return { ci: ci, ai: ai, nc: n(b.c[ci] || 0), na: n(b.c[ai] || 0) };
  }
  function stepMicro(dt) {
    const m = microCounts();
    if (!micro || micro.k !== focus) micro = { k: focus, ions: [] };
    const want = function (ion, n) {
      const have = micro.ions.filter(function (q) { return q.i === ion; });
      for (let j = have.length; j < n; j++) micro.ions.push({ i: ion, x: (Math.random() * 2 - 1) * 0.7, y: -0.7 + Math.random() * 1.0, vx: 0, vy: 0, fade: 0 });
      if (have.length > n) { const drop = have.slice(n); micro.ions = micro.ions.filter(function (q) { return drop.indexOf(q) < 0; }); }
    };
    want(m.ci, m.nc); want(m.ai, m.na);
    const floor = b.p[focus] > 0 ? 0.42 : 0.92;
    micro.ions.forEach(function (q) {
      q.fade = Math.min(1, q.fade + dt * 2);
      q.vx += (Math.random() * 2 - 1) * dt * 3; q.vy += (Math.random() * 2 - 1) * dt * 3;
      q.vx *= 0.96; q.vy *= 0.96;
      q.x += q.vx * dt; q.y += q.vy * dt;
      const r = Math.hypot(q.x, q.y);
      if (r > 0.86) { q.x *= 0.86 / r; q.y *= 0.86 / r; q.vx *= -0.5; q.vy *= -0.5; }
      if (q.y > floor) { q.y = floor; q.vy = -Math.abs(q.vy); }
    });
  }

  // ======================= 畫燒杯 =======================
  function rich(g, ps, x, y, color, size, align, weight) {
    size = size || fsz(12);
    const f0 = (weight || '') + ' ' + size + 'px ' + LD.FONT, f1 = (weight || '') + ' ' + (size * 0.72).toFixed(1) + 'px ' + LD.FONT;
    let w = 0;
    ps.forEach(function (p) { g.font = p[1] ? f1 : f0; w += g.measureText(p[0]).width; });
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = color;
    ps.forEach(function (p) {
      g.font = p[1] ? f1 : f0;
      g.fillText(p[0], cx, y + (p[1] > 0 ? -size * 0.38 : p[1] < 0 ? size * 0.22 : 0));
      cx += g.measureText(p[0]).width;
    });
    return w;
  }
  function richW(g, ps, size, weight) {
    size = size || fsz(12);
    let w = 0;
    ps.forEach(function (p) { g.font = (weight || '') + ' ' + (p[1] ? (size * 0.72).toFixed(1) : size) + 'px ' + LD.FONT; w += g.measureText(p[0]).width; });
    return w;
  }
  function richPill(g, ps, x, y, color, size, align, weight) {
    size = size || fsz(12);
    const w = richW(g, ps, size, weight), h = size * 1.5;
    const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.save();
    g.fillStyle = LD.alpha(col.surface, col.dark ? 0.88 : 0.92);
    g.strokeStyle = LD.alpha(color, 0.45);
    g.lineWidth = 1;
    LD.roundRect(g, bx - 6, y - size * 1.05, w + 12, h, 6);
    g.fill(); g.stroke();
    g.restore();
    rich(g, ps, bx, y, color, size, 'left', weight);
    return w + 12;
  }
  /** 科學記號 parts：1.33 × 10^−5 */
  function sciP(x, sig) {
    const p = sciParts(x, sig);
    return p.e == null ? [[p.m, 0]] : [[p.m + ' × 10', 0], [num(p.e, 0), 1]];
  }
  function liquidColor() {
    const cr = b.c.CrO4 || 0;
    const y = cr > 1e-5 ? Math.max(0, Math.min(0.85, (Math.log10(cr) + 5) / 3.5)) : 0;
    return LD.mix(col.water, col.dark ? '#c9a420' : '#f2cf2a', y);
  }
  function drawBeaker(g) {
    const x0 = G.bx - G.bw / 2, x1 = G.bx + G.bw / 2, top = G.top, bot = G.bench;
    const yl = liqY(b.V);
    // 影子
    g.fillStyle = LD.shadowInk(col.dark ? 0.35 : 0.16);
    g.beginPath(); g.ellipse(G.bx + 4, bot + 3, G.bw * 0.56, 7, 0, 0, 7); g.fill();
    // 液體
    const lc = liquidColor();
    const lg = g.createLinearGradient(x0, 0, x1, 0);
    lg.addColorStop(0, LD.alpha(LD.shade(lc, -0.12), col.dark ? 0.7 : 0.62));
    lg.addColorStop(0.45, LD.alpha(lc, col.dark ? 0.6 : 0.5));
    lg.addColorStop(1, LD.alpha(LD.shade(lc, -0.18), col.dark ? 0.75 : 0.68));
    g.fillStyle = lg;
    g.fillRect(x0 + G.wall, yl, G.bw - 2 * G.wall, bot - G.wall - yl);
    g.strokeStyle = LD.alpha(LD.shade(lc, 0.4), 0.95); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0 + G.wall, yl); g.lineTo(x1 - G.wall, yl); g.stroke();
    // 沉澱層（由下往上，依出現先後）
    let y = bot - G.wall;
    const total = pileH(), raw = pileOrder.reduce(function (a, k) { return a + layerH(pile[k] || 0); }, 0), sc = raw > 0 ? total / raw : 1;
    const inner = G.bw - 2 * G.wall;
    pileOrder.forEach(function (k, li) {
      const h = layerH(pile[k] || 0) * sc;
      if (h <= 0) return;
      const c0 = solidCol(k);
      const yt = y - h;
      const pg = g.createLinearGradient(0, yt, 0, y);
      pg.addColorStop(0, LD.shade(c0, 0.12)); pg.addColorStop(1, LD.shade(c0, -0.18));
      g.fillStyle = pg;
      g.beginPath();
      g.moveTo(x0 + G.wall, y);
      const bump = Math.min(h * 0.6, 6);
      for (let s = 0; s <= 24; s++) {
        const xx = x0 + G.wall + inner * s / 24, u = s / 24;
        g.lineTo(xx, yt - bump * Math.sin(Math.PI * u) * (li === pileOrder.length - 1 ? 1 : 0.3) + Math.sin(u * 37 + li) * 0.5);
      }
      g.lineTo(x1 - G.wall, y); g.closePath(); g.fill();
      // 顆粒質感
      g.fillStyle = LD.alpha(LD.shade(c0, -0.35), 0.35);
      const nd = Math.min(60, Math.round(inner * h / 40));
      for (let s = 0; s < nd; s++) {
        const rx = ((s * 97 + li * 31) % 101) / 101, ry = ((s * 53 + li * 17) % 89) / 89;
        g.fillRect(x0 + G.wall + rx * inner, yt + ry * h, 1.2, 1.2);
      }
      y = yt;
    });
    // 落下中的顆粒
    grains.forEach(function (q) {
      if (q.delay > 0) return;
      g.fillStyle = LD.alpha(solidCol(q.k), 0.9);
      g.strokeStyle = LD.alpha(col.text, 0.18); g.lineWidth = 0.5;
      g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill(); g.stroke();
    });
    // 玻璃
    g.fillStyle = LD.alpha('#ffffff', col.dark ? 0.05 : 0.18);
    g.fillRect(x0 + 6, top + 10, 8, bot - top - 20);
    g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 2.4; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x0 - 6, top - 2); g.quadraticCurveTo(x0, top - 2, x0, top + 6);
    g.lineTo(x0, bot - 6); g.quadraticCurveTo(x0, bot, x0 + 6, bot);
    g.lineTo(x1 - 6, bot); g.quadraticCurveTo(x1, bot, x1, bot - 6); g.lineTo(x1, top);
    g.stroke();
    // 刻度
    g.strokeStyle = LD.alpha(col.text, 0.45); g.lineWidth = 1;
    g.font = fsz(10) + 'px ' + LD.FONT; g.fillStyle = LD.alpha(col.text, 0.6); g.textAlign = 'left'; g.textBaseline = 'middle';
    for (let v = 25; v <= S.V_MAX; v += 25) {
      const yy = liqY(v), big = v % 50 === 0;
      g.beginPath(); g.moveTo(x0 + G.wall + 2, yy); g.lineTo(x0 + G.wall + (big ? 16 : 9), yy); g.stroke();
      if (big) g.fillText(String(v), x0 + G.wall + 19, yy);
    }
    g.textAlign = 'left'; g.fillText('mL', x0 + G.wall + 19, liqY(S.V_MAX) - 14);
    // 標籤：沉澱名稱與質量
    let ly = bot - G.wall;
    pileOrder.forEach(function (k) {
      const h = layerH(pile[k] || 0) * sc;
      const mid = ly - h / 2;
      ly -= h;
      if (!(b.p[k] > 0)) return;
      const ps = fP(k).concat([[' ' + (S.pptMg(b, k) < 0.01 ? '' : sigf(S.pptMg(b, k), 3) + ' mg'), 0]]);
      if (S.pptMg(b, k) < 0.01) { const sp = sciP(S.pptMg(b, k), 2); ps.push.apply(ps, sp); ps.push([' mg', 0]); }
      g.strokeStyle = LD.alpha(col.text, 0.35); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x1 - 4, mid); g.lineTo(x1 + 12, mid); g.stroke();
      richPill(g, ps, x1 + 16, mid + fsz(11) * 0.38, col.text, fsz(11), 'left');
    });
  }
  function drawTools(g) {
    const now = performance.now(), yl = liqY(b.V);
    anims.forEach(function (a) {
      const u = (now - a.t0) / a.dur;
      if (a.kind === 'pour') {
        // 滴管：從上方降下、滴入、升起
        const tx = G.bx + G.bw * 0.12, enter = Math.min(1, u / 0.2), leave = Math.max(0, (u - 0.8) / 0.2);
        const tipY = G.top - 14 - 40 * (1 - enter) - 40 * leave;
        const a1 = 1 - leave;
        g.save(); g.globalAlpha = a1;
        const lc = a.yellow > 0 ? LD.mix(col.water, '#f2cf2a', a.yellow) : col.water;
        g.fillStyle = LD.alpha(col.glass, 0.25); g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(tx - 3, tipY); g.lineTo(tx - 7, tipY - 30); g.lineTo(tx - 7, tipY - 92); g.lineTo(tx + 7, tipY - 92); g.lineTo(tx + 7, tipY - 30); g.lineTo(tx + 3, tipY); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = LD.alpha(lc, 0.75); g.fillRect(tx - 5.5, tipY - 60 + 30 * Math.min(1, u), 11, 30 - 30 * Math.min(1, u) + 30);
        g.fillStyle = col.dark ? '#c04a3a' : '#d9534f'; LD.roundRect(g, tx - 8, tipY - 112, 16, 22, 6); g.fill();
        g.restore();
        if (u > 0.2 && u < 0.8) {
          if (a.vol <= S.DROP) {
            const f = (u - 0.2) / 0.6, dy = tipY + (yl - tipY) * f * f;
            g.fillStyle = LD.alpha(lc, 0.95); g.beginPath(); g.ellipse(tx, dy, 2.6, 3.4, 0, 0, 7); g.fill();
          } else {
            g.strokeStyle = LD.alpha(lc, 0.85); g.lineWidth = a.vol > 1 ? 3 : 2; g.lineCap = 'round';
            g.beginPath(); g.moveTo(tx, tipY + 2); g.lineTo(tx, yl); g.stroke();
          }
        }
        if (u > 0.55) LD.ripple(g, tx, yl, 3, (u - 0.55) / 0.45, col.text);
      } else if (a.kind === 'solid') {
        const sx = G.bx - G.bw * 0.05, sy = G.top - 26, tilt = Math.min(1, u / 0.3) * (1 - Math.max(0, (u - 0.85) / 0.15));
        g.save(); g.translate(sx, sy); g.rotate(-0.15 - 0.45 * tilt);
        g.fillStyle = col.dark ? '#b8c0c8' : '#8d969f';
        LD.roundRect(g, -70, -3, 62, 6, 3); g.fill();
        g.beginPath(); g.ellipse(4, 0, 14, 6, 0, 0, 7); g.fill();
        g.fillStyle = solidCol(a.k);
        if (u < 0.6) { g.beginPath(); g.ellipse(4, -2, 10 * (1 - u), 3, 0, 0, 7); g.fill(); }
        g.restore();
      } else if (a.kind === 'wash') {
        // 洗瓶：從左上噴入
        const wx = G.bx - G.bw / 2 - 24, wy = G.top - 50, on = u > 0.15 && u < 0.85;
        g.save(); g.globalAlpha = Math.min(1, u / 0.15, (1 - u) / 0.15 + 0.01);
        g.fillStyle = LD.alpha(col.dark ? '#e9e4da' : '#f7f5ef', 0.95); g.strokeStyle = LD.alpha(col.text, 0.35); g.lineWidth = 1;
        LD.roundRect(g, wx - 22, wy - 10, 30, 52, 8); g.fill(); g.stroke();
        g.strokeStyle = LD.alpha(col.text, 0.5); g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(wx - 7, wy - 10); g.lineTo(wx - 7, wy - 22); g.quadraticCurveTo(wx - 7, wy - 30, wx + 10, wy - 24); g.stroke();
        g.restore();
        if (on) {
          g.strokeStyle = LD.alpha(col.water, 0.9); g.lineWidth = 2; g.lineCap = 'round';
          g.beginPath(); g.moveTo(wx + 10, wy - 24); g.quadraticCurveTo(G.bx - G.bw * 0.25, wy - 40, G.bx - G.bw * 0.15, yl); g.stroke();
        }
      }
    });
  }
  function drawMicro(g) {
    const cx = G.mx, cy = G.my, r = G.mr;
    const ci = catOf(focus), ai = anOf(focus);
    g.save();
    g.fillStyle = LD.shadowInk(col.dark ? 0.35 : 0.14);
    g.beginPath(); g.arc(cx + 3, cy + 4, r, 0, 7); g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, 7);
    g.fillStyle = LD.alpha(liquidColor(), col.dark ? 0.55 : 0.5); g.fill();
    g.clip();
    // 晶體（有沉澱時）
    const hasP = b.p[focus] > 0;
    const ion = function (i, x, y, rr, a) {
      const c0 = ION_COL[i] || '#999';
      const gr = g.createRadialGradient(x - rr * 0.35, y - rr * 0.35, rr * 0.1, x, y, rr);
      gr.addColorStop(0, LD.alpha(LD.shade(c0, 0.5), a)); gr.addColorStop(1, LD.alpha(LD.shade(c0, -0.2), a));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
    };
    const rc = r * 0.085, ra = r * (S.ION[ai].z === -2 ? 0.11 : 0.1);
    if (hasP) {
      const yT = cy + r * 0.48, step = r * 0.2;
      for (let row = 0; row < 4; row++) {
        for (let k = -6; k <= 6; k++) {
          const x = cx + k * step + (row % 2) * step / 2, y = yT + row * step * 0.9;
          const isC = (k + row) % 2 === 0;
          // 表面的離子微微閃動：離開與回到晶體
          const flick = row === 0 && !reducedMotion ? 0.55 + 0.45 * Math.cos(phase * 2.2 + k * 1.7) : 1;
          ion(isC ? ci : ai, x, y, isC ? rc : ra, flick);
        }
      }
    }
    micro && micro.ions.forEach(function (q) { ion(q.i, cx + q.x * r, cy + q.y * r, q.i === ci ? rc : ra, q.fade); });
    g.restore();
    g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
    // 指向燒杯的虛線
    g.save(); g.setLineDash([3, 4]); g.strokeStyle = LD.alpha(col.text, 0.3); g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - r * 0.72, cy + r * 0.72); g.lineTo(G.bx + G.bw * 0.2, G.bench - G.wall - pileH() - 6); g.stroke(); g.restore();
    // 標題與說明
    const fs = fsz(11);
    rich(g, fP(focus), cx, cy - r - 8, col.text, fsz(12.5), 'center', '700');
    g.font = fs + 'px ' + LD.FONT; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = col.muted;
    const Qr = lastData && lastData.Qr[focus] != null ? lastData.Qr[focus] : null;
    let line;
    if (hasP) line = T('飽和：溶解 ⇄ 沉澱 速率相等', 'Saturated: dissolving ⇄ depositing');
    else if (Qr != null) line = T('未飽和：Q/Ksp = ', 'Unsaturated: Q/Ksp = ') + sigf(Qr, 3);
    else line = T('還沒有這種鹽的離子', 'None of its ions yet');
    const w = g.measureText(line).width;
    const lx = Math.max(w / 2 + 4, Math.min(cw - w / 2 - 4, cx));
    g.fillText(line, lx, cy + r + fs * 1.4);
    // 圖例
    const ly = cy + r + fs * 2.9;
    const lg = function (i, x) { ion(i, x, ly - fs * 0.35, fs * 0.42, 1); return rich(g, ionP(i), x + fs * 0.7, ly, col.text, fs, 'left'); };
    const w1 = richW(g, ionP(ci), fs), w2 = richW(g, ionP(ai), fs);
    const tot = w1 + w2 + fs * 3;
    let x = Math.max(4, Math.min(cw - tot - 4, cx - tot / 2));
    lg(ci, x); x += w1 + fs * 2.2; lg(ai, x);
    g.font = fsz(10) + 'px ' + LD.FONT; g.fillStyle = LD.alpha(col.muted, 0.85);
    const note = T('示意，不照真實比例', 'illustration, not to scale'), nw = g.measureText(note).width;
    g.fillText(note, Math.max(nw / 2 + 4, Math.min(cw - nw / 2 - 4, cx)), ly + fs * 1.5);
  }
  function drawStage() {
    if (!G) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, cw, ch);
    // 桌面
    const tg = g.createLinearGradient(0, G.bench, 0, ch);
    tg.addColorStop(0, LD.alpha(col.bench, col.dark ? 0.55 : 0.6)); tg.addColorStop(1, LD.alpha(col.bench, 0.1));
    g.fillStyle = tg; g.fillRect(0, G.bench, cw, ch - G.bench);
    drawBeaker(g);
    drawTools(g);
    drawMicro(g);
    // 體積
    const fs = fsz(12.5);
    richPill(g, [[T('體積 ', 'Volume ') + mL(b.V) + ' mL', 0]], G.pad + 6, G.pad + fs + 4, col.text, fs, 'left', '600');
    if (b.V >= S.V_MAX - 1e-9) richPill(g, [[T('已滿', 'Full'), 0]], G.pad + 6, G.pad + fs * 2.9 + 4, col.pos, fsz(11), 'left');
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w; gh = w < 560 ? Math.round(Math.max(300, w * 0.85)) : 340;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function drawGraph() {
    if (!gw) return;
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col.bg; g.fillRect(0, 0, gw, gh);
    if (tab === 'q') drawQ(g); else drawBars(g);
    updateLegend();
  }
  function axisFrame(g, L, R, Tp, B) {
    g.strokeStyle = LD.alpha(col.text, 0.12); g.lineWidth = 1;
    g.font = fsz(11) + 'px ' + LD.FONT; g.fillStyle = col.muted;
    return { L: L, R: R, Tp: Tp, B: B };
  }
  function drawQ(g) {
    const k = focus, ci = catOf(k), ai = anOf(k), nc = S.SOLID[k].ions[ci], na = S.SOLID[k].ions[ai];
    const fs = fsz(11);
    const L = 48 + fs, R = gw - 14, Tp = 14, B = gh - 30 - fs * 1.4;
    const X = function (v) { return L + (v - LOG_LO) / (0 - LOG_LO) * (R - L); };
    const Y = function (v) { return B - (v - LOG_LO) / (0 - LOG_LO) * (B - Tp); };
    const lk = Math.log10(S.SOLID[k].Ksp);
    // 過飽和與未飽和區域
    const lineY = function (x) { return (lk - na * x) / nc; };
    g.save();
    g.beginPath(); g.rect(L, Tp, R - L, B - Tp); g.clip();
    g.beginPath(); g.moveTo(X(LOG_LO), Y(lineY(LOG_LO))); g.lineTo(X(0), Y(lineY(0))); g.lineTo(X(0), Y(0)); g.lineTo(X(LOG_LO), Y(0)); g.closePath();
    g.fillStyle = LD.alpha(col.over, col.dark ? 0.12 : 0.08); g.fill();
    g.beginPath(); g.moveTo(X(LOG_LO), Y(lineY(LOG_LO))); g.lineTo(X(0), Y(lineY(0))); g.lineTo(X(0), Y(LOG_LO)); g.lineTo(X(LOG_LO), Y(LOG_LO)); g.closePath();
    g.fillStyle = LD.alpha(col.under, col.dark ? 0.1 : 0.06); g.fill();
    // 格線
    g.strokeStyle = LD.alpha(col.text, 0.1); g.lineWidth = 1;
    for (let v = LOG_LO; v <= 0; v += 2) { g.beginPath(); g.moveTo(X(v), Tp); g.lineTo(X(v), B); g.stroke(); g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(R, Y(v)); g.stroke(); }
    // Ksp 線
    g.strokeStyle = col.accent; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(X(LOG_LO), Y(lineY(LOG_LO))); g.lineTo(X(0), Y(lineY(0))); g.stroke();
    // 純水中的飽和點
    const s0 = S.molarSolubility(k), px = Math.log10(na * s0), py = Math.log10(nc * s0);
    g.fillStyle = col.surface; g.strokeStyle = col.accent; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(X(px), Y(py) - 6); g.lineTo(X(px) + 6, Y(py)); g.lineTo(X(px), Y(py) + 6); g.lineTo(X(px) - 6, Y(py)); g.closePath(); g.fill(); g.stroke();
    // 軌跡
    const pts = steps.map(function (s) { return [s.c[ai] || 0, s.c[ci] || 0, s.p[k] > 0]; }).filter(function (q) { return q[0] > 0 && q[1] > 0; })
      .map(function (q) { return [Math.max(LOG_LO, Math.log10(q[0])), Math.max(LOG_LO, Math.log10(q[1])), q[2]]; });
    if (pts.length) {
      g.strokeStyle = LD.alpha(col.text, 0.45); g.lineWidth = 1.4;
      g.beginPath(); pts.forEach(function (q, i) { if (i) g.lineTo(X(q[0]), Y(q[1])); else g.moveTo(X(q[0]), Y(q[1])); }); g.stroke();
      pts.forEach(function (q, i) {
        const last = i === pts.length - 1;
        g.fillStyle = q[2] ? solidCol(k) : col.surface;
        g.strokeStyle = q[2] ? LD.shade(solidCol(k), -0.45) : col.text; g.lineWidth = last ? 2 : 1;
        g.beginPath(); g.arc(X(q[0]), Y(q[1]), last ? 5.5 : 3, 0, 7); g.fill(); g.stroke();
        if (last) { g.strokeStyle = LD.alpha(col.accent, 0.6); g.lineWidth = 1.5; g.beginPath(); g.arc(X(q[0]), Y(q[1]), 9.5, 0, 7); g.stroke(); }
      });
    }
    g.restore();
    // 區域文字
    g.font = '600 ' + fs + 'px ' + LD.FONT; g.textBaseline = 'alphabetic';
    g.textAlign = 'right'; g.fillStyle = LD.alpha(col.over, 0.9);
    g.fillText(T('Q > Ksp：會沉澱', 'Q > Ksp: precipitates'), R - 6, Tp + fs + 6);
    g.textAlign = 'left'; g.fillStyle = LD.alpha(col.under, 0.9);
    g.fillText(T('Q < Ksp：未飽和', 'Q < Ksp: unsaturated'), L + 6, B - 8);
    // 座標軸
    g.strokeStyle = LD.alpha(col.text, 0.5); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(L, Tp); g.lineTo(L, B); g.lineTo(R, B); g.stroke();
    g.font = fs + 'px ' + LD.FONT; g.fillStyle = col.muted;
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let v = LOG_LO; v <= 0; v += 2) g.fillText(num(v, 0), X(v), B + 4);
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = LOG_LO; v <= 0; v += 2) g.fillText(num(v, 0), L - 5, Y(v));
    const xl = [['log [', 0]].concat(ionP(ai), [[']（M）', 0]]);
    rich(g, xl, (L + R) / 2, gh - 8, col.text, fs, 'center');
    g.save(); g.translate(14, (Tp + B) / 2); g.rotate(-Math.PI / 2);
    rich(g, [['log [', 0]].concat(ionP(ci), [[']（M）', 0]]), 0, 0, col.text, fs, 'center');
    g.restore();
    // Ksp 標籤
    const kx = X(LOG_LO + 1.2), ky = Y(lineY(LOG_LO + 1.2));
    if (ky > Tp + 20 && ky < B - 10) richPill(g, [['Ksp = ', 0]].concat(sciP(S.SOLID[k].Ksp, 3)), kx + 8, ky - 10, col.accent, fs, 'left', '600');
    else richPill(g, fP(k).concat([['  Ksp = ', 0]], sciP(S.SOLID[k].Ksp, 3)), L + 8, Tp + fs * 2.9 + 6, col.accent, fs, 'left', '600');
  }
  function drawBars(g) {
    const ions = S.CATIONS.concat(S.ANIONS, ['Na', 'K', 'NO3']).filter(function (i) { return (b.N[i] || 0) > 0; });
    const fs = fsz(11.5);
    const L = 70 + fs * 2, R = gw - 16, Tp = 18, B = gh - 30;
    if (!ions.length) {
      g.font = fs + 'px ' + LD.FONT; g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(T('燒杯裡只有純水。加入溶液或固體，看各離子的濃度。', 'Only pure water so far. Add a solution or a solid to see the ion concentrations.'), gw / 2, gh / 2);
      return;
    }
    const X = function (v) { return L + (Math.max(LOG_LO, v) - LOG_LO) / (0 - LOG_LO) * (R - L); };
    g.strokeStyle = LD.alpha(col.text, 0.1); g.lineWidth = 1;
    g.font = fsz(10.5) + 'px ' + LD.FONT; g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let v = LOG_LO; v <= 0; v += 2) { g.beginPath(); g.moveTo(X(v), Tp); g.lineTo(X(v), B); g.stroke(); g.fillText(v === 0 ? '1' : '10', X(v) - (v === 0 ? 0 : 3), B + 4); if (v) { g.font = fsz(8) + 'px ' + LD.FONT; g.fillText(num(v, 0), X(v) + 8, B + 1); g.font = fsz(10.5) + 'px ' + LD.FONT; } }
    g.textAlign = 'right'; g.fillText('M', R, B + 16);
    const rowH = Math.min(30, (B - Tp) / ions.length);
    ions.forEach(function (i, r) {
      const y = Tp + r * rowH + rowH / 2, c = b.c[i] || 0, sp = !!S.ION[i].spectator;
      rich(g, ionP(i), L - 8, y + fs * 0.38, sp ? col.muted : col.text, fs, 'right', sp ? '' : '600');
      const bh = Math.min(16, rowH * 0.62);
      const gr = g.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
      const c0 = ION_COL[i] || '#999';
      gr.addColorStop(0, LD.shade(c0, 0.3)); gr.addColorStop(1, LD.shade(c0, -0.15));
      g.fillStyle = sp ? LD.alpha(c0, 0.45) : gr;
      LD.roundRect(g, L, y - bh / 2, Math.max(2, X(Math.log10(Math.max(c, 1e-30))) - L), bh, 3); g.fill();
      const txt = sciP(c, 3).concat([[' M', 0]]);
      const tw = richW(g, txt, fsz(10.5));
      const xe = X(Math.log10(Math.max(c, 1e-30)));
      if (xe + tw + 8 < R) rich(g, txt, xe + 6, y + fsz(10.5) * 0.38, col.text, fsz(10.5), 'left');
      else rich(g, txt, xe - 6, y + fsz(10.5) * 0.38, col.dark ? '#111' : '#fff', fsz(10.5), 'right');
    });
  }
  function updateLegend() {
    let h;
    if (tab === 'q') {
      h = '<span><span class="ln" style="background:' + col.accent + '"></span>' + T('Q = Ksp（飽和線）', 'Q = Ksp (saturation line)') + '</span>　' +
        '<span><span class="sp" style="background:' + col.surface + ';border-color:' + col.accent + ';border-radius:2px;transform:rotate(45deg)"></span>' + T('純水中的飽和溶液', 'saturated in pure water') + '</span>　' +
        '<span><span class="sp" style="background:' + solidCol(focus) + '"></span>' + T('有沉澱', 'precipitate present') + '</span>　' +
        '<span><span class="sp" style="background:' + col.surface + '"></span>' + T('沒有沉澱', 'no precipitate') + '</span>';
      $('gHint').innerHTML = T('每一個點是這個燒杯每一步之後的濃度。有沉澱時，點一定落在飽和線上；點在線的右上方不可能維持，會沉澱到回到線上。', 'Each point shows the concentrations after one step in this beaker. With a precipitate present the point always lies on the line; above the line is impossible to keep — the salt precipitates until the point returns to the line.');
    } else {
      h = '<span><span class="box" style="background:' + ION_COL.Ag + '"></span>' + T('會參與沉澱的離子', 'ions that can precipitate') + '</span>　<span><span class="box" style="background:' + LD.alpha(ION_COL.Na, 0.45) + '"></span>' + T('旁觀離子（不沉澱）', 'spectator ions (never precipitate)') + '</span>';
      $('gHint').innerHTML = T('橫軸是對數刻度：每一格差 100 倍。', 'Logarithmic scale: each grid step is a factor of 100.');
    }
    $('gLegend').innerHTML = h;
  }

  // ======================= 讀數與表格 =======================
  function updateReadouts() {
    let h = '<dt>' + T('溶液體積', 'Volume') + '</dt><dd class="big">' + mL(b.V) + ' mL</dd>';
    const ps = Object.keys(b.p);
    if (ps.length) ps.forEach(function (k) { h += '<dt>' + T('沉澱 ', 'Precipitate ') + fH(k) + '</dt><dd>' + mgHTML(S.pptMg(b, k)) + ' mg</dd>'; });
    else h += '<dt>' + T('沉澱', 'Precipitate') + '</dt><dd>' + T('沒有', 'none') + '</dd>';
    S.CATIONS.concat(S.ANIONS).forEach(function (i) {
      if (!((b.N[i] || 0) > 0)) return;
      h += '<dt>[' + ionH(i) + ']</dt><dd>' + sciHTML(b.c[i] || 0, 3) + ' M</dd>';
    });
    const qr = lastData ? Object.keys(lastData.Qr).sort(function (a, c) { return lastData.Qr[c] - lastData.Qr[a]; }).slice(0, 4) : [];
    qr.forEach(function (k) {
      const v = lastData.Qr[k], sat = b.p[k] > 0;
      h += '<dt>Q/Ksp（' + fH(k) + '）' + (sat ? '<small>' + T('飽和，有沉澱', 'saturated, precipitate present') + '</small>' : '') + '</dt><dd' + (v > 0.999 ? ' class="over"' : '') + '>' + (sat ? '1' : sigf(v, 3)) + '</dd>';
    });
    $('readout').innerHTML = h;
  }
  function renderLog() {
    const t = $('logTbl');
    let h = '<thead><tr><th>#</th><th class="l">' + T('操作', 'Action') + '</th><th>' + T('體積', 'Volume') + '<br><small>mL</small></th><th class="l">' + T('沉澱', 'Precipitate') + '</th></tr></thead><tbody>';
    if (!logRows.length) h += '<tr class="empty"><td colspan="4">' + T('還沒有操作紀錄。', 'Nothing has been added yet.') + '</td></tr>';
    for (let i = logRows.length - 1; i >= 0; i--) {
      const r = logRows[i];
      if (r.sep) { h += '<tr class="empty"><td colspan="4">' + T('── 第 ' + r.beaker + ' 杯：50 mL 純水 ──', '── Beaker ' + r.beaker + ': 50 mL pure water ──') + '</td></tr>'; continue; }
      h += '<tr><td>' + r.n + '</td><td class="l">' + r.what + '</td><td>' + mL(r.V) + '</td><td class="l wrap">' + r.ppt + '</td></tr>';
    }
    t.innerHTML = h + '</tbody>';
  }
  function renderSat() {
    const t = $('satTbl');
    const ks = Object.keys(satRows);
    let h = '<thead><tr><th class="l">' + T('鹽', 'Salt') + '</th><th>Ksp</th><th>' + T('量到的 s', 'measured s') + '<br><small>M</small></th><th>' + T('理論 s', 'theory s') + '<br><small>M</small></th></tr></thead><tbody>';
    if (!ks.length) h += '<tr class="empty"><td colspan="4">' + T('還沒有做過。例如：選 AgCl 加入 10 mg 固體。', 'None yet. Try adding 10 mg of solid AgCl.') + '</td></tr>';
    ks.forEach(function (k) {
      h += '<tr><td class="l">' + fH(k) + '</td><td>' + sciHTML(S.SOLID[k].Ksp, 3) + '</td><td>' + sciHTML(satRows[k].s, 3) + '</td><td>' + sciHTML(S.molarSolubility(k), 3) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  function buildDataTable() {
    const t = $('dataTable');
    if (!t) return;
    let h = '<thead><tr><th class="l">' + T('難溶鹽', 'Salt') + '</th><th class="l">' + T('顏色', 'Colour') + '</th><th>Ksp</th><th>' + T('純水中的 s', 's in pure water') + '<br><small>M</small></th></tr></thead><tbody>';
    SOLID_KEYS.forEach(function (k) {
      h += '<tr><td class="l">' + fH(k) + '　' + nm(S.SOLID[k]) + '</td><td class="l"><span class="sp" style="display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;vertical-align:-1px;border:1px solid var(--border);background:' + rgbStr(S.SOLID[k].rgb) + '"></span>' + colorWord(k) + '</td><td>' + sciHTML(S.SOLID[k].Ksp, 3) + '</td><td>' + sciHTML(S.molarSolubility(k), 3) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function refreshAll() {
    showOutputs();
    syncSegs();
    updateButtons();
    updateReadouts();
    renderLog();
    renderSat();
    drawStage();
    drawGraph();
  }

  // ======================= 事件 =======================
  $('solnSeg').addEventListener('click', function (e) {
    const x = e.target.closest('button[data-soln]');
    if (!x) return;
    soln = x.dataset.soln; syncSegs();
  });
  [el.conc, el.mass].forEach(function (e) { e.addEventListener('input', function () { if (!syncing) showOutputs(); }); e.addEventListener('change', showOutputs); });
  $('addDrop').addEventListener('click', function () { act('soln', soln, S.DROP); });
  $('add1').addEventListener('click', function () { act('soln', soln, 1); });
  $('add10').addEventListener('click', function () { act('soln', soln, 10); });
  $('addSolid').addEventListener('click', function () { act('solid', el.solidSel.value, massV()); });
  $('water1').addEventListener('click', function () { act('water', 'water', 1); });
  $('water10').addEventListener('click', function () { act('water', 'water', 10); });
  $('newBeaker').addEventListener('click', function () { newBeaker(); });
  $('clearAll').addEventListener('click', function () {
    logRows = []; satRows = {}; sats = []; stepNo = 0; beakerNo = 0;
    newBeaker(T('全部清除：紀錄、軌跡與飽和溶液比較表都清空了，換了一個裝 50 mL 純水的乾淨燒杯。', 'Everything cleared: the log, the trail and the saturated-solution table. A clean beaker with 50 mL of pure water.'));
    logRows = [];
    renderLog();
  });
  el.kspSel.addEventListener('change', function () {
    if (el.kspSel.value === 'auto') { focusManual = false; if (lastData) focus = pickFocus(lastData); }
    else { focusManual = true; focus = el.kspSel.value; }
    drawGraph(); drawStage(); startLoop();
  });
  $('tabs').addEventListener('click', function (e) {
    const x = e.target.closest('button[data-tab]');
    if (!x) return;
    tab = x.dataset.tab; syncSegs(); drawGraph();
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
    if (ev.detail && ev.detail.name === 'lang') { buildControls(); buildDataTable(); refreshAll(); updateSoundButton(); }
  });
  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    buildDataTable();
    refreshAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);

  // 測試用（Playwright）：讀取燒杯、直接操作
  window.__se = {
    beaker: function () { return b; }, sats: function () { return sats.slice(); }, focus: function () { return focus; }, steps: function () { return steps.length; },
    add: function (kind, key, amt, conc) { if (conc != null && window.LabNum) window.LabNum.set(el.conc, conc); act(kind, key, amt); },
    reset: function () { newBeaker(); }
  };

  // ======================= 啟動 =======================
  readColors();
  buildControls();
  if (window.LabNum) { syncing = true; window.LabNum.set(el.conc, 0.1); window.LabNum.set(el.mass, 10); syncing = false; }
  cw = cv.clientWidth || 600; ch = 440; layout();
  buildDataTable();
  updateSoundButton();
  resize();
  refreshAll();
  startLoop();
})();
