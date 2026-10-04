import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint as hash } from '../../local-field/relations/index.mjs';
import * as relations from '../../local-field/relations/index.mjs';

const sources = [
  { source_id: 'source-1', title: 'Passage record', uri: 'fixture:passage', text: 'A passage carries an attributable request. The receiver checks current authority before execution.' },
  { source_id: 'source-2', title: 'Return record', uri: 'fixture:return', text: 'A Return links observations and receipts. A signed receipt does not automatically settle a claim.' },
];
function fixture() {
  assert.equal(typeof relations.prepareDirect, 'function', 'Direct must circulate actual artifacts');
  const substrate = relations.fixedSubstrate(), matrix = relations.directMatrix('research-direct-fixture', substrate);
  const human_intent = { body: { type: 'research_intent', query: 'How do passage and Return preserve authority?',
    sources_hash: hash(sources), target: 'hello.txt' }, signature: 'formation-unit-fixture-only' };
  return { matrix, substrate, human_intent, sources, run_id: 'research-run-fixture-001' };
}

test('Direct circulates bounded source artifacts into a reproducible candidate with exact citations', () => {
  const input = fixture(), result = relations.prepareDirect(input);
  assert.equal(result.profile, relations.PROFILE);
  assert.equal(result.traversals.length, 5);
  assert.equal(result.traversals.at(-1).target, 'Tool');
  assert.equal(result.authority_effect, 'none');
  assert.deepEqual(result, relations.prepareDirect(input));
  assert.ok(result.synthesis.findings.length > 0);
  for (const finding of result.synthesis.findings) {
    const source = sources.find(s => s.source_id === finding.source_id);
    assert.ok(source.text.includes(finding.text));
    assert.equal(finding.source_hash, hash(source));
    assert.ok(result.payload.content.includes(finding.source_id));
  }
  assert.ok(Buffer.byteLength(result.payload.content) <= 4096);
  assert.ok(result.traversals.every(t => t.artifact_reference.startsWith('sha256:') && t.witness_event.kind === 'FORMATION_EVENT'));
  assert.ok(result.traversals.every(t => t.return_linkage.status === 'PENDING'));
});

test('a source bundle cannot drift from the initiating human intent', () => {
  const input = fixture();
  input.sources = structuredClone(input.sources);
  input.sources[0].text += ' An injected claim.';
  assert.throws(() => relations.prepareDirect(input), /SOURCE_BUNDLE_MISMATCH/);
});

test('irrelevant sources produce an explicit unresolved synthesis, never invented findings', () => {
  const input = fixture();
  input.human_intent.body.query = 'volcanoes tectonics';
  const result = relations.prepareDirect(input);
  assert.deepEqual(result.synthesis.findings, []);
  assert.equal(result.synthesis.status, 'INSUFFICIENT_SOURCE_MATCH');
  assert.match(result.payload.content, /No source-grounded finding/);
});

test('the declared per-source, total-source and query budgets are enforced before circulation', () => {
  const input = fixture();
  input.sources[0] = { ...input.sources[0], text: 'x'.repeat(input.substrate.budgets.max_source_bytes + 1) };
  input.human_intent.body.sources_hash = hash(input.sources);
  assert.throws(() => relations.prepareDirect(input), /SOURCE_RESOURCE_LIMIT/);
  input.sources = sources;
  input.human_intent.body.sources_hash = hash(sources);
  input.human_intent.body.query = 'x'.repeat(input.substrate.budgets.max_query_bytes + 1);
  assert.throws(() => relations.prepareDirect(input), /INTENT_RESOURCE_LIMIT/);
});

test('source extraction preserves version numbers inside a complete source sentence', () => {
  const input = fixture();
  input.sources = [{ source_id: 'versioned-source', title: 'Versioned source', uri: 'fixture:version',
    text: 'Local Field v0.1 preserves authority. Returns carry receipts.' }];
  input.human_intent.body.query = 'Local Field authority';
  input.human_intent.body.sources_hash = hash(input.sources);
  const result = relations.prepareDirect(input);
  assert.equal(result.synthesis.findings[0].text, 'Local Field v0.1 preserves authority.');
});
