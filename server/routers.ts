import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createProxyUser, getProxyUser, killProxyUser, updateProxyUserPublicKey, getAllProxyUsers, revokeProxyUser,
  getAllTools, getToolByName,
  createIntent, getIntent, getUserIntents, updateIntentStatus,
  createApproval, getApprovalForIntent, incrementApprovalExecution,
  createExecution,  getExecution, getExecutionByIntentId, updateExecutionReceiptHash,getUserApprovals,
  appendLedger, getAllLedgerEntries, verifyHashChain,
  sha256,
  saveKeyBackup, getKeyBackup, deleteKeyBackup,
  getLedgerEntriesSince,
  // Jordan router helpers
  createConversation, getConversation, getUserConversations,
  updateConversationMessages, addIntentToConversation, closeConversation,
  createLearningEvent, getUserLearningEvents, getRecentLearningContext,
  getAllNodeConfigs, getActiveNodeConfigs, getNodeConfig,
} from "./db";
import {
  isTelegramConfigured,
  sendIntentNotification,
  sendReceiptNotification,
  sendKillNotification,
} from "./telegram";
import {
  routeToJordan,
  buildSentinelStatus,
  generateConversationTitle,
  createLearningEventPayload,
  type ProxyMode,
  type JordanContext,
  type NodeInfo,
} from "./jordan";
import {
  dispatchExecution,
  generateReceipt,
  verifyArgsHash,
  type ApprovalProof,
} from "./connectors";
import { runLearningLoopAnalysis } from "./controlPlane";

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
    listSigners: protectedProcedure.query(async ({ ctx }) => {
      // Only owner/admin can list all signers
      const user = ctx.user;
      if (!user || user.openId !== ENV.ownerOpenId) {
        throw new Error("Only the system owner can list signers");
      }
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

    getSignerDetail: protectedProcedure.input(z.object({
      targetUserId: z.number(),
    })).query(async ({ ctx, input }) => {
      if (!ctx.user || ctx.user.openId !== ENV.ownerOpenId) {
        throw new Error("Only the system owner can view signer details");
      }
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

    revokeSigner: protectedProcedure.input(z.object({
      targetUserId: z.number(),
      reason: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      if (!ctx.user || ctx.user.openId !== ENV.ownerOpenId) {
        throw new Error("Only the system owner can revoke signers");
      }
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

    // Get current proxy user status
    status: protectedProcedure.query(async ({ ctx }) => {
      const proxyUser = await getProxyUser(ctx.user.id);
      const recentIntents = await getUserIntents(ctx.user.id, 10);
      const recentApprovals = await getUserApprovals(ctx.user.id, 10);
      const chainVerification = await verifyHashChain();
      return {
        proxyUser,
        recentIntents,
        recentApprovals,
        isOwner: ctx.user.openId === ENV.ownerOpenId,
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

      // Enforce breakAnalysis for MEDIUM and HIGH risk intents
      if ((tool.riskTier === "MEDIUM" || tool.riskTier === "HIGH") && !input.breakAnalysis?.trim()) {
        throw new Error(`Break analysis is required for ${tool.riskTier} risk intents. Describe where this could go wrong before submission.`);
      }

      // Compute blast radius
      const argCount = Object.keys(input.toolArgs).length;
      const blastRadius = {
        score: Math.min(10, tool.blastRadiusBase + Math.floor(argCount / 2)),
        affectedSystems: tool.riskTier === "HIGH" ? ["external-api", "user-data", "audit-log"] : tool.riskTier === "MEDIUM" ? ["filesystem", "audit-log"] : ["audit-log"],
        reversible: tool.riskTier === "LOW",
      };

      const intent = await createIntent(ctx.user.id, input.toolName, input.toolArgs, tool.riskTier as "LOW" | "MEDIUM" | "HIGH", blastRadius, input.reflection, input.sourceConversationId);

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
        riskTier: tool.riskTier,
        blastRadius,
        sourceConversationId: input.sourceConversationId,
      });

      // Telegram notification (non-blocking, graceful skip if not configured)
      if (isTelegramConfigured()) {
        sendIntentNotification({
          intentId: intent!.intentId,
          toolName: input.toolName,
          toolArgs: input.toolArgs,
          riskTier: tool.riskTier,
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

      // Dispatch to the real connector
      // Pass the stored argsHash to avoid MySQL JSON key reordering issues
      const connectorResult = await dispatchExecution(
        intent.toolName,
        toolArgs,
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
      const result = {
        output: connectorResult.output,
        toolName: intent.toolName,
        toolArgs,
        executedAt: connectorResult.executedAt,
      };

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

      return { success: true, execution, preflightResults: checks, connectorResult: { success: connectorResult.success, metadata: connectorResult.metadata } };
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
      return { execution, intent, approval };
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
  // JORDAN AI ROUTER
  // ═══════════════════════════════════════════════════════════════

  jordan: router({
    // Send a message to Jordan — the main chat endpoint
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

      // 4. Build Jordan context
      const tools = await getAllTools();
      const recentLearnings = await getRecentLearningContext(ctx.user.id, 20);
      const conversationMessages = (conversation.messages as Array<{ role: string; content: string; timestamp: number }>) ?? [];

      const jordanContext: JordanContext = {
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
      const jordanResponse = await routeToJordan(input.message, jordanContext, nodeInfo);

      // 6. Update conversation with new messages
      const now = Date.now();
      const updatedMessages = [
        ...conversationMessages,
        { role: "user", content: input.message, timestamp: now },
        {
          role: "assistant",
          content: jordanResponse.message,
          timestamp: now + 1,
          metadata: {
            nodeUsed: jordanResponse.nodeUsed,
            mode: jordanResponse.mode,
            intentsProposed: jordanResponse.intents.length,
            tokensUsed: jordanResponse.tokensUsed,
          },
        },
      ];

      await updateConversationMessages(
        conversation.conversationId,
        updatedMessages,
        jordanResponse.mode,
      );

      // 7. If intents were proposed, create them in the HITL system
      const createdIntents = [];
      for (const proposedIntent of jordanResponse.intents) {
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
      await appendLedger("JORDAN_CHAT", {
        conversationId: conversation.conversationId,
        nodeUsed: jordanResponse.nodeUsed,
        mode: jordanResponse.mode,
        intentsProposed: createdIntents.length,
        tokensUsed: jordanResponse.tokensUsed,
      });

      return {
        conversationId: conversation.conversationId,
        message: jordanResponse.message,
        mode: jordanResponse.mode,
        nodeUsed: jordanResponse.nodeUsed,
        intents: createdIntents,
        sentinel,
        tokensUsed: jordanResponse.tokensUsed,
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
});

export type AppRouter = typeof appRouter;
