// Inventory Bot callables for the Xpress well board. Browsers never touch Firestore.
// Staff need the inventoryBot mini app; super admins always have it.
// Ticket and stock documents are written by the collector outside this repo. This file does not
// rebuild wells, appTickets, issues, rigInventory, ticketStatus, reviewItems, flags, or chats.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { applicationDefault, getApp, getApps, initializeApp } from "firebase-admin/app";
import { defineSecret } from "firebase-functions/params";
import { db, callable, requireMiniApp, text } from "./core.js";
import { docSlug, lsdNorm, todayKey } from "./inventoryBot/engine.js";
import { acceptGrokLink, askGrokLinks, askGrokSort } from "./inventoryBot/grokSort.js";
import { MIRROR_URL, directoryQuery, listNewWellIds, mirrorGet, readSlimReports, readSlimWell, reportTickets } from "./inventoryBot/mirrorWells.js";
import { acceptGrokMove, buildXpressBoard, cardsNeedingGrok, citesWarehouseTicket, ticketsNeedingGrok } from "./inventoryBot/xpressBoard.js";

const xaiApiKey = defineSecret("XAI_API_KEY");

const root = () => db.collection("inventoryBot").doc("main");
const col = (name) => root().collection(name);
const clip = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function mirrorApp() {
  const existing = getApps().find((app) => app.name === "mirror");
  if (existing) return existing;
  const credential = getApp().options.credential || applicationDefault();
  return initializeApp({ credential, databaseURL: MIRROR_URL }, "mirror");
}

