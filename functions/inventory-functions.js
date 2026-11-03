// Inventory Bot callables. Browsers never touch Firestore. Staff need the inventoryBot mini app;
// super admins always have it. inventoryBotRunChecks is also what the external collector calls
// after it writes a day's documents. App Check is off on that callable. The collector can instead set
// runs/{date}.checksRequestedAt and inventoryBotRunWritten runs the same checks with no Auth token.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { defineSecret } from "firebase-functions/params";
import { db, callable, requireMiniApp, requireSuperAdmin, text } from "./core.js";
import { completeInventoryChat } from "./inventoryBot/chat.js";
import { checksRequestChanged, configFromMain, dayKey, docSlug, isTicketPdfPath, isTicketType, lsdNorm, nameNorm, rigNorm, runChecks, stockItemKey, ticketLookupId, todayKey } from "./inventoryBot/engine.js";
import { applyFlag, buildCoverage, compactStockSnapshots, FLAG_STATUSES, movedReviewFlag, reconcileCoverage, reviewDocuments } from "./inventoryBot/coverage.js";
import { askGrokSort } from "./inventoryBot/grokSort.js";
import { MIRROR_URL, directoryRange, reportTickets, slimWell } from "./inventoryBot/mirrorWells.js";
import { acceptGrokMove, buildXpressBoard, citesWarehouseTicket, ticketsNeedingGrok } from "./inventoryBot/xpressBoard.js";

const xaiApiKey = defineSecret("XAI_API_KEY");
const SYSTEM = "You are the UniqEnergy inventory assistant. The warehouse ticket is the source of truth. Answer only from the tool results about the selected well, ticket, or review item. Never invent ticket numbers, quantities, or dollar amounts. Say what is off and what data is missing. If the tools do not contain the answer, say you could not find it and call addNote with forGrokBot true so the question is saved for the next daily check. Keep the answer short.";

