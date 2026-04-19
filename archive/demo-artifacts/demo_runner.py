#!/usr/bin/env python3
"""
RIO Demo Artifact Runner
========================
Runs 3 demo actions through the live Gateway governance pipeline and captures
full trace artifacts: intent, governance, authorization, execution, receipt,
and ledger proof.

Demo Actions:
  1. send_email (HIGH risk) — I-1 proposes, I-2 approves, Gateway receipts, proxy delivers
  2. send_email rejection — I-1 proposes, I-2 denies, no execution, denial receipt
  3. send_email self-approval — I-1 proposes AND approves, cooldown enforced

Each run captures the full JSON trace for packaging into the demo artifact document.
"""

import requests
import json
import time
import uuid
import hashlib
import os
import sys
from datetime import datetime, timezone

GATEWAY_URL = os.environ.get("VITE_GATEWAY_URL", "https://rio-gateway.onrender.com")
TIMEOUT = 30

# Credentials — these are the Gateway passphrases
I1_PASS = "rio-governed-2026"
I2_PASS = "rio-governed-2026"

class DemoRunner:
    def __init__(self):
        self.traces = []
        self.i1_token = None
        self.i2_token = None

    def _req(self, method, path, token=None, json_data=None, label=""):
        """Make a Gateway request and return (status, data, elapsed_ms)."""
        url = f"{GATEWAY_URL}{path}"
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        # Add replay prevention fields to all POST requests
        if method == "POST" and json_data is not None:
            json_data["request_timestamp"] = datetime.now(timezone.utc).isoformat()
            json_data["request_nonce"] = str(uuid.uuid4())

        t0 = time.time()
        try:
            if method == "POST":
                r = requests.post(url, headers=headers, json=json_data, timeout=TIMEOUT)
            else:
                r = requests.get(url, headers=headers, timeout=TIMEOUT)
            elapsed = int((time.time() - t0) * 1000)
            try:
                data = r.json()
            except:
                data = {"raw": r.text[:500]}
            return r.status_code, data, elapsed
        except requests.exceptions.Timeout:
            elapsed = int((time.time() - t0) * 1000)
            return 0, {"error": "TIMEOUT", "elapsed_ms": elapsed}, elapsed
        except Exception as e:
            elapsed = int((time.time() - t0) * 1000)
            return 0, {"error": str(e)}, elapsed

    def login(self, user_id, passphrase):
        """Login to Gateway and return JWT token."""
        status, data, ms = self._req("POST", "/login", json_data={
            "user_id": user_id,
            "passphrase": passphrase,
        }, label=f"Login {user_id}")
        print(f"  Login {user_id}: {status} ({ms}ms)")
        if status == 200 and "token" in data:
            return data["token"]
        print(f"  ERROR: {json.dumps(data, indent=2)[:200]}")
        return None

    def authenticate(self):
        """Login both principals."""
        print("\n=== Authenticating Principals ===")
        self.i1_token = self.login("I-1", I1_PASS)
        self.i2_token = self.login("I-2", I2_PASS)
        if not self.i1_token or not self.i2_token:
            print("FATAL: Could not authenticate both principals")
            sys.exit(1)
        print("  Both principals authenticated.")

    def run_demo_1(self):
        """Demo 1: Full governed email — I-1 proposes, I-2 approves, Gateway receipts."""
        print("\n" + "=" * 70)
        print("DEMO 1: Full Governed Email (send_email, HIGH risk)")
        print("  Proposer: I-1 | Approver: I-2 | Expected: RECEIPTED")
        print("=" * 70)

        trace = {
            "demo_id": "DEMO-001",
            "title": "Full Governed Email — Separated Authority",
            "description": "I-1 proposes send_email, I-2 approves, Gateway issues receipt with Ed25519 signature",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "steps": [],
        }

        # Step 1: Submit intent (Intake Schema v1)
        intent_payload = {
            "identity": {
                "subject": "brian.k.rasmussen",
                "auth_method": "jwt_session",
                "role": "owner",
            },
            "intent": {
                "action": "send_email",
                "target": "gmail",
                "parameters": {
                    "to": "demo-proof@rio-system.dev",
                    "subject": f"RIO Demo 1 — Governed Email Proof [{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}]",
                    "body": "This email was proposed by I-1, approved by I-2, and executed through the RIO governance pipeline. Receipt and ledger proof attached.",
                },
            },
            "context": {
                "reason": "Demo artifact: prove full governed action loop with separated authority",
                "risk_scope": "external",
                "urgency": "normal",
            },
            "delivery_mode": "external",
        }
        status, data, ms = self._req("POST", "/intent", self.i1_token, intent_payload)
        # Gateway assigns its own intent_id
        actual_intent_id = data.get("intent_id", data.get("id", "UNKNOWN"))
        trace["steps"].append({
            "step": "1_submit_intent",
            "actor": "I-1 (Proposer)",
            "endpoint": "POST /intent",
            "status": status,
            "elapsed_ms": ms,
            "request": intent_payload,
            "response": data,
        })
        print(f"  1. Submit intent: {status} ({ms}ms) → intent_id={actual_intent_id}")

        if status != 200 and status != 201:
            trace["result"] = "FAILED_AT_INTENT"
            trace["error"] = data
            self.traces.append(trace)
            return trace

        # Step 2: Govern (risk assessment)
        status, data, ms = self._req("POST", "/govern", self.i1_token, {
            "intent_id": actual_intent_id,
        })
        trace["steps"].append({
            "step": "2_govern",
            "actor": "Gateway (Policy Engine)",
            "endpoint": "POST /govern",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })
        risk = data.get("risk_tier", data.get("risk", "UNKNOWN"))
        decision = data.get("decision", "UNKNOWN")
        print(f"  2. Govern: {status} ({ms}ms) → risk={risk}, decision={decision}")

        # Step 3: Authorize (I-2 approves)
        status, data, ms = self._req("POST", "/authorize", self.i2_token, {
            "intent_id": actual_intent_id,
            "decision": "approved",
            "authorized_by": "I-2",
        })
        trace["steps"].append({
            "step": "3_authorize",
            "actor": "I-2 (Approver)",
            "endpoint": "POST /authorize",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })
        print(f"  3. Authorize: {status} ({ms}ms) → {data.get('status', data.get('message', 'UNKNOWN'))}")

        # Step 4: Execute (I-1 executes with external delivery)
        status, data, ms = self._req("POST", "/execute-action", self.i1_token, {
            "intent_id": actual_intent_id,
            "delivery_mode": "external",
        })
        trace["steps"].append({
            "step": "4_execute",
            "actor": "I-1 (Proposer) via Gateway",
            "endpoint": "POST /execute-action",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })

        receipt = data.get("receipt", {})
        print(f"  4. Execute: {status} ({ms}ms)")
        if receipt:
            print(f"     Receipt ID: {receipt.get('receipt_id', 'N/A')}")
            print(f"     Receipt Hash: {receipt.get('receipt_hash', 'N/A')[:32]}...")
            print(f"     Ledger Entry: {receipt.get('ledger_entry_id', 'N/A')}")
            print(f"     Proposer: {receipt.get('proposer_id', 'N/A')}")
            print(f"     Approver: {receipt.get('approver_id', 'N/A')}")
            print(f"     Signature: {receipt.get('gateway_signature', 'N/A')[:32]}..." if receipt.get('gateway_signature') else "     Signature: N/A")

        trace["receipt"] = receipt
        trace["result"] = "RECEIPTED" if receipt.get("receipt_id") else "FAILED"
        trace["completed_at"] = datetime.now(timezone.utc).isoformat()
        self.traces.append(trace)
        return trace

    def run_demo_2(self):
        """Demo 2: Rejected email — I-1 proposes, I-2 denies."""
        print("\n" + "=" * 70)
        print("DEMO 2: Rejected Email (send_email, HIGH risk, DENIED)")
        print("  Proposer: I-1 | Approver: I-2 | Expected: DENIED")
        print("=" * 70)

        trace = {
            "demo_id": "DEMO-002",
            "title": "Rejected Email — Authority Denial",
            "description": "I-1 proposes send_email, I-2 denies, no execution occurs, denial logged",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "steps": [],
        }

        # Step 1: Submit intent (Intake Schema v1)
        intent_payload = {
            "identity": {
                "subject": "brian.k.rasmussen",
                "auth_method": "jwt_session",
                "role": "owner",
            },
            "intent": {
                "action": "send_email",
                "target": "gmail",
                "parameters": {
                    "to": "should-not-send@rio-system.dev",
                    "subject": "RIO Demo 2 — This Should Be Denied",
                    "body": "If you receive this email, the denial flow is broken.",
                },
            },
            "context": {
                "reason": "Demo artifact: prove denial flow blocks execution",
                "risk_scope": "external",
                "urgency": "normal",
            },
            "delivery_mode": "external",
        }
        status, data, ms = self._req("POST", "/intent", self.i1_token, intent_payload)
        actual_intent_id = data.get("intent_id", data.get("id", "UNKNOWN"))
        trace["steps"].append({
            "step": "1_submit_intent",
            "actor": "I-1 (Proposer)",
            "endpoint": "POST /intent",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })
        print(f"  1. Submit intent: {status} ({ms}ms) → intent_id={actual_intent_id}")

        # Step 2: Govern
        status, data, ms = self._req("POST", "/govern", self.i1_token, {
            "intent_id": actual_intent_id,
        })
        trace["steps"].append({
            "step": "2_govern",
            "actor": "Gateway (Policy Engine)",
            "endpoint": "POST /govern",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })
        print(f"  2. Govern: {status} ({ms}ms)")

        # Step 3: Deny (I-2 rejects)
        status, data, ms = self._req("POST", "/authorize", self.i2_token, {
            "intent_id": actual_intent_id,
            "decision": "denied",
            "authorized_by": "I-2",
            "reason": "Demo: deliberate denial to prove fail-closed behavior",
        })
        trace["steps"].append({
            "step": "3_deny",
            "actor": "I-2 (Approver)",
            "endpoint": "POST /authorize",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })
        print(f"  3. Deny: {status} ({ms}ms) → {data.get('status', data.get('message', 'UNKNOWN'))}")

        # Step 4: Attempt execution (should fail — intent is denied)
        status, data, ms = self._req("POST", "/execute-action", self.i1_token, {
            "intent_id": actual_intent_id,
            "delivery_mode": "external",
        })
        trace["steps"].append({
            "step": "4_execute_attempt",
            "actor": "I-1 (Proposer) — should be blocked",
            "endpoint": "POST /execute-action",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })
        blocked = status != 200 or data.get("error") or not data.get("receipt", {}).get("receipt_id")
        print(f"  4. Execute attempt: {status} ({ms}ms) → {'BLOCKED (correct)' if blocked else 'EXECUTED (BUG!)'}")

        trace["result"] = "DENIED_CORRECTLY" if blocked else "BUG_EXECUTED_AFTER_DENIAL"
        trace["completed_at"] = datetime.now(timezone.utc).isoformat()
        self.traces.append(trace)
        return trace

    def run_demo_3(self):
        """Demo 3: Self-approval attempt — I-1 proposes AND tries to approve (cooldown enforced)."""
        print("\n" + "=" * 70)
        print("DEMO 3: Self-Approval Attempt (Cooldown Enforcement)")
        print("  Proposer: I-1 | Approver: I-1 (same) | Expected: BLOCKED by cooldown")
        print("=" * 70)

        trace = {
            "demo_id": "DEMO-003",
            "title": "Self-Approval Blocked — Cooldown Enforcement",
            "description": "I-1 proposes and immediately tries to approve own intent. Gateway enforces 120s cooldown.",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "steps": [],
        }

        # Step 1: Submit intent (Intake Schema v1)
        intent_payload = {
            "identity": {
                "subject": "brian.k.rasmussen",
                "auth_method": "jwt_session",
                "role": "owner",
            },
            "intent": {
                "action": "send_email",
                "target": "gmail",
                "parameters": {
                    "to": "self-approval-test@rio-system.dev",
                    "subject": "RIO Demo 3 — Self-Approval Test",
                    "body": "This tests that the same principal cannot immediately approve their own intent.",
                },
            },
            "context": {
                "reason": "Demo artifact: prove self-approval cooldown enforcement",
                "risk_scope": "external",
                "urgency": "normal",
            },
            "delivery_mode": "external",
        }
        status, data, ms = self._req("POST", "/intent", self.i1_token, intent_payload)
        actual_intent_id = data.get("intent_id", data.get("id", "UNKNOWN"))
        trace["steps"].append({
            "step": "1_submit_intent",
            "actor": "I-1 (Proposer)",
            "endpoint": "POST /intent",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })
        print(f"  1. Submit intent: {status} ({ms}ms) → intent_id={actual_intent_id}")

        # Step 2: Govern
        status, data, ms = self._req("POST", "/govern", self.i1_token, {
            "intent_id": actual_intent_id,
        })
        trace["steps"].append({
            "step": "2_govern",
            "actor": "Gateway (Policy Engine)",
            "endpoint": "POST /govern",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })
        print(f"  2. Govern: {status} ({ms}ms)")

        # Step 3: Self-approve attempt (I-1 tries to approve own intent)
        status, data, ms = self._req("POST", "/authorize", self.i1_token, {
            "intent_id": actual_intent_id,
            "decision": "approved",
            "authorized_by": "I-1",
        })
        trace["steps"].append({
            "step": "3_self_approve_attempt",
            "actor": "I-1 (Proposer attempting self-approval)",
            "endpoint": "POST /authorize",
            "status": status,
            "elapsed_ms": ms,
            "response": data,
        })
        blocked = data.get("error") or data.get("cooldown_remaining_ms") or status != 200
        cooldown = data.get("cooldown_remaining_ms", "N/A")
        print(f"  3. Self-approve: {status} ({ms}ms) → {'BLOCKED (correct)' if blocked else 'ALLOWED (check policy)'}")
        if cooldown != "N/A":
            print(f"     Cooldown remaining: {cooldown}ms")
            print(f"     Authority model: {data.get('authority_model', 'N/A')}")

        trace["result"] = "SELF_APPROVAL_BLOCKED" if blocked else "SELF_APPROVAL_ALLOWED"
        trace["cooldown_data"] = data
        trace["completed_at"] = datetime.now(timezone.utc).isoformat()
        self.traces.append(trace)
        return trace

    def get_ledger_snapshot(self):
        """Get the latest ledger entries for proof."""
        print("\n=== Ledger Snapshot ===")
        status, data, ms = self._req("GET", "/ledger?limit=10", self.i1_token)
        print(f"  Ledger query: {status} ({ms}ms)")
        if status == 200:
            entries = data.get("entries", data if isinstance(data, list) else [])
            print(f"  Total entries visible: {len(entries)}")
            for e in entries[-5:]:
                eid = e.get("entry_id", e.get("id", "?"))
                etype = e.get("entry_type", e.get("type", "?"))
                h = e.get("hash", "?")[:24]
                print(f"    {eid}: {etype} hash={h}...")
            return entries
        return []

    def run_all(self):
        """Run all 3 demos and save traces."""
        print("=" * 70)
        print("RIO DEMO ARTIFACT RUNNER")
        print(f"Gateway: {GATEWAY_URL}")
        print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
        print("=" * 70)

        self.authenticate()

        t1 = self.run_demo_1()
        t2 = self.run_demo_2()
        t3 = self.run_demo_3()

        ledger = self.get_ledger_snapshot()

        # Save full trace
        artifact = {
            "artifact_type": "RIO_DEMO_PROOF",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "gateway_url": GATEWAY_URL,
            "gateway_version": "2.9.0",
            "demos": self.traces,
            "ledger_snapshot": ledger[-10:] if ledger else [],
            "summary": {
                "demo_1": t1.get("result", "UNKNOWN"),
                "demo_2": t2.get("result", "UNKNOWN"),
                "demo_3": t3.get("result", "UNKNOWN"),
            },
        }

        out_path = "/home/ubuntu/demo_artifact_raw.json"
        with open(out_path, "w") as f:
            json.dump(artifact, f, indent=2, default=str)
        print(f"\n=== Artifact saved to {out_path} ===")
        print(f"Summary: Demo1={t1.get('result')} | Demo2={t2.get('result')} | Demo3={t3.get('result')}")
        return artifact


if __name__ == "__main__":
    runner = DemoRunner()
    runner.run_all()
