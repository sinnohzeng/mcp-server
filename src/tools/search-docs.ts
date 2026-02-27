import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DocIndex } from "../lib/doc-index.js";
import type { SearchResult } from "../types.js";
import { textContent } from "../lib/response.js";

const CONTEXT_LINES = 2;

export function registerSearchDocs(server: McpServer, index: DocIndex) {
  server.registerTool(
    "search_docs",
    {
      title: "Search Documents",
      description: [
        "Full-text search across API reference documents (case-insensitive).",
        "Multiple words use AND logic — all terms must appear in the same document.",
        "Results include surrounding context and the section heading where the match was found.",
        "Providers: feishu, gemini, react-bits-pro.",
        'Example queries: "access_token", "卡片 回传", "send message request body".',
        "After finding relevant docs, use read_doc to get the full content.",
      ].join("\n"),
      inputSchema: z.object({
        query: z.string().describe("Search query (multiple words = AND)"),
        provider: z
          .string()
          .optional()
          .describe(
            'Filter by provider: "feishu", "gemini", or "react-bits-pro". Omit to search all.'
          ),
        maxResults: z
          .number()
          .optional()
          .default(20)
          .describe("Maximum number of results to return (default 20)"),
      }),
    },
    async ({ query, provider, maxResults }) => {
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
      if (terms.length === 0) {
        return textContent("No search terms provided.");
      }

      const entries = await index.getFiles(provider);
      const allResults: SearchResult[] = [];

      for (const entry of entries) {
        const content = await index.readFile(entry.path);
        if (!content) continue;

        const lowerContent = content.toLowerCase();
        // AND: all terms must appear somewhere in the document
        if (!terms.every((t) => lowerContent.includes(t))) continue;

        const lines = content.split("\n");
        let currentSection = "";

        for (let i = 0; i < lines.length; i++) {
          const headingMatch = lines[i].match(/^##\s+(.+)/);
          if (headingMatch) {
            currentSection = headingMatch[1].trim();
          }

          const lowerLine = lines[i].toLowerCase();
          // A line matches if any term appears in it
          if (!terms.some((t) => lowerLine.includes(t))) continue;

          const score = computeScore(lines[i], entry.title, currentSection, terms);
          const start = Math.max(0, i - CONTEXT_LINES);
          const end = Math.min(lines.length, i + CONTEXT_LINES + 1);
          const context = lines.slice(start, end).join("\n");

          allResults.push({
            file: entry.path,
            section: currentSection,
            context,
            score,
            line: i + 1,
          });
        }
      }

      // Sort by score descending, then by file path
      allResults.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
      const limited = allResults.slice(0, maxResults);

      if (limited.length === 0) {
        return textContent(`No results found for "${query}".`);
      }

      return textContent(JSON.stringify(limited, null, 2));
    }
  );
}

function computeScore(
  line: string,
  docTitle: string,
  section: string,
  terms: string[]
): number {
  let score = 0;
  const lowerLine = line.toLowerCase();
  const lowerTitle = docTitle.toLowerCase();
  const lowerSection = section.toLowerCase();

  for (const term of terms) {
    if (lowerTitle.includes(term)) score += 10;
    if (lowerSection.includes(term)) score += 5;
    if (lowerLine.includes(term)) score += 1;
  }

  return score;
}
