import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { email, optional, text } from "./core.js";

export const INQUIRY_TYPES = ["operations", "product", "general", "careers"];

export function validateInquiry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "The inquiry is invalid.");
  if (value.website) throw new HttpsError("invalid-argument", "The inquiry could not be submitted.");
  if (!INQUIRY_TYPES.includes(value.inquiryType)) throw new HttpsError("invalid-argument", "Choose an inquiry type.");
  const productName = optional(value.productName, "product", 120);
  const company = optional(value.company, "company", 120);
  const phone = optional(value.phone, "phone number", 40);
  const inquiry = {
    schemaVersion: 1,
    inquiryType: value.inquiryType,
    name: text(value.name, "name", 100),
    message: text(value.message, "message", 3000),
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
  };
  const address = value.email == null || value.email === "" ? undefined : email(value.email);
  if (!address && !phone) throw new HttpsError("invalid-argument", "Enter an email address or a phone number.");
  if (address) inquiry.email = address;
  if (productName) inquiry.productName = productName;
  if (company) inquiry.company = company;
  if (phone) inquiry.phone = phone;
  return inquiry;
}

function plain(value) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = plain(item);
    return out;
  }
  return String(value);
}

/** The inbox view of one stored inquiry. Extra stored fields stay under `legacy` and are not dropped. */
export function publicInquiry(id, data) {
  const createdAt = data.createdAt?.toDate?.().toISOString() || (typeof data.createdAt === "string" ? data.createdAt : null);
  const inquiry = { id, inquiryType: data.inquiryType || "general", name: data.name || "", message: data.message || "", createdAt, archived: data.archived === true };
  for (const key of ["productName", "email", "company", "phone"]) if (data[key]) inquiry[key] = data[key];
  if (data.legacy && typeof data.legacy === "object" && !Array.isArray(data.legacy)) inquiry.legacy = plain(data.legacy);
  return inquiry;
}

export function visibleInquiries(inquiries, { archived, query }) {
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  return inquiries.filter((item) => (item.archived === true) === archived && (!needle || [item.inquiryType, item.productName, item.name, item.email, item.company, item.phone, item.message].some((value) => String(value || "").toLowerCase().includes(needle))));
}
