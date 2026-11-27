'use strict';
/* snap.test.js — tools/snap.cjs 純函式單元測試（不開瀏覽器，快速納入 npm test） */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('../tools/snap.cjs');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
}

test('parseSizes：正常解析、去重與錯誤攔截', () => {
  const ok = S.parseSizes('412x915,844x390,1280x800,412x915');
  assert.strictEqual(ok.sizes.length, 3);
  assert.deepStrictEqual(ok.sizes.map(s => s.key), ['412x915', '844x390', '1280x800']);
  assert.ok(S.parseSizes('').error);
  assert.ok(S.parseSizes('412').error);
  assert.ok(S.parseSizes('10x10').error);
});

test('parseDoAction：支援 set/click/wait/eval 並拒絕非法語法', () => {
  assert.deepStrictEqual(S.parseDoAction('set:#th=30').action, { kind: 'set', selector: '#th', value: '30' });
  assert.deepStrictEqual(S.parseDoAction('click:#swap').action, { kind: 'click', selector: '#swap' });
  assert.deepStrictEqual(S.parseDoAction('wait:200').action, { kind: 'wait', ms: 200 });
  assert.deepStrictEqual(S.parseDoAction('eval:1+1').action, { kind: 'eval', code: '1+1' });
  assert.ok(S.parseDoAction('set:#th').error);
  assert.ok(S.parseDoAction('drag:#th').error);
  assert.ok(S.parseDoAction('wait:-5').error);
});

test('parseArgs：參數驗證、互斥檢查與安全性（防止路徑穿越）', () => {
  const ok = S.parseArgs(['refraction', 'before', '--sizes', '412x915,1280x800', '--do', 'set:#th=25', '--json']);
  assert.strictEqual(ok.slug, 'refraction');
  assert.strictEqual(ok.mode, 'before');
  assert.strictEqual(ok.sizes.length, 2);
  assert.strictEqual(ok.actions.length, 1);
  assert.deepStrictEqual(ok.actionsRaw, ['set:#th=25']);
  assert.strictEqual(ok.json, true);

  const htmlStrip = S.parseArgs(['refraction.html', 'after', '--no-replay']);
  assert.strictEqual(htmlStrip.slug, 'refraction');
  assert.strictEqual(htmlStrip.mode, 'after');
  assert.strictEqual(htmlStrip.noReplay, true);

  const evalOk = S.parseArgs(['refraction', 'after', '--replay-eval']);
  assert.strictEqual(evalOk.replayEval, true);

  assert.strictEqual(S.parseArgs(['--help']).help, true);
  assert.ok(S.parseArgs(['refraction']).error);
  assert.ok(S.parseArgs(['refraction', 'invalid']).error);
  assert.ok(S.parseArgs(['../evil', 'before']).error);
  assert.ok(S.parseArgs(['refraction', 'before', '--lang', 'fr']).error);
  assert.ok(S.parseArgs(['refraction', 'before', '--badflag']).error);
  assert.ok(S.parseArgs(['refraction', 'after', '--no-replay', '--do', 'set:#th=25']).error);
  assert.ok(S.parseArgs(['refraction', 'after', '--no-replay', '--replay-eval']).error);
});

test('resolveAfterActions：自動沿用安全操作、支援 --no-replay、攔截未授權 eval:', () => {
  const beforeSafe = {
    actions: [{ kind: 'set', selector: '#th', value: '30' }],
    actionsRaw: ['set:#th=30']
  };
  const r1 = S.resolveAfterActions({ actions: [], actionsRaw: [], noReplay: false, replayEval: false }, beforeSafe);
  assert.strictEqual(r1.replayedFromBefore, true);
  assert.deepStrictEqual(r1.actionsRaw, ['set:#th=30']);

  const r2 = S.resolveAfterActions({ actions: [], actionsRaw: [], noReplay: true, replayEval: false }, beforeSafe);
  assert.strictEqual(r2.replayedFromBefore, false);
  assert.deepStrictEqual(r2.actions, []);

  const beforeEval = {
    actions: [{ kind: 'eval', code: 'window.__x=1' }],
    actionsRaw: ['eval:window.__x=1']
  };
  const r3 = S.resolveAfterActions({ actions: [], actionsRaw: [], noReplay: false, replayEval: false }, beforeEval);
  assert.ok(r3.error && r3.error.includes('--replay-eval'));

  const r4 = S.resolveAfterActions({ actions: [], actionsRaw: [], noReplay: false, replayEval: true }, beforeEval);
  assert.strictEqual(r4.replayedFromBefore, true);
  assert.deepStrictEqual(r4.actionsRaw, ['eval:window.__x=1']);
});

test('sanitizeEventData：剔除時間戳鍵與函式、鍵序穩定', () => {
  const a = S.sanitizeEventData({ b: 2, a: 1, at: 1000, ts: 2000, fn: () => {} }, 0);
  const b = S.sanitizeEventData({ a: 1, b: 2, at: 9999, timestamp: 12345 }, 0);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  assert.strictEqual(JSON.stringify(a), '{"a":1,"b":2}');
});

