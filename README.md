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

> **Status: early development (Phase 4a of the roadmap done).** You can keep a library
> of designs that save automatically, navigate a 3D workplane, add boxes, cylinders and spheres,
> select, move, resize, lift and rotate them, edit their properties, make shapes into holes and
> group them to cut real holes out of solids, and undo/redo. Import and export (STL, OBJ, 3MF)
> come next.

## Your designs

Holecraft opens on a list of your designs. **New design** makes one and opens it; click a name to
open it, or use **Rename**, **Duplicate** and **Delete** (which asks first). Everything you do is
**saved automatically** a moment after you stop changing things, and the top bar shows
*Saved*, *Unsaved changes*, *Saving…* or *Couldn't save* (it keeps your work on screen and retries
until the server answers). Change a design's name in the top bar. Undo history is not kept between
sessions. Designs are plain JSON files, one per design, in `<data folder>/designs/`, so they are
easy to back up or copy.

## Using the editor

| Action | How |
|---|---|
| Add a shape | Drag it from the Shapes panel onto the workplane, or click it (or press Enter) to add at the centre. Drops snap to the grid |
| Select | Click a shape (or its row in the Objects list). Shift-click adds or removes. Drag a box around shapes to select several. `Ctrl+A` selects all, `Esc` clears |
| Move | Drag a shape. It snaps to the grid and stays on the workplane. Dragging one of several selected shapes moves them all |
| Resize | Select one shape and drag a handle. Corner handles resize width and depth, side handles one dimension, the top round handle the height. The opposite corner or side stays fixed, and the edge you drag snaps to the grid. Hold `Shift` to scale all three dimensions together, `Alt` to resize about the centre. The size shows live while you drag |
| Rotate | Select one shape and drag a coloured ring handle: red turns it about the X axis, green about Y, blue about Z. It turns about the shape's centre and snaps to 22.5° (hold `Shift` for 1° steps). The angle shows live while you drag. You can also type **Rotate X / Y / Z** in degrees in the Properties panel |
| Lift | Drag the black cone above a shape to raise it off the workplane. Press `D` (or **Drop to workplane**) to put it back down |
| Nudge | Arrow keys move the selection along the nearest workplane axis by the grid step (`Shift` for ten times as far) |
| Edit properties | Select a shape, then type a name, position (X, Y, Z), size (width, depth, height) or color in the Properties panel. Press Enter or click away to apply; invalid values are rejected |
| Tilted shapes | A shape tipped about X or Y has no resize or lift handles (rotate it back to use them); its X, Y and Z fields show its base point, which moves when it tips. **Drop to workplane** rests its lowest corner on the plane. Shapes turned only about Z keep every handle |
| Solid / hole | Choose **Solid** or **Hole** under Type in the Properties panel (it applies to everything selected). A hole on its own is drawn as a pale see-through ghost, and keeps its colour for when you turn it back into a solid |
| Cut a hole | Make a shape a **Hole**, position it where it overlaps a solid, then select both and **Group** them: the group becomes one solid with the hole cut out of it. Several solids in a group are joined together, and several holes all cut. Ungroup to get the separate shapes back, ghosts and all |
| Group | Select two or more shapes and press **Group** or `Ctrl+G`. A group moves, nudges, duplicates, deletes, recolours and drops as one. A group is drawn as a single merged shape in the group's colour. Clicking any shape in it selects the whole group. Groups can be nested. Resize, lift and rotate handles are not available for groups yet |
| Ungroup | **Ungroup** or `Ctrl+Shift+G` opens a group one level, leaving every shape exactly where it was. Ungrouping a hole group turns its contents into holes |
| Duplicate / delete | `Ctrl+D` / `Delete`, or the buttons in the Properties panel |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), or the Undo and Redo buttons. A whole drag is one step |
| Orbit | Right-drag |
| Pan | Middle-drag, or Shift + right-drag |
| Zoom | Mouse wheel |
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
| `scripts/e2e.sh` | Playwright tests in the Playwright Docker image |
| `scripts/docker-smoke.sh` | Build the image, run it, verify health and non-root user |
| `scripts/package-desktop.sh` | Build the AppImage and .deb (in a Debian container) |
| `scripts/deploy-local.sh` | Rebuild the Docker image from `origin/main` and restart the local test container (default port 8200, keeps its data volume) |
| `scripts/screenshot.sh` | Screenshot a running instance with software WebGL (`DEMO=1` adds shapes, `VIEW=top` picks a view, `CLICK=0,0` selects, `PRESS=Control+a` presses keys) |
| `scripts/make-icon.sh` | Regenerate the app icons from the cube mark cropped out of `branding/logo.jpg` |

## License

[AGPL-3.0](LICENSE). If you run a modified Holecraft as a network service, you must share your
changes. Tinkercad is a trademark of Autodesk, Inc. Holecraft is not affiliated with Autodesk.
