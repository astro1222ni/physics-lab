/* missions/phase-diagram.js — 相圖：三相點與臨界點的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/phase-diagram.js 只在使用者操作之後送出；判定的內容由 PDCore.tracker 產生，頁面與任務證明共用）：
  //   'cross'：每次真正的相變 { sub（'water'／'co2'／'iodine'）, from, to, kind（melt／freeze／boil／condense／sublime／deposit）, T（K）, P（Pa）,
  //            mode（'heat' 等壓加熱、'cool' 等壓冷卻、'press' 等溫加壓、'depress' 等溫減壓、'drag' 在圖上拖曳） }
  //   隱藏任務的相變都不接受 'drag'：在圖上亂拖會穿過很多條線，不可以亂拖就完成（要用路徑按鈕、滑桿、打字或方向鍵）
  //   'state'：使用者放好狀態點 { sub, T, P, phase, line（'triple'／'critical'／'vap'／'sub'／'melt'／null）, Tr, Pr, fluid, crit[], triple[], others[{ sub, Tr, Pr, fluid }] }
  //   'around'：液態變成氣態（或反過來）而沒有經過相變 { sub, from, to }
  //   'clap'：同一條線上兩個紀錄點的兩點式相變熱 { sub, kind（'vap'／'sub'）, dH（J/mol）, ratio（壓力比）, T1, T2, P1, P2, ref, err, drag（有一點是拖曳得到的） }
  //   'hess'：同一物質的昇華熱 − 汽化熱 對照熔化熱 { sub, dHsub, dHvap, dHfus, ref, err, span（離三相點最遠的溫差 K）, rSub, rVap, drag }
  const ATM = 101325;
  const cr = function (ev) { return ev.type === 'cross' && ev.data ? ev.data : null; };
  const st = function (ev) { return ev.type === 'state' && ev.data ? ev.data : null; };
  const near1 = function (P, tol) { return Math.abs(P / ATM - 1) <= tol; };

  LabMission.register('phase-diagram', [
    {
      id: 'phase-diagram-1', level: 1,
      title: { zh: '冰變成水', en: 'Ice into water' },
      desc: { zh: '選「水」，用「等壓加熱」讓冰熔化。', en: 'Choose “Water” and melt the ice with “Heat (constant P)”.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'water' && d.kind === 'melt' && d.mode === 'heat'; }
    },
    {
      id: 'phase-diagram-2', level: 2,
      title: { zh: '一大氣壓的沸點', en: 'Boiling at one atmosphere' },
      desc: { zh: '在 1 atm（誤差 2% 內）下等壓加熱，讓水沸騰。', en: 'Heat water at 1 atm (within 2%) at constant pressure until it boils.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'water' && d.kind === 'boil' && d.mode === 'heat' && near1(d.P, 0.02); }
    },
    {
      id: 'phase-diagram-3', level: 2,
      title: { zh: '乾冰不會濕', en: 'Dry ice stays dry' },
      desc: { zh: '在 1 atm（誤差 5% 內）下等壓加熱固態二氧化碳，看它直接昇華成氣體。', en: 'Heat solid carbon dioxide at 1 atm (within 5%) at constant pressure and watch it sublime straight into a gas.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'co2' && d.kind === 'sublime' && d.mode === 'heat' && near1(d.P, 0.05); }
    },
    {
      id: 'phase-diagram-4', level: 3,
      title: { zh: '高山上煮飯', en: 'Cooking on a mountain' },
      desc: { zh: '等壓加熱，讓水在 90 °C 以下就沸騰。', en: 'Heat water at constant pressure so that it boils below 90 °C.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'water' && d.kind === 'boil' && d.mode === 'heat' && d.T <= 363.15; }
    },
    {
      id: 'phase-diagram-5', level: 3,
      title: { zh: '壓力鍋', en: 'Pressure cooker' },
      desc: { zh: '等壓加熱，讓水到 120 °C 以上才沸騰。', en: 'Heat water at constant pressure so that it does not boil until 120 °C or more.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'water' && d.kind === 'boil' && d.mode === 'heat' && d.T >= 393.15; }
    },
    {
      id: 'phase-diagram-6', level: 4,
      title: { zh: '滅火器裡的液體', en: 'The liquid in the extinguisher' },
      desc: { zh: '讓二氧化碳在 25 °C（誤差 1 °C 內）成為液體。', en: 'Make carbon dioxide a liquid at 25 °C (within 1 °C).' },
      check: function (ev) { const d = st(ev); return !!d && d.sub === 'co2' && d.phase === 'liquid' && !d.line && Math.abs(d.T - 298.15) <= 1; }
    },
    {
      id: 'phase-diagram-7', level: 4,
      title: { zh: '碘也會熔化', en: 'Iodine can melt too' },
      desc: { zh: '在 1 atm（誤差 5% 內）下等壓加熱固態碘，讓它熔化成液體。', en: 'Heat solid iodine at 1 atm (within 5%) at constant pressure until it melts.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'iodine' && d.kind === 'melt' && d.mode === 'heat' && near1(d.P, 0.05); }
    },
    {
      id: 'phase-diagram-8', level: 5,
      title: { zh: '三相共存', en: 'Three phases at once' },
      desc: { zh: '把任一種物質的狀態點放在三相點上（溫度差 0.1 K、壓力差 2% 以內），讓固、液、氣同時存在。', en: 'Put the state of any substance on its triple point (within 0.1 K and 2% in pressure) so that solid, liquid and gas exist together.' },
      check: function (ev) { const d = st(ev); return !!d && d.line === 'triple'; }
    },
    {
      id: 'phase-diagram-9', level: 6,
      title: { zh: '加壓熔冰', en: 'Melting ice by pressure' },
      desc: { zh: '在 −1 °C 以下，用「等溫加壓」讓冰熔化。', en: 'At −1 °C or below, melt ice with “Compress (constant T)”.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'water' && d.kind === 'melt' && d.mode === 'press' && d.T <= 272.15; }
    },
    {
      id: 'phase-diagram-10', level: 6,
      title: { zh: '兩個沸點算汽化熱', en: 'Heat of vaporization from two boiling points' },
      desc: { zh: '記錄水在兩個壓力（相差 2 倍以上）的沸點，兩個沸點都在 70–130 °C 之間；用兩點式算出的莫耳汽化熱與 40.65 kJ/mol 相差 3% 以內。', en: 'Record the boiling point of water at two pressures at least a factor of 2 apart, both between 70 and 130 °C; the molar heat of vaporization from the two-point equation must be within 3% of 40.65 kJ/mol.' },
      check: function (ev) { const d = ev.type === 'clap' && ev.data; return !!d && d.sub === 'water' && d.kind === 'vap' && d.ratio >= 2 && Math.abs(d.err) <= 0.03 && Math.min(d.T1, d.T2) >= 343.15 && Math.max(d.T1, d.T2) <= 403.15; }
    },
    {
      id: 'phase-diagram-11', level: 7,
      title: { zh: '不沸騰也能變成氣體', en: 'From liquid to gas without boiling' },
      desc: { zh: '把一種液體變成氣體（或把氣體變成液體），途中完全不經過沸騰或凝結。', en: 'Turn a liquid into a gas (or a gas into a liquid) without ever boiling or condensing on the way.' },
      check: function (ev) { return ev.type === 'around' && !!ev.data; }
    },
    {
      id: 'phase-diagram-12', level: 8,
      title: { zh: '臨界點', en: 'The critical point' },
      desc: { zh: '把任一種物質的狀態點放在臨界點上（溫度差 0.2%、壓力差 1% 以內）。', en: 'Put the state of any substance on its critical point (within 0.2% in temperature and 1% in pressure).' },
      check: function (ev) { const d = st(ev); return !!d && d.line === 'critical'; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'phase-diagram-h1', level: 3, hidden: true,
      riddle: { zh: '沒有濕過，就乾了。', en: 'Dried without ever getting wet.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'water' && d.kind === 'sublime' && d.mode === 'heat'; }
    },
    {
      id: 'phase-diagram-h2', level: 4, hidden: true,
      riddle: { zh: '掀開鍋蓋的那一刻。', en: 'The moment the lid comes off.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'water' && d.kind === 'boil' && d.mode === 'depress' && d.T >= 378.15 && d.T <= 398.15; }
    },
    {
      id: 'phase-diagram-h3', level: 4, hidden: true,
      riddle: { zh: '煙還沒落地，就成了雪。', en: 'The smoke turned to snow before it landed.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'co2' && d.kind === 'deposit' && d.mode === 'cool' && near1(d.P, 0.05); }
    },
    {
      id: 'phase-diagram-h4', level: 5, hidden: true,
      riddle: { zh: '乾的冰，也會流淚。', en: 'Even the dry ice can shed tears.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'co2' && d.kind === 'melt' && d.mode !== 'drag' && d.P <= 6 * ATM; }
    },
    {
      id: 'phase-diagram-h5', level: 5, hidden: true,
      riddle: { zh: '溫溫的，就滾了。', en: 'Only lukewarm, and already boiling.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'water' && d.kind === 'boil' && d.T >= 293.15 && d.T <= 303.15 && d.mode !== 'drag'; }
    },
    {
      id: 'phase-diagram-h6', level: 6, hidden: true,
      riddle: { zh: '越逼它，它越硬。', en: 'The harder you press, the harder it gets.' },
      check: function (ev) { const d = cr(ev); return !!d && (d.sub === 'iodine' || (d.sub === 'co2' && d.P <= 30e6)) && d.kind === 'freeze' && d.mode === 'press'; }
    },
    {
      id: 'phase-diagram-h7', level: 7, hidden: true,
      riddle: { zh: '一鬆手，它反而凍住了。', en: 'Let go, and it freezes instead.' },
      check: function (ev) { const d = cr(ev); return !!d && d.sub === 'water' && d.kind === 'freeze' && d.mode === 'depress' && d.T <= 272.15; }
    },
    {
      id: 'phase-diagram-h8', level: 7, hidden: true,
      riddle: { zh: '身材不同，比例相同。', en: 'Different sizes, the same proportions.' },
      check: function (ev) {
        const d = st(ev);
        if (!d || !d.fluid || d.Tr < 0.6 || d.Tr > 0.95 || !d.others) return false;
        return d.others.some(function (o) {
          return o.sub !== d.sub && o.fluid && Math.abs(o.Tr - d.Tr) <= 0.005 && Math.abs(Math.log(o.Pr / d.Pr)) <= 0.02;
        });
      }
    },
    {
      id: 'phase-diagram-h9', level: 9, hidden: true,
      riddle: { zh: '三條路，都走到了盡頭。', en: 'Three roads, each walked to its very end.' },
      check: function (ev) { const d = st(ev); return !!d && d.crit && d.crit.length >= 3; }
    },
    {
      id: 'phase-diagram-h10', level: 10, hidden: true,
      riddle: { zh: '翻過山頭的力氣，等於先渡河、再爬坡。', en: 'The effort to cross the mountain equals fording the river and then climbing the slope.' },
      check: function (ev) {
        const d = ev.type === 'hess' && ev.data;
        return !!d && !d.drag && d.span <= 20 && d.rSub >= 1.5 && d.rVap >= 1.5 && Math.abs(d.err) <= 0.10;
      }
    }
  ]);
})();
