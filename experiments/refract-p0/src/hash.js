import { createHash } from "node:crypto";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function rawSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function gitBlobSha(value) {
  const bytes = Buffer.from(value);
  const header = Buffer.from("blob " + bytes.length + "\0");
  return createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

export function stableId(prefix, ...parts) {
  return prefix + "-" + sha256(parts).slice(0, 24);
}
