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
    }
  ]);
})();
