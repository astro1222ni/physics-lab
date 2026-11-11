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
      desc: { zh: '把木塊拖到平衡點左邊（x < 0）再放手，讓它完整振動一次（出現「實測週期」）。', en: 'Drag the block to the left of equilibrium (x < 0), let go, and let it complete one full oscillation (until a “measured period” appears).' },
      check: function (ev) { return ev.type === 'period' && ev.data.mode === 'spring' && ev.data.x0 < 0; }
    },
    {
      id: 'oscillation-2', level: 2,
      title: { zh: '一秒鐘的振子', en: 'A one-second oscillator' },
      desc: { zh: '無阻尼的彈簧振子：調整 m 與 k，讓實測週期恰好是 1.000 s（誤差 0.2% 內）。', en: 'Undamped spring oscillator: adjust m and k so that the measured period is exactly 1.000 s (within 0.2%).' },
      check: function (ev) { return isPeriod(ev, 'spring') && rel(ev.data.Tm, 1, 0.002); }
    },
    {
      id: 'oscillation-3', level: 2,
      title: { zh: '伽利略的等時性', en: 'Galileo’s isochronism' },
      desc: { zh: '同一個單擺（擺長、g 不變、無阻尼），用兩個都不超過 10°、相差至少 4° 的釋放角各量一次週期，兩次實測週期相差不到 0.3%。', en: 'With the same pendulum (same length and g, no damping), measure the period at two release angles, both 10° or less and at least 4° apart; the measured periods must agree within 0.3%.' },
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
      desc: { zh: '無阻尼的單擺：讓實測週期比小角度公式 2π√(L/g) 算出的週期長至少 10%。', en: 'Undamped pendulum: make the measured period at least 10% longer than the small-angle formula 2π√(L/g) predicts.' },
      check: function (ev) { return isPeriod(ev, 'pendulum') && ev.data.Tm >= 1.1 * ev.data.T0; }
    },
    {
      id: 'oscillation-5', level: 4,
      title: { zh: '同步擺動', en: 'In step' },
      desc: { zh: '無阻尼的彈簧振子與單擺，各量一次週期（兩個分頁都要跑），讓兩者的實測週期相差不到 0.3%。', en: 'Measure the period of an undamped spring oscillator and of an undamped pendulum (run both tabs) so that the two measured periods agree within 0.3%.' },
      check: function (ev, mem) {
        if (!isPeriod(ev, 'spring') && !isPeriod(ev, 'pendulum')) return false;
        mem[ev.data.mode] = ev.data.Tm;
        return mem.spring > 0 && mem.pendulum > 0 && rel(mem.spring, mem.pendulum, 0.003);
      }
    },
    {
      id: 'oscillation-6', level: 4,
      title: { zh: '動能、位能各一半', en: 'Half kinetic, half potential' },
      desc: { zh: '彈簧振子振動時，在動能與彈性位能恰好相等的瞬間按「暫停」（兩者相差不到力學能的 4%）。', en: 'While the spring oscillator is moving, press “Pause” at the instant its kinetic energy equals its elastic potential energy (difference below 4% of the mechanical energy).' },
      check: function (ev) { return ev.type === 'pause' && ev.data.mode === 'spring' && halfHalf(ev.data); }
    },
    {
      id: 'oscillation-7', level: 5,
      title: { zh: '秒擺', en: 'The seconds pendulum' },
      desc: { zh: '在地球上（g = 9.8 m/s²）、釋放角不超過 10°、無阻尼：讓單擺的實測週期恰好是 2.000 s（誤差 0.1% 內）。', en: 'On Earth (g = 9.8 m/s²), with a release angle of 10° or less and no damping, make the pendulum’s measured period exactly 2.000 s (within 0.1%).' },
      check: function (ev) {
        const d = ev.data;
        return isPeriod(ev, 'pendulum') && near(d.g, 9.8) && d.th0 <= 10 + EPS && rel(d.Tm, 2, 0.001);
      }
    },
    {
      id: 'oscillation-8', level: 6,
      title: { zh: '臨界阻尼', en: 'Critical damping' },
      desc: { zh: '開啟阻尼，讓木塊放手後完全不越過平衡點，並在 1.15 T（T = 2π√(m/k)）之內停下來（力學能剩不到 0.01%）。', en: 'Turn on damping so that the released block never crosses equilibrium and comes to rest within 1.15 T (T = 2π√(m/k)) — less than 0.01% of its mechanical energy left.' },
      check: function (ev) { const d = ev.data; return ev.type === 'settle' && !d.crossed && d.t <= 1.15 * d.T0; }
    },
    {
      id: 'oscillation-9', level: 7,
      title: { zh: '大擺角的能量各半', en: 'Half and half at a big swing' },
      desc: { zh: '無阻尼的單擺，釋放角至少 60°：在動能與重力位能恰好相等的瞬間按「暫停」（兩者相差不到力學能的 4%）。這時擺角是釋放角的幾分之幾？', en: 'Undamped pendulum released from at least 60°: press “Pause” at the instant the kinetic energy equals the gravitational potential energy (difference below 4% of the mechanical energy). What fraction of the release angle is the angle then?' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pause' && d.mode === 'pendulum' && !d.damp && d.th0 >= 60 - EPS && halfHalf(d);
      }
    },
    {
      id: 'oscillation-10', level: 8,
      title: { zh: '擺幅減半', en: 'Half the swing' },
      desc: { zh: '開啟單擺的阻尼，讓它擺動 10 次後（第 20 個轉折點），擺幅恰好剩下釋放角的一半（誤差 3% 內）。', en: 'Turn on damping for the pendulum so that after 10 full swings (the 20th turning point) the amplitude is exactly half the release angle (within 3%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'turn' && d.mode === 'pendulum' && d.damp && d.n === 20 && rel(d.amp / d.th0, 0.5, 0.03);
      }
    },
    {
      id: 'oscillation-11', level: 9,
      title: { zh: '兩倍的週期', en: 'Twice the period' },
      desc: { zh: '同一個無阻尼的單擺（擺長、g 不變）：先用不超過 5° 的釋放角量一次週期，再找一個釋放角，讓實測週期恰好是它的 2 倍（誤差 0.3% 內）。', en: 'With the same undamped pendulum (same length and g), measure the period with a release angle of 5° or less, then find a release angle that makes the measured period exactly twice as long (within 0.3%).' },
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
      desc: { zh: '在火星上（g = 3.71 m/s²）讓無阻尼單擺的實測週期恰好是 2.000 s，再讓無阻尼的彈簧振子也量到 2.000 s（兩者都在 ±0.001 s 內）。', en: 'On Mars (g = 3.71 m/s²) make an undamped pendulum’s measured period exactly 2.000 s, and also measure 2.000 s on an undamped spring oscillator (both within ±0.001 s).' },
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
      riddle: { zh: '它在山巔猶豫了好久，才捨得落下。', en: 'It lingers on the summit a long while before it can bear to fall.' },
      check: function (ev) { return isPeriod(ev, 'pendulum') && ev.data.Tm >= 2.3 * ev.data.T0; }
    },
    {
      id: 'oscillation-h2', level: 4, hidden: true,
      riddle: { zh: '最沉重的身軀，倚在最柔軟的臂彎裡，緩緩地呼吸。', en: 'The heaviest body, resting in the softest arms, breathes slowly.' },
      check: function (ev) { return ev.type === 'period' && ev.data.mode === 'spring' && ev.data.Tm >= 8.5; }
    },
    {
      id: 'oscillation-h3', level: 6, hidden: true,
      riddle: { zh: '放手之後，它遲遲不肯回家，卻也從不越過門檻。', en: 'Once let go, it is in no hurry to come home — yet it never steps past the threshold.' },
      check: function (ev) { const d = ev.data; return ev.type === 'settle' && d.regime === 'over' && d.t >= 10 * d.T0; }
    }
  ]);
})();
