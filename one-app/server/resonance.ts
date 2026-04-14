/**
 * Resonance Feed — Live Drive Activity Stream
 *
 * Reads recently modified files across the RIO folder tree in Google Drive.
 * This is the system's "heartbeat" — it lights up whenever a node drops
 * a new insight, receipt, or governance artifact.
 *
 * Data source: Google Drive API via Forge (server-side only)
 * Target folders: /RIO root + numbered subfolders (01-08) + /RIO-ONE
 *
 * Pattern tags will be inferred from folder path and file name:
 *   - 06_PROOF/* → #Receipt #Proof
 *   - 05_ORCHESTRATION/* → #Coordination #AgentSync
 *   - 07_MEMORY/* → #Memory #Corpus
 *   - 08_META/* → #Meta #MANTIS
 *   - 05_CONTEXT_AND_SYNCHRONICITY/* → #SurgicalHit #Resonance (Gemini's folder)
 *   - sweeps/* → #IntegritySweep
 *   etc.
 */

import { ENV } from "./_core/env";

// ─── Known RIO folder IDs ──────────────────────────────────

const RIO_FOLDERS: Record<string, { id: string; tags: string[] }> = {
  "/RIO": { id: "11MPDiXwoeRxbJiuNhAHElOAHV31HxoY_", tags: ["#RIO"] },
  "/RIO/01_REFINED": { id: "1i4a-UHgC9TPCGRd-JjKGBXzbm1dI", tags: ["#Refined", "#Analysis"] },
  "/RIO/02_PROTOCOLS": { id: "16yvH4EvVT6ucalBKZ5fBKXGS_HEiMVDq", tags: ["#Protocol", "#Governance"] },
  "/RIO/02_RISK": { id: "1QuO7qrxUaEv6lgcRGh71BsJn3EuyN9tT", tags: ["#Risk", "#Assessment"] },
  "/RIO/02_WHITEPAPER": { id: "1zvdPUl44Bs1JjT2eXannhJGYKYht1zIJ", tags: ["#Whitepaper", "#Research"] },
  "/RIO/03_APPROVAL": { id: "1jgSQiuVE9V1AmUg3XBB1IuBOrF-9wLLS", tags: ["#Approval", "#GovernanceAudit"] },
  "/RIO/03_CONTROL_PLANE": { id: "1pJRXelVfttR3OeEqPhMty7zmpieDkv3T", tags: ["#ControlPlane", "#Architecture"] },
  "/RIO/03_REPO_EXPORTS": { id: "1vb-QfA7zwBEh0s1AmRLF45odw6U69HmO", tags: ["#Export", "#Snapshot"] },
  "/RIO/04_INTERFACES": { id: "1Hbs5fB8EdQRQ64NYtD6oVIbx0Jh4lysw", tags: ["#Interface", "#UI"] },
  "/RIO/04_RECEIPTS": { id: "1QGVqzBTjGRBLwgxgLeFkcVvdHL1Y5Fd_", tags: ["#Receipt", "#Proof"] },
  "/RIO/05_LEDGER": { id: "1f8TSH0StaIdHRtBCi0lJGmKBZrt_eo0m", tags: ["#Ledger", "#AuditTrail"] },
  "/RIO/05_ORCHESTRATION": { id: "1yi10CXlvAfGtAAVJqKg9Jwt5csvfCM9X", tags: ["#Coordination", "#AgentSync"] },
  "/RIO/06_PROOF": { id: "1jynnrLYYsevx0cNSnsJYFwrrziFWrYpx", tags: ["#Proof", "#Verification"] },
  "/RIO/06_TESTS": { id: "1Zgg4_PlJmvKgDhnJs_1Wm1ONBE0AVWx_", tags: ["#Test", "#QA"] },
  "/RIO/07_DOCS": { id: "1niZWyzHhIlZfjGWbRhAyojo95Y17Dtly", tags: ["#Docs", "#Specification"] },
  "/RIO/07_MEMORY": { id: "1ogRUxgNGCNZ8oJknWb9MosaN_iJt2wVw", tags: ["#Memory", "#Corpus"] },
  "/RIO/08_META": { id: "1zHpf_vLkp6UXVQJdS1a280hqI1kA-T9e", tags: ["#Meta", "#MANTIS"] },
  "/RIO-ONE": { id: "1UXW8vf8orVofy6m7XOL5qmAVopFwfpJX", tags: ["#ONE", "#CommandCenter"] },
};

