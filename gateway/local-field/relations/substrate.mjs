import { readFileSync } from 'node:fs';
import { CAPABILITIES, PROFILE, fingerprint as hash } from './types.mjs';

const owners = {
  HMI: './direct.mjs', CCI: './compiler.mjs', Sensorium: './direct.mjs', Memory: './direct.mjs',
  Reasoner: './direct.mjs', Tool: '../../execution/filesystem-executor.mjs',
  Witness: '../index.mjs', ReturnEngine: '../../receipts/receipts.mjs',
};
/** Fresh value so comparison controls can be inspected without changing a global. */
export function fixedSubstrate() {
  return {
    profile: PROFILE,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    components: CAPABILITIES.map(id => ({
      id, provider: owners[id], version: 'si-specimen-001.v0.1',
      implementation_hash: hash({ source: readFileSync(new URL(owners[id], import.meta.url), 'utf8') }),
      settings: id === 'Reasoner' ? { strategy: 'lexical-extractive', adaptive: false } : { mode: 'bounded-direct' },
    })),
    infrastructure_hash: hash(Object.fromEntries([
      './types.mjs', './substrate.mjs', './profile.mjs',
      './possibility.mjs', './compression.mjs', './transduction.mjs',
      '../bilateral.mjs', '../http.mjs', '../../package-lock.json',
      '../../security/local-field-authority.mjs', '../../security/token-manager.mjs',
      '../../security/ed25519.mjs', '../../governance/policy-engine.mjs', '../../ledger/local-store.mjs', '../../ledger/ledger.mjs',
    ].map(path => [path, readFileSync(new URL(path, import.meta.url), 'utf8')]))),
    initial_state: { memory: 'empty-per-run', reasoner: 'stateless', prior_run_context: 'excluded', output: 'absent-required' },
    budgets: { max_sources: 8, max_source_bytes: 8192, max_total_source_bytes: 32768,
      max_findings: 4, max_query_bytes: 512, max_output_bytes: 4096, max_candidate_bytes: 65536 },
  };
}
