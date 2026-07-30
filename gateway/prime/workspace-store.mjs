import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_FILE = "prime-workspace-state.json";

function emptyState() {
  return { version: 1, values: {}, rollbacks: {} };
}

export class PrimeWorkspaceStore {
  constructor({ root = process.env.PRIME_WORKSPACE_ROOT || ".rio-prime-workspace" } = {}) {
    this.root = resolve(root);
    this.statePath = resolve(this.root, STATE_FILE);
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    if (!existsSync(this.statePath)) this.#write(emptyState());
    this.#read();
  }

  #read() {
    const parsed = JSON.parse(readFileSync(this.statePath, "utf8"));
    if (parsed?.version !== 1 || typeof parsed.values !== "object" || typeof parsed.rollbacks !== "object") {
      throw new Error("Prime workspace state is invalid");
    }
    return parsed;
  }

  #write(state) {
    const tempPath = `${this.statePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, this.statePath);
  }

  get(key) {
    const state = this.#read();
    return Object.prototype.hasOwnProperty.call(state.values, key) ? state.values[key] : undefined;
  }

  has(key) {
    const state = this.#read();
    return Object.prototype.hasOwnProperty.call(state.values, key);
  }

  setValue(key, value) {
    const state = this.#read();
    state.values[key] = value;
    this.#write(state);
  }

  deleteValue(key) {
    const state = this.#read();
    delete state.values[key];
    this.#write(state);
  }

  createRollback(token, record) {
    const state = this.#read();
    state.rollbacks[token] = record;
    this.#write(state);
  }

  getRollback(token) {
    return this.#read().rollbacks[token] || null;
  }

  markRollbackUsed(token) {
    const state = this.#read();
    if (!state.rollbacks[token]) throw new Error("Rollback token is invalid or already used");
    state.rollbacks[token].used = true;
    this.#write(state);
  }

  snapshot() {
    return structuredClone(this.#read());
  }
}
