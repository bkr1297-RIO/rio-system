import { sha256, stableId } from "./hash.js";
import {
  explicitTimestamps,
  hashChainRows,
  headings,
  labeledFields,
  markdownLines
} from "./markdown.js";
import { validateView } from "./guards.js";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function makeSource({
  source_id,
  object_type,
  source_type,
  payload,
  created_at,
  provenance
}) {
  if (!source_id || !object_type || !source_type) {
    throw new Error("INVALID_SOURCE: source_id, object_type, and source_type are required");
  }

  const frozenPayload = structuredClone(payload);
  const source_hash = sha256(frozenPayload);

  return deepFreeze({
    source_id,
    object_type,
    source_type,
    payload: frozenPayload,
    source_hash,
    created_at,
    provenance: {
      ...structuredClone(provenance),
      immutable: true
    }
  });
}

function evidence(source, path, observed_value, line) {
  return {
    evidence_id: stableId("E", source.source_hash, path, observed_value),
    kind: "SOURCE_VALUE",
    source_id: source.source_id,
    source_hash: source.source_hash,
    path,
    observed_value,
    ...(line ? { line } : {})
  };
}

function claim(source, contract, dimension, value, standing, evidence_refs) {
  return {
    claim_id: stableId("C", source.source_hash, contract.contract_id, dimension),
    dimension,
    value,
    standing,
    evidence_refs
  };
}

function unresolved(source, contract, dimension, description, reason) {
  return {
    unresolved_id: stableId("U", source.source_hash, contract.contract_id, dimension),
    dimension,
    description,
    reason,
    evidence_refs: []
  };
}

function baseView(source, contract) {
  return {
    view_id: stableId("V", source.source_hash, contract.contract_id),
    contract_id: contract.contract_id,
    view_type: contract.view_type,
    source_id: source.source_id,
    source_hash: source.source_hash,
    source_provenance: source.provenance,
    epistemic_status: "OBSERVATION",
    claims: [],
    deltas: [],
    unresolved_differences: [],
    evidence: [],
    generated_at: source.created_at
  };
}

function structuralView(source, contract) {
  const view = baseView(source, contract);
  const headingRecords = headings(source.payload);
  const fieldRecords = labeledFields(source.payload);
  const lineRecords = markdownLines(source.payload);

  view.evidence = [
    ...headingRecords.map((record) =>
      evidence(source, "line:" + record.line, record.text, record.line)
    ),
    ...fieldRecords.map((record) =>
      evidence(source, "line:" + record.line, record.text, record.line)
    )
  ];

  const refs = view.evidence.map((item) => item.evidence_id);
  view.claims = [
    claim(source, contract, "object_type", source.object_type, "OBSERVED", []),
    claim(
      source,
      contract,
      "field_names",
      fieldRecords.map((record) => record.label),
      "OBSERVED",
      refs
    ),
    claim(
      source,
      contract,
      "nesting",
      headingRecords.map((record) => ({
        level: record.level,
        label: record.label
      })),
      "OBSERVED",
      refs
    ),
    claim(
      source,
      contract,
      "cardinality",
      {
        lines: lineRecords.length,
        headings: headingRecords.length,
        labeled_fields: fieldRecords.length
      },
      "DERIVED",
      refs
    )
  ];

  view.unresolved_differences.push(
    unresolved(
      source,
      contract,
      "field_types",
      "The Markdown source declares labels and values but no formal field type schema.",
      "OUT_OF_SCOPE"
    )
  );

  return view;
}

