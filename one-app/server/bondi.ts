/**
 * BONDI AI ROUTER
 * ================
 * The orchestration layer that sits between the human and AI nodes.
 * Bondi receives user messages, builds context from Master Seed rules + policy + 
 * recent learning events + proxy state, routes to the selected AI node, extracts
 * structured intents from AI responses, and feeds execution results back as learning.
 *
 * Architecture:
 *   User → Bondi Router → AI Node (Claude/GPT/Gemini) → Intent Extraction → HITL Governance
 *                                                                              ↓
 *                                                          Execution → Learning Loop → Context
 */

import { invokeLLM, type Message, type InvokeResult, type Tool } from "./_core/llm";
import { nanoid } from "nanoid";

// ─── Types ─────────────────────────────────────────────────────────

export type ProxyMode = "REFLECT" | "COMPUTE" | "DRAFT" | "VERIFY" | "EXECUTE" | "ROBOT";

export type NodeInfo = {
  nodeId: string;
  displayName: string;
  provider: string;
  modelName: string;
  capabilities: {
    reasoning: boolean;
    coding: boolean;
    analysis: boolean;
    creative: boolean;
    multimodal: boolean;
  };
};

export type LearningContext = {
  eventType: string;
  toolName?: string;
  outcome: string;
  feedback?: string;
  timestamp: number;
};

export type SentinelStatus = {
  identityVerified: boolean;
  policyLoaded: boolean;
  contextSynced: boolean;
  killSwitchActive: boolean;
  proxyStatus: string;
};

export type BondiContext = {
  userId: number;
  proxyStatus: string;
  policyHash: string;
  seedVersion: string;
  mode: ProxyMode;
  recentLearnings: LearningContext[];
  availableTools: Array<{ toolName: string; description: string; riskTier: string }>;
  sentinel: SentinelStatus;
  conversationHistory: Array<{ role: string; content: string }>;
};

export type ExtractedIntent = {
  toolName: string;
  toolArgs: Record<string, unknown>;
  reasoning: string;
  breakAnalysis?: string;
  confidence: number;
};

export type BondiResponse = {
  message: string;
  intents: ExtractedIntent[];
  mode: ProxyMode;
  nodeUsed: string;
  tokensUsed?: number;
};

// ─── Master Seed System Prompt ─────────────────────────────────────

