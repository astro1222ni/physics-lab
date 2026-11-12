/* 任務可達成的證明腳本。用法：node tools/mission-proofs/image-digitization.js
 * 用計算核心模擬頁面（js/image-digitization.js）送出的事件，證明：
 *   1. 每個任務在滑桿範圍與精度內做得到（印出解法）；
 *   2. 預設狀態不觸發任何任務（含點選預設畫面上的每一個像素）；
 *   3. 十個隱藏任務的解法彼此不會順便完成另一個隱藏任務（交叉檢查表）；
 *   4. 沒有靠運氣的任務（取樣與量化都是確定的）；
 *   5. 固定種子的亂按模擬（像學生隨便點每一個控制項，400 人 × 每人 300 次），每個任務被碰巧完成的比例；隱藏任務都要 < 2%。
 * 事件資料和頁面一樣；為了跑得快，比較貴的欄位（實際用到的顏色數、色帶、像素值）只在任務真的讀到時才計算，結果和頁面相同（第 0 節核對）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/image-digitization-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/image-digitization.js');
const byId = id => missions.find(m => m.id === 'image-digitization-' + id);
const hidden = missions.filter(m => m.hidden);
let fail = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { fail++; console.log('  ✗ ' + msg); } };

// =====================================================================
// 單一像素的取樣與量化（和核心的 sample()、quantize() 逐步相同，數值存成 32 位元浮點數）
// =====================================================================
const f32 = Math.fround;
function pixelSample(scene, w, h, method, i, j) {
  if (scene === 'checker') {
    const g = method === 'center' ? (((K.checkerCol(i, w) + K.checkerRow(j, h)) % 2 === 0) ? 255 : 0)
      : 255 * (1 + K.sqAvg(i / w, (i + 1) / w, K.CHECK_NX) * K.sqAvg(j / h, (j + 1) / h, K.CHECK_NY)) / 2;
    return [f32(g), f32(g), f32(g)];
  }
  if (scene === 'eyechart') {
    const g = method === 'center' ? (K.eyeInkCenter(i, j, w, h) ? 0 : 255)
      : 255 * (1 - K.eyeCoverage(K.EU * i / w, K.EV * j / h, K.EU * (i + 1) / w, K.EV * (j + 1) / h));
    return [f32(g), f32(g), f32(g)];
  }
  if (method === 'center') return K.colorAt(scene, (i + 0.5) / w, (j + 0.5) / h).map(f32);
  const s = K.subSamples(w, h), n = s * s;
  let r = 0, g = 0, b = 0;
  for (let a = 0; a < s; a++) {
    const u = (i + (a + 0.5) / s) / w;
    for (let c = 0; c < s; c++) { const p = K.colorAt(scene, u, (j + (c + 0.5) / s) / h); r += p[0]; g += p[1]; b += p[2]; }
  }
  return [f32(r / n), f32(g / n), f32(b / n)];
}
function quantPixel(samp, mode, b) {
  const L = (1 << b) - 1, q = x => Math.max(0, Math.min(L, Math.round(x / 255 * L))), d = c => Math.round(c * 255 / L);
  if (mode === 'gray') { const c = q(K.luma(samp[0], samp[1], samp[2])); return { code: [c], disp: [d(c)], rgb: [d(c), d(c), d(c)] }; }
  const c = samp.map(q);
  return { code: c, disp: c.map(d), rgb: c.map(d) };
}
// 整張圖：實際用到的顏色數（用到時才算，有快取）
const sampleCache = new Map(), colorsCache = new Map();
function samplesOf(scene, w, h, method) {
  const k = scene + '|' + w + '|' + h + '|' + method;
  let s = sampleCache.get(k);
  if (!s) { s = K.sample(scene, w, h, method); sampleCache.set(k, s); if (sampleCache.size > 24) sampleCache.delete(sampleCache.keys().next().value); }
  return s;
}
function colorsOf(st) {
  const k = [st.scene, st.w, st.h, st.method, st.mode, st.b].join('|');
  let c = colorsCache.get(k);
  if (c == null) { c = K.quantize(samplesOf(st.scene, st.w, st.h, st.method), st.w, st.h, st.mode, st.b).colors; colorsCache.set(k, c); }
  return c;
}
// 山景日落的色帶：只需要量測線那一欄
const bandCache = new Map();
function bandOf(st) {
  const k = [st.w, st.h, st.method, st.mode, st.b].join('|');
  let r = bandCache.get(k);
  if (!r) {
    const i = Math.min(st.w - 1, Math.floor(K.BAND_U * st.w)), s = new Float32Array(st.w * st.h * 3);
    for (let j = 0; j < st.h; j++) { const p = pixelSample('sunset', st.w, st.h, st.method, i, j); s.set(p, (j * st.w + i) * 3); }
    r = K.skyBand(s, st.w, st.h, st.mode, st.b);
    bandCache.set(k, r);
  }
  return r;
}

// =====================================================================
// 和頁面相同的事件模擬
// =====================================================================
class Sim {
  constructor() {
    this.s = { scene: 'sunset', w: 64, h: 48, lock: true, method: 'center', mode: 'color', b: 8, split: 0.5, nyq: true, view: '2d', sel: null };
    this.ev = []; this.ver = 0; this.lastPick = '';
  }
  snap() { const s = this.s, bpp = K.bppOf(s.mode, s.b); return { w: s.w, h: s.h, bpp: bpp, bits: s.w * s.h * bpp, method: s.method, mode: s.mode, b: s.b, scene: s.scene }; }
  /** 改設定（和頁面的 changed(src) 一樣：重算後送 'image'，有選取像素時再送 'probe'） */
  change(src, fn) {
    const prev = this.snap();
    fn(this.s);
    this.ver++;
    this.emitImage(src, prev);
    if (this.s.sel) this.emitProbe('settings');
    return this;
  }
  emitImage(src, prev) {
    const st = Object.assign({}, this.s), bpp = K.bppOf(st.mode, st.b), bits = st.w * st.h * bpp;
    const d = {
      src: src, scene: st.scene, w: st.w, h: st.h, lock: st.lock, mode: st.mode, b: st.b, bpp: bpp, method: st.method,
      bits: bits, bytes: Math.ceil(bits / 8), levels: 1 << st.b,
      faithful: st.scene === 'checker' && K.checkerFaithful(st.w, st.h),
      eyeRows: st.scene === 'eyechart' ? K.eyeRowsExact(st.w, st.h) : 0,
      view: st.view, nyq: st.nyq, prev: prev
    };
    const lazy = (name, fn) => { let v, done = false; Object.defineProperty(d, name, { enumerable: true, get: () => { if (!done) { v = fn(); done = true; } return v; } }); };
    lazy('colors', () => colorsOf(st));
    lazy('uniform', () => colorsOf(st) === 1);
    lazy('band', () => st.scene === 'sunset' ? bandOf(st).band : 0);
    lazy('bandPrev', () => st.scene === 'sunset' ? bandOf(st).bandPrev : null);
    lazy('bandRows', () => st.scene === 'sunset' ? bandOf(st).rows : 0);
    this.ev.push({ type: 'image', data: d });
  }
  pixel() {
    const s = this.s; if (!s.sel) return null;
    return { i: Math.max(0, Math.min(s.w - 1, Math.floor(s.sel.u * s.w))), j: Math.max(0, Math.min(s.h - 1, Math.floor(s.sel.v * s.h))) };
  }
  emitProbe(src) {
    const p = this.pixel(); if (!p) return;
    const st = Object.assign({}, this.s);
    const d = { src: src, scene: st.scene, w: st.w, h: st.h, i: p.i, j: p.j, method: st.method, mode: st.mode, b: st.b,
      key: [st.scene, st.w, st.h, p.i, p.j, st.method].join('|'), hue: null, sat: null };
    if (st.scene === 'wheel') { const pol = K.wheelPolar((p.i + 0.5) / st.w, (p.j + 0.5) / st.h); if (pol) { d.hue = pol.hue; d.sat = pol.sat; } }
    let px = null;
    const get = () => { if (!px) { const samp = pixelSample(st.scene, st.w, st.h, st.method, p.i, p.j); px = Object.assign({ samp: samp, y: K.luma(samp[0], samp[1], samp[2]) }, quantPixel(samp, st.mode, st.b)); } return px; };
    ['samp', 'y', 'code', 'disp', 'rgb'].forEach(k => Object.defineProperty(d, k, { enumerable: true, get: () => get()[k] }));
    Object.defineProperty(d, 'gray', { enumerable: true, get: () => st.mode === 'gray' ? get().disp[0] : null });
    this.ev.push({ type: 'probe', data: d });
  }
  // ---- 操作（和頁面的控制項一一對應） ----
  scene(sc) { return this.change('scene', s => { s.scene = sc; }); }
  setW(w) { return this.change('w', s => { s.w = w; if (s.lock) s.h = K.heightFor(w); }); }
  setH(h) { return this.change('h', s => { s.h = h; if (s.lock) s.w = K.widthFor(h); }); }
  lock(on) { return this.change('lock', s => { s.lock = on; if (on) s.h = K.heightFor(s.w); }); }
  method(m) { return this.change('method', s => { s.method = m; }); }
  mode(m) { return this.change('mode', s => { s.mode = m; }); }
  bits(b) { return this.change('b', s => { s.b = b; }); }
  nyq(on) { return this.change('nyq', s => { s.nyq = on; }); }
  view(v) { if (v === this.s.view) return this; return this.change('view', s => { s.view = v; }); }
  /** 點選像素（u, v 是 0–1 的位置）；和頁面一樣，同一張圖的同一個像素不重送 */
  pick(u, v) {
    this.s.sel = { u: Math.max(0, Math.min(0.999999, u)), v: Math.max(0, Math.min(0.999999, v)) };
    const p = this.pixel(), key = this.ver + '|' + p.i + '|' + p.j;
    if (key !== this.lastPick) { this.lastPick = key; this.emitProbe('pick'); }
    return this;
  }
  pickPx(i, j) { return this.pick((i + 0.5) / this.s.w, (j + 0.5) / this.s.h); }
  clearAll() { this.s.sel = null; return this; }
  rotate(dir) { if (this.s.view === '3d') this.ev.push({ type: 'rotate3d', data: { dir: dir, scene: this.s.scene, mode: this.s.mode, b: this.s.b } }); return this; }
}
function run(m, events) {
  const mm = Object.assign({}, m, { mem: {} });
  for (const ev of events) if (mm.check(ev, mm.mem)) return true;
  return false;
}
function expect(id, sim, want, note) {
  const got = run(byId(id), sim.ev);
  ok(got === want, (byId(id).hidden ? '隱藏 ' : '') + id.padEnd(4) + (want ? '做得到：' : '不會觸發：') + note);
  return got;
}

