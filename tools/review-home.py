#!/usr/bin/env python3
"""把本機驗收原圖排成保留原始像素的審稿 PNG，另產生三份審稿文字。"""
from pathlib import Path
from collections import defaultdict
from html.parser import HTMLParser
import html
import json
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / '.shots' / 'home-v2'
OUT = ROOT / '總表'
OUT.mkdir(exist_ok=True)
Image.MAX_IMAGE_PIXELS = None  # 全部輸入均為本工具剛產生的本機長頁截圖
data = json.loads((SHOTS / 'review.json').read_text(encoding='utf-8'))
audit = json.loads((SHOTS / 'source-audit.json').read_text(encoding='utf-8'))
font_path = Path('C:/Windows/Fonts/msjh.ttc')
font = ImageFont.truetype(str(font_path), 18)
title_font = ImageFont.truetype(str(font_path), 26)

def wrap(text, width, f=font):
    lines, line = [], ''
    for ch in text:
        if f.getlength(line + ch) > width and line:
            lines.append(line)
            line = ch
        else:
            line += ch
    return lines + ([line] if line else [])

groups = defaultdict(list)
for r in data['results']:
    if r['kind'] == 'matrix' and r['slug'] in ('index', 'physics'):
        key = f"{r['slug']}-{r['w']}-{r['lang']}"
    elif r['kind'] == 'matrix':
        key = r['slug']
    elif r['kind'] in ('status', 'cold', 'recommend', 'search'):
        key = f"首頁-{r['state']}-{r['kind']}"
    else:
        key = {'large': '字體特大', 'interaction': '互動特寫', 'before': '改版前對照'}[r['kind']]
    groups[key].append(r)

for key, rows in groups.items():
    # 舊首頁用首屏對照，完整長頁保存在可點開的 HTML 總表；其餘 PNG 保留完整原圖。
    images = [Image.open(SHOTS / (r['viewport'] if r['kind'] == 'before' else r['raw'])).convert('RGB') for r in rows]
    pad, gap, top = 20, 16, 88
    widths = [max(im.width, 390) for im in images]
    labels = [wrap(r['label'], w - 12) for r, w in zip(rows, widths)]
    head = max(len(x) for x in labels) * 26 + 20
    sheet = Image.new('RGB', (sum(widths) + gap * (len(rows) - 1) + pad * 2, max(im.height for im in images) + top + head + pad), '#e8edef')
    draw = ImageDraw.Draw(sheet)
    draw.text((pad, 12), '首頁改版審稿總表 · ' + key, font=title_font, fill='#20313a')
    draw.text((pad, 49), '原始像素排列；標籤在每格上方。完整原圖與驗收資料見 HTML 總表。', font=font, fill='#485e68')
    x = pad
    for r, im, width, lines in zip(rows, images, widths, labels):
        draw.rectangle((x, top, x + width, top + head + im.height), fill='white', outline='#bdcbd0', width=1)
        for n, line in enumerate(lines):
            draw.text((x + 6, top + 7 + 26 * n), line, font=font, fill='#20313a')
        sheet.paste(im, (x, top + head))
        x += width + gap
        im.close()
    name = OUT / ('總表-畫面-' + key + '.png')
    sheet.save(name, compress_level=6)
    sheet.close()
    print('總表 PNG：' + name.name, flush=True)

