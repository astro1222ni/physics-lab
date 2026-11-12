/* missions/exp-log.js — 指數與對數的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/exp-log.js 發出，都在使用者操作之後）：
 *   'compound'：複利模式的設定改變。{ r（年利率，%）, n（一年複利次數）, t（年）, cont（連續複利）, A（目前的總額）, An（n 次的總額）, Ae（連續複利） }
 *   'play'：「看著錢長大」播放完畢。{ n, t, r, cont }
 *   'inverse'：指數與對數模式的設定改變。{ a, x, y（a^x）, meets（a^x 與 log_a x 的交點數）, tangent（a ≈ e^(1/e)）, ln（ln a） }
 *   'semilog'：對數尺度模式的設定改變。{ set（'bacteria' | 'decay' | 'free' | 'chal'）, C, b, rms（擬合誤差；沒有資料時 null）, chal }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null）, rms }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const E_1E = Math.exp(1 / Math.E);
  const E_ME = Math.exp(-Math.E);
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };

  LabMission.register('exp-log', [
    {
      id: 'exp-log-1', level: 1,
      title: { zh: '每天都算利息', en: 'Interest every day' },
      desc: { zh: '在「複利與 e」模式把一年複利的次數調到 365 次以上（不勾連續複利）。', en: 'In “Compound interest” mode set the number of compoundings to 365 or more a year (continuous compounding off).' },
      check: function (ev) { return ev.type === 'compound' && !ev.data.cont && ev.data.n >= 365; }
    },
    {
      id: 'exp-log-2', level: 3,
      title: { zh: '逼近 e', en: 'Closing in on e' },
      desc: { zh: '年利率 100%、存 1 年，不勾連續複利，只靠增加複利次數讓總額和 e = 2.71828… 差不到 0.0001。', en: 'With a 100 % rate for 1 year and continuous compounding off, compound often enough that the total is within 0.0001 of e = 2.71828…' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'compound' && !d.cont && near(d.r, 100, 1e-9) && near(d.t, 1, 1e-9) && near(d.An, Math.E, 1e-4);
      }
    },
    {
      id: 'exp-log-3', level: 3,
      title: { zh: '十年翻一倍', en: 'Double in ten years' },
      desc: { zh: '每年複利一次、存 10 年，找出讓錢剛好翻倍的年利率：總額和 2 差不到 0.005。', en: 'Compounding once a year for 10 years, find the rate that exactly doubles the money: a total within 0.005 of 2.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'compound' && !d.cont && d.n === 1 && near(d.t, 10, 1e-9) && near(d.An, 2, 0.005);
      }
    },
    {
      id: 'exp-log-4', level: 2,
      title: { zh: '看著錢長大', en: 'Watch it grow' },
      desc: { zh: '一年複利 12 次以下、存 5 年以上，按「看著錢長大」看完整段播放。', en: 'Compounding at most 12 times a year for 5 years or more, press “Watch it grow” and watch to the end.' },
      check: function (ev) { return ev.type === 'play' && !ev.data.cont && ev.data.n <= 12 && ev.data.t >= 5; }
    },
    {
      id: 'exp-log-5', level: 3,
      title: { zh: '2 的幾次方是 5？', en: 'Which power of 2 is 5?' },
      desc: { zh: '在「指數與對數」模式取底數 2，移動點 P，讓 2 的 x 次方等於 5（差不到 0.01）：這時 x 就是以 2 為底 5 的對數。', en: 'In “Exponentials and logs” mode use base 2 and move P until 2 to the power x equals 5 (within 0.01): then x is the logarithm of 5 to base 2.' },
      check: function (ev) { return ev.type === 'inverse' && near(ev.data.a, 2, 1e-9) && near(ev.data.y, 5, 0.01); }
    },
    {
      id: 'exp-log-6', level: 2,
      title: { zh: '自然的底數', en: 'The natural base' },
      desc: { zh: '調整底數 a，讓 y = a 的 x 次方在 (0, 1) 的切線斜率 ln a 等於 1（差不到 0.001）。', en: 'Adjust the base a so that the tangent to y = a to the power x at (0, 1) has slope ln a = 1 (within 0.001).' },
      check: function (ev) { return ev.type === 'inverse' && near(ev.data.ln, 1, 0.001); }
    },
    {
      id: 'exp-log-7', level: 4,
      title: { zh: '負次方變大', en: 'A negative power that grows' },
      desc: { zh: '底數小於 1、x 是負數，讓 a 的 x 次方等於 4（差不到 0.01）。', en: 'With a base below 1 and a negative x, make a to the power x equal 4 (within 0.01).' },
      check: function (ev) { const d = ev.data; return ev.type === 'inverse' && d.a < 1 && d.a > 0 && d.x < 0 && near(d.y, 4, 0.01); }
    },
    {
      id: 'exp-log-8', level: 6,
      title: { zh: '剛好相切', en: 'Just touching' },
      desc: { zh: '找出讓 y = a 的 x 次方與它的反函數（以 a 為底的對數曲線）剛好相切的底數 a（差不到 0.0005）。', en: 'Find the base a for which y = a to the power x and its inverse, the base-a logarithm curve, just touch (within 0.0005).' },
      check: function (ev) { return ev.type === 'inverse' && near(ev.data.a, E_1E, 0.0005); }
    },
    {
      id: 'exp-log-9', level: 3,
      title: { zh: '細菌的成長', en: 'Growing bacteria' },
      desc: { zh: '在「對數尺度」模式選「細菌培養」，調整 C 和 b，讓擬合誤差在 0.025 以內。', en: 'In “Log scale” mode choose “Bacteria” and adjust C and b until the misfit is 0.025 or less.' },
      check: function (ev) { const d = ev.data; return ev.type === 'semilog' && !d.chal && d.set === 'bacteria' && d.rms != null && d.rms <= 0.025; }
    },
    {
      id: 'exp-log-10', level: 5,
      title: { zh: '半衰期', en: 'Half-life' },
      desc: { zh: '選「放射性衰變」，把模型對準資料，擬合誤差在 0.012 以內（點數字把 b 打到小數第 3 位）。', en: 'Choose “Radioactive decay” and fit the model to the data with a misfit of 0.012 or less (tap the number and type b to 3 decimal places).' },
      check: function (ev) { const d = ev.data; return ev.type === 'semilog' && !d.chal && d.set === 'decay' && d.rms != null && d.rms <= 0.012; }
    },
    {
      id: 'exp-log-11', level: 6,
      title: { zh: '看穿一組資料', en: 'See through the data' },
      desc: { zh: '在挑戰裡對準一組隨機的指數資料。', en: 'Fit one set of random exponential data in the challenge.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'exp-log-12', level: 8,
      title: { zh: '對數高手', en: 'Log-scale master' },
      desc: { zh: '連續對準三組挑戰資料，三題合計 90 秒以內。', en: 'Fit three challenge data sets in a row, in 90 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 90; }
    },
    {
      id: 'exp-log-h1', level: 5, hidden: true,
      riddle: { zh: '鏡子裡外的兩個人，握了三次手。', en: 'The one in the mirror and the one outside shook hands three times.' },
      check: function (ev) { return ev.type === 'inverse' && ev.data.a < E_ME && ev.data.meets === 3; }
    },
    {
      id: 'exp-log-h2', level: 2, hidden: true,
      riddle: { zh: '一個永遠長不大的底數。', en: 'A base that never grows up.' },
      check: function (ev) { return ev.type === 'inverse' && near(ev.data.a, 1, 1e-9); }
    },
    {
      id: 'exp-log-h3', level: 6, hidden: true,
      riddle: { zh: '鏡子上唯一的那一點。', en: 'The only point that lies on the mirror.' },
      check: function (ev) { const d = ev.data; return ev.type === 'inverse' && near(d.a, E_1E, 0.0005) && near(d.x, Math.E, 0.005); }
    }
  ]);
})();
