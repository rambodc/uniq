// Inventory Bot callables. Browsers never touch Firestore. Staff need the inventoryBot mini app;
// super admins always have it. inventoryBotRunChecks is also what the external collector calls
// after it writes a day's documents. App Check is off on that callable. The collector can instead set
// runs/{date}.checksRequestedAt and inventoryBotRunWritten runs the same checks with no Auth token.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineSecret } from "firebase-functions/params";
import { db, callable, requireMiniApp, requireSuperAdmin, text } from "./core.js";
import { completeInventoryChat } from "./inventoryBot/chat.js";
import { checksRequestChanged, configFromMain, dayKey, docSlug, isTicketPdfPath, lsdNorm, nameNorm, rigNorm, runChecks, todayKey } from "./inventoryBot/engine.js";

const xaiApiKey = defineSecret("XAI_API_KEY");
const SYSTEM = "You are the UniqEnergy inventory assistant. Answer only from the tool results. Never invent ticket numbers, quantities, or dollar amounts. Cite ticket ids and well names in the answer. If the tools do not contain the answer, say so. Keep the answer short.";

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
  const type = clip(filters.type, 20).toUpperCase();
  const warehouseCode = clip(filters.warehouseCode, 40);
  const rig = clip(filters.rig, 40);
  const lsd = clip(filters.lsd, 80);
  const from = dayKey(filters.from || filters.date);
  const to = dayKey(filters.to || filters.date);
  const queryText = clip(filters.query, 120).toLowerCase();
  const limit = limitOf(filters.limit, 100);
  if (queryText && /^[a-z0-9]+_[a-z0-9-]+$/i.test(queryText)) {
    const direct = await col("tickets").doc(queryText).get();
    if (direct.exists) return [ticketDetail(direct.id, direct.data())];
  }
  let query = col("tickets");
  const norm = lsd ? lsdNorm(lsd) : "";
  const equality = norm ? ["lsdNorm", norm] : [["rig", rig], ["warehouseCode", warehouseCode], ["type", type], ["source", source], ["company", company]].find(([, value]) => value);
  if (equality) query = query.where(equality[0], "==", equality[1]);
  if (from) query = query.where("postedAt", ">=", from);
  if (to) query = query.where("postedAt", "<=", `${to}\uf8ff`);
  const snap = await query.orderBy("postedAt", "desc").limit(limit).get();
  return snap.docs.map((doc) => ticketDetail(doc.id, doc.data())).filter((ticket) => {
    if (source && ticket.source !== source) return false;
    if (company && ticket.company !== company) return false;
    if (type && String(ticket.type).toUpperCase() !== type) return false;
    if (warehouseCode && ticket.warehouseCode !== warehouseCode) return false;
    if (rig && rigNorm(ticket.rig) !== rigNorm(rig)) return false;
    if (!queryText) return true;
    const haystack = [ticket.id, ticket.customer, ticket.wellName, ticket.lsd, ticket.rig, ticket.poAfe, ...ticket.lines.map((line) => `${line.code || ""} ${line.name || ""}`)].join(" ").toLowerCase();
    return haystack.includes(queryText);
  });
}

const checkOptions = { region: "us-central1", timeoutSeconds: 300, memory: "512MiB" };

