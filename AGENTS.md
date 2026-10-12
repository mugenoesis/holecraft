# AGENTS.md: instructions for AI coding sessions

Read this first, then `README.md`. The roadmap, architecture and decisions live in `PLAN.md`, which
is **local only: it is in `.gitignore` on purpose and must never be committed or pushed**. It sits in
the project's working folder on the user's machine (a backup copy is in `../tinkercad-notes/`).
Keep updating it as phases complete, but don't expect to find it in a fresh clone.

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
4. Run `npm run format` (Biome: formats, sorts imports, applies safe fixes) and `scripts/check.sh` before committing (`FULL=1` when packaging, Docker, or Electron
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

## Groups and holes
- A group's children live in its coordinate frame: a child's world transform is the group's
  transform times its own (`multiplyMat4`). Only top-level nodes are in `design.roots`; children
  are reachable through the group. New groups start with an identity transform, so grouping
  never moves anything, and ungrouping bakes the group's transform into the children.
- Ask where something is with `nodeBoundsIn(design, id)` (it looks inside groups), never by
  reading a group's own translation. Holes don't size a group unless it has no solids.
- A group is positioned by the middle of what it holds (see `moveSelection`), not its origin.
- `mode` (`solid` | `hole`) lives on shapes and groups. A hole keeps its colour, and a hole
  group turns its children into holes when ungrouped. A hole outside any group is only a ghost;
  holes cut when they share a group with solids (see Geometry below).
- `DesignScene` mirrors the document as nested `THREE.Group`s keyed by node id, reusing objects
  when shapes are grouped or ungrouped. Picking, selection and marquee all work on the
  **top-level** id, so hitting any shape in a group counts as hitting the group.
- An Objects-list row is a full click (`pick` down then click), so it narrows a multi-selection.
  The viewport sends the two phases separately so a multi-selection can still be dragged.

## Geometry (cutting holes)
- `packages/geometry` turns a group into one mesh with manifold-3d: union of its solids minus the
  union of its holes, recursing into nested groups. `evaluateGroup(M, design, groupId)` works in
  the **group's own frame** (the group's own transform is not applied), so moving a group never
  triggers a recompute. It is plain TypeScript over WASM and is unit-tested in Node against the
  real library, including volumes, so geometry bugs are caught without a browser.
- manifold objects live in WASM memory and must be `.delete()`d. `evaluateGroup` tracks every
  object it makes and frees them in a `finally`. Keep it that way: never let a manifold escape.
