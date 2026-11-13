/* missions/beats-tuning.js — 拍頻與調音的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/beats-tuning.js 發出，都在學生操作之後）：
 *   'tune'：改了設定之後（調音旋鈕的粗調或細調放開、打字輸入、按音程按鈕、目標、音色，或參考音放開）。
 *   'listen'：按「▶ 播放」。
 *   'count'：按「跟著拍按」，而且最後連續 5 下以上按得穩（每個間隔都在平均的 ±30% 以內）。
 *   資料 = BeatsTuningCore.analyze 的結果 { fRef（參考音 Hz）, offset（旋鈕偏差 Hz）, f2（待調音 Hz）, iv（'unison' | 'octave' | 'fifth' | 'fourth' | 'third'）,
 *     target（'just' | 'equal'）, mode（'pure' | 'rich'）, m, n（打拍的泛音：m·f1 對 n·f2）, hasPair（有沒有這一對泛音）,
 *     beatSigned（n·f2 − m·f1，正 = 寬）, beat（|beatSigned|，每秒幾拍；沒有那一對時是 null）, side, targetSigned, targetBeat（目標該有的拍數）,
 *     err（和目標拍頻差，含方向）, wrongErr（拍數一樣但方向相反時的差）, cents（相對目標的音分）, centsJust, centsEt, twin（另一對拍得一樣快的泛音或 null） }
 *   再加上 touched（學生轉過調音旋鈕）、playing（正在播放）、src；'count' 另有 tapped（數到的拍頻）、taps（穩定的下數）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  const heard = function (ev) { return ev.type === 'listen' || (ev.type === 'tune' && ev.data.playing === true); };
  const tuneOrHeard = function (ev) { return ev.type === 'tune' || ev.type === 'listen'; };
  const rich = function (d) { return d.mode === 'rich' && d.hasPair; };
  const has = function (d) { return d.hasPair && d.beat != null; };
  const key = function (d) { return d.fRef.toFixed(2); };
  const tapOk = function (d, rel) { return d.taps >= 5 && d.beat > 0 && Math.abs(d.tapped - d.beat) <= rel * d.beat; };

  LabMission.register('beats-tuning', [
    {
      id: 'beats-tuning-1', level: 1,
      title: { zh: '讓拍慢下來', en: 'Slow the beats down' },
      desc: { zh: '在「同度」，轉「調音旋鈕（粗調）」或「細調」，把拍頻調到每秒 1 拍以下。', en: 'With “Unison”, turn the “Tuning knob (coarse)” or “Fine” until the beat rate is 1 beat per second or less.' },
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && d.touched && d.iv === 'unison' && has(d) && d.beat <= 1; }
    },
    {
      id: 'beats-tuning-2', level: 2,
      title: { zh: '每秒剛好兩拍', en: 'Exactly two beats a second' },
      desc: { zh: '在「同度」把待調音調到比參考音高或低 2 Hz（例如 440 Hz 對 442 Hz），按「▶ 播放」聽每秒兩拍。', en: 'With “Unison”, set the tuned note 2 Hz above or below the reference (for example 440 Hz against 442 Hz) and press “▶ Play” to hear two beats a second.' },
      check: function (ev) { const d = ev.data; return heard(ev) && d.touched && d.iv === 'unison' && has(d) && near(d.beat, 2, 0.02); }
    },
    {
      id: 'beats-tuning-3', level: 2,
      title: { zh: '把拍調掉', en: 'Tune the beats away' },
      desc: { zh: '在「同度」轉調音旋鈕，把拍頻調到每秒 0.05 拍以下（20 秒以上才起伏一次）：兩個音一樣高了。', en: 'With “Unison”, turn the tuning knob until the beat rate is below 0.05 per second (one swell every 20 seconds or more): the two notes now match.' },
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && d.touched && d.iv === 'unison' && has(d) && d.beat < 0.05; }
    },
    {
      id: 'beats-tuning-4', level: 3,
      title: { zh: '用耳朵數拍', en: 'Count the beats by ear' },
      desc: { zh: '拍頻在每秒 0.5 到 6 拍之間時按「▶ 播放」，每聽到（或看到燈亮）一拍就按一下「跟著拍按」，連按 5 下以上，數到的拍頻和實際差 10% 以內。', en: 'With a beat rate between 0.5 and 6 per second, press “▶ Play” and press “Tap with the beats” once for every beat you hear (or every flash of the lamp), 5 times or more; your count must be within 10% of the true rate.' },
      check: function (ev) { const d = ev.data; return ev.type === 'count' && has(d) && d.beat >= 0.5 && d.beat <= 6 && tapOk(d, 0.1); }
    },
    {
      id: 'beats-tuning-5', level: 3,
      title: { zh: '用八度調音', en: 'Tune an octave' },
      desc: { zh: '選「八度」與「帶泛音」，轉調音旋鈕，把 2f1 與 f2 之間的拍調到每秒 0.1 拍以下。', en: 'Choose “Octave” and “With overtones”, then turn the tuning knob until the beat between 2f1 and f2 is below 0.1 per second.' },
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && d.touched && d.iv === 'octave' && rich(d) && d.beat < 0.1; }
    },
    {
      id: 'beats-tuning-6', level: 4,
      title: { zh: '五度：3f1 對 2f2', en: 'The fifth: 3f1 against 2f2' },
      desc: { zh: '選「五度」、「帶泛音」與目標「純律」，把參考音的第 3 泛音與待調音的第 2 泛音之間的拍調到每秒 0.1 拍以下。', en: 'Choose “Fifth”, “With overtones” and the target “Just”, then tune the beat between the 3rd overtone of the reference and the 2nd overtone of the tuned note below 0.1 per second.' },
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && d.touched && d.iv === 'fifth' && d.target === 'just' && rich(d) && d.beat < 0.1; }
    },
    {
      id: 'beats-tuning-7', level: 4,
      title: { zh: '純音的五度數不到拍', en: 'A pure-tone fifth has no beats to count' },
      desc: { zh: '選「五度」，旋鈕偏差至少 1 Hz：用「純音」按「▶ 播放」，再換「帶泛音」按「▶ 播放」（其他設定不變），比較哪一次聽得到拍。', en: 'Choose “Fifth” with the knob at least 1 Hz off: press “▶ Play” with “Pure tone”, then switch to “With overtones” and press “▶ Play” again (nothing else changed), and compare which one beats.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'listen' || d.iv !== 'fifth' || Math.abs(d.offset) < 1) return false;
        const k = key(d) + '|' + d.f2.toFixed(2);
        mem[d.mode] = mem[d.mode] || {};
        mem[d.mode][k] = true;
        return !!(mem.pure && mem.rich && mem.pure[k] && mem.rich[k]);
      }
    },
    {
      id: 'beats-tuning-8', level: 5,
      title: { zh: '吉他的泛音調音法', en: 'The guitar harmonics method' },
      desc: { zh: '吉他第 6 弦 E2 的第 5 格泛音（4 倍）對第 5 弦 A2 的第 7 格泛音（3 倍）：把「參考音」設成 E2（82.41 Hz），選「四度」與「帶泛音」，把 4f1 與 3f2 的拍調到每秒 0.1 拍以下。', en: 'The 5th-fret harmonic of the low E string (4 times E2) against the 7th-fret harmonic of the A string (3 times A2): set the “Reference note” to E2 (82.41 Hz), choose “Fourth” and “With overtones”, and tune the beat between 4f1 and 3f2 below 0.1 per second.' },
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && d.touched && d.iv === 'fourth' && rich(d) && near(d.fRef, 82.407, 0.05) && d.beat < 0.1; }
    },
    {
      id: 'beats-tuning-9', level: 6,
      title: { zh: '鋼琴調音師的五度', en: 'The piano tuner’s fifth' },
      desc: { zh: '「參考音」A3（220 Hz），選「五度」、「帶泛音」與目標「平均律」：平均律的五度不是調到 0 拍，而是調到讀數裡的目標拍數（每秒約 0.74 拍，偏窄），誤差 0.05 拍以內。', en: 'With the “Reference note” at A3 (220 Hz), choose “Fifth”, “With overtones” and the target “Equal temperament”: an equal-tempered fifth is not tuned to zero beats but to the target beat rate in the readings (about 0.74 per second, narrow), within 0.05 beats.' },
      check: function (ev) { const d = ev.data; return tuneOrHeard(ev) && d.touched && d.iv === 'fifth' && d.target === 'equal' && rich(d) && near(d.fRef, 220, 0.05) && d.err <= 0.05; }
    },
    {
      id: 'beats-tuning-10', level: 7,
      title: { zh: '平均律的四度偏寬', en: 'The tempered fourth is wide' },
      desc: { zh: '選「四度」、「帶泛音」與目標「平均律」（「參考音」隨你選），把拍頻調到讀數裡的目標拍數，而且要在偏高（寬）的那一側，誤差 0.05 拍以內。', en: 'Choose “Fourth”, “With overtones” and the target “Equal temperament” (any “Reference note”), and tune to the target beat rate in the readings on the high (wide) side, within 0.05 beats.' },
      check: function (ev) { const d = ev.data; return tuneOrHeard(ev) && d.touched && d.iv === 'fourth' && d.target === 'equal' && rich(d) && d.err <= 0.05; }
    },
    {
      id: 'beats-tuning-11', level: 8,
      title: { zh: '三度拍得比五度快', en: 'Thirds beat faster than fifths' },
      desc: { zh: '目標「平均律」、「帶泛音」，在同一個「參考音」上，把「五度」和「大三度」都調到各自的目標拍數（誤差 0.1 拍以內），比一比：大三度每秒拍幾次？五度呢？', en: 'With the target “Equal temperament” and “With overtones”, on the same “Reference note”, tune both the “Fifth” and the “Major third” to their own target beat rates (within 0.1 beats) and compare how fast each one beats.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!tuneOrHeard(ev) || !d.touched || d.target !== 'equal' || !rich(d) || !(d.err <= 0.1)) return false;
        if (d.iv !== 'fifth' && d.iv !== 'third') return false;
        const m = (mem[key(d)] = mem[key(d)] || {});
        m[d.iv] = d.beat;
        return m.fifth != null && m.third != null && m.third > m.fifth;
      }
    },
    {
      id: 'beats-tuning-12', level: 10,
      title: { zh: '慢拍要有耐心', en: 'Slow beats need patience' },
      desc: { zh: '把平均律的五度調到目標拍數（誤差 0.05 拍以內），按「▶ 播放」，用「跟著拍按」數這些很慢的拍，數到的拍頻和實際差 8% 以內。', en: 'Tune an equal-tempered fifth to its target beat rate (within 0.05 beats), press “▶ Play” and count those slow beats with “Tap with the beats”; your count must be within 8% of the true rate.' },
      check: function (ev) { const d = ev.data; return ev.type === 'count' && d.iv === 'fifth' && d.target === 'equal' && rich(d) && d.err <= 0.05 && tapOk(d, 0.08); }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'beats-tuning-h1', level: 3, hidden: true,
      riddle: { zh: '和胸口裡那面小鼓，踩同一個步伐。', en: 'Keep step with the little drum inside your chest.' },
      check: function (ev) { const d = ev.data; return heard(ev) && d.touched && has(d) && near(d.beat, 1, 0.01); }
    },
    {
      id: 'beats-tuning-h2', level: 4, hidden: true,
      riddle: { zh: '快到數不清的起伏，摸起來就像砂紙。', en: 'Swells too quick to count feel like sandpaper.' },
      check: function (ev) { const d = ev.data; return heard(ev) && d.touched && d.mode === 'pure' && d.iv === 'unison' && has(d) && d.beat >= 20; }
    },
    {
      id: 'beats-tuning-h3', level: 5, hidden: true,
      riddle: { zh: '耳朵分不出的那一小步，要等好幾秒才會自己招認。', en: 'A step too small for the ear confesses itself only after a few long seconds.' },
      check: function (ev) { const d = ev.data; return heard(ev) && d.touched && d.iv === 'unison' && has(d) && near(Math.abs(d.cents), 1, 0.05); }
    },
    {
      id: 'beats-tuning-h4', level: 5, hidden: true,
      riddle: { zh: '在人人都讓一點的國度裡，只有一個約定一步也不退。', en: 'In a land where everyone gives a little, one promise never gives at all.' },
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && d.touched && d.iv === 'octave' && d.target === 'equal' && rich(d) && d.beat < 0.05; }
    },
    {
      id: 'beats-tuning-h5', level: 6, hidden: true,
      riddle: { zh: '找到最安靜的那一點，指針卻搖頭說還差一大截。', en: 'You found the quietest spot, yet the needle shakes its head: still a long way off.' },
      check: function (ev) { const d = ev.data; return ev.type === 'tune' && d.touched && d.iv === 'third' && d.target === 'equal' && rich(d) && d.beat < 0.05; }
    },
    {
      id: 'beats-tuning-h6', level: 7, hidden: true,
      riddle: { zh: '兩條路都數到同一個數字，地圖上卻只有一條通往目的地。', en: 'Both roads count to the same number, but only one of them reaches the town on the map.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!heard(ev) || !d.touched || d.target !== 'equal' || !rich(d) || ['fifth', 'fourth', 'third'].indexOf(d.iv) < 0) return false;
        const m = (mem[key(d) + '|' + d.iv] = mem[key(d) + '|' + d.iv] || {});
        if (d.err <= 0.05) m.right = true;
        if (d.wrongErr <= 0.05 && d.err > 0.1) m.wrong = true;
        return !!(m.right && m.wrong);
      }
    },
    {
      id: 'beats-tuning-h7', level: 7, hidden: true,
      riddle: { zh: '一整排音叉靠著鄰居之間的爭吵，量出了大家今天還在用的那個音。', en: 'A row of tuning forks, by counting their neighbours’ quarrels, measured the note we still use today.' },
      check: function (ev) { const d = ev.data; return ev.type === 'count' && d.iv === 'unison' && has(d) && near(d.fRef, 440, 0.05) && near(d.beat, 4, 0.02) && tapOk(d, 0.05); }
    },
    {
      id: 'beats-tuning-h8', level: 8, hidden: true,
      riddle: { zh: '同一種爭吵搬到樓上，就吵得快了一倍。', en: 'Move the same quarrel one floor up and it runs twice as fast.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!tuneOrHeard(ev) || !d.touched || d.iv !== 'third' || d.target !== 'equal' || !rich(d) || !(d.err <= 0.05)) return false;
        mem.refs = mem.refs || [];
        if (mem.refs.indexOf(d.fRef) < 0) mem.refs.push(d.fRef);
        return mem.refs.some(function (x) { return Math.abs(d.fRef / x - 2) <= 0.002 || Math.abs(x / d.fRef - 2) <= 0.002; });
      }
    },
    {
      id: 'beats-tuning-h9', level: 9, hidden: true,
      riddle: { zh: '站在兩對吵架的兄弟正中間，兩邊吵得一樣快。', en: 'Stand exactly between two quarrelling pairs of brothers, and both quarrel at the same speed.' },
      check: function (ev) { const d = ev.data; return tuneOrHeard(ev) && d.touched && rich(d) && !!d.twin; }
    },
    {
      id: 'beats-tuning-h10', level: 10, hidden: true,
      riddle: { zh: '一個往上爬、一個往下跳，共用同一塊踏板，就吵出同一個節奏。', en: 'One climbs, one leaps, but sharing a single stepping stone they quarrel to the same rhythm.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!tuneOrHeard(ev) || !d.touched || d.target !== 'equal' || !rich(d) || !(d.err <= 0.03)) return false;
        if (d.iv !== 'fourth' && d.iv !== 'fifth') return false;
        const list = (mem[d.iv] = mem[d.iv] || []);
        if (list.indexOf(d.fRef) < 0) list.push(d.fRef);
        const P4 = Math.pow(2, 5 / 12);
        return (mem.fourth || []).some(function (x) { return (mem.fifth || []).some(function (y) { return Math.abs(y / x / P4 - 1) <= 0.003; }); });
      }
    }
  ]);
})();
