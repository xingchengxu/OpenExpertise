#!/usr/bin/env bash
# Record an asciinema cast of the OpenExpertise demo flow.
# Output: docs/assets/demo.cast (asciinema JSON) and demo.svg (rendered via svg-term-cli).
#
# Prereqs:
#   brew install asciinema svg-term-cli   (or npm i -g svg-term-cli)

set -euo pipefail

cd "$(dirname "$0")/.."

OUT=docs/assets/demo.cast
SVG=docs/assets/demo.svg

if ! command -v asciinema >/dev/null; then
  echo "asciinema not installed. brew install asciinema" >&2
  exit 1
fi

echo "Recording will START in 3 seconds. Run these commands during recording:"
echo "  oe doctor"
echo "  oe registry"
echo "  oe run examples/hello-tool"
echo "  oe state --experience examples/hello-tool greeting"
echo "  exit"
sleep 3

asciinema rec --overwrite "$OUT"

if command -v svg-term >/dev/null; then
  svg-term --in "$OUT" --out "$SVG" --window --width 88 --height 24
  echo "Wrote $SVG"
else
  echo "svg-term-cli not installed. cast saved to $OUT — install svg-term-cli and run:"
  echo "  svg-term --in $OUT --out $SVG --window --width 88 --height 24"
fi
