# syntax=docker/dockerfile:1

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /src

# Install dependencies first so they cache independently of source changes.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY apps/desktop/package.json apps/desktop/
# The desktop workspace is installed but its Electron binary isn't needed here.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- runtime ----
# The server is a single bundled file, so the runtime image needs no node_modules.
FROM node:22-bookworm-slim
LABEL org.opencontainers.image.title="Holecraft" \
      org.opencontainers.image.description="Open-source, offline, browser-based 3D modeling" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

ENV NODE_ENV=production \
    HOLECRAFT_HOST=0.0.0.0 \
    HOLECRAFT_PORT=8080 \
    HOLECRAFT_DATA_DIR=/data

WORKDIR /app
COPY --from=build /src/apps/server/dist apps/server/dist
COPY --from=build /src/apps/web/dist apps/web/dist
COPY LICENSE ./

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.HOLECRAFT_PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "apps/server/dist/main.js"]
