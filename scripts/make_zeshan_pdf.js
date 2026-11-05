// Generate a PDF summarising the full Upward Appraisal written for Zeshan Ali Dhillon.
// Uses a fresh headless browser (no userDataDir) so it never conflicts with the form session.
const path = require('path');
const puppeteer = require('puppeteer');

const OUT = path.join(__dirname, '..', 'output', 'Zeshan_Upward_Appraisal.pdf');

const section1 = [
  { v: "Don't walk away from hard things", r: "+ (Plus)",
    t: "Zeshan consistently moves toward difficult problems instead of avoiding them. When something is complex, uncomfortable or high-pressure, he stays with it and sees it through rather than passing it on to someone else. He is willing to learn whatever is needed to get the job done, keeps his composure when things go wrong, and follows through on hard commitments. He takes ownership of tough situations and does not step back when the work gets challenging." },
  { v: "All for one, one for all", r: "+ (Plus)",
    t: "Zeshan genuinely thinks about the whole team and not just his own area. He steps in to support colleagues, shares what he learns openly, and looks out for people during uncertain or transitional times. He pushes for fair and consistent treatment so that no one feels left out or overlooked, and he is willing to repair working relationships rather than let friction linger. Overall he behaves like a real team player who wants everyone around him to do well." },
  { v: "Don't hold on too tightly", r: "+ (Plus)",
    t: "Zeshan stays firmly grounded in his values, but he does not cling to his position, control or personal credit. He can set his ego aside, let things go, and move forward rather than holding on to grievances. He is able to hold different points of view at the same time without forcing his own, and he makes decisions based on principle rather than personal convenience. He listens sincerely, stays humble, and remains open-handed with ideas and credit." },
  { v: "Have courageous conversations", r: "+ (Plus)",
    t: "Zeshan addresses issues directly and honestly rather than avoiding them or letting them build up. When something needs to be said, he goes straight to the person involved and has the conversation openly and respectfully, even when it is uncomfortable. He is comfortable giving clear, direct feedback while staying calm and fair, and he is equally open to receiving honest feedback about himself. This keeps small problems from festering and steadily builds trust across the team." },
  { v: "Continuously improve our craft", r: "+ (Plus)",
    t: "Zeshan actively seeks feedback and acts on it quickly. He takes learning seriously, reflects on it honestly, and applies it to the way he works. He recovers from mistakes without letting them hold him back and keeps sharpening his skills over time. He keeps looking for ways to do things better, stays curious, and is always willing to pick up new tools and approaches. The habit of learning and continuously improving is clearly present and consistent." },
  { v: "Practice Joy", r: "+/- (Plus/Minus)",
    t: "Zeshan brings a warm, positive energy to the team and genuinely lifts the people around him. He keeps everyday interactions human, encourages less experienced team members, and makes an effort to keep the overall mood upbeat and supportive. The one area to work on is staying composed under heavy pressure - in very tense or high-stakes moments he can waver a little and let the stress show, which affects the calm energy the team looks to him for. When things are steady he is a real morale-builder; holding that same steadiness under pressure is the next step." },
];

