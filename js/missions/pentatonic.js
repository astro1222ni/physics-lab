/* missions/pentatonic.js — 五聲音階：宮商角徵羽的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/pentatonic.js 發出，都在使用者操作之後；資料由 PentatonicCore.eventData 產生）：
 *   'scale'：音階改變之後。src = 'tonic'（主音選單）、'mode'（調式按鈕）、'custom'（點鍵盤或鐘面自訂；另有 toggled、added）、
 *            'tuning'（換音律）、'arr'（鐘面排列）。
 *   'gen'：三分損益改變之後。src = 'next'（下一步）、'prev'（上一步）、'reset'（從頭）、'order'（先損／先益）、'len'（宮的弦長）；
 *          fromReset = 從「↺ 從頭」開始一直只按「下一步 ▶」走到現在。
 *   'play'：按「▶ 播放」。另有 content（'up'、'down'、'updown'、'melody'、'gen'）、tempo。
 *   'step'：點步伐條的一格。另有 i（第幾步，0 起算）、size（半音數）。
 *   'tap'：點長條圖上的一根弦。另有 idx（第幾個產生的，0 = 宮）、role、prevIdx（上一次點的弦，沒有是 −1）、pairP、pairQ、pairCents（從上一根到這一根的頻率比與音分）。
 *   共同的資料：{ tonic（0–11）, tonicName, type（調式代號或 'custom'）, n, semis, steps, pcs, names, pent, k, mode（'gong'…'yu' 或 null）,
 *     gongPc, gongName, white, black, sharps, flats, doubles, brightness, iv, maxEven, minStep, semitones, tritones, seven（'ya'、'qing'、'yan' 或 null）,
 *     tuning（'pyth' | 'equal'）, order（'sun' 先損 | 'yi' 先益）, L0（宮的弦長）, arr（'chrom' | 'fifths'）, gen（產生了幾個音）, allInt, kinds（步伐有幾種）,
 *     minGap, genPcs, genBlack（產生的音全是黑鍵）, lens }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const keyOf = function (d) { return d.tonicName + ':' + d.semis.join(','); };
  const BRIGHT_WALK = ['gong', 'zhi', 'shang', 'yu', 'jue'];

  LabMission.register('pentatonic', [
    {
      id: 'pentatonic-1', level: 1,
      title: { zh: '宮商角徵羽', en: 'Gong, shang, jue, zhi, yu' },
      desc: { zh: '主音 C、「宮調式」，把「播放內容」改成「上行再下行」，按「▶ 播放」，邊聽邊看鐘面上的五邊形：宮商角徵羽就是 Do Re Mi Sol La。', en: 'With tonic C and “Gong mode”, set “What to play” to “Up and down” and press “▶ Play”. Watch the pentagon on the clock: gong, shang, jue, zhi, yu are Do Re Mi Sol La.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.tonicName === 'C' && d.mode === 'gong' && d.content === 'updown'; }
    },
    {
      id: 'pentatonic-2', level: 2,
      title: { zh: '三分損益生五音', en: 'Five notes by “add or remove a third”' },
      desc: { zh: '起手選「先損（史記）」，按「↺ 從頭」，再一步一步按「下一步 ▶」，用三分損益生出五個音，看弦長 81、54、72、48、64 怎麼來。', en: 'Choose “Remove first (Shiji)”, press “↺ Start over”, then keep pressing “Next ▶” until the “add or remove a third” rule has made five notes. Watch the string lengths 81, 54, 72, 48, 64 appear.' },
      check: function (ev) { const d = ev.data; return ev.type === 'gen' && d.src === 'next' && d.fromReset && d.gen === 5 && d.order === 'sun'; }
    },
    {
      id: 'pentatonic-3', level: 2,
      title: { zh: '白鍵上的羽調式', en: 'Yu mode on the white keys' },
      desc: { zh: '做出一個「羽調式」，五個音全部是白鍵，按「▶ 播放」。它聽起來像小調嗎？', en: 'Make a “Yu mode” whose five notes are all white keys and press “▶ Play”. Does it sound minor?' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.mode === 'yu' && d.white; }
    },
    {
      id: 'pentatonic-4', level: 3,
      title: { zh: '只彈黑鍵', en: 'Black keys only' },
      desc: { zh: '選主音和調式，讓五個音全部落在黑鍵上，按「▶ 播放」。（鍵盤上的黑鍵剛好排成一個五聲音階。）', en: 'Choose a tonic and a mode so that all five notes are black keys, then press “▶ Play”. (The black keys of the piano are a pentatonic scale.)' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.pent && d.black; }
    },
    {
      id: 'pentatonic-5', level: 3,
      title: { zh: '一個半音也沒有', en: 'Not a single half step' },
      desc: { zh: '換成「商調式」，在步伐條上把五步都點一遍（點一格會聽到相鄰的兩個音）。有沒有哪一步是半音？', en: 'Switch to “Shang mode” and tap all five steps on the step bar (each tap plays two neighbouring notes). Is any of them a half step?' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'step' || d.mode !== 'shang') return false;
        const k = keyOf(d);
        if (mem.k !== k) { mem.k = k; mem.s = {}; }
        mem.s[d.i] = true;
        return Object.keys(mem.s).length >= 5;
      }
    },
    {
      id: 'pentatonic-6', level: 3,
      title: { zh: '四個五度疊出的三度', en: 'A third built from four fifths' },
      desc: { zh: '在長條圖上先點「宮」那根弦，再點「角」那根弦，看讀數：三分損益的大三度 81:64，比純律的大三度 5:4 寬多少？', en: 'In the bar chart tap the “gong” string, then the “jue” string, and read the numbers: how much wider is the 81:64 third of the rule than the just third 5:4?' },
      check: function (ev) { const d = ev.data; return ev.type === 'tap' && d.idx === 4 && d.prevIdx === 0; }
    },
    {
      id: 'pentatonic-7', level: 4,
      title: { zh: '五度圈上的鄰居', en: 'Neighbours on the circle of fifths' },
      desc: { zh: '把「鐘面排列」改成「五度順序」，五個音會擠成連續的五格。用「宮調式」分別播放 G 宮和 F 宮，看它們和 C 宮的五格差在哪裡。', en: 'Set “Clock order” to “Fifths”: the five notes become five neighbouring cells. In “Gong mode”, play G gong and F gong and see how their cells differ from C gong.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'play' || d.arr !== 'fifths' || d.mode !== 'gong') return false;
        mem.t = mem.t || {};
        mem.t[d.tonic] = true;
        return !!(mem.t[7] && mem.t[5]);
      }
    },
    {
      id: 'pentatonic-8', level: 5,
      title: { zh: '《管子》的五個數', en: 'The five numbers of the Guanzi' },
      desc: { zh: '起手改成「先益（管子）」，按「↺ 從頭」，再用「下一步 ▶」生出五個音。這一次哪兩根弦比宮還長？', en: 'Switch to “Add first (Guanzi)”, press “↺ Start over” and make five notes with “Next ▶”. Which two strings are now longer than gong?' },
      check: function (ev) { const d = ev.data; return ev.type === 'gen' && d.src === 'next' && d.fromReset && d.gen === 5 && d.order === 'yi'; }
    },
    {
      id: 'pentatonic-9', level: 5,
      title: { zh: '一個宮，五種調式', en: 'One gong, five modes' },
      desc: { zh: '同一組五個音可以有五個不同的主音。選一個宮（例如 C），把它的宮調式、商調式、角調式、徵調式、羽調式各按一次「▶ 播放」（主音要跟著換）。', en: 'The same five notes can have five different tonics. Pick one gong (for example C) and press “▶ Play” for its gong, shang, jue, zhi and yu modes (change the tonic each time).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'play' || !d.pent || d.gongPc == null) return false;
        mem.g = mem.g || {};
        const s = mem.g[d.gongPc] = mem.g[d.gongPc] || {};
        s[d.mode] = true;
        return Object.keys(s).length >= 5;
      }
    },
    {
      id: 'pentatonic-10', level: 5,
      title: { zh: '只動一個音就換了宮', en: 'One note moved, a new gong' },
      desc: { zh: '先用調式按鈕選好一個五聲音階，然後在鍵盤或鐘面上只點兩下：拿掉一個音、加上一個音，讓它變成另一個宮的五聲音階（主音不變）。', en: 'Pick a pentatonic scale with the mode buttons, then tap the keyboard or the clock just twice — remove one note and add one note — so that it becomes the pentatonic scale of a different gong (same tonic).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'scale') return false;
        // 從調式按鈕（或主音選單）選好的五聲音階開始，剛好點兩下：拿掉一個、加上一個
        if (d.src === 'mode' || d.src === 'tonic') { mem.base = d.pent && d.type !== 'custom' ? { pcs: d.pcs.slice(), g: d.gongPc, t: d.tonic } : null; mem.n = 0; return false; }
        if (d.src !== 'custom' || !mem.base) return false;
        mem.n = (mem.n || 0) + 1;
        if (mem.n !== 2 || !d.pent || d.tonic !== mem.base.t || d.gongPc === mem.base.g) return false;
        const a = mem.base.pcs, b = d.pcs;
        const diff = a.filter(function (x) { return b.indexOf(x) < 0; }).length + b.filter(function (x) { return a.indexOf(x) < 0; }).length;
        return diff === 2;
      }
    },
    {
      id: 'pentatonic-11', level: 7,
      title: { zh: '自己拼出角調式', en: 'Build a jue mode yourself' },
      desc: { zh: '先按「宮調式」，然後不再用調式按鈕，只在鍵盤或鐘面上點音，把它改成同一個主音的「角調式」（讀數會認出它）。想一想：主音是角的話，宮在哪裡？', en: 'Press “Gong mode”, then — without the mode buttons, only by tapping notes on the keyboard or the clock — turn it into the “Jue mode” on the same tonic (the readings will recognise it). Hint: if the tonic is jue, where is gong?' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'scale') return false;
        if (d.src === 'mode' || d.src === 'tonic') { mem.t = d.type === 'gong' ? d.tonic : null; return false; }
        return d.src === 'custom' && mem.t != null && d.tonic === mem.t && d.mode === 'jue';
      }
    },
    {
      id: 'pentatonic-12', level: 9,
      title: { zh: '七根弦都要整數', en: 'Seven whole-number strings' },
      desc: { zh: '宮的弦長 81 讓五根弦都是整數，可是第 6 根就變成 42.67。用「下一步 ▶」生到 7 個音，再改「宮的弦長」，找出讓七根弦全部是整數的弦長（滑桿範圍內只有一個）。', en: 'A gong string of 81 makes all five lengths whole numbers, but the 6th becomes 42.67. Go to 7 notes with “Next ▶”, then change “Gong string length” until all seven lengths are whole numbers (only one value in the slider range works).' },
      check: function (ev) { const d = ev.data; return ev.type === 'gen' && d.gen === 7 && d.allInt; }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'pentatonic-h1', level: 3, hidden: true,
      riddle: { zh: '有一條路，從哪一頭走過來，腳下的石板都一樣寬。', en: 'There is a road whose paving stones are the same widths whichever end you start from.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.mode === 'shang' && d.content === 'down'; }
    },
    {
      id: 'pentatonic-h2', level: 4, hidden: true,
      riddle: { zh: '第六位客人一進門，屋裡第一次有兩個人肩並肩擠在一起；請大家照進門的順序唱一遍。', en: 'The moment the sixth guest walks in, two people are squeezed shoulder to shoulder for the first time; have everyone sing in the order they arrived.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.content === 'gen' && d.gen === 6; }
    },
    {
      id: 'pentatonic-h3', level: 5, hidden: true,
      riddle: { zh: '五個人誰也不挨著誰坐，原來還有別的坐法，只是有人身邊空得特別寬。', en: 'Five people sit with nobody next to anybody — there are other ways to do it, but someone ends up with a very wide gap beside them.' },
      check: function (ev) { const d = ev.data; return ev.type === 'scale' && d.src === 'custom' && d.n === 5 && d.minStep >= 2 && !d.pent; }
    },
    {
      id: 'pentatonic-h4', level: 6, hidden: true,
      riddle: { zh: '第六個人也不肯挨著別人坐，十二張椅子就只剩一種排法。', en: 'A sixth person also refuses to sit next to anyone, and twelve chairs leave only one way to do it.' },
      check: function (ev) { const d = ev.data; return ev.type === 'scale' && d.src === 'custom' && d.n === 6 && d.minStep >= 2; }
    },
    {
      id: 'pentatonic-h5', level: 6, hidden: true,
      riddle: { zh: '從一根弦出發，三分去一、三分益一，一路上只踩烏木。', en: 'Start from one string, take away a third, add a third, and step only on ebony all the way.' },
      check: function (ev) { const d = ev.data; return ev.type === 'gen' && d.src === 'next' && d.fromReset && d.gen === 5 && d.genBlack; }
    },
    {
      id: 'pentatonic-h6', level: 7, hidden: true,
      riddle: { zh: '走了一整圈想回到出發的那根弦，卻差了一根頭髮那麼長。', en: 'You walk all the way round to come back to the string you started from, and miss it by a hair.' },
      check: function (ev) { const d = ev.data; return ev.type === 'gen' && d.src === 'next' && d.gen === 13; }
    },
    {
      id: 'pentatonic-h7', level: 7, hidden: true,
      riddle: { zh: '同一個家換了五次主人，從最亮的一位換到最暗的一位；每次搬家只搬走一件家具，每一位都要開口唱。', en: 'One house changes owner five times, from the brightest to the darkest; each move takes away just one piece of furniture, and every owner must sing.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'play' || !d.mode) return false;
        const k = BRIGHT_WALK.indexOf(d.mode);
        if (k === 0) { mem.t = d.tonicName; mem.k = 0; return false; }
        if (mem.k == null || mem.k < 0 || d.tonicName !== mem.t) { mem.k = -1; return false; }
        if (k === mem.k) return false;
        if (k === mem.k + 1) { mem.k = k; return k === 4; }
        mem.k = -1;
        return false;
      }
    },
    {
      id: 'pentatonic-h8', level: 8, hidden: true,
      riddle: { zh: '照著最古老的那份清單把弦一根一根做出來，再讓清單上最長的那一根當家，從它唱起。', en: 'Make the strings one by one from the oldest list, then let the longest string on that list be home and sing from it.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'gen' && d.src === 'next' && d.fromReset && d.gen === 5 && d.order === 'yi') { mem.ok = true; return false; }
        return !!mem.ok && ev.type === 'play' && d.order === 'yi' && d.mode === 'zhi' && d.content !== 'gen' && d.content !== 'melody';
      }
    },
    {
      id: 'pentatonic-h9', level: 9, hidden: true,
      riddle: { zh: '五位老朋友再請兩位到宴席上：一位清清淡淡，一位閏在宮的身旁。', en: 'Five old friends invite two more to the banquet: one pale and plain, one tucked in just below the next gong.' },
      check: function (ev, mem) {
        // 從「宮調式」的五個音出發，點兩下加兩個音（主音就是宮）
        const d = ev.data;
        if (ev.type !== 'scale') return false;
        if (d.src === 'mode' || d.src === 'tonic') { mem.t = d.type === 'gong' ? d.tonic : null; mem.n = 0; return false; }
        if (d.src !== 'custom' || mem.t == null) return false;
        mem.n = (mem.n || 0) + 1;
        return mem.n === 2 && d.tonic === mem.t && d.seven === 'yan';
      }
    },
    {
      id: 'pentatonic-h10', level: 10, hidden: true,
      riddle: { zh: '五、七之後，下一個只穿兩種尺寸鞋子的家族有幾口人？讓全家照出生的順序唱一遍。', en: 'After five and seven, how big is the next family whose feet come in only two shoe sizes? Have the whole family sing in order of birth.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.content === 'gen' && d.gen === 12; }
    }
  ]);
})();
