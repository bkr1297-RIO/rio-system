import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldSignal } from '../../local-field/meteorology/signals.mjs';
import { fixtureSignals, currentWindow, previousWindow } from './fixtures.mjs';
const load = async file => { try { return await import(`../../local-field/meteorology/${file}.mjs`); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; return {}; } };
const engine = await load('evaluator'), display = await load('projection');
const evaluate = (...args) => { assert.equal(typeof engine.evaluate, 'function', 'observational evaluator must exist'); return engine.evaluate(...args); };
const timestamp = currentWindow.end;
const signalsFor = states => Object.entries(states).map(([metric, [magnitude, previous]]) => fieldSignal({
  metric, magnitude, observation_window: currentWindow, comparison_window: previousWindow }, previous));
const regimes = [
  ['HIGH_PRESSURE', { available_time_margin: [.1, .1], meeting_density: [.9, .9], buffer_compression: [1, 1], open_pr_age: [.7, .7], review_latency: [.8, .8], commit_velocity: [.5, .5] }],
  ['LOW_PRESSURE', { available_time_margin: [.8, .8], meeting_density: [.2, .2], buffer_compression: [0, 0], open_pr_age: [.1, .1], review_latency: [.1, .1], commit_velocity: [.1, .1] }],
  ['COLD_FRONT', { available_time_margin: [.1, .6], meeting_density: [.9, .4], buffer_compression: [1, 0], open_pr_age: [.7, .5], review_latency: [.8, .4], commit_velocity: [.3, .3] }],
  ['WARM_FRONT', { available_time_margin: [.7, .2], meeting_density: [.3, .8], buffer_compression: [0, .8], open_pr_age: [.2, .6], review_latency: [.2, .7], commit_velocity: [.3, .3] }],
  ['WIND_SHEAR', { available_time_margin: [.7, .3], meeting_density: [.3, .7], buffer_compression: [0, .5], open_pr_age: [.7, .4], review_latency: [.8, .3], commit_velocity: [.3, .3] }],
  ['INVERSION', { available_time_margin: [.8, .8], meeting_density: [.2, .2], buffer_compression: [0, 0], open_pr_age: [.8, .6], review_latency: [.8, .7], commit_velocity: [.1, .1] }],
  ['CLEAR_HORIZON', { available_time_margin: [.6, .6], meeting_density: [.4, .4], buffer_compression: [.1, .1], open_pr_age: [.1, .1], review_latency: [.1, .1], commit_velocity: [.3, .3] }],
];

