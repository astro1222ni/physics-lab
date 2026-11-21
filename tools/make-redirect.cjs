#!/usr/bin/env node
/**
 * make-redirect.cjs — 在舊網址留轉址頁（11/21 站長：「網址不改、要搬就留轉址」）
 *
 * 用法：node tools/make-redirect.cjs <舊路徑.html> <新網址（相對於舊頁所在資料夾）>
 *   例：node tools/make-redirect.cjs old-name.html new-name.html
 *       node tools/make-redirect.cjs study-c4-04-1.html learn.html?view=textbook
 *
 * 產生的轉址頁：
 * - 立刻帶著原本的 ?參數 與 #錨點 轉到新網址（location.replace，不留在上一頁紀錄）。
 * - 沒有 JavaScript 時用 meta refresh；畫面上也有可以點的連結。
 * - canonical 指向新網址、noindex，搜尋引擎會把排名移到新頁。
 * - <meta name="lab-redirect"> 讓 tests/url-permanence.test.js 檢查目的地存在。
 * 舊檔已存在時不覆寫，除非加 --force（先確認舊頁的內容已經搬到新網址）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://lab.astroni.org/';
const args = process.argv.slice(2).filter(a => a !== '--force');
const force = process.argv.includes('--force');
if (args.length !== 2 || !args[0].endsWith('.html')) {
  console.error('用法：node tools/make-redirect.cjs <舊路徑.html> <新網址> [--force]');
  process.exit(1);
}
const [oldRel, target] = args;
const oldAbs = path.join(ROOT, oldRel);
const targetFile = path.join(path.dirname(oldAbs), target.split(/[?#]/)[0]);
if (!fs.existsSync(targetFile)) { console.error('新網址的檔案不存在：' + path.relative(ROOT, targetFile)); process.exit(1); }
if (fs.existsSync(oldAbs) && !force) { console.error('舊檔還在：' + oldRel + '。確認內容已搬走後加 --force 覆寫成轉址頁。'); process.exit(1); }

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const canonical = SITE + path.relative(ROOT, targetFile).split(path.sep).join('/') + (target.includes('?') ? target.slice(target.indexOf('?')).split('#')[0] : '');
const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="lab-redirect" content="${esc(target)}">
<link rel="canonical" href="${esc(canonical)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<title>這一頁搬家了｜讓倪動手⚡高中全科模擬實驗室</title>
<script>(function(){var t=${JSON.stringify(target)};var u=new URL(t,location.href);var q=new URLSearchParams(location.search);q.forEach(function(v,k){if(!u.searchParams.has(k))u.searchParams.set(k,v);});if(location.hash)u.hash=location.hash;location.replace(u.href);})();</script>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:0;padding:24px max(16px,env(safe-area-inset-left,0px));background:#0f1720;color:#e6edf3}a{color:#5fd0b8}@media (prefers-color-scheme:light){body{background:#fff;color:#1a2330}a{color:#0a7f6a}}</style>
</head>
<body>
<p>這一頁搬家了，正在帶你過去：<a href="${esc(target)}">${esc(target)}</a></p>
<p lang="en">This page has moved: <a href="${esc(target)}">${esc(target)}</a></p>
</body>
</html>
`;
fs.mkdirSync(path.dirname(oldAbs), { recursive: true });
fs.writeFileSync(oldAbs, html);
console.log('已在 ' + oldRel + ' 留轉址頁 → ' + target);
