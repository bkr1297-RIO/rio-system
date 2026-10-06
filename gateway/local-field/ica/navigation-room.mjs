/** Lower the current ICA account into navigation; never call dispatch or infer intent. */
import {controlNavigation} from './navigation.mjs';
export function navigateRoom(view,{historical=false}={}){
 const readingRef=`FieldoscopyReading:${view.reading.reading_id}`;
 const reading={source_id:readingRef,source_type:'FieldoscopyReading',standing:'CANDIDATE_OBSERVATION',content:view.answers[1].answer,basis_refs:[readingRef]};
 const movement={movement_id:`${view.journey_id}:orientation`,purpose:'Understand this bounded Observatory account'};
 const carried=Boolean(view.orientation||view.successor);
 const context={context_id:`${view.journey_id}:${view.revision}`,envelope:{valid:true,basis_ref:'ICA:OBSERVATION_ONLY'},sources:[reading],relevant_source_refs:[readingRef],relations:[],constraints:[],open_questions:view.reading.unresolved_remainder.length?[readingRef]:[],possibilities:[],prior_returns:[],dependencies:[],
  choice:{requires_human_valuation:false,authored_choice_ref:null,question:null,basis_refs:[]},delivered_contribution_refs:[]};
 const held=view.research_gate?.disposition==='HOLD'?view.research_gate:view.disposition?.disposition==='HOLD'?view.disposition:null;
 if(held&&!historical){
  const basis=`${held.kind??'ConstitutionalDisposition'}:${held.decision_id}`;
  context.sources.push({source_id:basis,source_type:held.kind??'ConstitutionalDisposition',standing:'HOLD',content:view.answers[5].answer,basis_refs:[basis]});
  context.dependencies.push({dependency_id:basis,relevant:true,necessary:true,status:'UNRESOLVED',description:view.answers[5].answer,clearance_condition:held.clearance_condition??`The required current basis must be supplied: ${held.reason??'authorization basis unavailable'}.`,basis_refs:[basis]});
 }
 if(view.research_return){
  const ref=`ResearchReturnArtifact:${view.research_return.return_id}`;
  context.sources.push({source_id:ref,source_type:'ResearchReturnArtifact',standing:'REPORTING_ONLY',content:'Research returned its findings, uncertainty and remaining obligations.',basis_refs:[ref]});
  context.prior_returns.push(ref);
  if(!carried&&!historical)context.choice={requires_human_valuation:true,authored_choice_ref:null,question:'What, if anything, do you want to carry forward from this Return?',basis_refs:[ref]};
 }
 const candidate={contribution_id:`orientation:${view.reading.reading_id}`,movement_id:movement.movement_id,source_ref:readingRef,
  burden:{material_new_information:true,material_new_distinction:false,unresolved_relevant_contradiction:false,changed_dependency:false,newly_relevant_risk:false,human_choice_pending:false,requested_continuation:false},basis_refs:[readingRef]};
 // Delivery belongs to this reading's lineage; old inspection flags cannot consume a new reading.
 const delivered=['INSPECT','EXPLAIN'].every(transition=>view.register.some(e=>e.transition===transition&&e.artifact_ref===readingRef));
 if(historical||carried||delivered)context.delivered_contribution_refs.push(candidate.contribution_id);
 return controlNavigation(movement,context,[candidate]);
}
