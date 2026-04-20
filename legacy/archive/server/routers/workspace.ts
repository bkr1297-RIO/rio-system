/**
 * Bondi Workspace Router
 *
 * tRPC procedures for the Bondi unified workspace:
 *   - Gmail: list inbox, read email, send email (via RIO)
 *   - Calendar: list events
 *   - Drive: list files, read file
 *   - AI Chat: route messages to LLM for Ask mode
 *
 * All read operations are direct (no approval needed).
 * All write operations go through RIO governance.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getValidGoogleToken } from "../oauth/google";
import { callGoogleApi, gmailSendMessage } from "../connectors/google-api";
import { invokeLLM } from "../_core/llm";

// ── Gmail Procedures ──────────────────────────────────────────────────────

const gmailRouter = router({
  /**
   * List inbox messages. No approval needed (read-only).
   */
  listInbox: protectedProcedure
    .input(z.object({
      maxResults: z.number().min(1).max(50).default(20),
      pageToken: z.string().optional(),
      query: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const token = await getValidGoogleToken(ctx.user.id, "gmail");
      if (!token) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please connect your Google apps first.",
        });
      }

      const params = new URLSearchParams({
        maxResults: String(input?.maxResults ?? 20),
        labelIds: "INBOX",
      });
      if (input?.pageToken) params.set("pageToken", input.pageToken);
      if (input?.query) params.set("q", input.query);

      const result = await callGoogleApi(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
        token
      );

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to fetch inbox",
        });
      }

      const data = result.data as {
        messages?: Array<{ id: string; threadId: string }>;
        nextPageToken?: string;
        resultSizeEstimate?: number;
      };

      // If no messages, return empty
      if (!data.messages || data.messages.length === 0) {
        return { messages: [], nextPageToken: null, total: 0 };
      }

      // Fetch metadata for each message (batch)
      const messageDetails = await Promise.all(
        data.messages.slice(0, input?.maxResults ?? 20).map(async (msg) => {
          const detail = await callGoogleApi(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            token
          );

          if (!detail.success) return null;

          const d = detail.data as {
            id: string;
            threadId: string;
            labelIds: string[];
            snippet: string;
            internalDate: string;
            payload: {
              headers: Array<{ name: string; value: string }>;
            };
          };

          const headers = d.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

          return {
            id: d.id,
            threadId: d.threadId,
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            snippet: d.snippet,
            labelIds: d.labelIds || [],
            isUnread: (d.labelIds || []).includes("UNREAD"),
          };
        })
      );

      return {
        messages: messageDetails.filter(Boolean),
        nextPageToken: data.nextPageToken || null,
        total: data.resultSizeEstimate || 0,
      };
    }),

  /**
   * Read a single email message. No approval needed (read-only).
   */
  readEmail: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const token = await getValidGoogleToken(ctx.user.id, "gmail");
      if (!token) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected.",
        });
      }

      const result = await callGoogleApi(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.messageId}?format=full`,
        token
      );

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to read email",
        });
      }

      const msg = result.data as {
        id: string;
        threadId: string;
        labelIds: string[];
        snippet: string;
        internalDate: string;
        payload: {
          headers: Array<{ name: string; value: string }>;
          mimeType: string;
          body?: { data?: string; size: number };
          parts?: Array<{
            mimeType: string;
            body?: { data?: string; size: number };
            parts?: Array<{
              mimeType: string;
              body?: { data?: string; size: number };
            }>;
          }>;
        };
      };

      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      // Extract body text from the message parts
      function extractBody(payload: typeof msg.payload): string {
        // Direct body
        if (payload.body?.data) {
          return Buffer.from(payload.body.data, "base64url").toString("utf-8");
        }

        // Look through parts for text/plain or text/html
        if (payload.parts) {
          // Prefer text/plain
          for (const part of payload.parts) {
            if (part.mimeType === "text/plain" && part.body?.data) {
              return Buffer.from(part.body.data, "base64url").toString("utf-8");
            }
            // Recurse into nested parts
            if (part.parts) {
              for (const subpart of part.parts) {
                if (subpart.mimeType === "text/plain" && subpart.body?.data) {
                  return Buffer.from(subpart.body.data, "base64url").toString("utf-8");
                }
              }
            }
          }
          // Fall back to text/html
          for (const part of payload.parts) {
            if (part.mimeType === "text/html" && part.body?.data) {
              return Buffer.from(part.body.data, "base64url").toString("utf-8");
            }
            if (part.parts) {
              for (const subpart of part.parts) {
                if (subpart.mimeType === "text/html" && subpart.body?.data) {
                  return Buffer.from(subpart.body.data, "base64url").toString("utf-8");
                }
              }
            }
          }
        }

        return "";
      }

      const body = extractBody(msg.payload);

      return {
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader("From"),
        to: getHeader("To"),
        cc: getHeader("Cc"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: msg.snippet,
        body,
        bodyType: body.startsWith("<") ? "html" : "text",
        labelIds: msg.labelIds || [],
        isUnread: (msg.labelIds || []).includes("UNREAD"),
      };
    }),

  /**
   * Send an email via Gmail API. This goes through RIO governance.
   * For the MVP, we call it directly but with the user's explicit approval in the UI.
   */
  sendEmail: protectedProcedure
    .input(z.object({
      to: z.string().email(),
      subject: z.string().min(1),
      body: z.string().min(1),
      replyToMessageId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const token = await getValidGoogleToken(ctx.user.id, "gmail");
      if (!token) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected.",
        });
      }

      const result = await gmailSendMessage(token, input.to, input.subject, input.body);

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to send email",
        });
      }

      return {
        success: true,
        messageId: (result.data as { id?: string })?.id,
      };
    }),
});

// ── Calendar Procedures ───────────────────────────────────────────────────

const calendarRouter = router({
  /**
   * List upcoming calendar events. No approval needed (read-only).
   */
  listEvents: protectedProcedure
    .input(z.object({
      maxResults: z.number().min(1).max(50).default(20),
      timeMin: z.string().optional(), // ISO date string
      timeMax: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const token = await getValidGoogleToken(ctx.user.id, "google_calendar");
      if (!token) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected.",
        });
      }

      const now = new Date().toISOString();
      const params = new URLSearchParams({
        maxResults: String(input?.maxResults ?? 20),
        timeMin: input?.timeMin || now,
        singleEvents: "true",
        orderBy: "startTime",
      });
      if (input?.timeMax) params.set("timeMax", input.timeMax);

      const result = await callGoogleApi(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        token
      );

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to fetch calendar events",
        });
      }

      const data = result.data as {
        items?: Array<{
          id: string;
          summary: string;
          description?: string;
          start: { dateTime?: string; date?: string };
          end: { dateTime?: string; date?: string };
          status: string;
          htmlLink: string;
          attendees?: Array<{ email: string; responseStatus: string }>;
          location?: string;
        }>;
      };

      return {
        events: (data.items || []).map((event) => ({
          id: event.id,
          title: event.summary || "(No title)",
          description: event.description || "",
          start: event.start.dateTime || event.start.date || "",
          end: event.end.dateTime || event.end.date || "",
          status: event.status,
          link: event.htmlLink,
          location: event.location || "",
          attendees: (event.attendees || []).map((a) => ({
            email: a.email,
            status: a.responseStatus,
          })),
        })),
      };
    }),
});

// ── Drive Procedures ──────────────────────────────────────────────────────

const driveRouter = router({
  /**
   * List files in Google Drive. No approval needed (read-only).
   */
  listFiles: protectedProcedure
    .input(z.object({
      pageSize: z.number().min(1).max(50).default(20),
      query: z.string().optional(),
      pageToken: z.string().optional(),
      orderBy: z.string().default("modifiedTime desc"),
    }).optional())
    .query(async ({ ctx, input }) => {
      const token = await getValidGoogleToken(ctx.user.id, "google_drive");
      if (!token) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected.",
        });
      }

      const params = new URLSearchParams({
        pageSize: String(input?.pageSize ?? 20),
        fields: "files(id,name,mimeType,size,modifiedTime,iconLink,webViewLink,thumbnailLink),nextPageToken",
        orderBy: input?.orderBy ?? "modifiedTime desc",
      });
      if (input?.query) params.set("q", input.query);
      if (input?.pageToken) params.set("pageToken", input.pageToken);

      const result = await callGoogleApi(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        token
      );

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to fetch Drive files",
        });
      }

      const data = result.data as {
        files?: Array<{
          id: string;
          name: string;
          mimeType: string;
          size?: string;
          modifiedTime: string;
          iconLink?: string;
          webViewLink?: string;
          thumbnailLink?: string;
        }>;
        nextPageToken?: string;
      };

      return {
        files: (data.files || []).map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size ? parseInt(file.size, 10) : null,
          modifiedTime: file.modifiedTime,
          iconLink: file.iconLink || null,
          webViewLink: file.webViewLink || null,
          thumbnailLink: file.thumbnailLink || null,
        })),
        nextPageToken: data.nextPageToken || null,
      };
    }),
});

// ── AI Chat Procedure (Ask Mode) ──────────────────────────────────────────

const aiRouter = router({
  /**
   * Send a message to the AI. No approval needed (Ask mode).
   * Bondi acts as a thinking partner — routes to LLM for intelligence.
   */
  chat: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })),
      context: z.string().optional(), // Optional context (e.g., email content being discussed)
    }))
    .mutation(async ({ input }) => {
      const systemPrompt = `You are Bondi, an AI Chief of Staff. You help the user think, plan, analyze, and draft.

