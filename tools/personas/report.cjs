'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { profiles } = require('./model.cjs');

const SCHEMA = 1;

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; return null; }
}

function atomicWrite(filename, text) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = filename + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function writeJSON(file, value) {
  atomicWrite(file, JSON.stringify(value, null, 2) + '\n');
}

const esc = s => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/[|<>]/g, c => ({ '|': '&#124;', '<': '&lt;', '>': '&gt;' })[c]);
const sec = ms => Number.isFinite(ms) ? (ms / 1000).toFixed(2) + ' 秒' : '—';
const inline = String.fromCharCode(96);

function markdown(report) {
  const findings = report.runs.flatMap(run => run.findings.map(item => ({ run, item })));
  const sections = [
    '# 多種玩家模擬試玩', '',
    '執行 ' + report.id + '，種子 ' + report.seed + '，執行時段 ' + (report.nightly ? '22:30–06:00（臺灣時間）' : '手動') + '。' +
      (report.until !== null ? ' 重現到第 ' + report.until + ' 步。' : ''),
    '本機 Chromium 與假後端。固定種子控制操作意圖和模擬亂數。裝置負載與畫面更新時刻另行記錄。', ''
  ];
  for (const [level, title] of [['confirmed', '確定是問題'], ['pending', '待人工確認']]) {
    sections.push('## ' + title, '');
    const items = findings.filter(x => x.item.level === level);
    if (!items.length) sections.push('本批沒有紀錄。', '');
    for (const { run, item } of items) {
      sections.push('- **' + esc(run.slug + '／' + profiles[run.persona].name) + '**，種子 ' + run.seed + '，第 ' + item.step + ' 步。' +
        ' ' + esc(item.msg) + (item.count > 1 ? '（共 ' + item.count + ' 次）' : '') +
        (item.shot ? ' [當步截圖](' + item.shot + ')' : ''), '',
        '  ' + inline + item.repro + inline, '');
    }
  }
  sections.push('## 各科與各玩家', '', '已回寫 ' + report.runs.length + '／' + report.planned +
    ' 組。' + (report.stop ? ' 暫停原因為' + esc(report.stop) + '。' : ''), '',
    '| 科目 | 實驗 | 玩家 | 使用習慣 | 步數 | 耗時 | 已得星任務 | 確定／待確認 |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: |');
  for (const r of report.runs) {
    sections.push('| ' + [
      r.subject, r.slug, profiles[r.persona].name, r.habit.summary, r.actions.length, sec(r.elapsedMs),
      r.completed.length, r.findings.filter(x => x.level === 'confirmed').length + '／' + r.findings.filter(x => x.level === 'pending').length
    ].map(esc).join(' | ') + ' |');
  }
  const groups = new Map();
  for (const r of report.runs) {
    const key = r.subject + '／' + profiles[r.persona].name;
    const totals = groups.get(key) || { pages: 0, errors: 0, pending: 0, stars: 0, ms: 0 };
    totals.pages++;
    totals.errors += r.findings.filter(x => x.level === 'confirmed').length;
    totals.pending += r.findings.filter(x => x.level === 'pending').length;
    totals.stars += r.completed.length;
    totals.ms += r.elapsedMs;
    groups.set(key, totals);
  }
  sections.push('', '| 科目及玩家 | 組數 | 已得星任務 | 確定／待確認 | 合計耗時 |', '| --- | ---: | ---: | ---: | ---: |');
  for (const [key, g] of groups) sections.push('| ' + [esc(key), g.pages, g.stars, g.errors + '／' + g.pending, sec(g.ms)].join(' | ') + ' |');
  sections.push('', '## 難度表', '',
    '步數以一次提交數值、按鍵或點按為一個有意義的介面操作。以該路徑首次驗證得星為準。等待動畫與載入不計步。表內的最短值只涵蓋已驗證的路徑。', '',
    '| 實驗 | 玩家 | 任務 | 狀態 | 步數 | 秒數 | 補充 |', '| --- | --- | --- | --- | ---: | ---: | --- |');
  let n = 0;
  for (const r of report.runs) {
    for (const m of r.missions) {
      n++;
      sections.push('| ' + [r.slug, profiles[r.persona].name, m.id, m.status, m.steps ?? '—', sec(m.elapsedMs), m.note].map(esc).join(' | ') + ' |');
    }
  }
  if (!n) sections.push('| — | — | — | 本批未量測 | — | — | — |');
  const shortest = new Map();
  for (const r of report.runs) {
    for (const m of r.missions) {
      if (!m.status.startsWith('✓') || m.steps == null) continue;
      const old = shortest.get(m.id);
      if (!old || old.steps > m.steps || old.steps === m.steps && old.elapsedMs > m.elapsedMs) shortest.set(m.id, { ...m, run: r });
    }
  }
  sections.push('', '### 本批每則任務最短的成功路徑', '', '| 任務 | 玩家 | 步數 | 耗時 |', '| --- | --- | ---: | ---: |');
  for (const [id, m] of shortest) sections.push('| ' + [id, profiles[m.run.persona].name, m.steps, sec(m.elapsedMs)].map(esc).join(' | ') + ' |');
  if (!shortest.size) sections.push('| — | — | — | — |');
  sections.push('', '## 補充量測', '');
  for (const r of report.runs) {
    const m = r.metrics;
    const fields = [];
    if (m.firstStar) fields.push('首顆星第 ' + m.firstStar.step + ' 步，' + sec(m.firstStar.elapsedMs));
    if (m.firstStar === null) fields.push('本次未得星');
    if (m.keyboardReached != null) fields.push('鍵盤找到 ' + m.keyboardReached + ' 個控制項');
    if (m.invalidInputs) fields.push('無效輸入觀察 ' + m.invalidInputs.length + ' 次');
    if (m.rounds) fields.push('破壞操作量測 ' + m.rounds.length + ' 輪，間隔與 JS heap 見 JSON');
    if (m.resume) fields.push('離開及返回量測 ' + m.resume.length + ' 次');
    if (m.scroll) fields.push('手勢／讀數對照 ' + m.scroll.length + ' 組');
    if (r.blockedRequests) fields.push('外部請求攔截 ' + r.blockedRequests + ' 次');
    if (fields.length || r.screenshot) {
      sections.push('- ' + esc(r.slug + '／' + profiles[r.persona].name + (fields.length ? '，' + fields.join('。') : '')) +
        (r.screenshot ? ' [操作畫面](' + r.screenshot + ')' : ''), '');
    }
  }
  return sections.join('\n') + '\n';
}

function writeReport(dir, report, suffix = '') {
  const stem = 'personas-report' + suffix;
  writeJSON(path.join(dir, stem + '.json'), report);
  atomicWrite(path.join(dir, stem + '.md'), markdown(report));
}

module.exports = { SCHEMA, readJSON, writeJSON, markdown, writeReport };
