// 以 Node 執行：node tests/river-meander-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/river-meander-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }

/** 自己組一條河（不經過 create 的隨機擾動） */
function river(W, k, xs, ys) {
  return { W, k, seed: 0, t: 0, x: xs.slice(), y: ys.slice(), oxbows: [], hist: [], cuts: 0, artCuts: 0, nextHist: K.HIST_DT, lastCut: null, events: [], maxSin: 1, minGap: Infinity, minGap3: Infinity, minGap4: Infinity, lastNat: null, prevNat: null, prev2Nat: null, straightAt: null };
}
/** 正弦河道 y = a sin(κx)，節點間距 ds */
function sine(W, k, lambda, a, L, ds) {
  const xs = [], ys = [], n = Math.round(L / ds), kap = 2 * Math.PI / lambda;
  for (let i = 0; i <= n; i++) { const x = i * L / n; xs.push(x); ys.push(a * Math.sin(kap * x)); }
  return river(W, k, xs, ys);
}
/** Ω 形的彎：從左邊沿 y = −H 流過來，往上到 A，繞一個半徑 R 的大圈（左側往上、越過頂端、右側往下）到 B，再往下、往右流走；A、B 相距 g */
function omega(W, R, g) {
  const xs = [], ys = [], cx = 4000, yc = Math.sqrt(R * R - g * g / 4), ds = W / 2, H = 2 * W;
  const push = (x, y) => { xs.push(x); ys.push(y); };
  for (let x = 0; x < cx - g / 2; x += ds) push(x, -H);
  for (let y = -H; y < 0; y += ds) push(cx - g / 2, y);
  const a0 = Math.atan2(-yc, -g / 2), a1 = Math.atan2(-yc, g / 2);
  let span = a0 - a1; if (span < 0) span += 2 * Math.PI;
  const m = Math.ceil(span * R / ds);
  for (let q = 0; q <= m; q++) { const ang = a0 - span * q / m; push(cx + R * Math.cos(ang), yc + R * Math.sin(ang)); }
  for (let y = -ds; y > -H; y -= ds) push(cx + g / 2, y);
  for (let x = cx + g / 2; x <= 8000; x += ds) push(x, -H);
  return { r: river(W, 8, xs, ys), arc: span * R };
}
/** 在 [x0, x1] 範圍內把 y 投影到 sin(κx)、cos(κx)：回傳振幅與相位 */
function fourier(r, kap, x0, x1) {
  let s = 0, c = 0, w = 0;
  for (let i = 1; i < r.x.length; i++) {
    const xm = (r.x[i] + r.x[i - 1]) / 2;
    if (xm < x0 || xm > x1) continue;
    const ym = (r.y[i] + r.y[i - 1]) / 2, dx = r.x[i] - r.x[i - 1];
    s += ym * Math.sin(kap * xm) * dx; c += ym * Math.cos(kap * xm) * dx; w += dx;
  }
  s *= 2 / w; c *= 2 / w;
  return { amp: Math.hypot(s, c), phase: Math.atan2(c, s) };   // y ≈ amp·sin(κx + phase)
}

console.log('river-meander-core');

test('曲率：半徑 R 的圓弧，曲率是 1/R；向左彎為正、向右彎為負', () => {
  for (const R of [150, 400, 1000]) {
    const xs = [], ys = [];
    for (let q = 0; q <= 80; q++) { const a = -Math.PI / 2 + q * Math.PI / 80; xs.push(R * Math.cos(a)); ys.push(R + R * Math.sin(a)); }
    const C = K.curvature(xs, ys);
    for (let i = 5; i < 76; i++) near(C[i], 1 / R, 1e-3 / R, '逆時針（向左）');
    const C2 = K.curvature(xs, ys.map(v => -v));
    for (let i = 5; i < 76; i++) near(C2[i], -1 / R, 1e-3 / R, '順時針（向右）');
  }
});

test('進出口附近 8W 內遷移逐漸減弱到 0，河道不會在固定的進出口繞圈', () => {
  const W = 100, r = sine(W, 10, 16 * W, 0.5 * W, 8000, W / 2), m = K.migration(r);
  let s = 0;
  for (let i = 1; i < r.x.length - 1; i++) {
    s += Math.hypot(r.x[i] - r.x[i - 1], r.y[i] - r.y[i - 1]);
    if (s < 0.25 * K.END_W * W) assert.ok(Math.abs(m.R1[i]) < 0.2 * Math.abs(10 * W * m.C[i] * 3) + 1e-9, '進口附近減弱');
  }
  assert.strictEqual(m.R1[0], 0); assert.strictEqual(m.R1[r.x.length - 1], 0);
  const q = K.create({ W: 80, k: 30, seed: 4 });
  K.advance(q, 600);
  assert.ok(q.x.every(v => v >= 0 && v <= K.VALLEY_L), '不越過河谷兩端');
});

