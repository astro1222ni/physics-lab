#!/usr/bin/env python3
"""在所有 HTML 的 lab.css 與 js/*.js 連結後加上版本號（?v=時間戳），
讓瀏覽器在網站更新後立刻載入新檔，而不是沿用快取的舊檔。
每次修改 CSS 或 JS 後、commit 前執行：python3 tools/stamp.py"""
import pathlib, re, time

root = pathlib.Path(__file__).resolve().parent.parent
ver = time.strftime('%Y%m%d%H%M')
pat = re.compile(r'((?:href|src)="(?:lab\.css|js/[\w.-]+\.js))(?:\?v=\w+)?"')
for f in sorted(root.glob('*.html')):
    s = f.read_text(encoding='utf-8')
    t = pat.sub(lambda m: f'{m.group(1)}?v={ver}"', s)
    if t != s:
        f.write_text(t, encoding='utf-8')
        print('stamped', f.name, ver)