async function pool(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function wellPatch(row) {
  const out = { id: row.id };
  for (const key of ["name", "lsd", "lsdNorm", "rig", "contractor", "operator", "status"]) if (row[key]) out[key] = row[key];
  return out;
}

async function commitRows(rows) {
  for (let index = 0; index < rows.length; index += 400) {
    const batch = db.batch();
    for (const row of rows.slice(index, index + 400)) batch.set(col("appWells").doc(row.id), wellPatch(row), { merge: true });
    await batch.commit();
  }
}

function xpressTicket(id, data) {
  return {
    id, source: data.source || "xpress", type: data.type || "", rig: data.rig || "",
    lsd: data.lsd || "", lsdNorm: data.lsdNorm || lsdNorm(data.lsd),
    customer: data.customer || "", wellName: data.wellName || "", shipTo: data.shipTo || data.shipToName || "",
    shippedAt: data.shippedAt || null, deliveredAt: data.deliveredAt || null, date: data.date || null, postedAt: data.postedAt || null,
    collectedAt: data.collectedAt || null, total: asNumber(data.total),
    lines: Array.isArray(data.lines) ? data.lines.map((line) => ({ name: line.name || line.product || "", qty: asNumber(line.qty) || 0, unit: line.unit || "", price: asNumber(line.price) || 0 })) : [],
  };
}

async function loadXpressPieces() {
  const [ticketSnap, placeSnap, cardSnap, wellSnap] = await Promise.all([
    col("tickets").where("source", "==", "xpress").get(),
    col("placements").get(),
    col("xpressCards").get(),
    col("appWells").get(),
  ]);
  return {
    tickets: ticketSnap.docs.map((doc) => xpressTicket(doc.id, doc.data())),
    placements: placeSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    savedCards: cardSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    appWells: wellSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    appTickets: [],
  };
}

async function syncAppWells() {
  const metaRef = col("meta").doc("appWellSync");
  const meta = (await metaRef.get()).data() || {};
  const today = todayKey();
  const app = mirrorApp();
  let reads = 0;
  const get = async (path, params) => {
    reads += 1;
    return mirrorGet(app, path, params);
  };
  let fieldMap = meta.fieldMap || null;
  let added = 0;
  if (meta.syncedOn !== today) {
    const query = directoryQuery(today, meta.lastKey || "");
    const ids = query.reads ? await listNewWellIds(get, query) : [];
    const rows = [];
    for (const id of ids) {
      const slim = await readSlimWell(get, id, fieldMap);
      fieldMap = slim.fieldMap || fieldMap;
      rows.push(slim.well);
    }
    if (rows.length) await commitRows(rows);
    added = rows.length;
    await metaRef.set({
      lastKey: ids.at(-1) || meta.lastKey || "",
      syncedOn: today,
      syncedAt: new Date().toISOString(),
      windowStart: query.windowStart,
      fieldMap: fieldMap || null,
    }, { merge: true });
  }
  let operators = 0;
  if (meta.slimVersion !== 2) {
    const snap = await col("appWells").select("operator").get();
    const missing = snap.docs.filter((doc) => !doc.get("operator")).map((doc) => doc.id);
    const skip = new Set();
    if (missing.length && !fieldMap?.operator) {
      const learned = await readSlimWell(get, missing[0], null);
      fieldMap = learned.fieldMap;
      skip.add(missing[0]);
      if (learned.well.operator) {
        await col("appWells").doc(missing[0]).set({ operator: learned.well.operator }, { merge: true });
        operators += 1;
      }
    }
    const operatorField = fieldMap?.operator || "";
    if (operatorField) {
      const found = await pool(missing.filter((id) => !skip.has(id)), 12, async (id) => {
        const value = await get(`data/wells/${encodeURIComponent(id)}/${encodeURIComponent(operatorField)}`, {});
        const operator = typeof value === "string" ? value.trim() : (value && typeof value === "object" ? String(value.name || value.operator_name || "").trim() : "");
        return operator ? { id, operator } : null;
      });
      const updates = found.filter(Boolean);
      if (updates.length) await commitRows(updates);
      operators += updates.length;
    }
    await metaRef.set({ slimVersion: 2, fieldMap: fieldMap || null, operatorsBackfilled: operators, backfilledAt: new Date().toISOString() }, { merge: true });
  }
  return { reads, added, operators };
}

async function rememberCardLinks(board) {
  const pending = cardsNeedingGrok(board.cards).slice(0, 20);
  if (!pending.length) return { asked: 0 };
  const payload = pending.map((card) => ({
    id: card.id,
    name: card.name,
    lsd: card.lsd,
    rig: card.rig,
    reason: card.link.reason,
    candidates: (card.link.candidates || []).map((well) => ({ id: well.id, name: well.name, lsd: well.lsd, rig: well.rig })),
  }));
  const links = await askGrokLinks({ apiKey: xaiApiKey.value(), cards: payload, fetchImpl: globalThis.fetch });
  for (const card of pending) {
    const suggestion = links.find((row) => row.cardId === card.id);
    const allowed = acceptGrokLink(suggestion, card.link.candidates);
    const well = allowed ? card.link.candidates.find((row) => row.id === suggestion.appWellId) : null;
    await col("xpressCards").doc(card.id).set({
      id: card.id,
      name: card.name,
      lsd: card.lsd,
      lsdNorm: card.lsdNorm,
      rig: card.rig,
      grokTried: true,
      grokAppWellId: well?.id || "",
      grokAppWellName: well?.name || "",
      grokReason: well ? suggestion.reason : "",
    }, { merge: true });
    card.link.grokTried = true;
    card.link.grok = well ? { appWellId: well.id, name: well.name, reason: suggestion.reason } : null;
  }
  return { asked: pending.length };
}

export const inventoryBotXpressBoard = onCall({ ...callable, secrets: [xaiApiKey], timeoutSeconds: 120 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  let directory = { reads: 0, added: 0, operators: 0, error: "" };
  try { directory = { ...await syncAppWells(), error: "" }; }
  catch (error) { directory = { reads: 0, added: 0, operators: 0, error: error instanceof Error ? error.message : "The app well directory could not be refreshed." }; }
  const pieces = await loadXpressPieces();
  const board = buildXpressBoard(pieces);
  try { directory.cardsAsked = (await rememberCardLinks(board)).asked; }
  catch (error) { directory.cardsAsked = 0; directory.linkError = error instanceof Error ? error.message : "Unlinked cards could not be checked."; }
  const pulledAt = pieces.tickets.map((ticket) => ticket.collectedAt).filter(Boolean).sort().at(-1) || "";
  for (const card of board.cards) {
    if (card.link.source === "auto" && card.link.state === "linked") {
      const prior = pieces.savedCards.find((row) => row.id === card.id);
      if (!prior?.linkLocked && prior?.appWellId !== card.link.appWellId) await col("xpressCards").doc(card.id).set({ id: card.id, name: card.name, operator: card.operator, lsd: card.lsd, lsdNorm: card.lsdNorm, rig: card.rig, appWellId: card.link.appWellId, linkState: "linked", linkSource: "auto", linkLocked: false, linkReason: card.link.reason }, { merge: true });
    }
  }
  return {
    ...board,
    pulledAt,
    directory,
    appWells: pieces.appWells.map((well) => ({ id: well.id, name: well.name || "", lsd: well.lsd || "", lsdNorm: well.lsdNorm || "", rig: well.rig || "", operator: well.operator || "", status: well.status || "" })),
  };
});

export const inventoryBotMoveTicket = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const ticketId = text(request.data?.ticketId, "ticket", 200);
  let cardId = clip(request.data?.cardId, 200);
  if (request.data?.create && typeof request.data.create === "object") {
    const name = text(request.data.create.name, "well name", 160);
    cardId = `manual-${docSlug(name)}-${Date.now().toString(36)}`;
    await col("xpressCards").doc(cardId).set({
      id: cardId, name, manual: true,
      operator: clip(request.data.create.operator, 160),
      lsd: clip(request.data.create.lsd, 80),
      lsdNorm: lsdNorm(request.data.create.lsd),
      rig: clip(request.data.create.rig, 80),
      linkState: "none", linkLocked: false, linkSource: "",
    });
  }
  if (!cardId) throw new HttpsError("invalid-argument", "Choose a well card.");
  await col("placements").doc(ticketId).set({ ticketId, cardId, manual: true, at: new Date().toISOString(), by: access.email }, { merge: true });
  return { ok: true, cardId };
});

