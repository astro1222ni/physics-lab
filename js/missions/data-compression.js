/* missions/data-compression.js — 資料壓縮（遊程編碼與霍夫曼編碼）的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/data-compression.js 發出，都在使用者操作之後；載入、預設圖與預設文字不送）：
 *   'rle'：黑白圖或遊程編碼的設定改變之後。
 *       { src（'paint' 親手畫、'preset' 按圖案按鈕、'scan' 換掃描順序、'fmt' 換格式、'k' 改長度欄位）,
 *         origin（目前這張圖從哪個圖案開始：'blank' 清空、'heart'、'smile'、'house'、'noise'）, painted（從那之後親手改了幾格）,
 *         scan（'row'／'col'／'snake'）, fmt（'pair' 顏色＋長度／'alt' 只記長度）, k（長度欄位位元數 2–8）,
 *         raw（原始 256）, runs（遊程數，拆段前）, segs（拆段後的段數）, bits（編碼後位元數）, per（每段位元）, black（黑格數）,
 *         bitsByK（k = 2…8 的編碼後位元數，陣列）, hash（圖的指紋：同一張圖相同） }
 *   'rleRun'：按「播放」或「下一步」把整張圖掃完。上面的欄位 ＋ { stepped（全程都是按「下一步」） }
 *   'huff'：霍夫曼樹重建之後。
 *       { src（'typed' 自己打字、'example' 範例按鈕、'tie' 換平手規則）, typed（目前的文字是不是自己打的）, tid（文字的指紋，不含文字本身）,
 *         N（字數）, k（字的種類）, counts（各字次數，由大到小）, lens（對應的碼長）, H（熵）, L（平均碼長）,
 *         fixed（固定長度 ⌈log2 k⌉）, fixedBits（固定長度編碼的總位元）, bits（霍夫曼編碼的總位元）, utf8Bits,
 *         maxLen, minLen（最長、最短碼）, tie（'old'／'new'） }
 *   'huffDone'：建樹的動畫走到最後一步。{ stepped（全程都是按「下一步」）, k, N, typed, tie }
 *   'decode'：解碼走到最後一個位元。
 *       { stepped（全程按「下一位」）, flip（弄錯第幾個位元，0 = 沒有）, ok（和原文一樣）, origLen, outLen, leftover（最後沒走到葉的位元數）,
 *         resync（出錯後有沒有對回來）, after（原文在出錯的字之後還有幾個字）, k, N, typed }
 *   'quiz'：解碼挑戰答了一題。{ ok, streak（連續答對）, k, maxLen }
 *   'round'：解碼挑戰一回合（5 題）結束。{ correct, total, time（秒）, k }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const EPS = 1e-9;
  const is = function (ev, t) { return ev.type === t; };
  const allSame = function (a) { for (let i = 1; i < a.length; i++) if (a[i] !== a[0]) return false; return a.length > 0; };
  const distinct = function (a) { const o = {}; (a || []).forEach(function (x) { o[x] = 1; }); return Object.keys(o).length; };
  const pow2 = function (n) { return n >= 1 && (n & (n - 1)) === 0; };
  const sameArr = function (a, b) { if (!a || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  /** 由小到大排好後是不是 1, 1, 2, 3, 5, 8…（費氏數列的前 k 項） */
  const isFib = function (desc) {
    const a = desc.slice().reverse();
    if (a.length < 2 || a[0] !== 1 || a[1] !== 1) return false;
    for (let i = 2; i < a.length; i++) if (a[i] !== a[i - 1] + a[i - 2]) return false;
    return true;
  };
  // Huffman（1952）論文表 II 的 13 個機率（× 100）
  const TABLE2 = [20, 18, 10, 10, 10, 6, 6, 4, 4, 4, 4, 3, 1];
  /** 同一段文字在兩種平手規則下的最長碼（記在 mem；換文字就重來） */
  const tieMemo = function (d, mem) {
    if (mem.tid !== d.tid) { mem.tid = d.tid; mem.len = {}; }
    mem.len[d.tie] = d.maxLen;
    return mem.len;
  };

  LabMission.register('data-compression', [
    {
      id: 'data-compression-1', level: 1,
      title: { zh: '看掃描頭讀完一張圖', en: 'Watch a picture being scanned' },
      desc: { zh: '按「播放」，讓掃描頭一格一格讀完整張黑白圖。', en: 'Press “Play” and let the scan head read the whole black-and-white picture, square by square.' },
      check: function (ev) { return is(ev, 'rleRun'); }
    },
    {
      id: 'data-compression-2', level: 2,
      title: { zh: '越壓越大', en: 'Compressed into something bigger' },
      desc: { zh: '按「清空」後自己畫一張圖，讓編碼後的位元數比原始的 256 位元還多。', en: 'Press “Clear”, paint your own picture and make the encoded size larger than the original 256 bits.' },
      check: function (ev) { const d = ev.data; return is(ev, 'rle') && d.origin === 'blank' && d.painted >= 1 && d.bits > d.raw; }
    },
    {
      id: 'data-compression-3', level: 3,
      title: { zh: '換個方向讀', en: 'Read it the other way' },
      desc: { zh: '同一張圖、同樣的格式，只切換「逐列」「逐行」「蛇行」，讓編碼後的位元數變成原來的一半以下。', en: 'Keep the same picture and format and only switch between “By rows”, “By columns” and “Snake”, so that the encoded size drops to half or less.' },
      check: function (ev, mem) {
        if (!is(ev, 'rle')) return false;
        const d = ev.data, key = d.hash + '|' + d.fmt + '|' + d.k;
        if (!mem.s || Object.keys(mem.s).length > 300) mem.s = {};
        const rec = mem.s[key] = mem.s[key] || {};
        rec[d.scan] = d.bits;
        if (d.src !== 'scan') return false;
        return Object.keys(rec).some(function (sc) { return sc !== d.scan && d.bits * 2 <= rec[sc]; });
      }
    },
    {
      id: 'data-compression-4', level: 3,
      title: { zh: '一步一步長出樹', en: 'Grow the tree step by step' },
      desc: { zh: '用至少 5 種不同的字，按「下一步」一步一步把霍夫曼樹建完。', en: 'With at least 5 different characters, press “Next step” again and again until the Huffman tree is complete.' },
      check: function (ev) { const d = ev.data; return is(ev, 'huffDone') && d.stepped && d.k >= 5; }
    },
    {
      id: 'data-compression-5', level: 4,
      title: { zh: '剛剛好的長度欄位', en: 'Just the right length field' },
      desc: { zh: '調整「長度欄位 k（位元）」，找出讓這張圖編碼後最短的 k（而且比 k = 8 更省）。', en: 'Adjust “Length field k (bits)” and find the k that makes this picture shortest after encoding (and shorter than with k = 8).' },
      check: function (ev) {
        const d = ev.data;
        if (!is(ev, 'rle') || d.src !== 'k' || d.k === 8 || !d.bitsByK) return false;
        return d.bits === Math.min.apply(null, d.bitsByK) && d.bits < d.bitsByK[d.bitsByK.length - 1];
      }
    },
    {
      id: 'data-compression-6', level: 4,
      title: { zh: '親手解碼', en: 'Decode it by hand' },
      desc: { zh: '用至少 3 種字、6 個字以上的文字，按「下一位」一位一位把整串位元解碼回原文。', en: 'With a text of at least 6 characters and at least 3 different ones, press “Next bit” one bit at a time until the whole string is decoded back into the text.' },
      check: function (ev) { const d = ev.data; return is(ev, 'decode') && d.stepped && d.ok && d.flip === 0 && d.k >= 3 && d.N >= 6; }
    },
    {
      id: 'data-compression-7', level: 5,
      title: { zh: '一半是黑的，卻幾乎不用位元', en: 'Half black, almost no bits' },
      desc: { zh: '讓至少一半的格子是黑的，而編碼後不超過 25 位元。', en: 'Make at least half of the squares black while the encoded picture takes no more than 25 bits.' },
      check: function (ev) { const d = ev.data; return is(ev, 'rle') && d.black >= 128 && d.bits <= 25; }
    },
    {
      id: 'data-compression-8', level: 5,
      title: { zh: '省下四分之一', en: 'Save a quarter' },
      desc: { zh: '自己打一段至少 30 個字的文字，讓霍夫曼編碼比固定長度編碼少 25% 以上。', en: 'Type your own text of at least 30 characters so that the Huffman code is at least 25% shorter than the fixed-length code.' },
      check: function (ev) { const d = ev.data; return is(ev, 'huff') && d.typed && d.N >= 30 && d.fixedBits > 0 && d.bits <= 0.75 * d.fixedBits; }
    },
    {
      id: 'data-compression-9', level: 6,
      title: { zh: '一樣好的兩棵樹', en: 'Two trees, equally good' },
      desc: { zh: '自己打一段至少 10 個字、4 種字的文字，在「舊的優先」和「新的優先」之間切換，讓最長的碼長度不一樣（平均碼長卻相同）。', en: 'Type your own text of at least 10 characters with at least 4 different ones, and switch between “Older first” and “Newer first” so that the longest code has a different length (while the average length stays the same).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!is(ev, 'huff') || !d.typed || d.N < 10 || d.k < 4) return false;
        const len = tieMemo(d, mem);
        return d.src === 'tie' && len.old != null && len.new != null && len.old !== len.new;
      }
    },
    {
      id: 'data-compression-10', level: 7,
      title: { zh: '碰到熵的下限', en: 'Touch the entropy limit' },
      desc: { zh: '自己打一段至少 8 個字的文字，讓碼長至少有 3 種不同的長度，而且平均碼長 L 剛好等於熵 H。', en: 'Type your own text of at least 8 characters whose codes come in at least 3 different lengths, and make the average code length L equal the entropy H exactly.' },
      check: function (ev) { const d = ev.data; return is(ev, 'huff') && d.typed && d.N >= 8 && distinct(d.lens) >= 3 && Math.abs(d.L - d.H) < EPS; }
    },
    {
      id: 'data-compression-11', level: 8,
      title: { zh: '讀懂位元', en: 'Reading the bits' },
      desc: { zh: '按「出題」，連續答對 3 題。', en: 'Press “New question” and answer 3 questions in a row correctly.' },
      check: function (ev) { const d = ev.data; return is(ev, 'quiz') && d.ok && d.streak >= 3; }
    },
    {
      id: 'data-compression-12', level: 9,
      title: { zh: '解碼高手', en: 'Decoding master' },
      desc: { zh: '用至少 6 種字的碼表按「出題」，一回合 5 題全對，而且總共不超過 150 秒。', en: 'With a code table of at least 6 different characters, press “New question” and get all 5 questions of a round right within 150 seconds in total.' },
      check: function (ev) { const d = ev.data; return is(ev, 'round') && d.correct === 5 && d.total === 5 && d.time <= 150 && d.k >= 6; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'data-compression-h1', level: 3, hidden: true,
      riddle: { zh: '沒有意外，就沒有消息。', en: 'Where there is no surprise, there is no news.' },
      check: function (ev) { const d = ev.data; return is(ev, 'huff') && d.typed && d.k === 1 && d.N >= 8; }
    },
    {
      id: 'data-compression-h2', level: 4, hidden: true,
      riddle: { zh: '人人分得一樣多的時候，再聰明的裁縫也剪不出更省的布。', en: 'When everyone gets exactly the same share, even the cleverest tailor cannot cut the cloth any thinner.' },
      check: function (ev) { const d = ev.data; return is(ev, 'huff') && d.typed && d.k >= 8 && pow2(d.k) && allSame(d.counts) && d.counts[0] >= 2; }
    },
    {
      id: 'data-compression-h3', level: 5, hidden: true,
      riddle: { zh: '換一種寫法再算一遍，忙了半天，還是一個位元也沒省下，一個也沒多花。', en: 'Write it down another way and count again: all that work, and still not a single bit saved — nor a single bit wasted.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!is(ev, 'rle') || d.origin !== 'blank' || d.painted < 1 || d.bits !== d.raw) return false;
        if (mem.hash !== d.hash) { mem.hash = d.hash; mem.fmt = {}; }
        mem.fmt[d.fmt] = true;
        return !!(mem.fmt.pair && mem.fmt.alt);   // 同一張自己畫的圖，「顏色＋長度」和「只記長度」都剛好 256 位元
      }
    },
    {
      id: 'data-compression-h4', level: 6, hidden: true,
      riddle: { zh: '每個人都自成一隊。', en: 'Everyone forms a queue of their own.' },
      check: function (ev) { const d = ev.data; return is(ev, 'rle') && d.origin === 'blank' && d.runs === d.raw; }
    },
    {
      id: 'data-compression-h5', level: 6, hidden: true,
      riddle: { zh: '有人的胃口是別人的兩倍，大家分到的碗卻一樣大。', en: 'Some have twice the appetite of others, yet every bowl is the same size.' },
      check: function (ev) {
        const d = ev.data;
        if (!is(ev, 'huff') || !d.typed || d.k < 8 || !pow2(d.k) || d.maxLen !== d.minLen) return false;
        const big = d.counts[0], small = d.counts[d.counts.length - 1];
        return small >= 2 && big >= 2 * small;   // 次數至少差兩倍（每種至少 2 次），碼長卻全部相同
      }
    },
    {
      id: 'data-compression-h6', level: 7, hidden: true,
      riddle: { zh: '兔子一窩生一窩，藤蔓一節接一節；照著牠們的數法種一棵樹，它會長得又瘦又高，每一層只開一片葉。', en: 'Rabbits breed litter after litter; a vine grows node after node. Plant a tree by their way of counting, and it grows tall and thin, with one leaf on every level.' },
      check: function (ev) { const d = ev.data; return is(ev, 'huff') && d.typed && d.k >= 7 && isFib(d.counts) && d.maxLen === d.k - 1; }
    },
    {
      id: 'data-compression-h7', level: 7, hidden: true,
      riddle: { zh: '幾乎什麼都不用說，卻還是得開口說一整句。', en: 'Almost nothing to say, and yet a whole word has to be spoken.' },
      check: function (ev) { const d = ev.data; return is(ev, 'huff') && d.typed && d.k >= 2 && d.L - d.H > 0.85; }
    },
    {
      id: 'data-compression-h8', level: 8, hidden: true,
      riddle: { zh: '一步踏錯，步步皆錯，直到最後都沒有走回正路。', en: 'One wrong step, and every step after it is wrong; it never finds its way back.' },
      check: function (ev) { const d = ev.data; return is(ev, 'decode') && d.typed && d.stepped && d.flip > 0 && !d.resync && d.after >= 6; }
    },
    {
      id: 'data-compression-h9', level: 9, hidden: true,
      riddle: { zh: '同樣的種子、同樣好的收成，一棵長得矮胖，一棵長得瘦高——高度差了不只一層。', en: 'The same seeds and an equally good harvest, but one tree grows short and stout and the other tall and thin — and they differ by more than one storey.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!is(ev, 'huff') || !d.typed) return false;
        const len = tieMemo(d, mem);
        return d.src === 'tie' && len.old != null && len.new != null && Math.abs(len.old - len.new) >= 2;
      }
    },
    {
      id: 'data-compression-h10', level: 10, hidden: true,
      riddle: { zh: '1951 年，一位研究生寧可交報告也不想考期末考。把他報告裡那十三個機率重新種回來。', en: 'In 1951 a graduate student chose to write a term paper rather than sit the final exam. Plant the thirteen probabilities from his paper once again.' },
      check: function (ev) { const d = ev.data; return is(ev, 'huff') && d.typed && d.N === 100 && sameArr(d.counts, TABLE2); }
    }
  ]);
})();
