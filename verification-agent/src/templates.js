// Email bodies. The verification email is Raftar's approved template (templates/verification.html).
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const VERIFY = fs.readFileSync(path.join(__dirname, '..', 'templates', 'verification.html'), 'utf8');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// "Monday, 19 October 2026" in Pakistan time, skipping weekends.
function deadline(days) {
  const d = new Date(Date.now() + cfg.PKT_OFFSET_MIN * 60e3);
  let added = 0;
  while (added < days) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) added++; }
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^(\w+) /, '$1, ');
}
const pktDate = iso => new Date(new Date(iso).getTime() + cfg.PKT_OFFSET_MIN * 60e3)
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function verification({ recipientName, candidate, org, designation, start, end, contactFromCandidate }) {
  let html = VERIFY
    .replace(/\[Recipient Name\]/g, esc(recipientName || `${org} HR Team`))
    .replace(/\[Candidate Name\]/g, esc(candidate))
    .replace(/\[Designation\]/g, esc(designation || 'As per records'))
    .replace(/\[Start Date\]/g, esc(start || 'Not specified'))
    .replace(/\[End Date\]/g, esc(end || 'Not specified'))
    .replace(/\[Response Date\]/g, esc(deadline(cfg.RESPONSE_DAYS)))
    .replace('has listed your organization in their CV', `has listed <strong>${esc(org)}</strong> in their CV`);
  if (!contactFromCandidate) html = html.replace('has shared your contact details, with their consent, for this purpose', 'has consented to this verification');
  return { subject: `Employment Verification Request – ${candidate}`, html };
}

const wrap = body => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:620px;padding:8px 4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#2b2f33;">${body}
<p style="margin:0;">Best regards,</p><p style="margin:0;font-weight:bold;color:#1f4e8c;">${esc(cfg.SENDER_NAME)}</p>
<p style="margin:0;color:#5a6470;">${esc(cfg.SIGNATURE_TEAM)}</p></div></body></html>`;

function contactRequest({ firstName, fullName }) {
  return {
    subject: `Experience Verification – Contact Details Required | ${fullName}`,
    html: wrap(`<p style="margin:0 0 14px;">Dear ${esc(firstName)},</p>
<p style="margin:0 0 14px;">As part of our experience verification process, we kindly request you to share the contact details of the relevant team members (preferably HR or your line manager) at each of your previous organizations listed in your CV, who can help us verify your professional experience.</p>
<p style="margin:0 0 8px;">Please share the details in the following format for each organization, by <strong>${esc(deadline(3))}</strong>:</p>
<p style="margin:0 0 14px;padding:10px 14px;background:#f7f9fc;border-left:4px solid #1f4e8c;">Organization: "Name"<br>Your designation and dates: "Designation, Month/Year – Month/Year"<br>Contact person and designation: "Name, Designation"<br>Official work email: "Email"<br>Phone: "Number"</p>
<p style="margin:0 0 14px;">If you have experience letters or certificates, please attach them as well. Thank you for your cooperation.</p>`),
  };
}

function contactReminder({ firstName }) {
  return wrap(`<p style="margin:0 0 14px;">Dear ${esc(firstName)},</p>
<p style="margin:0 0 14px;">I hope you are doing well. This is a gentle reminder regarding my previous email about the experience verification process. Whenever convenient, could you please share the requested contact details?</p>
<p style="margin:0 0 14px;">If you have already sent them, please ignore this email. Thank you.</p>`);
}

function orgReminder({ recipientName, candidate, sentAt }) {
  return wrap(`<p style="margin:0 0 14px;">Dear ${esc(recipientName || 'Sir/Madam')},</p>
<p style="margin:0 0 14px;">I hope you are doing well. This is a gentle follow-up on my email of ${esc(pktDate(sentAt))} regarding the employment verification of <strong>${esc(candidate)}</strong>.</p>
<p style="margin:0 0 14px;">We would be grateful if you could confirm the details at your earliest convenience. A brief reply to this email would be sufficient.</p>
<p style="margin:0 0 14px;">Thank you for your time and support.</p>`);
}

module.exports = { verification, contactRequest, contactReminder, orgReminder };
