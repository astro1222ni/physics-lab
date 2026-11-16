/* 三個自編範例共用原實驗；給定數據不列入學生自己的量測。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { const data = factory(); root.CurrentBalanceExamples = data; root.LabExamples.define('current-balance', data); }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const p = (zh, en) => [zh, en];
  const conditions = p('螺線管水平，bc 在中央，兩臂各 14.0 cm；長螺線管模型、無儀器誤差。', 'The solenoid is horizontal, bc is centered, both arms are 14.0 cm; use the long-solenoid model and exact instruments.');
  return [
    { n: 1, q: p('天平已歸零。I\u2081 = 2.00 A、I\u2082 = 3.00 A，bc 向下受力；漆包線每公分 40 mg。要剪多長才平衡？'.replace('I\u2081','\\(I_1\\)').replace('I\u2082','\\(I_2\\)'), 'The balance is zeroed. With \\(I_1=2.00\\) A and \\(I_2=3.00\\) A, bc is pulled down. The wire has 40 mg per cm. What length balances it?'), concept: [conditions],
      state: { I1: 2, I2: 3, len: 2.5, nut: 8.4, s1: 1, s2: 1, hung: true, power: true },
      sol: [p('等臂時：\\(mg=I_1L\\mu_0nI_2\\)。先把 3.00 cm 換成 0.0300 m。', 'Equal arms give \\(mg=I_1L\\mu_0nI_2\\). Convert 3.00 cm to 0.0300 m.'), p('算出 \\(m=92.3\\,\\mathrm{mg}\\)，再除以 40 mg/cm：長度 2.31 cm。', 'This gives \\(m=92.3\\,\\mathrm{mg}\\). Divide by 40 mg/cm to get 2.31 cm.'), p('把剪線長度設成 2.3 cm，等天平停穩再記錄。這約等於四粒生米。', 'Set the length to 2.3 cm, let the balance settle, then record. The mass is about four grains of uncooked rice.')] },
    { n: 2, q: p('天平已歸零，固定掛 61 mg，bc 向下受力。給定五組平衡電流，怎麼把雙曲線改畫成直線來求 \\(\\mu_0\\)？', 'The zeroed balance holds 61 mg, with bc pulled down. Five balancing current pairs are given. How can you turn the hyperbola into a straight line to find \\(\\mu_0\\)?'), concept: [conditions],
      state: { I1: 2, I2: 1.9822, len: 1.525, nut: 8.4, s1: 1, s2: 1, hung: true, power: true },
      sol: [p('固定質量時，\\(I_1I_2=mg/(\\mu_0nL)\\)。原來的 \\(I_1\\)–\\(I_2\\) 圖是雙曲線。', 'At fixed mass, \\(I_1I_2=mg/(\\mu_0nL)\\), so \\(I_1\\) versus \\(I_2\\) is a hyperbola.'), p('把橫軸改成 \\(1/I_2\\)，縱軸用 \\(I_1\\)。斜率 \\(k=mg/(\\mu_0nL)\\)，單位 \\(\\mathrm{A}^2\\)。', 'Plot \\(I_1\\) against \\(1/I_2\\). The slope is \\(k=mg/(\\mu_0nL)\\), in \\(\\mathrm{A}^2\\).'), p('讀圖斜率約 3.96 \\(\\mathrm{A}^2\\)；代回 \\(\\mu_0=mg/(knL)\\)，再和公認值比較。', 'Read a slope of about 3.96 \\(\\mathrm{A}^2\\); substitute into \\(\\mu_0=mg/(knL)\\) and compare with the accepted value.')] },
    { n: 3, q: p('螺母停在 10.00 mm，忘了先歸零；固定 \\(I_1=3.00\\) A，掛五種質量並平衡。B–\\(I_2\\) 圖斜率正確，為什麼截距不為零？', 'The nut stays at 10.00 mm without zeroing. Fix \\(I_1=3.00\\) A and balance five masses. Why does the B–\\(I_2\\) line have the correct slope but a nonzero intercept?'), concept: [conditions],
      state: { I1: 3, I2: 1.856, len: 2, nut: 10, s1: 1, s2: 1, hung: true, power: true },
      sol: [p('未歸零多出固定力矩 \\(\\tau_z\\)：\\(mgd_2+\\tau_z=I_1LBd_1\\)。', 'An unzeroed balance adds a constant torque \\(\\tau_z\\): \\(mgd_2+\\tau_z=I_1LBd_1\\).'), p('用重量反推的 \\(B_{\\mathrm{meas}}=\\mu_0 n I_2-\\tau_z/(I_1Ld_1)\\)。固定零偏只平移直線。', 'The weight-derived field is \\(B_{\\mathrm{meas}}=\\mu_0 n I_2-\\tau_z/(I_1Ld_1)\\). A fixed zero offset shifts the line.'), p('這組截距約 −0.622 mT；自由截距擬合仍給正確斜率。強迫過原點或只用單筆資料就會偏掉。', 'The intercept is about −0.622 mT. A free-intercept fit preserves the slope; forcing the origin or using one row introduces bias.')] }
  ];
});
