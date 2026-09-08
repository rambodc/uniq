export type SurveyUnit = "metric" | "imperial";
const legColors = ["#42dff5", "#ffd166", "#ef476f", "#8cff98", "#b99cff", "#ff9f68"];
export const legColor = (index: number) => legColors[index % legColors.length];

export interface SurveyStation {
  mdM: number;
  inclinationDeg: number;
  azimuthDeg: number;
  tvdM: number;
  northM: number;
  eastM: number;
  status: string;
}

export interface SurveyLeg {
  id: string;
  parentId: string | null;
  name: string;
  stations: SurveyStation[];
  startMdM: number;
  endMdM: number;
}

export interface SurveyFile {
  name: string;
  dossierId: string | null;
  sourceUnit: SurveyUnit;
  importedFileName: string;
  legs: SurveyLeg[];
  warnings: string[];
}

export class SurveyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SurveyParseError";
  }
}

const required = ["MD", "Incl", "Azm", "TVD", "NS", "EW", "legId"] as const;
const metresPerFoot = 0.3048;
const tidyHeader = (value: string) => value.replace(/^#\s*/, "").trim();
const baseHeader = (value: string) => tidyHeader(value).replace(/\([^)]*\)/g, "").trim();

function finite(value: string | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseWellSurvey(text: string, importedFileName = "survey.txt"): SurveyFile {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const headers = line.split("\t").map(baseHeader);
    return required.every((item) => headers.includes(item));
  });
  if (headerIndex < 0) throw new SurveyParseError("This file does not contain a supported Well deviation-survey header.");

  const rawHeaders = lines[headerIndex].split("\t").map(tidyHeader);
  const headers = rawHeaders.map(baseHeader);
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index])) as Record<string, number>;
  const sourceUnit: SurveyUnit = /\((?:ft|feet)/i.test(rawHeaders[indexes.MD]) ? "imperial" : "metric";
  const lengthFactor = sourceUnit === "imperial" ? metresPerFoot : 1;
  const dossierLine = lines.slice(0, headerIndex).find((line) => /Well Dossier/i.test(line));
  const dossier = dossierLine?.match(/Well Dossier\s+(\S+)\s*-\s*(.+?)\s*$/i);
  const warnings: string[] = [];
  const grouped = new Map<string, { parentId: string | null; stations: SurveyStation[] }>();
  let skipped = 0;

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const cells = line.split("\t"), legId = cells[indexes.legId]?.trim();
    const values = {
      md: finite(cells[indexes.MD]), inclination: finite(cells[indexes.Incl]), azimuth: finite(cells[indexes.Azm]),
      tvd: finite(cells[indexes.TVD]), north: finite(cells[indexes.NS]), east: finite(cells[indexes.EW]),
    };
    if (!legId || Object.values(values).some((value) => value == null)) { skipped += 1; continue; }
    const group = grouped.get(legId) ?? { parentId: cells[indexes.parentLegId]?.trim() || null, stations: [] };
    group.stations.push({
      mdM: values.md! * lengthFactor, inclinationDeg: values.inclination!, azimuthDeg: values.azimuth!,
      tvdM: values.tvd! * lengthFactor, northM: values.north! * lengthFactor, eastM: values.east! * lengthFactor,
      status: cells[indexes.Status]?.trim() || "",
    });
    grouped.set(legId, group);
  }
  if (!grouped.size) throw new SurveyParseError("No complete survey stations were found in this file.");
  if (skipped) warnings.push(`${skipped} incomplete ${skipped === 1 ? "row was" : "rows were"} skipped.`);

  const legs = [...grouped].map(([id, group], index) => {
    const sorted = [...group.stations].sort((a, b) => a.mdM - b.mdM);
    const stations: SurveyStation[] = [];
    for (const station of sorted) {
      if (stations.at(-1)?.mdM === station.mdM) {
        stations[stations.length - 1] = station;
        warnings.push(`Leg ${id} contained a duplicate station at MD ${station.mdM.toFixed(2)} m; the last row was used.`);
      } else stations.push(station);
    }
    return { id, parentId: group.parentId, name: `Leg ${index + 1} · ${id}`, stations, startMdM: stations[0].mdM, endMdM: stations.at(-1)!.mdM };
  });
  legs.sort((a, b) => Number(a.id) - Number(b.id) || a.startMdM - b.startMdM);
  legs.forEach((leg, index) => { leg.name = `Leg ${index + 1} · ${leg.id}`; });
  return { name: dossier?.[2]?.trim() || importedFileName.replace(/\.txt$/i, ""), dossierId: dossier?.[1] || null, sourceUnit, importedFileName, legs, warnings };
}

export function clampLegMd(leg: SurveyLeg, mdM: number) {
  if (!Number.isFinite(mdM)) return leg.startMdM;
  return Math.min(leg.endMdM, Math.max(leg.startMdM, mdM));
}

export function pointAtLegMd(leg: SurveyLeg, mdM: number) {
  const stations = leg.stations, depth = clampLegMd(leg, mdM);
  if (!stations.length) return { x: 0, y: 0, z: 0 };
  if (stations.length === 1 || depth <= stations[0].mdM) return stationPoint(stations[0]);
  const last = stations.at(-1)!;
  if (depth >= last.mdM) return stationPoint(last);
  let low = 0, high = stations.length - 1;
  while (high - low > 1) { const middle = Math.floor((low + high) / 2); if (stations[middle].mdM <= depth) low = middle; else high = middle; }
  const before = stations[low], after = stations[high], span = after.mdM - before.mdM;
  const amount = span > 0 ? (depth - before.mdM) / span : 0;
  const a = stationPoint(before), b = stationPoint(after);
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount, z: a.z + (b.z - a.z) * amount };
}

export function tangentAtLegMd(leg: SurveyLeg, mdM: number) {
  const span = Math.max(leg.endMdM - leg.startMdM, 0), sample = Math.max(span / 1000, 0.25);
  const before = pointAtLegMd(leg, mdM - sample), after = pointAtLegMd(leg, mdM + sample);
  const x = after.x - before.x, y = after.y - before.y, z = after.z - before.z, length = Math.hypot(x, y, z);
  return length > 1e-9 ? { x: x / length, y: y / length, z: z / length } : { x: 0, y: -1, z: 0 };
}

export const stationPoint = (station: SurveyStation) => ({ x: station.eastM, y: -station.tvdM, z: station.northM });
export const metresToSurveyDisplay = (metres: number, imperial: boolean) => imperial ? metres / metresPerFoot : metres;
export const surveyDisplayToMetres = (value: number, imperial: boolean) => imperial ? value * metresPerFoot : value;
