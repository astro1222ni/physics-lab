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
  /** P 看兩個焦點的夾角（度）；量不到時 NaN */
  const focalAngle = function (d) {
    const p1 = d.PF1, p2 = d.PF2;
    if (!(p1 > 0 && p2 > 0)) return NaN;
    return Math.acos(Math.max(-1, Math.min(1, (p1 * p1 + p2 * p2 - 4 * d.c * d.c) / (2 * p1 * p2)))) * 180 / Math.PI;
  };
  const quad = function (d) { return (d.x >= 0 ? 'r' : 'l') + (d.y >= 0 ? 'u' : 'd'); };
  const cutKey = function (d) { return d.alpha + '|' + d.beta + '|' + d.d; };

  LabMission.register('conic-sections', [
    {
      id: 'conic-sections-1', level: 1,
      title: { zh: '切出一個圓', en: 'Cut a circle' },
      desc: { zh: '轉動切平面，讓切口變成一個正圓。切平面要怎麼擺？（要自己調 β，「快速切法」按鈕不算）', en: 'Tilt the cutting plane until the cut becomes a perfect circle. How must the plane sit? (Adjust β yourself; the quick-cut buttons do not count.)' },
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
      desc: { zh: '在同一個橢圓（不是圓）上，用「記下這一點」記錄至少 4 個彼此分散的點（任兩點的距離至少是 a + b 的 15%），比較每一點到兩個焦點的距離和 PF1 + PF2。', en: 'On one ellipse (not a circle), use “Record P” for at least 4 well-spread points (any two at least 15% of a + b apart) and compare the sum of the distances to the two foci, PF1 + PF2, at each.' },
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
    },
    // ---------- 11/13 補到 10 個隱藏任務（h4–h10；h1–h3 不改） ----------
    {
      // 雙曲線的兩支上都是 |PF1 − PF2| = 2a：在同一條雙曲線的兩支上各記下至少 2 個彼此分散的點
      id: 'conic-sections-h4', level: 4, hidden: true,
      riddle: { zh: '河的兩岸各站著兩個人，每個人用同一把尺量，量出來的差都一樣。', en: 'Two people stand on each bank of the river; each measures with the same ruler, and every one of them finds the same difference.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'mark' || d.type !== 'hyperbola' || !d.rows) return false;
        const rows = d.rows.filter(function (r) { return isFinite(r.x) && isFinite(r.y); });
        const gap = 0.15 * (d.a + d.b);
        const far = function (list) {
          for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) >= gap) return true;
          return false;
        };
        return far(rows.filter(function (r) { return r.x > 0; })) && far(rows.filter(function (r) { return r.x < 0; }));
      }
    },
    {
      // 拋物線正焦弦的兩個端點 (p, ±2p)：到焦點與到準線的距離都是 2p。同一條拋物線上兩端都站過
      id: 'conic-sections-h5', level: 5, hidden: true,
      riddle: { zh: '在燈的左右兩側各站一次，那兩個地方離燈和離牆都一樣遠。', en: 'Stand once on each side of the lamp, level with it: at both spots you are as far from the lamp as from the wall.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'probe' || d.type !== 'parabola' || !(d.p > 0)) return false;
        if (mem.key !== cutKey(d)) { mem.key = cutKey(d); mem.s = {}; }
        if (Math.abs(d.x - d.p) <= 0.02 * d.p && Math.abs(Math.abs(d.y) - 2 * d.p) <= 0.02 * d.p) mem.s[d.y > 0 ? 'u' : 'd'] = true;
        return !!(mem.s.u && mem.s.d);
      }
    },
    {
      // 同一個圓錐（α）、同一個深度（d），橢圓、拋物線、雙曲線都切一次（e 離 1 都不到 0.003）：三者的正焦弦都是 2d tan α
      id: 'conic-sections-h6', level: 6, hidden: true,
      riddle: { zh: '同一個錐、同一個深度，刀口輕輕偏一點，三兄弟的頭一樣寬。', en: 'Same cone, same depth; tilt the blade a hair either way, and the three brothers have heads of exactly the same width.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!P(ev)) return false;
        const key = d.alpha + '|' + d.d;
        if (mem.key !== key) { mem.key = key; mem.got = {}; }
        if (d.type === 'parabola' || ((d.type === 'ellipse' || d.type === 'hyperbola') && Math.abs(d.e - 1) <= 0.003)) mem.got[d.type] = true;
        return !!(mem.got.ellipse && mem.got.parabola && mem.got.hyperbola);
      }
    },
    {
      // 兩個焦點和短軸的兩端圍成正方形：b = c（e = √2／2）；P 站在短軸的一端，看兩個焦點正好成直角
      id: 'conic-sections-h7', level: 7, hidden: true,
      riddle: { zh: '兩盞燈和兩個肩膀，圍出一個不歪不斜的方塊；站上肩膀看看。', en: 'Two lamps and two shoulders mark out a square, neither skewed nor slanted; go and stand on a shoulder.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'probe' && d.type === 'ellipse' && d.c > 0 && near(d.b / d.c, 1, 0.005) && Math.abs(d.x) <= 0.02 * d.a;
      }
    },
    {
      // 地球的軌道 e ≈ 0.0167、哈雷彗星的軌道 e ≈ 0.967：兩個都切出來（先後不拘）
      id: 'conic-sections-h8', level: 8, hidden: true,
      riddle: { zh: '一個幾乎是圓，一個幾乎不是；它們繞著同一顆星，一個每年回來，一個七十六年才回來一次。', en: 'One is almost a circle, the other almost not; they circle the same star, one returning every year, the other once in seventy-six.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!P(ev) || d.type !== 'ellipse') return false;
        if (near(d.e, 0.0167, 0.0005)) mem.earth = true;
        if (near(d.e, 0.967, 0.001)) mem.halley = true;
        return !!(mem.earth && mem.halley);
      }
    },
    {
      // 焦點三角形的直角：橢圓上一點 P 看兩個焦點成 90°（±1°；P 在以 c 為半徑的圓上，要 e > √2／2）。e ≥ 0.75，P 不在短軸端點附近；同一個橢圓上兩個不同象限各找到一點（e = 5／7 的 3-4-5 留給 h10）
      id: 'conic-sections-h9', level: 9, hidden: true,
      riddle: { zh: '走在路上回頭看兩盞燈，兩道光正好在你身上折成直角；這樣的地方不只一處。', en: 'Walk the path and look back at the two lamps: their two beams meet at you in a perfect right angle. There is more than one such spot.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'probe' || d.type !== 'ellipse' || !(d.e >= 0.75) || Math.abs(d.x) < 0.1 * d.a) return false;
        if (mem.key !== cutKey(d)) { mem.key = cutKey(d); mem.q = {}; }
        if (Math.abs(focalAngle(d) - 90) <= 1) mem.q[quad(d)] = true;
        return Object.keys(mem.q).length >= 2;
      }
    },
    {
      // 焦點三角形是 3-4-5 直角三角形：PF1 : PF2 : F1F2 = 3 : 4 : 5，所以 2a = 7k、2c = 5k，只有 e = 5／7 的橢圓做得到；同一個橢圓上兩個不同象限各找到一點
      id: 'conic-sections-h10', level: 10, hidden: true,
      riddle: { zh: '兩盞燈和你，站成古人用繩子打結量出來的那個角；這樣的路，只有一種胖瘦。', en: 'You and the two lamps stand in the corner the ancients measured with a knotted rope; only one shape of path allows it.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'probe' || d.type !== 'ellipse' || !(d.e > 0.70 && d.e < 0.73)) return false;
        if (mem.key !== cutKey(d)) { mem.key = cutKey(d); mem.q = {}; }
        if (near(Math.max(d.PF1, d.PF2) / Math.min(d.PF1, d.PF2), 4 / 3, 0.01) && Math.abs(focalAngle(d) - 90) <= 1) mem.q[quad(d)] = true;
        return Object.keys(mem.q).length >= 2;
      }
    }
  ]);
})();
