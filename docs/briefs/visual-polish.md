# 既有實驗的 2D 視覺優化說明（給負責單一實驗的助手）

> 站長 2026-11-11 指定的優先工作（HANDOFF.md 第六節第 0 項）。用英文寫給背景助手，避免語意走樣。

## Goal
Make ONE existing module's 2D canvas look refined, three-dimensional and consistent with the rest of the site — without changing any physics. The site owner will compare before/after screenshots.

## Read first
- CLAUDE.md (all rules; especially 最高原則, 新增或修改模組的慣例, 上線後不可隨意更動的約定).
- .claude/skills/physics-visual-design/SKILL.md (the visual standard — apply every section).
- js/drawkit.js — the shared drawing kit `LabDraw` (labels/pills with halo, vector arrows, specular balls, blocks, tubes, contact shadows, backdrop vignette, two-level grid, ripple, supText). Its look is the reference style (taken from projectile.js). Read its header comment for the API.
- Reference modules already polished: projectile.*, collision.*, electric-field.*.

## Files you may edit (ONLY these)
- `<slug>.html` and `js/<slug>.js`.
- Do NOT edit: `js/<slug>-core.js`, tests, `js/missions/*`, `lab.css`, `index.html`, any shared `js/*.js` (drawkit, settings, numinput, sound, missions…), `tools/*`. Other helpers are editing other modules in parallel. If you need a new color token or a drawkit change, describe it in your report instead.
- Never rename DOM ids, slider ids, `LabMission.emit` event names or payloads, mission conditions, the slug, or URLs.

## What to do
1. Add `<script src="js/drawkit.js"></script>` to `<slug>.html` immediately before `js/<slug>.js` (no `?v=`; the lead stamps versions).
2. Look at the before screenshots in `.shots/before/<slug>-*.png` (390/1280 px, light/dark, zh-Hant/zh-Hans/en) and list what looks weak: flat fills, labels without background, inconsistent arrows, crowding/overlap, text too small on phones, empty unbalanced areas, harsh colors, missing depth, dark-mode problems.
3. Replace the module's own label/arrow/ball/box/shadow/backdrop helpers with `LabDraw` equivalents where the result is equal or better (keep module-specific drawing). Same semantic colors as before (velocity, force, field… keep their tokens).
4. Polish per the skill: depth (gradients, contact shadows, rim light), two-level grid, halo/pill labels, round caps, fading trails, event feedback, offscreen static layers, reduced motion. Fix overlaps and crowding, especially at 390 px and font ×1.3. Keep text ≥ 11 px at 390 px.
5. Physics honesty: positions, lengths, angles, timing, vector scales must stay identical. Decorations go on top only. If something is not to scale it must say 示意圖（未依比例）.
6. Performance: no per-frame shadowBlur on many objects (LabDraw.ball caches sprites); cache static layers.

## Verify (all required)
- `npm test` — all pass. `node tools/mission-proofs/<slug>.js` if that file exists — must still pass.
- `npm run check -- <slug>` — all 4 combos pass (it blocks external network; never write to the real Firebase).
- `npm run shots -- <slug>` and LOOK at every screenshot in `.shots/<slug>-*.png`. Iterate until clearly better than `.shots/before/`. Also check font ×1.3 and English for overlaps.
- Interact once via Playwright (start/run the main animation) to make sure nothing throws during animation; no console errors.
- No git commit/push, no tools/stamp.py. Put scratch files in your system temp folder, not in the project.

## Report (Traditional Chinese, ≤ 15 lines)
What changed visually (bullets), anything you could not fix, any drawkit/token suggestions, and confirmation of test/check/proof results.

## Saving CPU (site owner, 2026-11-11)
Any Playwright script you write must launch Chromium with `const { launch } = require('G:/physics-lab/tools/browser.cjs'); const browser = await launch();` (same options as chromium.launch). It renders on the Intel iGPU — never the RTX 4070, which is reserved for video — at below-normal priority; plain chromium.launch() falls back to SwiftShader and burns CPU. Still block every non-local request. `npm run check`, `npm run shots`, `npm run verify` already use it.
