/** Scoped adapters into the existing, explicitly custodied compiler/MUS/RGCB owners. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import profile from '../../../extensions/one-f1-components/F1-PROFILE.json' with {type:'json'};
export { compileResearchExpression,verifyResearchCompilation } from '../../../extensions/one-f1-components/extensions/compiled-occurrence-return/open-arrow/index.mjs';
export { inheritMaterial } from '../../../extensions/one-f1-components/artifacts/rgcb-operator-contracts/src/operators.ts';
export const REPORTING_PROFILE=profile.profile;
export const F1_PROFILE=Object.freeze({...profile,required_reports:Object.freeze(profile.required_reports),source_domains:Object.freeze(profile.source_domains)});
const mus=fileURLToPath(new URL('../../../extensions/one-f1-components/runtime/mus_return_settlement.py',import.meta.url));
export function evaluateReportingSettlement(account,lifecycle,decision,request){
 const result=spawnSync('python3',['-B','-c',`import importlib.util,json,sys
s=importlib.util.spec_from_file_location('mus_return_settlement',sys.argv[1]);m=importlib.util.module_from_spec(s);sys.modules[s.name]=m;s.loader.exec_module(m)
x=json.load(sys.stdin);status,reason,code=m.compute_settlement_status(*x,profile='one.ica.reporting-account.f0.1');print(json.dumps({'status':status,'reason':reason,'reason_code':code}))`,mus],
 {input:JSON.stringify([account,lifecycle,decision,request]),encoding:'utf8',timeout:5000,maxBuffer:65536});
 if(result.error||result.status!==0)throw new Error('NATIVE_MUS_UNAVAILABLE');
 return JSON.parse(result.stdout);
}
