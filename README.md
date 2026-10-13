<p align="center">
  <img src="branding/logo.jpg" alt="Holecraft logo" width="480">
</p>

# Holecraft

**Open-source, offline, browser-based 3D modeling for makers.**

Holecraft is an approachable solid modeler in the spirit of Tinkercad: drag primitive shapes onto a
workplane, turn some into holes, group them, and export a printable model. It is an
independent project with its own code and design, and it runs entirely on your own hardware:

- **Docker**: self-host it and open it from any browser on your network.
- **Linux desktop app**: AppImage or .deb that works fully offline.

> **Status: early development (Phase 4d of the roadmap done).** You can keep a library
> of designs that save automatically, navigate a 3D workplane, add boxes, cylinders, spheres, cones, pyramids, wedges, roofs and domes,
> select, move, resize, lift and rotate them, edit their properties, make shapes into holes and
> group them to cut real holes out of solids, undo/redo, **import** existing models (STL, OBJ,
> 3MF) and **export for 3D printing** (STL, OBJ, 3MF). Phase 5 tools (align, mirror, ruler...) come next.

## Colours and multi-colour printing

Every design has a **palette** of filament colours (the **Colours** panel): four to start, the usual
multi-material setup, up to sixteen, which is what a Bambu printer can address. Click a colour to paint the
selected shapes with it. **Change the chosen colour** and everything painted with it changes too, so a colour
always means "this filament". **Add colour** and **Remove colour** manage the palette; shapes keep their colour
if its slot is removed (they print with the nearest remaining filament). Shapes can still be any colour via the
Color field in Properties; they print with the nearest palette colour.

**Export as 3MF for OrcaSlicer** writes the palette as the file's filament list and gives each object the
filament (numbered from 1) of its colour, in the form OrcaSlicer, Bambu Studio and Trident read for
multi-material projects. Only filament settings are written (at OrcaSlicer's generic PLA values), never your
printer or print profile. It was checked against the real OrcaSlicer engine (`scripts/verify-orca-export.sh`),
which loads it and keeps every object's filament and all the colours, for 4 and for 16 filaments. Painting
parts of a single model (several colours on one object) is planned, not built yet.

## On a phone or tablet

The editor works from a phone's browser (open the server's address on your home network). On a narrow
screen the 3D view takes the top of the screen, the top bar wraps onto a few rows, and the shapes,
properties and object list sit in a short scrolling strip below. Menus and messages open across the
full width, and buttons, fields and the resize/rotate handles are larger on touch screens.
Camera: drag one finger on empty space to orbit, two fingers to pan, pinch to zoom.

## Importing models

**Import** in the top bar brings in an STL (binary or text), OBJ or 3MF file (3MF files, including
the compressed ones slicers write, are read in the units they were saved in and converted to
millimetres). The model becomes a shape named after the file, resting on the workplane at its real
size, and from then on it is like any other shape: move, resize, rotate, recolour, duplicate, turn it
into a **hole**, group it, export it.

- **Which way is up.** Files are read as Z up (CAD, STL and 3MF files). Many OBJ files, from Blender and game tools, have Y as the height and would arrive lying on their side: set the **Up axis** next to the Import button to **Y up** first and the model is stood upright as it is read (a quarter turn, not a mirror, so its width, depth and height are right straight away). The choice is remembered in your browser.
- A model has to be **watertight** (a closed surface) to be cut or to cut something. If it has holes in
  its surface it still imports and moves, but grouping it with a hole or exporting it as a group says
  which model is the problem.
- Limits: files up to 100 MB, about a million triangles, and no bigger than 1000 mm in any direction.
  A model with no thickness is refused. Several objects in one file are joined into one shape.
- Colours and materials in the file are not kept (imports are grey; recolour them). A model's data is
  stored once on the server, in `<data folder>/meshes/`, so duplicating it costs nothing. Files for
  models you have deleted are not cleaned up yet.

## Exporting for printing

The **Export** button in the top bar downloads the whole design as (tick **Only the selected** in the menu, shown while something is selected, to export just those):

| Format | Good for |
|---|---|
| **STL** | Slicers and printing. Binary, in millimetres |
| **OBJ** | Other 3D programs. Text, in millimetres, one named object per shape |
| **3MF** | Modern slicers. Keeps each object's name and colour, in millimetres |
| **3MF for OrcaSlicer** | Multi-colour printing in OrcaSlicer, Bambu Studio and Trident: each object is assigned the filament of its colour (see below) |

