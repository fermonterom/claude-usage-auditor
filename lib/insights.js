#!/usr/bin/env node
/**
 * NextGen AI Institute Productivity · insights
 *
 * Motor de insights (capas A + B):
 *   A) Catálogo determinista: reglas de insights-catalog.json aplicadas a métricas de la semana.
 *   B) Historia personal: comparación con mediana de las últimas 4 semanas del mismo usuario.
 *
 * Entrada: objeto metrics (output de aggregate.js con mode=week).
 * Salida: array de cards { id, label, state, value, message, tip, layer }.
 *
 * Uso CLI:
 *   node insights.js <metrics.json> [--cwd <projectPath>]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.nextgenai-productivity');
const METRICS_DIR = path.join(DATA_DIR, 'metrics');
const CATALOG_PATH = path.join(__dirname, 'insights-catalog.json');

// --- helpers de cómputo de métricas derivadas ---
function computeDerivedMetrics(weekMetrics, extras = {}) {
  const tool_calls = weekMetrics.tool_calls || 0;
  const retries = weekMetrics.retries || 0;
  const tool_errors = weekMetrics.tool_errors || 0;
  const sessions = weekMetrics.sessions || 0;
  const duration_sec = weekMetrics.duration_sec || 0;
  const days_active = weekMetrics.days || 0;
  const input_bytes = weekMetrics.input_bytes || 0;
  const output_bytes = weekMetrics.output_bytes || 0;
  const tools = weekMetrics.tools || {};
  const cwds = weekMetrics.cwds || {};

  const retry_ratio = tool_calls > 0 ? retries / tool_calls : 0;
  const error_rate = tool_calls > 0 ? tool_errors / tool_calls : 0;
  const avg_session_sec = sessions > 0 ? duration_sec / sessions : 0;
  const avg_session_min = avg_session_sec / 60;
  const focus_ratio = sessions > 0 ? Math.min(1, avg_session_sec / 3600) : 0;
  const tools_distinct = Object.keys(tools).length;
  const avg_input_kb = tool_calls > 0 ? (input_bytes / tool_calls) / 1024 : 0;
  const avg_output_kb = tool_calls > 0 ? (output_bytes / tool_calls) / 1024 : 0;

  const totalCwdCount = Object.values(cwds).reduce((a, b) => a + b, 0);
  const maxCwd = Object.values(cwds).reduce((m, v) => Math.max(m, v), 0);
  const project_concentration = totalCwdCount > 0 ? maxCwd / totalCwdCount : 0;

  // plan_mode_uses: no viene directo del tracker; extras permite inyectarlo
  const plan_mode_uses = extras.plan_mode_uses ?? (tools.EnterPlanMode || 0);

  return {
    tool_calls,
    retries,
    retry_ratio,
    tool_errors,
    error_rate,
    sessions,
    duration_sec,
    avg_session_sec,
    avg_session_min,
    focus_ratio,
    days_active,
    tools_distinct,
    input_bytes,
    output_bytes,
    avg_input_kb,
    avg_output_kb,
    project_concentration,
    plan_mode_uses
  };
}

// --- clasificación segun thresholds y direction ---
function classifyMetric(value, rule) {
  const { thresholds, direction } = rule;
  if (direction === 'lower_is_better') {
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.warn) return 'warn';
    return 'critical';
  }
  // higher_is_better
  if (value >= thresholds.good) return 'good';
  if (value >= thresholds.warn) return 'warn';
  return 'critical';
}

function formatValue(value, unit) {
  if (unit === 'ratio') return (value * 100).toFixed(1);
  if (unit === 'minutes') return value.toFixed(1);
  if (unit === 'kb') return value.toFixed(1);
  if (unit === 'count') return String(Math.round(value));
  return String(value);
}

function interpolate(template, context) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (key in context) return String(context[key]);
    return `{${key}}`;
  });
}

// --- capa A: catálogo ---
function applyCatalogRules(derived, catalog, goals = null) {
  const cards = [];
  for (const rule of catalog.rules) {
    const value = derived[rule.metric];
    if (value === undefined || value === null) continue;
    const state = classifyMetric(value, rule);
    const valueStr = formatValue(value, rule.unit);
    const valuePct = rule.unit === 'ratio' ? (value * 100).toFixed(1) : valueStr;
    const message = interpolate(rule.messages[state] || '', {
      value: valueStr,
      value_pct: valuePct
    });
    cards.push({
      id: rule.id,
      label: rule.label,
      layer: 'catalog',
      state,
      metric: rule.metric,
      value,
      value_display: valueStr + (rule.unit === 'ratio' ? '%' : ''),
      message,
      tip: rule.tip || null,
      direction: rule.direction,
      thresholds: rule.thresholds
    });
  }
  // filtra según goals: si hay goals.track, solo deja esos; si no, todos
  if (goals && Array.isArray(goals.track) && goals.track.length > 0) {
    const want = new Set(goals.track);
    return cards.filter(c => want.has(c.id));
  }
  return cards;
}

// --- capa B: comparación histórica ---
function loadWeeklyHistory(excludeWeek, limit = 4) {
  if (!fs.existsSync(METRICS_DIR)) return [];
  const files = fs.readdirSync(METRICS_DIR)
    .filter(f => /^\d{4}-W\d{2}\.json$/.test(f))
    .filter(f => f.replace('.json', '') !== excludeWeek)
    .sort()
    .reverse()
    .slice(0, limit);
  const history = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(METRICS_DIR, f), 'utf8'));
      const wk = (data.weeks && data.weeks[0]) || null;
      if (wk) history.push({ week: f.replace('.json', ''), metrics: wk });
    } catch { /* skip malformed */ }
  }
  return history;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function applyHistoryTrends(currentDerived, history, catalog) {
  const cards = [];
  if (!history.length) return cards;

  // tool_calls trend
  const tcHist = history.map(h => h.metrics.tool_calls || 0);
  const tcMedian = median(tcHist);
  if (tcMedian !== null && tcMedian > 0) {
    const delta = currentDerived.tool_calls - tcMedian;
    const deltaPct = (delta / tcMedian) * 100;
    const rule = catalog.history.find(h => h.id === 'history_trend_tool_calls');
    if (rule) {
      let state = 'stable';
      let key = 'stable';
      if (Math.abs(deltaPct) >= 25) {
        state = deltaPct > 0 ? 'up' : 'down';
        key = deltaPct > 0 ? 'up_significant' : 'down_significant';
      }
      const msg = interpolate(rule.messages[key] || rule.messages.stable, {
        delta_pct: deltaPct > 0 ? `+${deltaPct.toFixed(0)}` : deltaPct.toFixed(0)
      });
      cards.push({
        id: rule.id,
        label: rule.label,
        layer: 'history',
        state,
        value: delta,
        value_display: `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(0)}%`,
        message: msg,
        tip: null
      });
    }
  }

  // retry_ratio trend
  const rrHist = history
    .map(h => {
      const tc = h.metrics.tool_calls || 0;
      return tc > 0 ? (h.metrics.retries || 0) / tc : null;
    })
    .filter(v => v !== null);
  const rrMedian = median(rrHist);
  if (rrMedian !== null) {
    const rule = catalog.history.find(h => h.id === 'history_trend_retries');
    if (rule) {
      const before = rrMedian;
      const after = currentDerived.retry_ratio;
      const improved = after < before;
      const key = improved ? 'improved' : 'worsened';
      if (Math.abs(after - before) >= 0.03) {
        const msg = interpolate(rule.messages[key], {
          before_pct: (before * 100).toFixed(1),
          after_pct: (after * 100).toFixed(1)
        });
        cards.push({
          id: rule.id,
          label: rule.label,
          layer: 'history',
          state: improved ? 'good' : 'warn',
          value: after - before,
          value_display: `${after > before ? '+' : ''}${((after - before) * 100).toFixed(1)} pts`,
          message: msg,
          tip: null
        });
      }
    }
  }

  return cards;
}

