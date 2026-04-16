#!/usr/bin/env node
/**
 * NextGen AI Institute Productivity · tracker hook
 *
 * Se invoca con uno de estos modos:
 *   node tracker.js pre-tool-use
 *   node tracker.js post-tool-use
 *   node tracker.js stop
 *
 * Lee JSON del stdin (formato de Claude Code hooks) y añade un evento
 * al archivo del día en ~/.nextgenai-productivity/events/YYYY-MM-DD.jsonl
 *
 * IMPORTANTE:
 * - NUNCA guarda el contenido de tool_input ni tool_response
 * - SOLO metadata: tool name, timestamp, duration, session_id, cwd
 * - Fallo silencioso: si algo va mal, no interrumpe Claude Code
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MODE = process.argv[2]; // 'pre-tool-use' | 'post-tool-use' | 'stop'
const DATA_DIR = path.join(os.homedir(), '.nextgenai-productivity');
const EVENTS_DIR = path.join(DATA_DIR, 'events');

// -------- util: timestamps --------
function nowIso() { return new Date().toISOString(); }
function today() { return nowIso().slice(0, 10); }

// -------- util: leer stdin sin bloquear --------
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) { resolve(''); return; }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    // timeout 500ms por seguridad
    setTimeout(() => resolve(data), 500);
  });
}

// -------- util: escritura atómica (append) --------
function appendEvent(event) {
  try {
    if (!fs.existsSync(EVENTS_DIR)) {
      fs.mkdirSync(EVENTS_DIR, { recursive: true });
    }
    const file = path.join(EVENTS_DIR, `${today()}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
  } catch (e) {
    // fallo silencioso, pero registramos en stderr para debug
    if (process.env.NEXTGENAI_DEBUG) process.stderr.write(`[nextgenai] ${e.message}\n`);
  }
}

// -------- util: detectar tamaño de input/output sin guardar contenido --------
function sizeOf(val) {
  if (val == null) return 0;
  try { return JSON.stringify(val).length; } catch { return 0; }
}

// -------- util: hash simple para detectar retries (mismos args, corto periodo) --------
function quickHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// -------- main --------
(async () => {
  try {
    const raw = await readStdin();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }

    const base = {
      ts: nowIso(),
      mode: MODE,
      session_id: payload.session_id || 'unknown',
      cwd: payload.cwd || process.cwd()
    };

    if (MODE === 'pre-tool-use') {
      const toolName = payload.tool_name || 'unknown';
      const inputSize = sizeOf(payload.tool_input);
      const inputHash = payload.tool_input
        ? quickHash(JSON.stringify(payload.tool_input)).slice(0, 10)
        : '';
      appendEvent({
        ...base,
        type: 'tool_start',
        tool: toolName,
        input_size: inputSize,
        input_hash: inputHash
      });
    }

    else if (MODE === 'post-tool-use') {
      const toolName = payload.tool_name || 'unknown';
      const outputSize = sizeOf(payload.tool_response);
      const inputHash = payload.tool_input
        ? quickHash(JSON.stringify(payload.tool_input)).slice(0, 10)
        : '';
      // duration se calcula al agregar (pareando pre↔post por session+hash)
      appendEvent({
        ...base,
        type: 'tool_end',
        tool: toolName,
        output_size: outputSize,
        input_hash: inputHash,
        ok: !(payload.tool_response && payload.tool_response.is_error)
      });
    }

    else if (MODE === 'stop') {
      appendEvent({
        ...base,
        type: 'session_stop',
        stop_hook_active: !!payload.stop_hook_active
      });
    }

    // exit 0 siempre para no bloquear Claude Code
    process.exit(0);
  } catch (e) {
    if (process.env.NEXTGENAI_DEBUG) process.stderr.write(`[nextgenai] fatal: ${e.message}\n`);
    process.exit(0);
  }
})();