test('直線河道：曲率處處為 0，不會遷移', () => {
  const xs = [], ys = [];
  for (let i = 0; i <= 200; i++) { xs.push(i * 40); ys.push(0); }
  const r = river(80, 8, xs, ys);
  const m = K.migration(r);
  for (let i = 0; i < xs.length; i++) { assert.strictEqual(m.C[i], 0); assert.strictEqual(m.R1[i], 0); }
  K.advance(r, 100);
  assert.ok(r.y.every(v => v === 0), '100 年後仍是直線');
  near(K.sinuosity(r), 1, 1e-12);
});

test('遷移速率和線性理論的解析解一致：R1 = kW[Ω C + Γ α∫C(s−ξ)e^{−αξ}dξ]', () => {
  // y = a sin κx 的曲率 C = −aκ² sin κx；指數加權的上游卷積 = −aκ² α(α sin κx − κ cos κx)/(α² + κ²)
  for (const lamW of [8, 16.5, 30]) {
    const W = 100, k = 10, lambda = lamW * W, a = 0.01 * W;
    const r = sine(W, k, lambda, a, 40 * lambda, W / 4);
    const p = K.params(r), al = p.alpha, kap = 2 * Math.PI / lambda;
    const m = K.migration(r);
    let worst = 0, scale = 0;
    for (let i = 0; i < r.x.length; i++) {
      const x = r.x[i];
      if (x < 30 / al || x > r.x[r.x.length - 1] - (K.END_W + 2) * W) continue;   // 進出口附近的遷移刻意減弱，不比
      const C = -a * kap * kap * Math.sin(kap * x);
      const conv = -a * kap * kap * al * (al * Math.sin(kap * x) - kap * Math.cos(kap * x)) / (al * al + kap * kap);
      const R1 = k * W * (K.OMEGA * C + K.GAMMA * conv);
      worst = Math.max(worst, Math.abs(m.R1[i] - R1)); scale = Math.max(scale, Math.abs(R1));
    }
    assert.ok(worst < 0.02 * scale, `λ = ${lamW}W：最大誤差 ${worst} 超過 2%（尺度 ${scale}）`);
  }
});

test('線性穩定：長波長的小擾動會長大並往下游移動，短波長的會消失；成長率與移動速度符合解析解', () => {
  // dA/dt = σA，σ = kWκ²[Ω + Γα/(α + iκ)]；Re σ > 0 長大，波峰以 −Im σ / κ 的速度往下游走
  const W = 100, k = 10;
  for (const [lamW, grows] of [[16.5, true], [30, true], [4, false]]) {
    const lambda = lamW * W, kap = 2 * Math.PI / lambda;
    const r = sine(W, k, lambda, 0.05 * W, 8000, W / 2);
    const p = K.params(r), al = p.alpha;
    const den = al * al + kap * kap;
    const reS = k * W * kap * kap * (K.OMEGA + K.GAMMA * al * al / den), imS = k * W * kap * kap * (-K.GAMMA * al * kap / den);
    const x0 = 2000, x1 = 2000 + Math.floor(4000 / lambda) * lambda;   // 整數個波長，sin、cos 才正交
    const f0 = fourier(r, kap, x0, x1);
    const T = Math.min(40, 0.4 / Math.abs(reS));
    K.advance(r, T);
    const f1 = fourier(r, kap, x0, x1);
    const ratio = f1.amp / f0.amp, expect = Math.exp(reS * r.t);
    assert.strictEqual(ratio > 1, grows, `λ = ${lamW}W 振幅比 ${ratio}`);
    near(Math.log(ratio), Math.log(expect), 0.08 * Math.abs(Math.log(expect)) + 0.003, `λ = ${lamW}W 振幅成長`);
    if (grows) {
      let dph = f1.phase - f0.phase; while (dph > Math.PI) dph -= 2 * Math.PI; while (dph < -Math.PI) dph += 2 * Math.PI;
      // y ≈ amp sin(κx + φ)：φ 變小 ＝ 波峰往 +x（下游）移動
      assert.ok(dph < 0, '往下游移動');
      near(dph, imS * r.t, 0.1 * Math.abs(imS * r.t), `λ = ${lamW}W 相位移動`);
    }
  }
});

