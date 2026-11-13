/* missions/adsr-envelope.js — 合成器的 ADSR 包絡的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/adsr-envelope.js 發出，都在使用者操作之後；資料格式由 AdsrCore.envData／releaseData 產生）：
 *   'env'：改完包絡、形狀、刻度、倒放、泛音數、高泛音、按住時間之後（滑桿放開、按鈕、拖曳節點結束）。
 *     { A, D, S, R（秒；S 是 0–1）, shape（'lin' | 'exp'）, sDb, H（按住時間）, rev, N, high, scale（'lin' | 'db'）,
 *       preset（最後按的預設）, edited（之後有沒有改過 A D S R 或形狀）, touched（學生動過設定）,
 *       tauD、halfD（衰減段的時間常數、半衰期；線性為 null；S = 1 為 Infinity）, tauR、halfR, slopeD、slopeR（dB/s）,
 *       t20（一直按著時降到 −20 dB 的時刻；到不了為 Infinity） }
 *   'release'：正放時放開（琴鍵放開，或「▶ 播放」按住時間到）；倒放時整段播完或中途放開。
 *     上面的欄位（沒有 H、touched），再加 { rev, held（按住的秒數；倒放時是倒過來的那個音按住的秒數）,
 *       source（'key' | 'play'）, f0, key（音名）, complete（倒放有沒有播完；正放一律 true）,
 *       phase（放開時在 'A' | 'D' | 'S'；倒放為 null）, aRel（放開時的振幅；倒放為 null）,
 *       bright（放開時的頻譜重心 ÷ 頂點的頻譜重心）, dur40（−40 dB 以上的長度）, cycles（f0 × dur40）, Q（π f0 τ_D） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const rel = function (ev) { return ev.type === 'release' && ev.data && !ev.data.rev; };
  const revDone = function (ev) { return ev.type === 'release' && ev.data && ev.data.rev && ev.data.complete; };
  const near = function (a, b, tol) { return a != null && isFinite(a) && Math.abs(a - b) <= tol; };
  const TWINKLE = ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4'];
  /** 「一條直線」：指數、衰減與釋音的時間常數相同（分貝刻度上斜率相同），而且剛好在衰減結束時放開（沒有延持的平台） */
  const straight = function (d) {
    return d.shape === 'exp' && d.S >= 0.01 - 1e-9 && d.S <= 0.9 + 1e-9 && d.tauD > 0 && d.tauR > 0 &&
      Math.abs(d.tauD / d.tauR - 1) <= 0.02 && Math.abs(d.held - (d.A + d.D)) <= 0.02 * d.D + 0.005;
  };

  LabMission.register('adsr-envelope', [
    {
      id: 'adsr-envelope-1', level: 1,
      title: { zh: '按住不放', en: 'Hold it down' },
      desc: { zh: '按住任何一個「琴鍵」（或電腦鍵盤的 A–K），等游標走過起音、衰減、進入延持段 S 再放開：釋音從延持的高度落下來（延持 S 至少 0.05）。',
        en: 'Hold down any of the “Keys” (or A–K on a computer keyboard) until the cursor passes the attack and the decay and enters the sustain stage, then let go: the release falls from the sustain level (sustain S at least 0.05).' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.source === 'key' && d.phase === 'S' && d.S >= 0.05 - 1e-9 && d.held >= d.A + d.D + 0.2; }
    },
    {
      id: 'adsr-envelope-2', level: 1,
      title: { zh: '風琴：按多久響多久', en: 'Organ: as long as you hold' },
      desc: { zh: '選「風琴」，按住琴鍵（或按「▶ 播放」）至少 1 秒：聲音一直滿格，一放開立刻停。',
        en: 'Choose “Organ” and hold a key (or press “▶ Play”) for at least 1 second: the sound stays at full level and stops the instant you let go.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.preset === 'organ' && !d.edited && d.held >= 1 - 1e-9; }
    },
    {
      id: 'adsr-envelope-3', level: 2,
      title: { zh: '鋼琴沒有延持', en: 'A piano has no sustain' },
      desc: { zh: '做一個像鋼琴的包絡：起音 A 不超過 0.02 s、衰減 D 至少 1.5 s、延持 S = 0，再按住至少 2 秒：就算一直按著，聲音也一路變小。',
        en: 'Make a piano-like envelope — attack A at most 0.02 s, decay D at least 1.5 s, sustain S = 0 — and hold a note for at least 2 seconds: even while you hold it, the sound keeps dying away.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.S <= 0.001 && d.D >= 1.5 - 1e-9 && d.A <= 0.02 + 1e-9 && d.held >= 2 - 1e-9; }
    },
    {
      id: 'adsr-envelope-4', level: 2,
      title: { zh: '分貝刻度上的直線', en: 'Straight lines in decibels' },
      desc: { zh: '形狀選「指數」，延持 S 拉到 0，再切到「分貝刻度」：衰減和釋音都變成筆直往下的斜線——指數衰減每過一樣長的時間，就掉一樣多的分貝。',
        en: 'Choose “Exponential”, pull sustain S down to 0 and switch to the “Decibel scale”: the decay and the release become straight downhill lines — an exponential decay loses the same number of decibels in every equal stretch of time.' },
      check: function (ev) { const d = ev.data; return ev.type === 'env' && d.touched && d.scale === 'db' && d.shape === 'exp' && d.S <= 0.001; }
    },
    {
      id: 'adsr-envelope-5', level: 3,
      title: { zh: '弦樂慢慢浮上來', en: 'Strings swell in' },
      desc: { zh: '讓起音 A 至少 0.5 s、延持 S 至少 0.6、釋音 R 至少 0.8 s，按住到起音結束再放開：聲音像弓慢慢拉出來，放開後還留著尾巴。',
        en: 'Set attack A to at least 0.5 s, sustain S to at least 0.6 and release R to at least 0.8 s, hold the note past the end of the attack and let go: the sound swells in like a slow bow stroke and leaves a tail after you let go.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.A >= 0.5 - 1e-9 && d.S >= 0.6 - 1e-9 && d.R >= 0.8 - 1e-9 && d.held >= d.A; }
    },
    {
      id: 'adsr-envelope-6', level: 3,
      title: { zh: '還沒到延持就放開', en: 'Let go before the sustain' },
      desc: { zh: '在起音或衰減的途中就放開，讓釋音從半路開始：放開時的振幅在 0.15 到 0.85 之間，而且和延持 S 至少差 0.1（「按住時間」比 A + D 短就做得到）。',
        en: 'Let go during the attack or the decay so the release starts from halfway: the level when you let go is between 0.15 and 0.85 and differs from sustain S by at least 0.1 (a “Hold time” shorter than A + D does it).' },
      check: function (ev) {
        const d = ev.data;
        return rel(ev) && (d.phase === 'A' || d.phase === 'D') && d.aRel >= 0.15 - 1e-9 && d.aRel <= 0.85 + 1e-9 && Math.abs(d.aRel - d.S) >= 0.1 - 1e-9;
      }
    },
    {
      id: 'adsr-envelope-7', level: 4,
      title: { zh: '同一個頻譜，四種樂器', en: 'One spectrum, four instruments' },
      desc: { zh: '泛音數不要動，從「鋼琴」「風琴」「弦樂」「撥弦」「打擊」裡選至少四個，每選一個就彈一個音：頻譜完全一樣，只換了包絡，聽起來卻像不同的樂器。',
        en: 'Without touching the number of harmonics, pick at least four of “Piano”, “Organ”, “Strings”, “Pluck” and “Percussion” and play a note with each: the spectrum is exactly the same — only the envelope changes — yet they sound like different instruments.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!rel(ev) || !d.preset || d.edited) return false;
        if (mem.N !== d.N || mem.high !== d.high) { mem.N = d.N; mem.high = d.high; mem.seen = {}; }
        mem.seen[d.preset] = true;
        return Object.keys(mem.seen).length >= 4;
      }
    },
    {
      id: 'adsr-envelope-8', level: 5,
      title: { zh: '一閃一閃亮晶晶', en: 'Twinkle, twinkle' },
      desc: { zh: '用「琴鍵」彈出〈小星星〉的頭七個音：C C G G A A G（Do Do Sol Sol La La Sol）。試試不同的包絡，同一首歌會換一種樂器的感覺。',
        en: 'Use the “Keys” to play the first seven notes of the nursery tune Twinkle, Twinkle, Little Star: C C G G A A G. Try different envelopes — the same tune takes on the feel of another instrument.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'release' || d.source !== 'key' || !d.key) return false;
        mem.seq = (mem.seq || []).concat([d.key]).slice(-TWINKLE.length);
        return mem.seq.length === TWINKLE.length && mem.seq.every(function (k, i) { return k === TWINKLE[i]; });
      }
    },
    {
      id: 'adsr-envelope-9', level: 5,
      title: { zh: '時間常數 0.5 秒', en: 'A time constant of 0.5 s' },
      desc: { zh: '用「指數」形狀、延持 S 在 0.05 到 0.95 之間，調整衰減 D，讓衰減段的時間常數 τ = 0.50 s（±0.01 s）：每過 τ，振幅就變成原來的 1/e ≈ 0.37。',
        en: 'With the “Exponential” shape and sustain S between 0.05 and 0.95, adjust the decay D so that the decay’s time constant is τ = 0.50 s (±0.01 s): every τ the level drops to 1/e ≈ 0.37 of what it was.' },
      check: function (ev) { const d = ev.data; return ev.type === 'env' && d.touched && d.shape === 'exp' && d.S >= 0.05 - 1e-9 && d.S <= 0.95 + 1e-9 && near(d.tauD, 0.5, 0.01); }
    },
    {
      id: 'adsr-envelope-10', level: 5,
      title: { zh: '越彈越暗', en: 'Darker as it fades' },
      desc: { zh: '勾選「高泛音衰減較快」，用延持 S = 0 的包絡按住一個音，等到放開時頻譜重心降到頂點時的 0.6 倍以下：聲音變小的同時也變暗，就像真的鋼琴和吉他。',
        en: 'Tick “Higher harmonics fade faster”, hold a note on an envelope with sustain S = 0, and let go only when the spectral centroid has fallen below 0.6 times its value at the peak: the sound gets darker as it gets quieter, just like a real piano or guitar.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.high && d.S <= 0.001 && d.bright != null && d.bright <= 0.6; }
    },
    {
      id: 'adsr-envelope-11', level: 7,
      title: { zh: '一秒掉 20 分貝', en: 'Down 20 dB in one second' },
      desc: { zh: '在「分貝刻度」上用「指數」形狀，調整起音、衰減與延持，讓聲音從按下算起剛好在 1.00 秒（±0.005 秒）掉到 −20 dB（振幅剩十分之一），再按住超過這一刻才放開。',
        en: 'On the “Decibel scale” with the “Exponential” shape, adjust the attack, decay and sustain so that the sound reaches −20 dB (one tenth of the peak level) exactly 1.00 s (±0.005 s) after the key goes down, then hold the note past that moment before letting go.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.scale === 'db' && d.shape === 'exp' && near(d.t20, 1, 0.005) && d.held >= d.t20; }
    },
    {
      id: 'adsr-envelope-12', level: 9,
      title: { zh: '一條直線滑到底', en: 'One straight slide to silence' },
      desc: { zh: '在「分貝刻度」上，讓聲音從頂點到完全安靜是一條沒有轉折的直線：「指數」形狀、延持 S 在 0.01 到 0.9 之間，衰減和釋音的時間常數相同（±2%），而且剛好在衰減結束的那一刻放開（用「按住時間」和「▶ 播放」最準）。',
        en: 'On the “Decibel scale”, make the sound slide from the peak to silence along one straight line with no bend: the “Exponential” shape, sustain S between 0.01 and 0.9, the same time constant for the decay and the release (±2%), and the note released exactly when the decay ends (the “Hold time” with “▶ Play” is the most precise way).' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.scale === 'db' && straight(d); }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'adsr-envelope-h1', level: 3, hidden: true,
      riddle: { zh: '讓餘音先到，讓敲擊最後才來。', en: 'Let the echo arrive first, and the strike come last.' },
      check: function (ev) { const d = ev.data; return revDone(ev) && d.S <= 0.001 && d.D >= 1.5 - 1e-9 && d.A <= 0.02 + 1e-9 && d.held >= 1.5 - 1e-9; }
    },
    {
      id: 'adsr-envelope-h2', level: 5, hidden: true,
      riddle: { zh: '不用照鏡子，也能看見自己倒過來的樣子。', en: 'No mirror needed to see yourself the wrong way round.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.A >= 1 - 1e-9 && d.D <= 0.02 + 1e-9 && d.S <= 0.001 && d.held >= d.A + d.D; }
    },
    {
      id: 'adsr-envelope-h3', level: 4, hidden: true,
      riddle: { zh: '一登上山頂，就鬆手。', en: 'The moment you reach the summit, let go.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.A >= 0.2 - 1e-9 && d.S <= 0.3 + 1e-9 && d.aRel >= 0.995; }
    },
    {
      id: 'adsr-envelope-h4', level: 5, hidden: true,
      riddle: { zh: '時鐘每走一格，它就把自己分一半給昨天；走了幾格，才肯站好。', en: 'Each tick of the clock it gives half of itself to yesterday; only after a few ticks does it stand still.' },
      check: function (ev) {
        const d = ev.data;
        if (!rel(ev) || d.shape !== 'exp' || d.held < d.A + d.D || !near(d.halfD, 1, 0.01)) return false;
        const n = Math.round(d.D / d.halfD);
        return n >= 2 && Math.abs(d.S * Math.pow(2, n) - 1) <= 0.05;
      }
    },
    {
      id: 'adsr-envelope-h5', level: 6, hidden: true,
      riddle: { zh: '耳朵說「剩一半」的時候，尺上只剩不到三分之一。', en: 'When the ear says “half as loud”, the ruler shows less than a third.' },
      check: function (ev) { const d = ev.data; return rel(ev) && near(d.sDb, -10, 0.2) && d.D >= 0.5 - 1e-9 && d.held >= d.A + d.D + 0.5; }
    },
    {
      id: 'adsr-envelope-h6', level: 6, hidden: true,
      riddle: { zh: '短到來不及說出自己的名字。', en: 'Too short to say its own name.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.cycles != null && d.cycles > 0 && d.cycles < 4; }
    },
    {
      id: 'adsr-envelope-h7', level: 7, hidden: true,
      riddle: { zh: '照了鏡子，卻分不出哪一邊才是倒過來的。', en: 'It looks in the mirror and cannot tell which side is reversed.' },
      check: function (ev) {
        const d = ev.data;
        return revDone(ev) && d.shape === 'lin' && d.S >= 0.99 && d.A >= 0.1 - 1e-9 && Math.abs(d.A - d.R) <= 0.01 * Math.max(d.A, d.R) + 1e-9 && d.held >= d.A;
      }
    },
    {
      id: 'adsr-envelope-h8', level: 8, hidden: true,
      riddle: { zh: '還在爬坡就鬆手，落下的路卻和走完全程的人一模一樣。', en: 'It lets go while still climbing, yet falls along exactly the same path as one who went all the way.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.phase === 'A' && d.A >= 0.2 - 1e-9 && d.S >= 0.2 - 1e-9 && d.S <= 0.9 + 1e-9 && Math.abs(d.aRel - d.S) <= 0.01; }
    },
    {
      id: 'adsr-envelope-h9', level: 9, hidden: true,
      riddle: { zh: '從谷底一路爬上山頂，坡度從沒變過；山頂的另一邊，是懸崖。', en: 'From the valley floor to the summit the slope never changes; beyond the summit, a cliff.' },
      check: function (ev) { const d = ev.data; return revDone(ev) && straight(d); }
    },
    {
      id: 'adsr-envelope-h10', level: 10, hidden: true,
      riddle: { zh: '論品質，它剛好一千分。', en: 'Judged on quality, it scores exactly a thousand.' },
      check: function (ev) { const d = ev.data; return rel(ev) && d.shape === 'exp' && d.S > 0 && d.S < 1 && near(d.Q, 1000, 10) && d.held >= d.A + d.D; }
    }
  ]);
})();
