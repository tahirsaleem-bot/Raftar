// Dostab client — vanilla JS, hash routing. Amounts arrive from the server in paisa.
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
let me = null;
let G = null; // current group payload
let groupTab = 'expenses';
let homeTab = 'groups';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (p) => {
  const a = Math.abs(p), r = Math.floor(a / 100), d = a % 100;
  return 'Rs ' + r.toLocaleString('en-PK') + (d ? '.' + String(d).padStart(2, '0') : '');
};
const toPaisa = (v) => {
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, p = ''] = s.split('.');
  return Number(r) * 100 + Number((p + '00').slice(0, 2));
};
const toRs = (p) => (p / 100).toFixed(2).replace(/\.00$/, '');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const COLORS = ['#047857', '#1d4ed8', '#7c3aed', '#be185d', '#b45309', '#0e7490', '#4d7c0f', '#9f1239'];
const avatar = (u, style = '') => `<span class="avatar" style="background:${COLORS[u.id % COLORS.length]};${style}" aria-hidden="true">${esc((u.name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span>`;
const icon = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8H8M16 12H8M13 16H8"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px;vertical-align:-3px"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;color:var(--muted)"><path d="M9 18l6-6-6-6"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/></svg>',
};

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/signup')) { me = null; renderAuth(); throw new Error(data.error || 'Please log in'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

let toastTimer;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (isErr ? ' error' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), isErr ? 4500 : 2500);
}
// Disable the button while a request runs so double-taps can't add an expense twice.
async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
}

// ---------- sheet ----------
let sheetReturnFocus;
function openSheet(title, html, onMount) {
  if ($('#sheet').hidden) sheetReturnFocus = document.activeElement;
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  onMount?.($('#sheetBody'));
  setTimeout(() => ($('#sheetBody input:not([type=checkbox]):not([type=hidden])') || $('#sheet .sheet-head .icon-btn')).focus(), 50);
}
function closeSheet() {
  if ($('#sheet').hidden) return;
  $('#sheet').hidden = true; document.body.style.overflow = '';
  sheetReturnFocus?.focus?.();
}
$('#sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// ---------- routing ----------
function route() {
  if (location.pathname.startsWith('/join/')) history.replaceState(null, '', '/#/join/' + location.pathname.split('/')[2]);
  const h = location.hash.slice(1);
  if (!me) { if (h && h !== '/') sessionStorage.setItem('after', h); return renderAuth(); }
  const after = sessionStorage.getItem('after');
  if (after) { sessionStorage.removeItem('after'); if (after !== h) { location.hash = after; return; } }
  closeSheet();
  let m;
  if ((m = h.match(/^\/g\/(\d+)/))) return renderGroup(Number(m[1]));
  if ((m = h.match(/^\/join\/([\w-]+)/))) return renderJoin(m[1]);
  renderHome();
}
window.addEventListener('hashchange', route);
$('#backBtn').onclick = () => (location.hash = '/');
$('#profileBtn').onclick = openProfile;

function chrome(title, back) {
  $('#topbar').hidden = false; $('#title').textContent = title; $('#backBtn').hidden = !back;
  document.title = title === 'Dostab' ? 'Dostab — Split with friends' : `${title} · Dostab`;
}
const loading = () => (app.innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>');
const owedLabel = (b, them) => {
  if (!b) return '<span class="tiny muted">Settled up</span>';
  return b > 0 ? `<span class="tiny muted">${them ? 'owes you' : 'you are owed'}</span><b class="get num">${fmt(b)}</b>`
    : `<span class="tiny muted">${them ? 'you owe' : 'you owe'}</span><b class="owe num">${fmt(-b)}</b>`;
};

// ---------- auth ----------
function renderAuth(mode = 'login') {
  $('#topbar').hidden = true;
  app.innerHTML = `
  <div class="auth">
    <div class="brand"><span class="logo">D</span><h1>Dostab</h1><p class="muted">Split trips, dinners and hotels with friends — every rupee, exactly.</p></div>
    <div class="card stack">
      <div class="seg" role="group" aria-label="Log in or sign up">
        <button type="button" data-mode="login" aria-pressed="${mode === 'login'}">Log in</button>
        <button type="button" data-mode="signup" aria-pressed="${mode === 'signup'}">Sign up</button>
      </div>
      <form id="authForm" class="stack" novalidate>
        ${mode === 'signup' ? `<label class="field"><span>Your name</span><input class="input" name="name" autocomplete="name" required maxlength="40"></label>` : ''}
        <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" inputmode="email" required></label>
        <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required minlength="6">
          ${mode === 'signup' ? '<div class="help">At least 6 characters</div>' : ''}</label>
        ${mode === 'signup' ? `<label class="field"><span>WhatsApp number <span class="muted">(optional)</span></span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="03001234567" autocomplete="tel"><div class="help">Lets friends send you reminders on WhatsApp</div></label>` : ''}
        <p class="err" id="authErr" role="alert"></p>
        <button class="btn btn-primary btn-block" type="submit">${mode === 'signup' ? 'Create account' : 'Log in'}</button>
      </form>
      ${mode === 'signup' ? '<p class="help">If a friend already added your email to a group, sign up with that same email and you will land straight in the group.</p>' : ''}
    </div>
  </div>`;
  app.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => renderAuth(b.dataset.mode)));
  $('#authForm').onsubmit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    busy(e.target.querySelector('button[type=submit]'), async () => {
      try { await api('/' + mode, { body }); } catch (err) { $('#authErr').textContent = err.message; return; }
      await boot();
    });
  };
  $('#authForm input').focus();
}

