import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";

export const idFor = (...parts) =>
  createHash("sha256")
    .update(parts.map(String).join("\u001f"))
    .digest("hex")
    .slice(0, 32);
export const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
export const Fact = z.object({
  value: z.string().nullable(),
  originalValue: z.string().nullable().optional(),
  originalUnit: z.string().nullable().optional(),
  unit: z.string().nullable(),
  sources: z.array(z.string()),
  status: z.enum(["reported", "interpreted", "edited"]),
});
export const emptyDataset = () => ({
  schemaVersion: 2,
  records: [],
  issues: [],
  sources: [],
  geometry: [],
  wellbore: null,
  currency: null,
  coverage: { mapped: 0, populated: 0 },
});
export const fact = (record, key) => record?.facts?.[key]?.value ?? null;
export const compatiblePackage = (a, b) =>
  normalize(fact(a, "package")) === normalize(fact(b, "package"));
export const currencyFor = (r, field) =>
  fact(r, "currency") ||
  (/^[A-Z]{3}$/.test(r?.facts[field]?.unit || "") ? r.facts[field].unit : null);
export const num = (record, key) => {
  const v = fact(record, key);
  return v !== null && v !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : null;
};
export const dec = (value) => {
  try {
    return new Decimal(
      typeof value === "string"
        ? value.replace(/,(?=\d{3}(?:\D|$))/g, "")
        : (value ?? 0),
    );
  } catch {
    return new Decimal(0);
  }
};
export function issue(
  code,
  message,
  sources = [],
  recordId = null,
  extra = {},
) {
  return {
    id: idFor(code, message, recordId),
    code,
    message,
    sources,
    recordId,
    ...extra,
  };
}

export function reconcile(dataset) {
  const records = dataset.records,
    issues = [...dataset.issues.filter((i) => !i.code.startsWith("check:"))];
  const products = records.filter((r) => r.kind === "product");
  for (const p of products) {
    const usage = records.filter(
      (r) =>
        r.kind === "usage" &&
        normalize(r.product) === normalize(p.label) &&
        compatiblePackage(r, p),
    );
    if (
      records.some(
        (r) =>
          r.kind === "usage" &&
          normalize(r.product) === normalize(p.label) &&
          !compatiblePackage(r, p),
      )
    )
      issues.push(
        issue(
          "check:package",
          `${p.label}: incompatible or unknown package sizes were excluded from the quantity balance.`,
          p.facts.package?.sources || [],
          p.id,
        ),
      );
    const used = usage.reduce(
      (s, r) => s.plus(fact(r, "quantity") || 0),
      dec(0),
    );
    const reported = fact(p, "totalUsed");
    if (reported !== null && used.minus(reported).abs().gt("0.00001"))
      issues.push(
        issue(
          "check:usage",
          `${p.label}: report usage ${used} differs from stated usage ${reported}.`,
          p.facts.totalUsed.sources,
          p.id,
        ),
      );
    const received = fact(p, "totalReceived"),
      returned = fact(p, "totalReturned"),
      remaining = fact(p, "totalRemaining"),
      opening = fact(p, "openingStock");
    if (received !== null && returned !== null && remaining !== null) {
      const expected = dec(opening).plus(received).minus(returned).minus(used);
      if (expected.minus(remaining).abs().gt("0.00001"))
        issues.push(
          issue(
            "check:balance",
            `${p.label}: reported remaining ${remaining}; calculated ${expected}${opening === null ? " (assuming zero opening stock)" : ""}.`,
            p.facts.totalRemaining.sources,
            p.id,
          ),
        );
    }
    const price = fact(p, "unitPrice"),
      cost = fact(p, "totalCost");
    if (
      price !== null &&
      cost !== null &&
      used.times(price).minus(cost).abs().gt("0.01")
    )
      issues.push(
        issue(
          "check:product-cost",
          `${p.label}: stated cost differs from usage × unit price.`,
          p.facts.totalCost.sources,
          p.id,
        ),
      );
  }
  for (const r of records)
    if (r.kind === "usage" && num(r, "quantity") < 0)
      issues.push(
        issue(
          "check:negative",
          `${r.product}: negative usage ${fact(r, "quantity")} retained as a signed entry; classification required.`,
          r.facts.quantity.sources,
          r.id,
        ),
      );
  for (const r of records.filter((r) => r.kind === "usage")) {
    const p = products.find((p) => normalize(p.label) === normalize(r.product));
    if (
      num(r, "quantity") !== 0 &&
      fact(r, "cost") === null &&
      fact(r, "unitPrice") === null &&
      (!compatiblePackage(r, p) || fact(p, "unitPrice") === null)
    )
      issues.push(
        issue(
          "check:unpriced",
          `${r.product}: usage has no compatible unit price or line cost and is excluded from calculated spend.`,
          Object.values(r.facts).flatMap((f) => f.sources),
          r.id,
        ),
      );
  }
  const totals = summarize(dataset);
  for (const r of records.filter((r) => r.kind === "branch")) {
    const length = num(r, "endM") - num(r, "startM"),
      loss = num(r, "lossesM3"),
      rate = num(r, "lossRateM3Per100M");
    if (
      length > 0 &&
      loss !== null &&
      rate !== null &&
      Math.abs((loss / length) * 100 - rate) > 0.15
    )
      issues.push(
        issue(
          "check:loss-rate",
          `${r.label}: reported loss rate ${rate} differs from volume / length × 100 (${((loss / length) * 100).toFixed(2)}).`,
          r.facts.lossRateM3Per100M.sources,
          r.id,
        ),
      );
  }
  for (const r of records.filter((r) => r.kind === "well"))
    if (
      fact(r, "totalCost") !== null &&
      totals.currencies.length === 1 &&
      dec(totals.totalCost)
        .minus(dec(fact(r, "totalCost")))
        .abs()
        .gt("0.01")
    )
      issues.push(
        issue(
          "check:well-cost",
          `Source total ${fact(r, "totalCost")} differs from calculated ${totals.totalCost} by ${dec(
            totals.totalCost,
          )
            .minus(dec(fact(r, "totalCost")))
            .toFixed(2)}.`,
          r.facts.totalCost.sources,
          r.id,
        ),
      );
  return {
    ...dataset,
    issues: [...new Map(issues.map((i) => [i.id, i])).values()],
  };
}

