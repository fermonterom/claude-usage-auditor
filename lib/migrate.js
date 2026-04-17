function inferModeFromType(type) {
  if (type === 'tool_start') return 'pre-tool-use';
  if (type === 'tool_end') return 'post-tool-use';
  if (type === 'session_stop') return 'stop';
  return 'unknown';
}

function migrateV0toV1(event) {
  if (!event || typeof event !== 'object') return null;
  return {
    v: 1,
    ...event,
    mode: event.mode || inferModeFromType(event.type)
  };
}

module.exports = {
  inferModeFromType,
  migrateV0toV1
};
