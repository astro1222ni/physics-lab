/* 任務可達成的證明腳本。用法：node tools/mission-proofs/ekman-upwelling.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件內容與 js/ekman-upwelling.js 的 snapshot() 相同，全部由 js/ekman-upwelling-core.js 計算。
 * 滑桿可打字的精度（ekman-upwelling.html 的 data-decimals）：緯度、風速 0.01；風向、探測深度、暖水厚度、信風 % 0.1；Av 0.0001；天數 0.01。
 * 範圍：緯度 5–80°（另有南北半球切換）、風速 0–25 m/s、風向 0–359°、Av 0.005–0.1、探測深度 0–300 m、暖水 10–80 m、天數 0–20、信風 −50–200%。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/ekman-upwelling-core.js');
const missions = [];
global.window = { EkmanCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/ekman-upwelling.js');
const byId = id => missions.find(m => m.id === 'ekman-upwelling-' + id);
const r = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

// 頁面預設：北半球、緯度 35、風速 10、北風（0°）、Av 0.02、探測 30 m、海在西邊、暖水 30 m、第 0 天、信風 100%
const DEF = { hemi: 'N', lat: 35, U: 10, windFrom: 0, Av: 0.02, zProbe: 30, coast: 'W', H1: 30, days: 0, p: 100 };
function opts(o) { o = Object.assign({}, DEF, o || {}); o.latS = o.hemi === 'S' ? -o.lat : o.lat; return o; }
function snapS(o) {
  o = opts(o);
  const E = K.ekman({ lat: o.latS, U: o.U, windFrom: o.windFrom, Av: o.Av }), pr = K.ekmanAt(E, -o.zProbe);
  return { mode: 'spiral', lat: o.latS, U: o.U, windFrom: o.windFrom, Av: o.Av, z: o.zProbe, f: E.f, tau: E.tau, V0: E.V0, DE: E.DE, M: E.M,
    windTo: E.windTo, surfAz: E.surfAz, transAz: E.transAz, probeAz: pr.az, probeSpeed: pr.speed, probeTurn: E.V0 > 0 ? K.turn(E.surfAz, pr.az) : 0 };
}
function snapC(o) {
  o = opts(o);
  const C = K.coastal({ lat: o.latS, U: o.U, windFrom: o.windFrom, coast: o.coast, H1: o.H1, days: o.days });
  return { mode: 'coast', lat: o.latS, U: o.U, windFrom: o.windFrom, coast: o.coast, H1: o.H1, days: o.days, Moff: C.Moff, bakun: C.bakun,
    w: C.w, wDay: C.wDay, Rd: C.Rd, eta0: C.eta0, out: C.out, front: C.front, sst0: C.sst0, no3: C.no3, tOut: C.tOut, playing: false };
}
function snapQ(o) {
  o = opts(o);
  const Q = K.equator({ p: o.p / 100 }), en = K.ensoState(Q);
  return { mode: 'equator', p: o.p / 100, U: Q.U, tau: Q.tau, hW: Q.hW, hE: Q.hE, deta: Q.deta, sstE: Q.sstE, sstW: Q.sstW, anom: en.anom, state: en.state, outcrop: Q.outcrop };
}
const evS = o => ({ type: 'spiral', data: snapS(o) });
const evC = o => ({ type: 'coast', data: snapC(o) });
const evQ = o => ({ type: 'equator', data: snapQ(o) });
let ok = 0, bad = 0;
function expect(name, cond) { if (cond) { ok++; console.log('  ✓ ' + name); } else { bad++; console.error('  ✗ ' + name); process.exitCode = 1; } }
const hit = (id, ev) => byId(id).check(ev);
/** 單調函數 f 在 [a, b] 找 f = target，回傳四捨五入到 dec 位的 x */
function solve(f, target, a, b, dec) {
  let fa = f(a) - target;
  for (let i = 0; i < 80; i++) { const m = (a + b) / 2, fm = f(m) - target; if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; }
  return r((a + b) / 2, dec);
}

console.log('ekman-upwelling 任務證明');
// 起始狀態：三種模式都不成立
missions.forEach(m => expect(m.id + ' 起始狀態不成立', !m.check(evS()) && !m.check(evC()) && !m.check(evQ())));
// 只切換模式、按播放到第 20 天（預設設定）也不成立
missions.forEach(m => expect(m.id + ' 預設設定播放到第 20 天不成立', [0, 5, 10, 20].every(d => !m.check(evC({ days: d })))));
const s0 = snapS(), c0 = snapC({ days: 20 }), q0 = snapQ();
console.log(`    起始：V0 ${(s0.V0 * 100).toFixed(2)} cm/s、D_E ${s0.DE.toFixed(2)} m、M ${s0.M.toFixed(3)}；湧升指數 ${c0.bakun.toFixed(1)}、w ${c0.wDay.toFixed(2)} m/天、露頭第 ${c0.tOut.toFixed(2)} 天；赤道 hE ${q0.hE.toFixed(1)}、Δη ${(q0.deta * 100).toFixed(1)} cm`);

