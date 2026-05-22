/**
 * SPG-M Intake Schema Validation
 *
 * Lightweight validation for the non-executing SPG-M intake path.
 * This is intentionally local and dependency-free.
 */

const VALID_SIGNAL_TYPES = new Set([
  "symbolic",
  "pattern",
  "relational",
  "contextual",
  "numerological",
  "synchronistic",
  "dream",
  "emotional",
  "somatic",
  "systemic",
  "other",
]);

const VALID_USE_TYPES = new Set([
  "reflect",
  "classify",
  "route",
  "propose",
  "memory",
  "automation",
  "system",
  "unknown",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalArray(value) {
  return value === undefined || Array.isArray(value);
}

function optionalBoolean(value) {
  return value === undefined || typeof value === "boolean";
}

function optionalString(value) {
  return value === undefined || value === null || typeof value === "string";
}

export function validateSpgmIntake(packet = {}) {
  const errors = [];

  if (!isObject(packet)) {
    return {
      valid: false,
      errors: ["packet must be an object"],
    };
  }

  const signal = packet.signal;
  if (!isObject(signal)) {
    errors.push("signal must be an object");
  } else {
    const literal = signal.literal_description || signal.description || signal.text;
    if (!literal || typeof literal !== "string") {
      errors.push("signal.literal_description is required as a string");
    }

    if (signal.signal_type !== undefined && !VALID_SIGNAL_TYPES.has(String(signal.signal_type))) {
      errors.push(`signal.signal_type must be one of: ${[...VALID_SIGNAL_TYPES].join(", ")}`);
    }

    if (!optionalBoolean(signal.recurrence_claimed)) {
      errors.push("signal.recurrence_claimed must be boolean when provided");
    }
  }

  const proposedUse = packet.proposed_use;
  if (proposedUse !== undefined && !isObject(proposedUse)) {
    errors.push("proposed_use must be an object when provided");
  } else if (isObject(proposedUse)) {
    const useType = proposedUse.use_type || "unknown";
    if (!VALID_USE_TYPES.has(String(useType))) {
      errors.push(`proposed_use.use_type must be one of: ${[...VALID_USE_TYPES].join(", ")}`);
    }

    if (!optionalString(proposedUse.proposed_action)) {
      errors.push("proposed_use.proposed_action must be a string or null when provided");
    }

    if (!optionalArray(proposedUse.affected_parties)) {
      errors.push("proposed_use.affected_parties must be an array when provided");
    }

    if (!optionalArray(proposedUse.known_domains)) {
      errors.push("proposed_use.known_domains must be an array when provided");
    }

    if (!optionalBoolean(proposedUse.memory_requested)) {
      errors.push("proposed_use.memory_requested must be boolean when provided");
    }

    if (!optionalBoolean(proposedUse.pattern_log_requested)) {
      errors.push("proposed_use.pattern_log_requested must be boolean when provided");
    }

    if (!optionalBoolean(proposedUse.treat_signal_as_command)) {
      errors.push("proposed_use.treat_signal_as_command must be boolean when provided");
    }

    if (!optionalBoolean(proposedUse.treat_interpretation_as_fact)) {
      errors.push("proposed_use.treat_interpretation_as_fact must be boolean when provided");
    }
  }

  const machine = packet.machine_assistance;
  if (machine !== undefined && !isObject(machine)) {
    errors.push("machine_assistance must be an object when provided");
  } else if (isObject(machine)) {
    if (!optionalBoolean(machine.used)) {
      errors.push("machine_assistance.used must be boolean when provided");
    }
    if (!optionalString(machine.role)) {
      errors.push("machine_assistance.role must be a string or null when provided");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildInvalidSpgmIntakeResponse(errors = []) {
  return {
    spgm_result: {
      status: "hold",
      consequence_class: 0,
      fact_symbol_separated: false,
      interpretation_provisional: true,
      signal_not_command: true,
      machine_boundary_preserved: true,
      gates: {
        sovereignty: "pass",
        fact_symbol_separation: "hold",
        interpretation_provisionality: "pass",
        consent: "na",
        scope: "hold",
        consequence: "hold",
        shadow_inflation: "na",
        evidence_recurrence: "na",
        reversibility: "na",
        machine_boundary: "na",
        receipt: "na",
        memory_muss: "na",
        rio_routing: "na",
      },
      validation_errors: errors,
    },
    routing: {
      rio_required: false,
      muss_required: false,
      reason: "SPG-M intake schema validation failed; no action may proceed.",
    },
    next_step: "containment",
    authority_boundary: "SPG-M intake is non-executing context. Invalid packets are held and cannot approve, execute, issue tokens, or write ledger entries.",
  };
}
