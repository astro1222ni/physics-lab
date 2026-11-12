/* missions/cryptography.js — 加密：從凱撒密碼到公鑰的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/cryptography.js 發出，都在使用者操作之後；欄位由 cryptography-core.js 的 caesarEvent／freqEvent／vigEvent／crackEvent／rsaEvent 產生）：
 *   'caesar'：凱撒分頁的位移、方向、文字改變，或按「把輸出放回輸入」之後。
 *       { src, k, dir（'enc'／'dec'）, letters（輸入的字母數）, inHash（輸入文字的短雜湊）, inShort／outShort（字母數 ≤ 12 時的字母，否則 ''）,
 *         back（輸出剛好等於「放回輸入」之前的那段文字）, k1, d1（放回輸入之前用的位移與方向）, myst（目前挑戰的種類或 ''）}
 *   'freq'：頻率分析分頁的 g、勾選、文字改變之後。
 *       { src, g, gBest（χ² 最小的位移）, chi2, N（字母數）, overlay, chiAll, myst, trueShift（真正的位移；不知道時 −1）,
 *         user（這段密文是由使用者自己打的文字加密來的）, plainWords, plainE（原文裡 E 的個數）, plainIc, ic }
 *   'vig'：維吉尼亞分頁的金鑰、方向、L、文字改變之後。
 *       { src, dir, letters, keyLen, keyShift（金鑰只有一個字母時的位移，否則 −1）, keySrc（'typed' 自己打、'guess' 用猜的、'default'）,
 *         keyPeriod（金鑰至少和訊息一樣長時，用到的那段金鑰的最短週期；否則 0）, inHash, poly（同一個明文字母最多變成幾種密文字母）,
 *         L, iocL, myst, secretLen（維吉尼亞挑戰的金鑰長度）, autoKey, ic }
 *   'crack'：按「這就是原文」。{ ok, kind（'caesar'／'vig'）, tab, keySrc, chiShown, caesarTouched, autoKey, sameKey, keyLen, secretLen, letters }
 *   'rsa'：公鑰分頁的四個動作。{ act（'enc'／'dec'／'decPub'／'eve'）, p, q, n, phi, e, d, M, C, R, ok（R === M）, steps }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const is = function (ev, t) { return ev.type === t; };

  LabMission.register('cryptography', [
    {
      id: 'cryptography-1', level: 1,
      title: { zh: '凱撒的位移', en: 'Caesar’s own shift' },
      desc: { zh: '把「位移 k」調成 3，用「加密」把一段至少 10 個字母的訊息加密——這就是凱撒自己用的位移。', en: 'Set “Shift k” to 3 and “Encrypt” a message of at least 10 letters — the very shift Caesar used.' },
      check: function (ev) { const d = ev.data; return is(ev, 'caesar') && d.k === 3 && d.dir === 'enc' && d.letters >= 10; }
    },
    {
      id: 'cryptography-2', level: 2,
      title: { zh: '一字多變', en: 'One letter, many disguises' },
      desc: { zh: '按「維吉尼亞密碼」，在「金鑰」打一個至少 4 個字母的字再「加密」，讓同一個明文字母變成至少 3 種不同的密文字母。', en: 'Press “Vigenère cipher”, type a word of at least 4 letters in “Key” and “Encrypt”, so that one plaintext letter turns into at least 3 different ciphertext letters.' },
      check: function (ev) { const d = ev.data; return is(ev, 'vig') && d.dir === 'enc' && d.keyLen >= 4 && d.poly >= 3; }
    },
    {
      id: 'cryptography-3', level: 2,
      title: { zh: '公鑰鎖、私鑰開', en: 'Lock with one key, open with another' },
      desc: { zh: '按「公鑰的概念」，把「訊息 M」設成至少 2，按「用公鑰加密」，再按「用私鑰解密」拿回原來的數。', en: 'Press “Public keys”, set “Message M” to at least 2, press “Encrypt with the public key”, then “Decrypt with the private key” to get the number back.' },
      check: function (ev) { const d = ev.data; return is(ev, 'rsa') && d.act === 'dec' && d.ok && d.M >= 2; }
    },
    {
      id: 'cryptography-4', level: 3,
      title: { zh: '破解凱撒', en: 'Break a Caesar cipher' },
      desc: { zh: '按「來一段凱撒密文」，找出位移讓輸出變成看得懂的英文，再按「這就是原文」。', en: 'Press “Caesar mystery”, find the shift that turns the output into readable English, then press “This is the plaintext”.' },
      check: function (ev) { const d = ev.data; return is(ev, 'crack') && d.ok && d.kind === 'caesar'; }
    },
    {
      id: 'cryptography-5', level: 4,
      title: { zh: '加密也能解密', en: 'Encrypting your way back' },
      desc: { zh: '用「加密」加密一段至少 10 個字母的訊息，按「把輸出放回輸入」，再換一個不同的「位移 k」、還是用「加密」，讓輸出變回原來的訊息。', en: '“Encrypt” a message of at least 10 letters, press “Use the output as input”, then pick a different “Shift k” and still use “Encrypt”, so that the output turns back into the original message.' },
      check: function (ev) {
        const d = ev.data;
        return is(ev, 'caesar') && d.back && d.d1 === 'enc' && d.dir === 'enc' && d.k1 > 0 && d.k > 0 && d.k1 !== d.k && d.letters >= 10;
      }
    },
    {
      id: 'cryptography-6', level: 4,
      title: { zh: '對齊長條', en: 'Line up the bars' },
      desc: { zh: '按「來一段凱撒密文」，再按「頻率分析」；在打開「英文字母頻率」的情況下，把「猜測位移 g」調到 χ² 最小的位置。', en: 'Press “Caesar mystery”, then “Frequency analysis”; with “English letter frequencies” switched on, move “Guessed shift g” to where χ² is smallest.' },
      check: function (ev) { const d = ev.data; return is(ev, 'freq') && d.myst === 'caesar' && d.overlay && d.N > 0 && d.g === d.gBest; }
    },
    {
      id: 'cryptography-7', level: 5,
      title: { zh: '只看長條圖', en: 'Nothing but the bar chart' },
      desc: { zh: '不動「位移 k」、也不打開「所有位移的 χ²」，只在「頻率分析」對齊長條，破解一段凱撒密文並按「這就是原文」。', en: 'Without touching “Shift k” or switching on “χ² for every shift”, break a Caesar mystery in “Frequency analysis” just by lining up the bars, then press “This is the plaintext”.' },
      check: function (ev) { const d = ev.data; return is(ev, 'crack') && d.ok && d.kind === 'caesar' && d.tab === 'freq' && !d.chiShown && !d.caesarTouched; }
    },
    {
      id: 'cryptography-8', level: 5,
      title: { zh: '竊聽者的捷徑', en: 'The eavesdropper’s shortcut' },
      desc: { zh: '選「質數 p」和「質數 q」讓 n 大於 5000，按「用公鑰加密」，再按「分解 n」，看竊聽者不用私鑰也讀到訊息。', en: 'Choose “Prime p” and “Prime q” so that n is larger than 5000, press “Encrypt with the public key”, then “Factor n” and watch the eavesdropper read the message without the private key.' },
      check: function (ev) { const d = ev.data; return is(ev, 'rsa') && d.act === 'eve' && d.ok && d.n > 5000; }
    },
    {
      id: 'cryptography-9', level: 5,
      title: { zh: '金鑰有多長', en: 'How long is the key?' },
      desc: { zh: '按「來一段維吉尼亞密文」，把「猜金鑰長度 L」調到金鑰真正的長度；再換一段金鑰長度不一樣的密文，也找對。', en: 'Press “Vigenère mystery” and set “Guessed key length L” to the true length of the key; then do it again for a mystery whose key has a different length.' },
      // 兩段金鑰長度不同的密文都猜對 L（峰值的位置會跟著金鑰長度移動）
      check: function (ev, mem) {
        const d = ev.data;
        if (!is(ev, 'vig') || d.myst !== 'vig' || !(d.secretLen > 0) || d.L !== d.secretLen) return false;
        mem.lens = mem.lens || {};
        mem.lens[d.secretLen] = 1;
        return Object.keys(mem.lens).length >= 2;
      }
    },
    {
      id: 'cryptography-10', level: 7,
      title: { zh: '破解維吉尼亞', en: 'Break a Vigenère cipher' },
      desc: { zh: '按「來一段維吉尼亞密文」，找出金鑰讓輸出變成看得懂的英文，再按「這就是原文」。', en: 'Press “Vigenère mystery”, find the key that turns the output into readable English, then press “This is the plaintext”.' },
      check: function (ev) { const d = ev.data; return is(ev, 'crack') && d.ok && d.kind === 'vig'; }
    },
    {
      id: 'cryptography-11', level: 9,
      title: { zh: '一欄一欄來', en: 'Column by column' },
      desc: { zh: '不按「自動找金鑰」，自己用「第幾欄 c」和「這一欄的位移」一欄一欄對齊長條，破解一段維吉尼亞密文。', en: 'Without pressing “Find the key automatically”, line up the bars yourself column by column with “Column c” and “Shift of this column”, and break a Vigenère mystery.' },
      check: function (ev) { const d = ev.data; return is(ev, 'crack') && d.ok && d.kind === 'vig' && !d.autoKey; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'cryptography-h1', level: 3, hidden: true,
      riddle: { zh: '字母表剛好對摺。同一個動作做兩次，就像什麼都沒發生。', en: 'Fold the alphabet exactly in half. Do the same thing twice and it is as if nothing happened.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!is(ev, 'caesar')) return false;
        const rot = d.src === 'swap' && d.back && d.k1 === 13 && d.k === 13 && d.d1 === d.dir && d.letters >= 10;
        const prev = mem.prev;
        mem.prev = rot;
        return rot && !!prev;   // 連按兩次「把輸出放回輸入」，兩次都回到原來那段
      }
    },
    {
      id: 'cryptography-h2', level: 4, hidden: true,
      riddle: { zh: '太空船上那台不肯開艙門的電腦，和一家真實的電腦公司，其實只隔了一步。', en: 'The computer that would not open the pod bay doors and a real computer company are only one step apart.' },
      check: function (ev) { const d = ev.data; return is(ev, 'caesar') && d.inShort === 'HAL' && d.outShort === 'IBM'; }
    },
    {
      id: 'cryptography-h3', level: 5, hidden: true,
      riddle: { zh: '一條路轉輪子，一條路寫鑰匙；鑰匙短到不能再短時，兩條路留下一模一樣的腳印。', en: 'One road turns a wheel, the other writes a key. When the key is as short as a key can be, both roads leave identical footprints.' },
      check: function (ev, mem) {
        const d = ev.data;
        mem.c = mem.c || {}; mem.v = mem.v || {};
        let id = '';
        if (is(ev, 'caesar') && d.letters >= 10 && d.k !== 0) { id = d.inHash + '|' + d.dir + '|' + d.k; mem.c[id] = true; }
        else if (is(ev, 'vig') && d.keySrc === 'typed' && d.keyLen === 1 && d.keyShift > 0 && d.letters >= 10) { id = d.inHash + '|' + d.dir + '|' + d.keyShift; mem.v[id] = true; }
        return !!(id && mem.c[id] && mem.v[id]);   // 同一段文字、同一個方向、同一個位移：轉盤和一個字母的金鑰都做過
      }
    },
    {
      id: 'cryptography-h4', level: 6, hidden: true,
      riddle: { zh: '你親手寫下的鑰匙和原來那把不一樣，門卻照樣打開了。', en: 'The key you put together yourself is not the one that was used, yet the door opened all the same.' },
      check: function (ev) {
        const d = ev.data;
        return is(ev, 'crack') && d.ok && d.kind === 'vig' && d.tab === 'vig' && !d.sameKey && d.keyLen > d.secretLen && (d.keySrc === 'typed' || !d.autoKey);
      }
    },
    {
      id: 'cryptography-h5', level: 6, hidden: true,
      riddle: { zh: '公告欄上那把人人都能抄的鑰匙，竟然也打開了自己鎖上的箱子——而且它不是排在最後面的那一把。', en: 'The key pinned on the notice board for anyone to copy somehow opened the very box it had locked — and it is not the last one in the row.' },
      check: function (ev) { const d = ev.data; return is(ev, 'rsa') && d.act === 'decPub' && d.ok && d.e === d.d && d.e !== d.phi - 1 && d.n >= 1000 && d.M >= 2; }
    },
    {
      id: 'cryptography-h6', level: 7, hidden: true,
      riddle: { zh: '有些信鎖上之後，和沒鎖時一字不差。人人猜得到的那幾封不算，找出兩封沒人想到的。', en: 'Some letters look exactly the same after they are locked. The ones everyone would guess do not count — find two that nobody would think of.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!is(ev, 'rsa') || d.act !== 'enc' || d.C !== d.M || d.n < 1000 || d.M < 2 || d.M > d.n - 2) return false;
        const id = d.p + '|' + d.q + '|' + d.e;
        mem.f = mem.f || {};
        const s = mem.f[id] = mem.f[id] || {};
        s[d.M] = true;
        return Object.keys(s).length >= 2;   // 同一把公鑰，兩封不同的信
      }
    },
    {
      id: 'cryptography-h7', level: 7, hidden: true,
      riddle: { zh: '鑰匙比信還長，而且永遠只用一次。這一回，再會數字母的人也只能投降。', en: 'The key is longer than the letter and is never used again. This time even the best letter-counter has to give up.' },
      check: function (ev) {
        const d = ev.data;
        return is(ev, 'vig') && d.dir === 'enc' && d.keySrc === 'typed' && d.letters >= 30 && d.keyLen >= d.letters && d.keyPeriod === d.letters;
      }
    },
    {
      id: 'cryptography-h8', level: 8, hidden: true,
      riddle: { zh: '1939 年，有人寫完一整本小說，卻從沒用過最常見的那個字母。照他的規矩自己寫一段話鎖起來——數字母的人照樣認得出來。', en: 'In 1939 someone finished a whole novel without ever using the most common letter. Write a few lines of your own by his rule and lock them up — the letter-counter still sees through them.' },
      check: function (ev) {
        const d = ev.data;
        return is(ev, 'freq') && d.user && d.plainE === 0 && d.N >= 60 && d.plainWords >= 10 && d.trueShift > 0 && d.g === d.trueShift && d.g === d.gBest;
      }
    },
    {
      id: 'cryptography-h9', level: 8, hidden: true,
      riddle: { zh: '用最小的鎖鎖信，信可能連一圈都沒繞，旁人不用鑰匙也拆得開。找出剛好還沒繞圈、最重的那一封。', en: 'Lock a letter with the smallest possible lock and it may never go all the way round, so anyone can open it without the key. Find the heaviest letter that still does not go round.' },
      check: function (ev) {
        const d = ev.data;
        if (!is(ev, 'rsa') || d.act !== 'enc' || d.e !== 3 || d.n < 1000 || d.M < 10) return false;
        const m = d.M;
        return d.C === m * m * m && (m + 1) * (m + 1) * (m + 1) > d.n - 1;   // M³ 小於 n（沒有繞圈），M + 1 就會繞圈
      }
    },
    {
      id: 'cryptography-h10', level: 10, hidden: true,
      riddle: { zh: '1978 年，三位發明者借了凱撒戲裡的一句台詞當例子。照他們的鑰匙，重現那句話第一塊被鎖上的瞬間。', en: 'In 1978 three inventors borrowed a line from a play about Caesar as their example. With their key, recreate the moment the first piece of that line was locked.' },
      check: function (ev) {
        const d = ev.data;
        return is(ev, 'rsa') && d.act === 'enc' && d.n === 2773 && (d.p === 47 || d.q === 47) && d.e === 17 && d.M === 920 && d.C === 948;
      }
    }
  ]);
})();
