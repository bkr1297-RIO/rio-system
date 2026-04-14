/**
 * MANTIS Integration — Memory, Audit, Notification, Tracking, Integrity, Synchronization
 *
 * Reads integrity sweep output and STATUS.json from the rio-system GitHub repo.
 * This is the source of truth for system integrity — NOT agent self-report.
 *
 * Claude's Condition 3: "Status indicators must pull from MANTIS integrity sweep
 * output, not from agent self-report."
 *
 * Data sources:
 *   - bkr1297-RIO/rio-system/sweeps/*.json — integrity sweep results
 *   - bkr1297-RIO/rio-system/STATUS.json — system state
 */

const GITHUB_API = "https://api.github.com";
const REPO = "bkr1297-RIO/rio-system";

// ─── Types ──────────────────────────────────────────────────

export interface GovernanceArtifact {
  file: string;
  description: string;
  criticality: string;
  exists: boolean;
  computed_sha256: string;
  known_sha256: string | null;
  status: "VERIFIED" | "RECORDED" | "MISSING" | "MISMATCH";
}

export interface SweepDetail {
  sweep_version: string;
  sweep_id: string;
  git_state: {
    branch: string;
    last_commit_hash: string;
    last_commit_message: string;
    last_commit_date: string;
    is_dirty: boolean;
    untracked_files: string[];
  };
  governance_artifacts: GovernanceArtifact[];
  violations: Array<{ file: string; issue: string }>;
  recent_commits: Array<{
    hash: string;
    short_hash: string;
    message: string;
    date: string;
    author: string;
  }>;
  needs_approval: boolean;
}

export interface SweepResult {
  packet_type: string;
  task_id: string;
  completed_at: string;
  completed_by: string;
  status: "SUCCESS" | "WARNING" | "FAILURE";
  summary: string;
  artifacts: {
    repo_commit: string;
    drive_files: string | null;
    docs_created: string | null;
  };
  verification: {
    tests: "PASS" | "FAIL";
    notes: string;
  };
  blockers: string[];
  next_recommended_action: string;
  sweep_detail: SweepDetail;
}

export interface SystemStatus {
  updated_at: string;
  updated_by: string;
  system_state: string;
  governance: {
    governance_md_hash: string;
    integrity_sweep: string;
    last_sweep: string;
    violations: number;
  };
  agents: Record<string, {
    role: string;
    status: string;
    last_action: string;
  }>;
  repos: Record<string, {
    status: string;
    last_commit: string;
    purpose: string;
  }>;
  blockers: string[];
  next_actions: string[];
}

export interface MantisState {
  sweep: SweepResult | null;
  systemStatus: SystemStatus | null;
  sweepFile: string | null;
  fetchedAt: number;
  errors: string[];
}

// ─── Normalized output for the dashboard ────────────────────

export interface MantisIntegrity {
  /** Overall sweep status */
  overallStatus: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
  /** When the sweep was completed */
  sweepTimestamp: string | null;
  /** Who ran the sweep */
  sweepBy: string | null;
  /** Sweep version */
  sweepVersion: string | null;
  /** Git state */
  gitBranch: string | null;
  gitCommit: string | null;
  gitDirty: boolean;
  /** Artifact counts */
  totalArtifacts: number;
  verifiedArtifacts: number;
  recordedArtifacts: number;
  missingArtifacts: number;
  mismatchArtifacts: number;
  /** Individual artifact statuses */
  artifacts: Array<{
    file: string;
    criticality: string;
    status: string;
    hashPrefix: string;
  }>;
  /** Violations */
  violations: number;
  violationDetails: string[];
  /** Recent commits */
  recentCommits: Array<{
    hash: string;
    message: string;
    date: string;
    author: string;
  }>;
  /** System state from STATUS.json */
  systemState: string | null;
  systemUpdatedAt: string | null;
  agentStatuses: Record<string, { role: string; status: string; lastAction: string }>;
  repoStatuses: Record<string, { status: string; lastCommit: string }>;
  /** Blockers */
  blockers: string[];
  /** Metadata */
  fetchedAt: number;
  errors: string[];
}

// ─── GitHub API helpers ─────────────────────────────────────

async function githubFetch<T>(path: string, token: string): Promise<{ ok: boolean; data: T | null; error?: string }> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3.raw",
        "User-Agent": "RIO-ONE-CommandCenter",
      },
    });
    if (!res.ok) {
      return { ok: false, data: null, error: `GitHub API returned ${res.status}` };
    }
    const data = await res.json() as T;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, data: null, error: `GitHub API unreachable: ${String(err)}` };
  }
}

async function githubListDir(path: string, token: string): Promise<{ ok: boolean; files: Array<{ name: string; path: string }> | null; error?: string }> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${path}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "RIO-ONE-CommandCenter",
      },
    });
    if (!res.ok) {
      return { ok: false, files: null, error: `GitHub API returned ${res.status}` };
    }
    const data = await res.json() as Array<{ name: string; path: string; type: string }>;
    return {
      ok: true,
      files: data.filter(f => f.type === "file").map(f => ({ name: f.name, path: f.path })),
    };
  } catch (err) {
    return { ok: false, files: null, error: `GitHub API unreachable: ${String(err)}` };
  }
}

