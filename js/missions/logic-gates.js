/* missions/logic-gates.js — 邏輯閘與加法器的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/logic-gates.js 發出，都在使用者操作之後；值都是電路穩定後的結果）：
 *   'gate'：「邏輯閘」模式撥開關、換閘之後。{ src, gate（AND…XNOR）, a, b（NOT 時是 null）, out, nand（是否畫成只用 NAND） }
 *   'build'：「萬用閘拼圖」改了接線、閘數、萬用閘種類或目標之後。
 *            { src, type（NAND｜NOR）, k（閘數）, count（輸出真正用到幾個閘）, depth, mask（真值表遮罩 0–15，有腳沒接好是 −1）, target, match }
 *            真值表遮罩：第 r 列（A = r 的高位、B = r 的低位）的輸出放在第 r 位元；A = 12、B = 10、AND = 8、OR = 14、XOR = 6、XNOR = 9、永遠 1 = 15、永遠 0 = 0。
 *   'half'：「半加器」撥開關之後。{ src, a, b, s, c, settle }
 *   'full'：「全加器」撥開關之後。{ src, a, b, cin, s, cout, settle, glitch（Cout 途中有沒有突波） }
 *   'adder'：「多位元加法器」改了輸入或位元數之後。
 *            { src（bit｜slider｜toggle｜canvas｜key｜width）, n, a, b, cin, s, cout, sum（= a + b + cin）, signed（有沒有打開「有號數」）,
 *              sa, sb, ss（二補數的值）, v（有號溢位）, settle（穩定所需閘延遲）, chain（進位傳最遠幾位）, maxFlips, prev: { a, b, cin }（這次改變之前） }
 *   'step'：按「單步」之後。{ mode, t（目前時間）, settle, outs: { 輸出名稱: { v0（改變前）, v（現在顯示）, v1（最後） } }, auto（「自動播放」有沒有勾）, mask（拼圖時）, type（拼圖時） }
 *            輸出名稱：gate → Y；build → Y；half → S、C；full → S、COUT；adder → S0…、Cn。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  LabMission.register('logic-gates', [
    {
      id: 'logic-gates-1', level: 1,
      title: { zh: '點亮 AND', en: 'Light up AND' },
      desc: { zh: '在「邏輯閘」選 AND，把兩個輸入都撥成 1，讓燈亮起來。', en: 'In “Logic gates”, pick AND and switch both inputs to 1 so that the lamp lights up.' },
      check: function (ev) { const d = ev.data; return ev.type === 'gate' && d.gate === 'AND' && d.out === 1; }
    },
    {
      id: 'logic-gates-2', level: 2,
      title: { zh: '或與互斥或', en: 'OR versus XOR' },
      desc: { zh: '兩個輸入都是 1 的時候，OR 的燈亮、XOR 的燈卻不亮。在「邏輯閘」把這兩種情形都做出來。', en: 'When both inputs are 1, the OR lamp is on but the XOR lamp is off. Show both in “Logic gates”.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'gate' || d.a !== 1 || d.b !== 1) return false;
        if (d.gate === 'OR' && d.out === 1) mem.or = true;
        if (d.gate === 'XOR' && d.out === 0) mem.xor = true;
        return !!(mem.or && mem.xor);
      }
    },
    {
      id: 'logic-gates-3', level: 2,
      title: { zh: '填滿真值表', en: 'Fill in the truth table' },
      desc: { zh: '選一種有兩個輸入的閘，把 A、B 的四種組合 00、01、10、11 都撥過一次。', en: 'Pick a gate with two inputs and try all four combinations of A and B: 00, 01, 10 and 11.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'gate' || d.b === null || d.b === undefined) return false;
        mem.rows = mem.rows || {};
        const s = mem.rows[d.gate] = mem.rows[d.gate] || {};
        s[d.a * 2 + d.b] = true;
        return Object.keys(s).length === 4;
      }
    },
    {
      id: 'logic-gates-4', level: 3,
      title: { zh: '1 + 1 = 10', en: '1 + 1 = 10' },
      desc: { zh: '在「半加器」算 1 + 1：進位 C 亮起、和 S 熄滅，合起來就是二進位的 10。', en: 'In “Half adder”, work out 1 + 1: the carry C lights up and the sum S goes dark — together they read 10 in binary.' },
      check: function (ev) { const d = ev.data; return ev.type === 'half' && d.a === 1 && d.b === 1 && d.c === 1 && d.s === 0; }
    },
    {
      id: 'logic-gates-5', level: 3,
      title: { zh: '只用 NAND 拼出 AND', en: 'AND from NAND alone' },
      desc: { zh: '在「萬用閘拼圖」只用 NAND，接出和 AND 一模一樣的真值表。', en: 'In the “Universal-gate puzzle”, wire NAND gates so that the circuit has exactly the truth table of AND.' },
      check: function (ev) { const d = ev.data; return ev.type === 'build' && d.type === 'NAND' && d.mask === 8; }
    },
    {
      id: 'logic-gates-6', level: 4,
      title: { zh: '三個 1', en: 'Three ones' },
      desc: { zh: '在「全加器」把 A、B、Cin 都撥成 1，讀出 1 + 1 + 1 的二進位答案。', en: 'In “Full adder”, switch A, B and Cin all to 1 and read 1 + 1 + 1 in binary.' },
      check: function (ev) { const d = ev.data; return ev.type === 'full' && d.a === 1 && d.b === 1 && d.cin === 1 && d.s === 1 && d.cout === 1; }
    },
    {
      id: 'logic-gates-7', level: 4,
      title: { zh: '只用 NAND 拼出 OR', en: 'OR from NAND alone' },
      desc: { zh: '在「萬用閘拼圖」只用 NAND，接出和 OR 一模一樣的真值表（提示：笛摩根定律）。', en: 'In the “Universal-gate puzzle”, wire NAND gates so that the circuit has exactly the truth table of OR (hint: De Morgan’s laws).' },
      check: function (ev) { const d = ev.data; return ev.type === 'build' && d.type === 'NAND' && d.mask === 14; }
    },
    {
      id: 'logic-gates-8', level: 5,
      title: { zh: '9 + 7 = 0？', en: '9 + 7 = 0?' },
      desc: { zh: '用 4 位元的「多位元加法器」算 9 + 7（Cin = 0），看看和為什麼變成 0。', en: 'Use the 4-bit “Multi-bit adder” to work out 9 + 7 (Cin = 0) and see why the sum becomes 0.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'adder' && d.n === 4 && d.cin === 0 && ((d.a === 9 && d.b === 7) || (d.a === 7 && d.b === 9));
      }
    },
    {
      id: 'logic-gates-9', level: 6,
      title: { zh: '加一，一路傳到底', en: 'Add one, all the way through' },
      desc: { zh: '用 8 位元加法器，B = 0、Cin = 1（也就是 A 加 1），調整 A，讓這個進位一路傳到最高位、從 Cout 送出去（讀數會顯示進位傳最遠 8 位）。', en: 'With the 8-bit adder, set B = 0 and Cin = 1 (that is, A plus one) and choose A so that this carry travels all the way past the highest bit and out of Cout (the readings then show a longest carry run of 8 bits).' },
      check: function (ev) { const d = ev.data; return ev.type === 'adder' && d.n === 8 && d.b === 0 && d.cin === 1 && d.chain === 8; }
    },
    {
      id: 'logic-gates-10', level: 7,
      title: { zh: '正數加正數變負數', en: 'Positive plus positive is negative' },
      desc: { zh: '打開「有號數（二補數）」，Cin = 0，把兩個正數相加，卻得到一個負數。', en: 'Turn on “Signed numbers (two’s complement)”, keep Cin = 0, and add two positive numbers that give a negative result.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'adder' && d.signed && d.cin === 0 && d.sa > 0 && d.sb > 0 && d.ss < 0 && d.v === 1;
      }
    },
    {
      id: 'logic-gates-11', level: 9,
      title: { zh: '四個 NAND 的 XOR', en: 'XOR from four NANDs' },
      desc: { zh: '在「萬用閘拼圖」只用 4 個 NAND，接出 XOR 的真值表。', en: 'In the “Universal-gate puzzle”, build the truth table of XOR from only 4 NAND gates.' },
      check: function (ev) { const d = ev.data; return ev.type === 'build' && d.type === 'NAND' && d.mask === 6 && d.count <= 4; }
    },
    {
      id: 'logic-gates-12', level: 10,
      title: { zh: '最慢的一次', en: 'The slowest change' },
      desc: { zh: '用 8 位元加法器，讓電路花滿 17 個閘延遲（2n + 1）才穩定。', en: 'With the 8-bit adder, make the circuit need the full 17 gate delays (2n + 1) before it settles.' },
      check: function (ev) { const d = ev.data; return ev.type === 'adder' && d.n === 8 && d.settle === 17; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'logic-gates-h1', level: 3, hidden: true,
      riddle: { zh: '不管用哪一種口氣，說了兩次「不」，都等於什麼都沒說。', en: 'Whichever way you say “no”, saying it twice is the same as saying nothing at all.' },
      check: function (ev, mem) {
        const d = ev.data;
        // 板子上只放 2 個閘、2 個都用上，輸出 = A 或 = B：只能是反相再反相（說兩次「不」）；NAND 與 NOR 兩種都要做過
        if (ev.type !== 'build' || d.k !== 2 || d.count !== 2 || (d.mask !== 12 && d.mask !== 10)) return false;
        mem.t = mem.t || {};
        mem.t[d.type] = true;
        return !!(mem.t.NAND && mem.t.NOR);
      }
    },
    {
      id: 'logic-gates-h2', level: 4, hidden: true,
      riddle: { zh: '不管你問它什麼，也不管它是用哪一種零件做的，它都說「是」。', en: 'Whatever you ask it, and whichever parts it is built from, it always says “yes”.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'build' || d.mask !== 15) return false;   // 永遠 1（恆真）；NAND 與 NOR 兩種都要做過
        mem.t = mem.t || {};
        mem.t[d.type] = true;
        return !!(mem.t.NAND && mem.t.NOR);
      }
    },
    {
      id: 'logic-gates-h3', level: 5, hidden: true,
      riddle: { zh: '那顆黃色的小圓走到第 256 關，右半邊的世界就碎了。', en: 'When the little yellow circle reaches level 256, the right half of its world falls apart.' },
      check: function (ev) {
        const d = ev.data;
        // 關卡計數器是 A（無號數 255 = 第 256 關），再加 B = 1；有號數的 255 是 −1，−1 + 1 = 0 本來就對，不算
        return ev.type === 'adder' && d.n === 8 && d.cin === 0 && !d.signed && d.a === 255 && d.b === 1;
      }
    },
    {
      id: 'logic-gates-h4', level: 6, hidden: true,
      riddle: { zh: '跟分身手牽手，整排人一起往前跨了一步，排頭的人跌下懸崖。', en: 'Hand in hand with its double, the whole line steps forward — and the one at the front falls off the cliff.' },
      check: function (ev) {
        const d = ev.data;
        // A + A = 左移一格，最高位元掉出去。「整排人」：至少兩個 1；全是 1（255）時看不出整排往前移，不算
        let ones = 0;
        for (let x = d.a; x; x >>= 1) ones += x & 1;
        return ev.type === 'adder' && d.n === 8 && d.cin === 0 && d.a === d.b && d.a >= 128 && d.a < 255 && ones >= 2;
      }
    },
    {
      id: 'logic-gates-h5', level: 6, hidden: true,
      riddle: { zh: '進門時亮著，出門時也亮著，可是有一瞬間它眨了眼。', en: 'It was lit when you came in and lit when you left, yet for one instant it blinked.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'step' || d.mode !== 'full' || !d.outs || !d.outs.COUT) return false;
        const o = d.outs.COUT;
        return d.auto === false && o.v0 === 1 && o.v1 === 1 && o.v === 0;   // 關掉「自動播放」一步一步走才算（不是播放中碰巧按到）
      }
    },
    {
      id: 'logic-gates-h6', level: 7, hidden: true,
      riddle: { zh: '有些時鐘走到 2038 年一月的某一秒，下一秒就跳回了 1901 年。', en: 'Some clocks will reach a certain second in January 2038 — and the very next second, it will be 1901.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'adder' && d.n === 8 && d.cin === 0 && ((d.a === 127 && d.b === 1) || (d.a === 1 && d.b === 127));
      }
    },
    {
      id: 'logic-gates-h7', level: 7, hidden: true,
      riddle: { zh: '把自己翻個面，再添一點點，就能和自己完全抵銷。', en: 'Turn yourself inside out, add just a little, and you cancel yourself completely.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'adder' || d.n !== 8 || d.cin !== 1 || !d.prev) return false;
        // 先把 B 設成 A 翻面（¬A），最後一步才把 Cin 從 0 撥成 1（「再添一點點」）：A + ¬A + 1 = 0
        return d.prev.cin === 0 && d.prev.a === d.a && d.prev.b === d.b && d.a > 0 && d.a < 255 && d.b === 255 - d.a;
      }
    },
    {
      id: 'logic-gates-h8', level: 7, hidden: true,
      riddle: { zh: '登上月球的那台電腦只認得一種閘；只用它，讓兩個人都點頭才開門，而且不能多花一個。', en: 'The computer that flew to the Moon knew only one kind of gate. Use only that one to open the door when both say yes — and not a single gate more than needed.' },
      check: function (ev) { const d = ev.data; return ev.type === 'build' && d.type === 'NOR' && d.mask === 8 && d.count <= 3; }
    },
    {
      id: 'logic-gates-h9', level: 8, hidden: true,
      riddle: { zh: '意見一致才點燈；只用那一種萬用鑰匙，而且一把都不浪費。', en: 'Light the lamp only when they agree, using nothing but that one master key — and not wasting a single one.' },
      check: function (ev) { const d = ev.data; return ev.type === 'build' && d.type === 'NAND' && d.mask === 9 && d.count <= 5; }
    },
    {
      id: 'logic-gates-h10', level: 9, hidden: true,
      riddle: { zh: '一句自相矛盾的話永遠是錯的——除了它剛開口的那一瞬間。', en: 'A sentence that contradicts itself is always false — except for the instant it starts to speak.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'step' && d.mode === 'build' && d.mask === 0 && !!d.outs && !!d.outs.Y && d.outs.Y.v === 1;
      }
    }
  ]);
})();
