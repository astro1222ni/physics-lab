/* missions/crystal-structures.js — 晶體結構與堆積的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/crystal-structures.js 只在使用者操作之後回報）：
  //   'cell'：{ s, mat, hypo, cut, coord, voids: { oct, tet, cube }, layers, n, size, view, selSp, selCN, selIn（被選的原子整顆在晶胞堆裡面）, Z, CN, pf, rho, stackType, stackN }
  //   'stack'：{ seq, n, type（few／sh／loose／hcp／ccp／dhcp／mixed）, hc, pf, cn }
  //   'record'：{ row, rows }（rows 的最後一筆就是剛記下的）
  //   'answer'：{ type（rho／r／NA）, mat, s, err, ok, revealed, tries, streak, kinds, rhoStructs }
  const cell = function (ev) { return ev.type === 'cell' && ev.data ? ev.data : null; };
  const stk = function (ev) { return ev.type === 'stack' && ev.data ? ev.data : null; };
  const rec = function (ev) { return ev.type === 'record' && ev.data && ev.data.rows ? ev.data.rows : null; };
  const ans = function (ev) { return ev.type === 'answer' && ev.data ? ev.data : null; };
  const good = function (d, tol) { return !!d && !d.revealed && d.err != null && isFinite(d.err) && Math.abs(d.err) <= tol; };
  const last2 = function (rows) { return rows && rows.length >= 2 ? [rows[rows.length - 2], rows[rows.length - 1]] : null; };

  LabMission.register('crystal-structures', [
    {
      id: 'crystal-structures-1', level: 1,
      title: { zh: '晶胞裡有幾個原子', en: 'How many atoms in the cell?' },
      desc: { zh: '選「面心立方」，勾「只看晶胞內的部分」，數出每個晶胞的 4 個原子。', en: 'Choose “Face-centred cubic” and tick “Only the part inside the cell” to count the 4 atoms per cell.' },
      check: function (ev) { const d = cell(ev); return !!d && d.s === 'fcc' && d.cut; }
    },
    {
      id: 'crystal-structures-2', level: 2,
      title: { zh: '八個鄰居', en: 'Eight neighbours' },
      desc: { zh: '選「體心立方」，勾「顯示配位數」，看一個原子被 8 個鄰居圍住。', en: 'Choose “Body-centred cubic” and tick “Show coordination”: one atom is surrounded by 8 neighbours.' },
      check: function (ev) { const d = cell(ev); return !!d && d.s === 'bcc' && d.coord && d.selCN === 8; }
    },
    {
      id: 'crystal-structures-3', level: 2,
      title: { zh: '鹽粒裡的鄰居', en: 'Neighbours in a grain of salt' },
      desc: { zh: '選「氯化鈉型」，勾「顯示配位數」，看一個陽離子被幾個陰離子圍住。', en: 'Choose “Rock salt” and tick “Show coordination”: see how many anions surround one cation.' },
      check: function (ev) { const d = cell(ev); return !!d && d.s === 'nacl' && d.coord && d.selSp === 'c' && d.selCN === 6; }
    },
    {
      id: 'crystal-structures-4', level: 3,
      title: { zh: '疊出六方最密', en: 'Build hexagonal close packing' },
      desc: { zh: '在「疊疊看」疊出 ABAB… 的六方最密，至少 4 層。', en: 'In “Stack the layers”, build ABAB… hexagonal close packing with at least 4 layers.' },
      check: function (ev) { const d = stk(ev); return !!d && d.type === 'hcp' && d.n >= 4; }
    },
    {
      id: 'crystal-structures-5', level: 3,
      title: { zh: '球與球之間的洞', en: 'The holes between the spheres' },
      desc: { zh: '選「面心立方」，同時勾「八面體空隙」與「四面體空隙」，找出每個晶胞的 4 個八面體空隙與 8 個四面體空隙。', en: 'Choose “Face-centred cubic” and tick both “Octahedral holes” and “Tetrahedral holes”: find the 4 octahedral and 8 tetrahedral holes per cell.' },
      check: function (ev) { const d = cell(ev); return !!d && d.s === 'fcc' && d.voids && d.voids.oct && d.voids.tet; }
    },
    {
      id: 'crystal-structures-6', level: 4,
      title: { zh: '疊出立方最密', en: 'Build cubic close packing' },
      desc: { zh: '在「疊疊看」疊出 ABCABC… 的立方最密，至少 6 層。', en: 'In “Stack the layers”, build ABCABC… cubic close packing with at least 6 layers.' },
      check: function (ev) { const d = stk(ev); return !!d && d.type === 'ccp' && d.n >= 6; }
    },
    {
      id: 'crystal-structures-7', level: 4,
      title: { zh: '三種立方比一比', en: 'Three cubes side by side' },
      desc: { zh: '把簡單立方、體心立方、面心立方都「記下來」，在比較表比較它們的堆積率。', en: 'Use “Record” for simple cubic, body-centred cubic and face-centred cubic, and compare their packing fractions in the table.' },
      check: function (ev) {
        const rows = rec(ev);
        if (!rows) return false;
        const has = function (s) { return rows.some(function (r) { return r.s === s; }); };
        return has('sc') && has('bcc') && has('fcc');
      }
    },
    {
      id: 'crystal-structures-8', level: 5,
      title: { zh: '由晶格常數算密度', en: 'Density from the lattice constant' },
      desc: { zh: '選「求密度」、按「出題」，在紙上算好填進去，誤差在 1% 以內。', en: 'Choose “Density”, press “New question”, work it out on paper and answer to within 1%.' },
      check: function (ev) { const d = ans(ev); return !!d && d.type === 'rho' && d.ok && good(d, 0.01); }
    },
    {
      id: 'crystal-structures-9', level: 6,
      title: { zh: '由密度算原子半徑', en: 'Radius from the density' },
      desc: { zh: '選「求原子半徑」、按「出題」，在紙上算好填進去，誤差在 1% 以內。', en: 'Choose “Atomic radius”, press “New question”, work it out on paper and answer to within 1%.' },
      check: function (ev) { const d = ans(ev); return !!d && d.type === 'r' && d.ok && good(d, 0.01); }
    },
    {
      id: 'crystal-structures-10', level: 7,
      title: { zh: '晶體裡數出亞佛加厥數', en: 'Avogadro\'s number from a crystal' },
      desc: { zh: '選「求亞佛加厥數」、按「出題」，在紙上算好填進去，誤差在 1% 以內。', en: 'Choose “Avogadro’s number”, press “New question”, work it out on paper and answer to within 1%.' },
      check: function (ev) { const d = ans(ev); return !!d && d.type === 'NA' && d.ok && good(d, 0.01); }
    },
    {
      id: 'crystal-structures-11', level: 8,
      title: { zh: '三種結構都算對', en: 'Three structures, all correct' },
      desc: { zh: '「求密度」在三種不同的結構都答對（誤差 1% 以內；按「全部清除」重新計算）。', en: 'Answer “Density” correctly for three different structures (within 1%; “Clear all” starts the count again).' },
      check: function (ev) { const d = ans(ev); return !!d && d.ok && d.rhoStructs && d.rhoStructs.length >= 3; }
    },
    {
      id: 'crystal-structures-12', level: 9,
      title: { zh: '晶體計算高手', en: 'Crystal calculator' },
      desc: { zh: '按「出題」連續答對 5 題，三種題型都要有（看答案或答錯就重新數）。', en: 'Press “New question” and answer 5 in a row correctly, using all three question types (showing the answer or a wrong answer restarts the count).' },
      check: function (ev) { const d = ans(ev); return !!d && d.ok && d.streak >= 5 && d.kinds >= 3; }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'crystal-structures-h1', level: 3, hidden: true,
      riddle: { zh: '每一層都踩在前一層的腳印上。', en: 'Every layer steps exactly into the footprints of the one below.' },
      check: function (ev) { const d = stk(ev); return !!d && d.type === 'sh' && d.n >= 6; }
    },
    {
      id: 'crystal-structures-h2', level: 6, hidden: true,
      riddle: { zh: '燒得通紅，它反而縮了身子。', en: 'Glowing red-hot, it shrinks instead.' },
      check: function (ev) {
        const L = last2(rec(ev));
        if (!L) return false;
        const k = L.map(function (r) { return r.hypo ? '' : r.mat; }).sort().join(',');
        return k === 'Fe912,Fe916';
      }
    },
    {
      id: 'crystal-structures-h3', level: 6, hidden: true,
      riddle: { zh: '不是二拍，也不是三拍，是四拍子的舞步。', en: 'Not two beats, not three — a dance in four.' },
      check: function (ev) { const d = stk(ev); return !!d && d.type === 'dhcp' && d.n >= 8; }
    },
    {
      id: 'crystal-structures-h4', level: 7, hidden: true,
      riddle: { zh: '一位天文學家猜了四百年的答案：亂中也有最密。', en: 'An astronomer\'s guess that took four centuries to prove: even in disorder, nothing packs closer.' },
      check: function (ev) { const d = stk(ev); return !!d && d.type === 'mixed' && d.n >= 12; }
    },
    {
      id: 'crystal-structures-h5', level: 7, hidden: true,
      riddle: { zh: '同樣的球，兩種隊形，輕重之比恰是正方形的邊比對角線。', en: 'The same balls in two formations: their densities compare like a square\'s side to its diagonal.' },
      check: function (ev) {
        const L = last2(rec(ev));
        if (!L || L[0].stack || L[1].stack || L[0].mat !== L[1].mat) return false;
        return L[0].s === 'sc' && !L[0].hypo && L[1].s === 'fcc' && L[1].hypo;   // 先記真實的簡單立方，再記同一種球假想排成面心立方
      }
    },
    {
      id: 'crystal-structures-h6', level: 8, hidden: true,
      riddle: { zh: '一顆完美的球，替一公斤重新下了定義。', en: 'A perfect sphere that redefined the kilogram.' },
      check: function (ev) { const d = ans(ev); return !!d && d.type === 'NA' && d.mat === 'Si' && d.ok && good(d, 0.001); }
    },
    {
      id: 'crystal-structures-h7', level: 9, hidden: true,
      riddle: { zh: '同樣是最密，它的樓層卻特別高。', en: 'As closely packed as any, yet its storeys are unusually tall.' },
      check: function (ev) { const d = ans(ev); return !!d && d.type === 'r' && d.mat === 'Zn' && d.ok && good(d, 0.005); }
    },
    {
      id: 'crystal-structures-h8', level: 5, hidden: true,
      riddle: { zh: '換個角度看，方塊裡藏著三層樓梯。', en: 'Look from another corner: a cube hides a three-step staircase.' },
      check: function (ev) { const d = cell(ev); return !!d && d.s === 'fcc' && d.layers && d.stackType === 'ccp' && d.stackN >= 6; }
    },
    {
      id: 'crystal-structures-h9', level: 4, hidden: true,
      riddle: { zh: '站在八個房間共用的角落，也被八個人圍住。', en: 'Standing in the corner shared by eight rooms, it too is surrounded by eight.' },
      check: function (ev) { const d = cell(ev); return !!d && d.s === 'cscl' && d.coord && d.selSp === 'a' && d.selCN === 8 && d.selIn === true; }
    },
    {
      id: 'crystal-structures-h10', level: 10, hidden: true,
      riddle: { zh: '八間不同的房子，你都秤過它們的重量。', en: 'Eight different houses, and you have weighed every one.' },
      check: function (ev) {
        const d = ans(ev);
        if (!d || !d.ok || !d.rhoStructs) return false;
        return ['sc', 'bcc', 'fcc', 'hcp', 'nacl', 'cscl', 'zns', 'diamond'].every(function (s) { return d.rhoStructs.indexOf(s) >= 0; });
      }
    }
  ]);
})();
