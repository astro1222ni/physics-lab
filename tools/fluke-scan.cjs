#!/usr/bin/env node
/*
 * fluke-scan.cjs — 逐一用多個種子試玩，只列出不合格項目。
 *
 * 用法：
 *   node tools/fluke-scan.cjs <代號>[,<代號>…] [--seeds 1112,1,7,42,2026] [--steps 150]
 *        [--min-level 3] [--min-step 25] [--compare <上次的 JSON>] [--json <輸出檔>] [--keep]
 *        [--timeout 30]
 *   node tools/fluke-scan.cjs --hash <代號>:<任務>   印出保留清單要填的雜湊
 *   -h、--help   顯示本說明
 *   --keep       保留每個種子的試玩報告、快取及日誌
 *   --timeout    單一種子最多跑幾分鐘（預設 30），超過就停掉該種子、整批算未完成
 *
 * 隱藏任務一旦誤觸就不合格。一般任務達到最低等級且早於指定步數才列為不合格。
 * 同站同任務只計一次，有任何種子不合格就列為不合格。試玩已確認的問題也列為不合格。
 * 已人工確認可以保留的誤觸寫在 tools/playtest/fluke-allow.cjs（每筆有原因、決定日期、雜湊），命中的改列「保留（已確認）」，
 * 不算不合格；整份任務檔或列入的相依檔案變動時核對雜湊。失效項目即使未誤觸，也會顯示原因。
 * 待確認項目按各站各種子的報告筆數計算。比較以站別及項目身分判斷新增與消失。
 * 預設報告為 .shots/fluke-scan.json。各種子暫存放在環境變數 LAB_TEMP_DIR；沒設時 Windows 有 F 槽
 * 就放 F:\測試暫存（不存在會自動建立），否則放系統暫存。按 Ctrl+C 或被終止時，會停掉試玩子行程並清掉暫存。
 * 結束碼：0 全部合格，1 有不合格項目，2 參數錯誤或掃描未完成，130 被中止。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PLAYTEST = path.join(__dirname, 'playtest.cjs');
const ALLOW = path.join(__dirname, 'playtest', 'fluke-allow.cjs');
const DEFAULTS = { seeds: [1112, 1, 7, 42, 2026], steps: 150, minLevel: 3, minStep: 25, timeout: 30 };

let liveCache;
function liveModules() {
  if (!liveCache) {
    const w = {};
    new Function('window', fs.readFileSync(path.join(ROOT, 'js/missions/index.js'), 'utf8'))(w);
    liveCache = new Set(w.LAB_LIVE_MODULES || []);
  }
  return liveCache;
}

// 每個詞各佔一格；詞間若有換行只記一次（含多行註解內的換行），保留 ASI 語意。
function jsTokens(source, filename) {
  // 先確認是合法的 Script，下方以同一語法環境辨別斜線，全程只編譯。
  new vm.Script(source, { filename });
  const trivia = /(?:\s+|\/\/[^\r\n\u2028\u2029]*|\/\*[\s\S]*?\*\/)+/y;
  const legacyComment = /(?:<!--|-->|#!)[^\r\n\u2028\u2029]*/y;
  const quoted = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/y;
  const regexLiteral = /\/(?:\\[^\r\n\u2028\u2029]|\[(?:\\[^\r\n\u2028\u2029]|[^\]\\\r\n\u2028\u2029])*\]|[^/\\[\r\n\u2028\u2029])+\/[a-z]*/y;
  const number = /0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?[\d_]+)?n?/y;
  const word = /(?:[$_\p{ID_Start}]|\\u(?:\{[\da-fA-F]+\}|[\da-fA-F]{4}))(?:[$\u200C\u200D\p{ID_Continue}]|\\u(?:\{[\da-fA-F]+\}|[\da-fA-F]{4}))*/uy;
  const punct = />>>=|===|!==|>>>|<<=|>>=|\*\*=|&&=|\|\|=|\?\?=|\.\.\.|=>|\?\.(?!\d)|\+\+|--|\*\*|<<|>>|&&|\|\||\?\?|[=!<>+*/%&|^-]=|[\s\S]/uy;
  const templatePart = /(?:\\[\s\S]|\$(?!\{)|[^\\$`])*(?:`|\$\{)/y;
  const tokens = [];
  let i = 0;

  function match(pattern) {
    pattern.lastIndex = i;
    return pattern.exec(source)?.[0];
  }

  function isDivision() {
    // 除號（含 /=）後允許換行，正規式本體內則不允許。由 V8 判斷詞法環境，
    // 可區分 if (x) /.../ 與 f(x) / y，亦不必猜測右大括號的用途。
    const after = i + (source[i + 1] === '=' ? 2 : 1);
    try {
      new vm.Script(source.slice(0, after) + '\n' + source.slice(after), { filename });
      return true;
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      return false;
    }
  }

  function template() {
    let prefix = '`';
    do {
      i++; // 起始反引號，或上一段運算式的右大括號
      const part = match(templatePart);
      if (!part) throw new Error(filename + ' 的樣板字串無法切分');
      tokens.push(prefix + part);
      i += part.length;
      if (part.endsWith('`')) return;
      code(true);
      prefix = '}';
    } while (i < source.length);
  }

  function code(inTemplate) {
    let braces = 0;
    while (i < source.length) {
      // 傳統 Script 可含 HTML 單行註解；行首的 --> 和運算式 x-- > y 意義不同。
      const lineStart = !tokens.length || tokens.at(-1) === null;
      if (source.startsWith('<!--', i) || (lineStart && source.startsWith('-->', i)) || (i === 0 && source.startsWith('#!'))) {
        i += match(legacyComment).length;
        continue;
      }
      const space = match(trivia);
      if (space) {
        i += space.length;
        if (!lineStart && i < source.length && /[\r\n\u2028\u2029]/.test(space)) tokens.push(null);
        continue;
      }
      if (inTemplate && source[i] === '}' && braces === 0) return;
      if (source[i] === '`') { template(); continue; }

      let value;
      if (source[i] === '/') {
        const candidate = match(regexLiteral);
        if (candidate && !isDivision()) value = candidate;
      }
      value ??= match(quoted) ?? match(word) ?? match(number) ?? match(punct);
      tokens.push(value);
      i += value.length;
      if (value === '{') braces++;
      if (value === '}') braces--;
    }
  }

  code(false);
  if (tokens.at(-1) === null) tokens.pop(); // 檔尾只有註解或空白
  return tokens;
}

// 有些站用工廠函式產生任務。只在有時限的獨立環境取登記資料，傳出的只有 JSON 文字。
function missionMetadata(source, filename, slug, id) {
  const context = vm.createContext(Object.create(null), { microtaskMode: 'afterEvaluate', codeGeneration: { strings: false, wasm: false } });
  const options = { timeout: 3000, filename };
  vm.runInContext(`
    globalThis.window = globalThis.self = globalThis;
    const flukeMetadata = [];
    globalThis.LabMission = {
      register(site, list) {
        if (site !== ${JSON.stringify(slug)}) return;
        for (const mission of list) {
          if (mission.id === ${JSON.stringify(id)}) {
            flukeMetadata.push({ id: mission.id, level: mission.level, hidden: mission.hidden === true, riddle: mission.riddle ?? null });
          }
        }
      },
      starsOf(level, mission) { return mission?.hidden ? level * 2 : level; }
    };
  `, context, options);
  vm.runInContext(source, context, options);
  const matches = JSON.parse(vm.runInContext('JSON.stringify(flukeMetadata)', context, options));
  if (!matches.length) throw new Error(slug + ' 的任務檔裡找不到任務 ' + id);
  if (matches.length !== 1) throw new Error(slug + ' 的任務代號重複：' + id);
  return matches[0];
}

function missionHash(slug, id, root = ROOT, deps = []) {
  const file = path.join(root, 'js/missions', slug + '.js');
  const source = fs.readFileSync(file, 'utf8');
  const mission = missionMetadata(source, file, slug, id);
  const files = [[slug, jsTokens(source, file)]];
  if (!Array.isArray(deps)) throw new Error('deps 必須是相依檔案路徑陣列');
  for (const dep of deps) {
    if (typeof dep !== 'string' || /[\\:\0]/.test(dep) || dep.split('/').some(s => !s || s === '..' || s === '.')) {
      throw new Error('deps 必須使用專案內的 JavaScript 相對路徑');
    }
    const target = fs.realpathSync(path.join(root, dep));
    const relative = path.relative(fs.realpathSync(root), target);
    if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('相依檔案位於專案外：' + dep);
    files.push([dep, jsTokens(fs.readFileSync(target, 'utf8'), dep)]);
  }
  return crypto.createHash('sha256').update(JSON.stringify({ mission, files })).digest('hex').slice(0, 16);
}

function entryProblem(entry, slug, id) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '保留清單項目必須是物件';
  if (![entry.reason, entry.decided, entry.hash].every(s => typeof s === 'string' && s.trim())) return '缺少原因、決定日期或雜湊';
  if (!/^[a-f0-9]{16}$/.test(entry.hash)) return '雜湊必須是 16 碼十六進位小寫字元';
  const required = slug === 'tides' && id === 'tides-h2';
  for (const name of ['maxSeeds', 'minStep']) {
    if ((required || Object.hasOwn(entry, name)) && !(Number.isSafeInteger(entry[name]) && entry[name] > 0)) {
      return name + ' 必須是正整數';
    }
  }
  return null;
}

function resolveAllow(slugs, list = require(ALLOW), root = ROOT) {
  const out = new Map();
  for (const slug of slugs) {
    for (const [id, entry] of Object.entries(list[slug] || {})) {
      let invalid = entryProblem(entry, slug, id);
      if (!invalid) {
        try {
          const now = missionHash(slug, id, root, entry.deps);
          if (now !== entry.hash) invalid = '任務或相依檔案改過（雜湊 ' + entry.hash + ' → ' + now + '），要重新確認';
        } catch (err) {
          invalid = err.message;
        }
      }
      out.set(JSON.stringify(['accidental', slug, id]), { ...entry, slug, id, invalid });
    }
  }
  return out;
}

function validStep(step, steps) {
  return Number.isSafeInteger(step) && step >= 0 && step <= steps; // 第 0 步代表第一次操作前
}

// 命中清單時是否仍在護欄內（命中的種子數、最早步數）；超出就回傳原因。
function allowGuard(entry, hits, steps) {
  if (hits.some(hit => !validStep(hit.step, steps))) return '資料不完整：命中紀錄缺少有效步數';
  const seeds = new Set(hits.map(hit => hit.seed));
  if (entry.maxSeeds != null && seeds.size > entry.maxSeeds) return seeds.size + ' 個種子命中，超過保留上限 ' + entry.maxSeeds + ' 個';
  const first = Math.min(...hits.map(hit => hit.step));
  if (entry.minStep != null && first < entry.minStep) return '第 ' + first + ' 步就命中，早於保留下限第 ' + entry.minStep + ' 步';
  return null;
}

function tempBaseDir() {
  let base;
  if (process.env.LAB_TEMP_DIR) base = path.resolve(process.env.LAB_TEMP_DIR);
  else if (process.platform === 'win32' && fs.existsSync('F:/')) base = 'F:/測試暫存';
  else base = os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  return base;
}

// 停掉子行程連同它開的瀏覽器（Windows 要用 taskkill /T 才會連孫行程一起停）。
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { child.kill('SIGKILL'); } catch (_) { /* 已結束 */ }
  }
}

