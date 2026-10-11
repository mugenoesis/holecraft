# Open-Source, Offline 3D Modeler (Tinkercad-inspired): Project Plan

Name: **ezcad** (working name, chosen 2026-10-11).

Goal: an **open-source**, self-hosted, fully offline 3D modeling app. It is *inspired by*
Tinkercad's approachable workflow (drag-and-drop primitives, solid/hole booleans,
group/ungroup, align, workplanes, ruler) but is not a clone: it has its own name, look, and code.
It ships two ways:

1. **Docker container**: serves the app to any browser on the LAN.
2. **Linux desktop app**: AppImage / .deb / Flatpak, no network needed.

Both use **one codebase**. The app is a browser app where all geometry runs client-side in
WebAssembly. A thin server handles storage, and the desktop build embeds that same server.

---

## 1. Feature inventory (the capabilities we want, using Tinkercad as the reference point)

Grouped by priority. **P0** is the MVP, **P1** is "as approachable as Tinkercad", and **P2** is stretch.
Feature names below describe *capabilities*. Our own UI can name and arrange them differently.

### Editor viewport
| Feature | Pri |
|---|---|
| Blue grid workplane, adjustable size, mm/inch units | P0 |
| Snap grid setting (off, 0.1, 0.25, 0.5, 1, 2, 5, 10 mm) | P0 |
| Camera: right-drag orbit, middle/shift+right-drag pan, wheel zoom | P0 |
| View cube (click faces/edges/corners), Home view, Fit all (F) | P0 |
| Perspective / orthographic toggle | P0 |
| Shadow/projection of selected object on workplane | P1 |
| Transparent mode for holes / "show all holes" | P1 |

### Shapes panel
| Feature | Pri |
|---|---|
| Basic: Box, Cylinder, Sphere, Cone, Roof, Round Roof, Wedge, Pyramid, Half Sphere, Torus, Tube, Polygon, Paraboloid, Star, Ring, Heart, Icosahedron, Box Hole, Cylinder Hole | P0 (box/cyl/sphere/cone/roof/wedge/torus/tube), P1 rest |
| Per-shape parameters in Shape inspector (sides, radius, bevel, segments, steps, twist) | P0 |
| Text & numbers (font, height, bevel) | P1 |
| Scribble (freehand 2D → extrude) | P2 |
| Shape generators (user-written parametric JS shapes, sandboxed) | P2 |
| User "saved shapes" (your own designs reusable as shapes) | P1 |
| Category dropdown + search | P1 |

### Manipulation (the core UX, where most polish effort goes)
| Feature | Pri |
|---|---|
| Drag object along workplane (with snap), black cone handle to lift Z | P0 |
| Corner/side white handles to resize, top handle for height | P0 |
| Shift = uniform scale, Alt = scale from center | P0 |
| Click a dimension label → type exact value (mm) | P0 |
| Rotation arcs on 3 axes, 22.5° snaps on outer ring, 1° on inner | P0 |
| Arrow-key nudge (Shift ×10), Ctrl+↑/↓ for Z | P0 |
| Drop to workplane (D) | P0 |
| Click / Shift-click / marquee multi-select | P0 |
| Lock, hide, show-all | P1 |

### Toolbar / operations
| Feature | Pri |
|---|---|
| Undo / redo (unlimited, in-session) | P0 |
| Copy / paste / Duplicate & Repeat (Ctrl+D repeats last transform) | P0 (dup), P1 (repeat) |
| Solid ↔ Hole toggle, color picker, "multicolor" groups | P0 |
| Group (union solids − union holes) / Ungroup (non-destructive) | P0 |
| Align (L): bounding-box align handles per axis, align to a key object | P1 |
| Mirror / Flip (M): flip arrows per axis | P1 |
| Workplane tool (W): place temporary workplane on any face | P1 |
| Ruler (R): place on face, live dimensions & distances | P1 |
| Cruise (C): drag object across faces of other objects | P2 |
| Notes (annotations) | P2 |
| Intersect group mode | P2 |

### Sketch workspace (newer Tinkercad features)
| Feature | Pri |
|---|---|
| 2D sketch: lines, arcs, circles, polygons, splines | P2 |
| Extrude sketch | P2 |
| Revolve sketch around an axis | P2 |

