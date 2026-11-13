/* missions/gene-expression.js — DNA 複製、轉錄與轉譯的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/gene-expression.js 送出）：
 *   'gene'：每改一次序列（替換、插入、刪除、復原、還原、輸入新序列）。preset（hbb／demo／custom）、seq、len、
 *           kind（none／noncoding／silent／missense／nonsense／frameshift／inframe／readthrough／lost-start／gained-start／complex）、
 *           nEdits、nSub、hasIns、hasDel、idGap（插入與刪除在原本序列上相隔幾個鹼基，沒有是 −1）、editKinds、delLen（刪掉的鹼基總數）、
 *           pRef、pMut（原本與現在的蛋白質，單字母，不含終止）、dAA（不同的胺基酸數＋長度差）、stopped、fwd、rev（兩股各自讀出的蛋白質，沒有是 null）、
 *           pal（序列等於自己的反向互補）、oneDel（剛好少一個胺基酸）
 *   'translate'：轉錄＋轉譯完成（或按「直接看結果」）。preset、seq、protein、stopped、hasOrf、kind、target（目前的目標胜肽）、match
 *   'ms-spin'：離心一次。n（代數）、denat（是否先加熱分成單股）
 *   'ms-elim'：按「排除」。model（semi／cons／disp）、valid（離心過的試管真的和它不合）、obs（所有離心過的 {n, denat}）、elim（目前排除的狀態）
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  function gene(ev) { return ev.type === 'gene' ? ev.data : null; }

  LabMission.register('gene-expression', [
    {
      id: 'gene-expression-1', level: 1,
      title: { zh: '第一條蛋白質', en: 'Your first protein' },
      desc: { zh: '讓核糖體讀到終止密碼子，做出一條完整的蛋白質（按「轉錄＋轉譯」或「直接看結果」）。', en: 'Let a ribosome reach a stop codon and make a complete protein (press “Transcribe and translate” or “Skip to the end”).' },
      check: function (ev) { return ev.type === 'translate' && ev.data.hasOrf && ev.data.stopped && ev.data.protein.length >= 1; }
    },
    {
      id: 'gene-expression-2', level: 2,
      title: { zh: '改了卻沒變', en: 'Changed, yet the same' },
      desc: { zh: '在讀碼框裡替換一個鹼基，但做出來的蛋白質完全不變（同義突變）。', en: 'Substitute a base inside the reading frame without changing the protein at all (a synonymous mutation).' },
      check: function (ev) { const d = gene(ev); return !!d && d.kind === 'silent' && d.nSub >= 1 && !d.hasIns && !d.hasDel; }
    },
    {
      id: 'gene-expression-3', level: 2,
      title: { zh: '鐮刀型紅血球', en: 'Sickle cell' },
      desc: { zh: '在 β 血紅素基因只換一個鹼基，讓第 7 個胺基酸從麩胺酸（Glu）變成纈胺酸（Val）。', en: 'In the β-globin gene, change a single base so that amino acid 7 turns from glutamic acid (Glu) into valine (Val).' },
      check: function (ev) {
        const d = gene(ev);
        return !!d && d.preset === 'hbb' && d.kind === 'missense' && d.nEdits === 1 && d.nSub === 1 && d.pRef[6] === 'E' && d.pMut[6] === 'V';
      }
    },
    {
      id: 'gene-expression-4', level: 3,
      title: { zh: '提早下車', en: 'Getting off early' },
      desc: { zh: '只換一個鹼基，讓某個密碼子變成終止密碼子，蛋白質提早結束（無意義突變）。', en: 'Change a single base so that a codon becomes a stop codon and the protein ends early (a nonsense mutation).' },
      check: function (ev) { const d = gene(ev); return !!d && d.kind === 'nonsense' && d.nEdits === 1; }
    },
    {
      id: 'gene-expression-5', level: 2,
      title: { zh: '全部錯開', en: 'Everything shifts' },
      desc: { zh: '在讀碼框裡插入或刪除鹼基，讓後面至少 5 個胺基酸都改變（移碼突變）。', en: 'Insert or delete bases inside the reading frame so that at least 5 amino acids after it change (a frameshift).' },
      check: function (ev) { const d = gene(ev); return !!d && d.kind === 'frameshift' && d.dAA >= 5; }
    },
    {
      id: 'gene-expression-6', level: 3,
      title: { zh: '第一代就看出來', en: 'Seen in the first generation' },
      desc: { zh: '在 Meselson–Stahl 實驗中，用離心過的試管排除「全保留」假說。', en: 'In the Meselson–Stahl experiment, use the tubes you have spun to rule out the conservative hypothesis.' },
      check: function (ev) { return ev.type === 'ms-elim' && ev.data.model === 'cons' && ev.data.valid; }
    },
    {
      id: 'gene-expression-7', level: 4,
      title: { zh: '少了一個', en: 'One missing' },
      desc: { zh: '只刪除鹼基（共 3 個），讓蛋白質剛好少一個胺基酸，其他的都不變。', en: 'Delete bases only (three in total) so that the protein loses exactly one amino acid and nothing else changes.' },
      check: function (ev) { const d = gene(ev); return !!d && d.kind === 'inframe' && d.oneDel && d.hasDel && !d.hasIns && d.nSub === 0 && d.delLen === 3; }
    },
    {
      id: 'gene-expression-8', level: 5,
      title: { zh: '照單訂做', en: 'Made to order' },
      desc: { zh: '設計一段 DNA，轉錄＋轉譯後剛好做出「設計挑戰」的目標胜肽，並且在終止密碼子停下。', en: 'Design a DNA that, after transcription and translation, makes exactly the target peptide of the design challenge and stops at a stop codon.' },
      check: function (ev) { return ev.type === 'translate' && ev.data.match === true; }
    },
    {
      id: 'gene-expression-9', level: 5,
      title: { zh: 'Crick 的 +1 −1', en: 'Crick’s plus one, minus one' },
      desc: { zh: '在讀碼框裡插入一個鹼基、再在相隔至少 3 個鹼基的地方刪掉一個，讓讀碼框救回來：蛋白質長度不變，最多只有 4 個胺基酸不同。', en: 'Inside the reading frame, insert one base and delete one at least 3 bases away so that the frame is restored: the protein keeps its length and at most 4 amino acids differ.' },
      check: function (ev) {
        const d = gene(ev);
        return !!d && d.kind === 'inframe' && d.hasIns && d.hasDel && d.nSub === 0 && d.nEdits === 2 && d.idGap >= 3 &&
          d.stopped && d.pMut.length === d.pRef.length && d.dAA >= 1 && d.dAA <= 4;
      }
    },
    {
      id: 'gene-expression-10', level: 6,
      title: { zh: '不是混在一起', en: 'Not a mixture' },
      desc: { zh: '用離心過的試管排除「分散」假說。', en: 'Use the tubes you have spun to rule out the dispersive hypothesis.' },
      check: function (ev) { return ev.type === 'ms-elim' && ev.data.model === 'disp' && ev.data.valid; }
    },
    {
      id: 'gene-expression-11', level: 7,
      title: { zh: '一代就夠', en: 'One generation is enough' },
      desc: { zh: '只用第 0 代和第 1 代的試管（可以加熱分成單股），同時排除「全保留」和「分散」兩個假說。', en: 'Using only tubes from generations 0 and 1 (heated into single strands if you like), rule out both the conservative and the dispersive hypotheses.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'ms-elim' && d.valid && d.elim.cons && d.elim.disp && d.obs.length > 0 && d.obs.every(function (o) { return o.n <= 1; });
      }
    },
    {
      id: 'gene-expression-12', level: 9,
      title: { zh: '兩股都有話說', en: 'Both strands speak' },
      desc: { zh: '寫一段 DNA，編碼股和另一股（從它自己的 5′ 往 3′ 讀）都各自做出至少 6 個胺基酸、有終止密碼子的蛋白質。', en: 'Write a DNA in which the coding strand and the other strand (read from its own 5′ to 3′) each make a protein of at least 6 amino acids that ends at a stop codon.' },
      check: function (ev) { const d = gene(ev); return !!d && !!d.fwd && !!d.rev && d.fwd.length >= 6 && d.rev.length >= 6; }
    },
    {
      id: 'gene-expression-h1', level: 3, hidden: true,
      riddle: { zh: '沒有開頭，就沒有故事。', en: 'No beginning, no story.' },
      check: function (ev) { const d = gene(ev); return !!d && d.kind === 'lost-start' && d.nEdits === 1 && d.nSub === 1 && d.pRef.length >= 3; }
    },
    {
      id: 'gene-expression-h2', level: 4, hidden: true,
      riddle: { zh: '用生命的字母，拼出生命。', en: 'Spell life with the letters of life.' },
      check: function (ev) { const d = gene(ev); return !!d && d.pMut.indexOf('LIFE') >= 0; }
    },
    {
      id: 'gene-expression-h3', level: 5, hidden: true,
      riddle: { zh: '從哪一頭讀，都是同一句話。', en: 'Whichever end you start from, it says the same.' },
      check: function (ev) { const d = gene(ev); return !!d && d.pal && d.len >= 12; }
    }
  ]);
})();
