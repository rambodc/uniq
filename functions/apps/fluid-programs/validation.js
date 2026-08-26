import { HttpsError } from "firebase-functions/v2/https";
export function validSessionMessages(value) {
  if (!Array.isArray(value) || value.length > 100) throw new HttpsError("invalid-argument", "The Fluid Programs session is invalid.");
  for (const message of value) if (!message || !["user", "assistant"].includes(message.role) || typeof message.text !== "string" || !message.text.trim() || message.text.length > (message.role === "user" ? 4000 : 12000)) throw new HttpsError("invalid-argument", "A Fluid Programs message is malformed.");
  if (Buffer.byteLength(JSON.stringify(value)) > 200 * 1024) throw new HttpsError("resource-exhausted", "This session is full. Refresh to start again.");
  return value.map(({ role, text }) => ({ role, text: text.trim() }));
}
