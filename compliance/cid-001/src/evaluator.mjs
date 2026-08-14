function scopeAllows(grant, action) {
  return Array.isArray(grant?.scope) &&
    (grant.scope.includes("*") || grant.scope.includes(action));
}

function evaluateGrant(grant, action, asOf) {
  if (!grant) return { valid: false, reason: "MISSING_AUTHORITY" };
  if (grant.status === "REVOKED" || grant.revoked === true) {
    return { valid: false, reason: "AUTHORITY_REVOKED_OR_EXPIRED" };
  }
  if (grant.status !== "ACTIVE") {
    return { valid: false, reason: "INVALID_AUTHORITY" };
  }
  const expiry = new Date(grant.expires_at);
  if (!grant.expires_at || Number.isNaN(expiry.getTime()) || expiry <= asOf) {
    return { valid: false, reason: "AUTHORITY_REVOKED_OR_EXPIRED" };
  }
  if (!scopeAllows(grant, action)) {
    return { valid: false, reason: "AUTHORITY_OUT_OF_SCOPE" };
  }
  return { valid: true, reason: null };
}

function baseResult(fixture) {
  const input = fixture.input;
  return {
    fixture_id: fixture.fixture_id,
    requirement_id: fixture.requirement_id,
    disposition: "HOLD",
    execution_permitted: false,
    constitutional_change: "UNCHANGED",
    observation_status: input.observation?.status || "NOT_APPLICABLE",
    evidence_return_status: input.evidence_return?.status || "NOT_APPLICABLE",
    learning_proposal_status: input.learning_proposal?.status || "NONE",
    lineage_preserved: null,
    reason_code: null,
    runtime_trace: []
  };
}

function stop(result, disposition, reasonCode, component) {
  result.disposition = disposition;
  result.reason_code = reasonCode;
  result.runtime_trace.push({ component, outcome: disposition, reason_code: reasonCode });
  return result;
}

export function evaluateCidFixture(fixture) {
  const input = fixture.input;
  const result = baseResult(fixture);
  const candidate = input.candidate_adaptation;
  const grant = input.authority?.grant || null;
  const asOf = new Date(input.as_of);

  if (input.sourcepoint_choice?.decision === "REJECTED") {
    result.learning_proposal_status = "REJECTED";
    return stop(result, "HOLD", "SOURCEPOINT_REJECTION_GOVERNS", "SourcePoint");
  }

  if (input.authority?.composition_only === true) {
    return stop(result, "DENY", "NO_AUTHORITY_BY_COMPOSITION", "Sentinel");
  }

  const grantEvaluation = evaluateGrant(grant, candidate.action, asOf);

  if (
    candidate.source === "LEARNING" &&
    candidate.modifies_constitution === true &&
    !grantEvaluation.valid
  ) {
    result.learning_proposal_status = "RETURNED_FOR_HUMAN_CHOICE";
    return stop(
      result,
      "HOLD",
      "LEARNING_REQUIRES_AUTHORIZED_CROSSING",
      "RIO"
    );
  }

  if (!grantEvaluation.valid) {
    return stop(result, "DENY", grantEvaluation.reason, "RIO");
  }
  result.runtime_trace.push({ component: "RIO", outcome: "AUTHORITY_VALID" });

  const protectedInvariants = new Set(input.policy?.protected_invariants || []);
  const explicitlyAuthorized = new Set(grant.explicit_invariant_changes || []);
  const violations = (candidate.invariant_changes || []).filter(
    (item) => protectedInvariants.has(item) && !explicitlyAuthorized.has(item)
  );
  if (violations.length > 0) {
    result.runtime_trace.push({ component: "Sentinel", violations });
    return stop(result, "BLOCK", "PROTECTED_INVARIANT_VIOLATION", "Sentinel");
  }

  if (candidate.modifies_constitution === true) {
    if (
      grant.grant_type !== "ORIGINATING_AUTHORITY" ||
      input.sourcepoint_choice?.decision !== "APPROVED"
    ) {
      return stop(
        result,
        "HOLD",
        "CONSTITUTIONAL_AUTHORITY_REQUIRED",
        "SourcePoint"
      );
    }
    const before = input.constitutional_state?.before;
    const after = input.constitutional_state?.after;
    const lineage = input.constitutional_state?.lineage;
    const lineageValid = Boolean(
      before?.id &&
      after?.id &&
      before.id !== after.id &&
      lineage?.parent_id === before.id &&
      lineage?.child_id === after.id &&
      lineage?.prior_state_preserved === true
    );
    if (!lineageValid) {
      return stop(result, "BLOCK", "CONSTITUTIONAL_LINEAGE_REQUIRED", "MUS");
    }
    result.constitutional_change = "APPLIED";
    result.lineage_preserved = true;
    result.runtime_trace.push({ component: "SourcePoint", outcome: "APPROVED" });
    result.runtime_trace.push({ component: "MUS", outcome: "LINEAGE_PRESERVED" });
  }

  result.execution_permitted = true;
  result.runtime_trace.push({ component: "Sentinel", outcome: "EXECUTION_ADMITTED" });

  if (["EXECUTED", "APPLIED"].includes(input.execution?.status)) {
    if (input.observation?.status !== "OBSERVED") {
      result.observation_status = "UNRESOLVED";
      return stop(result, "UNRESOLVED", "OBSERVATION_REQUIRED", "MUS");
    }
    result.observation_status = "OBSERVED";
    result.runtime_trace.push({ component: "MUS", outcome: "OBSERVATION_RECORDED" });

    if (
      input.evidence_return?.required === true &&
      input.evidence_return?.status !== "RETURNED"
    ) {
      result.evidence_return_status = "REQUIRED_MISSING";
      return stop(result, "UNRESOLVED", "EVIDENCE_RETURN_REQUIRED", "MUS");
    }
  }

  result.evidence_return_status = input.evidence_return?.status || "NOT_REQUIRED";
  result.disposition = "ALLOW";
  result.reason_code = "ADMITTED_AND_ACCOUNTED";
  return result;
}

export function projectExpected(result, expected) {
  return Object.fromEntries(
    Object.keys(expected).map((key) => [key, result[key]])
  );
}
