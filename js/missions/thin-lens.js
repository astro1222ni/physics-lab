/* missions/thin-lens.js — 薄透鏡的成像（光具座實驗）的任務（星星數 = 等級 1–10）
 * 事件：
 *   'record'（按「記錄」成功時）data = { lens, kind（convex／concave）, mystery, revealed, method（screen／parallax／pin）, mode（ideal／error）,
 *            p, q, m（由讀數算出）, fi（這一筆算出的焦距）, fTrue, err（|fi − f|/|f|）, n（此透鏡的筆數）, nm（此透鏡、此方法的筆數）,
 *            pSpan（此透鏡、此方法的 p 範圍）, fit, errFit（此透鏡全部數據的直線截距求 f 的誤差）, errMean（各列 f 平均的誤差）, fitSame（只用此方法的數據）,
 *            methodsOk（各方法是否有誤差 ≤ 2 % 的一筆）, conj（像屏法清楚的共軛兩筆）, besselErr（含誤差時的共軛法）,
 *            像屏法另有 blur、sharp、D；視差法另有 rodErr }
 *   'bench'（拖曳結束或滑桿改變時）data = { method, lens, kind, mystery, mode, f, p（真正的物距）, pRead, q, real, atInfinity, blur, sharp }
 *   'reveal'（揭曉神秘透鏡）
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const rec = function (ev, method) { return ev.type === 'record' && (!method || ev.data.method === method); };
  const le = function (v, tol) { return isFinite(v) && v <= tol; };

  LabMission.register('thin-lens', [
    {
      id: 'thin-lens-1', level: 1,
      title: { zh: '第一個清楚的像', en: 'The first sharp image' },
      desc: { zh: '用像屏法在像屏上得到清楚的像（模糊圓斑不超過 0.5 mm），並記錄一筆數據。', en: 'Use the screen method to get a sharp image on the screen (blur disc no larger than 0.5 mm) and record it.' },
      check: function (ev) { return rec(ev, 'screen') && ev.data.sharp; }
    },
    {
      id: 'thin-lens-2', level: 2,
      title: { zh: '一樣大', en: 'Same size' },
      desc: { zh: '用像屏法記錄一個清楚、而且與物體一樣大的像（由讀數算出的 |m| 在 0.98 到 1.02 之間）。', en: 'With the screen method, record a sharp image the same size as the object (|m| from your readings between 0.98 and 1.02).' },
      check: function (ev) { const d = ev.data; return rec(ev, 'screen') && d.sharp && Math.abs(d.m) >= 0.98 && Math.abs(d.m) <= 1.02; }
    },
    {
      id: 'thin-lens-3', level: 3,
      title: { zh: '投影機', en: 'Projector' },
      desc: { zh: '用像屏法記錄一個清楚、放大至少 3 倍的像（|m| ≥ 3）。', en: 'With the screen method, record a sharp image magnified at least 3 times (|m| ≥ 3).' },
      check: function (ev) { const d = ev.data; return rec(ev, 'screen') && d.sharp && Math.abs(d.m) >= 3; }
    },
    {
      id: 'thin-lens-4', level: 4,
      title: { zh: '凹透鏡的虛像', en: 'The virtual image of a concave lens' },
      desc: { zh: '用視差法找出凹透鏡所成虛像的位置，記錄一筆由它算出的焦距誤差不超過 3 % 的數據。', en: 'Locate the virtual image of a concave lens by parallax and record a row whose focal length is within 3 %.' },
      check: function (ev) { const d = ev.data; return rec(ev, 'parallax') && d.kind === 'concave' && d.q < 0 && le(d.err, 0.03); }
    },
    {
      id: 'thin-lens-5', level: 5,
      title: { zh: '完整的數據表', en: 'A complete data table' },
      desc: { zh: '同一個透鏡、同一種方法記錄至少 5 筆，物距 p 的範圍至少 10 cm，且由 1/q 對 1/p 圖的截距求得的焦距誤差不超過 3 %。', en: 'Record at least 5 rows with one lens and one method, p spanning at least 10 cm, and get f from the intercepts of the 1/q–1/p graph within 3 %.' },
      check: function (ev) { const d = ev.data; return rec(ev) && d.nm >= 5 && d.pSpan >= 10 - 1e-9 && le(d.fitSame, 0.03); }
    },
    {
      id: 'thin-lens-6', level: 6,
      title: { zh: '插針高手', en: 'Master of pins' },
      desc: { zh: '用插針法定出像的位置，記錄一筆焦距誤差不超過 2 % 的數據。', en: 'Locate the image with the pin method and record a row whose focal length is within 2 %.' },
      check: function (ev) { return rec(ev, 'pin') && le(ev.data.err, 0.02); }
    },
    {
      id: 'thin-lens-7', level: 6,
      title: { zh: '共軛位置', en: 'Conjugate positions' },
      desc: { zh: '光源屏與像屏都不動，找出透鏡能成清楚像的兩個位置（相距至少 5 cm），用像屏法各記錄一筆。', en: 'Keep the source and the screen fixed, find the two lens positions (at least 5 cm apart) that give a sharp image, and record both with the screen method.' },
      check: function (ev) { const c = ev.data.conj; return rec(ev, 'screen') && !!c && c.d >= 5 - 1e-9; }
    },
    {
      id: 'thin-lens-8', level: 7,
      title: { zh: '放大鏡的虛像', en: 'The magnifier’s virtual image' },
      desc: { zh: '物體放在凸透鏡的焦點內，用視差法找出正立虛像的位置，記錄一筆焦距誤差不超過 3 % 的數據。', en: 'Put the object inside the focal length of a convex lens, find the upright virtual image by parallax and record a row within 3 %.' },
      check: function (ev) { const d = ev.data; return rec(ev, 'parallax') && d.kind === 'convex' && d.q < 0 && le(d.err, 0.03); }
    },
    {
      id: 'thin-lens-9', level: 8,
      title: { zh: '神秘凸透鏡', en: 'Mystery convex lens' },
      desc: { zh: '在揭曉之前，量出神秘凸透鏡的焦距：至少 4 筆數據，由截距求得的焦距誤差不超過 2 %。', en: 'Before revealing it, measure the mystery convex lens: at least 4 rows, f from the intercepts within 2 %.' },
      check: function (ev) { const d = ev.data; return rec(ev) && d.lens === 'cxM' && !d.revealed && d.n >= 4 && le(d.errFit, 0.02); }
    },
    {
      id: 'thin-lens-10', level: 9,
      title: { zh: '神秘凹透鏡', en: 'Mystery concave lens' },
      desc: { zh: '在揭曉之前，量出神秘凹透鏡的焦距：至少 4 筆數據，各列焦距的平均值誤差不超過 2 %。', en: 'Before revealing it, measure the mystery concave lens: at least 4 rows, with the mean of the row values of f within 2 %.' },
      check: function (ev) { const d = ev.data; return rec(ev) && d.lens === 'ccM' && !d.revealed && d.n >= 4 && le(d.errMean, 0.02); }
    },
    {
      id: 'thin-lens-11', level: 10,
      title: { zh: '不怕誤差的共軛法', en: 'Errors can’t stop you' },
      desc: { zh: '在「含誤差」模式下，用像屏法找出透鏡的兩個共軛位置，以共軛法（只用物屏距離 D 與兩位置的間距 d）求焦距，誤差不超過 0.5 %。', en: 'With errors on, find the two conjugate lens positions with the screen method and use the conjugate method (only D and the shift d) to get f within 0.5 %.' },
      check: function (ev) { const b = ev.data.besselErr; return rec(ev, 'screen') && ev.data.mode === 'error' && !!b && le(b.err, 0.005); }
    },
    {
      id: 'thin-lens-h1', level: 3, hidden: true,
      riddle: { zh: '從此光不再相聚，也不再分離。', en: 'From here on the light neither gathers nor parts.' },
      check: function (ev) { const d = ev.data; return ev.type === 'bench' && d.method === 'screen' && d.kind === 'convex' && Math.abs(d.p - d.f) <= 0.1 + 1e-9; }
    },
    {
      id: 'thin-lens-h2', level: 6, hidden: true,
      riddle: { zh: '布幕、眼角、針尖，說的是同一句話。', en: 'The screen, the corner of the eye and the point of a pin all say the same thing.' },
      check: function (ev) { const o = ev.data.methodsOk || {}; return rec(ev) && o.screen && o.parallax && o.pin; }
    },
    {
      id: 'thin-lens-h3', level: 8, hidden: true,
      riddle: { zh: '它從不落在任何東西上，你卻能指出它在哪裡。', en: 'It never lands on anything, yet you can point to where it is.' },
      check: function (ev) { const d = ev.data; return rec(ev, 'parallax') && d.kind === 'convex' && d.q > 0 && le(d.err, 0.01); }
    }
  ]);
})();