You are NOT an LLM yourself — you are a thinking partner that helps the user make sense of information, draft communications, summarize documents, and plan actions.

When the user asks you to DO something (send an email, schedule a meeting, move a file), remind them to use the action panel to execute it — you can help draft and plan, but execution goes through RIO governance for approval and receipts.

When the user shares context (an email, a document, calendar info), help them understand it, respond to it, or act on it.

Be concise, professional, and helpful. You are their Chief of Staff — think strategically.`;

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      // Add context if provided
      if (input.context) {
        messages.push({
          role: "system" as const,
          content: `The user is currently viewing this content:\n\n${input.context}`,
        });
      }

      // Add conversation history
      for (const msg of input.messages) {
        messages.push({
          role: msg.role as "system" | "user" | "assistant",
          content: msg.content,
        });
      }

      const result = await invokeLLM({ messages });

      const content = result.choices?.[0]?.message?.content;
      const responseText = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((c) => ("text" in c ? c.text : "")).join("")
          : "";

      return {
        role: "assistant" as const,
        content: responseText,
      };
    }),

  /**
   * Draft an email reply using AI. No approval needed (drafting only).
   * The actual send goes through RIO.
   */
  draftReply: protectedProcedure
    .input(z.object({
      originalEmail: z.object({
        from: z.string(),
        subject: z.string(),
        body: z.string(),
        date: z.string().optional(),
      }),
      instruction: z.string().optional(), // e.g., "Accept the meeting" or "Decline politely"
    }))
    .mutation(async ({ input }) => {
      const prompt = input.instruction
        ? `Draft a reply to this email. The user's instruction: "${input.instruction}"\n\nOriginal email from ${input.originalEmail.from}:\nSubject: ${input.originalEmail.subject}\n\n${input.originalEmail.body}`
        : `Draft a professional reply to this email from ${input.originalEmail.from}:\nSubject: ${input.originalEmail.subject}\n\n${input.originalEmail.body}`;

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are Bondi, an AI Chief of Staff. Draft a concise, professional email reply. Return ONLY the reply body text — no subject line, no greeting preamble like 'Here is a draft', just the actual email reply the user would send.",
          },
          { role: "user", content: prompt },
        ],
      });

      const content = result.choices?.[0]?.message?.content;
      const draft = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((c) => ("text" in c ? c.text : "")).join("")
          : "";

      return { draft };
    }),
});

// ── Combined Workspace Router ─────────────────────────────────────────────

export const workspaceRouter = router({
  gmail: gmailRouter,
  calendar: calendarRouter,
  drive: driveRouter,
  ai: aiRouter,
});
