// JSON state on the Railway volume. Writes go to a temp file first so a crash never leaves half a file.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const FILE = path.join(DATA_DIR, 'state.json');
let state = { cases: [], sessions: {}, seq: 1, lastPoll: null };

function load() {
  fs.mkdirSync(path.join(DATA_DIR, 'cvs'), { recursive: true });
  if (fs.existsSync(FILE)) state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  return state;
}
function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, FILE);
}
const get = () => state;
const caseById = id => state.cases.find(c => c.id === id);
function log(c, msg) {
  (c.log ||= []).push({ at: new Date().toISOString(), msg });
  if (c.log.length > 200) c.log = c.log.slice(-200);
}
const cvPath = id => path.join(DATA_DIR, 'cvs', `${id}.bin`);

module.exports = { load, save, get, caseById, log, cvPath };
