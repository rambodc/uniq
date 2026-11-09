import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../core/firebase";
import { previewInventory } from "../auth/preview";
import sample from "./productUsageSample.json";

export type UsageStatus = "order" | "soon" | "ok" | "over" | "idle";

export type UsageRow = {
  key: string;
  name: string;
  pack: string;
  litre: boolean;
  container: string;
  uniquem: boolean;
  uniquemLabel: string;
  productId: string;
  onHand: number;
  months: (number | null)[];
  total: number;
  average: number;
  forecast30: number;
  forecast60: number;
  days: number | null;
  status: UsageStatus;
};

export type ProductUsageResult = {
  version: number;
  generatedAt: string;
  asOf: string;
  partial: boolean;
  months: string[];
  historyStart?: string;
  coverage?: { month: string; listed: number; reports: number; wells: number }[];
  method: string;
  stockDate: string;
  stockAsOf: string;
  chunks: number;
  summary: {
    reports: number;
    wells: number;
    lines: number;
    productCount: number;
    litreCount: number;
    orderNow: number;
    orderSoon: number;
    healthy: number;
    overstock: number;
    noUsage: number;
    uniquem: number;
  };
  products: UsageRow[];
  uniquemMatched: { name: string; pack: string; family: string }[];
};

function assemble(header: ProductUsageResult, parts: { index?: number; products?: UsageRow[] }[]): ProductUsageResult {
  if (!header.chunks) return header;
  const ordered = parts.slice().sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  return { ...header, chunks: 0, products: ordered.flatMap((part) => part.products || []) };
}

export async function loadProductUsage(): Promise<ProductUsageResult> {
  const snap = await getDoc(doc(db, "inventoryBot", "main", "meta", "productUsage"));
  if (!snap.exists()) throw new Error("Product usage has not been published yet.");
  const header = snap.data() as ProductUsageResult;
  if (!header.chunks) return header;
  const parts = await getDocs(collection(db, "inventoryBot", "main", "meta", "productUsage", "parts"));
  return assemble(header, parts.docs.map((row) => row.data() as { index?: number; products?: UsageRow[] }));
}

export function productUsageError(cause: unknown) {
  const code = typeof cause === "object" && cause && "code" in cause ? String((cause as { code: unknown }).code) : "";
  if (code.includes("permission-denied")) return "Product usage is not available for this sign-in.";
  if (cause instanceof Error && cause.message && !code.endsWith("internal")) return cause.message;
  return "Product usage could not be loaded.";
}

export function previewProductUsage() {
  return (previewInventory() as { productUsage?: ProductUsageResult } | null)?.productUsage ?? null;
}

export function sampleProductUsage(): ProductUsageResult {
  return sample as ProductUsageResult;
}