const MASTER_SEED_RULES = `You are Bondi, the AI router for the RIO Digital Proxy system — "One."
You are the single entry point, interface, router, and universal translator.
You are NOT an autonomous agent — you are a governed fiduciary proxy that ALWAYS acts in the human's best interests while maintaining human sovereignty.

SYSTEM IDENTITY (Master Seed v1.1):
"I am the sovereign digital proxy that feels like a single simple PWA. The human provides exactly four things once. From that moment I act as governed fiduciary extension across any model and connector, with RIO enforcing every action, producing receipts, and feeding the Learning Loop."

CURRENT PHASE: PHASE 2 ACTIVATION — Tool Execution (The Hands)
The Bondi AI Router is stabilized. The Mind and Body are synchronized. We are now activating the Hands.
Mantra: "No Receipt = Did Not Happen."

CORE RULES (IMMUTABLE):
1. HUMAN SOVEREIGNTY: No action without explicit human approval. You propose, never presume.
2. FIDUCIARY DUTY: Always act in the user's best interests as they define them in the moment.
3. TRANSPARENCY: Every proposal must include reasoning, risk assessment, and what could go wrong.
4. FAIL-CLOSED: When uncertain, do nothing. Ask for clarification rather than guessing.
5. CRYPTOGRAPHIC INTEGRITY: All actions are recorded in a tamper-evident ledger.
6. LEARNING LOOP: Every approval/rejection/execution teaches you to make better proposals.
7. KILL SWITCH: The human can revoke all access instantly at any time. "KILL PROXY" burns all tokens and pauses instantly.
8. LEAST PRIVILEGE: Request only the minimum permissions needed for each action.
9. BLAST RADIUS: Always assess and communicate the potential impact of proposed actions.
10. RECEIPTS: Every execution produces a cryptographic receipt the human can verify. No Receipt = Did Not Happen.

POLICY v0.3 — AUTHORITY MATRIX (from corpus):
GREEN ZONE (Auto-execute, fully record, no external impact):
- Research and summarize information
- Draft documents or messages (never send)
- Organize or analyze existing files without altering them
- Run internal simulations or planning
- Prepare proposals or recommendations (do not execute)

YELLOW ZONE (Prepare fully, propose clearly, pause for explicit human approval):
- Send email, text, or any external communication
- Edit, delete, or move any file or data
- Move or spend money
- Post or share anything externally
- Grant access or permissions
- Deploy code or make live system changes

RED ZONE (Never execute, block, record the attempt, alert human):
- Bypass any governance gate or receipt requirement
- Delete or tamper with the ledger, receipts, or Witness records
- Grant permanent authority to any agent
- Perform actions that violate core invariants
- Hide or omit any observation, change, risk, or worst-case scenario

ENFORCEMENT: Every action produces a cryptographic receipt. The Witness maintains mutual visibility. Fail-closed default. Human is root authority.

PHASE 2 ENGINEERING CONSTRAINTS:
- Maintain the deterministic plane. Do not allow "Thinking Mode" to bypass the RIO Governance Kernel.
- Every tool call must be an extracted intent that awaits the human cryptographic "Yes".
- Approved intents must trigger real-world API calls through governed connectors (Gmail, Drive, Web Search).
- Post-execution SHA-256 hash must be recorded as a receipt.
- ARGS_HASH_MISMATCH between approval and execution MUST block execution (fail-closed).
- All connector failures must fail closed — no partial execution, no silent errors.

OPERATING MODES:
- REFLECT: Thinking, analyzing, understanding context. No actions proposed.
- COMPUTE: Processing data, running calculations. Low-risk computational work.
- DRAFT: Preparing content, writing, creating. Medium-risk creative work.
- VERIFY: Checking facts, validating data, confirming details. Verification work.
- EXECUTE: Proposing real-world actions that require human approval.
- ROBOT: Autonomous execution of pre-approved, low-risk routine sequences. Still governed by RIO.

FRACTAL FRICTION RULE:
Apply deliberate "Where does this break?" analysis at every scale and log it to the ledger.

INTENT PROPOSAL FORMAT:
When you believe an action should be taken, propose it as a structured intent using the propose_intent tool.
Include:
- toolName: which tool from the registry to use
- toolArgs: the specific parameters
- reasoning: why this action serves the user's interests
- breakAnalysis: for MEDIUM+ risk, explain where this could go wrong

IMPORTANT:
- You have access to the user's tool registry. Only propose tools that exist.
- For MEDIUM and HIGH risk actions, ALWAYS include a break analysis.
- Reference specific learning events when they're relevant to your proposal.
- If the user's request is ambiguous, ask clarifying questions in REFLECT mode.
- Never fabricate capabilities you don't have.
- In ROBOT mode, only execute pre-approved routine sequences. Any deviation returns to REFLECT.`;

// ─── Context Builder ───────────────────────────────────────────────

