/* 任務可達成的證明腳本。用法：node tools/mission-proofs/faults-folds.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件內容與 js/faults-folds.js 的 snapshot() 相同，全部由 js/faults-folds-core.js 計算。
 * 滑桿可打字的精度（faults-folds.html 的 data-decimals）：深度 0.01 km；kH、kh、λ、μ 0.001；方位、滑移、波長、振幅、侵蝕面 0.1；傾沒 0.01°。
 * 範圍：深度 1–15 km、kH／kh 0.3–3、λ 0–0.95、μ 0.2–1、方位 0–179°、滑移 0–1200 m、波長 1000–6000 m、振幅 0–1500 m、傾沒 0–30°、侵蝕面 −1500–1500 m。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/faults-folds-core.js');
const missions = [];
global.window = { FaultsCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/faults-folds.js');
const byId = id => missions.find(m => m.id === 'faults-folds-' + id);
const r = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

/** 斷層模式的頁面狀態（預設：5 km、kH 0.8、kh 0.6、λ 0.37、μ 0.6、方位 0、第一個共軛面、滑移 0、沒侵蝕） */
function snapF(o) {
  o = Object.assign({ z: 5, kH: 0.8, kh: 0.6, lam: 0.37, mu: 0.6, az: 0, plane: 0, slip: 0, erode: false, quakes: 0, quaked: false }, o || {});
  const F = K.fault(o), st = F.st, kinds = K.faultKinds(F);
  return { mode: 'fault', regime: st.regime, crit: st.crit, critHydro: st.critHydro, tensile: st.tensile, ratio: st.ratio, q: st.q,
    z: o.z, kH: o.kH, kh: o.kh, lam: o.lam, mu: o.mu, az: o.az, plane: o.plane,
    strike: F.pl.strike, dip: F.pl.dip, rake: F.rs.rake, slip: F.d, slipSet: o.slip, throw: F.throw, heave: F.heave, along: F.along,
    lateral: F.lateral, kind: F.kind, erode: F.erode, expoFw: F.expo.fw, expoHw: F.expo.hw,
    base: kinds.indexOf(K.BASE) >= 0, quakes: o.quakes, quaked: o.quaked, animating: !!o.animating, _F: F };
}
/** 褶皺模式（預設：波長 3000、振幅 400、傾沒 0、侵蝕面 1500、方位 0） */
function snapO(o) {
  o = Object.assign({ lam: 3000, A: 400, plunge: 0, e: 1500, az: 0 }, o || {});
  const Fo = K.fold(o), ex = K.foldExposure(Fo);
  return { mode: 'fold', lam: o.lam, A: o.A, plunge: o.plunge, e: o.e, az: o.az, limbDip: Fo.limbDip, interlimb: Fo.interlimb, cls: Fo.cls,
    shortening: Fo.shortening, crest: ex.crest, trough: ex.trough, kinds: ex.kinds.length, base: ex.kinds.indexOf(K.BASE) >= 0, animating: false };
}
const evF = o => ({ type: 'fault', data: snapF(o) });
const evO = o => ({ type: 'fold', data: snapO(o) });
let ok = 0, bad = 0;
function expect(name, cond) { if (cond) { ok++; console.log('  ✓ ' + name); } else { bad++; console.error('  ✗ ' + name); process.exitCode = 1; } }
const hitF = (id, o) => byId(id).check(evF(o));
const hitO = (id, o) => byId(id).check(evO(o));

console.log('faults-folds 任務證明');
// 起始狀態：兩種模式都不成立
missions.forEach(m => expect(m.id + ' 起始狀態不成立', !m.check(evF()) && !m.check(evO())));
const s0 = snapF(), o0 = snapO();
console.log(`    起始：${s0.regime}、應力比 ${s0.ratio.toFixed(3)} / ${s0.q.toFixed(3)}；褶皺翼部 ${o0.limbDip.toFixed(2)}°、縮短 ${(o0.shortening * 100).toFixed(2)}%、翼間角 ${o0.interlimb.toFixed(1)}°`);
// 地震動畫進行中送出的事件不算
expect('動畫中的事件不算（任務 1）', !hitF('1', { kh: 0.4, slip: 100, animating: true }));

