/** Ask Grok where an unassigned Xpress ticket belongs. Suggestions stay suggestions unless acceptGrokMove says otherwise. */

import { CHAT_URL, MODEL } from "./chat.js";

export function grokSortBody(cards, tickets) {
  return {
    model: MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: "You place Xpress delivery tickets onto existing well cards. Reply with JSON only: {\"suggestions\":[{\"ticketId\":\"\",\"cardId\":\"\",\"confidence\":\"high\" or \"low\",\"reason\":\"\"}]}. Use only the card ids you were given. confidence high only when the LSD is the same and the rig or well name is an obvious typo. Otherwise low. Do not invent wells, ticket numbers, or dollar amounts." },
      { role: "user", content: JSON.stringify({ cards, tickets }) },
    ],
  };
}

export function parseGrokSort(text) {
  const raw = String(text || "").replace(/```json|```/g, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return [];
  let payload;
  try { payload = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  const rows = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  return rows.filter((row) => row && row.ticketId && row.cardId).map((row) => ({
    ticketId: String(row.ticketId),
    cardId: String(row.cardId),
    confidence: row.confidence === "high" ? "high" : "low",
    reason: String(row.reason || "").slice(0, 240),
  }));
}

export async function askGrokSort({ apiKey, cards, tickets, fetchImpl }) {
  const response = await fetchImpl(CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(grokSortBody(cards, tickets)),
  });
  if (!response.ok) throw new Error(`Grok sort failed (${response.status}).`);
  const payload = await response.json();
  return parseGrokSort(payload.choices?.[0]?.message?.content || "");
}
