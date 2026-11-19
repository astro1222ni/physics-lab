#!/usr/bin/env node
/* 科目頁導覽搬遷，可重跑；--check 不寫檔。 */
'use strict';
const fs = require('fs'), path = require('path');
const { ROOT, subjects, read, esc, readCatalogText } = require('./home-data.cjs');
const { html: formulaHTML } = require('../js/settings.js');
const CHECK = process.argv.includes('--check');
const W = {}; new Function('window', read('js/catalog.js'))(W);
const bySlug = new Map(W.LAB_CATALOG.map(x => [x.s, x]));
const anchors = {};
for (const s of subjects) {
  anchors[s.dom] = { page: s.page, root: true };
  for (const b of s.branches) anchors[b] = { page: s.page };
  const f = 'docs/directory/' + s.id + '.json';
  if (fs.existsSync(path.join(ROOT, f))) for (const b of JSON.parse(read(f)).branches) for (const c of b.chapters) {
    anchors[c.id] = { page: s.page };
    for (const mo of c.modules || []) if (!bySlug.has(mo) && fs.existsSync(path.join(ROOT, mo + '.html'))) bySlug.set(mo, { s: mo, d: s.dom, b: b.id, bzh: readCatalogText(b.zh), ben: readCatalogText(b.en), c: c.id, czh: readCatalogText(c.zh), cen: readCatalogText(c.en) });
  }
}
let n = 0;
for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
  const old = read(f); let next = old, lab = bySlug.get(f.slice(0, -5));
  if (lab) {
    const s = subjects.find(s => s.dom === lab.d);
    const a = (url, t) => '<a href="' + url + '">' + formulaHTML(t) + '</a>';
    const zh = [a('index.html', '首頁'), a(s.page + '.html', s.zh), a(s.page + '.html#' + lab.b, lab.bzh), a(s.page + '.html#' + lab.c, lab.czh)].join(' / ');
    const en = [a('index.html', 'Home'), a(s.page + '.html', s.en), a(s.page + '.html#' + lab.b, lab.ben), a(s.page + '.html#' + lab.c, lab.cen)].join(' / ');
    next = next.replace(/<nav class="crumbs"[\s\S]*?<\/nav>/, () => '<nav class="crumbs" data-en-html="' + esc(en) + '">' + zh + '</nav>');
  }
  next = next.replace(/index\.html#([a-z0-9-]+)/g, (m, id) => anchors[id] ? anchors[id].page + '.html' + (anchors[id].root ? '' : '#' + id) : m);
  if (/href=(?:"|&quot;)index\.html#/.test(next)) throw new Error(f + ' 有無法識別的舊連結');
  if (old !== next) { n++; if (!CHECK) fs.writeFileSync(path.join(ROOT, f), next); }
}
console.log((CHECK ? '導覽檢查：' : '已更新導覽：') + n + ' 頁' + (CHECK && n ? ' 待更新' : ''));
if (CHECK && n) process.exitCode = 1;
