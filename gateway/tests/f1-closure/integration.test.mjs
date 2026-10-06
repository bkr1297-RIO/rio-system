import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createICAReference } from '../../local-field/ica/journey.mjs';
const act=(f,action)=>f.journey.dispatch({action,expected_revision:f.journey.view().revision,request_id:randomUUID()});
function episode(t,fixture='normal'){const dir=mkdtempSync(join(tmpdir(),'f1-join-')),f=createICAReference({root:join(dir,'field'),fixture});t.after(()=>{f.close();rmSync(dir,{recursive:true,force:true});});for(const a of ['refresh','delegate','start','return'])act(f,a);return f;}
test('actual Research passage descends from conserved native AST and IR',t=>{
 const f=episode(t),v=f.journey.view();assert.equal(v.compilation.frames.length,4);
 const trace=f.runtime.inspect(v.consequence.typed_account.permission.passage_id);
 assert.deepEqual(trace.passage.body.payload,v.compilation.oa_ir.request.payload);
 assert.ok(trace.passage.body.origin.candidate_id);assert.equal(v.compilation.oa_ir.native_ir_ref,v.compilation.ir.ir_id);
 assert.ok(v.register.some(x=>x.transition==='COMPILE'));assert.equal(v.settlement,null);
});
test('MUS settlement requires a fresh separate human command, preserves unknowns and residue, then RGCB needs another command',t=>{
 const f=episode(t,'unknown'),before=f.journey.view(),nativeBefore=f.runtime.status().bindings;
 assert.ok(before.allowed_commands.includes('accept-report'));assert.equal(before.successor,null);
 const settled=act(f,'accept-report');assert.equal(settled.settlement.status,'SETTLED_RETURN');assert.equal(settled.settlement.scope,'REPORTING_ACCOUNT_ONLY');
 assert.equal(settled.consequence.typed_account.occurrence_knowledge,'UNKNOWN');assert.equal(settled.research_return.outcome_assessment,'UNRESOLVED');assert.deepEqual(settled.perimeter,before.perimeter);assert.equal(settled.successor,null);
 assert.equal(settled.consequence.typed_account.settlement,null);assert.deepEqual(f.runtime.status().bindings,nativeBefore);
 const inherited=act(f,'admit-account');assert.equal(inherited.successor.authorityEffect,'NONE');assert.equal(inherited.successor.kind,'InheritanceRecord');assert.deepEqual(inherited.perimeter,before.perimeter);assert.deepEqual(f.runtime.status().bindings,nativeBefore);
 assert.throws(()=>act(f,'accept-report'),/COMMAND_NOT_AVAILABLE/);assert.throws(()=>act(f,'admit-account'),/COMMAND_NOT_AVAILABLE/);
});
test('incomplete reporting does not expose acceptance or successor controls',t=>{
 const f=episode(t,'partial'),v=f.journey.view();assert.equal(v.research_return.return_completeness,'PARTIAL');assert.ok(!v.allowed_commands.includes('accept-report'));assert.ok(!v.allowed_commands.includes('admit-account'));assert.equal(v.settlement,null);
});
test('native root review is signature-bound, single use and cannot authorize another note',t=>{
 const f=episode(t),v=act(f,'accept-report'),r=v.settlement.human_review;
 assert.throws(()=>f.runtime.control(r),/REPLAY/);
 const forged=structuredClone(r);forged.body.record_id=randomUUID();forged.body.account_digest='0'.repeat(64);assert.throws(()=>f.runtime.control(forged),/SIGNATURE/);
 assert.equal(f.runtime.inspect(v.consequence.typed_account.permission.passage_id).attempt.attempt_id,v.consequence.typed_account.attempt.attempt_id);
 assert.ok(!v.allowed_commands.includes('start'));
});
