import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock config before importing DocIndex
vi.mock("../config.js", () => ({
  config: {
    docsDir: "/tmp/test-docs",
    cacheTtlMs: 100,
  },
}));

import fs from "node:fs/promises";
import { DocIndex } from "../lib/doc-index.js";

// Mock fs
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

const SAMPLE_DOC = `# 发送消息

概述说明，这里是摘要内容。

## 请求体

请求体的详细内容在这里。

### 参数列表

| 参数 | 类型 |
|------|------|
| msg  | string |

## 响应体

返回值说明。
`;

describe("DocIndex", () => {
  let index: DocIndex;

  beforeEach(() => {
    vi.clearAllMocks();
    index = new DocIndex();

    // Default: single file setup
    mockFs.readdir.mockImplementation(async (dir) => {
      const d = dir.toString();
      if (d === "/tmp/test-docs") {
        return [makeDirent("feishu", true)] as any;
      }
      if (d === "/tmp/test-docs/feishu") {
        return [makeDirent("发送消息.md", false)] as any;
      }
      throw new Error("ENOENT");
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p.toString().endsWith("发送消息.md")) return SAMPLE_DOC;
      throw new Error("ENOENT");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("metadata extraction", () => {
    it("extracts title from first # heading", async () => {
      const files = await index.getFiles();
      expect(files).toHaveLength(1);
      expect(files[0].title).toBe("发送消息");
    });

    it("extracts ## headings", async () => {
      const files = await index.getFiles();
      expect(files[0].headings).toEqual(["请求体", "响应体"]);
    });

    it("extracts summary from body text", async () => {
      const files = await index.getFiles();
      expect(files[0].summary).toContain("概述说明");
    });

    it("uses filename as title when no # heading exists", async () => {
      mockFs.readFile.mockResolvedValue("No heading here.\n\nJust text.");
      const files = await index.getFiles();
      expect(files[0].title).toBe("发送消息");
    });
  });

  describe("filtering", () => {
    it("filters by provider", async () => {
      const files = await index.getFiles("feishu");
      expect(files).toHaveLength(1);

      const none = await index.getFiles("nonexistent");
      expect(none).toHaveLength(0);
    });

    it("returns providers list", async () => {
      const providers = await index.getProviders();
      expect(providers).toEqual(["feishu"]);
    });
  });

  describe("cache", () => {
    it("returns cached results within TTL", async () => {
      await index.getFiles();
      await index.getFiles();
      // readdir called once for each directory level, but only one scan cycle
      const readdirCalls = mockFs.readdir.mock.calls.length;
      expect(readdirCalls).toBe(2); // /tmp/test-docs + /tmp/test-docs/feishu

      await index.getFiles();
      // Should not have increased (cached)
      expect(mockFs.readdir.mock.calls.length).toBe(2);
    });

    it("refreshes after TTL expires", async () => {
      await index.getFiles();
      const initialCalls = mockFs.readdir.mock.calls.length;

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 150));

      await index.getFiles();
      expect(mockFs.readdir.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  describe("readFile", () => {
    it("reads file by relative path", async () => {
      const content = await index.readFile("feishu/发送消息.md");
      expect(content).toBe(SAMPLE_DOC);
    });

    it("returns null for nonexistent file", async () => {
      const content = await index.readFile("nonexistent.md");
      expect(content).toBeNull();
    });
  });

  describe("readSection", () => {
    it("extracts a section by heading", async () => {
      const section = await index.readSection("feishu/发送消息.md", "请求体");
      expect(section).toContain("请求体");
      expect(section).toContain("参数列表");
      expect(section).not.toContain("响应体");
    });

    it("returns null for nonexistent section", async () => {
      const section = await index.readSection("feishu/发送消息.md", "不存在的章节");
      expect(section).toBeNull();
    });

    it("matches section case-insensitively", async () => {
      mockFs.readFile.mockResolvedValue("# Doc\n\n## Request Body\n\nContent here.\n\n## Response\n\nEnd.");
      const section = await index.readSection("feishu/发送消息.md", "request body");
      expect(section).toContain("Request Body");
      expect(section).toContain("Content here");
    });
  });

  describe("path traversal", () => {
    it("rejects path traversal with ../", async () => {
      const content = await index.readFile("../../etc/passwd");
      expect(content).toBeNull();
    });

    it("rejects URL-encoded path traversal", async () => {
      const content = await index.readFile("..%2F..%2Fetc%2Fpasswd");
      // path.resolve won't decode URL encoding, so it won't traverse
      // but let's make sure it doesn't return sensitive content
      expect(content).toBeNull();
    });

    it("rejects paths with null bytes", async () => {
      const content = await index.readFile("feishu/发送消息.md\0.txt");
      expect(content).toBeNull();
    });
  });
});
