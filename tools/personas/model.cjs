'use strict';

const DEFAULT_PERSONAS = Object.freeze(['beginner', 'student', 'gifted', 'clueless', 'expert', 'breaker']);
const HABITS = Object.freeze({
  desktop: '桌機滑鼠 1280×900', mobile: '手機觸控 390×844', landscape: '手機橫式 640×360',
  keyboard: '只用鍵盤', english: '英文', simplified: '簡體', large: '最大字級', dark: '深色'
});

const profiles = Object.freeze({
  beginner: { name: '新手', habit: 'mobile', welcome: true },
  student: { name: '一般學生', habit: 'desktop', welcome: false },
  gifted: { name: '資優生', habit: 'keyboard', welcome: false },
  clueless: { name: '極笨', habit: 'landscape+large', welcome: false },
  expert: { name: '極聰明', habit: 'desktop', welcome: false },
  breaker: { name: '破壞王', habit: 'mobile+dark', welcome: false },
  interrupted: { name: '中途離開', habit: 'mobile+english', welcome: true },
  scroll: { name: '滑過畫布', habit: 'landscape+large+dark', welcome: false }
});

function habitOf(persona, override) {
  const keys = [...new Set((override || profiles[persona].habit).split(/[,+]/))];
  for (const key of keys) if (!Object.hasOwn(HABITS, key)) throw new Error('未知的使用習慣：' + key);
  if (keys.filter(k => ['desktop', 'mobile', 'landscape'].includes(k)).length > 1 ||
      keys.includes('english') && keys.includes('simplified')) throw new Error('使用習慣中的裝置或語言互相衝突');
  const has = key => keys.includes(key);
  const mobile = has('mobile') || has('landscape');
  const width = has('landscape') ? 640 : mobile ? 390 : 1280;
  const height = has('landscape') ? 360 : mobile ? 844 : 900;
  return {
    keys, key: keys.join('+'), summary: keys.map(key => HABITS[key]).join('、'),
    viewport: { width, height }, mobile,
    keyboard: has('keyboard') || persona === 'gifted',
    language: has('english') ? 'en' : has('simplified') ? 'zh-Hans' : 'zh-Hant',
    scale: has('large') ? 1.3 : 1,
    theme: has('dark') ? 'dark' : 'light'
  };
}

function unsigned(value, name, min = 0, max = 0xffffffff) {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) throw new Error(name + ' 的範圍為 ' + min + '～' + max);
  return n;
}

function parseArgs(args, live) {
  const options = { seed: 1112, personas: [...DEFAULT_PERSONAS], habit: '', slugs: [], mission: null, until: null, noShots: false, nightly: false, batch: 30 };
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--nightly') options.nightly = true;
    else if (arg === '--no-shots') options.noShots = true;
    else if (arg.startsWith('--seed=')) options.seed = unsigned(arg.slice(7), '種子');
    else if (arg.startsWith('--until=')) options.until = unsigned(arg.slice(8), '步序', 0, 10000);
    else if (arg.startsWith('--batch=')) options.batch = unsigned(arg.slice(8), '一批實驗數', 1, 182);
    else if (arg.startsWith('--persona=')) options.personas = [...new Set(arg.slice(10).split(','))];
    else if (arg.startsWith('--habit=')) {
      options.habit = arg.slice(8);
      if (!options.habit) throw new Error('請指定使用習慣');
    }
    else if (arg.startsWith('--mission=')) {
      options.mission = arg.slice(10);
      if (!options.mission) throw new Error('請指定任務代號');
    }
    else if (arg.startsWith('-')) throw new Error('未知的選項：' + arg);
    else options.slugs.push(...arg.split(','));
  }
  const allowed = new Set(live);
  options.slugs = [...new Set(options.slugs.length ? options.slugs : live)];
  for (const slug of options.slugs) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !allowed.has(slug)) throw new Error('找不到上線實驗：' + slug);
  }
  for (const persona of options.personas) {
    if (!Object.hasOwn(profiles, persona)) throw new Error('未知玩家：' + persona);
    habitOf(persona, options.habit);
  }
  if (options.nightly && options.until !== null) throw new Error('夜間輪替不接受只重現一段操作');
  return options;
}

function taipeiMinutes(now) {
  const t = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

function nightOpen(now = new Date()) {
  const minute = taipeiMinutes(now);
  return minute >= 22 * 60 + 30 || minute < 6 * 60;
}

function newRotation(old, slugs, signature) {
  const selected = new Set(slugs);
  if (!old || old.signature !== signature) return { signature, cycle: 1, done: [] };
  const done = [...new Set(old.done || [])].filter(slug => selected.has(slug));
  if (done.length === slugs.length) return { signature, cycle: old.cycle + 1, done: [] };
  return { signature, cycle: old.cycle, done, partial: old.partial || {} };
}

function intervals(seed, slug, persona, round) {
  const rng = require('../playtest.cjs').rngOf(seed, [slug, persona, round].join(':'));
  return Array.from({ length: 22 }, () => 10 + Math.floor(rng() * 21));
}

function rotationWithReceipt(state, slug, persona, configured, result) {
  const key = slug + '/' + persona;
  const partial = { ...state.partial, [key]: result };
  if (!configured.every(name => Object.hasOwn(partial, slug + '/' + name))) return { ...state, partial };
  for (const name of configured) delete partial[slug + '/' + name];
  return { ...state, partial, done: state.done.includes(slug) ? state.done : [...state.done, slug] };
}

function command(run, step, mission) {
  const args = ['node tools/personas.cjs', run.slug, '--persona=' + run.persona, '--habit=' + run.habit.key, '--seed=' + run.seed];
  if (mission) args.push('--mission=' + mission);
  if (step != null) args.push('--until=' + step);
  return args.join(' ');
}

module.exports = { DEFAULT_PERSONAS, HABITS, profiles, habitOf, parseArgs, intervals, nightOpen, newRotation, rotationWithReceipt, command };
