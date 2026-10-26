"""Builds out/captions.srt from whisper's word timings (out/words.json).

Words are grouped into short caption lines (about 7 seconds / 84 characters at most, split at
sentence ends), and a few words whisper misheard are corrected to what the speakers said.
"""
import json
import re

FIXES = [
    (r'\bSIH 26264\b', 'SIH26264'),
    (r'\bthe GRI once said\b', 'the Grievance Cell'),
    (r'\bchairman\b', 'Chairman'),
    (r'\bshows the red line\b', 'shows the deadline'),
    (r'\bThis case has already been laid\b', 'This case is already late'),
    (r'\bThe board department\'s cases are on the screen\b', "Now both departments' cases are on one screen"),
    (r'\bwarns us another\b', 'warns us: another'),
    (r'\bSaved, it went\b', 'Saved. It went'),
    (r'\bgrievance (set|cell)\b', 'Grievance Cell'),
    (r'\bregulation bureau\b', 'Regulation Bureau'),
    (r'\bevery timeline\b', 'one timeline'),
    (r'\bevery college clashes\b', 'every college, clashes'),
    (r'\bnew complaint comes in\b', 'new complaints come in'),
]

words = [(w['offsets']['from'] / 1000, w['offsets']['to'] / 1000, w['text'].strip())
         for w in json.load(open('out/words.json'))['transcription'] if w['text'].strip()]
AUDIO_END = 162.8

cues, cur = [], []
for w in words:
    cur.append(w)
    text = ' '.join(x[2] for x in cur)
    dur = cur[-1][1] - cur[0][0]
    if w[2][-1] in '.?!' and dur > 2.2:
        cues.append(cur)
        cur = []
    elif len(text) > 74 or dur > 6.5:
        # break after the last comma or full stop if there is one, else here
        cut = max((i for i, x in enumerate(cur[:-1]) if x[2][-1] in ',.?!' and i >= 2), default=len(cur) - 1)
        cues.append(cur[:cut + 1])
        cur = cur[cut + 1:]
if cur:
    cues.append(cur)
# whisper times the last words past the end of the audio: fold a cue that starts too late into the one before
while len(cues) > 1 and cues[-1][0][0] > AUDIO_END - 0.8:
    last = cues.pop()
    cues[-1] = cues[-1] + last


def ts(t):
    t = max(0, min(t, AUDIO_END))
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f'{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}'.replace(',1000', ',999')


def fix(text):
    for a, b in FIXES:
        text = re.sub(a, b, text)
    return text


with open('out/captions.srt', 'w') as f:
    for i, c in enumerate(cues, 1):
        start = c[0][0]
        end = cues[i][0][0] - 0.05 if i < len(cues) else AUDIO_END
        end = min(end, c[-1][1] + 1.2)
        end = max(end, start + 0.9)
        text = fix(' '.join(x[2] for x in c))
        # wrap into two lines at the space nearest the middle
        if len(text) > 42:
            mid = len(text) // 2
            cut = min((j for j, ch in enumerate(text) if ch == ' '), key=lambda j: abs(j - mid))
            text = text[:cut] + '\n' + text[cut + 1:]
        f.write(f'{i}\n{ts(start)} --> {ts(end)}\n{text}\n\n')
print(len(cues), 'captions')
