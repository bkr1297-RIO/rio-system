import { requireValue } from '../../security/local-field-authority.mjs';
import { canonicalizeArgs } from '../../security/token-manager.mjs';
import { compileRelations } from './compiler.mjs';
import { PROFILE, identifier, exactKeys, freeze, fingerprint as hash } from './types.mjs';

const bytes = value => Buffer.byteLength(value, 'utf8');
const words = value => new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
  .filter(w => w.length > 2 && !['the', 'and', 'how', 'are', 'for', 'with', 'does', 'from'].includes(w)));

export function traversal(operation, artifact, run_id, provenance, witness_event, return_linkage) {
  return {
    traversal_id: hash({ run_id, relation_id: operation.relation_id, artifact }),
    relation_id: operation.relation_id, source: operation.source, target: operation.target,
    artifact_type: operation.artifact_type, artifact_reference: `sha256:${hash(artifact)}`,
    provenance, witness_event, return_linkage,
  };
}

/** Fixed extractive provider. Reads supplied artifacts; performs no network or tool effects. */
export function prepareDirect({ matrix, substrate, human_intent, sources, run_id }) {
  const plan = compileRelations(matrix, substrate), budget = substrate.budgets;
  identifier(run_id, 'RUN_ID');
  const intent = human_intent?.body;
  requireValue(intent?.type === 'research_intent' && typeof intent.query === 'string' &&
    intent.query.trim().length > 0 && bytes(intent.query) <= budget.max_query_bytes, 'INTENT_RESOURCE_LIMIT');
  requireValue(Array.isArray(sources) && sources.length > 0 && sources.length <= budget.max_sources, 'SOURCE_RESOURCE_LIMIT');
  let total = 0;
  const ids = new Set();
  for (const source of sources) {
    exactKeys(source, ['source_id', 'title', 'uri', 'text'], 'SOURCE_FIELDS');
    identifier(source.source_id, 'SOURCE_ID');
    requireValue(!ids.has(source.source_id), 'SOURCE_ID_DUPLICATE');
    ids.add(source.source_id);
    requireValue(typeof source.title === 'string' && bytes(source.title) <= 80 && !/[\r\n]/.test(source.title) &&
      typeof source.uri === 'string' && bytes(source.uri) <= 256 &&
      typeof source.text === 'string' && bytes(source.text) <= budget.max_source_bytes, 'SOURCE_RESOURCE_LIMIT');
    total += bytes(source.text);
  }
  requireValue(total <= budget.max_total_source_bytes, 'SOURCE_RESOURCE_LIMIT');
  requireValue(intent.sources_hash === hash(sources), 'SOURCE_BUNDLE_MISMATCH');
  const query = words(intent.query), matches = [];
  for (const [source_index, source] of sources.entries()) {
    const sentences = source.text.split(/(?<=[.!?])\s+|\r?\n+/u);
    for (const [sentence_index, sentence] of sentences.entries()) {
      const text = sentence.trim(), tokens = words(text);
      const score = [...query].filter(word => tokens.has(word)).length;
      if (score && bytes(text) <= 600) matches.push({ score, source_index, sentence_index,
        finding: { source_id: source.source_id, source_hash: hash(source), text } });
    }
  }
  matches.sort((a, b) => b.score - a.score || a.source_index - b.source_index || a.sentence_index - b.sentence_index);
  const findings = matches.slice(0, budget.max_findings).map(m => m.finding);
  const synthesis = { provider: 'lexical-extractive.v0.1', query: intent.query,
    status: findings.length ? 'SOURCE_GROUNDED' : 'INSUFFICIENT_SOURCE_MATCH', findings,
    truth_status: 'UNESTABLISHED', settlement_status: 'UNSETTLED' };
  const payload = { content: `ResearchSynthesis.Direct\nQuery: ${intent.query.replace(/\s+/g, ' ')}\n\n` +
    (findings.length ? findings.map(f => `- ${f.text}\n  [${f.source_id} sha256:${f.source_hash}]`).join('\n') :
      'No source-grounded finding matched the query.') + '\n' };
  requireValue(bytes(payload.content) <= budget.max_output_bytes, 'SYNTHESIS_RESOURCE_LIMIT');
  const provenance = { human_intent_hash: hash(human_intent), sources_hash: hash(sources),
    sources: sources.map(s => ({ source_id: s.source_id, content_hash: hash(s), uri: s.uri })) };
  const artifacts = [human_intent, { query: intent.query, sources_hash: intent.sources_hash }, sources,
    { query: intent.query, sources: structuredClone(sources) }, { synthesis, payload }];
  const result = {
    profile: PROFILE, kind: 'research-synthesis', run_id, matrix, substrate,
    plan_hash: plan.plan_hash, substrate_hash: plan.substrate_hash, authority_effect: 'none',
    human_intent, sources, synthesis, payload,
    traversals: artifacts.map((artifact, i) => traversal(plan.operations[i], artifact, run_id, provenance,
      { event_id: hash({ run_id, stage: i, artifact }), kind: 'FORMATION_EVENT',
        meaning: 'recorded artifact circulation; not external occurrence' },
      { run_id, status: 'PENDING', requirement: 'native-passage-return' })),
  };
  requireValue(bytes(canonicalizeArgs(result)) <= budget.max_candidate_bytes, 'CANDIDATE_RESOURCE_LIMIT');
  return freeze(structuredClone(result));
}
