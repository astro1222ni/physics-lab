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

  // 連續波僅在頁面送出穩態事件時取樣。兩次設定之間可直接跳到穩態。
  // 核心共振窗為 0.1%；另將頻率比對到 0.001 Hz、長度比對到 0.005 m。
  function compareModes(ev, mem, accepts, match) {
    if (ev.type !== 'steady' || !accepts(ev.data)) return false;
    const d = ev.data, old = mem.last;
    mem.last = d;
    return !!old && same(old.v, d.v) && (match(old, d) || match(d, old));
  }
  const sameString = (a, b) => same(a.L, b.L);
  const sameTone = (a, b) => near(a.f, b.f, 0.00051);

  LabMission.register('standing-waves', [
    {
      id: 'standing-waves-1', level: 1,
      title: { zh: '第一次反射', en: 'First reflection' },
      desc: { zh: '調整波速、繩長或脈波寬度，送出一個脈波，等它從右端反射。', en: 'Change the wave speed, string length or pulse width, send a pulse, and watch it reflect at the right end.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pulseReflected' && d.sentByUser && (d.v !== 2 || d.L !== 2 || d.w !== 0.4);
      }
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
      desc: { zh: '在駐波模式、兩端固定，讓繩子以基頻（最低的共振頻率）共振，並持續到振幅穩定（至少往返 10 次；不要按「跳到穩定狀態」，要看它自己長起來）。', en: 'In standing-wave mode with both ends fixed, make the string resonate at its fundamental (lowest resonant frequency) and keep it going until the amplitude is steady (at least 10 round trips; let it build up on its own instead of pressing “Skip to steady state”).' },
      check: function (ev) {
        const d = ev.data;
        return res(ev) && d.end === 'fixed' && d.n === 1 && !d.skipped && d.roundTrips >= 10 - 1e-9;
      }
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
    },
    {
      id: 'standing-waves-h4', level: 3, hidden: true,
      riddle: { zh: '尺在窗台睡著，屋裡還留著歌。', en: 'The ruler sleeps on the sill while the room keeps singing.' },
      desc: { zh: '在自由端的第五次諧波形成穩定駐波，使波長為 1.00 m。', en: 'Form the fifth harmonic at a free end with a wavelength of 1.00 m.' },
      check: function (ev) {
        const d = ev.data;
        return res(ev) && d.end === 'free' && d.m === 5 && near(d.lambda, 1, 0.002);
      }
    },
    {
      id: 'standing-waves-h5', level: 4, hidden: true,
      riddle: { zh: '門栓鬆開以後，原來的歌聲躲了起來。', en: 'When the latch gives way the old song hides.' },
      desc: { zh: '同一條弦以相同頻率驅動，固定端第二模態共振，換成自由端後變成反共振的增益谷底。', en: 'At the same frequency and wave speed, change the second fixed-end resonance into a free-end gain minimum.' },
      check: function (ev, mem) {
        return compareModes(ev, mem, d => d.end === 'free' || (d.resonant && d.n === 2),
          (a, b) => a.end === 'fixed' && b.end === 'free' && sameString(a, b) && sameTone(a, b) &&
            near(b.gain, 1 / 1.7, 0.0001)); // 每次往返振幅保留 0.7，反相時增益為 1/(1+0.7)。
      }
    },
    {
      id: 'standing-waves-h6', level: 6, hidden: true,
      riddle: { zh: '琴房的兩扇窗，開在同一段和聲裡。', en: 'Two windows open onto the same quiet harmony.' },
      desc: { zh: '在同長、同波速的固定端弦上找到第四、第五諧波，實測頻率比為純律大三度的 5:4。', en: 'On one fixed-end string, measure the fourth and fifth harmonics in the just major-third ratio of five to four.' },
      check: function (ev, mem) {
        return compareModes(ev, mem, d => d.end === 'fixed' && d.resonant && [4, 5].includes(d.n),
          (a, b) => sameString(a, b) && a.n === 4 && b.n === 5 && near(b.f, 1.25 * a.f, 0.0012));
      }
    },
    {
      id: 'standing-waves-h7', level: 7, hidden: true,
      riddle: { zh: '笛聲跨過空著的座位，後排有人應和。', en: 'A flute calls across an empty seat and the back row answers.' },
      desc: { zh: '在同一自由端弦上找到第三、第五諧波，驗證頻率比為 5:3。', en: 'Measure the third and fifth harmonics on the same fixed–free string and verify their frequency ratio of five to three.' },
      check: function (ev, mem) {
        return compareModes(ev, mem, d => d.end === 'free' && d.resonant && [3, 5].includes(d.m),
          (a, b) => sameString(a, b) && a.m === 3 && b.m === 5 && near(b.f, 5 * a.f / 3, 0.0014));
      }
    },
    {
      id: 'standing-waves-h8', level: 8, hidden: true,
      riddle: { zh: '多出的一截，讓門檻上的寂靜換了模樣。', en: 'An extra span changes the silence on the threshold.' },
      desc: { zh: '從固定端第二模態出發，保持波速與頻率並將弦長增加四分之一波長，改用自由端後仍然共振。', en: 'Start at the second fixed-end mode. Add a quarter wavelength and change to a free end to recover resonance at the same frequency and speed.' },
      check: function (ev, mem) {
        return compareModes(ev, mem, d => d.resonant && (d.end === 'fixed' ? d.n === 2 : d.m === 5),
          (a, b) => a.end === 'fixed' && b.end === 'free' && sameTone(a, b) &&
            near(b.L - a.L, a.lambda / 4, 0.005));
      }
    },
    {
      id: 'standing-waves-h9', level: 9, hidden: true,
      riddle: { zh: '山腰兩盞燈，隔著山頂一樣亮。', en: 'Two lanterns shine alike on opposite sides of a summit.' },
      desc: { zh: '在固定端第三共振峰兩側各找到半功率點，振幅增益為峰值的 1/√2。', en: 'Locate both half-power points around the third fixed-end resonance, where amplitude gain is the peak gain divided by the square root of two.' },
      check: function (ev, mem) {
        // 0.001 Hz 取整；以功率比的絕對誤差 0.006 容納兩側頻率取整。
        return compareModes(ev, mem, d => d.end === 'fixed' && d.n === 3 &&
          near((0.3 * d.gain) ** 2, 0.5, 0.006),
          (a, b) => sameString(a, b) && a.f < a.fn && b.f > b.fn && near(a.f + b.f, 2 * a.fn, 0.0011));
      }
    },
    {
      id: 'standing-waves-h10', level: 10, hidden: true,
      riddle: { zh: '短短一封信，恰好裝進長歌的一個字。', en: 'One brief letter fits a syllable of the longer song.' },
      desc: { zh: '先在自由端送出脈波，再以相同弦長與波速建立共振駐波，使脈波寬度等於連續波的波長。此時脈波通過端點的時間恰為一個振動週期。', en: 'Reflect a pulse at a free end, then form a resonant standing wave at the same string length and wave speed. Match its wavelength to the pulse width so that the pulse takes one oscillation period to pass the end.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'pulseReflected' && d.sentByUser && d.end === 'free') mem.pulse = d;
        const p = mem.pulse;
        return res(ev) && d.end === 'free' && p && sameString(p, d) &&
          same(p.v, d.v) && near(d.f * (p.tEnd - p.tStart), 1, 0.002);
      }
    }
  ].map(m => {
    if (!m.hidden || !m.desc) return m;
    // 兩種任務面板都讀 riddle；在面板重繪時依目前帳號的完成紀錄選文。
    const clue = m.riddle;
    const shown = () => LabMission._state?.done?.[m.id] ? m.desc : clue;
    return { ...m, riddle: { get zh() { return shown().zh; }, get en() { return shown().en; } } };
  }));
})();
