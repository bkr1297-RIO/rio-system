import { METRICS, VERSION, validateSignals, exactData, exactArray, time, fingerprint, requireCondition } from './signals.mjs';

export const REGIMES = Object.freeze(['HIGH_PRESSURE', 'LOW_PRESSURE', 'COLD_FRONT', 'WARM_FRONT', 'WIND_SHEAR',
  'INVERSION', 'CLEAR_HORIZON', 'PRESSURE_DIFFERENTIAL']);
export const CONDITION_CODES = Object.freeze(['TIME_TIGHT', 'TIME_AVAILABLE', 'MEETINGS_DENSE', 'MEETINGS_LIGHT',
  'BUFFERS_COMPRESSED', 'BUFFERS_PRESENT', 'PRS_AGING', 'PRS_RECENT', 'REVIEW_WAITS_LONG', 'REVIEW_WAITS_SHORT',
  'PRODUCTION_RISING', 'PRODUCTION_FALLING', 'PRODUCTION_STABLE', 'POSSIBLE_REVIEW_BOTTLENECK',
  'POSSIBLE_CAPACITY_RECOVERY', 'POSSIBLE_CAPACITY_TIGHTENING']);
export const REMAINDERS = Object.freeze(['UNCALIBRATED_FORECAST', 'REVIEW_LATENCY_IS_CAPACITY_PROXY',
  'PENDING_REVIEWS_ARE_CENSORED', 'NO_TASK_SIZE_OR_COMPLEXITY_SIGNAL', 'CALENDAR_FREE_TIME_IS_NOT_REVIEW_COMMITMENT',
  'PRESSURE_DIFFERENTIAL_ONTOLOGY_OPEN', 'MISSING_CALENDAR', 'MISSING_GIT', 'MISSING_METRICS', 'STALE_SIGNALS',
  'UNALIGNED_WINDOWS', 'NO_MATCHED_REGIME']);
const PRIORITY = ['PRESSURE_DIFFERENTIAL', 'COLD_FRONT', 'WARM_FRONT', 'WIND_SHEAR', 'INVERSION',
  'HIGH_PRESSURE', 'LOW_PRESSURE', 'CLEAR_HORIZON'];
export function freezeData(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeData(child); Object.freeze(value); }
  return value;
}

