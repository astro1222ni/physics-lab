/* missions/text-encoding.js — 文字編碼（ASCII、Big5 與 UTF-8）的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/text-encoding.js 發出，都在使用者操作之後；載入與預設文字不送）：
 *   'text'：文字改變之後。
 *       { src（'typed' 打字、'example' 範例按鈕、'cp' 用碼位插入、'ascii' 點 ASCII 表、'flip' 翻轉位元、'push' 用亂碼繼續、'back' 回到原文）,
 *         origin（'example' = 範例按鈕的原樣；其他操作之後都是 'typed'）, n（字元數）, units（UTF-16 碼元數）,
 *         u8, u16, b5（三種編碼的位元組數；Big5 有字存不下時 b5 = null）, b5bad（Big5 存不下的字數）,
 *         lens（UTF-8 長度 1、2、3、4 的字各幾個）, nonAscii, lone（孤立代理數）, cps（每個字的碼位）,
 *         twins（同時有預組字與它的分解寫法的組數）, b5c（Big5 第二個位元組是 5C 的不同字數）,
 *         joined（這次用碼位插入，讓兩個半邊的代理接成一對）, cp（插入的碼位） }
 *   'mix'：存檔、開檔的結果改變之後（文字改變、按存檔／開檔編碼、套用位元組、刪掉第一個位元組、用亂碼繼續）。
 *       { src, write, read（'utf8'／'big5'／'latin1'）, raw（位元組是自己改的）, n, nonAscii, same（開檔結果和原文一樣）,
 *         errors（U+FFFD 個數）, kinds（錯誤種類 → 個數）, kindsN, outN（開檔得到的字數）, nb（位元組數）, bad（存檔時寫成 ? 的字數）,
 *         bom（原文以 U+FEFF 開頭）, outIBS（結果以 ï»¿ 開頭）, jiao（結果裡有「嚙踝蕭」）, srcFFFD（原文裡的 U+FFFD 個數）,
 *         chainLen（接力了幾棒）, b5u8（接力中有一棒是存 Big5、用 UTF-8 開而出現錯誤）,
 *         back（這次的結果和接力最初的原文一樣，而且目前的文字是亂碼）, depth（目前文字的亂碼層數）, maxDepth（接力中最深的層數）,
 *         origNonAscii, overDot（過長編碼的「.」或「/」個數）, edited（套用的位元組和原來不同）, new3（解出原文沒有的 3 位元組字數） }
 *   'pick'：選取一個字（按「上一個字」「下一個字」、點位元組、方向鍵）。{ src, cp, u8, u16, b5, lone }
 *   'flip'：翻轉一個位元。{ k, bit, mask, before, after（翻轉後那個位置的碼位）, caseSwap（大小寫互換）, errors, n }
 *   'cut'：按「刪掉第一個位元組」。{ write, read, raw（刪之前就是自己改的位元組）, n（原文字數）, multiAll（原文每個字都是多位元組且存得下）,
 *         common（從尾端算起還對得上的字數）, lost, errorsBefore, errors }
 *   'quiz'：挑戰答了一題。{ ok, streak, kind, n }
 *   'round'：一回合（5 題）結束。{ correct, total, time（秒） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const is = function (ev, t) { return ev.type === t; };
  const typed = function (d) { return d.origin === 'typed'; };

  LabMission.register('text-encoding', [
    {
      id: 'text-encoding-1', level: 1,
      title: { zh: '一個字，三個位元組', en: 'One character, three bytes' },
      desc: { zh: '按「下一個字」（或點下方的位元組），選一個在 UTF-8 裡占 3 個位元組的字。', en: 'Press “Next character” (or tap a byte below) to select a character that takes 3 bytes in UTF-8.' },
      check: function (ev) { return is(ev, 'pick') && ev.data.u8 === 3 && !ev.data.lone; }
    },
    {
      id: 'text-encoding-2', level: 2,
      title: { zh: '最長的字', en: 'The longest character' },
      desc: { zh: '選一個在 UTF-8 裡要 4 個位元組的字，看它在 UTF-16 怎麼拆成一對代理。', en: 'Select a character that needs 4 bytes in UTF-8 and see how UTF-16 splits it into a surrogate pair.' },
      check: function (ev) { return is(ev, 'pick') && ev.data.u8 === 4; }
    },
    {
      id: 'text-encoding-3', level: 2,
      title: { zh: '做出亂碼', en: 'Make some mojibake' },
      desc: { zh: '用至少兩個非英文的字，讓存檔編碼和開檔編碼不一樣（例如存「UTF-8」、開「Big5」），打開來變成亂碼。', en: 'With at least two non-English characters, save with one encoding and open with another (for example save as “UTF-8”, open as “Big5”) so that the text comes out garbled.' },
      check: function (ev) { const d = ev.data; return is(ev, 'mix') && !d.raw && d.write !== d.read && d.nonAscii >= 2 && !d.same; }
    },
    {
      id: 'text-encoding-4', level: 3,
      title: { zh: '大小寫只差一位', en: 'Upper and lower case, one bit apart' },
      desc: { zh: '選一個英文字母，在 UTF-8 那一列只點一個位元，把它從大寫變成小寫（或反過來）。', en: 'Select an English letter and tap just one bit in the UTF-8 row to turn it from upper case into lower case (or back).' },
      check: function (ev) { return is(ev, 'flip') && ev.data.caseSwap; }
    },
    {
      id: 'text-encoding-5', level: 4,
      title: { zh: 'Big5 省下三分之一', en: 'Big5 saves a third' },
      desc: { zh: '自己打一句至少 10 個字、全部都是中文字（標點用全形）的話，讓 UTF-8 的位元組數剛好是 Big5 的 1.5 倍。', en: 'Type your own sentence of at least 10 characters, all Chinese characters (with full-width punctuation), so that its UTF-8 size is exactly 1.5 times its Big5 size.' },
      check: function (ev) { const d = ev.data; return is(ev, 'text') && typed(d) && d.n >= 10 && d.b5 !== null && d.nonAscii === d.n && d.u8 * 2 === d.b5 * 3; }
    },
    {
      id: 'text-encoding-6', level: 4,
      title: { zh: '四種長度到齊', en: 'All four lengths' },
      desc: { zh: '自己打字，或用「插入」加入碼位，讓文字剛好只有 4 個字，UTF-8 分別占 1、2、3、4 個位元組（一共 10 個位元組）。', en: 'Type, or add code points with “Insert”, so that the text has exactly 4 characters taking 1, 2, 3 and 4 bytes in UTF-8 (10 bytes in all).' },
      check: function (ev) { const d = ev.data; return is(ev, 'text') && typed(d) && d.n === 4 && d.lens[0] === 1 && d.lens[1] === 1 && d.lens[2] === 1 && d.lens[3] === 1; }
    },
    {
      id: 'text-encoding-7', level: 5,
      title: { zh: '親手寫位元組', en: 'Write the bytes yourself' },
      desc: { zh: '開檔編碼選「UTF-8」，在「位元組（十六進位）」打出一串合法的 UTF-8 再按「套用」：解出至少 3 個字，其中有一個原文沒有的 3 位元組字，而且沒有任何錯誤。', en: 'Choose “UTF-8” as the opening encoding, type a valid UTF-8 byte string in “Bytes (hexadecimal)” and press “Apply”: it must decode to at least 3 characters, including a 3-byte character that was not in the text before, with no errors at all.' },
      check: function (ev) { const d = ev.data; return is(ev, 'mix') && d.src === 'hex' && d.raw && d.read === 'utf8' && d.edited && d.errors === 0 && d.outN >= 3 && d.new3 >= 1; }
    },
    {
      id: 'text-encoding-8', level: 6,
      title: { zh: '救回亂碼', en: 'Rescue the mojibake' },
      desc: { zh: '做出亂碼後按「用這段亂碼繼續」，再換一組存檔與開檔編碼，把原文一字不差地救回來。', en: 'After making mojibake, press “Carry on with this text”, then pick another pair of encodings that brings the original text back exactly.' },
      check: function (ev) { const d = ev.data; return is(ev, 'mix') && d.back && d.origNonAscii >= 1; }
    },
    {
      id: 'text-encoding-9', level: 7,
      title: { zh: '四種錯誤', en: 'Four kinds of error' },
      desc: { zh: '在「位元組（十六進位）」打不超過 8 個位元組、按「套用」，用「UTF-8」打開時出現至少 4 種不同的錯誤（孤立的延續位元組、過長編碼、編了代理、超過 U+10FFFF、不完整的字，選四種）。', en: 'Type at most 8 bytes in “Bytes (hexadecimal)” and press “Apply” so that opening them as “UTF-8” gives at least 4 different kinds of error (pick four of: a lone continuation byte, an overlong form, an encoded surrogate, a value above U+10FFFF, a cut-off character).' },
      check: function (ev) { const d = ev.data; return is(ev, 'mix') && d.src === 'hex' && d.raw && d.read === 'utf8' && d.nb <= 8 && d.kindsN >= 4; }
    },
    {
      id: 'text-encoding-10', level: 8,
      title: { zh: '讀懂位元', en: 'Reading the bits' },
      desc: { zh: '按「開始挑戰」，連續答對 3 題。', en: 'Press “Start the challenge” and answer 3 questions in a row correctly.' },
      check: function (ev) { return is(ev, 'quiz') && ev.data.ok && ev.data.streak >= 3; }
    },
    {
      id: 'text-encoding-11', level: 9,
      title: { zh: 'UTF-8 高手', en: 'UTF-8 master' },
      desc: { zh: '按「開始挑戰」，一回合 5 題全對，而且總共不超過 120 秒。', en: 'Press “Start the challenge” and get all 5 questions of a round right within 120 seconds in total.' },
      check: function (ev) { const d = ev.data; return is(ev, 'round') && d.correct === 5 && d.total === 5 && d.time <= 120; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'text-encoding-h1', level: 3, hidden: true,
      riddle: { zh: '地圖的最後一格。再往前一步，就沒有門牌了。', en: 'The last square on the map. One more step, and there are no more house numbers.' },
      check: function (ev) { const d = ev.data; return is(ev, 'text') && d.src !== 'example' && d.cps.indexOf(0x10FFFF) >= 0; }
    },
    {
      id: 'text-encoding-h2', level: 4, hidden: true,
      riddle: { zh: '三位裁縫替同一句話量身，量出來的布一樣長。', en: 'Three tailors measure the same sentence, and all three cut the same length of cloth.' },
      check: function (ev) { const d = ev.data; return is(ev, 'text') && typed(d) && d.n >= 4 && d.b5 !== null && d.u8 === d.u16 && d.u16 === d.b5; }
    },
    {
      id: 'text-encoding-h3', level: 5, hidden: true,
      riddle: { zh: '一個看不見的路標站在最前面；不認得它的人，把它念成了三個怪字。', en: 'An invisible signpost stands at the very front; someone who does not know it reads it out as three strange letters.' },
      check: function (ev) { const d = ev.data; return is(ev, 'mix') && d.bom && d.n >= 2 && d.write === 'utf8' && d.read === 'latin1' && d.outIBS; }
    },
    {
      id: 'text-encoding-h4', level: 6, hidden: true,
      riddle: { zh: '兩個各自說不出話的半句，靠在一起，就成了一句完整的話。', en: 'Two half-sentences that cannot speak on their own lean together and become one whole sentence.' },
      check: function (ev) { const d = ev.data; return is(ev, 'text') && d.src === 'cp' && d.joined; }
    },
    {
      id: 'text-encoding-h5', level: 7, hidden: true,
      riddle: { zh: '有些人的名字一進老電腦，就多出一道往左倒的斜線。找三位。', en: 'Some people’s names grow a backward-leaning slash the moment they enter an old computer. Find three of them.' },
      check: function (ev) { const d = ev.data; return is(ev, 'text') && d.b5c >= 3; }
    },
    {
      id: 'text-encoding-h6', level: 7, hidden: true,
      riddle: { zh: '一對長得一模一樣的雙胞胎，站上秤卻不一樣重。', en: 'A pair of identical twins, yet the scales give them different weights.' },
      check: function (ev) { const d = ev.data; return is(ev, 'text') && d.src !== 'example' && d.twins >= 1; }
    },
    {
      id: 'text-encoding-h7', level: 8, hidden: true,
      riddle: { zh: '失物換成了問號，就再也領不回來；把問號再翻譯一次，它說的是嚙咬與蕭瑟。', en: 'Once lost property has been swapped for question marks, it can never be claimed back; translate the question marks once more, and they speak of gnawing and of desolation.' },
      check: function (ev) { const d = ev.data; return is(ev, 'mix') && !d.raw && d.b5u8 && d.srcFFFD >= 2 && d.write === 'utf8' && d.read === 'big5' && d.jiao; }
    },
    {
      id: 'text-encoding-h8', level: 8, hidden: true,
      riddle: { zh: '一個點穿上不合身的外衣，想偷偷溜回上一層樓；守門人一眼就看穿了它。', en: 'A dot puts on a coat that does not fit and tries to sneak back up to the floor above; the gatekeeper sees through it at once.' },
      check: function (ev) { const d = ev.data; return is(ev, 'mix') && d.src === 'hex' && d.raw && d.read === 'utf8' && d.overDot >= 1; }
    },
    {
      id: 'text-encoding-h9', level: 9, hidden: true,
      riddle: { zh: '從半路上車：有人只錯過一站，有人一路坐錯到終點。兩種乘客你都要當過。', en: 'Boarding halfway: one passenger misses only a single stop, another rides the wrong way all the way to the end. Be both passengers.' },
      check: function (ev, mem) {
        if (!is(ev, 'cut')) return false;
        const d = ev.data;
        if (d.raw || d.n < 4 || !d.multiAll || d.errorsBefore !== 0 || d.write !== d.read) return false;
        if (d.write === 'utf8' && d.common === d.n - 1) mem.u8 = true;
        if (d.write === 'big5' && d.common === 0) mem.b5 = true;
        return !!(mem.u8 && mem.b5);
      }
    },
    {
      id: 'text-encoding-h10', level: 10, hidden: true,
      riddle: { zh: '被誤會了一次，又被誤會了一次；你一層一層替它解釋，直到它說回自己的話。', en: 'Misunderstood once, then misunderstood again; you explain it layer by layer until it speaks its own words once more.' },
      check: function (ev) { const d = ev.data; return is(ev, 'mix') && d.back && d.maxDepth >= 2 && d.origNonAscii >= 1; }
    }
  ]);
})();
