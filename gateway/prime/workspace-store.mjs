import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const STATE_FILE = "prime-workspace-state.json";
const LOCK_FILE = "prime-workspace-state.lock";
const TEMP_PREFIX = `${STATE_FILE}.`;
const TEMP_SUFFIX = ".tmp";
const SLEEP_ARRAY = new Int32Array(new SharedArrayBuffer(4));

function emptyState() {
  return { version: 2, revision: 0, latest_proof_id: null, values: {}, rollbacks: {}, proofs: {} };
}

function sleep(ms) {
  Atomics.wait(SLEEP_ARRAY, 0, 0, ms);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function validateState(parsed) {
  if (
    parsed?.version !== 2 ||
    !Number.isInteger(parsed.revision) || parsed.revision < 0 ||
    !parsed.values || typeof parsed.values !== "object" || Array.isArray(parsed.values) ||
    !parsed.rollbacks || typeof parsed.rollbacks !== "object" || Array.isArray(parsed.rollbacks) ||
    !parsed.proofs || typeof parsed.proofs !== "object" || Array.isArray(parsed.proofs)
  ) {
    throw new Error("Prime workspace state is invalid");
  }
  if (parsed.revision === 0 && parsed.latest_proof_id !== null) {
    throw new Error("Prime workspace proof linkage is invalid");
  }
  if (parsed.revision > 0) {
    const latest = parsed.proofs[parsed.latest_proof_id];
    if (!latest || latest.revision !== parsed.revision || latest.proof_id !== parsed.latest_proof_id) {
      throw new Error("Prime workspace committed state is missing durable proof");
    }
  }
  return parsed;
}

export class PrimeWorkspaceStore {
  constructor({
    root = process.env.PRIME_WORKSPACE_ROOT || ".rio-prime-workspace",
    lockTimeoutMs = 2000,
    staleLockMs = 10000,
    faultInjector = null,
  } = {}) {
    this.root = resolve(root);
    this.statePath = resolve(this.root, STATE_FILE);
    this.lockPath = resolve(this.root, LOCK_FILE);
    this.lockTimeoutMs = lockTimeoutMs;
    this.staleLockMs = staleLockMs;
    this.faultInjector = faultInjector;
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.#recover();
  }

  #read() {
    return validateState(JSON.parse(readFileSync(this.statePath, "utf8")));
  }

  #write(state) {
    const tempPath = `${this.statePath}.${process.pid}.tmp`;
    let fd;
    try {
      fd = openSync(tempPath, "w", 0o600);
      writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8" });
      fsyncSync(fd);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    this.faultInjector?.("after_temp_fsync", { tempPath, statePath: this.statePath });
    renameSync(tempPath, this.statePath);
  }

  #readLockOwner() {
    try {
      const parsed = JSON.parse(readFileSync(this.lockPath, "utf8"));
      return { pid: Number(parsed?.pid), acquiredAt: parsed?.acquired_at || null };
    } catch {
      return { pid: null, acquiredAt: null };
    }
  }

  #lockCanBeReclaimed() {
    const owner = this.#readLockOwner();
    if (owner.pid && !processIsAlive(owner.pid)) return true;
    if (owner.pid && processIsAlive(owner.pid)) return false;
    return Date.now() - statSync(this.lockPath).mtimeMs > this.staleLockMs;
  }

  #acquireLock() {
    const deadline = Date.now() + this.lockTimeoutMs;
    while (Date.now() <= deadline) {
      try {
        const fd = openSync(this.lockPath, "wx", 0o600);
        writeFileSync(fd, JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }));
        fsyncSync(fd);
        return fd;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          if (this.#lockCanBeReclaimed()) {
            unlinkSync(this.lockPath);
            continue;
          }
        } catch (lockError) {
          if (lockError.code === "ENOENT") continue;
          throw lockError;
        }
        sleep(10);
      }
    }
    throw new Error("Prime workspace is busy");
  }

  #releaseLock(fd) {
    try { closeSync(fd); } finally {
      try { unlinkSync(this.lockPath); } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  #discardOrphanTemps() {
    for (const name of readdirSync(this.root)) {
      if (name.startsWith(TEMP_PREFIX) && name.endsWith(TEMP_SUFFIX)) unlinkSync(resolve(this.root, name));
    }
  }

  #recover() {
    const fd = this.#acquireLock();
    try {
      this.#discardOrphanTemps();
      if (!existsSync(this.statePath)) this.#write(emptyState());
      this.#read();
    } finally {
      this.#releaseLock(fd);
    }
  }

  transact(mutator) {
    const fd = this.#acquireLock();
    try {
      const state = this.#read();
      const result = mutator(state);
      this.#write(state);
      return result;
    } finally {
      this.#releaseLock(fd);
    }
  }

  #attachProof(state, proof) {
    if (!proof?.proof_id || !proof?.receipt || proof.verification?.valid !== true) {
      throw new Error("A verified durable proof is required for workspace commit");
    }
    if (state.proofs[proof.proof_id]) throw new Error("Durable proof identifier already exists");
    const revision = state.revision + 1;
    state.proofs[proof.proof_id] = { ...structuredClone(proof), revision };
    state.revision = revision;
    state.latest_proof_id = proof.proof_id;
    return revision;
  }

  get(key) {
    const state = this.#read();
    return Object.prototype.hasOwnProperty.call(state.values, key) ? state.values[key] : undefined;
  }

  getProof(proofId) {
    const proof = this.#read().proofs[proofId];
    return proof ? structuredClone(proof) : null;
  }

  setValue(key, value) {
    this.transact((state) => {
      state.values[key] = value;
      state.revision += 1;
      state.latest_proof_id = "UNRECEIPTED_MUTATION";
    });
  }

  atomicSetWithRollback({ key, value, token, expectedHash, createdAt, proof }) {
    return this.transact((state) => {
      const hadPrevious = Object.prototype.hasOwnProperty.call(state.values, key);
      const previousValue = state.values[key];
      state.values[key] = value;
      state.rollbacks[token] = {
        key,
        hadPrevious,
        previousValue,
        expectedHash,
        used: false,
        created_at: createdAt,
        set_proof_id: proof.proof_id,
      };
      const revision = this.#attachProof(state, proof);
      return { hadPrevious, previousValue, revision };
    });
  }

  atomicRollback({ token, hashValue, proofFactory }) {
    return this.transact((state) => {
      const record = state.rollbacks[token];
      if (!record || record.used) throw new Error("Rollback token is invalid or already used");
      if (hashValue(state.values[record.key]) !== record.expectedHash) {
        throw new Error("Sandbox state changed after the receipted mutation");
      }
      const proof = proofFactory(structuredClone(record));
      if (record.hadPrevious) state.values[record.key] = record.previousValue;
      else delete state.values[record.key];
      record.used = true;
      record.used_at = new Date().toISOString();
      record.rollback_proof_id = proof.proof_id;
      const revision = this.#attachProof(state, proof);
      return { record: structuredClone(record), proof: structuredClone(proof), revision };
    });
  }

  snapshot() {
    return structuredClone(this.#read());
  }
}
