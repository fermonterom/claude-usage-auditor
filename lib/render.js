#!/usr/bin/env node
/**
 * claude-usage-auditor · render
 */

const fs = require('fs');
const path = require('path');
const { REPORTS_DIR, METRICS_DIR, ERRORS_FILE, VERSION } = require('./config');
const { ensureDir } = require('./utils/fs-utils');
const { buildAggregate } = require('./aggregate');
const { buildInsights } = require('./insights');
const { generateLlmInsights } = require('./llm-insights');

const TEMPLATE_PATH = path.resolve(__dirname, '..', 'templates', 'report.html');

function parseArgs(argv) {
  const args = { mode: argv[0] || 'week', arg: '', cwd: process.cwd() };
  let seenPositional = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd' && argv[i + 1]) {
      args.cwd = argv[i + 1];
      i += 1;
      continue;
    }
    if (a.startsWith('--')) continue;
    if (seenPositional === 0) {
      args.mode = a;
      seenPositional += 1;
      continue;
    }
    if (seenPositional === 1) {
      args.arg = a;
      seenPositional += 1;
      continue;
    }
  }
  return args;
}


function readRecentErrors(days = 7) {
  if (!fs.existsSync(ERRORS_FILE)) return [];
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return fs.readFileSync(ERRORS_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean)
    .filter((e) => new Date(e.ts).getTime() >= cutoff);
}

function renderHtml(data, insights) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const periodLabel = data.period;
  const modeLabel = data.mode === 'week' ? 'Informe semanal' : 'Informe diario';
  const title = `${modeLabel} · ${periodLabel}`;
  const generatedAt = new Date(data.generated_at).toLocaleString('es-ES', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  const sanitizeJson = (value) => JSON.stringify(value)
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  const dataJson = sanitizeJson(data);
  const insightsJson = sanitizeJson(insights || data.insights || { cards: [] });

  return template
    .replace(/__TITLE__/g, title)
    .replace(/__PERIOD_LABEL__/g, periodLabel)
    .replace(/__MODE_LABEL__/g, modeLabel)
    .replace(/__GENERATED_AT__/g, generatedAt)
    .replace(/__VERSION__/g, VERSION)
    .replace(/__DATA_JSON__/g, dataJson)
    .replace(/__INSIGHTS_JSON__/g, insightsJson);
}

async function main() {
  const { mode, arg, cwd } = parseArgs(process.argv.slice(2));

  let data;
  try {
    data = await buildAggregate(mode, arg);
  } catch (e) {
    console.error(`Error running aggregate: ${e.message}`);
    process.exit(1);
  }

  let insights = { cards: [], derived: null, goals: null, history_weeks: 0 };
  if (mode === 'week') {
    try {
      insights = buildInsights(data, { cwd });
      const llm = await generateLlmInsights(insights, data.period);
      if (llm && llm.enabled && Array.isArray(llm.cards) && llm.cards.length > 0) {
        insights.cards = [...insights.cards, ...llm.cards];
      }
      if (llm && llm.enabled && llm.error) {
        insights.cards = [{
          id: 'llm_unavailable',
          label: 'LLM no disponible',
          layer: 'llm',
          state: 'warn',
          value_display: null,
          message: 'No se pudieron generar insights LLM esta semana. Revisa errors.jsonl.',
          tip: null
        }, ...insights.cards];
      }
    } catch (e) {
      console.error(`[insights] ${e.message}`);
    }
  }

  const recentErrors = readRecentErrors(7);
  if (recentErrors.length > 0) {
    const last = recentErrors[recentErrors.length - 1];
    insights.cards = [{
      id: 'runtime_errors_recent',
      label: 'Errores recientes del tracker',
      layer: 'history',
      state: 'warn',
      value_display: String(recentErrors.length),
      message: `Se registraron ${recentErrors.length} errores en los ultimos 7 dias. Ultimo: ${last.stage || 'unknown'} — ${last.message || 'unknown'}.`,
      tip: 'Ejecuta /productivity-status para diagnosticar y revisar errors.jsonl.'
    }, ...(insights.cards || [])];
  }

  const html = renderHtml(data, insights);

  ensureDir(REPORTS_DIR, 0o700);
  const filename = data.mode === 'week' ? `${data.period}.html` : `day-${data.period}.html`;
  const outPath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(outPath, html, 'utf8');

  console.log('');
  console.log('  ✓ Report generated');
  console.log(`    ${outPath}`);
  console.log('');
  console.log(`  Period: ${data.period}`);
  console.log(`  Sessions: ${data.sessions.length}`);
  console.log(`  Active days: ${data.days.length}`);
  console.log(`  Processed events: ${data.raw_event_count}`);
  console.log('');
  console.log(`  Open in browser: file://${outPath.replace(/\\/g, '/')}`);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, renderHtml };
