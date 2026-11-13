/* missions/string-instrument.js — 弦樂器：弦長、張力與品格的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/string-instrument.js 發出，都在使用者操作之後；預設載入時不發任何事件）：
 *   'tune'：弦長、張力、線密度、材料或直徑改完之後（滑桿放開、打字輸入、±0.1 鈕、切換材料或 μ 的設定方式）。
 *           { changed（'L' | 'T' | 'mu' | 'd' | 'mat' | 'mode'）, prev（改之前：{ inst, si, L, T, mu, fOpen, mode, mat, d }），
 *             以及 StringCore.analyze 的全部欄位 }
 *   'pluck'：按「撥一下」、在畫布的弦上拉起來放開、或按 P 鍵。{ via（'button' | 'canvas' | 'key'），以及 analyze 的全部欄位 }
 *   'bow'：小提琴或二胡開始拉弓。{ via, bowId，以及 analyze（擦弦）的全部欄位 }
 *   'slide'：拉弓中改了手指位置。{ inst, si, bowId, s（手指位置，半音）, sMin, sMax（這一弓走過的範圍）, maxStep（單次最大跳動，半音）, f1, fOpen }
 * analyze 的欄位：inst、si、target（目標 MIDI）、L、T、mu、muG、mode、mat、d、hand（'press' | 'touch'）、fret（吉他按弦時的品）、
 *   finger（無品樂器的手指位置）、rule（'et' | 'r18'）、touch（輕觸位置 ξ）、touchFret、beta、bow、v、fOpen、Leff、f1、
 *   A（頻譜，最強 = 1）、a、peak、silent、lowest（聽到的最低泛音）、fSound、centsUp（聽到的音比空弦高幾音分）、
 *   note、noteCents、opens（各弦空弦頻率）、devs（各弦離目標幾音分）、Ts（各弦張力）、gap18。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const cents = function (r) { return 1200 * Math.log(r) / Math.LN2; };
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const E4 = 440 * Math.pow(2, -5 / 12);           // 329.63 Hz
  const P4 = cents(4 / 3), M3 = cents(5 / 4), P5 = cents(3 / 2);
  /** 同一條弦、弦沒有被調過（弦長與空弦頻率相同） */
  const sameString = function (a, b) {
    return a && b && a.inst === b.inst && a.si === b.si && Math.abs(a.L - b.L) < 1e-9 && Math.abs(a.fOpen - b.fOpen) <= 1e-9 * b.fOpen;
  };
  /** 只改了一個量（同一條弦）：prev 與現在比較 */
  const onlyChanged = function (d, what) {
    const p = d.prev;
    if (!p || d.changed !== what || p.inst !== d.inst || p.si !== d.si) return false;
    if (what !== 'L' && Math.abs(p.L - d.L) > 1e-9) return false;
    if (what !== 'T' && Math.abs(p.T - d.T) > 1e-9) return false;
    return Math.abs(p.mu - d.mu) <= 1e-9 * d.mu;
  };
  const pluckLike = function (ev) { return ev.type === 'pluck' || ev.type === 'bow'; };

  LabMission.register('string-instrument', [
    {
      id: 'string-instrument-1', level: 1,
      title: { zh: '一半的弦，高八度', en: 'Half the string, an octave up' },
      desc: { zh: '選「古典吉他」，用現代的品格把「按第幾品」設成 12，按「撥一下」：聽到的頻率正好是空弦的 2 倍。', en: 'Choose “Guitar”, set “Fret pressed” to 12 with modern fret spacing, and press “Pluck”: the frequency is exactly twice the open string’s.' },
      check: function (ev) { const d = ev.data; return ev.type === 'pluck' && d.inst === 'guitar' && d.hand === 'press' && d.fret === 12 && d.rule === 'et'; }
    },
    {
      id: 'string-instrument-2', level: 2,
      title: { zh: '輕輕一碰，高了十二度', en: 'A light touch, a twelfth higher' },
      desc: { zh: '選「輕觸泛音」，按「第 7 品」，再按「撥一下」：只剩 3 的倍數的泛音，聽到空弦的 3 倍頻率。', en: 'Choose “Touch a harmonic”, press “Fret 7”, then “Pluck”: only multiples of 3 survive, and you hear three times the open-string frequency.' },
      check: function (ev) { const d = ev.data; return ev.type === 'pluck' && d.hand === 'touch' && d.lowest === 3 && d.touchFret >= 6.7 && d.touchFret <= 7.3; }
    },
    {
      id: 'string-instrument-3', level: 2,
      title: { zh: '少了第三根', en: 'The missing third' },
      desc: { zh: '按弦（不是輕觸），把「撥弦位置」調到 1/3（0.33 附近），按「撥一下」：頻譜上第 3 泛音幾乎消失。', en: 'Press the string (not a touch), set the “Pluck position” to 1/3 (about 0.33) and press “Pluck”: the 3rd harmonic all but vanishes from the spectrum.' },
      check: function (ev) { const d = ev.data; return ev.type === 'pluck' && d.hand === 'press' && near(d.beta, 1 / 3, 0.005) && d.A && d.A[2] < 0.02; }
    },
    {
      id: 'string-instrument-4', level: 3,
      title: { zh: '標準音 A4', en: 'Concert A' },
      desc: { zh: '像樂手轉弦軸一樣只調「張力 T」，把小提琴的 A 弦（或二胡的外弦）調到 A4 = 440 Hz（±1 Hz）。', en: 'Turn the peg like a player — change only the “Tension T” — until the violin’s A string (or the erhu’s outer string) is A4 = 440 Hz (±1 Hz).' },
      // 只算「調張力」把本來就該是 A4 的弦調準（亂按改線密度、弦長剛好碰到 440 Hz 不算）
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && d.changed === 'T' && d.target === 69 && near(d.fOpen, 440, 1); }
    },
    {
      id: 'string-instrument-5', level: 4,
      title: { zh: '用力拉，高八度', en: 'Pull harder for the octave' },
      desc: { zh: '只改「張力 T」（一次拖曳或一次輸入），讓空弦升高正好一個八度（±2 音分）。張力要變成幾倍？', en: 'Change only the “Tension T” (one drag or one typed value) so that the open string rises exactly one octave (±2 cents). By what factor must the tension change?' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'tune' && onlyChanged(d, 'T') && near(cents(d.fOpen / d.prev.fOpen), 1200, 2);
      }
    },
    {
      id: 'string-instrument-6', level: 4,
      title: { zh: '二胡的滑音', en: 'The erhu glissando' },
      desc: { zh: '選「二胡」，按「拉弓（持續音）」，一邊拉一邊把「手指位置」從 0 慢慢滑到 12（一個八度），中間不停弓。', en: 'Choose “Erhu”, press “Bow (sustained)”, and while bowing slide the “Finger position” smoothly from 0 up to 12 (an octave) without stopping the bow.' },
      check: function (ev) { const d = ev.data; return ev.type === 'slide' && d.inst === 'erhu' && d.sMin <= 0.1 && d.sMax >= 11.95 && d.maxStep <= 3; }
    },
    {
      id: 'string-instrument-7', level: 5,
      title: { zh: '為什麼要纏繞', en: 'Why wind the bass strings' },
      desc: { zh: '吉他第 6 弦改用「材料與直徑」、選「尼龍」，弦長 0.65 m、張力維持 60–80 N，要多粗的實心尼龍才調得到 E2（±5 音分）？', en: 'Switch the guitar’s 6th string to “Material and diameter”, choose “Nylon”, keep the length at 0.65 m and the tension between 60 and 80 N: how thick must solid nylon be to reach E2 (±5 cents)?' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'tune' && d.inst === 'guitar' && d.si === 0 && d.mode === 'mat' && d.mat === 'nylon' && near(d.L, 0.65, 0.001) &&
          d.T >= 60 && d.T <= 80 && d.devs && near(d.devs[0], 0, 5);
      }
    },
    {
      id: 'string-instrument-8', level: 6,
      title: { zh: '吉他調好音', en: 'A guitar in tune' },
      desc: { zh: '把古典吉他六條弦都調到 E2 A2 D3 G3 B3 E4（每條 ±3 音分，看「調弦表」）。', en: 'Tune all six guitar strings to E2 A2 D3 G3 B3 E4 (each within ±3 cents; watch the “Tuning table”).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'tune' && d.inst === 'guitar' && d.devs && d.devs.length === 6 && d.devs.every(function (c) { return Math.abs(c) <= 3; });
      }
    },
    {
      id: 'string-instrument-9', level: 7,
      title: { zh: '尼龍與鋼', en: 'Nylon and steel' },
      desc: { zh: '用「材料與直徑」做兩條一樣粗、一樣長的弦，一條「尼龍」、一條「鋼」，都調到同一個音（±5 音分）。比一比兩條弦的張力差幾倍。', en: 'With “Material and diameter”, make two strings of the same thickness and length, one “Nylon” and one “Steel”, and tune both to the same note (±5 cents). Compare their tensions.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'tune' || d.mode !== 'mat') return false;
        mem[d.mat] = { d: d.d, L: d.L, f: d.fOpen, T: d.T };
        const n = mem.nylon, s = mem.steel;
        return !!(n && s && Math.abs(n.d - s.d) <= 0.005 && Math.abs(n.L - s.L) <= 0.001 && Math.abs(cents(n.f / s.f)) <= 5);
      }
    },
    {
      id: 'string-instrument-10', level: 8,
      title: { zh: '小提琴的純五度', en: 'The violin’s pure fifths' },
      desc: { zh: '把小提琴的 A 弦調到 440 Hz（±0.5 Hz），再讓 G–D、D–A、A–E 都是純五度 3:2（±1 音分）。', en: 'Tune the violin’s A string to 440 Hz (±0.5 Hz) and make G–D, D–A and A–E all pure 3:2 fifths (±1 cent).' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'tune' || d.inst !== 'violin' || !d.opens || d.opens.length !== 4 || !near(d.opens[2], 440, 0.5)) return false;
        for (let k = 0; k < 3; k++) if (!near(cents(d.opens[k + 1] / d.opens[k]), P5, 1)) return false;
        return true;
      }
    },
    {
      id: 'string-instrument-11', level: 9,
      title: { zh: '用泛音調弦', en: 'Tuning by harmonics' },
      desc: { zh: '在相鄰兩條弦上用「輕觸泛音」各撥一個泛音（泛音次數不同，例如吉他第 6 弦「第 5 品」與第 5 弦「第 7 品」），把兩條弦調到兩個泛音完全同音（±0.5 音分）。', en: 'On two neighbouring strings, pluck a harmonic on each with “Touch a harmonic” (different harmonic numbers — e.g. “Fret 5” on the guitar’s 6th string and “Fret 7” on the 5th) and tune until the two harmonics match exactly (±0.5 cents).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'pluck' || d.hand !== 'touch' || d.silent || !(d.lowest >= 2)) return false;
        const h = mem.h = mem.h || {};
        h[d.inst + d.si] = { inst: d.inst, si: d.si, n: d.lowest, f: d.fSound, fOpen: d.fOpen, L: d.L };
        return [d.si - 1, d.si + 1].some(function (j) {
          const o = h[d.inst + j];
          return o && o.n !== d.lowest && Math.abs(o.L - d.L) < 1e-9 && d.opens[j] != null &&
            Math.abs(o.fOpen - d.opens[j]) <= 1e-9 * o.fOpen && Math.abs(cents(d.fSound / o.f)) <= 0.5;
        });
      }
    },
    {
      id: 'string-instrument-12', level: 10,
      title: { zh: '一個音，六條弦', en: 'One note, six strings' },
      desc: { zh: '吉他在標準調弦下（每條 ±5 音分），在六條不同的弦上都撥出 E4（329.63 Hz，±5 音分）：可以按弦，也可以用「輕觸泛音」。', en: 'With the guitar in standard tuning (each string within ±5 cents), play E4 (329.63 Hz, ±5 cents) on all six strings — by pressing a fret or with “Touch a harmonic”.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'pluck' || d.inst !== 'guitar' || !d.fSound || !d.devs || !d.devs.every(function (c) { return Math.abs(c) <= 5; })) return false;
        if (!near(cents(d.fSound / E4), 0, 5)) return false;
        mem.got = mem.got || {};
        mem.got[d.si] = true;
        return Object.keys(mem.got).length >= 6;
      }
    },

    // ---------------- 隱藏任務（提示很隱晦；完成時只說「隱藏任務完成」） ----------------
    {
      id: 'string-instrument-h1', level: 3, hidden: true,
      riddle: { zh: '同一個高度，一次踩實，一次踮腳。', en: 'The same height: once standing firm, once on tiptoe.' },
      // 同一條弦連續撥兩次：一次按弦、一次輕觸泛音，兩次的音高相同（±1 音分）
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'pluck') return false;
        const last = mem.last;
        mem.last = d;
        return !!(last && sameString(last, d) && last.hand !== d.hand && d.fSound && last.fSound && Math.abs(cents(d.fSound / last.fSound)) <= 1);
      }
    },
    {
      id: 'string-instrument-h2', level: 4, hidden: true,
      riddle: { zh: '三分損一。', en: 'Take away one third.' },
      // 只改弦長，變成原來的 2/3：升高一個純五度（701.955 ± 0.5 音分）
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && onlyChanged(d, 'L') && near(cents(d.fOpen / d.prev.fOpen), P5, 0.5); }
    },
    {
      id: 'string-instrument-h3', level: 5, hidden: true,
      riddle: { zh: '力氣加倍，卻只走到魔鬼站的地方。', en: 'Double the effort, and you only get as far as where the devil stands.' },
      // 只改張力，變成 2 倍：升高 600 音分（三全音，中世紀稱為「音樂裡的魔鬼」）
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && onlyChanged(d, 'T') && near(d.T / d.prev.T, 2, 0.004) && near(cents(d.fOpen / d.prev.fOpen), 600, 2); }
    },
    {
      id: 'string-instrument-h4', level: 7, hidden: true,
      riddle: { zh: '沒有柵欄的路上，只留下五分之四。', en: 'On a road without fences, keep only four fifths.' },
      // 無品樂器按弦，振動部分剩 4/5：純大三度 5:4（386.31 ± 0.5 音分），撥或拉弓
      check: function (ev) {
        const d = ev.data;
        return pluckLike(ev) && d.hand === 'press' && d.finger != null && !d.silent && d.fSound && near(cents(d.f1 / d.fOpen), M3, 0.5);
      }
    },
    {
      id: 'string-instrument-h5', level: 6, hidden: true,
      riddle: { zh: '指板走完了，在洞口輕輕一點。', en: 'Past the end of the fingerboard, a light touch by the hole.' },
      // 吉他輕觸 3/4 處（看不見的「第 24 品」，在音孔附近）：第 4 泛音
      check: function (ev) { const d = ev.data; return ev.type === 'pluck' && d.inst === 'guitar' && d.hand === 'touch' && d.touch >= 0.747 && d.touch <= 0.753 && d.lowest === 4; }
    },
    {
      id: 'string-instrument-h6', level: 7, hidden: true,
      riddle: { zh: '只准它唱那首歌，又捂住了那首歌的嘴。', en: 'Allow it only one song, then cover that song’s mouth.' },
      // 輕觸 1/3（或 2/3）只留 3 的倍數，又剛好撥在 1/3：3 的倍數全是零 → 幾乎無聲
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'pluck' && d.hand === 'touch' && d.silent && (near(d.touch, 1 / 3, 0.004) || near(d.touch, 2 / 3, 0.004)) && near(d.beta, 1 / 3, 0.002);
      }
    },
    {
      id: 'string-instrument-h7', level: 9, hidden: true,
      riddle: { zh: '異卵雙胞胎唱同一個音，壯的那個要四個人才拉得住。', en: 'Fraternal twins sing one note; it takes four to hold the stout one.' },
      // 同一把琴的兩條弦空弦同音（±3 音分），張力正好差 4 倍（同長度同音 → 張力比 = 線密度比；直徑 2 倍就是 4 倍）
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'tune' || !d.opens || !d.Ts) return false;
        for (let i = 0; i < d.opens.length; i++) {
          for (let j = 0; j < d.opens.length; j++) {
            if (i === j) continue;
            const r = d.Ts[i] / d.Ts[j];
            if (r >= 3.96 && r <= 4.04 && Math.abs(cents(d.opens[i] / d.opens[j])) <= 3) return true;
          }
        }
        return false;
      }
    },
    {
      id: 'string-instrument-h8', level: 6, hidden: true,
      riddle: { zh: '最後一道柵欄，幾乎就站在影子上。', en: 'The last fence stands almost on a shadow.' },
      // 同一條吉他弦連續撥：按第 19 品（2^(1/12)）與輕觸 2/3 處（第 3 泛音的節點），兩者只差 1.96 音分
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'pluck') return false;
        const last = mem.last;
        mem.last = d;
        if (!last || !sameString(last, d) || d.inst !== 'guitar') return false;
        const isFret = function (x) { return x.hand === 'press' && x.fret === 19 && x.rule === 'et'; };
        const isNode = function (x) { return x.hand === 'touch' && x.touch >= 0.664 && x.touch <= 0.6687 && x.lowest === 3; };
        return (isFret(last) && isNode(d)) || (isNode(last) && isFret(d));
      }
    },
    {
      id: 'string-instrument-h9', level: 8, hidden: true,
      riddle: { zh: '口訣與公式吵得最兇的那一格，兩邊都聽一次。', en: 'Where the rhyme and the formula quarrel most, listen to both.' },
      // 18 法則與 2^(1/12) 位置差最大的是第 17 品：同一條弦連續撥，第 17 品兩種品格各一次
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'pluck') return false;
        const last = mem.last;
        mem.last = d;
        return !!(last && sameString(last, d) && d.inst === 'guitar' && last.hand === 'press' && d.hand === 'press' &&
          last.fret === 17 && d.fret === 17 && last.rule !== d.rule);
      }
    },
    {
      id: 'string-instrument-h10', level: 10, hidden: true,
      riddle: { zh: '每一步都走得乾乾淨淨，回到家卻發現門牌差了一點。', en: 'Every step perfectly clean, yet home turns out to be next door.' },
      // 吉他相鄰兩弦全部調成純音程（四度 4:3、G–B 大三度 5:4），兩條 E 弦就差了 21.5 音分（同音差），不是兩個八度
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'tune' || d.inst !== 'guitar' || !d.opens || d.opens.length !== 6) return false;
        const want = [P4, P4, P4, M3, P4];
        for (let k = 0; k < 5; k++) if (!near(cents(d.opens[k + 1] / d.opens[k]), want[k], 1)) return false;
        return true;
      }
    }
  ]);
})();
