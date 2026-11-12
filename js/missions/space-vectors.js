/* missions/space-vectors.js — 空間向量的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/space-vectors.js 發出，都在使用者操作之後）：
 *   'vec'：向量、d、模式改變之後（滑桿、輸入數字、交換、反向、換模式、出題）。
 *          { mode（'inner' | 'cross' | 'volume' | 'plane'）, a, b, c, n, q（都是 [x, y, z]）, d,
 *            dot（a · b）, angle（夾角，度；有零向量時 null）, comp（b 在 a 上的投影長，a = 0 時 null）,
 *            cross（a × b）, area（|a × b|）, triple（a · (b × c)）, dist（Q 到平面的距離，n = 0 時 null）, sdist（有號距離）, chal（挑戰中） }
 *   'rotate'：轉動視角累積 30° 以上（2D 拖曳、方向鍵、3D 旋轉）。{ view: '2d' | '3d' }
 *   'challenge'：挑戰答對一題。{ kind, mode, target, time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const EPS = 1e-9;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const norm = function (v) { return Math.hypot(v[0], v[1], v[2]); };
  const nz = function (v) { return (Math.abs(v[0]) > EPS) + (Math.abs(v[1]) > EPS) + (Math.abs(v[2]) > EPS); };
  /** 長度開根號開不盡（分量最多打到小數第 2 位，所以 10000|v|² 是整數） */
  const irr = function (v) { const q = Math.round((v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) * 1e4), r = Math.round(Math.sqrt(q)); return r * r !== q; };
  const dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  const cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
  const par = function (a, b) { return norm(cross(a, b)) <= 1e-9 * Math.max(1, norm(a) * norm(b)); };
  const ab = function (d) { return d.mode === 'inner' || d.mode === 'cross'; };

  LabMission.register('space-vectors', [
    {
      id: 'space-vectors-1', level: 1,
      title: { zh: '換個角度看', en: 'Another point of view' },
      desc: { zh: '拖曳圖（或用方向鍵、3D 空間）把視角轉動 30° 以上，從不同方向看這些向量。', en: 'Drag the picture (or use the arrow keys, or the 3D view) to turn it by 30° or more and see the vectors from another side.' },
      check: function (ev) { return ev.type === 'rotate'; }
    },
    {
      id: 'space-vectors-2', level: 2,
      title: { zh: '互相垂直', en: 'Perpendicular' },
      desc: { zh: '在「內積與投影」模式讓 a · b = 0（兩個都不是零向量），而且至少一個向量不在坐標軸上。', en: 'In “Dot product” mode make a · b = 0 with neither vector zero, and at least one of them not along an axis.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'vec' && d.mode === 'inner' && !d.chal && norm(d.a) > EPS && norm(d.b) > EPS &&
          Math.abs(d.dot) <= 1e-9 && (nz(d.a) >= 2 || nz(d.b) >= 2);
      }
    },
    {
      id: 'space-vectors-3', level: 2,
      title: { zh: '六十度', en: 'Sixty degrees' },
      desc: { zh: '在「內積與投影」模式把 a、b 的夾角調成 60°（誤差 0.5° 以內）。', en: 'In “Dot product” mode make the angle between a and b equal to 60° (within 0.5°).' },
      check: function (ev) { const d = ev.data; return ev.type === 'vec' && d.mode === 'inner' && !d.chal && near(d.angle, 60, 0.5); }
    },
    {
      id: 'space-vectors-4', level: 3,
      title: { zh: '影子長 3', en: 'A shadow of length 3' },
      desc: { zh: '在「內積與投影」模式讓 b 在 a 上的投影長剛好是 3（誤差 0.01 以內），而且 b 不和 a 平行。', en: 'In “Dot product” mode make the scalar projection of b onto a exactly 3 (within 0.01), with b not parallel to a.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'vec' && d.mode === 'inner' && !d.chal && near(d.comp, 3, 0.01) && norm(d.b) > EPS && !par(d.a, d.b);
      }
    },
    {
      id: 'space-vectors-5', level: 4,
      title: { zh: '指向天頂', en: 'Pointing straight up' },
      desc: { zh: '在「外積與面積」模式讓 a × b = (0, 0, 6)，而且 a、b 都不在坐標軸上。', en: 'In “Cross product” mode make a × b = (0, 0, 6), with neither a nor b along an axis.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'vec' && d.mode === 'cross' && !d.chal && nz(d.a) >= 2 && nz(d.b) >= 2 &&
          near(d.cross[0], 0, 0.01) && near(d.cross[1], 0, 0.01) && near(d.cross[2], 6, 0.01);
      }
    },
    {
      id: 'space-vectors-6', level: 4,
      title: { zh: '歪的也有 10', en: 'Ten, even when slanted' },
      desc: { zh: '在「外積與面積」模式讓平行四邊形的面積是 10（誤差 0.02 以內），而且 a、b 不互相垂直（夾角離 90° 超過 1°）。', en: 'In “Cross product” mode make the parallelogram’s area 10 (within 0.02) while a and b are not perpendicular (the angle is more than 1° away from 90°).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'vec' && d.mode === 'cross' && !d.chal && near(d.area, 10, 0.02) && d.angle != null && Math.abs(d.angle - 90) > 1;
      }
    },
    {
      id: 'space-vectors-7', level: 5,
      title: { zh: '體積是 6 的盒子', en: 'A box of volume 6' },
      desc: { zh: '在「平行六面體」模式讓體積是 6（誤差 0.02 以內），而且 a、b、c 都不在坐標軸上。', en: 'In “Parallelepiped” mode make the volume 6 (within 0.02), with none of a, b, c along an axis.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'vec' && d.mode === 'volume' && !d.chal && near(Math.abs(d.triple), 6, 0.02) && nz(d.a) >= 2 && nz(d.b) >= 2 && nz(d.c) >= 2;
      }
    },
    {
      id: 'space-vectors-8', level: 5,
      title: { zh: '壓扁的盒子', en: 'A squashed box' },
      desc: { zh: '在「平行六面體」模式讓體積變成 0：三個向量都不是零向量，而且任兩個都不平行。', en: 'In “Parallelepiped” mode make the volume 0 with three nonzero vectors, no two of them parallel.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'vec' || d.mode !== 'volume' || d.chal) return false;
        if (norm(d.a) <= EPS || norm(d.b) <= EPS || norm(d.c) <= EPS) return false;
        if (par(d.a, d.b) || par(d.a, d.c) || par(d.b, d.c)) return false;
        return Math.abs(d.triple) <= 1e-9;
      }
    },
    {
      id: 'space-vectors-9', level: 6,
      title: { zh: '平面兩側各 3 步', en: 'Three steps on either side' },
      desc: { zh: '在「平面與距離」模式，同一個平面（n、d 不變）兩側各放一次 Q，距離都是 3（誤差 0.01 以內）；法向量 n 的三個分量都不是 0，而且長度 |n| 開根號開不盡（例如 (1, 1, 1) 的長度是 √3）。點數字可以打到小數第 2 位。', en: 'In “Planes” mode, keep one plane (same n and d) and put Q at distance 3 (within 0.01) once on each side of it; all three components of the normal n must be nonzero and |n| an irrational square root (e.g. (1, 1, 1) has length √3). Tap a number to type it to 2 decimal places.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'vec' || d.mode !== 'plane' || d.chal || nz(d.n) !== 3 || !irr(d.n) || !near(d.dist, 3, 0.01)) return false;
        const key = d.n.join(',') + '|' + d.d, side = d.sdist > 0 ? 'p' : 'm';
        if (mem.key !== key) { mem.key = key; mem.side = {}; }
        mem.side[side] = true;
        return !!(mem.side.p && mem.side.m);
      }
    },
    {
      id: 'space-vectors-10', level: 5,
      title: { zh: '落在平面上', en: 'Landing on the plane' },
      desc: { zh: '在「平面與距離」模式讓 Q 剛好在平面上：n 的三個分量和 d 都不是 0，Q 的三個坐標也都不是 0，而且 Q 不和 n 平行。', en: 'In “Planes” mode put Q exactly on the plane, with all three components of n, d and all three coordinates of Q nonzero, and Q not parallel to n.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'vec' && d.mode === 'plane' && !d.chal && nz(d.n) === 3 && Math.abs(d.d) > EPS && nz(d.q) === 3 &&
          !par(d.n, d.q) && d.sdist != null && Math.abs(d.sdist) <= 1e-9;
      }
    },
    {
      id: 'space-vectors-11', level: 4,
      title: { zh: '挑戰一題', en: 'One challenge' },
      desc: { zh: '按「出一題」，在任何一個模式答對一題挑戰。', en: 'Press “New challenge” and solve one challenge in any mode.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'space-vectors-12', level: 9,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰（中間不放棄、不換題），三題加起來不超過 60 秒。', en: 'Solve three challenges in a row (no giving up, no skipping) in 60 seconds or less in total.' },
      check: function (ev) { const d = ev.data; return ev.type === 'challenge' && d.streak >= 3 && d.last3 != null && d.last3 <= 60; }
    },
    {
      id: 'space-vectors-h1', level: 3, hidden: true,
      riddle: { zh: '背對背出發的兩個旅人，走得再遠也圍不出一塊地。', en: 'Two travellers who set off back to back can walk forever and never fence in a field.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'vec' && ab(d) && !d.chal && norm(d.a) > EPS && norm(d.b) > EPS && d.area <= 1e-9 && d.dot < 0;
      }
    },
    {
      id: 'space-vectors-h2', level: 7, hidden: true,
      riddle: { zh: '三根一樣長的柱子，兩兩站成直角，卻沒有一根靠著牆角。', en: 'Three pillars of equal length, each square to the others, and not one of them leans on a wall.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'vec' || d.mode !== 'volume' || d.chal) return false;
        const la = norm(d.a), lb = norm(d.b), lc = norm(d.c);
        if (la <= EPS || nz(d.a) < 2 || nz(d.b) < 2 || nz(d.c) < 2) return false;
        if (Math.abs(lb - la) > 1e-9 || Math.abs(lc - la) > 1e-9) return false;
        return Math.abs(dot(d.a, d.b)) <= 1e-9 && Math.abs(dot(d.a, d.c)) <= 1e-9 && Math.abs(dot(d.b, d.c)) <= 1e-9;
      }
    },
    {
      id: 'space-vectors-h3', level: 5, hidden: true,
      riddle: { zh: '一個量影子，一個量地盤，兩個人量出同一個數。', en: 'One measures the shadow, one measures the land, and both come up with the same number.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'vec' && ab(d) && !d.chal && d.dot > 0.1 && near(d.area, d.dot, 0.01);
      }
    }
  ]);
})();
