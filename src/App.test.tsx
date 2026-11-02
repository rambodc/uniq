import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", async (original) => ({ ...await original<typeof import("react-router-dom")>(), Navigate: ({ to }: { to: string }) => <span>{`Redirect to ${to}`}</span> }));

const session = vi.hoisted(() => ({
  user: null as { emailVerified: boolean } | null,
  loading: false,
  type: null as string | null,
  accessLoading: false,
  accessError: null as string | null,
  can: (id: string) => id.length < 0,
  logout: async () => {},
  profile: null,
  miniApps: [] as string[],
  refreshAccess: async () => {},
}));
vi.mock("./auth/AuthContext", () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children, useAuth: () => session }));
vi.mock("./public/PublicSite", () => ({ default: () => <span>Public site</span> }));
vi.mock("./auth/SignIn", () => ({ default: () => <span>Sign in</span> }));
vi.mock("./auth/Dashboard", () => ({ default: () => <span>Dashboard</span> }));
vi.mock("./contact/ContactInbox", () => ({ default: () => <span>Contact inbox</span> }));
vi.mock("./users/UsersApp", () => ({ default: () => <span>User access</span> }));
vi.mock("./profile/ProfileApp", () => ({ default: () => <span>Profile</span> }));
import App from "./App";

const render = (path: string) => renderToString(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

beforeEach(() => {
  session.user = null;
  session.loading = false;
  session.type = null;
  session.accessLoading = false;
  session.accessError = null;
  session.can = () => false;
});

describe("workspace routes", () => {
  it("waits for authentication", () => {
    session.loading = true;
    expect(render("/dashboard")).toContain("Opening your UniqEnergy workspace");
  });
  it("sends signed-out visitors to sign-in", () => {
    expect(render("/dashboard")).toContain("Redirect to /signin");
    expect(render("/contact-inbox")).toContain("Redirect to /signin");
  });
  it("opens the dashboard and profile for an authorized account", () => {
    session.user = { emailVerified: true };
    session.type = "staff";
    session.can = (id) => id === "profile";
    expect(render("/dashboard")).toContain("Dashboard");
    expect(render("/profile")).toContain("Profile");
    expect(render("/users")).toContain("Redirect to /dashboard");
  });
  it("opens contact and user access only when granted", () => {
    session.user = { emailVerified: true };
    session.type = "super_admin";
    session.can = () => true;
    expect(render("/contact-inbox")).toContain("Contact inbox");
    expect(render("/users")).toContain("User access");
  });
  it("keeps the public site on marketing routes", () => {
    expect(render("/")).toContain("Public site");
    expect(render("/contact-us")).toContain("Public site");
    expect(render("/apps/fluidlab")).toContain("Public site");
  });
});
