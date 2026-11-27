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
// 已人工確認保留清單：雜湊對得上才保留；判定、提示句或共用小函式一改就失效；護欄（種子數、最早步數）超出也失效。
{
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { missionHash, resolveAllow, allowedLine } = require('../tools/fluke-scan.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fluke-allow-test-'));
  try {
    fs.mkdirSync(path.join(root, 'js/missions'), { recursive: true });
    const file = path.join(root, 'js/missions/demo.js');
    const write = (cut, riddle, check) => fs.writeFileSync(file, '(function () {\n  // 共用小函式\n  const ok = function (ev) { return ev.data.x > ' + cut + '; };\n' +
      "  LabMission.register('demo', [{ id: 'demo-h1', level: 4, hidden: true, riddle: { zh: '" + riddle + "' }, check: function (ev) { " + check + ' } }]);\n})();\n');
    write(1, '謎', 'return ok(ev);');
    const hash = missionHash('demo', 'demo-h1', root);
    assert.match(hash, /^[0-9a-f]{16}$/);
    // 只改註解與空白，雜湊不變
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('// 共用小函式', '/* 改了說明 */').replace('return ok(ev);', 'return   ok(ev);'));
    assert.equal(missionHash('demo', 'demo-h1', root), hash);

    const entry = { reason: '人工確認', decided: '2026-11-28 三方', hash, maxSeeds: 1, minStep: 100 };
    const key = JSON.stringify(['accidental', 'demo', 'demo-h1']);
    const late = [run(1112, { demo: page([hit('demo-h1', 4, 150, true)]) }), run(1, { demo: page() })];

    // 命中清單：改列已確認保留，不算不合格
    let allow = resolveAllow(['demo'], { demo: { 'demo-h1': entry } }, root);
    assert.equal(allow.get(key).invalid, null);
    let s = summarize(late, undefined, allow);
    assert.deepEqual(s.failed.map(item => item.id), []);
    assert.deepEqual(s.allowed.map(item => item.id), ['demo-h1']);
    assert.match(allowedLine(s.allowed[0]), /^◎ demo demo-h1 保留（已確認，2026-11-28 三方）：種子 1112 誤觸，最早第 150 步/);

    // 試玩確認的問題不受清單影響
    s = summarize([run(1112, { demo: page([hit('demo-h1', 4, 150, true)], [issue]) })], undefined, allow);
    assert.deepEqual(s.failed.map(item => item.type), ['confirmed']);

    // 護欄：兩個種子命中、或太早命中，就照報不合格並寫原因
    s = summarize([...late, run(7, { demo: page([hit('demo-h1', 4, 120, true)]) })], undefined, allow);
    assert.deepEqual(s.failed.map(item => item.id), ['demo-h1']);
    assert.match(failureLine(s.failed[0], 150), /保留清單已失效：2 個種子命中/);
    s = summarize([run(1112, { demo: page([hit('demo-h1', 4, 30, true)]) })], undefined, allow);
    assert.match(failureLine(s.failed[0], 150), /保留清單已失效：第 30 步就命中/);

    // 判定、提示句、共用小函式任一改了：雜湊變、清單失效
    for (const [cut, riddle, check] of [[1, '謎', 'return ok(ev) && true;'], [1, '新謎', 'return ok(ev);'], [2, '謎', 'return ok(ev);']]) {
      write(cut, riddle, check);
      allow = resolveAllow(['demo'], { demo: { 'demo-h1': entry } }, root);
      assert.match(allow.get(key).invalid, /雜湊 [0-9a-f]{16} → [0-9a-f]{16}/);
      s = summarize(late, undefined, allow);
      assert.deepEqual(s.failed.map(item => item.id), ['demo-h1']);
      assert.match(failureLine(s.failed[0], 150), /保留清單已失效：任務判定或提示句改過/);
    }

    // 缺欄位、任務不見也失效
    write(1, '謎', 'return ok(ev);');
    assert.equal(resolveAllow(['demo'], { demo: { 'demo-h1': { ...entry, reason: '' } } }, root).get(key).invalid, '缺少原因、決定日期或雜湊');
    assert.match(resolveAllow(['demo'], { demo: { 'demo-h9': entry } }, root).get(JSON.stringify(['accidental', 'demo', 'demo-h9'])).invalid, /找不到任務 demo-h9/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

console.log('多種子誤觸判定、去重、前後比對、重現指令與已確認保留清單通過。');
