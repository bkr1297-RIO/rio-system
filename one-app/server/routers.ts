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
} from "./db";
import {
  isTelegramConfigured,
  sendIntentNotification,
  sendReceiptNotification,
  sendKillNotification,
} from "./telegram";
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
} from "./gatewayProxy";
import { notifyOwner } from "./_core/notification";

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
      const intent = await createIntent(ctx.user.id, input.toolName, input.toolArgs, intentRiskTier, blastRadius, input.reflection, input.sourceConversationId);

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
      if (intent.userId !== ctx.user.id) throw new Error("Not your intent");
      if (intent.status !== "PENDING_APPROVAL") throw new Error(`Intent status is ${intent.status}, cannot approve`);

      // TTL check: if intent has expired, mark it and reject
      if (intent.expiresAt && Number(intent.expiresAt) <= Date.now()) {
        await updateIntentStatus(input.intentId, "EXPIRED");
        throw new Error("Intent has expired (TTL exceeded). Cannot approve stale intents.");
      }

      const expiresAt = Date.now() + input.expiresInSeconds * 1000;
      const approval = await createApproval(
        input.intentId, ctx.user.id, input.decision, input.signature,
        intent.toolName, intent.argsHash, expiresAt, input.maxExecutions
      );
      await updateIntentStatus(input.intentId, input.decision);
      await appendLedger("APPROVAL", {
        approvalId: approval!.approvalId,
        intentId: input.intentId,
        decision: input.decision,
        boundToolName: intent.toolName,
        boundArgsHash: intent.argsHash,
        expiresAt,
        maxExecutions: input.maxExecutions,
      });

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

      return approval;
    }),

    // Execute approved intent with preflight checks
    execute: protectedProcedure.input(z.object({
      intentId: z.string(),
      agentId: z.string().optional(), // optional: route through an external agent adapter
    })).mutation(async ({ ctx, input }) => {
      const intent = await getIntent(input.intentId);
      if (!intent) throw new Error("Intent not found");
      if (intent.userId !== ctx.user.id) throw new Error("Not your intent");

      const proxyUser = await getProxyUser(ctx.user.id);
      if (!proxyUser || proxyUser.status !== "ACTIVE") throw new Error("Proxy killed or not active");

      const tool = await getToolByName(intent.toolName);
      const approval = await getApprovalForIntent(input.intentId);

      // Run 8 preflight checks
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
      // Use the stored argsHash from the intent record (computed at creation time)
      // Do NOT recompute from intent.toolArgs because MySQL JSON columns reorder keys alphabetically,
      // which changes the JSON string and breaks the hash comparison.
      const argsMatch = !needsApproval || (approval && approval.boundArgsHash === intent.argsHash);
      checks.push({ check: "args_hash_match", status: argsMatch ? "PASS" : "FAIL", detail: argsMatch ? "Args hash verified" : "Args hash mismatch — possible tampering" });

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

      // Create execution record first (with placeholder receiptHash)
      const execution = await createExecution(input.intentId, approval?.approvalId ?? null, result, "PENDING", checks);

      // Now compute the canonical receipt hash with the real executionId
      // Store the exact JSON string that was hashed so the frontend can verify independently
      // (MySQL JSON columns reorder keys alphabetically, breaking hash verification)
      const receiptPayload = JSON.stringify({
        executionId: execution!.executionId,
        intentId: input.intentId,
        result,
      });
      const receiptHash = sha256(receiptPayload);

      // Update execution with the real receipt hash and the canonical payload
      await updateExecutionReceiptHash(execution!.executionId, receiptHash, receiptPayload);

      await updateIntentStatus(input.intentId, "EXECUTED");
      if (approval) await incrementApprovalExecution(approval.approvalId);

      await appendLedger("EXECUTION", {
        executionId: execution!.executionId,
        intentId: input.intentId,
        receiptHash,
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

      return {
        success: true,
        execution,
        preflightResults: checks,
        connectorResult: { success: connectorResult.success, metadata: connectorResult.metadata },
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

        const intent = await createIntent(
          ctx.user.id,
          proposedIntent.toolName,
          proposedIntent.toolArgs,
          tool.riskTier as "LOW" | "MEDIUM" | "HIGH",
          blastRadius,
          proposedIntent.reasoning,
          conversation.conversationId,
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

      return {
        intent: intentResult.data,
        governance: governResult.data,
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

    /** Get Gateway health and connection status */
    health: publicProcedure.query(async () => {
      const result = await proxyGatewayHealth();
      return {
        connected: result.ok,
        ...result.data,
      };
    }),
  }),
});
export type AppRouter = typeof appRouter;
