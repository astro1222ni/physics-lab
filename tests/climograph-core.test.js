// 以 Node 執行：node tests/climograph-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/climograph-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const S = K.STATION;
const code = (id, cd) => { const s = S[id]; return K.classify(s.T, s.P, s.south, { cd: cd || 0 }).code; };
const fill = v => Array(12).fill(v);
const rot6 = a => a.slice(6).concat(a.slice(0, 6));

console.log('climograph-core');

test('統計量：臺北的年均溫、年雨量、最熱最冷月、夏半年雨量占比', () => {
  const s = K.stats(S.taipei.T, S.taipei.P, false);
  near(s.MAT, S.taipei.T.reduce((a, b) => a + b) / 12, 1e-12);
  near(s.MAP, S.taipei.P.reduce((a, b) => a + b), 1e-9);
  assert.strictEqual(s.hot, 6); assert.strictEqual(s.cold, 0);
  near(s.Thot - s.Tcold, s.range, 1e-12);
  const summer = [3, 4, 5, 6, 7, 8].reduce((a, i) => a + S.taipei.P[i], 0);
  near(s.sShare, summer / s.MAP, 1e-12);
  assert.strictEqual(s.season, 'even');
  near(s.Pth, 2 * s.MAT + 14, 1e-12);
  near(s.dryLine, 10 * s.Pth, 1e-12); near(s.desertLine, 5 * s.Pth, 1e-12);
});