### Files & projects
| Feature | Pri |
|---|---|
| Dashboard: list designs with thumbnails, rename, duplicate, delete, folders/collections | P0 (list), P1 (collections) |
| Autosave + design version history | P0 (autosave), P1 (history) |
| Import STL, OBJ, 3MF; import SVG (extrude) | P0 (STL), P1 rest |
| Export STL, OBJ, 3MF, GLB; SVG (top projection for laser cutting) | P0 (STL/OBJ), P1 rest |
| Share / export design as a portable file (`.ezcad`) | P1 |

### Out of scope for v1 (separate future projects)
- **Circuits** (electronics + Arduino simulation): this is a whole product of its own.
- **Codeblocks** (Blockly-driven geometry): feasible later on top of the same shape API (P3).
- **Sim Lab** (physics): possible later with Rapier WASM (P3).
- **Bricks / Blocks** (LEGO/Minecraft voxel views) (P3).
- Classrooms, social gallery, accounts beyond simple local login.

---

## 2. Architecture

```
┌──────────────────────── Browser / Electron renderer ────────────────────────┐
│  React UI (toolbar, shapes panel, inspector, dashboard)                    │
│        │                                                                    │
│  Editor core (pure TS): Document model, Commands, Undo/Redo, Selection     │
│        │                                      │                             │
│  Viewport engine (three.js, imperative):     Geometry worker (Web Worker): │
│   camera, grid, gizmos, picking, snapping      manifold-3d (WASM) CSG,      │
│                                                primitive generators, text, │
│                                                export (STL/3MF/OBJ/GLB)    │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ REST (JSON + binary)
┌──────────────────────────────┴──────────────────────────────────────────────┐
│  Server (Node + Fastify): static files, /api/designs, thumbnails, assets   │
│  Storage: SQLite (metadata) + filesystem (design JSON, thumbnails, imports)│
└─────────────────────────────────────────────────────────────────────────────┘
   Docker: server runs as the container's process, port 8080, volume /data
   Desktop: Electron main process starts the same server on 127.0.0.1:<random>
            and opens a BrowserWindow pointed at it. Data goes in ~/.local/share/ezcad
```

### Why these choices
- **TypeScript everywhere**: one language for UI, core, server, and desktop shell.
- **three.js** for rendering. It is mature, and WebGL2 is everywhere. The viewport is written
  as an imperative engine instead of react-three-fiber, because gizmo dragging and picking need
  tight per-frame control. React only drives the 2D chrome around it.
- **manifold-3d (WASM)** for booleans. It guarantees manifold (printable) output, it is very fast,
  and OpenSCAD has adopted it as its CSG backend. It also provides `CrossSection` for 2D
  extrude/revolve (text, SVG, sketch). It runs in a Web Worker so the UI never blocks.
  Note that WASM objects must be `.delete()`d manually, so the worker owns their lifetimes.
- **Electron over Tauri** for the desktop app. Tauri on Linux uses WebKitGTK, whose WebGL and
  WASM-threads performance is inconsistent across distros. Electron bundles Chromium, so the
  desktop app and the Docker version render identically. Size (~100 MB) is an acceptable cost.
  Revisit Tauri later if size matters.
- **Same server in both targets**, so there is exactly one storage code path to test.
- **SQLite + files** need zero extra services, so the Docker image is a single container.

### Document model (the heart of the app)
```ts
type NodeId = string;
interface BaseNode { id: NodeId; name: string; transform: Mat4; hidden: boolean; locked: boolean;
                     mode: 'solid' | 'hole'; color: string; }
interface ShapeNode extends BaseNode { kind: 'shape'; shapeType: string; params: Record<string, number|string|boolean>; }
interface MeshNode  extends BaseNode { kind: 'mesh'; meshRef: string; }          // imported STL etc.
interface GroupNode extends BaseNode { kind: 'group'; children: NodeId[]; op: 'union' | 'intersect';
                                       multicolor: boolean; }
interface Design   { version: number; units: 'mm'|'in'; grid: GridSettings; nodes: Record<NodeId, Node>;
                     roots: NodeId[]; workplane?: Mat4; ruler?: RulerState; }
```
- Group semantics, matching Tinkercad: `union(solid children) − union(hole children)`. Ungroup
  restores the children unchanged, because the CSG result is a **derived cache** and is never stored.
