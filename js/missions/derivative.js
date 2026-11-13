/* missions/derivative.js — 導數與切線的任務（星星數 = 等級 1–10）
 * 事件（js/derivative.js 發出，都在使用者操作之後）：
 *   'state'：切點、間隔、函數或勾選項改完之後（拖曳放開、滑桿放開、按鍵、按鈕）。
 *            { fn（'cubic' | 'sin' | 'exp' | 'ln' | 'abs'）, k（三次函數係數 {a, b, c, d}）, x（切點 a）, h（有正負）,
 *              fa（f(a)）, dq（差商）, sq（對稱差商）, sym（有沒有勾對稱差商）, d1（f′(a)，不可微時 null）, d2（f″(a)）,
 *              err（|差商 − f′(a)|）, errSym（|對稱差商 − f′(a)|）, chal（挑戰中）, tan（切線有顯示）,
 *              b（切線的 y 截距，沒有切線時 null）, xi（切線的 x 截距，水平或沒有切線時 null）, roots（三次函數的相異實根，其他函數 null） }
 *   'shrink'：「讓 h → 0」動畫跑完。{ fn, from（開始的 |h|）, to（結束的 |h|） }
 *   'trace'：沿著曲線走完、或拖曳放開後。{ fn, k, coverage（導函數描出來的比例 0–1） }
 *   'challenge'：挑戰對準一題。{ fn, m, time（秒）, streak（連續對準幾題）, last3（最近三題的總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return v != null && isFinite(v) && Math.abs(v - want) <= tol; };
  /** 牛頓法的足跡（每個任務各自一份）：同一個函數上，每次把切點移到上一點切線的 x 截距（±0.002）就接下去，否則重新開始；傳回目前的足跡 */
  const newton = function (ev, mem) {
    const d = ev.data;
    if (ev.type !== 'state' || d.chal || !d.tan || d.fn === 'abs' || d.d1 == null || d.fa == null) return null;
    const key = d.fn + (d.fn === 'cubic' ? '|' + d.k.a + ',' + d.k.b + ',' + d.k.c + ',' + d.k.d : '');
    const cur = { x: d.x, xi: d.xi, fa: d.fa };
    const ch = mem.chain;
    if (mem.key !== key || !ch || !ch.length) { mem.key = key; mem.chain = [cur]; return mem.chain; }
    const last = ch[ch.length - 1];
    if (Math.abs(cur.x - last.x) <= 1e-12) { ch[ch.length - 1] = cur; return ch; }   // 同一點（只改了 h 或勾選）
    if (last.xi != null && Math.abs(cur.x - last.xi) <= 0.002) { ch.push(cur); if (ch.length > 20) ch.shift(); return ch; }
    mem.chain = [cur];
    return mem.chain;
  };

  LabMission.register('derivative', [
    {
      id: 'derivative-1', level: 1,
      title: { zh: '割線變切線', en: 'From secant to tangent' },
      desc: { zh: '把間隔 h 縮小到 0.01 以下，看割線幾乎和切線重合。', en: 'Shrink the gap h below 0.01 and watch the secant all but merge with the tangent.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && !d.chal && d.dq != null && Math.abs(d.h) <= 0.01 + 1e-12; }
    },
    {
      id: 'derivative-2', level: 2,
      title: { zh: '越靠越近', en: 'Closer and closer' },
      desc: { zh: '從 h ≥ 1 開始，按「讓 h → 0」，一路看到 h = 0.001。', en: 'Starting from h ≥ 1, press “Let h → 0” and follow it all the way to h = 0.001.' },
      check: function (ev) { const d = ev.data; return ev.type === 'shrink' && d.from >= 1 - 1e-9 && d.to <= 0.0011; }
    },
    {
      id: 'derivative-3', level: 2,
      title: { zh: '山頂的切線', en: 'The tangent at the top' },
      desc: { zh: '把切點放在一個山頂（局部最高點），讓切線斜率在 ±0.01 以內。', en: 'Put the point on a peak (a local maximum) so that the tangent slope is within ±0.01 of zero.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && !d.chal && d.d1 != null && Math.abs(d.d1) <= 0.01 && d.d2 != null && d.d2 < -0.05; }
    },
    {
      id: 'derivative-4', level: 3,
      title: { zh: '左右不一樣', en: 'Left is not right' },
      desc: { zh: '在 |x| 的尖角 a = 0，h 在 0.01 以內，從右邊和左邊各看一次割線斜率。', en: 'At the corner of |x|, a = 0, with |h| at most 0.01, look at the secant slope from the right and from the left.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'state' || d.fn !== 'abs' || Math.abs(d.x) > 1e-9 || Math.abs(d.h) > 0.01 + 1e-12 || d.dq == null) return false;
        if (near(d.dq, 1, 1e-9)) mem.r = true;
        if (near(d.dq, -1, 1e-9)) mem.l = true;
        return !!(mem.r && mem.l);
      }
    },
    {
      id: 'derivative-5', level: 4,
      title: { zh: '正弦的導數', en: 'The derivative of sine' },
      desc: { zh: '沿著 sin x 走，把導函數描出至少 90%。', en: 'Walk along sin x and trace at least 90% of its derivative.' },
      check: function (ev) { return ev.type === 'trace' && ev.data.fn === 'sin' && ev.data.coverage >= 0.9; }
    },
    {
      id: 'derivative-6', level: 4,
      title: { zh: '反過來想', en: 'Working backwards' },
      desc: { zh: '調出一個三次函數，讓它的導函數是 f′(x) = 3x² − 6x。', en: 'Set up a cubic whose derivative is f′(x) = 3x² − 6x.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'state' && d.fn === 'cubic' && near(d.k.a, 1, 1e-9) && near(d.k.b, -3, 1e-9) && near(d.k.c, 0, 1e-9);
      }
    },
    {
      id: 'derivative-7', level: 5,
      title: { zh: '穿過原點的切線', en: 'A tangent through the origin' },
      desc: { zh: '在 eˣ 上找一點，讓那裡的切線通過原點（y 截距在 ±0.01 以內）。', en: 'Find the point on eˣ whose tangent passes through the origin (y-intercept within ±0.01).' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.fn === 'exp' && d.tan && near(d.b, 0, 0.01); }
    },
    {
      id: 'derivative-8', level: 6,
      title: { zh: '停一下再走', en: 'A pause on the way up' },
      desc: { zh: '調出一個三次函數（x³ 的係數不為 0），找到一點，切線水平、而且曲線在那裡由彎向下轉成彎向上（或反過來）：|f′| ≤ 0.01、|f″| ≤ 0.02。', en: 'Set up a cubic (with a non-zero x³ coefficient) and find a point where the tangent is horizontal and the curve switches the way it bends: |f′| ≤ 0.01 and |f″| ≤ 0.02.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'state' && !d.chal && d.fn === 'cubic' && Math.abs(d.k.a) > 1e-9 && d.d1 != null && Math.abs(d.d1) <= 0.01 && Math.abs(d.d2) <= 0.02;
      }
    },
    {
      id: 'derivative-9', level: 5,
      title: { zh: '對稱的威力', en: 'The power of symmetry' },
      desc: { zh: '勾選對稱差商，h 至少 0.1，讓對稱差商和 f′(a) 相差不到 0.001，而單邊差商卻差了至少 0.01。', en: 'Turn on the symmetric quotient and, with h at least 0.1, get it within 0.001 of f′(a) while the one-sided quotient is off by at least 0.01.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'state' && !d.chal && d.sym && Math.abs(d.h) >= 0.1 - 1e-12 && d.errSym != null && d.errSym <= 0.001 && d.err != null && d.err >= 0.01;
      }
    },
    {
      id: 'derivative-10', level: 6,
      title: { zh: '對準斜率', en: 'Find the slope' },
      desc: { zh: '按「出一題」，找到切線斜率等於目標值的點。', en: 'Press “New challenge” and find the point where the tangent has the target slope.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'derivative-11', level: 7,
      title: { zh: '對數的切線', en: 'A tangent to the logarithm' },
      desc: { zh: '在 ln x 上找一點，讓那裡的切線通過原點（y 截距在 ±0.002 以內）。', en: 'Find the point on ln x whose tangent passes through the origin (y-intercept within ±0.002).' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.fn === 'ln' && d.tan && near(d.b, 0, 0.002); }
    },
    {
      id: 'derivative-12', level: 9,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '挑戰連續對準三題（中間不換題、不放棄），三題加起來不超過 45 秒。', en: 'Solve three challenges in a row (no skipping, no giving up) in 45 seconds or less in total.' },
      check: function (ev) { const d = ev.data; return ev.type === 'challenge' && d.streak >= 3 && d.last3 != null && d.last3 <= 45; }
    },
    {
      id: 'derivative-h1', level: 4, hidden: true,
      riddle: { zh: '描出來的影子，和本人一模一樣。', en: 'The shadow it traces is the very image of itself.' },
      check: function (ev) { return ev.type === 'trace' && ev.data.fn === 'exp' && ev.data.coverage >= 0.9; }
    },
    {
      id: 'derivative-h2', level: 5, hidden: true,
      riddle: { zh: '左右各退一步，算出來的平衡卻是騙人的。', en: 'Step back once on each side, and the balance you compute is a lie.' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.fn === 'abs' && Math.abs(d.x) < 1e-9 && d.sym && near(d.sq, 0, 1e-12); }
    },
    {
      id: 'derivative-h3', level: 7, hidden: true,
      riddle: { zh: '站在兩個朋友的正中間，伸手一指，正好指向第三個朋友。', en: 'Stand exactly halfway between two friends, point straight ahead, and you point at the third.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'state' || d.fn !== 'cubic' || !d.tan || !d.roots || d.roots.length !== 3) return false;
        const r = d.roots;
        if (r[1] - r[0] < 0.3 || r[2] - r[1] < 0.3) return false;
        return [[0, 1], [0, 2], [1, 2]].some(function (p) { return Math.abs(d.x - (r[p[0]] + r[p[1]]) / 2) <= 0.01; });
      }
    },
    // ---------- 11/13 補到 10 個隱藏任務（h4–h10；h1–h3 不改） ----------
    {
      // 三次函數的反曲點 x = −b/(3a)：切線從曲線的一側穿到另一側（曲線對這一點點對稱）。b ≠ 0（反曲點不在 y 軸上）、切線不水平
      id: 'derivative-h4', level: 4, hidden: true,
      riddle: { zh: '這裡的切線不守規矩：它沒有停在一邊，而是從身體穿了過去。', en: 'Here the tangent breaks the rules: it does not stay on one side, it passes straight through.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'state' || d.chal || !d.tan || d.fn !== 'cubic' || Math.abs(d.k.a) < 1e-9 || Math.abs(d.k.b) < 1e-9) return false;
        return Math.abs(d.x + d.k.b / (3 * d.k.a)) <= 0.001 && d.d1 != null && Math.abs(d.d1) >= 0.1;
      }
    },
    {
      // 重根：f(r) = f′(r) = 0，切線就是 x 軸，曲線碰到 x 軸又折回去（不是三重根：f″(r) ≠ 0）
      id: 'derivative-h5', level: 5, hidden: true,
      riddle: { zh: '它沒有越過地平線，只是彎下腰輕輕親了一下，又轉身離開。', en: 'It never crosses the horizon: it bends down, gives it a light kiss, and turns away again.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'state' || d.chal || !d.tan || d.fn !== 'cubic' || Math.abs(d.k.a) < 1e-9) return false;
        if (d.fa == null || Math.abs(d.fa) > 2e-4 || d.d1 == null || Math.abs(d.d1) > 0.005 || Math.abs(d.d2) < 0.05) return false;
        // 真的有重根：f′ 的零點 r（離 x 最近的那個）上 f(r) = 0
        const A = 3 * d.k.a, B = 2 * d.k.b, C = d.k.c, disc = B * B - 4 * A * C;
        if (disc < 0) return false;
        const s = Math.sqrt(disc), rs = [(-B - s) / (2 * A), (-B + s) / (2 * A)];
        const r = Math.abs(rs[0] - d.x) < Math.abs(rs[1] - d.x) ? rs[0] : rs[1];
        const fr = ((d.k.a * r + d.k.b) * r + d.k.c) * r + d.k.d;
        return Math.abs(r - d.x) <= 0.002 && Math.abs(fr) <= 1e-9;
      }
    },
    {
      // 均值定理：先在 [p, p + h] 拉一條割線（|h| ≥ 0.5），下一步把切點移到區間裡面（離兩端與正中間都至少 0.05），切線斜率等於那條割線的斜率（±0.001）
      id: 'derivative-h6', level: 6, hidden: true,
      riddle: { zh: '從這裡拉到那裡的一條弦，在半路上找到了和它平行的影子。', en: 'A chord stretched from here to there finds, somewhere along the way, a shadow running exactly parallel to it.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'state' || d.chal || d.fn === 'abs') return false;
        const key = d.fn + (d.fn === 'cubic' ? '|' + d.k.a + ',' + d.k.b + ',' + d.k.c + ',' + d.k.d : '');
        const s = mem.key === key ? mem.sec : null;
        mem.key = key;
        let hit = false;
        if (s && d.d1 != null && Math.abs(d.x - s.p) > 1e-12) {
          const lo = Math.min(s.p, s.p + s.h), hi = Math.max(s.p, s.p + s.h), mid = (lo + hi) / 2;
          hit = d.x > lo + 0.05 && d.x < hi - 0.05 && Math.abs(d.x - mid) >= 0.05 && Math.abs(d.d1 - s.m) <= 0.001;
        }
        // 只記「上一次」的割線：切點沒動（只改 h）時更新；切點動了以後，這一次的割線取代上一條
        mem.sec = d.dq != null && Math.abs(d.h) >= 0.5 ? { p: d.x, h: d.h, m: d.dq } : null;
        return hit;
      }
    },
    {
      // 反函數的導數互為倒數：eˣ 在 x = p 的斜率 eᵖ，乘上 ln x 在 x = eᵖ 的斜率 1/eᵖ，剛好是 1（兩條曲線對 y = x 互為鏡像）
      id: 'derivative-h7', level: 7, hidden: true,
      riddle: { zh: '隔著一面斜放的鏡子，這邊越陡，那邊就越緩；兩邊的陡相乘，不多不少。', en: 'Across a slanted mirror, the steeper this side climbs, the gentler that side runs; multiply the two, and nothing is left over.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'state' || d.chal || d.d1 == null || (d.fn !== 'exp' && d.fn !== 'ln')) return false;
        mem.e = mem.e || []; mem.l = mem.l || [];
        const pt = { x: d.x, m: d.d1 };
        const ok = function (e, l) { return Math.abs(e.x) >= 0.5 && Math.abs(l.x - Math.exp(e.x)) <= 0.002 && Math.abs(e.m * l.m - 1) <= 0.002; };
        const hit = d.fn === 'exp' ? mem.l.some(function (l) { return ok(pt, l); }) : mem.e.some(function (e) { return ok(e, pt); });
        const list = d.fn === 'exp' ? mem.e : mem.l;
        list.push(pt); if (list.length > 10) list.shift();
        return hit;
      }
    },
    {
      // 誤差的階：h 縮成十分之一，單邊差商的誤差約縮成十分之一（一階），對稱差商的誤差約縮成百分之一（二階）
      id: 'derivative-h8', level: 8, hidden: true,
      riddle: { zh: '把腳步縮成十分之一：一個人的迷路少了十倍，另一個人少了一百倍。', en: 'Cut the stride to a tenth: one walker strays ten times less, the other a hundred times less.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'state' || d.chal || !d.sym || d.err == null || d.errSym == null) return false;
        const key = d.fn + '|' + d.x + (d.fn === 'cubic' ? '|' + d.k.a + ',' + d.k.b + ',' + d.k.c + ',' + d.k.d : '');
        if (mem.key !== key) { mem.key = key; mem.hs = []; }
        const cur = { h: Math.abs(d.h), e: d.err, s: d.errSym };
        const hit = mem.hs.some(function (p) {
          const big = p.h > cur.h ? p : cur, small = p.h > cur.h ? cur : p;
          if (small.h < 0.01 - 1e-12 || Math.abs(big.h / small.h - 10) > 0.02 || small.s < 1e-7 || small.e < 1e-7) return false;
          const re = big.e / small.e, rs = big.s / small.s;
          return re >= 9 && re <= 11 && rs >= 90 && rs <= 110;
        });
        mem.hs.push(cur); if (mem.hs.length > 10) mem.hs.shift();
        return hit;
      }
    },
    {
      // 牛頓法：從離根很遠的點（|f| ≥ 0.5）出發，每次把切點移到切線的 x 截距，三步以上落在根上（|f| ≤ 0.001）
      id: 'derivative-h9', level: 9, hidden: true,
      riddle: { zh: '沿著斜坡滑到地上，站起來，再滑一次；第三次落地時，已經踩在它的根上。', en: 'Slide down the slope to the ground, stand up, and slide again; by the third landing you are standing on its root.' },
      check: function (ev, mem) { const c = newton(ev, mem); return !!c && c.length >= 4 && Math.abs(c[0].fa) >= 0.5 && Math.abs(c[c.length - 1].fa) <= 0.001; }
    },
    {
      // 牛頓法的兩步循環：x₀ → x₁ → x₂ = x₀，永遠到不了根（例如 x³ − 2x + 2 從 0 出發）
      id: 'derivative-h10', level: 10, hidden: true,
      riddle: { zh: '一步一步照著同一個方法走，走了兩步卻回到原地，永遠到不了。', en: 'Follow the same rule faithfully, step by step: two steps later you are back where you began, and you never arrive.' },
      check: function (ev, mem) {
        const c = newton(ev, mem);
        if (!c || c.length < 3) return false;
        const x0 = c[c.length - 3], x1 = c[c.length - 2], x2 = c[c.length - 1];
        return Math.abs(x2.x - x0.x) <= 0.002 && Math.abs(x1.x - x0.x) >= 0.5 && Math.abs(x0.fa) >= 0.5 && Math.abs(x1.fa) >= 0.5;
      }
    }
  ]);
})();
