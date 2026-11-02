import type { Inquiry, InquiryLegacy } from "../core/api";

export function byNewest(items: Inquiry[]) {
  return [...items].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function inboxRows(items: Inquiry[], archived: boolean, query: string) {
  const needle = query.trim().toLowerCase();
  return byNewest(items.filter((item) => item.archived === archived && (!needle || [item.name, item.email, item.company, item.phone, item.message, item.inquiryType, item.productName].some((value) => String(value || "").toLowerCase().includes(needle)))));
}

const SCROLL_KEY = "contact-inbox-scroll";
const RESTORE_KEY = "contact-inbox-restore";

export function rememberInboxScroll() {
  try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch { /* private mode */ }
}

export function armInboxScrollRestore() {
  try {
    if (sessionStorage.getItem(SCROLL_KEY) == null) return;
    sessionStorage.setItem(RESTORE_KEY, "1");
  } catch { /* private mode */ }
}

export function restoreInboxScroll() {
  try {
    if (sessionStorage.getItem(RESTORE_KEY) !== "1") return;
    const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    sessionStorage.removeItem(RESTORE_KEY);
    requestAnimationFrame(() => window.scrollTo(0, Number.isFinite(y) ? y : 0));
  } catch { /* private mode */ }
}

export function inboxQuery(archived: boolean, query: string) {
  const params = new URLSearchParams();
  if (archived) params.set("archived", "1");
  if (query) params.set("q", query);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function inboxPath(archived: boolean, query: string) {
  return `/contact-inbox${inboxQuery(archived, query)}`;
}

export function messagePath(id: string, archived: boolean, query: string) {
  return `/contact-inbox/${encodeURIComponent(id)}${inboxQuery(archived, query)}`;
}

const TYPE_LABELS: Record<string, string> = { operations: "Operations", product: "Product", general: "General", careers: "Careers" };

export function inquiryLabel(type: string) {
  return TYPE_LABELS[type] ?? type;
}

export function formatInquiryDate(value: string | null, withTime = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function previewText(message: string, max = 140) {
  const text = message.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const LEGACY_LABELS: Record<string, string> = {
  areaOfInterest: "Area of interest",
  linkedinUrl: "LinkedIn",
  status: "Previous status",
  source: "Source",
  archivedBy: "Archived by",
  archivedAt: "Archived at",
};

export function legacyFields(legacy?: InquiryLegacy) {
  if (!legacy) return [];
  return Object.entries(legacy).flatMap(([key, value]) => {
    if (value == null || value === "") return [];
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return [{ key, label: LEGACY_LABELS[key] ?? key, value: text }];
  });
}
