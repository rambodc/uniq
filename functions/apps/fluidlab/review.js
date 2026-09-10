import { Fact, idFor } from "./model.js";
import { reconcileLosses } from "./losses.js";
import { buildSchematic } from "./schematic.js";

export const numericFields = new Set([
  "lossAmount",
  "totalCost",
  "unitPrice",
  "cost",
  "quantity",
  "serviceCost",
  "totalUsed",
  "totalReceived",
  "totalReturned",
  "totalRemaining",
  "remainingValue",
  "openingStock",
  "startM",
  "endM",
  "mdM",
  "tvdM",
  "lossesM3",
  "totalLossesM3",
  "totalDrillingLossesM3",
  "totalOperationalLossesM3",
  "diameterMm",
  "kickoffM",
  "casingDepthM",
  "setDepthM",
  "totalDepthM",
  "cumulativeDrilledM",
  "legCount",
  "density",
  "funnelViscosity",
  "plasticViscosity",
  "yieldPoint",
  "ph",
  "fluidLoss",
  "azimuth",
  "inclination",
  "lossRateM3Per100M",
]);
const textFields = new Set([
  "lossCategory",
  "lossMeasure",
  "currency",
  "package",
  "parent",
  "name",
  "date",
  "createdDate",
  "activitySummary",
  "recommendation",
]);
export function applyReview(dataset, change, uid) {
  if (change.currency !== undefined) {
    if (change.currency !== null && !/^[A-Z]{3}$/.test(change.currency))
      throw new Error("Use a three-letter currency code.");
    dataset.currency = change.currency;
  }
  if (change.correction) {
    const { recordId, field, value, unit } = change.correction;
    let r = dataset.records.find((r) => r.id === recordId);
    if (!r && recordId === "well-settings") {
      r = {
        id: "well-settings",
        kind: "well",
        label: "Well dimensions",
        report: null,
        product: null,
        branch: null,
        facts: {},
      };
      dataset.records.push(r);
    }
    if (
      !r ||
      (!numericFields.has(field) && !textFields.has(field)) ||
      typeof value !== "string" ||
      value.length > 20000
    )
      throw new Error("Unsupported correction.");
    const cleaned = value.trim();
    if (
      field === "lossCategory" &&
      !["downhole", "surface", "unspecified"].includes(cleaned)
    )
      throw new Error("Choose downhole, surface, or unspecified.");
    if (
      field === "lossMeasure" &&
      !["event", "daily", "cumulative", "rate", "unspecified"].includes(cleaned)
    )
      throw new Error("Choose event, daily, cumulative, rate, or unspecified.");
    if (
      numericFields.has(field) &&
      cleaned !== "" &&
      !Number.isFinite(Number(cleaned))
    )
      throw new Error("Enter a valid number or leave blank for unknown.");
    if (field === "currency" && cleaned && !/^[A-Z]{3}$/.test(cleaned))
      throw new Error("Use a three-letter currency code.");
    if (
      unit !== undefined &&
      unit !== null &&
      (typeof unit !== "string" || unit.length > 40)
    )
      throw new Error("Invalid unit.");
    const u =
      unit === undefined
        ? r.facts[field]?.unit ||
          (/M$/.test(field) ? "m" : field === "diameterMm" ? "mm" : null)
        : unit;
    if (/M$/.test(field) && field !== "lossRateM3Per100M" && u !== "m")
      throw new Error("Enter depths in metres (m).");
    if (/LossesM3$|^lossesM3$/.test(field) && u !== "m3")
      throw new Error("Enter this loss volume in m3.");
    if (field === "lossRateM3Per100M" && u !== "m3/100m")
      throw new Error("Enter the rate in m3/100m.");
    if (
      field === "lossAmount" &&
      cleaned &&
      (!u ||
        !/^(m3|m³|bbl|l|litres?|liters?|gal|gallons?)(\/(day|d|h|hr|min|100m|m))?$/i.test(
          u,
        ))
    )
      throw new Error(
        "Use an explicit volume unit (m3, bbl, L, gal) or rate such as m3/day.",
      );
    if (field === "diameterMm" && u !== "mm")
      throw new Error("Enter diameter in millimetres (mm).");
    if (
      [
        "startM",
        "endM",
        "mdM",
        "tvdM",
        "totalDepthM",
        "kickoffM",
        "diameterMm",
        "legCount",
      ].includes(field) &&
      cleaned &&
      Number(cleaned) < 0
    )
      throw new Error("Dimensions cannot be negative.");
    if (
      field === "legCount" &&
      cleaned &&
      (!Number.isInteger(Number(cleaned)) ||
        Number(cleaned) < 1 ||
        Number(cleaned) > 250)
    )
      throw new Error("Use 1–250 legs.");
    if (
      field === "inclination" &&
      cleaned &&
      (Number(cleaned) < 0 || Number(cleaned) > 180)
    )
      throw new Error("Inclination must be 0–180 degrees.");
    r.facts[field] = Fact.parse({
      ...r.facts[field],
      value: cleaned || null,
      unit: u,
      sources: r.facts[field]?.sources || [],
      status: "edited",
    });
    dataset.issues = dataset.issues.filter(
      (i) => !(i.recordId === recordId && i.field === field),
    );
  }
  if (change.review) {
    const { issueId, action } = change.review;
    const i = dataset.issues.find((i) => i.id === issueId);
    if (!i || !["accepted", "kept", "unresolved"].includes(action))
      throw new Error("Invalid review decision.");
    if (action === "accepted" && !i.code.startsWith("geometry:"))
      throw new Error("This item is not a schematic estimate.");
    dataset.reviews ||= {};
    dataset.reviews[i.fingerprint || idFor(i.id)] = {
      status: action,
      reviewedBy: uid,
      reviewedAt: new Date().toISOString(),
    };
  }
  if (change.correction) buildSchematic(dataset);
  return reconcileLosses(dataset);
}
