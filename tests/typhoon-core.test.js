// 以 Node 執行：node tests/typhoon-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/typhoon-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const S = (o) => Object.assign({ pc: 950, penv: 1010, Rm: 40e3, B: 1.5, lat: 23, c: 5, hd: 300 }, o);
const h300 = 300 * K.DEG;
/** 路徑右邊 d km（正）／左邊（負）的測站；颱風從 800 km 外出發，走 1600 km（不動時 48 小時） */
function pass(o, ds) {
  const s = S(o), h = s.hd * K.DEG;
  const run = K.makeRun(s, { x: -800e3 * Math.sin(h), y: -800e3 * Math.cos(h) },
    ds.map(d => ({ x: d * 1e3 * Math.cos(h), y: -d * 1e3 * Math.sin(h) })));
  K.begin(run);
  K.advance(run, s.c > 0 ? 1600e3 / s.c : 48 * 3600);
  return run.st.map((x, i) => K.stats(run, i));
}

console.log('typhoon-core');

test('Holland 氣壓剖面：中心 pc、最大風半徑處 pc + Δp/e、遠處趨近環境氣壓；dp/dr 與數值微分一致', () => {
  const s = S({});
  near(K.pressure(s, 0), 950, 1e-12);
  near(K.pressure(s, s.Rm), 950 + 60 / Math.E, 1e-9);
  near(K.pressure(s, 1e8), 1010, 0.01);
  for (const r of [10e3, 40e3, 120e3, 500e3]) {
    const num = (K.pressure(s, r + 1) - K.pressure(s, r - 1)) * 100 / 2;
    near(K.dpdr(s, r), num, Math.abs(num) * 1e-6 + 1e-9, 'r=' + r);
  }
  near(K.surge(s), 60 * 100 / (1025 * 9.81), 1e-12);
  near(K.surge(S({ pc: 1009 })) * 100, 0.99, 0.01, '每 hPa 約 1 cm');
});

test('梯度風平衡：V²/r + fV = (1/ρ) dp/dr（北緯 23°、南緯 20°、赤道）', () => {
  for (const lat of [23, -20, 0]) {
    const s = S({ lat }), f = Math.abs(K.coriolisF(lat));
    for (const r of [5e3, 40e3, 100e3, 400e3]) {
      const V = K.gradWind(s, r);
      near(V * V / r + f * V, K.dpdr(s, r) / K.RHO, 1e-9 * (1 + K.dpdr(s, r) / K.RHO), 'lat=' + lat + ' r=' + r);
    }
  }
});

test('赤道（f = 0，旋衡風）最大風速剛好在 Rm、等於 √(BΔp/(ρe))；有 f 時略小、位置略往內', () => {
  for (const B of [1, 1.5, 2.5]) {
    const s = S({ lat: 0, B });
    const m = K.maxGrad(s);
    near(m.V, Math.sqrt(B * 6000 / (K.RHO * Math.E)), 1e-3 * m.V);
    near(m.r, s.Rm, s.Rm * 0.01);
    const m23 = K.maxGrad(S({ B }));
    assert.ok(m23.V < m.V && m23.V > 0.95 * m.V);
  }
});

test('地面風：北半球逆時針、往中心內吹 20°，南半球順時針；移動速度造成右邊（南半球左邊）大 2 × 0.55c', () => {
  const s = S({ c: 0 });
  let w = K.windAt(s, 100e3, 0);                 // 中心以東
  assert.ok(w.v > 0 && w.u < 0, '北半球東側吹向北偏西');
  near(Math.atan2(-w.u, w.v) / K.DEG, 20, 1e-9, '內吹角');
  near(w.speed, K.KS * K.gradWind(s, 100e3), 1e-9);
  w = K.windAt(S({ c: 0, lat: -20 }), 100e3, 0);
  assert.ok(w.v < 0 && w.u < 0, '南半球東側吹向南偏西');
  const sm = S({ c: 10, hd: 0 });                // 往北走
  const right = K.windAt(sm, 60e3, 0).speed, left = K.windAt(sm, -60e3, 0).speed;
  const V = K.surfaceSym(sm, 60e3), b = 20 * K.DEG, t = K.TRANS * 10;
  near(right, Math.hypot(V * Math.sin(b), V * Math.cos(b) + t), 1e-9, '右側：旋轉的風與背景風同向');
  near(left, Math.hypot(V * Math.sin(b), V * Math.cos(b) - t), 1e-9, '左側：反向');
  near(right - left, 2 * t, 0.7, '右減左約 2 × 0.55c（內吹角讓兩個向量不完全共線）');
  const ss = S({ c: 10, hd: 0, lat: -20 });
  assert.ok(K.windAt(ss, -60e3, 0).speed > K.windAt(ss, 60e3, 0).speed, '南半球左邊較大');
  near(K.windAt(sm, 0, 0).speed, K.TRANS * 10, 1e-12, '颱風眼中心只剩背景風');
});

