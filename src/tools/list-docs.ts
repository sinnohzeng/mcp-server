import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DocIndex } from "../lib/doc-index.js";
import { textContent } from "../lib/response.js";

export function registerListDocs(server: McpServer, index: DocIndex) {
  server.registerTool(
    "list_docs",
    {
      title: "List Documents",
      description: [
        "List available API reference documents with titles and summaries.",
        "Available providers: feishu (飞书开放平台 API), gemini (Google Gemini AI API), react-bits-pro (React component library).",
        "Use provider parameter to filter, or omit to list all.",
        "Tip: use search_docs to find specific topics, then read_doc to get full content.",
      ].join("\n"),
      inputSchema: z.object({
        provider: z
          .string()
          .optional()
          .describe(
            'Filter by provider name: "feishu", "gemini", or "react-bits-pro". Omit to list all.'
          ),
      }),
    },
    async ({ provider }) => {
      const entries = await index.getFiles(provider);
      const result = entries.map((e) => ({
        path: e.path,
        title: e.title,
        summary: e.summary,
        sections: e.headings,
      }));
      return textContent(JSON.stringify(result, null, 2));
    }
  );
}
