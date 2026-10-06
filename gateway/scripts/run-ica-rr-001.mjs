#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const args=process.argv.slice(2),usage='Usage: node scripts/run-ica-rr-001.mjs --serve FRESH_ROOT [--fixture normal|unknown|hold|deny|partial] [--port PORT]';
function parse(){
 if(args.length<2||args[0]!=='--serve')throw new Error(usage);
 const options={root:resolve(args[1]),fixture:'normal',port:0},seen=new Set(['--serve']);
 for(let i=2;i<args.length;i+=2){const flag=args[i],value=args[i+1];if(!['--fixture','--port'].includes(flag)||!value||seen.has(flag))throw new Error(usage);seen.add(flag);
  if(flag==='--fixture')options.fixture=value;else {if(!/^\d+$/.test(value))throw new Error(usage);options.port=Number(value);}}
 if(!['normal','unknown','hold','deny','partial'].includes(options.fixture)||!Number.isInteger(options.port)||options.port<0||options.port>65535||existsSync(options.root))throw new Error(usage+'\nA fresh reference root and declared fixture are required.');return options;
}
let options;try{options=parse();}catch(error){process.stderr.write(error.message+'\n');process.exit(2);}
const {createICAReference}=await import('../local-field/ica/journey.mjs');
const {startICAHost}=await import('../local-field/ica/server.mjs');
const reference=createICAReference({root:options.root,fixture:options.fixture});let host;
try{host=await startICAHost({reference,port:options.port});}catch(error){reference.close();throw error;}
process.stdout.write(`ICA-RR-001 · local reference session\nSource replay and ${options.fixture} fixture; not connected to live Calendar/Git.\nOpen privately: ${host.url}/enter?key=${host.access_token}\nCtrl+C closes the reference session. Persisted register: ${options.root}/ica-register.json\n`);
let stopping=false;async function stop(){if(stopping)return;stopping=true;await host.close();reference.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
