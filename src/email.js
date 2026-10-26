// The covering email a finished record arrives in. This is the first thing the requester
// and People & Culture see - in many cases the only thing they see, if they read the
// summary and open the PDF later - so it carries the same navy and gold as the document
// rather than looking like something a script sent.
//
// Written as tables with inline styles because that is what survives Outlook and Gmail:
// Gmail strips <style> blocks entirely, and Outlook's renderer ignores most modern layout.
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAVY = '#14304f';
const GOLD = '#c9922e';
const INK = '#1f2733';
const MUTED = '#5b6b7d';
const LINE = '#dfe5ec';

const cell = (label, value) =>
  `<td style="padding:0 14px 0 0;vertical-align:top">`
  + `<div style="font:600 10px/1.4 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#5b7896">${esc(label)}</div>`
  + `<div style="font:600 14px/1.5 Arial,sans-serif;color:${NAVY};padding-top:2px">${esc(value)}</div></td>`;

function recordEmail({ name, role, interviewDate, driveLink, filename, restricted = [], note, sender, senderLine }) {
  const warn = restricted.length
    ? `<tr><td style="padding:0 28px 18px">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#fbeeee;border-left:4px solid #a83232;border-radius:0 4px 4px 0">
           <tr><td style="padding:12px 15px;font:14px/1.55 Arial,sans-serif;color:#5c2626">
             <strong style="color:#8a2020">Section${restricted.length > 1 ? 's' : ''} ${esc(restricted.join(', '))}
             ${restricted.length > 1 ? 'are' : 'is'} marked restricted.</strong>
             ${restricted.length > 1 ? 'They should' : 'It should'} stay with HR / People &amp; Culture
             leadership and should not be circulated with the rest of the record.
           </td></tr>
         </table></td></tr>`
    : '';

  const extra = note
    ? `<tr><td style="padding:0 28px 18px;font:15px/1.6 Arial,sans-serif;color:${INK}">${esc(note)}</td></tr>`
    : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 12px">
 <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0"
         style="width:600px;max-width:100%;background:#ffffff;border-radius:10px;overflow:hidden;
                box-shadow:0 1px 3px rgba(16,32,48,.08)">

   <tr><td style="background:${NAVY};padding:22px 28px 18px;border-bottom:4px solid ${GOLD}">
     <div style="font:600 10px/1.4 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#9dc0e0">
       Human Resources &middot; Separation Documentation</div>
     <div style="font:600 21px/1.3 Arial,sans-serif;color:#ffffff;padding-top:6px">Exit Interview Record</div>
     <div style="font:14px/1.5 Arial,sans-serif;color:#cfe0f0;padding-top:4px">
       <strong style="color:#fff">${esc(name)}</strong>${role ? ' &middot; ' + esc(role) : ''}</div>
   </td></tr>

   <tr><td style="padding:22px 28px 16px;font:15px/1.6 Arial,sans-serif;color:${INK}">
     The exit interview has been held and the record is attached.
   </td></tr>

   <tr><td style="padding:0 28px 18px">
     <table role="presentation" cellpadding="0" cellspacing="0"><tr>
       ${cell('Interview date', interviewDate || '-')}
       ${cell('Interviewed by', sender)}
     </tr></table>
   </td></tr>

   ${warn}
   ${extra}

   ${driveLink ? `<tr><td style="padding:0 28px 22px">
     <a href="${esc(driveLink)}" style="display:inline-block;background:${NAVY};color:#ffffff;
        font:600 15px/1 Arial,sans-serif;text-decoration:none;padding:13px 22px;border-radius:6px">
       Open the record in Drive</a>
     <div style="font:13px/1.5 Arial,sans-serif;color:${MUTED};padding-top:10px">
       Filed in the Exit Interviews folder, and attached here as
       <span style="color:${INK}">${esc(filename || 'a PDF')}</span>. Everyone on the
       People &amp; Culture alias can open the Drive copy &mdash; no access request needed.</div>
   </td></tr>` : ''}

   <tr><td style="padding:0 28px 8px"><div style="border-top:1px solid ${LINE}"></div></td></tr>

   <tr><td style="padding:12px 28px 22px;font:13px/1.6 Arial,sans-serif;color:${MUTED}">
     <div style="font:600 15px/1.4 Arial,sans-serif;color:${NAVY}">${esc(sender)}</div>
     <div>${esc(senderLine)}</div>
     <div style="padding-top:12px;color:#7b8794">
       <strong style="color:${MUTED}">Confidential.</strong> This record is one person's account,
       unverified, and the individuals named in it have not been given an opportunity to respond.</div>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
}

module.exports = { recordEmail };
