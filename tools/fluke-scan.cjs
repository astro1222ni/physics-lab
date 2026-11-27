#!/usr/bin/env node
/*
 * fluke-scan.cjs — 逐一用多個種子試玩，只列出不合格項目。
 *
 * 用法：
 *   node tools/fluke-scan.cjs <代號>[,<代號>…] [--seeds 1112,1,7,42,2026] [--steps 150]
 *        [--min-level 3] [--min-step 25] [--compare <上次的 JSON>] [--json <輸出檔>] [--keep]
 *   -h、--help   顯示本說明
 *   --keep       保留每個種子的試玩報告、快取及日誌
 *
 * 隱藏任務一旦誤觸就不合格。一般任務達到最低等級且早於指定步數才列為不合格。
 * 同站同任務只計一次，有任何種子不合格就列為不合格。試玩已確認的問題也列為不合格。
 * 待確認項目按各站各種子的報告筆數計算。比較以站別及項目身分判斷新增與消失。
 * 預設報告為 .shots/fluke-scan.json。Windows 的各種子暫存放在 F:\測試暫存。
 * 結束碼：0 全部合格，1 有不合格項目，2 參數錯誤或掃描未完成。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PLAYTEST = path.join(__dirname, 'playtest.cjs');
const DEFAULTS = { seeds: [1112, 1, 7, 42, 2026], steps: 150, minLevel: 3, minStep: 25 };

function integer(value, label, min = 0) {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min) {
    throw new Error(label + ' 必須是大於或等於 ' + min + ' 的整數');
  }
  return n;
}

function parseArgs(args) {
  const opts = { ...DEFAULTS, json: path.join(ROOT, '.shots', 'fluke-scan.json'), keep: false };
  const slugs = new Set();
  const numbers = { '--steps': ['steps', 1], '--min-level': ['minLevel', 1], '--min-step': ['minStep', 0] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) {
      for (const slug of arg.split(',').map(s => s.trim())) {
        if (!/^[a-z0-9-]+$/.test(slug) || !fs.statSync(path.join(ROOT, slug + '.html'), { throwIfNoEntry: false })?.isFile()) {
          throw new Error('找不到實驗：' + (slug || '（空白代號）'));
        }
        slugs.add(slug);
      }
      continue;
    }
    if (arg === '--keep') {
      opts.keep = true;
      continue;
    }
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (!Object.hasOwn(numbers, flag) && !['--seeds', '--compare', '--json'].includes(flag)) {
      throw new Error('不認得的參數：' + arg);
    }
    const value = eq === -1 ? args[++i] : arg.slice(eq + 1);
    if (!value || value.startsWith('--')) throw new Error(flag + ' 缺少參數值');
    if (flag === '--seeds') {
      opts.seeds = [...new Set(value.split(',').map(s => integer(s.trim(), '--seeds')))];
    } else if (Object.hasOwn(numbers, flag)) {
      const [key, min] = numbers[flag];
      opts[key] = integer(value, flag, min);
    } else {
      opts[flag.slice(2)] = path.resolve(value);
    }
  }
  if (!slugs.size) throw new Error('請指定至少一個實驗代號（用 -h 查看用法）');
  const reserved = ['playtest-report.json', 'playtest-cache.json'].map(name => path.join(ROOT, '.shots', name).toLowerCase());
  if (reserved.includes(opts.json.toLowerCase())) throw new Error('--json 請指定試玩報告與快取以外的路徑');
  return { ...opts, slugs: [...slugs] };
}

function summarize(runs, { minLevel, minStep } = DEFAULTS) {
  const missions = new Map();
  const issues = new Map();
  let pending = 0;
  for (const { seed, pages } of runs) {
    for (const [slug, page] of Object.entries(pages)) {
      pending += page.pending.length;
      for (const { id, level, hidden, step } of page.accidental) {
        const key = JSON.stringify(['accidental', slug, id]);
        if (!missions.has(key)) missions.set(key, { key, type: 'accidental', slug, id, level, hidden, hits: [] });
        const failed = hidden === true || (level >= minLevel && step < minStep);
        missions.get(key).hits.push({ seed, step, failed });
      }
      for (const issue of page.confirmed) {
        const key = JSON.stringify(['confirmed', slug, issue.kind, issue.msg]);
        if (!issues.has(key)) issues.set(key, { key, type: 'confirmed', slug, issue, seeds: [] });
        const item = issues.get(key);
        if (!item.seeds.includes(seed)) item.seeds.push(seed);
      }
    }
  }
  const failed = [];
  const retained = [];
  for (const item of missions.values()) {
    (item.hits.some(hit => hit.failed) ? failed : retained).push(item);
  }
  return { failed: failed.concat([...issues.values()]), retained, pending };
}

function compareFailures(current, previous) {
  const currentKeys = new Set(current.map(item => item.key));
  const previousKeys = new Set(previous.map(item => item.key));
  return {
    added: [...currentKeys].filter(key => !previousKeys.has(key)),
    removed: [...previousKeys].filter(key => !currentKeys.has(key))
  };
}

async function runSeed(dir, seed, { slugs, steps }) {
  fs.mkdirSync(dir);
  const log = path.join(dir, 'playtest.log');
  const fd = fs.openSync(log, 'w');
  let problem;
  let report;
  try {
    const status = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [PLAYTEST, ...slugs, '--seed=' + seed, '--steps=' + steps, '--no-shots', '--quiet'], {
        cwd: ROOT, env: { ...process.env, LAB_PLAYTEST_DIR: dir }, stdio: ['ignore', fd, fd], windowsHide: true
      });
      child.once('error', reject);
      child.once('close', (code, signal) => resolve(code ?? signal));
    });
    if (status !== 0 && status !== 1) throw new Error('試玩工具結束狀態為 ' + status);
    const reportPath = path.join(dir, 'playtest-report.json');
    if (!fs.existsSync(reportPath)) throw new Error('沒有產生試玩報告');
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (report.seed !== seed || report.steps !== steps) throw new Error('試玩報告的種子或步數與要求不符');
    for (const slug of slugs) {
      const page = report.pages?.[slug];
      if (!page || page.cached || page.none || !['accidental', 'confirmed', 'pending'].every(key => Array.isArray(page[key]))) {
        throw new Error(slug + ' 缺少完整的試玩結果');
      }
      const toolError = page.pending.find(i => i.kind === 'tool');
      if (toolError) throw new Error(slug + '：' + toolError.msg);
    }
  } catch (err) {
    problem = err;
  } finally {
    fs.closeSync(fd);
  }
  if (problem) {
    const tail = fs.readFileSync(log, 'utf8').trimEnd().split(/\r?\n/).slice(-10).join('\n');
    throw new Error('種子 ' + seed + ' 試玩未完成：' + problem.message + (tail ? '\n' + tail : ''));
  }
  return report;
}

function failureLine(item, steps) {
  const stepsArg = steps === DEFAULTS.steps ? '' : ' --steps=' + steps;
  const command = seed => 'node tools/playtest.cjs ' + item.slug + ' --seed=' + seed + stepsArg;
  if (item.type === 'confirmed') {
    const { msg, repro } = item.issue;
    const how = repro?.startsWith('node tools/playtest.cjs ') ? repro.replace(/ --until=/, stepsArg + ' --until=') : repro;
    return '✗ ' + item.slug + ' ' + msg + '（種子 ' + item.seeds.join('、') + '）｜重現：' + (how || command(item.seeds[0]));
  }
  const hits = item.hits.filter(hit => hit.failed);
  const first = hits.reduce((a, b) => b.step < a.step ? b : a);
  const until = first.step > 0 ? ' --until=' + first.step : ' --until=1（第一次操作前）';
  const seeds = [...new Set(hits.map(hit => hit.seed))];
  return '✗ ' + item.slug + ' ' + item.id + '（' + item.level + ' 級' + (item.hidden ? '，隱藏' : '') +
    '）：種子 ' + seeds.join('、') + ' 誤觸，最早第 ' + first.step + ' 步｜重現：' + command(first.seed) + until;
}

async function main(args) {
  if (args.includes('-h') || args.includes('--help')) {
    const header = fs.readFileSync(__filename, 'utf8').split('*/', 1)[0];
    console.log(header.split('\n').slice(2).map(line => line.replace(/^ \* ?/, '')).join('\n').trimEnd());
    return 0;
  }
  const opts = parseArgs(args);
  let previous;
  if (opts.compare) {
    previous = JSON.parse(fs.readFileSync(opts.compare, 'utf8')).summary?.failed;
    if (!Array.isArray(previous) || previous.some(item => typeof item?.key !== 'string')) {
      throw new Error('--compare 指定的檔案缺少有效的不合格項目清單');
    }
  }
  const startedAt = new Date().toISOString();
  const tempBase = process.platform === 'win32' ? 'F:/測試暫存' : os.tmpdir();
  const temp = fs.mkdtempSync(path.join(tempBase, 'fluke_' + startedAt.replace(/[:.]/g, '-') + '_'));
  const runs = [];
  try {
    for (const seed of opts.seeds) {
      runs.push(await runSeed(path.join(temp, 'seed-' + seed), seed, opts));
    }
  } finally {
    if (!opts.keep) {
      const actual = fs.realpathSync(temp);
      if (path.dirname(actual) !== fs.realpathSync(tempBase) || !path.basename(actual).startsWith('fluke_')) {
        throw new Error('暫存目錄與建立時的位置不符：' + actual);
      }
      fs.rmSync(actual, { recursive: true, force: true });
    }
  }
  const summary = summarize(runs, opts);
  const comparison = previous ? compareFailures(summary.failed, previous) : null;
  const result = {
    startedAt, finishedAt: new Date().toISOString(), parameters: opts,
    ...(opts.keep ? { retainedDirectory: temp } : {}),
    runs, summary, comparison
  };
  fs.mkdirSync(path.dirname(opts.json), { recursive: true });
  fs.writeFileSync(opts.json, JSON.stringify(result, null, 2) + '\n');
  const added = new Set(comparison?.added);
  for (const item of summary.failed) {
    const tag = comparison ? (added.has(item.key) ? '（新）' : '（上次就有）') : '';
    console.log(failureLine(item, opts.steps) + tag);
  }
  const diff = comparison ? '，比上次新增 ' + comparison.added.length + '、消失 ' + comparison.removed.length : '';
  console.log('✓ 掃了 ' + opts.slugs.length + ' 站 × ' + opts.seeds.length + ' 個種子：不合格 ' + summary.failed.length +
    ' 項、保留 ' + summary.retained.length + ' 項、待確認 ' + summary.pending + ' 項' + diff + '（JSON：' + (path.relative(process.cwd(), opts.json) || opts.json) + '）');
  return summary.failed.length ? 1 : 0;
}

module.exports = { summarize, compareFailures };

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, err => {
    console.error('✗ ' + err.message);
    process.exitCode = 2;
  });
}
