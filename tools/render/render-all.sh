#!/usr/bin/env bash
# Renders every marketing still at native resolution with supersampling.
# A lost WebGL context produces a black frame, so each output is checked and retried at a lower supersample.
set -euo pipefail
cd "$(dirname "$0")"
check() { node -e "require('sharp')('$1').stats().then(s=>process.exit(s.channels[0].mean<4?1:0))"; }
render() {
  local preset=$1 w=$2 h=$3
  for ss in 1.25 1.0; do
    node render.mjs "$preset" "$w" "$h" "$ss" && check "out/$preset-${w}x${h}.png" && return 0
    echo "retrying $preset at lower supersample"
  done
  return 1
}
for p in ${PRESETS:-hero night movement enter}; do
  render "$p-desktop" 3840 2160
  render "$p-mobile" 1440 3120
done
