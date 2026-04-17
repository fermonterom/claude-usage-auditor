#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { EVENTS_DIR, PROMPTED_DIR } = require('./config');

function parseDateDir(name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) return null;
  const d = new Date(`${name}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pruneOlderThan(days = 90) {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  let removed = 0;
  if (fs.existsSync(EVENTS_DIR)) {
    for (const entry of fs.readdirSync(EVENTS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dt = parseDateDir(entry.name);
      if (!dt) continue;
      if (dt.getTime() < cutoff) {
        fs.rmSync(path.join(EVENTS_DIR, entry.name), { recursive: true, force: true });
        removed += 1;
      }
    }
  }

  if (fs.existsSync(PROMPTED_DIR)) {
    for (const entry of fs.readdirSync(PROMPTED_DIR)) {
      const lockPath = path.join(PROMPTED_DIR, entry);
      try {
        const st = fs.statSync(lockPath);
        if (st.mtimeMs < cutoff) fs.unlinkSync(lockPath);
      } catch {}
    }
  }

  return { removed_dirs: removed, days };
}

function main() {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--older-than');
  let days = 90;
  if (idx >= 0 && argv[idx + 1]) {
    days = parseInt(String(argv[idx + 1]).replace(/d$/,''), 10) || 90;
  }
  const result = pruneOlderThan(days);
  process.stdout.write(JSON.stringify(result, null, 2));
}

if (require.main === module) main();

module.exports = { pruneOlderThan };
