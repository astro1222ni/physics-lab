/* missions/dc-circuit.js — 直流電路的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/dc-circuit.js 在使用者每次操作後回報；拖曳滑桿時只在放開時回報一次）：
  //   'circuit'：{ action: 'preset'|'count'|'emf'|'r'|'R'|'switch'|'probe', preset, count, emf, r, ok,
  //               I（電池電流）, Vt（端電壓）, Req, Pemf, Pint, Pout, eta, prevI（操作前的電流）, Ig（檢流計電流，有號）,
  //               allClosed, parts: { id: { kind, R, I, V, P } 或 { kind: 'switch', closed } },
  //               probe: null 或 { a, b, dV（紅 − 黑）, across: [探針跨過的元件代號], openSwitch } }
  const isC = function (ev) { return ev.type === 'circuit' && ev.data && ev.data.ok; };
  const near = function (a, b, rel) { return Math.abs(a - b) <= rel * Math.abs(b); };
  const same = function (a, b) { return Math.abs(a - b) < 1e-9; };
  /** 幾個電阻兩兩相差至少 d */
  const distinct = function (list, d) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (Math.abs(list[i] - list[j]) < d) return false;
    return true;
  };
  const arms = function (p) { return [p.R1.R, p.R2.R, p.R3.R, p.Rx.R]; };
  const balanced = function (d) { return d.preset === 'wheatstone' && d.allClosed && d.Ig != null && Math.abs(d.Ig) <= 1e-4 && d.I >= 0.05; };

  LabMission.register('dc-circuit', [
    {
      id: 'dc-circuit-1', level: 1,
      title: { zh: '切斷電路', en: 'Break the circuit' },
      desc: { zh: '電流正在流動時，按一個開關讓電池的電流變成 0。', en: 'While current is flowing, open a switch so that the battery current drops to zero.' },
      check: function (ev) {
        const d = ev.data;
        return isC(ev) && d.action === 'switch' && d.prevI > 1e-3 && Math.abs(d.I) < 1e-9;
      }
    },
    {
      id: 'dc-circuit-2', level: 2,
      title: { zh: '電壓表上場', en: 'Enter the voltmeter' },
      desc: { zh: '把兩支探針放在某一個電阻或燈泡的兩端，量它的電壓（流過它的電流至少 0.05 A）。', en: 'Put the two probes on either side of one resistor or bulb and measure its voltage (with at least 0.05 A through it).' },
      check: function (ev) {
        const d = ev.data;
        if (!isC(ev) || d.action !== 'probe' || !d.probe || !isFinite(d.probe.dV)) return false;
        return d.probe.across.some(function (id) { const p = d.parts[id]; return p && p.kind !== 'switch' && p.I >= 0.05; });
      }
    },
    {
      id: 'dc-circuit-3', level: 3,
      title: { zh: '串聯 0.300 A', en: 'Series at 0.300 A' },
      desc: { zh: '三個燈泡串聯、開關接通，讓電流恰好是 0.300 A（誤差 ±0.002 A）。', en: 'With three bulbs in series and the switch closed, make the current exactly 0.300 A (±0.002 A).' },
      check: function (ev) {
        const d = ev.data;
        return isC(ev) && d.preset === 'series' && d.count === 3 && d.allClosed && Math.abs(d.I - 0.3) <= 0.002;
      }
    },
    {
      id: 'dc-circuit-4', level: 4,
      title: { zh: '八成效率', en: 'Eighty per cent efficient' },
      desc: { zh: '在「電池內電阻」電路中，內電阻至少 1 Ω，讓電池的效率恰好是 80.0%（誤差 ±0.2%）。', en: 'In the internal-resistance circuit, with r at least 1 Ω, make the battery’s efficiency exactly 80.0% (±0.2%).' },
      check: function (ev) {
        const d = ev.data;
        return isC(ev) && d.preset === 'internal' && d.allClosed && d.r >= 1 && Math.abs(d.eta - 0.8) <= 0.002;
      }
    },
    {
      id: 'dc-circuit-5', level: 5,
      title: { zh: '並聯成 2 Ω', en: 'Two ohms in parallel' },
      desc: { zh: '三個燈泡並聯、全部接通，讓等效電阻恰好是 2.00 Ω（誤差 ±0.01 Ω），而且三個電阻兩兩相差至少 1 Ω。', en: 'With three bulbs in parallel and all switches closed, make the equivalent resistance exactly 2.00 Ω (±0.01 Ω), with the three resistances at least 1 Ω apart from each other.' },
      check: function (ev) {
        const d = ev.data;
        return isC(ev) && d.preset === 'parallel' && d.count === 3 && d.allClosed && Math.abs(d.Req - 2) <= 0.01 &&
          distinct([d.parts.L1.R, d.parts.L2.R, d.parts.L3.R], 1);
      }
    },
    {
      id: 'dc-circuit-6', level: 6,
      title: { zh: '最大功率', en: 'Maximum power' },
      desc: { zh: '在「電池內電阻」電路中（r ≥ 0.5 Ω），讓負載得到最大的功率（達到最大值的 99.95% 以上）。', en: 'In the internal-resistance circuit (r ≥ 0.5 Ω), give the load the greatest possible power (at least 99.95% of the maximum).' },
      check: function (ev) {
        const d = ev.data;
        if (!isC(ev) || d.preset !== 'internal' || !d.allClosed || d.r < 0.5) return false;
        return d.Pout >= 0.9995 * d.emf * d.emf / (4 * d.r);
      }
    },
    {
      id: 'dc-circuit-7', level: 7,
      title: { zh: '電橋平衡', en: 'Balance the bridge' },
      desc: { zh: '讓惠斯登電橋平衡（檢流計電流不超過 0.1 mA），四個臂的電阻兩兩相差至少 0.5 Ω。', en: 'Balance the Wheatstone bridge (galvanometer current at most 0.1 mA), with the four arm resistances at least 0.5 Ω apart from each other.' },
      check: function (ev) {
        const d = ev.data;
        return isC(ev) && balanced(d) && distinct(arms(d.parts), 0.5);
      }
    },
    {
      id: 'dc-circuit-8', level: 8,
      title: { zh: '三燈同亮', en: 'Three equal bulbs' },
      desc: { zh: '在串並聯混合電路中，兩個開關都接通，讓三個燈泡的功率都相等（誤差 1% 內），每個至少 0.1 W。', en: 'In the series–parallel circuit with both switches closed, make all three bulbs use the same power (within 1%), at least 0.1 W each.' },
      check: function (ev) {
        const d = ev.data;
        if (!isC(ev) || d.preset !== 'mixed' || !d.allClosed) return false;
        const p = [d.parts.L1.P, d.parts.L2.P, d.parts.L3.P];
        const mx = Math.max.apply(null, p), mn = Math.min.apply(null, p);
        return mn >= 0.1 && mx - mn <= 0.01 * mx;
      }
    },
    {
      id: 'dc-circuit-9', level: 9,
      title: { zh: '同一功率的兩個負載', en: 'Two loads, one power' },
      desc: { zh: '在「電池內電阻」電路中，ε 與 r 不變（r ≥ 1 Ω），先後用兩個相差至少 2 Ω 的負載 R，讓輸出功率相同（誤差 0.2% 內）。', en: 'In the internal-resistance circuit, keeping ε and r fixed (r ≥ 1 Ω), use two loads R at least 2 Ω apart, one after the other, that receive the same output power (within 0.2%).' },
      check: function (ev, mem) {
        if (!isC(ev)) return false;
        const d = ev.data;
        if (d.preset !== 'internal' || !d.allClosed || d.r < 1 || !(d.Pout > 0.01)) return false;
        const R = d.parts.R.R;
        const hit = (mem.list || []).some(function (o) {
          return same(o.emf, d.emf) && same(o.r, d.r) && Math.abs(o.R - R) >= 2 && near(o.P, d.Pout, 0.002);
        });
        (mem.list = mem.list || []).push({ emf: d.emf, r: d.r, R: R, P: d.Pout });
        if (mem.list.length > 16) mem.list.shift();
        return hit;
      }
    },
    {
      id: 'dc-circuit-10', level: 10,
      title: { zh: '大師：精準電橋', en: 'Master: the precise bridge' },
      desc: { zh: '讓惠斯登電橋平衡（檢流計電流不超過 0.1 mA），同時讓電池的總電流恰好是 0.250 A（誤差 ±0.001 A）；四個臂的電阻兩兩相差至少 0.5 Ω。', en: 'Balance the Wheatstone bridge (galvanometer current at most 0.1 mA) while the battery current is exactly 0.250 A (±0.001 A); the four arm resistances must be at least 0.5 Ω apart from each other.' },
      check: function (ev) {
        const d = ev.data;
        return isC(ev) && balanced(d) && distinct(arms(d.parts), 0.5) && Math.abs(d.I - 0.25) <= 0.001;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'dc-circuit-h1', level: 4, hidden: true,
      riddle: { zh: '沉默的缺口，說出最響亮的話。', en: 'The silent gap speaks the loudest words.' },
      check: function (ev) {
        const d = ev.data;
        return isC(ev) && d.probe && d.probe.openSwitch && isFinite(d.probe.dV) && Math.abs(d.probe.dV) >= 0.999 * d.emf;
      }
    },
    {
      id: 'dc-circuit-h2', level: 6, hidden: true,
      riddle: { zh: '一圈與它的寬度之間的私語，悄悄流過了導線。', en: 'A whisper between a circle and its width slips quietly along the wire.' },
      check: function (ev) { const d = ev.data; return isC(ev) && Math.abs(d.I - 3.14) <= 0.005; }
    },
    {
      id: 'dc-circuit-h3', level: 3, hidden: true,
      riddle: { zh: '天秤的另一頭，也有風景。', en: 'There is a view from the other end of the scales, too.' },
      check: function (ev) {
        const d = ev.data;
        return isC(ev) && d.preset === 'wheatstone' && d.allClosed && d.Ig != null && d.Ig >= 1e-3;
      }
    }
  ]);
})();
