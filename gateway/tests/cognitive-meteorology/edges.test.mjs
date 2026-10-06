import test from 'node:test';
import assert from 'node:assert/strict';
import { bottleneckSources, currentWindow, previousWindow } from './fixtures.mjs';
const load = async file => { try { return await import(`../../local-field/meteorology/${file}.mjs`); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; return {}; } };
const calendar = await load('calendar-edge'), git = await load('git-edge'), types = await load('signals');
const required = (module, key) => { assert.equal(typeof module[key], 'function', `${key} must exist`); return module[key]; };
const by = signals => Object.fromEntries(signals.map(s => [s.metric, s]));

// Catch treating magnitude as an unsigned scalar, erasing source lineage, or reading private text.
test('Calendar emits the three scoped conditions and retains signed movement', () => {
  const result = by(required(calendar, 'extractCalendarSignals')(bottleneckSources().calendar));
  assert.deepEqual(Object.keys(result).sort(), ['available_time_margin', 'buffer_compression', 'meeting_density']);
  assert.ok(Math.abs(result.available_time_margin.magnitude - 0.12) < 1e-12);
  assert.ok(Math.abs(result.meeting_density.magnitude - 0.88) < 1e-12);
  assert.equal(result.buffer_compression.magnitude, 1);
  assert.equal(result.available_time_margin.direction, 'FALLING');
  assert.ok(result.available_time_margin.rate_of_change < 0);
  assert.equal(result.buffer_compression.direction, 'RISING');
  for (const s of Object.values(result)) {
    assert.equal(s.source_domain, 'CALENDAR'); assert.deepEqual(s.observation_window, currentWindow);
    assert.deepEqual(s.comparison_window, previousWindow); assert.equal(s.extractor_version, '0.1.0');
  }
});
test('Git measures 84 hours of age, worsening review waits, and four times baseline commits', () => {
  const result = by(required(git, 'extractGitSignals')(bottleneckSources().git));
  assert.deepEqual(Object.keys(result).sort(), ['commit_velocity', 'open_pr_age', 'review_latency']);
  assert.equal(result.open_pr_age.magnitude, 0.5);
  assert.equal(result.review_latency.magnitude, 0.875);
  assert.equal(result.commit_velocity.magnitude, 1);
  assert.equal(result.commit_velocity.direction, 'RISING');
  assert.equal(result.commit_velocity.rate_of_change, 0.03125);
});
test('edge output ignores private source contents without reading their getters', () => {
  const source = bottleneckSources();
  for (const row of [...source.calendar.current.events, ...source.git.current.commits, ...source.git.current.pull_requests])
    for (const key of ['description', 'attendees', 'body', 'source_code', 'secret', 'email_body', 'banking_description', 'biometric_trace'])
      Object.defineProperty(row, key, { enumerable: true, get() { throw new Error('RAW_CONTENT_ACCESSED'); } });
  const signals = [...required(calendar, 'extractCalendarSignals')(source.calendar), ...required(git, 'extractGitSignals')(source.git)];
  const keys = ['signal_id', 'metric', 'magnitude', 'direction', 'rate_of_change', 'observation_window', 'comparison_window', 'source_domain', 'extractor_id', 'extractor_version', 'timestamp'].sort();
  for (const s of signals) assert.deepEqual(Object.keys(s).sort(), keys);
  assert.ok(Object.isFrozen(signals[0]));
});
test('overlapping calendar events are unioned rather than double counting time', () => {
  const source = bottleneckSources().calendar;
  source.current.events.push({ ...source.current.events[0] });
  const result = by(required(calendar, 'extractCalendarSignals')(source));
  assert.ok(Math.abs(result.meeting_density.magnitude - 0.88) < 1e-12);
});
test('empty Calendar has time available and no fabricated buffer shortage', () => {
  const source = bottleneckSources().calendar; source.current.events = [];
  const result = by(required(calendar, 'extractCalendarSignals')(source));
  assert.equal(result.available_time_margin.magnitude, 1); assert.equal(result.meeting_density.magnitude, 0);
  assert.equal(result.buffer_compression.magnitude, 0);
});
test('missing Git baseline and missing PRs omit unavailable signals', () => {
  const source = bottleneckSources().git; source.rolling_daily_commit_median = 0;
  assert.ok(!required(git, 'extractGitSignals')(source).some(s => s.metric === 'commit_velocity'));
  source.current.pull_requests = []; source.previous.pull_requests = [];
  assert.deepEqual(required(git, 'extractGitSignals')(source), []);
});
test('saturation preserves rising direction and nonzero measured rate', () => {
  const source = bottleneckSources().git;
  source.current.commits = Array.from({ length: 80 }, () => ({ timestamp: currentWindow.start }));
  source.previous.commits = Array.from({ length: 40 }, () => ({ timestamp: previousWindow.start }));
  const s = by(required(git, 'extractGitSignals')(source)).commit_velocity;
  assert.equal(s.magnitude, 1); assert.equal(s.direction, 'RISING'); assert.ok(s.rate_of_change > 0);
});
test('wrong source domain, nonfinite rates, unsigned movement, and raw fields fail closed', () => {
  const validate = required(types, 'validateSignals');
  const s = required(calendar, 'extractCalendarSignals')(bottleneckSources().calendar)[0];
  for (const patch of [{ source_domain: 'MAIL' }, { magnitude: NaN }, { rate_of_change: Infinity },
    { direction: 'RISING', rate_of_change: -1 }, { description: 'private' }, { magnitude: 1.1 }])
    assert.throws(() => validate([{ ...s, ...patch }]), /SIGNAL/);
  assert.throws(() => validate([{ ...s, observation_window: { ...currentWindow, body: 'raw' } }]), /SIGNAL/);
});
test('malformed or reversed timestamps and unequal comparison windows are rejected at edges', () => {
  const source = bottleneckSources().calendar;
  source.current.events[0].start = 'not-a-date';
  assert.throws(() => required(calendar, 'extractCalendarSignals')(source), /EDGE/);
  const bad = bottleneckSources().git; bad.previous.window = { start: previousWindow.start, end: previousWindow.start };
  assert.throws(() => required(git, 'extractGitSignals')(bad), /EDGE/);
});
