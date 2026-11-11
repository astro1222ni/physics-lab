// 以 Node 執行：node tests/field-core.test.js
'use strict';
const assert = require('assert');
const FC = require('../js/field-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, rel, msg) {
  const tol = rel * Math.max(Math.abs(a), Math.abs(b), 1e-30);
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}

console.log('field-core');

test('單一點電荷：E = kq/r²，方向徑向向外', () => {
  const c = [{ x: 0, y: 0, q: 3 }];
  const e = FC.fieldAt(c, 1, 0); // r = 1 cm
  close(e.ex, FC.K * 3e-9 / 1e-4, 1e-12);
  close(e.ey, 0, 1e-12);
});

test('單一點電荷：V = kq/r', () => {
  const c = [{ x: 0, y: 0, q: -2 }];
  close(FC.potentialAt(c, 0, 2), FC.K * -2e-9 / 0.02, 1e-12);
});

test('電偶極中點：V = 0，E 由正電荷指向負電荷', () => {
  const c = [{ x: -2, y: 0, q: 3 }, { x: 2, y: 0, q: -3 }];
  close(FC.potentialAt(c, 0, 0), 0, 1e-12);
  const e = FC.fieldAt(c, 0, 0);
  assert.ok(e.ex > 0, 'Ex 應為正');
  close(e.ex, 2 * FC.K * 3e-9 / 0.02 ** 2, 1e-12);
});

test('等量同號電荷中點：E = 0', () => {
  const c = [{ x: -2, y: 0, q: 3 }, { x: 2, y: 0, q: 3 }];
  const e = FC.fieldAt(c, 0, 0);
  close(Math.hypot(e.ex, e.ey), 0, 1e-12);
});

test('E = −∇V（數值微分比對）', () => {
  const c = [{ x: -1.3, y: 0.4, q: 2.5 }, { x: 1.7, y: -0.6, q: -4 }];
  const x = 0.31, y = 1.12, h = 1e-5; // cm
  const e = FC.fieldAt(c, x, y);
  const dVdx = (FC.potentialAt(c, x + h, y) - FC.potentialAt(c, x - h, y)) / (2 * h * FC.CM);
  const dVdy = (FC.potentialAt(c, x, y + h) - FC.potentialAt(c, x, y - h)) / (2 * h * FC.CM);
  close(e.ex, -dVdx, 1e-6);
  close(e.ey, -dVdy, 1e-6);
});

test('電偶極的電力線從正電荷出發、終止於負電荷', () => {
  const c = [{ x: -2, y: 0, q: 3 }, { x: 2, y: 0, q: -3 }];
  const lines = FC.fieldLines(c, { bounds: { x0: -30, x1: 30, y0: -30, y1: 30 }, maxSteps: 20000 });
  assert.strictEqual(lines.length, 12);
  // 背向負電荷出發的線會繞非常大的圈（真實物理），可能先離開計算範圍；
  // 其餘的線都必須終止於負電荷，且不可能回到正電荷。
  for (const l of lines) assert.ok(l.end === 'out' || (l.end && l.end.charge === 1), `不合理的終點：${JSON.stringify(l.end)}`);
  const ended = lines.filter(l => l.end && l.end.charge === 1).length;
  assert.ok(ended >= 10, `12 條中只有 ${ended} 條終止於負電荷`);
});

test('電力線處處與等位線垂直：沿線電位單調下降', () => {
  const c = [{ x: -2, y: 0, q: 3 }, { x: 2, y: 0, q: -1 }];
  const [line] = FC.fieldLines(c, { bounds: { x0: -10, x1: 10, y0: -10, y1: 10 } });
  const vs = line.points.slice(0, -1).map(p => FC.potentialAt(c, p[0], p[1]));
  for (let i = 1; i < vs.length; i++) assert.ok(vs[i] < vs[i - 1], `第 ${i} 點電位沒有下降`);
});

test('Marching squares：點電荷等位線為圓', () => {
  const c = [{ x: 0, y: 0, q: 1 }];
  const n = 80, x0 = -4, d = 0.1, grid = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) grid[j * (n + 1) + i] = FC.potentialAt(c, x0 + i * d, x0 + j * d);
  const level = FC.potentialAt(c, 2, 0); // r = 2 cm 的等位線
  const segs = FC.contourSegments(grid, n, n, x0, x0, d, d, level);
  assert.ok(segs.length > 50);
  for (const s of segs) {
    close(Math.hypot(s[0], s[1]), 2, 0.01);
    close(Math.hypot(s[2], s[3]), 2, 0.01);
  }
});

