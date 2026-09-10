import { test } from "node:test";
import assert from "node:assert/strict";
import { searchWells } from "../apps/fluidlab/search.js";
test("search returns a useful retry message and keeps index diagnostics in server logs", async t => {
  const log = t.mock.method(console, "error", () => {});
  const query = { where() { return this; }, orderBy() { return this; }, limit() { return this; }, async get() { throw Object.assign(new Error("9 FAILED_PRECONDITION https://console.firebase.google.com/private"), { code: 9 }); } };
  await assert.rejects(searchWells(query), e => e.code === "unavailable" && e.message === "Wells could not be loaded. Please retry.");
  assert.equal(log.mock.calls[0].arguments[1].code, 9);
});
