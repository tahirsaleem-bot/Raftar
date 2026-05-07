const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logFile = path.join(logsDir, 'app.log');

function formatLine(level, args) {
  const ts = new Date().toISOString();
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  return `[${ts}] [${level}] ${msg}`;
}

function write(level, args) {
  const line = formatLine(level, args);
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

const logger = {
  info: (...args) => write('INFO', args),
  warn: (...args) => write('WARN', args),
  error: (...args) => write('ERROR', args),
};

module.exports = logger;
