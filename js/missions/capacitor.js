/* missions/capacitor.js — 平行板電容器的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/capacitor.js 每次改變條件後回報）：
  //   'change'：{ key, mode, A (m²), d (m), Vb, kappa, f, C, Cair, Q, V, E, U, F, airOnly, base: {…改變前的同樣欄位…} }
  //   'reset'：按下「重設」
  const near = function (a, b, rel) { return Math.abs(a - b) <= rel * Math.abs(b); };
  const same = function (a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-12); };
  /** 記錄「斷開開關那一刻」的狀態；重設或重新接上時清除 */
  function track(ev, mem) {
    if (ev.type === 'reset') { mem.disc = null; return null; }
    const d = ev.data;
    if (d.key === 'mode') mem.disc = d.mode === 'Q' ? Object.assign({}, d) : null;
    return d;
  }

  LabMission.register('capacitor', [
    {
      id: 'capacitor-1', level: 1,
      title: { zh: '切斷電路', en: 'Cut the circuit' },
      desc: { zh: '把開關斷開（充電後斷開，Q 固定）。', en: 'Open the switch (charged, then disconnected: Q fixed).' },
      check: function (ev) { return ev.type === 'change' && ev.data.key === 'mode' && ev.data.mode === 'Q'; }
    },
    {
      id: 'capacitor-2', level: 2,
      title: { zh: '電容減半', en: 'Half the capacitance' },
      desc: { zh: '接著電池，只改變板距，一次讓電容變成原來的一半（誤差 1% 內）。', en: 'With the battery connected, change only the separation so that the capacitance halves in one step (within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && d.key === 'd' && d.mode === 'V' && d.base && near(d.C / d.base.C, 0.5, 0.01);
      }
    },
    {
      id: 'capacitor-3', level: 3,
      title: { zh: '玻璃的力量', en: 'The power of glass' },
      desc: { zh: '接著電池，從兩板間只有空氣開始，把玻璃（κ = 5）完全推入，讓電量一次變成 5 倍。', en: 'With the battery connected and only air between the plates, put glass (κ = 5) all the way in so that the charge becomes 5 times as large in one step.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && d.mode === 'V' && d.base && same(d.kappa, 5) && d.f === 1 &&
          d.base.Q > 0 && near(d.Q / d.base.Q, 5, 0.01);
      }
    },
    {
      id: 'capacitor-4', level: 4,
      title: { zh: '電壓翻倍', en: 'Double the voltage' },
      desc: { zh: '斷開開關後，一次改變一個條件，讓兩板間的電壓變成原來的 2 倍（誤差 1% 內）。', en: 'With the switch open, change one setting so that the voltage between the plates doubles in one step (within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && d.mode === 'Q' && d.key !== 'mode' && d.key !== 'Vb' && d.base && near(d.V / d.base.V, 2, 0.01);
      }
    },
    {
      id: 'capacitor-5', level: 4,
      title: { zh: '紋風不動的電場', en: 'A field that will not budge' },
      desc: { zh: '斷開開關、兩板間只有空氣，一次把板距變為至少 2 倍（或縮為一半以下），觀察電場是否改變。', en: 'With the switch open and only air between the plates, change the separation by a factor of at least 2 (up or down) in one step, and see whether the field changes.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'change' || d.key !== 'd' || d.mode !== 'Q' || !d.airOnly || !d.base) return false;
        const r = d.d / d.base.d;
        return (r >= 2 - 1e-9 || r <= 0.5 + 1e-9) && near(d.E, d.base.E, 1e-6);
      }
    },
    {
      id: 'capacitor-6', level: 5,
      title: { zh: '一百皮法拉', en: 'One hundred picofarads' },
      desc: { zh: '兩板間只有空氣，調出電容 C = 100.0 pF（誤差 ±0.5 pF）。', en: 'With only air between the plates, set the capacitance to C = 100.0 pF (±0.5 pF).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && d.airOnly && Math.abs(d.C - 100e-12) <= 0.5e-12;
      }
    },
    {
      id: 'capacitor-7', level: 6,
      title: { zh: '並聯的一半', en: 'Half in parallel' },
      desc: { zh: '用紙（κ = 3.5）只插入一部分，讓電容恰好是「全是空氣」時的 2 倍（誤差 0.5% 內）。', en: 'Insert paper (κ = 3.5) only part of the way so that the capacitance is exactly twice the all-air value (within 0.5%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && same(d.kappa, 3.5) && d.f > 0 && d.f < 1 && near(d.C / d.Cair, 2, 0.005);
      }
    },
    {
      id: 'capacitor-8', level: 6,
      title: { zh: '一微牛頓的吸引', en: 'A one-micronewton pull' },
      desc: { zh: '兩板間只有空氣，讓兩板的吸引力 F = 1.000 μN（誤差 1% 內）。', en: 'With only air between the plates, make the attraction between them F = 1.000 μN (within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && d.airOnly && d.F != null && near(d.F, 1e-6, 0.01);
      }
    },
    {
      id: 'capacitor-9', level: 7,
      title: { zh: '三倍能量', en: 'Triple the energy' },
      desc: { zh: '斷開開關後不再接上，讓電容器儲存的能量變成斷開那一刻的 3 倍（誤差 1% 內）。', en: 'Open the switch and, without closing it again, make the stored energy 3 times what it was at the moment you opened it (within 1%).' },
      check: function (ev, mem) {
        const d = track(ev, mem);
        return !!d && d.mode === 'Q' && !!mem.disc && d.key !== 'mode' && near(d.U / mem.disc.U, 3, 0.01);
      }
    },
    {
      id: 'capacitor-10', level: 8,
      title: { zh: '找回原來的電壓', en: 'Win back the voltage' },
      desc: { zh: '在兩板間只有空氣時斷開開關，再把玻璃（κ = 5）完全推入；面積保持不變，只靠改變板距，讓電壓回到斷開時的值（誤差 0.5% 內）。', en: 'Open the switch with only air between the plates, then slide glass (κ = 5) all the way in. Keeping the area unchanged and changing only the separation, bring the voltage back to its value at the moment you opened the switch (within 0.5%).' },
      check: function (ev, mem) {
        const d = track(ev, mem), s = mem.disc;
        return !!d && d.mode === 'Q' && !!s && s.airOnly && d.key !== 'mode' && same(d.kappa, 5) && d.f === 1 &&
          same(d.A, s.A) && near(d.V, s.V, 0.005);
      }
    },
    {
      id: 'capacitor-11', level: 9,
      title: { zh: '一奈庫侖', en: 'One nanocoulomb' },
      desc: { zh: '接上 12 V 電池、板距 5.0 mm，雲母（κ = 6）只插入一部分，讓電量恰好 Q = 1.000 nC（誤差 0.5% 內）。', en: 'With a 12 V battery connected and d = 5.0 mm, insert mica (κ = 6) only part of the way so that the charge is exactly Q = 1.000 nC (within 0.5%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && d.mode === 'V' && same(d.Vb, 12) && Math.abs(d.d - 0.005) < 1e-9 && same(d.kappa, 6) &&
          d.f > 0 && d.f < 1 && near(d.Q, 1e-9, 0.005);
      }
    },
    {
      id: 'capacitor-12', level: 10,
      title: { zh: '大師：十分之一', en: 'Master: one tenth' },
      desc: { zh: '在兩板間只有空氣時斷開開關；面積與板距都不改變，只把水（κ = 80）插入一部分，讓電壓恰好降為斷開時的 1/10（誤差 0.5% 內）。', en: 'Open the switch with only air between the plates. Without changing the area or the separation, slide water (κ = 80) part of the way in so that the voltage drops to exactly 1/10 of its value when you opened the switch (within 0.5%).' },
      check: function (ev, mem) {
        const d = track(ev, mem), s = mem.disc;
        return !!d && d.mode === 'Q' && !!s && s.airOnly && d.key !== 'mode' && same(d.kappa, 80) && d.f > 0 && d.f < 1 &&
          same(d.A, s.A) && same(d.d, s.d) && near(d.V / s.V, 0.1, 0.005);
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'capacitor-h1', level: 5, hidden: true,
      riddle: { zh: '兩片之間攢下的力氣，小到得用「微」來稱呼，卻剛好整整一份。', en: 'The strength hoarded between the plates is so small it must be called “micro”, yet it is exactly one whole share.' },
      check: function (ev) { return ev.type === 'change' && Math.abs(ev.data.U - 1e-6) <= 5e-9; }
    },
    {
      id: 'capacitor-h2', level: 6, hidden: true,
      riddle: { zh: '久別重逢，卻沒有任何東西流動。', en: 'They meet again after a long while, and nothing flows at all.' },
      check: function (ev, mem) {
        if (ev.type === 'reset') { mem.s = null; return false; }
        const d = ev.data;
        if (ev.type !== 'change') return false;
        if (d.key === 'mode' && d.mode === 'Q') { mem.s = { C: d.C, Vb: d.Vb }; return false; }
        if (d.key !== 'mode' || d.mode !== 'V' || !mem.s || !d.base) return false;
        const s = mem.s; mem.s = null;
        const altered = !near(d.C, s.C, 0.05) || !near(d.Vb, s.Vb, 0.05);
        return altered && d.base.Q > 0 && near(d.Q, d.base.Q, 0.005);
      }
    },
    {
      id: 'capacitor-h3', level: 7, hidden: true,
      riddle: { zh: '小小的電池，也藏著閃電的脾氣。', en: 'Even a small battery hides the temper of lightning.' },
      check: function (ev) { const d = ev.data; return ev.type === 'change' && d.mode === 'Q' && d.V >= 1e3; }
    }
  ]);
})();
