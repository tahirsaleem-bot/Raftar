// ─── Meter Reading dashboard (v2) ─────────────────────────────────────────────
// Served at /dashboard and iframed into the pa-app at /pa#meter.
// Read-only view of the two fleet tabs (Islamabad, Rawalpindi):
//   ?fleet=rawalpindi       switch fleet (default Islamabad)
//   ?date=YYYY-MM-DD        one working day (default today)
//   ?view=month&month=YYYY-MM  per-hub totals, daily chart, daily table
// Readings are TRIP-METER values (odometer for two Rawalpindi cars):
// Total = LDO − FPU. A blank cell means "not recorded yet" and is never shown
// as a number; "off" means no visit that day.
const logistics = require('../sheets/logisticsClient');
const logger = require('../logger');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => {
  const s = String(v == null ? '' : v).trim().replace(/,/g, '');
  if (s === '' || s.toLowerCase() === 'off') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};
const round1 = n => Math.round(n * 10) / 10;
const fmt = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
const shiftDay = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const shiftMonth = (ym, n) => { const d = new Date(`${ym}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const dayLabel = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthLabel = ym => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Lucide icons (MIT), inline so the page has no icon dependency
const ICON = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  fuel: '<path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

async function loadRows(lc) {
  const rows = await lc.getAllRows();
  const C = lc.COL;
  const all = [];
  for (const r of rows) {
    const iso = logistics.parseSheetDate((r[C.date] || '').trim());
    if (!iso) continue; // the repeated header rows
    const fpu = num(r[C.fpu]), ldo = num(r[C.ldo]);
    all.push({
      iso,
      name: (r[C.hub] || '').trim() || '—',
      off: String(r[C.fpu] || '').trim().toLowerCase() === 'off' || String(r[C.ldo] || '').trim().toLowerCase() === 'off',
      fpu, ldo,
      total: (fpu != null && ldo != null) ? round1(ldo - fpu) : null,
    });
  }
  return all;
}

async function render(req, opts = {}) {
  const today = logistics.todayISO();
  const fleetKey = req.query.fleet === 'rawalpindi' ? 'rawalpindi' : 'islamabad';
  const lc = logistics.forFleet(fleetKey);
  let view = ['month', 'invoice', 'hub'].includes(req.query.view) ? req.query.view : 'day';
  const fuel = require('../services/fuelPrice');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') && req.query.date <= today ? req.query.date : today;
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') && req.query.month <= today.slice(0, 7) ? req.query.month : date.slice(0, 7);
  const F = fleetKey === 'rawalpindi' ? '&fleet=rawalpindi' : '';
  const fleetHidden = F ? '<input type="hidden" name="fleet" value="rawalpindi">' : '';
  const hubOrder = lc.hubs().map(h => h.hubName);
  const N = hubOrder.length;
  // ?view=hub&hub=<name>: one hub's month, day by day, with the invoice maths
  const hubSel = view === 'hub' ? hubOrder.find(n => n === req.query.hub) : null;
  if (view === 'hub' && !hubSel) view = 'month';
  const hubHref = (name, ym) => `?view=hub&hub=${encodeURIComponent(name)}&month=${ym}${F}`;
  const now = new Date().toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' });

  let all = [], dataError = null;
  try { all = await loadRows(lc); } catch (err) {
    logger.error('[dashboard] could not read sheet:', err.message);
    dataError = err.message;
  }
  const navBtn = (href, label, name, disabled) => disabled
    ? `<span class="iconbtn disabled" aria-hidden="true">${icon(name)}</span>`
    : `<a class="iconbtn" href="${href}" aria-label="${label}">${icon(name)}</a>`;

  let body = '';
  if (view === 'day') {
    const hubs = all.filter(h => h.iso === date);
    const isToday = date === today;
    const reporting = hubs.filter(h => h.fpu != null || h.ldo != null).length;
    const offCount = hubs.filter(h => h.off).length;
    const readings = hubs.reduce((n, h) => n + (h.fpu != null ? 1 : 0) + (h.ldo != null ? 1 : 0), 0);
    const totalKm = round1(hubs.reduce((n, h) => n + (h.total > 0 ? h.total : 0), 0));
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    // each hub's typical day: mean of its last 20 positive totals before this date
    const avgFor = name => {
      const t = all.filter(h => h.name === name && h.iso < date && h.total > 0 && h.total < 1000).slice(-20).map(h => h.total);
      return t.length >= 3 ? t.reduce((a, b) => a + b, 0) / t.length : null;
    };
    const expected = N - offCount;
    const pct = expected > 0 ? Math.round(100 * reporting / expected) : 0;
    const ring = (p) => {
      const r = 22, c = 2 * Math.PI * r;
      return `<svg class="ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="${r}" class="ring-bg"/><circle cx="28" cy="28" r="${r}" class="ring-fg" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/></svg>`;
    };
    const status = h => {
      if (h.off) return { cls: 'off', label: 'Off', ic: 'moon' };
      if (h.fpu != null && h.ldo != null) return { cls: 'ok', label: 'Complete', ic: 'check' };
      if (h.fpu != null || h.ldo != null) return { cls: 'warn', label: isToday ? 'In progress' : 'LDO missing', ic: 'clock' };
      return isToday ? { cls: 'idle', label: 'Awaiting', ic: 'clock' } : { cls: 'bad', label: 'Missing', ic: 'alert' };
    };
    const sorted = hubOrder.map(n => hubs.find(h => h.name === n)).filter(Boolean)
      .concat(hubs.filter(h => !hubOrder.includes(h.name)));
    const cards = sorted.map(h => {
      const st = status(h);
      const avg = avgFor(h.name);
      let delta = '';
      if (h.total != null && avg) {
        const d = Math.round(100 * (h.total - avg) / avg);
        delta = `<span class="delta ${d >= 0 ? 'pos' : 'neg'}">${icon(d >= 0 ? 'up' : 'down')}${Math.abs(d)}% vs avg ${fmt(round1(avg))}</span>`;
      }
      const val = v => v == null ? '<span class="dash">—</span>' : fmt(v);
      return `
        <a class="hub hub-link" href="${hubHref(h.name, date.slice(0, 7))}" aria-label="${esc(h.name)}: open this month, day by day">
          <header class="hub-h">
            <h3>${esc(h.name)}</h3>
            <span class="badge ${st.cls}">${icon(st.ic)}${st.label}</span>
          </header>
          ${h.off ? '<p class="hub-off">No visit — chhutti</p>' : `
          <div class="hub-flow">
            <div><span class="k">FPU</span><span class="v mono">${val(h.fpu)}</span></div>
            <span class="arrow" aria-hidden="true">→</span>
            <div><span class="k">LDO</span><span class="v mono">${val(h.ldo)}</span></div>
          </div>
          <div class="hub-total">
            <span class="tot mono">${h.total == null ? '—' : fmt(h.total)}<small> km</small></span>
            ${delta}
          </div>`}
          <span class="hub-more">Month detail ${icon('chevR')}</span>
        </a>`;
    }).join('');
    const empty = dataError ? 'Sheet could not be read: ' + esc(String(dataError).slice(0, 120))
      : (weekday === 0 || weekday === 6) ? 'Weekend — readings are recorded Monday to Friday'
      : 'No rows for this day yet';

    body = `
    <form class="datebar" method="get" action="">
      ${fleetHidden}
      ${navBtn(`?date=${shiftDay(date, -1)}${F}`, 'Previous day', 'chevL', false)}
      <label class="picker"><span class="sr">Date</span>
        <input type="date" name="date" value="${date}" max="${today}" onchange="this.form.submit()">
      </label>
      ${navBtn(`?date=${shiftDay(date, 1)}${F}`, 'Next day', 'chevR', isToday)}
      ${isToday ? '' : `<a class="chip" href="?${F.slice(1)}">Today</a>`}
    </form>

    <div class="eyebar">
      <h2 class="eyebrow">${isToday ? 'Today' : 'Day'} · ${esc(dayLabel(date))}</h2>
      ${(() => { const p = fuel.priceOn(date); return p ? `<span class="fuelchip" title="Official daily rate (OGRA) notified ${p.effective}, via ${p.source}">${icon('fuel')}Petrol <b class="mono">Rs ${p.price.toFixed(2)}</b>/L <span class="src">${p.exact ? 'today' : 'since ' + (+p.effective.slice(8)) + '/' + (+p.effective.slice(5, 7))}</span></span>` : ''; })()}
    </div>
    <section class="kpis" aria-label="Day summary">
      <div class="kpi kpi-ring">
        ${ring(pct)}
        <div><div class="kv mono">${reporting}<span class="of">/${expected}</span></div><div class="kl">Hubs reporting${offCount ? ` · ${offCount} off` : ''}</div></div>
      </div>
      <div class="kpi"><div class="ki">${icon('route')}</div><div class="kv mono">${fmt(totalKm)}<span class="of"> km</span></div><div class="kl">Distance driven</div></div>
      <div class="kpi"><div class="ki">${icon('list')}</div><div class="kv mono">${readings}<span class="of">/${expected * 2}</span></div><div class="kl">Readings logged</div></div>
    </section>

    <section class="grid-hubs" aria-label="Hubs">${cards || `<div class="empty">${empty}</div>`}</section>`;
  } else if (view === 'month') {
    const inMonth = all.filter(h => h.iso.startsWith(month));
    const names = [...new Set([...hubOrder.filter(n => inMonth.some(h => h.name === n)), ...inMonth.map(h => h.name)])];
    const per = names.map(name => {
      const rs = inMonth.filter(h => h.name === name);
      return {
        name,
        km: round1(rs.reduce((n, h) => n + (h.total > 0 ? h.total : 0), 0)),
        ran: rs.filter(h => h.total > 0).length,
        off: rs.filter(h => h.off).length,
        gaps: rs.filter(h => !h.off && h.total == null && h.iso < today).length,
      };
    }).sort((a, b) => b.km - a.km);
    const grand = round1(per.reduce((n, p) => n + p.km, 0));
    const dates = [...new Set(inMonth.map(h => h.iso))].sort();
    const daily = dates.map(d => ({ d, km: round1(inMonth.filter(x => x.iso === d && x.total > 0).reduce((n, x) => n + x.total, 0)) }));
    const isThisMonth = month === today.slice(0, 7);
    // same span of the previous month, for the headline comparison
    const prevYm = shiftMonth(month, -1);
    const cutDay = isThisMonth ? today.slice(8) : '31';
    const prevKm = round1(all.filter(h => h.iso.startsWith(prevYm) && h.iso.slice(8) <= cutDay && h.total > 0).reduce((n, h) => n + h.total, 0));
    const change = prevKm > 0 ? Math.round(100 * (grand - prevKm) / prevKm) : null;
    const runDays = daily.filter(x => x.km > 0).length;
    const avgDay = runDays ? round1(grand / runDays) : 0;

    // daily column chart (single series: one hue, value on hover + on the peak)
    const H = 150, padB = 22, padT = 18, slot = 26;
    const W = Math.max(dates.length, 1) * slot;
    const maxKm = Math.max(1, ...daily.map(x => x.km));
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(maxKm))); return Math.ceil(maxKm / p) * p; })();
    const y = v => padT + (H - padT - padB) * (1 - v / nice);
    const peak = daily.reduce((a, b) => (b.km > a.km ? b : a), daily[0] || { km: 0 });
    const bars = daily.map((x, i) => {
      const bw = 16, x0 = i * slot + (slot - bw) / 2, y0 = y(x.km), yb = y(0), r = Math.min(4, (yb - y0) / 2);
      const path = x.km > 0
        ? `M${x0},${yb} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${yb} Z`
        : '';
      // keep the peak label inside the drawing at either edge
      const cx = x0 + bw / 2, anchor = cx > W - 24 ? 'end' : cx < 24 ? 'start' : 'middle';
      const lx = anchor === 'end' ? x0 + bw : anchor === 'start' ? x0 : cx;
      const lbl = x === peak && x.km > 0 ? `<text class="peak" x="${lx}" y="${y0 - 6}" text-anchor="${anchor}">${fmt(x.km)}</text>` : '';
      return `<a href="?date=${x.d}${F}" class="bar-g"><title>${esc(dayLabel(x.d))}: ${fmt(x.km)} km</title>
        <rect class="hit" x="${i * slot}" y="${padT}" width="${slot}" height="${H - padT}"/>
        ${path ? `<path class="bar" d="${path}"/>` : ''}${lbl}
        <text class="xl" x="${x0 + bw / 2}" y="${H - 6}" text-anchor="middle">${+x.d.slice(8)}</text></a>`;
    }).join('');
    const grid = [0.5, 1].map(f => `<line class="grid" x1="0" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}"/><text class="yl" x="${W - 2}" y="${y(nice * f) - 4}" text-anchor="end">${fmt(nice * f)}</text>`).join('');
    const chart = dates.length ? `
      <div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="min-width:${Math.min(W, 640)}px" role="img" aria-label="Daily kilometres, ${esc(monthLabel(month))}">
        ${grid}<line class="base" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>${bars}
      </svg></div>` : '<div class="empty">No readings this month</div>';

    const maxHub = Math.max(1, ...per.map(p => p.km));
    const hubRows = per.map((p, i) => `
      <li class="rank">
        <span class="rk mono">${i + 1}</span>
        <div class="rb">
          <div class="rt"><a class="rn" href="${hubHref(p.name, month)}">${esc(p.name)}</a><span class="rv mono">${fmt(p.km)} <small>km</small></span></div>
          <div class="track"><span class="fill" style="width:${(100 * p.km / maxHub).toFixed(1)}%"></span></div>
          <div class="rm"><span>${grand ? Math.round(100 * p.km / grand) : 0}% of fleet</span><span>${p.ran} days</span>${p.off ? `<span>${p.off} off</span>` : ''}${p.gaps ? `<span class="gap">${icon('alert')}${p.gaps} incomplete</span>` : ''}</div>
        </div>
      </li>`).join('');

    const short = n => n.replace(' corporation', '').replace(' Tarnol', '').replace(' Chowk', '').replace(' Road', '').replace(' car chowk', '');
    const table = dates.map(d => {
      const cells = names.map(n => {
        const h = inMonth.find(x => x.iso === d && x.name === n);
        if (!h) return '<td class="mut">·</td>';
        if (h.off) return '<td class="mut">off</td>';
        return h.total == null ? '<td class="mut">—</td>' : `<td>${fmt(h.total)}</td>`;
      }).join('');
      const t = daily.find(x => x.d === d).km;
      return `<tr><th scope="row"><a href="?date=${d}${F}">${d.slice(8)}</a></th>${cells}<td class="strong">${fmt(t)}</td></tr>`;
    }).join('');

    body = `
    <form class="datebar" method="get" action="">
      <input type="hidden" name="view" value="month">
      ${fleetHidden}
      ${navBtn(`?view=month&month=${shiftMonth(month, -1)}${F}`, 'Previous month', 'chevL', false)}
      <label class="picker"><span class="sr">Month</span>
        <input type="month" name="month" value="${month}" max="${today.slice(0, 7)}" onchange="this.form.submit()">
      </label>
      ${navBtn(`?view=month&month=${shiftMonth(month, 1)}${F}`, 'Next month', 'chevR', isThisMonth)}
      ${isThisMonth ? '' : `<a class="chip" href="?view=month${F}">This month</a>`}
    </form>

    <h2 class="eyebrow">${esc(monthLabel(month))}${isThisMonth ? ' · month to date' : ''}</h2>
    <div class="cols">
      <section class="panel hero" aria-label="Month total">
        <div class="hero-k">Total distance</div>
        <div class="hero-v mono">${fmt(grand)}<span class="of"> km</span></div>
        ${change == null ? '' : `<div class="delta ${change >= 0 ? 'pos' : 'neg'}">${icon(change >= 0 ? 'up' : 'down')}${Math.abs(change)}% vs ${esc(monthLabel(prevYm).split(' ')[0])}${isThisMonth ? ' (same days)' : ''}</div>`}
        <dl class="hero-s">
          <div><dt>Working days</dt><dd class="mono">${dates.length}</dd></div>
          <div><dt>Avg / day</dt><dd class="mono">${fmt(avgDay)}</dd></div>
          <div><dt>Hubs active</dt><dd class="mono">${per.filter(p => p.km > 0).length}/${N}</dd></div>
        </dl>
      </section>
      <section class="panel" aria-label="Daily distance">
        <div class="panel-h"><h3>Daily distance</h3><span class="hint">tap a bar to open the day</span></div>
        ${chart}
      </section>
    </div>

    <section class="panel" aria-label="Distance by hub">
      <div class="panel-h"><h3>By hub</h3><span class="hint">ranked by km</span></div>
      <ol class="ranks">${hubRows || `<li class="empty">${dataError ? 'Sheet could not be read' : 'No readings this month'}</li>`}</ol>
    </section>

    ${dates.length ? `
    <details class="panel daily">
      <summary>Daily detail <span class="hint">${dates.length} days · km per hub</span></summary>
      <div class="scroll"><table class="tbl">
        <thead><tr><th scope="col">Day</th>${names.map(n => `<th scope="col">${esc(short(n))}</th>`).join('')}<th scope="col">Total</th></tr></thead>
        <tbody>${table}</tbody>
      </table></div>
    </details>` : ''}`;
  } else if (view === 'hub') {
    // ── One hub, one month: every working day with its rate and cost ─────────
    // Same maths as the invoice line for this hub (Raftar, 2026-10-28: "G13 pe
    // click karun to daily ka hisaab aaye — rate, km, variable").
    const inv = lc.invoice;
    const fdb = fuel.load();
    const isThisMonth = month === today.slice(0, 7);
    const rows = all.filter(h => h.name === hubSel && h.iso.startsWith(month)).sort((a, b) => a.iso.localeCompare(b.iso));
    let variable = 0, km = 0, days = 0;
    const missingRate = [];
    const lines = rows.map(h => {
      const p = fuel.priceOn(h.iso, 'premier', fdb);
      const ran = h.total > 0;
      const litres = ran ? h.total / inv.kmPerLitre : null;
      const cost = ran && p ? litres * p.price : null;
      if (ran) { days++; km += h.total; if (cost != null) variable += cost; else missingRate.push(h.iso); }
      return { h, p, ran, litres, cost };
    });
    km = round1(km);
    const fixed = days ? inv.fixed : 0;
    const total = Math.round(fixed + variable);
    const rs = n => Math.round(n).toLocaleString('en-US');
    const cell = v => (v == null ? '<span class="dash">—</span>' : fmt(v));
    const tr = ({ h, p, ran, litres, cost }) => {
      const rate = p ? `${p.price.toFixed(2)}${p.exact ? '' : '<span class="carry" title="Carried from ' + esc(p.effective) + '">*</span>'}` : '<span class="mut">—</span>';
      if (h.off) return `<tr class="off"><th scope="row"><a href="?date=${h.iso}${F}">${esc(dayLabel(h.iso).replace(/ \d{4}$/, ''))}</a></th><td colspan="3" class="mut">off — no visit</td><td>${rate}</td><td class="mut">—</td><td class="mut">—</td></tr>`;
      return `<tr${ran ? '' : ' class="gap"'}><th scope="row"><a href="?date=${h.iso}${F}">${esc(dayLabel(h.iso).replace(/ \d{4}$/, ''))}</a></th>
        <td>${cell(h.fpu)}</td><td>${cell(h.ldo)}</td><td class="strong">${h.total == null ? '<span class="dash">—</span>' : fmt(h.total)}</td>
        <td>${rate}</td><td>${litres == null ? '<span class="mut">—</span>' : litres.toFixed(2)}</td><td class="strong">${cost == null ? '<span class="mut">—</span>' : rs(cost)}</td></tr>`;
    };
    const switcher = hubOrder.map(n => `<option value="${esc(n)}"${n === hubSel ? ' selected' : ''}>${esc(n)}</option>`).join('');

    body = `
    <form class="datebar" method="get" action="">
      <input type="hidden" name="view" value="hub">
      ${fleetHidden}
      ${navBtn(hubHref(hubSel, shiftMonth(month, -1)), 'Previous month', 'chevL', false)}
      <label class="picker"><span class="sr">Month</span>
        <input type="month" name="month" value="${month}" max="${today.slice(0, 7)}" onchange="this.form.submit()">
      </label>
      ${navBtn(hubHref(hubSel, shiftMonth(month, 1)), 'Next month', 'chevR', isThisMonth)}
      <label class="picker hubpick"><span class="sr">Hub</span>
        <select name="hub" onchange="this.form.submit()">${switcher}</select>
      </label>
    </form>

    <div class="eyebar">
      <h2 class="eyebrow"><a class="back" href="?date=${isThisMonth ? today : month + '-01'}${F}">${icon('chevL')}All hubs</a> · ${esc(hubSel)} · ${esc(monthLabel(month))}${isThisMonth ? ' · month to date' : ''}</h2>
    </div>
    <section class="kpis kpis-5" aria-label="${esc(hubSel)} month summary">
      <div class="kpi"><div class="ki">${icon('calendar')}</div><div class="kv mono">${days}</div><div class="kl">Days the car ran</div></div>
      <div class="kpi"><div class="ki">${icon('route')}</div><div class="kv mono">${fmt(km)}<span class="of"> km</span></div><div class="kl">Distance</div></div>
      <div class="kpi"><div class="ki">${icon('fuel')}</div><div class="kv mono"><span class="of">Rs </span>${rs(variable)}</div><div class="kl">Variable (fuel)</div></div>
      <div class="kpi"><div class="ki">${icon('list')}</div><div class="kv mono"><span class="of">Rs </span>${rs(fixed)}</div><div class="kl">Fixed</div></div>
      <div class="kpi kpi-total"><div class="kv mono"><span class="of">Rs </span>${rs(total)}</div><div class="kl">Invoice total</div></div>
    </section>

    <section class="panel" aria-label="Day by day">
      <div class="panel-h"><h3>Day by day</h3><span class="hint">Variable = km ÷ ${inv.kmPerLitre} × that day's petrol rate</span></div>
      ${rows.length ? `<div class="scroll"><table class="tbl hub-tbl">
        <thead><tr><th scope="col">Day</th><th scope="col">FPU</th><th scope="col">LDO</th><th scope="col">KM</th><th scope="col">Rs / L</th><th scope="col">Litres</th><th scope="col">Variable Rs</th></tr></thead>
        <tbody>${lines.map(tr).join('')}</tbody>
        <tfoot><tr><th scope="row">${days} days</th><td></td><td></td><td class="strong">${fmt(km)}</td><td></td><td>${fmt(round1(km / inv.kmPerLitre))}</td><td class="strong">${rs(variable)}</td></tr></tfoot>
      </table></div>` : `<div class="empty">${dataError ? 'Sheet could not be read' : 'No readings for this hub this month'}</div>`}
      <ul class="inv-notes">
        <li>Total = Fixed Rs ${inv.fixed.toLocaleString('en-US')} (once the car has run this month) + Variable. It is the same figure as this hub's line on the Invoice tab.</li>
        <li><span class="carry">*</span> rate carried from the last notified day (weekends and days with no new OGRA rate).</li>
        ${missingRate.length ? `<li class="warn">${icon('alert')}No petrol rate on record for ${missingRate.map(d => +d.slice(8)).join(', ')} — left out of Variable.</li>` : ''}
      </ul>
    </section>`;
  } else {
    // ── Invoice estimate (BusCaro format) ────────────────────────────────────
    // Per route: Days = days the car ran, Total KM, Fixed, Variable =
    // Σ(km ÷ kmPerLitre × that day's petrol rate), Total. Built from OUR sheet,
    // so it can be held against BusCaro's month-end invoice.
    const inv = lc.invoice;
    const fdb = fuel.load();
    const inMonth = all.filter(h => h.iso.startsWith(month));
    const names = [...new Set([...hubOrder.filter(n => inMonth.some(h => h.name === n)), ...hubOrder])];
    const missingRate = new Set();
    const lines = names.map(name => {
      const rs = inMonth.filter(h => h.name === name && h.total > 0);
      let variable = 0;
      for (const h of rs) {
        const p = fuel.priceOn(h.iso, 'premier', fdb);
        if (p) variable += h.total / inv.kmPerLitre * p.price; else missingRate.add(h.iso);
      }
      const km = round1(rs.reduce((n, h) => n + h.total, 0));
      const fixed = rs.length ? inv.fixed : 0;
      return { name, desc: inv.names[name] || name, days: rs.length, km, fixed, variable: Math.round(variable), total: Math.round(fixed + variable) };
    });
    const sum = k => lines.reduce((n, l) => n + l[k], 0);
    const rupee = n => 'Rs ' + Math.round(n).toLocaleString('en-US');
    const isThisMonth = month === today.slice(0, 7);
    const [yy, mm] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    // the rate on each working day of the month, for transparency
    const rateDays = [...new Set(inMonth.map(h => h.iso))].sort();
    const rateRows = rateDays.map(d => { const p = fuel.priceOn(d, 'premier', fdb); return { d, p }; });
    const distinct = [...new Set(rateRows.filter(r => r.p).map(r => r.p.price))];
    const rateSummary = !rateRows.length ? 'No working days yet'
      : distinct.length === 1 ? `Rs ${distinct[0].toFixed(2)}/L all month`
      : `Rs ${Math.min(...distinct).toFixed(2)} – ${Math.max(...distinct).toFixed(2)}/L`;
    const srcs = [...new Set(rateRows.filter(r => r.p).map(r => r.p.source))].join(' + ');

    body = `
    <form class="datebar" method="get" action="">
      <input type="hidden" name="view" value="invoice">
      ${fleetHidden}
      ${navBtn(`?view=invoice&month=${shiftMonth(month, -1)}${F}`, 'Previous month', 'chevL', false)}
      <label class="picker"><span class="sr">Month</span>
        <input type="month" name="month" value="${month}" max="${today.slice(0, 7)}" onchange="this.form.submit()">
      </label>
      ${navBtn(`?view=invoice&month=${shiftMonth(month, 1)}${F}`, 'Next month', 'chevR', isThisMonth)}
      <button type="button" class="chip noprint" onclick="window.print()">Print / PDF</button>
    </form>

    <article class="panel invoice">
      <header class="inv-h">
        <div>
          <div class="inv-t">Invoice estimate · ${esc(monthLabel(month))}</div>
          <div class="inv-sub">${esc(inv.provider)} → ${esc(inv.account)} · ${esc(lc.label)}${isThisMonth ? ' · month to date' : ''}</div>
        </div>
        <dl class="inv-meta">
          <div><dt>Service dates</dt><dd>${monthLabel(month).split(' ')[0].slice(0, 3)} 1 – ${isThisMonth ? +today.slice(8) : lastDay}, ${yy}</dd></div>
          <div><dt>Fuel</dt><dd>Petrol · ${inv.kmPerLitre} km/L</dd></div>
          <div><dt>Rate</dt><dd>${rateSummary}${srcs ? ` <span class="src">${srcs}</span>` : ''}</dd></div>
        </dl>
      </header>
      <div class="scroll"><table class="tbl inv-tbl">
        <thead><tr><th scope="col">Description</th><th scope="col">Days</th><th scope="col">Total KM</th><th scope="col" class="hide-sm">Vehicle</th><th scope="col">Fixed</th><th scope="col">Variable</th><th scope="col">Total</th></tr></thead>
        <tbody>${lines.map(l => `<tr><th scope="row"><a href="${hubHref(l.name, month)}">${esc(l.desc)}</a></th><td>${l.days}</td><td>${fmt(l.km)}</td><td class="hide-sm mut">${esc(inv.vehicleType)}</td><td>${l.fixed.toLocaleString('en-US')}</td><td>${l.variable.toLocaleString('en-US')}</td><td class="strong">${l.total.toLocaleString('en-US')}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Billable amount</th><td>${sum('days')}</td><td>${fmt(round1(sum('km')))}</td><td class="hide-sm"></td><td>${sum('fixed').toLocaleString('en-US')}</td><td>${sum('variable').toLocaleString('en-US')}</td><td class="strong">${sum('total').toLocaleString('en-US')}</td></tr></tfoot>
      </table></div>
      <div class="inv-total"><span>Estimated billable</span><b class="mono">${rupee(sum('total'))}</b></div>
      <ul class="inv-notes">
        <li>From our sheet readings: Days = days the car ran, Variable = Σ(km ÷ ${inv.kmPerLitre} × that day's petrol rate), Fixed = Rs ${inv.fixed.toLocaleString('en-US')} per route. Toll is billed separately by BusCaro and is not included.</li>
        <li>Petrol rate = the official daily rate (OGRA, via PakWheels), carried over weekends and days with no notification — the same rate BusCaro bills (matched on 21 of 22 September days).</li>
        ${missingRate.size ? `<li class="warn">${icon('alert')}No petrol rate on record for ${missingRate.size} day(s) (${[...missingRate].sort().map(d => +d.slice(8)).join(', ')}) — their variable cost is left out.</li>` : ''}
        ${inv.assumed ? `<li class="warn">${icon('alert')}No Rawalpindi invoice seen yet — Islamabad's terms are assumed.</li>` : ''}
      </ul>
    </article>

    ${rateRows.length ? `
    <details class="panel daily noprint">
      <summary>Daily petrol rate <span class="hint">${rateRows.length} working days</span></summary>
      <div class="scroll"><table class="tbl">
        <thead><tr><th scope="col">Day</th><th scope="col">Rs / litre</th><th scope="col">Notified</th></tr></thead>
        <tbody>${rateRows.map(r => `<tr><th scope="row">${esc(dayLabel(r.d))}</th><td>${r.p ? r.p.price.toFixed(2) : '<span class="mut">unknown</span>'}</td><td class="mut">${r.p ? (r.p.exact ? r.p.source : 'carried from ' + (+r.p.effective.slice(8)) + '/' + (+r.p.effective.slice(5, 7))) : '—'}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>` : ''}`;
  }

  const live = view === 'day' && date === today;
  const logo = opts.hasLogo ? '<img class="logo" src="/brand-logo" alt="" />' : '<span class="logo logo-fallback" aria-hidden="true">R</span>';
  const fleetTabs = ['islamabad', 'rawalpindi'].map(k => {
    const kf = k === 'rawalpindi' ? '&fleet=rawalpindi' : '';
    // a hub belongs to one fleet, so switching fleet from a hub page opens that fleet's month
    const href = view === 'day' ? `?date=${date}${kf}` : `?view=${view === 'hub' ? 'month' : view}&month=${month}${kf}`;
    return `<a class="seg" href="${href}"${k === fleetKey ? ' aria-current="page"' : ''}>${logistics.forFleet(k).label}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${live ? '<meta http-equiv="refresh" content="60">' : ''}
<title>Raftar · Fleet Operations</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600&family=Fira+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* Layout: sticky control bar over a midnight-navy field with soft teal/indigo light; glass cards */
:root{
  --bg:#0E1838; --bg2:rgba(6,12,36,.38); --solid:#16224A; --card:rgba(255,255,255,.055); --card2:rgba(255,255,255,.09);
  --line:rgba(199,210,254,.14); --line2:rgba(199,210,254,.28);
  --fg:#F8FAFC; --fg2:#DCE4F5; --mut:#A7B4D3; --mut2:#7F8DB3;
  --accent:#2DD4BF; --accent-ink:#042F2E; --series:#2DD4BF; --series-hi:#99F6E4;
  --shadow:0 10px 30px rgba(3,8,32,.35);
  --ok:#22C55E; --warn:#F59E0B; --bad:#F87171; --idle:#94A3B8; --info:#60A5FA;
  --r:16px; --r-sm:10px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background-color:var(--bg);background-image:radial-gradient(900px 520px at 8% -8%,rgba(45,212,191,.18),transparent 62%),radial-gradient(900px 560px at 100% -5%,rgba(129,140,248,.26),transparent 60%),radial-gradient(800px 600px at 50% 110%,rgba(192,132,252,.14),transparent 65%),linear-gradient(165deg,#0B1533 0%,#12204A 48%,#1A1D4E 100%);background-attachment:fixed;
  color:var(--fg);font:15px/1.5 'Fira Sans',system-ui,-apple-system,'Segoe UI',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}
.mono{font-family:'Fira Code',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ic{width:16px;height:16px;flex:none}
a{color:inherit}
:focus-visible{outline:2px solid var(--info);outline-offset:2px;border-radius:6px}

body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:#0E1838}
.top{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:rgba(14,24,56,.70);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.top-in{max-width:1120px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;margin-right:auto;min-width:0}
.logo{width:36px;height:36px;border-radius:10px;object-fit:cover;flex:none}
.logo-fallback{display:grid;place-items:center;background:linear-gradient(135deg,#2DD4BF,#818CF8);color:#04111d;font-weight:700}
.brand h1{font-size:16px;font-weight:600;letter-spacing:.1px;line-height:1.2}
.brand p{font-size:12px;color:var(--mut)}
.status{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--fg2);border:1px solid var(--line);padding:5px 10px;border-radius:999px;white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;background:var(--mut2)}
.status.live .dot{background:var(--ok);box-shadow:0 0 0 0 rgba(34,197,94,.5);animation:pulse 2s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 7px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.switches{display:flex;gap:8px;width:100%;flex-wrap:wrap}
.segs{display:flex;flex:1 1 220px;gap:2px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:3px}
.seg{flex:1;display:flex;align-items:center;justify-content:center;min-height:40px;padding:0 10px;border-radius:9px;font-size:14px;white-space:nowrap;font-weight:500;color:var(--mut);text-decoration:none;transition:background .2s,color .2s}
.seg:hover{color:var(--fg)}
.seg[aria-current="page"]{background:rgba(255,255,255,.14);color:var(--fg);box-shadow:0 1px 0 rgba(255,255,255,.10) inset,0 6px 16px rgba(3,8,32,.35)}

main{max-width:1120px;margin:0 auto;padding:18px 16px 40px}
.datebar{display:flex;align-items:center;gap:8px;margin-bottom:18px;flex-wrap:wrap}
.iconbtn{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg2);text-decoration:none;transition:border-color .2s,background .2s}
.iconbtn:hover{border-color:var(--line2);background:var(--card2)}
.iconbtn .ic{width:18px;height:18px}
.iconbtn.disabled{opacity:.35}
.picker{flex:1 1 150px;max-width:280px;min-width:0}
.picker input{width:100%;height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:500 16px 'Fira Sans',sans-serif;color-scheme:dark}
.chip{display:inline-flex;align-items:center;height:44px;padding:0 14px;border-radius:12px;background:rgba(45,212,191,.14);color:#99F6E4;border:1px solid rgba(45,212,191,.40);text-decoration:none;font-size:14px;font-weight:500;white-space:nowrap}
.eyebrow{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:var(--mut);margin:0 2px 12px}

.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px}
.kpi{background:linear-gradient(180deg,var(--card2),var(--card));border:1px solid var(--line);border-radius:var(--r);padding:16px;position:relative;overflow:hidden;box-shadow:var(--shadow);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.kpi .ki{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:rgba(129,140,248,.18);color:#C7D2FE;margin-bottom:10px}
.kv{font-size:26px;font-weight:600;line-height:1.1}
.of{font-size:14px;color:var(--mut);font-weight:500}
.kl{font-size:13px;color:var(--mut);margin-top:4px}
.kpi-ring{display:flex;align-items:center;gap:14px}
.ring{width:56px;height:56px;flex:none}
.ring-bg{fill:none;stroke:rgba(199,210,254,.16);stroke-width:6}
.ring-fg{fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round}

.grid-hubs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.hub{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;transition:border-color .2s,transform .2s;box-shadow:var(--shadow);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.hub:hover{border-color:var(--line2)}
.hub-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}
.hub-h h3{font-size:15px;font-weight:600}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;padding:4px 9px;border-radius:999px;white-space:nowrap}
.badge .ic{width:13px;height:13px}
.badge.ok{background:rgba(34,197,94,.12);color:#86EFAC}
.badge.warn{background:rgba(245,158,11,.12);color:#FCD34D}
.badge.bad{background:rgba(248,113,113,.12);color:#FCA5A5}
.badge.idle{background:rgba(148,163,184,.12);color:var(--fg2)}
.badge.off{background:rgba(148,163,184,.08);color:var(--mut)}
.hub-flow{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:8px;padding:12px;border-radius:var(--r-sm);background:var(--bg2);border:1px solid var(--line)}
.hub-flow .k{display:block;font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--mut)}
.hub-flow .v{font-size:17px;font-weight:600}
.hub-flow>div:last-child{text-align:right}
.arrow{color:var(--mut2);padding-bottom:2px}
.dash{color:var(--mut2)}
.hub-total{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:12px;flex-wrap:wrap}
.tot{font-size:24px;font-weight:600}
.tot small{font-size:13px;color:var(--mut);font-family:'Fira Sans',sans-serif;font-weight:500}
.hub-off{color:var(--mut);font-size:14px;padding:12px;border-radius:var(--r-sm);background:var(--bg2);border:1px dashed var(--line2)}
.delta{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500}
.delta .ic{width:13px;height:13px}
.delta.pos{color:#86EFAC}.delta.neg{color:#FCA5A5}
.empty{grid-column:1/-1;text-align:center;color:var(--mut);padding:28px;border:1px dashed var(--line2);border-radius:var(--r);list-style:none}

.cols{display:grid;gap:12px;margin-bottom:12px}
.cols>*,.panel{min-width:0}
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;margin-bottom:12px;box-shadow:var(--shadow);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.cols .panel{margin-bottom:0}
.panel-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px}
.panel-h h3{font-size:15px;font-weight:600}
.hint{font-size:12px;color:var(--mut2)}
.hero{background:radial-gradient(520px 220px at 0 0,rgba(45,212,191,.20),transparent 70%),linear-gradient(180deg,var(--card2),var(--card))}
.hero-k{font-size:13px;color:var(--mut)}
.hero-v{font-size:40px;font-weight:600;line-height:1.1;margin:4px 0 6px}
.hero-s{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
.hero-s dt{font-size:12px;color:var(--mut)}
.hero-s dd{font-size:17px;font-weight:600}

.chart-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.chart{display:block;width:100%;height:170px}
.chart .grid{stroke:rgba(148,163,184,.12);stroke-dasharray:3 4}
.chart .base{stroke:rgba(148,163,184,.35)}
.chart .yl{fill:var(--mut2);font:10px 'Fira Code',monospace}
.chart .xl{fill:var(--mut);font:10px 'Fira Code',monospace}
.chart .peak{fill:var(--fg);font:600 11px 'Fira Code',monospace}
.chart .bar{fill:var(--series);transition:fill .15s}
.chart .hit{fill:transparent}
.chart .bar-g:hover .bar,.chart .bar-g:focus .bar{fill:var(--series-hi)}
.chart .bar-g:hover .xl{fill:var(--fg)}

.ranks{list-style:none;display:grid;gap:14px}
.rank{display:flex;gap:12px;align-items:flex-start}
.rk{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-size:12px;background:var(--bg2);border:1px solid var(--line);color:var(--fg2);flex:none;margin-top:1px}
.rb{flex:1;min-width:0}
.rt{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.rn{font-weight:500}
.rv{font-weight:600}
.rv small{color:var(--mut);font-family:'Fira Sans',sans-serif;font-weight:500}
.track{height:8px;border-radius:999px;background:rgba(148,163,184,.12);margin:7px 0 6px;overflow:hidden}
.fill{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#38BDF8,var(--series))}
.rm{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--mut)}
.rm .gap{display:inline-flex;align-items:center;gap:4px;color:#FCD34D}
.rm .gap .ic{width:12px;height:12px}

.daily summary{cursor:pointer;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:baseline;gap:8px;min-height:24px;list-style:none}
.daily summary::-webkit-details-marker{display:none}
.daily[open] summary{margin-bottom:12px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tbl{width:100%;border-collapse:collapse;font:13px 'Fira Code',monospace;font-variant-numeric:tabular-nums}
.tbl th,.tbl td{padding:9px 10px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
.tbl thead th{font:600 11px 'Fira Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);position:sticky;top:0;background:var(--solid)}
.tbl th:first-child{text-align:left}
.tbl tbody th a{color:#93C5FD;text-decoration:none}
.tbl .mut{color:var(--mut2)}.tbl .strong{color:var(--fg);font-weight:600}
.eyebar{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;margin-bottom:12px}
.eyebar .eyebrow{margin:0 2px}
/* hub cards open that hub's month */
a.hub-link{display:block;color:inherit;text-decoration:none;cursor:pointer}
a.hub-link:hover{border-color:var(--accent,#2DD4BF);transform:translateY(-2px)}
a.hub-link:focus-visible{outline:2px solid var(--accent,#2DD4BF);outline-offset:2px}
.hub-more{display:flex;align-items:center;justify-content:flex-end;gap:2px;margin-top:10px;font-size:12px;color:var(--mut)}
a.hub-link:hover .hub-more{color:var(--fg)}
.hub-more .ic{width:14px;height:14px}
/* hub month view */
.kpis-5{grid-template-columns:repeat(5,1fr)}
.kpi-total{background:linear-gradient(180deg,rgba(45,212,191,.22),rgba(45,212,191,.08));border-color:rgba(45,212,191,.45)}
.kpi-total .kv{color:#5EEAD4}
.hubpick select{width:100%;height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:500 15px 'Fira Sans',sans-serif;color-scheme:dark}
.eyebrow .back{display:inline-flex;align-items:center;gap:2px;color:#93C5FD;text-decoration:none}
.eyebrow .back .ic{width:14px;height:14px}
.hub-tbl tr.off td,.hub-tbl tr.off th{opacity:.6}
.hub-tbl tr.gap td{background:rgba(251,191,36,.06)}
.carry{color:var(--mut);margin-left:2px}
@media (max-width:900px){.kpis-5{grid-template-columns:repeat(3,1fr)}}
@media (max-width:520px){.kpis-5{grid-template-columns:1fr 1fr}.kpis-5 .kpi-total{grid-column:1/-1}}
.fuelchip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--fg2);background:var(--card);border:1px solid var(--line);padding:5px 10px;border-radius:999px}
.fuelchip .ic{width:14px;height:14px;color:#FCD34D}
.src{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);background:rgba(148,163,184,.12);padding:1px 6px;border-radius:6px;margin-left:2px}
button.chip{cursor:pointer;font-family:inherit}
.invoice{padding:0;overflow:hidden}
.inv-h{display:grid;gap:14px;padding:18px 16px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--card2),var(--card))}
.inv-t{font-size:18px;font-weight:600}
.inv-sub{font-size:13px;color:var(--mut);margin-top:2px}
.inv-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.inv-meta dt{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.inv-meta dd{font-size:14px;margin-top:2px}
.inv-tbl th[scope=row]{font-family:'Fira Sans',sans-serif;font-weight:500;color:var(--fg);white-space:normal;min-width:170px}
.inv-tbl tfoot th,.inv-tbl tfoot td{border-bottom:0;background:rgba(45,212,191,.10);font-weight:600;color:var(--fg)}
.invoice .scroll{padding:0 6px}
.inv-total{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:16px;border-top:1px solid var(--line)}
.inv-total span{color:var(--mut);font-size:13px}
.inv-total b{font-size:26px;font-weight:600}
.inv-notes{list-style:none;padding:0 16px 16px;display:grid;gap:6px;font-size:12px;color:var(--mut)}
.inv-notes .warn{display:flex;gap:6px;align-items:flex-start;color:#FCD34D}
.inv-notes .warn .ic{width:13px;height:13px;margin-top:2px}
@media (max-width:640px){.hide-sm{display:none}}
@media print{
  body{background:#fff;color:#111}
  .top,.noprint,.datebar,.foot{display:none!important}
  main{padding:0;max-width:none}
  .panel,.inv-h,.inv-tbl tfoot th,.inv-tbl tfoot td{background:#fff!important;border-color:#ccc!important;color:#111!important}
  .tbl th,.tbl td{color:#111!important;border-color:#ddd!important}
  .inv-sub,.inv-meta dt,.inv-notes,.inv-total span,.mut{color:#555!important}
}
.signout{color:var(--fg2);text-decoration:underline;text-underline-offset:3px}
.foot{max-width:1120px;margin:0 auto;padding:0 16px 28px;color:var(--mut2);font-size:12px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}

@media (min-width:860px){
  .switches{width:auto}
  .segs{flex:none;min-width:220px}
  .cols{grid-template-columns:360px 1fr}
  .kv{font-size:30px}
}
@media (max-width:520px){
  .top-in{padding:12px 14px;gap:10px}
  .switches{flex-direction:column;gap:8px}
  .segs{flex:none;width:100%}
  .status{order:3}
  main{padding:16px 14px 32px}
  .picker{max-width:none}
  .datebar .chip{flex:1 0 100%;justify-content:center}
  .eyebar{flex-direction:column;align-items:flex-start}
  .hub,.panel:not(.invoice),.kpi{padding:14px}
  .inv-h{padding:16px 14px}
  .kpis{grid-template-columns:1fr 1fr}
  .kpi-ring{grid-column:span 2}
  .hero-v{font-size:34px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>
<header class="top">
  <div class="top-in">
    <div class="brand">${logo}<div><h1>Fleet Operations</h1><p>Raftar · Meter readings · ${esc(lc.label)}</p></div></div>
    <span class="status${live ? ' live' : ''}"><span class="dot"></span>${live ? 'Live' : 'Updated'} · ${now} PKT</span>
    <div class="switches">
      <nav class="segs" aria-label="Fleet">${fleetTabs}</nav>
      <nav class="segs" aria-label="View">
        <a class="seg" href="?date=${date}${F}"${view === 'day' ? ' aria-current="page"' : ''}>Day</a>
        <a class="seg" href="?view=month&month=${month}${F}"${view === 'month' ? ' aria-current="page"' : ''}>Month</a>
        <a class="seg" href="?view=invoice&month=${month}${F}"${view === 'invoice' ? ' aria-current="page"' : ''}>Invoice</a>
      </nav>
    </div>
  </div>
</header>
<main>${body}</main>
<footer class="foot"><span>Source: ${esc(lc.tab)} · Total = LDO − FPU</span><span>${opts.user ? esc(opts.user) + ' · ' : ''}<a href="/account" class="signout">Change password</a> · <a href="/logout" class="signout">Sign out</a></span></footer>
</body>
</html>`;
}

module.exports = { render };