const root = () => db.collection("inventoryBot").doc("main");
const col = (name) => root().collection(name);
const clip = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function cleanDate(value) {
  if (value == null || value === "") return todayKey();
  const day = dayKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpsError("invalid-argument", "Enter a valid date.");
  return day;
}
function limitOf(value, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return max;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function ticketSummary(id, data) {
  return {
    id, source: data.source || "", company: data.company || "", type: data.type || "",
    warehouseCode: data.warehouseCode || "", warehouseName: data.warehouseName || "",
    rig: data.rig || "", lsd: data.lsd || "", lsdNorm: data.lsdNorm || lsdNorm(data.lsd),
    customer: data.customer || "", wellName: data.wellName || "",
    shippedAt: data.shippedAt || null, postedAt: data.postedAt || null,
    total: asNumber(data.total), hasPdf: data.hasPdf === true || isTicketPdfPath(data.pdfPath),
  };
}
function ticketDetail(id, data) {
  return {
    ...ticketSummary(id, data),
    orderedBy: data.orderedBy || "", carrier: data.carrier || "", poAfe: data.poAfe || "", refTicket: data.refTicket || "",
    lsdGrid: data.lsdGrid || "", pdfPath: isTicketPdfPath(data.pdfPath) ? data.pdfPath : "",
    relatedTickets: Array.isArray(data.relatedTickets) ? data.relatedTickets : [],
    lines: Array.isArray(data.lines) ? data.lines : [],
    charges: Array.isArray(data.charges) ? data.charges : [],
    collectedAt: data.collectedAt || null, runId: data.runId || "",
  };
}
function publicIssue(id, data) {
  return {
    id, date: data.date || "", rule: data.rule || "", severity: data.severity || "low",
    title: data.title || "", detail: data.detail || "", wellId: data.wellId || "", rig: data.rig || "", lsd: data.lsd || "",
    ticketIds: Array.isArray(data.ticketIds) ? data.ticketIds : [],
    products: Array.isArray(data.products) ? data.products : [],
    dollarValue: asNumber(data.dollarValue) || 0, status: data.status || "open", note: data.note || "",
    resolvedBy: data.resolvedBy || "", resolvedAt: data.resolvedAt || null,
  };
}
function publicWell(id, data) {
  return {
    id, name: data.name || "", lsd: data.lsd || "", lsdNorm: data.lsdNorm || lsdNorm(data.lsd),
    rig: data.rig || "", contractor: data.contractor || "", operator: data.operator || "",
    province: data.province || "", status: data.status || "", spudDate: data.spudDate || null,
    pricelist: data.pricelist || "", lastReportId: data.lastReportId || data.newestReportId || "", lastReportDate: data.lastReportDate || null,
    newestReportId: data.newestReportId || "", openingReportId: data.openingReportId || "", openingReportDate: data.openingReportDate || null,
    openingRemaining: Array.isArray(data.openingRemaining) ? data.openingRemaining : [], remainingSource: data.remainingSource || "",
    remaining: Array.isArray(data.remaining) ? data.remaining : [],
    received: Array.isArray(data.received) ? data.received : [],
    returned: Array.isArray(data.returned) ? data.returned : [],
    used: Array.isArray(data.used) ? data.used : [],
    costs: data.costs || null,
    services: Array.isArray(data.services) ? data.services : [],
    otherServices: Array.isArray(data.otherServices) ? data.otherServices : [],
    initials: data.initials || "",
    updatedAt: data.updatedAt || null,
  };
}
function publicRun(date, data) {
  if (!data) return null;
  return { date, startedAt: data.startedAt || null, finishedAt: data.finishedAt || null, checkedAt: data.checkedAt || null, sources: data.sources || {}, summary: data.summary || null };
}

async function commitAll(ops) {
  for (let index = 0; index < ops.length; index += 400) {
    const batch = db.batch();
    for (const op of ops.slice(index, index + 400)) op(batch);
    await batch.commit();
  }
}

async function queryTickets(filters) {
  const source = clip(filters.source, 40);
  const company = clip(filters.company, 40);
  const type = clip(filters.type, 20);
  const warehouseCode = clip(filters.warehouseCode, 40);
  const rig = clip(filters.rig, 40);
  const lsd = clip(filters.lsd, 80);
  const from = dayKey(filters.from || filters.date);
  const to = dayKey(filters.to || filters.date);
  const rawQuery = clip(filters.query, 160);
  const queryText = rawQuery.toLowerCase();
  const limit = limitOf(filters.limit, 100);
  const lookupId = ticketLookupId(rawQuery);
  if (lookupId) {
    const direct = await col("tickets").doc(lookupId).get();
    if (direct.exists) return [ticketDetail(direct.id, direct.data())];
  }
  let query = col("tickets");
  const norm = lsd ? lsdNorm(lsd) : "";
  const equality = norm ? ["lsdNorm", norm] : [["rig", rig], ["warehouseCode", warehouseCode], ["source", source], ["company", company]].find(([, value]) => value);
  if (equality) query = query.where(equality[0], "==", equality[1]);
  if (from) query = query.where("postedAt", ">=", from);
  if (to) query = query.where("postedAt", "<=", `${to}\uf8ff`);
  const snap = await query.orderBy("postedAt", "desc").limit(limit).get();
  return snap.docs.map((doc) => ticketDetail(doc.id, doc.data())).filter((ticket) => {
    if (source && ticket.source !== source) return false;
    if (company && ticket.company !== company) return false;
    if (type && !isTicketType(ticket.type, type)) return false;
    if (warehouseCode && ticket.warehouseCode !== warehouseCode) return false;
    if (rig && rigNorm(ticket.rig) !== rigNorm(rig)) return false;
    if (!queryText) return true;
    const haystack = [ticket.id, ticket.customer, ticket.wellName, ticket.lsd, ticket.rig, ticket.poAfe, ...ticket.lines.map((line) => `${line.code || ""} ${line.name || ""}`)].join(" ").toLowerCase();
    return haystack.includes(queryText);
  });
}

const checkOptions = { region: "us-central1", timeoutSeconds: 300, memory: "512MiB" };

async function executeInventoryChecks(date) {
  const [main, ticketSnap, wellSnap, productSnap, stockSnap, runSnap, issueSnap, rigSnap, appSnap, statusSnap, reviewSnap, flagSnap] = await Promise.all([
    root().get(),
    col("tickets").get(),
    col("wells").get(),
    col("products").get(),
    col("stock").get(),
    col("runs").doc(date).get(),
    col("issues").where("date", "==", date).get(),
    col("rigInventory").where("date", "==", date).get(),
    col("appTickets").get(),
    col("ticketStatus").get(),
    col("reviewItems").get(),
    col("flags").get(),
  ]);
  const tickets = ticketSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const wells = wellSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const products = productSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const stock = stockSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const appTickets = appSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const sources = runSnap.data()?.sources;
  const result = runChecks({ date, config: configFromMain(main.data()), tickets, wells, products, stock, appTickets, sources });
  const existing = new Map(issueSnap.docs.map((doc) => [doc.id, doc.data()]));
  const ops = [];
  const nextIds = new Set(result.issues.map((issue) => issue.id));
  for (const issue of result.issues) {
    const prior = existing.get(issue.id);
    const keepStatus = prior && (prior.status === "resolved" || prior.status === "ignored");
    ops.push((batch) => batch.set(col("issues").doc(issue.id), {
      ...issue,
      status: keepStatus ? prior.status : "open",
      note: prior?.note || "",
      resolvedBy: keepStatus ? prior.resolvedBy || "" : "",
      resolvedAt: keepStatus ? prior.resolvedAt || null : null,
    }));
  }
  for (const doc of issueSnap.docs) if (!nextIds.has(doc.id) && doc.data().status === "open") ops.push((batch) => batch.delete(doc.ref));
  const rigIds = new Set(result.rigInventory.map((row) => row.id));
  for (const row of result.rigInventory) {
    const stored = { ...row };
    delete stored.prices;
    ops.push((batch) => batch.set(col("rigInventory").doc(row.id), stored));
  }
  for (const doc of rigSnap.docs) if (!rigIds.has(doc.id)) ops.push((batch) => batch.delete(doc.ref));
  for (const doc of ticketSnap.docs) {
    const next = lsdNorm(doc.data().lsd);
    if (next && doc.data().lsdNorm !== next) ops.push((batch) => batch.update(doc.ref, { lsdNorm: next }));
  }
  for (const doc of wellSnap.docs) {
    const next = lsdNorm(doc.data().lsd);
    if (next && doc.data().lsdNorm !== next) ops.push((batch) => batch.update(doc.ref, { lsdNorm: next }));
  }
  const coverage = buildCoverage({ date, config: configFromMain(main.data()), tickets, wells, products, stock, appTickets });
  const at = new Date().toISOString();
  const existingFlags = flagSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const reviews = reviewDocuments(coverage.reviews);
  for (const row of reviews) ops.push((batch) => batch.set(col("reviewItems").doc(row.id), row));
  for (const row of coverage.ticketStatus) ops.push((batch) => batch.set(col("ticketStatus").doc(row.id), row));
  const plan = reconcileCoverage({
    date,
    reviews,
    ticketStatus: coverage.ticketStatus,
    existingReviews: reviewSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    existingStatuses: statusSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    flags: existingFlags,
    at,
  });
  for (const id of plan.reviewDeletes) ops.push((batch) => batch.delete(col("reviewItems").doc(id)));
  for (const row of plan.reviewStale) ops.push((batch) => batch.update(col("reviewItems").doc(row.id), { state: row.state, staleSince: row.staleSince }));
  for (const id of plan.statusDeletes) ops.push((batch) => batch.delete(col("ticketStatus").doc(id)));
  for (const row of plan.statusStale) ops.push((batch) => batch.update(col("ticketStatus").doc(row.id), { state: row.state, staleSince: row.staleSince }));
  for (const move of coverage.flagMoves || []) {
    const moved = movedReviewFlag(existingFlags, move.fromId, move.toId);
    if (moved) ops.push((batch) => batch.set(col("flags").doc(flagDocId(moved.entityType, moved.entityId)), moved));
  }
  for (const write of compactStockSnapshots(stock)) ops.push((batch) => batch.update(col("stock").doc(write.id), { items: write.items }));
  const summary = { ...result.summary, coverage: { counts: coverage.counts, dollarsAtRisk: coverage.dollarsAtRisk, reviewCount: reviews.length } };
  ops.push((batch) => batch.set(col("runs").doc(date), { summary, checkedAt: new Date().toISOString() }, { merge: true }));
  await commitAll(ops);
  return { date, summary, issueCount: result.issues.length, ticketCount: coverage.ticketStatus.length };
}

export const inventoryBotRunChecks = onCall({ ...callable, enforceAppCheck: false, ...checkOptions }, async (request) => {
  await requireSuperAdmin(request);
  return executeInventoryChecks(cleanDate(request.data?.date));
});

/** The collector sets checksRequestedAt on the run document. This runs the checks without an Auth token.
 * Writing summary and checkedAt does not change checksRequestedAt, so that write does not run the checks again. */
export const inventoryBotRunWritten = onDocumentWritten({ ...checkOptions, document: "inventoryBot/main/runs/{date}" }, async (event) => {
  const date = String(event.params.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const before = event.data?.before?.get("checksRequestedAt");
  const after = event.data?.after?.get("checksRequestedAt");
  if (!checksRequestChanged(before, after)) return;
  await executeInventoryChecks(date);
});

export const inventoryBotGetToday = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const date = cleanDate(request.data?.date);
  const [run, issues, main] = await Promise.all([col("runs").doc(date).get(), col("issues").where("date", "==", date).get(), root().get()]);
  const rows = issues.docs.map((doc) => publicIssue(doc.id, doc.data()));
  rows.sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity] || b.dollarValue - a.dollarValue);
  return { date, config: configFromMain(main.data()), run: run.exists ? publicRun(date, run.data()) : null, issues: rows };
});