- Geometry cache: key = hash(node subtree), value = mesh. Editing one child recomputes only its
  ancestors' booleans.
- Every mutation goes through a **Command** (`MoveNodes`, `SetParam`, `Group`, ...) using Immer
  patches, which gives undo/redo, autosave diffs, and a future collaboration hook for free.
- On-disk format: versioned JSON with migrations. The portable `.ezcad` file is a zip of the JSON,
  any imported meshes, and a thumbnail.

### Shape definitions (extensible, also powers Shape Generators later)
```ts
defineShape({
  id: 'tube', name: 'Tube', category: 'basic', icon: 'tube.svg',
  params: { radius: {type:'number', default:10, min:0.1}, wall: {...}, sides: {type:'int', default:64, min:3, max:64}, bevel: {...} },
  defaultSize: [20, 20, 20],
  build: (p, M) => M.Manifold.cylinder(...).subtract(...),   // runs in worker, receives manifold module
});
```
User shape generators use the same API inside a sandboxed worker with no DOM or network access.

---

## 3. Repository layout (pnpm monorepo)

```
apps/
  web/          Vite + React UI, viewport engine, editor screens, dashboard
  server/       Fastify API + static hosting, SQLite (better-sqlite3), migrations
  desktop/      Electron main/preload, electron-builder config (AppImage, deb, rpm), Flatpak manifest
packages/
  core/         Document model, commands, undo, selection, snapping math (no DOM, 100% unit-testable)
  geometry/     Worker entry, manifold wrapper, primitive builders, text (opentype.js), SVG import,
                exporters (STL/OBJ/3MF/GLB/SVG)
  shapes/       Built-in shape definitions + icons
  ui-kit/       Buttons, panels, icons (own artwork)
docker/
  Dockerfile    multi-stage: build → node:22-slim runtime, non-root, /data volume, healthcheck
  compose.yaml
e2e/            Playwright tests (Chromium with SwiftShader WebGL)
```

---

## 4. Phased roadmap

Rough sizing assumes one full-time developer (with AI assistance). Each phase ends with
something runnable.

| Phase | Deliverable | Size |
|---|---|---|
| **0. Skeleton** | Monorepo, Vite app with an empty three.js canvas, Fastify server, Dockerfile running it, Electron shell loading it, CI (lint, test, build image + AppImage) | 1 wk |
| **1. Viewport** | Workplane grid, Tinkercad camera controls, view cube, home/fit, ortho toggle, drag a Box/Cylinder/Sphere from the panel onto the grid | 2 wk |
| **2. Manipulation** | Selection (click, shift, marquee), move with snap, lift cone, resize handles with live dimension labels + typed input, rotation arcs with snaps, nudge keys, drop-to-plane, undo/redo, inspector (color, solid/hole, params) | 3–4 wk |
| **3. CSG** | Geometry worker with manifold, Group/Ungroup with holes, cached subtree evaluation, hole transparency rendering, delete/copy/paste/duplicate | 2 wk |
| **4. Persistence + I/O** | Dashboard, autosave, thumbnails (offscreen render), STL/OBJ import, STL/OBJ/3MF/GLB export | 2 wk |
| ***MVP checkpoint*** | Usable for real 3D-print design, both Docker and desktop | ~10–11 wk |
| **5. Tinkercad tools** | Align, Mirror, Duplicate & Repeat, Workplane tool, Ruler, lock/hide, multicolor groups | 3 wk |
| **6. Shape library** | Remaining basic shapes, Text (bundled OFL fonts), SVG import, saved user shapes, search/categories | 2–3 wk |
| **7. Sketch** | 2D sketch workspace, extrude, revolve, Scribble | 3–4 wk |
| **8. Packaging & polish** | Flatpak, .deb/.rpm, multi-arch Docker (amd64/arm64), optional login for multi-user Docker, version history, keyboard-shortcut sheet, touch support, i18n scaffolding | 2 wk |
| **9. Stretch** | Shape Generators (sandboxed JS), Cruise, Intersect, Codeblocks (Blockly), Sim Lab (Rapier), Bricks view | open |

---

## 5. Key technical details & risks

