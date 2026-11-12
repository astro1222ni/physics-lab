/* missions/harmonic-series.js — 泛音列與音色的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/harmonic-series.js 發出，都在使用者操作之後；資料格式由 HarmonicCore.missionData 產生）：
 *   'tone'：改完長條、預設音色、基頻、泛音數、相位之後。
 *     { f0, N, mode（'sine' 同相 | 'random' 隨機相位）, seed, preset（最後按的預設音色）, edited（之後有沒有改過長條）,
 *       a（16 個係數，超過 N 或小於 0.005 的為 0）, active（不為 0 的泛音次數，由小到大）, n, g（最大公因數）, rep（g·f0）,
 *       strongest（最強的是第幾個）, cr（頻譜重心 ÷ f0）, centroid（Hz）, odd、even（奇次、偶次能量）, ms、rms、peak、
 *       quarter（同相時 x(T/4)）, crest（峰值因數）, crestSine（同相時的峰值因數）, top（最高泛音 Hz）, topK,
 *       err：{ square, squareMag, sawtooth, sawPlus, triangle, triangleMag }（以基頻正規化後和目標形狀的最大差）,
 *       crOboe（同樣泛音數時「雙簧管」預設的頻譜重心） }
 *   'build'：「一個一個加上泛音」全部加完。{ done, N, n（加入的泛音個數）, preset, edited }
 *   'view3d'：3D 檢視按下視角按鈕。{ face：'front' | 'side' }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const amp = function (d, k) { return Math.abs(d.a[k - 1] || 0); };
  const only = function (d, list) { return d.active.length === list.length && list.every(function (k, i) { return d.active[i] === k; }); };
  const cents = function (f, ref) { return 1200 * Math.log2(f / ref); };
  const tone = function (ev) { return ev.type === 'tone' && ev.data && ev.data.active; };
  const allOdd = function (d) { return d.active.every(function (k) { return k % 2 === 1; }); };
  const spread = function (d) {
    const v = d.active.map(function (k) { return amp(d, k); });
    return Math.max.apply(null, v) - Math.min.apply(null, v);
  };
  const contiguous = function (d) { return d.active.every(function (k, i) { return k === i + 1; }); };

  LabMission.register('harmonic-series', [
    {
      id: 'harmonic-series-1', level: 1,
      title: { zh: '一層一層疊上去', en: 'Layer by layer' },
      desc: { zh: '按「一個一個加上泛音」，從基頻開始，看著（或聽著）泛音一個一個加進來，直到全部加完（泛音數至少 8、至少 6 個泛音不為 0）。',
        en: 'Press “Add harmonics one by one” and watch (or listen) as the harmonics join, one at a time from the fundamental, until all of them are in (at least 8 harmonics, at least 6 of them non-zero).' },
      check: function (ev) { const d = ev.data; return ev.type === 'build' && d.done && d.N >= 8 && d.n >= 6; }
    },
    {
      id: 'harmonic-series-2', level: 2,
      title: { zh: '從側面看', en: 'Look from the side' },
      desc: { zh: '切到「3D 立體」，再按「側面看：頻譜（頻域）」：每一條正弦波的高度，就是頻譜上的一根長條。',
        en: 'Switch to “3D view” and press “Side: spectrum (frequency domain)”: the height of each sine wave is one bar of the spectrum.' },
      check: function (ev) { return ev.type === 'view3d' && ev.data.face === 'side'; }
    },
    {
      id: 'harmonic-series-3', level: 2,
      title: { zh: '女高音的難處', en: 'The soprano’s problem' },
      desc: { zh: '選人聲的預設音色，把基頻調到 700 Hz 以上（高過第一共振峰），看最強的成分變成了基頻本身：女高音唱得很高時，母音為什麼不容易聽清楚。',
        en: 'Pick the voice preset and raise the fundamental to 700 Hz or more (above the first formant). The strongest component becomes the fundamental itself — which is why vowels are hard to make out when a soprano sings very high.' },
      check: function (ev) { const d = ev.data; return tone(ev) && d.preset === 'voice' && !d.edited && d.f0 >= 700 - 1e-9 && d.strongest === 1; }
    },
    {
      id: 'harmonic-series-4', level: 3,
      title: { zh: '一個泛音也是一個純音', en: 'One harmonic is a pure tone' },
      desc: { zh: '只留下一個泛音（第 2 個以上，其他長條全拉到 0），讓它的頻率正好是 A5 = 880 Hz（±10 音分）。',
        en: 'Keep just one harmonic (the 2nd or higher; pull every other bar down to 0) and make its frequency exactly A5 = 880 Hz (within ±10 cents).' },
      check: function (ev) { const d = ev.data; return tone(ev) && d.n === 1 && d.active[0] >= 2 && Math.abs(cents(d.active[0] * d.f0, 880)) <= 10; }
    },
    {
      id: 'harmonic-series-5', level: 3,
      title: { zh: '單簧管的空心', en: 'The hollow clarinet' },
      desc: { zh: '選「單簧管」，把很弱的偶次泛音全部拉到 0，做出只剩奇次泛音的空心音色（泛音數至少 5、至少 3 個奇次泛音不小於 0.05）。',
        en: 'Pick “Clarinet” and pull its weak even harmonics all the way down to 0, leaving a hollow tone with odd harmonics only (at least 5 harmonics, and at least 3 odd ones of 0.05 or more).' },
      check: function (ev) {
        const d = ev.data;
        return tone(ev) && d.preset === 'clarinet' && d.edited && d.N >= 5 && allOdd(d) && d.active.filter(function (k) { return amp(d, k) >= 0.05 - 1e-9; }).length >= 3;
      }
    },
    {
      id: 'harmonic-series-6', level: 4,
      title: { zh: '方波的平頂靠相位', en: 'A square’s flat top is all phase' },
      desc: { zh: '選「方波」和「隨機相位」，按「換一組」找一組相位，讓峰值因數變成同相時的 1.5 倍以上（泛音數至少 5）——長條一根都沒動，聽起來也幾乎一樣。',
        en: 'Pick “Square wave” and “Random phases”, then press “New set” until the crest factor is at least 1.5 times its in-phase value (at least 5 harmonics) — not one bar has moved, and it sounds almost the same.' },
      check: function (ev) { const d = ev.data; return tone(ev) && d.mode === 'random' && d.N >= 5 && d.err.squareMag <= 0.02 && d.crest >= 1.5 * d.crestSine; }
    },
    {
      id: 'harmonic-series-7', level: 4,
      title: { zh: '泛音列裡的大三和弦', en: 'A major chord inside the series' },
      desc: { zh: '只留下第 4、5、6 個泛音（每個至少 0.3，其他全拉到 0）。頻率比 4 : 5 : 6，正是一個大三和弦。',
        en: 'Keep only the 4th, 5th and 6th harmonics (each at least 0.3; everything else at 0). Frequencies in the ratio 4 : 5 : 6 make a major triad.' },
      check: function (ev) { const d = ev.data; return tone(ev) && only(d, [4, 5, 6]) && [4, 5, 6].every(function (k) { return amp(d, k) >= 0.3 - 1e-9; }); }
    },
    {
      id: 'harmonic-series-8', level: 5,
      title: { zh: '親手拼出方波', en: 'Build a square wave by hand' },
      desc: { zh: '按「純音」，再只靠拖曳長條拼出方波：偶次全為 0，第 k 個（奇次）泛音是基頻的 1/k，誤差 0.02 以內，泛音數至少 7，相位用「同相」。',
        en: 'Press “Pure tone”, then build a square wave just by dragging bars: every even harmonic at 0, the k-th (odd) harmonic at 1/k of the fundamental to within 0.02, at least 7 harmonics, with “In phase”.' },
      check: function (ev) { const d = ev.data; return tone(ev) && d.preset === 'pure' && d.edited && d.mode === 'sine' && d.N >= 7 && d.err.square <= 0.02; }
    },
    {
      id: 'harmonic-series-9', level: 6,
      title: { zh: '弓拉的弦是鋸齒波', en: 'A bowed string is a sawtooth' },
      desc: { zh: '選「小提琴」，把琴身共鳴的影響拿掉：讓每一個泛音都是基頻的 1/k（誤差 0.03 以內，泛音數至少 8，「同相」），還原成弓拉弦本身的鋸齒波。',
        en: 'Pick “Violin” and take away the effect of the body’s resonances: make every harmonic 1/k of the fundamental (within 0.03, at least 8 harmonics, “In phase”) to get back the bowed string’s own sawtooth.' },
      check: function (ev) { const d = ev.data; return tone(ev) && d.preset === 'violin' && d.edited && d.mode === 'sine' && d.N >= 8 && d.err.sawPlus <= 0.03; }
    },
    {
      id: 'harmonic-series-10', level: 6,
      title: { zh: '亮三倍', en: 'Three times as bright' },
      desc: { zh: '動手調長條，讓頻譜重心正好是基頻的 3 倍（2.97–3.03），而且最強的仍然是基頻（至少 3 個泛音不為 0）。',
        en: 'Adjust the bars yourself so that the spectral centroid is exactly 3 times the fundamental (2.97–3.03) while the fundamental is still the strongest component (at least 3 non-zero harmonics).' },
      check: function (ev) { const d = ev.data; return tone(ev) && d.edited && d.n >= 3 && d.strongest === 1 && d.cr >= 2.97 - 1e-9 && d.cr <= 3.03 + 1e-9; }
    },
    {
      id: 'harmonic-series-11', level: 8,
      title: { zh: '單簧管也能那麼亮', en: 'A clarinet as bright as an oboe' },
      desc: { zh: '選「單簧管」，只調長條，讓它和「雙簧管」一樣亮（頻譜重心相差 0.05 倍以內，泛音數至少 9），而且仍然是空心的：奇次能量至少是偶次的 10 倍。',
        en: 'Pick “Clarinet” and, by adjusting the bars only, make it as bright as the “Oboe” (spectral centroids within 0.05 of each other, at least 9 harmonics) while it stays hollow: the odd harmonics carry at least 10 times the energy of the even ones.' },
      check: function (ev) {
        const d = ev.data;
        return tone(ev) && d.preset === 'clarinet' && d.edited && d.N >= 9 && d.crOboe != null && Math.abs(d.cr - d.crOboe) <= 0.05 && d.odd >= 10 * d.even;
      }
    },
    {
      id: 'harmonic-series-12', level: 5,
      title: { zh: '把波峰壓平', en: 'Flatten the crest' },
      desc: { zh: '只用基頻和第 3 個泛音（其他全為 0，「同相」），把峰值因數壓到 1.21 以下：加一點第 3 泛音，波峰反而變平了。',
        en: 'Using only the fundamental and the 3rd harmonic (everything else at 0, “In phase”), bring the crest factor down to 1.21 or less: a little 3rd harmonic actually flattens the peaks.' },
      check: function (ev) { const d = ev.data; return tone(ev) && d.mode === 'sine' && only(d, [1, 3]) && d.crest <= 1.21 + 1e-9; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'harmonic-series-h1', level: 3, hidden: true,
      riddle: { zh: '開演之前，全團都在等它先開口。', en: 'Before the concert begins, the whole orchestra waits for it to speak first.' },
      check: function (ev) { const d = ev.data; return tone(ev) && d.preset === 'oboe' && !d.edited && Math.abs(cents(d.f0, 440)) <= 1; }
    },
    {
      id: 'harmonic-series-h2', level: 4, hidden: true,
      riddle: { zh: '祖孫好幾代，都叫同一個名字。', en: 'Several generations, all bearing the same name.' },
      check: function (ev) {
        const d = ev.data;
        return tone(ev) && only(d, [1, 2, 4, 8, 16]) && d.active.every(function (k) { return amp(d, k) >= 0.1 - 1e-9; });
      }
    },
    {
      id: 'harmonic-series-h3', level: 5, hidden: true,
      riddle: { zh: '只有兩個人在唱，屋裡卻響起第三個、更低的聲音。', en: 'Only two are singing, yet a third, deeper voice fills the room.' },
      check: function (ev) { const d = ev.data; return tone(ev) && d.N >= 6 && only(d, [2, 3]) && amp(d, 2) >= 0.3 - 1e-9 && amp(d, 3) >= 0.3 - 1e-9; }
    },
    {
      id: 'harmonic-series-h4', level: 5, hidden: true,
      riddle: { zh: '每隔一個請一個離開——不是你以為的那一半——整首歌就往上爬了一層樓。', en: 'Send every other one away — not the half you think — and the whole song climbs one floor.' },
      check: function (ev) {
        const d = ev.data;
        return tone(ev) && d.N >= 6 && d.n >= 3 && d.active.every(function (k) { return k % 2 === 0; }) &&
          d.active.filter(function (k) { return amp(d, k) >= 0.1 - 1e-9; }).length >= 3;
      }
    },
    {
      id: 'harmonic-series-h5', level: 6, hidden: true,
      riddle: { zh: '鋸子掉了一半的牙，竟成了一道城牆。', en: 'A saw that loses half its teeth becomes a castle wall.' },
      check: function (ev) {
        const d = ev.data;
        return tone(ev) && d.preset === 'sawtooth' && d.edited && d.mode === 'sine' && d.N >= 8 && allOdd(d) && d.err.square <= 0.01;
      }
    },
    {
      id: 'harmonic-series-h6', level: 7, hidden: true,
      riddle: { zh: '理髮店門口的四重唱，最高的那個音，鋼琴上找不到。', en: 'The barbershop quartet’s top note is on no piano.' },
      check: function (ev) { const d = ev.data; return tone(ev) && only(d, [4, 5, 6, 7]) && [4, 5, 6, 7].every(function (k) { return amp(d, k) >= 0.2 - 1e-9; }); }
    },
    {
      id: 'harmonic-series-h7', level: 7, hidden: true,
      riddle: { zh: '閉上眼睛是它，睜開眼睛卻不是它。', en: 'With your eyes closed it is the one; with your eyes open it is not.' },
      check: function (ev) {
        const d = ev.data;
        return tone(ev) && d.preset !== 'triangle' && d.N >= 7 && d.err.triangleMag <= 0.01 && (d.mode === 'random' || d.err.triangle > 0.05);
      }
    },
    {
      id: 'harmonic-series-h8', level: 8, hidden: true,
      riddle: { zh: '一個人怎麼伸手都搆不著的高度，一排一樣矮的人，剛好搆著。', en: 'A height no single one can reach however far it stretches — a row of equally short ones reaches it exactly.' },
      check: function (ev) {
        const d = ev.data;
        return tone(ev) && d.mode === 'sine' && d.n >= 3 && contiguous(d) && spread(d) <= 0.005 && d.rms >= 0.995 && d.rms <= 1.005;
      }
    },
    {
      id: 'harmonic-series-h9', level: 9, hidden: true,
      riddle: { zh: '齊聲一吼，屋頂被掀翻；各自錯開一點，一樣響亮，屋頂卻安然無恙。', en: 'Shout all at once and the roof flies off; stagger a little, just as loud, and the roof stays on.' },
      check: function (ev) {
        const d = ev.data;
        return tone(ev) && d.mode === 'random' && d.N >= 12 && d.n === d.N && spread(d) <= 0.005 && amp(d, 1) >= 0.5 && d.crest <= 0.6 * d.crestSine;
      }
    },
    {
      id: 'harmonic-series-h10', level: 10, hidden: true,
      riddle: { zh: '城牆的每個角都長著一根刺；讓遠方的哨兵小聲一點，刺就不見了。', en: 'Every corner of the wall grows a thorn; let the distant sentries speak softly and the thorns are gone.' },
      check: function (ev) {
        const d = ev.data;
        return tone(ev) && d.mode === 'sine' && d.N >= 9 && d.n >= 5 && allOdd(d) && d.active.every(function (k) { return d.a[k - 1] > 0; }) &&
          d.crest <= 1.10 && d.peak <= d.quarter * 1.002;
      }
    }
  ]);
})();
