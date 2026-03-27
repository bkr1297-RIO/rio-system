/**
 * RIO Connector Registry
 *
 * Central hub that manages all connectors and routes execution requests
 * to the correct connector based on the action type.
 *
 * The registry enforces the rule: NO execution without a receipt.
 * It also provides discovery (list all connectors, capabilities, statuses).
 */

import type {
  RIOConnector,
  ConnectorInfo,
  ExecutionRequest,
  ExecutionResult,
  ExecutionMode,
} from "./base";
import { GmailConnector } from "./gmail";
import { GoogleCalendarConnector } from "./calendar";
import { GoogleDriveConnector } from "./drive";

class ConnectorRegistry {
  private connectors: Map<string, RIOConnector> = new Map();

  constructor() {
    // Register all available connectors
    this.register(new GmailConnector());
    this.register(new GoogleCalendarConnector());
    this.register(new GoogleDriveConnector());
  }

  /**
   * Register a new connector.
   */
  register(connector: RIOConnector): void {
    this.connectors.set(connector.id, connector);
    console.log(`[RIO Registry] Registered connector: ${connector.name} (${connector.id})`);
  }

  /**
   * Find the connector that can handle a given action.
   * Returns null if no connector supports the action.
   */
  findConnector(action: string): RIOConnector | null {
    for (const connector of Array.from(this.connectors.values())) {
      if (connector.canHandle(action)) {
        return connector;
      }
    }
    return null;
  }

  /**
   * Execute an action through the appropriate connector.
   * FAIL-CLOSED: Will not execute if no connector is found.
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const connector = this.findConnector(request.action);

    if (!connector) {
      return {
        success: false,
        connector: "none",
        action: request.action,
        mode: request.mode,
        executedAt: new Date().toISOString(),
        detail: `No connector found for action "${request.action}". Execution blocked.`,
        error: "NO_CONNECTOR",
      };
    }

    // If connector is simulated, force simulated mode regardless of request
    const effectiveMode: ExecutionMode =
      connector.status === "simulated" ? "simulated" : request.mode;

    const effectiveRequest = { ...request, mode: effectiveMode };

    console.log(`[RIO Registry] Routing "${request.action}" to ${connector.name} (mode: ${effectiveMode})`);

    return connector.execute(effectiveRequest);
  }

  /**
   * Get info about all registered connectors.
   */
  listConnectors(): ConnectorInfo[] {
    return Array.from(this.connectors.values()).map((c) => c.getInfo());
  }

  /**
   * Get info about a specific connector.
   */
  getConnector(id: string): ConnectorInfo | null {
    const connector = this.connectors.get(id);
    return connector ? connector.getInfo() : null;
  }

  /**
   * Get all supported actions across all connectors.
   */
  listActions(): Array<{
    action: string;
    label: string;
    description: string;
    riskLevel: string;
    connector: string;
    connectorName: string;
    connectorStatus: string;
  }> {
    const actions: Array<{
      action: string;
      label: string;
      description: string;
      riskLevel: string;
      connector: string;
      connectorName: string;
      connectorStatus: string;
    }> = [];

    for (const connector of Array.from(this.connectors.values())) {
      for (const cap of connector.capabilities) {
        actions.push({
          action: cap.action,
          label: cap.label,
          description: cap.description,
          riskLevel: cap.riskLevel,
          connector: connector.id,
          connectorName: connector.name,
          connectorStatus: connector.status,
        });
      }
    }

    return actions;
  }
}

// Singleton registry instance
export const connectorRegistry = new ConnectorRegistry();
