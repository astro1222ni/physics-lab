/* missions/hardy-weinberg.js — 哈溫平衡、遺傳漂變與天擇的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/hardy-weinberg.js 送出）：
 *   'gen'：第一部分每按一次「下一代」或「跑 10 代」。gen（現在第幾代）、steps（這次走幾代）、start、g、prev（基因型 [AA, Aa, aa]）、
 *          sigma（這次的自花授粉比例）、sigMin、sigMax（從第 0 代起用過的最小與最大 σ）、dev（|D − p²|）、devStart、H0、H、F、Fstart、Feq（σ/(2 − σ)）、p
 *   'test'：第一部分抽樣檢定。gen、sigma、n、obs、chi2、pval、reject（P < 0.05）、F（族群真正的 F）、dev（族群真正離哈溫多遠）、p、Fhat
 *   'drift'：第二部分跑完時（HWCore.summarize）。N、pops、p0、n0（起點 A 的份數）、gens、w、u、v、m、pm、neutral（沒有天擇、突變、遷移）、
 *            kind（'neutral'、'A'、'a'、'het'、'under'、'mixed'）、fixed、lost、seg、meanP、detP、H0、Hend、Hratio、Htheory、fixTime、
 *            uFix（木村的固定機率；有突變或遷移時 null）、pHat、lethalQ、mutSelQ
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const drift = function (ev) { return ev.type === 'drift'; };
  const pure = function (d) { return !(d.u > 0) && !(d.v > 0) && !(d.m > 0); };

  LabMission.register('hardy-weinberg', [
    {
      id: 'hardy-weinberg-1', level: 1,
      title: { zh: '一代就平衡', en: 'Balanced in one generation' },
      desc: { zh: '從不在哈溫平衡的花圃出發，只讓它隨機交配一代，就到達哈溫平衡。', en: 'Start from a garden that is not in Hardy–Weinberg equilibrium, let it mate at random for just one generation, and reach the equilibrium.' },
      check: function (ev) { const d = ev.data; return ev.type === 'gen' && d.gen === 1 && d.sigMax === 0 && d.devStart >= 0.05 && d.dev < 1e-9; }
    },
    {
      id: 'hardy-weinberg-2', level: 2,
      title: { zh: '樣本合乎預期', en: 'The sample fits' },
      desc: { zh: '花圃處於哈溫平衡時，抽至少 100 株做卡方檢定，結果和哈溫平衡相符。', en: 'With the garden in Hardy–Weinberg equilibrium, sample at least 100 plants and get a χ² test consistent with the equilibrium.' },
      check: function (ev) { const d = ev.data; return ev.type === 'test' && d.n >= 100 && d.dev < 1e-9 && !d.reject; }
    },
    {
      id: 'hardy-weinberg-3', level: 3,
      title: { zh: '不是固定，就是消失', en: 'Fixed or lost' },
      desc: { zh: '至少 10 個中性的族群（沒有天擇、突變、遷移）一起演化，最後至少一個族群 A 固定、至少一個族群 A 消失。', en: 'Evolve at least 10 neutral populations (no selection, mutation or migration) until A is fixed in at least one and lost in at least one.' },
      check: function (ev) { const d = ev.data; return drift(ev) && d.neutral && d.pops >= 10 && d.fixed >= 1 && d.lost >= 1; }
    },
    {
      id: 'hardy-weinberg-4', level: 3,
      title: { zh: '自花授粉', en: 'Self-pollination' },
      desc: { zh: '從粉紅花至少占 20% 的花圃出發，一直完全自花授粉（σ = 100%），讓粉紅花少到不超過起始的八分之一。', en: 'Start with at least 20% pink plants and keep the garden fully self-pollinating (σ = 100%) until the pink plants are at most an eighth of what they were.' },
      check: function (ev) { const d = ev.data; return ev.type === 'gen' && d.sigMin >= 1 && d.gen >= 3 && d.H0 >= 0.2 && d.H <= d.H0 / 8 + 1e-12; }
    },
    {
      id: 'hardy-weinberg-5', level: 4,
      title: { zh: '自交與雜交的拉鋸', en: 'A tug of war' },
      desc: { zh: '讓一部分種子自花授粉（0 < σ < 100%，平衡的 F 至少 0.1），σ 從頭到尾不變，至少 10 代後近親交配係數 F 停在 σ/(2 − σ) 附近（相差小於 0.005），而且和起點的 F 不一樣。', en: 'Let part of the seeds self (0 < σ < 100%, equilibrium F at least 0.1), keep σ the same from the start, and after at least 10 generations have F settle within 0.005 of σ/(2 − σ), away from where it started.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'gen' && d.sigMin === d.sigMax && d.sigma > 0 && d.sigma < 1 && d.Feq >= 0.1 && d.gen >= 10 && Math.abs(d.F - d.Feq) < 0.005 && Math.abs(d.Fstart - d.Feq) >= 0.05;
      }
    },
    {
      id: 'hardy-weinberg-6', level: 4,
      title: { zh: '抓到一點點不平衡', en: 'A slight imbalance caught' },
      desc: { zh: '花圃只稍微偏離哈溫平衡（近親交配係數 F 在 0.1 到 0.35 之間），抽不超過 300 株，卡方檢定就拒絕了哈溫平衡。', en: 'With the garden only slightly out of equilibrium (inbreeding coefficient F between 0.1 and 0.35), sample at most 300 plants and have the χ² test reject Hardy–Weinberg.' },
      check: function (ev) { const d = ev.data; return ev.type === 'test' && d.reject && d.n <= 300 && d.F >= 0.1 && d.F <= 0.35; }
    },
    {
      id: 'hardy-weinberg-7', level: 5,
      title: { zh: '漂變的速度', en: 'How fast drift works' },
      desc: { zh: '至少 20 個中性族群、每個不超過 25 個個體，起點的異型合子度至少 0.3，跑到理論上只剩 60% 以下的異型合子度；模擬的平均和漂變公式的理論值相差不到 15%。', en: 'Evolve at least 20 neutral populations of at most 25 individuals, starting with heterozygosity at least 0.3, until theory leaves less than 60% of it; the simulated mean must be within 15% of the drift formula.' },
      check: function (ev) {
        const d = ev.data;
        return drift(ev) && d.neutral && d.pops >= 20 && d.N <= 25 && d.H0 >= 0.3 && d.Htheory <= 0.6 && d.Hratio != null && Math.abs(d.Hratio / d.Htheory - 1) <= 0.15;
      }
    },
    {
      id: 'hardy-weinberg-8', level: 5,
      title: { zh: '天擇的力量', en: 'The power of selection' },
      desc: { zh: '讓 A 有利（w_AA ≥ w_Aa ≥ w_aa，而且 w_AA > w_aa），每個族群至少 1000 個個體、起始 p0 不超過 0.1、沒有突變與遷移，最後 A 的平均頻率至少 0.9。', en: 'Favour A (w_AA ≥ w_Aa ≥ w_aa with w_AA > w_aa), with at least 1000 individuals per population, p0 at most 0.1 and no mutation or migration, until the mean frequency of A is at least 0.9.' },
      check: function (ev) { const d = ev.data; return drift(ev) && d.kind === 'A' && d.w[0] > d.w[2] && d.N >= 1000 && d.p0 <= 0.1 && pure(d) && d.meanP >= 0.9; }
    },
    {
      id: 'hardy-weinberg-9', level: 6,
      title: { zh: '頑強的隱性致死基因', en: 'A stubborn recessive lethal' },
      desc: { zh: 'aa 致死（w_aa = 0、w_AA = w_Aa），a 的起始頻率至少 0.5，每個族群至少 3000 個個體，跑至少 50 代、沒有突變與遷移：最後 a 的平均頻率和 q0/(1 + t·q0) 相差不到 12%，而且還沒低於 0.01。', en: 'Make aa lethal (w_aa = 0, w_AA = w_Aa), start with a at least 0.5, at least 3000 individuals per population, at least 50 generations and no mutation or migration: the final mean frequency of a must be within 12% of q0/(1 + t·q0) and still at least 0.01.' },
      check: function (ev) {
        const d = ev.data;
        if (!(drift(ev) && d.lethalQ != null && pure(d) && d.p0 <= 0.5 && d.N >= 3000 && d.gens >= 50)) return false;
        const q = 1 - d.meanP;
        return q >= 0.01 && Math.abs(q / d.lethalQ - 1) <= 0.12;
      }
    },
    {
      id: 'hardy-weinberg-10', level: 7,
      title: { zh: '兩種都留下來', en: 'Both alleles stay' },
      desc: { zh: '讓異型合子 Aa 最有利，每個族群至少 500 個個體，起始 p0 離平衡點 p̂ 至少 0.2、沒有突變與遷移：最後每個族群都還有兩種對偶基因，A 的平均頻率在 p̂ 的 0.03 以內。', en: 'Give the heterozygote Aa the highest fitness, at least 500 individuals per population, p0 at least 0.2 away from the equilibrium p̂ and no mutation or migration: at the end every population still has both alleles and the mean frequency of A is within 0.03 of p̂.' },
      check: function (ev) {
        const d = ev.data;
        return drift(ev) && d.kind === 'het' && d.pHat != null && pure(d) && d.N >= 500 && Math.abs(d.p0 - d.pHat) >= 0.2 && d.seg === d.pops && Math.abs(d.meanP - d.pHat) <= 0.03;
      }
    },
    {
      id: 'hardy-weinberg-11', level: 8,
      title: { zh: '突變與天擇的平衡', en: 'Mutation meets selection' },
      desc: { zh: '讓 aa 不利（w_AA = w_Aa，w_aa 至少低 10%），只有 A → a 的突變、沒有遷移，至少 10 個族群、每個至少 2000 個個體，從幾乎沒有 a（p0 ≥ 0.99）出發跑至少 300 代：最後 a 的平均頻率和 √(u/s) 相差不到 25%。', en: 'Make aa less fit (w_AA = w_Aa, w_aa at least 10% lower), allow only A → a mutation and no migration, with at least 10 populations of at least 2000 individuals: start with almost no a (p0 ≥ 0.99) and run at least 300 generations. The final mean frequency of a must be within 25% of √(u/s).' },
      check: function (ev) {
        const d = ev.data;
        if (!(drift(ev) && d.mutSelQ != null && !(d.v > 0) && !(d.m > 0) && d.pops >= 10 && d.N >= 2000 && d.p0 >= 0.99 && d.gens >= 300)) return false;
        if (1 - d.w[2] / d.w[0] < 0.1) return false;
        return Math.abs((1 - d.meanP) / d.mutSelQ - 1) <= 0.25;
      }
    },
    {
      id: 'hardy-weinberg-12', level: 10,
      title: { zh: '木村的機會之窗', en: 'Kimura’s window of chance' },
      desc: { zh: '讓 A 有利，在至少 100 個族群裡都只放「一份」A（2N 個基因中只有 1 個），沒有突變與遷移，跑到至少 95% 的族群分出勝負：A 勝出的比例和木村的固定機率相差不超過 3 個標準差，而且這個機率至少是中性突變 1/(2N) 的 3 倍。', en: 'Favour A and give it a single copy (1 of the 2N genes) in each of at least 100 populations, with no mutation or migration, and run until at least 95% are settled: the share in which A wins must be within 3 standard deviations of Kimura’s fixation probability, which must be at least 3 times the neutral 1/(2N).' },
      check: function (ev) {
        const d = ev.data;
        if (!(drift(ev) && d.kind === 'A' && d.w[0] > d.w[2] && d.n0 === 1 && d.pops >= 100 && pure(d) && d.uFix != null)) return false;
        if ((d.fixed + d.lost) / d.pops < 0.95 || d.fixed < 1 || d.uFix < 3 / (2 * d.N)) return false;
        const sd = Math.sqrt(d.uFix * (1 - d.uFix) / d.pops);
        return Math.abs(d.fixed / d.pops - d.uFix) <= 3 * sd + 0.5 / d.pops;
      }
    },
    {
      id: 'hardy-weinberg-h1', level: 5, hidden: true,
      riddle: { zh: '一點點往來，就把大家拉在一起。', en: 'A little coming and going holds everyone together.' },
      check: function (ev) {
        const d = ev.data;
        return drift(ev) && d.kind === 'neutral' && !(d.u > 0) && !(d.v > 0) && d.m > 0 && d.N <= 100 && d.N * d.m >= 1 && d.pops >= 10 && d.gens >= 200 &&
          Math.abs(d.p0 - d.pm) >= 0.2 && d.seg === d.pops && Math.abs(d.meanP - d.pm) <= 0.1;
      }
    },
    {
      id: 'hardy-weinberg-h2', level: 6, hidden: true,
      riddle: { zh: '最適合的，也不一定留得下來。', en: 'The fittest does not always stay.' },
      check: function (ev) { const d = ev.data; return drift(ev) && d.kind === 'A' && d.w[0] >= 1.1 * d.w[2] && d.w[2] > 0 && d.N >= 20 && d.p0 >= 0.05 && pure(d) && d.lost >= 1; }
    },
    {
      id: 'hardy-weinberg-h3', level: 4, hidden: true,
      riddle: { zh: '全班都是混血兒，下一代卻有一半是純種。', en: 'Every parent was a blend, yet half the children breed true.' },
      check: function (ev) { const d = ev.data; return ev.type === 'gen' && d.gen === 1 && d.sigMax === 0 && d.H0 >= 0.99; }
    }
  ]);
})();