// =====================================================================
// 0. 單一像素的計算和核心整張圖的計算一致
// =====================================================================
console.log('0. 單一像素的取樣與量化和核心 sample()／quantize() 完全一致：');
{
  let bad = 0, n = 0;
  const cfgs = [['sunset', 64, 48], ['checker', 50, 37], ['rings', 128, 96], ['eyechart', 100, 75], ['wheel', 33, 25], ['sunset', 7, 5]];
  cfgs.forEach(c => ['center', 'area'].forEach(method => ['gray', 'color'].forEach(mode => [1, 3, 8].forEach(b => {
    const [sc, w, h] = c, s = K.sample(sc, w, h, method), q = K.quantize(s, w, h, mode, b);
    for (let k = 0; k < w * h; k += 7) {
      const i = k % w, j = Math.floor(k / w), p = quantPixel(pixelSample(sc, w, h, method, i, j), mode, b);
      n++;
      if (p.rgb[0] !== q.rgba[k * 4] || p.rgb[1] !== q.rgba[k * 4 + 1] || p.rgb[2] !== q.rgba[k * 4 + 2]) bad++;
    }
  }))));
  ok(bad === 0, '抽查 ' + n + ' 個像素，' + (bad ? bad + ' 個不同' : '全部相同'));
}

// =====================================================================
// 1. 每個任務都做得到（從預設狀態開始，印出解法）
// =====================================================================
console.log('\n1. 每個任務都做得到（從預設狀態：山景日落、64 × 48、彩色 8 位元、取每格中心點開始）：');
/** 在目前的圖上找第一個符合條件的像素 */
function findPixel(sim, test) {
  const s = sim.s;
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const samp = pixelSample(s.scene, s.w, s.h, s.method, i, j), q = quantPixel(samp, s.mode, s.b);
    let hue = null, sat = null;
    if (s.scene === 'wheel') { const p = K.wheelPolar((i + 0.5) / s.w, (j + 0.5) / s.h); if (p) { hue = p.hue; sat = p.sat; } }
    const info = { i: i, j: j, samp: samp, y: K.luma(samp[0], samp[1], samp[2]), rgb: q.rgb, disp: q.disp, hue: hue, sat: sat };
    if (test(info)) return info;
  }
  return null;
}
const sol = {};
{
  sol[1] = new Sim().mode('gray').bits(1);
  expect('1', sol[1], true, '按「灰階」、位元數 1');

  const s2 = new Sim().scene('wheel').bits(3);
  const red = findPixel(s2, p => p.rgb[0] === 255 && p.rgb[1] === 0 && p.rgb[2] === 0);
  s2.pickPx(red.i, red.j);
  sol[2] = s2;
  expect('2', s2, true, '色相環、彩色 3 位元，點像素 (' + red.i + ', ' + red.j + ')，存下 (255, 0, 0)（8 位元時整張圖沒有純紅：邊緣的 G、B 不會剛好是 0）');

  sol[3] = new Sim().scene('wheel').bits(1);
  expect('3', sol[3], true, '色相環、彩色 1 位元：用到 ' + colorsOf(sol[3].s) + ' 種顏色（立方體的 8 個角；山景日落只有 ' + colorsOf(Object.assign({}, sol[3].s, { scene: 'sunset' })) + ' 種）');

  sol[4] = new Sim().view('3d').bits(2);
  expect('4', sol[4], true, '按「3D 色立方」、彩色 2 位元');

  sol[5] = new Sim().setW(128);
  expect('5', sol[5], true, '寬 64 → 128（固定 4:3，高 48 → 96），檔案 9,216 → 36,864 位元組（4 倍）');

  sol[6] = new Sim().lock(false).setW(32).setH(32).mode('gray');
  expect('6', sol[6], true, '取消固定 4:3、32 × 32、灰階 8 位元 = 8,192 位元 = 1,024 位元組（固定 4:3 時沒有解：測試已窮舉）');

  sol[7] = new Sim().scene('rings').method('center').setW(64).method('area');
  expect('7', sol[7], true, '同心圓、取每格中心點、寬 64，再按「整格平均」');

  sol[8] = new Sim().mode('gray').setW(80).bits(2).setW(160);
  expect('8', sol[8], true, '灰階：80 × 60 × 8 位元 = 160 × 120 × 2 位元 = 38,400 位元（像素差 4 倍）');

  sol[9] = new Sim().scene('rings').setW(256);
  expect('9', sol[9], true, '同心圓、奈奎斯特範圍（預設勾選）、寬 256：框的半寬 = 256 ÷ 512 = 0.5 個畫面寬');

  const s10 = new Sim().setW(160);
  let found = null;
  for (let b = 8; b >= 2; b--) { const st = Object.assign({}, s10.s, { b: b }); const r = bandOf(st); if (r.band === 1 && r.bandPrev > 1) found = b; }
  s10.bits(found);
  sol[10] = s10;
  const r10 = bandOf(s10.s);
  expect('10', s10, true, '山景日落、彩色、160 × 120：' + found + ' 位元時最長色帶 ' + r10.band + ' 列、' + (found - 1) + ' 位元時 ' + r10.bandPrev + ' 列（320 × 240 要 8 位元）');

  sol[11] = new Sim().scene('eyechart').setW(100).mode('gray').bits(1);
  expect('11', sol[11], true, '視力表、100 × 75（第三列筆畫 = 200 ÷ 5 ÷ 4000 × 100 = 1 像素）、灰階 1 位元 = 7,500 位元 = 938 位元組');

  sol[12] = new Sim().scene('checker').setW(48);
  expect('12', sol[12], true, '棋盤、48 × 36（每個方格剛好 2 × 2 個像素；96 × 72、144 × 108… 也可以）');

  // ---- 隱藏任務 ----
  const h1 = new Sim().scene('wheel').mode('gray');
  const yel = findPixel(h1, p => p.sat >= 0.8 && Math.abs(p.hue - 60) <= 12), blu = findPixel(h1, p => p.sat >= 0.8 && Math.abs(p.hue - 240) <= 12);
  h1.pickPx(yel.i, yel.j).pickPx(blu.i, blu.j);
  sol.h1 = h1;
  expect('h1', h1, true, '色相環、灰階：先點黃色邊緣 (' + yel.i + ', ' + yel.j + ')（存下 ' + yel.disp[0] + '），再點藍色邊緣 (' + blu.i + ', ' + blu.j + ')（存下 ' + blu.disp[0] + '）');

  const h2 = new Sim().scene('wheel').mode('gray');
  let pair = null;
  const edge = [];
  for (let j = 0; j < h2.s.h; j++) for (let i = 0; i < h2.s.w; i++) {
    const p = K.wheelPolar((i + 0.5) / h2.s.w, (j + 0.5) / h2.s.h);
    if (p && p.sat >= 0.8) edge.push({ i: i, j: j, hue: p.hue, g: quantPixel(pixelSample('wheel', h2.s.w, h2.s.h, 'center', i, j), 'gray', 8).disp[0] });
  }
  for (let a = 0; a < edge.length && !pair; a++) for (let b = a + 1; b < edge.length; b++) {
    const d = Math.abs(edge[a].hue - edge[b].hue) % 360;
    if (edge[a].g === edge[b].g && Math.min(d, 360 - d) >= 90) { pair = [edge[a], edge[b]]; break; }
  }
  h2.pickPx(pair[0].i, pair[0].j).pickPx(pair[1].i, pair[1].j);
  sol.h2 = h2;
  expect('h2', h2, true, '色相環、灰階 8 位元：色相 ' + pair[0].hue.toFixed(0) + '° 的 (' + pair[0].i + ', ' + pair[0].j + ') 和 ' + pair[1].hue.toFixed(0) + '° 的 (' + pair[1].i + ', ' + pair[1].j + ') 都存成 ' + pair[0].g);

  sol.h3 = new Sim().scene('checker').setW(48).mode('gray').bits(1);
  expect('h3', sol.h3, true, '棋盤、48 × 36、灰階 1 位元 = 1,728 位元 = 216 位元組，和原圖一模一樣');

  sol.h4 = new Sim().lock(false).setW(160).setH(144).mode('gray').bits(2);
  expect('h4', sol.h4, true, 'Game Boy（1989）：取消固定 4:3、160 × 144、灰階 2 位元（4 階）= 5,760 位元組');

  sol.h5 = new Sim().scene('checker').setW(12).method('area');
  expect('h5', sol.h5, true, '棋盤、12 × 9：取每格中心點時每個取樣點都落在白格上，整張全白（≥ 100 像素只有這一組，測試已窮舉）；改「整格平均」每格剛好蓋住黑白各半，整張全灰');
  expect('h5', new Sim().scene('checker').setW(12), false, '只用取每格中心點看到全白還不算（要兩種看法都不見）');

  sol.h6 = new Sim().lock(false).setW(320).setH(200).mode('gray');
  expect('h6', sol.h6, true, 'VGA 13h 模式（1987）：取消固定 4:3、320 × 200、灰階 8 位元 = 64,000 位元組（一段 64 KiB = 65,536 位元組的記憶體）');

  sol.h7 = new Sim().scene('wheel').view('3d').rotate([1, 1, 1].map(x => x / Math.sqrt(3)));
  expect('h7', sol.h7, true, '色相環、彩色、3D 色立方：轉到從白色角沿灰階對角線看向黑色角（夾角 ≤ 4°），點雲投影成六邊形的色相環');

  sol.h8 = new Sim().scene('eyechart').setW(200).method('area');
  expect('h8', sol.h8, true, '視力表、200 × 150、整格平均：前 4 列每一條邊都落在像素格線上（第 5 列筆畫 0.5 像素做不到），連一點灰邊都沒有');

  // 找一個亮度在 84.5–85.5 之間的像素（依序試幾張圖與寬度）
  let h9 = null, p85 = null, where = '';
  for (const cfg of [['rings', 64], ['sunset', 64], ['rings', 128], ['sunset', 128], ['wheel', 64]]) {
    const t = new Sim().scene(cfg[0]).mode('gray');
    if (cfg[1] !== 64) t.setW(cfg[1]);
    p85 = findPixel(t, p => p.disp[0] === 85 && quantPixel(p.samp, 'gray', 2).disp[0] === 85 && quantPixel(p.samp, 'gray', 4).disp[0] === 85);
    if (p85) { h9 = t; where = (cfg[0] === 'rings' ? '同心圓' : cfg[0] === 'sunset' ? '山景日落' : '色相環') + '、' + t.s.w + ' × ' + t.s.h; break; }
  }
  h9.pickPx(p85.i, p85.j).bits(2).bits(4);
  sol.h9 = h9;
  expect('h9', h9, true, where + '、灰階：點亮度 ' + p85.y.toFixed(2) + ' 的像素 (' + p85.i + ', ' + p85.j + ')，8、2、4 位元都存成 85（85 = 255 ÷ 3 = 255 × 5 ÷ 15 = 255 × 21 ÷ 63；170 也可以）');

  sol.h10 = new Sim().scene('rings').lock(false).setW(128).setH(72);
  expect('h10', sol.h10, true, '同心圓、取每格中心點、取消固定 4:3、128 × 72：假的圓心在 x = ±128 ÷ 256 = ±0.5（左右兩邊）與 y = ±72 ÷ 0.75 ÷ 256 = ±0.375（上下兩邊），平移半張圖亮暗剛好相反');
  expect('h10', new Sim().scene('rings').setW(128), false, '固定 4:3 的 128 × 96 只有左右兩邊（上下的假圓心在圖外）');
}

