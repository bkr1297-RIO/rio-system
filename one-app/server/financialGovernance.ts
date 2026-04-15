/**
 * Phase 2F — Financial Governance Module
 * 
 * Budget pools are governed artifacts — creating, modifying limits,
 * or transferring funds requires approval + receipt.
 * 
 * Invariants:
 * - Budget is a governed artifact, NOT configuration
 * - Limit changes require approval + receipt
 * - Spending rate is calculated, not set
 * - Pool freezes on anomaly detection
 * - All financial movements are recorded in the ledger
 */

import { nanoid } from "nanoid";
import {
  createBudgetPool,
  getBudgetPool,
  updateBudgetPool,
  createFinancialTransaction,
  listFinancialTransactions,
  getFinancialSummary,
  appendLedger,
  createSentinelEvent,
} from "./db";

// ─── Types ───────────────────────────────────────────────────────

export interface CreatePoolRequest {
  name: string;
  initialBalanceCents: number;
  limitCents: number;
  userId: number;
  policyVersion?: string;
  governanceReceiptId?: string;
}

export interface TransferRequest {
  poolId: string;
  amountCents: number;
  description: string;
  proposalId?: string;
  receiptId?: string;
  initiatedBy?: string;
}

export interface LimitChangeRequest {
  poolId: string;
  newLimitCents: number;
  governanceReceiptId: string;
  reason: string;
}

export interface SpendingAnomaly {
  poolId: string;
  currentRate: number;
  baselineRate: number;
  variance: number;
  frozen: boolean;
}

// ─── Pool Lifecycle ──────────────────────────────────────────────

/**
 * Create a new budget pool — this is a governed action.
 * The pool starts with an initial balance and spending limit.
 */
export async function createGovernedBudgetPool(req: CreatePoolRequest) {
  const poolId = `pool_${nanoid(12)}`;

  const pool = await createBudgetPool({
    poolId,
    name: req.name,
    balanceCents: req.initialBalanceCents,
    limitCents: req.limitCents,
    spendingRateCentsPerDay: 0,
    status: "active",
    policyVersion: req.policyVersion ?? null,
    governanceReceiptId: req.governanceReceiptId ?? null,
    userId: req.userId,
  });

  // Record in ledger
  await appendLedger("BUDGET_POOL_CREATED", {
    poolId,
    name: req.name,
    initialBalanceCents: req.initialBalanceCents,
    limitCents: req.limitCents,
    userId: req.userId,
    governanceReceiptId: req.governanceReceiptId,
  });

  // Record initial deposit as a transaction
  if (req.initialBalanceCents > 0) {
    await createFinancialTransaction({
      transactionId: `txn_${nanoid(12)}`,
      budgetPoolId: poolId,
      type: "deposit",
      amountCents: req.initialBalanceCents,
      description: `Initial deposit for pool: ${req.name}`,
      receiptId: req.governanceReceiptId ?? null,
      initiatedBy: "system",
    });
  }

  return pool;
}

/**
 * Change the spending limit on a budget pool — governed action.
 * Requires a governance receipt.
 */
export async function changePoolLimit(req: LimitChangeRequest) {
  const pool = await getBudgetPool(req.poolId);
  if (!pool) throw new Error(`Budget pool ${req.poolId} not found`);

  const oldLimit = pool.limitCents;

  const updated = await updateBudgetPool(req.poolId, {
    limitCents: req.newLimitCents,
    governanceReceiptId: req.governanceReceiptId,
  });

  // Record in ledger
  await appendLedger("BUDGET_POOL_MODIFIED", {
    poolId: req.poolId,
    change: "limit_change",
    oldLimitCents: oldLimit,
    newLimitCents: req.newLimitCents,
    reason: req.reason,
    governanceReceiptId: req.governanceReceiptId,
  });

  // Record as a financial transaction
  await createFinancialTransaction({
    transactionId: `txn_${nanoid(12)}`,
    budgetPoolId: req.poolId,
    type: "limit_change",
    amountCents: req.newLimitCents - oldLimit,
    description: `Limit change: ${oldLimit} → ${req.newLimitCents}. Reason: ${req.reason}`,
    receiptId: req.governanceReceiptId,
    initiatedBy: "governance",
  });

  return updated;
}

// ─── Financial Transfers ─────────────────────────────────────────

/**
 * Execute a financial transfer (withdrawal or deposit).
 * Validates against pool limits and balance.
 */
