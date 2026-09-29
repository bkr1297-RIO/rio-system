// Test-only crash injection. Invoke the real native write, then kill the process
// before observation/receipt. No successful execution or observation is mocked.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { LocalField } from '../../local-field/index.mjs';
const { passage, ...config } = JSON.parse(
  fs.readFileSync(process.argv[2], 'utf8'),
);
const field = new LocalField(config);
field.admit(passage);
const nativeWrite = fs.writeFileSync;
fs.writeFileSync = (path, data, ...rest) => {
  const result = nativeWrite(path, data, ...rest);
  if (data === passage.body.payload.content)
    process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();
field.execute(passage.body.passage_id, passage);
throw new Error('CRASH_INJECTION_DID_NOT_FIRE');
