/* missions/trig-functions.js — 三角函數：單位圓與正弦波的任務（星星數 = 等級 1–10）
 * 事件（js/trig-functions.js 發出，都在使用者操作之後）：
 *   'angle'：單位圓模式改變角 θ 之後（放開滑桿、打完數字、拖完點 P、按方向鍵、按暫停）。
 *            { src, theta（度）, sin, cos, tan（沒有定義時 NaN）, quadrant（0 = 在坐標軸上）, std（同界角 0–360） }
 *   'wave'：波形模式改變 A、ω、φ、k 之後。{ src, A, w, phi（度）, k, amp, period, max, min, firstMax }
 *   'sum'：疊合模式改變 a、b 之後。{ src, a, b, r, phi（度） }
 *   'match'：挑戰時對準了目標曲線。{ streak（連續對準幾題）, secs（這一題用了幾秒）, last3（最近三題的總秒數，連續不到三題時 NaN）, A, w, phi, k }
 *   'rotate3d'：在 3D 檢視拖曳轉動了視角。'axis3d'：在 3D 檢視轉到順著螺旋線的軸看過去（夾角 < 6°）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const near = function (v, want, tol) { return isFinite(v) && Math.abs(v - want) <= tol; };
  const PI = Math.PI;
  /** 和 y = 2cos x 整條曲線的最大差距（取樣 0–4π） */
  function gapTo2cos(d) {
    let g = 0;
    for (let i = 0; i <= 400; i++) {
      const x = 4 * PI * i / 400;
      g = Math.max(g, Math.abs(d.A * Math.sin(d.w * x + d.phi * PI / 180) + d.k - 2 * Math.cos(x)));
    }
    return g;
  }
  /** 和 y = sin²x 整條曲線的最大差距（取樣 0–4π） */
  function gapToSin2(d) {
    let g = 0;
    for (let i = 0; i <= 400; i++) {
      const x = 4 * PI * i / 400, s = Math.sin(x);
      g = Math.max(g, Math.abs(d.A * Math.sin(d.w * x + d.phi * PI / 180) + d.k - s * s));
    }
    return g;
  }
  /** tan θ = θ（弧度）在 0°～720° 的三個正根（度） */
  const TAN_ROOTS = [257.4534, 442.6243, 624.7602];
  /** cos θ = θ（弧度）的根（Dottie 數 0.739085… 弧度，度） */
  const DOTTIE = 42.3465;
  const SQRT_PHI = Math.sqrt((1 + Math.sqrt(5)) / 2);

  LabMission.register('trig-functions', [
    {
      id: 'trig-functions-1', level: 1,
      title: { zh: '最高的地方', en: 'The highest point' },
      desc: { zh: '在單位圓模式，把點 P 轉到 sin θ 最大的位置（誤差 ±0.5°）。這時 θ 是幾度？', en: 'In unit-circle mode, turn P to where sin θ is largest (within ±0.5°). What is θ there?' },
      check: function (ev) { return ev.type === 'angle' && near(ev.data.std, 90, 0.5); }
    },
    {
      id: 'trig-functions-2', level: 1,
      title: { zh: '螺旋線的影子', en: 'Shadows of a spiral' },
      desc: { zh: '打開「3D 螺旋」檢視，拖曳轉動視角，看看螺旋線投在牆上和地上的影子。', en: 'Open the 3D spiral view and drag to turn it: look at the shadows the spiral casts on the wall and on the floor.' },
      check: function (ev) { return ev.type === 'rotate3d'; }
    },
    {
      id: 'trig-functions-3', level: 2,
      title: { zh: '一半的高度', en: 'Half-way up' },
      desc: { zh: '在單位圓上找出兩個不同的位置，讓 sin θ = 1/2（兩個都要停下來，誤差 ±0.5°）。', en: 'Find two different places on the unit circle where sin θ = 1/2 (stop at each one, within ±0.5°).' },
      check: function (ev, mem) {
        if (ev.type !== 'angle') return false;
        const s = ev.data.std;
        if (near(s, 30, 0.5)) mem.a = true;
        if (near(s, 150, 0.5)) mem.b = true;
        return !!(mem.a && mem.b);
      }
    },
    {
      id: 'trig-functions-4', level: 3,
      title: { zh: '多轉一圈', en: 'One more turn' },
      desc: { zh: '找一個大於 360° 的角，讓它的 sin 和 cos 都和 60° 的一樣（誤差 ±0.5°）。', en: 'Find an angle greater than 360° whose sine and cosine are both the same as those of 60° (within ±0.5°).' },
      check: function (ev) { return ev.type === 'angle' && ev.data.theta > 360 && near(ev.data.std, 60, 0.5); }
    },
    {
      id: 'trig-functions-5', level: 3,
      title: { zh: '又高又快', en: 'Tall and quick' },
      desc: { zh: '在波形模式調出振幅 3、週期 π 的正弦波。', en: 'In wave mode, make a sine wave with amplitude 3 and period π.' },
      check: function (ev) { return ev.type === 'wave' && near(ev.data.amp, 3, 0.001) && near(ev.data.period, PI, 0.01); }
    },
    {
      id: 'trig-functions-6', level: 4,
      title: { zh: '往下的斜率', en: 'Sloping down' },
      desc: { zh: '在 0°～360° 找一個角，讓 tan θ = −1 而且 sin θ 是負的（tan 誤差 ±0.02）。', en: 'Between 0° and 360°, find an angle with tan θ = −1 and a negative sin θ (tan within ±0.02).' },
      check: function (ev) { const d = ev.data; return ev.type === 'angle' && d.theta >= 0 && d.theta < 360 && near(d.tan, -1, 0.02) && d.sin < 0; }
    },
    {
      id: 'trig-functions-7', level: 5,
      title: { zh: '3、4、5', en: '3, 4, 5' },
      desc: { zh: '在疊合模式，讓 a sin x + b cos x 的最大值剛好是 5（誤差 ±0.01），a、b 都不可以是 0。', en: 'In adding mode, make the largest value of a sin x + b cos x exactly 5 (within ±0.01), with neither a nor b equal to 0.' },
      check: function (ev) { const d = ev.data; return ev.type === 'sum' && near(d.r, 5, 0.01) && Math.abs(d.a) >= 0.05 && Math.abs(d.b) >= 0.05; }
    },
    {
      id: 'trig-functions-8', level: 5,
      title: { zh: '最高點在 π/3', en: 'Peak at π/3' },
      desc: { zh: '調出振幅 2、週期 2π、中線 y = 0 的正弦波，而且 x ≥ 0 的第一個最高點恰好在 x = π/3。', en: 'Make a sine wave with amplitude 2, period 2π and midline y = 0 whose first peak at x ≥ 0 is exactly at x = π/3.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'wave' && near(d.amp, 2, 0.001) && near(d.w, 1, 0.001) && near(d.k, 0, 0.001) && near(d.firstMax, PI / 3, 0.01);
      }
    },
    {
      id: 'trig-functions-9', level: 6,
      title: { zh: '對準目標', en: 'On target' },
      desc: { zh: '在波形模式按「挑戰：對準目標曲線」，調整 A、ω、φ、k，讓你的曲線和目標完全重合。', en: 'In wave mode press “Challenge: match a curve” and adjust A, ω, φ and k until your curve lies exactly on the target.' },
      check: function (ev) { return ev.type === 'match' && ev.data.streak >= 1; }
    },
    {
      id: 'trig-functions-10', level: 7,
      title: { zh: '倒過來的餘弦', en: 'Cosine, upside down' },
      desc: { zh: '用負的 A 調出和 y = 2cos x 完全一樣的曲線。', en: 'Using a negative A, make a curve that is exactly the same as y = 2cos x.' },
      check: function (ev) { const d = ev.data; return ev.type === 'wave' && d.A < 0 && gapTo2cos(d) <= 0.01; }
    },
    {
      id: 'trig-functions-11', level: 8,
      title: { zh: '疊合成 2 sin(x + π/3)', en: 'Add up to 2 sin(x + π/3)' },
      desc: { zh: '找出 a、b，讓 a sin x + b cos x = 2 sin(x + π/3)（r 誤差 ±0.005，相位誤差 ±0.2°）。', en: 'Find a and b so that a sin x + b cos x = 2 sin(x + π/3) (r within ±0.005, phase within ±0.2°).' },
      check: function (ev) { const d = ev.data; return ev.type === 'sum' && near(d.r, 2, 0.005) && near(d.phi, 60, 0.2); }
    },
    {
      id: 'trig-functions-12', level: 10,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續對準三條目標曲線（中間不可換題），三題加起來不超過 120 秒。', en: 'Match three target curves in a row (no skipping) with a total time of at most 120 seconds.' },
      check: function (ev) { const d = ev.data; return ev.type === 'match' && d.streak >= 3 && isFinite(d.last3) && d.last3 <= 120; }
    },
    {
      id: 'trig-functions-h1', level: 3, hidden: true,
      riddle: { zh: '海面沒有一絲波紋，卻比岸邊高出一截。', en: 'Not a ripple on the sea, and yet it stands above the shore.' },
      check: function (ev) { const d = ev.data; return ev.type === 'wave' && Math.abs(d.A) < 1e-9 && Math.abs(d.k) >= 0.5; }
    },
    {
      id: 'trig-functions-h2', level: 5, hidden: true,
      riddle: { zh: '走過的路，剛好和拴住你的那條繩子一樣長。', en: 'The road you have walked is exactly as long as the rope that holds you.' },
      check: function (ev) { return ev.type === 'angle' && near(ev.data.theta, 180 / PI, 0.05); }
    },
    {
      id: 'trig-functions-h3', level: 6, hidden: true,
      riddle: { zh: '從盡頭望過去，所有的起伏都只是在原地打轉。', en: 'Seen from the very end, every rise and fall is only going round in circles.' },
      check: function (ev) { return ev.type === 'axis3d'; }
    },
    // ---------- 11/13 補到 10 個隱藏任務（h4–h10；h1–h3 不改） ----------
    {
      // tan 的週期是 180°：連續停在 θ、θ ± 180°、θ ± 360°（同一個方向，誤差 ±0.5°，tan 都有定義）
      id: 'trig-functions-h4', level: 4, hidden: true,
      riddle: { zh: '同一個陡度，每走半圈就再遇到一次；連著遇到三次。', en: 'The same steepness meets you again every half turn; meet it three times in a row.' },
      check: function (ev, mem) {
        if (ev.type !== 'angle') return false;
        const t = ev.data.theta;
        if (!isFinite(ev.data.tan) || Math.abs(Math.cos(t * PI / 180)) < 0.01) { mem.n = 0; return false; }
        const step = mem.n ? t - mem.last : 0;
        if (mem.n && near(Math.abs(step), 180, 0.5) && (mem.n < 2 || step * mem.dir > 0)) { mem.n++; mem.dir = step; }
        else mem.n = 1;
        mem.last = t;
        return mem.n >= 3;
      }
    },
    {
      // ω = π：週期剛好是 2（誤差 ±0.002）。滑桿只到 0.05 的格點，要打字
      id: 'trig-functions-h5', level: 5, hidden: true,
      riddle: { zh: '一來一回剛好兩步，可是決定步伐的那個數，永遠寫不完。', en: 'There and back in exactly two steps, yet the number that sets the stride can never be written out in full.' },
      check: function (ev) { const d = ev.data; return ev.type === 'wave' && d.amp >= 0.1 && near(d.period, 2, 0.002); }
    },
    {
      // a sin x + b cos x = sin(x + 15°)：a = cos 15° = (√6 + √2)／4、b = sin 15° = (√6 − √2)／4（r 誤差 ±0.002、相位 ±0.1°）
      id: 'trig-functions-h6', level: 6, hidden: true,
      riddle: { zh: '長度為一的指針，被地球轉了一個小時。', en: 'A hand of length one, turned by the Earth for one hour.' },
      check: function (ev) { const d = ev.data; return ev.type === 'sum' && near(d.r, 1, 0.002) && near(d.phi, 15, 0.1); }
    },
    {
      // cos θ = θ（弧度）：Dottie 數 0.7391 弧度 = 42.35°（誤差 ±0.06°）；計算機一直按 cos 會停在這裡
      id: 'trig-functions-h7', level: 7, hidden: true,
      riddle: { zh: '把它交給餘弦，餘弦原封不動地還給你。', en: 'Hand it to the cosine, and the cosine hands it right back, untouched.' },
      check: function (ev) { return ev.type === 'angle' && near(ev.data.theta, DOTTIE, 0.06); }
    },
    {
      // 降冪公式 sin²x = (1 − cos 2x)／2 = ½ sin(2x − 90°) + ½：整條曲線和 y = sin²x 重合（差距 ≤ 0.01）
      id: 'trig-functions-h8', level: 8, hidden: true,
      riddle: { zh: '一道浪自己乘上自己，就再也沉不到水面以下；它變成一道快一倍、矮一半的浪。', en: 'A wave multiplied by itself can never sink below the water again; it becomes a wave twice as fast and half as tall.' },
      check: function (ev) { return ev.type === 'wave' && gapToSin2(ev.data) <= 0.01; }
    },
    {
      // 克卜勒三角形：兩股 |a|、|b| 與斜邊 r 成等比（1 : √φ : φ，φ 是黃金比例），長股 ÷ 短股 = √φ（誤差 ±0.0003），短股 ≥ 0.3
      id: 'trig-functions-h9', level: 9, hidden: true,
      riddle: { zh: '一個直角三角形，三條邊一條比一條長出同樣的倍數；有人說古埃及人把它砌成了石頭的斜坡。', en: 'A right triangle whose sides each grow by the same factor; some say the Egyptians built it into a slope of stone.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'sum') return false;
        const s = Math.min(Math.abs(d.a), Math.abs(d.b)), m = Math.max(Math.abs(d.a), Math.abs(d.b));
        return s >= 0.3 && near(m / s, SQRT_PHI, 0.0003);
      }
    },
    {
      // tan θ = θ（弧度）在 0°～720° 的三個正根 257.45°、442.62°、624.76° 都停過（各 ±0.06°，先後不拘）
      id: 'trig-functions-h10', level: 10, hidden: true,
      riddle: { zh: '坡有多陡，你就走了多遠；兩圈之內，這樣的地方有三處，一處都不能少。', en: 'As steep as the slope, so far have you walked; within two turns there are three such places, and you must find every one.' },
      check: function (ev, mem) {
        if (ev.type !== 'angle') return false;
        TAN_ROOTS.forEach(function (r, i) { if (near(ev.data.theta, r, 0.06)) mem['r' + i] = true; });
        return !!(mem.r0 && mem.r1 && mem.r2);
      }
    }
  ]);
})();
