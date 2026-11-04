import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mintVoiceToken } from "../voice-functions.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the voice token request uses the xAI client-secret endpoint and returns only the ephemeral token", async () => {
  const calls = [];
  const result = await mintVoiceToken("secret-key", async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ value: "ephemeral-1", expires_at: 1_700_000_000 }) };
  });
  assert.equal(result.token, "ephemeral-1");
  assert.equal(result.expiresAt, 1_700_000_000);
  assert.equal(calls[0].url, "https://api.x.ai/v1/realtime/client_secrets");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-key");
  assert.deepEqual(JSON.parse(calls[0].init.body), { expires_after: { seconds: 300 } });
  assert.equal(JSON.stringify(result).includes("secret-key"), false);
});

test("a failed token request does not include the API key", async () => {
  await assert.rejects(() => mintVoiceToken("secret-key", async () => ({ ok: false, json: async () => ({ error: "nope secret-key" }) })), /xAI token request failed/);
  await assert.rejects(() => mintVoiceToken("secret-key", async () => { throw new Error("network secret-key"); }), /xAI token request failed/);
});

test("voice chat is staff-only and binds the existing XAI secret", () => {
  const source = read("../voice-functions.js");
  assert.match(source, /defineSecret\("XAI_API_KEY"\)/);
  assert.match(source, /requireSignedIn\(request\)/);
  assert.match(source, /secrets: \[xaiApiKey\]/);
  assert.doesNotMatch(source, /console\.(log|error|info|debug)\([^)]*xaiApiKey/);
});
