// 以 Node 執行：node tests/hanoi-core.test.js
'use strict';
const assert = require('assert');
const H = require('../js/hanoi-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
/** 照著一串移動做一遍，每一步都檢查合法，傳回最後的狀態 */
function play(pos, n, moves) {
  const p = pos.slice();
  moves.forEach((m, i) => {
    const c = H.check(p, n, m.from, m.to);
    assert.ok(c.ok, '第 ' + (i + 1) + ' 步不合法：' + JSON.stringify(m) + ' 在 ' + H.str(p, n));
    assert.strictEqual(c.disk, m.disk, '第 ' + (i + 1) + ' 步搬的盤子不對');
    p[m.disk] = m.to;
  });
  return p;
}
const same = (a, b) => a.length === b.length && a.every((m, i) => m.disk === b[i].disk && m.from === b[i].from && m.to === b[i].to);

test('編碼與解碼互逆，3^n 個狀態都合法且各不相同', () => {
  for (let n = 1; n <= 6; n++) {
    const seen = new Set();
    for (let c = 0; c < Math.pow(3, n); c++) {
      const p = H.decode(c, n);
      assert.strictEqual(H.encode(p, n), c);
      assert.strictEqual(H.str(H.parse(H.str(p, n)), n), H.str(p, n));
      seen.add(H.str(p, n));
    }
    assert.strictEqual(seen.size, Math.pow(3, n));
  }
});

test('遞迴解：步數 = 2^n − 1、每一步合法、最後全部在目標柱（n = 1..10，六種起訖）', () => {
  for (let n = 1; n <= 10; n++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    if (a === b) continue;
    const mv = H.hanoiMoves(n, a, b);
    assert.strictEqual(mv.length, Math.pow(2, n) - 1);
    assert.strictEqual(H.str(play(H.perfect(n, a), n, mv), n), H.str(H.perfect(n, b), n));
  }
});

test('遞迴解的步數 = 廣度優先搜尋的最短步數（n ≤ 8）', () => {
  for (let n = 1; n <= 8; n++) {
    const r = H.bfs(H.encode(H.perfect(n, 0), n), n);
    assert.strictEqual(r.count, Math.pow(3, n), '每個狀態都走得到');
    assert.strictEqual(r.dist[H.encode(H.perfect(n, 2), n)], H.hanoiMoves(n, 0, 2).length);
    assert.strictEqual(r.dist[H.encode(H.perfect(n, 1), n)], Math.pow(2, n) - 1);
  }
});

test('遞迴關係 T(n) = 2T(n − 1) + 1', () => {
  for (let n = 2; n <= 20; n++) assert.strictEqual(H.minMoves(n), 2 * H.minMoves(n - 1) + 1);
  assert.strictEqual(H.minMoves(1), 1);
});

test('任意狀態到「全部在某柱」的最短步數：公式 = 廣度優先搜尋（n ≤ 8，三根柱子）', () => {
  for (let n = 1; n <= 8; n++) for (let t = 0; t < 3; t++) {
    const r = H.bfs(H.encode(H.perfect(n, t), n), n);
    for (let c = 0; c < Math.pow(3, n); c++) {
      const d = H.distToPerfect(H.decode(c, n), n, t);
      if (d !== r.dist[c]) assert.fail('n=' + n + ' 目標 ' + 'ABC'[t] + ' 狀態 ' + H.str(H.decode(c, n), n) + '：公式 ' + d + '，BFS ' + r.dist[c]);
    }
  }
});

test('最短路（pathToPerfect）每步合法、長度 = 最短步數（n ≤ 6，所有狀態）', () => {
  for (let n = 1; n <= 6; n++) for (let t = 0; t < 3; t++) for (let c = 0; c < Math.pow(3, n); c++) {
    const p = H.decode(c, n), path = H.pathToPerfect(p, n, t);
    assert.strictEqual(path.length, H.distToPerfect(p, n, t));
    assert.strictEqual(H.perfectPeg(play(p, n, path), n), t);
  }
});

test('尺規函數：第 k 步搬的盤 = k 的二進位尾端 0 的個數 + 1', () => {
  // OEIS A001511 的前幾項
  const A001511 = [1, 2, 1, 3, 1, 2, 1, 4, 1, 2, 1, 3, 1, 2, 1, 5, 1, 2, 1, 3, 1, 2, 1, 4, 1, 2, 1, 3, 1, 2, 1, 6];
  A001511.forEach((v, i) => assert.strictEqual(H.ruler(i + 1), v, 'k = ' + (i + 1)));
  for (let k = 1; k <= 4096; k++) {
    const bin = k.toString(2), z = bin.length - 1 - bin.lastIndexOf('1');
    assert.strictEqual(H.ruler(k), z + 1);
  }
  for (let n = 1; n <= 10; n++) {
    H.hanoiMoves(n, 0, 2).forEach((m, i) => assert.strictEqual(m.disk, H.ruler(i + 1), 'n=' + n + ' 第 ' + (i + 1) + ' 步'));
  }
  // 盤 d 在 2^n − 1 步裡剛好搬 2^(n−d) 次
  const mv = H.hanoiMoves(9, 0, 1), cnt = {};
  mv.forEach(m => { cnt[m.disk] = (cnt[m.disk] || 0) + 1; });
  for (let d = 1; d <= 9; d++) assert.strictEqual(cnt[d], Math.pow(2, 9 - d));
});

test('不用遞迴的解法（最小盤輪流）和遞迴解每一步都相同', () => {
  for (let n = 1; n <= 10; n++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    if (a === b) continue;
    assert.ok(same(H.iterativeMoves(n, a, b), H.hanoiMoves(n, a, b)), 'n=' + n + ' ' + a + '→' + b);
  }
  // 最小盤的方向：n 奇數 A → C → B，n 偶數 A → B → C
  assert.deepStrictEqual(H.iterativeMoves(3, 0, 2).filter(m => m.disk === 1).slice(0, 3).map(m => m.to), [2, 1, 0]);
  assert.deepStrictEqual(H.iterativeMoves(4, 0, 2).filter(m => m.disk === 1).slice(0, 3).map(m => m.to), [1, 2, 0]);
});

test('直接算第 k 步（moveAt）與第 k 步後的狀態（stateAt）', () => {
  for (let n = 1; n <= 10; n++) for (const [a, b] of [[0, 2], [0, 1], [2, 1]]) {
    const mv = H.hanoiMoves(n, a, b), p = H.perfect(n, a);
    assert.strictEqual(H.str(H.stateAt(0, n, a, b), n), H.str(p, n));
    mv.forEach((m, i) => {
      const q = H.moveAt(i + 1, n, a, b);
      assert.ok(q.disk === m.disk && q.from === m.from && q.to === m.to, 'n=' + n + ' 第 ' + (i + 1) + ' 步');
      p[m.disk] = m.to;
      assert.strictEqual(H.str(H.stateAt(i + 1, n, a, b), n), H.str(p, n));
    });
  }
});

test('狀態圖：邊數 = 3(3^n − 1)/2，三個角各 2 條邊，其他點各 3 條', () => {
  for (let n = 1; n <= 7; n++) {
    const N = Math.pow(3, n);
    assert.strictEqual(H.edges(n).length, 3 * (N - 1) / 2);
    for (let c = 0; c < N; c++) {
      const k = H.neighbors(c, n).length, pp = H.perfectPeg(H.decode(c, n), n);
      assert.strictEqual(k, pp >= 0 ? 2 : 3);
    }
  }
});

test('謝爾賓斯基三角形的座標：每條邊一樣長、各點不重疊、三個角在三角形頂點', () => {
  for (let n = 1; n <= 7; n++) {
    const xy = H.layout(n), S = Math.pow(2, n) - 1, L = 1 / S;
    H.edges(n).forEach(e => {
      const dx = xy[2 * e[0]] - xy[2 * e[1]], dy = xy[2 * e[0] + 1] - xy[2 * e[1] + 1];
      assert.ok(Math.abs(Math.hypot(dx, dy) - L) < 1e-9, '邊長');
    });
    const keys = new Set();
    for (let c = 0; c < Math.pow(3, n); c++) keys.add(Math.round(xy[2 * c] * 1e6) + ',' + Math.round(xy[2 * c + 1] * 1e6));
    assert.strictEqual(keys.size, Math.pow(3, n));
    const corner = t => { const c = H.encode(H.perfect(n, t), n); return [xy[2 * c], xy[2 * c + 1]]; };
    assert.deepStrictEqual(corner(0).map(v => +v.toFixed(9)), [0, 0]);
    assert.deepStrictEqual(corner(2).map(v => +v.toFixed(9)), [1, 0]);
    assert.ok(Math.abs(corner(1)[0] - 0.5) < 1e-9 && Math.abs(corner(1)[1] - Math.sqrt(3) / 2) < 1e-9);
  }
});

test('從完美狀態做廣度優先搜尋：層數 = 2^n − 1；最遠的點剛好 2^n 個', () => {
  for (let n = 1; n <= 8; n++) {
    const r = H.bfs(H.encode(H.perfect(n, 0), n), n);
    assert.strictEqual(r.layers, Math.pow(2, n) - 1);
    let far = 0;
    for (let c = 0; c < r.dist.length; c++) if (r.dist[c] === r.layers) far++;
    assert.strictEqual(far, Math.pow(2, n));
  }
});

test('狀態圖的半徑（最好的起點）= 3·2^(n−2)（n ≥ 3），而且剛好 6 個這樣的點', () => {
  for (let n = 1; n <= 7; n++) {
    let best = Infinity, cnt = 0, ok = true;
    for (let c = 0; c < Math.pow(3, n); c++) {
      const e = H.bfs(c, n).layers;
      if (e < best) { best = e; cnt = 1; } else if (e === best) cnt++;
    }
    assert.strictEqual(best, H.radius(n), 'n=' + n);
    if (n >= 3) assert.strictEqual(cnt, 6, 'n=' + n + ' 的中心點數');
    assert.ok(ok);
  }
  // n = 6 的中心：盤 5 單獨在另一根柱子，其餘都在一起
  const c = H.encode(H.parse('AAAABA'), 6);
  assert.strictEqual(H.bfs(c, 6).layers, 48);
});

test('任意兩個狀態：最大盤直接搬一次（d1）或繞一次（d2），最短步數 = min(d1, d2)（與 BFS 比對）', () => {
  for (let n = 2; n <= 6; n++) {
    const N = Math.pow(3, n);
    let lt = 0, eq = 0;
    for (let t = 0; t < N; t++) {
      const r = H.bfs(t, n), tp = H.decode(t, n);
      for (let s = 0; s < N; s++) {
        const bm = H.bigMoveDists(H.decode(s, n), tp, n);
        if (!bm) continue;
        assert.strictEqual(Math.min(bm.d1, bm.d2), r.dist[s], 'n=' + n + ' ' + H.str(H.decode(s, n), n) + ' → ' + H.str(tp, n));
        if (bm.d2 < bm.d1) lt++; else if (bm.d2 === bm.d1) eq++;
      }
    }
    if (n === 3) { assert.strictEqual(lt, 18); assert.strictEqual(eq, 30); }
    if (n >= 3) assert.ok(lt > 0 && eq > 0);
  }
  const ex = H.bigMoveDists(H.parse('AAB'), H.parse('BBA'), 3);
  assert.deepStrictEqual([ex.d1, ex.d2], [7, 5]);
  const ex7 = H.bigMoveDists(H.parse('AAAAAAB'), H.parse('BBBBBBA'), 7);
  assert.deepStrictEqual([ex7.d1, ex7.d2], [127, 65]);
  const e2 = H.bigMoveDists(H.parse('AAB'), H.parse('ABA'), 3);
  assert.deepStrictEqual([e2.d1, e2.d2], [6, 6]);
});

test('單行道（只准 A → B → C → A）：整疊往前一格 Q(n)、兩格 R(n) 步，與有方向的 BFS 相同', () => {
  for (let n = 1; n <= 7; n++) {
    const N = Math.pow(3, n), dist = new Int32Array(N).fill(-1), q = [H.encode(H.perfect(n, 0), n)];
    dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], p = H.decode(c, n);
      H.legalMoves(p, n).forEach(m => {
        if ((m[1] - m[0] + 3) % 3 !== 1) return;
        const x = c + (m[1] - m[0]) * Math.pow(3, H.tops(p, n)[m[0]] - 1);
        if (dist[x] < 0) { dist[x] = dist[c] + 1; q.push(x); }
      });
    }
    const cc = H.cyclicCounts(n);
    assert.strictEqual(dist[H.encode(H.perfect(n, 1), n)], cc.q, 'n=' + n + ' 往前一格');
    assert.strictEqual(dist[H.encode(H.perfect(n, 2), n)], cc.r, 'n=' + n + ' 往前兩格');
    for (const [st, dir, to] of [[1, 1, 1], [2, 1, 2], [1, -1, 2], [2, -1, 1]]) {
      const mv = H.cyclicMoves(n, 0, st, dir);
      assert.strictEqual(mv.length, st === 1 ? cc.q : cc.r);
      assert.ok(mv.every(m => (m.to - m.from + 3) % 3 === (dir === 1 ? 1 : 2)), '方向');
      assert.strictEqual(H.perfectPeg(play(H.perfect(n, 0), n, mv), n), to);
    }
  }
  assert.deepStrictEqual([H.cyclicCounts(4).q, H.cyclicCounts(4).r], [43, 59]);
});

