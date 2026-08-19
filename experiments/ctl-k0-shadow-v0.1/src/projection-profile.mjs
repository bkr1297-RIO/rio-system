export const PROJECTION_VERSION = "rio-to-k0/0.1";

export const K0_CONSTITUTION = Object.freeze({
  id: "K0",
  version: "0.1.0",
  closedWorldStanding: true,
  requireCompleteDerivationForAdmission: true,
  requireReconstructabilityForLawfulSuccession: true,
  transitionDefinitions: [
    { kind: "UPDATE_RECORD", fromType: "RELATIONAL_WORLD", toType: "RELATIONAL_WORLD", allowedEffects: ["WRITE_RECORD"], standingPromotionDimensions: [], ruleRef: "K0.TRANSITION.UPDATE_RECORD@1" },
    { kind: "SEND_EXTERNAL", fromType: "RELATIONAL_WORLD", toType: "RELATIONAL_WORLD", allowedEffects: ["SEND_MESSAGE"], standingPromotionDimensions: [], ruleRef: "K0.TRANSITION.SEND_EXTERNAL@1" },
    { kind: "ATOMIC_UPDATE", fromType: "RELATIONAL_WORLD", toType: "RELATIONAL_WORLD", allowedEffects: ["WRITE_PRIMARY", "WRITE_INDEX"], standingPromotionDimensions: [], ruleRef: "K0.TRANSITION.ATOMIC_UPDATE@1" },
    { kind: "COPY_WORLD", fromType: "RELATIONAL_WORLD", toType: "RELATIONAL_WORLD", allowedEffects: ["COPY_STATE"], standingPromotionDimensions: [], ruleRef: "K0.TRANSITION.COPY_WORLD@1" },
    { kind: "REPAIR_WORLD", fromType: "RELATIONAL_WORLD", toType: "RELATIONAL_WORLD", allowedEffects: ["RESTORE_STATE"], standingPromotionDimensions: [], ruleRef: "K0.TRANSITION.REPAIR_WORLD@1" },
    { kind: "INSTALL_PATTERN", fromType: "RELATIONAL_WORLD", toType: "RELATIONAL_WORLD", allowedEffects: ["REGISTRY_WRITE"], standingPromotionDimensions: ["PATTERN_ADMISSION"], ruleRef: "K0.TRANSITION.INSTALL_PATTERN@1" },
    { kind: "RUN_PATTERN", fromType: "RELATIONAL_WORLD", toType: "RELATIONAL_WORLD", allowedEffects: ["PATTERN_EFFECT"], standingPromotionDimensions: [], ruleRef: "K0.TRANSITION.RUN_PATTERN@1" },
    { kind: "PROVISION_CAPABILITY", fromType: "RELATIONAL_WORLD", toType: "RELATIONAL_WORLD", allowedEffects: ["PROVISION_TOOL"], standingPromotionDimensions: ["CAPABILITY_ACCESS"], ruleRef: "K0.TRANSITION.PROVISION_CAPABILITY@1" },
    { kind: "AMEND_CONSTITUTION", fromType: "RELATIONAL_WORLD", toType: "RELATIONAL_WORLD", allowedEffects: ["WRITE_CONSTITUTION"], standingPromotionDimensions: ["CONSTITUTIONAL_STANDING"], ruleRef: "K0.TRANSITION.AMEND_CONSTITUTION@1" }
  ]
});

const ACTION_MAPPINGS = new Map([
  ["send_email", { kind: "SEND_EXTERNAL", effects: ["SEND_MESSAGE"], capabilities: ["message.send"] }],
  ["gmail.send", { kind: "SEND_EXTERNAL", effects: ["SEND_MESSAGE"], capabilities: ["message.send"] }],
  ["update_record", { kind: "UPDATE_RECORD", effects: ["WRITE_RECORD"], capabilities: ["record.write"] }],
  ["atomic_update", { kind: "ATOMIC_UPDATE", effects: ["WRITE_PRIMARY", "WRITE_INDEX"], capabilities: ["record.write", "index.write"] }],
  ["copy_world", { kind: "COPY_WORLD", effects: ["COPY_STATE"], capabilities: ["world.copy"] }],
  ["repair_world", { kind: "REPAIR_WORLD", effects: ["RESTORE_STATE"], capabilities: ["world.repair"] }],
  ["install_pattern", { kind: "INSTALL_PATTERN", effects: ["REGISTRY_WRITE"], capabilities: ["pattern.install"] }],
  ["run_pattern", { kind: "RUN_PATTERN", effects: ["PATTERN_EFFECT"], capabilities: ["pattern.run"] }],
  ["provision_capability", { kind: "PROVISION_CAPABILITY", effects: ["PROVISION_TOOL"], capabilities: ["tool.provision"] }],
  ["amend_constitution", { kind: "AMEND_CONSTITUTION", effects: ["WRITE_CONSTITUTION"], capabilities: ["constitution.write"] }]
]);

export function mapAction(action) {
  return ACTION_MAPPINGS.get(String(action).toLowerCase()) ?? {
    kind: `RIO_UNMAPPED_ACTION:${String(action)}`,
    effects: ["UNMAPPED_RUNTIME_ACTION"],
    capabilities: [],
  };
}
