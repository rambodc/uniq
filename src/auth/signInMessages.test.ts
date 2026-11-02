import { describe, expect, it } from "vitest";
import { NOT_AUTHORIZED, RESET_CONTINUE_URL, RESET_SENT, resetOutcome, signInErrorMessage } from "./signInMessages";

describe("sign-in messages", () => {
  it("never reveals whether an email has an account", () => {
    expect(resetOutcome(undefined)).toEqual({ sent: true });
    expect(resetOutcome({ code: "auth/user-not-found" })).toEqual({ sent: true });
    expect(RESET_SENT.toLowerCase()).toContain("if an account exists");
    expect(signInErrorMessage({ code: "auth/invalid-credential" })).toBe("Sign in failed. Check your email and password.");
    expect(signInErrorMessage({ code: "auth/user-not-found" })).not.toMatch(/not found|no account/i);
  });
  it("sends password resets back to the UniqEnergy sign-in page", () => {
    expect(RESET_CONTINUE_URL).toBe("https://uniqenergy.com/signin");
    expect(NOT_AUTHORIZED).toMatch(/UniqEnergy/);
    expect(resetOutcome({ code: "auth/invalid-email" }).sent).toBe(false);
  });
});
