/**
 * Centralized configuration for claude-usage-auditor.
 */

const path = require('path');
const os = require('os');

const HOME = os.homedir();
const PKG = require('../package.json');

function getDataDir() {
  return process.env.CLAUDE_USAGE_DATA_DIR || path.join(HOME, '.nextgenai-productivity');
}

const DATA_DIR = getDataDir();

module.exports = {
  HOME,
  VERSION: PKG.version,
  DEBUG: process.env.NEXTGENAI_DEBUG === '1' || process.env.NGAI_DEBUG === '1',
  getDataDir,
  DATA_DIR,
  EVENTS_DIR: path.join(DATA_DIR, 'events'),
  METRICS_DIR: path.join(DATA_DIR, 'metrics'),
  REPORTS_DIR: path.join(DATA_DIR, 'reports'),
  LLM_CACHE_DIR: path.join(DATA_DIR, 'llm-cache'),
  PROMPTED_DIR: path.join(DATA_DIR, 'prompted'),
  API_KEYS_FILE: path.join(DATA_DIR, 'api-keys.yaml'),
  CONFIG_FILE: path.join(DATA_DIR, 'config.json'),
  ERRORS_FILE: path.join(DATA_DIR, 'errors.jsonl'),
  SETTINGS_PATH: path.join(HOME, '.claude', 'settings.json'),
  COMMANDS_DIR: path.join(HOME, '.claude', 'commands'),
  COMMAND_PREFIX: 'productivity-',
  HOOK_MARKERS: ['/hooks/tracker.js', '/hooks/session-start.js'],
  TRACKER_MARKER: '/hooks/tracker.js',
  SESSION_HOOK_MARKER: '/hooks/session-start.js'
};