// ---------- home ----------
async function renderHome() {
  chrome('Dostab', false); loading();
  const [groups, friends, meData] = await Promise.all([api('/groups'), api('/friends'), api('/me')]);
  me = meData.user;
  const owed = friends.filter((f) => f.total > 0).reduce((a, f) => a + f.total, 0);
  const owe = friends.filter((f) => f.total < 0).reduce((a, f) => a - f.total, 0);
  app.innerHTML = `
    <p class="muted" style="margin:0 0 12px">Hi, <b style="color:var(--fg)">${esc(me.name)}</b></p>
    ${remindersHtml(meData.reminders)}
    <div class="summary" style="margin-top:12px">
      <div class="card"><div class="small muted">You are owed</div><div class="big get num">${fmt(owed)}</div></div>
      <div class="card"><div class="small muted">You owe</div><div class="big owe num">${fmt(owe)}</div></div>
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" data-home="groups" aria-selected="${homeTab === 'groups'}">Groups</button>
      <button role="tab" data-home="friends" aria-selected="${homeTab === 'friends'}">Friends</button>
    </div>
    <div id="homeBody"></div>
    <div class="fab-bar"><button class="btn btn-primary btn-block" id="newGroup">${icon.plus} New group</button></div>`;
  const draw = () => {
    const el = $('#homeBody');
    if (homeTab === 'groups') {
      el.innerHTML = groups.length ? `<div class="list">${groups.map((g) => `
        <a class="item" href="#/g/${g.id}">
          <span class="avatar" style="background:${COLORS[g.id % COLORS.length]};border-radius:12px">${icon.users}</span>
          <span class="grow"><span class="bold ellipsis" style="display:block">${esc(g.name)}</span><span class="tiny muted">${g.member_count} members</span></span>
          <span class="amt">${owedLabel(g.my_balance)}</span>
        </a>`).join('')}</div>`
        : `<div class="card empty">${icon.users}<p><b>No groups yet</b><br>Create a group for a trip, a hotel stay or a night out, then add your friends.</p></div>`;
    } else {
      el.innerHTML = friends.length ? `<div class="list">${friends.map((f) => `
        <button class="item" data-friend="${f.id}">${avatar(f)}
          <span class="grow"><span class="bold ellipsis" style="display:block">${esc(f.name)}</span><span class="tiny muted">${f.groups.length} shared group${f.groups.length > 1 ? 's' : ''}</span></span>
          <span class="amt">${owedLabel(f.total, true)}</span>${icon.chev}
        </button>`).join('')}</div>
        <p class="help">Totals across every group you share — tap a friend to see the breakdown, remind or settle up.</p>`
        : `<div class="card empty">${icon.user}<p><b>No friends yet</b><br>Friends appear here once you share a group.</p></div>`;
      el.querySelectorAll('[data-friend]').forEach((b) => (b.onclick = () => openFriend(Number(b.dataset.friend))));
    }
  };
  app.querySelectorAll('[data-home]').forEach((b) => (b.onclick = () => { homeTab = b.dataset.home; app.querySelectorAll('[data-home]').forEach((x) => x.setAttribute('aria-selected', x === b)); draw(); }));
  draw();
  $('#newGroup').onclick = openNewGroup;
  bindReminders();
}
function remindersHtml(list) {
  return list.map((r) => `
    <div class="banner" style="margin-bottom:8px">${icon.bell}
      <div class="grow small"><b>${esc(r.from_name)}</b> sent a reminder: you owe <b class="num">${fmt(r.amount)}</b> in "${esc(r.group_name)}".
        <div class="btn-row" style="margin-top:8px"><a class="btn btn-ghost btn-sm" href="#/g/${r.group_id}">View</a><button class="btn btn-ghost btn-sm" data-seen="${r.id}">Dismiss</button></div>
      </div>
    </div>`).join('');
}
function bindReminders() {
  app.querySelectorAll('[data-seen]').forEach((b) => (b.onclick = () => busy(b, async () => {
    await api(`/reminders/${b.dataset.seen}/seen`, { method: 'POST' });
    b.closest('.banner').remove();
  })));
}
function openNewGroup() {
  openSheet('New group', `
    <form class="stack" id="ngForm">
      <label class="field"><span>Group name</span><input class="input" name="name" required maxlength="50" placeholder="e.g. Murree Trip, Friday Dinners"></label>
      <button class="btn btn-primary btn-block" type="submit">Create group</button>
    </form>`, (el) => {
    $('#ngForm', el).onsubmit = (e) => {
      e.preventDefault();
      busy(e.submitter, async () => {
        const { id } = await api('/groups', { body: { name: e.target.name.value } });
        closeSheet(); location.hash = `/g/${id}`;
      });
    };
  });
}