export async function executeTransfer(req: TransferRequest) {
  const pool = await getBudgetPool(req.poolId);
  if (!pool) throw new Error(`Budget pool ${req.poolId} not found`);

  // Enforce pool status
  if (pool.status === "frozen") {
    throw new Error(`Budget pool ${req.poolId} is frozen — cannot execute transfers`);
  }
  if (pool.status === "depleted") {
    throw new Error(`Budget pool ${req.poolId} is depleted — cannot execute withdrawals`);
  }

  // For withdrawals (negative amounts), check balance and limit
  if (req.amountCents < 0) {
    const withdrawalAmount = Math.abs(req.amountCents);

    if (withdrawalAmount > pool.balanceCents) {
      throw new Error(
        `Insufficient balance: requested ${withdrawalAmount} cents, available ${pool.balanceCents} cents`
      );
    }

    if (pool.limitCents > 0 && withdrawalAmount > pool.limitCents) {
      throw new Error(
        `Transfer exceeds pool limit: requested ${withdrawalAmount} cents, limit ${pool.limitCents} cents`
      );
    }
  }

  // Execute the transfer
  const newBalance = pool.balanceCents + req.amountCents;
  const newStatus = newBalance <= 0 ? "depleted" as const : "active" as const;

  await updateBudgetPool(req.poolId, {
    balanceCents: newBalance,
    status: newStatus,
  });

  // Record the transaction
  const txn = await createFinancialTransaction({
    transactionId: `txn_${nanoid(12)}`,
    budgetPoolId: req.poolId,
    proposalId: req.proposalId ?? null,
    type: req.amountCents >= 0 ? "deposit" : "withdrawal",
    amountCents: req.amountCents,
    description: req.description,
    receiptId: req.receiptId ?? null,
    initiatedBy: req.initiatedBy ?? "system",
  });

  // Record in ledger
  await appendLedger("FINANCIAL_TRANSFER", {
    poolId: req.poolId,
    transactionId: txn?.transactionId,
    amountCents: req.amountCents,
    newBalanceCents: newBalance,
    description: req.description,
    proposalId: req.proposalId,
    receiptId: req.receiptId,
  });

  return {
    transaction: txn,
    newBalance,
    poolStatus: newStatus,
  };
}

// ─── Spending Rate Calculation ───────────────────────────────────

/**
 * Calculate the rolling 30-day spending rate for a pool.
 * This is a read-only observation — it never modifies state.
 */
export async function calculateSpendingRate(poolId: string): Promise<number> {
  const transactions = await listFinancialTransactions(poolId, 200);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  let totalSpent = 0;
  for (const txn of transactions) {
    if (txn.amountCents < 0 && new Date(txn.createdAt).getTime() > thirtyDaysAgo) {
      totalSpent += Math.abs(txn.amountCents);
    }
  }

  return Math.round(totalSpent / 30);
}

// ─── Anomaly Detection ───────────────────────────────────────────

/**
 * Detect spending anomalies — if spending rate deviates significantly
 * from baseline, freeze the pool and create a sentinel event.
 */
export async function detectSpendingAnomaly(
  poolId: string,
  baselineRateCentsPerDay: number,
  thresholdMultiplier: number = 2.0
): Promise<SpendingAnomaly | null> {
  const currentRate = await calculateSpendingRate(poolId);
  const threshold = baselineRateCentsPerDay * thresholdMultiplier;

  if (baselineRateCentsPerDay > 0 && currentRate > threshold) {
    const variance = currentRate / baselineRateCentsPerDay;

    // Freeze the pool
    await updateBudgetPool(poolId, { status: "frozen" });

    // Create sentinel event
    await createSentinelEvent({
      eventId: `se_${nanoid(12)}`,
      type: "anomaly",
      severity: "CRITICAL",
      subject: `spending_rate_anomaly:${poolId}`,
      baseline: { rateCentsPerDay: baselineRateCentsPerDay },
      observed: { rateCentsPerDay: currentRate },
      delta: { variance, thresholdMultiplier },
      context: { poolId, action: "pool_frozen" },
      proposalId: null,
    });

    return {
      poolId,
      currentRate,
      baselineRate: baselineRateCentsPerDay,
      variance,
      frozen: true,
    };
  }

  return null;
}

/**
 * Get a full financial overview for a pool.
 */
export async function getPoolOverview(poolId: string) {
  const pool = await getBudgetPool(poolId);
  if (!pool) return null;

  const summary = await getFinancialSummary(poolId);
  const spendingRate = await calculateSpendingRate(poolId);
  const recentTransactions = await listFinancialTransactions(poolId, 20);

  return {
    pool,
    summary,
    spendingRateCentsPerDay: spendingRate,
    recentTransactions,
    daysUntilDepleted: spendingRate > 0 ? Math.round(pool.balanceCents / spendingRate) : null,
  };
}