export function summarize(dataset, report = null, product = null) {
  const all = dataset.records,
    selected = all.filter(
      (r) =>
        (!report ||
          r.report === report ||
          (r.kind === "report" && r.label === report)) &&
        (!product ||
          r.product === product ||
          (r.kind === "product" && r.label === product)),
    );
  const products = all.filter((r) => r.kind === "product");
  const groups = new Map();
  const getGroup = (currency) => {
    const key = currency || dataset.currency || "unspecified";
    if (!groups.has(key))
      groups.set(key, {
        currency: key,
        productCost: dec(0),
        serviceCost: dec(0),
      });
    return groups.get(key);
  };
  const productTotals = new Map();
  for (const r of selected.filter((r) => r.kind === "usage")) {
    const p = products.find((p) => normalize(p.label) === normalize(r.product));
    const price =
      fact(r, "unitPrice") ??
      (compatiblePackage(r, p) ? fact(p, "unitPrice") : null);
    const cost =
      fact(r, "cost") !== null
        ? dec(fact(r, "cost"))
        : price !== null
          ? dec(fact(r, "quantity")).times(price)
          : null;
    if (cost === null) continue;
    const g = getGroup(
      currencyFor(r, "unitPrice") ||
        currencyFor(r, "cost") ||
        currencyFor(p, "unitPrice"),
    );
    g.productCost = g.productCost.plus(cost);
    const k = `${r.product}|${g.currency}`;
    const old = productTotals.get(k) || {
      product: r.product,
      currency: g.currency,
      cost: dec(0),
      sources: [],
    };
    old.cost = old.cost.plus(cost);
    old.sources.push(...Object.values(r.facts).flatMap((f) => f.sources));
    productTotals.set(k, old);
  }
  for (const r of selected.filter((r) => r.kind === "report"))
    if (fact(r, "serviceCost") !== null) {
      const g = getGroup(currencyFor(r, "serviceCost"));
      g.serviceCost = g.serviceCost.plus(fact(r, "serviceCost"));
    }
  const currencies = [...groups.values()].map((g) => ({
    currency: g.currency,
    productCost: g.productCost.toFixed(2),
    serviceCost: g.serviceCost.toFixed(2),
    totalCost: g.productCost.plus(g.serviceCost).toFixed(2),
  }));
  return {
    currencies,
    productCost: currencies.length === 1 ? currencies[0].productCost : null,
    serviceCost: currencies.length === 1 ? currencies[0].serviceCost : null,
    totalCost: currencies.length === 1 ? currencies[0].totalCost : null,
    products: [...productTotals.values()]
      .map((p) => ({
        ...p,
        cost: p.cost.toFixed(2),
        sources: [...new Set(p.sources)],
      }))
      .sort((a, b) => Number(b.cost) - Number(a.cost)),
    reports: all.filter((r) => r.kind === "report").length,
    branches: all.filter((r) => r.kind === "branch").length,
  };
}