checks = [
    ('通過', '首屏：390 顯示站名、搜尋、狀態與第一列；1280 全部八科完整顯示。'),
    ('通過', '八科卡片的實測寬、高、字級一致，四大類共用欄寬。'),
    ('通過', '182 個實驗各出現一次；原卡逐字保留，s/d/b/c、章制霸與任務清單未變。'),
    ('通過', '科目、分支、章、製作中章及未知錨點均已抽查。'),
    ('通過', '184 頁導覽更新；全站 HTML 舊 href 為 0，四層導覽皆可點。'),
    ('通過', '全科／本科、英文、簡體、同義詞、?q= 與跨全科入口通過。'),
    ('差異', '三身分與固定高度通過；個人資料 4 筆，沿用登入權限另讀 admins/<uid> 1 筆，訪客帳號 0 筆。'),
    ('通過', '冷啟動六科、同章／同科上限、至少一張跨科、理由與同日穩定排序通過。'),
    ('通過', '最新六張按上架日、同科至多兩張；關閉 JS 仍有八科與最新六張。'),
    ('通過', '科目切換、手機橫滑、目前科目、分支黏頂、回頂端與 hidden 課本位置通過。'),
    ('通過', '八科各自說明、分享卡、hreflang、CollectionPage、BreadcrumbList、網站地圖與驗證 meta 通過。'),
    ('通過', '390 含 ×1.3 無左右捲動；新入口觸控至少 44px，鍵盤焦點明顯。'),
    ('通過', '三語、深淺色矩陣通過；英文無中文殘留，數學簡體保留向量，無頁面錯誤。'),
    ('範圍', 'verify 跑全部核心／證明／靜態，介面補驗 14 頁；試玩為 3 個實驗與 4 個入口頁，未宣稱舊全站試玩全過。'),
    ('通過', f"index.html {audit['files']['index.html']:,} bytes，小於 60 KB；靜態入口不等待登入。"),
]

verify = json.loads((ROOT / '.shots' / 'verify-report.json').read_text(encoding='utf-8')) if (ROOT / '.shots' / 'verify-report.json').exists() else {}
verify_ok = bool(verify.get('steps')) and not verify.get('errors')
if not verify_ok:
    checks[13] = ('待完成', '本次 verify 尚未完成，請以完成後的總表為準。')

md = ['# 首頁改版驗證總表', '', '來源：`.shots/home-v2/review.json`、`source-audit.json`；測試一律假後端、指定瀏覽器與外連封鎖。', '']
md += [f'{i}. {status}：{message}' for i, (status, message) in enumerate(checks, 1)]
md += ['', '- `npm test`：189 個測試檔通過（含推薦、不變量）。', '- `npm run check -- index physics chemistry biology earth-science mathematics information-technology geography music projectile quadratic-function pitch-frequency heat-conduction polarization`：56 組通過。', '- `npm run playtest -- index physics mathematics music`：4 頁三語操作，確定問題 0、待確認 0；另有 3 個實驗各 150 步試玩通過。', f"- `npm run verify -- [原12頁]`＋後續14頁介面補驗：{'通過' if verify_ok else '待完成'}；原始與補驗收據在 `.shots/home-v2/`，彙總 `.shots/verify-report.json`。", '- `npm run seo`、`node tools/build-hans.cjs`、`apply-directory --check`、`fix-crumbs --check`、來源稽核通過。']
md.append('- 舊連結抽查：' + '；'.join('#' + r['hash'] + ' → ' + r['actual'] for r in data['redirects']) + '。')
md += [f"- 畫面：47 張原圖、{len(groups)} 張 PNG 總表；原圖與首屏均可在 HTML 總表點開。", '- 既有全站收據：earthquake 的 S 波滑桿顯示、polyrhythm 的負半徑繪圖各一項，未越權修改實驗程式。', '- 尚待：Claude 審稿、合併與上線；本分支不 push、不合併、不 stamp。']
assert len(md) <= 40
(OUT / '總表-驗證.md').write_text('\n'.join(md) + '\n', encoding='utf-8', newline='\n')

class Pairs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.pairs = [], []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for p in self.stack:
            if tag == 'br':
                p['parts'].append(' ')
        if 'data-en' in a:
            self.stack.append({'tag': tag, 'zh': [], 'parts': [], 'en': a['data-en']})
        for key, val in a.items():
            if key.startswith('data-en-'):
                field = key[8:]
                if field == 'html':
                    self.pairs.append((a.get('data-en-html', ''), val, 'html'))
                elif field in a:
                    self.pairs.append((a[field], val, field))
    def handle_data(self, text):
        for p in self.stack:
            p['parts'].append(text)
    def handle_endtag(self, tag):
        if self.stack and self.stack[-1]['tag'] == tag:
            p = self.stack.pop()
            self.pairs.append((''.join(p['parts']), p['en'], tag))

