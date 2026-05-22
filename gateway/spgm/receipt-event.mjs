/**
 * SPG-M Receipt Event Handoff Builder
 *
 * Builds a non-executing handoff packet for receipt-compatible proof.
 * This module does not generate receipts, sign payloads, write ledger entries,
 * dispatch connectors, issue tokens, or authorize actions.
 */

const NON_CLAIMS = Object.freeze({
  not_fixed_identity: true,
  not_destiny_claim: true,
  not_command_signal: true,
  not_metaphysical_proof: true,
  not_action_authorization: true,
  not_external_fact_claim: true,
  not_proof_about_another_person: true,
});

function pickSignal(packet = {}) {
  const signal = packet.signal || {};
  return {
    literal_description: signal.literal_description || signal.description || signal.text || null,
    signal_type: signal.signal_type || null,
    source_context: signal.source_context || null,
    recurrence_claimed: signal.recurrence_claimed === true,
  };
}

function pickProposedUse(packet = {}) {
  const proposedUse = packet.proposed_use || {};
  return {
    use_type: proposedUse.use_type || "unknown",
    proposed_action: proposedUse.proposed_action || null,
    affected_parties: Array.isArray(proposedUse.affected_parties) ? proposedUse.affected_parties : [],
    known_domains: Array.isArray(proposedUse.known_domains) ? proposedUse.known_domains : [],
    memory_requested: proposedUse.memory_requested === true,
    pattern_log_requested: proposedUse.pattern_log_requested === true,
  };
}

export function buildSpgmReceiptHandoff(packet = {}, intakeResult = {}) {
  const receiptEvent = intakeResult.receipt_event || {};
  const spgmResult = intakeResult.spgm_result || {};
  const routing = intakeResult.routing || {};

  const recommended = receiptEvent.recommended === true;

  return {
    handoff_type: "spgm_receipt_event",
    status: recommended ? "recommended" : "not_required",
    profile: "SPG-M",
    profile_version: "0.1",
    proof_layer: "rio-receipt-protocol",
    non_executing: true,
    receipt_decision_hint: receiptEvent.decision_hint || null,
    source: {
      system: "rio-system",
      component: "gateway",
      route: "/spgm/intake",
    },
    signal: pickSignal(packet),
    proposed_use: pickProposedUse(packet),
    spgm_result: {
      status: spgmResult.status || "unknown",
      consequence_class: Number.isInteger(spgmResult.consequence_class) ? spgmResult.consequence_class : null,
      fact_symbol_separated: spgmResult.fact_symbol_separated === true,
      interpretation_provisional: spgmResult.interpretation_provisional === true,
      signal_not_command: spgmResult.signal_not_command === true,
      machine_boundary_preserved: spgmResult.machine_boundary_preserved === true,
      gates: spgmResult.gates || {},
    },
    routing: {
      rio_required: routing.rio_required === true,
      muss_required: routing.muss_required === true,
      reason: routing.reason || null,
    },
    non_claims: NON_CLAIMS,
    boundary: "This handoff is metadata for receipt-compatible proof. It does not approve, execute, issue tokens, write ledger entries, or create persistent memory.",
  };
}

export function maybeBuildSpgmReceiptHandoff(packet = {}, intakeResult = {}) {
  const handoff = buildSpgmReceiptHandoff(packet, intakeResult);
  return handoff.status === "recommended" ? handoff : null;
}