test('diffSnapshots 與 formatDiff：無差異、有差異、略過尺寸與操作條件輸出', () => {
  const baseSnap = {
    size: '412x915',
    readings: { '#r1': '40.0°', '#r2': '25.4°' },
    controls: { '#th': '40' },
    events: [{ type: 'setup', data: { th1: 40 } }],
    canvas: { selector: '#cv', width: 412, height: 300, sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    pageErrors: []
  };
  const beforeDoc = { slug: 'refraction', sizes: ['412x915'], snapshots: { '412x915': baseSnap } };
  const sameAfter = { slug: 'refraction', sizes: ['412x915'], snapshots: { '412x915': JSON.parse(JSON.stringify(baseSnap)) } };

  const repSame = S.diffSnapshots(beforeDoc, sameAfter);
  assert.strictEqual(repSame.hasDiff, false);
  assert.deepStrictEqual(repSame.skippedSizes, []);
  const txtSame = S.formatDiff(repSame);
  assert.ok(txtSame.includes('✓ 412x915：無差異'));
  assert.strictEqual(txtSame.split('\n').length, 3);

  const changedSnap = JSON.parse(JSON.stringify(baseSnap));
  changedSnap.readings['#r1'] = '30.0°';
  changedSnap.controls['#th'] = '30';
  changedSnap.canvas.sha256 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const repDiff = S.diffSnapshots(beforeDoc, { slug: 'refraction', sizes: ['412x915'], snapshots: { '412x915': changedSnap } });
  assert.strictEqual(repDiff.hasDiff, true);
  assert.strictEqual(repDiff.totalDiffs, 3);
  const txtDiff = S.formatDiff(repDiff);
  assert.ok(txtDiff.includes('✗ 412x915：3 處差異'));
  assert.ok(txtDiff.includes('讀數 #r1：40.0° → 30.0°'));
  assert.ok(txtDiff.includes('主畫布雜湊 #cv：aaaaaaaaaaaa → bbbbbbbbbbbb'));

  // 縮小尺寸子集時列出未複驗基準尺寸，並標示操作條件不同
  const beforeMulti = {
    slug: 'refraction',
    sizes: ['412x915', '844x390', '1280x800'],
    actionsRaw: ['set:#th=30'],
    snapshots: { '412x915': baseSnap, '844x390': baseSnap, '1280x800': baseSnap }
  };
  const afterSub = {
    slug: 'refraction',
    sizes: ['412x915'],
    actionsRaw: [],
    snapshots: { '412x915': JSON.parse(JSON.stringify(baseSnap)) }
  };
  const repSub = S.diffSnapshots(beforeMulti, afterSub);
  assert.deepStrictEqual(repSub.skippedSizes, ['844x390', '1280x800']);
  assert.strictEqual(repSub.actionsMismatch, true);
  const txtSub = S.formatDiff(repSub);
  assert.ok(txtSub.includes('略過未複驗的基準尺寸（2 個）：844x390, 1280x800'));
  assert.ok(txtSub.includes('操作條件不同'));
});

test('diffSnapshots 拒絕跨站比對，且 CLI 讀到別站或未授權 eval 的 before 回傳結束碼 2', () => {
  assert.throws(
    () => S.diffSnapshots({ slug: 'refraction', snapshots: {} }, { slug: 'ohms-law', snapshots: {} }),
    /站台不符/
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-cli-test-'));
  try {
    const script = path.resolve(__dirname, '../tools/snap.cjs');
    fs.writeFileSync(
      path.join(tmp, 'before.json'),
      JSON.stringify({ slug: 'refraction', sizes: ['412x915'], snapshots: {} }),
      'utf8'
    );
    const r = spawnSync(process.execPath, [script, 'ohms-law', 'after', '--out', tmp], {
      encoding: 'utf8',
      windowsHide: true
    });
    assert.strictEqual(r.status, 2);
    assert.ok(r.stderr.includes('refraction'));
    assert.ok(r.stderr.includes('ohms-law'));

    // 未加 --replay-eval 時拒絕自動重播 eval:，開瀏覽器前即回 2
    fs.writeFileSync(
      path.join(tmp, 'before.json'),
      JSON.stringify({
        slug: 'refraction',
        sizes: ['412x915'],
        actions: [{ kind: 'eval', code: '1+1' }],
        actionsRaw: ['eval:1+1'],
        snapshots: {}
      }),
      'utf8'
    );
    const rEval = spawnSync(process.execPath, [script, 'refraction', 'after', '--out', tmp], {
      encoding: 'utf8',
      windowsHide: true
    });
    assert.strictEqual(rEval.status, 2);
    assert.ok(rEval.stderr.includes('--replay-eval'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI 結束碼 2：參數錯誤與缺少 before 快照', () => {
  const script = path.resolve(__dirname, '../tools/snap.cjs');
  const rBad = spawnSync(process.execPath, [script, 'refraction'], { encoding: 'utf8', windowsHide: true });
  assert.strictEqual(rBad.status, 2);

  const rMissing = spawnSync(process.execPath, [script, 'no-such-lab-xyz', 'before'], { encoding: 'utf8', windowsHide: true });
  assert.strictEqual(rMissing.status, 2);
});

console.log(`${passed} 項通過`);
