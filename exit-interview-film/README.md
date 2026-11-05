# Exit Interviews — the film

60 s, 1920×1080, silent. Built 26 October 2026.

`Exit-Interviews.mp4` is the deliverable. Everything else is how it is made.

## How it is built

The whole film is **one deterministic page**. `film.html` defines `window.render(t)`:
given a time in seconds it sets every element's opacity and transform from that time
alone — no CSS transitions, no animation loop. So any single frame can be re-rendered on
its own, and the picture can never drift out of step with itself.

- `node render_frames.js` — renders all 1800 frames into `seq/`, in **one** Chrome session
  (~0.4 s a frame). `node render_frames.js 600 900` re-renders only that range after a fix.
- `node render_frames.js --stills` — one frame per scene into `frames/`, which is what gets
  reviewed by eye before encoding. Each has a `.qa.json` sidecar written only after the
  frame was actually looked at.
- `node assemble.js` — encodes `seq/` to `Exit-Interviews.mp4` (h264, yuv420p, faststart,
  so it plays inline in WhatsApp and Slack).

Keep `seq/` until the film is signed off: a one-word caption change means a re-encode, and
re-rendering the frames costs ~13 minutes.

## Cost

Nothing. No video model, no TTS, no music licence — every frame is drawn by the browser.
