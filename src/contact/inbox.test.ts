import { describe, expect, it } from "vitest";
import type { Inquiry } from "../core/api";
import { byNewest, inboxPath, inboxRows, legacyFields, messagePath } from "./inbox";

const messages: Inquiry[] = [
  { id: "old", inquiryType: "general", name: "Older", email: "a@example.com", message: "First note", createdAt: "2026-01-01T00:00:00.000Z", archived: false },
  { id: "mid", inquiryType: "operations", name: "Middle", email: "b@example.com", company: "Rig", message: "Second note", createdAt: "2026-06-01T00:00:00.000Z", archived: false, legacy: { areaOfInterest: "Engineering", linkedinUrl: "https://linkedin.com/in/middle", status: "new", source: "public-contact" } },
  { id: "new", inquiryType: "product", productName: "Elixir", name: "Newest", email: "c@example.com", message: "Third note", createdAt: "2026-10-01T00:00:00.000Z", archived: false },
  { id: "four", inquiryType: "careers", name: "Four", email: "d@example.com", message: "Fourth", createdAt: "2026-03-01T00:00:00.000Z", archived: false },
  { id: "five", inquiryType: "general", name: "Five", email: "e@example.com", message: "Fifth", createdAt: "2026-04-01T00:00:00.000Z", archived: true },
  { id: "six", inquiryType: "operations", name: "Six", email: "f@example.com", message: "Sixth", createdAt: "2026-05-01T00:00:00.000Z", archived: false },
];

describe("contact inbox", () => {
  it("keeps every message, newest first, including legacy fields", () => {
    const rows = byNewest(messages);
    expect(rows).toHaveLength(6);
    expect(rows.map((item) => item.id)).toEqual(["new", "mid", "six", "five", "four", "old"]);
    expect(legacyFields(rows[1].legacy).map((field) => field.label)).toEqual(["Area of interest", "LinkedIn", "Previous status", "Source"]);
    expect(messagePath("mid", false, "")).toBe("/contact-inbox/mid");
    expect(inboxPath(true, "rig")).toBe("/contact-inbox?archived=1&q=rig");
    expect(inboxRows(messages, false, "").map((item) => item.id)).toEqual(["new", "mid", "six", "four", "old"]);
    expect(inboxRows(messages, true, "").map((item) => item.id)).toEqual(["five"]);
    expect(inboxRows(messages, false, "rig")).toEqual([rows[1]]);
  });
});
