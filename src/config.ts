import path from "node:path";

export const config = Object.freeze({
  docsDir: path.resolve(
    process.env.DOCS_DIR || path.join(import.meta.dirname, "..", "docs")
  ),
  port: parseInt(process.env.PORT || "3927", 10),
  sessionTtlMs: 30 * 60 * 1000, // 30 minutes
  cacheTtlMs: 60 * 1000, // 60 seconds
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
});