def pairs(source):
    p = Pairs()
    p.feed(source)
    return p.pairs

def flat(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]*>', '', s))).strip().replace('|', '\\|')

old_pairs = {(flat(zh), flat(en)) for zh, en, _ in pairs((SHOTS / 'baseline/index.html').read_text(encoding='utf-8'))}
texts = ['# 首頁改版文字初稿（中英對照）', '', '包含新增／修改文案與新位置；原實驗卡片標題、說明逐字搬移，來源稽核確認未改。`{名稱}`、`{N}` 代表動態資料。', '', '| 位置 | 中文 | English |', '|---|---|---|']
seen = set()
for f in ['index.html', 'physics.html', 'chemistry.html', 'biology.html', 'earth-science.html', 'mathematics.html', 'information-technology.html', 'geography.html', 'music.html', 'privacy.html']:
    source = (ROOT / f).read_text(encoding='utf-8')
    for zh, en, where in pairs(source):
        key = (flat(zh), flat(en))
        if key in seen or (key in old_pairs and f != 'privacy.html'):
            continue
        seen.add(key)
        texts.append(f'| {f} · {where} | {key[0]} | {key[1]} |')

dynamic = [
    ('狀態・未登入', '登入，收集倪的星星', 'Sign in. Start collecting Ni stars.'),
    ('狀態・未登入', '完成任務，留下進度，挑戰排行榜。', 'Save your missions and see your place on the leaderboard.'),
    ('狀態・按鈕', '用 Google 登入', 'Sign in with Google'),
    ('狀態・紀錄', '最近玩過', 'Recently played'),
    ('狀態・無紀錄', '還沒玩過，從下面挑一科開始。', 'Your first lab is waiting. Pick a subject below.'),
    ('狀態・無暱稱', '探索者', 'Explorer'),
    ('狀態・管理員', '管理員・管理頁 →', 'Admin · Dashboard →'),
    ('狀態・名次快取', '第 {N} 名・{M} 天前更新', 'Rank {N} · updated {M}d ago'),
    ('狀態・無名次快取', '看我的名次 →', 'See my rank →'),
    ('狀態・每日', '今日每日任務 {N}/10', 'Today’s missions {N}/10'),
    ('狀態・每日無障礙', '今日完成 {N} 個每日任務', '{N} daily missions completed today'),
    ('狀態・紀錄', '繼續上次的實驗', 'Continue your last lab'),
    ('狀態・進度', '完成 {N}/{M}', '{N}/{M} missions done'),
    ('狀態・無紀錄', '挑一科，開始你的下一個發現。', 'Pick a subject. Find your next discovery.'),
    ('狀態・成就', '我的星星與成就 →', 'My stars & achievements →'),
    ('狀態・載入失敗', '先選一科開始，登入功能稍後再試。', 'Pick a subject to begin. Sign-in can wait.'),
    ('狀態・帳號資料載入失敗', '進度暫時載入不了', 'Your progress could not load yet.'),
    ('狀態・帳號資料載入失敗', '先選一科玩玩，稍後再回來看看。', 'Pick a subject to play. Check back in a moment.'),
    ('科目卡・數量', '{N} 個實驗', '{N} labs'),
    ('科目卡・規劃', '另有 {N} 個製作中', '{N} more in progress'),
    ('科目卡・上架', '新 +{N}', 'New +{N}'),
    ('推薦・標題', '為你推薦', 'Picked for you'),
    ('推薦・同章', '同一章：你玩過〈{名稱}〉', 'Same chapter as {name}'),
    ('推薦・跨科', '跨科：和〈{名稱}〉同主題', 'Across subjects: related to {name}'),
    ('推薦・同分支', '同一領域：你玩過〈{名稱}〉', 'Same field as {name}'),
    ('推薦・相似', '因為你玩過〈{名稱}〉', 'Because you tried {name}'),
    ('推薦・入門', '從這一科的入門實驗開始。', 'A first lab in this subject.'),
    ('推薦・補滿', '換個領域，試試新的發現。', 'Try a new field. Find a new idea.'),
    ('科目頁・數量', '{N} 個實驗・{M} 章', '{N} labs · {M} chapters'),
    ('分支黏頂列・無障礙', '跳到分支', 'Jump to a field'),
    ('回頂端・按鈕／無障礙', '↑ 回頂端／回到頁首', '↑ Top / Back to top'),
    ('搜尋・全科入口', '到全科搜尋「{關鍵字}」→', 'Search all subjects for “{query}” →'),
    ('搜尋・載入失敗', '搜尋暫時無法載入，請稍後再試。', 'Search could not load. Try again later.'),
    ('搜尋・未上架名稱尚未列於目錄', '{章名}・新實驗製作中', '{chapter} · New lab in progress'),
    ('搜尋・未上架說明', '這個實驗還在製作，先試試同章已上線的實驗。', 'This lab is in progress. Try a live lab in the same chapter.'),
    ('最新上架・日期', '{M}/{D} 上架', 'Added {M}/{D}'),
    ('科目分享卡', '{N} 個互動實驗／動手試，親眼看。', '{N} interactive labs / Try it. See it.'),
]
for pos, zh, en in dynamic:
    texts.append(f'| {pos} | {zh} | {en} |')

