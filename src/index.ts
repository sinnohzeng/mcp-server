import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

// -------------------------------------------------------------------
// Configuration
// -------------------------------------------------------------------
const DOCS_DIR = path.resolve(
  process.env.DOCS_DIR || path.join(import.meta.dirname, "..", "docs")
);
const PORT = parseInt(process.env.PORT || "3927", 10);

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findMarkdownFiles(fullPath)));
    } else if (entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

// -------------------------------------------------------------------
// Create MCP Server with tools
// -------------------------------------------------------------------
function createServer(): McpServer {
  const server = new McpServer({
    name: "docs-server",
    version: "1.0.0",
  });

  // ---- Tool: list_docs ----
  server.registerTool("list_docs", {
    title: "List Documents",
    description:
      "List all available API reference documents. Returns relative paths organized by provider (feishu, gemini, etc.).",
    inputSchema: z.object({
      provider: z
        .string()
        .optional()
        .describe(
          'Filter by provider name, e.g. "feishu" or "gemini". Omit to list all.'
        ),
    }),
  }, async ({ provider }) => {
    let files = await findMarkdownFiles(DOCS_DIR);
    if (provider) {
      files = files.filter((f) =>
        path.relative(DOCS_DIR, f).startsWith(provider)
      );
    }
    const relativePaths = files.map((f) => path.relative(DOCS_DIR, f));
    return {
      content: [{ type: "text" as const, text: JSON.stringify(relativePaths, null, 2) }],
    };
  });

  // ---- Tool: read_doc ----
  server.registerTool("read_doc", {
    title: "Read Document",
    description:
      "Read the full content of a specific markdown document by its relative path.",
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          'Relative path to the document, e.g. "feishu/消息/发送消息.md"'
        ),
    }),
  }, async ({ path: docPath }) => {
    const fullPath = path.resolve(DOCS_DIR, docPath);

    // Security: prevent path traversal
    if (!fullPath.startsWith(DOCS_DIR)) {
      return {
        content: [{ type: "text" as const, text: "Error: path traversal not allowed" }],
        isError: true,
      };
    }

    try {
      const content = await fs.readFile(fullPath, "utf-8");
      return {
        content: [{ type: "text" as const, text: content }],
      };
    } catch {
      return {
        content: [
          { type: "text" as const, text: `Error: file not found: ${docPath}` },
        ],
        isError: true,
      };
    }
  });

  // ---- Tool: search_docs ----
  server.registerTool("search_docs", {
    title: "Search Documents",
    description:
      "Full-text search across all markdown documents. Returns matching file paths and lines containing the query (case-insensitive).",
    inputSchema: z.object({
      query: z.string().describe("Search query string"),
      provider: z
        .string()
        .optional()
        .describe(
          'Filter by provider name, e.g. "feishu" or "gemini". Omit to search all.'
        ),
      maxResults: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of matching lines to return"),
    }),
  }, async ({ query, provider, maxResults }) => {
    let files = await findMarkdownFiles(DOCS_DIR);
    if (provider) {
      files = files.filter((f) =>
        path.relative(DOCS_DIR, f).startsWith(provider)
      );
    }

    const results: { file: string; line: number; text: string }[] = [];
    const lowerQuery = query.toLowerCase();

    for (const file of files) {
      if (results.length >= maxResults) break;

      const content = await fs.readFile(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          results.push({
            file: path.relative(DOCS_DIR, file),
            line: i + 1,
            text: lines[i].trim(),
          });
          if (results.length >= maxResults) break;
        }
      }
    }

    if (results.length === 0) {
      return {
        content: [
          { type: "text" as const, text: `No results found for "${query}"` },
        ],
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
    };
  });

  return server;
}

// -------------------------------------------------------------------
// Express app + Streamable HTTP transport
// -------------------------------------------------------------------
const app = express();
app.use(express.json());

// Session store
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", docsDir: DOCS_DIR });
});

// POST /mcp — main message endpoint
app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
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
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// DELETE /mcp — session termination
app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// -------------------------------------------------------------------
// Start
// -------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`MCP Documentation Server listening on port ${PORT}`);
  console.log(`  Docs directory: ${DOCS_DIR}`);
  console.log(`  Endpoint: http://localhost:${PORT}/mcp`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  for (const sid of Object.keys(transports)) {
    await transports[sid].close();
    delete transports[sid];
  }
  process.exit(0);
});
