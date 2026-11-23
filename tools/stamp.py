#!/usr/bin/env python3
"""在所有 HTML 的根目錄 CSS（lab.css、exam.css、learn.css…）與 js/**/*.js 連結後加上版本號（?v=時間戳），
讓瀏覽器在網站更新後立刻載入新檔，而不是沿用快取的舊檔。
每次修改 CSS 或 JS 後、commit 前執行：python3 tools/stamp.py
背景還有人在改其他頁面時，只蓋這次要發布的頁面：python3 tools/stamp.py index.html projectile.html …"""
import pathlib, re, sys, time

root = pathlib.Path(__file__).resolve().parent.parent
ver = time.strftime('%Y%m%d%H%M')
# js/ 底下的子資料夾（例如 js/missions/）也要加，任務說明改了才不會讀到舊快取
# 根目錄的 CSS 全部都加（11/23：exam.css、learn.css 沒加版本號，站長手機一直讀到舊樣式，「我根本就沒看到你有修改」）
pat = re.compile(r'((?:href|src)="(?:[\w-]+\.css|js/(?:[\w-]+/)*[\w.-]+\.js))(?:\?v=[\w-]+)?"')
only = [a for a in sys.argv[1:] if a.endswith('.html')]
files = [root / a for a in only] if only else sorted(root.glob('*.html'))
for f in files:
    s = f.read_text(encoding='utf-8')
    t = pat.sub(lambda m: f'{m.group(1)}?v={ver}"', s)
    if t != s:
        # 用 bytes 寫：Windows 的文字模式會把 \n 變成 \r\n，整個檔案的換行都會變動（11/12 出過一次）
        f.write_bytes(t.encode('utf-8'))
        print('stamped', f.name, ver)

# ── 每頁「最後更新」到幾時幾分（站長 11/16：「這個實驗最後更新的日期明顯是錯誤的。更新的包含日期，還有幾時幾分。」）
# 舊做法取 npm run seo 當時的目錄快照、只看實驗自己的檔案，共用的操作台、側板改了也不算，又沒有時分。
# 新做法：每頁的內容指紋＝HTML（去掉 ?v= 與本標記）＋它載入的本站 CSS／JS＋執行時才載入的共用檔；
# 指紋變了就把 <meta name="lab-updated"> 改成現在（臺灣時間），記在 tools/page-updated.json。js/classroom.js 讀它顯示在頁尾。
import hashlib, json
REC = root / 'tools' / 'page-updated.json'
ref_pat = re.compile(r'(?:href|src)="((?:[\w-]+\.css|js/[\w/.-]+\.js|vendor/[\w/.-]+\.(?:js|css)))(?:\?v=[\w-]+)?"')  # 根目錄的 CSS 都算（lab.css、study.css、各實驗自學 CSS）
meta_pat = re.compile(r'[ \t]*<meta name="lab-updated" content="[^"]*">\r?\n?')
DYNAMIC = ['js/classroom.js', 'js/lab-layout.js']              # settings.js 執行時載入，每個實驗頁都有
TOOLS_CSS = ('js/labside.js', 'js/stepguide.js', 'js/vpad.js', 'js/labpanel.js')  # 這些會自己載 lab-tools.css

def page_refs(text):
    refs = list(dict.fromkeys(ref_pat.findall(text)))
    if 'js/settings.js' in refs: refs += [d for d in DYNAMIC if d not in refs]
    if any(r in refs for r in TOOLS_CSS) and 'lab-tools.css' not in refs: refs.append('lab-tools.css')
    return refs

def fingerprint(text):
    h = hashlib.sha1(meta_pat.sub('', re.sub(r'\?v=[\w-]+', '', text)).encode('utf-8'))
    for r in page_refs(text):
        p = root / r
        h.update(r.encode()); h.update(p.read_bytes().replace(b'\r\n', b'\n') if p.exists() else b'-')  # 換行統一成 LF：git 換出來的檔不會被當成改過
    return h.hexdigest()[:16]

try: rec = json.loads(REC.read_text(encoding='utf-8'))
except Exception: rec = {}
now = time.strftime('%Y-%m-%d %H:%M')
changed = False
for f in files:
    s = f.read_text(encoding='utf-8')
    if '<meta charset' not in s or 'js/settings.js' not in s: continue
    fp = fingerprint(s)
    old = rec.get(f.name)
    if not old or old.get('h') != fp:
        rec[f.name] = {'h': fp, 't': now}
        changed = True
    t = rec[f.name]['t']
    tag = f'<meta name="lab-updated" content="{t}">'
    if tag not in s:
        s2 = meta_pat.sub('', s)
        s2 = re.sub(r'(<meta charset="[^"]*">)(\r?\n)', lambda m: m.group(1) + m.group(2) + tag + m.group(2), s2, count=1)
        f.write_bytes(s2.encode('utf-8'))
        print('updated', f.name, t)
if changed:
    REC.write_bytes((json.dumps(dict(sorted(rec.items())), ensure_ascii=False, indent=0) + '\n').encode('utf-8'))