// --- goals loader ---
function loadGoalsForCwd(cwd) {
  if (!cwd) return null;
  const goalsPath = path.join(cwd, '.nextgenai-productivity', 'goals.yaml');
  if (!fs.existsSync(goalsPath)) return null;
  try {
    return parseSimpleYaml(fs.readFileSync(goalsPath, 'utf8'));
  } catch {
    return null;
  }
}

// Mini parser YAML sin dependencias. Soporta:
//   key: value
//   key:
//     - item1
//     - item2
function parseSimpleYaml(text) {
  const lines = text.split(/\r?\n/);
  const result = {};
  let currentKey = null;
  let currentArr = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    const arrMatch = line.match(/^\s+-\s+(.*)$/);
    if (arrMatch && currentArr) {
      currentArr.push(coerce(arrMatch[1].trim()));
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === '' || value === '|' || value === '>') {
        result[key] = [];
        currentKey = key;
        currentArr = result[key];
      } else {
        result[key] = coerce(value);
        currentKey = key;
        currentArr = null;
      }
    }
  }

  return result;
}

function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  // strip comillas
  if (/^["'].*["']$/.test(value)) return value.slice(1, -1);
  return value;
}

// --- main orquestador ---
function buildInsights(weekMetricsFull, options = {}) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const weekMetrics = (weekMetricsFull.weeks && weekMetricsFull.weeks[0]) || null;
  if (!weekMetrics) {
    return { cards: [], derived: null, goals: null };
  }
  const derived = computeDerivedMetrics(weekMetrics, options.extras || {});
  const goals = options.goals || loadGoalsForCwd(options.cwd);
  const catalogCards = applyCatalogRules(derived, catalog, goals);
  const history = loadWeeklyHistory(weekMetricsFull.period);
  const historyCards = applyHistoryTrends(derived, history, catalog);

  return {
    cards: [...catalogCards, ...historyCards],
    derived,
    goals: goals || null,
    history_weeks: history.length
  };
}

// --- CLI ---
function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.error('Uso: node insights.js <metrics.json> [--cwd <path>]');
    process.exit(1);
  }
  const metricsPath = argv[0];
  let cwd = null;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--cwd' && argv[i + 1]) { cwd = argv[i + 1]; i++; }
  }
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  const out = buildInsights(metrics, { cwd });
  process.stdout.write(JSON.stringify(out, null, 2));
}

if (require.main === module) main();

module.exports = {
  computeDerivedMetrics,
  classifyMetric,
  applyCatalogRules,
  applyHistoryTrends,
  loadGoalsForCwd,
  parseSimpleYaml,
  loadWeeklyHistory,
  buildInsights
};
