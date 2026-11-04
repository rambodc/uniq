/** Rig board matching. App wells only store a rig number; the same number is used by
 * different contractors, so a rig is that number plus the operator. Ticket corrections
 * and merges are applied before the automatic rules. App well documents are not changed. */

import { dayKey, daysBetween, lsdNorm, nameNorm, rigNorm, todayKey, warehouseTicketNumber } from "./engine.js";
import { isTestWell } from "./copiedReports.js";
import { fieldRig, ticketPdf, ticketValue, ticketWhen } from "./xpressBoard.js";

const CONTRACTORS = [
  [/\b(pd|precision)\b/, "Precision"],
  [/\bensign\b/, "Ensign"],
  [/\bbonanza\b/, "Bonanza"],
  [/\bexcalibur\b/, "Excalibur"],
  [/\bhorizon\b/, "Horizon"],
  [/\bsavanna\b/, "Savanna"],
  [/\btundra\b/, "Tundra"],
  [/\bcaltex\b/, "Caltex"],
  [/\bspur\b/, "Spur"],
  [/\btaprock\b/, "Taprock"],
];

const RIG4 = new Set(["caltex", "spur", "tundra", "taprock"]);
const WAREHOUSE = new Set(["MR", "ST", "STX", "AT"]);

export function correctionDocId(kind, subject) {
  const safe = String(subject || "").replace(/[/\s#?]+/g, "_").slice(0, 180);
  return `${kind}__${safe}`;
}

export function operatorKey(value) {
  return nameNorm(value).split(" ").find(Boolean) || "";
}

export function rigKeyOf(number, operator) {
  const rig = rigNorm(number);
  if (!rig) return "";
  return `${rig}~${operatorKey(operator)}`;
}

/** PD and Pd are Precision. "Ensign531" and "BONANZA 11" keep a space before the number. */
export function parseXpressRig(value) {
  const raw = String(fieldRig(value) || "").trim();
  const number = rigNorm(raw);
  if (!number) return { number: "", contractor: "", display: "" };
  const words = nameNorm(raw).replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  const known = CONTRACTORS.find(([pattern]) => pattern.test(words));
  const contractor = known ? known[1] : titleWord(words);
  return { number, contractor, display: contractor ? `${contractor} ${number}` : `Rig ${number}` };
}

function titleWord(value) {
  const word = value.split(" ").find((part) => /[a-z]/.test(part) && part !== "rig" && part !== "no");
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Exact LSD, or the same stem with a different meridian digit (W0 versus W4). */
export function lsdClose(left, right) {
  const a = lsdNorm(left);
  const b = lsdNorm(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const am = a.match(/^(.*\d)([WE])(\d)$/);
  const bm = b.match(/^(.*\d)([WE])(\d)$/);
  if (!am || !bm) return false;
  return am[1] === bm[1] && am[2] === bm[2] && am[3] !== bm[3];
}

function seasonStart(today) {
  const year = Number(String(today).slice(0, 4)) || new Date().getFullYear();
  const october = `${year}-10-01`;
  return today >= october ? october : `${year - 1}-10-01`;
}

function lastReport(well) {
  return dayKey(well?.lastReportDate || well?.lastReport || "");
}

function firstReport(well) {
  return dayKey(well?.firstReportDate || well?.firstReport || "");
}

function inWindow(well, today) {
  const status = String(well?.status || "").toLowerCase();
  const active = status === "active" || status === "active-pause" || status.startsWith("active");
  const completed = status.startsWith("completed");
  if (!active && !completed) return false;
  const last = lastReport(well);
  if (!last) return false;
  return daysBetween(today, last) <= 15;
}

function activeStatus(well) {
  const status = String(well?.status || "").toLowerCase();
  return status === "active" || status === "active-pause";
}

function inSpan(well, when) {
  const last = well.lastReport || lastReport(well);
  const first = well.firstReport || firstReport(well) || last;
  if (!first || !last || !when) return false;
  return when >= first && when <= last;
}

function presentWell(well, fix) {
  return {
    id: well.id,
    name: well.name || "Untitled well",
    lsd: well.lsd || well.lsdNorm || "",
    lsdNorm: well.lsdNorm || lsdNorm(well.lsd),
    status: well.status || "",
    operator: well.operator || well.operator_name || "",
    rig: String(well.rig ?? ""),
    firstReport: firstReport(well),
    lastReport: lastReport(well),
    moved: Boolean(fix),
    correctionId: fix ? (fix.id || correctionDocId("well", well.id)) : "",
  };
}

function publicLines(ticket) {
  return (ticket.lines || []).map((line) => ({
    name: line.name || line.product || "",
    qty: Number(line.qty) || 0,
    unit: line.unit || "",
    price: Number(line.price) || 0,
  }));
}

function presentTicket(ticket) {
  const type = String(ticket.type || "").toUpperCase();
  const pdfPath = ticketPdf(ticket);
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
    lines: publicLines(ticket),
    return: type === "CT" || type === "SR",
    hasPdf: Boolean(pdfPath),
    pdfPath,
    warehouseName: ticket.warehouseName || "",
  };
}

function warehouseMove(ticket) {
  const type = String(ticket?.type || "").toUpperCase();
  if (!WAREHOUSE.has(type)) return false;
  return !parseXpressRig(ticket?.rig).number && !lsdNorm(ticket?.lsd);
}

function frequent(values) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function canonical(key, merges) {
  let current = key;
  const seen = new Set();
  while (merges.has(current) && !seen.has(current)) {
    seen.add(current);
    current = merges.get(current);
  }
  return current || key;
}

function holdNote(rig, ticket) {
  const parsed = parseXpressRig(ticket.rig);
  if (rig.numbers.has("4") && (rig.sharedFour || RIG4.has(parsed.contractor.toLowerCase()))) {
    return "Rig 4 is shared by Caltex, Spur, Tundra and Taprock — amber until confirmed.";
  }
  if (rig.numbers.has("254")) return "Rig 254 is shared by Precision and Ensign for Cenovus — amber until confirmed.";
  if (rig.numbers.has("55")) {
    const ticketLsd = lsdNorm(ticket.lsd);
    const pads = rig.wells.map((well) => lsdNorm(well.lsd || well.lsdNorm));
    if (ticketLsd === "9-7-46-17W3" && pads.includes("4-5-46-17W3")) {
      return "Ticket LSD 9-7-46-17W3 differs from pad LSD 4-5-46-17W3 — amber until confirmed.";
    }
  }
  return "";
}

function confidenceFor(rig, ticket, reason) {
  const note = holdNote(rig, ticket);
  if (note || reason === "operator-span") {
    return { matchConfidence: "amber", note: note || "Assigned by operator and ship date. The LSD did not match a well." };
  }
  const lsd = lsdNorm(ticket.lsd);
  if (!lsd || rig.wells.some((well) => lsdClose(well.lsd || well.lsdNorm, lsd))) return { matchConfidence: "green", note: "" };
  return { matchConfidence: "red", note: "Ticket LSD does not match a well on this rig." };
}

function assign(rig, ticket, reason, extra = {}) {
  const verdict = confidenceFor(rig, ticket, reason);
  return {
    ...presentTicket(ticket),
    rigKey: rig.key,
    matchReason: reason,
    matchConfidence: verdict.matchConfidence,
    note: verdict.note,
    moved: false,
    correctionId: "",
    ...extra,
  };
}

function matchTicket(ticket, rigs) {
  const parsed = parseXpressRig(ticket.rig);
  const customer = operatorKey(ticket.customer);
  const lsd = lsdNorm(ticket.lsd);
  const when = ticket.date || ticketWhen(ticket);
  const byNumber = parsed.number ? rigs.filter((rig) => rig.numbers.has(parsed.number)) : [];
  if (byNumber.length === 1) return { rig: byNumber[0], row: assign(byNumber[0], ticket, "rig-number") };
  if (byNumber.length > 1) {
    if (customer) {
      const byOperator = byNumber.filter((rig) => rig.operatorKey === customer);
      if (byOperator.length === 1) return { rig: byOperator[0], row: assign(byOperator[0], ticket, "rig-number-operator") };
    }
    if (lsd) {
      const byLsd = byNumber.filter((rig) => rig.wells.some((well) => lsdClose(well.lsd || well.lsdNorm, lsd)));
      if (byLsd.length === 1) return { rig: byLsd[0], row: assign(byLsd[0], ticket, "rig-number-lsd") };
    }
  }
  if (lsd) {
    const hits = rigs.filter((rig) => rig.wells.some((well) => lsdClose(well.lsd || well.lsdNorm, lsd)));
    if (hits.length === 1) return { rig: hits[0], row: assign(hits[0], ticket, "lsd") };
  }
  if (customer && when) {
    const hits = rigs.filter((rig) => rig.operatorKey === customer && rig.wells.some((well) => activeStatus(well) && inSpan(well, when)));
    if (hits.length === 1) return { rig: hits[0], row: assign(hits[0], ticket, "operator-span") };
  }
  return null;
}

function currentWell(wells) {
  const ranked = [...wells].sort((a, b) => {
    const activeA = String(a.status || "").toLowerCase() === "active" ? 1 : 0;
    const activeB = String(b.status || "").toLowerCase() === "active" ? 1 : 0;
    return activeB - activeA || String(b.lastReport || "").localeCompare(String(a.lastReport || "")) || String(a.name).localeCompare(String(b.name));
  });
  return ranked[0] || null;
}

function rigNumbers(shell) {
  const numbers = new Set();
  if (shell.number) numbers.add(shell.number);
  for (const well of shell.wells) {
    const number = rigNorm(well.rig);
    if (number) numbers.add(number);
  }
  for (const alias of shell.aliases) {
    const number = String(alias.key || "").split("~")[0];
    if (number) numbers.add(number);
  }
  return numbers;
}

function toneOf(tickets, wellCount) {
  if (!wellCount) return "grey";
  if (!tickets.length) return "grey";
  if (tickets.some((ticket) => ticket.matchConfidence === "red")) return "red";
  if (tickets.some((ticket) => ticket.matchConfidence === "amber")) return "amber";
  if (tickets.every((ticket) => ticket.matchConfidence === "green")) return "green";
  return "amber";
}

function labelFor(tone) {
  if (tone === "green") return "Matches app";
  if (tone === "amber") return "Needs a look";
  if (tone === "red") return "LSD mismatch";
  return "No app link";
}

function finishRig(shell) {
  const shown = new Map();
  for (const well of [...shell.wells, ...shell.season]) shown.set(well.id, well);
  const wells = [...shown.values()].sort((a, b) => String(b.lastReport).localeCompare(String(a.lastReport)) || a.name.localeCompare(b.name));
  const tickets = [...shell.tickets].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.number).localeCompare(String(a.number)));
  const contractors = frequent(tickets.map((ticket) => parseXpressRig(ticket.rig).contractor.toLowerCase()).filter(Boolean));
  const winner = contractors[0];
  const tied = winner && contractors[1] && contractors[1][1] === winner[1];
  const name = winner && !tied ? `${winner[0].charAt(0).toUpperCase()}${winner[0].slice(1)} ${shell.number}` : `Rig ${shell.number}`;
  const rawNames = frequent(tickets.map((ticket) => String(ticket.rig || "").trim()));
  const operators = frequent(wells.map((well) => well.operator));
  const tone = toneOf(tickets, wells.length);
  const note = tickets.map((ticket) => ticket.note).find(Boolean) || "";
  const label = !tickets.length && wells.length ? "No Xpress tickets" : labelFor(tone);
  const latest = tickets[0]?.date || "";
  return {
    key: shell.key,
    name,
    operator: operators.map(([value]) => value).join(" · "),
    operatorKey: shell.operatorKey,
    xpressName: rawNames[0]?.[0] || name,
    appRig: shell.number,
    appRigs: [...shell.numbers].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    merged: shell.aliases.length > 0,
    aliases: shell.aliases,
    currentWell: currentWell(wells),
    wells,
    wellCount: wells.length,
    tickets,
    ticketCount: tickets.length,
    lineCount: tickets.reduce((sum, ticket) => sum + ticket.lines.length, 0),
    latest,
    note,
    status: { tone, label },
  };
}

export function buildRigBoard({ tickets = [], wells = [], corrections = [], today = todayKey() } = {}) {
  const season = seasonStart(today);
  const active = (corrections || []).filter((row) => row && row.undone !== true);
  const wellFixes = new Map();
  const ticketFixes = new Map();
  const mergeTo = new Map();
  const mergeRows = [];
  for (const row of active) {
    if (row.type === "wellRig" && row.wellId && row.rigKey) wellFixes.set(row.wellId, row);
    if (row.type === "ticketRig" && row.ticketId && row.rigKey) ticketFixes.set(row.ticketId, row);
    if (row.type === "merge" && row.rigKey && row.into && row.rigKey !== row.into) {
      mergeTo.set(row.rigKey, row.into);
      mergeRows.push(row);
    }
  }
  const shells = new Map();
  const shell = (key) => {
    if (!shells.has(key)) {
      shells.set(key, { key, number: String(key).split("~")[0], operatorKey: String(key).split("~")[1] || "", wells: [], season: [], tickets: [], aliases: [] });
    }
    return shells.get(key);
  };
  const usable = (wells || []).filter((well) => well?.id && !isTestWell(well) && rigNorm(well.rig));
  const placedKey = (well) => {
    const fix = wellFixes.get(well.id);
    const key = fix ? String(fix.rigKey) : rigKeyOf(well.rig, well.operator || well.operator_name || "");
    return canonical(key, mergeTo);
  };
  for (const well of usable) {
    if (!inWindow(well, today)) continue;
    const key = placedKey(well);
    if (!key || key.startsWith("~")) continue;
    shell(key).wells.push(presentWell(well, wellFixes.get(well.id)));
  }
  for (const well of usable) {
    const last = lastReport(well);
    if (!last || last < season) continue;
    const key = placedKey(well);
    if (!shells.has(key)) continue;
    const bucket = shells.get(key);
    const row = presentWell(well, wellFixes.get(well.id));
    if (!bucket.season.some((item) => item.id === row.id)) bucket.season.push(row);
  }
  for (const row of mergeRows) {
    const dest = canonical(row.rigKey, mergeTo);
    if (!shells.has(dest) || row.rigKey === dest) continue;
    shells.get(dest).aliases.push({ key: row.rigKey, correctionId: row.id || correctionDocId("merge", row.rigKey) });
  }
  const rigs = [...shells.values()];
  for (const rig of rigs) rig.numbers = rigNumbers(rig);
  const fourCount = rigs.filter((rig) => rig.numbers.has("4")).length;
  for (const rig of rigs) rig.sharedFour = rig.numbers.has("4") && fourCount > 1;
  const matches = [];
  const unassigned = [];
  const warehouse = [];
  for (const ticket of tickets || []) {
    if (!ticket?.id || (ticket.source && ticket.source !== "xpress")) continue;
    if (warehouseMove(ticket)) {
      const row = { ...presentTicket(ticket), rigKey: "", matchReason: "warehouse", matchConfidence: "grey", note: "", moved: false, correctionId: "" };
      warehouse.push(row);
      matches.push({ id: ticket.id, rigKey: "", matchReason: "warehouse", matchConfidence: "grey" });
      continue;
    }
    const fix = ticketFixes.get(ticket.id);
    if (fix) {
      const key = canonical(String(fix.rigKey), mergeTo);
      const rig = shells.get(key) || shell(key);
      if (!rig.numbers) rig.numbers = rigNumbers(rig);
      const row = {
        ...presentTicket(ticket),
        rigKey: rig.key,
        matchReason: "correction",
        matchConfidence: "green",
        note: "",
        moved: true,
        correctionId: fix.id || correctionDocId("ticket", ticket.id),
      };
      rig.tickets.push(row);
      matches.push({ id: ticket.id, rigKey: rig.key, matchReason: "correction", matchConfidence: "green" });
      continue;
    }
    const hit = matchTicket(presentTicket(ticket), [...shells.values()].filter((rig) => rig.wells.length));
    if (!hit) {
      const parsed = parseXpressRig(ticket.rig);
      const located = Boolean(parsed.number || lsdNorm(ticket.lsd));
      const row = {
        ...presentTicket(ticket),
        rigKey: "",
        matchReason: located ? "unassigned" : "no-location",
        matchConfidence: "grey",
        note: located ? "No rig on the board matched this ticket." : "No rig or LSD on the ticket.",
        moved: false,
        correctionId: "",
      };
      unassigned.push(row);
      matches.push({ id: ticket.id, rigKey: "", matchReason: row.matchReason, matchConfidence: "grey" });
      continue;
    }
    hit.rig.tickets.push(hit.row);
    matches.push({ id: ticket.id, rigKey: hit.row.rigKey, matchReason: hit.row.matchReason, matchConfidence: hit.row.matchConfidence });
  }
  const finished = [...shells.values()].map(finishRig).filter((rig) => rig.wellCount || rig.ticketCount);
  const byTickets = (a, b) => b.ticketCount - a.ticketCount || String(b.latest).localeCompare(String(a.latest)) || a.name.localeCompare(b.name);
  const listed = finished.filter((rig) => rig.ticketCount > 0).sort(byTickets);
  const quietRigs = finished.filter((rig) => rig.ticketCount === 0).sort((a, b) => a.name.localeCompare(b.name));
  unassigned.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.number).localeCompare(String(b.number)));
  warehouse.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.number).localeCompare(String(b.number)));
  return { rigs: listed, quietRigs, unassigned, warehouse, matches };
}