test('呼叫樹：節點數 = 2^n − 1，每個呼叫的移動範圍 L..R 正確，從任意狀態的解 = 最短步數', () => {
  for (let n = 1; n <= 8; n++) {
    const tr = H.hanoiTree(n, 0, 2);
    assert.strictEqual(tr.nodes.length, Math.pow(2, n) - 1);
    assert.ok(same(tr.moves, H.hanoiMoves(n, 0, 2)));
    tr.nodes.forEach(nd => assert.strictEqual(nd.R - nd.L + 1, Math.pow(2, nd.k) - 1));
  }
  for (let n = 1; n <= 6; n++) for (let c = 0; c < Math.pow(3, n); c++) {
    const p = H.decode(c, n), tr = H.solveTree(p, n, 2);
    assert.strictEqual(tr.moves.length, H.distToPerfect(p, n, 2));
    play(p, n, tr.moves);
  }
});

test('「跳過子問題」從頭按三次就解完；按「單步」後再跳過，只完成目前這一層', () => {
  for (let n = 2; n <= 8; n++) {
    const s = new H.Session({ n: n });
    s.autoSkip(); assert.strictEqual(s.stack.length, Math.pow(2, n - 1) - 1);
    s.autoSkip(); assert.strictEqual(s.stack.length, Math.pow(2, n - 1));
    s.autoSkip(); assert.ok(s.solved());
  }
  const s = new H.Session({ n: 5 });
  s.autoStep(true);                      // 第 1 步：盤 1，在最深的呼叫裡
  assert.strictEqual(s.stack.length, 1);
  s.autoSkip();                          // 做完 hanoi(1) 之後回到 hanoi(2)：下一個指令是搬盤 2
  assert.strictEqual(s.stack.length, 2);
  s.autoSkip();                          // 再下一個是 hanoi(1)
  assert.strictEqual(s.stack.length, 3);
});

