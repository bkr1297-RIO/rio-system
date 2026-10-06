import { createHash } from 'node:crypto';

export const METRICS = Object.freeze({
  available_time_margin: 'CALENDAR', meeting_density: 'CALENDAR', buffer_compression: 'CALENDAR',
  open_pr_age: 'GIT', review_latency: 'GIT', commit_velocity: 'GIT',
});
export const EXTRACTORS = Object.freeze({ CALENDAR: 'calendar.edge.f0.1', GIT: 'git.edge.f0.1' });
export const VERSION = '0.1.0';
const KEYS = ['metric', 'magnitude', 'direction', 'rate_of_change', 'observation_window', 'comparison_window',
  'source_domain', 'extractor_id', 'extractor_version', 'timestamp'];
export const fingerprint = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
export function requireCondition(condition, code) { if (!condition) throw new Error(code); }
export function exactData(value, keys, code = 'SIGNAL_FIELDS') {
  requireCondition(value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireCondition(Reflect.ownKeys(descriptors).length === keys.length && keys.every(k =>
    descriptors[k]?.enumerable && Object.hasOwn(descriptors[k], 'value')), code);
}
export function exactArray(value, code = 'SIGNAL_ARRAY', maximum = Infinity) {
  requireCondition(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length <= maximum &&
    Reflect.ownKeys(value).length === value.length + 1, code);
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    requireCondition(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), code);
  }
}
export function time(value, code = 'SIGNAL_TIME') {
  requireCondition(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), code);
  const n = Date.parse(value);
  requireCondition(Number.isFinite(n) && new Date(n).toISOString() === value, code); return n;
}
export function windowDuration(window, code = 'SIGNAL_WINDOW') {
  exactData(window, ['start', 'end'], code);
  const duration = time(window.end, code) - time(window.start, code);
  requireCondition(duration > 0 && duration <= 7 * 86400000, code); return duration;
}
export function compareWindows(current, previous, code = 'SIGNAL_WINDOW') {
  requireCondition(windowDuration(current, code) === windowDuration(previous, code) &&
    time(previous.end, code) <= time(current.start, code), code);
  return (time(current.end, code) - time(previous.end, code)) / 3600000;
}
export function fieldSignal(spec, previousMagnitude) {
  requireCondition(typeof spec.metric === 'string' && Object.hasOwn(METRICS, spec.metric), 'SIGNAL_METRIC');
  requireCondition(Number.isFinite(spec.magnitude) && spec.magnitude >= 0 &&
    Number.isFinite(previousMagnitude) && previousMagnitude >= 0, 'SIGNAL_MEASUREMENT');
  const hours = compareWindows(spec.observation_window, spec.comparison_window);
  const change = spec.magnitude - previousMagnitude;
  const rate = Math.abs(change) < 1e-12 ? 0 : change / hours;
  const value = { metric: spec.metric, magnitude: Math.min(1, spec.magnitude),
    direction: rate > 0 ? 'RISING' : rate < 0 ? 'FALLING' : 'STABLE', rate_of_change: rate,
    observation_window: { ...spec.observation_window }, comparison_window: { ...spec.comparison_window },
    source_domain: METRICS[spec.metric], extractor_id: EXTRACTORS[METRICS[spec.metric]],
    extractor_version: VERSION, timestamp: spec.observation_window.end };
  const s = { signal_id: fingerprint(value), ...value }; validateSignals([s]);
  Object.freeze(s.observation_window); Object.freeze(s.comparison_window); return Object.freeze(s);
}
export function validateSignals(signals) {
  exactArray(signals, 'SIGNAL_ARRAY', 6);
  const seen = new Set();
  for (let i = 0; i < signals.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(signals, String(i));
    requireCondition(descriptor && Object.hasOwn(descriptor, 'value'), 'SIGNAL_ARRAY');
    const s = descriptor.value; exactData(s, ['signal_id', ...KEYS]);
    requireCondition(typeof s.metric === 'string' && Object.hasOwn(METRICS, s.metric) && s.source_domain === METRICS[s.metric] &&
      s.extractor_id === EXTRACTORS[s.source_domain] && s.extractor_version === VERSION, 'SIGNAL_PROVENANCE');
    requireCondition(!seen.has(s.metric), 'SIGNAL_DUPLICATE'); seen.add(s.metric);
    requireCondition(Number.isFinite(s.magnitude) && s.magnitude >= 0 && s.magnitude <= 1 &&
      Number.isFinite(s.rate_of_change), 'SIGNAL_NUMBER');
    requireCondition(s.direction === (s.rate_of_change > 0 ? 'RISING' : s.rate_of_change < 0 ? 'FALLING' : 'STABLE'), 'SIGNAL_DIRECTION');
    compareWindows(s.observation_window, s.comparison_window);
    requireCondition(s.timestamp === s.observation_window.end, 'SIGNAL_TIMESTAMP');
    const value = Object.fromEntries(KEYS.map(k => [k, s[k]]));
    requireCondition(s.signal_id === fingerprint(value), 'SIGNAL_ID_BINDING');
  }
  return signals;
}
