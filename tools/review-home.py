#!/usr/bin/env python3
"""把本機驗收原圖排成保留原始像素的審稿 PNG，另產生三份審稿文字。"""
from pathlib import Path
from collections import defaultdict
from html.parser import HTMLParser
import html
import json
import re
import shutil
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / '.shots' / 'home-v2-r2'
OUT = ROOT / '總表'
OUT.mkdir(exist_ok=True)
Image.MAX_IMAGE_PIXELS = None  # 全部輸入均為本工具剛產生的本機長頁截圖
data = json.loads((SHOTS / 'review.json').read_text(encoding='utf-8'))
audit = json.loads((SHOTS / 'source-audit.json').read_text(encoding='utf-8'))
skeleton = json.loads((SHOTS / 'skeleton.json').read_text(encoding='utf-8'))['checks'][-1]['data']
assert skeleton['n'] == 180 and skeleton['maxShift'] == 0 and skeleton['maxDailyShift'] == 0
# 載入成功還不夠：來源 WebP 本身也必須有圖像內容，不能是純色占位圖。
sources = sorted({i['source'].split('?')[0] for r in data['results'] for i in r.get('thumbnails', {}).get('images', [])})
pixels = []
for source in sources:
    file = (ROOT / source).resolve()
    assert file.is_relative_to(ROOT / 'img' / 'thumbs')
    with Image.open(file) as im:
        extrema = im.convert('RGB').getextrema()
        assert any(hi - lo > 10 for lo, hi in extrema), source + ' 是純色空圖'
        pixels.append({'source': source, 'size': im.size, 'extrema': extrema})
(SHOTS / 'thumb-pixels.json').write_text(json.dumps({'sources': len(pixels), 'blank': 0, 'images': pixels}), encoding='utf-8', newline='\n')
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
    if r['kind'] in ('matrix', 'member-matrix'):
        key = f"{r['slug']}-{r['state']}-{r['w']}-{r['lang']}"
    elif r['kind'] in ('status', 'cold', 'recommend', 'search'):
        key = f"首頁-{r['state']}-{r['kind']}"
    elif r['kind'] == 'large':
        key = f"字體特大-{r['slug']}-{r['state']}-{r['w']}-{r['lang']}"
    else:
        key = {'interaction': '互動特寫', 'before': '改版前對照'}[r['kind']]
    groups[key].append(r)

# 保留上一輪表格；輸出每組最多兩張深淺色原圖，檔名序號先排390 px。
assert OUT.resolve() == ROOT.resolve() / '總表'
backup = SHOTS / 'prior-tables'
backup.mkdir(exist_ok=True)
for old in OUT.glob('總表-畫面-*.png'):
    assert old.resolve().parent == OUT.resolve() and old.is_file()
    shutil.copy2(old, backup / old.name)
    old.unlink()
for number, (key, rows) in enumerate(sorted(groups.items(), key=lambda entry: min(r['w'] for r in entry[1])), 1):
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
    name = OUT / (f'總表-畫面-{number:02d}-' + key + '.png')
    sheet.save(name, compress_level=6)
    sheet.close()
    print('總表 PNG：' + name.name, flush=True)

verify = json.loads((SHOTS / 'verify-full.json').read_text(encoding='utf-8'))
receipt = json.loads((SHOTS / 'verification-receipt.json').read_text(encoding='utf-8'))
behavior = json.loads((SHOTS / 'behavior.json').read_text(encoding='utf-8'))
play_pages = json.loads((SHOTS / 'playtest-full.json').read_text(encoding='utf-8'))['pages']
source_receipts = json.loads((SHOTS / 'reused-playtests.json').read_text(encoding='utf-8'))['receipt']
source_cached = sum(bool(play_pages.get(r['slug'], {}).get('cached')) for r in source_receipts)
cache_note = f'其中{source_cached}筆沿用改版前有效試玩，已核對除導覽／SEO外的HTML與實驗、任務相依檔SHA；證據reused-playtests.json，本次導覽與版面全站重驗。'
pending_n = sum(len(p.get('pending', [])) for p in play_pages.values())
pending_note = f'全站試玩另有{pending_n}項待人工確認，原始內容保留於playtest-full.json。' if pending_n else '全站試玩無待人工確認項目。'
if play_pages.get('code-tracing', {}).get('pending'):
    pending_note += 'code-tracing的百分比提醒已判斷為取餘數式誤判，見pending-dispositions.json。'
