# RIO System: Key Recovery & Ledger Resync Implementation Plan

## 1. Gap Analysis

Based on the issue report and codebase analysis, here is the current state vs. what is missing:

### Current State
- **Gateway (Server):**
  - Supports Ed25519 signature verification for approvals (`gateway/security/ed25519.mjs`, `gateway/routes/api-v1.mjs`).
  - Has an identity binding system to store public keys (`gateway/security/identity-binding.mjs`).
  - Has a `/api/signers/generate-keypair` endpoint that returns the private key ONCE.
  - Has a persistent PostgreSQL ledger (`gateway/ledger/ledger-pg.mjs`).
- **Client/App (Device):**
  - Approvals are currently session-based (via tRPC `approve` mutation), NOT cryptographically signed by the device.
  - No local storage (IndexedDB) for the private key.
  - No mechanism to backup or restore the private key.
  - No mechanism to sync the local ledger state with the server.

### Missing Components (The Gap)
1. **Encrypted Key Backup & Recovery:** The user needs a way to securely store their private key (e.g., encrypted with a passphrase) and restore it on a new device.
2. **Device Key Management (IndexedDB):** The client app needs to store the private key securely in the browser and use it to sign approval payloads.
3. **Ledger Resync Mechanism:** The client needs to be able to detect a broken local ledger (or missing entries) and download the canonical chain from the server.
4. **Sync Endpoint:** A dedicated endpoint (or tRPC procedure) to handle device synchronization (fetching missing ledger entries, verifying state).

## 2. Implementation Plan

We will implement the required fixes in the following phases:

### Phase 1: Encrypted Private Key Backup and Recovery
- **Goal:** Allow users to encrypt their private key with a passphrase and save it (either locally or on the server) so it can be restored later.
- **Files to Modify/Create:**
  - `client/src/lib/crypto.ts` (New): Implement AES-GCM encryption/decryption for the private key, and Ed25519 signing utilities using `tweetnacl`.
  - `client/src/lib/keyStore.ts` (New): Implement IndexedDB wrapper (using `idb` or raw IndexedDB) to store the private key securely in the browser.
  - `server/routers/rio.ts`: Add tRPC endpoints for storing and retrieving an *encrypted* key backup (if we want server-side backup) or just rely on file download. We'll implement a server-side encrypted backup for seamless multi-device sync.
  - `drizzle/schema.ts`: Add a `keyBackups` table to store the encrypted private key per user.

### Phase 2: Ledger Resync Mechanism
- **Goal:** Allow the client to download the full ledger chain from the server and verify it locally.
- **Files to Modify/Create:**
  - `server/routers/rio.ts`: Ensure `ledgerChain` can return the full chain or missing blocks.
  - `client/src/lib/ledgerSync.ts` (New): Client-side logic to fetch the ledger from the server, verify the hash chain, and store it locally (if a local ledger replica is needed, though currently the app reads from the server).

### Phase 3: Device Sync Flow and Multi-Device Restore
- **Goal:** Create a unified "Sync / Restore" UI flow where a user entering a new device can provide their passphrase, decrypt their key, and resync the ledger.
- **Files to Modify/Create:**
  - `client/src/pages/Settings.tsx` (or similar): Add UI for "Backup Key", "Restore Key", and "Resync Ledger".
  - `client/src/pages/Go.tsx` / `client/src/pages/BondiApp.tsx`: Update the approval flow to actually *use* the local private key to sign the intent before sending it to the server.

### Phase 4: Wiring the Signed Approvals
- **Goal:** Update the tRPC `approve` and `deny` endpoints to accept and forward the client-generated Ed25519 signature to the gateway.
- **Files to Modify/Create:**
  - `server/routers/rio.ts`: Update `approve` and `deny` input schemas to accept `signature` and `signatureTimestamp`.
  - `server/governance-router.ts`: Pass the signature to the gateway client.

## 3. Step-by-Step Execution

1. **Database Schema Update:** Add `keyBackups` table to `drizzle/schema.ts` and run migration.
2. **Server Endpoints:** Add `backupKey`, `recoverKey`, and `syncLedger` to `server/routers/rio.ts`.
3. **Client Crypto & Storage:** Create `client/src/lib/crypto.ts` and `client/src/lib/keyStore.ts`.
4. **Client UI:** Build the recovery/sync UI components.
5. **Approval Wiring:** Modify the approval flow to use the local key.
