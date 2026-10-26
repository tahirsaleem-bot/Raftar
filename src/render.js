// Fills the house-style template from the AI's structured record, then prints it with
// Chromium. Same template as the local /exit-interview skill, so documents produced here
// and by hand are indistinguishable.
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'templates', 'record.html');
const ASSETS = path.join(ROOT, 'assets');

const esc = s => String(s == null ? '' : s)
  .replace(/&(?![a-zA-Z#][a-zA-Z0-9]{0,8};)/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Field text may legitimately contain <strong>/<em>, so allow those through and escape the
// rest. Anything the model emits is still untrusted input being put into a document.
function rich(s) {
  return esc(s)
    .replace(/&lt;(\/?(?:strong|em|b|i))&gt;/g, '<$1>');
}

const dataUri = f =>
  'data:image/png;base64,' + fs.readFileSync(path.join(ASSETS, f)).toString('base64');

const PRONOUN = {
  he:   { They: 'He',   they: 'he',   their: 'his' },
  she:  { They: 'She',  they: 'she',  their: 'her' },
  they: { They: 'They', they: 'they', their: 'their' },
};

const BADGE = { adverse: 'b-neg', neutral: 'b-neu', positive: 'b-pos' };
const BADGE_LABEL = { adverse: 'Adverse', neutral: 'Neutral', positive: 'Positive' };

const RESTRICT_NOTE = n => `<div class="restrict"><b>Restricted.</b> Section ${n} should be `
  + 'handled by HR / People &amp; Culture leadership and not circulated with the rest of this record.</div>';

function buildHtml(rec, meta) {
  let t = fs.readFileSync(TEMPLATE, 'utf8');
  const p = PRONOUN[rec.pronoun] || PRONOUN.they;

  // The leaver's own sentence sits under the reporting paragraph rather than inside it, so
  // a reader can always see where our wording stops and theirs begins. Absent for any point
  // the notetaker paraphrased away - that is correct, not a gap to be filled.
  // Each finding is one block, so a page break can fall between findings but never between
  // a finding and the words it rests on.
  const flags = rec.flags.map(f => {
    let out = `<p class="fl"><strong>${esc(f.number)} - ${rich(f.title)}.</strong> ${rich(f.body)}</p>`;
    const q = String(f.quote || '').trim().replace(/^["“]|["”]$/g, '').trim();
    if (q) out += `\n<p class="q">&ldquo;${esc(q)}&rdquo;</p>`;
    if (f.restricted) out += '\n' + RESTRICT_NOTE(esc(f.number));
    return `<div class="flag">${out}</div>`;
  }).join('\n');

  const named = rec.named.map(n =>
    `<tr><td><strong>${esc(n.person)}</strong></td>`
    + `<td><span class="badge ${BADGE[n.register] || 'b-neu'}">${BADGE_LABEL[n.register] || 'Neutral'}</span></td>`
    + `<td>${rich(n.what)}</td><td>${esc(n.ref)}</td></tr>`
  ).join('\n  ');

  const li = arr => arr.map(x => `<li>${rich(x)}</li>`).join('\n  ');

  const fill = {
    '{{NAME}}': esc(rec.name),
    '{{ROLE}}': esc(rec.role),
    '{{INTERVIEWER}}': esc(meta.interviewer),
    '{{DATE}}': esc(meta.dateLong),
    '{{FACT_1}}': esc(rec.facts[0]), '{{FACT_2}}': esc(rec.facts[1]),
    '{{FACT_3}}': esc(rec.facts[2]), '{{FACT_4}}': esc(rec.facts[3]),
    '{{TENURE}}': esc(rec.tenure),
    '{{DATE_MODE}}': esc(rec.dateMode),
    '{{SEPARATION}}': esc(rec.separation),
    '{{REASONS_LEAD}}': rich(rec.reasonsLead),
    '{{REASONS}}': li(rec.reasons),
    '{{STRENGTHS}}': li(rec.strengths),
    '{{FLAGS}}': flags,
    '{{NAMED}}': named,
    '{{REQUESTS}}': li(rec.requests),
    '{{THEY}}': p.They, '{{they}}': p.they, '{{their}}': p.their,
    '{{LOGO_TALEEMABAD}}': dataUri('logo_taleemabad.png'),
    '{{LOGO_NIETE}}': dataUri('logo_niete.png'),
  };
  for (const [k, v] of Object.entries(fill)) t = t.split(k).join(v);

  // If the record has no named individuals, drop that section rather than printing an
  // empty table under a heading.
  if (!rec.named.length) {
    t = t.replace(/<h2><span class="num">5<\/span>[\s\S]*?<h2><span class="num">6<\/span>/,
                  '<h2><span class="num">5</span>');
    t = t.replace(/<span class="num">(\d)<\/span>/g, (m, d) => `<span class="num">${d > 5 ? d - 1 : d}</span>`);
  }
  return t;
}

// Chromium renders this into the bottom margin of every page. It is a separate document
// from the record, so it inherits none of the template's CSS and carries its own.
// Laid out as a table, not flex: the header/footer templates are rendered in a restricted
// context where Chromium ignores a good deal of modern CSS, and a footer that silently
// collapses is worse than no footer. The explicit font-size matters for the same reason -
// the default in that context is unreadably small.
const footerHtml = name =>
  '<table style="width:100%;border:0;border-collapse:collapse;'
  + 'font-family:Segoe UI,Arial,sans-serif;font-size:7pt;color:#6b7a8b;'
  + '-webkit-print-color-adjust:exact;print-color-adjust:exact"><tr>'
  + `<td style="text-align:left;white-space:nowrap;padding:0 12mm">Exit Interview Record &nbsp;&middot;&nbsp; ${esc(name || '')}</td>`
  + '<td style="text-align:center;white-space:nowrap;color:#8a2020;font-weight:600">Confidential &mdash; Internal Use Only</td>'
  + '<td style="text-align:right;white-space:nowrap;padding:0 12mm">Page <span class="pageNumber"></span> of <span class="totalPages"></span></td>'
  + '</tr></table>';

async function toPdf(html, meta = {}) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    // A throwaway profile per render: Chromium stamps SingletonLock into the profile dir and
    // a reused one will refuse to start after an unclean exit.
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'eia-')),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,          // without this the navy masthead prints white
      margin: { top: '13mm', right: '12mm', bottom: '14mm', left: '12mm' },
      // A record is printed, carried into meetings and forwarded a page at a time. Without
      // this, a loose sheet says nothing about whose record it is, that it is confidential,
      // or whether anything is missing from the set.
      displayHeaderFooter: !meta.noFooter,
      headerTemplate: '<div></div>',
      footerTemplate: footerHtml(meta.name),
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

// Everything this app produces goes through Chromium, and a Chromium that has stopped
// working is currently discovered at the worst possible moment: when a record is drafted
// and due. This prints a two-page throwaway and reports what came back, in the same spirit
// as checkDrive().
//
// footerDelta is the number of bytes the running footer adds. Rendering the identical
// document with the footer switched off and subtracting is the only way to tell from here
// that the footer actually drew - a PDF's text sits inside compressed streams, so it
// cannot simply be searched for the word "Page".
async function selfTest() {
  const started = Date.now();
  const filler = '<p>' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(120) + '</p>';
  const html = `<!doctype html><html><body style="font:11pt Arial">${filler}</body></html>`;
  try {
    const withFooter = await toPdf(html, { name: 'Render self-test' });
    const plain = await toPdf(html, { name: '', noFooter: true });
    const pages = (withFooter.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    return {
      ok: true, ms: Date.now() - started, pages,
      bytes: withFooter.length,
      footerDelta: withFooter.length - plain.length,
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, reason: e.message.split('\n')[0] };
  }
}

const fileName = (name, date) =>
  `Exit_Interview_Record_${String(name).trim().replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}_${date}.pdf`;

module.exports = { buildHtml, toPdf, fileName, selfTest };
