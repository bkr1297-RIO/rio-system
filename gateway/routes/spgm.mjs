/**
 * SPG-M Routes
 *
 * Non-executing intake route for ambiguous pattern-governance signals.
 * This route does not approve actions, issue execution tokens, dispatch
 * connectors, write ledger entries, or create persistent memory.
 */
import { Router } from "express";
import { requireRole } from "../security/principals.mjs";
import { processSpgmIntake } from "../spgm/intake.mjs";
import { validateSpgmIntake, buildInvalidSpgmIntakeResponse } from "../spgm/schema.mjs";

const router = Router();

router.get("/status", (req, res) => {
  return res.status(200).json({
    module: "SPG-M",
    status: "available",
    mode: "non_executing",
    version: "0.1",
    routes: {
      "POST /spgm/intake": "Non-executing pattern-governance intake",
      "GET /spgm/status": "SPG-M capability/status report",
    },
    capabilities: {
      intake_validation: true,
      consequence_classification: true,
      gate_markers: true,
      routing_markers: true,
      receipt_event_recommendation: true,
      receipt_handoff_metadata: true,
    },
    not_capable_of: [
      "approval",
      "execution",
      "token_issuance",
      "connector_dispatch",
      "ledger_write",
      "receipt_generation",
      "persistent_memory",
    ],
    authority_boundary: "SPG-M is a non-executing intake and routing surface. It cannot approve, execute, issue tokens, write ledger entries, generate receipts, or create memory.",
  });
});

router.post("/intake", requireRole("proposer", "approver", "auditor", "root_authority"), (req, res) => {
  try {
    const validation = validateSpgmIntake(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({
        status: "hold",
        mode: "non_executing",
        error: "SPGM_INTAKE_VALIDATION_FAILED",
        errors: validation.errors,
        ...buildInvalidSpgmIntakeResponse(validation.errors),
      });
    }

    const result = processSpgmIntake(req.body || {});

    return res.status(200).json({
      status: "ok",
      mode: "non_executing",
      ...result,
    });
  } catch (err) {
    console.error(`[RIO Gateway] SPG-M intake error: ${err.message}`);
    return res.status(500).json({
      error: "SPGM_INTAKE_ERROR",
      message: "Internal error processing SPG-M intake.",
      fail_mode: "closed",
    });
  }
});

export default router;
