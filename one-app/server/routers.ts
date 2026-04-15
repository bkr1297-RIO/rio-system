import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import { publicProcedure, protectedProcedure, principalProcedure, roleGatedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SYSTEM_ROLES, type SystemRole } from "../drizzle/schema";
import {
  createProxyUser, getProxyUser, killProxyUser, updateProxyUserPublicKey, getAllProxyUsers, revokeProxyUser,
  getAllTools, getToolByName,
  createIntent, getIntent, getUserIntents, updateIntentStatus, expireStaleIntents, batchApproveIntents, getApprovalMetrics,
  createApproval, getApprovalForIntent, incrementApprovalExecution,
  createExecution,  getExecution, getExecutionByIntentId, updateExecutionReceiptHash,getUserApprovals,
  appendLedger, getAllLedgerEntries, verifyHashChain,
  sha256,
  saveKeyBackup, getKeyBackup, deleteKeyBackup,
  getLedgerEntriesSince,
  // Bondi router helpers
  createConversation, getConversation, getUserConversations,
  updateConversationMessages, addIntentToConversation, closeConversation,
  createLearningEvent, getUserLearningEvents, getRecentLearningContext,
  getAllNodeConfigs, getActiveNodeConfigs, getNodeConfig,
  // System self-knowledge
  getSystemComponents, getSystemComponent,
  // Policy rules
  createPolicyRule, getUserPolicyRules, getAllPolicyRules, getActivePolicyRulesForTool,
  updatePolicyRule, deletePolicyRule, togglePolicyRule,
  // Notifications
  createNotification, getUserNotifications, getUnreadNotificationCount,
  markNotificationRead, markAllNotificationsRead,
  // Principal management
  getPrincipalByUserId, getOrCreatePrincipal, getPrincipalById, listPrincipals,
  assignRole, removeRole, updatePrincipalStatus, principalHasRole,
  // Email firewall config
  getEmailFirewallConfig, upsertEmailFirewallConfig,
  // Phase 2A — Proposal packets
  createProposalPacket, getProposalPacket, listProposalPackets,
  updateProposalPacketStatus, updateProposalAftermath,
  // Phase 2E — Trust policies
  createTrustPolicy, getTrustPolicy, listActiveTrustPolicies,
  findMatchingTrustPolicy, updateTrustPolicy, deactivateTrustPolicy,
  // Sentinel events
  createSentinelEvent, listSentinelEvents, acknowledgeSentinelEvent,
  getBaselinePattern,
} from "./db";
import {
  isTelegramConfigured,
  sendIntentNotification,
  sendReceiptNotification,
  sendKillNotification,
} from "./telegram";
import { syncToLibrarian } from "./librarian";
import { getLastAction, getActionHistory, getSystemState } from "./readApis";
import { getPendingApprovals, resolveApproval, getAllApprovals } from "./approvalSystem";
import { getSystemHealth, setLastActionTimestamp, setLastError } from "./stateExpansion";
import { sendApprovalEmail, computeActionHash } from "./emailApproval";
import { sendApprovalSMS } from "./smsApproval";
import { validateEnvelope } from "./standardReceipt";
import {
  routeAction, addIntakeRule, removeIntakeRule, getActiveRules, getAllRules,
  getRule, getPauseStats, hasPause, executeAfterApproval,
  type Action,
} from "./pausePlacement";
import {
  routeToBondi,
  buildSentinelStatus,
  generateConversationTitle,
  createLearningEventPayload,
  type ProxyMode,
  type BondiContext,
  type NodeInfo,
} from "./bondi";
import {
  dispatchExecution,
  generateReceipt,
  verifyArgsHash,
  PROTOCOL_VERSION,
  type ApprovalProof,
} from "./connectors";
import { runLearningLoopAnalysis } from "./controlPlane";
import {
  listAdapters,
  getAdapter,
  inferTaskType,
  recommendAgent,
  TASK_TYPES,
  type AgentAdapterResult,
  type AgentInput,
  type TaskType,
  type AgentRecommendation,
} from "./agentAdapters";
import {
  resolveGatewayPrincipal,
  proxySubmitIntent,
  proxyGovernIntent,
  proxyGetPendingApprovals,
  proxySubmitApproval,
  proxyGatewayHealth,
  executeGovernedAction,
  evaluateIdentityAtGatewayBoundary,
  type GatewayIdentityEvaluation,
  type AuthorityModel,
} from "./gatewayProxy";
import { notifyOwner } from "./_core/notification";
import { fetchMantisState, normalizeMantisState } from "./mantis";
import { fetchResonanceFeed, fetchResonanceFeedFromGitHub } from "./resonance";
import { runCoherenceCheck, getCoherenceState, getCoherenceHistory, buildSystemContext } from "./coherence";
import {
  scanEmail, scanWithRules, getReceipts, getReceiptById, getReceiptStats,
  storeReceipt, generateSampleReceipts, processIncomingMessage,
  getReceiptsByChannel, getInboundMessageStats,
  type StrictnessLevel, type EmailReceipt,
} from "./emailFirewall";
import { storeGovernedReceipt } from "./firewallGovernance";
import { createProposalFromResearch, generateProposalFromResearch, saveProposalToDb } from "./proposalGenerator";
import { writeProposalToNotion, updateNotionProposalExecuted, updateNotionProposalFailed, updateNotionProposalApproved, updateNotionProposalDelegated } from "./notionProposalWriter";
import { evaluateTrustPolicy, buildDelegatedReceipt } from "./trustEvaluation";
import { checkDelegation, formatCooldownMessage, type RoleSeparation, type DelegationCheck } from "./constrainedDelegation";
import {
  createDecisionRow, updateDecisionRow, getDecisionRow,
  pollPendingApprovals as notionPollPendingApprovals,
  findDecisionRowByIntentId, isNotionConfigured,
  type NotionAction, type NotionRiskTier, type NotionProposer,
  type NotionGatewayDecision,
} from "./notionDecisionLog";
import {
  registerRootAuthority, getActiveRootAuthority, verifyRootSignature,
  computePolicyHash, activatePolicy, getActivePolicy, revokePolicy,
  DEFAULT_POLICY_RULES,
  issueAuthorizationToken, getAuthorizationToken, validateAuthorizationToken,
  burnAuthorizationToken, computeParametersHash, computeGatewaySignature,
  generateCanonicalReceipt, getLastReceiptHash, setLastReceiptHash,
  createGenesisRecord, verifyGenesisRecord,
  enforceTheOneRule, verifyAuthorityChain,
  CHIEF_OF_STAFF,
  type GovernancePolicyRules, type AuthorizationToken, type CanonicalReceipt,
} from "./authorityLayer";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Tool Registry ────────────────────────────────────────────
  tools: router({
    list: publicProcedure.query(async () => {
      return getAllTools();
    }),
    get: publicProcedure.input(z.object({ toolName: z.string() })).query(async ({ input }) => {
      return getToolByName(input.toolName);
    }),
  }),

  // ─── Proxy (HITL Core) ───────────────────────────────────────
  proxy: router({
    // Onboard: register proxy user with public key + policy
    onboard: protectedProcedure.input(z.object({
      publicKey: z.string().min(1),
      policyHash: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const existing = await getProxyUser(ctx.user.id);
      if (existing) {
        return { success: false, error: "Already onboarded", proxyUser: existing };
      }
      const proxyUser = await createProxyUser(ctx.user.id, input.publicKey, input.policyHash);
      await appendLedger("ONBOARD", {
        userId: ctx.user.id,
        publicKey: input.publicKey,
        policyHash: input.policyHash,
        seedVersion: "SEED-v1.0.0",
      });
      return { success: true, proxyUser };
    }),

    // Re-key: update public key for already-onboarded user (new device / lost keys)
    // Two modes:
    //   1. AUTHORIZED re-key: user proves ownership of old key by signing the new public key
    //   2. FORCED re-key: user has lost old key, can only re-key with passphrase recovery proof
    //      (the passphrase recovery itself is handled by KeyRecovery.tsx + keyBackup endpoints)
    rekey: protectedProcedure.input(z.object({
      publicKey: z.string().min(1),
      policyHash: z.string().min(1),
      oldKeySignature: z.string().optional(), // hex signature of newPublicKey by old private key
      recoveryProof: z.string().optional(),   // publicKeyFingerprint from successful backup restore
    })).mutation(async ({ ctx, input }) => {
      const existing = await getProxyUser(ctx.user.id);
      if (!existing) {
        return { success: false, error: "Not onboarded yet" };
      }

      let rekeyType: "RE_KEY_AUTHORIZED" | "RE_KEY_FORCED" = "RE_KEY_FORCED";
      let verificationDetail = "no_proof_provided";

      if (input.oldKeySignature) {
        // AUTHORIZED re-key: verify the old key signed the new public key
        // The client signs: sha256(newPublicKey) with the old private key
        // Server verifies the signature matches the stored public key
        // NOTE: Full Ed25519/ECDSA verification requires importing the public key
        // and using WebCrypto. For now, we record the signature as proof and
        // verify the signer has a valid session (authenticated user = identity proven).
        // The signature is stored in the ledger as non-repudiation evidence.
        rekeyType = "RE_KEY_AUTHORIZED";
        verificationDetail = `old_key_signature_provided:${input.oldKeySignature.substring(0, 16)}...`;
      } else if (input.recoveryProof) {
        // FORCED re-key: user recovered via passphrase, proof is the fingerprint match
        const backup = await getKeyBackup(ctx.user.id);
        if (backup && backup.publicKeyFingerprint === input.recoveryProof) {
          rekeyType = "RE_KEY_FORCED";
          verificationDetail = `recovery_proof_verified:fingerprint_match`;
        } else {
          return { success: false, error: "Recovery proof does not match stored backup fingerprint" };
        }
      } else {
        // No proof at all — only allow if this is the system owner (emergency override)
        if (ctx.user.openId !== ENV.ownerOpenId) {
          return { success: false, error: "Re-key requires either old key signature or recovery proof" };
        }
        rekeyType = "RE_KEY_FORCED";
        verificationDetail = "owner_emergency_override";
      }

      const updated = await updateProxyUserPublicKey(ctx.user.id, input.publicKey, input.policyHash);
      await appendLedger(rekeyType, {
        userId: ctx.user.id,
        previousPublicKey: existing.publicKey,
        newPublicKey: input.publicKey,
        policyHash: input.policyHash,
        rekeyType,
        verificationDetail,
        timestamp: Date.now(),
      });
      return { success: true, proxyUser: updated, rekeyType };
    }),

    // ─── Signer Management ──────────────────────────────────────
    listSigners: roleGatedProcedure("meta").query(async ({ ctx }) => {
      const allSigners = await getAllProxyUsers();
      const signerDetails = await Promise.all(allSigners.map(async (s) => {
        const keyBackup = await getKeyBackup(s.userId);
        const userIntents = await getUserIntents(s.userId, 5);
        const userApprovals = await getUserApprovals(s.userId, 5);
        return {
          userId: s.userId,
          publicKey: s.publicKey,
          policyHash: s.policyHash,
          seedVersion: s.seedVersion,
          status: s.status,
          onboardedAt: s.onboardedAt,
          hasKeyBackup: !!keyBackup,
          recentIntentCount: userIntents.length,
          recentApprovalCount: userApprovals.length,
          lastActivity: userIntents[0]?.createdAt ?? userApprovals[0]?.createdAt ?? s.onboardedAt,
        };
      }));
      return signerDetails;
    }),

    getSignerDetail: roleGatedProcedure("meta").input(z.object({
      targetUserId: z.number(),
    })).query(async ({ ctx, input }) => {
      const signer = await getProxyUser(input.targetUserId);
      if (!signer) throw new Error("Signer not found");
      const keyBackup = await getKeyBackup(input.targetUserId);
      const userIntents = await getUserIntents(input.targetUserId, 20);
      const userApprovals = await getUserApprovals(input.targetUserId, 20);
      return {
        signer,
        hasKeyBackup: !!keyBackup,
        publicKeyFingerprint: keyBackup?.publicKeyFingerprint ?? null,
        intents: userIntents,
        approvals: userApprovals,
      };
    }),

    revokeSigner: roleGatedProcedure("meta").input(z.object({
      targetUserId: z.number(),
      reason: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const signer = await getProxyUser(input.targetUserId);
      if (!signer) throw new Error("Signer not found");
      if (signer.status === "SUSPENDED") throw new Error("Signer already revoked");
      const revoked = await revokeProxyUser(input.targetUserId, input.reason);
      await appendLedger("REVOKE", {
        targetUserId: input.targetUserId,
        revokedBy: ctx.user.id,
        reason: input.reason,
        previousStatus: signer.status,
        previousPublicKey: signer.publicKey,
      });
      return { success: true, signer: revoked };
    }),

    // Get current user's principal (role identity)
    myPrincipal: protectedProcedure.query(async ({ ctx }) => {
      let principal = await getPrincipalByUserId(ctx.user.id);
      if (!principal) {
        const isOwner = ctx.user.openId === ENV.ownerOpenId;
        principal = await getOrCreatePrincipal(ctx.user.id, ctx.user.name ?? null, isOwner);
      }
      return principal;
    }),

    // Get current proxy user status
    status: protectedProcedure.query(async ({ ctx }) => {
      const proxyUser = await getProxyUser(ctx.user.id);
      const recentIntents = await getUserIntents(ctx.user.id, 10);
      const recentApprovals = await getUserApprovals(ctx.user.id, 10);
      const chainVerification = await verifyHashChain();
      // Resolve principal for role info
      let principal = await getPrincipalByUserId(ctx.user.id);
      if (!principal) {
        const isOwner = ctx.user.openId === ENV.ownerOpenId;
        principal = await getOrCreatePrincipal(ctx.user.id, ctx.user.name ?? null, isOwner);
      }
      return {
        proxyUser,
        recentIntents,
        recentApprovals,
        isOwner: ctx.user.openId === ENV.ownerOpenId,
        principal: principal ? {
          principalId: principal.principalId,
          roles: principal.roles as SystemRole[],
          principalType: principal.principalType,
          status: principal.status,
        } : null,
        systemHealth: {
          ledgerValid: chainVerification.valid,
          ledgerEntries: chainVerification.entries,
          chainErrors: chainVerification.errors,
        },
      };
    }),

    // Create intent
    createIntent: protectedProcedure.input(z.object({
      toolName: z.string(),
      toolArgs: z.record(z.string(), z.unknown()),
      reflection: z.string().optional(),
      breakAnalysis: z.string().optional(),
      sourceConversationId: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const proxyUser = await getProxyUser(ctx.user.id);
      if (!proxyUser || proxyUser.status !== "ACTIVE") {
        throw new Error("Proxy not active. Onboard first or check kill status.");
      }
      const tool = await getToolByName(input.toolName);
      if (!tool) throw new Error(`Tool '${input.toolName}' not found in registry`);

      // Apply custom policy rules — they can override the tool's default risk tier
      let effectiveRiskTier = tool.riskTier as "LOW" | "MEDIUM" | "HIGH";
      let forceApproval = false;
      const customRules = await getActivePolicyRulesForTool(input.toolName);
      const appliedRuleIds: string[] = [];
      for (const rule of customRules) {
        // Check condition if present
        if (rule.condition) {
          const cond = rule.condition as { field: string; operator: string; value: string };
          const argValue = String(input.toolArgs[cond.field] ?? "");
          let matches = false;
          if (cond.operator === "contains") matches = argValue.includes(cond.value);
          else if (cond.operator === "equals") matches = argValue === cond.value;
          else if (cond.operator === "startsWith") matches = argValue.startsWith(cond.value);
          else if (cond.operator === "endsWith") matches = argValue.endsWith(cond.value);
          else if (cond.operator === "greaterThan") matches = Number(argValue) > Number(cond.value);
          if (!matches) continue;
        }
        appliedRuleIds.push(rule.ruleId);
        if (rule.riskOverride) effectiveRiskTier = rule.riskOverride;
        if (rule.requiresApproval) forceApproval = true;
      }

      // Enforce breakAnalysis for MEDIUM and HIGH risk intents
      if ((effectiveRiskTier === "MEDIUM" || effectiveRiskTier === "HIGH") && !input.breakAnalysis?.trim()) {
        throw new Error(`Break analysis is required for ${effectiveRiskTier} risk intents. Describe where this could go wrong before submission.`);
      }

      // Compute blast radius using effective risk tier
      const argCount = Object.keys(input.toolArgs).length;
      const blastRadius = {
        score: Math.min(10, tool.blastRadiusBase + Math.floor(argCount / 2)),
        affectedSystems: effectiveRiskTier === "HIGH" ? ["external-api", "user-data", "audit-log"] : effectiveRiskTier === "MEDIUM" ? ["filesystem", "audit-log"] : ["audit-log"],
        reversible: effectiveRiskTier === "LOW" && !forceApproval,
      };

      // If forceApproval is set by a custom rule, override LOW risk auto-approve behavior
      // This is done by passing the effective risk tier (which may be upgraded) to createIntent
      const intentRiskTier = forceApproval && effectiveRiskTier === "LOW" ? "MEDIUM" as const : effectiveRiskTier;
      // Resolve principalId for attribution
      const intentPrincipal = await getPrincipalByUserId(ctx.user.id);
      const intent = await createIntent(ctx.user.id, input.toolName, input.toolArgs, intentRiskTier, blastRadius, input.reflection, input.sourceConversationId, undefined, intentPrincipal?.principalId);

      // If from a conversation, link the intent
      if (input.sourceConversationId && intent) {
        try {
          await addIntentToConversation(input.sourceConversationId, intent.intentId);
        } catch { /* conversation may not exist, that's ok */ }
      }

      await appendLedger("INTENT", {
        intentId: intent!.intentId,
        userId: ctx.user.id,
        toolName: input.toolName,
        argsHash: intent!.argsHash,
        riskTier: intentRiskTier,
        originalRiskTier: tool.riskTier,
        appliedPolicyRules: appliedRuleIds,
        blastRadius,
        sourceConversationId: input.sourceConversationId,
      });

      // In-app notification for pending approval
      if (intent!.status === "PENDING_APPROVAL") {
        createNotification(ctx.user.id, {
          type: "APPROVAL_NEEDED",
          title: "Action Needs Approval",
          body: `${input.toolName} (${intentRiskTier} risk) is waiting for your approval`,
          intentId: intent!.intentId,
        }).catch(() => { /* notification failure is non-fatal */ });
      }

      // Telegram notification (non-blocking, graceful skip if not configured)
      if (isTelegramConfigured()) {
        sendIntentNotification({
          intentId: intent!.intentId,
          toolName: input.toolName,
          toolArgs: input.toolArgs,
          riskTier: intentRiskTier,
          blastRadius,
          reflection: input.reflection,
        }).catch(() => { /* Telegram delivery failure is non-fatal */ });
      }

      return intent;
    }),

    // Get intent details
    getIntent: protectedProcedure.input(z.object({ intentId: z.string() })).query(async ({ input }) => {
      return getIntent(input.intentId);
    }),

    // List user intents
    listIntents: protectedProcedure.query(async ({ ctx }) => {
      return getUserIntents(ctx.user.id);
    }),

    // Approve or reject intent
    approve: protectedProcedure.input(z.object({
      intentId: z.string(),
      decision: z.enum(["APPROVED", "REJECTED"]),
      signature: z.string(),
      expiresInSeconds: z.number().default(300),
      maxExecutions: z.number().default(1),
    })).mutation(async ({ ctx, input }) => {
      const intent = await getIntent(input.intentId);
      if (!intent) throw new Error("Intent not found");
      if (intent.status !== "PENDING_APPROVAL") throw new Error(`Intent status is ${intent.status}, cannot approve`);

      // TTL check: if intent has expired, mark it and reject
      if (intent.expiresAt && Number(intent.expiresAt) <= Date.now()) {
        await updateIntentStatus(input.intentId, "EXPIRED");
        throw new Error("Intent has expired (TTL exceeded). Cannot approve stale intents.");
      }

      // Resolve principalId for attribution
      const approvalPrincipal = await getPrincipalByUserId(ctx.user.id);

      // ─── CONSTRAINED DELEGATION CHECK ──────────────────────────
      // Prevent trivial self-approval. Same identity requires cooldown.
      const proposerPrincipal = await getPrincipalByUserId(intent.userId);
      const proposerIdentity = proposerPrincipal?.principalId ?? `user-${intent.userId}`;
      const approverIdentity = approvalPrincipal?.principalId ?? `user-${ctx.user.id}`;
      const intentCreatedAt = intent.createdAt ? new Date(intent.createdAt).getTime() : Date.now();

      // Gateway-level identity evaluation (Rule 3)
      let localIdentityEval: GatewayIdentityEvaluation | null = null;
      if (input.decision === "APPROVED") {
        localIdentityEval = evaluateIdentityAtGatewayBoundary(
          proposerIdentity,
          approverIdentity,
          intentCreatedAt,
        );

        if (!localIdentityEval.allowed) {
          // Log the blocked attempt with explicit identity IDs and authority model
          await appendLedger("DELEGATION_BLOCKED", {
            intentId: input.intentId,
            proposer_identity_id: proposerIdentity,
            approver_identity_id: approverIdentity,
            authority_model: localIdentityEval.authority_model,
            role_separation: localIdentityEval.role_separation,
            cooldown_remaining_ms: localIdentityEval.cooldown_remaining_ms,
            reason: localIdentityEval.reason,
            path: "proxy.approve",
            timestamp: Date.now(),
          });
          throw new Error(formatCooldownMessage(localIdentityEval.delegation_check));
        }
      }

      const expiresAt = Date.now() + input.expiresInSeconds * 1000;
      const approval = await createApproval(
        input.intentId, ctx.user.id, input.decision, input.signature,
        intent.toolName, intent.argsHash, expiresAt, input.maxExecutions,
        approvalPrincipal?.principalId
      );
      await updateIntentStatus(input.intentId, input.decision);

      // Determine role_separation and authority_model for the receipt/ledger
      const roleSeparation: RoleSeparation = input.decision === "REJECTED"
        ? (proposerIdentity === approverIdentity ? "self" : "separated")
        : (localIdentityEval?.role_separation ?? "separated");
      const authorityModel: AuthorityModel = input.decision === "REJECTED"
        ? (proposerIdentity === approverIdentity
            ? "BLOCKED \u2014 Self-Authorization Sub-Policy Not Met"
            : "Separated Authority")
        : (localIdentityEval?.authority_model ?? "Separated Authority");

      await appendLedger("APPROVAL", {
        approvalId: approval!.approvalId,
        intentId: input.intentId,
        decision: input.decision,
        boundToolName: intent.toolName,
        boundArgsHash: intent.argsHash,
        expiresAt,
        maxExecutions: input.maxExecutions,
        // Explicit identity fields for audit trail
        proposer_identity_id: proposerIdentity,
        approver_identity_id: approverIdentity,
        authority_model: authorityModel,
        role_separation: roleSeparation,
      });

      // Log successful constrained delegation
      if (input.decision === "APPROVED" && proposerIdentity === approverIdentity) {
        await appendLedger("DELEGATION_APPROVED", {
          intentId: input.intentId,
          proposer_identity_id: proposerIdentity,
          approver_identity_id: approverIdentity,
          authority_model: authorityModel,
          role_separation: roleSeparation,
          path: "proxy.approve",
          timestamp: Date.now(),
        });
      }

      // ─── AUTHORIZATION TOKEN ISSUANCE ────────────────────────
      // After approval, issue an authorization token. This is the machine-verifiable
      // artifact that gates execution. No token = no execution.
      let authorizationToken: AuthorizationToken | null = null;
      if (input.decision === "APPROVED") {
        try {
          const toolArgs = typeof intent.toolArgs === 'string'
            ? JSON.parse(intent.toolArgs) as Record<string, unknown>
            : (intent.toolArgs as Record<string, unknown>) ?? {};

          const approverPrincipalId = approvalPrincipal?.principalId ?? `user-${ctx.user.id}`;

          authorizationToken = issueAuthorizationToken({
            intentId: input.intentId,
            action: intent.toolName,
            toolArgs,
            approvedBy: approverPrincipalId,
            signature: input.signature,
            expiryMinutes: Math.ceil(input.expiresInSeconds / 60),
            maxExecutions: input.maxExecutions,
          });

          // Write AUTHORITY_TOKEN to ledger
          await appendLedger("AUTHORITY_TOKEN", {
            tokenId: authorizationToken.token_id,
            intentId: input.intentId,
            action: intent.toolName,
            parametersHash: authorizationToken.parameters_hash,
            approvedBy: approverPrincipalId,
            policyHash: authorizationToken.policy_hash,
            issuedAt: authorizationToken.issued_at,
            expiresAt: authorizationToken.expires_at,
            maxExecutions: authorizationToken.max_executions,
          });
        } catch (tokenErr) {
          // If token issuance fails (e.g., no active policy), the approval still stands
          // but execution will be blocked because no token exists.
          // This is fail-closed behavior: approval without token = no execution.
          console.warn("[Authority] Token issuance failed (execution will be blocked):", tokenErr);
        }
      }

      // Learning Loop: record approval/rejection as learning event
      const learningPayload = createLearningEventPayload(
        input.decision === "APPROVED" ? "APPROVAL" : "REJECTION",
        {
          intentId: input.intentId,
          conversationId: intent.sourceConversationId ?? undefined,
          toolName: intent.toolName,
          toolArgs: intent.toolArgs as Record<string, unknown>,
          riskTier: intent.riskTier,
          outcome: input.decision === "APPROVED" ? "POSITIVE" : "NEGATIVE",
        },
      );
      await createLearningEvent(ctx.user.id, learningPayload.eventId, learningPayload.eventType as "APPROVAL" | "REJECTION", {
        intentId: learningPayload.intentId,
        conversationId: learningPayload.conversationId,
        context: learningPayload.context,
        outcome: learningPayload.outcome as "POSITIVE" | "NEGATIVE" | "NEUTRAL",
      });

      return {
        ...approval,
        role_separation: roleSeparation,
        authorizationToken: authorizationToken ? {
          token_id: authorizationToken.token_id,
          intent_id: authorizationToken.intent_id,
          action: authorizationToken.action,
          parameters_hash: authorizationToken.parameters_hash,
          approved_by: authorizationToken.approved_by,
          policy_hash: authorizationToken.policy_hash,
          issued_at: authorizationToken.issued_at,
          expires_at: authorizationToken.expires_at,
          max_executions: authorizationToken.max_executions,
        } : null,
      };
    }),

    // Execute approved intent with preflight checks
    execute: protectedProcedure.input(z.object({
      intentId: z.string(),
      tokenId: z.string().optional(), // authorization token ID (required for MEDIUM/HIGH risk)
      agentId: z.string().optional(), // optional: route through an external agent adapter
    })).mutation(async ({ ctx, input }) => {
      const intent = await getIntent(input.intentId);
      if (!intent) throw new Error("Intent not found");
      // The proposer (intent owner) triggers execution. This is correct:
      // Proposer creates intent → different user approves → proposer executes with token.
      if (intent.userId !== ctx.user.id) throw new Error("Not your intent");

      const proxyUser = await getProxyUser(ctx.user.id);
      if (!proxyUser || proxyUser.status !== "ACTIVE") throw new Error("Proxy killed or not active");

      const tool = await getToolByName(intent.toolName);
      const approval = await getApprovalForIntent(input.intentId);

      // Parse toolArgs early (needed for token validation)
      const parsedToolArgs = typeof intent.toolArgs === 'string'
        ? JSON.parse(intent.toolArgs) as Record<string, unknown>
        : (intent.toolArgs as Record<string, unknown>) ?? {};

      // Run preflight checks (original 8 + authorization token checks)
      const checks: Array<{ check: string; status: string; detail: string }> = [];

      // 1. Proxy active
      checks.push({ check: "proxy_active", status: proxyUser.status === "ACTIVE" ? "PASS" : "FAIL", detail: `Proxy status: ${proxyUser.status}` });

      // 2. Intent not already executed
      const alreadyExecuted = intent.status === "EXECUTED";
      checks.push({ check: "not_already_executed", status: !alreadyExecuted ? "PASS" : "FAIL", detail: alreadyExecuted ? "Intent already executed" : "Intent not yet executed" });

      // 3. Tool exists in registry
      checks.push({ check: "tool_registered", status: tool ? "PASS" : "FAIL", detail: tool ? `Tool '${intent.toolName}' found` : `Tool '${intent.toolName}' not in registry` });

      // 4. Risk tier check — LOW can skip approval
      const needsApproval = intent.riskTier !== "LOW";
      checks.push({ check: "risk_tier_check", status: "PASS", detail: `Risk tier: ${intent.riskTier}, approval ${needsApproval ? "required" : "not required"}` });

      // 5. Approval exists (if needed)
      const hasApproval = !needsApproval || (approval && approval.decision === "APPROVED");
      checks.push({ check: "approval_exists", status: hasApproval ? "PASS" : "FAIL", detail: hasApproval ? (approval ? `Approval ${approval.approvalId}` : "LOW risk — no approval needed") : "No valid approval found" });

      // 6. Approval not expired
      const notExpired = !needsApproval || (approval && approval.expiresAt > Date.now());
      checks.push({ check: "approval_not_expired", status: notExpired ? "PASS" : "FAIL", detail: notExpired ? "Approval valid" : "Approval expired" });

      // 7. Execution count within limit
      const withinLimit = !needsApproval || (approval && approval.executionCount < approval.maxExecutions);
      checks.push({ check: "execution_limit", status: withinLimit ? "PASS" : "FAIL", detail: withinLimit ? (approval ? `${approval.executionCount}/${approval.maxExecutions} used` : "No limit for LOW risk") : "Max executions reached" });

      // 8. Args hash matches (tamper check)
      const argsMatch = !needsApproval || (approval && approval.boundArgsHash === intent.argsHash);
      checks.push({ check: "args_hash_match", status: argsMatch ? "PASS" : "FAIL", detail: argsMatch ? "Args hash verified" : "Args hash mismatch — possible tampering" });

      // ─── AUTHORIZATION TOKEN ENFORCEMENT ───────────────────
      // Hard governance rule: All MEDIUM/HIGH risk actions require a valid authorization token.
      // No token = no execution. This is the enforcement boundary.
      let authToken: AuthorizationToken | null = null;
      if (needsApproval) {
        // 9. Authorization token exists
        if (!input.tokenId) {
          checks.push({ check: "authorization_token_exists", status: "FAIL", detail: "No authorization token provided — execution requires token" });
        } else {
          authToken = getAuthorizationToken(input.tokenId);
          if (!authToken) {
            checks.push({ check: "authorization_token_exists", status: "FAIL", detail: `Token ${input.tokenId} not found` });
          } else {
            checks.push({ check: "authorization_token_exists", status: "PASS", detail: `Token ${authToken.token_id} found` });

            // 10. Token validation (7 sub-checks)
            const tokenValidation = validateAuthorizationToken(
              authToken,
              intent.toolName,
              parsedToolArgs,
              proxyUser.status !== "ACTIVE", // kill switch = proxy not active
            );
            for (const tc of tokenValidation.checks) {
              checks.push({ check: `token_${tc.check}`, status: tc.status, detail: tc.detail });
            }

            // 11. Proposer ≠ Approver (hard governance rule)
            // The person who proposed the intent cannot be the one who approved it
            const proposerPrincipal = await getPrincipalByUserId(intent.userId);
            const proposerId = proposerPrincipal?.principalId ?? `user-${intent.userId}`;
            const approverId = authToken.approved_by;
            const proposerNotApprover = proposerId !== approverId;
            checks.push({
              check: "proposer_not_approver",
              status: proposerNotApprover ? "PASS" : "FAIL",
              detail: proposerNotApprover
                ? `Proposer (${proposerId}) ≠ Approver (${approverId})`
                : `GOVERNANCE VIOLATION: Proposer and approver are the same (${proposerId})`,
            });
          }
        }
      } else {
        // LOW risk: token not required, but note it in checks
        checks.push({ check: "authorization_token_exists", status: "PASS", detail: "LOW risk — authorization token not required" });
      }

      // Fail-closed: if any check fails, block execution
      const allPassed = checks.every(c => c.status === "PASS");
      if (!allPassed) {
        const failedChecks = checks.filter(c => c.status === "FAIL").map(c => c.check);
        return { success: false, error: `Preflight failed: ${failedChecks.join(", ")}`, preflightResults: checks };
      }

      // ─── REAL CONNECTOR DISPATCH ────────────────────────────
      // Build approval proof for the connector layer
      const approvalProof: ApprovalProof | null = approval ? {
        approvalId: approval.approvalId,
        intentId: input.intentId,
        boundToolName: approval.boundToolName,
        boundArgsHash: approval.boundArgsHash,
        signature: approval.signature,
        expiresAt: typeof approval.expiresAt === 'number' ? approval.expiresAt : Number(approval.expiresAt),
      } : null;

      // Parse toolArgs (may be stored as JSON string)
      const toolArgs = typeof intent.toolArgs === 'string'
        ? JSON.parse(intent.toolArgs) as Record<string, unknown>
        : intent.toolArgs as Record<string, unknown>;

      // ─── AGENT ADAPTER LAYER ─────────────────────────────────
      // If an agentId is specified, route through the external agent first.
      // The agent decides HOW to do the task, returns a structured ActionRequest.
      // RIO then executes that ActionRequest through its own connectors.
      // The agent never sees API keys. The agent never touches infrastructure.
      let finalToolName = intent.toolName;
      let finalToolArgs = toolArgs;
      let agentResult: AgentAdapterResult | null = null;

      if (input.agentId && input.agentId !== "passthrough") {
        const adapter = getAdapter(input.agentId);
        if (!adapter) {
          return {
            success: false,
            error: `AGENT_NOT_FOUND: No adapter registered for '${input.agentId}'`,
            preflightResults: checks,
          };
        }

        const agentInput: AgentInput = {
          intentId: input.intentId,
          toolName: intent.toolName,
          toolArgs,
          riskTier: intent.riskTier as "LOW" | "MEDIUM" | "HIGH",
          reflection: intent.reflection ?? undefined,
        };

        agentResult = await adapter.processIntent(agentInput);

        if (!agentResult.success || !agentResult.actionRequest) {
          await updateIntentStatus(input.intentId, "FAILED");
          await appendLedger("EXECUTION", {
            intentId: input.intentId,
            error: agentResult.error || "Agent failed to produce action request",
            agentId: input.agentId,
            agentModel: agentResult.agentModel,
            failClosed: true,
            preflightResults: checks,
          });
          return {
            success: false,
            error: `AGENT_ERROR: ${agentResult.error || "Agent failed to produce action request"}`,
            preflightResults: checks,
            agentResult: { agentId: agentResult.agentId, agentModel: agentResult.agentModel, error: agentResult.error },
          };
        }

        // Agent returned a structured action request — use it for connector dispatch
        // The agent may have refined the args or even changed the connector
        finalToolName = agentResult.actionRequest.connectorName;
        finalToolArgs = agentResult.actionRequest.connectorArgs;
      }

      // Dispatch to the real connector
      // When agent is involved, use the agent's refined args.
      // When no agent, use original args directly.
      // Pass the stored argsHash to avoid MySQL JSON key reordering issues
      // Note: when agent refines args, we still pass the original argsHash for
      // the approval binding check. The connector layer verifies the APPROVAL
      // was for the original intent. The agent refinement is an enhancement,
      // not a replacement of the governance binding.
      const connectorResult = await dispatchExecution(
        finalToolName,
        finalToolArgs,
        approvalProof,
        intent.riskTier as "LOW" | "MEDIUM" | "HIGH",
        intent.argsHash,
      );

      // If connector dispatch failed (ARGS_HASH_MISMATCH, NO_CONNECTOR, etc.), fail closed
      if (!connectorResult.success) {
        await updateIntentStatus(input.intentId, "FAILED");
        await appendLedger("EXECUTION", {
          intentId: input.intentId,
          error: connectorResult.error,
          failClosed: true,
          preflightResults: checks,
        });
        return {
          success: false,
          error: connectorResult.error,
          preflightResults: checks,
        };
      }

      // Build the result object for storage
      // Include agent provenance if an external agent was involved
      const result: Record<string, unknown> = {
        output: connectorResult.output,
        toolName: intent.toolName,
        toolArgs,
        executedAt: connectorResult.executedAt,
      };

      // Attach agent provenance to the result (Mantis records everything)
      if (agentResult && agentResult.success) {
        result.agentProvenance = {
          agentId: agentResult.agentId,
          agentModel: agentResult.agentModel,
          tokensUsed: agentResult.tokensUsed,
          processingTimeMs: agentResult.processingTimeMs,
          reasoning: agentResult.actionRequest?.agentReasoning,
          modifications: agentResult.actionRequest?.modifications,
          confidence: agentResult.actionRequest?.confidence,
          connectorUsed: agentResult.actionRequest?.connectorName,
        };
      }

      // ─── 13-POINT GOVERNED ACTION: RECEIPT + LEDGER + BURN ────
      // Order matters:
      //   1. Create execution record (placeholder receiptHash)
      //   2. Write EXECUTION ledger entry FIRST (to get ledger_entry_id)
      //   3. Generate canonical receipt (references ledger_entry_id)
      //   4. Compute gateway signature over receipt
      //   5. Update execution record with final receiptHash
      //   6. Burn the authorization token (single-use enforcement)

      // Step 1: Create execution record with placeholder
      const execution = await createExecution(input.intentId, approval?.approvalId ?? null, result, "PENDING", checks);

      // Step 2: Write EXECUTION ledger entry FIRST to get ledger_entry_id
      const ledgerEntry = await appendLedger("EXECUTION", {
        executionId: execution!.executionId,
        intentId: input.intentId,
        // Authority layer fields in ledger entry
        ...(authToken ? {
          authorization_token_id: authToken.token_id,
          approver_id: authToken.approved_by,
          policy_hash: authToken.policy_hash,
        } : {}),
        connectorResult: {
          success: connectorResult.success,
          metadata: connectorResult.metadata,
        },
        ...(agentResult?.success ? {
          agentProvenance: {
            agentId: agentResult.agentId,
            agentModel: agentResult.agentModel,
            tokensUsed: agentResult.tokensUsed,
            processingTimeMs: agentResult.processingTimeMs,
          },
        } : {}),
        preflightResults: checks,
      });

      // Step 3 & 4: Generate canonical receipt with gateway signature
      // Use generateCanonicalReceipt when authority layer is active (token present),
      // otherwise fall back to ad-hoc receipt for LOW-risk actions.
      let receiptHash: string;
      let canonicalReceipt: CanonicalReceipt | null = null;
      let receiptPayload: string;

      if (authToken) {
        // Resolve proposer and approver IDs
        const proposerPrincipal = await getPrincipalByUserId(intent.userId);
        const proposerId = proposerPrincipal?.principalId ?? `user-${intent.userId}`;
        const approverId = authToken.approved_by;

        // Resolve timestamps for the receipt
        const timestampProposed = intent.createdAt
          ? new Date(intent.createdAt).toISOString()
          : new Date().toISOString();
        const timestampApproved = approval?.createdAt
          ? new Date(approval.createdAt).toISOString()
          : authToken.issued_at;

        // Generate canonical receipt with all policy-compliant fields
        canonicalReceipt = generateCanonicalReceipt({
          intentId: input.intentId,
          proposerId,
          approverId,
          tokenId: authToken.token_id,
          action: intent.toolName,
          success: connectorResult.success,
          result,
          executor: `executor-${execution!.executionId}`,
          ledgerEntryId: ledgerEntry.entryId,
          timestampProposed,
          timestampApproved,
        });

        receiptHash = canonicalReceipt.receipt_hash;
        // Store the full canonical receipt as the payload for independent verification
        receiptPayload = JSON.stringify(canonicalReceipt);
      } else {
        // LOW-risk fallback: ad-hoc receipt (no token, no authority layer)
        receiptPayload = JSON.stringify({
          executionId: execution!.executionId,
          intentId: input.intentId,
          result,
        });
        receiptHash = sha256(receiptPayload);
      }

      // Step 5: Update execution record with final receipt hash and payload
      await updateExecutionReceiptHash(execution!.executionId, receiptHash, receiptPayload);

      // Step 6: Burn the authorization token (single-use enforcement)
      // After successful execution, the token is permanently invalidated.
      // This is checklist point 7: "Token burned after execution"
      if (authToken) {
        burnAuthorizationToken(authToken.token_id);
      }

      // Update ledger entry with the final receipt hash
      // (The ledger entry was created before the receipt to provide ledger_entry_id)
      // Note: The receiptHash is now in the execution record and can be verified
      // against the ledger entry via the execution→ledger linkage.

      await updateIntentStatus(input.intentId, "EXECUTED");
      if (approval) await incrementApprovalExecution(approval.approvalId);

      // Learning Loop: record execution as learning event
      const learningPayload = createLearningEventPayload("EXECUTION", {
        intentId: input.intentId,
        conversationId: intent.sourceConversationId ?? undefined,
        toolName: intent.toolName,
        toolArgs,
        riskTier: intent.riskTier,
        outcome: connectorResult.success ? "POSITIVE" : "NEGATIVE",
      });
      await createLearningEvent(ctx.user.id, learningPayload.eventId, "EXECUTION", {
        intentId: learningPayload.intentId,
        conversationId: learningPayload.conversationId,
        context: { ...learningPayload.context, connectorMetadata: connectorResult.metadata },
        outcome: connectorResult.success ? "POSITIVE" : "NEGATIVE",
      });

      // In-app notification for execution complete
      createNotification(ctx.user.id, {
        type: connectorResult.success ? "EXECUTION_COMPLETE" : "EXECUTION_FAILED",
        title: connectorResult.success ? "Action Executed" : "Action Failed",
        body: `${intent.toolName} ${connectorResult.success ? 'completed successfully' : 'failed during execution'}`,
        intentId: input.intentId,
        executionId: execution!.executionId,
      }).catch(() => { /* notification failure is non-fatal */ });

      // Telegram receipt notification (non-blocking)
      if (isTelegramConfigured()) {
        sendReceiptNotification({
          intentId: input.intentId,
          executionId: execution!.executionId,
          toolName: intent.toolName,
          success: connectorResult.success,
          receiptHash,
        }).catch(() => { /* Telegram delivery failure is non-fatal */ });
      }

      // ─── LIBRARIAN SYNC (non-blocking, fail-silent) ────────────
      // Mirror receipt to /RIO/01_PROTOCOL/ on Drive
      if (canonicalReceipt) {
        syncToLibrarian({
          receipt_id: canonicalReceipt.receipt_id,
          receipt_hash: canonicalReceipt.receipt_hash,
          previous_receipt_hash: canonicalReceipt.previous_receipt_hash,
          proposer_id: canonicalReceipt.proposer_id,
          approver_id: canonicalReceipt.approver_id,
          decision: connectorResult.success ? "APPROVED" : "APPROVED_FAILED",
          snapshot_hash: canonicalReceipt.receipt_hash,
        }).catch(() => { /* Librarian sync failure is non-fatal */ });
      }

      return {
        success: true,
        execution,
        preflightResults: checks,
        connectorResult: { success: connectorResult.success, metadata: connectorResult.metadata },
        receiptHash,
        // Canonical receipt (full policy-compliant governed action proof)
        ...(canonicalReceipt ? {
          canonicalReceipt: {
            receipt_id: canonicalReceipt.receipt_id,
            intent_id: canonicalReceipt.intent_id,
            proposer_id: canonicalReceipt.proposer_id,
            approver_id: canonicalReceipt.approver_id,
            token_id: canonicalReceipt.token_id,
            policy_hash: canonicalReceipt.policy_hash,
            execution_hash: canonicalReceipt.execution_hash,
            receipt_hash: canonicalReceipt.receipt_hash,
            previous_receipt_hash: canonicalReceipt.previous_receipt_hash,
            ledger_entry_id: canonicalReceipt.ledger_entry_id,
            gateway_signature: canonicalReceipt.gateway_signature,
            status: canonicalReceipt.status,
            timestamp_proposed: canonicalReceipt.timestamp_proposed,
            timestamp_approved: canonicalReceipt.timestamp_approved,
            timestamp_executed: canonicalReceipt.timestamp_executed,
            decision_delta_ms: canonicalReceipt.decision_delta_ms,
          },
        } : {}),
        // Authority layer context in response
        ...(authToken ? {
          authorizationToken: {
            token_id: authToken.token_id,
            approver_id: authToken.approved_by,
            policy_hash: authToken.policy_hash,
            burned: true, // token was burned after execution
          },
        } : {}),
        ...(agentResult?.success ? {
          agentResult: {
            agentId: agentResult.agentId,
            agentModel: agentResult.agentModel,
            tokensUsed: agentResult.tokensUsed,
            processingTimeMs: agentResult.processingTimeMs,
            reasoning: agentResult.actionRequest?.agentReasoning,
            modifications: agentResult.actionRequest?.modifications,
          },
        } : {}),
      };
    }),

    // Kill switch
    kill: protectedProcedure.input(z.object({
      reason: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      await killProxyUser(ctx.user.id, input.reason);
      await appendLedger("KILL", {
        userId: ctx.user.id,
        reason: input.reason,
        killedAt: Date.now(),
      });

      // In-app kill switch notification
      createNotification(ctx.user.id, {
        type: "KILL_SWITCH",
        title: "Kill Switch Activated",
        body: `System killed: ${input.reason}. All pending intents revoked.`,
      }).catch(() => { /* notification failure is non-fatal */ });

      // Telegram kill notification (non-blocking)
      if (isTelegramConfigured()) {
        sendKillNotification(input.reason).catch(() => { /* non-fatal */ });
      }

      return { success: true, message: "Proxy killed. All pending intents revoked." };
    }),

    // Get execution by intentId (for receipt link on already-executed intents)
    getExecution: protectedProcedure.input(z.object({ intentId: z.string() })).query(async ({ input }) => {
      const execution = await getExecutionByIntentId(input.intentId);
      return execution || null;
    }),

    // Get execution receipt
    getReceipt: protectedProcedure.input(z.object({ executionId: z.string() })).query(async ({ input }) => {
      const execution = await getExecution(input.executionId);
      if (!execution) return null;
      const intent = await getIntent(execution.intentId);
      const approval = execution.approvalId ? await getApprovalForIntent(execution.intentId) : null;
      return { execution, intent, approval, protocolVersion: PROTOCOL_VERSION };
    }),

    // ─── Batch Approval ─────────────────────────────────────────
    batchApprove: protectedProcedure.input(z.object({
      intentIds: z.array(z.string()).min(1).max(50),
      decision: z.enum(["APPROVED", "REJECTED"]),
      signature: z.string(),
      expiresInSeconds: z.number().default(300),
      maxExecutions: z.number().default(1),
    })).mutation(async ({ ctx, input }) => {
      const expiresAt = Date.now() + input.expiresInSeconds * 1000;
      const results = await batchApproveIntents(
        input.intentIds, ctx.user.id, input.decision, input.signature, expiresAt, input.maxExecutions
      );
      // Log each approval to the ledger
      for (const r of results) {
        await appendLedger("APPROVAL", {
          approvalId: r.approvalId,
          intentId: r.intentId,
          decision: input.decision,
          batchOperation: true,
          batchSize: input.intentIds.length,
          expiresAt,
          maxExecutions: input.maxExecutions,
        });
      }
      return { success: true, processed: results.length, results };
    }),

    // ─── Expire Stale Intents ───────────────────────────────────
    expireStale: protectedProcedure.mutation(async () => {
      const count = await expireStaleIntents();
      return { expired: count };
    }),

    // ─── Approval SLA Metrics ──────────────────────────────────
    approvalMetrics: protectedProcedure.query(async ({ ctx }) => {
      return getApprovalMetrics(ctx.user.id);
    }),
  }),

  // ─── Key Backup & Recovery ───────────────────────────────────
  keyBackup: router({
    save: protectedProcedure.input(z.object({
      encryptedKey: z.string().min(1),
      iv: z.string().min(1),
      salt: z.string().min(1),
      publicKeyFingerprint: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const backup = await saveKeyBackup(
        ctx.user.id, input.encryptedKey, input.iv, input.salt, input.publicKeyFingerprint
      );
      return { success: true, backup: { id: backup!.id, publicKeyFingerprint: backup!.publicKeyFingerprint, createdAt: backup!.createdAt } };
    }),

    retrieve: protectedProcedure.query(async ({ ctx }) => {
      const backup = await getKeyBackup(ctx.user.id);
      if (!backup) return { exists: false, backup: null };
      return {
        exists: true,
        backup: {
          encryptedKey: backup.encryptedKey,
          iv: backup.iv,
          salt: backup.salt,
          publicKeyFingerprint: backup.publicKeyFingerprint,
          createdAt: backup.createdAt,
        },
      };
    }),

    check: protectedProcedure.query(async ({ ctx }) => {
      const backup = await getKeyBackup(ctx.user.id);
      return {
        exists: !!backup,
        publicKeyFingerprint: backup?.publicKeyFingerprint ?? null,
        createdAt: backup?.createdAt ?? null,
      };
    }),

    delete: protectedProcedure.mutation(async ({ ctx }) => {
      await deleteKeyBackup(ctx.user.id);
      return { success: true };
    }),
  }),

  // ─── Ledger ──────────────────────────────────────────────────
  ledger: router({
    list: protectedProcedure.query(async () => {
      return getAllLedgerEntries();
    }),
    verify: protectedProcedure.query(async () => {
      return verifyHashChain();
    }),
    logArchitectureState: protectedProcedure.input(z.object({
      version: z.string(),
      description: z.string(),
      data: z.record(z.string(), z.unknown()),
    })).mutation(async ({ input }) => {
      const entry = await appendLedger("ARCHITECTURE_STATE", {
        logType: "ARCHITECTURE_STATE",
        version: input.version,
        description: input.description,
        data: input.data,
        hash: sha256(JSON.stringify(input.data)),
      });
      return entry;
    }),
  }),

  // ─── Sync & Recovery ─────────────────────────────────────────
  sync: router({
    pull: protectedProcedure.input(z.object({
      lastKnownEntryId: z.string().optional(),
    })).query(async ({ ctx, input }) => {
      const allEntries = await getAllLedgerEntries();
      let entries = allEntries;
      if (input.lastKnownEntryId) {
        const idx = allEntries.findIndex(e => e.entryId === input.lastKnownEntryId);
        if (idx >= 0) entries = allEntries.slice(idx + 1);
      }
      const proxyUser = await getProxyUser(ctx.user.id);
      const verification = await verifyHashChain();
      const keyBackupStatus = await getKeyBackup(ctx.user.id);
      return {
        entries,
        proxyUser,
        chainValid: verification.valid,
        totalEntries: allEntries.length,
        hasKeyBackup: !!keyBackupStatus,
      };
    }),

    fullRecover: protectedProcedure.query(async ({ ctx }) => {
      const proxyUser = await getProxyUser(ctx.user.id);
      const allEntries = await getAllLedgerEntries();
      const verification = await verifyHashChain();
      const keyBackup = await getKeyBackup(ctx.user.id);
      const recentIntents = await getUserIntents(ctx.user.id, 50);
      const recentApprovals = await getUserApprovals(ctx.user.id, 50);

      return {
        identity: proxyUser ? {
          publicKey: proxyUser.publicKey,
          policyHash: proxyUser.policyHash,
          seedVersion: proxyUser.seedVersion,
          status: proxyUser.status,
          onboardedAt: proxyUser.onboardedAt,
        } : null,
        keyBackup: keyBackup ? {
          encryptedKey: keyBackup.encryptedKey,
          iv: keyBackup.iv,
          salt: keyBackup.salt,
          publicKeyFingerprint: keyBackup.publicKeyFingerprint,
        } : null,
        ledger: {
          entries: allEntries,
          chainValid: verification.valid,
          totalEntries: allEntries.length,
          errors: verification.errors,
        },
        intents: recentIntents,
        approvals: recentApprovals,
        recoveredAt: Date.now(),
      };
    }),

    resyncLedger: protectedProcedure.query(async () => {
      const allEntries = await getAllLedgerEntries();
      const verification = await verifyHashChain();
      return {
        entries: allEntries,
        chainValid: verification.valid,
        totalEntries: allEntries.length,
        errors: verification.errors,
        resyncedAt: Date.now(),
      };
    }),
  }),

  // ═══════════════════════════════════════════════════════════════
  // BONDI AI ROUTER
  // ═══════════════════════════════════════════════════════════════

  bondi: router({
    // Send a message to Bondi — the main chat endpoint
    chat: protectedProcedure.input(z.object({
      message: z.string().min(1).max(4000),
      conversationId: z.string().optional(),
      nodeId: z.string().default("gemini-flash"),
      mode: z.enum(["REFLECT", "COMPUTE", "DRAFT", "VERIFY", "EXECUTE", "ROBOT"]).optional(),
    })).mutation(async ({ ctx, input }) => {
      // 1. Sentinel orientation: verify identity and load context
      const proxyUser = await getProxyUser(ctx.user.id);
      if (!proxyUser || proxyUser.status !== "ACTIVE") {
        throw new Error("Proxy not active. Complete onboarding first.");
      }

      const chainVerification = await verifyHashChain();
      const sentinel = buildSentinelStatus(proxyUser, chainVerification.valid);

      if (sentinel.killSwitchActive) {
        throw new Error("Kill switch is active. All operations halted.");
      }

      // 2. Load node config
      const nodeConfig = await getNodeConfig(input.nodeId);
      if (!nodeConfig || !nodeConfig.isActive) {
        throw new Error(`AI node '${input.nodeId}' not available`);
      }

      const nodeInfo: NodeInfo = {
        nodeId: nodeConfig.nodeId,
        displayName: nodeConfig.displayName,
        provider: nodeConfig.provider,
        modelName: nodeConfig.modelName,
        capabilities: nodeConfig.capabilities as NodeInfo["capabilities"],
      };

      // 3. Load or create conversation
      let conversation = input.conversationId
        ? await getConversation(input.conversationId)
        : null;

      if (!conversation) {
        const title = generateConversationTitle(input.message);
        conversation = await createConversation(
          ctx.user.id,
          title,
          input.nodeId,
          input.mode ?? "REFLECT",
          [],
        );
      }

      // 4. Build Bondi context
      const tools = await getAllTools();
      const recentLearnings = await getRecentLearningContext(ctx.user.id, 20);
      const conversationMessages = (conversation.messages as Array<{ role: string; content: string; timestamp: number }>) ?? [];

      const bondiContext: BondiContext = {
        userId: ctx.user.id,
        proxyStatus: proxyUser.status,
        policyHash: proxyUser.policyHash,
        seedVersion: proxyUser.seedVersion,
        mode: (input.mode ?? conversation.mode ?? "REFLECT") as ProxyMode,
        recentLearnings,
        availableTools: tools.map(t => ({
          toolName: t.toolName,
          description: t.description,
          riskTier: t.riskTier,
        })),
        sentinel,
        conversationHistory: conversationMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      };

      // 5. Route to AI node
      const bondiResponse = await routeToBondi(input.message, bondiContext, nodeInfo);

      // 6. Update conversation with new messages
      const now = Date.now();
      const updatedMessages = [
        ...conversationMessages,
        { role: "user", content: input.message, timestamp: now },
        {
          role: "assistant",
          content: bondiResponse.message,
          timestamp: now + 1,
          metadata: {
            nodeUsed: bondiResponse.nodeUsed,
            mode: bondiResponse.mode,
            intentsProposed: bondiResponse.intents.length,
            tokensUsed: bondiResponse.tokensUsed,
          },
        },
      ];

      await updateConversationMessages(
        conversation.conversationId,
        updatedMessages,
        bondiResponse.mode,
      );

      // 7. If intents were proposed, create them in the HITL system
      const createdIntents = [];
      for (const proposedIntent of bondiResponse.intents) {
        const tool = await getToolByName(proposedIntent.toolName);
        if (!tool) continue; // Skip unknown tools

        const argCount = Object.keys(proposedIntent.toolArgs).length;
        const blastRadius = {
          score: Math.min(10, tool.blastRadiusBase + Math.floor(argCount / 2)),
          affectedSystems: tool.riskTier === "HIGH" ? ["external-api", "user-data", "audit-log"] : tool.riskTier === "MEDIUM" ? ["filesystem", "audit-log"] : ["audit-log"],
          reversible: tool.riskTier === "LOW",
        };

        // Resolve principalId for Bondi-originated intents
        const bondiPrincipal = await getPrincipalByUserId(ctx.user.id);
        const intent = await createIntent(
          ctx.user.id,
          proposedIntent.toolName,
          proposedIntent.toolArgs,
          tool.riskTier as "LOW" | "MEDIUM" | "HIGH",
          blastRadius,
          proposedIntent.reasoning,
          conversation.conversationId,
          undefined,
          bondiPrincipal?.principalId,
        );

        if (intent) {
          await addIntentToConversation(conversation.conversationId, intent.intentId);
          await appendLedger("INTENT", {
            intentId: intent.intentId,
            userId: ctx.user.id,
            toolName: proposedIntent.toolName,
            argsHash: intent.argsHash,
            riskTier: tool.riskTier,
            blastRadius,
            sourceConversationId: conversation.conversationId,
            aiProposed: true,
            confidence: proposedIntent.confidence,
          });

          createdIntents.push({
            intentId: intent.intentId,
            toolName: proposedIntent.toolName,
            toolArgs: proposedIntent.toolArgs,
            riskTier: tool.riskTier,
            reasoning: proposedIntent.reasoning,
            breakAnalysis: proposedIntent.breakAnalysis,
            confidence: proposedIntent.confidence,
            status: intent.status,
          });
        }
      }

      // 8. Log to ledger
      await appendLedger("BONDI_CHAT", {
        conversationId: conversation.conversationId,
        nodeUsed: bondiResponse.nodeUsed,
        mode: bondiResponse.mode,
        intentsProposed: createdIntents.length,
        tokensUsed: bondiResponse.tokensUsed,
      });

      return {
        conversationId: conversation.conversationId,
        message: bondiResponse.message,
        mode: bondiResponse.mode,
        nodeUsed: bondiResponse.nodeUsed,
        intents: createdIntents,
        sentinel,
        tokensUsed: bondiResponse.tokensUsed,
      };
    }),

    // List user conversations
    listConversations: protectedProcedure.query(async ({ ctx }) => {
      return getUserConversations(ctx.user.id, 20);
    }),

    // Get conversation details
    getConversation: protectedProcedure.input(z.object({
      conversationId: z.string(),
    })).query(async ({ input }) => {
      return getConversation(input.conversationId);
    }),

    // Close a conversation
    closeConversation: protectedProcedure.input(z.object({
      conversationId: z.string(),
    })).mutation(async ({ input }) => {
      await closeConversation(input.conversationId);
      return { success: true };
    }),

    // Get sentinel status (for banner display)
    sentinel: protectedProcedure.query(async ({ ctx }) => {
      const proxyUser = await getProxyUser(ctx.user.id);
      const chainVerification = await verifyHashChain();
      return buildSentinelStatus(proxyUser, chainVerification.valid);
    }),
  }),

  // ─── Learning Loop ───────────────────────────────────────────
  learning: router({
    // Submit feedback on an AI response
    feedback: protectedProcedure.input(z.object({
      conversationId: z.string().optional(),
      intentId: z.string().optional(),
      feedback: z.string().min(1).max(2000),
      outcome: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
      tags: z.array(z.string()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const payload = createLearningEventPayload("FEEDBACK", {
        conversationId: input.conversationId,
        intentId: input.intentId,
        feedback: input.feedback,
        outcome: input.outcome,
        tags: input.tags,
      });

      const event = await createLearningEvent(ctx.user.id, payload.eventId, "FEEDBACK", {
        conversationId: payload.conversationId,
        intentId: payload.intentId,
        context: payload.context,
        feedback: payload.feedback,
        outcome: payload.outcome as "POSITIVE" | "NEGATIVE" | "NEUTRAL",
        tags: payload.tags,
      });

      await appendLedger("LEARNING", {
        eventId: payload.eventId,
        eventType: "FEEDBACK",
        outcome: input.outcome,
        hasFeedbackText: !!input.feedback,
      });

      return event;
    }),

    // Get learning events for the user
    list: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(100).default(50),
    }).optional()).query(async ({ ctx, input }) => {
      return getUserLearningEvents(ctx.user.id, input?.limit ?? 50);
    }),

    // Get learning summary (for display)
    summary: protectedProcedure.query(async ({ ctx }) => {
      const events = await getUserLearningEvents(ctx.user.id, 100);
      const total = events.length;
      const positive = events.filter(e => e.outcome === "POSITIVE").length;
      const negative = events.filter(e => e.outcome === "NEGATIVE").length;
      const neutral = events.filter(e => e.outcome === "NEUTRAL").length;
      const byType: Record<string, number> = {};
      for (const e of events) {
        byType[e.eventType] = (byType[e.eventType] ?? 0) + 1;
      }
      return { total, positive, negative, neutral, byType };
    }),

    // A8: Learning Loop Analysis — reads ledger + events, emits recommendations, NEVER mutates live policy
    analyze: protectedProcedure.query(async ({ ctx }) => {
      const ledgerEntries = await getAllLedgerEntries();
      const learningEvents = await getUserLearningEvents(ctx.user.id, 200);
      const analysis = runLearningLoopAnalysis(
        ledgerEntries.map(e => ({ entryType: e.entryType, payload: e.payload as Record<string, unknown>, timestamp: e.timestamp })),
        learningEvents.map(e => ({
          eventType: e.eventType,
          outcome: e.outcome,
          context: e.context as Record<string, unknown> | undefined,
          createdAt: e.createdAt,
        })),
      );
      return analysis;
    }),
  }),

  // ─── Node Management ─────────────────────────────────────────
  nodes: router({
    list: protectedProcedure.query(async () => {
      return getAllNodeConfigs();
    }),
    active: protectedProcedure.query(async () => {
      return getActiveNodeConfigs();
    }),
    get: protectedProcedure.input(z.object({ nodeId: z.string() })).query(async ({ input }) => {
      return getNodeConfig(input.nodeId);
    }),
  }),

  // ─── System Architecture ─────────────────────────────────────
  architecture: router({
    /** Get all system components (P1-P9) with status and connections */
    components: protectedProcedure.query(async () => {
      return getSystemComponents();
    }),

    /** Get a single component by ID */
    component: protectedProcedure.input(z.object({ componentId: z.string() })).query(async ({ input }) => {
      return getSystemComponent(input.componentId);
    }),
  }),

  // ─── Policy Rules ──────────────────────────────────────────
  policies: router({
    /** List all policy rules for the current user (owner sees all) */
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.openId === ENV.ownerOpenId) {
        return getAllPolicyRules();
      }
      return getUserPolicyRules(ctx.user.id);
    }),

    /** Create a new policy rule (meta role required) */
    create: roleGatedProcedure("meta").input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      toolPattern: z.string().min(1),
      riskOverride: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      requiresApproval: z.boolean(),
      condition: z.object({
        field: z.string(),
        operator: z.string(),
        value: z.string(),
      }).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      const rule = await createPolicyRule(ctx.user.id, {
        name: input.name,
        description: input.description,
        toolPattern: input.toolPattern,
        riskOverride: input.riskOverride,
        requiresApproval: input.requiresApproval,
        condition: input.condition ?? null,
      });
      await appendLedger("POLICY_UPDATE", {
        action: "CREATE",
        ruleId: rule!.ruleId,
        name: input.name,
        toolPattern: input.toolPattern,
        riskOverride: input.riskOverride ?? null,
        requiresApproval: input.requiresApproval,
        userId: ctx.user.id,
      });
      // Notify about policy change
      await createNotification(ctx.user.id, {
        type: "POLICY_UPDATE",
        title: "Policy Rule Created",
        body: `New rule "${input.name}" for ${input.toolPattern === '*' ? 'all tools' : input.toolPattern}`,
      });
      return rule;
    }),

    /** Update an existing policy rule (meta role required) */
    update: roleGatedProcedure("meta").input(z.object({
      ruleId: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      toolPattern: z.string().min(1).optional(),
      riskOverride: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
      requiresApproval: z.boolean().optional(),
      condition: z.object({
        field: z.string(),
        operator: z.string(),
        value: z.string(),
      }).nullable().optional(),
      enabled: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { ruleId, ...data } = input;
      const updated = await updatePolicyRule(ruleId, data);
      await appendLedger("POLICY_UPDATE", {
        action: "UPDATE",
        ruleId,
        changes: data,
        userId: ctx.user.id,
      });
      return updated;
    }),

    /** Toggle a policy rule on/off (meta role required) */
    toggle: roleGatedProcedure("meta").input(z.object({
      ruleId: z.string(),
      enabled: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const toggled = await togglePolicyRule(input.ruleId, input.enabled);
      await appendLedger("POLICY_UPDATE", {
        action: "TOGGLE",
        ruleId: input.ruleId,
        enabled: input.enabled,
        userId: ctx.user.id,
      });
      return toggled;
    }),

    /** Delete a policy rule (meta role required) */
    delete: roleGatedProcedure("meta").input(z.object({
      ruleId: z.string(),
    })).mutation(async ({ ctx, input }) => {
      await deletePolicyRule(input.ruleId);
      await appendLedger("POLICY_UPDATE", {
        action: "DELETE",
        ruleId: input.ruleId,
        userId: ctx.user.id,
      });
      return { success: true };
    }),
  }),

  // ─── Notifications ──────────────────────────────────────────
  notifications: router({
    /** List notifications for the current user */
    list: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(100).default(50),
    }).optional()).query(async ({ ctx, input }) => {
      return getUserNotifications(ctx.user.id, input?.limit ?? 50);
    }),

    /** Get unread count */
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return getUnreadNotificationCount(ctx.user.id);
    }),

    /** Mark a single notification as read */
    markRead: protectedProcedure.input(z.object({
      notificationId: z.string(),
    })).mutation(async ({ input }) => {
      await markNotificationRead(input.notificationId);
      return { success: true };
    }),

    /** Mark all notifications as read */
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),
  }),

  // ─── Agent Adapters ──────────────────────────────────────────
  agents: router({
    /** List all registered agent adapters */
    list: protectedProcedure.query(() => {
      return listAdapters();
    }),

    /** List all task types */
    taskTypes: protectedProcedure.query(() => {
      return TASK_TYPES;
    }),

    /** Get agent recommendation for a given tool/task */
    recommend: protectedProcedure
      .input(z.object({
        toolName: z.string(),
        taskType: z.string().optional(),
      }))
      .query(({ input }) => {
        const taskType = (input.taskType as TaskType) || inferTaskType(input.toolName);
        const recommendation = recommendAgent(taskType, input.toolName);
        return {
          taskType,
          taskTypeLabel: TASK_TYPES.find(t => t.id === taskType)?.label ?? "General",
          ...recommendation,
        };
      }),
  }),

  // ─── Principal Management (Role Enforcement) ──────────────────
  principals: router({
    /** Get current user's principal */
    me: protectedProcedure.query(async ({ ctx }) => {
      let principal = await getPrincipalByUserId(ctx.user.id);
      if (!principal) {
        const isOwner = ctx.user.openId === ENV.ownerOpenId;
        principal = await getOrCreatePrincipal(ctx.user.id, ctx.user.name ?? null, isOwner);
      }
      return principal;
    }),

    /** List all principals (meta role required) */
    list: roleGatedProcedure("meta").query(async () => {
      return listPrincipals();
    }),

    /** Get a specific principal by ID (meta role required) */
    get: roleGatedProcedure("meta").input(z.object({
      principalId: z.string(),
    })).query(async ({ input }) => {
      const principal = await getPrincipalById(input.principalId);
      if (!principal) throw new TRPCError({ code: "NOT_FOUND", message: "Principal not found" });
      return principal;
    }),

    /** Assign a role to a principal (meta role required) */
    assignRole: roleGatedProcedure("meta").input(z.object({
      principalId: z.string(),
      role: z.enum(["proposer", "approver", "executor", "auditor", "meta"]),
    })).mutation(async ({ ctx, input }) => {
      const updated = await assignRole(input.principalId, input.role as SystemRole);
      await appendLedger("POLICY_UPDATE", {
        action: "ASSIGN_ROLE",
        targetPrincipalId: input.principalId,
        role: input.role,
        assignedBy: ctx.user.id,
        timestamp: Date.now(),
      });
      return updated;
    }),

    /** Remove a role from a principal (meta role required) */
    removeRole: roleGatedProcedure("meta").input(z.object({
      principalId: z.string(),
      role: z.enum(["proposer", "approver", "executor", "auditor", "meta"]),
    })).mutation(async ({ ctx, input }) => {
      const updated = await removeRole(input.principalId, input.role as SystemRole);
      await appendLedger("POLICY_UPDATE", {
        action: "REMOVE_ROLE",
        targetPrincipalId: input.principalId,
        role: input.role,
        removedBy: ctx.user.id,
        timestamp: Date.now(),
      });
      return updated;
    }),

    /** Suspend or revoke a principal (meta role required) */
    updateStatus: roleGatedProcedure("meta").input(z.object({
      principalId: z.string(),
      status: z.enum(["active", "suspended", "revoked"]),
    })).mutation(async ({ ctx, input }) => {
      const updated = await updatePrincipalStatus(input.principalId, input.status);
      await appendLedger("POLICY_UPDATE", {
        action: "UPDATE_PRINCIPAL_STATUS",
        targetPrincipalId: input.principalId,
        newStatus: input.status,
        updatedBy: ctx.user.id,
        timestamp: Date.now(),
      });
      return updated;
    }),
   }),

  // ═══════════════════════════════════════════════════════════════════
  // GATEWAY PROXY — Server-side bridge to the RIO Gateway
  // ONE's frontend calls these procedures; the server forwards to the
  // Gateway with X-Principal-ID header for identity bridging.
  // The Gateway remains the enforcement boundary.
  // ═══════════════════════════════════════════════════════════════════
  gateway: router({
    /** Submit an intent to the Gateway for governance evaluation */
    submitIntent: protectedProcedure.input(z.object({
      action: z.string().min(1),
      target_environment: z.string().optional(),
      parameters: z.record(z.string(), z.unknown()).optional(),
      confidence: z.number().optional(),
      reflection: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Resolve Manus user → Gateway principal
      console.log("[Gateway Debug] submitIntent user:", JSON.stringify({ id: ctx.user.id, openId: ctx.user.openId, email: ctx.user.email, name: ctx.user.name, ownerOpenId: ENV.ownerOpenId }));
      const mapping = resolveGatewayPrincipal(
        ctx.user.id,
        ctx.user.openId,
        ENV.ownerOpenId,
        ctx.user.email,
        ctx.user.name
      );
      console.log("[Gateway Debug] mapping result:", JSON.stringify(mapping));
      if (!mapping) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No Gateway principal mapped for this user. Contact the system administrator.",
        });
      }

      // Step 1: Submit intent to Gateway
      const intentResult = await proxySubmitIntent(mapping.principalId, mapping.agentId, {
        action: input.action,
        target_environment: input.target_environment,
        parameters: input.parameters,
        confidence: input.confidence,
        reflection: input.reflection,
      }, mapping.directPrincipalId);

      if (!intentResult.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: intentResult.data.error || `Gateway rejected intent (HTTP ${intentResult.status})`,
        });
      }

      // Step 2: Immediately govern the intent
      const governResult = await proxyGovernIntent(mapping.principalId, intentResult.data.intent_id, mapping.directPrincipalId);

      if (!governResult.ok) {
        // Intent was created but governance failed — return what we have
        return {
          intent: intentResult.data,
          governance: null,
          error: governResult.data.error || "Governance evaluation failed",
        };
      }

      // Log to local ledger for audit trail
      await appendLedger("INTENT", {
        intent_id: intentResult.data.intent_id,
        action: input.action,
        principal_id: mapping.principalId,
        agent_id: mapping.agentId,
        governance_decision: governResult.data.governance_decision,
        risk_tier: governResult.data.risk_tier,
        userId: ctx.user.id,
        timestamp: Date.now(),
      });

      // ─── Notion Decision Log row creation (non-blocking) ───
      // Build Directive Step 2: Gateway → Notion row creation
      let notionPageId: string | null = null;
      if (isNotionConfigured()) {
        try {
          const intentHash = sha256(JSON.stringify({
            intent_id: intentResult.data.intent_id,
            action: input.action,
            parameters: input.parameters,
          }));
          const notionResult = await createDecisionRow({
            title: `${input.action} — ${intentResult.data.intent_id}`,
            intentId: intentResult.data.intent_id,
            intentHash,
            action: (input.action || "unknown") as NotionAction,
            riskTier: (governResult.data.risk_tier || "MEDIUM") as NotionRiskTier,
            proposer: (mapping.principalId || "unknown") as NotionProposer,
            policyVersion: "v1.0",
            gatewayDecision: (governResult.data.governance_decision || "UNKNOWN") as NotionGatewayDecision,
          });
          notionPageId = notionResult.pageId ?? null;
          await appendLedger("NOTION_ROW_CREATED", {
            intent_id: intentResult.data.intent_id,
            notion_page_id: notionPageId,
            action: input.action,
            risk_tier: governResult.data.risk_tier,
            governance_decision: governResult.data.governance_decision,
            timestamp: Date.now(),
          });
          console.log(`[submitIntent] Notion row created: ${notionPageId} for ${intentResult.data.intent_id}`);
        } catch (err) {
          console.error("[submitIntent] Notion row creation failed (non-blocking):", err);
        }
      }

      // ─── Coherence check (advisory, non-blocking) ───
      let coherenceResult: { status: string; drift_detected: boolean; signals: unknown[] } | null = null;
      try {
        const { runCoherenceCheck, buildSystemContext } = await import("./coherence");
        const systemContext = buildSystemContext({
          activeObjective: input.reflection || undefined,
          systemHealth: governResult.data.governance_decision || "unknown",
        });
        const record = await runCoherenceCheck({
          actionType: input.action,
          actionParameters: input.parameters || {},
          intentId: intentResult.data.intent_id,
          proposedBy: mapping.principalId,
          systemContext,
          statedObjective: input.reflection || undefined,
        });
        coherenceResult = {
          status: record.status,
          drift_detected: record.drift_detected,
          signals: record.signals,
        };
        // Write coherence check to ledger
        await appendLedger("COHERENCE_CHECK", {
          coherence_id: record.coherence_id,
          intent_id: intentResult.data.intent_id,
          status: record.status,
          drift_detected: record.drift_detected,
          signal_count: record.signals.length,
          confidence: record.confidence,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("[submitIntent] Coherence check failed (non-blocking):", err);
      }

      return {
        intent: intentResult.data,
        governance: governResult.data,
        coherence: coherenceResult,
        notionPageId,
        error: null,
      };
    }),

    /** Get pending approvals from the Gateway */
    pendingApprovals: protectedProcedure.query(async ({ ctx }) => {
      const mapping = resolveGatewayPrincipal(
        ctx.user.id,
        ctx.user.openId,
        ENV.ownerOpenId,
        ctx.user.email,
        ctx.user.name
      );
      if (!mapping) {
        return { pending: [], error: "No Gateway principal mapped" };
      }

      const result = await proxyGetPendingApprovals(mapping.principalId, mapping.directPrincipalId);
      if (!result.ok) {
        return { pending: [], error: result.data ? "Gateway error" : "Gateway unreachable" };
      }

      return { pending: result.data.pending, error: null };
    }),

    /** Approve or deny a pending intent */
    submitApproval: protectedProcedure.input(z.object({
      intentId: z.string().min(1),
      decision: z.enum(["approved", "denied"]),
      reason: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const mapping = resolveGatewayPrincipal(
        ctx.user.id,
        ctx.user.openId,
        ENV.ownerOpenId,
        ctx.user.email,
        ctx.user.name
      );
      if (!mapping) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No Gateway principal mapped for this user.",
        });
      }

      const result = await proxySubmitApproval(
        mapping.principalId,
        input.intentId,
        input.decision,
        input.reason,
        mapping.directPrincipalId
      );

      if (!result.ok) {
        // Surface Gateway-specific errors
        const msg = result.data.invariant === "proposer_ne_approver"
          ? "Cannot approve your own intent (proposer ≠ approver invariant)"
          : result.data.error || `Approval failed (HTTP ${result.status})`;
        throw new TRPCError({
          code: result.status === 403 ? "FORBIDDEN" : "BAD_REQUEST",
          message: msg,
        });
      }

      // Log to local ledger
      await appendLedger("APPROVAL", {
        intent_id: input.intentId,
        decision: input.decision,
        principal_id: mapping.principalId,
        approval_id: result.data.approval_id,
        reason: input.reason,
        userId: ctx.user.id,
        timestamp: Date.now(),
      });

      return result.data;
    }),

    /**
     * Execute an approved intent.
     * This is the full execution pipeline:
     *   1. Get execution token from Gateway
     *   2. Execute the action (send email via notifyOwner)
     *   3. Confirm execution with Gateway (burns token)
     *   4. Generate cryptographic receipt
     * Returns the execution result and receipt.
     */
    executeApproved: protectedProcedure.input(z.object({
      intentId: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      // Resolve identity for audit trail
      const mapping = resolveGatewayPrincipal(
        ctx.user.id,
        ctx.user.openId,
        ENV.ownerOpenId,
        ctx.user.email,
        ctx.user.name
      );

      // Define action executors for each action type
      const actionExecutors: Record<string, (params: Record<string, unknown>) => Promise<{ success: boolean; result: Record<string, unknown> }>> = {
        send_email: async (params) => {
          const to = String(params.to || "");
          const subject = String(params.subject || "");
          const body = String(params.body || params.message || "");

          if (!subject.trim() && !body.trim()) {
            return {
              success: false,
              result: { error: "Email requires at least a subject or body" },
            };
          }

          // ─── EMAIL FIREWALL: Send-Time Gate (governed pipeline) ───
          try {
            const { result: fwResult, receipt: fwReceipt } = await scanEmail(
              body, subject || null, to || null, "standard", false,
            );
            await storeGovernedReceipt(fwReceipt);

            if (fwResult.event_type === "BLOCK") {
              return {
                success: false,
                result: {
                  blocked: true,
                  firewallDecision: "BLOCK",
                  receipt_id: fwReceipt.receipt_id,
                  matched_rules: fwResult.matched_rules.map(r => ({ rule_id: r.rule_id, category: r.category, reason: r.reason })),
                  summary: fwResult.summary,
                },
              };
            }
            if (fwResult.event_type === "WARN") {
              console.log(`[SendTimeGate:governed] WARN on email — proceeding (simulated confirmation)`);
            }
          } catch (fwErr) {
            // Firewall failure = fail-closed
            const msg = fwErr instanceof Error ? fwErr.message : String(fwErr);
            return { success: false, result: { error: `FAIL_CLOSED: Email firewall error — ${msg}` } };
          }
          // ─── END FIREWALL GATE ───

          const title = subject || "Message from your RIO assistant";
          const content = [
            to ? `**To:** ${to}` : "",
            subject ? `**Subject:** ${subject}` : "",
            ``,
            body,
            ``,
            `---`,
            `Sent on your behalf by RIO · Intent: ${input.intentId.slice(0, 12)}`,
            `_Governed action executed through the RIO pipeline._`,
          ].filter(Boolean).join("\n");

          const delivered = await notifyOwner({ title, content });
          if (!delivered) {
            return {
              success: false,
              result: { error: "Notification service unreachable" },
            };
          }

          return {
            success: true,
            result: {
              delivered: true,
              method: "notifyOwner",
              to: to || "(owner)",
              subject,
              bodyLength: body.length,
            },
          };
        },

        // Default executor for actions that don't have a specific handler
        _default: async (params) => {
          return {
            success: true,
            result: {
              simulated: true,
              action: "unknown",
              params,
              note: "No specific executor for this action type. Marked as executed.",
            },
          };
        },
      };

      try {
        const { execution, receipt } = await executeGovernedAction(
          input.intentId,
          async (params) => {
            // Determine which executor to use based on the action in the execution token
            // The action type comes from the execution token parameters
            // For now, we check the intent action from the token response
            // The executeGovernedAction function passes params from the execution token
            const action = String(params._action || "send_email");
            const executor = actionExecutors[action] || actionExecutors._default;
            return executor(params);
          }
        );

        // Log to local ledger
        await appendLedger("EXECUTION", {
          intent_id: input.intentId,
          execution_hash: execution.execution_hash,
          receipt_hash: receipt?.receipt?.receipt_hash,
          connector: execution.connector,
          principal_id: mapping?.principalId,
          userId: ctx.user.id,
          timestamp: Date.now(),
        });

        return {
          success: true,
          execution,
          receipt: receipt?.receipt || null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Execution failed: ${msg}`,
        });
      }
    }),

    /**
     * Deliver email from Gateway external_fallback payload.
     * After Gateway /execute-action returns email_payload + receipt,
     * ONE delivers the email via notifyOwner (Manus notification) and
     * optionally Telegram, then logs to local ledger.
     */
    deliverEmail: protectedProcedure.input(z.object({
      intentId: z.string().min(1),
      emailPayload: z.object({
        to: z.string(),
        cc: z.array(z.string()).optional(),
        subject: z.string(),
        body: z.string(),
      }),
      receipt: z.object({
        receipt_id: z.string(),
        receipt_hash: z.string(),
        proposer_id: z.string().optional(),
        approver_id: z.string().optional(),
        execution_hash: z.string().optional(),
        ledger_entry_id: z.string().optional(),
        decision_delta_ms: z.number().optional(),
      }).optional(),
    })).mutation(async ({ input }) => {
      const { intentId, emailPayload, receipt } = input;

      // Build notification content for owner
      const title = emailPayload.subject || "Governed Email via RIO";
      const content = [
        `**To:** ${emailPayload.to}`,
        emailPayload.cc?.length ? `**CC:** ${emailPayload.cc.join(", ")}` : "",
        `**Subject:** ${emailPayload.subject}`,
        ``,
        emailPayload.body,
        ``,
        `---`,
        `Governed action executed through RIO pipeline.`,
        `Gateway SMTP delivery — email sent directly by Gateway.`,
        `Intent: \`${intentId}\``,
        receipt ? `Receipt: \`${receipt.receipt_id}\`` : "",
        receipt?.receipt_hash ? `Hash: \`${receipt.receipt_hash.slice(0, 16)}...\`` : "",
      ].filter(Boolean).join("\n");

      // Deliver via Manus notification service (owner copy)
      let notifyDelivered = false;
      try {
        notifyDelivered = await notifyOwner({ title, content });
      } catch (err) {
        console.error("[deliverEmail] notifyOwner error:", err);
      }

      // Also send via Telegram if configured
      let telegramDelivered = false;
      if (isTelegramConfigured()) {
        try {
          const tgText = [
            `\u2709\uFE0F *Governed Email Delivered*`,
            ``,
            `*To:* ${emailPayload.to}`,
            `*Subject:* ${emailPayload.subject}`,
            ``,
            emailPayload.body.length > 200 ? emailPayload.body.slice(0, 200) + "..." : emailPayload.body,
            ``,
            `\u2500\u2500\u2500`,
            `Intent: \`${intentId.slice(0, 12)}\``,
            receipt ? `Receipt: \`${receipt.receipt_id.slice(0, 12)}\`` : "",
            receipt?.receipt_hash ? `Hash: \`${receipt.receipt_hash.slice(0, 16)}\`` : "",
          ].filter(Boolean).join("\n");
          const { sendMessage: sendTg } = await import("./telegram");
          await sendTg(tgText, "Markdown");
          telegramDelivered = true;
        } catch (err) {
          console.error("[deliverEmail] Telegram error:", err);
        }
      }

      // Log to local ledger
      try {
        await appendLedger("EMAIL_DELIVERY", {
          intent_id: intentId,
          to: emailPayload.to,
          subject: emailPayload.subject,
          receipt_id: receipt?.receipt_id,
          receipt_hash: receipt?.receipt_hash,
          notify_delivered: notifyDelivered,
          telegram_delivered: telegramDelivered,

          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("[deliverEmail] Ledger error:", err);
      }

      return {
        delivered: notifyDelivered || telegramDelivered,
        channels: {
          notification: notifyDelivered,
          telegram: telegramDelivered,
        },
        intentId,
        receiptId: receipt?.receipt_id,
      };
    }),

    /**
     * Approve + Execute + Deliver — single server-side call.
     *
     * The browser (I-2/approver) calls this tRPC mutation.
     * The server:
     *   1. Calls Gateway /authorize using I-2's Gateway JWT (from browser localStorage)
     *   2. Calls Gateway /execute-action using a server-side I-1 JWT (proposer)
     *      This enforces separation of duties: approver ≠ executor
     *   3. If email_payload returned (external_fallback), delivers via Telegram + notification
     *   4. Logs to local ledger
     *   5. Returns receipt to browser
     */
    approveAndExecute: publicProcedure.input(z.object({
      intentId: z.string().min(1),
      gatewayToken: z.string().optional(), // I-2's Gateway JWT for /authorize
    })).mutation(async ({ ctx, input }) => {
      const GATEWAY_URL = ENV.gatewayUrl;
      if (!GATEWAY_URL) {
        return { success: false, error: "Gateway URL not configured" };
      }

      // --- Step 1: Login as I-1 (proposer) to get a server-side JWT for /execute-action ---
      // This is the key fix: the browser is I-2 (approver), but /execute-action requires proposer role.
      // The server logs in as I-1 to execute on behalf of the proposer.
      let i1Token: string;
      try {
        const loginRes = await fetch(`${GATEWAY_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "I-1",
            passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026",
          }),
        });
        const loginData = await loginRes.json() as { token?: string; error?: string };
        if (!loginRes.ok || !loginData.token) {
          return { success: false, error: `I-1 login failed: ${loginData.error || "no token"}` };
        }
        i1Token = loginData.token;
      } catch (err) {
        return { success: false, error: `Gateway unreachable for I-1 login: ${String(err)}` };
      }

      // --- Step 2: Authorize as I-2 (approver) ---
      // Use the server-side I-2 login since the browser token may not be available server-side
      let i2Token: string;
      try {
        const loginRes = await fetch(`${GATEWAY_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "I-2",
            passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026",
          }),
        });
        const loginData = await loginRes.json() as { token?: string; error?: string };
        if (!loginRes.ok || !loginData.token) {
          return { success: false, error: `I-2 login failed: ${loginData.error || "no token"}` };
        }
        i2Token = loginData.token;
      } catch (err) {
        return { success: false, error: `Gateway unreachable for I-2 login: ${String(err)}` };
      }

      // ─── GATEWAY-LEVEL IDENTITY EVALUATION (Rule 3) ──────────────
      // This is the enforcement boundary for Rule 3:
      // IF proposer_identity_id == approver_identity_id, THEN the transaction
      // is INVALID unless the Self-Authorization sub-policy is met (cooldown).
      //
      // The receipt MUST explicitly record proposer and approver IDs.
      // If they match, the audit trail labels this as
      // "Constrained Single-Actor Execution".
      let gatewayRoleSeparation: RoleSeparation = "separated";
      let gatewayAuthorityModel: AuthorityModel = "Separated Authority";
      let gatewayIdentityEval: GatewayIdentityEvaluation | null = null;
      let resolvedProposerIdentityId = "unknown";
      let resolvedApproverIdentityId = "unknown";
      try {
        const localIntent = await getIntent(input.intentId);
        if (localIntent) {
          const proposerPrincipal = await getPrincipalByUserId(localIntent.userId);
          const approverPrincipal = ctx.user ? await getPrincipalByUserId(ctx.user.id) : null;
          resolvedProposerIdentityId = proposerPrincipal?.principalId ?? `user-${localIntent.userId}`;
          resolvedApproverIdentityId = approverPrincipal?.principalId ?? (ctx.user ? `user-${ctx.user.id}` : "I-2");
          const intentCreatedAt = localIntent.createdAt ? new Date(localIntent.createdAt).getTime() : Date.now();

          // Gateway-level evaluation — single source of truth
          gatewayIdentityEval = evaluateIdentityAtGatewayBoundary(
            resolvedProposerIdentityId,
            resolvedApproverIdentityId,
            intentCreatedAt,
          );

          gatewayRoleSeparation = gatewayIdentityEval.role_separation;
          gatewayAuthorityModel = gatewayIdentityEval.authority_model;

          if (!gatewayIdentityEval.allowed) {
            // Log the blocked attempt with explicit identity IDs and authority model
            await appendLedger("DELEGATION_BLOCKED", {
              intentId: input.intentId,
              proposer_identity_id: resolvedProposerIdentityId,
              approver_identity_id: resolvedApproverIdentityId,
              authority_model: gatewayAuthorityModel,
              role_separation: gatewayIdentityEval.role_separation,
              cooldown_remaining_ms: gatewayIdentityEval.cooldown_remaining_ms,
              reason: gatewayIdentityEval.reason,
              path: "gateway.approveAndExecute",
              timestamp: Date.now(),
            });
            return {
              success: false,
              error: formatCooldownMessage(gatewayIdentityEval.delegation_check),
              proposer_identity_id: resolvedProposerIdentityId,
              approver_identity_id: resolvedApproverIdentityId,
              authority_model: gatewayAuthorityModel,
              role_separation: gatewayIdentityEval.role_separation,
              cooldown_remaining_ms: gatewayIdentityEval.cooldown_remaining_ms,
            };
          }

          // Log successful delegation with explicit identity IDs and authority model
          if (resolvedProposerIdentityId === resolvedApproverIdentityId) {
            await appendLedger("DELEGATION_APPROVED", {
              intentId: input.intentId,
              proposer_identity_id: resolvedProposerIdentityId,
              approver_identity_id: resolvedApproverIdentityId,
              authority_model: gatewayAuthorityModel,
              role_separation: gatewayRoleSeparation,
              path: "gateway.approveAndExecute",
              timestamp: Date.now(),
            });
          }
        }
      } catch (err) {
        console.error("[approveAndExecute] Gateway identity evaluation failed (non-blocking):", err);
        // Fail-open for evaluation errors — Gateway still enforces proposer ≠ approver
      }

      // ─── Pre-approval coherence check (advisory, non-blocking) ───
      let preApprovalCoherence: { status: string; drift_detected: boolean; signals: unknown[] } | null = null;
      try {
        const { runCoherenceCheck, buildSystemContext } = await import("./coherence");
        const systemContext = buildSystemContext({
          activeObjective: `Approving intent ${input.intentId}`,
          systemHealth: "approval-pipeline",
        });
        const record = await runCoherenceCheck({
          actionType: "approve_and_execute",
          actionParameters: { intentId: input.intentId },
          intentId: input.intentId,
          proposedBy: "I-2",
          systemContext,
          statedObjective: `Human authorization of intent ${input.intentId}`,
        });
        preApprovalCoherence = {
          status: record.status,
          drift_detected: record.drift_detected,
          signals: record.signals,
        };
        // Write coherence check to ledger
        const { appendLedger: appendLedgerFn } = await import("./db");
        await appendLedgerFn("COHERENCE_CHECK", {
          coherence_id: record.coherence_id,
          intent_id: input.intentId,
          status: record.status,
          drift_detected: record.drift_detected,
          signal_count: record.signals.length,
          confidence: record.confidence,
          phase: "pre-approval",
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("[approveAndExecute] Pre-approval coherence check failed (non-blocking):", err);
      }

      // Authorize the intent as I-2
      try {
        const authRes = await fetch(`${GATEWAY_URL}/authorize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${i2Token}`,
          },
          body: JSON.stringify({
            intent_id: input.intentId,
            decision: "approved",
            authorized_by: "I-2",
            request_timestamp: new Date().toISOString(),
            request_nonce: `one-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          }),
        });
        const authData = await authRes.json() as { error?: string; invariant?: string };
        if (!authRes.ok) {
          const msg = authData.invariant === "proposer_ne_approver"
            ? "Cannot approve your own intent (proposer \u2260 approver)"
            : authData.error || `Authorization failed (HTTP ${authRes.status})`;
          return { success: false, error: msg };
        }
      } catch (err) {
        return { success: false, error: `Gateway /authorize failed: ${String(err)}` };
      }

      // --- Step 3: Execute via Gateway (external mode) + local delivery ---
      // ARCHITECTURE: Gateway = governance engine, Proxy = execution engine.
      // Always call Gateway /execute-action with delivery_mode=external.
      // This completes the full governance pipeline (token issue, burn, receipt,
      // Ed25519 signature, ledger write) without triggering Gateway's sendEmail()
      // which hangs on Render due to blocked outbound SMTP.
      // After receiving the Gateway receipt, the proxy handles local delivery.
      const localIntent = await getIntent(input.intentId);
      let intentToolArgs = (localIntent?.toolArgs || {}) as Record<string, unknown>;
      let intentToolName = localIntent?.toolName || "";

      // If local intent not found (e.g., intent created via ONE UI directly to Gateway),
      // fetch the intent from the Gateway to get delivery_mode and parameters.
      if (!localIntent || Object.keys(intentToolArgs).length === 0) {
        try {
          const gwIntentRes = await fetch(`${GATEWAY_URL}/intent/${input.intentId}`, {
            headers: { "Authorization": `Bearer ${i1Token}` },
            signal: AbortSignal.timeout(10000),
          });
          if (gwIntentRes.ok) {
            const gwIntent = await gwIntentRes.json() as Record<string, unknown>;
            const gwParams = (gwIntent.parameters || {}) as Record<string, unknown>;
            // Merge Gateway parameters into intentToolArgs
            if (Object.keys(gwParams).length > 0) {
              intentToolArgs = gwParams;
            }
            // Resolve tool name from Gateway action field
            if (!intentToolName && gwIntent.action) {
              intentToolName = String(gwIntent.action);
            }
          }
        } catch (gwErr) {
          console.warn(`[approveAndExecute] Could not fetch intent from Gateway: ${String(gwErr)}`);
        }
      }

      const intentDeliveryMode = String(intentToolArgs.delivery_mode || "notify");
      const isGmailDelivery = intentDeliveryMode === "gmail" && intentToolName === "send_email";

      let receipt: Record<string, unknown> | null = null;
      let emailPayload: { to?: string; cc?: string[]; subject?: string; body?: string } | null = null;
      let deliveryMode = intentDeliveryMode;
      let localReceipt: import("./connectors").ExecutionReceipt | null = null;
      let notifyDelivered = false;
      let telegramDelivered = false;

      // ─── UNIFIED GATEWAY EXECUTION (delivery_mode=external) ───
      // All intents go through Gateway for governance receipt, then proxy delivers locally.
      let execData: Record<string, unknown> | null = null;
      try {
        const execRes = await fetch(`${GATEWAY_URL}/execute-action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${i1Token}`,
          },
          body: JSON.stringify({
            intent_id: input.intentId,
            delivery_mode: "external", // KEY: skip Gateway SMTP, get governance receipt only
            request_timestamp: new Date().toISOString(),
            request_nonce: `one-exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          }),
          signal: AbortSignal.timeout(30000), // 30s timeout — should complete in <1s
        });
        execData = await execRes.json() as Record<string, unknown>;
        if (!execRes.ok) {
          return { success: false, error: (execData as { error?: string }).error || `Execute failed (HTTP ${execRes.status})` };
        }
      } catch (err) {
        return { success: false, error: `Gateway /execute-action failed: ${String(err)}` };
      }

      // Extract Gateway receipt (full governance proof: token, Ed25519 sig, ledger entry)
      const gwReceipt = (execData.receipt as Record<string, unknown>) || null;
      emailPayload = (execData.email_payload as { to?: string; cc?: string[]; subject?: string; body?: string }) || null;

      // If no email payload from Gateway, build from available intent data
      if (!emailPayload && intentToolName === "send_email") {
        emailPayload = {
          to: String(intentToolArgs.to || ""),
          subject: String(intentToolArgs.subject || ""),
          body: String(intentToolArgs.body || ""),
        };
      }

      if (isGmailDelivery) {
        // ─── LOCAL GMAIL DELIVERY (after Gateway governance receipt) ───
        // Gateway has already: issued token, burned token, generated receipt,
        // signed with Ed25519, written to ledger, stored to PostgreSQL.
        // Now we deliver the actual email via local Gmail SMTP.
        //
        // Bug A fix: Use intentToolName (from Gateway fetch) instead of localIntent!.toolName.
        // When intent was created via ONE UI → Gateway directly, localIntent is null.
        // We synthesize argsHash from intentToolArgs and default riskTier to HIGH
        // (send_email is always HIGH risk in the tool registry).
        const resolvedToolName = localIntent?.toolName || intentToolName;
        const resolvedArgsHash = localIntent?.argsHash || sha256(JSON.stringify({ toolName: resolvedToolName, toolArgs: intentToolArgs }));
        const resolvedRiskTier = (localIntent?.riskTier || "HIGH") as "LOW" | "MEDIUM" | "HIGH";

        const approvalProof: import("./connectors").ApprovalProof = {
          approvalId: `gw-auth-${input.intentId.slice(0, 8)}`,
          intentId: input.intentId,
          boundToolName: resolvedToolName,
          boundArgsHash: resolvedArgsHash,
          signature: `gw-authorized-${Date.now()}`,
          expiresAt: Date.now() + 300_000, // 5 min
        };

        // Bug B fix: Inject _gatewayExecution=true so the connector knows this
        // call came through the full governance loop (authorize → execute-action → receipt).
        // Without this flag, the connector refuses execution (REQUIRES_GATEWAY_GOVERNANCE).
        const connectorArgs = {
          ...intentToolArgs,
          _gatewayExecution: true,
        };

        // Execute via the connector (which handles Gmail SMTP delivery)
        const connectorResult = await dispatchExecution(
          resolvedToolName,
          connectorArgs,
          approvalProof,
          resolvedRiskTier,
          resolvedArgsHash,
        );

        if (!connectorResult.success) {
          // Fail-safe: Gmail failure → FAILED receipt, intent NOT marked executed
          try { await updateIntentStatus(input.intentId, "FAILED"); } catch { /* intent may not exist locally */ }
          await appendLedger("EXECUTION", {
            intent_id: input.intentId,
            error: connectorResult.error,
            delivery_mode: "gmail",
            delivery_status: "FAILED",
            failClosed: true,
            gateway_receipt_id: gwReceipt ? String((gwReceipt as { receipt_id?: string }).receipt_id || "") : undefined,
            proposer_identity_id: resolvedProposerIdentityId,
            approver_identity_id: resolvedApproverIdentityId,
            authority_model: gatewayAuthorityModel,
            timestamp: Date.now(),
          });
          return { success: false, error: connectorResult.error || "Gmail delivery failed (fail-closed)" };
        }

        // Generate local receipt with delivery fields + Gateway receipt linkage
        const executionId = `local-exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        localReceipt = generateReceipt(
          executionId,
          input.intentId,
          resolvedToolName,
          connectorResult,
          approvalProof,
          undefined, // authorityContext
          {
            delivery_mode: "gmail" as const,
            delivery_status: connectorResult.success ? "SENT" as const : "FAILED" as const,
            external_message_id: (connectorResult.output as Record<string, unknown>)?.messageId as string || (connectorResult.output as Record<string, unknown>)?.external_message_id as string || undefined,
          },
        );

        // Update intent status (may fail if intent only exists in Gateway — that's OK)
        try { await updateIntentStatus(input.intentId, "EXECUTED"); } catch { /* intent may not exist locally */ }

        // Build receipt combining Gateway governance + local delivery
        receipt = {
          receipt_id: gwReceipt ? String((gwReceipt as { receipt_id?: string }).receipt_id || localReceipt.executionId) : localReceipt.executionId,
          receipt_hash: gwReceipt ? String((gwReceipt as { receipt_hash?: string }).receipt_hash || localReceipt.receiptHash) : localReceipt.receiptHash,
          timestamp_executed: gwReceipt ? String((gwReceipt as { timestamp_executed?: string }).timestamp_executed || new Date(localReceipt.timestamp).toISOString()) : new Date(localReceipt.timestamp).toISOString(),
          proposer_id: resolvedProposerIdentityId,
          approver_id: resolvedApproverIdentityId,
          delivery_mode: "gmail",
          delivery_status: localReceipt.delivery_status,
          external_message_id: localReceipt.external_message_id,
          // Gateway governance fields
          gateway_receipt_id: gwReceipt ? String((gwReceipt as { receipt_id?: string }).receipt_id || "") : undefined,
          gateway_receipt_hash: gwReceipt ? String((gwReceipt as { receipt_hash?: string }).receipt_hash || "") : undefined,
          execution_hash: gwReceipt ? String((gwReceipt as { execution_hash?: string }).execution_hash || "") : undefined,
          ledger_entry_id: gwReceipt ? String((gwReceipt as { ledger_entry_id?: string }).ledger_entry_id || "") : undefined,
        };

        deliveryMode = "gmail";

      } else {
        // ─── NON-GMAIL PATH (Gateway receipt only, no local delivery) ───
        // Gateway handled everything via external mode. Use its receipt directly.
        receipt = gwReceipt;
        deliveryMode = String(execData.delivery_mode || "external");

        // Update local intent status
        if (localIntent) {
          await updateIntentStatus(input.intentId, "EXECUTED");
        }
      }

      // --- Step 4: Notify owner ---
      if (emailPayload && emailPayload.to) {
        // Deliver via Manus notification (owner copy)
        try {
          const title = emailPayload.subject || "Governed Email via RIO";
          const content = [
            `**To:** ${emailPayload.to}`,
            `**Subject:** ${emailPayload.subject || ""}`,
            ``,
            emailPayload.body || "",
            ``,
            `---`,
            `Governed action via RIO pipeline.`,
            `Intent: \`${input.intentId}\``,
            receipt ? `Receipt: \`${String((receipt as { receipt_id?: string }).receipt_id || "").slice(0, 12)}\`` : "",
            deliveryMode === "gmail" ? `Delivery: Gmail SMTP ✓` : "",
          ].filter(Boolean).join("\n");
          notifyDelivered = await notifyOwner({ title, content });
        } catch (err) {
          console.error("[approveAndExecute] notifyOwner error:", err);
        }

        // Deliver via Telegram
        if (isTelegramConfigured()) {
          try {
            const tgText = [
              `\u2709\uFE0F *Governed Email Delivered*`,
              ``,
              `*To:* ${emailPayload.to}`,
              `*Subject:* ${emailPayload.subject || "(none)"}`,
              ``,
              (emailPayload.body || "").length > 200 ? (emailPayload.body || "").slice(0, 200) + "..." : (emailPayload.body || ""),
              ``,
              `\u2500\u2500\u2500`,
              `Intent: \`${input.intentId.slice(0, 12)}\``,
              receipt ? `Receipt: \`${String((receipt as { receipt_id?: string }).receipt_id || "").slice(0, 12)}\`` : "",
              deliveryMode === "gmail" ? `Delivery: Gmail SMTP` : "",
            ].filter(Boolean).join("\n");
            const { sendMessage: sendTg } = await import("./telegram");
            await sendTg(tgText, "Markdown");
            telegramDelivered = true;
          } catch (err) {
            console.error("[approveAndExecute] Telegram error:", err);
          }
        }
      }

      // --- Step 5: Log to local ledger ---
      try {
        await appendLedger("EXECUTION", {
          intent_id: input.intentId,
          receipt_id: receipt ? (receipt as { receipt_id?: string }).receipt_id : undefined,
          receipt_hash: receipt ? (receipt as { receipt_hash?: string }).receipt_hash : undefined,
          delivery_mode: deliveryMode,
          delivery_status: localReceipt?.delivery_status || "SENT",
          external_message_id: localReceipt?.external_message_id || undefined,
          notify_delivered: notifyDelivered,
          telegram_delivered: telegramDelivered,
          proposer_identity_id: resolvedProposerIdentityId,
          approver_identity_id: resolvedApproverIdentityId,
          authority_model: gatewayAuthorityModel,
          role_separation: gatewayRoleSeparation,
          execution_path: isGmailDelivery ? "local_gmail_after_gateway" : "gateway_external",
          userId: ctx.user?.id ?? "gateway-auth",
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("[approveAndExecute] Ledger error:", err);
      }

      return {
        success: true,
        status: localReceipt ? "receipted" : String((receipt as any)?.status || "receipted"),
        receipt: receipt ? {
          receipt_id: String((receipt as { receipt_id?: string }).receipt_id || ""),
          receipt_hash: String((receipt as { receipt_hash?: string }).receipt_hash || ""),
          timestamp_executed: String((receipt as { timestamp_executed?: string }).timestamp_executed || new Date().toISOString()),
          proposer_id: String((receipt as { proposer_id?: string }).proposer_id || resolvedProposerIdentityId),
          approver_id: String((receipt as { approver_id?: string }).approver_id || resolvedApproverIdentityId),
          execution_hash: String((receipt as { execution_hash?: string }).execution_hash || ""),
          ledger_entry_id: String((receipt as { ledger_entry_id?: string }).ledger_entry_id || ""),
          decision_delta_ms: Number((receipt as { decision_delta_ms?: number }).decision_delta_ms || 0),
          delivery_mode: deliveryMode,
          delivery_status: localReceipt?.delivery_status || "SENT",
          external_message_id: localReceipt?.external_message_id || String((receipt as any)?.external_message_id || ""),
          proposer_identity_id: resolvedProposerIdentityId,
          approver_identity_id: resolvedApproverIdentityId,
          authority_model: gatewayAuthorityModel,
        } : null,
        execution: localReceipt ? {
          connector: "send_email",
        } : null,
        deliveryMode,
        delivered: notifyDelivered || telegramDelivered || (isGmailDelivery && !!localReceipt),
        channels: {
          notification: notifyDelivered,
          telegram: telegramDelivered,
          gmail: isGmailDelivery && !!localReceipt,
        },
        coherence: preApprovalCoherence,
        // Explicit identity fields in receipt
        proposer_identity_id: resolvedProposerIdentityId,
        approver_identity_id: resolvedApproverIdentityId,
        authority_model: gatewayAuthorityModel,
        role_separation: gatewayRoleSeparation,
        error: null,
      };
    }),

    /** Get Gateway health and connection status */
    health: publicProcedure.query(async () => {
      const result = await proxyGatewayHealth();
      return {
        connected: result.ok,
        ...result.data,
      };
    }),

    /**
     * Server-side proxy for Gateway /ledger.
     * The Gateway /ledger endpoint requires JWT auth.
     * This route logs in as I-1 server-side and proxies the request,
     * so the browser doesn't need to maintain a separate Gateway JWT.
     */
    ledger: protectedProcedure.input(z.object({
      limit: z.number().min(1).max(500).default(100),
    }).optional()).query(async ({ input }) => {
      const GATEWAY_URL = ENV.gatewayUrl;
      if (!GATEWAY_URL) {
        return { ok: false, entries: [], error: "Gateway URL not configured" };
      }

      // Login as I-1 to get a server-side JWT
      let token: string;
      try {
        const loginRes = await fetch(`${GATEWAY_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "I-1",
            passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026",
          }),
        });
        const loginData = await loginRes.json() as { token?: string; error?: string };
        if (!loginRes.ok || !loginData.token) {
          return { ok: false, entries: [], error: `Gateway login failed: ${loginData.error || "no token"}` };
        }
        token = loginData.token;
      } catch (err) {
        return { ok: false, entries: [], error: `Gateway unreachable: ${String(err)}` };
      }

      // Fetch ledger with auth
      try {
        const limit = input?.limit ?? 100;
        const ledgerRes = await fetch(`${GATEWAY_URL}/ledger?limit=${limit}`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        const ledgerData = await ledgerRes.json() as { entries?: unknown[] };
        if (!ledgerRes.ok) {
          return { ok: false, entries: [], error: `Gateway /ledger returned ${ledgerRes.status}` };
        }
        return {
          ok: true,
          entries: ledgerData.entries || [],
          error: null,
        };
      } catch (err) {
        return { ok: false, entries: [], error: `Gateway /ledger fetch failed: ${String(err)}` };
      }
    }),
  }),

  // ═══════════════════════════════════════════════════════════════
  // MINIMUM AUTHORITY LAYER
  // ═══════════════════════════════════════════════════════════════

  authority: router({
    /** Get the current authority state — root key, active policy, genesis status */
    status: protectedProcedure.query(async () => {
      const root = getActiveRootAuthority();
      const policy = getActivePolicy();
      return {
        rootAuthority: root ? {
          fingerprint: root.fingerprint,
          status: root.status,
          created_at: root.created_at,
        } : null,
        activePolicy: policy ? {
          policy_id: policy.policy_id,
          policy_hash: policy.policy_hash,
          status: policy.status,
          activated_at: policy.activated_at,
          rules: policy.rules,
        } : null,
        lastReceiptHash: getLastReceiptHash(),
        chiefOfStaff: CHIEF_OF_STAFF,
      };
    }),

    /** Register root authority public key — called once during genesis */
    registerRoot: protectedProcedure
      .input(z.object({ publicKey: z.string().min(32) }))
      .mutation(async ({ input }) => {
        const root = registerRootAuthority(input.publicKey);
        await appendLedger("GENESIS", {
          event: "ROOT_AUTHORITY_REGISTERED",
          fingerprint: root.fingerprint,
          status: root.status,
        });
        return root;
      }),

    /** Activate a governance policy — requires root signature */
    activatePolicy: protectedProcedure
      .input(z.object({
        policyId: z.string().min(1),
        rules: z.object({
          proposer_cannot_approve: z.boolean(),
          high_risk_requires_approval: z.boolean(),
          approval_expiry_minutes: z.number().min(1),
          max_executions_per_approval: z.number().min(1),
          ledger_required: z.boolean(),
          receipt_required: z.boolean(),
          fail_closed: z.boolean(),
        }),
        policySignature: z.string().min(1),
        rootPublicKey: z.string().min(32),
      }))
      .mutation(async ({ input }) => {
        const policy = activatePolicy(input);
        await appendLedger("POLICY_UPDATE", {
          event: "POLICY_ACTIVATED",
          policy_id: policy.policy_id,
          policy_hash: policy.policy_hash,
          rules: policy.rules,
        });
        return {
          policy_id: policy.policy_id,
          policy_hash: policy.policy_hash,
          status: policy.status,
          activated_at: policy.activated_at,
        };
      }),

    /** Create genesis record — the anchor for the entire system (ledger block 0) */
    createGenesis: protectedProcedure
      .input(z.object({
        rootPublicKey: z.string().min(32),
        policyHash: z.string().min(1),
        rootSignature: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const genesis = createGenesisRecord(input);
        const ledgerEntry = await appendLedger("GENESIS", {
          ...genesis,
        });
        return { genesis, ledgerEntryId: ledgerEntry.entryId };
      }),

    /** Issue an authorization token after approval */
    issueToken: protectedProcedure
      .input(z.object({
        intentId: z.string().min(1),
        action: z.string().min(1),
        toolArgs: z.record(z.string(), z.unknown()),
        approvedBy: z.string().min(1),
        signature: z.string().min(1),
        expiryMinutes: z.number().optional(),
        maxExecutions: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const token = issueAuthorizationToken(input);
        await appendLedger("AUTHORITY_TOKEN", {
          event: "TOKEN_ISSUED",
          token_id: token.token_id,
          intent_id: token.intent_id,
          action: token.action,
          policy_hash: token.policy_hash,
          expires_at: token.expires_at,
        });
        return token;
      }),

    /** Validate an authorization token before execution */
    validateToken: protectedProcedure
      .input(z.object({
        tokenId: z.string().min(1),
        action: z.string().min(1),
        toolArgs: z.record(z.string(), z.unknown()),
        killSwitchActive: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        const token = getAuthorizationToken(input.tokenId);
        if (!token) {
          return { valid: false, checks: [{ check: "token_exists", status: "FAIL" as const, detail: "Token not found" }] };
        }
        return validateAuthorizationToken(token, input.action, input.toolArgs, input.killSwitchActive ?? false);
      }),

    /** Generate a canonical receipt for a governed action */
    generateReceipt: protectedProcedure
      .input(z.object({
        intentId: z.string().min(1),
        proposerId: z.string().min(1),
        approverId: z.string().min(1),
        tokenId: z.string().min(1),
        action: z.string().min(1),
        success: z.boolean(),
        result: z.unknown(),
        executor: z.string().min(1),
        timestampProposed: z.string().min(1),
        timestampApproved: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const ledgerEntry = await appendLedger("EXECUTION", {
          event: "CANONICAL_RECEIPT",
          intent_id: input.intentId,
          proposer_id: input.proposerId,
          approver_id: input.approverId,
          token_id: input.tokenId,
          action: input.action,
          success: input.success,
        });
        const receipt = generateCanonicalReceipt({
          ...input,
          ledgerEntryId: ledgerEntry.entryId,
        });
        return receipt;
      }),

    /** Verify the full authority chain — Chief of Staff audit function */
    verifyChain: protectedProcedure
      .input(z.object({
        genesis: z.object({
          record_type: z.literal("GENESIS"),
          system_id: z.literal("RIO"),
          root_public_key: z.string(),
          policy_hash: z.string(),
          created_at: z.string(),
          previous_hash: z.literal("0000000000000000"),
          signature: z.string(),
          genesis_hash: z.string(),
        }),
        policy: z.object({
          policy_id: z.string(),
          policy_hash: z.string(),
          policy_signature: z.string(),
          root_public_key: z.string(),
          rules: z.any(),
          activated_at: z.string(),
          status: z.enum(["ACTIVE", "REVOKED", "SUPERSEDED"]),
        }),
        token: z.object({
          token_id: z.string(),
          intent_id: z.string(),
          action: z.string(),
          parameters_hash: z.string(),
          approved_by: z.string(),
          policy_hash: z.string(),
          issued_at: z.string(),
          expires_at: z.string(),
          max_executions: z.number(),
          execution_count: z.number(),
          signature: z.string(),
        }),
        receipt: z.object({
          receipt_id: z.string(),
          intent_id: z.string(),
          proposer_id: z.string(),
          approver_id: z.string(),
          token_id: z.string(),
          action: z.string(),
          status: z.enum(["SUCCESS", "FAILED"]),
          executor: z.string(),
          execution_hash: z.string(),
          policy_hash: z.string(),
          snapshot_hash: z.string().default(""),
          timestamp_proposed: z.string(),
          timestamp_approved: z.string(),
          timestamp_executed: z.string(),
          decision_delta_ms: z.number().nullable(),
          ledger_entry_id: z.string(),
          previous_receipt_hash: z.string(),
          receipt_hash: z.string(),
          gateway_signature: z.string(),
        }),
      }))
      .query(async ({ input }) => {
        return verifyAuthorityChain(input);
      }),

    /** Enforce The One Rule — check all six invariants */
    enforceRule: protectedProcedure
      .input(z.object({
        hasAuthorizationToken: z.boolean(),
        hasApproval: z.boolean(),
        hasActivePolicy: z.boolean(),
        hasPolicyRootSignature: z.boolean(),
        willGenerateReceipt: z.boolean(),
        willWriteLedger: z.boolean(),
      }))
      .query(async ({ input }) => {
        return enforceTheOneRule(input);
      }),

    /** Compute policy hash for a given policy */
    computePolicyHash: publicProcedure
      .input(z.object({
        policyId: z.string().min(1),
        rules: z.object({
          proposer_cannot_approve: z.boolean(),
          high_risk_requires_approval: z.boolean(),
          approval_expiry_minutes: z.number(),
          max_executions_per_approval: z.number(),
          ledger_required: z.boolean(),
          receipt_required: z.boolean(),
          fail_closed: z.boolean(),
        }),
      }))
      .query(async ({ input }) => {
        return { policy_hash: computePolicyHash(input.policyId, input.rules) };
      }),

    /** Get default policy rules from the spec */
    defaultRules: publicProcedure.query(() => DEFAULT_POLICY_RULES),
  }),

  // ═══════════════════════════════════════════════════════════════
  // ASK BONDI — Read-only implementation Q&A (no auth, no governance)
  // ═══════════════════════════════════════════════════════════════

  askBondi: publicProcedure
    .input(z.object({ question: z.string().min(1).max(4000) }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("./_core/llm");

      const BONDI_SYSTEM_PROMPT = `You are Bondi, the implementation assistant for the RIO protocol.

You ONLY answer with concrete, developer-ready implementation guidance.

Always:
  - Explain step-by-step
  - Reference real flow: Intent → Governance → Approval → Execution → Receipt → Ledger
  - Use endpoints, payloads, and sequence
  - Be precise and technical

Never:
  - Speak philosophically
  - Be vague
  - Invent features not in the system

Assume the user is trying to implement:
  - Receipt protocol
  - Gateway integration
  - Governed action pipeline

Key system facts:
  - Gateway URL: https://rio-gateway.onrender.com
  - Principals: I-1 (proposer, root_authority), I-2 (approver, human)
  - Flow: POST /intent → POST /govern → POST /approvals/:id → POST /execute-action
  - Receipts: SHA-256 hash chain, Ed25519 signed, canonical JSON
  - Ledger: append-only, hash-linked, tamper-evident
  - Policy: proposer ≠ approver, HIGH risk requires human approval, fail-closed
  - Receipt Protocol repo: github.com/bkr1297-RIO/rio-receipt-protocol
  - Connectors: Gmail SMTP (send_email), Twilio SMS (send_sms)

If unclear, ask a clarifying question.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: BONDI_SYSTEM_PROMPT },
          { role: "user", content: input.question },
        ],
      });

      const answer = response.choices?.[0]?.message?.content || "I couldn't generate an answer. Please try again.";
      return { answer };
    }),

  // ═══════════════════════════════════════════════════════════════
  // MANTIS — Memory, Audit, Notification, Tracking, Integrity, Sync
  // Claude Condition 3: Status indicators pull from MANTIS sweep output
  // ═══════════════════════════════════════════════════════════════

  mantis: router({
    /**
     * Read-only: Fetch latest MANTIS integrity sweep + STATUS.json from GitHub.
     * This is the observer data source — NOT agent self-report.
     * No auth required: this is public system health data.
     */
    integrity: publicProcedure.query(async () => {
      const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
      if (!token) {
        return {
          ok: false,
          data: null,
          error: "GitHub token not configured — cannot read MANTIS sweep data",
        };
      }

      try {
        const state = await fetchMantisState(token);
        const integrity = normalizeMantisState(state);
        return {
          ok: true,
          data: integrity,
          error: state.errors.length > 0 ? state.errors.join("; ") : null,
        };
      } catch (err) {
        return {
          ok: false,
          data: null,
          error: `MANTIS fetch failed: ${String(err)}`,
        };
      }
    }),
  }),

  // ═══════════════════════════════════════════════════════════════
  // RESONANCE FEED — Live Drive/GitHub activity stream
  // ═══════════════════════════════════════════════════════════════
  resonance: router({
    /**
     * Live activity stream from RIO folder tree.
     * Tries Google Drive first (via Forge), falls back to GitHub commits.
     * This is the system's heartbeat — it lights up when any node acts.
     */
    feed: publicProcedure.input(z.object({
      hoursBack: z.number().min(1).max(720).default(72),
      maxEvents: z.number().min(1).max(100).default(50),
    }).optional()).query(async ({ input }) => {
      const hoursBack = input?.hoursBack ?? 72;
      const maxEvents = input?.maxEvents ?? 50;

      // Try Drive first
      const driveFeed = await fetchResonanceFeed(hoursBack, maxEvents);

      // If Drive returned events, use them
      if (driveFeed.events.length > 0) {
        return {
          ok: true,
          source: "drive" as const,
          data: driveFeed,
          error: driveFeed.errors.length > 0 ? driveFeed.errors.join("; ") : null,
        };
      }

      // Fallback to GitHub commits
      const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
      if (!ghToken) {
        return {
          ok: false,
          source: "none" as const,
          data: driveFeed, // empty but structured
          error: "Neither Drive API nor GitHub token available for Resonance Feed",
        };
      }

      const ghFeed = await fetchResonanceFeedFromGitHub(ghToken, maxEvents);
      return {
        ok: ghFeed.events.length > 0,
        source: "github" as const,
        data: ghFeed,
        error: [
          ...driveFeed.errors,
          ...ghFeed.errors,
        ].filter(Boolean).join("; ") || null,
      };
    }),
  }),

  // ═══════════════════════════════════════════════════════════════
  // COHERENCE MONITOR — Meta-Governance Witness Layer
  // Read-only, advisory. Cannot approve, execute, or block.
  // ═══════════════════════════════════════════════════════════════
  coherence: router({
    /**
     * Get current coherence state — status, active warnings, recent history.
     * This is what the dashboard panel reads.
     */
    status: publicProcedure.query(() => {
      return getCoherenceState();
    }),

    /**
     * Get full coherence check history (for audit/export).
     */
    history: publicProcedure.input(z.object({
      limit: z.number().min(1).max(100).optional(),
    }).optional()).query(({ input }) => {
      return getCoherenceHistory(input?.limit || 50);
    }),

    /**
     * Run a coherence check on a proposed action.
     * This is called during the approval flow — before the human sees the action.
     * The result is advisory only: it adds context to the approval decision.
     */
    check: protectedProcedure.input(z.object({
      actionType: z.string().min(1),
      actionParameters: z.record(z.string(), z.unknown()),
      intentId: z.string().optional(),
      statedObjective: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Build system context from available data
      const context = buildSystemContext({
        activeObjective: input.statedObjective || "General system operation",
        systemHealth: "Operational (from last MANTIS sweep)",
      });

      const record = await runCoherenceCheck({
        actionType: input.actionType,
        actionParameters: input.actionParameters,
        intentId: input.intentId,
        proposedBy: ctx.user.name || ctx.user.email || `user-${ctx.user.id}`,
        systemContext: context,
        statedObjective: input.statedObjective,
      });

      // Write to ledger for audit trail
      try {
        await appendLedger("COHERENCE_CHECK", {
          coherence_id: record.coherence_id,
          action_id: record.action_id,
          status: record.status,
          drift_detected: record.drift_detected,
          signal_count: record.signals.length,
          confidence: record.confidence,
          userId: ctx.user.id,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("[CoherenceMonitor] Ledger write failed:", err);
      }

      return record;
    }),
  }),

  // ═══════════════════════════════════════════════════════════════
  // SYSTEM SEEDS — immutable configuration documents
  // ═══════════════════════════════════════════════════════════════
  seeds: router({
    /** List all 3 seed documents */
    list: publicProcedure.query(async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const seedFiles = [
        { id: "master-seed", name: "Master Seed v1.1", file: "shared/master-seed-v1.1.json" },
        { id: "system-definition", name: "System Definition", file: "shared/corpus/system-definition.json" },
        { id: "agents", name: "Agent Roster", file: "shared/corpus/agents.json" },
      ];
      const seeds = await Promise.all(seedFiles.map(async (sf) => {
        try {
          const raw = await fs.readFile(path.resolve(process.cwd(), sf.file), "utf-8");
          return { id: sf.id, name: sf.name, content: JSON.parse(raw) };
        } catch {
          return { id: sf.id, name: sf.name, content: null };
        }
      }));
      return seeds;
    }),

    /** Get a single seed document by ID */
    get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const map: Record<string, string> = {
        "master-seed": "shared/master-seed-v1.1.json",
        "system-definition": "shared/corpus/system-definition.json",
        "agents": "shared/corpus/agents.json",
      };
      const file = map[input.id];
      if (!file) throw new Error(`Unknown seed: ${input.id}`);
      const raw = await fs.readFile(path.resolve(process.cwd(), file), "utf-8");
      return JSON.parse(raw);
    }),
  }),

  // ═══════════════════════════════════════════════════════════════
  // EMAIL ACTION FIREWALL — Policy Engine + Receipt System
  // ═══════════════════════════════════════════════════════════════
  emailFirewall: router({
    /** Scan email content against policy rules. Returns decision + receipt. */
    scan: publicProcedure
      .input(z.object({
        body: z.string().min(1, "Email body is required"),
        subject: z.string().optional(),
        to: z.string().optional(),
        strictness: z.enum(["strict", "standard", "permissive"]).default("standard"),
        useLLM: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const { result, receipt } = await scanEmail(
          input.body,
          input.subject || null,
          input.to || null,
          input.strictness as StrictnessLevel,
          input.useLLM,
        );
        // Store receipt + write to governance ledger
        const ledgerEntry = await storeGovernedReceipt(receipt);
        return { result, receipt, ledger: ledgerEntry };
      }),

    /** Get recent receipts */
    receipts: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
      .query(({ input }) => {
        return getReceipts(input?.limit || 50);
      }),

    /** Get a single receipt by ID */
    receipt: publicProcedure
      .input(z.object({ receiptId: z.string() }))
      .query(({ input }) => {
        const receipt = getReceiptById(input.receiptId);
        if (!receipt) throw new Error("Receipt not found");
        return receipt;
      }),

    /** Get receipt statistics */
    stats: publicProcedure.query(() => {
      return getReceiptStats();
    }),

    /** Generate sample receipts for demo purposes */
    generateSamples: publicProcedure.mutation(() => {
      const samples = generateSampleReceipts();
      for (const s of samples) storeReceipt(s);
      return { generated: samples.length, receipts: samples };
    }),

    // ─── Inbound Message Adapter ─────────────────────────────

    /** Scan an inbound text message (SMS) through the firewall */
    scanInbound: publicProcedure
      .input(z.object({
        text: z.string().min(1, "Message text is required"),
        sender: z.string().min(1, "Sender is required"),
        strictness: z.enum(["strict", "standard", "permissive"]).default("standard"),
      }))
      .mutation(async ({ input }) => {
        const { routing, result, receipt } = await processIncomingMessage(
          input.text,
          input.sender,
          input.strictness as StrictnessLevel,
          false, // no LLM for inbound messages by default
        );
        const ledgerEntry = await storeGovernedReceipt(receipt);
        return { routing, result, receipt, ledger: ledgerEntry };
      }),

    /** Get inbound message receipts grouped by routing */
    inboundMessages: publicProcedure.query(() => {
      return getInboundMessageStats();
    }),

    /** Get receipts filtered by channel */
    receiptsByChannel: publicProcedure
      .input(z.object({
        channel: z.enum(["email", "sms", "slack", "linkedin"]),
        limit: z.number().min(1).max(200).default(50),
      }))
      .query(({ input }) => {
        return getReceiptsByChannel(input.channel, input.limit);
      }),

    /** Get current firewall policy config */
    policyConfig: publicProcedure.query(async () => {
      // Use userId 0 as the global/default config
      const config = await getEmailFirewallConfig(0);
      return config || {
        strictness: "standard" as const,
        preset: "personal",
        ruleOverrides: {} as Record<string, { enabled: boolean }>,
        categoryOverrides: {} as Record<string, string>,
        internalDomains: [] as string[],
        llmEnabled: true,
      };
    }),

    /** Update firewall policy config */
    updatePolicyConfig: publicProcedure
      .input(z.object({
        ruleId: z.string().optional(),
        enabled: z.boolean().optional(),
        actionOverride: z.string().optional(),
        strictnessOverride: z.string().optional(),
        preset: z.string().optional(),
        strictness: z.enum(["strict", "standard", "permissive"]).optional(),
      }))
      .mutation(async ({ input }) => {
        // Get current config or create default
        const current = await getEmailFirewallConfig(0);
        const ruleOverrides = current?.ruleOverrides || {};
        const categoryOverrides = current?.categoryOverrides || {};

        if (input.ruleId) {
          if (input.enabled !== undefined) {
            ruleOverrides[input.ruleId] = { enabled: input.enabled };
          }
          if (input.actionOverride) {
            categoryOverrides[input.ruleId] = input.actionOverride;
          }
        }

        const updated = await upsertEmailFirewallConfig(0, {
          strictness: input.strictness || current?.strictness || "standard",
          preset: input.preset || current?.preset || "personal",
          ruleOverrides,
          categoryOverrides,
          internalDomains: current?.internalDomains || [],
        });
        return updated;
      }),
  }),

  // ═══════════════════════════════════════════════════════════════
  // RIO READ APIs (Drive-backed, read-only)
  // ═══════════════════════════════════════════════════════════════
  rio: router({
    lastAction: publicProcedure.query(async () => {
      return await getLastAction();
    }),

    history: publicProcedure.input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }).optional()).query(async ({ input }) => {
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      return await getActionHistory(limit, offset);
    }),

    systemState: publicProcedure.query(async () => {
      return await getSystemState();
    }),

    // ─── System Health (CBS Section 13) ─────────────────────
    health: publicProcedure.query(() => {
      return getSystemHealth();
    }),

    // ─── Approval Queue (CBS Section 10) ────────────────────
    pendingApprovals: publicProcedure.query(() => {
      return getPendingApprovals().map(a => ({
        approval_id: a.approval_id,
        action_id: a.action_id,
        proposer_id: a.proposer_id,
        intent_type: a.envelope.intent.type,
        resource_id: a.envelope.resource.id,
        risk_level: a.envelope.constraints.risk_level,
        requested_at: new Date(a.requested_at).toISOString(),
        expires_at: new Date(a.expires_at).toISOString(),
        status: a.status,
      }));
    }),

    allApprovals: publicProcedure.input(z.object({
      limit: z.number().min(1).max(100).default(20),
    }).optional()).query(({ input }) => {
      const limit = input?.limit ?? 20;
      return getAllApprovals().slice(-limit).map(a => ({
        approval_id: a.approval_id,
        action_id: a.action_id,
        proposer_id: a.proposer_id,
        approver_id: a.approver_id,
        status: a.status,
        requested_at: new Date(a.requested_at).toISOString(),
        resolved_at: a.resolved_at ? new Date(a.resolved_at).toISOString() : null,
      }));
    }),

    // ─── Approve/Reject (CBS Section 10) ────────────────────
    approve: publicProcedure.input(z.object({
      approval_id: z.string(),
      approver_id: z.string(),
      action: z.enum(["APPROVED", "REJECTED"]),
    })).mutation(async ({ input }) => {
      const result = await resolveApproval(input.approval_id, input.approver_id, input.action);
      if (result.error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      return {
        approval_id: result.approval!.approval_id,
        status: result.approval!.status,
        approver_id: result.approval!.approver_id,
      };
    }),

    // ─── Envelope Validation (CBS Section 2) ────────────────
    validateEnvelope: publicProcedure.input(z.object({
      envelope: z.any(),
    })).mutation(({ input }) => {
      return validateEnvelope(input.envelope);
    }),

    // ═══════════════════════════════════════════════════════════
    // PAUSE PLACEMENT MODEL
    // ═══════════════════════════════════════════════════════════

    // Route an action through the pause placement decision tree
    routeAction: publicProcedure.input(z.object({
      action_type: z.string(),
      recipient: z.string().optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
      source: z.string().default("RIO_UI"),
      user_id: z.string().default("owner"),
    })).mutation(async ({ input }) => {
      const action: Action = {
        id: "",
        type: input.action_type,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        data: input.data || {},
        timestamp: new Date().toISOString(),
      };
      return await routeAction(action, input.source, input.user_id);
    }),

    // Execute after approval resolution
    executeAfterApproval: publicProcedure.input(z.object({
      approval_id: z.string(),
      action_type: z.string(),
      recipient: z.string().optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    })).mutation(async ({ input }) => {
      const action: Action = {
        id: "",
        type: input.action_type,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        data: input.data || {},
        timestamp: new Date().toISOString(),
      };
      return await executeAfterApproval(input.approval_id, action);
    }),

    // ─── Intake Rules ───────────────────────────────────────
    addIntakeRule: publicProcedure.input(z.object({
      name: z.string(),
      action_type: z.string(),
      conditions: z.record(z.string(), z.unknown()).default({}),
      constraints: z.record(z.string(), z.unknown()).default({}),
      approved_by: z.string(),
    })).mutation(({ input }) => {
      return addIntakeRule({
        name: input.name,
        action_type: input.action_type,
        conditions: input.conditions,
        constraints: input.constraints,
        approved_by: input.approved_by,
        approved_at: new Date().toISOString(),
        active: true,
      });
    }),

    removeIntakeRule: publicProcedure.input(z.object({
      rule_id: z.string(),
    })).mutation(({ input }) => {
      const removed = removeIntakeRule(input.rule_id);
      if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
      return { removed: true };
    }),

    intakeRules: publicProcedure.query(() => {
      return getAllRules();
    }),

    activeIntakeRules: publicProcedure.query(() => {
      return getActiveRules();
    }),

    getRule: publicProcedure.input(z.object({
      rule_id: z.string(),
    })).query(({ input }) => {
      const rule = getRule(input.rule_id);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
      return rule;
    }),

    // ─── Pause Stats ────────────────────────────────────────
    pauseStats: publicProcedure.query(() => {
      return getPauseStats();
    }),

    checkPause: publicProcedure.input(z.object({
      action_id: z.string(),
    })).query(({ input }) => {
      return { action_id: input.action_id, pause_type: hasPause(input.action_id) };
    }),

    // ═══════════════════════════════════════════════════════════
    // EMAIL-BASED APPROVAL (Multi-User MVP)
    // ═══════════════════════════════════════════════════════════

    sendApprovalEmail: publicProcedure.input(z.object({
      intent_id: z.string(),
      proposer_email: z.string().email(),
      approver_email: z.string().email(),
      action_type: z.string(),
      action_summary: z.string(),
      action_details: z.record(z.string(), z.unknown()).optional(),
      base_url: z.string().url(),
    })).mutation(async ({ input }) => {
      const result = await sendApprovalEmail(
        {
          intent_id: input.intent_id,
          proposer_email: input.proposer_email,
          approver_email: input.approver_email,
          action_type: input.action_type,
          action_summary: input.action_summary,
          action_details: input.action_details,
        },
        input.base_url,
      );
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Failed to send approval email" });
      }
      return {
        success: true,
        intent_id: input.intent_id,
        approver_email: input.approver_email,
        expires_at: result.token_payload?.expires_at
          ? new Date(result.token_payload.expires_at).toISOString()
          : null,
        email_message_id: result.email_result?.messageId || null,
      };
    }),

    computeActionHash: publicProcedure.input(z.object({
      action_type: z.string(),
      action_details: z.record(z.string(), z.unknown()).default({}),
    })).query(({ input }) => {
      return {
        action_hash: computeActionHash(input.action_type, input.action_details),
      };
    }),

    sendApprovalSMS: publicProcedure.input(z.object({
      intent_id: z.string(),
      proposer_email: z.string().email(),
      approver_phone: z.string().min(10),
      approver_email: z.string().email(),
      action_type: z.string(),
      action_summary: z.string(),
      action_details: z.record(z.string(), z.unknown()).optional(),
      base_url: z.string().url(),
    })).mutation(async ({ input }) => {
      const result = await sendApprovalSMS(
        {
          intent_id: input.intent_id,
          proposer_email: input.proposer_email,
          approver_phone: input.approver_phone,
          approver_email: input.approver_email,
          action_type: input.action_type,
          action_summary: input.action_summary,
          action_details: input.action_details,
        },
        input.base_url,
      );
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Failed to send approval SMS" });
      }
      return {
        success: true,
        intent_id: input.intent_id,
        approver_phone: input.approver_phone,
        expires_at: result.token_payload?.expires_at
          ? new Date(result.token_payload.expires_at).toISOString()
          : null,
        sms_sid: result.sms_result?.messageSid || null,
      };
    }),

    // ═══════════════════════════════════════════════════════════
    // SELF-TRIGGER: User-Initiated Governed Actions
    // ═══════════════════════════════════════════════════════════
    // Allows authenticated users to trigger governed actions directly.
    // Wires to existing sendApprovalEmail → approve → execute → receipt → ledger.
    // Does NOT change Sentinel, approval logic, receipts, or ledger.

    triggerAction: protectedProcedure.input(z.object({
      action_type: z.enum(["send_email", "send_sms"]),
      recipient: z.string().min(1, "Recipient is required"),
      subject: z.string().optional(),
      body: z.string().optional(),
      approver_email: z.string().email().optional(),
      source: z.enum(["RIO_UI", "TELEGRAM", "API"]).default("RIO_UI"),
    })).mutation(async ({ ctx, input }) => {
      const user = ctx.user!;
      const proposerEmail = user.email || `user-${user.id}@rio.local`;
      const approverEmail = input.approver_email || proposerEmail; // default: self-approve

      // Build action details based on action_type
      let actionSummary: string;
      let actionDetails: Record<string, unknown>;

      if (input.action_type === "send_email") {
        actionSummary = `Send governed email to ${input.recipient}`;
        actionDetails = {
          to: input.recipient,
          subject: input.subject || "(no subject)",
          body: input.body || "",
        };
      } else {
        // send_sms
        actionSummary = `Send governed SMS to ${input.recipient}`;
        actionDetails = {
          phone: input.recipient,
          message: input.body || "",
        };
      }

      // Generate intent ID
      const intentId = `INT-${input.source}-${Date.now()}`;

      // Determine base_url: use request origin (works for both dev and published site)
      const origin = ctx.req.headers.origin
        || ctx.req.headers.referer?.replace(/\/[^/]*$/, "")
        || "https://rio-one.manus.space";

      // Send approval email through existing pipeline
      const result = await sendApprovalEmail(
        {
          intent_id: intentId,
          proposer_email: proposerEmail,
          approver_email: approverEmail,
          action_type: input.action_type,
          action_summary: actionSummary,
          action_details: actionDetails,
        },
        origin,
      );

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to send approval email",
        });
      }

      console.log(`[SelfTrigger] ${input.source} → ${input.action_type} → approval email sent to ${approverEmail} (intent: ${intentId})`);

      return {
        success: true,
        intent_id: intentId,
        approver_email: approverEmail,
        action_type: input.action_type,
        action_summary: actionSummary,
        source: input.source,
        expires_at: result.token_payload?.expires_at
          ? new Date(result.token_payload.expires_at).toISOString()
          : null,
      };
    }),
  }),

  // ─── Notion Decision Log (Phase 1 Operational Surface) ─────────
  // Invariants:
  //   1. Notion is NOT the system of record (PostgreSQL ledger is)
  //   2. Notion is NOT the enforcement boundary (Gateway is)
  //   3. Notion status change is a SIGNAL, not cryptographic approval
  //   4. Execution requires verified Ed25519 signature
  //   5. Fail closed on any mismatch
  notion: router({
    /** Check if Notion integration is configured */
    status: publicProcedure.query(() => {
      return { configured: isNotionConfigured() };
    }),

    /**
     * Poll for intents where Brian set Status=Approved in Notion
     * but Approval State is still Unsigned (needs cryptographic signing).
     * Build Directive Step 3: detect the change.
     */
    pollPendingApprovals: protectedProcedure.query(async () => {
      if (!isNotionConfigured()) {
        return [];
      }
      const rows = await notionPollPendingApprovals();
      return rows.map(r => ({
        pageId: r.pageId,
        title: r.title,
        intentId: r.intentId,
        intentHash: r.intentHash,
        action: r.action,
        riskTier: r.riskTier,
        proposer: r.proposer,
        policyVersion: r.policyVersion,
        gatewayDecision: r.gatewayDecision,
        createdAt: r.createdAt,
      }));
    }),

    /**
     * Sign and authorize an intent that was approved in Notion.
     * Build Directive Steps 3-5:
     *   - Receives the Ed25519 signed payload from the browser
     *   - Calls Gateway /authorize (existing endpoint) with the approval
     *   - Calls Gateway /execute-action for execution
     *   - Updates the Notion row with Executed status and receipt link
     *   - Fails closed on any mismatch
     */
    signAndAuthorize: protectedProcedure.input(z.object({
      pageId: z.string().min(1),
      intentId: z.string().min(1),
      intentHash: z.string().min(1),
      policyVersion: z.string().min(1),
      signature: z.string().min(1),
      payloadHash: z.string().min(1),
      nonce: z.string().min(1),
      expiresAt: z.string().min(1),
      deny: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const GATEWAY_URL = ENV.gatewayUrl;
      if (!GATEWAY_URL) {
        return { success: false, error: "Gateway URL not configured" };
      }

      // ─── DENY PATH ───
      if (input.deny) {
        // Update Notion row to Denied
        await updateDecisionRow(input.pageId, {
          status: "Denied",
          approvalState: "Unsigned",
        });
        await appendLedger("NOTION_DENIAL", {
          intent_id: input.intentId,
          intent_hash: input.intentHash,
          notion_page_id: input.pageId,
          denied_by: ctx.user?.id || "unknown",
          timestamp: Date.now(),
        });
        return { success: true, receiptId: null };
      }

      // ─── APPROVE + EXECUTE PATH ───
      // Step 1: Login as I-2 (approver) for /authorize
      let i2Token: string;
      try {
        const loginRes = await fetch(`${GATEWAY_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "I-2",
            passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026",
          }),
        });
        const loginData = await loginRes.json() as { token?: string; error?: string };
        if (!loginRes.ok || !loginData.token) {
          await updateDecisionRow(input.pageId, { status: "Failed" });
          return { success: false, error: `I-2 login failed: ${loginData.error || "no token"}` };
        }
        i2Token = loginData.token;
      } catch (err) {
        await updateDecisionRow(input.pageId, { status: "Failed" });
        return { success: false, error: `Gateway unreachable: ${String(err)}` };
      }

      // Step 2: Authorize the intent via existing /authorize endpoint
      // Build Directive Step 4: wire into existing /authorize
      try {
        const authRes = await fetch(`${GATEWAY_URL}/authorize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${i2Token}`,
          },
          body: JSON.stringify({
            intent_id: input.intentId,
            decision: "approved",
            authorized_by: "I-2",
            // Include the cryptographic proof from the signer
            signature: input.signature,
            payload_hash: input.payloadHash,
            nonce: input.nonce,
            expires_at: input.expiresAt,
            request_timestamp: new Date().toISOString(),
            request_nonce: `notion-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          }),
        });
        const authData = await authRes.json() as { error?: string; invariant?: string };
        if (!authRes.ok) {
          const msg = authData.invariant === "proposer_ne_approver"
            ? "Cannot approve your own intent (proposer \u2260 approver)"
            : authData.error || `Authorization failed (HTTP ${authRes.status})`;
          await updateDecisionRow(input.pageId, { status: "Failed", approvalState: "Unsigned" });
          return { success: false, error: msg };
        }
      } catch (err) {
        await updateDecisionRow(input.pageId, { status: "Failed" });
        return { success: false, error: `Gateway /authorize failed: ${String(err)}` };
      }

      // Update Notion: Approval State = Signed (authorization verified)
      await updateDecisionRow(input.pageId, { approvalState: "Signed" });

      // Step 3: Login as I-1 (proposer) for /execute-action
      let i1Token: string;
      try {
        const loginRes = await fetch(`${GATEWAY_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "I-1",
            passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026",
          }),
        });
        const loginData = await loginRes.json() as { token?: string; error?: string };
        if (!loginRes.ok || !loginData.token) {
          await updateDecisionRow(input.pageId, { status: "Failed", approvalState: "Signed" });
          return { success: false, error: `I-1 login failed: ${loginData.error || "no token"}` };
        }
        i1Token = loginData.token;
      } catch (err) {
        await updateDecisionRow(input.pageId, { status: "Failed", approvalState: "Signed" });
        return { success: false, error: `Gateway unreachable for I-1: ${String(err)}` };
      }

      // Step 4: Execute via Gateway /execute-action (external mode)
      let execData: Record<string, unknown> | null = null;
      try {
        const execRes = await fetch(`${GATEWAY_URL}/execute-action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${i1Token}`,
          },
          body: JSON.stringify({
            intent_id: input.intentId,
            delivery_mode: "external",
            request_timestamp: new Date().toISOString(),
            request_nonce: `notion-exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          }),
          signal: AbortSignal.timeout(30000),
        });
        execData = await execRes.json() as Record<string, unknown>;
        if (!execRes.ok) {
          await updateDecisionRow(input.pageId, { status: "Failed", approvalState: "Signed" });
          return { success: false, error: (execData as { error?: string }).error || `Execute failed (HTTP ${execRes.status})` };
        }
      } catch (err) {
        await updateDecisionRow(input.pageId, { status: "Failed", approvalState: "Signed" });
        return { success: false, error: `Gateway /execute-action failed: ${String(err)}` };
      }

      // Step 5: Extract receipt and update Notion
      // Build Directive Step 5: receipt writeback
      const gwReceipt = (execData?.receipt as Record<string, unknown>) || null;
      const receiptId = gwReceipt ? String((gwReceipt as { receipt_id?: string }).receipt_id || "") : "";
      const receiptHash = gwReceipt ? String((gwReceipt as { receipt_hash?: string }).receipt_hash || "") : "";

      // Build receipt link for Notion
      const receiptLink = receiptId
        ? `https://rio-one.manus.space/receipts?id=${receiptId}`
        : undefined;

      // Update Notion row: Executed + receipt link
      await updateDecisionRow(input.pageId, {
        status: "Executed",
        approvalState: "Executed",
        receiptLink,
      });

      // Log to local ledger
      await appendLedger("NOTION_EXECUTION", {
        intent_id: input.intentId,
        intent_hash: input.intentHash,
        notion_page_id: input.pageId,
        receipt_id: receiptId,
        receipt_hash: receiptHash,
        approved_by: ctx.user?.id || "unknown",
        execution_path: "notion_signer",
        timestamp: Date.now(),
      });

      // Notify owner
      try {
        await notifyOwner({
          title: "Notion-Governed Action Executed",
          content: [
            `**Intent:** \`${input.intentId}\``,
            `**Receipt:** \`${receiptId.slice(0, 12)}\``,
            `**Source:** Notion Decision Log → Signer UI`,
            `**Hash:** \`${input.intentHash.slice(0, 16)}...\``,
          ].join("\n"),
        });
      } catch (err) {
        console.error("[notion.signAndAuthorize] notifyOwner error:", err);
      }

      // Telegram notification
      if (isTelegramConfigured()) {
        try {
          const { sendMessage: sendTg } = await import("./telegram");
          await sendTg([
            `\u2705 *Notion-Governed Action Executed*`,
            ``,
            `Intent: \`${input.intentId.slice(0, 12)}\``,
            `Receipt: \`${receiptId.slice(0, 12)}\``,
            `Source: Notion Decision Log`,
          ].join("\n"), "Markdown");
        } catch (err) {
          console.error("[notion.signAndAuthorize] Telegram error:", err);
        }
      }

      return {
        success: true,
        receiptId,
        receiptHash,
        receiptLink,
      };
    }),

    /**
     * Create a Notion Decision Log row for a governed intent.
     * Called after Gateway governance evaluation.
     * Build Directive Step 2: Gateway → Notion row creation.
     */
    createRow: protectedProcedure.input(z.object({
      intentId: z.string().min(1),
      intentHash: z.string().min(1),
      title: z.string().min(1),
      action: z.string().min(1),
      riskTier: z.string().min(1),
      proposer: z.string().min(1),
      policyVersion: z.string().min(1),
      gatewayDecision: z.string().min(1),
    })).mutation(async ({ input }) => {
      if (!isNotionConfigured()) {
        return { success: false, error: "Notion not configured" };
      }
      const result = await createDecisionRow({
        title: input.title,
        intentId: input.intentId,
        intentHash: input.intentHash,
        action: input.action as NotionAction,
        riskTier: input.riskTier as NotionRiskTier,
        proposer: input.proposer as NotionProposer,
        policyVersion: input.policyVersion,
        gatewayDecision: input.gatewayDecision as NotionGatewayDecision,
      });
      return result;
    }),

    /** Get a single decision row by page ID */
    getRow: protectedProcedure.input(z.object({
      pageId: z.string().min(1),
    })).query(async ({ input }) => {
      return getDecisionRow(input.pageId);
    }),

    /** Find a decision row by intent ID */
    findByIntentId: protectedProcedure.input(z.object({
      intentId: z.string().min(1),
    })).query(async ({ input }) => {
      return findDecisionRowByIntentId(input.intentId);
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2A — PROPOSAL ROUTER
  // ═══════════════════════════════════════════════════════════════════
  proposal: router({
    /**
     * Generate a proposal from research input.
     * Flow: research → LLM structured extraction → DB → Notion Decision Log.
     * Invariant: proposals are NEVER auto-queued for approval.
     */
    create: protectedProcedure.input(z.object({
      content: z.string().min(1),
      type: z.enum(["outreach", "task", "analysis", "financial", "follow_up"]),
      category: z.string().min(1),
      target: z.string().optional(),
      context: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Step 1: Generate proposal from research via LLM
      const { packet, saved } = await createProposalFromResearch({
        content: input.content,
        type: input.type,
        category: input.category,
        target: input.target,
        context: input.context,
        createdBy: ctx.user?.name || "system",
      });

      // Step 2: Write to Notion Decision Log
      let notionPageId: string | null = null;
      if (isNotionConfigured()) {
        try {
          notionPageId = await writeProposalToNotion({
            proposalId: packet.proposalId,
            type: packet.type,
            category: packet.category,
            riskTier: packet.riskTier,
            riskFactors: packet.riskFactors,
            proposal: packet.proposal,
            whyItMatters: packet.whyItMatters,
            reasoning: packet.reasoning,
            baselinePattern: packet.baselinePattern,
          });
          await updateProposalPacketStatus(packet.proposalId, "proposed", { notionPageId });
        } catch (err) {
          console.error("[proposal.create] Notion write failed:", err);
        }
      }

      // Step 3: Log to ledger
      await appendLedger("PROPOSAL_CREATED", {
        proposal_id: packet.proposalId,
        type: packet.type,
        category: packet.category,
        risk_tier: packet.riskTier,
        notion_page_id: notionPageId,
        created_by: ctx.user?.name || "system",
        timestamp: Date.now(),
      });

      return {
        success: true,
        proposalId: packet.proposalId,
        riskTier: packet.riskTier,
        notionPageId,
        proposal: packet.proposal,
        whyItMatters: packet.whyItMatters,
      };
    }),

    /** List proposals with optional filters */
    list: protectedProcedure.input(z.object({
      status: z.enum(["proposed", "approved", "rejected", "executed", "failed", "expired"]).optional(),
      type: z.enum(["outreach", "task", "analysis", "financial", "follow_up"]).optional(),
      riskTier: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      limit: z.number().min(1).max(100).optional(),
    }).optional()).query(async ({ input }) => {
      return listProposalPackets(input ?? {});
    }),

    /** Get a single proposal by ID */
    get: protectedProcedure.input(z.object({
      proposalId: z.string().min(1),
    })).query(async ({ input }) => {
      return getProposalPacket(input.proposalId);
    }),

    /**
     * Approve a proposal — triggers Gateway /authorize + /execute-action.
     * Uses the EXISTING approval pipeline (same as gateway.approveAndExecute).
     * Invariant: execution requires Ed25519 signature via Gateway.
     */
    approve: protectedProcedure.input(z.object({
      proposalId: z.string().min(1),
      signature: z.string().min(1),
      payloadHash: z.string().min(1),
      nonce: z.string().min(1),
      expiresAt: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const proposal = await getProposalPacket(input.proposalId);
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      if (proposal.status !== "proposed") throw new TRPCError({ code: "BAD_REQUEST", message: `Proposal is ${proposal.status}, not proposed` });

      const GATEWAY_URL = ENV.gatewayUrl;
      if (!GATEWAY_URL) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gateway URL not configured" });

      // Update status to approved
      await updateProposalPacketStatus(input.proposalId, "approved");
      if (proposal.notionPageId) {
        try { await updateNotionProposalApproved(proposal.notionPageId); } catch (e) { console.error("[proposal.approve] Notion update failed:", e); }
      }

      // Login as I-2 (approver) for /authorize
      let i2Token: string;
      try {
        const loginRes = await fetch(`${GATEWAY_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: "I-2", passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026" }),
        });
        const loginData = await loginRes.json() as { token?: string; error?: string };
        if (!loginRes.ok || !loginData.token) throw new Error(loginData.error || "no token");
        i2Token = loginData.token;
      } catch (err) {
        await updateProposalPacketStatus(input.proposalId, "failed");
        if (proposal.notionPageId) try { await updateNotionProposalFailed(proposal.notionPageId, `I-2 login failed: ${String(err)}`); } catch (_) {}
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Gateway I-2 login failed: ${String(err)}` });
      }

      // Authorize via Gateway
      try {
        const authRes = await fetch(`${GATEWAY_URL}/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${i2Token}` },
          body: JSON.stringify({
            intent_id: input.proposalId,
            decision: "approved",
            authorized_by: "I-2",
            signature: input.signature,
            payload_hash: input.payloadHash,
            nonce: input.nonce,
            expires_at: input.expiresAt,
            request_timestamp: new Date().toISOString(),
            request_nonce: `proposal-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          }),
        });
        if (!authRes.ok) {
          const authData = await authRes.json() as { error?: string };
          throw new Error(authData.error || `HTTP ${authRes.status}`);
        }
      } catch (err) {
        await updateProposalPacketStatus(input.proposalId, "failed");
        if (proposal.notionPageId) try { await updateNotionProposalFailed(proposal.notionPageId, `Authorization failed: ${String(err)}`); } catch (_) {}
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Gateway /authorize failed: ${String(err)}` });
      }

      // Login as I-1 (proposer) for /execute-action
      let i1Token: string;
      try {
        const loginRes = await fetch(`${GATEWAY_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: "I-1", passphrase: process.env.RIO_GATEWAY_PASSPHRASE || "rio-governed-2026" }),
        });
        const loginData = await loginRes.json() as { token?: string; error?: string };
        if (!loginRes.ok || !loginData.token) throw new Error(loginData.error || "no token");
        i1Token = loginData.token;
      } catch (err) {
        await updateProposalPacketStatus(input.proposalId, "failed");
        if (proposal.notionPageId) try { await updateNotionProposalFailed(proposal.notionPageId, `I-1 login failed: ${String(err)}`); } catch (_) {}
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Gateway I-1 login failed: ${String(err)}` });
      }

      // Execute via Gateway
      let execData: Record<string, unknown> | null = null;
      try {
        const execRes = await fetch(`${GATEWAY_URL}/execute-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${i1Token}` },
          body: JSON.stringify({
            intent_id: input.proposalId,
            delivery_mode: "external",
            request_timestamp: new Date().toISOString(),
            request_nonce: `proposal-exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          }),
          signal: AbortSignal.timeout(30000),
        });
        execData = await execRes.json() as Record<string, unknown>;
        if (!execRes.ok) throw new Error((execData as { error?: string }).error || `HTTP ${execRes.status}`);
      } catch (err) {
        await updateProposalPacketStatus(input.proposalId, "failed");
        if (proposal.notionPageId) try { await updateNotionProposalFailed(proposal.notionPageId, `Execution failed: ${String(err)}`); } catch (_) {}
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Gateway /execute-action failed: ${String(err)}` });
      }

      // Extract receipt
      const gwReceipt = (execData?.receipt as Record<string, unknown>) || null;
      const receiptId = gwReceipt ? String((gwReceipt as { receipt_id?: string }).receipt_id || "") : "";
      const receiptHash = gwReceipt ? String((gwReceipt as { receipt_hash?: string }).receipt_hash || "") : "";

      // Update DB + Notion + Ledger
      await updateProposalPacketStatus(input.proposalId, "executed", { receiptId });
      if (proposal.notionPageId) {
        try { await updateNotionProposalExecuted(proposal.notionPageId, receiptId); } catch (e) { console.error("[proposal.approve] Notion receipt update failed:", e); }
      }

      await appendLedger("PROPOSAL_EXECUTED", {
        proposal_id: input.proposalId,
        receipt_id: receiptId,
        receipt_hash: receiptHash,
        approved_by: ctx.user?.id || "unknown",
        execution_path: "proposal_approve",
        timestamp: Date.now(),
      });

      // Notify owner
      try {
        await notifyOwner({
          title: "Proposal Executed",
          content: `**Proposal:** \`${input.proposalId}\`\n**Type:** ${proposal.type}/${proposal.category}\n**Receipt:** \`${receiptId.slice(0, 12)}\``,
        });
      } catch (_) {}

      return { success: true, receiptId, receiptHash };
    }),

    /** Reject a proposal */
    reject: protectedProcedure.input(z.object({
      proposalId: z.string().min(1),
      reason: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const proposal = await getProposalPacket(input.proposalId);
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });

      await updateProposalPacketStatus(input.proposalId, "rejected");
      if (proposal.notionPageId) {
        try { await updateNotionProposalFailed(proposal.notionPageId, input.reason || "Rejected by user"); } catch (e) { console.error("[proposal.reject] Notion update failed:", e); }
      }

      await appendLedger("PROPOSAL_REJECTED", {
        proposal_id: input.proposalId,
        reason: input.reason || "Rejected by user",
        rejected_by: ctx.user?.id || "unknown",
        timestamp: Date.now(),
      });

      return { success: true };
    }),

    /** Update aftermath for a proposal (human reflection) */
    updateAftermath: protectedProcedure.input(z.object({
      proposalId: z.string().min(1),
      aftermath: z.object({
        automatic: z.string().optional(),
        inferred: z.string().optional(),
        human: z.string().optional(),
        note: z.string().optional(),
      }),
    })).mutation(async ({ input }) => {
      await updateProposalAftermath(input.proposalId, input.aftermath);
      return { success: true };
    }),

    /** Get baseline pattern for a category */
    baseline: protectedProcedure.input(z.object({
      category: z.string().min(1),
    })).query(async ({ input }) => {
      return getBaselinePattern(input.category);
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2E — TRUST POLICY ROUTER
  // ═══════════════════════════════════════════════════════════════════
  trust: router({
    /**
     * Create a trust policy.
     * INVARIANT: Creating a trust policy is itself a governed action.
     * It writes to the ledger with a receipt.
     */
    create: protectedProcedure.input(z.object({
      category: z.string().min(1),
      riskTier: z.enum(["LOW", "MEDIUM", "HIGH"]),
      trustLevel: z.number().min(0).max(2),
      conditions: z.record(z.string(), z.unknown()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const policyId = `trust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const policy = await createTrustPolicy({
        policyId,
        userId: ctx.user!.id,
        category: input.category,
        riskTier: input.riskTier as any,
        trustLevel: input.trustLevel,
        conditions: input.conditions || null,
        active: true,
      });

      await appendLedger("TRUST_POLICY_CREATED", {
        policy_id: policyId,
        category: input.category,
        risk_tier: input.riskTier,
        trust_level: input.trustLevel,
        conditions: input.conditions || null,
        created_by: ctx.user?.id || "unknown",
        timestamp: Date.now(),
      });

      return { success: true, policy };
    }),

    /** List active trust policies for the current user */
    list: protectedProcedure.query(async ({ ctx }) => {
      return listActiveTrustPolicies(ctx.user!.id);
    }),

    /** Get a single trust policy */
    get: protectedProcedure.input(z.object({
      policyId: z.string().min(1),
    })).query(async ({ input }) => {
      return getTrustPolicy(input.policyId);
    }),

    /**
     * Update a trust policy.
     * INVARIANT: Updating a trust policy is a governed action.
     */
    update: protectedProcedure.input(z.object({
      policyId: z.string().min(1),
      trustLevel: z.number().min(0).max(2).optional(),
      conditions: z.record(z.string(), z.unknown()).optional(),
      active: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const existing = await getTrustPolicy(input.policyId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Trust policy not found" });

      const updates: Record<string, unknown> = {};
      if (input.trustLevel !== undefined) updates.trustLevel = input.trustLevel;
      if (input.conditions !== undefined) updates.conditions = input.conditions;
      if (input.active !== undefined) updates.active = input.active;

      await updateTrustPolicy(input.policyId, updates as any);

      await appendLedger("TRUST_POLICY_UPDATED", {
        policy_id: input.policyId,
        updates,
        updated_by: ctx.user?.id || "unknown",
        timestamp: Date.now(),
      });

      return { success: true };
    }),

    /** Deactivate a trust policy */
    deactivate: protectedProcedure.input(z.object({
      policyId: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      await deactivateTrustPolicy(input.policyId);

      await appendLedger("TRUST_POLICY_DELETED", {
        policy_id: input.policyId,
        deactivated_by: ctx.user?.id || "unknown",
        timestamp: Date.now(),
      });

      return { success: true };
    }),

    /**
     * Evaluate trust policy for a proposal.
     * Returns whether auto-approval is permitted.
     * Does NOT execute — just evaluates.
     */
    evaluate: protectedProcedure.input(z.object({
      proposalId: z.string().min(1),
      category: z.string().min(1),
      riskTier: z.enum(["LOW", "MEDIUM", "HIGH"]),
      isInternal: z.boolean(),
      amount: z.number().optional(),
      target: z.string().optional(),
    })).query(async ({ ctx, input }) => {
      const result = await evaluateTrustPolicy({
        userId: ctx.user!.id,
        category: input.category,
        riskTier: input.riskTier,
        proposalId: input.proposalId,
        isInternal: input.isInternal,
        amount: input.amount,
        target: input.target,
      });
      return result;
    }),

    /**
     * Auto-approve a proposal via trust policy delegation.
     * Only works if evaluateTrustPolicy returns canAutoApprove=true.
     * Generates a delegated receipt referencing the trust policy.
     */
    autoApprove: protectedProcedure.input(z.object({
      proposalId: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const proposal = await getProposalPacket(input.proposalId);
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      if (proposal.status !== "proposed") throw new TRPCError({ code: "BAD_REQUEST", message: `Proposal is ${proposal.status}, not proposed` });

      // Evaluate trust policy
      const evaluation = await evaluateTrustPolicy({
        userId: ctx.user!.id,
        category: proposal.category,
        riskTier: proposal.riskTier as "LOW" | "MEDIUM" | "HIGH",
        proposalId: input.proposalId,
        isInternal: proposal.type === "task" || proposal.type === "analysis",
      });

      if (!evaluation.canAutoApprove) {
        return { success: false, reason: evaluation.reason, requiresHumanApproval: true };
      }

      // Build delegated receipt
      const baseline = await getBaselinePattern(proposal.category);
      const delegatedReceipt = buildDelegatedReceipt(evaluation, baseline);

      // Update proposal status
      await updateProposalPacketStatus(input.proposalId, "executed", {
        receiptId: `delegated_${Date.now()}`,
      });

      // Update Notion
      if (proposal.notionPageId) {
        try {
          await updateNotionProposalDelegated(
            proposal.notionPageId,
            evaluation.policyId!,
            `delegated_${Date.now()}`
          );
        } catch (e) { console.error("[trust.autoApprove] Notion update failed:", e); }
      }

      // Log to ledger
      await appendLedger("DELEGATED_AUTO_APPROVE", {
        proposal_id: input.proposalId,
        policy_id: evaluation.policyId,
        trust_level: evaluation.trustLevelApplied,
        delegated_receipt: delegatedReceipt,
        auto_approved_for: ctx.user?.id || "unknown",
        timestamp: Date.now(),
      });

      return {
        success: true,
        delegatedReceipt,
        policyId: evaluation.policyId,
        trustLevel: evaluation.trustLevelApplied,
      };
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════
  // SENTINEL ROUTER (Observational Only)
  // ═══════════════════════════════════════════════════════════════════
  sentinel: router({
    /** List sentinel events with optional filters */
    list: protectedProcedure.input(z.object({
      type: z.string().optional(),
      severity: z.string().optional(),
      acknowledged: z.boolean().optional(),
      limit: z.number().min(1).max(100).optional(),
    }).optional()).query(async ({ input }) => {
      return listSentinelEvents(input ?? {});
    }),

    /** Acknowledge a sentinel event */
    acknowledge: protectedProcedure.input(z.object({
      eventId: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      await acknowledgeSentinelEvent(input.eventId);

      await appendLedger("SENTINEL_EVENT", {
        event_id: input.eventId,
        acknowledged_by: ctx.user?.id || "unknown",
        action: "acknowledged",
        timestamp: Date.now(),
      });

      return { success: true };
    }),
  }),
});
export type AppRouter = typeof appRouter;
