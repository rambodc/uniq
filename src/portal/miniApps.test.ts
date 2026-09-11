import { describe, expect, it } from "vitest";
import type { PortalUser } from "../core/types";
import { canAccessMiniApp, visibleMiniApps } from "./miniApps";

const user: PortalUser = { schemaVersion: 1, uid: "test", email: "test@example.com", firstName: "Test", lastName: "User", role: "user", status: "active", enabledMiniApps: [] };

describe("FluidLab access", () => {
  it.each([
    { label: "admin", changes: { role: "admin" } as Partial<PortalUser>, allowed: true },
    { label: "assigned user", changes: { enabledMiniApps: ["fluidlab"] } as Partial<PortalUser>, allowed: true },
    { label: "unassigned user", changes: {}, allowed: false },
    { label: "Contact-only user", changes: { enabledMiniApps: ["contact-form"] } as Partial<PortalUser>, allowed: false },
    { label: "disabled assigned user", changes: { status: "disabled", enabledMiniApps: ["fluidlab"] } as Partial<PortalUser>, allowed: false },
    { label: "disabled admin", changes: { status: "disabled", role: "admin" } as Partial<PortalUser>, allowed: false },
  ])("$label: access and launcher visibility agree", ({ changes, allowed }) => {
    const profile = { ...user, ...changes };
    expect(canAccessMiniApp(profile, "fluidlab")).toBe(allowed);
    expect(visibleMiniApps(profile).some((app) => app.id === "fluidlab")).toBe(allowed);
  });
});

it("LSD Finder uses separate assigned access", () => {
 expect(canAccessMiniApp(user,"lsd-finder")).toBe(false);
 expect(canAccessMiniApp({...user,enabledMiniApps:["lsd-finder"]},"lsd-finder")).toBe(true);
 expect(canAccessMiniApp({...user,role:"admin"},"lsd-finder")).toBe(true);
 expect(canAccessMiniApp({...user,role:"admin",status:"disabled"},"lsd-finder")).toBe(false);
});
