/* missions/molecular-shapes.js — 分子的形狀（VSEPR）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/molecular-shapes.js 只在使用者操作之後回報）：
  //   'settle'：使用者的操作（快速選單、自己組合、拖動、搖一搖、改排斥強度）之後，電子域穩定下來的時候
  //     { cause（preset、build、drag、shake、lam）, custom（組成是用「自己組合」改出來的）, preset（快速選單代號或 null）,
  //       center, ligs（鍵結原子，已排序）, lp, m, n, N, key（組成的比較鍵）, formula（純文字化學式）,
  //       shape, egeom, axe（AXmEn）, std（'m,n'）, isGlobal（能量最低的排列）, E, Eg,
  //       angles（所有鍵角，度，由小到大）, polar, dip（淨偶極大小）, charge, valid（八隅體與電荷 |q| ≤ 1）,
  //       lam, lamDefault（排斥強度是預設值）, dragAngle（拖動的角度，度）, fromLocal（搖一搖之前停在局部最低點）, lpAxial }
  //   'measure'：選好兩個鍵、而且分子已經穩定時（或選好之後穩定下來時）
  //     { angle（度）, ligA, ligB, center, ligs, lp, m, n, axe, key, isGlobal, lam, lamDefault, preset, custom,
  //       lpAxial（5 個電子域時，在軸向的孤對電子數） }
  //   'view'：使用者轉完視角（2D 拖曳或 3D 旋轉）{ along（視線和最接近的鍵的夾角，度）, settled, m }
  const E = 1e-9;
  const isS = function (ev) { return ev.type === 'settle' && ev.data; };
  const isM = function (ev) { return ev.type === 'measure' && ev.data; };
  const sameLigs = function (d, center, ligs, lp) {
    return d.center === center && d.lp === lp && d.ligs.length === ligs.length && d.ligs.every(function (x, i) { return x === ligs[i]; });
  };
  const ok = function (d) { return d.isGlobal && d.valid; };
  /** 兩組鍵結原子（已排序）是否剛好只差一個 */
  function oneSwap(a, b) {
    if (a.length !== b.length) return false;
    const c = {};
    a.forEach(function (x) { c[x] = (c[x] || 0) + 1; });
    b.forEach(function (x) { c[x] = (c[x] || 0) - 1; });
    let plus = 0, minus = 0;
    Object.keys(c).forEach(function (k) { if (c[k] > 0) plus += c[k]; else minus -= c[k]; });
    return plus === 1 && minus === 1;
  }

  LabMission.register('molecular-shapes', [
    {
      id: 'molecular-shapes-1', level: 1,
      title: { zh: '推開又回來', en: 'Pushed away, pushed back' },
      desc: { zh: '拖動任一個電子域（原子或孤對電子），離開原位至少 30°，放手後讓電子域重新穩定在能量最低的排列。', en: 'Drag any electron domain (an atom or a lone pair) at least 30° out of place, let go, and let the domains settle into the lowest-energy arrangement again.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.cause === 'drag' && d.dragAngle >= 30 - E && d.isGlobal; }
    },
    {
      id: 'molecular-shapes-2', level: 2,
      title: { zh: '甲烷的鍵角', en: 'The angle in methane' },
      desc: { zh: '選甲烷 CH4，在「量鍵角」選兩個 C–H 鍵（或在畫面上點兩個 H），量出它們的夾角。', en: 'Choose methane, CH4, and use “Measure a bond angle” to pick two C–H bonds (or tap two H atoms in the picture) and measure the angle between them.' },
      check: function (ev) { const d = ev.data; return isM(ev) && sameLigs(d, 'C', ['H', 'H', 'H', 'H'], 0) && d.isGlobal && Math.abs(d.angle - 109.47) < 0.2; }
    },
    {
      id: 'molecular-shapes-3', level: 3,
      title: { zh: '自己組一個氨', en: 'Build ammonia yourself' },
      desc: { zh: '不用常見分子的按鈕，用「自己組合」做出氨 NH3：中心原子 N、三個 H、一對孤對電子，等它穩定在能量最低的排列。', en: 'Without the common-molecule buttons, use “Build your own” to make ammonia, NH3: N in the centre, three H and one lone pair, and let it settle into the lowest-energy arrangement.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.custom && sameLigs(d, 'N', ['H', 'H', 'H'], 1) && d.isGlobal; }
    },
    {
      id: 'molecular-shapes-4', level: 4,
      title: { zh: '孤對電子的排擠', en: 'Squeezed by lone pairs' },
      desc: { zh: '孤對電子的排斥強度維持預設值，分別量出 CH4、NH3、H2O 的鍵角（三個都要量）。', en: 'With the lone-pair repulsion strength at its default, measure a bond angle in CH4, in NH3 and in H2O (all three).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isM(ev) || !d.isGlobal || !d.lamDefault) return false;
        if (sameLigs(d, 'C', ['H', 'H', 'H', 'H'], 0)) mem.c = d.angle;
        if (sameLigs(d, 'N', ['H', 'H', 'H'], 1)) mem.n = d.angle;
        if (sameLigs(d, 'O', ['H', 'H'], 2)) mem.o = d.angle;
        return mem.c != null && mem.n != null && mem.o != null && mem.c > mem.n && mem.n > mem.o;
      }
    },
    {
      id: 'molecular-shapes-5', level: 5,
      title: { zh: '三種非極性分子', en: 'Three non-polar molecules' },
      desc: { zh: '用「自己組合」做出三種不同的非極性分子（電中性），每一種都要穩定在能量最低的排列。', en: 'Use “Build your own” to make three different non-polar molecules (with no charge), each settled in its lowest-energy arrangement.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isS(ev) || !d.custom || !ok(d) || d.charge !== 0 || d.polar || d.m < 2) return false;
        mem.k = mem.k || {};
        mem.k[d.key] = true;
        return Object.keys(mem.k).length >= 3;
      }
    },
    {
      id: 'molecular-shapes-6', level: 5,
      title: { zh: '被擠窄的赤道', en: 'A squeezed equator' },
      desc: { zh: '在蹺蹺板形的分子（例如 SF4）穩定在能量最低的排列時，量出赤道上兩個鍵的夾角：三角雙錐的赤道本來是 120°，看孤對電子把它擠到 120° 以下。', en: 'In a seesaw molecule (such as SF4) settled in its lowest-energy arrangement, measure the angle between the two equatorial bonds: on the equator of a trigonal bipyramid it would be 120°, but the lone pair squeezes it below 120°.' },
      check: function (ev) { const d = ev.data; return isM(ev) && d.axe === 'AX4E' && d.isGlobal && d.lpAxial === 0 && d.angle > 100 && d.angle < 119.5; }
    },
    {
      id: 'molecular-shapes-7', level: 6,
      title: { zh: '自己組出平面四方形', en: 'Build a square plane' },
      desc: { zh: '用「自己組合」做出一個平面四方形的分子或離子（AX4E2），穩定在能量最低的排列。', en: 'Use “Build your own” to make a square-planar molecule or ion (AX4E2), settled in its lowest-energy arrangement.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.custom && d.m === 4 && d.n === 2 && ok(d); }
    },
    {
      id: 'molecular-shapes-8', level: 7,
      title: { zh: '換一個原子，極性就出現', en: 'One atom changes everything' },
      desc: { zh: '先讓一個非極性分子穩定下來，再只換掉一個鍵結原子（移除一個、加上另一種），讓它變成極性分子。', en: 'Start with a non-polar molecule that has settled, then swap just one bonded atom (remove one, add a different element) so that it becomes polar.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isS(ev) || !ok(d)) return false;
        mem.np = mem.np || [];
        if (!d.polar && d.m >= 2) {
          mem.np.push({ center: d.center, lp: d.lp, ligs: d.ligs.slice() });
          if (mem.np.length > 12) mem.np.shift();
          return false;
        }
        return d.polar && d.custom && mem.np.some(function (s) { return s.center === d.center && s.lp === d.lp && oneSwap(s.ligs, d.ligs); });
      }
    },
    {
      id: 'molecular-shapes-9', level: 7,
      title: { zh: '赤道上的孤對電子', en: 'Lone pairs on the equator' },
      desc: { zh: '在三角雙錐的電子對幾何中（5 個電子域、有孤對電子，例如 SF4），把孤對電子拖到一個軸向原子的位置上放手（兩個會交換位置），讓它卡在局部最低點，再按「搖一搖（退火）」讓它回到能量最低的排列。', en: 'In a trigonal-bipyramidal arrangement (5 domains with a lone pair, such as SF4), drag a lone pair onto the place of an axial atom and let go (the two swap places) so that it sticks in a local minimum, then press “Shake (anneal)” to let it reach the lowest-energy arrangement.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.cause === 'shake' && d.N === 5 && d.n >= 1 && d.fromLocal && d.isGlobal; }
    },
    {
      id: 'molecular-shapes-10', level: 8,
      title: { zh: '調出水的實驗值', en: 'Tune to the real water' },
      desc: { zh: '調整「孤對電子的排斥強度」，讓水分子 H2O 的鍵角剛好是實驗值 104.5°（誤差 0.05° 以內）。', en: 'Adjust the “Lone-pair repulsion strength” until the bond angle of water, H2O, is exactly the measured 104.5° (within 0.05°).' },
      check: function (ev) {
        const d = ev.data;
        return isS(ev) && !d.lamDefault && sameLigs(d, 'O', ['H', 'H'], 2) && d.isGlobal && d.angles.length === 1 && Math.abs(d.angles[0] - 104.5) <= 0.05 + E;
      }
    },
    {
      id: 'molecular-shapes-11', level: 9,
      title: { zh: '不同的原子，照樣抵消', en: 'Different atoms, still cancelled' },
      desc: { zh: '用「自己組合」做出一個有兩種不同鍵結原子、卻是非極性的分子（電中性、穩定在能量最低的排列）。提示：讓相同的原子站在對稱的位置；把一個原子拖到另一個原子的位置上放手，兩個會交換位置。', en: 'Use “Build your own” to make a molecule with two different kinds of bonded atom that is still non-polar (no charge, settled in its lowest-energy arrangement). Hint: put identical atoms in symmetric positions; drop one atom on another atom’s place and the two swap places.' },
      check: function (ev) {
        const d = ev.data;
        if (!isS(ev) || !d.custom || !ok(d) || d.charge !== 0 || d.polar) return false;
        const kinds = {};
        d.ligs.forEach(function (x) { kinds[x] = true; });
        return Object.keys(kinds).length >= 2;
      }
    },
    {
      id: 'molecular-shapes-12', level: 10,
      title: { zh: 'VSEPR 全收集', en: 'Collect every VSEPR shape' },
      desc: { zh: '用「自己組合」做出課本上全部 13 種 AXmEn 組合（AX2 到 AX4E2）的分子或離子，每一種都要穩定在能量最低的排列。', en: 'Use “Build your own” to make a molecule or ion for all 13 textbook AXmEn types (AX2 to AX4E2), each settled in its lowest-energy arrangement.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isS(ev) || !d.custom || !ok(d)) return false;
        const STD = ['2,0', '3,0', '2,1', '4,0', '3,1', '2,2', '5,0', '4,1', '3,2', '2,3', '6,0', '5,1', '4,2'];
        if (STD.indexOf(d.std) < 0) return false;
        mem.s = mem.s || {};
        mem.s[d.std] = true;
        return STD.every(function (k) { return mem.s[k]; });
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'molecular-shapes-h1', level: 3, hidden: true,
      riddle: { zh: '心裡藏著幾句話，臉上仍然不偏不倚。', en: 'It keeps a few words to itself, yet leans to no side.' },
      check: function (ev) { const d = ev.data; return isS(ev) && d.custom && ok(d) && d.charge === 0 && d.n >= 1 && d.m >= 2 && !d.polar; }
    },
    {
      id: 'molecular-shapes-h2', level: 2, hidden: true,
      riddle: { zh: '站在它的延長線上，最長的也看不見。', en: 'Stand on its extension, and even the longest one vanishes.' },
      check: function (ev) { const d = ev.data; return ev.type === 'view' && d && d.settled && d.m >= 2 && d.along <= 5; }  // 試玩：2° 用滑鼠太難、鍵盤一步 5°，放寬到 5°（和三角函數 h3 相近）
    },
    {
      id: 'molecular-shapes-h3', level: 4, hidden: true,
      riddle: { zh: '得一個或失一個，它照樣站得端正。', en: 'Gain one or lose one, and it still stands up straight.' },
      // 帶電的離子、中心原子有孤對電子，形狀仍然對稱（非極性），例如 ClF2−、BrF4−
      check: function (ev) { const d = ev.data; return isS(ev) && d.custom && ok(d) && d.charge !== 0 && d.n >= 1 && d.m >= 2 && !d.polar; }
    },
    {
      id: 'molecular-shapes-h4', level: 3, hidden: true,
      riddle: { zh: '六個人圍成一圈，總有兩個背對著背。', en: 'Six stand around, and two of them are always back to back.' },
      // 八面體（AX6）量到兩個相對的鍵：180°
      check: function (ev) { const d = ev.data; return isM(ev) && d.m === 6 && d.n === 0 && d.isGlobal && d.angle >= 179.5; }
    },
    {
      id: 'molecular-shapes-h5', level: 7, hidden: true,
      riddle: { zh: '沉默的兩位不再霸道，大家終於一樣寬。', en: 'The two silent ones stop pushing, and everyone gets the same room.' },
      // 把孤對電子的排斥強度調小，讓水的鍵角回到正四面體角 109.47°（0.15° 以內）
      check: function (ev) {
        const d = ev.data;
        return isS(ev) && !d.lamDefault && sameLigs(d, 'O', ['H', 'H'], 2) && d.isGlobal && d.angles.length === 1 && Math.abs(d.angles[0] - 109.47) <= 0.15;
      }
    },
    {
      id: 'molecular-shapes-h6', level: 8, hidden: true,
      riddle: { zh: '同樣是方方正正，換個座位就有了脾氣。', en: 'Just as square as before, but change the seats and it shows a temper.' },
      // 自己組合的平面四方形（AX4E2）、電中性，卻是極性分子：兩種原子各自相鄰（順式）
      check: function (ev) { const d = ev.data; return isS(ev) && d.custom && ok(d) && d.m === 4 && d.n === 2 && d.charge === 0 && d.polar; }
    },
    {
      id: 'molecular-shapes-h7', level: 6, hidden: true,
      riddle: { zh: '兩個沉默的人，終於坐到了彼此的對面。', en: 'Two silent ones finally sit across from each other.' },
      // 八面體的兩對孤對電子卡在相鄰（局部最低點），搖一搖後回到相對位置（平面四方形）
      check: function (ev) { const d = ev.data; return isS(ev) && d.cause === 'shake' && d.N === 6 && d.n === 2 && d.fromLocal && d.isGlobal; }
    },
    {
      id: 'molecular-shapes-h8', level: 5, hidden: true,
      riddle: { zh: '一個胖子坐下，兩旁的人只好擠一擠。', en: 'One stout one sits down, and the two beside it have to squeeze up.' },
      // 自己組合的平面三角形（AX3）有一個雙鍵 O：另外兩個單鍵的夾角被擠到 119° 以下
      check: function (ev) {
        const d = ev.data;
        if (!isS(ev) || !d.custom || !ok(d) || d.m !== 3 || d.n !== 0) return false;
        const o = d.ligs.filter(function (x) { return x === 'O'; }).length;
        return o === 1 && d.angles[0] < 119;
      }
    },
    {
      id: 'molecular-shapes-h9', level: 10, hidden: true,
      riddle: { zh: '三家人坐成一圈，誰也不偏向誰。', en: 'Three families around one table, and no one leans to any side.' },
      // 自己組合、電中性、有三種不同的鍵結原子，卻是非極性分子
      check: function (ev) {
        const d = ev.data;
        if (!isS(ev) || !d.custom || !ok(d) || d.charge !== 0 || d.polar) return false;
        const kinds = {};
        d.ligs.forEach(function (x) { kinds[x] = true; });
        return Object.keys(kinds).length >= 3;
      }
    },
    {
      id: 'molecular-shapes-h10', level: 9, hidden: true,
      riddle: { zh: '三個沉默的人圍著腰，兩個說話的才站成一直線。', en: 'Three silent ones circle the waist, and only then do the two speakers line up straight.' },
      // 電中性的 AX2E3（例如 XeF2）：孤對電子卡在軸向（局部最低點），搖一搖後三對孤對電子都到赤道、兩個鍵成一直線
      check: function (ev) { const d = ev.data; return isS(ev) && d.cause === 'shake' && d.m === 2 && d.n === 3 && d.charge === 0 && d.fromLocal && d.isGlobal; }
    }
  ]);
})();