test('Session：不合法的移動（大壓小）不會改變狀態並送出 illegal', () => {
  const ev = [];
  const s = new H.Session({ n: 3, emit: (t, d) => ev.push([t, d]) });
  s.tryMove(0, 2, 'hand');                 // 盤 1 → C
  const r = s.tryMove(0, 2, 'hand');       // 盤 2 想壓在盤 1 上
  assert.ok(!r.ok && r.reason === 'big' && r.disk === 2 && r.onto === 1);
  assert.strictEqual(s.state(), 'CAA');
  assert.strictEqual(ev.filter(e => e[0] === 'illegal').length, 1);
  assert.ok(!s.tryMove(1, 2).ok, '空柱不能搬');
});

test('Session：親手解完送出 solved，尾段與距離正確；上一步全部倒回時 atStart', () => {
  const ev = [];
  const s = new H.Session({ n: 4, emit: (t, d) => ev.push([t, d]) });
  H.hanoiMoves(4, 0, 2).forEach(m => s.tryMove(m.from, m.to, 'hand'));
  const sv = ev.filter(e => e[0] === 'solved').map(e => e[1]);
  assert.strictEqual(sv.length, 1);
  assert.ok(sv[0].handAll && sv[0].moves === 15 && sv[0].startPerfect === 'A' && sv[0].tail.len === 15 && sv[0].tail.big === 1);
  for (let i = 0; i < 15; i++) s.undo();
  const u = ev.filter(e => e[0] === 'undo').pop()[1];
  assert.ok(u.atStart && u.fromSolved && u.undoRun === 15 && u.solvedLen === 15);
  assert.strictEqual(s.state(), 'AAAA');
});