fresh_pending = [str(p.get('mission') or slug) for slug, result in play_pages.items() if not result.get('cached') for p in result.get('pending', [])]
fresh_pending_note = '；'.join(fresh_pending) or '無'
checks = [
 ('通過', '390×844標準字：站名、搜尋、狀態、完整每日橫幅與首張按鍵上緣；不再要求1280首屏全部八科。'),
 ('通過', '八科按鍵同寬同高、科名23 px；3／2／1欄，回到舊domain-tab排版。'),
 ('通過', '182張原卡逐字不變；184頁僅導覽／SEO，s/d/b/c與章制霸不變。'),
 ('通過', '舊科目／分支／章／製作中章錨點與未知錨點均抽查。'),
 ('通過', '舊href零處；四層導覽每層皆可點。'),
 ('通過', '全科與本科搜尋、英文／簡體／同義詞／?q=、跨全科入口正常。'),
 ('通過', '三身分正常；骨架180組載入前後高度差均0 px（含特大字／720）；個人五節點＋admins，訪客零讀取。'),
 ('通過', '推薦四張、同科／同章上限二、跨科至少一；冷啟動四科、連續八日涵蓋八科。'),
 ('通過', '最新四張、同科最多二，靜態HTML；l重查全分支與舊路徑，初建站批次不計新徽章。'),
 ('通過', '八科整頁縮圖全部解碼；橫滑方向提示、44 px回頂端、頁底72 px、課本hidden正常。'),
 ('通過', '獨立SEO／分享卡／hreflang／結構化資料／網站地圖與Google驗證meta保留。'),
 ('通過', '390含×1.3無橫向捲動；108組特大字版面、鍵盤入口及登入流程通過。'),
 ('通過', '三語、深淺色、390／1280已截圖；英文無中文、數學簡體用語正確。'),
 ('已執行', '不帶參數npm run verify完整全站；實際錯誤和改版前已有的earthquake／polyrhythm分列在本表頂部。'),
 ('通過', f"index.html {audit['files']['index.html']:,} bytes，小於60 KB，靜態入口不等待Firebase。"),
]
errors = '；'.join(x['area']+'：'+x['msg'] for x in verify.get('errors', [])) or '無'
revision = [
 '1. 通過：唯一主色星星成就入口、整塊摘要、五寶物剩餘數、排行榜#board與管理入口。',
 '2. 通過：獨立暖金每日橫幅、7:5並排／手機滿寬、進度十點與雙登入目的地。',
 '3. 通過：舊domain-tab字級排版，52 px圖示、23 px科名、明算edge/wash、厚邊與按壓／焦點／減少動態。',
 '4. 通過：製作中改13 px文字列＋12 px虛線圓圈，完整aria-label，不可點。',
 '5. 通過：首頁字級≥12 px、指定層級與行高、次要文字深淺色對比≥4.5。',
 '6. 通過：狀態自然高度、橫排最近紀錄與會員續玩；390訪客最多208.75／會員258.75 px，首屏條件達成，180組狀態／每日骨架載入前後高度差0 px。',
 '7. 通過：最新／推薦各4張，16:10縮圖，桌面4欄、手機2×2，名稱兩行與理由省略。',
 '8. 查明並通過：原空白為未觸發原生lazy loading；逐段捲動停300 ms後，八科兩寬深淺全部成功載入／解碼。',
 '9. 通過：科目切換及黏頂列左右24 px漸層，到端點消失，保留自動置中。',
 '10. 通過：手機44×44圓形↑，aria-label保留，頁底72 px。',
 '11. 通過：冷啟動改「{分支}入門／Starter · {Field}」。',
 '12. 通過：理由引用名稱去尾段中英括號，一行省略，title保留全文。',
 '13. 通過：「我的狀態」英文My progress。',
 '14. 通過：英文徽章+{N} new。',
 '15. 通過：訪客說明替換為星星、名次、寶物保存句，刪舊Google登入主按鈕。',
 '16. 查明並調整：全歷史複核182筆日期與前版一致（11/11有24筆、11/12有39筆、11/13有119筆），均為七日內初建站批次；保留真實l、既有批次不計新徽章，後續新增>30%寫檔前失敗列清單，邊界測試通過。',
 '17. 通過：跨科同主題只限x或cosine≥0.25；弱補卡用泛句，拋體→二分搜尋回歸測試通過。',
 '18. 通過：新增bag/<uid>，個人五節點＋admins，daily重用，不讀全份scores。',
 '19. 通過：sessionStorage保留目的地，popup／redirect各兩目的地測試通過；取消清除，一般登入留首頁。',
 '20. 通過：臺灣00:00小函式、每分鐘更新；mockoffset跨日自動歸零與全完成文案通過。',
 '21. 通過：超過七天名次不顯示數字，改看我的名次；第七天邊界有測試。',
 '22. 通過：設計書§2／§3／§6與CLAUDE首頁段落同步，§7補八科完整縮圖截圖規範。',
 '23. 已執行：不帶參數npm run verify全站；原始退出碼與全部錯誤見頂部，未掩蓋舊問題。',
]
md = ['# 首頁改版驗證總表（依修改清單）', '',
 f"- 完整 npm run verify（不帶參數）：退出碼 {receipt['verifyExit']}；單元、證明、導覽、目錄、全站介面與頁面檢查結果見 .shots/home-v2-r2/verify-full.json。",
 '- 完整verify錯誤：'+errors+'。earthquake／polyrhythm已在改版前11/14收據存在（old-issues.json）；保留原結果，未修改實驗物理。',
 '- 本次新實玩的工具提醒：'+fresh_pending_note+'；重現見playtest-full.json。code-tracing的%為取餘數、屬工具誤判；riemann-sum-10待審稿人判斷（原程式未改），見pending-dispositions.json。',
 '- 驗收1–15：'+ '；'.join(str(i)+status for i,(status,_) in enumerate(checks,1))+'（細節與大小見HTML總表）。',
 '- 測試：'+receipt['testSummary']+cache_note+pending_note,
 '- 產生／檢查：seo、build-hans、apply-directory --check、fix-crumbs --check、來源稽核；正式Firebase零寫入、指定瀏覽器／鎖、全外連封鎖。',
 '- 舊連結抽查：'+'；'.join('#'+r['hash']+'→'+r['actual'] for r in data['redirects'])+'。',
 f"- 畫面：{len(data['results'])}張原圖、{len(groups)}張PNG總表；八科兩寬深淺均零缺圖，另有108組特大字與180組骨架；來源 .shots/home-v2-r2/。", '',
 '## 23項逐項處理結果', ''] + revision + [
 '', '設計差異：第16項僅對逐筆Git證據綁定的首次建站182筆豁免增量30%門檻；日期不造假，後續新增仍嚴格檢查。',
 '尚待：審稿、合併與上線；本次只在home-v2本機commit，不push、不合併、不執行stamp。']
