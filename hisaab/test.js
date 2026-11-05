// End-to-end checks against a throwaway database: node test.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dostab-'));
const { app, equalShares, parseAmount } = require('./server');

// unit: money
assert.strictEqual(parseAmount('1,250.5'), 125050);
assert.throws(() => parseAmount('12.345'));
assert.throws(() => parseAmount('-5'));
for (const [amt, n] of [[100000, 3], [1, 6], [99999, 7], [600000, 6]]) {
  const s = equalShares(amt, Array.from({ length: n }, (_, i) => i + 1), 2);
  assert.strictEqual(s.reduce((a, x) => a + x.share, 0), amt);
  assert.ok(Math.max(...s.map((x) => x.share)) - Math.min(...s.map((x) => x.share)) <= 1);
}

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
function client() {
  let cookie = '';
  return async (p, body, method) => {
    const r = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const j = await r.json(); if (j && typeof j === 'object') j._status = r.status; return j;
  };
}
const debt = (g, from, to) => g.debts.find((d) => d.from === from && d.to === to)?.amount || 0;
const sumZero = (g) => assert.strictEqual(Object.values(g.balances).reduce((a, v) => a + v, 0), 0);

(async () => {
  const ali = client(), sara = client(), bilal = client();
  assert.strictEqual((await ali('/signup', { name: 'Ali', email: 'Ali@x.com', password: 'secret1' })).ok, true);
  assert.strictEqual((await sara('/signup', { name: 'Sara', email: 'sara@x.com', password: 'secret2', phone: '0300-1234567' })).ok, true);
  assert.strictEqual((await ali('/signup', { name: 'Ali', email: 'ali@x.com', password: 'x123456' }))._status, 400, 'duplicate signup');
  assert.strictEqual((await bilal('/login', { email: 'sara@x.com', password: 'wrong!' }))._status, 401);

  const { id: gid } = await ali('/groups', { name: 'Soup night' });
  const me = (await ali('/me')).user;
  const s = (await ali(`/groups/${gid}/members`, { email: 'sara@x.com' })).member;
  const b = (await ali(`/groups/${gid}/members`, { email: 'bilal@x.com', name: 'Bilal' })).member; // not signed up yet
  const extra = [];
  for (const n of ['d', 'e', 'f']) extra.push((await ali(`/groups/${gid}/members`, { email: `${n}@x.com`, name: n.toUpperCase() })).member.id);
  assert.strictEqual((await ali(`/groups/${gid}/members`, { email: 'sara@x.com' }))._status, 400, 'no double add');
  assert.strictEqual(b.registered, false);

  // outsiders cannot see the group
  assert.strictEqual((await bilal(`/groups/${gid}`))._status, 401);
  const outsider = client(); await outsider('/signup', { name: 'Zed', email: 'z@x.com', password: 'secret9' });
  assert.strictEqual((await outsider(`/groups/${gid}`))._status, 404);
  assert.strictEqual((await outsider(`/friends/${me.id}`))._status, 404);

  // 6 friends, soup Rs 1000 paid by Ali, equal split -> each owes Ali directly
  const six = [me.id, s.id, b.id, ...extra];
  await ali(`/groups/${gid}/expenses`, { description: 'Soup', amount: '1000', paid_by: me.id, date: '2026-10-27', split_type: 'equal', participants: six });
  let g = await sara(`/groups/${gid}`);
  assert.strictEqual(g.expenses[0].shares.reduce((a, x) => a + x.share, 0), 100000);
  assert.strictEqual(g.balances[me.id], 100000 - 16667);
  assert.strictEqual(debt(g, b.id, me.id), 16667);
  assert.strictEqual(g.debts.length, 5);
  sumZero(g);

  // exact split must add up
  const badExact = await sara(`/groups/${gid}/expenses`, { description: 'Taxi', amount: '500', paid_by: s.id, date: '2026-10-27', split_type: 'exact', exact: { [me.id]: '200', [s.id]: '200' } });
  assert.strictEqual(badExact._status, 400); assert.match(badExact.error, /off by Rs 100/);
  const taxi = await sara(`/groups/${gid}/expenses`, { description: 'Taxi', amount: '500', paid_by: s.id, date: '2026-10-27', split_type: 'exact', exact: { [me.id]: '200', [s.id]: '300' } });
  g = await ali(`/groups/${gid}`);
  assert.strictEqual(debt(g, me.id, s.id), 20000 - 16667, 'opposite debts between a pair cancel');

  // Bilal signs up later with the invited email -> lands in the group with his share
  assert.strictEqual((await bilal('/signup', { name: 'Bilal Khan', email: 'BILAL@x.com', password: 'secret3' })).ok, true);
  const bg = await bilal('/groups');
  assert.strictEqual(bg.length, 1); assert.strictEqual(bg[0].my_balance, -16667);

  // edit + second trip with Sara -> friend total spans both groups
  await ali(`/groups/${gid}/expenses/${taxi.id}`, { description: 'Taxi', amount: '600', paid_by: s.id, date: '2026-10-27', split_type: 'exact', exact: { [me.id]: '300', [s.id]: '300' } }, 'PUT');
  const { id: gid2 } = await sara('/groups', { name: 'Hotel trip' });
  await sara(`/groups/${gid2}/members`, { email: 'ali@x.com' });
  await sara(`/groups/${gid2}/expenses`, { description: 'Hotel', amount: '2000', paid_by: s.id, date: '2026-10-28', split_type: 'equal', participants: [me.id, s.id] });
  let fr = await ali(`/friends/${s.id}`);
  assert.strictEqual(fr.total, -(30000 - 16667) - 100000, 'Ali owes Sara across both trips');
  assert.strictEqual(fr.groups.length, 2);
  const saraView = (await sara('/friends')).find((f) => f.id === me.id);
  assert.strictEqual(saraView.total, -fr.total, 'both sides see the same number');

  // reminders: across groups, rate limited, only when they owe you
  assert.strictEqual((await ali(`/friends/${s.id}/remind`, {}))._status, 400, 'Sara owes Ali nothing');
  const r1 = await sara(`/friends/${me.id}/remind`, {});
  assert.strictEqual(r1.total, 113333); assert.match(r1.message, /Rs 1,133\.33/); assert.match(r1.message, /Hotel trip: Rs 1,000/);
  assert.strictEqual((await sara(`/groups/${gid}/remind`, { to_user: me.id }))._status, 400, 'rate limit');
  assert.strictEqual((await ali('/me')).reminders.length, 2);
  const r2 = await ali(`/groups/${gid}/remind`, { to_user: b.id });
  assert.match(r2.message, /Rs 166\.67/);

  // settle everything with Sara in one go
  await ali(`/friends/${s.id}/settle`, {});
  fr = await ali(`/friends/${s.id}`);
  assert.strictEqual(fr.total, 0); assert.ok(fr.groups.every((x) => x.amount === 0));
  assert.strictEqual((await ali(`/friends/${s.id}/settle`, {}))._status, 400, 'nothing left to settle');
  sumZero(await ali(`/groups/${gid}`)); sumZero(await ali(`/groups/${gid2}`));

  // payment, member removal guard, delete
  await bilal(`/groups/${gid}/payments`, { from_user: b.id, to_user: me.id, amount: '166.67', date: '2026-10-28' });
  g = await ali(`/groups/${gid}`);
  assert.strictEqual(g.balances[b.id], 0);
  assert.strictEqual((await ali(`/groups/${gid}/members/${extra[0]}`, null, 'DELETE'))._status, 400, 'cannot remove with open debt');
  assert.strictEqual((await ali(`/groups/${gid}/members/${b.id}`, null, 'DELETE')).ok, true);
  await ali(`/groups/${gid}/expenses/${taxi.id}`, null, 'DELETE');
  g = await ali(`/groups/${gid}`);
  assert.strictEqual(g.expenses.length, 1); sumZero(g);
  assert.ok(g.activity.some((a) => /deleted/.test(a.text)) && g.activity.some((a) => /edited/.test(a.text)));

  // invite link
  assert.strictEqual((await outsider(`/join/${g.group.invite_code}`, {})).id, gid);
  console.log('All tests passed');
  server.close();
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