test('required fixture detects rising production against worsening review waits and tightening time', async () => {
  const signals = await fixtureSignals(), reading = evaluate(signals, { timestamp });
  assert.equal(reading.atmospheric_regime, 'PRESSURE_DIFFERENTIAL');
  assert.equal(reading.visibility, 'ILLUMINATED'); assert.equal(reading.confidence.basis, 'UNCALIBRATED_RULE_SUPPORT');
  assert.ok(reading.unresolved_remainder.length > 0);
  assert.ok(reading.forming_fronts.some(f => f.condition_code === 'POSSIBLE_REVIEW_BOTTLENECK'));
  assert.deepEqual(reading.forming_fronts[0].horizon_hours, [24, 48]);
  assert.deepEqual(reading.signal_manifest.map(s => s.signal_id).sort(), signals.map(s => s.signal_id).sort());
  const ids = new Set(signals.map(s => s.signal_id));
  for (const c of [...reading.current_conditions, ...reading.primary_drivers, ...reading.forming_fronts])
    for (const ref of c.signal_refs) assert.ok(ids.has(ref));
  assert.equal('disposition' in reading, false); assert.equal('standing' in reading, false);
});
for (const [regime, states] of regimes) test(`comparative fixture supports ${regime} without authorizing action`, () => {
  const reading = evaluate(signalsFor(states), { timestamp });
  assert.ok(reading.candidate_regimes.includes(regime));
  assert.equal(reading.evaluation.pressure_differential_role, 'EXPERIMENTAL_RELATIONAL_FEATURE');
});
test('scalar pressure difference alone does not imply the pressure-differential regime', () => {
  const signals = signalsFor({ available_time_margin: [.8, .8], meeting_density: [.2, .2], buffer_compression: [0, 0],
    open_pr_age: [.8, .8], review_latency: [.9, .9], commit_velocity: [.9, .9] });
  const reading = evaluate(signals, { timestamp });
  assert.ok(reading.evaluation.pressure_differential > .5);
  assert.ok(!reading.candidate_regimes.includes('PRESSURE_DIFFERENTIAL'));
});
test('empty and single-domain observations do not invent a clear horizon', async () => {
  const empty = evaluate([], { timestamp }); assert.equal(empty.atmospheric_regime, null);
  assert.equal(empty.visibility, 'UNKNOWN'); assert.equal(empty.confidence.level, 'INSUFFICIENT');
  const partial = evaluate((await fixtureSignals()).filter(s => s.source_domain === 'CALENDAR'), { timestamp });
  assert.equal(partial.atmospheric_regime, null); assert.ok(partial.unresolved_remainder.includes('MISSING_GIT'));
});
test('stale and differently aligned windows retain uncertainty rather than a cross-domain forecast', async () => {
  const signals = await fixtureSignals();
  const stale = evaluate(signals, { timestamp: '2026-10-08T00:00:00.000Z' });
  assert.equal(stale.atmospheric_regime, null); assert.ok(stale.unresolved_remainder.includes('STALE_SIGNALS'));
  const other = signalsFor({ commit_velocity: [1, .25] })[0];
  const moved = fieldSignal({ ...other, magnitude: 1,
    observation_window: { start: '2026-10-05T01:00:00.000Z', end: '2026-10-06T01:00:00.000Z' },
    comparison_window: { start: '2026-10-04T01:00:00.000Z', end: '2026-10-05T01:00:00.000Z' } }, .25);
  const mismatch = evaluate([...signals.filter(s => s.metric !== 'commit_velocity'), moved], { timestamp: moved.timestamp });
  assert.equal(mismatch.atmospheric_regime, null); assert.ok(mismatch.unresolved_remainder.includes('UNALIGNED_WINDOWS'));
});
test('duplicate signals, raw content, future observations and getter carriers are rejected', async () => {
  const signals = await fixtureSignals();
  assert.throws(() => evaluate([signals[0], signals[0]], { timestamp }), /SIGNAL_DUPLICATE/);
  for (const field of ['calendar_description', 'message_body', 'source_code', 'pr_body', 'banking_description', 'biometric_trace'])
    assert.throws(() => evaluate([{ ...signals[0], [field]: 'PRIVATE_SENTINEL' }], { timestamp }), /SIGNAL_FIELDS/);
  assert.throws(() => evaluate(signals, { timestamp: previousWindow.end }), /FUTURE_SIGNAL/);
  let read = false; const carrier = { ...signals[0] };
  Object.defineProperty(carrier, 'magnitude', { enumerable: true, get() { read = true; return .5; } });
  assert.throws(() => evaluate([carrier], { timestamp }), /SIGNAL_FIELDS/); assert.equal(read, false);
});
test('same attributable inputs have a stable reading identity regardless of array order', async () => {
  const signals = await fixtureSignals();
  const a = evaluate(signals, { timestamp }), b = evaluate([...signals].reverse(), { timestamp });
  assert.deepEqual(a, b); assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.signal_manifest));
});
test('Metascope is a separate four-section projection linked to the reading', async () => {
  assert.equal(typeof display.projectMetascope, 'function', 'separate projection must exist');
  const reading = evaluate(await fixtureSignals(), { timestamp }), projection = display.projectMetascope(reading);
  assert.equal(projection.reading_ref, reading.reading_id); assert.equal('signal_manifest' in projection, false);
  assert.deepEqual(projection.sections.map(s => s.title), ['Current Conditions', 'What’s Driving It', 'What’s Forming', 'What We Can’t See Yet']);
  assert.match(projection.sections[2].lines.join(' '), /possible review bottleneck/i);
  assert.ok(!JSON.stringify(projection).includes('Stress Index'));
  assert.equal(typeof display.renderMetascope, 'function');
  const malicious = structuredClone(projection); malicious.sections[0].lines = ['<script>alert("raw")</script>'];
  const html = display.renderMetascope(malicious);
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
});
