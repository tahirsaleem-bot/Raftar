// Cuts one continuous recording into the film's lines.
//
// The obvious way - split on every long pause - does not work: read naturally, the pauses
// between lines are no longer than the pauses inside them. Measured on the first take, a
// 2-second threshold returned the whole recording as a single block, and a 0.9-second one
// returned fourteen pieces that happened to number fourteen but were nothing like the
// lines (19s where the line is 8s; 1.7s where it is 6s).
//
// So the cut is chosen rather than found. Every pause above a low threshold is a
// candidate; the generated clips give the relative length of each line; and a dynamic
// program picks the thirteen boundaries whose resulting segments best match those
// relative lengths, preferring longer pauses where the fit is otherwise equal. The result
// is reported line by line with its error, and written as a page of players so it can be
// listened through in a minute rather than trusted.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = require('ffmpeg-static');

const HERE = __dirname;
const VO = path.join(HERE, 'vo');
const MIN_PAUSE = 0.30;        // a candidate must be at least this long
const NOISE = '-32dB';
const PAUSE_BONUS = 2.2;       // seconds of error a long pause is worth "buying"

const take = process.argv[2];
if (!take || !fs.existsSync(take)) {
  console.error('usage: node split-take.js <recording>');
  process.exit(1);
}

const run = args => (spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 64 << 20 }).stderr || '');

function duration(file) {
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(run(['-i', file]));
  if (!m) throw new Error('cannot read duration of ' + file);
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

const TOTAL = duration(take);

// --- candidate pauses -------------------------------------------------------
const det = run(['-i', take, '-af', `silencedetect=noise=${NOISE}:d=${MIN_PAUSE}`, '-f', 'null', '-']);
const starts = [...det.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => +m[1]);
const ends = [...det.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => +m[1]);
const pauses = starts
  .map((s, i) => ({ s, e: ends[i] != null ? ends[i] : TOTAL }))
  .filter(p => p.e > p.s && p.s > 1 && p.e < TOTAL - 1)
  .map(p => ({ ...p, mid: (p.s + p.e) / 2, len: p.e - p.s }));

// --- what each line should weigh -------------------------------------------
const script = JSON.parse(fs.readFileSync(path.join(HERE, 'script.json'), 'utf8'));
const ids = script.lines.map(l => l.id);
const generated = ids.map(id => {
  const f = path.join(VO, id, 'audio.mp3');
  if (!fs.existsSync(f)) throw new Error(`no generated clip for ${id} to size against — run tts.js first`);
  return duration(f);
});
const scale = TOTAL / generated.reduce((a, b) => a + b, 0);
const want = generated.map(d => d * scale);

console.log(`recording ${TOTAL.toFixed(1)}s · ${pauses.length} candidate pauses · ${ids.length} lines`);

// --- choose the boundaries --------------------------------------------------
// best[k][j] = least cost for placing the first k lines with a boundary at pause j.
const N = pauses.length, L = ids.length;
if (N < L - 1) throw new Error(`only ${N} pauses for ${L} lines — the recording cannot be cut this way`);

const INF = Infinity;
const best = Array.from({ length: L }, () => new Float64Array(N).fill(INF));
const from = Array.from({ length: L }, () => new Int32Array(N).fill(-1));

for (let j = 0; j < N; j++) {
  best[0][j] = Math.abs(pauses[j].mid - want[0]) - PAUSE_BONUS * pauses[j].len;
}
for (let k = 1; k < L - 1; k++) {
  for (let j = k; j < N; j++) {
    for (let i = k - 1; i < j; i++) {
      if (best[k - 1][i] === INF) continue;
      const seg = pauses[j].mid - pauses[i].mid;
      const c = best[k - 1][i] + Math.abs(seg - want[k]) - PAUSE_BONUS * pauses[j].len;
      if (c < best[k][j]) { best[k][j] = c; from[k][j] = i; }
    }
  }
}
// the last line runs from the final boundary to the end of the recording
let endCost = INF, endAt = -1;
for (let j = L - 2; j < N; j++) {
  if (best[L - 2][j] === INF) continue;
  const c = best[L - 2][j] + Math.abs((TOTAL - pauses[j].mid) - want[L - 1]);
  if (c < endCost) { endCost = c; endAt = j; }
}
if (endAt < 0) throw new Error('no usable arrangement of pauses');

const chosen = [];
for (let k = L - 2, j = endAt; k >= 0; k--) { chosen.unshift(j); j = from[k][j]; }

// --- cut --------------------------------------------------------------------
const cuts = [0, ...chosen.map(j => pauses[j].mid), TOTAL];
console.log('\n  line   cut            length   expected   difference');
let worst = 0;
const rows = [];
ids.forEach((id, i) => {
  const a = cuts[i], b = cuts[i + 1], got = b - a, exp = want[i];
  const err = got - exp;
  worst = Math.max(worst, Math.abs(err) / exp);
  rows.push({ id, a, b, got, exp, err, text: script.lines[i].text });
  console.log(`  ${id.padEnd(5)}  ${a.toFixed(1).padStart(6)}s        `
    + `${got.toFixed(1).padStart(5)}s   ${exp.toFixed(1).padStart(6)}s   `
    + `${(err >= 0 ? '+' : '') + err.toFixed(1)}s`);
});

const dir = path.join(HERE, 'vo-split');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
rows.forEach(r => {
  // A little air each side so a word is never clipped; the pause is silent anyway.
  const a = Math.max(0, r.a - 0.12), b = Math.min(TOTAL, r.b + 0.12);
  spawnSync(FFMPEG, ['-y', '-ss', String(a), '-to', String(b), '-i', take,
    '-ac', '1', '-ar', '24000', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-b:a', '48k', path.join(dir, r.id + '.mp3')], { stdio: ['ignore', 'ignore', 'pipe'] });
});

fs.writeFileSync(path.join(HERE, 'split-report.json'),
  JSON.stringify({ take, total: TOTAL, worstError: worst, rows }, null, 2));
console.log(`\nworst line is ${(worst * 100).toFixed(0)}% off its expected length`);
console.log(`wrote ${rows.length} clips to vo-split/ and split-report.json`);
