import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { waist } from '../constitutional-waist/helpers.mjs';
import { evaluate, validateReading } from '../../local-field/meteorology/evaluator.mjs';
import { projectMetascope, renderMetascope } from '../../local-field/meteorology/projection.mjs';
import { extractCalendarSignals } from '../../local-field/meteorology/calendar-edge.mjs';
import { extractGitSignals } from '../../local-field/meteorology/git-edge.mjs';
import { fieldSignal, validateSignals, fingerprint } from '../../local-field/meteorology/signals.mjs';
import { bottleneckSources, fixtureSignals, currentWindow } from './fixtures.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const moduleDir = join(root, 'gateway/local-field/meteorology');

export function durableSnapshot(fieldRoot) {
  const db = new DatabaseSync(join(fieldRoot, 'field.sqlite'), { readOnly: true });
  try { return Object.fromEntries(['records', 'state', 'nonces', 'ledger'].map(table =>
    [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])); } finally { db.close(); }
}
const gitState = path => ({ refs: execFileSync('git', ['for-each-ref', '--format=%(refname) %(objectname)'], { cwd: path }).toString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path }).toString(),
  status: execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: path }).toString(),
  file: readFileSync(join(path, 'source.txt'), 'utf8') });

// Catches any gate call, actual standing mutation, runtime outbox/lease write, filesystem effect,
// source rewrite or Git ref change. Existing HOLD/ADMIT decisions are the baseline, never a weather result.
test('100 pull readings preserve real standing, durable tables, Calendar data, Git refs and world files', async t => {
  const f = waist(t), held = f.candidate(f.grant({ purpose: 'ccm:I_AB:outbound' }));
  const holdDecision = f.runtime.admit(held); assert.equal(holdDecision.disposition, 'HOLD');
  const admitted = f.candidate(); const admitDecision = f.runtime.admit(admitted); assert.equal(admitDecision.disposition, 'ADMIT');
  const sourceRoot = mkdtempSync(join(tmpdir(), 'meteorology-source-')); t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: sourceRoot });
  writeFileSync(join(sourceRoot, 'source.txt'), 'Source code remains at the Git edge. PRIVATE_CODE_SENTINEL\n');
  execFileSync('git', ['add', 'source.txt'], { cwd: sourceRoot });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'source fixture'], { cwd: sourceRoot });
  const source = bottleneckSources(); source.calendar.current.events[0].description = 'PRIVATE_CALENDAR_SENTINEL';
  writeFileSync(join(sourceRoot, 'calendar.json'), JSON.stringify(source.calendar));
  const before = { durable: durableSnapshot(f.root), runtime: f.runtime.status(), git: gitState(sourceRoot),
    calendar: readFileSync(join(sourceRoot, 'calendar.json'), 'utf8'), artifacts: readdirSync(join(f.root, 'artifacts')),
    held: f.view(held), admitted: f.view(admitted) };
  const signals = [...extractCalendarSignals(source.calendar), ...extractGitSignals(source.git)];
  for (let i = 0; i < 100; i++) {
    const reading = evaluate(signals, { timestamp: currentWindow.end });
    assert.equal(reading.atmospheric_regime, 'PRESSURE_DIFFERENTIAL'); assert.ok(reading.unresolved_remainder.length > 0);
    assert.ok(!JSON.stringify(reading).includes('PRIVATE_')); renderMetascope(projectMetascope(reading));
  }
  const after = { durable: durableSnapshot(f.root), runtime: f.runtime.status(), git: gitState(sourceRoot),
    calendar: readFileSync(join(sourceRoot, 'calendar.json'), 'utf8'), artifacts: readdirSync(join(f.root, 'artifacts')),
    held: f.view(held), admitted: f.view(admitted) };
  assert.deepEqual(after, before);
  assert.equal(f.view(admitted).commitment, null); assert.equal(f.view(admitted).invocation, null);
  assert.equal(f.runtime.status().execution_authorities.length, 0);
  assert.equal(f.runtime.status().outgoing.length, 0); assert.equal(f.runtime.status().attempts.length, 0);
  const dispositions = snap => snap.records.filter(r => r.kind === 'decision' || r.kind === 'waist_decision').length;
  t.diagnostic(JSON.stringify({ proof: 'ACTUAL_NATIVE_STATE_COMPARISON', repetitions: 100,
    new_dispositions: dispositions(after.durable) - dispositions(before.durable),
    ledger_rows_before: before.durable.ledger.length, ledger_rows_after: after.durable.ledger.length,
    durable_tables_equal: fingerprint(after.durable) === fingerprint(before.durable),
    table_digests_before: Object.fromEntries(Object.entries(before.durable).map(([key, value]) => [key, fingerprint(value)])),
    table_digests_after: Object.fromEntries(Object.entries(after.durable).map(([key, value]) => [key, fingerprint(value)])),
    standing_equal: fingerprint(after.runtime) === fingerprint(before.runtime), calendar_bytes_equal: after.calendar === before.calendar,
    git_refs_and_files_equal: fingerprint(after.git) === fingerprint(before.git),
    execution_authorities: after.runtime.execution_authorities.length, outgoing: after.runtime.outgoing.length,
    attempts: after.runtime.attempts.length, artifact_files_before: before.artifacts.length, artifact_files_after: after.artifacts.length }));
});