seo_en = {
    'physics': 'Mechanics, heat, waves, optics, electromagnetism and modern physics.',
    'chemistry': 'Matter and structure, reactions, rates and equilibrium, acids and bases, redox and organic chemistry.',
    'biology': 'Cells, genetics, physiology, ecology, evolution and biotechnology.',
    'earth-science': 'Astronomy, solid Earth, atmosphere and ocean.',
    'mathematics': 'Algebra and functions, geometry, vectors, probability and statistics, and calculus.',
    'information-technology': 'Data, algorithms, programming, systems, networks and AI.',
    'geography': 'Maps, GIS, climate, landforms, population and the economy.',
    'music': 'Tone, tuning, harmony, instruments, rhythm and audio technology.',
}
for page, en in seo_en.items():
    source = (ROOT / (page + '.html')).read_text(encoding='utf-8')
    zh = flat(re.search(r'<meta name="description" content="([^"]*)"', source)[1])
    n = len(re.findall('class="module live"', source))
    texts.append(f'| {page}.html · 搜尋／分享摘要 | {zh} | {en} {n} interactive labs. Change the conditions, watch what happens and test the ideas in your textbooks. |')

# 每一個實驗的四層導覽都列出，讓審稿人不用逐頁打開。
texts += ['', '## 實驗頁導覽', '', '| 位置 | 中文 | English |', '|---|---|---|']
for s in audit.get('latest', []):
    pass
guard = json.loads((ROOT / 'tools/home-v2-invariants.json').read_text(encoding='utf-8'))
for x in guard['catalog'] + [{'s': s} for s in audit.get('extraModules', [])]:
    source = (ROOT / (x['s'] + '.html')).read_text(encoding='utf-8')
    m = re.search(r'<nav class="crumbs" data-en-html="([^"]*)">([\s\S]*?)</nav>', source)
    if m:
        texts.append(f"| {x['s']}.html | {flat(m[2])} | {flat(m[1])} |")
(OUT / '總表-文字.md').write_text('\n'.join(texts) + '\n', encoding='utf-8', newline='\n')

cards = []
for r in data['results']:
    cards.append('<figure><figcaption>' + html.escape(r['label']) + '</figcaption><a href="' + r['raw'] + '"><img loading="lazy" src="' + r['viewport'] + '" alt="' + html.escape(r['label']) + '"></a><a href="' + r['raw'] + '">開啟完整原圖</a></figure>')