// =====================================================================
// 2. 預設狀態不觸發
// =====================================================================
console.log('\n2. 預設狀態不觸發：');
{
  const s = new Sim();
  s.emitImage('nyq', s.snap());
  for (let j = 0; j < s.s.h; j++) for (let i = 0; i < s.s.w; i++) s.pickPx(i, j);
  const hit = missions.filter(m => run(m, s.ev)).map(m => m.id);
  ok(hit.length === 0, '預設畫面送出 image 事件，並逐一點選全部 3,072 個像素：' + (hit.length ? '觸發了 ' + hit.join('、') : '沒有任何任務完成'));
  const s2 = new Sim().view('3d');
  s2.rotate(new Float64Array([2.0, 1.0, 2.4]).map(x => x / Math.hypot(2.0, 1.0, 2.4)));
  const hit2 = missions.filter(m => run(m, s2.ev) && m.id !== 'image-digitization-4').map(m => m.id);
  ok(hit2.length === 0, '打開 3D 色立方、預設視角（離灰階對角線約 18°）：' + (hit2.length ? '觸發了 ' + hit2.join('、') : '只有公開任務 4 以外都沒完成（4 要先改成 2 位元）'));
  ok(!run(byId('4'), s2.ev), '公開任務 4 在預設的 8 位元不會完成');
}

