/**
 * SPG-M Intake Processor
 *
 * Non-executing pre-policy processor for ambiguous pattern signals.
 *
 * This module does not approve actions, issue authorization tokens, dispatch
 * connectors, write ledger entries, or create persistent memory.
 */
import { maybeBuildSpgmReceiptHandoff } from "./receipt-event.mjs";

const MATERIAL_DOMAINS = new Set([
  "money",
  "contract",
  "contracts",
  "legal",
  "health",
  "safety",
  "employment",
  "property",
  "reputation",
  "public",
]);

const SYSTEM_DOMAINS = new Set([
  "system",
  "automation",
  "institution",
  "memory",
  "pattern_log",
  "ledger",
  "governance_rule",
]);

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).toLowerCase());
  return [String(value).toLowerCase()];
}

function hasAny(values, set) {
  return values.some((value) => set.has(value));
}

export function classifySpgmConsequence(packet = {}) {
  const proposedUse = packet.proposed_use || {};
  const useType = proposedUse.use_type || "unknown";
  const domains = normalizeList(proposedUse.known_domains || packet.signal?.domains || packet.signal?.domain);
  const affectedParties = Array.isArray(proposedUse.affected_parties) ? proposedUse.affected_parties : [];
  const proposedAction = proposedUse.proposed_action;

  if (useType === "memory" || proposedUse.memory_requested === true || proposedUse.pattern_log_requested === true) {
    return 5;
  }

  if (useType === "automation" || useType === "system" || hasAny(domains, SYSTEM_DOMAINS)) {
    return 5;
  }

  if (hasAny(domains, MATERIAL_DOMAINS)) {
    return 4;
  }

  if (affectedParties.length > 0 || useType === "route" || useType === "propose") {
    return 3;
  }

  if (proposedAction) {
    return 2;
  }

  if (useType === "reflect" || useType === "classify") {
    return 1;
  }

  return 0;
}

export function buildSpgmGateStatus(packet = {}, consequenceClass = classifySpgmConsequence(packet)) {
  const signal = packet.signal || {};
  const machineAssistance = packet.machine_assistance || {};
  const proposedUse = packet.proposed_use || {};

  const signalPresent = Boolean(signal.literal_description || signal.description || signal.text);
  const machineUsed = machineAssistance.used === true;
  const affectedParties = Array.isArray(proposedUse.affected_parties) ? proposedUse.affected_parties : [];

  return {
    sovereignty: "pass",
    fact_symbol_separation: signalPresent ? "pass" : "hold",
    interpretation_provisionality: "pass",
    consent: affectedParties.length > 0 ? "hold" : "na",
    scope: proposedUse.use_type === "unknown" ? "hold" : "pass",
    consequence: Number.isInteger(consequenceClass) ? "pass" : "hold",
    shadow_inflation: consequenceClass >= 2 ? "hold" : "na",
    evidence_recurrence: signal.recurrence_claimed === true ? "hold" : "na",
    reversibility: consequenceClass >= 2 ? "hold" : "na",
    machine_boundary: machineUsed ? "pass" : "na",
    receipt: consequenceClass >= 3 ? "hold" : "na",
    memory_muss: consequenceClass === 5 ? "hold" : "na",
    rio_routing: consequenceClass >= 3 ? "hold" : "na",
  };
}

export function decideSpgmStatus(packet = {}, consequenceClass = classifySpgmConsequence(packet), gates = buildSpgmGateStatus(packet, consequenceClass)) {
  const signal = packet.signal || {};
  const proposedUse = packet.proposed_use || {};

  if (!signal.literal_description && !signal.description && !signal.text) {
    return "hold";
  }

  if (proposedUse.treat_signal_as_command === true || proposedUse.treat_interpretation_as_fact === true) {
    return "refuse";
  }

  if (consequenceClass >= 3) {
    return "route";
  }

  if (Object.values(gates).includes("hold")) {
    return "contain";
  }

  return "record";
}

export function buildSpgmReceiptEventRecommendation(packet = {}, status = "record", consequenceClass = classifySpgmConsequence(packet)) {
  const proposedUse = packet.proposed_use || {};
  const signal = packet.signal || {};
  const machineAssistance = packet.machine_assistance || {};

  const recommended =
    consequenceClass >= 3 ||
    status === "route" ||
    status === "contain" ||
    status === "refuse" ||
    status === "hold" ||
    proposedUse.memory_requested === true ||
    proposedUse.pattern_log_requested === true;

  return {
    recommended,
    profile: "SPG-M",
    decision_hint: recommended ? "BLOCK" : null,
    reason: recommended
      ? "SPG-M event may require receipt-compatible proof before any consequential movement."
      : "Private, non-consequential SPG-M event does not require a receipt event by default.",
    non_executing: true,
    proof_layer: "rio-receipt-protocol",
    event_context: {
      status,
      consequence_class: consequenceClass,
      signal_type: signal.signal_type || null,
      machine_assistance_used: machineAssistance.used === true,
    },
  };
}

export function processSpgmIntake(packet = {}) {
  const consequenceClass = classifySpgmConsequence(packet);
  const gates = buildSpgmGateStatus(packet, consequenceClass);
  const status = decideSpgmStatus(packet, consequenceClass, gates);
  const result = {
    spgm_result: {
      status,
      consequence_class: consequenceClass,
      fact_symbol_separated: gates.fact_symbol_separation === "pass",
      interpretation_provisional: true,
      signal_not_command: packet.proposed_use?.treat_signal_as_command !== true,
      machine_boundary_preserved: packet.machine_assistance?.used === true ? true : true,
      gates,
    },
    routing: {
      rio_required: consequenceClass >= 3,
      muss_required: consequenceClass >= 3 || consequenceClass === 5,
      reason: consequenceClass >= 3
        ? "Consequence class requires routing before action."
        : null,
    },
    receipt_event: buildSpgmReceiptEventRecommendation(packet, status, consequenceClass),
    next_step: status === "route"
      ? "policy_review"
      : status === "refuse"
        ? "containment"
        : status === "contain"
          ? "containment"
          : "private_reflection",
    authority_boundary: "SPG-M intake is non-executing context. It does not approve, execute, issue tokens, or write ledger entries.",
  };

  return {
    ...result,
    receipt_handoff: maybeBuildSpgmReceiptHandoff(packet, result),
  };
}