- `subtreeHash` is the cache key (shape-relevant data only: not names, colours, or the root
  group's own transform/mode). Bump `FORMAT` in `subtree.ts` if evaluation output changes.
- `GeometryService` (web) decides *when* to compute: cache by hash, one job at a time, only the
  first and latest state of a drag are computed, the previous shape stays on screen until the new
  one lands, failures are remembered (and not retried) so the group falls back to showing its raw
  shapes. It takes an injected `Evaluator`, so it is unit-tested with a fake one.
- The real evaluator is `geometry.worker.ts` via `workerEvaluator.ts`. The worker and the
  ~540 kB wasm (`manifold-3d/manifold.wasm?url`, served as `application/wasm`) load lazily, on the
  first group. Only **top-level solid groups** are evaluated (`rootSolidGroups`).
- `DesignScene.sync(design, results, failed)` swaps a covered group's shapes for its result mesh
  (creased normals: boxes stay crisp, curves smooth). Picking and marquee use the result mesh.
- Playwright tests prove cuts by **reading real pixels** from a top-down view (`pixelAt`): a cut
  shows the pale workplane (blue > 150) where uncut orange has blue < 120. Pixel offsets depend on
  the default zoom, so see the constants at the top of `csg.spec.ts` if the camera defaults change.
- Bundle changes that touch the worker must be checked in all three targets: `FULL=1
  scripts/check.sh` runs the web, Docker (wasm served and typed correctly) and desktop tests.

## Arrange (align and flip)
- `packages/core/src/arrange.ts`: `alignNodes(design, ids, axis, edge)` moves each top-level node along one axis so its low edge / centre /
  high edge meets the selection's (via `nodeBoundsIn`, so groups work); `flipNodes(design, ids, axis)` mirrors through a plane at the
  selection's centre. Both return the same object when nothing changes; `canAlign` / `canFlip` drive the buttons.
- Flip never stores a negative scale (transforms are rotation + position only). Every node's frame is also flipped about its local x,
  `L' = F_parent · L · FLIP_X` (root: the world reflection instead of `F_parent`), which is exact because every built-in shape is symmetric
  about its own x. **A shape that isn't x-symmetric, and imported models, can't use this**: `flipNodes` refuses imported models today.
  When a non-symmetric shape arrives (library, text), choose its flip axis per shape or mirror its mesh.
- UI is `ArrangePanel` (actions `align` / `flip`); no keyboard shortcuts yet (Tinkercad-style L and M are reserved for tools).

## Duplicate and repeat
- `EditorState.lastDuplicate = { sources, copies }` is set by every duplicate. When the selection is exactly those copies,
  `Ctrl+D` calls `repeatDuplicate` (core/repeat.ts): the step is `copy · source⁻¹` (rigid, so it includes the first offset) and each new
  copy gets `step · copy`; afterwards `sources` = the copies it was made from. Anything else selected, or a source that was deleted,
  falls back to the plain 10 mm offset. Size changes are deliberately not repeated.

## Hide and lock
- `hidden` / `locked` live on every node (core/visibility.ts: `setHidden`, `setLocked`, `showAll`, `hasHiddenNodes`). Every edit that
  must skip locked nodes uses `isEditable`; code that asks "where is it" goes through `nodeBoundsIn`, which returns null for hidden nodes,
  and `DesignScene` sets `visible = false` (picking and marquee ignore invisible objects). New edits must follow both rules.
- The reducer deselects what was just hidden (a hidden object must not stay movable); locking keeps the selection. The toggles are
  `RowToggle`s (`aria-pressed`, labelled just "Lock"/"Unlock" and "Hide"/"Show": a name in the label would make `getByRole("button", { name: /Group 1/ })` match three buttons per row) at the end of each Objects row.

## Ruler and surface picking
- `DesignScene.pickHit(raycaster)` gives the point, world-space face normal and top-level id of the nearest shown hit (flat triangle normals,
  so curved parts report per-facet normals). `Viewport.pickSurface(x, y)` adds the workplane (inside its edges) as a fallback. The
  workplane tool will reuse both.
- The ruler is `RulerOverlay` (React) listening on `viewport.element` next to the viewport's own handlers; `Viewport.setRuler(true)` stops
  the left button selecting/moving and makes empty-space drags orbit. The maths (`measureBetween`, `snapMeasuredPoint`, `nextRuler`,
  `formatLength`) is pure, in core/ruler.ts. Ruler state is React state only: it is never in the design or undo history.

## Workplane tool
- core/surfacePlane.ts: `WorkPlane = { origin, normal }`, `planeFrame(normal)` (rotation with local z = normal, local x horizontal, so a wall's
  shape has y up), `planeCoords/planePoint/snapOnPlane` (grid measured from the plane origin), `addShapeOnPlane` (reducer action `addOnPlane`;
  lifts a shape that would dip below z = 0; undersides refused via `isUsablePlane`). Like `add`, it leaves the selection alone.
- The plane is editor state in `Editor` (`plane`), never in the design or undo history. `Viewport.setPlaneMarker` draws it (planeMarker.ts, raycast
  disabled so tools aim through it, hidden in thumbnails). The Shapes panel and drag-drop (`shapeDropHandlers`) place on it when set.
- Surface tools (ruler, workplane) share `useSurfaceTool`: it calls `Viewport.setSurfaceTool(true)` (left button stops selecting/moving, drags orbit)
  and reports hover and click on `pickSurface`. `ViewportCanvas` holds the one active `SurfaceTool` and hides the resize/rotate handles meanwhile,
  because they sit over the canvas and would swallow the clicks. Not done: moving existing shapes on a tilted plane.

## Turning groups
- `setGroupRotation` (core/groupTransform.ts; `setNodeRotation`/`setNodeEuler` delegate to it for groups, so the `setRotation` and `setEuler`
  actions work unchanged) sets the group's orientation about a **stable pivot**: `groupLocalCentre`, the middle of the contents in the group's own
  frame, mapped through the group's transform. Turning never touches the children, and the pivot doesn't drift between turns (using the world
  bounds' middle would). `groupRings` gives the rings' centre, radius and orientation. The group's own transform is not part of `subtreeHash`,
  so turning a group never recomputes its CSG; export applies it via `evaluateNode` (covered by a test).
- **Resizing a group** (`setGroupGeometry`, reached through `setShapeGeometry` so the `setGeometry` drag action works unchanged): a group has no
  scale of its own, so the contents are stretched from their old local box to the new one (`groupGeometry` presents that box as a
  `ShapeGeometry`, so `HandlesOverlay` is reused). Each child's position is `factor * t + shift` in its parent's frame, and each shape's
  width/depth/height is scaled by the factor of the parent axis it lines up with (`axisMap`), recursing through nested groups. That is exact only
  when every inner node is turned in quarter turns and the group is upright, which `canResizeGroup` checks (otherwise no handles); a result
  outside 0.1..1000 mm for any shape is refused. `MAX_SHAPE_SIZE` now lives in `limits.ts` to avoid an import cycle with edit.ts.

## Chamfers (Stage A)
- `params.chamfer` (mm, as typed) and `params.chamferEdges` (`all` | `top` | `bottom`) on boxes and cylinders; no format change (validate
  already keeps extra numeric/string params). `chamferOf(node)` gives the **effective** chamfer, limited to 49% of the narrowest side (and of the
  height, or of twice it for one end) so faces never vanish; the typed value is kept, so shrinking and regrowing a shape loses nothing.
- `chamferedMesh` (core/chamfer.ts) builds the solid at its **real size** as a loft of horizontal rings (exact: every face planar, slices change
  linearly); coinciding outline points share an index so there are no degenerate triangles. The same mesh is drawn (`DesignScene` keeps one
  real-size geometry per chamfered shape, mesh scale 1, outline scaled instead) and fed to manifold as `Manifold.hull` (both shapes are convex).
- Tests derive volumes independently (cross-section integrals, polygon frustums), check watertightness, and read pixels from the front view.

## Edge treatments (chamfers and rounds on chosen edges, Stage B)
- Data: `node.edges?: EdgeTreatment[]` (`{ id, kind: 'chamfer' | 'round', size, points, normals }`) on groups and shapes, **in the node's own frame**
  (a group's contents frame, a shape's primitive frame: base centre at the origin, mm). Format version 3 (`MIGRATIONS[2]` is a no-op); validated in
  `parseTreatments` (unit normals, finite bounded points, unique ids, at most 1000 per node). The field is left out when empty.
- Finding edges: `sharpEdges(mesh)` (core/edges.ts) welds the mesh, keeps sides where two faces meet at more than 30 degrees **and** the solid is
  convex there, re-joins straight edges the mesh split (same two faces, collinear), and chains gently turning runs into one polyline (a cylinder's
  rim, closed). Concave edges are not offered (yet).
- Cutting: `treatmentCuts` (geometry/edgeCut.ts) gives, per segment, a triangular prism to subtract (chamfer: set back `size` along both faces;
  round: set back `r / tan(inside/2)`, minus a cylinder of radius `r` along the edge). The prism pokes 1 µm past the faces along the cut line so it
  never lands exactly on a face, without moving the chamfer plane. Polyline segments overlap by `size` at the joints.
- Applied in `Evaluation.treated` after a group's holes are cut (and to a shape's primitive before it is placed). **Before cutting, each treatment's
  edge must still be one of the solid's sharp edges** (`edgeIsPresent`: every segment within 0.01 mm of an edge between faces facing the same ways
  within 3 degrees); otherwise it is skipped and its id reported in `GroupMesh.skippedEdges`, never cut blindly.
