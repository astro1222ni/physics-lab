/* missions/iodine-clock.js — 碘鐘反應與速率定律的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/iodine-clock.js 只在使用者按「混合並計時」之後才會送出）：
  //   'run'：溶液變藍、記入數據表時 { rx（'ps' 過硫酸根／'x' 未知氧化劑）, unk（未知反應的編號，過硫酸根為 0）, T（°C）, salt（保持離子強度）,
  //          VKI, VP, VS（mL）, I0, P0, S0（M）, t（變藍時間 s，碼錶讀數到 0.01 s）, rate（[S₂O₃²⁻]₀ / 2t，M/s；沒有硫代硫酸根時為 null）,
  //          prev（同一個反應先前的各次實驗）, fitI／fitP（其他條件相同的各次，ln 速率對 ln[I⁻]₀／ln[氧化劑]₀ 的擬合 { slope, n, nx, span }）,
  //          arr（同一配方在不同溫度：{ Ea（kJ/mol）, nT, span（°C） }）, sinceOk（未知反應：第一次答對級數之後的第幾次實驗，0 起算；沒答對過為 null） }
  //   'never'：硫代硫酸根過量、氧化劑用掉 99% 仍沒有變藍 { rx, unk, T, salt, I0, P0, S0, ratio（[S₂O₃²⁻]₀ ÷ 2[氧化劑]₀） }
  //   'answer'：按「核對」{ rx, unk, m, n, k（學生答的 25 °C 速率常數）, mOk, nOk, kErr（相對誤差，k 沒填為 null）, tries, revealed,
  //          runs（這個反應做了幾次）, nI, nP（用過幾種不同的 [I⁻]₀、[氧化劑]₀）, at25（25 °C 做的次數）, temps（用過幾個溫度） }
  const run = function (ev) { return ev.type === 'run' && ev.data ? ev.data : null; };
  const ans = function (ev) { return ev.type === 'answer' && ev.data ? ev.data : null; };
  const same = function (a, b, tol) { return Math.abs(a - b) <= (tol || 0.005) * Math.max(Math.abs(a), Math.abs(b), 1e-12); };
  const sameMix = function (a, b) { return same(a.I0, b.I0) && same(a.P0, b.P0) && same(a.S0, b.S0) && !!a.salt === !!b.salt; };
  const prevOf = function (d) { return d && d.prev ? d.prev : []; };

  LabMission.register('iodine-clock', [
    {
      id: 'iodine-clock-1', level: 1,
      title: { zh: '時間到，變藍', en: 'Time is up: blue' },
      desc: { zh: '按「混合並計時」，等溶液突然變藍。', en: 'Press “Mix and time” and wait for the solution to turn blue all at once.' },
      check: function (ev) { const d = run(ev); return !!d && d.t > 0; }
    },
    {
      id: 'iodine-clock-2', level: 2,
      title: { zh: '一分鐘的鐘', en: 'A one-minute clock' },
      desc: { zh: '調整配方或溫度，讓變藍時間落在 57–63 秒。', en: 'Change the recipe or the temperature so that the solution turns blue after 57–63 s.' },
      check: function (ev) { const d = run(ev); return !!d && d.t >= 57 && d.t <= 63; }
    },
    {
      id: 'iodine-clock-3', level: 3,
      title: { zh: '碘離子加倍', en: 'Double the iodide' },
      desc: { zh: '同一個反應、同一溫度，只把碘化鉀的體積加倍（其他都不變）做兩次，兩次的速率比在 1.85–2.15 之間。', en: 'With the same reaction and temperature, do two runs where only the volume of potassium iodide is doubled (nothing else changes). The ratio of the two rates must be 1.85–2.15.' },
      check: function (ev) {
        const d = run(ev);
        if (!d || !(d.rate > 0)) return false;
        return prevOf(d).some(function (q) {
          if (!(q.rate > 0) || Math.abs(q.T - d.T) > 0.05 || !!q.salt !== !!d.salt || !same(q.P0, d.P0) || !same(q.S0, d.S0)) return false;
          const ri = d.I0 / q.I0, big = ri > 1;
          if (!same(big ? ri : 1 / ri, 2, 0.02)) return false;
          const rr = big ? d.rate / q.rate : q.rate / d.rate;
          return rr >= 1.85 && rr <= 2.15;
        });
      }
    },
    {
      id: 'iodine-clock-4', level: 3,
      title: { zh: '差十度', en: 'Ten degrees apart' },
      desc: { zh: '同一個配方，在相差 10 °C 的兩個溫度各做一次，溫度高的速率至少是 1.5 倍。', en: 'Run the same recipe at two temperatures 10 °C apart. The warmer run must be at least 1.5 times as fast.' },
      check: function (ev) {
        const d = run(ev);
        if (!d || !(d.t > 0)) return false;
        return prevOf(d).some(function (q) {
          if (!(q.t > 0) || !sameMix(q, d) || Math.abs(Math.abs(q.T - d.T) - 10) > 0.5) return false;
          const hot = q.T > d.T ? q : d, cold = q.T > d.T ? d : q;
          return cold.t / hot.t >= 1.5;
        });
      }
    },
    {
      id: 'iodine-clock-5', level: 4,
      title: { zh: '碘離子的級數', en: 'The order in iodide' },
      desc: { zh: '勾選「保持離子強度」，其他條件相同、用至少 3 種碘化鉀體積（最大是最小的 4 倍以上），對數圖的斜率在 0.95–1.05。', en: 'With “Keep the ionic strength” ticked and everything else the same, use at least 3 different volumes of potassium iodide (the largest at least 4 times the smallest). The slope of the log–log graph must be 0.95–1.05.' },
      check: function (ev) { const d = run(ev), f = d && d.fitI; return !!f && d.rx === 'ps' && d.salt && f.nx >= 3 && f.span >= 3.99 && f.slope >= 0.95 && f.slope <= 1.05; }
    },
    {
      id: 'iodine-clock-6', level: 4,
      title: { zh: '過硫酸根的級數', en: 'The order in persulfate' },
      desc: { zh: '勾選「保持離子強度」，其他條件相同、用至少 3 種過硫酸銨體積（最大是最小的 4 倍以上），對數圖的斜率在 0.95–1.05。', en: 'With “Keep the ionic strength” ticked and everything else the same, use at least 3 different volumes of ammonium persulfate (the largest at least 4 times the smallest). The slope of the log–log graph must be 0.95–1.05.' },
      check: function (ev) { const d = run(ev), f = d && d.fitP; return !!f && d.rx === 'ps' && d.salt && f.nx >= 3 && f.span >= 3.99 && f.slope >= 0.95 && f.slope <= 1.05; }
    },
    {
      id: 'iodine-clock-7', level: 5,
      title: { zh: '寫出速率定律', en: 'Write the rate law' },
      desc: { zh: '過硫酸根反應：至少用過 2 種碘化鉀與 2 種過硫酸銨的體積後，填對兩個級數並按「核對」。', en: 'Persulfate reaction: after using at least 2 volumes of potassium iodide and 2 of ammonium persulfate, enter both orders correctly and press “Check”.' },
      check: function (ev) { const d = ans(ev); return !!d && d.rx === 'ps' && d.mOk && d.nOk && d.nI >= 2 && d.nP >= 2; }
    },
    {
      id: 'iodine-clock-8', level: 6,
      title: { zh: '速率常數', en: 'The rate constant' },
      desc: { zh: '過硫酸根反應：至少用過 2 種碘化鉀與 2 種過硫酸銨的體積，級數填對，25 °C 的速率常數 k 誤差在 5% 以內。', en: 'Persulfate reaction: after using at least 2 volumes of potassium iodide and 2 of ammonium persulfate, get the orders right and the rate constant k at 25 °C to within 5%.' },
      check: function (ev) { const d = ans(ev); return !!d && d.rx === 'ps' && d.mOk && d.nOk && d.nI >= 2 && d.nP >= 2 && d.kErr != null && d.kErr <= 0.05; }
    },
    {
      id: 'iodine-clock-9', level: 7,
      title: { zh: '時鐘裡的活化能', en: 'Activation energy from a clock' },
      desc: { zh: '過硫酸根反應：同一個配方在至少 3 個溫度（最高與最低差 20 °C 以上）各做一次，阿瑞尼斯圖求出的 Ea 誤差在 5% 以內。', en: 'Persulfate reaction: run one recipe at 3 or more temperatures (at least 20 °C from lowest to highest). The Ea from the Arrhenius graph must be within 5%.' },
      check: function (ev) { const d = run(ev), a = d && d.arr; return !!a && d.rx === 'ps' && a.nT >= 3 && a.span >= 19.99 && Math.abs(a.Ea / 50 - 1) <= 0.05; }
    },
    {
      id: 'iodine-clock-10', level: 8,
      title: { zh: '未知氧化劑的級數', en: 'Orders of the unknown oxidant' },
      desc: { zh: '未知氧化劑 X：至少用過 2 種碘化鉀與 2 種 X 的體積，不揭曉答案，填對兩個級數。', en: 'Unknown oxidant X: after using at least 2 volumes of potassium iodide and 2 of X, without revealing the answer, enter both orders correctly.' },
      check: function (ev) { const d = ans(ev); return !!d && d.rx === 'x' && !d.revealed && d.mOk && d.nOk && d.nI >= 2 && d.nP >= 2; }
    },
    {
      id: 'iodine-clock-11', level: 9,
      title: { zh: '未知氧化劑的速率常數', en: 'Rate constant of the unknown' },
      desc: { zh: '未知氧化劑 X：不揭曉答案，級數全對，25 °C 的速率常數誤差在 5% 以內。', en: 'Unknown oxidant X: without revealing the answer, get both orders right and the rate constant at 25 °C to within 5%.' },
      check: function (ev) { const d = ans(ev); return !!d && d.rx === 'x' && !d.revealed && d.mOk && d.nOk && d.kErr != null && d.kErr <= 0.05; }
    },
    {
      id: 'iodine-clock-12', level: 10,
      title: { zh: '三杯定江山', en: 'Three beakers are enough' },
      desc: { zh: '同一個未知氧化劑 X 最多只做 3 次實驗，第一次按「核對」就把兩個級數和速率常數（誤差 5% 以內）全部答對。', en: 'With at most 3 runs of one unknown oxidant X, get both orders and the rate constant (within 5%) right the first time you press “Check”.' },
      check: function (ev) { const d = ans(ev); return !!d && d.rx === 'x' && !d.revealed && d.tries === 1 && d.runs >= 1 && d.runs <= 3 && d.mOk && d.nOk && d.kErr != null && d.kErr <= 0.05; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'iodine-clock-h1', level: 3, hidden: true,
      riddle: { zh: '沒有鐘擺的鐘，一上弦就響。', en: 'A clock with no pendulum rings the moment it is wound.' },
      check: function (ev) { const d = run(ev); return !!d && d.S0 === 0 && d.t > 0; }
    },
    {
      id: 'iodine-clock-h2', level: 4, hidden: true,
      riddle: { zh: '一壺熱茶涼透了，它才肯開口。', en: 'A pot of hot tea goes cold before it says a word.' },
      check: function (ev) { const d = run(ev); return !!d && d.S0 > 0 && d.t >= 3600; }
    },
    {
      id: 'iodine-clock-h3', level: 4, hidden: true,
      riddle: { zh: '眨一下眼，就錯過了。', en: 'Blink, and you missed it.' },
      check: function (ev) { const d = run(ev); return !!d && d.S0 > 0 && d.t > 0 && d.t <= 1.2; }
    },
    {
      id: 'iodine-clock-h4', level: 5, hidden: true,
      riddle: { zh: '守門的比來客還多，這扇門永遠不開。', en: 'More gatekeepers than guests: this door will never open.' },
      check: function (ev) { return ev.type === 'never' && !!ev.data && ev.data.ratio >= 1; }
    },
    {
      id: 'iodine-clock-h5', level: 6, hidden: true,
      riddle: { zh: '少了看不見的鹽，斜線便悄悄多說了一點。', en: 'Without the unseen salt, the line quietly claims a little more.' },
      check: function (ev) { const d = run(ev), f = d && d.fitI; return !!f && d.rx === 'ps' && !d.salt && f.nx >= 3 && f.slope >= 1.12; }
    },
    {
      id: 'iodine-clock-h6', level: 7, hidden: true,
      riddle: { zh: '鐘響的那一刻，客人恰好走了一半。', en: 'When the bell rings, exactly half of the guests have gone.' },
      check: function (ev) { const d = run(ev); return !!d && d.t > 0 && d.P0 > 0 && Math.abs(d.S0 / d.P0 - 1) <= 0.02; }
    },
    {
      id: 'iodine-clock-h7', level: 7, hidden: true,
      riddle: { zh: '你多一點，我少一點，鐘聲照樣準時。', en: 'You a little more, I a little less, and the bell still rings on time.' },
      check: function (ev) {
        const d = run(ev);
        if (!d || d.rx !== 'ps' || !(d.S0 > 0) || !(d.t > 0)) return false;
        return prevOf(d).some(function (q) {
          if (q.rx !== 'ps' || !(q.t > 0) || Math.abs(q.T - d.T) > 0.05 || !!q.salt !== !!d.salt || !same(q.S0, d.S0)) return false;
          const ri = d.I0 / q.I0;
          return (ri >= 2.999 || ri <= 1 / 2.999) && Math.abs(d.I0 * d.P0 / (q.I0 * q.P0) - 1) <= 0.01 && Math.abs(d.t / q.t - 1) <= 0.02;
        });
      }
    },
    {
      id: 'iodine-clock-h8', level: 8, hidden: true,
      riddle: { zh: '冰水裡的那杯，追上了溫水裡的那杯。', en: 'The beaker in iced water caught up with the one in warm water.' },
      check: function (ev) {
        const d = run(ev);
        if (!d || d.rx !== 'ps' || !(d.S0 > 0) || !(d.t > 0)) return false;
        return prevOf(d).some(function (q) { return q.rx === 'ps' && q.S0 > 0 && q.t > 0 && Math.abs(q.T - d.T) >= 15 && Math.abs(d.t / q.t - 1) <= 0.01; });
      }
    },
    {
      id: 'iodine-clock-h9', level: 9, hidden: true,
      riddle: { zh: '從沒踏進的那一天，你卻說得出它的天氣。', en: 'You never set foot in that day, yet you can tell its weather.' },
      check: function (ev) { const d = ans(ev); return !!d && d.rx === 'ps' && d.mOk && d.nOk && d.at25 === 0 && d.temps >= 2 && d.kErr != null && d.kErr <= 0.03; }
    },
    {
      id: 'iodine-clock-h10', level: 10, hidden: true,
      riddle: { zh: '摸清了它的脾氣，頭一回就讓它數滿一百下才開口。', en: 'Once you know its temper, make it count to a hundred before it speaks, on the very first try.' },
      check: function (ev) { const d = run(ev); return !!d && d.rx === 'x' && d.sinceOk === 0 && d.t >= 99.5 && d.t <= 100.5; }
    }
  ]);
})();
