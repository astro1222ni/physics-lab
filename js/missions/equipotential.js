/* missions/equipotential.js — 等位線與電場（導電紙實驗）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/equipotential.js 發出；位置 cm、電位 V、電場 V/cm）：
  //   共同欄位 { type: 'circles' | 'bars' | 'barCircle', d, a, L, V0, power, noise, medium, ac, meter: 'dmm' | 'galv' | 'phone', fullBars,
  //             groups: [{ V, n, span, vRange }]（目前這張方格紙上依 N1 位置與讀數分好的組＝等位線）, total, drawLines, drawField }
  //     fullBars = 長條電極從紙的一邊到另一邊（L = 20 cm）；vRange = 同一組各點真實電位的最大差；span = 同一組兩點的最大距離
  //   record：按「記錄」{ …共同欄位, x, y（紅探針 N2）, x1, y1（黑探針 N1）, clip（N1 夾在負極）, reading（電表讀數，以 V 表示）,
  //           dV, V1, V2（真值）, onElectrode, n1OnElectrode, dist12, corner（N2 到最近紙角的距離）, behind（N2 在長條外側 1 cm 以外）,
  //           E2（N2 處電場大小）, Ecent（紙中心電場大小）, groupN, groupV, groupSpan, groupVRange（這一點所屬的組）}
  //   probe：放開探針或微調後（電源接通時）{ …同 record 的探針欄位 }
  //   lines：勾選「連成平滑的等位線」{ …共同欄位 }
  //   fieldlines：勾選「畫出與等位線垂直的電力線」{ …共同欄位, nCurves（至少 4 點的量測等位線條數）, nLines（畫出的電力線條數）}
  //   estimate：按「估算電場」{ …共同欄位, Eest, Ecalc, err（相對誤差）, dd, dV, x, y（Δd 線段中點）, VA, VB,
  //             usesEl（用了電極當等位線）, distEl（中點到最近電極的距離）, Ecent, sheet（方格紙代號）}
  // 水槽沿用相同資料、事件名稱加 water-；舊任務判定完整保留，水槽不連帶完成導電紙任務。
  // mediumcompare：兩材質相同設定的實測線比對 { sameConfig, nA, nB, potentialDifference, meanDistance }。
  const NULL_V = 0.02;
  const isNull = function (d) { return Math.abs(d.reading) <= NULL_V + 1e-9; };
  const onPaper = function (d) { return !d.onElectrode && !d.n1OnElectrode; };
  // 站長 11/16：學生在水槽描線畫電力線，★4「與等位線垂直」卻不算；說明沒限導電紙，站長裁定「水槽也算」。
  // 一般任務 1–12、h1–h3 同時認導電紙事件與同名的 water- 事件（只放寬，不收回任何人的星星）；
  // 專屬水槽或紙水比對的 13–15、自學 16–32 照舊。
  const is = function (ev, t) { return ev.type === t || ev.type === 'water-' + t; };
  const est = function (ev) { return is(ev, 'estimate') && ev.data.power && isFinite(ev.data.err); };
  const fullGroups = function (d, n, vr) {
    return d.groups.filter(function (g) { return g.n >= n && (vr == null || g.vRange <= vr + 1e-9); }).length;
  };

  LabMission.register('equipotential', [
    {
      id: 'equipotential-1', level: 1,
      title: { zh: '讀數歸零', en: 'A null reading' },
      desc: { zh: '接通電源，黑探針 N1 接觸導電紙或浸在水中（不在電極上）；移動紅探針 N2 到離 N1 至少 2 cm、電表讀數為零（±0.02 V 以內）的地方，按「記錄」。', en: 'Switch on the supply and put the black probe N1 on the paper or in the water (not on an electrode). Move the red probe N2 to a point at least 2 cm from N1 where the meter reads zero (within ±0.02 V) and press “Record”.' },
      check: function (ev) { const d = ev.data; return is(ev, 'record') && d.power && onPaper(d) && isNull(d) && d.dist12 >= 2; }
    },
    {
      id: 'equipotential-2', level: 2,
      title: { zh: '一半的電壓', en: 'Half the voltage' },
      desc: { zh: '兩圓形電極、三用電表、電源至少 2 V：把黑探針夾到負極，找一點讀數剛好等於電源電壓的一半（±0.01 V），按「記錄」。', en: 'Two circular electrodes, the multimeter, a supply of at least 2 V: clip N1 to the negative electrode, find a point where the reading is exactly half the supply voltage (±0.01 V) and press “Record”.' },
      check: function (ev) {
        const d = ev.data;
        return is(ev, 'record') && d.type === 'circles' && d.meter === 'dmm' && d.clip && d.V0 >= 2 && !d.onElectrode && Math.abs(d.reading - d.V0 / 2) <= 0.01 + 1e-9;
      }
    },
    {
      id: 'equipotential-3', level: 3,
      title: { zh: '描出一條等位線', en: 'Trace one equipotential' },
      desc: { zh: '同一條等位線記錄至少 6 點，最遠的兩點相距至少 8 cm，而且這些點的真實電位彼此相差不到 0.06 V。', en: 'Record at least 6 points of the same equipotential line, with the two farthest points at least 8 cm apart and the true potentials of all the points within 0.06 V of each other.' },
      check: function (ev) { const d = ev.data; return is(ev, 'record') && d.groupN >= 6 && d.groupSpan >= 8 && d.groupVRange <= 0.06 + 1e-9; }
    },
    {
      id: 'equipotential-4', level: 4,
      title: { zh: '與等位線垂直', en: 'At right angles' },
      desc: { zh: '至少描出 3 條各有 4 點以上的等位線，勾選「畫出與等位線垂直的電力線」，畫出至少 3 條電力線。', en: 'Trace at least 3 equipotential lines of 4 or more points each, then tick “Draw field lines at right angles to them” and get at least 3 field lines.' },
      check: function (ev) { const d = ev.data; return is(ev, 'fieldlines') && d.drawField && d.nCurves >= 3 && d.nLines >= 3; }
    },
    {
      id: 'equipotential-5', level: 5,
      title: { zh: '每一伏特一條線', en: 'One line per volt' },
      desc: { zh: '兩圓形電極、電源電壓為整數伏特（至少 4 V）：1 V、2 V……一直到比電源少 1 V，每一個整數電位都描出一條至少 4 點的等位線（線的電位與整數相差不到 0.05 V）。', en: 'Two circular electrodes and a whole-number supply voltage of at least 4 V: trace an equipotential line of at least 4 points at every whole-number potential 1 V, 2 V, … up to 1 V below the supply (each line within 0.05 V of its whole number).' },
      check: function (ev) {
        const d = ev.data;
        if ((!is(ev, 'record') && !is(ev, 'lines')) || d.type !== 'circles' || d.V0 < 4 || Math.abs(d.V0 - Math.round(d.V0)) > 1e-9) return false;
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
      id: 'equipotential-13', level: 3,
      title: { zh: '水裡的等位線', en: 'Equipotentials in water' },
      desc: { zh: '水槽接通電源，同一條等位線記錄至少 6 點，最遠兩點至少相距 8 cm，各點真實電位差小於 0.06 V。', en: 'Switch on the water tray. Record at least 6 points on one equipotential, spanning at least 8 cm, with true potentials differing by less than 0.06 V.' },
      check: function (ev) { const d = ev.data; return ev.type === 'water-record' && d.medium === 'water' && d.power && d.bulkVoltage > 0 && d.groupN >= 6 && d.groupSpan >= 8 && d.groupVRange < 0.06; }
    },
    {
      id: 'equipotential-14', level: 6,
      title: { zh: '水和紙一樣嗎', en: 'Water and paper: the same?' },
      desc: { zh: '相同電極與電源電壓，在導電紙、水槽各描一條至少 5 點的等位線：兩線電位差小於 0.05 V，對應位置的平均距離小於 0.3 cm。先描紙，再切換水槽。', en: 'With the same electrodes and supply voltage, trace a line of at least 5 points in each medium. Their potentials must differ by less than 0.05 V and corresponding positions by less than 0.3 cm on average. Trace the paper first, then the water.' },
      check: function (ev) { const d = ev.data; return ev.type === 'mediumcompare' && d.power && d.sameConfig && d.nA >= 5 && d.nB >= 5 && d.potentialDifference < 0.05 && d.meanDistance < 0.3; }
    },
    {
      id: 'equipotential-15', level: 8,
      title: { zh: '看穿極化', en: 'See through polarization' },
      desc: { zh: '水槽、含誤差、直流，黑探針夾負極。用兩條自己描的等位線估算電場，與水中計算值相差小於 6 %，估算中點離電極至少 2 cm。', en: 'Water tray, with errors, DC; clip the black probe to the negative metal. Estimate the field from two lines you traced, within 6% of the computed bulk-water field, at least 2 cm from the electrodes.' },
      check: function (ev) { const d = ev.data; return ev.type === 'water-estimate' && d.medium === 'water' && d.power && d.noise && !d.ac && d.clip && d.bulkVoltage > 0 && !d.usesEl && d.distEl >= 2 && isFinite(d.err) && Math.abs(d.err) < 0.06; }
    },
    {
      id: 'equipotential-h1', level: 5, hidden: true,
      riddle: { zh: '城牆的背後，一絲風也吹不進來。', en: 'Behind the city wall, not a breath of wind gets in.' },
      check: function (ev) { const d = ev.data; return is(ev, 'record') && d.fullBars && d.behind && !d.onElectrode; }
    },
    {
      id: 'equipotential-h2', level: 6, hidden: true,
      riddle: { zh: '相隔天涯的兩個人，心跳竟然一模一樣。', en: 'Two people worlds apart, and their hearts beat exactly alike.' },
      check: function (ev) { const d = ev.data; return is(ev, 'record') && onPaper(d) && isNull(d) && d.dist12 >= 16; }
    },
    {
      id: 'equipotential-h3', level: 7, hidden: true,
      riddle: { zh: '世界的角落，連河水都忘了流動。', en: 'In the corner of the world, even the river forgets to flow.' },
      check: function (ev) { const d = ev.data; return is(ev, 'record') && d.type === 'circles' && !d.onElectrode && d.corner <= 3 && d.E2 <= 0.05 * d.Ecent; }
    }
  ]);

  // ===== 還差什麼（站長 11/16：「學生他會覺得他已經完成了那個任務，可是他卻不知道他自己少了些什麼東西」）=====
  // 每個一般任務逐條列出條件：✓ 已做到、✗ 還沒做到（附現在的數值）、→ 接下來要按的鍵（寫明在哪一張卡片）。
  // 條件讀「現在」的實驗狀態（EquipotentialLab.snapshot），估算類讀「上一次估算」的結果；只顯示，不參與判定。
  (function () {
    const S = function () { try { return window.EquipotentialLab ? EquipotentialLab.snapshot() : null; } catch (e) { return null; } };
    const lastOf = function (c, t) { const a = c.last(t), b = c.last('water-' + t); if (!a) return b; if (!b) return a; return c.seq(t) >= c.seq('water-' + t) ? a : b; };
    const it = function (ok, zh, en) { return [!!ok, zh, en]; };
    const act = function (zh, en) { return [null, zh, en]; };
    const f1 = function (v) { return isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : '—'; };
    const f2 = function (v) { return isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : '—'; };
    const pct = function (v) { return isFinite(v) ? (Math.round(Math.abs(v) * 1000) / 10).toFixed(1) + '%' : '—'; };
    const TYPE = { circles: ['兩圓形電極', 'Two circles'], bars: ['平行長條', 'Parallel bars'], barCircle: ['長條與圓形', 'Bar and circle'] };
    const typeIs = function (s, t) { return it(s.type === t, '電極選「' + TYPE[t][0] + '」（「電極與電源」卡）', 'Electrodes: “' + TYPE[t][1] + '” (Electrodes and power supply)'); };
    const power = function (s) { return it(s.power, '接通電源（「電極與電源」卡的「接通電源」）', 'Supply on (“Switch on the supply” in Electrodes and power supply)'); };
    const noisy = function (s) { return it(s.noise, '實驗條件選「含誤差」（「電表與探針」卡）', 'Conditions: “With errors” (Meter and probes card)'); };
    const field = function (s) { return it(s.drawField, '勾「畫出與等位線垂直的電力線」（「作圖與分析」卡）', 'Tick “Draw field lines at right angles to them” (Drawing and analysis)'); };
    const reading = function (s) { return s.power ? f2(s.reading) + ' V' : '電源沒接通'; };
    const rec = act('然後按「記錄」（畫布正下方）', 'Then press “Record” (right under the canvas)');
    const ESTBTN = ['按「估算紅探針處的電場」（「作圖與分析」卡）', 'Press “Estimate E at the red probe” (Drawing and analysis)'];
    // 估算類：上一次估算的結果
    function estItems(c, lim, extra) {
      const e = lastOf(c, 'estimate');
      if (!e) return [act('把紅探針放在兩條自己描的等位線之間，' + ESTBTN[0], 'Put the red probe between two lines you traced, then ' + ESTBTN[1].charAt(0).toLowerCase() + ESTBTN[1].slice(1))];
      const out = [
        it(!e.usesEl, '兩條線都要自己描（不能拿電極當其中一條線）' + (e.usesEl ? '：上一次用到了電極' : ''), 'Both lines must be your own (an electrode does not count)' + (e.usesEl ? ': last time an electrode was used' : '')),
        it(isFinite(e.err) && Math.abs(e.err) <= lim + 1e-9, '估算值和計算值相差 ≤ ' + pct(lim) + '（上一次 ' + pct(e.err) + '）', 'Estimate within ' + pct(lim) + ' of the computed value (last time ' + pct(e.err) + ')')
      ].concat(extra ? extra(e) : []);
      out.push(act('調好後再' + ESTBTN[0] + '；描得越準、兩條線越近，誤差越小', 'Then ' + ESTBTN[1].charAt(0).toLowerCase() + ESTBTN[1].slice(1) + ' again; tighter, closer lines give a smaller error'));
      return out;
    }
    // 描線類：找最接近完成的一條線
    function bestGroup(s, n, span, vr) {
      let best = null, bs = -1;
      (s.groups || []).forEach(function (g) {
        const sc = Math.min(g.n / n, 1) + (span ? Math.min(g.span / span, 1) : 0) + (g.vRange <= vr + 1e-9 ? 1 : 0);
        if (sc > bs) { bs = sc; best = g; }
      });
      return best || { V: NaN, n: 0, span: 0, vRange: NaN };
    }
    function lineItems(s, n, span, vr) {
      const g = bestGroup(s, n, span, vr);
      return [
        it(g.n >= n, '同一條等位線至少 ' + n + ' 點（目前最多的一條 ' + g.n + ' 點）', 'At least ' + n + ' points on one line (best line so far: ' + g.n + ')'),
        it(g.span >= span, '這條線最遠的兩點相距至少 ' + span + ' cm（現在 ' + f1(g.span) + ' cm）', 'Its two farthest points at least ' + span + ' cm apart (now ' + f1(g.span) + ' cm)'),
        it(g.n > 0 && g.vRange <= vr + 1e-9, '這條線各點真實電位相差 < ' + vr + ' V（現在 ' + f2(g.vRange) + ' V；每一點都要對準同一個讀數再記錄）', 'True potentials within ' + vr + ' V (now ' + f2(g.vRange) + ' V; null each point on the same reading before recording)')
      ];
    }
    const nLines = function (s, n, vr) { return (s.groups || []).filter(function (g) { return g.n >= n && (vr == null || g.vRange <= vr + 1e-9); }).length; };

    const NEED = {
      'equipotential-1': { on: ['record', 'water-record'], f: function () {
        const s = S(); if (!s) return null;
        return [power(s),
          it(!s.n1OnElectrode, '黑探針 N1 放在' + (s.medium === 'water' ? '水中' : '紙上') + '：不在電極上、也不夾負極', 'Black N1 ' + (s.medium === 'water' ? 'in the water' : 'on the sheet') + ': not on an electrode, not clipped'),
          it(s.dist12 >= 2, '紅探針 N2 離 N1 至少 2 cm（現在 ' + f1(s.dist12) + ' cm）', 'Red N2 at least 2 cm from N1 (now ' + f1(s.dist12) + ' cm)'),
          it(s.power && Math.abs(s.reading) <= 0.02 + 1e-9, '電表讀數在 ±0.02 V 以內（現在 ' + reading(s) + '）', 'Meter reads within ±0.02 V (now ' + reading(s) + ')'),
          rec];
      } },
      'equipotential-2': { on: ['record', 'water-record'], f: function () {
        const s = S(); if (!s) return null;
        return [typeIs(s, 'circles'),
          it(s.meter === 'dmm', '電表選「三用電表」（「電表與探針」卡）', 'Meter: “Multimeter” (Meter and probes)'),
          it(s.V0 >= 2, '電源電壓至少 2 V（現在 ' + f1(s.V0) + ' V）', 'Supply at least 2 V (now ' + f1(s.V0) + ' V)'),
          power(s),
          it(s.clip, '按「黑探針夾到負極（0 V）」（「電表與探針」卡）', 'Press “Clip N1 to the negative electrode (0 V)” (Meter and probes)'),
          it(!s.onElectrode, '紅探針 N2 不在電極上', 'Red N2 not on an electrode'),
          it(s.power && Math.abs(s.reading - s.V0 / 2) <= 0.01 + 1e-9, '讀數剛好是電源的一半 ' + f2(s.V0 / 2) + ' V（±0.01；現在 ' + reading(s) + '）', 'Reading exactly half the supply, ' + f2(s.V0 / 2) + ' V (±0.01; now ' + reading(s) + ')'),
          rec];
      } },
      'equipotential-3': { on: ['record', 'water-record'], f: function () {
        const s = S(); if (!s) return null;
        return [power(s)].concat(lineItems(s, 6, 8, 0.06), [act('再在這條線上記錄一點就會判定', 'Record one more point on that line to be checked')]);
      } },
      'equipotential-4': { on: ['fieldlines', 'water-fieldlines', 'record', 'water-record'], f: function () {
        const s = S(); if (!s) return null;
        const k = nLines(s, 4), nf = s.drawField ? (s.fields || []).length : 0;
        return [it(k >= 3, '至少 3 條等位線、每條 4 點以上（現在 ' + k + ' 條）', 'At least 3 lines of 4+ points (now ' + k + ')'),
          field(s),
          it(nf >= 3, '畫出至少 3 條電力線（現在 ' + nf + ' 條；等位線不夠就畫不出來）', 'At least 3 field lines drawn (now ' + nf + '; they need enough equipotentials)'),
          act('已經勾著的話，再記錄一點就會判定', 'If it is already ticked, record one more point to be checked')];
      } },
      'equipotential-5': { on: ['record', 'water-record', 'lines', 'water-lines'], f: function () {
        const s = S(); if (!s) return null;
        const whole = s.V0 >= 4 && Math.abs(s.V0 - Math.round(s.V0)) < 1e-9, miss = [];
        if (whole) for (let v = 1; v <= s.V0 - 1; v++) {
          const n = Math.max.apply(null, [0].concat((s.groups || []).filter(function (g) { return Math.abs(g.V - v) <= 0.05 + 1e-9; }).map(function (g) { return g.n; })));
          if (n < 4) miss.push(v + ' V（' + n + ' 點）');
        }
        return [typeIs(s, 'circles'),
          it(whole, '電源電壓是整數伏特、至少 4 V（現在 ' + f1(s.V0) + ' V）', 'Whole-number supply of at least 4 V (now ' + f1(s.V0) + ' V)'),
          it(whole && !miss.length, whole ? (miss.length ? '1 V 到 ' + (s.V0 - 1) + ' V 每個整數都要一條 ≥ 4 點的線，還缺：' + miss.join('、') : '1 V 到 ' + (s.V0 - 1) + ' V 每個整數都有一條 ≥ 4 點的線') : '1 V、2 V…每個整數電位各描一條 ≥ 4 點的線',
            whole ? (miss.length ? 'A line of 4+ points at every whole volt from 1 to ' + (s.V0 - 1) + ' V; missing: ' + miss.join(', ') : 'Every whole volt from 1 to ' + (s.V0 - 1) + ' V has a line of 4+ points') : 'A line of 4+ points at 1 V, 2 V, …'),
          act('小技巧：按「黑探針夾到負極」，讀數就是電位，直接找 1.00 V、2.00 V……', 'Tip: clip N1 to the negative electrode so the reading is the potential, then look for 1.00 V, 2.00 V, …'), rec];
      } },
      'equipotential-6': { on: ['estimate', 'water-estimate'], f: function (c) {
        const s = S(); if (!s) return null;
        return [typeIs(s, 'bars'), it(s.type === 'bars' && s.L >= 20, '長條長度 L 拉到 20 cm（從紙的一邊到另一邊；現在 ' + f1(s.L) + ' cm）', 'Bar length L = 20 cm, edge to edge (now ' + f1(s.L) + ' cm)'), power(s)].concat(estItems(c, 0.02));
      } },
      'equipotential-7': { on: ['estimate', 'water-estimate'], f: function (c) {
        const s = S(); if (!s) return null;
        return [typeIs(s, 'circles'), power(s)].concat(estItems(c, 0.05, function (e) { return [it(e.distEl >= 2, '估算的位置離兩個電極都至少 2 cm（上一次 ' + f1(e.distEl) + ' cm）', 'At least 2 cm from both electrodes (last time ' + f1(e.distEl) + ' cm)')]; }));
      } },
      'equipotential-8': { on: ['estimate', 'water-estimate'], f: function (c) {
        const s = S(); if (!s) return null;
        const m = this.mem && this.mem.s, cen = m && m.c > 0, out = m && m.e > 0;
        return [typeIs(s, 'bars'),
          it(s.type === 'bars' && s.L <= 12, '長條長度 L 不超過 12 cm（現在 ' + f1(s.L) + ' cm）', 'Bar length L at most 12 cm (now ' + f1(s.L) + ' cm)'),
          power(s),
          it(cen, '在正中央（離紙的中線 1.5 cm 內）估算一次，誤差 ≤ 10%', 'One estimate in the middle (within 1.5 cm of the centre line), within 10%'),
          it(out, '在長條端點外面（比端點再往外至少 1 cm）估算一次，誤差 ≤ 10%', 'One estimate beyond the bar ends (at least 1 cm past an end), within 10%'),
          it(cen && out && m.e <= 0.85 * m.c, '外面的電場比中央弱至少 15%' + (cen && out ? '（現在弱 ' + pct(1 - m.e / m.c) + '）' : ''), 'Outside at least 15% weaker than the middle' + (cen && out ? ' (now ' + pct(1 - m.e / m.c) + ' weaker)' : '')),
          act('兩次都要在同一張方格紙上；' + ESTBTN[0], 'Both on the same sheet; ' + ESTBTN[1])];
      } },
      'equipotential-9': { on: ['estimate', 'water-estimate'], f: function (c) {
        const s = S(); if (!s) return null;
        return [typeIs(s, 'circles'), power(s)].concat(estItems(c, 0.08, function (e) { const r = e.Ecent > 0 ? e.Ecalc / e.Ecent : NaN; return [it(r >= 2.5, '估算的位置電場至少是紙中心的 2.5 倍：靠近電極一點（上一次 ' + f1(r) + ' 倍）', 'Field at least 2.5× the centre value: move nearer an electrode (last time ' + f1(r) + '×)')]; }));
      } },
      'equipotential-10': { on: ['estimate', 'water-estimate'], f: function (c) {
        const s = S(); if (!s) return null;
        return [noisy(s), power(s)].concat(estItems(c, 0.03, function (e) { return [it(e.dd >= 1.5, '兩條線相距至少 1.5 cm（上一次 ' + f1(e.dd) + ' cm）', 'Lines at least 1.5 cm apart (last time ' + f1(e.dd) + ' cm)')]; }));
      } },
      'equipotential-11': { on: ['estimate', 'water-estimate'], f: function (c) {
        const s = S(); if (!s) return null;
        const k = nLines(s, 6);
        return [noisy(s), typeIs(s, 'circles'), power(s),
          it(k >= 5, '至少 5 條等位線、每條 6 點以上（現在 ' + k + ' 條）', 'At least 5 lines of 6+ points (now ' + k + ')'),
          field(s)].concat(estItems(c, 0.05));
      } },
      'equipotential-12': { on: ['estimate', 'water-estimate'], f: function (c) {
        const s = S(); if (!s) return null;
        const k = nLines(s, 5, 0.05);
        return [noisy(s), typeIs(s, 'barCircle'), power(s),
          it(k >= 5, '至少 5 條等位線、每條 5 點以上且各點真實電位相差 < 0.05 V（現在 ' + k + ' 條）', 'At least 5 lines of 5+ points within 0.05 V (now ' + k + ')')].concat(estItems(c, 0.04));
      } },
      'equipotential-13': { on: ['water-record'], f: function () {
        const s = S(); if (!s) return null;
        return [it(s.medium === 'water', '材質切到「水槽」（畫布上方）', 'Switch to “Water tray” (above the canvas)'), power(s)].concat(lineItems(s, 6, 8, 0.06), [act('再在這條線上記錄一點就會判定', 'Record one more point on that line to be checked')]);
      } },
      'equipotential-14': { on: ['mediumcompare'], f: function (c) {
        const s = S(); if (!s) return null;
        const m = c.last('mediumcompare');
        if (!m) return [power(s), act('先在「導電紙」描一條至少 5 點的線，電極和電壓都不要改，再切到「水槽」描同一個電位的線', 'Trace a line of 5+ points on paper, keep electrodes and voltage, then switch to the water tray and trace the same potential')];
        return [it(m.sameConfig, '兩邊的電極與電源電壓相同', 'Same electrodes and supply voltage in both'),
          it(m.nA >= 5, '導電紙那條至少 5 點（現在 ' + m.nA + ' 點）', 'Paper line has 5+ points (now ' + m.nA + ')'),
          it(m.nB >= 5, '水槽那條至少 5 點（現在 ' + m.nB + ' 點）', 'Water line has 5+ points (now ' + m.nB + ')'),
          it(m.potentialDifference < 0.05, '兩條線的電位相差 < 0.05 V（現在 ' + f2(m.potentialDifference) + ' V）', 'Potentials differ by < 0.05 V (now ' + f2(m.potentialDifference) + ' V)'),
          it(m.meanDistance < 0.3, '對應位置平均相距 < 0.3 cm（現在 ' + f2(m.meanDistance) + ' cm）', 'Mean distance < 0.3 cm (now ' + f2(m.meanDistance) + ' cm)'),
          rec];
      } },
      'equipotential-15': { on: ['water-estimate'], f: function (c) {
        const s = S(); if (!s) return null;
        return [it(s.medium === 'water', '材質切到「水槽」（畫布上方）', 'Switch to “Water tray” (above the canvas)'), noisy(s),
          it(!s.ac, '電源選「直流」（畫布上方）', 'Source: “DC” (above the canvas)'), power(s),
          it(s.clip, '按「黑探針夾到負極（0 V）」（「電表與探針」卡）', 'Press “Clip N1 to the negative electrode (0 V)” (Meter and probes)')
        ].concat(estItems(c, 0.06, function (e) { return [it(e.distEl >= 2, '估算的位置離電極至少 2 cm（上一次 ' + f1(e.distEl) + ' cm）', 'At least 2 cm from the electrodes (last time ' + f1(e.distEl) + ' cm)')]; }));
      } }
    };
    ((LabMission.all && LabMission.all().equipotential) || []).forEach(function (m) { const n = NEED[m.id]; if (n) { m.need = n.f; m.needOn = n.on; } });
  })();
  // 任務清單保持可獨立載入；排行榜與每日任務不必載入實驗的物理核心。
  const finiteError = d => Number.isFinite(d.err) && Math.abs(d.err) < 0.10;
  const rules = [
    [16,1,'河水與等高線','River and contours','intro-viewed',1,d=>d.kind==='stream'&&d.seconds>=4||d.kind==='rig'&&d.ready===true],
    [17,2,'先猜再說','Predict first','predictions-submitted',2,d=>d.submitted===2],
    [18,3,'神準預言家','A perfect prediction','predictions-perfect',2,d=>d.firstCorrect===2&&d.revealed===true],
    [19,3,'觀念五連','Five connected ideas','concepts-viewed',3,d=>d.cardsSeen===5],
    [20,4,'第一個零點','Your first null','null-recorded',4,d=>d.power&&d.recorded&&Math.abs(d.reading)<=.02+1e-9],
    [21,5,'第一條線','Your first line','line-completed',4,d=>d.power&&d.groupN>=6&&d.vRange<.06&&d.drawLines],
    [22,6,'等位線三兄弟','Three equipotentials','field-drawn',4,d=>d.groups>=3&&d.drawField&&d.fieldCurves>0],
    [23,6,'我也會算電場','I can measure the field','field-estimated',4,d=>d.estimated&&finiteError(d)],
    [24,4,'對答案','Check your lines','theory-compared',5,d=>d.ownPoints>=6&&d.showTheory&&d.drawLines],
    [25,5,'紙與水','Paper and water','media-compared',5,d=>d.paperSeen&&d.waterSeen&&d.sameConfig&&d.points>=6&&d.meanDistance<.3],
    [26,4,'範例一','Example one','example-one-verified',6,d=>d.example===1&&d.estimated&&finiteError(d)],
    [27,5,'範例二','Example two','example-two-verified',6,d=>d.example===2&&d.judgement&&d.verifiedA&&d.verifiedB],
    [28,6,'範例三','Example three','example-three-verified',6,d=>d.example===3&&d.voltageCorrect&&d.fieldCorrect],
    [29,4,'隨堂全對','All three understood','quiz-completed',7,d=>d.correct===3],
    [30,7,'一次全對','Right on the first try','quiz-perfect',7,d=>d.correct===3&&d.firstCorrect===3],
    [31,5,'我的電場圖','My field map','card-exported',8,d=>d.ownPoints>=6&&['download','share'].includes(d.method)&&d.exported===true],
    [32,8,'自學全通','Self-study complete','unit-completed',8,d=>Array.isArray(d.sections)&&d.sections.length===8&&d.sections.every(Boolean)&&Array.from({length:16},(_,i)=>i+16).every(n=>(d.awarded||[]).includes(n))]
  ];
  const descriptions = [
    ['看完四秒溪流動畫，或親自開啟可操作的 3D 器材。','Watch the four-second stream or open the interactive apparatus.'],
    ['送出兩題預測，答案稍後揭曉。','Submit both predictions; answers are revealed later.'],
    ['兩題第一次都答對，於對答案時核對。','Get both predictions right first try, then reveal them.'],
    ['逐張讀完五張觀念卡。','Read all five concept cards.'],
    ['通電後記錄一個讀數在 ±0.02 V 內的點。','Record a null within ±0.02 V with the supply on.'],
    ['同一條線至少六點，電位差小於 0.06 V，並連線。','Join six points on one line with a potential range below 0.06 V.'],
    ['三條等位線各至少六點，再畫電力線。','Trace six points on each of three equipotentials, then draw field lines.'],
    ['用自己的線估算電場，誤差小於 10 %。','Estimate the field from your lines with less than 10% error.'],
    ['在至少六個自己的點上疊計算線比對。','Overlay computed curves on six or more of your measured points.'],
    ['以相同設定，把同一組線放在紙與等深水槽比較。','Compare the same contours on paper and in a uniform-depth tray.'],
    ['在範例一按估算驗算，誤差小於 10 %。','Verify Example 1 with Estimate E and less than 10% error.'],
    ['範例二判斷對，並在 A、B 各估算驗證。','Predict Example 2 correctly and verify by estimating at A and B.'],
    ['範例三分別答對電位與電場的大小關係。','Answer both potential and field rankings in Example 3.'],
    ['三題都答對後按檢查，可重答。','Answer all three checks correctly, allowing retries, then check them.'],
    ['本次三題首次作答全對，再收下紀錄。','Get all three right first try in this run, then claim the record.'],
    ['以自己的實測線製作圖卡，成功分享或存圖。','Create a card from your measured lines and share or save it.'],
    ['八段完成，而且自學任務 16–31 都已拿到。','Complete all eight sections and earn study missions 16–31.']
  ];
  function taskDefinitions() {
    return rules.map(([n,level,zh,en,act,seg,check]) => ({id:'equipotential-'+n,level,study:true,title:{zh,en},
      desc:{zh:descriptions[n-16][0],en:descriptions[n-16][1]},
      check:ev=>ev.type==='study'&&ev.data&&ev.data.module==='equipotential'&&ev.data.userAction===true&&!ev.data.teaching&&!ev.data.restoring&&ev.data.act===act&&ev.data.seg===seg&&check(ev.data)}));
  }
  window.EquipotentialStudyTasks={taskDefinitions,rules};
  LabMission.register('equipotential',taskDefinitions());
})();
