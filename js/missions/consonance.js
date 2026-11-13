/* missions/consonance.js — 協和與不協和的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/consonance.js 發出，都在學生操作之後）：
 *   'ratio'：頻率比 r 改變之後（拖曳滑桿或曲線放開、打字輸入、方向鍵停下、按音程按鈕）。
 *   'timbre'：換音色、改泛音數 n、衰減指數 p、拉伸係數 s、勾選奇次泛音之後。
 *   'f1'：下方音 f1 滑桿放開（或打字）之後。
 *   'listen'：按「▶ 播放」。
 *   'sweep'：「掃過一個八度」從頭到尾跑完（中途被打斷不送）。資料多一個 complete: true。
 *     以上的資料 = ConsonanceCore.analyze 的結果 { mode（'pure' | 'harmonic' | 'stretched'）, n, p, s, odd, f1, r, cents, f2, df（頻率差）,
 *       cb（臨界頻帶 Hz）, cbRatio（Δf ÷ 臨界頻帶）, D, Dmax（曲線最大值）, Dpeak（純音最大值）, dfPeak（純音最刺耳的 Δf）,
 *       valleys（曲線所有谷底的音分）, count12（1 到 2 之間的谷數）, valley（最近的谷 { cents, r, d, p, q, err, named }）,
 *       atValley（離最近的谷 3 音分以內）, beat（最刺耳那對泛音的拍頻）, pair, iv, tkey（音色代號）, key（音色＋下方音） }
 *     再加上 rsrc（r 最後是怎麼來的：'slider' 拖曳／打字／方向鍵，'button' 音程按鈕，'sweep'，'default'，'share'）與 src。
 *   'chord'：三音和弦（改最高音的頻率比 r2、按「▶ 播放和弦」，或動過和弦之後再改 r、音色、下方音）。
 *     資料 = ConsonanceCore.analyzeChord 的結果 { mode, n, p, s, odd, f1, r1, r2, c1, c2（音分）, D3, atBasin（在盆地底）, basin { c1, c2, d, converged }, tkey, key }＋src（'play' = 按了播放和弦）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const ct = function (x) { return 1200 * Math.log2(x); };
  const P5 = ct(3 / 2), P4 = ct(4 / 3), M3 = ct(5 / 4), m3 = ct(6 / 5), M6 = ct(5 / 3), H7 = ct(7 / 4);
  const isR = function (ev) { return ev.type === 'ratio' || ev.type === 'listen'; };
  const harm = function (d) { return d.mode === 'harmonic'; };
  const hasValley = function (d, c, tol) { return (d.valleys || []).some(function (v) { return Math.abs(v - c) <= tol; }); };
  /** 和弦停在 (c1, c2) 這個盆地底（兩個上方音對調也算） */
  const basinAt = function (d, c1, c2) {
    if (!d.atBasin || !d.basin) return false;
    const b = d.basin;
    return (near(b.c1, c1, 1.5) && near(b.c2, c2, 1.5)) || (near(b.c1, c2, 1.5) && near(b.c2, c1, 1.5));
  };
  /** 最接近 r 的簡單整數比（分母 ≤ 10）差幾音分 */
  const simpleErr = function (r) {
    let best = Infinity;
    for (let q = 1; q <= 10; q++) { const p = Math.round(r * q); if (p >= q) best = Math.min(best, Math.abs(ct(r) - ct(p / q))); }
    return best;
  };

  LabMission.register('consonance', [
    {
      id: 'consonance-1', level: 1,
      title: { zh: '聽一個八度', en: 'Hear an octave' },
      desc: { zh: '按「八度」，再按「▶ 播放」：兩個音頻率比 2:1，聽起來幾乎融成一個音。', en: 'Press “Octave”, then “▶ Play”: the two notes are in the ratio 2 : 1 and almost melt into one.' },
      check: function (ev) { return ev.type === 'listen' && near(ev.data.cents, 1200, 5); }
    },
    {
      id: 'consonance-2', level: 2,
      title: { zh: '從同度掃到八度', en: 'Sweep from unison to octave' },
      desc: { zh: '按「掃過一個八度」，讓頻率比從 1 一路滑到 2（中途不要動滑桿），邊聽邊看游標經過哪些谷底。', en: 'Press “Sweep one octave” and let the ratio glide all the way from 1 to 2 (leave the sliders alone), listening as the cursor passes the valleys.' },
      check: function (ev) { return ev.type === 'sweep' && ev.data.complete === true; }
    },
    {
      id: 'consonance-3', level: 3,
      title: { zh: '五度的谷底', en: 'The bottom of the fifth' },
      desc: { zh: '用「泛音」音色，拖曳「頻率比 r」滑桿（或直接拖曲線上的游標），停在 3:2 那個谷的谷底（3 音分以內）。', en: 'With “Harmonics”, drag the “Frequency ratio r” slider (or the cursor on the curve) and stop at the bottom of the 3 : 2 valley (within 3 cents).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'ratio' && harm(d) && d.rsrc === 'slider' && d.atValley && d.valley && near(d.valley.cents, P5, 1) && near(d.cents, P5, 3);
      }
    },
    {
      id: 'consonance-4', level: 3,
      title: { zh: '平均律的三度比較粗糙', en: 'The tempered third is rougher' },
      desc: { zh: '用「泛音」（泛音數 5 以上），選「純律」按「大三度」、按「▶ 播放」；再選「平均律」按「大三度」、按「▶ 播放」，比較兩次的不協和度。', en: 'With “Harmonics” (5 partials or more), choose “Just”, press “Major 3rd” and “▶ Play”; then choose “Equal temperament”, press “Major 3rd” and “▶ Play” again, and compare the dissonance.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'listen' || !harm(d) || d.odd || d.n < 5) return false;
        mem.ju = mem.ju || {}; mem.et = mem.et || {};
        if (near(d.cents, M3, 0.5)) mem.ju[d.key] = d.D;
        if (near(d.cents, 400, 0.5)) mem.et[d.key] = d.D;
        return mem.ju[d.key] != null && mem.et[d.key] != null && mem.et[d.key] > mem.ju[d.key];
      }
    },
    {
      id: 'consonance-5', level: 4,
      title: { zh: '純音最刺耳的距離', en: 'The roughest gap for pure tones' },
      desc: { zh: '換成「純音」，移動「頻率比 r」，找到不協和度最大的位置：頻率差 Δf 和讀數裡「純音最刺耳的 Δf」相差 2% 以內。', en: 'Switch to “Pure tone” and move the “Frequency ratio r” to the point of greatest dissonance: the difference Δf within 2% of the reading “Pure tones: roughest Δf”.' },
      check: function (ev) { const d = ev.data; return ev.type === 'ratio' && d.mode === 'pure' && near(d.df, d.dfPeak, 0.02 * d.dfPeak); }
    },
    {
      id: 'consonance-6', level: 4,
      title: { zh: '泛音越多，谷越多', en: 'More partials, more valleys' },
      desc: { zh: '用「泛音」（不勾奇次），先把「泛音數 n」調到 2，再調到 8 以上，比較 1 到 2 之間的谷多了幾個（要多 5 個以上）。', en: 'With “Harmonics” (odd partials unticked), set “Number of partials n” to 2, then to 8 or more, and compare the number of valleys from 1 to 2 (at least 5 more).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'timbre' || !harm(d) || d.odd) return false;
        const k = d.p.toFixed(2) + '@' + d.f1.toFixed(2);
        mem.lo = mem.lo || {}; mem.hi = mem.hi || {};
        if (d.n === 2) mem.lo[k] = d.count12;
        if (d.n >= 8) mem.hi[k] = Math.max(mem.hi[k] || 0, d.count12);
        return mem.lo[k] != null && mem.hi[k] != null && mem.hi[k] - mem.lo[k] >= 5;
      }
    },
    {
      id: 'consonance-7', level: 5,
      title: { zh: '一個臨界頻帶', en: 'One critical band' },
      desc: { zh: '用「純音」，調「頻率比 r」，讓兩個音的頻率差剛好是一個臨界頻帶（讀數「臨界頻帶」後面的 Δf ÷ CB 在 0.97 到 1.03 之間）：粗糙感幾乎消失了。', en: 'With “Pure tone”, set the “Frequency ratio r” so that the two notes are exactly one critical band apart (the Δf ÷ CB after “Critical band” between 0.97 and 1.03): the roughness is almost gone.' },
      check: function (ev) { const d = ev.data; return ev.type === 'ratio' && d.mode === 'pure' && near(d.cbRatio, 1, 0.03); }
    },
    {
      id: 'consonance-8', level: 6,
      title: { zh: '數一數谷底', en: 'Count the valleys' },
      desc: { zh: '用「泛音」、「泛音數 n」= 6（不勾奇次），拖曳「頻率比 r」，在 6:5、5:4、4:3、3:2、5:3、2:1 每一個谷底都停一次（各 3 音分以內，不用音程按鈕）。', en: 'With “Harmonics” and “Number of partials n” = 6 (odd unticked), drag the “Frequency ratio r” and stop once at the bottom of each of the valleys 6 : 5, 5 : 4, 4 : 3, 3 : 2, 5 : 3 and 2 : 1 (within 3 cents each, without the interval buttons).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'ratio' || !harm(d) || d.odd || d.n !== 6 || d.rsrc !== 'slider' || !d.atValley) return false;
        const want = [m3, M3, P4, P5, M6, 1200];
        mem[d.key] = mem[d.key] || {};
        want.forEach(function (c, i) { if (near(d.cents, c, 3) && near(d.valley.cents, c, 1)) mem[d.key][i] = true; });
        return want.every(function (c, i) { return mem[d.key][i]; });
      }
    },
    {
      id: 'consonance-9', level: 6,
      title: { zh: '鐘聲的八度', en: 'The octave of a bell' },
      desc: { zh: '換成「拉伸泛音」，把「拉伸係數 s」調離 1（至少差 0.05），再拖曳「頻率比 r」找到八度的谷搬家之後的新谷底（不在 2:1 上，而在 2 的 s 次方）。', en: 'Switch to “Stretched”, move the “Stretch exponent s” away from 1 (by at least 0.05), then drag the “Frequency ratio r” to the octave valley’s new home (not at 2 : 1 but at 2 to the power s).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'ratio' && d.mode === 'stretched' && Math.abs(d.s - 1) >= 0.05 && d.rsrc === 'slider' && d.atValley && d.valley &&
          near(d.valley.cents, 1200 * d.s, 1) && Math.abs(d.cents - 1200) >= 20;
      }
    },
    {
      id: 'consonance-10', level: 7,
      title: { zh: '大三和弦的盆地', en: 'The basin of the major triad' },
      desc: { zh: '用「泛音」（泛音數 5 以上），把「頻率比 r」放在 5:4、「最高音的頻率比」放在 3:2 附近，讓和弦停在盆地底，再按「▶ 播放和弦」。', en: 'With “Harmonics” (5 partials or more), put the “Frequency ratio r” at 5 : 4 and the “Top note’s frequency ratio” near 3 : 2 so the chord sits at the bottom of its basin, then press “▶ Play chord”.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'chord' && d.src === 'play' && harm(d) && d.n >= 5 && basinAt(d, M3, P5);
      }
    },
    {
      id: 'consonance-11', level: 8,
      title: { zh: '小三和弦比較淺', en: 'The minor triad is shallower' },
      desc: { zh: '不換音色與下方音，讓和弦先停在大三和弦（5:4、3:2）的盆地底、再停在小三和弦（6:5、3:2）的盆地底，各按一次「▶ 播放和弦」，比較兩個 D3。', en: 'Without changing the timbre or the lower note, put the chord at the bottom of the major-triad basin (5 : 4, 3 : 2), then of the minor-triad basin (6 : 5, 3 : 2), press “▶ Play chord” at each, and compare the two values of D3.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'chord' || d.src !== 'play' || !harm(d) || d.n < 5) return false;
        mem.M = mem.M || {}; mem.m = mem.m || {};
        if (basinAt(d, M3, P5)) mem.M[d.key] = true;
        if (basinAt(d, m3, P5)) mem.m[d.key] = true;
        return !!(mem.M[d.key] && mem.m[d.key]);
      }
    },
    {
      id: 'consonance-12', level: 10,
      title: { zh: '低音的三度變混濁', en: 'Low thirds turn muddy' },
      desc: { zh: '用「泛音」（不勾奇次），把「衰減指數 p」調大，再慢慢降低「下方音」：找出 5:4 的谷剛好消失的下方音（谷還在、谷已消失的兩個下方音相差不到 5 Hz）。', en: 'With “Harmonics” (odd unticked), raise the “Roll-off exponent p”, then slowly lower the “Lower note”: find where the 5 : 4 valley just disappears (one lower note with the valley and one without, less than 5 Hz apart).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'chord' || !d.valleys || !harm(d) || d.odd || d.n < 5) return false;
        const list = (mem[d.tkey] = mem[d.tkey] || { has: [], no: [] });
        const here = hasValley(d, M3, 3);
        (here ? list.has : list.no).push(d.f1);
        return list.has.some(function (a) { return list.no.some(function (b) { return Math.abs(a - b) <= 5; }); });
      }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'consonance-h1', level: 3, hidden: true,
      riddle: { zh: '讓這對聲音跟秒針一起呼吸。', en: 'Let the pair of sounds breathe with the second hand.' },
      check: function (ev) { const d = ev.data; return ev.type === 'listen' && d.pair && near(d.beat, 1, 0.02); }
    },
    {
      id: 'consonance-h2', level: 5, hidden: true,
      riddle: { zh: '沒有影子的人，連魔鬼也嚇不倒他。', en: 'One who casts no shadow is not afraid even of the devil.' },
      check: function (ev) { const d = ev.data; return ev.type === 'listen' && d.mode === 'pure' && near(d.cents, 600, 5) && d.D < 0.01 * d.Dpeak; }
    },
    {
      id: 'consonance-h3', level: 6, hidden: true,
      riddle: { zh: '地圖上沒有名字的山谷，一樣可以歇腳。', en: 'A valley with no name on the map is still a place to rest.' },
      check: function (ev) { const d = ev.data; return isR(ev) && harm(d) && d.atValley && d.valley && simpleErr(d.valley.r) > 15; }
    },
    {
      id: 'consonance-h4', level: 6, hidden: true,
      riddle: { zh: '只肯說單數的嗓子，讓最穩的那一步踩空了。', en: 'A voice that speaks only in odd numbers makes the steadiest step land on air.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isR(ev) || !harm(d)) return false;
        const k = d.n + '|' + d.p.toFixed(2) + '@' + d.f1.toFixed(2);
        if (!d.odd && d.rsrc === 'slider' && d.atValley && d.valley && near(d.valley.cents, P5, 1) && near(d.cents, P5, 3)) { mem[k] = true; return false; }
        return !!(d.odd && mem[k] && ev.type === 'listen' && near(d.cents, P5, 2) && !hasValley(d, P5, 2));
      }
    },
    {
      id: 'consonance-h5', level: 7, hidden: true,
      riddle: { zh: '第七個兄弟到齊之前，這個山谷不會出現；鋼琴的琴鍵上也找不到它。', en: 'Until the seventh brother arrives this valley does not exist, and no piano key can reach it.' },
      check: function (ev) {
        const d = ev.data;
        return isR(ev) && harm(d) && d.rsrc === 'slider' && d.atValley && d.valley && near(d.valley.cents, H7, 1) && near(d.cents, H7, 3);
      }
    },
    {
      id: 'consonance-h6', level: 7, hidden: true,
      riddle: { zh: '直角三角形的三條邊，也能唱成一個和弦。', en: 'The three sides of a right triangle can be sung as a chord.' },
      check: function (ev) { const d = ev.data; return ev.type === 'chord' && harm(d) && basinAt(d, P4, M6); }
    },
    {
      id: 'consonance-h7', level: 8, hidden: true,
      riddle: { zh: '不是鋼琴遷就耳朵，是聲音自己彎了一點腰。', en: 'The piano did not bend to the ear; the sound itself bowed a little.' },
      check: function (ev) {
        const d = ev.data;
        return isR(ev) && d.mode === 'stretched' && d.atValley && d.valley && near(d.valley.cents, 700, 0.5) && near(d.cents, 700, 2);
      }
    },
    {
      id: 'consonance-h8', level: 8, hidden: true,
      riddle: { zh: '換了一副嗓子，最親的兄弟反而比魔鬼還吵。', en: 'With a different voice, the closest brother is noisier than the devil himself.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'listen' || d.mode !== 'stretched') return false;
        const m = (mem[d.key] = mem[d.key] || {});
        if (near(d.cents, 1200, 2)) m.oct = d.D;
        if (near(d.cents, 600, 2)) m.tri = d.D;
        return m.oct != null && m.tri != null && m.oct > m.tri;
      }
    },
    {
      id: 'consonance-h9', level: 9, hidden: true,
      riddle: { zh: '在標準音的高度，最吵的鄰居就住在隔壁。', en: 'At concert pitch, the noisiest neighbour lives right next door.' },
      check: function (ev) {
        const d = ev.data;
        return isR(ev) && d.mode === 'pure' && near(d.cents, 100, 3) && near(d.df, d.dfPeak, 0.02 * d.dfPeak);
      }
    },
    {
      id: 'consonance-h10', level: 10, hidden: true,
      riddle: { zh: '最窄的山谷，要十個兄弟齊聲才看得見。', en: 'The narrowest valley appears only when ten brothers sing as one.' },
      check: function (ev) { const d = ev.data; return isR(ev) && harm(d) && d.atValley && d.valley && d.valley.cents < 190; }
    }
  ]);
})();
