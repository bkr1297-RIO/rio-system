/**
 * RIO Intake Validator
 *
 * Validates incoming requests against Brian's Intake Schema v1.
 * Flow: Identity → Intent → Context → Authorization → Execution → Receipt → Ledger
 *
 * The gateway accepts BOTH the new intake format and the legacy format
 * (for backward compatibility with existing agents). Legacy requests are
 * normalized into the intake schema internally.
 *
 * Fail-closed: If validation fails, the request is rejected.
 */

const VALID_AUTH_METHODS = [
  "google_oauth",
  "microsoft_oauth",
  "jwt_session",
  "ed25519_signature",
  "api_key",
];

const VALID_ROLES = ["owner", "agent", "delegate", "viewer"];

const VALID_RISK_SCOPES = [
  "internal",
  "external",
  "financial",
  "destructive",
  "irreversible",
];

const VALID_URGENCY = ["low", "normal", "high", "critical"];

/**
 * Validate a full intake request against the schema.
 * Returns { valid: true, intake } or { valid: false, errors: [...] }
 */
export function validateIntake(body) {
  const errors = [];

  // --- Identity ---
  if (!body.identity || typeof body.identity !== "object") {
    errors.push("Missing required field: identity (object)");
  } else {
    if (!body.identity.subject) {
      errors.push("Missing required field: identity.subject");
    }
    if (!body.identity.auth_method) {
      errors.push("Missing required field: identity.auth_method");
    } else if (!VALID_AUTH_METHODS.includes(body.identity.auth_method)) {
      errors.push(
        `Invalid identity.auth_method: "${body.identity.auth_method}". Must be one of: ${VALID_AUTH_METHODS.join(", ")}`
      );
    }
    if (body.identity.role && !VALID_ROLES.includes(body.identity.role)) {
      errors.push(
        `Invalid identity.role: "${body.identity.role}". Must be one of: ${VALID_ROLES.join(", ")}`
      );
    }
  }

  // --- Intent ---
  if (!body.intent || typeof body.intent !== "object") {
    errors.push("Missing required field: intent (object)");
  } else {
    if (!body.intent.action) {
      errors.push("Missing required field: intent.action");
    }
  }

  // --- Context ---
  if (!body.context || typeof body.context !== "object") {
    errors.push("Missing required field: context (object)");
  } else {
    if (!body.context.reason) {
      errors.push("Missing required field: context.reason");
    }
    if (
      body.context.risk_scope &&
      !VALID_RISK_SCOPES.includes(body.context.risk_scope)
    ) {
      errors.push(
        `Invalid context.risk_scope: "${body.context.risk_scope}". Must be one of: ${VALID_RISK_SCOPES.join(", ")}`
      );
    }
    if (
      body.context.urgency &&
      !VALID_URGENCY.includes(body.context.urgency)
    ) {
      errors.push(
        `Invalid context.urgency: "${body.context.urgency}". Must be one of: ${VALID_URGENCY.join(", ")}`
      );
    }
  }

  // --- Authorization must be null or absent on intake ---
  if (
    body.authorization !== undefined &&
    body.authorization !== null
  ) {
    errors.push(
      "authorization must be null on intake. It is filled by the governance pipeline after approval."
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, intake: body };
}

/**
 * Normalize a legacy request (old format) into the intake schema.
 * Legacy format: { action, agent_id, parameters, description, ... }
 * Returns a valid intake object.
 *
 * IMPORTANT: identity.subject is the AGENT proposing the action (body.agent_id),
 * NOT the authenticated human principal (req.user.sub). The human principal
 * is tracked via on_behalf_of and req.principal in the route handler.
 * This distinction matters because the policy engine checks agent scope
 * against identity.subject — human principals are not in agent scope.
 */
export function normalizeLegacy(body, req) {
  const user = req?.user;

  return {
    identity: {
      // Preserve the original agent_id from the request body.
      // The agent_id is the AI agent proposing the action — this is what
      // the policy engine checks for scope.
      // The authenticated user (JWT sub) is the *principal* who submitted it,
      // tracked via on_behalf_of and req.principal in the route handler.
      subject: body.agent_id || user?.sub || "unknown",
      auth_method: user ? "jwt_session" : "api_key",
      email: user?.email || null,
      role: user?.role || "agent",
      on_behalf_of: user?.sub || body.on_behalf_of || null,
    },
    intent: {
      action: body.action,
      target: body.target_environment || body.parameters?.to || null,
      parameters: body.parameters || {},
    },
    context: {
      reason: body.description || `${body.action} requested by ${body.agent_id || "unknown"}`,
      risk_scope: null,
      urgency: "normal",
    },
    authorization: null,
    _legacy: true, // Flag indicating this was normalized from legacy format
  };
}

/**
 * Detect whether a request body is in the new intake format or legacy format.
 */
export function isIntakeFormat(body) {
  return (
    body.identity !== undefined &&
    body.intent !== undefined &&
    body.context !== undefined
  );
}