export const inventoryBotGetCoverage = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const date = cleanDate(request.data?.date);
  const [statuses, reviews, wells, flags] = await Promise.all([
    col("ticketStatus").where("date", "==", date).get(),
    col("reviewItems").where("date", "==", date).get(),
    col("wells").get(),
    col("flags").get(),
  ]);
  return {
    date,
    tickets: statuses.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    reviews: reviews.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    wells: wells.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, name: data.name || "", lsd: data.lsd || "", lsdNorm: data.lsdNorm || "", rig: data.rig || "", contractor: data.contractor || "", status: data.status || "", operator: data.operator || "", lastReportDate: data.lastReportDate || null, lat: data.lat ?? data.latitude ?? null, lon: data.lon ?? data.longitude ?? null };
    }),
    flags: flags.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
});

function flagDocId(entityType, entityId) {
  const raw = `${entityType}__${String(entityId).replace(/\//g, "_")}`;
  return raw.length <= 400 ? raw : `${entityType}__${docSlug(entityId)}`;
}

export const inventoryBotListFlags = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const snap = await col("flags").get();
  return { flags: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
});

export const inventoryBotSetFlag = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const entityType = text(request.data?.entityType, "type", 20);
  const entityId = text(request.data?.entityId, "id", 200);
  if (!["well", "ticket", "issue", "review"].includes(entityType)) throw new HttpsError("invalid-argument", "Choose a well, ticket, issue, or review item.");
  if (request.data?.status && !FLAG_STATUSES.includes(request.data.status)) throw new HttpsError("invalid-argument", "Choose new, seen, watching, or done.");
  const ref = col("flags").doc(flagDocId(entityType, entityId));
  const snap = await ref.get();
  const next = applyFlag(snap.exists ? snap.data() : null, {
    entityType, entityId,
    status: request.data?.status,
    note: clip(request.data?.note, 2000),
    by: access.email,
    at: new Date().toISOString(),
    forGrokBot: typeof request.data?.forGrokBot === "boolean" ? request.data.forGrokBot : undefined,
    grokBotReply: typeof request.data?.grokBotReply === "string" ? clip(request.data.grokBotReply, 4000) : undefined,
  });
  await ref.set(next, { merge: true });
  return { id: ref.id, ...next };
});

