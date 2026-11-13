/* missions/law-of-cosines.js — 正弦定理、餘弦定理與解三角形的任務（星星數 = 等級 1–10；隱藏任務 × 2）
 * 事件（js/law-of-cosines.js 發出，都在使用者操作之後；挑戰中不發 'tri'）：
 *   'tri'：拖完頂點、點畫布、按鍵、放開滑桿、打完數字、切換模式、切換 SSA 的解之後。
 *          { src, mode（'free' | 'sss' | 'sas' | 'asa' | 'ssa'）, ok（圍得起來）, nSol（SSA 的解數；其他模式圍得起來是 1）, why（SSA：'short' | 'right' | 'two' | 'big'）,
 *            sel（SSA 顯示第幾個解）, ssaRight（SSA 各解是否有直角）, inp（滑桿的 a, b, c, A, B）,
 *            圍得起來時另有 a, b, c, A, B, C, area, perimeter, R, r, kind（'acute' | 'right' | 'obtuse'） }
 *   'guess'：挑戰送出答案。{ correct, streak, secs, last5（連續 5 題以上時最近 5 題的總秒數）, type }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const tri = function (ev) { return ev.type === 'tri' && ev.data.ok; };
  const isInt = function (v) { return Math.abs(v - Math.round(v)) < 1e-9; };
  const intSides = function (d) { return isInt(d.a) && isInt(d.b) && isInt(d.c); };
  const angs = function (d) { return [d.A, d.B, d.C]; };
  const near = function (u, v, t) { return Math.abs(u - v) <= t; };
  const PHI = (1 + Math.sqrt(5)) / 2;

  LabMission.register('law-of-cosines', [
    {
      id: 'law-of-cosines-1', level: 1,
      title: { zh: '拖出直角', en: 'Drag out a right angle' },
      desc: { zh: '在「拖曳」把頂點拖成一個直角三角形（某個角是 90°，誤差 0.2° 以內），看外心跑到哪裡。', en: 'In “Drag”, move the corners until one angle is 90° (to within 0.2°) and see where the circumcentre goes.' },
      check: function (ev) { return tri(ev) && ev.data.mode === 'free' && angs(ev.data).some(function (x) { return near(x, 90, 0.2); }); }
    },
    {
      id: 'law-of-cosines-2', level: 2,
      title: { zh: '很鈍的角', en: 'A very blunt angle' },
      desc: { zh: '做一個有 120° 以上鈍角的三角形，看外心跑到三角形外面。', en: 'Make a triangle with an angle of 120° or more and watch the circumcentre leave the triangle.' },
      check: function (ev) { return tri(ev) && Math.max(ev.data.A, ev.data.B, ev.data.C) >= 120; }
    },
    {
      id: 'law-of-cosines-3', level: 2,
      title: { zh: '三邊一樣長', en: 'All sides equal' },
      desc: { zh: '在「SSS」讓三邊一樣長，看三個角各是幾度。', en: 'In “SSS”, make the three sides equal and read the three angles.' },
      check: function (ev) { const d = ev.data; return tri(ev) && d.mode === 'sss' && near(d.a, d.b, 1e-9) && near(d.b, d.c, 1e-9); }
    },
    {
      id: 'law-of-cosines-4', level: 3,
      title: { zh: '圍不起來', en: 'It will not close' },
      desc: { zh: '在「SSS」給三條圍不成三角形的邊，看兩個圓為什麼碰不到。', en: 'In “SSS”, give three sides that cannot make a triangle and see why the two circles cannot meet.' },
      check: function (ev) { return ev.type === 'tri' && ev.data.mode === 'sss' && !ev.data.ok; }
    },
    {
      id: 'law-of-cosines-5', level: 3,
      title: { zh: '餘弦定理裡的畢氏定理', en: 'Pythagoras inside the law of cosines' },
      desc: { zh: '在「SAS」把夾角 A 設成 90°，兩邊 b、c 不一樣長（至少差 0.5）：−2bc cos A 消失了，剩下 a^2 = b^2 + c^2。', en: 'In “SAS”, set the angle A to 90° with b and c of different lengths (at least 0.5 apart): −2bc cos A disappears and a^2 = b^2 + c^2 is left.' },
      check: function (ev) { const d = ev.data; return tri(ev) && d.mode === 'sas' && near(d.inp.A, 90, 1e-9) && Math.abs(d.inp.b - d.inp.c) >= 0.5; }
    },
    {
      id: 'law-of-cosines-6', level: 4,
      title: { zh: '兩個答案', en: 'Two answers' },
      desc: { zh: '在「SSA」調出兩個解的情形，再用兩解時出現的切換按鈕，看另一個三角形。', en: 'In “SSA”, find a case with two solutions, then use the switch button that appears to see the other triangle.' },
      check: function (ev) { return ev.type === 'tri' && ev.data.mode === 'ssa' && ev.data.nSol === 2 && ev.data.src === 'ssaSel'; }
    },
    {
      id: 'law-of-cosines-7', level: 4,
      title: { zh: '剛好碰到', en: 'Just touching' },
      desc: { zh: '在「SSA」讓 a 剛好等於高 h = b sin A：圓和射線相切，只有一個解，而且是直角三角形。', en: 'In “SSA”, make a exactly equal to the height h = b sin A: the circle just touches the ray, giving one solution with a right angle.' },
      check: function (ev) { return ev.type === 'tri' && ev.data.mode === 'ssa' && ev.data.why === 'right'; }
    },
    {
      id: 'law-of-cosines-8', level: 5,
      title: { zh: '用最少的籬笆圍最大的地', en: 'Most land for the least fence' },
      desc: { zh: '做一個周長不超過 15、面積至少 10 的三角形。', en: 'Make a triangle with perimeter at most 15 and area at least 10.' },
      check: function (ev) { return tri(ev) && ev.data.perimeter <= 15 + 1e-9 && ev.data.area >= 10; }
    },
    {
      id: 'law-of-cosines-9', level: 5,
      title: { zh: '零、一、二', en: 'Zero, one, two' },
      desc: { zh: '在「SSA」角 A 和邊 b 都不動，只改 a，依序看過無解、一解、兩解三種情形（順序不拘）。', en: 'In “SSA”, keep the angle A and the side b fixed and change only a until you have seen no solution, one solution and two solutions (in any order).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'tri' || d.mode !== 'ssa') return false;
        const key = d.inp.A + '|' + d.inp.b;
        if (mem.key !== key) { mem.key = key; mem.seen = {}; }
        mem.seen[d.nSol] = true;
        return !!(mem.seen[0] && mem.seen[1] && mem.seen[2]);
      }
    },
    {
      id: 'law-of-cosines-10', level: 6,
      title: { zh: '整數的 120°', en: 'A whole-number 120°' },
      desc: { zh: '在「SSS」用三個整數邊做出一個剛好 120° 的角。', en: 'In “SSS”, use three whole-number sides to make an angle of exactly 120°.' },
      check: function (ev) { const d = ev.data; return tri(ev) && d.mode === 'sss' && intSides(d) && angs(d).some(function (x) { return near(x, 120, 1e-6); }); }
    },
    {
      id: 'law-of-cosines-11', level: 7,
      title: { zh: '解三角形三連勝', en: 'Three in a row' },
      desc: { zh: '挑戰「解三角形」連續答對 3 題。', en: 'Get 3 “Solve the triangle” problems right in a row.' },
      check: function (ev) { return ev.type === 'guess' && ev.data.correct && ev.data.streak >= 3; }
    },
    {
      id: 'law-of-cosines-12', level: 9,
      title: { zh: '測量員', en: 'The surveyor' },
      desc: { zh: '挑戰「解三角形」連續答對 5 題，而且這 5 題合計不超過 300 秒。', en: 'Get 5 “Solve the triangle” problems right in a row, taking no more than 300 seconds for the five.' },
      check: function (ev) { return ev.type === 'guess' && ev.data.correct && ev.data.streak >= 5 && ev.data.last5 <= 300; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'law-of-cosines-h1', level: 3, hidden: true,
      riddle: { zh: '一條打了十二個結的繩子，拉成三段，就拉出一個端端正正的角。', en: 'A rope with twelve knots, pulled into three stretches, pulls out a perfectly square corner.' },
      check: function (ev) { const d = ev.data; return tri(ev) && d.mode === 'sss' && intSides(d) && [d.a, d.b, d.c].map(Math.round).sort(function (x, y) { return x - y; }).join(',') === '3,4,5'; }
    },
    {
      id: 'law-of-cosines-h2', level: 4, hidden: true,
      riddle: { zh: '把一張正方形的紙沿對角線對折，你手上拿著的是誰？', en: 'Fold a square sheet of paper along its diagonal: what are you holding?' },
      check: function (ev) { const d = ev.data; return tri(ev) && d.mode === 'sas' && near(d.inp.A, 90, 1e-9) && near(d.inp.b, d.inp.c, 1e-9); }
    },
    {
      id: 'law-of-cosines-h3', level: 5, hidden: true,
      riddle: { zh: '五角星的一個尖角：兩條長腿和底邊的比，是黃金。', en: 'One point of a five-pointed star: its long legs and its base stand in the golden ratio.' },
      check: function (ev) {
        const d = ev.data;
        if (!tri(ev)) return false;
        // 兩腿等長，夾的頂角 36°
        return [['b', 'c', 'A'], ['c', 'a', 'B'], ['a', 'b', 'C']].some(function (k) { return near(d[k[0]], d[k[1]], 1e-3 * d[k[0]]) && near(d[k[2]], 36, 0.3); });
      }
    },
    {
      id: 'law-of-cosines-h4', level: 6, hidden: true,
      riddle: { zh: '沒有直角，三條邊都是整數，圍出來的地也剛好是整數。', en: 'No right angle, three whole-number sides, and the land they enclose is a whole number too.' },
      check: function (ev) { const d = ev.data; return tri(ev) && d.mode === 'sss' && intSides(d) && Math.abs(d.area - Math.round(d.area)) < 1e-6 && !angs(d).some(function (x) { return near(x, 90, 1e-6); }); }
    },
    {
      id: 'law-of-cosines-h5', level: 6, hidden: true,
      riddle: { zh: '在一張只認得格子的紙上，親手畫出三個一樣大的角。', en: 'On paper that only knows its squares, draw three equal angles by hand.' },
      check: function (ev) { const d = ev.data; return tri(ev) && d.mode === 'free' && angs(d).every(function (x) { return near(x, 60, 0.5); }); }
    },
    {
      id: 'law-of-cosines-h6', level: 7, hidden: true,
      riddle: { zh: '三邊都是整數、彼此不等長，卻偷偷藏著正三角形的一個角。', en: 'Three whole-number sides, all different, secretly hiding a corner of an equilateral triangle.' },
      check: function (ev) {
        const d = ev.data;
        return tri(ev) && d.mode === 'sss' && intSides(d) && d.a !== d.b && d.b !== d.c && d.c !== d.a && angs(d).some(function (x) { return near(x, 60, 1e-6); });
      }
    },
    {
      id: 'law-of-cosines-h7', level: 7, hidden: true,
      riddle: { zh: '整數的三條邊，讓某一個角恰好長成另一個角的兩倍。', en: 'Whole-number sides that make one angle grow to exactly twice another.' },
      check: function (ev) {
        const d = ev.data, g = angs(d);
        if (!tri(ev) || d.mode !== 'sss' || !intSides(d)) return false;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j && near(g[i], 2 * g[j], 1e-6)) return true;
        return false;
      }
    },
    {
      id: 'law-of-cosines-h8', level: 8, hidden: true,
      riddle: { zh: '同一組條件給出兩個答案，其中一個端端正正地帶著直角。', en: 'One set of facts, two answers — and one of them stands squarely on a right angle.' },
      check: function (ev) { const d = ev.data; return ev.type === 'tri' && d.mode === 'ssa' && d.nSol === 2 && !!d.ssaRight && d.ssaRight.some(Boolean); }
    },
    {
      id: 'law-of-cosines-h9', level: 9, hidden: true,
      riddle: { zh: '一個直角，三邊排成等比數列；那個公比的平方，是黃金。', en: 'A right angle, and the sides in geometric progression; the square of the ratio is golden.' },
      check: function (ev) {
        const d = ev.data;
        if (!tri(ev)) return false;
        const s = [d.a, d.b, d.c].sort(function (x, y) { return x - y; });
        return near(s[1] / s[0], Math.sqrt(PHI), 0.002) && near(s[2] / s[1], Math.sqrt(PHI), 0.002) && angs(d).some(function (x) { return near(x, 90, 0.3); });
      }
    },
    {
      id: 'law-of-cosines-h10', level: 10, hidden: true,
      riddle: { zh: '一個角、它的兩倍、再兩倍，剛好湊成一個三角形——那是七邊形留下的影子。', en: 'An angle, twice it, and twice that again make up a triangle exactly — a shadow left by the heptagon.' },
      check: function (ev) {
        const d = ev.data;
        if (!tri(ev)) return false;
        const g = angs(d).sort(function (x, y) { return x - y; });
        return near(g[0], 180 / 7, 0.3) && near(g[1], 360 / 7, 0.3) && near(g[2], 720 / 7, 0.3);
      }
    }
  ]);
})();
