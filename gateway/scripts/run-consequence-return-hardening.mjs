#!/usr/bin/env node
/** Explicit development fixture request; never starts a live service or action loop. */
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--demo'){console.error('Usage: node scripts/run-consequence-return-hardening.mjs --demo FRESH_OUTPUT_DIRECTORY');process.exit(2);}
const out=resolve(args[1]);mkdirSync(out,{recursive:false});
const {HOSTILE_FIXTURES,runHostileFixture}=await import('../tests/consequence-return-hardening/fixtures.mjs');
const {renderConsequence}=await import('../local-field/consequence/projection.mjs');
for(const name of HOSTILE_FIXTURES){
 const cleanups=[];try{
  const r=runHostileFixture({after:fn=>cleanups.push(fn)},name);
  const directory=join(out,name);mkdirSync(directory);
  writeFileSync(join(directory,'account.json'),JSON.stringify(r,null,2)+'\n',{flag:'wx'});
  writeFileSync(join(directory,'projection.html'),renderConsequence(r.projection),{flag:'wx'});
  console.log(JSON.stringify({fixture:name,occurrence:r.returned.occurrence_knowledge,outcome:r.returned.outcome_assessment.status,return:r.returned.return_completeness,future_exercise_disabled:r.ack?.future_exercise_disabled??false}));
 }finally{for(const fn of cleanups.reverse())fn();}
}
