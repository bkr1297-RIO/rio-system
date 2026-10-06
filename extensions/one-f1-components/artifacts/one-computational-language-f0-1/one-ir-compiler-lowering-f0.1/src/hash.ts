import { createHash } from "node:crypto";
import type { CompilerIntegrityBlock, Digest, ONEIRProgram, TypedAST } from "./types.ts";

export const CANONICALIZATION = "ONE compiler UTF-16-key safe-integer JSON v0.1.0" as const;

export function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Canonical JSON numbers must be safe integers");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value !== "object") throw new TypeError("Canonical JSON accepts JSON values only");
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function digest(value: unknown): Digest {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}` as Digest;
}

export function rawDigest(value: string | Uint8Array): Digest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as Digest;
}

export function compilerIntegrity(seed: unknown): CompilerIntegrityBlock {
  return {
    schema_id: "urn:one:language:f0.1:common:integrity-block",
    schema_version: "0.1.0",
    language_profile: "F0.1",
    kind: "IntegrityBlock",
    algorithm: "sha256",
    digest: digest(seed),
    canonicalization: CANONICALIZATION,
    signed: false,
    signature_ref: null
  };
}

export function typedAstSeed(ast: TypedAST): unknown {
  return {
    kind: ast.kind,
    profile: ast.profile,
    program_name: ast.program_name,
    source_expression_ref: ast.source_expression_ref,
    source_digest: ast.source_digest,
    fields: ast.fields.map((node) => ({
      kind: node.kind,
      node_id: node.node_id,
      field: node.field,
      semantic_type: node.semantic_type,
      value: node.value,
      source_span: node.source_span
    })),
    authority_effect: ast.authority_effect,
    standing_effect: ast.standing_effect
  };
}

export function typedAstDigest(ast: TypedAST): Digest {
  return digest(typedAstSeed(ast));
}

export function oneIrSeed(ir: ONEIRProgram): unknown {
  const { ir_id: _irId, integrity: _integrity, ...seed } = ir;
  return seed;
}

export function oneIrDigest(ir: ONEIRProgram): Digest {
  return digest(oneIrSeed(ir));
}
