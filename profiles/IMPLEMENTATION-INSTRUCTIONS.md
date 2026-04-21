# Implementation Instructions

## Purpose
This folder contains Brian's portable sovereign interaction profile. The profile is meant to be loaded by AI systems, builders, and future RIO components before high-context work.

## Files
- `brian-profile-v0.1.json` — current profile instance
- `../schemas/sovereign-interaction-profile.schema.json` — validation schema

## Rules
- GitHub is the canonical source of truth.
- Mirror to Drive only for convenience, not as the primary editing location.
- Future RIO runtime may mirror the active version into the governed personal corpus.
- Changes should be versioned and reviewed by Brian before activation.

## Future enhancements
- Add profile variants by context.
- Add CI schema validation.
- Add a loader utility for prompts or agent sessions.
