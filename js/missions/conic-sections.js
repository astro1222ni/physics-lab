/* missions/conic-sections.js — 圓錐曲線的任務（星星數 = 等級 1–10）
 * 事件（js/conic-sections.js 發出）：
 *   'params'：切法改變後（放開滑桿、打完數字、在畫布上拖完切平面、按鍵、按快速切法）。
 *              { src: 'slider'|'drag'|'key'|'preset', prevType, alpha, beta, d, type, family, e, a, b, c, p, latus, slope, phi, r1, r2, h }
 *   'probe'：移動點 P 之後（拖曳、點選、按鍵）。上面的量再加 { x, y, PF1, PF2, PD1, PD2, sum, diff, ratio1, ratio2 }
 *   'mark'：按「記下這一點」。上面的量再加 { n, rows: [{ x, y, PF1, PF2, sum, diff, ratio }] }（切法一改變，記下的點就清空）
 *   'rotate3d'：在 3D 檢視拖曳轉動了視角。
 * 靜態設定的任務都排除「快速切法」按鈕（src = 'preset'），一定要自己調出來。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const P = function (ev) { return ev.type === 'params' && ev.data.src !== 'preset'; };
  /** 切口類型「變成」某一種（從別的類型調過來） */
  const becomes = function (ev, type) { return P(ev) && ev.data.type === type && ev.data.prevType !== type; };
  const near = function (v, want, tol) { return isFinite(v) && Math.abs(v - want) <= tol; };

  LabMission.register('conic-sections', [
    {
      id: 'conic-sections-1', level: 1,
      title: { zh: '切出一個圓', en: 'Cut a circle' },
      desc: { zh: '轉動切平面，讓切口變成一個正圓。切平面要怎麼擺？', en: 'Tilt the cutting plane until the cut becomes a perfect circle. How must the plane sit?' },
      check: function (ev) { return becomes(ev, 'circle'); }
    },
    {
      id: 'conic-sections-2', level: 1,
      title: { zh: '換個角度看', en: 'See it from another side' },
      desc: { zh: '打開「3D 立體」檢視，拖曳轉動視角，從不同方向看圓錐、切平面和兩顆丹德林球。', en: 'Open the 3D view and drag to turn it: look at the cone, the cutting plane and the two Dandelin spheres from another direction.' },
      check: function (ev) { return ev.type === 'rotate3d'; }
    },
    {
      id: 'conic-sections-3', level: 2,
      title: { zh: '一刀切過兩個錐', en: 'One cut, two cones' },
      desc: { zh: '讓切口變成雙曲線：一條曲線分成兩支，分別落在上、下兩個圓錐上。', en: 'Make the cut a hyperbola: one curve in two branches, one on the upper cone and one on the lower cone.' },
      check: function (ev) { return becomes(ev, 'hyperbola'); }
    },
    {
      id: 'conic-sections-4', level: 3,
      title: { zh: '剛剛好的拋物線', en: 'A parabola, exactly' },
      desc: { zh: '讓切平面和圓錐的一條母線平行，切出拋物線。差一點點，它就會變成別的曲線。', en: 'Make the cutting plane parallel to one generator of the cone to get a parabola. Miss by a hair and it becomes another curve.' },
      check: function (ev) { return becomes(ev, 'parabola'); }
    },
    {
      id: 'conic-sections-5', level: 3,
      title: { zh: '和永遠是 2a', en: 'The sum is always 2a' },
      desc: { zh: '在同一個橢圓（不是圓）上，用「記下這一點」記錄至少 4 個彼此分散的點，比較每一點到兩個焦點的距離和 PF1 + PF2。', en: 'On one ellipse (not a circle), use “Record P” for at least 4 well-spread points and compare the sum of the distances to the two foci, PF1 + PF2, at each.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'mark' || d.type !== 'ellipse' || !d.rows || d.rows.length < 4) return false;
        const gap = 0.15 * (d.a + d.b);
        for (let i = 0; i < d.rows.length; i++) {
          for (let j = i + 1; j < d.rows.length; j++) {
            if (Math.hypot(d.rows[i].x - d.rows[j].x, d.rows[i].y - d.rows[j].y) < gap) return false;
          }
        }
        return true;
      }
    },
    {
      id: 'conic-sections-6', level: 4,
      title: { zh: '離心率一半', en: 'Eccentricity one half' },
      desc: { zh: '切出離心率 e = 0.500（誤差 ±0.003）的橢圓。想一想：e 跟哪些角度有關？', en: 'Cut an ellipse with eccentricity e = 0.500 (within ±0.003). Think first: which angles does e depend on?' },
      check: function (ev) { return P(ev) && ev.data.type === 'ellipse' && near(ev.data.e, 0.5, 0.003); }
    },
    {
      id: 'conic-sections-7', level: 5,
      title: { zh: '漸近線互相垂直', en: 'Perpendicular asymptotes' },
      desc: { zh: '切出兩條漸近線互相垂直的雙曲線（等軸雙曲線，b／a 與 1 相差不超過 0.5%）。', en: 'Cut a hyperbola whose two asymptotes are perpendicular (a rectangular hyperbola: b/a within 0.5% of 1).' },
      check: function (ev) { const d = ev.data; return P(ev) && d.type === 'hyperbola' && near(d.b / d.a, 1, 0.005); }
    },
    {
      id: 'conic-sections-8', level: 6,
      title: { zh: '正焦弦長 3', en: 'A latus rectum of 3' },
      desc: { zh: '切出正焦弦長 3.00（誤差 ±0.02）的拋物線。正焦弦是過焦點、垂直於對稱軸的弦。', en: 'Cut a parabola whose latus rectum is 3.00 long (within ±0.02). The latus rectum is the chord through the focus perpendicular to the axis.' },
      check: function (ev) { return P(ev) && ev.data.type === 'parabola' && near(ev.data.latus, 3, 0.02); }
    },
    {
      id: 'conic-sections-9', level: 7,
      title: { zh: '遠的是近的兩倍', en: 'Twice as far' },
      desc: { zh: '在雙曲線上找一點 P，讓它到遠焦點的距離恰好是到近焦點的 2 倍（誤差 2%）。', en: 'Find a point P on a hyperbola whose distance to the far focus is exactly twice its distance to the near focus (within 2%).' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'probe' || d.type !== 'hyperbola' || !(d.PF1 > 0 && d.PF2 > 0)) return false;
        return near(Math.max(d.PF1, d.PF2) / Math.min(d.PF1, d.PF2), 2, 0.04);
      }
    },
    {
      id: 'conic-sections-10', level: 8,
      title: { zh: '同一個橢圓，兩個圓錐', en: 'One ellipse, two cones' },
      desc: { zh: '用兩個半頂角 α 相差至少 10° 的圓錐，切出同樣的橢圓：a、b 各相差不到 1%，而且離心率 e ≥ 0.3。', en: 'Using two cones whose half-angles α differ by at least 10°, cut the same ellipse: a and b each within 1%, with eccentricity e ≥ 0.3.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!P(ev) || d.type !== 'ellipse' || !(d.e >= 0.3)) return false;
        const list = mem.list || (mem.list = []);
        const hit = list.some(function (o) {
          return Math.abs(o.alpha - d.alpha) >= 10 - 1e-9 && near(d.a / o.a, 1, 0.01) && near(d.b / o.b, 1, 0.01);
        });
        list.push({ alpha: d.alpha, a: d.a, b: d.b });
        if (list.length > 60) list.shift();
        return hit;
      }
    },
    {
      id: 'conic-sections-11', level: 9,
      title: { zh: '訂做一條雙曲線', en: 'A hyperbola made to order' },
      desc: { zh: '切出 a = 1.00、b = 2.00 的雙曲線（a 的誤差 ±0.02，b 的誤差 ±0.04）。', en: 'Cut a hyperbola with a = 1.00 and b = 2.00 (a within ±0.02, b within ±0.04).' },
      check: function (ev) { const d = ev.data; return P(ev) && d.type === 'hyperbola' && near(d.a, 1, 0.02) && near(d.b, 2, 0.04); }
    },
    {
      id: 'conic-sections-12', level: 10,
      title: { zh: '訂做一個橢圓', en: 'An ellipse made to order' },
      desc: { zh: '切出 c = 1.50、b = 2.00 的橢圓（c 是中心到焦點的距離，兩個量的誤差都是 ±0.02）。', en: 'Cut an ellipse with c = 1.50 and b = 2.00 (c is the distance from the centre to a focus; both within ±0.02).' },
      check: function (ev) { const d = ev.data; return P(ev) && d.type === 'ellipse' && near(d.c, 1.5, 0.02) && near(d.b, 2, 0.02); }
    },
    {
      id: 'conic-sections-h1', level: 3, hidden: true,
      riddle: { zh: '所有的路都在這裡相遇，也在這裡結束。', en: 'Every road meets here — and ends here.' },
      check: function (ev) { return becomes(ev, 'point'); }
    },
    {
      id: 'conic-sections-h2', level: 4, hidden: true,
      riddle: { zh: '兩條路在一個點交會，從此分道揚鑣，再也不轉彎。', en: 'Two roads cross at a single point, then part for good and never turn again.' },
      check: function (ev) { return becomes(ev, 'lines'); }
    },
    {
      id: 'conic-sections-h3', level: 6, hidden: true,
      riddle: { zh: '兩條路疊成一條，誰也分不出誰。', en: 'Two roads lie on top of each other, and no one can tell them apart.' },
      check: function (ev) { return becomes(ev, 'line'); }
    }
  ]);
})();
