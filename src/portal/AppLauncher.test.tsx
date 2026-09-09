import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { PortalUser } from "../core/types";
const session = vi.hoisted(() => ({ user: null as PortalUser | null }));
vi.mock("./AuthContext", () => ({ usePortalAuth: () => session }));
import AppLauncher from "./AppLauncher";
const profile: PortalUser = { schemaVersion: 1, uid: "test", email: "test@example.com", firstName: "Test", lastName: "User", role: "user", status: "active", enabledMiniApps: ["well-viewer"] };
const render = () => renderToString(<MemoryRouter><AppLauncher/></MemoryRouter>);
beforeEach(() => { session.user = { ...profile }; });
it("shows image launchers only for assigned and always-visible apps", () => {
  const html = render();
  expect(html).toContain('href="/apps/well-viewer"'); expect(html).toContain('/portal-art/well-viewer.webp');
  expect(html).toContain('href="/apps/account"'); expect(html).not.toContain('href="/apps/user-access"'); expect(html).not.toContain('href="/apps/fluidlab"');
});
it("shows all five app launchers for administrators", () => {
  session.user = { ...profile, role: "admin" };
  const html = render();
  for (const app of ["fluidlab", "well-viewer", "contact-form", "user-access", "account"]) {
    expect(html).toContain(`href="/apps/${app}"`); expect(html).toContain(`/portal-art/${app}.webp`);
  }
});
it("does not show app links for disabled users", () => { session.user = { ...profile, status: "disabled" }; expect(render()).not.toContain('href="/apps/'); });
