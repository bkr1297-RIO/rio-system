import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { medium, interval } from './helpers.mjs';
import { hash } from '../../security/local-field-authority.mjs';
import { buildLedgerEntry, verifyLedgerEntries } from '../../ledger/ledger.mjs';

test('tampered derived event records cannot replace authenticated ledger custody on restart',t=>{
 const f=medium(t);f.runtime.close();const db=new DatabaseSync(join(f.root,'field.sqlite'));
 const row=db.prepare("SELECT id,body FROM records WHERE kind='ccm_event' LIMIT 1").get();
 const body=JSON.parse(row.body);body.data.participant_id='forged';
 db.prepare("UPDATE records SET body=? WHERE kind='ccm_event' AND id=?").run(JSON.stringify(body),row.id);db.close();
 assert.throws(()=>f.restart(),/CCM_EVENT_INTEGRITY/);
});
test('a previously signed standing warrant cannot be appended again after downgrade',t=>{
 const f=medium(t);f.allow();
 f.command('standing.transition','I_AB',{interval_id:'I_AB',outbound:'OBSERVE_ONLY',authority_basis:null});
 const head=f.query('ShowLineage','I_AB').head;f.runtime.close();const db=new DatabaseSync(join(f.root,'field.sqlite'));
 const rows=db.prepare("SELECT body FROM records WHERE kind='ccm_event' ORDER BY rowid").all().map(r=>JSON.parse(r.body));
 const e={...rows.find(e=>e.event_type==='StandingAdmitted'&&e.data.outbound==='ELIGIBLE'),event_id:'replayed-standing-event',previous_hash:head};
 const {event_hash,...body}=e;e.event_hash=hash(body);
 db.prepare('INSERT INTO records VALUES(?,?,?)').run('ccm_event',e.event_id,JSON.stringify(e));
 const ledger=db.prepare('SELECT body FROM ledger ORDER BY seq').all().map(r=>JSON.parse(r.body));
 const appended=buildLedgerEntry({intent_id:e.event_id,action:'ccm_event',agent_id:'I-1',status:e.event_type,detail:JSON.stringify(e)},ledger.at(-1).ledger_hash);
 assert.equal(verifyLedgerEntries([...ledger,appended]).valid,true);
 db.prepare('INSERT INTO ledger(body) VALUES(?)').run(JSON.stringify(appended));db.close();
 assert.throws(()=>f.restart(),/CCM_COMMAND_REPLAY|CCM_EVENT_PREDECESSOR|CCM_EVENT_SOURCE/);
});
test('deleting dependency indexes cannot erase signed native dependency history',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g);
 f.control('dependency',{name:'corpus',value:'v2'});f.control('dependency',{name:'corpus',value:'v1'});
 assert.equal(f.query('WhatMayRightfullyFollow','I_AB',p.body).status,'HOLD');
 f.runtime.close();const db=new DatabaseSync(join(f.root,'field.sqlite'));
 db.prepare("DELETE FROM records WHERE kind='dependency'").run();db.close();f.restart();
 assert.equal(f.query('WhatMayRightfullyFollow','I_AB',p.body).status,'HOLD');
});
test('appending an earlier signed native dependency revision cannot revive old permission',t=>{
 const f=medium(t);f.control('dependency',{name:'corpus',value:'v1'});
 f.command('dependencies.refresh','I_AB',{interval_id:'I_AB',dependencies:{corpus:'v1'}});
 const g=f.allow(),p=f.bind(g);f.control('dependency',{name:'corpus',value:'v2'});f.control('dependency',{name:'corpus',value:'v1'});
 assert.equal(f.query('WhatMayRightfullyFollow','I_AB',p.body).status,'HOLD');f.runtime.close();
 const db=new DatabaseSync(join(f.root,'field.sqlite'));
 const ledger=db.prepare('SELECT body FROM ledger ORDER BY seq').all().map(r=>JSON.parse(r.body)),old=ledger.find(e=>e.action==='dependency');
 const appended=buildLedgerEntry(old,ledger.at(-1).ledger_hash);
 db.prepare('INSERT INTO ledger(body) VALUES(?)').run(JSON.stringify(appended));db.close();
 assert.throws(()=>f.restart(),/CCM_DEPENDENCY_REPLAY/);
});
test('receipt-less native restart Returns use the native verifier, including after reconstruction',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g);f.runtime.admit(p);f.restart();
 assert.equal(f.runtime.inspect(p.body.passage_id).receipt,null);
 assert.ok(f.runtime.inspect(p.body.passage_id).return);
 const r=f.returned(p);assert.equal(f.query('WhatChanged',r).provenance.valid,true);
 f.restart();assert.equal(f.query('WhatChanged',r).status,'KNOWN');
 f.runtime.close();const db=new DatabaseSync(join(f.root,'field.sqlite'));
 const row=db.prepare("SELECT body FROM records WHERE kind='return' AND id=?").get(p.body.passage_id),body=JSON.parse(row.body);
 body.reason='unattributed replacement';
 db.prepare("UPDATE records SET body=? WHERE kind='return' AND id=?").run(JSON.stringify(body),p.body.passage_id);db.close();
 assert.throws(()=>f.restart(),/CCM_NATIVE_RETURN_INVALID/);
});
test('two commands from the same predecessor serialize; the second has no partial mutation',async t=>{
 const f=medium(t);const first=f.record('intervals.constitute',f.field_id,[interval('concurrent-first')]);
 const second=f.record('intervals.constitute',f.field_id,[interval('concurrent-second')]);
 const results=await Promise.allSettled([first,second].map(r=>Promise.resolve().then(()=>f.runtime.ccmCommand(r))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(f.query('ShowLineage','concurrent-second').status,'UNKNOWN');
 f.restart();assert.equal(f.query('ShowLineage','concurrent-first').status,'KNOWN');
});
