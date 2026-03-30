import os
from typing import Dict, Optional
from fastapi import HTTPException, Security
from fastapi.security import OAuth2PasswordBearer
import requests

# RIO Protocol: OAuth Identity Provider (v1.0)
# Lane: DevOps / Deployment
# Status: DRAFT (Pending PR Approval)

class RIOAuthProvider:
    """
    Handles OAuth2 identity verification for Google and Microsoft.
    Binds approvals to the authenticated Sovereign Human Authority (I-1).
    """
    def __init__(self):
        self.google_client_id = os.getenv("GOOGLE_CLIENT_ID")
        self.microsoft_client_id = os.getenv("MICROSOFT_CLIENT_ID")
        self.oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

    async def verify_token(self, token: str, provider: str = "google") -> Dict:
        """
        Verifies the OAuth token with the provider and returns user metadata.
        Fail-Closed: Any verification failure blocks the approval flow.
        """
        if provider == "google":
            return self._verify_google(token)
        elif provider == "microsoft":
            return self._verify_microsoft(token)
        else:
            raise HTTPException(status_code=400, detail="Unsupported OAuth provider")

    def _verify_google(self, token: str) -> Dict:
        # Real implementation would use google-auth library
        # This is the structural logic for the RIO Gateway
        response = requests.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}")
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google Token - Fail-Closed")
        
        data = response.json()
        return {
            "user_id": data.get("sub"),
            "email": data.get("email"),
            "name": data.get("name"),
            "provider": "google",
            "is_sovereign": data.get("email") == os.getenv("SOVEREIGN_EMAIL")
        }

    def _verify_microsoft(self, token: str) -> Dict:
        # Real implementation would use msal library
        response = requests.get("https://graph.microsoft.com/v1.0/me", headers={"Authorization": f"Bearer {token}"})
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Microsoft Token - Fail-Closed")
        
        data = response.json()
        return {
            "user_id": data.get("id"),
            "email": data.get("userPrincipalName"),
            "name": data.get("displayName"),
            "provider": "microsoft",
            "is_sovereign": data.get("userPrincipalName") == os.getenv("SOVEREIGN_EMAIL")
        }

# Global Auth Instance
rio_auth = RIOAuthProvider()
