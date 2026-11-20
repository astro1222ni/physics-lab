/* missions/incline-friction.js — 斜面與摩擦力的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/incline-friction.js 發出；SI 單位，角度用度；沿斜面向下為正；外力 F 往上推（水平時：推向斜面）為正）
  // 每個事件都帶有目前的完整狀態：
  //   { surf, theta, thetaC, m, mus, muk, mode: 'along' | 'horiz', F, x, v, t, a, f, N, D, fsMax, fk, P, kind,
  //     freeHold（只靠靜摩擦力就撐得住）, moving, upStart（推得動的最小外力）, hold（撐住不滑的最小外力）,
  //     upConst, downConst, selfLock（水平推不上去）, heat, start: 'top' | 'bottom', epoch, … }
  //   release：按「放手」，另有 v0、holds（v0 = 0 且靜摩擦力撐得住）
  //   rest：放手後木塊靜止時，使用者改了條件（放開滑桿、打完數字、切換選項）
  //   motion：開始一段滑動（放手、開始滑、轉向）或滑動中改了條件，另有 reason
  //   slip：靜止的木塊開始滑動，另有 cause（'release' | 'tilt' | 'raise' | 'force' | 'ramp' | 'mass' | 'surface' | 'mode'）、dir（+1 下、−1 上）
  //   stick：滑動中停下並被靜摩擦力黏住（x）
  //   turn：停下的瞬間立刻往回滑（x）
  //   hit：撞到擋板，另有 end（'bottom' | 'top'）、speed、tRun（放手後的時間）、v0、turned、hitTopBefore、sameEpoch
  //   gates：先後通過兩個光電門，另有 t1、t2、v1、v2（x = 0.5 m 與 1.5 m 處）、dir、sameEpoch、clean、aGate
  //   guess：神秘表面核對答案 { mus, muk, gs, gk, errS, errK }
  const G = 9.8;
  const EPS = 1e-9;
  const restLike = function (ev) {
    return (ev.type === 'release' && ev.data.holds) || (ev.type === 'rest' && ev.data.freeHold && !ev.data.moving);
  };

  LabMission.register('incline-friction', [
    {
      id: 'incline-friction-1', level: 1,
      title: { zh: '溜下去！', en: 'Down it goes!' },
      desc: { zh: '放手後保持設定，讓木塊滑到底端的擋板。', en: 'Release the block and keep the settings fixed until it hits the bottom stop.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'hit' && d.sameEpoch && d.end === 'bottom' && d.speed >= 0.05 - 1e-9;
      }
    },
    {
      id: 'incline-friction-2', level: 2,
      title: { zh: '經典摩擦力圖', en: 'The classic friction graph' },
      desc: { zh: '在水平桌面上，讓外力從零開始「慢慢加力」，直到木塊開始滑動，觀察摩擦力由靜摩擦轉為動摩擦。', en: 'On a level table, start with zero applied force and press “Increase force” until the block slides. Observe the transition from static to kinetic friction.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'slip' && d.cause === 'ramp' && d.rampFromZero && Math.abs(d.theta) < 1e-6;
      }
    },
    {
      id: 'incline-friction-3', level: 2,
      title: { zh: '找到臨界角', en: 'Find the critical angle' },
      desc: { zh: '不加外力，讓靜止的木塊在斜面慢慢變陡時開始下滑，而且開始滑動的角度與臨界角 θc 相差不超過 0.5°。', en: 'With no applied force, let the resting block start to slide as the incline gets steeper, slipping within 0.5° of the critical angle θc.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'slip' && (d.cause === 'tilt' || d.cause === 'raise') && d.dir === 1 && Math.abs(d.F) < EPS && Math.abs(d.theta - d.thetaC) <= 0.5;
      }
    },
    {
      id: 'incline-friction-4', level: 3,
      title: { zh: '輕輕撐住', en: 'Just enough to hold it' },
      desc: { zh: '斜面比臨界角陡至少 5° 時，沿斜面往上推，剛好讓木塊靜止不滑：推力只能比「剛好撐住」的最小推力多 2% 以內。', en: 'On a slope at least 5° steeper than the critical angle, push up along the incline just hard enough to keep the block at rest: no more than 2% above the smallest force that can hold it.' },
      check: function (ev) {
        const d = ev.data;
        return restLike(ev) && d.mode === 'along' && d.F > 0 && d.theta >= d.thetaC + 5 - EPS && d.hold > 0 && d.F <= d.hold * 1.02 + EPS;
      }
    },
    {
      id: 'incline-friction-5', level: 4,
      title: { zh: '等速下滑', en: 'Constant velocity' },
      desc: { zh: '不加外力，讓木塊以等速度往下滑過兩個光電門：兩處的速率都至少 0.2 m/s，相差不超過 1%。', en: 'With no applied force, make the block slide down through both photogates at constant velocity: at least 0.2 m/s at each gate, with the two speeds within 1% of each other.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'gates' && d.dir === 1 && d.sameEpoch && Math.abs(d.F) < EPS &&
          Math.min(d.v1, d.v2) >= 0.2 && Math.abs(d.v2 - d.v1) <= 0.01 * d.v1;
      }
    },
    {
      id: 'incline-friction-6', level: 5,
      title: { zh: '最小的推力', en: 'The smallest push' },
      desc: { zh: '木塊靜止時，用滑桿或輸入數值（不用「慢慢加力」）把沿斜面往上的推力一點一點調大，讓木塊在推力只比「推得動」的最小值多 0.3% 以內（或 0.05 N 以內）時開始往上滑。', en: 'With the block at rest, raise the push up along the incline step by step with the slider or typed values (not “Increase force”), so that it starts to slide up when the push is no more than 0.3% (or 0.05 N) above the minimum needed.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'slip' && d.cause === 'force' && d.mode === 'along' && d.dir === -1 && isFinite(d.upStart) &&
          d.F <= d.upStart + Math.max(0.05, 0.003 * d.upStart);
      }
    },
    {
      id: 'incline-friction-7', level: 5,
      title: { zh: '加速度 1 m/s²', en: 'An acceleration of 1 m/s²' },
      desc: { zh: '用外力把木塊往上推，使它沿斜面向上的加速度恰好是 1.00 m/s²（誤差 ±0.02）；木塊已經在往上滑時調整推力也算。', en: 'Push the block up the slope so that its acceleration up the incline is exactly 1.00 m/s² (±0.02); adjusting the push while it is already sliding up also counts.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'motion' && d.v < 0 && d.F > 0 && Math.abs(d.a + 1) <= 0.02;
      }
    },
    {
      id: 'incline-friction-8', level: 6,
      title: { zh: '神秘表面：μs', en: 'Mystery surface: μs' },
      desc: { zh: '選「神秘表面」，自己量出靜摩擦係數 μs，核對時誤差在 2% 以內。', en: 'Choose the “Mystery surface”, measure its coefficient of static friction μs yourself, and check it within 2%.' },
      check: function (ev) { return ev.type === 'guess' && ev.data.errS != null && ev.data.errS <= 0.02; }
    },
    {
      id: 'incline-friction-9', level: 7,
      title: { zh: '停在光電門 2', en: 'Stop at gate 2' },
      desc: { zh: '讓滑動中的木塊減速、停住，而且停在光電門 2 的正下方（x = 1.50 m，誤差 1 cm 內）。', en: 'Make a sliding block slow down and come to rest right under photogate 2 (x = 1.50 m, within 1 cm).' },
      check: function (ev) { return ev.type === 'stick' && Math.abs(ev.data.x - 1.5) <= 0.01; }
    },
    {
      id: 'incline-friction-10', level: 8,
      title: { zh: '神秘表面：μk', en: 'Mystery surface: μk' },
      desc: { zh: '選「神秘表面」，自己量出動摩擦係數 μk（例如用光電門量下滑加速度），核對時誤差在 2% 以內。', en: 'Choose the “Mystery surface”, measure its coefficient of kinetic friction μk yourself (for example from the acceleration timed by the photogates), and check it within 2%.' },
      check: function (ev) { return ev.type === 'guess' && ev.data.errK != null && ev.data.errK <= 0.02; }
    },
    {
      id: 'incline-friction-11', level: 9,
      title: { zh: '水平推上坡', en: 'Horizontal push, steady climb' },
      desc: { zh: '用水平外力讓木塊以等速度往上滑過兩個光電門：兩處的速率都至少 0.2 m/s，相差不超過 1%。', en: 'With a horizontal force, make the block climb through both photogates at constant velocity: at least 0.2 m/s at each gate, with the two speeds within 1% of each other.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'gates' || d.mode !== 'horiz' || d.dir !== -1 || !d.sameEpoch || !(d.F > 0)) return false;
        const a = Math.abs(d.v1), b = Math.abs(d.v2);
        return Math.min(a, b) >= 0.2 && Math.abs(a - b) <= 0.01 * Math.max(a, b);
      }
    },
    {
      id: 'incline-friction-12', level: 10,
      title: { zh: '大師：來回 1.50 秒', en: 'Master: there and back in 1.50 s' },
      desc: { zh: '從木板底端把木塊往上射出，不加外力、射出後不改任何條件，讓它上去、停下、再滑回來，恰好在放手後 1.50 s（±0.02 s）撞回下端擋板，途中不能碰到上端。', en: 'Launch the block up from the bottom of the board with no applied force and change nothing after the launch, so that it goes up, stops, slides back and hits the bottom stop exactly 1.50 s (±0.02 s) after release, without touching the top.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'hit' && d.end === 'bottom' && d.start === 'bottom' && d.v0 < 0 && d.turned && !d.hitTopBefore &&
          d.sameEpoch && Math.abs(d.F) < EPS && Math.abs(d.tRun - 1.5) <= 0.02;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'incline-friction-h1', level: 6, hidden: true,
      riddle: { zh: '峭壁上沒有一級台階，只憑一掌，它便不墜。', en: 'Not a single step on the sheer face — yet a single palm keeps it from falling.' },
      check: function (ev) {
        const d = ev.data;
        return restLike(ev) && (ev.type === 'rest' || d.manual) && d.mode === 'horiz' && d.theta >= 89.95 - EPS && d.F > 0;
      }
    },
    {
      id: 'incline-friction-h2', level: 7, hidden: true,
      riddle: { zh: '力氣再大，也只換來它更深的沉默。', en: 'However great the strength, it only buys a deeper silence.' },
      check: function (ev) { const d = ev.data; return restLike(ev) && d.mode === 'horiz' && d.selfLock && d.theta <= 85 && d.F >= 50; }
    },
    {
      id: 'incline-friction-h3', level: 4, hidden: true,
      riddle: { zh: '兩股力氣暗中角力，第三者袖手旁觀。', en: 'Two forces wrestle in silence, while the third stands by with folded arms.' },
      check: function (ev) { const d = ev.data; return restLike(ev) && d.theta >= 10 && d.F > 0 && Math.abs(d.f) <= 0.01; }
    },
{
  id: 'incline-friction-h4', level: 3, hidden: true,
  riddle: { zh: '鴻毛與泰山，在同一道坡度上鬆開了手。', en: 'A feather and a mountain let go at the very same tilt.' },
  check: function (ev, mem) {
    const d = ev.data;
    if (ev.type !== 'slip' || !(d.cause === 'raise' || d.cause === 'tilt') || d.dir !== 1 || Math.abs(d.F) > EPS) return false;
    if (Math.abs(d.theta - d.thetaC) > 0.3) return false;
    const key = d.mus.toFixed(4), list = mem[key] || (mem[key] = []);
    list.push(d.m);
    return Math.max.apply(null, list) - Math.min.apply(null, list) >= 3 - 1e-9;
  }
},
{
  id: 'incline-friction-h5', level: 5, hidden: true,
  riddle: { zh: '向上的心意遇上向下的挽留；挽留已用盡全力，卻仍守住原地。', en: 'An upward wish meets a downward hold; the hold is at full stretch, yet it keeps its ground.' },
  check: function (ev) {
    const d = ev.data;
    return restLike(ev) && d.mode === 'along' && d.F > 0 && d.theta >= 10 && d.fsMax > 0 && d.f >= 0.99 * d.fsMax;
  }
},
{
  id: 'incline-friction-h6', level: 6, hidden: true,
  riddle: { zh: '明明站在坡上，腳底卻覺得仍是平地。', en: 'Standing on a slope, yet its feet feel level ground.' },
  check: function (ev) {
    const d = ev.data, mg = d.m * G;
    return restLike(ev) && d.mode === 'horiz' && d.F > 0 && d.theta >= 15 && d.theta <= 80 && !d.selfLock &&
      Math.abs(d.N - mg) <= 0.002 * mg;
  }
},
{
  id: 'incline-friction-h7', level: 7, hidden: true,
  riddle: { zh: '出門帶著滿袋金幣，回家只剩四分之一；其餘都留在路上，暖了地面。', en: 'It set out with a full purse and came home with a quarter; the rest stayed on the road, warming the ground.' },
  check: function (ev) {
    const d = ev.data;
    return ev.type === 'hit' && d.end === 'bottom' && d.start === 'bottom' && d.v0 < -0.5 && d.turned && !d.hitTopBefore &&
      d.sameEpoch && Math.abs(d.F) < EPS && Math.abs(d.speed / Math.abs(d.v0) - 0.5) <= 0.005;
  }
},
{
  id: 'incline-friction-h8', level: 8, hidden: true,
  riddle: { zh: '離那道看不見的牆只剩四步，仍有人被送上了山。', en: 'Only four paces short of the invisible wall, someone was still sent up the hill.' },
  check: function (ev) {
    const d = ev.data;
    return ev.type === 'slip' && d.dir === -1 && d.mode === 'horiz' && d.mus >= 0.1 && d.theta + d.thetaC >= 86 - 1e-9;
  }
},
{
  id: 'incline-friction-h9', level: 9, hidden: true,
  riddle: { zh: '看不見的兩道指紋，第一眼就被你描得分毫不差。', en: 'Two invisible fingerprints, traced without a hair\u2019s error at the very first look.' },
  check: function (ev) {
    const d = ev.data;
    return ev.type === 'guess' && d.tries === 2 && d.errS != null && d.errK != null && d.errS <= 0.005 && d.errK <= 0.005;
  }
},
{
  id: 'incline-friction-h10', level: 10, hidden: true,
  riddle: { zh: '兩種質地，各選一道坡，從此跑出同一個節奏。', en: 'Two different grains each choose their own slope \u2014 and then run to the very same beat.' },
  check: function (ev, mem) {
    const d = ev.data;
    if (ev.type !== 'gates' || !d.clean || d.dir !== 1 || !(d.aGate > 0) || Math.abs(d.F) > EPS) return false;
    const list = mem.list || (mem.list = []);
    const hit = list.some(function (q) {
      return Math.abs(q.muk - d.muk) >= 0.05 && Math.abs(q.theta - d.theta) >= 1 && Math.abs(d.aGate - q.a) <= 0.003 * q.a;
    });
    list.push({ muk: d.muk, theta: d.theta, a: d.aGate });
    if (list.length > 40) list.shift();
    return hit;
  }
}
  ]);
})();
