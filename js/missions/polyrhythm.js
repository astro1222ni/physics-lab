/* missions/polyrhythm.js — 多重節奏與歐幾里得節奏的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/polyrhythm.js 發出，都在學生操作之後）：
 *   'rhythm'：改了節奏的設定之後（滑桿放開或打字、點珠子或格子、按傳統節奏型、開關聲部、換對齊方式、改速度）。
 *             src = 'slider' | 'cell' | 'preset' | 'toggle' | 'align' | 'tempo'；changed = 改的是第幾個聲部（0–2，只有聲部本身改了才有）。
 *   'play'：按「▶ 播放」。
 *   'view'：切到 3D 環面結。
 *   資料 = PolyrhythmCore.analyze 的結果：
 *     { mode（'cycle' 同一個循環 | 'step' 同樣的格長）, bpm, voices: [{ i, on, n, k, rot, custom, src（這個聲部最後怎麼來的：
 *       'default' | 'slider' | 'cell' | 'preset' | 'share'）, pattern（'x..x..x.'）, onsets, iois, euclid, eu { k, n, rot }, me（最大均勻）,
 *       evenness, period（最小週期）, pulse（均勻的拍數，不是就 0）, active（開著而且有重音） }],
 *       active（有重音的聲部編號）, nActive, L（共同細格數 = lcm）, cellSec, cycleSec, periodSec, Pmin（實際的最小週期）,
 *       union（合成節奏）, hits（每一格哪些聲部敲）, together（全部一起落拍的格子）, gaps（一起落拍之間相隔幾格）, nTogether,
 *       overlap（兩個以上一起敲的格數）, pairs（兩兩一起落拍的次數，例如 { '12': 3 }）, torus { w: [wA, wB] } }
 *     再加上 view（'2d' | '3d'）、playing、src、changed。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const act = function (d) { return (d.voices || []).filter(function (v) { return v.active; }); };
  const own = function (v) { return v.src === 'slider' || v.src === 'cell'; };
  const gcd = function (a, b) { while (b) { const t = a % b; a = b; b = t; } return a; };
  const isRhythm = function (ev) { return ev.type === 'rhythm' || ev.type === 'play'; };
  const TRESILLO = 'x..x..x.', CINQUILLO = 'x.xx.xx.';
  /** 是不是另一個的旋轉 */
  const isRot = function (p, q) { return p.length === q.length && (q + q).indexOf(p) >= 0; };
  /** 兩個有重音的聲部的「均勻拍數」（由小到大）；不是剛好兩個或有一個不是均勻的拍就 null */
  const pulses2 = function (d) {
    const a = act(d);
    if (a.length !== 2 || !a[0].pulse || !a[1].pulse) return null;
    return [a[0].pulse, a[1].pulse].sort(function (x, y) { return x - y; });
  };
  /** 合成節奏去掉第 skip 個聲部之後的樣子（在 L 個細格上） */
  const unionWithout = function (d, skip) {
    return (d.hits || []).map(function (who) { return who.some(function (i) { return i !== skip; }) ? 'x' : '.'; }).join('');
  };

  LabMission.register('polyrhythm', [
    {
      id: 'polyrhythm-1', level: 1,
      title: { zh: '聽古巴的 tresillo', en: 'Hear the Cuban tresillo' },
      desc: { zh: '按「古巴 tresillo」，再按「▶ 播放」：8 格裡平均放 3 個重音，間距 3-3-2。', en: 'Press “Cuban tresillo”, then “▶ Play”: three accents spread over eight boxes, gaps 3-3-2.' },
      check: function (ev) { return ev.type === 'play' && act(ev.data).some(function (v) { return v.pattern === TRESILLO; }); }
    },
    {
      id: 'polyrhythm-2', level: 2,
      title: { zh: '自己做出 tresillo', en: 'Build the tresillo yourself' },
      desc: { zh: '不按節奏型按鈕，用一個聲部的「總拍數 n」和「重音數 k」滑桿做出 x..x..x.（E(3,8)，從第 0 格開始）。', en: 'Without the rhythm buttons, use a voice’s “Beats n” and “Accents k” sliders to make x..x..x. (E(3,8), starting on box 0).' },
      check: function (ev) { return ev.type === 'rhythm' && act(ev.data).some(function (v) { return v.pattern === TRESILLO && own(v); }); }
    },
    {
      id: 'polyrhythm-3', level: 3,
      title: { zh: '3 對 2', en: 'Three against two' },
      desc: { zh: '用「同一個循環」，讓一個聲部每個循環平均敲 3 下、另一個平均敲 2 下（第三個聲部關掉），按「▶ 播放」，看兩圈在哪裡一起亮。', en: 'With “Same cycle”, make one voice play 3 even beats per cycle and another 2 (voice 3 off), press “▶ Play” and watch where the two rings flash together.' },
      check: function (ev) { const p = pulses2(ev.data); return ev.type === 'play' && ev.data.mode === 'cycle' && !!p && p[0] === 2 && p[1] === 3; }
    },
    {
      id: 'polyrhythm-4', level: 3,
      title: { zh: '換個起點：西班牙探戈', en: 'A new starting point: Spanish tango' },
      desc: { zh: '把 cinquillo E(5,8) 用「旋轉」改成從第 2 個重音開始（xx.xx.x.）：同一串項鍊，變成西班牙探戈的節奏。', en: 'Use “Rotation” to start the cinquillo E(5,8) on its second accent (xx.xx.x.): the same necklace becomes the Spanish tango rhythm.' },
      check: function (ev) { return ev.type === 'rhythm' && act(ev.data).some(function (v) { return v.pattern === 'xx.xx.x.' && own(v); }); }
    },
    {
      id: 'polyrhythm-5', level: 4,
      title: { zh: '親手排出最大均勻', en: 'Maximally even by hand' },
      desc: { zh: '先把一個聲部的「重音數 k」拉到 0，再只靠點珠子放進至少 4 個重音，排出「最大均勻」的節奏（k 和 n 互質，至少空 2 格）。', en: 'First pull a voice’s “Accents k” down to 0, then add at least 4 accents only by tapping beads, and make a “maximally even” rhythm (k and n with no common factor, at least 2 rests).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'rhythm') return false;
        mem.fresh = mem.fresh || {};
        (d.voices || []).forEach(function (v) {
          if (v.k <= 1) mem.fresh[v.i] = true;
          else if (d.changed === v.i && d.src !== 'cell') mem.fresh[v.i] = false;
        });
        if (d.src !== 'cell' || d.changed == null) return false;
        const v = d.voices[d.changed];
        return !!mem.fresh[v.i] && v.on && v.me && v.k >= 4 && v.k <= v.n - 2 && gcd(v.k, v.n) === 1;
      }
    },
    {
      id: 'polyrhythm-6', level: 5,
      title: { zh: '巴西 bossa nova', en: 'Brazilian bossa nova' },
      desc: { zh: '做出 E(5,16)，再用「旋轉」讓它從第 3 個重音開始：x..x..x...x..x..，這就是 bossa nova 的節奏。', en: 'Make E(5,16), then use “Rotation” to start it on its third accent: x..x..x...x..x.., the bossa nova rhythm.' },
      check: function (ev) { return ev.type === 'rhythm' && act(ev.data).some(function (v) { return v.pattern === 'x..x..x...x..x..' && own(v); }); }
    },
    {
      id: 'polyrhythm-7', level: 5,
      title: { zh: '12 格才相遇', en: 'Meeting every 12 boxes' },
      desc: { zh: '選「同樣的格長」，只開兩個聲部，讓它們每隔 12 格才一起落拍一次（看「全部一起落拍」的間隔）。', en: 'Choose “Same beat length”, use only two voices, and make them land together only once every 12 boxes (read the spacing under “All voices land together”).' },
      check: function (ev) {
        const d = ev.data;
        return isRhythm(ev) && d.mode === 'step' && d.nActive === 2 && d.gaps.length >= 1 && d.gaps.every(function (g) { return g === 12; });
      }
    },
    {
      id: 'polyrhythm-8', level: 6,
      title: { zh: '古巴 son clave 不是歐幾里得節奏', en: 'The Cuban son clave is not Euclidean' },
      desc: { zh: '在一個 n = 16 的聲部點珠子，做出間距 3-3-4-2-4 的 son clave（x..x..x...x.x...，從哪個重音開始都可以），看它的均勻度。', en: 'In a voice with n = 16, tap beads to make the son clave with gaps 3-3-4-2-4 (x..x..x...x.x..., any starting accent), and look at its evenness.' },
      check: function (ev) { return ev.type === 'rhythm' && act(ev.data).some(function (v) { return v.n === 16 && isRot(v.pattern, 'x..x..x...x.x...'); }); }
    },
    {
      id: 'polyrhythm-9', level: 7,
      title: { zh: '互補的兩個聲部', en: 'Two complementary voices' },
      desc: { zh: '讓兩個總拍數相同的聲部互補：一個敲的格子另一個都不敲，合起來每一格剛好一個聲部敲；而且兩個都是歐幾里得節奏，各至少 2 個重音。', en: 'Make two voices with the same number of beats complement each other: wherever one plays the other rests, so every box is played by exactly one of them — and both are Euclidean rhythms with at least 2 accents each.' },
      check: function (ev) {
        const a = act(ev.data);
        if (!isRhythm(ev)) return false;
        for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) {
          const p = a[x], q = a[y];
          if (p.n !== q.n || p.k < 2 || q.k < 2 || !p.euclid || !q.euclid) continue;
          let ok = true;
          for (let j = 0; j < p.n && ok; j++) if ((p.pattern.charAt(j) === 'x') === (q.pattern.charAt(j) === 'x')) ok = false;
          if (ok) return true;
        }
        return false;
      }
    },
    {
      id: 'polyrhythm-10', level: 8,
      title: { zh: '第三個聲部唸出 4 對 3', en: 'Voice 3 speaks four against three' },
      desc: { zh: '在「同一個循環」做 4 對 3（兩個聲部平均敲 4 下和 3 下），再勾選「開啟聲部 3」、設 n = 12，點珠子讓它剛好敲出前兩個聲部合起來的節奏。', en: 'In “Same cycle” play four against three (two voices with 4 and 3 even beats), then tick “Turn on voice 3”, set n = 12, and tap beads so that it plays exactly the combined rhythm of the other two.' },
      check: function (ev) {
        const d = ev.data, a = act(d);
        if (!isRhythm(ev) || d.mode !== 'cycle' || a.length !== 3 || d.L !== 12) return false;
        return a.some(function (c) {
          if (c.n !== 12) return false;
          const o = a.filter(function (v) { return v !== c; });
          const ps = [o[0].pulse, o[1].pulse].sort();
          return ps[0] === 3 && ps[1] === 4 && c.pattern === unionWithout(d, c.i);
        });
      }
    },
    {
      id: 'polyrhythm-11', level: 9,
      title: { zh: '永不相遇', en: 'Never meeting' },
      desc: { zh: '選「同樣的格長」，只開兩個聲部，「總拍數 n」不同、各至少 2 個重音，卻在整個週期裡一次也不一起落拍。', en: 'Choose “Same beat length” with only two voices whose “Beats n” differ, each with at least 2 accents, that never land together in the whole period.' },
      check: function (ev) {
        const d = ev.data, a = act(d);
        return isRhythm(ev) && d.mode === 'step' && a.length === 2 && a[0].n !== a[1].n && a[0].k >= 2 && a[1].k >= 2 && d.nTogether === 0;
      }
    },
    {
      id: 'polyrhythm-12', level: 10,
      title: { zh: '兩隻手合出 cinquillo', en: 'Two hands make a cinquillo' },
      desc: { zh: '只開兩個聲部，兩個都是歐幾里得節奏、各至少 2 個重音、從不一起敲，合起來剛好是 cinquillo x.xx.xx.（看「合成節奏」）。', en: 'Use only two voices, both Euclidean rhythms with at least 2 accents each that never play together, whose combined rhythm is exactly the cinquillo x.xx.xx. (see “Combined rhythm”).' },
      check: function (ev) {
        const d = ev.data, a = act(d);
        return isRhythm(ev) && a.length === 2 && d.L === 8 && d.union === CINQUILLO && d.overlap === 0 &&
          a.every(function (v) { return v.euclid && v.k >= 2; });
      }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'polyrhythm-h1', level: 3, hidden: true,
      riddle: { zh: '大家都擠在門口，屋子裡卻空蕩蕩的。', en: 'Everyone crowds at the door while the rest of the house stands empty.' },
      check: function (ev) {
        return ev.type === 'rhythm' && ev.data.src === 'cell' && act(ev.data).some(function (v) {
          return v.k >= 4 && v.n >= 2 * v.k && v.iois.filter(function (g) { return g === 1; }).length === v.k - 1;
        });
      }
    },
    {
      id: 'polyrhythm-h2', level: 4, hidden: true,
      riddle: { zh: '哈瓦那的三步舞，在加倍的地板上原樣跳了兩遍。', en: 'The three-step dance of Havana, danced twice over on a floor twice as long.' },
      check: function (ev) { return isRhythm(ev) && act(ev.data).some(function (v) { return v.pattern === TRESILLO + TRESILLO; }); }
    },
    {
      id: 'polyrhythm-h3', level: 5, hidden: true,
      riddle: { zh: '安納托利亞的舞者，每一圈走到最後總要跛一下。', en: 'The Anatolian dancer limps at the end of every round.' },
      check: function (ev) { const a = act(ev.data); return ev.type === 'play' && a.length === 1 && a[0].pattern === 'x.x.x.x..'; }
    },
    {
      id: 'polyrhythm-h4', level: 5, hidden: true,
      riddle: { zh: '把三個一樣長的腳步塞進八個房間，哈瓦那人笑說：差不多就好。', en: 'Squeeze three equal steps into eight rooms — “close enough,” they say in Havana.' },
      check: function (ev) {
        const d = ev.data, a = act(d);
        return ev.type === 'play' && d.mode === 'cycle' && a.some(function (v) { return v.pulse === 3; }) && a.some(function (v) { return v.pattern === TRESILLO; });
      }
    },
    {
      id: 'polyrhythm-h5', level: 6, hidden: true,
      riddle: { zh: '兩個沉默寡言的人，各繞著互不整除的圈、各只開口一次，又不從同一個地方出發——他們終究會同時開口。', en: 'Two quiet people, each going round a circle that does not divide the other, each speaking once and not starting together — sooner or later they speak at the same moment.' },
      check: function (ev) {
        const d = ev.data, a = act(d);
        return isRhythm(ev) && d.mode === 'step' && a.length === 2 && a[0].k === 1 && a[1].k === 1 && gcd(a[0].n, a[1].n) === 1 &&
          a[0].onsets[0] !== 0 && a[1].onsets[0] !== 0 && d.L >= 30 && d.nTogether === 1;
      }
    },
    {
      id: 'polyrhythm-h6', level: 6, hidden: true,
      riddle: { zh: '三個人輪班，誰也不碰誰，卻沒有一刻空著。', en: 'Three take turns: they never meet, yet not a moment is left empty.' },
      check: function (ev) {
        const d = ev.data, a = act(d);
        return isRhythm(ev) && a.length === 3 && d.overlap === 0 && d.union.indexOf('.') < 0 && a.every(function (v) { return v.euclid && v.k >= 2; });
      }
    },
    {
      id: 'polyrhythm-h7', level: 7, hidden: true,
      riddle: { zh: '在甜甜圈上，打一個有五片花瓣的結。', en: 'On a doughnut, tie a knot with five petals.' },
      check: function (ev) {
        const t = ev.data.torus;
        return ev.data.view === '3d' && (ev.type === 'view' || isRhythm(ev)) && !!t && Math.min(t.w[0], t.w[1]) === 2 && Math.max(t.w[0], t.w[1]) === 5;
      }
    },
    {
      id: 'polyrhythm-h8', level: 7, hidden: true,
      riddle: { zh: '要等長針走完一小格，這段音樂才回到原點。', en: 'The music comes home only when the minute hand has moved one notch.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.nActive >= 2 && Math.abs(d.periodSec - 60) < 0.05; }
    },
    {
      id: 'polyrhythm-h9', level: 8, hidden: true,
      riddle: { zh: '三個固執的輪子，要等到不能再久，才肯再一次並肩出發。', en: 'Three stubborn wheels wait as long as they possibly can before setting off side by side again.' },
      check: function (ev) { const d = ev.data; return isRhythm(ev) && d.mode === 'step' && d.nActive === 3 && d.L === 3120; }
    },
    {
      id: 'polyrhythm-h10', level: 9, hidden: true,
      riddle: { zh: '三人兩兩都見過面，卻從來沒有三個人同時在場。', en: 'Every two of them have met, yet the three have never been in the room at once.' },
      check: function (ev) {
        const d = ev.data;
        if (!isRhythm(ev) || d.nActive !== 3 || d.nTogether !== 0) return false;
        const ks = Object.keys(d.pairs || {});
        return ks.length === 3 && ks.every(function (k) { return d.pairs[k] >= 1; });
      }
    }
  ]);
})();