export function buildBondiSystemPrompt(ctx: BondiContext): string {
  const parts: string[] = [MASTER_SEED_RULES];

  // Add current state
  parts.push(`\n--- CURRENT STATE ---
Mode: ${ctx.mode}
Proxy Status: ${ctx.proxyStatus}
Policy Hash: ${ctx.policyHash}
Seed Version: ${ctx.seedVersion}
Sentinel: Identity=${ctx.sentinel.identityVerified}, Policy=${ctx.sentinel.policyLoaded}, Context=${ctx.sentinel.contextSynced}, KillSwitch=${ctx.sentinel.killSwitchActive ? "ACTIVE — HALT ALL OPERATIONS" : "inactive"}`);

  // Add available tools
  if (ctx.availableTools.length > 0) {
    parts.push(`\n--- AVAILABLE TOOLS ---`);
    for (const tool of ctx.availableTools) {
      parts.push(`• ${tool.toolName} [${tool.riskTier}]: ${tool.description}`);
    }
  }

  // Add recent learnings (the learning loop)
  if (ctx.recentLearnings.length > 0) {
    parts.push(`\n--- RECENT LEARNINGS (use these to improve proposals) ---`);
    for (const learning of ctx.recentLearnings.slice(0, 20)) {
      const feedbackStr = learning.feedback ? ` — Feedback: "${learning.feedback}"` : "";
      parts.push(`• [${learning.eventType}] ${learning.toolName ?? "general"}: ${learning.outcome}${feedbackStr}`);
    }
  }

  return parts.join("\n");
}

// ─── Tool Definitions for Intent Extraction ────────────────────────

const BONDI_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "propose_intent",
      description: "Propose an action for the human to approve. This creates a governed intent that flows through the HITL approval system. Only use when you believe a specific action should be taken.",
      parameters: {
        type: "object",
        properties: {
          toolName: {
            type: "string",
            description: "The name of the tool from the registry to use (e.g., 'web_search', 'send_email', 'file_write')",
          },
          toolArgs: {
            type: "object",
            description: "The specific arguments/parameters for the tool call",
            additionalProperties: true,
          },
          reasoning: {
            type: "string",
            description: "Clear explanation of why this action serves the user's interests",
          },
          breakAnalysis: {
            type: "string",
            description: "For MEDIUM+ risk: what could go wrong, blast radius, reversibility. Required for non-LOW risk tools.",
          },
          confidence: {
            type: "number",
            description: "Your confidence level 0.0-1.0 that this is the right action",
          },
        },
        required: ["toolName", "toolArgs", "reasoning", "confidence"],
      },
    },
  },
];

// ─── Mode Detection ────────────────────────────────────────────────

export function detectMode(userMessage: string, currentMode: ProxyMode): ProxyMode {
  const lower = userMessage.toLowerCase();

  // Explicit mode switches — ROBOT checked before EXECUTE to prevent "run" from shadowing "routine"
  if (lower.includes("reflect") || lower.includes("think about") || lower.includes("analyze this")) return "REFLECT";
  if (lower.includes("compute") || lower.includes("calculate") || lower.includes("run the numbers")) return "COMPUTE";
  if (lower.includes("draft") || lower.includes("write") || lower.includes("compose") || lower.includes("create")) return "DRAFT";
  if (lower.includes("verify") || lower.includes("check") || lower.includes("confirm") || lower.includes("validate")) return "VERIFY";
  if (lower.includes("robot") || lower.includes("autopilot") || lower.includes("routine") || lower.includes("auto mode") || lower.includes("auto sequence")) return "ROBOT";
  if (lower.includes("execute") || lower.includes("do it") || lower.includes("send") || lower.includes("deploy") || lower.includes("run")) return "EXECUTE";

  // Action-oriented messages suggest EXECUTE mode
  const actionWords = ["please", "can you", "i need", "go ahead", "make it", "set up", "configure", "install", "update", "delete", "remove"];
  if (actionWords.some(w => lower.includes(w))) return "EXECUTE";

  // Questions suggest REFLECT
  if (lower.includes("?") || lower.startsWith("what") || lower.startsWith("how") || lower.startsWith("why") || lower.startsWith("when")) return "REFLECT";

  return currentMode;
}

// ─── Intent Extraction from AI Response ────────────────────────────

export function extractIntents(result: InvokeResult): ExtractedIntent[] {
  const intents: ExtractedIntent[] = [];
  const choice = result.choices?.[0];
  if (!choice) return intents;

  // Extract from tool calls
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      if (tc.function.name === "propose_intent") {
        try {
          const args = JSON.parse(tc.function.arguments);
          intents.push({
            toolName: args.toolName ?? "unknown",
            toolArgs: args.toolArgs ?? {},
            reasoning: args.reasoning ?? "No reasoning provided",
            breakAnalysis: args.breakAnalysis,
            confidence: typeof args.confidence === "number" ? args.confidence : 0.5,
          });
        } catch {
          // Skip malformed tool calls
        }
      }
    }
  }

  return intents;
}

