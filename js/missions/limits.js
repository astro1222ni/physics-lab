/* missions/limits.js — 數列與函數的極限的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/limits.js 發出，都在使用者操作之後）：
 *   'seq'：數列模式的設定改變。{ seq（數列代號）, eps, N（學生放的 N）, Nmin（最小的 N，發散時 null）, conv（收斂？） }
 *   'func'：函數模式的設定改變。{ fn, eps, delta, dmax（最大的 δ，沒有極限時 null）, ok（δ 可以用？）, zoom（放大倍率）, squeeze（顯示夾擠的兩條線？） }
 *   'approach'：按「從左邊／右邊逼近」播完。{ fn, side（'left' 或 'right'） }
 *   'series'：級數模式的設定改變。{ a, r, n, Sn, Sinf（|r| < 1 時的和，否則 null） }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const EPS = 1e-9;
  const exactN = function (d) { return d.conv && d.Nmin != null && d.N === d.Nmin; };

  LabMission.register('limits', [
    {
      id: 'limits-1', level: 1,
      title: { zh: '帶子變窄', en: 'A narrower band' },
      desc: { zh: '選一個會收斂的數列，把 ε 調到 0.1 以下，看帶子變窄。', en: 'Pick a convergent sequence and turn ε down to 0.1 or less to narrow the band.' },
      check: function (ev) { return ev.type === 'seq' && ev.data.conv && ev.data.eps <= 0.1 + EPS; }
    },
    {
      id: 'limits-2', level: 2,
      title: { zh: '第幾項以後？', en: 'From which term on?' },
      desc: { zh: '數列 1/n、ε = 0.01：把 N 放在最小的那一項，使得第 N 項以後全部待在帶子裡。', en: 'For 1/n with ε = 0.01, put N at the smallest term from which every term stays inside the band.' },
      check: function (ev) { const d = ev.data; return ev.type === 'seq' && d.seq === 'recip' && Math.abs(d.eps - 0.01) < EPS && exactN(d); }
    },
    {
      id: 'limits-3', level: 3,
      title: { zh: '忽上忽下', en: 'Up and down' },
      desc: { zh: '數列 (−1)^n / n、ε ≤ 0.05：找出最小的 N。', en: 'For (−1)^n / n with ε ≤ 0.05, find the smallest N.' },
      check: function (ev) { const d = ev.data; return ev.type === 'seq' && d.seq === 'alt' && d.eps <= 0.05 + EPS && exactN(d); }
    },
    {
      id: 'limits-4', level: 4,
      title: { zh: '慢慢靠近 e', en: 'Creeping up on e' },
      desc: { zh: '數列 (1 + 1/n)^n、ε ≤ 0.01：找出最小的 N。', en: 'For (1 + 1/n)^n with ε ≤ 0.01, find the smallest N.' },
      check: function (ev) { const d = ev.data; return ev.type === 'seq' && d.seq === 'e' && d.eps <= 0.01 + EPS && exactN(d); }
    },
    {
      id: 'limits-5', level: 2,
      title: { zh: '沒有極限', en: 'No limit' },
      desc: { zh: '選一個發散的數列，ε 小於 1 時試試看：帶子放在哪裡都關不住它。', en: 'Pick a divergent sequence and, with ε below 1, see that no band can hold it.' },
      check: function (ev) { return ev.type === 'seq' && ev.data.conv === false && ev.data.eps < 1; }
    },
    {
      id: 'limits-6', level: 4,
      title: { zh: '最大的 δ', en: 'The largest δ' },
      desc: { zh: '函數 (x² − 1)/(x − 1)、ε ≤ 0.1：把 δ 調到可以用的最大值（差 3% 以內）。', en: 'For (x² − 1)/(x − 1) with ε ≤ 0.1, set δ to the largest value that works (within 3%).' },
      check: function (ev) { const d = ev.data; return ev.type === 'func' && d.fn === 'hole' && d.eps <= 0.1 + EPS && d.ok && d.delta >= 0.97 * d.dmax; }
    },
    {
      id: 'limits-7', level: 6,
      title: { zh: 'sin x / x 的 δ', en: 'δ for sin x / x' },
      desc: { zh: '函數 sin x / x、ε ≤ 0.01：把 δ 調到可以用的最大值（差 3% 以內）。', en: 'For sin x / x with ε ≤ 0.01, set δ to the largest value that works (within 3%).' },
      check: function (ev) { const d = ev.data; return ev.type === 'func' && d.fn === 'sinc' && d.eps <= 0.01 + EPS && d.ok && d.delta >= 0.97 * d.dmax; }
    },
    {
      id: 'limits-8', level: 3,
      title: { zh: '左右不一樣', en: 'Left is not right' },
      desc: { zh: '函數 |x| / x：從左邊和從右邊各逼近一次 0。', en: 'For |x| / x, approach 0 once from the left and once from the right.' },
      check: function (ev, mem) {
        if (ev.type !== 'approach' || ev.data.fn !== 'sign') return false;
        mem[ev.data.side] = true;
        return !!(mem.left && mem.right);
      }
    },
    {
      id: 'limits-9', level: 4,
      title: { zh: '夾住了', en: 'Squeezed' },
      desc: { zh: '函數 x sin(1/x)：顯示夾擠的兩條線，並放大 100 倍以上看它被夾到 0。', en: 'For x sin(1/x), show the two squeezing lines and zoom in at least 100 times to see it pinched to 0.' },
      check: function (ev) { const d = ev.data; return ev.type === 'func' && d.fn === 'xsin' && d.squeeze && d.zoom >= 100 - EPS; }
    },
    {
      id: 'limits-10', level: 4,
      title: { zh: '負公比湊成 1', en: 'Adding up to 1 with a negative ratio' },
      desc: { zh: '在「無窮等比級數」模式，用負的公比 r，讓級數的和剛好是 1。', en: 'In “Geometric series” mode, use a negative ratio r and make the sum exactly 1.' },
      check: function (ev) { const d = ev.data; return ev.type === 'series' && d.r < 0 && d.Sinf != null && Math.abs(d.Sinf - 1) < EPS; }
    },
    {
      id: 'limits-11', level: 4,
      title: { zh: '找 N', en: 'Find N' },
      desc: { zh: '按「出一題」，找出最小的 N 並送出。', en: 'Press “New challenge”, find the smallest N and submit it.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'limits-12', level: 7,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰，三題合計 90 秒以內。', en: 'Answer three challenges in a row correctly, in 90 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 90; }
    },
    {
      id: 'limits-h1', level: 4, hidden: true,
      riddle: { zh: '小數點後面的 9，一直排下去。', en: 'The nines after the decimal point go on and on.' },
      check: function (ev) { const d = ev.data; return ev.type === 'series' && Math.abs(d.a - 0.9) < EPS && Math.abs(d.r - 0.1) < EPS; }
    },
    {
      id: 'limits-h2', level: 5, hidden: true,
      riddle: { zh: '一千步以後，再也沒有誰跑出去。', en: 'After a thousand steps, nobody ever strays again.' },
      check: function (ev) { const d = ev.data; return ev.type === 'seq' && d.eps <= 0.001 + EPS && exactN(d) && d.Nmin >= 1000; }
    }
  ]);
})();
