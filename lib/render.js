#!/usr/bin/env node
/**
 * NextGen AI Institute Productivity · render
 *
 * Agrega eventos y genera HTML.
 * Uso:
 *   node render.js week             → semana actual
 *   node render.js week last        → semana pasada
 *   node render.js week 2026-W16    → semana concreta
 *   node render.js day              → hoy
 *   node render.js day yesterday    → ayer
 *   node render.js day 2026-04-16   → día concreto
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const DATA_DIR = path.join(HOME, '.nextgenai-productivity');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const TEMPLATE_PATH = path.resolve(__dirname, '..', 'templates', 'report.html');
const AGGREGATE_PATH = path.resolve(__dirname, 'aggregate.js');
const INSIGHTS_PATH = path.resolve(__dirname, 'insights.js');
const METRICS_DIR = path.join(DATA_DIR, 'metrics');

function parseArgs(argv) {
  const args = { mode: argv[0] || 'week', arg: '', cwd: process.cwd() };
  // primer positional no-flag tras mode = arg
  let seenPositional = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd' && argv[i + 1]) { args.cwd = argv[i + 1]; i++; continue; }
    if (a.startsWith('--')) continue;
    if (seenPositional === 0) { args.mode = a; seenPositional++; continue; }
    if (seenPositional === 1) { args.arg = a; seenPositional++; continue; }
  }
  return args;
}

function main() {
  const { mode, arg, cwd } = parseArgs(process.argv.slice(2));

  // 1. Ejecutar aggregate
  let raw;
  try {
    raw = execFileSync('node', [AGGREGATE_PATH, mode, arg].filter(Boolean), {
      encoding: 'utf8'
    });
  } catch (e) {
    console.error('Error ejecutando aggregate:', e.message);
    process.exit(1);
  }

  let data;
  try { data = JSON.parse(raw); }
  catch (e) {
    console.error('Aggregate devolvió JSON inválido:', e.message);
    process.exit(1);
  }

  // 2. Ejecutar insights con el metrics file que aggregate acaba de escribir
  let insights = { cards: [], derived: null, goals: null };
  try {
    const metricsFile = mode === 'week'
      ? path.join(METRICS_DIR, `${data.period}.json`)
      : path.join(METRICS_DIR, `day-${data.period}.json`);
    if (fs.existsSync(metricsFile) && mode === 'week') {
      const raw2 = execFileSync('node', [INSIGHTS_PATH, metricsFile, '--cwd', cwd], {
        encoding: 'utf8'
      });
      insights = JSON.parse(raw2);
    }
  } catch (e) {
    if (process.env.NEXTGENAI_DEBUG) console.error('[insights]', e.message);
  }

  // 3. Leer plantilla
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // 4. Sustituciones
  const periodLabel = data.period;
  const modeLabel = data.mode === 'week' ? 'Informe semanal' : 'Informe diario';
  const title = `${modeLabel} · ${periodLabel}`;
  const generatedAt = new Date(data.generated_at).toLocaleString('es-ES', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  // Escapar </script> dentro del JSON para no romper el <script type="application/json">
  const dataJson = JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>');
  const insightsJson = JSON.stringify(insights).replace(/<\/script>/gi, '<\\/script>');

  const html = template
    .replace(/__TITLE__/g, title)
    .replace(/__PERIOD_LABEL__/g, periodLabel)
    .replace(/__MODE_LABEL__/g, modeLabel)
    .replace(/__GENERATED_AT__/g, generatedAt)
    .replace(/__DATA_JSON__/g, dataJson)
    .replace(/__INSIGHTS_JSON__/g, insightsJson);

  // 4. Escribir output
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const filename = data.mode === 'week'
    ? `${data.period}.html`
    : `day-${data.period}.html`;
  const outPath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(outPath, html, 'utf8');

  // 5. Mensaje al usuario
  console.log('');
  console.log('  ✓ Informe generado');
  console.log(`    ${outPath}`);
  console.log('');
  console.log(`  Periodo: ${periodLabel}`);
  console.log(`  Sesiones: ${data.sessions.length}`);
  console.log(`  Días con actividad: ${data.days.length}`);
  console.log(`  Eventos procesados: ${data.raw_event_count}`);
  console.log('');
  console.log('  Ábrelo con doble clic o desde el navegador:');
  console.log(`    file://${outPath.replace(/\\/g, '/')}`);
}

if (require.main === module) main();
