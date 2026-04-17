const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MOD_PATH = path.join(__dirname, '..', '..', 'lib', 'llm-insights.js');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'lib', 'config.js');

function withDataDir(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngai-llm-'));
  const dataDir = path.join(tmp, '.nextgenai-productivity');
  const prev = process.env.CLAUDE_USAGE_DATA_DIR;
  process.env.CLAUDE_USAGE_DATA_DIR = dataDir;

  try {
    delete require.cache[require.resolve(CONFIG_PATH)];
    delete require.cache[require.resolve(MOD_PATH)];
    const mod = require(MOD_PATH);
    return fn({ tmp, dataDir, mod });
  } finally {
    delete require.cache[require.resolve(CONFIG_PATH)];
    delete require.cache[require.resolve(MOD_PATH)];
    if (prev == null) delete process.env.CLAUDE_USAGE_DATA_DIR;
    else process.env.CLAUDE_USAGE_DATA_DIR = prev;
  }
}

function writeApiFile(dataDir, text, mode = 0o600) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'api-keys.yaml'), text, { encoding: 'utf8', mode });
}

suite('[unit] llm-insights · config and parsing', () => {
  test('1) loadApiConfig reads valid yaml', () => {
    withDataDir(({ dataDir, mod }) => {
      writeApiFile(dataDir, "anthropic_api_key: sk-ant-1\nmodel: claude-haiku-4-5-20251001\nenabled: true\n");
      const cfg = mod.loadApiConfig();
      assertEq(cfg.anthropic_api_key, 'sk-ant-1');
      assertEq(cfg.model, 'claude-haiku-4-5-20251001');
      assertEq(cfg.enabled, true);
    });
  });

  test('2) loadApiConfig keeps # inside quoted string', () => {
    withDataDir(({ dataDir, mod }) => {
      writeApiFile(dataDir, "anthropic_api_key: 'sk-ant-abc#123'\nenabled: true\n");
      const cfg = mod.loadApiConfig();
      assertEq(cfg.anthropic_api_key, 'sk-ant-abc#123');
    });
  });

  test('3) loadApiConfig returns null when file missing', () => {
    withDataDir(({ mod }) => {
      assertEq(mod.loadApiConfig(), null);
    });
  });

  test('4) loadApiConfig warns on loose permissions (>0600) on POSIX', () => {
    withDataDir(({ dataDir, mod }) => {
      if (process.platform === 'win32') {
        skip('permissions check not meaningful on Windows');
        return;
      }
      writeApiFile(dataDir, "anthropic_api_key: sk-ant-1\nenabled: true\n", 0o644);
      const writes = [];
      const orig = process.stderr.write;
      process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
      try {
        mod.loadApiConfig();
      } finally {
        process.stderr.write = orig;
      }
      assert(writes.join('').includes('permissions are too open'));
    });
  });
});

