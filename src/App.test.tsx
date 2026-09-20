import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalUser } from "./core/types";

const session = vi.hoisted(() => ({ user: null as PortalUser | null, loading: false }));
vi.mock("./portal/AuthContext", () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children, usePortalAuth: () => session }));
vi.mock("react-router-dom", async (original) => ({ ...await original<typeof import("react-router-dom")>(), Navigate: ({ to }: { to: string }) => <span>Redirect to {to}</span> }));
vi.mock("./public/PublicSite", () => ({ default: () => <span>Public site</span> }));
vi.mock("./auth/EnterpriseAuth", () => ({ default: () => null }));

vi.mock("./mini-apps/account/AccountApp", () => ({ default: () => null }));
vi.mock("./mini-apps/contact-form/ContactFormApp", () => ({ default: () => null }));
vi.mock("./mini-apps/user-access/UserAccessApp", () => ({ default: () => null }));
vi.mock("./mini-apps/fluidlab/FluidLab", () => ({ default: () => <span>FluidLab workspace</span> }));
import App from "./App";

const user: PortalUser = { schemaVersion: 2, uid: "test", email: "test@example.com", firstName: "Test", lastName: "User", role: "employee", status: "active", enabledMiniApps: [] };
const render = (path = "/apps/fluidlab") => renderToString(<MemoryRouter initialEntries={[path]}><App/></MemoryRouter>);

beforeEach(() => { session.user = null; session.loading = false; });
describe("private FluidLab route", () => {
  it("waits for authentication before rendering the workspace", () => {
    session.loading = true;
    expect(render()).toContain("Opening your UniqEnergy portal");
    expect(render()).not.toContain("Loading FluidLab");
  });
  it("sends signed-out visitors to sign-in", () => {
    expect(render()).toContain("Redirect to <!-- -->/signin");
  });
  it("sends unassigned users to the portal", () => {
    session.user = user;
    expect(render()).toContain("Redirect to <!-- -->/portal");
  });
  it("rejects disabled users even with a grant", () => {
    session.user = { ...user, status: "disabled", enabledMiniApps: ["fluidlab"] };
    expect(render()).toContain("Redirect to <!-- -->/signin");
  });
  it.each(["admin", "assigned"])("opens the workspace for %s", (kind) => {
    session.user = kind === "admin" ? { ...user, role: "admin" } : { ...user, enabledMiniApps: ["fluidlab"] };
    expect(render()).toMatch(/Loading FluidLab|FluidLab workspace/);
    expect(render()).not.toContain("Redirect to");
  });
  it("has no viewer or redirect at the removed public URL", () => {
    session.user = { ...user, role: "admin" };
    expect(render("/well-viewer")).toBe("<span>Public site</span>");
  });
});
