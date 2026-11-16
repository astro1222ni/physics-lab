#!/usr/bin/env python3
"""把科目頁某張「規劃中」卡片改成「已上線」的連結卡片。

用法：
  python3 tools/make_live.py <模組代號> <卡片中文標題> \
      [--desc 中文說明] [--desc-en English description] [--keywords "同義詞 …"]

例：python3 tools/make_live.py circular-motion 等速圓周運動 --desc "…" --desc-en "…" --keywords "…"
未提供的欄位保留卡片原本的內容。
"""
import argparse
import html
import pathlib
import re
import sys
import json
import subprocess

root = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('slug')
ap.add_argument('title')
ap.add_argument('--desc')
ap.add_argument('--desc-en')
ap.add_argument('--keywords')
a = ap.parse_args()

meta = subprocess.run(['node', '-e', "const fs=require('fs'),w={};new Function('window',fs.readFileSync('js/missions/index.js','utf8'))(w);console.log(JSON.stringify(w.LAB_SUBJECTS.map(s=>s.page)))"], cwd=root, capture_output=True, text=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
pages = [root / (p + '.html') for p in json.loads(meta.stdout)]
card_re = re.compile(r'^(?P<ind>[ \t]*)<(?P<tag>div|a) class="module(?: [^"]*)?"(?P<attrs>[^>]*)>(?P<body>.*?)\n(?P=ind)</(?P=tag)>', re.S | re.M)
h3_re = re.compile(r'<h[34][^>]*>' + re.escape(html.escape(a.title, quote=False)) + r'</h[34]>')
matches = [p for p in pages if p.exists() and any(h3_re.search(c.group('body')) for c in card_re.finditer(p.read_text(encoding='utf-8')))]
if len(matches) != 1:
    sys.exit('請先在唯一對應的科目頁加入該實驗卡片')
index = matches[0]
s = index.read_text(encoding='utf-8')
if not (root / f'{a.slug}.html').exists():
    sys.exit(f'找不到 {a.slug}.html')

# 逐張卡片比對（不跨卡片、不跨分支）：卡片 = class 為 "module" 或 "module …" 的 <div>/<a>，
# 以同一縮排的結束標籤收尾；標題必須在這張卡片自己的 <h3> 裡。
hits = [c for c in card_re.finditer(s) if h3_re.search(c.group('body'))]
if len(hits) != 1:
    sys.exit(f'標題為「{a.title}」的卡片找到 {len(hits)} 張，應該剛好 1 張')
m = hits[0]

attrs = m.group('attrs')
attrs = re.sub(r'\s(href|data-module)="[^"]*"', '', attrs)
if a.keywords:
    attrs = re.sub(r'\sdata-keywords="[^"]*"', '', attrs)
    attrs += f' data-keywords="{html.escape(a.keywords, quote=True)}"'
body = m.group('body')
body = re.sub(r'<span class="tag soon"[^>]*>[^<]*</span>', '<span class="tag" data-en="Live">已上線</span>', body)
if a.desc or a.desc_en:
    def fix_p(pm):
        p_attrs, text = pm.group(1), pm.group(2)
        if a.desc_en:
            p_attrs = re.sub(r'\sdata-en(-html)?="[^"]*"', '', p_attrs) + f' data-en="{html.escape(a.desc_en, quote=True)}"'
        return f'<p{p_attrs}>{html.escape(a.desc) if a.desc else text}</p>'
    body = re.sub(r'<p([^>]*)>(.*?)</p>', fix_p, body, count=1, flags=re.S)

ind = m.group('ind')
new = f'{ind}<a class="module live" href="{a.slug}.html" data-module="{a.slug}"{attrs}>{body}\n{ind}</a>'
s = s[:m.start()] + new + s[m.end():]
index.write_bytes(s.encode('utf-8'))
print(f'已上線：{a.title} → {a.slug}.html')