- Edges are part of `subtreeHash` (FORMAT v2), so a treated group is never shown with an old result.
- **Loose shapes with treatments** are drawn from a computed mesh too: `rootComputedNodes` (was `rootSolidGroups`) lists top-level solid groups
  *and* top-level solid shapes with `edges`; `evaluateGroup` on a shape returns its treated primitive in its own frame (its hash ignores its
  transform); `DesignScene` hides the plain shape and shows the result beside it under the shape's transform.
- Edits: `setEdgeTreatments` / `removeEdgeTreatments` (core/edgeEdits.ts). Reducer: `previewEdges` runs between `moveStart` and `moveEnd` like a
  drag (one undo step on Apply), `cancelDrag` restores the design the drag began from, `removeEdges` is an ordinary edit.
- Skipped treatments: `skippedEdgeNotices` (pure) turns results' `skippedEdges` into notices; `SkippedEdgesNotice` shows them over the view with
  **Remove** (and says Undo brings the edge back). `e2e/web/edgeTreatments.spec.ts` writes treatments through the API and reads pixels.
- **The Edge tool** (`EdgeTool.tsx`, `E` / the **Edges** button; a `SurfaceTool` like the ruler). Rules are pure in core/edgeTool.ts: `edgeToolTarget`
  (one top-level, solid, unlocked shape or group, else a message), `treatEdges` (a chosen edge's old treatment is *replaced*, never doubled; treatments
  the tool can't see are kept), `clearEdges`, `treatedEdges`, `nextChosen`, `defaultEdgeSize` (5% of the smallest side, on the grid unless it is too
  coarse), `nearestEdge` (screen-space picking, 10 px reach). Chosen edges are indexes into the offered list, which resets when the shape changes.
