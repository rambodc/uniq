import { describe, expect, it } from "vitest";
import type { PortalUser } from "../core/types";
import { canAccessMiniApp, visibleMiniApps } from "./miniApps";

const user: PortalUser = { schemaVersion: 1, uid: "test", email: "test@example.com", firstName: "Test", lastName: "User", role: "user", status: "active", enabledMiniApps: [] };

describe("Well Viewer access", () => {
  it.each([
    { label: "admin", changes: { role: "admin" } as Partial<PortalUser>, allowed: true },
    { label: "assigned user", changes: { enabledMiniApps: ["well-viewer"] } as Partial<PortalUser>, allowed: true },
    { label: "unassigned user", changes: {}, allowed: false },
    { label: "FluidLab-only user", changes: { enabledMiniApps: ["fluidlab"] } as Partial<PortalUser>, allowed: false },
    { label: "disabled assigned user", changes: { status: "disabled", enabledMiniApps: ["well-viewer"] } as Partial<PortalUser>, allowed: false },
    { label: "disabled admin", changes: { status: "disabled", role: "admin" } as Partial<PortalUser>, allowed: false },
  ])("$label: access and launcher visibility agree", ({ changes, allowed }) => {
    const profile = { ...user, ...changes };
    expect(canAccessMiniApp(profile, "well-viewer")).toBe(allowed);
    expect(visibleMiniApps(profile).some((app) => app.id === "well-viewer")).toBe(allowed);
  });
});
