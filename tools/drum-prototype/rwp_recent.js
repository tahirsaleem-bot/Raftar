const L = require('C:/Raftar/ai-agent-starter/src/sheets/logisticsClient');
(async () => { const R = L.forFleet('rawalpindi'); const r = await R.getAllRows(); r.slice(-14).forEach(x => console.log(JSON.stringify(x))); })();