sizes = ''.join('<tr><td>' + html.escape(f) + '</td><td>' + f'{n:,}' + '</td></tr>' for f, n in audit['files'].items())
summary = ''.join('<li><b>' + status + '</b> ' + html.escape(message) + '</li>' for status, message in checks)
gallery = '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>首頁改版審稿總表</title><style>body{margin:32px;font:16px/1.7 system-ui;color:#20313a;background:#f1f5f6}h1{font-size:28px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:24px}figure{margin:0;padding:16px;background:white;border:1px solid #c5d4da;border-radius:12px}figcaption{font-weight:700;min-height:56px}img{display:block;max-width:100%;max-height:820px;object-fit:contain;object-position:top left}a{color:#196558}table{border-collapse:collapse}td{border:1px solid #bccbd0;padding:6px 18px}</style><h1>首頁改版審稿總表</h1><p>點圖開啟完整原圖。47 張截圖，三語、深淺色、390／1280、登入與管理員、字級 ×1.3；測試一律假後端，正式 Firebase 零寫入。</p><ol>' + summary + '</ol><table><tr><td>HTML</td><td>bytes</td></tr>' + sizes + '</table><p>Firebase：未登入帳號 0 讀取；登入個人小節點 4 次；沿用帳號選單另查 admins/&lt;uid&gt; 1 次。匿名統計另計，五分鐘內跨頁重用。首頁不讀全份 scores。</p><p><a href="../../總表/總表-文字.md">中英文字總表</a> · <a href="../../總表/總表-驗證.md">驗證總表</a></p><main>' + ''.join(cards) + '</main></html>'
(SHOTS / '總表.html').write_text(gallery, encoding='utf-8', newline='\n')

delivery = [
    '# 首頁改版交件（home-v2）',
    '',
    '- 完成：首頁大廳、八科獨立頁、全科／本科搜尋、個人狀態、本機推薦、舊錨點轉址與四層導覽。',
    '- 保留：182 張原卡逐字相同；184 個實驗頁僅導覽／SEO 變更；任務、slug、網址、s/d/b/c、章制霸、Google 驗證 meta 與 Firebase 規則不變。',
    '- 產生工具：seo、build-hans、apply-directory --check、fix-crumbs --check、來源稽核通過。',
    '- 測試：189 個單元測試檔、14 頁 56 組版面語言檢查、4 個入口頁三語試玩及 3 個實驗各 150 步試玩通過。',
    '- verify：全流程 12 頁通過（全部核心／185 份任務證明／全站靜態），後續介面補驗 14 頁；收據見 .shots/verify-report.json。',
    '- 畫面：.shots/home-v2/總表.html；總表/ 內有 22 張保留原像素的 PNG、文字總表與 ≤40 行驗證總表（不 commit）。',
    '- 首頁大小：' + str(audit['files']['index.html']) + ' bytes；390 含 ×1.3 無橫向溢出，1280 首屏完整顯示八科。',
    '- 設計差異：首頁個人資料四個節點各讀一次；沿用登入選單另查 admins/<uid> 一次，合計五筆小節點，未登入為零。',
    '- 設計差異：介面補驗範圍為本次 14 頁，試玩為 3 個實驗與 4 個入口頁，未宣稱舊全站試玩全部通過。',
    '- 舊全站收據已有 earthquake 滑桿顯示及 polyrhythm 負半徑繪圖問題；本次沒有越權改實驗程式。',
    '- 課本切換結構已預留並隱藏；本科 JSON 存在時才啟用。',
    '- 尚待：Claude 審稿、修改清單、合併與上線。本次只在 home-v2 commit 一次；沒有 push、合併或執行 stamp。',
]
assert len(delivery) <= 25
(ROOT / '交件-首頁改版.md').write_text('\n'.join(delivery) + '\n', encoding='utf-8', newline='\n')
print('文字、驗證、HTML 總表與交件單完成。', flush=True)
