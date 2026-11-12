/* missions/perceptron.js — 感知器的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（由 js/perceptron-core.js 的 Session 產生、js/perceptron.js 轉送，都在使用者操作之後）：
 *   共同欄位：set（目前的資料：'and'、'or'、'nand'、'xor'、'sep' 隨機可分、'noisy' 有雜訊；編輯過就是 'custom'）,
 *             base（最後一次載入的預設資料；按「清空資料」後是 'empty'）, edited, n, nPos, nNeg,
 *             eta（學習率）, init（'zero'／'random'）, order（'fixed'／'shuffle'）, seed, bias（有沒有用偏差 b）
 *   'data'：資料改變（放點、移除、移動、載入預設資料、清空）。{ src, …, separable, gamma, bound }
 *   'step'：按「單步」看了一個點。{ wrong（分錯而修正）, c（這個點的類別）, epoch, updates, view3d（在 3D 檢視）, rotated（3D 視角轉過） }
 *   'epoch'：每一輪結束。{ epoch, errors（這一輪分錯幾個）, converged, limit（達到 1000 輪上限）, updates, cycle }
 *   'train'：學到收斂，或達到輪數上限。
 *       { converged, limit, epochs, updates（修正次數 k）, w1, w2, b, S（整數累加器：w = w0 + (η/20)·S）, zeroInit,
 *         separable, gamma（最大間隔 γ，增廣空間）, R, bound（Novikoff 上界 (R/γ)²）, margin（學到的線的間隔）, ratio（margin/γ）,
 *         allWrong（這次學習中有一輪每個點都分錯）, maxErr, cycle, userAll（每個點都是自己放的）,
 *         added, removed, moved, removedNoise, removedClean, noiseTotal, noiseLeft, key（資料的指紋）, pts }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const isTrain = function (ev) { return ev.type === 'train'; };
  const learned = function (ev) { return ev.type === 'train' && ev.data.converged; };
  const twoSides = function (d, k) { return d.nPos >= k && d.nNeg >= k; };
  /** 只留最近幾筆紀錄，免得暫存越長越大 */
  function remember(mem, name, key) {
    mem[name] = mem[name] || {};
    mem.order = mem.order || [];
    if (!mem[name][key]) {
      mem[name][key] = {};
      mem.order.push(key);
      if (mem.order.length > 24) delete mem[name][mem.order.shift()];
    }
    return mem[name][key];
  }

  LabMission.register('perceptron', [
    {
      id: 'perceptron-1', level: 1,
      title: { zh: '第一次修正', en: 'The first correction' },
      desc: { zh: '按「單步」，直到遇到一個分錯的點，看權重被修正一次。', en: 'Press “Step” until a point is misclassified and watch the weights get corrected once.' },
      check: function (ev) { return ev.type === 'step' && ev.data.wrong; }
    },
    {
      id: 'perceptron-2', level: 2,
      title: { zh: '學會 AND', en: 'Learning AND' },
      desc: { zh: '按「AND」，再按「學到收斂」，讓感知器有一整輪都沒有分錯。', en: 'Press “AND”, then “Learn until done”, until the perceptron gets through a whole round without a mistake.' },
      check: function (ev) { return learned(ev) && ev.data.set === 'and'; }
    },
    {
      id: 'perceptron-3', level: 2,
      title: { zh: '學會 OR', en: 'Learning OR' },
      desc: { zh: '按「OR」，讓感知器學到收斂。', en: 'Press “OR” and let the perceptron learn until it converges.' },
      check: function (ev) { return learned(ev) && ev.data.set === 'or'; }
    },
    {
      id: 'perceptron-4', level: 3,
      title: { zh: '學會 NAND', en: 'Learning NAND' },
      desc: { zh: '按「NAND」，讓感知器學到收斂。（只用 NAND 閘就能組出任何邏輯電路。）', en: 'Press “NAND” and let the perceptron learn until it converges. (NAND gates alone can build any logic circuit.)' },
      check: function (ev) { return learned(ev) && ev.data.set === 'nand'; }
    },
    {
      id: 'perceptron-5', level: 3,
      title: { zh: '立體的加權和', en: 'The weighted sum in 3D' },
      desc: { zh: '按「3D 加權和」，拖曳轉動視角，再按「單步」。', en: 'Press “3D weighted sum”, drag to turn the view, then press “Step”.' },
      check: function (ev) { return ev.type === 'step' && ev.data.view3d && ev.data.rotated; }
    },
    {
      id: 'perceptron-6', level: 4,
      title: { zh: '自己出題', en: 'Your own problem' },
      desc: { zh: '按「清空資料」，自己放點：+1 類、−1 類各至少 3 個，再讓感知器學到收斂。', en: 'Press “Clear points” and place your own: at least 3 points of class +1 and 3 of class −1, then let the perceptron learn until it converges.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.userAll && twoSides(d, 3); }
    },
    {
      id: 'perceptron-7', level: 5,
      title: { zh: 'XOR 的難題', en: 'The XOR problem' },
      desc: { zh: '按「XOR」，至少學 100 輪，看它到最後還是有點分錯。', en: 'Press “XOR”, train for at least 100 rounds, and see that some points are still wrong at the end.' },
      check: function (ev) { const d = ev.data; return ev.type === 'epoch' && d.set === 'xor' && d.epoch >= 100 && d.errors > 0; }
    },
    {
      id: 'perceptron-8', level: 5,
      title: { zh: '順序很重要', en: 'Order matters' },
      desc: { zh: '用同一份資料（至少 6 個點），分別選「固定順序」和「每輪打亂」各學到收斂一次，讓兩次的修正次數不一樣。', en: 'With the same data (at least 6 points), learn until convergence once with “Fixed order” and once with “Shuffle each round”, so that the two runs make a different number of corrections.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!learned(ev) || d.n < 6) return false;
        const e = remember(mem, 'runs', d.key);
        (e[d.order] = e[d.order] || {})[d.updates] = true;
        if (!e.fixed || !e.shuffle) return false;
        const a = Object.keys(e.fixed), b = Object.keys(e.shuffle);
        return a.some(function (k) { return b.some(function (j) { return j !== k; }); });
      }
    },
    {
      id: 'perceptron-9', level: 6,
      title: { zh: '一次就學會', en: 'Learned in one go' },
      desc: { zh: '初始權重選「零」，放至少 8 個點（兩類各至少 3 個），讓感知器只修正 1 次就收斂。', en: 'Choose “Zero” starting weights and place at least 8 points (at least 3 of each class) so that the perceptron converges after a single correction.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.zeroInit && d.n >= 8 && twoSides(d, 3) && d.updates === 1; }
    },
    {
      id: 'perceptron-10', level: 7,
      title: { zh: '寬寬的走廊', en: 'A wide corridor' },
      desc: { zh: '按「清空資料」，自己放至少 8 個點（兩類各至少 3 個），讓間隔 γ 至少 0.8，再學到收斂。', en: 'Press “Clear points”, place at least 8 points of your own (at least 3 of each class) so that the margin γ is at least 0.8, then learn until it converges.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.userAll && d.n >= 8 && twoSides(d, 3) && d.gamma >= 0.8; }
    },
    {
      id: 'perceptron-11', level: 8,
      title: { zh: '上界很大的資料', en: 'A very large bound' },
      desc: { zh: '放至少 6 個點（兩類各至少 2 個），讓收斂定理的上界 (R/γ)² 至少 500，而且感知器真的學到收斂。', en: 'Place at least 6 points (at least 2 of each class) so that the convergence bound (R/γ)² is at least 500, and the perceptron still converges.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.n >= 6 && twoSides(d, 2) && d.bound >= 500; }
    },
    {
      id: 'perceptron-12', level: 9,
      title: { zh: '學得很辛苦', en: 'A hard lesson' },
      desc: { zh: '初始權重選「零」，設計一份學得會的資料，讓感知器至少修正 100 次才收斂。', en: 'Choose “Zero” starting weights and design data that can be learned but needs at least 100 corrections before the perceptron converges.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.zeroInit && d.updates >= 100; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'perceptron-h1', level: 3, hidden: true,
      riddle: { zh: '它學成了，可是那片斜坡從此再也碰不到地面。', en: 'It learned its lesson, yet its slope never touches the ground again.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.zeroInit && d.S[0] === 0 && d.S[1] === 0 && d.S[2] !== 0; }
    },
    {
      id: 'perceptron-h2', level: 4, hidden: true,
      riddle: { zh: '四個人兩兩互看不順眼；只要其中一人挪一步，天下就太平了。', en: 'Four people, two by two, cannot stand each other; if just one of them takes a step, peace returns.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.base === 'xor' && d.n === 4 && d.added === 0 && d.removed === 0 && d.moved === 1; }
    },
    {
      id: 'perceptron-h3', level: 5, hidden: true,
      riddle: { zh: '從一無所有出發，邁大步或踩小碎步，走過的路一步也不差。', en: 'Setting out with nothing at all, giant strides or tiny steps trace exactly the same path.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!learned(ev) || !d.zeroInit || !d.userAll || d.n < 6 || !twoSides(d, 2)) return false;
        const e = remember(mem, 'runs', d.key + '|' + d.order + (d.order === 'shuffle' ? '#' + d.seed : ''));
        e[d.eta] = d.updates;
        const by = {};
        Object.keys(e).forEach(function (eta) { (by[e[eta]] = by[e[eta]] || []).push(+eta); });
        return Object.keys(by).some(function (k) {
          const list = by[k];
          return list.length >= 3 && Math.max.apply(null, list) >= 100 * Math.min.apply(null, list);
        });
      }
    },
    {
      id: 'perceptron-h4', level: 5, hidden: true,
      riddle: { zh: '拿走門檻之後，連「而且」「或者」「不都」這麼簡單的話都說不出口。', en: 'Take the threshold away, and even words as simple as “and”, “or” and “not both” can no longer be said.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (d.bias) { mem.and = mem.or = mem.nand = false; return false; }   // 放回門檻就重來：三個都要在拿走門檻的同一段時間裡試
        if (!isTrain(ev) || !d.limit || d.converged || d.edited) return false;
        if (d.set === 'and' || d.set === 'or' || d.set === 'nand') mem[d.set] = true;
        return !!(mem.and && mem.or && mem.nand);
      }
    },
    {
      id: 'perceptron-h5', level: 6, hidden: true,
      riddle: { zh: '人群裡混著幾個說反話的人；請他們離開，真相就清楚了。', en: 'A few people in the crowd say the opposite of the truth; ask them to leave, and the answer becomes clear.' },
      check: function (ev) {
        const d = ev.data;
        return learned(ev) && d.base === 'noisy' && d.added === 0 && d.moved === 0 && d.removedNoise >= 1 && d.removedClean === 0;
      }
    },
    {
      id: 'perceptron-h6', level: 7, hidden: true,
      riddle: { zh: '算命的說你要苦熬上百年，你第二天就出師了。', en: 'The fortune-teller said you would toil for a hundred years; you graduated the next day.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.zeroInit && d.userAll && d.n >= 4 && twoSides(d, 2) && d.bound >= 100 && d.updates === 1; }
    },
    {
      id: 'perceptron-h7', level: 8, hidden: true,
      riddle: { zh: '有一輪，它每一題都答錯、每一題都乖乖訂正——最後還是順利畢業了。', en: 'For one whole round it got every question wrong and dutifully corrected every one — and still graduated in the end.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.allWrong && d.n >= 6; }
    },
    {
      id: 'perceptron-h8', level: 7, hidden: true,
      riddle: { zh: '還沒開始學，結局就已經被一條不等式寫死了。', en: 'Before learning even began, an inequality had already written the ending.' },
      check: function (ev) { const d = ev.data; return learned(ev) && twoSides(d, 3) && d.bound < 2 - 1e-6; }
    },
    {
      id: 'perceptron-h9', level: 9, hidden: true,
      riddle: { zh: '定理許下的最壞情況，一分不少地兌現了。', en: 'The worst case the theorem promised came true, down to the very last step.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.zeroInit && twoSides(d, 1) && d.updates >= 2 && Math.abs(d.updates - d.bound) <= 1e-6 * d.bound; }
    },
    {
      id: 'perceptron-h10', level: 10, hidden: true,
      riddle: { zh: '誤打誤撞，它竟然走在最寬那條路的正中央。', en: 'By sheer luck, it ended up walking down the very middle of the widest road.' },
      check: function (ev) { const d = ev.data; return learned(ev) && d.n >= 6 && twoSides(d, 3) && d.updates >= 3 && d.ratio >= 0.99; }
    }
  ]);
})();
