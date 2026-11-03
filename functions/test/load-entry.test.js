import assert from "node:assert/strict";
import { test } from "node:test";

test("the functions entry loads, so a bad export fails before deploy", async () => {
  const loaded = await import("../index.js");
  assert.equal(typeof loaded.inventoryBotXpressBoard, "function");
  assert.equal(typeof loaded.inventoryBotOpenXpressWell, "function");
  assert.equal(typeof loaded.inventoryBotRequestWellRefresh, "function");
  assert.equal(typeof loaded.inventoryBotGrokSort, "function");
  assert.equal(typeof loaded.submitContactInquiry, "function");
});
