#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${REACT_APP_API_URL:?Set REACT_APP_API_URL to the backend origin before building the frontend}"
# Wasp must generate the SDK, Prisma client and production app before bundling.
# Prevent generated installs from rewriting the tracked manifest and lockfile.
export npm_config_save=false
wasp build
npm --prefix .wasp/build/server run bundle
npm --prefix .wasp/build/web-app run build
