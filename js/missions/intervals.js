/* missions/intervals.js — 音程與頻率比的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/intervals.js 發出，都在使用者操作之後；資料由 IntervalsCore.eventData 產生）：
 *   'interval'：下方音、度數、性質或音律改變之後。src = 'lower'、'num'、'qual'、'key'（鍵盤設上方音）、'key-lo'（鍵盤設下方音）、'table'（點音程表）、'tuning'。
 *   'respell'：按「等音（換個寫法）」。另有 from、to（原本與新的短名，例如 'm3' → 'A2'）。
 *   'invert'：按「轉位」。另有 from、to。
 *   'stack'：按「＋ 疊上去」（op = 'push'）或「↶ 拿掉最後一塊」（op = 'pop'）之後。
 *   'play'：按「▶ 播放」（what = 'main'，mode = 'both' | 'melodic' | 'harmonic'）或「▶ 聽疊出來的音」（what = 'stack'）。
 *   共同的資料：{ lo, loName, hi, hiName, n, qual, short（'P5'、'm3'…）, simpleShort, semis, compound, tuning（'equal' | 'just'）,
 *     ratio（純律 [p, q]）, cents, centsJ, centsE, diffJE, inv: { short, prod, prodTwo }, enh（等音程的短名）,
 *     chain（沒有疊音程時是 null）: { shorts, len, start, total, semis, prod, centsJ, centsE, tableDiff, mainDiff, mainSame, tableComma, mainComma } }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const sameList = function (a, b) { return !!a && a.length === b.length && a.every(function (x, i) { return x === b[i]; }); };
  const chainIs = function (d, list) { return !!d.chain && sameList(d.chain.shorts, list); };
  const pair = function (a, b, x, y) { return (a === x && b === y) || (a === y && b === x); };
  const just = function (d) { return d.tuning === 'just'; };

  LabMission.register('intervals', [
    {
      id: 'intervals-1', level: 1,
      title: { zh: '完全五度', en: 'A perfect fifth' },
      desc: { zh: '把「度數」選「五度」、「性質」選「完全」，按「▶ 播放」，聽聽最和諧的音程之一（C–G 數字母：C D E F G）。', en: 'Set “Number” to “5th” and “Quality” to “perfect”, then press “▶ Play” to hear one of the most consonant intervals (C–G: count C D E F G).' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.what === 'main' && d.short === 'P5'; }
    },
    {
      id: 'intervals-2', level: 2,
      title: { zh: '同一個鍵，兩個名字', en: 'One key, two names' },
      desc: { zh: '做出小三度（例如 C–E♭），按「等音（換個寫法）」變成 C–D♯：一樣 3 個半音，卻叫增二度。再按一次換回來也算。', en: 'Make a minor third (for example C–E♭) and press “Respell (enharmonic)” to get C–D♯: still 3 semitones, but now an augmented second. Switching back counts too.' },
      check: function (ev) { const d = ev.data; return ev.type === 'respell' && pair(d.from, d.to, 'm3', 'A2'); }
    },
    {
      id: 'intervals-3', level: 2,
      title: { zh: '大三度翻個身', en: 'Turn a major third over' },
      desc: { zh: '選「純律」，做出大三度，按「轉位」：5/4 變成 8/5（小六度），兩個比值相乘剛好是 2。', en: 'Choose “Just intonation”, make a major third and press “Invert”: 5/4 becomes 8/5 (a minor sixth), and the two ratios multiply to exactly 2.' },
      check: function (ev) { const d = ev.data; return ev.type === 'invert' && just(d) && d.from === 'M3' && d.to === 'm6'; }
    },
    {
      id: 'intervals-4', level: 3,
      title: { zh: '五度加四度', en: 'A fifth plus a fourth' },
      desc: { zh: '在「純律」下，用「＋ 疊上去」把完全五度和完全四度接起來（哪個先都可以）：3/2 × 4/3 = 2，剛好一個八度。', en: 'In “Just intonation”, use “+ Stack it on” to join a perfect fifth and a perfect fourth (either order): 3/2 × 4/3 = 2, exactly an octave.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stack' && just(d) && (chainIs(d, ['P5', 'P4']) || chainIs(d, ['P4', 'P5'])); }
    },
    {
      id: 'intervals-5', level: 3,
      title: { zh: '大十度', en: 'A major tenth' },
      desc: { zh: '把「度數」選「十度」做出大十度，按「▶ 播放」：它是大三度再加一個八度，純律比值 5/4 × 2 = 5/2。', en: 'Set “Number” to “10th” to make a major tenth and press “▶ Play”: it is a major third plus an octave, just ratio 5/4 × 2 = 5/2.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.what === 'main' && d.short === 'M10'; }
    },
    {
      id: 'intervals-6', level: 4,
      title: { zh: '小三加大三', en: 'Minor third plus major third' },
      desc: { zh: '在「純律」下先疊一個小三度、再疊一個大三度：6/5 × 5/4 = 3/2。小三加大三是完全五度，也是小三和弦的骨架。', en: 'In “Just intonation”, stack a minor third and then a major third: 6/5 × 5/4 = 3/2. Minor third plus major third is a perfect fifth — the frame of a minor chord.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stack' && just(d) && chainIs(d, ['m3', 'M3']); }
    },
    {
      id: 'intervals-7', level: 5,
      title: { zh: '翻過來還是一樣大', en: 'The same size upside down' },
      desc: { zh: '用「十二平均律」做出增四度（例如 F–B），按「轉位」：600 音分轉位後還是 600 音分，剛好把八度切成一半。', en: 'In “Equal temperament” make an augmented fourth (for example F–B) and press “Invert”: 600 cents turns into 600 cents, exactly half an octave.' },
      check: function (ev) { const d = ev.data; return ev.type === 'invert' && d.tuning === 'equal' && pair(d.from, d.to, 'A4', 'd5'); }
    },
    {
      id: 'intervals-8', level: 5,
      title: { zh: '最不像鋼琴的大小音程', en: 'The least piano-like interval' },
      desc: { zh: '在「純律」下，找出大、小、完全音程裡，和平均律差最多音分的那一個（看讀數「純律 − 平均律」），按「▶ 播放」聽聽看。', en: 'In “Just intonation”, find the major, minor or perfect interval that differs most from equal temperament (see the reading “Just − equal”), then press “▶ Play”.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.what === 'main' && just(d) && d.simpleShort === 'm7'; }
    },
    {
      id: 'intervals-9', level: 6,
      title: { zh: '兩個全音不是大三度', en: 'Two whole tones are not a major third' },
      desc: { zh: '在「純律」下疊兩個大二度：9/8 × 9/8 = 81/64，拼出來是大三度，卻比表上的大三度 5/4 高了一點點。差多少音分？', en: 'In “Just intonation”, stack two major seconds: 9/8 × 9/8 = 81/64. It is spelled as a major third, yet it is a little higher than the table’s 5/4. By how many cents?' },
      check: function (ev) { const d = ev.data; return ev.type === 'stack' && just(d) && chainIs(d, ['M2', 'M2']); }
    },
    {
      id: 'intervals-10', level: 7,
      title: { zh: '三倍的頻率', en: 'Three times the frequency' },
      desc: { zh: '在「純律」下，用三塊不同的音程疊出頻率剛好 3 倍的音（完全十二度，就是泛音列的第 3 個泛音）。同度不會往上走，不算一塊。', en: 'In “Just intonation”, stack three different intervals so that the frequency becomes exactly 3 times higher (a perfect twelfth, the 3rd harmonic). A unison does not climb, so it does not count as a block.' },
      check: function (ev) {
        const d = ev.data, c = d.chain;
        return ev.type === 'stack' && just(d) && !!c && c.len === 3 && c.prod[0] === 3 && c.prod[1] === 1 && c.shorts.indexOf('P1') < 0 &&
          c.shorts[0] !== c.shorts[1] && c.shorts[1] !== c.shorts[2] && c.shorts[0] !== c.shorts[2];
      }
    },
    {
      id: 'intervals-11', level: 5,
      title: { zh: '轉位的例外', en: 'The odd inversion' },
      desc: { zh: '在「純律」下，轉位前後的兩個比值相乘幾乎都剛好是 2。找出唯一不是 2 的那一對，按「轉位」，看它比 2 多了什麼。', en: 'In “Just intonation”, an interval and its inversion almost always multiply to exactly 2. Find the one pair that does not, press “Invert”, and see what the extra bit is.' },
      check: function (ev) { const d = ev.data; return ev.type === 'invert' && just(d) && d.inv && d.inv.prod && !d.inv.prodTwo; }
    },
    {
      id: 'intervals-12', level: 9,
      title: { zh: '四塊積木，兩個八度', en: 'Four blocks, two octaves' },
      desc: { zh: '在「純律」下，用四塊各不相同的音程疊出剛好兩個八度（頻率 4 倍，比值 4/1）。同度不算一塊。想一想：哪些比值乘起來會約分到只剩 4？', en: 'In “Just intonation”, stack four different intervals that reach exactly two octaves (4 times the frequency, ratio 4/1). Unisons do not count. Think: which ratios multiply and cancel down to just 4?' },
      check: function (ev) {
        const d = ev.data, c = d.chain;
        if (ev.type !== 'stack' || !just(d) || !c || c.len !== 4 || c.prod[0] !== 4 || c.prod[1] !== 1 || c.shorts.indexOf('P1') >= 0) return false;
        return c.shorts.every(function (x, i) { return c.shorts.indexOf(x) === i; });
      }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'intervals-h1', level: 3, hidden: true,
      riddle: { zh: '同一個名字的兩兄弟，一個卻站得比較高。', en: 'Two brothers share one name, yet one stands taller.' },
      check: function (ev) { const d = ev.data; return (ev.type === 'interval' || ev.type === 'respell' || ev.type === 'play') && d.short === 'A1'; }
    },
    {
      id: 'intervals-h2', level: 4, hidden: true,
      riddle: { zh: '兩個人站在同一個地方；其中一個翻個身，中間就隔了一整層樓。', en: 'Two stand on the very same spot; one turns over, and a whole floor lies between them.' },
      check: function (ev) { const d = ev.data; return ev.type === 'invert' && d.from === 'P1' && d.to === 'P8'; }
    },
    {
      id: 'intervals-h3', level: 5, hidden: true,
      riddle: { zh: '兩段甜甜的路接起來，和一條帶點苦味的路並排一比，竟然短了一截。', en: 'Join two sweet roads end to end, lay them beside one bittersweet road, and they come up short.' },
      check: function (ev) {
        const d = ev.data;
        return (ev.type === 'interval' || ev.type === 'respell') && just(d) && chainIs(d, ['M3', 'M3']) && d.short === 'm6';
      }
    },
    {
      id: 'intervals-h4', level: 6, hidden: true,
      riddle: { zh: '魔鬼有兩張臉：放在鍵盤上一模一樣，放在最純淨的尺上卻差了一根頭髮。', en: 'The devil has two faces: identical on the keyboard, a hair apart on the purest ruler.' },
      check: function (ev, mem) {
        // 純律、同一個下方音：先播增四度（或減五度），按「等音」換成另一個，再播一次
        const d = ev.data;
        if (ev.type === 'respell') { mem.r = just(d) && pair(d.from, d.to, 'A4', 'd5') ? { lo: d.lo, to: d.to } : null; return false; }
        if (ev.type !== 'play') { mem.r = null; mem.p = null; return false; }
        if (d.what !== 'main' || !just(d) || (d.short !== 'A4' && d.short !== 'd5')) { mem.p = null; return false; }
        const ok = !!(mem.p && mem.p.lo === d.lo && mem.p.short !== d.short && mem.r && mem.r.lo === d.lo && mem.r.to === d.short);
        mem.p = { lo: d.lo, short: d.short };
        return ok;
      }
    },
    {
      id: 'intervals-h5', level: 7, hidden: true,
      riddle: { zh: '踏上三級最甜的台階，以為到了樓上，腳下卻還差一小步。', en: 'Climb three of the sweetest steps, sure you have reached the next floor, and find one small step still missing.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stack' && just(d) && chainIs(d, ['M3', 'M3', 'M3']); }
    },
    {
      id: 'intervals-h6', level: 7, hidden: true,
      riddle: { zh: '三個憂傷的小步疊在一起，在鍵盤上假裝成一個明亮的音程。', en: 'Three sad little steps, stacked together, pretend on the keyboard to be a bright interval.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stack' && just(d) && chainIs(d, ['m3', 'm3', 'm3']); }
    },
    {
      id: 'intervals-h7', level: 7, hidden: true,
      riddle: { zh: '鋼琴上只有一個鍵，耳朵卻聽得出兩個音。', en: 'Only one key on the piano, yet the ear hears two notes.' },
      check: function (ev, mem) {
        // 同一個下方音的減二度：先用十二平均律播（兩個音一樣高），再用純律播（差 128/125）
        const d = ev.data;
        if (ev.type !== 'play' || d.what !== 'main' || d.short !== 'd2') return false;
        if (d.tuning === 'equal') { mem.lo = d.lo; return false; }
        return mem.lo === d.lo;
      }
    },
    {
      id: 'intervals-h8', level: 10, hidden: true,
      riddle: { zh: '連跳四次最穩的步伐，落腳處卻比最甜的那一階高了一點點。', en: 'Four of the steadiest leaps in a row, and you land just a hair above the sweetest step.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stack' && just(d) && chainIs(d, ['P5', 'P5', 'P5', 'P5']); }
    },
    {
      id: 'intervals-h9', level: 6, hidden: true,
      riddle: { zh: '爬了比較多級的人，反而站得比較低。', en: 'The one who climbed more steps ends up standing lower.' },
      check: function (ev, mem) {
        // 純律、同一個下方音：先播增三度，再播減四度（四度比三度還小）
        const d = ev.data;
        if (ev.type !== 'play' || d.what !== 'main' || !just(d)) return false;
        if (d.short === 'A3') { mem.lo = d.lo; return false; }
        return d.short === 'd4' && mem.lo === d.lo;
      }
    },
    {
      id: 'intervals-h10', level: 8, hidden: true,
      riddle: { zh: '同一扇門，掛著三塊不同的門牌。', en: 'One door with three different house numbers.' },
      check: function (ev, mem) {
        // 同一個下方音，用「等音」讓 12 個半音的音程出現三種名字：增七度、完全八度、減九度
        const d = ev.data;
        if (ev.type !== 'respell' || d.semis !== 12) { if (ev.type !== 'play') { mem.lo = null; mem.seen = null; } return false; }
        if (mem.lo !== d.lo) { mem.lo = d.lo; mem.seen = {}; }
        mem.seen[d.from] = true; mem.seen[d.to] = true;
        return !!(mem.seen.A7 && mem.seen.P8 && mem.seen.d9);
      }
    }
  ]);
})();