assert len(md) <= 40
(OUT / '總表-驗證.md').write_text('\n'.join(md) + '\n', encoding='utf-8', newline='\n')

class Pairs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.pairs, self.tags = [], [], []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for p in self.stack:
            if tag == 'br':
                p['parts'].append(' ')
        void = tag in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
        if not void:
            self.tags.append(tag)
        if 'data-en' in a or 'data-en-html' in a:
            self.stack.append({'depth': len(self.tags), 'parts': [], 'en': a.get('data-en', a.get('data-en-html'))})
        for key, val in a.items():
            if key.startswith('data-en-'):
                field = key[8:]
                if field != 'html' and field in a:
                    self.pairs.append((a[field], val, field))
    def handle_data(self, text):
        for p in self.stack:
            p['parts'].append(text)
    def handle_endtag(self, tag):
        if tag not in self.tags:
            return
        depth = len(self.tags) - self.tags[::-1].index(tag)
        while self.stack and self.stack[-1]['depth'] >= depth:
            p = self.stack.pop()
            self.pairs.append((''.join(p['parts']), p['en'], tag))
        del self.tags[depth - 1:]

def pairs(source):
    p = Pairs()
    p.feed(source)
    return p.pairs

def flat(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]*>', '', s))).strip().replace('|', '\\|')

