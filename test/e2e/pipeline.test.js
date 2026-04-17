/**
 * E2E test — pipeline completo
 *
 * Simula un usuario real:
 *   1. install → crea hooks y data dir
 *   2. 10 llamadas al tracker (pre + post) con sesiones y proyectos distintos
 *   3. aggregate week → genera metrics JSON
 *   4. insights con goals.yaml → genera cards filtradas
 *   5. render → genera HTML autocontenido
 *   6. verifica HTML tiene KPIs + insights + tabla sesiones
 *   7. uninstall --purge → sistema limpio
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TRACKER = path.join(ROOT, 'hooks', 'tracker.js');
const INSTALL = path.join(ROOT, 'lib', 'install.js');
const UNINSTALL = path.join(ROOT, 'lib', 'uninstall.js');
const AGGREGATE = path.join(ROOT, 'lib', 'aggregate.js');
const INSIGHTS = path.join(ROOT, 'lib', 'insights.js');
const RENDER = path.join(ROOT, 'lib', 'render.js');

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ngai-e2e-')); }

function nodeRun(script, args, stdin, env) {
  return spawnSync('node', [script, ...(args || [])], {
    input: stdin,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 15000
  });
}

function emit(sessionId, cwd, tool, inputSize, hash, ok, env) {
  nodeRun(TRACKER, ['pre-tool-use'], JSON.stringify({
    session_id: sessionId, cwd, tool_name: tool,
    tool_input: { data: 'x'.repeat(inputSize) }
  }), env);
  nodeRun(TRACKER, ['post-tool-use'], JSON.stringify({
    session_id: sessionId, cwd, tool_name: tool,
    tool_input: { data: 'x'.repeat(inputSize) },
    tool_response: { is_error: !ok }
  }), env);
}

suite('[e2e] pipeline completo', () => {
  const tmp = mkTmp();
  const env = { HOME: tmp, USERPROFILE: tmp };
  const projectDir = path.join(tmp, 'my-project');
  let todayDate;
  let weekLabel;

  test('1. install inicializa hooks y data dir', () => {
    const r = nodeRun(INSTALL, [], '', env);
    assertEq(r.status, 0, r.stderr);
    assert(fs.existsSync(path.join(tmp, '.nextgenai-productivity', 'events')));
    assert(fs.existsSync(path.join(tmp, '.claude', 'settings.json')));
  });

  test('2. emitir 10 eventos (2 sesiones, 2 proyectos)', () => {
    fs.mkdirSync(projectDir, { recursive: true });
    // sesión 1, proyecto A, 6 llamadas
    for (let i = 0; i < 6; i++) emit('s1', projectDir, 'Read', 200 + i, null, true, env);
    // sesión 2, proyecto B, 4 llamadas (una con error)
    for (let i = 0; i < 3; i++) emit('s2', '/proj/b', 'Edit', 100, null, true, env);
    emit('s2', '/proj/b', 'Bash', 100, null, false, env);

    const d = new Date();
    todayDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayDir = path.join(tmp, '.nextgenai-productivity', 'events', todayDate);
    let lines = 0;
    for (const f of fs.readdirSync(dayDir)) {
      if (!f.endsWith('.jsonl')) continue;
      lines += fs.readFileSync(path.join(dayDir, f), 'utf8').split(/\r?\n/).filter(Boolean).length;
    }
    assertEq(lines, 20); // 10 pre + 10 post
  });

  test('3. aggregate week produce metrics válidos', () => {
    // computar semana ISO del día actual
    const d = new Date();
    const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    weekLabel = `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

    const r = nodeRun(AGGREGATE, ['week', weekLabel], '', env);
    assertEq(r.status, 0, r.stderr);
    const data = JSON.parse(r.stdout);
    assertEq(data.mode, 'week');
    assert(data.sessions.length >= 2);
    const week = data.weeks[0];
    assert(week.tool_calls >= 10);
    assert(week.tool_errors >= 1);
    assert(Object.keys(week.cwds).length >= 2);
  });

  test('4. insights con goals.yaml filtra correctamente', () => {
    const goalsDir = path.join(projectDir, '.nextgenai-productivity');
    fs.mkdirSync(goalsDir, { recursive: true });
    fs.writeFileSync(path.join(goalsDir, 'goals.yaml'),
      `project: my-project\nobjective: Feature nueva\ntrack:\n  - retry_ratio\n  - error_rate\n  - active_days\n`);

    const metricsFile = path.join(tmp, '.nextgenai-productivity', 'metrics', `${weekLabel}.json`);
    const r = nodeRun(INSIGHTS, [metricsFile, '--cwd', projectDir], '', env);
    assertEq(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assertEq(out.cards.length, 3, 'filtrado por track');
    assertEq(out.goals.objective, 'Feature nueva');
    assertEq(out.goals.track.length, 3);
  });

  test('5. render produce HTML autocontenido con KPIs + insights', () => {
    const r = nodeRun(RENDER, ['week', weekLabel, '--cwd', projectDir], '', env);
    assertEq(r.status, 0, r.stderr);
    const htmlPath = path.join(tmp, '.nextgenai-productivity', 'reports', `${weekLabel}.html`);
    assert(fs.existsSync(htmlPath));
    const html = fs.readFileSync(htmlPath, 'utf8');
    // KPIs
    assertMatch(html, /TIEMPO TOTAL|Tiempo total/);
    assertMatch(html, /TOOL CALLS|Tool calls/);
    // insights section
    assertMatch(html, /Insights de uso|INSIGHTS DE USO/i);
    // goals pill (con el objetivo del goals.yaml)
    assertMatch(html, /Feature nueva/);
    // sin placeholders sin reemplazar
    assert(!html.includes('__TITLE__'));
    assert(!html.includes('__DATA_JSON__'));
  });

  test('6. uninstall --purge deja sistema limpio', () => {
    const r = nodeRun(UNINSTALL, ['--purge'], '', env);
    assertEq(r.status, 0, r.stderr);
    assert(!fs.existsSync(path.join(tmp, '.nextgenai-productivity')));
    const settings = JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.json'), 'utf8'));
    if (settings.hooks) {
      for (const arr of Object.values(settings.hooks)) {
        for (const e of arr) {
          if (e.hooks) for (const h of e.hooks) {
            assert(!h.command.includes('nextgenai-productivity'));
          }
        }
      }
    }
  });
});
