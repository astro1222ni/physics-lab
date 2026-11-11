#!/usr/bin/env python3
"""把首頁某張「規劃中」卡片改成「已上線」的連結卡片。

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

root = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('slug')
ap.add_argument('title')
ap.add_argument('--desc')
ap.add_argument('--desc-en')
ap.add_argument('--keywords')
a = ap.parse_args()

index = root / 'index.html'
s = index.read_text(encoding='utf-8')
if not (root / f'{a.slug}.html').exists():
    sys.exit(f'找不到 {a.slug}.html')

pat = re.compile(
    r'<(div|a) class="module[^"]*"(?P<attrs>[^>]*)>(?P<body>(?:(?!</(?:div|a)>\s*\n\s*<(?:div|a) class="module).)*?<h3[^>]*>'
    + re.escape(a.title) + r'</h3>.*?)</\1>', re.S)
m = pat.search(s)
if not m:
    sys.exit(f'找不到標題為「{a.title}」的卡片')

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

new = f'<a class="module live" href="{a.slug}.html" data-module="{a.slug}"{attrs}>{body}</a>'
s = s[:m.start()] + new + s[m.end():]
index.write_text(s, encoding='utf-8')
print(f'已上線：{a.title} → {a.slug}.html')
