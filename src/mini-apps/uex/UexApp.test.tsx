import { describe, it, expect, vi } from "vitest";
vi.mock("./api", () => ({ call: vi.fn(), when: vi.fn() }));
import { parseGuests, toUtc, inZone } from "./UexApp";
describe("party input handling", () => {
  it("parses named guest lists without silently skipping malformed lines", () => {
    expect(
      parseGuests(
        "Sarah Smith, sarah@example.com\nAlex Jones <alex@example.com>",
      ),
    ).toEqual([
      { name: "Sarah Smith", email: "sarah@example.com" },
      { name: "Alex Jones", email: "alex@example.com" },
    ]);
    expect(() => parseGuests("missing name or email")).toThrow();
  });
  it("stores Edmonton wall time as UTC in both seasons", () => {
    expect(toUtc("2030-01-10T18:00", "America/Edmonton")).toBe(
      "2030-01-11T01:00:00.000Z",
    );
    expect(toUtc("2030-07-10T18:00", "America/Edmonton")).toBe(
      "2030-07-11T00:00:00.000Z",
    );
    expect(inZone("2030-07-11T00:00:00Z", "America/Edmonton")).toBe(
      "2030-07-10T18:00",
    );
  });
  it("rejects nonexistent daylight saving times", () => {
    expect(() => toUtc("2030-03-10T02:30", "America/Edmonton")).toThrow();
  });
});
