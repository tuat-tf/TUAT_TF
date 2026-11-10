import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "./safe-url";

describe("safeHttpUrl", () => {
  it("accepts absolute http and https URLs", () => {
    expect(safeHttpUrl("https://maps.example.com/a?b=1")).toBe("https://maps.example.com/a?b=1");
    expect(safeHttpUrl("  http://example.com/x  ")).toBe("http://example.com/x");
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "ftp://example.com", "//example.com", "example.com", "/path", "https://u:p@example.com/", "https://u@example.com/", "not a url"])(
    "rejects %s", (value) => expect(safeHttpUrl(value)).toBeNull());
  it("returns null for empty values", () => {
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("   ")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});
