/* missions/binary-numbers.js — 二進位與進位制的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/binary-numbers.js 發出，都在使用者操作之後）：
 *   'value'：燈號的值被設定或改變之後。
 *       { src（'toggle' 點燈、'inc' +1、'dec' −1、'shl' ×2、'shr' ÷2、'clear' 歸零、'type2'／'type8'／'type10'／'type16' 在該欄輸入、
 *              'bits' 改位元數、'base' 改進位 b、'auto' 自動數數）,
 *         n（位元數）, v（值）, prev（操作前的值）, changed（改變的燈數）, overflow（溢位或借位繞回）, ones（亮燈數）,
 *         b（任意進位的 b）, inB（v 寫成 b 進位）, hex（十六進位，大寫）,
 *         chain（上次值為 0 之後，連續只用 +1、×2 的步數；用過別的操作就是 −1）, shlRun（連續 ×2 的次數）, runStart（這串 ×2 開始前的值）,
 *         vSrc（目前這個值是哪一種操作做出來的）, prevSrc（操作前那個值是哪一種操作做出來的） }
 *   'ladder'：「十進位轉二進位」的除法階梯做完。{ v, steps（列數）, stepped（每一步都是按「下一步」做完的） }
 *   'quiz'：轉換挑戰答了一題。{ ok, streak（連續答對）, n, kind（'set' 設燈／'read' 讀燈）, base }
 *   'round'：轉換挑戰一回合（10 題）結束。{ correct, total, time（秒）, n }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  // 小工具寫在這裡（排行榜頁只載入任務檔、不載入核心）
  const B = {
    toBase: function (v, b) { return v >= 0 ? v.toString(b).toUpperCase() : ''; },
    bitLength: function (v) { return v <= 0 ? 1 : v.toString(2).length; },
    isAlternating: function (v, n) {
      if (n < 2) return false;
      const s = v.toString(2).padStart(n, '0');
      for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1]) return false;
      return s.length === n;
    },
    isRepunit: function (v, b, k) { const s = v >= 0 ? v.toString(b) : ''; return s.length >= k && /^1+$/.test(s); }
  };
  const isVal = function (ev) { return ev.type === 'value'; };
  const manual = function (d) { return d.src !== 'auto'; };   // 隱藏任務要自己動手做出來，不算自動數數經過的值
  // 親手設定的值：點燈或在四種寫法的欄位輸入（不算 ÷2、−1 這類一路滑過去剛好經過的值）
  const HAND = { toggle: 1, type2: 1, type8: 1, type10: 1, type16: 1 };
  const byHand = function (s) { return !!HAND[s]; };
  const typed = function (s) { return /^type(2|8|10|16)$/.test(s || ''); };   // 在四種寫法的欄位打出來的值
  const pal = function (s) { s = String(s); return s === s.split('').reverse().join(''); };

  LabMission.register('binary-numbers', [
    {
      id: 'binary-numbers-1', level: 1,
      title: { zh: '第一個數字', en: 'Your first number' },
      desc: { zh: '點亮幾盞燈，讓燈號表示十進位的 5。', en: 'Switch on some lamps so that they show the decimal number 5.' },
      check: function (ev) { return isVal(ev) && ev.data.v === 5; }
    },
    {
      id: 'binary-numbers-2', level: 2,
      title: { zh: '讀懂十六進位', en: 'Reading hexadecimal' },
      desc: { zh: '讓「十六進位」顯示 2A。', en: 'Make the “Hexadecimal” box show 2A.' },
      check: function (ev) { return isVal(ev) && ev.data.v === 42; }
    },
    {
      id: 'binary-numbers-3', level: 2,
      title: { zh: '加一的連鎖反應', en: 'A chain reaction from +1' },
      desc: { zh: '只按一次「+1」，讓至少 4 盞燈同時改變。', en: 'Press “+1” once and make at least 4 lamps change at the same time.' },
      check: function (ev) { return isVal(ev) && ev.data.src === 'inc' && ev.data.changed >= 4; }
    },
    {
      id: 'binary-numbers-4', level: 3,
      title: { zh: '除法階梯', en: 'The division ladder' },
      desc: { zh: '設一個至少 100 的數，在除法階梯按「下一步」，一列一列除到 0。', en: 'Set a number of at least 100 and press “Next step” on the division ladder, one row at a time, until you reach 0.' },
      check: function (ev) { return ev.type === 'ladder' && ev.data.stepped && ev.data.v >= 100; }
    },
    {
      id: 'binary-numbers-5', level: 3,
      title: { zh: '十二盞燈的極限', en: 'The limit of twelve lamps' },
      desc: { zh: '在 12 個位元時，表示能表示的最大的數。', en: 'With 12 bits, show the largest number they can hold.' },
      check: function (ev) { return isVal(ev) && ev.data.n === 12 && ev.data.v === 4095; }
    },
    {
      id: 'binary-numbers-6', level: 4,
      title: { zh: '溢位', en: 'Overflow' },
      desc: { zh: '在 8 個位元時，讓「+1」造成溢位。', en: 'With 8 bits, make “+1” overflow.' },
      check: function (ev) { return isVal(ev) && ev.data.src === 'inc' && ev.data.n === 8 && ev.data.overflow; }
    },
    {
      id: 'binary-numbers-7', level: 4,
      title: { zh: '剛剛好的位元數', en: 'Just enough bits' },
      desc: { zh: '用剛好夠用、不能再少的位元數表示 1000。', en: 'Show 1000 using the fewest bits that can hold it — not one more.' },
      check: function (ev) { return isVal(ev) && ev.data.v === 1000 && ev.data.n === 10; }
    },
    {
      id: 'binary-numbers-8', level: 5,
      title: { zh: '一個十六進位字 = 四盞燈', en: 'One hex digit = four lamps' },
      desc: { zh: '在 16 個位元時，於「十六進位」欄輸入一個四位數，讓燈恰好亮 12 盞。', en: 'With 16 bits, type a four-digit number into the “Hexadecimal” box so that exactly 12 lamps are lit.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && d.src === 'type16' && d.n === 16 && d.v >= 4096 && d.ones === 12; }
    },
    {
      id: 'binary-numbers-9', level: 5,
      title: { zh: '不是十進位的 1000', en: 'A 1000 that is not a thousand' },
      desc: { zh: '找一個進位 b，讓「b 進位」顯示 1000，而十進位剛好是 343。', en: 'Find a base b so that “Base b” shows 1000 while the decimal value is exactly 343.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && d.v === 343 && d.inB === '1000' && d.b !== 10; }
    },
    {
      id: 'binary-numbers-10', level: 6,
      title: { zh: '連對五題', en: 'Five in a row' },
      desc: { zh: '按「開始挑戰」，連續答對 5 題。', en: 'Press “Start the challenge” and answer 5 questions in a row correctly.' },
      check: function (ev) { return ev.type === 'quiz' && ev.data.ok && ev.data.streak >= 5; }
    },
    {
      id: 'binary-numbers-11', level: 7,
      title: { zh: '最少的步驟', en: 'The fewest steps' },
      desc: { zh: '按「歸零」後只用「+1」和「×2」做出 100，而且步數最少（9 步）。', en: 'After “Reset to 0”, use only “+1” and “×2” to build 100 in the fewest possible steps (9).' },
      check: function (ev) { const d = ev.data; return isVal(ev) && d.v === 100 && d.chain === 9; }
    },
    {
      id: 'binary-numbers-12', level: 9,
      title: { zh: '轉換高手', en: 'Conversion master' },
      desc: { zh: '在至少 8 個位元時按「開始挑戰」，一回合 10 題全對，而且總共不超過 90 秒。', en: 'With at least 8 bits, press “Start the challenge” and get all 10 questions of the round right within 90 seconds in total.' },
      check: function (ev) { const d = ev.data; return ev.type === 'round' && d.correct === 10 && d.total === 10 && d.time <= 90 && d.n >= 8; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'binary-numbers-h1', level: 3, hidden: true,
      riddle: { zh: '工程師檢查記憶體的時候，喜歡讓每一格都和鄰居唱反調。', en: 'When engineers test memory, they like every cell to disagree with its neighbours.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && manual(d) && d.n >= 12 && B.isAlternating(d.v, d.n); }
    },
    {
      id: 'binary-numbers-h2', level: 4, hidden: true,
      riddle: { zh: '一粒米，加倍再加倍……第十次之後，人說「一千」，機器說「這才整齊」。', en: 'One grain of rice, doubled and doubled again… After the tenth time, people say “a thousand” and the machine says “now that is a round number”.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && d.v === 1024 && d.shlRun === 10 && d.runStart === 1; }
    },
    {
      id: 'binary-numbers-h3', level: 5, hidden: true,
      riddle: { zh: '不是零的東西，加倍之後卻一無所有。', en: 'It was not nothing; it was doubled, and nothing was left.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && d.src === 'shl' && d.n >= 12 && d.prev > 0 && d.v === 0 && typed(d.prevSrc); }
    },
    {
      id: 'binary-numbers-h4', level: 5, hidden: true,
      riddle: { zh: '爪哇島上的每一份檔案，開頭都先端上一杯熱飲。', en: 'On the island of Java, every file begins by serving a hot drink.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && manual(d) && d.n === 16 && d.hex === 'CAFE'; }
    },
    {
      id: 'binary-numbers-h5', level: 6, hidden: true,
      riddle: { zh: '一、二、一。換成哪一種數法，它都排得出整整齊齊的方陣——你最熟悉的那一種不算。', en: 'One, two, one. Whichever way you count, it lines up into a perfect square — the way you know best does not count.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isVal(ev) || d.b === 10 || d.inB !== '121' || !byHand(d.vSrc)) return false;
        mem.bases = mem.bases || {};
        mem.bases[d.b] = true;
        return Object.keys(mem.bases).length >= 3;   // 在三種不同的進位裡都看到 121
      }
    },
    {
      id: 'binary-numbers-h6', level: 7, hidden: true,
      riddle: { zh: '一段連續的光，長度不可分，它自己也不可分；它不必占滿整排，而且已經超過一百歲。', en: 'An unbroken run of light whose length cannot be divided, and neither can the number itself; it need not fill the whole row, and it is already more than a hundred years old.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && typed(d.vSrc) && (d.v === 127 || d.v === 8191) && d.n > B.bitLength(d.v); }
    },
    {
      id: 'binary-numbers-h7', level: 8, hidden: true,
      riddle: { zh: '比它小的因數手牽手，剛好圍成它自己；這種數在燈排上長得特別整齊——找一個三位數以上的。', en: 'All its smaller divisors, hand in hand, add up to exactly itself, and such numbers look strikingly neat on the lamps — find one with at least three digits.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && byHand(d.vSrc) && (d.v === 496 || d.v === 8128); }
    },
    {
      id: 'binary-numbers-h8', level: 8, hidden: true,
      riddle: { zh: '1996 年，一枚火箭升空不到一分鐘就失控；兇手只是一個太大、塞不進十六格的數。重演那一步。', en: 'In 1996 a rocket went out of control less than a minute after lift-off; the culprit was just a number too big for sixteen cells. Replay that step.' },
      check: function (ev) {
        const d = ev.data;
        return isVal(ev) && d.n === 16 && typed(d.prevSrc) && ((d.src === 'inc' && d.prev === 32767) || (d.src === 'dec' && d.prev === 32768));
      }
    },
    {
      id: 'binary-numbers-h9', level: 9, hidden: true,
      riddle: { zh: '正著讀、倒著讀都一樣；換成燈的語言從頭到尾再讀一次，還是一樣——而且它有四位數以上。', en: 'It reads the same forwards and backwards; read it again in the language of the lamps, end to end, and it still does — and it has at least four digits.' },
      check: function (ev) {
        const d = ev.data;
        return isVal(ev) && manual(d) && d.v >= 1000 && d.n === B.bitLength(d.v) && pal(String(d.v)) && pal(B.toBase(d.v, 2));
      }
    },
    {
      id: 'binary-numbers-h10', level: 10, hidden: true,
      riddle: { zh: '它在兩種語言裡都只會說「一」，而且都說了三次以上。', en: 'In two different languages it can only say “one”, and in both it says it at least three times.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && byHand(d.vSrc) && d.b !== 2 && B.isRepunit(d.v, 2, 3) && B.isRepunit(d.v, d.b, 3); }
    }
  ]);
})();
