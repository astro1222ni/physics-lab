/* missions/heat-engine.js — 熱機循環與熱力學第一定律的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/heat-engine.js 回報；資料格式由 HeatEngineCore.report 產生，體積 L、壓力 kPa、溫度 K、能量 J）：
  //   'cycle'：使用者操作過之後，目前的循環（參數不變）每跑完一整圈送一次
  //     { type ('carnot'|'otto'|'diesel'|'stirling'|'brayton'|'custom'), gas ('mono'|'di'), n, reverse, regen, engine, fridge,
  //       Wout（引擎輸出的淨功）, Qin（從外界吸收的熱）, Qout（排給外界的熱）, eta, etaC（1 − T_min/T_max）, ratio（η/η_C）,
  //       KR, KHP, KRC, KHPC（逆向時的性能係數與卡諾上限）, Tmax, Tmin, verts（頂點數）, crossings（自訂多邊形自己交叉的次數）,
  //       各循環的參數 Th, Tc, VA, rB, r, rc, rp, T1, T3, V1, Vmin, P1, laps }
  //   'segment'：一段過程跑完 { type, kind, role, Q, W, dU, ... }
  //   'record'：按「記錄這個循環」 { row（同 cycle 的格式）, rows（比較表全部，最新的在最後） }
  //   'clear'：全部清除
  const cyc = function (ev) { return ev.type === 'cycle' ? ev.data : null; };
  const rowsOf = function (ev) { return ev.type === 'record' ? ev.data.rows || [] : null; };
  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
  const sameStirling = function (a, b) {
    return a.gas === b.gas && near(a.n, b.n, 1e-9) && near(a.Th, b.Th, 1e-9) && near(a.Tc, b.Tc, 1e-9) &&
      near(a.Vmin, b.Vmin, 1e-9) && near(a.r, b.r, 1e-9) && a.reverse === b.reverse;
  };

  // 比較表最後兩筆才是一組，避免舊資料與不相干的新記錄配對。
  function pair(ev, test) {
    const rows = rowsOf(ev);
    if (!rows || rows.length < 2) return false;
    const a = rows[rows.length - 2], b = rows[rows.length - 1];
    return a.gas === b.gas && test(a, b);
  }
  function equal(a, b, keys) { return keys.every(k => a[k] === b[k]); }
  // 精確倍率由可直接輸入的參數給出，1e-7 只吸收核心浮點誤差。
  function ratio(a, b, target, tol) { return b > 0 && near(a / b, target, tol == null ? 1e-7 : tol); }

  LabMission.register('heat-engine', [
    {
      id: 'heat-engine-1', level: 1,
      title: { zh: '拉開溫差', en: 'Widen the gap' },
      desc: { zh: '卡諾循環：把高溫熱庫與低溫熱庫的溫差 T_h − T_c 調到至少 500 K，讓引擎跑完一整圈。卡諾效率變成多少？', en: 'Carnot cycle: make the difference between the hot and cold reservoirs, T_h − T_c, at least 500 K and let the engine run one full cycle. What is the Carnot efficiency now?' },
      check: function (ev) { const d = cyc(ev); return !!d && d.type === 'carnot' && d.engine && d.Th - d.Tc >= 500; }
    },
    {
      id: 'heat-engine-2', level: 2,
      title: { zh: '六成的汽油引擎', en: 'A 60 % petrol engine' },
      desc: { zh: '奧圖循環（汽油引擎）：讓效率至少 60%，跑完一整圈。試試改壓縮比，也試試換一種氣體。', en: 'Otto cycle (petrol engine): reach an efficiency of at least 60 % and run one full cycle. Try changing the compression ratio — and the gas.' },
      check: function (ev) { const d = cyc(ev); return !!d && d.type === 'otto' && d.engine && d.eta >= 0.6; }
    },
    {
      id: 'heat-engine-3', level: 3,
      title: { zh: '四分之三', en: 'Three quarters' },
      desc: { zh: '卡諾循環：讓效率剛好是 75%（誤差 0.2 個百分點內），跑完一整圈。兩個熱庫的溫度比是多少？', en: 'Carnot cycle: make the efficiency exactly 75 % (within 0.2 percentage points) and run one full cycle. What is the ratio of the two reservoir temperatures?' },
      check: function (ev) { const d = cyc(ev); return !!d && d.type === 'carnot' && d.engine && near(d.eta, 0.75, 0.002); }
    },
    {
      id: 'heat-engine-4', level: 3,
      title: { zh: '噴射引擎', en: 'Jet engine' },
      desc: { zh: '布雷頓循環（燃氣渦輪、噴射引擎）：讓效率至少 50%，跑完一整圈。', en: 'Brayton cycle (gas turbine, jet engine): reach an efficiency of at least 50 % and run one full cycle.' },
      check: function (ev) { const d = cyc(ev); return !!d && d.type === 'brayton' && d.engine && d.eta >= 0.5; }
    },
    {
      id: 'heat-engine-5', level: 4,
      title: { zh: '一千焦耳', en: 'One kilojoule' },
      desc: { zh: '任選一種循環當熱機：讓每一圈對外輸出的淨功 W_out 剛好是 1000 J（誤差 1% 內），跑完一整圈。P–V 圖上圍成的面積是多少？', en: 'Any cycle run as an engine: make the net work output per cycle, W_out, exactly 1000 J (within 1 %) and run one full cycle. What area does the loop enclose on the P–V diagram?' },
      check: function (ev) { const d = cyc(ev); return !!d && d.engine && near(d.Wout, 1000, 10); }
    },
    {
      id: 'heat-engine-6', level: 5,
      title: { zh: '卡諾冰箱', en: 'A Carnot refrigerator' },
      desc: { zh: '讓卡諾循環逆向運轉（冰箱），使冷凍機性能係數 K_R 至少 5，跑完一整圈。兩個熱庫的溫度要怎麼選？', en: 'Run the Carnot cycle in reverse (a refrigerator) with a coefficient of performance K_R of at least 5, for one full cycle. How should you choose the two reservoir temperatures?' },
      check: function (ev) { const d = cyc(ev); return !!d && d.type === 'carnot' && d.fridge && d.KR >= 5; }
    },
    {
      id: 'heat-engine-7', level: 5,
      title: { zh: '同樣的壓縮比', en: 'Same compression ratio' },
      desc: { zh: '用同一種氣體、同樣的壓縮比 r（相差 0.05 內），分別記錄一筆奧圖循環與一筆狄塞爾循環（都當熱機）。誰的效率比較高？', en: 'With the same gas and the same compression ratio r (within 0.05), record one Otto cycle and one Diesel cycle (both as engines). Which is more efficient?' },
      check: function (ev) {
        const rows = rowsOf(ev);
        if (!rows) return false;
        return rows.some(function (o) {
          return o.type === 'otto' && o.engine && rows.some(function (d) { return d.type === 'diesel' && d.engine && d.gas === o.gas && near(d.r, o.r, 0.05) && o.eta > d.eta; });
        });
      }
    },
    {
      id: 'heat-engine-8', level: 6,
      title: { zh: '回熱器', en: 'The regenerator' },
      desc: { zh: '史特林循環當熱機：其他設定都不變，關掉回熱器記錄一筆、打開回熱器再記錄一筆。打開時的效率要等於卡諾效率（相差 0.1% 內），而且比關掉時高。', en: 'Stirling cycle as an engine: with everything else the same, record one row with the regenerator off and one with it on. With it on, the efficiency must equal the Carnot efficiency (within 0.1 %) and beat the run with it off.' },
      check: function (ev) {
        const rows = rowsOf(ev);
        if (!rows) return false;
        return rows.some(function (on) {
          return on.type === 'stirling' && on.regen && on.engine && Math.abs(on.eta / on.etaC - 1) <= 0.001 &&
            rows.some(function (off) { return off.type === 'stirling' && !off.regen && off.engine && sameStirling(on, off) && on.eta > off.eta; });
        });
      }
    },
    {
      id: 'heat-engine-9', level: 7,
      title: { zh: '殊途同歸', en: 'Different roads, same end' },
      desc: { zh: '用同一種氣體記錄一筆奧圖循環與一筆布雷頓循環（都當熱機，效率至少 30%），讓兩者的效率相同（相差 0.2 個百分點內）。壓縮比 r 與壓力比 r_p 有什麼關係？', en: 'With the same gas, record one Otto cycle and one Brayton cycle (both engines, efficiency at least 30 %) whose efficiencies are equal (within 0.2 percentage points). How are the compression ratio r and the pressure ratio r_p related?' },
      check: function (ev) {
        const rows = rowsOf(ev);
        if (!rows) return false;
        return rows.some(function (o) {
          return o.type === 'otto' && o.engine && o.eta >= 0.3 &&
            rows.some(function (b) { return b.type === 'brayton' && b.engine && b.gas === o.gas && b.eta >= 0.3 && near(b.eta, o.eta, 0.002); });
        });
      }
    },
    {
      id: 'heat-engine-10', level: 8,
      title: { zh: '柴油引擎的優勢', en: 'Why diesels win' },
      desc: { zh: '同一種氣體，記錄一筆奧圖循環與一筆狄塞爾循環（都當熱機）：兩者的最低溫相同（相差 1 K 內）、最高溫也相同（相差 1% 內），而且狄塞爾的效率至少高 1 個百分點。在相同的溫度限制下，為什麼柴油引擎比較省油？', en: 'With one gas, record an Otto cycle and a Diesel cycle (both engines) with the same lowest temperature (within 1 K) and the same highest temperature (within 1 %), the Diesel at least 1 percentage point more efficient. Under the same temperature limits, why does a diesel save fuel?' },
      check: function (ev) {
        const rows = rowsOf(ev);
        if (!rows) return false;
        return rows.some(function (o) {
          return o.type === 'otto' && o.engine && rows.some(function (d) {
            return d.type === 'diesel' && d.engine && d.gas === o.gas && near(d.Tmin, o.Tmin, 1) &&
              Math.abs(d.Tmax / o.Tmax - 1) <= 0.01 && d.eta >= o.eta + 0.01;
          });
        });
      }
    },
    {
      id: 'heat-engine-11', level: 9,
      title: { zh: '自己設計引擎', en: 'Design your own engine' },
      desc: { zh: '自訂循環當熱機：溫度全程保持在 200 K～2500 K 之間，每圈淨功至少 5000 J，效率至少 30%，跑完一整圈。拖曳頂點時，想想熱是在哪一段吸進來的。', en: 'A custom cycle as an engine: keep the temperature between 200 K and 2500 K all the way round, with a net work of at least 5000 J per cycle and an efficiency of at least 30 %, for one full cycle. As you drag the corners, think about where the heat comes in.' },
      check: function (ev) { const d = cyc(ev); return !!d && d.type === 'custom' && d.engine && d.Tmin >= 200 && d.Tmax <= 2500 && d.Wout >= 5000 && d.eta >= 0.3; }
    },
    {
      id: 'heat-engine-12', level: 10,
      title: { zh: '逼近卡諾', en: 'Closing in on Carnot' },
      desc: { zh: '用卡諾循環以外的循環當熱機（史特林不能開回熱器）：效率至少達到同一對最高、最低溫的卡諾效率的 97%（η/η_C ≥ 0.97），而且每圈淨功至少 2000 J，跑完一整圈。代價是什麼？', en: 'Use any cycle except Carnot (and no Stirling with the regenerator) as an engine: reach at least 97 % of the Carnot efficiency for the same highest and lowest temperatures (η/η_C ≥ 0.97) with at least 2000 J of net work per cycle, for one full cycle. What is the price?' },
      check: function (ev) {
        const d = cyc(ev);
        return !!d && d.engine && d.type !== 'carnot' && !(d.type === 'stirling' && d.regen) && d.ratio >= 0.97 && d.Wout >= 2000;
      }
    },
    {
      id: 'heat-engine-h1', level: 5, hidden: true,
      riddle: { zh: '繩結繞回自身，一半順流、一半逆流；收支相抵，薪火未熄。', en: 'A knot that loops back through itself, half with the current and half against it; the books balance, yet the fire still burns.' },
      check: function (ev) { const d = cyc(ev); return !!d && d.type === 'custom' && d.crossings >= 1 && d.Qin >= 1000 && Math.abs(d.Wout) <= 0.02 * d.Qin; }
    },
    {
      id: 'heat-engine-h2', level: 6, hidden: true,
      riddle: { zh: '冷與暖只隔一層薄紗時，一根羽毛就能搬走一座山。', en: 'When cold and warmth are only a veil apart, a feather can carry a mountain.' },
      check: function (ev) { const d = cyc(ev); return !!d && d.fridge && d.crossings === 0 && d.KR >= 50; }
    },
    {
      id: 'heat-engine-h3', level: 3, hidden: true,
      riddle: { zh: '不必倒轉時光，只要讓筆尖換一條路回家。', en: 'No need to turn back time; just let the pen take the other road home.' },
      check: function (ev) { const d = cyc(ev); return !!d && d.type === 'custom' && !d.reverse && d.fridge && d.crossings === 0; }
    },
    {
      id: 'heat-engine-h4', level: 3, hidden: true,
      riddle: { zh: '多添一桌客人，帳單也多了一張。', en: 'Another table of guests brings another bill.' },
      desc: { zh: '同一奧圖循環加倍莫耳數，淨功及吸熱量均加倍。', en: 'Double the charge of an otherwise identical Otto engine and double both work and heat input.' },
      check: (ev) => pair(ev, (a, b) => a.type === 'otto' && a.engine && b.engine &&
        equal(a, b, ['type', 'r', 'V1', 'T1', 'T3']) && ratio(b.n, a.n, 2) &&
        ratio(b.Wout, a.Wout, 2) && ratio(b.Qin, a.Qin, 2))
    },
    {
      id: 'heat-engine-h5', level: 4, hidden: true,
      riddle: { zh: '活塞搬了家，帳本上卻找不到搬家的日子。', en: 'The piston moved house without leaving a trace in the ledger.' },
      desc: { zh: '卡諾循環起始體積加倍，其餘不變，等溫支的吸熱量與淨功均不變。', en: 'Double the initial volume of a Carnot engine at fixed expansion ratio and reservoir temperatures, preserving heat input and net work.' },
      check: (ev) => pair(ev, (a, b) => a.type === 'carnot' && a.engine && b.engine &&
        equal(a, b, ['type', 'n', 'Th', 'Tc', 'rB']) && ratio(b.VA, a.VA, 2) &&
        ratio(b.Qin, a.Qin, 1) && ratio(b.Wout, a.Wout, 1))
    },
    {
      id: 'heat-engine-h6', level: 5, hidden: true,
      riddle: { zh: '原路回來時，兩扇門互換了收據。', en: 'On the return journey the doors exchange receipts.' },
      desc: { zh: '同一史特林循環開回熱器，記錄正轉與逆轉，驗出吸、放熱互換且淨功變號。', en: 'Record a regenerated Stirling cycle forward and backward; heat input and rejection swap and work changes sign.' },
      check: (ev) => pair(ev, (a, b) => a.type === 'stirling' && a.engine && b.fridge && a.regen &&
        equal(a, b, ['type', 'n', 'Th', 'Tc', 'r', 'Vmin', 'regen']) &&
        ratio(b.Qin, a.Qout, 1) && ratio(b.Qout, a.Qin, 1) && ratio(-b.Wout, a.Wout, 1))
    },
    {
      id: 'heat-engine-h7', level: 7, hidden: true,
      riddle: { zh: '摺痕照自己再摺一回，帳上多出一份原稿。', en: 'Fold the crease over itself and the ledger gains a second copy.' },
      desc: { zh: '史特林引擎體積比取平方，固定溫度與物質量，驗證淨功與體積比的對數成正比。', en: 'Square the Stirling volume ratio at fixed temperatures and charge to double the logarithmic work.' },
      check: (ev) => pair(ev, (a, b) => a.type === 'stirling' && a.engine && b.engine &&
        equal(a, b, ['type', 'n', 'Th', 'Tc', 'Vmin', 'regen']) && ratio(b.r, a.r * a.r, 1) &&
        ratio(b.Wout, a.Wout, 2))
    },
    {
      id: 'heat-engine-h8', level: 7, hidden: true,
      riddle: { zh: '一具引擎有兩張底片，洗出來的輪廓重合。', en: 'Two negatives of one engine develop into the same outline.' },
      desc: { zh: '狄塞爾循環固定壓縮比及截斷比，進氣絕對溫度加倍，最高溫和淨功也加倍，效率不變。', en: 'Double the Diesel inlet temperature at fixed geometry and cutoff: peak temperature and work double at unchanged efficiency.' },
      check: (ev) => pair(ev, (a, b) => a.type === 'diesel' && a.engine && b.engine &&
        equal(a, b, ['type', 'n', 'r', 'rc', 'V1']) && ratio(b.T1, a.T1, 2) &&
        ratio(b.Tmax, a.Tmax, 2) && ratio(b.Wout, a.Wout, 2) && ratio(b.eta, a.eta, 1))
    },
    {
      id: 'heat-engine-h9', level: 9, hidden: true,
      riddle: { zh: '山脊兩側的腳印一樣深，山頂還留著第三個位置。', en: 'Equal footprints flank the ridge; a third place waits at the crest.' },
      desc: { zh: '固定布雷頓兩端溫度，記錄兩個不同壓力比的等功點，再記錄壓縮終溫為幾何平均的最大淨功點。', en: 'At fixed Brayton endpoints, record equal-work flanks, then maximum work where the compressor outlet reaches the geometric mean.' },
      check: function (ev) {
        const rows = rowsOf(ev);
        if (!rows || rows.length < 3) return false;
        const [a, b, c] = rows.slice(-3);
        if (![a, b, c].every(d => d.type === 'brayton' && d.engine && equal(d, c, ['gas', 'n', 'T1', 'T3', 'P1']))) return false;
        const exponent = c.gas === 'mono' ? 2 / 5 : 2 / 7;
        // 壓力比可輸入至 0.01；三筆容許 0.2% 的取整誤差，兩側功須顯著低於頂點。
        return a.rp < c.rp && c.rp < b.rp && ratio(a.Wout, b.Wout, 1, 0.002) &&
          c.Wout > 1.03 * Math.max(a.Wout, b.Wout) && ratio(c.T1 * Math.pow(c.rp, exponent), Math.sqrt(c.T1 * c.T3), 1, 0.002);
      }
    },
    {
      id: 'heat-engine-h10', level: 10, hidden: true,
      riddle: { zh: '兩支溫度計走了同一段路，爐邊卻留下不同的欠條。', en: 'Two thermometers travel equally far and leave different debts at the furnace.' },
      desc: { zh: '同種等量氣體在奧圖與布雷頓的吸熱段等幅升溫，兩段起始溫度不同，量出吸熱比 Cp/Cv。', en: 'Match the heating spans of Otto and Brayton engines at different compressor outlet temperatures and measure the heat-capacity ratio.' },
      check: (ev) => pair(ev, (a, b) => {
        if (a.type !== 'otto' || b.type !== 'brayton' || !a.engine || !b.engine || a.n !== b.n) return false;
        const gamma = a.gas === 'mono' ? 5 / 3 : 7 / 5;
        const ta = a.T1 * Math.pow(a.r, gamma - 1), tb = b.T1 * Math.pow(b.rp, 1 - 1 / gamma);
        // 溫度輸入至 1 K，壓力比至 0.01。
        return Math.abs(ta - tb) >= 100 && a.T3 - ta >= 200 && near(a.T3 - ta, b.T3 - tb, 1) &&
          ratio(b.Qin, a.Qin, gamma, 0.005);
      })
    }
  ]);
})();
