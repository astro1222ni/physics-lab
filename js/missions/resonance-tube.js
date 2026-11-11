/* missions/resonance-tube.js — 氣柱的共鳴（共鳴管測聲速）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/resonance-tube.js 發出，都要使用者先操作過才會發出）：
  //   tuned：聲音在響、使用者移動水面（或敲音叉）時 { src, f, Tc, d, L, n 最接近的共鳴次序, below 比該共鳴峰值低幾 dB, db }
  //   record：按「記錄」{ src, f, Tc, d, Lread 讀數, Ltrue 真正水面, below, n, noisy, clusters }
  //   analysis：數據表改變後（記錄或刪除）目前條件的分析
  //     { src, f, Tc, d, count 共鳴點數, ns, consistent, nReadings, perCluster 每個共鳴點量了幾次, noisy（全部讀數含誤差）,
  //       v, errPct, e, eTheory, lambda, groups[各條件的分析], fitForks, fitV, fitErrPct（λ–1/f 圖）, records[全部讀數] }
  //   guess：神秘音叉核對 { fTrue, fGuess, errPct, clusters, consistent }
  // 長度單位 m；src = 'fork'（音叉）、'app'（手機）、'mystery'（神秘音叉，分析時不知道頻率）。
  const known = function (d) { return d.src !== 'mystery'; };
  const valid = function (g) { return g.count >= 2 && g.consistent; };
  const an = function (ev) { return ev.type === 'analysis' && valid(ev.data); };

  LabMission.register('resonance-tube', [
    {
      id: 'resonance-tube-1', level: 1,
      title: { zh: '聽見共鳴', en: 'Hear the resonance' },
      desc: { zh: '讓聲源發聲，移動水面到第一個共鳴位置（響度在峰值 1 dB 以內）。', en: 'With the source sounding, move the water to the first resonance (loudness within 1 dB of the peak).' },
      check: function (ev) { const d = ev.data; return ev.type === 'tuned' && d.n === 1 && d.below <= 1; }
    },
    {
      id: 'resonance-tube-2', level: 2,
      title: { zh: '套上橡皮筋', en: 'Mark it with a rubber band' },
      desc: { zh: '在一個共鳴位置按「記錄」（水面在該共鳴峰值 3 dB 以內）。', en: 'Press “Record” at a resonance (the water within 3 dB of that peak).' },
      check: function (ev) { return ev.type === 'record' && ev.data.below <= 3; }
    },
    {
      id: 'resonance-tube-3', level: 3,
      title: { zh: '第二個共鳴點', en: 'The second resonance' },
      desc: { zh: '同一支音叉、同一個條件下，記錄第 1 次與第 2 次共鳴的位置。', en: 'With the same fork and conditions, record the positions of the 1st and 2nd resonances.' },
      check: function (ev) { const d = ev.data; return an(ev) && d.ns.indexOf(1) >= 0 && d.ns.indexOf(2) >= 0; }
    },
    {
      id: 'resonance-tube-4', level: 4,
      title: { zh: '測出聲速', en: 'Measure the speed of sound' },
      desc: { zh: '由相鄰共鳴點的間距求出聲速，與此室溫的理論值相差 2% 以內。', en: 'From the spacing of neighbouring resonances, get a speed of sound within 2% of the theoretical value at this temperature.' },
      check: function (ev) { const d = ev.data; return an(ev) && known(d) && Math.abs(d.errPct) <= 2; }
    },
    {
      id: 'resonance-tube-5', level: 5,
      title: { zh: '三條橡皮筋', en: 'Three rubber bands' },
      desc: { zh: '同一支音叉找出並記錄至少 3 個不同的共鳴位置，聲速誤差 3% 以內。', en: 'With one fork, find and record at least 3 different resonances, with the speed of sound within 3%.' },
      check: function (ev) { const d = ev.data; return an(ev) && known(d) && d.count >= 3 && Math.abs(d.errPct) <= 3; }
    },
    {
      id: 'resonance-tube-6', level: 6,
      title: { zh: '量出管口修正', en: 'Measure the end correction' },
      desc: { zh: '由至少 2 個共鳴點算出的管口修正 e，與理論值 0.61r 相差 2 mm 以內。', en: 'From at least 2 resonances, get an end correction e within 2 mm of the theoretical 0.61r.' },
      check: function (ev) { const d = ev.data; return an(ev) && Math.abs(d.e - d.eTheory) <= 0.002; }
    },
    {
      id: 'resonance-tube-7', level: 6,
      title: { zh: '千分之三', en: 'Three parts in a thousand' },
      desc: { zh: '測得的聲速與理論值相差 0.3% 以內。', en: 'Measure the speed of sound within 0.3% of the theoretical value.' },
      check: function (ev) { const d = ev.data; return an(ev) && known(d) && Math.abs(d.errPct) <= 0.3; }
    },
    {
      id: 'resonance-tube-8', level: 7,
      title: { zh: '冷天與熱天', en: 'A cold day and a hot day' },
      desc: { zh: '同一支音叉，在相差至少 15 °C 的兩個室溫下各測出聲速（誤差都在 1% 以內）。比較共鳴位置往哪裡移。', en: 'With the same fork, measure the speed of sound at two room temperatures at least 15 °C apart (both within 1%). Which way do the resonances move?' },
      check: function (ev) {
        if (ev.type !== 'analysis') return false;
        const gs = ev.data.groups.filter(function (g) { return valid(g) && known(g) && Math.abs(g.errPct) <= 1; });
        return gs.some(function (a) { return gs.some(function (b) { return a.src === b.src && a.f === b.f && b.Tc - a.Tc >= 15; }); });
      }
    },
    {
      id: 'resonance-tube-9', level: 8,
      title: { zh: '一條直線上的音叉', en: 'Forks on a straight line' },
      desc: { zh: '同一室溫下用至少 3 種頻率各量出波長，λ–1/f 圖的斜率求得的聲速誤差 0.5% 以內。', en: 'At one room temperature, measure the wavelength for at least 3 frequencies; the slope of the λ–1/f graph gives the speed of sound within 0.5%.' },
      check: function (ev) { const d = ev.data; return ev.type === 'analysis' && d.fitForks >= 3 && Math.abs(d.fitErrPct) <= 0.5; }
    },
    {
      id: 'resonance-tube-10', level: 8,
      title: { zh: '破解神秘音叉', en: 'Crack the mystery fork' },
      desc: { zh: '用神秘音叉量出至少 2 個共鳴點，推算它的頻率，誤差 0.5% 以內。', en: 'Record at least 2 resonances with the mystery fork and work out its frequency within 0.5%.' },
      check: function (ev) { const d = ev.data; return ev.type === 'guess' && d.clusters >= 2 && d.consistent && Math.abs(d.errPct) <= 0.5; }
    },
    {
      id: 'resonance-tube-11', level: 9,
      title: { zh: '粗管與細管', en: 'Thick tube, thin tube' },
      desc: { zh: '同一支音叉、同一室溫，在內徑相差至少 2 cm 的兩支管子各量出管口修正，兩者都與理論值相差 2 mm 以內。', en: 'With the same fork and temperature, measure the end correction in two tubes whose inner diameters differ by at least 2 cm; both within 2 mm of theory.' },
      check: function (ev) {
        if (ev.type !== 'analysis') return false;
        const gs = ev.data.groups.filter(function (g) { return valid(g) && known(g) && Math.abs(g.e - g.eTheory) <= 0.002; });
        return gs.some(function (a) { return gs.some(function (b) { return a.src === b.src && a.f === b.f && a.Tc === b.Tc && b.d - a.d >= 0.02 - 1e-9; }); });
      }
    },
    {
      id: 'resonance-tube-12', level: 10,
      title: { zh: '在雜音中求真', en: 'Precision through the noise' },
      desc: { zh: '在「含誤差」模式下，同一支音叉至少 2 個共鳴點、每個共鳴點都量 3 次以上取平均，聲速誤差 0.3% 以內。', en: 'In “With errors” mode, with one fork, measure at least 2 resonances 3 or more times each and average; get the speed of sound within 0.3%.' },
      check: function (ev) {
        const d = ev.data;
        return an(ev) && known(d) && d.noisy && d.perCluster.every(function (k) { return k >= 3; }) && Math.abs(d.errPct) <= 0.3;
      }
    },
    {
      id: 'resonance-tube-h1', level: 5, hidden: true,
      riddle: { zh: '九分深處，仍有回音。', en: 'Nine tenths of the way down, something still answers.' },
      check: function (ev) { return ev.type === 'record' && ev.data.below <= 3 && ev.data.Ltrue >= 0.9; }
    },
    {
      id: 'resonance-tube-h2', level: 6, hidden: true,
      riddle: { zh: '水將成冰的清晨，替風量一量步伐。', en: 'On a dawn when water is about to freeze, pace out the stride of the wind.' },
      check: function (ev) { const d = ev.data; return an(ev) && known(d) && d.Tc <= 1 && Math.abs(d.errPct) <= 1; }
    },
    {
      id: 'resonance-tube-h3', level: 8, hidden: true,
      riddle: { zh: '一條橡皮筋，兩種嗓音都說是它的。', en: 'One rubber band, claimed by two different voices.' },
      check: function (ev) {
        if (ev.type !== 'analysis') return false;
        const rs = ev.data.records.filter(function (r) { return r.below <= 3; });
        return rs.some(function (a) {
          return rs.some(function (b) { return a.f !== b.f && a.Tc === b.Tc && a.d === b.d && Math.abs(a.Lread - b.Lread) <= 0.002; });
        });
      }
    }
  ]);
})();
