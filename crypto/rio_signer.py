import os
import base64
from nacl.signing import SigningKey, VerifyKey
from nacl.exceptions import BadSignatureError
from fastapi import HTTPException

# RIO Protocol: Ed25519 Cryptographic Signer (v1.0)
# Lane: DevOps / Deployment
# Status: DRAFT (Pending PR Approval)

class RIOSigner:
    """
    Handles Ed25519 signing and verification for RIO ApprovalRecords.
    Fail-Closed: Any signature failure blocks the execution gate.
    """
    def __init__(self, private_key_hex: str = None):
        if private_key_hex:
            self.signing_key = SigningKey(bytes.fromhex(private_key_hex))
        else:
            # In production, this would be retrieved from Azure Key Vault
            self.signing_key = None

    def sign_intent(self, intent_hash: str) -> str:
        """
        Signs the SHA-256 intent hash using Ed25519.
        Returns a base64-encoded signature.
        """
        if not self.signing_key:
            raise HTTPException(status_code=500, detail="RIO Protocol Violation: Signing key not initialized. Fail-Closed.")
        
        signed = self.signing_key.sign(intent_hash.encode('utf-8'))
        return base64.b64encode(signed.signature).decode('utf-8')

    def verify_signature(self, intent_hash: str, signature_b64: str, public_key_hex: str) -> bool:
        """
        Verifies the Ed25519 signature against the intent hash and public key.
        Fail-Closed: Returns False if verification fails.
        """
        try:
            verify_key = VerifyKey(bytes.fromhex(public_key_hex))
            signature = base64.b64decode(signature_b64)
            verify_key.verify(intent_hash.encode('utf-8'), signature)
            return True
        except (BadSignatureError, Exception):
            return False

# Global Signer Instance (to be initialized with Key Vault)
rio_signer = RIOSigner()
