function classifyMetric(value, rule) {
  const { thresholds, direction } = rule;
  if (direction === 'lower_is_better') {
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.warn) return 'warn';
    return 'critical';
  }
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

function applyCatalogRules(derived, catalog, goals = null) {
  const cards = [];
  for (const rule of catalog.rules) {
    const value = derived[rule.metric];
    if (value === undefined || value === null) continue;
    const state = classifyMetric(value, rule);
    const valueStr = formatValue(value, rule.unit);
    const valuePct = rule.unit === 'ratio' ? (value * 100).toFixed(1) : valueStr;

    cards.push({
      id: rule.id,
      label: rule.label,
      layer: 'catalog',
      state,
      metric: rule.metric,
      value,
      value_display: valueStr + (rule.unit === 'ratio' ? '%' : ''),
      message: interpolate(rule.messages[state] || '', { value: valueStr, value_pct: valuePct }),
      tip: rule.tip || null,
      direction: rule.direction,
      thresholds: rule.thresholds
    });
  }

  if (goals && Array.isArray(goals.track) && goals.track.length > 0) {
    const want = new Set(goals.track);
    return cards.filter((c) => want.has(c.id));
  }

  return cards;
}

module.exports = {
  classifyMetric,
  formatValue,
  interpolate,
  applyCatalogRules
};