// ─── Types ──────────────────────────────────────────────────

export interface ResonanceEvent {
  /** File ID in Google Drive */
  fileId: string;
  /** File name */
  name: string;
  /** MIME type */
  mimeType: string;
  /** Last modified timestamp (ISO 8601) */
  modifiedTime: string;
  /** Parent folder path (human-readable) */
  folderPath: string;
  /** Pattern tags inferred from folder + file name */
  tags: string[];
  /** Web link to the file */
  webViewLink?: string;
}

export interface ResonanceFeed {
  /** List of recent activity events, newest first */
  events: ResonanceEvent[];
  /** Total events found */
  totalEvents: number;
  /** When this feed was fetched */
  fetchedAt: number;
  /** Any errors during fetch */
  errors: string[];
}

// ─── Tag inference ──────────────────────────────────────────

function inferTagsFromName(fileName: string): string[] {
  const tags: string[] = [];
  const lower = fileName.toLowerCase();

  // Content-based tags
  if (lower.includes("sweep") || lower.includes("integrity")) tags.push("#IntegritySweep");
  if (lower.includes("receipt")) tags.push("#Receipt");
  if (lower.includes("witness")) tags.push("#WitnessChain");
  if (lower.includes("seed") || lower.includes("master")) tags.push("#MasterSeed");
  if (lower.includes("policy")) tags.push("#Policy");
  if (lower.includes("directive")) tags.push("#Directive");
  if (lower.includes("whitepaper")) tags.push("#Whitepaper");
  if (lower.includes("manifest")) tags.push("#Manifest");
  if (lower.includes("agent")) tags.push("#AgentConfig");
  if (lower.includes("ledger")) tags.push("#Ledger");
  if (lower.includes("surgical") || lower.includes("hit")) tags.push("#SurgicalHit");
  if (lower.includes("context") || lower.includes("synchronicity")) tags.push("#Resonance");
  if (lower.includes("bondi")) tags.push("#Bondi");
  if (lower.includes("jordan")) tags.push("#Jordan");
  if (lower.includes("gemini")) tags.push("#Gemini");
  if (lower.includes("claude")) tags.push("#Claude");
  if (lower.includes("manny") || lower.includes("manus")) tags.push("#Manny");
  if (lower.includes("romney")) tags.push("#Romney");
  if (lower.includes("handoff")) tags.push("#Handoff");
  if (lower.includes("briefing")) tags.push("#Briefing");
  if (lower.includes("spec")) tags.push("#Specification");
  if (lower.includes("mapping") || lower.includes("eu ai")) tags.push("#Compliance");
  if (lower.includes("courier")) tags.push("#Courier");

  return tags;
}

function resolveFolder(parentIds: string[]): { path: string; tags: string[] } {
  for (const [path, info] of Object.entries(RIO_FOLDERS)) {
    if (parentIds.includes(info.id)) {
      return { path, tags: info.tags };
    }
  }
  return { path: "/RIO (other)", tags: ["#RIO"] };
}

// ─── Google Drive API via Forge ─────────────────────────────

/**
 * Fetch recently modified files from the RIO folder tree.
 * Uses the Google Drive API through the Forge proxy.
 *
 * Strategy: Query for files modified in the last N hours across all
 * known RIO folder IDs. We use a single query with OR'd parent conditions
 * to minimize API calls.
 */