export const inventoryBotUpdateIssue = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const id = text(request.data?.issueId, "issue", 200);
  const status = request.data?.status;
  if (!["open", "resolved", "ignored"].includes(status)) throw new HttpsError("invalid-argument", "Choose open, resolved, or ignored.");
  const ref = col("issues").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That issue is not in Inventory Bot.");
  const patch = { status, note: clip(request.data?.note, 2000), resolvedBy: status === "open" ? "" : access.email, resolvedAt: status === "open" ? null : new Date().toISOString() };
  await ref.update(patch);
  return publicIssue(id, { ...snap.data(), ...patch });
});

export const inventoryBotListWells = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const snap = await col("wells").get();
  const wells = snap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, name: data.name || "", lsd: data.lsd || "", rig: data.rig || "", status: data.status || "", operator: data.operator || "", lastReportDate: data.lastReportDate || null, remainingCount: Array.isArray(data.remaining) ? data.remaining.length : 0 };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { wells };
});

export const inventoryBotGetWell = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const wellId = text(request.data?.wellId, "well", 200);
  const date = cleanDate(request.data?.date);
  const snap = await col("wells").doc(wellId).get();
  if (!snap.exists) throw new HttpsError("not-found", "That well is not in Inventory Bot.");
  const well = publicWell(snap.id, snap.data());
  const rig = await col("rigInventory").doc(`${date}_${docSlug(wellId)}`).get();
  let tickets = [];
  if (well.lsdNorm) {
    const found = await col("tickets").where("lsdNorm", "==", well.lsdNorm).orderBy("postedAt", "desc").limit(40).get();
    tickets = found.docs.map((doc) => ticketSummary(doc.id, doc.data())).filter((ticket) => !well.rig || rigNorm(ticket.rig) === rigNorm(well.rig) || ticket.lsdNorm === well.lsdNorm);
  }
  const appSnap = await col("appTickets").where("wellId", "==", wellId).get();
  const appTickets = appSnap.docs.map((doc) => ({ id: doc.id, kind: doc.data().kind || "", rawTicket: doc.data().rawTicket || "", ticketNorm: doc.data().ticketNorm || "", date: doc.data().date || null, otherWellUWI: doc.data().otherWellUWI || "", lines: doc.data().lines || [] }));
  return { well, rigInventory: rig.exists ? rig.data() : null, tickets, appTickets };
});

