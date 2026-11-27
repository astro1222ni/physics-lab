#!/usr/bin/env node
/*
 * 用法：node tools/lint-float-eq.cjs [代號…|--all] [--dir js] [--no-skip]
 * 預設依 js/catalog.js 的 d=math、s=代號挑站，掃來源目錄的同名 JS
 * 及代號-*.js（核心、控制等）；--all 遞迴掃來源目錄的所有 JS。
 * ==、!=、===、!== 的任一側若是數字常值、Math 數字常數或其簡單算式即提醒。
 * 預設略過字串、typeof、長度、索引和名稱為 i/j/k/n/idx/index/count
 * 或以這些單字結尾（駝峰、底線，idx/count 也接受小寫連寫）的計數器。
 * --no-skip 列出上述略過項。陣列取出的元素可能是計算值，照樣檢查。
 * 這是詞彙層級的提醒，不推斷型別；略過註解、正規式與整段樣板字串。
 * 有提醒仍回傳 0；用法／掃描輸入錯誤回傳 2。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NUMBER = /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?[\d_]+)?)$/;
const EQUALITY = /^(?:===?|!==?)$/;
const MATH_CONSTANT = /^(?:E|LN10|LN2|LOG10E|LOG2E|PI|SQRT1_2|SQRT2)$/;
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u;
const CAMEL_COUNTER = /(?:[IJKN]|Idx|Index|Count|_(?:i|j|k|n|index)|idx|count)$/;
const ARITHMETIC = /^(?:[+*/%<>-]|\*\*|<<|>>|>>>|<=|>=)$/;
const VALUE_PREFIX = /^(?:return|throw|case|yield|void|typeof|delete|in|of|await)$/;

function tokenize(source) {
  const pattern = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\\[\r\n])+\/[a-z]*|0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?[\d_]+)?n?|[\p{ID_Start}$_][\p{ID_Continue}$]*|===|!==|==|!=|=>|\?\.|\+\+|--|\*\*|>>>|<<|>>|<=|>=|&&|\|\||\?\?|[^\s]/gu;
  const tokens = [];
  for (let m; (m = pattern.exec(source));) {
    let value = m[0];
    if (value.startsWith('//') || value.startsWith('/*')) continue;
    const previous = tokens.at(-1)?.value || '';
    // 斜線在值後通常是除法，從斜線下一字元重新切詞。
    if (value.length > 1 && value.startsWith('/') &&
        /(?:[\p{ID_Continue}$]|[)\]"'`])$/u.test(previous) &&
        !VALUE_PREFIX.test(previous)) {
      value = '/';
      pattern.lastIndex = m.index + 1;
    }
    tokens.push({ value, offset: m.index });
  }
  return tokens;
}

