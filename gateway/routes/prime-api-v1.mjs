import { Router } from "express";
import { requireScope } from "../security/api-auth.mjs";
import { requireRole } from "../security/principals.mjs";
import { executePrimeEcho } from "../prime/bridge.mjs";

const router = Router();

function classifyBridgeError(error) {
  if (error instanceof TypeError) {
    return { statusCode: 400, code: "PRIME_IR_INVALID" };
  }
  if (
    error.message.includes("authorization") ||
    error.message.includes("Authorization")
  ) {
    return { statusCode: 403, code: "PRIME_AUTHORIZATION_INVALID" };
  }
  return { statusCode: 500, code: "PRIME_RUNTIME_ERROR" };
}

export function handlePrimeExecute(req, res) {
  try {
    const { ir, authorization } = req.body || {};
    const agentId =
      req.principal?.principal_id ||
      req.apiKey?.owner_id ||
      req.user?.sub ||
      "unknown-principal";

    const result = executePrimeEcho({
      ir,
      authorization,
      agent_id: agentId,
    });

    return res.status(200).json({
      ...result,
      api_version: "v1",
      route: "/api/v1/prime/execute",
      authenticated_principal: agentId,
    });
  } catch (error) {
    const classification = classifyBridgeError(error);
    return res.status(classification.statusCode).json({
      error: classification.code,
      message: error.message,
      fail_mode: "closed",
      api_version: "v1",
    });
  }
}

router.post(
  "/prime/execute",
  requireScope("write"),
  requireRole("executor"),
  handlePrimeExecute,
);

export default router;
