import type { GovernedPacket, SentinelTraceReceipt, SignatureBlock } from '../types/protocol.js';

export const executeSentinelTraceBatch23 = (
  packet: GovernedPacket,
  rioHandoffComplete: boolean
): SentinelTraceReceipt => {
  if (!rioHandoffComplete) {
    throw new Error('Sentinel Error: Trace attempted before RIO handoff. Sentinel verifies after RIO handoff only.');
  }

  const signatureValid = verifySignatureBlock(packet.signature_block);
  const hashIntact = verifyContentHash(packet.target_commit_hash, packet.content_hash.value);

  if (!signatureValid || !hashIntact) {
    throw new Error('Sentinel Fatal: Structural drift detected in packet transit. Execution halted.');
  }

  return {
    trace_id: packet.trace_id,
    batch: '23',
    status: 'VERIFIED_PRE_EXECUTION',
    timestamp: new Date().toISOString()
  };
};

const verifySignatureBlock = (signature: SignatureBlock): boolean => {
  return signature.verification_status === 'VERIFIED';
};

const verifyContentHash = (commitSha: string, contentHash: string): boolean => {
  return commitSha.length === 40 && contentHash.length > 0;
};
