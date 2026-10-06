# Fuller-packet review Return

One fresh read-only reviewer assessed `9dcd8e9035a94963d2c72e2fe6be9ad270ded39b..cf9c1de61fd6a9925c70c61d40d1c47ce1c3b49f`. The reviewer independently ran the 27 then-new tests, all passing, and identified three Important defects, one Minor defect, no Critical defects. No second review is claimed.

| Finding | Original reproduction | Author resolution |
|---|---|---|
| Repeated observation establishes false recurrence | `investigate([reading,reading], delegatedManifest)` treated the first duplicate as earlier evidence | Deduplicate validated reading IDs and require a strictly earlier timestamp. Duplicate and same-time regressions RED→GREEN |
| Valid partial history crashes | Two Calendar-only readings dereference absent Git metrics | Find separately usable temporal pairs for each requested finding. Calendar-only and Git-only regressions RED→GREEN; unsupported finding UNKNOWN |
| Normal dependency loss has no truthful blocked journey | Native CCM dependency change after admission throws, leaves AUTHORIZED and Start visible | Reconcile observed native current preflight into a scoped HOLD account, clearance explanation and Return. Historical ADMIT is unchanged; no disposition is fabricated. Native-boundary and rendered-account regression RED→GREEN |
| Replacement banner demands delegation after it exists | Replacement followed by new delegation still says “needs a fresh delegation” | Author graded Important because the banner falsely reports current authorization, and fixed it in the same pass. Before/after banner regression RED→GREEN |

The author also verified the consequences of those findings through the human surface. A denied consequence must not be labeled denied source access; partial coverage must not claim two established findings; a newly available metric must retain an unknown prior value. These three additional regressions also went RED→GREEN in the same pass. Nine focused regressions pass. Full post-pass results are recorded in the implementation report and evidence logs. No deferred minors remain after the banner was regraded and repaired.

## Areas the reviewer declined to judge; author rulings

1. Final captures/report/publication/parity/CI were still unfinished during review. Author must verify them before returning; divergence is the cost if not checked.
2. Actual browser and human usability: form correspondence is mechanical evidence only. Lived acceptance remains open; cost is possible usability repair.
3. Production identity/live sources/remote revocation: outside the explicitly local synthetic specimen. No production readiness or remote stop claim; cost is unproved production behavior.
4. Cross-process authority restoration: outside same-process reentry. Serialized accounts do not become capabilities; SSP remains separate.
5. Forecast accuracy/physical-world effects: findings stay qualified to the replay and note-byte readback. Real predictive usefulness is unknown.
6. Deliberate replacement of trusted methods or theft of signing authority: outside contract-copy/foreign-context tests. Host compromise remains unproved.
7. Unchanged constitutional owners and unrelated inherited recovery: only affected boundaries assessed. No general re-audit or constitutional closure is claimed.
