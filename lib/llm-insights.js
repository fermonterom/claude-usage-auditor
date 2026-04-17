#!/usr/bin/env node
/**
 * claude-usage-auditor · llm-insights (optional layer)
 */

const fs = require('fs');
const https = require('https');
const {
  API_KEYS_FILE,
  LLM_CACHE_DIR,
  ERRORS_FILE,
  DATA_DIR,
  DEBUG
} = require('./config');
const { parseSimpleYaml } = require('./utils/yaml');
const { ensureDir } = require('./utils/fs-utils');

function verbose(msg) {
  if (DEBUG) process.stderr.write(`[llm] ${msg}\n`);
}

function writeError(stage, err) {
  try {
    ensureDir(DATA_DIR, 0o700);
    fs.appendFileSync(ERRORS_FILE, `${JSON.stringify({
      ts: new Date().toISOString(),
      stage,
      message: err && err.message ? err.message : String(err)
    })}\n`, 'utf8');
  } catch {
    // no-op
  }
}

function modePerms(mode) {
  return mode & 0o777;
}

function loadApiConfig() {
  if (!fs.existsSync(API_KEYS_FILE)) return null;

  try {
    const st = fs.statSync(API_KEYS_FILE);
    if (process.platform !== 'win32' && (modePerms(st.mode) & 0o077) !== 0) {
      process.stderr.write('[llm] Warning: api-keys.yaml permissions are too open; recommended 0600\n');
    }
  } catch (e) {
    writeError('api_keys_stat', e);
  }

  const text = fs.readFileSync(API_KEYS_FILE, 'utf8');
  return parseSimpleYaml(text);
}

function isCached(week) {
  const cachePath = `${LLM_CACHE_DIR}/${week}.json`;
  return fs.existsSync(cachePath) ? cachePath : null;
}