// 1–3 三種斷層
expect('1 正斷層：kh 0.4、滑移 50', hitF('1', { kh: 0.4, slip: 50 }));
expect('1 滑移 40 不算', !hitF('1', { kh: 0.4, slip: 40 }));
expect('1 沒破裂（起始應力）不算', !hitF('1', { slip: 500 }));
expect('2 逆斷層：kH 2.6、kh 1.5、滑移 50', hitF('2', { kH: 2.6, kh: 1.5, slip: 50 }));
expect('2 逆斷層但沒破裂不算', !hitF('2', { kH: 1.6, kh: 1.2, slip: 50 }));
expect('3 平移斷層：kH 1.6、kh 0.4、滑移 50', hitF('3', { kH: 1.6, kh: 0.4, slip: 50 }));
expect('3 正斷層不算', !hitF('3', { kh: 0.4, slip: 50 }));

// 4 傾角 60° 的正斷層：μ = tan 30° ≈ 0.577
const d4 = snapF({ kh: 0.4, mu: 0.577, slip: 0 });
console.log(`    μ = 0.577 → 傾角 ${d4.dip.toFixed(3)}°`);
expect('4 μ = 0.577 的正斷層', hitF('4', { kh: 0.4, mu: 0.577 }));
expect('4 μ = 0.6（60.5°）不算', !hitF('4', { kh: 0.4, mu: 0.6 }));
expect('4 鎖住（kh 0.6）不算', !hitF('4', { kh: 0.6, mu: 0.577 }));

// 5 落差 300 m
const dip5 = snapF({ kh: 0.4 }).dip, slip5 = r(300 / Math.sin(dip5 * Math.PI / 180), 1);
console.log(`    正斷層傾角 ${dip5.toFixed(2)}° → 滑移打 ${slip5} m，落差 ${snapF({ kh: 0.4, slip: slip5 }).throw.toFixed(2)} m`);
expect('5 正斷層打字 ' + slip5 + ' m', hitF('5', { kh: 0.4, slip: slip5 }));
const dip5r = snapF({ kH: 2.6, kh: 1.5 }).dip, slip5r = r(300 / Math.sin(dip5r * Math.PI / 180), 1);
expect('5 逆斷層打字 ' + slip5r + ' m', hitF('5', { kH: 2.6, kh: 1.5, slip: slip5r }));
expect('5 鎖住時不算', !hitF('5', { slip: slip5 }));
expect('5 滑移 330 不算', !hitF('5', { kh: 0.4, slip: 330 }));

// 6 右移 200 m：兩個共軛面一左一右，選右移的那個
const p6 = [0, 1].find(p => snapF({ kH: 1.6, kh: 0.4, plane: p, slip: 200 }).lateral === 'right');
expect('6 有一個共軛面是右移', p6 != null);
expect('6 右移 200 m（第 ' + (p6 + 1) + ' 個面）', hitF('6', { kH: 1.6, kh: 0.4, plane: p6, slip: 200 }));
expect('6 左移那個面不算', !hitF('6', { kH: 1.6, kh: 0.4, plane: 1 - p6, slip: 200 }));
expect('6 滑移 210 不算', !hitF('6', { kH: 1.6, kh: 0.4, plane: p6, slip: 210 }));

// 7 注水引發地震
expect('7 kh 0.6、λ 0.45、剛地震', hitF('7', { lam: 0.45, slip: 100, quakes: 1, quaked: true }));
expect('7 沒按地震不算', !hitF('7', { lam: 0.45, slip: 100 }));
expect('7 靜水壓下本來就會破裂（kh 0.4）不算', !hitF('7', { kh: 0.4, lam: 0.45, slip: 100, quaked: true }));
expect('7 孔隙壓力 0.37（靜水壓）不算', !hitF('7', { kh: 0.4, lam: 0.37, slip: 100, quaked: true }));