test('試探電荷運動：總力學能 K + qV 守恆', () => {
  const c = [{ x: -2, y: 0, q: 3 }, { x: 2, y: 0, q: -3 }];
  const p = { x: -1, y: 1.5, vx: 0, vy: 0, q: 1, m: 1 };
  const e0 = FC.energy(c, p).total;
  let stop = null, t = 0;
  while (!stop && t < 3) { stop = FC.advance(c, p, 1 / 60); t += 1 / 60; }
  const e1 = FC.energy(c, p).total;
  assert.ok(FC.energy(c, p).K > 0, '應該已經加速');
  close(e1, e0, 1e-4, '能量漂移過大');
});

test('靜止釋放的正試探電荷撞上負電荷', () => {
  const c = [{ x: 0, y: 0, q: -3 }];
  const p = { x: 2, y: 0, vx: 0, vy: 0, q: 1, m: 1 };
  let stop = null, t = 0;
  while (!stop && t < 10) { stop = FC.advance(c, p, 1 / 60); t += 1 / 60; }
  assert.ok(stop && stop.reason === 'hit' && stop.charge === 0);
  close(p.y, 0, 1e-9, '應沿 x 軸直線運動');
});

test('probeInfo：等量同號中點 E = 0、Esum = 2kq/r²；電偶極中垂線上 V = 0、Vsum = 2kq/r', () => {
  const like = [{ x: -2, y: 0, q: 3 }, { x: 2, y: 0, q: 3 }];
  const a = FC.probeInfo(like, 0, 0);
  assert.ok(a.E < 1e-9 * a.Esum, '中點合電場應為零');
  assert.ok(isNaN(a.dir), 'E = 0 時方向無定義');
  close(a.Esum, 2 * FC.K * 3e-9 / 0.02 ** 2, 1e-12);
  const dip = [{ x: -2, y: 0, q: 3 }, { x: 2, y: 0, q: -3 }];
  const b = FC.probeInfo(dip, 0, 2);
  close(b.V, 0, 1e-12);
  close(b.Vsum, 2 * FC.K * 3e-9 / (Math.SQRT2 * 0.02), 1e-12);
  close(b.dir, 0, 1e-12); // 中垂線上 E 平行於由正指向負的方向（+x）
});

test('probeInfo：等量同號中垂線上方 E 朝正上方（90°），下方朝正下方（270°）', () => {
  const like = [{ x: -2, y: 0, q: 3 }, { x: 2, y: 0, q: 3 }];
  close(FC.probeInfo(like, 0, 2).dir, 90, 1e-12);
  close(FC.probeInfo(like, 0, -2).dir, 270, 1e-12);
});

test('不等量異號（+4、−1，相距 d）的零電場點在小電荷外側距離 d 處', () => {
  const c = [{ x: 0, y: 0, q: 4 }, { x: 3, y: 0, q: -1 }];
  const p = FC.probeInfo(c, 6, 0);
  assert.ok(p.E < 1e-12 * p.Esum, '應為零電場點');
});

test('不等量異號的零電位面是圓（阿波羅尼斯圓）：rA/rB = |qA/qB|', () => {
  const c = [{ x: 0, y: 0, q: 4 }, { x: 4, y: 0, q: -2 }];
  const cx = 4 + 4 / 3, R = 8 / 3; // n = 2：圓心在 B 外側 d/(n²−1)，半徑 n·d/(n²−1)
  for (let a = 0; a < 360; a += 30) {
    const t = a * Math.PI / 180;
    const p = FC.probeInfo(c, cx + R * Math.cos(t), R * Math.sin(t));
    assert.ok(Math.abs(p.V) < 1e-9 * p.Vsum, 'V 應為零（角度 ' + a + '°）');
  }
  // 圓的最低點：E 垂直於等位面，朝正上方指向圓內（低電位）
  close(FC.probeInfo(c, cx, -R).dir, 90, 1e-9);
});

test('靜止釋放：軌跡與 q/m 無關，離場動能 ∝ q、速率 ∝ √(q/m)', () => {
  const c = [{ x: 4, y: 4, q: 3 }, { x: 8, y: 4, q: -3 }];
  const B = { x0: 0, x1: 12, y0: 0, y1: 8 };
  function fly(q, m) {
    const p = { x: 2, y: 6, vx: 0, vy: 0, q: q, m: m };
    let stop = null, n = 0;
    while (!stop && n < 60 * 600) { stop = FC.advance(c, p, 1 / 60, { bounds: B, stopRadius: 0.3 }); n++; }
    assert.ok(stop && stop.reason === 'out', '應離開畫面');
    return { x: p.x, y: p.y, v: Math.hypot(p.vx, p.vy), K: FC.energy(c, p).K };
  }
  const a = fly(1, 4), b = fly(1, 1), d = fly(2, 1);
  close(b.x, a.x, 1e-3, '離場位置 x'); close(b.y, a.y, 1e-3, '離場位置 y');
  close(b.v / a.v, 2, 2e-3, 'm 變 1/4，速率加倍');
  close(d.K / b.K, 2, 2e-3, 'q 加倍，動能加倍');
});

console.log(`\n${passed} 項通過`);
