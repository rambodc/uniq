import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { MINI_APPS } from "../miniApps.js";

test("every mini app has a docs/mini-apps page", () => {
  const missing = MINI_APPS
    .filter((app) => !existsSync(new URL(`../../docs/mini-apps/${app.id}.md`, import.meta.url)))
    .map((app) => app.id);
  assert.deepEqual(missing, []);
});
