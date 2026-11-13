/* missions/chemical-equilibrium.js — 化學平衡與勒沙特列原理的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/chemical-equilibrium.js 只在使用者操作之後回報）：
  //   'settle'：每次達到平衡並記入紀錄表時
  //     { rx（'n2o4'／'haber'／'hi'／'mys'）, mys, T, V（mL）, P（bar）, mode（'V' 定容／'P' 定壓）, cat, n（mol）, p（bar）, x, c（mol/L）,
  //       Ar（mol）, K, changes, origin（'R'／'P'）, stop（定壓時活塞頂到盡頭）, prev, earlier（同一段實驗較早的平衡，最多 30 列）}
  //   'predict'：預測模式每答一題 { ok, streak, kinds（連續答對中不同改變的種類數）, zero（其中有「不移動」）, truth, choice, kind }
  //   'answer'：未知反應按「核對答案」{ ans, err（相對誤差）, nT（量過的溫度數）, span（溫差 K）, tries, revealed }
  const isS = function (ev, rx) { return ev.type === 'settle' && ev.data && (!rx || ev.data.rx === rx); };
  const isP = function (ev) { return ev.type === 'predict' && ev.data && ev.data.ok; };
  const isA = function (ev) { return ev.type === 'answer' && ev.data && !ev.data.revealed; };
  const close = function (a, b, tol) { return b > 0 && Math.abs(a - b) / b <= tol; };
  const some = function (d, f) { return (d.earlier || []).some(f); };
  const SP = { n2o4: ['N2O4', 'NO2'], haber: ['N2', 'H2', 'NH3'], hi: ['H2', 'I2', 'HI'], mys: ['A2', 'A'] };
  const reactive = function (d) { return SP[d.rx].reduce(function (s, k) { return s + (d.n[k] || 0); }, 0); };
  /** 各元素的總莫耳數（N2O4 ⇌ 2NO2 只有 N；哈柏法 N、H；HI 的 H、I） */
  const atoms = function (d) {
    const n = d.n;
    if (d.rx === 'n2o4') return { N: 2 * n.N2O4 + n.NO2 };
    if (d.rx === 'haber') return { N: 2 * n.N2 + n.NH3, H: 2 * n.H2 + 3 * n.NH3 };
    return { H: 2 * n.H2 + n.HI, I: 2 * n.I2 + n.HI };
  };
  /** 預設用量的元素總量（從反應物或從生成物開始都一樣） */
  const DEF = { n2o4: { N: 4e-3 }, haber: { N: 0.1, H: 0.3 }, hi: { H: 2e-3, I: 2e-3 } };
  const near = function (a, b, tol) { return Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-12); };
  /** h5 用：每個反應最近一次「從反應物開始」與「從生成物開始」的平衡 */
  const met = {};

  LabMission.register('chemical-equilibrium', [
    {
      id: 'chemical-equilibrium-1', level: 1,
      title: { zh: '壓一壓注射筒', en: 'Squeeze the syringe' },
      desc: { zh: 'N2O4 ⇌ 2NO2：先達到平衡，再在同一溫度把體積壓到原來的 70% 以下，等它再次平衡。', en: 'N2O4 ⇌ 2NO2: reach equilibrium, then, at the same temperature, compress to 70% of the volume or less and wait for equilibrium again.' },
      check: function (ev) {
        if (!isS(ev, 'n2o4')) return false;
        const d = ev.data;
        return some(d, function (e) { return e.T === d.T && d.V <= 0.7 * e.V + 1e-9; });
      }
    },
    {
      id: 'chemical-equilibrium-2', level: 2,
      title: { zh: '熱水裡的紅棕色', en: 'Brown in hot water' },
      desc: { zh: 'N2O4 ⇌ 2NO2：把溫度提高 30 K 以上，讓平衡時的 NO2 比之前多。', en: 'N2O4 ⇌ 2NO2: raise the temperature by 30 K or more so that there is more NO2 at equilibrium than before.' },
      check: function (ev) {
        if (!isS(ev, 'n2o4')) return false;
        const d = ev.data;
        return some(d, function (e) { return e.T <= d.T - 30 && d.n.NO2 > e.n.NO2; });
      }
    },
    {
      id: 'chemical-equilibrium-3', level: 3,
      title: { zh: '冰水裡幾乎無色', en: 'Almost colourless in ice water' },
      desc: { zh: 'N2O4 ⇌ 2NO2：讓平衡混合物中 N2O4 的莫耳分率達到 0.90 以上。', en: 'N2O4 ⇌ 2NO2: make the mole fraction of N2O4 at equilibrium 0.90 or more.' },
      check: function (ev) { return isS(ev, 'n2o4') && ev.data.Ar === 0 && ev.data.x.N2O4 >= 0.9; }
    },
    {
      id: 'chemical-equilibrium-4', level: 3,
      title: { zh: '壓了也不動', en: 'Squeezed but unmoved' },
      desc: { zh: 'H2 + I2 ⇌ 2HI：在同一溫度把體積變成 2 倍以上（或一半以下），再次平衡後 HI 的莫耳數變化不到 0.5%。', en: 'H2 + I2 ⇌ 2HI: at the same temperature, double the volume or more (or halve it or less); at the new equilibrium the amount of HI has changed by less than 0.5%.' },
      check: function (ev) {
        if (!isS(ev, 'hi')) return false;
        const d = ev.data;
        return some(d, function (e) {
          const r = d.V / e.V;
          return e.T === d.T && (r >= 2 - 1e-9 || r <= 0.5 + 1e-9) && e.n.HI > 0 && close(d.n.HI, e.n.HI, 0.005);
        });
      }
    },
    {
      id: 'chemical-equilibrium-5', level: 4,
      title: { zh: '多了一位旁觀者', en: 'A bystander arrives' },
      desc: { zh: '定容下，在平衡混合物中加入氬氣，加到不少於反應氣體的總量：再次平衡時每種反應氣體的量都和加入前相差不到 0.5%。', en: 'At constant volume, add argon to an equilibrium mixture until there is at least as much argon as reacting gas: at the new equilibrium every reacting gas is within 0.5% of its amount before.' },
      check: function (ev) {
        if (!isS(ev) || ev.data.mode !== 'V') return false;
        const d = ev.data;
        if (d.Ar < reactive(d) - 1e-12) return false;
        return some(d, function (e) {
          return e.Ar < d.Ar && e.T === d.T && close(d.V, e.V, 0.005) && SP[d.rx].every(function (k) { return e.n[k] > 0 && close(d.n[k], e.n[k], 0.005); });
        });
      }
    },
    {
      id: 'chemical-equilibrium-6', level: 5,
      title: { zh: '定壓的稀釋', en: 'Diluted at constant pressure' },
      desc: { zh: 'N2O4 ⇌ 2NO2：切換到定壓，在同一溫度與壓力下加入氬氣，讓平衡時 NO2 的莫耳數增加 10% 以上。', en: 'N2O4 ⇌ 2NO2: switch to constant pressure and, at the same temperature and pressure, add argon so that the amount of NO2 at equilibrium rises by 10% or more.' },
      check: function (ev) {
        if (!isS(ev, 'n2o4') || ev.data.mode !== 'P' || ev.data.stop) return false;
        const d = ev.data;
        return some(d, function (e) { return !e.stop && e.T === d.T && close(d.P, e.P, 1e-4) && e.Ar < d.Ar && e.n.NO2 > 0 && d.n.NO2 >= 1.1 * e.n.NO2; });
      }
    },
    {
      id: 'chemical-equilibrium-7', level: 5,
      title: { zh: '低溫高產率', en: 'High yield at low temperature' },
      desc: { zh: '哈柏法：在 550 K 以下、使用催化劑，達到平衡時 NH3 的莫耳分率在 0.60 以上。', en: 'Haber process: at 550 K or below, with the catalyst, reach equilibrium with a mole fraction of NH3 of 0.60 or more.' },
      check: function (ev) { const d = ev.data; return isS(ev, 'haber') && d.T <= 550 && d.cat && d.Ar === 0 && d.x.NH3 >= 0.6; }
    },
    {
      id: 'chemical-equilibrium-8', level: 6,
      title: { zh: '勒沙特列的直覺', en: 'Le Chatelier’s instinct' },
      desc: { zh: '開啟預測模式，連續答對 5 題，而且其中至少有 3 種不同的改變。', en: 'In prediction mode, get 5 predictions right in a row, with at least 3 different kinds of change.' },
      check: function (ev) { return isP(ev) && ev.data.streak >= 5 && ev.data.kinds >= 3; }
    },
    {
      id: 'chemical-equilibrium-9', level: 6,
      title: { zh: '又快又多', en: 'Fast and plentiful' },
      desc: { zh: '哈柏法：在 700 K 以上達到平衡，而且 NH3 的莫耳分率在 0.40 以上。', en: 'Haber process: at 700 K or above, reach equilibrium with a mole fraction of NH3 of 0.40 or more.' },
      check: function (ev) { const d = ev.data; return isS(ev, 'haber') && d.T >= 700 && d.Ar === 0 && d.x.NH3 >= 0.4; }
    },
    {
      id: 'chemical-equilibrium-10', level: 7,
      title: { zh: '十題全對', en: 'Ten in a row' },
      desc: { zh: '預測模式連續答對 10 題：至少 5 種不同的改變，其中要有一題的答案是「不移動」。', en: 'In prediction mode, get 10 right in a row: at least 5 kinds of change, including one whose answer is “no shift”.' },
      check: function (ev) { return isP(ev) && ev.data.streak >= 10 && ev.data.kinds >= 5 && ev.data.zero; }
    },
    {
      id: 'chemical-equilibrium-11', level: 8,
      title: { zh: '未知反應的焓', en: 'Enthalpy of the unknown' },
      desc: { zh: '在至少 2 個溫度量到未知反應的平衡，求出 ΔH°，誤差在 10% 以內。', en: 'Measure equilibria of the unknown reaction at two or more temperatures and find ΔH° within 10%.' },
      check: function (ev) { return isA(ev) && ev.data.nT >= 2 && ev.data.err <= 0.1; }
    },
    {
      id: 'chemical-equilibrium-12', level: 9,
      title: { zh: '凡特荷夫的直線', en: 'Van ’t Hoff’s straight line' },
      desc: { zh: '在至少 3 個溫度（最高與最低相差 60 K 以上）量到未知反應的平衡，求出 ΔH°，誤差在 2% 以內。', en: 'Measure equilibria of the unknown reaction at three or more temperatures, spanning at least 60 K, and find ΔH° within 2%.' },
      check: function (ev) { return isA(ev) && ev.data.nT >= 3 && ev.data.span >= 60 && ev.data.err <= 0.02; }
    },
    {
      id: 'chemical-equilibrium-h1', level: 3, hidden: true,
      riddle: { zh: '又冷又擠，連顏色都睡著了。', en: 'So cold and so crowded that even the colour fell asleep.' },
      // 試玩 T13：273 K 是溫度下限，只靠冷 x(NO2) 還有 0.126；提示加「擠」，門檻放寬到最低溫、最小體積（預設用量 0.060）做得到
      check: function (ev) { return isS(ev, 'n2o4') && ev.data.Ar === 0 && ev.data.x.NO2 <= 0.065; }
    },
    {
      id: 'chemical-equilibrium-h2', level: 5, hidden: true,
      riddle: { zh: '換了季節，顏色卻沒變。', en: 'The season changed, but the colour did not.' },
      check: function (ev) {
        if (!isS(ev, 'n2o4')) return false;
        const d = ev.data;
        return some(d, function (e) { return Math.abs(d.T - e.T) >= 30 && e.c.NO2 > 0 && close(d.c.NO2, e.c.NO2, 0.01); });
      }
    },
    {
      id: 'chemical-equilibrium-h3', level: 4, hidden: true,
      riddle: { zh: '工廠裡，拆得比建的快。', en: 'In the factory, it is torn down faster than it was built.' },
      check: function (ev) { const d = ev.data; return isS(ev, 'haber') && d.origin === 'P' && d.T >= 850 && d.x.NH3 <= 0.03; }
    },
    {
      id: 'chemical-equilibrium-h4', level: 6, hidden: true,
      riddle: { zh: '不偏不倚，天平兩邊一樣重。', en: 'Perfectly balanced: both pans weigh the same.' },
      // N2O4 ⇌ 2NO2 的 K = 1（ΔG° = 0）只在約 325 K；K 每 1 K 變約 6.5%，容許 5% 只有那一個整數溫度
      check: function (ev) { return isS(ev, 'n2o4') && ev.data.K > 0 && Math.abs(Math.log(ev.data.K)) <= Math.log(1.05); }
    },
    {
      id: 'chemical-equilibrium-h5', level: 5, hidden: true,
      riddle: { zh: '從山的兩邊爬，在同一個山頂相遇。', en: 'Climb from both sides of the mountain and meet on the same summit.' },
      // 從反應物、從生成物開始，元素總量相同（而且不是預設用量）、同溫同體積同氬量：平衡組成相同
      check: function (ev) {
        if (!isS(ev) || !DEF[ev.data.rx] || (ev.data.origin !== 'R' && ev.data.origin !== 'P')) return false;
        const d = ev.data, tot = atoms(d), key = d.rx;
        const mine = { T: d.T, V: d.V, Ar: d.Ar, tot: tot, x: d.x };
        met[key] = met[key] || {};
        const o = met[key][d.origin === 'R' ? 'P' : 'R'];
        met[key][d.origin] = mine;
        if (!o || o.T !== d.T || Math.abs(o.V - d.V) > 0.5 || !near(o.Ar, d.Ar, 0.005)) return false;
        const ks = Object.keys(tot);
        if (!ks.every(function (k) { return near(tot[k], o.tot[k], 0.005); })) return false;
        if (ks.every(function (k) { return near(tot[k], DEF[key][k], 0.05); })) return false;
        return SP[key].every(function (k) { return Math.abs((d.x[k] || 0) - (o.x[k] || 0)) <= 0.002; });
      }
    },
    {
      id: 'chemical-equilibrium-h6', level: 8, hidden: true,
      riddle: { zh: '客人來了，房子跟著變大，主人卻變少了。', en: 'Guests arrive and the house grows, yet the hosts become fewer.' },
      check: function (ev) {
        if (!isS(ev, 'haber')) return false;
        const d = ev.data, e = d.prev;
        return !!e && d.mode === 'P' && e.mode === 'P' && !d.stop && !e.stop && d.T === e.T && near(d.P, e.P, 0.01) &&
          d.Ar > e.Ar && e.n.NH3 > 0 && d.n.NH3 <= 0.8 * e.n.NH3;
      }
    },
    {
      id: 'chemical-equilibrium-h7', level: 4, hidden: true,
      riddle: { zh: '幫手走了，結果卻一模一樣。', en: 'The helper left, and the result is exactly the same.' },
      check: function (ev) {
        if (!isS(ev, 'haber')) return false;
        const d = ev.data, e = d.prev;
        return !!e && e.cat && !d.cat && d.T <= 500 && d.changes.length === 1 && d.changes[0] === 'cat' &&
          SP.haber.every(function (k) { return Math.abs((d.x[k] || 0) - (e.x[k] || 0)) <= 0.001; });
      }
    },
    {
      id: 'chemical-equilibrium-h8', level: 7, hidden: true,
      riddle: { zh: '在室溫裡，紅棕與無色各占一半。', en: 'At room temperature, half brown and half colourless.' },
      check: function (ev) { const d = ev.data; return isS(ev, 'n2o4') && d.T <= 300 && d.Ar === 0 && Math.abs(d.x.NO2 - 0.5) <= 0.005; }
    },
    {
      id: 'chemical-equilibrium-h9', level: 10, hidden: true,
      riddle: { zh: '只跨一小步，卻看清了整座山。', en: 'One tiny step, and yet the whole mountain comes into view.' },
      // 只用兩個相差不到 5 K 的溫度求 ΔH°，第一次核對就在 1% 以內（溫差小，讀數的誤差會被放大）
      check: function (ev) { const d = ev.data; return isA(ev) && d.tries === 1 && d.nT === 2 && d.span > 0 && d.span <= 5 && d.err <= 0.01; }
    },
    {
      id: 'chemical-equilibrium-h10', level: 9, hidden: true,
      riddle: { zh: '在火爐裡，硬是把它擠了出來。', en: 'In the furnace, squeezed out of it all the same.' },
      check: function (ev) { const d = ev.data; return isS(ev, 'haber') && d.T >= 850 && d.Ar === 0 && d.x.NH3 >= 0.18; }
    }
  ]);
})();