// =====================================================================
// 3. 隱藏任務的解法互不連帶
// =====================================================================
console.log('\n3. 隱藏任務交叉檢查（列：照這個解法做；欄：哪些隱藏任務被完成）：');
{
  const ids = hidden.map(m => m.id.replace('image-digitization-', ''));
  console.log('        ' + ids.map(x => x.padStart(4)).join(''));
  let cross = 0;
  ids.forEach(a => {
    const row = ids.map(b => { const got = run(byId(b), sol[a].ev); if (got && a !== b) cross++; return (got ? (a === b ? '●' : '✗') : '·').padStart(4); });
    console.log('  ' + a.padEnd(6) + row.join(''));
  });
  ok(cross === 0, cross ? '有 ' + cross + ' 格連帶完成' : '每個解法只完成自己（對角線 ●）');
  // 公開任務的解法也不會順便完成隱藏任務
  const pubHit = [];
  for (let k = 1; k <= 12; k++) hidden.forEach(m => { if (run(m, sol[k].ev)) pubHit.push(k + '→' + m.id.replace('image-digitization-', '')); });
  ok(pubHit.length === 0, '12 個公開任務的解法都不會順便完成隱藏任務' + (pubHit.length ? '：' + pubHit.join('、') : ''));
}

// =====================================================================
// 4. 靠運氣的任務
// =====================================================================
console.log('\n4. 靠運氣的任務：沒有。取樣、量化、檔案大小都是確定的計算，同樣的操作永遠得到同樣的結果。');

