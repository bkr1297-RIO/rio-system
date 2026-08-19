import { K0_CONSTITUTION, PROJECTION_VERSION, mapAction } from "./projection-profile.mjs";
import { sha256Canonical } from "./stable-json.mjs";

function claimTypeForStatus(status) {
  if (["executing", "executed"].includes(status)) return "EXECUTION";
  if (["receipted"].includes(status)) return "RETURN";
  if (["authorized", "denied", "blocked", "governed"].includes(status)) return "AUTHORITY";
  return "INTEGRITY";
}

export function projectRecord(snapshot, record) {
  if (snapshot.consistency !== "CHAIN_TIP_STABLE_NON_ATOMIC"
      || ["SOURCE_REWIND", "EPOCH_RUPTURE"].includes(snapshot.epochStatus)) {
    throw new Error("Unstable, rewound, or ruptured source observations must not be projected into K0.");
  }
  const { entry } = record;
  const mapping = mapAction(entry.action ?? "unknown");
  const opaqueEntry = sha256Canonical({ domain: "rio-ledger-entry", value: entry.entry_id });
  const opaqueIntent = sha256Canonical({ domain: "rio-intent", value: entry.intent_id });
  const opaqueAgent = entry.agent_id
    ? sha256Canonical({ domain: "rio-agent", value: entry.agent_id })
    : null;
  const worldRef = `rio-ledger:${snapshot.chainTipBefore}`;
  const observationId = `rio-ledger-observation:${opaqueEntry}`;
  const claimType = claimTypeForStatus(entry.status);
  return {
    schemaVersion: "ctl-k0.shadow-request/0.1",
    mode: "NON_AUTHORITATIVE_SHADOW",
    requestId: `rio-shadow:${record.dedupe_key}`,
    asOf: snapshot.captureCompletedAt,
    source: {
      system: "rio-system/api-v1",
      projectionVersion: PROJECTION_VERSION,
      sourceRefs: [`entry:${opaqueEntry}`, `intent:${opaqueIntent}`, entry.ledger_hash ? `ledger:${entry.ledger_hash}` : null].filter(Boolean),
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
        scope: [`intent:${opaqueIntent}`],
        jurisdiction: "UNRESOLVED",
      },
      program: {
        id: `rio-shadow-program:${opaqueEntry}`,
        kind: mapping.kind,
        sourceWorldRef: worldRef,
        sourceType: "RELATIONAL_WORLD",
        targetType: "RELATIONAL_WORLD",
        subjects: opaqueAgent ? [`agent:${opaqueAgent}`] : [],
        objects: [`intent:${opaqueIntent}`],
        proposedEffects: mapping.effects,
        standingChanges: [],
        requiredCapabilities: mapping.capabilities,
        requiredAuthority: true,
        preconditions: ["CHAIN_TIP_STABLE_NON_ATOMIC"],
        invariants: ["NO_SILENT_PROMOTION", "SOURCE_OBSERVATION_NOT_ACTUALITY", "PERSISTENCE_UNESTABLISHED"],
        evidenceObligations: ["EXECUTION", "OUTCOME", "RETURN"],
        returnObligations: ["source_observation_accounted", "unresolved_remainder_returned"],
      },
      observations: [{
        id: observationId,
        observerRef: "rio-ledger-api:cache-observer",
        claimType,
        proposition: `Ledger recorded status '${entry.status}' for an opaque intent reference; this does not establish actuality or lawfulness.`,
        verdict: "INCONCLUSIVE",
        observedAt: entry.timestamp ?? snapshot.captureCompletedAt,
      }],
      evidenceClaims: [{
        id: `rio-ledger-evidence:${opaqueEntry}`,
        claimType,
        proposition: `A cache-backed ledger record reports status '${entry.status}'.`,
        verdict: "INCONCLUSIVE",
        strength: "WEAK",
        sourceRefs: [observationId],
      }],
    },
  };
}

export function projectSnapshot(snapshot) {
  if (snapshot.consistency !== "CHAIN_TIP_STABLE_NON_ATOMIC"
      || ["SOURCE_REWIND", "EPOCH_RUPTURE"].includes(snapshot.epochStatus)) return [];
  return snapshot.records.map((record) => projectRecord(snapshot, record));
}
