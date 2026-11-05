// Synthesises the sound kit as 16-bit WAVs — no downloads, identical every run.
const fs = require('fs'), path = require('path');
const SR = 44100, OUT = path.join(__dirname, '..', 'public', 'sfx');

function wav(file, samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  fs.writeFileSync(path.join(OUT, file), buf);
}
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;

// Tap: short pitch-dropping sine pop with a click transient.
wav('tap.wav', Array.from({ length: SR * 0.12 }, (_, i) => {
  const t = i / SR, f = 1400 - 900 * Math.min(1, t / 0.05);
  return 0.55 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 45) + (i < 60 ? rnd() * 0.3 : 0);
}));

// Whoosh: low-passed noise swelling then falling away.
{
  let lp = 0; const n = SR * 0.45;
  wav('whoosh.wav', Array.from({ length: n }, (_, i) => {
    const t = i / n, env = Math.sin(Math.PI * t) ** 2, a = 0.04 + 0.25 * env;
    lp += a * (rnd() - lp);
    return lp * env * 1.6;
  }));
}

// Chime for the intro / outro: two soft bell partials.
wav('chime.wav', Array.from({ length: SR * 1.6 }, (_, i) => {
  const t = i / SR, e = Math.exp(-t * 3);
  return 0.28 * e * (Math.sin(2 * Math.PI * 880 * t) + 0.5 * Math.sin(2 * Math.PI * 1320 * t) + 0.25 * Math.sin(2 * Math.PI * 1760 * t));
}));

// Music bed: warm detuned pad + gentle plucks, 96 BPM, Cmaj7 – Am7 – Fmaj7 – G6.
{
  const bpm = 96, beat = 60 / bpm, secs = 75, n = SR * secs;
  const chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]];
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, bar = Math.floor(t / (beat * 4)), ch = chords[bar % 4];
    const inBar = (t % (beat * 4)) / (beat * 4);
    const xf = Math.min(1, inBar * 8);
    let s = 0;
    for (const m of ch) for (const d of [-0.12, 0.12]) s += Math.sin(2 * Math.PI * hz(m + 12) * (1 + d / 100) * t);
    out[i] = s * 0.018 * (0.7 + 0.3 * xf);
    // pluck arpeggio on eighth notes
    const step = Math.floor(t / (beat / 2)), tt = t - step * (beat / 2);
    const note = ch[[0, 2, 1, 3, 2, 1, 3, 2][step % 8]] + 24;
    out[i] += 0.07 * Math.sin(2 * Math.PI * hz(note) * tt) * Math.exp(-tt * 9);
    // soft kick on beats 1 and 3
    const kb = t % (beat * 2);
    out[i] += 0.16 * Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-kb * 30)) * kb) * Math.exp(-kb * 9);
  }
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] *= Math.min(1, t / 1.5) * Math.min(1, (secs - t) / 3); }
  wav('music.wav', Array.from(out));
}
console.log('sfx written');
