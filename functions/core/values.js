import { HttpsError } from "firebase-functions/v2/https";

export function text(value, label, max = 100) { const result = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""; if (!result || result.length > max) throw new HttpsError("invalid-argument", `Enter a valid ${label}.`); return result; }
export function optionalText(value, label, max) { if (value === undefined || value === null || value === "") return null; return text(value, label, max); }
export function email(value) { const result = typeof value === "string" ? value.trim().toLowerCase() : ""; if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpsError("invalid-argument", "Enter a valid email address."); return result; }
export function role(value) { if (!['admin', 'employee', 'member'].includes(value)) throw new HttpsError("invalid-argument", "Choose a valid role."); return value; }
export function status(value) { if (!['active', 'disabled'].includes(value)) throw new HttpsError("invalid-argument", "Choose a valid status."); return value; }
export function docId(value, label = "record") { const result = text(value, label, 180); if (result.includes("/")) throw new HttpsError("invalid-argument", `Choose a valid ${label}.`); return result; }
export function iso(value) { return value?.toDate ? value.toDate().toISOString() : value instanceof Date ? value.toISOString() : null; }
