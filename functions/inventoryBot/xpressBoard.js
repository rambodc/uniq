/** Pure Xpress well-card board. Placement is deterministic; manual moves win. */

import { looseTicket } from "./coverage.js";
import { dayKey, lsdNorm, rigNorm, ticketsMatch, warehouseTicketNumber } from "./engine.js";

function trailingDigits(value) {
  const match = String(value ?? "").toUpperCase().match(/(\d+)$/);
  return match ? String(Number(match[1])) : "";
}

export function citesWarehouseTicket(app, ticket) {
  if (app?.kind && app.kind !== "received" && app.kind !== "returned") return false;
  const parsed = looseTicket(warehouseTicketNumber(ticket));
  const appParsed = looseTicket(app?.rawTicket || app?.ticketNorm);
  if (!parsed?.number || !appParsed?.number) return false;
  if (!parsed.bare && !appParsed.bare && ticketsMatch(parsed, appParsed) !== "none") return true;
  return Boolean(appParsed.bare && trailingDigits(warehouseTicketNumber(ticket)) === appParsed.number);
}

export function ticketValue(ticket) {
  let sum = 0;
  for (const line of ticket?.lines || []) {
    const qty = Math.abs(Number(line.qty) || 0);
    const price = Number(line.price) || Number(line.unitPrice) || 0;
    sum += qty * price;
  }
  if (!sum && Number.isFinite(Number(ticket?.total))) sum = Math.abs(Number(ticket.total));
  const type = String(ticket?.type || "").toUpperCase();
  const signed = type === "CT" || type === "SR" ? -sum : sum;
  return Math.round(signed * 100) / 100;
}

export function ticketWhen(ticket) {
  return dayKey(ticket?.shippedAt) || dayKey(ticket?.deliveredAt) || dayKey(ticket?.deliveryDate) || dayKey(ticket?.date) || dayKey(ticket?.postedAt) || "";
}

