/* missions/polymerization.js — 加成聚合與縮合聚合的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/polymerization.js 只在使用者操作之後回報）：
  //   'tick'：反應進行中每 0.5 秒、反應結束時一次
  //   'record'：按「記錄數據」{ ...同 tick, n, rows（同一段實驗的紀錄，含這一列） }
  //   'hold'：使用者按「暫停」
  // 共同：{ mode（'add'／'cond'）, t, conv, Xn, Xw, PDI, Mn, Mw, ended, run, seg, running }
  // 加成：{ mon, gas, init（起始劑莫耳分率）, term（'comb'／'disp'）, shrink, initLeft, radicals, deadEnd, t50 }
  // 縮合：{ pair, ab, q, r, dry, everDry, closedAll, pA, waterOut（g）, waterMax, peq, atEq, eqXn }
  const tk = function (ev) { return ev.type === 'tick' && ev.data ? ev.data : null; };
  const rec = function (ev) { return ev.type === 'record' && ev.data && Array.isArray(ev.data.rows) ? ev.data : null; };
  const hold = function (ev) { return ev.type === 'hold' && ev.data ? ev.data : null; };
  /** 任一事件（tick／record／hold）的資料 */
  const any = function (ev) { return ev.data && (ev.type === 'tick' || ev.type === 'record' || ev.type === 'hold') ? ev.data : null; };
  const isAdd = function (d) { return !!d && d.mode === 'add'; };
  const isCond = function (d) { return !!d && d.mode === 'cond'; };
  const fin = function (x) { return x != null && isFinite(x); };
  /** 紀錄表裡找兩列（i ≠ j）滿足 f */
  function pair(rows, f) {
    for (let i = 0; i < rows.length; i++) for (let j = 0; j < rows.length; j++) if (i !== j && f(rows[i], rows[j])) return true;
    return false;
  }

  LabMission.register('polymerization', [
    {
      id: 'polymerization-1', level: 1,
      title: { zh: '一串接一串', en: 'One after another' },
      desc: { zh: '做一次加成聚合，讓單體的轉化率達到 50% 以上。', en: 'Run an addition polymerisation until at least 50% of the monomer has reacted.' },
      check: function (ev) { const d = tk(ev); return isAdd(d) && d.conv >= 0.5; }
    },
    {
      id: 'polymerization-2', level: 2,
      title: { zh: '每接一手，掉一滴水', en: 'A drop of water per link' },
      desc: { zh: '做一次縮合聚合，讓收集管收集到 1.00 g 以上的水。', en: 'Run a condensation polymerisation and collect at least 1.00 g of water in the receiver.' },
      check: function (ev) { const d = tk(ev); return isCond(d) && fin(d.waterOut) && d.waterOut >= 1.0; }
    },
    {
      id: 'polymerization-3', level: 3,
      title: { zh: '不沾鍋的長鏈', en: 'Non-stick giants' },
      desc: { zh: '用四氟乙烯做加成聚合，在轉化率 10% 以上時，讓數量平均分子量 Mn 達到 100 000 g/mol 以上。', en: 'Polymerise tetrafluoroethylene so that, at 10% conversion or more, the number-average molar mass Mn is at least 100 000 g/mol.' },
      check: function (ev) { const d = any(ev); return isAdd(d) && d.mon === 'tfe' && d.conv >= 0.1 && d.Mn >= 100000; }
    },
    {
      id: 'polymerization-4', level: 3,
      title: { zh: '越聚越擠', en: 'Packing closer' },
      desc: { zh: '用液體單體做加成聚合，讓體積收縮 10% 以上。', en: 'Polymerise a liquid monomer until its volume has shrunk by 10% or more.' },
      check: function (ev) { const d = any(ev); return isAdd(d) && !d.gas && fin(d.shrink) && d.shrink >= 0.10; }
    },
    {
      id: 'polymerization-5', level: 4,
      title: { zh: '二十個手牽手', en: 'Twenty hand in hand' },
      desc: { zh: '做縮合聚合，讓數量平均聚合度 Xn 達到 20 以上。', en: 'Run a condensation polymerisation until the number-average degree of polymerisation Xn is 20 or more.' },
      check: function (ev) { const d = any(ev); return isCond(d) && d.Xn >= 20; }
    },
    {
      id: 'polymerization-6', level: 4,
      title: { zh: '水留在瓶裡', en: 'The water stays in' },
      desc: { zh: '做耐綸-66，從頭到尾不除水，讓反應達到平衡（反應程度停在密閉時的平衡值）。', en: 'Make nylon-6,6 without ever removing the water and let it reach equilibrium (the extent of reaction settles at the closed-flask value).' },
      check: function (ev) { const d = tk(ev); return isCond(d) && d.pair === 'nylon66' && d.closedAll && d.atEq === true; }
    },
    {
      id: 'polymerization-7', level: 5,
      title: { zh: '把水抽走', en: 'Pump the water off' },
      desc: { zh: '縮合聚合先在密閉的瓶中達到平衡，再打開減壓除水，讓 Xn 變成平衡時的 3 倍以上。', en: 'Let a condensation polymerisation reach equilibrium in a closed flask, then switch on water removal and make Xn at least 3 times its equilibrium value.' },
      check: function (ev) { const d = tk(ev); return isCond(d) && fin(d.eqXn) && d.dry && d.Xn >= 3 * d.eqXn; }
    },
    {
      id: 'polymerization-8', level: 6,
      title: { zh: '兩種長法', en: 'Two ways to grow' },
      desc: { zh: '在紀錄表裡記下：一列加成聚合（轉化率 ≤ 10%、Xn ≥ 100），一列縮合聚合（反應程度 ≥ 90%、Xn ≤ 10）。', en: 'Record one addition run (conversion ≤ 10%, Xn ≥ 100) and one condensation run (extent of reaction ≥ 90%, Xn ≤ 10) in the table.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d) return false;
        const a = d.rows.some(function (r) { return r.mode === 'add' && r.conv <= 0.10 && r.Xn >= 100; });
        const c = d.rows.some(function (r) { return r.mode === 'cond' && r.conv >= 0.90 && r.Xn <= 10; });
        return a && c;
      }
    },
    {
      id: 'polymerization-9', level: 6,
      title: { zh: '起始劑多，鏈反而短', en: 'More initiator, shorter chains' },
      desc: { zh: '同一種單體、同一種終止方式，記下兩列加成聚合：起始劑相差 4 倍以上，轉化率都在 40%–60%，起始劑少的那列 Xn 是另一列的 1.6 倍以上。', en: 'Same monomer, same termination: record two addition runs whose initiator amounts differ by a factor of 4 or more, both at 40–60% conversion, with Xn of the low-initiator run at least 1.6 times the other.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d) return false;
        return pair(d.rows, function (a, b) {
          return a.mode === 'add' && b.mode === 'add' && a.mon === b.mon && a.term === b.term &&
            a.conv >= 0.4 && a.conv <= 0.6 && b.conv >= 0.4 && b.conv <= 0.6 &&
            b.init >= 3.9 * a.init && a.Xn >= 1.6 * b.Xn;
        });
      }
    },
    {
      id: 'polymerization-10', level: 7,
      title: { zh: '多出來的那一邊', en: 'The side with extra' },
      desc: { zh: '兩種單體的縮合聚合，讓莫耳比 r ≤ 0.95，除水並讓少的那種官能基反應 99.5% 以上。', en: 'In a two-monomer condensation polymerisation, use a mole ratio r ≤ 0.95, remove the water and react at least 99.5% of the scarcer functional group.' },
      check: function (ev) { const d = tk(ev); return isCond(d) && !d.ab && d.r <= 0.95 && d.dry && d.conv >= 0.995; }
    },
    {
      id: 'polymerization-11', level: 8,
      title: { zh: '兩條變一條', en: 'Two become one' },
      desc: { zh: '用結合終止做加成聚合，在轉化率 3%–15% 時暫停，讓分散度 Đ 在 1.40–1.65 之間。', en: 'With termination by combination, pause an addition polymerisation at 3–15% conversion with the dispersity Đ between 1.40 and 1.65.' },
      check: function (ev) { const d = hold(ev); return isAdd(d) && d.term === 'comb' && d.conv >= 0.03 && d.conv <= 0.15 && d.PDI >= 1.40 && d.PDI <= 1.65; }
    },
    {
      id: 'polymerization-12', level: 9,
      title: { zh: '量身訂做的耐綸', en: 'Nylon made to measure' },
      desc: { zh: '調整莫耳比，除水做耐綸-66 到反應程度 99.95% 以上，讓 Mn 在 10 000 g/mol 的 ±3% 以內。', en: 'Adjust the mole ratio and make nylon-6,6 with water removal to at least 99.95% reaction, so that Mn is within ±3% of 10 000 g/mol.' },
      check: function (ev) { const d = any(ev); return isCond(d) && d.pair === 'nylon66' && d.dry && d.conv >= 0.9995 && Math.abs(d.Mn - 10000) <= 300; }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'polymerization-h1', level: 3, hidden: true,
      riddle: { zh: '火種燒完了，柴還堆著。', en: 'The kindling is gone; the logs are still piled up.' },
      check: function (ev) { const d = tk(ev); return isAdd(d) && d.deadEnd === true && d.conv >= 0.80 && d.conv <= 0.92; }
    },
    {
      id: 'polymerization-h2', level: 4, hidden: true,
      riddle: { zh: '牽起的手，總有一半又鬆開。', en: 'Of the hands that join, half let go again.' },
      check: function (ev) { const d = tk(ev); return isCond(d) && (d.pair === 'pet' || d.pair === 'pla') && d.closedAll && d.atEq === true; }
    },
    {
      id: 'polymerization-h3', level: 5, hidden: true,
      riddle: { zh: '一滴也沒漏，瓶子卻空了五分之一。', en: 'Not a drop spilled, yet a fifth of the flask is empty.' },
      check: function (ev) { const d = any(ev); return isAdd(d) && d.mon === 'mma' && fin(d.shrink) && d.shrink >= 0.199; }
    },
    {
      id: 'polymerization-h4', level: 6, hidden: true,
      riddle: { zh: '兩個半途停下的，握手就成了一個。', en: 'Two that stop half-way become one by shaking hands.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d) return false;
        return pair(d.rows, function (a, b) {
          return a.mode === 'add' && b.mode === 'add' && a.mon === b.mon && a.term === 'comb' && b.term === 'disp' &&
            Math.abs(a.init - b.init) <= 1e-9 + 1e-6 * a.init && a.conv <= 0.5 && b.conv <= 0.5 && Math.abs(a.conv - b.conv) <= 0.05 &&
            b.Xn > 0 && a.Xn / b.Xn >= 1.85 && a.Xn / b.Xn <= 2.15;
        });
      }
    },
    {
      id: 'polymerization-h5', level: 5, hidden: true,
      riddle: { zh: '各自停下的，長短最參差。', en: 'Those that stop on their own differ the most in length.' },
      check: function (ev) { const d = hold(ev); return isAdd(d) && d.term === 'disp' && d.conv >= 0.03 && d.conv <= 0.15 && d.PDI >= 1.85 && d.PDI <= 2.15; }
    },
    {
      id: 'polymerization-h6', level: 7, hidden: true,
      riddle: { zh: '三個一組，再也長不大。', en: 'Threes, and they will never grow up.' },
      check: function (ev) {
        const d = any(ev);
        return isCond(d) && !d.ab && (Math.abs(d.q - 2) <= 0.002 || Math.abs(d.q - 0.5) <= 0.0005) && d.conv >= 0.999 && Math.abs(d.Xn - 3) <= 0.03;
      }
    },
    {
      id: 'polymerization-h7', level: 6, hidden: true,
      riddle: { zh: '百倍的火種，換不到百倍的快。', en: 'A hundred times the kindling does not buy a hundred times the speed.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d) return false;
        return pair(d.rows, function (a, b) {
          if (!(a.mode === 'add' && b.mode === 'add' && a.mon === b.mon && fin(a.t50) && fin(b.t50) && a.t50 > 0 && b.t50 > 0)) return false;
          const k = b.init / a.init;
          if (!(k >= 25)) return false;
          const v = (a.t50 / b.t50) / Math.sqrt(k);
          return v >= 0.7 && v <= 1.6;
        });
      }
    },
    {
      id: 'polymerization-h8', level: 8, hidden: true,
      riddle: { zh: '一百個裡多出一個，就再也牽不到底。', en: 'One extra in a hundred, and the chain can never reach the end.' },
      check: function (ev) {
        const d = tk(ev);
        return isCond(d) && d.pair === 'nylon66' && d.ended && d.dry && d.r >= 0.989 && d.r <= 0.991 && d.Xn >= 150 && d.Xn <= 200;
      }
    },
    {
      id: 'polymerization-h9', level: 9, hidden: true,
      riddle: { zh: '一個靠接力，一個靠握手，秤起來一樣重。', en: 'One by relay, one by handshake, and they weigh the same.' },
      check: function (ev) {
        const d = rec(ev);
        if (!d) return false;
        return pair(d.rows, function (a, b) {
          return a.mode === 'add' && b.mode === 'cond' && a.Mn >= 20000 && b.Mn >= 20000 && b.conv >= 0.999 && Math.abs(a.Mn - b.Mn) <= 0.01 * Math.max(a.Mn, b.Mn);
        });
      }
    },
    {
      id: 'polymerization-h10', level: 10, hidden: true,
      riddle: { zh: '半途而止，不多不少。', en: 'Stopped half-way, not a bit more, not a bit less.' },
      check: function (ev) { const d = tk(ev); return isAdd(d) && d.deadEnd === true && Math.abs(d.conv - 0.5) <= 0.015; }
    }
  ]);
})();
