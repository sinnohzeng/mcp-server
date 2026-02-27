import { config } from "./config.js";
import { app, closeSessions } from "./transport.js";

const httpServer = app.listen(config.port, () => {
  console.log(`MCP Documentation Server listening on port ${config.port}`);
  console.log(`  Docs directory: ${config.docsDir}`);
  console.log(`  Endpoint: http://localhost:${config.port}/mcp`);
});

async function shutdown() {
  console.log("Shutting down...");
  await closeSessions();
  httpServer.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
  // Force exit after 5 seconds if close hangs
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
