/**
 * AGENT ADAPTER LAYER
 * ═══════════════════
 * The bridge between RIO governance and external AI agents.
 *
 * Architecture (Phase 1 — Brian's decision):
 *   RIO holds ALL API keys. RIO is the SOLE executor.
 *   External agents are BRAINS, not HANDS.
 *   Agents receive an approved intent, decide HOW to do it,
 *   and return a structured ActionRequest. RIO then executes
 *   that ActionRequest through its own connectors.
 *
 * Flow:
 *   Approved Intent → Agent Adapter → ActionRequest → RIO Connector → Real World
 *
 * The agent never sees API keys. The agent never touches infrastructure.
 * The agent thinks. RIO acts. Mantis records.
 *
 * Adapter Registry:
 *   - openai: OpenAI GPT-4o via function calling
 *   - claude: Anthropic Claude via tool use
 *   - gemini: Google Gemini via function calling (future)
 *   - manus: Manus agent delegation (future)
 */

import { invokeLLM, type Tool, type Message } from "./_core/llm";
import { ENV } from "./_core/env";

// ─── Types ─────────────────────────────────────────────────────

/**
 * What RIO gives to the agent: the approved intent context.
 * The agent uses this to decide HOW to perform the task.
 */
export type AgentInput = {
  intentId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  reflection?: string;
  userContext?: string; // optional natural language context from the conversation
  taskType?: TaskType; // structured task category for routing
};

// ─── Task Types ──────────────────────────────────────────────

/**
 * Structured task categories for agent routing.
 * These help the system recommend which agent is best suited for a task.
 */
export type TaskType =
  | "write_draft"       // Write / Draft — composing text, emails, documents
  | "summarize_analyze" // Summarize / Analyze — reading, extracting, interpreting
  | "communicate"       // Communicate — sending emails, messages, notifications
  | "schedule_calendar" // Schedule / Calendar — meetings, reminders, events
  | "file_document"     // File / Document — creating, reading, organizing files
  | "search_research"   // Search / Research — web search, information gathering
  | "general";          // General — anything that doesn't fit above

export const TASK_TYPES: Array<{ id: TaskType; label: string; description: string }> = [
  { id: "write_draft", label: "Write / Draft", description: "Compose text, emails, documents, or creative content" },
  { id: "summarize_analyze", label: "Summarize / Analyze", description: "Read, extract, interpret, or summarize information" },
  { id: "communicate", label: "Communicate", description: "Send emails, messages, or notifications" },
  { id: "schedule_calendar", label: "Schedule / Calendar", description: "Manage meetings, reminders, or calendar events" },
  { id: "file_document", label: "File / Document", description: "Create, read, or organize files and documents" },
  { id: "search_research", label: "Search / Research", description: "Search the web or gather information" },
  { id: "general", label: "General", description: "Any other task" },
];

/**
 * Infer the task type from a tool name.
 */
export function inferTaskType(toolName: string): TaskType {
  const t = toolName.toLowerCase();
  if (t.includes("draft") || t.includes("write") || t.includes("compose")) return "write_draft";
  if (t.includes("email") || t.includes("sms") || t.includes("send") || t.includes("notify") || t.includes("message")) return "communicate";
  if (t.includes("schedule") || t.includes("calendar") || t.includes("meeting") || t.includes("event")) return "schedule_calendar";
  // file/drive BEFORE summarize/read so "drive_read" → file_document, not summarize_analyze
  if (t.includes("file") || t.includes("drive") || t.includes("document") || t.includes("upload")) return "file_document";
  if (t.includes("summarize") || t.includes("analyze") || t.includes("read")) return "summarize_analyze";
  if (t.includes("search") || t.includes("web") || t.includes("research") || t.includes("lookup")) return "search_research";
  return "general";
}

// ─── Agent Recommendation ────────────────────────────────────

/**
 * Agent recommendation — suggests which agent is best for a task.
 * Brian still chooses. This is advisory only.
 */
