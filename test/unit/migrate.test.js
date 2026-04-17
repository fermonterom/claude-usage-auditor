const path = require('path');
const { migrateV0toV1, inferModeFromType } = require(path.join(__dirname, '..', '..', 'lib', 'migrate.js'));

suite('[unit] migrate', () => {
  test('inferModeFromType maps known types', () => {
    assertEq(inferModeFromType('tool_start'), 'pre-tool-use');
    assertEq(inferModeFromType('tool_end'), 'post-tool-use');
    assertEq(inferModeFromType('session_stop'), 'stop');
  });

  test('migrateV0toV1 adds schema version and inferred mode', () => {
    const migrated = migrateV0toV1({ ts: '2026-01-01T00:00:00Z', type: 'tool_start', session_id: 'x' });
    assertEq(migrated.v, 1);
    assertEq(migrated.mode, 'pre-tool-use');
    assertEq(migrated.session_id, 'x');
  });
});
