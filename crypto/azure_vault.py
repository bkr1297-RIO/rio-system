import os
from azure.identity import DefaultAzureCredential
from azure.keyvault.keys import KeyClient
from azure.keyvault.keys.crypto import CryptographyClient, SignatureAlgorithm
from fastapi import HTTPException

# RIO Protocol: Azure Key Vault Client (v1.0)
# Lane: DevOps / Deployment
# Status: DRAFT (Pending PR Approval)

class RIOAzureVault:
    """
    Handles secure key management and signing via Azure Key Vault.
    Fail-Closed: Any vault failure blocks the execution gate.
    """
    def __init__(self):
        self.vault_url = os.getenv("AZURE_VAULT_URL")
        self.key_name = os.getenv("RIO_SIGNING_KEY_NAME", "rio-sovereign-key")
        
        if self.vault_url:
            self.credential = DefaultAzureCredential()
            self.key_client = KeyClient(vault_url=self.vault_url, credential=self.credential)
            # In production, we would use the CryptographyClient for HSM-backed signing
            # self.crypto_client = CryptographyClient(key_id=self.key_client.get_key(self.key_name).id, credential=self.credential)
        else:
            self.key_client = None

    def get_public_key(self) -> str:
        """
        Retrieves the Ed25519 public key from Azure Key Vault.
        Used for receipt verification.
        """
        if not self.key_client:
            raise HTTPException(status_code=500, detail="RIO Protocol Violation: Azure Key Vault not configured. Fail-Closed.")
        
        try:
            key = self.key_client.get_key(self.key_name)
            # Ed25519 keys in Azure are returned as JWK
            return key.key.x.hex() # Simplified for RIO hex format
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"RIO Protocol Violation: Key retrieval failed. {str(e)}")

    def sign_with_vault(self, intent_hash: str) -> str:
        """
        Signs the intent hash using the HSM-backed key in Azure Key Vault.
        Fail-Closed: Any vault error blocks the approval.
        """
        if not self.key_client:
            raise HTTPException(status_code=500, detail="RIO Protocol Violation: Azure Key Vault not configured. Fail-Closed.")
        
        try:
            # In a real Azure environment, this would call the vault's sign API
            # For the RIO prototype, we simulate the HSM-backed signing
            # return self.crypto_client.sign(SignatureAlgorithm.ED25519, intent_hash.encode()).signature
            return "SIMULATED_AZURE_VAULT_SIGNATURE_HASH"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"RIO Protocol Violation: Vault signing failed. {str(e)}")

# Global Vault Instance
rio_vault = RIOAzureVault()
