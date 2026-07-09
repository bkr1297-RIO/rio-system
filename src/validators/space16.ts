import type { Space16Grid, ValidationResult } from '../types/protocol.js';

export const validateSpace16Grid = (
  gridState: Space16Grid,
  currentPhase: string
): ValidationResult => {
  const requiresAbsenceFlag = currentPhase === 'HELD_IN_SUPERPOSITION' || currentPhase === 'PRE_RECEIPT';

  if (requiresAbsenceFlag && !gridState.absence_flag_active) {
    return {
      is_valid: false,
      reason: `Space-16 Error: Absence flag must be active during phase [${currentPhase}]`
    };
  }

  if (!requiresAbsenceFlag && gridState.absence_flag_active) {
    return {
      is_valid: false,
      reason: `Space-16 Error: Absence flag illegally asserted during phase [${currentPhase}]`
    };
  }

  return { is_valid: true, reason: 'Space-16 grid topology verified.' };
};
