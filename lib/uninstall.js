#!/usr/bin/env node
/**
 * claude-usage-auditor · uninstall
 */

const fs = require('fs');
const path = require('path');
const {
  DATA_DIR,
  SETTINGS_PATH,
  COMMANDS_DIR,
  COMMAND_PREFIX,
  HOOK_MARKERS,
  DEBUG
} = require('./config');
const { readJsonStrict, writeJson, backupFile } = require('./utils/fs-utils');

const PURGE = process.argv.includes('--purge');

function verbose(msg) {
  if (DEBUG) process.stdout.write(`${msg}
`);
}

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function main() {
  console.log('Claude Usage Auditor · uninstall');
  console.log('');

  const backup = backupFile(SETTINGS_PATH);
  if (backup) verbose(`  settings backup: ${backup}`);

  let settings;
  try {
    settings = readJsonStrict(SETTINGS_PATH, {});
  } catch (err) {
    console.error(`  Cannot uninstall safely: ${err.message}`);
    process.exit(1);
  }

  let removed = 0;
  if (settings.hooks) {
    for (const event of Object.keys(settings.hooks)) {
      const before = settings.hooks[event].length;
      settings.hooks[event] = settings.hooks[event].filter((entry) => {
        if (!entry.hooks) return true;
        const match = entry.hooks.some((h) => {
          if (!h.command) return false;
          const norm = h.command.replace(/\\/g, '/');
          return HOOK_MARKERS.some((m) => norm.includes(m));
        });
        return !match;
      });
      removed += before - settings.hooks[event].length;
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    writeJson(SETTINGS_PATH, settings, { mode: 0o600 });
  }

  console.log(`  ✓ Hooks removed: ${removed}`);

  let commandsRemoved = 0;
  if (fs.existsSync(COMMANDS_DIR)) {
    for (const entry of fs.readdirSync(COMMANDS_DIR)) {
      if (!entry.endsWith('.md')) continue;
      if (!entry.startsWith(COMMAND_PREFIX)) continue;
      try { fs.unlinkSync(path.join(COMMANDS_DIR, entry)); commandsRemoved += 1; } catch {}
    }
  }
  console.log(`  ✓ Slash commands removed: ${commandsRemoved}`);

  if (PURGE) {
    rmrf(DATA_DIR);
    console.log(`  ✓ Data deleted: ${DATA_DIR}`);
  } else {
    console.log(`  · Data preserved in ${DATA_DIR}`);
  }

  console.log('');
  console.log('Uninstall complete.');
}

main();
