#!/usr/bin/env node
/**
 * NextGen AI Institute Productivity · install
 *
 * Configura hooks en ~/.claude/settings.json y crea directorio de datos.
 * Idempotente: si ya está instalado, no duplica.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const SKILL_DIR = path.resolve(__dirname, '..');
const HOOK_PATH = path.join(SKILL_DIR, 'hooks', 'tracker.js');
const SESSION_HOOK_PATH = path.join(SKILL_DIR, 'hooks', 'session-start.js');
const SETTINGS_PATH = path.join(HOME, '.claude', 'settings.json');
const DATA_DIR = path.join(HOME, '.nextgenai-productivity');

// Markers independientes del nombre del directorio del plugin (funciona tras
// renombrados o forks del repo).
const HOOK_MARKER = '/hooks/tracker.js';
const SESSION_HOOK_MARKER = '/hooks/session-start.js';

function readJson(p) {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return {}; }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function hookCommand(mode) {
  // Cross-platform: node puede estar en distintos paths, confiamos en PATH
  return `node "${HOOK_PATH}" ${mode}`;
}

function sessionHookCommand() {
  return `node "${SESSION_HOOK_PATH}"`;
}

function ensureHookEntry(hooks, eventName, mode, options = {}) {
  hooks[eventName] = hooks[eventName] || [];
  const cmd = options.command || hookCommand(mode);
  const marker = options.marker || HOOK_MARKER;
  // ¿Ya hay una entrada con nuestro marker?
  const exists = hooks[eventName].some(entry => {
    if (!entry.hooks) return false;
    return entry.hooks.some(h => h.command && h.command.replace(/\\/g, '/').includes(marker));
  });
  if (exists) return false;
  hooks[eventName].push({
    hooks: [{ type: 'command', command: cmd }]
  });
  return true;
}

function main() {
  console.log('NextGen AI Institute Productivity · instalación');
  console.log('');

  // 1. Crear directorio de datos
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(path.join(DATA_DIR, 'events'), { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'metrics'), { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'reports'), { recursive: true });
    const config = {
      version: '0.1.0',
      installed_at: new Date().toISOString(),
      hook_path: HOOK_PATH
    };
    writeJson(path.join(DATA_DIR, 'config.json'), config);
    console.log(`  ✓ Directorio creado: ${DATA_DIR}`);
  } else {
    console.log(`  · Directorio ya existe: ${DATA_DIR}`);
  }

  // 2. Verificar hook existe
  if (!fs.existsSync(HOOK_PATH)) {
    console.error(`  ✗ Hook no encontrado: ${HOOK_PATH}`);
    process.exit(1);
  }
  console.log(`  ✓ Hook verificado: ${HOOK_PATH}`);

  // 3. Insertar hooks en settings.json
  const settings = readJson(SETTINGS_PATH);
  settings.hooks = settings.hooks || {};

  const added = {
    PreToolUse: ensureHookEntry(settings.hooks, 'PreToolUse', 'pre-tool-use'),
    PostToolUse: ensureHookEntry(settings.hooks, 'PostToolUse', 'post-tool-use'),
    Stop: ensureHookEntry(settings.hooks, 'Stop', 'stop'),
    SessionStart: ensureHookEntry(settings.hooks, 'SessionStart', null, {
      command: sessionHookCommand(),
      marker: SESSION_HOOK_MARKER
    })
  };

  writeJson(SETTINGS_PATH, settings);

  for (const [event, wasAdded] of Object.entries(added)) {
    console.log(`  ${wasAdded ? '✓' : '·'} Hook ${event}${wasAdded ? ' añadido' : ' ya estaba'}`);
  }

  console.log('');
  console.log('Instalación completa.');
  console.log('');
  console.log('Los hooks empezarán a registrar eventos en tu próxima sesión de Claude Code.');
  console.log('Para generar un informe: /productivity-report');
  console.log('Para ver el estado: /productivity-status');
  console.log('Para desinstalar: /productivity-uninstall');
}

main();