const section2 = [
  { c: "Cultural Stewardship", r: "4 - Strong",
    t: "Zeshan genuinely models a values-driven culture and consistently reinforces the behaviours that make people feel they belong and can do their best work. He protects the values even when it is inconvenient, keeps interactions human, and shows up strongly for the team during difficult periods. The area to keep building is making that culture work just as visible and intentional in normal, steady times as it is during a crisis, so that it becomes continuous rather than occasional." },
  { c: "People Growth & Accountability", r: "3 - Proficient",
    t: "Zeshan sets a strong personal example and holds himself to a high standard, and he supports his team members individually. The clearest area to develop is building depth and accountability across the team - creating clear expectations, structured development, and enough capability in others that the function does not depend so heavily on him. Strengthening the bench so there is a clear next line of leadership would move this from good to great." },
  { c: "Vision to Strategy", r: "3 - Proficient",
    t: "Zeshan understands the organization deeply and executes reliably on the ground. The growth opportunity is stepping further back to translate the wider organizational vision into a clear, prioritized people strategy that the team can own and execute independently. Moving from strong day-to-day delivery toward more deliberate, forward-looking strategic planning would help the function connect its work more explicitly to where the organization is heading." },
  { c: "Systemic Organizational Health", r: "4 - Strong",
    t: "Zeshan has done real, lasting work to strengthen the organization's people systems and processes. He has built and improved the underlying infrastructure, rolled out new processes carefully and methodically, and pushed for fair and consistent practices so things scale in a principled way. The next step is to keep making these systems more self-sustaining and data-informed so they continue to run smoothly and fairly as the organization keeps growing." },
  { c: "Strategic Resource Allocation", r: "3 - Proficient",
    t: "Zeshan is thoughtful about people and shows up fully where it matters most, especially under pressure. The area to develop is allocating time, attention and budget in a more deliberate, planned way - and connecting people investments more clearly to measurable outcomes and return. Protecting bandwidth for higher-leverage, strategic work rather than being pulled mostly into urgent day-to-day demands would increase his overall impact." },
];

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const row1 = section1.map((x,i)=>`<tr><td class="num">${i+1}</td><td class="val">${esc(x.v)}</td><td class="rate">${esc(x.r)}</td><td class="ev">${esc(x.t)}</td></tr>`).join('');
const row2 = section2.map((x,i)=>`<tr><td class="num">${i+1}</td><td class="val">${esc(x.c)}</td><td class="rate">${esc(x.r)}</td><td class="ev">${esc(x.t)}</td></tr>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#1f2937; margin:0; padding:0; font-size:11px; }
  .wrap { padding: 28px 34px; }
  h1 { color:#5b21b6; font-size:22px; margin:0 0 2px; }
  .sub { color:#6b7280; font-size:12px; margin-bottom:14px; }
  .meta { background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:10px 14px; margin-bottom:18px; font-size:11px; }
  .meta b { color:#5b21b6; }
  h2 { color:#111827; font-size:15px; margin:18px 0 8px; border-bottom:2px solid #a78bfa; padding-bottom:4px; }
  table { width:100%; border-collapse:collapse; margin-bottom:8px; }
  th { background:#7c3aed; color:#fff; text-align:left; padding:7px 8px; font-size:10.5px; }
  td { border:1px solid #e5e7eb; padding:7px 8px; vertical-align:top; }
  .num { width:24px; text-align:center; font-weight:bold; color:#7c3aed; }
  .val { width:150px; font-weight:600; }
  .rate { width:80px; font-weight:700; color:#047857; }
  .ev { text-align:justify; line-height:1.45; }
  .benchmark { background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:8px 14px; font-size:11px; margin-bottom:6px; }
  .benchmark b { color:#047857; }
  .foot { margin-top:16px; color:#9ca3af; font-size:9px; text-align:center; }
</style></head><body><div class="wrap">
  <h1>Upward Appraisal Assessment</h1>
  <div class="sub">Assessment written for: <b>Zeshan Ali Dhillon</b> — Head of People &amp; Culture</div>
  <div class="meta">
    <b>Assessment Type:</b> Upward Appraisal &nbsp;&nbsp;|&nbsp;&nbsp;
    <b>Manager Assessed:</b> Zeshan Ali Dhillon &nbsp;&nbsp;|&nbsp;&nbsp;
    <b>Reviewer:</b> Tahir Saleem &nbsp;&nbsp;|&nbsp;&nbsp;
    <b>Cycle:</b> June 2026<br>
    <b>Framework:</b> Taleemabad "Right People" (Traction / Gino Wickman) &nbsp;&nbsp;|&nbsp;&nbsp; <b>Model:</b> SBI (Situation-Behaviour-Impact)
  </div>

  <h2>Section 1 — Values Scorecard</h2>
  <div class="benchmark">Ratings: <b>5 &times; "+" (Plus)</b>, <b>1 &times; "+/-" (Plus/Minus)</b>, 0 &times; "-" (Minus) &nbsp;&rarr;&nbsp; Benchmark "Right Person" <b>MET</b> &nbsp;(Score 28 / 30)</div>
  <table><tr><th>#</th><th>Core Value</th><th>Rating</th><th>Evidence &amp; Commentary (SBI)</th></tr>${row1}</table>

  <h2>Section 2 — People Competencies</h2>
  <div class="benchmark">Scale: 1 Developing &middot; 2 Emerging &middot; 3 Proficient &middot; 4 Strong &middot; 5 Exceptional</div>
  <table><tr><th>#</th><th>Competency</th><th>Rating</th><th>Comments / Observations</th></tr>${row2}</table>

  <div class="foot">Generated from the Taleemabad Markaz Upward Appraisal — Zeshan Ali Dhillon. Wording is general (no third-party names). For internal reference.</div>
</div></body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top:'12mm', bottom:'12mm', left:'10mm', right:'10mm' } });
  await browser.close();
  console.log('PDF created:', OUT);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
