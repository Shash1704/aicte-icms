# Demo video

Builds the SIH26264 demo video from the team's voice recording: a browser drives the live prototype
in time with the speakers, and the result is merged with the audio and captions.

Needs: Homebrew `ffmpeg` and `whisper-cpp`, Node 22+, and the whisper model in `models/`:

```bash
brew install ffmpeg whisper-cpp
```

```bash
npm install && npx playwright install chromium
```

```bash
curl -L -o models/ggml-small.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin
```

## Steps

1. Put the recording at `audio/voice_raw.mp3`. The team recorded one line twice, so the first take
   (2:13.35–2:19.85) is cut out:

   ```bash
   ffmpeg -y -i audio/voice_raw.mp3 -filter_complex "[0:a]asplit=2[s1][s2];[s1]atrim=0:133.35,asetpts=PTS-STARTPTS,afade=t=out:st=133.27:d=0.08[a];[s2]atrim=start=139.85,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.08[b];[a][b]concat=n=2:v=0:a=1[out]" -map "[out]" -c:a pcm_s16le -ar 44100 audio/voice.wav
   ```

2. Transcribe it with word timings (used to place every click and the captions):

   ```bash
   ffmpeg -y -i audio/voice.wav -ar 16000 -ac 1 audio/voice16k.wav && whisper-cli -m models/ggml-small.en.bin -f audio/voice16k.wav -ml 1 -sow -oj -of out/words -np
   ```

3. Dry-run the browser script without waiting for the audio (finds broken steps in about a minute):

   ```bash
   FAST=1 node record.mjs
   ```

4. Record in real time (about 3 minutes), then merge:

   ```bash
   node record.mjs && sh make.sh
   ```

Output: `out/Varangians_SIH26264_Demo.mp4` (1920×1080, 2:44, captions as a switchable track) and `out/captions.srt`.

## How it works

- `record.mjs` opens the live demo at a 1536×864 viewport (rendered at 1920×1080) and runs one timeline.
  Each step is pinned to the second its line is spoken (`at(seconds, label)`); the run reports any step
  that started late. It shows a cursor, click ripples, a highlight box, the part title, and the title
  and closing cards, all drawn inside the page in the app's dark style.
- A fresh browser profile means fresh demo data on every run, so the numbers match the script.
- `captions.py` groups the word timings into caption lines and fixes the words whisper mishears.
- `make.sh` trims the warm-up from the recording and adds the audio and captions.

The recording follows an earlier script written for the yellow design ("This yellow box…"); the video
shows the current dark design, with each line matched to the nearest equivalent on screen.
If the audio is re-recorded, the step times in `record.mjs` must be updated from the new `out/words.json`.
