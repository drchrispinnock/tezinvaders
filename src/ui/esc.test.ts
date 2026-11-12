import { describe, expect, it } from "vitest";
import { esc } from "./panel";

describe("esc", () => {
  it("neutralises markup in externally sourced text", () => {
    expect(esc(`<img src=x onerror="alert(1)">&'`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;");
    expect(esc("Ms BLS")).toBe("Ms BLS");
  });
});
