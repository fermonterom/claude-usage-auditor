/**
 * Unit tests — lib/insights.js
 */
const path = require('path');
const ins = require(path.join(__dirname, '..', '..', 'lib', 'insights.js'));

suite('[unit] insights · classifyMetric', () => {
  const lower = { direction: 'lower_is_better', thresholds: { good: 0.1, warn: 0.25, critical: 0.4 } };
  const higher = { direction: 'higher_is_better', thresholds: { good: 5, warn: 2, critical: 0 } };

  test('lower_is_better: 0.05 → good', () => {
    assertEq(ins.classifyMetric(0.05, lower), 'good');
  });
  test('lower_is_better: 0.20 → warn', () => {
    assertEq(ins.classifyMetric(0.20, lower), 'warn');
  });
  test('lower_is_better: 0.50 → critical', () => {
    assertEq(ins.classifyMetric(0.50, lower), 'critical');
  });
  test('higher_is_better: 6 → good', () => {
    assertEq(ins.classifyMetric(6, higher), 'good');
  });
  test('higher_is_better: 3 → warn', () => {
    assertEq(ins.classifyMetric(3, higher), 'warn');
  });
  test('higher_is_better: 0 → critical', () => {
    assertEq(ins.classifyMetric(0, higher), 'critical');
  });
});

suite('[unit] insights · computeDerivedMetrics', () => {
  test('metricas base con tool_calls=0 no divide por cero', () => {
    const d = ins.computeDerivedMetrics({ tool_calls: 0 });
    assertEq(d.retry_ratio, 0);
    assertEq(d.error_rate, 0);
    assertEq(d.avg_input_kb, 0);
  });

  test('retry_ratio y error_rate calculados', () => {
    const d = ins.computeDerivedMetrics({
      tool_calls: 100, retries: 10, tool_errors: 5,
      sessions: 4, duration_sec: 7200,
      days: 3, tools: { Read: 50, Edit: 30, Bash: 20 },
      cwds: { '/a': 60, '/b': 40 },
      input_bytes: 10240, output_bytes: 40960
    });
    assertEq(d.retry_ratio, 0.1);
    assertEq(d.error_rate, 0.05);
    assertEq(d.avg_session_min, 30);
    assertEq(d.tools_distinct, 3);
    assertEq(d.project_concentration, 0.6);
    assertEq(d.avg_input_kb, 0.1);
    assertEq(d.avg_output_kb, 0.4);
  });
});

suite('[unit] insights · applyCatalogRules', () => {
  const fs = require('fs');
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'insights-catalog.json'), 'utf8'));

  test('sin goals → devuelve todas las cards del catálogo', () => {
    const derived = ins.computeDerivedMetrics({
      tool_calls: 100, retries: 5, tool_errors: 2, sessions: 4,
      duration_sec: 7200, days: 3, tools: { A:20, B:30, C:50 }, cwds: { '/x': 100 },
      input_bytes: 1024, output_bytes: 2048
    });
    const cards = ins.applyCatalogRules(derived, catalog, null);
    // 10 reglas en el catálogo
    assertEq(cards.length, 10);
  });

  test('con goals.track → filtra solo las métricas listadas', () => {
    const derived = ins.computeDerivedMetrics({
      tool_calls: 100, retries: 5, tool_errors: 2, sessions: 4,
      duration_sec: 7200, days: 3, tools: { A:100 }, cwds: { '/x': 100 },
      input_bytes: 1024, output_bytes: 2048
    });
    const goals = { track: ['retry_ratio', 'active_days'] };
    const cards = ins.applyCatalogRules(derived, catalog, goals);
    assertEq(cards.length, 2);
    assert(cards.some(c => c.id === 'retry_ratio'));
    assert(cards.some(c => c.id === 'active_days'));
  });

  test('value_pct se interpola correctamente en mensaje', () => {
    const derived = ins.computeDerivedMetrics({
      tool_calls: 100, retries: 50, tool_errors: 0, sessions: 1,
      duration_sec: 60, days: 1, tools: {A:100}, cwds: {'/a':100},
      input_bytes: 0, output_bytes: 0
    });
    const cards = ins.applyCatalogRules(derived, catalog, { track: ['retry_ratio'] });
    assertEq(cards[0].state, 'critical');
    assertMatch(cards[0].message, /50\.0%/);
  });
});

suite('[unit] insights · parseSimpleYaml', () => {
  test('key:value simple', () => {
    const r = ins.parseSimpleYaml('project: "foo"\nobjective: bar');
    assertEq(r.project, 'foo');
    assertEq(r.objective, 'bar');
  });

  test('lista con guiones', () => {
    const r = ins.parseSimpleYaml('track:\n  - a\n  - b\n  - c');
    assertEq(r.track, ['a', 'b', 'c']);
  });

  test('booleanos y números', () => {
    const r = ins.parseSimpleYaml('enabled: true\nmax: 42\nratio: 0.5');
    assertEq(r.enabled, true);
    assertEq(r.max, 42);
    assertEq(r.ratio, 0.5);
  });

  test('ignora comentarios', () => {
    const r = ins.parseSimpleYaml('# esto es comentario\nkey: value # inline');
    assertEq(r.key, 'value');
  });

  test('goals.yaml típico completo', () => {
    const yaml = `project: "mock"
objective: "Feature nueva"
track:
  - retry_ratio
  - active_days
report_frequency: weekly`;
    const r = ins.parseSimpleYaml(yaml);
    assertEq(r.project, 'mock');
    assertEq(r.track.length, 2);
    assertEq(r.report_frequency, 'weekly');
  });
});
