import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DocIndex } from "../lib/doc-index.js";
import { textContent, errorContent } from "../lib/response.js";

export function registerReadDoc(server: McpServer, index: DocIndex) {
  server.registerTool(
    "read_doc",
    {
      title: "Read Document",
      description: [
        "Read a markdown document by its relative path.",
        "Use the optional section parameter to read only a specific section (matched by ## heading text),",
        "which saves context when you only need part of a large document.",
        'Example: read_doc({ path: "feishu/消息/发送消息.md" }) for full doc,',
        'or read_doc({ path: "feishu/消息/发送消息.md", section: "请求体" }) for just that section.',
      ].join("\n"),
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            'Relative path to the document, e.g. "feishu/消息/发送消息.md"'
          ),
        section: z
          .string()
          .optional()
          .describe(
            "Optional heading text to extract a specific section. Matches against ## headings (case-insensitive, partial match)."
          ),
      }),
    },
    async ({ path: docPath, section }) => {
      if (section) {
        const sectionContent = await index.readSection(docPath, section);
        if (sectionContent === null) {
          return errorContent(
            `Section "${section}" not found in ${docPath}. Use list_docs to see available sections.`
          );
        }
        return textContent(sectionContent);
      }

      const content = await index.readFile(docPath);
      if (content === null) {
        return errorContent(
          `File not found: ${docPath}. Use list_docs to see available documents.`
        );
      }
      return textContent(content);
    }
  );
}