- The offered edges come from the worker (`{ kind: 'edges' }` request, `toolEdges` in geometry): the node's solid **without its own treatments**, so a
  treated edge is still offered (to change or remove) and previewing doesn't change the list. `toolEdgesKey` (the subtree hash with the root's own
  edges left out) is the cache key in `useToolEdges`.
- Drawing: `EdgeTool` projects each segment and keeps it only if `Viewport.canSee` its middle (a raycast: nothing shown is in front of it), as
  `<g data-testid="edge-line" data-from data-to class="plain|hover|chosen|treated">` in an SVG over the canvas; tests find an edge by its world ends.
  Clicks come through `useSurfaceTool`'s `onHoverAt` / `onClickAt` (view pixels; `add` is Shift or any touch). Hover clears on `pointerleave`.
- The preview is a drag: the first choice dispatches `moveStart`, every change `previewEdges` built from the treatments as they were before the
  preview (`base`), Apply `moveEnd`, Cancel / clearing the choice / closing the tool `cancelDrag`. Remove is `moveStart` + `previewEdges` + `moveEnd`.
  With nothing usable selected the tool only shows a hint and does **not** take over the left button, so the view still selects.

## Rotation
- Orientation lives in each node's `transform` (column-major 4x4 = rotation + base-centre
  position). Sizes stay as local params, so a mesh is just position, quaternion and scale.
- Maths is in `packages/core/src/rotation.ts` and `ring.ts`. Euler angles (degrees) are X, then
  Y, then Z about the **world** axes (R = Rz·Ry·Rx) and exist only for the typed fields; ring
  drags work on matrices (`rotateAboutWorldAxis`) so they never hit gimbal problems.
- Rotation always pivots about the shape's **centre** (`setNodeRotation`), which means a tipped
  shape's base point (the X/Y/Z fields) moves. Use `shapeBounds` / `nodeBounds`, never raw
  translation + size, to ask where a shape actually is.
- Resize and lift handles only exist while `isUpright` (turned about Z only). Their maths is the
  `*Yawed` variants in `resize.ts`.
- Ring drags use `Viewport.pickPlane` and ignore moves where the ring plane is edge-on.

## Input fields
- Properties fields edit a local draft and commit on Enter/blur (`useDraft`). After a commit,
  re-read the document value from an effect that runs *after* the dispatch rendered. Never
  `setDraft(oldValue)` straight away: a blur in that gap commits the stale value and silently
  undoes the edit. The "edits typed in quick succession" e2e test guards this.
