/**
 * Unit tests — lib/aggregate.js
 */
const path = require('path');
const agg = require(path.join(__dirname, '..', '..', 'lib', 'aggregate.js'));

suite('[unit] aggregate · isoWeekOf', () => {
  test('jueves de la primera semana del año', () => {
    // 2026-01-01 es jueves → W01
    assertEq(agg.isoWeekOf(new Date('2026-01-01T12:00:00Z')), '2026-W01');
  });
  test('lunes de W16 2026 (2026-04-13)', () => {
    assertEq(agg.isoWeekOf(new Date('2026-04-13T10:00:00Z')), '2026-W16');
  });
  test('domingo final de W16 (2026-04-19)', () => {
    assertEq(agg.isoWeekOf(new Date('2026-04-19T23:00:00Z')), '2026-W16');
  });
  test('2021-01-01 fue viernes → W53 del 2020', () => {
    assertEq(agg.isoWeekOf(new Date('2021-01-01T10:00:00Z')), '2020-W53');
  });
});

suite('[unit] aggregate · weekRange', () => {
  test('2026-W16 rango lunes-domingo UTC', () => {
    const [start, end] = agg.weekRange('2026-W16');
    assertEq(start.toISOString().slice(0,10), '2026-04-13');
    assertEq(end.toISOString().slice(0,10), '2026-04-19');
  });
  test('weekRange formato inválido lanza', () => {
    assertThrows(() => agg.weekRange('bad'));
  });
});

suite('[unit] aggregate · aggregateBySession', () => {
  test('sesión vacía → sin sesiones', () => {
    const sessions = agg.aggregateBySession([]);
    assertEq(sessions.length, 0);
  });

  test('un tool_start + tool_end → 1 sesión con 1 call', () => {
    const evts = [
      { ts: '2026-04-16T10:00:00Z', session_id: 's1', type: 'tool_start', tool: 'Read', input_size: 100, input_hash: 'aaa', cwd: '/p1' },
      { ts: '2026-04-16T10:00:05Z', session_id: 's1', type: 'tool_end', tool: 'Read', output_size: 500, input_hash: 'aaa', ok: true }
    ];
    const s = agg.aggregateBySession(evts);
    assertEq(s.length, 1);
    assertEq(s[0].tool_calls, 1);
    assertEq(s[0].tools.Read, 1);
    assertEq(s[0].input_bytes, 100);
    assertEq(s[0].output_bytes, 500);
    assertEq(s[0].retries, 0);
    assertEq(s[0].tool_errors, 0);
  });

  test('retry: mismo hash en <60s cuenta como retry', () => {
    const evts = [
      { ts: '2026-04-16T10:00:00Z', session_id: 's1', type: 'tool_start', tool: 'Bash', input_hash: 'h1' },
      { ts: '2026-04-16T10:00:10Z', session_id: 's1', type: 'tool_start', tool: 'Bash', input_hash: 'h1' }
    ];
    const s = agg.aggregateBySession(evts);
    assertEq(s[0].retries, 1);
  });

  test('mismo hash en >60s NO cuenta como retry', () => {
    const evts = [
      { ts: '2026-04-16T10:00:00Z', session_id: 's1', type: 'tool_start', tool: 'Bash', input_hash: 'h1' },
      { ts: '2026-04-16T10:02:00Z', session_id: 's1', type: 'tool_start', tool: 'Bash', input_hash: 'h1' }
    ];
    const s = agg.aggregateBySession(evts);
    assertEq(s[0].retries, 0);
  });

  test('tool_end con ok:false cuenta como error', () => {
    const evts = [
      { ts: '2026-04-16T10:00:00Z', session_id: 's1', type: 'tool_start', tool: 'Bash' },
      { ts: '2026-04-16T10:00:02Z', session_id: 's1', type: 'tool_end', tool: 'Bash', ok: false }
    ];
    const s = agg.aggregateBySession(evts);
    assertEq(s[0].tool_errors, 1);
  });

  test('duración calculada de start_ts a end_ts', () => {
    const evts = [
      { ts: '2026-04-16T10:00:00Z', session_id: 's1', type: 'tool_start', tool: 'Read' },
      { ts: '2026-04-16T10:10:00Z', session_id: 's1', type: 'tool_end', tool: 'Read', ok: true }
    ];
    const s = agg.aggregateBySession(evts);
    assertEq(s[0].duration_sec, 600);
  });

  test('eventos sin session_id se ignoran', () => {
    const evts = [
      { ts: '2026-04-16T10:00:00Z', type: 'tool_start', tool: 'Read' },
      { ts: '2026-04-16T10:00:05Z', session_id: 's1', type: 'tool_start', tool: 'Edit' }
    ];
    const s = agg.aggregateBySession(evts);
    assertEq(s.length, 1);
    assertEq(s[0].session_id, 's1');
  });
});