export type AgentRecommendation = {
  recommendedAgentId: string;
  reason: string;
  confidence: number; // 0.0–1.0
  alternatives: Array<{ agentId: string; reason: string }>;
};

/**
 * Recommend the best agent for a given task type and tool.
 * This is a rule-based engine for now — can be upgraded to ML later.
 */
export function recommendAgent(taskType: TaskType, toolName: string): AgentRecommendation {
  // Direct execution tasks — no agent needed
  const directTools = ["web_search", "drive_read", "drive_search"];
  if (directTools.includes(toolName)) {
    return {
      recommendedAgentId: "passthrough",
      reason: `${toolName} is a straightforward action — direct execution is fastest.`,
      confidence: 0.95,
      alternatives: [
        { agentId: "openai", reason: "Could refine search queries for better results." },
        { agentId: "claude", reason: "Could analyze context to improve the query." },
      ],
    };
  }

  // Task-type based recommendations
  switch (taskType) {
    case "write_draft":
      return {
        recommendedAgentId: "claude",
        reason: "Claude excels at nuanced, well-structured writing and drafting.",
        confidence: 0.85,
        alternatives: [
          { agentId: "openai", reason: "GPT-4o is strong at creative and varied writing styles." },
          { agentId: "passthrough", reason: "Use the original text as-is without agent refinement." },
        ],
      };

    case "summarize_analyze":
      return {
        recommendedAgentId: "claude",
        reason: "Claude is strong at careful analysis and faithful summarization.",
        confidence: 0.85,
        alternatives: [
          { agentId: "openai", reason: "GPT-4o handles analysis well with broad knowledge." },
          { agentId: "passthrough", reason: "Skip analysis and execute directly." },
        ],
      };

    case "communicate":
      return {
        recommendedAgentId: "openai",
        reason: "GPT-4o is fast and reliable for composing clear communications.",
        confidence: 0.80,
        alternatives: [
          { agentId: "claude", reason: "Claude writes more thoughtful, nuanced messages." },
          { agentId: "passthrough", reason: "Send the message exactly as written." },
        ],
      };

    case "schedule_calendar":
      return {
        recommendedAgentId: "passthrough",
        reason: "Calendar actions are structured — direct execution is most reliable.",
        confidence: 0.90,
        alternatives: [
          { agentId: "openai", reason: "Could help parse natural language scheduling requests." },
          { agentId: "claude", reason: "Could help resolve scheduling conflicts." },
        ],
      };

    case "file_document":
      return {
        recommendedAgentId: "openai",
        reason: "GPT-4o handles file operations and document formatting efficiently.",
        confidence: 0.75,
        alternatives: [
          { agentId: "claude", reason: "Better for document content that needs careful writing." },
          { agentId: "passthrough", reason: "Execute the file operation directly." },
        ],
      };

    case "search_research":
      return {
        recommendedAgentId: "passthrough",
        reason: "Search is a direct action — execute immediately for fastest results.",
        confidence: 0.90,
        alternatives: [
          { agentId: "openai", reason: "Could refine search queries for better results." },
          { agentId: "claude", reason: "Could formulate more precise research queries." },
        ],
      };

    case "general":
    default:
      return {
        recommendedAgentId: "openai",
        reason: "GPT-4o is a strong general-purpose agent for varied tasks.",
        confidence: 0.70,
        alternatives: [
          { agentId: "claude", reason: "Better for tasks requiring careful reasoning." },
          { agentId: "passthrough", reason: "Execute directly without agent involvement." },
        ],
      };
  }
}

/**
 * What the agent returns: a structured action request.
 * This tells RIO exactly what to execute through its connectors.
 * The agent may refine, enhance, or restructure the original args.
 */
export type ActionRequest = {
  connectorName: string;        // which RIO connector to use (e.g., "send_email")
  connectorArgs: Record<string, unknown>; // refined args for the connector
  agentReasoning: string;       // why the agent chose this approach
  confidence: number;           // 0.0–1.0
  modifications?: string;      // what the agent changed from the original args and why
};

