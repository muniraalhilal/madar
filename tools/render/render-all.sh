#!/usr/bin/env bash
# Renders every marketing image at native resolution with 1.5× supersampling.
set -euo pipefail
cd "$(dirname "$0")"
for p in hero night movement enter; do
  node render.mjs "$p-desktop" 3840 2160 1.5
  node render.mjs "$p-mobile" 1440 3120 1.5
done
