function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if (/^["'].*["']$/.test(value)) return value.slice(1, -1);
  return value;
}

function parseSimpleYaml(text) {
  const lines = text.split(/\r?\n/);
  const result = {};
  let currentArr = null;

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trimEnd();
    if (!line.trim()) continue;

    const arrMatch = line.match(/^\s+-\s+(.*)$/);
    if (arrMatch && currentArr) {
      currentArr.push(coerce(arrMatch[1].trim()));
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === '' || value === '|' || value === '>') {
        result[key] = [];
        currentArr = result[key];
      } else {
        result[key] = coerce(value);
        currentArr = null;
      }
    }
  }

  return result;
}

module.exports = { stripComment, coerce, parseSimpleYaml };
