import { idFor, issue } from "./model.js";
import { parseLsd, GRID_VERSION } from "../../shared/locations/grid.js";
export const detailLabels = {
  "well name": "name",
  location: "location",
  uwi: "location",
  province: "province",
  formation: "formation",
  "field name": "fieldName",
  afe: "afe",
  "total depth": "reportedTotalDepth",
  license: "license",
  licence: "license",
  "well file creation date": "wellFileCreationDate",
  "spud date": "spudDate",
  "released date": "releasedDate",
  operator: "operator",
  contractor: "contractor",
  "contractor report for": "contractorReportFor",
  "rig name": "rigName",
  "well notes": "wellNotes",
};
const normalize = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const comparable = (field, value) => {
  const text = normalize(value);
  if (field === "province")
    return (
      {
        ab: "alberta",
        sk: "saskatchewan",
        bc: "british columbia",
        "ca-ab": "alberta",
      }[text] || text
    );
  if (field === "location") {
    try {
      return parseLsd(value).canonical;
    } catch {
      return text;
    }
  }
  return text;
};
const header = (s) =>
  normalize(s)
    .replace(/:$/, "")
    .replace(/\s*\((m|ft|metres|meters|feet)\)$/, "");
export function integrateWellDetails(dataset) {
  const groups = new Map();
  for (const source of dataset.sources || []) {
    const key = `${source.fileId || source.file}\0${source.sheet}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(source);
  }
  const incoming = [];
  for (const cells of groups.values()) {
    const anchors = cells.filter((c) => header(c.raw) === "well name");
    for (const anchor of anchors) {
      const next =
        anchors
          .filter((c) => c.column === anchor.column && c.row > anchor.row)
          .sort((a, b) => a.row - b.row)[0]?.row || anchor.row + 50;
      const block = cells.filter(
        (c) =>
          c.column === anchor.column &&
          c.row >= anchor.row &&
          c.row < Math.min(next, anchor.row + 50),
      );
      if (!block.some((c) => ["location", "uwi"].includes(header(c.raw))))
        continue;
      for (const label of block) {
        const field = detailLabels[header(label.raw)];
        if (!field) continue;
        const value = cells
          .filter(
            (c) =>
              c.row === label.row &&
              c.column > label.column &&
              c.column <= label.column + 2,
          )
          .sort((a, b) => a.column - b.column)
          .find((c) => c.raw !== null && String(c.raw).trim() !== "");
        if (!value) continue;
        let text = String(value.display || value.raw).trim();
        if (field === "wellNotes")
          text = String(value.raw)
            .replace(/<br\s*\/?\s*>/gi, "\n")
            .trim();
        const unit =
          field === "reportedTotalDepth"
            ? String(label.raw)
                .match(/\((m|ft|metres|meters|feet)\)/i)?.[1]
                ?.toLowerCase() || null
            : null;
        incoming.push({
          field,
          fact: { value: text, unit, sources: [value.id], status: "reported" },
        });
      }
    }
  }
  if (!incoming.length) return dataset;
  let record =
    dataset.records.find((r) => r.id === "well-spreadsheet-details") ||
    dataset.records.find((r) => r.kind === "well" && r.id !== "well-settings");
  if (!record) {
    record = {
      id: "well-spreadsheet-details",
      kind: "well",
      label: "Spreadsheet well information",
      report: null,
      product: null,
      branch: null,
      facts: {},
    };
    dataset.records.push(record);
  }
  dataset.issues = dataset.issues.filter(
    (i) => i.code !== "well-metadata-conflict",
  );
  for (const { field, fact } of incoming) {
    const old = record.facts[field];
    if (old?.status === "edited") continue;
    if (!old || old.value === null || old.value === "") {
      record.facts[field] = fact;
      continue;
    }
    if (comparable(field, old.value) === comparable(field, fact.value)) {
      // Keep spreadsheet formatting, including leading zeros and explicit date offsets.
      record.facts[field] = {
        ...fact,
        sources: [...new Set([...old.sources, ...fact.sources])],
      };
      continue;
    }
    // A numeric administrative identifier may have lost leading zeros in the old mapping.
    if (
      ["license", "afe", "rigName"].includes(field) &&
      /^\d+$/.test(String(old.value)) &&
      /^\d+$/.test(fact.value) &&
      Number(old.value) === Number(fact.value)
    ) {
      record.facts[field] = fact;
      continue;
    }
    const i = issue(
      "well-metadata-conflict",
      `Spreadsheet ${field}: conflicting reported values require review.`,
      [...old.sources, ...fact.sources],
      record.id,
      { field, candidate: fact, priority: "high" },
    );
    dataset.issues.push(i);
  }
  dataset.issues = [...new Map(dataset.issues.map((i) => [i.id, i])).values()];
  for (const i of dataset.issues.filter(
    (i) => i.code === "well-metadata-conflict",
  )) {
    i.fingerprint = idFor(
      i.id,
      JSON.stringify(record.facts),
      JSON.stringify(i.candidate || null),
      dataset.currency,
    );
    Object.assign(i, dataset.reviews?.[i.fingerprint] || {});
  }
  return dataset;
}
export function wellDetails(dataset) {
  const fields = Object.values(detailLabels),
    facts = {},
    conflicts = [];
  for (const field of fields) {
    const candidates = dataset.records
      .filter((r) => r.kind === "well")
      .map((r) => r.facts[field])
      .filter(Boolean);
    const edits = candidates.filter((f) => f.status === "edited"),
      use = edits.length ? edits : candidates;
    if (use.length) facts[field] = use[0];
    if (new Set(use.map((f) => comparable(field, f.value))).size > 1)
      conflicts.push(field);
  }
  for (const i of dataset.issues)
    if (i.code === "well-metadata-conflict" && i.status === "unresolved")
      conflicts.push(i.field);
  return { facts, conflicts: [...new Set(conflicts)] };
}
export function locationInput(details) {
  const province = normalize(details.facts.province?.value),
    value = details.facts.location?.value || "";
  const fingerprint = idFor(
    "well-location-v1",
    GRID_VERSION,
    value,
    province,
    JSON.stringify(
      details.conflicts.filter((f) => ["location", "province"].includes(f)),
    ),
  );
  if (details.conflicts.some((f) => ["location", "province"].includes(f)))
    return { fingerprint, status: "conflict" };
  if (province && !["ab", "alberta", "ca-ab"].includes(province))
    return { fingerprint, status: "unsupported" };
  if (!value) return { fingerprint, status: "missing" };
  try {
    return { fingerprint, status: "pending", parsed: parseLsd(value) };
  } catch (e) {
    return {
      fingerprint,
      status: e.code === "unsupported" ? "unsupported" : "invalid",
    };
  }
}
