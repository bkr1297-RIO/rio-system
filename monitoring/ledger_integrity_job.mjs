/**
 * RIO Ledger Integrity Scheduled Check (TASK-032)
 * 
 * Lane: DevOps / Infrastructure
 * Owner: Damon
 * 
 * Responsibility: Recomputes the SHA-256 hash chain from genesis to tip every hour.
 * Fail-Closed: If a break is detected, fires a CRITICAL alert immediately.
 */

import crypto from 'crypto';
import { defaultDispatcher } from './alert_dispatcher.mjs';

export class LedgerIntegrityJob {
  constructor(db, config = {}) {
    this.db = db; // Persistent PostgreSQL connection
    this.intervalMs = config.intervalMs || 3600000; // Default: 1 hour
    this.running = false;
    this.lastCheck = null;
    this.lastStatus = 'UNKNOWN';
  }

  /**
   * Start the scheduled integrity check.
   */
  start() {
    if (this.running) return;
    this.running = true;
    console.log('[LEDGER_INTEGRITY_JOB] Started (Interval: ' + this.intervalMs + 'ms)');
    this.run();
    this.timer = setInterval(() => this.run(), this.intervalMs);
  }

  /**
   * Stop the scheduled integrity check.
   */
  stop() {
    this.running = false;
    clearInterval(this.timer);
    console.log('[LEDGER_INTEGRITY_JOB] Stopped');
  }

  /**
   * Execute the integrity check.
   */
  async run() {
    console.log('[LEDGER_INTEGRITY_JOB] Running check...');
    this.lastCheck = new Date();

    try {
      // 1. Fetch all receipts from the ledger, ordered by timestamp/id
      const receipts = await this.db.query('SELECT * FROM receipts ORDER BY id ASC');
      
      if (receipts.length === 0) {
        console.log('[LEDGER_INTEGRITY_JOB] Ledger is empty. Chain is valid.');
        this.lastStatus = 'PASS';
        return;
      }

      let previousHash = '0000000000000000000000000000000000000000000000000000000000000000'; // Genesis
      let chainValid = true;

      // 2. Recompute and verify every link in the chain
      for (const receipt of receipts) {
        // Verify previous_hash link
        if (receipt.previous_hash !== previousHash) {
          chainValid = false;
          await this.handleChainBreak(receipt, previousHash);
          break;
        }

        // Recompute current ledger_hash
        const computedHash = this.computeReceiptHash(receipt);
        if (receipt.ledger_hash !== computedHash) {
          chainValid = false;
          await this.handleHashMismatch(receipt, computedHash);
          break;
        }

        previousHash = receipt.ledger_hash;
      }

      if (chainValid) {
        console.log('[LEDGER_INTEGRITY_JOB] Chain verified successfully. Tip: ' + previousHash);
        this.lastStatus = 'PASS';
        await this.logHealthCheck('PASS', 'Chain verified successfully.');
      } else {
        this.lastStatus = 'FAIL';
      }

    } catch (err) {
      console.error('[LEDGER_INTEGRITY_JOB_ERROR]', err);
      this.lastStatus = 'ERROR';
      await defaultDispatcher.dispatch({
        event_type: 'LDG-002',
        severity: 'CRITICAL',
        details: 'Database offline or query failed: ' + err.message
      });
    }
  }

  computeReceiptHash(receipt) {
    const data = JSON.stringify({
      id: receipt.id,
      previous_hash: receipt.previous_hash,
      intent_hash: receipt.intent_hash,
      approval_signature: receipt.approval_signature,
      timestamp: receipt.timestamp
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async handleChainBreak(receipt, expectedPrevious) {
    console.error('[LEDGER_INTEGRITY_JOB] HASH CHAIN BREAK DETECTED at ID: ' + receipt.id);
    await defaultDispatcher.dispatch({
      event_type: 'LDG-001',
      severity: 'CRITICAL',
      details: 'Hash chain break detected at ID: ' + receipt.id + '. Expected previous: ' + expectedPrevious + ', Found: ' + receipt.previous_hash,
      ledger_entry_id: receipt.id
    });
    await this.logHealthCheck('FAIL', 'Hash chain break detected at ID: ' + receipt.id);
  }

  async handleHashMismatch(receipt, computedHash) {
    console.error('[LEDGER_INTEGRITY_JOB] HASH MISMATCH DETECTED at ID: ' + receipt.id);
    await defaultDispatcher.dispatch({
      event_type: 'LDG-001',
      severity: 'CRITICAL',
      details: 'Hash mismatch detected at ID: ' + receipt.id + '. Computed: ' + computedHash + ', Found: ' + receipt.ledger_hash,
      ledger_entry_id: receipt.id
    });
    await this.logHealthCheck('FAIL', 'Hash mismatch detected at ID: ' + receipt.id);
  }

  async logHealthCheck(status, details) {
    try {
      await this.db.query(
        'INSERT INTO health_checks (check_type, status, details, timestamp) VALUES ($1, $2, $3, $4)',
        ['LEDGER_INTEGRITY', status, details, new Date()]
      );
    } catch (err) {
      console.error('[HEALTH_CHECK_LOG_FAILED]', err);
    }
  }
}