test('乾燥門檻：雨量 70% 以上在冬半年 +0、在夏半年 +28、其他 +14；剛好 70% 也算', () => {
  const T = fill(20);
  const winter = [100, 100, 100, 5, 5, 5, 5, 5, 5, 100, 100, 100];      // 冬半年 600 / 630
  const summer = rot6(winter);
  assert.strictEqual(K.stats(T, winter, false).season, 'winter'); near(K.stats(T, winter, false).Pth, 40, 1e-12);
  assert.strictEqual(K.stats(T, summer, false).season, 'summer'); near(K.stats(T, summer, false).Pth, 68, 1e-12);
  assert.strictEqual(K.stats(T, fill(50), false).season, 'even'); near(K.stats(T, fill(50), false).Pth, 54, 1e-12);
  const just = [70, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((v, i) => i === 0 ? 70 : i === 6 ? 30 : 0);   // 冬 70、夏 30
  assert.strictEqual(K.stats(T, just, false).season, 'winter');
  assert.strictEqual(K.stats(T, fill(0), false).season, 'even', '沒有雨時當作季節平均');
});

test('判定順序：E 先於 B、B 先於 A（每個月都熱但很乾 → B，不是 A）', () => {
  assert.strictEqual(K.classify(fill(5), fill(0), false).code, 'ET', '冷又乾：先判 E');
  assert.strictEqual(K.classify(fill(28), fill(10), false).code, 'BWh');
  assert.strictEqual(K.classify(fill(28), fill(100), false).code, 'Af');
  const k = K.classify(fill(28), fill(10), false);
  assert.deepStrictEqual(k.steps.map(s => s.k), ['E', 'B', 'BW', 'h']);
});

test('門檻的邊界：最冷月剛好 18 °C 是 A；最熱月剛好 10 °C 不是 E；最熱月 0 °C 是 EF；C 需要最冷月「高於」0 °C', () => {
  const T18 = [18, 19, 20, 21, 22, 23, 23, 22, 21, 20, 19, 18];
  assert.strictEqual(K.classify(T18, fill(100), false).group, 'A');
  assert.strictEqual(K.classify(T18.map(t => t - 0.1), fill(100), false).group, 'C');
  const T10 = [-5, -4, -2, 2, 6, 9, 10, 9, 6, 2, -2, -4];
  assert.notStrictEqual(K.classify(T10, fill(60), false).group, 'E');
  assert.strictEqual(K.classify(T10.map(t => t - 0.1), fill(60), false).code, 'ET');
  assert.strictEqual(K.classify(fill(0), fill(30), false).code, 'EF');
  assert.strictEqual(K.classify(fill(0.1), fill(30), false).code, 'ET');
  const Tc = [0, 2, 6, 11, 16, 20, 23, 22, 18, 12, 6, 2];
  assert.strictEqual(K.classify(Tc, fill(80), false).group, 'D', '最冷月剛好 0 °C 是 D');
  assert.strictEqual(K.classify(Tc.map(t => t + 0.1), fill(80), false).group, 'C');
  assert.strictEqual(K.classify(Tc, fill(80), false, { cd: -3 }).group, 'C', '用 −3 °C 的分界就是 C');
});

test('熱帶：Af（最乾月 ≥ 60）、Am（≥ 100 − 年雨量/25）、Aw，邊界上取等號', () => {
  const T = fill(27);
  const P = [60, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150];
  assert.strictEqual(K.classify(T, P, false).code, 'Af');
  const P2 = P.slice(); P2[0] = 59.9;                                  // 年雨量 1709.9 → Am 界線 31.6
  assert.strictEqual(K.classify(T, P2, false).code, 'Am');
  const line = x => 100 - (x + 1650) / 25;                              // 最乾月 x 時的 Am 界線
  const x = 1650 / 26 * 0 + (100 - 66) * 25 / 26;                      // 解 x = 100 − (x + 1650)/25
  near(x, line(x), 1e-9);
  const P3 = P.slice(); P3[0] = x;
  assert.strictEqual(K.classify(T, P3, false).code, 'Am', '剛好在界線上算 Am');
  P3[0] = x - 0.01;
  assert.strictEqual(K.classify(T, P3, false).code, 'Aw');
});

test('沙漠與草原：年雨量低於 5·Pth 是 BW；h 與 k 以年均溫 18 °C 分', () => {
  const T = fill(18);                       // Pth = 50 → 界線 500、沙漠 250
  assert.strictEqual(K.classify(T, fill(249.9 / 12), false).code, 'BWh');
  assert.strictEqual(K.classify(T, fill(250 / 12), false).code, 'BSh');
  assert.strictEqual(K.classify(T, fill(499.9 / 12), false).code, 'BSh');
  assert.strictEqual(K.classify(T, fill(500 / 12), false).group, 'A', '剛好達到界線就不是 B（最冷月 18 °C → A）');
  assert.strictEqual(K.classify(fill(17.9), fill(10), false).code, 'BWk');
});

test('第二個字母：s、w、f，以及兩者都成立時看哪半年比較乾', () => {
  const T = [8, 9, 11, 14, 18, 22, 25, 25, 21, 16, 12, 9];
  assert.strictEqual(K.classify(T, [120, 100, 90, 60, 30, 10, 5, 8, 30, 80, 110, 130], false).code[1], 's');
  assert.strictEqual(K.classify(T, [10, 12, 30, 60, 120, 200, 250, 240, 150, 60, 20, 10], false).code[1], 'w');
  assert.strictEqual(K.classify(T, fill(70), false).code[1], 'f');
  // 夏半年最乾 5 < 40 且 < 300/3；冬半年最乾 1 < 夏半年最溼 200/10 → 兩者都成立
  const both = [300, 1, 1, 1, 5, 5, 5, 200, 5, 1, 1, 1];
  const st = K.stats(T, both, false);
  assert.ok(st.Psdry < 40 && st.Psdry < st.Pwwet / 3 && st.Pwdry < st.Pswet / 10);
  assert.strictEqual(K.classify(T, both, false).code[1], st.Ps < st.Pw ? 's' : 'w');
});

test('第三個字母：a（最熱月 ≥ 22）、b（4 個月以上高於 10 °C）、c、d（D 類最冷月 ≤ −38）', () => {
  const P = fill(60);
  assert.strictEqual(K.classify([-10, -8, -2, 6, 13, 18, 22, 20, 14, 6, -2, -8], P, false).code, 'Dfa');
  assert.strictEqual(K.classify([-10, -8, -2, 6, 13, 18, 21.9, 20, 14, 6, -2, -8], P, false).code, 'Dfb');
  assert.strictEqual(K.classify([-20, -18, -10, 0, 8, 12, 15, 13, 10, 0, -10, -18], P, false).code, 'Dfc', '剛好 10 °C 不算「高於」');
  assert.strictEqual(K.classify([-20, -18, -10, 0, 8, 12, 15, 13, 10.1, 0, -10, -18], P, false).code, 'Dfb');
  assert.strictEqual(K.classify([-38, -35, -25, -10, 5, 13, 16, 12, 4, -12, -30, -36], P, false).code, 'Dfd');
  assert.strictEqual(K.classify([-37.9, -35, -25, -10, 5, 13, 16, 12, 4, -12, -30, -36], P, false).code, 'Dfc');
  assert.strictEqual(K.classify([2, 3, 4, 6, 8, 10, 11, 11, 9, 7, 4, 3], fill(80), false).code, 'Cfc');
});

test('南北半球對稱：把 12 個月平移半年並換半球，所有測站的類型與統計量都不變', () => {
  for (const s of K.STATIONS) {
    for (const cd of [0, -3]) {
      const a = K.classify(s.T, s.P, s.south, { cd }), b = K.classify(rot6(s.T), rot6(s.P), !s.south, { cd });
      assert.strictEqual(b.code, a.code, s.id);
      near(b.s.sShare, a.s.sShare, 1e-12, s.id); near(b.s.Pth, a.s.Pth, 1e-12, s.id);
    }
  }
});

test('同一個半年內的月份互換，不會改變類型（規則只看半年的極值與總和）', () => {
  for (const s of K.STATIONS) {
    const perm = [2, 1, 0, 8, 7, 6, 5, 4, 3, 11, 10, 9];      // 1–3 月互換、4–9 月倒序、10–12 月互換
    const T = perm.map(i => s.T[i]), P = perm.map(i => s.P[i]);
    assert.strictEqual(K.classify(T, P, s.south).code, code(s.id), s.id);
  }
});

test('只換半球：臺中變成地中海型 Csa、羅馬變成 Cfa、開普敦變成 BSk', () => {
  const flip = id => { const s = S[id]; return K.classify(s.T, s.P, !s.south).code; };
  assert.strictEqual(flip('taichung'), 'Csa');
  assert.strictEqual(flip('rome'), 'Cfa');
  assert.strictEqual(flip('capetown'), 'BSk');
});

test('測站資料：68 站、代號不重複、24 個數值都在編輯範圍內、座標合理', () => {
  assert.strictEqual(K.STATIONS.length, 68);
  assert.strictEqual(new Set(K.STATIONS.map(s => s.id)).size, 68);
  for (const s of K.STATIONS) {
    assert.ok(s.zh && s.en, s.id);
    assert.strictEqual(s.T.length, 12, s.id); assert.strictEqual(s.P.length, 12, s.id);
    s.T.forEach(t => assert.ok(Number.isFinite(t) && t >= K.T_MIN && t <= K.T_MAX, s.id));
    s.P.forEach(p => assert.ok(Number.isFinite(p) && p >= 0 && p <= K.P_MAX, s.id));
    assert.ok(Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180, s.id);
    assert.strictEqual(s.south, s.lat < 0, s.id);
    assert.ok(['tw', 'as', 'eu', 'af', 'na', 'sa', 'oc'].includes(s.reg), s.id);
    assert.ok(s.src === (s.reg === 'tw' ? 'cwa' : 'wmo'), s.id);
    assert.ok(s.per === '1991–2020' || (s.id === 'hsinchu' && s.per === '1992–2020'), s.id + '（新竹站 1992 年起才有完整資料）');
    assert.ok(K.TYPES[code(s.id)] && K.TYPES[code(s.id, -3)], s.id + ' 的類型要有名稱與顏色');
  }
  const tw = K.STATIONS.filter(s => s.reg === 'tw');
  assert.strictEqual(tw.length, 23);
  tw.forEach(s => assert.ok(s.lat > 21.8 && s.lat < 26 && s.lon > 119 && s.lon < 122.2, s.id));
});

test('測站類型（Peel 等 2007 規則、1991–2020 資料）和常見的分類一致', () => {
  const want = {
    singapore: 'Af', belem: 'Af', mumbai: 'Am', manaus: 'Am', miami: 'Am', bangkok: 'Aw', darwin: 'Aw', bamako: 'Aw',
    riyadh: 'BWh', cairo: 'BWh', aswan: 'BWh', phoenix: 'BWh', alicesprings: 'BWh', antofagasta: 'BWk',
    newdelhi: 'BSh', dakar: 'BSh', beijing: 'BSk', madrid: 'BSk', ulaanbaatar: 'BSk', santiago: 'BSk',
    rome: 'Csa', perth: 'Csa', capetown: 'Csb', sanfrancisco: 'Csb', seattle: 'Csb',
    hongkong: 'Cwa', mexicocity: 'Cwb', shanghai: 'Cfa', tokyo: 'Cfa', sydney: 'Cfa', buenosaires: 'Cfa',
    london: 'Cfb', paris: 'Cfb', reykjavik: 'Cfc', chicago: 'Dfa', moscow: 'Dfb', fairbanks: 'Dfb', yakutsk: 'Dfc', oymyakon: 'Dfd',
    seoul: 'Dwa', lhasa: 'Dwb', utqiagvik: 'ET', nuuk: 'ET',
    taipei: 'Cfa', keelung: 'Cfa', yilan: 'Cfa', taichung: 'Cwa', tainan: 'Cwa', kaohsiung: 'Aw', hengchun: 'Aw',
    hualien: 'Am', taitung: 'Am', chenggong: 'Af', lanyu: 'Af', alishan: 'Cwb', yushan: 'ET'
  };
  for (const id in want) assert.strictEqual(code(id), want[id], id);
  assert.strictEqual(code('verkhoyansk'), 'Dsd', '維科揚斯克：4 月 4.0 mm 算在夏半年，依規則是 s（頁面有說明）');
});

test('C／D 分界改成 −3 °C：只有首爾與拉薩換類型（D → C）', () => {
  const changed = K.STATIONS.filter(s => code(s.id) !== code(s.id, -3)).map(s => s.id).sort();
  assert.deepStrictEqual(changed, ['lhasa', 'seoul']);
  assert.strictEqual(code('seoul', -3), 'Cwa'); assert.strictEqual(code('lhasa', -3), 'Cwb');
});

test('類型名稱與配色：30 種都有中英文名稱與色碼；GROUPS 有五大類', () => {
  assert.strictEqual(Object.keys(K.TYPES).length, 30);
  for (const c in K.TYPES) { const t = K.TYPES[c]; assert.ok(t[0] && t[1] && /^#[0-9a-f]{6}$/.test(t[2]), c); }
  assert.deepStrictEqual(Object.keys(K.GROUPS), ['A', 'B', 'C', 'D', 'E']);
});

test('快照：類型、另一個分界、測站原始類型、釘選、拖曳中旗標', () => {
  const s = S.seoul;
  const snap = K.snapshot({ T: s.T, P: s.P, south: false, cd: 0, base: 'seoul', edited: false, startJul: false,
    pins: [{ id: 'taipei', T: S.taipei.T, P: S.taipei.P, south: false }, { id: null, T: fill(28), P: fill(5), south: false }], view: 'dry', moving: true });
  assert.strictEqual(snap.code, 'Dwa'); assert.strictEqual(snap.altCode, 'Cwa'); assert.strictEqual(snap.baseCode, 'Dwa');
  assert.strictEqual(snap.pins.length, 2); assert.strictEqual(snap.pins[0].code, 'Cfa'); assert.strictEqual(snap.pins[1].code, 'BWh');
  assert.strictEqual(snap.pins[1].id, null);
  assert.strictEqual(snap.view, 'dry'); assert.strictEqual(snap.moving, true);
  near(snap.dryRatio, Math.round(snap.MAP / snap.dryLine * 100) / 100, 0.011);
  const cold = K.snapshot({ T: S.oymyakon.T, P: S.oymyakon.P, south: false, cd: 0, base: 'oymyakon' });
  assert.ok(cold.dryLine < 0 && cold.dryRatio === null, '界線為負時不算比例');
  assert.strictEqual(cold.moving, false);
  // 修改過的資料：baseCode 仍是測站原本的類型
  const T2 = S.taipei.T.slice(); T2[0] = -1;
  const e = K.snapshot({ T: T2, P: S.taipei.P, south: false, cd: 0, base: 'taipei', edited: true });
  assert.strictEqual(e.code, 'Dfa'); assert.strictEqual(e.baseCode, 'Cfa'); assert.strictEqual(e.edited, true);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
