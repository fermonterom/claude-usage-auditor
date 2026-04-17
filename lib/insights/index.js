const fs = require('fs');
const path = require('path');
const { parseSimpleYaml, stripComment } = require('../utils/yaml');
const { computeDerivedMetrics } = require('./derived');
const { classifyMetric, applyCatalogRules } = require('./rules');
const { loadWeeklyHistory, applyHistoryTrends } = require('./history');

const CATALOG_PATH = path.join(__dirname, '..', 'insights-catalog.json');

function loadGoalsForCwd(cwd) {
  if (!cwd) return null;
  const goalsPath = path.resolve(cwd, '.nextgenai-productivity', 'goals.yaml');
  const rel = path.relative(path.resolve(cwd), goalsPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!fs.existsSync(goalsPath)) return null;
  try {
    return parseSimpleYaml(fs.readFileSync(goalsPath, 'utf8'));
  } catch {
    return null;
  }
}

function buildInsights(weekMetricsFull, options = {}) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const weekMetrics = (weekMetricsFull.weeks && weekMetricsFull.weeks[0]) || null;
  if (!weekMetrics) return { cards: [], derived: null, goals: null, history_weeks: 0 };

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

module.exports = {
  computeDerivedMetrics,
  classifyMetric,
  applyCatalogRules,
  loadWeeklyHistory,
  applyHistoryTrends,
  loadGoalsForCwd,
  parseSimpleYaml,
  stripComment,
  buildInsights
};
