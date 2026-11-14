#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const classic = require('./playtest.cjs');
const { launch, lowerPriority, intelLuid } = require('./browser.cjs');
const { parseArgs, habitOf, nightOpen, newRotation, rotationWithReceipt, profiles, HABITS } = require('./personas/model.cjs');
const { readJSON, writeJSON, writeReport, SCHEMA } = require('./personas/report.cjs');
const { LOCK_FILE, PAGE_WORKER_MAX_MS, underLock, lockAge, childStatus, launchOpts, waitForCpu } = require('./personas/runtime.cjs');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, '.shots');
const ROTATION = path.join(SHOTS, 'personas-rotation.json');
const DIR = path.join(SHOTS, 'personas');
const CLI = path.join(ROOT, 'tools/personas.cjs');
const ID = /^[a-f0-9]{32}$/;

function usage() {
  return [
    '用法：node tools/personas.cjs [實驗代號…] [--persona=名稱,名稱] [--habit=…] [--seed=N] [--until=K] [--no-shots]',
    '夜間輪替：--nightly [--batch=30]，臺灣時間 22:30–06:00，可重新執行接續。',
    '重現單則任務：--mission=任務代號。--until=0 只載入及量測畫面。',
    '玩家：' + Object.entries(profiles).map(([k, v]) => k + '（' + v.name + '）').join('、'),
    '習慣可用 + 疊加：' + Object.entries(HABITS).map(([k, v]) => k + '（' + v + '）').join('、')
  ].join('\n');
}

function subjects() {
  const w = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(w);
  const labels = new Map((w.LAB_SUBJECTS || []).map(subject => [subject.id, subject.zh]));
  return slug => labels.get(w.LAB_SUBJECT_OF?.(slug)) || '—';
}

function jobFile(token) { return path.join(DIR, 'job-' + token + '.json'); }
function resultFile(token) { return path.join(DIR, 'result-' + token + '.json'); }
function signature(options) {
  const { slugs, personas, seed, habit, noShots } = options;
  return createHash('sha256').update(JSON.stringify({ version: SCHEMA, slugs, personas, seed, habit, noShots })).digest('hex');
}

async function pageWorker(token) {
  if (!ID.test(token) || !underLock(token)) throw new Error('單頁啟動需由指定的共用鎖取得排程');
  lowerPriority();
  const config = readJSON(jobFile(token));
  if (!config || config.token !== token || !ID.test(config.id || '')) throw new Error('找不到本批啟動資料');
  const canStart = () => {
    const age = lockAge(token);
    return age != null && age < 120_000 && (!config.nightly || nightOpen());
  };
  if (!await waitForCpu(canStart)) return 3;
  const { serve, deadline } = require('./personas/driver.cjs');
  const { run } = require('./personas/play.cjs');
  const watchdog = setTimeout(() => { console.error('單頁超時，停止這個測試程序'); process.exit(4); }, PAGE_WORKER_MAX_MS);
  let browser, server;
  try {
    if (process.platform === 'win32' && !intelLuid()) throw new Error('找不到 Intel 內顯，暫停瀏覽器測試');
    server = await serve(fs.realpathSync(ROOT));
    if (!canStart()) return 3;
    browser = await launch(launchOpts(require('playwright').chromium));
    if (!canStart()) return 3;
    config.deadline = Date.now() + PAGE_WORKER_MAX_MS - 45_000;
    const result = await run(browser, ROOT, server.origin, config, classic.loadMissions(config.slug), SHOTS);
    writeJSON(resultFile(token), result);
    return 0;
  } finally {
    if (browser) await deadline(browser.close(), 8500, '關閉瀏覽器').catch(() => {});
    if (server) server.close();
    clearTimeout(watchdog);
  }
}

function sayRun(result, index, planned) {
  const yes = result.findings.filter(x => x.level === 'confirmed').length;
  const maybe = result.findings.length - yes;
  console.log('[' + index + '/' + planned + '] ' + result.slug + '／' + profiles[result.persona].name +
    '，' + (result.elapsedMs / 1000).toFixed(1) + ' 秒，得星 ' + result.completed.length + '，確定 ' + yes + '，待確認 ' + maybe);
}

