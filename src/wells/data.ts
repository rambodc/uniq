import { collection, doc, getDoc, getDocs, type DocumentData } from "firebase/firestore";
import { db } from "../core/firebase";
import { previewActive } from "../auth/preview";
type SampleModule = { default: Sample };

export type WellIndex = {
  id: string;
  name: string;
  location: string;
  rig: string | number;
  operator: string;
  contractor: string;
  status: string;
  fieldName: string;
  province: string;
  spudDate: string;
  releasedDate: string;
  firstReportDate: string;
  lastReportDate: string;
  reportCount: number;
  totalCost: number;
};

export type DocMap = Record<string, DocumentData>;

type Sample = {
  meta: { count: number; copiedAt?: string; wells: WellIndex[] };
  well: DocumentData & { id: string };
  sub: Record<string, DocMap>;
  reportId: string;
  reportInv: DocMap;
};

async function fixture(): Promise<Sample> {
  const loaded = await import("./sample.json") as SampleModule;
  return loaded.default;
}

export function asList<T = DocumentData>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item != null) as T[];
  if (typeof value === "object") {
    return Object.keys(value as object).sort((a, b) => (Number.isFinite(Number(a)) && Number.isFinite(Number(b)) ? Number(a) - Number(b) : a.localeCompare(b))).map((key) => (value as Record<string, T>)[key]).filter((item) => item != null);
  }
  return [];
}

export function money(value: unknown) {
  const number = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(number);
}

export function grouped(value: unknown, digits = 2) {
  if (typeof value === "string" && /[%a-z]/i.test(value)) return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return value == null || value === "" ? "—" : String(value);
  return new Intl.NumberFormat("en-CA", { maximumFractionDigits: digits }).format(number);
}

/** Staff ids in the copy replace @ and . so they can be map keys. */
export function prettyEmail(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text.includes("@")) return text;
  const at = text.indexOf("at");
  if (at <= 0) return text;
  return `${text.slice(0, at)}@${text.slice(at + 2).replaceAll("dot", ".")}`;
}

export function dayLabel(value: unknown) {
  const text = String(value ?? "");
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (!iso) return text ? text.slice(0, 24) : "—";
  const parsed = new Date(`${iso[0]}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso[0];
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function copiedLabel(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const wellRef = (id: string) => doc(db, "wellsApp", "main", "olderWells", id);

export async function loadOlderIndex(): Promise<{ wells: WellIndex[]; copiedAt: string }> {
  if (import.meta.env.DEV && previewActive()) {
    const data = await fixture();
    return { wells: data.meta.wells, copiedAt: data.meta.copiedAt || "" };
  }
  const snap = await getDoc(doc(db, "wellsApp", "main", "meta", "olderWells"));
  const data = snap.data() || {};
  return { wells: asList<WellIndex>(data.wells), copiedAt: String(data.copiedAt || "") };
}

export async function loadWell(id: string): Promise<DocumentData | null> {
  if (import.meta.env.DEV && previewActive()) {
    const data = await fixture();
    return id === data.well.id ? data.well : null;
  }
  const snap = await getDoc(wellRef(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function loadGroup(wellId: string, group: string): Promise<DocMap> {
  if (import.meta.env.DEV && previewActive()) {
    const data = await fixture();
    if (wellId !== data.well.id) return {};
    return data.sub[group] || {};
  }
  const snap = await getDocs(collection(db, "wellsApp", "main", "olderWells", wellId, group));
  return Object.fromEntries(snap.docs.map((item) => [item.id, item.data()]));
}

export async function loadReport(wellId: string, reportId: string): Promise<{ report: DocumentData | null; inventory: DocMap }> {
  if (import.meta.env.DEV && previewActive()) {
    const data = await fixture();
    if (wellId !== data.well.id) return { report: null, inventory: {} };
    return { report: data.sub.reports?.[reportId] || null, inventory: reportId === data.reportId ? data.reportInv : {} };
  }
  const reportSnap = await getDoc(doc(db, "wellsApp", "main", "olderWells", wellId, "reports", reportId));
  const inventorySnap = await getDocs(collection(db, "wellsApp", "main", "olderWells", wellId, "reports", reportId, "inventory"));
  return {
    report: reportSnap.exists() ? reportSnap.data() : null,
    inventory: Object.fromEntries(inventorySnap.docs.map((item) => [item.id, item.data()])),
  };
}

