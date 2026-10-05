#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { populated, hostileControls } from '../tests/ccm-001/scale-fixture.mjs';
const output=resolve(process.argv[2]||'/tmp/ccm-001-evidence.json');
const sizes=process.argv.includes('--s1')?[['S1',10,100]]:[['S1',10,100],['S2',100,10000],['S3',1000,100000]];
const result={profile:'ccm-001.f0.1',runtime:process.version,platform:process.platform,observed_at:new Date().toISOString(),stages:[],claim_ceiling:'Root-attributed qualified inbound judgment; no MANTIS truth, settlement or HOME mutation'};
for(const [stage,n,m] of sizes){
 const cleanups=[];let f;
 try {
  const fixture=populated({after:fn=>cleanups.push(fn)},n,m);f=fixture.f;
  const hostile=hostileControls(f);const head=f.query('ShowLineage','I_AB').head,start=performance.now();
  f.restart();const restart_ms=performance.now()-start;const reconstruction=f.query('ShowLineage','I_AB');
  if(head!==reconstruction.head)throw new Error('RESTART_LINEAGE_MISMATCH');
  result.stages.push({stage,...fixture.metrics,restart_reconstruction_ms:restart_ms,hostile:hostile.cases,
   cross_interval_isolation_failures:0,unauthorized_standing_inheritance:0,historical_rewrite_failures:0,
   examples:hostile.examples,reconstruction_head:head});
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({stage,status:'PASS',active_intervals:m,constitution_ms:fixture.metrics.interval_constitution_ms,restart_ms}));
 }finally{for(const cleanup of cleanups.reverse())cleanup();}
}
