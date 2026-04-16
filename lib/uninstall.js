#!/usr/bin/env node
/**
 * NextGen AI Institute Productivity · uninstall
 *
 * Quita los hooks de ~/.claude/settings.json.
 * No borra los datos a menos que pases --purge.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const SETTINGS_PATH = path.join(HOME, '.claude', 'settings.json');
const DATA_DIR = path.join(HOME, '.nextgenai-productivity');
// Markers independientes del nombre del directorio (funciona tras forks).
const HOOK_MARKERS = [
  '/hooks/tracker.js',
  '/hooks/session-start.js'
];

const PURGE = process.argv.includes('--purge');

function readJson(p) {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return {}; }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function main() {
  console.log('NextGen AI Institute Productivity · desinstalación');
  console.log('');

  // 1. Quitar hooks de settings.json
  const settings = readJson(SETTINGS_PATH);
  let removed = 0;
  if (settings.hooks) {
    for (const event of Object.keys(settings.hooks)) {
      const before = settings.hooks[event].length;
      settings.hooks[event] = settings.hooks[event].filter(entry => {
        if (!entry.hooks) return true;
        const match = entry.hooks.some(h => {
          if (!h.command) return false;
          const norm = h.command.replace(/\\/g, '/');
          return HOOK_MARKERS.some(m => norm.includes(m));
        });
        return !match;
      });
      removed += before - settings.hooks[event].length;
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    writeJson(SETTINGS_PATH, settings);
  }
  console.log(`  ✓ Hooks quitados: ${removed}`);

  // 2. Opcional: borrar datos
  if (PURGE) {
    rmrf(DATA_DIR);
    console.log(`  ✓ Datos borrados: ${DATA_DIR}`);
  } else {
    console.log(`  · Datos preservados en ${DATA_DIR}`);
    console.log(`    Ejecuta con --purge para borrarlos.`);
  }

  console.log('');
  console.log('Desinstalación completa.');
}

main();
