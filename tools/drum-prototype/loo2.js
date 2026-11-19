// LOO through production readDrum + the sheet-history tie rule from extractKM.js
process.chdir('C:/Raftar/ai-agent-starter');
const { readDrum } = require('C:/Raftar/ai-agent-starter/src/vision/readDrum');
const fs = require('fs');
const T = {'1792998882259':'41824','1793073064429':'41874','1793084127036':'41934','1793160595222':'41961','1793170271349':'42004','1793246835045':'42036','1793246839658':'42036','1793257619351':'42073','1793257624114':'42073','1793678885084':'42181','1793678889022':'42181','1793689784504':'42221','1793765320261':'42276','1793765322614':'42276','1793778403924':'42375','1793849466830':'-','1793850085542':'42415','1793850090987':'42415','1793862270500':'42494','1793937668544':'42536','1793937676563':'42536','1793946739444':'42572','1794283743177':'42623','1794283745860':'42623','1794297695575':'42748','1794297699569':'42748','1794467672066':'42930','1794542366387':'42978','1794542369439':'42978','1794887410579':'05143','1794887413225':'05143','1794901874540':'05270','1794975002466':'43119','1794986082671':'43159','1795061555296':'43218','1795070508904':'43265'};
// [iso, fpu, ldo]
const H = [['2026-10-20',41477,41518],['2026-10-26',41768,41824],['2026-10-27',41874,41934],['2026-10-28',41961,42004],['2026-10-29',42036,42073],['2026-11-03',42181,42221],['2026-11-04',42276,42375],['2026-11-05',42415,42494],['2026-11-06',42536,42572],['2026-11-10',42623,42748]];
function refFor(v) { // what getLastReading would have returned when this photo arrived
  for (let i = 0; i < H.length; i++) {
    if (H[i][1] === v) return { km: H[i - 1][2], days: Math.round((Date.parse(H[i][0]) - Date.parse(H[i - 1][0])) / 864e5) };
    if (H[i][2] === v) return { km: H[i][1], days: 0 };
  }
  return null;
}
(async () => {
  let ok = 0, ref = 0, wrong = 0;
  for (const [id, t] of Object.entries(T)) {
    let r = await readDrum(fs.readFileSync(`tools/drum-prototype/gul/${id}_Umer_Farooq_.jpg`), { exclude: t });
    let note = '';
    if (!r.ok && r.candidates) {
      const R = refFor(+t);
      if (R) { const max = R.days === 0 ? 120 : 150 * R.days; const keep = r.candidates.filter(k => k >= R.km && k - R.km <= max); note = ` [cands ${r.candidates} ref ${R.km} +${max} -> ${keep}]`; if (keep.length === 1) r = { ok: true, text: String(keep[0]) }; }
    }
    const good = t === '-' ? !r.ok : r.ok && r.text === t;
    if (!r.ok) ref++; else if (good) ok++; else wrong++;
    console.log(id, t, r.ok ? r.text : 'REFUSE ' + r.reason, note, r.ok && !good ? '<< WRONG' : '');
  }
  console.log(`read ${ok}  refused ${ref}  WRONG ${wrong}`);
})();
