/* missions/loudness.js — 分貝、等響曲線與聽力保護的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/loudness.js 發出；只有學生操作時才發，載入時不發任何事件）：
 *   'point'：等響曲線上的點改變（頻率、聲壓級、響度級滑桿放開或打字輸入、常用頻率按鈕、「鎖定在等響曲線上」、在圖上拖曳放開、鍵盤方向鍵）。
 *     資料 = LoudCore.analyze 的全部欄位：f（Hz）、Lp（dB）、phon（響度級；太低時為 null）、sone、thr（這個頻率的聽閾 dB）、
 *       above（Lp − thr）、audible（是否在聽閾以上）、valid（是否在 ISO 226 有效範圍）、lp1k（在 1 kHz 一樣響的 dB）、aw、dBA、slope（phon／dB）
 *     再加上：locked（是否鎖定在等響曲線上）、target（鎖定的 phon，沒鎖定時為 null）、via（'f' | 'lp' | 'phon' | 'lock' | 'quick' | 'drag' | 'kbd'）、
 *       prev（改變以前的點 { f, Lp, phon, sone, locked, audible }）、dLp（Lp − prev.Lp）。
 *   'play'：按「▶ 播放」或「先 1 kHz 再這個頻率」（聽閾以下的點不播放、不發事件）。資料 = analyze 的全部欄位＋ locked、target、kind（'one' | 'cmp'）。
 *   'sum'：分貝相加改變（聲源 1、N、聲源 2、距離的滑桿放開或打字、「聲源 2」開關、力度記號按鈕）。
 *     資料 = LoudCore.mix 的全部欄位：L1、N、L2、on2、r、L1n（N 個聲源 1）、total1（1 m 處的合計）、totalR（距離 r 處）、
 *       inc（比最大的那一個多幾 dB）、incOne（比一個聲源 1 多幾 dB）、loudRatio；再加上 via（'l1' | 'n' | 'l2' | 'r' | 'on2' | 'dyn'）、
 *       prev（改變以前的 { L1, N, L2, on2, r, total1, totalR }）。
 *   'dose'：安全聆聽時間改變（聲級、時數的滑桿放開或打字、「用上面的合計」）。
 *     資料 = { L（dBA）, h（小時）, T（每天容許小時數）, dose（%）, via（'lv' | 'h' | 'copy'）, prev, from（'copy' 時的加法器狀態）}。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const LC = window.LoudCore;
  const near = function (a, b, tol) { return a != null && b != null && Math.abs(a - b) <= tol; };
  const rel = function (a, b, tol) { return a > 0 && Math.abs(a / b - 1) <= tol; };
  const isPt = function (ev) { return ev.type === 'point' && ev.data && ev.data.f > 0; };
  const isSum = function (ev) { return ev.type === 'sum' && ev.data && ev.data.N >= 1; };
  const isDose = function (ev) { return ev.type === 'dose' && ev.data && ev.data.L > 0; };
  /** 同一個頻率上、從 prev 到現在響度剛好加倍（±1%），而且 prev 已經在 40 phon 以上（sone 規則成立的地方） */
  const doubled = function (d) {
    const p = d.prev;
    return !!p && p.audible && p.phon >= 40 && d.audible && p.sone > 0 && Math.abs(d.sone / p.sone - 2) <= 0.02 && Math.abs(d.f - p.f) < 0.05;
  };

  LabMission.register('loudness', [
    {
      id: 'loudness-1', level: 1,
      title: { zh: 'phon 的定義', en: 'What a phon is' },
      desc: { zh: '把「頻率 f（Hz）」調到 1 kHz、「聲壓級 Lp（dB）」調到 60 dB：這一點的響度級是幾 phon？', en: 'Set “Frequency f (Hz)” to 1 kHz and “Sound pressure level Lp (dB)” to 60 dB: what is the loudness level of this point?' },
      check: function (ev) { const d = ev.data; return isPt(ev) && rel(d.f, 1000, 0.01) && near(d.Lp, 60, 0.5); }
    },
    {
      id: 'loudness-2', level: 2,
      title: { zh: '有聲音，卻聽不到', en: 'A sound you cannot hear' },
      desc: { zh: '在圖上找一個聲壓級 20 dB 以上、卻在聽閾以下（聽不到）的點。它在哪個頻率範圍？', en: 'Find a point on the chart that is 20 dB or more but below the threshold of hearing (inaudible). In which frequency range is it?' },
      check: function (ev) { const d = ev.data; return isPt(ev) && d.Lp >= 20 && !d.audible; }
    },
    {
      id: 'loudness-3', level: 2,
      title: { zh: '兩把小提琴', en: 'Two violins' },
      desc: { zh: '打開「聲源 2」，讓兩個聲源一樣大（「相同的聲源 1 有幾個 N」是 1）：合起來比一個多幾 dB？聽起來響幾倍？', en: 'Switch on “Source 2” and make the two sources equal (“Identical copies of source 1, N” is 1): how many decibels more than one, and how many times as loud?' },
      check: function (ev) { const d = ev.data; return isSum(ev) && d.on2 && d.N === 1 && near(d.L1, d.L2, 0.05); }
    },
    {
      id: 'loudness-4', level: 3,
      title: { zh: '練團室與 KTV', en: 'Band room and karaoke' },
      desc: { zh: '把「A 加權聲級（dBA）」調到 94 dBA（練團室、KTV 常見的音量）：每天容許聽多久？', en: 'Set “A-weighted level (dBA)” to 94 dBA (common in band rooms and karaoke): how long may you listen each day?' },
      check: function (ev) { return isDose(ev) && near(ev.data.L, 94, 0.05); }
    },
    {
      id: 'loudness-5', level: 3,
      title: { zh: '40 phon 的 100 Hz', en: '100 Hz at 40 phon' },
      desc: { zh: '打開「鎖定在等響曲線上」，把響度級設成 40 phon，再把頻率移到 100 Hz：要幾 dB 才和 1 kHz 的 40 dB 一樣響？', en: 'Turn on “Lock to a contour”, set the loudness level to 40 phon and move the frequency to 100 Hz: how many decibels does it need to sound as loud as 40 dB at 1 kHz?' },
      check: function (ev) { const d = ev.data; return isPt(ev) && d.locked && near(d.target, 40, 0.25) && rel(d.f, 100, 0.01); }
    },
    {
      id: 'loudness-6', level: 4,
      title: { zh: '一樣響，聽聽看', en: 'Equally loud — listen' },
      desc: { zh: '鎖定在 60 phon 的等響曲線上，把頻率移到 100 Hz，按「先 1 kHz 再這個頻率」：兩個音的聲壓級相差多少？', en: 'Lock to the 60-phon contour, move the frequency to 100 Hz and press “1 kHz, then this”: how far apart are the two levels?' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.kind === 'cmp' && d.locked && near(d.target, 60, 0.25) && rel(d.f, 100, 0.02); }
    },
    {
      id: 'loudness-7', level: 4,
      title: { zh: '退後一倍', en: 'Twice as far' },
      desc: { zh: '把「距離 r（m）」加倍（例如從 2 m 到 4 m）：聲壓級降了幾 dB？', en: 'Double “Distance r (m)” (for example from 2 m to 4 m): by how many decibels does the level drop?' },
      check: function (ev) { const d = ev.data; return isSum(ev) && d.via === 'r' && d.prev && rel(d.r / d.prev.r, 2, 0.01); }
    },
    {
      id: 'loudness-8', level: 5,
      title: { zh: '耳朵最靈敏的頻率', en: 'Where the ear is keenest' },
      desc: { zh: '鎖定在一條 20 phon 以上的等響曲線上，找到這條曲線上聲壓級最低的頻率（和最低點相差 0.2 dB 以內）。', en: 'Lock to a contour of 20 phon or more and find the frequency where that contour is lowest (within 0.2 dB of its minimum).' },
      check: function (ev) {
        const d = ev.data;
        if (!isPt(ev) || !d.locked || !(d.target >= 20) || !LC) return false;
        return d.f > 1500 && d.f < 6000 && d.Lp - LC.contourMin(d.target).Lp <= 0.2;
      }
    },
    {
      id: 'loudness-9', level: 6,
      title: { zh: '每天兩小時', en: 'Two hours a day' },
      desc: { zh: '「每天聽幾小時」設成 2 小時，再找出讓劑量剛好 100% 的「A 加權聲級（dBA）」（相差 1% 以內）。', en: 'Set “Hours of listening per day” to 2 and find the “A-weighted level (dBA)” that makes the dose exactly 100% (within 1%).' },
      check: function (ev) { const d = ev.data; return isDose(ev) && near(d.h, 2, 0.01) && near(d.dose, 100, 1); }
    },
    {
      id: 'loudness-10', level: 7,
      title: { zh: '低音的陡坡', en: 'The steep bass' },
      desc: { zh: '鎖定在等響曲線上，在 50 Hz 把「響度級 LN（phon）」從 20 phon 拉到 40 phon：聲壓級只加了幾 dB？（在 1 kHz 要加 20 dB）', en: 'Lock to a contour and, at 50 Hz, drag “Loudness level LN (phon)” from 20 phon to 40 phon: how many decibels does the level go up? (At 1 kHz it takes 20 dB.)' },
      check: function (ev) {
        const d = ev.data, p = d.prev;
        return isPt(ev) && d.locked && p && p.locked && rel(d.f, 50, 0.02) && Math.abs(d.f - p.f) < 0.05 && near(p.phon, 20, 0.5) && near(d.target, 40, 0.5);
      }
    },
    {
      id: 'loudness-11', level: 8,
      title: { zh: '離喇叭多遠才安全', en: 'How far from the speaker' },
      desc: { zh: '讓 1 公尺處的合計到 105 dB 以上（像演唱會的喇叭），再調「距離 r（m）」，讓那裡剛好降到 85 dB（±0.2）：站在那裡每天可以聽 8 小時。', en: 'Make the total at 1 m 105 dB or more (like a concert speaker), then adjust “Distance r (m)” until the level there is exactly 85 dB (±0.2): there you could listen for 8 hours a day.' },
      check: function (ev) { const d = ev.data; return isSum(ev) && d.total1 >= 105 && near(d.totalR, 85, 0.2); }
    },
    {
      id: 'loudness-12', level: 9,
      title: { zh: '音量轉小，低音先不見', en: 'Turn it down and the bass goes first' },
      desc: { zh: '鎖定在等響曲線上，在 1 kHz 和 50 Hz 各把響度級從 80 phon 降到 50 phon：比一比，兩次的聲壓級各降了多少？（音響的「響度補償」就是為了這個）', en: 'Lock to a contour and, at 1 kHz and at 50 Hz, lower the loudness level from 80 phon to 50 phon: compare how far the level drops each time. (This is what the “loudness” button on an amplifier is for.)' },
      check: function (ev, mem) {
        const d = ev.data, p = d.prev;
        if (!isPt(ev) || !d.locked || !p || !p.locked || Math.abs(d.f - p.f) >= 0.05 || !near(p.phon, 80, 0.5) || !near(d.target, 50, 0.5)) return false;
        if (rel(d.f, 1000, 0.01)) mem.mid = true;
        if (rel(d.f, 50, 0.02)) mem.low = true;
        return !!(mem.mid && mem.low);
      }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'loudness-h1', level: 3, hidden: true,
      riddle: { zh: '尺上的零，不是耳朵的零。在大家拿來比較的那個地方，站到寂靜的邊上。', en: 'Zero on the ruler is not zero for the ear. Where everything is compared, stand at the edge of silence.' },
      // 1 kHz 的聽閾是 2.4 dB（不是 0 dB）：沒有鎖定時，把點放在 1 kHz（±1%）的聽閾上（±0.15 dB）
      check: function (ev) { const d = ev.data; return isPt(ev) && !d.locked && rel(d.f, 1000, 0.01) && near(d.Lp, d.thr, 0.15); }
    },
    {
      id: 'loudness-h2', level: 4, hidden: true,
      riddle: { zh: '大的那個多了一個零；小的那個加進來，幾乎什麼也沒帶來。', en: 'The louder one has one more zero; the softer one joins in and brings almost nothing.' },
      // 打開「聲源 2」（加進來）時，它比聲源 1（N = 1）剛好小 10 dB（±0.05）：合起來只比聲源 1 多 0.41 dB
      check: function (ev) { const d = ev.data; return isSum(ev) && d.via === 'on2' && d.on2 && d.N === 1 && near(d.L1 - d.L2, 10, 0.05); }
    },
    {
      id: 'loudness-h3', level: 5, hidden: true,
      riddle: { zh: '要讓耳朵說出「兩倍」，一個朋友不夠，得請來一整排。', en: 'For the ear to say “twice”, one friend is not enough — invite a whole row.' },
      // 先試過「兩個一樣大的聲源」（一個朋友：+3 dB，只響 1.23 倍），再關掉聲源 2、把 N 從 1 直接改成 10：+10 dB，響度剛好加倍
      check: function (ev, mem) {
        const d = ev.data;
        if (!isSum(ev)) return false;
        if (d.on2 && d.N === 1 && near(d.L1, d.L2, 0.05)) { mem.pair = true; return false; }
        return !!mem.pair && d.via === 'n' && !d.on2 && d.N === 10 && !!d.prev && d.prev.N === 1;
      }
    },
    {
      id: 'loudness-h4', level: 5, hidden: true,
      riddle: { zh: '比零還小的聲音，也有人聽得見。', en: 'A sound smaller than nothing — and still someone hears it.' },
      // 聲壓級 −3 dB 以下，卻在聽閾以上至少 2 dB：只有 3–4 kHz 附近做得到（聽閾最低約 −6.1 dB，在 3.4 kHz）
      check: function (ev) { const d = ev.data; return isPt(ev) && d.Lp <= -3 && d.audible && d.above >= 2; }
    },
    {
      id: 'loudness-h5', level: 6, hidden: true,
      riddle: { zh: '兩個都守規矩，加在一起卻剛好踩在線上。', en: 'Each keeps the rule; together they stand exactly on the line.' },
      // 兩個一樣大的聲源，合起來在聽的地方剛好 85 dB（±0.1）：每一個都只有 82 dB，合起來到了 8 小時的上限
      check: function (ev) { const d = ev.data; return isSum(ev) && d.on2 && d.N === 1 && near(d.L1, d.L2, 0.05) && near(d.totalR, 85, 0.1); }
    },
    {
      id: 'loudness-h6', level: 7, hidden: true,
      riddle: { zh: '在一切比較的原點，只走一步，讓感覺翻倍。這一步有多長？', en: 'At the origin of every comparison, take one step that doubles the feeling. How long is the step?' },
      // 1 kHz（±1%）、沒有鎖定，聲壓級一次加 10 dB（±0.1），從 40 phon 以上出發：響度（sone）剛好加倍
      check: function (ev) { const d = ev.data; return isPt(ev) && !d.locked && d.prev && !d.prev.locked && rel(d.f, 1000, 0.01) && near(d.dLp, 10, 0.1) && doubled(d); }
    },
    {
      id: 'loudness-h7', level: 8, hidden: true,
      riddle: { zh: '在最深的地方，梯子的橫木靠得最近：少少幾步，就是兩倍。', en: 'Deep down, the rungs of the ladder are closest together: a few small steps, and it is twice.' },
      // 31.5 Hz 以下，同一個頻率上響度剛好加倍（從 40 phon 以上出發），聲壓級卻只加了 6 dB 以內（1 kHz 要 10 dB）
      check: function (ev) { const d = ev.data; return isPt(ev) && d.f <= 31.5 * 1.01 && d.dLp > 0 && d.dLp <= 6 && doubled(d); }
    },
    {
      id: 'loudness-h8', level: 8, hidden: true,
      riddle: { zh: '人多了好幾倍，卻搬到更遠的地方；聽的人說：一點都沒變。', en: 'Many times more players, moved further away — and the listener says nothing changed.' },
      // 聲源 2 關掉、聲源 1 不變：N 變成 4 倍、距離變成 2 倍（或反過來），兩個狀態在聽的地方的聲壓級一樣（4 倍能量 = +6.02 dB = 距離加倍的 −6.02 dB）
      check: function (ev, mem) {
        if (!isSum(ev)) return false;
        const d = ev.data;
        const list = mem.list || (mem.list = []);
        let ok = false;
        if (!d.on2) {
          ok = list.some(function (s) {
            return s.L1 === d.L1 && ((d.N === 4 * s.N && rel(d.r / s.r, 2, 0.002)) || (s.N === 4 * d.N && rel(s.r / d.r, 2, 0.002))) && near(s.totalR, d.totalR, 0.01);
          });
          list.push({ L1: d.L1, N: d.N, r: d.r, totalR: d.totalR });
          if (list.length > 40) list.shift();
        }
        return ok;
      }
    },
    {
      id: 'loudness-h9', level: 9, hidden: true,
      riddle: { zh: '翻過最靈的谷底，再往高處走，還有一座小山。站上山頂。', en: 'Past the keenest valley and further up, there is one more small hill. Stand on its top.' },
      // 鎖定在 20–80 phon 的等響曲線上，先到過這條曲線的谷底（最低點 0.3 dB 以內），再站上高頻那座「小山」的山頂（約 9–10 kHz，和山頂相差 0.1 dB 以內）
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPt(ev) || !d.locked || !(d.target >= 20 && d.target <= 80) || !LC) return false;
        const key = String(Math.round(d.target * 10));
        const v = mem.valley || (mem.valley = {});
        if (d.f > 1500 && d.f < 6000 && d.Lp - LC.contourMin(d.target).Lp <= 0.3) { v[key] = true; return false; }
        return !!v[key] && d.f >= 7000 && LC.contourMax(d.target).Lp - d.Lp <= 0.1;
      }
    },
    {
      id: 'loudness-h10', level: 10, hidden: true,
      riddle: { zh: '沿著寂靜的岸邊走：在最深處、最靈處、最高處各站一次——三個地方的「響」都一樣。', en: 'Walk along the shore of silence: stand once in the deepest place, once in the keenest, once in the highest — the loudness is the same in all three.' },
      // 沒有鎖定，把點放在聽閾上（±0.15 dB）三次：40 Hz 以下、2–5 kHz、8 kHz 以上——聽閾曲線本身就是一條約 2.4 phon 的等響曲線
      check: function (ev, mem) {
        const d = ev.data;
        if (!isPt(ev) || d.locked || !near(d.Lp, d.thr, 0.15)) return false;
        if (d.f <= 40) mem.lo = true;
        if (d.f >= 2000 && d.f <= 5000) mem.mid = true;
        if (d.f >= 8000) mem.hi = true;
        return !!(mem.lo && mem.mid && mem.hi);
      }
    }
  ]);
})();
