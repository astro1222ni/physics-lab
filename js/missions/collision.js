/* missions/collision.js — 一維碰撞的任務（星星數 = 等級 1–10）
 *
 * 事件（js/collision.js 在動畫播放到「碰撞結束」的那一刻回報；必須親自按「播放」，重播也會再回報一次）：
 *   'collision'：data 欄位
 *     m1, m2（kg）, v1, v2（碰撞前速度，m/s，向右為正）, e（實際使用的恢復係數；加彈簧時為 1）, eSet（滑桿上的 e）,
 *     spring（是否加彈簧）, k（N/m，沒有彈簧為 0）, v1f, v2f（碰撞後速度）, vcm（質心速度）,
 *     p, pAfter（總動量）, K, KAfter（總動能）, lost（損失的動能）, lostFrac（損失比例 0–1）, eMeasured（由速度反算的 e）,
 *     cmFrame（碰撞結束時是否以質心為參考系觀看）, slow（是否慢動作）,
 *     有彈簧時另有 dt（接觸時間 s）, xmax（最大壓縮量 m）, Fmax（最大彈力 N）, J（衝量 N·s）, Umax（最大彈性位能 J）；沒有彈簧時為 null。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
  const rel = function (a, b, r) { return Math.abs(a - b) <= r * Math.max(Math.abs(a), Math.abs(b), 1e-12); };
  const same = function (a, b) { return Math.abs(a - b) < 1e-9; };
  const remember = function (mem, d, n) { (mem.list = mem.list || []).push(d); if (mem.list.length > (n || 16)) mem.list.shift(); return mem.list; };
  const hit = function (ev) { return ev.type === 'collision'; };

  LabMission.register('collision', [
    {
      id: 'collision-1', level: 1,
      title: { zh: '第一次碰撞', en: 'First crash' },
      desc: { zh: '按「播放」，讓兩台車真的撞在一起。', en: 'Press “Play” and let the two carts actually collide.' },
      check: function (ev) { return hit(ev); }
    },
    {
      id: 'collision-2', level: 2,
      title: { zh: '速度交換', en: 'Swap the velocities' },
      desc: {
        zh: '彈性碰撞（e = 1），碰撞前兩台車都在動（速率都至少 0.5 m/s），碰撞後兩車的速度剛好互換：車 1 拿到車 2 原本的速度，車 2 拿到車 1 原本的速度。',
        en: 'In an elastic collision (e = 1) with both carts moving beforehand (each at 0.5 m/s or more), make the velocities swap exactly: cart 1 leaves with cart 2’s old velocity and cart 2 with cart 1’s.'
      },
      check: function (ev) {
        if (!hit(ev)) return false;
        const d = ev.data;
        return same(d.e, 1) && Math.abs(d.v1) >= 0.5 && Math.abs(d.v2) >= 0.5 && near(d.v1f, d.v2, 1e-6) && near(d.v2f, d.v1, 1e-6);
      }
    },
    {
      id: 'collision-3', level: 3,
      title: { zh: '跟著質心看', en: 'Ride with the centre of mass' },
      desc: {
        zh: '勾選「以質心為參考系」，觀看一次質心速度至少 1.5 m/s 的碰撞。在質心參考系中，兩台車的動量是不是永遠大小相等、方向相反？',
        en: 'Tick “Centre-of-mass frame” and watch a collision whose centre of mass moves at 1.5 m/s or more. In that frame, are the two momenta always equal and opposite?'
      },
      check: function (ev) { return hit(ev) && ev.data.cmFrame && Math.abs(ev.data.vcm) >= 1.5; }
    },
    {
      id: 'collision-4', level: 3,
      title: { zh: '黏在一起', en: 'Stuck together' },
      desc: {
        zh: '完全非彈性碰撞（e = 0、不加彈簧），讓碰撞損失的動能恰好是碰撞前總動能的 75%（誤差 ±0.5 個百分點）。',
        en: 'In a perfectly inelastic collision (e = 0, no spring), lose exactly 75% of the initial total kinetic energy (±0.5 percentage points).'
      },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && !d.spring && same(d.e, 0) && near(d.lostFrac, 0.75, 0.005);
      }
    },
    {
      id: 'collision-5', level: 4,
      title: { zh: '輕車彈回', en: 'Bounce back' },
      desc: {
        zh: '車 2 原本靜止，讓車 1 撞上後以 2.00 m/s 的速率向左彈回（誤差 ±0.01 m/s）。',
        en: 'With cart 2 at rest, make cart 1 bounce back to the left at 2.00 m/s (±0.01 m/s).'
      },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && same(d.v2, 0) && near(d.v1f, -2, 0.01);
      }
    },
    {
      id: 'collision-6', level: 5,
      title: { zh: '急停', en: 'Dead stop' },
      desc: {
        zh: '車 2 原本靜止、恢復係數 e 不超過 0.9（不加彈簧），讓車 1 撞上後完全停住（剩下的速度小於 0.005 m/s）。',
        en: 'With cart 2 at rest and e no more than 0.9 (no spring), make cart 1 stop dead after the collision (less than 0.005 m/s left).'
      },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && !d.spring && d.e <= 0.9 + 1e-9 && same(d.v2, 0) && Math.abs(d.v1) >= 0.5 && Math.abs(d.v1f) < 0.005;
      }
    },
    {
      id: 'collision-7', level: 6,
      title: { zh: '損失六成', en: 'Lose sixty per cent' },
      desc: {
        zh: '恢復係數 e = 0.50（不加彈簧），讓碰撞損失的動能恰好是碰撞前總動能的 60%（誤差 ±0.3 個百分點）。',
        en: 'With e = 0.50 (no spring), lose exactly 60% of the initial total kinetic energy (±0.3 percentage points).'
      },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && !d.spring && same(d.e, 0.5) && near(d.lostFrac, 0.6, 0.003);
      }
    },
    {
      id: 'collision-8', level: 6,
      title: { zh: '一秒的擁抱', en: 'A one-second hug' },
      desc: {
        zh: '加彈簧緩衝，讓彈簧和車 2 接觸的時間恰好是 1.000 s（誤差 ±0.003 s）。',
        en: 'With the spring bumper, make the spring stay in contact with cart 2 for exactly 1.000 s (±0.003 s).'
      },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && d.spring && near(d.dt, 1, 0.003);
      }
    },
    {
      id: 'collision-9', level: 7,
      title: { zh: '壓縮與彈力', en: 'Squeeze and push' },
      desc: {
        zh: '加彈簧緩衝，讓彈簧的最大壓縮量恰好是 0.300 m，同時最大彈力恰好是 150 N（兩者誤差都在 1% 內）。',
        en: 'With the spring bumper, make the maximum compression exactly 0.300 m and the peak spring force exactly 150 N (each within 1%).'
      },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && d.spring && rel(d.xmax, 0.3, 0.01) && rel(d.Fmax, 150, 0.01);
      }
    },
    {
      id: 'collision-10', level: 8,
      title: { zh: '指定的結局', en: 'A chosen ending' },
      desc: {
        zh: '車 2 原本靜止、e 小於 1（不加彈簧），讓碰撞後車 1 以 1.00 m/s 向左、車 2 以 2.00 m/s 向右離開（誤差都在 ±0.01 m/s）。',
        en: 'With cart 2 at rest and e less than 1 (no spring), make cart 1 leave at 1.00 m/s to the left and cart 2 at 2.00 m/s to the right (each ±0.01 m/s).'
      },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && !d.spring && d.e < 1 - 1e-9 && same(d.v2, 0) && near(d.v1f, -1, 0.01) && near(d.v2f, 2, 0.01);
      }
    },
    {
      id: 'collision-11', level: 9,
      title: { zh: '同樣的一推', en: 'The same push' },
      desc: {
        zh: '加彈簧做兩次碰撞，兩條彈簧的 k 相差至少 4 倍，但兩次的衝量相等、最大彈力也相等（都在 0.5% 內）。比較兩次的彈力–時間圖。',
        en: 'Do two spring-bumper collisions with spring constants at least 4 times apart, but with equal impulses and equal peak forces (each within 0.5%). Compare the two force–time graphs.'
      },
      check: function (ev, mem) {
        if (!hit(ev) || !ev.data.spring) return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && Math.max(o.k, d.k) >= 4 * Math.min(o.k, d.k) && rel(o.J, d.J, 0.005) && rel(o.Fmax, d.Fmax, 0.005);
        });
      }
    },
    {
      id: 'collision-12', level: 10,
      title: { zh: '大師：完美緩衝', en: 'Master: the perfect bumper' },
      desc: {
        zh: '加彈簧緩衝、車 2 原本靜止，同時做到三件事：車 1 碰撞後完全停住（小於 0.005 m/s）、接觸時間恰好 0.500 s（±0.002 s）、最大彈力恰好 50.0 N（±0.5 N）。',
        en: 'With the spring bumper and cart 2 at rest, achieve all three at once: cart 1 stops dead (less than 0.005 m/s), the contact time is exactly 0.500 s (±0.002 s) and the peak force is exactly 50.0 N (±0.5 N).'
      },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && d.spring && same(d.v2, 0) && Math.abs(d.v1f) < 0.005 && near(d.dt, 0.5, 0.002) && near(d.Fmax, 50, 0.5);
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'collision-h1', level: 3, hidden: true,
      riddle: { zh: '背影走得再遠，也終究會被追上。', en: 'However far a back runs ahead, it is caught in the end.' },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && d.v1 * d.v2 > 0 && Math.min(Math.abs(d.v1), Math.abs(d.v2)) >= 0.5;
      }
    },
    {
      id: 'collision-h2', level: 5, hidden: true,
      riddle: { zh: '奔向彼此，然後一起安靜下來。', en: 'Rushing toward each other, then falling quiet together.' },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && Math.abs(d.v1) >= 0.5 && Math.abs(d.v2) >= 0.5 && Math.abs(d.v1f) < 1e-6 && Math.abs(d.v2f) < 1e-6;
      }
    },
    {
      id: 'collision-h3', level: 7, hidden: true,
      riddle: { zh: '巨人從不奔跑，小石卻快得像要逃離自己的影子。', en: 'The giant never runs, yet the pebble flies as if fleeing its own shadow.' },
      check: function (ev) {
        const d = ev.data;
        return hit(ev) && same(d.e, 1) && same(d.v2, 0) && d.v1 > 0 && d.v2f >= 1.9 * d.v1 - 1e-9;
      }
    }
  ]);
})();
