/* missions/reaction-rate.js — 反應速率與碰撞學說的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/reaction-rate.js 只在使用者操作之後回報）：
  //   'tick'：模擬進行中每 0.5 秒一次
  //     { run：這一次實驗的摘要, runs：數據表所有的列（含這一次）, eq：{ span, f, r } 最近 500 ps 的正、逆反應次數,
  //       arr：同一反應、不同溫度的阿瑞尼斯擬合 { nT, span, Ea, EaApp（完美量測時圖上應得的值）, EaF } 或 null, speed（0 慢動作）}
  //     摘要：{ id, key（同一反應的代號）, mys（未知反應編號，0＝一般）, T, Ea, EaF, dH, cat, steric, heat（反應熱留在氣體裡）,
  //             nA, nB, t, collAB, enoughAB, fwd, rev, k（L/(mol·s)）, kErr, rate0, rate0n, tHalf, t10, conv,
  //             fracObs, effObs, fracTh, Tgas, TgasMax, slowFwd（慢動作時看到的反應次數）}
  //   'answer'：未知反應按「核對答案」{ ans, err（相對誤差）, nT（反應 ≥ 30 次的溫度數）, tries, revealed }
  const isT = function (ev) { return ev.type === 'tick' && ev.data && ev.data.run; };
  const isA = function (ev) { return ev.type === 'answer' && ev.data && !ev.data.revealed; };
  const E = 1e-9;

  LabMission.register('reaction-rate', [
    {
      id: 'reaction-rate-1', level: 1,
      title: { zh: '看見一次反應', en: 'Catch a reaction' },
      desc: { zh: '切到「慢動作」，親眼看到 A 和 B 撞出一個亮閃光（變成 C 和 D）。', en: 'Switch to slow-mo and watch A and B collide in a bright flash (turning into C and D).' },
      check: function (ev) { return isT(ev) && ev.data.run.slowFwd >= 1; }
    },
    {
      id: 'reaction-rate-2', level: 2,
      title: { zh: '加熱就快', en: 'Heat speeds it up' },
      desc: { zh: '把溫度調到 700 K 以上，讓 A 用掉一半（半生期出現）。', en: 'Set the temperature to 700 K or more and let half of A react (a half-life appears).' },
      check: function (ev) { const r = ev.data.run; return isT(ev) && r.T >= 700 && r.tHalf != null && !r.heat; }
    },
    {
      id: 'reaction-rate-3', level: 3,
      title: { zh: '量身訂做的半生期', en: 'A half-life made to order' },
      desc: { zh: '調整條件，讓半生期落在 250～350 ps 之間（目標 300 ps）。', en: 'Choose the conditions so that the half-life is between 250 and 350 ps (aim for 300 ps).' },
      check: function (ev) { const r = ev.data.run; return isT(ev) && !r.heat && r.tHalf != null && r.tHalf >= 250 && r.tHalf <= 350; }
    },
    {
      id: 'reaction-rate-4', level: 4,
      title: { zh: '濃度加倍，k 不變', en: 'Double the concentration, same k' },
      desc: { zh: '同一個反應、同一溫度做兩次，只把 A（或 B）的分子數加倍：兩次各有 50 次以上的反應，量到的 k 相差不到 25%。', en: 'Run the same reaction at the same temperature twice, doubling only the number of A (or B) molecules: with at least 50 reactions each, the two values of k agree within 25%.' },
      check: function (ev) {
        if (!isT(ev)) return false;
        const rows = ev.data.runs.filter(function (r) { return !r.heat && r.fwd >= 50 && r.k > 0; });
        for (let i = 0; i < rows.length; i++) for (let j = 0; j < rows.length; j++) {
          const p = rows[i], q = rows[j];
          if (i === j || p.key !== q.key || p.T !== q.T) continue;
          const dblA = q.nA === 2 * p.nA && q.nB === p.nB, dblB = q.nB === 2 * p.nB && q.nA === p.nA;
          if (!dblA && !dblB) continue;
          const ratio = q.k / p.k;
          if (ratio >= 0.75 - E && ratio <= 1.25 + E) return true;
        }
        return false;
      }
    },
    {
      id: 'reaction-rate-5', level: 4,
      title: { zh: '四分之一的機會', en: 'One chance in four' },
      desc: { zh: '勾選「方向要對才反應」：累積 300 次以上能量足夠的 A–B 碰撞，其中真的反應的比例在 20%～30% 之間。', en: 'Tick “Orientation matters”: after at least 300 A–B collisions with enough energy, the fraction that actually reacted is between 20% and 30%.' },
      check: function (ev) {
        const r = ev.data.run;
        return isT(ev) && r.steric && !r.mys && r.enoughAB >= 300 && r.fwd / r.enoughAB >= 0.2 - E && r.fwd / r.enoughAB <= 0.3 + E;
      }
    },
    {
      id: 'reaction-rate-6', level: 5,
      title: { zh: '冷天裡的捷徑', en: 'A shortcut in the cold' },
      desc: { zh: '活化能至少 20 kJ/mol、溫度不超過 300 K：用催化劑（以及濃度），讓半生期不超過 500 ps。', en: 'With an activation energy of at least 20 kJ/mol and a temperature of 300 K or less, use a catalyst (and the concentrations) to get a half-life of 500 ps or less.' },
      check: function (ev) { const r = ev.data.run; return isT(ev) && !r.mys && !r.heat && r.cat && r.Ea >= 20 - E && r.T <= 300 && r.tHalf != null && r.tHalf <= 500; }
    },
    {
      id: 'reaction-rate-7', level: 5,
      title: { zh: '十中選一', en: 'One in ten' },
      desc: { zh: '設計溫度與活化能，讓能量足夠的碰撞理論上占 9%～11%，而且累積 3000 次以上 A–B 碰撞後，模擬的比例也在 9%～11%。', en: 'Choose the temperature and activation energy so that, in theory, 9–11% of collisions have enough energy — and after at least 3000 A–B collisions the simulated fraction is also between 9% and 11%.' },
      check: function (ev) {
        const r = ev.data.run;
        return isT(ev) && !r.mys && r.collAB >= 3000 && r.fracTh >= 0.09 - E && r.fracTh <= 0.11 + E && r.fracObs >= 0.09 - E && r.fracObs <= 0.11 + E;
      }
    },
    {
      id: 'reaction-rate-8', level: 6,
      title: { zh: '動態平衡', en: 'Dynamic equilibrium' },
      desc: { zh: '讓逆反應也發生：在最近 500 ps 內，正反應與逆反應各發生 50 次以上，而且次數相差不到 20%。', en: 'Let the reverse reaction happen too: in the last 500 ps, at least 50 forward and 50 reverse reactions, and the two counts within 20% of each other.' },
      check: function (ev) {
        const q = ev.data.eq;
        return isT(ev) && q && q.span >= 500 - E && q.f >= 50 && q.r >= 50 && Math.abs(q.f - q.r) <= 0.2 * Math.max(q.f, q.r) + E;
      }
    },
    {
      id: 'reaction-rate-9', level: 7,
      title: { zh: '阿瑞尼斯圖', en: 'Arrhenius plot' },
      desc: { zh: '同一個反應（活化能至少 5 kJ/mol）在 3 個以上的溫度各做一次，最高與最低溫相差至少 400 K、每次至少 80 次反應：由圖求得的 Ea 和理論應得的值相差不到 10%。', en: 'Run the same reaction (activation energy at least 5 kJ/mol) at 3 or more temperatures spanning at least 400 K, with at least 80 reactions each: the Ea from the plot is within 10% of the value theory says the plot should give.' },
      check: function (ev) {
        const a = ev.data.arr;
        return isT(ev) && !!a && a.nT >= 3 && a.span >= 400 - E && a.EaF >= 5 - E && Math.abs(a.Ea - a.EaApp) <= 0.1 * a.EaApp;
      }
    },
    {
      id: 'reaction-rate-10', level: 8,
      title: { zh: '未知的活化能', en: 'The unknown activation energy' },
      desc: { zh: '「未知反應」：在至少兩個溫度量出 k（每次至少 30 次反應），求出活化能，誤差在 10% 以內。', en: 'Unknown reaction: measure k at two or more temperatures (at least 30 reactions each) and find the activation energy within 10%.' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.nT >= 2 && d.err <= 0.1; }
    },
    {
      id: 'reaction-rate-11', level: 10,
      title: { zh: '精密的阿瑞尼斯', en: 'Arrhenius, precisely' },
      desc: { zh: '「未知反應」：在至少三個溫度量出 k（每次至少 30 次反應），活化能的誤差在 4% 以內。', en: 'Unknown reaction: measure k at three or more temperatures (at least 30 reactions each) and find the activation energy within 4%.' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.nT >= 3 && d.err <= 0.04; }
    },
    {
      id: 'reaction-rate-h1', level: 3, hidden: true,
      riddle: { zh: '千次擦肩，沒有一次回頭。', en: 'A thousand brushes past, and not one turned back.' },
      check: function (ev) { const r = ev.data.run; return isT(ev) && r.collAB >= 1000 && r.fwd === 0; }
    },
    {
      id: 'reaction-rate-h2', level: 4, hidden: true,
      riddle: { zh: '每一次相遇，都是最後一次。', en: 'Every meeting was the last.' },
      check: function (ev) { const r = ev.data.run; return isT(ev) && !r.mys && !r.steric && r.EaF === 0 && r.collAB >= 50 && r.fwd === r.collAB; }
    },
    {
      id: 'reaction-rate-h3', level: 6, hidden: true,
      riddle: { zh: '一點火星，自己燒成了烈焰。', en: 'One spark, and it fed its own fire.' },
      check: function (ev) { const r = ev.data.run; return isT(ev) && r.heat && r.TgasMax >= 1.5 * r.T; }
    }
  ]);
})();
