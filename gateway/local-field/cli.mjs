#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LocalField } from './index.mjs';
import { createFieldServer } from './http.mjs';

// No key or human root generation. The configured anchor is externally pinned;
// only this receiver's private key is required by the running service.
const [command, configFile] = process.argv.slice(2);
if (command !== 'serve' || !configFile)
  throw new Error('Usage: node local-field/cli.mjs serve CONFIG.json');
const config = JSON.parse(readFileSync(configFile, 'utf8')),
  base = dirname(resolve(configFile));
const keyFile = resolve(base, config.receiver_key_file);
if ((statSync(keyFile).mode & 0o077) !== 0)
  throw new Error('RECEIVER_KEY_PERMISSIONS_MUST_BE_PRIVATE');
const field = new LocalField({
  openArrow: config.open_arrow_library
    ? await import(pathToFileURL(resolve(base, config.open_arrow_library)).href)
    : undefined,
  root: resolve(base, config.state_directory),
  anchor: config.anchor,
  receiver: config.receiver_node,
  signingKey: readFileSync(keyFile, 'utf8').trim(),
  definition: config.definition,
  peers: config.peers,
});
const server = createFieldServer(field);
server.listen(config.port ?? 0, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      status: 'LISTENING',
      url: `http://127.0.0.1:${server.address().port}`,
      field_id: field.status().field.field_id,
      pid: process.pid,
    }),
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(() => {
      field.close();
      process.exit(0);
    }),
  );
server.on('error', (e) => {
  field.close();
  console.error(e.message);
  process.exit(1);
});