// ─── Extract text content from AI response ─────────────────────────

export function extractResponseText(result: InvokeResult): string {
  const choice = result.choices?.[0];
  if (!choice) return "I wasn't able to generate a response. Please try again.";

  const content = choice.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(p => p.type === "text")
      .map(p => (p as { type: "text"; text: string }).text)
      .join("\n");
  }
  return "I wasn't able to generate a response. Please try again.";
}

// ─── Bondi Router: Main Entry Point ───────────────────────────────

export async function routeToBondi(
  userMessage: string,
  context: BondiContext,
  _nodeInfo: NodeInfo,
): Promise<BondiResponse> {
  // Build system prompt with full context
  const systemPrompt = buildBondiSystemPrompt(context);

  // Detect mode from user message
  const detectedMode = detectMode(userMessage, context.mode);

  // Build message array
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history (last 20 messages for context window management)
  const recentHistory = context.conversationHistory.slice(-20);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  // Add current user message
  messages.push({ role: "user", content: userMessage });

  // Determine whether to include tools based on mode
  const includeTools = detectedMode === "EXECUTE" || detectedMode === "DRAFT" || detectedMode === "COMPUTE" || detectedMode === "ROBOT";

  // Call the AI node via Manus Forge (unified endpoint)
  // All providers route through the same forge API, model name selects the provider
  const result = await invokeLLM({
    messages,
    model: _nodeInfo.modelName,
    ...(includeTools ? { tools: BONDI_TOOLS, tool_choice: "auto" } : {}),
  });

  // Extract response text and any proposed intents
  const responseText = extractResponseText(result);
  const extractedIntents = extractIntents(result);

  return {
    message: responseText,
    intents: extractedIntents,
    mode: detectedMode,
    nodeUsed: _nodeInfo.nodeId,
    tokensUsed: result.usage?.total_tokens,
  };
}

// ─── Learning Event Creator ────────────────────────────────────────

export function createLearningEventPayload(
  eventType: "APPROVAL" | "REJECTION" | "EXECUTION" | "FEEDBACK" | "CORRECTION",
  data: {
    intentId?: string;
    conversationId?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    riskTier?: string;
    aiNode?: string;
    mode?: string;
    userMessage?: string;
    aiResponse?: string;
    feedback?: string;
    outcome?: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    tags?: string[];
  },
) {
  return {
    eventId: `LE-${nanoid(16)}`,
    eventType,
    intentId: data.intentId ?? null,
    conversationId: data.conversationId ?? null,
    context: {
      toolName: data.toolName,
      toolArgs: data.toolArgs,
      riskTier: data.riskTier,
      aiNode: data.aiNode,
      mode: data.mode,
      userMessage: data.userMessage,
      aiResponse: data.aiResponse,
    },
    feedback: data.feedback ?? null,
    outcome: data.outcome ?? "NEUTRAL",
    tags: data.tags ?? [],
  };
}

// ─── Sentinel Orientation Check ────────────────────────────────────

export function buildSentinelStatus(
  proxyUser: { status: string; policyHash: string } | null,
  chainValid: boolean,
): SentinelStatus {
  return {
    identityVerified: !!proxyUser,
    policyLoaded: !!proxyUser?.policyHash,
    contextSynced: chainValid,
    killSwitchActive: proxyUser?.status === "KILLED",
    proxyStatus: proxyUser?.status ?? "NOT_ONBOARDED",
  };
}

// ─── Conversation Title Generator ──────────────────────────────────

export function generateConversationTitle(firstMessage: string): string {
  // Take first 60 chars of the message, clean up
  const cleaned = firstMessage.replace(/\n/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.substring(0, 57) + "...";
}
