#!/usr/bin/env node
/**
 * claude-usage-auditor · tracker hook
 */

const fs = require('fs');
const path = require('path');
const {
  DATA_DIR,
  EVENTS_DIR,
  ERRORS_FILE,
  DEBUG
} = require('../lib/config');
const { readStdin } = require('../lib/utils/stdin');
const { ensureDir } = require('../lib/utils/fs-utils');

const MODE = process.argv[2];
const MAX_HASH_BYTES = 8 * 1024;
const EXCLUDE_TOOLS = new Set(['TodoWrite']);

function nowIso() {
  return new Date().toISOString();
}

// UTC, no local: aggregate.js construye dateList con Date.UTC() + toISOString().slice(0,10).
// Si el tracker usara fecha local, un evento a las 01:30 en UTC+2 quedaria en YYYY-MM-DD local
// pero aggregate lo buscaria en YYYY-MM-DD UTC (dia anterior) y nunca lo encontraria.
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function writeError(stage, err) {
  try {
    ensureDir(DATA_DIR, 0o700);
    const row = {
      ts: nowIso(),
      stage,
      message: err && err.message ? String(err.message) : String(err),
      stack: err && err.stack ? String(err.stack).slice(0, 500) : null
    };
    fs.appendFileSync(ERRORS_FILE, `${JSON.stringify(row)}\n`, 'utf8');
  } catch {
    // no-op
  }
}

function verbose(msg) {
  if (DEBUG) process.stderr.write(`[tracker] ${msg}\n`);
}

function sizeOf(val) {
  if (val == null) return 0;
  if (typeof val === 'string') return val.length;
  try {
    const s = JSON.stringify(val);
    return s ? s.length : 0;
  } catch {
    return 0;
  }
}

function quickHash(val) {
  let s;
  try {
    s = JSON.stringify(val);
  } catch {
    return '';
  }
  if (!s) return '';
  if (s.length > MAX_HASH_BYTES) s = s.slice(0, MAX_HASH_BYTES);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function rotateLegacyIfNeeded(date) {
  const legacyFile = path.join(EVENTS_DIR, `${date}.jsonl`);
  const dayDir = path.join(EVENTS_DIR, date);
  if (!fs.existsSync(legacyFile)) return;
  ensureDir(dayDir, 0o700);
  const hasAny = fs.readdirSync(dayDir).some((f) => f.endsWith('.jsonl'));
  if (hasAny) return;
  const target = path.join(dayDir, 'legacy.jsonl');
  fs.renameSync(legacyFile, target);
}

function appendEvent(event) {
  try {
    const date = todayUtc();
    ensureDir(EVENTS_DIR, 0o700);
    rotateLegacyIfNeeded(date);
    const dayDir = path.join(EVENTS_DIR, date);
    ensureDir(dayDir, 0o700);
    const sid = String(event.session_id || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
    const file = path.join(dayDir, `${sid}.jsonl`);
    fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (e) {
    writeError('append_event', e);
    verbose(e.message);
  }
}

(async () => {
  try {
    const raw = await readStdin(500);
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    const toolName = payload.tool_name || 'unknown';
    if (EXCLUDE_TOOLS.has(toolName)) {
      process.exit(0);
      return;
    }

    const base = {
      v: 1,
      ts: nowIso(),
      mode: MODE,
      session_id: payload.session_id || 'unknown',
      cwd: payload.cwd || process.cwd()
    };

    if (MODE === 'pre-tool-use') {
      appendEvent({
        ...base,
        type: 'tool_start',
        tool: toolName,
        input_size: sizeOf(payload.tool_input),
        input_hash: payload.tool_input ? quickHash(payload.tool_input).slice(0, 10) : ''
      });
    } else if (MODE === 'post-tool-use') {
      appendEvent({
        ...base,
        type: 'tool_end',
        tool: toolName,
        output_size: sizeOf(payload.tool_response),
        input_hash: payload.tool_input ? quickHash(payload.tool_input).slice(0, 10) : '',
        ok: !(payload.tool_response && payload.tool_response.is_error)
      });
    } else if (MODE === 'stop') {
      appendEvent({
        ...base,
        type: 'session_stop',
        stop_hook_active: !!payload.stop_hook_active
      });
    }

    process.exit(0);
  } catch (e) {
    writeError('tracker_fatal', e);
    verbose(`fatal: ${e.message}`);
    process.exit(0);
  }
})();
