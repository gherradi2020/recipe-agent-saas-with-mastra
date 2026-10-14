#!/usr/bin/env bash
# Source this file from the build script. No global installation or sudo needed.
set -euo pipefail

wasp_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
wasp_version=0.18.0
wasp_cache="$wasp_root/.wasp/toolchains/wasp-$wasp_version"
export WASP_BIN="$wasp_cache/wasp-bin"
export waspc_datadir="$wasp_cache/data"

if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'The automated Wasp 0.18.0 build requires Linux x86_64 (glibc).' >&2
  exit 1
fi

if [[ ! -x "$WASP_BIN" ]]; then
  for tool in curl tar sha256sum; do
    command -v "$tool" >/dev/null || {
      echo "The Wasp bootstrap needs $tool in the build image." >&2
      exit 1
    }
  done
  mkdir -p "$(dirname "$wasp_cache")"
  (
    wasp_tmp="$(mktemp -d "$(dirname "$wasp_cache")/.download.XXXXXX")"
    trap 'rm -rf "$wasp_tmp"' EXIT
    echo "Downloading Wasp $wasp_version into the project build cache..."
    curl --fail --location --silent --show-error --retry 3 \
      --proto '=https' --proto-redir '=https' \
      "https://github.com/wasp-lang/wasp/releases/download/v$wasp_version/wasp-linux-x86_64.tar.gz" \
      --output "$wasp_tmp/wasp.tar.gz"
    # Pin the official v0.18.0 Linux x86_64 release asset; never bypass verification.
    if ! echo 'eb98e050ec2576d1d868aaa7238e2aab29967915c4cc002277337dac90078bbf  wasp.tar.gz' \
      | (cd "$wasp_tmp" && sha256sum --check --status); then
      echo 'Wasp release checksum mismatch; refusing to install the archive.' >&2
      exit 1
    fi
    mkdir "$wasp_tmp/extracted"
    tar -xzf "$wasp_tmp/wasp.tar.gz" -C "$wasp_tmp/extracted"
    test -x "$wasp_tmp/extracted/wasp-bin"
    test -d "$wasp_tmp/extracted/data"
    mv "$wasp_tmp/extracted" "$wasp_cache"
  )
fi

if ! wasp_actual_version="$("$WASP_BIN" version)"; then
  echo 'Wasp could not run: the build image needs glibc, libgmp.so.10 and zlib.' >&2
  exit 1
fi
if [[ "${wasp_actual_version%%$'\n'*}" != "$wasp_version" ]]; then
  echo "Expected Wasp $wasp_version in $wasp_cache; cached tool is incompatible." >&2
  exit 1
fi
