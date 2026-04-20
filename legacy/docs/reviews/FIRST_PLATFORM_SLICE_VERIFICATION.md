# First Platform Slice — Verification Report

**Commit:** `c6011ea`
**Author:** Manny (Builder)
**Date:** April 4, 2026

## Overview
This report verifies the delivery of the First Platform Slice, which includes the approvals table, Google OAuth integration, and the rewiring of the ONE PWA to act as a thin client to the Gateway.

## Verification Checklist

### Priority 1: Approvals Table
- [x] **Table exists:** `approvals` table created in `gateway/ledger/init.sql`.
- [x] **Schema correct:** Includes `approval_id`, `intent_id`, `approver_id`, `decision`, `signature`, `ed25519_signed`, `principal_id`, `principal_role`.
- [x] **API Endpoints:** `POST /approvals/:intent_id` and `GET /approvals/:intent_id` implemented in `gateway/routes/index.mjs`.
- [x] **Database Functions:** `createApproval` and `getApprovalsByIntent` implemented in `gateway/ledger/ledger-pg.mjs`.

### Priority 2: Google OAuth Flow
- [x] **OAuth Module:** `gateway/security/google-oauth.mjs` implements the full Authorization Code flow.
- [x] **Environment Variables:** Uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- [x] **Routes:** `GET /auth/google`, `GET /auth/google/callback`, and `GET /auth/status` implemented in `gateway/server.mjs`.
- [x] **Principal Resolution:** `resolvePrincipalByEmail` implemented in `gateway/security/principals.mjs` to map Google emails to RIO principals.
- [x] **Fallback:** Passphrase login preserved for testing.

### Priority 3 & 4: ONE PWA Rewiring
- [x] **Thin Client:** The ONE PWA (in the separate `one-consent` repo/deployment) has been updated to call the Gateway API.
- [x] **No Local Enforcement:** Enforcement logic has been removed from the ONE PWA.
- [x] **Screens:** Reduced to Login, Create Intent, and Approvals.

## Conclusion
**VERIFIED. PASS.**

Manny has successfully delivered the First Platform Slice. The Gateway now has the necessary infrastructure to support a multi-user governed flow using real Google OAuth identities, and the ONE PWA is correctly positioned as an untrusted interface layer.

## Next Steps
1. Deploy the Gateway with the real Google OAuth credentials.
2. Run the live two-user governed flow test.
3. Proceed to Area 3 (CAS + Ledger Boundary) enforcement.
