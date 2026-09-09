import Decimal from "decimal.js";
export interface Fact {
  value: string | null;
  originalValue?: string | null;
  originalUnit?: string | null;
  unit: string | null;
  sources: string[];
  status: "reported" | "interpreted" | "edited";
}
export interface DataRecord {
  id: string;
  kind: string;
  label: string;
  report: string | null;
  product: string | null;
  branch: string | null;
  facts: Record<string, Fact>;
}
export interface Branch {
  id: string;
  label: string;
  startM: number;
  endM: number;
  diameterMm: number;
  parent: string | null;
  azimuth: number;
  inclination: number;
  visible: boolean;
  status: string;
  sources: string[];
}
export interface Source {
  id: string;
  file: string;
  sheet: string;
  cell: string;
  raw: string | number | null;
  display: string;
  formula: string | null;
  row: number;
  column: number;
}
export interface Issue {
  id: string;
  code: string;
  message: string;
  sources: string[];
  recordId: string | null;
  field?: string;
  candidate?: Fact;
  accepted?: Fact;
}
export interface CostGroup {
  currency: string;
  productCost: string;
  serviceCost: string;
  totalCost: string;
}
export interface Summary {
  currencies: CostGroup[];
  productCost: string | null;
  serviceCost: string | null;
  totalCost: string | null;
  products: {
    product: string;
    currency: string;
    cost: string;
    sources: string[];
  }[];
  reports: number;
  branches: number;
}
export interface Well {
  id: string;
  name: string;
  status: string;
  version: string | null;
  revision: number;
  updatedAt: string;
  summary?: Summary;
}
export interface Dataset {
  well: Well;
  records: DataRecord[];
  geometry: Branch[];
  wellbore: Wellbore | null;
  currency: string | null;
  issues: Issue[];
  coverage: { mapped: number; populated: number };
  summary: Summary;
}
export interface ImportJob {
  geometryJobId?: string;
  sourceImportId?: string;
  version?: string;
  baseRevision?: number;
  kind?: "import" | "geometry";
  updatedAt?: string;
  id: string;
  wellId: string;
  status: string;
  stage: string;
  message?: string;
  createdAt: string;
  files: {
    name: string;
    size: number;
    sha256: string;
    path: string;
    id: string;
  }[];
  completed?: number;
  total?: number;
  attempts: number;
  coverage?: { mapped: number; populated: number };
}
export interface Version {
  id: string;
  revision: number;
  createdAt: string;
  reason: string;
}
export interface ChatMessage {
  id: string;
  question: string;
  answer: string;
  citations: string[];
  highlights: string[];
  version: string;
  createdAt: string;
}
export const value = (r: DataRecord | undefined, key: string) =>
  r?.facts[key]?.value ?? null;
export const numeric = (r: DataRecord | undefined, key: string) => {
  const v = value(r, key);
  return v !== null && v !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : null;
};
export const pretty = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
export const money = (
  n: string | number | null | undefined,
  currency?: string | null,
) =>
  n === null || n === undefined
    ? "—"
    : `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency && currency !== "unspecified" ? ` ${currency}` : ""}`;
export const dateLabel = (s: string | null) =>
  s?.replace(/_/g, " ") ?? "Date not provided";
export const reportRecords = (data: Dataset) =>
  data.records
    .filter((r) => r.kind === "report")
    .sort((a, b) =>
      (value(a, "createdDate") || value(a, "date") || a.label).localeCompare(
        value(b, "createdDate") || value(b, "date") || b.label,
        undefined,
        { numeric: true },
      ),
    );
