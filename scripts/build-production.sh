#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${REACT_APP_API_URL:?Set REACT_APP_API_URL to the backend origin before building the frontend}"
# Wasp must generate the SDK, Prisma client and production app before bundling.
# Prevent generated installs from rewriting the tracked manifest and lockfile.
export npm_config_save=false
# Build tools are needed even when the host sets NODE_ENV=production.
export npm_config_include=dev
# Some managed builders have a read-only home directory.
export npm_config_cache="${WASP_NPM_CACHE:-$PWD/.wasp/npm-cache}"
source scripts/ensure-wasp.sh
"$WASP_BIN" build
npm --prefix .wasp/build/server run bundle
npm --prefix .wasp/build/web-app run build
