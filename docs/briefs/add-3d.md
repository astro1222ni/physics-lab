# 替既有實驗加 3D 檢視的說明（給負責單一實驗的助手）

> 站長 2026-11-11 指定的優先工作（HANDOFF.md 第六節第 0 項）。範本是「帶電粒子在磁場中運動」（magnetic-particle）。

## Goal
Add a "2D 平面 / 3D 立體" view switch to ONE existing module, following magnetic-particle exactly in structure, while keeping the 2D view as the default and unchanged in behaviour. The 3D view must show the SAME physics (same charges/bodies/parameters, computed by the same core) and add real 3D insight.

## Read first
- CLAUDE.md, HANDOFF.md 第六節第 0 項, .claude/skills/physics-visual-design/SKILL.md (section 6 for 3D).
- magnetic-particle.html and js/magnetic-particle.js: the view switch buttons (#view2d / #view3d / #resetCam), lazy `import()` of `vendor/three/three.module.min.js` and `vendor/three/OrbitControls.js` only when 3D is chosen, WebGL detection, fallback to 2D with a message, context-loss handling, disposing on switch back, pause when hidden, touch rotate/pinch, aria-labels, English strings.
- vendor/three only contains three.module.min.js and OrbitControls.js — do not add other vendor files or CDNs. Write anything else yourself (e.g. marching cubes) in your own file.

## Files you may edit / create (ONLY these)
- `<slug>.html`, `js/<slug>.js`, and a new `js/<slug>-3d.js` if you want to keep the 3D code separate (load it lazily or as a normal script before js/<slug>.js — your choice, but three.js itself must stay lazy).
- Do NOT edit the physics core, tests, missions, lab.css, index.html, shared js, tools. Others work in parallel. Put suggestions in your report.
- Never rename DOM ids, slider ids, mission events/payloads, slug or URL. Missions keep working from the 2D/physics state regardless of view.

## 3D quality bar
- MeshStandardMaterial/MeshPhysicalMaterial, HemisphereLight + one shadow-casting DirectionalLight, soft ground shadow where meaningful, antialias, pixelRatio ≤ 2, OrbitControls with damping, camera auto-framing, colors from lab.css tokens (re-read on `lab:themechange`, light and dark both good).
- Labels in 3D: HTML overlay or sprite text with halo; English via LabSettings.t; simplified Chinese is automatic only for DOM/canvas2D text, so for sprite text run strings through the same canvas fillText (settings.js patches CanvasRenderingContext2D.fillText) — i.e. draw sprite labels with a 2D canvas.
- Performance: rebuild geometry only when parameters change; target smooth rotation on a mid-range tablet; stop rendering when hidden or in 2D; dispose geometries/materials/renderer on switch back.
- Physics honesty: geometry computed from the module's core functions (same units/scales as 2D). State in the page notes how the 3D view is computed.

## Verify (all required)
- `npm test`; `node tools/mission-proofs/<slug>.js` if present.
- `npm run check -- <slug>` (default 2D view) must pass all 4 combos.
- Write a Playwright script in your temp folder that: serves the repo (copy the server from tools/check-pages.cjs, and block all non-local requests with `ctx.route` — never touch the real Firebase), clicks #view3d, waits, screenshots light/dark at 1280 and 390 px, drags to rotate, changes a slider, switches back to 2D, and checks for page errors. Chromium headless supports WebGL via SwiftShader. LOOK at the screenshots and iterate on beauty.
- No git commit/push, no tools/stamp.py; scratch files in your system temp folder.

## Report (Traditional Chinese, ≤ 20 lines)
What the 3D view shows and how it is computed, controls, files, screenshots paths (in your temp folder), test/check results, open issues.

## Saving CPU (site owner, 2026-11-11)
Any Playwright script you write must launch Chromium with `const { launch } = require('G:/physics-lab/tools/browser.cjs'); const browser = await launch();` (same options as chromium.launch). It renders on the Intel iGPU — never the RTX 4070, which is reserved for video — at below-normal priority; plain chromium.launch() falls back to SwiftShader and burns CPU. Still block every non-local request. `npm run check`, `npm run shots`, `npm run verify` already use it.
