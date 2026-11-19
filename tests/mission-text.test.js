'use strict';
const assert = require('node:assert/strict');
const { html, plain, render } = require('../js/settings.js');
const { extractTerms, judgeTerms } = require('../tools/playtest.cjs');

const formula = '讓 Fe<sup>3+</sup> 與 SO<sub>4</sub><sup>2−</sup> 反應';
const title = formula + ' <img src=x onerror="a > b">';
const escaped = formula + ' &lt;img src=x onerror=&quot;a &gt; b&quot;&gt;';
const label = {};

assert.equal(html(title), escaped);
assert.equal(render(label, title), label);
assert.equal(label.innerHTML, escaped);
assert.equal(plain(title), '讓 Fe3+ 與 SO42− 反應 ');
assert.equal(html('x < 2 & y > 0'), 'x &lt; 2 &amp; y &gt; 0');
assert.equal(plain('x < 2 & y > 0'), 'x < 2 & y > 0');

const referencedTitle = { zh: 'SO<sub>4</sub><sup>2−</sup>' };
const missions = [{ id: 'formula-1', title: referencedTitle, desc: { zh: '按「' + referencedTitle.zh + '」按鈕。' } }];
const terms = extractTerms(missions);
assert.deepEqual(terms.map(term => term.term), ['SO42−']);
assert.deepEqual(judgeTerms(terms, { zh: { vis: [], all: [], text: [] } }, { terms: [] }, missions, ''), []);

console.log('任務上下標、HTML 跳脫與純文字通過');
