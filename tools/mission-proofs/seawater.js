/* 任務可達成的證明腳本。用法：node tools/mission-proofs/seawater.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件內容與 js/seawater.js 的 snapshot() 相同，全部由 js/seawater-core.js 計算。
 * 滑桿可打字的精度：溫度、鹽度、混合比例都是 0.01（seawater.html 的 data-decimals = 2）；
 * 範圍：溫度 −2.5–32 °C、鹽度 0–42、混合比例 0–1。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/seawater-core.js');
const missions = [];
global.window = { SeawaterCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/seawater.js');
const byId = id => missions.find(m => m.id === 'seawater-' + id);

const r2 = v => Math.round(v * 100) / 100;
/** 頁面狀態（預設：A = 2 °C、34.5；B = 20 °C、35.5；f = 0.5；熱帶西太平洋剖面） */
function snap(o) {
  o = o || {};
  const A = { T: o.TA != null ? o.TA : 2, S: o.SA != null ? o.SA : 34.5 };
  const B = { T: o.TB != null ? o.TB : 20, S: o.SB != null ? o.SB : 35.5 };
  const f = o.f != null ? o.f : 0.5, prof = o.prof || 'wpac', M = K.mix(A, B, f);
  const sA = K.sigma(A.S, A.T, 0), sB = K.sigma(B.S, B.T, 0), sM = K.sigma(M.S, M.T, 0);
  const zA = K.settle(prof, A.T, A.S), zB = K.settle(prof, B.T, B.S), zM = K.settle(prof, M.T, M.S);
  return { TA: A.T, SA: A.S, TB: B.T, SB: B.S, f: f, TM: M.T, SM: M.S, sA: sA, sB: sB, sM: sM,
    fA: K.freezing(A.S), tmdA: K.tMaxDensity(A.S), excess: sM - ((1 - f) * sA + f * sB),
    zA: zA.z, wA: zA.where, zB: zB.z, wB: zB.where, zM: zM.z, wM: zM.where,
    prof: prof, range: 'full', pick: o.pick || '', pins: 0, dragging: !!o.dragging };
}
const ev = o => ({ type: 'water', data: snap(o) });
let ok = 0, bad = 0;
function expect(name, cond) { if (cond) { ok++; console.log('  ✓ ' + name); } else { bad++; console.error('  ✗ ' + name); process.exitCode = 1; } }
const hit = (id, o) => byId(id).check(ev(o));
const PROFS = Object.keys(K.PROFILES);
/** 在 0.01 精度上找讓 σ(S, T) 等於 sig 的鹽度 */
function sFor(sig, t) { let lo = 0, hi = 42; for (let i = 0; i < 60; i++) { const s = (lo + hi) / 2; if (K.sigma(s, t, 0) < sig) lo = s; else hi = s; } return lo; }

console.log('seawater 任務證明');
// 起始狀態：什麼都不該成立
missions.forEach(m => expect(m.id + ' 起始狀態不成立（四個剖面）', PROFS.every(p => !m.check(ev({ prof: p })))));
// 每個水團按「設給 A」：只有任務 7（選 NADW 且在北大西洋）可以，其他精確值任務都不會被順手完成
K.MASSES.forEach(w => {
  const got = missions.filter(m => PROFS.some(p => m.check(ev({ TA: w.T, SA: w.S, prof: p, pick: w.id })))).map(m => m.id);
  console.log('    設給 A：' + w.id + ' → ' + (got.join('、') || '（無）'));
  expect('設給 A ' + w.id + ' 不會完成精確值任務（2、3、5、9、10、h1、h3）',
    !got.some(id => /-(2|3|5|9|10|h1|h3)$/.test(id)));
});