// ---------- friend (all groups) ----------
async function openFriend(uid) {
  let f;
  try { f = await api('/friends/' + uid); } catch (e) { return toast(e.message, true); }
  const t = f.total;
  openSheet(f.name, `
    <div class="stack">
      <div class="card hero ${t < 0 ? 'neg' : ''}" style="text-align:center">
        ${avatar(f, 'width:52px;height:52px;font-size:18px;margin:0 auto 6px')}
        <div class="small muted">${t > 0 ? `${esc(f.name)} owes you in total` : t < 0 ? `You owe ${esc(f.name)} in total` : 'All settled up'}</div>
        <div class="big num ${t > 0 ? 'get' : t < 0 ? 'owe' : ''}">${t ? fmt(Math.abs(t)) : fmt(0)}</div>
      </div>
      <h2 class="section" style="margin:8px 0 0">By group</h2>
      <div class="list">${f.groups.map((g) => `
        <a class="item" href="#/g/${g.id}"><span class="grow bold ellipsis">${esc(g.name)}</span>
          <span class="amt">${g.amount > 0 ? `<span class="tiny muted">owes you</span><b class="get num">${fmt(g.amount)}</b>` : g.amount < 0 ? `<span class="tiny muted">you owe</span><b class="owe num">${fmt(-g.amount)}</b>` : '<span class="tiny muted">Settled</span>'}</span>${icon.chev}</a>`).join('')}</div>
      ${t > 0 ? `<button class="btn btn-ghost btn-block" id="fRemind">${icon.bell} Send reminder</button>` : ''}
      ${f.groups.some((g) => g.amount) ? `<button class="btn btn-primary btn-block" id="fSettle">${icon.check} Mark everything as paid</button>
        <p class="help">Records one payment in each group above so every group stays exact. Do this once the money has actually changed hands.</p>` : ''}
    </div>`, (el) => {
    el.querySelectorAll('a.item').forEach((a) => a.addEventListener('click', closeSheet));
    $('#fRemind', el)?.addEventListener('click', (ev) => sendReminder(`/friends/${uid}/remind`, {}, f, ev.currentTarget));
    $('#fSettle', el)?.addEventListener('click', (ev) => {
      const msg = t > 0 ? `Confirm ${f.name} paid you ${fmt(t)}?` : t < 0 ? `Confirm you paid ${f.name} ${fmt(-t)}?` : `Record payments to clear every group with ${f.name}?`;
      if (!confirm(msg)) return;
      busy(ev.currentTarget, async () => { await api(`/friends/${uid}/settle`, { body: {} }); closeSheet(); toast('Settled up'); location.hash.startsWith('#/g/') ? refresh() : renderHome(); });
    });
  });
}

// ---------- join ----------
async function renderJoin(code) {
  chrome('Group invite', true); loading();
  let g;
  try { g = await api('/join/' + code); } catch (e) { app.innerHTML = `<div class="card empty"><p>${esc(e.message)}</p></div>`; return; }
  if (g.already) { location.hash = `/g/${g.id}`; return; }
  app.innerHTML = `<div class="card stack" style="text-align:center">
    <span class="avatar" style="background:var(--primary);width:56px;height:56px;margin:auto">${icon.users}</span>
    <h2 style="margin:0">${esc(g.name)}</h2><p class="muted" style="margin:0">${g.member_count} members</p>
    <button class="btn btn-primary btn-block" id="joinBtn">Join group</button></div>`;
  $('#joinBtn').onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api('/join/' + code, { method: 'POST' });
    location.hash = `/g/${r.id}`;
  });
}

// ---------- group ----------
const member = (id) => G.members.find((m) => m.id === id) || { id, name: 'Former member' };
const short = (id) => (id === me.id ? 'You' : member(id).name);