/** Pure observation. There is no runtime, grant, gate, scheduler, transport or executor parameter. */
export function evaluate(signals, options = {}) {
  exactData(options, Object.hasOwn(options, 'timestamp') ? ['timestamp'] : [], 'EVALUATION_OPTIONS');
  validateSignals(signals);
  const timestamp = options.timestamp ?? new Date().toISOString(), now = time(timestamp, 'EVALUATION_TIME');
  const sorted = [...signals].sort((a, b) => a.metric.localeCompare(b.metric));
  const manifest = sorted.map(({ metric, ...s }) => ({ signal_type: metric, ...structuredClone(s) }));
  requireCondition(sorted.every(s => time(s.timestamp) <= now), 'FUTURE_SIGNAL');
  const remainder = REMAINDERS.slice(0, 6), domains = new Set(sorted.map(s => s.source_domain));
  if (!domains.has('CALENDAR')) remainder.push('MISSING_CALENDAR');
  if (!domains.has('GIT')) remainder.push('MISSING_GIT');
  if (sorted.length < 6) remainder.push('MISSING_METRICS');
  const fresh = sorted.filter(s => now - time(s.timestamp) <= 24 * 3600000);
  if (fresh.length < sorted.length) remainder.push('STALE_SIGNALS');
  const windows = new Set(fresh.map(s => JSON.stringify([s.observation_window.start, s.observation_window.end,
    s.comparison_window.start, s.comparison_window.end])));
  const aligned = windows.size <= 1;
  if (!aligned) remainder.push('UNALIGNED_WINDOWS');
  const m = Object.fromEntries(fresh.map(s => [s.metric, s]));
  const v = key => m[key]?.magnitude, d = key => m[key]?.direction;
  const has = keys => aligned && keys.every(key => m[key]);
  const condition = (code, keys) => ({ condition_code: code, signal_refs: keys.filter(key => m[key]).map(key => m[key].signal_id) });
  const current = fresh.map(s => condition(s.metric === 'available_time_margin' ? (s.magnitude <= .2 ? 'TIME_TIGHT' : 'TIME_AVAILABLE') :
    s.metric === 'meeting_density' ? (s.magnitude >= .75 ? 'MEETINGS_DENSE' : 'MEETINGS_LIGHT') :
    s.metric === 'buffer_compression' ? (s.magnitude >= .5 ? 'BUFFERS_COMPRESSED' : 'BUFFERS_PRESENT') :
    s.metric === 'open_pr_age' ? (s.magnitude >= .5 ? 'PRS_AGING' : 'PRS_RECENT') :
    s.metric === 'review_latency' ? (s.magnitude >= .5 ? 'REVIEW_WAITS_LONG' : 'REVIEW_WAITS_SHORT') :
    `PRODUCTION_${s.direction}`, [s.metric]));
  const differential = has(['commit_velocity', 'review_latency']) ? v('commit_velocity') - (1 - v('review_latency')) : null;
  const candidates = [], rules = [], fronts = [];
  const add = (regime, keys, predicate) => {
    if (has(keys) && predicate()) { candidates.push(regime); rules.push(`f0.1:${regime.toLowerCase()}`); }
  };
  // These are provisional fixture rules, not established atmospheric identities or calibrated forecasts.
  if (domains.size === 2 && aligned) {
    add('PRESSURE_DIFFERENTIAL', ['commit_velocity', 'review_latency', 'available_time_margin'], () =>
      differential > .3 && d('commit_velocity') === 'RISING' && d('review_latency') === 'RISING' &&
      d('available_time_margin') === 'FALLING' && v('available_time_margin') <= .2);
    add('COLD_FRONT', ['available_time_margin', 'meeting_density', 'review_latency'], () =>
      d('available_time_margin') === 'FALLING' && d('meeting_density') === 'RISING' && d('review_latency') === 'RISING');
    add('WARM_FRONT', ['available_time_margin', 'review_latency'], () =>
      d('available_time_margin') === 'RISING' && d('review_latency') === 'FALLING');
    add('WIND_SHEAR', ['available_time_margin', 'review_latency'], () =>
      (d('available_time_margin') === 'RISING' && d('review_latency') === 'RISING') ||
      (d('available_time_margin') === 'FALLING' && d('review_latency') === 'FALLING'));
    add('INVERSION', ['available_time_margin', 'review_latency', 'commit_velocity'], () =>
      v('available_time_margin') >= .6 && v('review_latency') >= .5 && v('commit_velocity') <= .25);
    add('HIGH_PRESSURE', ['available_time_margin', 'meeting_density', 'review_latency'], () =>
      v('available_time_margin') <= .2 && v('meeting_density') >= .75 && v('review_latency') >= .5);
    add('LOW_PRESSURE', ['available_time_margin', 'meeting_density', 'review_latency', 'commit_velocity'], () =>
      v('available_time_margin') >= .6 && v('meeting_density') <= .4 && v('review_latency') <= .25 && v('commit_velocity') <= .15);
    add('CLEAR_HORIZON', Object.keys(METRICS), () => v('available_time_margin') >= .4 && v('meeting_density') <= .6 &&
      v('buffer_compression') <= .3 && v('open_pr_age') <= .25 && v('review_latency') <= .25 &&
      v('commit_velocity') > .15 && v('commit_velocity') <= .75 && d('available_time_margin') !== 'FALLING' && d('review_latency') !== 'RISING');
  }
  candidates.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  if (candidates.includes('PRESSURE_DIFFERENTIAL')) fronts.push({ ...condition('POSSIBLE_REVIEW_BOTTLENECK',
    ['commit_velocity', 'review_latency', 'available_time_margin']), horizon_hours: [24, 48], status: 'CANDIDATE' });
  else if (candidates.includes('WARM_FRONT')) fronts.push({ ...condition('POSSIBLE_CAPACITY_RECOVERY',
    ['available_time_margin', 'review_latency']), horizon_hours: [24, 48], status: 'CANDIDATE' });
  else if (candidates.includes('COLD_FRONT')) fronts.push({ ...condition('POSSIBLE_CAPACITY_TIGHTENING',
    ['available_time_margin', 'meeting_density', 'review_latency']), horizon_hours: [24, 48], status: 'CANDIDATE' });
  if (!candidates.length) remainder.push('NO_MATCHED_REGIME');
  const full = sorted.length === 6 && fresh.length === 6 && aligned;
  const driverMetrics = candidates[0] === 'PRESSURE_DIFFERENTIAL' ? ['commit_velocity', 'review_latency', 'available_time_margin'] :
    ['available_time_margin', 'review_latency', 'open_pr_age'];
  const value = { timestamp, atmospheric_regime: candidates[0] ?? null, candidate_regimes: candidates,
    signal_manifest: manifest, visibility: !fresh.length ? 'UNKNOWN' : full ? 'ILLUMINATED' : 'SHADOWED',
    confidence: { basis: 'UNCALIBRATED_RULE_SUPPORT', level: !candidates.length ? 'INSUFFICIENT' : full ? 'SUPPORTED' : 'PARTIAL' },
    current_conditions: current, primary_drivers: driverMetrics.map(key => current.find(c => c.signal_refs.includes(m[key]?.signal_id))).filter(Boolean),
    forming_fronts: fronts, unresolved_remainder: remainder,
    evaluation: { evaluator_id: 'cognitive-meteorology.f0.1', evaluator_version: VERSION, matched_rules: rules.sort(),
      pressure_differential: differential, pressure_differential_role: 'EXPERIMENTAL_RELATIONAL_FEATURE' } };
  return freezeData({ reading_id: fingerprint(value), ...value });
}

