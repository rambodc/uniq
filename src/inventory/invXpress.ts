import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../core/firebase";
import { previewInventory } from "../auth/preview";

export type InvPackRow = {
  key: string;
  name: string;
  pack: string;
  litre: boolean;
  linked: boolean;
  link: string;
  productId: string;
  warehouses: number;
  wells: number;
  total: number;
  committed: number;
  available: number;
  inTransit: number;
  xpressNames: string[];
  byWarehouse: { code: string; name: string; units: number }[];
  byWell: { id: string; name: string; rig: string; units: number }[];
};

export type InvWellProduct = {
  key: string;
  name: string;
  pack: string;
  litre: boolean;
  delivered: number;
  transferredIn: number;
  returned: number;
  movedOut: number;
  counted: number;
  left: number | null;
};

export type InvWellRow = {
  id: string;
  name: string;
  rig: string;
  operator: string;
  status: string;
  paused: boolean;
  firstReport: string;
  lastReport: string;
  noReports: boolean;
  role: "current" | "finished" | "alongside";
  groupId: string;
  reason: string;
  includedIn: string;
  alongside: string[];
  delivered: number;
  transferredIn: number;
  returned: number;
  movedOut: number;
  counted: number;
  sentIn: number;
  productCount: number;
  products: InvWellProduct[];
};

export type InvXpressResult = {
  version: number;
  computedAt: string;
  stockDate: string;
  stockAsOf: string;
  reportsSyncedAt: string;
  syncStatus: string;
  chunks: number;
  summary: {
    warehouses: { units: number; committed: number; available: number; inTransit: number; productCount: number; warehouseCount: number };
    wells: { units: number; delivered: number; transferredIn: number; returned: number; movedOut: number; productCount: number; wellCount: number; active: number; paused: number; groups: number; finished: number; noReports: number };
    total: { units: number; productCount: number };
    litres: { warehouseUnits: number; wellUnits: number; total: number; productCount: number };
  };
  warehouses: { code: string; name: string }[];
  products: InvPackRow[];
  groups: { id: string; rig: string; operator: string; currentWellId: string; wellIds: string[]; delivered: number; transferredIn: number; returned: number; movedOut: number; counted: number }[];
  wells: InvWellRow[];
  unlinked: { name: string; pack: string; units: number }[];
  splits?: { rig: string; operators: string[]; reason: string }[];
};

function assemble(header: InvXpressResult, parts: Partial<InvXpressResult>[]): InvXpressResult {
  if (!header.chunks) return header;
  const ordered = parts.slice().sort((a, b) => Number((a as { index?: number }).index || 0) - Number((b as { index?: number }).index || 0));
  return {
    ...header,
    chunks: 0,
    products: ordered.flatMap((part) => part.products || []),
    wells: ordered.flatMap((part) => part.wells || []),
    groups: ordered.flatMap((part) => part.groups || []),
  };
}

export async function loadInvXpress(): Promise<InvXpressResult> {
  const snap = await getDoc(doc(db, "inventoryBot", "main", "meta", "invXpress"));
  if (!snap.exists()) throw new Error("Inventory Xpress has not been published yet.");
  const header = snap.data() as InvXpressResult;
  if (!header.chunks) return header;
  const parts = await getDocs(collection(db, "inventoryBot", "main", "meta", "invXpress", "parts"));
  return assemble(header, parts.docs.map((row) => row.data() as Partial<InvXpressResult>));
}

export function invXpressError(cause: unknown) {
  const code = typeof cause === "object" && cause && "code" in cause ? String((cause as { code: unknown }).code) : "";
  if (code.includes("permission-denied")) return "Inventory Xpress is not available for this sign-in.";
  if (cause instanceof Error && cause.message && !code.endsWith("internal")) return cause.message;
  return "The chemical count could not be loaded.";
}

export function previewInvXpress() {
  return previewInventory()?.invXpress ?? null;
}
