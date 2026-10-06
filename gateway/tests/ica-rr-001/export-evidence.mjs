/** Explicit evidence runner, using the same authenticated native forms as the human surface. */
import assert from 'node:assert/strict';
import { existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,unlinkSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createICAReference } from '../../local-field/ica/journey.mjs';
import { startICAHost } from '../../local-field/ica/server.mjs';
import { formClient } from './form-client.mjs';
const destination=process.argv[2];if(!destination||process.argv.length!==3||existsSync(resolve(destination)))throw new Error('A fresh evidence directory is required');
const output=resolve(destination);mkdirSync(output,{recursive:true});const results=[];
for(const name of ['normal','unknown','hold','deny','partial','revoke-before-attempt','revoke-after-return','missing-readback','altered-readback',
 'research-unknown','research-hold','research-deny','research-revoke','research-partial','model-contradiction','occupant-replacement']){
 const temp=mkdtempSync(join(tmpdir(),'ica-evidence-')),fixture=name.startsWith('revoke')||name.endsWith('readback')?'normal':name;
 const reference=createICAReference({root:join(temp,'field'),fixture,timestamp:'2026-10-06T00:00:00.000Z'});let host;
 try{
  host=await startICAHost({reference});const client=await formClient(host),steps=[];
  async function step(action){await client.click(action);const v=await client.account();steps.push({human_control:action,phase:v.phase,revision:v.revision});}
  await step('refresh');await step('what');await step('why');
  if(name==='model-contradiction')await step('compare');
  await step('delegate');
  if(name==='occupant-replacement'){await step('replace');await step('delegate');}
  if(name==='revoke-before-attempt'){await step('revoke');await step('acknowledge');}
  else if(!['hold','deny'].includes(name)){
   await step('start');
   if(name==='research-revoke'){await step('revoke');await step('acknowledge');}
   if(name==='missing-readback')unlinkSync(join(reference.root,'artifacts','research-return.json'));
   if(name==='altered-readback')writeFileSync(join(reference.root,'artifacts','research-return.json'),'Different bytes outside the delegated write');
   await step('return');if(name==='revoke-after-return'){await step('revoke');await step('acknowledge');}await step('keep');
  }
  else await step('keep');
  const view=await client.account(),passage_id=view.consequence?.typed_account.passage_id??view.disposition?.passage_id;
  const native=passage_id?reference.runtime.waistQuery(passage_id):null;
  if(['hold','deny'].includes(name)){assert.equal(native.attempt,null);assert.equal(native.latest.disposition,name.toUpperCase());}
  if(name==='unknown'){assert.ok(native.execution);assert.equal(native.observation,null);assert.equal(view.consequence.typed_account.occurrence_knowledge,'UNKNOWN');assert.equal(view.consequence.typed_account.returned.return_completeness,'COMPLETE');}
  if(name==='partial')assert.equal(view.consequence.typed_account.returned.return_completeness,'PARTIAL');
  if(name.endsWith('readback')){assert.equal(view.consequence.typed_account.occurrence_knowledge,'UNKNOWN');assert.equal(view.consequence.typed_account.evidence,null);assert.equal(view.consequence.typed_account.returned.return_completeness,'COMPLETE');}
  if(name.startsWith('revoke'))assert.equal(view.consequence.typed_account.revocation.future_exercise_disabled,true);
  if(name==='research-unknown'){assert.equal(view.research_return.knowledge,'UNKNOWN');assert.equal(view.research_return.return_completeness,'COMPLETE');}
  if(['research-hold','research-deny'].includes(name)){assert.equal(view.research_gate.disposition,name==='research-hold'?'HOLD':'DENY');assert.equal(view.consequence.typed_account.attempt,null);assert.equal(reference.runtime.waistQuery(view.research_gate.native_disposition.passage_id).latest.disposition,view.research_gate.disposition);}
  if(name==='research-partial'){assert.equal(view.research_return.established_findings.length,2);assert.equal(view.research_return.uncertainty.length,1);}
  if(name==='model-contradiction')assert.equal(view.divergence.prior_history_rewritten,false);
  if(name==='occupant-replacement'){assert.equal(view.research_return.inhabitant,'research-worker-2');assert.ok(view.archived_research.length);}
  const dir=join(output,name);mkdirSync(dir);writeFileSync(join(dir,'account.json'),JSON.stringify(view,null,2));
  writeFileSync(join(dir,'native-trace.json'),JSON.stringify(native,null,2));
  if(view.research_gate)writeFileSync(join(dir,'blocked-native-trace.json'),JSON.stringify(reference.runtime.waistQuery(view.research_gate.native_disposition.passage_id),null,2));
  const html=client.html.replace(/<form\b[\s\S]*?<\/form>/g,'').replace('<h1>Observatory</h1>','<h1>Observatory</h1><p>This is a saved, read-only evidence capture. Run the reference host to use its controls.</p>')
   .replace(/<details><summary>Paired journey and machine register[\s\S]*?<footer>/,'<p><a href="account.json">Inspect the complete paired journey and typed machine account</a></p><footer>')
   .replace('href="/account.json"','href="account.json"');
  assert.equal(html.includes(host.access_token),false);assert.equal(/name="csrf"/.test(html),false);writeFileSync(join(dir,'surface.html'),html);
  const artifact=join(reference.root,'artifacts','research-return.json');if(existsSync(artifact))writeFileSync(join(dir,'research-note.json'),readFileSync(artifact));
  const row={name,fixture,fixture_fault:name.endsWith('readback')?name:null,phase:view.phase,steps,reading:view.reading.atmospheric_regime,native_disposition:native?.latest?.disposition??null,native_attempt:native?.attempt?.attempt_id??null,
   occurrence_knowledge:view.consequence?.typed_account.occurrence_knowledge??null,return_completeness:view.consequence?.typed_account.returned?.return_completeness??null,
   outcome:view.consequence?.typed_account.outcome_assessment.status??null,research_work_condition:view.research_return?.work_condition??null,
   research_knowledge:view.research_return?.knowledge??null,research_reporting:view.research_return?.return_completeness??null,
   established_findings:view.research_return?.established_findings.length??0,unknown_findings:view.research_return?.uncertainty.length??0,
   retained_remainders:view.perimeter.items.length,settlement_supplied:false,all_eight_answers_present:view.answers.length===8,passed:true};
  results.push(row);process.stdout.write(`${name}: PASS ${row.phase}, occurrence=${row.occurrence_knowledge??'no attempt'}, Return=${row.return_completeness??'none'}\n`);
 }finally{if(host)await host.close();reference.close();rmSync(temp,{recursive:true,force:true});}
}
writeFileSync(join(output,'fixture-results.json'),JSON.stringify({specimen:'ICA-RR-001',transport:'Authenticated native HTTP forms',browser_engine_used:false,human_acceptance_claimed:false,source:'Labeled timing-only synthetic replay',results},null,2));
