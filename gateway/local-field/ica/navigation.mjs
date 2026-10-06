/** Bounded orientation controller. It has no passage, executor or authority owner. */
import {exactData,exactArray,requireCondition,fingerprint} from '../meteorology/signals.mjs';
import {freezeData} from '../meteorology/evaluator.mjs';

const issued=new WeakSet();
const MATERIAL=['material_new_information','material_new_distinction','unresolved_relevant_contradiction','changed_dependency','newly_relevant_risk'];
const BURDEN=[...MATERIAL,'human_choice_pending','requested_continuation'];
const GROUPS=['relevant_source_refs','constraints','open_questions','possibilities','prior_returns'];
const text=(v,code)=>requireCondition(typeof v==='string'&&v.trim().length>0&&v.length<=4096,code);
function strings(v,code,maximum=32){exactArray(v,code,maximum);v.forEach(x=>text(x,code));requireCondition(new Set(v).size===v.length,code);}
function validateMovement(m){exactData(m,['movement_id','purpose'],'NAV_MOVEMENT_FIELDS');text(m.movement_id,'NAV_MOVEMENT');text(m.purpose,'NAV_MOVEMENT');}
function validateSource(s){
 exactData(s,['source_id','source_type','standing','content','basis_refs'],'NAV_SOURCE_FIELDS');
 for(const k of ['source_id','source_type','standing','content'])text(s[k],'NAV_SOURCE');
 strings(s.basis_refs,'NAV_SOURCE_BASIS');requireCondition(s.basis_refs.length>0,'NAV_SOURCE_BASIS');
}
function validateContext(c){
 exactData(c,['context_id','envelope','sources',...GROUPS,'relations','dependencies','choice','delivered_contribution_refs'],'NAV_CONTEXT_FIELDS');
 text(c.context_id,'NAV_CONTEXT');exactData(c.envelope,['valid','basis_ref'],'NAV_ENVELOPE_FIELDS');
 requireCondition(typeof c.envelope.valid==='boolean','NAV_ENVELOPE');text(c.envelope.basis_ref,'NAV_ENVELOPE');
 exactArray(c.sources,'NAV_SOURCES',32);c.sources.forEach(validateSource);
 const ids=new Set(c.sources.map(s=>s.source_id));requireCondition(ids.size===c.sources.length,'NAV_DUPLICATE_SOURCE');
 for(const key of GROUPS){strings(c[key],'NAV_SOURCE_REFERENCES');requireCondition(c[key].every(id=>ids.has(id)),'NAV_SOURCE_REFERENCE');}
 const bases=new Set([c.envelope.basis_ref,...ids,...c.sources.flatMap(s=>s.basis_refs)]);
 const basis=(refs,code)=>{strings(refs,code);requireCondition(refs.length>0&&refs.every(ref=>bases.has(ref)),code);};
 exactArray(c.relations,'NAV_RELATIONS',32);
 for(const r of c.relations){exactData(r,['relation_id','from_ref','to_ref','basis_refs'],'NAV_RELATION_FIELDS');text(r.relation_id,'NAV_RELATION');requireCondition(ids.has(r.from_ref)&&ids.has(r.to_ref),'NAV_SOURCE_REFERENCE');basis(r.basis_refs,'NAV_RELATION_BASIS');}
 exactArray(c.dependencies,'NAV_DEPENDENCIES',32);
 for(const d of c.dependencies){
  exactData(d,['dependency_id','relevant','necessary','status','description','clearance_condition','basis_refs'],'NAV_DEPENDENCY_FIELDS');
  for(const k of ['dependency_id','description','clearance_condition'])text(d[k],'NAV_DEPENDENCY');
  requireCondition(typeof d.relevant==='boolean'&&typeof d.necessary==='boolean'&&['SATISFIED','UNRESOLVED'].includes(d.status),'NAV_DEPENDENCY');basis(d.basis_refs,'NAV_DEPENDENCY_BASIS');
 }
 exactData(c.choice,['requires_human_valuation','authored_choice_ref','question','basis_refs'],'NAV_CHOICE_FIELDS');
 requireCondition(typeof c.choice.requires_human_valuation==='boolean','NAV_CHOICE');
 if(c.choice.authored_choice_ref!==null)text(c.choice.authored_choice_ref,'NAV_CHOICE');
 if(c.choice.question!==null)text(c.choice.question,'NAV_CHOICE');
 strings(c.choice.basis_refs,'NAV_CHOICE_BASIS');requireCondition(c.choice.basis_refs.every(ref=>bases.has(ref)),'NAV_CHOICE_BASIS');
 if(choicePending(c))requireCondition(c.choice.question!==null&&c.choice.basis_refs.length>0,'NAV_CHOICE_BASIS');
 strings(c.delivered_contribution_refs,'NAV_DELIVERED_REFERENCES',64);return c;
}
function choicePending(c){return c.choice.requires_human_valuation&&c.choice.authored_choice_ref===null;}
function blockers(c){return c.dependencies.filter(d=>d.relevant&&d.necessary&&d.status==='UNRESOLVED');}
function ready(c){requireCondition(c.envelope.valid&&blockers(c).length===0,'NAV_HOLD_PENDING');}
function eligible(c,m,candidates){
 exactArray(candidates,'NAV_CONTRIBUTIONS',32);const seen=new Set(),selected=[];
 for(const p of candidates){
  exactData(p,['contribution_id','movement_id','source_ref','burden','basis_refs'],'NAV_CONTRIBUTION_FIELDS');
  text(p.contribution_id,'NAV_CONTRIBUTION');text(p.movement_id,'NAV_CONTRIBUTION');
  requireCondition(!seen.has(p.contribution_id),'NAV_DUPLICATE_CONTRIBUTION');seen.add(p.contribution_id);
  const s=c.sources.find(s=>s.source_id===p.source_ref);requireCondition(s,'NAV_SOURCE_REFERENCE');
  exactData(p.burden,BURDEN,'NAV_BURDEN_FIELDS');requireCondition(BURDEN.every(k=>typeof p.burden[k]==='boolean'),'NAV_BURDEN_BOOLEAN');
  strings(p.basis_refs,'NAV_CONTRIBUTION_BASIS');requireCondition(p.basis_refs.length>0&&p.basis_refs.every(ref=>s.basis_refs.includes(ref)||ref===s.source_id),'NAV_CONTRIBUTION_BASIS');
  if(p.movement_id===m.movement_id&&c.relevant_source_refs.includes(p.source_ref)&&!c.delivered_contribution_refs.includes(p.contribution_id)&&MATERIAL.some(k=>p.burden[k]))selected.push(p);
 }
 return selected;
}
function finish(m,c,detail){
 const value={kind:'HumanNavigationOutcome',profile:'human-navigation.f0.1',movement_ref:m.movement_id,context_ref:c.context_id,
  authorization_supplied:false,standing_change:false,direction_selected:false,human_sufficiency_judged:false,...detail};
 const out=freezeData({outcome_id:fingerprint(value),...value});issued.add(out);return out;
}
export function BEHOLD(source){
 validateSource(source);return freezeData({kind:'SourceView',source_ref:source.source_id,source_type:source.source_type,standing:source.standing,source:structuredClone(source)});
}
export function ORIENT(movement,context){
 validateMovement(movement);validateContext(context);
 const views=refs=>refs.map(ref=>BEHOLD(context.sources.find(s=>s.source_id===ref)));
 return freezeData({relevant:views(context.relevant_source_refs),relations:structuredClone(context.relations),constraints:views(context.constraints),
  open_questions:views(context.open_questions),possibilities:views(context.possibilities),prior_returns:views(context.prior_returns)});
}
export function ENOUGH_C(context,movement,candidate_contributions){
 validateMovement(movement);validateContext(context);return eligible(context,movement,candidate_contributions).length===0;
}
export function RETURN_CHOICE(movement,context){
 validateMovement(movement);validateContext(context);ready(context);requireCondition(choicePending(context),'NAV_HUMAN_VALUATION_REQUIRED');
 return finish(movement,context,{state:'RETURN_CHOICE',reason:'IRREDUCIBLE_HUMAN_VALUATION',choice:{author:'HUMAN',question:context.choice.question,basis_refs:[...context.choice.basis_refs]}});
}
export function YIELD(movement,context,candidate_contributions){
 validateMovement(movement);validateContext(context);ready(context);requireCondition(!choicePending(context),'NAV_CHOICE_PENDING');
 requireCondition(ENOUGH_C(context,movement,candidate_contributions),'NAV_ADDITIVE_CONTRIBUTION_REMAINS');
 return finish(movement,context,{state:'YIELD',reason:'NO_MATERIAL_COUNTERPART_CONTRIBUTION'});
}
export function controlNavigation(movement,context,candidate_contributions){
 validateMovement(movement);validateContext(context);const additions=eligible(context,movement,candidate_contributions),missing=blockers(context);
 if(!context.envelope.valid||missing.length)return finish(movement,context,{state:'HOLD',reason:!context.envelope.valid?'CURRENT_ENVELOPE_UNAVAILABLE':'MATERIAL_DEPENDENCY_UNRESOLVED',dependencies:structuredClone(missing)});
 if(choicePending(context))return RETURN_CHOICE(movement,context);
 if(!additions.length)return YIELD(movement,context,candidate_contributions);
 return finish(movement,context,{state:'FLOW',orientation:ORIENT(movement,context),contributions:additions.map(p=>({contribution_ref:p.contribution_id,burden:structuredClone(p.burden),basis_refs:[...p.basis_refs],view:BEHOLD(context.sources.find(s=>s.source_id===p.source_ref))}))});
}
function validateOutcome(outcome){requireCondition(issued.has(outcome),'ISSUED_NAVIGATION_OUTCOME_REQUIRED');}
export function projectNavigation(outcome){
 validateOutcome(outcome);let lines=[];
 if(outcome.state==='FLOW')lines=outcome.contributions.map(p=>`${p.view.source_type} (${p.view.standing.toLowerCase().replaceAll('_',' ')}): ${p.view.source.content}`);
 if(outcome.state==='HOLD')lines=outcome.dependencies.length?outcome.dependencies.flatMap(d=>[d.description,d.clearance_condition]):['The current operating envelope is unavailable. A current attributable basis is required.'];
 if(outcome.state==='RETURN_CHOICE')lines=[outcome.choice.question];
 return freezeData({kind:'NavigationProjection',outcome_ref:outcome.outcome_id,state:outcome.state,lines});
}
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderNavigation(outcome){
 validateOutcome(outcome);if(outcome.state==='YIELD')return '';
 const p=projectNavigation(outcome);
 const lines=p.lines.map((line,i)=>`<p${outcome.state==='FLOW'?` data-source-type="${esc(outcome.contributions[i].view.source_type)}" data-source-standing="${esc(outcome.contributions[i].view.standing)}"`:''}>${esc(line)}</p>`).join('');
 return `<div data-navigation-foreground="${outcome.state}">${lines}</div>`;
}