async function executeInventoryChecks(date) {
  const [main, ticketSnap, wellSnap, productSnap, stockSnap, runSnap, issueSnap, rigSnap, appSnap] = await Promise.all([
    root().get(),
    col("tickets").get(),
    col("wells").get(),
    col("products").get(),
    col("stock").get(),
    col("runs").doc(date).get(),
    col("issues").where("date", "==", date).get(),
    col("rigInventory").where("date", "==", date).get(),
    col("appTickets").get(),
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
  const summary = result.summary;
  ops.push((batch) => batch.set(col("runs").doc(date), { summary, checkedAt: new Date().toISOString() }, { merge: true }));
  await commitAll(ops);
  return { date, summary, issueCount: result.issues.length };
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
    const priorItems = new Map((prior?.items || []).map((item) => [String(item.code || ""), item]));
    const items = (current.items || []).map((item) => {
      const before = priorItems.get(String(item.code || ""));
      const onHand = asNumber(item.onHand);
      const previousOnHand = before ? asNumber(before.onHand) : null;
      return {
        code: item.code || "", name: item.name || "", unitWeight: asNumber(item.unitWeight),
        onHand, committed: asNumber(item.committed), inTransit: asNumber(item.inTransit), available: asNumber(item.available),
        previousOnHand, delta: onHand != null && previousOnHand != null ? Math.round((onHand - previousOnHand) * 1000) / 1000 : null,
      };
    });
    return { id: current.id, date: current.date || "", source: current.source || "", company: current.company || "", warehouseCode: current.warehouseCode || "", warehouseName: current.warehouseName || current.warehouseCode || "", previousDate: prior?.date || null, items };
  }).sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
  return { warehouses };
});

async function runTool(name, args) {
  if (name === "search_tickets") return { tickets: (await queryTickets({ ...args, limit: 15 })).slice(0, 15).map((ticket) => ticketSummary(ticket.id, ticket)) };
  if (name === "get_ticket") {
    const id = clip(args.id, 200);
    if (!id) return { error: "A ticket id is required." };
    const snap = await col("tickets").doc(id).get();
    return snap.exists ? ticketDetail(snap.id, snap.data()) : { error: "Ticket not found." };
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
  if (name === "list_issues") {
    const date = dayKey(args.date);
    const status = clip(args.status, 20);
    let query = col("issues");
    if (date) query = query.where("date", "==", date);
    else if (status) query = query.where("status", "==", status);
    const snap = await query.limit(40).get();
    return { issues: snap.docs.map((doc) => publicIssue(doc.id, doc.data())).filter((issue) => (!status || issue.status === status) && (!args.severity || issue.severity === args.severity) && (!args.rule || issue.rule === args.rule)).slice(0, 20) };
  }
  if (name === "get_warehouse_stock") {
    const warehouseCode = clip(args.warehouseCode, 40);
    if (!warehouseCode) return { error: "A warehouse code is required." };
    const snap = await col("stock").where("warehouseCode", "==", warehouseCode).orderBy("date", "desc").limit(8).get();
    const rows = snap.docs.map((doc) => doc.data()).filter((row) => !args.source || row.source === args.source);
    const current = rows[0];
    if (!current) return { error: "Warehouse not found." };
    const prior = rows[1];
    const priorItems = new Map((prior?.items || []).map((item) => [String(item.code || ""), item]));
    return {
      date: current.date, source: current.source, warehouseCode: current.warehouseCode, warehouseName: current.warehouseName || "",
      items: (current.items || []).slice(0, 80).map((item) => ({ code: item.code || "", name: item.name || "", onHand: asNumber(item.onHand), available: asNumber(item.available), previousOnHand: asNumber(priorItems.get(String(item.code || ""))?.onHand) })),
    };
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
  const messages = col("chats").doc(access.uid).collection("messages");
  const historySnap = await messages.orderBy("createdAt", "desc").limit(20).get();
  const history = historySnap.docs.map((doc) => doc.data()).reverse().filter((item) => item.role === "user" || item.role === "assistant").map((item) => ({ role: item.role, content: String(item.content || "").slice(0, 4000) }));
  await messages.add({ role: "user", content, createdAt: new Date().toISOString() });
  let reply = "I could not reach the inventory assistant. Try again in a moment.";
  try {
    const result = await completeInventoryChat({ apiKey: xaiApiKey.value(), messages: [{ role: "system", content: SYSTEM }, ...history, { role: "user", content }], runTool, fetchImpl: globalThis.fetch });
    reply = result.reply;
  } catch (error) {
    globalThis.console.error("Inventory chat failed", error instanceof Error ? error.message : error);
  }
  await messages.add({ role: "assistant", content: reply, createdAt: new Date().toISOString() });
  return { reply };
});