export const inventoryBotListTickets = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const tickets = await queryTickets(request.data || {});
  return { tickets: tickets.map((ticket) => ticketSummary(ticket.id, ticket)) };
});

export const inventoryBotGetTicket = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const id = text(request.data?.ticketId, "ticket", 200);
  const snap = await col("tickets").doc(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "That ticket is not in Inventory Bot.");
  return ticketDetail(snap.id, snap.data());
});

export const inventoryBotTicketUrl = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const id = text(request.data?.ticketId, "ticket", 200);
  const snap = await col("tickets").doc(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "That ticket is not in Inventory Bot.");
  const path = snap.data().pdfPath;
  if (!isTicketPdfPath(path)) throw new HttpsError("failed-precondition", "That ticket has no PDF.");
  const expires = Date.now() + 10 * 60 * 1000;
  const [url] = await getStorage().bucket().file(path).getSignedUrl({ version: "v4", action: "read", expires });
  return { url, expiresAt: new Date(expires).toISOString() };
});

export const inventoryBotListWarehouses = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const snap = await col("stock").orderBy("date", "desc").limit(1000).get();
  const latest = new Map();
  const previous = new Map();
  for (const doc of snap.docs) {
    const data = { id: doc.id, ...doc.data() };
    const key = `${data.source}|${data.warehouseCode}`;
    if (!latest.has(key)) latest.set(key, data);
    else if (!previous.has(key)) previous.set(key, data);
  }
  const warehouses = [...latest.values()].map((current) => {
    const prior = previous.get(`${current.source}|${current.warehouseCode}`);
    const priorItems = new Map((prior?.items || []).map((item) => [stockItemKey(item), item]));
    const items = (current.items || []).map((item) => {
      const key = stockItemKey(item);
      const before = priorItems.get(key);
      const onHand = asNumber(item.onHand);
      const previousOnHand = before ? asNumber(before.onHand) : null;
      return {
        key, code: item.code || "", productId: item.productId || "", name: item.name || "", unit: item.unit || "", unitWeight: asNumber(item.unitWeight),
        onHand, committed: asNumber(item.committed), inTransit: asNumber(item.inTransit), available: asNumber(item.available),
        previousOnHand, delta: onHand != null && previousOnHand != null ? Math.round((onHand - previousOnHand) * 1000) / 1000 : null,
        variants: Array.isArray(item.variants) ? item.variants : [],
      };
    });
    return { id: current.id, date: current.date || "", source: current.source || "", company: current.company || "", warehouseCode: current.warehouseCode || "", warehouseName: current.warehouseName || current.warehouseCode || "", previousDate: prior?.date || null, items };
  }).sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
  return { warehouses };
});

async function rememberQuestion(access, context, question) {
  const entityType = context?.ticketId ? "ticket" : context?.reviewId ? "review" : context?.wellId ? "well" : "issue";
  const entityId = context?.ticketId || context?.reviewId || context?.wellId || "general";
  const ref = col("flags").doc(flagDocId(entityType, entityId));
  const snap = await ref.get();
  const next = applyFlag(snap.exists ? snap.data() : null, { entityType, entityId, status: snap.exists ? undefined : "new", note: question, by: access.email, at: new Date().toISOString(), forGrokBot: true });
  await ref.set(next, { merge: true });
}

