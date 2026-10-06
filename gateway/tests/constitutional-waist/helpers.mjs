import { medium } from '../ccm-001/helpers.mjs';
import { signed } from '../helpers/local-field.mjs';
import { hash } from '../../security/local-field-authority.mjs';
import { randomUUID } from 'node:crypto';

export const PROFILE = 'constitutional-waist.f0.1';
export function waist(t, policy = {}) {
  const f = medium(t, { dependencies: { corpus: 'v1', 'ccm-001': 'ccm-001.f0.1', 'constitutional-waist': PROFILE } }, policy);
  const contract = { profile: PROFILE, interval_id: 'I_AB', uncertainty: 'Bounded development create; exterior truth is unestablished.',
    obligations: ['independent-readback', 'native-return'] };
  const candidate = (g = f.allow(), patch = {}, content = contract, formationPatch = {}) => {
    const candidate_id=randomUUID();
    f.runtime.candidate(signed({...f.stamp(),type:'candidate',source_node:'node-a',candidate_id,kind:'proposal',content,...formationPatch},f.a));
    return f.bind(g,'I_AB',{origin:{intent:'SourcePoint-authorized bounded waist specimen',candidate_id},...patch});
  };
  const commitRecord = (p, d, patch = {}, key = f.human, issuer = 'I-1') => signed({ ...f.stamp(), type: 'invocation_commit', issuer,
    passage_id: p.body.passage_id, passage_hash: hash(p.body), decision_id: d.decision_id, ...patch }, key);
  const commit = (p, d, patch) => f.runtime.control(commitRecord(p, d, patch));
  const invocation = (p, c, patch = {}, key = f.a) => signed({ ...f.stamp(), type: 'invocation', source_node: 'node-a',
    passage_id: p.body.passage_id, passage_hash: hash(p.body), commitment_id: c.commitment_id, passage: p, ...patch }, key);
  const observeRecord = (p, e, patch = {}) => signed({ ...f.stamp(), type: 'observation_request', source_node: 'node-a',
    passage_id: p.body.passage_id, execution_id: e.execution_id, ...patch }, f.a);
  const stepRecord = (p, d, action = 'PROBE', patch = {}) => signed({ ...f.stamp(), type: 'hold_action', source_node: 'node-a',
    passage_id: p.body.passage_id, decision_id: d.decision_id, action, ...patch }, f.a);
  const view = p => f.runtime.waistQuery(p.body.passage_id);
  const run = p => { const d = f.runtime.admit(p), c = commit(p, d), e = f.runtime.invoke(invocation(p,c));
    const r = f.runtime.observe(observeRecord(p,e)); return { d,c,e,r,trace:view(p) }; };
  return { ...f, contract, candidate, commitRecord, commit, invocation, observeRecord, stepRecord, view, run,
    get runtime() { return f.runtime; }, restart: () => f.restart() };
}
