/* missions/temperament.js — 五度相生、純律與十二平均律的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/temperament.js 發出，都在使用者操作之後）：
 *   'select'：選音改變之後（按鍵盤、按選音按鈕、點誤差地圖）或換音律、換主音之後（有選音時）。
 *   'listen'：按「▶ 播放」，把選的音一起彈。
 *     兩者的資料 = 分析結果 { kind（'pythagorean' | 'just' | 'equal' | 'regular'）, tonic（0 = C … 11 = B）, w（五度收窄，音分）,
 *       notes（MIDI 編號，由低到高）, freqs, devs（相對十二平均律的音分）, count（幾個音）, src,
 *       pairs: [{ lo, hi, semis（半音數）, cents（音分）, dev（和純音程差幾音分）, beat（最接近的泛音之間的拍頻 Hz）, m, n }] }
 *   'compare'：按「比較三種音律」。{ notes, tonic, w, count, results: { pythagorean, just, equal（, regular）: 同上的分析 } }
 *   'stackListen'：疊疊樂按「和 C 一起聽」。{ n（疊了幾個五度）, fifth（每個五度的音分）, kind, w, pure（是不是純五度 3/2）, offC（離最近的 C 幾音分）, beat }
 *   'narrow'：五度收窄滑桿放開（或打字輸入）之後。{ w, fifth, gap12（十二個五度比七個八度多多少）, M3（一般大三度的誤差）, m3（一般小三度的誤差）, dim4, wolf, tritone }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const PURE5 = 1200 * Math.log2(1.5), PC = 1200 * Math.log2(531441 / 524288), SC = 1200 * Math.log2(81 / 80);
  /** 只選了兩個音時，那一對音程（否則 null） */
  const pair2 = function (d) { return d && d.count === 2 && d.pairs && d.pairs.length === 1 ? d.pairs[0] : null; };
  const isSel = function (ev) { return ev.type === 'select' || ev.type === 'listen'; };
  const pcsOf = function (d) { return (d.notes || []).map(function (m) { return ((m % 12) + 12) % 12; }).sort(function (a, b) { return a - b; }).join(','); };
  const allPure = function (d) { return d.pairs && d.pairs.length && d.pairs.every(function (p) { return p.beat < 0.01; }); };

  LabMission.register('temperament', [
    {
      id: 'temperament-1', level: 1,
      title: { zh: '十二個五度', en: 'Twelve fifths' },
      desc: { zh: '用「五度相生」或「純律」，按「再疊一個五度」疊滿 12 個純五度，再按「和 C 一起聽」。', en: 'With “Pythagorean” or “Just”, press “Stack a fifth” until you have 12 pure fifths, then press “Hear it with C”.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stackListen' && d.pure && d.n === 12; }
    },
    {
      id: 'temperament-2', level: 2,
      title: { zh: '三種音律比一比', en: 'Three tunings side by side' },
      desc: { zh: '選一個大三度（例如 C 和 E），按「比較三種音律」，依序聽五度相生、純律、十二平均律。', en: 'Pick a major third (C and E, say) and press “Compare tunings” to hear it in Pythagorean, just and equal temperament in turn.' },
      check: function (ev) { const d = ev.data; return ev.type === 'compare' && d.results && d.results.just && d.results.just.pairs.some(function (p) { return p.semis === 4; }); }
    },
    {
      id: 'temperament-3', level: 3,
      title: { zh: '找到狼五度', en: 'Find the wolf' },
      desc: { zh: '在「五度相生」裡選出一個比純五度窄了一個畢氏音差（約 23.5 音分）的五度：它就是「狼五度」。', en: 'In “Pythagorean”, pick the fifth that is a Pythagorean comma (about 23.5 cents) narrower than pure — the wolf fifth.' },
      check: function (ev) { const d = ev.data, p = pair2(d); return isSel(ev) && d.kind === 'pythagorean' && p && p.semis === 7 && near(p.dev, -PC, 0.1); }
    },
    {
      id: 'temperament-4', level: 3,
      title: { zh: '拍頻消失了', en: 'The beats disappear' },
      desc: { zh: '只選一個大三度，先用「十二平均律」按「▶ 播放」（拍頻每秒 5 次以上），再用「純律」播放同樣兩個音，看拍頻變成 0。', en: 'Select just a major third. Play it with “▶ Play” in “Equal temperament” (beats faster than 5 per second), then play the same two notes in “Just” and watch the beats drop to 0.' },
      check: function (ev, mem) {
        const d = ev.data, p = pair2(d);
        if (ev.type !== 'listen' || !p || p.semis !== 4) return false;
        const key = d.notes.join('-');
        mem.eq = mem.eq || {}; mem.ju = mem.ju || {};
        if (d.kind === 'equal' && p.beat > 5) mem.eq[key] = true;
        if (d.kind === 'just' && p.beat < 0.01) mem.ju[key] = true;
        return !!(mem.eq[key] && mem.ju[key]);
      }
    },
    {
      id: 'temperament-5', level: 4,
      title: { zh: '讓十二個五度閉合', en: 'Close the circle' },
      desc: { zh: '換一種音律（或調整「五度收窄」），讓疊了 12 個五度之後剛好回到 C（差不到 0.1 音分），再按「和 C 一起聽」確認不拍。', en: 'Change the tuning (or the “Narrow each fifth” slider) so that 12 stacked fifths land exactly on C (within 0.1 cent), then press “Hear it with C” to check there are no beats.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stackListen' && d.n === 12 && near(d.offC, 0, 0.1); }
    },
    {
      id: 'temperament-6', level: 4,
      title: { zh: '慢慢拍的五度', en: 'A slowly beating fifth' },
      desc: { zh: '在「十二平均律」裡找一個每秒拍不到 1 次的五度，按「▶ 播放」聽它慢慢起伏。', en: 'In “Equal temperament”, find a fifth that beats less than once a second and listen to it swell with “▶ Play”.' },
      check: function (ev) { const d = ev.data, p = pair2(d); return ev.type === 'listen' && d.kind === 'equal' && p && p.semis === 7 && p.beat < 1; }
    },
    {
      id: 'temperament-7', level: 5,
      title: { zh: '換個調就走音', en: 'Out of tune in another key' },
      desc: { zh: '「主音」是 C 的「純律」裡，有的五度比純五度窄了一個同音差（約 21.5 音分）。選出一個這樣的五度。', en: 'In “Just” intonation with C as the “Tonic”, some fifths are a syntonic comma (about 21.5 cents) narrow. Pick one of them.' },
      check: function (ev) { const d = ev.data, p = pair2(d); return isSel(ev) && d.kind === 'just' && d.tonic === 0 && p && p.semis === 7 && near(p.dev, -SC, 0.05); }
    },
    {
      id: 'temperament-8', level: 5,
      title: { zh: '狼跟著主音跑', en: 'The wolf follows the tonic' },
      desc: { zh: '把「主音」換成 C 以外的音，在「五度相生」的鍵盤上直接按出新的狼五度（兩個音都在 C4–C5 之間），按「▶ 播放」。', en: 'Change the “Tonic” to something other than C, then find the new wolf fifth in “Pythagorean” right on the keyboard (both notes between C4 and C5) and press “▶ Play”.' },
      check: function (ev) {
        const d = ev.data, p = pair2(d);
        return ev.type === 'listen' && d.kind === 'pythagorean' && d.tonic !== 0 && p && p.semis === 7 && p.hi <= 72 && near(p.dev, -PC, 0.1);
      }
    },
    {
      id: 'temperament-9', level: 6,
      title: { zh: '大三度變純', en: 'Pure major thirds' },
      desc: { zh: '拖曳「五度收窄 w」，讓調和律一般的大三度變成純的（誤差在 0.05 音分以內）。這就是中全音律。', en: 'Drag “Narrow each fifth by w” until the ordinary major thirds of the regular temperament are pure (within 0.05 cent). This is quarter-comma meantone.' },
      check: function (ev) { return ev.type === 'narrow' && near(ev.data.M3, 0, 0.05); }
    },
    {
      id: 'temperament-10', level: 7,
      title: { zh: '十二個五度一樣大', en: 'Twelve equal fifths' },
      desc: { zh: '只用「五度收窄 w」，讓十二個五度加起來剛好等於七個八度（差不到 0.1 音分），連狼五度也消失。', en: 'Using only “Narrow each fifth by w”, make twelve fifths add up to exactly seven octaves (within 0.1 cent), so that even the wolf disappears.' },
      check: function (ev) { return ev.type === 'narrow' && near(ev.data.gap12, 0, 0.1); }
    },
    {
      id: 'temperament-11', level: 8,
      title: { zh: '一個主音救兩個和弦', en: 'One tonic, two pure chords' },
      desc: { zh: '在「純律」裡選一個「主音」，讓 C 大三和弦（C、E、G）和 D 大三和弦（D、F♯、A）分別按「▶ 播放」時，三個音之間的拍頻都是 0。', en: 'In “Just” intonation, choose a “Tonic” so that the C major chord (C, E, G) and the D major chord (D, F♯, A), each played with “▶ Play”, have no beats at all.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'listen' || d.kind !== 'just' || d.count !== 3 || !allPure(d)) return false;
        const s = pcsOf(d);
        mem.t = mem.t || {};
        const m = mem.t[d.tonic] = mem.t[d.tonic] || {};
        if (s === '0,4,7') m.c = true;
        if (s === '2,6,9') m.d = true;
        return !!(m.c && m.d);
      }
    },
    {
      id: 'temperament-12', level: 9,
      title: { zh: '中全音律的狼', en: 'The meantone wolf' },
      desc: { zh: '先調出大三度純的中全音律（「調和律」），再找出它的狼五度並按「▶ 播放」：這匹狼和五度相生的狼有什麼不同？', en: 'Tune quarter-comma meantone (“Regular”, pure major thirds), then find its wolf fifth and press “▶ Play”. How is this wolf different from the Pythagorean one?' },
      check: function (ev) { const d = ev.data, p = pair2(d); return ev.type === 'listen' && d.kind === 'regular' && near(d.w, SC / 4, 0.02) && p && p.semis === 7 && p.dev > 30; }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'temperament-h1', level: 3, hidden: true,
      riddle: { zh: '同一座樓梯上，兩級同名的台階，一高一矮。', en: 'On one staircase, two steps share a name, yet one is taller than the other.' },
      check: function (ev, mem) {
        const d = ev.data, p = pair2(d);
        if (ev.type !== 'listen' || d.kind !== 'just' || !p || p.semis !== 2) return false;
        if (near(p.cents, 1200 * Math.log2(9 / 8), 0.05)) mem.big = true;
        if (near(p.cents, 1200 * Math.log2(10 / 9), 0.05)) mem.small = true;
        return !!(mem.big && mem.small);
      }
    },
    {
      id: 'temperament-h2', level: 4, hidden: true,
      riddle: { zh: '同樣只隔一個門牌，從左邊來和從右邊來，路卻不一樣長。', en: 'Next door is next door — yet coming from the left is not as far as coming from the right.' },
      check: function (ev, mem) {
        const d = ev.data, p = pair2(d);
        if (ev.type !== 'listen' || d.kind !== 'pythagorean' || !p || p.semis !== 1) return false;
        if (near(p.cents, 1200 * Math.log2(256 / 243), 0.05)) mem.limma = true;
        if (near(p.cents, 1200 * Math.log2(2187 / 2048), 0.05)) mem.apotome = true;
        return !!(mem.limma && mem.apotome);
      }
    },
    {
      id: 'temperament-h3', level: 6, hidden: true,
      riddle: { zh: '大家都怕被擠得太窄，偏偏有一位撐得太開。', en: 'Everyone fears being squeezed too narrow; one of them is stretched too wide.' },
      check: function (ev) { const d = ev.data, p = pair2(d); return ev.type === 'listen' && d.kind === 'just' && p && p.semis === 7 && p.dev > 15; }
    },
    {
      id: 'temperament-h4', level: 5, hidden: true,
      riddle: { zh: '一家子的三度都吵吵鬧鬧，跨過野獸的那一步，卻意外地溫柔。', en: 'All the thirds in this family quarrel; the one step taken across the beast is surprisingly gentle.' },
      check: function (ev, mem) {
        const d = ev.data, p = pair2(d);
        if (ev.type !== 'listen' || d.kind !== 'pythagorean' || !p || p.semis !== 4) return false;
        if (near(p.dev, SC, 0.05)) mem.loud = true;          // 一般的大三度 81/64：寬 21.5 音分
        if (near(p.dev, SC - PC, 0.05)) mem.gentle = true;   // 跨過狼五度的減四度 8192/6561：只窄 1.95 音分
        return !!(mem.loud && mem.gentle);
      }
    },
    {
      id: 'temperament-h5', level: 7, hidden: true,
      riddle: { zh: '讓憂鬱的那一層不再發抖。', en: 'Let the melancholy storey stop trembling.' },
      check: function (ev) { return ev.type === 'narrow' && near(ev.data.m3, 0, 0.05); }
    },
    {
      id: 'temperament-h6', level: 7, hidden: true,
      riddle: { zh: '三層完美的樓，疊不到屋頂。', en: 'Three perfect storeys never reach the roof.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stackListen' && d.kind === 'regular' && d.n === 12 && near(d.offC, -1200 * Math.log2(128 / 125), 0.3); }
    },
    {
      id: 'temperament-h7', level: 8, hidden: true,
      riddle: { zh: '讓快樂與憂鬱錯得一樣多。', en: 'Let joy and melancholy be exactly as wrong as each other.' },
      check: function (ev) { const d = ev.data; return ev.type === 'narrow' && near(d.M3 - d.m3, 0, 0.1); }
    },
    {
      id: 'temperament-h8', level: 8, hidden: true,
      riddle: { zh: '漢朝有人比畢達哥拉斯更有耐心，幾乎走回了起點。', en: 'Someone in Han-dynasty China was more patient than Pythagoras, and very nearly came home.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stackListen' && d.pure && d.n === 53 && near(d.offC, 53 * PURE5 - 37200, 0.01); }
    },
    {
      id: 'temperament-h9', level: 9, hidden: true,
      riddle: { zh: '連魔鬼也有被馴服的一天。', en: 'Even the devil can be tamed.' },
      check: function (ev) {
        const d = ev.data, p = pair2(d);
        return ev.type === 'listen' && d.kind === 'regular' && p && p.semis === 6 &&
          (near(p.cents, 1200 * Math.log2(45 / 32), 0.05) || near(p.cents, 1200 * Math.log2(64 / 45), 0.05));
      }
    },
    {
      id: 'temperament-h10', level: 10, hidden: true,
      riddle: { zh: '不走十二步也能回到家，只要每一步都肯讓一點。', en: 'You can come home without taking twelve steps, as long as every step gives way a little.' },
      check: function (ev) { const d = ev.data; return ev.type === 'stackListen' && d.kind === 'regular' && d.n > 12 && d.n % 12 !== 0 && near(d.offC, 0, 0.5); }
    }
  ]);
})();