export function calculationEvidence(dataset, report = null, product = null) {
  const selected = dataset.records.filter(
    (r) =>
      (!report ||
        r.report === report ||
        (r.kind === "report" && r.label === report)) &&
      (!product || r.product === product),
  );
  const original = new Map(dataset.sources.map((s) => [s.id, s]));
  return summarize(dataset, report, product).currencies.map((group) => {
    const inputs = selected
      .filter((r) => r.kind === "usage" || r.kind === "report")
      .filter((r) => {
        const p = dataset.records.find(
          (p) =>
            p.kind === "product" && normalize(p.label) === normalize(r.product),
        );
        const currency =
          r.kind === "report"
            ? currencyFor(r, "serviceCost")
            : currencyFor(r, "unitPrice") ||
              currencyFor(r, "cost") ||
              currencyFor(p, "unitPrice");
        return (
          (currency || dataset.currency || "unspecified") === group.currency
        );
      })
      .map((r) => {
        const p = dataset.records.find(
          (p) =>
            p.kind === "product" && normalize(p.label) === normalize(r.product),
        );
        const fields = {
          ...r.facts,
          ...(!r.facts.unitPrice &&
          p?.facts.unitPrice &&
          compatiblePackage(r, p)
            ? { unitPrice: p.facts.unitPrice }
            : {}),
        };
        return `${r.label}: ${[
          "quantity",
          "unitPrice",
          "cost",
          "serviceCost",
          "currency",
        ]
          .filter(
            (k) => fields[k]?.value !== undefined && fields[k].value !== null,
          )
          .map(
            (k) =>
              `${k}=${fields[k].value} [${fields[k].sources
                .map((id) => {
                  const source = original.get(id);
                  return source
                    ? `${source.file} / ${source.sheet}!${source.cell}`
                    : id;
                })
                .join("; ")}]`,
          )
          .join(", ")}`;
      });
    return {
      id: idFor("calculation", report, product, group.currency),
      file: "Validated calculations",
      sheet: report || "Whole well",
      cell: product || "Cost reconciliation",
      row: 0,
      column: 0,
      formula: null,
      type: "derived",
      raw: group.totalCost,
      display: `Currency: ${group.currency}. Product cost: ${group.productCost}. Service cost: ${group.serviceCost}. Combined total: ${group.totalCost}.\nMethod: sum signed usage quantity × its price (or explicit source line cost); sum report service costs; add the two. Decimal arithmetic; no currency conversion.\n${inputs.join("\n")}`,
    };
  });
}

export function mergeDatasets(previous, incoming) {
  const next = structuredClone(previous),
    byId = new Map(next.records.map((r) => [r.id, r]));
  for (const r of incoming.records) {
    const old = byId.get(r.id);
    if (!old) {
      byId.set(r.id, structuredClone(r));
      continue;
    }
    for (const [key, f] of Object.entries(r.facts)) {
      if (!old.facts[key] || old.facts[key].value === null) old.facts[key] = f;
      else if (
        old.facts[key].value !== f.value ||
        old.facts[key].unit !== f.unit
      )
        next.issues.push(
          issue(
            "conflict",
            `${r.label}: conflicting ${key}. Existing value retained.`,
            f.sources,
            r.id,
            { field: key, candidate: f, accepted: old.facts[key] },
          ),
        );
      else
        old.facts[key].sources = [
          ...new Set([...old.facts[key].sources, ...f.sources]),
        ];
    }
  }
  const acceptedIds = new Set(previous.records.map((r) => r.id));
  const geometryIds = new Set(next.geometry.map((b) => b.id));
  for (const b of incoming.geometry || [])
    if (!acceptedIds.has(b.id) && !geometryIds.has(b.id))
      next.geometry.push(structuredClone(b));
  if (!next.wellbore && incoming.wellbore)
    next.wellbore = structuredClone(incoming.wellbore);
  next.records = [...byId.values()];
  next.sources = [
    ...new Map(
      [...previous.sources, ...incoming.sources].map((s) => [s.id, s]),
    ).values(),
  ];
  next.issues.push(...incoming.issues);
  next.coverage = {
    populated: next.sources.length,
    mapped: new Set(
      next.records.flatMap((r) =>
        Object.values(r.facts).flatMap((f) => f.sources),
      ),
    ).size,
  };
  return reconcile(next);
}

