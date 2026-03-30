from fastapi import Request, HTTPException, Depends
from .oauth_provider import rio_auth

# RIO Protocol: Protected Procedure Middleware (v1.0)
# Lane: DevOps / Deployment
# Status: DRAFT (Pending PR Approval)

async def protected_procedure(request: Request):
    """
    Middleware to enforce authenticated human approval for RIO actions.
    Extracts identity from the OAuth token and binds it to the request context.
    Fail-Closed: No token or invalid token results in a 401 Unauthorized.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="RIO Protocol Violation: No OAuth token provided. Fail-Closed.")

    token = auth_header.split(" ")[1]
    provider = request.headers.get("X-RIO-Provider", "google") # Default to Google

    try:
        user_data = await rio_auth.verify_token(token, provider)
        
        # Enforce Sovereign Identity (I-1)
        if not user_data.get("is_sovereign"):
            raise HTTPException(status_code=403, detail="RIO Protocol Violation: Unauthorized identity. Only I-1 can sign.")
        
        # Bind user data to the request state for the approval record
        request.state.user = user_data
        return user_data

    except Exception as e:
        raise HTTPException(status_code=401, detail=f"RIO Protocol Violation: Identity verification failed. {str(e)}")

# Dependency for FastAPI routes
SovereignApproval = Depends(protected_procedure)