| Risk / detail | Mitigation |
|---|---|
| **Gizmo UX quality** is what makes this class of tool feel easy, and it is the largest effort | Treat Phase 2 as the core of the project. Write our own interaction spec per handle (informed by usability, not by copying), and add Playwright tests that drive mouse drags and assert transforms |
| CSG slow with many holes / high-poly spheres | manifold is fast. Cache per subtree, run in a worker, show the previous mesh while computing, cap default segment counts like Tinkercad does |
| Floating-point/coplanar booleans failing | manifold guarantees manifold output. Avoid exact coplanar defaults (holes extend 0.001 mm), as Tinkercad implicitly does |
| WASM memory leaks (manual `.delete()`) | All manifold objects live only in the worker behind a handle registry, with leak checks in tests |
| Precise snapping (grid, face-to-face, align) | Pure math in `packages/core`, unit-tested independently of rendering |
| Thumbnails for dashboard | Render offscreen in the browser on save and upload PNG. No server-side GL needed |
| Desktop rendering differences | Electron's bundled Chromium = identical to the Docker/web build |
| Fonts for Text shape offline | Bundle a set of SIL OFL fonts (e.g. Roboto, Noto Sans, Lobster, Source Code Pro) |
| Large imported meshes | Size limits, mesh decimation warning, and storing meshes as binary blobs instead of JSON |

## 6. Docker deployment (target)
```yaml
services:
  ezcad:
    image: ezcad:latest
    ports: ["8080:8080"]
    volumes: ["/mnt/user/appdata/ezcad:/data"]
    environment:
      - EZCAD_AUTH=none       # v1: no auth (LAN appliance)
      - PUID=99               # Unraid-friendly user mapping
      - PGID=100
```
No outbound network calls at runtime. All fonts, icons, and WASM are bundled in the image.
An Unraid Community Apps template can follow.

## 7. Desktop app (target)
- `electron-builder` → `ezcad-x.y.z.AppImage`, `.deb`, `.rpm`; Flatpak via `flatpak-builder`.
- Main process: start Fastify on `127.0.0.1:0` with data dir `$XDG_DATA_HOME/ezcad`, open
  the window, and add native menus (File > Import/Export use native dialogs via IPC).
- Associate the `.ezcad` file type, so double-clicking opens the design.

## 8. Testing strategy
- **Unit (Vitest)**: core commands, undo/redo, snapping, group semantics, file migrations.
- **Geometry golden tests**: build each shape and boolean scenario, then assert volume, bbox,
  manifoldness, and triangle count against stored values.
- **E2E (Playwright)**: drag shape in, resize via handle, group with hole, export STL, reload, and
  confirm persistence. Run against both the Docker image and the Electron build.
- **Visual regression**: screenshot the viewport for key scenes.

## 9. Open-source identity, licensing & prior art
- **Inspired by, not a copy.** The general idea (primitives, holes, group) is common CAD practice.
  We build our own name, logo, icons, color theme, and code. We don't use the Tinkercad name,
  artwork, or anything taken from their site. Mentioning "Tinkercad-inspired" in the README is fine.
- **Project license**: **AGPL-3.0** (decided). It keeps hosted forks open,
  which suits a self-hosted web app.
- **Dependencies** are all permissive and compatible with either choice: three.js (MIT),
  manifold-3d (Apache-2.0), opentype.js (MIT), fonts (SIL OFL), Electron (MIT), Fastify (MIT).
- **Repo hygiene from day one**: LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT, issue templates,
  CI badges, docs site, and a public roadmap based on §4.
- **Prior art to review before starting** (possible collaboration instead of duplication):
  - *CaDoodle*: a local, drag-and-drop, Tinkercad-inspired desktop app (Java) for Linux, Windows,
    and Mac. It is a desktop app, not browser- or Docker-based.
  - *Akse*: a browser-based primitive modeler for kids, listed as open source and self-hostable.
  - *OpenSCAD / openscad-playground*: code-based CSG. Good reference for manifold-in-WASM usage.
  - None of these found so far combines a browser UI, Docker self-hosting, a desktop build, and
    Tinkercad-level ease. That combination is this project's niche.

## 10. Decisions (2026-10-11)
1. **Name**: ezcad (working name).
2. **License**: AGPL-3.0.
3. **Docker auth**: none in v1 (single-user LAN appliance). Revisit later.
4. **Desktop shell**: Electron.
5. **Scope**: v1 is the 3D design editor only. Codeblocks, Sim Lab, and Circuits are deferred.
