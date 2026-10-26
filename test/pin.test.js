// The PIN is the only thing between a public URL and a folder of exit interview records.
// These tests run against the real server, because what is being checked is the HTTP
// behaviour an attacker would see, not a function in isolation.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { sandbox, stubRender, stubGoogle } = require('./helpers');

sandbox();
process.env.APP_PIN = '123456';
process.env.PORT = '0';            // let the OS pick a free port
process.env.NOTIFY = 'false';
stubRender();
stubGoogle();

const engine = require('../src/engine');
const alerts = [];
engine.alertPinAttack = async (client, misses) => { alerts.push({ client, misses }); };

const app = require('../src/server');
let base;
const server = app.listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; });
after(() => server.close());

const ready = () => new Promise(r => (server.listening ? r() : server.once('listening', r)));

// Each test needs its own client identity, since the limiter counts per address.
let n = 0;
const as = () => '10.0.0.' + (++n);

const get = (path, pin, client) =>
  fetch(base + path, { headers: { 'x-pin': pin || '', 'x-forwarded-for': client } });

test('the right PIN gets in', async () => {
  await ready();
  const r = await get('/api/cases', '123456', as());
  assert.equal(r.status, 200);
});

test('a wrong PIN is refused', async () => {
  const r = await get('/api/cases', '000000', as());
  assert.equal(r.status, 401);
});

test('no PIN is refused', async () => {
  const r = await get('/api/cases', '', as());
  assert.equal(r.status, 401);
});

test('guessing is slowed down, then locked out', async () => {
  const client = as();
  for (let i = 0; i < 9; i++) {
    const r = await get('/api/cases', '00000' + (i % 10), client);
    assert.equal(r.status, 401, 'still answering while under the limit');
  }
  const locked = await get('/api/cases', '999999', client);
  assert.equal(locked.status, 429, 'locked out on the tenth miss');
  assert.ok(Number(locked.headers.get('retry-after')) > 0, 'and says for how long');
});

test('the lockout holds even against the correct PIN', async () => {
  const client = as();
  for (let i = 0; i < 10; i++) await get('/api/cases', '000000', client);
  const r = await get('/api/cases', '123456', client);
  assert.equal(r.status, 429, 'someone who just guessed 10 times does not get a free pass');
});

test('one client being locked out does not affect anyone else', async () => {
  const attacker = as();
  for (let i = 0; i < 10; i++) await get('/api/cases', '000000', attacker);
  const r = await get('/api/cases', '123456', as());
  assert.equal(r.status, 200, 'Tahir can still get in from his phone');
});

test('a lockout is reported, once', async () => {
  const before = alerts.length;
  const client = as();
  for (let i = 0; i < 14; i++) await get('/api/cases', '000000', client);
  assert.equal(alerts.length, before + 1, 'told about it, not spammed with it');
  assert.equal(alerts[alerts.length - 1].client, client);
});

test('a good PIN clears the misses behind it', async () => {
  const client = as();
  for (let i = 0; i < 5; i++) await get('/api/cases', '000000', client);
  assert.equal((await get('/api/cases', '123456', client)).status, 200);
  for (let i = 0; i < 9; i++) {
    assert.equal((await get('/api/cases', '000000', client)).status, 401,
      'the counter restarted, so a fat-fingered day does not lock the owner out');
  }
});

test('health is public, everything else is not', async () => {
  assert.equal((await fetch(base + '/health')).status, 200);
  for (const p of ['/api/cases', '/api/register', '/api/status']) {
    assert.equal((await fetch(base + p)).status, 401, p + ' must not be open');
  }
});
