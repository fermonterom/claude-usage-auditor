/**
 * Unit tests — hooks/tracker.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const TRACKER = path.join(__dirname, '..', '..', 'hooks', 'tracker.js');

function runTracker(mode, payload, tmpHome) {
  return spawnSync('node', [TRACKER, mode], {
    input: JSON.stringify(payload),
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome, NEXTGENAI_DEBUG: '1' },
    encoding: 'utf8',
    timeout: 5000
  });
}

function makeTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ngai-test-tracker-'));
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function readEventsDay(tmpHome, date) {
  const out = [];
  const dayDir = path.join(tmpHome, '.nextgenai-productivity', 'events', date);
  if (!fs.existsSync(dayDir)) return out;
  for (const file of fs.readdirSync(dayDir)) {
    if (!file.endsWith('.jsonl')) continue;
    const rows = fs.readFileSync(path.join(dayDir, file), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    out.push(...rows);
  }
  return out;
}

suite('[unit] tracker · modo pre-tool-use', () => {
  test('genera evento tool_start con metadata básica', () => {
    const tmp = makeTmpHome();
    const res = runTracker('pre-tool-use', {
      session_id: 'abc',
      cwd: '/proj/x',
      tool_name: 'Read',
      tool_input: { file_path: '/secret.txt' }
    }, tmp);
    assertEq(res.status, 0, 'exit 0');
    const events = readEventsDay(tmp, todayUtc());
    assertEq(events.length, 1);
    assertEq(events[0].type, 'tool_start');
    assertEq(events[0].tool, 'Read');
    assertEq(events[0].session_id, 'abc');
    assertEq(events[0].v, 1);
    assert(events[0].input_size > 0, 'input_size calculado');
    assert(events[0].input_hash && events[0].input_hash.length > 0, 'hash presente');
  });

  test('NO guarda contenido de tool_input', () => {
    const tmp = makeTmpHome();
    const secret = 'SUPERSECRETO_NO_DEBE_APARECER';
    runTracker('pre-tool-use', {
      session_id: 's1',
      cwd: '/p',
      tool_name: 'Bash',
      tool_input: { command: `echo ${secret}` }
    }, tmp);
    const dayDir = path.join(tmp, '.nextgenai-productivity', 'events', todayUtc());
    const raw = fs.readFileSync(path.join(dayDir, 's1.jsonl'), 'utf8');
    assert(!raw.includes(secret), 'secreto NO debe aparecer en eventos');
    assert(!raw.includes('echo'), 'comando NO debe aparecer');
  });
});

suite('[unit] tracker · modo post-tool-use', () => {
  test('NO guarda contenido de tool_response', () => {
    const tmp = makeTmpHome();
    const secret = 'RESPONSE_SECRETO_XYZ';
    runTracker('post-tool-use', {
      session_id: 's2',
      cwd: '/p',
      tool_name: 'Read',
      tool_input: { file_path: 'x' },
      tool_response: { content: secret, is_error: false }
    }, tmp);
    const raw = fs.readFileSync(path.join(tmp, '.nextgenai-productivity', 'events', todayUtc(), 's2.jsonl'), 'utf8');
    assert(!raw.includes(secret), 'respuesta NO aparece');
  });

  test('is_error:true se registra como ok:false', () => {
    const tmp = makeTmpHome();
    runTracker('post-tool-use', {
      session_id: 's3',
      tool_name: 'Bash',
      tool_response: { is_error: true }
    }, tmp);
    const events = readEventsDay(tmp, todayUtc());
    assertEq(events[0].ok, false);
  });
});

suite('[unit] tracker · resiliencia', () => {
  test('stdin vacío no crashea, exit 0', () => {
    const tmp = makeTmpHome();
    const res = runTracker('pre-tool-use', null, tmp);
    assertEq(res.status, 0);
  });

  test('payload con JSON inválido no crashea', () => {
    const tmp = makeTmpHome();
    const res = spawnSync('node', [TRACKER, 'pre-tool-use'], {
      input: '{not-valid-json',
      env: { ...process.env, HOME: tmp, USERPROFILE: tmp },
      encoding: 'utf8',
      timeout: 5000
    });
    assertEq(res.status, 0, 'tracker nunca debe bloquear Claude');
  });

  test('modo desconocido no falla', () => {
    const tmp = makeTmpHome();
    const res = runTracker('unknown-mode', {}, tmp);
    assertEq(res.status, 0);
  });
});
