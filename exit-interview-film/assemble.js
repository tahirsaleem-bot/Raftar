// Encodes seq/ into the deliverable, with the Urdu voice-over laid under it and, if one is
// provided, a music bed ducked beneath the voice.
//
// Every crossfade and reveal is already baked into the frames by render(t), so the video
// needs no filtering here. The audio is built by delaying each line to its own scene's
// start plus the lead-in - the same numbers the frames were rendered from - so the two
// cannot drift. Hard-mixed, never crossfaded against a hard-cut picture.
//
//   node assemble.js                 voice only
//   node assemble.js music/bed.mp3   voice over a bed, ducked
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const FFMPEG = require('ffmpeg-static');

const HERE = __dirname;
const FPS = 30;
const BED_DB = -17;      // the bed sits this far under full scale before ducking

const timeline = JSON.parse(fs.readFileSync(path.join(HERE, 'timeline.json'), 'utf8'));
const frames = fs.readdirSync(path.join(HERE, 'seq')).filter(f => f.endsWith('.jpg'));
if (!frames.length) { console.error('no frames in seq/ — run render_frames.js first'); process.exit(1); }

const bed = process.argv[2] && fs.existsSync(process.argv[2]) ? path.resolve(process.argv[2]) : null;
console.log(`${frames.length} frames (${(frames.length / FPS).toFixed(1)}s)`
  + ` · ${timeline.scenes.length} voice lines${bed ? ' · bed: ' + path.basename(bed) : ' · no music'}`);

const args = ['-y', '-framerate', String(FPS), '-i', path.join(HERE, 'seq', 'f%05d.jpg')];
for (const s of timeline.scenes) args.push('-i', path.join(HERE, 'vo', s.id, 'audio.mp3'));
if (bed) args.push('-stream_loop', '-1', '-i', bed);

// Each line is pushed to its own start time; apad lets the mix run to the full length.
const filters = [];
const voiceLabels = [];
timeline.scenes.forEach((s, i) => {
  const ms = Math.round((s.t0 + timeline.lead) * 1000);
  filters.push(`[${i + 1}:a]adelay=${ms}|${ms},apad[v${i}]`);
  voiceLabels.push(`[v${i}]`);
});
filters.push(`${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:normalize=0:dropout_transition=0,`
  + `atrim=0:${timeline.total},asetpts=N/SR/TB[voice]`);

if (bed) {
  const bedIdx = timeline.scenes.length + 1;
  // Ducked by the voice itself rather than by a fixed curve, so the words always win.
  filters.push(`[${bedIdx}:a]volume=${BED_DB}dB,atrim=0:${timeline.total},asetpts=N/SR/TB,`
    + `afade=t=in:st=0:d=1.5,afade=t=out:st=${(timeline.total - 2.5).toFixed(2)}:d=2.5[bedraw]`);
  filters.push(`[bedraw][voice]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=400[bedduck]`);
  filters.push(`[bedduck][voice]amix=inputs=2:normalize=0:dropout_transition=0[mix]`);
  filters.push(`[mix]loudnorm=I=-15:TP=-1.5:LRA=11[aout]`);
} else {
  filters.push(`[voice]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
}

const out = path.join(HERE, 'Exit-Interviews.mp4');
args.push(
  '-filter_complex', filters.join(';'),
  '-map', '0:v', '-map', '[aout]',
  // Kept deliberately light: this machine runs with under a gigabyte free, and x264 at
  // preset slow with all cores holds enough 1080p frames in flight to fail its malloc.
  // Two threads and a short lookahead cost a little size, not quality.
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
  '-threads', '2', '-x264-params', 'rc-lookahead=20:sync-lookahead=0:threads=2',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
  '-shortest', '-movflags', '+faststart',
  out,
);

execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`\n${path.basename(out)} — ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
