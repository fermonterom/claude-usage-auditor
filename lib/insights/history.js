const fs = require('fs');
const path = require('path');
const { METRICS_DIR } = require('../config');
const { interpolate } = require('./rules');

function loadWeeklyHistory(excludeWeek, limit = 4) {
  if (!fs.existsSync(METRICS_DIR)) return [];

  const files = fs.readdirSync(METRICS_DIR)
    .filter((f) => /^\d{4}-W\d{2}\.json$/.test(f))
    .filter((f) => f.replace('.json', '') !== excludeWeek)
    .sort()
    .reverse()
    .slice(0, limit);

  const history = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(METRICS_DIR, f), 'utf8'));
      const wk = (data.weeks && data.weeks[0]) || null;
      if (wk) history.push({ week: f.replace('.json', ''), metrics: wk });
    } catch {
      // skip malformed history
    }
  }

  return history;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function applyHistoryTrends(currentDerived, history, catalog) {
  const cards = [];
  if (!history.length) return cards;

  const tcHist = history.map((h) => h.metrics.tool_calls || 0);
  const tcMedian = median(tcHist);
  if (tcMedian !== null && tcMedian > 0) {
    const deltaPct = ((currentDerived.tool_calls - tcMedian) / tcMedian) * 100;
    const rule = catalog.history.find((h) => h.id === 'history_trend_tool_calls');
    if (rule) {
      let state = 'stable';
      let key = 'stable';
      if (Math.abs(deltaPct) >= 25) {
        state = deltaPct > 0 ? 'up' : 'down';
        key = deltaPct > 0 ? 'up_significant' : 'down_significant';
      }
      cards.push({
        id: rule.id,
        label: rule.label,
        layer: 'history',
        state,
        value: deltaPct,
        value_display: `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(0)}%`,
        message: interpolate(rule.messages[key] || rule.messages.stable, {
          delta_pct: deltaPct > 0 ? `+${deltaPct.toFixed(0)}` : deltaPct.toFixed(0)
        }),
        tip: null
      });
    }
  }

  const rrHist = history
    .map((h) => {
      const tc = h.metrics.tool_calls || 0;
      return tc > 0 ? (h.metrics.retries || 0) / tc : null;
    })
    .filter((v) => v !== null);

  const rrMedian = median(rrHist);
  if (rrMedian !== null) {
    const rule = catalog.history.find((h) => h.id === 'history_trend_retries');
    if (rule) {
      const after = currentDerived.retry_ratio;
      const before = rrMedian;
      if (Math.abs(after - before) >= 0.03) {
        const improved = after < before;
        const key = improved ? 'improved' : 'worsened';
        cards.push({
          id: rule.id,
          label: rule.label,
          layer: 'history',
          state: improved ? 'good' : 'warn',
          value: after - before,
          value_display: `${after > before ? '+' : ''}${((after - before) * 100).toFixed(1)} pts`,
          message: interpolate(rule.messages[key], {
            before_pct: (before * 100).toFixed(1),
            after_pct: (after * 100).toFixed(1)
          }),
          tip: null
        });
      }
    }
  }

  return cards;
}

module.exports = {
  loadWeeklyHistory,
  median,
  applyHistoryTrends
};