async function runTool(name, args, access) {
  if (name === "searchTickets" || name === "search_tickets") return { tickets: (await queryTickets({ ...args, limit: 15 })).slice(0, 15).map((ticket) => ticketSummary(ticket.id, ticket)) };
  if (name === "get_ticket") {
    const id = clip(args.id, 200);
    if (!id) return { error: "A ticket id is required." };
    const snap = await col("tickets").doc(id).get();
    return snap.exists ? ticketDetail(snap.id, snap.data()) : { error: "Ticket not found." };
  }
  if (name === "getWellHistory") {
    const wellId = clip(args.wellId, 200);
    if (!wellId) return { error: "A well id is required." };
    const snap = await col("wells").doc(wellId).get();
    if (!snap.exists) return { error: "Well not found." };
    const data = snap.data();
    const [apps, statuses] = await Promise.all([
      col("appTickets").where("wellId", "==", wellId).limit(25).get(),
      col("ticketStatus").where("wellId", "==", wellId).limit(25).get(),
    ]);
    return {
      well: { id: snap.id, name: data.name || "", lsd: data.lsd || "", rig: data.rig || "", status: data.status || "", lastReportDate: data.lastReportDate || null },
      appTickets: apps.docs.map((doc) => ({ id: doc.id, kind: doc.data().kind || "", rawTicket: doc.data().rawTicket || "", date: doc.data().date || null, lines: (doc.data().lines || []).slice(0, 12) })),
      tickets: statuses.docs.map((doc) => ({ id: doc.id, status: doc.data().status, number: doc.data().number || "", reason: doc.data().reason || "", lagDays: doc.data().lagDays ?? null, dollarValue: doc.data().dollarValue || 0 })),
    };
  }
  if (name === "get_well_inventory") {
    const snap = await col("wells").get();
    const wantedId = clip(args.wellId, 200);
    const wantedName = nameNorm(args.name);
    const wantedRig = rigNorm(args.rig);
    const wantedLsd = args.lsd ? lsdNorm(args.lsd) : "";
    const found = snap.docs.find((doc) => {
      if (wantedId) return doc.id === wantedId;
      const data = doc.data();
      if (wantedLsd && (data.lsdNorm || lsdNorm(data.lsd)) === wantedLsd) return !wantedRig || rigNorm(data.rig) === wantedRig;
      if (wantedName && nameNorm(data.name) === wantedName) return true;
      if (wantedRig && !wantedLsd && !wantedName) return rigNorm(data.rig) === wantedRig;
      return false;
    });
    if (!found) return { error: "Well not found." };
    const date = todayKey();
    const rig = await col("rigInventory").doc(`${date}_${docSlug(found.id)}`).get();
    const well = publicWell(found.id, found.data());
    return { well, rigInventory: rig.exists ? { expected: rig.data().expected || [], appRemaining: rig.data().appRemaining || [], diff: rig.data().diff || [] } : null };
  }
  if (name === "getIssues" || name === "list_issues") {
    const date = dayKey(args.date);
    const status = clip(args.status, 20);
    let query = col("issues");
    if (date) query = query.where("date", "==", date);
    else if (status) query = query.where("status", "==", status);
    const snap = await query.limit(40).get();
    return { issues: snap.docs.map((doc) => publicIssue(doc.id, doc.data())).filter((issue) => (!status || issue.status === status) && (!args.severity || issue.severity === args.severity) && (!args.rule || issue.rule === args.rule)).slice(0, 20) };
  }
  if (name === "getStock" || name === "get_warehouse_stock") {
    const warehouseCode = clip(args.warehouseCode, 40);
    if (!warehouseCode) return { error: "A warehouse code is required." };
    const snap = await col("stock").where("warehouseCode", "==", warehouseCode).orderBy("date", "desc").limit(8).get();
    const rows = snap.docs.map((doc) => doc.data()).filter((row) => !args.source || row.source === args.source);
    const current = rows[0];
    if (!current) return { error: "Warehouse not found." };
    const prior = rows[1];
    const priorItems = new Map((prior?.items || []).map((item) => [stockItemKey(item), item]));
    return {
      date: current.date, source: current.source, warehouseCode: current.warehouseCode, warehouseName: current.warehouseName || "",
      items: (current.items || []).slice(0, 80).map((item) => ({ key: stockItemKey(item), code: item.code || "", productId: item.productId || "", name: item.name || "", unit: item.unit || "", onHand: asNumber(item.onHand), available: asNumber(item.available), previousOnHand: asNumber(priorItems.get(stockItemKey(item))?.onHand), variants: Array.isArray(item.variants) ? item.variants : [] })),
    };
  }
  if (name === "listFlags") {
    const entityType = clip(args.entityType, 20);
    const status = clip(args.status, 20);
    const snap = await col("flags").limit(40).get();
    return { flags: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((flag) => (!entityType || flag.entityType === entityType) && (!status || flag.status === status)).slice(0, 30) };
  }
  if (name === "createFlag" || name === "addNote") {
    const entityType = clip(args.entityType, 20);
    const entityId = clip(args.entityId, 200);
    if (!["well", "ticket", "issue", "review"].includes(entityType) || !entityId) return { error: "A well, ticket, issue, or review id is required." };
    const ref = col("flags").doc(flagDocId(entityType, entityId));
    const snap = await ref.get();
    const next = applyFlag(snap.exists ? snap.data() : null, {
      entityType, entityId,
      status: args.status,
      note: clip(args.note, 2000),
      by: access?.email || "grok",
      at: new Date().toISOString(),
      forGrokBot: args.forGrokBot === true,
    });
    await ref.set(next, { merge: true });
    return { id: ref.id, status: next.status, forGrokBot: next.forGrokBot };
  }
  if (name === "find_product") {
    const code = clip(args.code, 80).toLowerCase();
    const name = nameNorm(args.name);
    const snap = await col("products").limit(200).get();
    const matches = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => {
      const codes = [...(item.xpressCodes || []), ...(item.mimCodes || [])].map((value) => String(value).toLowerCase());
      const names = [item.name, ...(item.appNames || [])].map((value) => nameNorm(value));
      return (code && codes.includes(code)) || (name && names.includes(name)) || (name && names.some((value) => value.includes(name)));
    }).slice(0, 8).map((item) => ({ id: item.id, name: item.name || "", unit: item.unit || "", price: asNumber(item.price), cost: asNumber(item.cost), confirmed: item.confirmed === true, xpressCodes: item.xpressCodes || [], mimCodes: item.mimCodes || [] }));
    return { products: matches };
  }
  return { error: "Unknown tool." };
}

