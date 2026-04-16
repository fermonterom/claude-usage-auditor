#!/usr/bin/env node
/**
 * NextGen AI Institute Productivity · llm-insights (capa C opcional)
 *
 * Llama a la API de Claude con un resumen agregado (sin contenido de prompts)
 * para generar 1-3 insights cualitativos que complementan el catálogo.
 *
 * Config: ~/.nextgenai-productivity/api-keys.yaml
 *   anthropic_api_key: sk-ant-...
 *   model: claude-haiku-4-5-20251001   # opcional, default
 *   enabled: true                       # opcional, default false
 *
 * Privacidad: se envían ÚNICAMENTE agregados numéricos + goals (texto corto
 * elegido explícitamente por el usuario). Nunca contenido de prompts/respuestas.
 *
 * Budget: 1 llamada por semana por usuario, máx ~300 tokens out.
 *
 * Uso:
 *   node llm-insights.js <insights-payload.json>
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const DATA_DIR = path.join(os.homedir(), '.nextgenai-productivity');
const API_KEYS_FILE = path.join(DATA_DIR, 'api-keys.yaml');
const LLM_CACHE_DIR = path.join(DATA_DIR, 'llm-cache');

function loadApiConfig() {
  if (!fs.existsSync(API_KEYS_FILE)) return null;
  const text = fs.readFileSync(API_KEYS_FILE, 'utf8');
  const config = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    config[m[1]] = value;
  }
  return config;
}

function isCached(week) {
  const cachePath = path.join(LLM_CACHE_DIR, `${week}.json`);
  return fs.existsSync(cachePath) ? cachePath : null;
}

function saveCache(week, data) {
  fs.mkdirSync(LLM_CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(LLM_CACHE_DIR, `${week}.json`), JSON.stringify(data, null, 2), 'utf8');
}

function buildPromptPayload(insightsResult, week) {
  const derived = insightsResult.derived || {};
  const catalogCards = (insightsResult.cards || []).filter(c => c.layer === 'catalog');
  const historyCards = (insightsResult.cards || []).filter(c => c.layer === 'history');
  const goals = insightsResult.goals || null;

  const summary = {
    week,
    metrics: {
      tool_calls: derived.tool_calls,
      retries: derived.retries,
      retry_ratio_pct: +(derived.retry_ratio * 100).toFixed(1),
      error_rate_pct: +(derived.error_rate * 100).toFixed(1),
      sessions: derived.sessions,
      avg_session_min: +derived.avg_session_min.toFixed(1),
      focus_ratio_pct: +(derived.focus_ratio * 100).toFixed(1),
      days_active: derived.days_active,
      tools_distinct: derived.tools_distinct,
      project_concentration_pct: +(derived.project_concentration * 100).toFixed(1),
      avg_input_kb: +derived.avg_input_kb.toFixed(2),
      avg_output_kb: +derived.avg_output_kb.toFixed(2),
      plan_mode_uses: derived.plan_mode_uses
    },
    catalog_flags: catalogCards
      .filter(c => c.state !== 'good')
      .map(c => ({ id: c.id, state: c.state, value: c.value_display })),
    history_trends: historyCards.map(c => ({ id: c.id, state: c.state, value: c.value_display })),
    goals: goals ? {
      objective: goals.objective || null,
      focus_areas: goals.focus_areas || [],
      constraints: goals.constraints || []
    } : null
  };

  const system = `Eres un coach de productividad para desarrolladores que usan Claude Code.
Recibes únicamente métricas agregadas (nunca prompts o contenido).
Devuelves 1-3 insights cualitativos en español, breves (máx 2 frases cada uno),
accionables y alineados con los objetivos del proyecto si existen.
Formato JSON estricto, sin markdown fuera del array.

Respuesta:
{"insights":[{"title":"...","body":"...","severity":"good|warn|critical"}]}`;

  const user = `Datos de la semana ${week}:\n\n${JSON.stringify(summary, null, 2)}\n\nGenera 1-3 insights priorizando áreas con warn/critical o desviaciones vs objetivos del proyecto.`;

  return { system, user, summary };
}

function callAnthropic({ apiKey, model, system, user }) {
  const body = JSON.stringify({
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: user }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(chunks);
          if (res.statusCode >= 400) return reject(new Error(parsed.error?.message || chunks));
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

function parseModelResponse(response) {
  const text = response.content?.[0]?.text || '';
  // intenta parsear JSON del texto; robusto ante fences
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
      } catch { /* regen */ }
    }
  }

  const { system, user } = buildPromptPayload(insightsResult, week);
  try {
    const response = await callAnthropic({
      apiKey: config.anthropic_api_key,
      model: config.model,
      system,
      user
    });
    const raw = parseModelResponse(response);
    const cards = raw.slice(0, 3).map((item, i) => ({
      id: `llm_${i}`,
      label: item.title || 'Observación',
      layer: 'llm',
      state: ['good', 'warn', 'critical'].includes(item.severity) ? item.severity : 'warn',
      message: item.body || '',
      tip: null
    }));
    saveCache(week, { generated_at: new Date().toISOString(), cards });
    return { enabled: true, cached: false, cards };
  } catch (err) {
    return { enabled: true, error: err.message, cards: [] };
  }
}

// --- CLI ---
async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.error('Uso: node llm-insights.js <insights-payload.json> [--week 2026-W16] [--force]');
    process.exit(1);
  }
  const payloadPath = argv[0];
  let week = null;
  let force = false;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--week' && argv[i + 1]) { week = argv[i + 1]; i++; }
    else if (argv[i] === '--force') force = true;
  }
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  week = week || payload.period || new Date().toISOString().slice(0, 10);
  const out = await generateLlmInsights(payload, week, { force });
  process.stdout.write(JSON.stringify(out, null, 2));
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });

module.exports = { buildPromptPayload, generateLlmInsights };
