/* missions/angular-momentum.js — 角動量守恆的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/angular-momentum.js 發出；SI 單位）：
  //   arrive：模式一收放繩子完成 { m, r0, r1（這次收放的起點與終點半徑）, v0, v1, w0, w1, K0, K1, W（這次手作的功）, T1, L, u }
  //   letgo：模式一按「鬆手」{ r, v, vr（徑向速度，負＝往小孔）, rperp, L, m, x, y, vx, vy }
  //   snap：模式一繩子張力超過 30 N 而斷掉 { T, r, v, L, m }
  //   exit：模式一鬆手或繩斷後小球滑出畫面 { why: 'letgo' | 'snap', m, r, x0, y0, vx, vy, v, vr, rperp, L,
  //         miss（直線路徑離目標靶 (−1.50, 1.10) m 最近的距離）, tau }
  //   arms：模式二收手或伸手完成 { dir: 'in' | 'out', md, Mb, rOut, rIn, r0, r1, I0, I1, w0, w1, K0, K1, W, L }
  //   drop：模式二鬆開啞鈴 { r, w, wAfter, md, L, Lperson, armsIn }
  //   couple：模式三兩盤一起轉 { M1, R1, w1, M2, R2, w2, mu, I1, I2, wf, K0, K1, loss, frac（損失的比例）, tLock, L }
  const rel = function (x, target, tol) { return Math.abs(x - target) <= tol * Math.abs(target); };
  const near = function (a, b) { return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)); };

  LabMission.register('angular-momentum', [
    {
      id: 'angular-momentum-1', level: 1,
      title: { zh: '放長繩子', en: 'Let the string out' },
      desc: { zh: '在「穿過小孔的繩子」中，把目標半徑 r1 調得比目前半徑大（至少大 0.05 m），按「放繩到 r1」，看小球變慢。',
        en: 'In “String through a hole”, set the target radius r1 larger than the present radius (by at least 0.05 m) and press “Let out to r1”. Watch the ball slow down.' },
      check: function (ev) { return ev.type === 'arrive' && ev.data.r1 >= ev.data.r0 + 0.05 - 1e-9; }
    },
    {
      id: 'angular-momentum-2', level: 2,
      title: { zh: '鬆手！', en: 'Let go!' },
      desc: { zh: '按「鬆手」，看小球沿直線滑出桌面。', en: 'Press “Let go” and watch the ball slide off the table in a straight line.' },
      check: function (ev) { return ev.type === 'exit' && ev.data.why === 'letgo'; }
    },
    {
      id: 'angular-momentum-3', level: 2,
      title: { zh: '半徑減半', en: 'Half the radius' },
      desc: { zh: '把繩子拉到原來半徑的一半（誤差 0.5% 內），確認速率剛好變成 2 倍。',
        en: 'Pull the string in to half of its radius (within 0.5%) and check that the speed becomes exactly twice as large.' },
      check: function (ev) { return ev.type === 'arrive' && rel(ev.data.r1 / ev.data.r0, 0.5, 0.005); }
    },
    {
      id: 'angular-momentum-4', level: 3,
      title: { zh: '兩盤相合', en: 'Couple the discs' },
      desc: { zh: '在「兩盤相合」中放下上盤，等兩個圓盤一起轉動。', en: 'In “Two discs”, drop the upper disc and wait until the two discs turn together.' },
      check: function (ev) { return ev.type === 'couple' && ev.data.loss > 1e-9; }
    },
    {
      id: 'angular-momentum-5', level: 4,
      title: { zh: '轉速變 3 倍', en: 'Three times the spin' },
      desc: { zh: '在「旋轉平台」中調整啞鈴與手臂的位置，讓收手後的角速度剛好是伸手時的 3 倍（誤差 1% 內）。',
        en: 'On the turntable, adjust the dumbbells and arm positions so that pulling the arms in makes the angular speed exactly 3 times as large (within 1%).' },
      check: function (ev) { return ev.type === 'arms' && ev.data.dir === 'in' && rel(ev.data.w1 / ev.data.w0, 3, 0.01); }
    },
    {
      id: 'angular-momentum-6', level: 5,
      title: { zh: '動能變 4 倍', en: 'Four times the energy' },
      desc: { zh: '在「旋轉平台」上收手，讓轉動動能剛好變成原來的 4 倍（誤差 1% 內）。多出來的能量從哪裡來？',
        en: 'On the turntable, pull the arms in so that the rotational kinetic energy becomes exactly 4 times as large (within 1%). Where does the extra energy come from?' },
      check: function (ev) { return ev.type === 'arms' && ev.data.dir === 'in' && rel(ev.data.K1 / ev.data.K0, 4, 0.01); }
    },
    {
      id: 'angular-momentum-7', level: 6,
      title: { zh: '一半變成熱', en: 'Half turns into heat' },
      desc: { zh: '讓兩盤相合時，總動能剛好損失一半（50.0% ± 0.5%）。', en: 'Make the two discs lose exactly half of their total kinetic energy when they couple (50.0% ± 0.5%).' },
      check: function (ev) { return ev.type === 'couple' && Math.abs(ev.data.frac - 0.5) <= 0.005; }
    },
    {
      id: 'angular-momentum-8', level: 6,
      title: { zh: '倍率與轉速無關', en: 'The ratio ignores the speed' },
      desc: { zh: '在「旋轉平台」上，啞鈴與手臂位置都不變，只改伸手時的角速度 ω1（改成 2 倍以上或一半以下），兩次收手後比較轉速變成幾倍。',
        en: 'On the turntable, keep the dumbbells and arm positions the same and change only the starting angular speed ω1 (to at least twice or at most half). Pull the arms in both times and compare how many times faster you turn.' },
      check: function (ev, mem) {
        if (ev.type !== 'arms' || ev.data.dir !== 'in') return false;
        const d = ev.data, list = mem.list = mem.list || [];
        const hit = list.some(function (o) {
          return near(o.md, d.md) && near(o.Mb, d.Mb) && near(o.rOut, d.rOut) && near(o.rIn, d.rIn) &&
            Math.abs(o.r0 - d.r0) < 1e-6 && Math.abs(o.r1 - d.r1) < 1e-6 &&
            (d.w0 >= 2 * o.w0 - 1e-9 || o.w0 >= 2 * d.w0 - 1e-9) && rel(d.w1 / d.w0, o.w1 / o.w0, 1e-6);
        });
        list.push(d);
        while (list.length > 16) list.shift();
        return hit;
      }
    },
    {
      id: 'angular-momentum-9', level: 7,
      title: { zh: '手作功 1 焦耳', en: 'One joule of work' },
      desc: { zh: '收一次繩子，讓手對小球作的功剛好是 1.00 J（誤差 0.01 J 內）。',
        en: 'Pull the string in once so that the hand does exactly 1.00 J of work on the ball (within 0.01 J).' },
      check: function (ev) { return ev.type === 'arrive' && ev.data.r1 < ev.data.r0 && Math.abs(ev.data.W - 1) <= 0.01; }
    },
    {
      id: 'angular-momentum-10', level: 8,
      title: { zh: '命中目標靶', en: 'Hit the target' },
      desc: { zh: '打開「目標靶」，選好位置角 θ 再鬆手，讓小球直線滑過靶心 (−1.50, 1.10) m（偏差 3 cm 內）。',
        en: 'Show the target, choose the position angle θ and let go so that the ball slides straight through the bullseye at (−1.50, 1.10) m (within 3 cm).' },
      check: function (ev) { return ev.type === 'exit' && ev.data.why === 'letgo' && ev.data.miss <= 0.03; }
    },
    {
      id: 'angular-momentum-11', level: 9,
      title: { zh: '邊拉邊放', en: 'Let go while pulling' },
      desc: { zh: '在收繩、小球正往小孔跑的途中鬆手，讓它飛出的直線離小孔恰好 0.300 m（力臂 r⊥，誤差 1 cm 內）。',
        en: 'Let go while the string is being pulled in and the ball is still moving towards the hole, so that its straight path passes exactly 0.300 m from the hole (lever arm r⊥, within 1 cm).' },
      check: function (ev) { return ev.type === 'exit' && ev.data.why === 'letgo' && ev.data.vr <= -0.02 && Math.abs(ev.data.rperp - 0.3) <= 0.01; }
    },
    {
      id: 'angular-momentum-12', level: 10,
      title: { zh: '大師：準速命中', en: 'Master: on target at speed' },
      desc: { zh: '鬆手後，小球以 3.00 m/s（誤差 1% 內）的速率直線滑過目標靶心（偏差 3 cm 內）。',
        en: 'After you let go, the ball must slide through the bullseye (within 3 cm) at a speed of 3.00 m/s (within 1%).' },
      check: function (ev) { return ev.type === 'exit' && ev.data.why === 'letgo' && ev.data.miss <= 0.03 && rel(ev.data.v, 3, 0.01); }
    },
    {
      id: 'angular-momentum-h1', level: 4, hidden: true,
      riddle: { zh: '緊到極處，便是自由。', en: 'Pulled to the limit, it is set free.' },
      check: function (ev) { return ev.type === 'snap'; }
    },
    {
      id: 'angular-momentum-h2', level: 5, hidden: true,
      riddle: { zh: '先擁抱，再放手；轉身的節拍，一拍也沒變。', en: 'First an embrace, then letting go — and the turn keeps exactly the same beat.' },
      check: function (ev) { return ev.type === 'drop' && ev.data.armsIn === true && ev.data.md >= 1 - 1e-9; }
    },
    {
      id: 'angular-momentum-h3', level: 6, hidden: true,
      riddle: { zh: '針鋒相對，終歸寂靜。', en: 'Head to head, they end in stillness.' },
      check: function (ev) {
        if (ev.type !== 'couple') return false;
        const d = ev.data;
        return d.w1 * d.w2 < 0 && Math.abs(d.w1) >= 1 && Math.abs(d.w2) >= 1 && Math.abs(d.wf) < 0.02;
      }
    }
  ]);
})();
