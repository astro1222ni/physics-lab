/* 首頁、科目頁與各產生工具共用；科目代號和頁名只從任務清單讀取。 */
'use strict';
const fs = require('fs'), path = require('path');
const { html: formulaHTML, plain } = require('../js/settings.js');
const ROOT = path.resolve(__dirname, '..');
const W = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(W);
const subjects = W.LAB_SUBJECTS;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (zh, en, tag = 'span', attrs = '') => `<${tag} data-en="${esc(en)}"${attrs ? ' ' + attrs : ''}>${zh}</${tag}>`;
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, key) => {
  key = key.toLowerCase();
  if (key[0] !== '#') return entities[key];
  const n = key[1] === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
  return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\ufffd';
});
function readCatalogText(value) {
  const tags = /<!--[\s\S]*?-->|<\/?[a-z][\w:-]*(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  const keep = tag => /^<\/?(?:sub|sup)>$/i.test(tag) ? tag.toLowerCase() : '';
  // 科目頁的內文與英文屬性可能用實體編碼上下標，兩種寫法都統一。
  const text = unesc((value ?? '').replace(tags, keep)).replace(tags, keep).replace(/\s+/g, ' ').trim();
  const formulaTags = /<(\/?)(sub|sup)>/g;
  const open = [], paired = new Set();
  for (const tag of text.matchAll(formulaTags)) {
    if (!tag[1]) open.push(tag);
    else if (open.at(-1)?.[2] === tag[2]) {
      paired.add(open.pop().index);
      paired.add(tag.index);
    }
  }
  return text.replace(formulaTags, (tag, _slash, _type, index) => paired.has(index) ? tag : '');
}
function formulaTranslation(en) {
  return plain(en) === en ? `data-en="${esc(en)}"` : `data-en-html="${esc(formulaHTML(en))}"`;
}
function formulaLabel(zh, en, tag = 'span', attrs = '') {
  return `<${tag} ${formulaTranslation(en)}${attrs ? ' ' + attrs : ''}>${formulaHTML(zh)}</${tag}>`;
}
function section(src, id) {
  const at = src.indexOf('<section class="domain" id="' + id + '"');
  if (at < 0) throw new Error('找不到科目區 ' + id);
  const re = /<\/?section\b[^>]*>/g; re.lastIndex = at;
  let depth = 0;
  for (let m; (m = re.exec(src));) { depth += m[0].startsWith('</') ? -1 : 1; if (!depth) return src.slice(at, re.lastIndex); }
  throw new Error('科目區未閉合 ' + id);
}
function asset(s, src) {
  src = src || read(s.page + '.html');
  const region = section(src, s.dom);
  const head = region.match(/<header class="domain-head">([\s\S]*?)<\/header>/)[1];
  return { icon: head.match(/<svg[\s\S]*?<\/svg>/)[0], color: region.match(/style="--c:([^";]+)/)[1] };
}
function marker(src, name, value) {
  const re = new RegExp('<!-- ' + name + '-BEGIN[^>]*-->[\\s\\S]*?<!-- ' + name + '-END -->');
  if (!re.test(src)) throw new Error('缺少產生標記 ' + name);
  return src.replace(re, () => '<!-- ' + name + '-BEGIN（工具產生） -->\n' + value + '\n<!-- ' + name + '-END -->');
}
function miniCard(x, meta = '') {
  const s = subjects.find(s => s.dom === x.d), a = asset(s);
  return `<a class="entry-card" href="${x.s}.html" data-hans-subject="${s.id}" style="--c:${a.color}"><img class="module-thumb" data-thumb="${x.s}" src="img/thumbs/${x.s}-hant-light.webp" alt="" width="720" height="405" loading="lazy">${text(s.zh, s.en, 'span', 'class="subject-tag"')}${formulaLabel(x.zh, x.en, 'h3')}${meta}</a>`;
}
module.exports = { ROOT, W, subjects, read, esc, text, readCatalogText, formulaLabel, formulaTranslation, section, asset, marker, miniCard };
