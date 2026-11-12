#!/usr/bin/env node
/*
 * seo.cjs — 國際能見度：分享卡圖片、每頁的說明與分享資訊、多語言網址、結構化資料、sitemap.xml、robots.txt。
 * 新增實驗或改了首頁卡片文字、縮圖之後重跑（資料全部從首頁卡片與縮圖來，不必手寫）。
 *
 * 用法：
 *   node tools/seo.cjs            全部（分享卡只重做縮圖有變的）
 *   node tools/seo.cjs --no-og    不做分享卡圖片，只更新各頁 meta、sitemap、robots
 *   node tools/seo.cjs --force    分享卡全部重做
 *   node tools/seo.cjs --og-only  只做分享卡圖片，不改頁面
 *
 * 分享卡：img/og/<代號>.jpg（1200×630，用繁體淺色縮圖＋標題），首頁 img/og/index.jpg 是拼貼。
 * 每頁 <head> 裡 <!-- SEO-BEGIN --> 到 <!-- SEO-END --> 之間由這支工具管理，請勿手改。
 * 多語言：同一頁加 ?lang=en／?lang=zh-Hans 就是英文／簡體版（js/settings.js 支援），用 hreflang 告訴搜尋引擎。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://lab.astroni.org/';
const args = process.argv.slice(2);
const NO_OG = args.includes('--no-og');
const FORCE = args.includes('--force');
const OG_ONLY = args.includes('--og-only'); // 只做分享卡圖片，不改任何頁面（背景有人在改頁面時用）
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ent = s => String(s).replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const strip = s => ent(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// ---------- 從首頁讀出每個實驗的標題、說明、分支、章名 ----------
const index = read('index.html');
const labs = [];
{
  let branch = null, chapter = null;
  const re = /<section class="branch" id="([\w-]+)"[^>]*>[\s\S]*?<h2 data-en="([^"]*)">([^<]*)<\/h2>|<h3 class="chapter-head"[^>]*><span data-en="([^"]*)">([^<]*)<\/span><\/h3>|<section class="chapter[^"]*"[^>]*>|<a class="module live" href="([\w-]+)\.html" data-module="([\w-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (let m; (m = re.exec(index));) {
    if (m[1]) { branch = { id: m[1], en: ent(m[2]), zh: ent(m[3]) }; chapter = null; }
    else if (m[4] !== undefined) chapter = { en: ent(m[4]), zh: ent(m[5]) };
    else if (m[0].startsWith('<section class="chapter')) chapter = null;
    else if (m[7]) {
      const body = m[8];
      const h = body.match(/<h4 data-en="([^"]*)">([\s\S]*?)<\/h4>/);
      const p = body.match(/<p data-en="([^"]*)">([\s\S]*?)<\/p>/);
      labs.push({ slug: m[7], zh: strip(h[2]), en: ent(h[1]), dzh: strip(p[2]), den: ent(p[1]), branch, chapter: chapter || { zh: branch.zh, en: branch.en } });
    }
  }
}
if (!labs.length) { console.error('首頁找不到已上線的實驗卡片'); process.exit(1); }

const SITE_ZH = 'Astro Ni 科學實驗室', SITE_EN = 'Astro Ni Science Lab';
const pages = [
  { slug: 'index', url: SITE, title: SITE_ZH + '｜高中物理・化學・生物・地球科學・數學互動模擬', desc: (index.match(/<meta name="description" content="([^"]*)"/) || [])[1] ? ent(index.match(/<meta name="description" content="([^"]*)"/)[1]) : '高中物理・化學・生物・地球科學・數學互動模擬實驗室。', kind: 'home' },
  { slug: 'leaderboard', url: SITE + 'leaderboard.html', title: '倪的星星排行榜｜' + SITE_ZH, desc: '在 Astro Ni 科學實驗室完成任務、收集倪的星星：全科與各科排行榜、任務進度與成就。', kind: 'page' },
  { slug: 'daily', url: SITE + 'daily.html', title: '每日任務｜' + SITE_ZH, desc: '每天從實驗任務中隨機抽出十個每日任務，每個一天完成一次：有機會收集銅幣、銀幣、金幣、鑽石與稀有鑰匙。', kind: 'page' },
  { slug: 'about', url: SITE + 'about.html', title: '關於本站｜' + SITE_ZH, desc: 'Astro Ni 科學實驗室的作者、物理怎麼把關、引用格式與授權（CC BY-NC 4.0）。', kind: 'about' }
].concat(labs.map(l => ({ slug: l.slug, url: SITE + l.slug + '.html', title: l.zh + '｜' + SITE_ZH, desc: l.dzh, kind: 'lab', lab: l })));

function block(pg) {
  const img = SITE + 'img/og/' + pg.slug + '.jpg';
  const alt = pg.kind === 'lab' ? pg.lab.zh + '的模擬畫面' : SITE_ZH + '的實驗縮圖';
  const L = [
    '<!-- SEO-BEGIN（tools/seo.cjs 自動產生，請勿手改） -->',
    `<meta name="description" content="${esc(pg.desc)}">`,
    `<link rel="alternate" hreflang="zh-Hant" href="${pg.url}">`,
    `<link rel="alternate" hreflang="zh-Hans" href="${pg.url}?lang=zh-Hans">`,
    `<link rel="alternate" hreflang="en" href="${pg.url}?lang=en">`,
    `<link rel="alternate" hreflang="x-default" href="${pg.url}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE_ZH}">`,
    `<meta property="og:title" content="${esc(pg.title)}">`,
    `<meta property="og:description" content="${esc(pg.desc)}">`,
    `<meta property="og:url" content="${pg.url}">`,
    `<meta property="og:image" content="${img}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(alt)}">`,
    '<meta property="og:locale" content="zh_TW">',
    '<meta property="og:locale:alternate" content="zh_CN">',
    '<meta property="og:locale:alternate" content="en_US">',
    '<meta name="twitter:card" content="summary_large_image">'
  ];
  let ld = null;
  if (pg.kind === 'lab') {
    const l = pg.lab;
    ld = {
      '@context': 'https://schema.org', '@type': 'LearningResource',
      name: l.zh, alternateName: l.en, description: l.dzh, url: pg.url, image: img,
      inLanguage: ['zh-Hant', 'zh-Hans', 'en'], learningResourceType: ['Simulation', 'Interactive resource'],
      educationalLevel: 'High school', audience: { '@type': 'EducationalAudience', educationalRole: ['student', 'teacher'] },
      about: [l.branch.zh + '（' + l.branch.en + '）', l.chapter.zh + '（' + l.chapter.en + '）'],
      isAccessibleForFree: true, interactivityType: 'active',
      isPartOf: { '@type': 'WebSite', name: SITE_ZH, alternateName: SITE_EN, url: SITE },
      author: { '@type': 'Person', name: 'Astro Ni' },
      license: 'https://creativecommons.org/licenses/by-nc/4.0/'
    };
  } else if (pg.kind === 'home') {
    ld = { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_ZH, alternateName: SITE_EN, url: SITE, description: pg.desc, inLanguage: ['zh-Hant', 'zh-Hans', 'en'],
      license: 'https://creativecommons.org/licenses/by-nc/4.0/', author: { '@type': 'Person', name: 'Astro Ni' },
      hasPart: labs.map(l => ({ '@type': 'LearningResource', name: l.zh, alternateName: l.en, url: SITE + l.slug + '.html' })) };
  }
  if (pg.kind === 'about') {
    ld = { '@context': 'https://schema.org', '@type': 'AboutPage', name: pg.title, url: pg.url, description: pg.desc, inLanguage: ['zh-Hant', 'zh-Hans', 'en'],
      isPartOf: { '@type': 'WebSite', name: SITE_ZH, alternateName: SITE_EN, url: SITE },
      author: { '@type': 'Person', name: 'Astro Ni', alternateName: '倪赫擎', jobTitle: 'High school physics teacher', sameAs: ['https://www.youtube.com/channel/UCJcKIIrFweNx9jTfoTn-BaA'] },
      license: 'https://creativecommons.org/licenses/by-nc/4.0/' };
  }
  if (ld) L.push('<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>');
  L.push('<!-- SEO-END -->');
  return L.map(x => '  ' + x).join('\n');
}

// ---------- 寫入各頁 ----------
let changed = 0;
for (const pg of OG_ONLY ? [] : pages) {
  const f = path.join(ROOT, pg.slug + '.html');
  if (!fs.existsSync(f)) { console.log('略過（沒有檔案）：' + pg.slug); continue; }
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  s = s.replace(/\n?[ \t]*<!-- SEO-BEGIN[\s\S]*?<!-- SEO-END -->/, '');
  s = s.replace(/\n[ \t]*<meta name="description"[^>]*>/g, ''); // 舊的說明由工具統一產生
  s = s.replace(/(<title[^>]*>[\s\S]*?<\/title>)/, '$1\n' + block(pg));
  if (s !== before) { fs.writeFileSync(f, s); changed++; }
}
console.log('更新 meta：' + changed + ' 頁');

// ---------- sitemap.xml、robots.txt ----------
if (!OG_ONLY) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = pages.map(pg => {
    const alts = [['zh-Hant', pg.url], ['zh-Hans', pg.url + '?lang=zh-Hans'], ['en', pg.url + '?lang=en'], ['x-default', pg.url]]
      .map(([h, u]) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${esc(u)}"/>`).join('\n');
    return `  <url>\n    <loc>${pg.url}</loc>\n    <lastmod>${today}</lastmod>\n${alts}\n  </url>`;
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls.join('\n') + '\n</urlset>\n';
  const old = fs.existsSync(path.join(ROOT, 'sitemap.xml')) ? read('sitemap.xml') : '';
  // 只有網址清單變了才改日期，避免每次重跑都產生差異
  if (old.replace(/<lastmod>[^<]*<\/lastmod>/g, '') !== xml.replace(/<lastmod>[^<]*<\/lastmod>/g, '')) { fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml); console.log('更新 sitemap.xml：' + pages.length + ' 個網址'); }
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + 'sitemap.xml\n');
}

if (NO_OG) process.exit(0);

// ---------- 分享卡圖片（Playwright 畫 HTML 模板，存 JPG） ----------
(async () => {
  const { launch } = require('./browser.cjs'); // Intel 內顯算畫面、低於標準優先權（減少 CPU 負擔）
  const outDir = path.join(ROOT, 'img/og');
  fs.mkdirSync(outDir, { recursive: true });
  const verFile = path.join(outDir, 'versions.json');
  const vers = fs.existsSync(verFile) ? JSON.parse(fs.readFileSync(verFile, 'utf8')) : {};
  const thumb = slug => path.join(ROOT, 'img/thumbs', slug + '-hant-light.webp');
  const dataUrl = f => 'data:image/webp;base64,' + fs.readFileSync(f).toString('base64');
  const TOKENS = { mech: '#c2410c', thermo: '#b91c1c', wave: '#0e7490', optics: '#7c3aed', em: '#1d4ed8', modern: '#0f766e',
    cell: '#7e22ce', genetics: '#3f6212', physiology: '#be123c', ecology: '#047857', evolution: '#854d0e' }; // 生物五個分支（與 lab.css 的 --b-* 淺色值相同）
  /**
   * 分享卡中文標題的斷行：標題區寬 420 px、字級 54 px，一行約 7 個字。
   * 先在「：」後面、「（」前面分段；還太長的段落，在「與、和、及、、、，」後面找最平均的位置再分。
   * 這樣不會把一個詞拆到兩行（例如「豌｜豆」）。9 個字以內不分。
   */
  const OG_LINE = 7;
  function ogSplit(p) {
    if (p.length <= OG_LINE) return [p];
    let best = -1, worst = Infinity;
    for (let i = 1; i < p.length; i++) {
      if (!/[與和及、，]/.test(p[i - 1])) continue;
      const m = Math.max(i, p.length - i);
      if (m < worst) { worst = m; best = i; }
    }
    return best < 0 ? [p] : ogSplit(p.slice(0, best)).concat(ogSplit(p.slice(best)));
  }
  function ogTitle(t) {
    if (t.length <= 9) return esc(t);
    const parts = t.replace(/：/g, '：|').replace(/（/g, '|（').split('|').filter(Boolean);
    return parts.map(ogSplit).reduce((a, b) => a.concat(b), []).map(esc).join('<br>');
  }
  const FONT = 'system-ui, "Segoe UI", "Microsoft JhengHei", "PingFang TC", sans-serif';
  const CSS = `*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;font-family:${FONT};background:#f3f6f5;color:#22323a;overflow:hidden}
    .card{position:absolute;inset:0;background:radial-gradient(1200px 600px at 100% 0%,color-mix(in srgb,var(--c) 16%,#f3f6f5),#f3f6f5 60%)}
    .brand{position:absolute;left:64px;top:52px;font-size:22px;letter-spacing:.14em;font-weight:700;color:#196558}
    .text{position:absolute;left:64px;top:118px;width:420px}
    .tag{display:inline-block;padding:6px 16px;border-radius:99px;background:var(--c);color:#fff;font-size:22px;font-weight:700}
    h1{margin-top:22px;font-size:54px;line-height:1.18;font-weight:800;letter-spacing:.01em}
    h2{margin-top:16px;font-size:24px;line-height:1.3;font-weight:600;color:#4c5f66}
    .shot{position:absolute;right:56px;top:135px;width:640px;height:360px;border-radius:22px;overflow:hidden;box-shadow:0 24px 60px rgba(20,40,40,.28),0 0 0 1px rgba(0,0,0,.06)}
    .shot img{width:100%;height:100%;object-fit:cover;display:block}
    .foot{position:absolute;left:64px;bottom:46px;font-size:21px;color:#5b6e75}
    .grid{position:absolute;right:48px;top:48px;display:grid;grid-template-columns:repeat(3,212px);gap:14px;transform:rotate(-4deg)}
    .grid img{width:212px;height:119px;border-radius:12px;box-shadow:0 10px 26px rgba(20,40,40,.22);object-fit:cover}`;
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.route(u => !u.href.startsWith('data:') && !u.href.startsWith('about:'), r => r.abort());
  let made = 0;
  for (const l of labs) {
    const f = thumb(l.slug);
    if (!fs.existsSync(f)) { console.log('沒有縮圖，略過分享卡：' + l.slug + '（先跑 npm run thumbs -- ' + l.slug + '）'); continue; }
    // 長標題的斷行規則改過（11/12），版本字串只加在長標題上，短標題的卡片不必重做
    const v = crypto.createHash('sha1').update(fs.readFileSync(f)).update(l.zh + l.en + l.chapter.zh + (l.zh.length > 9 ? '|br2' : '')).digest('hex').slice(0, 10);
    if (!FORCE && vers[l.slug] === v && fs.existsSync(path.join(outDir, l.slug + '.jpg'))) continue;
    const zhTitle = ogTitle(l.zh);
    const html = `<style>${CSS}</style><div class="card" style="--c:${TOKENS[l.branch.id] || '#196558'}">
      <div class="brand">ASTRO NI SCIENCE LAB</div>
      <div class="text"><span class="tag">${esc(l.branch.zh)}・${esc(l.chapter.zh)}</span><h1>${zhTitle}</h1><h2>${esc(l.en)}</h2></div>
      <div class="shot"><img src="${dataUrl(f)}"></div>
      <div class="foot">互動模擬・免登入・繁體／简体／English</div></div>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(outDir, l.slug + '.jpg'), type: 'jpeg', quality: 86 });
    vers[l.slug] = v; made++;
  }
  // 首頁拼貼
  {
    // 各分支輪流挑，拼貼才看得出力學、熱學、波動、光學、電磁、近代都有
    const byBranch = {};
    labs.filter(l => fs.existsSync(thumb(l.slug))).forEach(l => (byBranch[l.branch.id] = byBranch[l.branch.id] || []).push(l));
    const pick = [];
    for (let i = 0; pick.length < 9 && i < 20; i++) Object.keys(byBranch).forEach(b => { if (pick.length < 9 && byBranch[b][i]) pick.push(byBranch[b][i]); });
    const v = crypto.createHash('sha1').update(pick.map(l => l.slug + (vers[l.slug] || '')).join()).digest('hex').slice(0, 10);
    if (FORCE || vers.index !== v || !fs.existsSync(path.join(outDir, 'index.jpg'))) {
      const html = `<style>${CSS}.text{top:150px;width:470px}h1{font-size:60px}</style><div class="card" style="--c:#196558">
        <div class="brand">ASTRO NI SCIENCE LAB</div>
        <div class="text"><h1>Astro Ni<br>科學實驗室</h1><h2>高中自然科學互動模擬・${labs.length} 個實驗<br>High School Science Simulations</h2></div>
        <div class="grid">${pick.map(l => `<img src="${dataUrl(thumb(l.slug))}">`).join('')}</div>
        <div class="foot">物理・化學・生物・地球科學・數學</div></div>`;
      await page.setContent(html, { waitUntil: 'load' });
      await page.screenshot({ path: path.join(outDir, 'index.jpg'), type: 'jpeg', quality: 86 });
      vers.index = v; made++;
    }
    // 排行榜沿用首頁的分享卡
    fs.copyFileSync(path.join(outDir, 'index.jpg'), path.join(outDir, 'leaderboard.jpg'));
    fs.copyFileSync(path.join(outDir, 'index.jpg'), path.join(outDir, 'about.jpg'));
    fs.copyFileSync(path.join(outDir, 'index.jpg'), path.join(outDir, 'daily.jpg'));
  }
  fs.writeFileSync(verFile, JSON.stringify(vers, null, 1) + '\n');
  await browser.close();
  console.log('分享卡：重做 ' + made + ' 張（img/og/）');
})();
