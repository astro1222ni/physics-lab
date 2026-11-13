/* missions/free-fall.js — 自由落體與斜面上的運動（課本實驗）的任務（星星數 = 等級 1–10） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/free-fall.js 發出；SI 單位，k 用 kg/m）：
  //   run：放手後滑車撞上擋板（重物落進沙箱）、或放手後沒有動，計時器關掉時
  //        { mode: 'incline' | 'fall', moved, ideal, readErr, h, sin, mass, mu, f, k, freq（0 = 未知）, timerId, dtTrue,
  //          nStack（放手前疊在起點的點數）, nDots（放手後的點數）, tEnd, vEnd, aTheory, …（同 record） }
  //   record：按「記錄」或「全部記錄」之後
  //        { mode, ideal, readErr, sin, mass, mu, f, k, freq, timerId, dtTrue, dtUsed, dtSrc: 'nom' | 'cal', calReact,
  //          n, j0, tau, rows（已記錄的計數點）, avail（紙帶上可記錄的計數點，最多 30）, complete（rows = avail ≥ 3）,
  //          aFit（v–t 斜率）, intercept, aMean, aFirst, aLast, nA（平均加速度的個數）, gEst（aFit / sinθ）,
  //          errPct（aFit 與 g sinθ 的百分誤差）, aTheory }
  //   calib：① 拉完一次紙帶 { T（真正拉的時間）, Tmeas（碼錶）, N, dt, dtTrue, errPct, freq, react, ideal, timerId }
  //   calrec：① 按「記錄這一次」 { n（已記錄次數）, meanDt, dtTrue, errPct, freq, timerId, lastT, lastErrPct }
  //   summary：一張表全部記錄完成、加入 a–sinθ 圖時
  //        { n, slope, intercept, points: [{ mode, sin, a, ideal, readErr, mu, f, k, mass, freq, timerId, dtSrc, calReact, rows }] }
  const EPS = 1e-9;
  const G = 9.8;
  const rec = function (ev) { return ev.type === 'record' && ev.data.rows >= 2 && isFinite(ev.data.aFit); };
  const allErrors = function (d) { return !d.ideal && d.readErr && d.f >= 0.05 - EPS && d.k >= 0.0004 - EPS; };
  const spreadOf = function (pts) {
    const s = pts.map(function (p) { return p.sin; });
    return Math.max.apply(null, s) - Math.min.apply(null, s);
  };
  /* 以下給隱藏任務 h4–h10 用（11/13 補到 10 個） */
  const full = function (ev) { return rec(ev) && ev.data.complete; };
  const close = function (a, b, r) { return Math.abs(a - b) <= r * Math.max(Math.abs(a), Math.abs(b), 1e-12); };
  const ratio = function (a, b) { return Math.max(a, b) / Math.min(a, b); };
  /* 記住最近幾張「記錄完整張表」的紙帶（同一條紙帶只留最新的一筆），供「兩次比較」的任務使用 */
  const remember = function (mem, d) {
    const L = mem.list = (mem.list || []).filter(function (o) { return o.runId !== d.runId; });
    L.push(d);
    if (L.length > 12) L.shift();
    return L;
  };
  /* 最小平方法直線（只用在 a–sinθ 圖的部分點） */
  const lineOf = function (pts) {
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { sx += p.sin; sy += p.a; });
    const mx = sx / n, my = sy / n;
    pts.forEach(function (p) { sxx += (p.sin - mx) * (p.sin - mx); sxy += (p.sin - mx) * (p.a - my); });
    if (!(sxx > 0)) return null;
    return { slope: sxy / sxx, intercept: my - sxy / sxx * mx };
  };

  LabMission.register('free-fall', [
    {
      id: 'free-fall-1', level: 1,
      title: { zh: '第一條紙帶', en: 'Your first tape' },
      desc: { zh: '先啟動打點計時器，再放開滑車（或重物），得到一條打了點的紙帶。', en: 'Switch the ticker timer on first, then let go of the cart (or the weight) to get a dotted tape.' },
      check: function (ev) { return ev.type === 'run' && ev.data.moved; }
    },
    {
      id: 'free-fall-2', level: 2,
      title: { zh: '數點計時', en: 'Counting dots to tell time' },
      desc: { zh: '在 ① 拉紙帶，碼錶讀數至少 3 s，數出點痕數並把這一次記錄到表格。', en: 'In Part 1 pull the tape for at least 3 s on the stopwatch, count the dots and record the pull in the table.' },
      check: function (ev) { return ev.type === 'calrec' && ev.data.lastT >= 3 - EPS; }
    },
    {
      id: 'free-fall-3', level: 2,
      title: { zh: '讀完整條紙帶', en: 'Read the whole tape' },
      desc: { zh: '把一條紙帶上所有的計數點都記錄到表格，至少 8 個計數點。', en: 'Record every counting dot of one tape in the table — at least 8 of them.' },
      check: function (ev) { return rec(ev) && ev.data.complete && ev.data.rows >= 8; }
    },
    {
      id: 'free-fall-4', level: 3,
      title: { zh: '正好 1 m/s²', en: 'Exactly 1 m/s²' },
      desc: { zh: '調整斜面的高度差，讓紙帶 v–t 圖的斜率是 1.00 m/s²（誤差 ±0.01，至少記錄 5 個計數點）。', en: 'Adjust the height of the incline so that the slope of the v–t graph from the tape is 1.00 m/s² (±0.01, at least 5 counting dots recorded).' },
      check: function (ev) {
        const d = ev.data;
        return rec(ev) && d.mode === 'incline' && d.rows >= 5 && Math.abs(d.aFit - 1) <= 0.01 + EPS;
      }
    },
    {
      id: 'free-fall-5', level: 4,
      title: { zh: '剛好滑得動', en: 'Only just sliding' },
      desc: { zh: '含誤差、軌道摩擦係數 μ ≥ 0.010 時，把軌道墊到滑車剛好滑得動：記錄完整張表，量得的加速度大於 0 但不超過 0.05 m/s²。', en: 'With errors on and track friction μ ≥ 0.010, raise the track just enough for the cart to slide: complete the table with a measured acceleration above 0 but no more than 0.05 m/s².' },
      check: function (ev) {
        const d = ev.data;
        return rec(ev) && d.mode === 'incline' && !d.ideal && d.mu >= 0.01 - EPS && d.complete && d.aFit > 0 && d.aFit <= 0.05 + EPS;
      }
    },
    {
      id: 'free-fall-6', level: 5,
      title: { zh: '碼錶的極限', en: 'Beating the stopwatch' },
      desc: { zh: '在 ① 打開「按碼錶的反應時間」，拉一次紙帶，量得的 Δt 與真實值相差不到 0.5%。', en: 'In Part 1, with the stopwatch reaction time switched on, make one pull whose Δt is within 0.5% of the true value.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'calib' && d.react && d.N >= 2 && Math.abs(d.errPct) <= 0.5 + EPS;
      }
    },
    {
      id: 'free-fall-7', level: 5,
      title: { zh: '重一點比較準', en: 'Heavier is better' },
      desc: { zh: '含誤差（讀數誤差開、紙帶摩擦 f ≥ 0.050 N、空氣阻力 k ≥ 0.40 g/m）做自由落體，記錄完整張表（至少 6 點），量得的 g 與 9.8 相差不到 1%。', en: 'Drop the weight with errors on (reading error, tape friction f ≥ 0.050 N, air resistance k ≥ 0.40 g/m), complete the table (at least 6 dots) and get g within 1% of 9.8.' },
      check: function (ev) {
        const d = ev.data;
        return rec(ev) && d.mode === 'fall' && allErrors(d) && d.complete && d.rows >= 6 && Math.abs(d.errPct) <= 1 + EPS;
      }
    },
    {
      id: 'free-fall-8', level: 6,
      title: { zh: '空氣阻力現形', en: 'Air resistance shows itself' },
      desc: { zh: '含誤差做自由落體，記錄完整張表（至少 8 點），讓 a–t 圖上最後一個平均加速度比第一個小 20% 以上。', en: 'Drop the weight with errors on, complete the table (at least 8 dots) and make the last average acceleration in the a–t graph at least 20% smaller than the first.' },
      check: function (ev) {
        const d = ev.data;
        return rec(ev) && d.mode === 'fall' && !d.ideal && d.complete && d.rows >= 8 && d.nA >= 2 && d.aFirst > 0 && d.aLast <= 0.8 * d.aFirst;
      }
    },
    {
      id: 'free-fall-9', level: 7,
      title: { zh: '伽利略的斜面', en: 'Galileo’s ramp' },
      desc: { zh: '含誤差、軌道摩擦 μ ≥ 0.010，用至少 4 個不同的高度差做斜面（sinθ 相差至少 0.20），a–sinθ 圖的斜率與 9.8 相差不到 2%。', en: 'With errors on and track friction μ ≥ 0.010, run the incline at 4 or more heights (sinθ spread of at least 0.20); the slope of the a–sinθ graph must be within 2% of 9.8.' },
      check: function (ev) {
        if (ev.type !== 'summary' || ev.data.n < 4) return false;
        const pts = ev.data.points;
        const inc = pts.filter(function (p) { return p.mode === 'incline'; });
        return pts.every(function (p) { return !p.ideal && (p.mode !== 'incline' || p.mu >= 0.01 - EPS); }) &&
          inc.length >= 4 && spreadOf(inc) >= 0.2 - EPS && Math.abs(ev.data.slope / G - 1) <= 0.02 + EPS;
      }
    },
    {
      id: 'free-fall-10', level: 8,
      title: { zh: '頻率未知的計時器', en: 'The unknown timer' },
      desc: { zh: '換成頻率「未知」的計時器，在 ① 量出它的 Δt，再用量得的 Δt 分析一次自由落體：記錄完整張表，量得的 g 與 9.8 相差不到 2%。', en: 'Switch to the “Unknown” timer, measure its Δt in Part 1 and use that Δt to analyse a free fall: complete the table and get g within 2% of 9.8.' },
      check: function (ev) {
        const d = ev.data;
        return rec(ev) && d.mode === 'fall' && d.freq === 0 && d.dtSrc === 'cal' && d.complete && Math.abs(d.errPct) <= 2 + EPS;
      }
    },
    {
      id: 'free-fall-11', level: 9,
      title: { zh: '層層誤差下的 g', en: 'g through every error' },
      desc: { zh: '頻率未知的計時器，校正時含碼錶反應時間；自由落體也含所有誤差（讀數、f ≥ 0.050 N、k ≥ 0.40 g/m）。記錄完整張表，量得的 g 與 9.8 相差不到 1%。', en: 'The “Unknown” timer, calibrated with the stopwatch reaction time on; the free fall with every error on (reading, f ≥ 0.050 N, k ≥ 0.40 g/m). Complete the table and get g within 1% of 9.8.' },
      check: function (ev) {
        const d = ev.data;
        return rec(ev) && d.mode === 'fall' && d.freq === 0 && d.dtSrc === 'cal' && d.calReact && allErrors(d) && d.complete && Math.abs(d.errPct) <= 1 + EPS;
      }
    },
    {
      id: 'free-fall-12', level: 10,
      title: { zh: '用斜率消去摩擦', en: 'Let the slope cancel the friction' },
      desc: { zh: '頻率未知的計時器（校正含反應時間），所有誤差都打開（讀數、μ ≥ 0.010、f ≥ 0.050 N、k ≥ 0.40 g/m）。用同一台計時器做至少 5 次（sinθ 相差至少 0.30），a–sinθ 圖的斜率與 9.8 相差不到 1%。', en: 'The “Unknown” timer (calibrated with the reaction time on) and every error on (reading, μ ≥ 0.010, f ≥ 0.050 N, k ≥ 0.40 g/m). Do at least 5 runs with the same timer (sinθ spread of at least 0.30); the slope of the a–sinθ graph must be within 1% of 9.8.' },
      check: function (ev) {
        if (ev.type !== 'summary' || ev.data.n < 5) return false;
        const pts = ev.data.points, id = pts[0].timerId;
        return pts.every(function (p) {
          return p.freq === 0 && p.timerId === id && p.dtSrc === 'cal' && p.calReact && allErrors(p) && (p.mode !== 'incline' || p.mu >= 0.01 - EPS);
        }) && spreadOf(pts) >= 0.3 - EPS && Math.abs(ev.data.slope / G - 1) <= 0.01 + EPS;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'free-fall-h1', level: 3, hidden: true,
      riddle: { zh: '未曾啟程的旅人，在原地蓋滿了郵戳。', en: 'A traveller who never set out, stamping the same spot again and again.' },
      check: function (ev) { return ev.type === 'run' && ev.data.nStack >= 100; }
    },
    {
      id: 'free-fall-h2', level: 4, hidden: true,
      riddle: { zh: '大地的召喚，只聽見一半。', en: 'The call of the earth, only half heard.' },
      check: function (ev) {
        const d = ev.data;
        return rec(ev) && d.mode === 'incline' && d.rows >= 4 && Math.abs(d.sin - 0.5) <= 1e-6 && Math.abs(d.aFit / (G / 2) - 1) <= 0.005;
      }
    },
    {
      id: 'free-fall-h3', level: 6, hidden: true,
      riddle: { zh: '頭尾之間，恰好一甲子。', en: 'Between the first and the last, exactly threescore.' },
      check: function (ev) { return ev.type === 'calib' && ev.data.N === 61; }
    },
    {
      /* 阿波羅 15 號（1971）月面上的鐵鎚與羽毛：含誤差模式下親手把紙帶摩擦 f 與空氣阻力 k 都歸零（自己造出真空），
         兩個質量相差至少 10 倍的重物各記錄完一張表，量得的 g 都與 9.8 相差不到 1%。
         理想模式不算（不必動手就沒有阻力）；任務 7、8、11 都要求 f ≥ 0.050 N，不會順便完成 */
      id: 'free-fall-h4', level: 5, hidden: true,
      riddle: { zh: '不在完美的夢裡，而是親手把風與拉扯都收走之後：太空人同時鬆手，鐵鎚與羽毛，誰也沒有贏。', en: 'Not in a perfect dream, but after you yourself have cleared away the wind and every tug: the astronaut lets go of both at once — hammer and feather, and neither wins.' },
      check: function (ev, mem) {
        if (!full(ev)) return false;
        const d = ev.data;
        if (d.mode !== 'fall' || d.ideal || d.f > EPS || d.k > EPS || !(Math.abs(d.errPct) <= 1 + EPS)) return false;
        return remember(mem, d).some(function (o) { return o.runId !== d.runId && ratio(o.mass, d.mass) >= 10 - EPS; });
      }
    },
    {
      /* 庫侖／阿蒙頓摩擦定律：滾動摩擦 μ m g cosθ 和重量成正比，a = g (sinθ − μ cosθ) 與質量無關。
         含誤差、紙帶摩擦 f = 0、空氣阻力 k = 0（只留軌道摩擦 μ ≥ 0.010），同一個高度差，滑車質量相差至少 5 倍，
         摩擦明顯（吃掉重力分量的 10% 以上），兩張表量得的加速度相差不到 2%。和 h4 是同一個道理換到斜面上。
         一般任務都用預設的 f = 0.050 N，不會順便完成 */
      id: 'free-fall-h5', level: 5, hidden: true,
      riddle: { zh: '路面按著每位旅人的分量收過路費；於是輕的、重的，下坡時依舊並肩。', en: 'The road charges each traveller a toll in proportion to their weight — so the light and the heavy still go downhill side by side.' },
      check: function (ev, mem) {
        if (!full(ev)) return false;
        const d = ev.data;
        if (d.mode !== 'incline' || d.ideal || d.f > EPS || d.k > EPS || !(d.mu >= 0.01 - EPS) || !(d.aTheory <= 0.9 * G * d.sin)) return false;
        return remember(mem, d).some(function (o) {
          return o.runId !== d.runId && Math.abs(o.sin - d.sin) <= 1e-9 && Math.abs(o.mu - d.mu) <= EPS && ratio(o.mass, d.mass) >= 5 - EPS && close(o.aFit, d.aFit, 0.02);
        });
      }
    },
    {
      /* 反直覺：「自由落體」不一定比斜面快。含誤差的自由落體（紙帶摩擦大、重物輕：f/m 要到 4 N/kg 以上才行），
         量得的加速度比某一次斜面上滑車量得的還小 10% 以上（斜面最大只有 g/2 = 4.9 m/s²）。
         任務 7、8 的自然解（f = 0.050 N）落下的加速度都在 7 m/s² 以上，不會順便完成 */
      id: 'free-fall-h6', level: 6, hidden: true,
      riddle: { zh: '筆直墜落的，竟輸給了斜斜滑下的——拖住它的，不是大地。', en: 'The one that dropped straight down lost to the one that slid aslant — and it was not the earth that held it back.' },
      check: function (ev, mem) {
        if (!full(ev) || !(ev.data.aFit > 0)) return false;
        const d = ev.data;
        return remember(mem, d).some(function (o) {
          if (o.runId === d.runId || o.mode === d.mode || !(o.aFit > 0)) return false;
          const inc = o.mode === 'incline' ? o : d, fall = inc === o ? d : o;
          return !fall.ideal && inc.aFit >= 1.1 * fall.aFit;
        });
      }
    },
    {
      /* 相似律：a = g − f/m − (k/m) v²，運動只由 f/m 與 k/m 決定。兩次含誤差的自由落體，質量相差至少 2 倍，
         f/m 與 k/m 都相同（0.5% 內），而且空氣阻力不可忽略（k/m ≥ 0.05 /m），兩張表量得的加速度相差不到 3%。
         任務 8 的 k/m = 0.4 /m 要配 m ≥ 0.10 kg 就得 k ≥ 40 g/m（滑桿最大 20），不會順便完成 */
      id: 'free-fall-h7', level: 7, hidden: true,
      riddle: { zh: '身子變重了，風與繩的拉扯也照比例加重；兩次墜落，步調分毫不差。', en: 'The body grew heavier, and the pull of the wind and the tether grew in proportion: two falls, in perfect step.' },
      check: function (ev, mem) {
        if (!full(ev)) return false;
        const d = ev.data;
        if (d.mode !== 'fall' || d.ideal || !(d.k / d.mass >= 0.05 - EPS)) return false;
        return remember(mem, d).some(function (o) {
          return o.runId !== d.runId && ratio(o.mass, d.mass) >= 2 - EPS && close(o.k / o.mass, d.k / d.mass, 0.005) &&
            (o.f + d.f <= EPS || close(o.f / o.mass, d.f / d.mass, 0.005)) && close(o.aFit, d.aFit, 0.03);
        });
      }
    },
    {
      /* 摩擦角：紙帶摩擦 f = 0、軌道摩擦 μ ≥ 0.020 時 a = g (sinθ − μ cosθ)，a–sinθ 線延長到 a = 0 處就是剛好滑不動的
         sinθ，tanθ = μ（緩坡 sinθ ≤ 0.2 時 cosθ ≈ 1）。至少 3 點、都是同一個 μ 的斜面，x 截距與 μ 相差不到 5%。
         任務 9、12 要 sinθ 相差 0.2 以上、任務 12 要 f ≥ 0.050 N，都不會順便完成 */
      id: 'free-fall-h8', level: 8, hidden: true,
      riddle: { zh: '只讓路面開口時，把幾道緩坡連成一條線，延長到再也滑不動的地方——那裡寫著路面的脾氣。', en: 'When only the road is allowed to speak, join a few gentle ramps into one line and extend it to where nothing slides any more: the road’s temper is written there.' },
      check: function (ev) {
        if (ev.type !== 'summary' || ev.data.n < 3) return false;
        const pts = ev.data.points, mu = pts[0].mu;
        if (!(mu >= 0.02 - EPS) || !(ev.data.slope > 0)) return false;
        return pts.every(function (p) { return p.mode === 'incline' && !p.ideal && p.f <= EPS && Math.abs(p.mu - mu) <= EPS && p.sin <= 0.2 + EPS; }) &&
          Math.abs(-ev.data.intercept / ev.data.slope / mu - 1) <= 0.05;
      }
    },
    {
      /* 伽利略的外推：斜面立到 90° 就是自由落體。軌道摩擦 μ = 0（只剩紙帶摩擦 f），a = g sinθ − f/M，
         至少 3 個斜面點（sinθ 相差至少 0.2）的直線截距明顯小於 0（≤ −0.05 m/s²），延長到 sinθ = 1 正好接住
         自由落體的點（0.5% 內；重物要和滑車一樣重，f/m 才相同）。任務 9、12 都要 μ ≥ 0.010，不會順便完成 */
      id: 'free-fall-h9', level: 9, hidden: true,
      riddle: { zh: '把斜坡一路扶到直立，伽利略相信那條線會接住墜落的那一點；只要輪下無礙，連紙帶的拖累也一併算準。', en: 'Raise the ramp all the way upright and, Galileo believed, the line will catch the falling point — so long as the wheels roll free, even the drag of the tape is accounted for.' },
      check: function (ev) {
        if (ev.type !== 'summary' || ev.data.n < 4) return false;
        const pts = ev.data.points;
        const inc = pts.filter(function (p) { return p.mode === 'incline'; }), falls = pts.filter(function (p) { return p.mode === 'fall'; });
        if (inc.length < 3 || !falls.length || !pts.every(function (p) { return !p.ideal; })) return false;
        if (!inc.every(function (p) { return p.mu <= EPS; }) || spreadOf(inc) < 0.2 - EPS) return false;
        const fit = lineOf(inc);
        return !!fit && fit.intercept <= -0.05 + EPS && falls.every(function (p) { return close(p.a, fit.slope + fit.intercept, 0.005); });
      }
    },
    {
      /* 牛頓的月球檢驗（1666）：月球距地心約 60 個地球半徑，向地心的加速度是 g/60² = g/3600 ≈ 2.72 mm/s²。
         含誤差的斜面，摩擦幾乎抵消重力的分量，紙帶量得的加速度與 g/3600 相差不到 3%（至少 8 個計數點）。
         任務 5 的自然設定（μ 0.010–0.050、f 0、0.050、0.100 N、M 0.2–2 kg、h 滑桿）都不在這個範圍 */
      id: 'free-fall-h10', level: 10, hidden: true,
      riddle: { zh: '牛頓抬頭望見的那位墜落者，在桌面上重演它的步調。', en: 'The faller Newton looked up at: re-enact its pace on the tabletop.' },
      check: function (ev) {
        if (!full(ev)) return false;
        const d = ev.data;
        return d.mode === 'incline' && !d.ideal && d.rows >= 8 && Math.abs(d.aFit / (G / 3600) - 1) <= 0.03;
      }
    }
  ]);
})();
