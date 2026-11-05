// Urdu voice-over through Edge's own neural voices (ur-PK-AsadNeural). This is the service
// behind Edge's "Read aloud": no API key, no account, nothing metered. It is the only way
// to get real Pakistani Urdu on this machine - the two SAPI voices installed are both
// en-US, and a Latin-script reading of Urdu is unusable.
//
// Writes vo/<id>.mp3 and timeline.json, where each scene's length is its REAL clip length
// plus a lead-in and a hold, so the picture can never drift from the voice.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const FFMPEG = require('ffmpeg-static');

const HERE = __dirname;
const VO = path.join(HERE, 'vo');
const MINE = path.join(HERE, 'my-voice');   // Tahir's own recordings, one per line
const RATE_SCALE = 1.22;                   // the chosen narrator is slow; this is still unhurried
const LEAD = 0.35;    // the scene is on screen before the voice starts
const TAIL = 0.65;    // and holds after it, so a cut never lands on the last syllable

// ffmpeg-static ships no ffprobe; the duration is in what ffmpeg prints about the input.
function durationOf(file) {
  let out = '';
  try { execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { out = (e.stderr || '').toString(); }
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(out);
  if (!m) throw new Error('could not read the duration of ' + file);
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

// Finding Tahir's own recordings. Two shapes are accepted:
//
//   named   — s0.m4a, s4.ogg … the id in the filename, in any order
//   in order— one file per line, named anything (WhatsApp voice notes are named after the
//             time they were recorded), matched to the lines by recording time
//
// The second exists because reading all fourteen lines into ONE file did not work: it
// needs a clear gap between every line to cut on, and a person reading naturally does not
// leave one. Measured on the first attempt: at a 2-second threshold the whole recording
// was a single block. Fourteen separate notes remove the problem entirely.
const AUDIO = /\.(m4a|mp3|wav|ogg|opus|aac)$/i;

let ordered = null;
function recordingFor(id, lineIds) {
  const named = ['.m4a', '.mp3', '.wav', '.ogg', '.opus', '.aac']
    .map(ext => path.join(MINE, id + ext)).find(p => fs.existsSync(p));
  if (named) return named;

  if (ordered === null) {
    const files = fs.existsSync(MINE) ? fs.readdirSync(MINE).filter(f => AUDIO.test(f)) : [];
    // Only map by order when there is exactly one recording per line; anything else is
    // ambiguous and guessing would put the wrong words on the wrong screen.
    if (files.length === lineIds.length && files.length > 1) {
      const byTime = files
        .map(f => ({ f, t: fs.statSync(path.join(MINE, f)).mtimeMs }))
        .sort((a, b) => a.t - b.t);
      ordered = Object.fromEntries(lineIds.map((lid, i) => [lid, path.join(MINE, byTime[i].f)]));
      console.log(`  using ${files.length} recordings, in the order they were made:`);
      byTime.forEach((x, i) => console.log(`    ${lineIds[i].padEnd(4)} <- ${x.f}`));
    } else {
      if (files.length) {
        console.log(`  ${files.length} file(s) in my-voice/ but ${lineIds.length} lines — `
          + 'not mapping by order. Name them s0, s1 … or send one per line.');
      }
      ordered = {};
    }
  }
  return ordered[id] || null;
}

(async () => {
  const script = JSON.parse(fs.readFileSync(path.join(HERE, 'script.json'), 'utf8'));
  const lineIds = script.lines.map(l => l.id);
  fs.mkdirSync(VO, { recursive: true });

  const scenes = [];
  let t0 = 0;
  for (const line of script.lines) {
    // toFile treats its argument as a directory and writes audio.mp3 inside it, so the
    // directory has to exist first.
    const dir = path.join(VO, line.id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'audio.mp3');

    // Tahir's own recording wins over the neural voice, always. Drop s0.m4a, s4.mp3 and so
    // on into my-voice/ and those lines become his; anything he has not recorded stays the
    // neural voice, so he can replace the whole script or only the lines he wants.
    let vo = null;
    const mine = recordingFor(line.id, lineIds);
    if (mine) {
      // Re-encoded to the same shape as the generated clips, and levelled, because a phone
      // recording arrives quieter and in whatever format the phone felt like.
      execFileSync(FFMPEG, ['-y', '-i', mine, '-ac', '1', '-ar', '24000',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-b:a', '48k', file],
        { stdio: ['ignore', 'ignore', 'pipe'] });
      vo = durationOf(file);
      console.log(`  ${line.id.padEnd(4)} YOUR VOICE (${path.basename(mine)})  ${vo.toFixed(2)}s`);
    }

    // Already there from an interrupted run: keep it rather than making it again.
    if (vo === null && fs.existsSync(file) && fs.statSync(file).size > 4000) {
      try { vo = durationOf(file); } catch { vo = null; }
    }

    // The service drops the socket now and then mid-sentence, which truncates the clip.
    // A fresh connection per line and a couple of retries is enough; a shared connection
    // across thirteen lines is what made it fail.
    for (let attempt = 1; vo === null && attempt <= 4; attempt++) {
      try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(script.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        await tts.toFile(dir, line.text, { rate: RATE_SCALE });
        vo = durationOf(file);
      } catch (e) {
        try { fs.rmSync(file, { force: true }); } catch {}
        if (attempt === 4) throw new Error(`${line.id} failed after 4 tries: ${e.message}`);
        console.log(`  ${line.id}: ${e.message.split('.')[0]} — retrying (${attempt})`);
        await new Promise(r => setTimeout(r, 1200 * attempt));
      }
    }
    const d = LEAD + vo + TAIL;
    scenes.push({ id: line.id, t0: +t0.toFixed(3), d: +d.toFixed(3), vo: +vo.toFixed(3), lead: LEAD });
    if (!mine) console.log(`  ${line.id.padEnd(4)} voice ${vo.toFixed(2)}s  scene ${d.toFixed(2)}s`);
    t0 += d;
  }

  const timeline = { fps: 30, lead: LEAD, tail: TAIL, total: +t0.toFixed(3), scenes };
  fs.writeFileSync(path.join(HERE, 'timeline.json'), JSON.stringify(timeline, null, 2));
  console.log(`\ntotal ${t0.toFixed(1)}s across ${scenes.length} scenes -> timeline.json`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