test('中央氣象署強度分級（四捨五入到 0.1 m/s）與蒲福風級', () => {
  const cl = v => K.classify(v).key;
  assert.deepStrictEqual([17.1, 17.2, 32.6, 32.7, 50.9, 51.0, 50.95, 17.14].map(cl),
    ['td', 'mild', 'mild', 'moderate', 'moderate', 'strong', 'strong', 'td']);
  assert.deepStrictEqual([0.2, 13.8, 13.9, 17.1, 24.5, 32.7, 51.0, 56.0, 61.2, 61.3].map(K.beaufort), [0, 6, 7, 7, 10, 12, 16, 16, 17, 18]);
});

test('暴風半徑：七級風（13.9 m/s）與十級風（24.5 m/s）；B 大的颱風風速衰減快、暴風圈小；颱風太弱時為 0', () => {
  const s = S({});
  const r7 = K.radiusOf(s, 13.9), r10 = K.radiusOf(s, 24.5);
  near(K.surfaceSym(s, r7), 13.9, 1e-6);
  near(K.surfaceSym(s, r10), 24.5, 1e-6);
  assert.ok(r7 > r10 && r10 > s.Rm);
  assert.ok(K.radiusOf(S({ B: 2.5, pc: 935 }), 13.9) < K.radiusOf(S({ B: 1, pc: 935 }), 13.9));
  assert.strictEqual(K.radiusOf(S({ pc: 1005 }), 24.5), 0);
  const sm = K.summary(S({}));
  near(sm.vMax, sm.vSym + K.TRANS * 5, 0.3, '最大風速約為對稱部分加 0.55c');
  assert.ok(sm.relMax > 60 && sm.relMax < 150, '最大風在移動方向的右側 ' + sm.relMax);
});

test('颱風通過測站：右側風向順轉、左側逆轉（風向跟著颱風的方位轉，南北半球都一樣）；離中心越近轉得越多', () => {
  const n = pass({}, [60, -60, 150, -150]);
  assert.ok(n[0].rot > 90 && n[2].rot > 90 && n[0].rot > n[2].rot, '右側順轉 ' + n[0].rot + ' ' + n[2].rot);
  assert.ok(n[1].rot < -90 && n[3].rot < -90, '左側逆轉 ' + n[1].rot);
  near(n[0].side, 60, 1e-6); near(n[1].side, -60, 1e-6);
  near(n[0].closest, 60, 0.5);
  near(n[0].minP, K.pressure(S({}), 60e3), 0.01, '最低氣壓出現在最接近時');
  const s = pass({ lat: -20 }, [60, -60]);
  assert.ok(s[0].rot > 90 && s[1].rot < -90, '南半球也是右側順轉、左側逆轉');
  assert.ok(s[1].maxW > s[0].maxW, '但南半球的危險半圓在左邊');
});

test('危險半圓：測站最大風速右側比左側大約 2 × 0.55c；颱風眼通過時先強風、再幾乎無風、再強風（移動慢時）', () => {
  for (const c of [5, 10, 15]) {
    const r = pass({ c }, [60, -60]);
    const d = r[0].maxW - r[1].maxW;
    assert.ok(d > 1.7 * K.TRANS * c && d < 2 * K.TRANS * c + 0.5, 'c=' + c + ' 右減左 ' + d);
  }
  const eye = pass({ c: 3 }, [0.2]);
  assert.ok(eye[0].eye && eye[0].minW < 5);
  assert.ok(!pass({ c: 12 }, [0.2])[0].eye, '走得快時中心的背景風已超過 5 m/s');
  assert.ok(!pass({ c: 3 }, [80])[0].eye, '沒有穿過颱風眼');
});

test('時間積分：步長 30 秒與 120 秒的測站統計一致；靜止的颱風測站紀錄不變', () => {
  const run = (h) => {
    const s = S({ c: 7 });
    const r = K.makeRun(s, { x: 500e3, y: -400e3 }, [{ x: 20e3, y: 10e3 }]);
    K.begin(r); K.advance(r, 60 * 3600, h);
    return K.stats(r, 0);
  };
  const a = run(30), b = run(120);
  near(a.maxW, b.maxW, 0.05); near(a.minP, b.minP, 0.05); near(a.rot, b.rot, 1);
  const r = K.makeRun(S({ c: 0 }), { x: 0, y: 0 }, [{ x: 100e3, y: 0 }]);
  K.begin(r); K.advance(r, 24 * 3600);
  near(r.st[0].rec[0].speed, r.st[0].rec[r.st[0].rec.length - 1].speed, 1e-9);
  near(K.stats(r, 0).rot, 0, 1e-9);
});

console.log(`\n${passed} 項通過${process.exitCode ? '（有失敗）' : ''}`);
