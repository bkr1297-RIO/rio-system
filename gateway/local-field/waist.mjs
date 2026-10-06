import { requireValue } from '../security/local-field-authority.mjs';

// Conformance helpers only. LocalField and its native owners perform all gates.
export const WAIST_PROFILE = 'constitutional-waist.f0.1';
export const HOLD_ACTIONS = Object.freeze(['PROBE','RECALIBRATE','REQUEST_SOURCEPOINT','REPAIR_LINEAGE','WAIT','REPLAN','WITHDRAW']);
export function exactFields(body, keys, code) {
  requireValue(body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).length === keys.length && keys.every(k => Object.hasOwn(body,k)), code);
}
export const NODE_FIELDS = ['field_id','record_id','issued_at','expires_at','type','source_node'];
export const ROOT_FIELDS = ['field_id','record_id','issued_at','expires_at','type','issuer'];
export function passageContract(p,w) {
  exactFields(w,['profile','interval_id','uncertainty','obligations'],'WAIST_CONTRACT');
  requireValue(w.profile===WAIST_PROFILE && typeof w.interval_id==='string' && w.interval_id.length>0 &&
    p.purpose===`ccm:${w.interval_id}:outbound` && typeof w.uncertainty==='string' && w.uncertainty.length>0 && w.uncertainty.length<=2048 &&
    Array.isArray(w.obligations) && w.obligations.length>0 && w.obligations.length<=16 &&
    w.obligations.every(x=>typeof x==='string'&&x.length>0&&x.length<=256) &&
    p.return_requirement?.required===true, 'WAIST_CONTRACT');
  return w;
}
export function blockedDisposition(error) {
  // Only explicit recoverable native burdens become HOLD. Invalid standing,
  // binding, signatures and scopes are not optimistically reinterpreted.
  const recoverable = new Set(['CCM_INTERVAL_OBSERVE_ONLY','CCM_DEPENDENCY_CHANGED','CCM_DEPENDENCY_REVISION_CHANGED']);
  if (error.policy && error.policy.governance_decision!=='AUTO_DENY') return 'HOLD';
  return recoverable.has(error.message) ? 'HOLD' : 'DENY';
}
