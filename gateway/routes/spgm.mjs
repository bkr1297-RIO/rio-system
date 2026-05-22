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
