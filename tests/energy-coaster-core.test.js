// 以 Node 執行：node tests/energy-coaster-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/energy-coaster-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const P = C.PRESETS;
const G = 9.8;
/** 在軌道的樣條部分找出高度為 y 的位置（x 在 [a, b] 內，高度單調） */
function xForY(tr, y, a, b) {
  const ya = tr.heightAt(a);
  let lo = a, hi = b;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if ((tr.heightAt(m) - y) * (ya - y) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const first = (r, type) => r.events.find(e => e.type === type);

console.log('energy-coaster-core');

// ---------------- 軌道幾何 ----------------
test('B 樣條：通過首尾控制點，端點切線指向相鄰控制點、端點曲率為 0', () => {
  for (const k of Object.keys(P)) {
    if (P[k].loop) continue;
    const tr = C.buildTrack(P[k]), pts = tr.pts, n = pts.length;
    close(tr.heightAt(pts[0][0]), pts[0][1], 1e-12, k + ' 起點');
    close(tr.heightAt(pts[n - 1][0]), pts[n - 1][1], 1e-12, k + ' 終點');
    close(tr.slopeAt(pts[0][0]), (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]), 1e-9, k + ' 起點切線');
    close(tr.slopeAt(pts[n - 1][0]), (pts[n - 1][1] - pts[n - 2][1]) / (pts[n - 1][0] - pts[n - 2][0]), 1e-9, k + ' 終點切線');
    close(tr.geom(0).k, 0, 1e-9, k + ' 起點曲率');
    close(tr.geom(tr.U).k, 0, 1e-9, k + ' 終點曲率');
  }
});

test('B 樣條是 C² 曲線：每段接點兩側的高度、斜率、曲率都連續', () => {
  for (const k of Object.keys(P)) {
    const tr = C.buildTrack(P[k]);
    tr.pieces.filter(p => p.type === 'spline').forEach(p => {
      p.sp.segs.slice(1).forEach(s => {
        const x = s.xa, a = p.sp.ev(x - 1e-7), b = p.sp.ev(x + 1e-7);
        close(a[0], b[0], 1e-6, k + ' f'); close(a[1], b[1], 1e-5, k + ' f′'); close(a[2], b[2], 1e-4, k + ' f″');
      });
    });
  }
});

test('共線的控制點 → 直線（曲率處處為 0）；4 個同高控制點 → 完全水平的平台', () => {
  const tr = C.buildTrack({ pts: [[2, 10], [8, 7], [14, 4], [20, 1]] });
  for (let x = 2; x <= 20; x += 0.37) { close(tr.heightAt(x), 10 - 0.5 * (x - 2), 1e-12, '直線'); close(tr.geom(tr.uOfX(x)).k, 0, 1e-12, '曲率'); }
  const lp = C.buildTrack(P.loop); // 平台：(23, 6.5)、(27, 6.5)、(31.5, 6.5) 與鏡射的虛擬點
  for (let x = 27.1; x <= 31.5; x += 0.2) { close(lp.heightAt(x), 6.5, 1e-12, '平台高度'); close(lp.slopeAt(x), 0, 1e-12, '平台斜率'); }
});

test('圓形迴圈：周長 2πR、頂點高 2R、曲率 1/R、與樣條以水平切線相接', () => {
  for (const R of [2, 3.2, 4]) {
    const def = { pts: P.loop.pts, loop: { at: 3, R: R } };
    const tr = C.buildTrack(def), L = tr.loop;
    close(L.u1 - L.u0, 2 * Math.PI * R, 1e-12, '周長');
    close(tr.geom(L.uTop).y - L.ya, 2 * R, 1e-12, '頂點高度');
    close(tr.geom(L.uTop).tx, -1, 1e-12, '頂點切線向左');
    close(tr.geom((L.u0 + L.uTop) / 2).k, 1 / R, 1e-12, '曲率');
    [L.u0 - 1e-9, L.u0 + 1e-9, L.u1 - 1e-9, L.u1 + 1e-9].forEach(u => { const g = tr.geom(u); close(g.tx, 1, 1e-8, '水平'); close(g.ty, 0, 1e-8); });
    close(tr.length, tr.pieces[0].len + 2 * Math.PI * R + tr.pieces[2].len, 1e-12, '總長');
  }
  assert.ok(C.validate(P.loop).ok, '預設迴圈軌道合理');
});

test('軌道檢查：控制點太近、低於地面、穿過迴圈都會被拒絕', () => {
  for (const k of Object.keys(P)) assert.ok(C.validate(P[k]).ok, k + ' 預設軌道合理');
  assert.strictEqual(C.validate({ pts: [[2, 10], [2.5, 5], [10, 3]] }).reason, 'gap');
  assert.strictEqual(C.validate({ pts: [[2, 10], [8, -2], [14, -2], [20, 5]] }).reason, 'ground');
  const bad = JSON.parse(JSON.stringify(P.loop)); bad.pts[2] = [12.5, 1]; bad.pts[1] = [10.5, 12];
  assert.strictEqual(C.validate(bad).reason, 'loop');
});

// ---------------- 力學能守恆 ----------------
test('無摩擦：力學能漂移極小（U 形谷跑 120 s 相對誤差 < 1e-6；沒有任何能量修正）', () => {
  const tr = C.buildTrack(P.valley), Pp = { g: G, mu: 0, mode: 'rail', x0: 2.6, v0: 0 };
  const sim = C.createSim(tr, Pp), e0 = C.specificEnergy(tr, Pp, sim).e;
  let maxd = 0;
  for (let i = 0; i < 2400; i++) { C.advance(tr, Pp, sim, 0.05); maxd = Math.max(maxd, Math.abs(C.specificEnergy(tr, Pp, sim).e - e0) / e0); }
  assert.strictEqual(sim.phase, 'track');
  assert.ok(maxd < 1e-6, '漂移 ' + maxd);
});

test('任意兩點力學能相等：½v₁² + gy₁ = ½v₂² + gy₂（各種軌道、兩種車、三種 g）', () => {
  for (const k of ['valley', 'twin', 'loop']) for (const mode of ['rail', 'free']) for (const g of [9.8, 1.62, 23.1]) {
    const tr = C.buildTrack(P[k]), Pp = { g: g, mu: 0, mode: mode, x0: P[k].start + 0.3, v0: 0 };
    const sim = C.createSim(tr, Pp);
    const e0 = 0.5 * sim.v * sim.v + g * tr.geom(sim.u).y;
    for (let i = 0; i < 60 && sim.phase === 'track'; i++) {
      C.advance(tr, Pp, sim, 0.1 + 0.013 * i);
      const K = C.kinematics(tr, Pp, sim);
      if (sim.phase === 'track' && sim.qi === 0) close(0.5 * K.speed * K.speed + g * K.y, e0, 1e-7, k + ' ' + mode + ' g=' + g);
    }
  }
});

test('最低點速率 v = √(2gh)，與質量、軌道形狀、g 的大小無關（g 只改變快慢）', () => {
  for (const k of ['valley', 'twin', 'loop', 'jump']) for (const g of [9.8, 1.62, 23.1]) {
    const tr = C.buildTrack(P[k]), x0 = P[k].start + 0.2;
    const r = C.run(tr, { g: g, mu: 0, mode: 'rail', x0: x0, v0: 0 }, 30);
    const b = first(r, 'bottom');
    close(b.y, tr.yLow, 1e-9, '最低點');
    close(b.v, Math.sqrt(2 * g * (tr.heightAt(x0) - tr.yLow)), 1e-8, k + ' g=' + g);
  }
  // 有初速：v² = v₀² + 2gh
  const tr = C.buildTrack(P.valley);
  const b = first(C.run(tr, { g: G, mu: 0, mode: 'rail', x0: 6, v0: 3.5 }, 10), 'bottom');
  close(b.v, C.speedFromDrop(G, tr.heightAt(6) - tr.yLow, 3.5), 1e-8, '初速 3.5 m/s');
});

test('無摩擦時折返點與出發點同高（能量水位不變）', () => {
  const tr = C.buildTrack(P.valley);
  const r = C.run(tr, { g: G, mu: 0, mode: 'rail', x0: 5, v0: 0 }, 12);
  const turns = r.events.filter(e => e.type === 'turn');
  assert.ok(turns.length >= 2);
  turns.forEach(t => close(t.y, tr.heightAt(5), 1e-8, '折返高度'));
});

test('位能零點可以任意選：總能只差一個常數 mgΔh，速率完全相同', () => {
  const tr = C.buildTrack(P.twin), Pp = { g: G, mu: 0.08, mode: 'rail', x0: 1.5, v0: 0 };
  const sim = C.createSim(tr, Pp), m = 350;
  for (let i = 0; i < 40; i++) {
    C.advance(tr, Pp, sim, 0.17);
    const a = C.energies(tr, Pp, sim, m, 0), b = C.energies(tr, Pp, sim, m, 7.25), c = C.energies(tr, Pp, sim, m, -3);
    close(a.K, b.K, 1e-14, '動能不變'); close(a.Q, b.Q, 1e-14, '熱能不變');
    close(a.E - b.E, m * G * 7.25, 1e-9, 'ΔE = mgΔh'); close(c.E - a.E, m * G * 3, 1e-9);
    close(a.U - b.U, m * G * 7.25, 1e-9, 'ΔU 與零點無關');
  }
});

test('質量不影響運動：每公斤的量相同，能量與 m 成正比', () => {
  const tr = C.buildTrack(P.loop), Pp = { g: G, mu: 0.05, mode: 'free', x0: 2, v0: 0 };
  const sim = C.createSim(tr, Pp);
  C.advance(tr, Pp, sim, 2.3);
  const a = C.energies(tr, Pp, sim, 100, 1), b = C.energies(tr, Pp, sim, 800, 1);
  ['K', 'U', 'Q', 'E'].forEach(k => close(b[k], 8 * a[k], 1e-12, k));
});

// ---------------- 摩擦 ----------------
test('有摩擦：力學能減少的量 = 熱能 = μ∫|N| ds（另外沿路徑積分核對）', () => {
  for (const [k, mode, mu] of [['valley', 'rail', 0.05], ['twin', 'rail', 0.12], ['loop', 'rail', 0.06]]) {
    const tr = C.buildTrack(P[k]), Pp = { g: G, mu: mu, mode: mode, x0: P[k].start + 0.4, v0: 0 };
    const sim = C.createSim(tr, Pp);
    let W = 0, prev = null, steps = 0;
    while (sim.phase === 'track' && sim.t < 25 && steps++ < 200000) {
      C.advance(tr, Pp, sim, 0.0005);
      const g = tr.geom(sim.u), N = Math.abs(C.normalPerKg(g, sim.v, G)), s = sim.path;
      if (prev) W += mu * 0.5 * (N + prev.N) * (s - prev.s); // 梯形法：μ∫|N| ds
      prev = { N: N, s: s };
      if (sim.qi > 0) break;
    }
    const sp = C.specificEnergy(tr, Pp, sim);
    close(sp.e, sim.e0, 1e-9, k + ' 總能守恆（K + U + Q）');
    close(sim.q, W, 1e-4, k + ' Q = μ∫N ds'); // 參考值用梯形法（迴圈接點 N 會跳變），精度約 1e-4
    assert.ok(sim.q > 0.05 * sim.e0, k + ' 熱能夠大');
  }
});

test('水平直軌：滑行 d = v₀²/(2μg) 後停住，熱能 = ½mv₀²', () => {
  const tr = C.buildTrack({ pts: [[1, 3], [10, 3], [20, 3], [31, 3]] });
  for (const [v0, mu] of [[6, 0.2], [9.5, 0.35], [3, 0.05]]) {
    const r = C.run(tr, { g: G, mu: mu, mode: 'rail', x0: 2, v0: v0 }, 60);
    const st = first(r, 'stop');
    assert.ok(st, '停住');
    close(st.x - 2, v0 * v0 / (2 * mu * G), 1e-9, '滑行距離');
    close(st.t, v0 / (mu * G), 1e-9, '時間');
    close(r.sim.q, 0.5 * v0 * v0, 1e-9, '熱能');
  }
});

test('斜直軌：μ < tan θ 時以 a = g(sin θ − μ cos θ) 等加速下滑；μ ≥ tan θ 時靜止不動', () => {
  const th = Math.atan(0.5), tr = C.buildTrack({ pts: [[2, 13], [10, 9], [18, 5], [26, 1]] });
  const mu = 0.2, a = G * (Math.sin(th) - mu * Math.cos(th));
  const Pp = { g: G, mu: mu, mode: 'rail', x0: 2, v0: 0 }, sim = C.createSim(tr, Pp);
  C.advance(tr, Pp, sim, 2);
  close(sim.v, a * 2, 1e-9, 'v = at');
  close(sim.path, 0.5 * a * 4, 1e-9, 's = ½at²');
  close(sim.q, mu * G * Math.cos(th) * sim.path, 1e-9, 'Q = μmg cos θ · s');
  const still = C.createSim(tr, { g: G, mu: 0.5, mode: 'rail', x0: 6, v0: 0 });
  assert.strictEqual(still.phase, 'stopped', 'tan θ = μ：摩擦力撐得住');
});

test('圓形迴圈內有摩擦：v²(φ) 與解析解相符（軌道車，N > 0）', () => {
  const tr = C.buildTrack(P.loop), L = tr.loop, R = L.R;
  for (const [mu, v0] of [[0.05, 14], [0.15, 19], [0, 13]]) {
    const r = C.run(tr, { g: G, mu: mu, mode: 'rail', u0: L.u0 - 1e-12, v0: v0 }, 5); // 從迴圈入口前一點點出發
    const a = 2 * mu;
    const v2 = phi => {
      const Is = (Math.exp(a * phi) * (a * Math.sin(phi) - Math.cos(phi)) + 1) / (1 + a * a);
      const Ic = (Math.exp(a * phi) * (a * Math.cos(phi) + Math.sin(phi)) - a) / (1 + a * a);
      return Math.exp(-a * phi) * (v0 * v0 - 2 * G * R * (Is + mu * Ic));
    };
    const top = first(r, 'loopTop'), done = first(r, 'loopDone');
    assert.ok(top && done && top.nmg > 0, 'μ=' + mu + ' 繞完一圈且頂點 N > 0');
    close(top.v * top.v, v2(Math.PI), 1e-8, 'μ=' + mu + ' 頂點');
    close(done.v * done.v, v2(2 * Math.PI), 1e-8, 'μ=' + mu + ' 繞完一圈');
  }
});

test('靜摩擦：速度降到 0 時 |tan θ| ≤ μ 才停住；停住的位置與 g 無關（由靜止出發）', () => {
  const tr = C.buildTrack(P.valley);
  const r = C.run(tr, { g: G, mu: 0.1, mode: 'rail', x0: 2.6, v0: 0 }, 200);
  const st = first(r, 'stop');
  assert.ok(Math.abs(st.slope) <= 0.1 + 1e-12, '停在坡度 ≤ μ 處');
  r.events.filter(e => e.type === 'turn').forEach(t => assert.ok(Math.abs(tr.slopeAt(t.x)) > 0.1, '折返處坡度 > μ'));
  for (const g of [1.62, 23.1]) {
    const r2 = C.run(tr, { g: g, mu: 0.1, mode: 'rail', x0: 2.6, v0: 0 }, 2000);
    close(first(r2, 'stop').x, st.x, 1e-7, 'g = ' + g);
    close(r2.sim.q / g, r.sim.q / G, 1e-7, '熱能 ∝ g');
  }
});

// ---------------- 正向力與迴圈 ----------------
test('正向力 N = m(g cos θ + κv²)：谷底 N > mg、山頂 N < mg、迴圈底 g + v²/R、頂 v²/R − g', () => {
  const tw = C.buildTrack(P.twin);
  const r = C.run(tw, { g: G, mu: 0, mode: 'rail', x0: 1.5, v0: 0 }, 0.9);
  const g1 = tw.geom(tw.uOfX(7)), g2 = tw.geom(tw.uOfX(13));
  assert.ok(g1.k > 0 && C.normalPerKg(g1, 10, G) > G * g1.tx, '谷：凹向上 κ > 0');
  assert.ok(g2.k < 0 && C.normalPerKg(g2, 5, G) < G * g2.tx, '山頂：κ < 0');
  assert.ok(r.events.length >= 0);
  const lp = C.buildTrack(P.loop), L = lp.loop;
  const bot = lp.geom(L.u0 + 1e-12), top = lp.geom(L.uTop);
  close(C.normalPerKg(bot, 11, G), G + 121 / L.R, 1e-9, '底');
  close(C.normalPerKg(top, 7, G), 49 / L.R - G, 1e-9, '頂');
});

test('自由小車通過圓形迴圈頂點的臨界高度 2.5R：N頂/mg = 2h/R − 5，高一點繞完、低一點離軌', () => {
  for (const R of [2.4, 3.2, 3.8]) {
    const def = { pts: P.loop.pts, loop: { at: 3, R: R } };
    assert.ok(C.validate(def).ok);
    const tr = C.buildTrack(def), L = tr.loop;
    close(C.loopCriticalHeight(R), 2.5 * R, 1e-15);
    for (const f of [1.001, 1.02, 1.2]) {
      const h = 2.5 * R * f, x0 = xForY(tr, L.ya + h, 1.5, 9.5);
      const r = C.run(tr, { g: G, mu: 0, mode: 'free', x0: x0, v0: 0 }, 10);
      const top = first(r, 'loopTop'), done = first(r, 'loopDone');
      assert.ok(top && done, 'R=' + R + ' f=' + f + ' 繞完');
      assert.ok(!r.events.some(e => e.type === 'detach' && e.inLoop), '沒有在迴圈中離軌');
      close(top.nmg, 2 * h / R - 5, 1e-7, 'N頂/mg');
    }
    const h = 2.5 * R * 0.999, x0 = xForY(tr, L.ya + h, 1.5, 9.5);
    const r = C.run(tr, { g: G, mu: 0, mode: 'free', x0: x0, v0: 0 }, 10);
    const det = first(r, 'detach');
    assert.ok(det && det.inLoop && !first(r, 'loopTop'), '低 0.1% 就在頂點前離軌');
    // 軌道車扣住軌道：同樣高度可以繞完
    assert.ok(first(C.run(tr, { g: G, mu: 0, mode: 'rail', x0: x0, v0: 0 }, 10), 'loopDone'), '軌道車繞完');
  }
});

test('迴圈中離軌的高度（相對底部）= (R + 2h)/3，R < h < 2.5R', () => {
  const tr = C.buildTrack(P.loop), L = tr.loop, R = L.R;
  for (const k of [1.3, 1.75, 2.2, 2.45]) {
    const h = k * R, x0 = xForY(tr, L.ya + h, 1.5, 9.5);
    const det = first(C.run(tr, { g: G, mu: 0, mode: 'free', x0: x0, v0: 0 }, 10), 'detach');
    assert.ok(det.inLoop, '在迴圈中');
    close(det.yRel, C.loopDetachHeight(R, h), 1e-7, 'h = ' + k + 'R');
    close(det.v * det.v, -G * R * Math.cos(det.phi), 1e-7, '離軌時 v² = −gR cos φ（N = 0）');
  }
});

test('自由小車繞迴圈（無摩擦）：N底 − N頂 = 6mg', () => {
  const tr = C.buildTrack(P.loop), L = tr.loop;
  for (const y0 of [10, 12.5, 15]) {
    const x0 = xForY(tr, y0, 1.5, 9.5);
    const r = C.run(tr, { g: G, mu: 0, mode: 'free', x0: x0, v0: 0 }, 10);
    const top = first(r, 'loopTop'), vin = first(r, 'loopIn').v;
    const nBot = (G + vin * vin / L.R) / G;
    close(nBot - top.nmg, 6, 1e-7, 'y0 = ' + y0);
  }
});

// ---------------- 拋體 ----------------
test('水平飛離跳台：落點 x = x台 + 2√(hH)，與 g 無關；落地時動能全部變成撞擊熱', () => {
  const tr = C.buildTrack(P.jump), xl = tr.xMax, H = tr.heightAt(xl);
  for (const x0 of [1.5, 3, 4.4]) for (const g of [9.8, 1.62, 23.1]) {
    const h = tr.heightAt(x0) - H;
    const r = C.run(tr, { g: g, mu: 0, mode: 'free', x0: x0, v0: 0 }, 30);
    const lv = first(r, 'leave'), ld = first(r, 'land');
    close(lv.vy, 0, 1e-12, '水平飛出');
    close(lv.v, Math.sqrt(2 * g * h), 1e-8, '出口速率');
    close(ld.x, xl + 2 * Math.sqrt(h * H), 1e-8, '落點 x0=' + x0 + ' g=' + g);
    close(ld.flight, Math.sqrt(2 * H / g), 1e-9, '飛行時間');
    const sp = C.specificEnergy(tr, { g: g }, r.sim);
    close(sp.k, 0, 1e-15); close(sp.e, r.sim.e0, 1e-9, '總能守恆');
  }
});

test('從軌道末端斜向飛出：拋體落點與解析解相符', () => {
  const tr = C.buildTrack({ pts: [[1.5, 14], [6, 4], [11, 1], [15, 2.5], [18, 5]] });
  const x0 = 2.5, r = C.run(tr, { g: G, mu: 0, mode: 'rail', x0: x0, v0: 0 }, 30);
  const lv = first(r, 'leave'), ld = first(r, 'land') || first(r, 'out');
  const ang = Math.atan2(5 - 2.5, 3), v = Math.sqrt(2 * G * (tr.heightAt(x0) - 5));
  close(Math.atan2(lv.vy, lv.vx), ang, 1e-9, '沿末端切線');
  close(lv.v, v, 1e-8);
  const vx = v * Math.cos(ang), vy = v * Math.sin(ang), tf = (vy + Math.sqrt(vy * vy + 2 * G * 5)) / G;
  if (ld.type === 'land') close(ld.x, 18 + vx * tf, 1e-8, '落點');
});

test('離軌後落回軌道：法線速度損失 ½v⊥² 記為撞擊熱，總能 K + U + Q 守恆', () => {
  const tr = C.buildTrack(P.loop), L = tr.loop;
  const x0 = xForY(tr, L.ya + 2.2 * L.R, 1.5, 9.5);
  const r = C.run(tr, { g: G, mu: 0, mode: 'free', x0: x0, v0: 0 }, 6);
  const at = first(r, 'attach');
  assert.ok(at && at.inLoop, '落回迴圈內側');
  // 經典結果：由 1.75R 釋放 → 在 1.5R（φ = 120°）離軌，拋物線剛好通過迴圈最低點
  const x1 = xForY(tr, L.ya + 1.75 * L.R, 1.5, 9.5);
  const a1 = first(C.run(tr, { g: G, mu: 0, mode: 'free', x0: x1, v0: 0 }, 6), 'attach');
  close(a1.x, L.xa, 1e-9, '落在最低點 x'); close(a1.y, L.ya, 1e-9, '落在最低點 y');
  assert.ok(at.vn > 0.5);
  const sim = C.createSim(tr, { g: G, mu: 0, mode: 'free', x0: x0, v0: 0 });
  let qi = 0;
  while (sim.t < 6) { const ev = C.advance(tr, { g: G, mu: 0, mode: 'free' }, sim, 0.01); ev.forEach(e => { if (e.type === 'attach') qi += 0.5 * e.vn * e.vn; }); }
  close(sim.qi, qi, 1e-12, '撞擊熱 = Σ ½v⊥²');
  close(C.specificEnergy(tr, { g: G }, sim).e, sim.e0, 1e-8, '總能守恆');
});

// ---------------- 其他極限情況 ----------------
test('谷底小振幅振盪週期 ≈ 2π√(ρ/g)（ρ = 1/κ 為谷底曲率半徑）', () => {
  const tr = C.buildTrack({ pts: [[4, 10], [16, 0.6], [28, 10]] }), ub = tr.uLow, kb = tr.geom(ub).k;
  assert.ok(kb > 0.02, '谷底有曲率');
  const r = C.run(tr, { g: G, mu: 0, mode: 'rail', u0: ub, v0: 0.05 }, 60);
  const bs = r.events.filter(e => e.type === 'bottom').map(e => e.t);
  const T = (bs[bs.length - 1] - bs[0]) / ((bs.length - 1) / 2);
  close(T, 2 * Math.PI * Math.sqrt(1 / kb / G), 1e-3, '週期');
});

test('時間反演（無摩擦）：跑 T 秒後速度反向再跑 T 秒，回到出發點', () => {
  const tr = C.buildTrack(P.twin), Pp = { g: G, mu: 0, mode: 'rail', x0: 1.5, v0: 0 };
  const sim = C.createSim(tr, Pp), u0 = sim.u;
  C.advance(tr, Pp, sim, 3.7);
  sim.v = -sim.v; sim.dir = -sim.dir;
  C.advance(tr, Pp, sim, 3.7);
  close(sim.u, u0, 1e-7, '位置');
  close(sim.v, 0, 1e-6, '速度');
});

test('初速為負（向左）從左端出發：立刻沿切線飛出', () => {
  const tr = C.buildTrack(P.valley);
  const r = C.run(tr, { g: G, mu: 0, mode: 'rail', x0: 2, v0: -2 }, 5);
  assert.strictEqual(r.events[0].type, 'leave');
  assert.ok(['landed', 'out'].includes(r.sim.phase), r.sim.phase);
});

test('自由小車在坡頂附近擦過離軌點（N 剛好降到 0）：短暫飛起再落回，不會卡在零時間的離軌／落回循環', () => {
  const tr = C.buildTrack(P.loop);
  for (const x0 of [1.8, 1.83, 1.86]) {
    const r = C.run(tr, { g: G, mu: 0.05, mode: 'free', x0: x0, v0: 0 }, 12);
    assert.ok(r.events.length < 200, 'x0 = ' + x0 + ' 事件數 ' + r.events.length);
    assert.ok(r.sim.t >= 12 - 1e-6 || !['track', 'air'].includes(r.sim.phase), 'x0 = ' + x0 + ' 時間有前進');
    const s = C.specificEnergy(tr, { g: G }, r.sim), e0 = G * tr.heightAt(x0);
    if (r.sim.phase !== 'out') close(s.e, e0, 1e-6, 'x0 = ' + x0 + ' 總能守恆（' + r.sim.phase + '）');
  }
});

console.log(`\n${passed} 項通過`);
