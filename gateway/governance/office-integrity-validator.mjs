/**
 * C2C-001 Office Integrity Validator
 *
 * Target-state runtime helper for checking a proposed actor/action pair
 * against the Concordance Control Registry.
 *
 * This module does not authorize actions, issue execution tokens, mutate
 * gateway state, write ledger entries, or certify canon. It only returns a
 * PASS decision or a non-authorizing HOLD receipt that can be routed by the
 * caller.
 */

const REQUIRED_ENTRY_FIELDS = Object.freeze([
  "primitive_id",
  "primitive_name",
  "active_office",
  "office_function",
  "allowed_actions",
  "prohibited_actions",
  "required_authority_level",
  "required_receipt_type",
  "failure_mode",
  "repair_path",
  "evidence_level",
  "status",
]);

const AUTHORITY_ORDER = Object.freeze([
  "none_observational",
  "policy_profile",
  "human_confirmation",
  "human_signature",
  "fresh_scoped_authority_event",
]);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function listContainsNormalized(values = [], candidate = "") {
  const normalizedCandidate = normalize(candidate);
  return values.some((value) => normalize(value) === normalizedCandidate);
}

function hasAuthority(requiredLevel, suppliedLevel) {
  const requiredIndex = AUTHORITY_ORDER.indexOf(requiredLevel);
  const suppliedIndex = AUTHORITY_ORDER.indexOf(suppliedLevel);

  if (requiredIndex < 0 || suppliedIndex < 0) return false;
  return suppliedIndex >= requiredIndex;
}

export function validateConcordanceEntryShape(entry = {}) {
  const missing = REQUIRED_ENTRY_FIELDS.filter((field) => entry[field] === undefined || entry[field] === null);

  const arrayErrors = [];
  for (const field of ["allowed_actions", "prohibited_actions"]) {
    if (!Array.isArray(entry[field]) || entry[field].length === 0) {
      arrayErrors.push(field);
    }
  }

  if (missing.length || arrayErrors.length) {
    return {
      status: "FAIL_HOLD",
      reason: "invalid_concordance_entry",
      missing_fields: missing,
      invalid_array_fields: arrayErrors,
    };
  }

  return { status: "PASS" };
}

export function findConcordanceEntry(matrix = [], declaredOffice = "") {
  const office = normalize(declaredOffice);
  if (!office) return null;

  return matrix.find((entry) => {
    if (normalize(entry.active_office) === office) return true;
    if (normalize(entry.primitive_id) === office) return true;
    if (normalize(entry.primitive_name) === office) return true;
    return Array.isArray(entry.aliases) && entry.aliases.some((alias) => normalize(alias) === office);
  }) || null;
}

export function buildOfficeIntegrityHoldReceipt({
  reason,
  message,
  request = {},
  entry = null,
  timestamp,
  receiptId,
} = {}) {
  return {
    receipt_type: "hold_receipt",
    receipt_id: receiptId,
    generated_at: timestamp,
    status: "HOLD",
    reason,
    message,
    primitive_id: entry?.primitive_id || null,
    primitive_name: entry?.primitive_name || null,
    declared_office: request.declared_office || null,
    requested_action: request.requested_action || null,
    consequence_class: request.consequence_class || null,
    actor_id: request.actor_id || null,
    failure_mode: entry?.failure_mode || "office_overreach",
    repair_path: entry?.repair_path || "ROUTE_TO_CONCORDANCE_REVIEW",
    non_authorizing: true,
    boundary: "This hold receipt records an office-integrity failure. It does not authorize action, issue tokens, or prove runtime completion.",
  };
}

export function verifyOfficeIntegrity({
  matrix = [],
  request = {},
  now = () => new Date().toISOString(),
  idFactory = () => `c2c_hold_${Date.now()}`,
} = {}) {
  const timestamp = now();
  const receiptId = idFactory();

  const entry = findConcordanceEntry(matrix, request.declared_office);

  if (!entry) {
    const message = `Unknown office '${request.declared_office || ""}' is not registered in the Concordance.`;
    return {
      status: "FAIL_HOLD",
      reason: "unknown_office",
      message,
      receipt: buildOfficeIntegrityHoldReceipt({ reason: "unknown_office", message, request, timestamp, receiptId }),
    };
  }

  const shape = validateConcordanceEntryShape(entry);
  if (shape.status !== "PASS") {
    const message = `Concordance entry '${entry.primitive_id || "unknown"}' is not shape-valid.`;
    return {
      status: "FAIL_HOLD",
      reason: shape.reason,
      message,
      details: shape,
      receipt: buildOfficeIntegrityHoldReceipt({ reason: shape.reason, message, request, entry, timestamp, receiptId }),
    };
  }

  const requestedAction = request.requested_action;

  if (listContainsNormalized(entry.prohibited_actions, requestedAction)) {
    const message = `Declared office '${entry.active_office}' is prohibited from action '${requestedAction}'.`;
    return {
      status: "FAIL_HOLD",
      reason: "prohibited_action",
      message,
      receipt: buildOfficeIntegrityHoldReceipt({ reason: "prohibited_action", message, request, entry, timestamp, receiptId }),
    };
  }

  if (!listContainsNormalized(entry.allowed_actions, requestedAction)) {
    const message = `Declared office '${entry.active_office}' does not list action '${requestedAction}' as allowed.`;
    return {
      status: "FAIL_HOLD",
      reason: "action_not_allowed",
      message,
      receipt: buildOfficeIntegrityHoldReceipt({ reason: "action_not_allowed", message, request, entry, timestamp, receiptId }),
    };
  }

  const consequenceClasses = Array.isArray(entry.consequence_classes) ? entry.consequence_classes : [];
  if (request.consequence_class && consequenceClasses.length && !listContainsNormalized(consequenceClasses, request.consequence_class)) {
    const message = `Consequence class '${request.consequence_class}' is outside office '${entry.active_office}' scope.`;
    return {
      status: "FAIL_HOLD",
      reason: "consequence_class_not_allowed",
      message,
      receipt: buildOfficeIntegrityHoldReceipt({ reason: "consequence_class_not_allowed", message, request, entry, timestamp, receiptId }),
    };
  }

  const suppliedAuthority = request.authority_context?.authority_level || "none_observational";
  if (!hasAuthority(entry.required_authority_level, suppliedAuthority)) {
    const message = `Authority level '${suppliedAuthority}' does not satisfy required level '${entry.required_authority_level}'.`;
    return {
      status: "FAIL_HOLD",
      reason: "insufficient_authority_level",
      message,
      receipt: buildOfficeIntegrityHoldReceipt({ reason: "insufficient_authority_level", message, request, entry, timestamp, receiptId }),
    };
  }

  return {
    status: "PASS",
    message: `Office integrity verified for '${entry.active_office}' and action '${requestedAction}'.`,
    primitive_id: entry.primitive_id,
    primitive_name: entry.primitive_name,
    declared_office: request.declared_office,
    requested_action: requestedAction,
    receipt_type: entry.required_receipt_type,
    non_authorizing: true,
    boundary: "PASS confirms office/action fit only. It does not authorize action, issue execution tokens, or prove runtime completion.",
  };
}
