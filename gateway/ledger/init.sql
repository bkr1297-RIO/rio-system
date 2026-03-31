-- RIO Ledger — PostgreSQL Schema
-- This file is used by Docker to initialize the database on first run.

-- Intents table: stores the full pipeline state for each intent
CREATE TABLE IF NOT EXISTS intents (
    id SERIAL PRIMARY KEY,
    intent_id UUID UNIQUE NOT NULL,
    action VARCHAR(255) NOT NULL,
    agent_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'submitted',
    parameters JSONB,
    governance JSONB,
    "authorization" JSONB,
    execution JSONB,
    receipt JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ledger entries table: append-only log of all pipeline events
CREATE TABLE IF NOT EXISTS ledger_entries (
    id SERIAL PRIMARY KEY,
    entry_id UUID NOT NULL,
    intent_id UUID NOT NULL,
    action VARCHAR(255),
    agent_id VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    detail TEXT,
    intent_hash VARCHAR(64),
    authorization_hash VARCHAR(64),
    execution_hash VARCHAR(64),
    receipt_hash VARCHAR(64),
    ledger_hash VARCHAR(64) NOT NULL,
    prev_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Receipts table: stores completed receipts for verification
CREATE TABLE IF NOT EXISTS receipts (
    id SERIAL PRIMARY KEY,
    receipt_id UUID UNIQUE NOT NULL,
    intent_id UUID NOT NULL,
    action VARCHAR(255) NOT NULL,
    agent_id VARCHAR(255) NOT NULL,
    authorized_by VARCHAR(255),
    hash_chain JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Authorized signers: Ed25519 public keys
CREATE TABLE IF NOT EXISTS authorized_signers (
    id SERIAL PRIMARY KEY,
    signer_id VARCHAR(255) UNIQUE NOT NULL,
    public_key_hex VARCHAR(64) NOT NULL,
    display_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'approver',
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ledger_intent_id ON ledger_entries(intent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_status ON ledger_entries(status);
CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
CREATE INDEX IF NOT EXISTS idx_receipts_intent_id ON receipts(intent_id);

-- Prevent deletion from ledger (append-only enforcement)
CREATE OR REPLACE FUNCTION prevent_ledger_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DELETE operations are not permitted on the ledger. The ledger is append-only.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_delete_ledger ON ledger_entries;
CREATE TRIGGER no_delete_ledger
    BEFORE DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_delete();

-- Prevent updates to ledger entries (immutable)
CREATE OR REPLACE FUNCTION prevent_ledger_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'UPDATE operations are not permitted on the ledger. Ledger entries are immutable.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_update_ledger ON ledger_entries;
CREATE TRIGGER no_update_ledger
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_update();