// 8 老地層在上
const e8 = snapF({ kH: 2.6, kh: 1.5, slip: 1100, erode: true });
console.log(`    逆斷層 1100 m、侵蝕：上盤露出第 ${e8.expoHw + 1} 層、下盤第 ${e8.expoFw + 1} 層`);
expect('8 逆斷層 1100 m、侵蝕', hitF('8', { kH: 2.6, kh: 1.5, slip: 1100, erode: true }));
expect('8 沒侵蝕不算', !hitF('8', { kH: 2.6, kh: 1.5, slip: 1100 }));
expect('8 正斷層侵蝕不算', !hitF('8', { kh: 0.4, slip: 1100, erode: true }));
let min8 = null;
for (let s = 0; s <= 1200; s += 10) if (hitF('8', { kH: 2.6, kh: 1.5, slip: s, erode: true })) { min8 = s; break; }
console.log(`    逆斷層 μ 0.6 最少要滑移 ${min8} m`);

// 9 剛好要破裂：打字找 kh（0.001 精度）
const q9 = K.qCrit(0.6), kh9 = r(0.37 + (1 - 0.37) / (q9 * 1.005), 3);
const s9 = snapF({ kh: kh9 });
console.log(`    kh = ${kh9} → 應力比 / 臨界 = ${(s9.ratio / s9.q).toFixed(4)}`);
expect('9 kh ' + kh9, hitF('9', { kh: kh9 }));
expect('9 kh 0.4（遠超過）不算', !hitF('9', { kh: 0.4 }));
// 用滑桿（0.01 一格）在 λ 0.37 下可能跳過：λ 改用打字也行
let found9 = 0;
for (let kh = 0.3; kh <= 1.0001; kh += 0.01) for (let lam = 0; lam <= 0.9501; lam += 0.01) if (hitF('9', { kh: r(kh, 2), lam: r(lam, 2) })) found9++;
console.log(`    只用滑桿（0.01 一格）能完成的組合：${found9} 個`);
expect('9 只用滑桿也有解', found9 > 0);

// 10 翼部傾角 30°
const a10 = 3000 * Math.tan(Math.PI / 6) / (2 * Math.PI);
console.log(`    λ 3000：振幅 ${a10.toFixed(1)} → 滑桿 280 得 ${snapO({ A: 280 }).limbDip.toFixed(2)}°`);
expect('10 λ 3000、A 280', hitO('10', { A: 280 }));
expect('10 A 300 不算', !hitO('10', { A: 300 }));

// 11 縮短 20%
let lo = 0, hi = 1500; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (snapO({ lam: 4000, A: m }).shortening < 0.2) lo = m; else hi = m; }
const a11 = r(lo, 1);
console.log(`    λ 4000：振幅打 ${a11} → 縮短 ${(snapO({ lam: 4000, A: a11 }).shortening * 100).toFixed(3)}%`);
expect('11 打字可達成', hitO('11', { lam: 4000, A: a11 }));
expect('11 λ 3000 縮短 20% 不算', !hitO('11', { lam: 3000, A: r(a11 * 0.75, 1) }));
let s11 = 0; for (let A = 0; A <= 1500; A += 10) if (hitO('11', { lam: 4000, A: A })) { s11 = A; console.log(`    滑桿 ${A} → ${(snapO({ lam: 4000, A: A }).shortening * 100).toFixed(2)}%`); }
expect('11 只用滑桿也有解', s11 > 0);
expect('11 A 400 不算', !hitO('11', { A: 400 }));

// 12 緊密褶皺
expect('12 λ 1000、A 600、侵蝕到 0', hitO('12', { lam: 1000, A: 600, e: 0 }));
expect('12 沒侵蝕不算', !hitO('12', { lam: 1000, A: 600 }));
expect('12 λ 1000、A 500 不算', !hitO('12', { lam: 1000, A: 500, e: 0 }));
expect('12 擠過頭（λ 1000、A 1500，翼間角 < 20°）不算', !hitO('12', { lam: 1000, A: 1500, e: 0 }));