- A test that passes alone but fails in a group is a real race, not noise. Reproduce it in a loop
  before touching anything.

## Saving and the designs list
- The app opens on a **designs list** (`/`); a design lives at `/design/<32 hex id>`. Every e2e test
  starts with `newDesign(page)` from `e2e/web/helpers.ts`, never `page.goto('/')` alone. The e2e server
  starts from an empty data folder each run, but is shared by all tests, so tests find their own designs
  by `uniqueName(...)` and must not assume the list is empty (use `page.route` to fake an empty list).
- Designs are one JSON file each in `<data>/designs/<id>.json`, written atomically (temp file + rename)
  and queued per design (`apps/server/src/designs.ts`). Ids are 32 lower-case hex digits and are the
  **only** thing that becomes a file name: keep `isValidDesignId` in front of every file access.
- **Never trust a design that comes from outside.** `parseDesign` in core validates and cleans every
  design read from disk or sent by a client (shape, limits, a proper node tree, unknown fields dropped).
  The server also sets `updatedAt` and keeps the stored `createdAt`. When the format changes, bump
  `DESIGN_FORMAT_VERSION` and add a migration in `validate.ts`.
- Autosave is `SaveController` (web): debounce, one save in flight, retry with backoff, permanent
  failures (404, 4xx) are not retried. It is injected with the save function and tested with fake timers.
  The editor flushes pending changes when you leave the page for the list, and sends them with
  `keepalive` on `pagehide`. Undo history is deliberately not persisted.
- The design name is part of the design and renaming it is an undoable edit (`renameDesign`).

