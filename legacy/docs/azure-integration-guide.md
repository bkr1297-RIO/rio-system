# Azure Integration Guide — M.A.N.T.I.S. Enterprise Pilot

**Purpose:** Connect your Microsoft environment (Outlook, Azure) to the RIO governance system as the first Enterprise-Lite customer.

**Author:** Manny (Builder)
**Authorized by:** Brian (Sovereign)
**Task Packet:** MUSS-001-AZURE

---

## Architecture Overview

```
GitHub (rio-system)
    │
    ├── GitHub Action fires on governance commits
    │       │
    │       ▼
    │   Azure Webhook (Logic App / Power Automate)
    │       │
    │       ▼
    │   Notification → Teams / Outlook / Storage Blob
    │
Outlook (your mailbox)
    │
    ├── Microsoft Graph API (READ ONLY)
    │       │
    │       ▼
    │   M.A.N.T.I.S. observation layer
    │       (can flag, cannot send/delete/modify)
    │
    ▼
All actions require Brian's approval (fail-closed)
```

**Governance constraint:** The Azure integration is read-only by default. The system can observe your Outlook and notify you. It cannot send, delete, modify, or forward emails without explicit approval through the RIO governance gate.

---

## Step 1: Register the M.A.N.T.I.S. App in Azure Portal

This creates the identity that the system uses to read your Outlook. You control exactly what permissions it has.

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
3. Fill in:
   - **Name:** `MANTIS-RIO-Client`
   - **Supported account types:** "Accounts in this organizational directory only" (single tenant)
   - **Redirect URI:** Select "Web" → enter `https://localhost/auth/callback`
4. Click **Register**
5. On the app overview page, copy these values into `config/azure_settings.json`:
   - **Application (client) ID** → `app_registration.client_id`
   - **Directory (tenant) ID** → `tenant.tenant_id`

---

## Step 2: Configure API Permissions (Read-Only)

This grants the app permission to read your email. Nothing else.

1. In your app registration, go to **API permissions** → **Add a permission**
2. Select **Microsoft Graph** → **Delegated permissions**
3. Add these permissions:
   - `Mail.Read` — Read user mail
   - `Mail.ReadBasic` — Read basic mail properties
   - `User.Read` — Read user profile
4. Click **Add permissions**
5. Click **Grant admin consent for [your tenant]** (you must be a tenant admin)

**What this allows:** Read email subjects, bodies, senders, timestamps.
**What this blocks:** No send, no delete, no modify, no forward. Read only.

---

## Step 3: Create a Client Secret

This is the credential the system uses to authenticate. Store it securely.

1. In your app registration, go to **Certificates & secrets** → **New client secret**
2. Description: `MANTIS-RIO-Secret`
3. Expiration: Choose 12 months (you will rotate this)
4. Click **Add**
5. **Copy the secret value immediately** — it will not be shown again
6. Store it in **Azure Key Vault** (recommended) or a secure password manager

**Do NOT commit the secret to GitHub.** The `azure_settings.json` template uses `STORED_IN_AZURE_KEY_VAULT` as a placeholder. The actual secret should only exist in Key Vault or as a GitHub Actions secret.

---

## Step 4: Create the Azure Logic App (Webhook Receiver)

This receives notifications from the GitHub Action when governance artifacts change.

1. Go to [Azure Portal](https://portal.azure.com) → **Create a resource** → **Logic App**
2. Fill in:
   - **Name:** `rio-governance-notify`
   - **Region:** Your preferred region
   - **Plan type:** Consumption (pay-per-trigger, cheapest)
3. Click **Review + create** → **Create**
4. Open the Logic App → **Logic App Designer**
5. Choose trigger: **When a HTTP request is received**
6. Paste this JSON schema for the request body:

```json
{
  "type": "object",
  "properties": {
    "packet_type": { "type": "string" },
    "source": { "type": "string" },
    "repo": { "type": "string" },
    "commit": {
      "type": "object",
      "properties": {
        "hash": { "type": "string" },
        "message": { "type": "string" },
        "author": { "type": "string" },
        "date": { "type": "string" }
      }
    },
    "changed_files": { "type": "string" },
    "event": { "type": "string" },
    "severity": { "type": "string" },
    "message": { "type": "string" }
  }
}
```

7. Click **Save** — Azure generates the **HTTP POST URL**
8. Copy this URL → paste into `config/azure_settings.json` as `webhook.azure_logic_app_url`

---

## Step 5: Add an Action to the Logic App

Choose what happens when a governance notification arrives:

**Option A — Send an Outlook email to yourself:**
1. Add action → **Office 365 Outlook** → **Send an email (V2)**
2. To: your email address
3. Subject: `[RIO] Governance Update: @{triggerBody()?['commit']?['message']}`
4. Body: `Commit @{triggerBody()?['commit']?['hash']} by @{triggerBody()?['commit']?['author']} at @{triggerBody()?['commit']?['date']}. Changed: @{triggerBody()?['changed_files']}`

**Option B — Post to a Teams channel:**
1. Add action → **Microsoft Teams** → **Post a message (V3)**
2. Select your team and channel
3. Message: same as above

**Option C — Store in Azure Blob (permanent record):**
1. Add action → **Azure Blob Storage** → **Create blob**
2. Container: `rio-packets`
3. Blob name: `@{triggerBody()?['commit']?['hash']}.json`
4. Content: `@{triggerBody()}`

You can chain all three — email + Teams + Blob — for full redundancy.

---

## Step 6: Connect the GitHub Action

1. Go to your GitHub repo: `bkr1297-RIO/rio-system`
2. Navigate to **Settings** → **Secrets and variables** → **Variables**
3. Click **New repository variable**
4. Name: `AZURE_WEBHOOK_URL`
5. Value: The HTTP POST URL from your Logic App (Step 4.8)
6. Click **Add variable**

The GitHub Action (`.github/workflows/notify-azure.yml`) will now fire on every governance-related commit and send the notification to your Azure Logic App.

---

## Step 7: Verify the Connection

1. Make a small commit to `rio-system` that touches a governance file (e.g., edit `packets/README.md`)
2. Go to GitHub → **Actions** tab → verify the "Notify Azure on RESULT Packet" workflow ran
3. Check your Logic App → **Run history** → verify it received the payload
4. Check your Outlook / Teams / Blob → verify the notification arrived

If all three checkpoints pass, the Azure integration is live.

---

## Security Checklist

| Item | Status |
|------|--------|
| App permissions are READ ONLY (Mail.Read, Mail.ReadBasic, User.Read) | Required |
| Client secret stored in Azure Key Vault, NOT in code | Required |
| Logic App webhook URL stored as GitHub variable, NOT in code | Required |
| `azure_settings.json` contains NO secrets (only references) | Required |
| `governance.read_only` is `true` in config | Required |
| `governance.fail_closed` is `true` in config | Required |

---

## What This Enables

Once connected, you experience the system as a customer:

1. **Governance commits** in GitHub → notification in your Outlook/Teams
2. **Integrity sweep** runs daily → RESULT packet → Azure webhook → you see it in your Microsoft environment
3. **Email observation** (future phase) → Graph API reads your inbox → flags haste patterns → notifies you for approval

The system observes. You decide. Nothing executes without your approval.

---

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `config/azure_settings.json` | rio-system | Your Azure config (fill in your values) |
| `.github/workflows/notify-azure.yml` | rio-system | GitHub Action that fires webhook |
| `docs/azure-integration-guide.md` | rio-system | This guide |
