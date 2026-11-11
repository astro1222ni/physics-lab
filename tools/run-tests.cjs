#!/usr/bin/env node
/* run-tests.cjs — 執行 tests/ 裡所有物理核心的單元測試（Windows、macOS、Linux 都能用）。用法：npm test */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'tests');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();
const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  const last = ((r.stdout || '').trim().split('\n').pop() || '').trim();
  if (r.status === 0) console.log('✓ ' + f + (last ? '　' + last : ''));
  else { failed.push(f); console.log('✗ ' + f + '\n' + (r.stdout || '') + (r.stderr || '')); }
}
console.log(failed.length ? `\n${failed.length} 個測試檔失敗：${failed.join('、')}` : `\n${files.length} 個測試檔全部通過。`);
process.exit(failed.length ? 1 : 0);
