function computeDerivedMetrics(weekMetrics, extras = {}) {
  const tool_calls = weekMetrics.tool_calls || 0;
  const retries = weekMetrics.retries || 0;
  const tool_errors = weekMetrics.tool_errors || 0;
  const sessions = weekMetrics.sessions || 0;
  const duration_sec = weekMetrics.duration_sec || 0;
  const days_active = weekMetrics.days || 0;
  const input_bytes = weekMetrics.input_bytes || 0;
  const output_bytes = weekMetrics.output_bytes || 0;
  const tools = weekMetrics.tools || {};
  const cwds = weekMetrics.cwds || {};

  const retry_ratio = tool_calls > 0 ? retries / tool_calls : 0;
  const error_rate = tool_calls > 0 ? tool_errors / tool_calls : 0;
  const avg_session_sec = sessions > 0 ? duration_sec / sessions : 0;
  const avg_session_min = avg_session_sec / 60;
  const focus_ratio = sessions > 0 ? Math.min(1, avg_session_sec / 3600) : 0;
  const tools_distinct = Object.keys(tools).length;
  const avg_input_kb = tool_calls > 0 ? (input_bytes / tool_calls) / 1024 : 0;
  const avg_output_kb = tool_calls > 0 ? (output_bytes / tool_calls) / 1024 : 0;

  const totalCwdCount = Object.values(cwds).reduce((a, b) => a + b, 0);
  const maxCwd = Object.values(cwds).reduce((m, v) => Math.max(m, v), 0);
  const project_concentration = totalCwdCount > 0 ? maxCwd / totalCwdCount : 0;

  const plan_mode_uses = extras.plan_mode_uses ?? (tools.EnterPlanMode || 0);

  return {
    tool_calls,
    retries,
    retry_ratio,
    tool_errors,
    error_rate,
    sessions,
    duration_sec,
    avg_session_sec,
    avg_session_min,
    focus_ratio,
    days_active,
    tools_distinct,
    input_bytes,
    output_bytes,
    avg_input_kb,
    avg_output_kb,
    project_concentration,
    plan_mode_uses
  };
}

module.exports = { computeDerivedMetrics };