export const inventoryBotListChat = onCall(callable, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const snap = await col("chats").doc(access.uid).collection("messages").orderBy("createdAt", "desc").limit(40).get();
  return { messages: snap.docs.map((doc) => ({ id: doc.id, role: doc.data().role, content: doc.data().content || "", createdAt: doc.data().createdAt || null })).reverse() };
});

export const inventoryBotChat = onCall({ ...callable, secrets: [xaiApiKey], timeoutSeconds: 120 }, async (request) => {
  const access = await requireMiniApp(request, "inventoryBot");
  const content = text(request.data?.message, "message", 4000);
  const context = request.data?.context && typeof request.data.context === "object" ? request.data.context : {};
  const contextText = [context.wellId && `Selected well ${context.wellId}`, context.ticketId && `Selected ticket ${context.ticketId}`, context.reviewId && `Selected review item ${context.reviewId}`].filter(Boolean).join(". ");
  const messages = col("chats").doc(access.uid).collection("messages");
  const historySnap = await messages.orderBy("createdAt", "desc").limit(20).get();
  const history = historySnap.docs.map((doc) => doc.data()).reverse().filter((item) => item.role === "user" || item.role === "assistant").map((item) => ({ role: item.role, content: String(item.content || "").slice(0, 4000) }));
  await messages.add({ role: "user", content, createdAt: new Date().toISOString() });
  let reply = "I could not reach the inventory assistant. Try again in a moment.";
  try {
    const result = await completeInventoryChat({ apiKey: xaiApiKey.value(), messages: [{ role: "system", content: SYSTEM }, ...history, { role: "user", content: contextText ? `${contextText}\n${content}` : content }], runTool: (toolName, toolArgs) => runTool(toolName, toolArgs, access), fetchImpl: globalThis.fetch });
    reply = result.reply;
  } catch (error) {
    globalThis.console.error("Inventory chat failed", error instanceof Error ? error.message : error);
  }
  if (/could not find|could not finish|do not contain|could not reach/i.test(reply)) await rememberQuestion(access, context, content);
  await messages.add({ role: "assistant", content: reply, createdAt: new Date().toISOString() });
  return { reply };
});

