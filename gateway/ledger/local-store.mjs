import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildLedgerEntry, verifyLedgerEntries } from './ledger.mjs';

function processStart(pid) {
  if (pid!=='self'&&(!Number.isInteger(pid) || pid <= 0))
    throw new Error('RUNTIME_LEASE_INVALID');
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const start = stat
    .slice(stat.lastIndexOf(')') + 1)
    .trim()
    .split(/\s+/)[19];
  if (!/^[0-9]+$/.test(start)) throw new Error('RUNTIME_LEASE_INVALID');
  return {proc_pid:Number(stat.slice(0,stat.indexOf(' '))),start_time:start};
}

/** Durable local backend for gateway records and the existing ledger format. */
export class LocalStore {
  #db;
  #lease;
  constructor(root,{readOnly=false}={}) {
    if(readOnly){
      this.#db=new DatabaseSync(join(root,'field.sqlite'),{readOnly:true});
      if(!verifyLedgerEntries(this.ledger()).valid){this.close();throw new Error('LEDGER_INTEGRITY');}return;
    }
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const path = join(root, 'field.sqlite');
    this.#db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.#db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS state(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS nonces(domain TEXT NOT NULL,nonce TEXT NOT NULL,PRIMARY KEY(domain,nonce));
      CREATE TABLE IF NOT EXISTS ledger(seq INTEGER PRIMARY KEY AUTOINCREMENT,body TEXT NOT NULL);`);
    if (!verifyLedgerEntries(this.ledger()).valid) {
      this.close();
      throw new Error('LEDGER_INTEGRITY');
    }
  }
  transaction(fn) {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.#db.exec('COMMIT');
      return result;
    } catch (e) {
      this.#db.exec('ROLLBACK');
      throw e;
    }
  }
  acquireLease() {
    this.transaction(() => {
      const prior = this.state('runtime', 'lease');
      const boot_id = readFileSync(
        '/proc/sys/kernel/random/boot_id',
        'utf8',
      ).trim();
      if (prior && (!prior.boot_id || prior.boot_id === boot_id)) {
        let alive = true;
        try {
          const observed = processStart(prior.proc_pid || prior.pid);
          if (prior.start_time && prior.start_time !== observed.start_time) alive = false;
        } catch (e) {
          if (e.code === 'ENOENT') alive = false;
          else throw new Error('RUNTIME_LEASE_INDETERMINATE', { cause: e });
        }
        if (alive) throw new Error('RUNTIME_ALREADY_ACTIVE');
      }
      this.#lease = {
        pid: process.pid,
        token: randomUUID(),
        boot_id,
        ...processStart('self'),
      };
      this.state('runtime', 'lease', this.#lease);
    });
  }
  get(kind, id) {
    const r = this.#db
      .prepare('SELECT body FROM records WHERE kind=? AND id=?')
      .get(kind, id);
    return r ? JSON.parse(r.body) : null;
  }
  all(kind) {
    return this.#db
      .prepare('SELECT body FROM records WHERE kind=? ORDER BY rowid')
      .all(kind)
      .map((r) => JSON.parse(r.body));
  }
  insert(kind, id, value) {
    this.#db
      .prepare('INSERT INTO records VALUES(?,?,?)')
      .run(kind, id, JSON.stringify(value));
    return value;
  }
  state(kind, id, value) {
    if (value !== undefined)
      this.#db
        .prepare(
          'INSERT INTO state VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body',
        )
        .run(kind, id, JSON.stringify(value));
    const r = this.#db
      .prepare('SELECT body FROM state WHERE kind=? AND id=?')
      .get(kind, id);
    return r ? JSON.parse(r.body) : null;
  }
  useNonce(domain, nonce) {
    if (
      this.#db
        .prepare('SELECT 1 FROM nonces WHERE domain=? AND nonce=?')
        .get(domain, nonce)
    )
      throw new Error('REPLAY');
    this.#db.prepare('INSERT INTO nonces VALUES(?,?)').run(domain, nonce);
  }
  ledger() {
    return this.#db
      .prepare('SELECT body FROM ledger ORDER BY seq')
      .all()
      .map((r) => JSON.parse(r.body));
  }
  append(data) {
    const last = this.#db
      .prepare('SELECT body FROM ledger ORDER BY seq DESC LIMIT 1')
      .get();
    const entry = buildLedgerEntry(
      data,
      last ? JSON.parse(last.body).ledger_hash : '0'.repeat(64),
    );
    this.#db
      .prepare('INSERT INTO ledger(body) VALUES(?)')
      .run(JSON.stringify(entry));
    return entry;
  }
  close() {
    if (!this.#db) return;
    if (this.#lease)
      this.transaction(() => {
        if (this.state('runtime', 'lease')?.token === this.#lease.token)
          this.state('runtime', 'lease', null);
      });
    this.#db.close();
    this.#db = null;
  }
}
