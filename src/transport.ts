import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { createServer } from "./server.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

// Periodic cleanup of stale sessions
const cleanupTimer = setInterval(async () => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    if (now - session.lastActivity > config.sessionTtlMs) {
      console.log(`Cleaning up stale session: ${sid}`);
      try {
        await session.transport.close();
      } catch {
        // ignore close errors
      }
      sessions.delete(sid);
    }
  }
}, config.cleanupIntervalMs);

// Don't keep process alive just for cleanup
cleanupTimer.unref();

function touchSession(sid: string) {
  const session = sessions.get(sid);
  if (session) session.lastActivity = Date.now();
}

// Express app
export const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    docsDir: config.docsDir,
    activeSessions: sessions.size,
  });
});

// POST /mcp — main message endpoint
app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    if (sessionId && sessions.has(sessionId)) {
      touchSession(sessionId);
      await sessions.get(sessionId)!.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, lastActivity: Date.now() });
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) sessions.delete(sid);
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session ID" },
      id: null,
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// GET /mcp — SSE stream for server-to-client notifications
app.get("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  try {
    touchSession(sessionId);
    await sessions.get(sessionId)!.transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling GET /mcp:", error);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

// DELETE /mcp — session termination
app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  try {
    await sessions.get(sessionId)!.transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling DELETE /mcp:", error);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

/** Close all sessions — called during graceful shutdown */
export async function closeSessions(): Promise<void> {
  clearInterval(cleanupTimer);
  for (const [sid, session] of sessions) {
    try {
      await session.transport.close();
    } catch {
      // ignore
    }
    sessions.delete(sid);
  }
}
