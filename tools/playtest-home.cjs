/* 入口頁試玩：登入、搜尋、推薦與導覽，沒有實驗任務亂按。 */
'use strict';
const H = require('./home-browser.cjs');
async function playPage(browser, base, slug, opts) {
  const start = Date.now(), confirmed = [], log = [], check = (ok, msg) => { log.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) confirmed.push({ level: 'confirmed', kind: 'home', msg }); };
  for (const lang of ['zh-Hant', 'zh-Hans', 'en']) {
    const ctx = await H.context(browser, base, { lang }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(base + slug + '.html'); await H.ready(page, slug); const r = await H.inspect(page);
      check(r.sw <= r.vw, slug + ' ' + lang + ' 390 px 沒有橫向溢出'); check(!r.cjk.length, slug + ' ' + lang + ' 語言完整'); check(!errors.length, slug + ' 沒有頁面錯誤');
      if (slug === 'index') {
        const links = new Set(r.cards.map(c => c.href));
        check(r.cards.length === H.subjects.length && H.subjects.every(s => links.has(s.page + '.html')), '每科都有一張入口卡');
        check(r.cards.every(c => Math.abs(c.w - r.cards[0].w) < 1 && c.h === r.cards[0].h && c.font === r.cards[0].font), '各科大卡尺寸與字級一致');
        check(r.recs.length === 4, '冷啟動推薦四個實驗'); check(!r.account.length && !r.privilege.length, '訪客不讀帳號資料');
        await page.locator('#q').fill('momentum'); await page.waitForFunction(() => document.querySelectorAll('#search-results a').length > 0);
        check(await page.locator('.search-subject').count() > 0, '搜尋結果顯示科目標籤');
        await page.locator('#q').press('Escape'); await page.locator('.status-primary').click(); await page.waitForURL('**/leaderboard.html');
        check(await page.evaluate(()=>!sessionStorage.getItem('labAfterLogin')), '登入成功先清除跳頁目的地');
        await page.goto(base+'index.html'); await H.ready(page,'index');
        const signed = await H.inspect(page); check(signed.account.length === 5 && signed.account.every(p => /^(profiles|scores|daily|completions|bag)\/u1$/.test(p)), '登入只讀五個個人小節點');
        check(!signed.account.includes('scores'), '從不讀整份 scores');
      } else {
        check(r.current === slug + '.html' && r.textbookHidden, '目前科目標示與隱藏課本切換正確');
        await page.locator('.branch-nav').evaluate(el => scrollTo(0, el.getBoundingClientRect().bottom + scrollY + 40));
        await page.waitForFunction(() => document.querySelector('.subjbar.show'));
        check(await page.locator('.to-top.show').count() === 1, '分支黏頂列與回頂端按鈕出現');
        check(await page.locator('.subjbar').evaluate(e=>getComputedStyle(e).position==='fixed'&&Math.abs(e.getBoundingClientRect().top)<2),'分支列實際固定在視窗頂端');
      }
    } catch (e) { check(false, e.message.split('\n')[0]); }
    await ctx.close();
  }
  return { sec: Math.round((Date.now() - start) / 1000), seed: opts.seed, steps: opts.steps, confirmed, pending: [], accidental: [], emits: {}, dialogs: [], log };
}
module.exports = { playPage };
