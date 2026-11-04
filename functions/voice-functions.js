import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { callable, requireSignedIn } from "./core.js";

/** Same Secret Manager secret Inventory Bot uses for Grok. Never sent to the browser. */
const xaiApiKey = defineSecret("XAI_API_KEY");
const TOKEN_URL = "https://api.x.ai/v1/realtime/client_secrets";

/** Ask xAI for a short-lived client secret. The API key stays in this process. */
export async function mintVoiceToken(apiKey, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
  } catch {
    throw new Error("xAI token request failed");
  }
  if (!response?.ok) throw new Error("xAI token request failed");
  const data = await response.json();
  if (!data || typeof data.value !== "string" || !data.value) throw new Error("xAI token request failed");
  return { token: data.value, expiresAt: Number.isFinite(data.expires_at) ? data.expires_at : null };
}

export const voiceChatToken = onCall({ ...callable, secrets: [xaiApiKey], timeoutSeconds: 20 }, async (request) => {
  await requireSignedIn(request);
  try {
    return await mintVoiceToken(xaiApiKey.value());
  } catch (error) {
    globalThis.console.error("Voice token failed", error instanceof Error ? error.message : "error");
    throw new HttpsError("unavailable", "Voice chat is unavailable right now.");
  }
});
