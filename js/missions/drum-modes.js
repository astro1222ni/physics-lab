/* missions/drum-modes.js — 鼓與板的振動模態的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/drum-modes.js 發出，都在使用者操作之後；分享連結還原時不發）：
 *   'strike'：按「▶ 敲一下」、在鼓面上點或拖曳後放開、按 P。資料 = DrumCore.payload(分析, { via, sel })：
 *     { drum, a, T, L, h, r, th, x, y, damp, fBase, fLow, f01, f11, baseKey, silent, excited, inharm, centroid, strongest,
 *       note, noteCents, rel{key}, A{key}（敲擊點的模態值，有正負）, ratio{key}（對基準模態）, top[2], via, sel }
 *   'mode'：選了單一模態。{ drum, key, m, n, ratio, f, via }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const cents = function (r) { return 1200 * Math.log(r) / Math.LN2; };
  const isStrike = function (ev) { return ev.type === 'strike'; };
  const sounding = function (d) { return d && !d.silent; };
  const rel = function (d, k) { return d.rel && d.rel[k] != null ? d.rel[k] : 0; };
  const keyM = function (k) { return +k.split('-')[0]; };
  /** 記住最近幾次敲擊，給「先敲 A 再敲 B」的任務用 */
  const remember = function (mem, d) { mem.h = (mem.h || []).concat([d]).slice(-2); return mem.h; };
  const prevOf = function (mem, d) { const h = remember(mem, d); return h.length > 1 ? h[0] : null; };
  const sameSize = function (p, d) { return Math.abs(p.a - d.a) < 1e-6; };
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };

  LabMission.register('drum-modes', [
    {
      id: 'drum-modes-1', level: 1,
      title: { zh: '敲一下', en: 'Strike it' },
      desc: { zh: '按「▶ 敲一下」或在鼓面上點一下，聽聽看，並看頻譜上哪些模態響起來。', en: 'Press “▶ Strike” or click the drumhead, listen, and see which modes light up in the spectrum.' },
      check: function (ev) { return isStrike(ev) && sounding(ev.data); }
    },
    {
      id: 'drum-modes-2', level: 2,
      title: { zh: '一條直徑把鼓切成兩半', en: 'One diameter cuts the drum in half' },
      desc: { zh: '在理想膜上選單一模態 (1, 1)，看那條直徑節線：一半往上時，另一半往下。', en: 'On the ideal membrane, pick the single mode (1, 1) and look at its nodal diameter: while one half rises, the other half falls.' },
      check: function (ev) { const d = ev.data; return ev.type === 'mode' && d.drum === 'membrane' && d.key === '1-1'; }
    },
    {
      id: 'drum-modes-3', level: 2,
      title: { zh: '正中央只敲得出圓圈', en: 'The centre only rings in circles' },
      desc: { zh: '在理想膜的正中央（r/a = 0）敲一下：響起來的只剩 m = 0 的圓對稱模態，有直徑節線的模態都不動。', en: 'Strike the ideal membrane right at the centre (r/a = 0): only the round m = 0 modes sound; every mode with a nodal diameter stays still.' },
      check: function (ev) {
        const d = ev.data;
        if (!isStrike(ev) || d.drum !== 'membrane' || !sounding(d)) return false;
        return Object.keys(d.rel).every(function (k) { return keyM(k) === 0 || d.rel[k] < 0.01; });
      }
    },
    {
      id: 'drum-modes-4', level: 3,
      title: { zh: '鼓邊的聲音比較亮', en: 'Near the rim sounds brighter' },
      desc: { zh: '理想膜先在中央附近（r/a ≤ 0.05）敲一下，再在鼓邊附近（r/a ≥ 0.85）敲一下，其他設定不變：頻譜重心至少高 0.5 倍。', en: 'On the ideal membrane strike near the centre (r/a ≤ 0.05), then near the rim (r/a ≥ 0.85), changing nothing else: the spectral centre rises by at least 0.5 ×.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isStrike(ev)) return false;
        const p = prevOf(mem, d);
        if (!p || p.drum !== 'membrane' || d.drum !== 'membrane' || !sounding(p) || !sounding(d)) return false;
        return p.r <= 0.05 && d.r >= 0.85 && sameSize(p, d) && Math.abs(p.T - d.T) < 1e-6 && d.centroid >= p.centroid + 0.5;
      }
    },
    {
      id: 'drum-modes-5', level: 4,
      title: { zh: '敲在節圓上', en: 'Strike on a nodal circle' },
      desc: { zh: '理想膜上 (0, 2) 有一個節圓。找到它，敲在上面：(0, 2) 的強度降到 1% 以下。', en: 'The mode (0, 2) of the ideal membrane has a nodal circle. Find it and strike on it: (0, 2) drops below 1%.' },
      check: function (ev) { const d = ev.data; return isStrike(ev) && d.drum === 'membrane' && sounding(d) && rel(d, '0-2') < 0.01; }
    },
    {
      id: 'drum-modes-6', level: 4,
      title: { zh: '定音鼓只剩前兩個泛音', en: 'A timpani with only two partials' },
      desc: { zh: '敲定音鼓，讓 (2, 1) 至少有 20%，但 (3, 1) 以上都不到 10%：只剩比值大約 1 : 1.5 的兩個音，像一個完全五度。', en: 'Strike the timpani so that (2, 1) is at least 20% while (3, 1) and above are all below 10%: only two tones remain, in a ratio of about 1 : 1.5, like a perfect fifth.' },
      check: function (ev) {
        const d = ev.data;
        if (!isStrike(ev) || d.drum !== 'timpani' || !sounding(d) || rel(d, '2-1') < 0.2) return false;
        return Object.keys(d.rel).every(function (k) { return keyM(k) <= 2 || d.rel[k] < 0.1; });
      }
    },
    {
      id: 'drum-modes-7', level: 5,
      title: { zh: '把定音鼓調到 A2', en: 'Tune the timpani to A2' },
      desc: { zh: '調鼓皮張力或鼓的大小，讓定音鼓的基準頻率落在 A2 = 110 Hz（誤差 5 音分以內），敲一下確認。', en: 'Adjust the tension or the size so the timpani’s reference frequency is A2 = 110 Hz (within 5 cents), then strike to check.' },
      check: function (ev) { const d = ev.data; return isStrike(ev) && d.drum === 'timpani' && sounding(d) && Math.abs(cents(d.fBase / 110)) <= 5; }
    },
    {
      id: 'drum-modes-8', level: 5,
      title: { zh: '一對定音鼓', en: 'A pair of timpani' },
      desc: { zh: '樂團的定音鼓常調成主音和屬音。大小不變，連續敲兩次定音鼓，只改張力，讓兩次的基準頻率差一個完全五度（700 音分，誤差 8 音分以內）。', en: 'Orchestral timpani are often tuned to the tonic and the dominant. Keep the size, strike the timpani twice changing only the tension, and make the two reference frequencies a perfect fifth apart (700 cents, within 8 cents).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isStrike(ev)) return false;
        const p = prevOf(mem, d);
        if (!p || p.drum !== 'timpani' || d.drum !== 'timpani' || !sounding(p) || !sounding(d) || !sameSize(p, d)) return false;
        return near(Math.abs(cents(d.fBase / p.fBase)), 700, 8);
      }
    },
    {
      id: 'drum-modes-9', level: 6,
      title: { zh: '為什麼定音鼓有音高？', en: 'Why does a timpani have a pitch?' },
      desc: { zh: '大小、張力、敲擊點都相同，連續敲理想膜和定音鼓（順序不拘）：理想膜偏離整數倍平均至少 60 音分，定音鼓不到 25 音分。', en: 'With the same size, tension and striking point, strike the ideal membrane and the timpani one after the other (either order): the membrane is at least 60 cents off whole-number multiples on average, the timpani less than 25.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isStrike(ev)) return false;
        const p = prevOf(mem, d);
        if (!p || !sounding(p) || !sounding(d)) return false;
        const m = p.drum === 'membrane' ? p : d.drum === 'membrane' ? d : null;
        const t = p.drum === 'timpani' ? p : d.drum === 'timpani' ? d : null;
        if (!m || !t) return false;
        const samePt = sameSize(p, d) && Math.abs(p.T - d.T) < 1e-6 && Math.abs(p.r - d.r) < 1e-6 && Math.abs(p.th - d.th) < 1e-6;
        return samePt && m.inharm >= 60 && t.inharm < 25;
      }
    },
    {
      id: 'drum-modes-10', level: 6,
      title: { zh: '對角線上的兩個模態', en: 'Two modes on the diagonal' },
      desc: { zh: '方形薄板的 (1, 2) 和 (2, 1) 頻率相同。敲在對角線 x = y 上，讓兩者一樣強、同方向，而且都至少 30%。', en: 'On the square plate, (1, 2) and (2, 1) have the same frequency. Strike on the diagonal x = y so the two are equally strong, in the same direction, and both at least 30%.' },
      check: function (ev) {
        const d = ev.data;
        if (!isStrike(ev) || d.drum !== 'plate' || !sounding(d)) return false;
        const a = d.A['1-2'], b = d.A['2-1'];
        return a * b > 0 && Math.abs(a - b) <= 0.02 * Math.max(Math.abs(a), Math.abs(b)) && rel(d, '1-2') >= 0.3 && rel(d, '2-1') >= 0.3;
      }
    },
    {
      id: 'drum-modes-11', level: 7,
      title: { zh: '一刀切掉一半的模態', en: 'Silence half the modes at once' },
      desc: { zh: '敲在方形薄板的中線 x/L = 0.5 上：所有 m 為偶數的模態（中線剛好是它們的節線）一起消失，強度都不到 1%。', en: 'Strike the square plate on the middle line x/L = 0.5: every mode with an even m (that line is one of their nodal lines) vanishes, all below 1%.' },
      check: function (ev) {
        const d = ev.data;
        if (!isStrike(ev) || d.drum !== 'plate' || !sounding(d)) return false;
        return Object.keys(d.rel).every(function (k) { return keyM(k) % 2 === 1 || d.rel[k] < 0.01; });
      }
    },
    {
      id: 'drum-modes-12', level: 8,
      title: { zh: '兩個主角一樣大聲', en: 'Two leads, equally loud' },
      desc: { zh: '在理想膜上找一個敲擊點，讓最強的兩個模態剛好是 (0, 1) 和 (1, 1)，而且兩者的強度相差不到 2%。', en: 'Find a point on the ideal membrane where the two strongest modes are exactly (0, 1) and (1, 1), and their levels differ by less than 2%.' },
      check: function (ev) {
        const d = ev.data;
        if (!isStrike(ev) || d.drum !== 'membrane' || !sounding(d) || !d.top) return false;
        const t = d.top.slice().sort();
        return t[0] === '0-1' && t[1] === '1-1' && Math.abs(rel(d, '0-1') - rel(d, '1-1')) < 0.02;
      }
    },

    // ======================= 隱藏任務 =======================
    {
      id: 'drum-modes-h1', level: 3, hidden: true,
      riddle: { zh: '鼓手用力一擊，鼓卻假裝沒聽見。', en: 'The drummer strikes hard, and the drum pretends not to hear.' },
      check: function (ev) { const d = ev.data; return isStrike(ev) && d.drum === 'timpani' && d.silent; }
    },
    {
      id: 'drum-modes-h2', level: 4, hidden: true,
      riddle: { zh: '躲開了第二圈漣漪，卻躲不開那條中線。', en: 'You dodge the second ring of ripples, but not the line through the middle.' },
      check: function (ev) { const d = ev.data; return isStrike(ev) && d.drum === 'membrane' && sounding(d) && rel(d, '1-2') < 0.01 && rel(d, '1-1') >= 0.5; }
    },
    {
      id: 'drum-modes-h3', level: 5, hidden: true,
      riddle: { zh: '力氣加倍，換來的卻是魔鬼的音程。', en: 'Double the pull, and the devil’s interval is your reward.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isStrike(ev)) return false;
        const p = prevOf(mem, d);
        if (!p || p.drum !== d.drum || d.drum === 'plate' || !sounding(p) || !sounding(d) || !sameSize(p, d)) return false;
        return near(d.T / p.T, 2, 0.04) && near(cents(d.fBase / p.fBase), 600, 10);
      }
    },
    {
      id: 'drum-modes-h4', level: 5, hidden: true,
      riddle: { zh: '把舞台放大一倍，歌聲沉到兩層樓底下。', en: 'Make the stage twice as wide, and the song sinks two floors down.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isStrike(ev)) return false;
        const p = prevOf(mem, d);
        if (!p || p.drum !== 'plate' || d.drum !== 'plate' || !sounding(p) || !sounding(d) || Math.abs(p.h - d.h) > 1e-6) return false;
        return near(d.L / p.L, 2, 0.04) && near(cents(d.fBase / p.fBase), -2400, 10);
      }
    },
    {
      id: 'drum-modes-h5', level: 6, hidden: true,
      riddle: { zh: '這一面鼓的老二，唱出上一面鼓老大的音。', en: 'This drum’s second voice sings the note that was the last drum’s first.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isStrike(ev)) return false;
        const p = prevOf(mem, d);
        if (!p || p.drum !== 'membrane' || d.drum !== 'membrane' || !sounding(p) || !sounding(d) || !sameSize(p, d)) return false;
        return Math.abs(cents(d.f11 / p.f01)) <= 5 && rel(d, '1-1') >= 0.1;
      }
    },
    {
      id: 'drum-modes-h6', level: 7, hidden: true,
      riddle: { zh: '兩個陌生人走了不同的路，卻在同一個音上相遇。', en: 'Two strangers took different paths, yet met on the same note.' },
      check: function (ev) { const d = ev.data; return isStrike(ev) && d.drum === 'membrane' && sounding(d) && rel(d, '4-2') >= 0.95 && rel(d, '7-1') >= 0.95; }
    },
    {
      id: 'drum-modes-h7', level: 7, hidden: true,
      riddle: { zh: '讓第三個孩子，唱出整個樂團調音用的那個 A。', en: 'Let the third child sing the A the whole orchestra tunes to.' },
      check: function (ev) {
        const d = ev.data;
        if (!isStrike(ev) || d.drum !== 'timpani' || !sounding(d) || rel(d, '3-1') < 0.1) return false;
        return Math.abs(cents(d.fBase * d.ratio['3-1'] / 440)) <= 5;
      }
    },
    {
      id: 'drum-modes-h8', level: 8, hidden: true,
      riddle: { zh: '沿著另一條對角線，一對雙胞胎背對背站著。', en: 'Along the other diagonal, the twins stand back to back.' },
      check: function (ev) {
        const d = ev.data;
        if (!isStrike(ev) || d.drum !== 'plate' || !sounding(d)) return false;
        const a = d.A['1-2'], b = d.A['2-1'];
        return a * b < 0 && Math.abs(a + b) <= 0.02 * Math.max(Math.abs(a), Math.abs(b)) && rel(d, '1-2') >= 0.3 && rel(d, '2-1') >= 0.3;
      }
    },
    {
      id: 'drum-modes-h9', level: 9, hidden: true,
      riddle: { zh: '三個人並肩唱，誰也不肯讓誰。', en: 'Three sing shoulder to shoulder, and none will give way.' },
      check: function (ev) {
        const d = ev.data;
        return isStrike(ev) && d.drum === 'membrane' && sounding(d) && rel(d, '0-1') >= 0.82 && rel(d, '1-1') >= 0.82 && rel(d, '2-1') >= 0.82;
      }
    },
    {
      id: 'drum-modes-h10', level: 10, hidden: true,
      riddle: { zh: '一張皮、一片金屬，唱出同一個最低的音。', en: 'A skin and a sheet of metal sing the same lowest note.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isStrike(ev)) return false;
        const p = prevOf(mem, d);
        if (!p || !sounding(p) || !sounding(d)) return false;
        const kinds = [p.drum, d.drum].sort().join('+');
        return kinds === 'membrane+plate' && Math.abs(cents(d.fLow / p.fLow)) <= 5;
      }
    }
  ]);
})();
