const { render } = require('C:/Raftar/ai-agent-starter/src/web/dashboard');
const out = process.argv[2];
(async () => { const html = await render({ query: process.argv[3] ? { date: process.argv[3] } : {} }, { user: 'tahir.saleem@niete.edu.pk', hasLogo: true }); require('fs').writeFileSync(out, html); console.log('written', html.length); })().catch(e => console.log('ERR', e.stack));
