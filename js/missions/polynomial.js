/* missions/polynomial.js — 多項式函數的圖形的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/polynomial.js 發出，都在使用者操作之後）：
 *   'roots'：根與圖形模式的設定改變。{ deg（次數）, a, roots（合併後的實根 [{x, m}]，由小到大）, nReal（相異實根個數）, quad（有沒有乘上沒有實根的二次因式）,
 *            op（'>'、'>='、'<'、'<='）, sol（不等式解集合的比對字串，例如 "(-2,3)"）, maxMul（最大重數）, chal（是否在挑戰中） }
 *   'ivt'：勘根模式的區間或函數改變。{ fn, l, r, fl, fr, inside（(l, r) 裡的實根個數） }
 *   'bisect'：按一次「二分一次」。{ fn, l, r, width, exact（中點剛好是根）, steps }
 *   'trans'：平移伸縮模式的設定改變。{ base（'cube'、'cubic'、'quart'）, a, b, h, k }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const EPS = 1e-9;
  const has = function (d, m) { return d.roots.some(function (r) { return r.m === m; }); };

  LabMission.register('polynomial', [
    {
      id: 'polynomial-1', level: 1,
      title: { zh: '穿過三次', en: 'Three crossings' },
      desc: { zh: '做出一個三次函數，圖形和 x 軸有三個不同的交點。', en: 'Make a cubic whose graph crosses the x-axis at three different points.' },
      check: function (ev) { const d = ev.data; return ev.type === 'roots' && d.deg === 3 && d.nReal === 3; }
    },
    {
      id: 'polynomial-2', level: 2,
      title: { zh: '碰一下就回頭', en: 'Touch and turn back' },
      desc: { zh: '做出一個二重根：圖形碰到 x 軸卻不穿過。', en: 'Make a double root: the graph touches the x-axis without crossing it.' },
      check: function (ev) { return ev.type === 'roots' && has(ev.data, 2); }
    },
    {
      id: 'polynomial-3', level: 3,
      title: { zh: '壓平了再穿過', en: 'Flatten, then cross' },
      desc: { zh: '做出一個三重根：圖形在那裡變得很平，然後穿過 x 軸。', en: 'Make a triple root: the graph flattens out there and then crosses the x-axis.' },
      check: function (ev) { return ev.type === 'roots' && has(ev.data, 3); }
    },
    {
      id: 'polynomial-4', level: 3,
      title: { zh: '兩端都朝下', en: 'Both ends down' },
      desc: { zh: '做出一個四次以上的多項式，讓圖形的左右兩端都往下。', en: 'Make a polynomial of degree 4 or more whose graph goes down at both ends.' },
      check: function (ev) { const d = ev.data; return ev.type === 'roots' && d.deg >= 4 && d.deg % 2 === 0 && d.a < 0; }
    },
    {
      id: 'polynomial-5', level: 4,
      title: { zh: '四次卻只碰一點', en: 'Degree four, one point' },
      desc: { zh: '做出一個四次函數，圖形和 x 軸只有一個交點。', en: 'Make a quartic whose graph meets the x-axis at only one point.' },
      check: function (ev) { const d = ev.data; return ev.type === 'roots' && d.deg === 4 && d.nReal === 1; }
    },
    {
      id: 'polynomial-6', level: 4,
      title: { zh: '指定的解', en: 'A given solution set' },
      desc: { zh: '用三次以上的多項式，讓 f(x) < 0 的解剛好是 −2 < x < 3。', en: 'With a polynomial of degree 3 or more, make the solution of f(x) < 0 exactly −2 < x < 3.' },
      check: function (ev) { const d = ev.data; return ev.type === 'roots' && d.deg >= 3 && d.op === '<' && d.sol === '(-2,3)'; }
    },
    {
      id: 'polynomial-7', level: 2,
      title: { zh: '夾住一個根', en: 'Trap a root' },
      desc: { zh: '在「勘根定理」模式，把區間移到 f(l) 和 f(r) 異號的地方。', en: 'In “Trapping a root” mode, move the interval so that f(l) and f(r) have opposite signs.' },
      check: function (ev) { const d = ev.data; return ev.type === 'ivt' && d.fl * d.fr < 0; }
    },
    {
      id: 'polynomial-8', level: 4,
      title: { zh: '縮到 0.01', en: 'Down to 0.01' },
      desc: { zh: '用「二分一次」把夾住根的區間縮到寬度 0.01 以下。', en: 'Use “Halve once” to shrink the interval around a root to a width of 0.01 or less.' },
      check: function (ev) { return ev.type === 'bisect' && ev.data.width <= 0.01 + EPS; }
    },
    {
      id: 'polynomial-9', level: 5,
      title: { zh: '同號也有根', en: 'Same sign, still roots' },
      desc: { zh: '找一個區間：f(l) 和 f(r) 同號，裡面卻有兩個以上的根。', en: 'Find an interval where f(l) and f(r) have the same sign but at least two roots lie inside.' },
      check: function (ev) { const d = ev.data; return ev.type === 'ivt' && d.fl * d.fr > 0 && d.inside >= 2; }
    },
    {
      id: 'polynomial-10', level: 3,
      title: { zh: '搬家的中心', en: 'Moving the centre' },
      desc: { zh: '在「平移與伸縮」模式，用三次函數把對稱中心搬到 (2, −1)。', en: 'In “Shift and stretch” mode, move the centre of a cubic to (2, −1).' },
      check: function (ev) { const d = ev.data; return ev.type === 'trans' && (d.base === 'cube' || d.base === 'cubic') && Math.abs(d.h - 2) < EPS && Math.abs(d.k + 1) < EPS; }
    },
    {
      id: 'polynomial-11', level: 4,
      title: { zh: '看圖寫式子', en: 'Read the graph' },
      desc: { zh: '按「出一題」，調出和虛線一樣的多項式並送出。', en: 'Press “New challenge”, build the polynomial of the dashed graph and submit it.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'polynomial-12', level: 7,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰，三題合計 150 秒以內。', en: 'Answer three challenges in a row correctly, in 150 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 150; }
    },
    {
      id: 'polynomial-h1', level: 4, hidden: true,
      riddle: { zh: '擠的人越多，那裡越平坦。', en: 'The more who crowd in, the flatter it gets.' },
      check: function (ev) { return ev.type === 'roots' && ev.data.maxMul >= 4; }
    },
    {
      id: 'polynomial-h2', level: 4, hidden: true,
      riddle: { zh: '一刀切下去，剛好就是它。', en: 'One cut, and that was it.' },
      check: function (ev) { return ev.type === 'bisect' && ev.data.exact === true; }
    }
  ]);
})();
