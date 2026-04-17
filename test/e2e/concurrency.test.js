const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const TRACKER = path.join(__dirname, '..', '..', 'hooks', 'tracker.js');

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ngai-concurrency-')); }

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

suite('[e2e] concurrent tracker stress', () => {
  test('3 sessions x 20 events of 5KB keep all 60 JSONL lines', () => {
    const tmp = mkTmp();

    const orchestrator = `
const { spawn } = require('child_process');
const tracker = process.argv[1];

function spawnTracker(sessionId) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      session_id: sessionId,
      cwd: '/stress',
      tool_name: 'Read',
      tool_input: { data: 'x'.repeat(5 * 1024) }
    });
    const p = spawn('node', [tracker, 'pre-tool-use'], { env: process.env, stdio: ['pipe', 'ignore', 'ignore'] });
    p.stdin.write(payload);
    p.stdin.end();
    p.on('close', (code) => resolve(code));
  });
}

async function runSession(sessionId) {
  const tasks = [];
  for (let i = 0; i < 20; i++) tasks.push(spawnTracker(sessionId));
  const codes = await Promise.all(tasks);
  if (codes.some((c) => c !== 0)) throw new Error('worker failed');
}

(async () => {
  await Promise.all([runSession('c1'), runSession('c2'), runSession('c3')]);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
`;

    const r = spawnSync('node', ['-e', orchestrator, TRACKER], {
      env: { ...process.env, HOME: tmp, USERPROFILE: tmp },
      encoding: 'utf8',
      timeout: 30000
    });
    assertEq(r.status, 0, r.stderr);

    const dayDir = path.join(tmp, '.nextgenai-productivity', 'events', todayLocal());
    let lines = 0;
    for (const file of fs.readdirSync(dayDir)) {
      if (!file.endsWith('.jsonl')) continue;
      lines += fs.readFileSync(path.join(dayDir, file), 'utf8').split(/\r?\n/).filter(Boolean).length;
    }
    assertEq(lines, 60);
  });
});
