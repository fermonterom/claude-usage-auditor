#!/usr/bin/env node
/**
 * claude-usage-auditor · aggregate
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { EVENTS_DIR, METRICS_DIR, DEBUG } = require('./config');
const { ensureDir } = require('./utils/fs-utils');
const { migrateV0toV1 } = require('./migrate');

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeKey(k) {
  if (typeof k !== 'string') return null;
  if (FORBIDDEN_KEYS.has(k)) return null;
  return k;
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function weekRange(weekLabel) {
  const m = weekLabel.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`Invalid week format: ${weekLabel}`);
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return [monday, sunday];
}

function datesInRange(start, end) {
  const out = [];
  const d = new Date(start);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function parseDateArg(arg, today) {
  if (!arg || arg === 'today') return today;
  if (arg === 'yesterday') {
    const y = new Date(today);
    y.setUTCDate(y.getUTCDate() - 1);
    return y.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;
  throw new Error(`Invalid date format: ${arg}`);
}

function parseWeekArg(arg, today) {
  if (!arg || arg === 'current' || arg === 'this-week') return isoWeekOf(new Date(today));
  if (arg === 'last' || arg === 'last-week') {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 7);
    return isoWeekOf(d);
  }
  if (/^\d{4}-W\d{2}$/.test(arg)) return arg;
  throw new Error(`Invalid week format: ${arg}`);
}

function listEventFilesForDate(date) {
  const files = [];
  const legacy = path.join(EVENTS_DIR, `${date}.jsonl`);
  if (fs.existsSync(legacy)) files.push(legacy);

  const dayDir = path.join(EVENTS_DIR, date);
  if (fs.existsSync(dayDir) && fs.statSync(dayDir).isDirectory()) {
    for (const file of fs.readdirSync(dayDir)) {
      if (file.endsWith('.jsonl')) files.push(path.join(dayDir, file));
    }
  }
  return files;
}


function normalizeEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.v === undefined) return migrateV0toV1(event);
  return event;
}

async function loadEventsForDates(dateList) {
  const events = [];
  let skipped = 0;
  for (const date of dateList) {
    for (const file of listEventFilesForDate(date)) {
      const rl = readline.createInterface({
        input: fs.createReadStream(file, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });
      let firstLine = true;
      for await (const rawLine of rl) {
        let line = rawLine;
        if (firstLine) {
          if (line.charCodeAt(0) === 0xFEFF) line = line.slice(1);
          firstLine = false;
        }
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const normalized = normalizeEvent(parsed);
          if (normalized) events.push(normalized);
        } catch {
          skipped += 1;
        }
      }
    }
  }
  if (skipped > 0 && DEBUG) process.stderr.write(`[aggregate] skipped malformed lines: ${skipped}\n`);
  return events;
}

function emptySessionMetrics() {
  return {
    session_id: null,
    date: null,
    start_ts: null,
    end_ts: null,
    duration_sec: 0,
    tool_calls: 0,
    tool_errors: 0,
    tools: {},
    cwds: {},
    input_bytes: 0,
    output_bytes: 0,
    retries: 0,
    denials: 0
  };
}

function aggregateBySession(events) {
  const sessions = new Map();
  const hashIndex = new Map();

  for (const ev of events) {
    if (!ev.session_id) continue;
    if (!sessions.has(ev.session_id)) {
      const s = emptySessionMetrics();
      s.session_id = ev.session_id;
      s.date = ev.ts ? ev.ts.slice(0, 10) : null;
      s.start_ts = ev.ts;
      sessions.set(ev.session_id, s);
    }
    const s = sessions.get(ev.session_id);
    s.end_ts = ev.ts;

    if (ev.type === 'tool_start') {
      s.tool_calls += 1;
      const toolKey = safeKey(ev.tool);
      if (toolKey) s.tools[toolKey] = (s.tools[toolKey] || 0) + 1;
      const cwdKey = safeKey(ev.cwd);
      if (cwdKey) s.cwds[cwdKey] = (s.cwds[cwdKey] || 0) + 1;
      if (ev.input_size) s.input_bytes += ev.input_size;

      if (ev.input_hash) {
        const key = `${ev.session_id}|${toolKey || 'unknown'}|${ev.input_hash}`;
        const prev = hashIndex.get(key) || [];
        const tsMs = new Date(ev.ts).getTime();
        if (prev.some((prevTs) => tsMs - prevTs < 60000 && tsMs - prevTs > 0)) s.retries += 1;
        prev.push(tsMs);
        hashIndex.set(key, prev);
      }
    } else if (ev.type === 'tool_end') {
      if (ev.output_size) s.output_bytes += ev.output_size;
      if (ev.ok === false) s.tool_errors += 1;
    }
  }

  for (const s of sessions.values()) {
    if (s.start_ts && s.end_ts) {
      const diffMs = new Date(s.end_ts) - new Date(s.start_ts);
      s.duration_sec = Number.isFinite(diffMs) && diffMs >= 0 && diffMs < 24 * 3600 * 1000
        ? Math.round(diffMs / 1000)
        : 0;
    }
  }

  return [...sessions.values()].sort((a, b) => (a.start_ts || '').localeCompare(b.start_ts || ''));
}

function aggregateByDay(sessions) {
  const days = new Map();
  for (const s of sessions) {
    if (!s.date) continue;
    if (!days.has(s.date)) {
      days.set(s.date, {
        date: s.date,
        sessions: 0,
        tool_calls: 0,
        tool_errors: 0,
        retries: 0,
        duration_sec: 0,
        tools: {},
        cwds: {},
        input_bytes: 0,
        output_bytes: 0
      });
    }
    const d = days.get(s.date);
    d.sessions += 1;
    d.tool_calls += s.tool_calls;
    d.tool_errors += s.tool_errors;
    d.retries += s.retries;
    d.duration_sec += s.duration_sec;
    d.input_bytes += s.input_bytes;
    d.output_bytes += s.output_bytes;
    for (const [t, n] of Object.entries(s.tools)) d.tools[t] = (d.tools[t] || 0) + n;
    for (const [c, n] of Object.entries(s.cwds)) d.cwds[c] = (d.cwds[c] || 0) + n;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByWeek(days) {
  const weeks = new Map();
  for (const d of days) {
    const wk = isoWeekOf(new Date(d.date));
    if (!weeks.has(wk)) {
      weeks.set(wk, {
        week: wk,
        days: 0,
        sessions: 0,
        tool_calls: 0,
        tool_errors: 0,
        retries: 0,
        duration_sec: 0,
        tools: {},
        cwds: {},
        input_bytes: 0,
        output_bytes: 0
      });
    }
    const w = weeks.get(wk);
    w.days += 1;
    w.sessions += d.sessions;
    w.tool_calls += d.tool_calls;
    w.tool_errors += d.tool_errors;
    w.retries += d.retries;
    w.duration_sec += d.duration_sec;
    w.input_bytes += d.input_bytes;
    w.output_bytes += d.output_bytes;
    for (const [t, n] of Object.entries(d.tools)) w.tools[t] = (w.tools[t] || 0) + n;
    for (const [c, n] of Object.entries(d.cwds)) w.cwds[c] = (w.cwds[c] || 0) + n;
  }
  return [...weeks.values()];
}

async function buildAggregate(mode = 'week', arg = '') {
  const today = new Date().toISOString().slice(0, 10);
  let dateList;
  let outputFile;
  let periodLabel;

  if (mode == 'day') {
    const date = parseDateArg(arg, today);
    dateList = [date];
    periodLabel = date;
    outputFile = path.join(METRICS_DIR, `day-${date}.json`);
  } else if (mode == 'week') {
    const week = parseWeekArg(arg, today);
    const [start, end] = weekRange(week);
    dateList = datesInRange(start, end);
    periodLabel = week;
    outputFile = path.join(METRICS_DIR, `${week}.json`);
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const events = await loadEventsForDates(dateList);
  const sessions = aggregateBySession(events);
  const days = aggregateByDay(sessions);
  const weeks = aggregateByWeek(days);

  const result = {
    generated_at: new Date().toISOString(),
    period: periodLabel,
    mode,
    dates_scanned: dateList,
    raw_event_count: events.length,
    sessions,
    days,
    weeks
  };

  ensureDir(METRICS_DIR, 0o700);
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
  return result;
}

async function main() {
  try {
    const mode = process.argv[2] || 'week';
    const arg = process.argv[3] || '';
    const result = await buildAggregate(mode, arg);
    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  safeKey,
  isoWeekOf,
  weekRange,
  datesInRange,
  loadEventsForDates,
  normalizeEvent,
  aggregateBySession,
  aggregateByDay,
  aggregateByWeek,
  buildAggregate
};
