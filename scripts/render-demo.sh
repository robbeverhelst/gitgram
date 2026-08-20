#!/usr/bin/env bash
# Renders .github/assets/demo{,-dark}.gif from demo.html.
# Each frame is screenshotted independently, so the animation is deterministic.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="$(cd "$(dirname "$0")/.." && pwd)/.github/assets/demo.html"
OUT="$(dirname "$SRC")"
FPS=12
FRAMES=48   # 4s

render() {
  local theme=$1 out=$2 dir
  dir=$(mktemp -d)
  for i in $(seq 0 $((FRAMES - 1))); do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=2 --window-size=900,270 \
      --screenshot="$dir/f$i.png" \
      "file://$SRC?t=$((i * 1000 / FPS))&theme=$theme" >/dev/null 2>&1
  done
  ffmpeg -y -loglevel error -framerate $FPS -start_number 0 -i "$dir/f%d.png" \
    -vf "scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
    -loop 0 "$out"
  rm -rf "$dir"
  echo "$(basename "$out") $(du -h "$out" | cut -f1)"
}

render light "$OUT/demo.gif"
render dark "$OUT/demo-dark.gif"
