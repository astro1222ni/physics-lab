/* missions/esterification.js — 酯化反應的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/esterification.js 只在使用者操作之後回報）：
  //   'tick'：每 0.5 秒 { acid, alc, label, n{A,B,E,W}, n0{…}, add{…}, sieves, cat, T, Tmin, Tmax, t, xi, yield, yA, yB, eq, lnQK0, t50, running, worked }
  //   'equil'：達到平衡 { rec, log }；rec = { acid, alc, label, n0, add, sieves, cat, T, Tmin, Tmax, t, n, xi, yield, yA, yB, fresh }
  //   'shift'：平衡被擾動後又回到平衡 { base, now, adds{A,B,E,W}, sieves, T0, T1 }
  //   'workup'：分出酯層 { acid, alc, label, esterMol, esterMass, yield, xi, t }
  // A = 酸、B = 醇、E = 酯、W = 水；n0 = 配製時的量，add = 之後按「加…」加入的量；fresh = 沒加料、沒分子篩、溫度沒變過。
  const tk = function (ev) { return ev.type === 'tick' && ev.data ? ev.data : null; };
  const eqr = function (ev) { return ev.type === 'equil' && ev.data && ev.data.rec ? ev.data.rec : null; };
  const sh = function (ev) { return ev.type === 'shift' && ev.data && ev.data.base && ev.data.now ? ev.data : null; };
  const wk = function (ev) { return ev.type === 'workup' && ev.data ? ev.data : null; };
  const noAdd = function (a) { return a.A + a.B + a.E + a.W < 1e-9; };
  /** 只從酸和醇出發（沒有酯、水），兩者都至少 0.1 mol */
  const fromAB = function (n0) { return n0.A >= 0.1 - 1e-9 && n0.B >= 0.1 - 1e-9 && n0.E === 0 && n0.W === 0; };
  const eqMol = function (n0, tol) { return Math.abs(n0.A - n0.B) <= tol * Math.max(n0.A, n0.B); };
  const same = function (x, y, tol) { return Math.abs(x - y) <= tol; };

  LabMission.register('esterification', [
    {
      id: 'esterification-1', level: 1,
      title: { zh: '第一滴香味', en: 'The first whiff' },
      desc: { zh: '按「開始加熱」，讓瓶中生成至少 0.05 mol 的酯。', en: 'Press “Start heating” and make at least 0.05 mol of ester in the flask.' },
      check: function (ev) { const d = tk(ev); return !!d && d.xi >= 0.05; }
    },
    {
      id: 'esterification-2', level: 2,
      title: { zh: '香蕉油', en: 'Banana oil' },
      desc: { zh: '用乙酸和異戊醇，做出至少 0.10 mol 的乙酸異戊酯（香蕉的氣味）。', en: 'From acetic acid and isoamyl alcohol, make at least 0.10 mol of isoamyl acetate (the smell of bananas).' },
      check: function (ev) { const d = tk(ev); return !!d && d.acid === 'acetic' && d.alc === 'isoamyl' && d.xi >= 0.1; }
    },
    {
      id: 'esterification-3', level: 3,
      title: { zh: '停在半路', en: 'Stuck halfway' },
      desc: { zh: '讓反應達到平衡：反應商 Q 等於平衡常數 K，酯不再增加。', en: 'Let the reaction reach equilibrium: the reaction quotient Q equals the equilibrium constant K and the ester stops increasing.' },
      check: function (ev) { return !!eqr(ev); }
    },
    {
      id: 'esterification-4', level: 4,
      title: { zh: '倒著走', en: 'Running backwards' },
      desc: { zh: '瓶中一開始只放酯和水（酸、醇都是 0），讓它水解到平衡。', en: 'Start with only ester and water in the flask (no acid, no alcohol) and let it hydrolyse until equilibrium.' },
      check: function (ev) { const r = eqr(ev); return !!r && r.n0.A === 0 && r.n0.B === 0 && r.n0.E > 0 && r.n0.W > 0 && r.add.A + r.add.B < 1e-9; }
    },
    {
      id: 'esterification-5', level: 5,
      title: { zh: '加水，酯變少', en: 'Add water, lose ester' },
      desc: { zh: '達到平衡後只「加水」（溫度不變），等它再次平衡：酯比原來的平衡少 0.005 mol 以上。', en: 'Once at equilibrium, only “Add water” (same temperature) and wait for the new equilibrium: there must be at least 0.005 mol less ester than before.' },
      check: function (ev) {
        const d = sh(ev);
        return !!d && d.adds.W > 0 && d.adds.A + d.adds.B + d.adds.E < 1e-9 && d.sieves === 0 && same(d.T0, d.T1, 0.5) && d.now.n.E - d.base.n.E <= -0.005;
      }
    },
    {
      id: 'esterification-6', level: 5,
      title: { zh: '醇多一點', en: 'A little more alcohol' },
      desc: { zh: '只從酸和醇出發，醇的莫耳數至少是酸的 1.5 倍（不加料、不加分子篩），平衡時的產率達到 85% 以上。', en: 'Start from acid and alcohol only, with at least 1.5 times as many moles of alcohol as acid (no additions, no sieves), and reach an equilibrium yield of 85% or more.' },
      check: function (ev) { const r = eqr(ev); return !!r && r.fresh && fromAB(r.n0) && r.n0.B >= 1.5 * r.n0.A - 1e-9 && r.yield >= 0.85; }
    },
    {
      id: 'esterification-7', level: 6,
      title: { zh: '十分鐘過半', en: 'Halfway in ten minutes' },
      desc: { zh: '只從酸和醇出發、不加料也不加分子篩，讓產率在 600 秒（模擬時間）以內到達 50%。', en: 'Starting from acid and alcohol only, with no additions or sieves, reach a 50% yield within 600 s of simulated time.' },
      check: function (ev) { const d = tk(ev); return !!d && d.t50 != null && d.t50 <= 600 && fromAB(d.n0); }
    },
    {
      id: 'esterification-8', level: 7,
      title: { zh: '把水拿走', en: 'Take the water away' },
      desc: { zh: '用等莫耳的酸和醇（相差 5% 以內），不另外加酸或醇，靠分子篩讓產率超過 95%。', en: 'With equal moles of acid and alcohol (within 5%) and without adding more of either, use molecular sieves to push the yield above 95%.' },
      check: function (ev) {
        const d = tk(ev);
        return !!d && d.sieves >= 1 && fromAB(d.n0) && eqMol(d.n0, 0.05) && d.add.A + d.add.B < 1e-9 && d.yield >= 0.95;
      }
    },
    {
      id: 'esterification-9', level: 8,
      title: { zh: '殊途同歸', en: 'All roads lead here' },
      desc: { zh: '從兩種不同的起始組成出發，但酸根、醇根、羥基的總量都相同（例如一次只放酸和醇、一次只放等量的酯和水），在同一溫度下兩次平衡的酯相差不到 0.005 mol。', en: 'Start from two different mixtures that contain the same total acid part, alcohol part and hydroxyl groups (for example acid and alcohol only, then the same amounts of ester and water only); at the same temperature the two equilibria must have less than 0.005 mol difference in ester.' },
      check: function (ev) {
        const r = eqr(ev);
        if (!r || !r.fresh) return false;
        const inv = function (n) { return [n.A + n.E, n.B + n.E, n.A + n.W]; };
        const a = inv(r.n0);
        return ev.data.log.some(function (o) {
          if (!o.fresh || o.acid !== r.acid || o.alc !== r.alc || !same(o.T, r.T, 1)) return false;
          const b = inv(o.n0);
          const diff = Math.abs(o.n0.A - r.n0.A) + Math.abs(o.n0.B - r.n0.B) + Math.abs(o.n0.E - r.n0.E) + Math.abs(o.n0.W - r.n0.W);
          return diff >= 0.05 && a.every(function (x, i) { return same(x, b[i], 0.005); }) && same(o.n.E, r.n.E, 0.005);
        });
      }
    },
    {
      id: 'esterification-10', level: 9,
      title: { zh: '不用分子篩的 95%', en: '95% without sieves' },
      desc: { zh: '只從酸和醇出發、不用分子篩，讓平衡時的產率達到 95% 以上。', en: 'Starting from acid and alcohol only and without molecular sieves, reach an equilibrium yield of 95% or more.' },
      check: function (ev) { const r = eqr(ev); return !!r && r.sieves === 0 && fromAB(r.n0) && r.yield >= 0.95; }
    },
    {
      id: 'esterification-11', level: 10,
      title: { zh: '一滴不剩', en: 'Not a drop left' },
      desc: { zh: '生成至少 0.20 mol 的酯，而且產率達到 99% 以上。', en: 'Make at least 0.20 mol of ester with a yield of 99% or more.' },
      check: function (ev) { const d = tk(ev); return !!d && d.xi >= 0.2 && d.yield >= 0.99; }
    },
    {
      id: 'esterification-h1', level: 3, hidden: true,
      riddle: { zh: '和醋的靈魂同一副骨架，卻輕得一摸就飛走。', en: 'Built on the same frame as vinegar’s soul, yet so light it flies off at a touch.' },
      check: function (ev) { const d = wk(ev); return !!d && d.acid === 'formic' && d.alc === 'methanol' && d.esterMol >= 0.1; }
    },
    {
      id: 'esterification-h2', level: 3, hidden: true,
      riddle: { zh: '從臭酸的奶油裡，提煉出熱帶的金黃。', en: 'Out of rancid butter, a tropical gold.' },
      check: function (ev) { const d = wk(ev); return !!d && d.acid === 'butyric' && d.alc === 'ethanol' && d.esterMol >= 0.1; }
    },
    {
      id: 'esterification-h3', level: 4, hidden: true,
      riddle: { zh: '戴著重戒指的那一位，最後浮在上面。', en: 'The one wearing the heavy ring ends up floating on top.' },
      check: function (ev) { const d = wk(ev); return !!d && d.label && d.esterMol >= 0.1; }
    },
    {
      id: 'esterification-h4', level: 4, hidden: true,
      riddle: { zh: '讓另一邊來慷慨，結果也一樣甜。', en: 'Let the other side be generous; it turns out just as sweet.' },
      check: function (ev) {
        const r = eqr(ev);
        return !!r && r.fresh && fromAB(r.n0) && r.n0.A >= 2 * r.n0.B - 1e-9 && r.yB != null && r.yB >= 0.9;
      }
    },
    {
      id: 'esterification-h5', level: 5, hidden: true,
      riddle: { zh: '一位法國化學家把它們封在玻璃管裡，在室溫等了一年多。', en: 'A French chemist sealed them in glass tubes and waited more than a year at room temperature.' },
      check: function (ev) {
        const r = eqr(ev);
        return !!r && r.fresh && fromAB(r.n0) && eqMol(r.n0, 0.01) && r.Tmax <= 30 && r.yield >= 0.66 && r.yield <= 0.675;
      }
    },
    {
      id: 'esterification-h6', level: 5, hidden: true,
      riddle: { zh: '酒裡摻了太多水，香味就淡了。', en: 'Too much water in the wine, and the fragrance fades.' },
      check: function (ev) {
        const r = eqr(ev);
        return !!r && r.fresh && r.n0.A >= 0.1 && r.n0.E === 0 && eqMol(r.n0, 0.02) && r.n0.W >= 2 * r.n0.A - 1e-9 && r.xi > 0 && r.yield < 0.5;
      }
    },
    {
      id: 'esterification-h7', level: 7, hidden: true,
      riddle: { zh: '什麼都沒發生，其實一刻也沒停。', en: 'Nothing happens — yet it never stops for a moment.' },
      check: function (ev) {
        const d = tk(ev);
        return !!d && d.t >= 1800 && d.cat > 0 && d.n0.A >= 0.05 && d.n0.B >= 0.05 && d.n0.E >= 0.05 && d.n0.W >= 0.05 &&
          noAdd(d.add) && d.sieves === 0 && d.Tmax - d.Tmin <= 0.5 && d.lnQK0 != null && Math.abs(d.lnQK0) < 0.03 && Math.abs(d.xi) < 0.002;
      }
    },
    {
      id: 'esterification-h8', level: 7, hidden: true,
      riddle: { zh: '沒有嚮導，旅人走得很慢，但終點在同一個地方。', en: 'Without a guide the traveller walks slowly, but arrives at the same place.' },
      check: function (ev) {
        const r = eqr(ev);
        if (!r || !r.fresh) return false;
        return ev.data.log.some(function (o) {
          if (!o.fresh || o.acid !== r.acid || o.alc !== r.alc || !same(o.T, r.T, 1)) return false;
          if (!['A', 'B', 'E', 'W'].every(function (k) { return same(o.n0[k], r.n0[k], 0.005); })) return false;
          const c0 = Math.min(o.cat, r.cat), c1 = Math.max(o.cat, r.cat);
          return c0 === 0 && c1 >= 0.5 && same(o.n.E, r.n.E, 0.003);
        });
      }
    },
    {
      id: 'esterification-h9', level: 8, hidden: true,
      riddle: { zh: '火讓它跑得更快，卻讓它少走一步。', en: 'Fire makes it run faster, yet it stops a step short.' },
      check: function (ev) {
        const d = sh(ev);
        return !!d && noAdd(d.adds) && d.sieves === 0 && d.T0 <= 30 && d.T1 >= 70 && d.now.n.E - d.base.n.E <= -0.003;
      }
    },
    {
      id: 'esterification-h10', level: 10, hidden: true,
      riddle: { zh: '同時送上兩份禮物，天平卻一動也不動。', en: 'Two gifts arrive at once, and the balance does not move at all.' },
      check: function (ev) {
        const d = sh(ev);
        return !!d && d.adds.A > 0 && same(d.adds.A, d.adds.W, 1e-6) && d.adds.B + d.adds.E < 1e-9 && d.sieves === 0 &&
          same(d.T0, d.T1, 0.5) && d.base.n.A > 0.05 && Math.abs(d.now.n.E - d.base.n.E) < 0.002;
      }
    }
  ]);
})();
