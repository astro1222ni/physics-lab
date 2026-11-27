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

  // 電阻與電動勢皆可輸入到小數第二位。範例刻度可精確達成比例；
  // 相對誤差 0.1% 容許求解與微調，電路無電流時不接受 0:0。
  const ratio = (a, b, k) => b > 1e-8 && near(a, k * b, 0.001);
  function measured(ev, preset, id) {
    const d = ev.data;
    return isC(ev) && d.preset === preset && d.allClosed && d.action === 'probe' && d.probe &&
      d.probe.across.includes(id) && ratio(Math.abs(d.probe.dV), d.parts[id].V, 1);
  }

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
      check: function (ev, mem) {
        const d = ev.data;
        if (!isC(ev)) return false;
        // 天秤的另一頭（11/27 收緊：原本調過電阻、Ig ≥ 1 mA 就算，亂按 5 個種子有 4 個誤觸）：
        // 惠斯登電橋開關全閉、不平衡（|Ig| ≥ 1 mA），先記一筆；再把左右兩臂整個對調（R1↔R3、R2↔Rx），
        // 電源不變，檢流計電流大小相同、方向相反（相對誤差 0.1%）。左右鏡射讓 C、D 兩點的電位互換，Ig 恰好反號。
        // 「經過平衡點讓指針反向」不採用：一般任務 L7、L10 用任一臂的滑桿找平衡時都會經過，會被順手完成。
        if (d.preset !== 'wheatstone' || !d.allClosed || d.Ig == null || !d.parts) { mem.list = []; return false; }
        const p = d.parts;
        if (!p.R1 || !p.R2 || !p.R3 || !p.Rx || Math.abs(d.Ig) < 1e-3 - 1e-9) return false;
        const cur = { R1: p.R1.R, R2: p.R2.R, R3: p.R3.R, Rx: p.Rx.R, emf: d.emf, r: d.r, Ig: d.Ig };
        const list = mem.list = mem.list || [];
        const hit = list.some(function (a) {
          return a.R1 === cur.R3 && a.R3 === cur.R1 && a.R2 === cur.Rx && a.Rx === cur.R2 &&
            a.emf === cur.emf && a.r === cur.r && Math.abs(a.Ig + cur.Ig) <= 1e-3 * Math.abs(a.Ig);
        });
        list.push(cur);
        if (list.length > 12) list.shift();
        return hit;
      }
    },
    {
      id: 'dc-circuit-h4', level: 3, hidden: true,
      riddle: { zh: '中間那階，知道整段樓梯的祕密。', en: 'The middle step knows the whole staircase.' },
      desc: { zh: '把三個串聯燈泡的電壓依序調成 1:2:3，用探針驗證第二盞分得端電壓的三分之一。', en: 'Set three series voltage drops in the ratio 1:2:3 and probe the middle bulb to measure one third of the terminal voltage.' },
      check: function (ev) {
        const d = ev.data, p = d.parts;
        return measured(ev, 'series', 'L2') && d.count === 3 && ratio(p.L2.V, p.L1.V, 2) &&
          ratio(p.L3.V, p.L1.V, 3);
      }
    },
    {
      id: 'dc-circuit-h5', level: 5, hidden: true,
      riddle: { zh: '三條渡船，靠岸時一樣高。', en: 'Three ferries ride level at the landing.' },
      desc: { zh: '把三個並聯支路電流依序調成 1:2:3，跨接第三盞燈，驗證它承受完整端電壓卻分去一半總電流。', en: 'Set three parallel currents in the ratio 1:2:3. Probe the third bulb to verify full terminal voltage while it carries half the total current.' },
      check: function (ev) {
        const d = ev.data, p = d.parts;
        return measured(ev, 'parallel', 'L3') && d.count === 3 && ratio(p.L2.I, p.L1.I, 2) &&
          ratio(p.L3.I, p.L1.I, 3) && ratio(Math.abs(d.probe.dV), d.Vt, 1);
      }
    },
    {
      id: 'dc-circuit-h6', level: 6, hidden: true,
      riddle: { zh: '玻璃出自同一窯，牆上的影子卻有深淺。', en: 'Glass from the same kiln casts shadows of different depths.' },
      desc: { zh: '在混合電路中閉合兩個開關，讓三盞燈的電阻相等。幹路上的 L1 電流是每條支路的兩倍，功率是 L2、L3 各自的四倍。', en: 'Close both switches in the mixed circuit and give all three bulbs equal resistance. Bulb L1 carries twice the current in either branch and dissipates four times the power of each branch bulb.' },
      check: function (ev) {
        const d = ev.data;
        if (!isC(ev) || d.preset !== 'mixed' || !d.allClosed) return false;
        const { L1, L2, L3 } = d.parts;
        return ratio(Math.max(L1.R, L2.R, L3.R), Math.min(L1.R, L2.R, L3.R), 1) &&
          ratio(L1.P, L2.P, 4) && ratio(L1.P, L3.P, 4);
      }
    },
    {
      id: 'dc-circuit-h7', level: 7, hidden: true,
      riddle: { zh: '前廳和兩間後室，入夜花掉同一筆燈錢。', en: 'The front hall spends as much on light as both back rooms together.' },
      desc: { zh: '在混合電路讓串聯燈的功率等於兩並聯燈的總功率，且兩支路功率為 2:1。', en: 'In the mixed circuit, make the series bulb dissipate as much as the two parallel bulbs together while the branches split power two to one.' },
      check: function (ev) {
        const d = ev.data, p = d.parts;
        return isC(ev) && d.preset === 'mixed' && d.allClosed && ratio(p.L2.P, p.L3.P, 2) &&
          ratio(p.L1.P, p.L2.P + p.L3.P, 1);
      }
    },
    {
      id: 'dc-circuit-h8', level: 8, hidden: true,
      riddle: { zh: '一條河道合上，舊水痕還留在岸邊。', en: 'One channel closes and leaves a high-water mark.' },
      desc: { zh: '用理想電池供應兩個並聯支路，斷開第二支路後，第一支路仍通電且電池電流恰為原來的四分之一。', en: 'With an ideal battery feeding two parallel branches, open the second branch and measure one quarter of the previous total current in the surviving branch.' },
      check: function (ev) {
        const d = ev.data, p = d.parts;
        return isC(ev) && d.action === 'switch' && d.preset === 'parallel' && d.count === 2 && d.r === 0 &&
          p.S1.closed && !p.S2.closed && ratio(d.I, d.prevI, 0.25) && ratio(p.L1.I, d.I, 1);
      }
    },
    {
      id: 'dc-circuit-h9', level: 9, hidden: true,
      riddle: { zh: '兩張收據金額相同，寄件人付的代價卻不同。', en: 'Two receipts match although the sender paid different prices.' },
      desc: { zh: '同一顆電池分別以 25% 與 75% 效率供電，驗證互為對偶的兩個負載獲得相同功率。', en: 'Use the same battery at 25% and 75% efficiency and verify equal delivered power for the two reciprocal loads.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isC(ev) || d.preset !== 'internal' || !d.allClosed || d.r <= 0 ||
            !(near(d.eta, 0.25, 0.001) || near(d.eta, 0.75, 0.001))) return false;
        const old = mem.last;
        mem.last = d;
        return old && same(old.emf, d.emf) && same(old.r, d.r) && Math.abs(old.eta - d.eta) > 0.49 &&
          ratio(old.Pout, d.Pout, 1);
      }
    },
    {
      id: 'dc-circuit-h10', level: 10, hidden: true,
      riddle: { zh: '兩座橋亭同高，走過的人數卻不同。', en: 'The bridge shelters stand level but draw different crowds.' },
      desc: { zh: '讓電橋平衡，兩中點都在端電壓的一半，同時使左、右兩側支路電流比為 3:1。', en: 'Balance the bridge with both midpoints at half terminal voltage and three times as much current in the left side as in the right.' },
      check: function (ev) {
        const d = ev.data, p = d.parts;
        return isC(ev) && balanced(d) && ratio(p.R2.V, d.Vt, 0.5) && ratio(p.Rx.V, d.Vt, 0.5) &&
          ratio(p.R1.I, p.R3.I, 3);
      }
    }
  ]);
})();