// 1 河水
expect('1 鹽度 1 成立', hit('1', { SA: 1 }));
expect('1 鹽度 1.05 不算', !hit('1', { SA: 1.05 }));
expect('1 拖曳途中不算', !hit('1', { SA: 0, dragging: true }));
// 2 σ = 25
const s25 = r2(sFor(25, 15));
console.log('    15 °C 時 σ = 25 的鹽度 ≈ ' + s25 + '（σ = ' + K.sigma(s25, 15, 0).toFixed(3) + '）');
expect('2 15 °C、鹽度 ' + s25 + ' 成立', hit('2', { TA: 15, SA: s25 }));
expect('2 差 0.1 鹽度就不算', !hit('2', { TA: 15, SA: s25 + 0.1 }));
// 3 冰點
expect('3 鹽度 35、−1.92 °C 成立', hit('3', { SA: 35, TA: -1.92 }));
expect('3 鹽度 35、−1.85 °C 不算', !hit('3', { SA: 35, TA: -1.85 }));
expect('3 淡水 0 °C 不算（鹽度要 ≥ 30）', !hit('3', { SA: 0, TA: 0 }));
// 4 冷熱不同一樣重
const s4 = r2(sFor(K.sigma(34.5, 2, 0), 15));
console.log('    和 (2 °C, 34.5) 一樣重的 15 °C 海水：鹽度 ' + s4 + '，Δσ = ' + (K.sigma(s4, 15, 0) - K.sigma(34.5, 2, 0)).toFixed(4));
expect('4 A (2, 34.5)、B (15, ' + s4 + ') 成立', hit('4', { TB: 15, SB: s4 }));
expect('4 溫差只有 8 °C 不算', !hit('4', { TB: 10, SB: r2(sFor(K.sigma(34.5, 2, 0), 10)) }));
// 5 停在 1000 m：威德爾海整層密度幾乎一樣（980–1020 m 只差 0.0005），其他三個剖面都找得到
PROFS.filter(p => p !== 'wedd').forEach(p => {
  const sg = K.profileSigma(p, 1000);
  let found = null;
  for (let t = -1.5; t <= 25 && !found; t += 0.01) { t = r2(t); const s = r2(sFor(sg, t)); if (s >= 0 && s <= 42 && hit('5', { TA: t, SA: s, prof: p })) found = [t, s]; }
  expect('5 ' + p + ' 找得到停在 980–1020 m 的水' + (found ? '（' + found[0] + ' °C、' + found[1] + '）' : ''), !!found);
});
// 6 混合後變重
expect('6 A (2, 34.5)、B (20, 38.68)、f = 0.5 成立', (() => { const sb = r2(sFor(K.sigma(34.5, 2, 0), 20)); return hit('6', { TB: 20, SB: sb, f: 0.5 }); })());
expect('6 起始的 A、B（σ 不同）不算', !hit('6', {}));
expect('6 溫差小（2 °C 與 6 °C）混合增密不到 0.1，不算', !hit('6', { TB: 6, SB: r2(sFor(K.sigma(34.5, 2, 0), 6)) }));
expect('6 f = 0.3 不算', !hit('6', { TB: 20, SB: r2(sFor(K.sigma(34.5, 2, 0), 20)), f: 0.3 }));
// 7 最重的水團
const top = K.MASSES.slice().sort((a, b) => K.sigma(b.S, b.T, 0) - K.sigma(a.S, a.T, 0))[0];
console.log('    σθ 最大的水團：' + top.id + '（' + K.sigma(top.S, top.T, 0).toFixed(3) + '）');
expect('7 NADW 是 σθ 最大的水團', top.id === 'nadw');
expect('7 選 NADW、設給 A、北大西洋 成立', hit('7', { TA: 2.5, SA: 34.92, pick: 'nadw', prof: 'natl' }));
expect('7 在熱帶西太平洋不算', !hit('7', { TA: 2.5, SA: 34.92, pick: 'nadw', prof: 'wpac' }));
expect('7 選 AABW 不算', !hit('7', { TA: -0.5, SA: 34.65, pick: 'aabw', prof: 'natl' }));
expect('7 A 不是 NADW 不算', !hit('7', { pick: 'nadw', prof: 'natl' }));
// 8 又暖又沉
['wpac', 'natl', 'npac'].forEach(p => {
  let found = null;
  for (let t = 15; t <= 25 && !found; t = r2(t + 0.01)) { const s = r2(sFor(K.profileSigma(p, 2000), t)); if (hit('8', { TA: t, SA: s, prof: p })) found = [t, s]; }
  expect('8 ' + p + ' 找得到停在 1900–2100 m 的 15 °C 以上海水' + (found ? '（' + found[0] + ' °C、' + found[1] + '）' : ''), !!found);
});
expect('8 15 °C、鹽度 38 在北大西洋 沉太深 不算', !hit('8', { TA: 15, SA: 38, prof: 'natl' }));
expect('8 地中海水（11.8 °C）設給 A 不算', !hit('8', { TA: 11.8, SA: 36.5, prof: 'natl' }));
expect('8 黑潮水（27.5 °C、34.5）不算', !hit('8', { TA: 27.5, SA: 34.5 }));
expect('8 14.9 °C 不算', !hit('8', { TA: 14.9, SA: 40 }));
// 9 淡水最重的溫度
console.log('    鹽度 0 的最大密度溫度 ' + K.tMaxDensity(0).toFixed(3) + ' °C；0.5 → ' + K.tMaxDensity(0.5).toFixed(3) + ' °C');
expect('9 鹽度 0、3.98 °C 成立', hit('9', { SA: 0, TA: 3.98 }));
expect('9 鹽度 0、4.1 °C 不算', !hit('9', { SA: 0, TA: 4.1 }));
expect('9 鹽度 0、0 °C 不算', !hit('9', { SA: 0, TA: 0 }));
// 10 兩條線相遇
let sx = null;
for (let s = 2000; s <= 3000; s++) { const S = s / 100; if (Math.abs(K.tMaxDensity(S) - K.freezing(S)) <= 0.02) { if (sx == null) sx = [S, S]; sx[1] = S; } }
console.log('    交點附近可打字的鹽度：' + (sx ? sx[0] + '–' + sx[1] : '無') + '，冰點 ' + K.freezing(24.62).toFixed(3) + ' °C');
expect('10 有可打字的鹽度', !!sx && sx[1] - sx[0] < 0.4);
expect('10 鹽度 24.62、' + r2(K.freezing(24.62)) + ' °C 成立', hit('10', { SA: 24.62, TA: r2(K.freezing(24.62)) }));
expect('10 鹽度 24.62、0 °C 不算', !hit('10', { SA: 24.62, TA: 0 }));
expect('10 鹽度 35、冰點 不算', !hit('10', { SA: 35, TA: -1.92 }));
// 11 淺水混成深水：每個剖面都找得到
PROFS.forEach(p => {
  let found = null;
  for (let ta = -1.8; ta <= 6 && !found; ta += 0.2) {
    for (let tb = 10; tb <= 32 && !found; tb += 1) {
      const zmax = K.profileSigma(p, 500) - 0.002;
      const sa = r2(sFor(zmax, ta)), sb = r2(sFor(zmax, tb));
      if (sa < 0 || sb > 42 || sb < 0) continue;
      for (let f = 0.3; f <= 0.7 && !found; f += 0.05) if (hit('11', { TA: r2(ta), SA: sa, TB: tb, SB: sb, f: r2(f), prof: p })) found = [r2(ta), sa, tb, sb, r2(f)];
    }
  }
  expect('11 ' + p + ' 做得到' + (found ? '（A ' + found[0] + ' °C、' + found[1] + '；B ' + found[2] + ' °C、' + found[3] + '；f ' + found[4] + '）' : ''), !!found);
});
expect('11 起始狀態不算（A 停在 1465 m）', !hit('11', {}));
// h1 同樣的鹹，冷的卻浮在上面：只有低鹽度、低於最大密度溫度時才會發生
expect('h1 淡水 A = 1 °C、B = 3.9 °C 成立', hit('h1', { SA: 0, TA: 1, SB: 0, TB: 3.9 }));
expect('h1 海水（鹽度 35）A 冷 B 暖不算（冷的比較重）', !hit('h1', { SA: 35, TA: 1, SB: 35, TB: 3.9 }));
let h1Max = 0;
for (let s = 0; s <= 4200; s += 5) { const S = s / 100, tf = K.freezing(S); if (K.sigma(S, tf, 0) < K.sigma(S, tf + 0.5, 0)) h1Max = S; }
console.log('    h1 做得到的最高鹽度 ≈ ' + h1Max);
expect('h1 只在鹽度 < 24.7 時做得到', h1Max > 20 && h1Max < 24.7);
// h2 沉到底：冰點附近的鹹水（南極底層水的成因）
expect('h2 鹽度 34.8、冰點 −1.9 °C 在熱帶西太平洋 沉到底', hit('h2', { TA: -1.9, SA: 34.8, prof: 'wpac' }));
expect('h2 鹽度 34.8 在冰點、威德爾海 也沉到底', hit('h2', { TA: -1.9, SA: 34.8, prof: 'wedd' }));
expect('h2 南極底層水（−0.5 °C）沉到底但離冰點太遠 不算', !hit('h2', { TA: -0.5, SA: 34.65, prof: 'wpac' }));
expect('h2 低於冰點（會結冰）不算', !hit('h2', { TA: -2.0, SA: 34.8, prof: 'wpac' }));
expect('h2 鹽度 40、20 °C 沉到底 不算', !hit('h2', { TA: 20, SA: 41, prof: 'wpac' }));
// h3 零下兩度還沒結冰
expect('h3 鹽度 37、−2 °C 成立（冰點 −2.04）', hit('h3', { SA: 37, TA: -2 }));
expect('h3 鹽度 35、−2 °C 不算（低於冰點，會結冰）', !hit('h3', { SA: 35, TA: -2 }));
expect('h3 −1.99 °C 不算', !hit('h3', { SA: 40, TA: -1.99 }));

// 任務格式
const lv = missions.map(m => m.level);
console.log('    任務 ' + missions.filter(m => !m.hidden).length + ' 個公開＋' + missions.filter(m => m.hidden).length + ' 個隱藏；星星 ' +
  missions.reduce((a, m) => a + (m.hidden ? 2 * m.level : m.level), 0) + ' 顆');
expect('等級都在 1–10', lv.every(l => l >= 1 && l <= 10));
expect('代號不重複', new Set(missions.map(m => m.id)).size === missions.length);
expect('隱藏任務只有提示句', missions.filter(m => m.hidden).every(m => m.riddle && m.riddle.zh && m.riddle.en && !m.title));

console.log(`\n${ok} 項成立${bad ? '，' + bad + ' 項失敗' : ''}`);