async function orchestrate(options) {
  lowerPriority();
  const started = new Date();
  const id = randomBytes(16).toString('hex');
  const subject = subjects();
  const suffix = options.until !== null || options.mission ? '-repro' : '';
  let rotation, scheduled = options.slugs;
  let sum = 0;
  const canStart = () => !options.nightly || nightOpen();
  if (options.nightly) {
    if (!canStart()) { console.log('目前不在臺灣時間 22:30–06:00，沒有開啟瀏覽器'); return 0; }
    rotation = newRotation(readJSON(ROTATION), options.slugs, signature(options));
    scheduled = options.slugs.filter(slug => !rotation.done.includes(slug)).slice(0, options.batch);
    if (!options.slugs.length) throw new Error('沒有找到可輪替的上線實驗');
    rotation.partial ??= {};
  }
  const report = { schema: SCHEMA, id, startedAt: started.toISOString(), seed: options.seed, nightly: options.nightly,
    cycle: rotation?.cycle ?? null, until: options.until, planned: scheduled.length * options.personas.length, runs: [] };
  writeReport(SHOTS, report, suffix);
  console.log('本批 ' + scheduled.length + ' 站、' + report.planned + ' 組，種子 ' + options.seed + '。報告隨頁回寫。');
  try {
    for (const slug of scheduled) {
      for (const persona of options.personas) {
        const key = slug + '/' + persona;
        const already = rotation?.partial[key];
        if (already) {
          report.runs.push(already);
          continue;
        }
        if (!await waitForCpu(canStart)) { report.stop = '夜間窗口結束'; return 0; }
        const token = randomBytes(16).toString('hex');
        const config = { id, token, slug, persona, subject: subject(slug), habit: habitOf(persona, options.habit),
          seed: options.seed, until: options.until, noShots: options.noShots, mission: options.mission, nightly: options.nightly };
        writeJSON(jobFile(token), config);
        let result;
        let status;
        try {
          status = await childStatus(LOCK_FILE, CLI, token);
          result = readJSON(resultFile(token));
        } finally {
          if (fs.existsSync(resultFile(token))) fs.unlinkSync(resultFile(token));
          if (fs.existsSync(jobFile(token))) fs.unlinkSync(jobFile(token));
        }
        if (!result) {
          report.stop = !canStart() ? '夜間窗口結束' : '未取得本頁結果，結束碼 ' + (status ?? '中止');
          return canStart() ? 2 : 0;
        }
        report.runs.push(result);
        if (rotation && !result.aborted) {
          rotation = rotationWithReceipt(rotation, slug, persona, options.personas, result);
          writeJSON(ROTATION, rotation);
        }
        writeReport(SHOTS, report, suffix);
        sayRun(result, report.runs.length, report.planned);
        sum += result.elapsedMs;
        if (result.aborted) {
          report.stop = '測試環境未成功跑完這一頁';
          return 2;
        }
      }
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    report.browserActionElapsedMs = sum;
    writeReport(SHOTS, report, suffix);
  }
  return report.runs.some(run => run.findings.some(x => x.level === 'confirmed')) ? 1 : 0;
}

async function main(args) {
  const worker = args[0]?.match(/^--page-worker=([a-f0-9]{32})$/);
  if (worker && args.length === 1) return pageWorker(worker[1]);
  const options = parseArgs(args, classic.readLive());
  if (options.help) { console.log(usage()); return 0; }
  if (options.mission) {
    if (options.slugs.length !== 1 || options.nightly || options.personas.some(p => p !== 'expert' && p !== 'student') || !classic.loadMissions(options.slugs[0]).some(m => m.id === options.mission)) {
      throw new Error('重現單則任務需指定一站，且任務代號必須屬於該站');
    }
  }
  return orchestrate(options);
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    console.error('試玩工具：' + error.message);
    process.exitCode = 2;
  });
}
