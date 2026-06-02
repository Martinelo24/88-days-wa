/**
 * Minimal .env loader (no external dependency).
 * Reads KEY=VALUE lines from a .env file at the project root into process.env.
 * Lines starting with # and blank lines are ignored. Existing env vars win.
 */
const fs = require('fs');
const path = require('path');

function loadEnv(file = path.join(__dirname, '../.env')) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf-8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

module.exports = { loadEnv };
