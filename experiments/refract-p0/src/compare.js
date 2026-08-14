import { validateView } from "./guards.js";

export function compareViews(source, contracts, views) {
  const byContract = new Map(
    contracts.map((contract) => [contract.contract_id, contract])
  );

  const projections = views.map((view) => {
    const contract = byContract.get(view.contract_id);
    validateView(view, contract);

    const exposed = new Set(view.claims.map((item) => item.dimension));
    const missed = contract.observable_dimensions.filter(
      (dimension) => !exposed.has(dimension)
    );

    return {
      contract_id: view.contract_id,
      view_type: view.view_type,
      exposed_dimensions: [...exposed],
      preserved: {
        source_id: view.source_id === source.source_id,
        source_hash: view.source_hash === source.source_hash,
        provenance: view.source_provenance.source_blob_sha ===
          source.provenance.source_blob_sha
      },
      missed_dimensions: missed,
      unresolved_differences: view.unresolved_differences,
      overclaim_check: "PASS"
    };
  });

  return {
    source_id: source.source_id,
    source_hash: source.source_hash,
    source_blob_sha: source.provenance.source_blob_sha,
    conserved_across_views: {
      source_id: new Set(views.map((view) => view.source_id)).size === 1,
      source_hash: new Set(views.map((view) => view.source_hash)).size === 1,
      epistemic_status:
        views.every((view) => view.epistemic_status === "OBSERVATION")
    },
    canonical_view_selected: false,
    source_mutated: false,
    projections
  };
}
