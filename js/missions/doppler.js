/* missions/doppler.js — 都卜勒效應的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/doppler.js 發出）：
  //   measure：按「暫停」時的讀數 { n 聽到幾個聲音, ratio = f′/f, fp, fp2, us, uo, lambdaFront, lambdaBack, f, v, vs, vo, M, t, ox, oy, clean }
  //   boom：音爆 { tBoom 精確時刻, theta 馬赫角（度）, M, oy, clean … }
  //   runEnd：一趟結束（波源駛離或觀察者走出畫面）{ heard, heardTime, ratioMax, ratioMin, boom, tBoom, two, minDist, clean … }
  // clean = 這一趟從 t = 0 開始後沒有搬動觀察者、也沒有改觀察者速度。
  const near = function (a, b, tol) { return a != null && Math.abs(a - b) <= tol; };
  const remember = function (mem, d, n) { (mem.list = mem.list || []).push(d); if (mem.list.length > (n || 12)) mem.list.shift(); return mem.list; };

  LabMission.register('doppler', [
    {
      id: 'doppler-1', level: 1,
      title: { zh: '聽見音調變高', en: 'Hear the pitch go up' },
      desc: { zh: '波源朝觀察者駛來時按「暫停」，讀到比 f 高的 f′（f′/f > 1.01）。', en: 'While the source is coming toward the listener, press “Pause” and read an f′ higher than f (f′/f > 1.01).' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && d.n >= 1 && d.vs > 0 && d.ratio > 1.01; }
    },
    {
      id: 'doppler-2', level: 2,
      title: { zh: '跑向聲音', en: 'Run toward the sound' },
      desc: { zh: '波源靜止（v_s = 0），只靠觀察者移動，聽到比 f 高至少 30% 的聲音（暫停時 f′/f ≥ 1.30）。', en: 'With the source at rest (v_s = 0), let only the listener move and hear a tone at least 30% above f (f′/f ≥ 1.30 when paused).' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && d.n >= 1 && d.vs === 0 && d.vo !== 0 && d.ratio >= 1.3; }
    },
    {
      id: 'doppler-3', level: 3,
      title: { zh: '百公尺波長', en: 'A 100-metre wavelength' },
      desc: { zh: '讓運動中的波源前方的波長剛好是 100 m（誤差 ±0.5 m），然後在播放中按「暫停」記錄下來。', en: 'Make the wavelength in front of a moving source exactly 100 m (±0.5 m), then press “Pause” while it runs to record it.' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && d.vs > 0 && near(d.lambdaFront, 100, 0.5); }
    },
    {
      id: 'doppler-4', level: 4,
      title: { zh: '撞上音障', en: 'Hit the sound barrier' },
      desc: { zh: '讓波源剛好以聲速行駛（v_s = v），並讓觀察者聽到音爆。', en: 'Drive the source at exactly the speed of sound (v_s = v) and let the listener hear the boom.' },
      check: function (ev) { const d = ev.data; return ev.type === 'boom' && Math.abs(d.vs - d.v) < 1e-6; }
    },
    {
      id: 'doppler-5', level: 5,
      title: { zh: '高八度', en: 'An octave higher' },
      desc: { zh: '觀察者不動，讓他聽到的頻率剛好是波源的兩倍（暫停時 f′/f = 2.00，誤差 ±0.01）。', en: 'With the listener standing still, make the frequency heard exactly twice the source frequency (f′/f = 2.00 ± 0.01 when paused).' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && d.n === 1 && d.vo === 0 && near(d.ratio, 2, 0.01); }
    },
    {
      id: 'doppler-6', level: 6,
      title: { zh: '擦身而過的那一刻', en: 'The moment it goes by' },
      desc: { zh: '波源以至少 100 m/s 行駛、觀察者不動，在聽到的 f′ 剛好等於 f 的瞬間按「暫停」（誤差 ±0.5%）。', en: 'With the source at 100 m/s or more and the listener still, press “Pause” at the instant the f′ heard equals f (within ±0.5%).' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && d.n === 1 && d.vs >= 100 && d.vo === 0 && near(d.ratio, 1, 0.005); }
    },
    {
      id: 'doppler-7', level: 7,
      title: { zh: '30° 的馬赫錐', en: 'A 30° Mach cone' },
      desc: { zh: '讓馬赫錐的半頂角剛好是 30°（誤差 ±0.2°），並讓觀察者聽到音爆。', en: 'Make the half-angle of the Mach cone exactly 30° (±0.2°) and let the listener hear the boom.' },
      check: function (ev) { const d = ev.data; return ev.type === 'boom' && near(d.theta, 30, 0.2); }
    },
    {
      id: 'doppler-8', level: 8,
      title: { zh: '誰在動很重要', en: 'Who moves matters' },
      desc: { zh: '聲速相同下暫停記錄兩次，聽到相同的 f′/f（至少 1.2，彼此誤差 0.5% 內）：一次只有波源以至少 50 m/s 靠近，一次只有觀察者在動。比較兩次的速率。', en: 'At the same speed of sound, record two pauses with the same f′/f (at least 1.2, within 0.5% of each other): once with only the source approaching at 50 m/s or more, once with only the listener moving. Compare the two speeds.' },
      check: function (ev, mem) {
        if (ev.type !== 'measure') return false;
        const d = ev.data;
        if (d.n !== 1 || !(d.ratio >= 1.2)) return false;
        const src = function (x) { return x.vs >= 50 && x.vo === 0; };
        const obs = function (x) { return x.vs === 0 && x.vo !== 0; };
        if (!src(d) && !obs(d)) return false;
        return remember(mem, d).some(function (o) {
          return o !== d && Math.abs(o.v - d.v) < 1e-9 && ((src(o) && obs(d)) || (obs(o) && src(d))) &&
            Math.abs(o.ratio - d.ratio) <= 0.005 * d.ratio;
        });
      }
    },
    {
      id: 'doppler-9', level: 9,
      title: { zh: '一起走就不變調', en: 'Travel together, keep the pitch' },
      desc: { zh: '波源以至少 100 m/s 行駛，觀察者卻從頭到尾（至少聽 2 秒、一趟跑完）聽到的 f′ 都等於 f（誤差 0.1% 內）。中途不能搬動觀察者或改他的速度。', en: 'The source drives at 100 m/s or more, yet from start to finish (at least 2 s of sound, one complete run) the listener hears f′ = f (within 0.1%). No moving the listener or changing their velocity during the run.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'runEnd' && d.clean && d.vs >= 100 && d.heardTime >= 2 &&
          Math.abs(d.ratioMax - 1) <= 0.001 && Math.abs(d.ratioMin - 1) <= 0.001;
      }
    },
    {
      id: 'doppler-10', level: 10,
      title: { zh: '大師：準時的音爆', en: 'Master: a boom on schedule' },
      desc: { zh: '馬赫數至少 1.2、觀察者離道路至少 150 m，讓音爆剛好在 t = 3.00 s 時抵達觀察者（誤差 ±0.02 s）。中途不能搬動觀察者。', en: 'With a Mach number of at least 1.2 and the listener at least 150 m from the road, make the sonic boom reach the listener at exactly t = 3.00 s (±0.02 s). No moving the listener during the run.' },
      check: function (ev) { const d = ev.data; return ev.type === 'boom' && d.clean && d.M >= 1.2 && Math.abs(d.oy) >= 150 && near(d.tBoom, 3, 0.02); }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'doppler-h1', level: 6, hidden: true,
      riddle: { zh: '與它並肩同行的人，只聽見寂靜。', en: 'Whoever walks beside it hears only silence.' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && d.n >= 1 && d.vs === 0 && d.ratio != null && d.ratio <= 0.02; }
    },
    {
      id: 'doppler-h2', level: 4, hidden: true,
      riddle: { zh: '一個身影，兩段回聲。', en: 'One figure, two echoes.' },
      check: function (ev) { const d = ev.data; return ev.type === 'measure' && d.n === 2; }
    },
    {
      id: 'doppler-h3', level: 3, hidden: true,
      riddle: { zh: '擦肩而過的，最響亮。', en: 'What brushes past you is the loudest.' },
      check: function (ev) { const d = ev.data; return ev.type === 'runEnd' && d.minDist < 5 && d.vs > 0; }
    }
  ]);
})();
