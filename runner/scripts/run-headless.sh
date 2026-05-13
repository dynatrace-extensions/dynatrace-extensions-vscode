#!/usr/bin/env bash
set -euo pipefail

export SKIP_INTERACTIVE="${SKIP_INTERACTIVE:-true}"
export HEADLESS_WORKSPACE_PATH="${HEADLESS_WORKSPACE_PATH:-}"
# Electron's renderer/utility processes refuse to run as root unless sandbox is
# off. Containers typically run as root; setting this env var disables sandbox
# for every subprocess (the --no-sandbox launchArg only covers the main process).
export ELECTRON_NO_SANDBOX="${ELECTRON_NO_SANDBOX:-1}"

echo "=== Compiling runner ==="
npm run compile:runner

echo "=== Running convertScreens headlessly ==="
if [ -z "${DISPLAY:-}" ]; then
  echo "No DISPLAY — using xvfb-run"
  xvfb-run -a --server-args="-screen 0 1920x1080x24" node ./out/runner/launcher/launch.js
else
  echo "DISPLAY detected (${DISPLAY}) — running directly"
  node ./out/runner/launcher/launch.js
fi

echo "=== Done ==="
