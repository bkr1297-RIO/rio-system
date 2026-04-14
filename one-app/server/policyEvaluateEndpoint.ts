/**
 * Policy Evaluate Endpoint — Standalone API
 * ═══════════════════════════════════════════════════════════════
 *
 * Exposes /api/policy/evaluate as a standalone REST endpoint
 * that any agent, service, or UI can call to get a governance
 * decision for a proposed action.
 *
 * This does NOT execute the action. It only evaluates the policy
 * and returns a structured decision.
 *
 * POST /api/policy/evaluate
 *   Body: { action_type, target?, risk_score_override? }
 *   Returns: PolicyEvaluation | PolicyFailure
 *
 * GET /api/policy/matrix
 *   Returns: The active policy matrix (read-only)
 *
 * GET /api/policy/rules
 *   Returns: All configured rules
 *
 * GET /api/policy/rules/:action_type
 *   Returns: Rule for a specific action type
 */

import type { Express, Request, Response } from "express";
import {
  evaluateAction,
  getActiveMatrix,
  findRule,
  isFailure,
  verifyMatrixIntegrity,
  type PolicyEvaluation,
  type PolicyFailure,
} from "./policyMatrix";
import { getLearningSummary } from "./learningEngine";

// ═══════════════════════════════════════════════════════════════
// REGISTER ENDPOINTS
// ═══════════════════════════════════════════════════════════════

export function registerPolicyEndpoints(app: Express): void {

  // ─── POST /api/policy/evaluate ──────────────────────────────
  app.post("/api/policy/evaluate", async (req: Request, res: Response) => {
    try {
      const { action_type, target, risk_score_override } = req.body || {};

      if (!action_type) {
        const failure: PolicyFailure = {
          status: "failure",
          code: "INVALID_INPUT",
          message: "action_type is required in request body",
          required_next_step: "Provide { action_type: string } in the POST body",
          fallback_decision: "block",
          timestamp: new Date().toISOString(),
        };
        res.status(400).json(failure);
        return;
      }

      // Fetch learning advisory data if available
      let learningData: PolicyEvaluation["learning_advisory"] | undefined;
      try {
        const summary = await getLearningSummary(action_type, target || "");
        if (summary.totalEvents > 0) {
          const approvalRate = summary.totalEvents > 0
            ? summary.approvedCount / summary.totalEvents
            : null;
          learningData = {
            available: true,
            trend: summary.trend,
            approval_rate: approvalRate,
            total_decisions: summary.totalEvents,
            advisory_risk_score: summary.advisoryRiskScore,
          };
        }
      } catch {
        // Learning data is advisory — failure is non-blocking
      }

      const result = evaluateAction({
        action_type,
        target,
        risk_score_override,
        learning_data: learningData,
      });

      if (isFailure(result)) {
        res.status(500).json(result);
        return;
      }

      res.json({
        status: "evaluated",
        evaluation: result,
      });
    } catch (err) {
      const failure: PolicyFailure = {
        status: "failure",
        code: "EVALUATION_ERROR",
        message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        required_next_step: "Investigate server logs and retry",
        fallback_decision: "block",
        timestamp: new Date().toISOString(),
      };
      res.status(500).json(failure);
    }
  });

  // ─── GET /api/policy/matrix ─────────────────────────────────
  app.get("/api/policy/matrix", (_req: Request, res: Response) => {
    try {
      const matrix = getActiveMatrix();
      const integrity = verifyMatrixIntegrity(matrix);

      res.json({
        status: "ok",
        integrity_verified: integrity,
        matrix,
      });
    } catch (err) {
      res.status(500).json({
        status: "failure",
        code: "NO_MATRIX",
        message: `Failed to load matrix: ${err instanceof Error ? err.message : String(err)}`,
        required_next_step: "Check server configuration and restart",
        fallback_decision: "block",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ─── GET /api/policy/rules ──────────────────────────────────
  app.get("/api/policy/rules", (_req: Request, res: Response) => {
    try {
      const matrix = getActiveMatrix();
      res.json({
        status: "ok",
        count: matrix.rules.length,
        rules: matrix.rules,
      });
    } catch (err) {
      res.status(500).json({
        status: "failure",
        message: String(err),
      });
    }
  });

  // ─── GET /api/policy/rules/:action_type ─────────────────────
  app.get("/api/policy/rules/:action_type", (req: Request, res: Response) => {
    try {
      const { action_type } = req.params;
      const rule = findRule(action_type);

      if (!rule) {
        res.status(404).json({
          status: "not_found",
          message: `No specific rule for action type "${action_type}"`,
          note: "This action will be handled by the default policy (fail closed → require_approval)",
          defaults: getActiveMatrix().defaults,
        });
        return;
      }

      res.json({
        status: "ok",
        rule,
      });
    } catch (err) {
      res.status(500).json({
        status: "failure",
        message: String(err),
      });
    }
  });

  // ─── GET /api/policy/health ─────────────────────────────────
  app.get("/api/policy/health", (_req: Request, res: Response) => {
    try {
      const matrix = getActiveMatrix();
      const integrity = verifyMatrixIntegrity(matrix);

      res.json({
        status: integrity ? "healthy" : "degraded",
        matrix_version: matrix.version,
        matrix_hash: matrix.matrix_hash,
        integrity_verified: integrity,
        rules_count: matrix.rules.length,
        risk_tiers_count: matrix.risk_tiers.length,
        fail_closed: matrix.defaults.fail_closed,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        status: "unhealthy",
        message: String(err),
        timestamp: new Date().toISOString(),
      });
    }
  });

  console.log("[PolicyEngine] Endpoints registered: /api/policy/evaluate, /api/policy/matrix, /api/policy/rules, /api/policy/health");
}
