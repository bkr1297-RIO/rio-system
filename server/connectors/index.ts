/**
 * RIO Connectors — Universal Governance Layer
 *
 * Export the registry and all connector types for use across the application.
 */

export { connectorRegistry } from "./registry";
export type {
  RIOConnector,
  ConnectorInfo,
  ConnectorCapability,
  ConnectorStatus,
  ExecutionMode,
  ExecutionRequest,
  ExecutionResult,
} from "./base";
export { GmailConnector } from "./gmail";
export { GoogleCalendarConnector } from "./calendar";
export { GoogleDriveConnector } from "./drive";
