/* missions/buffer-solutions.js — 緩衝溶液的任務（一般任務星星數 = 等級；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/buffer-solutions.js 只在使用者操作之後回報；資料由 BufCore.mixData／addData 產生）：
  //   'mix'：配好一杯新的（改了緩衝系統、濃度、體積或對照）{ sys（ac 醋酸、ph 磷酸、nh 氨）, pKa, pKas, CHA, CA（M）, V0（mL）,
  //       nHA0, nA0, nT0（mmol）, comp（water same dil10 acid base）, pH, pHHH（亨德森公式）, pHc（對照的 pH）, beta, betaC }
  //   'add'：每加入一次（兩杯加入一樣的東西）{ …同上的配方欄位, pH0, pH, dpH（緩衝溶液）, pHc0, pHc, dpHc（對照）,
  //       acid, base（累計加入的 HCl、NaOH mmol）, net（base − acid）, water（加入的水 mL）, V, f（V/V0）,
  //       maxAcid, maxBase（這一杯曾經淨加入最多的酸、鹼 mmol）, pHmin, pHmax（緩衝溶液 pH 的範圍）,
  //       kind（acid base water）, step（這一次的 mmol；加水時是 mL）, sdpH, sdpHc（這一次的 pH 變化）, beta, betaC, cs }
  const E = 1e-9;
  const isM = function (ev) { return ev.type === 'mix' && ev.data; };
  const isA = function (ev) { return ev.type === 'add' && ev.data; };
  const both = function (d) { return d.CHA >= 0.01 - E && d.CA >= 0.01 - E; };
  const onlyWater = function (d) { return d.kind === 'water' && d.acid === 0 && d.base === 0; };
  const pushed = function (d) { return d.kind === 'acid' || d.kind === 'base'; };

  LabMission.register('buffer-solutions', [
    {
      id: 'buffer-solutions-1', level: 1,
      title: { zh: '一滴見真章', en: 'One drop tells' },
      desc: { zh: '右杯選「純水」，兩杯一起加入 HCl：緩衝溶液的 pH 變化不超過 0.05，純水卻掉了 2 以上。', en: 'Choose “Pure water” for the right beaker and add HCl to both: the buffer’s pH moves by no more than 0.05 while the water’s falls by more than 2.' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.comp === 'water' && d.kind === 'acid' && d.base === 0 && Math.abs(d.dpH) <= 0.05 && d.dpHc <= -2; }
    },
    {
      id: 'buffer-solutions-2', level: 2,
      title: { zh: '加水也不怕', en: 'Water won’t shake it' },
      desc: { zh: '右杯選「同 pH 的強酸或強鹼」，只加水、稀釋到原來體積的 2 倍以上：緩衝溶液的 pH 變化不超過 0.02，右杯卻改變 0.25 以上。', en: 'Choose “Same pH, no buffer” for the right beaker and only add water, to at least twice the starting volume: the buffer’s pH moves by no more than 0.02, the right beaker’s by more than 0.25.' },
      check: function (ev) { const d = ev.data; return isA(ev) && onlyWater(d) && d.comp === 'same' && d.f >= 2 - E && Math.abs(d.dpH) <= 0.02 && Math.abs(d.dpHc) >= 0.25; }
    },
    {
      id: 'buffer-solutions-3', level: 3,
      title: { zh: '配出 pH 5.00', en: 'Make pH 5.00' },
      desc: { zh: '用醋酸＋醋酸鈉配出 pH 5.00 的緩衝溶液（誤差 0.01 以內；兩種濃度都至少 0.010 M）。', en: 'Use acetic acid + sodium acetate to make a buffer of pH 5.00 (within 0.01; both concentrations at least 0.010 M).' },
      check: function (ev) { const d = ev.data; return isM(ev) && d.sys === 'ac' && both(d) && Math.abs(d.pH - 5) <= 0.015; }
    },
    {
      id: 'buffer-solutions-4', level: 4,
      title: { zh: '細胞喜歡的 pH', en: 'The pH cells like' },
      desc: { zh: '選對酸鹼對，配出 pH 7.40 的磷酸鹽緩衝溶液（誤差 0.01 以內；兩種濃度都至少 0.010 M）。', en: 'Choose the right pair and make a phosphate buffer of pH 7.40 (within 0.01; both concentrations at least 0.010 M).' },
      check: function (ev) { const d = ev.data; return isM(ev) && d.sys === 'ph' && both(d) && Math.abs(d.pH - 7.4) <= 0.015; }
    },
    {
      id: 'buffer-solutions-5', level: 4,
      title: { zh: '鹼性的緩衝溶液', en: 'A basic buffer' },
      desc: { zh: '用氯化銨＋氨配出 pH 10.00 的緩衝溶液（誤差 0.01 以內；兩種濃度都至少 0.010 M）。', en: 'Use ammonium chloride + ammonia to make a buffer of pH 10.00 (within 0.01; both concentrations at least 0.010 M).' },
      check: function (ev) { const d = ev.data; return isM(ev) && d.sys === 'nh' && both(d) && Math.abs(d.pH - 10) <= 0.015; }
    },
    {
      id: 'buffer-solutions-6', level: 5,
      title: { zh: '濃度決定容量', en: 'Concentration is capacity' },
      desc: { zh: '右杯選「同一緩衝溶液稀釋 10 倍」，加入酸或鹼：稀的那杯 pH 改變 0.5 以上，緩衝溶液卻不超過 0.1。', en: 'Choose “The same buffer ÷ 10” for the right beaker and add acid or base: the dilute one moves by more than 0.5 while the buffer moves by no more than 0.1.' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.comp === 'dil10' && pushed(d) && Math.abs(d.dpHc) >= 0.5 && Math.abs(d.dpH) <= 0.1; }
    },
    {
      id: 'buffer-solutions-7', level: 6,
      title: { zh: '剛好降一個 pH', en: 'Exactly one pH lower' },
      desc: { zh: '緩衝溶液的弱酸與共軛鹼合計至少 2 mmol，起點 pH 與 pKa 相差 0.5 以內。只加 HCl，讓它的 pH 比起點剛好低 1.00（誤差 0.02 以內）。', en: 'Start from a buffer with at least 2 mmol of weak acid and conjugate base in total and a pH within 0.5 of its pKa. Add only HCl and bring its pH exactly 1.00 below where it started (within 0.02).' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.kind === 'acid' && d.base === 0 && d.nT0 >= 2 - E && Math.abs(d.pH0 - d.pKa) <= 0.5 && Math.abs(d.dpH + 1) <= 0.02; }
    },
    {
      id: 'buffer-solutions-8', level: 7,
      title: { zh: '用盡共軛鹼', en: 'Use up the conjugate base' },
      desc: { zh: '只加 HCl，加入的莫耳數剛好等於緩衝溶液裡共軛鹼的莫耳數（誤差 1% 以內；共軛鹼至少 1 mmol）：緩衝溶液在這裡失效。', en: 'Add only HCl, exactly as many millimoles as there was conjugate base in the buffer (within 1%; at least 1 mmol of conjugate base): this is where the buffer gives out.' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.kind === 'acid' && d.base === 0 && d.nA0 >= 1 - E && Math.abs(d.acid - d.nA0) <= 0.01 * d.nA0 + E; }
    },
    {
      id: 'buffer-solutions-9', level: 8,
      title: { zh: '兩面都守住', en: 'Hold both ways' },
      desc: { zh: '同一杯緩衝溶液，先後承受淨加入 2.00 mmol 的 HCl 與淨加入 2.00 mmol 的 NaOH，整個過程 pH 都留在起點 ±0.10 之內。', en: 'In one buffer, reach a net 2.00 mmol of HCl added and, at another time, a net 2.00 mmol of NaOH added, with the pH staying within ±0.10 of where it started the whole time.' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.maxAcid >= 2 - E && d.maxBase >= 2 - E && d.pHmax - d.pH0 <= 0.1 + E && d.pH0 - d.pHmin <= 0.1 + E; }
    },
    {
      id: 'buffer-solutions-10', level: 9,
      title: { zh: 'PBS 的考驗', en: 'The PBS test' },
      desc: { zh: '配一杯 pH 7.40（±0.02）的磷酸鹽緩衝溶液，先後淨加入 5.00 mmol 的 HCl 與 5.00 mmol 的 NaOH，pH 始終留在 7.20～7.60 之間。', en: 'Make a phosphate buffer of pH 7.40 (±0.02), then reach a net 5.00 mmol of HCl and a net 5.00 mmol of NaOH added, keeping the pH between 7.20 and 7.60 throughout.' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.sys === 'ph' && Math.abs(d.pH0 - 7.4) <= 0.02 && d.maxAcid >= 5 - E && d.maxBase >= 5 - E && d.pHmin >= 7.2 && d.pHmax <= 7.6; }
    },
    {
      id: 'buffer-solutions-11', level: 10,
      title: { zh: '最省的配方', en: 'The leanest recipe' },
      desc: { zh: '完成「兩面都守住」，但弱酸與共軛鹼加起來不超過 36.0 mmol——理論上至少要 34.9 mmol，比例也要配得剛好。', en: 'Complete “Hold both ways” with no more than 36.0 mmol of weak acid and conjugate base together — in theory you need at least 34.9 mmol, and the ratio has to be just right.' },
      check: function (ev) { const d = ev.data; return isA(ev) && d.nT0 <= 36 + E && d.maxAcid >= 2 - E && d.maxBase >= 2 - E && d.pHmax - d.pH0 <= 0.1 + E && d.pH0 - d.pHmin <= 0.1 + E; }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'buffer-solutions-h1', level: 3, hidden: true,
      riddle: { zh: '和清水一樣不偏不倚，脾氣卻比清水硬得多。', en: 'As even-handed as plain water, and far more stubborn.' },
      // 磷酸鹽配出 pH 7.00（中性的緩衝溶液）
      check: function (ev) { const d = ev.data; return isM(ev) && d.sys === 'ph' && both(d) && Math.abs(d.pH - 7) <= 0.01; }
    },
    {
      id: 'buffer-solutions-h2', level: 5, hidden: true,
      riddle: { zh: '身邊的同伴一多，它反而捨不得放手。', en: 'With so many of its own kind around, it would rather not let go.' },
      // 同離子效應：醋酸（至少 0.010 M）加了醋酸鈉，[H+] 剛好變成「只有醋酸」的 1/1000（pH 高 3.00 ± 0.02）
      check: function (ev) { const d = ev.data; return isM(ev) && d.sys === 'ac' && d.comp === 'acid' && d.CHA >= 0.01 - E && Math.abs(d.pH - d.pHc - 3) <= 0.02; }
    },
    {
      id: 'buffer-solutions-h3', level: 4, hidden: true,
      riddle: { zh: '盾牌全部翻到另一面，剩下的只有它自己的脾氣。', en: 'Every shield turned to its other face; all that is left is its own temper.' },
      // 醋酸或氨的緩衝溶液只加 NaOH，莫耳數剛好等於弱酸（誤差 1%）：變成共軛鹼的溶液（醋酸鈉偏鹼、氨水）
      // （磷酸不算：它往 pKa3 走的路上一定經過這一點，會和 h5 一起完成）
      check: function (ev) { const d = ev.data; return isA(ev) && (d.sys === 'ac' || d.sys === 'nh') && d.kind === 'base' && d.acid === 0 && d.nHA0 >= 1 - E && Math.abs(d.base - d.nHA0) <= 0.01 * d.nHA0 + E; }
    },
    {
      id: 'buffer-solutions-h4', level: 7, hidden: true,
      riddle: { zh: '配得再準，水能載舟；淡到某個地步，也能覆舟。', en: 'However precisely it is made, water carries the boat; thin enough, it can also overturn it.' },
      // 起點 pH 精準在 pKa ± 0.02 的極稀緩衝溶液，只加水（2 倍以上）：pH 改變 0.10 以上（亨德森公式失效）
      check: function (ev) { const d = ev.data; return isA(ev) && onlyWater(d) && Math.abs(d.pH0 - d.pKa) <= 0.02 && d.f >= 2 - E && Math.abs(d.dpH) >= 0.1; }
    },
    {
      id: 'buffer-solutions-h5', level: 8, hidden: true,
      riddle: { zh: '城門破了，後面還有一道牆。', en: 'The gate has fallen, but there is another wall behind it.' },
      // 磷酸鹽加很多酸或鹼，走到另一段緩衝區：pH = pKa1 或 pKa3（±0.05）
      check: function (ev) {
        const d = ev.data;
        return isA(ev) && d.sys === 'ph' && pushed(d) && (Math.abs(d.pH - d.pKas[0]) <= 0.05 || Math.abs(d.pH - d.pKas[2]) <= 0.05);
      }
    },
    {
      id: 'buffer-solutions-h6', level: 6, hidden: true,
      riddle: { zh: '稀了四倍，它只肯退一半的路。', en: 'Four times thinner, and it gives up only half the way.' },
      // 右杯只有弱酸（醋酸或氯化銨），只加水稀釋 4 倍以上：右杯 pH 升高 ½ log f（±0.02）
      check: function (ev) {
        const d = ev.data;
        return isA(ev) && onlyWater(d) && d.comp === 'acid' && (d.sys === 'ac' || d.sys === 'nh') && d.f >= 4 - E && Math.abs(d.dpHc - 0.5 * Math.log10(d.f)) <= 0.02;
      }
    },
    {
      id: 'buffer-solutions-h7', level: 8, hidden: true,
      riddle: { zh: '一個人身兼兩職，再怎麼沖淡也面不改色。', en: 'It plays both parts at once, and however much you water it down, its face does not change.' },
      // 兩性物質：右杯只有 NaH2PO4，只加水稀釋 4 倍以上，右杯 pH 改變不超過 0.05
      check: function (ev) { const d = ev.data; return isA(ev) && onlyWater(d) && d.sys === 'ph' && d.comp === 'acid' && d.f >= 4 - E && Math.abs(d.dpHc) <= 0.05; }
    },
    {
      id: 'buffer-solutions-h8', level: 7, hidden: true,
      riddle: { zh: '歪著出發，正著站好：這時它最難被推倒。', en: 'Set off leaning, end up standing straight: now it is hardest to knock over.' },
      // 起點離 pKa 1 以上，用強酸或強鹼調到 pH = pKa（±0.005）：緩衝容量最大的地方
      check: function (ev) { const d = ev.data; return isA(ev) && pushed(d) && Math.abs(d.pH0 - d.pKa) >= 1 && Math.abs(d.pH - d.pKa) <= 0.005; }
    },
    {
      id: 'buffer-solutions-h9', level: 9, hidden: true,
      riddle: { zh: '在不屬於它的國度裡找到中立的土地，差一滴就錯過。', en: 'In a land that is not its own, it finds neutral ground — one drop more and it is gone.' },
      // 醋酸或氨的緩衝溶液（起點在有效範圍內）加酸或鹼，讓 pH 剛好 7.00（±0.01），已在緩衝範圍外的陡坡上
      check: function (ev) {
        const d = ev.data;
        return isA(ev) && (d.sys === 'ac' || d.sys === 'nh') && pushed(d) && Math.abs(d.pH0 - d.pKa) <= 1 && Math.abs(d.pH - 7) <= 0.01;
      }
    },
    {
      id: 'buffer-solutions-h10', level: 10, hidden: true,
      riddle: { zh: '先退半步，等風吹過，剛好停在鏡子的另一邊。', en: 'Step back half a pace, let the wind blow past, and stop exactly on the other side of the mirror.' },
      // 只往一個方向加，加入量是總量的 20%～50%；起點與終點對稱地落在 pKa 兩側（|(pH − pKa) + (pH0 − pKa)| ≤ 0.01）
      check: function (ev) {
        const d = ev.data;
        if (!isA(ev) || !pushed(d) || (d.acid > 0 && d.base > 0)) return false;
        const x = d.acid + d.base;
        return x >= 0.2 * d.nT0 - E && x <= 0.5 * d.nT0 + E && Math.abs(d.pH0 - d.pKa) >= 0.05 && Math.abs((d.pH - d.pKa) + (d.pH0 - d.pKa)) <= 0.01;
      }
    }
  ]);
})();