## Export
- Export = `collectBodies` (geometry package): each visible, solid, top-level shape or group becomes
  one `ExportBody` (name, colour, world-space mesh) via `evaluateNode`, which places the node's own
  transform (unlike `evaluateGroup`, which stays in the group's frame for the live preview).
- The writers (`formats/stl.ts`, `obj.ts`, `threemf.ts`, `zip.ts`) are pure, dependency-free and
  tested without manifold. 3MF is a hand-written *stored* zip (no compression library); `readStoredZip`
  checks every CRC. Millimetres, Z up, counter-clockwise from outside, everywhere.
- Export runs in its own short-lived worker (`exportInWorker.ts`), not the live preview worker.
  `runExport` takes injected dependencies so it is unit-tested without a browser.
- Test the *files*, not just the code: `e2e/web/meshFiles.ts` has deliberately independent STL/OBJ/3MF
  readers, and `scripts/verify-exports.sh` loads real output in trimesh (watertight, winding, volume).
  Run it whenever the writers change.
- Desktop: exports are normal downloads, so Electron asks where to save. `HOLECRAFT_DOWNLOAD_DIR`
  skips the dialog and saves into a folder, which is how the desktop e2e test works.

## Palette and OrcaSlicer export
- `design.palette` (1 to 16 `#rrggbb`, `DEFAULT_PALETTE` = the four default shape colours) is saved with the design
  (format version 2; `MIGRATIONS[1]` adds the default palette to older files). Slot n is filament n.
  Shapes keep a plain hex `color`; a shape is "in a slot" when its colour equals the slot's. `setPaletteColor`
  recolours every node with the old colour in the same undo step. `paletteSlotOf(palette, color)` (exact, else
  nearest RGB, numbered from 1) is what export uses. Don't give nodes a slot index without a migration plan.
- "3MF for OrcaSlicer" = `write3mf(bodies, { filaments: design.palette })`: the normal 3MF plus
  `Metadata/model_settings.config` (per object `name` + `extruder`, one plate) and
  `Metadata/project_settings.config` (JSON, filaments only).
- **The engine crashes (segfault) if `filament_colour` has N entries and any per-filament setting has fewer.**
  `orcaFilamentDefaults.ts` is GENERATED from the real engine by `scripts/update-orca-filament-defaults.sh`
  (150 settings; each is repeated N times at export). Never hand-edit it, never write a partial settings
  file, and never add printer/process keys (that would overwrite the user's profile on open).
- Prove changes with `scripts/verify-orca-export.sh` (needs the local `mugenoesis/trident` image; runs
  `docker run --rm` containers only): Trident's reader AND the real engine must load 4- and 16-colour files and
  keep the filaments. The engine re-arranges objects on re-export, so only filaments/colours are compared there.
  Container commands with a shell entrypoint must live in a script file (the sandbox refuses them inline).

## Thumbnails
- The designs list shows a PNG per design. The **editor** makes it: `Viewport.snapshot()` draws the scene
  with a second, throwaway `WebGLRenderer` (so the visible view is untouched), workplane hidden and no
  selection (`DesignScene.withoutSelection`), framed by `thumbnailCamera` (fits the real corners, 90%).
- When: `ThumbnailScheduler` (pure, fake-timer tested) waits until the design is **saved**, its groups are
  worked out and every imported model has arrived, then 2 s of quiet; one picture per design version, never
  two at once, a version changed mid-upload is picked up afterwards. Opening an old design backfills its picture.
- Server: `PUT/GET /api/designs/:id/thumbnail` (`thumbnails.ts`; PNG only, signature + IHDR size <= 512 +
  IEND checked, <= 256 KB), files in `<data>/thumbnails/<id>.png`. `GET /api/designs` adds `thumbnailAt`
  (file mtime) and the card uses `/thumbnail?v=<thumbnailAt>`, so each picture has its own cacheable address.
  Duplicate copies the picture, delete removes it. Pictures are derived data: safe to delete.
- Cards: the picture is an `aria-hidden`, `tabIndex=-1` link (the name stays the one real link, which
  tests and screen readers rely on).

## Imported models
- An import is an **ordinary shape** with `shapeType: 'mesh'` (`MESH_SHAPE_TYPE`) and `params.mesh` = a
  stored-mesh reference (SHA-256 of the bytes, 64 hex, `isMeshRef`). Bounds, move, resize, rotate,
  duplicate, hole/group and the Properties panel therefore work unchanged. Anything that looks up
  `getShapeDef(shapeType)` must special-case it (that bug already happened once, in `duplicateNodes`).
  `MeshNode` (`kind: 'mesh'`) in design.ts is an unused leftover; don't build on it.
- The stored mesh is **normalised into the unit box** every shape is built in (x, y in ±0.5, z 0..1;
  `normalizeMesh`, which also flips inside-out triangles), and the shape's width/depth/height scale it.
  `originalWidth/Depth/Height` params remember the real size (nothing uses them yet).
- Readers live in `packages/geometry/src/import/` (STL binary+text, OBJ, 3MF; `importMeshFile`).
  Compressed zips use the platform `DecompressionStream('deflate-raw')`, so no zip library. The format
  on disk/wire is `encodeMesh`/`decodeMesh` in core. Corners are welded; degenerate triangles dropped.
- Server: `POST /api/meshes` (raw bytes, validated with `decodeMesh`, answers `{ref}`) and
  `GET /api/meshes/:ref` (immutable). Files are `<data>/meshes/<ref>.mesh`, never deleted (no garbage
  collection yet). `parseDesign` rejects an imported shape without a valid ref.
- Web: `MeshStore` downloads and caches models by ref (table replaced on change); `useMeshes` feeds it
  from the design. `GeometryService.update(design, meshes)` waits until every model in a group has
  arrived and passes the worker only the ones it needs; `DesignScene.sync(..., meshes)` draws a plain
  box until a model arrives. Export gets the same table (`exportDeps(meshes)`).
- CSG: `imported()` in evaluate.ts builds a manifold with `Manifold.ofMesh`; a mesh that is not
  watertight throws a message naming the shape, which the group fallback and the export alert show.
- Parsing, normalising and uploading run on the main thread (fine to a few hundred thousand triangles).
- Test fixtures for e2e are built by `e2e/web/modelFiles.ts`, independently of the app's readers.

## Local test container
- After the user merges a phase, run `scripts/deploy-local.sh` so they can try it by hand: it
  rebuilds from `origin/main` and restarts the `holecraft` container on port 8200, keeping the
  `holecraft-data` volume. Never touch other containers (ports 8080, 8090 and 8765 on this server
  belong to other things).

## Handles
- Resize and lift handles are **DOM buttons** over the canvas (`HandlesOverlay`), positioned
  with `Viewport.project`, not three.js objects. That keeps them a constant size, keyboard- and
  screen-reader-reachable, and easy to drive from tests (`data-testid="handle-<id>"`).
- The maths is pure and lives in `packages/core/src/resize.ts` (`dragHandle`, `handlePosition`).
  A handle drag runs through the same `moveStart` / `setGeometry` / `moveEnd` reducer flow as a
  move, so it is a single undo step.
- Heights are read from the pointer on a vertical plane facing the camera
  (`Viewport.pickHeight`). Looking straight down there is no usable plane, so lifting does nothing.

## Layout on small screens
- One breakpoint: `@media (max-width: 720px)` is the phone layout (top bar wraps, view on top, panels in a
  `32dvh` strip below, shape tiles in one swipeable row). `@media (pointer: coarse)` makes touch targets
  at least 40px and the handles 26px; keep both blocks at the **end** of styles.css so they win ties, and
  remember rules like `.handle.height` / `.handle.lift` are more specific than `.handle`.
- Menus and messages in the top bar (`.menu`, `.export-problem`) are `position: static` parents on a phone
  so they span the bar's width (`left/right: 10px`); don't give their containers `position: relative` there.
- `e2e/web/phone.spec.ts` measures real positions at 412x915 with touch (`isMobile`); add a check there when
  adding anything to the top bar. Look at a screenshot too (`scripts/screenshot.sh <url> out.png 412 915`).

## Squarer screens (4:3, tablets)
- `homeViewFor(aspect)` (core/camera.ts) backs the home camera off by 1.6 / aspect on windows squarer than 1.6 so the whole workplane
  shows; `CameraRig` uses it for the opening view (until anyone moves the camera) and for `goHome()`. Don't use `HOME_VIEW` directly for
  a live camera.
- The top bar wraps (`flex-wrap`) instead of overflowing; the side panel order is Shapes, Properties, Arrange, Colours, Objects so Properties
  is on screen without scrolling at 1024x768. `e2e/web/fourThree.spec.ts` measures this at 1024x768 and 800x600.

## Touch
- `Viewport` treats `pointerType === 'touch'` separately: one finger = the left-button behaviour, except
  that dragging empty space orbits (no marquee); a second finger abandons the one-finger action
  (keeping any move already made) and starts a pan + pinch (`twoFingerStep` in `touchGesture.ts`, pure
  and unit-tested). The canvas has `touch-action: none` so the browser doesn't scroll or zoom the page.
- Touch e2e (`e2e/web/touch.spec.ts`) needs `test.use({ hasTouch: true })` and sends real touches over
  CDP (`Input.dispatchTouchEvent`); without `hasTouch` Chrome silently drops them and tests pass vacuously.
  A selected shape has rotation handles at its centre that catch touches, so drag unselected shapes.
- The rest of the UI is not yet laid out for phone-sized screens.

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

## Formatting, linting and complexity (Biome)
- **Biome** (`biome.json`) does formatting and linting: **tabs, 140 columns, single quotes** (double in JSX),
  sorted imports. `npm run format` fixes what it can; `npm run lint` (= `biome check`) is the first step of
  `scripts/check.sh`, so CI fails on any finding. `.editorconfig` tells editors the same basics.
- **Cognitive complexity is capped at 15 per function and is an ERROR** (`noExcessiveCognitiveComplexity`).
  Don't raise the limit or suppress it: split the function. What worked here: a flat `switch` reducer became four
  small reducers grouped by purpose; a long closure became a class with one method per job; a fat component
  gave its hooks (`useAutosave`, `useEditorShortcuts`, `useViewKeys`) and sub-components (`TopBar`,
  `ViewToolbar`) their own files; branching on a key became a lookup table (`shortcutAction`). Pure logic that
  falls out (`shortcutAction`, `nudgeForKey`) gets its own unit tests.
- Two rules are off on purpose: `noNonNullAssertion` (strict `noUncheckedIndexedAccess` makes `!` after a
  checked lookup idiomatic) and `useSemanticElements` (tests and screen readers rely on the existing
  `role="group"`/`toolbar` markup). `noDescendingSpecificity` is off for CSS (a later, more specific rule such as
  `.handle.height` refining `.handle` is deliberate).
- A suppression needs a reason next to it: `// biome-ignore lint/...: why`. Extra hook dependencies used as
  re-run triggers (`attempt`, `settled`, `resultVersion`) are the existing examples.
- `orcaFilamentDefaults.ts` is generated and excluded. The big reformat commit is listed in
  `.git-blame-ignore-revs` so `git blame` skips it.

## Other correctness checks
- **TypeScript** also has `noUnusedLocals/Parameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` and
  `exactOptionalPropertyTypes` (an optional property can't be given an explicit `undefined`: widen the type with
  `| undefined` where passing "maybe nothing" through is the point, or omit the key). `tsconfig.tools.json` makes
  `npm run typecheck` cover `e2e/` and `scripts/lib/` too.
- **knip** (`npm run knip`, in the gate) fails on unused files, exports and dependencies, and on a package imported
  without being listed in its own package.json (the web app once relied on `manifold-3d` being hoisted from `geometry`).
- **Coverage floors** (`npm run coverage`, in the gate) are per package in `vitest.config.ts`, set just under the
  current numbers. Raise a floor when the real number rises; never lower one to make a change pass: add tests. The web
  app's floor is low only because its React/WebGL code is covered by `e2e/`, which doesn't count there.
- **Dependencies**: `scripts/audit.sh` (CI `audit` job) fails on a vulnerability in anything that ships and only reports
  build-tool ones (the 8 moderate `electron-builder` ones). Dependabot opens weekly PRs; `@playwright/test`, `electron`
  and `@biomejs/biome` are excluded because they are pinned in step with other things (see `.github/dependabot.yml`).
- **Docker**: `scripts/docker-lint.sh [image]` runs hadolint on the Dockerfile and trivy on its config and the built image
  (HIGH/CRITICAL with a fix fail it; CI runs it after the smoke test). The runtime stage applies `apt-get upgrade` and removes
  npm/corepack/yarn on purpose; if trivy reports a new Debian or npm finding, rebuild (the upgrade picks up fixes) or bump the base image.

## Property-based tests (fast-check)
- `packages/core/src/properties.test.ts`, `packages/geometry/src/properties.test.ts` and `apps/server/src/properties.test.ts` state
  rules that must hold for *every* input and let fast-check try hundreds (and shrink a failure to a small counterexample): designs
  survive save/load unchanged; `parseDesign` refuses junk with a `DesignValidationError` and nothing else; the file readers (STL, OBJ,
  3MF, zip, stored meshes) get random bytes and corrupted real files and may only return a valid mesh or throw their own message;
  export file names are safe everywhere; the API never answers 500 and never writes outside its folders; the real CSG engine's
  volumes obey union/hole laws.
- A failure means a real counterexample: fix the code (add a deterministic regression test for it next to the property), or, if the
  rule was wrong, fix the rule. Seeds are random each run, so re-run a few times after changing something.
- **Check a new property can fail**: temporarily break the code it guards and see it go red (a "mutation check"). This exposed a fuzz
  test that never produced a too-large shape; random JSON rarely hits boundary values, so the generators mix in nasty ones (`nastyValue`).
- Bugs these found: Windows device names with an extension (`con.txt` -> `con-design.txt.stl`), and coordinates that are finite
  doubles but overflow to infinity as 32-bit floats (`fitsFloat32`, guarded again in `weldMesh`).

## Code conventions
- Strict TypeScript (`noUncheckedIndexedAccess`). Import with `.ts` extensions.
- `packages/core` must stay free of DOM, three.js, and Node APIs, so it can be pure and unit-tested.
- Units: always store millimetres. Convert only for display and input (`mmToUnits`/`unitsToMm`).
- Scene is Z-up, in mm.
- Match the surrounding code's style and comment density. Comments explain *why*.

## Git
- Work on a branch, and commit with clear messages. Don't push to `main` directly.
