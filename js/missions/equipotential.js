/* missions/equipotential.js — 等位線與電場（導電紙實驗）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/equipotential.js 發出；位置 cm、電位 V、電場 V/cm）：
  //   共同欄位 { type: 'circles' | 'bars' | 'barCircle', d, a, L, V0, power, noise, meter: 'dmm' | 'galv', fullBars,
  //             groups: [{ V, n, span, vRange }]（目前這張方格紙上依 N1 位置與讀數分好的組＝等位線）, total, drawLines, drawField }
  //     fullBars = 長條電極從紙的一邊到另一邊（L = 20 cm）；vRange = 同一組各點真實電位的最大差；span = 同一組兩點的最大距離
  //   record：按「記錄」{ …共同欄位, x, y（紅探針 N2）, x1, y1（黑探針 N1）, clip（N1 夾在負極）, reading（電表讀數，以 V 表示）,
  //           dV, V1, V2（真值）, onElectrode, n1OnElectrode, dist12, corner（N2 到最近紙角的距離）, behind（N2 在長條外側 1 cm 以外）,
  //           E2（N2 處電場大小）, Ecent（紙中心電場大小）, groupN, groupV, groupSpan, groupVRange（這一點所屬的組）}
  //   probe：放開探針或微調後（電源接通時）{ …同 record 的探針欄位 }
  //   lines：勾選「連成平滑的等位線」{ …共同欄位 }
  //   fieldlines：勾選「畫出電力線」{ …共同欄位, nCurves（至少 4 點的量測等位線條數）, nLines（畫出的電力線條數）}
  //   estimate：按「估算電場」{ …共同欄位, Eest, Ecalc, err（相對誤差）, dd, dV, x, y（Δd 線段中點）, VA, VB,
  //             usesEl（用了電極當等位線）, distEl（中點到最近電極的距離）, Ecent, sheet（方格紙代號）}
  const NULL_V = 0.02;
  const isNull = function (d) { return Math.abs(d.reading) <= NULL_V + 1e-9; };
  const onPaper = function (d) { return !d.onElectrode && !d.n1OnElectrode; };
  const est = function (ev) { return ev.type === 'estimate' && ev.data.power && isFinite(ev.data.err); };
  const fullGroups = function (d, n, vr) {
    return d.groups.filter(function (g) { return g.n >= n && (vr == null || g.vRange <= vr + 1e-9); }).length;
  };

  LabMission.register('equipotential', [
    {
      id: 'equipotential-1', level: 1,
      title: { zh: '讀數歸零', en: 'A null reading' },
      desc: { zh: '接通電源，黑探針 N1 放在紙上（不在電極上）；移動紅探針 N2 到離 N1 至少 2 cm、電表讀數為零（±0.02 V 以內）的地方，按「記錄」。', en: 'Switch on the supply and put the black probe N1 on the paper (not on an electrode). Move the red probe N2 to a point at least 2 cm from N1 where the meter reads zero (within ±0.02 V) and press “Record”.' },
      check: function (ev) { const d = ev.data; return ev.type === 'record' && d.power && onPaper(d) && isNull(d) && d.dist12 >= 2; }
    },
    {
      id: 'equipotential-2', level: 2,
      title: { zh: '一半的電壓', en: 'Half the voltage' },
      desc: { zh: '兩圓形電極、三用電表、電源至少 2 V：把黑探針夾到負極，找一點讀數剛好等於電源電壓的一半（±0.01 V），按「記錄」。', en: 'Two circular electrodes, the multimeter, a supply of at least 2 V: clip N1 to the negative electrode, find a point where the reading is exactly half the supply voltage (±0.01 V) and press “Record”.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'record' && d.type === 'circles' && d.meter === 'dmm' && d.clip && d.V0 >= 2 && !d.onElectrode && Math.abs(d.reading - d.V0 / 2) <= 0.01 + 1e-9;
      }
    },
    {
      id: 'equipotential-3', level: 3,
      title: { zh: '描出一條等位線', en: 'Trace one equipotential' },
      desc: { zh: '同一條等位線記錄至少 6 點，最遠的兩點相距至少 8 cm，而且這些點的真實電位彼此相差不到 0.06 V。', en: 'Record at least 6 points of the same equipotential line, with the two farthest points at least 8 cm apart and the true potentials of all the points within 0.06 V of each other.' },
      check: function (ev) { const d = ev.data; return ev.type === 'record' && d.groupN >= 6 && d.groupSpan >= 8 && d.groupVRange <= 0.06 + 1e-9; }
    },
    {
      id: 'equipotential-4', level: 4,
      title: { zh: '與等位線垂直', en: 'At right angles' },
      desc: { zh: '至少描出 3 條各有 4 點以上的等位線，勾選「畫出電力線」，畫出至少 3 條電力線。', en: 'Trace at least 3 equipotential lines of 4 or more points each, then tick “Draw field lines” and get at least 3 field lines.' },
      check: function (ev) { const d = ev.data; return ev.type === 'fieldlines' && d.drawField && d.nCurves >= 3 && d.nLines >= 3; }
    },
    {
      id: 'equipotential-5', level: 5,
      title: { zh: '每一伏特一條線', en: 'One line per volt' },
      desc: { zh: '兩圓形電極、電源電壓為整數伏特（至少 4 V）：1 V、2 V……一直到比電源少 1 V，每一個整數電位都描出一條至少 4 點的等位線（線的電位與整數相差不到 0.05 V）。', en: 'Two circular electrodes and a whole-number supply voltage of at least 4 V: trace an equipotential line of at least 4 points at every whole-number potential 1 V, 2 V, … up to 1 V below the supply (each line within 0.05 V of its whole number).' },
      check: function (ev) {
        const d = ev.data;
        if ((ev.type !== 'record' && ev.type !== 'lines') || d.type !== 'circles' || d.V0 < 4 || Math.abs(d.V0 - Math.round(d.V0)) > 1e-9) return false;
        for (let v = 1; v <= d.V0 - 1; v++) {
          if (!d.groups.some(function (g) { return g.n >= 4 && Math.abs(g.V - v) <= 0.05 + 1e-9; })) return false;
        }
        return true;
      }
    },
    {
      id: 'equipotential-6', level: 5,
      title: { zh: '均勻的電場', en: 'A uniform field' },
      desc: { zh: '平行長條電極從紙的一邊延伸到另一邊（L = 20 cm）：用兩條自己描出的等位線估算電場，與計算值相差不到 2%。', en: 'Parallel bars running from edge to edge (L = 20 cm): estimate the field from two equipotential lines you traced yourself, within 2% of the computed value.' },
      check: function (ev) { const d = ev.data; return est(ev) && d.type === 'bars' && d.fullBars && !d.usesEl && Math.abs(d.err) <= 0.02; }
    },
    {
      id: 'equipotential-7', level: 6,
      title: { zh: '兩極之間', en: 'Between the electrodes' },
      desc: { zh: '兩圓形電極：在離兩個電極都至少 2 cm 的地方，用兩條自己描出的等位線估算電場，與計算值相差不到 5%。', en: 'Two circular electrodes: at least 2 cm from both electrodes, estimate the field from two equipotential lines you traced yourself, within 5% of the computed value.' },
      check: function (ev) { const d = ev.data; return est(ev) && d.type === 'circles' && !d.usesEl && d.distEl >= 2 && Math.abs(d.err) <= 0.05; }
    },
    {
      id: 'equipotential-8', level: 7,
      title: { zh: '邊緣效應', en: 'The edge effect' },
      desc: { zh: '平行長條、長度 L 不超過 12 cm：在同一張紙上估算兩次電場（都和計算值相差不到 10%）——一次在正中央（離紙的中線 1.5 cm 以內），一次在長條端點的外面（比端點再往外至少 1 cm）；外面的電場要比中央弱至少 15%。', en: 'Parallel bars with L at most 12 cm: on the same sheet make two field estimates (both within 10% of the computed values) — one in the middle (within 1.5 cm of the centre line) and one beyond the ends of the bars (at least 1 cm farther out than the bar ends). The field outside must be at least 15% weaker than in the middle.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!est(ev) || d.type !== 'bars' || d.L > 12 || d.usesEl || Math.abs(d.err) > 0.1) return false;
        if (!mem.s || mem.s.sheet !== d.sheet) mem.s = { sheet: d.sheet, c: 0, e: 0 };
        const s = mem.s, dy = Math.abs(d.y - 10);
        if (dy <= 1.5) s.c = Math.max(s.c, d.Eest);
        if (dy >= d.L / 2 + 1) s.e = s.e ? Math.min(s.e, d.Eest) : d.Eest;
        return s.c > 0 && s.e > 0 && s.e <= 0.85 * s.c;
      }
    },
    {
      id: 'equipotential-9', level: 8,
      title: { zh: '電極旁的強電場', en: 'Strong field near an electrode' },
      desc: { zh: '兩圓形電極：在電場至少是紙中心 2.5 倍的地方，用兩條自己描出的等位線估算電場，與計算值相差不到 8%。', en: 'Two circular electrodes: where the field is at least 2.5 times the field at the centre of the sheet, estimate it from two equipotential lines you traced yourself, within 8% of the computed value.' },
      check: function (ev) { const d = ev.data; return est(ev) && d.type === 'circles' && !d.usesEl && d.Ecalc >= 2.5 * d.Ecent && Math.abs(d.err) <= 0.08; }
    },
    {
      id: 'equipotential-10', level: 8,
      title: { zh: '雜訊中的精準', en: 'Precise despite the noise' },
      desc: { zh: '選「含誤差」：用兩條自己描出、相距至少 1.5 cm 的等位線估算電場，與計算值相差不到 3%。', en: 'Choose “With errors”: estimate the field from two equipotential lines you traced yourself, at least 1.5 cm apart, within 3% of the computed value.' },
      check: function (ev) { const d = ev.data; return est(ev) && d.noise && !d.usesEl && d.dd >= 1.5 && Math.abs(d.err) <= 0.03; }
    },
    {
      id: 'equipotential-11', level: 9,
      title: { zh: '完整的電場圖', en: 'A complete field map' },
      desc: { zh: '「含誤差」、兩圓形電極：描出至少 5 條各有 6 點以上的等位線，畫出電力線，再估算一次電場，與計算值相差不到 5%。', en: '“With errors”, two circular electrodes: trace at least 5 equipotential lines of 6 or more points each, draw the field lines, then make one field estimate within 5% of the computed value.' },
      check: function (ev) { const d = ev.data; return est(ev) && d.noise && d.type === 'circles' && d.drawField && fullGroups(d, 6) >= 5 && !d.usesEl && Math.abs(d.err) <= 0.05; }
    },
    {
      id: 'equipotential-12', level: 10,
      title: { zh: '長條與圓', en: 'Bar and circle' },
      desc: { zh: '「含誤差」、長條與圓形電極：描出至少 5 條等位線，每條至少 5 點、各點真實電位相差不到 0.05 V；再用自己描的線估算電場，與計算值相差不到 4%。', en: '“With errors”, bar and circle: trace at least 5 equipotential lines, each with at least 5 points whose true potentials differ by less than 0.05 V; then estimate the field from your own lines, within 4% of the computed value.' },
      check: function (ev) { const d = ev.data; return est(ev) && d.noise && d.type === 'barCircle' && fullGroups(d, 5, 0.05) >= 5 && !d.usesEl && Math.abs(d.err) <= 0.04; }
    },
    {
      id: 'equipotential-h1', level: 5, hidden: true,
      riddle: { zh: '城牆的背後，一絲風也吹不進來。', en: 'Behind the city wall, not a breath of wind gets in.' },
      check: function (ev) { const d = ev.data; return ev.type === 'record' && d.fullBars && d.behind && !d.onElectrode; }
    },
    {
      id: 'equipotential-h2', level: 6, hidden: true,
      riddle: { zh: '相隔天涯的兩個人，心跳竟然一模一樣。', en: 'Two people worlds apart, and their hearts beat exactly alike.' },
      check: function (ev) { const d = ev.data; return ev.type === 'record' && onPaper(d) && isNull(d) && d.dist12 >= 16; }
    },
    {
      id: 'equipotential-h3', level: 7, hidden: true,
      riddle: { zh: '世界的角落，連河水都忘了流動。', en: 'In the corner of the world, even the river forgets to flow.' },
      check: function (ev) { const d = ev.data; return ev.type === 'record' && d.type === 'circles' && !d.onElectrode && d.corner <= 3 && d.E2 <= 0.05 * d.Ecent; }
    }
  ]);
})();
