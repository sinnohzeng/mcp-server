import { describe, it, expect } from "vitest";
import { textContent, errorContent } from "../lib/response.js";

describe("response helpers", () => {
  it("textContent wraps text in MCP format", () => {
    const result = textContent("hello");
    expect(result).toEqual({
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("errorContent includes isError flag", () => {
    const result = errorContent("something went wrong");
    expect(result).toEqual({
      content: [{ type: "text", text: "something went wrong" }],
      isError: true,
    });
  });
});
