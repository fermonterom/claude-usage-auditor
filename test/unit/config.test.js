const path = require('path');

test('config respects CLAUDE_USAGE_DATA_DIR override', () => {
  const prev = process.env.CLAUDE_USAGE_DATA_DIR;
  process.env.CLAUDE_USAGE_DATA_DIR = '/tmp/cua-override';
  const modPath = path.join(__dirname, '..', '..', 'lib', 'config.js');
  delete require.cache[require.resolve(modPath)];
  const cfg = require(modPath);
  assertEq(cfg.DATA_DIR, '/tmp/cua-override');
  if (prev == null) delete process.env.CLAUDE_USAGE_DATA_DIR;
  else process.env.CLAUDE_USAGE_DATA_DIR = prev;
  delete require.cache[require.resolve(modPath)];
});