test('成長最快的波長：理論值 λ = 2π/(0.762 α) ≈ 16.5 W（α·W = 0.5）', () => {
  const W = 80, al = K.params({ W }).alpha;
  near(al * W, 0.5, 1e-12);
  // g(u) = u(−1 + Γ/(1 + u))，u = κ²/α²，最大值在 (1 + u)² = Γ
  const u = Math.sqrt(K.GAMMA) - 1, lam = 2 * Math.PI / (Math.sqrt(u) * al);
  near(lam / W, 16.5, 0.1);
  // 數值確認：λ = 16.5W 長得比 12W、24W 快
  const rate = lamW => { const kap = 2 * Math.PI / (lamW * W); return kap * kap * (-1 + K.GAMMA * al * al / (al * al + kap * kap)); };
  assert.ok(rate(16.5) > rate(12) && rate(16.5) > rate(24));
});

test('截彎取直：頸部兩岸碰在一起（中心線距離 < 1 倍河寬）才截，中間那一段變成牛軛湖', () => {
  const W = 80;
  const A = omega(W, 4 * W, 0.8 * W);
  const L0 = K.length(A.r), s0 = K.sinuosity(A.r);
  const c = K.findCut(A.r);
  assert.ok(c, '頸寬 0.8W 要截彎');
  K.doCut(A.r, c.i, c.j, false);
  assert.strictEqual(A.r.cuts, 1); assert.strictEqual(A.r.oxbows.length, 1);
  const ox = A.r.oxbows[0];
  near(ox.len, A.arc, 0.05 * A.arc + W, '牛軛湖長度約等於那一圈');
  const chord = Math.hypot(ox.x[ox.x.length - 1] - ox.x[0], ox.y[ox.y.length - 1] - ox.y[0]);
  assert.ok(chord < W, '截在頸部（兩端相距 ' + chord + ' m）');
  near(L0 - K.length(A.r), ox.len - chord, 0.005 * ox.len, '河道少了那一圈、多了頸部的一小段（重新取樣會讓長度差一點點）');
  assert.ok(K.sinuosity(A.r) < s0);
  // 測試用的進出河段也平行相距 0.8W，會接著被截；截到沒有可截為止，最後沒有任何兩段不相鄰的河道靠得比 W 近
  let c2, g = 0;
  while ((c2 = K.findCut(A.r)) && g++ < 20) K.doCut(A.r, c2.i, c2.j, false);
  assert.strictEqual(K.findCut(A.r), null);
  const sArr = [0]; for (let i = 1; i < A.r.x.length; i++) sArr.push(sArr[i - 1] + Math.hypot(A.r.x[i] - A.r.x[i - 1], A.r.y[i] - A.r.y[i - 1]));
  for (let i = 0; i < A.r.x.length; i++) for (let j = i + 1; j < A.r.x.length; j++) {
    if (sArr[j] - sArr[i] >= 3 * W) assert.ok(Math.hypot(A.r.x[i] - A.r.x[j], A.r.y[i] - A.r.y[j]) >= W, '還有靠太近的兩段');
  }
  const B = omega(W, 4 * W, 1.3 * W);
  assert.strictEqual(K.findCut(B.r), null, '頸寬 1.3W 還不會截');
});

test('截彎取直會在模擬中自然發生，並記錄時間間隔', () => {
  const W = 80, A = omega(W, 4 * W, 1.05 * W);
  // 頸部會慢慢變窄（兩邊都在往外岸移），模擬一段時間後一定截掉
  K.advance(A.r, 300);
  assert.ok(A.r.cuts >= 1, '自然截彎 ' + A.r.cuts);
  assert.ok(A.r.lastNat > 0);
  const s = K.snapshot(A.r);
  assert.ok(s.sinceNat >= 0 && s.sinceNat <= A.r.t);
});

