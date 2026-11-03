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

function lsdParts(value) {
  const match = String(value || "").match(/^(\d+)-(\d+)-(\d+)-(\d+)([WE])(\d+)$/);
  if (!match) return null;
  return { lsd: Number(match[1]), sec: Number(match[2]), twp: Number(match[3]), rge: Number(match[4]), mer: match[5], num: Number(match[6]) };
}

/** Same township and range, with a meridian typo (W4 vs W0) or a neighbouring section. */
export function lsdNear(left, right) {
  const a = lsdParts(left);
  const b = lsdParts(right);
  if (!a || !b || left === right) return false;
  if (a.twp !== b.twp || a.rge !== b.rge || a.mer !== b.mer) return false;
  if (a.sec === b.sec && a.lsd === b.lsd && a.num !== b.num) return true;
  return a.num === b.num && Math.abs(a.sec - b.sec) <= 1 && Math.abs(a.lsd - b.lsd) <= 1;
}

function asCandidate(well) {
  return { id: well.id, name: well.name || "", lsd: well.lsd || well.lsdNorm || "", rig: well.rig || "", operator: well.operator || "" };
}

function linkFor(saved, card, appWells) {
  const base = { candidates: [], grokTried: Boolean(saved?.grokTried), grok: saved?.grokAppWellId ? { appWellId: saved.grokAppWellId, name: saved.grokAppWellName || "", reason: saved.grokReason || "" } : null };
  if (saved?.linkLocked && saved.linkState === "linked" && saved.appWellId) return { ...base, state: "linked", appWellId: saved.appWellId, reason: saved.linkReason || "Chosen manually.", source: "manual", name: saved.appWellName || "" };
  if (saved?.linkLocked && saved.linkState === "none") return { ...base, state: "none", appWellId: "", reason: "Link cleared.", source: "manual" };
  if (saved?.linkState === "linked" && saved.appWellId && saved.linkSource === "manual") return { ...base, state: "linked", appWellId: saved.appWellId, reason: saved.linkReason || "Chosen manually.", source: "manual", name: saved.appWellName || "" };
  const wells = appWells || [];
  const rig = rigNorm(card.rig);
  const exact = wells.filter((well) => well.lsdNorm && card.lsdNorm && well.lsdNorm === card.lsdNorm && rig && rigNorm(well.rig) === rig);
  if (!saved?.linkLocked && exact.length === 1) return { ...base, state: "linked", appWellId: exact[0].id, reason: "Same LSD and rig.", source: "auto", name: exact[0].name || "" };
  if (saved?.linkState === "linked" && saved.appWellId) return { ...base, state: "linked", appWellId: saved.appWellId, reason: saved.linkReason || "", source: saved.linkSource || "manual", name: saved.appWellName || "" };
  const sameLsd = wells.filter((well) => well.lsdNorm && card.lsdNorm && well.lsdNorm === card.lsdNorm);
  let candidates = [];
  let reason = "no app well found";
  if (sameLsd.length > 1) {
    reason = "multiple app wells share this LSD";
    candidates = sameLsd.map(asCandidate);
  } else {
    const near = wells.filter((well) => well.lsdNorm !== card.lsdNorm && (lsdNear(card.lsdNorm, well.lsdNorm) || (rig && rigNorm(well.rig) === rig)));
    near.sort((a, b) => {
      const rank = (well) => (lsdParts(card.lsdNorm) && lsdParts(well.lsdNorm) && lsdParts(card.lsdNorm).num !== lsdParts(well.lsdNorm).num && lsdParts(card.lsdNorm).sec === lsdParts(well.lsdNorm).sec ? 0 : lsdNear(card.lsdNorm, well.lsdNorm) ? 1 : 2);
      return rank(a) - rank(b);
    });
    const pool = sameLsd.length === 1 ? [sameLsd[0], ...near.filter((well) => well.id !== sameLsd[0].id)] : near;
    candidates = pool.slice(0, 5).map(asCandidate);
    if (candidates.length) reason = "location differs from app";
  }
  return { ...base, state: candidates.length ? "suggested" : "none", appWellId: "", reason, source: "", candidates };
}

