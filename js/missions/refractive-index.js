/* missions/refractive-index.js — 折射率的測定（插針法）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/refractive-index.js 發出，都在使用者操作之後）：
  //   measure：按「移走透明塊，畫出光路」量好一次
  //     { shape: 'rect' | 'semi', dir: 'fwd' | 'rev', mat, nAcc, err（含誤差）, res（量角器解析度 1 或 0.5）, t（厚度 cm）,
  //       side（−1 左側入射、1 右側）, th1, th2（讀數，度）, nRow（sin θ1 / sin θ2）, nRuler（x1 / x2，半圓形）,
  //       alignAng（觀察側針連線與真正光線的夾角，度）, alignOff（針到真正光線的最大距離 cm）,
  //       parallel（AB 與 CD 的夾角，度）, shift（量得的側向位移 cm）, shiftF（由讀數代公式算出的側向位移 cm）,
  //       x1, x2（cm）, mark（半圓形 P 在第幾個記號點，0 = 不在記號點）, revealed（公認值是否已知） }
  //   record：按「記錄」 { row: 同 measure, group: 同材料全部數據的分析
  //       { mat, nAcc, revealed, N, slope（過原點直線的斜率）, pct（百分誤差 %）, errAll（全部含誤差）,
  //         th1Min, th1Max, left, right（左右側入射的筆數）, marks[], rectN, semiN, rectPct, semiPct, rows[] } }
  //   reverse：半圓形弧面入射時移動 P 或眼睛後 { mat, thMed（PO 與平面法線的夾角，度）, crit（臨界角，度）, tir, T }
  const EPS = 1e-9;
  const known = function (d) { return d.mat !== 'unknown'; };
  const relErr = function (x, ref) { return isFinite(x) && ref > 0 ? Math.abs(x - ref) / ref : Infinity; };
  const meas = function (ev) { return ev.type === 'measure'; };
  const rec = function (ev) { return ev.type === 'record'; };

  LabMission.register('refractive-index', [
    {
      id: 'refractive-index-1', level: 1,
      title: { zh: '第一筆數據', en: 'The first data point' },
      desc: { zh: '完成一次插針、移走透明塊畫出光路，再按「記錄」把它加進數據表。', en: 'Line up the pins once, remove the block to draw the light path, then press “Record” to add it to the table.' },
      check: function (ev) { return rec(ev); }
    },
    {
      id: 'refractive-index-2', level: 2,
      title: { zh: '水的折射率', en: 'The refractive index of water' },
      desc: { zh: '用半圓形的水盒（光從平面射入），量一次就讓 n 與 1.333 相差不到 2%。', en: 'With the semicircular water dish (light entering the flat face), get n within 2% of 1.333 in a single measurement.' },
      check: function (ev) {
        const d = ev.data;
        return meas(ev) && d.shape === 'semi' && d.dir === 'fwd' && d.mat === 'water' &&
          Math.min(relErr(d.nRow, 1.333), relErr(d.nRuler, 1.333)) <= 0.02 + EPS;
      }
    },
    {
      id: 'refractive-index-3', level: 3,
      title: { zh: '四針一線', en: 'Four pins in one line' },
      desc: { zh: '用長方形透明塊，讓 C、D 準確插在真正的出射光上：CD 與真正光線的夾角不超過 0.3°，兩針離光線都不超過 0.03 cm。', en: 'With the rectangular block, put C and D right on the real emerging ray: the line CD within 0.3° of the ray, and both pins within 0.03 cm of it.' },
      check: function (ev) { const d = ev.data; return meas(ev) && d.shape === 'rect' && d.alignAng <= 0.3 + EPS && d.alignOff <= 0.03 + EPS; }
    },
    {
      id: 'refractive-index-4', level: 3,
      title: { zh: '關在裡面的光', en: 'Light locked inside' },
      desc: { zh: '讓光從半圓形的弧面射入、射向圓心 O，再把 P 移到夠斜的位置，讓光在平面上發生全反射。', en: 'Let the light enter through the curved face of the semicircle toward the centre O, then move P far enough round that the light is totally reflected at the flat face.' },
      check: function (ev) { return ev.type === 'reverse' && ev.data.tir; }
    },
    {
      id: 'refractive-index-5', level: 4,
      title: { zh: '五個記號點', en: 'All five marks' },
      desc: { zh: '用半圓形透明塊（光從平面射入），把 P 依序插在 P1 到 P5 五個記號點，同一種材料各記錄至少一次。', en: 'With the semicircular block (light entering the flat face), put P on each of the marks P1 to P5 and record at least once at every mark, all with the same material.' },
      check: function (ev) {
        if (!rec(ev)) return false;
        const mk = ev.data.group.marks || [];
        return [1, 2, 3, 4, 5].every(function (k) { return mk.indexOf(k) >= 0; });
      }
    },
    {
      id: 'refractive-index-6', level: 5,
      title: { zh: '平行的出射光', en: 'A parallel exit ray' },
      desc: { zh: '用長方形透明塊，讓畫出的 CD 與 AB 平行（夾角不超過 0.5°），而且兩線錯開至少 1.5 cm。', en: 'With the rectangular block, make the drawn line CD parallel to AB (within 0.5°) while the two lines are offset by at least 1.5 cm.' },
      check: function (ev) { const d = ev.data; return meas(ev) && d.shape === 'rect' && d.parallel <= 0.5 + EPS && d.shift >= 1.5 - EPS; }
    },
    {
      id: 'refractive-index-7', level: 6,
      title: { zh: '側向位移公式', en: 'The sideways-shift formula' },
      desc: { zh: '用長方形透明塊與 0.5° 的量角器，在入射角至少 50° 時，量得的側向位移 d 與公式 t sin(θ1 − θ2) / cos θ2 算出的值相差不到 2%。', en: 'With the rectangular block and the 0.5° protractor, at an angle of incidence of at least 50°, get a measured sideways shift d within 2% of the formula t sin(θ1 − θ2) / cos θ2.' },
      check: function (ev) {
        const d = ev.data;
        return meas(ev) && d.shape === 'rect' && d.res === 0.5 && d.th1 >= 50 - EPS && relErr(d.shift, d.shiftF) <= 0.02 + EPS;
      }
    },
    {
      id: 'refractive-index-8', level: 6,
      title: { zh: '斜率就是折射率', en: 'The slope is the index' },
      desc: { zh: '同一種已知材料至少記錄 5 筆、入射角最大與最小相差至少 30°，讓 sin θ1–sin θ2 圖過原點直線的斜率與公認值相差不到 1.5%。', en: 'Record at least 5 trials of one known material, with angles of incidence spanning at least 30°, so that the slope of the line through the origin on the sin θ1–sin θ2 graph is within 1.5% of the accepted value.' },
      check: function (ev) {
        if (!rec(ev)) return false;
        const g = ev.data.group;
        return known(g) && g.N >= 5 && g.th1Max - g.th1Min >= 30 - EPS && Math.abs(g.pct) <= 1.5 + EPS;
      }
    },
    {
      id: 'refractive-index-9', level: 7,
      title: { zh: '臨界角的邊緣', en: 'On the edge of the critical angle' },
      desc: { zh: '讓光從半圓形的弧面射入，把 P 移到光「剛好還能」從平面射出的位置：PO 與法線的夾角比臨界角小，但相差不到 0.5°。', en: 'With light entering through the curved face, move P to where the light can only just still get out through the flat face: PO makes an angle with the normal less than the critical angle, but by no more than 0.5°.' },
      check: function (ev) { const d = ev.data; return ev.type === 'reverse' && !d.tir && d.crit - d.thMed <= 0.5 + EPS && d.crit - d.thMed > 0; }
    },
    {
      id: 'refractive-index-10', level: 8,
      title: { zh: '未知樣品', en: 'The unknown sample' },
      desc: { zh: '選「未知樣品」，在按「揭曉」之前至少記錄 5 筆，讓斜率與它真正的折射率相差不到 1%。', en: 'Choose “Unknown sample” and, before pressing “Reveal”, record at least 5 trials so that the slope is within 1% of its true refractive index.' },
      check: function (ev) {
        if (!rec(ev)) return false;
        const g = ev.data.group;
        return g.mat === 'unknown' && !g.revealed && g.N >= 5 && Math.abs(g.pct) <= 1 + EPS;
      }
    },
    {
      id: 'refractive-index-11', level: 10,
      title: { zh: '大師：抵銷系統誤差', en: 'Master: cancel the systematic error' },
      desc: { zh: '在「含誤差」模式中（透明塊沒有完全對準描好的線），同一種材料左側入射與右側入射各記錄至少 3 筆，讓全部數據的斜率與公認值相差不到 0.6%。', en: 'In “With errors” mode (the block is not quite on the traced line), record at least 3 trials with light from the left and 3 from the right for one material, so that the slope of all the data is within 0.6% of the accepted value.' },
      check: function (ev) {
        if (!rec(ev)) return false;
        const g = ev.data.group;
        return g.errAll && g.left >= 3 && g.right >= 3 && Math.abs(g.pct) <= 0.6 + EPS;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'refractive-index-h1', level: 3, hidden: true,
      riddle: { zh: '影子與本尊，在這裡不分彼此。', en: 'Here the shadow and its owner refuse to part.' },
      check: function (ev) { const d = ev.data; return meas(ev) && d.shape === 'rect' && d.th1 === 0 && d.th2 === 0 && d.shift < 0.05; }
    },
    {
      id: 'refractive-index-h2', level: 6, hidden: true,
      riddle: { zh: '有稜有角的與圓融的，最後說了同一句話。', en: 'The sharp-cornered one and the rounded one end up saying the same thing.' },
      check: function (ev) {
        if (!rec(ev)) return false;
        const g = ev.data.group;
        return g.rectN >= 3 && g.semiN >= 3 && Math.abs(g.rectPct) <= 1 + EPS && Math.abs(g.semiPct) <= 1 + EPS;
      }
    },
    {
      id: 'refractive-index-h3', level: 5, hidden: true,
      riddle: { zh: '同一個角度，左右說了不同的話——誰在說謊？', en: 'The same angle, yet left and right tell different stories — who is lying?' },
      check: function (ev) {
        if (!rec(ev)) return false;
        const rows = (ev.data.group.rows || []).filter(function (r) { return r.err; });
        return rows.some(function (a) {
          return a.side < 0 && rows.some(function (b) {
            return b.side > 0 && b.shape === a.shape && b.dir === a.dir && Math.abs(a.th1 - b.th1) < 1e-6 && Math.abs(a.th2 - b.th2) >= 1 - EPS;
          });
        });
      }
    }
  ]);
})();
