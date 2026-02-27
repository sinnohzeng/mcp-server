import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { DocEntry } from "../types.js";

export class DocIndex {
  private cache: DocEntry[] | null = null;
  private cacheTime = 0;

  async getFiles(provider?: string): Promise<DocEntry[]> {
    const entries = await this.ensureCache();
    if (!provider) return entries;
    return entries.filter((e) => e.path.startsWith(provider));
  }

  async getProviders(): Promise<string[]> {
    const entries = await this.ensureCache();
    const providers = new Set(entries.map((e) => e.path.split("/")[0]));
    return [...providers].sort();
  }

  async readFile(docPath: string): Promise<string | null> {
    const fullPath = path.resolve(config.docsDir, docPath);
    if (!fullPath.startsWith(config.docsDir)) return null;
    try {
      return await fs.readFile(fullPath, "utf-8");
    } catch {
      return null;
    }
  }

  async readSection(docPath: string, section: string): Promise<string | null> {
    const content = await this.readFile(docPath);
    if (!content) return null;

    const lines = content.split("\n");
    const lowerSection = section.toLowerCase();
    let capturing = false;
    let capturedLevel = 0;
    const result: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();

        if (capturing) {
          // Stop at same or higher level heading
          if (level <= capturedLevel) break;
        } else if (title.toLowerCase().includes(lowerSection)) {
          capturing = true;
          capturedLevel = level;
        }
      }
      if (capturing) result.push(line);
    }

    return result.length > 0 ? result.join("\n") : null;
  }

  private async ensureCache(): Promise<DocEntry[]> {
    const now = Date.now();
    if (this.cache && now - this.cacheTime < config.cacheTtlMs) {
      return this.cache;
    }
    this.cache = await this.scanDocs(config.docsDir);
    this.cacheTime = now;
    return this.cache;
  }

  private async scanDocs(dir: string): Promise<DocEntry[]> {
    const results: DocEntry[] = [];
    await this.walkDir(dir, results);
    return results.sort((a, b) => a.path.localeCompare(b.path));
  }

  private async walkDir(dir: string, results: DocEntry[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, results);
      } else if (entry.name.endsWith(".md")) {
        const docEntry = await this.extractMetadata(fullPath);
        results.push(docEntry);
      }
    }
  }

  private async extractMetadata(fullPath: string): Promise<DocEntry> {
    const relPath = path.relative(config.docsDir, fullPath);
    let content: string;
    try {
      content = await fs.readFile(fullPath, "utf-8");
    } catch {
      return { path: relPath, title: path.basename(relPath, ".md"), headings: [], summary: "" };
    }

    const lines = content.split("\n");
    let title = path.basename(relPath, ".md");
    const headings: string[] = [];
    const bodyLines: string[] = [];

    for (const line of lines) {
      const h1 = line.match(/^#\s+(.+)/);
      const h2 = line.match(/^##\s+(.+)/);
      if (h1 && title === path.basename(relPath, ".md")) {
        title = h1[1].trim();
      } else if (h2) {
        headings.push(h2[1].trim());
      } else if (line.trim() && !line.startsWith("#")) {
        bodyLines.push(line.trim());
      }
    }

    const summary = bodyLines.join(" ").slice(0, 200);
    return { path: relPath, title, headings, summary };
  }
}
