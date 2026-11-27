'use strict';
/* triage.test.js — tools/triage.cjs 單元與反例整合測試 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const T = require('../tools/triage.cjs');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
}

test('parseArgs：驗證合法與非法旗標、保留 --context 0', () => {
  const ok0 = T.parseArgs(['report.md', '--context', '0', '--json']);
  assert.strictEqual(ok0.context, 0);
  assert.strictEqual(ok0.json, true);
  assert.deepStrictEqual(ok0.files, ['report.md']);

  const okEq = T.parseArgs(['report.md', '--by=keyword', '--context=0']);
  assert.strictEqual(okEq.by, 'keyword');
  assert.strictEqual(okEq.context, 0);

  assert.strictEqual(T.parseArgs(['--help']).help, true);
  assert.ok(T.parseArgs([]).error);
  assert.ok(T.parseArgs(['report.md', '--by', 'typo']).error);
  assert.ok(T.parseArgs(['report.md', '--unknown']).error);
  assert.ok(T.parseArgs(['report.md', '--context', '-1']).error);
  assert.ok(T.parseArgs(['report.md', '--context', 'abc']).error);
  assert.ok(T.parseArgs(['report.md', '--by']).error);
});

test('tokenizeInlineCode 與 extractFileRefs：依 CommonMark 支援單／雙／三反引號、內層引號與前後空白', () => {
  // 單反引號＋內含雙引號與單引號＋前後空白
  const singleText = 'js\\sample.js:2 與 `js/missions/foo.js:10-20` 及 `  load("vendor.js", \'other.js\')  `';
  const refs1 = T.extractFileRefs(singleText);
  assert.strictEqual(refs1.length, 2);
  assert.deepStrictEqual(refs1[0], { file: 'js/sample.js', line: 2, endLine: null });
  assert.deepStrictEqual(refs1[1], { file: 'js/missions/foo.js', line: 10, endLine: 20 });
  assert.deepStrictEqual(T.extractSnippets(singleText, '').locSnippets, ["load(\"vendor.js\", 'other.js')"]);

  // 雙反引號包裹內含單反引號（範本字串）與尾端空白
  const doubleText = '`js/missing.js:7` ``const NESTED = `vendor.js` ``';
  assert.deepStrictEqual(T.extractFileRefs(doubleText), [{ file: 'js/missing.js', line: 7, endLine: null }]);
  assert.deepStrictEqual(T.extractSnippets(doubleText, '').locSnippets, ['const NESTED = `vendor.js`']);

  // 雙反引號包裹前後保護空白且內容以反引號起訖
  const paddedCode = '`` `vendor.js` ``';
  assert.deepStrictEqual(T.extractFileRefs(paddedCode), []);
  assert.deepStrictEqual(T.extractSnippets(paddedCode, '').locSnippets, ['`vendor.js`']);

  // 三反引號包裹內含雙反引號、單反引號、單引號、雙引號與前後空白
  const tripleText = '`js/missing.js:7` ```  const T = `` `vendor.js` `` + "a.js" + \'b.js\'  ```';
  assert.deepStrictEqual(T.extractFileRefs(tripleText), [{ file: 'js/missing.js', line: 7, endLine: null }]);
  assert.deepStrictEqual(T.extractSnippets(tripleText, '').locSnippets, ['const T = `` `vendor.js` `` + "a.js" + \'b.js\'']);

  // 未閉合孤立反引號不可吞掉後續獨立檔案參照
  const unclosed = '單獨 ` 後續提到 js/sample.js:2';
  assert.deepStrictEqual(T.extractFileRefs(unclosed), [{ file: 'js/sample.js', line: 2, endLine: null }]);
});

test('probeItem：來源讀不到判「待查（來源未讀到）」、Windows 路徑正常命中、跨行精確定位、描述欄不蓋過位置欄', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-test-'));
  try {
    const jsDir = path.join(tmp, 'js');
    fs.mkdirSync(jsDir, { recursive: true });
    fs.writeFileSync(
      path.join(jsDir, 'sample.js'),
      [
        'const prefix = 0;',
        'const generic = oldPrefix + 1;',
        'function helper() { load("vendor.js"); }',
        'const crossing =',
        '  prefix + 42;',
        'const tail = 99;',
        'const repeat = targetVal;',
        'const mid = 1;',
        'const repeat2 = targetVal;'
      ].join('\n') + '\n',
      'utf8'
    );
    fs.writeFileSync(path.join(jsDir, 'locked.js'), 'const lockedFlag = oldPrefix + 2;\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'vendor.js'), 'const SOURCE = "vendor.js";\nconst NESTED = `vendor.js`;\n', 'utf8');

    // 1. Windows 反斜線路徑 js\sample.js:2 應正常讀取並判「仍存在」
    const itemWin = T.parseReportLine(
      '- **#1** 【中】sample｜5｜反斜線測試｜`js\\sample.js:2` `generic = oldPrefix`｜建議｜高',
      'r.md', 1, 1
    );
    const resWin = T.probeItem(itemWin, tmp, 0);
    assert.strictEqual(resWin.status, T.STATUS.PRESENT);
    assert.strictEqual(resWin.matchedFile, 'js/sample.js');
    assert.strictEqual(resWin.matchedLine, 2);
    assert.strictEqual(resWin.contextBlock.length, 1); // --context 0 僅附命中該 1 行
    assert.ok(resWin.contextBlock[0].includes('generic = oldPrefix'));

    // 2. 缺失檔案 js/missing.js:7 應判「待查（來源未讀到）」，絕不判成已修或未命中
    const itemMiss = T.parseReportLine(
      '- **#2** 【中】sample｜5｜缺檔測試｜`js/missing.js:7` `generic = oldPrefix`｜建議｜高',
      'r.md', 2, 2
    );
    const resMiss = T.probeItem(itemMiss, tmp, 2);
    assert.strictEqual(resMiss.status, T.STATUS.UNREADABLE);
    assert.deepStrictEqual(resMiss.missingFiles, ['js/missing.js']);

    // 3. 跨行命中 const crossing =\n  prefix + 42 必須精確定位到第 4 行，而非第 1 行 const prefix
    const itemCross = T.parseReportLine(
      '- **#3** 【中】sample｜5｜跨行測試｜`js/sample.js:4` `const crossing = prefix + 42`｜建議｜高',
      'r.md', 3, 3
    );
    const resCross = T.probeItem(itemCross, tmp, 1);
    assert.strictEqual(resCross.status, T.STATUS.PRESENT);
    assert.strictEqual(resCross.matchedLine, 4);
    assert.ok(resCross.contextBlock.some(l => l.startsWith('>   4 | const crossing =')));

    // 4. 多處命中時優先靠近報告行號（第 7 行 vs 第 9 行，報告指第 9 行應定位第 9 行）
    const itemNear = T.parseReportLine(
      '- **#4** 【低】sample｜5｜靠近行號｜`js/sample.js:9` `targetVal`｜建議｜高',
      'r.md', 4, 4
    );
    const resNear = T.probeItem(itemNear, tmp, 0);
    assert.strictEqual(resNear.status, T.STATUS.PRESENT);
    assert.strictEqual(resNear.matchedLine, 9);

    // 5. 位置欄不存在的片段 obsoleteExpression 不得被描述欄一般識別字 generic 蓋過
    const itemDesc = T.parseReportLine(
      '- **#5** 【中】sample｜5｜描述提到 `generic` 變數但主要片段已改｜`js/sample.js:2` `obsoleteExpression`｜建議｜高',
      'r.md', 5, 5
    );
    const resDesc = T.probeItem(itemDesc, tmp, 0);
    assert.strictEqual(resDesc.status, T.STATUS.MISS);
    assert.ok(resDesc.auxMatch && resDesc.auxMatch.snippet === 'generic' && resDesc.auxMatch.line === 2);

    // 6. 主要來源（位置欄）缺檔時，描述欄提到的另一個存在檔案不可替它判「仍存在」，只可列入 auxMatch
    const itemMixedSrc = T.parseReportLine(
      '- **#6** 【中】sample｜5｜對照 `js/sample.js:2` 寫法修正｜`js/missing.js:7` `generic = oldPrefix`｜建議｜高',
      'r.md', 6, 6
    );
    const resMixedSrc = T.probeItem(itemMixedSrc, tmp, 1);
    assert.strictEqual(resMixedSrc.status, T.STATUS.UNREADABLE);
    assert.strictEqual(resMixedSrc.matchedFile, 'js/missing.js');
    assert.strictEqual(resMixedSrc.matchedLine, 7);
    assert.deepStrictEqual(resMixedSrc.missingFiles, ['js/missing.js']);
    assert.strictEqual(resMixedSrc.contextBlock.length, 0);
    assert.deepStrictEqual(resMixedSrc.auxMatch, {
      file: 'js/sample.js',
      line: 2,
      snippet: 'generic = oldPrefix'
    });

    // 7. 單一來源檔 I/O 讀取失敗（跨平台模擬 EBUSY 鎖檔）不可中斷整批分流
    const lockedPath = path.join(jsDir, 'locked.js');
    const busyReader = p => {
      if (path.resolve(p) === path.resolve(lockedPath)) {
        const err = new Error('EBUSY: resource busy or locked, open ' + p);
        err.code = 'EBUSY';
        throw err;
      }
      return fs.readFileSync(p);
    };
    const itemOk = T.parseReportLine(
      '- **#7** 【中】sample｜5｜可讀來源｜`js/sample.js:2` `generic = oldPrefix`｜建議｜高',
      'r.md', 7, 7
    );
    const itemLocked = T.parseReportLine(
      '- **#8** 【高】sample｜5｜被鎖來源｜`js/locked.js:1` `lockedFlag = oldPrefix`｜建議｜高',
      'r.md', 8, 8
    );
    const batch = [itemOk, itemLocked].map(it => T.probeItem(it, tmp, 0, { readFile: busyReader }));
    assert.strictEqual(batch[0].status, T.STATUS.PRESENT);
    assert.strictEqual(batch[0].matchedFile, 'js/sample.js');
    assert.strictEqual(batch[1].status, T.STATUS.UNREADABLE);
    assert.deepStrictEqual(batch[1].missingFiles, ['js/locked.js']);
    assert.strictEqual(batch[1].readErrors.length, 1);
    assert.strictEqual(batch[1].readErrors[0].code, 'EBUSY');

    // 7b. 正向反例：片段 `const SOURCE = "vendor.js"` 不可讓存在的 vendor.js 頂替缺檔的 js/missing.js
    const itemPathLiteralPos = T.parseReportLine(
      '- **#9** 【中】sample｜5｜字串常值不當來源｜`js/missing.js:7` `const SOURCE = "vendor.js"`｜建議｜高',
      'r.md', 9, 9
    );
    assert.deepStrictEqual(itemPathLiteralPos.locRefs, [{ file: 'js/missing.js', line: 7, endLine: null }]);
    const resPathLiteralPos = T.probeItem(itemPathLiteralPos, tmp, 0);
    assert.strictEqual(resPathLiteralPos.status, T.STATUS.UNREADABLE);
    assert.strictEqual(resPathLiteralPos.matchedFile, 'js/missing.js');
    assert.strictEqual(resPathLiteralPos.matchedLine, 7);
    assert.deepStrictEqual(resPathLiteralPos.missingFiles, ['js/missing.js']);

    // 7c. 反向反例：位置欄只有片段 `load("vendor.js")`，描述欄有 js/sample.js:3，應以描述欄檔案為主要來源並判「仍存在」
    const itemPathLiteralRev = T.parseReportLine(
      '- **#10** 【中】sample｜5｜在 js/sample.js:3 呼叫載入｜`load("vendor.js")`｜建議｜高',
      'r.md', 10, 10
    );
    assert.deepStrictEqual(itemPathLiteralRev.locRefs, []);
    assert.deepStrictEqual(itemPathLiteralRev.descRefs, [{ file: 'js/sample.js', line: 3, endLine: null }]);
    const resPathLiteralRev = T.probeItem(itemPathLiteralRev, tmp, 0);
    assert.strictEqual(resPathLiteralRev.status, T.STATUS.PRESENT);
    assert.strictEqual(resPathLiteralRev.matchedFile, 'js/sample.js');
    assert.strictEqual(resPathLiteralRev.matchedLine, 3);
    assert.strictEqual(resPathLiteralRev.contextBlock.length, 1);

    // 7d. 雙反引號包裹內含單反引號範本字串（Codex 複驗反例）：
    //     vendor.js 存在且含 const NESTED = `vendor.js`;，但位置欄主來源 js/missing.js:7 缺檔，
    //     必須維持「待查（來源未讀到）」且保留完整片段 const NESTED = `vendor.js`
    const itemDoubleTick = T.parseReportLine(
      '- **#11** 【中】sample｜5｜雙反引號範本字串｜`js/missing.js:7` ``const NESTED = `vendor.js` ``｜建議｜高',
      'r.md', 11, 11
    );
    assert.deepStrictEqual(itemDoubleTick.locRefs, [{ file: 'js/missing.js', line: 7, endLine: null }]);
    assert.deepStrictEqual(itemDoubleTick.locSnippets, ['const NESTED = `vendor.js`']);
    const resDoubleTick = T.probeItem(itemDoubleTick, tmp, 0);
    assert.strictEqual(resDoubleTick.status, T.STATUS.UNREADABLE);
    assert.strictEqual(resDoubleTick.matchedFile, 'js/missing.js');
    assert.strictEqual(resDoubleTick.matchedLine, 7);
    assert.strictEqual(resDoubleTick.matchedSnippet, 'const NESTED = `vendor.js`');
    assert.deepStrictEqual(resDoubleTick.missingFiles, ['js/missing.js']);

    // 7e. 雙反引號包裹範本字串，且來源檔（vendor.js）本身即為位置欄指定目標時，應完整命中第 2 行
    const itemDoubleTickHit = T.parseReportLine(
      '- **#12** 【中】sample｜5｜雙反引號實際命中｜`vendor.js:2` ``const NESTED = `vendor.js` ``｜建議｜高',
      'r.md', 12, 12
    );
    const resDoubleTickHit = T.probeItem(itemDoubleTickHit, tmp, 0);
    assert.strictEqual(resDoubleTickHit.status, T.STATUS.PRESENT);
    assert.strictEqual(resDoubleTickHit.matchedFile, 'vendor.js');
    assert.strictEqual(resDoubleTickHit.matchedLine, 2);
    assert.strictEqual(resDoubleTickHit.matchedSnippet, 'const NESTED = `vendor.js`');

    // 7f. 三反引號包裹內含雙反引號與單反引號、前後空白，且描述欄指向實際檔案的反向案例
    fs.writeFileSync(path.join(jsDir, 'triple.js'), 'const a = 1;\nconst T = `` `vendor.js` `` + \'x.js\' + "y.js";\n', 'utf8');
    const itemTripleRev = T.parseReportLine(
      '- **#13** 【中】sample｜5｜於 js/triple.js:2 出現｜```  const T = `` `vendor.js` `` + \'x.js\' + "y.js"  ```｜建議｜高',
      'r.md', 13, 13
    );
    assert.deepStrictEqual(itemTripleRev.locRefs, []);
    const resTripleRev = T.probeItem(itemTripleRev, tmp, 0);
    assert.strictEqual(resTripleRev.status, T.STATUS.PRESENT);
    assert.strictEqual(resTripleRev.matchedFile, 'js/triple.js');
    assert.strictEqual(resTripleRev.matchedLine, 2);

    // 8. CLI 實測：--by typo 回結束碼 2；--json --context 0 回 0 且只帶 1 行上下文
    const mdFile = path.join(tmp, 'report.md');
    fs.writeFileSync(mdFile, '- **#1** 【中】sample｜5｜測試｜`js/sample.js:2` `generic = oldPrefix`｜建議｜高\n', 'utf8');
    const script = path.resolve(__dirname, '../tools/triage.cjs');

    const rTypo = spawnSync(process.execPath, [script, mdFile, '--root', tmp, '--by', 'typo'], { encoding: 'utf8', windowsHide: true });
    assert.strictEqual(rTypo.status, 2);
    assert.ok(rTypo.stderr.includes('--by'));

    const rCtx0 = spawnSync(process.execPath, [script, mdFile, '--root', tmp, '--json', '--context', '0'], { encoding: 'utf8', windowsHide: true });
    assert.strictEqual(rCtx0.status, 0);
    const parsedOut = JSON.parse(rCtx0.stdout);
    assert.strictEqual(parsedOut.items[0].contextBlock.length, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log(`${passed} 項通過`);