/**
 * The full response from an agent adapter.
 */
export type AgentAdapterResult = {
  success: boolean;
  actionRequest?: ActionRequest;
  error?: string;
  agentId: string;              // which adapter handled this
  agentModel: string;           // which model was used
  tokensUsed?: number;
  processingTimeMs: number;
};

/**
 * The contract every agent adapter must implement.
 * Input: approved intent context.
 * Output: structured action request for RIO to execute.
 */
export type AgentAdapter = {
  id: string;
  displayName: string;
  provider: string;
  /** Process an approved intent and return a structured action request */
  processIntent: (input: AgentInput) => Promise<AgentAdapterResult>;
};

// ─── Adapter Registry ──────────────────────────────────────────

const adapters = new Map<string, AgentAdapter>();

export function registerAdapter(adapter: AgentAdapter) {
  adapters.set(adapter.id, adapter);
}

export function getAdapter(adapterId: string): AgentAdapter | undefined {
  return adapters.get(adapterId);
}

export function listAdapters(): Array<{ id: string; displayName: string; provider: string }> {
  return Array.from(adapters.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    provider: a.provider,
  }));
}

// ─── Tool Definitions for Agent Function Calling ───────────────

/**
 * These are the tools that external agents can "call" — but they're
 * really just structured action requests that RIO will execute.
 * The agent sees these as available actions and returns a structured
 * call that RIO then dispatches through its own connectors.
 */
