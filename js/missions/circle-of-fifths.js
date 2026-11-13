/* missions/circle-of-fifths.js — 五度圈、調號與轉調的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/circle-of-fifths.js 發出，都在使用者操作之後；資料由 CircleFifthsCore.eventData 產生）：
 *   'key'：目前的調改變之後。src = 'turn'（「◀ 下屬調」「屬調 ▶」、拖曳轉盤、鍵盤方向鍵，一次一格）、'tap'（點五度圈上的某一格）、
 *          'mode'（大調／小調）、'spell'（寫法：常用／♯／♭）。run = 連續往同一個方向轉了幾格（其他操作會歸零），runDir = +1（升記號方向）或 −1。
 *   'target'：「比較的調」改變之後。
 *   'heat'：點共同音熱圖的一格（目前的調換成那一列的大調、比較的調換成那一欄的大調）。另有 order（'fifths'、'chrom'）。
 *   'play'：按「▶ 播放」。另有 what（'triad' 主三和弦、'scale' 音階、'cadence' 終止式、'modulate' 轉調示範、'kseq' 乘 k 的序列）、tempo。
 *   'k'：「乘 k」滑桿改變。
 *   'arrange'：按「× k 重排」（by = 乘上的 k，prevA = 原來的排列）或「回到半音圈」（reset = true）。
 *   共同的資料：{ pos, j（調號：正 = 升記號數、負 = 降記號數）, mode, spell, tonicPc, tonicName, label, sharps, flats, doubles, accCount, theoretical,
 *     names, sigNames, k, g（gcd(k, 12)）, len（每圈幾個點）, a（目前的排列：1、5、7、11）, slotStep（在這個排列上加 k 個半音跨幾格）,
 *     t（比較的調：{ j, mode, label, tonicPc, common, d（五度圈距離 −6…5）, sameSet, sameKey, enharm, sameTonic, triadCommon, changed（要改的音數）, respell（同名異音時換寫法的音數） } 或 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const mod = function (a, n) { return ((a % n) + n) % n; };
  /** 有比較的調、而且是目前的調或比較的調剛改變的事件 */
  const cmp = function (ev) { return (ev.type === 'key' || ev.type === 'target' || ev.type === 'heat') && ev.data.t ? ev.data.t : null; };
  const pair = function (a, b, x, y) { return (a === x && b === y) || (a === y && b === x); };

  LabMission.register('circle-of-fifths', [
    {
      id: 'circle-of-fifths-1', level: 1,
      title: { zh: '第一個升記號', en: 'The first sharp' },
      desc: { zh: '按「屬調 ▶」或拖曳五度圈，把 G 大調轉到最上面，看「調號」多了哪一個升記號。', en: 'Press “Dominant ▶” or drag the circle to bring G major to the top, and see which sharp appears in the “Key signature”.' },
      check: function (ev) { const d = ev.data; return ev.type === 'key' && d.mode === 'major' && d.j === 1; }
    },
    {
      id: 'circle-of-fifths-2', level: 2,
      title: { zh: '三個升記號的大調', en: 'The major key with three sharps' },
      desc: { zh: '找出有 3 個升記號的大調，按「▶ 播放」聽聽它。', en: 'Find the major key with 3 sharps and listen to it with “▶ Play”.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.mode === 'major' && d.j === 3; }
    },
    {
      id: 'circle-of-fifths-3', level: 2,
      title: { zh: 'D 大調的關係小調', en: 'The relative minor of D major' },
      desc: { zh: '先把 D 大調轉到最上面，再按「小調」：和 D 大調用同一個調號的小調是哪一個？', en: 'Bring D major to the top, then press “Minor”: which minor key uses the same key signature as D major?' },
      check: function (ev) { const d = ev.data; return ev.type === 'key' && d.src === 'mode' && d.mode === 'minor' && d.j === 2; }
    },
    {
      id: 'circle-of-fifths-4', level: 3,
      title: { zh: '降記號的順序', en: 'The order of flats' },
      desc: { zh: '往「◀ 下屬調」的方向轉，找一個有 4 個降記號的調（大調或小調都可以），看降記號是依什麼順序加上去的。', en: 'Turn towards “◀ Subdominant” and find a key with 4 flats (major or minor), then see in which order the flats are added.' },
      check: function (ev) { const d = ev.data; return ev.type === 'key' && d.j === -4; }
    },
    {
      id: 'circle-of-fifths-5', level: 3,
      title: { zh: '同一組音的兩個調', en: 'Two keys, one set of notes' },
      desc: { zh: '在「比較的調」選一個和目前的調共用全部 7 個音、卻不是同一個調的調。', en: 'In “Compare with”, choose a key that shares all 7 notes with the current key but is not the same key.' },
      check: function (ev) { const t = cmp(ev); return !!t && t.common === 7 && t.mode !== ev.data.mode; }
    },
    {
      id: 'circle-of-fifths-6', level: 4,
      title: { zh: '轉一圈回到原點', en: 'All the way round' },
      desc: { zh: '連續往同一個方向轉 12 格（用按鈕或拖曳都可以），數數經過了幾個調，最後回到哪裡？', en: 'Turn 12 steps in a row in the same direction (buttons or dragging). How many keys do you pass, and where do you end up?' },
      check: function (ev) { const d = ev.data; return ev.type === 'key' && d.src === 'turn' && d.run >= 12; }
    },
    {
      id: 'circle-of-fifths-7', level: 4,
      title: { zh: '乘 5 也走得完', en: 'Times 5 goes all the way too' },
      desc: { zh: '把「乘 k」設成 5，「播放內容」選「乘 k 的序列」，按「▶ 播放」：12 個音是不是都走到了？', en: 'Set “Times k” to 5, choose “Times-k sequence” as “What to play” and press “▶ Play”: are all 12 notes visited?' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.what === 'kseq' && d.k === 5; }
    },
    {
      id: 'circle-of-fifths-8', level: 5,
      title: { zh: '同一個主音的大調與小調', en: 'Major and minor on the same tonic' },
      desc: { zh: '讓「比較的調」和目前的調主音相同，但一個是大調、一個是小調（平行調）。它們共用幾個音？', en: 'Make “Compare with” a key on the same tonic as the current key, one major and one minor (parallel keys). How many notes do they share?' },
      check: function (ev) { const t = cmp(ev); return !!t && t.sameTonic && t.mode !== ev.data.mode; }
    },
    {
      id: 'circle-of-fifths-9', level: 5,
      title: { zh: '只改一個音的轉調', en: 'A modulation that changes one note' },
      desc: { zh: '「比較的調」選一個共同音 6 個的調，「播放內容」選「轉調示範」，按「▶ 播放」，聽那一個改變的音。', en: 'Choose a key with 6 common notes in “Compare with”, pick “Modulation demo” as “What to play” and press “▶ Play”; listen for the one note that changes.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.what === 'modulate' && d.t && d.t.common === 6; }
    },
    {
      id: 'circle-of-fifths-10', level: 6,
      title: { zh: '同一組鍵、兩種寫法', en: 'Same keys, two spellings' },
      desc: { zh: '把 F♯ 大調和 G♭ 大調拿來比較（用「寫法」切換 ♯ 與 ♭）：兩個調號完全不同，彈的卻是同一組鍵嗎？', en: 'Compare F♯ major with G♭ major (use “Spelling” to switch between ♯ and ♭): the signatures look completely different, but are the keys on the piano the same?' },
      check: function (ev) { const t = cmp(ev), d = ev.data; return !!t && d.mode === 'major' && t.mode === 'major' && pair(d.j, t.j, 6, -6); }
    },
    {
      id: 'circle-of-fifths-11', level: 7,
      title: { zh: '和 12 互質的 k', en: 'The k that are coprime to 12' },
      desc: { zh: '找出所有讓 12 個音連成一個圈的 k（1 到 11），每一個都用「乘 k 的序列」播一次。', en: 'Find every k from 1 to 11 that joins all 12 notes into a single circle, and play each one once with “Times-k sequence”.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'play' || d.what !== 'kseq' || d.g !== 1) return false;
        mem.ks = mem.ks || {};
        mem.ks[d.k] = true;
        return Object.keys(mem.ks).length >= 4;
      }
    },
    {
      id: 'circle-of-fifths-12', level: 9,
      title: { zh: '把十二角星拉直', en: 'Straighten the twelve-pointed star' },
      desc: { zh: '「乘 k」是 5 或 7 時，畫出來是一顆十二角星：先用「乘 k 的序列」播一次這顆星。再用「× k 重排」換一種排列，讓同一條路徑變成正十二邊形（每一步只跨一格），用同一個 k 再播一次。', en: 'With “Times k” at 5 or 7 the path is a twelve-pointed star: first play the star with “Times-k sequence”. Then use “× k rearrange” to change the arrangement so that the same path becomes a regular 12-gon (one slot per step), and play it again with the same k.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'play' || d.what !== 'kseq' || (d.k !== 5 && d.k !== 7)) return false;
        if (d.slotStep === 5 || d.slotStep === 7) { mem.star = d.k; return false; }
        return mem.star === d.k && (d.slotStep === 1 || d.slotStep === 11);
      }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'circle-of-fifths-h1', level: 3, hidden: true,
      riddle: { zh: '十二個人分成四桌，每桌三個人圍成最小的圓，誰也不比誰近。', en: 'Twelve guests split into four tables of three, each table the smallest ring, nobody closer than anybody else.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.what === 'kseq' && (d.k === 4 || d.k === 8); }
    },
    {
      id: 'circle-of-fifths-h2', level: 4, hidden: true,
      riddle: { zh: '中世紀的歌手都躲著它；在這裡，每個人只認得正對面的那一位。', en: 'Medieval singers kept away from it; here, everyone knows only the one sitting directly opposite.' },
      check: function (ev) { const d = ev.data; return ev.type === 'play' && d.what === 'kseq' && d.k === 6; }
    },
    {
      id: 'circle-of-fifths-h3', level: 5, hidden: true,
      riddle: { zh: '七把鑰匙和五把鑰匙，打開的竟然是同一扇門。', en: 'Seven keys and five keys, and they open the very same door.' },
      check: function (ev) { const t = cmp(ev), d = ev.data; return !!t && t.mode === d.mode && pair(d.j, t.j, 7, -5); }
    },
    {
      id: 'circle-of-fifths-h4', level: 6, hidden: true,
      riddle: { zh: '最後一段副歌之前，司機悄悄換了一檔。', en: 'Just before the last chorus, the driver quietly shifts up a gear.' },
      check: function (ev, mem) {
        // 先在原來的調播一次（不是轉調示範），緊接著轉調示範到高半音的同一種調
        const d = ev.data;
        if (ev.type !== 'play') return false;
        const here = d.j + d.mode;
        if (d.what !== 'modulate') { mem.prev = here; return false; }
        const ok = mem.prev === here && !!d.t && d.t.mode === d.mode && d.t.tonicPc === mod(d.tonicPc + 1, 12);
        mem.prev = null;
        return ok;
      }
    },
    {
      id: 'circle-of-fifths-h5', level: 7, hidden: true,
      riddle: { zh: '隔五道牆的鄰居和隔六道牆的鄰居，陌生得一模一樣。', en: 'The neighbour five walls away and the neighbour six walls away are exactly as much strangers.' },
      check: function (ev, mem) {
        // 共同音熱圖的同一列裡，點過相距 5 格與相距 6 格的兩格（兩格的共同音都是 2）
        const d = ev.data;
        if (ev.type !== 'heat' || !d.t) return false;
        const r = String(d.pos);
        mem.rows = mem.rows || {};
        const s = mem.rows[r] = mem.rows[r] || {};
        s[Math.abs(d.t.d)] = true;
        return !!(s[5] && s[6]);
      }
    },
    {
      id: 'circle-of-fifths-h6', level: 7, hidden: true,
      riddle: { zh: '門牌寫到第八號，終於有一位住戶得戴兩頂帽子。', en: 'When the house numbers reach eight, one resident finally has to wear two hats.' },
      check: function (ev) {
        // 一路往同一個方向轉（至少 8 格）走進理論上的調，播它的音階（音階裡有重升或重降）
        const d = ev.data;
        return ev.type === 'play' && d.what === 'scale' && d.doubles > 0 && d.run >= 8 && d.runDir * d.j > 0;
      }
    },
    {
      id: 'circle-of-fifths-h7', level: 8, hidden: true,
      riddle: { zh: '同一顆星，順著描一次，再倒著描一次。', en: 'The same star, traced once forwards and once backwards.' },
      check: function (ev, mem) {
        // 連續兩次「乘 k 的序列」：一次 k = 7、一次 k = 5（7 + 5 = 12，往上五度＝往下四度）
        const d = ev.data;
        if (ev.type !== 'play') return false;
        if (d.what !== 'kseq') { mem.last = null; return false; }
        const ok = (mem.last === 7 && d.k === 5) || (mem.last === 5 && d.k === 7);
        mem.last = d.k;
        return ok;
      }
    },
    {
      id: 'circle-of-fifths-h8', level: 8, hidden: true,
      riddle: { zh: '住在隔壁、只差一個音，兩家的大門卻沒有一塊磚相同。', en: 'Next-door neighbours that differ by a single note, yet their front doors share not one brick.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'play' && d.what === 'modulate' && d.t && d.t.common === 6 && d.t.triadCommon === 0;
      }
    },
    {
      id: 'circle-of-fifths-h9', level: 9, hidden: true,
      riddle: { zh: '十二個房間，門牌卻有十五塊；每一塊都去敲一次門。', en: 'Twelve rooms but fifteen door plates; knock on every one of them.' },
      check: function (ev, mem) {
        // 15 個常用的大調（7 個降記號到 7 個升記號）都當過目前的調
        const d = ev.data;
        if ((ev.type !== 'key' && ev.type !== 'heat') || d.mode !== 'major' || Math.abs(d.j) > 7) return false;
        mem.seen = mem.seen || {};
        mem.seen[d.j] = true;
        return Object.keys(mem.seen).length >= 15;
      }
    },
    {
      id: 'circle-of-fifths-h10', level: 10, hidden: true,
      riddle: { zh: '三面不同的鏡子輪流照一次，你又變回原來的樣子。', en: 'Look into three different mirrors, one after another, and you are yourself again.' },
      check: function (ev, mem) {
        // 從半音圈出發，連續用三個不同的 k（5、7、11 各一次）重排，回到半音圈（克萊因四元群：5 × 7 × 11 ≡ 1 mod 12）
        const d = ev.data;
        if (ev.type !== 'arrange') return false;
        if (d.reset) { mem.list = []; return false; }
        if (d.prevA === 1 || !mem.list) mem.list = [];
        mem.list.push(d.by);
        if (d.a !== 1) return false;
        const l = mem.list;
        mem.list = [];
        return l.length === 3 && l.slice().sort(function (a, b) { return a - b; }).join(',') === '5,7,11';
      }
    }
  ]);
})();
