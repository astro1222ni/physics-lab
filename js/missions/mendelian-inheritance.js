/* missions/mendelian-inheritance.js — 孟德爾遺傳的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件：'sow'（產生一批子代後）、'guess'（神秘豌豆提交答案）、'reset'（全部清除，或勾選「每一批先清除」時每一批之前）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 孟德爾雙性狀數據 315：108：101：32 與 9:3:3:1 的卡方值（核心單元測試核對過：0.470024…）
  const MENDEL_DI_CHI2 = 0.4700239808153477;
  const isSow = function (ev) { return ev.type === 'sow' && !ev.data.mystery; };
  const allOne = function (g) { return g.every(function (k) { return k === 1; }); };
  const allIs = function (g, v) { return g.every(function (k) { return k === v; }); };
  const shapeColor = function (d) { return d.L === 2 && d.traits.indexOf('shape') >= 0 && d.traits.indexOf('color') >= 0; };

  LabMission.register('mendelian-inheritance', [
    {
      id: 'mendelian-inheritance-1', level: 1,
      title: { zh: '第一顆豌豆', en: 'The first pea' },
      desc: { zh: '讓兩株豌豆雜交，產生第一個子代。看看卵細胞與精細胞這兩種配子怎麼結合。', en: 'Cross two pea plants and produce your first offspring. Watch how the two gametes, an egg cell and a sperm cell, join.' },
      check: function (ev) { return ev.type === 'sow' && ev.data.N >= 1; }
    },
    {
      id: 'mendelian-inheritance-2', level: 2,
      title: { zh: '子一代都一樣', en: 'The F1 are all alike' },
      desc: { zh: '讓兩個純種雜交（每一對基因都是顯性同型合子 × 隱性同型合子），產生至少 10 個子一代。它們的表現型有什麼共同點？', en: 'Cross two true-breeding plants (homozygous dominant × homozygous recessive for every gene) and produce at least 10 F1 offspring. What do they all have in common?' },
      check: function (ev) { return isSow(ev) && ev.data.kind === 'P' && ev.data.N >= 10; }
    },
    {
      id: 'mendelian-inheritance-3', level: 2,
      title: { zh: '隱性回來了', en: 'The recessive returns' },
      desc: { zh: '單性狀：讓子一代自交（Aa × Aa），在子二代裡找到隱性表現型的個體——子一代裡明明看不到它。', en: 'One trait: self the F1 (Aa × Aa) and find an offspring with the recessive phenotype in the F2 — even though none of the F1 showed it.' },
      check: function (ev) { const d = ev.data; return isSow(ev) && d.L === 1 && d.kind === 'F2' && d.pheno[1] >= 1; }
    },
    {
      id: 'mendelian-inheritance-4', level: 3,
      title: { zh: '三比一', en: 'Three to one' },
      desc: { zh: '單性狀子二代（Aa × Aa）累積至少 400 個子代，並讓卡方檢定的 p 值大於 0.05（觀察值與 3:1 沒有顯著差異）。', en: 'Grow at least 400 F2 offspring for one trait (Aa × Aa) with a chi-square p-value above 0.05 (no significant departure from 3:1).' },
      check: function (ev) { const d = ev.data; return isSow(ev) && d.L === 1 && d.kind === 'F2' && d.N >= 400 && d.p > 0.05; }
    },
    {
      id: 'mendelian-inheritance-5', level: 4,
      title: { zh: '試交的一比一', en: 'One to one in a test cross' },
      desc: { zh: '單性狀試交（Aa × aa）累積至少 300 個子代，讓顯性與隱性個體數的比落在 0.95 到 1.05 之間。', en: 'In a one-trait test cross (Aa × aa), grow at least 300 offspring with a dominant : recessive count ratio between 0.95 and 1.05.' },
      check: function (ev) {
        const d = ev.data;
        if (!(isSow(ev) && d.L === 1 && d.kind === 'test' && d.N >= 300 && d.pheno[1] > 0)) return false;
        const r = d.pheno[0] / d.pheno[1];
        return r >= 0.95 && r <= 1.05;
      }
    },
    {
      id: 'mendelian-inheritance-6', level: 5,
      title: { zh: '小樣本會騙人', en: 'Small samples can fool you' },
      desc: { zh: '單性狀子二代（Aa × Aa）至少 8 個子代，結果隱性個體的數目卻不少於顯性——理論上只佔 1/4 的隱性，在小樣本裡也可能「超車」。', en: 'Grow at least 8 F2 offspring for one trait (Aa × Aa) and end up with at least as many recessive as dominant ones — in a small sample the expected 1/4 can overtake the 3/4.' },
      check: function (ev) { const d = ev.data; return isSow(ev) && d.L === 1 && d.kind === 'F2' && d.N >= 8 && d.pheno[1] >= d.pheno[0]; }
    },
    {
      id: 'mendelian-inheritance-7', level: 5,
      title: { zh: '九比三比三比一', en: 'Nine, three, three, one' },
      desc: { zh: '雙性狀子二代（AaBb × AaBb）累積至少 556 個子代（和孟德爾數的一樣多），並讓卡方檢定的 p 值大於 0.05。', en: 'Grow at least 556 F2 offspring for two traits (AaBb × AaBb) — as many as Mendel counted — with a chi-square p-value above 0.05.' },
      check: function (ev) { const d = ev.data; return isSow(ev) && d.L === 2 && d.kind === 'F2' && d.N >= 556 && d.p > 0.05; }
    },
    {
      id: 'mendelian-inheritance-8', level: 6,
      title: { zh: '獨立分配', en: 'Independent assortment' },
      desc: { zh: '雙性狀試交（AaBb × aabb）累積至少 400 個子代，四種表現型每一種都佔 22% 到 28%。這說明雙異型合子產生了哪幾種配子？', en: 'In a two-trait test cross (AaBb × aabb), grow at least 400 offspring with each of the four phenotypes between 22% and 28%. What gametes did the double heterozygote make?' },
      check: function (ev) {
        const d = ev.data;
        if (!(isSow(ev) && d.L === 2 && d.kind === 'test' && d.N >= 400)) return false;
        if (!(allOne(d.g1) || allOne(d.g2))) return false;
        return d.pheno.every(function (c) { return c / d.N >= 0.22 && c / d.N <= 0.28; });
      }
    },
    {
      id: 'mendelian-inheritance-9', level: 7,
      title: { zh: '豌豆偵探', en: 'Pea detective' },
      desc: { zh: '單性狀的神秘豌豆是顯性表現型。讓它與隱性同型合子試交，第一次提交就判斷對它的基因型。判斷要有根據：判成異型合子要看過隱性子代；判成同型合子要至少 8 個子代都是顯性。', en: 'The one-trait mystery pea shows the dominant phenotype. Test-cross it with a homozygous recessive and get its genotype right on your first answer. Back it up: call it heterozygous only after seeing a recessive offspring, homozygous only after at least 8 offspring that are all dominant.' },
      check: function (ev) { const d = ev.data; return ev.type === 'guess' && d.L === 1 && d.first && d.correct && d.partnerRec && d.justified; }
    },
    {
      id: 'mendelian-inheritance-10', level: 8,
      title: { zh: '雙性狀偵探', en: 'Two-trait detective' },
      desc: { zh: '雙性狀的神秘豌豆兩個性狀都是顯性。用試交（另一個親本 aabb），第一次提交就判斷對兩對基因（判斷要有根據，規則同「豌豆偵探」）。', en: 'The two-trait mystery pea is dominant for both traits. Test-cross it (other parent aabb) and get both genes right on your first answer (backed up by the same rule as “Pea detective”).' },
      check: function (ev) { const d = ev.data; return ev.type === 'guess' && d.L === 2 && d.first && d.correct && d.partnerRec && d.justified; }
    },
    {
      id: 'mendelian-inheritance-11', level: 9,
      title: { zh: '比孟德爾更準', en: 'Closer than Mendel' },
      desc: { zh: '用種子形狀與子葉顏色做雙性狀子二代，累積至少 556 個子代，讓卡方值比孟德爾的 0.470 還小。這種好運氣有多少機率？', en: 'With seed shape and cotyledon colour, grow at least 556 F2 offspring whose chi-square is smaller than Mendel’s 0.470. How likely is that much luck?' },
      check: function (ev) {
        const d = ev.data;
        return isSow(ev) && d.L === 2 && d.kind === 'F2' && d.traits.indexOf('shape') >= 0 && d.traits.indexOf('color') >= 0 &&
          d.N >= 556 && d.chi2 < MENDEL_DI_CHI2;
      }
    },
    {
      id: 'mendelian-inheritance-12', level: 10,
      title: { zh: '大師：一眼看穿', en: 'Master: seeing straight through' },
      desc: { zh: '連續 3 個雙性狀神秘豌豆，都用試交在 10 個子代以內、第一次提交就判斷正確，而且每次都有根據（規則同「豌豆偵探」）。中途判斷錯一次就重新計算。', en: 'Solve 3 two-trait mystery peas in a row by test cross, each on your first answer, using no more than 10 offspring and backed up every time (same rule as “Pea detective”). One wrong answer resets the count.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'guess' || d.L !== 2 || !d.first) return false;
        mem.streak = (d.correct && d.partnerRec && d.justified && d.N <= 10) ? (mem.streak || 0) + 1 : 0;
        return mem.streak >= 3;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'mendelian-inheritance-h1', level: 5, hidden: true,
      riddle: { zh: '命運偶爾也照著劇本走，一字不差。', en: 'Now and then fate follows the script, word for word.' },
      check: function (ev) {
        const d = ev.data, w = [9, 3, 3, 1];
        return isSow(ev) && d.L === 2 && d.kind === 'F2' && d.N >= 16 && d.N % 16 === 0 &&
          d.pheno.every(function (c, i) { return c * 16 === d.N * w[i]; });
      }
    },
    {
      id: 'mendelian-inheritance-h2', level: 6, hidden: true,
      riddle: { zh: '明明說的是實話，卻沒有人相信；你沒有改口，只是繼續說下去。', en: 'You told the truth and no one believed you; you did not change your story, you just kept on telling it.' },
      // 型一錯誤：單性狀、假說為真（子二代或試交），同一輪先在 N ≥ 200 被卡方檢定拒絕（p < 0.05），
      // 不清除、繼續產生子代到被拒絕時的兩倍以上，p 回到 0.5 以上。只限單性狀，做雙性狀任務（例如「比孟德爾更準」）時不會順手完成。
      check: function (ev, mem) {
        if (ev.type === 'reset') { mem.rej = 0; mem.key = ''; mem.lastN = 0; return false; }
        if (!isSow(ev)) return false;
        const d = ev.data;
        const key = d.L + '|' + d.kind + '|' + d.g1.join('') + '|' + d.g2.join('') + '|' + d.traits.join(',');
        if (key !== mem.key || d.N < (mem.lastN || 0)) { mem.key = key; mem.rej = 0; }
        mem.lastN = d.N;
        if (d.L !== 1 || (d.kind !== 'F2' && d.kind !== 'test') || d.impossible || !(d.df >= 1)) return false;
        if (!mem.rej) { if (d.N >= 200 && d.p < 0.05) mem.rej = d.N; return false; }
        return d.N >= 2 * mem.rej && d.p > 0.5;
      }
    },
    {
      id: 'mendelian-inheritance-h3', level: 7, hidden: true,
      riddle: { zh: '修道院的花園裡，八個夏天數過的豆子，又被你數了一遍。', en: 'In a monastery garden, the peas of eight summers — and you counted them all over again.' },
      check: function (ev) {
        const d = ev.data;
        return isSow(ev) && d.L === 1 && d.kind === 'F2' && ((d.traits[0] === 'shape' && d.N === 7324) || (d.traits[0] === 'color' && d.N === 8023));
      }
    },
    {
      // 一個反例推翻假說，立刻修正：單性狀神秘豌豆、試交，假說設成同型合子時第 1 個子代就是隱性（假說被推翻），
      // 接著不再產生子代、改判異型合子，第一次提交就答對。
      id: 'mendelian-inheritance-h4', level: 4, hidden: true,
      riddle: { zh: '一隻黑天鵝就夠了：你一看見牠，就改口，而且說對了。', en: 'One black swan is enough: the moment you saw it, you changed your answer — and you were right.' },
      check: function (ev, mem) {
        if (ev.type === 'reset') { mem.swan = false; return false; }
        const d = ev.data;
        if (ev.type === 'sow') {
          mem.swan = !!(d.mystery && d.L === 1 && d.N === 1 && d.impossible && d.g1[0] === 2 && allIs(d.g2, 0));
          return false;
        }
        if (ev.type !== 'guess') return false;
        const ok = mem.swan && d.L === 1 && d.first && d.correct && d.guess[0] === 1 && d.N === 1 && d.partnerRec && d.justified;
        mem.swan = false;
        return !!ok;
      }
    },
    {
      // 獨立分配產生新組合：雙性狀、親代是「一顯一隱 × 一隱一顯」的純種（例如 RRyy × rrYY），
      // 再讓子一代自交，子二代出現兩個祖父母都沒有的組合（顯顯與隱隱）。
      id: 'mendelian-inheritance-h5', level: 3, hidden: true,
      riddle: { zh: '祖父母誰也沒有的模樣，卻在孫輩裡冒了出來。', en: 'A look that neither grandparent had turns up among the grandchildren.' },
      check: function (ev, mem) {
        if (!isSow(ev)) return false;
        const d = ev.data;
        if (d.L !== 2) return false;
        const key = d.traits.join(',');
        if (d.kind === 'P' && d.g1[0] !== d.g1[1]) { mem.pk = key; return false; }
        return d.kind === 'F2' && mem.pk === key && d.pheno[0] >= 1 && d.pheno[3] >= 1;
      }
    },
    {
      // 一個子代就解開雙性狀神秘豌豆：試交第 1 個子代就是雙隱性，兩對基因同時證明是異型合子。
      id: 'mendelian-inheritance-h6', level: 6, hidden: true,
      riddle: { zh: '兩個謎，一顆豆子就全部解開。', en: 'Two riddles, and a single pea answers both.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'guess' && d.L === 2 && d.first && d.correct && d.partnerRec && d.justified && d.N === 1;
      }
    },
    {
      // 大數法則：雙性狀子二代累積到上限 20 000 個，四種表現型的比例都在 9/16、3/16、3/16、1/16 的 ±0.5 個百分點內。
      id: 'mendelian-inheritance-h7', level: 7, hidden: true,
      riddle: { zh: '兩萬顆豆子之後，偶然終於安靜下來：四種模樣，每一種都只差半步。', en: 'After twenty thousand peas, chance finally falls quiet: all four kinds, each within half a step.' },
      check: function (ev) {
        const d = ev.data, w = [9, 3, 3, 1];
        return isSow(ev) && d.L === 2 && d.kind === 'F2' && d.N === 20000 &&
          d.pheno.every(function (c, i) { return Math.abs(c / d.N - w[i] / 16) <= 0.005 + 1e-12; });
      }
    },
    {
      // 孟德爾另外兩個單性狀實驗：花色（種皮顏色）子二代 929 株、莖的高度子二代 1064 株，同一次造訪都重數一遍。
      id: 'mendelian-inheritance-h8', level: 8, hidden: true,
      riddle: { zh: '花園裡還有兩本帳：一本記花，一本記莖。把兩本都重數一遍。', en: 'The garden kept two more ledgers, one for flowers and one for stems. Count them both again.' },
      check: function (ev, mem) {
        if (!isSow(ev)) return false;
        const d = ev.data;
        if (d.L === 1 && d.kind === 'F2') {
          if (d.traits[0] === 'flower' && d.N === 929) mem.fl = true;
          if (d.traits[0] === 'height' && d.N === 1064) mem.ht = true;
        }
        return !!(mem.fl && mem.ht);
      }
    },
    {
      // 孟德爾的正反試交：RrYy ♀ × rryy ♂ 共 110 粒、rryy ♀ × RrYy ♂ 共 98 粒（種子形狀 × 子葉顏色），兩組都做。
      id: 'mendelian-inheritance-h9', level: 9, hidden: true,
      riddle: { zh: '同一場婚禮辦了兩次，新娘與新郎交換位置；兩次請來的賓客，都和當年一樣多。', en: 'The same wedding was held twice, with bride and groom swapping places — and both times exactly as many guests came as long ago.' },
      check: function (ev, mem) {
        if (!isSow(ev)) return false;
        const d = ev.data;
        if (shapeColor(d) && d.kind === 'test') {
          if (allIs(d.g1, 1) && allIs(d.g2, 0) && d.N === 110) mem.a = true;
          if (allIs(d.g1, 0) && allIs(d.g2, 1) && d.N === 98) mem.b = true;
        }
        return !!(mem.a && mem.b);
      }
    },
    {
      // 孟德爾的正反回交：RrYy ♀ × RRYY ♂ 種出 90 株、RRYY ♀ × RrYy ♂ 種出 87 株；種子全是圓黃，
      // 要看基因型長條圖才分得出四種。兩組都做，而且都在看基因型時完成。
      id: 'mendelian-inheritance-h10', level: 10, hidden: true,
      riddle: { zh: '豆子全都一個樣子；修道士隔年把它們種下，才看出四種。他做了兩次，母親與父親交換。', en: 'Every seed looked the same; only when the friar sowed them the next year did four kinds appear. He did it twice, with mother and father swapped.' },
      check: function (ev, mem) {
        if (!isSow(ev)) return false;
        const d = ev.data;
        if (shapeColor(d) && d.gchart) {
          if (allIs(d.g1, 1) && allIs(d.g2, 2) && d.N === 90) mem.a = true;
          if (allIs(d.g1, 2) && allIs(d.g2, 1) && d.N === 87) mem.b = true;
        }
        return !!(mem.a && mem.b);
      }
    }
  ]);
})();