// 1 南半球
expect('1 南半球、西風（風從 270° 吹來）：輸送往北', hit('1', evS({ hemi: 'S', windFrom: 270 })));
expect('1 南半球、預設北風（輸送往東）不算', !hit('1', evS({ hemi: 'S' })));
expect('1 南半球但沒有風不算', !hit('1', evS({ hemi: 'S', U: 0, windFrom: 270 })));
expect('1 北半球東風（輸送也往北）不算', !hit('1', evS({ windFrom: 90 })) && Math.abs(snapS({ windFrom: 90 }).transAz) < 1e-9);

// 2 D_E = 100 m
const av2 = r((100 / Math.PI) ** 2 * Math.abs(K.coriolis(35)) / 2, 4);
console.log(`    任務 2：Av = ${av2} → D_E = ${snapS({ Av: av2 }).DE.toFixed(3)} m`);
expect('2 調 Av', hit('2', evS({ Av: av2 })));
const lat2 = solve(l => snapS({ lat: l }).DE, 100, 5, 80, 2);
console.log(`    任務 2：緯度 ${lat2}° → D_E = ${snapS({ lat: lat2 }).DE.toFixed(3)} m`);
expect('2 調緯度', hit('2', evS({ lat: lat2 })));
expect('2 D_E 98 m 不算', !hit('2', evS({ Av: r(av2 * 0.96, 4) })));

// 3 V0 = 0.2 m/s
const u3 = solve(u => snapS({ U: u }).V0, 0.2, 0, 25, 2);
console.log(`    任務 3：U = ${u3} → V0 = ${(snapS({ U: u3 }).V0 * 100).toFixed(3)} cm/s`);
expect('3 調風速', hit('3', evS({ U: u3 })));
expect('3 差 1 cm/s 不算', !hit('3', evS({ U: solve(u => snapS({ U: u }).V0, 0.21, 0, 25, 2) })));

// 4 M = 1 m²/s
const u4 = solve(u => snapS({ U: u }).M, 1, 0, 25, 2);
console.log(`    任務 4：U = ${u4} → M = ${snapS({ U: u4 }).M.toFixed(4)}`);
expect('4 調風速', hit('4', evS({ U: u4 })));
expect('4 M 和 Av 無關：Av 0.08 也成立', hit('4', evS({ U: u4, Av: 0.08 })));
expect('4 M = 1.05 不算', !hit('4', evS({ U: solve(u => snapS({ U: u }).M, 1.05, 0, 25, 2) })));

// 5 秘魯
const c5 = snapC({ hemi: 'S', lat: 12, windFrom: 180, U: 8, days: 8 });
console.log(`    任務 5：南緯 12°、南風 8 m/s、第 8 天 → 湧升指數 ${c5.bakun.toFixed(1)}、岸邊 ${c5.sst0.toFixed(2)} °C`);
expect('5 南緯 12°、南風 8 m/s、第 8 天', hit('5', evC({ hemi: 'S', lat: 12, windFrom: 180, U: 8, days: 8 })));
expect('5 東南風也可以', hit('5', evC({ hemi: 'S', lat: 12, windFrom: 135, U: 8, days: 12 })));
expect('5 第 0 天（還沒變冷）不算', !hit('5', evC({ hemi: 'S', lat: 12, windFrom: 180 })));
expect('5 南緯 35°（智利中部）不算', !hit('5', evC({ hemi: 'S', lat: 35, windFrom: 180, days: 5 })));
expect('5 西南風（風從 225°）不算', !hit('5', evC({ hemi: 'S', lat: 12, windFrom: 225, days: 5 })));
expect('5 南半球吹北風（下沉）不算', !hit('5', evC({ hemi: 'S', lat: 12, windFrom: 0 })));
expect('5 北半球（加州）不算', !hit('5', evC({ windFrom: 0 })));
expect('5 海在東邊不算', !hit('5', evC({ hemi: 'S', lat: 12, windFrom: 0, coast: 'E' })));

// 6 臺灣東岸的西南季風
const c6 = snapC({ lat: 23.5, coast: 'E', windFrom: 225, U: 8 });
console.log(`    任務 6：北緯 23.5°、西南風 8 m/s → 湧升指數 ${c6.bakun.toFixed(1)}`);
expect('6 北緯 23.5°、海在東邊、西南風 8 m/s', hit('6', evC({ lat: 23.5, coast: 'E', windFrom: 225, U: 8 })));
expect('6 東北風（冬季）不算：下沉', !hit('6', evC({ lat: 23.5, coast: 'E', windFrom: 45, U: 8 })) && snapC({ lat: 23.5, coast: 'E', windFrom: 45, U: 8 }).bakun < 0);
expect('6 海在西邊不算', !hit('6', evC({ lat: 23.5, coast: 'W', windFrom: 225, U: 8 })));

