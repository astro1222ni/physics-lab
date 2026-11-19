'use strict';
const assert = require('node:assert/strict');
const { html, plain, render } = require('../js/settings.js');
const { read, readCatalogText, formulaLabel } = require('../tools/home-data.cjs');

assert.equal(readCatalogText('NO<sub>2</sub> + C&lt;sub&gt;5&lt;/sub&gt;H&#60;sub&#62;12&#60;/sub&#62;'),
  'NO<sub>2</sub> + C<sub>5</sub>H<sub>12</sub>');
assert.equal(readCatalogText('<b title="a > b">C</b>&lt;em&gt;H&lt;/em&gt;<sup class="x">+</sup>'), 'CH+');
assert.equal(readCatalogText('<i>2</i><SUP>3</SUP> &amp; a &lt; b'), '2<sup>3</sup> & a < b');
assert.equal(html('NO<sub>2</sub> + x<sup>2</sup> & "\'<img src=x><sub onmouseover=x>3'),
  'NO<sub>2</sub> + x<sup>2</sup> &amp; &quot;&#x27;&lt;img src=x&gt;&lt;sub onmouseover=x&gt;3');
assert.equal(html('&lt;sub&gt;2&lt;/sub&gt;'), '&amp;lt;sub&amp;gt;2&amp;lt;/sub&amp;gt;');
const label = {};
assert.equal(render(label, 'NO<sub>2</sub>'), label);
assert.equal(label.innerHTML, 'NO<sub>2</sub>');
assert.equal(plain('NO<sub>2</sub> + C<sub>5</sub>H<sub>12</sub> + x<sup>2</sup>'), 'NO2 + C5H12 + x2');
assert.equal(formulaLabel('含 NO<sub>2</sub>', 'With NO<sub>2</sub>', 'h3'),
  '<h3 data-en-html="With NO&lt;sub&gt;2&lt;/sub&gt;">含 NO<sub>2</sub></h3>');

const w = {};
for (const file of ['catalog', 'search-index', 'chapter-map']) new Function('window', read('js/' + file + '.js'))(w);
for (const list of [w.LAB_CATALOG, w.LAB_SEARCH_INDEX]) {
  for (const [slug, formula] of [['chemical-equilibrium', 'NO<sub>2</sub>'], ['organic-isomers', 'C<sub>5</sub>H<sub>12</sub>']]) {
    const lab = list.find(x => x.s === slug);
    for (const key of ['dzh', 'den']) assert.ok(lab[key].includes(formula), slug + ' ' + key);
  }
  assert.ok(list.find(x => x.s === 'pascal-triangle').dzh.includes('<sup>n</sup>'));
}
for (const x of [...w.LAB_CATALOG, ...w.LAB_SEARCH_INDEX, ...w.LAB_CHAPTERS]) {
  for (const key of ['zh', 'en', 'dzh', 'den', 'bzh', 'ben', 'czh', 'cen', 'keywords']) {
    if (x[key] == null) continue;
    assert.doesNotMatch(plain(x[key]), /<\/?[a-z][\w:-]*(?:[\s/>])|&lt;\/?(?:sub|sup)&gt;|[\u00b2\u00b3\u00b9\u2070-\u209f]/i);
  }
}
console.log('目錄上下標、純文字與 HTML 跳脫通過');