// h1 水把岩石撐開：有效應力為負，而且兩個水平應力都不小（要靠高孔隙壓力）
expect('h1 kh 0.5、λ 0.6', hitF('h1', { kh: 0.5, lam: 0.6 }));
expect('h1 只把 kh 拉到 0.3（靜水壓）不算', !hitF('h1', { kh: 0.3 }));
expect('h1 kh 0.5、λ 0.45 不算（沒張裂）', !hitF('h1', { kh: 0.5, lam: 0.45 }));

// h2 見到基盤：褶皺擠到最高、傾沒最陡、侵蝕到最低
const h2 = snapO({ A: 1500, plunge: 30, e: -1500 });
console.log(`    A 1500、傾沒 30°、侵蝕 −1500：地質圖有 ${h2.kinds} 種，基盤 ${h2.base}`);
expect('h2 褶皺見到基盤（侵蝕 −1300）', hitO('h2', { A: 1500, plunge: 30, e: -1300 }));
expect('h2 三個滑桿都拉到底（侵蝕 −1500）不算', !hitO('h2', { A: 1500, plunge: 30, e: -1500 }));
expect('h2 沒傾沒不夠', !hitO('h2', { A: 1500, plunge: 0, e: -1300 }));
let minP = null; for (let p = 0; p <= 30; p += 0.5) if (hitO('h2', { A: 1500, plunge: p, e: -1300 })) { minP = p; break; }
console.log(`    侵蝕 −1300 時最少傾沒 ${minP}°`);
// 斷層模式到不了基盤（方塊只到 2 km、基盤在 3.5 km）
expect('h2 斷層模式（逆斷層 1200 m、侵蝕）到不了基盤', !hitF('h2', { kH: 3, kh: 2, slip: 1200, erode: true }));

// h3 四面一樣重
expect('h3 kH = kh = 1', hitF('h3', { kH: 1, kh: 1 }));
expect('h3 kH 1.02 不算', !hitF('h3', { kH: 1.02, kh: 1 }));
expect('h3 等向應力下斷層不會滑動', !snapF({ kH: 1, kh: 1, lam: 0.95 }).crit);

// 隨機亂按（只用滑桿格點）：每個任務被亂按完成的機率
const rnd = (a, b, st) => r(a + Math.floor(Math.random() * ((b - a) / st + 1)) * st, 3);
const cnt = {}; missions.forEach(m => { cnt[m.id] = 0; });
const N = 4000;
for (let i = 0; i < N; i++) {
  const f = evF({ z: rnd(1, 15, 0.1), kH: rnd(0.3, 3, 0.01), kh: rnd(0.3, 3, 0.01), lam: rnd(0, 0.95, 0.01), mu: rnd(0.2, 1, 0.01), az: rnd(0, 179, 1), plane: i % 2, slip: rnd(0, 1200, 10), erode: Math.random() < 0.3 });
  const o = evO({ lam: rnd(1000, 6000, 50), A: rnd(0, 1500, 10), plunge: rnd(0, 30, 0.5), e: rnd(-1500, 1500, 10), az: rnd(0, 179, 1) });
  missions.forEach(m => { if (m.check(f) || m.check(o)) cnt[m.id]++; });
}
console.log('    亂按 ' + N + ' 次的完成率：' + missions.map(m => m.id.replace('faults-folds-', '') + ' ' + (cnt[m.id] / N * 100).toFixed(1) + '%').join('、'));
['4', '5', '6', '9', '10', '11', 'h3'].forEach(id => expect('精確值任務 ' + id + ' 亂按完成率 < 3%', cnt['faults-folds-' + id] / N < 0.03));
expect('h1 亂按完成率 < 10%', cnt['faults-folds-h1'] / N < 0.1);

console.log(`\n${ok} 項通過${bad ? '、' + bad + ' 項失敗' : ''}`);
