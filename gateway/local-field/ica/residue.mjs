/** Typed unfinished reality. Attention moves it; no discharge or standing operation exists here. */
import {randomUUID} from 'node:crypto';
import {freezeData} from '../meteorology/evaluator.mjs';
const STATES={RESOURCE_REMAINDER:'WATCHING',OBLIGATION_REMAINDER:'OWED',UNCERTAINTY_REMAINDER:'UNRESOLVED',FORECLOSED_OPTION_RECORD:'CHANGED'};
export class RemainderRegister{
 #items=[];#events=[];#position='NOW';
 retain(kind,text,basis_ref,attention=STATES[kind]){
  if(!Object.hasOwn(STATES,kind)||typeof text!=='string'||!text||text.length>512||typeof basis_ref!=='string'||!basis_ref||basis_ref.length>200||
   !['HELD','WATCHING','UNRESOLVED','OWED','CHANGED'].includes(attention))throw new Error('REMAINDER_CONTRACT');
  const existing=this.#items.find(x=>x.remainder_kind===kind&&x.text===text&&x.basis_ref===basis_ref);if(existing)return existing;
  if(this.#items.length>=32)throw new Error('REMAINDER_BOUND');
  const r=freezeData({kind:'Remainder',remainder_id:randomUUID(),remainder_kind:kind,text,basis_ref,attention,
   created_at:new Date().toISOString(),status:'RETAINED',discharge_basis:null});this.#items.push(r);return r;
 }
 move(){this.#position=this.#position==='NOW'?'PERIMETER':'NOW';this.#events.push(freezeData({kind:'AttentionMovement',movement_id:randomUUID(),position:this.#position,
  remainder_refs:this.#items.map(x=>x.remainder_id),authority_effect:'NONE',lineage_effect:'NONE',evidence_effect:'NONE'}));}
 view(){return freezeData({kind:'PerimeterTray',position:this.#position,items:[...this.#items],events:[...this.#events],authority_effect:'NONE',
  rule:'Discrepancy returns, remains, or is lawfully discharged; attention movement is not discharge'});}
}
