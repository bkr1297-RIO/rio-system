import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SchemaIndexEntry {
  group: string;
  type: string;
  id: string;
  path: string;
}

export interface SchemaIndex {
  language_profile: string;
  schema_version: string;
  schemas: SchemaIndexEntry[];
}

export interface ValidationError {
  path: string;
  keyword: string;
  message: string;
}

type JsonSchema = Record<string, any>;

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function same(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function pointer(root: JsonSchema, ref: string): JsonSchema {
  const parts = ref.slice(2).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: any = root;
  for (const part of parts) current = current?.[part];
  if (!current || typeof current !== "object") throw new Error(`Unresolved local schema reference ${ref}`);
  return current;
}

function typeMatches(expected: string, value: unknown): boolean {
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (expected === "integer") return typeof value === "number" && Number.isInteger(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expected;
}

export class SchemaRegistry {
  readonly index: SchemaIndex;
  readonly schemas = new Map<string, JsonSchema>();
  readonly packageRoot: string;

  constructor(packageRoot: string) {
    this.packageRoot = packageRoot;
    this.index = JSON.parse(readFileSync(join(packageRoot, "schemas", "schema-index.json"), "utf8"));
    for (const entry of this.index.schemas) {
      const schema = JSON.parse(readFileSync(join(packageRoot, "schemas", entry.path), "utf8"));
      this.schemas.set(entry.id, schema);
    }
  }

  validate(schemaId: string, instance: unknown): ValidationError[] {
    const schema = this.schemas.get(schemaId);
    if (!schema) return [{ path: "$", keyword: "$ref", message: `Unknown schema ${schemaId}` }];
    return this.validateNode(schema, instance, "$", schema);
  }

  unresolvedReferences(): string[] {
    const unresolved = new Set<string>();
    const visit = (node: unknown, root: JsonSchema): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item, root);
        return;
      }
      const object = node as JsonSchema;
      if (typeof object.$ref === "string") {
        if (object.$ref.startsWith("#/")) {
          try { pointer(root, object.$ref); } catch { unresolved.add(object.$ref); }
        } else if (!this.schemas.has(object.$ref)) {
          unresolved.add(object.$ref);
        }
      }
      for (const value of Object.values(object)) visit(value, root);
    };
    for (const schema of this.schemas.values()) visit(schema, schema);
    return [...unresolved].sort();
  }

  private validateNode(schema: JsonSchema, value: unknown, path: string, root: JsonSchema): ValidationError[] {
    const errors: ValidationError[] = [];
    const fail = (keyword: string, message: string): void => { errors.push({ path, keyword, message }); };

    if (typeof schema.$ref === "string") {
      if (schema.$ref.startsWith("#/")) return this.validateNode(pointer(root, schema.$ref), value, path, root);
      const target = this.schemas.get(schema.$ref);
      if (!target) return [{ path, keyword: "$ref", message: `Unknown schema ${schema.$ref}` }];
      return this.validateNode(target, value, path, target);
    }

    if (Array.isArray(schema.anyOf)) {
      const branches = schema.anyOf.map((candidate: JsonSchema) => this.validateNode(candidate, value, path, root));
      if (!branches.some((branch: ValidationError[]) => branch.length === 0)) fail("anyOf", "No alternative matched");
      if (errors.length) return errors;
    }

    if (schema.const !== undefined && !same(schema.const, value)) fail("const", `Expected ${stable(schema.const)}`);
    if (Array.isArray(schema.enum) && !schema.enum.some((candidate: unknown) => same(candidate, value))) fail("enum", `Value is outside enum`);

    if (typeof schema.type === "string" && !typeMatches(schema.type, value)) {
      fail("type", `Expected ${schema.type}`);
      return errors;
    }

    if (typeof value === "string") {
      if (typeof schema.minLength === "number" && value.length < schema.minLength) fail("minLength", `Expected at least ${schema.minLength} characters`);
      if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) fail("pattern", `Value does not match ${schema.pattern}`);
      if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) fail("format", "Invalid date-time");
    }

    if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) fail("minimum", `Expected >= ${schema.minimum}`);

    if (Array.isArray(value)) {
      if (typeof schema.minItems === "number" && value.length < schema.minItems) fail("minItems", `Expected at least ${schema.minItems} items`);
      if (typeof schema.maxItems === "number" && value.length > schema.maxItems) fail("maxItems", `Expected at most ${schema.maxItems} items`);
      if (schema.uniqueItems === true && new Set(value.map(stable)).size !== value.length) fail("uniqueItems", "Array items must be unique");
      if (schema.items && typeof schema.items === "object") {
        value.forEach((item, index) => errors.push(...this.validateNode(schema.items, item, `${path}[${index}]`, root)));
      }
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (Array.isArray(schema.required)) {
        for (const key of schema.required) if (!(key in record)) errors.push({ path: `${path}.${key}`, keyword: "required", message: "Missing required property" });
      }
      const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
      for (const [key, child] of Object.entries(properties)) {
        if (key in record) errors.push(...this.validateNode(child as JsonSchema, record[key], `${path}.${key}`, root));
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(record)) if (!(key in properties)) errors.push({ path: `${path}.${key}`, keyword: "additionalProperties", message: "Unknown property" });
      }
    }

    if (Array.isArray(schema.allOf)) {
      for (const child of schema.allOf) errors.push(...this.validateNode(child, value, path, root));
    }
    if (schema.if && typeof schema.if === "object") {
      const conditionErrors = this.validateNode(schema.if, value, path, root);
      if (conditionErrors.length === 0 && schema.then) errors.push(...this.validateNode(schema.then, value, path, root));
      if (conditionErrors.length > 0 && schema.else) errors.push(...this.validateNode(schema.else, value, path, root));
    }
    return errors;
  }
}
