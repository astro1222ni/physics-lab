// 專家依公開介面重播。操作台一次只顯示一頁，切頁後才能操作其中的控制項。
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tides } = require('../tools/personas/expert/replays.json');
const html = fs.readFileSync(path.join(__dirname, '../tides.html'), 'utf8');
const panes = new Map();
const owner = new Map();
for (const section of html.matchAll(/<section\b[^>]*data-deck="([^|"]+)\|[^"]+"[^>]*data-deck-order="(\d+)"[^>]*>([\s\S]*?)<\/section>/g)) {
  const [, name, order, body] = section;
  panes.set(name, Number(order));
  for (const control of body.matchAll(/\bid="([^"]+)"/g)) owner.set('#' + control[1], name);
}
assert.equal(owner.get('#nextHigh'), '快轉');
for (const route of tides) {
  let active = [...panes.keys()].sort((a, b) => panes.get(a) - panes.get(b))[0];
  for (const action of route.actions) {
    if (action.deckTab) {
      assert.ok(panes.has(action.deckTab), '頁面缺少分頁「' + action.deckTab + '」');
      active = action.deckTab;
    }
    if (owner.has(action.target)) {
      assert.equal(active, owner.get(action.target), '操作 ' + action.target + ' 前須先切換分頁');
    }
  }
}
console.log('潮汐專家重播的每個分頁控制項都在當下選取的分頁');
