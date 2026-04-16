#!/usr/bin/env node
/**
 * NextGen AI Institute Productivity · status
 *
 * Muestra si los hooks están activos y estadísticas rápidas.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const SETTINGS_PATH = path.join(HOME, '.claude', 'settings.json');
const DATA_DIR = path.join(HOME, '.nextgenai-productivity');
const EVENTS_DIR = path.join(DATA_DIR, 'events');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const HOOK_MARKER = 'nextgenai-productivity/hooks/tracker.js';

function readJson(p) {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function hooksActive() {
  const settings = readJson(SETTINGS_PATH);
  if (!settings.hooks) return {};
  const active = {};
  for (const [event, entries] of Object.entries(settings.hooks)) {
    if (!Array.isArray(entries)) continue;
    const found = entries.some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes(HOOK_MARKER))
    );
    if (found) active[event] = true;
  }
  return active;
}

function eventsToday() {
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(EVENTS_DIR, `${today}.jsonl`);
  if (!fs.existsSync(file)) return 0;
  const content = fs.readFileSync(file, 'utf8');
  return content.split('\n').filter(l => l.trim()).length;
}

function eventFilesCount() {
  if (!fs.existsSync(EVENTS_DIR)) return 0;
  return fs.readdirSync(EVENTS_DIR).filter(f => f.endsWith('.jsonl')).length;
}

function latestReport() {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.html'));
  if (files.length === 0) return null;
  files.sort();
  return path.join(REPORTS_DIR, files[files.length - 1]);
}

function main() {
  console.log('NextGen AI Institute Productivity · estado');
  console.log('');

  // 1. Hooks
  const active = hooksActive();
  const expected = ['PreToolUse', 'PostToolUse', 'Stop'];
  console.log('  Hooks en settings.json:');
  for (const ev of expected) {
    console.log(`    ${active[ev] ? '✓' : '✗'} ${ev}`);
  }

  const allActive = expected.every(ev => active[ev]);
  if (!allActive) {
    console.log('');
    console.log('  ⚠ No todos los hooks están activos. Ejecuta /productivity-install.');
  }

  // 2. Datos
  console.log('');
  console.log('  Datos:');
  if (!fs.existsSync(DATA_DIR)) {
    console.log('    · Directorio ~/.nextgenai-productivity no existe');
  } else {
    const cfg = readJson(CONFIG_PATH);
    console.log(`    · Directorio: ${DATA_DIR}`);
    if (cfg.installed_at) console.log(`    · Instalado: ${cfg.installed_at}`);
    if (cfg.version) console.log(`    · Versión: ${cfg.version}`);
    console.log(`    · Días con eventos: ${eventFilesCount()}`);
    console.log(`    · Eventos hoy: ${eventsToday()}`);
    const rep = latestReport();
    console.log(`    · Último informe: ${rep ? path.basename(rep) : '—'}`);
  }

  console.log('');
  console.log('  Comandos disponibles:');
  console.log('    /productivity-report         → informe de la semana actual');
  console.log('    /productivity-report day     → informe de hoy');
  console.log('    /productivity-install        → instalar hooks');
  console.log('    /productivity-uninstall      → quitar hooks');
}

main();
