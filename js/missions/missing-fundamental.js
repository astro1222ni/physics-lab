/* missions/missing-fundamental.js — 缺基頻的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/missing-fundamental.js 發出，都在使用者操作之後；資料由 MissingCore.missionData 產生）：
 *   'state'：改了基頻、泛音開關、「移除最低 n 根」、濾波、截止頻率、平移之後。
 *   'ab'：按「A／B 比較」（資料是 B，也就是目前的聲音）。
 *   'play'：按「▶ 播放」。
 *   'record'：按「記錄這個聲音」。{ rows：[資料, …]（全部紀錄，最新的在最後） }
 * 資料：{ f0, delta, filter（'none' | 'speaker' | 'phone' | 'custom'）, cut（實際的高通截止 Hz）, low（移除最低 n 根）,
 *   on（開關打開的泛音次數）, enabled（真的送進喇叭的）, present（喇叭放得出來的，|H| ≥ 0.1）, freqs（present 的頻率 Hz）,
 *   gcd（freqs 的最大公因數 Hz）, period（1/gcd 秒）, pitch（自相關音高 Hz，沒有成分時 null）, pitchR, lowest（最低成分 Hz）,
 *   hasFund（基頻放得出來）, missing（聽到的音高沒有對應的成分）, deBoer（平移時 f0 + Δ/n） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const TOL = 0.005;   // 音高相同：±0.5 %（約 ±9 音分）
  const st = function (ev) { return ev.type === 'state' && ev.data && ev.data.present; };
  const is = function (p, f) { return p != null && f > 0 && Math.abs(p / f - 1) <= TOL; };
  const only = function (d, list) { return d.present.length === list.length && list.every(function (k, i) { return d.present[i] === k; }); };
  const cents = function (a, b) { return 1200 * Math.log2(a / b); };
  /** 任務的基本條件：沒有平移、至少 n 根、聽到的音高就是 f0 */
  const atF0 = function (d, n) { return d.delta === 0 && d.present.length >= n && is(d.pitch, d.f0); };
  const shared = function (a, b) { return a.freqs.some(function (f) { return b.freqs.some(function (g) { return Math.abs(f - g) < 0.5; }); }); };
  const pairs = function (ev, fn) {
    if (ev.type !== 'record' || !ev.data || !ev.data.rows) return false;
    const R = ev.data.rows.filter(function (r) { return r && r.present && r.present.length >= 2 && r.pitch; });
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (fn(R[i], R[j])) return true;
    return false;
  };

  LabMission.register('missing-fundamental', [
    {
      id: 'missing-fundamental-1', level: 1,
      title: { zh: '拿掉基頻', en: 'Take the fundamental away' },
      desc: { zh: '在泛音開關裡把第 1 根關掉，留下至少兩根：看波形的週期和「聽到的音高」有沒有改變。',
        en: 'Among the harmonic switches, turn number 1 off and keep at least two others. Does the period of the waveform, or the “Pitch heard”, change?' },
      check: function (ev) { const d = ev.data; return st(ev) && !d.hasFund && atF0(d, 2); }
    },
    {
      id: 'missing-fundamental-2', level: 2,
      title: { zh: '聽得出差別嗎', en: 'Can you hear the difference?' },
      desc: { zh: '拿掉基頻（至少留兩根），按「A／B 比較」：先播有基頻的完整音，再播拿掉基頻的聲音。音色變了，音高呢？',
        en: 'Take the fundamental away (keep at least two), then press “A/B compare”: first the complete tone with its fundamental, then the one without. The timbre changes — what about the pitch?' },
      check: function (ev) { const d = ev.data; return ev.type === 'ab' && d && d.present && !d.hasFund && atF0(d, 2); }
    },
    {
      id: 'missing-fundamental-3', level: 2,
      title: { zh: '手機彈貝斯', en: 'A bass on a phone' },
      desc: { zh: '選「手機小喇叭」，把基頻調到 110 Hz（貝斯的 A2 空弦）：喇叭放不出 110 Hz，耳朵卻仍然聽到 110 Hz。',
        en: 'Choose “Phone speaker” and set the fundamental to 110 Hz (a bass guitar’s open A2): the speaker cannot play 110 Hz, yet the ear still hears 110 Hz.' },
      check: function (ev) { const d = ev.data; return st(ev) && d.filter === 'speaker' && d.f0 === 110 && !d.hasFund && atF0(d, 2); }
    },
    {
      id: 'missing-fundamental-4', level: 3,
      title: { zh: '只留第 4、5、6 根', en: 'Only the 4th, 5th and 6th' },
      desc: { zh: '讓喇叭只放出第 4、5、6 根泛音（頻率比 4 : 5 : 6，像一個大三和弦）。它們的最大公因數是多少？聽到的又是哪個音？',
        en: 'Make the speaker play only harmonics 4, 5 and 6 (ratio 4 : 5 : 6, like a major chord). What is their greatest common divisor, and which pitch do you hear?' },
      check: function (ev) { const d = ev.data; return st(ev) && d.delta === 0 && only(d, [4, 5, 6]); }
    },
    {
      id: 'missing-fundamental-5', level: 3,
      title: { zh: '電話裡的男聲', en: 'A man’s voice on the phone' },
      desc: { zh: '選「電話」（只傳 300–3400 Hz），把基頻調到 150 Hz 以下，像男生說話的音高：基頻被電話切掉了，音高還在。',
        en: 'Choose “Telephone” (300–3400 Hz only) and set the fundamental below 150 Hz, like a man’s speaking voice: the phone cuts the fundamental off, but the pitch survives.' },
      check: function (ev) { const d = ev.data; return st(ev) && d.filter === 'phone' && d.f0 <= 150 && !d.hasFund && atF0(d, 2); }
    },
    {
      id: 'missing-fundamental-6', level: 4,
      title: { zh: '再拿掉幾根', en: 'Take more away' },
      desc: { zh: '把「移除最低 n 根」拉到 3 以上，喇叭仍放出至少 3 根，而且聽到的音高還是 f0。',
        en: 'Set “Remove the lowest n” to 3 or more while the speaker still plays at least 3 components and the pitch heard is still f0.' },
      check: function (ev) { const d = ev.data; return st(ev) && d.low >= 3 && atF0(d, 3); }
    },
    {
      id: 'missing-fundamental-7', level: 5,
      title: { zh: '最少只要兩根', en: 'Two are enough' },
      desc: { zh: '沒有基頻，喇叭只放出兩根泛音，聽到的音高仍然剛好是 f0。哪兩根可以？哪兩根不行？',
        en: 'No fundamental, only two harmonics from the speaker, and the pitch heard is still exactly f0. Which pairs work, and which do not?' },
      check: function (ev) { const d = ev.data; return st(ev) && d.present.length === 2 && !d.hasFund && atF0(d, 2); }
    },
    {
      id: 'missing-fundamental-8', level: 6,
      title: { zh: '跳了一個八度', en: 'An octave jump' },
      desc: { zh: '不平移，留至少 3 根，讓聽到的音高變成 2 f0（高一個八度）。缺的不只是基頻，而是……？',
        en: 'With no shift and at least 3 components, make the pitch heard 2 f0 (an octave up). What is missing is not just the fundamental, but…?' },
      check: function (ev) { const d = ev.data; return st(ev) && d.delta === 0 && d.present.length >= 3 && is(d.pitch, 2 * d.f0); }
    },
    {
      id: 'missing-fundamental-9', level: 6,
      title: { zh: '比喇叭低兩個八度', en: 'Two octaves below the speaker' },
      desc: { zh: '不平移、第 1 根開著，改用「自訂高通」把最低的幾根擋掉（至少留 3 根），再按「▶ 播放」：聽到的音高還是 f0，而喇叭放出的最低頻率比它高出兩個八度以上（超過 4 倍）。',
        en: 'With no shift and harmonic 1 switched on, use “Custom high-pass” to block the lowest few (keep at least 3), then press “▶ Play”. The pitch heard is still f0, while the lowest frequency from the speaker is more than two octaves above it (over 4 times).' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d && d.present && d.filter === 'custom' && d.enabled[0] === 1 && atF0(d, 3) && d.lowest > 4 * d.pitch * (1 + TOL); }
    },
    {
      id: 'missing-fundamental-10', level: 7,
      title: { zh: '兩個聲音，一個音高', en: 'Two sounds, one pitch' },
      desc: { zh: '按「記錄這個聲音」記下兩個聲音：兩者沒有任何一根相同的頻率（各至少兩根），聽到的音高卻一樣（±0.5 %）。',
        en: 'Use “Record this sound” to log two sounds that share no frequency at all (at least two components each) but give the same pitch (±0.5 %).' },
      check: function (ev) { return pairs(ev, function (a, b) { return is(a.pitch, b.pitch) && !shared(a, b); }); }
    },
    {
      id: 'missing-fundamental-11', level: 8,
      title: { zh: '位移實驗：音高往上', en: 'The shift experiment: pitch goes up' },
      desc: { zh: '進階：只用第 4 根以上的泛音（至少 3 根），不平移時按「記錄這個聲音」；泛音和 f0 都不動，只把「全部平移 Δ」往正的方向調，再記錄一次。間距一點都沒變，聽到的音高卻高了 4 Hz 以上。',
        en: 'Advanced: using only harmonics 4 and up (at least 3), press “Record this sound” with no shift; then keep the harmonics and f0, move only “Shift everything by Δ” to a positive value and record again. The spacing has not changed at all, yet the pitch heard rises by more than 4 Hz.' },
      check: function (ev) {
        return pairs(ev, function (a, b) {
          const z = a.delta === 0 ? a : b, s = z === a ? b : a;
          const ok = function (r) { return r.present.length >= 3 && r.present[0] >= 4 && r.missing; };
          return z.delta === 0 && s.delta > 0 && z.f0 === s.f0 && z.filter === s.filter && z.enabled.join() === s.enabled.join() &&
            ok(z) && ok(s) && is(z.pitch, z.f0) && s.pitch >= z.pitch + 4 && s.pitch < 1.5 * s.f0;
        });
      }
    },
    {
      id: 'missing-fundamental-12', level: 10,
      title: { zh: '剛好高半音', en: 'Exactly a semitone higher' },
      desc: { zh: '進階：不用第 1、2 根（喇叭放出的最低成分至少是第 3 根），至少 3 根，用「全部平移 Δ」讓聽到的音高比 f0 剛好高一個半音（100 音分 ±5）。先用 f0 + Δ/n 算一算再調。',
        en: 'Advanced: leave out harmonics 1 and 2 (the lowest component from the speaker must be harmonic 3 or higher) and keep at least 3. Use “Shift everything by Δ” to make the pitch heard exactly one semitone above f0 (100 cents ±5). Work it out with f0 + Δ/n before you turn the knob.' },
      check: function (ev) {
        const d = ev.data;
        // 殘餘音高只在高次泛音時才成立：第 1、2 根在的話，耳朵多半直接聽到最低的那一根
        if (!st(ev) || d.delta === 0 || d.present.length < 3 || d.present[0] < 3 || !d.pitch) return false;
        const c = cents(d.pitch, d.f0);
        return c >= 95 && c <= 105;
      }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'missing-fundamental-h1', level: 3, hidden: true,
      riddle: { zh: '只踩單數的台階，而且第一階不踩，照樣回得到一樓。', en: 'Step only on the odd stairs — and skip the first — and you still come home to the ground floor.' },
      check: function (ev) { const d = ev.data; return st(ev) && only(d, [3, 5, 7, 9]) && atF0(d, 4); }
    },
    {
      id: 'missing-fundamental-h2', level: 4, hidden: true,
      riddle: { zh: '篩子太細，只漏下一粒；魔術就不靈了。', en: 'The sieve is too fine: a single grain falls through, and the magic stops working.' },
      check: function (ev) {
        const d = ev.data;
        return st(ev) && d.filter !== 'none' && d.enabled.length >= 3 && d.present.length === 1 && d.pitch != null && Math.abs(d.pitch / d.freqs[0] - 1) <= 0.01;
      }
    },
    {
      id: 'missing-fundamental-h3', level: 5, hidden: true,
      riddle: { zh: '大家一起往旁邊挪了整整一個座位，報出來的名字卻一個字也沒變。', en: 'Everyone moves over by exactly one seat, yet the name they call out does not change by a single letter.' },
      check: function (ev) { const d = ev.data; return st(ev) && Math.abs(d.delta) === d.f0 && d.present.length >= 2 && is(d.pitch, d.f0); }
    },
    {
      id: 'missing-fundamental-h4', level: 5, hidden: true,
      riddle: { zh: '樓上只有兩根管子在響，教堂的地板卻震出一根更長、並不存在的管子。', en: 'Only two pipes sound in the loft, yet the church floor trembles with a longer pipe that is not there.' },
      check: function (ev) { const d = ev.data; return st(ev) && only(d, [2, 3]) && d.f0 <= 110 && atF0(d, 2); }
    },
    {
      id: 'missing-fundamental-h5', level: 6, hidden: true,
      riddle: { zh: '兩個人中間隔著一個空位，耳朵量到的卻不是他們之間的距離。', en: 'Two sit with an empty seat between them, yet what the ear measures is not the gap between them.' },
      check: function (ev) {
        const d = ev.data;
        return st(ev) && d.present.length === 2 && d.present[0] >= 3 && d.present[0] % 2 === 1 && d.present[1] - d.present[0] === 2 && atF0(d, 2);
      }
    },
    {
      id: 'missing-fundamental-h6', level: 7, hidden: true,
      riddle: { zh: '說明裡那三個不整齊的數字，三個都不在梯子的橫木上——親手把它們搭出來。', en: 'Those three untidy numbers in the notes, none of them on a rung of the ladder — build them with your own hands.' },
      check: function (ev) { const d = ev.data; return st(ev) && d.freqs.length === 3 && d.freqs[0] === 1030 && d.freqs[1] === 1230 && d.freqs[2] === 1430; }
    },
    {
      id: 'missing-fundamental-h7', level: 7, hidden: true,
      riddle: { zh: '只差一根頭髮的距離，波形就要等上一整秒才肯重複——耳朵卻完全沒發現。', en: 'A hair’s breadth of a nudge and the waveform waits a whole second before it repeats — and the ear never notices.' },
      check: function (ev) {
        const d = ev.data;
        return st(ev) && Math.abs(d.delta) === 1 && d.gcd > 0 && d.gcd < 20 && d.present.length >= 3 && d.present[0] >= 3 && d.pitch != null && Math.abs(d.pitch / d.f0 - 1) <= 0.001;
      }
    },
    {
      id: 'missing-fundamental-h8', level: 8, hidden: true,
      riddle: { zh: '在兩根橫木的正中間停下來，整支隊伍的步伐就悄悄慢了一半。', en: 'Stop exactly halfway between two rungs, and the whole march quietly slows to half its pace.' },
      check: function (ev) { const d = ev.data; return st(ev) && 2 * Math.abs(d.delta) === d.f0 && d.present.length >= 3; }
    },
    {
      id: 'missing-fundamental-h9', level: 9, hidden: true,
      riddle: { zh: '兩個不同的家，報出同一個門牌；而那個門牌，在兩個家裡都找不到。', en: 'Two different households give the same house number — a number found in neither house.' },
      check: function (ev) {
        return pairs(ev, function (a, b) { return Math.abs(a.f0 - b.f0) >= 50 && is(a.pitch, b.pitch) && a.missing && b.missing && !shared(a, b); });
      }
    },
    {
      id: 'missing-fundamental-h10', level: 10, hidden: true,
      riddle: { zh: '電話那頭只傳來高高的細語，你卻聽出了三層樓底下的低音。', en: 'Only a thin, high whisper comes down the line, yet you hear a bass three floors below.' },
      check: function (ev) { const d = ev.data; return st(ev) && d.filter === 'phone' && d.f0 <= 130 && atF0(d, 3) && d.lowest >= 8 * d.pitch * (1 - TOL); }
    }
  ]);
})();
