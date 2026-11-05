// Parse output/playbook.xlsx — list tabs and dump text of each.
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const FILE = path.join(__dirname, '..', 'output', 'playbook.xlsx');
const wb = XLSX.readFile(FILE);
console.log('TABS:', JSON.stringify(wb.SheetNames));

const dump = {};
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  dump[name] = rows;
  console.log(`\n===== TAB: ${name} (${rows.length} rows) =====`);
  rows.slice(0, 80).forEach((r, i) => {
    const line = r.map(c => (c == null ? '' : c.toString()).replace(/\s+/g, ' ').trim()).join(' | ').trim();
    if (line) console.log(`${i + 1}: ${line.slice(0, 300)}`);
  });
}
fs.writeFileSync(path.join(__dirname, '..', 'output', 'playbook_dump.json'), JSON.stringify(dump, null, 2));
console.log('\nFull dump: output/playbook_dump.json');
