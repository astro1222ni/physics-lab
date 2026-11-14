'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rngOf, loadMissions } = require('../tools/playtest.cjs');
const { DEFAULT_PERSONAS, profiles, habitOf, parseArgs, intervals, command, nightOpen, newRotation, rotationWithReceipt } = require('../tools/personas/model.cjs');
const { SCHEMA, markdown, writeReport, readJSON } = require('../tools/personas/report.cjs');
const { recipesFor } = require('../tools/personas/proofs.cjs');

const live = ['projectile', 'ph-scale', 'stack-queue', 'data-compression'];
assert.equal(DEFAULT_PERSONAS.length, 6);
assert.equal(Object.keys(profiles).length, 8);
assert.deepEqual(habitOf('beginner').viewport, { width: 390, height: 844 });
assert.deepEqual(habitOf('scroll').viewport, { width: 640, height: 360 });
assert.equal(habitOf('gifted', 'mobile+english+dark').keyboard, true);
assert.equal(habitOf('student', 'simplified').language, 'zh-Hans');
assert.throws(() => habitOf('student', 'english+simplified'));
assert.throws(() => habitOf('student', 'desktop+landscape'));
assert.throws(() => parseArgs(['../projectile'], live));
assert.throws(() => parseArgs(['--seed=1e3'], live));
assert.throws(() => parseArgs(['--persona=unknown'], live));
assert.throws(() => parseArgs(['--nightly', '--until=1'], live));
assert.equal(parseArgs(['--nightly'], live).batch, 30);
assert.deepEqual(parseArgs(['stack-queue,projectile', 'projectile'], live).slugs, ['stack-queue', 'projectile']);
assert.equal(parseArgs(['projectile', '--mission=projectile-1', '--until=0'], live).mission, 'projectile-1');
assert.equal(parseArgs(['projectile', '--until=0'], live).until, 0);

const plan = (seed, slug) => {
  const random = rngOf(seed, slug + ':beginner');
  return Array.from({ length: 25 }, () => [
    ['next', 'reset', 'adjust'][Math.floor(random() * 3)],
    1000 + Math.floor(random() * 2001)
  ]);
};
assert.deepEqual(plan(7, 'projectile'), plan(7, 'projectile'));
assert.notDeepEqual(plan(7, 'projectile'), plan(8, 'projectile'));
assert.notDeepEqual(plan(7, 'projectile'), plan(7, 'ph-scale'));
assert.notDeepEqual(intervals(7, 'projectile', 'breaker', 0), intervals(8, 'projectile', 'breaker', 0));
assert.deepEqual(intervals(7, 'projectile', 'breaker', 0), intervals(7, 'projectile', 'breaker', 0));
assert.notDeepEqual(intervals(7, 'projectile', 'breaker', 0), intervals(7, 'projectile', 'breaker', 1));
assert.ok(intervals(7, 'projectile', 'breaker', 0).every(n => n >= 10 && n <= 30));

for (const slug of live.slice(0, 3)) assert.deepEqual(Object.keys(recipesFor(slug)).sort(), loadMissions(slug).map(m => m.id).sort());
assert.deepEqual(recipesFor('data-compression'), {});

for (const [s, open] of [['14:29', false], ['14:30', true], ['15:59', true], ['16:00', true], ['21:59', true], ['22:00', false]]) {
  assert.equal(nightOpen(new Date('2026-11-14T' + s + ':00Z')), open);
}
const first = newRotation(null, live, 'abc');
assert.deepEqual(first, { signature: 'abc', cycle: 1, done: [] });
const resumed = newRotation({ ...first, done: ['projectile'], partial: { 'ph-scale/expert': { result: 1 } } }, live, 'abc');
assert.deepEqual(resumed.done, ['projectile']);
assert.deepEqual(resumed.partial, { 'ph-scale/expert': { result: 1 } });
assert.equal(newRotation({ ...first, done: live }, live, 'abc').cycle, 2);
assert.deepEqual(newRotation({ ...first, done: live }, live, 'bca').done, []);
const one = rotationWithReceipt(first, 'projectile', 'breaker', ['breaker', 'gifted'], { elapsedMs: 1 });
assert.deepEqual(one.done, []);
assert.deepEqual(one.partial, { 'projectile/breaker': { elapsedMs: 1 } });
const two = rotationWithReceipt(one, 'projectile', 'gifted', ['breaker', 'gifted'], { elapsedMs: 2 });
assert.deepEqual(two.done, ['projectile']);
assert.deepEqual(two.partial, {});

const habit = habitOf('expert'), persona = 'expert';
const run = { slug: 'projectile', persona, habit, seed: 7, subject: '物理', metrics: {}, elapsedMs: 1200,
  actions: [{}], completed: [{ id: 'projectile-1', stars: 1 }],
  missions: [{ id: 'projectile-1', status: '✓ 已得星', steps: 1, elapsedMs: 900 }] };
const r = command(run, 2, 'projectile-1');
assert.equal(r, 'node tools/personas.cjs projectile --persona=expert --habit=desktop --seed=7 --mission=projectile-1 --until=2');
run.findings = [
  { level: 'pending', step: 0, msg: '等待', repro: command(run, 0), count: 1 },
  { level: 'confirmed', step: 2, msg: '讀數 NaN', repro: r, shot: 'personas/test.png', count: 1 }
];
const report = { schema: SCHEMA, id: 'test', seed: 7, nightly: false, until: null, planned: 1, runs: [run] };
const md = markdown(report);
assert.ok(md.indexOf('讀數 NaN') < md.indexOf('等待'));
assert.match(md, /\[當步截圖\]\(personas\/test.png\)/);
assert.match(md, /projectile-1 \| ✓ 已得星 \| 1/);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'personas-test-'));
try {
  writeReport(dir, report);
  assert.deepEqual(readJSON(path.join(dir, 'personas-report.json')), report);
  assert.equal(fs.readFileSync(path.join(dir, 'personas-report.md'), 'utf8'), md);
  writeReport(dir, { ...report, runs: [] });
  assert.deepEqual(readJSON(path.join(dir, 'personas-report.json')).runs, []);
} finally {
  for (const name of ['personas-report.json', 'personas-report.md']) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.rmdirSync(dir);
}
console.log('玩家預設與組合、固定種子、任務路徑、夜間窗口及續跑、JSON 與 Markdown 回寫');
