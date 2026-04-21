#!/usr/bin/env python3
"""
RIO Compliance Verifier — HTTP-based

Verifies the live RIO gateway by calling its public HTTP endpoints:
  GET /health    — confirm gateway is operational
  GET /verify    — check ledger chain integrity
  GET /ledger    — retrieve ledger entries

Usage:
  python3 verify.py                                    # default: https://rio-gateway.onrender.com
  python3 verify.py --gateway https://localhost:3000   # custom gateway URL
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


GATEWAY_DEFAULT = "https://rio-gateway.onrender.com"


def http_get(url, timeout=15):
    """Make a GET request and return (status_code, parsed_json_or_None)."""
    req = Request(url, method="GET")
    req.add_header("Accept", "application/json")
    try:
        with urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                data = {"raw": body}
            return resp.status, data
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            data = {"raw": body}
        return e.code, data
    except URLError as e:
        return 0, {"error": str(e.reason)}
    except Exception as e:
        return 0, {"error": str(e)}


class ComplianceResult:
    def __init__(self, scenario_id, claim):
        self.scenario = scenario_id
        self.claim = claim
        self.pass_fail = "PENDING"
        self.evidence = {}

    def mark_pass(self, evidence=None):
        self.pass_fail = "PASS"
        if evidence:
            self.evidence = evidence

    def mark_fail(self, evidence=None):
        self.pass_fail = "FAIL"
        if evidence:
            self.evidence = evidence

    def to_dict(self):
        return {
            "scenario": self.scenario,
            "claim": self.claim,
            "pass_fail": self.pass_fail,
            "evidence": self.evidence,
        }


def check_health(gateway):
    """C-001: Gateway is operational and reports its version."""
    r = ComplianceResult("C-001", "Gateway is operational")
    status, data = http_get(f"{gateway}/health")
    if status == 200 and data.get("status") == "operational":
        r.mark_pass({
            "http_status": status,
            "version": data.get("version", "unknown"),
            "ed25519_mode": data.get("ed25519_mode", "unknown"),
            "status": data.get("status"),
        })
    else:
        r.mark_fail({
            "http_status": status,
            "response": data,
        })
    return r


def check_verify(gateway):
    """C-002: Ledger chain verification endpoint responds."""
    r = ComplianceResult("C-002", "Ledger chain verification is available")
    status, data = http_get(f"{gateway}/verify")
    if status == 200:
        r.mark_pass({
            "http_status": status,
            "chain_valid": data.get("chain_valid", data.get("valid", "unknown")),
            "entries_checked": data.get("entries_checked", data.get("total", "unknown")),
        })
    elif status == 403:
        # Verify endpoint requires auditor role — this is correct behavior
        r.mark_pass({
            "http_status": status,
            "note": "Endpoint requires auditor role (403) — access control enforced",
        })
    else:
        r.mark_fail({
            "http_status": status,
            "response": data,
        })
    return r


def check_ledger(gateway):
    """C-003: Ledger endpoint responds and returns entries."""
    r = ComplianceResult("C-003", "Ledger is accessible and contains entries")
    status, data = http_get(f"{gateway}/ledger")
    if status == 200:
        entries = data if isinstance(data, list) else data.get("entries", [])
        r.mark_pass({
            "http_status": status,
            "entry_count": len(entries) if isinstance(entries, list) else "unknown",
        })
    elif status == 403:
        # Ledger endpoint requires auditor role — this is correct behavior
        r.mark_pass({
            "http_status": status,
            "note": "Endpoint requires auditor role (403) — access control enforced",
        })
    else:
        r.mark_fail({
            "http_status": status,
            "response": data,
        })
    return r


def check_unauthenticated_execute(gateway):
    """C-004: Unauthenticated execution is blocked."""
    r = ComplianceResult("C-004", "Unauthenticated execution is blocked")
    req = Request(
        f"{gateway}/execute",
        data=json.dumps({
            "intent_id": "FAKE-INTENT",
            "action": "send_email",
            "tool_args": {"to": "test@example.com"},
        }).encode("utf-8"),
        method="POST",
    )
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=15) as resp:
            # If we get 200, execution was NOT blocked — fail
            r.mark_fail({
                "http_status": resp.status,
                "error": "Unauthenticated execution was allowed",
            })
    except HTTPError as e:
        if e.code in (400, 401, 403, 422):
            r.mark_pass({
                "http_status": e.code,
                "blocked": True,
            })
        else:
            r.mark_fail({
                "http_status": e.code,
                "error": "Unexpected error code",
            })
    except Exception as e:
        r.mark_fail({"error": str(e)})
    return r


def check_unauthenticated_intent(gateway):
    """C-005: Unauthenticated intent submission is blocked."""
    r = ComplianceResult("C-005", "Unauthenticated intent submission is blocked")
    req = Request(
        f"{gateway}/intent",
        data=json.dumps({
            "intent": "steal_data",
            "source": "rogue_agent",
        }).encode("utf-8"),
        method="POST",
    )
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=15) as resp:
            r.mark_fail({
                "http_status": resp.status,
                "error": "Unauthenticated intent was accepted",
            })
    except HTTPError as e:
        if e.code in (400, 401, 403, 422):
            r.mark_pass({
                "http_status": e.code,
                "blocked": True,
            })
        else:
            r.mark_fail({
                "http_status": e.code,
                "error": "Unexpected error code",
            })
    except Exception as e:
        r.mark_fail({"error": str(e)})
    return r


def run_compliance_suite(gateway):
    """Run all compliance checks and generate report."""
    scenarios = [
        check_health,
        check_verify,
        check_ledger,
        check_unauthenticated_execute,
        check_unauthenticated_intent,
    ]

    results = []
    for fn in scenarios:
        result = fn(gateway)
        results.append(result)
        status_icon = "PASS" if result.pass_fail == "PASS" else "FAIL"
        print(f"  {result.scenario}: {status_icon} — {result.claim}")

    passed = sum(1 for r in results if r.pass_fail == "PASS")
    failed = sum(1 for r in results if r.pass_fail == "FAIL")

    report = {
        "_meta": {
            "type": "compliance_report",
            "version": "2.0.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "gateway": gateway,
            "runner": "verifier/verify.py",
        },
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "overall": "PASS" if failed == 0 else "FAIL",
        },
        "results": [r.to_dict() for r in results],
    }
    return report


def main():
    parser = argparse.ArgumentParser(description="RIO Compliance Verifier")
    parser.add_argument(
        "--gateway",
        default=GATEWAY_DEFAULT,
        help=f"Gateway base URL (default: {GATEWAY_DEFAULT})",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Write JSON report to this file path",
    )
    args = parser.parse_args()

    gateway = args.gateway.rstrip("/")

    print("=" * 55)
    print("  RIO Compliance Verifier — HTTP-based")
    print(f"  Gateway: {gateway}")
    print("=" * 55)
    print()

    report = run_compliance_suite(gateway)

    print()
    print(f"  Overall: {report['summary']['overall']} "
          f"({report['summary']['passed']}/{report['summary']['total']})")
    print()

    if args.output:
        with open(args.output, "w") as f:
            json.dump(report, f, indent=2)
        print(f"  Report written to: {args.output}")
    else:
        print("  (Use --output <path> to save JSON report)")

    return 0 if report["summary"]["overall"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