function removeTemp(temp, tempBase) {
  try {
    const actual = fs.realpathSync(temp);
    if (path.dirname(actual) !== fs.realpathSync(tempBase) || !path.basename(actual).startsWith('fluke_')) {
      console.error('⚠ 暫存目錄與建立時的位置不符，沒有刪除：' + actual);
      return;
    }
    fs.rmSync(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('⚠ 暫存目錄沒清乾淨（' + err.message + '）：' + temp);
  }
}

function writeAtomic(file, text) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const active = { child: null, temp: null, tempBase: null, keep: false, stopping: false };

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
  const numbers = { '--steps': ['steps', 1], '--min-level': ['minLevel', 1], '--min-step': ['minStep', 0], '--timeout': ['timeout', 1] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) {
      for (const slug of arg.split(',').map(s => s.trim().replace(/\.html$/, ''))) {
        if (!/^[a-z0-9_-]+$/.test(slug) || !fs.statSync(path.join(ROOT, slug + '.html'), { throwIfNoEntry: false })?.isFile()) {
          throw new Error('找不到實驗：' + (slug || '（空白代號）'));
        }
        // 實驗頁＝在上線清單裡，或有自己的任務檔（製作中的實驗也能掃）；index、about 這類頁不是。
        const hasMissions = slug !== 'index' && fs.existsSync(path.join(ROOT, 'js/missions', slug + '.js'));
        if (!liveModules().has(slug) && !hasMissions) {
          throw new Error(slug + ' 不是實驗頁（不在上線清單，也沒有任務檔）');
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

function summarize(runs, { minLevel, minStep, steps = DEFAULTS.steps } = DEFAULTS, allow = new Map()) {
  const missions = new Map();
  const issues = new Map();
  let pending = 0;
  for (const { seed, pages } of runs) {
    for (const [slug, page] of Object.entries(pages)) {
      pending += page.pending.length;
      for (const { id, level, hidden, step } of page.accidental) {
        const key = JSON.stringify(['accidental', slug, id]);
        if (!missions.has(key)) missions.set(key, { key, type: 'accidental', slug, id, level, hidden, hits: [] });
        const failed = !validStep(step, steps) || hidden === true || (level >= minLevel && step < minStep);
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
  const allowed = [];
  const invalid = new Map();
  for (const [key, entry] of allow) {
    if (entry.invalid) invalid.set(key, { slug: entry.slug, id: entry.id, reason: entry.invalid });
  }
  for (const item of missions.values()) {
    const bad = item.hits.filter(hit => hit.failed);
    if (!bad.length) { retained.push(item); continue; }
    // 保留清單只認誤觸（試玩確認的問題在下面照報），而且要雜湊對得上、在護欄內。
    const entry = allow.get(item.key);
    const why = entry && (entry.invalid || allowGuard(entry, item.hits, steps));
    if (entry && !why) {
      item.allowed = { reason: entry.reason, decided: entry.decided };
      allowed.push(item);
    } else {
      if (why) {
        item.allowInvalid = why;
        invalid.delete(item.key); // 原不合格行已有原因，毋須另列。
      }
      failed.push(item);
    }
  }
  return { failed: failed.concat([...issues.values()]), retained, allowed, invalidAllow: [...invalid.values()], pending };
}

function compareFailures(current, previous) {
  const currentKeys = new Set(current.map(item => item.key));
  const previousKeys = new Set(previous.map(item => item.key));
  return {
    added: [...currentKeys].filter(key => !previousKeys.has(key)),
    removed: [...previousKeys].filter(key => !currentKeys.has(key))
  };
}

async function runSeed(dir, seed, { slugs, steps, timeout }) {
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
      active.child = child;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeout * 60000);
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        active.child = null;
        if (timedOut) reject(new Error('超過 ' + timeout + ' 分鐘沒跑完，已停掉'));
        else resolve(code ?? signal);
      });
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
    let how = repro;
    if (stepsArg && repro?.startsWith('node tools/playtest.cjs ') && !/ --steps[= ]/.test(repro)) {
      how = / --until=/.test(repro) ? repro.replace(/ --until=/, stepsArg + ' --until=') : repro + stepsArg;
    }
    return '✗ ' + item.slug + ' ' + msg + '（種子 ' + item.seeds.join('、') + '）｜重現：' + (how || command(item.seeds[0]));
  }
  const hits = item.hits.filter(hit => hit.failed);
  const total = new Set(item.hits.map(hit => hit.seed)).size;
  const incomplete = hits.find(hit => !validStep(hit.step, steps));
  if (incomplete) {
    return '✗ ' + item.slug + ' ' + item.id + '（共 ' + total + ' 個種子命中）：種子 ' + incomplete.seed +
      ' 資料不完整，無法判定最早步數｜重現：' + command(incomplete.seed) +
      (item.allowInvalid ? '（保留清單已失效：' + item.allowInvalid + '）' : '');
  }
  const first = hits.reduce((a, b) => b.step < a.step ? b : a);
  const until = first.step > 0 ? ' --until=' + first.step : ' --until=1（第一次操作前）';
  const seeds = [...new Set(hits.map(hit => hit.seed))];
  return '✗ ' + item.slug + ' ' + item.id + '（' + item.level + ' 級' + (item.hidden ? '，隱藏' : '') +
    '）：種子 ' + seeds.join('、') + ' 誤觸（共 ' + total + ' 個種子命中），最早第 ' + first.step + ' 步｜重現：' + command(first.seed) + until +
    (item.allowInvalid ? '（保留清單已失效：' + item.allowInvalid + '）' : '');
}

function allowedLine(item) {
  const hits = item.hits;
  const first = hits.reduce((a, b) => b.step < a.step ? b : a);
  const seeds = [...new Set(hits.map(hit => hit.seed))];
  const badSeeds = [...new Set(hits.filter(hit => hit.failed).map(hit => hit.seed))];
  const detail = badSeeds.length === seeds.length ? '' : '，達原不合格條件的種子 ' + badSeeds.join('、');
  return '◎ ' + item.slug + ' ' + item.id + ' 保留（已確認，' + item.allowed.decided + '）：種子 ' + seeds.join('、') +
    ' 誤觸，最早第 ' + first.step + ' 步（共 ' + seeds.length + ' 個種子命中' + detail + '）｜' + item.allowed.reason;
}

function invalidAllowLine(item) {
  return '⚠ ' + item.slug + ' ' + item.id + '（保留清單已失效：' + item.reason + '）';
}

async function main(args) {
  if (args.some(arg => arg === '--hash' || arg.startsWith('--hash='))) {
    const match = /^([a-z0-9_-]+):([a-z0-9_-]+)$/.exec(args[1] || '');
    if (args.length !== 2 || args[0] !== '--hash' || !match) {
      throw new Error('--hash 只接受一個 <代號>:<任務>，例如 tides:tides-h2');
    }
    const [, slug, id] = match;
    console.log(missionHash(slug, id, ROOT, require(ALLOW)[slug]?.[id]?.deps));
    return 0;
  }
  if (args.includes('-h') || args.includes('--help')) {
    const header = fs.readFileSync(__filename, 'utf8').split('*/', 1)[0];
    console.log(header.split('\n').slice(2).map(line => line.replace(/^ \* ?/, '')).join('\n').trimEnd());
    return 0;
  }
  const opts = parseArgs(args);
  const allow = resolveAllow(opts.slugs);
  let previous;
  if (opts.compare) {
    previous = JSON.parse(fs.readFileSync(opts.compare, 'utf8')).summary?.failed;
    if (!Array.isArray(previous) || previous.some(item => typeof item?.key !== 'string')) {
      throw new Error('--compare 指定的檔案缺少有效的不合格項目清單');
    }
  }
  const startedAt = new Date().toISOString();
  const tempBase = tempBaseDir();
  const temp = fs.mkdtempSync(path.join(tempBase, 'fluke_' + startedAt.replace(/[:.]/g, '-') + '_'));
  Object.assign(active, { temp, tempBase, keep: opts.keep });
  const runs = [];
  try {
    for (const seed of opts.seeds) {
      runs.push(await runSeed(path.join(temp, 'seed-' + seed), seed, opts));
    }
  } finally {
    // 清理失敗只印警告，不蓋掉掃描本身的錯誤。
    if (!opts.keep) removeTemp(temp, tempBase);
    active.temp = null;
  }
  const summary = summarize(runs, opts, allow);
  const comparison = previous ? compareFailures(summary.failed, previous) : null;
  const result = {
    startedAt, finishedAt: new Date().toISOString(), parameters: opts,
    ...(opts.keep ? { retainedDirectory: temp } : {}),
    runs, summary, comparison
  };
  fs.mkdirSync(path.dirname(opts.json), { recursive: true });
  writeAtomic(opts.json, JSON.stringify(result, null, 2) + '\n');
  const added = new Set(comparison?.added);
  for (const item of summary.failed) {
    const tag = comparison ? (added.has(item.key) ? '（新）' : '（上次就有）') : '';
    console.log(failureLine(item, opts.steps) + tag);
  }
  for (const item of summary.allowed) console.log(allowedLine(item));
  for (const item of summary.invalidAllow) console.log(invalidAllowLine(item));
  const diff = comparison ? '，比上次新增 ' + comparison.added.length + '、消失 ' + comparison.removed.length : '';
  console.log((summary.failed.length ? '✗' : '✓') + ' 掃了 ' + opts.slugs.length + ' 站 × ' + opts.seeds.length + ' 個種子：不合格 ' + summary.failed.length +
    ' 項、保留 ' + summary.retained.length + ' 項、' +
    (summary.allowed.length ? '已確認保留 ' + summary.allowed.length + ' 項、' : '') + '待確認 ' + summary.pending + ' 項' + diff + '（JSON：' + (path.relative(process.cwd(), opts.json) || opts.json) + '）');
  return summary.failed.length ? 1 : 0;
}

function onStop(signal) {
  if (active.stopping) return;
  active.stopping = true;
  killTree(active.child);
  if (active.temp && !active.keep) removeTemp(active.temp, active.tempBase);
  console.error('✗ 收到 ' + signal + '，已停掉試玩' + (active.temp && !active.keep ? '並清掉暫存' : ''));
  process.exit(130);
}

module.exports = { summarize, compareFailures, failureLine, allowedLine, invalidAllowLine, missionHash, resolveAllow };

if (require.main === module) {
  const signals = process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGBREAK'] : ['SIGINT', 'SIGTERM'];
  for (const signal of signals) process.on(signal, () => onStop(signal));
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, err => {
    console.error('✗ ' + err.message);
    process.exitCode = 2;
  });
}
