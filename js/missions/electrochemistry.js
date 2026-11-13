/* missions/electrochemistry.js — 化學電池與電解的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/electrochemistry.js 只在使用者操作之後回報）：
  //   'tick'：每 0.5 秒 { mode, running, cell: { L/R: { metal, c, c0, m, m0 }, bridge, load, Rload, E（伏特計讀數）, emf, E0, I, q, qAbs, t, unk },
  //            elec: { elec（'C'／'Cu'）, metal, unk, c, c0, V, I, q, t, dep, mCath, mAnode, base, H2, O2（mL）, off, paused } }
  //   'record'：化學電池記錄一筆 { pair, count, span, slope, theory, unk }
  //   'answerE'：未知電極 { ans, err（V）, tries, revealed }；'answerM'：未知金屬 { ans, err（相對）, tries, revealed }
  const cellT = function (ev) { return ev.type === 'tick' && ev.data && ev.data.mode === 'cell' ? ev.data.cell : null; };
  const elecT = function (ev) { return ev.type === 'tick' && ev.data && ev.data.mode === 'elec' ? ev.data.elec : null; };
  const pair = function (c, a, b) { return (c.L.metal === a && c.R.metal === b) || (c.L.metal === b && c.R.metal === a); };
  const same = function (c) { return c.L.metal === c.R.metal && c.L.metal !== 'X'; };

  LabMission.register('electrochemistry', [
    {
      id: 'electrochemistry-1', level: 1,
      title: { zh: '接通鹽橋', en: 'Complete the circuit' },
      desc: { zh: '放上鹽橋，讓伏特計的讀數（絕對值）達到 0.1 V 以上。', en: 'Put in the salt bridge so that the voltmeter reads at least 0.1 V (either sign).' },
      check: function (ev) { const c = cellT(ev); return !!c && c.bridge && c.load === 'V' && Math.abs(c.E) >= 0.1; }
    },
    {
      id: 'electrochemistry-2', level: 2,
      title: { zh: '三伏特電池', en: 'A three-volt cell' },
      desc: { zh: '選兩種金屬，讓伏特計讀到 3.0 V 以上。', en: 'Choose two metals so that the voltmeter reads 3.0 V or more.' },
      check: function (ev) { const c = cellT(ev); return !!c && c.bridge && c.load === 'V' && c.E >= 3.0; }
    },
    {
      id: 'electrochemistry-3', level: 3,
      title: { zh: '點亮小燈泡', en: 'Light the bulb' },
      desc: { zh: '接上小燈泡，讓電流達到 50 mA 以上。', en: 'Connect the bulb and make the current 50 mA or more.' },
      check: function (ev) { const c = cellT(ev); return !!c && c.bridge && c.load === 'R' && Math.abs(c.I) >= 0.05; }
    },
    {
      id: 'electrochemistry-4', level: 4,
      title: { zh: '同一種金屬也有電壓', en: 'One metal, still a voltage' },
      desc: { zh: '兩邊用同一種金屬（濃差電池），讓伏特計的讀數（絕對值）達到 0.050 V 以上。', en: 'Use the same metal on both sides (a concentration cell) and make the voltmeter read at least 0.050 V (either sign).' },
      check: function (ev) { const c = cellT(ev); return !!c && same(c) && c.bridge && c.load === 'V' && Math.abs(c.E) >= 0.05; }
    },
    {
      id: 'electrochemistry-5', level: 5,
      title: { zh: '剛好 1.00 伏特', en: 'Exactly 1.00 volt' },
      desc: { zh: '用鋅和銅組成電池，只改變濃度，讓伏特計讀數（絕對值）落在 1.000～1.010 V 之間。', en: 'Build a zinc–copper cell and, by changing only the concentrations, make the voltmeter read between 1.000 and 1.010 V (either sign).' },
      check: function (ev) { const c = cellT(ev); if (!c || !pair(c, 'Zn', 'Cu') || !c.bridge || c.load !== 'V') return false; const e = Math.abs(c.E); return e >= 1.0 && e <= 1.01; }
    },
    {
      id: 'electrochemistry-6', level: 5,
      title: { zh: '電池沒電了嗎', en: 'Running down' },
      desc: { zh: '讓鋅銅電池接著燈泡放電，直到電池電位比剛放好時低 0.030 V 以上。', en: 'Let a zinc–copper cell run the bulb until its potential is at least 0.030 V lower than when it was set up.' },
      check: function (ev) { const c = cellT(ev); return !!c && pair(c, 'Zn', 'Cu') && c.qAbs > 0 && Math.abs(c.E0) - Math.abs(c.emf) >= 0.03; }
    },
    {
      id: 'electrochemistry-7', level: 6,
      title: { zh: '鍍出一公克', en: 'One gram of copper' },
      desc: { zh: '電解硫酸銅溶液，讓陰極析出 1.00 g 的銅（誤差 1% 以內），然後暫停或讓定時器關掉電源。', en: 'Electrolyse copper(II) sulfate solution until 1.00 g of copper has been deposited on the cathode (within 1%), then pause or let the timer switch off.' },
      check: function (ev) { const e = elecT(ev); return !!e && !e.unk && e.metal === 'Cu' && e.paused && Math.abs(e.dep - 1) <= 0.01; }
    },
    {
      id: 'electrochemistry-8', level: 6,
      title: { zh: '銅的電解精煉', en: 'Refining copper' },
      desc: { zh: '用銅電極電解，讓陰極增加 0.5 g 以上，而且陽極減少的質量與陰極增加的相差不到 1%、溶液濃度的變化不到 1%。', en: 'Electrolyse with copper electrodes until the cathode has gained 0.5 g or more, with the anode losing within 1% of what the cathode gains and the concentration changing by less than 1%.' },
      check: function (ev) {
        const e = elecT(ev);
        if (!e || e.unk || e.elec !== 'Cu' || e.metal !== 'Cu') return false;
        const gain = e.mCath - e.base, loss = e.base - e.mAnode;
        return gain >= 0.5 && Math.abs(loss - gain) <= 0.01 * gain && Math.abs(e.c - e.c0) <= 0.01 * e.c0;
      }
    },
    {
      id: 'electrochemistry-9', level: 7,
      title: { zh: '藍色褪去', en: 'The blue fades away' },
      desc: { zh: '用石墨電極電解 0.10 M 以上的硫酸銅溶液，直到銅離子剩下 0.010 M 以下。', en: 'With graphite electrodes, electrolyse copper(II) sulfate solution of 0.10 M or more until the copper(II) ions are down to 0.010 M or less.' },
      check: function (ev) { const e = elecT(ev); return !!e && !e.unk && e.elec === 'C' && e.metal === 'Cu' && e.c0 >= 0.1 - 1e-9 && e.c <= 0.01; }
    },
    {
      id: 'electrochemistry-10', level: 7,
      title: { zh: '能斯特的斜率', en: 'The Nernst slope' },
      desc: { zh: '用銀和一種二價金屬組成電池，同一組金屬記錄 5 筆以上、log Q 跨 3 以上，能斯特圖的斜率與 −0.05916/n 相差 1% 以內。', en: 'Build a cell from silver and a metal that forms 2+ ions. Record 5 or more readings for this pair, spanning 3 or more in log Q, with the slope of the Nernst plot within 1% of −0.05916/n.' },
      check: function (ev) {
        if (ev.type !== 'record' || !ev.data) return false;
        const d = ev.data, m = String(d.pair).split('|');
        return !d.unk && m.indexOf('Ag') >= 0 && m[0] !== m[1] && d.count >= 5 && d.span >= 3 && d.slope != null && Math.abs(d.slope / d.theory - 1) <= 0.01;
      }
    },
    {
      id: 'electrochemistry-11', level: 8,
      title: { zh: '未知電極的電位', en: 'Potential of the unknown' },
      desc: { zh: '在「未知電極 X」找出 X 的標準還原電位 E°，誤差 0.005 V 以內（不可先揭曉答案）。', en: 'With “Unknown electrode X”, find the standard reduction potential E° of X within 0.005 V (without revealing the answer first).' },
      check: function (ev) { return ev.type === 'answerE' && ev.data && !ev.data.revealed && ev.data.err <= 0.005 + 1e-9; }
    },
    {
      id: 'electrochemistry-12', level: 9,
      title: { zh: '秤出原子量', en: 'Weighing an atom' },
      desc: { zh: '在「未知金屬 M」用電解求出 M 的莫耳質量，誤差 1% 以內（不可先揭曉答案）。', en: 'With “Unknown metal M”, find the molar mass of M by electrolysis within 1% (without revealing the answer first).' },
      check: function (ev) { return ev.type === 'answerM' && ev.data && !ev.data.revealed && ev.data.err <= 0.01 + 1e-12; }
    },
    {
      id: 'electrochemistry-h1', level: 3, hidden: true,
      title: { zh: '倒著看的世界', en: 'Upside-down world' },
      riddle: { zh: '指針也有不服氣的時候。', en: 'Sometimes the needle just disagrees.' },
      check: function (ev) { const c = cellT(ev); return !!c && c.bridge && c.load === 'V' && c.E <= -1.0; }
    },
    {
      id: 'electrochemistry-h2', level: 4, hidden: true,
      title: { zh: '和解', en: 'Reconciled' },
      riddle: { zh: '兩個本來就一樣的人，終於不再爭了。', en: 'Two who were the same all along finally stop arguing.' },
      check: function (ev) { const c = cellT(ev); return !!c && same(c) && Math.abs(c.E0) >= 0.05 && c.qAbs > 0 && Math.abs(c.emf) < 0.001; }
    },
    {
      id: 'electrochemistry-h3', level: 5, hidden: true,
      title: { zh: '不請自來的氣泡', en: 'Uninvited bubbles' },
      riddle: { zh: '主角離場以後，配角冒了出來。', en: 'When the star leaves the stage, an extra rises up.' },
      check: function (ev) { const e = elecT(ev); return !!e && e.elec === 'C' && e.H2 >= 1; }
    }
  ]);
})();
