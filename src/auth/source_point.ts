/**
 * ONE/RIO/MUSS Runtime Keel
 * File: src/auth/source_point.ts
 * Status: Candidate Baseline / Runtime Anchor
 *
 * This module establishes the declared human origin context for a proposal.
 * It does not authenticate a person, ratify doctrine, authorize execution,
 * or replace the RIO admissibility boundary.
 */

export type SourcePointId = string & { readonly __brand: 'SourcePointId' };
export type ProposalId = string & { readonly __brand: 'ProposalId' };

export const ZERO_EXECUTION_AUTHORITY = 'NONE' as const;
export const SOURCEPOINT_ORIGIN_DECLARED = 'DECLARED' as const;

export interface SourcePointContext {
  /** Stable identifier for the declared human authority root. */
  readonly sourcePointId: SourcePointId;

  /** Scope declared for this proposal/session. */
  readonly sessionScope: string;

  /** ISO-8601 timestamp at which the origin context was declared. */
  readonly timestamp: string;

  /**
   * Constitutional standing reference, when one is applicable.
   * This is not the source of authority and is not required to form a proposal.
   */
  readonly activeRatificationId: string | null;

  /** Runtime declaration state for the origin context. */
  readonly originStatus: typeof SOURCEPOINT_ORIGIN_DECLARED;

  /** Hard boundary: formation has no execution authority. */
  readonly executionAuthority: typeof ZERO_EXECUTION_AUTHORITY;
}

export interface IntentProposal {
  /** Unique identifier for this transition candidate. */
  readonly proposalId: ProposalId;

  /** Declared human origin context bound to the proposal. */
  readonly sourceContext: SourcePointContext;

  /** Raw intent after intake/transduction; not yet an instruction to execute. */
  readonly intentPayload: Readonly<Record<string, unknown>>;

  /** Informational model metadata only; never an authority input. */
  readonly modelConfidence?: number;

  /** Hard boundary: a proposal is not an authorization. */
  readonly executionAuthority: typeof ZERO_EXECUTION_AUTHORITY;
}

export interface SourcePointDeclaration {
  readonly sourcePointId: string;
  readonly sessionScope: string;
  readonly timestamp?: string;
  readonly activeRatificationId?: string | null;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isIsoTimestamp = (value: string): boolean =>
  !Number.isNaN(Date.parse(value)) && value.includes('T');

const asSourcePointId = (value: string): SourcePointId =>
  value as SourcePointId;

const asProposalId = (value: string): ProposalId =>
  value as ProposalId;

/**
 * Creates an immutable origin envelope.
 *
 * The identifier is a declared reference, not cryptographic proof of identity.
 * Authentication and authorization belong to their own verified boundaries.
 */
export function declareSourcePoint(
  declaration: SourcePointDeclaration
): SourcePointContext {
  const timestamp = declaration.timestamp ?? new Date().toISOString();

  if (!isNonEmptyString(declaration.sourcePointId)) {
    throw new Error('FAIL_CLOSED: Missing Human SourcePoint Origin Context.');
  }

  if (!isNonEmptyString(declaration.sessionScope)) {
    throw new Error('FAIL_CLOSED: Missing SourcePoint session scope.');
  }

  if (!isIsoTimestamp(timestamp)) {
    throw new Error('FAIL_CLOSED: Invalid SourcePoint origin timestamp.');
  }

  return Object.freeze({
    sourcePointId: asSourcePointId(declaration.sourcePointId.trim()),
    sessionScope: declaration.sessionScope.trim(),
    timestamp,
    activeRatificationId: declaration.activeRatificationId ?? null,
    originStatus: SOURCEPOINT_ORIGIN_DECLARED,
    executionAuthority: ZERO_EXECUTION_AUTHORITY
  });
}

/**
 * The Keel invariant.
 *
 * Validates the runtime boundary that must hold before downstream processing.
 * A true result means only that the proposal has a structurally valid origin
 * envelope. It does not mean the proposal is admissible, authorized, or safe
 * to execute.
 */
export function validateSourcePointKeel(
  proposal: IntentProposal
): boolean {
  if (!proposal || typeof proposal !== 'object') {
    throw new Error('FAIL_CLOSED: Missing Intent Proposal.');
  }

  const context = proposal.sourceContext;

  if (!context || typeof context !== 'object') {
    throw new Error('FAIL_CLOSED: Missing Human SourcePoint Origin Context.');
  }

  if (!isNonEmptyString(context.sourcePointId)) {
    throw new Error('FAIL_CLOSED: Missing Human SourcePoint Origin ID.');
  }

  if (!isNonEmptyString(context.sessionScope)) {
    throw new Error('FAIL_CLOSED: Missing SourcePoint session scope.');
  }

  if (!isIsoTimestamp(context.timestamp)) {
    throw new Error('FAIL_CLOSED: Invalid SourcePoint origin timestamp.');
  }

  if (context.originStatus !== SOURCEPOINT_ORIGIN_DECLARED) {
    throw new Error('FAIL_CLOSED: SourcePoint origin is not declared.');
  }

  if (context.executionAuthority !== ZERO_EXECUTION_AUTHORITY) {
    throw new Error('FAIL_CLOSED: SourcePoint context contains execution authority.');
  }

  if (proposal.executionAuthority !== ZERO_EXECUTION_AUTHORITY) {
    throw new Error('FAIL_CLOSED: Intent proposal contains execution authority.');
  }

  if (
    proposal.modelConfidence !== undefined &&
    (!Number.isFinite(proposal.modelConfidence) ||
      proposal.modelConfidence < 0 ||
      proposal.modelConfidence > 1)
  ) {
    throw new Error('FAIL_CLOSED: Model confidence must be between 0 and 1.');
  }

  return true;
}
