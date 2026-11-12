/* missions/wind-instrument.js — 管樂器：直笛、長笛與單簧管的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/wind-instrument.js 發出；只有「吹氣」中才發，預設載入時不發任何事件）：
 *   'note'：按「吹氣」開始吹（via = 'blow'），或吹氣中改了任何設定（via = 'change'：滑桿放開或打字輸入、拖曳管子右端放開、
 *           鍵盤調整、按孔、指法、管型、模式、管口修正、樂器、近似尺寸）。
 *     資料 = WindCore.analyze 的全部欄位：inst（'tube' | 'recorder'）、type（'open' | 'closed'）、L（m）、d（mm）、T（°C）、v（m/s）、
 *       corr（'none' | 'unflanged' | 'flanged'）、kEnd、delta（m）、m（振動模式 1–3）、n（第幾倍：開管 m、閉管 2m − 1）、Lp（有效長度 m）、
 *       f（聽到的頻率 Hz）、f1、lambda、res、midi、name（最近的音名，如 'A4'、'C♯6'）、cents（偏差音分）、sStart、sEnd、
 *       holes（直笛 8 個孔：0 按住、1 打開、0.5 半開，第 0 個是拇指孔）、thumb、fing（標準指法名稱或 null）、first、holeDelta、E、pull（mm）、spectrum
 *     再加上：via、changed（改了什麼）、breath（第幾口氣）、prev（上一個音）、hist（之前吹過的音，新的在前，最多 12 個；
 *       每個是 { inst, type, L, d, T, v, m, n, corr, holes, fing, pull, f, midi, name, cents, breath }）。按「全部清除」會清空 hist。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const cents = function (r) { return 1200 * Math.log(r) / Math.LN2; };
  const eq = function (a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); };
  const TWELFTH = cents(3);
  /** 兩個音的這些欄位都一樣 */
  const same = function (a, b, keys) {
    return keys.every(function (k) {
      if (k === 'holes') return !!(a.holes && b.holes) && a.holes.every(function (s, i) { return s === b.holes[i]; });
      return typeof a[k] === 'number' ? eq(a[k], b[k]) : a[k] === b[k];
    });
  };
  const isTube = function (x) { return x && x.inst === 'tube'; };
  const isRec = function (x) { return x && x.inst === 'recorder'; };
  /** 之前吹過的音裡，有沒有符合 test 的（和現在這個音配對） */
  const anyBefore = function (d, test) { return (d.hist || []).some(function (h) { return test(h); }); };
  const halfThumbC5 = function (x) { return isRec(x) && x.holes && x.holes[0] === 0.5 && x.holes.slice(1).every(function (s) { return s === 0; }); };
  const notes = function (ev) { return ev.type === 'note' && ev.data && ev.data.f > 0; };

  LabMission.register('wind-instrument', [
    {
      id: 'wind-instrument-1', level: 1,
      title: { zh: '直笛的 Sol', en: 'Sol on the recorder' },
      desc: { zh: '選「直笛」，按常用指法「G5」，再按「吹氣」：聽到 G5（Sol）。', en: 'Choose “Recorder”, press the “G5” fingering, then press “Blow”: you hear G5 (sol).' },
      check: function (ev) { const d = ev.data; return notes(ev) && isRec(d) && d.fing === 'G5' && d.name === 'G5'; }
    },
    {
      id: 'wind-instrument-2', level: 2,
      title: { zh: '拇指孔半開', en: 'Half-open thumb hole' },
      desc: { zh: '選「直笛」，按「E5」的指法，再把背面的拇指孔按成半開（點一下拇指孔），吹出高八度的 E6。', en: 'Choose “Recorder”, press the “E5” fingering, then make the thumb hole on the back half-open (tap the thumb hole once) and blow the E6 an octave higher.' },
      check: function (ev) { const d = ev.data; return notes(ev) && isRec(d) && d.fing === 'E6' && d.name === 'E6'; }
    },
    {
      id: 'wind-instrument-3', level: 2,
      title: { zh: '蓋住一端', en: 'Close one end' },
      desc: { zh: '同一根管子，先用「開管」吹第 1 模式，再換成「閉管」吹（管長、內徑、溫度都不變）：閉管的音低了將近一個八度。', en: 'With one tube, blow mode 1 as an “Open pipe”, then switch to “Closed pipe” (same length, bore and temperature): the closed pipe sounds almost an octave lower.' },
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || !isTube(d) || d.m !== 1) return false;
        return anyBefore(d, function (h) {
          if (!isTube(h) || h.m !== 1 || h.type === d.type || !same(h, d, ['L', 'd', 'T', 'corr'])) return false;
          const op = d.type === 'open' ? d : h, cl = d.type === 'open' ? h : d;
          return cents(op.f / cl.f) >= 1100;
        });
      }
    },
    {
      id: 'wind-instrument-4', level: 3,
      title: { zh: '單簧管跳十二度', en: 'The clarinet jumps a twelfth' },
      desc: { zh: '選「閉管」吹「第 1 模式」，再換成「第 2 模式」：音升高十二度（八度再加五度，頻率 ×3）。', en: 'Choose “Closed pipe”, blow “Mode 1”, then switch to “Mode 2”: the note jumps a twelfth (an octave and a fifth, ×3).' },
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || !isTube(d) || d.type !== 'closed' || d.m !== 2) return false;
        return anyBefore(d, function (h) { return isTube(h) && h.type === 'closed' && h.m === 1 && same(h, d, ['L', 'd', 'T', 'corr']) && Math.abs(cents(d.f / h.f) - TWELFTH) <= 1; });
      }
    },
    {
      id: 'wind-instrument-5', level: 3,
      title: { zh: '標準音 A4', en: 'Concert A' },
      desc: { zh: '用「開管」的第 1 模式，調「管長 L」吹出 A4 = 440 Hz（±1 Hz）。', en: 'Using an “Open pipe” in mode 1, adjust the “Tube length L” to blow A4 = 440 Hz (±1 Hz).' },
      check: function (ev) { const d = ev.data; return notes(ev) && isTube(d) && d.type === 'open' && d.m === 1 && Math.abs(d.f - 440) <= 1; }
    },
    {
      id: 'wind-instrument-6', level: 4,
      title: { zh: '夏天與冬天', en: 'Summer and winter' },
      desc: { zh: '直笛用同一個指法，「氣溫 T」在 10 °C 以下吹一次、30 °C 以上再吹一次（頭管不動）：差了幾音分？', en: 'On the recorder, blow the same fingering once with the “Air temperature T” at 10 °C or below and once at 30 °C or above (head joint unchanged): how many cents apart?' },
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || !isRec(d)) return false;
        return anyBefore(d, function (h) { return isRec(h) && same(h, d, ['holes', 'pull']) && ((h.T <= 10 && d.T >= 30) || (h.T >= 30 && d.T <= 10)); });
      }
    },
    {
      id: 'wind-instrument-7', level: 4,
      title: { zh: 'C 大調音階', en: 'The C major scale' },
      desc: { zh: '用直笛從 C5 依序吹到 C6：Do、Re、Mi、Fa、Sol、La、Si、Do（同一個音吹好幾次沒關係，中間不要換成「一根管子」）。', en: 'On the recorder, play from C5 up to C6 in order: do, re, mi, fa, sol, la, ti, do (repeating a note is fine; don’t switch to “A tube” in between).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!notes(ev)) return false;
        if (!isRec(d)) { mem.seq = []; return false; }
        const seq = mem.seq || (mem.seq = []);
        if (seq[seq.length - 1] !== d.name) seq.push(d.name);
        if (seq.length > 8) seq.shift();
        return seq.join(' ') === 'C5 D5 E5 F5 G5 A5 B5 C6';
      }
    },
    {
      id: 'wind-instrument-8', level: 5,
      title: { zh: '叉指', en: 'Cross fingering' },
      desc: { zh: '直笛吹「G5」，再把第 5 孔按住（第 4 孔仍然打開）：這種「叉指」讓音低了 20 音分以上。', en: 'Blow “G5” on the recorder, then cover hole 5 (hole 4 stays open): this cross fingering lowers the note by more than 20 cents.' },
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || !isRec(d) || !d.holes) return false;
        const hs = d.holes;
        if (hs[0] !== 0 || hs[1] !== 0 || hs[2] !== 0 || hs[3] !== 0 || hs[4] !== 1 || (hs[5] === 1 && hs[6] === 1 && hs[7] === 1)) return false;
        return anyBefore(d, function (h) { return isRec(h) && h.fing === 'G5' && same(h, d, ['T', 'pull']) && cents(d.f / h.f) <= -20; });
      }
    },
    {
      id: 'wind-instrument-9', level: 6,
      title: { zh: '量到的比算的低', en: 'Lower than the formula' },
      desc: { zh: '把管子調成短而粗（「內徑 d」25 mm 以上、「管長 L」0.30 m 以下），先用「不計」管口修正吹，再換成「0.61 r」吹：音低了 30 音分以上。', en: 'Make a short, fat tube (“Inner diameter d” 25 mm or more, “Tube length L” 0.30 m or less), blow it with the end correction set to “Ignore”, then with “0.61 r”: the note is more than 30 cents lower.' },
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || !isTube(d) || d.corr === 'none' || d.d < 25 || d.L > 0.3 + 1e-9) return false;
        return anyBefore(d, function (h) { return isTube(h) && h.corr === 'none' && same(h, d, ['type', 'L', 'd', 'T', 'm']) && cents(d.f / h.f) <= -30; });
      }
    },
    {
      id: 'wind-instrument-10', level: 6,
      title: { zh: '長笛與單簧管一樣高', en: 'Flute and clarinet in unison' },
      desc: { zh: '在同樣的「內徑 d」、氣溫與管口修正下，找出一根「開管」和一根「閉管」，用第 1 模式吹出同一個音（±5 音分）。開管要比閉管長幾倍？', en: 'With the same “Inner diameter d”, temperature and end correction, find an “Open pipe” and a “Closed pipe” that sound the same note in mode 1 (±5 cents). How many times longer is the open pipe?' },
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || !isTube(d) || d.m !== 1) return false;
        return anyBefore(d, function (h) { return isTube(h) && h.m === 1 && h.type !== d.type && same(h, d, ['d', 'T', 'corr']) && Math.abs(cents(d.f / h.f)) <= 5; });
      }
    },
    {
      id: 'wind-instrument-11', level: 8,
      title: { zh: '夏天的音樂會', en: 'A summer concert' },
      desc: { zh: '「氣溫 T」在 30 °C 以上時，直笛吹「A5」，調「頭管拉出」讓 A5 剛好準（±2 音分）。', en: 'With the “Air temperature T” at 30 °C or more, blow “A5” on the recorder and set “Head joint pulled out” so that A5 is in tune (±2 cents).' },
      check: function (ev) { const d = ev.data; return notes(ev) && isRec(d) && d.T >= 30 && d.fing === 'A5' && d.pull > 0 && d.name === 'A5' && Math.abs(d.cents) <= 2; }
    },
    {
      id: 'wind-instrument-12', level: 10,
      title: { zh: 'A4 的六種吹法', en: 'Six ways to play A4' },
      desc: { zh: '用「一根管子」吹出 A4（±3 音分）：開管與閉管，各用第 1、第 2、第 3 模式，六種都要吹到。六根管子各要多長？', en: 'Using “A tube”, play A4 (±3 cents) six ways: open and closed pipes, each in modes 1, 2 and 3. How long must each of the six tubes be?' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!notes(ev) || !isTube(d) || d.name !== 'A4' || Math.abs(d.cents) > 3) return false;
        const got = mem.got || (mem.got = {});
        got[d.type + d.m] = true;
        return Object.keys(got).length === 6;
      }
    },

    // ======================= 隱藏任務 =======================
    {
      id: 'wind-instrument-h1', level: 3, hidden: true,
      riddle: { zh: '課本上那個整整齊齊的數字，住在一個有點涼的早晨。', en: 'The tidy number from the textbook lives on a slightly chilly morning.' },
      // 聲速剛好是課本常用的 340 m/s（±0.02）：T ≈ 14.36 °C（要打字輸入，滑桿 0.1 °C 一格碰不到）
      check: function (ev) { const d = ev.data; return notes(ev) && Math.abs(d.v - 340) <= 0.02; }
    },
    {
      id: 'wind-instrument-h2', level: 5, hidden: true,
      riddle: { zh: '一根手指也不動，等季節替它往上走一格。', en: 'Not a finger moves; the season lifts it one step.' },
      // 只改氣溫（其他設定都一樣），從一個準的音（±5 音分）升高剛好一個半音（100 ± 3 音分）到下一個準的音：
      // 例如在 0 °C 把管子調準，到 32.5 °C 再吹（直笛在 0–40 °C 內做不到：它的指法在 20 °C 才準）
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || Math.abs(d.cents) > 5) return false;
        return anyBefore(d, function (h) {
          if (eq(h.T, d.T) || Math.abs(h.cents) > 5 || h.midi + 1 !== d.midi || !same(h, d, ['inst', 'type', 'm', 'pull'])) return false;
          if (isTube(d) && !same(h, d, ['L', 'd', 'corr'])) return false;
          if (isRec(d) && !same(h, d, ['holes'])) return false;
          const c = cents(d.f / h.f);
          return c >= 97 && c <= 103;
        });
      }
    },
    {
      id: 'wind-instrument-h3', level: 5, hidden: true,
      riddle: { zh: '一個交叉的手勢，一扇半掩的門，通往同一個高處。', en: 'A crossed gesture and a half-shut door lead to the same height.' },
      // 直笛：C6 的叉指，和拇指孔半開＋全部按住（C5 吹高八度），同溫度、同頭管，兩個音相差不到 3 音分
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || !isRec(d)) return false;
        const a = d.fing === 'C6', b = halfThumbC5(d);
        if (!a && !b) return false;
        return anyBefore(d, function (h) { return isRec(h) && (a ? halfThumbC5(h) : h.fing === 'C6') && same(h, d, ['T', 'pull']) && Math.abs(cents(d.f / h.f)) <= 3; });
      }
    },
    {
      id: 'wind-instrument-h4', level: 4, hidden: true,
      riddle: { zh: '把背後的門完全推開，前面只留一位守門人。', en: 'Throw the back door wide open and leave a single guard at the front.' },
      // 直笛：拇指孔全開、只按第 2 孔（真的直笛的 D6 指法），聽到 D6
      check: function (ev) { const d = ev.data; return notes(ev) && isRec(d) && d.fing === 'D6' && d.name === 'D6'; }
    },
    {
      id: 'wind-instrument-h5', level: 6, hidden: true,
      riddle: { zh: '關著門的爬兩層，開著門的爬三層，在同一個高度握手。', en: 'One with its door shut climbs two floors, one with its door open climbs three; they shake hands at the same height.' },
      // 閉管第 2 模式與開管第 3 模式同音（±3 音分），同內徑、溫度、管口修正：開管的有效長度剛好是閉管的 2 倍
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || !isTube(d)) return false;
        const want = d.type === 'closed' ? { type: 'open', m: 3, mine: 2 } : { type: 'closed', m: 2, mine: 3 };
        if (d.m !== want.mine) return false;
        return anyBefore(d, function (h) { return isTube(h) && h.type === want.type && h.m === want.m && same(h, d, ['d', 'T', 'corr']) && Math.abs(cents(d.f / h.f)) <= 3; });
      }
    },
    {
      id: 'wind-instrument-h6', level: 7, hidden: true,
      riddle: { zh: '看不見的那一小截，讓它整整低了一格。', en: 'The invisible little piece pulls it down exactly one rung.' },
      // 同一根管子只改管口修正，音降一個半音（−100 ± 3 音分）：例如開管、內徑 30 mm、管長約 0.41 m，「不計」換成「0.82 r」
      check: function (ev) {
        const d = ev.data;
        if (!notes(ev) || !isTube(d)) return false;
        return anyBefore(d, function (h) {
          if (!isTube(h) || h.corr === d.corr || !same(h, d, ['type', 'L', 'd', 'T', 'm'])) return false;
          const c = cents(d.f / h.f);
          return c >= -103 && c <= -97;
        });
      }
    },
    {
      id: 'wind-instrument-h7', level: 7, hidden: true,
      riddle: { zh: '把一切都推到盡頭，再關上一扇門。', en: 'Push everything to its limit, then close one door.' },
      // 最低的音：閉管第 1 模式低於 54.9 Hz（要管長 1.5 m、接近 0 °C、很粗的管子，而且要計入管口修正）
      check: function (ev) { const d = ev.data; return notes(ev) && isTube(d) && d.type === 'closed' && d.m === 1 && d.f < 54.9; }
    },
    {
      id: 'wind-instrument-h8', level: 8, hidden: true,
      riddle: { zh: '把頭往外拉一點點，低處只輕輕嘆氣，高處卻垂下了頭。', en: 'Pull the head out a little: the low one only sighs, the high one hangs its head.' },
      // 直笛頭管拉出「一點點」（2–5 mm），同一口氣裡從 C5 的指法直接換到 C6 的指法（或反過來）：
      // 八度變窄（不到 1190 音分）——頭管拉出時高音降得比低音多
      check: function (ev) {
        const d = ev.data, h = d.prev;
        if (!notes(ev) || !isRec(d) || !isRec(h) || d.pull < 2 || d.pull > 5 || h.breath !== d.breath || !same(h, d, ['T', 'pull'])) return false;
        if (!((d.fing === 'C6' && h.fing === 'C5') || (d.fing === 'C5' && h.fing === 'C6'))) return false;
        const hi = d.fing === 'C6' ? d : h, lo = d.fing === 'C6' ? h : d;
        return cents(hi.f / lo.f) <= 1190;
      }
    },
    {
      id: 'wind-instrument-h9', level: 9, hidden: true,
      riddle: { zh: '一口氣、一扇關著的門、三層樓：從 Do 出發。', en: 'One breath, one closed door, three floors — setting out from do.' },
      // 閉管在同一口氣裡依序吹第 1、2、3 模式（只換模式），第 1 模式是某個 C（±5 音分）：聽到 Do、Sol、Mi（1 : 3 : 5）
      check: function (ev, mem) {
        const d = ev.data;
        if (!notes(ev)) return false;
        const key = isTube(d) && d.type === 'closed' ? [d.L, d.d, d.T, d.corr].join('|') : null;
        const s = mem.s;
        if (key && d.m === 1) { mem.s = { key: key, breath: d.breath, stage: 1, c: /^C\d/.test(d.name) && Math.abs(d.cents) <= 5 }; return false; }
        if (key && s && s.key === key && s.breath === d.breath && d.m === s.stage + 1) {
          s.stage = d.m;
          if (d.m === 3) { mem.s = null; return s.c; }
          return false;
        }
        mem.s = null;
        return false;
      }
    },
    {
      id: 'wind-instrument-h10', level: 10, hidden: true,
      riddle: { zh: '五根關著門的竹子排成一列：宮、商、角、徵、羽。', en: 'Five bamboo tubes with closed doors in a row: gong, shang, jue, zhi, yu.' },
      // 排簫的五聲音階：閉管第 1 模式，準確（±5 音分）吹出同一個八度的 C、D、E、G、A（依序；不準的音與重複的音不算）
      check: function (ev, mem) {
        const d = ev.data;
        if (!notes(ev) || !isTube(d) || d.type !== 'closed' || d.m !== 1 || Math.abs(d.cents) > 5) return false;
        const seq = mem.seq || (mem.seq = []);
        if (seq[seq.length - 1] !== d.name) seq.push(d.name);
        if (seq.length > 5) seq.shift();
        if (seq.length < 5) return false;
        const oct = seq[0].replace(/^[A-G]/, '');
        return ['C', 'D', 'E', 'G', 'A'].every(function (n, i) { return seq[i] === n + oct; });
      }
    }
  ]);
})();
