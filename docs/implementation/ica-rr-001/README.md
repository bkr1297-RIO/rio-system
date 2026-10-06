# ICA-RR-001

One executable inhabited loop: **Observatory → Research → Return**.

**Architectural Conformance + Lived Simplicity = Reference Realization**

Requires Node 24 and the existing gateway dependencies. From `gateway/`:

```sh
npm ci
npm run field:ica -- --serve /tmp/ica-session
```

Use a fresh directory. Open the private loopback entry link printed by the launcher; it establishes the local controller session and removes the entry key from the displayed URL. Keep that link private. The host uses native HTML forms and requires no client script. Ctrl+C closes it. This is a developer-created reference root, not production human identity verification.

Enter the Observatory. Read latest conditions, ask what and why, authorize the one bounded Research, start it, and read its Return. Keep the finding for your own orientation or withdraw future use. Reading or retaining a finding supplies no authority for subsequent work.

The Calendar/Git source replay is explicitly synthetic. Two frames are extracted at the edge and genuinely recomputed; their raw timing fixtures remain there. The radar still uses only six normalized FieldSignals. The Metascope and Return renderings are reused from the completed F0.1 specimens.

Research prepares one deterministic, attributable note from the delegated reading and its existing projection. The native passage fixes its bytes before admission; Start requests its single local write. A separate readback, qualified evidence admission and byte-objective assessment establish only the note at the observed time. Neither successful writing nor readback verifies a forecast. There is no network research or automatic follow-up in this bounded program.

```sh
npm run test:ica
npm run field:ica -- --serve /tmp/ica-unknown --fixture unknown
npm run field:ica -- --serve /tmp/ica-held --fixture hold
npm run field:ica -- --serve /tmp/ica-denied --fixture deny
npm run field:ica -- --serve /tmp/ica-partial --fixture partial
npm run field:ica:evidence -- /tmp/ica-evidence
```

`unknown` withholds the independent observation request, a declared transport fixture rather than a demonstrated physical partition. `hold` uses native REQUIRE_QUORUM without a quorum; `deny` uses native AUTO_DENY. `partial` withholds two required reporting coordinates. Revocation is available in the normal session before an attempt or after Return. It disables future authorized exercise under that grant after validated revocation; it cannot undo an earlier observed note or stop unrelated grants.

Reloading the live session preserves its journey and register. The register is persisted inside the reference field after each command. Cross-process resumption, key migration and travelling continuity remain the separate SSP task. The launcher intentionally refuses an existing field instead of pretending it can restore issued capabilities from JSON.

See [SPEC.md](SPEC.md), [PAIRED-JOURNEYS.md](PAIRED-JOURNEYS.md), [CLAIM-AUDIT.md](CLAIM-AUDIT.md), [BUILD-REPORT.md](BUILD-REPORT.md), and the saved [normal surface](../../evidence/ica-rr-001/normal/surface.html). Saved surfaces are read-only evidence captures, with controller secrets and forms removed.
