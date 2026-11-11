/* missions/atwood.js — 連體運動與阿特午機的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/atwood.js 發出；SI 單位，角度用度）：
  //   共同欄位 mode（1 阿特午機、2 桌面＋懸掛、3 推拉連體、4 斜面＋懸掛）與該模式的參數：
  //     1：m1, m2, h, v0　2：M, m, muS, muK, d, v0　3：n, push, m1, m2, m3, F, muS, muK, d, v0　4：M, m, theta, muS, muK, d, v0
  //   release：按「釋放」{ moves, dir（+1 正方向、−1 反方向、0 不動）, a（沿正方向）, timing,
  //            模式 1、2、4：T, f（摩擦力，沿正方向）, fKind, fsMax, N；模式 3：link（相鄰木塊之間的力，由左到右） }
  //   impact：撞擊或抵達 { type: 'landB' | 'bumpA' | 'bumpA0' | 'bumpB' | 'finish', v（撞擊速率）, t, n（第幾次）, afterStop（之前曾停下）, a0（第一段的加速度） }
  //   run：量測寫入表格 { timing: 'gate' | 'hand', slow, t（量到的時間）, tTrue, d, aMeas, aTheory, gMeas（模式 1）, dir }
  //   jerk：鬆掉的繩子突然拉緊 { v（拉緊前的相對速率）, slackTime（繩子鬆弛的時間）, rise, n }
  const G = 9.8, EPS = 1e-9;
  const rel = function (x, target, tol) { return Math.abs(x - target) <= tol * Math.abs(target); };
  const near = function (a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); };
  /** 記住最近的事件（供「兩次比較」的任務使用） */
  const keep = function (mem, d, max) {
    const list = mem.list = mem.list || [];
    list.push(d);
    while (list.length > (max || 24)) list.shift();
    return list;
  };

  LabMission.register('atwood', [
    {
      id: 'atwood-1', level: 1,
      title: { zh: '放手！', en: 'Let go!' },
      desc: { zh: '在「阿特午機」釋放，讓 m1 落到地上。', en: 'Release the Atwood machine and let m1 land on the floor.' },
      check: function (ev) { return ev.type === 'impact' && ev.data.mode === 1 && ev.data.type === 'landB'; }
    },
    {
      id: 'atwood-2', level: 2,
      title: { zh: '五分之一的重力', en: 'One fifth of gravity' },
      desc: { zh: '調整阿特午機兩邊的質量後釋放，讓加速度恰好是 g/5 = 1.96 m/s²（誤差 0.5% 內）。', en: 'Choose the two masses of the Atwood machine and release it so that the acceleration is exactly g/5 = 1.96 m/s² (within 0.5%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'release' && d.mode === 1 && d.moves && rel(d.a, G / 5, 0.005);
      }
    },
    {
      id: 'atwood-3', level: 3,
      title: { zh: '搬砝碼的實驗', en: 'The slotted-mass experiment' },
      desc: { zh: '阿特午機的總質量 m1 + m2 保持不變，用三種不同的質量差 Δm 各量一次落下時間（寫進量測紀錄）。', en: 'Keeping the total mass m1 + m2 of the Atwood machine the same, time three releases with three different mass differences Δm (each recorded in the table).' },
      check: function (ev, mem) {
        if (ev.type !== 'run' || ev.data.mode !== 1) return false;
        const d = ev.data, list = keep(mem, { M: d.m1 + d.m2, dm: d.m1 - d.m2 });
        const same = list.filter(function (o) { return near(o.M, d.m1 + d.m2, 0.0015); });
        const dms = [];
        same.forEach(function (o) { if (!dms.some(function (x) { return Math.abs(x - o.dm) < 0.005; })) dms.push(o.dm); });
        return dms.length >= 3;
      }
    },
    {
      id: 'atwood-4', level: 4,
      title: { zh: '剛好拉得動', en: 'Just enough to move it' },
      desc: { zh: '「桌面與懸掛」（μs ≥ 0.20）：先找一個不會動的懸掛質量，再找一個會動的，兩次的木塊與 μs 相同、懸掛質量只差 5 g 以內。', en: 'Table + hanger (μs ≥ 0.20): find a hanging mass that leaves the block at rest and one that moves it — same block and same μs, hanging masses no more than 5 g apart.' },
      check: function (ev, mem) {
        if (ev.type !== 'release' || ev.data.mode !== 2) return false;
        const d = ev.data;
        if (d.muS < 0.2 - EPS) return false;
        const list = keep(mem, { M: d.M, muS: d.muS, m: d.m, moves: d.moves });
        return list.some(function (o) {
          if (!near(o.M, d.M) || !near(o.muS, d.muS) || o.moves === d.moves) return false;
          const still = o.moves ? d : o, go = o.moves ? o : d;
          return go.m > still.m && go.m - still.m <= 0.005 + EPS;
        });
      }
    },
    {
      id: 'atwood-5', level: 4,
      title: { zh: '三比一', en: 'Three to one' },
      desc: { zh: '「推拉連體」用拉的拉動 3 塊木塊，讓右邊那條繩子的張力恰好是左邊那條的 3 倍（誤差 1% 內）。', en: 'Pull three blocks in “Push / pull blocks” so that the right-hand string carries exactly 3 times the tension of the left-hand string (within 1%).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'release' && d.mode === 3 && !d.push && d.n === 3 && d.moves && d.link[0] > 0 && rel(d.link[1] / d.link[0], 3, 0.01);
      }
    },
    {
      id: 'atwood-6', level: 4,
      title: { zh: '以小拉大', en: 'The small pulls the big' },
      desc: { zh: '「斜面與懸掛」（θ ≥ 15°）：懸掛物比木塊輕（m ≤ 0.95 M），卻能把木塊沿斜面往上拉動。', en: 'Incline + hanger (θ ≥ 15°): make a hanging mass lighter than the block (m ≤ 0.95 M) pull the block up the slope.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'release' && d.mode === 4 && d.moves && d.dir === 1 && d.theta >= 15 - EPS && d.m <= 0.95 * d.M + EPS;
      }
    },
    {
      id: 'atwood-7', level: 5,
      title: { zh: '等速前進', en: 'Steady as she goes' },
      desc: { zh: '「桌面與懸掛」（μk ≥ 0.10）：給木塊初速，讓它以等速度（|a| < 0.01 m/s²）一路滑到擋板。', en: 'Table + hanger (μk ≥ 0.10): give the block an initial speed so that it slides all the way to the stopper at constant velocity (|a| < 0.01 m/s²).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'impact' && d.mode === 2 && d.type === 'bumpA' && d.n === 1 && d.v0 > 0 && d.muK >= 0.1 - EPS && Math.abs(d.a0) < 0.01;
      }
    },
    {
      id: 'atwood-8', level: 5,
      title: { zh: '張力不怕摩擦', en: 'Tension ignores friction' },
      desc: { zh: '用同樣的木塊、同樣的拉力 F 拉動兩次，μk 相差至少 0.20，最左邊那條繩子的張力卻相同（誤差 0.5% 內）。', en: 'Pull the same blocks with the same force F twice, with μk differing by at least 0.20, and get the same tension in the left-most string both times (within 0.5%).' },
      check: function (ev, mem) {
        if (ev.type !== 'release' || ev.data.mode !== 3 || ev.data.push || !ev.data.moves) return false;
        const d = ev.data;
        const cur = { n: d.n, m1: d.m1, m2: d.m2, m3: d.m3, F: d.F, muK: d.muK, T: d.link[0] };
        const list = keep(mem, cur);
        return list.some(function (o) {
          return o !== cur && o.n === cur.n && near(o.m1, cur.m1) && near(o.m2, cur.m2) && (cur.n === 2 || near(o.m3, cur.m3)) &&
            near(o.F, cur.F) && Math.abs(o.muK - cur.muK) >= 0.2 - EPS && rel(o.T, cur.T, 0.005);
        });
      }
    },
    {
      id: 'atwood-9', level: 6,
      title: { zh: '去而復返', en: 'There and back again' },
      desc: { zh: '「斜面與懸掛」：讓木塊先沿斜面往上滑、停下來，再滑回去撞到下方的擋板。', en: 'Incline + hanger: make the block slide up the slope, stop, and then slide back down into the lower stopper.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'impact' && d.mode === 4 && d.type === 'bumpA0' && d.afterStop && d.v0 > 0;
      }
    },
    {
      id: 'atwood-10', level: 7,
      title: { zh: '同樣的張力', en: 'The same tension' },
      desc: { zh: '先後釋放兩組會動的阿特午機，總質量相差至少 0.20 kg，繩子張力卻相同（誤差 0.5% 內）。', en: 'Release two Atwood machines that both move, with total masses at least 0.20 kg apart, but with the same string tension (within 0.5%).' },
      check: function (ev, mem) {
        if (ev.type !== 'release' || ev.data.mode !== 1 || !ev.data.moves || Math.abs(ev.data.a) < 0.01) return false;
        const d = ev.data, cur = { M: d.m1 + d.m2, T: d.T };
        return keep(mem, cur).some(function (o) {
          return o !== cur && Math.abs(o.M - cur.M) >= 0.2 - EPS && rel(o.T, cur.T, 0.005);
        });
      }
    },
    {
      id: 'atwood-11', level: 8,
      title: { zh: '手按碼錶量 g', en: 'Measure g by hand' },
      desc: { zh: '用「手按碼錶」（不開慢動作、不暫停）從靜止釋放阿特午機，由量到的時間推算出的 g 與 9.8 m/s² 相差不到 1%。', en: 'With the hand stopwatch (no slow motion, no pausing), release the Atwood machine from rest and get a value of g within 1% of 9.8 m/s² from your measured time.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'run' && d.mode === 1 && d.timing === 'hand' && !d.slow && !d.paused && d.v0 === 0 && d.gMeas != null && rel(d.gMeas, G, 0.01);
      }
    },
    {
      id: 'atwood-12', level: 10,
      title: { zh: '大師：輕輕靠上', en: 'Master: a gentle touch' },
      desc: { zh: '「斜面與懸掛」（θ ≥ 20°）：木塊帶著初速沿斜面往上、一路減速，抵達上方擋板時速率小於 0.05 m/s（但不能在擋板前停下）。', en: 'Incline + hanger (θ ≥ 20°): send the block up the slope with an initial speed so that it slows down all the way and reaches the upper stopper at less than 0.05 m/s (without stopping short).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'impact' && d.mode === 4 && d.type === 'bumpA' && d.n === 1 && !d.afterStop && d.v0 > 0 && d.a0 < 0 && d.theta >= 20 - EPS && d.v < 0.05;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'atwood-h1', level: 4, hidden: true,
      riddle: { zh: '山坡上的一場拔河：兩邊紋風不動，裁判卻一聲哨也沒吹。', en: 'A tug-of-war on the hillside: neither side budges, and the referee never blows the whistle.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'release' && d.mode === 4 && !d.moves && d.muS >= 0.2 - EPS && d.theta >= 10 - EPS && Math.abs(d.f) <= 0.005 * d.M * G;
      }
    },
    {
      id: 'atwood-h2', level: 5, hidden: true,
      riddle: { zh: '天平從不傾斜，它卻一路走到了終點。', en: 'The scales never tip, yet it walks all the way to the end.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'impact' && d.mode === 1 && d.type === 'landB' && d.n === 1 && Math.abs(d.m1 - d.m2) < 0.0005 && d.v0 >= 0.2 - EPS;
      }
    },
    {
      id: 'atwood-h3', level: 6, hidden: true,
      riddle: { zh: '一方安然著地，另一方才嘗到片刻的自由。', en: 'Only when one comes safely to rest does the other taste a moment of freedom.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'jerk' && d.mode === 1 && d.slackTime >= 0.6;
      }
    }
  ]);
})();
