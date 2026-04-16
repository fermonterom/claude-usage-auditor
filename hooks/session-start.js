#!/usr/bin/env node
/**
 * NextGen AI Institute Productivity · session-start hook
 *
 * Se invoca por Claude Code en SessionStart con JSON en stdin
 * (formato: { session_id, cwd, ... }).
 *
 * Detecta si el proyecto actual tiene `.nextgenai-productivity/goals.yaml`.
 * - Si existe, sale en silencio.
 * - Si NO existe y no está en un "skip-list" (home, /tmp, root), imprime
 *   un mensaje sugiriendo ejecutar /productivity-goals. Lo hace una vez por
 *   sesión usando un lockfile en ~/.nextgenai-productivity/prompted/.
 *
 * Fallo silencioso siempre: no bloquea Claude Code.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.nextgenai-productivity');
const PROMPTED_DIR = path.join(DATA_DIR, 'prompted');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) { resolve(''); return; }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => data += c);
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 500);
  });
}

function shouldSkip(cwd) {
  if (!cwd) return true;
  // En Windows el filesystem es case-insensitive. Comparamos tras
  // path.resolve() + lowercase para evitar falsos negativos con
  // C:\Users\foo vs c:\users\foo.
  const isWin = process.platform === 'win32';
  const norm = p => {
    const r = path.resolve(p);
    return isWin ? r.toLowerCase() : r;
  };
  const normalized = norm(cwd);
  const home = os.homedir();
  const skipPaths = [home, '/tmp', '/', 'C:\\', os.tmpdir()];
  if (skipPaths.some(p => norm(p) === normalized)) return true;
  // si está inmediatamente bajo el home y empieza por punto (dotfile), skip
  if (path.dirname(normalized) === norm(home) && path.basename(normalized).startsWith('.')) return true;
  return false;
}

(async () => {
  try {
    const raw = await readStdin();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }

    const cwd = payload.cwd || process.cwd();
    const sessionId = payload.session_id || 'unknown';

    if (shouldSkip(cwd)) { process.exit(0); return; }

    const goalsPath = path.join(cwd, '.nextgenai-productivity', 'goals.yaml');
    if (fs.existsSync(goalsPath)) { process.exit(0); return; }

    // lockfile por sesión para no spammear
    try {
      if (!fs.existsSync(PROMPTED_DIR)) fs.mkdirSync(PROMPTED_DIR, { recursive: true });
      const lockFile = path.join(PROMPTED_DIR, `${sessionId}.lock`);
      if (fs.existsSync(lockFile)) { process.exit(0); return; }
      fs.writeFileSync(lockFile, new Date().toISOString());
    } catch { /* ignore, sigue */ }

    // mensaje para el contexto de Claude (se envía via stdout como additionalContext)
    const message = [
      '',
      '[nextgenai-productivity] Este proyecto aún no tiene objetivos definidos.',
      `Falta: ${goalsPath}`,
      'Ejecuta /productivity-goals cuando quieras alinear los insights semanales con lo que importa en este proyecto.',
      ''
    ].join('\n');

    // hooks SessionStart pueden emitir JSON con hookSpecificOutput.additionalContext
    const out = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: message
      }
    };
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  } catch (e) {
    if (process.env.NEXTGENAI_DEBUG) process.stderr.write(`[nextgenai/session-start] ${e.message}\n`);
    process.exit(0);
  }
})();