export async function fetchResonanceFeed(
  hoursBack: number = 72,
  maxEvents: number = 50
): Promise<ResonanceFeed> {
  const errors: string[] = [];
  const allEvents: ResonanceEvent[] = [];

  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    return {
      events: [],
      totalEvents: 0,
      fetchedAt: Date.now(),
      errors: ["Forge API not configured — cannot access Google Drive"],
    };
  }

  // Build time filter
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  // Query each folder individually (Drive API doesn't support OR on parents in a single query)
  // But we can batch them efficiently
  const folderEntries = Object.entries(RIO_FOLDERS);

  for (const [folderPath, folderInfo] of folderEntries) {
    try {
      const query = `'${folderInfo.id}' in parents and modifiedTime > '${since}' and mimeType != 'application/vnd.google-apps.folder'`;

      const params = new URLSearchParams({
        q: query,
        pageSize: "20",
        orderBy: "modifiedTime desc",
        fields: "files(id,name,mimeType,modifiedTime,parents,webViewLink)",
      });

      const res = await fetch(
        `${forgeUrl}/google/drive/v3/files?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${forgeKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        // Try alternative: direct Google API through gws-style proxy
        errors.push(`Drive query failed for ${folderPath}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json() as {
        files?: Array<{
          id: string;
          name: string;
          mimeType: string;
          modifiedTime: string;
          parents?: string[];
          webViewLink?: string;
        }>;
      };

      for (const file of data.files || []) {
        const folderTags = folderInfo.tags;
        const nameTags = inferTagsFromName(file.name);
        const allTags = Array.from(new Set([...folderTags, ...nameTags]));

        allEvents.push({
          fileId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          folderPath,
          tags: allTags,
          webViewLink: file.webViewLink,
        });
      }
    } catch (err) {
      errors.push(`Drive query error for ${folderPath}: ${String(err)}`);
    }
  }

  // Sort all events by modifiedTime descending, deduplicate by fileId
  const seen = new Set<string>();
  const deduped = allEvents
    .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
    .filter(e => {
      if (seen.has(e.fileId)) return false;
      seen.add(e.fileId);
      return true;
    })
    .slice(0, maxEvents);

  return {
    events: deduped,
    totalEvents: deduped.length,
    fetchedAt: Date.now(),
    errors,
  };
}

/**
 * Fallback: Fetch resonance feed using GitHub API instead of Drive.
 * Reads recent commits from rio-system as a proxy for system activity.
 * This works even if Drive API is not available through Forge.
 */
export async function fetchResonanceFeedFromGitHub(
  githubToken: string,
  maxEvents: number = 30
): Promise<ResonanceFeed> {
  const errors: string[] = [];
  const events: ResonanceEvent[] = [];

  try {
    // Fetch recent commits from rio-system
    const res = await fetch(
      `https://api.github.com/repos/bkr1297-RIO/rio-system/commits?per_page=${maxEvents}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "RIO-ONE-Resonance",
        },
      }
    );

    if (!res.ok) {
      errors.push(`GitHub commits API returned ${res.status}`);
    } else {
      const commits = await res.json() as Array<{
        sha: string;
        commit: {
          message: string;
          author: { name: string; date: string };
        };
        html_url: string;
        files?: Array<{ filename: string }>;
      }>;

      for (const commit of commits) {
        const name = `${commit.sha.slice(0, 7)}: ${commit.commit.message.split("\n")[0]}`;
        const tags = ["#GitCommit", ...inferTagsFromName(commit.commit.message)];

        // Infer agent from commit author
        const author = commit.commit.author.name.toLowerCase();
        if (author.includes("manny") || author.includes("manus")) tags.push("#Manny");
        if (author.includes("bondi") || author.includes("chatgpt")) tags.push("#Bondi");
        if (author.includes("claude")) tags.push("#Claude");
        if (author.includes("gemini")) tags.push("#Gemini");
        if (author.includes("brian")) tags.push("#Brian");

        events.push({
          fileId: commit.sha,
          name,
          mimeType: "application/git-commit",
          modifiedTime: commit.commit.author.date,
          folderPath: "/rio-system",
          tags: Array.from(new Set(tags)),
          webViewLink: commit.html_url,
        });
      }
    }
  } catch (err) {
    errors.push(`GitHub API error: ${String(err)}`);
  }

  // Also fetch recent activity from rio-protocol if accessible
  try {
    const res = await fetch(
      `https://api.github.com/repos/bkr1297-RIO/rio-protocol/commits?per_page=10`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "RIO-ONE-Resonance",
        },
      }
    );

    if (res.ok) {
      const commits = await res.json() as Array<{
        sha: string;
        commit: {
          message: string;
          author: { name: string; date: string };
        };
        html_url: string;
      }>;

      for (const commit of commits) {
        const name = `${commit.sha.slice(0, 7)}: ${commit.commit.message.split("\n")[0]}`;
        const tags = ["#GitCommit", "#Protocol", ...inferTagsFromName(commit.commit.message)];

        events.push({
          fileId: commit.sha,
          name,
          mimeType: "application/git-commit",
          modifiedTime: commit.commit.author.date,
          folderPath: "/rio-protocol",
          tags: Array.from(new Set(tags)),
          webViewLink: commit.html_url,
        });
      }
    }
  } catch {
    // rio-protocol may not be accessible — that's fine
  }

  // Sort by time
  events.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());

  return {
    events: events.slice(0, maxEvents),
    totalEvents: events.length,
    fetchedAt: Date.now(),
    errors,
  };
}
