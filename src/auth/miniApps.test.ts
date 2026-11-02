import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSIGNABLE_MINI_APP_IDS, ICONS, MINI_APPS, USER_TYPES } from "./miniApps";
import { isPrivatePage, PRIVATE_ROOTS } from "./privatePaths";
import { safeNext } from "./next";

const read = (path: string) => readFileSync(path, "utf8");

describe("mini-app registry", () => {
  it("matches the server registry", async () => {
    const server = await import(/* @vite-ignore */ "../../functions/miniApps.js");
    expect([...MINI_APPS]).toEqual([...server.MINI_APPS]);
    expect([...USER_TYPES]).toEqual([...server.USER_TYPES]);
    expect([...ASSIGNABLE_MINI_APP_IDS]).toEqual(server.ASSIGNABLE_MINI_APP_IDS);
    expect(server.miniAppsFor("staff", [])).toEqual(["profile"]);
  });
  it("has an icon and one route for each app", () => {
    for (const app of MINI_APPS) expect(ICONS[app.icon]).toBeTruthy();
    expect(MINI_APPS.map((app) => app.id)).toEqual(["profile", "contact", "users"]);
    expect(MINI_APPS.map((app) => app.name)).toEqual(["Profile", "Contact Form", "User Access"]);
  });
  it("guards every route and marks it noindex", () => {
    const app = read("src/App.tsx");
    const hosting = JSON.parse(read("firebase.json")).hosting.headers as { source: string; headers: { key: string; value: string }[] }[];
    for (const { id, route } of MINI_APPS) {
      expect(app).toContain(`<RequireMiniApp app="${id}" />`);
      expect(app).toContain(`path="${route}"`);
      expect(hosting.some((entry) => entry.source === route && entry.headers.some((header) => header.key === "X-Robots-Tag" && header.value.includes("noindex")))).toBe(true);
    }
    expect(PRIVATE_ROOTS).toEqual(["signin", "dashboard", "profile", "contact-inbox", "users"]);
    expect(isPrivatePage("/users")).toBe(true);
    expect(isPrivatePage("/contact-us")).toBe(false);
    expect(safeNext("/users")).toBe("/users");
    expect(safeNext("/portal")).toBe("/dashboard");
    expect(read("src/auth/Dashboard.tsx")).toContain("MINI_APPS.filter((app) => can(app.id))");
    expect(read("src/users/UsersApp.tsx")).toContain("ASSIGNABLE_MINI_APP_IDS.map");
  });
});
