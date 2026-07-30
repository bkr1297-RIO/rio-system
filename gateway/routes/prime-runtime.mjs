import { Router } from "express";
import { requireScope } from "../security/api-auth.mjs";
import { primeSandbox } from "../prime/sandbox.mjs";

export function createPrimeRuntimeRouter({ sandbox = primeSandbox, requireWrite = requireScope("write") } = {}) {
  const router = Router();

  router.post("/prime/execute", requireWrite, (req, res) => {
    try {
      const result = sandbox.set(req.body || {});
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message, status: "BLOCKED" });
    }
  });

  router.post("/prime/rollback", requireWrite, (req, res) => {
    try {
      const result = sandbox.rollback(req.body || {});
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message, status: "BLOCKED" });
    }
  });

  return router;
}

export default createPrimeRuntimeRouter();
