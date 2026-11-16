#!/usr/bin/env node
/* 一次性搬遷；完成後由 build-catalog、apply-directory、seo 接手維護。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { ROOT, W, subjects, read, esc, text, section, asset } = require('./home-data.cjs');
const old = read('index.html');
if (old.includes('data-home-v2')) throw new Error('已經拆頁，請勿再次執行 split-home');
const before = {}; new Function('window', read('js/catalog.js'))(before);
fs.writeFileSync(path.join(ROOT, 'tools/home-v2-invariants.json'), JSON.stringify({
  sourceCommit: require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(),
  count: before.LAB_CATALOG.length,
  catalog: before.LAB_CATALOG.map(({ s, d, b, c }) => ({ s, d, b, c })),
  chapterSHA256: crypto.createHash('sha256').update(read('js/chapter-map.js')).digest('hex')
}, null, 1) + '\n');
const css = old.match(/<link rel="stylesheet" href="lab.css[^>]+>/)[0];
const settings = old.match(/<script src="js\/settings.js[^>]+><\/script>/)[0];
const verification = old.match(/<meta name="google-site-verification"[^>]+>/)[0];
const footer = old.match(/<footer class="site">[\s\S]*?<\/footer>/)[0];
const tile = old.match(/<span class="ni-tile"[\s\S]*?<\/span><\/span>/)[0];
const qr = old.match(/<a class="site-qr"[\s\S]*?<\/a>/)[0];
const brand = `<a class="small-brand" href="index.html">${tile}<span><b class="brand-ai"><span class="ai">A</span>stro N<span class="ai">i</span> Lab</b>${text('讓倪動手⚡高中全科模擬實驗室', 'Hands-on High-School Labs', 'span', 'class="small-brand-name"')}</span></a>`;
function head(title, en, home) { return `<!doctype html>\n<html lang="zh-Hant">\n<head>\n  <meta charset="utf-8">\n  ${settings}\n${home ? '<!-- REDIRECT-BEGIN -->\n<!-- REDIRECT-END -->\n  ' + verification : ''}\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  ${text(title, en, 'title')}\n  <link rel="stylesheet" href="vendor/katex/katex.min.css">\n  ${css}\n</head>\n`; }
function scripts(kind, scope = '') { return `<script src="js/missions/index.js?v=home-v2"></script>\n<script src="js/thumbs.js?v=home-v2"></script>\n<script src="js/${kind}.js?v=home-v2"></script>\n<script src="js/search.js?v=home-v2"></script>\n<script src="vendor/katex/katex.min.js"></script>\n<script src="vendor/katex/contrib/auto-render.min.js"></script>\n<script src="js/math.js?v=202611151631"></script>\n<script src="js/firebase-config.js?v=202611151631"></script>\n<script src="js/stats.js?v=home-v2" ${scope ? 'data-subject="' + scope + '"' : 'data-summary'}></script>\n<script src="js/comments.js?v=home-v2"></script>\n</body>\n</html>\n`; }
function search(s) { return `<div class="search" role="search">${text(s ? '搜尋這一科的實驗' : '想試什麼？搜尋全科實驗', s ? 'Find a lab in this subject' : 'What will you try? Search all subjects', 'label', 'for="q" class="search-label"')}<div class="search-box"><svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2"/></svg><input id="q" type="search" ${s ? 'data-scope="' + s.dom + '"' : ''} placeholder="輸入主題、關鍵字或實驗名稱" data-en-placeholder="Type a topic, keyword or lab name" autocomplete="off" aria-controls="search-results" aria-describedby="search-status"></div><p id="search-status" class="search-status" aria-live="polite"></p><ul id="search-results" class="search-results" hidden></ul>${s ? '<p id="search-all" hidden></p>' : ''}</div>`; }
const intros = [
  ['拉一拉、調一調，看力、光和電怎麼運作。', 'Push, pull and adjust. See how forces, light and electricity work.'],
  ['調整條件，看微觀粒子如何改變反應。', 'Change the conditions. See how particles shape a reaction.'],
  ['從細胞到生態系，動手看生命如何運作。', 'From cells to ecosystems, explore how life works.'],
  ['轉動地球、改變大氣，找出自然現象的線索。', 'Turn the Earth and change the air. Explore the patterns of our planet.'],
  ['拖動圖形、改變數字，把抽象概念變成看得見的變化。', 'Move a shape or change a number. Make an abstract idea visible.'],
  ['讓資料跑起來，看看電腦如何表示、處理和傳遞資訊。', 'Put data to work. See how computers store, process and send it.'],
  ['讀地圖、改條件，看地方與人們如何互相影響。', 'Read maps and change the conditions. Explore places and the people in them.'],
  ['調音高、配和弦，聽見聲音背後的規律。', 'Tune a note and build a chord. Hear the patterns behind music.']
];
const switches = subjects.map(s => { const a = asset(s, old); return `<a href="${s.page}.html" data-subject="${s.id}" style="--c:${a.color}">${a.icon}${text(s.zh, s.en)}</a>`; }).join('\n');
for (const [i, s] of subjects.entries()) {
  let region = section(old, s.dom);
  region = region.replace(/(<header class="domain-head">[\s\S]*?<h2[^>]*>)[\s\S]*?<\/header>/, (m) => m.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/, '<h1$1>$2</h1>').replace(/<p data-en="[^\"]*">[\s\S]*?<\/p>/, text(intros[i][0], intros[i][1], 'p') + '\n<p class="subject-count"></p>\n<div class="textbook-control" hidden><div role="group" aria-label="目錄排列方式" data-en-aria-label="Directory view"><button type="button" data-view="domain" data-en="By field">依領域</button><button type="button" data-view="textbook" data-en="By textbook">依課本</button></div><label><span data-en="Edition">版本</span> <select aria-label="課本版本" data-en-aria-label="Textbook edition"><option value="longteng" data-en="Longteng">龍騰</option><option value="hanlin" data-en="Hanlin">翰林</option></select></label></div>'));
  const nav = switches.replace(`href="${s.page}.html"`, `href="${s.page}.html" aria-current="page"`);
  const source = head(s.zh + '｜讓倪動手⚡高中全科模擬實驗室', s.en + ' | Astro Ni Lab') + `<body data-en-ready class="subject-page" data-subject="${s.id}"><div class="wrap">\n<header class="top site-top">${brand}</header>\n<nav class="crumbs" aria-label="麵包屑" data-en-aria-label="Breadcrumb">${text('首頁', 'Home', 'a', 'href="index.html"')} / ${text(s.zh, s.en, 'span', 'aria-current="page"')}</nav>\n<nav class="subject-switch" aria-label="切換科目" data-en-aria-label="Switch subject">${nav}</nav>\n${region.replace(/(<\/header>)/, '$1\n' + search(s))}\n${footer}\n</div>\n` + scripts('subject', s.id);
  fs.writeFileSync(path.join(ROOT, s.page + '.html'), source);
}
const homeBrand = brand.replace(/<span (data-en="Hands-on High-School Labs" class="small-brand-name")>(.*?)<\/span>/, '<h1 $1>$2</h1>');
const home = head('讓倪動手⚡高中全科模擬實驗室', 'Astro Ni Lab', true) + `<body data-en-ready class="home-page" data-home-v2><div class="wrap">\n<header class="top home-top"><div class="home-brand">${homeBrand}</div>${text('親手拖、親手調，驗證課本裡的道理。全部在你的瀏覽器裡算。', 'Drag, adjust and test the ideas in your textbooks. It all runs in your browser.', 'p', 'class="home-intro"')}${qr}</header>\n<main>\n${search()}\n<section class="my-status" aria-labelledby="my-status-title"><h2 id="my-status-title" data-en="Your space">我的狀態</h2><div id="home-status" class="status-body" aria-busy="true"><div class="status-skeleton" aria-hidden="true"></div></div><div class="status-links">${text('每日任務 →', 'Daily missions →', 'a', 'href="daily.html"')}${text('排行榜 →', 'Leaderboard →', 'a', 'href="leaderboard.html"')}</div></section>\n<section class="subjects" aria-labelledby="subjects-title"><h2 id="subjects-title" data-en="Pick a subject. Start exploring.">選一科開始</h2>\n<!-- SUBJECTS-BEGIN -->\n<!-- SUBJECTS-END -->\n</section>\n<section class="home-entries" aria-labelledby="latest-title"><h2 id="latest-title" data-en="New labs to try">最新上架</h2><div class="entry-grid" id="latest-labs">\n<!-- LATEST-BEGIN -->\n<!-- LATEST-END -->\n</div></section>\n<section class="home-entries" aria-labelledby="recommend-title"><h2 id="recommend-title" data-en="Start here">從這裡開始</h2><div class="entry-grid" id="recommendations"></div></section>\n</main>\n<div id="site-totals"></div>\n${footer}\n</div>\n` + scripts('home');
fs.writeFileSync(path.join(ROOT, 'index.html'), home);
console.log('已將 ' + before.LAB_CATALOG.length + ' 個實驗原樣拆到八個科目頁；已固定資料防護基準。');
