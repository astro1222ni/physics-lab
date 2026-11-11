# 課本實驗（選修物理講義的必做實驗）製作說明

> 站長 2026-11-11 指定：選修物理講義裡的每一個實驗，都要做成模擬實驗室（必做）。清單見 HANDOFF.md 第六節。
> 這份是 new-module.md 的補充；兩份都要遵守。用英文寫給背景助手。

## What is different from an ordinary module
The page simulates the ACTUAL textbook experiment — its apparatus, procedure, data table and analysis — so a student can "do" the lab at home and get realistic data:
1. Apparatus drawn like the real thing (2D, plus a 3D view where it adds insight — follow magnetic-particle's lazy three.js pattern and docs/briefs/add-3d.md).
2. Procedure as numbered steps the student performs by interacting (place pins, move the screen, change the current, read the meter…). Show which step they are on; allow free exploration too.
3. Measurement with realistic reading resolution and optional random/systematic error (toggle 「理想」/「含誤差」), reading scales, parallax hints where the real lab has them.
4. A data table the student fills by pressing 「記錄」, then the analysis the textbook uses (graph + best-fit line/slope/intercept, computed result vs accepted value, percent error). 全部清除 clears the table.
5. 「實驗目的」「實驗器材」「原理」「步驟」「注意事項」「問題與討論」sections in the notes (KaTeX), written in YOUR OWN WORDS. Never copy the handout's text, tables or figures — the handout is copyrighted; read it to know the procedure, then write fresh explanations.

## Reading the handout
The handout PDFs are on D:\物理講義電子檔\選修物理<Ⅰ–Ⅴ>\Ch*.pdf. Their Chinese text is stored without a Unicode map; decode it with:
`"G:\個人核心知識庫\.venv\Scripts\python.exe" -I <SCRATCH>\decode.py "<pdf>" <first>-<last>` (1-based page numbers are printed; argument pages are 0-based)
and render figures to PNG with `... -I <SCRATCH>\render.py "<pdf>" <out-prefix> <0-based pages comma-separated>` then look at the PNG.
(<SCRATCH> = C:\Users\ADMINI~1\AppData\Local\Temp\claude\d6a01df537396779\e0b9274e-9d00-4e00-9310-ebdb562969b2\scratchpad.) Read the whole experiment section (purpose, apparatus, procedure, data, questions), typically 3–6 pages.

## Files
Create ONLY: `<slug>.html`, `js/<slug>-core.js`, `js/<slug>.js`, `tests/<slug>-core.test.js`, `js/missions/<slug>.js`, optional `js/<slug>-3d.js`, optional `tools/mission-proofs/<slug>.js`. Do not modify any existing file (the lead integrates index.html, js/missions/index.js and stamps versions). Load js/drawkit.js before js/<slug>.js and use LabDraw for labels, arrows, balls, blocks, shadows, backdrop.

## Missions
Per docs/briefs/missions.md. Good experiment missions: obtain a measurement within x % of the accepted value, collect a full data table, find the best configuration, spot a systematic error, etc. Save your achievability proof as tools/mission-proofs/<slug>.js.

## Report
As in new-module.md (Traditional Chinese), plus: which handout pages you followed, and the home-page card texts (Chinese, English, data-keywords).

## Saving CPU (site owner, 2026-11-11)
Any Playwright script you write must launch Chromium with `const { launch } = require('G:/physics-lab/tools/browser.cjs'); const browser = await launch();` (same options as chromium.launch). It renders on the Intel iGPU — never the RTX 4070, which is reserved for video — at below-normal priority; plain chromium.launch() falls back to SwiftShader and burns CPU. Still block every non-local request. `npm run check`, `npm run shots`, `npm run verify` already use it.
