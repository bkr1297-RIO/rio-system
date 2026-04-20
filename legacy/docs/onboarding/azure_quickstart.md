# RIO Azure Integration — Quick Start (v1)

**For:** Organization administrators deploying RIO governance in a Microsoft environment.
**Time:** 30 minutes.
**Requires:** Azure Portal access with admin privileges.

---

## What This Does

This integration ensures that no AI or automated action executes inside your environment without:

- **Policy evaluation** — every action is classified by risk before it runs
- **Human approval** — high-risk actions require explicit authorization
- **A verifiable audit record** — every action produces a signed receipt

All actions are governed before execution. The system defaults to **deny** (fail-closed). If governance cannot verify an action, it does not execute.

---

## What Gets Installed

| Component | Purpose | Where It Lives |
|-----------|---------|---------------|
| Azure App Registration | Identity layer — how the system authenticates | Azure Active Directory |
| Webhook endpoint | Decision layer — receives governance notifications | Azure Logic App |
| Key Vault reference | Secrets and tokens — never stored in config files | Azure Key Vault |
| GitHub Action | Notification trigger — fires on governance events | GitHub repository |

No agents, services, or code run inside your Azure environment without your explicit setup and approval.

---

## Setup Steps (7 steps)

### Step 1 — Register the App

1. Go to [Azure Portal](https://portal.azure.com) → **Azure Active Directory** → **App registrations** → **New registration**
2. Name: `MANTIS-RIO-Client`
3. Account type: "Accounts in this organizational directory only"
4. Redirect URI: Web → `https://localhost/auth/callback`
5. Click **Register**
6. Copy the **Application (client) ID** and **Directory (tenant) ID**

### Step 2 — Set Permissions (Read Only)

1. In the app registration → **API permissions** → **Add a permission**
2. Select **Microsoft Graph** → **Delegated permissions**
3. Add: `Mail.Read`, `Mail.ReadBasic`, `User.Read`
4. Click **Grant admin consent**

These permissions allow the system to **read** email metadata. It cannot send, delete, modify, or forward.

### Step 3 — Create and Store the Secret

1. In the app registration → **Certificates & secrets** → **New client secret**
2. Description: `MANTIS-RIO-Secret` → Expiration: 12 months
3. **Copy the secret value immediately** (it will not be shown again)
4. Store it in **Azure Key Vault** — never in a config file or code

### Step 4 — Create the Logic App (Webhook Receiver)

1. Azure Portal → **Create a resource** → **Logic App**
2. Name: `rio-governance-notify` → Plan: Consumption
3. Open the Logic App → **Designer** → Trigger: **When a HTTP request is received**
4. Click **Save** — Azure generates the **HTTP POST URL**
5. Copy this URL

### Step 5 — Add a Notification Action

In the Logic App Designer, add one or more actions after the trigger:

- **Option A:** Office 365 Outlook → Send an email to yourself
- **Option B:** Microsoft Teams → Post to a channel
- **Option C:** Azure Blob Storage → Store the notification as a JSON file

You can chain all three for full redundancy.

### Step 6 — Connect to GitHub

1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Variables**
2. Create variable: `AZURE_WEBHOOK_URL` → paste the Logic App HTTP POST URL
3. Upload the workflow file (`.github/workflows/notify-azure.yml`) via the GitHub web UI

### Step 7 — Verify

1. Make a commit to the repository that touches a governance file
2. Check GitHub → **Actions** tab → verify the workflow ran
3. Check your Logic App → **Run history** → verify it received the payload
4. Check your Outlook / Teams / Blob → verify the notification arrived

If all three checkpoints pass, the integration is live.

---

## First Test (Your "Aha" Moment)

Once connected, run this scenario to see the system in action:

| Step | What Happens |
|------|-------------|
| 1. Trigger | An AI or automation attempts to send an external email |
| 2. Classification | The system flags it as **HIGH risk** (external communication + sensitive content) |
| 3. Block | Automatic execution is blocked — the system will not send without approval |
| 4. Approval | You receive a notification asking: "Approve this action?" |
| 5. Authorize | You click **Approve** (or deny) |
| 6. Execute | If approved, the action executes. If denied, it is permanently blocked. |
| 7. Receipt | A signed receipt is generated with: who approved, what was executed, when, and a verification hash |

The key moment: **the AI did not act. The system allowed action — only after human approval.**

---

## Security Model

| Principle | Implementation |
|-----------|---------------|
| No secrets in config files | All credentials in Azure Key Vault |
| Read-only by default | Graph API permissions: Mail.Read only |
| Fail-closed | If governance cannot verify, the action does not execute |
| Identity-bound approvals | Approvals tied to Azure AD user identity (Phase 2) |
| Audit trail | Every action produces a receipt with verification hash |
| No autonomous execution | System can observe and notify — cannot act without approval |

---

## Definition of Success

The system is working when:

1. **AI cannot execute actions without approval** — high-risk actions are blocked until a human authorizes them
2. **All actions produce receipts** — every execution has a signed, verifiable proof record
3. **Every action is traceable and auditable** — the ledger provides a complete, immutable history
4. **You receive notifications in your Microsoft environment** — governance events appear in Outlook, Teams, or your preferred channel

---

## What's Next

Once the basic integration is verified:

- **Phase 2:** Bind approvals to Azure AD identity (enterprise multi-user)
- **Phase 3:** Policy expansion for financial, legal, and healthcare scenarios
- **Phase 4:** Customer-facing approval UI in the ONE dashboard

---

## Support

- Integration guide (detailed): `docs/azure-integration-guide.md`
- System status: `STATUS.json` (repository root)
- Task board: GitHub Issues on this repository
- Coordination guide: `docs/coordination-surface.md`
