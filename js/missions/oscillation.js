/* missions/oscillation.js — 彈簧振子與單擺的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/oscillation.js 發出；SI 單位，角度用度）：
  //   共同欄位（彈簧）{ mode: 'spring', m, k, A, x0, damp, b, bc, regime, T0（= 2π√(m/k)）, Td, E0 }
  //   共同欄位（單擺）{ mode: 'pendulum', L, g, th0（釋放角大小）, m, damp, b, T0（小角度 2π√(L/g)）, Tex（精確週期）, E0 }
  //   turn：每個轉折點（速度為零）{ …共同欄位…, n（釋放後第 n 個）, t, amp（彈簧 |x| m；單擺 |θ| 度） }
  //   period：湊滿一個週期後，每個轉折點回報一次實測週期 { …共同欄位…, n, t, amp, Tm }
  //   settle：有阻尼的彈簧，力學能第一次降到 0.01%（振幅剩 1%）{ …彈簧欄位…, t（停下的時刻）, crossed（是否越過平衡點，即欠阻尼） }
  //   pause：按「暫停」{ …共同欄位…, t, KE, PE, E, 彈簧 x、v、a／單擺 th、om、al }
  const EPS = 1e-9;
  const near = function (a, b) { return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)); };
  const rel = function (x, target, tol) { return Math.abs(x - target) <= tol * Math.abs(target); };
  const isPeriod = function (ev, mode) { return ev.type === 'period' && ev.data.mode === mode && !ev.data.damp; };
  /** 記錄最近的實測週期，供「兩次測量比較」的任務使用 */
  const remember = function (mem, d) {
    const list = mem.list = mem.list || [];
    list.push(d);
    while (list.length > 40) list.shift();
    return list;
  };
  const sameSwing = function (a, b) { return near(a.L, b.L) && near(a.g, b.g); };
  /** 動能與位能相等（差不到力學能的 4%） */
  const halfHalf = function (d) { return d.E > 0 && Math.abs(d.KE - d.PE) <= 0.04 * d.E; };

  LabMission.register('oscillation', [
    {
      id: 'oscillation-1', level: 1,
      title: { zh: '往左拉', en: 'Pull it the other way' },
      desc: { zh: '在「彈簧振子」分頁，把木塊拖到平衡點左邊（x < 0）再放手，讓它完整振動一次（右邊「實測週期（模擬）」出現數值）。', en: 'On the “Spring oscillator” tab, drag the block to the left of equilibrium (x < 0), let go, and let it complete one full oscillation (until “Measured period (simulation)” shows a value).' },
      check: function (ev) { return ev.type === 'period' && ev.data.mode === 'spring' && ev.data.x0 < 0; }
    },
    {
      id: 'oscillation-2', level: 2,
      title: { zh: '一秒鐘的振子', en: 'A one-second oscillator' },
      desc: { zh: '彈簧振子、不勾「加入阻尼」：調整「質量 m」與「力常數 k」，讓實測週期恰好是 1.000 s（誤差 0.2% 內）。', en: 'Spring oscillator with “Add damping” unticked: adjust “Mass m” and “Spring constant k” so that the measured period is exactly 1.000 s (within 0.2%).' },
      check: function (ev) { return isPeriod(ev, 'spring') && rel(ev.data.Tm, 1, 0.002); }
    },
    {
      id: 'oscillation-3', level: 2,
      title: { zh: '伽利略的等時性', en: 'Galileo’s isochronism' },
      desc: { zh: '同一個單擺（「擺長 L」與「重力加速度 g」不變、不勾「加入阻尼」），用兩個都不超過 10°、相差至少 4° 的「釋放角 θ0」各量一次週期，兩次實測週期相差不到 0.3%。', en: 'With the same pendulum (same “Length L” and “Gravitational acceleration g”, “Add damping” unticked), measure the period at two values of “Release angle θ0”, both 10° or less and at least 4° apart; the two measured periods must agree within 0.3%.' },
      check: function (ev, mem) {
        if (!isPeriod(ev, 'pendulum')) return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && sameSwing(o, d) && o.th0 <= 10 + EPS && d.th0 <= 10 + EPS &&
            Math.abs(o.th0 - d.th0) >= 4 - EPS && rel(d.Tm, o.Tm, 0.003);
        });
      }
    },
    {
      id: 'oscillation-4', level: 3,
      title: { zh: '大擺角變慢了', en: 'Big swings are slower' },
      desc: { zh: '單擺、不勾「加入阻尼」：調整「釋放角 θ0」，讓實測週期比小角度公式 2π√(L/g) 算出的週期長至少 10%。', en: 'Pendulum with “Add damping” unticked: adjust “Release angle θ0” so that the measured period is at least 10% longer than the small-angle formula 2π√(L/g) predicts.' },
      check: function (ev) { return isPeriod(ev, 'pendulum') && ev.data.Tm >= 1.1 * ev.data.T0; }
    },
    {
      id: 'oscillation-5', level: 4,
      title: { zh: '同步擺動', en: 'In step' },
      desc: { zh: '彈簧振子與單擺都不勾「加入阻尼」，兩個分頁各量一次週期，讓兩者的實測週期相差不到 0.3%。', en: 'With “Add damping” unticked on both tabs, measure the period of the spring oscillator and of the pendulum so that the two measured periods agree within 0.3%.' },
      check: function (ev, mem) {
        if (!isPeriod(ev, 'spring') && !isPeriod(ev, 'pendulum')) return false;
        mem[ev.data.mode] = ev.data.Tm;
        return mem.spring > 0 && mem.pendulum > 0 && rel(mem.spring, mem.pendulum, 0.003);
      }
    },
    {
      id: 'oscillation-6', level: 4,
      title: { zh: '動能、位能各一半', en: 'Half kinetic, half potential' },
      desc: { zh: '彈簧振子振動時，在動能與彈性位能恰好相等的瞬間按「暫停」（兩者相差不到力學能的 4%）。動得太快就把「播放速度」調成 0.25×，或加大「質量 m」、減小「力常數 k」。', en: 'While the spring oscillator is moving, press “Pause” at the instant its kinetic energy equals its elastic potential energy (difference below 4% of the mechanical energy). If it moves too fast, set “Speed” to 0.25×, or raise “Mass m” and lower “Spring constant k”.' },
      check: function (ev) { return ev.type === 'pause' && ev.data.mode === 'spring' && halfHalf(ev.data); }
    },
    {
      id: 'oscillation-7', level: 5,
      title: { zh: '秒擺', en: 'The seconds pendulum' },
      desc: { zh: '在地球上（按「地球」，g = 9.8 m/s²）、「釋放角 θ0」不超過 10°、不勾「加入阻尼」：調整「擺長 L」，讓單擺的實測週期恰好是 2.000 s（誤差 0.1% 內；點滑桿旁的數字可以直接輸入）。', en: 'On Earth (press “Earth”, g = 9.8 m/s²), with “Release angle θ0” 10° or less and “Add damping” unticked, adjust “Length L” so that the pendulum’s measured period is exactly 2.000 s (within 0.1%; tap the number next to a slider to type a value).' },
      check: function (ev) {
        const d = ev.data;
        return isPeriod(ev, 'pendulum') && near(d.g, 9.8) && d.th0 <= 10 + EPS && rel(d.Tm, 2, 0.001);
      }
    },
    {
      id: 'oscillation-8', level: 6,
      title: { zh: '臨界阻尼', en: 'Critical damping' },
      desc: { zh: '彈簧振子勾選「加入阻尼」，調整「阻尼係數 b」，讓木塊放手後完全不越過平衡點，並在 1.15 T（T = 2π√(m/k)）之內停下來（力學能剩不到 0.01%）。', en: 'On the spring oscillator, tick “Add damping” and adjust “Damping coefficient b” so that the released block never crosses equilibrium and comes to rest within 1.15 T (T = 2π√(m/k)) — less than 0.01% of its mechanical energy left.' },
      check: function (ev) { const d = ev.data; return ev.type === 'settle' && !d.crossed && d.t <= 1.15 * d.T0; }
    },
    {
      id: 'oscillation-9', level: 7,
      title: { zh: '大擺角的能量各半', en: 'Half and half at a big swing' },
      desc: { zh: '單擺、不勾「加入阻尼」、「釋放角 θ0」至少 60°：在動能與重力位能恰好相等的瞬間按「暫停」（兩者相差不到力學能的 4%）。這時擺角是釋放角的幾分之幾？', en: 'Pendulum with “Add damping” unticked and “Release angle θ0” at least 60°: press “Pause” at the instant the kinetic energy equals the gravitational potential energy (difference below 4% of the mechanical energy). What fraction of the release angle is the angle then?' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pause' && d.mode === 'pendulum' && !d.damp && d.th0 >= 60 - EPS && halfHalf(d);
      }
    },
    {
      id: 'oscillation-10', level: 8,
      title: { zh: '擺幅減半', en: 'Half the swing' },
      desc: { zh: '單擺勾選「加入阻尼」，調整「阻尼係數 b」，讓它來回擺 10 次後（第 20 個轉折點），擺幅恰好剩下釋放角的一半（誤差 3% 內）。', en: 'On the pendulum, tick “Add damping” and adjust “Damping coefficient b” so that after 10 full swings (the 20th turning point) the amplitude is exactly half the release angle (within 3%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'turn' && d.mode === 'pendulum' && d.damp && d.n === 20 && rel(d.amp / d.th0, 0.5, 0.03);
      }
    },
    {
      id: 'oscillation-11', level: 9,
      title: { zh: '兩倍的週期', en: 'Twice the period' },
      desc: { zh: '同一個單擺（「擺長 L」與「重力加速度 g」不變、不勾「加入阻尼」）：先用不超過 5° 的「釋放角 θ0」量一次週期，再找一個釋放角，讓實測週期恰好是它的 2 倍（誤差 0.3% 內）。', en: 'With the same pendulum (same “Length L” and “Gravitational acceleration g”, “Add damping” unticked), measure the period with “Release angle θ0” at 5° or less, then find a release angle that makes the measured period exactly twice as long (within 0.3%).' },
      check: function (ev, mem) {
        if (!isPeriod(ev, 'pendulum')) return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          if (o === d || !sameSwing(o, d)) return false;
          return (o.th0 <= 5 + EPS && rel(d.Tm / o.Tm, 2, 0.003)) || (d.th0 <= 5 + EPS && rel(o.Tm / d.Tm, 2, 0.003));
        });
      }
    },
    {
      id: 'oscillation-12', level: 10,
      title: { zh: '大師：火星上的秒擺', en: 'Master: a seconds pendulum on Mars' },
      desc: { zh: '兩個分頁都不勾「加入阻尼」：在火星上（按「火星」，g = 3.71 m/s²）讓單擺的實測週期恰好是 2.000 s，再讓彈簧振子也量到 2.000 s（兩者都在 ±0.001 s 內）。', en: 'With “Add damping” unticked on both tabs: on Mars (press “Mars”, g = 3.71 m/s²) make the pendulum’s measured period exactly 2.000 s, and also measure 2.000 s on the spring oscillator (both within ±0.001 s).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (isPeriod(ev, 'pendulum')) mem.pend = near(d.g, 3.71) && Math.abs(d.Tm - 2) <= 0.001;
        else if (isPeriod(ev, 'spring')) mem.spring = Math.abs(d.Tm - 2) <= 0.001;
        else return false;
        return !!(mem.pend && mem.spring);
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'oscillation-h1', level: 5, hidden: true,
      riddle: { zh: '越靠近那個不可能的平衡，它就越捨不得回來。', en: 'The nearer it comes to an impossible balance, the more reluctant it is to come back.' },
      check: function (ev) { return isPeriod(ev, 'pendulum') && ev.data.Tm >= 2.3 * ev.data.T0; }
    },
    {
      id: 'oscillation-h2', level: 4, hidden: true,
      riddle: { zh: '牽著牆的那一位，一去一回之間，茶已涼了半盞。', en: 'The one tethered to the wall: between its leaving and its return, half a cup of tea goes cold.' },
      check: function (ev) { return ev.type === 'period' && ev.data.mode === 'spring' && ev.data.Tm >= 8.5; }
    },
    {
      id: 'oscillation-h3', level: 6, hidden: true,
      riddle: { zh: '陷進蜜裡的旅人，十個呼吸之後，仍在半路上。', en: 'A wanderer caught in honey — ten breaths on, still somewhere along the road.' },
      check: function (ev) { const d = ev.data; return ev.type === 'settle' && d.regime === 'over' && d.t >= 10 * d.T0; }
    }
  ]);
})();
