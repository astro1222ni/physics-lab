/* missions/linear-transform.js — 矩陣與線性變換的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/linear-transform.js 發出，都在使用者操作之後）：
 *   'm2'：平面（2×2）模式的設定改變。{ M（[[a, b], [c, d]]）, det, tr, kind（'distinct' | 'repeated' | 'scalar' | 'complex'）,
 *         x（探針向量）, y（A x）, nx、ny（兩者的長度）, lambda（x·Ax / |x|²）, sin（x 和 Ax 夾角的正弦，同向反向都算平行）, chal（挑戰中） }
 *   'm3'：空間（3×3）模式的設定改變。{ M（3×3）, det, rank }
 *   'drag'：在圖上拖曳放開。{ what（'i' | 'j' | 'x'） }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const m2 = function (ev) { return ev.type === 'm2' && !ev.data.chal; };
  const offDiag = function (M) { return Math.abs(M[0][1]) > 0.005 || Math.abs(M[1][0]) > 0.005; };
  const SIN1 = Math.sin(Math.PI / 180);   // 1°
  /** 探針是特徵向量：x 夠長、不在坐標軸上，x 和 Ax 平行（1° 以內）、Ax 不是 0 */
  const eigenProbe = function (d) {
    return d.nx >= 0.5 && Math.abs(d.x[0]) >= 0.1 && Math.abs(d.x[1]) >= 0.1 && d.ny >= 0.1 && d.sin != null && d.sin <= SIN1;
  };
  const near2 = function (A, B, tol) { return A.every(function (r, i) { return r.every(function (x, j) { return Math.abs(x - B[i][j]) <= tol; }); }); };
  const col = function (M, j) { return [M[0][j], M[1][j], M[2][j]]; };
  const cross = function (u, v) { return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; };
  const len = function (u) { return Math.hypot(u[0], u[1], u[2]); };

  LabMission.register('linear-transform', [
    {
      id: 'linear-transform-1', level: 1,
      title: { zh: '拉動基底', en: 'Pull a basis vector' },
      desc: { zh: '在平面模式，拖曳紅色 i 或綠色 j 箭頭的尖端，看整張方格紙跟著變形。', en: 'In plane mode, drag the tip of the red i or green j arrow and watch the whole grid deform.' },
      check: function (ev) { return ev.type === 'drag' && (ev.data.what === 'i' || ev.data.what === 'j'); }
    },
    {
      id: 'linear-transform-2', level: 2,
      title: { zh: '把紙翻面', en: 'Flip the paper over' },
      desc: { zh: '讓 2×2 矩陣的行列式變成負的（小旗子變成鏡中的樣子），而且 b、c 不全是 0。', en: 'Make the determinant of the 2×2 matrix negative (the little flag turns into its mirror image), with b and c not both 0.' },
      check: function (ev) { const d = ev.data; return m2(ev) && d.det < -0.01 && offDiag(d.M); }
    },
    {
      id: 'linear-transform-3', level: 3,
      title: { zh: '面積變三倍', en: 'Three times the area' },
      desc: { zh: '讓單位正方形變成面積 3 的平行四邊形（|det| = 3，誤差 0.01 以內），而且 b、c 不全是 0。', en: 'Turn the unit square into a parallelogram of area 3 (|det| = 3 within 0.01), with b and c not both 0.' },
      check: function (ev) { const d = ev.data; return m2(ev) && near(Math.abs(d.det), 3, 0.01) && offDiag(d.M); }
    },
    {
      id: 'linear-transform-4', level: 3,
      title: { zh: '壓成一條線', en: 'Squash it into a line' },
      desc: { zh: '讓行列式剛好是 0、整張紙壓成一條直線，而且 a、b、c、d 四個數都不是 0。', en: 'Make the determinant exactly 0 so the whole plane collapses onto a line, with all four entries a, b, c, d nonzero.' },
      check: function (ev) {
        const d = ev.data, M = d.M;
        return m2(ev) && Math.abs(d.det) <= 1e-6 && M[0].concat(M[1]).every(function (x) { return Math.abs(x) >= 0.05; });
      }
    },
    {
      id: 'linear-transform-5', level: 3,
      title: { zh: '轉 90 度', en: 'A quarter turn' },
      desc: { zh: '做出把整個平面旋轉 90°（順時針或逆時針都可以）的矩陣：形狀、大小都不變。', en: 'Build the matrix that turns the whole plane through 90° (either way) without changing any shape or size.' },
      check: function (ev) { const M = ev.data.M; return m2(ev) && (near2(M, [[0, -1], [1, 0]], 0.005) || near2(M, [[0, 1], [-1, 0]], 0.005)); }
    },
    {
      id: 'linear-transform-6', level: 4,
      title: { zh: '找到特徵向量', en: 'Find an eigenvector' },
      desc: { zh: '矩陣有兩個不同的實數特徵值、b、c 不全是 0 時，把紫色探針 x 拖到 A x 和它在同一條直線上（1° 以內）；x 不可以在坐標軸上。', en: 'With a matrix that has two different real eigenvalues (b and c not both 0), drag the purple probe x until Ax lies on the same line (within 1°); x must not be on an axis.' },
      check: function (ev) { const d = ev.data; return m2(ev) && d.kind === 'distinct' && offDiag(d.M) && eigenProbe(d); }
    },
    {
      id: 'linear-transform-7', level: 5,
      title: { zh: '特徵值 −1', en: 'Eigenvalue −1' },
      desc: { zh: '找一個 b、c 不全是 0 的矩陣，和一個方向 x，讓 A x = −x（λ 在 −1.02 到 −0.98 之間）。', en: 'Find a matrix with b and c not both 0 and a direction x with Ax = −x (λ between −1.02 and −0.98).' },
      check: function (ev) { const d = ev.data; return m2(ev) && offDiag(d.M) && eigenProbe(d) && near(d.lambda, -1, 0.02); }
    },
    {
      id: 'linear-transform-8', level: 6,
      title: { zh: '斜的剪切', en: 'A slanted shear' },
      desc: { zh: '做出面積不變（det = 1）、只有一個特徵值 1（tr = 2）、但不是單位矩陣的變換，而且 b、c 都不是 0（誤差 0.005 以內）。', en: 'Build a transformation that keeps area (det = 1) and has the single eigenvalue 1 (tr = 2) but is not the identity, with b and c both nonzero (within 0.005).' },
      check: function (ev) {
        const d = ev.data, M = d.M;
        return m2(ev) && near(d.det, 1, 0.005) && near(d.tr, 2, 0.005) && Math.abs(M[0][1]) > 0.005 && Math.abs(M[1][0]) > 0.005;
      }
    },
    {
      id: 'linear-transform-9', level: 5,
      title: { zh: '體積 6', en: 'Volume 6' },
      desc: { zh: '在空間模式，讓單位立方體變成體積 6 的平行六面體（|det| = 6，誤差 0.01 以內）；矩陣不可以是三角矩陣（對角線上方和下方都要有不是 0 的數）。', en: 'In space mode, turn the unit cube into a parallelepiped of volume 6 (|det| = 6 within 0.01); the matrix must not be triangular (nonzero entries both above and below the diagonal).' },
      check: function (ev) {
        const M = ev.data.M;
        if (ev.type !== 'm3' || !near(Math.abs(ev.data.det), 6, 0.01)) return false;
        const up = Math.abs(M[0][1]) > 0.005 || Math.abs(M[0][2]) > 0.005 || Math.abs(M[1][2]) > 0.005;
        const lo = Math.abs(M[1][0]) > 0.005 || Math.abs(M[2][0]) > 0.005 || Math.abs(M[2][1]) > 0.005;
        return up && lo;
      }
    },
    {
      id: 'linear-transform-10', level: 6,
      title: { zh: '立方體壓成一片', en: 'Flatten the cube' },
      desc: { zh: '在空間模式，讓立方體壓扁成一個斜的平面（秩 2）：三個行向量都不是 0、任兩個都不平行，但三個在同一個平面上；這個平面不可以是坐標平面（每一列都要有不是 0 的數）。', en: 'In space mode, flatten the cube into a slanted plane (rank 2): no column is zero and no two columns are parallel, yet all three lie in one plane, and that plane is not a coordinate plane (every row has a nonzero entry).' },
      check: function (ev) {
        const M = ev.data.M;
        if (ev.type !== 'm3' || ev.data.rank !== 2) return false;
        const c = [col(M, 0), col(M, 1), col(M, 2)];
        if (c.some(function (v) { return len(v) < 0.1; })) return false;
        if (M.some(function (r) { return Math.max(Math.abs(r[0]), Math.abs(r[1]), Math.abs(r[2])) < 0.1; })) return false;
        return [[0, 1], [0, 2], [1, 2]].every(function (p) { return len(cross(c[p[0]], c[p[1]])) > 0.01 * len(c[p[0]]) * len(c[p[1]]); });
      }
    },
    {
      id: 'linear-transform-11', level: 4,
      title: { zh: '照著影子變形', en: 'Match the shadow' },
      desc: { zh: '按「出一題」，看虛線畫的目標圖形，調出同一個矩陣。', en: 'Press “New challenge”, look at the dashed target shape and set the same matrix.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'linear-transform-12', level: 7,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰，三題合計 90 秒以內。', en: 'Solve three challenges in a row, in 90 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 90; }
    },
    {
      id: 'linear-transform-h1', level: 4, hidden: true,
      riddle: { zh: '做一次還看得見，做兩次什麼都不剩。', en: 'Do it once and something is left; do it twice and nothing is.' },
      check: function (ev) {
        const d = ev.data;
        if (!m2(ev)) return false;
        const M = d.M, mx = Math.max(Math.abs(M[0][0]), Math.abs(M[0][1]), Math.abs(M[1][0]), Math.abs(M[1][1]));
        return mx >= 0.5 && Math.abs(d.tr) <= 1e-9 && Math.abs(d.det) <= 1e-9;
      }
    },
    {
      id: 'linear-transform-h2', level: 5, hidden: true,
      riddle: { zh: '一對兔子的帳本，翻到最後只剩一個比例。', en: 'A ledger of rabbit pairs; on its last page only one ratio is left.' },
      check: function (ev) {
        const d = ev.data;
        if (!m2(ev)) return false;
        const fib = near2(d.M, [[1, 1], [1, 0]], 0.005) || near2(d.M, [[0, 1], [1, 1]], 0.005);
        return fib && d.nx >= 0.5 && d.sin != null && d.sin <= SIN1 && near(d.lambda, (1 + Math.sqrt(5)) / 2, 0.01);
      }
    }
  ]);
})();
