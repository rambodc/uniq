// Inventory Bot callables for the Xpress well board. Browsers never touch Firestore.
// Staff need the inventoryBot mini app; super admins always have it.
// Ticket and stock documents are written by the collector outside this repo. This file does not
// rebuild wells, appTickets, issues, rigInventory, ticketStatus, reviewItems, flags, or chats.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { db, callable, requireMiniApp, text } from "./core.js";
import { copiedReportRows, isTestWell } from "./inventoryBot/copiedReports.js";
import { dayKey, docSlug, lsdNorm } from "./inventoryBot/engine.js";
import { acceptGrokLink, askGrokLinks, askGrokSort } from "./inventoryBot/grokSort.js";
import { buildRigBoard, correctionDocId } from "./inventoryBot/rigMatch.js";
import { acceptGrokMove, applyCitation, buildXpressBoard, cardsNeedingCitation, cardsNeedingGrok, citesWarehouseTicket, citedWellIds, ticketsNeedingGrok } from "./inventoryBot/xpressBoard.js";

const xaiApiKey = defineSecret("XAI_API_KEY");

const root = () => db.collection("inventoryBot").doc("main");
const col = (name) => root().collection(name);
const clip = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function asIso(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  return "";
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

function xpressTicket(id, data) {
  return {
    id, source: data.source || "xpress", type: data.type || "", rig: data.rig || "",
    lsd: data.lsd || "", lsdNorm: data.lsdNorm || lsdNorm(data.lsd),
    customer: data.customer || "", wellName: data.wellName || "", shipTo: data.shipTo || data.shipToName || "",
    shippedAt: data.shippedAt || null, deliveredAt: data.deliveredAt || null, date: data.date || null, postedAt: data.postedAt || null,
    collectedAt: data.collectedAt || null, total: asNumber(data.total),
    hasPdf: data.hasPdf === true, pdfPath: typeof data.pdfPath === "string" ? data.pdfPath : "",
    warehouseName: data.warehouseName || "",
    charges: Array.isArray(data.charges) ? data.charges : [],
    lines: Array.isArray(data.lines) ? data.lines.map((line) => ({ name: line.name || line.product || "", qty: asNumber(line.qty) || 0, unit: line.unit || "", price: asNumber(line.price) || 0 })) : [],
  };
}

function cardsName(source) {
  return source === "mim" ? "mimCards" : "xpressCards";
}

async function loadPieces(source) {
  const [ticketSnap, placeSnap, cardSnap, wellSnap] = await Promise.all([
    col("tickets").where("source", "==", source).get(),
    col("placements").get(),
    col(cardsName(source)).get(),
    col("appWells").get(),
  ]);
  return {
    source,
    tickets: ticketSnap.docs.map((doc) => xpressTicket(doc.id, doc.data())),
    placements: placeSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    savedCards: cardSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    appWells: wellSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((well) => !isTestWell(well)),
    appTickets: [],
  };
}

/** The box job copies app wells. This used to read the mirror; it now only reports the copy status. */
async function syncAppWells() {
  const sync = (await col("meta").doc("appReportSync").get()).data() || {};
  return { reads: 0, added: 0, operators: 0, status: sync.status || "" };
}

async function latestCopiedReports(wellId) {
  const ref = col("appWells").doc(wellId).collection("reports");
  const byDate = await ref.orderBy("date", "desc").limit(30).get();
  if (!byDate.empty) return byDate.docs;
  return (await ref.orderBy(FieldPath.documentId(), "desc").limit(30).get()).docs;
}

function rowsFromCopiedDocs(docs) {
  return docs.flatMap((doc) => copiedReportRows(doc.id, doc.data()));
}

async function rememberCardLinks(board, source) {
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
    await col(cardsName(source)).doc(card.id).set({
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

async function rankByCitedTickets(board, source) {
  const pending = cardsNeedingCitation(board.cards);
  if (!pending.length) return 0;
  let reads = 0;
  await pool(pending, 2, async (card) => {
    const candidates = (card.link.candidates || []).slice(0, 3);
    const reportsByWell = {};
    await Promise.all(candidates.map(async (candidate) => {
      const docs = await latestCopiedReports(candidate.id);
      reads += 1;
      reportsByWell[candidate.id] = rowsFromCopiedDocs(docs);
    }));
    const cited = citedWellIds(candidates, reportsByWell, card.tickets);
    const next = applyCitation(card, cited);
    Object.assign(card, next, { citationChecked: true });
    const patch = { id: card.id, name: card.name, lsd: card.lsd, lsdNorm: card.lsdNorm, rig: card.rig, citationChecked: true, citedWellIds: cited };
    if (card.link.state === "linked" && card.link.source === "auto") {
      patch.appWellId = card.link.appWellId;
      patch.appWellName = card.link.name || "";
      patch.linkState = "linked";
      patch.linkSource = "auto";
      patch.linkLocked = false;
      patch.linkReason = card.link.reason;
    }
    await col(cardsName(source)).doc(card.id).set(patch, { merge: true });
  });
  return reads;
}

async function publishBoard(request, source) {
  await requireMiniApp(request, "inventoryBot");
  let directory = { reads: 0, added: 0, operators: 0, error: "" };
  try { directory = { ...await syncAppWells(), error: "" }; }
  catch (error) { directory = { reads: 0, added: 0, operators: 0, error: error instanceof Error ? error.message : "The app copy status could not be read." }; }
  const pieces = await loadPieces(source);
  const board = buildXpressBoard(pieces);
  for (const card of board.cards) {
    const saved = pieces.savedCards.find((row) => row.id === card.id);
    if (saved?.citationChecked && card.link.state !== "linked") Object.assign(card, applyCitation(card, saved.citedWellIds || []), { citationChecked: true });
  }
  try { directory.citationReads = await rankByCitedTickets(board, source); }
  catch (error) { directory.citationReads = 0; directory.citationError = error instanceof Error ? error.message : "Candidate reports could not be read."; }
  try { directory.cardsAsked = (await rememberCardLinks(board, source)).asked; }
  catch (error) { directory.cardsAsked = 0; directory.linkError = error instanceof Error ? error.message : "Unlinked cards could not be checked."; }
  const pulledAt = pieces.tickets.map((ticket) => ticket.collectedAt).filter(Boolean).sort().at(-1) || "";
  for (const card of board.cards) {
    if (card.link.source === "auto" && card.link.state === "linked") {
      const prior = pieces.savedCards.find((row) => row.id === card.id);
      if (!prior?.linkLocked && prior?.appWellId !== card.link.appWellId) await col(cardsName(source)).doc(card.id).set({ id: card.id, name: card.name, operator: card.operator, lsd: card.lsd, lsdNorm: card.lsdNorm, rig: card.rig, appWellId: card.link.appWellId, linkState: "linked", linkSource: "auto", linkLocked: false, linkReason: card.link.reason }, { merge: true });
    }
  }
  return {
    ...board,
    pulledAt,
    directory,
    appWells: pieces.appWells.map((well) => ({ id: well.id, name: well.name || "", lsd: well.lsd || "", lsdNorm: well.lsdNorm || "", rig: well.rig || "", operator: well.operator || "", status: well.status || "" })),
  };
}

async function writeMatches(matches, prior) {
  const pending = matches.filter((row) => {
    const current = prior.get(row.id) || {};
    return current.rigKey !== row.rigKey || current.matchReason !== row.matchReason || current.matchConfidence !== row.matchConfidence;
  });
  for (let index = 0; index < pending.length; index += 400) {
    const batch = db.batch();
    for (const row of pending.slice(index, index + 400)) {
      batch.set(col("tickets").doc(row.id), { rigKey: row.rigKey, matchReason: row.matchReason, matchConfidence: row.matchConfidence }, { merge: true });
    }
    await batch.commit();
  }
}

async function publishRigBoard(request) {
  await requireMiniApp(request, "inventoryBot");
  const [ticketSnap, wellSnap, correctionSnap] = await Promise.all([
    col("tickets").where("source", "==", "xpress").get(),
    col("appWells").get(),
    col("corrections").get(),
  ]);
  const tickets = ticketSnap.docs.map((doc) => ({ ...xpressTicket(doc.id, doc.data()), ticketNumber: doc.data().ticketNumber || "" }));
  const wells = wellSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const corrections = correctionSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const board = buildRigBoard({ tickets, wells, corrections });
  await writeMatches(board.matches, new Map(ticketSnap.docs.map((doc) => [doc.id, doc.data()])));
  const pulledAt = tickets.map((ticket) => ticket.collectedAt).filter(Boolean).sort().at(-1) || "";
  return { rigs: board.rigs, quietRigs: board.quietRigs, unassigned: board.unassigned, warehouse: board.warehouse, pulledAt };
}

export const inventoryBotXpressBoard = onCall({ ...callable, timeoutSeconds: 120 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  return publishRigBoard(request);
});
export const inventoryBotMimBoard = onCall({ ...callable, secrets: [xaiApiKey], timeoutSeconds: 120 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  return publishBoard(request, "mim");
});

export const inventoryBotMoveTicket = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const ticketId = text(request.data?.ticketId, "ticket", 200);
  let cardId = clip(request.data?.cardId, 200);
  if (request.data?.create && typeof request.data.create === "object") {
    const name = text(request.data.create.name, "well name", 160);
    cardId = `manual-${docSlug(name)}-${Date.now().toString(36)}`;
    await col(cardsName(request.data?.source)).doc(cardId).set({
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
  await col(cardsName(request.data?.source)).doc(cardId).set({
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

async function openBoardWell(request, source) {
  await requireMiniApp(request, "inventoryBot");
  const cardId = text(request.data?.cardId, "card", 200);
  const pieces = await loadPieces(source);
  const board = buildXpressBoard(pieces);
  const found = board.cards.find((row) => row.id === cardId);
  const ours = found?.tickets || [];
  const emptyMatch = { matched: 0, missing: 0, waiting: ours.length };
  const cardSnap = await col(cardsName(source)).doc(cardId).get();
  const card = cardSnap.exists ? cardSnap.data() : {};
  const appWellId = card.appWellId || found?.link?.appWellId || "";
  if (!appWellId) return { appWell: null, appTickets: [], tickets: ours, match: emptyMatch, reads: { well: 0, reports: 0, reportCount: 0 }, unavailable: false, appDataAsOf: "", syncStatus: "", note: "No app well is linked." };
  try {
    const [wellSnap, syncSnap, reportDocs] = await Promise.all([
      col("appWells").doc(appWellId).get(),
      col("meta").doc("appReportSync").get(),
      latestCopiedReports(appWellId),
    ]);
    const data = wellSnap.exists ? wellSnap.data() : {};
    const sync = syncSnap.data() || {};
    const appWell = wellSnap.exists ? {
      id: appWellId,
      name: data.name || "",
      lsd: data.lsd || "",
      lsdNorm: data.lsdNorm || "",
      rig: data.rig || "",
      operator: data.operator || "",
      status: data.status || "",
    } : null;
    const appTickets = rowsFromCopiedDocs(reportDocs);
    const compared = ours.map((ticket) => {
      const hit = appTickets.find((row) => row.warehouse && citesWarehouseTicket({ kind: row.kind === "returned" ? "returned" : "received", rawTicket: row.rawTicket }, ticket));
      return { ...ticket, inApp: hit ? "matched" : (appTickets.length ? "missing" : "waiting"), appTicket: hit || null };
    });
    const match = { matched: compared.filter((row) => row.inApp === "matched").length, missing: compared.filter((row) => row.inApp === "missing").length, waiting: compared.filter((row) => row.inApp === "waiting").length, byTicket: Object.fromEntries(compared.map((row) => [row.id, row.inApp])), at: new Date().toISOString() };
    if (appTickets.length) await col(cardsName(source)).doc(cardId).set({ match }, { merge: true });
    const copied = Boolean(wellSnap.exists && (Number(data.reportCount) > 0 || appTickets.length > 0 || data.reportsSyncedAt));
    return {
      appWell,
      appTickets,
      tickets: compared,
      match,
      reads: { well: 1, reports: 1, reportCount: appTickets.length },
      unavailable: false,
      appDataAsOf: asIso(data.reportsSyncedAt),
      syncStatus: sync.status || "",
      note: copied ? "" : "App data not copied yet",
    };
  } catch (error) {
    return { appWell: null, appTickets: [], tickets: ours, match: emptyMatch, reads: { well: 0, reports: 0, reportCount: 0 }, unavailable: true, appDataAsOf: "", syncStatus: "", note: error instanceof Error ? error.message : "App data unavailable right now" };
  }
}

export const inventoryBotOpenXpressWell = onCall({ ...callable, timeoutSeconds: 60 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  return openBoardWell(request, "xpress");
});
export const inventoryBotOpenMimWell = onCall({ ...callable, timeoutSeconds: 60 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  return openBoardWell(request, "mim");
});

export const inventoryBotRequestWellRefresh = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const wellId = text(request.data?.wellId, "well", 240);
  await col("refreshRequests").doc(wellId).set({
    wellId,
    requestedAt: new Date().toISOString(),
    requestedBy: access.email || "",
    status: "pending",
  }, { merge: true });
  return { ok: true };
});

const RIG_KEY = /^[0-9]+~[a-z0-9]*$/;

export const inventoryBotSaveCorrection = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const type = text(request.data?.type, "type", 40);
  const note = clip(request.data?.note, 500);
  const now = new Date().toISOString();
  const by = access.email || "";
  if (type === "merge") {
    const alias = text(request.data?.rigKey, "rig", 200);
    const into = text(request.data?.into, "rig", 200);
    if (!RIG_KEY.test(alias) || !RIG_KEY.test(into) || alias === into) throw new HttpsError("invalid-argument", "Choose a different rig.");
    const id = correctionDocId("merge", alias);
    await col("corrections").doc(id).set({ id, type: "merge", rigKey: alias, into, by, at: now, note, undone: false, undoneBy: "", undoneAt: "" });
    return { ok: true, id };
  }
  if (type === "wellRig" || type === "ticketRig") {
    const rigKey = text(request.data?.rigKey, "rig", 200);
    if (!RIG_KEY.test(rigKey)) throw new HttpsError("invalid-argument", "Choose a rig.");
    const subject = type === "wellRig" ? text(request.data?.wellId, "well", 240) : text(request.data?.ticketId, "ticket", 200);
    const id = correctionDocId(type === "wellRig" ? "well" : "ticket", subject);
    const payload = { id, type, rigKey, by, at: now, note, undone: false, undoneBy: "", undoneAt: "" };
    if (type === "wellRig") payload.wellId = subject;
    else payload.ticketId = subject;
    await col("corrections").doc(id).set(payload);
    return { ok: true, id };
  }
  throw new HttpsError("invalid-argument", "Unknown correction.");
});

export const inventoryBotUndoCorrection = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const ids = (Array.isArray(request.data?.ids) ? request.data.ids : [request.data?.id])
    .map((id) => clip(id, 240))
    .filter((id) => /^(merge|well|ticket)__/.test(id))
    .slice(0, 20);
  if (!ids.length) throw new HttpsError("invalid-argument", "Nothing to undo.");
  const now = new Date().toISOString();
  await Promise.all(ids.map((id) => col("corrections").doc(id).set({ undone: true, undoneBy: access.email || "", undoneAt: now }, { merge: true })));
  return { ok: true };
});

export const inventoryBotOpenAppWell = onCall({ ...callable, timeoutSeconds: 60 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const wellId = text(request.data?.wellId, "well", 240);
  const wellSnap = await col("appWells").doc(wellId).get();
  const data = wellSnap.exists ? wellSnap.data() : null;
  if (!data || isTestWell(data)) throw new HttpsError("not-found", "That well is not on the board.");
  const docs = await latestCopiedReports(wellId);
  const reports = docs.map((doc) => {
    const row = doc.data() || {};
    return { id: doc.id, date: dayKey(row.date || row.reportDate || "") || String(row.date || "").slice(0, 10), number: String(row.number || row.reportNumber || doc.id) };
  });
  return {
    well: {
      id: wellId,
      name: data.name || "",
      lsd: data.lsd || "",
      status: data.status || "",
      operator: data.operator || data.operator_name || "",
      rig: String(data.rig ?? ""),
      firstReport: dayKey(data.firstReportDate || ""),
      lastReport: dayKey(data.lastReportDate || ""),
    },
    reports,
  };
});

export const inventoryBotGrokSort = onCall({ ...callable, secrets: [xaiApiKey], timeoutSeconds: 120 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const pieces = await loadPieces("xpress");
  const board = buildXpressBoard(pieces);
  const cardLinks = await rememberCardLinks(board, "xpress");
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
