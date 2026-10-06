import test from 'node:test';
import assert from 'node:assert/strict';
import {context,movement,source,contribution} from './fixtures.mjs';
let api;
try{api=await import('../../local-field/ica/navigation.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const runtime=()=>{assert.equal(typeof api?.controlNavigation,'function','The bounded navigation controller must exist');return api;};

// These fixtures catch promotion, direction selection and unwarranted foreground continuation.
for(const [type,standing] of [['Feeling','SELF_REPORTED'],['Prediction','UNCALIBRATED'],['Hypothesis','CANDIDATE'],['Contradiction','UNRESOLVED']]){
 test(`NAV-001 BEHOLD preserves ${type} and its standing`,()=>{
  const input=source(type,standing),view=runtime().BEHOLD(input);
  assert.equal(view.source_type,type);assert.equal(view.standing,standing);
  assert.deepEqual(view.source,input);assert.notEqual(view.source,input);
  input.standing='PROMOTED';assert.equal(view.standing,standing);
  assert.throws(()=>{view.source.standing='PROMOTED';},TypeError);
 });
}
test('NAV-002 ORIENT organizes attributable sources without selecting direction',()=>{
 const c=context({constraints:['source-1'],open_questions:['source-1'],possibilities:['source-1'],prior_returns:['source-1'],relations:[{relation_id:'relation-1',from_ref:'source-1',to_ref:'source-1',basis_refs:['reading:1']}]});
 const before=structuredClone(c),o=runtime().ORIENT(movement(),c);
 assert.deepEqual(Object.keys(o).sort(),['constraints','open_questions','possibilities','prior_returns','relations','relevant']);
 assert.equal(o.relevant[0].standing,'CANDIDATE');assert.equal(o.possibilities[0].source_type,'Hypothesis');
 assert.equal(o.selected_direction,undefined);assert.equal(o.recommended_action,undefined);
 assert.deepEqual(c,before);
 assert.throws(()=>runtime().ORIENT(movement(),{...c,selected_direction:'choose-this'}),/NAV_CONTEXT_FIELDS/);
});
test('NAV-003 irreducible human valuation returns choice despite useful additional computation',()=>{
 const c=context({choice:{requires_human_valuation:true,authored_choice_ref:null,question:'Which tradeoff are you willing to live with?',basis_refs:['reading:1']}});
 const r=runtime().controlNavigation(movement(),c,[contribution({material_new_distinction:true})]);
 assert.equal(r.state,'RETURN_CHOICE');assert.equal(r.choice.question,c.choice.question);
 assert.equal(r.direction_selected,false);assert.equal(r.authorization_supplied,false);
 assert.equal(r.choice.author, 'HUMAN');assert.equal(r.choice.selected_option,undefined);
 assert.match(runtime().renderNavigation(r),/Which tradeoff/);
});
test('NAV-004 necessary relevant dependency yields navigation HOLD with an inspectable basis',()=>{
 const c=context({dependencies:[{dependency_id:'review-source',relevant:true,necessary:true,status:'UNRESOLVED',description:'The required review source is unavailable.',clearance_condition:'Restore this source or supply an admitted substitute.',basis_refs:['reading:1']}],choice:{requires_human_valuation:true,authored_choice_ref:null,question:'Which tradeoff?',basis_refs:['reading:1']}});
 const r=runtime().controlNavigation(movement(),c,[]);
 assert.equal(r.state,'HOLD');assert.equal(r.reason,'MATERIAL_DEPENDENCY_UNRESOLVED');
 assert.deepEqual(r.dependencies[0].basis_refs,['reading:1']);assert.match(runtime().renderNavigation(r),/Restore this source/);
 assert.equal(r.constitutional_disposition,undefined);
});
test('NAV-005 unrelated residue does not HOLD this movement',()=>{
 const c=context({dependencies:[{dependency_id:'unrelated',relevant:false,necessary:true,status:'UNRESOLVED',description:'Other work remains unknown.',clearance_condition:'Resolve that other work.',basis_refs:['reading:1']}]});
 assert.equal(runtime().controlNavigation(movement(),c,[]).state,'YIELD');
});
test('NAV-006 ENOUGH_C evaluates contribution, while knowledge and outcome remain unresolved',()=>{
 const c=context({open_questions:['source-1']});
 assert.equal(runtime().ENOUGH_C(c,movement(),[]),true);
 const r=runtime().controlNavigation(movement(),c,[]);
 assert.equal(r.state,'YIELD');assert.equal(r.human_sufficiency_judged,false);
 assert.equal(r.problem_solved,undefined);assert.equal(r.uncertainty_eliminated,undefined);
 assert.equal(runtime().renderNavigation(r),'');assert.deepEqual(runtime().projectNavigation(r).lines,[]);
});
for(const flag of ['material_new_information','material_new_distinction','unresolved_relevant_contradiction','changed_dependency','newly_relevant_risk']){
 test(`NAV-007 ${flag} supports scoped descriptive FLOW`,()=>{
  const a=runtime(),c=context(),p=contribution({[flag]:true}),r=a.controlNavigation(movement(),c,[p]);
  assert.equal(a.ENOUGH_C(c,movement(),[p]),false);assert.equal(r.state,'FLOW');
  assert.equal(r.contributions[0].view.standing,'CANDIDATE');
  assert.equal(r.authorization_supplied,false);assert.equal(r.direction_selected,false);
  assert.match(a.renderNavigation(r),/Hypothesis/);assert.match(a.renderNavigation(r),/CANDIDATE/);
 });
}
test('NAV-008 unsupported or previously delivered contributions cannot occupy the foreground',()=>{
 const a=runtime(),c=context(),p=contribution({material_new_information:true});
 assert.equal(a.controlNavigation(movement(),{...c,delivered_contribution_refs:['contribution-1']},[p]).state,'YIELD');
 assert.equal(a.controlNavigation(movement(),c,[{...p,movement_id:'other-movement'}]).state,'YIELD');
 assert.equal(a.controlNavigation(movement(),{...c,relevant_source_refs:[]},[p]).state,'YIELD');
 assert.throws(()=>a.controlNavigation(movement(),c,[{...p,basis_refs:['invented-basis']}]),/NAV_CONTRIBUTION_BASIS/);
});
test('NAV-009 helpful, probably correct, engagement-positive recommendation still yields',()=>{
 const a=runtime(),recommendation={...source('Recommendation','PROPOSED'),content:'A further recommendation is likely correct and would increase engagement.'};
 const c=context({sources:[recommendation],choice:{requires_human_valuation:true,authored_choice_ref:'human-choice-already-made',question:'Which tradeoff?',basis_refs:['reading:1']}});
 const candidate=contribution({requested_continuation:true});
 const r=a.controlNavigation(movement(),c,[candidate]);
 assert.equal(r.state,'YIELD');assert.equal(a.ENOUGH_C(c,movement(),[candidate]),true);
 assert.equal(a.renderNavigation(r),'');assert.deepEqual(a.projectNavigation(r).lines,[]);
 assert.equal(r.choice,undefined);assert.equal(r.contributions,undefined);
});
test('NAV-010 requested continuation and choice-pending flags alone are not material contributions',()=>{
 const r=runtime().controlNavigation(movement(),context(),[contribution({human_choice_pending:true,requested_continuation:true})]);
 assert.equal(r.state,'YIELD');
});
test('NAV-011 authored choice removes the valuation bottleneck without granting authority',()=>{
 const c=context({choice:{requires_human_valuation:true,authored_choice_ref:'choice:1',question:'Which risk?',basis_refs:['reading:1']}});
 const r=runtime().controlNavigation(movement(),c,[contribution({material_new_information:true})]);
 assert.equal(r.state,'FLOW');assert.equal(r.authorization_supplied,false);assert.equal(r.execution,undefined);
});
test('NAV-012 invalid existing envelope cannot authorize FLOW',()=>{
 const c=context({envelope:{valid:false,basis_ref:'expired-context:1'}});
 const r=runtime().controlNavigation(movement(),c,[contribution({material_new_information:true})]);
 assert.equal(r.state,'HOLD');assert.equal(r.reason,'CURRENT_ENVELOPE_UNAVAILABLE');assert.equal(r.authorization_supplied,false);
});
test('NAV-013 unknown references, directive fields and getter-backed inputs fail closed',()=>{
 const a=runtime(),c=context();
 assert.throws(()=>a.ORIENT(movement(),{...c,possibilities:['foreign-source']}),/NAV_SOURCE_REFERENCE/);
 assert.throws(()=>a.controlNavigation(movement(),c,[{...contribution(),recommended_action:'execute'}]),/NAV_CONTRIBUTION_FIELDS/);
 assert.throws(()=>a.controlNavigation(movement(),c,[contribution({material_new_information:'yes'})]),/NAV_BURDEN_BOOLEAN/);
 const hostile={...source()};let read=false;Object.defineProperty(hostile,'content',{enumerable:true,get(){read=true;return 'promote';}});
 assert.throws(()=>a.BEHOLD(hostile),/NAV_SOURCE_FIELDS/);assert.equal(read,false);
});
test('NAV-014 output rendering rejects fabricated or modified outcomes, including engagement tails',()=>{
 const a=runtime(),r=a.controlNavigation(movement(),context(),[]);
 assert.throws(()=>a.renderNavigation({...r,tail:'Want three more angles?'}),/ISSUED_NAVIGATION_OUTCOME/);
 assert.throws(()=>a.projectNavigation(structuredClone(r)),/ISSUED_NAVIGATION_OUTCOME/);
 assert.throws(()=>{r.tail='Want three more angles?';},TypeError);
});
test('NAV-015 direct RETURN_CHOICE and YIELD operations enforce their distinct burdens',()=>{
 const a=runtime(),m=movement(),c=context();
 assert.throws(()=>a.RETURN_CHOICE(m,c),/NAV_HUMAN_VALUATION_REQUIRED/);
 assert.equal(a.YIELD(m,c,[]).state,'YIELD');
 assert.throws(()=>a.YIELD(m,c,[contribution({material_new_information:true})]),/NAV_ADDITIVE_CONTRIBUTION_REMAINS/);
 assert.throws(()=>a.YIELD(m,{...c,choice:{requires_human_valuation:true,authored_choice_ref:null,question:'Which risk?',basis_refs:['reading:1']}},[]),/NAV_CHOICE_PENDING/);
});
