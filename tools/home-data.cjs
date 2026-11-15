/* 首頁、科目頁與各產生工具共用；科目代號和頁名只從任務清單讀取。 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const W = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(W);
const subjects = W.LAB_SUBJECTS;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (zh, en, tag = 'span', attrs = '') => `<${tag} data-en="${esc(en)}"${attrs ? ' ' + attrs : ''}>${zh}</${tag}>`;
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
  return src.replace(re, '<!-- ' + name + '-BEGIN（工具產生） -->\n' + value + '\n<!-- ' + name + '-END -->');
}
function miniCard(x, meta = '') {
  const s = subjects.find(s => s.dom === x.d), a = asset(s);
  return `<a class="entry-card" href="${x.s}.html" data-hans-subject="${s.id}" style="--c:${a.color}"><img class="module-thumb" data-thumb="${x.s}" src="img/thumbs/${x.s}-hant-light.webp" alt="" width="720" height="405" loading="lazy">${text(s.zh, s.en, 'span', 'class="subject-tag"')}${text(esc(x.zh), x.en, 'h3')}${meta}</a>`;
}
module.exports = { ROOT, W, subjects, read, esc, text, section, asset, marker, miniCard };
