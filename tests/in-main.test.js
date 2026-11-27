'use strict';
/* in-main.test.js — tools/in-main.cjs 單元與迷你暫存 git repo 整合測試 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const IM = require('../tools/in-main.cjs');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// 1. 參數解析
test('parseArgs：正常與錯誤情況', () => {
  assert.deepStrictEqual(IM.parseArgs(['lab-bio']), { target: 'lab-bio', base: 'origin/main', json: false });
  assert.deepStrictEqual(IM.parseArgs(['abc..def', '--base', 'main', '--json']), { target: 'abc..def', base: 'main', json: true });
  assert.deepStrictEqual(IM.parseArgs(['lab-bio', '--base=main']), { target: 'lab-bio', base: 'main', json: false });
  assert.strictEqual(IM.parseArgs(['--help']).help, true);
  assert.ok(IM.parseArgs([]).error);
  assert.ok(IM.parseArgs(['a', 'b']).error);
  assert.ok(IM.parseArgs(['a', '--unknown']).error);
  assert.ok(IM.parseArgs(['a', '--base']).error);
});

// 2. stamp 正規化規則
test('normalizeText：HTML 忽略 ?v= 與 lab-updated，不影響實質內容', () => {
  const a = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<meta name="lab-updated" content="2026-11-26 10:00">',
    '<link rel="stylesheet" href="lab.css?v=202611261000">',
    '<script src="js/missions/foo.js?v=202611261000"></script>',
    '<img src="img/thumbs/foo.webp?v=abcd1234">',
    '<p>內容</p>'
  ].join('\r\n');
  const b = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<meta name="lab-updated" content="2026-11-27 19:50">',
    '<link rel="stylesheet" href="lab.css?v=202611271950">',
    '<script src="js/missions/foo.js?v=202611271950"></script>',
    '<img src="img/thumbs/foo.webp?v=9999ffff">',
    '<p>內容</p>'
  ].join('\n');
  assert.strictEqual(IM.normalizeText('foo.html', a), IM.normalizeText('foo.html', b));

  const c = b.replace('<p>內容</p>', '<p>改了</p>');
  assert.notStrictEqual(IM.normalizeText('foo.html', a), IM.normalizeText('foo.html', c));
});

test('normalizeText：tools/page-updated.json 只忽略時間戳 t，保留指紋 h', () => {
  const j1 = JSON.stringify({ 'a.html': { h: '1111aaaa', t: '2026-11-26 10:00' } });
  const j2 = JSON.stringify({ 'a.html': { h: '1111aaaa', t: '2026-11-27 19:50' } });
  const j3 = JSON.stringify({ 'a.html': { h: '2222bbbb', t: '2026-11-27 19:50' } });
  assert.strictEqual(IM.normalizeText('tools/page-updated.json', j1), IM.normalizeText('tools/page-updated.json', j2));
  assert.notStrictEqual(IM.normalizeText('tools/page-updated.json', j1), IM.normalizeText('tools/page-updated.json', j3));
});

// 3. 差行數計算
test('countDiffLines：精確計算增刪行', () => {
  const d0 = IM.countDiffLines('a\nb\nc\n', 'a\nb\nc\n');
  assert.strictEqual(d0.diffLines, 0);

  const d1 = IM.countDiffLines('a\nb\nc\n', 'a\nB\nc\nd\n');
  assert.strictEqual(d1.added, 2);
  assert.strictEqual(d1.deleted, 1);
  assert.strictEqual(d1.diffLines, 3);
});

// 4. 真實暫存 git repo 整合測試（涵蓋 cherry-pick/squash、stamp-only、不同、未上線、刪檔、中文檔名、結束碼）
test('compareTarget：迷你 git repo 全情境驗證', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'in-main-test-'));
  try {
    git(tmp, ['init', '-b', 'main']);
    git(tmp, ['config', 'user.email', 'test@example.com']);
    git(tmp, ['config', 'user.name', 'Test']);

    const write = (rel, content) => {
      const full = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    };

    write('same.js', 'const x = 1;\n');
    write('page.html', '<meta name="lab-updated" content="2026-11-20 00:00">\n<script src="js/a.js?v=1"></script>\n<p>v1</p>\n');
    write('diff.js', 'line1\nline2\nline3\n');
    write('del-both.txt', 'bye\n');
    write('del-branch-only.txt', 'still in main\n');
    write('中文檔.txt', '初始\n');
    git(tmp, ['add', '.']);
    git(tmp, ['commit', '-m', 'init']);

    // 開功能分支 feat
    git(tmp, ['checkout', '-b', 'feat']);
    write('same.js', 'const x = 2;\n');
    write('page.html', '<meta name="lab-updated" content="2026-11-26 12:00">\n<script src="js/a.js?v=202611261200"></script>\n<p>v2</p>\n');
    write('diff.js', 'line1\nline2-feat\nline3\nline4\n');
    write('new-only.js', 'brand new\n');
    write('中文檔.txt', '已合併版本\n');
    fs.unlinkSync(path.join(tmp, 'del-both.txt'));
    fs.unlinkSync(path.join(tmp, 'del-branch-only.txt'));
    git(tmp, ['add', '-A']);
    git(tmp, ['commit', '-m', 'feat changes']);

    // 切回 main，模擬整批合併／cherry-pick：same.js、page.html（不同 stamp）、中文檔、del-both.txt 已進 main；
    // diff.js 在 main 被改成別的版本；new-only.js 未進 main；del-branch-only.txt 仍在 main
    git(tmp, ['checkout', 'main']);
    write('same.js', 'const x = 2;\n');
    write('page.html', '<meta name="lab-updated" content="2026-11-27 19:50">\n<script src="js/a.js?v=202611271950"></script>\n<p>v2</p>\n');
    write('diff.js', 'line1\nline2-main\nline3\n');
    write('中文檔.txt', '已合併版本\n');
    fs.unlinkSync(path.join(tmp, 'del-both.txt'));
    git(tmp, ['add', '-A']);
    git(tmp, ['commit', '-m', 'main batch apply']);

    const rep = IM.compareTarget({ target: 'feat', base: 'main', cwd: tmp });
    assert.strictEqual(rep.summary.total, 7);
    assert.strictEqual(rep.summary.inMain, 4);
    assert.strictEqual(rep.summary.different, 1);
    assert.strictEqual(rep.summary.notInMain, 2);

    const byFile = arr => new Map(arr.map(x => [x.file, x]));
    const im = byFile(rep.inMain);
    assert.strictEqual(im.get('same.js').reason, 'identical');
    assert.strictEqual(im.get('page.html').reason, 'stamp-only');
    assert.strictEqual(im.get('page.html').stampOnly, true);
    assert.strictEqual(im.get('中文檔.txt').reason, 'identical');
    assert.strictEqual(im.get('del-both.txt').reason, 'deleted-in-both');

    const df = byFile(rep.different);
    assert.strictEqual(df.get('diff.js').diffLines, 3); // line2-main vs line2-feat (+1/-1) + line4 (+1)

    const nm = byFile(rep.notInMain);
    assert.strictEqual(nm.get('new-only.js').reason, 'missing-in-base');
    assert.strictEqual(nm.get('del-branch-only.txt').reason, 'still-in-base');

    // 再開一條全部已上線的分支 feat-done，驗證結束碼 0
    git(tmp, ['checkout', '-b', 'feat-done', 'main~1']);
    write('same.js', 'const x = 2;\n');
    git(tmp, ['add', 'same.js']);
    git(tmp, ['commit', '-m', 'already in main']);

    const r1 = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/in-main.cjs'), 'feat', '--base', 'main', '--json'], { cwd: tmp, encoding: 'utf8', windowsHide: true });
    assert.strictEqual(r1.status, 1);
    assert.strictEqual(JSON.parse(r1.stdout).summary.notInMain, 2);

    const r0 = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/in-main.cjs'), 'feat-done', '--base', 'main'], { cwd: tmp, encoding: 'utf8', windowsHide: true });
    assert.strictEqual(r0.status, 0);

    const r2 = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/in-main.cjs'), 'no-such-branch', '--base', 'main'], { cwd: tmp, encoding: 'utf8', windowsHide: true });
    assert.strictEqual(r2.status, 2);

    // 5. 無 NUL byte 的非法 UTF-8 二進位檔（0x80 vs 0x81）不可誤判成已上線
    git(tmp, ['checkout', 'main']);
    write('blob.bin', Buffer.from([0x80]));
    git(tmp, ['add', 'blob.bin']);
    git(tmp, ['commit', '-m', 'add bin in main']);

    git(tmp, ['checkout', '-b', 'bin-feat']);
    write('blob.bin', Buffer.from([0x81]));
    git(tmp, ['add', 'blob.bin']);
    git(tmp, ['commit', '-m', 'change bin in branch']);

    const repBin = IM.compareTarget({ target: 'bin-feat', base: 'main', cwd: tmp });
    assert.strictEqual(repBin.summary.inMain, 0);
    assert.strictEqual(repBin.summary.different, 1);
    assert.strictEqual(repBin.different[0].file, 'blob.bin');
    assert.strictEqual(repBin.different[0].binary, true);

    // 6. 已合入祖先分支（merge-base === toSha）：標記 alreadyAncestor 並印明確範圍提示
    git(tmp, ['checkout', 'main']);
    const oldHead = git(tmp, ['rev-parse', 'HEAD~1']);
    git(tmp, ['branch', 'merged-old', oldHead]);
    const repAnc = IM.compareTarget({ target: 'merged-old', base: 'main', cwd: tmp });
    assert.strictEqual(repAnc.summary.total, 0);
    assert.strictEqual(repAnc.alreadyAncestor, true);
    const txtAnc = IM.formatReport(repAnc);
    assert.ok(txtAnc.includes('明確起訖範圍'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log(`${passed} 項通過`);
