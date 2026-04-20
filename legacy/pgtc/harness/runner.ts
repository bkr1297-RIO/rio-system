/**
 * PGTC Compliance Runner
 * ═══════════════════════════════════════════════════════════════
 * Exports the system interface and test utilities for the test suite.
 * The actual tests live in /pgtc/test-suite/pgtc.test.ts.
 */

export { system } from "./system";
export type { PGTCPacket, PGTCToken, ExecutionResult, AdapterCall, LedgerEntry } from "./system";
export {
  assertExecution,
  assertLedgerEntry,
  assertHashChainIntegrity,
  assertNoSideEffects,
  assertNonceConsumed,
  assertBlockedEntry,
  assertPrePostRecords,
  assertAdapterBoundary,
} from "./assertions";
export {
  createPacket,
  createBadSignaturePacket,
  createActionPacket,
} from "./test-utils";
