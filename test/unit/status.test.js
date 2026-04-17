const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const STATUS = path.join(__dirname, '..', '..', 'lib', 'status.js');

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ngai-status-')); }
function run(tmpHome) {
  return spawnSync('node', [STATUS], {
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    encoding: 'utf8'
  });
}

function ensureDataDir(tmp) {
  const dataDir = path.join(tmp, '.nextgenai-productivity');
  fs.mkdirSync(path.join(dataDir, 'events'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ installed_at: '2026-01-01T00:00:00.000Z' }, null, 2));
  return dataDir;
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

suite('[unit] status', () => {
  test('1) zero events returns events_today=0 and no latest report', () => {
    const tmp = mkTmp();
    ensureDataDir(tmp);
    const r = run(tmp);
    assertEq(r.status, 0);
    assertMatch(r.stdout, /Events today: 0/);
    assertMatch(r.stdout, /Latest report: —/);
  });

  test('2) valid JSONL lines are counted correctly', () => {
    const tmp = mkTmp();
    ensureDataDir(tmp);
    const dayDir = path.join(tmp, '.nextgenai-productivity', 'events', todayLocal());
    fs.mkdirSync(dayDir, { recursive: true });
    fs.writeFileSync(path.join(dayDir, 's1.jsonl'), '{"a":1}\n{"a":2}\n{"a":3}\n');
    const r = run(tmp);
    assertEq(r.status, 0);
    assertMatch(r.stdout, /Events today: 3/);
  });

  test('3) CRLF event files are handled', () => {
    const tmp = mkTmp();
    ensureDataDir(tmp);
    const dayDir = path.join(tmp, '.nextgenai-productivity', 'events', todayLocal());
    fs.mkdirSync(dayDir, { recursive: true });
    fs.writeFileSync(path.join(dayDir, 's1.jsonl'), '{"a":1}\r\n{"a":2}\r\n');
    const r = run(tmp);
    assertEq(r.status, 0);
    assertMatch(r.stdout, /Events today: 2/);
  });

  test('4) latest report prints basename (relative), not absolute path', () => {
    const tmp = mkTmp();
    ensureDataDir(tmp);
    const reports = path.join(tmp, '.nextgenai-productivity', 'reports');
    fs.writeFileSync(path.join(reports, '2026-W10.html'), '<html></html>');
    fs.writeFileSync(path.join(reports, '2026-W11.html'), '<html></html>');
    const r = run(tmp);
    assertEq(r.status, 0);
    assertMatch(r.stdout, /Latest report: 2026-W11\.html/);
    assert(!r.stdout.includes(path.join(tmp, '.nextgenai-productivity', 'reports')));
  });

  test('5) status reports package version fallback when config has no version', () => {
    const tmp = mkTmp();
    ensureDataDir(tmp);
    const r = run(tmp);
    assertEq(r.status, 0);
    assertMatch(r.stdout, /Version: 0\.4\.0/);
  });
});