What you get is what you see: holes are cut out of the solids they share a group with, every
shape is placed where it sits (moved, lifted, turned), and each top-level shape or group becomes its
own object. Holes that are not in a group with a solid, hidden shapes and anything the holes cut away
completely are left out. The file is named after the design. The files have been checked with an
independent mesh library (`scripts/verify-exports.sh`): closed, consistently wound, the right volume.
In the desktop app you choose where to save; set `HOLECRAFT_DOWNLOAD_DIR` to save straight into a folder.

## Your designs

Holecraft opens on a list of your designs. **New design** makes one and opens it; click a name to
open it, or use **Rename**, **Duplicate** and **Delete** (which asks first). Everything you do is
**saved automatically** a moment after you stop changing things, and the top bar shows
*Saved*, *Unsaved changes*, *Saving…* or *Couldn't save* (it keeps your work on screen and retries
until the server answers). Change a design's name in the top bar. Each design on the list shows a small
**picture** of itself (taken from the usual angle, without the grid, a couple of seconds after you stop
editing; designs with nothing in them show a placeholder). Undo history is not kept between
sessions. Designs are plain JSON files, one per design, in `<data folder>/designs/`, so they are
easy to back up or copy.

## Using the editor

| Action | How |
|---|---|
| Add a shape | Drag it from the Shapes panel onto the workplane, or click it (or press Enter) to add at the centre. Drops snap to the grid. The panel has Box, Cylinder, Sphere, Cone, Pyramid, Wedge (tallest at the back), Roof (ridge runs front to back), Round Roof (a half cylinder lying along the depth) and Half Sphere and Hexagon (a regular one at 20 × 17.32 mm to start), all stretching to any size like a box; and the **Tube** (a hole right through it, with a **Wall thickness**) and **Torus** (a ring, 30 × 30 × 10 mm to start, with a **Ring thickness**) and **Star** (five tips, 20 × 19.02 × 10 mm to start, with an **Inner radius**) and **Polygon** (a regular one with 3 to 32 **Sides**, 5 to start, filling a 19.02 × 18.09 × 20 mm box), and the **Threaded Rod** and **Threaded Hole** (real ISO metric threads, M2 to M12 coarse pitch, right-handed, picked with **Size**; a hole also has a **Fit** of Tight, Normal or Loose, which opens it by 0.1, 0.2 or 0.4 mm on every side so a screw of the same size turns in it). **A thread keeps its real size:** the diameter comes from the Size and cannot be dragged or typed (only the corner-free height and lift handles show), only the **Length** changes, and the thread stays exact at any length. A **Bolt** is a thread with a head on it (**Head**: Hex or Socket cap, with its hex socket; the ISO 4017 and 4762 sizes), and its **Length** is the shank under the head, so an M5 bolt of 20 mm is 23.5 mm tall with a hex head. A **Nut** is the ISO hex for its size, 4 mm thick for an M5 (change its Length to make a thicker or thinner one), with the thread of the same Size through it, opened by its **Fit**. A nut and a bolt of the same size mate: the nut's thread starts at the same height as the bolt's, so slide it along the bolt by a whole number of pitches (or turn it with Rotate Z). **Simple threads** (a button in the view toolbar, shown once the design has a thread, remembered in your browser) draws every thread as a plain cylinder at its pitch diameter while you edit, so long threads stay quick on a slow device; groups with threaded holes are worked out from the cylinder too. It only changes how things are drawn: saving and every export always use the real thread. A **Washer** is the flat ISO 7089 ring for its Size (an M5 is 10 mm across, 1 mm thick; its Length can be changed). A **Standoff** is a hex spacer with the thread of its Size in it and a **Fit**: **Female-female** has the thread right through it (a long nut), **Male-female** has a stud (twice the thread's diameter long) under its body and a thread blind into the other end, going down to a diameter above the body's bottom. Its **Length** is the body (10 mm to start), not counting the stud, and it can't be shorter than a nut's thickness (female) or twice the thread's diameter (male). The stud's thread starts at the same height as a bolt's so a nut goes on it, and a screw seats in the blind hole when it is lowered a whole number of pitches. A group holding a thread cannot be resized. The Shapes panel shows five rows and scrolls for the rest. The other settings (shown in mm for the size they are now) stretch evenly with the shape when you resize it, like the rest of it, so a tube made twice as big has a wall twice as thick and nothing about it breaks. A too-big value is limited to what fits, and Properties says so |
| Select | Click a shape (or its row in the Objects list). Shift-click adds or removes. Drag a box around shapes to select several. `Ctrl+A` selects all, `Esc` clears. **On a touch screen** (no Shift key): turn on **Select** in the view toolbar, then every tap on a shape or an Objects row adds it to the selection (or takes it out again), and a finger dragging on empty space draws the selection box instead of orbiting; shapes don't move while it is on. Turn it off to go back to normal. **Select all** in the Objects list does what `Ctrl+A` does |
| Move | Drag a shape. It snaps to the grid and stays on the workplane. Dragging one of several selected shapes moves them all |
| Resize | Select one shape and drag a handle. Corner handles resize width and depth, side handles one dimension, the top round handle the height. The opposite corner or side stays fixed, and the edge you drag snaps to the grid. Hold `Shift` to scale all three dimensions together, `Alt` to resize about the centre. The size shows live while you drag |
| Rotate | Select one shape and drag a coloured ring handle: red turns it about the X axis, green about Y, blue about Z. It turns about the shape's centre and snaps to 22.5° (hold `Shift` for 1° steps). The angle shows live while you drag. You can also type **Rotate X / Y / Z** in degrees in the Properties panel |
| Lift | Drag the black cone above a shape to raise it off the workplane. Press `D` (or **Drop to workplane**) to put it back down |
| Nudge | Arrow keys move the selection along the nearest workplane axis by the grid step (`Shift` for ten times as far) |
| Edit properties | Select a shape, then type a name, position (X, Y, Z), size (width, depth, height) or color in the Properties panel. Press Enter or click away to apply; invalid values are rejected |
| Tilted shapes | A shape tipped about X or Y has no resize or lift handles (rotate it back to use them); its X, Y and Z fields show its base point, which moves when it tips. **Drop to workplane** rests its lowest corner on the plane. Shapes turned only about Z keep every handle |
| Solid / hole | Choose **Solid** or **Hole** under Type in the Properties panel (it applies to everything selected). A hole on its own is drawn as a pale see-through ghost, and keeps its colour for when you turn it back into a solid |
| Cut a hole | Make a shape a **Hole**, position it where it overlaps a solid, then select both and **Group** them: the group becomes one solid with the hole cut out of it. Several solids in a group are joined together, and several holes all cut. Ungroup to get the separate shapes back, ghosts and all |
| Group | Select two or more shapes and press **Group** or `Ctrl+G`. A group moves, nudges, duplicates, deletes, recolours and drops as one. A group is drawn as a single merged shape in the group's colour. Clicking any shape in it selects the whole group. Groups can be nested. A selected group has the three rotation rings (and Rotate X/Y/Z fields) and turns about the middle of what it holds, and the same resize and lift handles as a shape, working on the box around its contents: dragging one stretches every shape inside along with it, so the contents fill the new box exactly. Properties also has **Width**, **Depth** and **Height** fields for the group's box (along its own axes): typing one stretches everything inside the same way, keeping the middle and the base, as one undo step. Resizing needs every shape inside to be turned in quarter turns (0, 90, 180, 270 degrees) within the group and the group itself to be only turned about the vertical; otherwise the handles are hidden and the size fields are switched off with the reason (it can still be turned and moved). A group holding a thread cannot be resized either, since a thread keeps its real size |
| Duplicate and repeat | `Ctrl+D` copies the selection. Move, lift or turn the copy, then press `Ctrl+D` again: you get another copy that has had the same step applied again, and again on each press, so a row, a ring or a staircase takes a few key presses. Select something else and `Ctrl+D` starts over with a plain copy. Sizes are not part of the step |
| Hide and lock | Each row in the **Objects** list has a padlock and an eye. **Hide** takes an object out of the view, out of picking, Select all, Fit and the exports (and deselects it); **Show all** appears whenever something is hidden. **Lock** keeps an object where it is: moving, nudging, resizing, turning, recolouring, grouping and deleting skip it, but you can still select it and unlock it. A group's row has a **▸** that opens it to list what it holds, each part with its own padlock and eye (clicking a part's name selects its group). A hidden part is left out of the group's merged shape and of the exports, and a hidden hole does not cut. Both are saved with the design and are undoable |
| Ruler | **Ruler** in the view toolbar, or `R`: click a face of a shape or the workplane to start, hover to see a live distance and the offset on each axis (in your units), click again to pin it, click a third time to start over. On the bare workplane points snap to the grid; on a shape they are exact to 0.01 mm. While it is on, the left button no longer selects or moves (dragging orbits). `Esc` clears it, then turns it off. Nothing is saved or exported |
| Workplane tool | **Workplane** in the view toolbar, or `W`, then click a face of a shape: a gridded amber square appears on it and new shapes (a click in the Shapes panel, or dragging one into the view) stand on that face, base on the surface and height going out of it, snapped to a grid measured from where you clicked. Click the floor with the tool on, or the **Floor** button, to go back. Undersides can't be built on, and a shape that would end up below the floor is lifted. The plane is not saved with the design. With a plane chosen, the **Arrange** panel has **Stand on plane**: select one shape or group and it is put on that face the way a new shape is (base on the surface, height going out, turned to match, under where its middle was, lifted if that would go below the floor), as one undo step. Dragging an existing shape still moves it on the floor |
| Chamfer | Boxes and cylinders have a **Chamfer** field in Properties: a 45 degree bevel of that many mm, on **All** edges, only the **Top** ones, or only the **Bottom** ones (handy against elephant's foot when printing). The outside size stays the same and the bevel stays the same size in mm when you resize the shape; if it no longer fits it is limited (and Properties says so) until the shape is big enough again. Chamfered shapes cut, group, turn and export like any other. 0 removes it |
| Countersink | A **cylinder set to Hole** has a **Countersink** field in Properties: how far (mm) its opening widens on every side, a 45 degree flare so a screw head sits flush, at the **Top**, **Bottom** or **Both** ends (Top to start). It cuts like any hole in a group, and shows on the hole's ghost before you group it. It is limited to the hole's length (half of it each when both ends flare, and Properties says so). It replaces a chamfer typed on the same hole, which Properties notes. 0 removes it |
| Edge tool | Select one solid shape or group (including one with holes cut in it), then **Edges** in the view toolbar, or `E`: its sharp edges are drawn over the view. Click an edge to choose it (`Shift`-click adds or drops more; on a touch screen every tap adds), or **All outer edges**. Pick **Chamfer** or **Round** and a **Size** in mm (it starts at about 5% of the part, on the grid) and the result shows straight away. **Apply** keeps it as one undo step; **Cancel** or `Esc` leaves the part as it was (and still selected); a second `Esc` turns the tool off. Treated edges show dashed; choose one to change its size or kind, or **Remove** it. Resizing a treated shape or group (typing, or dragging a handle) stretches its chamfers and rounds with it, at the same size. If another edit takes away a treated edge, a notice says so instead of cutting the wrong place. Inside (concave) corners can't be filled yet |
| Align | Select two or more objects and use the **Arrange** panel: for X, Y or Z, line up their low edges, centres or high edges at wherever the whole selection reaches. Locked objects stay put. One undo step |
| Flip | **Flip X / Y / Z** in the Arrange panel mirrors the selection across a plane through the middle of everything selected (one object flips in place, several swap sides). Groups flip with their contents. Imported models cannot be flipped yet (the buttons are off) |
| Ungroup | **Ungroup** or `Ctrl+Shift+G` opens a group one level, leaving every shape exactly where it was. Ungrouping a hole group turns its contents into holes |
| Duplicate / delete | `Ctrl+D` / `Delete`, or the buttons in the Properties panel |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), or the Undo and Redo buttons. A whole drag is one step |
| Orbit | Right-drag. **Touch:** drag one finger on empty space |
| Pan | Middle-drag, or Shift + right-drag. **Touch:** slide two fingers |
| Zoom | Mouse wheel. **Touch:** pinch with two fingers |
| Home view | **Home** button or the `Home` key |
| Fit all | **Fit** button or `F` |
| Perspective / orthographic | **Ortho** toggle |
| Look from a side | Click a visible face of the view cube, or use the **View…** menu |

