import { fieldSignal, time, windowDuration, compareWindows, requireCondition } from './signals.mjs';

// Source-side stub: only timing fields are read. Events, names and text stay with the caller.
function sample(source) {
  windowDuration(source.window, 'CALENDAR_EDGE_WINDOW');
  const start = time(source.work_start, 'CALENDAR_EDGE_TIME'), end = time(source.work_end, 'CALENDAR_EDGE_TIME');
  requireCondition(end > start && start >= time(source.window.start) && end <= time(source.window.end) &&
    Number.isFinite(source.minimum_buffer_minutes) && source.minimum_buffer_minutes > 0 && Array.isArray(source.events), 'CALENDAR_EDGE_SAMPLE');
  const blocks = source.events.map(event => {
    const a = time(event.start, 'CALENDAR_EDGE_EVENT'), b = time(event.end, 'CALENDAR_EDGE_EVENT');
    requireCondition(b > a, 'CALENDAR_EDGE_EVENT'); return [Math.max(a, start), Math.min(b, end)];
  }).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const union = [];
  for (const block of blocks) {
    const last = union.at(-1);
    if (last && block[0] < last[1]) last[1] = Math.max(last[1], block[1]);
    else union.push([...block]);
  }
  const occupied = union.reduce((n, [a, b]) => n + b - a, 0), budget = end - start;
  const buffer = source.minimum_buffer_minutes * 60000;
  const shortage = union.slice(1).reduce((n, [a], i) => n + Math.max(0, 1 - (a - union[i][1]) / buffer), 0);
  return { budget, available_time_margin: 1 - occupied / budget, meeting_density: occupied / budget,
    buffer_compression: union.length < 2 ? 0 : shortage / (union.length - 1) };
}
export function extractCalendarSignals({ current, previous }) {
  compareWindows(current.window, previous.window, 'CALENDAR_EDGE_WINDOW');
  const now = sample(current), before = sample(previous);
  requireCondition(now.budget === before.budget && current.minimum_buffer_minutes === previous.minimum_buffer_minutes, 'CALENDAR_EDGE_COMPARISON');
  return ['available_time_margin', 'meeting_density', 'buffer_compression'].map(metric => fieldSignal({
    metric, magnitude: now[metric], observation_window: current.window, comparison_window: previous.window,
  }, before[metric]));
}
