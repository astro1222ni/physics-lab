/* cryptography-core.js — 「加密：從凱撒密碼到公鑰」的計算核心（與畫面分離；Node 單元測試：tests/cryptography-core.test.js）
 *
 * 只處理英文字母 A–Z（大小寫保留），其他字元（空白、標點、中文）原樣不動。字母編號 A = 0 … Z = 25。
 * 凱撒（位移）密碼：E_k(x) = (x + k) mod 26，D_k(y) = (y − k) mod 26。
 * 頻率分析：χ²(g) = Σ (O_i − E_i)² / E_i，E_i = N · p[(i − g) mod 26]；p 是英文字母頻率（Lewand 2000）。
 * 重合指數：IC = Σ n_i (n_i − 1) / (N (N − 1))：隨便抽兩個字母剛好相同的機率。
 * 維吉尼亞密碼：第 j 個字母用金鑰的第 (j mod L) 個字母當位移（只有字母會用掉金鑰）。
 * 玩具 RSA：n = p q、φ(n) = (p − 1)(q − 1)、e 與 φ(n) 互質、d = e^(−1) mod φ(n)；C = M^e mod n、M = C^d mod n。
 *   質數都小於 100，所以 n < 2^14，任何兩個小於 n 的數相乘都小於 2^28，遠小於 2^53：一般 Number 整數運算完全精確
 *   （modPow 在 m > 2^26 時改用 BigInt，保證不溢位）。這只是原理示範，一點都不安全。
 * 學生輸入的文字只在這裡用純函式處理：不連網、不用 eval，長度上限 MAX_TEXT 個字元。
 */
