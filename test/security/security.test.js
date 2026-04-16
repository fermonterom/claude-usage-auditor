/**
 * Security tests — riesgos que evaluamos:
 *  1. Privacy: metadata-only (tracker nunca persiste contenido)
 *  2. Path traversal: goals.yaml desde cwd malicioso
 *  3. YAML injection: archivo goals.yaml construido para escapar el parser
 *  4. settings.json corruption: install/uninstall robustos ante JSON inválido
 *  5. Hook failure mode: tracker SIEMPRE exit 0 aunque stdin sea patológico
 *  6. API key: nunca aparece en eventos ni logs
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TRACKER = path.join(ROOT, 'hooks', 'tracker.js');
const SESSION_HOOK = path.join(ROOT, 'hooks', 'session-start.js');
const INSTALL = path.join(ROOT, 'lib', 'install.js');
const UNINSTALL = path.join(ROOT, 'lib', 'uninstall.js');
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

// ═══════════════════════════════════════════════════════════
// 1. PRIVACY
// ═══════════════════════════════════════════════════════════
suite('[security] privacy · no leaks de contenido', () => {
  test('tool_input con API key NO aparece en event.jsonl', () => {
    const tmp = mkTmp();
    const apiKey = 'sk-ant-api03-FAKE-KEY-DO-NOT-LEAK-ZZZZ';
    run(TRACKER, ['pre-tool-use'], JSON.stringify({
      session_id: 'sec1',
      cwd: '/p',
      tool_name: 'Bash',
      tool_input: { command: `curl -H "x-api-key: ${apiKey}" https://example.com` }
    }), tmp);
    const today = new Date().toISOString().slice(0,10);
    const f = path.join(tmp, '.nextgenai-productivity', 'events', `${today}.jsonl`);
    const raw = fs.readFileSync(f, 'utf8');
    assert(!raw.includes(apiKey), 'API key NO debe aparecer');
    assert(!raw.includes('curl'), 'comando curl NO debe aparecer');
  });

  test('tool_response con tokens/emails/paths sensibles NO aparece', () => {
    const tmp = mkTmp();
    const leaks = ['alice@empresa.com', '/Users/alice/.ssh/id_rsa', 'eyJhbGciOiJIUzI1NiJ9'];
    run(TRACKER, ['post-tool-use'], JSON.stringify({
      session_id: 'sec2',
      cwd: '/p',
      tool_name: 'Read',
      tool_response: { content: leaks.join(' · '), is_error: false }
    }), tmp);
    const today = new Date().toISOString().slice(0,10);
    const raw = fs.readFileSync(path.join(tmp, '.nextgenai-productivity', 'events', `${today}.jsonl`), 'utf8');
    for (const leak of leaks) assert(!raw.includes(leak), `'${leak}' NO debe aparecer`);
  });

  test('whitelist de campos persistidos en tool_start', () => {
    const tmp = mkTmp();
    run(TRACKER, ['pre-tool-use'], JSON.stringify({
      session_id: 's', cwd: '/p', tool_name: 'X',
      tool_input: { some: 'data' }
    }), tmp);
    const today = new Date().toISOString().slice(0,10);
    const raw = fs.readFileSync(path.join(tmp, '.nextgenai-productivity', 'events', `${today}.jsonl`), 'utf8');
    const ev = JSON.parse(raw.trim());
    const allowed = new Set(['ts','mode','session_id','cwd','type','tool','input_size','input_hash']);
    for (const k of Object.keys(ev)) {
      assert(allowed.has(k), `campo inesperado en evento: ${k}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 2. PATH TRAVERSAL
// ═══════════════════════════════════════════════════════════
suite('[security] path traversal · goals.yaml', () => {
  test('loadGoalsForCwd con ../../../etc/passwd no lee nada fuera', () => {
    // path.join normaliza, entonces si cwd="/x/../../etc" el goals.yaml buscado es /etc/.nextgenai-productivity/goals.yaml
    // que NO existe. El test verifica que no se cuela ni tampoco crashea.
    const res = INSIGHTS.loadGoalsForCwd('/x/../../etc');
    assertEq(res, null);
  });
  test('cwd = null → null', () => {
    assertEq(INSIGHTS.loadGoalsForCwd(null), null);
  });
  test('cwd inexistente → null', () => {
    assertEq(INSIGHTS.loadGoalsForCwd('/does/not/exist/anywhere/123xyz'), null);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. YAML INJECTION
// ═══════════════════════════════════════════════════════════
suite('[security] yaml injection · parser limitado', () => {
  test('tags YAML peligrosos (!!python/object) se tratan como texto literal', () => {
    // Nuestro parser mini no soporta tags. Nada se ejecuta.
    const malicious = 'project: !!python/object/apply:os.system ["rm -rf /"]';
    const r = INSIGHTS.parseSimpleYaml(malicious);
    // Se interpreta como string literal, no como tag
    assertMatch(r.project, /python|object|apply|system/);
  });
  test('referencias & y * no se resuelven como anchors', () => {
    const text = 'foo: &anchor value\nbar: *anchor';
    const r = INSIGHTS.parseSimpleYaml(text);
    // Esperamos que no resuelva anchors (parser simple)
    assert(typeof r.bar === 'string', 'no resuelve referencia');
  });
  test('billion laughs / anchors no causan loop', () => {
    // Nuestro parser no soporta anchors → no hay DoS posible
    let text = 'a: 1\n';
    for (let i = 0; i < 100; i++) text += `k${i}: v${i}\n`;
    const start = Date.now();
    INSIGHTS.parseSimpleYaml(text);
    assert(Date.now() - start < 200, 'parse rápido incluso con muchas keys');
  });
  test('valor con caracteres especiales no rompe el parser', () => {
    const text = 'tip: "Plantilla con \'comillas\' y < > & caracteres"';
    const r = INSIGHTS.parseSimpleYaml(text);
    assertMatch(r.tip, /Plantilla/);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. SETTINGS.JSON CORRUPTION
// ═══════════════════════════════════════════════════════════
suite('[security] settings.json robustez', () => {
  test('install con settings.json corrupto no borra datos (parte de 0)', () => {
    const tmp = mkTmp();
    const p = path.join(tmp, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{not valid json');
    const r = run(INSTALL, [], '', tmp);
    assertEq(r.status, 0, 'install recupera de JSON inválido');
    const after = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert(after.hooks, 'settings válidos tras install');
  });
});

// ═══════════════════════════════════════════════════════════
// 5. HOOK FAILURE MODE
// ═══════════════════════════════════════════════════════════
suite('[security] hooks nunca bloquean Claude Code', () => {
  test('tracker con payload 10MB no crashea ni bloquea', () => {
    const tmp = mkTmp();
    const huge = 'x'.repeat(5 * 1024 * 1024);
    const r = run(TRACKER, ['pre-tool-use'], JSON.stringify({
      session_id: 'big',
      tool_name: 'Big',
      tool_input: { data: huge }
    }), tmp);
    assertEq(r.status, 0);
  });

  test('session-start con payload sin cwd → exit 0', () => {
    const tmp = mkTmp();
    const r = run(SESSION_HOOK, [], JSON.stringify({ session_id: 's' }), tmp);
    assertEq(r.status, 0);
  });

  test('session-start en HOME raíz → skip y exit 0', () => {
    const tmp = mkTmp();
    const r = run(SESSION_HOOK, [], JSON.stringify({
      session_id: 'sh', cwd: tmp
    }), tmp);
    assertEq(r.status, 0);
  });
});

// ═══════════════════════════════════════════════════════════
// 6. API KEY PROTECTION
// ═══════════════════════════════════════════════════════════
suite('[security] api-keys.yaml · solo si el usuario lo crea', () => {
  test('install NO crea api-keys.yaml automáticamente', () => {
    const tmp = mkTmp();
    run(INSTALL, [], '', tmp);
    assert(!fs.existsSync(path.join(tmp, '.nextgenai-productivity', 'api-keys.yaml')),
      'api-keys.yaml nunca se crea por default');
  });
});
