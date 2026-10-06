import { fail } from "./diagnostics.ts";
import { digest, rawDigest, typedAstSeed } from "./hash.ts";
import type { SourceSpan, StageResult, TypedAST, TypedField, TypedValue } from "./types.ts";

type TokenKind = "ATOM" | "STRING" | "PUNCT" | "EOF";

interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

export const FIELD_TYPES: Readonly<Record<string, string>> = Object.freeze({
  SOURCE: "ObjectRef",
  BASIS: "ObjectRef",
  BASIS_REVISION: "VersionRef",
  BASIS_DIGEST: "Digest",
  AUTHORITY: "ObjectRef",
  PROPOSAL: "ObjectRef",
  CANDIDATE: "ObjectRef",
  SUBJECT: "ObjectRef",
  ACTION: "String",
  OBJECT: "ObjectRef",
  PAYLOAD: "Digest",
  DELTA: "Digest",
  PURPOSE: "String",
  SCOPE: "List<ObjectRef>",
  JURISDICTION: "ObjectRef",
  CONTEXT: "ObjectRef",
  POLICY: "ObjectRef",
  POLICY_REVISION: "VersionRef",
  POLICY_DIGEST: "Digest",
  EVIDENCE_PLAN: "ObjectRef",
  EVIDENCE_OBLIGATIONS: "List<ObjectRef>",
  RETURN_OBLIGATION: "ObjectRef",
  PROPOSER: "ObjectRef",
  EVALUATOR: "ObjectRef",
  EXECUTOR: "ObjectRef",
  WORLD_EFFECTS: "List<String>",
  CONSTITUTIONAL_EFFECTS: "List<String>",
  EPISTEMIC_EFFECTS: "List<String>",
  EXTERNAL_EFFECT: "Boolean",
  STANDING_EFFECT: "Boolean",
  MAX_CONSEQUENCE: "Consequence",
  CREATED_AT: "Timestamp",
  EXPIRES_AT: "Timestamp",
  AUTHORIZATION_AT: "Timestamp",
  COMMITMENT_AT: "Timestamp",
  POINT_OF_USE_AT: "Timestamp",
  ATTEMPT_AT: "Timestamp",
  PREDECESSORS: "List<String>",
  LOWER: "LoweringTarget"
});

export const REQUIRED_FIELDS = Object.freeze(Object.keys(FIELD_TYPES));

function byteOffset(source: string, codeUnitOffset: number): number {
  return Buffer.byteLength(source.slice(0, codeUnitOffset), "utf8");
}

function tokenSpan(source: string, token: Token): SourceSpan {
  return { start_byte: byteOffset(source, token.start), end_byte: byteOffset(source, token.end) };
}

function firstUnpairedSurrogate(value: string): number | null {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return index;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return index;
    }
  }
  return null;
}

function hasUnpairedSurrogate(value: string): boolean {
  return firstUnpairedSurrogate(value) !== null;
}

function lex(source: string): StageResult<Token[]> {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/[ \t\r\n]/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === "#") {
      while (index < source.length && source[index] !== "\r" && source[index] !== "\n") index += 1;
      continue;
    }
    if ("{}[],;".includes(character)) {
      tokens.push({ kind: "PUNCT", value: character, start: index, end: index + 1 });
      index += 1;
      continue;
    }
    if (character === '"') {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        if (escaped) escaped = false;
        else if (current === "\\") escaped = true;
        else if (current === "\r" || current === "\n") {
          return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, { start_byte: byteOffset(source, index), end_byte: byteOffset(source, index + 1) }, { expected: "closing quote" });
        }
        else if (current === '"') {
          index += 1;
          const raw = source.slice(start, index);
          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed !== "string") throw new Error("not string");
            if (hasUnpairedSurrogate(parsed)) {
              return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, tokenSpan(source, { kind: "STRING", value: raw, start, end: index }), { expected: "Unicode scalar string" });
            }
            tokens.push({ kind: "STRING", value: parsed, start, end: index });
            break;
          } catch {
            return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, tokenSpan(source, { kind: "STRING", value: raw, start, end: index }), { expected: "JSON string" });
          }
        }
        index += 1;
      }
      if (tokens.length === 0 || tokens[tokens.length - 1].start !== start) {
        return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, { start_byte: byteOffset(source, source.length), end_byte: byteOffset(source, source.length) }, { expected: "closing quote" });
      }
      continue;
    }
    const start = index;
    const match = /^[A-Za-z0-9_.:-]+/.exec(source.slice(index));
    if (!match) {
      const scalar = String.fromCodePoint(source.codePointAt(index)!);
      return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, { start_byte: byteOffset(source, index), end_byte: byteOffset(source, index + scalar.length) }, { observed: scalar });
    }
    const atom = match[0];
    index += atom.length;
    tokens.push({ kind: "ATOM", value: atom, start, end: index });
  }
  tokens.push({ kind: "EOF", value: "EOF", start: source.length, end: source.length });
  return { ok: true, value: tokens };
}

export function fieldByName(ast: TypedAST, field: string): TypedField | undefined {
  return ast.fields.find((item) => item.field === field);
}

