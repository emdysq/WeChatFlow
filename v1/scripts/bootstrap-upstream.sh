#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
V1="$(cd "$HERE/.." && pwd)"
REPO="https://github.com/doocs/md.git"
COMMIT="7622b816dbe8019ca2c8fc3d90c33a4aa8589836"
TARGET="$V1/upstream/doocs-md"
if [ ! -d "$TARGET/.git" ]; then
  git clone --filter=blob:none --no-checkout "$REPO" "$TARGET"
fi
git -C "$TARGET" fetch --depth=1 origin "$COMMIT"
git -C "$TARGET" checkout --detach "$COMMIT"
echo "doocs/md pinned at $COMMIT"
