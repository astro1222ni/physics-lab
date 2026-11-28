'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { describe, it, beforeEach, afterEach } = require('node:test');
const { summarize, compareFailures, failureLine, allowedLine, missionHash, resolveAllow } = require('../tools/fluke-scan.cjs');

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
      assert.match(failureLine(s.failed[0], 150), /保留清單已失效：任務或相依檔案改過/);
    }

    // 缺欄位、任務不見也失效
    write(1, '謎', 'return ok(ev);');
    assert.equal(resolveAllow(['demo'], { demo: { 'demo-h1': { ...entry, reason: '' } } }, root).get(key).invalid, '缺少原因、決定日期或雜湊');
    assert.match(resolveAllow(['demo'], { demo: { 'demo-h9': entry } }, root).get(JSON.stringify(['accidental', 'demo', 'demo-h9'])).invalid, /找不到任務 demo-h9/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('人工確認保留清單的六項回歸測試', () => {
  let root, file;
  const scanner = path.resolve(__dirname, '../tools/fluke-scan.cjs');
  const original = "LabMission.register('demo', [{ id: 'demo-1', level: 4, hidden: true, riddle: {zh: '謎'}, check(ev) { return ok(ev) && !ev.sun; } }]);";
  const helper = 'function ok(ev) { return ev.x > 1; }';
  const source = original + '\n' + helper;
  const key = JSON.stringify(['accidental', 'demo', 'demo-1']);
  const base = { reason: '人工確認', decided: '2026-11-28', maxSeeds: 1, minStep: 100 };
  function hash(text, deps) {
    fs.writeFileSync(file, text);
    return missionHash('demo', 'demo-1', root, deps);
  }
  function list(entry, id = 'demo-1') {
    return resolveAllow(['demo'], { demo: { [id]: entry } }, root);
  }
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fluke-review-'));
    fs.mkdirSync(path.join(root, 'js/missions'), { recursive: true });
    file = path.join(root, 'js/missions/demo.js');
    fs.writeFileSync(file, source);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('行內排版與假註冊標記不影響雜湊，前後置共用函式都納入', () => {
    const expected = hash(source);
    assert.equal(hash('// LabMission.register(\n' + source.replace('register(', 'register (').replace('ok(ev) &&', 'ok(ev)&&')), expected);
    assert.equal(hash('<!-- 假的 LabMission.register(\n--> 仍是註解\n' + source), expected);
    assert.equal(hash(source + '\n<!-- 檔尾註解'), expected);
    assert.notEqual(hash(source + '\nlet b=1; b<!--b\nb;'), hash(source + '\nlet b=1; b < ! --b\nb;'));
    assert.notEqual(hash(source.replace('ev.x > 1', 'ev.x > 2')), expected);
    const pre = '// LabMission.register(\n' + helper + '\n' + original.replace('register(', 'register (');
    assert.notEqual(hash(pre), hash(pre.replace('ev.x > 1', 'ev.x > 2')));
    assert.notEqual(hash(source + '\nfunction unused() { return 1; }'), expected);
    const withGetter = source.replace('check(ev) { return ok(ev) && !ev.sun; }', "get check() { throw Error('雜湊不可讀取判定函式'); }");
    assert.match(hash(withGetter), /^[a-f0-9]{16}$/);
    for (const [a, b] of [["'謎'", "'新謎'"], ['level: 4', 'level: 5'], ['hidden: true', 'hidden: false']]) {
      assert.notEqual(hash(source.replace(a, b)), expected);
    }
  });

  it('字串、正規表示式與巢狀樣板保留原文，除號不吞運算元', () => {
    const withCode = text => source + '\nfunction probe(x) { ' + text + ' }';
    for (const [a, b] of [
      ["return 'a/*x*/b';", "return 'a/*y*/b';"],
      ["return 'A  B';", "return 'A B';"],
      ['return /[/*]a  b/g;', 'return /[/*]a b/g;'],
      ['if (x) /[/*]a  b/.test(x);', 'if (x) /[/*]a b/.test(x);'],
      ['if (x) {} /=a  b/.test(x);', 'if (x) {} /=a b/.test(x);'],
      ['return `a  ${{v: `b${/[}]/.test(x)}`}.v}/*x*/`;', 'return `a ${{v: `b${/[}]/.test(x)}`}.v}/*x*/`;'],
      ['return x / 2 / 3;', 'return x / 4 / 3;'],
      ['return x + ++x;', 'return x++ + x;']
    ]) assert.notEqual(hash(withCode(a)), hash(withCode(b)), a);
    for (const [a, b] of [
      ['return ok(x) / 2 / 3;', 'return ok(x)/2/3;'],
      ['x /= 2 / 3;', 'x/=2/3;'],
      ['return `raw // ${x + 1}`;', 'return `raw // ${x/*註解*/+1}`;']
    ]) assert.equal(hash(withCode(a)), hash(withCode(b)), a);
  });

  it('return 換行與區塊註解內的換行會改變雜湊', () => {
    const before = hash(source);
    for (const newline of ['\n', '\r\n', '\u2028', '/*\n*/']) {
      assert.notEqual(hash(source.replace('return ok(ev)', 'return' + newline + 'ok(ev)')), before);
    }
    assert.equal(hash(source.replace('return ok(ev)', 'return/*註解*/ok(ev)')), before);
  });

  it('相依檔也切詞，依據檔缺漏或清單格式有誤即失效', () => {
    const dep = 'js/data.js', depFile = path.join(root, dep);
    fs.writeFileSync(depFile, 'const gap = 1;');
    const expected = hash(source, [dep]);
    assert.notEqual(expected, hash(source));
    fs.writeFileSync(depFile, 'const gap=1; // 排版');
    assert.equal(hash(source, [dep]), expected);
    const config = { ...base, hash: expected, deps: [dep] };
    fs.writeFileSync(depFile, 'const gap=2;');
    assert.match(list(config).get(key).invalid, /雜湊/);
    fs.unlinkSync(depFile);
    assert.ok(list(config).get(key).invalid);
    for (const deps of [null, dep, [null], ['../x.js']]) assert.ok(list({ ...config, deps }).get(key).invalid);
  });

  it('空項目、空白欄位、錯型護欄及 h2 缺少任一護欄都失效', () => {
    const good = { ...base, hash: hash(source) };
    for (const entry of [null, [], false, { ...good, reason: '  ' }, { ...good, decided: [] }, { ...good, decided: '\t' }]) {
      assert.ok(list(entry).get(key).invalid);
    }
    for (const name of ['maxSeeds', 'minStep']) {
      for (const value of [undefined, null, '1', 'typo', 0, -1, 1.5, NaN, Infinity]) {
        assert.match(list({ ...good, [name]: value }).get(key).invalid, new RegExp(name));
      }
      const missing = { ...good };
      delete missing[name];
      assert.equal(list(missing).get(key).invalid, null);
      const tides = resolveAllow(['tides'], { tides: { 'tides-h2': missing } }, root);
      assert.match([...tides.values()][0].invalid, new RegExp(name));
    }
  });

  it('不完整步數不會保留，第零步與護欄等號各自正確處理', () => {
    const allow = list({ ...base, hash: hash(source) });
    function at(step, hidden = true) {
      return summarize([run(1, { demo: page([hit('demo-1', 4, step, hidden)]) })], undefined, allow);
    }
    for (const step of [undefined, null, -1, 1.5, '120', NaN, 151]) {
      for (const hidden of [false, true]) {
        const out = at(step, hidden);
        assert.equal(out.allowed.length, 0);
        assert.match(failureLine(out.failed[0], 150), /資料不完整/);
        assert.doesNotMatch(failureLine(out.failed[0], 150), /--until=|undefined|NaN/);
      }
    }
    assert.match(failureLine(at(0).failed[0], 150), /第一次操作前/);
    assert.match(at(99).failed[0].allowInvalid, /早於/);
    assert.equal(at(100).allowed.length, 1);
  });

  it('一般任務第 120、130 步都計入總種子數，同一種子只計一次', () => {
    const ordinary = source.replace('hidden: true', 'hidden: false');
    const makeRun = (seed, step) => run(seed, { demo: page([hit('demo-1', 4, step)]) });
    const runs = [makeRun(1, 120), makeRun(2, 130)];
    const opts = { minLevel: 3, minStep: 125 };
    const config = { ...base, hash: hash(ordinary) };
    const failed = summarize(runs, opts, list(config));
    assert.equal(failed.allowed.length, 0);
    assert.match(failureLine(failed.failed[0], 150), /共 2 個種子命中/);
    assert.match(failed.failed[0].allowInvalid, /超過保留上限 1/);
    const permitted = summarize(runs, opts, list({ ...config, maxSeeds: 2 }));
    assert.match(allowedLine(permitted.allowed[0]), /共 2 個種子命中/);
    assert.match(allowedLine(permitted.allowed[0]), /達原不合格條件的種子 1）/);
    assert.equal(summarize([runs[0], makeRun(1, 130)], opts, list(config)).allowed.length, 1);
    assert.equal(summarize([runs[1]], opts, list(config)).retained.length, 1);
  });

  it('掃描終端與 JSON 各報一次失效原因，有無不合格命中分別回 1、0', () => {
    // 僅置換昂貴的瀏覽器子程序；CLI、清單解析、報表寫入與結束碼都走正式入口。
    const tools = path.join(root, 'tools');
    fs.mkdirSync(path.join(tools, 'playtest'), { recursive: true });
    fs.copyFileSync(scanner, path.join(tools, 'fluke-scan.cjs'));
    fs.writeFileSync(path.join(root, 'demo.html'), '');
    fs.writeFileSync(path.join(root, 'js/missions/index.js'), "window.LAB_LIVE_MODULES = ['demo'];");
    fs.writeFileSync(path.join(tools, 'playtest.cjs'), `
      const fs = require('fs'), path = require('path');
      const accidental = JSON.parse(process.env.REVIEW_HITS);
      const pages = { demo: { accidental, confirmed: [], pending: [] } };
      fs.writeFileSync(path.join(process.env.LAB_PLAYTEST_DIR, 'playtest-report.json'), JSON.stringify({seed: 1, steps: 150, pages}));
    `);
    const temporaryCli = path.join(tools, 'fluke-scan.cjs');
    const env = { ...process.env, LAB_TEMP_DIR: root };
    const dep = 'js/data.js';
    fs.writeFileSync(path.join(root, dep), 'const delta = 1;');
    const fresh = hash(source, [dep]);
    const entries = { 'demo-1': { ...base, hash: fresh, deps: [dep] }, missing: { ...base, hash: fresh } };
    const allowFile = path.join(tools, 'playtest/fluke-allow.cjs');
    fs.writeFileSync(allowFile, 'module.exports = ' + JSON.stringify({ demo: entries }));
    const cli = (...args) => spawnSync(process.execPath, [temporaryCli, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true });
    const query = cli('--hash', 'demo:demo-1');
    assert.equal(query.status, 0, query.stderr);
    assert.equal(query.stdout.trim(), fresh);
    fs.writeFileSync(path.join(root, dep), 'const delta = 2;');
    for (const hits of [[], [hit('demo-1', 4, 150, true)]]) {
      env.REVIEW_HITS = JSON.stringify(hits);
      const out = cli('demo', '--seeds=1');
      assert.equal(out.status, hits.length ? 1 : 0, out.stderr);
      assert.equal(out.stdout.match(/保留清單已失效/g)?.length, 2);
      assert.match(out.stdout, /⚠ demo missing.*找不到任務 missing/);
      const summary = JSON.parse(fs.readFileSync(path.join(root, '.shots/fluke-scan.json'))).summary;
      assert.deepEqual(summary.invalidAllow.map(x => x.id), hits.length ? ['missing'] : ['demo-1', 'missing']);
      assert.equal(summary.failed.length, hits.length);
      assert.match(out.stdout, hits.length ? /✗ demo demo-1.*雜湊/ : /⚠ demo demo-1.*雜湊/);
    }
  });

  it('--hash 拒絕多餘冒號、引數、空值、混用掃描與說明模式', () => {
    for (const args of [
      ['--hash', 'tides:tides-h2:extra'], ['tides', '--bogus', '--hash', 'tides:tides-h2'],
      ['--hash', 'tides:tides-h2', 'extra'], ['--hash', 'tides:'], ['--hash', ':tides-h2'],
      ['--hash'], ['--help', '--hash', 'tides:tides-h2'], ['--hash=tides:tides-h2']
    ]) {
      const r = spawnSync(process.execPath, [scanner, ...args], { encoding: 'utf8', windowsHide: true });
      assert.equal(r.status, 2, args.join(' '));
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /--hash/);
    }
  });
});
