# 新增實驗模組的共同說明（給製作新模組的助手）

> 原本用英文寫給背景助手，保留原文以免語意走樣。整合步驟見 HANDOFF.md。

## Read first and follow strictly
- CLAUDE.md — project rules (structure, script order, i18n, numinput, sound, 全部清除, visual standard, checks). Follow every convention there.
- .claude/skills/physics-visual-design/SKILL.md — visual standard; apply fully from the start (depth, gradients, shadows, halos, fading trails, pill labels, offscreen static layers, reduced motion).
- Reference modules (finished, polished): circular-motion.* (newest, closest pattern: canvas layout, numinput, #soundBtn, 全部清除), collision.* (sound usage), electric-field.* (field rendering), magnetic-particle.* (lazy-loaded three.js 3D if useful), js/sound.js (tone/sweep/noise and continuous LabSound.voice), js/numinput.js.

## Files to create (ONLY these; do not modify any existing file — the lead integrates the home-page card and stamps versions)
<slug>.html, js/<slug>-core.js, js/<slug>.js, tests/<slug>-core.test.js. Copy head/footer script structure from circular-motion.html (no ?v= strings).

## General requirements
- Physics core DOM-free (UMD like the others), analytic/exact where possible; Node tests (Traditional Chinese names) against analytic results, limits and conservation laws; all must pass.
- Page: crumbs (index.html#<branch> / branch / topic), intro, controls, readouts with units, notes with KaTeX formulas + 觀察重點 + 模擬方法, footer.
- Full English (data-en*, T(zh,en) for all JS/canvas strings, <body data-en-ready>); zh-Hans automatic.
- numinput: every slider value clickable/typeable via js/numinput.js, LabNum.value everywhere, sensible data-decimals, LabNum.register for non-linear sliders, LabNum.set/clear for presets.
- Sound where it teaches something (#soundBtn toggle, off by default, ≥ 250 Hz main energy); 全部清除 button if anything accumulates.
- Light/dark tokens + 'lab:themechange'; font 1.3 fits; 390 px no horizontal scroll; touch targets ≥ 44 px; touch drag works; prefers-reduced-motion respected.
- Verify with Playwright (`npm install` and `npx playwright install chromium` once; `npm run check -- <slug>` does the standard layout/language checks and serves the site itself; for custom scripts serve with `npm run serve`). Never write test data to the real Firebase database — use tools/mock-backend.js. Check 390/1280, light/dark, zh-Hant/zh-Hans/en (no CJK in DOM or canvas in en), font 1.3, no .katex-error, no page errors, sound calls only when on and once per event, typed values flow into physics. Look at your screenshots and iterate on visuals.
- No git commit/push; no tools/stamp.py. Scratch only in <系統暫存資料夾>（不要放在專案裡）

## Missions (required)
Also follow docs/briefs/missions.md exactly (mission mode with 倪的星星: 8–12 missions over levels 1–10 plus 10 VERY cryptic hidden missions — the riddle must not state or obviously paraphrase the condition — all proven achievable with the core; default state must not trigger missions). Achievements load automatically via js/missions.js. Do NOT edit js/missions/index.js or index.html.

## Report (concise, in Traditional Chinese)
Files, test results, controls, teaching points, sound events, data-decimals, verification, uncertainties, and for the home-page card: Chinese description, English description, data-keywords (Chinese + English synonyms).

## Extra rules (learned from the last batch)
- Never use Unicode superscript/subscript digit characters (⁰⁴⁵⁶⁷⁸⁹⁻ etc.) anywhere — not in HTML, not in canvas text. In HTML use <sup>/<sub>; on canvas draw the superscript yourself with a smaller font (² ³ ¹ ½ are fine).
- Mission events must only fire after the user has actually operated a control (verify the default state and the initial autoplay trigger nothing).
- Other agents are building other modules in the same repo at the same time: touch ONLY your own files listed above.

## Saving CPU (site owner, 2026-11-11)
Any Playwright script you write must launch Chromium with `const { launch } = require('G:/physics-lab/tools/browser.cjs'); const browser = await launch();` (same options as chromium.launch). It renders on the Intel iGPU — never the RTX 4070, which is reserved for video — at below-normal priority; plain chromium.launch() falls back to SwiftShader and burns CPU. Still block every non-local request. `npm run check`, `npm run shots`, `npm run verify` already use it.
