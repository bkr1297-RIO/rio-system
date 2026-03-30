-- RIO Protocol: Persistent Ledger Schema (v1.0)
-- Lane: DevOps / Deployment
-- Status: DRAFT (Pending PR Approval)

-- 1. Receipts Table (Append-Only)
CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID UNIQUE NOT NULL,
    request_id UUID NOT NULL,
    approval_id UUID NOT NULL,
    execution_id UUID NOT NULL,
    actor_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    authorized_by TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    ledger_hash TEXT UNIQUE NOT NULL,
    signature TEXT NOT NULL,
    signature_type TEXT DEFAULT 'Ed25519',
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Append-Only Enforcement (Trigger)
CREATE OR REPLACE FUNCTION block_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'RIO Protocol Violation: Receipts are immutable and append-only. UPDATE/DELETE blocked.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_update_delete
BEFORE UPDATE OR DELETE ON receipts
FOR EACH ROW EXECUTE FUNCTION block_update_delete();

-- 3. Indexing for Verification
CREATE INDEX idx_receipts_ledger_hash ON receipts(ledger_hash);
CREATE INDEX idx_receipts_request_id ON receipts(request_id);
CREATE INDEX idx_receipts_timestamp ON receipts(timestamp DESC);

-- 4. Audit Log (Internal Metadata)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    description TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
