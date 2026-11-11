/* missions/standing-waves.js — 繩波的反射與駐波的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
  const rel = function (a, b, r) { return Math.abs(a - b) <= r * Math.max(Math.abs(a), Math.abs(b), 1e-9); };
  const same = function (a, b) { return Math.abs(a - b) < 1e-6; };
  const remember = function (mem, d, n) { (mem.list = mem.list || []).push(d); if (mem.list.length > (n || 16)) mem.list.shift(); return mem.list; };
  // 穩定（每 10 次往返回報一次）且在共振頻率上
  const res = function (ev) { return ev.type === 'steady' && ev.data.resonant; };

  LabMission.register('standing-waves', [
    {
      id: 'standing-waves-1', level: 1,
      title: { zh: '第一次反射', en: 'First reflection' },
      desc: { zh: '按「送出脈波」，看脈波抵達右端並反射回來。', en: 'Press “Send a pulse” and watch it reach the right end and reflect.' },
      check: function (ev) { return ev.type === 'pulseReflected'; }
    },
    {
      id: 'standing-waves-2', level: 2,
      title: { zh: '倒立與正立', en: 'Upside down and right way up' },
      desc: { zh: '讓脈波在固定端反射一次，也在自由端反射一次（順序不限），比較反射脈波的方向。', en: 'Reflect a pulse once from a fixed end and once from a free end (either order) and compare the reflected pulses.' },
      check: function (ev, mem) {
        if (ev.type !== 'pulseReflected') return false;
        mem[ev.data.end] = true;
        return !!(mem.fixed && mem.free);
      }
    },
    {
      id: 'standing-waves-3', level: 3,
      title: { zh: '基頻駐波', en: 'The fundamental' },
      desc: { zh: '在駐波模式、兩端固定，讓繩子以基頻（最低的共振頻率）共振，並持續到振幅穩定（至少往返 10 次）。', en: 'In standing-wave mode with both ends fixed, make the string resonate at its fundamental (lowest resonant frequency) and keep it going until the amplitude is steady (at least 10 round trips).' },
      check: function (ev) { return res(ev) && ev.data.end === 'fixed' && ev.data.n === 1; }
    },
    {
      id: 'standing-waves-4', level: 4,
      title: { zh: '準時抵達', en: 'Right on time' },
      desc: { zh: '調整繩長、波速或脈波寬度，讓脈波中心剛好在 t = 1.00 s 抵達反射端（誤差 ±0.005 s），並送出脈波驗證。', en: 'Adjust the length, wave speed or pulse width so that the centre of the pulse reaches the reflecting end at exactly t = 1.00 s (±0.005 s), then send a pulse to check.' },
      check: function (ev) { return ev.type === 'pulseReflected' && near(ev.data.tHit, 1, 0.005); }
    },
    {
      id: 'standing-waves-5', level: 4,
      title: { zh: '五個波節', en: 'Five nodes' },
      desc: { zh: '兩端固定，振出有 5 個波節（含兩端）的穩定駐波。', en: 'With both ends fixed, make a steady standing wave with 5 nodes (counting both ends).' },
      check: function (ev) { return res(ev) && ev.data.end === 'fixed' && ev.data.nodes === 5; }
    },
    {
      id: 'standing-waves-6', level: 5,
      title: { zh: '自由端的三個波腹', en: 'Three antinodes with a free end' },
      desc: { zh: '一端固定一端自由，振出有 3 個波腹的穩定駐波。這時頻率是基頻的幾倍？', en: 'With one end fixed and one free, make a steady standing wave with 3 antinodes. What multiple of the fundamental is the frequency?' },
      check: function (ev) { return res(ev) && ev.data.end === 'free' && ev.data.antinodes === 3; }
    },
    {
      id: 'standing-waves-7', level: 6,
      title: { zh: '調弦', en: 'Tuning the string' },
      desc: { zh: '振盪器頻率 3.00 Hz、波速 3.00 m/s、兩端固定，只調整繩長，讓繩子共振出 4 個波腹的穩定駐波。', en: 'With the driver at 3.00 Hz, wave speed 3.00 m/s and both ends fixed, change only the length so the string resonates with 4 antinodes (steady).' },
      check: function (ev) {
        const d = ev.data;
        return res(ev) && d.end === 'fixed' && same(d.f, 3) && same(d.v, 3) && d.antinodes === 4;
      }
    },
    {
      id: 'standing-waves-8', level: 7,
      title: { zh: '波長 0.80 m', en: 'Wavelength 0.80 m' },
      desc: { zh: '一端固定一端自由，振出波長 0.80 m 的穩定共振駐波（誤差 0.5% 內）。', en: 'With one end fixed and one free, make a steady resonant standing wave with a wavelength of 0.80 m (within 0.5%).' },
      check: function (ev) { return res(ev) && ev.data.end === 'free' && rel(ev.data.lambda, 0.8, 0.005); }
    },
    {
      id: 'standing-waves-9', level: 8,
      title: { zh: '同音異弦', en: 'Same note, different strings' },
      desc: { zh: '波速相同，做出兩個穩定的共振駐波：一個兩端固定、一個一端自由，兩者頻率相同（誤差 0.2% 內）、波腹數也相同（至少 2 個）。', en: 'With the same wave speed, make two steady resonant standing waves — one with both ends fixed, one with a free end — with the same frequency (within 0.2%) and the same number of antinodes (at least 2).' },
      check: function (ev, mem) {
        if (!res(ev)) return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          return o !== d && o.end !== d.end && same(o.v, d.v) && rel(o.f, d.f, 0.002) && o.antinodes === d.antinodes && d.antinodes >= 2;
        });
      }
    },
    {
      id: 'standing-waves-10', level: 9,
      title: { zh: '最安靜的繩子', en: 'The quietest string' },
      desc: { zh: '兩端固定、頻率至少 1 Hz，找到讓繩子穩定振幅最小的頻率：每個行進波的穩定振幅要降到最低值約 0.588 cm（往返至少 10 次）。', en: 'With both ends fixed and a frequency of at least 1 Hz, find the frequency where the steady amplitude is smallest: the steady amplitude of each travelling wave must drop to its minimum of about 0.588 cm (at least 10 round trips).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'steady' && d.end === 'fixed' && d.f >= 1 && d.ampSteady <= 0.5885;
      }
    },
    {
      id: 'standing-waves-11', level: 10,
      title: { zh: '大師：指定的波節', en: 'Master: a node on demand' },
      desc: { zh: '兩端固定、振盪器頻率 2.50 Hz，做出恰好 6 個波腹的穩定共振駐波，而且 x = 0.60 m 處必須是波節（誤差 ±0.005 m）。', en: 'With both ends fixed and the driver at 2.50 Hz, make a steady resonant standing wave with exactly 6 antinodes and a node at x = 0.60 m (±0.005 m).' },
      check: function (ev) {
        const d = ev.data;
        return res(ev) && d.end === 'fixed' && same(d.f, 2.5) && d.antinodes === 6 &&
          d.nodePositions.some(function (x) { return near(x, 0.6, 0.005); });
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'standing-waves-h1', level: 4, hidden: true,
      riddle: { zh: '不走捷徑的人，才看得見浪一層一層長大。', en: 'Only those who take no shortcut see the wave grow, layer by layer.' },
      check: function (ev) { const d = ev.data; return res(ev) && !d.skipped && d.t >= 60; }
    },
    {
      id: 'standing-waves-h2', level: 6, hidden: true,
      riddle: { zh: '直到弦開始尖叫。', en: 'Until the string starts to scream.' },
      check: function (ev) { const d = ev.data; return res(ev) && d.f >= 10.5; }
    },
    {
      id: 'standing-waves-h3', level: 8, hidden: true,
      riddle: { zh: '它明明就在那裡，卻在一瞬間消失無蹤。', en: 'It was right there — and for an instant it was gone.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'paused' && d.end === 'fixed' && d.shape !== 'tri' && d.t > d.tStart && d.t < d.tEnd && d.maxAbs <= 0.2;
      }
    }
  ]);
})();