suite('[unit] llm-insights · payload and response', () => {
  test('5) buildPromptPayload builds numeric summary', () => {
    withDataDir(({ mod }) => {
      const payload = mod.buildPromptPayload({
        derived: {
          tool_calls: 100,
          retries: 12,
          retry_ratio: 0.12,
          error_rate: 0.03,
          sessions: 7,
          avg_session_min: 23.4,
          focus_ratio: 0.44,
          days_active: 5,
          tools_distinct: 6,
          project_concentration: 0.81,
          avg_input_kb: 1.24,
          avg_output_kb: 4.89,
          plan_mode_uses: 2
        },
        cards: [
          { layer: 'catalog', id: 'retry_ratio', state: 'warn', value_display: '12.0%' },
          { layer: 'history', id: 'history_trend_retries', state: 'warn', value_display: '+2.0 pts' }
        ],
        goals: { objective: 'Reducir retries', focus_areas: ['retry_ratio'], constraints: ['sin overtime'] }
      }, '2026-W15');

      assert(payload && payload.summary);
      assertEq(payload.summary.metrics.retry_ratio_pct, 12);
      assertEq(payload.summary.metrics.error_rate_pct, 3);
      assertEq(payload.summary.catalog_flags.length, 1);
      assertEq(payload.summary.history_trends.length, 1);
      assertEq(payload.summary.goals.objective, 'Reducir retries');
    });
  });

  test('6) buildPromptPayload returns null if derived is null', () => {
    withDataDir(({ mod }) => {
      assertEq(mod.buildPromptPayload({ cards: [], derived: null }, '2026-W01'), null);
    });
  });

  test('7) parseModelResponse parses three insights', () => {
    withDataDir(({ mod }) => {
      const response = { content: [{ text: JSON.stringify({ insights: [
        { title: 'A', body: '1', severity: 'warn' },
        { title: 'B', body: '2', severity: 'good' },
        { title: 'C', body: '3', severity: 'critical' }
      ] }) }] };
      const out = mod.parseModelResponse(response);
      assertEq(out.length, 3);
      assertEq(out[2].severity, 'critical');
    });
  });

  test('8) parseModelResponse malformed returns []', () => {
    withDataDir(({ mod }) => {
      assertEq(mod.parseModelResponse({ content: [{ text: 'not-json' }] }), []);
    });
  });
});

suite('[unit] llm-insights · cache and force behavior', () => {
  test('9) cache hit/miss and --force regeneration path', () => {
    withDataDir(({ dataDir, tmp, mod }) => {
      mod.saveCache('2026-W10', { cards: [{ id: 'cached' }] });
      assert(mod.isCached('2026-W10'));
      assertEq(mod.isCached('2026-W11'), null);

      const script = `
const fs = require('fs');
const path = require('path');
const https = require('https');
const mod = require(${JSON.stringify(MOD_PATH)});
const dataDir = process.env.CLAUDE_USAGE_DATA_DIR;
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'api-keys.yaml'), "anthropic_api_key: sk-ant-1\\nenabled: true\\n", { mode: 0o600 });
let calls = 0;
https.request = (options, cb) => {
  calls += 1;
  const listeners = {};
  const res = { statusCode: 200, on: (ev, fn) => { listeners[ev] = fn; } };
  process.nextTick(() => {
    cb(res);
    const body = JSON.stringify({ content: [{ text: JSON.stringify({ insights: [{ title: 'ok', body: 'x', severity: 'warn' }] }) }] });
    if (listeners.data) listeners.data(body);
    if (listeners.end) listeners.end();
  });
  return {
    on: () => {},
    write: () => {},
    end: () => {}
  };
};
(async () => {
  const payload = { derived: { tool_calls: 1, retries: 0, retry_ratio: 0, error_rate: 0, sessions: 1, avg_session_min: 1, focus_ratio: 0.1, days_active: 1, tools_distinct: 1, project_concentration: 1, avg_input_kb: 1, avg_output_kb: 1, plan_mode_uses: 0 }, cards: [], goals: null };
  const r1 = await mod.generateLlmInsights(payload, '2026-W21');
  const r2 = await mod.generateLlmInsights(payload, '2026-W21');
  const r3 = await mod.generateLlmInsights(payload, '2026-W21', { force: true });
  process.stdout.write(JSON.stringify({ calls, cached2: !!r2.cached, cards1: r1.cards.length, cards3: r3.cards.length }));
})().catch((e) => { console.error(e.message); process.exit(1); });
`;

      const out = spawnSync('node', ['-e', script], {
        env: { ...process.env, CLAUDE_USAGE_DATA_DIR: dataDir },
        encoding: 'utf8',
        timeout: 10000
      });
      assertEq(out.status, 0, out.stderr);
      const parsed = JSON.parse(out.stdout);
      assertEq(parsed.calls, 2); // initial + forced
      assertEq(parsed.cached2, true);
      assertEq(parsed.cards1, 1);
      assertEq(parsed.cards3, 1);
    });
  });
});
