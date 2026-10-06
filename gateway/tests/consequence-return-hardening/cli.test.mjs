import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
const runner=new URL('../../scripts/run-consequence-return-hardening.mjs',import.meta.url).pathname;
// A runner ignoring explicit demo intent or writing to an existing destination fails these tests.
test('runner requires an explicit bounded demo request before creating any fixture',()=>{
 const r=spawnSync(process.execPath,[runner],{encoding:'utf8'});assert.equal(r.status,2);assert.match(r.stderr,/Usage:/);assert.equal(r.stdout,'');
});
test('runner refuses an existing output directory before executing fixtures',t=>{
 const root=mkdtempSync(join(tmpdir(),'consequence-cli-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const r=spawnSync(process.execPath,[runner,'--demo',root],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/EEXIST/);assert.deepEqual(readdirSync(root),[]);
});
