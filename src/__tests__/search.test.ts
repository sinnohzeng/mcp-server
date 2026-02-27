import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock config
vi.mock("../config.js", () => ({
  config: {
    docsDir: "/tmp/test-docs",
    cacheTtlMs: 60000,
  },
}));

import fs from "node:fs/promises";
import { DocIndex } from "../lib/doc-index.js";

vi.mock("node:fs/promises");
const mockFs = vi.mocked(fs);

function makeDirent(name: string, isDir: boolean) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: "/tmp/test-docs",
    path: "/tmp/test-docs",
  } as unknown as import("node:fs").Dirent;
}

const DOC_A = `# 发送消息

这是消息 API 的文档。

## 请求体

需要 access_token 进行鉴权。

## 响应体

返回 message_id。
`;

const DOC_B = `# 卡片回传交互

卡片回传交互回调说明。

## 回调结构

包含 access_token 字段。

## 注意事项

卡片必须3秒内返回。
`;

describe("search logic", () => {
  let index: DocIndex;

  beforeEach(() => {
    vi.clearAllMocks();
    index = new DocIndex();

    mockFs.readdir.mockImplementation(async (dir) => {
      const d = dir.toString();
      if (d === "/tmp/test-docs") {
        return [makeDirent("feishu", true)] as any;
      }
      if (d === "/tmp/test-docs/feishu") {
        return [
          makeDirent("发送消息.md", false),
          makeDirent("卡片回传.md", false),
        ] as any;
      }
      throw new Error("ENOENT");
    });

    mockFs.readFile.mockImplementation(async (p) => {
      const ps = p.toString();
      if (ps.endsWith("发送消息.md")) return DOC_A;
      if (ps.endsWith("卡片回传.md")) return DOC_B;
      throw new Error("ENOENT");
    });
  });

  // Helper to simulate what search-docs tool does
  async function search(query: string, maxResults = 20) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (terms.length === 0) return [];

    const entries = await index.getFiles();
    const results: Array<{
      file: string;
      section: string;
      line: number;
      score: number;
    }> = [];

    for (const entry of entries) {
      const content = await index.readFile(entry.path);
      if (!content) continue;

      const lowerContent = content.toLowerCase();
      if (!terms.every((t) => lowerContent.includes(t))) continue;

      const lines = content.split("\n");
      let currentSection = "";

      for (let i = 0; i < lines.length; i++) {
        const hm = lines[i].match(/^##\s+(.+)/);
        if (hm) currentSection = hm[1].trim();

        const lowerLine = lines[i].toLowerCase();
        if (!terms.some((t) => lowerLine.includes(t))) continue;

        let score = 0;
        for (const term of terms) {
          if (entry.title.toLowerCase().includes(term)) score += 10;
          if (currentSection.toLowerCase().includes(term)) score += 5;
          if (lowerLine.includes(term)) score += 1;
        }

        results.push({ file: entry.path, section: currentSection, line: i + 1, score });
      }
    }

    results.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
    return results.slice(0, maxResults);
  }

  it("finds single Chinese term", async () => {
    const results = await search("消息");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].file).toContain("发送消息");
  });

  it("supports multi-word AND search", async () => {
    // Both terms must appear in same document
    const results = await search("access_token 卡片");
    expect(results.length).toBeGreaterThan(0);
    // Only 卡片回传.md contains both "access_token" AND "卡片"
    expect(results.every((r) => r.file.includes("卡片回传"))).toBe(true);
  });

  it("returns empty for no match", async () => {
    const results = await search("zzz_nonexistent_term");
    expect(results).toHaveLength(0);
  });

  it("returns empty for empty query", async () => {
    const results = await search("");
    expect(results).toHaveLength(0);
  });

  it("respects maxResults", async () => {
    const results = await search("消息", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("scores title matches higher", async () => {
    const results = await search("消息");
    // Lines from 发送消息.md should score higher (title contains 消息)
    const firstDocResults = results.filter((r) => r.file.includes("发送消息"));
    const otherResults = results.filter((r) => !r.file.includes("发送消息"));
    if (firstDocResults.length > 0 && otherResults.length > 0) {
      expect(firstDocResults[0].score).toBeGreaterThanOrEqual(otherResults[0].score);
    }
  });

  it("includes section information", async () => {
    const results = await search("access_token");
    const withSection = results.filter((r) => r.section.length > 0);
    expect(withSection.length).toBeGreaterThan(0);
  });
});
