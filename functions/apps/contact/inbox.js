import { HttpsError } from "firebase-functions/v2/https";
import { docId, iso } from "../../core/values.js";

const TYPES = ["operations", "general", "careers"];
const LIST_KEYS = new Set(["archiveState", "inquiryType", "query", "cursor", "pageSize"]);
const string = (value) => typeof value === "string" ? value : "";

export function publicContactInquiry(id, data) {
  return {
    id,
    schemaVersion: 1,
    inquiryType: TYPES.includes(data.inquiryType) ? data.inquiryType : "general",
    name: string(data.name), email: string(data.email),
    ...(data.phone ? { phone: string(data.phone) } : {}),
    ...(data.company ? { company: string(data.company) } : {}),
    ...(data.areaOfInterest ? { areaOfInterest: string(data.areaOfInterest) } : {}),
    ...(data.linkedinUrl ? { linkedinUrl: string(data.linkedinUrl) } : {}),
    message: string(data.message), source: "public-contact", createdAt: iso(data.createdAt),
    archived: data.archived === true, archivedAt: iso(data.archivedAt), archivedBy: data.archived === true ? string(data.archivedBy) || null : null,
  };
}

export function validContactListRequest(value) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (Object.keys(data).some((key) => !LIST_KEYS.has(key))) throw new HttpsError("invalid-argument", "The inbox request is invalid.");
  const archiveState = data.archiveState ?? "active", inquiryType = data.inquiryType ?? "all", query = typeof data.query === "string" ? data.query.trim().toLowerCase() : "";
  if (!["active", "archived"].includes(archiveState)) throw new HttpsError("invalid-argument", "Choose a valid archive view.");
  if (inquiryType !== "all" && !TYPES.includes(inquiryType)) throw new HttpsError("invalid-argument", "Choose a valid inquiry type.");
  if (query.length > 120) throw new HttpsError("invalid-argument", "Search is too long.");
  const cursor = data.cursor === undefined ? 0 : Number(data.cursor), pageSize = data.pageSize === undefined ? 40 : Number(data.pageSize);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 500) throw new HttpsError("invalid-argument", "Choose a valid inbox page.");
  if (!Number.isInteger(pageSize) || pageSize < 10 || pageSize > 100) throw new HttpsError("invalid-argument", "Choose a valid page size.");
  return { archiveState, inquiryType, query, cursor, pageSize };
}

export function validContactAction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("inquiryId" in value)) throw new HttpsError("invalid-argument", "The inquiry action is invalid.");
  return docId(value.inquiryId, "inquiry");
}

export function filterContactInquiries(inquiries, request) {
  const archived = request.archiveState === "archived", inArchive = inquiries.filter((item) => item.archived === archived);
  const counts = { all: inArchive.length, operations: 0, general: 0, careers: 0 };
  for (const item of inArchive) counts[item.inquiryType] += 1;
  const filtered = inArchive.filter((item) => {
    if (request.inquiryType !== "all" && item.inquiryType !== request.inquiryType) return false;
    if (!request.query) return true;
    return [item.name, item.email, item.phone, item.company, item.areaOfInterest, item.message].filter(Boolean).join(" ").toLowerCase().includes(request.query);
  });
  const end = Math.min(filtered.length, request.cursor + request.pageSize);
  return { inquiries: filtered.slice(request.cursor, end), counts, nextCursor: end < filtered.length ? end : null, total: filtered.length };
}