export function autoCardId(lsd, rig) {
  const text = `${lsd || "no-lsd"}-${rig || "no-rig"}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `auto-${text || "well"}`;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function publicTicket(ticket, placement) {
  const type = String(ticket.type || "").toUpperCase();
  return {
    id: ticket.id,
    number: warehouseTicketNumber(ticket),
    type,
    date: ticketWhen(ticket),
    customer: ticket.customer || "",
    shipTo: ticket.shipTo || ticket.shipToName || ticket.wellName || "",
    rig: ticket.rig || "",
    lsd: ticket.lsd || "",
    value: ticketValue(ticket),
    lines: (ticket.lines || []).map((line) => ({ name: line.name || line.product || "", qty: Number(line.qty) || 0, unit: line.unit || "", price: Number(line.price) || 0 })),
    return: type === "CT" || type === "SR",
    suggestion: placement?.suggestion && !placement.manual ? placement.suggestion : null,
  };
}

function matchTickets(list, appWellId, appTickets) {
  if (!appWellId) return { matched: 0, waiting: 0, missing: 0, compared: false, byTicket: {} };
  const apps = (appTickets || []).filter((entry) => entry.wellId === appWellId && (entry.kind === "received" || entry.kind === "returned" || !entry.kind));
  const byTicket = {};
  let matched = 0;
  let waiting = 0;
  let missing = 0;
  for (const ticket of list) {
    const hit = apps.some((entry) => citesWarehouseTicket({ ...entry, kind: entry.kind || "received" }, ticket));
    if (!apps.length) {
      waiting += 1;
      byTicket[ticket.id] = "waiting";
    } else if (hit) {
      matched += 1;
      byTicket[ticket.id] = "matched";
    } else {
      missing += 1;
      byTicket[ticket.id] = "missing";
    }
  }
  return { matched, waiting, missing, compared: true, byTicket };
}

function linkFor(saved, card, appWells) {
  if (saved?.linkLocked && saved.linkState === "linked" && saved.appWellId) return { state: "linked", appWellId: saved.appWellId, reason: saved.linkReason || "Chosen manually.", source: "manual" };
  if (saved?.linkLocked && saved.linkState === "none") return { state: "none", appWellId: "", reason: "", source: "manual" };
  if (saved?.linkState === "linked" && saved.appWellId && saved.linkSource === "manual") return { state: "linked", appWellId: saved.appWellId, reason: saved.linkReason || "Chosen manually.", source: "manual" };
  const rig = rigNorm(card.rig);
  const exact = (appWells || []).filter((well) => well.lsdNorm && card.lsdNorm && well.lsdNorm === card.lsdNorm && rig && rigNorm(well.rig) === rig);
  if (!saved?.linkLocked && exact.length === 1) return { state: "linked", appWellId: exact[0].id, reason: "Same LSD and rig.", source: "auto", name: exact[0].name || "" };
  if (saved?.linkState === "linked" && saved.appWellId) return { state: "linked", appWellId: saved.appWellId, reason: saved.linkReason || "", source: saved.linkSource || "manual", name: saved.appWellName || "" };
  const sameLsd = (appWells || []).filter((well) => well.lsdNorm && card.lsdNorm && well.lsdNorm === card.lsdNorm);
  if (sameLsd.length === 1) return { state: "suggested", appWellId: sameLsd[0].id, reason: "Same LSD. Rig was not an exact match.", source: "auto", name: sameLsd[0].name || "" };
  if (saved?.suggestionAppWellId) return { state: "suggested", appWellId: saved.suggestionAppWellId, reason: saved.linkReason || "Suggested.", source: saved.linkSource || "grok", name: saved.appWellName || "" };
  return { state: "none", appWellId: "", reason: "", source: "" };
}

function statusOf(link, match, count) {
  if (link.state !== "linked") return { tone: "grey", label: link.state === "suggested" ? "Pick the app well" : "No app well found" };
  if (!match.compared || (!match.matched && match.waiting && !match.missing)) return { tone: "amber", label: "Waiting for app report" };
  if (match.missing && !match.matched) return { tone: "red", label: "Not in app" };
  if (match.missing) return { tone: "red", label: "Mismatch" };
  if (match.waiting) return { tone: "amber", label: "Waiting on app / partial" };
  if (match.matched === count) return { tone: "green", label: `${count} of ${count} in app` };
  return { tone: "amber", label: "Waiting on app / partial" };
}

export function buildXpressBoard({ tickets = [], placements = [], savedCards = [], appWells = [] , appTickets = [] }) {
  const place = new Map((placements || []).map((row) => [row.ticketId || row.id, row]));
  const saved = new Map((savedCards || []).map((card) => [card.id, card]));
  const groups = new Map();
  const unassigned = [];
  for (const ticket of tickets || []) {
    if (ticket.source && ticket.source !== "xpress") continue;
    const manual = place.get(ticket.id);
    if (manual?.manual && manual.cardId) {
      const list = groups.get(manual.cardId) || [];
      list.push(ticket);
      groups.set(manual.cardId, list);
      continue;
    }
    const lsd = ticket.lsdNorm || lsdNorm(ticket.lsd);
    const rig = rigNorm(ticket.rig);
    if (!lsd && !rig) {
      unassigned.push(ticket);
      continue;
    }
    const id = autoCardId(lsd, rig);
    const list = groups.get(id) || [];
    list.push(ticket);
    groups.set(id, list);
  }
  const cards = [];
  for (const [id, list] of groups) {
    const stored = saved.get(id) || {};
    const sample = [...list].sort((a, b) => ticketWhen(a).localeCompare(ticketWhen(b)))[0];
    const lsd = stored.lsd || sample.lsd || "";
    const card = {
      id,
      name: stored.name || sample.wellName || sample.shipTo || sample.customer || "Unnamed well",
      operator: stored.operator || sample.customer || "",
      lsd,
      lsdNorm: stored.lsdNorm || sample.lsdNorm || lsdNorm(lsd),
      rig: stored.rig || sample.rig || "",
      manual: Boolean(stored.manual),
    };
    const link = linkFor(stored, card, appWells);
    const savedMatch = stored.match?.at ? { matched: Number(stored.match.matched) || 0, waiting: Number(stored.match.waiting) || 0, missing: Number(stored.match.missing) || 0, compared: true, byTicket: stored.match.byTicket || {} } : null;
    const match = savedMatch || matchTickets(list, link.state === "linked" ? link.appWellId : "", appTickets);
    const status = statusOf(link, match, list.length);
    const chips = [...list].sort((a, b) => ticketWhen(a).localeCompare(ticketWhen(b))).map((ticket) => publicTicket(ticket, place.get(ticket.id)));
    cards.push({ ...card, link, match, status, ticketCount: list.length, totalValue: roundMoney(chips.reduce((sum, ticket) => sum + ticket.value, 0)), tickets: chips });
  }
  for (const stored of savedCards || []) {
    if (!stored.manual || groups.has(stored.id)) continue;
    const link = linkFor(stored, stored, appWells);
    cards.push({ ...stored, lsdNorm: stored.lsdNorm || lsdNorm(stored.lsd), link, match: matchTickets([], "", []), status: statusOf(link, { compared: false }, 0), ticketCount: 0, totalValue: 0, tickets: [] });
  }
  cards.sort((a, b) => a.name.localeCompare(b.name));
  const loose = unassigned.map((ticket) => publicTicket(ticket, place.get(ticket.id)));
  loose.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  return { cards, unassigned: loose };
}

/** Unassigned tickets that have never been sent to Grok. Placed tickets and cached suggestions are not asked again. */
export function ticketsNeedingGrok(unassigned) {
  return (unassigned || []).filter((ticket) => !ticket.suggestion);
}

/** Grok may only file a ticket automatically when it is sure and the LSD is exactly the card's LSD. */
export function acceptGrokMove(suggestion, ticket, card) {
  if (!suggestion || suggestion.confidence !== "high" || !card) return false;
  const ticketLsd = ticket.lsdNorm || lsdNorm(ticket.lsd);
  const cardLsd = card.lsdNorm || lsdNorm(card.lsd);
  return Boolean(ticketLsd && cardLsd && ticketLsd === cardLsd && suggestion.cardId === card.id);
}
