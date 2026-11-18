const { render } = require('C:/Raftar/ai-agent-starter/src/web/dashboard');
(async () => { const q = JSON.parse(process.argv[3]); require('fs').writeFileSync(process.argv[2], await render({ query: q }, { user: 'x' })); console.log('ok'); })().catch(e => console.log('ERR', e.message));
