#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENDOR="$ROOT/vendor/mf-cli"
BIN="$ROOT/bin"
KMOD="$ROOT/kmod"

echo "==> Building mf-cli (Rust CLI) …"
cd "$VENDOR"
cargo build --release
mkdir -p "$BIN"
cp target/release/mf-cli "$BIN/mf-cli"
echo "    -> $BIN/mf-cli"

if command -v make &>/dev/null && [ -d "/lib/modules/$(uname -r)/build" ]; then
    echo "==> Building minifuse kernel module …"
    mkdir -p "$KMOD"
    KMOD_SRC="$VENDOR/kmod"
    # Kernel buildsystem can't handle spaces in $PWD → symlink to clean path
    KMOD_TMP="/tmp/opencode/mf-kmod-build"
    rm -rf "$KMOD_TMP"
    cp -r "$KMOD_SRC" "$KMOD_TMP"
    make -C "$KMOD_TMP" KVER="$(uname -r)" PWD="$KMOD_TMP"
    cp "$KMOD_TMP/minifuse_mod.ko" "$KMOD/"
    make -C "$KMOD_TMP" KVER="$(uname -r)" PWD="$KMOD_TMP" clean
    rm -rf "$KMOD_TMP"
    echo "    -> $KMOD/minifuse_mod.ko"
else
    echo "!!> Kernel headers not found – skipping kmod build."
fi

cd "$ROOT"
echo "==> Done. Binary: $BIN/mf-cli"
