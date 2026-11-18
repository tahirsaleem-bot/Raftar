const L = require('C:/Raftar/ai-agent-starter/src/sheets/logisticsClient');
(async () => { const f = await L.findHubRow(process.argv[2], process.argv[3]); console.log(JSON.stringify(f && f.row)); })();
