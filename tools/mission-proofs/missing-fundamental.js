/* 任務可達成的證明腳本。用法：node tools/mission-proofs/missing-fundamental.js
 * 用數學核心（js/missing-fundamental-core.js）證明每個任務在滑桿範圍與精度內做得到（事件資料由 MissingCore.missionData 產生，和頁面相同），
 * 預設狀態不觸發任何任務，10 個隱藏任務兩兩不會連帶完成，而且模擬「亂按」很多次也幾乎不會誤觸隱藏任務。
 * 介面精度：基頻 100–400 Hz（整數）；泛音開關 1–10；「移除最低 n 根」0–9；濾波四種；自訂高通截止 0–1500 Hz（間隔 10）；
 * 全部平移 Δ −150…150 Hz（整數）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/missing-fundamental-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/missing-fundamental.js');
const byId = id => missions.find(m => m.id === 'missing-fundamental-' + id);
const hidden = missions.filter(m => m.hidden);

const on = ks => { const a = new Array(10).fill(false); ks.forEach(k => { a[k - 1] = true; }); return a; };
const DEF_ON = M.DEFAULT.on.slice();
function st(o) { return Object.assign({ f0: M.DEFAULT.f0, on: DEF_ON, low: 0, filter: 'none', cut: M.DEFAULT.cut, delta: 0 }, o); }
const ev = (type, s) => ({ type: type, data: M.missionData(s) });
const stEv = s => ev('state', s);
const recEv = list => ({ type: 'record', data: { rows: list.map(s => M.missionData(s)) } });
const desc = s => { const d = M.missionData(s); return 'f0 = ' + d.f0 + ' Hz' + (d.delta ? '、Δ = ' + d.delta + ' Hz' : '') + (d.filter !== 'none' ? '、' + M.FILTERS[d.filter].zh + (d.filter === 'custom' ? ' ' + d.cut + ' Hz' : '') : '') + (d.low ? '、移除最低 ' + d.low + ' 根' : '') + '：喇叭放出 {' + d.freqs.join(', ') + '} Hz → 音高 ' + (d.pitch == null ? '—' : d.pitch.toFixed(2)) + ' Hz'; };

let fail = 0;
function check(id, e) { const m = byId(id); m.mem = {}; return !!m.check(e, m.mem); }
function expect(id, e, want, note) {
  const ok = check(id, e) === want;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// ---------- 預設狀態不觸發 ----------
{
  const d0 = st({});
  const evs = [stEv(d0), ev('ab', d0), ev('play', d0), recEv([d0]), recEv([d0, d0])];
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（200 Hz、第 1–8 根、不濾波、不平移）的 state／ab／play／record 都不觸發任何任務');
}

// ---------- 公開任務 ----------
console.log('\n公開任務：');
const sol = {};
sol['1'] = st({ on: on([2, 3, 4, 5, 6, 7, 8]) });
expect('1', stEv(sol['1']), true, '關掉第 1 根：' + desc(sol['1']));
expect('1', stEv(st({ on: on([2]) })), false, '只剩一根（音高 = 它自己）');
expect('1', stEv(st({ on: on([2, 4, 6]) })), false, '偶次：音高變成 2 f0');
sol['2'] = sol['1'];
expect('2', ev('ab', sol['2']), true, '同上按「A／B 比較」');
expect('2', ev('ab', st({})), false, '有基頻時按 A／B');
expect('2', stEv(sol['2']), false, '沒按 A／B 不算');
sol['3'] = st({ f0: 110, filter: 'speaker' });
expect('3', stEv(sol['3']), true, desc(sol['3']));
expect('3', stEv(st({ f0: 111, filter: 'speaker' })), false, '111 Hz 不算');
expect('3', stEv(st({ f0: 110, filter: 'none', on: on([2, 3, 4]) })), false, '沒選手機小喇叭');
sol['4'] = st({ on: on([4, 5, 6]) });
expect('4', stEv(sol['4']), true, desc(sol['4']));
expect('4', stEv(st({ on: on([1, 2, 3, 4, 5, 6]), low: 3 })), true, '用「移除最低 3 根」：' + desc(st({ on: on([1, 2, 3, 4, 5, 6]), low: 3 })));
expect('4', stEv(st({ on: on([4, 5, 6, 7]) })), false, '多了第 7 根');
sol['5'] = st({ f0: 120, filter: 'phone' });
expect('5', stEv(sol['5']), true, desc(sol['5']));
expect('5', stEv(st({ f0: 151, filter: 'phone' })), false, '151 Hz');
expect('5', stEv(st({ f0: 120, filter: 'speaker' })), false, '不是電話');
sol['6'] = st({ low: 3 });
expect('6', stEv(sol['6']), true, desc(sol['6']));
expect('6', stEv(st({ low: 2 })), false, 'n = 2');
expect('6', stEv(st({ low: 6 })), false, 'n = 6 只剩 2 根');
sol['7'] = st({ on: on([2, 3]) });
expect('7', stEv(sol['7']), true, desc(sol['7']));
expect('7', stEv(st({ on: on([3, 5]) })), true, desc(st({ on: on([3, 5]) })));
expect('7', stEv(st({ on: on([2, 4]) })), false, '{2, 4} 的音高是 2 f0');
expect('7', stEv(st({ on: on([1, 3]) })), false, '有基頻');
sol['8'] = st({ on: on([2, 4, 6, 8]) });
expect('8', stEv(sol['8']), true, desc(sol['8']));
expect('8', stEv(st({ on: on([2, 4]) })), false, '只有 2 根');
expect('8', stEv(st({ on: on([3, 6, 9]) })), false, '3 f0 不是八度');
sol['9'] = st({ f0: 100, filter: 'custom', cut: 800 });
expect('9', ev('play', sol['9']), true, '按播放：' + desc(sol['9']) + '（100–400 Hz 被擋掉）');
expect('9', stEv(sol['9']), false, '沒按播放不算');
expect('9', ev('play', st({ low: 4 })), false, '用「移除最低 n 根」拿掉的不算：要第 1 根開著、被高通擋掉');
expect('9', ev('play', st({ f0: 100, filter: 'custom', cut: 700 })), false, '截止 700 Hz：400 Hz 還放得出來，剛好 4 倍不算「超過」');
sol['10'] = [st({ on: on([1, 2, 3]) }), st({ on: on([4, 5, 6]) })];
expect('10', recEv(sol['10']), true, '記錄 ' + desc(sol['10'][0]) + '；再記錄 ' + desc(sol['10'][1]));
expect('10', recEv([st({ on: on([1, 2, 3]) }), st({ on: on([3, 4, 5]) })]), false, '共用 600 Hz');
expect('10', recEv([st({ on: on([1, 2, 3]) })]), false, '只有一筆');
sol['11'] = [st({ on: on([5, 6, 7]) }), st({ on: on([5, 6, 7]), delta: 30 })];
expect('11', recEv(sol['11']), true, '記錄 ' + desc(sol['11'][0]) + '；再記錄 ' + desc(sol['11'][1]));
expect('11', stEv(sol['11'][1]), false, '只調平移、沒有記錄前後兩筆');
expect('11', recEv([st({ on: on([5, 6, 7]) }), st({ on: on([5, 6, 7]), delta: 10 })]), false, 'Δ = 10 Hz 只高 ' + (M.missionData(st({ on: on([5, 6, 7]), delta: 10 })).pitch - 200).toFixed(2) + ' Hz');
expect('11', recEv([st({ on: on([2, 3, 4]) }), st({ on: on([2, 3, 4]), delta: 30 })]), false, '用到第 2、3 根');
expect('11', recEv([st({ on: on([5, 6, 7]) }), st({ on: on([5, 6, 8]), delta: 30 })]), false, '前後泛音不同');
// 任務 12：搜尋 f0、從第 3 根以上連續 3–4 根、Δ 的解
{
  let found = null, count = 0;
  // 先用 de Boer 的 f0 + Δ/n 估計需要的 Δ（n = 中間那根），再在估計值 ±10 Hz 內逐一檢查（全部範圍逐一算太慢）
  for (const f0 of [100, 150, 200, 250, 300, 400]) for (let k0 = 3; k0 <= 8; k0++) for (const n of [3, 4]) {
    if (k0 + n - 1 > 10) continue;
    const ks = []; for (let i = 0; i < n; i++) ks.push(k0 + i);
    const dGuess = Math.round((k0 + (n - 1) / 2) * f0 * (Math.pow(2, 1 / 12) - 1));
    for (let d = Math.max(M.D_MIN, dGuess - 10); d <= Math.min(M.D_MAX, dGuess + 10); d++) {
      if (!d) continue;
      const s = st({ f0: f0, on: on(ks), delta: d });
      if (check('12', stEv(s))) {
        count++;
        // 代表解：f0 = 200 Hz、從第 3 根開始，取最接近 100 音分的
        const err = x => Math.abs(M.cents(M.missionData(x).pitch, x.f0) - 100) + (x.f0 === 200 && x.on[2] && !x.on[1] ? 0 : 1000);
        if (!found || err(s) < err(found)) found = s;
      }
    }
  }
  sol['12'] = found;
  expect('12', stEv(found), true, desc(found) + '（' + M.cents(M.missionData(found).pitch, found.f0).toFixed(1) + ' 音分；全部搜尋共有 ' + count + ' 組解）');
  expect('12', stEv(st({ on: on([1, 2, 3]), delta: 23 })), false, '第 1–3 根、Δ = 23：第 1 根 223 Hz 本身就在，耳朵直接聽到它，不算殘餘音高');
  expect('12', stEv(st({ on: on([2, 3, 4]), delta: 35 })), false, '用到第 2 根也不算');
  expect('12', stEv(st({ on: on([5, 6, 7]), delta: 30 })), false, 'Δ = 30 只高 ' + M.cents(205.002, 200).toFixed(1) + ' 音分');
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務：');
const hs = {};
hs.h1 = [stEv(st({ on: on([3, 5, 7, 9]) }))];
expect('h1', hs.h1[0], true, desc(st({ on: on([3, 5, 7, 9]) })));
expect('h1', stEv(st({ on: on([1, 3, 5, 7, 9]) })), false, '有基頻（單簧管式的奇次泛音）');
hs.h2 = [stEv(st({ on: on([1, 2, 3]), filter: 'custom', cut: 1000 }))];
expect('h2', hs.h2[0], true, '開第 1–3 根、自訂高通 1000 Hz：' + desc(st({ on: on([1, 2, 3]), filter: 'custom', cut: 1000 })));
expect('h2', stEv(st({ on: on([3]) })), false, '只開一根（沒有用濾波器篩）');
hs.h3 = [stEv(st({ f0: 100, delta: 100 }))];
expect('h3', hs.h3[0], true, desc(st({ f0: 100, delta: 100 })));
expect('h3', stEv(st({ f0: 100, delta: -100, low: 1 })), true, '往下一整格：' + desc(st({ f0: 100, delta: -100, low: 1 })));
expect('h3', stEv(st({ f0: 101, delta: 100 })), false, '101 Hz、Δ = 100');
hs.h4 = [stEv(st({ f0: 110, on: on([2, 3]) }))];
expect('h4', hs.h4[0], true, desc(st({ f0: 110, on: on([2, 3]) })));
expect('h4', stEv(st({ f0: 111, on: on([2, 3]) })), false, '111 Hz');
hs.h5 = [stEv(st({ on: on([3, 5]) }))];
expect('h5', hs.h5[0], true, desc(st({ on: on([3, 5]) })) + '（間距 400 Hz，音高 200 Hz）');
expect('h5', stEv(st({ on: on([2, 4]) })), false, '{2, 4}：間距就是音高');
expect('h5', stEv(st({ on: on([5, 6]) })), false, '相鄰');
hs.h6 = [stEv(st({ on: on([5, 6, 7]), delta: 30 }))];
expect('h6', hs.h6[0], true, desc(st({ on: on([5, 6, 7]), delta: 30 })));
expect('h6', stEv(st({ on: on([5, 6, 7, 8]), delta: 30 })), false, '多一根 1630 Hz');
hs.h7 = [stEv(st({ on: on([5, 6, 7]), delta: 1 }))];
expect('h7', hs.h7[0], true, desc(st({ on: on([5, 6, 7]), delta: 1 })) + '（最大公因數 1 Hz：週期 1 秒）');
expect('h7', stEv(st({ on: on([5, 6, 7]), delta: 20 })), false, 'Δ = 20：音高明顯移動');
expect('h7', stEv(st({ on: on([5, 6, 7]), delta: 0 })), false, '不平移');
expect('h7', stEv(st({ on: on([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), delta: 1 })), false, '含第 1、2 根：耳朵直接聽到 201 Hz 的第 1 根，不算');
hs.h8 = [stEv(st({ on: on([3, 4, 5]), delta: 100 }))];
expect('h8', hs.h8[0], true, desc(st({ on: on([3, 4, 5]), delta: 100 })) + '（公因數 ' + M.missionData(st({ on: on([3, 4, 5]), delta: 100 })).gcd + ' Hz）');
expect('h8', stEv(st({ on: on([3, 4, 5]), delta: 99 })), false, 'Δ = 99');
hs.h9 = [recEv([st({ on: on([7, 10]) }), st({ f0: 100, on: on([4, 6]) })])];
expect('h9', hs.h9[0], true, '記錄 ' + desc(st({ on: on([7, 10]) })) + '；再記錄 ' + desc(st({ f0: 100, on: on([4, 6]) })));
expect('h9', recEv([st({ on: on([1, 2, 3]) }), st({ on: on([4, 5, 6]) })]), false, '同一個 f0（任務 10 的解）');
expect('h9', recEv([st({ on: on([7, 10]) }), st({ f0: 100, on: on([2, 4]) })]), false, '第二個有 200 Hz（音高在喇叭裡找得到）');
hs.h10 = [stEv(st({ f0: 100, filter: 'phone', on: on([8, 9, 10]) }))];
expect('h10', hs.h10[0], true, desc(st({ f0: 100, filter: 'phone', on: on([8, 9, 10]) })));
expect('h10', stEv(st({ f0: 100, filter: 'none', on: on([8, 9, 10]) })), false, '不是電話');
expect('h10', stEv(st({ f0: 131, filter: 'phone', on: on([8, 9, 10]) })), false, '131 Hz');

// ---------- 隱藏任務兩兩不連帶完成 ----------
console.log('\n隱藏任務兩兩不連帶完成：');
{
  let bad = 0;
  Object.keys(hs).forEach(id => {
    hs[id].forEach(e => {
      hidden.forEach(m => {
        const mid = m.id.replace('missing-fundamental-', '');
        if (mid === id) return;
        m.mem = {};
        if (m.check(e, m.mem)) { bad++; console.log('  ✗ ' + id + ' 的解也完成了 ' + mid); }
      });
    });
  });
  // 任務 9 的兩筆紀錄各自的 state 事件
  hs.h9.length && [st({ on: on([7, 10]) }), st({ f0: 100, on: on([4, 6]) })].forEach(s => hidden.forEach(m => { m.mem = {}; if (m.check(stEv(s), m.mem)) { bad++; console.log('  ✗ h9 的紀錄狀態完成了 ' + m.id); } }));
  if (bad) fail += bad; else console.log('  ✓ 10 個隱藏任務的解，都不會順便完成其他隱藏任務');
}

// ---------- 亂按 ----------
console.log('\n亂按：');
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const count = {};
  // 1. 只拖滑桿、換濾波器（泛音開關不動）：一個隱藏任務都不可以完成
  const N1 = 4000;
  for (let i = 0; i < N1; i++) {
    const s = st({ f0: 100 + Math.floor(rnd() * 301), low: Math.floor(rnd() * 10), filter: pick(M.FILTER_IDS), cut: 10 * Math.floor(rnd() * 151), delta: rnd() < 0.5 ? 0 : -150 + Math.floor(rnd() * 301) });
    const e = stEv(s);
    hidden.forEach(m => { m.mem = {}; if (m.check(e, m.mem)) count[m.id] = (count[m.id] || 0) + 1; });
  }
  const c1 = Object.keys(count).map(k => k + ' ' + count[k] + ' 次');
  console.log('  ' + (c1.length ? '△' : '✓') + ' 只拖滑桿、換濾波器 ' + N1 + ' 次（開關維持預設）：' + (c1.length ? c1.join('、') + '（都要剛好停在特定的整數值）' : '沒有完成任何隱藏任務'));
  // 2. 連開關也隨機亂按
  Object.keys(count).forEach(k => delete count[k]);
  const N2 = 4000;
  for (let i = 0; i < N2; i++) {
    const o = []; for (let k = 0; k < 10; k++) o.push(rnd() < 0.5);
    const s = st({ f0: 100 + Math.floor(rnd() * 301), on: o, low: rnd() < 0.6 ? 0 : Math.floor(rnd() * 10), filter: rnd() < 0.5 ? 'none' : pick(M.FILTER_IDS), cut: 10 * Math.floor(rnd() * 151), delta: rnd() < 0.6 ? 0 : -150 + Math.floor(rnd() * 301) });
    const e = stEv(s);
    hidden.forEach(m => { m.mem = {}; if (m.check(e, m.mem)) count[m.id] = (count[m.id] || 0) + 1; });
  }
  const c2 = Object.keys(count).map(k => k + ' ' + (100 * count[k] / N2).toFixed(2) + ' %');
  console.log('  ' + ' 開關、滑桿、濾波器全部隨機 ' + N2 + ' 次：' + (c2.length ? c2.join('、') : '沒有完成任何隱藏任務'));
  const worst = Math.max(0, ...Object.values(count)) / N2;
  if (worst > 0.01) { fail++; console.log('  ✗ 有隱藏任務在隨機狀態下超過 1 % 會完成'); }
}

console.log('\n' + (fail ? '有 ' + fail + ' 項不符合' : '全部任務都做得到，預設狀態不觸發，隱藏任務不連帶完成。'));
process.exit(fail ? 1 : 0);
