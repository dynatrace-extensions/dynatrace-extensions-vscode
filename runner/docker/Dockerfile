FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV SKIP_INTERACTIVE=true
ENV HEADLESS_WORKSPACE_PATH=/workspace

# System deps: Node.js 24, xvfb, VSCode Electron native libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xvfb \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
    libgtk-3-0 libasound2 libx11-xcb1 libxcomposite1 libxrandr2 \
    libxdamage1 libcups2 libpango-1.0-0 libcairo2 libxss1 \
  && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /ext

# Dependency layer (cached unless package files change)
COPY package.json package-lock.json .npmrc ./
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm ci --ignore-scripts --no-audit --no-fund

# Source
COPY src/       ./src/
COPY common/    ./common/
COPY runner/    ./runner/
COPY tsconfig*.json ./

# Build: extension bundle (esbuild) + runner TypeScript
RUN npm run esbuild && npm run compile:runner

# Strip extensionDependencies from the manifest used at headless runtime.
# `redhat.vscode-yaml` is an IDE-only schema validation dependency; convertScreens
# uses the `yaml` npm package directly, not the marketplace extension. With
# --disable-extensions in the launcher, the dep cannot activate, so VSCode
# refuses to load our extension. Drop the field for the headless image only.
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); delete p.extensionDependencies; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" \
 && grep -c extensionDependencies package.json || true

# Pre-download VSCode binary so first run does not pay ~200 MB cost.
# Cache lands at /ext/.vscode-test/ (cwd-relative default of @vscode/test-electron).
# Pinned via ARG so future builds do not drift to "latest stable".
ARG VSCODE_VERSION=1.100.0
ENV VSCODE_VERSION=${VSCODE_VERSION}
RUN node -e "require('@vscode/test-electron').downloadAndUnzipVSCode({ version: '${VSCODE_VERSION}' }).then(p => console.log('VSCode at', p))" \
 && ls /ext/.vscode-test/

# Workspace is mounted at runtime (or baked in for a fully self-contained image).

ENTRYPOINT ["bash", "./runner/scripts/run-headless.sh"]
