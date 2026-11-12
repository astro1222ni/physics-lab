/* missions/derivative.js — 導數與切線的任務（星星數 = 等級 1–10）
 * 事件（js/derivative.js 發出，都在使用者操作之後）：
 *   'state'：切點、間隔、函數或勾選項改完之後（拖曳放開、滑桿放開、按鍵、按鈕）。
 *            { fn（'cubic' | 'sin' | 'exp' | 'ln' | 'abs'）, k（三次函數係數 {a, b, c, d}）, x（切點 a）, h（有正負）,
 *              fa（f(a)）, dq（差商）, sq（對稱差商）, sym（有沒有勾對稱差商）, d1（f′(a)，不可微時 null）, d2（f″(a)）,
 *              err（|差商 − f′(a)|）, errSym（|對稱差商 − f′(a)|）, chal（挑戰中）, tan（切線有顯示）,
 *              b（切線的 y 截距，沒有切線時 null）, roots（三次函數的相異實根，其他函數 null） }
 *   'shrink'：「讓 h → 0」動畫跑完。{ fn, from（開始的 |h|）, to（結束的 |h|） }
 *   'trace'：沿著曲線走完、或拖曳放開後。{ fn, k, coverage（導函數描出來的比例 0–1） }
 *   'challenge'：挑戰對準一題。{ fn, m, time（秒）, streak（連續對準幾題）, last3（最近三題的總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };

  LabMission.register('derivative', [
    {
      id: 'derivative-1', level: 1,
      title: { zh: '割線變切線', en: 'From secant to tangent' },
      desc: { zh: '把間隔 h 縮小到 0.01 以下，看割線幾乎和切線重合。', en: 'Shrink the gap h below 0.01 and watch the secant all but merge with the tangent.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && !d.chal && d.dq != null && Math.abs(d.h) <= 0.01 + 1e-12; }
    },
    {
      id: 'derivative-2', level: 2,
      title: { zh: '越靠越近', en: 'Closer and closer' },
      desc: { zh: '從 h ≥ 1 開始，按「讓 h → 0」，一路看到 h = 0.001。', en: 'Starting from h ≥ 1, press “Let h → 0” and follow it all the way to h = 0.001.' },
      check: function (ev) { const d = ev.data; return ev.type === 'shrink' && d.from >= 1 - 1e-9 && d.to <= 0.0011; }
    },
    {
      id: 'derivative-3', level: 2,
      title: { zh: '山頂的切線', en: 'The tangent at the top' },
      desc: { zh: '把切點放在一個山頂（局部最高點），讓切線斜率在 ±0.01 以內。', en: 'Put the point on a peak (a local maximum) so that the tangent slope is within ±0.01 of zero.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && !d.chal && d.d1 != null && Math.abs(d.d1) <= 0.01 && d.d2 != null && d.d2 < -0.05; }
    },
    {
      id: 'derivative-4', level: 3,
      title: { zh: '左右不一樣', en: 'Left is not right' },
      desc: { zh: '在 |x| 的尖角 a = 0，h 在 0.01 以內，從右邊和左邊各看一次割線斜率。', en: 'At the corner of |x|, a = 0, with |h| at most 0.01, look at the secant slope from the right and from the left.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'state' || d.fn !== 'abs' || Math.abs(d.x) > 1e-9 || Math.abs(d.h) > 0.01 + 1e-12 || d.dq == null) return false;
        if (near(d.dq, 1, 1e-9)) mem.r = true;
        if (near(d.dq, -1, 1e-9)) mem.l = true;
        return !!(mem.r && mem.l);
      }
    },
    {
      id: 'derivative-5', level: 4,
      title: { zh: '正弦的導數', en: 'The derivative of sine' },
      desc: { zh: '沿著 sin x 走，把導函數描出至少 90%。', en: 'Walk along sin x and trace at least 90% of its derivative.' },
      check: function (ev) { return ev.type === 'trace' && ev.data.fn === 'sin' && ev.data.coverage >= 0.9; }
    },
    {
      id: 'derivative-6', level: 4,
      title: { zh: '反過來想', en: 'Working backwards' },
      desc: { zh: '調出一個三次函數，讓它的導函數是 f′(x) = 3x² − 6x。', en: 'Set up a cubic whose derivative is f′(x) = 3x² − 6x.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'state' && d.fn === 'cubic' && near(d.k.a, 1, 1e-9) && near(d.k.b, -3, 1e-9) && near(d.k.c, 0, 1e-9);
      }
    },
    {
      id: 'derivative-7', level: 5,
      title: { zh: '穿過原點的切線', en: 'A tangent through the origin' },
      desc: { zh: '在 eˣ 上找一點，讓那裡的切線通過原點（y 截距在 ±0.01 以內）。', en: 'Find the point on eˣ whose tangent passes through the origin (y-intercept within ±0.01).' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.fn === 'exp' && d.tan && near(d.b, 0, 0.01); }
    },
    {
      id: 'derivative-8', level: 6,
      title: { zh: '停一下再走', en: 'A pause on the way up' },
      desc: { zh: '調出一個三次函數（x³ 的係數不為 0），找到一點，切線水平、而且曲線在那裡由彎向下轉成彎向上（或反過來）：|f′| ≤ 0.01、|f″| ≤ 0.02。', en: 'Set up a cubic (with a non-zero x³ coefficient) and find a point where the tangent is horizontal and the curve switches the way it bends: |f′| ≤ 0.01 and |f″| ≤ 0.02.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'state' && !d.chal && d.fn === 'cubic' && Math.abs(d.k.a) > 1e-9 && d.d1 != null && Math.abs(d.d1) <= 0.01 && Math.abs(d.d2) <= 0.02;
      }
    },
    {
      id: 'derivative-9', level: 5,
      title: { zh: '對稱的威力', en: 'The power of symmetry' },
      desc: { zh: '勾選對稱差商，h 至少 0.1，讓對稱差商和 f′(a) 相差不到 0.001，而單邊差商卻差了至少 0.01。', en: 'Turn on the symmetric quotient and, with h at least 0.1, get it within 0.001 of f′(a) while the one-sided quotient is off by at least 0.01.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'state' && !d.chal && d.sym && Math.abs(d.h) >= 0.1 - 1e-12 && d.errSym != null && d.errSym <= 0.001 && d.err != null && d.err >= 0.01;
      }
    },
    {
      id: 'derivative-10', level: 6,
      title: { zh: '對準斜率', en: 'Find the slope' },
      desc: { zh: '按「出一題」，找到切線斜率等於目標值的點。', en: 'Press “New challenge” and find the point where the tangent has the target slope.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'derivative-11', level: 7,
      title: { zh: '對數的切線', en: 'A tangent to the logarithm' },
      desc: { zh: '在 ln x 上找一點，讓那裡的切線通過原點（y 截距在 ±0.002 以內）。', en: 'Find the point on ln x whose tangent passes through the origin (y-intercept within ±0.002).' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.fn === 'ln' && d.tan && near(d.b, 0, 0.002); }
    },
    {
      id: 'derivative-12', level: 9,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '挑戰連續對準三題（中間不換題、不放棄），三題加起來不超過 45 秒。', en: 'Solve three challenges in a row (no skipping, no giving up) in 45 seconds or less in total.' },
      check: function (ev) { const d = ev.data; return ev.type === 'challenge' && d.streak >= 3 && d.last3 != null && d.last3 <= 45; }
    },
    {
      id: 'derivative-h1', level: 4, hidden: true,
      riddle: { zh: '描出來的影子，和本人一模一樣。', en: 'The shadow it traces is the very image of itself.' },
      check: function (ev) { return ev.type === 'trace' && ev.data.fn === 'exp' && ev.data.coverage >= 0.9; }
    },
    {
      id: 'derivative-h2', level: 5, hidden: true,
      riddle: { zh: '左右各退一步，算出來的平衡卻是騙人的。', en: 'Step back once on each side, and the balance you compute is a lie.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.fn === 'abs' && Math.abs(d.x) < 1e-9 && d.sym && near(d.sq, 0, 1e-12); }
    },
    {
      id: 'derivative-h3', level: 7, hidden: true,
      riddle: { zh: '站在兩個朋友的正中間，伸手一指，正好指向第三個朋友。', en: 'Stand exactly halfway between two friends, point straight ahead, and you point at the third.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'state' || d.fn !== 'cubic' || !d.tan || !d.roots || d.roots.length !== 3) return false;
        const r = d.roots;
        if (r[1] - r[0] < 0.3 || r[2] - r[1] < 0.3) return false;
        return [[0, 1], [0, 2], [1, 2]].some(function (p) { return Math.abs(d.x - (r[p[0]] + r[p[1]]) / 2) <= 0.01; });
      }
    }
  ]);
})();
