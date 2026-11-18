const L = require('C:/Raftar/ai-agent-starter/src/sheets/logisticsClient');
const [hub, date, km] = process.argv.slice(2);
(async () => { const R = L.forHub(hub); console.log(await R.updateLDOAndTotal(hub, date, +km)); const f = await R.findHubRow(hub, date); console.log(JSON.stringify(f && f.row)); })();
