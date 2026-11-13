/* missions/quadratic-function.js — 二次函數：頂點、判別式與配方的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/quadratic-function.js 發出，都在使用者操作之後）：
 *   'graph'：圖形模式的設定改變。{ a, b, c, h, k（頂點）, D（判別式）, roots（實根，由小到大）, dom（沒有限制定義域時是 null；否則 { p, q（左右端）, max, min, vertexIn }）, chal（是否在挑戰中） }
 *   'line'：拋物線與直線模式的設定改變。{ a, b, c, h, k, m, n（直線 y = m x + n）, D（聯立後的判別式）, xs（交點的 x，由小到大） }
 *   'square'：配方模式的設定改變。{ p, q（x² + p x = q）, x（正方形的邊）, step（1 到 4）, root（正根） }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, w, tol) { return Math.abs(v - w) <= (tol == null ? 1e-6 : tol); };
  const zero = function (D) { return Math.abs(D) < 1e-9; };

  LabMission.register('quadratic-function', [
    {
      id: 'quadratic-function-1', level: 1,
      title: { zh: '頂點搬家', en: 'Move the vertex' },
      desc: { zh: '把頂點移到 (2, −3)。', en: 'Move the vertex to (2, −3).' },
      check: function (ev) { const d = ev.data; return ev.type === 'graph' && near(d.h, 2) && near(d.k, -3); }
    },
    {
      id: 'quadratic-function-2', level: 2,
      title: { zh: '輕輕碰一下', en: 'Just a touch' },
      desc: { zh: '讓圖形剛好碰到 x 軸（D = 0），而且頂點不在原點。', en: 'Make the graph just touch the x-axis (D = 0), with the vertex away from the origin.' },
      check: function (ev) { const d = ev.data; return ev.type === 'graph' && zero(d.D) && !near(d.h, 0); }
    },
    {
      id: 'quadratic-function-3', level: 2,
      title: { zh: '永遠是正的', en: 'Always positive' },
      desc: { zh: '讓 f(x) 對每一個 x 都大於 0，而且 b ≠ 0。', en: 'Make f(x) > 0 for every x, with b ≠ 0.' },
      check: function (ev) { const d = ev.data; return ev.type === 'graph' && d.a > 0 && d.D < 0 && !zero(d.D) && !near(d.b, 0); }
    },
    {
      id: 'quadratic-function-4', level: 3,
      title: { zh: '倒過來的山，兩根都正', en: 'Upside down, both roots positive' },
      desc: { zh: '開口向下，而且兩個實根都是正數。', en: 'Open downward with two real roots, both positive.' },
      check: function (ev) { const d = ev.data; return ev.type === 'graph' && d.a < 0 && d.roots.length === 2 && d.roots[0] > 1e-9; }
    },
    {
      id: 'quadratic-function-5', level: 4,
      title: { zh: '指定的根與截距', en: 'Given roots and intercept' },
      desc: { zh: '讓兩個根是 −2 和 3，而且圖形經過 (0, 12)。', en: 'Make the roots −2 and 3, with the graph passing through (0, 12).' },
      check: function (ev) { const d = ev.data; return ev.type === 'graph' && d.roots.length === 2 && near(d.roots[0], -2) && near(d.roots[1], 3) && near(d.c, 12); }
    },
    {
      id: 'quadratic-function-6', level: 5,
      title: { zh: '區間裡的高與低', en: 'High and low on an interval' },
      desc: { zh: '限制定義域，讓 f(x) 在 [p, q] 上的最大值是 5、最小值是 −4。', en: 'Restrict the domain so that on [p, q] the maximum of f(x) is 5 and the minimum is −4.' },
      check: function (ev) { const d = ev.data; return ev.type === 'graph' && d.dom && near(d.dom.max, 5) && near(d.dom.min, -4); }
    },
    {
      id: 'quadratic-function-7', level: 2,
      title: { zh: '補上九塊', en: 'Fill in nine' },
      desc: { zh: '在「配方」模式做到第 4 步，補上的角落面積剛好是 9。', en: 'In “Completing the square”, reach step 4 with a missing corner of area exactly 9.' },
      check: function (ev) { const d = ev.data; return ev.type === 'square' && d.step === 4 && near(d.p, 6); }
    },
    {
      id: 'quadratic-function-8', level: 4,
      title: { zh: '一千兩百年前的題目', en: 'A problem from twelve centuries ago' },
      desc: { zh: '用配方解 x² + 10x = 39：做到第 4 步，讓正方形的邊 x 剛好是答案。', en: 'Solve x² + 10x = 39 by completing the square: reach step 4 and set the side x to the answer.' },
      check: function (ev) { const d = ev.data; return ev.type === 'square' && d.step === 4 && near(d.p, 10) && near(d.q, 39) && near(d.x, 3); }
    },
    {
      id: 'quadratic-function-9', level: 3,
      title: { zh: '斜斜地切過', en: 'A slanted tangent' },
      desc: { zh: '讓一條不水平的直線和拋物線相切。', en: 'Make a line that is not horizontal tangent to the parabola.' },
      check: function (ev) { const d = ev.data; return ev.type === 'line' && zero(d.D) && !near(d.m, 0); }
    },
    {
      id: 'quadratic-function-10', level: 4,
      title: { zh: '指定的交點', en: 'Given intersections' },
      desc: { zh: '讓直線和拋物線交在 x = −1 和 x = 2 兩點。', en: 'Make the line meet the parabola at x = −1 and x = 2.' },
      check: function (ev) { const d = ev.data; return ev.type === 'line' && d.xs.length === 2 && near(d.xs[0], -1) && near(d.xs[1], 2); }
    },
    {
      id: 'quadratic-function-11', level: 4,
      title: { zh: '看圖寫式子', en: 'Read the graph' },
      desc: { zh: '按「出一題」，讓你的圖形和虛線重合並送出。', en: 'Press “New challenge”, make your graph lie on the dashed one and submit.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'quadratic-function-12', level: 7,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰，三題合計 90 秒以內。', en: 'Answer three challenges in a row correctly, in 90 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 90; }
    },
    {
      id: 'quadratic-function-h1', level: 4, hidden: true,
      riddle: { zh: '切掉一個正方形，剩下的和原來長得一樣。', en: 'Cut off a square, and what is left looks just like what you started with.' },
      check: function (ev) { const d = ev.data; return ev.type === 'square' && near(d.p, 1) && near(d.q, 1) && Math.abs(d.x - d.root) < 0.001; }
    },
    {
      id: 'quadratic-function-h2', level: 3, hidden: true,
      riddle: { zh: '山頂上，地是平的。', en: 'At the summit, the ground is level.' },
      check: function (ev) { const d = ev.data; return ev.type === 'line' && d.a < 0 && near(d.m, 0) && zero(d.D) && near(d.n, d.k); }
    },
    {
      id: 'quadratic-function-h3', level: 4, hidden: true,
      riddle: { zh: '三個點，三條邊一樣長。', en: 'Three points, three equal sides.' },
      check: function (ev) { const d = ev.data; return ev.type === 'graph' && d.roots.length === 2 && near(d.a * d.k, -3); }
    }
  ]);
})();
