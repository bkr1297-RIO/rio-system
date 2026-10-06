import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../local-field/meteorology/evaluator.mjs';
import { projectMetascope, renderMetascope } from '../local-field/meteorology/projection.mjs';

const usage = 'Use --demo <output-directory> or --signals <FieldSignal-json-file> <output-directory> [--at <UTC-timestamp>].';
try {
  const args = process.argv.slice(2);
  const demo = args[0] === '--demo' && args.length === 2;
  const input = args[0] === '--signals' && (args.length === 3 || (args.length === 5 && args[3] === '--at'));
  if (!demo && !input) throw new Error(usage);
  const path = demo ? fileURLToPath(new URL('../local-field/meteorology/fixture-signals.json', import.meta.url)) : resolve(args[1]);
  const raw = readFileSync(path, 'utf8');
  if (Buffer.byteLength(raw) > 65536) throw new Error('SIGNAL_FILE_TOO_LARGE');
  const signals = JSON.parse(raw);
  // The demo reconstructs a declared synthetic window; supplied observations use current time unless explicitly overridden.
  const timestamp = demo ? '2026-10-06T00:00:00.000Z' : args[4] ?? new Date().toISOString();
  const reading = evaluate(signals, { timestamp }), projection = projectMetascope(reading);
  const output = resolve(demo ? args[1] : args[2]);
  mkdirSync(output, { recursive: true });
  for (const [name, body] of [['fieldoscopy-reading.json', JSON.stringify(reading, null, 2) + '\n'],
    ['metascope-projection.json', JSON.stringify(projection, null, 2) + '\n'], ['metascope.html', renderMetascope(projection)]])
    writeFileSync(join(output, name), body, { flag: 'wx' });
  console.log(JSON.stringify({ source: demo ? 'SYNTHETIC_FIXTURE' : 'BOUNDED_SIGNALS', reading_id: reading.reading_id,
    atmospheric_regime: reading.atmospheric_regime, output }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
