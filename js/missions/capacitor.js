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

  // 同一讀數維持一秒才完成。拖過答案、重設或離開該狀態會取消這次觀察。
  function observe(ev, mem, id, matches) {
    if (ev.type === 'capacitorObservation') {
      return ev.data.id === id && ev.data.observation === mem.observation;
    }
    if (ev.type !== 'change' && ev.type !== 'reset') return false;
    if (!matches) {
      clearTimeout(mem.timer);
      mem.observation = null;
    } else if (!mem.observation) {
      const observation = mem.observation = {};
      mem.timer = setTimeout(function () {
        LabMission.emit('capacitorObservation', { id: id, observation: observation });
      }, 1000);
    }
    return false;
  }
  function clearOrRemember(ev, mem) {
    if (ev.type === 'reset') mem.list = [];
    return ev.type === 'change';
  }
  function airGapStep(d) {
    return d.key === 'd' && d.airOnly && d.base && d.base.airOnly &&
      d.d >= 1.5 * d.base.d && d.d <= 1.8 * d.base.d;
  }
  function keepReading(mem, d) {
    const list = mem.list = mem.list || [];
    list.push(d);
    if (list.length > 16) list.shift();
    return list;
  }
  function rememberAirField(mem, d) {
    return keepReading(mem, d).some(function (o) {
      if (o === d || !same(o.A, d.A)) return false;
      const far = d.d > o.d ? d : o, close = d.d > o.d ? o : d;
      return near(far.d, 1.5 * close.d, 0.005) && near(far.E, close.E, 0.005) &&
        near(far.F, close.F, 0.01);
    });
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
      desc: { zh: '接著電池，完全插入玻璃（κ = 5），觀察一秒，確認電量為相同板距與面積下空氣值的 5 倍。', en: 'With the battery connected, fully insert glass (κ = 5). Observe for one second that its charge is five times the air-only value at the same spacing and area.' },
      check: function (ev, mem) {
        const d = ev.data;
        const fullGlass = ev.type === 'change' && d.mode === 'V' && same(d.kappa, 5) && same(d.f, 1) &&
          d.Cair > 0 && near(d.Q / (d.Cair * d.Vb), 5, 0.01 + 1e-9);
        return observe(ev, mem, 'capacitor-3', fullGlass);
      }
    },
    {
      id: 'capacitor-4', level: 4,
      title: { zh: '電壓翻倍', en: 'Double the voltage' },
      desc: { zh: '斷開開關後，調整板距、面積或介電質，讓電壓維持在剛斷開時的 2 倍一秒鐘（誤差 1% 內）。', en: 'Open the switch, then adjust the separation, area or dielectric. Keep the voltage at twice its value at disconnection for one second (within 1%).' },
      check: function (ev, mem) {
        const d = track(ev, mem);
        const doubled = ev.type === 'change' && mem.disc && d.mode === 'Q' &&
          near(d.V / mem.disc.V, 2, 0.01 + 1e-9);
        return observe(ev, mem, 'capacitor-4', doubled);
      }
    },
    {
      id: 'capacitor-5', level: 4,
      title: { zh: '紋風不動的電場', en: 'A field that will not budge' },
      desc: { zh: '斷開開關、兩板間只有空氣。把板距調到起始值的 2 倍以上或一半以下，觀察一秒，確認電場大小不變。', en: 'Disconnect the battery with only air between the plates. Change the spacing to at least twice or at most half its initial value. Observe for one second that the field strength is unchanged.' },
      check: function (ev, mem) {
        const d = ev.data, b = d.base;
        if (ev.type === 'reset' || ev.type === 'change' && (d.mode !== 'Q' || !d.airOnly)) mem.gap = null;
        if (ev.type === 'change' && d.mode === 'Q' && d.airOnly && b && b.airOnly) {
          if (!mem.gap || !same(mem.gap.A, d.A) || !same(mem.gap.Q, d.Q)) {
            mem.gap = { A: d.A, Q: d.Q, E: d.E, start: d.key === 'd' ? b.d : d.d };
          }
        }
        const g = mem.gap;
        const unchanged = ev.type === 'change' && g && near(d.E, g.E, 1e-6 + 1e-9) &&
          (d.d / g.start >= 2 - 1e-9 || d.d / g.start <= 0.5 + 1e-9);
        return observe(ev, mem, 'capacitor-5', unchanged);
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
      desc: { zh: '兩板間只有空氣，調整參數使吸引力在 1.000 μN 的 1% 內維持一秒。', en: 'With only air between the plates, adjust the attraction to within 1% of 1.000 μN and hold it there for one second.' },
      check: function (ev, mem) {
        const d = ev.data;
        const target = ev.type === 'change' && d.base && d.airOnly && d.F != null &&
          near(d.F, 1e-6, 0.01 + 1e-9) && (mem.observation ||
            ['Vb', 'A', 'd', 'f', 'kappa', 'mode'].includes(d.key) && !near(d.base.F, 1e-6, 0.01 + 1e-9));
        return observe(ev, mem, 'capacitor-8', target);
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
    },
    {
      id: 'capacitor-h4', level: 3, hidden: true,
      riddle: { zh: '一道窄窗，亮得足以和整面牆分庭抗禮。', en: 'A narrow window holds its own against a whole wall.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'change' && d.key === 'f' && d.mode === 'V' && same(d.kappa, 5) &&
          near(d.kappa * d.f, 1 - d.f, 0.005);
      }
    },
    {
      id: 'capacitor-h5', level: 4, hidden: true,
      riddle: { zh: '兩端各往前一步，中間的密度仍舊。', en: 'Both ends take a step; the space between them keeps its measure.' },
      check: function (ev, mem) {
        if (!clearOrRemember(ev, mem)) return false;
        const d = ev.data;
        if (d.mode !== 'V' || !d.airOnly || (d.key !== 'd' && d.key !== 'Vb')) return false;
        return rememberAirField(mem, d);
      }
    },
    {
      id: 'capacitor-h6', level: 6, hidden: true,
      riddle: { zh: '換了布料，邊角的帳還是平的。', en: 'The cloth is different, and the account still balances at the edges.' },
      check: function (ev, mem) {
        if (!clearOrRemember(ev, mem)) return false;
        const d = ev.data;
        if (d.mode !== 'V' || (d.key !== 'k' && d.key !== 'f') ||
            !(same(d.kappa, 3.5) || same(d.kappa, 6)) || d.f < 0.22 || d.f > 0.85) return false;
        return keepReading(mem, d).some(function (o) {
          return o !== d && o.kappa !== d.kappa && same(o.A, d.A) && same(o.d, d.d) &&
            same(o.V, d.V) && near(o.Q, d.Q, 0.005);
        });
      }
    },
    {
      id: 'capacitor-h7', level: 8, hidden: true,
      riddle: { zh: '把帳本往兩側翻，夾在正中的那頁還在。', en: 'Turn the ledger to either side; the middle page stays put.' },
      check: function (ev, mem) {
        const d = track(ev, mem), s = mem.disc;
        if (!s || !s.airOnly || d.key === 'mode') { mem.small = mem.large = false; return false; }
        if (!d || d.key !== 'A' || d.mode !== 'Q' || !d.airOnly || !same(d.d, s.d)) return false;
        if (near(d.F, 1.5 * s.F, 0.005) && near(d.E, 1.5 * s.E, 0.005)) mem.small = true;
        if (near(d.F, s.F / 1.5, 0.005) && near(d.E, s.E / 1.5, 0.005)) mem.large = true;
        return mem.small && mem.large;
      }
    },
    {
      id: 'capacitor-h8', level: 9, hidden: true,
      riddle: { zh: '同一雙手拉開同一扇門，兩本帳卻向反方向記。', en: 'The same hand opens the same door; the two ledgers move in opposite directions.' },
      check: function (ev, mem) {
        if (!clearOrRemember(ev, mem)) return false;
        const d = ev.data;
        if (!airGapStep(d)) return false;
        return keepReading(mem, d).some(function (o) {
          if (o === d || o.mode === d.mode || !same(o.A, d.A) || !same(o.d, d.d) ||
              !same(o.base.d, d.base.d) || !near(o.base.V, d.base.V, 0.003)) return false;
          const open = d.mode === 'Q' ? d : o, closed = d.mode === 'V' ? d : o;
          const gain = open.U - open.base.U, loss = closed.base.U - closed.U;
          return loss > 0 && near(gain / loss, d.d / d.base.d, 0.006);
        });
      }
    },
    {
      id: 'capacitor-h9', level: 9, hidden: true,
      riddle: { zh: '房間變高也變寬，裝得下的仍是同一份。', en: 'The room grows taller and wider; it still holds exactly the same share.' },
      check: function (ev, mem) {
        const d = track(ev, mem), s = mem.disc;
        return !!d && !!s && d.key === 'd' && d.mode === 'Q' && s.airOnly && d.airOnly &&
          near(d.d, 2.5 * s.d, 0.005) && near(d.C, s.C, 0.004) && near(d.F, 0.4 * s.F, 0.005);
      }
    },
    {
      id: 'capacitor-h10', level: 10, hidden: true,
      riddle: { zh: '門外早已換景，屋裡的腳步始終一樣密。', en: 'Outside the scenery changes; inside the footsteps keep their spacing.' },
      check: function (ev, mem) {
        const d = track(ev, mem), s = mem.disc;
        return !!d && !!s && d.key === 'd' && d.mode === 'Q' && same(s.kappa, 3.5) &&
          same(d.kappa, 5) && s.f > 0.2 && s.f < 0.85 && d.f > 0.06 && d.f < 0.45 &&
          d.A >= 1.5 * s.A && near(d.d, 1.5 * s.d, 0.006) && near(d.E, s.E, 0.008);
      }
    }
  ]);
})();