test('Session：走錯一步（最小盤放錯柱）距離不變，之後照最短路解完', () => {
  const ev = [];
  const s = new H.Session({ n: 4, emit: (t, d) => ev.push([t, d]) });
  // n = 4、目標 C：正確第一步是盤 1 → B；放到 C 距離仍是 15
  s.tryMove(0, 2, 'hand');
  assert.strictEqual(s.dist(), 15);
  H.pathToPerfect(s.pos, 4, 2).forEach(m => s.tryMove(m.from, m.to, 'hand'));
  const sv = ev.filter(e => e[0] === 'solved').pop()[1];
  assert.ok(sv.moves === 16 && sv.tail.len === 15 && sv.tail.startDist === 15 && sv.tail.startPerfect === '');
});

test('Session：自動解（最小盤輪流）與遞迴每步相同，送出 auto', () => {
  const ev = [];
  const s = new H.Session({ n: 6, emit: (t, d) => ev.push([t, d]) });
  s.alg = 'iter';
  for (let i = 0; i < 63; i++) s.autoStep(i === 0);
  const a = ev.filter(e => e[0] === 'auto').pop()[1];
  assert.ok(a.same && a.alg === 'iter' && a.stepMoves === 63 && a.from === 'A' && a.target === 'C');
  assert.ok(s.solved());
});

