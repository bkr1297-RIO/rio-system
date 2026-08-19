import { K0_CONSTITUTION, PROJECTION_VERSION, mapAction } from "./projection-profile.mjs";

function claimTypeForStatus(status) {
  if (["executing", "executed"].includes(status)) return "EXECUTION";
  if (["receipted"].includes(status)) return "RETURN";
  if (["authorized", "denied", "blocked", "governed"].includes(status)) return "AUTHORITY";
  return "INTEGRITY";
}

export function projectRecord(snapshot, record) {
  if (snapshot.atomicity !== "STABLE") {
    throw new Error("NON_ATOMIC_SNAPSHOT must not be projected into K0.");
  }
  const { entry, intent } = record;
  const mapping = mapAction(intent.action ?? entry.action ?? "unknown");
  const worldRef = `rio-ledger:${snapshot.chainTipBefore}`;
  const observationId = `rio-ledger-observation:${entry.entry_id}`;
  const claimType = claimTypeForStatus(entry.status);
  const unresolved = [
    "Ledger record is an observation, not ActualHistory.",
    "Authorization standing is not established by runtime status or record presence.",
    "Outcome and settlement are not established by intent status or receipt presence.",
    "Source persistence durability is not established by the cache-backed API.",
  ];
  if (snapshot.epochStatus === "ADVANCED_ANCESTRY_UNVERIFIED") {
    unresolved.push("Prior chain tip ancestry is not established by this two-read snapshot.");
  }
  return {
    schemaVersion: "ctl-k0.shadow-request/0.1",
    mode: "NON_AUTHORITATIVE_SHADOW",
    requestId: `rio-shadow:${record.dedupe_key}`,
    asOf: snapshot.captureCompletedAt,
    source: {
      system: "rio-system/api-v1",
      projectionVersion: PROJECTION_VERSION,
      sourceRefs: [entry.entry_id, entry.intent_id, entry.ledger_hash].filter(Boolean),
      captureStartedAt: snapshot.captureStartedAt,
      captureCompletedAt: snapshot.captureCompletedAt,
      ledgerHash: entry.ledger_hash ?? undefined,
      chainTipBefore: snapshot.chainTipBefore,
      chainTipAfter: snapshot.chainTipAfter,
    },
    verificationInput: {
      schemaVersion: "ctl-k0.input/0.1",
      constitution: K0_CONSTITUTION,
      world: {
        ref: worldRef,
        type: "RELATIONAL_WORLD",
        version: snapshot.totalBefore,
        lineageHead: snapshot.chainTipBefore,
      },
      context: {
        id: `rio-shadow-context:${snapshot.captureId}`,
        now: snapshot.captureCompletedAt,
        purpose: "NON_AUTHORITATIVE_SHADOW_EVALUATION",
        scope: [`intent:${entry.intent_id}`],
        jurisdiction: "UNRESOLVED",
      },
      program: {
        id: `rio-shadow-program:${entry.entry_id}`,
        kind: mapping.kind,
        sourceWorldRef: worldRef,
        sourceType: "RELATIONAL_WORLD",
        targetType: "RELATIONAL_WORLD",
        subjects: entry.agent_id ? [`agent:${entry.agent_id}`] : [],
        objects: entry.intent_id ? [`intent:${entry.intent_id}`] : [],
        proposedEffects: mapping.effects,
        standingChanges: [],
        requiredCapabilities: mapping.capabilities,
        requiredAuthority: true,
        preconditions: ["SOURCE_SNAPSHOT_STABLE"],
        invariants: ["NO_SILENT_PROMOTION", "SOURCE_OBSERVATION_NOT_ACTUALITY"],
        evidenceObligations: ["EXECUTION", "OUTCOME", "RETURN"],
        returnObligations: ["source_observation_accounted", "unresolved_remainder_returned"],
        payloadHash: entry.intent_hash ?? intent.parameters_digest,
      },
      observations: [{
        id: observationId,
        observerRef: "rio-ledger-api:cache-observer",
        claimType,
        proposition: `Ledger recorded status '${entry.status}' for intent ${entry.intent_id}; this does not establish actuality or lawfulness.`,
        verdict: "INCONCLUSIVE",
        observedAt: entry.timestamp ?? snapshot.captureCompletedAt,
      }],
      evidenceClaims: [{
        id: `rio-ledger-evidence:${entry.entry_id}`,
        claimType,
        proposition: `A cache-backed ledger record reports status '${entry.status}'.`,
        verdict: "INCONCLUSIVE",
        strength: "WEAK",
        sourceRefs: [observationId],
      }],
      settlement: {
        id: `rio-shadow-settlement:${entry.entry_id}`,
        status: "OPEN",
        satisfiedObligations: [],
        unresolved,
      },
    },
  };
}

export function projectSnapshot(snapshot) {
  if (snapshot.atomicity !== "STABLE") return [];
  return snapshot.records.map((record) => projectRecord(snapshot, record));
}
