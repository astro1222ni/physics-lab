/* missions/specific-heat.js — 比熱與熱平衡的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const CW = 4186, LF = 3.34e5;
  const rel = function (a, b) { return Math.abs(a / b - 1); };
  const liquid = function (q) { return q && q.kind === 'sens' && q.p === 1; };

  LabMission.register('specific-heat', [
    {
      id: 'specific-heat-1', level: 1,
      title: { zh: '第一次熱平衡', en: 'First equilibrium' },
      desc: { zh: '在量熱器中放入任何一個樣品，等到樣品與水達到熱平衡。', en: 'Drop any sample into the calorimeter and wait until it and the water reach thermal equilibrium.' },
      check: function (ev) { return ev.type === 'mix'; }
    },
    {
      id: 'specific-heat-2', level: 2,
      title: { zh: '沒有熱流', en: 'No heat flow' },
      desc: { zh: '把一塊溫度與水相同（相差不超過 0.1 °C）的金屬或玻璃放進量熱器。熱會流動嗎？', en: 'Put a metal or glass sample at the same temperature as the water (within 0.1 °C) into the calorimeter. Does any heat flow?' },
      check: function (ev) { const d = ev.data; return ev.type === 'mix' && d.sub !== 'h2o' && Math.abs(d.T1 - d.T2) <= 0.1; }
    },
    {
      id: 'specific-heat-3', level: 2,
      title: { zh: '同樣的熱量', en: 'The same heat' },
      desc: { zh: '在「比熱比較」中至少放 3 種材料，在每個物體都剛好吸收 20.0 kJ 熱量的時刻按暫停（誤差 ±0.2 kJ）。誰升溫最多？', en: 'In “Compare”, use at least 3 materials and pause at the moment each one has received exactly 20.0 kJ of heat (±0.2 kJ). Which warmed up the most?' },
      check: function (ev) { const d = ev.data; return ev.type === 'pause' && d.mode === 'cmp' && d.n >= 3 && Math.abs(d.Q - 20000) <= 200; }
    },
    {
      id: 'specific-heat-4', level: 3,
      title: { zh: '剛好 40 °C', en: 'Exactly 40 °C' },
      desc: { zh: '把一塊鐵放進量熱器（不散熱），讓最後的平衡溫度是 40.0 °C（誤差 ±0.1 °C）。', en: 'Drop an iron block into the calorimeter (no heat loss) so that the final equilibrium temperature is 40.0 °C (±0.1 °C).' },
      check: function (ev) { const d = ev.data; return ev.type === 'mix' && d.mat === 'fe' && !d.loss && Math.abs(d.Tf - 40) <= 0.1; }
    },
    {
      id: 'specific-heat-5', level: 4,
      title: { zh: '量出水的比熱', en: 'Measure the specific heat of water' },
      desc: { zh: '在「加熱曲線」中加熱水（不散熱），在液態的部分記錄兩個點（相隔至少 10 s），由 PΔt/(mΔT) 算出的比熱與 4186 相差 2% 以內。', en: 'In “Heating curve”, heat water (no heat loss) and record two points on the liquid part, at least 10 s apart, so that PΔt/(mΔT) is within 2% of 4186.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'record' && d.sub === 'h2o' && !d.loss && liquid(d.p1) && liquid(d.p2) && d.dt >= 10 && d.c != null && rel(d.c, CW) <= 0.02;
      }
    },
    {
      id: 'specific-heat-6', level: 5,
      title: { zh: '神秘金屬', en: 'The mystery metal' },
      desc: { zh: '在「樣品」選「神秘金屬」（c = ?），用實驗量出它的比熱，再到「神秘金屬」卡片輸入答案，誤差 3% 以內。', en: 'Choose “Mystery metal” (c = ?) as the “Sample”, measure its specific heat, then enter it in the “Mystery metal” card, within 3%.' },
      check: function (ev) { const d = ev.data; return ev.type === 'guess' && d.measured && Math.abs(d.err) <= 0.03; }
    },
    {
      id: 'specific-heat-7', level: 6,
      title: { zh: '剛好全部融化', en: 'Just melted' },
      desc: { zh: '把至少 50 g 的冰放進量熱器（不散熱），讓冰全部融化、最後溫度卻不超過 0.3 °C。', en: 'Drop at least 50 g of ice into the calorimeter (no heat loss) so that all the ice melts but the final temperature is no higher than 0.3 °C.' },
      check: function (ev) { const d = ev.data; return ev.type === 'mix' && d.mat === 'ice' && !d.loss && d.m1 >= 0.05 && d.ice <= 1e-7 && d.Tf <= 0.3; }
    },
    {
      id: 'specific-heat-8', level: 6,
      title: { zh: '平均的祕密', en: 'The secret of the average' },
      desc: { zh: '把銅塊放進量熱器（不散熱，銅與水的初溫相差至少 50 °C），讓最後溫度剛好是兩個初溫的平均（誤差 ±0.05 °C）。', en: 'Drop a copper block into the calorimeter (no heat loss, starting temperatures at least 50 °C apart) so that the final temperature is exactly the average of the two starting temperatures (±0.05 °C).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'mix' && d.mat === 'cu' && !d.loss && Math.abs(d.T1 - d.T2) >= 50 && Math.abs(d.Tf - (d.T1 + d.T2) / 2) <= 0.05;
      }
    },
    {
      id: 'specific-heat-9', level: 7,
      title: { zh: '量出熔化熱', en: 'Measure the heat of fusion' },
      desc: { zh: '加熱冰（不散熱），在熔化平台的開始與結束各記錄一個點（溫度都在 0 ± 0.5 °C），由 PΔt/m 算出的熔化熱與 334 kJ/kg 相差 3% 以內。', en: 'Heat ice (no heat loss) and record one point at the start and one at the end of the melting plateau (both within 0 ± 0.5 °C), so that PΔt/m is within 3% of 334 kJ/kg.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'record' && d.sub === 'h2o' && !d.loss && Math.abs(d.p1.T) <= 0.5 && Math.abs(d.p2.T) <= 0.5 && d.dt > 0 && rel(d.L, LF) <= 0.03;
      }
    },
    {
      id: 'specific-heat-10', level: 8,
      title: { zh: '準時沸騰', en: 'Boiling on time' },
      desc: { zh: '加熱至少 0.5 kg、起始溫度不高於 −10 °C 的冰（不散熱），讓水剛好在 t = 300 s 開始沸騰（誤差 ±1 s）。', en: 'Heat at least 0.5 kg of ice starting at −10 °C or colder (no heat loss) so that the water starts to boil at exactly t = 300 s (±1 s).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'phase' && d.kind === 'boil-start' && d.sub === 'h2o' && !d.loss && d.m >= 0.5 && d.T0 <= -10 && Math.abs(d.t - 300) <= 1;
      }
    },
    {
      id: 'specific-heat-11', level: 9,
      title: { zh: '散熱也不怕', en: 'Beating the heat loss' },
      desc: { zh: '打開散熱，加熱液態的水，記錄兩個溫度相差至少 10 °C 的點，算出的比熱仍與 4186 相差 1% 以內。', en: 'With heat loss on, heat liquid water and record two points at least 10 °C apart, and still get a specific heat within 1% of 4186.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'record' && d.sub === 'h2o' && d.loss && liquid(d.p1) && liquid(d.p2) && Math.abs(d.dT) >= 10 && d.c != null && rel(d.c, CW) <= 0.01;
      }
    },
    {
      id: 'specific-heat-12', level: 10,
      title: { zh: '大師：冰、水與杯', en: 'Master: ice, water and cup' },
      desc: { zh: '把起始溫度不高於 −10 °C 的冰放進熱容量至少 100 J/K 的量熱杯（不散熱），讓最後溫度剛好是 10.00 °C（誤差 ±0.05 °C）。', en: 'Drop ice at −10 °C or colder into a calorimeter whose cup has a heat capacity of at least 100 J/K (no heat loss) so that the final temperature is exactly 10.00 °C (±0.05 °C).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'mix' && d.mat === 'ice' && !d.loss && d.T1 <= -10 && d.Ccup >= 100 && Math.abs(d.Tf - 10) <= 0.05;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'specific-heat-h1', level: 6, hidden: true,
      riddle: { zh: '冬天落進了杯子，離開時帶走的，比來時還多。', en: 'Winter fell into the cup, and left with more than it brought.' },
      check: function (ev) { const d = ev.data; return ev.type === 'mix' && !d.loss && d.ice > d.ice0 + 0.001; }
    },
    {
      id: 'specific-heat-h2', level: 5, hidden: true,
      riddle: { zh: '一塊石頭，讓一杯水想起了天空。', en: 'A single stone made a cup of water remember the sky.' },
      check: function (ev) { const d = ev.data; return ev.type === 'mix' && !d.loss && d.steam > 1e-4; }
    },
    {
      id: 'specific-heat-h3', level: 7, hidden: true,
      riddle: { zh: '給予與失去，終於握手言和。', en: 'Giving and losing finally shake hands.' },
      check: function (ev) { const d = ev.data; return ev.type === 'steady' && d.loss && d.P > 0; }
    }
  ]);
})();
