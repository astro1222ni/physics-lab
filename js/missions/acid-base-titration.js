/* missions/acid-base-titration.js — 酸鹼滴定的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/acid-base-titration.js 只在使用者操作之後回報）：
  //   'settle'：一次加入（一滴、半滴，或關上活栓）的液體全部落進錐形瓶、停下來的時候
  //     { sys（sa 強酸＋強鹼、wa 醋酸＋NaOH、wb 氨＋HCl、mx 未知弱酸＋NaOH）, Ca, Va, Vw, Cb（濃度 M、體積 mL）,
  //       V（已加入錐形瓶的滴定液 mL）, Vread（滴定管讀數 mL）, Veq（理論當量點 mL）, pH, pH0（起點）, dir（+1 NaOH、−1 HCl）,
  //       meter（pH 計在瓶中）, meterUsed, ind（none php mo mr btb）, indFixed（加入滴定液後沒換過指示劑）,
  //       fb（指示劑鹼型比例）, moved, empty（滴定管流空了）, curves（圖上的曲線：[{ sys, Ca, Va, Vw, Cb, Vmax, Veq }]） }
  //   'endpoint'：按「記錄終點」{ sys, Ca, Va, Vw, Cb, Vend（滴定管流出的總量 mL）, Veq, err（Vend − Veq）, pH, pHeq,
  //       ind, indFixed, moved, changed（顏色已經變了）, covers（指示劑的變色範圍包含當量點 pH）, meterUsed, mystery }
  //   'answer'：未知弱酸按「核對答案」{ c, pKa, Ka, cTrue, KaTrue, errC, errKa（相對誤差）, revealed, flasks（這個樣品用了幾瓶） }
  const E = 1e-9;
  const isS = function (ev) { return ev.type === 'settle' && ev.data; };
  const isE = function (ev) { return ev.type === 'endpoint' && ev.data; };
  const isA = function (ev) { return ev.type === 'answer' && ev.data && !ev.data.revealed; };
  const same = function (a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); };

  LabMission.register('acid-base-titration', [
    {
      id: 'acid-base-titration-1', level: 1,
      title: { zh: '粉紅色的訊號', en: 'The pink signal' },
      desc: { zh: '加酚酞，用 NaOH 滴定，讓整瓶溶液轉成粉紅色。', en: 'Add phenolphthalein, titrate with NaOH and turn the whole flask pink.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.ind === 'php' && d.dir > 0 && d.indFixed && d.fb >= 0.5; }
    },
    {
      id: 'acid-base-titration-2', level: 2,
      title: { zh: '讀準滴定管', en: 'Read the burette' },
      desc: { zh: '讓滴定管的讀數停在 10.00 mL：快到的時候改成一滴一滴加。', en: 'Stop with the burette reading exactly 10.00 mL: switch to single drops as you get close.' },
      check: function (ev) { const d = ev.data; return isS(ev) && Math.abs(d.Vread - 10) < 1e-6; }
    },
    {
      id: 'acid-base-titration-3', level: 3,
      title: { zh: '用顏色找終點', en: 'Find the end point by colour' },
      desc: { zh: '加一種指示劑，在顏色改變的那一刻按「記錄終點」：終點和當量點相差不超過 0.10 mL。', en: 'Use an indicator and press “Record end point” the moment the colour changes: the end point must be within 0.10 mL of the equivalence point.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.ind !== 'none' && d.changed && d.indFixed && Math.abs(d.err) <= 0.1 + E; }
    },
    {
      id: 'acid-base-titration-4', level: 4,
      title: { zh: '停在半當量點', en: 'Stop at half-equivalence' },
      desc: { zh: '醋酸＋NaOH：剛好加入當量點一半的體積（±0.05 mL），看 pH 計：這時 pH 約等於醋酸的 pKa。', en: 'Acetic acid + NaOH: add exactly half of the equivalence volume (±0.05 mL) and look at the pH meter — now the pH is close to the pKa of acetic acid.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.sys === 'wa' && d.meter && Math.abs(d.V - d.Veq / 2) <= 0.05 + E; }
    },
    {
      id: 'acid-base-titration-5', level: 5,
      title: { zh: '恰好中和', en: 'Exactly neutralised' },
      desc: { zh: '鹽酸＋NaOH：讓 pH 計顯示 7.00（誤差 0.01 以內）——多一滴、少一滴都不行，最後要用半滴。', en: 'Hydrochloric acid + NaOH: make the pH meter read 7.00 (within 0.01). One drop too many or too few will not do — finish with half drops.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.sys === 'sa' && d.meter && Math.abs(d.pH - 7) <= 0.01; }
    },
    {
      id: 'acid-base-titration-6', level: 5,
      title: { zh: '強酸與弱酸的兩條曲線', en: 'Strong and weak, side by side' },
      desc: { zh: '鹽酸和醋酸各滴定一次（待測液的濃度與體積、另加的水、NaOH 的濃度都相同），都加到當量點體積的 1.5 倍以上，讓兩條滴定曲線同時留在圖上比較。', en: 'Titrate hydrochloric acid and acetic acid once each (same sample concentration and volume, same added water, same NaOH concentration), each to at least 1.5 times the equivalence volume, so both curves stay on the graph together.' },
      check: function (ev) {
        const d = ev.data;
        if (!isS(ev) || !d.curves) return false;
        const full = function (c) { return c.Vmax >= 1.5 * c.Veq - E; };
        const S = d.curves.filter(function (c) { return c.sys === 'sa' && full(c); });
        const W = d.curves.filter(function (c) { return c.sys === 'wa' && full(c); });
        return S.some(function (a) {
          return W.some(function (b) { return same(a.Ca, b.Ca) && same(a.Va, b.Va) && same(a.Vw, b.Vw) && same(a.Cb, b.Cb); });
        });
      }
    },
    {
      id: 'acid-base-titration-7', level: 6,
      title: { zh: '為弱酸選對指示劑', en: 'The right indicator for a weak acid' },
      desc: { zh: '醋酸＋NaOH：選一種變色範圍包含當量點 pH 的指示劑，用顏色判斷終點，誤差不超過 0.10 mL。', en: 'Acetic acid + NaOH: choose an indicator whose colour-change range contains the pH at the equivalence point and judge the end point by colour, within 0.10 mL.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.sys === 'wa' && d.covers && d.changed && d.indFixed && Math.abs(d.err) <= 0.1 + E; }
    },
    {
      id: 'acid-base-titration-8', level: 7,
      title: { zh: '換弱鹼上場', en: 'Now a weak base' },
      desc: { zh: '氨水＋HCl：選對指示劑（變色範圍包含當量點 pH），用顏色判斷終點，誤差不超過 0.10 mL。', en: 'Ammonia + HCl: choose the right indicator (its range must contain the pH at the equivalence point) and judge the end point by colour, within 0.10 mL.' },
      check: function (ev) { const d = ev.data; return isE(ev) && d.sys === 'wb' && d.covers && d.changed && d.indFixed && Math.abs(d.err) <= 0.1 + E; }
    },
    {
      id: 'acid-base-titration-9', level: 7,
      title: { zh: '不看 pH 計', en: 'No pH meter' },
      desc: { zh: '先把 pH 計從錐形瓶取出，整個滴定只靠指示劑的顏色：終點和當量點相差不超過 0.05 mL。', en: 'Take the pH meter out of the flask first and rely only on the indicator colour for the whole titration: the end point must be within 0.05 mL of the equivalence point.' },
      check: function (ev) { const d = ev.data; return isE(ev) && !d.meterUsed && d.ind !== 'none' && d.changed && d.indFixed && Math.abs(d.err) <= 0.05 + E; }
    },
    {
      id: 'acid-base-titration-10', level: 8,
      title: { zh: '未知酸的濃度', en: 'Concentration of the unknown acid' },
      desc: { zh: '滴定「未知弱酸」，算出它的濃度，在答案欄填入後核對：誤差不超過 1%（揭曉答案之後不算）。', en: 'Titrate the unknown weak acid, work out its concentration and check your answer: within 1% (answers after “Reveal” do not count).' },
      check: function (ev) { const d = ev.data; return isA(ev) && isFinite(d.errC) && Math.abs(d.errC) <= 0.01 + E; }
    },
    {
      id: 'acid-base-titration-11', level: 9,
      title: { zh: '由半當量點求 Ka', en: 'Ka from half-equivalence' },
      desc: { zh: '量出「未知弱酸」的 pKa，填入答案欄核對：換算成 Ka，誤差不超過 5%（揭曉答案之後不算）。', en: 'Measure the pKa of the unknown weak acid and check your answer: converted to Ka it must be within 5% (answers after “Reveal” do not count).' },
      check: function (ev) { const d = ev.data; return isA(ev) && isFinite(d.errKa) && Math.abs(d.errKa) <= 0.05 + E; }
    },
    {
      id: 'acid-base-titration-12', level: 10,
      title: { zh: '大師：一瓶定乾坤', en: 'Master: one flask decides it all' },
      desc: { zh: '同一個未知弱酸只准用一瓶滴定，同時求出濃度（誤差 ≤ 0.3%）與 Ka（誤差 ≤ 2%）（揭曉答案之後不算）。', en: 'Use a single flask of the unknown weak acid and find both its concentration (within 0.3%) and its Ka (within 2%) (answers after “Reveal” do not count).' },
      check: function (ev) {
        const d = ev.data;
        return isA(ev) && d.flasks <= 1 && isFinite(d.errC) && isFinite(d.errKa) && Math.abs(d.errC) <= 0.003 + E && Math.abs(d.errKa) <= 0.02 + E;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'acid-base-titration-h1', level: 2, hidden: true,
      riddle: { zh: '一無所有的時候，另一處正滿。', en: 'When one has nothing left, another is full.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.empty; }
    },
    {
      id: 'acid-base-titration-h2', level: 4, hidden: true,
      riddle: { zh: '春天的草地：比枯葉多一點天空，比天空多一點枯葉。', en: 'A spring meadow: a little more sky than a dead leaf, a little more dead leaf than the sky.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.ind === 'btb' && d.fb >= 0.4 && d.fb <= 0.6; }
    },
    {
      id: 'acid-base-titration-h3', level: 5, hidden: true,
      riddle: { zh: '中立，不代表扯平。', en: 'Being neutral is not the same as being even.' },
      check: function (ev) {
        const d = ev.data;
        return isS(ev) && (d.sys === 'wa' || d.sys === 'wb' || d.sys === 'mx') && d.meter && Math.abs(d.pH - 7) <= 0.05 && d.V < d.Veq - 0.02;
      }
    }
  ]);
})();
