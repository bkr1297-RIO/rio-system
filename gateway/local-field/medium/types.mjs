import { hash, requireValue as demand } from '../../security/local-field-authority.mjs';
export const PROFILE = 'ccm-001.f0.1';
export const ZERO = '0'.repeat(64);
export const LIMITS = Object.freeze({ command_bytes: 65536, batch_items: 128 });
export const EVENTS = Object.freeze({
 'participants.register':'ParticipantRegistered', 'intervals.constitute':'IntervalConstituted',
 'standing.transition':'StandingAdmitted', 'passage.open':'PassageOpened',
 'return.capture':'ReturnOpened', 'orientation.judge':'JudgmentRecorded',
 'dependencies.refresh':'DependencyChanged', 'cross.open':'CrossIntervalPassageOpened', 'interval.supersede':'IntervalSuperseded',
});
export function exact(x, keys, code) {
 demand(x && typeof x==='object' && !Array.isArray(x) && hash({keys:Object.keys(x).sort()})===hash({keys:[...keys].sort()}), code);
}
export function id(x, code='CCM_IDENTIFIER') {
 demand(typeof x==='string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x),code);
}
export function digest(x,code='CCM_HASH') { demand(typeof x==='string' && /^[a-f0-9]{64}$/.test(x),code); }
export function dependencies(x) {
 demand(x && typeof x==='object' && !Array.isArray(x),'CCM_DEPENDENCIES');
 for(const [k,v] of Object.entries(x)){id(k);demand(typeof v==='string'&&v.length>0,'CCM_DEPENDENCY_VALUE');}
}
export function Participant(x) {
 exact(x,['participant_id','participant_kind','root_lineage','status'],'CCM_PARTICIPANT_FIELDS'); id(x.participant_id);
 demand(['human','node','model','service','office','institution'].includes(x.participant_kind),'CCM_PARTICIPANT_KIND');
 demand(typeof x.root_lineage==='string'&&x.root_lineage.length>0&&x.status==='active','CCM_PARTICIPANT_LINEAGE');
 return x;
}
export function ConstitutedInterval(x) {
 exact(x,['interval_id','endpoint_a','endpoint_b','relation_type','scope','boundaries','dependencies'],'CCM_INTERVAL_FIELDS');
 for(const k of ['interval_id','endpoint_a','endpoint_b','relation_type'])id(x[k]);
 demand(x.endpoint_a!==x.endpoint_b,'CCM_INTERVAL_ENDPOINTS');
 exact(x.scope,['actions','targets','inbound_uses','cross_interval_uses'],'CCM_SCOPE_FIELDS');
 for(const list of Object.values(x.scope))demand(Array.isArray(list)&&list.every(y=>typeof y==='string'&&y.length>0),'CCM_SCOPE');
 exact(x.boundaries,['cross_interval'],'CCM_BOUNDARIES'); demand(x.boundaries.cross_interval==='EXPLICIT_ONLY','CCM_BOUNDARIES');
 dependencies(x.dependencies); return x;
}
