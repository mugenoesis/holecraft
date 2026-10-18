# AGENTS.md: instructions for AI coding sessions

Read this first, then `README.md`. The roadmap, architecture and decisions live in `PLAN.md`, which
is **local only: it is in `.gitignore` on purpose and must never be committed or pushed**. It sits in
the project's working folder on the user's machine (a backup copy is in `../tinkercad-notes/`).
Keep updating it as phases complete, but don't expect to find it in a fresh clone.

## What this project is

Holecraft is an **open-source (AGPL-3.0), offline, easy-to-use 3D modeler**. It has its own
code, name and design:
- Never copy another product's name, logo, icons, artwork, color scheme, text, or code.
- Never fetch assets from other products' sites.
- Design our own UI and interaction specs.

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

5. **Git hooks stand in for CI while GitHub Actions is unavailable.** Run `scripts/install-hooks.sh` once per
   clone: `pre-commit` runs lint, knip, typecheck and unit tests; `pre-push` runs `scripts/check.sh` (`FULL=1` adds the
   Docker and desktop jobs, `AUDIT=1` adds `scripts/audit.sh`). Don't bypass with `--no-verify` unless told to.

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
  first group. Only **top-level groups** are evaluated (`rootComputedNodes`), **hole groups too**: a group turned into a hole is drawn as one ghost of its finished
  shape (the same shape the cut uses), not as a ghost of every shape inside it; `showResult` applies the hole look (`applyLook`) to the computed mesh.
- `DesignScene.sync(design, results, failed)` swaps a covered group's shapes for its result mesh
  (creased normals: boxes stay crisp, curves smooth). Picking and marquee use the result mesh.
- Playwright tests prove cuts by **reading real pixels** from a top-down view (`pixelAt`): a cut
  shows the pale workplane (blue > 150) where uncut orange has blue < 120. Pixel offsets depend on
  the default zoom, so see the constants at the top of `csg.spec.ts` if the camera defaults change.
- Bundle changes that touch the worker must be checked in all three targets: `FULL=1
  scripts/check.sh` runs the web, Docker (wasm served and typed correctly) and desktop tests.

## Basic shapes (cone, pyramid, wedge, roof, round roof, half sphere)
- `ShapeType` / `SHAPE_DEFS` (core/shapes.ts) list them; `unitSolidMesh(type)` (core/solidShapes.ts) is each one's mesh in the unit box (x, y within
  ±0.5, z 0..1; closed, facing outwards, built by `revolve` and `extrude` then turned to face outwards if need be). One mesh serves everything: the scene draws it
  (`createUnitGeometry`, creased normals) and CSG builds it with `Manifold.ofMesh(...).scale(size)`. Box, cylinder and sphere keep their own builders, and
  the shapes panel test checks every other type has a mesh. **Every one is the same seen left to right (x-symmetric), which `flipNodes` depends on**: keep that when
  adding shapes, or give the shape its own flip rule. Tests derive volumes from the shapes' dimensions, not the code, and exports are checked in the browser.
