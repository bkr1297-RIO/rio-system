import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/);

const pairs = [
  ["schema/closure-atlas.schema.json", "atlas.json"],
  ["schema/hostile-fixtures.schema.json", "fixtures/hostile.json"],
  ["schema/becoming-spine-crosswalk.schema.json", "becoming-spine-crosswalk.json"]
];

for (const [schemaPath, dataPath] of pairs) {
  const validate = ajv.compile(readJson(schemaPath));
  const data = readJson(dataPath);
  if (!validate(data)) {
    throw new Error(
      `${dataPath} failed ${schemaPath}:\n${JSON.stringify(validate.errors, null, 2)}`
    );
  }
  console.log(`PASS ${dataPath}`);
}
