/* missions/linear-programming.js — 線性規劃的任務（星星數 = 等級 1–10；隱藏任務 × 2）
 * 事件（js/linear-programming.js 發出，都在使用者操作之後）：
 *   'setup'：限制式、目標函數、求最大／最小、x ≥ 0 改了之後（放開滑桿、打完數字、拖完、按鍵、按鈕、載入例題 src = 'preset'）。
 *            { src, cons[4]（a, b, c, s, on）, nOn, nonneg, p, q, sense, status（'empty' | 'unbounded' | 'unique' | 'edge' | 'all'）, z, x, y, nBest, best,
 *              maxStatus, minStatus, empty, bounded, degenerate, nVerts, area, verts, intStatus, intZ, intN, intBest, nLat, latB, latI, latticeVerts, tight }
 *   'level'：等高線 z = k 放好之後。{ src（'slider' | 'drag' | 'key' | 'sweep'）, k, rel（'miss' | 'touch' | 'cross'）, sense, status, zOpt, atOpt, chal }
 *   'try'：點 P 移動之後或按「記下 P」。{ src, x, y, feasible, z, onVertex, isOpt, isIntOpt, gap（實數最佳值與整數最佳值的差）, status, intStatus, chal }
 *   'sweep'：掃描結束。{ status, z, sense }
 *   'guess'：挑戰送出答案。{ correct, streak, secs, last5（連續 5 題以上時最近 5 題的總秒數） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const own = function (ev) { return ev.type === 'setup' && ev.data.src !== 'preset'; };
  const consKey = function (d) { return JSON.stringify([d.cons.filter(function (c) { return c.on; }).map(function (c) { return [c.a, c.b, c.c, c.s]; }), d.nonneg, d.sense]); };
  const isInt = function (v) { return Math.abs(v - Math.round(v)) < 1e-9; };
  const dist = function (u, v) { return Math.hypot(u[0] - v[0], u[1] - v[1]); };

  LabMission.register('linear-programming', [
    {
      id: 'linear-programming-1', level: 1,
      title: { zh: '掃一遍', en: 'One sweep' },
      desc: { zh: '按「掃描」，看橘色的等高線掃過可行域，停在最後碰到的地方。', en: 'Press “Sweep” and watch the orange level line slide across the region and stop at the last place it touches.' },
      check: function (ev) { return ev.type === 'sweep'; }
    },
    {
      id: 'linear-programming-2', level: 1,
      title: { zh: '站進可行域', en: 'Step inside' },
      desc: { zh: '把點 P 移到可行域裡面（點一下平面、拖曳 P 或用方向鍵都可以），看它的 z 值。', en: 'Move the point P into the feasible region (tap the plane, drag P or use the arrow keys) and read its value of z.' },
      check: function (ev) { return ev.type === 'try' && ev.data.feasible && !ev.data.chal; }
    },
    {
      id: 'linear-programming-3', level: 2,
      title: { zh: '站上頂點', en: 'On a corner' },
      desc: { zh: '把點 P 放到可行域的一個頂點上（靠近頂點會自動吸上去）。', en: 'Put the point P on a corner of the feasible region (it snaps on when you get close).' },
      check: function (ev) { return ev.type === 'try' && ev.data.onVertex && ev.data.feasible && !ev.data.chal; }
    },
    {
      id: 'linear-programming-4', level: 3,
      title: { zh: '最後一刻', en: 'The last touch' },
      desc: { zh: '求最大值時，自己把等高線 z = k 推到剛好要離開可行域的位置：它只碰到最佳頂點（不能用「掃描」）。', en: 'When maximising, move the level line z = k yourself to where it is just about to leave the region, touching only the best corner (not with “Sweep”).' },
      check: function (ev) { const d = ev.data; return ev.type === 'level' && d.src !== 'sweep' && !d.chal && d.sense === 'max' && d.status === 'unique' && d.atOpt; }
    },
    {
      id: 'linear-programming-5', level: 3,
      title: { zh: '換一個冠軍', en: 'A new winner' },
      desc: { zh: '限制式不動，只改目標函數的 p、q，讓唯一的最佳頂點換到另一個頂點。', en: 'Keep the constraints and change only p and q of the objective, so that the single best corner moves to a different corner.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'setup') return false;
        const k = consKey(d);
        if (mem.key !== k) { mem.key = k; mem.v = null; mem.pq = null; }
        if (d.status !== 'unique') return false;
        const v = [d.x, d.y], pq = d.p + '|' + d.q;
        if (mem.v && dist(mem.v, v) > 1e-9 && mem.pq !== pq && d.src !== 'preset') return true;
        mem.v = v; mem.pq = pq;
        return false;
      }
    },
    {
      id: 'linear-programming-6', level: 4,
      title: { zh: '整條邊都一樣好', en: 'A whole edge of winners' },
      desc: { zh: '在有界的可行域上，調出最佳解有無限多組的情形：等高線和某一條邊平行。', en: 'On a bounded region, make the best solutions infinitely many: the level lines run parallel to an edge.' },
      check: function (ev) { const d = ev.data; return own(ev) && d.status === 'edge' && d.bounded && d.area > 1e-6; }
    },
    {
      id: 'linear-programming-7', level: 4,
      title: { zh: '沒有最大值', en: 'No maximum' },
      desc: { zh: '做出一個求最大值時「沒有最大值」的題目：可行域無界，z 可以一直變大。', en: 'Set up a problem with no maximum: the region is unbounded and z can grow for ever.' },
      check: function (ev) { const d = ev.data; return own(ev) && d.sense === 'max' && d.status === 'unbounded'; }
    },
    {
      id: 'linear-programming-8', level: 4,
      title: { zh: '不可能的任務', en: 'Mission impossible' },
      desc: { zh: '用至少兩條限制式做出沒有可行解的情形：可行域是空的。', en: 'Using at least two constraints, make the feasible region empty.' },
      check: function (ev) { const d = ev.data; return own(ev) && d.empty && d.nOn >= 2; }
    },
    {
      id: 'linear-programming-9', level: 5,
      title: { zh: '最省的配方', en: 'The cheapest mix' },
      desc: { zh: '求最小值時，自己把等高線推到剛好只碰到最佳頂點（最小值不是 0，不能用「掃描」）。可以試試「最省飼料」。', en: 'When minimising, move the level line yourself until it touches only the best corner (the minimum is not 0; not with “Sweep”). Try “Cheapest feed”.' },
      check: function (ev) { const d = ev.data; return ev.type === 'level' && d.src !== 'sweep' && !d.chal && d.sense === 'min' && d.status === 'unique' && d.atOpt && Math.abs(d.zOpt) > 1e-9; }
    },
    {
      id: 'linear-programming-10', level: 6,
      title: { zh: '四捨五入的陷阱', en: 'The rounding trap' },
      desc: { zh: '找一個最好的整數解比最佳頂點還差的題目（例如「工廠生產」），把 P 放到最好的整數解上。', en: 'In a problem where the best integer solution is worse than the best corner (such as “Factory”), put P on the best integer solution.' },
      check: function (ev) { const d = ev.data; return ev.type === 'try' && !d.chal && d.isIntOpt && d.gap > 1e-6; }
    },
    {
      id: 'linear-programming-11', level: 7,
      title: { zh: '三連勝', en: 'Three in a row' },
      desc: { zh: '在挑戰「找出最佳頂點」連續答對三題（中間不可放棄或換題）。', en: 'In the challenge “Find the best corner”, answer three in a row correctly (no giving up or skipping).' },
      check: function (ev) { return ev.type === 'guess' && ev.data.correct && ev.data.streak >= 3; }
    },
    {
      id: 'linear-programming-12', level: 9,
      title: { zh: '快手', en: 'Quick hands' },
      desc: { zh: '挑戰連續答對五題，而且這五題加起來不超過 75 秒。', en: 'Answer five challenge problems in a row correctly, taking 75 seconds or less for the five together.' },
      check: function (ev) { const d = ev.data; return ev.type === 'guess' && d.correct && d.streak >= 5 && isFinite(d.last5) && d.last5 <= 75; }
    },
    {
      // 可行域只剩一個點，而且兩個坐標都不是整數：限制式剛好卡住一個不在格子上的點
      id: 'linear-programming-h1', level: 4, hidden: true,
      riddle: { zh: '所有的路都收成一個點，而那個點不肯站在任何一條格線上。', en: 'Every road shrinks to a single point, and that point refuses to stand on any grid line.' },
      check: function (ev) {
        const d = ev.data;
        if (!own(ev) || d.empty || !d.degenerate || d.nVerts !== 1 || !d.nonneg) return false;
        const v = d.verts[0];
        return v[0] > 1e-9 && v[1] > 1e-9 && !isInt(v[0]) && !isInt(v[1]);
      }
    },
    {
      // 可行域是一條斜的線段（面積 0）：≤ 和 ≥ 夾住同一條直線，線段長至少 5
      id: 'linear-programming-h2', level: 5, hidden: true,
      riddle: { zh: '一條沒有寬度的路，斜斜地走了很長一段。', en: 'A road with no width at all, running at a slant for a long way.' },
      check: function (ev) {
        const d = ev.data;
        if (!own(ev) || d.empty || !d.degenerate || d.nVerts !== 2) return false;
        const u = d.verts[0], v = d.verts[1];
        return Math.abs(u[0] - v[0]) > 1e-9 && Math.abs(u[1] - v[1]) > 1e-9 && dist(u, v) >= 5 - 1e-9;
      }
    },
    {
      // 可行域無界（像飼料題那樣往右上無限延伸，邊界有三道以上的坡），求 z = px + qy（p、q 都是負的）的最大值卻唯一存在：
      // 「求成本的最小值」換成「求負成本的最大值」，無界不等於沒有最佳解
      id: 'linear-programming-h3', level: 5, hidden: true,
      riddle: { zh: '草原一直延伸到天邊，邊上有三道坡；回頭走，山頂卻只有一個。', en: 'The meadow runs on to the horizon behind three slopes; turn back, and there is only one summit.' },
      check: function (ev) {
        const d = ev.data;
        return own(ev) && d.sense === 'max' && d.nonneg && d.p < 0 && d.q < 0 && !d.empty && !d.bounded && d.nVerts >= 4 && d.status === 'unique' && d.x > 1e-9 && d.y > 1e-9;
      }
    },
    {
      // 可行域是平行四邊形，最大值和最小值都在整條邊上：等高線和一組對邊平行
      id: 'linear-programming-h4', level: 6, hidden: true,
      riddle: { zh: '上面一條平頂、下面一條平底，一樣長；尺子靠上去，兩邊都貼得密不透風。', en: 'Flat on top and flat at the bottom, both the same length: lay the ruler on either and not a crack of light shows.' },
      check: function (ev) {
        const d = ev.data;
        if (!own(ev) || !d.nonneg || !d.bounded || !(d.area > 1e-6) || d.nVerts !== 4 || d.maxStatus !== 'edge' || d.minStatus !== 'edge') return false;
        const v = d.verts;
        return Math.abs(dist(v[0], v[1]) - dist(v[2], v[3])) < 1e-6 && Math.abs(dist(v[1], v[2]) - dist(v[3], v[0])) < 1e-6;
      }
    },
    {
      // 皮克定理 A = I + B／2 − 1：三角形的頂點都是格子點、內部沒有格子點（I = 0）、面積至少 3
      id: 'linear-programming-h5', level: 6, hidden: true,
      riddle: { zh: '三面牆上站滿了格子點，屋子裡一個人也沒有，屋子卻不小。', en: 'Lattice points crowd along three walls; nobody is inside the house, and yet the house is not small.' },
      check: function (ev) { const d = ev.data; return own(ev) && d.bounded && !d.degenerate && d.nVerts === 3 && d.latticeVerts && d.latI === 0 && d.area >= 3 - 1e-9; }
    },
    {
      // 計程車幾何的圓 |x| + |y| ≤ r：不要求 x、y ≥ 0，四條限制式圍出以原點為中心、頂點在四個軸上的正方形
      id: 'linear-programming-h6', level: 7, hidden: true,
      riddle: { zh: '計程車司機眼中的圓。', en: 'A circle, as a taxi driver sees it.' },
      check: function (ev) {
        const d = ev.data;
        if (!own(ev) || d.nonneg || !d.bounded || d.nVerts !== 4) return false;
        const r = Math.abs(d.verts[0][0]) + Math.abs(d.verts[0][1]);
        if (r < 1) return false;
        const want = [[r, 0], [0, r], [-r, 0], [0, -r]];
        return want.every(function (w) { return d.verts.some(function (v) { return dist(v, w) < 1e-6; }); });
      }
    },
    {
      // 退化的最佳頂點：唯一的最佳頂點（不在坐標軸上）有四條不同的限制線通過
      id: 'linear-programming-h7', level: 8, hidden: true,
      riddle: { zh: '四條路在同一個路口相會，最好的地方就在那裡。', en: 'Four roads meet at one crossing, and the best place is right there.' },
      check: function (ev) { const d = ev.data; return own(ev) && d.status === 'unique' && d.tight >= 4 && d.x > 1e-9 && d.y > 1e-9; }
    },
    {
      // 正三角形的可行域：要用斜率 ±√3 的直線（係數打到小數第 3 位，例如 1.732）
      id: 'linear-programming-h8', level: 8, hidden: true,
      riddle: { zh: '三面牆一樣長，圍出來的地沒有一個角吃虧。', en: 'Three walls of the same length, and not one corner gets the short end.' },
      check: function (ev) {
        const d = ev.data;
        if (!own(ev) || !d.bounded || d.degenerate || d.nVerts !== 3 || !(d.area > 0.5)) return false;
        const v = d.verts, s = [dist(v[0], v[1]), dist(v[1], v[2]), dist(v[2], v[0])];
        return Math.max.apply(null, s) / Math.min.apply(null, s) <= 1.003;
      }
    },
    {
      // 實數的最佳解只有一個頂點，最好的整數解卻有六個以上一樣好（排成一列，都在同一條等高線上）
      id: 'linear-programming-h9', level: 9, hidden: true,
      riddle: { zh: '真正的山頂只有一個，可是能站人的地方，最好的排成了一整列，至少六處。', en: 'The true summit is a single point, but the best places where one can actually stand form a whole row, six of them at least.' },
      check: function (ev) { const d = ev.data; return own(ev) && d.status === 'unique' && d.intStatus === 'ok' && d.intN >= 6; }
    },
    {
      // 四捨五入的陷阱：最佳頂點不是格子點，唯一的整數最佳解離它至少 5 單位（又細又長的可行域）
      id: 'linear-programming-h10', level: 10, hidden: true,
      riddle: { zh: '一根又細又長的針，把針尖四捨五入，離真正能站的地方還有好幾步路。', en: 'A long thin needle: round off its tip, and the place where you can really stand is still several steps away.' },
      check: function (ev) {
        const d = ev.data;
        if (!own(ev) || !d.nonneg || d.status !== 'unique' || d.intStatus !== 'ok' || d.intN !== 1) return false;
        if (isInt(d.x) && isInt(d.y)) return false;
        return dist(d.intBest[0], [d.x, d.y]) >= 5;
      }
    }
  ]);
})();
