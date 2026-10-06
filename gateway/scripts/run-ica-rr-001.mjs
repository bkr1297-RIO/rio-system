#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const fixtures=['normal','unknown','hold','deny','partial','research-unknown','research-hold','research-deny','research-revoke','research-partial','model-contradiction','occupant-replacement'];
const args=process.argv.slice(2),usage=`Usage: node scripts/run-ica-rr-001.mjs --serve FRESH_ROOT [--fixture ${fixtures.join('|')}] [--port PORT]\n       node scripts/run-ica-rr-001.mjs --resume EXISTING_ROOT [--port PORT]`;
function parse(){
 if(args.length<2||!['--serve','--resume'].includes(args[0]))throw new Error(usage);
 const options={root:resolve(args[1]),fixture:'normal',port:0,resume:args[0]==='--resume'},seen=new Set([args[0]]);
 for(let i=2;i<args.length;i+=2){const flag=args[i],value=args[i+1];if(!['--fixture','--port'].includes(flag)||!value||seen.has(flag))throw new Error(usage);seen.add(flag);
  if(flag==='--fixture'){if(options.resume)throw new Error(usage);options.fixture=value;}else {if(!/^\d+$/.test(value))throw new Error(usage);options.port=Number(value);}}
 if(!fixtures.includes(options.fixture)||!Number.isInteger(options.port)||options.port<0||options.port>65535||existsSync(options.root)!==options.resume)throw new Error(usage+'\nUse a fresh root for --serve or its existing custody for --resume.');return options;
}
let options;try{options=parse();}catch(error){process.stderr.write(error.message+'\n');process.exit(2);}
const {createICAReference,reopenICAReference}=await import('../local-field/ica/journey.mjs');
const {startICAHost}=await import('../local-field/ica/server.mjs');
const reference=options.resume?reopenICAReference({root:options.root}):createICAReference({root:options.root,fixture:options.fixture});let host;
try{host=await startICAHost({reference,port:options.port});}catch(error){reference.close();throw error;}
process.stdout.write(`ICA-RR-001 · local reference session\nSource replay and ${options.fixture} fixture; not connected to live Calendar/Git.\nOpen privately: ${host.url}/enter?key=${host.access_token}\nCtrl+C closes the reference session. Persisted register: ${options.root}/ica-register.json\n`);
let stopping=false;async function stop(){if(stopping)return;stopping=true;await host.close();reference.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
