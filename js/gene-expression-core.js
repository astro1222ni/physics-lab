/* gene-expression-core.js — 中心法則與 DNA 複製的核心（與畫面分離，Node 可直接 require）
 *
 * 一、轉錄與轉譯
 *   編碼股（5'→3'）與模板股互補；mRNA 與編碼股相同、只是 T 換成 U。
 *   從第一個 AUG 開始，每三個鹼基一個密碼子，照標準遺傳密碼表翻成胺基酸，遇到終止密碼子（UAA、UAG、UGA）停下。
 *   突變分類：同義（沉默）、錯義、無意義（提早終止）、移碼、讀過終止密碼子（延長）、框內插入／缺失。
 *
 * 二、Meselson–Stahl 實驗（1958，PNAS 44:671）
 *   大腸桿菌先在 15N 培養很多代（DNA 全是重的），再移到 14N，每一代取樣用氯化銫密度梯度離心。
 *   三種假說的預測：半保留（第 1 代全是中間，之後中間 2/2^n、輕的其餘）、全保留（重的 1/2^n、輕的其餘）、
 *   分散（全部在同一條帶，含 15N 的比例 1/2^n）。
 *   浮力密度：14N DNA 約 1.710 g/cm³、15N DNA 約 1.724 g/cm³（Meselson 與 Stahl 1958），中間型約 1.717。
 *   加熱變性後分成單股：半保留的第 1 代會出現重的單股與輕的單股兩條帶，分散式只有一條（中間）。
 *   單股的密度比雙股高約 0.015 g/cm³（示意）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GeneCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 標準遺傳密碼表（mRNA 密碼子 → 單字母；* = 終止）
  const BASES = 'UCAG';
  const AA_STRING = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  const CODE = {};
  (function () {
    let k = 0;
    for (const a of BASES) for (const b of BASES) for (const c of BASES) CODE[a + b + c] = AA_STRING[k++];
  })();
  /** 胺基酸：三字母、中文、英文、性質（np 非極性、p 極性、+ 鹼性、- 酸性） */
  const AA = {
    A: ['Ala', '丙胺酸', 'alanine', 'np'], R: ['Arg', '精胺酸', 'arginine', '+'], N: ['Asn', '天冬醯胺', 'asparagine', 'p'],
    D: ['Asp', '天冬胺酸', 'aspartic acid', '-'], C: ['Cys', '半胱胺酸', 'cysteine', 'p'], Q: ['Gln', '麩醯胺酸', 'glutamine', 'p'],
    E: ['Glu', '麩胺酸', 'glutamic acid', '-'], G: ['Gly', '甘胺酸', 'glycine', 'np'], H: ['His', '組胺酸', 'histidine', '+'],
    I: ['Ile', '異白胺酸', 'isoleucine', 'np'], L: ['Leu', '白胺酸', 'leucine', 'np'], K: ['Lys', '離胺酸', 'lysine', '+'],
    M: ['Met', '甲硫胺酸', 'methionine', 'np'], F: ['Phe', '苯丙胺酸', 'phenylalanine', 'np'], P: ['Pro', '脯胺酸', 'proline', 'np'],
    S: ['Ser', '絲胺酸', 'serine', 'p'], T: ['Thr', '蘇胺酸', 'threonine', 'p'], W: ['Trp', '色胺酸', 'tryptophan', 'np'],
    Y: ['Tyr', '酪胺酸', 'tyrosine', 'p'], V: ['Val', '纈胺酸', 'valine', 'np'], '*': ['Stop', '終止', 'stop', 'stop']
  };
  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };

  function clean(s) { return String(s || '').toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, ''); }
  function complement(s) { return s.split('').map(function (b) { return COMP[b] || 'N'; }).join(''); }
  function revcomp(s) { return complement(s).split('').reverse().join(''); }
  function transcribe(coding) { return coding.replace(/T/g, 'U'); }
  function codonAA(codonDNAorRNA) { return CODE[codonDNAorRNA.replace(/T/g, 'U')] || '?'; }

  /** 從第一個 ATG 開始讀；回傳 {start, end（不含）, codons, protein（不含終止）, stopped, stopAt} 或 null（沒有 ATG） */
  function orf(dna) {
    const s = dna.indexOf('ATG');
    if (s < 0) return null;
    const codons = [];
    let p = '', stopped = false, i = s;
    for (; i + 3 <= dna.length; i += 3) {
      const c = dna.substr(i, 3), a = codonAA(c);
      codons.push(c);
      if (a === '*') { stopped = true; i += 3; break; }
      p += a;
    }
    return { start: s, end: stopped ? i : s + 3 * codons.length, codons: codons, protein: p, stopped: stopped, stopAt: stopped ? i - 3 : -1 };
  }
  function protein(dna) { const o = orf(dna); return o ? o.protein : ''; }

  /** 兩個蛋白質逐位比較 */
  function diffProtein(a, b) {
    const n = Math.min(a.length, b.length);
    let d = 0, first = -1;
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) { d++; if (first < 0) first = i; }
    return { diff: d, first: first, lenA: a.length, lenB: b.length };
  }

  /**
   * 突變分類。ref、mut 是編碼股；edits 是從 ref 到 mut 的編輯清單 [{kind: 'sub'|'ins'|'del', pos, len}]（pos 以 ref 為準）。
   * 回傳 {kind, inOrf, pRef, pMut, dAA, ...}
   *   kind：none（沒有改）、noncoding（改在讀碼框外，蛋白質不變）、silent、missense、nonsense、frameshift、readthrough、inframe、lost-start、complex
   */
  function classify(ref, mut, edits) {
    const o = orf(ref), o2 = orf(mut);
    const pRef = o ? o.protein : '', pMut = o2 ? o2.protein : '';
    const res = { pRef: pRef, pMut: pMut, kind: 'none', inOrf: false, dAA: 0, nEdits: edits.length };
    if (ref === mut) return res;
    if (!o) { res.kind = o2 ? 'gained-start' : 'noncoding'; return res; }
    const inOrf = function (e) { return e.pos >= o.start && e.pos < o.end; };
    res.inOrf = edits.some(inOrf);
    const d = diffProtein(pRef, pMut);
    res.dAA = d.diff + Math.abs(pRef.length - pMut.length);
    res.first = d.first;
    if (!o2 || o2.start !== o.start) { res.kind = res.inOrf ? 'lost-start' : 'complex'; return res; }
    if (!res.inOrf) { res.kind = pRef === pMut ? 'noncoding' : 'complex'; return res; }
    const subs = edits.filter(function (e) { return e.kind === 'sub'; });
    const indel = edits.reduce(function (s, e) { return s + (e.kind === 'ins' ? e.len : e.kind === 'del' ? -e.len : 0); }, 0);
    const hasIndel = edits.some(function (e) { return e.kind !== 'sub'; });
    if (hasIndel) {
      if (((indel % 3) + 3) % 3 !== 0) res.kind = 'frameshift';
      else res.kind = 'inframe';
      return res;
    }
    void subs;
    if (pRef === pMut) res.kind = 'silent';
    else if (pMut.length < pRef.length && pRef.indexOf(pMut) === 0) res.kind = 'nonsense';
    else if (pMut.length > pRef.length && pMut.indexOf(pRef) === 0) res.kind = 'readthrough';
    else if (pMut.length === pRef.length) res.kind = 'missense';
    else res.kind = 'complex';
    return res;
  }

  /** 雙股都讀：正向與反向（模板股的 5'→3'）各自第一個 ATG 開始、有終止密碼子的讀碼框 */
  function bothStrands(dna) {
    const f = orf(dna), r = orf(revcomp(dna));
    return {
      fwd: f && f.stopped ? f.protein : null,
      rev: r && r.stopped ? r.protein : null
    };
  }
  /** 一個胜肽的所有編碼數 */
  function synonymous(aa) { return Object.keys(CODE).filter(function (c) { return CODE[c] === aa; }); }
  function encodeCount(pep) { return pep.split('').reduce(function (n, a) { return n * synonymous(a).length; }, 1); }


  // ---------- 編輯紀錄：由「現在每個鹼基來自原本的第幾個」推回編輯清單 ----------
  /** src[i] = 現在第 i 個鹼基在原本序列的位置（插入的是 -1）；回傳 [{kind, pos, len}]（pos 以原本序列為準） */
  function editsFromMap(ref, cur, src) {
    const out = [], used = new Uint8Array(ref.length);
    let i = 0;
    while (i < cur.length) {
      if (src[i] < 0) {
        let j = i; while (j < cur.length && src[j] < 0) j++;
        let pos = ref.length;
        for (let k = j; k < cur.length; k++) if (src[k] >= 0) { pos = src[k]; break; }
        out.push({ kind: 'ins', pos: pos, len: j - i });
        i = j; continue;
      }
      used[src[i]] = 1;
      if (cur[i] !== ref[src[i]]) out.push({ kind: 'sub', pos: src[i], len: 1 });
      i++;
    }
    for (let k = 0; k < ref.length;) {
      if (used[k]) { k++; continue; }
      let j = k; while (j < ref.length && !used[j]) j++;
      out.push({ kind: 'del', pos: k, len: j - k });
      k = j;
    }
    return out.sort(function (a, b) { return a.pos - b.pos; });
  }
  /** 把 pMut 當成 pRef 少了恰好一個胺基酸？ */
  function oneAAdeleted(pRef, pMut) {
    if (pMut.length !== pRef.length - 1) return false;
    for (let k = 0; k < pRef.length; k++) if (pRef.slice(0, k) + pRef.slice(k + 1) === pMut) return true;
    return false;
  }
  function isPalindrome(s) { return s.length > 0 && s === revcomp(s); }

  // ---------- 亂數與目標胜肽 ----------
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const AA20 = 'ACDEFGHIKLMNPQRSTVWY';
  /** 目標胜肽：M 開頭，後面 len − 1 個隨機胺基酸 */
  function target(seed, len) {
    const r = rng(seed * 7919 + 13);
    let p = 'M';
    for (let i = 1; i < (len || 5); i++) p += AA20[Math.floor(r() * 20)];
    return p;
  }
  /** 用每個胺基酸第一個密碼子，寫出一個會產生 pep 的編碼股（含終止） */
  function encode(pep) {
    return pep.split('').map(function (a) { return synonymous(a)[0].replace(/U/g, 'T'); }).join('') + 'TAA';
  }

  // ---------- Meselson–Stahl ----------
  const RHO = { L: 1.710, H: 1.724, M: 1.717 };    // g/cm³
  const SS = 0.015;                                 // 單股比雙股重（示意）
  /**
   * 第 n 代（n = 0 是移到 14N 之前）的條帶：[{rho, frac, label}]
   * model：'semi'、'cons'、'disp'；denat：加熱變成單股
   */
  function bands(model, n, denat) {
    n = Math.max(0, Math.round(n));
    const h = Math.pow(2, -n);    // 15N 占所有股的比例
    if (!denat) {
      if (n === 0) return [{ rho: RHO.H, frac: 1, label: 'H' }];
      if (model === 'semi') return mergeB([{ rho: RHO.M, frac: 2 * h, label: 'M' }, { rho: RHO.L, frac: 1 - 2 * h, label: 'L' }]);
      if (model === 'cons') return mergeB([{ rho: RHO.H, frac: h, label: 'H' }, { rho: RHO.L, frac: 1 - h, label: 'L' }]);
      return [{ rho: RHO.L + (RHO.H - RHO.L) * h, frac: 1, label: 'D' }];
    }
    // 單股：半保留與全保留都是重的 h、輕的 1 − h；分散式每一股都是混合的
    if (model === 'disp') return [{ rho: RHO.L + SS + (RHO.H - RHO.L) * h, frac: 1, label: 'd' }];
    return mergeB([{ rho: RHO.H + SS, frac: h, label: 'h' }, { rho: RHO.L + SS, frac: 1 - h, label: 'l' }]);
  }
  function mergeB(list) { return list.filter(function (b) { return b.frac > 1e-12; }); }
  /** 兩組條帶是否相同（密度差 < 0.0015、比例差 < 0.02） */
  function sameBands(a, b) {
    if (a.length !== b.length) return false;
    const s = function (x) { return x.slice().sort(function (p, q) { return p.rho - q.rho; }); };
    const A = s(a), B2 = s(b);
    return A.every(function (x, i) { return Math.abs(x.rho - B2[i].rho) < 0.0015 && Math.abs(x.frac - B2[i].frac) < 0.02; });
  }
  /** 在第 n 代（是否變性）觀察到真實結果（半保留）後，哪些假說還說得通 */
  function consistent(n, denat) {
    const truth = bands('semi', n, denat);
    return { semi: true, cons: sameBands(bands('cons', n, denat), truth), disp: sameBands(bands('disp', n, denat), truth) };
  }
  /** 已觀察的結果 obs = [{n, denat}] 能不能排除某個假說（真正的情形是半保留） */
  function canEliminate(model, obs) {
    return obs.some(function (o) { return !sameBands(bands(model, o.n, o.denat), bands('semi', o.n, o.denat)); });
  }

  // β 血紅素（HBB）基因：5' 端非轉譯區的最後 12 個鹼基、編碼序列前 31 個密碼子（之後截掉，接上原本的終止密碼子 TAA）、3' 端非轉譯區的開頭 14 個鹼基
  const HBB = 'CAAACAGACACC' + 'ATGGTGCATCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGAACGTGGATGAAGTTGGTGGTGAGGCCCTGGGCAGG' + 'TAA' + 'GCTCGCTTTCTTGC';
  const DEMO = 'GCCATGGCTTGGAAACGTTAGGC';

  return {
    CODE: CODE, AA: AA, clean: clean, complement: complement, revcomp: revcomp, transcribe: transcribe, codonAA: codonAA,
    orf: orf, protein: protein, diffProtein: diffProtein, classify: classify, bothStrands: bothStrands,
    synonymous: synonymous, encodeCount: encodeCount,
    editsFromMap: editsFromMap, oneAAdeleted: oneAAdeleted, isPalindrome: isPalindrome, rng: rng, target: target, encode: encode,
    RHO: RHO, SS: SS, bands: bands, sameBands: sameBands, consistent: consistent, canEliminate: canEliminate, HBB: HBB, DEMO: DEMO
  };
});
