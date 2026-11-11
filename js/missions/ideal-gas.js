/* missions/ideal-gas.js — 理想氣體分子模擬的任務（星星數 = 等級 1–10）
 *
 * 事件 'measure'（狀態穩定、量測平均至少 60 ps 後，每 20 ps 一次）：
 *   mode（isothermal／isochoric／isobaric／adiabatic）、epoch（換氣體、分子數、重新放入時加 1）、
 *   N、mix、spA、spB、mA、mB、V（nm³）、Tset、bath、T（量到的氣體溫度 K）、P（kPa）、window（平均時間 ps）、
 *   vrmsA、vrmsB（m/s）、keA、keB（J）、keA4、keB4（最近 400 ps）、init（'maxwell'／'same'）、sinceInit（ps）、
 *   adStart（進入絕熱時的 { T, V, P, epoch }）、Wcum（活塞對氣體作功的累計 J）、t（ps）、modeTime、tChanges、Pset
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const rel = function (a, b) { return Math.abs(a - b) / Math.max(Math.abs(b), 1e-12); };
  /** 記錄量測：同一個狀態只留最新（平均時間最長）的一筆 */
  function keep(mem, rec, same, max) {
    const L = mem.list = mem.list || [];
    for (let i = L.length - 1; i >= 0; i--) {
      if (same(L[i], rec)) { L.splice(i, 1); break; }
    }
    L.push(rec);
    if (L.length > (max || 40)) L.shift();
    return L;
  }
  /** 等溫、等容、等壓時，氣體溫度要已接近恆溫槽（穩定） */
  function steady(d) { return d.bath && rel(d.T, d.Tset) < 0.03; }

  /** 循環：回到先前某個狀態（V、T 都在 3% 內），途中體積至少變化 30%，回傳淨功最大的那一段 */
  function cycle(mem, d, extra) {
    const L = mem.hist = mem.hist || [];
    const rec = { epoch: d.epoch, N: d.N, V: d.V, T: d.T, W: d.Wcum, t: d.t, mt: d.modeTime, tc: d.tChanges };
    const last = L[L.length - 1];
    // 狀態沒有明顯改變時只更新最後一筆（保留較長的歷史）
    if (last && last.epoch === rec.epoch && last.N === rec.N && last.tc === rec.tc && rel(last.V, rec.V) < 0.01 && rel(last.T, rec.T) < 0.015) L[L.length - 1] = rec;
    else L.push(rec);
    if (L.length > 400) L.shift();
    let best = -Infinity;
    for (let i = 0; i < L.length - 1; i++) {
      const o = L[i];
      if (o.epoch !== d.epoch || o.N !== d.N || d.t - o.t < 500) continue;
      if (rel(d.V, o.V) > 0.03 || rel(d.T, o.T) > 0.03) continue;
      let far = false;
      for (let j = i + 1; j < L.length - 1; j++) if (rel(L[j].V, o.V) >= 0.3) { far = true; break; }
      if (!far) continue;
      if (extra && !extra(o, d)) continue;
      best = Math.max(best, o.W - d.Wcum); // 氣體對外作的淨功 = −（活塞對氣體作功的變化）
    }
    return best;
  }

  LabMission.register('ideal-gas', [
    {
      id: 'ideal-gas-1', level: 1,
      title: { zh: '加倍的壓力', en: 'Double the pressure' },
      desc: { zh: '讓量到的壓力超過 200 kPa（至少平均 100 ps）。', en: 'Make the measured pressure exceed 200 kPa (averaged over at least 100 ps).' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && d.window >= 100 && d.P > 200; }
    },
    {
      id: 'ideal-gas-2', level: 2,
      title: { zh: '極地寒流', en: 'Polar vortex' },
      desc: { zh: '讓氣體的溫度（由分子動能量得）降到 100 K 以下（至少平均 100 ps）。', en: 'Bring the gas temperature (from the kinetic energy) below 100 K (averaged over at least 100 ps).' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && d.window >= 100 && d.T < 100; }
    },
    {
      id: 'ideal-gas-3', level: 3,
      title: { zh: '輕重都一樣', en: 'Heavy or light, same push' },
      desc: { zh: '用兩種不同的單一氣體，在相同的分子數、體積與恆溫槽溫度下各量一次壓力，兩者相差不到 2%（每次至少平均 300 ps）。', en: 'With two different single gases at the same number of molecules, volume and heat-bath temperature, measure the pressure of each; they must agree within 2% (each averaged over at least 300 ps).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'measure' || d.mix || d.window < 300 || !steady(d)) return false;
        const rec = { sp: d.spA, N: d.N, V: d.V, Tset: d.Tset, P: d.P };
        return keep(mem, rec, function (o, r) { return o.sp === r.sp && o.N === r.N && rel(o.V, r.V) < 0.002 && o.Tset === r.Tset; }).some(function (o) {
          return o.sp !== rec.sp && o.N === rec.N && rel(o.V, rec.V) < 0.005 && Math.abs(o.Tset - rec.Tset) < 0.05 && rel(rec.P, o.P) < 0.02;
        });
      }
    },
    {
      id: 'ideal-gas-4', level: 3,
      title: { zh: '波以耳定律', en: 'Boyle’s law' },
      desc: { zh: '在等溫過程中（分子數與溫度不變），把體積變成原來的一半（誤差 2% 內），並量到壓力變成兩倍（誤差 4% 內）。', en: 'In the isothermal process (same molecules, same temperature), halve the volume (within 2%) and measure the pressure doubling (within 4%).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'measure' || d.mode !== 'isothermal' || d.window < 150 || !steady(d)) return false;
        const rec = { epoch: d.epoch, N: d.N, Tset: d.Tset, V: d.V, P: d.P };
        return keep(mem, rec, function (o, r) { return o.epoch === r.epoch && o.Tset === r.Tset && rel(o.V, r.V) < 0.002; }).some(function (o) {
          if (o.epoch !== rec.epoch || o.N !== rec.N || o.Tset !== rec.Tset) return false;
          const big = o.V > rec.V ? o : rec, small = o.V > rec.V ? rec : o;
          const vr = big.V / small.V, pr = small.P / big.P;
          return Math.abs(vr - 2) <= 0.04 && Math.abs(pr - 2) <= 0.08;
        });
      }
    },
    {
      id: 'ideal-gas-5', level: 4,
      title: { zh: '給呂薩克定律', en: 'Gay-Lussac’s law' },
      desc: { zh: '在等容過程中，把恆溫槽的絕對溫度加倍（誤差 1% 內），並量到壓力也加倍（誤差 4% 內）。', en: 'In the isochoric process, double the absolute temperature of the heat bath (within 1%) and measure the pressure doubling too (within 4%).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'measure' || d.mode !== 'isochoric' || d.window < 150 || !steady(d)) return false;
        const rec = { epoch: d.epoch, N: d.N, Tset: d.Tset, V: d.V, P: d.P };
        return keep(mem, rec, function (o, r) { return o.epoch === r.epoch && o.Tset === r.Tset && rel(o.V, r.V) < 0.002; }).some(function (o) {
          if (o.epoch !== rec.epoch || o.N !== rec.N || rel(o.V, rec.V) > 0.005) return false;
          const hi = o.Tset > rec.Tset ? o : rec, lo = o.Tset > rec.Tset ? rec : o;
          return Math.abs(hi.Tset / lo.Tset - 2) <= 0.02 && Math.abs(hi.P / lo.P - 2) <= 0.08;
        });
      }
    },
    {
      id: 'ideal-gas-6', level: 5,
      title: { zh: '查理定律', en: 'Charles’s law' },
      desc: { zh: '在等壓過程中改變溫度，讓體積變成原來的 1.5 倍，而且量到的溫度也是原來的 1.5 倍（兩者誤差都在 3% 內）。', en: 'In the isobaric process change the temperature so that the volume becomes 1.5 times as large and the measured temperature is also 1.5 times as high (both within 3%).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'measure' || d.mode !== 'isobaric' || d.window < 150 || !steady(d) || !d.Pset) return false;
        const rec = { epoch: d.epoch, N: d.N, Pset: d.Pset, Tset: d.Tset, V: d.V, T: d.T };
        return keep(mem, rec, function (o, r) { return o.epoch === r.epoch && o.Pset === r.Pset && o.Tset === r.Tset; }).some(function (o) {
          if (o.epoch !== rec.epoch || o.N !== rec.N || rel(o.Pset, rec.Pset) > 0.005) return false;
          const hi = o.V > rec.V ? o : rec, lo = o.V > rec.V ? rec : o;
          return Math.abs(hi.V / lo.V - 1.5) <= 0.045 && Math.abs(hi.T / lo.T - 1.5) <= 0.045;
        });
      }
    },
    {
      id: 'ideal-gas-7', level: 6,
      title: { zh: '每秒 500 公尺', en: '500 metres per second' },
      desc: { zh: '只用一種氣體，讓量到的方均根速率等於 500 m/s（誤差 1% 內，至少平均 300 ps）。', en: 'With a single gas, make the measured root-mean-square speed 500 m/s (within 1%, averaged over at least 300 ps).' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && !d.mix && d.window >= 300 && Math.abs(d.vrmsA - 500) <= 5; }
    },
    {
      id: 'ideal-gas-8', level: 6,
      title: { zh: '輕與重，一樣快', en: 'Light and heavy, equally fast' },
      desc: { zh: '分別量兩種單一氣體（原子質量相差至少 5 倍），讓它們的方均根速率相等（相差 1.5% 以內，每次至少平均 300 ps）。', en: 'Measure two single gases separately (atomic masses at least 5 times apart) and make their root-mean-square speeds equal (within 1.5%, each averaged over at least 300 ps).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'measure' || d.mix || d.window < 300) return false;
        const rec = { sp: d.spA, m: d.mA, v: d.vrmsA, Tset: d.Tset, T: Math.round(d.T) };
        return keep(mem, rec, function (o, r) { return o.sp === r.sp && Math.abs(o.T - r.T) < 3; }).some(function (o) {
          return o.sp !== rec.sp && Math.max(o.m, rec.m) / Math.min(o.m, rec.m) >= 5 && rel(rec.v, o.v) < 0.015;
        });
      }
    },
    {
      id: 'ideal-gas-9', level: 7,
      title: { zh: '壓縮生熱', en: 'Heat from squeezing' },
      desc: { zh: '在絕熱過程中只靠推進活塞，讓氣體的溫度變成原來的 1.5 倍（誤差 2% 內）。', en: 'In the adiabatic process, using only the piston, make the gas temperature 1.5 times its starting value (within 2%).' },
      check: function (ev) {
        const d = ev.data, a = d.adStart;
        return ev.type === 'measure' && d.mode === 'adiabatic' && a && a.epoch === d.epoch && d.V < a.V && Math.abs(d.T / a.T - 1.5) <= 0.03;
      }
    },
    {
      id: 'ideal-gas-10', level: 8,
      title: { zh: '由混亂到平衡', en: 'From chaos to equilibrium' },
      desc: { zh: '在絕熱過程中混合兩種氣體（原子質量相差至少 5 倍），按「改成同一速率」，再等到兩種分子的平均動能相差不到 5%。', en: 'In the adiabatic process mix two gases (atomic masses at least 5 times apart), press “Give all the same speed”, then wait until the two kinds of molecules have mean kinetic energies within 5% of each other.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'measure' || d.mode !== 'adiabatic' || !d.mix || d.init !== 'same' || d.sinceInit < 800) return false;
        if (!(d.mB && Math.max(d.mA, d.mB) / Math.min(d.mA, d.mB) >= 5) || !(d.keA4 > 0 && d.keB4 > 0)) return false;
        return Math.abs(d.keA4 / d.keB4 - 1) < 0.05;
      }
    },
    {
      id: 'ideal-gas-11', level: 9,
      title: { zh: '熱機', en: 'Heat engine' },
      desc: { zh: '讓氣體繞一圈回到出發時的狀態（體積與溫度都在 3% 內，途中體積至少改變 30%），而且循環在 P–V 圖上圍成的面積（氣體對外作的淨功）至少 300 kPa·10³ nm³。', en: 'Take the gas round a loop back to its starting state (volume and temperature within 3%, with the volume changing by at least 30% on the way) so that the area of the loop on the P–V graph — the net work done by the gas — is at least 300 kPa·10³ nm³.' },
      check: function (ev, mem) {
        if (ev.type !== 'measure') return false;
        return cycle(mem, ev.data) >= 3e-19;
      }
    },
    {
      id: 'ideal-gas-12', level: 10,
      title: { zh: '卡諾循環', en: 'Carnot cycle' },
      desc: { zh: '只用等溫與絕熱兩種過程（途中不手動改變溫度），讓氣體繞一圈回到出發時的狀態（體積與溫度都在 3% 內），而且氣體對外作的淨功至少 200 kPa·10³ nm³。', en: 'Using only isothermal and adiabatic processes (without changing the temperature by hand on the way), take the gas round a loop back to its starting state (volume and temperature within 3%) with a net work by the gas of at least 200 kPa·10³ nm³.' },
      check: function (ev, mem) {
        if (ev.type !== 'measure') return false;
        return cycle(mem, ev.data, function (o, d) {
          const a = o.mt, b = d.modeTime;
          return (b.isochoric - a.isochoric) + (b.isobaric - a.isobaric) < 1 && b.adiabatic - a.adiabatic > 50 && b.isothermal - a.isothermal > 50 && o.tc === d.tChanges;
        }) >= 2e-19;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'ideal-gas-h1', level: 5, hidden: true,
      riddle: { zh: '水正猶豫要不要結冰的時候，整片天空剛好壓在你身上。', en: 'While water cannot decide whether to freeze, the whole sky rests exactly on you.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'measure' && d.bath && d.window >= 300 && Math.abs(d.T - 273.15) <= 2.7 && Math.abs(d.P - 101.325) <= 1.5;
      }
    },
    {
      id: 'ideal-gas-h2', level: 7, hidden: true,
      riddle: { zh: '沒有人取走一絲溫暖，溫暖卻只剩一半。', en: 'No one took away a single bit of warmth, yet only half of it remains.' },
      check: function (ev) {
        const d = ev.data, a = d.adStart;
        return ev.type === 'measure' && d.mode === 'adiabatic' && a && a.epoch === d.epoch && d.T <= 0.5 * a.T;
      }
    },
    {
      id: 'ideal-gas-h3', level: 4, hidden: true,
      riddle: { zh: '一整秒，連一百步都走不完。', en: 'A whole second, and not even a hundred paces.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'measure' && d.window >= 300 && (d.vrmsA < 100 || (d.vrmsB != null && d.vrmsB < 100));
      }
    }
  ]);
})();
