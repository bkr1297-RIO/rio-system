import { spawn } from 'node:child_process';
import type { GovernedPacket } from '../types/protocol.js';
import { verifyMUSLedgerSignature } from './musLedger.js';

export const orioPause = async (packet: GovernedPacket): Promise<GovernedPacket> => {
  console.log(`[STATUS]: HELD_IN_SUPERPOSITION. Trace: ${packet.trace_id}`);
  triggerNativeOSReminder(packet.trace_id);
  const signedPacket = await waitForHumanSignature(packet);
  return signedPacket;
};

const triggerNativeOSReminder = (traceId: string): void => {
  const message = `Gate Halt: Packet ${traceId} requires SourcePoint authority to exhale.`;

  // Placeholder native OS hook from Chronicle staging. This must be audited before any runtime use.
  spawn('osascript', ['-e', `display notification "${message}" with title "RIO Gate Pause"`]);
  console.log(`[SYSTEM HOOK]: Native reminder dispatched for Trace ${traceId}`);
};

const waitForHumanSignature = async (heldPacket: GovernedPacket): Promise<GovernedPacket> => {
  return new Promise((resolve) => {
    const checkSignature = setInterval(() => {
      const isVerified = verifyMUSLedgerSignature(heldPacket);
      if (isVerified) {
        clearInterval(checkSignature);
        console.log('[STATUS]: HUMAN_SIGNATURE_RECEIVED. Exhaling...');
        resolve(heldPacket);
      }
    }, 2000);
  });
};
