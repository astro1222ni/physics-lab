/* missions/colligative-properties.js — 沸點上升與凝固點下降的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/colligative-properties.js 只在使用者操作之後回報）：
  //   'tick'：每 0.5 秒 { mode（'f'／'b'）, solvent, solute, nucleated, superDepth, seeded, boiling, bumped, superMax, reading, frozen, lost, t }
  //   'measure'：按「記錄結果」{ mode, solvent, solute（'none' 表示純溶劑）, method（'raw'／'ext'）, ideal, electrolyte, reflux, chips, stir,
  //              w1, w2, wt（%）, m, i, K, T0, Tmeas, dT, dTth, err, absErr, iExp, isX, prev:［這一系列之前的紀錄］, line: { n, k, kTh, r2, span } }
  //   'answer'：未知物按「對答案」{ M, Mtrue, err, revealed, measured, via: { mode, solvent, method, dT, err } }
  const me = function (ev) { return ev.type === 'measure' && ev.data ? ev.data : null; };
  const tk = function (ev) { return ev.type === 'tick' && ev.data ? ev.data : null; };
  const an = function (ev) { return ev.type === 'answer' && ev.data ? ev.data : null; };
  const within = function (e, tol) { return e != null && isFinite(e) && Math.abs(e) <= tol; };
  const known = function (d) { return d.solute !== 'none' && !d.isX; };
  const NONEL = ['glucose', 'sucrose', 'urea', 'naph'];
  const okAnswer = function (d, tol) { return !!d && d.measured && !d.revealed && within(d.err, tol); };

  LabMission.register('colligative-properties', [
    {
      id: 'colligative-properties-1', level: 1,
      title: { zh: '糖水比較難結冰', en: 'Sugar water is harder to freeze' },
      desc: { zh: '量一種溶液的凝固點，按「記錄結果」，凝固點下降 ΔTf 至少 0.30 K。', en: 'Measure the freezing point of a solution and press “Record result”: the freezing-point depression ΔTf must be at least 0.30 K.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'f' && d.solute !== 'none' && d.dT >= 0.3; }
    },
    {
      id: 'colligative-properties-2', level: 2,
      title: { zh: '沸點上升', en: 'Boiling-point elevation' },
      desc: { zh: '量一種溶液的沸點，按「記錄結果」，沸點上升 ΔTb 至少 0.20 K。', en: 'Measure the boiling point of a solution and press “Record result”: the boiling-point elevation ΔTb must be at least 0.20 K.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'b' && d.solute !== 'none' && d.dT >= 0.2; }
    },
    {
      id: 'colligative-properties-3', level: 2,
      title: { zh: '純溶劑的平台', en: 'The plateau of a pure solvent' },
      desc: { zh: '把溶質的質量調成 0，量出純溶劑的凝固點，和表列值相差不超過 0.05 K。', en: 'Set the mass of solute to 0 and measure the freezing point of the pure solvent to within 0.05 K of the table value.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'f' && d.solute === 'none' && within(d.absErr, 0.05); }
    },
    {
      id: 'colligative-properties-4', level: 3,
      title: { zh: '過冷', en: 'Supercooling' },
      desc: { zh: '不加晶種，讓液體冷到比它的凝固點低 2.0 K 以上才開始結晶。', en: 'Without a seed crystal, let the liquid cool to at least 2.0 K below its freezing point before it starts to crystallise.' },
      check: function (ev) { const d = tk(ev); return !!d && d.mode === 'f' && d.nucleated && !d.seeded && d.superDepth >= 2.0; }
    },
    {
      id: 'colligative-properties-5', level: 4,
      title: { zh: '撒鹽的路面', en: 'Salt on the road' },
      desc: { zh: '量出氯化鈉水溶液的凝固點，在 −3.0 °C 以下。', en: 'Measure the freezing point of a sodium chloride solution: it must be −3.0 °C or lower.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'f' && d.solvent === 'water' && d.solute === 'NaCl' && d.Tmeas <= -3.0; }
    },
    {
      id: 'colligative-properties-6', level: 5,
      title: { zh: '外插法', en: 'Extrapolation' },
      desc: { zh: '用「外插法」量出一種溶液的凝固點下降（至少 0.30 K），和理論值相差不超過 2%。', en: 'Use “Extrapolate” to measure the freezing-point depression of a solution (at least 0.30 K) to within 2% of the theoretical value.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'f' && known(d) && d.method === 'ext' && d.dT >= 0.3 && within(d.err, 0.02); }
    },
    {
      id: 'colligative-properties-7', level: 5,
      title: { zh: '回流', en: 'Under reflux' },
      desc: { zh: '裝上「回流冷凝管」，量出一種溶液的沸點上升，和理論值相差不超過 3%。', en: 'With the “Reflux condenser” on, measure the boiling-point elevation of a solution to within 3% of the theoretical value.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'b' && d.reflux && known(d) && within(d.err, 0.03); }
    },
    {
      id: 'colligative-properties-8', level: 5,
      title: { zh: '數一數粒子', en: 'Counting particles' },
      desc: { zh: '不勾「理想 i」，量出氯化鈉水溶液（至少 0.20 mol/kg）的凡特荷夫因子 i，在 1.85～1.95 之間。', en: 'With “Ideal i” off, measure the van ’t Hoff factor i of a sodium chloride solution (at least 0.20 mol/kg): it must be between 1.85 and 1.95.' },
      check: function (ev) { const d = me(ev); return !!d && d.solvent === 'water' && d.solute === 'NaCl' && !d.ideal && d.m >= 0.2 - 1e-9 && d.iExp != null && d.iExp >= 1.85 && d.iExp <= 1.95; }
    },
    {
      id: 'colligative-properties-9', level: 6,
      title: { zh: '黏在一起的離子', en: 'Ions that stick together' },
      desc: { zh: '不勾「理想 i」，量出硫酸鎂水溶液的凡特荷夫因子 i，在 1.25～1.35 之間（遠小於理想的 2）。', en: 'With “Ideal i” off, measure the van ’t Hoff factor i of magnesium sulfate solution: it must be between 1.25 and 1.35 (far below the ideal 2).' },
      check: function (ev) { const d = me(ev); return !!d && d.solvent === 'water' && d.solute === 'MgSO4' && !d.ideal && d.iExp != null && d.iExp >= 1.25 && d.iExp <= 1.35; }
    },
    {
      id: 'colligative-properties-10', level: 7,
      title: { zh: 'ΔT 與 m 成正比', en: 'ΔT is proportional to m' },
      desc: { zh: '同一種溶劑、同一種溶質，記錄 4 個以上不同濃度（最大是最小的 3 倍以上），ΔT—m 圖過原點直線的斜率與 i·K 相差不超過 3%，決定係數 R² 至少 0.998。', en: 'With the same solvent and solute, record 4 or more concentrations (the largest at least 3 times the smallest); the line through the origin on the ΔT–m graph must have a slope within 3% of i·K and R² of at least 0.998.' },
      check: function (ev) { const d = me(ev), L = d && d.line; return !!L && L.n >= 4 && L.span >= 3 - 1e-9 && within(L.k / L.kTh - 1, 0.03) && L.r2 >= 0.998; }
    },
    {
      id: 'colligative-properties-11', level: 8,
      title: { zh: '未知物的分子量', en: 'Molar mass of the unknown' },
      desc: { zh: '在未知物 X 卡片按「開始」，量出 X 的 ΔT，在揭曉之前算出它的莫耳質量，誤差在 3% 以內。', en: 'Press “Start” on the unknown X card, measure ΔT for X, and work out its molar mass to within 3% before revealing the answer.' },
      check: function (ev) { return okAnswer(an(ev), 0.03); }
    },
    {
      id: 'colligative-properties-12', level: 9,
      title: { zh: '精密測分子量', en: 'Precise molar mass' },
      desc: { zh: '在揭曉之前算出未知物 X 的莫耳質量，誤差在 1% 以內。', en: 'Work out the molar mass of unknown X to within 1% before revealing the answer.' },
      check: function (ev) { return okAnswer(an(ev), 0.01); }
    },
    {
      id: 'colligative-properties-h1', level: 3, hidden: true,
      riddle: { zh: '名字裡有冰，它卻從來不是水。', en: 'Called glacial, though it was never water.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'f' && d.solvent === 'acetic' && d.solute === 'none' && within(d.absErr, 0.1); }
    },
    {
      id: 'colligative-properties-h2', level: 4, hidden: true,
      riddle: { zh: '沉默得太久，一開口就是爆發。', en: 'Silent for too long, then it all bursts out at once.' },
      check: function (ev) { const d = tk(ev); return !!d && d.mode === 'b' && d.bumped && d.superMax >= 3.0; }
    },
    {
      id: 'colligative-properties-h3', level: 5, hidden: true,
      riddle: { zh: '成雙成對以後，人數反而少了一半。', en: 'Once they pair up, there are only half as many.' },
      check: function (ev) { const d = me(ev); return !!d && d.solute === 'benzoic' && !d.ideal && (d.solvent === 'benzene' || d.solvent === 'cyclohexane') && d.iExp != null && d.iExp <= 0.6 && d.iExp >= 0.4; }
    },
    {
      id: 'colligative-properties-h4', level: 5, hidden: true,
      riddle: { zh: '海，不在零度結冰。', en: 'The sea does not freeze at zero.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'f' && d.solvent === 'water' && d.solute === 'NaCl' && !d.ideal && d.wt >= 3.3 && d.wt <= 3.7 && d.Tmeas <= -2.0 && d.Tmeas >= -2.4; }
    },
    {
      id: 'colligative-properties-h5', level: 6, hidden: true,
      riddle: { zh: '多撒一把鹽，麵也不會快熟。', en: 'Another pinch of salt will not cook the noodles faster.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'b' && d.solvent === 'water' && d.solute === 'NaCl' && d.w2 / d.w1 <= 0.015 + 1e-9 && d.dT >= 0.05 && d.dT <= 0.3 && within(d.absErr, 0.03); }
    },
    {
      id: 'colligative-properties-h6', level: 7, hidden: true,
      riddle: { zh: '冬夜的路面，終於不再發亮。', en: 'On a winter night, the road no longer shines.' },
      check: function (ev) { const d = me(ev); return !!d && d.mode === 'f' && d.solvent === 'water' && d.solute !== 'none' && !d.ideal && d.Tmeas <= -9.5; }
    },
    {
      id: 'colligative-properties-h7', level: 7, hidden: true,
      riddle: { zh: '一個重、一個輕，站在一起卻分不出來。', en: 'One heavy, one light — side by side, you cannot tell them apart.' },
      check: function (ev) {
        const d = me(ev);
        if (!d || d.mode !== 'f' || NONEL.indexOf(d.solute) < 0 || d.dT < 0.5) return false;
        return (d.prev || []).some(function (p) {
          return p.mode === 'f' && p.solvent === d.solvent && NONEL.indexOf(p.solute) >= 0 && p.solute !== d.solute && !p.isX &&
            Math.abs(p.dT - d.dT) <= 0.01 * Math.max(p.dT, d.dT) && Math.max(p.w2, d.w2) >= 1.5 * Math.min(p.w2, d.w2);
        });
      }
    },
    {
      id: 'colligative-properties-h8', level: 8, hidden: true,
      riddle: { zh: '拆開的少一些，完整的多一些，卻在同一個溫度相遇。', en: 'Fewer that broke apart, more that stayed whole — and they meet at the same temperature.' },
      check: function (ev) {
        const d = me(ev);
        if (!d || d.mode !== 'f' || d.solvent !== 'water' || d.ideal || d.dT < 1.0 || d.isX || d.solute === 'none') return false;
        const el = d.electrolyte;
        if (!el && NONEL.indexOf(d.solute) < 0) return false;
        return (d.prev || []).some(function (p) {
          return p.mode === 'f' && p.solvent === 'water' && !p.ideal && !p.isX && p.solute !== 'none' && p.electrolyte !== el &&
            (p.electrolyte || NONEL.indexOf(p.solute) >= 0) && p.dT >= 1.0 && Math.abs(p.Tmeas - d.Tmeas) <= 0.01 * d.dT;
        });
      }
    },
    {
      id: 'colligative-properties-h9', level: 9, hidden: true,
      riddle: { zh: '換一個更敏感的舞台，陌生人的分量就藏不住了。', en: 'On a more sensitive stage, a stranger cannot hide its weight.' },
      check: function (ev) { const d = an(ev); return okAnswer(d, 0.005) && d.via && d.via.solvent === 'cyclohexane'; }
    },
    {
      id: 'colligative-properties-h10', level: 10, hidden: true,
      riddle: { zh: '往上走的那條路，也認得出陌生人。', en: 'The road that climbs can also recognise a stranger.' },
      check: function (ev) { const d = an(ev); return okAnswer(d, 0.01) && d.via && d.via.mode === 'b'; }
    }
  ]);
})();
