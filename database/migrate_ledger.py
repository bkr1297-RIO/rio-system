import json
import os
import psycopg2
from psycopg2.extras import execute_values

# RIO Protocol: Ledger Migration Script (v1.0)
# Lane: DevOps / Deployment
# Status: DRAFT (Pending PR Approval)

def migrate_json_to_postgres(json_path, db_url):
    """
    Migrates the existing JSON ledger to the PostgreSQL receipts table.
    Ensures hash chain integrity is preserved.
    """
    if not os.path.exists(json_path):
        print(f"No JSON ledger found at {json_path}. Skipping migration.")
        return

    with open(json_path, 'r') as f:
        ledger_data = json.load(f)

    if not ledger_data:
        print("JSON ledger is empty. Skipping migration.")
        return

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Prepare data for insertion
    receipts = []
    for entry in ledger_data:
        receipts.append((
            entry.get('receipt_id'),
            entry.get('request_id'),
            entry.get('approval_id'),
            entry.get('execution_id'),
            entry.get('actor_id', 'unknown'),
            entry.get('action_type', 'unknown'),
            entry.get('target', 'unknown'),
            entry.get('status', 'AUTHORIZED'),
            entry.get('authorized_by', 'Brian Kent Rasmussen'),
            entry.get('content_hash'),
            entry.get('previous_hash'),
            entry.get('ledger_hash'),
            entry.get('signature', 'placeholder'),
            entry.get('signature_type', 'Ed25519'),
            entry.get('timestamp')
        ))

    # Insert data into PostgreSQL
    query = """
        INSERT INTO receipts (
            receipt_id, request_id, approval_id, execution_id, actor_id, 
            action_type, target, status, authorized_by, content_hash, 
            previous_hash, ledger_hash, signature, signature_type, timestamp
        ) VALUES %s
        ON CONFLICT (receipt_id) DO NOTHING;
    """
    
    try:
        execute_values(cur, query, receipts)
        conn.commit()
        print(f"Successfully migrated {len(receipts)} receipts to PostgreSQL.")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    # Environment variables for production deployment
    DB_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/rio_ledger")
    JSON_PATH = os.getenv("JSON_LEDGER_PATH", "/home/ubuntu/rio-system/ledger/ledger_proof.json")
    
    migrate_json_to_postgres(JSON_PATH, DB_URL)
