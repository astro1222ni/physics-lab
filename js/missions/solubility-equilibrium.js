/* missions/solubility-equilibrium.js — 溶解平衡與 Ksp 的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/solubility-equilibrium.js 只在使用者加入試劑或水之後回報，資料由核心的 settle() 整理）：
  //   'mix'：{ act（'soln'／'solid'／'water'）, what（試劑或固體代號）, V（mL）, N（各離子總莫耳數，含沉澱）, p（各沉澱 mol，只列 > 0 的）,
  //           c（各離子濃度 M）, Qr（各相關鹽的 Q / Ksp）, appeared, vanished（這一次新出現、消失的沉澱）,
  //           used（這一杯用過的東西：'w' 水、's:<溶液>'、'x:<固體>'）, had（這一杯出現過的沉澱）,
  //           agAtAgCl（AgCl 第一次出現時 Ag 的總量）, sat（這一杯做成過的「只有一種固體加水」的飽和溶液）, sats（本頁做成過的，跨杯累積） }
  const mx = function (ev) { return ev.type === 'mix' && ev.data ? ev.data : null; };
  const only = function (d, keys) { return d.used.every(function (k) { return keys.indexOf(k) >= 0; }); };
  const fromSolns = function (d) { return d.used.every(function (k) { return k === 'w' || k.indexOf('s:') === 0; }); };
  const S0_AGCL = Math.sqrt(1.77e-10);   // AgCl 在純水中的莫耳溶解度

  LabMission.register('solubility-equilibrium', [
    {
      id: 'solubility-equilibrium-1', level: 1,
      title: { zh: '第一次沉澱', en: 'First precipitate' },
      desc: { zh: '把兩種溶液加在一起，讓燒杯裡出現沉澱。', en: 'Mix two solutions so that a precipitate forms in the beaker.' },
      check: function (ev) { const d = mx(ev); return !!d && d.act === 'soln' && d.appeared.length > 0; }
    },
    {
      id: 'solubility-equilibrium-2', level: 2,
      title: { zh: '飽和的氯化銀溶液', en: 'Saturated silver chloride' },
      desc: { zh: '只用氯化銀固體和水，做出底部還留著固體的飽和溶液，讀出 [Ag+]。', en: 'Using only solid silver chloride and water, make a saturated solution with solid left at the bottom, and read [Ag+].' },
      check: function (ev) { const d = mx(ev); return !!d && only(d, ['w', 'x:AgCl']) && d.p.AgCl > 0 && Math.abs(d.c.Ag / S0_AGCL - 1) < 0.01; }
    },
    {
      id: 'solubility-equilibrium-3', level: 3,
      title: { zh: '兩種離子都在，卻不沉澱', en: 'Both ions there, no precipitate' },
      desc: { zh: '讓溶液裡 [Ag+] 和 [Cl−] 都至少 0.000002 M，卻沒有氯化銀沉澱。', en: 'Make [Ag+] and [Cl−] both at least 0.000002 M without any silver chloride precipitate.' },
      check: function (ev) { const d = mx(ev); return !!d && !(d.p.AgCl > 0) && d.c.Ag >= 2e-6 && d.c.Cl >= 2e-6; }
    },
    {
      id: 'solubility-equilibrium-4', level: 4,
      title: { zh: '同離子效應', en: 'The common-ion effect' },
      desc: { zh: '燒杯裡有氯化銀沉澱時，加入共同離子，把 [Ag+] 壓到純水中飽和時的 1/100 以下。', en: 'With silver chloride precipitate in the beaker, add a common ion until [Ag+] is below 1/100 of its value in a saturated solution in pure water.' },
      check: function (ev) { const d = mx(ev); return !!d && d.p.AgCl > 0 && d.c.Ag <= S0_AGCL / 100; }
    },
    {
      id: 'solubility-equilibrium-5', level: 5,
      title: { zh: '剛好不沉澱', en: 'Just short of precipitating' },
      desc: { zh: '只用溶液，讓某一種難溶鹽的離子積 Q 達到 Ksp 的 95%～100%，但還沒有沉澱。', en: 'Using solutions only, bring the ion product Q of some sparingly soluble salt to 95–100% of its Ksp without any of it precipitating.' },
      check: function (ev) {
        const d = mx(ev);
        if (!d || !fromSolns(d)) return false;
        return Object.keys(d.Qr).some(function (k) { return !(d.p[k] > 0) && d.Qr[k] >= 0.95 && d.Qr[k] <= 1; });
      }
    },
    {
      id: 'solubility-equilibrium-6', level: 6,
      title: { zh: 'Ksp 小，溶解度卻大', en: 'Smaller Ksp, yet more soluble' },
      desc: { zh: '分別做出氯化銀和鉻酸銀在純水中的飽和溶液（各用一杯，只加那種固體和水），比較兩者的 Ksp 與 [Ag+]。', en: 'Make saturated solutions of silver chloride and of silver chromate in pure water (one beaker each, only that solid and water), and compare their Ksp and [Ag+].' },
      check: function (ev) { const d = mx(ev); return !!d && d.sats.indexOf('AgCl') >= 0 && d.sats.indexOf('Ag2CrO4') >= 0; }
    },
    {
      id: 'solubility-equilibrium-7', level: 7,
      title: { zh: '加水溶光最後一粒', en: 'Water away the last grain' },
      desc: { zh: '有沉澱的燒杯裡只加水，讓沉澱剛好全部溶解：溶完的那一刻，溶液仍要達到飽和的 95% 以上（Q ≥ 0.95 Ksp）。', en: 'Add only water to a beaker with a precipitate until it just dissolves completely: at that moment the solution must still be at least 95% saturated (Q ≥ 0.95 Ksp).' },
      check: function (ev) {
        const d = mx(ev);
        return !!d && d.act === 'water' && d.vanished.some(function (k) { return d.Qr[k] >= 0.95; });
      }
    },
    {
      id: 'solubility-equilibrium-8', level: 8,
      title: { zh: '分步沉澱', en: 'Fractional precipitation' },
      desc: { zh: '溶液裡有 Cl− 和 I− 各至少 0.1 mmol。加 Ag+ 讓 99% 以上的 I− 變成碘化銀沉澱，而氯化銀還沒有出現。', en: 'With at least 0.1 mmol each of Cl− and I− in solution, add Ag+ so that over 99% of the I− precipitates as silver iodide while no silver chloride has formed yet.' },
      check: function (ev) {
        const d = mx(ev);
        return !!d && d.N.Cl >= 1e-4 && d.N.I >= 1e-4 && !(d.p.AgCl > 0) && (d.p.AgI || 0) >= 0.99 * d.N.I;
      }
    },
    {
      id: 'solubility-equilibrium-9', level: 9,
      title: { zh: '莫耳法', en: 'The Mohr method' },
      desc: { zh: '在含 Cl−（至少 0.1 mmol）和少量鉻酸根的溶液中滴入硝酸銀：紅棕色的鉻酸銀第一次出現時，加入的 Ag+ 和 Cl− 的莫耳數相差不超過 1%。', en: 'Titrate a solution containing Cl− (at least 0.1 mmol) and a little chromate with silver nitrate: when red-brown silver chromate first appears, the moles of Ag+ added must be within 1% of the moles of Cl−.' },
      check: function (ev) {
        const d = mx(ev);
        return !!d && d.act === 'soln' && d.what === 'AgNO3' && d.appeared.indexOf('Ag2CrO4') >= 0 && d.N.Cl >= 1e-4 && Math.abs(d.N.Ag / d.N.Cl - 1) <= 0.01;
      }
    },
    {
      id: 'solubility-equilibrium-10', level: 10,
      title: { zh: '恰到好處的指示劑', en: 'Just the right indicator' },
      desc: { zh: '再做一次莫耳法，這次鉻酸銀第一次出現時，Ag+ 和 Cl− 的莫耳數相差不超過 0.05%。要選對鉻酸根的濃度，也要一滴一滴地加。', en: 'Do the Mohr titration again, this time with Ag+ within 0.05% of Cl− when silver chromate first appears. You will need the right chromate concentration and to add the titrant drop by drop.' },
      check: function (ev) {
        const d = mx(ev);
        return !!d && d.act === 'soln' && d.what === 'AgNO3' && d.appeared.indexOf('Ag2CrO4') >= 0 && d.N.Cl >= 1e-4 && Math.abs(d.N.Ag / d.N.Cl - 1) <= 0.0005;
      }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'solubility-equilibrium-h1', level: 3, hidden: true,
      riddle: { zh: '脫下白衣，換上一件更合身的。', en: 'It took off its white coat and put on one that fits better.' },
      // 沉澱轉化：AgCl 出現後不再加 Ag+，加 I− 讓 AgCl 全部轉成 AgI
      check: function (ev) {
        const d = mx(ev);
        return !!d && d.act === 'soln' && d.what === 'KI' && d.had.AgCl && !(d.p.AgCl > 0) && d.p.AgI > 0 && d.agAtAgCl != null && Math.abs((d.N.Ag || 0) - d.agAtAgCl) <= 1e-12;
      }
    },
    {
      id: 'solubility-equilibrium-h2', level: 4, hidden: true,
      riddle: { zh: '一個牽著兩個，誰也沒有落單。', en: 'One took two by the hand, and nobody was left alone.' },
      // PbI2 恰好照 1 : 2 沉澱：只用硝酸鉛與碘化鉀，I− 總量 / Pb2+ 總量 = 2（±1%），沉澱至少 0.1 mmol
      check: function (ev) {
        const d = mx(ev);
        return !!d && only(d, ['w', 's:PbNO32', 's:KI']) && d.p.PbI2 >= 1e-4 && Math.abs(d.N.I / d.N.Pb / 2 - 1) <= 0.01;
      }
    },
    {
      id: 'solubility-equilibrium-h3', level: 5, hidden: true,
      riddle: { zh: '把毒鎖進一塊白石頭。', en: 'Lock the poison inside a white stone.' },
      // 鋇中毒的解毒：只用硝酸鋇與硫酸鈉，Ba2+ 至少 0.1 mmol，讓 [Ba2+] ≤ 10^−7 M（硫酸鋇沉澱）
      check: function (ev) {
        const d = mx(ev);
        return !!d && only(d, ['w', 's:BaNO32', 's:Na2SO4']) && d.N.Ba >= 1e-4 && d.p.BaSO4 > 0 && d.c.Ba <= 1e-7;
      }
    },
    {
      id: 'solubility-equilibrium-h4', level: 6, hidden: true,
      riddle: { zh: '兩張床，睡著同一個旅人。', en: 'Two beds, and one traveller asleep in both.' },
      // AgCl 與 AgBr 同時沉澱（共用 Ag+；此時 [Cl−]/[Br−] 固定為 Ksp 比 ≈ 331）
      check: function (ev) {
        const d = mx(ev);
        return !!d && only(d, ['w', 's:AgNO3', 's:NaCl', 's:NaBr']) && d.p.AgCl >= 1e-6 && d.p.AgBr >= 1e-6;
      }
    },
    {
      id: 'solubility-equilibrium-h5', level: 7, hidden: true,
      riddle: { zh: '兩個黃色的影子，只帶走一個。', en: 'Two yellow shadows, and only one is taken.' },
      // 鉻酸根分離 Pb2+ 與 Ba2+：兩者各至少 0.1 mmol，Pb2+ 沉澱 99.9% 以上而鉻酸鋇還沒出現
      check: function (ev) {
        const d = mx(ev);
        return !!d && only(d, ['w', 's:PbNO32', 's:BaNO32', 's:K2CrO4']) && d.N.Pb >= 1e-4 && d.N.Ba >= 1e-4 && !(d.p.BaCrO4 > 0) && (d.p.PbCrO4 || 0) >= 0.999 * d.N.Pb;
      }
    },
    {
      id: 'solubility-equilibrium-h6', level: 8, hidden: true,
      riddle: { zh: '三兄弟住在同一個屋簷下，誰也沒有搬走。', en: 'Three brothers under one roof, and none of them has moved out.' },
      // AgCl、AgBr、AgI 三種沉澱同時存在
      check: function (ev) {
        const d = mx(ev);
        return !!d && only(d, ['w', 's:AgNO3', 's:NaCl', 's:NaBr', 's:KI']) && d.p.AgCl >= 1e-7 && d.p.AgBr >= 1e-7 && d.p.AgI >= 1e-7;
      }
    },
    {
      id: 'solubility-equilibrium-h7', level: 9, hidden: true,
      riddle: { zh: '水只帶走了比較不怕水的那一個。', en: 'The water carried off only the one less afraid of it.' },
      // 同時有 AgCl 與 AgI 沉澱的燒杯只加水：AgCl 全部溶掉，AgI 還在
      check: function (ev) {
        const d = mx(ev);
        return !!d && d.act === 'water' && d.vanished.indexOf('AgCl') >= 0 && d.p.AgI > 0;
      }
    },
    {
      id: 'solubility-equilibrium-h8', level: 10, hidden: true,
      riddle: { zh: '站在懸崖邊，一步也沒有踏出去。', en: 'At the very edge of the cliff, without taking a single step.' },
      // 只用溶液，碘化鉛的 Q 達到 Ksp 的 99.9%～100%，卻還沒有沉澱
      check: function (ev) {
        const d = mx(ev);
        return !!d && fromSolns(d) && !(d.p.PbI2 > 0) && d.Qr.PbI2 >= 0.999 && d.Qr.PbI2 <= 1;
      }
    },
    {
      id: 'solubility-equilibrium-h9', level: 5, hidden: true,
      riddle: { zh: '雲來了，又被雨帶走。', en: 'The cloud came, and the rain took it away.' },
      // 只用硝酸銀、氯化鈉與水：先生成氯化銀，再只加水讓它全部溶回去
      check: function (ev) {
        const d = mx(ev);
        return !!d && d.act === 'water' && only(d, ['w', 's:AgNO3', 's:NaCl']) && d.vanished.indexOf('AgCl') >= 0;
      }
    },
    {
      id: 'solubility-equilibrium-h10', level: 7, hidden: true,
      riddle: { zh: '連最不情願的，也終於坐了下來。', en: 'Even the most reluctant one finally sat down.' },
      // 只用硝酸銀與硫酸鈉，讓「微溶」的硫酸銀沉澱（課本溶解度規則的例外）
      check: function (ev) {
        const d = mx(ev);
        return !!d && only(d, ['w', 's:AgNO3', 's:Na2SO4']) && d.p.Ag2SO4 > 0;
      }
    }
  ]);
})();
