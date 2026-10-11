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

> **Status: early development (Phase 0 of the [plan](PLAN.md)).** The app shell, server,
> Docker image, desktop packaging, and test harness work. Modeling features start in Phase 1.

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

There is no authentication yet, so only expose Holecraft on a trusted network.
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
| `scripts/screenshot.sh` | Screenshot a running instance with software WebGL |
| `scripts/make-icon.sh` | Regenerate the desktop icon PNG from the SVG logo |

## License

[AGPL-3.0](LICENSE). If you run a modified Holecraft as a network service, you must share your
changes. Tinkercad is a trademark of Autodesk, Inc. Holecraft is not affiliated with Autodesk.