function statusOf(link, match, count) {
  if (link.state !== "linked") return { tone: "grey", label: link.reason || "no app well found" };
  if (!match.compared || (!match.matched && match.waiting && !match.missing)) return { tone: "amber", label: "Waiting for app report" };
  if (match.missing && !match.matched) return { tone: "red", label: "Not in app" };
  if (match.missing) return { tone: "red", label: "Mismatch" };
  if (match.waiting) return { tone: "amber", label: "Waiting on app / partial" };
  if (match.matched === count) return { tone: "green", label: `${count} of ${count} in app` };
  return { tone: "amber", label: "Waiting on app / partial" };
}

const WAREHOUSE_TYPES = new Set(["MR", "ST", "STX"]);

export function warehouseOnlyType(ticket) {
  return WAREHOUSE_TYPES.has(String(ticket?.type || "").toUpperCase());
}

export function placeholderName(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (/unnamed/i.test(text)) return true;
  if (/di-?corp/i.test(text)) return true;
  if (/\brig\b/i.test(text) && !/\d+-\d+-\d+/.test(text)) return true;
  if (/^\d+$/.test(text)) return true;
  return false;
}

function usableName(list, stored) {
  if (stored?.name && !placeholderName(stored.name)) return stored.name;
  for (const ticket of list) {
    for (const value of [ticket.wellName, ticket.shipTo, ticket.shipToName, ticket.rig]) {
      if (!placeholderName(value)) return String(value).trim();
    }
  }
  return "";
}

export function buildXpressBoard({ tickets = [], placements = [], savedCards = [], appWells = [] , appTickets = [] }) {
  const place = new Map((placements || []).map((row) => [row.ticketId || row.id, row]));
  const saved = new Map((savedCards || []).map((card) => [card.id, card]));
  const groups = new Map();
  const unassigned = [];
  let warehouseOnly = 0;
  for (const ticket of tickets || []) {
    if (ticket.source && ticket.source !== "xpress") continue;
    const manual = place.get(ticket.id);
    if (manual?.manual && manual.cardId) {
      const list = groups.get(manual.cardId) || [];
      list.push(ticket);
      groups.set(manual.cardId, list);
      continue;
    }
    if (warehouseOnlyType(ticket)) {
      warehouseOnly += 1;
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
    const lsdKey = stored.lsdNorm || sample.lsdNorm || lsdNorm(lsd);
    const name = usableName(list, stored) || (lsdKey ? `LSD ${lsd || lsdKey}` : "");
    if (!stored.manual && !lsdKey && !name) {
      unassigned.push(...list);
      continue;
    }
    const card = {
      id,
      name: name || "Unnamed well",
      operator: stored.operator || sample.customer || "",
      lsd,
      lsdNorm: lsdKey,
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
  return { cards, unassigned: loose, warehouseOnly };
}

/** Unassigned tickets that have never been sent to Grok. Placed tickets and cached suggestions are not asked again. */
export function ticketsNeedingGrok(unassigned) {
  return (unassigned || []).filter((ticket) => !ticket.suggestion);
}

/** Unlinked cards are asked once. A saved grokTried flag means that card is not sent again. */
export function cardsNeedingGrok(cards) {
  return (cards || []).filter((card) => card.link?.state !== "linked" && !card.link?.grokTried && !card.grokTried);
}

/** Grok may only file a ticket automatically when it is sure and the LSD is exactly the card's LSD. */
export function acceptGrokMove(suggestion, ticket, card) {
  if (!suggestion || suggestion.confidence !== "high" || !card) return false;
  const ticketLsd = ticket.lsdNorm || lsdNorm(ticket.lsd);
  const cardLsd = card.lsdNorm || lsdNorm(card.lsd);
  return Boolean(ticketLsd && cardLsd && ticketLsd === cardLsd && suggestion.cardId === card.id);
}