function mirrorDb() {
  const existing = getApps().find((app) => app.name === "mirror");
  const app = existing || initializeApp({ databaseURL: MIRROR_URL }, "mirror");
  return getDatabase(app);
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
  if (meta.syncedOn === today) return { reads: 0, added: 0 };
  const range = directoryRange(today, meta.lastKey || "");
  if (!range.reads) {
    await metaRef.set({ syncedOn: today, syncedAt: new Date().toISOString() }, { merge: true });
    return { reads: 0, added: 0 };
  }
  const snap = await mirrorDb().ref("data/wells").orderByKey().startAt(range.start).endAt(range.end).get();
  const rows = [];
  snap.forEach((child) => { rows.push(slimWell(child.key, child.val())); });
  for (let index = 0; index < rows.length; index += 400) {
    const batch = db.batch();
    for (const row of rows.slice(index, index + 400)) batch.set(col("appWells").doc(row.id), row, { merge: true });
    await batch.commit();
  }
  const lastKey = rows.length ? rows[rows.length - 1].id : meta.lastKey || "";
  await metaRef.set({ lastKey, syncedOn: today, syncedAt: new Date().toISOString(), windowStart: range.start }, { merge: true });
  return { reads: 1, added: rows.length };
}

export const inventoryBotXpressBoard = onCall(callable, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  let directory = { reads: 0, added: 0, error: "" };
  try { directory = { ...await syncAppWells(), error: "" }; }
  catch (error) { directory = { reads: 0, added: 0, error: error instanceof Error ? error.message : "The app well directory could not be refreshed." }; }
  const pieces = await loadXpressPieces();
  const board = buildXpressBoard(pieces);
  const pulledAt = pieces.tickets.map((ticket) => ticket.collectedAt).filter(Boolean).sort().at(-1) || "";
  for (const card of board.cards) {
    if (card.link.source === "auto" && card.link.state === "linked") {
      const prior = pieces.savedCards.find((row) => row.id === card.id);
      if (!prior?.linkLocked && prior?.appWellId !== card.link.appWellId) await col("xpressCards").doc(card.id).set({ id: card.id, name: card.name, operator: card.operator, lsd: card.lsd, lsdNorm: card.lsdNorm, rig: card.rig, appWellId: card.link.appWellId, linkState: "linked", linkSource: "auto", linkLocked: false, linkReason: card.link.reason }, { merge: true });
    }
  }
  return { ...board, pulledAt, directory, appWells: pieces.appWells.map((well) => ({ id: well.id, name: well.name || "", lsd: well.lsd || "", lsdNorm: well.lsdNorm || "", rig: well.rig || "", operator: well.operator || "", status: well.status || "" })) };
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
  const mirror = mirrorDb();
  const wellSnap = await mirror.ref(`data/wells/${appWellId}`).get();
  const reportSnap = await mirror.ref(`data/wellReports/${appWellId}`).orderByKey().limitToLast(30).get();
  const appWell = slimWell(appWellId, wellSnap.val());
  const appTickets = reportTickets(reportSnap.val());
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
  return { appWell, appTickets, tickets: compared, match, reads: { well: wellSnap.exists ? 1 : 1, reports: 1, reportCount: appTickets.length } };
});

export const inventoryBotGrokSort = onCall({ ...callable, secrets: [xaiApiKey], timeoutSeconds: 120 }, async (request) => {
  await requireMiniApp(request, "inventoryBot");
  const pieces = await loadXpressPieces();
  const board = buildXpressBoard(pieces);
  const tickets = ticketsNeedingGrok(board.unassigned).map((ticket) => ({ id: ticket.id, number: ticket.number, date: ticket.date, customer: ticket.customer, shipTo: ticket.shipTo, rig: ticket.rig, lsd: ticket.lsd, value: ticket.value }));
  if (!tickets.length) return { suggestions: [], accepted: 0, skipped: board.unassigned.length };
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
  return { suggestions, accepted };
});
