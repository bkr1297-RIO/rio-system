/**
 * API v1 pre-route bridge composition.
 *
 * This router is mounted by gateway/server.mjs behind API-key/JWT auth and
 * rate limiting, before the general API v1 router. It hosts narrow bridge
 * surfaces that must run before the standard routes.
 */
import { Router } from "express";
import { requireScope } from "../security/api-auth.mjs";
import { requireRole } from "../security/principals.mjs";
import primeRuntimeRoutes from "./prime-runtime.mjs";
import { handleSpgmGovernRequest } from "./spgm-govern.mjs";

const router = Router();

// Prime reversible runtime is therefore live at:
// POST /api/v1/prime/execute
// POST /api/v1/prime/rollback
// Its own router applies requireScope("write") and action-specific approval.
router.use(primeRuntimeRoutes);

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