test('core runs with filesystem writes and subprocesses denied and creates no timer resources', async () => {
  const signals = await fixtureSignals();
  const code = `
    import {createHook} from 'node:async_hooks';
    import {evaluate} from ${JSON.stringify(new URL('../../local-field/meteorology/evaluator.mjs', import.meta.url).href)};
    import {projectMetascope,renderMetascope} from ${JSON.stringify(new URL('../../local-field/meteorology/projection.mjs', import.meta.url).href)};
    const timers=[]; const hook=createHook({init(id,type){if(type==='Timeout'||type==='Immediate')timers.push(type);}});
    hook.enable();
    const reading=evaluate(${JSON.stringify(signals)},{timestamp:${JSON.stringify(currentWindow.end)}});
    const html=renderMetascope(projectMetascope(reading));hook.disable();
    console.log(JSON.stringify({regime:reading.atmospheric_regime,sections:(html.match(/<section>/g)||[]).length,
      fs_write:process.permission.has('fs.write'),subprocess:process.permission.has('child'),timers}));
  `;
  const result = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${moduleDir}`, '--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { regime: 'PRESSURE_DIFFERENTIAL', sections: 4, fs_write: false, subprocess: false, timers: [] });
});

test('received machine readings reject raw additions and invented dispositions before display', async () => {
  const reading = evaluate(await fixtureSignals(), { timestamp: currentWindow.end });
  for (const patch of [{ disposition: 'HOLD' }, { standing: 'AUTHORIZED' }, { current_conditions: [{ condition_code: 'TIME_TIGHT', signal_refs: ['invented'], body: 'private' }] }])
    assert.throws(() => projectMetascope({ ...reading, ...patch }), /READING/);
  const tampered = structuredClone(reading); tampered.atmospheric_regime = 'CLEAR_HORIZON';
  assert.throws(() => validateReading(tampered), /READING_LINEAGE/);
});

test('hidden raw fields in signal arrays are rejected without reading them', async () => {
  const signals = await fixtureSignals(); let read = false;
  Object.defineProperty(signals, 'source_code', { get() { read = true; return 'PRIVATE_CODE'; } });
  assert.throws(() => evaluate(signals, { timestamp: currentWindow.end }), /SIGNAL_ARRAY/); assert.equal(read, false);
});

test('boxed metrics and coercion hooks cannot carry raw content into a Fieldoscopy reading', async () => {
  const signal = (await fixtureSignals()).find(s => s.metric === 'commit_velocity');
  const boxed = Object.assign(new String('commit_velocity'), { source_code: 'PRIVATE_SENTINEL' });
  assert.throws(() => evaluate([{ ...signal, metric: boxed }], { timestamp: currentWindow.end }), /SIGNAL/);
  let coerced = false;
  const metric = { [Symbol.toPrimitive]() { coerced = true; return 'commit_velocity'; } };
  assert.throws(() => validateSignals([{ ...signal, metric }]), /SIGNAL/); assert.equal(coerced, false);
});

test('all received reading arrays reject hidden fields and executable prototypes before projection', async () => {
  const base = evaluate(await fixtureSignals(), { timestamp: currentWindow.end });
  const selectors = [r => r.signal_manifest, r => r.candidate_regimes, r => r.current_conditions,
    r => r.current_conditions[0].signal_refs, r => r.primary_drivers, r => r.forming_fronts,
    r => r.forming_fronts[0].horizon_hours, r => r.unresolved_remainder, r => r.evaluation.matched_rules];
  for (const select of selectors) {
    const reading = structuredClone(base); Object.defineProperty(select(reading), 'source_code', { value: 'PRIVATE_SENTINEL' });
    assert.throws(() => projectMetascope(reading), /READING_FIELDS/);
  }
  let invoked = false; const reading = structuredClone(base);
  Object.setPrototypeOf(reading.current_conditions, Object.assign(Object.create(Array.prototype), {
    map() { invoked = true; return ['PRIVATE_SENTINEL']; },
  }));
  assert.throws(() => projectMetascope(reading), /READING_FIELDS/); assert.equal(invoked, false);
});

test('semantically equal windows align despite source object property order', async () => {
  const signals = await fixtureSignals(), s = signals.find(s => s.metric === 'commit_velocity');
  const reversed = fieldSignal({ metric: s.metric, magnitude: s.magnitude,
    observation_window: { end: s.observation_window.end, start: s.observation_window.start },
    comparison_window: { end: s.comparison_window.end, start: s.comparison_window.start } }, .25);
  const reading = evaluate([...signals.filter(s => s.metric !== 'commit_velocity'), reversed], { timestamp: currentWindow.end });
  assert.equal(reading.atmospheric_regime, 'PRESSURE_DIFFERENTIAL');
  assert.ok(!reading.unresolved_remainder.includes('UNALIGNED_WINDOWS'));
});

test('pull runner emits distinct machine artifact and four-section HTML on explicit request only', t => {
  const script = join(root, 'gateway/scripts/run-cognitive-meteorology.mjs');
  assert.ok(existsSync(script), 'pull runner must exist');
  const output = mkdtempSync(join(tmpdir(), 'meteorology-display-')); t.after(() => rmSync(output, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [script, '--demo', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const reading = JSON.parse(readFileSync(join(output, 'fieldoscopy-reading.json'), 'utf8'));
  const projection = JSON.parse(readFileSync(join(output, 'metascope-projection.json'), 'utf8'));
  const html = readFileSync(join(output, 'metascope.html'), 'utf8');
  assert.equal(reading.atmospheric_regime, 'PRESSURE_DIFFERENTIAL'); assert.equal(projection.reading_ref, reading.reading_id);
  assert.equal((html.match(/<section>/g) || []).length, 4);
  assert.deepEqual(readdirSync(output).sort(), ['fieldoscopy-reading.json', 'metascope-projection.json', 'metascope.html']);
  const noRequest = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: output });
  assert.notEqual(noRequest.status, 0); assert.deepEqual(readdirSync(output).sort(), ['fieldoscopy-reading.json', 'metascope-projection.json', 'metascope.html']);
});