## Run it

### Docker

```bash
docker compose -f docker/compose.yaml up -d --build
# open http://<host>:8080
```

Designs are stored in the `/data` volume. Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `HOLECRAFT_PORT` | `8080` | HTTP port |
| `HOLECRAFT_HOST` | `0.0.0.0` | Bind address |
| `HOLECRAFT_DATA_DIR` | `/data` | Storage directory |

There is no authentication yet, so anyone who can reach the port can read, change and delete every
design. Only expose Holecraft on a trusted network.

**Storage API** (used by the app; handy for backups and scripts): `GET /api/designs`,
`POST /api/designs`, `GET|PUT|PATCH|DELETE /api/designs/:id` and `POST /api/designs/:id/duplicate`.
Everything sent to it is validated, and a design larger than 8 MB or with a broken structure is
refused.
Serve it at the root of a host or subdomain (`holecraft.example.lan`). Path prefixes such as
`example.lan/holecraft` are not supported yet.

**Unraid:** set `user: "99:100"` and map `/mnt/user/appdata/holecraft` to `/data` (see
`docker/compose.yaml`).

### Desktop (Linux)

```bash
scripts/package-desktop.sh
# → apps/desktop/release/Holecraft-<version>-x86_64.AppImage and Holecraft-<version>-amd64.deb
```

