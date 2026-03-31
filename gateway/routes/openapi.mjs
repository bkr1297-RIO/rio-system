/**
 * RIO Gateway — OpenAPI 3.0 Specification (WS-012: Public API)
 *
 * Programmatic OpenAPI spec served at GET /api/v1/docs.
 * This is the single source of truth for the public API contract.
 */

const PRODUCTION_URL = process.env.PRODUCTION_URL || "https://rio-gateway.onrender.com";

export function getOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "RIO Governance Gateway API",
      version: "1.0.0",
      description:
        "The RIO Governance Gateway provides governed AI execution through a structured pipeline: Intent → Governance → Authorization → Execution → Receipt → Ledger. Every action is authorized, executed, verified, recorded, and auditable. The system is fail-closed: no authorization means no execution.",
      contact: {
        name: "Brian K. Rasmussen",
        email: "bkr1297@gmail.com",
      },
      license: {
        name: "Proprietary",
      },
    },
    servers: [
      {
        url: PRODUCTION_URL,
        description: "Production (Render.com)",
      },
      {
        url: "http://localhost:4400",
        description: "Local development",
      },
    ],
    security: [
      { ApiKeyAuth: [] },
      { BearerAuth: [] },
    ],
    tags: [
      { name: "Pipeline", description: "Governance pipeline operations (submit → govern → authorize → execute → confirm → receipt)" },
      { name: "Ledger", description: "Immutable ledger and verification" },
      { name: "Keys", description: "API key management" },
      { name: "Health", description: "System health and documentation" },
    ],
    paths: {
      "/api/v1/intents": {
        post: {
          tags: ["Pipeline"],
          summary: "Submit a new intent",
          description: "Submit an intent for governance evaluation. Accepts RIO Intake Schema v1 or legacy format.",
          operationId: "submitIntent",
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/IntakeV1" },
                    { $ref: "#/components/schemas/LegacyIntent" },
                  ],
                },
                examples: {
                  intake_v1: {
                    summary: "Intake Schema v1",
                    value: {
                      identity: {
                        subject: "manus-agent",
                        auth_method: "api_key",
                        role: "agent",
                      },
                      intent: {
                        action: "send_email",
                        target: "production",
                        parameters: {
                          to: "user@example.com",
                          subject: "Test",
                          body: "Hello from RIO",
                        },
                      },
                      context: {
                        reason: "Automated notification",
                        urgency: "normal",
                      },
                    },
                  },
                  legacy: {
                    summary: "Legacy format",
                    value: {
                      action: "send_email",
                      agent_id: "manus-agent",
                      parameters: {
                        to: "user@example.com",
                        subject: "Test",
                        body: "Hello from RIO",
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Intent submitted successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntentResponse" },
                },
              },
            },
            400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            429: { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/RateLimitError" } } } },
          },
        },
        get: {
          tags: ["Pipeline"],
          summary: "List intents",
          operationId: "listIntents",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["submitted", "governed", "authorized", "denied", "blocked", "executing", "executed", "receipted"] } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          ],
          responses: {
            200: {
              description: "List of intents",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      intents: { type: "array", items: { $ref: "#/components/schemas/Intent" } },
                      count: { type: "integer" },
                      api_version: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/intents/{intent_id}": {
        get: {
          tags: ["Pipeline"],
          summary: "Get intent details",
          operationId: "getIntent",
          parameters: [
            { name: "intent_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: { description: "Intent details", content: { "application/json": { schema: { $ref: "#/components/schemas/Intent" } } } },
            404: { description: "Intent not found" },
          },
        },
      },
      "/api/v1/intents/{intent_id}/govern": {
        post: {
          tags: ["Pipeline"],
          summary: "Run governance evaluation",
          description: "Evaluate an intent against policy rules. Returns risk level, approval requirements, and policy check results.",
          operationId: "governIntent",
          parameters: [
            { name: "intent_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: { description: "Governance evaluation result", content: { "application/json": { schema: { $ref: "#/components/schemas/GovernanceResult" } } } },
            404: { description: "Intent not found" },
            409: { description: "Intent not in correct state" },
          },
        },
      },
      "/api/v1/intents/{intent_id}/authorize": {
        post: {
          tags: ["Pipeline"],
          summary: "Authorize or deny an intent",
          description: "Record a human approval or denial. Requires Ed25519 signature when ed25519_mode is 'required'.",
          operationId: "authorizeIntent",
          parameters: [
            { name: "intent_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthorizationRequest" },
              },
            },
          },
          responses: {
            200: { description: "Authorization recorded", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthorizationResult" } } } },
            400: { description: "Missing fields or signature required" },
            403: { description: "Invalid signature or unregistered signer" },
            404: { description: "Intent not found" },
            409: { description: "Intent not in correct state" },
          },
        },
      },
      "/api/v1/intents/{intent_id}/execute": {
        post: {
          tags: ["Pipeline"],
          summary: "Execute an authorized intent",
          description: "Issues a single-use execution token. The agent must execute externally and confirm via /confirm.",
          operationId: "executeIntent",
          parameters: [
            { name: "intent_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: { description: "Execution token issued", content: { "application/json": { schema: { $ref: "#/components/schemas/ExecutionToken" } } } },
            403: { description: "Not authorized or expired" },
            404: { description: "Intent not found" },
          },
        },
      },
      "/api/v1/intents/{intent_id}/confirm": {
        post: {
          tags: ["Pipeline"],
          summary: "Confirm execution result",
          description: "Agent confirms execution with result. Burns the single-use execution token.",
          operationId: "confirmExecution",
          parameters: [
            { name: "intent_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["execution_result"],
                  properties: {
                    execution_result: { type: "string", description: "Result of the execution" },
                    connector: { type: "string", description: "Connector used (e.g., 'gmail', 'twilio')" },
                    execution_token: { type: "string", description: "Single-use token from /execute" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Execution confirmed" },
            403: { description: "Token burned or invalid" },
            409: { description: "Intent not in correct state" },
          },
        },
      },
      "/api/v1/intents/{intent_id}/receipt": {
        post: {
          tags: ["Pipeline"],
          summary: "Generate cryptographic receipt",
          description: "Generates a receipt with full hash chain and identity binding proof.",
          operationId: "generateReceipt",
          parameters: [
            { name: "intent_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: { description: "Receipt generated", content: { "application/json": { schema: { $ref: "#/components/schemas/Receipt" } } } },
            404: { description: "Intent not found" },
            409: { description: "Intent not in correct state" },
          },
        },
      },
      "/api/v1/ledger": {
        get: {
          tags: ["Ledger"],
          summary: "View ledger entries",
          operationId: "getLedger",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
            { name: "intent_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            200: {
              description: "Ledger entries",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      entries: { type: "array", items: { $ref: "#/components/schemas/LedgerEntry" } },
                      total: { type: "integer" },
                      chain_tip: { type: "string" },
                      api_version: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/verify": {
        get: {
          tags: ["Ledger"],
          summary: "Verify hash chain integrity",
          operationId: "verifyChain",
          parameters: [
            { name: "intent_id", in: "query", schema: { type: "string", format: "uuid" }, description: "Verify a specific intent's receipt" },
          ],
          responses: {
            200: { description: "Verification result" },
          },
        },
      },
      "/api/v1/health": {
        get: {
          tags: ["Health"],
          summary: "API health check",
          description: "Returns operational status, ledger stats, and pipeline stats. No authentication required.",
          operationId: "healthCheck",
          security: [],
          responses: {
            200: { description: "System health" },
          },
        },
      },
      "/api/v1/docs": {
        get: {
          tags: ["Health"],
          summary: "OpenAPI documentation",
          description: "Returns this OpenAPI 3.0 specification.",
          operationId: "getDocs",
          security: [],
          responses: {
            200: { description: "OpenAPI spec" },
          },
        },
      },
      "/api/v1/keys": {
        post: {
          tags: ["Keys"],
          summary: "Create API key",
          description: "Create a new API key. Owner JWT authentication required. The raw key is returned ONCE.",
          operationId: "createApiKey",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["display_name"],
                  properties: {
                    display_name: { type: "string", description: "Human-readable label for the key" },
                    scopes: {
                      type: "array",
                      items: { type: "string", enum: ["read", "write", "admin"] },
                      default: ["read"],
                      description: "Allowed scopes for this key",
                    },
                    rate_limit: { type: "integer", default: 100, description: "Requests per minute" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "API key created (raw key shown ONCE)" },
            403: { description: "Owner authentication required" },
          },
        },
        get: {
          tags: ["Keys"],
          summary: "List API keys",
          operationId: "listApiKeys",
          responses: {
            200: { description: "List of API keys (without raw key values)" },
          },
        },
      },
      "/api/v1/keys/{key_id}": {
        get: {
          tags: ["Keys"],
          summary: "Get API key details",
          operationId: "getApiKey",
          parameters: [
            { name: "key_id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "API key details" },
            404: { description: "Key not found" },
          },
        },
        delete: {
          tags: ["Keys"],
          summary: "Revoke API key",
          description: "Permanently revoke an API key. Owner JWT authentication required.",
          operationId: "revokeApiKey",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "key_id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Key revoked" },
            403: { description: "Owner authentication required" },
            404: { description: "Key not found" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API key for programmatic access. Generate via POST /api/v1/keys.",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token from POST /login.",
        },
      },
      schemas: {
        IntakeV1: {
          type: "object",
          required: ["identity", "intent", "context"],
          properties: {
            identity: {
              type: "object",
              required: ["subject", "auth_method"],
              properties: {
                subject: { type: "string", description: "Identity of the requester" },
                auth_method: { type: "string", enum: ["api_key", "jwt_session", "google_oauth", "microsoft_oauth", "ed25519_signature"] },
                role: { type: "string" },
                on_behalf_of: { type: "string" },
              },
            },
            intent: {
              type: "object",
              required: ["action"],
              properties: {
                action: { type: "string", description: "Action to perform (e.g., send_email, create_calendar_event)" },
                target: { type: "string", description: "Target environment (e.g., production, staging)" },
                parameters: { type: "object", description: "Action-specific parameters" },
              },
            },
            context: {
              type: "object",
              required: ["reason"],
              properties: {
                reason: { type: "string", description: "Why this action is being requested" },
                urgency: { type: "string", enum: ["low", "normal", "high", "critical"] },
                risk_assessment: { type: "string" },
              },
            },
          },
        },
        LegacyIntent: {
          type: "object",
          required: ["action"],
          properties: {
            action: { type: "string" },
            agent_id: { type: "string" },
            parameters: { type: "object" },
            confidence: { type: "number", minimum: 0, maximum: 10 },
          },
        },
        IntentResponse: {
          type: "object",
          properties: {
            intent_id: { type: "string", format: "uuid" },
            status: { type: "string" },
            action: { type: "string" },
            agent_id: { type: "string" },
            intent_hash: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
            api_version: { type: "string" },
          },
        },
        Intent: {
          type: "object",
          properties: {
            intent_id: { type: "string", format: "uuid" },
            action: { type: "string" },
            agent_id: { type: "string" },
            status: { type: "string" },
            parameters: { type: "object" },
            governance: { type: "object" },
            authorization: { type: "object" },
            execution: { type: "object" },
            receipt: { type: "object" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        GovernanceResult: {
          type: "object",
          properties: {
            intent_id: { type: "string", format: "uuid" },
            governance_status: { type: "string", enum: ["allowed", "blocked"] },
            risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
            requires_approval: { type: "boolean" },
            reason: { type: "string" },
            checks: { type: "object" },
            governance_hash: { type: "string" },
            api_version: { type: "string" },
          },
        },
        AuthorizationRequest: {
          type: "object",
          required: ["decision", "authorized_by"],
          properties: {
            decision: { type: "string", enum: ["approved", "denied"] },
            authorized_by: { type: "string", description: "Signer ID of the authorizer" },
            signature: { type: "string", description: "Ed25519 signature (hex)" },
            signature_timestamp: { type: "string", format: "date-time" },
            conditions: { type: "string" },
            expires_at: { type: "string", format: "date-time" },
          },
        },
        AuthorizationResult: {
          type: "object",
          properties: {
            intent_id: { type: "string", format: "uuid" },
            authorization_status: { type: "string" },
            authorized_by: { type: "string" },
            authorization_hash: { type: "string" },
            ed25519_signed: { type: "boolean" },
            timestamp: { type: "string", format: "date-time" },
            api_version: { type: "string" },
          },
        },
        ExecutionToken: {
          type: "object",
          properties: {
            intent_id: { type: "string", format: "uuid" },
            status: { type: "string" },
            execution_token: { type: "object" },
            instruction: { type: "string" },
            api_version: { type: "string" },
          },
        },
        Receipt: {
          type: "object",
          properties: {
            receipt_id: { type: "string", format: "uuid" },
            intent_id: { type: "string", format: "uuid" },
            action: { type: "string" },
            agent_id: { type: "string" },
            authorized_by: { type: "string" },
            hash_chain: {
              type: "object",
              properties: {
                intent_hash: { type: "string" },
                governance_hash: { type: "string" },
                authorization_hash: { type: "string" },
                execution_hash: { type: "string" },
                receipt_hash: { type: "string" },
              },
            },
            identity_binding: {
              type: "object",
              properties: {
                ed25519_signed: { type: "boolean" },
                signer_id: { type: "string" },
                signer_public_key_hex: { type: "string" },
                signature_payload_hash: { type: "string" },
                verification_method: { type: "string" },
              },
            },
            timestamp: { type: "string", format: "date-time" },
            api_version: { type: "string" },
          },
        },
        LedgerEntry: {
          type: "object",
          properties: {
            entry_id: { type: "string", format: "uuid" },
            intent_id: { type: "string", format: "uuid" },
            action: { type: "string" },
            agent_id: { type: "string" },
            status: { type: "string" },
            detail: { type: "string" },
            ledger_hash: { type: "string" },
            prev_hash: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            hint: { type: "string" },
          },
        },
        RateLimitError: {
          type: "object",
          properties: {
            error: { type: "string" },
            limit: { type: "integer" },
            window: { type: "string" },
            retry_after_seconds: { type: "integer" },
          },
        },
      },
    },
  };
}