// =====================================================================
// 5. 亂按模擬（像試玩工具：按鈕 30、滑桿 25〔最小 20%、最大 20%、隨機位置 60%〕、數字直接輸入 10、勾選框 8、畫布 15、等待 4）
// =====================================================================
const PEOPLE = +process.env.PEOPLE || 400, STEPS = 300;   // 環境變數 PEOPLE 可以加大人數（例如 4000）看更精確的比例
console.log('\n5. 亂按模擬：' + PEOPLE + ' 人 × 每人 ' + STEPS + ' 個隨機操作（固定種子 1112）：');
{
  let seed = 1112;
  const rand = () => {   // mulberry32（32 位元整數運算，不會有浮點數精度問題）
    seed = (seed + 0x6D2B79F5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const NUM = ['0', '-5', '-0.0001', '99999999', '3.14159265358979', '1e9', '0.000001'];
  const clampInt = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(x)));
  const slide = (lo, hi) => { const m = rand(); return m < 0.2 ? lo : m < 0.4 ? hi : clampInt(lo + (0.02 + 0.96 * rand()) * (hi - lo), lo, hi); };
  const typed = (lo, hi) => { const v = parseFloat(NUM[Math.floor(rand() * NUM.length)]); return clampInt(v, lo, hi); };
  const hits = {};
  missions.forEach(m => { hits[m.id] = 0; });
  const t0 = Date.now();
  for (let r = 0; r < PEOPLE; r++) {
    const s = new Sim();
    for (let k = 0; k < STEPS; k++) {
      const in3d = s.s.view === '3d';
      const W = { button: 30, range: 25, num: 10, check: 8, canvas: 15, wait: 4 };
      let u = rand() * 92, kind = 'wait';
      for (const kk of Object.keys(W)) { if ((u -= W[kk]) < 0) { kind = kk; break; } }
      if (kind === 'button') {
        // 2D 檢視、3D 色立方、音效、五張原圖、取樣兩種、色彩兩種、記下這一組、全部清除（3D 時多重設視角、重播吸附）、頁面其他按鈕 3 個
        const btns = ['v2', 'v3', 'snd', 'sunset', 'checker', 'rings', 'eyechart', 'wheel', 'center', 'area', 'gray', 'color', 'rec', 'wipe', 'o1', 'o2', 'o3'].concat(in3d ? ['reset', 'replay'] : []);
        const b = btns[Math.floor(rand() * btns.length)];
        if (b === 'v2') s.view('2d'); else if (b === 'v3') s.view('3d');
        else if (K.SCENES.indexOf(b) >= 0) s.scene(b);
        else if (b === 'center' || b === 'area') s.method(b);
        else if (b === 'gray' || b === 'color') s.mode(b);
        else if (b === 'wipe') s.clearAll();
      } else if (kind === 'range' || kind === 'num') {
        const which = Math.floor(rand() * 4), pickV = kind === 'range' ? slide : typed;
        if (which === 0) s.setW(pickV(1, K.W_MAX)); else if (which === 1) s.setH(pickV(1, K.H_MAX));
        else if (which === 2) s.bits(pickV(1, 8)); else s.s.split = pickV(0, 100) / 100;
      } else if (kind === 'check') {
        const boxes = ['lock', 'grid', 'dots'].concat(s.s.scene === 'rings' ? ['nyq'] : []);
        const b = boxes[Math.floor(rand() * boxes.length)];
        if (b === 'lock') s.lock(!s.s.lock); else if (b === 'nyq') s.nyq(!s.s.nyq);
      } else if (kind === 'canvas') {
        const onMain = rand() < 0.5;   // 主畫布（2D 圖片或 3D 色立方）或下面的階梯圖
        const p = [rand(), rand(), rand(), rand()], tap = rand() < 0.3;
        if (!onMain) continue;
        if (in3d) {
          if (!tap) { // 拖曳旋轉：放開後的視線方向當成球面上均勻分布（比真實更容易轉到任何方向，較保守）
            const z = 2 * rand() - 1, th = 2 * Math.PI * rand(), q = Math.sqrt(1 - z * z);
            s.rotate([q * Math.cos(th), z, q * Math.sin(th)]);
          }
        } else {
          const U = f => 0.05 + 0.9 * f;
          if (Math.abs(U(p[0]) - s.s.split) < 0.02) { s.s.split = tap ? s.s.split : U(p[2]); continue; }   // 抓到分界線
          if (tap) s.pick(U(p[0]), U(p[1]));
          else for (let t = 0; t <= 6; t++) s.pick(U(p[0] + (p[2] - p[0]) * t / 6), U(p[1] + (p[3] - p[1]) * t / 6));
        }
      }
    }
    missions.forEach(m => { if (run(m, s.ev)) hits[m.id]++; });
  }
  let worst = 0;
  missions.forEach(m => {
    const p = hits[m.id] / PEOPLE;
    if (m.hidden) worst = Math.max(worst, p);
    console.log('  ' + (m.hidden ? '隱藏 ' : '公開 ') + m.id.replace('image-digitization-', '').padEnd(4) + (p * 100).toFixed(2).padStart(6) + '%');
  });
  console.log('  （模擬花了 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒）');
  ok(worst < 0.02, '每個隱藏任務被亂按完成的比例都在 2% 以下（最高 ' + (worst * 100).toFixed(2) + '%）');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態不觸發，隱藏任務互不連帶、亂按也很難碰巧完成。');
process.exitCode = fail ? 1 : 0;
