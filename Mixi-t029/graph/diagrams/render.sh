#!/usr/bin/env bash
# Rebuild editable D2 sources using the exact tested D2 release and bundled fonts.
set -euo pipefail
diagram_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
d2_binary="${D2_BIN:-d2}"
if [[ "$("$d2_binary" --version)" != "v0.9.0" ]]; then
  echo 'Required: D2 v0.9.0. Set D2_BIN to the matching executable.' >&2
  exit 1
fi
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--png" ) ]]; then
  echo 'Usage: render.sh [--png]   (PNG_DIR required with --png)' >&2
  exit 1
fi
flags=(--layout elk --pad 40 --bundle=true
  --font-regular "$diagram_root/fonts/NotoSans-Regular.ttf"
  --font-bold "$diagram_root/fonts/NotoSans-Bold.ttf"
  --font-semibold "$diagram_root/fonts/NotoSans-SemiBold.ttf"
  --font-italic "$diagram_root/fonts/NotoSans-Italic.ttf")
mkdir -p "$diagram_root/exports"
for source in "$diagram_root"/sources/*.d2; do
  name="$(basename -- "$source" .d2)"
  "$d2_binary" validate "$source"
  "$d2_binary" "${flags[@]}" "$source" "$diagram_root/exports/$name.svg"
  if [[ "${1:-}" == "--png" ]]; then
    : "${PNG_DIR:?Set PNG_DIR outside the deliverable folder for temporary QA images}"
    mkdir -p "$PNG_DIR"
    "$d2_binary" "${flags[@]}" "$source" "$PNG_DIR/$name.png"
  fi
done