const AGENT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a recipient. RIO will execute this through its email connector.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Draft an email without sending it. Returns the draft for review.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content" },
        },
        required: ["subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send an SMS text message. RIO will execute this through its SMS connector.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 format" },
          body: { type: "string", description: "SMS message content" },
        },
        required: ["to", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information on a topic.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_read",
      description: "Read a file from Google Drive.",
      parameters: {
        type: "object",
        properties: {
          fileId: { type: "string", description: "Google Drive file ID" },
          fileName: { type: "string", description: "File name to search for" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_search",
      description: "Search Google Drive for files matching a query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for Drive files" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_write",
      description: "Write or create a file on Google Drive.",
      parameters: {
        type: "object",
        properties: {
          fileName: { type: "string", description: "Name for the file" },
          content: { type: "string", description: "File content" },
          mimeType: { type: "string", description: "MIME type of the file" },
        },
        required: ["fileName", "content"],
      },
    },
  },
];

// ─── OpenAI Adapter ────────────────────────────────────────────

/**
 * The first agent adapter. Uses OpenAI GPT-4o via Manus Forge
 * to process approved intents and return structured action requests.
 *
 * The agent receives:
 *   - The approved intent (what the user wants done)
 *   - Available RIO tools (what actions RIO can execute)
 *   - Context about the task
 *
 * The agent returns:
 *   - A function call specifying which RIO connector to use and with what args
 *   - Reasoning about why it chose this approach
 *
 * The agent NEVER gets API keys. The agent NEVER executes directly.
 */
async function openaiProcessIntent(input: AgentInput): Promise<AgentAdapterResult> {
  const startTime = Date.now();

  const systemPrompt = `You are an AI agent working within the RIO governance system.
You have been given an approved intent — a task that a human has authorized.
Your job is to decide HOW to best accomplish this task using the available tools.

RULES:
1. You CANNOT execute anything directly. You return a structured action request.
2. RIO will execute your action request through its own secure connectors.
3. You should refine and improve the original request if possible (better subject lines, clearer body text, etc.)
4. Always explain your reasoning.
5. If the original args are already good, use them as-is.
6. You MUST call exactly one tool function to specify the action.

CONTEXT:
- Intent ID: ${input.intentId}
- Tool requested: ${input.toolName}
- Risk tier: ${input.riskTier}
${input.reflection ? `- User's note: ${input.reflection}` : ""}
${input.userContext ? `- Conversation context: ${input.userContext}` : ""}`;

  const userMessage = `The human has approved this action:

Tool: ${input.toolName}
Arguments: ${JSON.stringify(input.toolArgs, null, 2)}

Please process this intent and call the appropriate tool function with the best arguments to accomplish this task. You may refine the arguments to improve quality (e.g., better wording, formatting) while preserving the user's intent.`;

  try {
    const result = await invokeLLM({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt } as Message,
        { role: "user", content: userMessage } as Message,
      ],
      tools: AGENT_TOOLS,
      tool_choice: "auto",
    });

    const choice = result.choices?.[0];
    if (!choice) {
      return {
        success: false,
        error: "No response from OpenAI agent",
        agentId: "openai",
        agentModel: "gpt-4o",
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Extract the tool call (the agent's action request)
    const toolCall = choice.message.tool_calls?.[0];
    if (!toolCall) {
      // Agent responded with text instead of a tool call — extract reasoning
      const textContent = typeof choice.message.content === "string"
        ? choice.message.content
        : Array.isArray(choice.message.content)
          ? choice.message.content.filter(p => p.type === "text").map(p => (p as { type: "text"; text: string }).text).join("\n")
          : "";

      // Fall back to using the original intent args with the original connector
      return {
        success: true,
        actionRequest: {
          connectorName: input.toolName,
          connectorArgs: input.toolArgs,
          agentReasoning: textContent || "Agent confirmed the original action without modifications.",
          confidence: 0.8,
          modifications: "None — agent used original args as-is.",
        },
        agentId: "openai",
        agentModel: "gpt-4o",
        tokensUsed: result.usage?.total_tokens,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Parse the tool call arguments
    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      return {
        success: false,
        error: "Failed to parse agent tool call arguments",
        agentId: "openai",
        agentModel: "gpt-4o",
        tokensUsed: result.usage?.total_tokens,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Extract any text reasoning the agent provided alongside the tool call
    const textContent = typeof choice.message.content === "string"
      ? choice.message.content
      : Array.isArray(choice.message.content)
        ? choice.message.content.filter(p => p.type === "text").map(p => (p as { type: "text"; text: string }).text).join("\n")
        : "";

    // Determine what the agent changed
    const originalArgsStr = JSON.stringify(input.toolArgs);
    const newArgsStr = JSON.stringify(parsedArgs);
    const wasModified = originalArgsStr !== newArgsStr;

    return {
      success: true,
      actionRequest: {
        connectorName: toolCall.function.name,
        connectorArgs: parsedArgs,
        agentReasoning: textContent || `Agent processed the ${input.toolName} intent and prepared the action request.`,
        confidence: 0.9,
        modifications: wasModified
          ? `Agent refined the arguments for better quality. Original tool: ${input.toolName}, Agent chose: ${toolCall.function.name}.`
          : "No modifications — agent confirmed the original args are appropriate.",
      },
      agentId: "openai",
      agentModel: "gpt-4o",
      tokensUsed: result.usage?.total_tokens,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `AGENT_ERROR: OpenAI adapter failed: ${msg}`,
      agentId: "openai",
      agentModel: "gpt-4o",
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ─── Claude Adapter (Anthropic) ───────────────────────────────

/**
 * Claude adapter. Uses Anthropic Claude via the Anthropic Messages API.
 * Same contract as OpenAI: receives approved intent, returns structured action request.
 * Claude uses "tool_use" content blocks instead of OpenAI's tool_calls.
 *
 * We call the Anthropic API directly using ENV.anthropicApiKey.
 * If no Anthropic key is available, falls back to Forge (which can route to Claude models).
 */

/** Convert our AGENT_TOOLS format to Anthropic's tool format */
function toAnthropicTools(tools: Tool[]): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description || "",
    input_schema: t.function.parameters || { type: "object", properties: {} },
  }));
}

async function claudeProcessIntent(input: AgentInput): Promise<AgentAdapterResult> {
  const startTime = Date.now();

  const systemPrompt = `You are an AI agent working within the RIO governance system.
You have been given an approved intent — a task that a human has authorized.
Your job is to decide HOW to best accomplish this task using the available tools.

RULES:
1. You CANNOT execute anything directly. You return a structured action request.
2. RIO will execute your action request through its own secure connectors.
3. You should refine and improve the original request if possible (better subject lines, clearer body text, etc.)
4. Always explain your reasoning.
5. If the original args are already good, use them as-is.
6. You MUST use exactly one tool to specify the action.

CONTEXT:
- Intent ID: ${input.intentId}
- Tool requested: ${input.toolName}
- Risk tier: ${input.riskTier}
${input.taskType ? `- Task type: ${input.taskType}` : ""}
${input.reflection ? `- User's note: ${input.reflection}` : ""}
${input.userContext ? `- Conversation context: ${input.userContext}` : ""}`;

  const userMessage = `The human has approved this action:

Tool: ${input.toolName}
Arguments: ${JSON.stringify(input.toolArgs, null, 2)}

Please process this intent and use the appropriate tool with the best arguments to accomplish this task. You may refine the arguments to improve quality while preserving the user's intent.`;

  try {
    // Try direct Anthropic API if key is available
    if (ENV.anthropicApiKey) {
      return await callAnthropicDirect(input, systemPrompt, userMessage, startTime);
    }

    // Fallback: use Forge with claude model name
    return await callClaudeViaForge(input, systemPrompt, userMessage, startTime);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `AGENT_ERROR: Claude adapter failed: ${msg}`,
      agentId: "claude",
      agentModel: "claude-sonnet-4-20250514",
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/** Call Anthropic Messages API directly */
async function callAnthropicDirect(
  input: AgentInput,
  systemPrompt: string,
  userMessage: string,
  startTime: number,
): Promise<AgentAdapterResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools: toAnthropicTools(AGENT_TOOLS),
      tool_choice: { type: "auto" },
      messages: [
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const result = await response.json() as {
    id: string;
    model: string;
    content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
    stop_reason?: string;
  };

  // Extract tool use block
  const toolUse = result.content.find(b => b.type === "tool_use");
  const textBlocks = result.content.filter(b => b.type === "text").map(b => b.text || "").join("\n");
  const totalTokens = result.usage ? result.usage.input_tokens + result.usage.output_tokens : undefined;

  if (!toolUse || !toolUse.name || !toolUse.input) {
    // Claude responded with text only — use original args
    return {
      success: true,
      actionRequest: {
        connectorName: input.toolName,
        connectorArgs: input.toolArgs,
        agentReasoning: textBlocks || "Claude confirmed the original action without modifications.",
        confidence: 0.8,
        modifications: "None — Claude used original args as-is.",
      },
      agentId: "claude",
      agentModel: result.model || "claude-sonnet-4-20250514",
      tokensUsed: totalTokens,
      processingTimeMs: Date.now() - startTime,
    };
  }

  const parsedArgs = toolUse.input as Record<string, unknown>;
  const originalArgsStr = JSON.stringify(input.toolArgs);
  const newArgsStr = JSON.stringify(parsedArgs);
  const wasModified = originalArgsStr !== newArgsStr;

  return {
    success: true,
    actionRequest: {
      connectorName: toolUse.name,
      connectorArgs: parsedArgs,
      agentReasoning: textBlocks || `Claude processed the ${input.toolName} intent and prepared the action request.`,
      confidence: 0.9,
      modifications: wasModified
        ? `Claude refined the arguments for better quality. Original tool: ${input.toolName}, Claude chose: ${toolUse.name}.`
        : "No modifications — Claude confirmed the original args are appropriate.",
    },
    agentId: "claude",
    agentModel: result.model || "claude-sonnet-4-20250514",
    tokensUsed: totalTokens,
    processingTimeMs: Date.now() - startTime,
  };
}

/** Fallback: call Claude through Manus Forge (OpenAI-compatible endpoint) */
async function callClaudeViaForge(
  input: AgentInput,
  systemPrompt: string,
  userMessage: string,
  startTime: number,
): Promise<AgentAdapterResult> {
  const result = await invokeLLM({
    model: "claude-sonnet-4-20250514",
    messages: [
      { role: "system", content: systemPrompt } as Message,
      { role: "user", content: userMessage } as Message,
    ],
    tools: AGENT_TOOLS,
    tool_choice: "auto",
  });

  const choice = result.choices?.[0];
  if (!choice) {
    return {
      success: false,
      error: "No response from Claude agent (via Forge)",
      agentId: "claude",
      agentModel: "claude-sonnet-4-20250514",
      processingTimeMs: Date.now() - startTime,
    };
  }

  const toolCall = choice.message.tool_calls?.[0];
  const textContent = typeof choice.message.content === "string"
    ? choice.message.content
    : Array.isArray(choice.message.content)
      ? choice.message.content.filter(p => p.type === "text").map(p => (p as { type: "text"; text: string }).text).join("\n")
      : "";

  if (!toolCall) {
    return {
      success: true,
      actionRequest: {
        connectorName: input.toolName,
        connectorArgs: input.toolArgs,
        agentReasoning: textContent || "Claude confirmed the original action without modifications.",
        confidence: 0.8,
        modifications: "None — Claude used original args as-is.",
      },
      agentId: "claude",
      agentModel: result.model || "claude-sonnet-4-20250514",
      tokensUsed: result.usage?.total_tokens,
      processingTimeMs: Date.now() - startTime,
    };
  }

  let parsedArgs: Record<string, unknown>;
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    return {
      success: false,
      error: "Failed to parse Claude tool call arguments",
      agentId: "claude",
      agentModel: result.model || "claude-sonnet-4-20250514",
      tokensUsed: result.usage?.total_tokens,
      processingTimeMs: Date.now() - startTime,
    };
  }

  const originalArgsStr = JSON.stringify(input.toolArgs);
  const newArgsStr = JSON.stringify(parsedArgs);
  const wasModified = originalArgsStr !== newArgsStr;

  return {
    success: true,
    actionRequest: {
      connectorName: toolCall.function.name,
      connectorArgs: parsedArgs,
      agentReasoning: textContent || `Claude processed the ${input.toolName} intent and prepared the action request.`,
      confidence: 0.9,
      modifications: wasModified
        ? `Claude refined the arguments. Original tool: ${input.toolName}, Claude chose: ${toolCall.function.name}.`
        : "No modifications — Claude confirmed the original args are appropriate.",
    },
    agentId: "claude",
    agentModel: result.model || "claude-sonnet-4-20250514",
    tokensUsed: result.usage?.total_tokens,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Passthrough adapter — no external agent involved.
 * The original intent args are used directly by RIO connectors.
 * This is the default when no agent is selected.
 */
async function passthroughProcessIntent(input: AgentInput): Promise<AgentAdapterResult> {
  return {
    success: true,
    actionRequest: {
      connectorName: input.toolName,
      connectorArgs: input.toolArgs,
      agentReasoning: "Direct execution — no external agent involved. RIO connectors handle this directly.",
      confidence: 1.0,
      modifications: "None — passthrough mode.",
    },
    agentId: "passthrough",
    agentModel: "none",
    processingTimeMs: 0,
  };
}

// ─── Register Adapters ─────────────────────────────────────────

const openaiAdapter: AgentAdapter = {
  id: "openai",
  displayName: "OpenAI GPT-4o",
  provider: "OPENAI",
  processIntent: openaiProcessIntent,
};

const claudeAdapter: AgentAdapter = {
  id: "claude",
  displayName: "Claude Sonnet",
  provider: "ANTHROPIC",
  processIntent: claudeProcessIntent,
};

const passthroughAdapter: AgentAdapter = {
  id: "passthrough",
  displayName: "Direct (No Agent)",
  provider: "RIO",
  processIntent: passthroughProcessIntent,
};

export function initializeAdapters() {
  registerAdapter(openaiAdapter);
  registerAdapter(claudeAdapter);
  registerAdapter(passthroughAdapter);
}

// Auto-initialize on import
initializeAdapters();
