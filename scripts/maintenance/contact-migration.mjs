export const INQUIRY_TYPES = ["operations", "product", "general", "careers"];
const KNOWN = new Set(["schemaVersion", "inquiryType", "productName", "name", "email", "phone", "company", "message", "archived", "createdAt", "legacy"]);

/** True when a contactInquiries document is still in the previous shape. */
export function needsContactMigration(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (data.archived !== true && data.archived !== false) return true;
  if (data.schemaVersion !== 1) return true;
  return Object.keys(data).some((key) => !KNOWN.has(key));
}

/** Converts one old inquiry. Extra fields, including linkedinUrl and areaOfInterest, move into `legacy`. */
export function convertContactInquiry(data) {
  const legacy = {};
  for (const [key, value] of Object.entries(data)) {
    if (KNOWN.has(key) || value == null || value === "") continue;
    legacy[key] = value;
  }
  const next = {
    schemaVersion: 1,
    inquiryType: INQUIRY_TYPES.includes(data.inquiryType) ? data.inquiryType : "general",
    name: typeof data.name === "string" ? data.name.trim() : "",
    message: typeof data.message === "string" ? data.message.trim() : "",
    archived: data.archived === true || data.status === "archived",
    createdAt: data.createdAt ?? null,
  };
  if (typeof data.productName === "string" && data.productName.trim()) next.productName = data.productName.trim();
  if (typeof data.email === "string" && data.email.trim()) next.email = data.email.trim().toLowerCase();
  if (typeof data.phone === "string" && data.phone.trim()) next.phone = data.phone.trim();
  if (typeof data.company === "string" && data.company.trim()) next.company = data.company.trim();
  if (Object.keys(legacy).length) next.legacy = legacy;
  return next;
}
