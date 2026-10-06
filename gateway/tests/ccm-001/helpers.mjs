import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setup, signed } from '../helpers/local-field.mjs';
import { hash } from '../../security/local-field-authority.mjs';
export const PROFILE = 'ccm-001.f0.1';
export const ZERO = '0'.repeat(64);
export const participant = id => ({ participant_id: id, participant_kind: 'node', root_lineage: 'development:sourcepoint', status: 'active' });
export const interval = (id, a = 'node-a', b = 'node-b') => ({ interval_id: id, endpoint_a: a, endpoint_b: b,
  relation_type: 'ResearchSynthesis', scope: { actions: ['create_document'], targets: ['hello.txt', 'lawful.txt'], inbound_uses: ['orientation'], cross_interval_uses: ['notification'] },
  boundaries: { cross_interval: 'EXPLICIT_ONLY' }, dependencies: { corpus: 'v1' } });
export function medium(t, fieldPatch = {}, policyPatch = {}) {
  const f = setup(t, 'laptop', policyPatch, {}, { dependencies: { corpus: 'v1', 'ccm-001': PROFILE }, ...fieldPatch });
  assert.equal(typeof f.runtime.ccmCommand, 'function', 'CCM command profile must exist');
  assert.equal(typeof f.runtime.ccmQuery, 'function', 'CCM query profile must exist');
  const query = (name, ...args) => f.runtime.ccmQuery(name, ...args);
  const record = (operation, subject_ref, data, extra = {}) => signed({ ...f.stamp(), type: 'ccm_command', profile: PROFILE,
    issuer: 'I-1', operation, subject_ref, predecessor_hash: query('ShowLineage', subject_ref).head || ZERO,
    dependencies: { corpus: 'v1' }, dependency_hash: query('DependencySnapshot', extra.dependencies || {corpus:'v1'}).hash, data, ...extra }, f.human);
  const command = (operation, subject_ref, data, extra) => f.runtime.ccmCommand(record(operation, subject_ref, data, extra));
  command('participants.register', f.field_id, ['node-a', 'node-b', 'node-c'].map(participant));
  command('intervals.constitute', f.field_id, [interval('I_AB'), interval('I_AC', 'node-a', 'node-c')]);
  const allow = (id = 'I_AB', extra = {}) => {
    const g = f.grant({ purpose: `ccm:${id}:outbound`, ...extra });
    command('standing.transition', id, { interval_id: id, outbound: 'ELIGIBLE', authority_basis: g.grant_id });
    return g;
  };
  const bind = (g, id = 'I_AB', extra = {}) => {
    const p = f.passage(g, { purpose: `ccm:${id}:outbound`, ...extra });
    command('passage.open', id, { interval_id: id, passage: p });
    return p;
  };
  const witness = (p, id='I_AB', patch={}) => signed({ ...f.stamp(), type: 'ccm_observation', source_node: 'node-b',
    interval_id: id, passage_id: p.body.passage_id, subject_hash: hash(p.body), occurrence_ref: 'development:external-observation',
    content_hash: hash(p.body.payload), uncertainty: 'attributed observation, not established truth', ...patch }, f.b);
  const returned = (p, id='I_AB', observation=witness(p,id)) => {
    const return_id = randomUUID();
    command('return.capture', id, { interval_id: id, passage_id: p.body.passage_id, return_id, observation });
    return return_id;
  };
  const orient = (r, id='I_AB', disposition='ADMIT') => command('orientation.judge', id,
    { interval_id: id, return_id: r, disposition, declared_use: 'orientation', reason: 'SourcePoint bounded judgment after provenance review' });
  const operate = p => { f.runtime.admit(p); return f.runtime.execute(p.body.passage_id, p); };
  return { ...f, query, command, record, allow, bind, witness, returned, orient, operate, get runtime(){ return f.runtime; }, restart:()=>f.restart() };
}
