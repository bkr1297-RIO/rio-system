import { createHash } from "node:crypto";

import type { IntegrityBlock } from "./types.ts";

export const CANONICALIZATION_PROFILE = "ONE-C14N-JSON-V0.1";

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not admit non-finite numbers.");
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) {
        normalized[key] = normalize(record[key]);
      }
    }
    return normalized;
  }

  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function commit(value: unknown): IntegrityBlock {
  return {
    algorithm: "SHA-256",
    digest: createHash("sha256").update(canonicalize(value), "utf8").digest("hex"),
    canonicalization: CANONICALIZATION_PROFILE,
  };
}

export function verifyCommitment(value: unknown, reference: IntegrityBlock): boolean {
  if (
    reference.algorithm !== "SHA-256" ||
    reference.canonicalization !== CANONICALIZATION_PROFILE
  ) {
    return false;
  }

  return commit(value).digest === reference.digest;
}
