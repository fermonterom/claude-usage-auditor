/**
 * Unit tests — lib/install.js + lib/uninstall.js
 * Se corren en subprocess con HOME redirigido.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const INSTALL = path.join(__dirname, '..', '..', 'lib', 'install.js');
const UNINSTALL = path.join(__dirname, '..', '..', 'lib', 'uninstall.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ngai-test-install-'));
}

function runNode(script, args, tmpHome, extraEnv = {}) {
  return spawnSync('node', [script, ...(args || [])], {
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome, ...extraEnv },
    encoding: 'utf8',
    timeout: 10000
  });
}

function readSettings(tmpHome) {
  const p = path.join(tmpHome, '.claude', 'settings.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

suite('[unit] install', () => {
  test('instalación limpia crea data dir y 4 hooks', () => {
    const tmp = mkTmp();
    const r = runNode(INSTALL, [], tmp);
    assertEq(r.status, 0, r.stderr);
    const settings = readSettings(tmp);
    assert(settings.hooks, 'settings.hooks presente');
    assert(Array.isArray(settings.hooks.PreToolUse), 'PreToolUse array');
    assert(Array.isArray(settings.hooks.PostToolUse));
    assert(Array.isArray(settings.hooks.Stop));
    assert(Array.isArray(settings.hooks.SessionStart));
    // data dir
    assert(fs.existsSync(path.join(tmp, '.nextgenai-productivity', 'events')));
  });

  test('instalación idempotente: 2x no duplica entradas', () => {
    const tmp = mkTmp();
    runNode(INSTALL, [], tmp);
    runNode(INSTALL, [], tmp);
    const settings = readSettings(tmp);
    assertEq(settings.hooks.PreToolUse.length, 1);
    assertEq(settings.hooks.PostToolUse.length, 1);
    assertEq(settings.hooks.Stop.length, 1);
    assertEq(settings.hooks.SessionStart.length, 1);
  });

  test('settings existente con otros hooks se preserva', () => {
    const tmp = mkTmp();
    const settingsPath = path.join(tmp, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'node /other/hook.js' }] }]
      },
      other: { flag: true }
    }, null, 2));
    runNode(INSTALL, [], tmp);
    const after = readSettings(tmp);
    assertEq(after.other.flag, true, 'campo no relacionado preservado');
    assertEq(after.hooks.PreToolUse.length, 2, 'otro hook + el nuevo');
    assert(after.hooks.PreToolUse.some(e => e.hooks.some(h => h.command.includes('/other/'))),
      'hook externo preservado');
    assert(after.hooks.PreToolUse.some(e => e.hooks.some(h => h.command.includes('hooks/tracker.js') || h.command.includes('hooks\\tracker.js'))),
      'hook nuestro añadido');
  });
});

suite('[unit] uninstall', () => {
  test('quita los 4 hooks nuestros y preserva otros', () => {
    const tmp = mkTmp();
    const settingsPath = path.join(tmp, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'node /other/hook.js' }] }]
      }
    }));

    runNode(INSTALL, [], tmp);
    const afterInstall = readSettings(tmp);
    assertEq(afterInstall.hooks.PreToolUse.length, 2);

    runNode(UNINSTALL, [], tmp);
    const afterUninstall = readSettings(tmp);
    // sólo el hook externo queda
    assertEq(afterUninstall.hooks.PreToolUse.length, 1);
    assert(afterUninstall.hooks.PreToolUse[0].hooks[0].command.includes('/other/'));
  });

  test('sin --purge, preserva data', () => {
    const tmp = mkTmp();
    runNode(INSTALL, [], tmp);
    // simulate events
    const eventsDir = path.join(tmp, '.nextgenai-productivity', 'events');
    fs.writeFileSync(path.join(eventsDir, '2026-04-16.jsonl'), '{"ts":"x"}\n');
    runNode(UNINSTALL, [], tmp);
    assert(fs.existsSync(eventsDir), 'events/ preservado');
  });

  test('con --purge, borra data dir', () => {
    const tmp = mkTmp();
    runNode(INSTALL, [], tmp);
    runNode(UNINSTALL, ['--purge'], tmp);
    assert(!fs.existsSync(path.join(tmp, '.nextgenai-productivity')), 'data dir borrada');
  });
});