suite('[unit] aggregate · aggregateByDay/Week', () => {
  test('dos sesiones mismo día se agregan en un day', () => {
    const sessions = [
      { date: '2026-04-16', session_id: 's1', tool_calls: 5, tool_errors: 0, retries: 1, duration_sec: 300, tools: { Read: 5 }, cwds: { '/p1': 5 }, input_bytes: 100, output_bytes: 200 },
      { date: '2026-04-16', session_id: 's2', tool_calls: 3, tool_errors: 1, retries: 0, duration_sec: 120, tools: { Edit: 3 }, cwds: { '/p2': 3 }, input_bytes: 50, output_bytes: 100 }
    ];
    const days = agg.aggregateByDay(sessions);
    assertEq(days.length, 1);
    assertEq(days[0].tool_calls, 8);
    assertEq(days[0].sessions, 2);
    assertEq(days[0].tools.Read, 5);
    assertEq(days[0].tools.Edit, 3);
  });

  test('week agrega días', () => {
    const days = [
      { date: '2026-04-13', sessions: 1, tool_calls: 10, tool_errors: 0, retries: 0, duration_sec: 600, tools: {}, cwds: {}, input_bytes: 0, output_bytes: 0 },
      { date: '2026-04-15', sessions: 1, tool_calls: 5, tool_errors: 0, retries: 0, duration_sec: 300, tools: {}, cwds: {}, input_bytes: 0, output_bytes: 0 }
    ];
    const weeks = agg.aggregateByWeek(days);
    assertEq(weeks.length, 1);
    assertEq(weeks[0].week, '2026-W16');
    assertEq(weeks[0].tool_calls, 15);
    assertEq(weeks[0].days, 2);
  });
});


suite('[unit] aggregate · hardening/migration', () => {
  test('safeKey blocks forbidden prototype keys', () => {
    assertEq(agg.safeKey('__proto__'), null);
    assertEq(agg.safeKey('constructor'), null);
    assertEq(agg.safeKey('prototype'), null);
    assertEq(agg.safeKey('Read'), 'Read');
  });

  test('normalizeEvent migrates legacy v0 events to v1', () => {
    const normalized = agg.normalizeEvent({ type: 'tool_start', session_id: 'x', ts: '2026-01-01T00:00:00Z' });
    assertEq(normalized.v, 1);
    assertEq(normalized.mode, 'pre-tool-use');
  });

  test('aggregateBySession ignores forbidden keys from events', () => {
    const sessions = agg.aggregateBySession([
      { v: 1, ts: '2026-04-16T10:00:00Z', session_id: 's1', type: 'tool_start', tool: '__proto__', cwd: '/p1', input_hash: 'x' },
      { v: 1, ts: '2026-04-16T10:00:03Z', session_id: 's1', type: 'tool_start', tool: 'Read', cwd: '__proto__', input_hash: 'y' }
    ]);
    const s = sessions[0];
    assertEq(s.tools.Read, 1);
    assertEq(Object.prototype.hasOwnProperty.call(s.tools, '__proto__'), false);
    assertEq(Object.prototype.hasOwnProperty.call(s.cwds, '__proto__'), false);
  });
});