async function renderGroup(id, keepTab) {
  if (!keepTab) groupTab = 'expenses';
  if (!G || G.group.id !== id) loading();
  try { G = await api('/groups/' + id); } catch (e) { app.innerHTML = `<div class="card empty"><p>${esc(e.message)}</p><a class="btn btn-ghost" href="#/">Back</a></div>`; return; }
  chrome(G.group.name, true);
  const mine = G.balances[me.id] || 0;
  app.innerHTML = `
    <div class="card hero ${mine < 0 ? 'neg' : ''}">
      <div class="small muted">${mine > 0 ? 'You are owed' : mine < 0 ? 'You owe' : 'Your balance'}</div>
      <div class="big num ${mine > 0 ? 'get' : mine < 0 ? 'owe' : ''}">${mine ? fmt(Math.abs(mine)) : 'Settled up'}</div>
      <div class="tiny muted">Group total spent: <span class="num">${fmt(G.total_spent)}</span></div>
    </div>
    <div class="chips" style="margin-top:12px">${G.members.slice(0, 6).map((m) => `<span class="chip">${avatar(m)}${esc(m.id === me.id ? 'You' : m.name.split(' ')[0])}</span>`).join('')}${G.members.length > 6 ? `<span class="chip" style="padding-left:10px">+${G.members.length - 6}</span>` : ''}</div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn btn-ghost btn-sm" id="membersBtn">${icon.users} Members</button>
      <button class="btn btn-ghost btn-sm" id="settleBtn">${icon.check} Record payment</button>
    </div>
    <div class="tabs" role="tablist">
      ${[['expenses', 'Expenses'], ['balances', 'Balances'], ['activity', 'History']].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${groupTab === k}">${l}</button>`).join('')}
    </div>
    <div id="tabBody"></div>
    <div class="fab-bar"><button class="btn btn-primary btn-block" id="addExp">${icon.plus} Add expense</button></div>`;
  app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { groupTab = b.dataset.tab; app.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b)); renderTab(); }));
  $('#addExp').onclick = () => openExpense();
  $('#membersBtn').onclick = openMembers;
  $('#settleBtn').onclick = () => openSettle();
  renderTab();
}
const refresh = () => renderGroup(G.group.id, true);

function renderTab() {
  const el = $('#tabBody');
  if (groupTab === 'expenses') {
    const rows = [
      ...G.expenses.map((e) => ({ kind: 'e', date: e.date, id: e.id, e })),
      ...G.payments.map((p) => ({ kind: 'p', date: p.date, id: p.id, p })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    if (!rows.length) { el.innerHTML = `<div class="card empty">${icon.receipt}<p><b>No expenses yet</b><br>Whoever paid taps "Add expense" and picks who was there.</p></div>`; return; }
    el.innerHTML = `<div class="list">${rows.map((r) => {
      const d = new Date(r.date + 'T00:00');
      const dbox = `<span class="datebox tiny">${d.toLocaleString('en', { month: 'short' })}<b>${d.getDate()}</b></span>`;
      if (r.kind === 'p') return `<button class="item" data-pay="${r.p.id}">${dbox}<span class="grow small"><b>${esc(short(r.p.from_user))}</b> paid <b>${esc(short(r.p.to_user))}</b>${r.p.note ? `<span class="tiny muted" style="display:block">${esc(r.p.note)}</span>` : ''}</span><span class="amt num bold">${fmt(r.p.amount)}</span></button>`;
      const e = r.e, myShare = e.shares.find((s) => s.user_id === me.id)?.share || 0;
      const myNet = (e.paid_by === me.id ? e.amount : 0) - myShare;
      return `<button class="item" data-exp="${e.id}">${dbox}
        <span class="grow"><span class="bold ellipsis" style="display:block">${esc(e.description)}</span>
          <span class="tiny muted">${esc(short(e.paid_by))} paid ${fmt(e.amount)} · ${e.shares.length} people</span></span>
        <span class="amt">${myNet > 0 ? `<span class="tiny muted">you lent</span><b class="get num">${fmt(myNet)}</b>` : myNet < 0 ? `<span class="tiny muted">you borrowed</span><b class="owe num">${fmt(-myNet)}</b>` : '<span class="tiny muted">not involved</span>'}</span>
      </button>`;
    }).join('')}</div>`;
    el.querySelectorAll('[data-exp]').forEach((b) => (b.onclick = () => openExpenseDetail(Number(b.dataset.exp))));
    el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => openPaymentDetail(Number(b.dataset.pay))));
  } else if (groupTab === 'balances') {
    const debts = G.debts;
    el.innerHTML = `
      <h2 class="section" style="margin-top:0">Who owes whom</h2>
      ${debts.length ? `<div class="list">${debts.map((t, i) => `
        <div class="item">
          ${avatar(member(t.from))}
          <span class="grow small"><b>${esc(short(t.from))}</b> ${icon.arrow} <b>${esc(short(t.to))}</b><span class="num bold owe" style="display:block;font-size:16px">${fmt(t.amount)}</span></span>
          ${t.to === me.id ? `<button class="btn btn-ghost btn-sm" data-remind="${t.from}" aria-label="Remind ${esc(member(t.from).name)}">${icon.bell}</button>` : ''}
          ${t.from === me.id || t.to === me.id ? `<button class="btn btn-primary btn-sm" data-paid="${i}">Paid</button>` : ''}
        </div>`).join('')}</div>
        <p class="help">Exact amounts between each pair of people. Tap "Paid" once the money has been handed over.</p>`
      : '<div class="card empty"><p><b>Everyone is settled up</b></p></div>'}
      <h2 class="section">Member totals</h2>
      <div class="list">${G.members.map((m) => {
        const b = G.balances[m.id] || 0;
        const paid = G.expenses.filter((e) => e.paid_by === m.id).reduce((a, e) => a + e.amount, 0);
        const share = G.expenses.reduce((a, e) => a + (e.shares.find((s) => s.user_id === m.id)?.share || 0), 0);
        const tag = m.id === me.id ? 'div' : 'button';
        return `<${tag} class="item" ${m.id === me.id ? '' : `data-friend="${m.id}"`}>${avatar(m)}<span class="grow"><span class="bold ellipsis" style="display:block">${esc(m.id === me.id ? m.name + ' (you)' : m.name)}</span>
          <span class="tiny muted num">Paid ${fmt(paid)} · Share ${fmt(share)}</span></span>
          <span class="amt">${!b ? '<span class="tiny muted">Settled</span>' : b > 0 ? `<span class="tiny muted">gets back</span><b class="get num">${fmt(b)}</b>` : `<span class="tiny muted">owes</span><b class="owe num">${fmt(-b)}</b>`}</span>${m.id === me.id ? '' : icon.chev}</${tag}>`;
      }).join('')}</div>
      <p class="help">Tap a friend to see your total with them across all trips.</p>`;
    el.querySelectorAll('[data-friend]').forEach((b) => (b.onclick = () => openFriend(Number(b.dataset.friend))));
    el.querySelectorAll('[data-remind]').forEach((b) => (b.onclick = () => sendReminder(`/groups/${G.group.id}/remind`, { to_user: Number(b.dataset.remind) }, member(Number(b.dataset.remind)), b)));
    el.querySelectorAll('[data-paid]').forEach((b) => (b.onclick = () => openSettle(debts[Number(b.dataset.paid)])));
  } else {
    el.innerHTML = G.activity.length ? `<div class="list">${G.activity.map((a) => `
      <div class="item small"><span class="grow">${esc(a.text)}<span class="tiny muted" style="display:block">${new Date(a.created_at).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</span></span></div>`).join('')}</div>
      <p class="help">Every add, edit and delete is logged here — nothing changes quietly.</p>` : '<div class="card empty"><p>No activity yet</p></div>';
  }
}

function sendReminder(path, body, person, btn) {
  busy(btn, async () => {
    const r = await api(path, { body });
    openSheet('Reminder sent', `
      <div class="stack">
        <p class="small">${esc(person.name)} will see the reminder next time they open Dostab.</p>
        <p class="small muted">Send it on WhatsApp too?</p>
        <div class="card small" style="white-space:pre-wrap;background:var(--muted-bg);border:0">${esc(r.message)}</div>
        <a class="btn btn-primary btn-block" href="${esc(r.whatsapp_url)}" target="_blank" rel="noopener">${icon.wa} Send on WhatsApp</a>
        ${person.phone ? '' : `<p class="help">${esc(person.name)} hasn't saved a number — WhatsApp will open and you can pick the contact.</p>`}
        <button class="btn btn-ghost btn-block" id="copyMsg">Copy message</button>
      </div>`, (el) => {
      $('#copyMsg', el).onclick = async () => { try { await navigator.clipboard.writeText(r.message); toast('Copied'); } catch { toast('Could not copy', true); } };
    });
    if (G && location.hash.startsWith('#/g/')) refresh();
  });
}

// ---------- add / edit expense ----------
function equalSplit(amount, ids, payer) {
  const ordered = [...ids].sort((a, b) => (a === payer ? -1 : b === payer ? 1 : a - b));
  const base = Math.floor(amount / ordered.length), rem = amount - base * ordered.length;
  return new Map(ordered.map((id, i) => [id, base + (i < rem ? 1 : 0)]));
}

function openExpense(existing) {
  const e = existing || { description: '', amount: 0, paid_by: me.id, date: today(), split_type: 'equal', shares: G.members.map((m) => ({ user_id: m.id, share: 0 })) };
  const inSplit = new Set(e.shares.map((s) => s.user_id));
  const exactVals = Object.fromEntries(e.shares.map((s) => [s.user_id, existing ? toRs(s.share) : '']));
  let mode = e.split_type;
  const label = (m) => esc(m.id === me.id ? m.name + ' (you)' : m.name);
  openSheet(existing ? 'Edit expense' : 'Add expense', `
    <form class="stack" id="expForm" novalidate>
      <label class="field"><span>What was it for?</span><input class="input" name="description" maxlength="80" required value="${esc(e.description)}" placeholder="e.g. Soup, Hotel, Petrol"></label>
      <label class="field"><span>Total bill (Rs)</span><input class="input amount-input num" name="amount" inputmode="decimal" required value="${existing ? toRs(e.amount) : ''}" placeholder="0"></label>
      <div class="row" style="align-items:flex-end">
        <label class="field grow"><span>Paid by</span><select class="input" name="paid_by">${G.members.map((m) => `<option value="${m.id}" ${m.id === e.paid_by ? 'selected' : ''}>${label(m)}</option>`).join('')}</select></label>
        <label class="field" style="width:150px"><span>Date</span><input class="input" type="date" name="date" value="${e.date}" max="${today()}"></label>
      </div>
      <div>
        <div class="row" style="justify-content:space-between;margin-bottom:8px;flex-wrap:wrap"><b class="small">Split between</b>
          <div class="seg" role="group" aria-label="Split method"><button type="button" data-split="equal" aria-pressed="${mode === 'equal'}">Equally</button><button type="button" data-split="exact" aria-pressed="${mode === 'exact'}">Exact amounts</button></div>
        </div>
        <div id="splitAll" class="row small" style="gap:8px;margin-bottom:4px"></div>
        <div id="splitRows"></div>
        <div id="splitStatus" class="split-status" role="status" style="margin-top:8px"></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Save changes' : 'Add expense'}</button>
    </form>`, (el) => {
    const form = $('#expForm', el);
    const amountP = () => toPaisa(form.amount.value) ?? 0;
    function draw() {
      el.querySelectorAll('[data-split]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.split === mode));
      $('#splitAll', el).innerHTML = mode === 'equal' ? `<button type="button" class="btn btn-ghost btn-sm" id="selAll">Select all</button><button type="button" class="btn btn-ghost btn-sm" id="selNone">Clear</button>` : '';
      $('#splitRows', el).innerHTML = G.members.map((m) => `
        <label class="check-row">
          ${mode === 'equal' ? `<input type="checkbox" data-uid="${m.id}" ${inSplit.has(m.id) ? 'checked' : ''}>` : ''}
          ${avatar(m)}<span class="grow ellipsis">${label(m)}</span>
          ${mode === 'equal' ? `<span class="num small bold" data-share="${m.id}"></span>` : `<input class="input share-in num" data-ex="${m.id}" inputmode="decimal" placeholder="0" value="${esc(exactVals[m.id] || '')}" aria-label="${esc(m.name)}'s share">`}
        </label>`).join('');
      if (mode === 'equal') {
        $('#selAll', el).onclick = () => { G.members.forEach((m) => inSplit.add(m.id)); draw(); };
        $('#selNone', el).onclick = () => { inSplit.clear(); draw(); };
        el.querySelectorAll('[data-uid]').forEach((c) => (c.onchange = () => { c.checked ? inSplit.add(+c.dataset.uid) : inSplit.delete(+c.dataset.uid); update(); }));
      } else {
        el.querySelectorAll('[data-ex]').forEach((i) => (i.oninput = () => { exactVals[i.dataset.ex] = i.value; update(); }));
      }
      update();
    }
    function update() {
      const amt = amountP(), st = $('#splitStatus', el);
      if (mode === 'equal') {
        const shares = inSplit.size ? equalSplit(amt, [...inSplit], Number(form.paid_by.value)) : new Map();
        el.querySelectorAll('[data-share]').forEach((s) => (s.textContent = shares.has(+s.dataset.share) ? fmt(shares.get(+s.dataset.share)) : '—'));
        if (!inSplit.size) { st.className = 'split-status bad'; st.textContent = 'Select at least one person'; }
        else if (!amt) { st.className = 'split-status'; st.textContent = `${inSplit.size} people — enter the amount`; }
        else { const vals = [...shares.values()]; st.className = 'split-status ok'; st.textContent = `${inSplit.size} people · ${fmt(Math.min(...vals))} each${Math.max(...vals) !== Math.min(...vals) ? ' (some pay 1 paisa more)' : ''} · total ${fmt(amt)}`; }
      } else {
        let sum = 0, badField = false;
        for (const v of Object.values(exactVals)) { if (String(v).trim() === '') continue; const p = toPaisa(v); if (p === null) badField = true; else sum += p; }
        const left = amt - sum;
        if (badField) { st.className = 'split-status bad'; st.textContent = 'One of the shares is not a valid number'; }
        else if (left === 0 && amt) { st.className = 'split-status ok'; st.textContent = `Adds up — ${fmt(sum)} of ${fmt(amt)}`; }
        else { st.className = 'split-status bad'; st.textContent = left > 0 ? `${fmt(left)} left to assign (${fmt(sum)} of ${fmt(amt)})` : `${fmt(-left)} over the total`; }
      }
    }
    el.querySelectorAll('[data-split]').forEach((b) => (b.onclick = () => {
      if (b.dataset.split === 'exact' && mode === 'equal' && amountP() && inSplit.size) {
        const sh = equalSplit(amountP(), [...inSplit], Number(form.paid_by.value));
        G.members.forEach((m) => (exactVals[m.id] = sh.has(m.id) ? toRs(sh.get(m.id)) : ''));
      }
      mode = b.dataset.split; draw();
    }));
    form.amount.oninput = update; form.paid_by.onchange = update;
    draw();
    form.onsubmit = (ev) => {
      ev.preventDefault();
      if (!form.description.value.trim()) return toast('Enter what the expense was for', true);
      if (!amountP()) return toast('Enter the amount', true);
      if ($('#splitStatus', el).classList.contains('bad')) return toast($('#splitStatus', el).textContent, true);
      const body = {
        description: form.description.value, amount: form.amount.value, paid_by: Number(form.paid_by.value), date: form.date.value,
        split_type: mode, participants: [...inSplit], exact: exactVals,
      };
      busy(ev.submitter, async () => {
        if (existing) await api(`/groups/${G.group.id}/expenses/${existing.id}`, { method: 'PUT', body });
        else await api(`/groups/${G.group.id}/expenses`, { body });
        closeSheet(); toast(existing ? 'Saved' : 'Expense added'); groupTab = 'expenses'; refresh();
      });
    };
  });
}

function openExpenseDetail(id) {
  const e = G.expenses.find((x) => x.id === id);
  openSheet(e.description, `
    <div class="stack">
      <div class="card hero"><div class="big num">${fmt(e.amount)}</div>
        <div class="small muted">Paid by ${esc(short(e.paid_by))} · ${new Date(e.date + 'T00:00').toLocaleDateString('en-PK', { dateStyle: 'medium' })} · split ${e.split_type === 'equal' ? 'equally' : 'by exact amounts'}</div></div>
      <div class="list">${e.shares.map((s) => `<div class="item">${avatar(member(s.user_id))}<span class="grow">${esc(short(s.user_id))}</span>
        <span class="amt"><b class="num">${fmt(s.share)}</b>${s.user_id === e.paid_by ? '<span class="tiny get">paid the bill</span>' : `<span class="tiny owe">owes ${esc(short(e.paid_by))}</span>`}</span></div>`).join('')}</div>
      <p class="tiny muted">Added by ${esc(member(e.created_by).name)}${e.updated_at ? ' · edited ' + new Date(e.updated_at).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</p>
      <div class="btn-row"><button class="btn btn-ghost" id="edit">Edit</button><button class="btn btn-danger" id="del">Delete</button></div>
    </div>`, (el) => {
    $('#edit', el).onclick = () => openExpense(e);
    $('#del', el).onclick = (ev) => {
      if (!confirm(`Delete "${e.description}" (${fmt(e.amount)})? It stays in the history log.`)) return;
      busy(ev.currentTarget, async () => { await api(`/groups/${G.group.id}/expenses/${e.id}`, { method: 'DELETE' }); closeSheet(); toast('Deleted'); refresh(); });
    };
  });
}

function openPaymentDetail(id) {
  const p = G.payments.find((x) => x.id === id);
  openSheet('Payment', `<div class="stack">
    <div class="card hero"><div class="big num">${fmt(p.amount)}</div><div class="small muted">${esc(short(p.from_user))} paid ${esc(short(p.to_user))} · ${new Date(p.date + 'T00:00').toLocaleDateString('en-PK', { dateStyle: 'medium' })}</div>${p.note ? `<div class="small">${esc(p.note)}</div>` : ''}</div>
    <p class="tiny muted">Recorded by ${esc(member(p.created_by).name)}</p>
    <button class="btn btn-danger btn-block" id="del">Delete payment</button></div>`, (el) => {
    $('#del', el).onclick = (ev) => {
      if (!confirm('Delete this payment?')) return;
      busy(ev.currentTarget, async () => { await api(`/groups/${G.group.id}/payments/${p.id}`, { method: 'DELETE' }); closeSheet(); toast('Deleted'); refresh(); });
    };
  });
}

// ---------- record payment ----------
function openSettle(pre) {
  const t = pre || G.debts.find((x) => x.from === me.id) || G.debts.find((x) => x.to === me.id) || { from: me.id, to: (G.members.find((m) => m.id !== me.id) || {}).id, amount: 0 };
  const opts = (sel) => G.members.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.id === me.id ? m.name + ' (you)' : m.name)}</option>`).join('');
  openSheet('Record a payment', `
    <form class="stack" id="payForm" novalidate>
      <label class="field"><span>Who paid?</span><select class="input" name="from_user">${opts(t.from)}</select></label>
      <label class="field"><span>Paid to</span><select class="input" name="to_user">${opts(t.to)}</select></label>
      <label class="field"><span>Amount (Rs)</span><input class="input amount-input num" name="amount" inputmode="decimal" value="${t.amount ? toRs(t.amount) : ''}" placeholder="0"></label>
      <label class="field"><span>Note <span class="muted">(optional)</span></span><input class="input" name="note" maxlength="80" placeholder="e.g. JazzCash, cash"></label>
      <button class="btn btn-primary btn-block" type="submit">Record payment</button>
    </form>`, (el) => {
    const f = $('#payForm', el);
    f.onsubmit = (ev) => {
      ev.preventDefault();
      if (f.from_user.value === f.to_user.value) return toast('Payer and receiver must be different people', true);
      if (!toPaisa(f.amount.value)) return toast('Enter the amount', true);
      busy(ev.submitter, async () => {
        await api(`/groups/${G.group.id}/payments`, { body: { from_user: +f.from_user.value, to_user: +f.to_user.value, amount: f.amount.value, note: f.note.value, date: today() } });
        closeSheet(); toast('Payment recorded'); refresh();
      });
    };
  });
}