The desktop app stores designs in `$XDG_DATA_HOME/holecraft` (usually `~/.local/share/holecraft`).

## Develop

Requirements: Node 22+, npm, and Docker (for integration tests and packaging).

```bash
npm install
npm run dev          # server on :8080 + Vite on :5173 (open http://localhost:5173)
npm test             # unit tests (Vitest)
npm run test:e2e     # integration tests (Playwright, in Docker)
npm run check        # full gate: typecheck + unit + build + web e2e
FULL=1 npm run check # + Docker smoke test + desktop package + desktop e2e
```

Holecraft is developed **test-first**. Every feature lands with unit tests, plus integration tests
where it touches the UI, server, or packaging. See [AGENTS.md](AGENTS.md) for conventions.

### Layout

```
apps/web        Browser editor: React UI + imperative three.js viewport (Vite)
apps/server     Fastify server: serves the web app and the storage API (bundled with esbuild)
apps/desktop    Electron shell that embeds the same server on 127.0.0.1
packages/core   Document model and editor logic, with no DOM dependencies
e2e/            Playwright integration tests (web + packaged desktop app)
docker/         Dockerfile and compose file
scripts/        Repeatable dev/test/packaging tasks
```

### Scripts

| Script | Purpose |
|---|---|
| `scripts/check.sh` | Pre-commit gate (`FULL=1` for packaging too) |
| `scripts/install-hooks.sh` | Use the git hooks in `.githooks/` (pre-commit: lint, knip, typecheck, unit tests; pre-push: `scripts/check.sh`, with `FULL=1` / `AUDIT=1` for more). Stands in for CI while GitHub Actions is unavailable |
| `scripts/e2e.sh` | Playwright tests in the Playwright Docker image |
| `scripts/docker-smoke.sh` | Build the image, run it, verify health and non-root user |
| `scripts/package-desktop.sh` | Build the AppImage and .deb (in a Debian container) |
| `npm run knip` | Unused files, exports and dependencies (fails the gate) |
| `npm run coverage` | Unit tests with coverage; per-package floors in `vitest.config.ts` fail the gate, HTML report in `coverage/` |
| `scripts/audit.sh` (`npm run audit:deps`) | Dependency vulnerabilities: anything that ships must be clean, build tools are only reported |
| `scripts/docker-lint.sh [image]` | hadolint on the Dockerfile and trivy on its configuration and the built image (HIGH/CRITICAL with a fix fail it) |
| `npm run lint` / `npm run format` | Biome: check formatting, lint rules and the complexity limit (15 per function); `format` fixes what it can. `scripts/check.sh` runs `lint` first |
| `scripts/verify-orca-export.sh` | Write the OrcaSlicer-flavoured 3MF and have the real OrcaSlicer engine (from the local Trident image, in throwaway containers) load it, checking it does not crash and keeps every object's filament and the palette |
| `scripts/update-orca-filament-defaults.sh` | Regenerate `orcaFilamentDefaults.ts` (the per-filament project settings) from the real engine; run after changing the Trident/OrcaSlicer version |
| `scripts/verify-exports.sh` | Write sample STL/OBJ/3MF files with the real writers and check them with an independent mesh library (trimesh, in a Python container) |
| `scripts/deploy-local.sh` | Rebuild the Docker image from `origin/main` and restart the local test container (default port 8200, keeps its data volume) |
| `scripts/screenshot.sh` | Screenshot a running instance with software WebGL (`DEMO=1` adds shapes, `VIEW=top` picks a view, `CLICK=0,0` selects, `PRESS=Control+a` presses keys) |
| `scripts/tool-shots.sh <url> [out-dir]` | Drive the ruler, the Workplane tool and the Edge tool in a real browser and save screenshots (ruler line, plane marker and a shape on a top face and on a wall, edges hovered, chosen, previewed and applied) for looking at what the browser tests only check by numbers |
| `scripts/make-icon.sh` | Regenerate the app icons from the cube mark cropped out of `branding/logo.jpg` |

## License

[AGPL-3.0](LICENSE). If you run a modified Holecraft as a network service, you must share your
changes. Tinkercad is a trademark of Autodesk, Inc. Holecraft is not affiliated with Autodesk.
