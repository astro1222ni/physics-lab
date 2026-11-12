/* missions/measurement.js — 測量與不確定度（游標尺與螺旋測微器）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/measurement.js 發出；長度單位 mm）：
  //   check：按「核對」且夾爪（測軸）已接觸時
  //        { instr: 'vernier' | 'micro', N（20、50；測微器 0）, kind（outer、inner、depth、wire、sheet、ball；檢查零點時 'zero'）,
  //          zeroOn, zeroMm（這支儀器的零點誤差 e）, zeroCheck, readingMm（儀器上的讀數 R）, expectedMm（正確答案）, sizeMm,
  //          answer, answerStr（學生輸入）, ok, valueOk, formatOk, exact（測微器估讀位也完全正確）, intMm（R 是整數毫米）,
  //          runV: [{ N, kind, zeroOn, zeroMm }]（游標尺目前連續讀對的紀錄，讀錯就清空；零點核對不影響）,
  //          runM: [{ kind, zeroOn, zeroMm, exact }]（測微器同上）,
  //          count: { outer, inner, depth, v20, v50, micro, vPos, vNeg, mPos, mNeg }（讀對的次數；vPos = 正零點誤差的游標尺題） }
  //   ratchet：測軸碰到物體後繼續轉，棘輪打滑一次 { clicks（這次接觸後累計的次數） }
  //   stats：多次測量每量一次（或十次）之後
  //        { instr: 'v20' | 'v50' | 'micro', n, mean, s, uA, uB, u（A、B 組合）, trueMm, sigma, bias, allSame, precise, accurate, contains,
  //          rodId, sets: { v20, v50, micro: { n, mean, s, u, best, unc（X ± ΔX 的 ΔX）, contains } } }
  const EPS = 1e-9;
  const read = function (ev, instr) { const d = ev.data; return ev.type === 'check' && d.instr === instr && d.kind !== 'zero'; };
  const tail = function (arr, n) { return (arr || []).slice(-n); };

  LabMission.register('measurement', [
    {
      id: 'measurement-1', level: 1,
      title: { zh: '第一次讀游標尺', en: 'Your first vernier reading' },
      desc: { zh: '用游標尺夾住物體，輸入讀數並核對，讀對一次。', en: 'Close the vernier caliper on an object, type in the reading and check it — get one right.' },
      check: function (ev) { return read(ev, 'vernier') && ev.data.ok; }
    },
    {
      id: 'measurement-2', level: 2,
      title: { zh: '三種量法', en: 'Three ways to measure' },
      desc: { zh: '用游標尺分別讀對一次外徑、一次內徑、一次深度。', en: 'With the vernier caliper read one outside diameter, one inside diameter and one depth correctly.' },
      check: function (ev) {
        const c = ev.data.count;
        return read(ev, 'vernier') && ev.data.ok && c && c.outer >= 1 && c.inner >= 1 && c.depth >= 1;
      }
    },
    {
      id: 'measurement-3', level: 2,
      title: { zh: '轉到「喀」一聲', en: 'Turn until it clicks' },
      desc: { zh: '用螺旋測微器量細線、薄片或鋼珠，讀到 0.001 mm 並核對正確。', en: 'Measure a wire, a sheet or a steel ball with the micrometer, read it to 0.001 mm and check it correctly.' },
      check: function (ev) { return read(ev, 'micro') && ev.data.ok; }
    },
    {
      id: 'measurement-4', level: 3,
      title: { zh: '末位的 0 也算數', en: 'The final zero counts' },
      desc: { zh: '游標尺讀到一個百分位是 0 的讀數（例如 23.40 mm），把末位的 0 寫出來並核對正確。', en: 'Get a vernier reading whose hundredths digit is 0 (such as 23.40 mm), write the final 0 and check it correctly.' },
      check: function (ev) { return read(ev, 'vernier') && ev.data.ok && /\.\d0$/.test(ev.data.answerStr); }
    },
    {
      id: 'measurement-5', level: 4,
      title: { zh: '連續五次', en: 'Five in a row' },
      desc: { zh: '游標尺連續讀對 5 次（中間讀錯就重新算）。', en: 'Read the vernier caliper correctly 5 times in a row (a wrong reading starts the count again).' },
      check: function (ev) { return read(ev, 'vernier') && ev.data.ok && (ev.data.runV || []).length >= 5; }
    },
    {
      id: 'measurement-6', level: 5,
      title: { zh: '修正零點誤差', en: 'Correcting the zero' },
      desc: { zh: '打開「零點誤差」，先檢查零點再修正：零點誤差為正、為負的游標尺題各讀對一次（輸入修正後的長度）。', en: 'Switch on “zero error”, check the zero first and correct for it: get one vernier item with a positive and one with a negative zero error right (type the corrected length).' },
      check: function (ev) {
        const c = ev.data.count;
        return read(ev, 'vernier') && ev.data.ok && c && c.vPos >= 1 && c.vNeg >= 1;
      }
    },
    {
      id: 'measurement-7', level: 6,
      title: { zh: '估讀高手', en: 'Master of the last digit' },
      desc: { zh: '螺旋測微器連續 3 次讀對，而且估讀的那一位（0.001 mm）每次都完全正確。', en: 'Read the micrometer correctly 3 times in a row with the estimated digit (0.001 mm) exactly right every time.' },
      check: function (ev) {
        const r = tail(ev.data.runM, 3);
        return read(ev, 'micro') && ev.data.ok && r.length === 3 && r.every(function (o) { return o.exact; });
      }
    },
    {
      id: 'measurement-8', level: 5,
      title: { zh: '要量幾次？', en: 'How many readings?' },
      desc: { zh: '多次測量：用 0.02 mm 的游標尺、隨機誤差 σ ≥ 0.050 mm，一直量到 A 類不確定度不超過 0.010 mm（至少量 10 次）。', en: 'Repeated measurements: with the 0.02 mm vernier and a random error σ ≥ 0.050 mm, keep measuring until the Type A uncertainty is at most 0.010 mm (at least 10 readings).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'stats' && d.instr === 'v50' && d.n >= 10 && d.sigma >= 0.05 - EPS && d.uA <= 0.010 + EPS;
      }
    },
    {
      id: 'measurement-9', level: 7,
      title: { zh: '精密不等於準確', en: 'Precise is not accurate' },
      desc: { zh: '多次測量（每組至少 10 次）：做出一組「精密但不準確」的數據，再做出一組「準確但不精密」的數據（順序不限）。', en: 'Repeated measurements (at least 10 readings each): produce one data set that is “precise but not accurate” and another that is “accurate but not precise” (in either order).' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'stats' || d.n < 10) return false;
        if (d.precise === true && d.accurate === false) mem.p = true;
        if (d.precise === false && d.accurate === true) mem.a = true;
        return !!(mem.p && mem.a);
      }
    },
    {
      id: 'measurement-10', level: 8,
      title: { zh: '三種儀器比一比', en: 'Three instruments compared' },
      desc: { zh: '同一根圓棒、隨機誤差 σ ≥ 0.010 mm：三種儀器各量至少 10 次，三個結果 X ± ΔX 都包含真值，而且 ΔX 依序是測微器 < 0.02 mm 游標尺 < 0.05 mm 游標尺。', en: 'One rod, random error σ ≥ 0.010 mm: measure at least 10 times with each of the three instruments so that all three results X ± ΔX contain the true value and ΔX goes micrometer < 0.02 mm vernier < 0.05 mm vernier.' },
      check: function (ev) {
        const d = ev.data, S = d.sets;
        if (ev.type !== 'stats' || !S || d.sigma < 0.01 - EPS) return false;
        const ks = ['v20', 'v50', 'micro'];
        if (!ks.every(function (k) { return S[k] && S[k].n >= 10 && S[k].contains === true && isFinite(S[k].unc); })) return false;
        return S.micro.unc < S.v50.unc - EPS && S.v50.unc < S.v20.unc - EPS;
      }
    },
    {
      id: 'measurement-11', level: 9,
      title: { zh: '零點不再是陷阱', en: 'The zero is no longer a trap' },
      desc: { zh: '螺旋測微器打開「零點誤差」，連續 5 次輸入修正後的長度都正確。', en: 'With “zero error” on, give the corrected length on the micrometer correctly 5 times in a row.' },
      check: function (ev) {
        const r = tail(ev.data.runM, 5);
        return read(ev, 'micro') && ev.data.ok && r.length === 5 && r.every(function (o) { return o.zeroOn && Math.abs(o.zeroMm) > EPS; });
      }
    },
    {
      id: 'measurement-12', level: 10,
      title: { zh: '游標尺大師', en: 'Vernier grand master' },
      desc: { zh: '50 格（0.02 mm）游標尺打開「零點誤差」：連續 10 次修正後的長度都正確，其中外徑、內徑、深度各至少 2 次。', en: 'On the 50-division (0.02 mm) vernier with “zero error” on: give 10 corrected lengths in a row correctly, with at least 2 each of outside diameter, inside diameter and depth.' },
      check: function (ev) {
        const r = tail(ev.data.runV, 10);
        if (!(read(ev, 'vernier') && ev.data.ok && r.length === 10)) return false;
        if (!r.every(function (o) { return o.N === 50 && o.zeroOn && Math.abs(o.zeroMm) > EPS; })) return false;
        const n = { outer: 0, inner: 0, depth: 0 };
        r.forEach(function (o) { n[o.kind] = (n[o.kind] || 0) + 1; });
        return n.outer >= 2 && n.inner >= 2 && n.depth >= 2;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'measurement-h1', level: 4, hidden: true,
      riddle: { zh: '頭尾一起握手的那一刻，中間的誰也沒碰到誰。', en: 'The moment head and tail both shake hands, nobody in between touches at all.' },
      check: function (ev) { return read(ev, 'vernier') && ev.data.ok && ev.data.intMm === true; }
    },
    {
      id: 'measurement-h2', level: 5, hidden: true,
      riddle: { zh: '同一句話聽了二十遍，未必就是真話。', en: 'Hearing the same words twenty times does not make them true.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'stats' && d.n >= 20 && d.allSame === true && Math.abs(d.mean - d.trueMm) >= 0.01 - EPS;
      }
    },
    {
      id: 'measurement-h3', level: 3, hidden: true,
      riddle: { zh: '它已經說了十次「夠了」。', en: 'It has said “enough” ten times.' },
      check: function (ev) { return ev.type === 'ratchet' && ev.data.clicks >= 10; }
    }
  ]);
})();
