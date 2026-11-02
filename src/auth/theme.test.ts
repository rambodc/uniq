import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";

describe("portal theme", () => {
  it("follows the system when nothing is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
  });
  it("keeps an explicit choice", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
