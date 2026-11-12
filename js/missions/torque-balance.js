/* missions/torque-balance.js — 力矩與靜力平衡的任務（星星數 = 等級 1–10）
 *
 * 事件（js/torque-balance.js 回報；都需要親自按「放開／放手」或「往上爬」，預設狀態不會觸發任何任務）：
 *   蹺蹺板（data 為 TorqueCore.seesawSnapshot）：
 *     M（木板 kg）, p（支點 m）, L, n（物體數，不含彈簧秤）, kinds{w1,w2,w5,brick,child,adult}（各幾個）, distinct（不同質量的種類數）,
 *     nHang, nTop, left, right, hangL, hangR, topL, topR（支點左／右邊的件數；吊掛／放在板上）, items[{kind,m,x,hang}],
 *     S（Σm s，對支點的一次矩 kg·m）, W, Wb, Wi（總重、板重、物體重 N）, I（kg·m²）, xcm（系統重心 m）,
 *     N（支點的力 N；撐住時 NaN）, F（彈簧秤讀數 N）, Ng（地面對板端的力 N）, scale, scaleX, scaleArm,
 *     theta（度）, omega（rad/s）, rest（'held'｜'level'｜'scale'｜'L'｜'R'｜null）, byScale, level。
 *     'release'：按「放開」。
 *     'balance'：放開後木板停在水平（淨力矩為零，或由彈簧秤拉住）；之後在水平狀態下改擺設、仍然平衡也會再回報。
 *     'land'：木板一端碰地；另有 side（'L'｜'R'）, vEnd（板端速率 m/s）, omegaHit, tRun（從開始轉動到碰地的時間 s，
 *             是模擬時間，不受慢動作影響）, prevSide（放開後上一次著地的是哪一端；第一次為 null）。
 *   梯子（data 為 TorqueCore.ladderSnapshot）：
 *     theta, thetaC（度）, mu, muw, rough, ml, mp（kg）, d（人的位置，沿梯子 m）, L, top（人在頂端）, k（摩擦使用率）, slips,
 *     muMin, dSlip, Ng, Nw, fg, fw, fgMax（N），另有 cause：'release'｜'change'｜'climb'｜'climbStop'。
 *     'ladderStand'：放手後梯子站得住（按「放手」、放手狀態下改設定、爬到頂端、爬到一半按「停」）。
 *     'ladderSlip'：梯子滑倒（另有 climbFrom：往上爬的起點 m，不是爬的時候為 null）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const same = function (a, b) { return Math.abs(a - b) < 1e-9; };
  const remember = function (mem, key, d, n) { (mem[key] = mem[key] || []).push(d); if (mem[key].length > (n || 24)) mem[key].shift(); return mem[key]; };
  const bal = function (ev) { return ev.type === 'balance'; };
  const free = function (ev) { return bal(ev) && !ev.data.byScale; };
  const weights = function (d) { return d.kinds.w1 + d.kinds.w2 + d.kinds.w5; };
  const ladderKey = function (d) { return [d.theta, d.mu, d.muw, d.ml]; };
  const sameLadder = function (a, b) { return a.every(function (v, i) { return same(v, b[i]); }); };

  LabMission.register('torque-balance', [
    {
      id: 'torque-balance-1', level: 1,
      title: { zh: '翹起來了', en: 'Tip it over' },
      desc: {
        zh: '在木板上放任何一個物體，按「放開」，讓木板的一端碰到地面。',
        en: 'Put any object on the board, press “Let go” and let one end of the board hit the ground.'
      },
      check: function (ev) { return ev.type === 'land' && ev.data.n >= 1; }
    },
    {
      id: 'torque-balance-2', level: 2,
      title: { zh: '梯子滑倒了', en: 'The ladder slips' },
      desc: {
        zh: '切到「靠牆的梯子」，調整角度、摩擦係數或人的位置，讓梯子放手後（或人爬上去時）滑倒。',
        en: 'Switch to “Ladder against a wall” and change the angle, the friction or where the person stands until the ladder slips after you let go (or while the person climbs).'
      },
      check: function (ev) { return ev.type === 'ladderSlip'; }
    },
    {
      id: 'torque-balance-3', level: 2,
      title: { zh: '大人和小孩', en: 'Adult and child' },
      desc: {
        zh: '板上只放一個大人和一個小孩，分坐支點兩邊，放開後木板保持水平（不用彈簧秤）。',
        en: 'Put just one adult and one child on the board, on opposite sides of the pivot, so that the board stays level after you let go (no spring scale).'
      },
      check: function (ev) {
        const d = ev.data;
        return free(ev) && d.n === 2 && d.kinds.adult === 1 && d.kinds.child === 1 && d.left === 1 && d.right === 1;
      }
    },
    {
      id: 'torque-balance-4', level: 3,
      title: { zh: '三個不同的砝碼', en: 'Three different weights' },
      desc: {
        zh: '只用 1 kg、2 kg、5 kg 砝碼各一個（不放其他物體、不用彈簧秤），讓木板放開後保持水平。',
        en: 'Using exactly one 1 kg, one 2 kg and one 5 kg weight (nothing else, no spring scale), make the board stay level after you let go.'
      },
      check: function (ev) {
        const d = ev.data;
        return free(ev) && d.n === 3 && d.kinds.w1 === 1 && d.kinds.w2 === 1 && d.kinds.w5 === 1;
      }
    },
    {
      id: 'torque-balance-5', level: 3,
      title: { zh: '吊著也算', en: 'Hanging counts too' },
      desc: {
        zh: '支點一邊有砝碼「吊在板下」、另一邊有物體「放在板上」，放開後木板保持水平（不用彈簧秤）。力臂量的是哪一段距離？',
        en: 'With a weight hanging below the board on one side of the pivot and an object sitting on top on the other side, make the board stay level after you let go (no spring scale). Which distance is the lever arm?'
      },
      check: function (ev) {
        const d = ev.data;
        return free(ev) && ((d.hangL >= 1 && d.topR >= 1) || (d.hangR >= 1 && d.topL >= 1));
      }
    },
    {
      id: 'torque-balance-6', level: 4,
      title: { zh: '四兩撥千斤', en: 'A small pull for a big load' },
      desc: {
        zh: '板上至少放一個物體，用彈簧秤把木板拉住保持水平，而且彈簧秤的讀數不超過板上物體總重的四分之一。',
        en: 'With at least one object on the board, let the spring scale hold the board level while reading no more than a quarter of the total weight of the objects.'
      },
      check: function (ev) {
        const d = ev.data;
        return bal(ev) && d.byScale && d.n >= 1 && d.F > 0 && d.F <= d.Wi / 4 + 1e-9;
      }
    },
    {
      id: 'torque-balance-7', level: 4,
      title: { zh: '剛好不滑', en: 'Just about to slip' },
      desc: {
        zh: '光滑的牆、梯子上沒有人：調整角度，讓梯子放手後站得住，而且角度比「剛好不滑的最小角度」大不到 0.5°。',
        en: 'Smooth wall, nobody on the ladder: set the angle so the ladder holds after you let go, yet is less than 0.5° above the smallest angle at which it does not slip.'
      },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'ladderStand' && !d.rough && d.mp === 0 && d.theta - d.thetaC >= -1e-9 && d.theta - d.thetaC <= 0.5;
      }
    },
    {
      id: 'torque-balance-8', level: 5,
      title: { zh: '一個砝碼救回來', en: 'One weight to the rescue' },
      desc: {
        zh: '木板有質量（M ≥ 1 kg），支點離木板中央至少 0.2 m：只放一個砝碼（不用彈簧秤），讓木板放開後保持水平。',
        en: 'With a board of mass M ≥ 1 kg and the pivot at least 0.2 m from its middle, use a single weight (no spring scale) to make the board stay level after you let go.'
      },
      check: function (ev) {
        const d = ev.data;
        return free(ev) && d.n === 1 && weights(d) === 1 && d.M >= 1 && Math.abs(d.p - d.L / 2) >= 0.2 - 1e-9;
      }
    },
    {
      id: 'torque-balance-9', level: 6,
      title: { zh: '慢慢地倒下', en: 'Falling in slow motion' },
      desc: {
        zh: '讓木板從放開到一端碰地，至少要花 5 秒（模擬時間，不能靠慢動作）。想一想：轉動慣量和淨力矩各要怎麼安排？',
        en: 'Make the board take at least 5 seconds from letting go until one end hits the ground (simulated time — slow motion does not count). How should the moment of inertia and the net torque be arranged?'
      },
      check: function (ev) { return ev.type === 'land' && ev.data.n >= 1 && ev.data.tRun >= 5; }
    },
    {
      id: 'torque-balance-10', level: 7,
      title: { zh: '牆也有摩擦', en: 'A wall with friction' },
      desc: {
        zh: '選「有摩擦的牆」（μw ≥ 0.2）、梯子上沒有人：讓梯子放手後站得住，而且角度比剛好不滑的最小角度大不到 0.5°。',
        en: 'Choose the rough wall (μw ≥ 0.2) with nobody on the ladder: make the ladder hold after you let go, yet less than 0.5° above the smallest angle at which it does not slip.'
      },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'ladderStand' && d.rough && d.muw >= 0.2 - 1e-9 && d.mp === 0 && d.theta - d.thetaC >= -1e-9 && d.theta - d.thetaC <= 0.5;
      }
    },
    {
      id: 'torque-balance-11', level: 8,
      title: { zh: '最小的摩擦係數', en: 'The least friction' },
      desc: {
        zh: '光滑的牆、人至少 40 kg：讓人站在梯子最頂端（d = 4 m）時梯子仍然站得住，而且地面的 μs 比「最小需要值」大不到 0.01。',
        en: 'Smooth wall, a person of at least 40 kg: with the person at the very top (d = 4 m) the ladder must still hold, and the floor’s μs may exceed the minimum needed by less than 0.01.'
      },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'ladderStand' && !d.rough && d.top && d.mp >= 40 && !d.slips && d.mu - d.muMin <= 0.01 + 1e-9;
      }
    },
    {
      id: 'torque-balance-12', level: 10,
      title: { zh: '重的人比較容易滑？', en: 'Do heavier people slip sooner?' },
      desc: {
        zh: '同一把梯子（角度、μs、牆、梯子質量都不變）：讓體重 50 kg 以下的人從下面爬到頂端也不滑；換成 90 kg 以上的人，從 d ≤ 1 m 往上爬，卻在到頂端之前滑倒。',
        en: 'With the same ladder (same angle, μs, wall and ladder mass): a person of 50 kg or less climbs all the way to the top without slipping, while a person of 90 kg or more, climbing from d ≤ 1 m, slips before reaching the top.'
      },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'ladderStand' && d.cause === 'climb' && d.top && d.mp > 0 && d.mp <= 50) {
          const k = ladderKey(d);
          remember(mem, 'light', k);
          return (mem.heavy || []).some(function (h) { return sameLadder(h, k); });
        }
        if (ev.type === 'ladderSlip' && d.cause === 'climb' && d.mp >= 90 && d.climbFrom != null && d.climbFrom <= 1 + 1e-9 && d.d < d.L - 1e-9) {
          const k = ladderKey(d);
          remember(mem, 'heavy', k);
          return (mem.light || []).some(function (h) { return sameLadder(h, k); });
        }
        return false;
      }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'torque-balance-h1', level: 6, hidden: true,
      riddle: { zh: '三角形也想放個假。', en: 'Even the triangle deserves a day off.' },
      check: function (ev) { return bal(ev) && ev.data.byScale && Math.abs(ev.data.N) <= 0.5; }
    },
    {
      id: 'torque-balance-h2', level: 5, hidden: true,
      riddle: { zh: '你方唱罷我登場。', en: 'As one leaves the stage, the other steps on.' },
      check: function (ev) { return ev.type === 'land' && ev.data.prevSide != null && ev.data.prevSide !== ev.data.side; }
    },
    {
      id: 'torque-balance-h3', level: 7, hidden: true,
      riddle: { zh: '斜倚欲眠，終不傾頹。', en: 'Leaning as if to sleep, yet it never falls.' },
      check: function (ev) { return ev.type === 'ladderStand' && ev.data.theta < 20; }
    }
  ]);
})();