// 7 厚暖水
const u7 = solve(u => snapC({ H1: 60, U: u }).tOut, 4.9, 6, 25, 2);
const c7 = snapC({ H1: 60, U: u7, days: 5 });
console.log(`    任務 7：H1 60、U ${u7} → 第 ${c7.tOut.toFixed(2)} 天露頭`);
expect('7 H1 60、第 5 天', hit('7', evC({ H1: 60, U: u7, days: 5 })));
expect('7 預設風速 10 m/s、H1 60 在第 5 天還沒露頭', !hit('7', evC({ H1: 60, days: 5 })));
expect('7 H1 50 不算', !hit('7', evC({ H1: 50, U: 15, days: 3 })));
expect('7 第 5.5 天才看不算', !hit('7', evC({ H1: 60, U: u7, days: 5.5 })));

// 8 下沉
expect('8 南風、第 2 天', hit('8', evC({ windFrom: 180, days: 2 })));
expect('8 第 1.5 天不算', !hit('8', evC({ windFrom: 180, days: 1.5 })));
expect('8 下沉時岸邊仍是暖水', snapC({ windFrom: 180, days: 10 }).sst0 === K.T_S);

// 9 w = 25 m／天
const u9 = solve(u => snapC({ U: u }).wDay, 25, 0, 25, 2);
console.log(`    任務 9：U = ${u9} → w = ${snapC({ U: u9 }).wDay.toFixed(3)} m/天`);
expect('9 調風速', hit('9', evC({ U: u9 })));
expect('9 下沉 25 m/天不算', !hit('9', evC({ U: u9, windFrom: 180 })));

// 10–12 赤道
expect('10 信風 80%', hit('10', evQ({ p: 80 })));
expect('10 信風 88%（弱聖嬰）不算', !hit('10', evQ({ p: 88 })) && snapQ({ p: 88 }).state === 'nino');
expect('10 信風 60%（強聖嬰）不算', !hit('10', evQ({ p: 60 })));
expect('10 沒有風不算', !hit('10', evQ({ p: 0 })));
expect('10 信風 95% 不算', !hit('10', evQ({ p: 95 })));
expect('11 信風 120%', hit('11', evQ({ p: 120 })));
expect('11 信風 160%（溫躍層露出）不算', !hit('11', evQ({ p: 160 })));
const p12 = solve(p => snapQ({ p: p }).deta, 0.5, 0, 200, 1);
console.log(`    任務 12：信風 ${p12}% → Δη = ${(snapQ({ p: p12 }).deta * 100).toFixed(2)} cm`);
expect('12 調信風', hit('12', evQ({ p: p12 })));
expect('12 平常（66 cm）不算', !hit('12', evQ({ p: 100 })));

// h1 艾克曼深度反向
const zh1 = r(s0.DE, 1);
console.log(`    隱藏 1：探測 ${zh1} m → 多轉 ${snapS({ zProbe: zh1 }).probeTurn.toFixed(2)}°`);
expect('h1 探測深度 = D_E', hit('h1', evS({ zProbe: zh1 })));
expect('h1 差 2 m 不算', !hit('h1', evS({ zProbe: zh1 - 2 })));
// h2 西風
const p_h2 = solve(p => snapQ({ p: p }).deta, -0.3, -50, 0, 1);
console.log(`    隱藏 2：信風 ${p_h2}% → 東比西高 ${(-snapQ({ p: p_h2 }).deta * 100).toFixed(2)} cm`);
expect('h2 東邊比西邊高 30 cm', hit('h2', evQ({ p: p_h2 })));
expect('h2 滑桿拉到最小（−50%）不算', !hit('h2', evQ({ p: -50 })));
expect('h2 打字 −5% 不算', !hit('h2', evQ({ p: -5 })));
expect('h2 無風（溫躍層平）不算', !hit('h2', evQ({ p: 0 })));
// h3 三天內把硝酸鹽送上海面
const uh3 = solve(u => snapC({ U: u, days: 3 }).no3, 20.5, 5, 25, 2);
console.log(`    隱藏 3：U = ${uh3}、第 3 天 → 硝酸鹽 ${snapC({ U: uh3, days: 3 }).no3.toFixed(2)} μmol/L`);
expect('h3 第 3 天', hit('h3', evC({ U: uh3, days: 3 })));
expect('h3 預設風速第 20 天才有，不算', snapC({ days: 20 }).no3 >= 20 ? !hit('h3', evC({ days: 20 })) : !hit('h3', evC({ days: 20 })));
expect('h3 同樣風速第 3.5 天才看不算', !hit('h3', evC({ U: uh3, days: 3.5 })));

console.log(`\n${ok} 項通過、${bad} 項失敗`);
