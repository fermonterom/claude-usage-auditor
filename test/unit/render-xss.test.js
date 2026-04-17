const { renderHtml } = require('../../lib/render');

test('render escapes script-like payloads in insight cards', () => {
  const fakeData = {
    generated_at: new Date().toISOString(),
    period: '2026-W15',
    mode: 'week',
    raw_event_count: 10,
    sessions: [],
    days: [],
    weeks: [{ tools: {}, cwds: {}, tool_calls: 0, retries: 0, tool_errors: 0, duration_sec: 0, sessions: 0, days: 0 }]
  };
  const fakeInsights = {
    cards: [{
      id: 'TEST',
      state: 'warn',
      layer: 'catalog',
      label: 'Test',
      message: '<script>alert(1)</script>payload',
      tip: '<img src=x onerror=alert(1)>',
      value_display: '<svg onload=alert(1)>'
    }],
    goals: null,
    history_weeks: 0
  };
  const html = renderHtml(fakeData, fakeInsights);
  assert(!html.includes('<script>alert(1)</script>'), 'unescaped script tag');
  assert(!html.includes('<img src=x onerror=alert(1)>'), 'unescaped onerror tag');
  assert(!html.includes('<svg onload=alert(1)>'), 'unescaped onload tag');
  assertMatch(html, /\\u003cscript\\u003ealert\(1\)\\u003c\\\/script\\u003epayload/);
});
