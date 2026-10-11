# AGENTS.md: instructions for AI coding sessions

Read this first, then `PLAN.md` (roadmap, architecture, and decisions) and `README.md`.

## What this project is

Holecraft is an **open-source (AGPL-3.0), offline, Tinkercad-inspired 3D modeler**. It is
*inspired by* Tinkercad's workflow and is **not a clone**:
- Never copy Tinkercad's name, logo, icons, artwork, color scheme, text, or code.
- Never fetch assets from tinkercad.com.
- Design our own UI and interaction specs. Tinkercad is a reference only for which
  capabilities to offer.

Ships as a Docker web service and a Linux Electron app built from one codebase.

## Decisions already made (don't relitigate without the user)
- Name: Holecraft (repo and package id: `holecraft`). Renamed from "ezcad", which clashes with the EZCAD laser-marking software. License: AGPL-3.0-only.
- Docker auth: none in v1.
- Desktop: Electron (not Tauri).
- v1 scope: the 3D design editor only. Codeblocks, Sim Lab, and Circuits are deferred.
- npm workspaces (not pnpm). TypeScript everywhere. The viewport is imperative three.js, and
  React handles only the chrome around it. CSG will use manifold-3d (WASM) in a Web Worker.

## Workflow rules (from the user)

1. **Test-driven development.** For every feature or bug fix:
   1. Write or extend a failing test first (unit, and integration where possible).
   2. Run it and confirm it fails for the expected reason.
   3. Implement until it passes, then refactor.
   Unit tests go next to the code (`*.test.ts`, Vitest). Integration tests go in `e2e/`
   (Playwright: `e2e/web/` for browser flows, `e2e/desktop/` for the packaged Electron app).
   Server routes are tested with Fastify `inject` in `apps/server/src/*.test.ts`.
2. **Save repeatable tasks as scripts** in `scripts/`. If you run a multi-step command more than
   once (build, package, smoke test, screenshot, data migration...), turn it into
   `scripts/<name>.sh` (or `scripts/lib/*.mjs` for Node helpers). Add a usage header and list it
   in the README's Scripts table.
3. **Keep docs current.** Update `README.md` when user-facing behavior, setup, or scripts
   change. Update this file when conventions change. Update `PLAN.md` when a phase completes
   or a decision changes.
4. Run `scripts/check.sh` before committing (`FULL=1` when packaging, Docker, or Electron
   code changed).

## Commands

```bash
npm install
npm run dev                       # server :8080 + Vite :5173
npm test                          # Vitest unit tests
npm run typecheck
scripts/e2e.sh [--project web|desktop] [-g "name"]   # Playwright in Docker
scripts/check.sh                  # gate; FULL=1 for docker + desktop
scripts/screenshot.sh http://127.0.0.1:8080/ test-results/shot.png   # visual check
```

## Environment gotchas
- The dev host (Unraid) lacks GUI libraries and `ar`. **Don't run Electron or Playwright
  browsers on the host.** Use the scripts, which run them in Docker
  (`mcr.microsoft.com/playwright:v<version>-noble`, `node:22-bookworm`).
- `@playwright/test` is pinned to an exact version that must match the Docker image tag. Bump
  both together. `electron` must also be an exact version (electron-builder requires it).
- There is no GPU in containers. Tests pass `--use-angle=swiftshader --enable-unsafe-swiftshader`
  for software WebGL.
- The Docker build is usually reached over plain http on a LAN IP, which is **not a secure
  context**. `crypto.randomUUID`, clipboard, and similar APIs are unavailable, so use
  `newId()` from `@holecraft/core`. The "keeps working without X" tests guard against this.
- The web app is built with absolute asset paths (`base: '/'`) so deep links work. Use
  root-relative URLs (`/api/...`).
- The server and the Electron main process are **bundled with esbuild** (`build.mjs`), so
  runtime images and packages carry no node_modules. Avoid native Node modules. When SQLite
  arrives, prefer the built-in `node:sqlite`.
- Workspace packages export TypeScript source directly (`"exports": "./src/index.ts"`). Vite,
  esbuild, tsx, and Vitest consume it, and there is no per-package build step.

## Editor state
- All editing goes through `editorReducer` (`apps/web/src/editorState.ts`): design history,
  selection and the in-flight drag live there, and it is unit-tested without a browser. UI code
  dispatches actions; it never edits a Design directly.
- Pure design edits live in `packages/core/src/edit.ts`. Each returns the **same object** when
  nothing changed, and the reducer relies on that to skip empty undo steps.
- Live previews (dragging) use `replacePresent`; the release commits one step with
  `pushHistory(h, present, base)`.
- The `Viewport` class outlives renders and reads handlers through a ref in `ViewportCanvas`.
- Shortcuts: viewport ones (Home, F, arrows) in `ViewportCanvas`, editing ones (Ctrl+Z/D/A,
  Delete, Esc) in `App`. Both skip typing targets via `isTypingTarget` in `keyboard.ts`.

## Input fields
- Properties fields edit a local draft and commit on Enter/blur (`useDraft`). After a commit,
  re-read the document value from an effect that runs *after* the dispatch rendered. Never
  `setDraft(oldValue)` straight away: a blur in that gap commits the stale value and silently
  undoes the edit. The "edits typed in quick succession" e2e test guards this.
- A test that passes alone but fails in a group is a real race, not noise. Reproduce it in a loop
  before touching anything.

## Handles
- Resize and lift handles are **DOM buttons** over the canvas (`HandlesOverlay`), positioned
  with `Viewport.project`, not three.js objects. That keeps them a constant size, keyboard- and
  screen-reader-reachable, and easy to drive from tests (`data-testid="handle-<id>"`).
- The maths is pure and lives in `packages/core/src/resize.ts` (`dragHandle`, `handlePosition`).
  A handle drag runs through the same `moveStart` / `setGeometry` / `moveEnd` reducer flow as a
  move, so it is a single undo step.
- Heights are read from the pointer on a vertical plane facing the camera
  (`Viewport.pickHeight`). Looking straight down there is no usable plane, so lifting does nothing.

## Testing the viewport
- Put maths in `packages/core` (camera, picking, snapping, shape ops) and unit-test it there.
  three.js classes that need no WebGL (`CameraRig`, `DesignScene`) are unit-tested under
  `apps/web/src/viewport/` in plain Vitest.
- E2E tests read camera state from `data-*` attributes on `[data-testid=viewport]`
  (`data-azimuth`, `data-polar`, `data-distance`, `data-target`, `data-projection`) and the
  document from the Objects list and status bar. Keep those stable, or update the tests with them.
- The camera eases to new views, so e2e tests must `expect.poll` until it arrives rather than
  read the camera right after a click.
- Native HTML5 drag-and-drop (shapes panel → viewport) works with Playwright's `dragTo`.
- Only the view-cube faces the camera can see are clickable. Tests reach the other sides through
  the "Standard views" menu.
- After visual changes (especially CSS 3D like the view cube), check a real screenshot:
  `DEMO=1 scripts/screenshot.sh <url>`. Passing tests don't prove it looks right.

## Code conventions
- Strict TypeScript (`noUncheckedIndexedAccess`). Import with `.ts` extensions.
- `packages/core` must stay free of DOM, three.js, and Node APIs, so it can be pure and unit-tested.
- Units: always store millimetres. Convert only for display and input (`mmToUnits`/`unitsToMm`).
- Scene is Z-up, in mm.
- Match the surrounding code's style and comment density. Comments explain *why*.

## Git
- Work on a branch, and commit with clear messages. Don't push to `main` directly.