// ---------- members ----------
function openMembers() {
  const link = `${location.origin}/join/${G.group.invite_code}`;
  const isOwner = G.group.created_by === me.id;
  openSheet('Members', `
    <div class="stack">
      <div class="list">${G.members.map((m) => `<div class="item">${avatar(m)}<span class="grow"><span class="bold ellipsis" style="display:block">${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</span><span class="tiny muted ellipsis" style="display:block">${esc(m.email)}</span></span>
        ${m.registered ? '' : '<span class="badge">Not signed up</span>'}
        ${(isOwner && m.id !== me.id) || m.id === me.id ? `<button class="btn btn-ghost btn-sm" data-rm="${m.id}">${m.id === me.id ? 'Leave' : 'Remove'}</button>` : ''}</div>`).join('')}</div>
      <h2 class="section" style="margin:8px 0 0">Add a friend by email</h2>
      <form class="stack" id="addMem" novalidate>
        <label class="field"><span>Email</span><input class="input" name="email" type="email" inputmode="email" required placeholder="friend@gmail.com"></label>
        <label class="field"><span>Name <span class="muted">(if they haven't signed up yet)</span></span><input class="input" name="name" maxlength="40"></label>
        <button class="btn btn-primary btn-block" type="submit">${icon.plus} Add to group</button>
        <p class="help">They join the group right away, so you can add expenses for them. When they sign up with this email, everything shows up in their account.</p>
      </form>
      <h2 class="section" style="margin:8px 0 0">Or share an invite link</h2>
      <div class="btn-row">
        <button class="btn btn-ghost btn-sm" id="copyLink">${icon.link} Copy link</button>
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Join "${G.group.name}" on Dostab so we can split expenses: ${link}`)}">${icon.wa} WhatsApp</a>
      </div>
    </div>`, (el) => {
    $('#copyLink', el).onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { prompt('Copy this link:', link); } };
    $('#addMem', el).onsubmit = (ev) => {
      ev.preventDefault();
      busy(ev.submitter, async () => {
        const r = await api(`/groups/${G.group.id}/members`, { body: { email: ev.target.email.value, name: ev.target.name.value } });
        toast(`${r.member.name} added`); await refresh(); openMembers();
      });
    };
    el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => {
      const uid = +b.dataset.rm, self = uid === me.id;
      if (!confirm(self ? 'Leave this group?' : `Remove ${member(uid).name} from the group?`)) return;
      busy(b, async () => {
        await api(`/groups/${G.group.id}/members/${uid}`, { method: 'DELETE' });
        closeSheet();
        if (self) location.hash = '/'; else { toast('Removed'); refresh(); }
      });
    }));
  });
}

// ---------- profile ----------
function openProfile() {
  openSheet('Profile', `
    <form class="stack" id="profForm" novalidate>
      <p class="small muted" style="margin:0">${esc(me.email)}</p>
      <label class="field"><span>Name</span><input class="input" name="name" maxlength="40" value="${esc(me.name)}"></label>
      <label class="field"><span>WhatsApp number</span><input class="input" name="phone" type="tel" inputmode="tel" value="${esc(me.phone || '')}" placeholder="03001234567"><div class="help">Used for WhatsApp reminders</div></label>
      <button class="btn btn-primary btn-block" type="submit">Save</button>
      <button class="btn btn-ghost btn-block" type="button" id="logout">Log out</button>
    </form>`, (el) => {
    $('#profForm', el).onsubmit = (ev) => {
      ev.preventDefault();
      busy(ev.submitter, async () => { await api('/me', { method: 'PATCH', body: { name: ev.target.name.value, phone: ev.target.phone.value } }); me = (await api('/me')).user; closeSheet(); toast('Saved'); route(); });
    };
    $('#logout', el).onclick = async () => { await api('/logout', { method: 'POST' }); me = null; closeSheet(); location.hash = '/'; renderAuth(); };
  });
}

async function boot() {
  try { me = (await api('/me')).user; } catch { me = null; }
  route();
}
boot();