test('人工截彎取直：點在彎道上，挖一條直的新河道，省下的長度 = 原本那段 − 新河道', () => {
  const W = 80, A = omega(W, 5 * W, 3 * W);
  assert.strictEqual(K.findCut(A.r), null, '頸寬 3W 不會自然截彎');
  const L0 = K.length(A.r), s0 = K.sinuosity(A.r);
  const top = 4000, ytop = Math.sqrt(25 * W * W - 2.25 * W * W) + 5 * W;
  const res = K.artificialCut(A.r, top, ytop);
  assert.ok(res, '點在彎頂要能截');
  assert.ok(res.saved >= A.arc - 3.5 * W, '至少省下那一圈減去頸寬：' + res.saved);
  assert.ok(res.neck <= 12 * W && res.neck >= 3 * W - 1e-6, '新河道長 ' + res.neck);
  near(L0 - K.length(A.r), res.saved, 1e-6, '河道少掉的長度就是省下的長度');
  near(res.before, s0, 1e-9); near(res.after, K.sinuosity(A.r), 1e-9);
  assert.strictEqual(A.r.artCuts, 1); assert.strictEqual(A.r.cuts, 0);
  assert.ok(A.r.oxbows[0].art);
  assert.strictEqual(K.artificialCut(A.r, 2000, 3 * W), null, '離河道太遠不能截');
  // 直線河道沒有彎可以截
  const xs = [], ys = []; for (let i = 0; i <= 200; i++) { xs.push(i * 40); ys.push(0); }
  assert.strictEqual(K.artificialCut(river(W, 8, xs, ys), 4000, 0), null);
});

test('重新取樣：節點間距維持在 W/4 到 3W/4', () => {
  const r = K.create({ W: 60, k: 20, seed: 3 });
  K.advance(r, 300);
  for (let i = 1; i < r.x.length; i++) {
    const d = Math.hypot(r.x[i] - r.x[i - 1], r.y[i] - r.y[i - 1]);
    assert.ok(d >= 60 / 4 - 1e-9 && d <= 60 * 0.75 + 1e-9, '間距 ' + d);
  }
  assert.strictEqual(r.x[0], 0); assert.strictEqual(r.y[0], 0);
  assert.strictEqual(r.x[r.x.length - 1], K.VALLEY_L); assert.strictEqual(r.y[r.y.length - 1], 0);
});

test('同樣的種子、同樣的操作得到同樣的河道（不論一次跑完還是分段跑）', () => {
  const a = K.create({ W: 80, k: 8, seed: 7 }), b = K.create({ W: 80, k: 8, seed: 7 });
  K.advance(a, 500);
  for (let t = 0; t < 500; t += 37) K.advance(b, Math.min(37, 500 - t));
  // 分段跑每段都會跑到「至少」該年，所以 b 可能多走半步；用 a 的步數補齊後比較
  const c = K.create({ W: 80, k: 8, seed: 7 });
  while (c.t < b.t - 1e-12) K.step(c);
  assert.strictEqual(c.x.length, b.x.length);
  for (let i = 0; i < b.x.length; i++) { assert.strictEqual(c.x[i], b.x[i]); assert.strictEqual(c.y[i], b.y[i]); }
  assert.strictEqual(c.cuts, b.cuts);
  const d = K.create({ W: 80, k: 8, seed: 8 });
  assert.notStrictEqual(d.y[50], a.y[50] === undefined ? 0 : K.create({ W: 80, k: 8, seed: 7 }).y[50], '不同種子');
});

test('尺度不變：河寬加倍、形狀放大一倍，時間也加倍，彎曲度的變化一模一樣', () => {
  const mk = W => { const xs = [], ys = []; const L = 60 * W; for (let i = 0; i <= 120; i++) { const x = i * L / 120; xs.push(x); ys.push(0.4 * W * Math.sin(2 * Math.PI * x / (15 * W)) * Math.sin(Math.PI * i / 120)); } return river(W, 8, xs, ys); };
  const a = mk(40), b = mk(80);
  near(K.sinuosity(a), K.sinuosity(b), 1e-9);
  K.advance(a, 200); K.advance(b, 400);
  near(K.sinuosity(b), K.sinuosity(a), 0.01 * K.sinuosity(a), '彎曲度');
  assert.ok(K.sinuosity(a) > 1.05, '有明顯長大');
});

test('曲流波長：λ = 12W 的正弦河道量出約 12W', () => {
  const W = 80, r = sine(W, 8, 12 * W, 2 * W, 8000, W / 2);
  near(K.wavelength(r) / W, 12, 0.4);
  const xs = [], ys = []; for (let i = 0; i <= 200; i++) { xs.push(i * 40); ys.push(0); }
  assert.strictEqual(K.wavelength(river(W, 8, xs, ys)), null, '直線沒有波長');
});

