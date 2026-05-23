/**
 * SPG-M Policy Context Builder
 *
 * Builds non-executing policy context from SPG-M intake results.
 * This module does not create intents, approve actions, execute actions,
 * issue tokens, write ledger entries, generate receipts, or create memory.
 */

function boundaryFlags(intakeResult = {}) {
  const spgm = intakeResult.spgm_result || {};
  const routing = intakeResult.routing || {};
  const receipt = intakeResult.receipt_event || {};

  return {
    non_executing: true,
    signal_not_command: spgm.signal_not_command === true,
    interpretation_provisional: spgm.interpretation_provisional === true,
    fact_symbol_separated: spgm.fact_symbol_separated === true,
    machine_boundary_preserved: spgm.machine_boundary_preserved === true,
    rio_required: routing.rio_required === true,
    muss_required: routing.muss_required === true,
    receipt_event_recommended: receipt.recommended === true,
    receipt_decision_hint: receipt.decision_hint || null,
  };
}

export function buildSpgmPolicyContext(packet = {}, intakeResult = {}) {
  const spgm = intakeResult.spgm_result || {};
  const routing = intakeResult.routing || {};
  const receiptHandoff = intakeResult.receipt_handoff || null;
  const proposedUse = packet.proposed_use || {};
  const signal = packet.signal || {};

  return {
    context_type: "spgm_policy_context",
    status: "prepared",
    mode: "non_executing",
    source: {
      module: "SPG-M",
      route: "/spgm/intake",
      system: "rio-system",
    },
    signal_summary: {
      literal_description: signal.literal_description || signal.description || signal.text || null,
      signal_type: signal.signal_type || null,
      recurrence_claimed: signal.recurrence_claimed === true,
    },
    proposed_use: {
      use_type: proposedUse.use_type || "unknown",
      proposed_action: proposedUse.proposed_action || null,
      affected_parties_count: Array.isArray(proposedUse.affected_parties) ? proposedUse.affected_parties.length : 0,
      known_domains: Array.isArray(proposedUse.known_domains) ? proposedUse.known_domains : [],
    },
    spgm: {
      status: spgm.status || "unknown",
      consequence_class: Number.isInteger(spgm.consequence_class) ? spgm.consequence_class : null,
      gates: spgm.gates || {},
    },
    routing: {
      rio_required: routing.rio_required === true,
      muss_required: routing.muss_required === true,
      reason: routing.reason || null,
    },
    receipt_handoff_present: receiptHandoff !== null,
    boundary_flags: boundaryFlags(intakeResult),
    policy_use: {
      may_inform_policy_review: true,
      may_create_authorization: false,
      may_create_execution: false,
      may_write_ledger: false,
      may_create_memory: false,
    },
    authority_boundary: "SPG-M policy context may inform RIO review, but it cannot approve, execute, issue tokens, write ledger entries, generate receipts, or create memory.",
  };
}

export function maybeBuildSpgmPolicyContext(packet = {}, intakeResult = {}) {
  if (!intakeResult || !intakeResult.spgm_result) return null;
  return buildSpgmPolicyContext(packet, intakeResult);
}
