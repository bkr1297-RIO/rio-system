"""
MANTIS Surface Formatter v0.1
Converts a Contrast Packet into human-readable output.
Advisory only — never executes, blocks, or decides.
"""

import json
import sys


def format_surface(packet: dict) -> str:
    """
    Convert a contrast packet to human-readable output.

    Args:
        packet: Contrast Packet from mantis_contrast()

    Returns:
        Formatted string for display to user.
    """
    lines = []

    # Header
    severity = packet.get("severity", "low").upper()
    lines.append(f"MANTIS — Contrast [{severity}]")
    lines.append("")

    observations = packet.get("observations", [])
    summary = packet.get("summary", {})

    # Aligned
    aligned = [o for o in observations if o["status"] == "ALIGNED"]
    if aligned:
        lines.append("Aligned:")
        for o in aligned:
            lines.append(f"  - {o['note']}")
        lines.append("")

    # Deviates
    deviates = [o for o in observations if o["status"] == "DEVIATES"]
    if deviates:
        lines.append("Deviates:")
        for o in deviates:
            lines.append(f"  - {o['note']}")
        lines.append("")

    # Risk flags
    risk_flags = summary.get("risk_flags", [])
    if risk_flags:
        lines.append("Risk:")
        for flag in risk_flags:
            lines.append(f"  - {flag}")
        lines.append("")

    # Score line
    a_count = summary.get("aligned", 0)
    d_count = summary.get("deviates", 0)
    total = a_count + d_count
    lines.append(f"Score: {a_count}/{total} aligned")
    lines.append("")

    # Options
    lines.append("Options:")
    if d_count > 0 or risk_flags:
        lines.append("  A) Address deviations before proceeding")
        lines.append("  B) Send for review")
        lines.append("  C) Proceed anyway")
    else:
        lines.append("  A) Proceed as drafted")
        lines.append("  B) Send for review")
        lines.append("  C) Revise further")
    lines.append("")

    # Footer
    lines.append("(Non-binding. You decide.)")

    return "\n".join(lines)


def format_surface_compact(packet: dict) -> str:
    """
    Compact single-line summary for inline display.

    Args:
        packet: Contrast Packet from mantis_contrast()

    Returns:
        Single-line summary string.
    """
    summary = packet.get("summary", {})
    a = summary.get("aligned", 0)
    d = summary.get("deviates", 0)
    severity = packet.get("severity", "low").upper()
    risk_count = len(summary.get("risk_flags", []))

    parts = [f"MANTIS [{severity}]", f"{a} aligned", f"{d} deviates"]
    if risk_count:
        parts.append(f"{risk_count} risk flag{'s' if risk_count > 1 else ''}")

    return " | ".join(parts)


# ── CLI interface ────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python surface_formatter.py <packet.json>")
        print("  Reads a contrast packet JSON and formats it for display.")
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        packet = json.load(f)

    print(format_surface(packet))
