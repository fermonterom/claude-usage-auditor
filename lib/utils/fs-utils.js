const fs = require('fs');
const path = require('path');

function readJsonLoose(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJsonStrict(filePath, fallbackWhenMissing = {}) {
  if (!fs.existsSync(filePath)) return fallbackWhenMissing;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    const e = new Error(`Invalid JSON at ${filePath}: ${err.message}`);
    e.code = 'INVALID_JSON';
    throw e;
  }
}

function writeJson(filePath, value, options = {}) {
  const mode = options.mode;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (mode != null) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode });
  } else {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  }
}

function ensureDir(dirPath, mode) {
  fs.mkdirSync(dirPath, { recursive: true, mode });
  if (mode != null && process.platform !== 'win32') {
    try { fs.chmodSync(dirPath, mode); } catch {}
  }
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = `${filePath}.bak.${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

module.exports = {
  readJsonLoose,
  readJsonStrict,
  writeJson,
  ensureDir,
  backupFile
};
