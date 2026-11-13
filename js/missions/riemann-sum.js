/* missions/riemann-sum.js — 黎曼和的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/riemann-sum.js 發出，都在使用者操作之後）：
 *   'riemann'：函數、區間、n、取法、檢視改變之後。
 *       { f（'sq' | 'sin' | 'sqrt' | 'exp' | 'recip' | 'semi'）, a, b, n, rule（'left' | 'right' | 'mid' | 'trap' | 'ul'）,
 *         S（這個取法的和；上和與下和時 null）, I（準確的定積分）, err（S − I）, U、L（上和、下和）, left, right, mid, trap,
 *         V（圓盤或圓台的體積；上和與下和時用外圈圓盤）, Vx（準確體積 π∫f²）, view3d（3D 開著）, chal（挑戰中） }
 *   'view3d'：打開 3D 旋轉體。{ f }
 *   'play'：「n 一直加倍」播放完。{ f, rule }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const PI = Math.PI;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const rs = function (ev) { return ev.type === 'riemann' && !ev.data.chal; };

  LabMission.register('riemann-sum', [
    {
      id: 'riemann-sum-1', level: 1,
      title: { zh: '切得更細', en: 'Thinner strips' },
      desc: { zh: '把分段數 n 調到 100 以上。', en: 'Set the number of strips n to 100 or more.' },
      check: function (ev) { return rs(ev) && ev.data.n >= 100; }
    },
    {
      id: 'riemann-sum-2', level: 2,
      title: { zh: '四個長方形就夠準', en: 'Four rectangles are enough' },
      desc: { zh: '函數 x²、區間 [0, 2]，用「中點」取法、最多 4 個長方形，讓誤差小於 0.05。', en: 'For x² on [0, 2], use the “Midpoints” method with at most 4 rectangles and get the error below 0.05.' },
      check: function (ev) {
        const d = ev.data;
        return rs(ev) && d.f === 'sq' && near(d.a, 0, 0.005) && near(d.b, 2, 0.005) && d.rule === 'mid' && d.n <= 4 && Math.abs(d.err) < 0.05;
      }
    },
    {
      id: 'riemann-sum-3', level: 3,
      title: { zh: '夾住面積', en: 'Trap the area' },
      desc: { zh: '選「上和與下和」，區間長度至少 2，讓上和減下和小於 0.1。', en: 'Choose “Upper and lower”, use an interval at least 2 long, and make the upper sum minus the lower sum less than 0.1.' },
      check: function (ev) { const d = ev.data; return rs(ev) && d.rule === 'ul' && d.b - d.a >= 2 - 1e-9 && d.U - d.L < 0.1; }
    },
    {
      id: 'riemann-sum-4', level: 4,
      title: { zh: '加倍變四分之一', en: 'Double n, a quarter of the error' },
      desc: { zh: '用「中點」或「梯形」取法，函數與區間不變，把 n 從 4 以上加倍，誤差變成原來的 1/4（3.8 到 4.2 倍之間）。', en: 'With the “Midpoints” or “Trapezoids” method and the same function and interval, double n (starting from 4 or more) and see the error shrink by a factor between 3.8 and 4.2.' },
      check: function (ev, mem) {
        if (!rs(ev)) return false;
        const d = ev.data;
        if (d.rule !== 'mid' && d.rule !== 'trap') return false;
        const key = d.f + '|' + d.a + '|' + d.b + '|' + d.rule;
        if (mem.key !== key) { mem.key = key; mem.errs = {}; }
        mem.errs[d.n] = d.err;
        const ratio = function (big, small) { return big != null && small != null && Math.abs(small) > 1e-12 && Math.abs(big / small) >= 3.8 && Math.abs(big / small) <= 4.2; };
        return (d.n % 2 === 0 && d.n / 2 >= 4 && ratio(mem.errs[d.n / 2], d.err)) || (d.n >= 4 && ratio(d.err, mem.errs[d.n * 2]));
      }
    },
    {
      id: 'riemann-sum-5', level: 3,
      title: { zh: '負的面積', en: 'A negative area' },
      desc: { zh: '選 sin x，調整區間讓定積分等於 −2（差不到 0.005）。', en: 'Choose sin x and adjust the interval so that the integral is −2 (within 0.005).' },
      check: function (ev) { return rs(ev) && ev.data.f === 'sin' && near(ev.data.I, -2, 0.005); }
    },
    {
      id: 'riemann-sum-6', level: 4,
      title: { zh: '面積剛好是 1', en: 'An area of exactly 1' },
      desc: { zh: '選 1/x、左端 a = 1，找出右端 b，讓曲線下的面積等於 1（差不到 0.002）。', en: 'Choose 1/x with a = 1 and find b so that the area under the curve is 1 (within 0.002).' },
      check: function (ev) { const d = ev.data; return rs(ev) && d.f === 'recip' && near(d.a, 1, 0.005) && near(d.I, 1, 0.002); }
    },
    {
      id: 'riemann-sum-7', level: 5,
      title: { zh: '用長條算 π', en: 'π from strips' },
      desc: { zh: '選半圓 √(4 − x²)、區間 [−2, 2]（面積是 2π），挑一種取法讓近似值和 2π 差不到 0.001。', en: 'Choose the semicircle √(4 − x²) on [−2, 2] (area 2π) and pick a method that gets within 0.001 of 2π.' },
      check: function (ev) { const d = ev.data; return rs(ev) && d.f === 'semi' && near(d.a, -2, 1e-9) && near(d.b, 2, 1e-9) && d.S != null && near(d.S, 2 * PI, 0.001); }
    },
    {
      id: 'riemann-sum-8', level: 2,
      title: { zh: '轉成立體', en: 'Spin it into a solid' },
      desc: { zh: '按「3D 旋轉體」，看曲線繞 x 軸轉出來的立體。', en: 'Press “3D solid” and look at the solid made by spinning the curve around the x-axis.' },
      check: function (ev) { return ev.type === 'view3d'; }
    },
    {
      id: 'riemann-sum-9', level: 4,
      title: { zh: '用圓盤疊出一顆球', en: 'A ball made of discs' },
      desc: { zh: '在 3D 旋轉體裡選半圓、區間 [−2, 2]，讓圓盤的總體積和球的體積 32π/3 差不到 0.05。', en: 'In the 3D view choose the semicircle on [−2, 2] and get the total volume of the discs within 0.05 of the ball’s volume 32π/3.' },
      check: function (ev) { const d = ev.data; return rs(ev) && d.view3d && d.f === 'semi' && near(d.a, -2, 1e-9) && near(d.b, 2, 1e-9) && near(d.V, 32 * PI / 3, 0.05); }
    },
    {
      id: 'riemann-sum-10', level: 6,
      title: { zh: '眼睛估面積', en: 'Estimate by eye' },
      desc: { zh: '在挑戰裡答對一題：只靠數方格，把面積調到目標。', en: 'Get one challenge right: reach the target area just by counting squares.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'riemann-sum-11', level: 8,
      title: { zh: '面積高手', en: 'Area expert' },
      desc: { zh: '連續答對三題挑戰，三題合計 120 秒以內。', en: 'Get three challenges right in a row, in 120 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 120; }
    },
    {
      id: 'riemann-sum-h1', level: 5, hidden: true,
      riddle: { zh: '從左邊量、從右邊量，幾塊歪歪的板子就量得分毫不差。', en: 'Measured from the left, measured from the right: a few crooked planks, and not a hair out.' },
      check: function (ev) {
        const d = ev.data;
        return rs(ev) && d.f === 'sin' && (d.rule === 'left' || d.rule === 'right') && d.n >= 2 && d.n <= 10 && d.b - d.a >= 1 &&
          Math.abs(d.left - d.right) <= 1e-3 && Math.abs(d.err) <= 1e-3;
      }
    },
    {
      id: 'riemann-sum-h2', level: 5, hidden: true,
      riddle: { zh: '長短不同的兩塊地，收成一樣多。', en: 'Two fields of different lengths, and the same harvest from each.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!rs(ev) || d.f !== 'recip' || !(d.I >= 0.3)) return false;
        mem.seen = mem.seen || [];
        const hit = mem.seen.some(function (p) { return Math.abs(p.I - d.I) <= 0.002 && Math.abs(p.a - d.a) >= 0.5 && Math.abs((p.b - p.a) - (d.b - d.a)) >= 0.5; });
        if (!mem.seen.some(function (p) { return p.a === d.a && p.b === d.b; })) { mem.seen.push({ a: d.a, b: d.b, I: d.I }); if (mem.seen.length > 400) mem.seen.shift(); }
        return hit;
      }
    }
  ]);
})();