export function validateGeometry(branches) {
  if (!Array.isArray(branches) || branches.length > 250)
    throw new Error("Geometry must contain at most 250 branches.");
  const ids = new Set(branches.map((b) => b.id));
  if (ids.size !== branches.length)
    throw new Error("Duplicate branch identifiers.");
  for (const b of branches) {
    if (
      typeof b.id !== "string" ||
      typeof b.label !== "string" ||
      b.label.length > 100 ||
      !Number.isFinite(b.startM) ||
      !Number.isFinite(b.endM) ||
      b.startM < 0 ||
      b.endM <= b.startM ||
      !Number.isFinite(b.diameterMm) ||
      b.diameterMm <= 0 ||
      b.diameterMm > 5000 ||
      !Number.isFinite(b.azimuth) ||
      !Number.isFinite(b.inclination) ||
      b.inclination < 0 ||
      b.inclination > 180 ||
      typeof b.visible !== "boolean"
    )
      throw new Error("Invalid branch length, diameter, or direction.");
    if (b.parent && !ids.has(b.parent))
      throw new Error("Unknown parent branch.");
    const seen = new Set([b.id]);
    let parent = branches.find((p) => p.id === b.parent);
    if (parent && (b.startM < parent.startM || b.startM > parent.endM))
      throw new Error("Kickoff must fall within the parent branch.");
    while (parent) {
      if (seen.has(parent.id)) throw new Error("Branch parent cycle.");
      seen.add(parent.id);
      parent = branches.find((p) => p.id === parent.parent);
    }
  }
  return branches;
}

export function importedGeometry(dataset) {
  const branches = dataset.records.filter(
    (r) => r.kind === "branch" && num(r, "endM") > (num(r, "startM") ?? 0),
  );
  return branches.map((r, i) => ({
    id: r.id,
    label: r.label,
    startM: num(r, "startM") ?? 0,
    endM: num(r, "endM"),
    diameterMm: num(r, "diameterMm") ?? 200,
    parent: branches.find((p) => p.label === fact(r, "parent"))?.id ?? null,
    azimuth:
      num(r, "azimuth") ??
      (i - (branches.length - 1) / 2) *
        Math.min(8, 140 / Math.max(branches.length, 1)),
    inclination: num(r, "inclination") ?? 90,
    visible: true,
    status: "interpreted",
    sources: Object.values(r.facts).flatMap((f) => f.sources),
  }));
}

export function importedWellbore(dataset) {
  const well = dataset.records.find((r) => r.kind === "well"),
    reports = dataset.records.filter((r) => r.kind === "report");
  const tvds = reports
    .map((r) => num(r, "tvdM"))
    .filter((n) => n !== null && n > 10)
    .sort((a, b) => a - b);
  const casings = dataset.records
    .filter(
      (r) =>
        r.kind === "equipment" &&
        /casing|csg/i.test(r.label) &&
        num(r, "setDepthM") > 0 &&
        num(r, "diameterMm") > 0,
    )
    .map((r) => ({
      id: r.id,
      label: r.label,
      endM: num(r, "setDepthM"),
      diameterMm: num(r, "diameterMm"),
      sources: Object.values(r.facts).flatMap((f) => f.sources),
    }));
  return {
    kickoffM: num(well, "kickoffM") ?? 100,
    horizontalTvdM: tvds.length ? tvds[Math.floor(tvds.length / 2)] : 350,
    casings,
    status: "interpreted",
  };
}
