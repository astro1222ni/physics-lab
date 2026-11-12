/* missions/action-potential.js — 神經的動作電位的任務（星星數 = 等級 1–10）
 * 事件（js/action-potential.js 送出）：
 *   'stim'：膜片的一次刺激結束時。mode（single／paired／step）、a1、a2、dur、gap、T、ttx、tea、kOut、naOut、env（環境代號）、
 *           rest、n（動作電位數）、fired1、fired2、peak1、peak2、rise、amp1、halfWidth、thr（目前環境與寬度下的閾值）、
 *           a2alone（第二個脈衝單獨給會不會發）、rate（反覆發放的頻率）、lat（刺激開始到第一個峰值）
 *   'cable'：軸突傳導結束時。diam、myelin、T、env、nStim、xs、r1、r2、dist、v（m/s，量不到為 null）、clean（量法標準）、
 *           reachedFar、left、right、collided、vRef（同條件但沒有河豚毒素的速度，只在 ttx > 0 時有）
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const single = function (ev) { return ev.type === 'stim' && ev.data.mode === 'single'; };
  const goodV = function (d) { return d.v != null && isFinite(d.v) && d.v > 0 && d.clean && d.nStim === 1; };
  const sameD = function (a, b) { return Math.abs(a / b - 1) < 0.01; };
  function remember(mem, key, item, max) {
    const a = mem[key] || (mem[key] = []);
    a.push(item);
    if (a.length > (max || 30)) a.shift();
    return a;
  }

  LabMission.register('action-potential', [
    {
      id: 'action-potential-1', level: 1,
      title: { zh: '第一個動作電位', en: 'Your first action potential' },
      desc: { zh: '用單一脈衝刺激細胞膜，引發一個動作電位：膜電位從 −65 mV 衝到正值又落回來。', en: 'Stimulate the membrane with a single pulse and set off an action potential: the voltage leaps from −65 mV to positive and falls back.' },
      check: function (ev) { return single(ev) && ev.data.fired1; }
    },
    {
      id: 'action-potential-2', level: 2,
      title: { zh: '差一點點', en: 'Not quite' },
      desc: { zh: '給一個去極化的單一脈衝，讓膜電位至少上升 5 mV，卻沒有引發動作電位。', en: 'Give a single depolarising pulse that lifts the membrane by at least 5 mV but does not set off an action potential.' },
      check: function (ev) { const d = ev.data; return single(ev) && d.a1 > 0 && d.n === 0 && d.rise >= 5; }
    },
    {
      id: 'action-potential-3', level: 3,
      title: { zh: '全有全無', en: 'All or nothing' },
      desc: { zh: '在同樣的溫度、離子與藥物條件、同樣的脈衝寬度下，用兩個相差至少 3 倍的強度各引發一個動作電位，而且兩個峰值相差不到 5 mV。刺激加大三倍，動作電位幾乎沒有變大。', en: 'Under the same temperature, ions and drugs and the same pulse width, fire one action potential with a stimulus and another with one at least 3 times stronger — with peaks less than 5 mV apart. Triple the stimulus, and the spike hardly grows.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!(single(ev) && d.fired1 && d.a1 > 0)) return false;
        const prev = (mem.fired || []).filter(function (p) { return p.env === d.env && Math.abs(p.dur - d.dur) < 1e-6; });
        const ok = prev.some(function (p) { const r = Math.max(p.a1, d.a1) / Math.min(p.a1, d.a1); return r >= 3 && Math.abs(p.peak - d.peak1) < 5; });
        remember(mem, 'fired', { env: d.env, dur: d.dur, a1: d.a1, peak: d.peak1 });
        return ok;
      }
    },
    {
      id: 'action-potential-4', level: 3,
      title: { zh: '量傳導速度', en: 'Clock the impulse' },
      desc: { zh: '在軸突上只用一個刺激電極，把兩個記錄電極放在離刺激點至少 1 cm、離軸突兩端至少 0.5 cm 的地方，彼此相距至少 2 cm，量出神經衝動的傳導速度。', en: 'With one stimulating electrode on the axon, place the two recording electrodes at least 1 cm from it, at least 0.5 cm from either end and at least 2 cm apart, and measure the conduction velocity.' },
      check: function (ev) { const d = ev.data; return ev.type === 'cable' && goodV(d) && d.dist >= 2; }
    },
    {
      id: 'action-potential-5', level: 4,
      title: { zh: '找到閾值', en: 'Find the threshold' },
      desc: { zh: '用單一脈衝引發動作電位，而且刺激強度不超過這個條件下閾值的 1.02 倍——再弱 2% 就可能發不出來。', en: 'Fire an action potential with a single pulse no stronger than 1.02 times the threshold under these conditions — 2% weaker and it might not fire.' },
      check: function (ev) { const d = ev.data; return single(ev) && d.fired1 && d.a1 > 0 && isFinite(d.thr) && d.a1 <= 1.02 * d.thr; }
    },
    {
      id: 'action-potential-6', level: 4,
      title: { zh: '絕對不反應期', en: 'Absolutely refractory' },
      desc: { zh: '成對脈衝：第一個脈衝引發動作電位，第二個脈衝的強度至少是閾值的 10 倍、單獨給一定會發，卻因為來得太早而什麼也沒發生。', en: 'Two pulses: the first fires an action potential; the second is at least 10 times the threshold and would fire on its own — yet it comes too soon and nothing happens.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stim' && d.mode === 'paired' && d.fired1 && !d.fired2 && d.a2alone && isFinite(d.thr) && d.a2 >= 10 * d.thr; }
    },
    {
      id: 'action-potential-7', level: 5,
      title: { zh: '頻率編碼', en: 'Rate coding' },
      desc: { zh: '在同樣的條件下給兩次持續電流，都讓細胞反覆發放，而且電流較大的那一次，發放頻率至少高 40 Hz。神經用「多快發」來表示刺激有多強。', en: 'Under the same conditions, apply two steady currents that both make the cell fire repetitively, the stronger one at least 40 Hz faster. Nerves signal “how strong” by “how often”.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!(ev.type === 'stim' && d.mode === 'step' && d.rate > 0)) return false;
        const ok = (mem.rates || []).some(function (p) {
          if (p.env !== d.env || p.a1 === d.a1) return false;
          const hi = p.a1 > d.a1 ? p : d, lo = p.a1 > d.a1 ? d : p;
          return hi.rate - lo.rate >= 40;
        });
        remember(mem, 'rates', { env: d.env, a1: d.a1, rate: d.rate });
        return ok;
      }
    },
    {
      id: 'action-potential-8', level: 5,
      title: { zh: '越粗越快', en: 'Thicker is faster' },
      desc: { zh: '在同樣的條件下量兩條沒有髓鞘的軸突，直徑相差至少 4 倍，而且速度比與「直徑比的平方根」相差不到 5%。（量法同「量傳導速度」）', en: 'Under the same conditions, measure two unmyelinated axons whose diameters differ by at least 4 times, with the speed ratio within 5% of the square root of the diameter ratio. (Measure as in “Clock the impulse”.)' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!(ev.type === 'cable' && !d.myelin && goodV(d))) return false;
        const ok = (mem.unmy || []).some(function (p) {
          if (p.env !== d.env) return false;
          const rd = Math.max(p.diam, d.diam) / Math.min(p.diam, d.diam);
          if (rd < 4) return false;
          const rv = (p.diam > d.diam ? p.v / d.v : d.v / p.v);
          return Math.abs(rv / Math.sqrt(rd) - 1) <= 0.05;
        });
        remember(mem, 'unmy', { env: d.env, diam: d.diam, v: d.v });
        return ok;
      }
    },
    {
      id: 'action-potential-9', level: 6,
      title: { zh: '跳躍傳導', en: 'Saltatory conduction' },
      desc: { zh: '同樣直徑、同樣條件的軸突，包上髓鞘之後量到的速度至少是沒有髓鞘時的 3 倍。（量法同「量傳導速度」）', en: 'For an axon of the same diameter under the same conditions, measure a speed with myelin at least 3 times the speed without. (Measure as in “Clock the impulse”.)' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!(ev.type === 'cable' && goodV(d))) return false;
        const ok = (mem.all || []).some(function (p) {
          if (p.env !== d.env || p.myelin === d.myelin || !sameD(p.diam, d.diam)) return false;
          const m = p.myelin ? p : d, u = p.myelin ? d : p;
          return m.v >= 3 * u.v;
        });
        remember(mem, 'all', { env: d.env, diam: d.diam, myelin: d.myelin, v: d.v });
        return ok;
      }
    },
    {
      id: 'action-potential-10', level: 7,
      title: { zh: '沒有過射', en: 'No overshoot' },
      desc: { zh: '引發一個振幅至少 50 mV 的動作電位，但它的峰值不超過 0 mV——細胞內從頭到尾都沒有變成正的。', en: 'Fire an action potential at least 50 mV tall whose peak stays at or below 0 mV — the inside never turns positive.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stim' && d.fired1 && d.peak1 != null && d.peak1 <= 0 && d.amp1 >= 50; }
    },
    {
      id: 'action-potential-11', level: 9,
      title: { zh: '等很久才發', en: 'A long wait' },
      desc: { zh: '在 6.3 °C 或更暖的條件下，用不超過 0.5 ms 的單一脈衝引發動作電位，而且從刺激開始到峰值至少等了 6 ms（6.3 °C 時一般只要 2–3 ms）。', en: 'At 6.3 °C or warmer, fire an action potential with a single pulse of 0.5 ms or less that takes at least 6 ms from the start of the pulse to the peak (usually 2–3 ms at 6.3 °C).' },
      check: function (ev) { const d = ev.data; return single(ev) && d.fired1 && d.dur <= 0.5 + 1e-9 && d.T >= 6.3 - 1e-9 && d.lat >= 6; }
    },
    {
      id: 'action-potential-12', level: 10,
      title: { zh: '傳導的安全係數', en: 'The safety factor' },
      desc: { zh: '用河豚毒素阻斷一部分鈉通道，讓衝動仍然一路傳到軸突的另一端，但傳導速度不到沒有毒素時的 55%。（量法同「量傳導速度」）', en: 'Block some sodium channels with tetrodotoxin so the impulse still reaches the far end of the axon, but at less than 55% of the speed without the toxin. (Measure as in “Clock the impulse”.)' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'cable' && goodV(d) && d.reachedFar && d.ttx > 0 && d.vRef != null && isFinite(d.vRef) && d.v <= 0.55 * d.vRef;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'action-potential-h1', level: 6, hidden: true,
      riddle: { zh: '放手，有時比推一把更有力。', en: 'Sometimes letting go is stronger than a push.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stim' && d.mode !== 'paired' && d.a1 < 0 && d.n >= 1; }
    },
    {
      id: 'action-potential-h2', level: 5, hidden: true,
      riddle: { zh: '兩道浪迎面相遇，誰也沒有抵達對岸。', en: 'Two waves meet head-on, and neither reaches the far shore.' },
      check: function (ev) { return ev.type === 'cable' && ev.data.collided; }
    },
    {
      id: 'action-potential-h3', level: 6, hidden: true,
      riddle: { zh: '一句話說完了，回聲卻停不下來。', en: 'The sentence is over, but the echo will not stop.' },
      check: function (ev) { const d = ev.data; return single(ev) && d.a1 > 0 && d.dur <= 1 && d.n >= 3; }
    }
  ]);
})();
