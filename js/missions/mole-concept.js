/* missions/mole-concept.js — 莫耳與亞佛加厥數的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/mole-concept.js 只在使用者操作之後回報）：
  //   'weigh'：天平任一盤改變 { a, b: { id, phase（s／l／g）, unit（g／mol／N／V）, m（g）, n（mol）, N（個）, atoms, electrons, V（cm³） }, cond（stp／rt）, dm（b.m − a.m） }
  //   'zoom'：放大鏡改變 { id（H2O／Cu／NaCl／Au）, L（視野邊長 nm）, Nview（邊長 L 的立方體裡的粒子數）, V0（mL）, N0, cuts, Nleft, src（'zoom' 拖放大倍率／'cut' 對切） }
  //   'film'：油膜法按「計算」{ method（last／fit）, h（nm）, hTrue, hErr, k, NA, NAerr, points, r2, grids[], edge, powders[], droppers[], cal[], Ds[] }
  const wg = function (ev) { return ev.type === 'weigh' && ev.data && ev.data.a && ev.data.b ? ev.data : null; };
  const zm = function (ev) { return ev.type === 'zoom' && ev.data ? ev.data : null; };
  const fm = function (ev) { return ev.type === 'film' && ev.data ? ev.data : null; };
  const relEq = function (x, y, tol) { const m = Math.max(Math.abs(x), Math.abs(y)); return m > 0 && Math.abs(x - y) <= tol * m; };
  const ratio = function (x, y) { return Math.max(x, y) / Math.min(x, y); };
  const pans = function (d) { return [d.a, d.b]; };
  const clean = function (d) { return !d.edge && d.powders.every(function (p) { return p === 'thin'; }); };

  LabMission.register('mole-concept', [
    {
      id: 'mole-concept-1', level: 1,
      title: { zh: '天平平衡', en: 'Balance the scales' },
      desc: { zh: '左右兩盤放不同的物質（每盤至少 1 g），讓天平平衡（質量相差不超過 0.01 g）。', en: 'Put a different substance on each pan (at least 1 g each) and make the balance level (masses within 0.01 g).' },
      check: function (ev) { const d = wg(ev); return !!d && d.a.id !== d.b.id && d.a.m >= 1 && d.b.m >= 1 && Math.abs(d.dm) <= 0.01; }
    },
    {
      id: 'mole-concept-2', level: 2,
      title: { zh: '秤出 0.250 莫耳', en: 'Weigh out 0.250 mol' },
      desc: { zh: '用「克」當單位，在其中一盤秤出 0.250 mol 的氯化鈉（莫耳數誤差 0.2% 以內）。', en: 'Using “g” as the unit, weigh out 0.250 mol of sodium chloride on one pan (amount within 0.2%).' },
      check: function (ev) { const d = wg(ev); return !!d && pans(d).some(function (p) { return p.id === 'NaCl' && p.unit === 'g' && Math.abs(p.n - 0.25) <= 0.0005; }); }
    },
    {
      id: 'mole-concept-3', level: 3,
      title: { zh: '一樣多，不一樣重', en: 'Same count, different weight' },
      desc: { zh: '兩盤放不同的物質，粒子數相同（相差 0.5% 以內），而且一盤的質量是另一盤的 5 倍以上。', en: 'Put different substances on the pans with the same number of particles (within 0.5%), one pan at least 5 times heavier than the other.' },
      check: function (ev) { const d = wg(ev); return !!d && d.a.id !== d.b.id && relEq(d.a.N, d.b.N, 0.005) && ratio(d.a.m, d.b.m) >= 5; }
    },
    {
      id: 'mole-concept-4', level: 3,
      title: { zh: '看見一個水分子', en: 'One water molecule' },
      desc: { zh: '在「放大到原子」拖動放大倍率，把視野縮小到只裝得下大約 1 個水分子（0.8–1.25 個）。', en: 'In “Zoom to atoms”, zoom in until the field of view holds about one water molecule (0.8–1.25).' },
      check: function (ev) { const d = zm(ev); return !!d && d.src === 'zoom' && d.id === 'H2O' && d.Nview >= 0.8 && d.Nview <= 1.25; }
    },
    {
      id: 'mole-concept-5', level: 4,
      title: { zh: '亞佛加厥定律', en: "Avogadro's law" },
      desc: { zh: '兩盤放兩種不同的氣體，體積相同（相差 0.5% 以內），但一盤的質量是另一盤的 10 倍以上。', en: 'Put two different gases on the pans with equal volumes (within 0.5%), one at least 10 times heavier than the other.' },
      check: function (ev) { const d = wg(ev); return !!d && d.a.phase === 'g' && d.b.phase === 'g' && d.a.id !== d.b.id && relEq(d.a.V, d.b.V, 0.005) && ratio(d.a.m, d.b.m) >= 10; }
    },
    {
      id: 'mole-concept-6', level: 5,
      title: { zh: '原子一樣多', en: 'The same number of atoms' },
      desc: { zh: '兩盤放不同的物質，原子總數相同（相差 0.5% 以內），但粒子（分子）數相差 1.2 倍以上。', en: 'Put different substances on the pans with the same total number of atoms (within 0.5%) but particle (molecule) numbers differing by a factor of 1.2 or more.' },
      check: function (ev) { const d = wg(ev); return !!d && d.a.id !== d.b.id && relEq(d.a.atoms, d.b.atoms, 0.005) && ratio(d.a.N, d.b.N) >= 1.2; }
    },
    {
      id: 'mole-concept-7', level: 5,
      title: { zh: '單分子膜', en: 'A monolayer' },
      desc: { zh: '用油膜法量出油酸單分子膜的厚度，誤差 10% 以內（粉要撒薄、油膜不可碰到盤邊）。', en: 'Use the oil-film method to measure the thickness of the oleic-acid monolayer to within 10% (thin powder, and the film must not touch the edge of the tray).' },
      check: function (ev) { const d = fm(ev); return !!d && clean(d) && Math.abs(d.hErr) <= 0.10; }
    },
    {
      id: 'mole-concept-8', level: 6,
      title: { zh: '數量級對了', en: 'The right order of magnitude' },
      desc: { zh: '用立方體假設（長寬比 1）從油膜估計亞佛加厥數，得到正確的數量級（介於 10 的 23 次方與 10 的 24 次方之間）。', en: 'Assume the molecules are cubes (aspect ratio 1) and estimate Avogadro’s number from the oil film, getting the right order of magnitude (between 10^23 and 10^24).' },
      check: function (ev) { const d = fm(ev); return !!d && clean(d) && Math.abs(d.k - 1) < 1e-9 && d.NA >= 1e23 && d.NA < 1e24; }
    },
    {
      id: 'mole-concept-9', level: 7,
      title: { zh: '面積與體積成正比', en: 'Area is proportional to volume' },
      desc: { zh: '量至少 4 個不同滴數的油膜面積，用「直線斜率」求膜厚，誤差 3% 以內。', en: 'Measure the film area for at least 4 different numbers of drops and use the “Line slope” to find the thickness to within 3%.' },
      check: function (ev) { const d = fm(ev); return !!d && clean(d) && d.method === 'fit' && d.points >= 4 && Math.abs(d.hErr) <= 0.03; }
    },
    {
      id: 'mole-concept-10', level: 9,
      title: { zh: '分子不是方塊', en: 'Molecules are not cubes' },
      desc: { zh: '膜厚誤差 2% 以內，並調整「分子的長寬比」，讓估計的亞佛加厥數與 6.022 × 10²³ 相差 3% 以內。', en: 'Measure the thickness to within 2% and adjust the “aspect ratio of a molecule” so that your estimate of Avogadro’s number is within 3% of 6.022 × 10²³.' },
      check: function (ev) { const d = fm(ev); return !!d && clean(d) && Math.abs(d.hErr) <= 0.02 && Math.abs(d.NAerr) <= 0.03; }
    },
    {
      id: 'mole-concept-11', level: 10,
      title: { zh: '精密油膜', en: 'Precision oil film' },
      desc: { zh: '全部用 0.5 cm 的格子數面積，量出膜厚，誤差 1% 以內。', en: 'Count the area with the 0.5 cm grid only and measure the thickness to within 1%.' },
      check: function (ev) { const d = fm(ev); return !!d && clean(d) && d.grids.every(function (g) { return g === 0.5; }) && Math.abs(d.hErr) <= 0.01; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'mole-concept-h1', level: 3, hidden: true,
      riddle: { zh: '二〇一九年以前，有一種黑色的十二，是全世界數數的起點。', en: 'Before 2019, a certain black twelve was where the whole world started counting.' },
      check: function (ev) { const d = wg(ev); return !!d && pans(d).some(function (p) { return p.id === 'C' && Math.abs(p.m - 12) <= 0.005; }); }
    },
    {
      id: 'mole-concept-h2', level: 4, hidden: true,
      riddle: { zh: '一八〇八年的巴黎：兩份與一份，合成了水。', en: 'Paris, 1808: two parts and one part made water.' },
      check: function (ev) {
        const d = wg(ev); if (!d) return false;
        const h = d.a.id === 'H2' ? d.a : d.b.id === 'H2' ? d.b : null, o = d.a.id === 'O2' ? d.a : d.b.id === 'O2' ? d.b : null;
        return !!h && !!o && Math.abs(h.V / o.V - 2) <= 0.01;
      }
    },
    {
      id: 'mole-concept-h3', level: 5, hidden: true,
      riddle: { zh: '一間只住四個人的小房間，一再重複，就蓋成了整座城。', en: 'A tiny room for four, repeated over and over, becomes a whole city.' },
      check: function (ev) { const d = zm(ev); return !!d && d.src === 'zoom' && d.id !== 'H2O' && d.Nview >= 3.995 && d.Nview <= 4.015; }
    },
    {
      id: 'mole-concept-h4', level: 5, hidden: true,
      riddle: { zh: '重了十倍，卻擠進更小的杯子。', en: 'Ten times heavier, yet it fits in a smaller cup.' },
      check: function (ev) {
        const d = wg(ev); if (!d || d.a.phase === 'g' || d.b.phase === 'g' || d.a.id === d.b.id || !relEq(d.a.n, d.b.n, 0.01)) return false;
        const hv = d.a.m > d.b.m ? d.a : d.b, lt = hv === d.a ? d.b : d.a;
        return hv.m >= 10 * lt.m && hv.V < lt.V;
      }
    },
    {
      id: 'mole-concept-h5', level: 6, hidden: true,
      riddle: { zh: '一位紅、一位灰的鄰居，住一樣大的房子，家裡的人也一樣多。', en: 'Two neighbours, one red and one grey: houses of the same size, and the same number of people inside.' },
      check: function (ev) { const d = wg(ev); return !!d && d.a.id !== d.b.id && d.a.phase !== 'g' && d.b.phase !== 'g' && relEq(d.a.V, d.b.V, 0.003) && relEq(d.a.N, d.b.N, 0.003); }
    },
    {
      id: 'mole-concept-h6', level: 6, hidden: true,
      riddle: { zh: '換一支筆寫字，線條還是一樣細。', en: 'Change the pen, and the line is just as fine.' },
      check: function (ev, mem) {
        const d = fm(ev); if (!d || !clean(d) || d.method !== 'last' || !(d.cal[0] > 0) || Math.abs(d.hErr) > 0.02) return false;
        mem.dr = mem.dr || {};
        mem.dr[d.droppers[0]] = true;
        return Object.keys(mem.dr).length >= 2;
      }
    },
    {
      id: 'mole-concept-h7', level: 7, hidden: true,
      riddle: { zh: '一個你整天在呼吸，一個會奪人性命；天平卻分不出誰是誰。', en: 'One you breathe all day, the other can kill — yet no balance can tell them apart.' },
      check: function (ev) { const d = wg(ev); return !!d && d.a.id !== d.b.id && relEq(d.a.m, d.b.m, 0.0005) && relEq(d.a.N, d.b.N, 0.0005); }
    },
    {
      id: 'mole-concept-h8', level: 8, hidden: true,
      riddle: { zh: '一八六五年的維也納：一顆方糖大小的冷空氣裡，住了多少居民？', en: 'Vienna, 1865: how many live in a sugar cube of cold air?' },
      check: function (ev) { const d = wg(ev); return !!d && d.cond === 'stp' && pans(d).some(function (p) { return p.phase === 'g' && Math.abs(p.V - 1) <= 0.005; }); }
    },
    {
      id: 'mole-concept-h9', level: 7, hidden: true,
      riddle: { zh: '一刀又一刀，直到再切一刀，它就不再是它。', en: 'Cut after cut, until one more cut and it would no longer be itself.' },
      check: function (ev, mem) {
        const d = zm(ev); if (!d) return false;
        // 要一刀一刀切下來：上一次對切剛好少一刀（亂拉滑桿跳過去不算）
        const prev = mem.prev; mem.prev = d.src === 'cut' ? d.cuts : null;
        return d.src === 'cut' && prev === d.cuts - 1 && d.Nleft >= 1 && d.Nleft < 2;
      }
    },
    {
      id: 'mole-concept-h10', level: 9, hidden: true,
      riddle: { zh: '人數一樣、體重不同，口袋裡的零錢卻一樣多。', en: 'The same number of people, different weights — and exactly the same small change in their pockets.' },
      check: function (ev) { const d = wg(ev); return !!d && d.a.id !== d.b.id && relEq(d.a.n, d.b.n, 0.005) && relEq(d.a.electrons, d.b.electrons, 0.005) && ratio(d.a.m, d.b.m) >= 1.05; }
    }
  ]);
})();
