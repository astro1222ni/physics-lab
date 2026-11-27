'use strict';
const assert = require('node:assert/strict');
const { summarize, compareFailures, failureLine } = require('../tools/fluke-scan.cjs');

const hit = (id, level, step, hidden = false) => ({ id, level, step, hidden });
const page = (accidental = [], confirmed = [], pending = []) => ({ accidental, confirmed, pending });
const run = (seed, pages) => ({ seed, pages });
const issue = { kind: 'pageerror', msg: '頁面錯誤', step: 10 };
const pending = { kind: 'reading', msg: '讀數待確認' };

const first = run(1112, {
  'ohms-law': page([
    hit('隱藏', 1, 149, true),
    hit('提前', 3, 10),
    hit('稍晚', 3, 30),
    hit('低級', 2, 5),
    hit('邊界', 3, 25)
  ], [issue], [pending]),
  tides: page([], [issue])
});
const second = run(1, {
  'ohms-law': page([hit('提前', 3, 40), hit('隱藏', 1, 12, true)], [{ ...issue, step: 30 }], [pending])
});

const summary = summarize([first, second]);
assert.deepEqual(summary.failed.filter(item => item.type === 'accidental').map(item => item.id), ['隱藏', '提前']);
assert.deepEqual(summary.retained.map(item => item.id), ['稍晚', '低級', '邊界']);
assert.deepEqual(summary.failed.find(item => item.id === '提前').hits, [
  { seed: 1112, step: 10, failed: true },
  { seed: 1, step: 40, failed: false }
]);
const confirmed = summary.failed.filter(item => item.type === 'confirmed');
assert.deepEqual(confirmed.map(item => [item.slug, item.seeds]), [['ohms-law', [1112, 1]], ['tides', [1112]]]);
assert.equal(summary.pending, 2);

const looser = summarize([first], { minLevel: 2, minStep: 31 });
assert.deepEqual(looser.failed.filter(item => item.type === 'accidental').map(item => item.id), ['隱藏', '提前', '稍晚', '低級', '邊界']);
const stricter = summarize([first], { minLevel: 10, minStep: 0 });
assert.deepEqual(stricter.failed.filter(item => item.type === 'accidental').map(item => item.id), ['隱藏']);

const previous = summarize([run(42, {
  'ohms-law': page([hit('隱藏', 1, 80, true), hit('上次的任務', 5, 4)], [issue]),
  tides: page([], [issue])
})]);
const diff = compareFailures(summary.failed, previous.failed);
assert.deepEqual(diff.added, [summary.failed.find(item => item.id === '提前').key]);
assert.deepEqual(diff.removed, [previous.failed.find(item => item.id === '上次的任務').key]);

// 重現指令補 --steps：有 --until 插在它前面、沒有就接在最後、已經有 --steps 不重複、預設步數不補。
const line = (repro, steps) => failureLine({ type: 'confirmed', slug: 'tides', seeds: [1], issue: { msg: '錯', repro } }, steps).split('｜重現：')[1];
assert.equal(line('node tools/playtest.cjs tides --seed=1 --until=16', 30), 'node tools/playtest.cjs tides --seed=1 --steps=30 --until=16');
assert.equal(line('node tools/playtest.cjs tides --seed=1', 30), 'node tools/playtest.cjs tides --seed=1 --steps=30');
assert.equal(line('node tools/playtest.cjs tides --seed=1 --steps=30 --until=16', 30), 'node tools/playtest.cjs tides --seed=1 --steps=30 --until=16');
assert.equal(line('node tools/playtest.cjs tides --seed=1 --until=16', 150), 'node tools/playtest.cjs tides --seed=1 --until=16');
console.log('多種子誤觸判定、去重、前後比對與重現指令通過。');
