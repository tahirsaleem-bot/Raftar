// end-to-end: refused photo -> kept -> sheet has the value -> learnt -> read
process.chdir('C:/Raftar/ai-agent-starter');
const fs = require('fs');
const { extractKMFromImage } = require('C:/Raftar/ai-agent-starter/src/vision/extractKM');
const learn = require('C:/Raftar/ai-agent-starter/src/vision/drumLearn');
const { LEARNT_DIR } = require('C:/Raftar/ai-agent-starter/src/vision/readDrum');
const buf = fs.readFileSync('tools/drum-prototype/new/1794986082671_Umer_Farooq_.jpg');
(async () => {
  let r = await extractKMFromImage(buf, 't', { hubName: 'Gulraiz car chowk', meterType: 'odometer' });
  console.log('1 first read:', JSON.stringify(r));
  await new Promise(s => setTimeout(s, 500));
  console.log('2 pending:', fs.readFileSync(learn.PENDING_DIR + '/pending.json', 'utf8').replace(/\s+/g, ' '));
  await learn.learnFromSheet();
  console.log('3 learnt files:', fs.existsSync(LEARNT_DIR) ? fs.readdirSync(LEARNT_DIR) : []);
  r = await extractKMFromImage(buf, 't', { hubName: 'Gulraiz car chowk', meterType: 'odometer' });
  console.log('4 read again:', JSON.stringify(r));
})();
