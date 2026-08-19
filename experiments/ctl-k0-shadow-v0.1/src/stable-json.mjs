import { createHash } from "node:crypto";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
