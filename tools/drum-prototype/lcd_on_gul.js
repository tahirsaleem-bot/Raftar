// Does the LCD fallback ever read a number off a Gulraiz drum photo? (it must refuse all of them)
process.chdir('C:/Raftar/ai-agent-starter');
const { readMeter } = require('C:/Raftar/ai-agent-starter/src/vision/readSevenSeg');
const fs = require('fs');
(async () => {
  const dir = 'tools/drum-prototype/gul/';
  const fl = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).map(f => dir + f).concat(['1794887410579', '1794887413225', '1794802251173', '1794802256321', '1794811430234'].map(i => `tools/drum-prototype/new/${i}_Umer_Farooq_.jpg`));
  let ok = 0;
  for (const f of fl) {
    const r = await readMeter(fs.readFileSync(f), { integer: false });
    console.log(r.ok ? 'READ ' + r.km : 'refuse', f.split('/').pop(), r.ok ? '' : r.reason);
    if (r.ok) ok++;
  }
  console.log('photos', fl.length, 'LCD read', ok);
})();