export function fieldValue(ast: TypedAST, field: string): TypedValue | undefined {
  return fieldByName(ast, field)?.value;
}

export function parseSource(source: string): StageResult<TypedAST> {
  const invalidScalar = firstUnpairedSurrogate(source);
  if (invalidScalar !== null) {
    const startByte = byteOffset(source, invalidScalar);
    return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, { start_byte: startByte, end_byte: startByte + 3 }, { expected: "Unicode scalar source" });
  }
  const lexed = lex(source);
  if (!lexed.ok) return lexed;
  const tokens = lexed.value;
  let cursor = 0;

  const current = (): Token => tokens[cursor];
  const consume = (): Token => tokens[cursor++];
  const expectedFailure = (expected: string): StageResult<TypedAST> => {
    const token = current();
    return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, tokenSpan(source, token), { expected, observed: token.value });
  };
  const accept = (value: string): boolean => {
    if (current().value !== value) return false;
    consume();
    return true;
  };

  if (!accept("ONE")) return expectedFailure("ONE");
  if (current().kind !== "ATOM") return expectedFailure("language profile");
  const profile = consume().value;
  if (!accept(";")) return expectedFailure(";");
  if (!accept("PROGRAM")) return expectedFailure("PROGRAM");
  if (current().kind !== "ATOM") return expectedFailure("program identifier");
  const programName = consume().value;
  if (!accept("{")) return expectedFailure("{");

  const fields: TypedField[] = [];
  const seen = new Set<string>();

  const parseValue = (): StageResult<{ value: TypedValue; end: Token }> => {
    const token = current();
    if (token.kind === "STRING") {
      consume();
      return { ok: true, value: { value: token.value, end: token } };
    }
    if (token.kind === "ATOM") {
      consume();
      if (token.value === "true") return { ok: true, value: { value: true, end: token } };
      if (token.value === "false") return { ok: true, value: { value: false, end: token } };
      return { ok: true, value: { value: token.value, end: token } };
    }
    if (token.value === "[") {
      consume();
      const values: Array<string | boolean> = [];
      let end = token;
      if (accept("]")) return { ok: true, value: { value: values, end: tokens[cursor - 1] } };
      while (true) {
        const item = current();
        if (item.kind !== "STRING" && item.kind !== "ATOM") {
          return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, tokenSpan(source, item), { expected: "list item", observed: item.value });
        }
        consume();
        values.push(item.value === "true" ? true : item.value === "false" ? false : item.value);
        end = item;
        if (accept("]")) {
          end = tokens[cursor - 1];
          break;
        }
        if (!accept(",")) {
          return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, tokenSpan(source, current()), { expected: ", or ]", observed: current().value });
        }
      }
      return { ok: true, value: { value: values, end } };
    }
    return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/source", null, tokenSpan(source, token), { expected: "field value", observed: token.value });
  };

  while (current().value !== "}") {
    if (current().kind === "EOF") return expectedFailure("}");
    const fieldToken = current();
    if (fieldToken.kind !== "ATOM") return fail("PARSE_UNEXPECTED_TOKEN", "PARSE", "/fields", null, tokenSpan(source, fieldToken), { expected: "WORD", observed: fieldToken.value });
    const field = consume().value;
    if (!Object.hasOwn(FIELD_TYPES, field)) {
      return fail("PARSE_UNKNOWN_FIELD", "PARSE", `/fields/${field}`, null, tokenSpan(source, fieldToken), { field });
    }
    if (seen.has(field)) {
      return fail("PARSE_DUPLICATE_FIELD", "PARSE", `/fields/${field}`, null, tokenSpan(source, fieldToken), { field });
    }
    const parsed = parseValue();
    if (!parsed.ok) return parsed;
    if (!accept(";")) return expectedFailure(";");
    const semicolon = tokens[cursor - 1];
    const ordinal = fields.length + 1;
    fields.push({
      kind: "TypedField",
      node_id: `ast-field:${field.toLowerCase()}:${String(ordinal).padStart(2, "0")}`,
      field,
      semantic_type: FIELD_TYPES[field],
      value: parsed.value.value,
      source_span: { start_byte: byteOffset(source, fieldToken.start), end_byte: byteOffset(source, semicolon.end) }
    });
    seen.add(field);
  }
  consume();
  if (current().kind !== "EOF") return expectedFailure("EOF");

  const sourceDigest = rawDigest(source);
  const sourceExpressionRef = `source-expression:${sourceDigest.slice(-16)}`;
  const draft: TypedAST = {
    kind: "ProgramAST",
    profile,
    ast_id: "",
    program_name: programName,
    source_expression_ref: sourceExpressionRef,
    source_digest: sourceDigest,
    fields,
    ast_digest: "sha256:" as Digest,
    authority_effect: "NONE",
    standing_effect: "NONE"
  };
  const astDigest = digest(typedAstSeed(draft));
  draft.ast_digest = astDigest;
  draft.ast_id = `typed-ast:${astDigest.slice(-16)}`;
  return { ok: true, value: draft };
}

type Digest = `sha256:${string}`;
