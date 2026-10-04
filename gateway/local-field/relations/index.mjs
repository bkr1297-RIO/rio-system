export { PROFILE, CAPABILITIES, FORBIDDEN_CONVERSIONS, RelationType, Relation, MatrixType, Matrix, fingerprint } from './types.mjs';
export { fixedSubstrate } from './substrate.mjs';
export { directMatrix, compileRelations, RelationalPlan } from './compiler.mjs';
export { prepareDirect } from './direct.mjs';
export { DecisionContext, SimulationArtifact, SIMULATION_PROFILE, SIMULATION_LIMITS, DECISION_DIMENSIONS } from './possibility.mjs';
export { compressPossibilities } from './compression.mjs';
export { transducePossibilities } from './transduction.mjs';
