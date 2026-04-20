# Remaining Todo Items — Triage (2026-04-10)

## Blocked on Brian (human testing required)
- Verify phone UX on real device
- Full restore E2E on phone
- Test full mobile approval flow
- Verify full two-user flow end-to-end
- Verify full pipeline end-to-end in browser
- Verify full governed pipeline delivers SMS
- Test full loop from ONE UI with echo tool
- Publish rio-one.manus.space (Brian clicks Publish)
- Run Demo Actions 1-3 and capture artifacts
- Package demo artifacts
- Push demo artifact to rio-system repo

## Blocked on Gateway-side changes (Render deployment)
- Update Gateway principals seed email
- Fix passphrase login email resolution
- Verify full flow after Gateway PR merge
- CLEANUP: Remove X-Principal-ID fallback after PR #91
- Deploy Gateway with SMS connector
- Set Twilio env vars on Render

## Deferred by design
- True Gmail OAuth connector (requires Google Cloud project)
- PWA push notification support (requires VAPID keys)
- Document self-host installation steps
- Document open vs licensed boundary
- Replace notifyOwner with real Gmail API

## Gateway connector work (can do if Gateway repo is accessible)
- Inspect Gateway connector pattern (gmail-executor.mjs)
- Create sms-executor.mjs following same pattern
- Wire send_sms action to Twilio connector
- Test SMS delivery end-to-end

## Verdict
All 31 remaining items are blocked on external dependencies (Brian testing, Gateway deployment, business decisions). No ONE app-side code changes are needed.
