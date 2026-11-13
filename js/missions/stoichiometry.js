/* missions/stoichiometry.js — 化學計量與限量試劑的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/stoichiometry.js 只在使用者操作之後回報）：
  //   'tick'：每 0.5 秒 { seg, runId, started, ended, t, V, escaped, aligned, cap }
  //   'done'：反應結束 { seg, runId, lim（'Mg'／'HCl'／'both'）, m, c, VHCl, polished, nMg, nHCl, ratio, T, P, cyl, cap, V, nGas, nTheo, escaped, tEnd }
  //   'analyze'：按「計算」{ seg, runId, ended, lim, limPick, reading, Vtrue, div, cap, readErr, onScale, valid, aligned, vap, polished,
  //              T, P, Pw, m, c, VHCl, nTheo, nHCl, M, Merr, cHCl, cErr, Vm, VmErr, escaped }
  //   valid = 反應已結束、沒有氣體冒走、氣體在刻度範圍內、讀數與刻度相差 ≤ 0.5 格（擋掉亂填的數字）
  const ev2 = function (ev, type) { return ev.type === type && ev.data ? ev.data : null; };
  /** 有效的計算（讀數合理、反應結束） */
  const va = function (ev) { const d = ev2(ev, 'analyze'); return d && d.valid ? d : null; };
  /** 學生選的限量試劑是對的（剛好完全反應時兩個都算對） */
  const rightLim = function (d) { return d.lim === 'both' || d.limPick === d.lim; };
  /** 只保留同一段（全部清除之間）的紀錄 */
  const segMem = function (mem, d) { if (mem.seg !== d.seg) { mem.seg = d.seg; mem.list = []; mem.by = {}; } return mem; };
  const rel = function (a, b) { return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-15); };
  /** 同一次實驗只留最後一筆 */
  const keep = function (mem, d, item) {
    mem.list = mem.list.filter(function (x) { return x.runId !== d.runId; });
    item.runId = d.runId; mem.list.push(item);
    return mem.list;
  };

  LabMission.register('stoichiometry', [
    {
      id: 'stoichiometry-1', level: 1,
      title: { zh: '冒泡了', en: 'Bubbles!' },
      desc: { zh: '按「開始反應」，讓量筒收集到 20 mL 以上的氣體。', en: 'Press “Start” and collect at least 20 mL of gas in the cylinder.' },
      check: function (ev) { const d = ev2(ev, 'tick'); return !!d && d.started && d.V >= 20; }
    },
    {
      id: 'stoichiometry-2', level: 2,
      title: { zh: '鎂帶不見了', en: 'The ribbon is gone' },
      desc: { zh: '讓鎂帶完全溶解：鎂是限量試劑，反應做到氣泡停止。', en: 'Make the whole ribbon dissolve: magnesium is the limiting reactant, and the reaction runs until the bubbles stop.' },
      check: function (ev) { const d = ev2(ev, 'done'); return !!d && (d.lim === 'Mg' || d.lim === 'both'); }
    },
    {
      id: 'stoichiometry-3', level: 3,
      title: { zh: '鹽酸先用完', en: 'The acid runs out first' },
      desc: { zh: '讓鹽酸成為限量試劑：反應結束時，瓶底還剩下一段鎂帶。', en: 'Make the acid the limiting reactant: when the reaction is over, a piece of ribbon is still left.' },
      check: function (ev) { const d = ev2(ev, 'done'); return !!d && d.lim === 'HCl'; }
    },
    {
      id: 'stoichiometry-4', level: 3,
      title: { zh: '讀彎月面', en: 'Read the meniscus' },
      desc: { zh: '反應結束後，從放大鏡讀出量筒的刻度並按「計算」：讀數與真正的值相差不超過最小刻度的 0.2 格。', en: 'After the reaction, read the cylinder in the magnifier and press “Calculate”: your reading must be within 0.2 of the smallest division of the true value.' },
      check: function (ev) { const d = ev2(ev, 'analyze'); return !!d && d.ended && !d.escaped && d.onScale && d.readErr <= 0.2; }
    },
    {
      id: 'stoichiometry-5', level: 5,
      title: { zh: '剛好完全反應', en: 'Exactly enough' },
      desc: { zh: '用磨亮的鎂帶，調整鎂與鹽酸的量，讓兩者剛好完全反應（HCl 與 Mg 的莫耳數比在 2 的 1% 以內），並做到反應結束。', en: 'With a cleaned ribbon, adjust the magnesium and the acid so that they react exactly (mole ratio HCl : Mg within 1% of 2), and run the reaction to the end.' },
      check: function (ev) { const d = ev2(ev, 'done'); return !!d && d.polished && Math.abs(d.ratio / 2 - 1) <= 0.01; }
    },
    {
      id: 'stoichiometry-6', level: 5,
      title: { zh: '氣體的莫耳體積', en: 'Molar volume of a gas' },
      desc: { zh: '選對限量試劑，算出氫氣在標準狀況下的莫耳體積，誤差在 2% 以內。', en: 'Pick the right limiting reactant and find the molar volume of hydrogen at STP to within 2%.' },
      check: function (ev) { const d = va(ev); return !!d && rightLim(d) && Math.abs(d.VmErr) <= 0.02; }
    },
    {
      id: 'stoichiometry-7', level: 6,
      title: { zh: '找到轉折點', en: 'Find the corner' },
      desc: { zh: '鎂的質量與鹽酸濃度不變，只改鹽酸的體積，做完至少四次反應：鹽酸不足與過量各至少兩次（看「鹽酸量—產量」圖）。', en: 'Keep the mass of magnesium and the concentration of the acid fixed, change only the volume of acid, and finish at least four runs: at least two with too little acid and two with an excess (see the “Acid added–yield” graph).' },
      check: function (ev, mem) {
        const d = ev2(ev, 'done'); if (!d) return false;
        segMem(mem, d);
        const key = d.m.toFixed(5) + '|' + d.c.toFixed(4) + '|' + d.polished;
        const g = mem.by[key] || (mem.by[key] = { HCl: {}, Mg: {} });
        if (d.lim === 'HCl') g.HCl[d.VHCl.toFixed(3)] = 1; else if (d.lim === 'Mg') g.Mg[d.VHCl.toFixed(3)] = 1;
        return Object.keys(g.HCl).length >= 2 && Object.keys(g.Mg).length >= 2;
      }
    },
    {
      id: 'stoichiometry-8', level: 7,
      title: { zh: '鎂的原子量', en: 'Atomic mass of magnesium' },
      desc: { zh: '鎂是限量試劑，由收集到的氫氣算出鎂的原子量，誤差在 1% 以內。', en: 'With magnesium as the limiting reactant, find the atomic mass of magnesium from the hydrogen you collect, to within 1%.' },
      check: function (ev) { const d = va(ev); return !!d && d.limPick === 'Mg' && d.lim !== 'HCl' && Math.abs(d.Merr) <= 0.01; }
    },
    {
      id: 'stoichiometry-9', level: 7,
      title: { zh: '溫水裡的氫氣', en: 'Hydrogen over warm water' },
      desc: { zh: '水溫 35 °C 以上，鎂的原子量算到誤差 1% 以內（水蒸氣不可忽略）。', en: 'With the water at 35 °C or warmer, find the atomic mass of magnesium to within 1% (the water vapour cannot be ignored).' },
      check: function (ev) { const d = va(ev); return !!d && d.T >= 35 && d.limPick === 'Mg' && d.lim !== 'HCl' && Math.abs(d.Merr) <= 0.01; }
    },
    {
      id: 'stoichiometry-10', level: 8,
      title: { zh: '反推鹽酸的濃度', en: 'Work out the acid' },
      desc: { zh: '鹽酸是限量試劑，由收集到的氫氣算出鹽酸的濃度，誤差在 1% 以內。', en: 'With the acid as the limiting reactant, work out the concentration of the acid from the hydrogen you collect, to within 1%.' },
      check: function (ev) { const d = va(ev); return !!d && d.limPick === 'HCl' && d.lim === 'HCl' && Math.abs(d.cErr) <= 0.01; }
    },
    {
      id: 'stoichiometry-11', level: 9,
      title: { zh: '精密測量', en: 'Precision measurement' },
      desc: { zh: '鎂的原子量誤差在 0.3% 以內。提示：選對量筒、對齊液面、讀數要估到最小刻度的十分之一。', en: 'Find the atomic mass of magnesium to within 0.3%. Hint: choose the right cylinder, level the water and estimate the reading to a tenth of a division.' },
      check: function (ev) { const d = va(ev); return !!d && d.limPick === 'Mg' && d.lim !== 'HCl' && Math.abs(d.Merr) <= 0.003; }
    },
    {
      id: 'stoichiometry-12', level: 10,
      title: { zh: '換了天氣，同一個答案', en: 'Any weather, one answer' },
      desc: { zh: '在不清除結果的情況下，做至少三次實驗，水溫最高與最低相差 15 °C 以上、大氣壓相差 80 mmHg 以上，每次換算成標準狀況的莫耳體積誤差都在 0.5% 以內。', en: 'Without clearing the results, do at least three runs whose water temperatures span 15 °C or more and whose air pressures span 80 mmHg or more, each giving the molar volume at STP to within 0.5%.' },
      check: function (ev, mem) {
        const d = va(ev); if (!d) return false;
        segMem(mem, d);
        if (!(rightLim(d) && Math.abs(d.VmErr) <= 0.005)) return false;
        const L = keep(mem, d, { T: d.T, P: d.P });
        if (L.length < 3) return false;
        const Ts = L.map(function (x) { return x.T; }), Ps = L.map(function (x) { return x.P; });
        return Math.max.apply(null, Ts) - Math.min.apply(null, Ts) >= 15 && Math.max.apply(null, Ps) - Math.min.apply(null, Ps) >= 80;
      }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'stoichiometry-h1', level: 3, hidden: true,
      riddle: { zh: '一千個籃子，只裝滿一個。', en: 'A thousand baskets, and only one is filled.' },
      check: function (ev) { const d = va(ev); return !!d && Math.abs(d.nTheo / 0.001 - 1) <= 0.002; }
    },
    {
      id: 'stoichiometry-h2', level: 4, hidden: true,
      riddle: { zh: '最標準的地方，也有一口不標準的氣。', en: 'Even in the most standard place there is a breath that is not standard.' },
      check: function (ev) { const d = va(ev); return !!d && Math.abs(d.T) < 0.05 && Math.abs(d.P - 760) < 0.5; }
    },
    {
      id: 'stoichiometry-h3', level: 4, hidden: true,
      riddle: { zh: '看不見的室友，占了不小的房間。', en: 'An invisible roommate takes up quite a lot of the room.' },
      check: function (ev) { const d = va(ev); return !!d && d.vap && d.Pw / d.P >= 0.07; }
    },
    {
      id: 'stoichiometry-h4', level: 5, hidden: true,
      riddle: { zh: '同一口氣，蹲低一點就瘦了。', en: 'The same breath grows slimmer when it crouches.' },
      check: function (ev, mem) {
        const d = va(ev); if (!d) return false;
        if (mem.run !== d.runId || mem.seg !== d.seg) { mem.run = d.runId; mem.seg = d.seg; mem.a = null; mem.u = null; }
        if (d.aligned) mem.a = d.Vtrue; else mem.u = d.Vtrue;
        return mem.a != null && mem.u != null && (mem.u - mem.a) / mem.a >= 0.01;
      }
    },
    {
      id: 'stoichiometry-h5', level: 6, hidden: true,
      riddle: { zh: '多給的，並沒有多拿。', en: 'Giving more did not get more.' },
      check: function (ev, mem) {
        const d = va(ev); if (!d) return false;
        segMem(mem, d);
        if (d.lim !== 'HCl') return false;
        const L = keep(mem, d, { m: d.m, n: d.nHCl, V: d.Vtrue });
        const me = L[L.length - 1];
        return L.some(function (x) {
          return x !== me && rel(x.n, me.n) <= 0.005 && Math.max(x.m, me.m) / Math.min(x.m, me.m) >= 1.5 && rel(x.V, me.V) <= 0.01;
        });
      }
    },
    {
      id: 'stoichiometry-h6', level: 7, hidden: true,
      riddle: { zh: '左腳絆右腳，竟然走成一直線。', en: 'Tripping over both feet, yet walking a straight line.' },
      check: function (ev) { const d = va(ev); return !!d && !d.polished && !d.vap && d.limPick === 'Mg' && d.lim !== 'HCl' && Math.abs(d.Merr) <= 0.003; }
    },
    {
      id: 'stoichiometry-h7', level: 7, hidden: true,
      riddle: { zh: '斟到杯緣，一滴不灑。', en: 'Filled to the brim, not a drop spilled.' },
      check: function (ev) { const d = va(ev); return !!d && d.Vtrue >= 0.998 * d.cap && d.Vtrue <= d.cap; }
    },
    {
      id: 'stoichiometry-h8', level: 8, hidden: true,
      riddle: { zh: '換了天氣，它卻記得同一個數字。', en: 'The weather changed, yet it remembered the same number.' },
      check: function (ev, mem) {
        const d = va(ev); if (!d) return false;
        segMem(mem, d);
        const L = keep(mem, d, { n: d.nTheo, T: d.T, V: d.Vtrue });
        const me = L[L.length - 1];
        return L.some(function (x) { return x !== me && rel(x.n, me.n) <= 0.002 && Math.abs(x.T - me.T) >= 10 && rel(x.V, me.V) <= 0.005; });
      }
    },
    {
      id: 'stoichiometry-h9', level: 9, hidden: true,
      riddle: { zh: '三個冷暖，指向同一個盡頭。', en: 'Three shades of warmth point to the same end.' },
      check: function (ev, mem) {
        const d = va(ev); if (!d) return false;
        segMem(mem, d);
        if (!d.aligned) return false;
        // 乾燥氣體在大氣壓下的體積（照學生自己的選擇扣或不扣水蒸氣壓）
        keep(mem, d, { n: d.nTheo, P: d.P, T: d.T, Vd: d.reading * (d.P - (d.vap ? d.Pw : 0)) / d.P });
        const G = mem.list.filter(function (x) { return rel(x.n, d.nTheo) <= 0.002 && Math.abs(x.P - d.P) < 0.5; });
        if (G.length < 3) return false;
        const Ts = G.map(function (x) { return x.T; });
        if (Math.max.apply(null, Ts) - Math.min.apply(null, Ts) < 30) return false;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        G.forEach(function (x) { sx += x.T; sy += x.Vd; sxx += x.T * x.T; sxy += x.T * x.Vd; });
        const n = G.length, a = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - a * sx) / n;
        if (!(a > 0)) return false;
        return Math.abs(-b / a + 273.15) <= 10;
      }
    },
    {
      id: 'stoichiometry-h10', level: 10, hidden: true,
      riddle: { zh: '積沙成塔，塔尖最準。', en: 'Grain by grain, a tower; its tip is the truest.' },
      check: function (ev) { const d = va(ev); return !!d && d.Vtrue >= 150 && d.polished && d.limPick === 'Mg' && d.lim !== 'HCl' && Math.abs(d.Merr) <= 0.001; }
    }
  ]);
})();
