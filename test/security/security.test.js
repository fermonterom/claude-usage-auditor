/**
 * Security tests
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TRACKER = path.join(ROOT, 'hooks', 'tracker.js');
const SESSION_HOOK = path.join(ROOT, 'hooks', 'session-start.js');
const INSTALL = path.join(ROOT, 'lib', 'install.js');
const INSIGHTS = require(path.join(ROOT, 'lib', 'insights.js'));

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ngai-sec-')); }

function run(script, args, stdin, tmpHome) {
  return spawnSync('node', [script, ...(args || [])], {
    input: stdin,
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    encoding: 'utf8',
    timeout: 8000
  });
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function readDayRaw(tmp, sid='sec1') {
  const day = todayUtc();
  const f = path.join(tmp, '.nextgenai-productivity', 'events', day, `${sid}.jsonl`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}

suite('[security] privacy · no leaks de contenido', () => {
  test('tool_input con API key NO aparece en event.jsonl', () => {
    const tmp = mkTmp();
    const apiKey = 'sk-ant-api03-FAKE-KEY-DO-NOT-LEAK-ZZZZ';
    run(TRACKER, ['pre-tool-use'], JSON.stringify({
      session_id: 'sec1', cwd: '/p', tool_name: 'Bash',
      tool_input: { command: `curl -H "x-api-key: ${apiKey}" https://example.com` }
    }), tmp);
    const raw = readDayRaw(tmp, 'sec1');
    assert(!raw.includes(apiKey), 'API key NO debe aparecer');
    assert(!raw.includes('curl'), 'comando curl NO debe aparecer');
  });

  test('tool_response con tokens/emails/paths sensibles NO aparece', () => {
    const tmp = mkTmp();
    const leaks = ['alice@empresa.com', '/Users/alice/.ssh/id_rsa', 'eyJhbGciOiJIUzI1NiJ9'];
    run(TRACKER, ['post-tool-use'], JSON.stringify({
      session_id: 'sec2', cwd: '/p', tool_name: 'Read',
      tool_response: { content: leaks.join(' · '), is_error: false }
    }), tmp);
    const raw = readDayRaw(tmp, 'sec2');
    for (const leak of leaks) assert(!raw.includes(leak), `'${leak}' NO debe aparecer`);
  });

  test('whitelist de campos persistidos en tool_start', () => {
    const tmp = mkTmp();
    run(TRACKER, ['pre-tool-use'], JSON.stringify({ session_id: 's', cwd: '/p', tool_name: 'X', tool_input: { some: 'data' } }), tmp);
    const raw = readDayRaw(tmp, 's');
    const ev = JSON.parse(raw.trim());
    const allowed = new Set(['v', 'ts', 'mode', 'session_id', 'cwd', 'type', 'tool', 'input_size', 'input_hash']);
    for (const k of Object.keys(ev)) assert(allowed.has(k), `campo inesperado en evento: ${k}`);
  });
});

suite('[security] path traversal · goals.yaml', () => {
  test('loadGoalsForCwd con ../../../etc/passwd no lee nada fuera', () => {
    const res = INSIGHTS.loadGoalsForCwd('/x/../../etc');
    assertEq(res, null);
  });
  test('cwd = null → null', () => assertEq(INSIGHTS.loadGoalsForCwd(null), null));
  test('cwd inexistente → null', () => assertEq(INSIGHTS.loadGoalsForCwd('/does/not/exist/anywhere/123xyz'), null));
});

suite('[security] yaml injection · parser limitado', () => {
  test('tags YAML peligrosos se tratan como texto literal', () => {
    const malicious = 'project: !!python/object/apply:os.system ["rm -rf /"]';
    const r = INSIGHTS.parseSimpleYaml(malicious);
    assertMatch(r.project, /python|object|apply|system/);
  });
  test('referencias & y * no se resuelven como anchors', () => {
    const text = 'foo: &anchor value\nbar: *anchor';
    const r = INSIGHTS.parseSimpleYaml(text);
    assert(typeof r.bar === 'string', 'no resuelve referencia');
  });
});

suite('[security] settings.json robustez', () => {
  test('install con settings.json corrupto aborta y no sobrescribe', () => {
    const tmp = mkTmp();
    const p = path.join(tmp, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{not valid json');
    const r = run(INSTALL, [], '', tmp);
    assert(r.status !== 0, 'install debe fallar con JSON inválido');
    const after = fs.readFileSync(p, 'utf8');
    assert(after.includes('{not valid json'));
  });
});

suite('[security] hooks nunca bloquean Claude Code', () => {
  test('tracker con payload 5MB no crashea ni bloquea', () => {
    const tmp = mkTmp();
    const huge = 'x'.repeat(5 * 1024 * 1024);
    const r = run(TRACKER, ['pre-tool-use'], JSON.stringify({ session_id: 'big', tool_name: 'Big', tool_input: { data: huge } }), tmp);
    assertEq(r.status, 0);
  });

  test('session-start con payload sin cwd → exit 0', () => {
    const tmp = mkTmp();
    const r = run(SESSION_HOOK, [], JSON.stringify({ session_id: 's' }), tmp);
    assertEq(r.status, 0);
  });
});

suite('[security] api-keys.yaml · solo si el usuario lo crea', () => {
  test('install creates data dir with restrictive permissions on POSIX', () => {
    const tmp = mkTmp();
    const r = run(INSTALL, [], '', tmp);
    assertEq(r.status, 0);
    if (process.platform !== 'win32') {
      const dir = path.join(tmp, '.nextgenai-productivity');
      const mode = fs.statSync(dir).mode & 0o777;
      assert((mode & 0o077) === 0, `mode too open: ${mode.toString(8)}`);
    }
  });

  test('install NO crea api-keys.yaml automáticamente', () => {
    const tmp = mkTmp();
    run(INSTALL, [], '', tmp);
    assert(!fs.existsSync(path.join(tmp, '.nextgenai-productivity', 'api-keys.yaml')),
      'api-keys.yaml nunca se crea por default');
  });
});
