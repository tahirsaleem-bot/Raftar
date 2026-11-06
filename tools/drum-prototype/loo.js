// leave-one-out over the labelled set + today's unlabelled photos, through the production module
process.chdir('C:/Raftar/ai-agent-starter');
const { readDrum } = require('C:/Raftar/ai-agent-starter/src/vision/readDrum');
const fs = require('fs');
const T = {'1792998882259':'41824','1793073064429':'41874','1793084127036':'41934','1793160595222':'41961','1793170271349':'42004','1793246835045':'42036','1793246839658':'42036','1793257619351':'42073','1793257624114':'42073','1793678885084':'42181','1793678889022':'42181','1793689784504':'42221','1793765320261':'42276','1793765322614':'42276','1793778403924':'42375','1793849466830':'-','1793850085542':'42415','1793850090987':'42415','1793862270500':'42494','1793937668544':'42536','1793937676563':'42536'};
(async () => {
  let ok = 0, ref = 0, wrong = 0;
  for (const [id, t] of Object.entries(T)) {
    const r = await readDrum(fs.readFileSync(`tools/drum-prototype/gul/${id}_Umer_Farooq_.jpg`), { exclude: t });
    const good = t === '-' ? !r.ok : r.ok && r.text === t;
    if (!r.ok) ref++; else if (good) ok++; else wrong++;
    console.log(id, t, r.ok ? r.text : 'REFUSE ' + r.reason, r.ok && !good ? '<< WRONG' : '');
  }
  console.log(`read ${ok}  refused ${ref}  WRONG ${wrong}`);
})();
