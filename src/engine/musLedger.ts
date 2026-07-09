import { readFileSync } from 'node:fs';
import type { GovernedPacket, MUSLedgerReceipt, SignatureBlock } from '../types/protocol.js';

const SOURCEPOINT_AUTHORITY_ID = 'sourcepoint:brian-rasmussen';

export const verifyMUSLedgerSignature = (
  heldPacket: GovernedPacket,
  ledgerPath = './data/mus_ledger.json'
): boolean => {
  try {
    const rawLedger = readFileSync(ledgerPath, 'utf-8');
    const ledger = JSON.parse(rawLedger) as MUSLedgerReceipt[];
    const receipt = ledger.find((entry) => entry.trace_id === heldPacket.trace_id);

    if (!receipt) {
      return false;
    }

    const sigBlock: SignatureBlock = receipt.signature_block;
    if (sigBlock.verification_status !== 'VERIFIED') {
      console.warn(`[MUS AUDIT]: Signature present but not VERIFIED for Trace ${heldPacket.trace_id}`);
      return false;
    }

    if (receipt.content_hash.value !== heldPacket.content_hash.value) {
      console.error('[FATAL]: Ledger content_hash does not match the packet held in superposition.');
      throw new Error('AUTHORITY DRIFT DETECTED: Execution permanently halted.');
    }

    if (receipt.source_point_authority?.authority_id !== SOURCEPOINT_AUTHORITY_ID) {
      console.error('[FATAL]: Signature belongs to an unauthorized jurisdiction.');
      return false;
    }

    return true;
  } catch {
    return false;
  }
};
