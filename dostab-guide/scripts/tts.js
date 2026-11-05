// Voice-over through Edge's neural voices (free, no key), then a timeline whose scene
// lengths come from the REAL clip lengths, so picture and voice can never drift apart.
// Writes public/vo/<id>.mp3 and src/timeline.json.  Run: node scripts/tts.js
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const LIB = 'C:/Raftar/exit-interview-film/node_modules/';
const { MsEdgeTTS, OUTPUT_FORMAT } = require(LIB + 'msedge-tts');
const FFMPEG = require(LIB + 'ffmpeg-static');

const ROOT = path.join(__dirname, '..');
const VO = path.join(ROOT, 'public', 'vo');
const RATE = 1.35;   // brisk: the guide is meant to be short
const LEAD = 0.3;    // scene is on screen before the voice starts
const TAIL = 0.55;   // and holds after it (covers the 12-frame cross-fade)
const FPS = 30, MIN = { intro: 96, outro: 120, beat: 60 };

function durationOf(file) {
  let out = '';
  try { execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { out = (e.stderr || '').toString(); }
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(out);
  if (!m) throw new Error('no duration for ' + file);
  return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
}

(async () => {
  const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
  fs.mkdirSync(VO, { recursive: true });
  const scenes = {};
  for (const line of script.lines) {
    const dir = path.join(VO, line.id), file = path.join(dir, 'audio.mp3');
    fs.mkdirSync(dir, { recursive: true });
    let vo = null;
    // A fresh connection per line plus retries: the service drops sockets mid-sentence.
    for (let attempt = 1; vo === null && attempt <= 4; attempt++) {
      try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(script.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        await tts.toFile(dir, line.text, { rate: RATE });
        vo = durationOf(file);
        if (vo < 0.8) throw new Error('clip too short - truncated');
      } catch (e) {
        vo = null;
        if (attempt === 4) throw new Error(`${line.id}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
    const kind = line.id === 'intro' || line.id === 'outro' ? line.id : 'beat';
    const frames = Math.max(MIN[kind], Math.ceil((LEAD + vo + TAIL) * FPS));
    scenes[line.id] = { frames, lead: Math.round(LEAD * FPS), vo: Math.ceil(vo * FPS) };
    console.log(`${line.id.padEnd(15)} voice ${vo.toFixed(2)}s  scene ${(frames / FPS).toFixed(2)}s`);
  }
  fs.writeFileSync(path.join(ROOT, 'src', 'timeline.json'), JSON.stringify(scenes, null, 2));
  const total = Object.values(scenes).reduce((a, s) => a + s.frames, 0) - (script.lines.length - 1) * 12;
  console.log(`total ~ ${(total / FPS).toFixed(1)}s`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
