/**
 * RIO Connector Base Interface
 *
 * Every external system that RIO governs is represented as a Connector.
 * Connectors only execute AFTER RIO authorization (receipt + ledger entry exist).
 * This is the universal governance layer — platform-agnostic, connector-based.
 *
 * Flow:
 *   AI proposes intent → RIO intercepts → User approves (or policy auto-approves)
 *   → Receipt generated → Ledger entry written → Connector executes action
 *   → Execution result recorded
 */

// ── Connector Types ─────────────────────────────────────────────────────────

export type ConnectorStatus = "connected" | "disconnected" | "simulated";

export type ExecutionMode = "live" | "simulated";

export interface ConnectorCapability {
  action: string;          // e.g., "send_email", "create_event", "move_file"
  label: string;           // Human-readable label
  description: string;     // What this action does
  riskLevel: "Low" | "Medium" | "High" | "Critical";
}

export interface ExecutionRequest {
  intentId: string;
  receiptId: string;
  action: string;
  parameters: Record<string, string>;
  mode: ExecutionMode;
}

export interface ExecutionResult {
  success: boolean;
  connector: string;       // Which connector executed
  action: string;
  mode: ExecutionMode;
  executedAt: string;
  detail: string;          // Human-readable result
  externalId?: string;     // ID from the external system (e.g., Gmail message ID)
  error?: string;          // Error message if failed
}

// ── Base Connector Interface ────────────────────────────────────────────────

export interface RIOConnector {
  /** Unique connector identifier (e.g., "gmail", "google_calendar", "outlook") */
  id: string;

  /** Human-readable name (e.g., "Gmail", "Google Calendar") */
  name: string;

  /** Platform this connector belongs to (e.g., "google", "microsoft", "apple") */
  platform: string;

  /** Icon identifier for UI rendering */
  icon: string;

  /** Current connection status */
  status: ConnectorStatus;

  /** Actions this connector can perform */
  capabilities: ConnectorCapability[];

  /**
   * Execute an action through this connector.
   * MUST only be called after RIO has generated a receipt and ledger entry.
   * In simulated mode, returns a simulated success without calling the external system.
   */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;

  /**
   * Check if this connector can handle a given action.
   */
  canHandle(action: string): boolean;

  /**
   * Get the connector's current status info for display.
   */
  getInfo(): ConnectorInfo;
}

export interface ConnectorInfo {
  id: string;
  name: string;
  platform: string;
  icon: string;
  status: ConnectorStatus;
  capabilities: ConnectorCapability[];
  description: string;
}
