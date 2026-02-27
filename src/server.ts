import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DocIndex } from "./lib/doc-index.js";
import { registerListDocs } from "./tools/list-docs.js";
import { registerReadDoc } from "./tools/read-doc.js";
import { registerSearchDocs } from "./tools/search-docs.js";

const INSTRUCTIONS = [
  "This server provides API reference documentation for multiple providers.",
  "Available providers: feishu (飞书开放平台 API), gemini (Google Gemini AI API), react-bits-pro (React component library).",
  "Workflow: search_docs → find relevant docs → read_doc → get full content.",
  "Documents are primarily in Chinese (Feishu, Gemini) and English (React).",
  "Use list_docs to browse available documents, search_docs to find specific topics, and read_doc to get content.",
].join("\n");

export function createServer(): McpServer {
  const index = new DocIndex();

  const server = new McpServer(
    { name: "docs-server", version: "1.0.0" },
    { instructions: INSTRUCTIONS }
  );

  // Register tools
  registerListDocs(server, index);
  registerReadDoc(server, index);
  registerSearchDocs(server, index);

  // Register resource template for @mention support
  server.registerResource(
    "doc",
    new ResourceTemplate("docs://api-docs/{path+}", {
      list: async () => {
        const entries = await index.getFiles();
        return {
          resources: entries.map((e) => ({
            uri: `docs://api-docs/${e.path}`,
            name: e.title,
            description: e.summary,
            mimeType: "text/markdown",
          })),
        };
      },
    }),
    { description: "API reference documentation", mimeType: "text/markdown" },
    async (uri, variables) => {
      const docPath = Array.isArray(variables.path)
        ? variables.path.join("/")
        : (variables.path as string);
      const content = await index.readFile(docPath);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: content ?? `Document not found: ${docPath}`,
          },
        ],
      };
    }
  );

  return server;
}