test('Session：親手移動會讓進行中的自動解失效；打亂後的狀態不是完美狀態', () => {
  const s = new H.Session({ n: 5, rng: H.rng(7) });
  s.autoStep(true);
  assert.ok(s.autoReady());
  s.tryMove(0, 1, 'hand');
  assert.ok(!s.autoReady());
  for (let i = 0; i < 50; i++) { s.shuffle(); assert.strictEqual(H.perfectPeg(s.pos, 5), -1); assert.strictEqual(s.seg.startKind, 'shuffled'); }
});

test('Session：自訂目標用 BFS 距離；最大盤繞一次的情形 d2 < d1', () => {
  const ev = [];
  const s = new H.Session({ n: 3, emit: (t, d) => ev.push([t, d]) });
  s.pos = H.parse('AAB'); s.newSegment(null);
  s.setCustom(H.encode(H.parse('BBA'), 3));
  assert.strictEqual(s.dist(), 5);
  // 最短路：用 BFS 一步一步往距離少 1 的鄰居走
  while (s.dist() > 0) {
    const d = s.dist(), mv = H.legalMoves(s.pos, 3).find(m => { const p = s.pos.slice(); p[H.tops(p, 3)[m[0]]] = m[1]; return s.distOf(p) === d - 1; });
    s.tryMove(mv[0], mv[1], 'hand');
  }
  const sv = ev.filter(e => e[0] === 'solved').pop()[1];
  assert.ok(sv.d1 === 7 && sv.d2 === 5 && sv.tail.big === 2 && sv.tail.len === 5 && sv.goal === 'BBA');
});

test('挑戰題：第 k 步的答案與實際解相同；答案盤大致平均', () => {
  const r = H.rng(3), cnt = new Array(11).fill(0), mv = H.hanoiMoves(10, 0, 2);
  for (let i = 0; i < 5000; i++) {
    const k = H.quizK(r);
    assert.ok(k >= 1 && k <= 1023);
    const q = H.moveAt(k, 10, 0, 2), m = mv[k - 1];
    assert.ok(q.disk === m.disk && q.from === m.from && q.to === m.to);
    cnt[q.disk]++;
  }
  for (let d = 1; d <= 10; d++) assert.ok(cnt[d] > 350 && cnt[d] < 650, '盤 ' + d + ' 出現 ' + cnt[d] + ' 次');
});

test('傳說：64 個盤子每秒一步要 2^64 − 1 秒 ≈ 5.85 × 10^11 年；第一個超過宇宙年齡的是 59 個', () => {
  const t = H.legendTime(64, 1);
  assert.strictEqual(t.steps, '18446744073709551615');
  assert.ok(Math.abs(t.years / 5.845e11 - 1) < 0.001);
  const AGE = 1.38e10;
  assert.ok(H.legendTime(58, 1).years < AGE && H.legendTime(59, 1).years > AGE);
  assert.strictEqual(H.legendTime(1, 1).steps, '1');
  assert.strictEqual(H.legendTime(100, 1e9).steps, (2n ** 100n - 1n).toString());
});

console.log(`\n${passed} 項測試通過` + (process.exitCode ? '，有測試失敗' : ''));
