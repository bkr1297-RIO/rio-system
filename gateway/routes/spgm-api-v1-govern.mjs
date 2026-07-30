/**
 * API v1 pre-route bridges.
 *
 * SPG-M intercepts governed intents only when review metadata is present.
 * Prime exposes a bounded authenticated execution route backed by the
 * verified Prime runtime bridge.
 */
import { Router } from "express";
import { requireScope } from "../security/api-auth.mjs";
import { requireRole } from "../security/principals.mjs";
import { handleSpgmGovernRequest } from "./spgm-govern.mjs";
import primeApiV1Routes from "./prime-api-v1.mjs";

const router = Router();

router.use(primeApiV1Routes);

router.post("/intents/:id/govern", requireScope("write"), requireRole("proposer", "executor"), (req, res, next) => {
  try {
    const result = handleSpgmGovernRequest({
      body: {
        ...(req.body || {}),
        intent_id: req.params.id,
      },
      principal: req.principal || null,
    });

    if (!result.handled) return next();
    return res.status(result.statusCode).json({
      ...result.body,
      api_version: "v1",
    });
  } catch (err) {
    console.error(`[RIO API v1] SPG-M govern bridge error: ${err.message}`);
    return res.status(500).json({ error: "Internal error during SPG-M API v1 governance evaluation." });
  }
});

export default router;
