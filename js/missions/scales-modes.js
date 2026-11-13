/* missions/scales-modes.js — 音階與調式的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/scales-modes.js 發出，都在使用者操作之後；資料由 ScalesModesCore.eventData 產生）：
 *   'scale'：音階改變之後。src = 'type'（音階選單）、'tonic'（主音選單）、'ladder'（亮暗階梯）、'custom'（點鍵盤或鐘面自訂）、
 *            'tuning'（換音律）、'pin'（按「記住這個音階」）。亮暗階梯另有 ladder = { dir（+1 更暗、−1 更亮、0 直接選一格）, wrap, from, degree }。
 *   'play'：按「▶ 播放」。另有 dir（'up'、'down'、'updown'、'arp'）、tempo。
 *   'step'：點步伐條的一格。另有 i（第幾步，0 起算）、size（半音數）、lo、hi（兩個音比主音高幾個半音）、stepCents、p、q（純律時的比值）。
 *   共同的資料：{ tonic（0–11）, tonicName（'C'、'B♭'…）, type（預設音階代號或 'custom'）, n, semis, steps, pcs, names,
 *     family（'diatonic'、'harmonic'、'melodic'、'pentatonic'、'wholetone'、'octatonic'、'chromatic' 或 null）, rot, mode（教會調式代號或 null）, scaleId,
 *     sharps, flats, doubles, brightness, iv（音程向量）, maxEven, myhill, palindrome, sym（往上移幾個半音就和自己重合，最小值；沒有是 0）, triad, tuning（'equal' | 'just'）, white（全是白鍵）,
 *     ref（記住的音階：{ tonicName, n, pcs, mode, family, iv, common, sameSet, sameClass } 或 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const ORDER = ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian'];
  const key = function (d) { return d.tonicName + ':' + d.semis.join(','); };
  const sameArr = function (a, b) { return a && b && a.length === b.length && a.every(function (x, i) { return x === b[i]; }); };
  const distinct = function (arr) { return arr.every(function (x, i) { return arr.indexOf(x) === i; }); };
  const CHROMATIC_SEMITONE = 1200 * Math.log2(25 / 24);

  LabMission.register('scales-modes', [
    {
      id: 'scales-modes-1', level: 1,
      title: { zh: '大調的樓梯', en: 'The major staircase' },
      desc: { zh: '主音 C、音階「伊奧尼亞（大調）」，把「方向」改成「上行再下行」，按「▶ 播放」，邊聽邊看步伐條：全 全 半 全 全 全 半。', en: 'With tonic C and “Ionian (major)”, set “Direction” to “Up and down” and press “▶ Play”. Watch the step bar as you listen: W W H W W W H.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.tonicName === 'C' && d.mode === 'ionian' && d.dir === 'updown'; }
    },
    {
      id: 'scales-modes-2', level: 2,
      title: { zh: 'F 大調的第 4 級', en: 'The 4th of F major' },
      desc: { zh: '把「主音」換成 F，用「伊奧尼亞（大調）」按「▶ 播放」。看音表：第 4 級寫成 B♭ 還是 A♯？為什麼？', en: 'Change the “Tonic” to F and press “▶ Play” with “Ionian (major)”. In the note table, is the 4th written B♭ or A♯ — and why?' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.tonicName === 'F' && d.mode === 'ionian' && d.names.indexOf('B♭') >= 0; }
    },
    {
      id: 'scales-modes-3', level: 2,
      title: { zh: '只用白鍵的多利亞', en: 'Dorian on the white keys' },
      desc: { zh: '做出一個「多利亞」調式，而且七個音全部是白鍵（音表裡沒有任何升降記號）。', en: 'Make a “Dorian” mode whose seven notes are all white keys (no sharps or flats in the note table).' },
      check: function (ev) { const d = ev.data; return (ev.type === 'scale' || ev.type === 'play') && d.mode === 'dorian' && d.white && d.n === 7; }
    },
    {
      id: 'scales-modes-4', level: 3,
      title: { zh: '同一組音的大調與小調', en: 'A major and a minor with the same notes' },
      desc: { zh: '先做出 C「伊奧尼亞（大調）」，按「記住這個音階」；再做出 A「伊奧利亞（自然小調）」，看兩個音階共用幾個音。', en: 'Make C “Ionian (major)” and press “Remember this scale”; then make A “Aeolian (natural minor)” and see how many notes the two share.' },
      check: function (ev) {
        const d = ev.data, r = d.ref;
        return ev.type === 'scale' && r && r.mode === 'ionian' && r.tonicName === 'C' && d.tonicName === 'A' && d.mode === 'aeolian' && r.common === 7;
      }
    },
    {
      id: 'scales-modes-5', level: 3,
      title: { zh: '平均律和純律', en: 'Equal and just' },
      desc: { zh: '同一個音階，分別用「十二平均律」和「純律」各按一次「▶ 播放」，比較音表裡每個音的頻率和音分。', en: 'Play the same scale with “▶ Play” once in “Equal temperament” and once in “Just intonation”, and compare the frequencies and cents in the note table.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'play') return false;
        const k = key(d);
        mem.eq = mem.eq || {}; mem.ju = mem.ju || {};
        if (d.tuning === 'equal') mem.eq[k] = true; else if (d.tuning === 'just') mem.ju[k] = true;
        return !!(mem.eq[k] && mem.ju[k]);
      }
    },
    {
      id: 'scales-modes-6', level: 4,
      title: { zh: '從最亮走到最暗', en: 'From brightest to darkest' },
      desc: { zh: '在亮暗階梯上先按「利底亞」，再連按「▼ 更暗」，一格一格走到洛克里亞。每走一格，看是哪一個音降了半音。', en: 'On the brightness ladder press “Lydian”, then keep pressing “▼ Darker”, one rung at a time, until you reach Locrian. At each rung, notice which note drops a half step.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'scale') return false;
        if (d.src === 'tuning' || d.src === 'pin') return false;
        const k = ORDER.indexOf(d.mode);
        if (k === 0) { mem.t = d.tonicName; mem.k = 0; return false; }
        if (d.src === 'ladder' && d.ladder && d.ladder.dir === 1 && !d.ladder.wrap && d.tonicName === mem.t && mem.k === k - 1) { mem.k = k; return k === 6; }
        mem.k = -1;
        return false;
      }
    },
    {
      id: 'scales-modes-7', level: 4,
      title: { zh: '弗里吉亞的兩個半音', en: 'The two half steps of Phrygian' },
      desc: { zh: '做出 E「弗里吉亞」，在步伐條上點出它的兩個半音（點一格就會聽到那兩個相鄰的音）。', en: 'Make E “Phrygian” and tap its two half steps on the step bar (each tap plays the two neighbouring notes).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'step' || d.tonicName !== 'E' || d.mode !== 'phrygian' || d.size !== 1) return false;
        mem.h = mem.h || {};
        mem.h[d.i] = true;
        return !!(mem.h[0] && mem.h[4]);
      }
    },
    {
      id: 'scales-modes-8', level: 5,
      title: { zh: '和聲小調的那道溝', en: 'The gap in the harmonic minor' },
      desc: { zh: '選「和聲小調」，在步伐條上找出特別寬的那一步（增二度，3 個半音），點它來聽。', en: 'Choose “Harmonic minor”, find the extra-wide step on the step bar (the augmented second, 3 semitones) and tap it.' },
      check: function (ev) { const d = ev.data; return ev.type === 'step' && d.scaleId === 'harmonic' && d.size === 3; }
    },
    {
      id: 'scales-modes-9', level: 5,
      title: { zh: '自己拼出一個調式', en: 'Build a mode yourself' },
      desc: { zh: '在鍵盤或鐘面上點音，自己拼一個七聲音階，讓讀數認出它是大調以外的某個教會調式。', en: 'Tap notes on the keyboard or the clock to build a seven-note scale that the readings recognise as a church mode other than major.' },
      check: function (ev) { const d = ev.data; return ev.type === 'scale' && d.src === 'custom' && d.mode && d.mode !== 'ionian'; }
    },
    {
      id: 'scales-modes-10', level: 5,
      title: { zh: '七個降記號', en: 'Seven flats' },
      desc: { zh: '做出一個有 7 個降記號的教會調式，按「▶ 播放」。（每個教會調式都藏在某個大調的音裡。）', en: 'Make a church mode with seven flats and press “▶ Play”. (Every church mode hides inside the notes of some major scale.)' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.family === 'diatonic' && d.flats === 7 && d.sharps === 0 && d.doubles === 0; }
    },
    {
      id: 'scales-modes-11', level: 8,
      title: { zh: '比利底亞還亮', en: 'Brighter than Lydian' },
      desc: { zh: '利底亞的亮度 +21 是七個教會調式裡最亮的。在鍵盤上自己拼一個七聲音階，步伐只用全音和半音（不能有 3 個半音以上的一步），讓亮度超過 +21。', en: 'Lydian, at brightness +21, is the brightest church mode. Build a seven-note scale on the keyboard using only whole and half steps (no step of 3 semitones or more) whose brightness is above +21.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'scale' && d.src === 'custom' && d.n === 7 && d.brightness != null && d.brightness > 21 && d.steps.every(function (x) { return x === 1 || x === 2; });
      }
    },
    {
      id: 'scales-modes-12', level: 10,
      title: { zh: '轉不到一圈就重合', en: 'Back to itself before a full turn' },
      desc: { zh: '全音音階往上移 2 個半音、八聲音階往上移 3 個半音，都還是同一組音：在鐘面上，形狀轉不到一整圈就和自己重合。自己拼一個 5 到 9 個音、也有這種「移位對稱」的音階，但不能是全音、八聲或半音音階。', en: 'Move the whole-tone scale up 2 semitones, or the octatonic scale up 3, and you get the same notes: on the clock, the shape matches itself before a full turn. Build a scale of 5 to 9 notes with this “transposition symmetry” that is not the whole-tone, octatonic or chromatic scale.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'scale' && d.src === 'custom' && d.n >= 5 && d.n <= 9 && d.sym > 0 && ['wholetone', 'octatonic', 'chromatic'].indexOf(d.family) < 0;
      }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'scales-modes-h1', level: 3, hidden: true,
      riddle: { zh: '七兄弟輪流疊起自己的小塔，只有一座塔的塔頂歪了半格。', en: 'Seven brothers each stack a little tower; only one tower’s top leans half a step.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.mode === 'locrian' && d.dir === 'arp'; }
    },
    {
      id: 'scales-modes-h2', level: 4, hidden: true,
      riddle: { zh: '一條只有一種步伐的路：走到哪裡，都分不出家在哪。', en: 'A road with only one kind of stride: wherever you stand, you cannot tell where home is.' },
      check: function (ev) { const d = ev.data; return ev.type === 'scale' && d.src === 'custom' && d.family === 'wholetone'; }
    },
    {
      id: 'scales-modes-h3', level: 5, hidden: true,
      riddle: { zh: '鍵盤的鏡子立在一個白鍵上；從那裡出發，倒著走回家的腳步聲和出門時一模一樣。', en: 'The keyboard’s mirror stands on one white key; set out from there, walk home backwards, and your footsteps sound just as they did going out.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.mode === 'dorian' && d.tonicName === 'D' && d.dir === 'down'; }
    },
    {
      id: 'scales-modes-h4', level: 5, hidden: true,
      riddle: { zh: '一步一步走到最深的谷底，再往下一步，竟然站上了山頂。', en: 'Walk step by step to the bottom of the deepest valley; one more step down puts you on the summit.' },
      check: function (ev, mem) {
        // 要先用「▼ 更暗」（或「▲ 更亮」）連走至少 2 格到階梯的盡頭，再往同一個方向多走一步（同方向連按至少 3 次）
        const d = ev.data;
        if (ev.type !== 'scale' || d.src === 'tuning' || d.src === 'pin') return false;
        const g = d.src === 'ladder' && d.ladder && d.ladder.dir !== 0 ? d.ladder : null;
        if (!g) { mem.n = 0; mem.dir = 0; return false; }
        if (g.wrap) { const ok = mem.dir === g.dir && mem.n >= 2; mem.n = 0; mem.dir = 0; return ok; }
        if (mem.dir === g.dir) mem.n = (mem.n || 0) + 1; else { mem.dir = g.dir; mem.n = 1; }
        return false;
      }
    },
    {
      id: 'scales-modes-h5', level: 6, hidden: true,
      riddle: { zh: '最亮的和最暗的，原來住在同一棟房子裡。', en: 'The brightest and the darkest turn out to live in the same house.' },
      check: function (ev) {
        const d = ev.data, r = d.ref;
        return ev.type === 'scale' && r && r.sameSet && ((d.mode === 'lydian' && r.mode === 'locrian') || (d.mode === 'locrian' && r.mode === 'lydian'));
      }
    },
    {
      id: 'scales-modes-h6', level: 7, hidden: true,
      riddle: { zh: '一個真的有人在用的調，卻有一個音得被推兩次。', en: 'A key people really play in, yet one of its notes has to be pushed up twice.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'play' && d.scaleId === 'harmonic' && d.doubles === 1 && /♯♯$/.test(d.names[6] || '');
      }
    },
    {
      id: 'scales-modes-h7', level: 7, hidden: true,
      riddle: { zh: '八位客人圍著十二張椅子坐下，誰身邊都不比別人擠。', en: 'Eight guests sit down around twelve chairs, and nobody is more crowded than anybody else.' },
      check: function (ev) { const d = ev.data; return ev.type === 'scale' && d.src === 'custom' && d.n === 8 && d.maxEven; }
    },
    {
      id: 'scales-modes-h8', level: 8, hidden: true,
      riddle: { zh: '七個人擠成一團，彼此之間的距離，卻排成一道整整齊齊的樓梯。', en: 'Seven people huddle together, yet the distances between them line up into a perfectly neat staircase.' },
      check: function (ev) { const d = ev.data; return ev.type === 'scale' && d.src === 'custom' && d.n === 7 && d.family !== 'diatonic' && distinct(d.iv); }
    },
    {
      id: 'scales-modes-h9', level: 9, hidden: true,
      riddle: { zh: '在最純淨的調音裡，同一條路上藏著三步比半步還短的小步。', en: 'In the purest tuning, one road hides three steps shorter than a half step.' },
      check: function (ev, mem) {
        // 同一個音階（主音與音都相同）裡，把三個 25/24 的半音都點過
        const d = ev.data;
        if (ev.type !== 'step' || d.tuning !== 'just' || d.size !== 1 || !near(d.stepCents, CHROMATIC_SEMITONE, 0.01)) return false;
        const k = key(d);
        if (mem.k !== k) { mem.k = k; mem.lo = {}; }
        mem.lo[d.lo] = true;
        return Object.keys(mem.lo).length >= 3;
      }
    },
    {
      id: 'scales-modes-h10', level: 10, hidden: true,
      riddle: { zh: '兩個長得一點也不像的人，量出來的每一項身材數字卻完全一樣。', en: 'Two people who look nothing alike, yet every one of their measurements is identical.' },
      check: function (ev) {
        const d = ev.data, r = d.ref;
        return ev.type === 'scale' && r && r.n === d.n && d.n >= 4 && sameArr(r.iv, d.iv) && !r.sameClass;
      }
    }
  ]);
})();