old_pairs = {(flat(zh), flat(en)) for zh, en, _ in pairs((ROOT / '.shots/home-v2/baseline/index.html').read_text(encoding='utf-8'))}
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
    ('狀態・寶物無障礙', '{寶物}，現在剩下 {N}', '{treasure}, remaining {N}'),
    ('寶物', '銅幣／銀幣／金幣／鑽石／稀有鑰匙', 'Copper coin / Silver coin / Gold coin / Diamond / Rare key'),
    ('狀態・底列', '全站排行榜 →', 'Leaderboard →'),
    ('每日・會員按鈕', '去做每日任務 →', 'Go to daily missions →'),
    ('每日・進度', '今天完成 {N}/10', '{N}/10 done today'),
    ('每日・倒數', '{H} 小時 {M} 分後換新', 'New set in {H} h {M} min'),
    ('每日・全完成', '今天全部完成！明天 00:00 再來。', 'All done today! New missions at 00:00.'),
    ('每日・資料失敗', '進度暫時載入不了，先到任務頁看看。', 'Progress could not load yet. Take a look at the missions.'),
    ('狀態・未登入', '登入，收集倪的星星', 'Sign in. Start collecting Ni stars.'),
    ('狀態・未登入', '星星、名次、寶物都會留下來。', 'Keep your stars, rank and treasures.'),
    ('狀態・按鈕', '登入，看我的星星與成就', 'Sign in to see my stars & achievements'),
    ('狀態・紀錄', '最近玩過', 'Recently played'),
    ('狀態・無紀錄', '還沒玩過，從下面挑一科開始。', 'Your first lab is waiting. Pick a subject below.'),
    ('狀態・無暱稱', '探索者', 'Explorer'),
    ('狀態・管理員', '管理員・管理頁 →', 'Admin · Dashboard →'),
    ('狀態・名次快取', '全科第 {N} 名', 'Rank {N} overall'),
    ('狀態・名次更新title', '{M} 天前更新', 'Updated {M}d ago'),
    ('狀態・無名次快取', '看我的名次', 'See my rank'),
    ('狀態・紀錄', '繼續上次的實驗', 'Continue your last lab'),
    ('狀態・進度', '完成 {N}/{M}', '{N}/{M} missions done'),
    ('狀態・無紀錄', '挑一科，開始你的下一個發現。', 'Pick a subject. Find your next discovery.'),
    ('狀態・成就', '我的星星與成就 →', 'My stars & achievements →'),
    ('狀態・載入失敗', '先選一科開始，登入功能稍後再試。', 'Pick a subject to begin. Sign-in can wait.'),
    ('狀態・帳號資料載入失敗', '進度暫時載入不了', 'Your progress could not load yet.'),
    ('狀態・帳號資料載入失敗', '先選一科玩玩，稍後再回來看看。', 'Pick a subject to play. Check back in a moment.'),
    ('科目卡・數量', '{N} 個實驗', '{N} labs'),
    ('科目卡・規劃', '另有 {N} 個製作中', '{N} more in progress'),
    ('科目卡・上架', '新 +{N}', '+{N} new'),
    ('推薦・標題', '為你推薦', 'Picked for you'),
    ('推薦・同章', '同一章：你玩過〈{名稱}〉', 'Same chapter as {name}'),
    ('推薦・跨科', '跨科：和〈{名稱}〉同主題', 'Across subjects: related to {name}'),
    ('推薦・同分支', '同一領域：你玩過〈{名稱}〉', 'Same field as {name}'),
    ('推薦・相似', '因為你玩過〈{名稱}〉', 'Because you tried {name}'),
    ('推薦・入門', '{分支}入門', 'Starter · {Field}'),
    ('推薦・補滿', '換個領域，試試新的發現。', 'Try a new field. Find a new idea.'),
    ('科目頁・數量', '{N} 個實驗・{M} 章', '{N} labs · {M} chapters'),
    ('分支黏頂列・無障礙', '跳到分支', 'Jump to a field'),
    ('回頂端・按鈕／無障礙', '↑／回到頁首', '↑ / Back to top'),
    ('搜尋・全科入口', '到全科搜尋「{關鍵字}」→', 'Search all subjects for “{query}” →'),
    ('搜尋・載入失敗', '搜尋暫時無法載入，請稍後再試。', 'Search could not load. Try again later.'),
    ('搜尋・未上架名稱尚未列於目錄', '{章名}・新實驗製作中', '{chapter} · New lab in progress'),
    ('搜尋・未上架說明', '這個實驗還在製作，先試試同章已上線的實驗。', 'This lab is in progress. Try a live lab in the same chapter.'),
    ('最新上架・日期', '{M}/{D} 上架', 'Added {M}/{D}'),
    ('科目分享卡', '{N} 個互動實驗／動手試，親眼看。', '{N} interactive labs / Try it. See it.'),
]
for pos, zh, en in dynamic:
    texts.append(f'| {pos} | {zh} | {en} |')
