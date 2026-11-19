const L = require('C:/Raftar/ai-agent-starter/src/sheets/logisticsClient');
(async () => { const [hub, iso] = process.argv.slice(2); console.log(await L.forHub(hub).markOff(hub, iso)); const f = await L.forHub(hub).findHubRow(hub, iso); console.log(JSON.stringify(f && f.row)); })();
