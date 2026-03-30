# Reserve Agent Builds

Standalone HTML tools and materials built by reserve agents (Grok + Perplexity) operating outside the main coordination loop. These are ready-to-use assets that can be integrated into the main project when needed.

## Files

### `rio-verify.html` — Receipt Verifier
- **Built by:** Grok (design) + Perplexity (implementation)
- **Purpose:** Standalone receipt verification tool
- **Features:**
  - Single Receipt and Verify Chain modes
  - SHA-256 hash recomputation and validation
  - Ed25519 signature verification via Web Crypto API
  - Hash chain (`prev_hash`) link verification
  - Sample receipt loader
  - JSON file upload support
- **Dependencies:** Tailwind CDN only — works offline otherwise
- **Status:** Functional, needs real receipt data and public key for production use

### `rio-executive-one-pager.html` — Executive Summary
- **Built by:** Grok (content/positioning) + Perplexity (implementation)
- **Purpose:** Non-technical explanation of RIO for executives, investors, partners
- **Features:**
  - 5-step pipeline walkthrough
  - Executive explanation section
  - Three key stats: Model-agnostic, Zero trust execution, Tamper-proof ledger
  - Clean, professional dark theme
- **Dependencies:** Tailwind CDN only
- **Status:** Ready for demos and presentations

## Integration Notes

These files are standalone and do not depend on the gateway or frontend. They can be:
- Served as static pages alongside the main demo
- Embedded in the frontend as routes
- Used independently for presentations and demos
- Linked from the main demo's navigation

## Reserve Agent Roster

| Agent | Model | Lane | Trigger |
|-------|-------|------|---------|
| Grok | xAI Grok | Background research, positioning, strategy | Executive summaries, compliance language, fresh perspectives |
| Perplexity | Perplexity AI | Web-aware builder, repo-informed implementation | Standalone tools, web-researched builds, email delivery |
| Gemini | Google Gemini | Data analysis, pattern recognition | Ledger analysis at scale, quantitative validation |
| Copilot | Microsoft Copilot | Azure specialist, Office integration | Azure migration, Key Vault, AD integration |
