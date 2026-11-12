/* missions/chords.js — 和弦的頻率比的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/chords.js 發出，都在使用者操作之後；分享連結還原時不發）：
 *   'play'：按「▶ 播放和弦」（mode 'block'）、「分解和弦」（mode 'arp'），或和弦正在持續發聲時改了設定（mode 'live'）。
 *     資料 = ChordsCore.payload(分析)：{ type, root（MIDI）, tuning（'just' | 'equal'）, inv, on, n, count, full, bassRole, roles, freqs, midis,
 *       ints（純律的最簡整數比；平均律為 null）, intsJ, T、TJ（秒）, fv、fvJ（虛擬基頻 Hz）, perRoot、perRootJ（T 是根音週期的幾倍）,
 *       fullInts, fullT, drift（平均律在純律週期那一刻錯開幾度）, nearK, nearDeg, gaps（相鄰音的音分）, wrap, maxDev（平均律 − 純律，音分）, maxDevRole, mode }
 *   'grow'：3D 按「讓曲線長出來」。資料同上，另加 { span（ms）, loops（畫了幾個純律週期）, closed（曲線是否閉合） }
 *   'chord'：改了設定（沒有在發聲時）。資料同 'play'（沒有 mode）。
 *   'prog'／'progDone'：開始播放／播完和弦進行。ChordsCore.progPayload：{ prog, mode（'equal' | 'just' | 'adaptive'）, tonic, n, drift, chords: [{ roman, q, pure, tri, commonPrev, commonNext, rootCents }] }
 *   'progPick'：點和弦進行清單裡的一個和弦。{ prog, mode, tonic, idx, roman, q, pure, tri, commonPrev, commonNext, rootCents, drift }
 *   'view3d'：3D 視角按鈕。{ face }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const cents = function (r) { return 1200 * Math.log(r) / Math.LN2; };
  const isPlay = function (ev) { return ev.type === 'play'; };
  const same = function (a, b) { return a && b && a.length === b.length && a.every(function (x, i) { return x === b[i]; }); };
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  /** 原位、全部音都開、純律 */
  const pureFull = function (d) { return d.tuning === 'just' && d.inv === 0 && d.full; };
  /** 只關掉某幾個音：on 剛好等於 pattern（只比前 n 個） */
  const onIs = function (d, pat) { return d.on && pat.every(function (v, i) { return d.on[i] === v; }) && d.n === pat.length; };
  /** 記住上一次（或上幾次）播放，給「先聽 A 再聽 B」的任務用 */
  const remember = function (mem, d, keep) { mem.h = (mem.h || []).concat([d]).slice(-(keep || 2)); return mem.h; };
  const NARROW = cents(250 / 216);   // 純律減七和弦回到八度時那一級：253.08 音分
  const A1 = 55;                     // 55 Hz = A1

  LabMission.register('chords', [
    {
      id: 'chords-1', level: 1,
      title: { zh: '大三和弦是 4 : 5 : 6', en: 'The major triad is 4 : 5 : 6' },
      desc: { zh: '選「大三」、「純律」和「原位」，按「▶ 播放和弦」，看三個音剛好落在泛音列的第 4、5、6 根。', en: 'Choose “Major”, “Just intonation” and “Root position”, press “▶ Play chord”, and see the three notes land on rungs 4, 5 and 6 of the harmonic series.' },
      check: function (ev) { const d = ev.data; return isPlay(ev) && d.type === 'major' && pureFull(d) && same(d.ints, [4, 5, 6]); }
    },
    {
      id: 'chords-2', level: 2,
      title: { zh: '小三和弦的比', en: 'The ratio of a minor triad' },
      desc: { zh: '選「小三」和「純律」，三個音都開，按「▶ 播放和弦」：三個音落在泛音列的第 10、12、15 根。', en: 'Choose “Minor” and “Just intonation” with all three notes on and press “▶ Play chord”: the notes sit on rungs 10, 12 and 15 of the harmonic series.' },
      check: function (ev) { const d = ev.data; return isPlay(ev) && d.type === 'minor' && pureFull(d) && same(d.ints, [10, 12, 15]); }
    },
    {
      id: 'chords-3', level: 3,
      title: { zh: '第一轉位的最低音', en: 'The bass of the first inversion' },
      desc: { zh: '選一個三和弦和「第一轉位」，三個音都開，按「▶ 播放和弦」，看鍵盤上最低的音換成了哪一個和弦音。', en: 'Pick a triad and “1st inversion” with all three notes on, press “▶ Play chord”, and see which chord note is now the lowest on the keyboard.' },
      check: function (ev) { const d = ev.data; return isPlay(ev) && d.n === 3 && d.full && d.inv === 1 && d.bassRole === '3'; }
    },
    {
      id: 'chords-4', level: 3,
      title: { zh: '泛音列的第 4 到第 7 根', en: 'Rungs 4 to 7 of the harmonic series' },
      desc: { zh: '選「自然七度」和「純律」，四個音都開，按「▶ 播放和弦」，讓四個音對到泛音列的第 4、5、6、7 根。', en: 'Choose “Harmonic 7th” and “Just intonation” with all four notes on, then press “▶ Play chord” so the four notes sit on rungs 4, 5, 6 and 7 of the harmonic series.' },
      check: function (ev) { const d = ev.data; return isPlay(ev) && d.type === 'nat7' && pureFull(d) && same(d.ints, [4, 5, 6, 7]); }
    },
    {
      id: 'chords-5', level: 4,
      title: { zh: '大三和小三，誰比較快重複？', en: 'Major or minor: which repeats sooner?' },
      desc: { zh: '用「純律」和「原位」、三個音都開，在同一個根音先後播放「大三」和「小三」，比較兩者的週期 T：小三和弦要等 2.5 倍久才重複一次。', en: 'With “Just intonation” and “Root position” and all three notes on, play “Major” and “Minor” on the same root and compare their periods T: the minor triad takes 2.5 times as long to repeat.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPlay(ev) || !pureFull(d) || (d.type !== 'major' && d.type !== 'minor')) return false;
        mem.r = mem.r || {};
        const k = d.root, s = (mem.r[k] = mem.r[k] || {});
        s[d.type] = d.T;
        return s.major > 0 && s.minor > 0 && near(s.minor / s.major, 2.5, 1e-4);
      }
    },
    {
      id: 'chords-6', level: 4,
      title: { zh: '前後都有兩個共同音', en: 'Two shared notes on both sides' },
      desc: { zh: '選「I–vi–IV–V」，在和弦清單裡點那個「和前一個、也和後一個和弦都有兩個共同音」的和弦來聽。', en: 'Choose “I–vi–IV–V” and, in the chord list, tap the chord that shares two notes with the chord before it and two with the chord after it.' },
      check: function (ev) { const d = ev.data; return ev.type === 'progPick' && d.prog === 'I-vi-IV-V' && d.commonPrev === 2 && d.commonNext === 2; }
    },
    {
      id: 'chords-7', level: 5,
      title: { zh: '理髮店的七和弦', en: 'The barbershop seventh' },
      desc: { zh: '在同一個根音，用「十二平均律」播放「屬七」（四個音都開、原位），再用「純律」播放「自然七度」：七音低了約 31 音分，四個音變成整齊的 4 : 5 : 6 : 7。', en: 'On one root, play “Dominant 7th” in “Equal temperament” (all four notes, root position), then “Harmonic 7th” in “Just intonation”: the seventh drops by about 31 cents and the four notes become a tidy 4 : 5 : 6 : 7.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPlay(ev) || d.inv !== 0 || !d.full) return false;
        mem.r = mem.r || {};
        const s = (mem.r[d.root] = mem.r[d.root] || {});
        if (d.type === 'dom7' && d.tuning === 'equal') s.dom = true;
        if (d.type === 'nat7' && d.tuning === 'just') s.nat = true;
        return !!(s.dom && s.nat);
      }
    },
    {
      id: 'chords-8', level: 5,
      title: { zh: '固定音階裡發酸的和弦', en: 'The sour chord of a fixed scale' },
      desc: { zh: '選「I–vi–ii–V–I」和「純律（固定音階）」，在和弦清單裡找出唯一不是純律比例（標 ✗）的和弦，點它來聽。', en: 'Choose “I–vi–ii–V–I” and “Just (fixed scale)”, find the one chord in the list that is not in pure ratios (marked ✗), and tap it to hear it.' },
      check: function (ev) { const d = ev.data; return ev.type === 'progPick' && d.mode === 'just' && d.pure === false; }
    },
    {
      id: 'chords-9', level: 6,
      title: { zh: '平均律最走音的和弦音', en: 'The most out-of-tune chord note' },
      desc: { zh: '用「十二平均律」，從音的表格找一個比純律偏了超過 30 音分的和弦音，把其他音都關掉、只留下它，再按「▶ 播放和弦」。', en: 'In “Equal temperament”, use the note table to find a chord note that is more than 30 cents away from just intonation, switch every other note off so only it remains, and press “▶ Play chord”.' },
      check: function (ev) { const d = ev.data; return isPlay(ev) && d.tuning === 'equal' && d.count === 1 && Math.abs(d.maxDev) > 30; }
    },
    {
      id: 'chords-10', level: 7,
      title: { zh: '週期最短的三和弦', en: 'The triad with the shortest period' },
      desc: { zh: '用「純律」播放至少三種不同的三和弦（三個音都開），再找出一個三和弦的排法，讓週期 T 只有根音週期的 2 倍，播放它。', en: 'In “Just intonation”, play at least three different triads (all three notes on), then find a voicing of a triad whose period T is only twice the period of its root, and play it.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPlay(ev) || d.tuning !== 'just' || d.n !== 3 || !d.full) return false;
        mem.t = mem.t || {};
        mem.t[d.type] = true;
        return Object.keys(mem.t).length >= 3 && d.perRoot != null && d.perRoot <= 2 + 1e-6;
      }
    },
    {
      id: 'chords-11', level: 8,
      title: { zh: '三個和弦，同一個隱形的低音', en: 'Three chords, one invisible bass' },
      desc: { zh: '用「純律」找出三種不同的和弦（音全開），它們的虛擬基頻都是 55 Hz（A1），一一播放。', en: 'In “Just intonation”, find three different kinds of chord (all notes on) whose virtual fundamental is 55 Hz (A1), and play each of them.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPlay(ev) || d.tuning !== 'just' || !d.full || !(d.fv > 0) || Math.abs(cents(d.fv / A1)) > 3) return false;
        mem.t = mem.t || {};
        mem.t[d.type] = true;
        return Object.keys(mem.t).length >= 3;
      }
    },
    {
      id: 'chords-12', level: 9,
      title: { zh: '平均律裡最接近閉合的結', en: 'The nearly closed knot of equal temperament' },
      desc: { zh: '切到「3D 曲線」，用「十二平均律」找出一個三和弦（三個音都開），它的曲線每走完一個純律週期只錯開不到 4°，再按「讓曲線長出來」。', en: 'Switch to “3D curve” and, in “Equal temperament”, find a triad (all three notes on) whose curve misses by less than 4° after one just-intonation period, then press “Grow the curve”.' },
      check: function (ev) { const d = ev.data; return ev.type === 'grow' && d.tuning === 'equal' && d.n === 3 && d.full && d.drift != null && Math.abs(d.drift) < 4; }
    },

    // ---------- 隱藏任務 ----------
    {
      // 缺基頻：拿掉根音，剩下的音仍然每隔同一個 T 重複（大三 5:6、掛四 8:9、大七 10:12:15、屬七 25:30:36、自然七度 5:6:7）
      id: 'chords-h1', level: 3, hidden: true,
      riddle: { zh: '國王缺席，大家仍踩著他的步伐前進。', en: 'The king is absent, yet everyone still marches to his step.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPlay(ev)) return false;
        const h = remember(mem, d), p = h.length > 1 ? h[h.length - 2] : null;
        if (!p || d.tuning !== 'just' || p.tuning !== 'just' || !p.full || d.on[0] !== false || d.count !== d.n - 1) return false;
        return p.type === d.type && p.root === d.root && p.inv === d.inv && near(d.T, p.T, 1e-6);
      }
    },
    {
      // 加上第四個音，週期不變：大三 → 自然七度（4:5:6 → 4:5:6:7）、小三 → 小七（10:12:15 → 10:12:15:18）
      id: 'chords-h2', level: 4, hidden: true,
      riddle: { zh: '第四位客人入座，餐桌卻不必加長。', en: 'A fourth guest sits down, and the table needs no extra leaf.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPlay(ev)) return false;
        const h = remember(mem, d), p = h.length > 1 ? h[h.length - 2] : null;
        if (!p || !pureFull(d) || !pureFull(p) || p.n !== 3 || d.n !== 4 || p.root !== d.root) return false;
        return same(p.midis, d.midis.slice(0, 3)) && near(d.T, p.T, 1e-6);
      }
    },
    {
      // 連續整數 5:6:7:8：自然七度和弦的第一轉位（泛音列第 5–8 根）
      id: 'chords-h3', level: 6, hidden: true,
      riddle: { zh: '門牌連號的四戶人家，換另一戶住進一樓。', en: 'Four houses with consecutive numbers — and a different one moves to the ground floor.' },
      check: function (ev) {
        const d = ev.data;
        if (!isPlay(ev) || d.tuning !== 'just' || d.count !== 4 || !d.ints) return false;
        return d.ints[0] >= 5 && d.ints.every(function (x, i) { return i === 0 || x === d.ints[i - 1] + 1; });
      }
    },
    {
      // 大三、小三只差三音：拿掉三音後兩者都是純五度 2:3，一模一樣
      id: 'chords-h4', level: 5, hidden: true,
      riddle: { zh: '請走決定悲喜的那一位，剩下的兩人就分不出是誰家的了。', en: 'Send away the one who decides between joy and sorrow, and the two who remain could belong to either house.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPlay(ev)) return false;
        const h = remember(mem, d), p = h.length > 1 ? h[h.length - 2] : null;
        const ok = function (x) { return x.tuning === 'just' && (x.type === 'major' || x.type === 'minor') && onIs(x, [true, false, true]); };
        return !!(p && ok(d) && ok(p) && p.type !== d.type && p.root === d.root && p.inv === d.inv && same(d.ints, [2, 3]));
      }
    },
    {
      // 純律減七 125:150:180:216：在 C3 的週期 125/130.81 Hz ≈ 0.956 秒（C♯3 0.902 秒），接近一次心跳
      id: 'chords-h5', level: 6, hidden: true,
      riddle: { zh: '最焦躁的一群人，要等將近一次心跳才重新對齊。', en: 'The most restless group takes nearly a heartbeat to fall back into step.' },
      check: function (ev) { const d = ev.data; return isPlay(ev) && d.type === 'dim7' && pureFull(d) && d.T >= 0.9; }
    },
    {
      // 平均律的增三和弦把八度三等分：原位、第一、第二轉位的形狀完全一樣（每格 400 音分）；純律做不到
      id: 'chords-h6', level: 7, hidden: true,
      riddle: { zh: '三人輪流站到排頭，隊形分毫不差——只有在大家都肯各退一步的時候。', en: 'Three take turns at the front and the formation never changes — but only when everyone gives a little.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPlay(ev)) return false;
        const h = remember(mem, d, 3);
        if (h.length < 3) return false;
        const inv = {};
        const ok = h.every(function (x) { return x.type === 'aug' && x.tuning === 'equal' && x.full && x.root === d.root && (inv[x.inv] = true); });
        return ok && inv[0] && inv[1] && inv[2];
      }
    },
    {
      // 純律減七疊三個純小三度 6/5，回到八度那一級只剩 250/216（253.1 音分）；第一轉位分解時它是最後一級
      id: 'chords-h7', level: 8, hidden: true,
      riddle: { zh: '一路誠實地往上走，最後一步卻矮了一截。', en: 'An honest climb all the way up — until the last step comes up short.' },
      check: function (ev) {
        const d = ev.data;
        return isPlay(ev) && d.mode === 'arp' && d.type === 'dim7' && d.tuning === 'just' && d.full && d.gaps && d.gaps.length === 3 && near(d.gaps[2], NARROW, 0.5);
      }
    },
    {
      // 兩個都在 A4（440 Hz）以上的音，虛擬基頻卻低於 20 Hz、聽不見（例如 A4 減三只留根音與五音 25:36 → 17.6 Hz；減七根音與七音 125:216）
      id: 'chords-h8', level: 8, hidden: true,
      riddle: { zh: '兩個高個子並肩走，合起來的步伐卻低到聽不見。', en: 'Two tall walkers side by side, yet their shared stride is too low to hear.' },
      check: function (ev) {
        const d = ev.data;
        return isPlay(ev) && d.mode === 'block' && d.tuning === 'just' && d.count === 2 && Math.min.apply(null, d.midis) >= 69 && d.fv > 0 && d.fv < 20;
      }
    },
    {
      // 3D：小七去掉根音 = 大三 4:5:6；大七去掉根音 = 小三 10:12:15；屬七去掉根音 = 減三 25:30:36 → 同一個閉合的結
      id: 'chords-h9', level: 9, hidden: true,
      riddle: { zh: '兩個不同名字的和弦，打的卻是同一個結。', en: 'Two chords with different names tie the very same knot.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'grow' || d.tuning !== 'just' || !d.closed || d.count < 3 || !d.ints) return false;
        mem.k = mem.k || {};
        const key = d.ints.join(':'), list = (mem.k[key] = mem.k[key] || []);
        const me = { type: d.type, rootless: d.on[0] === false };
        if (!list.some(function (x) { return x.type === me.type && x.rootless === me.rootless; })) list.push(me);
        return list.some(function (a) { return list.some(function (b) { return a.type !== b.type && (a.rootless || b.rootless); }); });
      }
    },
    {
      // 共同音不動的純律 I–vi–ii–V–I：每個和弦都純，最後的 I 卻比開頭低一個同音差 81/80（−21.5 音分）
      id: 'chords-h10', level: 10, hidden: true,
      riddle: { zh: '每一步都完美無瑕，繞了一圈回到家，家卻沉下去了一點。', en: 'Every step flawless; you come all the way home — and home has sunk a little.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'progDone') {
          mem.heard = d.prog === 'I-vi-ii-V-I' && d.mode === 'adaptive' && near(d.drift, -cents(81 / 80), 0.05) ? d.tonic : null;
          mem.last = null;
          return false;
        }
        if (ev.type !== 'progPick') return false;
        if (mem.heard == null || d.prog !== 'I-vi-ii-V-I' || d.mode !== 'adaptive' || d.tonic !== mem.heard) { mem.last = null; return false; }
        const prev = mem.last;
        mem.last = d.idx;
        return (prev === 0 && d.idx === 4) || (prev === 4 && d.idx === 0);
      }
    }
  ]);
})();
