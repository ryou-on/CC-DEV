#!/usr/bin/env bash
# 300フレームずつ分割レンダー（中断しても完了済みチャンクは再利用）→ 結合 → BGMを多重化
set -e
cd "$(dirname "$0")"
mkdir -p out/chunks
for r in 0-299 300-599 600-899; do
  f="out/chunks/c$r.mp4"
  [ -s "$f" ] && continue
  npx remotion render src/index.ts TomoeDemo "$f.tmp.mp4" --frames=$r --muted --codec=h264 --crf=21 --concurrency=4
  mv "$f.tmp.mp4" "$f"
done
printf "file 'c0-299.mp4'\nfile 'c300-599.mp4'\nfile 'c600-899.mp4'\n" > out/chunks/list.txt
npx remotion ffmpeg -y -f concat -safe 0 -i out/chunks/list.txt -i public/audio/bgm.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out/tomoe-demo-preview.mp4
echo RENDER_DONE