// ─── Main fetch function ────────────────────────────────────

export async function fetchMantisState(githubToken: string): Promise<MantisState> {
  const errors: string[] = [];
  let sweep: SweepResult | null = null;
  let systemStatus: SystemStatus | null = null;
  let sweepFile: string | null = null;

  // 1. List sweep files and find the latest one
  const dirResult = await githubListDir("sweeps", githubToken);
  if (dirResult.ok && dirResult.files) {
    const jsonFiles = dirResult.files
      .filter(f => f.name.endsWith(".json"))
      .sort((a, b) => b.name.localeCompare(a.name)); // newest first by filename

    if (jsonFiles.length > 0) {
      sweepFile = jsonFiles[0].name;
      const sweepResult = await githubFetch<SweepResult>(
        `/repos/${REPO}/contents/sweeps/${jsonFiles[0].name}`,
        githubToken
      );
      if (sweepResult.ok && sweepResult.data) {
        sweep = sweepResult.data;
      } else {
        errors.push(`Sweep fetch failed: ${sweepResult.error}`);
      }
    } else {
      errors.push("No sweep result files found in sweeps/ directory");
    }
  } else {
    errors.push(`Sweep directory listing failed: ${dirResult.error}`);
  }

  // 2. Fetch STATUS.json
  const statusResult = await githubFetch<SystemStatus>(
    `/repos/${REPO}/contents/STATUS.json`,
    githubToken
  );
  if (statusResult.ok && statusResult.data) {
    systemStatus = statusResult.data;
  } else {
    errors.push(`STATUS.json fetch failed: ${statusResult.error}`);
  }

  return {
    sweep,
    systemStatus,
    sweepFile,
    fetchedAt: Date.now(),
    errors,
  };
}

// ─── Normalize to dashboard-ready format ────────────────────

export function normalizeMantisState(state: MantisState): MantisIntegrity {
  const { sweep, systemStatus, errors, fetchedAt } = state;

  // Determine overall status from sweep
  let overallStatus: MantisIntegrity["overallStatus"] = "UNKNOWN";
  if (sweep) {
    if (sweep.status === "SUCCESS" && sweep.verification.tests === "PASS") {
      overallStatus = "PASS";
    } else if (sweep.status === "WARNING") {
      overallStatus = "WARN";
    } else if (sweep.status === "FAILURE" || sweep.verification.tests === "FAIL") {
      overallStatus = "FAIL";
    } else {
      overallStatus = "PASS"; // SUCCESS with PASS tests
    }
  }

  const detail = sweep?.sweep_detail;
  const artifacts = detail?.governance_artifacts || [];

  const verified = artifacts.filter(a => a.status === "VERIFIED").length;
  const recorded = artifacts.filter(a => a.status === "RECORDED").length;
  const missing = artifacts.filter(a => a.status === "MISSING").length;
  const mismatch = artifacts.filter(a => a.status === "MISMATCH").length;

  // If there are mismatches or missing critical files, override to WARN or FAIL
  if (overallStatus === "PASS" && mismatch > 0) {
    overallStatus = "FAIL";
  } else if (overallStatus === "PASS" && missing > 0) {
    overallStatus = "WARN";
  }

  return {
    overallStatus,
    sweepTimestamp: sweep?.completed_at || null,
    sweepBy: sweep?.completed_by || null,
    sweepVersion: detail?.sweep_version || null,
    gitBranch: detail?.git_state?.branch || null,
    gitCommit: detail?.git_state?.last_commit_hash || null,
    gitDirty: detail?.git_state?.is_dirty || false,
    totalArtifacts: artifacts.length,
    verifiedArtifacts: verified,
    recordedArtifacts: recorded,
    missingArtifacts: missing,
    mismatchArtifacts: mismatch,
    artifacts: artifacts.map(a => ({
      file: a.file,
      criticality: a.criticality,
      status: a.status,
      hashPrefix: a.computed_sha256 ? a.computed_sha256.slice(0, 12) : "—",
    })),
    violations: detail?.violations?.length || 0,
    violationDetails: (detail?.violations || []).map(v => `${v.file}: ${v.issue}`),
    recentCommits: (detail?.recent_commits || []).slice(0, 5).map(c => ({
      hash: c.short_hash,
      message: c.message,
      date: c.date,
      author: c.author,
    })),
    systemState: systemStatus?.system_state || null,
    systemUpdatedAt: systemStatus?.updated_at || null,
    agentStatuses: Object.fromEntries(
      Object.entries(systemStatus?.agents || {}).map(([key, val]) => [
        key,
        { role: val.role, status: val.status, lastAction: val.last_action },
      ])
    ),
    repoStatuses: Object.fromEntries(
      Object.entries(systemStatus?.repos || {}).map(([key, val]) => [
        key,
        { status: val.status, lastCommit: val.last_commit },
      ])
    ),
    blockers: [
      ...(sweep?.blockers || []),
      ...(systemStatus?.blockers || []),
    ],
    fetchedAt,
    errors,
  };
}