export const inventoryBotLinkAppWell = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const cardId = text(request.data?.cardId, "card", 200);
  const appWellId = clip(request.data?.appWellId, 240);
  await col("xpressCards").doc(cardId).set({
    id: cardId,
    appWellId,
    appWellName: clip(request.data?.appWellName, 160),
    linkState: appWellId ? "linked" : "none",
    linkLocked: true,
    linkSource: "manual",
    linkReason: appWellId ? `Linked by ${access.email}.` : "Link cleared.",
  }, { merge: true });
  return { ok: true };
});

export const inventoryBotOpenXpressWell = onCall({ ...callable, timeoutSeconds: 60 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const cardId = text(request.data?.cardId, "card", 200);
  const cardSnap = await col("xpressCards").doc(cardId).get();
  const card = cardSnap.exists ? cardSnap.data() : {};
  const appWellId = card.appWellId || "";
  if (!appWellId) return { appWell: null, appTickets: [], reads: { well: 0, reports: 0 }, note: "No app well is linked." };
  const meta = (await col("meta").doc("appWellSync").get()).data() || {};
  const app = mirrorApp();
  let wellReads = 0;
  let reportReads = 0;
  const getWell = async (path, params) => {
    wellReads += 1;
    return mirrorGet(app, path, params);
  };
  const getReport = async (path, params) => {
    reportReads += 1;
    return mirrorGet(app, path, params);
  };
  const slim = await readSlimWell(getWell, appWellId, meta.fieldMap || null);
  const slimReports = await readSlimReports(getReport, appWellId, 30);
  const appWell = slim.well;
  const appTickets = reportTickets(slimReports.reports);
  const pieces = await loadXpressPieces();
  const board = buildXpressBoard(pieces);
  const found = board.cards.find((row) => row.id === cardId);
  const ours = found?.tickets || [];
  const compared = ours.map((ticket) => {
    const hit = appTickets.find((row) => row.warehouse && citesWarehouseTicket({ kind: row.kind === "returned" ? "returned" : "received", rawTicket: row.rawTicket }, ticket));
    return { ...ticket, inApp: hit ? "matched" : (appTickets.length ? "missing" : "waiting"), appTicket: hit || null };
  });
  const match = { matched: compared.filter((row) => row.inApp === "matched").length, missing: compared.filter((row) => row.inApp === "missing").length, waiting: compared.filter((row) => row.inApp === "waiting").length, byTicket: Object.fromEntries(compared.map((row) => [row.id, row.inApp])), at: new Date().toISOString() };
  await col("xpressCards").doc(cardId).set({ match }, { merge: true });
  if (slim.fieldMap && !meta.fieldMap) await col("meta").doc("appWellSync").set({ fieldMap: slim.fieldMap }, { merge: true });
  return { appWell, appTickets, tickets: compared, match, reads: { well: wellReads, reports: reportReads, reportCount: appTickets.length } };
});

export const inventoryBotGrokSort = onCall({ ...callable, secrets: [xaiApiKey], timeoutSeconds: 120 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const pieces = await loadXpressPieces();
  const board = buildXpressBoard(pieces);
  const cardLinks = await rememberCardLinks(board);
  const tickets = ticketsNeedingGrok(board.unassigned).map((ticket) => ({ id: ticket.id, number: ticket.number, date: ticket.date, customer: ticket.customer, shipTo: ticket.shipTo, rig: ticket.rig, lsd: ticket.lsd, value: ticket.value }));
  if (!tickets.length) return { suggestions: [], accepted: 0, skipped: board.unassigned.length, cardsAsked: cardLinks.asked };
  const cards = board.cards.map((card) => ({ id: card.id, name: card.name, lsd: card.lsd, lsdNorm: card.lsdNorm, rig: card.rig }));
  const suggestions = await askGrokSort({ apiKey: xaiApiKey.value(), cards, tickets, fetchImpl: globalThis.fetch });
  let accepted = 0;
  for (const suggestion of suggestions) {
    const ticket = pieces.tickets.find((row) => row.id === suggestion.ticketId);
    const card = cards.find((row) => row.id === suggestion.cardId);
    const prior = pieces.placements.find((row) => (row.ticketId || row.id) === suggestion.ticketId);
    if (prior?.manual) continue;
    if (acceptGrokMove(suggestion, ticket || {}, card)) {
      await col("placements").doc(suggestion.ticketId).set({ ticketId: suggestion.ticketId, cardId: suggestion.cardId, manual: true, by: "grok-exact", at: new Date().toISOString(), suggestion }, { merge: true });
      accepted += 1;
    } else if (card) {
      await col("placements").doc(suggestion.ticketId).set({ ticketId: suggestion.ticketId, manual: false, suggestion }, { merge: true });
    }
  }
  return { suggestions, accepted, cardsAsked: cardLinks.asked };
});
