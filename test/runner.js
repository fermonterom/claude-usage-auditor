#!/usr/bin/env node
/**
 * Runner mínimo sin dependencias. Uso:
 *   node test/runner.js
 *
 * Descubre test/**\/*.test.js, los ejecuta y agrega resultados a JSON
 * que el generador de informe lee (`test/results.json`).
 */

const fs = require('fs');
const path = require('path');

const TEST_DIR = __dirname;
const RESULTS_FILE = path.join(TEST_DIR, 'results.json');

const results = {
  generated_at: new Date().toISOString(),
  suites: [],
  totals: { passed: 0, failed: 0, skipped: 0 }
};

let currentSuite = null;

function suite(name, fn) {
  currentSuite = {
    name,
    category: (name.match(/\[(.+?)\]/) || [])[1] || 'unit',
    tests: []
  };
  try {
    fn();
  } catch (e) {
    currentSuite.tests.push({
      name: '<suite setup>',
      status: 'failed',
      error: e.message,
      stack: (e.stack || '').split('\n').slice(0, 5).join('\n')
    });
  }
  results.suites.push(currentSuite);
  currentSuite = null;
}

function test(name, fn) {
  const entry = { name, status: 'pending' };
  try {
    fn();
    entry.status = 'passed';
    results.totals.passed++;
  } catch (e) {
    entry.status = 'failed';
    entry.error = e.message;
    entry.stack = (e.stack || '').split('\n').slice(0, 6).join('\n');
    results.totals.failed++;
  }
  if (currentSuite) currentSuite.tests.push(entry);
  else results.suites.push({ name: '<orphan>', tests: [entry] });
}

function skip(name, reason) {
  const entry = { name, status: 'skipped', reason };
  results.totals.skipped++;
  if (currentSuite) currentSuite.tests.push(entry);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((msg ? msg + ': ' : '') + `expected ${e}, got ${a}`);
  }
}

function assertMatch(actual, pattern, msg) {
  if (!pattern.test(String(actual))) {
    throw new Error((msg ? msg + ': ' : '') + `${actual} does not match ${pattern}`);
  }
}

function assertThrows(fn, msg) {
  try { fn(); } catch (e) { return; }
  throw new Error(msg || 'expected throw but none happened');
}

global.suite = suite;
global.test = test;
global.skip = skip;
global.assert = assert;
global.assertEq = assertEq;
global.assertMatch = assertMatch;
global.assertThrows = assertThrows;

// descubrir y cargar tests
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.test\.js$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(TEST_DIR).sort();
console.log(`[runner] descubiertos ${files.length} archivos de test`);
for (const f of files) {
  try {
    require(f);
  } catch (e) {
    console.error(`[runner] error cargando ${f}: ${e.message}`);
    results.suites.push({
      name: path.basename(f),
      tests: [{ name: '<load>', status: 'failed', error: e.message }]
    });
    results.totals.failed++;
  } finally {
    try { delete require.cache[require.resolve(f)]; } catch {}
  }
}

fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf8');

const { passed, failed, skipped } = results.totals;
console.log('');
console.log(`[runner] ✓ ${passed} passed · ✗ ${failed} failed · · ${skipped} skipped`);
console.log(`[runner] resultados escritos en ${RESULTS_FILE}`);
process.exit(failed > 0 ? 1 : 0);