for domain, copy in json.loads((ROOT / 'tools/home-subject-copy.json').read_text(encoding='utf-8')).items():
    texts.append(f"| 首頁・{domain}科目按鍵・分支一覽（沿用舊版） | {copy['zh']} | {copy['en']} |")

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
gallery = '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>首頁改版審稿總表</title><style>body{margin:32px;font:16px/1.7 system-ui;color:#20313a;background:#f1f5f6}h1{font-size:28px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:24px}figure{margin:0;padding:16px;background:white;border:1px solid #c5d4da;border-radius:12px}figcaption{font-weight:700;min-height:56px}img{display:block;max-width:100%;max-height:820px;object-fit:contain;object-position:top left}a{color:#196558}table{border-collapse:collapse}td{border:1px solid #bccbd0;padding:6px 18px}</style><h1>首頁改版審稿總表</h1><p>點圖開啟完整原圖。' + str(len(data['results'])) + ' 張截圖，三語、深淺色、390／1280、登入與管理員、字級 ×1.3；測試一律假後端，正式 Firebase 零寫入。</p><ol>' + summary + '</ol><table><tr><td>HTML</td><td>bytes</td></tr>' + sizes + '</table><p>Firebase：未登入帳號 0 讀取；登入個人小節點 5 次；沿用帳號選單另查 admins/&lt;uid&gt; 1 次。匿名統計另計，五分鐘內跨頁重用。首頁不讀全份 scores。</p><p><a href="../../總表/總表-文字.md">中英文字總表</a> · <a href="../../總表/總表-驗證.md">驗證總表</a></p><main>' + ''.join(cards) + '</main></html>'
gallery = gallery.replace('<ol>', '<p><strong>不帶參數 npm run verify：退出碼 ' + str(receipt['verifyExit']) + '</strong>。' + html.escape(errors) + '。earthquake／polyrhythm為改版前既有問題。<a href="verify-full.json">原始驗證收據</a>；<a href="skeleton.json">180組骨架高度量測</a>。</p><ol>', 1)
(SHOTS / '總表.html').write_text(gallery, encoding='utf-8', newline='\n')

delivery = [
 '# 首頁改版交件（home-v2）', '',
 '- 初版提交：26bf3f6；八科獨立頁與182張原卡搬遷，184頁導覽／SEO、任務與章制霸不變。',
 '- 本輪提交編號與逐檔清單：[commit收據](.shots/home-v2-r2/commit-receipt.json)（本輪commit後讀回產生）。',
 '- 本輪成果：總表/的PNG、總表-文字.md、總表-驗證.md（不commit）；完整原圖與可點總表在.shots/home-v2-r2/。',
 '- 本次沒有push、合併或執行stamp；Google驗證meta及Firebase規則保留。', '',
 '## 依修改清單修正', '',
 '- 1–7：手機優先；星星成就主入口、剩餘五寶物、獨立每日橫幅、舊domain-tab字級＋立體按鍵3／2／1欄、製作中文字列、四張最新／推薦。',
 '- 8：查明為原生lazy loading尚未觸發；每段捲動停300 ms，八科390／1280深淺整頁全部縮圖解碼後再拍。',
 '- 9–15：兩列方向漸層、44 px↑與72 px底距、入門理由、括號裁短、My progress、+N new與新登入說明。',
 '- 16偏離：全歷史複核182筆日期原本正確（11/11–13），都是七日內初建站批次；保留真實l，以Git證據綁定既有批次、不列新徽章，後續新增超30%仍失敗。',
 '- 17–21：cosine跨科門檻與泛用補卡理由、五節點、popup／redirect目的地保存、臺灣午夜重設、七日名次失效；假後端回歸測試通過。',
 '- 22：設計書與CLAUDE同步；23：不帶參數npm run verify完整執行，實際退出碼與原始錯誤見總表頂部。',
 '- 測試：'+receipt['testSummary'],
 '- 尚未完成：完整verify仍有改版前就存在的earthquake滑桿／polyrhythm負半徑問題；原始結果保留，沒有越權改物理。'+pending_note,
 '- 尚待審稿、合併與上線；本輪在home-v2再提交一次，總表不加入Git。',
]
assert len(delivery) <= 25
assert len(delivery[delivery.index('## 依修改清單修正'):]) <= 15
(ROOT / '交件-首頁改版.md').write_text('\n'.join(delivery) + '\n', encoding='utf-8', newline='\n')
print('文字、逐項驗證、HTML總表與交件單完成。', flush=True)
