/* missions/triangle-centers.js — 三角形的四心與歐拉線的任務（星星數 = 等級 1–10；隱藏任務 × 2）
 * 事件（js/triangle-centers.js 發出，都在使用者操作之後；挑戰中與看答案時不發 'tc'）：
 *   'tc'：拖完頂點、點畫布、按鍵、切換「看哪一心」、切換顯示之後。
 *         { src, focus（'all' | 'G' | 'O' | 'I' | 'H'）, showNine, showTrace, showEuler, runSpan（開著軌跡時，一個頂點沿平行對邊的直線走了多遠）,
 *           以及 TCCore.features 的所有量：ok, a, b, c, A, B, C, R, r, Rr, kind, big, small, iso, equi, where{G,O,I,H}, Nwhere,
 *           OH, OG, GH, OI, Ioff, Hvert, spread, hR, hSide, hBis, eulerPar, oiPar, oiPerp, oir, intSides, intR }
 *   'guess'：挑戰選了答案。{ correct, streak, secs, last10（連續 10 題以上時最近 10 題的總秒數）, ask }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const tc = function (ev) { return ev.type === 'tc' && ev.data.ok; };
  const notRight = function (d) { return Math.abs(d.big - 90) > 0.5; };
  const right = function (d) { return Math.abs(d.big - 90) <= 0.05; };
  const guess = function (ev) { return ev.type === 'guess' && ev.data.correct; };

  LabMission.register('triangle-centers', [
    {
      id: 'triangle-centers-1', level: 1,
      title: { zh: '三條高交在一點', en: 'Three altitudes, one point' },
      desc: { zh: '在「看哪一心」選垂心，看三條高（或延長線）怎麼交在同一點。', en: 'Under “Which centre”, choose the orthocentre and see the three altitudes (or their extensions) meet in one point.' },
      check: function (ev) { return tc(ev) && ev.data.src === 'focus' && ev.data.focus === 'H'; }
    },
    {
      id: 'triangle-centers-2', level: 2,
      title: { zh: '跑出去的兩顆心', en: 'Two centres outside' },
      desc: { zh: '把一個角拖成鈍角，讓外心 O 和垂心 H 都跑到三角形外面。', en: 'Drag one angle past 90° so that the circumcentre O and the orthocentre H both leave the triangle.' },
      check: function (ev) { return tc(ev) && ev.data.where.O === 'out' && ev.data.where.H === 'out'; }
    },
    {
      id: 'triangle-centers-3', level: 2,
      title: { zh: '坐在角上的垂心', en: 'The orthocentre on a corner' },
      desc: { zh: '做一個直角三角形，讓垂心 H 剛好落在直角的頂點上，外心 O 落在斜邊上。', en: 'Make a right triangle: the orthocentre H sits exactly on the right-angled corner and the circumcentre O on the hypotenuse.' },
      check: function (ev) { return tc(ev) && ev.data.Hvert <= 1e-6 && ev.data.where.O === 'on'; }
    },
    {
      id: 'triangle-centers-4', level: 3,
      title: { zh: '四心都在裡面', en: 'All four inside' },
      desc: { zh: '做一個銳角三角形，四心都在裡面，而且 O 和 H 至少隔半個外接圓半徑（OH ≥ R／2）。', en: 'Make an acute triangle with all four centres inside and O and H at least half a circumradius apart (OH ≥ R／2).' },
      check: function (ev) { const d = ev.data; return tc(ev) && d.kind === 'acute' && ['G', 'O', 'I', 'H'].every(function (k) { return d.where[k] === 'in'; }) && d.OH >= 0.5 * d.R; }
    },
    {
      id: 'triangle-centers-5', level: 3,
      title: { zh: '第四顆心也上線', en: 'The fourth centre joins the line' },
      desc: { zh: '做一個等腰（但不是正）三角形，看內心 I 也落在歐拉線上。', en: 'Make an isosceles (but not equilateral) triangle and see the incentre I join the Euler line.' },
      check: function (ev) { const d = ev.data; return tc(ev) && d.iso && !d.equi && d.OH > 1e-6; }
    },
    {
      id: 'triangle-centers-6', level: 4,
      title: { zh: '九點圓的圓心出走', en: 'The nine-point centre walks out' },
      desc: { zh: '打開九點圓，讓它的圓心 N 跑到三角形外面。', en: 'Turn on the nine-point circle and get its centre N outside the triangle.' },
      check: function (ev) { return tc(ev) && ev.data.showNine && ev.data.Nwhere === 'out'; }
    },
    {
      id: 'triangle-centers-7', level: 4,
      title: { zh: '一比二', en: 'One to two' },
      desc: { zh: '讓歐拉線上的 OG 剛好是 1（誤差 0.01 以內），看 GH 是多少。', en: 'Make OG on the Euler line exactly 1 (to within 0.01) and read GH.' },
      check: function (ev) { return tc(ev) && Math.abs(ev.data.OG - 1) <= 0.01; }
    },
    {
      id: 'triangle-centers-8', level: 5,
      title: { zh: '垂心畫出拋物線', en: 'The orthocentre draws a parabola' },
      desc: { zh: '打開四心的軌跡，固定兩個頂點，讓第三個頂點沿著和對邊平行的直線走至少 4 單位：重心畫直線，垂心畫拋物線。', en: 'Turn on the traces, keep two corners still and move the third along a line parallel to the side between them for at least 4 units: G draws a line, H a parabola.' },
      check: function (ev) { return tc(ev) && ev.data.showTrace && ev.data.runSpan >= 4; }
    },
    {
      id: 'triangle-centers-9', level: 6,
      title: { zh: '逼近歐拉不等式', en: 'Close to Euler’s inequality' },
      desc: { zh: '外接圓半徑至少是內切圓半徑的兩倍（R ≥ 2r）。讓 R／r 小於 2.001。', en: 'The circumradius is always at least twice the inradius (R ≥ 2r). Get R／r below 2.001.' },
      check: function (ev) { return tc(ev) && ev.data.Rr < 2.001; }
    },
    {
      id: 'triangle-centers-10', level: 6,
      title: { zh: '認得四顆心', en: 'Know your centres' },
      desc: { zh: '挑戰「這是哪一心」連續答對 4 題。', en: 'Answer 4 “Which centre is it?” problems in a row correctly.' },
      check: function (ev) { return guess(ev) && ev.data.streak >= 4; }
    },
    {
      id: 'triangle-centers-11', level: 7,
      title: { zh: '一眼看穿', en: 'At a glance' },
      desc: { zh: '挑戰「這是哪一心」連續答對 8 題。', en: 'Answer 8 “Which centre is it?” problems in a row correctly.' },
      check: function (ev) { return guess(ev) && ev.data.streak >= 8; }
    },
    {
      id: 'triangle-centers-12', level: 9,
      title: { zh: '幾何的直覺', en: 'Geometric instinct' },
      desc: { zh: '挑戰「這是哪一心」連續答對 10 題，最近 10 題合計 120 秒以內。', en: 'Answer 10 “Which centre is it?” problems in a row, the last 10 within 120 seconds in total.' },
      check: function (ev) { return guess(ev) && ev.data.streak >= 10 && ev.data.last10 <= 120; }
    },

    // ---------- 隱藏任務（只給隱晦的提示；完成時只說「隱藏任務完成」） ----------
    // 拖曳的頂點都在 0.05 的格點上：格點上「剛好」成立的條件很多（45°、等腰直角），亂按就會碰到，所以不用；
    // 其餘條件的容許值都收緊到「亂按 2000 回、每回 150 步」碰到的回數不超過 30（見任務證明）。
    {
      id: 'triangle-centers-h1', level: 3, hidden: true,
      title: { zh: '整數抱著整數', en: 'Whole numbers hugging a whole number' },
      desc: { zh: '三條整數的邊圍出一個端正的角，懷裡抱著的圓，半徑也是整數。', en: 'Three whole-number sides close around a square corner, and the circle they hug has a whole-number radius too.' },
      // 整數邊直角三角形，內切圓半徑 r = (兩股和 − 斜邊)／2 也是整數（例：3、4、5，r = 1）
      check: function (ev) { const d = ev.data; return tc(ev) && right(d) && d.intSides && d.intR; }
    },
    {
      id: 'triangle-centers-h2', level: 4, hidden: true,
      title: { zh: '四心同心', en: 'Four hearts as one' },
      desc: { zh: '四顆心擠在同一個地方，幾乎分不出誰是誰。', en: 'Four hearts crowded into one spot, almost impossible to tell apart.' },
      // 四心彼此的距離都不到外接圓半徑的 1%（格點上沒有真正的正三角形，只能逼近）
      check: function (ev) { return tc(ev) && ev.data.spread <= 0.01; }
    },
    {
      id: 'triangle-centers-h3', level: 5, hidden: true,
      title: { zh: '並肩而行', en: 'Side by side' },
      desc: { zh: '那條串起三顆心的線，乖乖地和一條邊並肩而行——而且沒有一個角是直角的一半。', en: 'The line that threads three hearts walks side by side with one edge — and no angle is half a right angle.' },
      // 歐拉線平行一邊（與 BC 平行 ⇔ tan B tan C = 3 ⇔ 垂心把高 AD 分成 2 : 1）；格點上做得到剛好平行。
      // 含 45° 的解（tan 是 1 和 3）在格點上太常見、亂按會碰到，所以排除 45° 與 135°（例：tan 是 1.5 和 2）
      check: function (ev) { const d = ev.data; return tc(ev) && d.eulerPar <= 1e-6 && d.angs.every(function (x) { return Math.abs(x - 45) > 0.01 && Math.abs(x - 135) > 0.01; }); }
    },
    {
      id: 'triangle-centers-h4', level: 6, hidden: true,
      title: { zh: '九點的中心', en: 'The centre of nine' },
      desc: { zh: '穿過九個點的那個圓，它的中心恰好落在小圓的圓周上。', en: 'The circle through nine points has its centre resting exactly on the small circle.' },
      // 九點圓圓心 N 在內切圓上：費爾巴哈 IN = R／2 − r = r ⇔ R = 4r（相對誤差 0.01% 以內）
      check: function (ev) { return tc(ev) && ev.data.nr <= 1e-4; }
    },
    {
      id: 'triangle-centers-h5', level: 6, hidden: true,
      title: { zh: '高的交會處', en: 'Where the heights meet' },
      desc: { zh: '三條高的交會處，恰好坐在小圓的圓周上。', en: 'The meeting point of the three heights sits exactly on the small circle.' },
      // 垂心在內切圓上：HI = r（相對誤差 0.01% 以內）
      check: function (ev) { return tc(ev) && ev.data.hr <= 1e-4; }
    },
    {
      id: 'triangle-centers-h6', level: 7, hidden: true,
      title: { zh: '永不相交', en: 'Never to meet' },
      desc: { zh: '大圓的心與小圓的心連成一線，和一條邊永遠不會相交。', en: 'The centres of the big circle and the small one line up with an edge they will never meet.' },
      // OI 平行一邊（OI ∥ BC ⇔ R cos A = r ⇔ cos B + cos C = 1），夾角 0.004° 以內
      check: function (ev) { return tc(ev) && ev.data.oiPar <= 0.004; }
    },
    {
      id: 'triangle-centers-h7', level: 7, hidden: true,
      title: { zh: '停在小圓上', en: 'Resting on the small circle' },
      desc: { zh: '大圓的心，恰好停在小圓的圓周上——但這裡沒有端正的角。', en: 'The big circle’s centre rests exactly on the small circle — and there is no square corner here.' },
      // OI = r ⇔ R(R − 2r) = r^2 ⇔ R／r = 1 + √2（等腰直角三角形就是，所以排除直角）
      check: function (ev) { const d = ev.data; return tc(ev) && d.oir <= 1e-4 && notRight(d); }
    },
    {
      id: 'triangle-centers-h8', level: 8, hidden: true,
      title: { zh: '黃金的距離', en: 'A golden distance' },
      desc: { zh: '大圓心走到小圓心，剛好是小圓的一條直徑那麼遠。', en: 'From the big circle’s centre to the small one’s is exactly one diameter of the small circle.' },
      // OI = 2r ⇔ R(R − 2r) = 4r^2 ⇔ R／r = 1 + √5 = 2φ（黃金比）
      check: function (ev) { return tc(ev) && ev.data.oi2r <= 1.5e-4; }
    },
    {
      id: 'triangle-centers-h9', level: 9, hidden: true,
      title: { zh: '在小圓心折一下', en: 'A fold at the small centre' },
      desc: { zh: '大圓心、小圓心與一個頂點，在小圓心處折出一個端正的角；三角形本身卻沒有。', en: 'The big circle’s centre, the small circle’s centre and a corner fold into a square corner at the small one — though the triangle itself has none.' },
      // OI ⊥ AI ⇔ b + c = 2a（三邊成等差），不是直角、最小角 ≥ 10°，與 90° 差 0.001° 以內
      check: function (ev) { const d = ev.data; return tc(ev) && d.oiPerp <= 1e-3 && notRight(d) && d.small >= 10; }
    },
    {
      id: 'triangle-centers-h10', level: 10, hidden: true,
      title: { zh: '一根輻條', en: 'One spoke' },
      desc: { zh: '從某個角走到高的交會處，量起來恰好是大圓的一根輻條——沒有端正的角，三個角也不全相等。', en: 'From one corner to where the heights meet is exactly one spoke of the big circle — no square corner, and not all angles equal.' },
      // 頂點到垂心 = R（AH = 2R|cos A| = R ⇔ A = 60° 或 120°）。格點上沒有剛好 60° 的角，要用 √3 的好分數近似（例 265／153），
      // 相對誤差 0.003% 以內（約 0.001°）；不是直角、最大最小角差 ≥ 5°
      check: function (ev) { const d = ev.data; return tc(ev) && d.hR <= 3e-5 && notRight(d) && d.big - d.small >= 5; }
    }
  ]);
})();