function saveCache(week, data) {
  ensureDir(LLM_CACHE_DIR, 0o700);
  fs.writeFileSync(`${LLM_CACHE_DIR}/${week}.json`, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function buildPromptPayload(insightsResult, week) {
  const derived = insightsResult && insightsResult.derived;
  if (!derived) return null;

  const cards = (insightsResult.cards || []);
  const catalogCards = cards.filter((c) => c.layer === 'catalog');
  const historyCards = cards.filter((c) => c.layer === 'history');
  const goals = insightsResult.goals || null;

  const summary = {
    week,
    metrics: {
      tool_calls: derived.tool_calls ?? 0,
      retries: derived.retries ?? 0,
      retry_ratio_pct: +(((derived.retry_ratio ?? 0) * 100).toFixed(1)),
      error_rate_pct: +(((derived.error_rate ?? 0) * 100).toFixed(1)),
      sessions: derived.sessions ?? 0,
      avg_session_min: +((derived.avg_session_min ?? 0).toFixed(1)),
      focus_ratio_pct: +(((derived.focus_ratio ?? 0) * 100).toFixed(1)),
      days_active: derived.days_active ?? 0,
      tools_distinct: derived.tools_distinct ?? 0,
      project_concentration_pct: +(((derived.project_concentration ?? 0) * 100).toFixed(1)),
      avg_input_kb: +((derived.avg_input_kb ?? 0).toFixed(2)),
      avg_output_kb: +((derived.avg_output_kb ?? 0).toFixed(2)),
      plan_mode_uses: derived.plan_mode_uses ?? 0
    },
    catalog_flags: catalogCards.filter((c) => c.state !== 'good').map((c) => ({ id: c.id, state: c.state, value: c.value_display })),
    history_trends: historyCards.map((c) => ({ id: c.id, state: c.state, value: c.value_display })),
    goals: goals ? {
      objective: goals.objective || null,
      focus_areas: goals.focus_areas || [],
      constraints: goals.constraints || []
    } : null
  };

  const system = [
    'Eres un coach de productividad para desarrolladores que usan Claude Code.',
    'Recibes únicamente métricas agregadas (nunca prompts o contenido).',
    'Devuelves 1-3 insights cualitativos en español, breves y accionables.',
    'Formato JSON estricto.',
    'Respuesta: {"insights":[{"title":"...","body":"...","severity":"good|warn|critical"}]}'
  ].join(' ');

  const user = `Datos de la semana ${week}:\n\n${JSON.stringify(summary, null, 2)}\n\nGenera 1-3 insights priorizando areas con warn/critical.`;
  return { system, user, summary };
}

function normalizeAbortError(err) {
  if (!err) return err;
  if (err.name === 'AbortError') {
    const out = new Error('timeout');
    out.code = 'ETIMEDOUT';
    return out;
  }
  return err;
}

function callAnthropicOnce({ apiKey, model, system, user, timeoutMs = 15000 }) {
  const body = JSON.stringify({
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: user }]
  });

  const controller = new AbortController();

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(chunks || '{}');
          if (res.statusCode >= 400) {
            const err = new Error(parsed.error?.message || chunks || `HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            done(reject, err);
            return;
          }
          done(resolve, parsed);
        } catch (e) {
          done(reject, e);
        }
      });
    });

    req.on('error', (err) => done(reject, normalizeAbortError(err)));

    req.write(body);
    req.end();
  });
}

function isTransientError(err) {
  if (!err) return false;
  if (err.statusCode === 429) return true;
  if (typeof err.statusCode === 'number' && err.statusCode >= 500) return true;

  const transientCodes = new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'EPIPE',
    'EAI_AGAIN'
  ]);
  if (err.code && transientCodes.has(err.code)) return true;

  const msg = String(err.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('timed out') || msg.includes('network');
}

async function callAnthropicWithRetry(args) {
  try {
    return await callAnthropicOnce(args);
  } catch (err) {
    if (!isTransientError(err)) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return callAnthropicOnce(args);
  }
}

function parseModelResponse(response) {
  const text = response?.content?.[0]?.text || '';
  const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    return Array.isArray(obj.insights) ? obj.insights : [];
  } catch {
    return [];
  }
}

async function generateLlmInsights(insightsResult, week, { force = false } = {}) {
  const config = loadApiConfig();
  if (!config || !config.enabled || !config.anthropic_api_key) {
    return { enabled: false, cards: [] };
  }

  if (!force) {
    const cached = isCached(week);
    if (cached) {
      try {
        const data = JSON.parse(fs.readFileSync(cached, 'utf8'));
        return { enabled: true, cached: true, cards: data.cards || [] };
      } catch {
        // cache regenerate
      }
    }
  }

  const payload = buildPromptPayload(insightsResult, week);
  if (!payload) {
    writeError('llm_payload', new Error('derived metrics unavailable'));
    return { enabled: true, skipped: true, cards: [] };
  }

  try {
    const response = await callAnthropicWithRetry({
      apiKey: config.anthropic_api_key,
      model: config.model,
      system: payload.system,
      user: payload.user
    });

    const raw = parseModelResponse(response);
    const cards = raw.slice(0, 3).map((item, i) => ({
      id: `llm_${i}`,
      label: item.title || 'Observation',
      layer: 'llm',
      state: ['good', 'warn', 'critical'].includes(item.severity) ? item.severity : 'warn',
      message: item.body || '',
      tip: null
    }));

    saveCache(week, { generated_at: new Date().toISOString(), cards });
    return { enabled: true, cached: false, cards };
  } catch (err) {
    writeError('llm_request', err);
    verbose(err.message);
    return { enabled: true, error: err.message, cards: [] };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.error('Usage: node llm-insights.js <insights-payload.json> [--week YYYY-Www] [--force]');
    process.exit(1);
  }

  const payloadPath = argv[0];
  let week = null;
  let force = false;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--week' && argv[i + 1]) {
      week = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--force') {
      force = true;
    }
  }

  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  week = week || payload.period || new Date().toISOString().slice(0, 10);
  const out = await generateLlmInsights(payload, week, { force });
  process.stdout.write(JSON.stringify(out, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = {
  loadApiConfig,
  buildPromptPayload,
  parseModelResponse,
  isCached,
  saveCache,
  isTransientError,
  callAnthropicOnce,
  callAnthropicWithRetry,
  generateLlmInsights
};