- **Shapes with settings of their own (the parametric system)**: a `ShapeDef` may declare `params: ParamDef[]` (`key`, `label`, `default`, `min`, `max`, and `mmPerUnit(size)`).
  Tube (`wall`), Torus (`thickness`), Star (`inner`, the inner corners' radius as a share of the half-width) and Polygon (`sides`, a count) so far. **The blueprint: a shape is generated, then simply scaled when you drag its handles, so the whole thing,
  setting included, stretches evenly.** So a setting is kept in `node.params` as a **share of the shape** (0.3 = 30% of the narrower radius; no format change, validate keeps extra
  numeric params), never as a fixed mm. The Properties field shows and takes **mm for the shape as it is now** (`shapeParamMm`, `typedParamMm`, `setShapeParam` converts mm to a share),
  so resizing a tube from 20 to 40 mm makes its wall 3 then 6 mm and the field follows. What was typed is kept and limited to `[min, max]` only when read (`shapeParam`), so shrinking a
  shape and growing it back loses nothing; `setShapeParam` refuses locked shapes, unknown settings and values not above 0. Because the shape is an affine stretch of its own outline,
  **group resize, typing a size and edge-treatment stretching (`stretchTreatments`) are all exact for it: nothing breaks once it is made** (tested: chamfers on a tube survive a
  resize and remove the same material as chamfering the resized tube directly). It is built by `parametricShape(node)` (core/parametricShapes.ts: `tube` and `torus` builders,
  `PARAMETRIC_TYPES`); CSG uses `Manifold.ofMesh` with no scale and `DesignScene.realSizeMesh` keys its geometry on the size and the effective settings. `ShapeParamFields` makes a
  Properties field per declared setting (with a `param-limited` hint) and `setShapeParam` is one undo step. **To add a shape with settings**: add the def (with `params`), a builder in
  `BUILDERS` that is an affine function of width/depth/height, a tile icon in styles.css; keep it x-symmetric for Flip. Do not make a setting a fixed mm that does not scale with the size.
- Raycasts in scene tests must use `intersectObject(mesh, false)`: the selection outline is a child made of lines, and a recursive ray hits it.
- **Threads (`threaded-rod`, `threaded-hole`)** are the one parametric kind that does *not* stretch: `ShapeDef.fixedFootprint`. Width and depth come from the `size` (a choice: `ParamDef.choices`, stored as the value, M5 = 5) and, for the hole, `fit` (1 Tight, 2 Normal, 3 Loose = 0.1/0.2/0.4 mm on every side), see `threadStandards.ts`; `setShapeParam` keeps `params.width/depth` in step, `setShapeSize`/`setShapeGeometry` put them back if anything else changes them (`lockFootprint` in edit.ts), `canResizeGroup` refuses a group holding one, Properties disables Width and Depth and calls Height Length, and `HandlesOverlay` shows only the height and lift handles (`lengthOnly`). The mesh is built by `thread()` in parametricShapes.ts at its real length: 48 facets round, a row per 48th of a pitch up, joined along the helix so the ISO profile (crest 1/8, flank 5/16, root 1/4, flank 5/16 of the pitch; depth 5/8 of the sharp-V height) lands exactly on rows; right-handed (the crest climbs as it turns anticlockwise). A hole's cutter is the same thread opened out radially by the fit, so a screw of the same size sits wholly inside it (tested in the CSG engine). Thread meshes are big (about 260k triangles for an M12 100 mm long). `bolt` and `nut` are the same system: a bolt has `size` and `head` (1 Hex, 2 Socket cap), a nut `size` and `fit`; the footprint is the head's (hex: across corners by across flats, corners on the x axis, so the same left to right) or the cap's diameter. **A bolt's Length (the Properties field) is its shank**: `lengthOffset` (the head's height) is added to get `params.height`, so a head or size change keeps the shank (`followSettings`), and a bolt is at least a head and a pitch tall (`minThreadHeight`, enforced by `lockFootprint`). A nut's height is its standard thickness, reset when its size changes, and can be edited. All four meshes are made by `threadMesh.ts` from rings of 48 points joined by bands (`Mesh.band` faces the way tangent x (q - p) points; a thread going down uses the other diagonal to stay on the helix). The bolt stands with its tip on z = 0 and its head on top; the nut's thread starts at z = 0 like the bolt's, so a nut moved up by a whole number of pitches meshes with it (tested in the CSG engine for every head and fit). **Simple threads** (`withSimpleThreads(design)` in parametricShapes.ts): the view toolbar's switch (`useSimpleThreads`, kept in localStorage, not in the design) draws a thread as a cylinder at the pitch diameter by marking each threaded shape `params.simple = 1`; `ViewportCanvas` feeds that marked copy (`drawn`) to the scene and the GeometryService, while selection, handles, autosave, thumbnails' bookkeeping and **every export use the real design**. `DesignScene`'s geometry key includes `params.simple` (a test fails without it), and `subtreeHash` sees it as an ordinary param, so cached group results are not mixed up. Measured on the dev machine: an M12 x 100 thread is 263k triangles, 38 ms to build, ~95 ms to draw, ~0.5 s in a group's CSG; slow devices are several times that, which is what the switch is for. `washer` (Size only; `washerInner/Outer/Thickness` in the size table, a flat ring, no thread so `hasThread` is false and the Simple threads switch ignores it) and `standoff` (Size, Ends = `type` 1 female-female / 2 male-female, Fit) are the same system. A standoff's Length is its body (`lengthOffset` is the male stud, `2 x diameter`, so the height is both); `minThreadHeight` keeps a female one at least a nut thick and a male one at least 2 x diameter of body; `followSettings` also raises a too-short height. A male standoff's blind thread is built with `threadRings(..., zOffset)` so its thread starts at its floor, `body - diameter` deep (a screw lowered from there by whole pitches mates, tested). **Inch sizes** (`IMPERIAL_SIZES`, unified coarse #4-40 to 1/2-13): `ThreadSize` has an `id` (a metric size's id is its diameter, so saved designs read as before; inch sizes are 101 to 108), a `label` and a `group` that the Size dropdown groups by (`choiceGroups`, `<optgroup>`); `ALL_THREAD_SIZES` is what `threadSize(id)` and the choices use. The thread profile is the same 60 degrees (so the same builder), with a pitch of 25.4 / TPI. A hex bolt head has its own `headFlats` (equal to the nut's `flats` for metric, narrower for small inch sizes). Dimensions are nominal values from ASME B18.2.2 / B18.6.3 (nuts), B18.6.3 hex machine screws (numbered heads), B18.2.1 hex cap screws (1/4 and up), B18.3 socket caps and B18.21.1 type B narrow washers, copied from public tables (checked against several): treat them as nominal and check the standard for anything that must be exact. **Still to do for 6b:** UNF (fine) and metric fine pitches.
- Hexagon is a plain stretched solid too (corners at (±0.5, 0) and (±0.25, ±0.5), so regular at 20 × 17.32).
- A setting can be a **count** (`ParamDef.count`, the polygon's `sides`): kept as a whole number (rounded when read and set, limited to `[min, max]`), it does not change with the size and its field shows it as it is (`mmPerUnit` is 1). `prism()` in parametricShapes.ts stretches any outline (star, polygon) to fill its box.

## Paint (colour painting for multi-material printing)
- Modelled on OrcaSlicer's colour painting gizmo (`GLGizmoMmuSegmentation`): filaments, Smart fill (angle), Bucket fill, Shift to erase, Erase all, number keys, Ctrl+wheel for the angle. Height range and gap fill are built (below); touch painting for the brush is not.
- Data: `node.paint?: PaintFill[]` on a **top-level** shape or group (format version 4, `MIGRATIONS[3]` is a no-op; `parsePaint` in validate.ts). A fill is **geometry in the node's own frame, never triangle numbers** (like edge treatments): `{ kind: 'region', color | null, point, normal, spread?: 'bucket', angle? }` or `{ kind: 'body', color }`. `color: null` erases. Fills apply in order. `canPaint` / `addPaint` / `clearPaint` / `stretchPaint` / `recolourPaint` are in core/paintEdits.ts; a body fill replaces the list, a node holds at most 1000 fills. **Any edit that changes a node's size must stretch its paint too** (`stretchPaint`, called where `stretchTreatments` is: `withStretchedEdges` in edit.ts and group resize in groupTransform.ts), and `setPaletteColor` recolours paint with the slot's colour.
- Maths: `paintTriangles(mesh, fills)` (core/paintRegions.ts, pure) welds the finished mesh, finds the seed triangle (nearest within `REACH` = 0.5 mm that faces within 45 degrees of the fill's normal; none means the fill paints nothing) and spreads over edge-sharing neighbours (smart: the neighbour turns no more than `angle`; bucket: the neighbour currently has the same colour). It returns `{ colors, triangle }` (per triangle 0 = unpainted, else 1 + the colour index). Paint is applied to **the finished surface**, after holes and edge treatments.
- Engine: `Evaluation.run` paints a solid top-level node **in its own frame** and places it by hand afterwards (`transformPositions`), because manifold may reorder triangles; `GroupMesh.paint` carries the result. `rootComputedNodes` includes painted shapes (so the view draws the computed mesh) and `subtreeHash` includes the paint without its ids (FORMAT v6). A hole's and a nested node's paint is ignored.
- View: `DesignScene.applyPaint` gives the result mesh a per-vertex `color` attribute (`paintVertexColors`, three vertices per triangle as `toCreasedNormals` gives; unpainted triangles get the shape's colour so they follow it) and a white material with `vertexColors`. The tool is `PaintTool` (hooks) over `PaintPanel` (markup, tested by rendering) over pure `fillFor` (world click to a fill in the object's frame). It is a `SurfaceTool` (`'paint'`, key `N`), so the left button belongs to it and Escape leaves it. `pickSurface` now also returns the top-level object's `id`, and `onClick` gets the Shift state. Keep the toolbar to one line on the 4:3 tablet (fourThree.spec.ts): the toolbar's padding was tightened to fit the Paint button.
- **Brush** (`kind: 'brush'`: `shape` circle | sphere | triangle, `radius`, `dabs: {point, normal}[]` in the node's frame, at most 300 dabs and 500 mm): one stroke is **one fill** with all its dabs. `paintTriangles` first **cuts the surface finer where any brush's edge crosses it** (`refineMesh`, core/meshRefine.ts: marked edges are split at midpoints, shared by the neighbours, so a triangle with 1, 2 or 3 split edges becomes 2, 3 or 4 and the surface stays closed with no cracks; up to 12 rounds, 300k triangles, edges down to a fifth of the radius) and returns that mesh in `PaintedMesh.mesh`, which `Evaluation` then uses (placed by hand like before). A sphere paints triangles whose middle is within the radius; a circle is a short cylinder along the dab's normal (0.75 radius either side) that only paints faces turned within 60 degrees of it; a triangle brush paints just the seed triangle under each dab (REACH, no cutting). `stretchPaint` scales a brush's radius by the cube root of the stretch's volume. **Editing during a stroke**: `paintStart` (a drag on that object, which need not be selected) + `previewPaint` (the same fill id, more dabs, replaces the in-flight one from `drag.base`) + `moveEnd` (one undo step) / `cancelDrag`, like the Edge tool's preview. `BrushStroke` (paintTool.ts, pure) adds a dab every third of the radius (0.5 mm for triangles); `useBrushStroke` owns the pointer (mouse only: while the brush is on, `useSurfaceTool(..., { paintsOnDrag })` makes a left drag do nothing in the viewport so it paints, and `dragModeFor` still orbits for a finger); `BrushCursor` draws the ring (`Viewport.pixelsPerMm`). The brush is verified against the real engine too: `verify-orca-export.sh` has it load a box with a brush dab (1334 triangles, 276 painted) and keep every painted one.
- **Height range** (`kind: 'band'`: `origin`, `up`, `height` in the node's frame): everything with `(p - origin) . up` between 0 and `height`, painted on the whole surface. The tool makes `up` the **world's** up expressed in the node's frame (`fillFor`, `toLocal` of (0,0,1): so on a turned shape the band is level but is stored turned with it, and keeps its place on the surface afterwards). `cutByPlanes` (core/meshRefine.ts) cuts the mesh exactly along the band's two planes first (edges that strictly cross a plane get a new shared corner at the crossing; `cutTriangle` is the same 1, 2 or 3-cut triangulation the brush's midpoint cuts use), so after it every triangle is wholly inside or outside and `bandTriangles` only needs the triangle's middle (a face lying on an edge counts). `stretchPaint` keeps a band on the same part of the surface: the plane moves, `up` turns by the inverse stretch and `height` is divided by the length of that (unnormalised) direction. The view shows a translucent slab (`bandMarker.ts`, `Viewport.setBandMarker`, `BandCursor`) across the hovered object's bounds.
- **Gap fill** (`kind: 'gaps'`, `area` mm2, `color: null` - it has no colour of its own, and is not an erase): `mergeGaps` (core/paintGaps.ts) runs when its turn comes in the fill order, on the paint laid so far. A patch is a connected set of triangles (over any edge) of one colour or none; a patch smaller than `area` joins the **larger** patch it shares the most edge length with (OrcaSlicer takes the lowest filament number; this is steadier), never another small patch (two specks, or every patch being small, would only swap), judged on a snapshot per pass, and up to 8 passes until nothing joins (a speck inside a small ring joins the surface once the ring has). The tool's **Apply** adds one gap fill to every selected shape that has paint, as one undo step (`addPaintAll`; `gapFillFor`). Paint laid after a gap fill is not tidied by it.
- The settings (angle, brush shape and size, band height, gap area) live in `usePaintSettings` (with the Ctrl+wheel for each tool); `PaintTool` stays small. `scripts/verify-orca-export.sh` also loads a band sample (the surface cut along it) in the real engine.
- Export: `write3mf(bodies, { filaments })` adds `paint_color` to painted triangles only in an Orca export: `orcaPaintCode(slot)` is OrcaSlicer's TriangleSelector encoding of an unsplit triangle in filament `slot` (1 and 2: one digit `4` / `8`; 3 to 17: `<slot-3 hex>C`; 18 up: `<slot-18>FC`), taken from `TriangleSelector::serialize` in the vendored source. **Never guess the encoding: `scripts/verify-orca-export.sh` has the real engine load a painted box and requires its painted triangles to survive** (`scripts/lib/verify-orca-paint.py`).
- Tests: `paintRegions.test.ts` (fill maths on boxes and cylinders, by hand), `paintEdits.test.ts`, `geometry/paint.test.ts` (areas through the engine, placement, hashes), `DesignScenePaint.test.ts`, `PaintPanel.test.ts`, `paintTool.test.ts`, and `e2e/web/paint.spec.ts` (real pixels, shaded faces are told apart by hue, and the 3MF's `paint_color`).

## Sketch shape
- A `sketch` shape is a drawing (outlines on a plane) extruded by its height. **Data**: `ShapeNode.sketch?: Sketch` (core/sketch.ts: `outlines: { points: [x, y][] }[]`, mm in the plane, x right and y up = the shape's own x and y), kept **centred on the shape's origin** (`normalizeSketch` recentres and drops outlines with under three points or no area; limits 64 outlines, 512 points, coordinates within 1e5 mm, a drawing 0.1 to 1000 mm across). Format version 5 (`parseSketch` in validate.ts: a sketch shape must have one, other shapes' field is dropped). The shape is as big as its box says: `width`/`depth` stretch the stored drawing (`sketchShown(node)` gives the outlines now: stretched, and mirrored when `params.mirror === 1`), like Text, so resize, group resize and edge treatments need nothing special. Nested outlines are holes by the **even-odd** fill (`CrossSection.ofPolygons(..., 'EvenOdd')` in geometry/sketchSolid.ts); a damaged sketch with no drawing builds nothing.
- **Flip**: a drawing is not the same seen left to right, so `flipNodes` toggles `params.mirror` for sketches and for **text** too (`MIRRORED_TYPES` in arrange.ts), and `sketchSolid` / `textSolid` mirror the outline. Anything new that is not x-symmetric must join that set.
- **Making and editing**: `addSketchShape(design, plane, outlines, height)` (core/sketchShape.ts) stands the drawing on a Workplane-style plane like `addShapeOnPlane` (base on the surface, thickness out of it, lifted if below the floor, undersides refused); `setShapeSketch(design, id, outlines, { height })` takes the outlines **in the shape's own frame as `sketchShown` gives them** and keeps the drawing where it is in the world (the transform is moved by the new box centre), baking in the stretch and flip. It is not in the Shapes panel (`ShapeDef.noTile`; `filterShapes` skips it) and `defaultSize` is only a fallback. `rootComputedNodes` includes sketches (the view draws the worker's mesh; until it arrives `DesignScene` draws a box) and `subtreeHash` includes `node.sketch` (FORMAT v7).
- **The Sketch tool** (`SketchTool.tsx`, button + `K`, `SurfaceTool` `'sketch'`): its logic is **pure and tested without a screen** in core/sketchEditor.ts (`sketchReducer`: tools select/rectangle/circle/polygon/line, grid snap from the plane's origin, drafts, selecting by point then smallest outline, dragging points and bodies, Delete/Backspace/Enter/Escape, undo/redo, limits). `SketchFrame` (core/sketchFrame.ts) is the plane's origin and x, y, normal: `frameOfPlane` for a new sketch, `frameOfNode` (the transform's columns) for one being redrawn, since a shape may be turned about its own normal. `lookAlongNormal` (camera.ts) is the view straight at a plane (right = the plane's x, up = its y). `Viewport.lookAtPlane` (orthographic), `setDimmed` (everything else faded, from the next sync), `goToView` (put the camera back on Finish or Cancel: **Finish returns to the 3D view**), `setSurfaceTool(true, true)` (a left drag draws, it does not orbit; right and middle still do). The overlay (`SketchOverlay`: one even-odd path, handles, draft, rubber band) is an SVG in screen space from `viewport.project`; the bar is `SketchBar`. The sketch being redrawn is hidden in `drawn` (ViewportCanvas) while its drawing is on screen, and `sketchEdit` (Editor state, set by Properties' **Edit sketch**) turns the tool on. Keys the drawing handles (Ctrl+Z/Y, Enter, Backspace, Delete, Escape) are caught in the capture phase so they never reach the editor's own shortcuts. Reducer actions: `addSketch` (selects the new shape) and `setSketch`, one undo step each.
- **Curves** (format 6). `SketchOutline.segments?` has one kind per point, the side from `points[i]` to the next (the last back to the first): `'line'`, a **bulge** (a circular arc: tan of a quarter of the angle it sweeps, positive = anticlockwise from the side's start so it bulges to the right of the direction of travel, so 1 is a half circle; limit `MAX_BULGE` 4), or `'curve'` (a smooth Catmull-Rom curve as a cubic Bezier: tangents through the neighbours where two curves meet, along the side at a corner, and ends of an open path are corners). The field is left out when every side is a line, so plain polygons are just points. All the curve maths is pure in core/sketchCurves.ts (`bulgeThrough` = the arc through three points, `arcMidpoint`, `flattenOutline` / `flattenPath` = the points to fill, `segmentMidpoint` = where a side's handle goes); `SKETCH_TOLERANCE` (0.02 mm) is how far a straight piece may stray from the curve, and **everything measured, filled or cut uses the flattened outline** (`outlinePolygon`: area, containment, `sketchBox` so a D's box includes its bulge, `normalizeSketch`). An outline of **two points** is valid when a side is curved (a circle is two points and two bulges of 1; `circleOutline`). `tidyOutline` keeps sides lined up with their points when repeated points go. `sketchShown` (shown and edited) scales points and keeps each side (an arc keeps its bulge, a flip negates it), but **what is built is `sketchPolygons`**: the stored outline flattened *then* stretched and mirrored, so resizing is an exact affine stretch (a circle twice as wide is a true ellipse) and `sketchSolid` needs nothing more. Editing a stretched sketch bakes it, so an arc in a non-uniformly stretched sketch comes back as a circular arc through the stretched ends (close, not exact).
- The editor (`sketchEditor.ts`, with side edits in `sketchSides.ts`): the **Arc** tool is a draft `{ kind: 'arc', points, bulges, through, hover }` (click start; then `through`, then the end; clicking the first point as an end closes with that arc; Enter closes with a line; Backspace takes back `through`, then the last arc), the **Spline** tool shares the line draft and closes into all-`'curve'` sides, and Select has **side handles** on the selected outline (`hitSide`: the middle of each side from `segmentMidpoint`; `Selected.segment`) that bend a side by `bulgeThrough(a, pointer, b)` (a bulge under `STRAIGHT_BULGE` is a line again). `straighten` / `smooth` actions reshape the selected outline (one undo step each); deleting a corner joins its two sides into a line (a curve only if both were curves) and Delete on a selected side straightens it. `draftArc` / `draftSpline` / `outlineHandles` feed the overlay.
- Not done: Revolve, constraints and typed dimensions, dragging a rectangle's edge to resize it as a rectangle (a corner moves one point), fillets (rounding chosen corners to a radius), touch drawing for the drag tools (the Line, Arc and Spline tools work by tapping).

## Text shape
- `text` is a parametric-category shape that is **not** a builder in `PARAMETRIC_TYPES`: its letters come from `packages/core/src/text.ts` (`textOutlines`, `textMetrics`, in ems, y up) over `fonts/fontData.generated.ts` (outlines of Basic Latin + Latin-1 in four OFL fonts, ids 1 Sans/Inter, 2 Serif/Noto Serif, 3 Mono/Roboto Mono, 4 Script/Lobster). That file is GENERATED by `scripts/make-fonts.sh` from the `@fontsource` dev dependencies (never hand-edit; licence texts go to `licenses/`).
- Data: `params.text` (string, at most `TEXT_MAX_LENGTH` = 100, the validator's string limit) and `params.font` (a `choices` setting), plus ordinary width/depth/height. `ShapeDef.initial` gives the starting words. The shape is as big as its box says: `textSolid` (geometry) fills the outlines by winding (letter holes stay open), stretches them to width x depth and extrudes height. Resizing is a plain stretch, so nothing special is needed for groups or edge treatments.
- `textShape.ts`: `withText` / `setShapeText` keep the **em** (mm per letter size, derived from depth) when the words or font change, and refuse words with no ink, a locked shape or letters over `MAX_SHAPE_SIZE` (same design back, no undo step). `setShapeParam` on `font` goes through `resizedForText`. Reducer action `setShapeText`; the Text box is `TextField` in `ShapeParamFields`.
- Drawing: a text shape is a top-level **computed** node (`rootComputedNodes` includes it), so the view shows the worker's letters; until they arrive `DesignScene` draws a box of its size (`geometryForNode`), and `realSizeMesh` skips it (it has settings but no builder in core). Anything new that switches on `getShapeDef(type).params` must treat text as having none to build.
- Not done: text on a curve, line breaks, bevel, characters outside Latin-1.

## Arrange (align and flip)
- `packages/core/src/arrange.ts`: `alignNodes(design, ids, axis, edge)` moves each top-level node along one axis so its low edge / centre /
  high edge meets the selection's (via `nodeBoundsIn`, so groups work); `flipNodes(design, ids, axis)` mirrors through a plane at the
  selection's centre. Both return the same object when nothing changes; `canAlign` / `canFlip` drive the buttons.
- Flip never stores a negative scale (transforms are rotation + position only). Every node's frame is also flipped about its local x,
  `L' = F_parent · L · FLIP_X` (root: the world reflection instead of `F_parent`), which is exact because every built-in shape is symmetric
  about its own x. **Imported models are not x-symmetric, so each one in a flipped root also has `params.mirror` toggled** (`isMirrored`, `mirrorMeshX` in
  core/meshShape.ts; the key is dropped again when back to the stored model): the extra `FLIP_X` on its frame then makes it the true mirror image. Every
  place that builds an imported model honours it: `DesignScene.geometryForNode` (its own cached geometry per way round) and `Evaluation.imported` (CSG, edges,
  export). Anything new that reads a model's stored mesh must do the same. Threads are not x-symmetric either (a helix) but flip as a turned copy, which
  keeps them right-handed, as a real fastener should be. A new non-symmetric shape (text, say) would need the same kind of mirror setting.
- UI is `ArrangePanel` (actions `align` / `flip`); no keyboard shortcuts yet (L and M are reserved for tools).

## Duplicate and repeat
- `EditorState.lastDuplicate = { sources, copies }` is set by every duplicate. When the selection is exactly those copies,
  `Ctrl+D` calls `repeatDuplicate` (core/repeat.ts): the step is `copy · source⁻¹` (rigid, so it includes the first offset) and each new
  copy gets `step · copy`; afterwards `sources` = the copies it was made from. Anything else selected, or a source that was deleted,
  falls back to the plain 10 mm offset. Size changes are deliberately not repeated.

## Group stretch (a group's own `scale`)
- `GroupNode.scale?: [sx, sy, sz]` (format 7; `parseStretch` in validate.ts, 0.001 to 10000 each, left out when all 1) is a stretch **along the group's own axes, about its origin, after its holes are cut**: a node inside is at `transform * diag(scale) * its own transform`. `transform` stays rotation + position only, so `rotationOfTransform`, Rotate fields and the rings are unchanged. **Anything that places a group's contents must use `groupFrame(node)` / `nodeFrame(node)` (core/groupFrame.ts), not `node.transform`**: `boundsWithin`, `ungroupNodes`, `groupGeometry`, `setGroupRotation`'s pivot, `groupRings`, the geometry worker's `placed` (so exports) and nested-group hash, `DesignScene` (the THREE group carries the scale, so drawing, picking and marquee follow), ruler snapping (`useSnapEdges`).
- It is only used when it has to be. `groupResizeMode(design, id)`: `'rewrite'` (every inner node in quarter turns, no thread, nothing already stretched: shapes get new sizes via `stretched`, as before), `'stretch'` (otherwise: `stretchGroup` sets the scale and moves the group's origin so the box's base centre lands on the handle's geometry, nothing inside touched) or null (a thread inside: it keeps its real size; not a group). Once a group has a scale it stays in stretch mode, and a scale of all 1 is dropped.
- The group's own `scale` is **not in `subtreeHash`** for the root group (so a stretch never recomputes the cut) but **is for a group nested inside another** (its shape is part of the outer one's).
- `bakeStretch(design, id)` folds a stretch into the shapes (exact only for the rewrite case) and `ungroupNodes` uses it; `canUngroup` is false for a stretched group that cannot be baked, and Properties says why. `canPaint` and `edgeToolTarget` refuse a stretched group (those tools work in the unstretched frame, via `toLocal`/`worldEdges` assuming a rigid transform); paint and treatments it already had are still applied before the stretch.
- **Fasteners are locked by default**: `groupResizeMode(design, id, { fasteners })` is null for a group holding a thread, nut, washer or standoff (`holdsFastener`) unless `fasteners` is set, and then it is always `'stretch'` (a fastener's own width and depth are locked to its Size, so the stretch lives on the group). The unlock is `EditorState.unlockedStretch: NodeId[]` (action `setStretchUnlocked`; session only, not in the design, not an undo step, not reset by undo), passed as `{ fasteners }` by the reducer for `setGeometry` and `setGroupSize` and by `selectedHandles(design, selection, unlocked)`; Properties shows `FastenerLock` (the reason and the Unlock/Lock button). Locking again keeps the stretch that was made but stops further changes.
- Not done: paint or edge treatments on a stretched group.

## Hide and lock
- `hidden` / `locked` live on every node (core/visibility.ts: `setHidden`, `setLocked`, `showAll`, `hasHiddenNodes`). Every edit that
  must skip locked nodes uses `isEditable`; code that asks "where is it" goes through `nodeBoundsIn`, which returns null for hidden nodes,
  and `DesignScene` sets `visible = false` (picking and marquee ignore invisible objects). New edits must follow both rules.
- A group's Properties has Width/Depth/Height fields (`setGroupSize` in groupTransform.ts, reducer action `setGroupSize`, one undo step): it builds the group's `groupGeometry` with the typed size and goes through `setGroupGeometry`, so every rule for dragging a handle (locked, quarter turns, no threads, size limits) applies; the fields are disabled with `whyNotResizable` when `canResizeGroup` is false.
- **Hidden parts of a group are left out of its shape**: `Evaluation.contents` skips hidden children (so a hidden hole does not cut) and `subtreeHash` omits them (FORMAT v5), so cached results and exports agree with what is drawn. The Objects list's group rows open (local state, starts closed) to nested `ObjectRow`s with their own toggles; a nested row's name selects the top-level group, since parts are not selected alone.
- The reducer deselects what was just hidden (a hidden object must not stay movable); locking keeps the selection. The toggles are
  `RowToggle`s (`aria-pressed`, labelled just "Lock"/"Unlock" and "Hide"/"Show": a name in the label would make `getByRole("button", { name: /Group 1/ })` match three buttons per row) at the end of each Objects row.

## Ruler and surface picking
- `DesignScene.pickHit(raycaster)` gives the point, world-space face normal and top-level id of the nearest shown hit (flat triangle normals,
  so curved parts report per-facet normals). `Viewport.pickSurface(x, y)` adds the workplane (inside its edges) as a fallback. The
  workplane tool will reuse both.
- The ruler is `RulerOverlay` (React) listening on `viewport.element` next to the viewport's own handlers; `Viewport.setRuler(true)` stops
  the left button selecting/moving and makes empty-space drags orbit. The maths (`measureBetween`, `snapMeasuredPoint`, `nextRuler`,
  `formatLength`) is pure, in core/ruler.ts. Ruler state is React state only: it is never in the design or undo history.
- **Ruler snapping** (core/rulerSnap.ts, pure): `snapToEdges(edges, project, hit, pointer)` returns a corner (open edges' ends), the middle of a *straight* edge, or the nearest point on an edge, within `SNAP_REACH` (12 px) of the pointer, preferring corner over middle over edge. An edge only counts if it is also within about 1.5 x the reach (converted to mm at the hit) of the surface point being pointed at, so an edge hidden behind the face never catches it. The edges come from the geometry worker through `useSnapEdges` (one request per top-level shape or group, cached by `toolEdgesKey(..., { treated: true })`, which are the finished shape's edges, own chamfers included, unlike the Edge tool's), moved into the world by `worldEdges`. The overlay recomputes the marker when the edges arrive under a still pointer. The Snap switch is kept in localStorage (`rulerSnapSetting.ts`), on by default. Only top-level objects are snapped to, and edges the Edge tool would not offer (under 0.5 mm, or too many pieces) are not either.

## Finding shapes in the panel
- Every `ShapeDef` has a `category` (basic, parametric, fasteners) and `keywords` (other names), set in the `PANEL` table in core/shapes.ts: **give every new shape both**. `filterShapes(query, category)` (core/shapeSearch.ts) is the pure search: every word of the query must match the name or a word of a keyword, best matches first (name starts with it, a word of the name does, the name has it inside, then another name), ties in the panel's order. `ShapesPanel` holds the query and chip in local state (not saved); Enter adds the first match, Esc clears. The grid is a fixed-height scrolling box (four rows and a peek) so Properties stays on screen on a 800 x 600 screen: the 'Properties is reachable' test guards it, so check it when adding anything above the grid.

## Shortcut sheet
- `?` (or the top bar's **?** button) opens `ShortcutSheet`, a modal listing `SHORTCUT_GROUPS` (shortcutList.ts). **Add a keyboard shortcut → add its row there.** Rows with `handled` are checked by shortcutList.test.ts against `shortcutAction` (editor keys) and `viewKeyCommand` (view and tool keys), so a listed key that stops working fails; rows for keys inside a tool (Paint, Sketch, mouse) have no check. Escape is caught in the capture phase so it closes the sheet and nothing else; `?` is ignored while typing in a field.

## Accessibility
- e2e/web/a11y.spec.ts runs axe (WCAG 2 A and AA) on the designs list (also when it fails to load), the editor (each panel tab, each tool on, a failed save, the shortcut sheet, a phone width) and must find nothing. **A new screen, panel or state gets a scan there.** Text colours: `--ok` is for fills; use `--ok-text` for green text (contrast 4.5:1). The WebGL canvas is not scanned. The shortcut sheet traps Tab on its one button and puts focus back where it was on close.

## Saved shapes (the library)
- A saved shape is a small **design** whose single root is the thing saved, with the middle of its footprint at the origin and its lowest point on the floor (`libraryShapeOf(design, id, name)`, core/libraryShape.ts; `libraryColor`, `LibrarySummary`). That keeps every rule of designs: the server (`LibraryStore` in apps/server/src/library.ts, files in `<data>/library/` via a second `DesignStore`) checks it with `parseDesign`, and only a design with exactly one root is stored; the root node is named as the entry (rename renames both). Routes: `/api/library` (GET list of summaries, POST `{name, design}`), `/api/library/:id` (GET, PATCH `{name}`, DELETE). Imported models inside stay by mesh reference (mesh files are never deleted, so they stay valid).
- `addLibraryShape(design, saved, { at } | { plane, point })` puts a copy in with **fresh ids throughout**, floor placement lifted if below z = 0, or via `standOnPlane` for a plane; the reducer action `addLibrary` selects it. The web side: `libraryApi.ts` (client), `useLibrary` (list kept fresh, `save`, `open`, `rename`, `remove`, `problem`), `SaveToLibrary` (Properties: button, name box, status), `SavedShapes` (the Mine view: tiles, Manage with rename and a two-click delete), drag type `LIBRARY_DRAG_TYPE` handled by `shapeDropHandlers`. The Mine view is searched by name only (every word); the built-in search does not look at saved shapes. Not done: thumbnails for tiles (a swatch of the colour is used), moving shapes between libraries or exporting them.

## Workplane tool
- core/surfacePlane.ts: `WorkPlane = { origin, normal }`, `planeFrame(normal)` (rotation with local z = normal, local x horizontal, so a wall's
  shape has y up), `planeCoords/planePoint/snapOnPlane` (grid measured from the plane origin), `addShapeOnPlane` (reducer action `addOnPlane`;
  lifts a shape that would dip below z = 0; undersides refused via `isUsablePlane`). Like `add`, it leaves the selection alone.
- The plane is editor state in `Editor` (`plane`), never in the design or undo history. `Viewport.setPlaneMarker` draws it (planeMarker.ts, raycast
  disabled so tools aim through it, hidden in thumbnails). The Shapes panel and drag-drop (`shapeDropHandlers`) place on it when set.
- Surface tools (ruler, workplane) share `useSurfaceTool`: it calls `Viewport.setSurfaceTool(true)` (left button stops selecting/moving, drags orbit)
  and reports hover and click on `pickSurface`. `ViewportCanvas` holds the one active `SurfaceTool` and hides the resize/rotate handles meanwhile,
  because they sit over the canvas and would swallow the clicks.
- **Existing shapes** are put on the plane by `standOnPlane(design, id, plane)` (reducer action `standOnPlane` on the one selected node; the Arrange panel's **Stand on plane** button, shown only while `plane` is set, enabled by `canStandOnPlane`): the node's base centre (a shape's origin; a group's footprint middle at its lowest, `groupLocalBounds`) goes to where the middle of its world bounds projects onto the plane, its up is the plane's normal (`planeFrame`), and it is lifted if that dips below z = 0. It replaces the node's orientation (a spin about its own up is not kept). Not done: dragging an existing shape along the plane (dragging still moves it on the floor).

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
  when every inner node is turned in quarter turns within the group (the group itself may be turned or tipped any way: the stretch is worked out in its own frame), which `canResizeGroup` checks (otherwise no handles); a result
  outside 0.1..1000 mm for any shape is refused. `MAX_SHAPE_SIZE` now lives in `limits.ts` to avoid an import cycle with edit.ts.

## Chamfers (Stage A)
- `params.chamfer` (mm, as typed) and `params.chamferEdges` (`all` | `top` | `bottom`) on boxes and cylinders; no format change (validate
  already keeps extra numeric/string params). `chamferOf(node)` gives the **effective** chamfer, limited to 49% of the narrowest side (and of the
  height, or of twice it for one end) so faces never vanish; the typed value is kept, so shrinking and regrowing a shape loses nothing.
- `chamferedMesh` (core/chamfer.ts) builds the solid at its **real size** as a loft of horizontal rings (exact: every face planar, slices change
  linearly); coinciding outline points share an index so there are no degenerate triangles. The same mesh is drawn (`DesignScene` keeps one
  real-size geometry per chamfered shape, mesh scale 1, outline scaled instead) and fed to manifold as `Manifold.hull` (both shapes are convex).
- Tests derive volumes independently (cross-section integrals, polygon frustums), check watertightness, and read pixels from the front view.
- **Countersink** (core/countersink.ts): `params.countersink` (mm, typed value kept) and `params.countersinkEnd` (`top` | `bottom` | `both`) on a **cylinder in hole mode**
  only (`countersinkOf` is null for solids; no format change). It is a 45 degree flare: the opening widens by `size` on every side. A flared cylinder is not
  convex, so `countersunkMesh` is the same ring loft as a chamfer (exported `loft`/`ellipseOutline`), handed to manifold with `Manifold.ofMesh` (not a hull)
  and drawn by `DesignScene` through the same real-size-geometry path as a chamfer. `size` is limited to the height (half of it for both ends). It wins over a
  chamfer on the same hole (the Properties panel says so). Tests derive the flare volume by hand (integral of the growing disc), in core, CSG and a real export.

## Edge treatments (chamfers and rounds on chosen edges, Stage B)
- Data: `node.edges?: EdgeTreatment[]` (`{ id, kind: 'chamfer' | 'round', size, points, normals }`) on groups and shapes, **in the node's own frame**
  (a group's contents frame, a shape's primitive frame: base centre at the origin, mm). Format version 3 (`MIGRATIONS[2]` is a no-op); validated in
  `parseTreatments` (unit normals, finite bounded points, unique ids, at most 1000 per node). The field is left out when empty.
- Finding edges: `sharpEdges(mesh)` (core/edges.ts) welds the mesh, keeps sides where two faces meet at more than 30 degrees **and** the solid is
  convex there, re-joins straight edges the mesh split (same two faces, collinear), and chains gently turning runs into one polyline (a cylinder's
  rim, closed). Concave edges are not offered (yet).
- Cutting: `treatmentCuts` (geometry/edgeCut.ts) gives, per segment, a triangular prism to subtract (chamfer: set back `size` along both faces;
  round: set back `r / tan(inside/2)`, minus a cylinder of radius `r` along the edge). The prism pokes 1 µm past the faces along the cut line so it
  never lands exactly on a face, without moving the chamfer plane. **A curved edge (a hole's rim) is cut smoothly**: each polyline point has one cross-section
  worked out from the two faces' directions averaged over the pieces that meet there (`sections`; stored face pairs come in either order, `alignedFaces`
  matches them up), and each piece's prism is the hull of its two end sections, so neighbours share a section exactly (no gap, no step, no overlap). The old way, one
  straight prism per piece reaching `size` past its ends, removed up to twice the material on a small hole and left thousands of tiny steps. A round's tube
  is a cylinder per piece, widened 0.13% (`TUBE_GROWTH`, so its 64 flats cover the true circle) and reaching `r*tan(turn/2)` past each bend. `evaluate`
  subtracts **all of one treatment's tubes from all of its wedges together** (subtracting each tube from only its own wedge cuts away what the neighbour keeps,
  leaving paper-thin walls). `FORMAT` in subtree.ts is v4 for this. Tests derive the removed volume by hand with Pappus's theorem and check the left-over edge count.
- Applied in `Evaluation.treated` after a group's holes are cut (and to a shape's primitive before it is placed). **Before cutting, each treatment's
  edge must still be one of the solid's sharp edges** (`edgeIsPresent`: every segment within 0.01 mm of an edge between faces facing the same ways
  within 3 degrees); otherwise it is skipped and its id reported in `GroupMesh.skippedEdges`, never cut blindly.
- Edges are part of `subtreeHash` (FORMAT v2), so a treated group is never shown with an old result.
- **Loose shapes with treatments** are drawn from a computed mesh too: `rootComputedNodes` (was `rootSolidGroups`) lists top-level groups
  *and* top-level solid shapes with `edges`; `evaluateGroup` on a shape returns its treated primitive in its own frame (its hash ignores its
  transform); `DesignScene` hides the plain shape and shows the result beside it under the shape's transform.
- **Resizing keeps treatments on their edges**: they are stored in the node's own frame, so any resize must stretch them too, or they are left behind and skipped
  (this happened: a chamfered group was dragged bigger and 19 of 28 chamfers were reported as lost). `stretchTreatments(edges, factors, shift)` (core/edgeEdits.ts)
  maps the points by `factor * p + shift`, turns each face direction by the inverse stretch (then back to length 1) and leaves `size` alone. It is called by
  `setShapeSize`, `setShapeGeometry` (`withStretchedEdges`, from the ratio of the new to the old width/depth/height) and group resize (`stretched`: the group's own
  list by the group's stretch and shift, each child's list by its `own` factors, no shift). **Any new edit that changes a shape's size or the layout of a group's
  contents must do the same.** Tests compare against chamfering the already-resized shape directly (same material removed, none skipped).
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
- **Escape belongs to the active tool**: `useSurfaceTool` listens in the capture phase and stops the event, so the editor's Escape (deselect)
  doesn't run. Otherwise it deselects first and React re-renders between the two window listeners, unmounting the Edge tool before it hears the
  key (a browser test caught this only with focus outside a text field: shortcuts skip typing targets).
- **Keep it cheap on heavy shapes** (a part already cut up by many treatments has thousands of tiny steps; on one real design the tool once offered 5,434 edges and
  froze the page for seconds per mouse move). Three guards: the worker offers only `usefulEdges` (at least `MIN_EDGE_LENGTH` = 0.5 mm); `useToolEdges` refuses more
  than `MAX_OFFERED_SEGMENTS` pieces (`settled`, shown as a message); and drawing is cheap: `projectEdges` projects and skips pieces whose faces point away (no rays)
  only when the camera or shape changes, never on hover, while the costly "hidden behind the model" ray test runs in chunks after the camera has been still
  120 ms (`SegmentVisibility`, injectable scheduler; unchecked pieces count as visible). Never put a per-piece ray test in a render.
- **Threads and the Edge tool**: a lone thread shape is refused by `edgeToolTarget` (its helix is thousands of tiny edges), and `toolEdges` finds edges with every thread swapped for its plain cylinder (`withSimpleThreads`), so a group holding a bolt offers the part's edges in a fraction of the time (the ruler's `treated` edges too). A treatment on a thread's own surface or mouth is therefore never offered. `sharpEdges(mesh, limit)` also throws `TooManyEdges` once it has found `limit` sharp pieces (`MAX_SHARP_PIECES`), and its welding and side matching use flat typed-array hash tables, not string-keyed Maps (about twice as fast on 260k triangles).
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
- Resize and lift handles for a **shape** exist at any turn. While `isUpright` (turned about Z only) the maths is the `*Yawed` variants in `resize.ts`;
  once it is tipped about X or Y (`selectedHandles(...).tilted`) it is `handlePositionTilted` / `dragHandleTilted` / `lowestPointOffset` in `resizeTilted.ts`,
  worked in the shape's own frame from its whole row-major turn (sides and corners aimed at the plane of its own base, the height handle at its own up axis via
  `closestParamOnLine`, the lift handle at the world vertical and never below the floor: `-lowestPointOffset`). `setShapeGeometry` lets a tipped shape's base centre dip
  below z = 0 (an upright one's base is its lowest point). How a pointer aims each kind of handle is `handleAim.ts` (`floor`, `vertical`, `plane`, `axis`). A **group** gets the same handles at any turn (`groupGeometry` is its contents' box in its own frame), but only while it holds quarter turns and no
  thread (`canResizeGroup`); `setGroupGeometry` also lets a tipped group's base centre dip below z = 0.
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

## Send to Trident
- **The server sends, not the browser** (`apps/server/src/trident.ts`): `GET|PUT|DELETE /api/trident` keep the address and key in `<data>/trident.json` (mode 600, written by rename; `GET` and `PUT` only ever say `hasKey`, and `PUT` keeps the key when it is left out, replaces it when given, drops it when empty); `POST /api/trident/send` takes the 3MF as `model/3mf` (limit 200 MB, name in `x-file-name`), uploads it to `<url>/models` as multipart with `Authorization: Bearer <key>` (none when there is no key), and answers `{ openUrl: <url>/?model=<id> }`. A redirect is an error (a POST would become a GET); failures are 502 with a message fit to show (401 names the key, 403, 413, unreachable with the address, not a Trident); not set up is 409. The address must be http(s) with no login in it.
- **The file is `exportOrcaBytes`** (exportDesign.ts: the same bytes as the "3MF for OrcaSlicer" download, kept in memory). Web: `tridentApi.ts` (client), `useTrident.ts` (state; opens the new tab **at the click**, before the network wait, so popup blockers allow it, then points it at `openUrl`, or closes it on failure; with no tab allowed it shows a link), `ExportMenuItems.tsx` (the menu items and the Trident row, the setup/settings form, message and settings link).
- **Accessibility**: the `role="menu"` holds only the format rows, the separator and the Send row; the form, message and link sit beside it inside the dropdown (a menu may not contain a form: axe fails it, and a scan of that state is in a11y.spec.ts). Tests: `tridentRoutes.test.ts` (a fake Trident in the test), `tridentApi.test.ts`, `e2e/web/trident.spec.ts` (a fake Trident in the test process, which the e2e server reaches).
- Trident's side (API keys, `?model=<id>`) is in the Trident repo, from 0.6.

## Resin tools (the Resin panel)
- **Branch work**: the resin tools are built on the feature branch `resin-tools` (the user merges it when it is all done). The plan is in `../tinkercad-notes/PLAN.md` ("Resin tools"); the Trident side (resin printers, layer previews) is in the Trident repo.
- **Drain and vent holes** (core/resinHoles.ts): `addResinHole(design, ids, 'drain' | 'vent', diameter)` adds an **ordinary cylinder hole** (mode `hole`, named "Drain hole n" / "Vent hole n") in the middle of the selection's bounds, from 1 mm outside the face to a quarter of the height in (3 to 15 mm, never past the shape), and **groups it with the shape** (`groupNodes`); the selection afterwards is that group, and a second hole is pushed into it rather than wrapping it again, **only when the group has no move, turn or stretch of its own** (`isPlainGroup`: otherwise the hole's world position would need converting into the group's frame, so the group is wrapped instead). `canAddResinHole` needs exactly one visible, unlocked, solid top-level node. The diameter is kept to 0.5 to 30 mm (NaN gives 3.5). Nothing about the hole is special once made: undo, move, resize and delete are the ordinary edits. Tests: `resinHoles.test.ts` (core), `geometry/resinHoles.test.ts` (the real engine: the volume taken out), `e2e/web/resin.spec.ts` (a real STL export).
- **Tilt** (core/resinTilt.ts): `tiltNode(design, id, degrees)` turns one top-level node about the world X axis on top of its own turn (`rotateAboutWorldAxis` then `setNodeRotation`, which works for groups too) and rests it on the plane (`dropToWorkplane`); a negative angle leans the other way. The same design comes back for a locked, hidden or several nodes, NaN or 0 degrees.
- **Hollow** (three repos). Engine (Pseudorca): `--sla-hollow-output <file>` on the SLA path hollows the model with the process profile's hollowing settings and writes one binary STL in the place the file has the model (`run_sla_hollow`, `sla::hollow_mesh`); Trident: `POST /resin/hollow` (multipart `file`, `wall_thickness` 0.5 to 20, `quality` above 0 to 1) answers the STL with `X-Volume-Before-Mm3` / `X-Volume-After-Mm3`, 422 with the engine's reason (too thin), and takes a new API key scope `hollow` (upload and hollow, nothing else) or a full-access key. Holecraft: the **server** forwards (`POST /api/trident/hollow?wall=&quality=` with the STL as `model/stl`, `x-file-name`; trident.ts `hollowRequest`, `postHollow`; the error messages say what to do for 401, 403, 404, 422), the web `hollowModel` (tridentApi.ts) calls it, and `useHollow` (useHollow.ts) does the whole job for the selection: `exportStlBytes(onlySelected(...))`, `hollowModel`, `importModelFile` (so the result is an ordinary imported mesh shape), `addMesh`, then the `replaceWithMesh` action. `replaceWithMesh` (core/replaceWithMesh.ts) puts the mesh where the old node's **world bounds** were (the STL is in the world, so nothing about the old node's own turn matters), keeps its colour and place in the list, and removes it and anything in it. Hollow is for the finished shape only: the result is a mesh. `whyNotHollow` (pure) gives the reason the button is off (no Trident, nothing or several selected, a hole, a wall out of range). Tests: `tridentRoutes.test.ts` (a fake Trident), `tridentApi.test.ts`, `useHollow.test.ts`, `replaceWithMesh.test.ts`, `e2e/web/resin.spec.ts` (a fake Trident in the test process that hollows what it is sent: the real STL export is checked for volume and bounds, and Undo).
- Reducer: the `resinHole`, `tilt` and `replaceWithMesh` actions (`reduceResin`, split out of `reduceEdit` to keep its complexity down), one undo step each. UI: `ResinPanel.tsx` between Properties and Arrange (the Edit tab in the compact layout), with the diameter as local state; the panel has an axe scan in a11y.spec.ts.

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
- **`filament_self_index` must be 1 to N, not the preset's "1" repeated**: the engine keeps an in-range value, loads the file, then dies slicing with two or more filaments
  (`ConfigOptionVector::set_with_restore_2(): invalid size found`). `projectSettings` writes it itself; loading a file is not proof it slices.
- Prove changes with `scripts/verify-orca-export.sh` (needs the local `mugenoesis/trident` image; runs
  `docker run --rm` containers only): Trident's reader AND the real engine must load 4- and 16-colour files and
  keep the filaments, and the 4-colour file must **slice** on the four-nozzle Snapmaker U1 (`scripts/lib/slice-check.sh`, through a throwaway Trident container). The engine re-arranges objects on re-export, so only filaments/colours are compared there.
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
- **SVG import** (geometry/import/svg.ts and svgSolid.ts): `parseSvg(text)` is a small hand-written reader (no DOM: it runs in the geometry worker, which has no DOMParser) that gives `SvgOutline[]` (closed polygons in mm with y up, plus the fill rule) from the filled `path/rect/circle/ellipse/polygon/polyline` of a drawing; curves are flattened in mm space after the transform (about 2 pieces a mm, 4 to 200 a curve), arcs become cubics. `svgToMesh(M, text, depth)` fills each outline with `CrossSection.ofPolygons(..., EvenOdd | NonZero)`, unions them and extrudes. The editor sends it to a geometry worker as the `svg` request (`WorkerEvaluator.svg`; `extrudeSvg` in apps/web/src/svgExtruder.ts keeps a worker of its own for imports), and `importModelFile` then normalises it like any model: the result is an ordinary imported mesh shape, resizable, **not** an editable outline (re-importing is how to change the drawing). Units: pixels and unitless count as mm (the common icon and CAD-export case) and `width`/`height` with an absolute unit against the `viewBox` set the scale. Not read: strokes, text, gradients, clip paths, masks, `use` (the error message says what to convert).
- **Up axis for imports**: `reorientMesh(mesh, 'y')` (core/meshShape.ts) turns a Y-up model a quarter about x, (x, y, z) to (x, -z, y), *before* `normalizeMesh`, so the size and the stored mesh are in the right frame; `importModelFile(file, deps, { up })` takes it, `ImportButton` has the dropdown (kept in localStorage via importUpAxis.ts, not in the design). It happens once at import: an already imported shape is turned with the rotation fields as before.
- The stored mesh is **normalised into the unit box** every shape is built in (x, y in ±0.5, z 0..1;
  `normalizeMesh`), and the shape's width/depth/height scale it. `normalizeMesh` also turns inside-out pieces round **per shell**
  (`faceShellsOutwards`, core/shells.ts): shells are groups of triangles sharing corners, and a shell enclosed by an odd number of
  others (a hollow's inner wall) must face inwards, so nesting is found with a box test then a ray-parity test. Checking only the
  whole model's volume missed files where some pieces were inside out and the rest outweighed them.
  `originalWidth/Depth/Height` params remember the real size (nothing uses them yet).
- Readers live in `packages/geometry/src/import/` (STL binary+text, OBJ, 3MF; `importMeshFile`).
  Compressed zips use the platform `DecompressionStream('deflate-raw')`, so no zip library. The format
  on disk/wire is `encodeMesh`/`decodeMesh` in core. Corners are welded; degenerate triangles dropped.
  The 3MF reader turns every triangle round for a placement that **mirrors** (negative determinant), as slicers do: files often
  build left and right parts from one mirrored model.
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

## Compact layout (touch screens and narrow windows)
- `useCompactLayout()` (compactLayout.ts) is true for `(max-width: 900px), (pointer: coarse)`, so every touch screen (phones, the Fold's
  inner screen, tablets) and narrow windows. `EditorView` puts `compact` on `.app`; **style the compact layout with `.app.compact`
  selectors, not a second copy of the media query**, so JS and CSS can't disagree. Markup that differs (`TopBar` arrows,
  `ViewToolbar`'s **Tools** menu, the tabs, the selection bar) takes a `compact` prop.
- The side panel becomes tabs (`PanelTabs`, `usePanelTab`, pure rule `tabAfterSelection`): parts are kept mounted and `hidden`, so a search
  or a half-typed name survives a tab change. **E2e tests that touch the panel on a touch or narrow viewport must call
  `openPanel(page, 'Objects' | 'Edit' | 'Colours' | 'Shapes')`** (helpers.ts; it does nothing on a desktop).
- `SelectionBar` (role `toolbar`, name "Selection") is the touch stand-in for Ctrl+D, H, Ctrl+G, Delete and Esc; `ViewportCanvas` shows
  it (`selectionBar` prop) only while no surface tool is on, since tools have their own bar at the bottom. Top-bar Group/Ungroup are
  `hidden` in the compact layout because the bar has them.
- In the compact **Tools** menu the items are `menuitemcheckbox`es; the active tool also stays on the bar as a pressed button with the
  tool's own name, so `getByRole('button', { name: 'Paint' })` still finds it once on.

## Colours (the wheel)
- `ColourField` (swatch + hex box) replaces `<input type="color">`; the hex box keeps the old accessible names (`Color` in Properties,
  `Change the chosen colour` in Colours) and applies a complete `#rrggbb` as it is typed, so tests can still `fill()` it.
- `ColourPicker` is the wheel (CSS conic + radial gradients; maths in core/colour.ts: `hexToHsv`, `hsvToHex`, `hueSatAtWheel`,
  `wheelPointOf`, `parseHexInput`, `FILAMENT_COLOURS`). A wheel or brightness drag previews on the shapes through the drag flow:
  `colourStart`, then `previewColor` / `previewPalette`, then `moveEnd` (one undo step) or `cancelDrag`; `useColourEdit` wires that.
  A preset or a typed colour is one ordinary edit.

## Squarer screens (4:3, tablets)
- `homeViewFor(aspect)` (core/camera.ts) backs the home camera off by 1.6 / aspect on windows squarer than 1.6 so the whole workplane
  shows; `CameraRig` uses it for the opening view (until anyone moves the camera) and for `goHome()`. Don't use `HOME_VIEW` directly for
  a live camera.
- The top bar wraps (`flex-wrap`) instead of overflowing; the side panel order is Shapes, Properties, Resin, Arrange, Colours, Objects so Properties
  is on screen without scrolling at 1024x768. `e2e/web/fourThree.spec.ts` measures this at 1024x768 and 800x600.

## Touch
- `Viewport` treats `pointerType === 'touch'` separately: one finger = the left-button behaviour, except
  that dragging empty space orbits (no marquee); a second finger abandons the one-finger action
  (keeping any move already made) and starts a pan + pinch (`twoFingerStep` in `touchGesture.ts`, pure
  and unit-tested). The canvas has `touch-action: none` so the browser doesn't scroll or zoom the page.
- Touch e2e (`e2e/web/touch.spec.ts`) needs `test.use({ hasTouch: true })` and sends real touches over
  CDP (`Input.dispatchTouchEvent`); without `hasTouch` Chrome silently drops them and tests pass vacuously.
  A selected shape has rotation handles at its centre that catch touches, so drag unselected shapes.
- **Select toggle** (view toolbar, state in `EditorView` as `multiSelect`, `Viewport.setMultiSelect`): makes every press additive (`e.shiftKey || multiSelectOn`) so a
  touch tap toggles, and `dragModeFor` (pressMode.ts, pure) lets a finger on empty space draw the marquee instead of orbiting; an additive press on a shape never
  moves it. The Objects rows use the same flag through `select` in Editor. A surface tool (ruler, workplane, edges) still wins the left button. `Select all`
  in the Objects list is the keyboard-free `Ctrl+A`. `e2e/web/fingers.ts` is the shared real-touch helper; taps land where shapes were *dropped* in the default view,
  and results are read with `expect.poll` (a touch is handled a moment after it is sent).
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
