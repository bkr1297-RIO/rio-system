import fs from "node:fs";

const REQUIRED = [
  "contract_id",
  "view_type",
  "observable_dimensions",
  "must_preserve",
  "may_change",
  "must_not_infer"
];

// Deliberately tiny parser for the P0 contract shape: top-level scalars and string lists only.
export function loadContract(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const output = {};
  let current = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const scalar = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/);
    if (scalar && !line.startsWith(" ")) {
      current = scalar[1];
      output[current] = scalar[2]
        ? scalar[2].replace(/^['"]|['"]$/g, "")
        : [];
      continue;
    }

    const item = line.match(/^\s+-\s+(.+?)\s*$/);
    if (item && current) {
      if (!Array.isArray(output[current])) output[current] = [];
      output[current].push(item[1].replace(/^['"]|['"]$/g, ""));
      continue;
    }

    throw new Error("INVALID_CONTRACT_SYNTAX: " + raw);
  }

  for (const key of REQUIRED) {
    if (!(key in output)) throw new Error("INVALID_CONTRACT: missing " + key);
  }

  return output;
}
