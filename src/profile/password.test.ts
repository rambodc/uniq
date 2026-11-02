import { describe, expect, it } from "vitest";
import { checkPasswordChange, passwordErrorMessage } from "./password";

describe("password change", () => {
  it("requires eight characters, a difference, and a matching confirmation", () => {
    expect(checkPasswordChange({ current: "", next: "long-enough", confirm: "long-enough" })).toMatch(/current/);
    expect(checkPasswordChange({ current: "old-password", next: "short", confirm: "short" })).toMatch(/8/);
    expect(checkPasswordChange({ current: "old-password", next: "old-password", confirm: "old-password" })).toMatch(/different/);
    expect(checkPasswordChange({ current: "old-password", next: "new-password", confirm: "other" })).toMatch(/do not match/);
    expect(checkPasswordChange({ current: "old-password", next: "new-password", confirm: "new-password" })).toBe("");
  });
  it("maps Firebase errors without echoing the password", () => {
    expect(passwordErrorMessage({ code: "auth/invalid-credential" })).toMatch(/not right/);
    expect(passwordErrorMessage({ code: "auth/unknown" })).toBe("The password could not be changed. Try again.");
  });
});
