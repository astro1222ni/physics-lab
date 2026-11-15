/* 純前端推薦與本機紀錄；同輸入、同一天會得到同結果。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LabHomeCore = factory();
})(typeof window === 'undefined' ? this : window, function () {
  'use strict';
  const DAY = 86400000;
  function hash(s) { let n = 2166136261; for (let i = 0; i < s.length; i++) { n ^= s.charCodeAt(i); n = Math.imul(n, 16777619); } return n >>> 0; }
  function day(now) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
  function doneCounts(catalog, done) {
    const counts = {}, slugs = catalog.map(x => x.s).sort((a, b) => b.length - a.length);
    Object.keys(done || {}).forEach(id => { const s = slugs.find(s => id.startsWith(s + '-')); if (s) counts[s] = (counts[s] || 0) + 1; });
    return counts;
  }
  function trimHistory(hist) {
    const out = {};
    Object.keys(hist || {}).filter(s => /^[a-z0-9-]+$/.test(s) && hist[s] && typeof hist[s] === 'object').sort((a, b) => (+hist[b].t || 0) - (+hist[a].t || 0)).slice(0, 200).forEach(s => {
      const x = hist[s]; out[s] = { v: Math.max(0, +x.v || 0), s: Math.max(0, +x.s || 0), o: Math.max(0, +x.o || 0), t: Math.max(0, +x.t || 0) };
    });
    return out;
  }
  function recommend(catalog, hist, done, now, excluded) {
    hist = trimHistory(hist); now = now || Date.now(); done = done || {};
    const seed = day(now), byId = Object.fromEntries(catalog.map(x => [x.s, x]));
    const played = catalog.filter(p => (hist[p.s] && hist[p.s].v > 0) || done[p.s] > 0);
    const weights = {}, interest = {};
    played.forEach(p => {
      const h = hist[p.s] || {}, age = Math.max(0, now - (+h.t || now)) / DAY;
      weights[p.s] = (Math.log2(1 + (+h.v || 0)) + Math.min(+h.s || 0, 1800) / 600 + 0.5 * (+done[p.s] || 0)) * Math.pow(0.5, age / 14);
      interest[p.d] = (interest[p.d] || 0) + weights[p.s];
    });
    const main = Object.keys(interest).sort((a, b) => interest[b] - interest[a] || a.localeCompare(b))[0];
    function relation(p, c) {
      if (p.c && p.c === c.c) return [3, 'chapter'];
      if ((p.r || []).includes(c.s)) return [2, p.d !== c.d ? 'cross' : 'similar'];
      if (p.x === c.s) return [1.5, 'cross'];
      if (p.b === c.b) return [1, 'branch'];
      if (p.d === c.d) return [0.3, 'subject'];
      return [0, ''];
    }
    const candidates = catalog.filter(c => c.s !== excluded && !(hist[c.s] && hist[c.s].v > 0) && !(done[c.s] > 0) && !(c.n > 0 && done[c.s] >= c.n)).map(c => {
      let score = 0, max = 0, reason = null;
      played.forEach(p => { const [r, type] = relation(p, c), v = weights[p.s] * r; score += v; if (v > max) { max = v; reason = { type, source: p.s }; } });
      const age = (Date.parse(seed) - Date.parse(c.l)) / DAY;
      if (age >= 0 && age < 14) score += 0.3;
      return { lab: c, score, reason, tie: hash(seed + c.s) };
    }).sort((a, b) => b.score - a.score || a.tie - b.tie || a.lab.s.localeCompare(b.lab.s));
    const out = [], ns = {}, nc = {};
    function add(it) {
      if (!it || out.some(x => x.lab.s === it.lab.s) || (ns[it.lab.d] || 0) >= 3 || (nc[it.lab.c] || 0) >= 2) return false;
      out.push(it); ns[it.lab.d] = (ns[it.lab.d] || 0) + 1; nc[it.lab.c] = (nc[it.lab.c] || 0) + 1; return true;
    }
    if (played.length) {
      for (const it of candidates) if (it.reason && out.length < 6) add(it);
      const cross = candidates.find(it => it.lab.d !== main && it.reason);
      if (cross && !out.some(it => it.lab.d !== main)) { if (out.length === 6) { const last = out.pop(); ns[last.lab.d]--; nc[last.lab.c]--; } add(cross); }
    }
    // 各科第一分支第一章，日期雜湊輪替六科；不讀任何全站統計。
    const domains = [...new Set(catalog.map(x => x.d))].sort((a, b) => hash(seed + a) - hash(seed + b));
    const cold = [];
    domains.forEach(d => {
      const first = catalog.find(x => x.d === d);
      const options = candidates.filter(it => it.lab.d === d && it.lab.b === first.b && it.lab.c === first.c).sort((a, b) => a.tie - b.tie);
      const pick = options[0]; if (pick) cold.push(Object.assign({}, pick, { reason: { type: 'starter', source: '' } }));
    });
    for (const it of cold) if (out.length < 6 && !out.some(x => x.lab.d === it.lab.d)) add(it);
    for (const it of candidates) if (out.length < 6) add(Object.assign({}, it, { reason: it.reason || { type: 'explore', source: '' } }));
    if (main && !out.some(it => it.lab.d !== main)) {
      const cross = candidates.find(it => it.lab.d !== main && (nc[it.lab.c] || 0) < 2);
      if (cross) { const last = out.pop(); if (last) { ns[last.lab.d]--; nc[last.lab.c]--; } add(Object.assign({}, cross, { reason: cross.reason || { type: 'explore', source: '' } })); }
    }
    return { items: out, personal: played.length > 0, byId };
  }
  return { hash, day, doneCounts, trimHistory, recommend };
});