test('從直直的河谷開始：曲流自然長出來，波長約 10–20 倍河寬，之後彎曲度在 1.5 以上起伏，有牛軛湖', () => {
  const r = K.create({ W: 80, k: 8, seed: 1 });
  assert.ok(K.sinuosity(r) < 1.05, '一開始接近直線');
  K.advance(r, 1200);
  const lam = K.wavelength(r);
  assert.ok(lam && lam / 80 > 8 && lam / 80 < 22, 'λ/W = ' + (lam / 80));
  assert.ok(r.maxSin > 2, '最大彎曲度 ' + r.maxSin);
  assert.ok(K.sinuosity(r) > 1.5);
  assert.ok(r.cuts >= 3, '截彎 ' + r.cuts);
  assert.ok(r.hist.length > 0 && r.hist.length <= K.HIST_MAX);
  // 河道不會跑出河谷
  assert.ok(r.y.every(v => Math.abs(v) <= K.VALLEY_H / 2 - 80 + 1e-9));
});

test('橫剖面：彎道凹岸深、凸岸淺，平均水深 = D；彎得很急時凸岸露出沙洲', () => {
  const W = 100, R = 600;
  const xs = [], ys = [];
  for (let q = 0; q <= 60; q++) { const a = -Math.PI / 2 + q * Math.PI / 60; xs.push(R * Math.cos(a)); ys.push(R + R * Math.sin(a)); }
  const r = river(W, 8, xs, ys);
  const cs = K.crossSection(r, 30);
  assert.strictEqual(cs.outer, 'right', '向左彎，凹岸在右邊');
  assert.ok(cs.h[cs.h.length - 1] > cs.h[0], '右邊（凹岸）比較深');
  near(cs.h.reduce((s, v) => s + v, 0) / cs.h.length, cs.D, 1e-9, '平均水深');
  near(cs.D, W / K.WD, 1e-12);
  near(cs.c, W / R, 1e-3);
  assert.ok(cs.hMin > 0);
  // 曲率半徑 1.2W：A·c/2 > 1，凸岸水深變成 0
  const R2 = 120, xs2 = [], ys2 = [];
  for (let q = 0; q <= 60; q++) { const a = -Math.PI / 2 + q * Math.PI / 60; xs2.push(R2 * Math.cos(a)); ys2.push(-(R2 + R2 * Math.sin(a))); }
  const cs2 = K.crossSection(river(W, 8, xs2, ys2), 30);
  assert.strictEqual(cs2.outer, 'left', '向右彎，凹岸在左邊');
  assert.strictEqual(cs2.hMin, 0, '露出沙洲');
  assert.strictEqual(cs2.h[cs2.h.length - 1], 0, '右邊（凸岸）露出');
});

test('任務紀錄：最大彎曲度、兩次自然截彎的最短間隔、人工拉直', () => {
  const r = K.create({ W: 80, k: 8, seed: 1 });
  while (r.maxSin < 2.6 && r.t < 3000) K.step(r);
  const s1 = K.snapshot(r);
  assert.ok(s1.maxSin >= 2.6 && s1.straightAt === null && s1.lastArt === null);
  const clone = q => Object.assign({}, q, { x: q.x.slice(), y: q.y.slice(), oxbows: q.oxbows.slice(), events: q.events.slice(), hist: [] });
  let taps = 0;
  while (K.sinuosity(r) > 1.2 && taps < 20) {
    let best = null;
    for (let i = 2; i < r.x.length - 2; i += 2) { const res = K.artificialCut(clone(r), r.x[i], r.y[i]); if (res && (!best || res.after < best.after)) best = { i, after: res.after }; }
    if (!best) break;
    K.artificialCut(r, r.x[best.i], r.y[best.i]); taps++;
  }
  const s2 = K.snapshot(r);
  assert.ok(s2.sin <= 1.2, '拉直到 ' + s2.sin);
  assert.strictEqual(s2.straightAt, r.t);
  assert.ok(s2.lastArt && s2.lastArt.after <= 1.2 && s2.artCuts === taps);
  near(s2.maxSin, r.maxSin, 0);
});

test('快照欄位', () => {
  const r = K.create({ W: 80, k: 8, seed: 2 });
  const s0 = K.snapshot(r, { running: false });
  assert.strictEqual(s0.t, 0); assert.strictEqual(s0.cuts, 0); assert.strictEqual(s0.lakes, 0); assert.strictEqual(s0.oldest, 0);
  assert.strictEqual(s0.minGap, null); assert.strictEqual(s0.lastCut, null); assert.strictEqual(s0.running, false);
  K.advance(r, 700);
  const s = K.snapshot(r);
  near(s.L / K.VALLEY_L, s.sin, 1e-9);
  assert.ok(s.cuts >= 1 && s.lakes >= 1 && s.oldest > 0 && s.oldest <= s.t);
  assert.ok(s.lastCut && !s.lastCut.art);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
