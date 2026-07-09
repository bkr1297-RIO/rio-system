import type { IntentPayload } from '../types/protocol.js';

export const wordGate = (rawIntent: string): IntentPayload => {
  const config = {
    fold_into_doctrine_queue: true,
    issue_drafting_order: false
  } as const;

  if (!config.fold_into_doctrine_queue) {
    throw new Error('Word Gate Violation: Intent must fold into the doctrine queue.');
  }

  return {
    raw_signal: rawIntent,
    governance_status: 'QUEUED_FOR_DOCTRINE',
    drafting_authorized: config.issue_drafting_order
  };
};
