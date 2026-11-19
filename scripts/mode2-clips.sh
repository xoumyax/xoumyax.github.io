#!/usr/bin/env bash
# Cuts the owner's Mode II clips (10 s ASCII-look loops) into short, light web loops.
# Usage: scripts/mode2-clips.sh <folder with hero.mp4 road.mp4 littlebirdy.mp4 campground.mp4 glamping.mp4>
# Each output is a 5 s seamless loop: the first second cross-fades from the source's 5–6 s back
# into its 0–1 s, so the last frame flows into the first. No audio, no metadata, no encoder SEI.
#   public/mode2/<id>.mp4    desktop, 1280 px on the long side
#   public/mode2/<id>-m.mp4  phone, a 540×960 portrait crop from the centre
#   public/mode2/<id>.jpg    poster (first frame), for first paint and reduced motion
set -euo pipefail
src=${1:?folder with the clips}
out="$(cd "$(dirname "$0")/.." && pwd)/public/mode2"
mkdir -p "$out"
L=5; F=1
loop="[0:v]split[a][b];[a]trim=$L:$((L+F)),setpts=PTS-STARTPTS[tail];[b]split[c][d];[c]trim=0:$F,setpts=PTS-STARTPTS[head];[d]trim=$F:$L,setpts=PTS-STARTPTS[body];[tail][head]xfade=transition=fade:duration=$F:offset=0[x];[x][body]concat=n=2:v=1:a=0,fps=24"
enc=(-an -map_metadata -1 -fflags +bitexact -flags:v +bitexact -c:v libx264 -preset slow -pix_fmt yuv420p -movflags +faststart -tune grain)
for id in hero road littlebirdy campground glamping; do
  f="$src/$id.mp4"
  ffmpeg -v error -y -t $((L+F)) -i "$f" -filter_complex "$loop,scale='if(gt(iw,ih),1280,-2)':'if(gt(iw,ih),-2,1280)':flags=area" "${enc[@]}" -crf 31 "$out/$id.mp4"
  ffmpeg -v error -y -t $((L+F)) -i "$f" -filter_complex "$loop,scale=-2:960:flags=area,crop=540:960" "${enc[@]}" -crf 32 "$out/$id-m.mp4"
  ffmpeg -v error -y -i "$out/$id.mp4" -frames:v 1 -map_metadata -1 -fflags +bitexact -flags:v +bitexact -q:v 9 "$out/$id.jpg"
done
# x264 leaves its name, version and settings in an SEI unit (type 6) in the first frame: drop it
# with a stream copy (the pictures are untouched).
for f in "$out"/*.mp4; do
  ffmpeg -v error -y -i "$f" -map 0 -c copy -bsf:v filter_units=remove_types=6 -map_metadata -1 -fflags +bitexact -movflags +faststart "$f.tmp.mp4"
  mv "$f.tmp.mp4" "$f"
done
# ffmpeg still writes an empty moov/udta (iTunes ilst) box: drop it.
node "$(dirname "$0")/mp4-strip.mjs" "$out"/*.mp4
ls -l "$out"
