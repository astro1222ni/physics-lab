/* missions/plane-vectors.js — 平面向量的線性組合與內積的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/plane-vectors.js 發出，都在使用者操作之後）：
 *   'lin'：線性組合模式的設定改變。{ a, b（整數向量 [x, y]）, x, y（P = x a + y b 的係數）, det（det(a, b)）, region（'none'、'line'、'cone'、'para'、'tri'）, inside（P 在範圍裡？）, chal（是否在挑戰中） }
 *   'dot'：內積模式的設定改變。{ a, b, dot（a · b）, det, aa（|a|²）, bb（|b|²） }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const nz = function (u) { return u[0] !== 0 || u[1] !== 0; };
  const slanted = function (u) { return u[0] !== 0 && u[1] !== 0; };
  const near = function (v, w, tol) { return Math.abs(v - w) <= tol; };

  LabMission.register('plane-vectors', [
    {
      id: 'plane-vectors-1', level: 1,
      title: { zh: '兩個 a、一個 b', en: 'Two a’s and one b' },
      desc: { zh: '把 P 放在 2a + b（x = 2、y = 1）。', en: 'Put P at 2a + b (x = 2, y = 1).' },
      check: function (ev) { const d = ev.data; return ev.type === 'lin' && d.det !== 0 && d.x === 2 && d.y === 1; }
    },
    {
      id: 'plane-vectors-2', level: 3,
      title: { zh: '跑出線段的分點', en: 'Beyond the segment' },
      desc: { zh: '標出範圍 x + y = 1，把 P 放在直線 AB 上、但在線段 AB 外面 A 的那一側之外（x < 0）。', en: 'Shade x + y = 1 and put P on the line AB but outside the segment, with x < 0.' },
      check: function (ev) { const d = ev.data; return ev.type === 'lin' && d.det !== 0 && d.region === 'line' && d.inside && d.x < 0; }
    },
    {
      id: 'plane-vectors-3', level: 2,
      title: { zh: '格子塌了', en: 'The grid collapses' },
      desc: { zh: '在「線性組合」模式，讓 a、b 平行（兩個都不是零向量）。', en: 'In “Linear combination” mode, make a and b parallel (neither of them zero).' },
      check: function (ev) { const d = ev.data; return ev.type === 'lin' && d.det === 0 && nz(d.a) && nz(d.b); }
    },
    {
      id: 'plane-vectors-4', level: 5,
      title: { zh: '三角形的重心', en: 'The centroid' },
      desc: { zh: '把 P 放在三角形 OAB 的重心（x、y 誤差 0.02 以內）。', en: 'Put P at the centroid of the triangle OAB (x and y within 0.02).' },
      check: function (ev) { const d = ev.data; return ev.type === 'lin' && d.det !== 0 && near(d.x, 1 / 3, 0.02) && near(d.y, 1 / 3, 0.02); }
    },
    {
      id: 'plane-vectors-5', level: 4,
      title: { zh: '三等分點', en: 'A point of trisection' },
      desc: { zh: '把 P 放在線段 AB 上，使得 AP : PB = 1 : 2（x、y 誤差 0.01 以內）。', en: 'Put P on the segment AB so that AP : PB = 1 : 2 (x and y within 0.01).' },
      check: function (ev) { const d = ev.data; return ev.type === 'lin' && d.det !== 0 && near(d.x, 2 / 3, 0.01) && near(d.y, 1 / 3, 0.01); }
    },
    {
      id: 'plane-vectors-6', level: 3,
      title: { zh: '斜斜地垂直', en: 'Perpendicular, at a slant' },
      desc: { zh: '在「內積」模式，讓 a · b = 0，而且 a 不在座標軸上。', en: 'In “Dot product” mode, make a · b = 0 with a not lying on an axis.' },
      check: function (ev) { const d = ev.data; return ev.type === 'dot' && d.dot === 0 && nz(d.b) && slanted(d.a); }
    },
    {
      id: 'plane-vectors-7', level: 4,
      title: { zh: '反方向的半個影子', en: 'Half a shadow, backwards' },
      desc: { zh: '讓 b 在 a 上的正射影剛好是 −a/2。', en: 'Make the projection of b on a exactly −a/2.' },
      check: function (ev) { const d = ev.data; return ev.type === 'dot' && nz(d.a) && nz(d.b) && 2 * d.dot === -d.aa; }
    },
    {
      id: 'plane-vectors-8', level: 3,
      title: { zh: '面積 10', en: 'Area 10' },
      desc: { zh: '讓 a、b 張出的平行四邊形面積剛好是 10，而且兩個向量都不在座標軸上。', en: 'Make the parallelogram spanned by a and b have area exactly 10, with neither vector on an axis.' },
      check: function (ev) { const d = ev.data; return ev.type === 'dot' && Math.abs(d.det) === 10 && slanted(d.a) && slanted(d.b); }
    },
    {
      id: 'plane-vectors-9', level: 5,
      title: { zh: '一樣長又垂直', en: 'Equal and perpendicular' },
      desc: { zh: '讓 |a| = |b| = 5、a ⊥ b，而且 a 不在座標軸上。', en: 'Make |a| = |b| = 5 and a ⊥ b, with a not on an axis.' },
      check: function (ev) { const d = ev.data; return ev.type === 'dot' && d.aa === 25 && d.bb === 25 && d.dot === 0 && slanted(d.a); }
    },
    {
      id: 'plane-vectors-10', level: 4,
      title: { zh: '走到星星', en: 'Reach the star' },
      desc: { zh: '按「出一題」，只用 x、y 把 P 移到星星上並送出。', en: 'Press “New challenge”, move P onto the star using only x and y, and submit.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'plane-vectors-11', level: 7,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰，三題合計 60 秒以內。', en: 'Answer three challenges in a row correctly, in 60 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 60; }
    },
    {
      id: 'plane-vectors-h1', level: 3, hidden: true,
      riddle: { zh: '影子和自己一樣長。', en: 'The shadow is as long as you are.' },
      check: function (ev) { const d = ev.data; return ev.type === 'dot' && d.det === 0 && nz(d.a) && nz(d.b); }
    },
    {
      id: 'plane-vectors-h2', level: 4, hidden: true,
      riddle: { zh: '兩種乘法，打成平手。', en: 'Two kinds of product, a draw.' },
      check: function (ev) { const d = ev.data; return ev.type === 'dot' && d.dot > 0 && d.dot === Math.abs(d.det); }
    }
  ]);
})();