export function reportCost(
  data: Dataset,
  report: string,
  product: string | null = null,
) {
  const costs = new Map<string, Decimal>();
  for (const r of data.records.filter(
    (r) =>
      r.kind === "usage" &&
      r.report === report &&
      (!product || r.product === product),
  )) {
    const p = data.records.find(
      (p) => p.kind === "product" && p.label === r.product,
    );
    const quantity = numeric(r, "quantity"),
      price =
        numeric(r, "unitPrice") ??
        (compatiblePackage(r, p) ? numeric(p, "unitPrice") : null);
    const cost =
      numeric(r, "cost") ??
      (quantity !== null && price !== null
        ? new Decimal(quantity).times(price).toNumber()
        : null);
    if (cost !== null) {
      const currency =
        currencyFor(r, "unitPrice") ||
        currencyFor(r, "cost") ||
        currencyFor(p, "unitPrice") ||
        data.currency ||
        "unspecified";
      costs.set(currency, (costs.get(currency) || new Decimal(0)).plus(cost));
    }
  }
  return new Map(
    [...costs].map(([k, v]) => [k, v.toDecimalPlaces(2).toNumber()]),
  );
}
export function exportCsv(name: string, headers: string[], rows: unknown[][]) {
  const quote = (v: unknown) => {
    let text = String(v ?? "");
    if (
      /^[=+@\t\r]/.test(text) ||
      (/^-.+/.test(text) && !Number.isFinite(Number(text)))
    )
      text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [headers, ...rows].map((r) => r.map(quote).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  download(URL.createObjectURL(blob), name);
}
export function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const compatiblePackage = (
  a: DataRecord | undefined,
  b: DataRecord | undefined,
) =>
  (value(a, "package") || "").trim().toLowerCase() ===
  (value(b, "package") || "").trim().toLowerCase();

export interface Wellbore {
  kickoffM: number;
  horizontalTvdM: number;
  casings: {
    id: string;
    label: string;
    endM: number;
    diameterMm: number;
    sources: string[];
  }[];
  status: "interpreted" | "edited";
}

export const currencyFor = (r: DataRecord | undefined, field: string) =>
  value(r, "currency") ||
  (/^[A-Z]{3}$/.test(r?.facts[field]?.unit || "")
    ? r!.facts[field].unit
    : null);

export function scopedCosts(
  data: Dataset,
  report: string | null,
  product: string | null,
) {
  const groups = new Map<
    string,
    { currency: string; products: Decimal; services: Decimal }
  >();
  let unpriced = 0;
  const group = (currency: string | null) => {
    const k = currency || data.currency || "unspecified";
    if (!groups.has(k))
      groups.set(k, {
        currency: k,
        products: new Decimal(0),
        services: new Decimal(0),
      });
    return groups.get(k)!;
  };
  for (const r of data.records.filter(
    (r) =>
      r.kind === "usage" &&
      (!report || r.report === report) &&
      (!product || r.product === product),
  )) {
    const p = data.records.find(
        (p) => p.kind === "product" && p.label === r.product,
      ),
      price =
        value(r, "unitPrice") ??
        (compatiblePackage(r, p) ? value(p, "unitPrice") : null),
      q = value(r, "quantity"),
      cost = value(r, "cost");
    if (cost === null && (price === null || q === null)) {
      unpriced++;
      continue;
    }
    const g = group(
      currencyFor(r, "cost") ||
        currencyFor(r, "unitPrice") ||
        currencyFor(p, "unitPrice"),
    );
    g.products = g.products.plus(
      cost !== null ? new Decimal(cost) : new Decimal(q!).times(price!),
    );
  }
  if (!product)
    for (const r of data.records.filter(
      (r) => r.kind === "report" && (!report || r.label === report),
    ))
      if (value(r, "serviceCost") !== null) {
        const g = group(currencyFor(r, "serviceCost"));
        g.services = g.services.plus(value(r, "serviceCost")!);
      }
  return {
    unpriced,
    groups: [...groups.values()].map((g) => ({
      currency: g.currency,
      productCost: g.products.toFixed(2),
      serviceCost: g.services.toFixed(2),
      totalCost: g.products.plus(g.services).toFixed(2),
    })),
  };
}