// Verify a received reading against its bounded signal lineage and the exact versioned evaluator.
// Closed comparison rejects nested text fields and accessors before reading their values.
function sameData(actual, expected) {
  if (expected && typeof expected === 'object') {
    if (Array.isArray(expected)) {
      exactArray(actual, 'READING_FIELDS', expected.length);
      requireCondition(actual.length === expected.length, 'READING_FIELDS');
      for (let i = 0; i < expected.length; i++) {
        const d = Object.getOwnPropertyDescriptor(actual, String(i));
        requireCondition(d && Object.hasOwn(d, 'value'), 'READING_FIELDS'); sameData(d.value, expected[i]);
      }
    } else { exactData(actual, Object.keys(expected), 'READING_FIELDS'); for (const key of Object.keys(expected)) sameData(actual[key], expected[key]); }
  } else requireCondition(actual === expected, 'READING_LINEAGE');
}
export function validateReading(reading) {
  exactData(reading, ['reading_id', 'timestamp', 'atmospheric_regime', 'candidate_regimes', 'signal_manifest', 'visibility',
    'confidence', 'current_conditions', 'primary_drivers', 'forming_fronts', 'unresolved_remainder', 'evaluation'], 'READING_FIELDS');
  exactArray(reading.signal_manifest, 'READING_FIELDS', 6);
  const signals = Array.from({ length: reading.signal_manifest.length }, (_, i) => {
    const descriptor = Object.getOwnPropertyDescriptor(reading.signal_manifest, String(i));
    requireCondition(descriptor && Object.hasOwn(descriptor, 'value'), 'READING_FIELDS');
    const s = descriptor.value;
    exactData(s, ['signal_type', 'signal_id', 'magnitude', 'direction', 'rate_of_change', 'observation_window',
      'comparison_window', 'source_domain', 'extractor_id', 'extractor_version', 'timestamp'], 'READING_FIELDS');
    const { signal_type, ...rest } = s; return { metric: signal_type, ...rest };
  });
  sameData(reading, evaluate(signals, { timestamp: reading.timestamp })); return reading;
}