(function (root) {
  'use strict';
  const MAX_TEXT = 1500;      // 輸入文字最多幾個字元
  const MAX_KEY = 60;         // 維吉尼亞金鑰最多幾個字母
  const MAX_L = 12;           // 猜金鑰長度的上限

  // 英文字母頻率（%）：R. E. Lewand, Cryptological Mathematics (MAA, 2000), pp. 36–37
  const FREQ_EN = [8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406,
    6.749, 7.507, 1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.360, 0.150, 1.974, 0.074];
  const P_EN = FREQ_EN.map(function (x) { return x / FREQ_EN.reduce(function (a, b) { return a + b; }, 0); });
  /** 英文的重合指數（由上表算出 Σ p²）與完全隨機的 1/26 */
  const IC_EN = P_EN.reduce(function (a, p) { return a + p * p; }, 0);
  const IC_RANDOM = 1 / 26;

  // ---------------- 字母 ----------------
  /** 字元的字母編號 0–25；不是英文字母回傳 −1 */
  function letterIndex(ch) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return c - 65;
    if (c >= 97 && c <= 122) return c - 97;
    return -1;
  }
  function mod(a, m) { return ((a % m) + m) % m; }
  function letter(i) { return String.fromCharCode(65 + mod(i, 26)); }
  /** 只留下字母，轉大寫 */
  function lettersOnly(s) { return String(s || '').replace(/[^A-Za-z]/g, '').toUpperCase(); }
  /** 文字上限（超過的截掉） */
  function clampText(s) { s = String(s == null ? '' : s); return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s; }
  /** 把一個字元位移 k（保留大小寫） */
  function shiftChar(ch, k) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCharCode(65 + mod(c - 65 + k, 26));
    if (c >= 97 && c <= 122) return String.fromCharCode(97 + mod(c - 97 + k, 26));
    return ch;
  }

  // ---------------- 凱撒 ----------------
  /** 每個字母往後位移 k（k 可以是負數）；加密用 +k，解密用 −k */
  function caesar(text, k) {
    let out = '';
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) out += shiftChar(s[i], k);
    return out;
  }
  /** dir：'enc'（加密，+k）或 'dec'（解密，−k） */
  function caesarApply(text, k, dir) { return caesar(text, dir === 'dec' ? -k : k); }

  // ---------------- 統計 ----------------
  function counts(text) {
    const c = new Array(26).fill(0);
    const s = String(text || '');
    let n = 0;
    for (let i = 0; i < s.length; i++) { const x = letterIndex(s[i]); if (x >= 0) { c[x]++; n++; } }
    return { c: c, n: n };
  }
  /** 觀察到的字母次數和「英文、位移 g」的期望次數比較：χ²（越小越像） */
  function chiSquared(cnt, g) {
    const N = cnt.n;
    if (!N) return NaN;
    let s = 0;
    for (let i = 0; i < 26; i++) {
      const E = N * P_EN[mod(i - g, 26)];
      const d = cnt.c[i] - E;
      s += d * d / E;
    }
    return s;
  }
  function chiAll(cnt) { const a = []; for (let g = 0; g < 26; g++) a.push(chiSquared(cnt, g)); return a; }
  /** χ² 最小的位移（同分取小的） */
  function bestShift(cnt) {
    if (!cnt.n) return 0;
    let best = 0, bv = Infinity;
    for (let g = 0; g < 26; g++) { const v = chiSquared(cnt, g); if (v < bv - 1e-12) { bv = v; best = g; } }
    return best;
  }
  /** 重合指數 Σ n_i(n_i − 1) / (N(N − 1))；少於 2 個字母回傳 NaN */
  function ioc(cnt) {
    const N = cnt.n;
    if (N < 2) return NaN;
    let s = 0;
    for (let i = 0; i < 26; i++) s += cnt.c[i] * (cnt.c[i] - 1);
    return s / (N * (N - 1));
  }
  function iocText(text) { return ioc(counts(text)); }
  /** 最常見的字母（同次數取字母序前面的）；沒有字母回傳 −1 */
  function topLetter(cnt) {
    if (!cnt.n) return -1;
    let b = 0;
    for (let i = 1; i < 26; i++) if (cnt.c[i] > cnt.c[b]) b = i;
    return b;
  }
  /** 字數（以空白分開、含字母的段落） */
  function words(text) { return String(text || '').split(/\s+/).filter(function (w) { return /[A-Za-z]/.test(w); }).length; }

  // ---------------- 維吉尼亞 ----------------
  /** 金鑰 → 位移陣列（只取字母，最多 MAX_KEY 個） */
  function keyShifts(key) { return lettersOnly(key).slice(0, MAX_KEY).split('').map(function (ch) { return ch.charCodeAt(0) - 65; }).filter(function (x) { return x >= 0; }); }
  function keyFromShifts(a) { return a.map(letter).join(''); }
  /** 維吉尼亞：dir 'enc' 加上金鑰、'dec' 減掉；空金鑰 = 不變 */
  function vigenere(text, key, dir) {
    const ks = Array.isArray(key) ? key : keyShifts(key);
    const s = String(text || '');
    if (!ks.length) return s;
    const sign = dir === 'dec' ? -1 : 1;
    let out = '', j = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (letterIndex(ch) >= 0) { out += shiftChar(ch, sign * ks[j % ks.length]); j++; }
      else out += ch;
    }
    return out;
  }
  /** 把字母依位置分成 L 欄（第 j 個字母放第 j mod L 欄） */
  function columns(letters, L) {
    const cols = [];
    for (let i = 0; i < L; i++) cols.push('');
    for (let j = 0; j < letters.length; j++) cols[j % L] += letters[j];
    return cols;
  }
  /** 猜金鑰長度 L 時，各欄重合指數的平均（只算有 2 個以上字母的欄） */
  function avgIoc(letters, L) {
    const cols = columns(letters, L);
    let s = 0, k = 0;
    cols.forEach(function (c) { if (c.length >= 2) { s += ioc(counts(c)); k++; } });
    return k ? s / k : NaN;
  }
  function iocProfile(letters, maxL) {
    const a = [];
    for (let L = 1; L <= (maxL || MAX_L); L++) a.push(avgIoc(letters, L));
    return a;
  }
  /** 每一欄都是一個凱撒密碼：各欄 χ² 最小的位移就是金鑰的那個字母 */
  function recoverKey(letters, L) { return columns(letters, L).map(function (c) { return bestShift(counts(c)); }); }
  /** 字串的最短週期（"ABCABCAB" → 3；完全不重複 → 長度） */
  function minPeriod(s) {
    const n = s.length;
    for (let p = 1; p < n; p++) {
      let ok = true;
      for (let i = p; i < n; i++) if (s[i] !== s[i - p]) { ok = false; break; }
      if (ok) return p;
    }
    return n;
  }
  /** 同一個明文字母在密文裡最多變成幾種不同的字母 */
  function polyMax(plain, cipher) {
    const P = lettersOnly(plain), C = lettersOnly(cipher);
    const sets = {};
    let m = 0;
    for (let i = 0; i < Math.min(P.length, C.length); i++) {
      const s = sets[P[i]] || (sets[P[i]] = {});
      s[C[i]] = 1;
      m = Math.max(m, Object.keys(s).length);
    }
    return m;
  }

  // ---------------- 玩具 RSA ----------------
  const PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
  function isPrime(v) {
    if (v < 2 || v !== Math.floor(v)) return false;
    if (v % 2 === 0) return v === 2;
    for (let d = 3; d * d <= v; d += 2) if (v % d === 0) return false;
    return true;
  }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  /** 擴展歐幾里得：回傳 { g, x, y, rows }，a x + b y = g；rows 是每一步（給畫面列表） */
  function egcd(a, b) {
    const rows = [];
    let r0 = a, r1 = b, s0 = 1, s1 = 0, t0 = 0, t1 = 1;
    while (r1 !== 0) {
      const q = Math.floor(r0 / r1);
      rows.push({ a: r0, b: r1, q: q, r: r0 - q * r1 });
      let t;
      t = r0 - q * r1; r0 = r1; r1 = t;
      t = s0 - q * s1; s0 = s1; s1 = t;
      t = t0 - q * t1; t0 = t1; t1 = t;
    }
    return { g: r0, x: s0, y: t0, rows: rows };
  }
  /** e 模 m 的反元素；不互質回傳 null */
  function modInverse(e, m) {
    const r = egcd(mod(e, m), m);
    return r.g === 1 ? mod(r.x, m) : null;
  }
  const SAFE_MOD = 67108864;  // 2^26：模數不超過它時，(m − 1)² < 2^52，Number 乘法完全精確
  /** b^e mod m（平方再乘）；回傳結果，並在 stat 記下平方與乘法的次數 */
  function modPow(b, e, m, stat) {
    if (m === 1) return 0;
    if (m > SAFE_MOD) {      // 大模數：改用 BigInt（本頁用不到，只是保證不溢位）
      let B = BigInt(b) % BigInt(m), E = BigInt(e), Mm = BigInt(m), R = 1n;
      while (E > 0n) { if (E & 1n) R = R * B % Mm; B = B * B % Mm; E >>= 1n; }
      return Number(R);
    }
    let r = 1, x = mod(b, m), k = e, sq = 0, mu = 0;
    while (k > 0) {
      if (k % 2 === 1) { r = (r * x) % m; mu++; }
      k = Math.floor(k / 2);
      if (k > 0) { x = (x * x) % m; sq++; }
    }
    if (stat) { stat.sq = sq; stat.mul = mu; }
    return r;
  }
  /** 金鑰：{ ok, reason（'same'／'notprime'／'gcd'）, n, phi, e, d, g（gcd(e, φ)）} */
  function rsaKey(p, q, e) {
    const out = { ok: false, reason: '', p: p, q: q, n: p * q, phi: (p - 1) * (q - 1), e: e, d: null, g: 0 };
    if (!isPrime(p) || !isPrime(q)) { out.reason = 'notprime'; return out; }
    if (p === q) { out.reason = 'same'; return out; }
    if (!(e > 1 && e < out.phi) || e !== Math.floor(e)) { out.reason = 'range'; return out; }
    out.g = gcd(e, out.phi);
    if (out.g !== 1) { out.reason = 'gcd'; return out; }
    out.d = modInverse(e, out.phi);
    out.ok = true;
    return out;
  }
  /** 比 e 大的下一個可用公開指數（到 φ − 1 為止，超過就從 3 開始找）；找不到回傳 null */
  function nextValidE(e, phi) {
    for (let k = 1; k < phi; k++) {
      let c = e + k;
      if (c > phi - 1) c = 3 + ((c - phi) % Math.max(1, phi - 3));
      if (c > 1 && c < phi && gcd(c, phi) === 1) return c;
    }
    return null;
  }
  /** 竊聽者：用試除法把 n 分解（從 2 開始試）；steps = 試了幾個除數 */
  function factor(n) {
    let steps = 0;
    for (let d = 2; d * d <= n; d++) { steps++; if (n % d === 0) return { p: d, q: n / d, steps: steps }; }
    return { p: n, q: 1, steps: steps };
  }
  /** 加密後不變的訊息（不動點）有幾個：(1 + gcd(e − 1, p − 1))(1 + gcd(e − 1, q − 1)) */
  function fixedCount(p, q, e) { return (1 + gcd(e - 1, p - 1)) * (1 + gcd(e - 1, q - 1)); }
  /** 整數 k 次方根的整數部分 ⌊x^(1/k)⌋ */
  function iroot(x, k) {
    if (x < 1) return 0;
    let r = Math.floor(Math.pow(x, 1 / k));
    while (Math.pow(r + 1, k) <= x) r++;
    while (r > 0 && Math.pow(r, k) > x) r--;
    return r;
  }
  /** 1978 年 RSA 論文的字母編法：兩個字母一塊，空白 = 00、A = 01 … Z = 26（M ≤ 2626）；不能這樣讀時回傳 null */
  function paperBlock(M) {
    if (!(M >= 0 && M <= 2626) || M !== Math.floor(M)) return null;
    const a = Math.floor(M / 100), b = M % 100;
    if (a > 26 || b > 26) return null;
    const ch = function (x) { return x === 0 ? ' ' : String.fromCharCode(64 + x); };
    return ch(a) + ch(b);
  }

  // ---------------- 範例文字與神祕密文（文字都是本站自己寫的） ----------------
  const DEFAULT_TEXT = 'Meet me by the old oak tree after school, and bring the map.';
  const SAMPLES = [
    DEFAULT_TEXT,
    'Every star you see at night is a distant sun. Its light left home long before you were born, so looking up is a way of reading very old letters from the sky.',
    'Computers store pictures, songs and messages as long rows of zeros and ones. Encryption mixes those rows so well that only the person holding the right key can put them back in order.',
    'Long before computers existed, people already needed ways to hide their messages. Generals sent orders across enemy land, merchants protected their prices, and friends passed notes that only they could understand. The simplest trick was to replace every letter with another one, following a rule that both sides had agreed on in advance. For many centuries this seemed safe enough. Then careful readers noticed that some letters appear far more often than others, and that this pattern survives any simple replacement.'
  ];
  /** 凱撒的神祕密文（明文） */
  const MYST_SHORT = [
    'A good scientist writes down every measurement, even the ones that seem wrong. Tomorrow the strange number may turn out to be the most important clue of the whole experiment.',
    'When the bell rings, the students rush out of the classroom, but one of them stays behind to finish the puzzle on the board. She is sure the answer is hiding in the pattern of the letters.',
    'The old lighthouse keeper sent messages to passing ships by flashing his lamp. Long and short flashes formed letters, and the sailors wrote them down before turning the wheel toward home.',
    'Bees tell each other where the flowers are by dancing. The angle of the dance points toward the food, and the length of the waggle tells the others how far they must fly to reach it.',
    'In the morning the mountain was hidden in thick clouds. By noon the wind had cleared the sky, and from the top we could see the river shining all the way down to the sea.',
    'To keep a secret, two friends agreed on a number that nobody else knew. Each letter in their notes moved forward by that many places, and their teacher could not read a single word of it.',
    'Rain falls on the hills, flows into streams and rivers, and finally reaches the ocean. The sun warms the water, new clouds form in the sky, and the whole journey starts over again.',
    'A spider builds a new web almost every evening. Each thread is thinner than a hair, yet the net is strong enough to catch flies and moths, and in the morning it holds the shining dew.'
  ];
  /** 維吉尼亞的神祕密文（明文，每段 500 個字母以上，重合指數才看得出金鑰長度） */
  const MYST_LONG = [
    'The night sky over the mountains is so dark that the band of the Milky Way looks like a river of milk poured across the stars. Astronomers come here with telescopes, cameras and warm coffee, and they work until the first light of dawn. They measure how bright each star is, how its color changes, and how it moves from one night to the next. From these small numbers they learn how far away the stars are, how old they are, and how they will end. Some will swell into red giants, some will shrink into white dwarfs, and a few will explode so brightly that for a few weeks they outshine an entire galaxy.',
    'A computer network is a little like a postal service. Your message is cut into many small packets, and each packet carries the address of the computer it must reach. Routers pass the packets along from one link to the next, choosing a path that seems short and not too busy. The packets may travel by different roads and arrive out of order, so the receiving computer puts them back together using the numbers written on each one. Anyone who can see the wires can read the packets as they fly past, which is why websites now encrypt almost everything they send, from the words you search for to the pictures you share with your friends.',
    'Every living cell carries instructions written in a chemical alphabet of only four letters. The order of those letters tells the cell which proteins to build, how fast to grow and when to divide. When a cell copies its instructions, it usually makes no mistakes at all, but now and then a single letter changes. Most of these small changes do nothing, a few are harmful, and a very few turn out to be useful. Over thousands of generations the useful ones spread through a population, and the living world slowly changes its shape. Reading this alphabet has taught scientists more about life than any microscope could ever show.',
    'When you drop a stone into a quiet pond, rings of waves spread out in every direction. The water itself does not travel very far; each little piece of the surface only moves up and down while the wave passes by. Sound works in the same way in the air, and light behaves like a wave too, although it needs no water or air at all. When two waves meet, they can add up to a larger wave or cancel each other out completely. This simple rule explains the colors on a soap bubble, the patterns on a guitar string and the way noise cancelling headphones quietly erase the hum of an airplane engine.',
    'The first mechanical calculators were full of gears, levers and tiny springs, and a single sum could take a whole minute of cranking. Later machines used relays that clicked open and shut, then glass tubes that glowed like small light bulbs, and finally transistors so small that billions of them fit on a chip the size of a fingernail. Each step made computers faster, cheaper and more reliable, yet the basic idea never changed: a long list of simple instructions, carried out one after another, turns rows of zeros and ones into answers. The same idea now runs inside phones, cars, washing machines and even greeting cards.'
  ];
  /** 神祕維吉尼亞密文的金鑰（3–8 個字母） */
  const MYST_KEYS = ['LAB', 'SUN', 'BYTE', 'STAR', 'PIXEL', 'LOGIC', 'CIPHER', 'ORBITS', 'NETWORK', 'PROGRAM', 'COMPUTER', 'KEYBOARD'];

  /** 有種子的亂數（mulberry32），回傳 [0, 1) */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 凱撒神祕密文：隨機一段、隨機位移 1–25（避開上一題的那一段） */
  function makeCaesarMystery(rand, prevIdx) {
    let idx = Math.floor(rand() * MYST_SHORT.length);
    if (idx === prevIdx) idx = (idx + 1 + Math.floor(rand() * (MYST_SHORT.length - 1))) % MYST_SHORT.length;
    const k = 1 + Math.floor(rand() * 25);
    return { kind: 'caesar', idx: idx, k: k, key: letter(k), plain: MYST_SHORT[idx], cipher: caesar(MYST_SHORT[idx], k) };
  }
  /** 維吉尼亞神祕密文：隨機一段、隨機金鑰（避開上一題的那一段） */
  function makeVigMystery(rand, prevIdx) {
    let idx = Math.floor(rand() * MYST_LONG.length);
    if (idx === prevIdx) idx = (idx + 1 + Math.floor(rand() * (MYST_LONG.length - 1))) % MYST_LONG.length;
    const key = MYST_KEYS[Math.floor(rand() * MYST_KEYS.length)];
    return { kind: 'vig', idx: idx, k: -1, key: key, plain: MYST_LONG[idx], cipher: vigenere(MYST_LONG[idx], key, 'enc') };
  }

  /** 短雜湊（FNV-1a 32 位元，十六進位）：任務事件用來比對「同一段文字」，不把整段文字送出去 */
  function hash(s) {
    s = String(s || '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function round(x, k) { if (!isFinite(x)) return null; const p = Math.pow(10, k); return Math.round(x * p) / p; }

  // ---------------- 任務事件（頁面與任務證明共用，保證兩邊送出一樣的資料） ----------------
  /**
   * 凱撒分頁：o = { src, input, k, dir, back（按「把輸出放回輸入」之前的 { prevIn, k, dir }）, myst（神祕密文的種類或 ''）}
   */
  function caesarEvent(o) {
    const out = caesarApply(o.input, o.k, o.dir);
    const Li = lettersOnly(o.input), Lo = lettersOnly(out);
    const b = o.back || null;
    return {
      src: o.src, k: o.k, dir: o.dir, letters: Li.length, inHash: hash(o.input),
      inShort: Li.length <= 12 ? Li : '', outShort: Lo.length <= 12 ? Lo : '',
      back: !!(b && out === b.prevIn && Li.length > 0), k1: b ? b.k : -1, d1: b ? b.dir : '',
      myst: o.myst || ''
    };
  }
  /**
   * 頻率分析分頁：o = { src, input, g, overlay, chiAll, myst（神祕密文物件或 null）, prov（{ plain, shift, user } 或 null）}
   */
  function freqEvent(o) {
    const cnt = counts(o.input);
    const m = o.myst || null, pv = o.prov || null;
    const trueShift = m && m.kind === 'caesar' ? m.k : (pv ? mod(pv.shift, 26) : -1);
    return {
      src: o.src, g: o.g, gBest: bestShift(cnt), chi2: round(chiSquared(cnt, o.g), 2), N: cnt.n,
      overlay: !!o.overlay, chiAll: !!o.chiAll, myst: m ? m.kind : '', trueShift: trueShift,
      user: !!(pv && pv.user), plainIc: pv ? round(iocText(pv.plain), 4) : null, plainWords: pv ? words(pv.plain) : 0,
      plainE: pv ? counts(pv.plain).c[4] : -1, ic: round(ioc(cnt), 4)
    };
  }
  /**
   * 維吉尼亞分頁：o = { src, input, key, keySrc（'typed'／'guess'／'default'／'myst'）, dir, L, myst, autoKey }
   */
  function vigEvent(o) {
    const ks = keyShifts(o.key);
    const out = vigenere(o.input, ks, o.dir);
    const Li = lettersOnly(o.input);
    const cipher = lettersOnly(o.dir === 'dec' ? o.input : out);
    const used = ks.length >= Li.length ? keyFromShifts(ks.slice(0, Li.length)) : '';
    const m = o.myst || null;
    return {
      src: o.src, dir: o.dir, letters: Li.length, keyLen: ks.length, keyShift: ks.length === 1 ? ks[0] : -1,
      keySrc: o.keySrc || '', keyPeriod: used ? minPeriod(used) : 0, inHash: hash(o.input),
      poly: o.dir === 'dec' ? polyMax(out, o.input) : polyMax(o.input, out),
      L: o.L, iocL: round(avgIoc(cipher, o.L), 4), myst: m ? m.kind : '', secretLen: m && m.kind === 'vig' ? m.key.length : 0,
      autoKey: !!o.autoKey, ic: round(ioc(counts(cipher)), 4)
    };
  }
  /** 「這就是原文」：o = { output, myst, tab, usedKey（維吉尼亞分頁的金鑰字母）, keySrc（金鑰來源）, chiShown, caesarTouched, autoKey } */
  function crackEvent(o) {
    const m = o.myst;
    return {
      ok: !!(m && o.output === m.plain), kind: m ? m.kind : '', tab: o.tab, keySrc: o.keySrc || '',
      chiShown: !!o.chiShown, caesarTouched: !!o.caesarTouched, autoKey: !!o.autoKey,
      sameKey: !!(m && m.kind === 'vig' && lettersOnly(o.usedKey) === m.key),
      keyLen: lettersOnly(o.usedKey || '').length, secretLen: m && m.kind === 'vig' ? m.key.length : 0,
      letters: m ? lettersOnly(m.plain).length : 0
    };
  }
  /** 公鑰分頁：o = { act（'enc'／'dec'／'decPub'／'eve'）, key（rsaKey 的結果）, M（加密前的訊息）, C, R, steps } */
  function rsaEvent(o) {
    const k = o.key;
    return {
      act: o.act, p: k.p, q: k.q, n: k.n, phi: k.phi, e: k.e, d: k.d,
      M: o.M, C: o.C, R: o.R == null ? null : o.R, ok: o.R != null && o.R === o.M, steps: o.steps || 0
    };
  }

  const api = {
    MAX_TEXT: MAX_TEXT, MAX_KEY: MAX_KEY, MAX_L: MAX_L, FREQ_EN: FREQ_EN, P_EN: P_EN, IC_EN: IC_EN, IC_RANDOM: IC_RANDOM,
    letterIndex: letterIndex, letter: letter, mod: mod, lettersOnly: lettersOnly, clampText: clampText, shiftChar: shiftChar,
    caesar: caesar, caesarApply: caesarApply,
    counts: counts, chiSquared: chiSquared, chiAll: chiAll, bestShift: bestShift, ioc: ioc, iocText: iocText, topLetter: topLetter, words: words,
    keyShifts: keyShifts, keyFromShifts: keyFromShifts, vigenere: vigenere, columns: columns, avgIoc: avgIoc, iocProfile: iocProfile,
    recoverKey: recoverKey, minPeriod: minPeriod, polyMax: polyMax,
    PRIMES: PRIMES, isPrime: isPrime, gcd: gcd, egcd: egcd, modInverse: modInverse, modPow: modPow, SAFE_MOD: SAFE_MOD,
    rsaKey: rsaKey, nextValidE: nextValidE, factor: factor, fixedCount: fixedCount, iroot: iroot, paperBlock: paperBlock,
    DEFAULT_TEXT: DEFAULT_TEXT, SAMPLES: SAMPLES, MYST_SHORT: MYST_SHORT, MYST_LONG: MYST_LONG, MYST_KEYS: MYST_KEYS,
    rng: rng, makeCaesarMystery: makeCaesarMystery, makeVigMystery: makeVigMystery, hash: hash, round: round,
    caesarEvent: caesarEvent, freqEvent: freqEvent, vigEvent: vigEvent, crackEvent: crackEvent, rsaEvent: rsaEvent
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CryptoCore = api;
})(typeof window !== 'undefined' ? window : this);
