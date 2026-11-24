import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import type { UserRecord } from "../core/api";
import { UserCard } from "./UserList";
import { appChips, cleanInput, filterCounts, inviteBadge, lastSeen, validateUser, visibleUsers } from "./userHelpers";

const user = (over: Partial<UserRecord> = {}): UserRecord => ({ uid: "ann", firstName: "Ann", lastName: "Nguyen", photo: null, email: "ann@uniqenergy.com", type: "staff", miniApps: ["contact", "inventoryBot", "wells", "uniqGroupLogo"], disabled: false, createdAt: null, updatedAt: null, createdBy: "x", invite: null, lastSignInAt: null, you: false, ...over });
const html = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

describe("User Access", () => {
  it("shows Staff with two mini app chips and +N more", () => {
    expect(appChips(user().miniApps)).toMatchObject({ shown: ["Contact Form", "Inventory Bot"], more: 2 });
    const out = html(<UserCard user={user()} />);
    expect(out).toContain("Staff");
    expect(out).toContain("+2 more");
    expect(out).toContain('href="/users/ann/edit"');
    expect(out).toContain("Disable");
    expect(out).toContain("Send invite");
  });
  it("labels super admins, yourself, disabled accounts and invite problems", () => {
    const admin = html(<UserCard user={user({ type: "super_admin", miniApps: [], you: true })} />);
    expect(admin).toContain("All mini apps");
    expect(admin).toContain("You");
    expect(admin).not.toContain("Disable");
    const off = html(<UserCard user={user({ disabled: true, invite: { status: "bounced", at: null, by: "x", error: "Mailbox full", checkedAt: null } as UserRecord["invite"] })} />);
    expect(off).toContain("Enable");
    expect(off).toContain("Invite bounced");
    expect(off).toContain("Mailbox full");
    expect(off).not.toContain("Resend invite");
    expect(inviteBadge(user({ invite: { status: "delivered" } as UserRecord["invite"] }))).toEqual({ label: "Invite delivered", tone: "ok" });
  });
  it("searches and filters", () => {
    const list = [user(), user({ uid: "b", firstName: "Bo", lastName: "Lee", email: "bo@x.ca", type: "super_admin", miniApps: [] }), user({ uid: "c", firstName: "Cy", email: "cy@x.ca", disabled: true, miniApps: [] })];
    expect(visibleUsers(list, "inventory", "all").map((item) => item.uid)).toEqual(["ann"]);
    expect(visibleUsers(list, "", "super_admin").map((item) => item.uid)).toEqual(["b"]);
    expect(visibleUsers(list, "cy", "disabled").map((item) => item.uid)).toEqual(["c"]);
    expect(filterCounts(list)).toMatchObject({ all: 3, staff: 2, super_admin: 1, disabled: 1, attention: 0 });
  });
  it("validates and cleans the form", () => {
    expect(validateUser({ firstName: " ", lastName: "A", email: "nope", type: "staff", miniApps: [] })).toEqual({ firstName: "Enter a first name.", email: "Enter a valid email address." });
    expect(cleanInput({ firstName: " Ann ", lastName: "N", email: " Ann@X.ca ", type: "super_admin", miniApps: ["wells"] })).toEqual({ firstName: "Ann", lastName: "N", email: "ann@x.ca", type: "super_admin", miniApps: [] });
    expect(lastSeen(null)).toBe("Never signed in");
    expect(lastSeen("2026-11-20T12:00:00.000Z", Date.parse("2026-11-24T12:00:00.000Z"))).toBe("Signed in 4 days ago");
  });
  it("uses no browser popups", () => {
    for (const file of ["UsersApp.tsx", "UserList.tsx", "UserForm.tsx"]) expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toMatch(/window\.(confirm|alert)|\balert\(/);
  });
});
