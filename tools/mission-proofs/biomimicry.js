/* 任務可達成的證明腳本。用法：node tools/mission-proofs/biomimicry.js
 * 用仿生學核心（js/biomimicry-core.js）照頁面的做法算出 'drop'、'roll'、'clean'、'gecko'、'pad' 事件（與 js/biomimicry.js 相同的計算），
 * 再用任務檔（js/missions/biomimicry.js）同一份 check 函式判定。每個任務都給出一組做得到的操作、對照組，並檢查預設狀態不會誤觸。
 * 修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const B = require(ROOT + 'js/biomimicry-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/biomimicry.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('biomimicry-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);
const all = ev => defs.filter(m => m.check(ev, {})).map(m => m.id.replace('biomimicry-', ''));

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const f = (v, d) => (v == null || !isFinite(v)) ? '—' : v.toFixed(d);

// ---------- 與 js/biomimicry.js 相同的計算 ----------
const MAT = id => B.MATERIALS.find(m => m.id === id);
const DEF = { mat: 'wax', a: 10, b: 10, h: 20, V: 10, tilt: 0 };
function setting(o) {
  const p = Object.assign({}, DEF, o);
  const m = MAT(p.mat) || { thY: p.thY, hyst: p.hyst };
  p.thY = p.thY != null && !MAT(p.mat) ? p.thY : m.thY;
  p.hyst = p.hyst != null && !MAT(p.mat) ? p.hyst : m.hyst;
  return p;
}
function dropEv(o, v, isRain) {
  const p = setting(o);
  const s = B.drop({ a: p.a, b: p.b, h: p.h, thY: p.thY, hyst: p.hyst, V: p.V, v: v || 0 });
  const g = B.drop({ a: p.a, b: p.b, h: p.h, thY: p.thY, hyst: p.hyst, V: p.V, v: 0 });
  return { type: 'drop', data: {
    mat: MAT(p.mat) ? p.mat : 'custom', thY: s.thY, hyst: p.hyst, a: p.a, b: p.b, h: p.h, smooth: s.smooth, V: p.V,
    mode: s.mode, theta: s.theta, thA: s.thA, thR: s.thR, roll: s.roll, r: s.r, phi: s.phi, thc: s.thc,
    Pcrit: s.Pcrit, Pdyn: s.Pdyn, impaled: s.impaled, metastable: s.metastable,
    rain: !!isRain, v: v || 0, tilt: p.tilt, gentleMode: g.mode, gentleRoll: g.roll, stuck: s.roll == null || s.roll >= p.tilt
  } };
}
const ddesc = d => `${d.mat} θY ${f(d.thY, 0)}°、柱 ${d.smooth ? '平面' : d.a + '/' + d.b + '/' + d.h} µm、${d.V} µL：${d.mode} θ ${f(d.theta, 1)}°、滾落 ${d.roll == null ? '不滑' : f(d.roll, 2) + '°'}、刺穿 ${f(d.Pcrit, 0)} Pa`;

/** 灰塵：與頁面相同的亂數 */
function rngOf(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const PLATE = { W: 15, L: 22 };
function dust(seed) {
  const r = rngOf(seed * 7919 + 13), xs = [], ys = [];
  for (let i = 0; i < 140; i++) { xs.push(0.6 + r() * (PLATE.W - 1.2)); ys.push(0.6 + r() * (PLATE.L - 1.2)); }
  return { xs: xs, ys: ys, alive: new Uint8Array(140).fill(1) };
}
const frac = d => d.alive.reduce((a, b) => a + (b === 0 ? 1 : 0), 0) / 140;
/** 一顆水珠落在 (x, y)：蓋住的灰塵沾進水珠；會滾就一路沾到葉面底、滾出去，沾到的灰塵才算帶走。
 *  不會滾的水珠留在葉面上，沾著的灰塵不算清掉（不考慮合體，對清潔是保守的）。 */
function wash(dd, s, x, y, tilt) {
  const rolls = s.roll != null && tilt > s.roll && s.mode !== 'spread';
  if (!rolls) return false;
  const got = y >= 0 ? B.capture(dd.xs, dd.ys, dd.alive, x, y, s.c * 1e3) : [];
  B.sweepPath(dd.xs, dd.ys, dd.alive, x, Math.max(0, y), PLATE.L + 5, s.w * 1e3).forEach(i => got.push(i));
  got.forEach(i => { dd.alive[i] = 0; });
  return true;
}
function cleanEv(dd, extra) { return { type: 'clean', data: Object.assign({ frac: frac(dd), mixed: false }, extra) }; }

function geckoEv(wall, mg, fPct, lifted) {
  const feet = lifted ? 3 : 4;
  const r = B.gecko(wall, mg / 1000, fPct / 100 * feet / 4);
  return { type: 'gecko', data: { wall: wall, m: mg / 1000, f: fPct / 100, hold: r.hold, safety: r.safety, use: r.use, feet: feet, lifted: !!lifted, limit: r.limit } };
}
const gdesc = d => `牆 ${d.wall}°、${f(d.m * 1000, 0)} g、剛毛 ${f(d.f * 100, 3)}%、${d.feet} 隻腳：${d.hold ? '撐住' : '掉下'}，安全係數 ${f(d.safety, 3)}`;
function padEv(n, load) {
  const R = Math.sqrt(1e-6 / (n * Math.PI)), F = n * B.jkr(R);
  return { type: 'pad', data: { n: n, F: F, load: load, hold: F >= load / 1000 * B.G } };
}
/** 對數滑桿實際能停的值（與頁面 LabNum.register 相同） */
const fracAt = p => +Math.pow(10, -3 + 5 * p / 1000).toFixed(3);
const nAt = p => Math.round(Math.pow(10, p / 100));
const loadAt = p => +Math.pow(10, -3 + p / 100).toFixed(3);

// ---------- 預設狀態 ----------
{
  const evs = [dropEv({}), dropEv({}, 2, true), geckoEv(90, 100, 1), padEv(nAt(200), loadAt(300))];
  const hit = [].concat.apply([], evs.map(all));
  claim(hit.length === 0, '預設的操作（輕放、2 m/s 的雨、壁虎在牆上、掛砝碼）不會完成任何任務' + (hit.length ? '：' + hit.join('、') : ''));
  out.push('  預設水珠：' + ddesc(evs[0].data));
}

// ---------- 蓮葉 ----------
{
  const e = dropEv({ a: 2, b: 6, h: 6 });
  claim(check('1', e), '1 站起來的水珠：按「細柱」，' + ddesc(e.data));
  claim(!check('1', dropEv({})), '1 對照：預設粗柱 θ ' + f(dropEv({}).data.theta, 1) + '° 不算');
}
{
  const e = dropEv({ mat: 'glass' });
  claim(check('2', e), '2 越粗糙越親水：玻璃加粗柱，' + ddesc(e.data));
  const e2 = dropEv({ mat: 'glass', h: 0 });
  claim(!check('2', e2), '2 對照：平的玻璃不算');
  const e3 = dropEv({ mat: 'glass', h: 1, a: 10, b: 30 });
  claim(!check('2', e3), '2 對照：玻璃的粗糙度很小（r = ' + f(e3.data.r, 3) + '）時只小 ' + f(25 - e3.data.theta, 1) + '°，不算');
}
{
  const s = B.drop({ a: 10, b: 10, h: 20, thY: 109, hyst: 10, V: 10 });
  const ev = { type: 'roll', data: { tilt: 3, roll: s.roll, mode: s.mode, V: 10, merged: false, rain: false, mat: 'wax' } };
  claim(s.roll < 3 && check('4', ev), '4 一點點就滾：預設粗柱的滾落角 ' + f(s.roll, 2) + '°，傾斜 3° 就滾出葉面');
  const sm = B.drop({ a: 0, b: 0, h: 0, thY: 109, hyst: 10, V: 10 });
  claim(sm.roll > 5, '4 對照：平的石蠟要傾斜 ' + f(sm.roll, 1) + '°，5° 以內滾不動');
}
{
  // 5：預設粗柱、傾斜 5°，沿上緣每隔一個接觸寬度滴一顆
  const dd = dust(1), s = B.drop({ a: 10, b: 10, h: 20, thY: 109, hyst: 10, V: 10 });
  let n = 0;
  for (let x = s.w * 1e3 / 2; x < PLATE.W; x += s.w * 1e3 * 0.95) { wash(dd, s, x, 0.4, 5); n++; }
  const e = cleanEv(dd, { maxTilt: 5, minV: 0, rained: 0, gentle: n, mat: 'wax', mode: s.mode, roll: s.roll });
  claim(check('5', e), '5 洗乾淨：粗柱、傾斜 5°，沿上緣滴 ' + n + ' 顆，清掉 ' + f(100 * frac(dd), 0) + '%');
  const d2 = dust(1), s2 = B.drop({ a: 0, b: 0, h: 0, thY: 109, hyst: 10, V: 10 });
  for (let x = s2.w * 1e3 / 2; x < PLATE.W; x += s2.w * 1e3 * 0.95) wash(d2, s2, x, 0.4, 10);
  claim(!check('5', cleanEv(d2, { maxTilt: 10, minV: 0, rained: 0, gentle: 9, mat: 'wax' })), '5 對照：平的石蠟傾斜 10° 水珠不滾，只清掉 ' + f(100 * frac(d2), 0) + '%');
}
{
  const e = dropEv({ tilt: 10 }, 3, true);
  claim(check('7', e), '7 雨打穿了：粗柱、傾斜 10°、雨 3 m/s（½ρv² = ' + f(e.data.Pdyn, 0) + ' Pa），' + ddesc(e.data) + '，輕放的會在 ' + f(e.data.gentleRoll, 2) + '° 滾');
  const e2 = dropEv({ tilt: 10 }, 2, true);
  claim(!check('7', e2), '7 對照：2 m/s 的雨打不穿（' + e2.data.mode + '）');
  const e3 = dropEv({ tilt: 15 }, 3, true);
  claim(!check('7', e3), '7 對照：傾斜 15° 時被打穿的也會滑走（滾落 ' + f(e3.data.roll, 1) + '°）');
}
{
  const e = dropEv({ a: 1, b: 2.5, h: 5 }, 4, true);
  claim(check('8', e), '8 不怕大雨：柱 1/2.5/5 µm、雨 4 m/s，' + ddesc(e.data));
  const e2 = dropEv({ a: 2, b: 6, h: 6 }, 4, true);
  claim(!check('8', e2), '8 對照：「細柱」2/6/6 µm 擋不住 4 m/s（刺穿 ' + f(e2.data.Pcrit, 0) + ' Pa），變成 ' + e2.data.mode);
}
{
  const e = dropEv({ a: 1, b: 2.5, h: 5 });
  claim(check('11', e), '11 蓮葉設計師：' + ddesc(e.data));
  claim(!check('11', dropEv({ a: 2, b: 6, h: 6 })), '11 對照：「細柱」擋不住 4 m/s 的雨，不算');
  claim(!check('11', dropEv({ mat: 'ptfe', a: 1, b: 2.5, h: 5 })), '11 對照：換成鐵氟龍不算');
}
{
  // 12：石蠟、柱 1/2.5/5 µm、雨 4 m/s、傾斜 3°，雨落在葉面與上方同樣大小的一段（與頁面相同）
  const res = [];
  [1, 2, 3, 4, 5].forEach(function (seed) {
    const dd = dust(1), r = rngOf(seed * 101 + 3), s = B.drop({ a: 1, b: 2.5, h: 5, thY: 109, hyst: 10, V: 10, v: 4 });
    let n = 0;
    while (frac(dd) < 0.95 && n < 3000) { n++; wash(dd, s, 0.3 + r() * (PLATE.W - 0.6), -PLATE.L + 2 * PLATE.L * r(), 3); }
    res.push(n);
    if (seed === 1) {
      const e = cleanEv(dd, { maxTilt: 3, minV: 4, rained: n, gentle: 0, mat: 'wax', mode: s.mode, roll: s.roll });
      claim(check('12', e), '12 雨中的蓮葉：石蠟、柱 1/2.5/5 µm、雨 4 m/s、傾斜 3°：' + n + ' 滴雨洗掉 ' + f(100 * frac(dd), 0) + '%（每秒 8 滴，約 ' + f(n / 8, 0) + ' 秒）');
    }
  });
  out.push('  12 其他亂數：' + res.join('、') + ' 滴');
  const d2 = dust(1), s2 = B.drop({ a: 2, b: 6, h: 6, thY: 109, hyst: 10, V: 10, v: 4 }), r2 = rngOf(7);
  for (let k = 0; k < 600; k++) wash(d2, s2, 0.3 + r2() * (PLATE.W - 0.6), -PLATE.L + 2 * PLATE.L * r2(), 3);
  claim(!check('12', cleanEv(d2, { maxTilt: 3, minV: 4, rained: 600, gentle: 0, mat: 'wax' })), '12 對照：「細柱」被 4 m/s 打穿、黏住（' + s2.mode + '），600 滴只洗掉 ' + f(100 * frac(d2), 0) + '%');
}
{
  // h2：石蠟 109°，柱 10/10，柱高調到 θc ≈ 109°
  let e = null;
  for (let h = 0.5; h <= 40 && !e; h += 0.5) { const t = dropEv({ h: h }); if (check('h2', t)) e = t; }
  claim(!!e, 'h2 站在天平中間：' + (e ? '柱高 ' + e.data.h + ' µm，θc = ' + f(e.data.thc, 2) + '°、θY = 109°' : '找不到'));
  claim(!check('h2', dropEv({})), 'h2 對照：預設 θc = ' + f(dropEv({}).data.thc, 1) + '° 不算');
}
{
  // h3：平的石蠟傾斜 15°：10 µL 不滾，兩顆合成 20 µL 就滾
  const one = B.drop({ a: 0, b: 0, h: 0, thY: 109, hyst: 10, V: 10 }), two = B.drop({ a: 0, b: 0, h: 0, thY: 109, hyst: 10, V: 20 });
  const ev = { type: 'roll', data: { tilt: 15, roll: two.roll, mode: two.mode, V: 20, merged: true, rain: false, mat: 'wax' } };
  claim(one.roll > 15 && two.roll < 15 && check('h3', ev), 'h3 一滴不夠：平的石蠟傾斜 15°，10 µL 要 ' + f(one.roll, 1) + '°、合成 20 µL 只要 ' + f(two.roll, 1) + '°');
  claim(!check('h3', { type: 'roll', data: Object.assign({}, ev.data, { merged: false }) }), 'h3 對照：沒有合體不算');
}

// ---------- 壁虎 ----------
{
  const e = geckoEv(180, 100, 1);
  claim(check('3', e), '3 倒掛天花板：' + gdesc(e.data));
  claim(!check('3', geckoEv(180, 100, fracAt(100))), '3 對照：剛毛只有 ' + fracAt(100) + '% 時掉下來');
}
{
  // 9：200 g、天花板，在滑桿的停點裡找安全係數 1–1.1
  let e = null, pos = 0;
  for (let p = 0; p <= 1000 && !e; p++) { const t = geckoEv(180, 200, fracAt(p)); if (check('9', t)) { e = t; pos = p; } }
  claim(!!e, '9 剛剛好：' + (e ? gdesc(e.data) + '（滑桿停點 ' + pos + '）' : '找不到'));
  claim(!check('9', geckoEv(180, 200, 1)), '9 對照：剛毛 1% 時安全係數 ' + f(geckoEv(180, 200, 1).data.safety, 2) + '，太多了');
}
{
  let e = null;
  for (let p = 0; p <= 1000 && !e; p++) { const t = geckoEv(180, 100, fracAt(p), true); if (check('10', t)) e = t; }
  claim(!!e, '10 抬起一隻腳：' + (e ? gdesc(e.data) : '找不到'));
  const e4 = geckoEv(180, 100, fracAt(500), false);
  claim(!check('10', e4), '10 對照：沒有抬腳不算');
  const e2 = geckoEv(180, 100, 0.15, true);
  claim(!e2.data.hold && !check('10', e2), '10 對照：剛毛 0.15% 時抬一隻腳就掉下來');
}
{
  let e = null, n = 0;
  for (let p = 0; p <= 800 && !e; p++) { const t = padEv(nAt(p), loadAt(400)); if (check('6', t)) { e = t; n = nAt(p); } }
  claim(!!e, '6 一平方毫米：' + (e ? '分成 ' + n + ' 個尖端（半徑 ' + f(Math.sqrt(1e-6 / (n * Math.PI)) * 1e6, 2) + ' µm），拉脫力 ' + f(e.data.F, 4) + ' N，吊住 10 g' : '找不到'));
  claim(!check('6', padEv(1e4, 10)), '6 對照：一萬個尖端撐不住 10 g');
}
{
  const e = padEv(1, 1);
  claim(check('h1', e), 'h1 擠在一起：一整塊 1 mm² 的拉脫力只有 ' + f(e.data.F * 1e3, 3) + ' mN，吊不住 1 g');
  claim(!check('h1', padEv(1e8, 1)), 'h1 對照：分成 10^8 個就吊得住');
}

// ---------- 星星 ----------
const stars = m => m.hidden ? m.level * 2 : m.level;
const pub = defs.filter(m => !m.hidden), hid = defs.filter(m => m.hidden);
out.push(`任務 ${defs.length} 個（公開 ${pub.length}、隱藏 ${hid.length}），共 ${defs.reduce((a, m) => a + stars(m), 0)} 顆星（公開 ${pub.reduce((a, m) => a + stars(m), 0)}，隱藏 ${hid.reduce((a, m) => a + stars(m), 0)}）`);
console.log(out.join('\n'));
if (fail) { console.error(fail + ' 項不成立'); process.exitCode = 1; }