function groupEnd(values, index, step) {
  const edge = step === 1 ? /^[([{]$/ : /^[)\]}]$/;
  const other = step === 1 ? /^[)\]}]$/ : /^[([{]$/;
  let depth = 0;
  for (let i = index; i >= 0 && i < values.length; i += step) {
    if (edge.test(values[i])) depth++;
    if (other.test(values[i]) && --depth === 0) return i;
  }
  return index;
}

function atom(values, index, step) {
  // 按原順序回傳直接比較的運算元，保留呼叫、屬性及中括號取值。
  let i = index;
  if (step === 1) {
    if (values[i] === '+' || values[i] === '-' || values[i] === 'typeof') i++;
    if (values[i] === '(') i = groupEnd(values, i, 1);
    for (;;) {
      if (['.', '?.'].includes(values[i + 1]) && IDENTIFIER.test(values[i + 2] || '')) i += 2;
      else if (['(', '['].includes(values[i + 1])) {
        const end = groupEnd(values, i + 1, 1);
        if (end === i + 1) break;
        i = end;
      } else break;
    }
  } else {
    for (;;) {
      if ([')', ']'].includes(values[i])) {
        const start = groupEnd(values, i, -1);
        if (start === i) break;
        i = start;
        if ((IDENTIFIER.test(values[i - 1] || '') && !VALUE_PREFIX.test(values[i - 1])) ||
            [')', ']'].includes(values[i - 1])) {
          i--;
          continue;
        }
      }
      if (['.', '?.'].includes(values[i - 1])) i -= 2;
      else break;
    }
    const previous = values[i - 1];
    const beforeSign = values[i - 2];
    if (previous === 'typeof' || (['+', '-'].includes(previous) &&
        (!beforeSign || VALUE_PREFIX.test(beforeSign) || ARITHMETIC.test(beforeSign) ||
          /^[([{:;,=!?]$/.test(beforeSign) || EQUALITY.test(beforeSign)))) i--;
  }
  return { start: Math.min(i, index), end: Math.max(i, index) };
}

function operand(values, index, step) {
  const range = atom(values, index, step);
  const edge = step === 1 ? 'end' : 'start';
  while (ARITHMETIC.test(values[range[edge] + step] || '') &&
      values[range[edge] + 2 * step] !== undefined) {
    range[edge] = atom(values, range[edge] + 2 * step, step)[edge];
  }
  return range;
}

function unwrap(values) {
  while (values[0] === '(' && values.length > 1 && groupEnd(values, 0, 1) === values.length - 1) values = values.slice(1, -1);
  return values;
}

function numeric(values) {
  let v = unwrap(values);
  if (v[0] === '-' || v[0] === '+') v = unwrap(v.slice(1));
  return (v.length === 1 && NUMBER.test(v[0])) ||
    (v[0] === 'Math' && v[1] === '.' && MATH_CONSTANT.test(v[2]) &&
      (v.length === 3 || (v.length === 5 && /^[*/]$/.test(v[3]) && NUMBER.test(v[4]))));
}

const stringLiteral = v => v.length === 1 && /^[`"']/.test(v[0]);

function skip(values) {
  const v = unwrap(values);
  if (v[0] === 'typeof' || stringLiteral(v)) return true;
  const name = v.at(-1);
  const member = v.length === 1 || ['.', '?.'].includes(v.at(-2));
  if (member && (/^(?:length|size|i|j|k|n|idx|index|count)$/i.test(name) || CAMEL_COUNTER.test(name))) {
    return atom(v, v.length - 1, -1).start === 0;
  }
  const open = name === ')' ? groupEnd(v, v.length - 1, -1) : -1;
  return /^(?:index|indexOf|lastIndexOf|findIndex)$/.test(v[open - 1]) &&
    atom(v, v.length - 1, -1).start === 0;
}

function scan(source) {
  const tokens = tokenize(source);
  const values = tokens.map(t => t.value);
  const findings = [];
  let line = 1;
  let nextNewline = source.indexOf('\n');
  for (let i = 1; i < tokens.length - 1; i++) {
    if (!EQUALITY.test(values[i])) continue;
    const left = operand(values, i - 1, -1);
    const right = operand(values, i + 1, 1);
    const l = values.slice(left.start, i), r = values.slice(i + 1, right.end + 1);
    const skipped = skip(l) || skip(r);
    if (!numeric(l) && !numeric(r) && !stringLiteral(unwrap(l)) && !stringLiteral(unwrap(r))) continue;
    const offset = tokens[i].offset;
    while (nextNewline >= 0 && nextNewline < offset) {
      line++;
      nextNewline = source.indexOf('\n', nextNewline + 1);
    }
    const tail = tokens[right.end];
    const end = tail.offset + tail.value.length;
    findings.push({ line, snippet: source.slice(tokens[left.start].offset, end).replace(/\s+/g, ' '), skipped });
  }
  return findings;
}

function argumentsFor(args) {
  const slugs = [];
  let dir = 'js', all = false, noSkip = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') all = true;
    else if (arg === '--no-skip') noSkip = true;
    else if (arg === '--dir' && args[i + 1] && !args[i + 1].startsWith('-')) dir = args[++i];
    else if (SLUG.test(arg)) slugs.push(arg);
    else throw new Error('無效參數：' + arg);
  }
  if (all && slugs.length) throw new Error('--all 與站台代號不能同時使用');
  return { dir: path.resolve(ROOT, dir), slugs, all, noSkip };
}

function sourceFiles(dir, recursive) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) files.push(...sourceFiles(file, true));
    else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(file);
  }
  return files;
}

function main(args) {
  const { dir, slugs, all, noSkip } = argumentsFor(args);
  const sites = slugs.length || all ? slugs : JSON.parse(fs.readFileSync(path.join(ROOT, 'js/catalog.js'), 'utf8')
    .replace(/^[\s\S]*?window\.LAB_CATALOG\s*=\s*/, '').replace(/;\s*$/, ''))
    .filter(site => site.d === 'math').map(site => site.s);
  const files = sourceFiles(dir, all);
  const selected = new Set();
  for (const slug of sites) {
    const matches = files.filter(file => {
      const name = path.basename(file, path.extname(file));
      return name === slug || name.startsWith(slug + '-');
    });
    if (!matches.length && slugs.length) throw new Error('找不到站台程式：' + slug);
    matches.forEach(file => selected.add(file));
  }
  let hits = 0, skipped = 0;
  for (const file of (all ? files : [...selected]).sort()) {
    const label = path.relative(ROOT, file).split(path.sep).join('/');
    for (const item of scan(fs.readFileSync(file, 'utf8'))) {
      if (item.skipped && !noSkip) skipped++;
      else {
        hits++;
        console.log(label + ':' + item.line + '  ' + item.snippet);
      }
    }
  }
  console.log('共 ' + hits + ' 處（已略過 ' + skipped + ' 處）');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(error.message);
    console.error('用法：node tools/lint-float-eq.cjs [代號…|--all] [--dir js] [--no-skip]');
    process.exitCode = 2;
  }
}

module.exports = { scan };
