/* missions/pitch-frequency.js — 音高與頻率：從振動到音名的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/pitch-frequency.js 發出；只有學生操作時才發，載入時不發任何事件）：
 *   'pitch'：頻率或標準音改變、或換了音名寫法（滑桿放開或打字輸入、點鋼琴鍵、「＋／−1 半音」「＋／−1 八度」「加 100 Hz」、
 *            標準音的滑桿與 415／440／442／443 按鈕、升降記號、唱名、鍵盤方向鍵）。
 *     資料 = PitchCore.analyze 的全部欄位：f（Hz）、a4（標準音 Hz）、mf、midi、pc、oct、name（升記號寫法，例如 'G♯4'）、
 *       cents（相對最接近的平均律音，−50～+50）、n（相對 A4 的半音數）、nRound、T（週期 ms）、lambda（波長 m）、fNote、onKey、inPiano、
 *       insts（演奏得到的樂器與聲部：piano、piccolo、flute、violin、guitar、cello、bass、soprano、alto、tenor、bassv）
 *     再加上：via（'slider' | 'key' | 'semi' | 'oct' | 'add100' | 'a4' | 'spell' | 'solfege' | 'kbd'）、dir（+1 或 −1，半音與八度按鈕）、
 *       flat、solfege（目前的寫法）、prev（改變以前的狀態 { f, a4, midi, name, cents }）、jump（從 prev.f 到 f 跨了幾音分）、dHz（f − prev.f）。
 *   'play'：按「▶ 播放」。資料 = analyze 的全部欄位＋ flat、solfege、timbre（'pure' | 'soft'）。
 *   'compare'：按「先 A 後 B」。資料 = { A, B（各是 { f, a4, midi, name, cents }，存的時候的標準音）, cents（B 比 A 高幾音分）, dHz（B.f − A.f）}。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const cents = function (a, b) { return 1200 * Math.log(b / a) / Math.LN2; };
  const isP = function (ev) { return (ev.type === 'pitch' || ev.type === 'play') && ev.data && ev.data.f > 0; };
  const isPitch = function (ev) { return ev.type === 'pitch' && ev.data && ev.data.f > 0; };
  const isCmp = function (ev) { return ev.type === 'compare' && ev.data && ev.data.A && ev.data.B; };
  const has = function (d, id) { return (d.insts || []).indexOf(id) >= 0; };
  const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
  const PIANO_MID = (27.5 + 4186.009044809578) / 2;   // 鋼琴兩端頻率的算術平均 ≈ 2106.75 Hz
  /** 某個存起來的音剛好是它自己那個標準音的 A4 */
  const ownA4 = function (x) { return x.midi === 69 && Math.abs(x.cents) <= 2; };

  LabMission.register('pitch-frequency', [
    {
      id: 'pitch-frequency-1', level: 1,
      title: { zh: '中央 C', en: 'Middle C' },
      desc: { zh: '點鋼琴鍵或拖曳「頻率 f」，找到中央 C（C4，約 261.6 Hz）。', en: 'Tap a piano key or drag “Frequency f” to find middle C (C4, about 261.6 Hz).' },
      check: function (ev) { const d = ev.data; return isP(ev) && d.name === 'C4' && Math.abs(d.cents) <= 5; }
    },
    {
      id: 'pitch-frequency-2', level: 2,
      title: { zh: '唱名 Sol', en: 'Sol in solfège' },
      desc: { zh: '打開「唱名」（固定唱名，Do = C），找到中央 C 上面的 Sol（G4）。', en: 'Turn on “Solfège” (fixed do, do = C) and find the sol above middle C (G4).' },
      check: function (ev) { const d = ev.data; return isP(ev) && d.solfege && d.name === 'G4' && Math.abs(d.cents) <= 5; }
    },
    {
      id: 'pitch-frequency-3', level: 2,
      title: { zh: '高八度 = 頻率加倍', en: 'Up an octave = double the frequency' },
      desc: { zh: '從 440 Hz 按「＋1 八度」：頻率變成多少？（應該是 880 Hz）', en: 'From 440 Hz press “+1 octave”: what does the frequency become? (It should be 880 Hz.)' },
      check: function (ev) { const d = ev.data; return isPitch(ev) && d.via === 'oct' && d.dir > 0 && d.prev && near(d.prev.f, 440, 0.25) && near(d.f, 880, 0.5); }
    },
    {
      id: 'pitch-frequency-4', level: 3,
      title: { zh: '一毫秒振動一次', en: 'One vibration per millisecond' },
      desc: { zh: '把頻率調到週期 T 剛好 1.00 ms：它是哪個音名？偏了幾音分？', en: 'Set the frequency so that the period T is exactly 1.00 ms: which note is it, and how many cents off?' },
      check: function (ev) { const d = ev.data; return isP(ev) && near(d.f, 1000, 0.5); }
    },
    {
      id: 'pitch-frequency-5', level: 3,
      title: { zh: '換成 442', en: 'Switch to 442' },
      desc: { zh: '把「標準音 A4」換成 442 Hz，頻率保持 440 Hz：原本的 A4 現在偏了幾音分？', en: 'Change the “Standard pitch A4” to 442 Hz and keep the frequency at 440 Hz: how many cents off is the old A4 now?' },
      check: function (ev) { const d = ev.data; return isP(ev) && near(d.a4, 442, 0.005) && near(d.f, 440, 0.05); }
    },
    {
      id: 'pitch-frequency-6', level: 4,
      title: { zh: '鋼琴的兩端', en: 'Both ends of the piano' },
      desc: { zh: '找到鋼琴最低的鍵 A0 和最高的鍵 C8（兩個都要到過，偏差 5 音分以內）。', en: 'Visit the lowest piano key, A0, and the highest, C8 (both of them, within 5 cents).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isP(ev) || Math.abs(d.cents) > 5) return false;
        if (d.name === 'A0') mem.lo = true;
        if (d.name === 'C8') mem.hi = true;
        return !!(mem.lo && mem.hi);
      }
    },
    {
      id: 'pitch-frequency-7', level: 4,
      title: { zh: '低音區的 100 Hz', en: '100 Hz down low' },
      desc: { zh: '在低音區按「加 100 Hz」，讓音一口氣升高一個八度以上（1200 音分以上）。', en: 'Down in the bass, press “Add 100 Hz” so that the note jumps up more than an octave (over 1200 cents).' },
      check: function (ev) { const d = ev.data; return isPitch(ev) && d.via === 'add100' && d.jump >= 1200; }
    },
    {
      id: 'pitch-frequency-8', level: 5,
      title: { zh: '高音區的 100 Hz', en: '100 Hz up high' },
      desc: { zh: '在高音區按「加 100 Hz」，讓音升高不到一個半音（不到 100 音分）。', en: 'Up in the treble, press “Add 100 Hz” so that the note rises by less than a semitone (under 100 cents).' },
      check: function (ev) { const d = ev.data; return isPitch(ev) && d.via === 'add100' && d.jump < 100; }
    },
    {
      id: 'pitch-frequency-9', level: 5,
      title: { zh: '一公尺長的波', en: 'A wave one metre long' },
      desc: { zh: '把頻率調到聲波在 20 °C 空氣中的波長 λ 剛好 1.000 m（±2 mm）。', en: 'Set the frequency so that the wavelength λ in 20 °C air is exactly 1.000 m (±2 mm).' },
      check: function (ev) { const d = ev.data; return isP(ev) && near(d.lambda, 1, 0.002); }
    },
    {
      id: 'pitch-frequency-10', level: 6,
      title: { zh: '小提琴與大提琴的交集', en: 'Where violin and cello overlap' },
      desc: { zh: '看音域圖：小提琴和大提琴都演奏得到的那一段，最低和最高各是哪個鍵？兩個都找出來（準在鍵上，5 音分以內），各按一次「▶ 播放」。', en: 'Use the range chart: in the stretch that both the violin and the cello can play, which keys are the lowest and the highest? Find both (right on the key, within 5 cents) and press “▶ Play” on each.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'play' || Math.abs(d.cents) > 5) return false;
        if (d.name === 'G3') mem.lo = true;     // 小提琴最低的空弦 G3
        if (d.name === 'A5') mem.hi = true;     // 大提琴的大致最高音 A5
        return !!(mem.lo && mem.hi);
      }
    },
    {
      id: 'pitch-frequency-11', level: 7,
      title: { zh: '巴洛克的 A', en: 'The Baroque A' },
      desc: { zh: '按「415」，把頻率設成這個標準音下的 A4；再按「440」（頻率不動）：同一個音現在叫什麼名字？', en: 'Press “415” and set the frequency to the A4 of that standard; then press “440” (frequency unchanged): what is the same note called now?' },
      check: function (ev) {
        const d = ev.data;
        return isPitch(ev) && d.via === 'a4' && d.prev && near(d.prev.a4, 415, 0.5) && ownA4(d.prev) && near(d.a4, 440, 0.005) && near(d.prev.f, d.f, 1e-6) && d.midi === 68;
      }
    },
    {
      id: 'pitch-frequency-12', level: 8,
      title: { zh: '等比才是等距', en: 'Equal ratios sound equal' },
      desc: { zh: '用「存成 A」「存成 B」「先 A 後 B」比較兩次：兩次的音程一樣（相差 2 音分以內、至少一個半音），但兩次的赫茲差相差 8 倍以上。', en: 'Use “Store as A”, “Store as B” and “A then B” to compare twice: the two intervals are the same (within 2 cents, at least a semitone), but their differences in hertz differ by a factor of 8 or more.' },
      check: function (ev, mem) {
        if (!isCmp(ev)) return false;
        const c = Math.abs(ev.data.cents), hz = Math.abs(ev.data.dHz);
        const list = mem.list || (mem.list = []);
        const ok = c >= 100 && list.some(function (e) { return Math.abs(e.c - c) <= 2 && Math.max(hz / e.hz, e.hz / hz) >= 8; });
        list.push({ c: c, hz: hz });
        if (list.length > 30) list.shift();
        return ok;
      }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'pitch-frequency-h1', level: 3, hidden: true,
      riddle: { zh: '藏在牆裡的那條河，每秒來回的次數，也唱得出一個音。', en: 'The river hidden in the walls turns back so many times a second — it, too, can be sung.' },
      // 臺灣的交流電是 60 Hz（變壓器、日光燈的嗡嗡聲常在 60 或 120 Hz）：播放 60 Hz（±0.05）——在 B1 與 A♯1 之間
      check: function (ev) { return ev.type === 'play' && near(ev.data.f, 60, 0.05); }
    },
    {
      id: 'pitch-frequency-h2', level: 4, hidden: true,
      riddle: { zh: '把一層樓從耳朵的中點剪開——魔鬼就住在那裡。', en: 'Cut one floor in two at the ear’s midpoint — the devil lives there.' },
      // 三全音：比較的兩個音相差 600 音分（±1），頻率比 √2，是八度在對數軸上的正中間
      check: function (ev) { return isCmp(ev) && near(Math.abs(ev.data.cents), 600, 1); }
    },
    {
      id: 'pitch-frequency-h3', level: 5, hidden: true,
      riddle: { zh: '一位皇帝召集了委員會，替全國的樂團定下同一聲「啦」。去聽聽它。', en: 'An emperor’s committee once fixed one “la” for every orchestra in the land. Go and listen to it.' },
      // 1859 年法國的「標準音高」（diapason normal）A4 = 435 Hz：標準音設成 435，播放這個標準下的 A4
      check: function (ev) { const d = ev.data; return ev.type === 'play' && near(d.a4, 435, 0.005) && d.name === 'A4' && near(d.f, 435, 0.05); }
    },
    {
      id: 'pitch-frequency-h4', level: 5, hidden: true,
      riddle: { zh: '在最深的地底，只挪一小步，就走掉了半個鍵。', en: 'Deep underground, one tiny step carries you half a key away.' },
      // 只差 1 Hz（±0.01）的兩個音，音程卻有 50 音分以上：只有 34.6 Hz 以下才做得到
      check: function (ev) { return isCmp(ev) && near(Math.abs(ev.data.dHz), 1, 0.01) && Math.abs(ev.data.cents) >= 50; }
    },
    {
      id: 'pitch-frequency-h5', level: 6, hidden: true,
      riddle: { zh: '拿直尺量出鍵盤的正中央——耳朵卻說，那裡幾乎到了天邊。', en: 'Measure the middle of the keyboard with a ruler — the ear says it is almost at the far edge.' },
      // 鋼琴兩端頻率（27.5 Hz 與 4186 Hz）的算術平均 ≈ 2106.75 Hz（±0.5）：已經在 C7 附近，比中央 C 高三個八度
      check: function (ev) { return isP(ev) && near(ev.data.f, PIANO_MID, 0.5); }
    },
    {
      id: 'pitch-frequency-h6', level: 7, hidden: true,
      riddle: { zh: '兩把只差一點點的尺，量同一根棍子，卻喊出不同的名字。兩次都要仔細聽。', en: 'Two rulers that differ by a hair measure the same stick and call it different names. Listen carefully both times.' },
      // 樂團常用的標準音（440、442、443）之間換：同一個頻率播放兩次，換標準音前後音名不同（只有剛好在兩鍵中間附近的頻率才會）
      check: function (ev, mem) {
        if (ev.type !== 'play') return false;
        const d = ev.data, p = mem.last;
        const orch = function (a) { return [440, 442, 443].some(function (s) { return near(a, s, 0.005); }); };
        mem.last = { f: d.f, a4: d.a4, midi: d.midi };
        return !!p && orch(p.a4) && orch(d.a4) && !near(p.a4, d.a4, 0.005) && near(p.f, d.f, 1e-6) && p.midi !== d.midi;
      }
    },
    {
      id: 'pitch-frequency-h7', level: 8, hidden: true,
      riddle: { zh: '有人主張：Do 應該站在二的某一級臺階上，而且一點都不歪。', en: 'Someone once argued that do should stand on one of the stairs of two — and not a hair off.' },
      // 「科學音高」：C4 = 256 Hz = 2^8（±0.05），而且準在鍵上（±0.5 音分）——要把標準音改成約 430.54 Hz
      check: function (ev) { const d = ev.data; return isP(ev) && d.name === 'C4' && near(d.f, 256, 0.05) && Math.abs(d.cents) <= 0.5; }
    },
    {
      id: 'pitch-frequency-h8', level: 8, hidden: true,
      riddle: { zh: '每一步都一樣長，聽起來卻一步比一步短——號角早就知道這個秘密。從最整齊的地方出發，走四步。', en: 'Every step is the same length, yet each sounds shorter than the last — the bugle has always known. Start from the tidiest place and take four steps.' },
      // 從 100 Hz 連按四次「加 100 Hz」：100 → 200 → 300 → 400 → 500，依序是八度、純五度、純四度、純大三度（泛音列 1:2:3:4:5）
      check: function (ev, mem) {
        if (!isPitch(ev)) return false;
        const d = ev.data;
        if (d.via !== 'add100' || !d.prev) { mem.k = 0; return false; }
        if (near(d.prev.f, 100, 0.05)) mem.k = 1;
        else if (mem.k && near(d.prev.f, 100 + 100 * mem.k, 0.05)) mem.k++;
        else mem.k = 0;
        return mem.k >= 4;
      }
    },
    {
      id: 'pitch-frequency-h9', level: 9, hidden: true,
      riddle: { zh: '找到那個地方：耳朵的最小一格，剛好是尺上的一百。', en: 'Find the place where the ear’s smallest rung is exactly a hundred on the ruler.' },
      // 「＋1 半音」或「−1 半音」剛好改變 100 Hz（±0.05）：f · (2^(1/12) − 1) = 100 ⇒ f ≈ 1681.72 Hz（G♯6 附近）
      check: function (ev) { const d = ev.data; return isPitch(ev) && d.via === 'semi' && d.prev && near(Math.abs(d.dHz), 100, 0.05); }
    },
    {
      id: 'pitch-frequency-h10', level: 10, hidden: true,
      riddle: { zh: '同一張樂譜上的 A：在教堂的管風琴旁和在宮廷的室內樂裡，相隔整整一步。把兩個都留下來，並排聽。', en: 'The same written A: beside the church organ and in the court’s chamber music, a whole step apart. Keep both and hear them side by side.' },
      // 巴洛克時代德國的「合唱音高」（Chorton，約 A = 465 Hz）與「室內樂音高」（Cammerton，約 A = 415 Hz）：
      // 兩個記憶各存「自己那個標準音的 A4」，一個標準音在 460–466 Hz、另一個在 410–418 Hz，兩者相差 180–215 音分
      check: function (ev) {
        if (!isCmp(ev)) return false;
        const A = ev.data.A, B = ev.data.B;
        if (!ownA4(A) || !ownA4(B)) return false;
        const hi = A.a4 > B.a4 ? A : B, lo = A.a4 > B.a4 ? B : A;
        const c = Math.abs(cents(A.f, B.f));
        return hi.a4 >= 460 && hi.a4 <= 466 && lo.a4 >= 410 && lo.a4 <= 418 && c >= 180 && c <= 215;
      }
    }
  ]);
})();