function temporalView(source, contract) {
  const view = baseView(source, contract);
  const timestampRecords = explicitTimestamps(source.payload);
  const sequenceRecords = hashChainRows(source.payload);

  view.evidence = [
    ...timestampRecords.map((record) =>
      evidence(source, "line:" + record.line, record.value, record.line)
    ),
    ...sequenceRecords.map((record) =>
      evidence(source, "line:" + record.line, record.text, record.line)
    )
  ];

  const timestampRefs = view.evidence
    .slice(0, timestampRecords.length)
    .map((item) => item.evidence_id);
  const sequenceRefs = view.evidence
    .slice(timestampRecords.length)
    .map((item) => item.evidence_id);

  view.claims = [
    claim(
      source,
      contract,
      "explicit_timestamps",
      timestampRecords.map((record) => record.value),
      "OBSERVED",
      timestampRefs
    ),
    claim(
      source,
      contract,
      "declared_sequence",
      sequenceRecords.map((record) => record.label),
      "OBSERVED",
      sequenceRefs
    ),
    claim(
      source,
      contract,
      "ordering_if_explicit",
      sequenceRecords.map((record, index) => ({
        position: index + 1,
        label: record.label
      })),
      "DERIVED",
      sequenceRefs
    )
  ];

  view.unresolved_differences.push(
    unresolved(
      source,
      contract,
      "durations_if_derivable",
      "Only one explicit event timestamp is present; no duration can be derived.",
      "INSUFFICIENT_EVIDENCE"
    ),
    unresolved(
      source,
      contract,
      "temporal_gaps_if_derivable",
      "Only one explicit event timestamp is present; no temporal gap can be derived.",
      "INSUFFICIENT_EVIDENCE"
    )
  );

  return view;
}

function roleBindings(source) {
  const actionFields = labeledFields(source.payload).filter(
    (record) => record.section === "Action"
  );
  const roleLabels = new Set([
    "Proposed by",
    "Drafted by",
    "Approved by",
    "Executed by",
    "Recipients",
    "CC"
  ]);

  return actionFields
    .filter((record) => roleLabels.has(record.label))
    .flatMap((record) => {
      const values = record.label === "Recipients"
        ? record.value.split(",").map((value) => value.trim())
        : [record.value];
      return values.map((value) => ({ ...record, value }));
    });
}

function relationalView(source, contract) {
  const view = baseView(source, contract);
  const bindings = roleBindings(source);

  view.evidence = [...new Map(
    bindings.map((record) => [
      record.line,
      evidence(source, "line:" + record.line, record.text, record.line)
    ])
  ).values()];

  const evidenceByLine = new Map(
    view.evidence.map((item) => [item.line, item.evidence_id])
  );
  const roles = bindings.map((record) => ({
    role: record.label,
    entity_label: record.value,
    evidence_ref: evidenceByLine.get(record.line)
  }));
  const entities = [...new Set(bindings.map((record) => record.value))];
  const links = bindings.map((record) => ({
    source: "governed_action",
    relation: record.label,
    target: record.value,
    standing: "EXPLICIT_ROLE_LABEL",
    evidence_ref: evidenceByLine.get(record.line)
  }));

  const refs = view.evidence.map((item) => item.evidence_id);
  view.claims = [
    claim(source, contract, "explicit_entities", entities, "OBSERVED", refs),
    claim(source, contract, "declared_roles", roles, "OBSERVED", refs),
    claim(source, contract, "explicit_links", links, "DERIVED", refs),
    claim(
      source,
      contract,
      "source_target_pairs",
      links.map((link) => ({
        source: link.source,
        target: link.target,
        relation: link.relation
      })),
      "DERIVED",
      refs
    )
  ];

  view.unresolved_differences.push(
    unresolved(
      source,
      contract,
      "stated_membership",
      "The receipt does not declare a membership relation.",
      "INSUFFICIENT_EVIDENCE"
    )
  );

  return view;
}

export function refract(source, contract) {
  if (source.source_type !== "markdown") {
    throw new Error("UNSUPPORTED_SOURCE_TYPE: " + source.source_type);
  }

  const before = sha256(source.payload);
  let view;

  if (contract.view_type === "structural") {
    view = structuralView(source, contract);
  } else if (contract.view_type === "temporal") {
    view = temporalView(source, contract);
  } else if (contract.view_type === "relational") {
    view = relationalView(source, contract);
  } else {
    throw new Error("UNSUPPORTED_VIEW_TYPE: " + contract.view_type);
  }

  const after = sha256(source.payload);
  if (before !== after || after !== source.source_hash) {
    throw new Error("SOURCE_MUTATION_DETECTED");
  }

  validateView(view, contract);
  return deepFreeze(view);
}
