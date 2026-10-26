#!/bin/sh
# Builds the final video from the recording (record.mjs), the speakers' audio and the captions.
#   sh make.sh   → out/Varangians_SIH26264_Demo.mp4 (captions as a switchable track) + out/captions.srt
set -e
cd "$(dirname "$0")"
python3 captions.py
TRIM=$(cat out/trim.txt)
ffmpeg -loglevel error -y \
  -ss "$TRIM" -i out/screen.webm \
  -i audio/voice.wav \
  -i out/captions.srt \
  -map 0:v -map 1:a -map 2:s \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -af apad -c:a aac -b:a 192k \
  -c:s mov_text -metadata:s:s:0 language=eng \
  -t 164.4 -movflags +faststart \
  out/Varangians_SIH26264_Demo.mp4
ffprobe -v error -show_entries format=duration,size -of compact out/Varangians_SIH26264_Demo.mp4
