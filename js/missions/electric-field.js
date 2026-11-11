/* missions/electric-field.js — 電場與等位線的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/electric-field.js 發出；位置 cm、電量 nC、電場 N/C、電位 V、能量 J、速率 cm/s）：
  //   probe：試探電荷沒有在運動時，使用者放好試探電荷，或改了場源（電量、間距、拖曳電荷）之後
  //          { key, qA, qB, xA, yA, xB, yB, d, x, y, q, m, ex, ey, E, Esum, dir, V, Vsum }
  //          Esum = 各電荷單獨在該處的電場大小總和；Vsum = 各電荷電位絕對值總和；dir = E 的方向角（由 +x 逆時針，度）
  //   release：從起點靜止釋放 { …同上…, V0, total0 }
  //   pause：運動中按「暫停」{ …目前位置的量…, x0, y0, V0, v, K, U, total, total0, clean }
  //   return：靜止釋放後離開起點至少 1 cm，又回到起點 0.15 cm 內 { x0, y0, dist, maxDist, qA, qB, q, m, clean }
  //   end：撞上電荷或離開畫面 { …最後位置的量…, reason: 'hit' | 'out', hitQ, v, K, U, total, x0, y0, V0, total0, sig, clean }
  // clean = 這一趟釋放後沒有改過任何電量、質量、間距，也沒有拖曳電荷（能量守恆才成立）。
  // sig = 場源電荷的位置與電量（判斷「同樣的場」）。
  const EPS = 1e-9;
  const same = function (a, b) { return Math.abs(a - b) <= EPS; };
  const opposite = function (d) { return d.qA * d.qB < 0; };
  /** 兩電荷電量大小至少差 0.5 nC（避免「幾乎等量」的情形混過去） */
  const unequal = function (d) { return Math.abs(Math.abs(d.qA) - Math.abs(d.qB)) >= 0.5 - EPS; };
  const up = function (d, tol) { return isFinite(d.dir) && Math.abs(d.dir - 90) <= tol; };
  const ended = function (ev, reason) { return ev.type === 'end' && ev.data.clean && ev.data.reason === reason; };

  LabMission.register('electric-field', [
    {
      id: 'electric-field-1', level: 1,
      title: { zh: '異性相吸', en: 'Opposites attract' },
      desc: { zh: '把正的試探電荷放在靜止的位置後釋放，讓它一路被吸過去，撞上帶負電的場源電荷。', en: 'Place a positive test charge, release it from rest, and let it be pulled all the way into a negatively charged source charge.' },
      check: function (ev) { const d = ev.data; return ended(ev, 'hit') && d.q > 0 && d.hitQ < 0; }
    },
    {
      id: 'electric-field-2', level: 2,
      title: { zh: '同性相斥', en: 'Like charges repel' },
      desc: { zh: '只留下一個場源電荷（另一個電量設為 0），釋放一個與它同號的試探電荷，看它被推出畫面。', en: 'Keep only one source charge (set the other to 0), release a test charge of the same sign, and watch it get pushed off the screen.' },
      check: function (ev) {
        const d = ev.data;
        return ended(ev, 'out') && (d.qA === 0) !== (d.qB === 0) && d.q * (d.qA + d.qB) > 0;
      }
    },
    {
      id: 'electric-field-3', level: 3,
      title: { zh: '逃出電偶極', en: 'Escape the dipole' },
      desc: { zh: '在等量異號的電偶極中，靜止釋放一個「負」的試探電荷，讓它不撞上任何電荷、直接離開畫面。', en: 'In a dipole of equal and opposite charges, release a negative test charge from rest so that it leaves the screen without hitting either charge.' },
      check: function (ev) { const d = ev.data; return ended(ev, 'out') && d.q < 0 && d.qA !== 0 && same(d.qA, -d.qB); }
    },
    {
      id: 'electric-field-4', level: 3,
      title: { zh: '互相抵消的電場', en: 'Fields that cancel' },
      desc: { zh: '兩個等量同號電荷：把試探電荷放在電場為零的地方（|E| 小於 A、B 各自在該處電場大小總和的 5%）。', en: 'With two equal like charges, put the test charge where the field is zero (|E| below 5% of the sum of the field strengths A and B produce there separately).' },
      check: function (ev) { const d = ev.data; return ev.type === 'probe' && d.qA !== 0 && same(d.qA, d.qB) && d.E <= 0.05 * d.Esum; }
    },
    {
      id: 'electric-field-5', level: 4,
      title: { zh: '不在中間的零電位', en: 'Zero potential off-centre' },
      desc: { zh: '兩電荷異號、電量大小至少差 0.5 nC，把試探電荷放在電位為零的地方（|V| 小於兩電荷各自電位大小總和的 2%）。', en: 'With opposite charges whose sizes differ by at least 0.5 nC, put the test charge where the potential is zero (|V| below 2% of the sum of the sizes of the two separate potentials).' },
      check: function (ev) { const d = ev.data; return ev.type === 'probe' && opposite(d) && unequal(d) && Math.abs(d.V) <= 0.02 * d.Vsum; }
    },
    {
      id: 'electric-field-6', level: 5,
      title: { zh: '電場朝正上方', en: 'Field pointing straight up' },
      desc: { zh: '兩電荷異號：找一個點，讓那裡的電場方向恰好朝正上方（90° ± 1°）。', en: 'With opposite charges, find a point where the field points straight up (90° ± 1°).' },
      check: function (ev) { const d = ev.data; return ev.type === 'probe' && opposite(d) && up(d, 1); }
    },
    {
      id: 'electric-field-7', level: 6,
      title: { zh: '速率加倍', en: 'Double the speed' },
      desc: { zh: '從同一個起點、在同樣的場中連續釋放兩次，兩次都離開畫面，而且第二次離開時的速率恰好是第一次的 2 倍（誤差 2% 內）。', en: 'Release twice in a row from the same starting point in the same field; both times the test charge must leave the screen, and the second exit speed must be exactly twice the first (within 2%).' },
      check: function (ev, mem) {
        if (!ended(ev, 'out')) return false;
        const d = ev.data, p = mem.last;
        mem.last = { x0: d.x0, y0: d.y0, sig: d.sig, v: d.v };
        return !!p && p.sig === d.sig && same(p.x0, d.x0) && same(p.y0, d.y0) && p.v > 0 && Math.abs(d.v / p.v - 2) <= 0.04;
      }
    },
    {
      id: 'electric-field-8', level: 6,
      title: { zh: '跨過零電位', en: 'Crossing zero potential' },
      desc: { zh: '在異號電荷的場中，從 |V| ≥ 500 V 的地方靜止釋放，在試探電荷穿越 0 V 等位線的瞬間按「暫停」（|V| 不到起點的 5%），看看此時的動能是不是等於起點的電位能 qV。', en: 'In the field of opposite charges, release the test charge from rest where |V| ≥ 500 V, and press “Pause” just as it crosses the 0 V equipotential (|V| below 5% of its starting value). Is its kinetic energy now equal to its starting potential energy qV?' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pause' && d.clean && opposite(d) && Math.abs(d.V0) >= 500 && Math.abs(d.V) <= 0.05 * Math.abs(d.V0);
      }
    },
    {
      id: 'electric-field-9', level: 7,
      title: { zh: '連線外側的零電場點', en: 'A null point outside' },
      desc: { zh: '兩電荷異號、電量大小至少差 0.5 nC：找出電場為零的地方（|E| 小於 A、B 各自電場大小總和的 3%），把試探電荷放在那裡。', en: 'With opposite charges whose sizes differ by at least 0.5 nC, find where the field is zero (|E| below 3% of the sum of the separate field strengths) and put the test charge there.' },
      check: function (ev) { const d = ev.data; return ev.type === 'probe' && opposite(d) && unequal(d) && d.E <= 0.03 * d.Esum; }
    },
    {
      id: 'electric-field-10', level: 8,
      title: { zh: '五微焦耳出場', en: 'Leave with five microjoules' },
      desc: { zh: '靜止釋放試探電荷，讓它離開畫面時的動能恰好是 5.000 μJ（誤差 2% 內）。', en: 'Release the test charge from rest so that it leaves the screen with a kinetic energy of exactly 5.000 μJ (within 2%).' },
      check: function (ev) { return ended(ev, 'out') && Math.abs(ev.data.K - 5e-6) <= 0.02 * 5e-6; }
    },
    {
      id: 'electric-field-11', level: 9,
      title: { zh: '一萬牛頓每庫侖，朝上', en: 'Ten thousand N/C, upward' },
      desc: { zh: '在等量異號的電偶極中，讓試探電荷所在處的電場朝正上方（90° ± 1°），而且大小恰好是 10000 N/C（誤差 2% 內）。', en: 'In a dipole of equal and opposite charges, make the field at the test charge point straight up (90° ± 1°) with a strength of exactly 10,000 N/C (within 2%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'probe' && d.qA !== 0 && same(d.qA, -d.qB) && up(d, 1) && Math.abs(d.E - 1e4) <= 200;
      }
    },
    {
      id: 'electric-field-12', level: 10,
      title: { zh: '大師：零電位上的正上方', en: 'Master: straight up at zero potential' },
      desc: { zh: '找一個電位為零（|V| 小於兩電荷各自電位大小總和的 1%）、而且電場恰好朝正上方（90° ± 1°）的點，把試探電荷放在那裡。', en: 'Find a point where the potential is zero (|V| below 1% of the sum of the sizes of the two separate potentials) and the field points straight up (90° ± 1°), and put the test charge there.' },
      check: function (ev) { const d = ev.data; return ev.type === 'probe' && opposite(d) && Math.abs(d.V) <= 0.01 * d.Vsum && up(d, 1); }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'electric-field-h1', level: 6, hidden: true,
      riddle: { zh: '一對雙胞胎之間，影子去了又回，從不停歇。', en: 'Between a pair of twins, a shadow goes and comes back, never resting.' },
      check: function (ev) { const d = ev.data; return ev.type === 'return' && d.clean && d.qA * d.qB > 0; }
    },
    {
      id: 'electric-field-h2', level: 4, hidden: true,
      riddle: { zh: '最熾熱的擁抱，旁人卻幾乎感覺不到。', en: 'The fiercest embrace — and those nearby can barely feel it.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'probe' && d.qA * d.qB < 0 && same(Math.abs(d.qA), 5) && same(Math.abs(d.qB), 5) && d.d <= 1 + EPS;
      }
    },
    {
      id: 'electric-field-h3', level: 7, hidden: true,
      riddle: { zh: '從最高的山巔一路墜進最深的谷底，快得像一道閃電。', en: 'From the highest peak all the way down into the deepest valley, swift as a bolt of lightning.' },
      check: function (ev) { return ended(ev, 'hit') && ev.data.v >= 60; }
    }
  ]);
})();
